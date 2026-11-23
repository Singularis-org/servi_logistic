-- SLT-86 (design §1, §3.1, §3.3, §8.1; R1, R10, R11, R32–R35) — período de facturación de calendario por
-- empresa, descuentos por período y sin tope de órdenes.
--
-- Por pasos (design §8.1):
--   1. P3 (R33): se niega, sin cambiar nada, si un plan o una versión pendiente tiene un anual fijo mayor
--      que mensual × 12: no cabe como descuento anual (daría un descuento negativo).
--   2. Tablas nuevas de PLATAFORMA `plan_descuento_periodo` (el precio vigente hoy) y
--      `plan_precio_historial` (solo se añade; R15), con RLS sin políticas y `REVOKE ALL … FROM servi_app`
--      como `plan_tope_rol` (R32).
--   3. El anual de cada plan y de cada versión pendiente pasa a descuento del período anual (R33): un
--      porcentaje queda igual y un anual fijo A queda como monto `12·mensual − A`, de modo que el costo
--      anual de antes (D7) y el de después (R9, R10) son el mismo.
--   4. Cada plan siembra su fila de historial `'-infinity'` con el precio ya convertido.
--   5. Tope de órdenes (R34): por cada plan que lo tenía, una fila `editado` en `plan_rastro` firmada por
--      el sistema. `plan_rastro.actor_usuario_id` es opaco y sin FK (SL-24 §2.8), así que `'sistema'` no
--      apunta a ningún usuario. Se quita de las versiones pendientes y se borran el trigger, sus dos
--      funciones y la columna.
--   6. Se sueltan `plan_precio_forma`, `precio_anual` y `descuento_anual_pct`.
--   7. `organizacion`: cuatro tipos de cobro (R1), el cambio pendiente de la empresa (cinco columnas, todas
--      o ninguna) y la entrada de TODA empresa con plan a las 00:00 de hoy en la plataforma (R35). Así las
--      órdenes de hoy creadas antes de la migración cuentan en su primer tramo. Se retira el ciclo corto
--      (P4 = a): la entrada nunca es futura.
--   8. Las funciones del período de calendario (§3.1) y `plan_de_la_empresa` recreada desde su cuerpo de
--      SLT-83 (20261104150200) con el período de calendario (§3.3).
--
-- La hora de la plataforma es −06:00 fija, sin horario de verano (design §1.5): en SQL, `interval '6 hours'`.
-- El «ahora» sigue siendo `now() AT TIME ZONE 'UTC'` (decisión 2026-10-28 de SL-24).
--
-- `plan_inicio_ciclo` y `plan_inicio_ciclo_en_curso` dejan de usarse y se conservan: el `down.sql` repone
-- los cuerpos que las llaman.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- ─── 1. P3 (R33) ─────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_lista text;
BEGIN
  SELECT string_agg(x."id" || ' (' || x."nombre" || ')', ', ' ORDER BY x."id") INTO v_lista FROM (
    SELECT p."id", p."nombre" FROM "plan" p
     WHERE p."precio_anual" IS NOT NULL AND p."precio_anual" > p."precio_mensual" * 12
    UNION
    SELECT p."id", p."nombre" FROM "plan_cambio_programado" c JOIN "plan" p ON p."id" = c."plan_id"
     WHERE c."version" -> 'precio' -> 'anual' ->> 'tipo' = 'fijo'
       AND (c."version" -> 'precio' -> 'anual' ->> 'monto')::numeric > (c."version" -> 'precio' ->> 'mensual')::numeric * 12
  ) x;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'SLT-86: hay planes con un precio anual fijo mayor que el mensual × 12, que no caben como descuento anual: %', v_lista;
  END IF;
END
$$;

-- ─── 2. Tablas de plataforma (§1.1, §1.2) ─────────────────────────────────────────────────────────
-- Sin fila = sin descuento. Una forma o la otra, nunca las dos (R10).
CREATE TABLE "plan_descuento_periodo" (
    "plan_id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "porcentaje" DECIMAL(5,2),
    "monto" DECIMAL(12,2),

    CONSTRAINT "plan_descuento_periodo_pkey" PRIMARY KEY ("plan_id", "periodo"),
    CONSTRAINT "plan_descuento_periodo_periodo_check" CHECK ("periodo" IN ('quincenal', 'mensual', 'bimestral', 'anual')),
    CONSTRAINT "plan_descuento_periodo_porcentaje_check" CHECK ("porcentaje" > 0 AND "porcentaje" <= 100),
    CONSTRAINT "plan_descuento_periodo_monto_check" CHECK ("monto" >= 0),
    CONSTRAINT "plan_descuento_periodo_una_forma" CHECK (("porcentaje" IS NULL) <> ("monto" IS NULL))
);

ALTER TABLE "plan_descuento_periodo" ADD CONSTRAINT "plan_descuento_periodo_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `desde_at` = 00:00 de la fecha de efecto en UTC; `'-infinity'` = desde siempre. El costo de un período
-- que empieza en S usa la fila con el mayor `desde_at ≤ S` (R15): una lectura por PK.
CREATE TABLE "plan_precio_historial" (
    "plan_id" TEXT NOT NULL,
    "desde_at" TIMESTAMP(3) NOT NULL,
    "precio_mensual" DECIMAL(12,2),
    "descuentos" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "plan_precio_historial_pkey" PRIMARY KEY ("plan_id", "desde_at")
);

ALTER TABLE "plan_precio_historial" ADD CONSTRAINT "plan_precio_historial_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_descuento_periodo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_precio_historial" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan_descuento_periodo" FROM servi_app;
REVOKE ALL ON "plan_precio_historial" FROM servi_app;

-- ─── 3. El anual pasa a descuento del período anual (R33) ─────────────────────────────────────────
INSERT INTO "plan_descuento_periodo" ("plan_id", "periodo", "porcentaje", "monto")
SELECT p."id", 'anual', p."descuento_anual_pct", NULL FROM "plan" p WHERE p."descuento_anual_pct" IS NOT NULL
UNION ALL
SELECT p."id", 'anual', NULL, p."precio_mensual" * 12 - p."precio_anual" FROM "plan" p WHERE p."precio_anual" IS NOT NULL;

-- La versión pendiente tiene la forma de `PrecioPlan`: `anual` se va y entra `descuentos`. El porcentaje
-- conserva su texto; el monto sale en decimal exacto con dos decimales.
UPDATE "plan_cambio_programado" c
   SET "version" = jsonb_set(c."version", '{precio}',
         (c."version" -> 'precio') - 'anual' || jsonb_build_object('descuentos',
           CASE c."version" -> 'precio' -> 'anual' ->> 'tipo'
             WHEN 'descuento' THEN jsonb_build_object('anual', jsonb_build_object(
               'tipo', 'porcentaje', 'porcentaje', c."version" -> 'precio' -> 'anual' ->> 'porcentaje'))
             WHEN 'fijo' THEN jsonb_build_object('anual', jsonb_build_object(
               'tipo', 'monto',
               'monto', ((c."version" -> 'precio' ->> 'mensual')::numeric * 12
                         - (c."version" -> 'precio' -> 'anual' ->> 'monto')::numeric)::numeric(12, 2)::text))
             ELSE '{}'::jsonb
           END))
 WHERE c."version" -> 'precio' ->> 'tipo' = 'monto';

-- ─── 4. Historial de precio: una fila «desde siempre» por plan (§1.2) ─────────────────────────────
INSERT INTO "plan_precio_historial" ("plan_id", "desde_at", "precio_mensual", "descuentos")
SELECT p."id", '-infinity'::timestamp, p."precio_mensual",
       COALESCE((SELECT jsonb_object_agg(d."periodo",
                          CASE WHEN d."porcentaje" IS NOT NULL
                               THEN jsonb_build_object('tipo', 'porcentaje', 'porcentaje', d."porcentaje"::text)
                               ELSE jsonb_build_object('tipo', 'monto', 'monto', d."monto"::text) END)
                   FROM "plan_descuento_periodo" d WHERE d."plan_id" = p."id"), '{}'::jsonb)
  FROM "plan" p;

-- ─── 5. Sin tope de órdenes (R34) ─────────────────────────────────────────────────────────────────
INSERT INTO "plan_rastro" ("id", "plan_id", "plan_nombre", "accion", "cambios", "actor_usuario_id", "actor_nombre")
SELECT gen_random_uuid()::text, p."id", p."nombre", 'editado',
       jsonb_build_object('tope_ordenes_ciclo', jsonb_build_object('antes', p."tope_ordenes_ciclo"::text, 'despues', NULL)),
       'sistema', 'Sistema (migración SLT-86)'
  FROM "plan" p WHERE p."tope_ordenes_ciclo" IS NOT NULL;

UPDATE "plan_cambio_programado" SET "version" = "version" #- '{topes,ordenesPorCiclo}'
 WHERE "version" -> 'topes' ? 'ordenesPorCiclo';

DROP TRIGGER "plan_tope_ordenes" ON "orden";
DROP FUNCTION plan_tope_ordenes();
DROP FUNCTION plan_cupo_ordenes(text);
ALTER TABLE "plan" DROP COLUMN "tope_ordenes_ciclo";

-- ─── 6. Sin anual en `plan` (R33) ─────────────────────────────────────────────────────────────────
ALTER TABLE "plan" DROP CONSTRAINT "plan_precio_forma";
ALTER TABLE "plan" DROP COLUMN "precio_anual";
ALTER TABLE "plan" DROP COLUMN "descuento_anual_pct";

-- ─── 7. `organizacion` (§1.3) ─────────────────────────────────────────────────────────────────────
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_tipo_cobro_check";
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_tipo_cobro_check"
  CHECK ("plan_tipo_cobro" IN ('quincenal', 'mensual', 'bimestral', 'anual'));

-- El cambio pendiente de la empresa (R16–R21). Puede existir con `plan_id` NULL: una primera asignación con
-- fecha futura (P4 = a). FK NO ACTION por la razón de `organizacion_plan_id_fkey` (20261028130000).
ALTER TABLE "organizacion" ADD COLUMN "plan_cambio_id" TEXT;
ALTER TABLE "organizacion" ADD COLUMN "plan_cambio_plan_id" TEXT;
ALTER TABLE "organizacion" ADD COLUMN "plan_cambio_tipo_cobro" TEXT;
ALTER TABLE "organizacion" ADD COLUMN "plan_cambio_desde_at" TIMESTAMP(3);
ALTER TABLE "organizacion" ADD COLUMN "plan_cambio_actor_id" TEXT;
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_cambio_plan_id_fkey"
    FOREIGN KEY ("plan_cambio_plan_id") REFERENCES "plan"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_cambio_tipo_cobro_check"
  CHECK ("plan_cambio_tipo_cobro" IN ('quincenal', 'mensual', 'bimestral', 'anual'));
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_cambio_completo"
  CHECK (num_nulls("plan_cambio_id", "plan_cambio_plan_id", "plan_cambio_tipo_cobro", "plan_cambio_desde_at",
                   "plan_cambio_actor_id") IN (0, 5));

-- Antes de mover la entrada: el CHECK del ciclo corto exige `corto < ancla`, y la entrada nueva puede ser
-- anterior a un ancla futura.
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_ciclo_corto_check";
ALTER TABLE "organizacion" DROP COLUMN "plan_ciclo_corto_desde_at";

-- R35: plan y tipo se conservan; la entrada pasa a las 00:00 de hoy en la plataforma.
UPDATE "organizacion"
   SET "plan_ciclo_ancla_at" = date_trunc('day', (now() AT TIME ZONE 'UTC') - interval '6 hours') + interval '6 hours'
 WHERE "plan_id" IS NOT NULL;

-- ─── 8. El período de calendario (§3.1) ──────────────────────────────────────────────────────────
-- R4: inicio del período de calendario que contiene `p_ahora` (UTC sin zona), con bordes a las 00:00 de la
-- plataforma. Gemela TS: `lib/planes/ciclo.ts > inicioDelPeriodoCalendario` (R6).
CREATE FUNCTION plan_inicio_periodo_calendario(p_tipo text, p_ahora timestamp) RETURNS timestamp
  LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_local timestamp := p_ahora - interval '6 hours';
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('quincenal', 'mensual', 'bimestral', 'anual') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'plan_inicio_periodo_calendario: tipo de cobro desconocido: ' || COALESCE(p_tipo, 'NULL');
  END IF;
  RETURN CASE p_tipo
    WHEN 'quincenal' THEN date_trunc('month', v_local)
                          + (CASE WHEN extract(day FROM v_local) >= 16 THEN 15 ELSE 0 END) * interval '1 day'
    WHEN 'mensual' THEN date_trunc('month', v_local)
    WHEN 'bimestral' THEN date_trunc('year', v_local)
                          + ((extract(month FROM v_local)::integer - 1) / 2 * 2) * interval '1 month'
    ELSE date_trunc('year', v_local)
  END + interval '6 hours';
END $$;
REVOKE EXECUTE ON FUNCTION plan_inicio_periodo_calendario(text, timestamp) FROM PUBLIC;

-- El fin es el inicio del siguiente, calculado en la hora local: la segunda quincena acaba el último día
-- del mes, sea de 28 o de 31 días. Gemela TS: `finDelPeriodoCalendario`.
CREATE FUNCTION plan_fin_periodo_calendario(p_tipo text, p_ahora timestamp) RETURNS timestamp
  LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_inicio timestamp := plan_inicio_periodo_calendario(p_tipo, p_ahora) - interval '6 hours';
BEGIN
  RETURN CASE p_tipo
    WHEN 'quincenal' THEN CASE WHEN extract(day FROM v_inicio) = 1 THEN v_inicio + interval '15 days'
                               ELSE date_trunc('month', v_inicio) + interval '1 month' END
    WHEN 'mensual' THEN v_inicio + interval '1 month'
    WHEN 'bimestral' THEN v_inicio + interval '2 months'
    ELSE v_inicio + interval '1 year'
  END + interval '6 hours';
END $$;
REVOKE EXECUTE ON FUNCTION plan_fin_periodo_calendario(text, timestamp) FROM PUBLIC;

-- R5, R6: el inicio del período en curso de una empresa. Si la entrada cae dentro del período de
-- calendario, el período en curso es el tramo desde la entrada; el fin no cambia.
CREATE FUNCTION plan_inicio_ciclo_de(p_entrada timestamp, p_tipo text, p_ahora timestamp) RETURNS timestamp
  LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  RETURN GREATEST(p_entrada, plan_inicio_periodo_calendario(p_tipo, p_ahora));
END $$;
REVOKE EXECUTE ON FUNCTION plan_inicio_ciclo_de(timestamp, text, timestamp) FROM PUBLIC;

-- Origen: 20261104150200 (SLT-83). Cambios (§3.3; R7, R15, R28, R32):
--   · `ciclo_inicio` = `plan_inicio_ciclo_de(entrada, tipo, ahora)` y `ciclo_fin` nuevo; `uso.ordenes` y
--     `cobro_ciclo` cuentan desde ese inicio (SLT-83 R23–R24 pasan a período de calendario);
--   · ganan `descuentos` (los vigentes), `precio_del_periodo` (la fila del historial con el mayor
--     `desde_at ≤ ciclo_inicio`) y `cambio_empresa` (`{plan_nombre, tipo_cobro, desde}`, SIN actor);
--   · pierden `precio_anual`, `descuento_anual_pct`, `tope_ordenes_ciclo` y `ciclo_corto_desde`.
-- El contexto (`42501`), el `search_path`, el REVOKE y el GRANT a `servi_app` no cambian.
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
      'descuentos', COALESCE((SELECT jsonb_object_agg(d."periodo",
                                CASE WHEN d."porcentaje" IS NOT NULL
                                     THEN jsonb_build_object('tipo', 'porcentaje', 'porcentaje', d."porcentaje"::text)
                                     ELSE jsonb_build_object('tipo', 'monto', 'monto', d."monto"::text) END)
                                FROM "plan_descuento_periodo" d WHERE d."plan_id" = p."id"), '{}'::jsonb),
      'precio_del_periodo', (SELECT jsonb_build_object('precio_mensual', h."precio_mensual"::text, 'descuentos', h."descuentos")
                               FROM "plan_precio_historial" h
                              WHERE h."plan_id" = p."id" AND h."desde_at" <= ci."inicio"
                              ORDER BY h."desde_at" DESC LIMIT 1),
      'costo_por_orden', p."costo_por_orden"::text,
      'costo_por_orden_pct', p."costo_por_orden_pct"::text,
      'costo_por_orden_minimo', p."costo_por_orden_minimo"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente", 'porcentaje', t."porcentaje"::text, 'minimo', t."minimo"::text) FROM cobro_plataforma_tarifa_de(o."id") t),
      'cobro_ciclo', (SELECT jsonb_build_object('cobrado', c."cobrado"::text, 'pendientes', c."pendientes")
                        FROM plan_cobro_del_ciclo(o."id", ci."inicio") c),
      'tipo_cobro', o."plan_tipo_cobro",
      'tope_api_keys', p."tope_api_keys",
      'topes_rol', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb),
      'modulos', COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb),
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
      'cambio', (SELECT jsonb_build_object('vigente_desde', c."vigente_desde", 'version', c."version")
                   FROM "plan_cambio_programado" c WHERE c."plan_id" = p."id"),
      -- El pendiente de la empresa, sin `plan_cambio_actor_id` (R32).
      'cambio_empresa', CASE WHEN o."plan_cambio_id" IS NULL THEN NULL
                             ELSE jsonb_build_object(
                               'plan_nombre', (SELECT pc."nombre" FROM "plan" pc WHERE pc."id" = o."plan_cambio_plan_id"),
                               'tipo_cobro', o."plan_cambio_tipo_cobro",
                               'desde', o."plan_cambio_desde_at") END)
      FROM "organizacion" o
      JOIN "plan" p ON p."id" = o."plan_id"
     CROSS JOIN LATERAL (SELECT plan_inicio_ciclo_de(o."plan_ciclo_ancla_at", o."plan_tipo_cobro", v_ahora) AS "inicio") ci
     WHERE o."id" = p_organizacion_id);
END $$;
