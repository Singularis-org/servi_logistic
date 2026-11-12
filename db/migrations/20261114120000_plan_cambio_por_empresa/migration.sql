-- SLT-128 (design §1, §2, §8) — el cambio programado de un plan llega a cada empresa al inicio de su período
-- de cobro (su RECEPCIÓN), y no a todas a la vez en la fecha F.
--
-- Cuatro piezas, en este orden:
--   1. dos tablas de PLATAFORMA (como el resto de `plan_*`): `plan_cambio_recepcion`, una fila por empresa y
--      pendiente, y `plan_version_empresa`, la versión propia de una empresa durante un cambio a medias.
--      Llevan `empresa_id` como dato y FK, pero la empresa no las lee ni las escribe: RLS sin políticas y
--      `REVOKE ALL … FROM servi_app` (R26). Sin el REVOKE, el ALTER DEFAULT PRIVILEGES de 20261022130000 le
--      daría CRUD a `servi_app`;
--      La columna es `empresa_id` y no `organizacion_id`: la guardia organizacion-en-modelos prohíbe
--      `organizacion_id` en tablas de plataforma (decisión del humano, 2026-11-12);
--   2. dos lectores internos de la versión de una empresa, `plan_version_de` y `plan_tope_rol_de`: la propia si
--      la tiene para ese plan; si no, la fila del plan. `STABLE SECURITY DEFINER`, `search_path` fijo y EXECUTE
--      revocado a PUBLIC: solo las llaman las funciones del dueño;
--   3. los ocho `CREATE OR REPLACE` que pasan a leer la versión de la empresa (§2.1) y la espera del cierre
--      (§2.2). Cada uno parte de su ÚLTIMA definición (la que nombra su bloque) y cambia SOLO la fuente de la
--      versión; firma, tipo de retorno y el resto del cuerpo son los de antes. `CREATE OR REPLACE` conserva
--      dueño, REVOKE y GRANT. El `down.sql` repone esas definiciones LITERALMENTE;
--   4. los pendientes ya guardados (R24, P10 a): una recepción por empresa de su plan en su F, la fecha que ya
--      se anunció por correo. No encola trabajos: los recoge el barrido horario.
--
-- Sin versión propia (fuera de un cambio a medias) cada lector devuelve lo mismo que antes: `plan_version_de`
-- cae en la fila del plan y `plan_tope_rol_de` en `plan_tope_rol`.
--
-- ATOMICIDAD: BEGIN/COMMIT, como 20261111130100, para que el runner de los tests (sentencia a sentencia)
-- tampoco deje nada a medias.
--
-- Prefijo 20261114: va después de la mayor migración de la rama (20261113120000_cobro_plataforma_sin_valor_empresa).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- ─── 1. Tablas, índices, FK, RLS y REVOKE (§1; R26) ──────────────────────────────────────────────────

-- §1.1. `recibe_at` son las 00:00 de la plataforma de la recepción, en UTC; `recibido_at` NULL = pendiente.
-- CASCADE con el pendiente: reemplazarlo o cancelarlo borra sus recepciones. CASCADE con la empresa.
CREATE TABLE "plan_cambio_recepcion" (
    "cambio_id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "recibe_at" TIMESTAMP(3) NOT NULL,
    "recibido_at" TIMESTAMP(3),

    CONSTRAINT "plan_cambio_recepcion_pkey" PRIMARY KEY ("cambio_id", "empresa_id")
);

-- La espera del cierre (§2.2) y la salida de un plan (R18) buscan por empresa; la PK empieza por el pendiente.
CREATE INDEX "plan_cambio_recepcion_empresa_id_idx" ON "plan_cambio_recepcion" ("empresa_id");
-- El barrido (R5) y la espera del cierre (R9) solo miran las que faltan.
CREATE INDEX "plan_cambio_recepcion_pendientes_idx" ON "plan_cambio_recepcion" ("recibe_at")
    WHERE "recibido_at" IS NULL;

ALTER TABLE "plan_cambio_recepcion" ADD CONSTRAINT "plan_cambio_recepcion_cambio_id_fkey"
    FOREIGN KEY ("cambio_id") REFERENCES "plan_cambio_programado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_cambio_recepcion" ADD CONSTRAINT "plan_cambio_recepcion_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- §1.2. Una como mucho por empresa. `cambio_id` es opaco y SIN FK, a propósito: la versión sobrevive al
-- reemplazo del pendiente que la trajo (R13). `version` tiene la forma de `versionPlanSchema`, con
-- `periodicidadOrdenes` siempre presente; la valida la app al escribir.
CREATE TABLE "plan_version_empresa" (
    "empresa_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "cambio_id" TEXT NOT NULL,
    "version" JSONB NOT NULL,
    "desde_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_version_empresa_pkey" PRIMARY KEY ("empresa_id")
);

-- «Plan partido» = alguna fila con ese `plan_id` (R14, R16); promover borra las del plan (R10).
CREATE INDEX "plan_version_empresa_plan_id_idx" ON "plan_version_empresa" ("plan_id");

ALTER TABLE "plan_version_empresa" ADD CONSTRAINT "plan_version_empresa_empresa_id_fkey"
    FOREIGN KEY ("empresa_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_version_empresa" ADD CONSTRAINT "plan_version_empresa_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_cambio_recepcion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_version_empresa" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan_cambio_recepcion" FROM servi_app;
REVOKE ALL ON "plan_version_empresa" FROM servi_app;

-- ─── 2. Los lectores de la versión de la empresa (§2.1; R2) ──────────────────────────────────────────

-- La versión que rige a `p_org` con el plan `p_plan_id`: la propia si la tiene con ESE plan; si no, la fila
-- del plan. Sin fila de plan, ninguna. Los importes de la versión son texto en el JSON (`montoCobroSchema`):
-- se pasan a los mismos `numeric` que las columnas. Un JSON `null` sale NULL («sin tope», «no lo fija»).
CREATE FUNCTION plan_version_de(p_org text, p_plan_id text) RETURNS TABLE (
  "nombre" varchar, "periodicidad_ordenes" text, "tope_api_keys" integer,
  "costo_por_orden" numeric(12, 2), "costo_por_orden_pct" numeric(5, 2), "costo_por_orden_minimo" numeric(12, 2)
)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (v."version" ->> 'nombre')::varchar(80),
         COALESCE(v."version" ->> 'periodicidadOrdenes', p."periodicidad_ordenes"),
         (v."version" -> 'topes' ->> 'apiKeys')::integer,
         (v."version" ->> 'costoPorOrden')::numeric(12, 2),
         (v."version" -> 'costoPorOrdenPorcentual' ->> 'porcentaje')::numeric(5, 2),
         (v."version" -> 'costoPorOrdenPorcentual' ->> 'minimo')::numeric(12, 2)
    FROM "plan_version_empresa" v JOIN "plan" p ON p."id" = v."plan_id"
   WHERE v."empresa_id" = p_org AND v."plan_id" = p_plan_id
  UNION ALL
  SELECT p."nombre", p."periodicidad_ordenes", p."tope_api_keys",
         p."costo_por_orden", p."costo_por_orden_pct", p."costo_por_orden_minimo"
    FROM "plan" p
   WHERE p."id" = p_plan_id
     AND NOT EXISTS (SELECT 1 FROM "plan_version_empresa" v
                      WHERE v."empresa_id" = p_org AND v."plan_id" = p_plan_id)
$$;
REVOKE EXECUTE ON FUNCTION plan_version_de(text, text) FROM PUBLIC;

-- El tope de un rol en la versión de la empresa; NULL = sin tope. La clave del JSON es la de la app: la
-- misma traducción de `'Admin Tienda'` que el mensaje del trigger de topes (20261028130200).
CREATE FUNCTION plan_tope_rol_de(p_org text, p_plan_id text, p_rol rol_value) RETURNS integer
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_version jsonb;
BEGIN
  SELECT v."version" INTO v_version
    FROM "plan_version_empresa" v WHERE v."empresa_id" = p_org AND v."plan_id" = p_plan_id;
  IF FOUND THEN
    RETURN (v_version -> 'topes' -> 'porRol' ->> (CASE p_rol WHEN 'Admin Tienda' THEN 'adminTienda' ELSE p_rol::text END))::integer;
  END IF;
  RETURN (SELECT t."maximo" FROM "plan_tope_rol" t WHERE t."plan_id" = p_plan_id AND t."rol" = p_rol);
END $$;
REVOKE EXECUTE ON FUNCTION plan_tope_rol_de(text, text, rol_value) FROM PUBLIC;

-- ─── 3. Los lectores que pasan a la versión de la empresa (§2.1, §2.2; R2, R7, R9, R12) ──────────────

-- Origen: 20261028130200_plan_topes_triggers. Cambia: el tope del rol sale de `plan_tope_rol_de`. El cerrojo
-- `FOR SHARE` de la empresa y del plan sigue igual (SL-24 R24): choca con el `FOR UPDATE` de recibir.
CREATE OR REPLACE FUNCTION plan_tope_usuario() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan   text;
  v_rol    rol_value;
  v_maximo integer;
  v_total  integer;
BEGIN
  SELECT o."plan_id" INTO v_plan FROM "organizacion" o WHERE o."id" = NEW."organizacion_id" FOR SHARE;
  IF v_plan IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM "plan" p WHERE p."id" = v_plan FOR SHARE;
  SELECT r."value" INTO v_rol FROM "rol" r WHERE r."id" = NEW."rol_id";
  v_maximo := plan_tope_rol_de(NEW."organizacion_id", v_plan, v_rol);
  IF v_maximo IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(24, hashtext(NEW."organizacion_id"));
  v_total := plan_uso_rol(NEW."organizacion_id", v_rol);
  IF v_total > v_maximo THEN
    RAISE EXCEPTION USING ERRCODE = 'SL024',
      MESSAGE = 'tope_plan ' || jsonb_build_object(
        'tope', 'rol',
        'rol', CASE WHEN v_rol = 'Admin Tienda' THEN 'adminTienda' ELSE v_rol::text END,
        'maximo', v_maximo, 'usados', v_total - 1, 'pedidas', 1)::text;
  END IF;
  RETURN NULL;
END $$;

-- Origen: 20261028130200_plan_topes_triggers. Cambia: el tope sale de `plan_version_de`; el `FOR SHARE` del
-- plan se queda, ahora en su propia sentencia.
CREATE OR REPLACE FUNCTION plan_tope_api_key() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan   text;
  v_maximo integer;
  v_total  integer;
BEGIN
  SELECT o."plan_id" INTO v_plan FROM "organizacion" o WHERE o."id" = NEW."organizacion_id" FOR SHARE;
  IF v_plan IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM "plan" p WHERE p."id" = v_plan FOR SHARE;
  SELECT v."tope_api_keys" INTO v_maximo FROM plan_version_de(NEW."organizacion_id", v_plan) v;
  IF v_maximo IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(24, hashtext(NEW."organizacion_id"));
  v_total := plan_uso_api_keys(NEW."organizacion_id");
  IF v_total > v_maximo THEN
    RAISE EXCEPTION USING ERRCODE = 'SL024',
      MESSAGE = 'tope_plan ' || jsonb_build_object(
        'tope', 'api_keys', 'maximo', v_maximo, 'usados', v_total - 1, 'pedidas', 1)::text;
  END IF;
  RETURN NULL;
END $$;

-- Origen: 20261113120000_cobro_plataforma_sin_valor_empresa. Cambia: los tres costos del plan salen de
-- `plan_version_de` (R2: la orden de una empresa que ya recibió el cambio se cobra con el cobro nuevo).
CREATE OR REPLACE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)
  RETURNS TABLE ("monto" numeric(12, 2), "fuente" cobro_plataforma_fuente, "porcentaje" numeric(5, 2), "minimo" numeric(12, 2))
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan      numeric(12, 2);
  v_pct       numeric(5, 2);
  v_minimo    numeric(12, 2);
  v_global    numeric(12, 2);
BEGIN
  SELECT v."costo_por_orden", v."costo_por_orden_pct", v."costo_por_orden_minimo"
    INTO v_plan, v_pct, v_minimo
    FROM "organizacion" o LEFT JOIN LATERAL plan_version_de(o."id", o."plan_id") v ON true
   WHERE o."id" = p_organizacion_id;
  IF v_pct       IS NOT NULL THEN RETURN QUERY SELECT NULL::numeric(12,2), 'plan'::cobro_plataforma_fuente, v_pct, v_minimo;          RETURN; END IF;
  IF v_plan      IS NOT NULL THEN RETURN QUERY SELECT v_plan, 'plan'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);     RETURN; END IF;
  SELECT t."monto" INTO v_global FROM "cobro_plataforma_tarifa" t WHERE t."id";
  IF v_global    IS NOT NULL THEN RETURN QUERY SELECT v_global, 'global'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2); RETURN; END IF;
  RETURN QUERY SELECT 0::numeric(12,2), 'sin_configurar'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);
END $$;

-- Origen: 20261106130000_plan_de_la_empresa_pendiente_sin_plan. Cambia (R2, R12): con versión propia, el
-- nombre, el precio, los descuentos, los costos, los topes y los módulos salen de ella (`pv` y `v_version`);
-- `cambio` es la recepción pendiente de la empresa (su fecha, no F) y NULL si ya lo recibió. El precio del
-- período sigue saliendo del historial (SLT-86 R15, R3). La rama sin plan no cambia.
CREATE OR REPLACE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
  v_plan     jsonb;
  v_version  jsonb;
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_de_la_empresa: solo se lee el plan de la empresa del contexto';
  END IF;
  -- SLT-128 (R2, R12): la versión propia de la empresa durante un cambio a medias, o NULL (la del plan).
  SELECT v."version" INTO v_version
    FROM "organizacion" o
    JOIN "plan_version_empresa" v ON v."empresa_id" = o."id" AND v."plan_id" = o."plan_id"
   WHERE o."id" = p_organizacion_id;
  v_plan := (
    SELECT jsonb_build_object(
      'nombre', pv."nombre",
      'precio_mensual', CASE WHEN v_version IS NULL THEN p."precio_mensual"::text
                             ELSE (v_version -> 'precio' ->> 'mensual')::numeric(12, 2)::text END,
      'descuentos', CASE WHEN v_version IS NULL THEN
                      COALESCE((SELECT jsonb_object_agg(d."periodo",
                                CASE WHEN d."porcentaje" IS NOT NULL
                                     THEN jsonb_build_object('tipo', 'porcentaje', 'porcentaje', d."porcentaje"::text)
                                     ELSE jsonb_build_object('tipo', 'monto', 'monto', d."monto"::text) END)
                                FROM "plan_descuento_periodo" d WHERE d."plan_id" = p."id"), '{}'::jsonb)
                    ELSE
                      -- Con los tipos de las columnas, para que el texto salga igual que sin versión propia.
                      COALESCE((SELECT jsonb_object_agg(d.key,
                                CASE WHEN d.value ->> 'tipo' = 'porcentaje'
                                     THEN jsonb_build_object('tipo', 'porcentaje', 'porcentaje',
                                                             (d.value ->> 'porcentaje')::numeric(5, 2)::text)
                                     ELSE jsonb_build_object('tipo', 'monto', 'monto',
                                                             (d.value ->> 'monto')::numeric(12, 2)::text) END)
                                FROM jsonb_each(COALESCE(v_version -> 'precio' -> 'descuentos', '{}'::jsonb)) d), '{}'::jsonb)
                    END,
      'precio_del_periodo', (SELECT jsonb_build_object('precio_mensual', h."precio_mensual"::text, 'descuentos', h."descuentos")
                               FROM "plan_precio_historial" h
                              WHERE h."plan_id" = p."id" AND h."desde_at" <= ci."inicio"
                              ORDER BY h."desde_at" DESC LIMIT 1),
      'costo_por_orden', pv."costo_por_orden"::text,
      'costo_por_orden_pct', pv."costo_por_orden_pct"::text,
      'costo_por_orden_minimo', pv."costo_por_orden_minimo"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente", 'porcentaje', t."porcentaje"::text, 'minimo', t."minimo"::text) FROM cobro_plataforma_tarifa_de(o."id") t),
      'cobro_ciclo', (SELECT jsonb_build_object('cobrado', c."cobrado"::text, 'pendientes', c."pendientes")
                        FROM plan_cobro_del_ciclo(o."id", ci."inicio") c),
      'tipo_cobro', o."plan_tipo_cobro",
      'tope_api_keys', pv."tope_api_keys",
      'topes_rol', CASE WHEN v_version IS NULL THEN
                     COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb)
                   ELSE
                     -- La clave de la versión es la de la app (`adminTienda`); la fila, la etiqueta de Postgres.
                     -- Un rol con `null` no tiene tope, como sin fila en `plan_tope_rol`.
                     COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                 'rol', CASE WHEN t.key = 'adminTienda' THEN 'Admin Tienda' ELSE t.key END,
                                 'maximo', (t.value #>> '{}')::integer))
                               FROM jsonb_each(COALESCE(v_version -> 'topes' -> 'porRol', '{}'::jsonb)) t
                              WHERE jsonb_typeof(t.value) = 'number'), '[]'::jsonb)
                   END,
      'modulos', CASE WHEN v_version IS NULL THEN
                   COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb)
                 ELSE COALESCE(v_version -> 'modulos', '[]'::jsonb) END,
      'ciclo_inicio', ci."inicio",
      'ciclo_fin', plan_fin_periodo_calendario(o."plan_tipo_cobro", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", ci."inicio"),
        'api_keys', plan_uso_api_keys(o."id"),
        'admin', plan_uso_rol(o."id", 'admin'::rol_value),
        'mensajero', plan_uso_rol(o."id", 'mensajero'::rol_value),
        'admin_tienda', plan_uso_rol(o."id", 'Admin Tienda'::rol_value),
        'admin_satelite', plan_uso_rol(o."id", 'adminSatelite'::rol_value)),
      -- Solo la fecha y la versión: NUNCA `avisos_al_programar` (nombra otras empresas) ni el actor (R9).
      -- SLT-128 (R12): la fecha es SU recepción, no F; si ya lo recibió, no hay cambio que mostrar.
      'cambio', (SELECT jsonb_build_object('vigente_desde', r."recibe_at", 'version', c."version")
                   FROM "plan_cambio_programado" c
                   JOIN "plan_cambio_recepcion" r ON r."cambio_id" = c."id" AND r."empresa_id" = o."id"
                  WHERE c."plan_id" = p."id" AND r."recibido_at" IS NULL),
      -- El pendiente de la empresa, sin `plan_cambio_actor_id` (R32).
      'cambio_empresa', CASE WHEN o."plan_cambio_id" IS NULL THEN NULL
                             ELSE jsonb_build_object(
                               'plan_nombre', (SELECT pc."nombre" FROM "plan" pc WHERE pc."id" = o."plan_cambio_plan_id"),
                               'tipo_cobro', o."plan_cambio_tipo_cobro",
                               'desde', o."plan_cambio_desde_at") END)
      FROM "organizacion" o
      JOIN "plan" p ON p."id" = o."plan_id"
     CROSS JOIN LATERAL plan_version_de(o."id", o."plan_id") pv
     CROSS JOIN LATERAL (SELECT plan_inicio_ciclo_de(o."plan_ciclo_ancla_at", o."plan_tipo_cobro", v_ahora) AS "inicio") ci
     WHERE o."id" = p_organizacion_id);
  IF v_plan IS NOT NULL THEN
    RETURN v_plan;
  END IF;
  -- R26 sin plan: la primera asignación pendiente, con la misma forma de `cambio_empresa` y sin el actor.
  RETURN (
    SELECT jsonb_build_object(
      'sin_plan', true,
      'cambio_empresa', jsonb_build_object(
        'plan_nombre', (SELECT pc."nombre" FROM "plan" pc WHERE pc."id" = o."plan_cambio_plan_id"),
        'tipo_cobro', o."plan_cambio_tipo_cobro",
        'desde', o."plan_cambio_desde_at"))
      FROM "organizacion" o
     WHERE o."id" = p_organizacion_id AND o."plan_id" IS NULL AND o."plan_cambio_id" IS NOT NULL);
END $$;

-- Origen: 20261111130100_factura_plataforma. Cambia: el nombre y la periodicidad de la factura que se abre
-- salen de la versión de la empresa (R2, R7).
CREATE OR REPLACE FUNCTION factura_plataforma_abrir(p_org text, p_desde timestamp) RETURNS "factura_plataforma"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
BEGIN
  INSERT INTO "factura_plataforma"
    ("organizacion_id", "estado", "desde_at", "periodicidad", "plan_id", "plan_nombre", "tipo_cobro")
  SELECT o."id", 'en_curso', p_desde,
         CASE WHEN o."plan_id" IS NOT NULL THEN v."periodicidad_ordenes" ELSE 'quincenal' END,
         o."plan_id", v."nombre",
         CASE WHEN o."plan_id" IS NOT NULL THEN o."plan_tipo_cobro" END
    FROM "organizacion" o LEFT JOIN LATERAL plan_version_de(o."id", o."plan_id") v ON true
   WHERE o."id" = p_org
  RETURNING * INTO v_f;
  IF v_f."id" IS NULL THEN
    RAISE EXCEPTION 'factura_plataforma_abrir: no existe la empresa %', p_org USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_f;
END $$;

-- Origen: 20261111130100_factura_plataforma. Cambia: el nombre y la periodicidad del plan nuevo salen de
-- `plan_version_de` (R17: la empresa que entra en F o después ya tiene escrita su versión propia). Sin el
-- plan, `plan_version_de` no devuelve filas y el NOT FOUND sigue igual.
CREATE OR REPLACE FUNCTION factura_plataforma_tomar_cambio(p_org text, p_efecto timestamp, p_plan_id text, p_tipo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
  v_nombre varchar(80);
  v_periodicidad text;
  v_primera boolean;
BEGIN
  SELECT v."nombre", v."periodicidad_ordenes" INTO v_nombre, v_periodicidad FROM plan_version_de(p_org, p_plan_id) v;
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

-- Origen: 20261111130100_factura_plataforma. Cambia: el nombre de la cuota sale de `plan_version_de` (R9).
CREATE OR REPLACE FUNCTION factura_plataforma_cuota(
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
  SELECT v."nombre" INTO plan_nombre FROM plan_version_de(p_org, p_plan_id) v;
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

-- Origen: 20261111130100_factura_plataforma. Cambia (§2.2, R9): la espera ya no busca la edición programada de
-- la periodicidad del plan, sino la recepción más temprana de la empresa que la cola aún no aplicó. Avanza
-- hasta justo antes de ella y no cierra la factura cuyo fin llega a ella ni las siguientes, como antes.
CREATE OR REPLACE FUNCTION factura_plataforma_cerrar(p_org text, p_ahora timestamp) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_espera timestamp;
  v_recepcion timestamp;
  v_f "factura_plataforma";
  v_n "factura_plataforma";
  v_p "factura_plataforma";
  v_o record;
  v_c record;
  v_pc record;
  v_numero integer;
  v_cerradas integer := 0;
BEGIN
  SELECT o."plan_cambio_desde_at" INTO v_espera
    FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  -- SLT-128 (R9): la recepción más temprana que la cola aún no aplicó a la empresa, de CUALQUIER edición
  -- programada de su plan (no solo la de la periodicidad).
  SELECT min(r."recibe_at") INTO v_recepcion
    FROM "plan_cambio_recepcion" r
   WHERE r."empresa_id" = p_org AND r."recibido_at" IS NULL;
  v_espera := LEAST(v_espera, v_recepcion);
  -- LEAST ignora los nulos: sin recepción pendiente, avanza hasta `p_ahora`; con ella, la factura cuyo fin llega
  -- a la recepción queda en curso y la siguiente no se abre con la versión vieja.
  PERFORM factura_plataforma_avanzar(p_org, LEAST(p_ahora, v_recepcion - interval '1 microsecond'));
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

-- ─── 4. Los pendientes ya guardados (§8; R24, P10 a) ─────────────────────────────────────────────────
-- Cada empresa de su plan lo recibe en su F, la fecha anunciada, aunque no sea inicio de su período: el
-- cierre la espera igual (R9). El `plan_aplicar_cambio` sin empresa ya encolado solo promueve (§3.2).
INSERT INTO "plan_cambio_recepcion" ("cambio_id", "empresa_id", "recibe_at")
SELECT c."id", o."id", c."vigente_desde"
  FROM "plan_cambio_programado" c JOIN "organizacion" o ON o."plan_id" = c."plan_id";

COMMIT;
