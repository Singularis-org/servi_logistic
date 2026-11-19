-- SLT-86 — revierte 20261106120000_plan_periodo_facturacion (design §8.2; R36).
--
-- SE NIEGA, antes de tocar nada, si hay algo que la forma de antes no puede representar:
--   · una empresa con tipo `quincenal` o `bimestral` (el CHECK de antes solo admite `mensual` y `anual`) o
--     con un cambio pendiente (no hay dónde guardarlo);
--   · un plan o una versión pendiente con descuento en `quincenal`, `mensual` o `bimestral`;
--   · un descuento anual en monto mayor que mensual × 12 (daría un anual fijo negativo) o un descuento en un
--     plan «sin precio».
-- Quien quiera bajar, antes devuelve esas empresas a `mensual` o `anual`, cancela sus pendientes y quita
-- esos descuentos.
--
-- Lo que vuelve: el anual de cada plan y de cada versión pendiente (un descuento anual en porcentaje vuelve
-- a `descuento_anual_pct`; uno en monto m vuelve a `precio_anual = 12·mensual − m`), las columnas, los
-- CHECK, el trigger `plan_tope_ordenes` y las funciones `plan_tope_ordenes`, `plan_cupo_ordenes` y
-- `plan_de_la_empresa`. Sus cuerpos están COPIADOS LITERALMENTE de su última migración de origen
-- (20261029150000 y 20261104150200): `migracion-slt86-ida-y-vuelta.test.ts` compara el `md5` de
-- `pg_get_functiondef` antes de subir y tras bajar, con su `proacl`.
--
-- PÉRDIDAS (R36):
--   · los topes de órdenes borrados no vuelven: `tope_ordenes_ciclo` vuelve en NULL, que es «sin límite»,
--     y las versiones pendientes vuelven con `ordenesPorCiclo: null`;
--   · las entradas de las empresas no vuelven a su ancla de antes: se quedan en las 00:00 del día en que
--     corrió la migración (o en la fecha de su último cambio), y el ciclo corto vuelve en NULL;
--   · las filas con fecha de `plan_precio_historial` (las ediciones de precio con fecha de efecto) se
--     pierden con la tabla; el precio que queda es el vigente.
-- Las filas que la subida escribió en `plan_rastro` se quedan: el rastro solo recibe filas nuevas.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "organizacion" WHERE "plan_tipo_cobro" IN ('quincenal', 'bimestral')) THEN
    RAISE EXCEPTION 'SLT-86 down: hay empresas con tipo de cobro quincenal o bimestral';
  END IF;
  IF EXISTS (SELECT 1 FROM "organizacion" WHERE "plan_cambio_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'SLT-86 down: hay empresas con un cambio de plan pendiente';
  END IF;
  IF EXISTS (SELECT 1 FROM "plan_descuento_periodo" WHERE "periodo" <> 'anual')
     OR EXISTS (SELECT 1 FROM "plan_cambio_programado" c,
                       jsonb_object_keys(COALESCE(c."version" -> 'precio' -> 'descuentos', '{}'::jsonb)) k
                 WHERE k <> 'anual') THEN
    RAISE EXCEPTION 'SLT-86 down: hay planes con descuento quincenal, mensual o bimestral';
  END IF;
  IF EXISTS (SELECT 1 FROM "plan_descuento_periodo" d JOIN "plan" p ON p."id" = d."plan_id"
              WHERE p."precio_mensual" IS NULL OR d."monto" > p."precio_mensual" * 12)
     OR EXISTS (SELECT 1 FROM "plan_cambio_programado" c
                 WHERE c."version" -> 'precio' -> 'descuentos' -> 'anual' ->> 'tipo' = 'monto'
                   AND (c."version" -> 'precio' -> 'descuentos' -> 'anual' ->> 'monto')::numeric
                       > (c."version" -> 'precio' ->> 'mensual')::numeric * 12) THEN
    RAISE EXCEPTION 'SLT-86 down: hay planes con un descuento anual que el precio anual de antes no puede representar';
  END IF;
END
$$;

-- ─── `plan`: el anual y el tope de órdenes ───────────────────────────────────────────────────────
ALTER TABLE "plan" ADD COLUMN "tope_ordenes_ciclo" INTEGER;
ALTER TABLE "plan" ADD COLUMN "precio_anual" DECIMAL(12,2);
ALTER TABLE "plan" ADD COLUMN "descuento_anual_pct" DECIMAL(5,2);
ALTER TABLE "plan" ADD CONSTRAINT "plan_tope_ordenes_ciclo_check" CHECK ("tope_ordenes_ciclo" IS NULL OR "tope_ordenes_ciclo" >= 0);
ALTER TABLE "plan" ADD CONSTRAINT "plan_precio_anual_check" CHECK ("precio_anual" IS NULL OR "precio_anual" >= 0);
ALTER TABLE "plan" ADD CONSTRAINT "plan_descuento_anual_pct_check" CHECK ("descuento_anual_pct" IS NULL OR ("descuento_anual_pct" > 0 AND "descuento_anual_pct" <= 100));

UPDATE "plan" p
   SET "descuento_anual_pct" = d."porcentaje",
       "precio_anual" = CASE WHEN d."monto" IS NULL THEN NULL ELSE p."precio_mensual" * 12 - d."monto" END
  FROM "plan_descuento_periodo" d
 WHERE d."plan_id" = p."id" AND d."periodo" = 'anual';

-- La de 20261104130000: sin precio; mensual; mensual y anual fijo; mensual y porcentaje.
ALTER TABLE "plan" ADD CONSTRAINT "plan_precio_forma" CHECK (
  NOT ("precio_anual" IS NOT NULL AND "descuento_anual_pct" IS NOT NULL)
  AND ("precio_mensual" IS NOT NULL OR ("precio_anual" IS NULL AND "descuento_anual_pct" IS NULL))
);

-- Las versiones pendientes vuelven a la forma de antes: `anual` en vez de `descuentos`, y el tope de
-- órdenes en `null` (sin límite).
UPDATE "plan_cambio_programado" c
   SET "version" = jsonb_set(c."version", '{precio}',
         (c."version" -> 'precio') - 'descuentos' || jsonb_build_object('anual',
           CASE c."version" -> 'precio' -> 'descuentos' -> 'anual' ->> 'tipo'
             WHEN 'porcentaje' THEN jsonb_build_object(
               'tipo', 'descuento', 'porcentaje', c."version" -> 'precio' -> 'descuentos' -> 'anual' ->> 'porcentaje')
             WHEN 'monto' THEN jsonb_build_object(
               'tipo', 'fijo',
               'monto', ((c."version" -> 'precio' ->> 'mensual')::numeric * 12
                         - (c."version" -> 'precio' -> 'descuentos' -> 'anual' ->> 'monto')::numeric)::numeric(12, 2)::text)
             ELSE 'null'::jsonb
           END))
 WHERE c."version" -> 'precio' ->> 'tipo' = 'monto';

UPDATE "plan_cambio_programado" SET "version" = jsonb_set("version", '{topes,ordenesPorCiclo}', 'null'::jsonb)
 WHERE jsonb_typeof("version" -> 'topes') = 'object';

-- ─── `organizacion`: dos tipos, sin pendiente y con el ciclo corto en NULL ───────────────────────
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_cambio_completo";
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_cambio_tipo_cobro_check";
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_cambio_plan_id_fkey";
ALTER TABLE "organizacion" DROP COLUMN "plan_cambio_id";
ALTER TABLE "organizacion" DROP COLUMN "plan_cambio_plan_id";
ALTER TABLE "organizacion" DROP COLUMN "plan_cambio_tipo_cobro";
ALTER TABLE "organizacion" DROP COLUMN "plan_cambio_desde_at";
ALTER TABLE "organizacion" DROP COLUMN "plan_cambio_actor_id";
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_tipo_cobro_check";
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_tipo_cobro_check"
  CHECK ("plan_tipo_cobro" IN ('mensual', 'anual'));
ALTER TABLE "organizacion" ADD COLUMN "plan_ciclo_corto_desde_at" TIMESTAMP(3);
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_ciclo_corto_check"
  CHECK ("plan_ciclo_corto_desde_at" IS NULL
         OR ("plan_ciclo_ancla_at" IS NOT NULL AND "plan_ciclo_corto_desde_at" < "plan_ciclo_ancla_at"));

-- ─── El tope de órdenes: funciones y trigger ─────────────────────────────────────────────────────
-- Origen: 20261029150000_plan_ciclo_inicio_elegido (SLT-58), con los REVOKE y el GRANT de 20261028130200.
CREATE OR REPLACE FUNCTION plan_tope_ordenes() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org     text;
  v_plan    text;
  v_ancla   timestamp;
  v_corto   timestamp;
  v_maximo  integer;
  v_total   integer;
  v_pedidas integer;
BEGIN
  FOR v_org IN SELECT DISTINCT n."organizacion_id" FROM "nuevas" n ORDER BY 1 LOOP
    SELECT o."plan_id", o."plan_ciclo_ancla_at", o."plan_ciclo_corto_desde_at" INTO v_plan, v_ancla, v_corto
      FROM "organizacion" o WHERE o."id" = v_org FOR SHARE;
    CONTINUE WHEN v_plan IS NULL;
    SELECT p."tope_ordenes_ciclo" INTO v_maximo FROM "plan" p WHERE p."id" = v_plan FOR SHARE;
    CONTINUE WHEN v_maximo IS NULL;
    PERFORM pg_advisory_xact_lock(24, hashtext(v_org));
    v_total := plan_uso_ordenes(v_org, plan_inicio_ciclo_en_curso(v_corto, v_ancla, now() AT TIME ZONE 'UTC'));
    SELECT count(*)::integer INTO v_pedidas FROM "nuevas" n
     WHERE n."organizacion_id" = v_org AND n."deleted_at" IS NULL;
    IF v_total > v_maximo THEN
      RAISE EXCEPTION USING ERRCODE = 'SL024',
        MESSAGE = 'tope_plan ' || jsonb_build_object(
          'tope', 'ordenes', 'maximo', v_maximo, 'usados', v_total - v_pedidas, 'pedidas', v_pedidas)::text;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION plan_cupo_ordenes(p_organizacion_id text) RETURNS TABLE (maximo integer, usados integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_cupo_ordenes: solo se lee el cupo de la empresa del contexto';
  END IF;
  RETURN QUERY
    SELECT p."tope_ordenes_ciclo",
           plan_uso_ordenes(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", (now() AT TIME ZONE 'UTC')))
      FROM "organizacion" o
      JOIN "plan" p ON p."id" = o."plan_id"
     WHERE o."id" = p_organizacion_id
       AND p."tope_ordenes_ciclo" IS NOT NULL;
END $$;

REVOKE EXECUTE ON FUNCTION plan_cupo_ordenes(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_tope_ordenes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plan_cupo_ordenes(text) TO servi_app;

CREATE TRIGGER "plan_tope_ordenes" AFTER INSERT ON "orden"
  REFERENCING NEW TABLE AS "nuevas"
  FOR EACH STATEMENT EXECUTE FUNCTION plan_tope_ordenes();

-- ─── `plan_de_la_empresa` ────────────────────────────────────────────────────────────────────────
-- Origen: 20261104150200_cobro_plataforma_porcentual_funciones (SLT-83). `CREATE OR REPLACE` conserva
-- dueño y privilegios: el GRANT a `servi_app` sigue.
CREATE OR REPLACE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_de_la_empresa: solo se lee el plan de la empresa del contexto';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'nombre', p."nombre",
      'precio_mensual', p."precio_mensual"::text,
      'precio_anual', p."precio_anual"::text,
      'descuento_anual_pct', p."descuento_anual_pct"::text,
      'costo_por_orden', p."costo_por_orden"::text,
      'costo_por_orden_pct', p."costo_por_orden_pct"::text,
      'costo_por_orden_minimo', p."costo_por_orden_minimo"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente", 'porcentaje', t."porcentaje"::text, 'minimo', t."minimo"::text) FROM cobro_plataforma_tarifa_de(o."id") t),
      'cobro_ciclo', (SELECT jsonb_build_object('cobrado', c."cobrado"::text, 'pendientes', c."pendientes")
                        FROM plan_cobro_del_ciclo(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora)) c),
      'tipo_cobro', o."plan_tipo_cobro",
      'tope_ordenes_ciclo', p."tope_ordenes_ciclo",
      'tope_api_keys', p."tope_api_keys",
      'topes_rol', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb),
      'modulos', COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb),
      'ciclo_inicio', plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'ciclo_corto_desde', o."plan_ciclo_corto_desde_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora)),
        'api_keys', plan_uso_api_keys(o."id"),
        'admin', plan_uso_rol(o."id", 'admin'::rol_value),
        'mensajero', plan_uso_rol(o."id", 'mensajero'::rol_value),
        'admin_tienda', plan_uso_rol(o."id", 'Admin Tienda'::rol_value),
        'admin_satelite', plan_uso_rol(o."id", 'adminSatelite'::rol_value)),
      -- Solo la fecha y la versión: NUNCA `avisos_al_programar` (nombra otras empresas) ni el actor (R9).
      'cambio', (SELECT jsonb_build_object('vigente_desde', c."vigente_desde", 'version', c."version")
                   FROM "plan_cambio_programado" c WHERE c."plan_id" = p."id"))
      FROM "organizacion" o JOIN "plan" p ON p."id" = o."plan_id"
     WHERE o."id" = p_organizacion_id);
END $$;

-- ─── Lo nuevo se va ──────────────────────────────────────────────────────────────────────────────
DROP FUNCTION plan_inicio_ciclo_de(timestamp, text, timestamp);
DROP FUNCTION plan_fin_periodo_calendario(text, timestamp);
DROP FUNCTION plan_inicio_periodo_calendario(text, timestamp);
DROP TABLE "plan_precio_historial";
DROP TABLE "plan_descuento_periodo";
