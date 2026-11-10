-- SLT-118 (design §1, §2, §6.2) — la factura de la plataforma: una por empresa y período de cobro, con la
-- cuota del plan y las cifras de las órdenes del período. Estado de cuenta interno (sin Hacienda: SL-21).
--
-- Tabla de NEGOCIO, con las piezas de `cobro_plataforma_traza` (20261109120000):
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK y la política
--     `…_por_empresa` con la forma que reconoce la guardia `rls-por-empresa`: la empresa solo LEE sus
--     facturas (R21);
--   · el REVOKE de escritura (R22). Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría
--     escritura a `servi_app` y la RLS se la permitiría sobre sus filas;
--   · el trigger de «sin cambio de empresa». No hay FK a otra tabla de negocio: ningún `sme_*`.
--
-- Quién escribe: SOLO las funciones del dueño de abajo (§2). La cuota vive en la fila de la factura cerrada
-- y la deuda la suma (P2): no hay otro libro de cuotas. El cierre no toca `cobro_plataforma_movimiento`,
-- `cobro_plataforma_traza` ni `wallet_movimiento` (R20).
--
-- La hora de la plataforma es −06:00 fija, como en las funciones de SLT-86 (`interval '6 hours'`), hasta
-- SLT-90. Las funciones que dependen del reloj lo reciben como parámetro (`p_ahora`, UTC sin zona): el
-- trabajo pasa su `now()` inyectable y los tests fijan el instante.
--
-- ATOMICIDAD: BEGIN/COMMIT, como 20261109120000, para que el runner de los tests (sentencia a sentencia)
-- tampoco deje nada a medias.
--
-- Prefijo 20261111: va después de la mayor migración de `dev` al empezar (20261111120000_bug_report_status).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- ─── 1. Tabla, CHECK, únicos, índices, FK, RLS, política y REVOKE (§1.1, §1.2) ──────────────────────

CREATE TABLE "factura_plataforma" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "estado" TEXT NOT NULL,
    "numero" INTEGER,
    "desde_at" TIMESTAMP(3) NOT NULL,
    "hasta_at" TIMESTAMP(3),
    "plan_id" TEXT,
    "plan_nombre" VARCHAR(80),
    "tipo_cobro" TEXT,
    "cargos" DECIMAL(14,2),
    "reversos" DECIMAL(14,2),
    "total_ordenes" DECIMAL(14,2),
    "movimientos" INTEGER,
    "precio_mensual" DECIMAL(12,2),
    "cuota" DECIMAL(12,2),
    "dias_cobrados" INTEGER,
    "dias_periodo" INTEGER,
    "total" DECIMAL(14,2),
    "cerrada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factura_plataforma_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "factura_plataforma_estado_check" CHECK ("estado" IN ('en_curso', 'por_cerrar', 'cerrada')),
    CONSTRAINT "factura_plataforma_tipo_cobro_check"
      CHECK ("tipo_cobro" IN ('quincenal', 'mensual', 'bimestral', 'anual')),
    -- R1, R2: solo la en curso no tiene fin; el fin va después del inicio.
    CONSTRAINT "factura_plataforma_estado_fin"
      CHECK (("estado" = 'en_curso') = ("hasta_at" IS NULL) AND ("hasta_at" IS NULL OR "hasta_at" > "desde_at")),
    -- R5, R14 (P1): número y cifras solo al cerrar, y todas. Una en curso o por cerrar no lleva cuota, así
    -- que no puede sumar a la deuda (R18).
    CONSTRAINT "factura_plataforma_cerrada" CHECK (
      ("estado" = 'cerrada') = ("numero" IS NOT NULL)
      AND ("estado" <> 'cerrada'
           OR num_nulls("cargos", "reversos", "total_ordenes", "movimientos", "total", "cerrada_at") = 0)
      AND ("estado" = 'cerrada'
           OR num_nonnulls("cargos", "reversos", "total_ordenes", "movimientos", "precio_mensual", "cuota",
                           "dias_cobrados", "dias_periodo", "total", "cerrada_at") = 0)),
    -- El plan de la factura va entero o no va («sin plan»), en cualquier estado.
    CONSTRAINT "factura_plataforma_plan" CHECK (num_nulls("plan_id", "plan_nombre", "tipo_cobro") IN (0, 3)),
    -- R8, R9, R29: la cuota con su precio y sus dos días; sin plan, sin cuota.
    CONSTRAINT "factura_plataforma_cuota" CHECK (
      num_nulls("precio_mensual", "cuota", "dias_cobrados", "dias_periodo") IN (0, 4)
      AND "cuota" >= 0
      AND "dias_cobrados" > 0 AND "dias_cobrados" <= "dias_periodo"
      AND ("plan_id" IS NOT NULL OR "cuota" IS NULL))
);

-- R11: un intervalo no se factura dos veces. R14: sin números repetidos (los nulos no chocan). R1: una sola
-- en curso por empresa.
CREATE UNIQUE INDEX "factura_plataforma_organizacion_id_desde_at_key"
    ON "factura_plataforma"("organizacion_id", "desde_at");
CREATE UNIQUE INDEX "factura_plataforma_organizacion_id_numero_key"
    ON "factura_plataforma"("organizacion_id", "numero");
CREATE UNIQUE INDEX "factura_plataforma_una_en_curso"
    ON "factura_plataforma"("organizacion_id") WHERE "estado" = 'en_curso';
-- La suma de cuotas de la deuda (R18) y las por cerrar del cierre.
CREATE INDEX "factura_plataforma_organizacion_id_estado_idx" ON "factura_plataforma"("organizacion_id", "estado");

-- CASCADE (design §1.1): la app nunca borra una empresa; el dueño sí, en las limpiezas de los tests y en el
-- borrado de las empresas demo, y desde aquí toda empresa que pasa por un cambio de plan tiene factura.
ALTER TABLE "factura_plataforma" ADD CONSTRAINT "factura_plataforma_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "factura_plataforma" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "factura_plataforma_por_empresa" ON "factura_plataforma" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

REVOKE INSERT, UPDATE, DELETE ON "factura_plataforma" FROM servi_app;

CREATE TRIGGER "factura_plataforma_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "factura_plataforma" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- ─── 2. Una factura cerrada no cambia (R13; decisión «Reversos») ─────────────────────────────────────
-- Para cualquier rol, el dueño incluido: la cuota de una cerrada ya está en la deuda. Una por cerrar ya no
-- mueve su plan ni sus fechas (R16): solo la en curso toma un cambio. Un cambio de empresa se deja pasar a
-- `…_sin_cambio_de_empresa`, que corre justo después (los BEFORE van por orden de nombre) y lo rechaza con
-- SL017. Borrar sigue cerrado para la app por el REVOKE; el dueño solo borra en cascada.
CREATE FUNCTION factura_plataforma_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organizacion_id" IS DISTINCT FROM OLD."organizacion_id" THEN
    RETURN NEW;
  END IF;
  IF OLD."estado" = 'cerrada' THEN
    RAISE EXCEPTION 'una factura cerrada no se cambia (factura_plataforma %)', OLD."id"
      USING ERRCODE = 'SL118';
  END IF;
  IF OLD."estado" = 'por_cerrar'
     AND (NEW."plan_id", NEW."plan_nombre", NEW."tipo_cobro", NEW."desde_at", NEW."hasta_at")
         IS DISTINCT FROM (OLD."plan_id", OLD."plan_nombre", OLD."tipo_cobro", OLD."desde_at", OLD."hasta_at") THEN
    RAISE EXCEPTION 'el plan y las fechas de una factura por cerrar no se cambian (factura_plataforma %)', OLD."id"
      USING ERRCODE = 'SL118';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "factura_plataforma_inmutable" BEFORE UPDATE ON "factura_plataforma"
  FOR EACH ROW EXECUTE FUNCTION factura_plataforma_inmutable();

-- ─── 3. La cuota: gemelas SQL de `lib/planes/cobro.ts` (§2.1, §2.1 bis; R8–R10, R29) ──────────────────
-- La autoridad del importe que entra a la deuda es la base; `cobro.ts` solo muestra. Un test pasa la misma
-- tabla por las dos (R10).

-- R8, R9: el costo de UN período completo (`montoDelPeriodo`). `NULL` sin precio. Con porcentaje, un solo
-- redondeo; con monto, el bruto redondeado menos el monto, nunca bajo 0. `round(numeric, 2)` es la mitad
-- hacia arriba con importes no negativos.
CREATE FUNCTION plan_costo_del_periodo(p_precio_mensual numeric, p_descuentos jsonb, p_tipo text) RETURNS numeric(12,2)
  LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_num integer;
  v_den integer;
  v_desc jsonb := COALESCE(p_descuentos, '{}'::jsonb) -> p_tipo;
  v_bruto numeric;
BEGIN
  CASE p_tipo
    WHEN 'quincenal' THEN v_num := 1; v_den := 2;
    WHEN 'mensual' THEN v_num := 1; v_den := 1;
    WHEN 'bimestral' THEN v_num := 2; v_den := 1;
    WHEN 'anual' THEN v_num := 12; v_den := 1;
    ELSE RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'plan_costo_del_periodo: tipo de cobro desconocido: ' || COALESCE(p_tipo, 'NULL');
  END CASE;
  IF p_precio_mensual IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_desc ->> 'tipo' = 'porcentaje' THEN
    RETURN round(p_precio_mensual * v_num * (100 - (v_desc ->> 'porcentaje')::numeric) / (v_den * 100), 2);
  END IF;
  v_bruto := round(p_precio_mensual * v_num / v_den, 2);
  IF v_desc ->> 'tipo' = 'monto' THEN
    RETURN GREATEST(v_bruto - (v_desc ->> 'monto')::numeric, 0);
  END IF;
  RETURN v_bruto;
END $$;
REVOKE EXECUTE ON FUNCTION plan_costo_del_periodo(numeric, jsonb, text) FROM PUBLIC;

-- R29: el costo de un tramo (`costoDelTramo`): el del período ya redondeado × días ÷ días. Dos redondeos,
-- como SLT-86 R12.
CREATE FUNCTION plan_costo_del_tramo(p_costo numeric, p_dias_tramo integer, p_dias_periodo integer) RETURNS numeric(12,2)
  LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT round(p_costo * p_dias_tramo / p_dias_periodo, 2)
$$;
REVOKE EXECUTE ON FUNCTION plan_costo_del_tramo(numeric, integer, integer) FROM PUBLIC;

-- R29: días de calendario de la plataforma del día de `p_desde` al de `p_hasta`, sin este (`diasDeCalendario`).
CREATE FUNCTION plan_dias_de_calendario(p_desde timestamp, p_hasta timestamp) RETURNS integer
  LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ((p_hasta - interval '6 hours')::date - (p_desde - interval '6 hours')::date)
$$;
REVOKE EXECUTE ON FUNCTION plan_dias_de_calendario(timestamp, timestamp) FROM PUBLIC;

-- ─── 4. Abrir y avanzar la factura en curso (§2.2; R1, R2, R26) ───────────────────────────────────────
-- Abrir = insertar la en curso con el plan de la factura copiado de la empresa EN ESTE MOMENTO (plan, nombre
-- y tipo, o los tres nulos sin plan). Así el plan de la factura es el que regía en su `desde`; solo R16 y R28
-- lo cambian después (§2.3).
CREATE FUNCTION factura_plataforma_abrir(p_org text, p_desde timestamp) RETURNS "factura_plataforma"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
BEGIN
  INSERT INTO "factura_plataforma" ("organizacion_id", "estado", "desde_at", "plan_id", "plan_nombre", "tipo_cobro")
  SELECT o."id", 'en_curso', p_desde, o."plan_id", p."nombre",
         CASE WHEN o."plan_id" IS NOT NULL THEN o."plan_tipo_cobro" END
    FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
   WHERE o."id" = p_org
  RETURNING * INTO v_f;
  IF v_f."id" IS NULL THEN
    RAISE EXCEPTION 'factura_plataforma_abrir: no existe la empresa %', p_org USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_f;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_abrir(text, timestamp) FROM PUBLIC;

-- Deja la factura en curso alineada con el calendario hasta `p_hasta`:
--   1. sin factura en curso, la abre desde las 00:00 de la plataforma del día del alta (R26, empresa nueva);
--   2. mientras su fin natural (R2) sea ≤ `p_hasta`, la FIJA en él (`por_cerrar`) y abre la siguiente ahí.
-- El fin natural sale del tipo DE LA FACTURA, no del de la empresa: un cambio de tipo aplicado a mitad de
-- período no mueve el fin (R15). Sin plan, el del mes (R2). Quien llama ya tiene la empresa en FOR UPDATE.
CREATE FUNCTION factura_plataforma_avanzar(p_org text, p_hasta timestamp) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
  v_alta timestamp;
  v_fin timestamp;
BEGIN
  SELECT * INTO v_f FROM "factura_plataforma" WHERE "organizacion_id" = p_org AND "estado" = 'en_curso';
  IF NOT FOUND THEN
    SELECT o."created_at" INTO v_alta FROM "organizacion" o WHERE o."id" = p_org;
    v_f := factura_plataforma_abrir(p_org, date_trunc('day', v_alta - interval '6 hours') + interval '6 hours');
  END IF;
  LOOP
    v_fin := plan_fin_periodo_calendario(COALESCE(v_f."tipo_cobro", 'mensual'), v_f."desde_at");
    EXIT WHEN v_fin > p_hasta;
    UPDATE "factura_plataforma" SET "estado" = 'por_cerrar', "hasta_at" = v_fin WHERE "id" = v_f."id";
    v_f := factura_plataforma_abrir(p_org, v_fin);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_avanzar(text, timestamp) FROM PUBLIC;

-- ─── 5. La toma de un cambio de plan (§2.3; R15–R17, R28, R33) ───────────────────────────────────────
-- La llama `PlanesRepository.aplicarEnTx` ANTES de su UPDATE de `organizacion`, en su transacción y con la
-- empresa ya en FOR UPDATE, con el efecto y el plan y el tipo nuevos. Sin corte ni prorrateo (P3):
--   1. avanza hasta el efecto con el plan de antes: la factura cuyo fin natural llega al efecto se fija y la
--      siguiente se abre con el plan de antes. Así el efecto cae dentro de la en curso F (D ≤ efecto < fin);
--   2. efecto ≤ D (R16: inicio pasado, cambio que la cola aplica tarde o el caso normal, efecto = inicio del
--      próximo período): F pasa entera al plan y tipo nuevos; su fin natural se recalcula solo, porque sale
--      de su tipo;
--   3. efecto > D y F con plan (R15: un pendiente con efecto a mitad de período): nada. F se cobra entera con
--      el plan de antes y la siguiente se abre en su fin con el plan que la empresa tenga entonces;
--   4. efecto > D y F sin plan (R28, primera asignación, inicio pasado o futuro; P8): F se fija en el efecto,
--      sin plan, y la siguiente se abre en el efecto con el plan nuevo; su cuota la prorratea R29 (§6).
-- Solo toca la en curso: una por cerrar o cerrada no cambia (el trigger de §2 lo asegura). No cierra.
CREATE FUNCTION factura_plataforma_tomar_cambio(p_org text, p_efecto timestamp, p_plan_id text, p_tipo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
  v_nombre varchar(80);
BEGIN
  SELECT p."nombre" INTO v_nombre FROM "plan" p WHERE p."id" = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_plataforma_tomar_cambio: no existe el plan %', p_plan_id USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM factura_plataforma_avanzar(p_org, p_efecto);
  SELECT * INTO v_f FROM "factura_plataforma" WHERE "organizacion_id" = p_org AND "estado" = 'en_curso';
  IF p_efecto <= v_f."desde_at" THEN
    UPDATE "factura_plataforma" SET "plan_id" = p_plan_id, "plan_nombre" = v_nombre, "tipo_cobro" = p_tipo
     WHERE "id" = v_f."id";
  ELSIF v_f."plan_id" IS NULL THEN
    UPDATE "factura_plataforma" SET "estado" = 'por_cerrar', "hasta_at" = p_efecto WHERE "id" = v_f."id";
    INSERT INTO "factura_plataforma" ("organizacion_id", "estado", "desde_at", "plan_id", "plan_nombre", "tipo_cobro")
    VALUES (p_org, 'en_curso', p_efecto, p_plan_id, v_nombre, p_tipo);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_tomar_cambio(text, timestamp, text, text) FROM PUBLIC;

-- ─── 6. Las cifras de una factura (§2.4; R5–R9, R29) ─────────────────────────────────────────────────
-- La única definición, para el cierre y para la lectura en curso:
--   · cargos, reversos (en positivo) y movimientos con instante en [p_desde, p_hasta_ordenes) (R5, R6);
--   · la cuota: precio y descuentos del historial con el mayor `desde_at ≤ p_desde` (SLT-86 R15), el costo
--     del período completo (R8) o, si es la PRIMERA factura con plan de la empresa y cubre menos días que su
--     período de calendario, el del tramo (R29, P6). Sin plan o sin precio, sin cuota (R9);
--   · `p_hasta` es el fin de la factura (fijado o previsto); `p_hasta_ordenes`, el corte de las órdenes (en
--     la lectura en curso, «ahora»).
CREATE FUNCTION factura_plataforma_cifras(
  p_org text, p_desde timestamp, p_hasta timestamp, p_hasta_ordenes timestamp, p_plan_id text, p_tipo text
) RETURNS TABLE (
  cargos numeric, reversos numeric, movimientos integer, total_ordenes numeric,
  precio_mensual numeric, cuota numeric, dias_cobrados integer, dias_periodo integer, total numeric
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_descuentos jsonb;
  v_costo numeric;
BEGIN
  SELECT COALESCE(sum(m."monto") FILTER (WHERE m."tipo" = 'cargo'), 0)::numeric(14,2),
         COALESCE(sum(m."monto") FILTER (WHERE m."tipo" = 'reverso'), 0)::numeric(14,2),
         count(*)::integer
    INTO cargos, reversos, movimientos
    FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = p_org AND m."ocurrido_at" >= p_desde AND m."ocurrido_at" < p_hasta_ordenes;
  total_ordenes := cargos - reversos;

  IF p_plan_id IS NOT NULL THEN
    SELECT h."precio_mensual", h."descuentos" INTO precio_mensual, v_descuentos
      FROM "plan_precio_historial" h
     WHERE h."plan_id" = p_plan_id AND h."desde_at" <= p_desde
     ORDER BY h."desde_at" DESC LIMIT 1;
    v_costo := plan_costo_del_periodo(precio_mensual, v_descuentos, p_tipo);
  END IF;

  IF v_costo IS NULL THEN
    precio_mensual := NULL;
  ELSE
    dias_periodo := plan_dias_de_calendario(plan_inicio_periodo_calendario(p_tipo, p_desde),
                                            plan_fin_periodo_calendario(p_tipo, p_desde));
    dias_cobrados := plan_dias_de_calendario(p_desde, p_hasta);
    IF dias_cobrados < dias_periodo AND NOT EXISTS (
      SELECT 1 FROM "factura_plataforma" f
       WHERE f."organizacion_id" = p_org AND f."desde_at" < p_desde AND f."plan_id" IS NOT NULL
    ) THEN
      cuota := plan_costo_del_tramo(v_costo, dias_cobrados, dias_periodo);
    ELSE
      cuota := v_costo;
      dias_cobrados := dias_periodo;
    END IF;
  END IF;

  total := total_ordenes + COALESCE(cuota, 0);
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_cifras(text, timestamp, timestamp, timestamp, text, text) FROM PUBLIC;

-- ─── 7. El cierre (§2.5; R3, R4, R11, R14) ───────────────────────────────────────────────────────────
-- 1. La empresa en FOR UPDATE: el mismo cerrojo y en el mismo orden que `aplicarEnTx`, así un cierre y un
--    cambio de plan de la misma empresa se serializan sin interbloqueo (la empresa primero).
-- 2. Avanza hasta `p_ahora`.
-- 3. Cierra cada por cerrar con fin ≤ `p_ahora` − 5 minutos (el margen de §4.3: una transacción de órdenes
--    en vuelo en el borde ya confirmó), en orden de `desde`: cifras, número correlativo y `cerrada_at`.
-- Idempotente (R11): el cerrojo serializa dos cierres; el segundo no encuentra por cerrar vencidas. Un
-- reintento tras un fallo empieza del estado guardado. Devuelve cuántas cerró.
CREATE FUNCTION factura_plataforma_cerrar(p_org text, p_ahora timestamp) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
  v_c record;
  v_numero integer;
  v_cerradas integer := 0;
BEGIN
  PERFORM 1 FROM "organizacion" WHERE "id" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  PERFORM factura_plataforma_avanzar(p_org, p_ahora);
  FOR v_f IN
    SELECT * FROM "factura_plataforma"
     WHERE "organizacion_id" = p_org AND "estado" = 'por_cerrar' AND "hasta_at" <= p_ahora - interval '5 minutes'
     ORDER BY "desde_at"
  LOOP
    SELECT * INTO v_c
      FROM factura_plataforma_cifras(p_org, v_f."desde_at", v_f."hasta_at", v_f."hasta_at", v_f."plan_id", v_f."tipo_cobro");
    SELECT COALESCE(max("numero"), 0) + 1 INTO v_numero FROM "factura_plataforma" WHERE "organizacion_id" = p_org;
    UPDATE "factura_plataforma"
       SET "estado" = 'cerrada', "numero" = v_numero,
           "cargos" = v_c.cargos, "reversos" = v_c.reversos, "total_ordenes" = v_c.total_ordenes,
           "movimientos" = v_c.movimientos, "precio_mensual" = v_c.precio_mensual, "cuota" = v_c.cuota,
           "dias_cobrados" = v_c.dias_cobrados, "dias_periodo" = v_c.dias_periodo, "total" = v_c.total,
           "cerrada_at" = p_ahora
     WHERE "id" = v_f."id";
    v_cerradas := v_cerradas + 1;
  END LOOP;
  RETURN v_cerradas;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_cerrar(text, timestamp) FROM PUBLIC;

-- ─── 8. La lectura en curso de la empresa (§2.6; R24) ────────────────────────────────────────────────
-- La única de estas funciones que `servi_app` puede llamar. Con el control de contexto de
-- `plan_de_la_empresa`: con otra empresa o sin empresa, 42501. No escribe (no avanza): devuelve las facturas
-- en curso y por cerrar con su fin (el fijado o el natural previsto), su plan y las cifras con las órdenes
-- hasta ahora y la cuota de su período como prevista. Sin número (R24).
CREATE FUNCTION factura_plataforma_en_curso(p_org text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_org IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'factura_plataforma_en_curso: solo se leen las facturas de la empresa del contexto';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', f."id",
             'estado', f."estado",
             'desde', f."desde_at",
             'hasta', h."hasta",
             'hasta_previsto', f."hasta_at" IS NULL,
             'plan_id', f."plan_id",
             'plan_nombre', f."plan_nombre",
             'tipo_cobro', f."tipo_cobro",
             'cargos', c.cargos::text,
             'reversos', c.reversos::text,
             'movimientos', c.movimientos,
             'total_ordenes', c.total_ordenes::text,
             'precio_mensual', c.precio_mensual::text,
             'cuota_prevista', c.cuota::text,
             'dias_cobrados', c.dias_cobrados,
             'dias_periodo', c.dias_periodo,
             'total', c.total::text) ORDER BY f."desde_at")
      FROM "factura_plataforma" f
     CROSS JOIN LATERAL (SELECT COALESCE(f."hasta_at",
                                         plan_fin_periodo_calendario(COALESCE(f."tipo_cobro", 'mensual'), f."desde_at")) AS "hasta") h
     CROSS JOIN LATERAL factura_plataforma_cifras(f."organizacion_id", f."desde_at", h."hasta", LEAST(v_ahora, h."hasta"),
                                                  f."plan_id", f."tipo_cobro") c
     WHERE f."organizacion_id" = p_org AND f."estado" IN ('en_curso', 'por_cerrar')), '[]'::jsonb);
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_en_curso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION factura_plataforma_en_curso(text) TO servi_app;

-- ─── 9. El tope del pago con la cuota (§2.7; R18, R19) ───────────────────────────────────────────────
-- Origen: 20261024140000 (SL-45). Cuerpo LITERAL salvo `v_cargos`, que suma la cuota de las facturas
-- cerradas de la empresa: Σ cargo − Σ reverso + Σ cuota de cerradas (P2). El candado, la clave de
-- idempotencia y el rechazo no cambian. El `down.sql` repone el cuerpo de origen.
CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cargos numeric(14, 2);
  v_pagos  numeric(14, 2);
  v_deuda  numeric(14, 2);
BEGIN
  IF NEW."organizacion_id" IS NULL THEN
    RAISE EXCEPTION 'pago a la plataforma sin empresa' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));

  -- R11: el reenvío con la misma clave no es un pago nuevo. La app lo escribe con
  -- `INSERT … ON CONFLICT DO NOTHING`, y el trigger corre ANTES del choque con el único
  -- `(organizacion_id, clave_idempotencia)`: se deja pasar para que el ON CONFLICT lo descarte (o, en
  -- un INSERT sin ON CONFLICT, el único lo rechace con 23505). Ninguna de las dos escribe una fila.
  IF NEW."clave_idempotencia" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "wallet_movimiento" r
     WHERE r."organizacion_id" = NEW."organizacion_id" AND r."clave_idempotencia" = NEW."clave_idempotencia"
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN c."tipo" = 'cargo' THEN c."monto" ELSE -c."monto" END), 0)
    INTO v_cargos
    FROM "cobro_plataforma_movimiento" c
   WHERE c."organizacion_id" = NEW."organizacion_id";

  -- SLT-118 (R18, P2): la cuota de las facturas cerradas suma a la deuda; la en curso y la por cerrar, no.
  v_cargos := v_cargos + (SELECT COALESCE(SUM(f."cuota"), 0)
                            FROM "factura_plataforma" f
                           WHERE f."organizacion_id" = NEW."organizacion_id" AND f."estado" = 'cerrada');

  SELECT COALESCE(SUM(p."monto"), 0)
    INTO v_pagos
    FROM "wallet_movimiento" p
   WHERE p."organizacion_id" = NEW."organizacion_id"
     AND p."tipo" = 'egreso'
     AND p."categoria" = 'egreso_pago_plataforma'
     AND NOT EXISTS (
       SELECT 1 FROM "wallet_movimiento" a
        WHERE a."organizacion_id" = NEW."organizacion_id"
          AND a."tipo" = 'ingreso'
          AND a."categoria" = 'ingreso_ajuste'
          AND a."origen_tipo" = 'gasto'
          AND a."origen_id" = p."id"
     );

  v_deuda := v_cargos - v_pagos;
  IF v_deuda <= 0 OR NEW."monto" > v_deuda THEN
    RAISE EXCEPTION 'el pago a la plataforma (%) supera la deuda vigente de la empresa (%)', NEW."monto", v_deuda
      USING ERRCODE = 'check_violation', CONSTRAINT = 'wallet_movimiento_tope_pago_plataforma';
  END IF;
  RETURN NEW;
END $$;

-- ─── 10. Siembra (R26): una factura en curso por empresa ─────────────────────────────────────────────
-- Desde el inicio del período de calendario en curso (el de su tipo si tiene plan; el del mes si no), con el
-- plan de la factura copiado de la empresa. Una empresa dada de alta después la abre `avanzar` desde las
-- 00:00 del día de su alta, la primera vez que hace falta.
INSERT INTO "factura_plataforma" ("organizacion_id", "estado", "desde_at", "plan_id", "plan_nombre", "tipo_cobro")
SELECT o."id", 'en_curso',
       plan_inicio_periodo_calendario(CASE WHEN o."plan_id" IS NOT NULL THEN o."plan_tipo_cobro" ELSE 'mensual' END,
                                      now() AT TIME ZONE 'UTC'),
       o."plan_id", p."nombre", CASE WHEN o."plan_id" IS NOT NULL THEN o."plan_tipo_cobro" END
  FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id";

COMMIT;
