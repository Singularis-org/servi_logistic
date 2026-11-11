-- SLT-118 (design §1, §2, §6.2) — la factura de la plataforma: una por empresa y CORTE de su periodicidad de
-- órdenes, con las cifras de sus órdenes, emitida en su fin con la cuota del período de cobro que empieza ahí
-- (por adelantado) y, aparte, la primera cuota de un plan. Estado de cuenta interno (sin Hacienda: SL-21).
--
-- Tabla de NEGOCIO, con las piezas de `cobro_plataforma_traza` (20261109120000):
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK y la política
--     `…_por_empresa` con la forma que reconoce la guardia `rls-por-empresa`: la empresa solo LEE sus
--     facturas (R21);
--   · el REVOKE de escritura (R22). Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría
--     escritura a `servi_app` y la RLS se la permitiría sobre sus filas;
--   · el trigger de «sin cambio de empresa». No hay FK a otra tabla de negocio: ningún `sme_*`.
--
-- Quién escribe: SOLO las funciones del dueño de abajo (§2). Las cuotas viven en la fila de la factura
-- cerrada y la deuda las suma (P2): no hay otro libro de cuotas. El cierre no toca
-- `cobro_plataforma_movimiento`, `cobro_plataforma_traza` ni `wallet_movimiento` (R20).
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

-- ─── 0. La periodicidad de órdenes del plan (§1.2; R35, P14) ─────────────────────────────────────────
-- De PLATAFORMA: `plan` ya tiene RLS sin políticas y el REVOKE ALL a `servi_app` (SL-24). El DEFAULT deja
-- en quincenal todos los planes que ya existen y sirve a los INSERT de los tests y de la demo.
ALTER TABLE "plan" ADD COLUMN "periodicidad_ordenes" TEXT NOT NULL DEFAULT 'quincenal';
ALTER TABLE "plan" ADD CONSTRAINT "plan_periodicidad_ordenes_check"
  CHECK ("periodicidad_ordenes" IN ('quincenal', 'mensual'));

-- ─── 1. Tabla, CHECK, únicos, índices, FK, RLS, política y REVOKE (§1.1) ─────────────────────────────
-- Una fila = el intervalo de órdenes `[desde, hasta)`, que se EMITE en `hasta`. Tres grupos aparte:
--   · el plan de las órdenes (`plan_id`, `plan_nombre`, `tipo_cobro`) y su `periodicidad`;
--   · la cuota de la emisión (R8): la del período completo que empieza en `hasta`, con el plan de la factura
--     siguiente (`cuota_*`, `precio_mensual`, `cuota`, `dias_*`);
--   · la primera cuota de un plan (R16, R28, R29): la marca `primera_cuota_desde_at` (la pone la toma del
--     cambio) y, al cerrar, el resto del grupo `primera_cuota_*`. Una factura puede llevar las dos (P18).
CREATE TABLE "factura_plataforma" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "estado" TEXT NOT NULL,
    "numero" INTEGER,
    "desde_at" TIMESTAMP(3) NOT NULL,
    "hasta_at" TIMESTAMP(3),
    "periodicidad" TEXT NOT NULL,
    "plan_id" TEXT,
    "plan_nombre" VARCHAR(80),
    "tipo_cobro" TEXT,
    "primera_cuota_desde_at" TIMESTAMP(3),
    "primera_cuota_hasta_at" TIMESTAMP(3),
    "primera_cuota_plan_id" TEXT,
    "primera_cuota_plan_nombre" VARCHAR(80),
    "primera_cuota_tipo_cobro" TEXT,
    "primera_cuota_precio_mensual" DECIMAL(12,2),
    "primera_cuota" DECIMAL(12,2),
    "primera_cuota_dias_cobrados" INTEGER,
    "primera_cuota_dias_periodo" INTEGER,
    "cargos" DECIMAL(14,2),
    "reversos" DECIMAL(14,2),
    "total_ordenes" DECIMAL(14,2),
    "movimientos" INTEGER,
    "cuota_plan_id" TEXT,
    "cuota_plan_nombre" VARCHAR(80),
    "cuota_tipo_cobro" TEXT,
    "cuota_desde_at" TIMESTAMP(3),
    "cuota_hasta_at" TIMESTAMP(3),
    "precio_mensual" DECIMAL(12,2),
    "cuota" DECIMAL(12,2),
    "dias_cobrados" INTEGER,
    "dias_periodo" INTEGER,
    "total" DECIMAL(14,2),
    "cerrada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factura_plataforma_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "factura_plataforma_estado_check" CHECK ("estado" IN ('en_curso', 'por_cerrar', 'cerrada')),
    CONSTRAINT "factura_plataforma_periodicidad_check" CHECK ("periodicidad" IN ('quincenal', 'mensual')),
    CONSTRAINT "factura_plataforma_tipo_cobro_check"
      CHECK ("tipo_cobro" IN ('quincenal', 'mensual', 'bimestral', 'anual')),
    -- R1, R2: solo la en curso no tiene fin; el fin va después del inicio.
    CONSTRAINT "factura_plataforma_estado_fin"
      CHECK (("estado" = 'en_curso') = ("hasta_at" IS NULL) AND ("hasta_at" IS NULL OR "hasta_at" > "desde_at")),
    -- R5, R14 (P1): número, cifras y las dos cuotas solo al cerrar. Una en curso o por cerrar no lleva
    -- ninguna cuota, así que no puede sumar a la deuda (R18). La marca de la primera cuota no entra: la pone
    -- la toma del cambio antes de cerrar.
    CONSTRAINT "factura_plataforma_cerrada" CHECK (
      ("estado" = 'cerrada') = ("numero" IS NOT NULL)
      AND ("estado" <> 'cerrada'
           OR num_nulls("cargos", "reversos", "total_ordenes", "movimientos", "total", "cerrada_at") = 0)
      AND ("estado" = 'cerrada'
           OR num_nonnulls("cargos", "reversos", "total_ordenes", "movimientos", "total", "cerrada_at",
                           "cuota_plan_id", "cuota_plan_nombre", "cuota_tipo_cobro", "cuota_desde_at",
                           "cuota_hasta_at", "precio_mensual", "cuota", "dias_cobrados", "dias_periodo",
                           "primera_cuota_hasta_at", "primera_cuota_plan_id", "primera_cuota_plan_nombre",
                           "primera_cuota_tipo_cobro", "primera_cuota_precio_mensual", "primera_cuota",
                           "primera_cuota_dias_cobrados", "primera_cuota_dias_periodo") = 0)),
    -- El plan de las órdenes va entero o no va («sin plan»), en cualquier estado.
    CONSTRAINT "factura_plataforma_plan" CHECK (num_nulls("plan_id", "plan_nombre", "tipo_cobro") IN (0, 3)),
    -- R8, R9: la cuota de la emisión con su plan, su período, su precio y sus dos días, entera o no va. Sin
    -- «sin plan, sin cuota»: una factura sin plan puede llevar la cuota del plan de la siguiente (R28).
    CONSTRAINT "factura_plataforma_cuota" CHECK (
      num_nulls("cuota_plan_id", "cuota_plan_nombre", "cuota_tipo_cobro", "cuota_desde_at", "cuota_hasta_at",
                "precio_mensual", "cuota", "dias_cobrados", "dias_periodo") IN (0, 9)
      AND "cuota" >= 0
      AND "dias_cobrados" > 0 AND "dias_cobrados" <= "dias_periodo"
      AND "cuota_hasta_at" > "cuota_desde_at"
      AND "cuota_tipo_cobro" IN ('quincenal', 'mensual', 'bimestral', 'anual')),
    -- R16, R28, R29 (P18): la primera cuota, entera o no va, y solo con su marca, que es el inicio de su tramo.
    -- La marca es el `desde` de la factura (a período vencido) o su `hasta` (por adelantado).
    CONSTRAINT "factura_plataforma_primera_cuota" CHECK (
      num_nulls("primera_cuota_hasta_at", "primera_cuota_plan_id", "primera_cuota_plan_nombre",
                "primera_cuota_tipo_cobro", "primera_cuota_precio_mensual", "primera_cuota",
                "primera_cuota_dias_cobrados", "primera_cuota_dias_periodo") IN (0, 8)
      AND ("primera_cuota" IS NULL OR "primera_cuota_desde_at" IS NOT NULL)
      AND "primera_cuota" >= 0
      AND "primera_cuota_dias_cobrados" > 0 AND "primera_cuota_dias_cobrados" <= "primera_cuota_dias_periodo"
      AND "primera_cuota_hasta_at" > "primera_cuota_desde_at"
      AND "primera_cuota_tipo_cobro" IN ('quincenal', 'mensual', 'bimestral', 'anual')
      AND ("primera_cuota_desde_at" IS NULL
           OR "primera_cuota_desde_at" = "desde_at"
           OR ("hasta_at" IS NOT NULL AND "primera_cuota_desde_at" = "hasta_at")))
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

-- ─── 2. Una factura cerrada no cambia (§1.3; R13; decisión «Reversos») ───────────────────────────────
-- Para cualquier rol, el dueño incluido: las cuotas de una cerrada ya están en la deuda. Una por cerrar ya no
-- mueve su plan, su periodicidad ni sus fechas (R16): solo la en curso toma un cambio. La marca de la
-- primera cuota solo pasa de nula a un valor, en una en curso o una por cerrar (R16: puede llegar a la factura
-- ya fijada que se emite en D). Un cambio de empresa se deja pasar a `…_sin_cambio_de_empresa`, que corre
-- justo después (los BEFORE van por orden de nombre) y lo rechaza con SL017. Borrar sigue cerrado para la app
-- por el REVOKE; el dueño solo borra en cascada.
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
     AND (NEW."plan_id", NEW."plan_nombre", NEW."tipo_cobro", NEW."periodicidad", NEW."desde_at", NEW."hasta_at")
         IS DISTINCT FROM
         (OLD."plan_id", OLD."plan_nombre", OLD."tipo_cobro", OLD."periodicidad", OLD."desde_at", OLD."hasta_at") THEN
    RAISE EXCEPTION 'el plan, la periodicidad y las fechas de una factura por cerrar no se cambian (factura_plataforma %)',
      OLD."id" USING ERRCODE = 'SL118';
  END IF;
  IF OLD."primera_cuota_desde_at" IS NOT NULL
     AND NEW."primera_cuota_desde_at" IS DISTINCT FROM OLD."primera_cuota_desde_at" THEN
    RAISE EXCEPTION 'la marca de la primera cuota no se cambia (factura_plataforma %)', OLD."id"
      USING ERRCODE = 'SL118';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "factura_plataforma_inmutable" BEFORE UPDATE ON "factura_plataforma"
  FOR EACH ROW EXECUTE FUNCTION factura_plataforma_inmutable();

-- ─── 3. La cuota: gemelas SQL de `lib/planes/cobro.ts` (§2.1; R8–R10, R29) ───────────────────────────
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

-- ─── 4. Abrir y avanzar la factura en curso (§2.2; R1, R2, R26, R36) ─────────────────────────────────
-- Abrir = insertar la en curso con el plan de la factura copiado de la empresa EN ESTE MOMENTO (plan, nombre,
-- tipo y la periodicidad de órdenes del plan; sin plan, los tres nulos y quincenal). Así el plan de la
-- factura es el que regía en su `desde`; solo R16 y R28 lo cambian después (§2.3).
CREATE FUNCTION factura_plataforma_abrir(p_org text, p_desde timestamp) RETURNS "factura_plataforma"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
BEGIN
  INSERT INTO "factura_plataforma"
    ("organizacion_id", "estado", "desde_at", "periodicidad", "plan_id", "plan_nombre", "tipo_cobro")
  SELECT o."id", 'en_curso', p_desde,
         CASE WHEN o."plan_id" IS NOT NULL THEN p."periodicidad_ordenes" ELSE 'quincenal' END,
         o."plan_id", p."nombre",
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
-- El fin natural sale de la periodicidad DE LA FACTURA, no del tipo de cobro ni del plan de la empresa: un
-- cambio de plan o de su periodicidad no mueve el fin de la en curso (R15, R36). Quien llama ya tiene la
-- empresa en FOR UPDATE.
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
    v_fin := plan_fin_periodo_calendario(v_f."periodicidad", v_f."desde_at");
    EXIT WHEN v_fin > p_hasta;
    UPDATE "factura_plataforma" SET "estado" = 'por_cerrar', "hasta_at" = v_fin WHERE "id" = v_f."id";
    v_f := factura_plataforma_abrir(p_org, v_fin);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_avanzar(text, timestamp) FROM PUBLIC;

-- ─── 5. La toma de un cambio de plan (§2.3; R15–R17, R28, R33, R38) ──────────────────────────────────
-- La llama `PlanesRepository.aplicarEnTx` ANTES de su UPDATE de `organizacion`, en su transacción y con la
-- empresa ya en FOR UPDATE, con el efecto y el plan y el tipo nuevos. Por eso sabe si es una primera
-- asignación (`organizacion.plan_id IS NULL`). Sin corte al aplicar (P18) ni prorrateo (P3), y sin reloj:
--   1. avanza hasta el efecto con el plan de antes: la factura cuyo fin natural llega al efecto se fija y la
--      siguiente se abre con el plan de antes. Así el efecto cae dentro de la en curso F, de `desde` D;
--   2. efecto ≤ D (R16: inicio pasado, cambio que la cola aplica tarde, el caso normal de R38 o el alta con
--      plan desde ese día, P19): F pasa entera al plan, el tipo y la periodicidad nuevos; su fin natural se
--      recalcula solo. En una primera asignación, la marca de la primera cuota es D: en la factura emitida en
--      D si existe y no está cerrada (por adelantado); si no, en F, que la emitirá en su fin con sus órdenes
--      (a período vencido, P18). No se fija ni se abre ninguna factura;
--   3. efecto > D y F con plan (R15: un pendiente de antes de esta ficha con efecto a mitad de factura): nada;
--   4. efecto > D y F sin plan (R28, P8, P17): F se fija en el efecto con la marca en el efecto (una sola
--      factura con sus órdenes sin plan y la primera cuota) y la siguiente se abre ahí con lo nuevo.
-- Solo toca facturas no cerradas (el trigger de §2 lo asegura). No cierra: solo fija y marca.
CREATE FUNCTION factura_plataforma_tomar_cambio(p_org text, p_efecto timestamp, p_plan_id text, p_tipo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
  v_nombre varchar(80);
  v_periodicidad text;
  v_primera boolean;
BEGIN
  SELECT p."nombre", p."periodicidad_ordenes" INTO v_nombre, v_periodicidad FROM "plan" p WHERE p."id" = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_plataforma_tomar_cambio: no existe el plan %', p_plan_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT o."plan_id" IS NULL INTO v_primera FROM "organizacion" o WHERE o."id" = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_plataforma_tomar_cambio: no existe la empresa %', p_org USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM factura_plataforma_avanzar(p_org, p_efecto);
  SELECT * INTO v_f FROM "factura_plataforma" WHERE "organizacion_id" = p_org AND "estado" = 'en_curso';
  IF p_efecto <= v_f."desde_at" THEN
    UPDATE "factura_plataforma"
       SET "plan_id" = p_plan_id, "plan_nombre" = v_nombre, "tipo_cobro" = p_tipo, "periodicidad" = v_periodicidad
     WHERE "id" = v_f."id";
    IF v_primera THEN
      UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = v_f."desde_at"
       WHERE "organizacion_id" = p_org AND "estado" = 'por_cerrar' AND "hasta_at" = v_f."desde_at";
      IF NOT FOUND THEN
        UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = v_f."desde_at" WHERE "id" = v_f."id";
      END IF;
    END IF;
  ELSIF v_f."plan_id" IS NULL THEN
    UPDATE "factura_plataforma"
       SET "estado" = 'por_cerrar', "hasta_at" = p_efecto, "primera_cuota_desde_at" = p_efecto
     WHERE "id" = v_f."id";
    INSERT INTO "factura_plataforma"
      ("organizacion_id", "estado", "desde_at", "periodicidad", "plan_id", "plan_nombre", "tipo_cobro")
    VALUES (p_org, 'en_curso', p_efecto, v_periodicidad, p_plan_id, v_nombre, p_tipo);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_tomar_cambio(text, timestamp, text, text) FROM PUBLIC;

-- ─── 6. Las cifras de una factura (§2.4; R5–R9, R29) ─────────────────────────────────────────────────
-- Las únicas definiciones, para el cierre y para la lectura en curso.

-- R5, R6: cargos, reversos (en positivo) y movimientos con instante en [p_desde, p_hasta), y el total.
CREATE FUNCTION factura_plataforma_ordenes(p_org text, p_desde timestamp, p_hasta timestamp)
  RETURNS TABLE (cargos numeric, reversos numeric, movimientos integer, total_ordenes numeric)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT COALESCE(sum(m."monto") FILTER (WHERE m."tipo" = 'cargo'), 0)::numeric(14,2),
         COALESCE(sum(m."monto") FILTER (WHERE m."tipo" = 'reverso'), 0)::numeric(14,2),
         count(*)::integer
    INTO cargos, reversos, movimientos
    FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = p_org AND m."ocurrido_at" >= p_desde AND m."ocurrido_at" < p_hasta;
  total_ordenes := cargos - reversos;
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_ordenes(text, timestamp, timestamp) FROM PUBLIC;

-- La cuota de un tramo que empieza en `p_tramo_desde` con un plan y un tipo, o NINGUNA FILA:
--   · sin plan, sin fila de precio o sin costo base: nada (R9);
--   · precio y descuentos del historial con el mayor `desde_at ≤ p_tramo_desde` (SLT-86 R15), costo del
--     período completo de calendario [S, E) del tipo que contiene el tramo (R8);
--   · S = inicio del tramo: el período entero, sin prorrateo (R8). Si no, con `p_primera` (la primera cuota
--     de un plan, R29): los días del tramo [inicio, E) con `plan_costo_del_tramo`. Si no: nada (R8);
--   · y nada si [S, E) ya tiene cuota en una factura de la empresa: una cerrada con `cuota_desde_at` o
--     `primera_cuota_desde_at` en [S, E), o una no cerrada con su marca en [S, E), salvo la marca que se está
--     calculando (`p_primera` con la marca en el inicio del tramo). Cada período se cobra una sola vez (R8, R29).
-- Devuelve el plan (con el nombre del plan hoy), el tramo [inicio, E), el precio, el importe y los días.
CREATE FUNCTION factura_plataforma_cuota(
  p_org text, p_tramo_desde timestamp, p_plan_id text, p_tipo text, p_primera boolean
) RETURNS TABLE (
  plan_id text, plan_nombre varchar, tipo_cobro text, desde_at timestamp, hasta_at timestamp,
  precio_mensual numeric, cuota numeric, dias_cobrados integer, dias_periodo integer
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_precio numeric;
  v_descuentos jsonb;
  v_costo numeric;
  v_s timestamp;
  v_e timestamp;
BEGIN
  IF p_plan_id IS NULL OR p_tramo_desde IS NULL THEN
    RETURN;
  END IF;
  SELECT h."precio_mensual", h."descuentos" INTO v_precio, v_descuentos
    FROM "plan_precio_historial" h
   WHERE h."plan_id" = p_plan_id AND h."desde_at" <= p_tramo_desde
   ORDER BY h."desde_at" DESC LIMIT 1;
  IF v_precio IS NULL THEN
    RETURN;
  END IF;
  v_costo := plan_costo_del_periodo(v_precio, v_descuentos, p_tipo);
  v_s := plan_inicio_periodo_calendario(p_tipo, p_tramo_desde);
  v_e := plan_fin_periodo_calendario(p_tipo, p_tramo_desde);
  IF v_s <> p_tramo_desde AND NOT p_primera THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org
       AND ((f."estado" = 'cerrada'
             AND ((f."cuota_desde_at" >= v_s AND f."cuota_desde_at" < v_e)
                  OR (f."primera_cuota_desde_at" >= v_s AND f."primera_cuota_desde_at" < v_e)))
            OR (f."estado" <> 'cerrada'
                AND f."primera_cuota_desde_at" >= v_s AND f."primera_cuota_desde_at" < v_e
                AND NOT (p_primera AND f."primera_cuota_desde_at" = p_tramo_desde)))
  ) THEN
    RETURN;
  END IF;

  plan_id := p_plan_id;
  SELECT p."nombre" INTO plan_nombre FROM "plan" p WHERE p."id" = p_plan_id;
  tipo_cobro := p_tipo;
  desde_at := p_tramo_desde;
  hasta_at := v_e;
  precio_mensual := v_precio;
  dias_periodo := plan_dias_de_calendario(v_s, v_e);
  IF v_s = p_tramo_desde THEN
    cuota := v_costo;
    dias_cobrados := dias_periodo;
  ELSE
    dias_cobrados := plan_dias_de_calendario(p_tramo_desde, v_e);
    cuota := plan_costo_del_tramo(v_costo, dias_cobrados, dias_periodo);
  END IF;
  RETURN NEXT;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_cuota(text, timestamp, text, text, boolean) FROM PUBLIC;

-- ─── 7. El cierre (§2.4, §2.5; R3–R5, R8, R11, R14, R16, R28, R29, R39) ──────────────────────────────
-- 1. La empresa en FOR UPDATE: el mismo cerrojo y en el mismo orden que `aplicarEnTx`, así un cierre y un
--    cambio de plan de la misma empresa se serializan sin interbloqueo (la empresa primero).
-- 2. Avanza hasta `p_ahora`.
-- 3. Cierra cada por cerrar con fin ≤ `p_ahora` − 5 minutos (el margen de §4.3: una transacción de órdenes
--    en vuelo en el borde ya confirmó), en orden de `desde`, salvo la ESPERA (R39): si la empresa tiene un
--    cambio pendiente con efecto en o antes de su fin, se detiene ahí y no cierra esa ni las siguientes.
--    Cada una con sus órdenes y sus cuotas, emitida en X = su fin, siendo N la factura con `desde` = X (la
--    siguiente, que `avanzar` ya abrió), en este orden:
--      a. la primera cuota, solo con marca M, con el plan de la factura con `desde` = M (N si M = X, por
--         adelantado; ella misma si M = su `desde`, a período vencido, P18), al grupo `primera_cuota_*`;
--      b. la cuota de la emisión con el plan de N (R8, R9), al grupo `cuota_*`; ya ve la marca de (a) en la
--         comprobación de «una sola vez».
--    Después, su número correlativo y `cerrada_at`.
-- Idempotente (R11): el cerrojo serializa dos cierres; el segundo no encuentra por cerrar vencidas. Un
-- reintento tras un fallo empieza del estado guardado. Devuelve cuántas cerró.
CREATE FUNCTION factura_plataforma_cerrar(p_org text, p_ahora timestamp) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_espera timestamp;
  v_f "factura_plataforma";
  v_n "factura_plataforma";
  v_p "factura_plataforma";
  v_o record;
  v_c record;
  v_pc record;
  v_numero integer;
  v_cerradas integer := 0;
BEGIN
  SELECT o."plan_cambio_desde_at" INTO v_espera FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  PERFORM factura_plataforma_avanzar(p_org, p_ahora);
  FOR v_f IN
    SELECT * FROM "factura_plataforma"
     WHERE "organizacion_id" = p_org AND "estado" = 'por_cerrar' AND "hasta_at" <= p_ahora - interval '5 minutes'
     ORDER BY "desde_at"
  LOOP
    EXIT WHEN v_espera IS NOT NULL AND v_espera <= v_f."hasta_at";
    -- Cada SELECT INTO sin filas deja la variable en nulos: nada se arrastra de la vuelta anterior.
    SELECT * INTO v_o FROM factura_plataforma_ordenes(p_org, v_f."desde_at", v_f."hasta_at");
    SELECT * INTO v_n FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org AND f."desde_at" = v_f."hasta_at";
    SELECT * INTO v_p FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org AND f."desde_at" = v_f."primera_cuota_desde_at";
    SELECT * INTO v_pc
      FROM factura_plataforma_cuota(p_org, v_f."primera_cuota_desde_at", v_p."plan_id", v_p."tipo_cobro", true);
    SELECT * INTO v_c
      FROM factura_plataforma_cuota(p_org, v_f."hasta_at", v_n."plan_id", v_n."tipo_cobro", false);
    SELECT COALESCE(max("numero"), 0) + 1 INTO v_numero FROM "factura_plataforma" WHERE "organizacion_id" = p_org;
    UPDATE "factura_plataforma"
       SET "estado" = 'cerrada', "numero" = v_numero,
           "cargos" = v_o.cargos, "reversos" = v_o.reversos, "total_ordenes" = v_o.total_ordenes,
           "movimientos" = v_o.movimientos,
           "primera_cuota_hasta_at" = v_pc.hasta_at, "primera_cuota_plan_id" = v_pc.plan_id,
           "primera_cuota_plan_nombre" = v_pc.plan_nombre, "primera_cuota_tipo_cobro" = v_pc.tipo_cobro,
           "primera_cuota_precio_mensual" = v_pc.precio_mensual, "primera_cuota" = v_pc.cuota,
           "primera_cuota_dias_cobrados" = v_pc.dias_cobrados, "primera_cuota_dias_periodo" = v_pc.dias_periodo,
           "cuota_plan_id" = v_c.plan_id, "cuota_plan_nombre" = v_c.plan_nombre, "cuota_tipo_cobro" = v_c.tipo_cobro,
           "cuota_desde_at" = v_c.desde_at, "cuota_hasta_at" = v_c.hasta_at,
           "precio_mensual" = v_c.precio_mensual, "cuota" = v_c.cuota,
           "dias_cobrados" = v_c.dias_cobrados, "dias_periodo" = v_c.dias_periodo,
           "total" = v_o.total_ordenes + COALESCE(v_c.cuota, 0) + COALESCE(v_pc.cuota, 0),
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
-- en curso y por cerrar con su fin (el fijado o el previsto por su periodicidad), su plan, su periodicidad,
-- las órdenes hasta ahora y las dos cuotas previstas, cada una nula si no la llevará:
--   · `primera_cuota_prevista`: con marca, con el plan de la factura con `desde` = la marca (como el cierre);
--   · `cuota_prevista`: la de la emisión en su fin, con el plan del cambio pendiente de la empresa si su
--     efecto es ese fin o antes; si no, con el MISMO plan que usará `cerrar` (humano, 2026-11-11): el de la
--     factura siguiente N (`desde` = ese fin, la misma consulta que `cerrar`). Si N aún no existe (la factura
--     es la en curso), el que `abrir` le copiará al abrirla: el vigente de la empresa.
-- Sin número (R24).
CREATE FUNCTION factura_plataforma_en_curso(p_org text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
  v_org      record;
  v_f        "factura_plataforma";
  v_p        "factura_plataforma";
  v_n        "factura_plataforma";
  v_hasta    timestamp;
  v_plan_id  text;
  v_tipo     text;
  v_o        record;
  v_c        record;
  v_pc       record;
  v_lista    jsonb := '[]'::jsonb;
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_org IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'factura_plataforma_en_curso: solo se leen las facturas de la empresa del contexto';
  END IF;
  SELECT o."plan_id", o."plan_tipo_cobro", o."plan_cambio_plan_id", o."plan_cambio_tipo_cobro",
         o."plan_cambio_desde_at"
    INTO v_org FROM "organizacion" o WHERE o."id" = p_org;
  FOR v_f IN
    SELECT * FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org AND f."estado" IN ('en_curso', 'por_cerrar')
     ORDER BY f."desde_at"
  LOOP
    v_hasta := COALESCE(v_f."hasta_at", plan_fin_periodo_calendario(v_f."periodicidad", v_f."desde_at"));
    SELECT * INTO v_o FROM factura_plataforma_ordenes(p_org, v_f."desde_at", LEAST(v_ahora, v_hasta));
    SELECT * INTO v_p FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org AND f."desde_at" = v_f."primera_cuota_desde_at";
    SELECT * INTO v_pc
      FROM factura_plataforma_cuota(p_org, v_f."primera_cuota_desde_at", v_p."plan_id", v_p."tipo_cobro", true);
    IF v_org."plan_cambio_desde_at" IS NOT NULL AND v_org."plan_cambio_desde_at" <= v_hasta THEN
      v_plan_id := v_org."plan_cambio_plan_id";
      v_tipo := v_org."plan_cambio_tipo_cobro";
    ELSE
      -- Como `cerrar`: el plan de N. Sin fila, `v_n` queda en nulos y se usa lo que `abrir` copiaría.
      SELECT * INTO v_n FROM "factura_plataforma" f
       WHERE f."organizacion_id" = p_org AND f."desde_at" = v_hasta;
      IF v_n."id" IS NOT NULL THEN
        v_plan_id := v_n."plan_id";
        v_tipo := v_n."tipo_cobro";
      ELSE
        v_plan_id := v_org."plan_id";
        v_tipo := CASE WHEN v_org."plan_id" IS NOT NULL THEN v_org."plan_tipo_cobro" END;
      END IF;
    END IF;
    SELECT * INTO v_c FROM factura_plataforma_cuota(p_org, v_hasta, v_plan_id, v_tipo, false);
    v_lista := v_lista || jsonb_build_array(jsonb_build_object(
      'id', v_f."id",
      'estado', v_f."estado",
      'desde', v_f."desde_at",
      'hasta', v_hasta,
      'hasta_previsto', v_f."hasta_at" IS NULL,
      'periodicidad', v_f."periodicidad",
      'plan_id', v_f."plan_id",
      'plan_nombre', v_f."plan_nombre",
      'tipo_cobro', v_f."tipo_cobro",
      'cargos', v_o.cargos::text,
      'reversos', v_o.reversos::text,
      'movimientos', v_o.movimientos,
      'total_ordenes', v_o.total_ordenes::text,
      'primera_cuota_prevista', CASE WHEN v_pc.cuota IS NOT NULL THEN jsonb_build_object(
        'plan_id', v_pc.plan_id, 'plan_nombre', v_pc.plan_nombre, 'tipo_cobro', v_pc.tipo_cobro,
        'desde', v_pc.desde_at, 'hasta', v_pc.hasta_at, 'precio_mensual', v_pc.precio_mensual::text,
        'cuota', v_pc.cuota::text, 'dias_cobrados', v_pc.dias_cobrados, 'dias_periodo', v_pc.dias_periodo) END,
      'cuota_prevista', CASE WHEN v_c.cuota IS NOT NULL THEN jsonb_build_object(
        'plan_id', v_c.plan_id, 'plan_nombre', v_c.plan_nombre, 'tipo_cobro', v_c.tipo_cobro,
        'desde', v_c.desde_at, 'hasta', v_c.hasta_at, 'precio_mensual', v_c.precio_mensual::text,
        'cuota', v_c.cuota::text, 'dias_cobrados', v_c.dias_cobrados, 'dias_periodo', v_c.dias_periodo) END,
      'total', (v_o.total_ordenes + COALESCE(v_c.cuota, 0) + COALESCE(v_pc.cuota, 0))::text));
  END LOOP;
  RETURN v_lista;
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_en_curso(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION factura_plataforma_en_curso(text) TO servi_app;

-- ─── 9. El tope del pago con las cuotas (§2.7; R18, R19) ─────────────────────────────────────────────
-- Origen: 20261024140000 (SL-45). Cuerpo LITERAL salvo `v_cargos`, que suma las dos cuotas de las facturas
-- cerradas de la empresa: Σ cargo − Σ reverso + Σ (cuota + primera cuota) de cerradas (P2, P18). El candado,
-- la clave de idempotencia y el rechazo no cambian. El `down.sql` repone el cuerpo de origen.
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

  -- SLT-118 (R18, P2, P18): las dos cuotas de las facturas cerradas suman a la deuda; la en curso y la por
  -- cerrar, no.
  v_cargos := v_cargos + (SELECT COALESCE(SUM(COALESCE(f."cuota", 0) + COALESCE(f."primera_cuota", 0)), 0)
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

-- ─── 10. Siembra (R26, P15): una factura en curso por empresa ────────────────────────────────────────
-- Desde el inicio del CORTE en curso de su periodicidad de órdenes (la de su plan; quincenal sin plan), con
-- el plan, el tipo y la periodicidad copiados de la empresa y SIN marca: el período de cobro en curso cuenta
-- como pagado y la primera cuota es la del primer período que empiece en una emisión (R8). Una empresa dada
-- de alta después la abre `avanzar` desde las 00:00 del día de su alta, la primera vez que hace falta.
INSERT INTO "factura_plataforma"
  ("organizacion_id", "estado", "desde_at", "periodicidad", "plan_id", "plan_nombre", "tipo_cobro")
SELECT o."id", 'en_curso',
       plan_inicio_periodo_calendario(CASE WHEN o."plan_id" IS NOT NULL THEN p."periodicidad_ordenes" ELSE 'quincenal' END,
                                      now() AT TIME ZONE 'UTC'),
       CASE WHEN o."plan_id" IS NOT NULL THEN p."periodicidad_ordenes" ELSE 'quincenal' END,
       o."plan_id", p."nombre", CASE WHEN o."plan_id" IS NOT NULL THEN o."plan_tipo_cobro" END
  FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id";

COMMIT;
