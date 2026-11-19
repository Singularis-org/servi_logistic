-- DOWN de SLT-214 (design §1.3) — quita los beneficios de texto de los planes.
--
-- PIERDE LOS BENEFICIOS A SABIENDAS: el esquema de antes no tiene dónde guardarlos. Se pierden los del plan
-- (la tabla), los de los borradores (el paso `beneficios`) y los de las versiones programadas y propias de cada
-- empresa (la clave `beneficios`). La clave se quita porque `versionPlanSchema` de antes es `.strict()` y
-- rechazaría la versión al aplicarla.
--
-- En orden inverso a la subida: la función primero (deja de leer la tabla), luego el borrador y las versiones,
-- y la tabla al final.

BEGIN;

-- Origen: 20261114120000_plan_cambio_por_empresa, LITERAL.
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
      -- SLT-128 (R12): la fecha es SU recepción, no F; si ya lo recibió, o quedó «no aplicada» (R28), no hay
      -- cambio que mostrar.
      'cambio', (SELECT jsonb_build_object('vigente_desde', r."recibe_at", 'version', c."version")
                   FROM "plan_cambio_programado" c
                   JOIN "plan_cambio_recepcion" r ON r."cambio_id" = c."id" AND r."empresa_id" = o."id"
                  WHERE c."plan_id" = p."id" AND r."recibido_at" IS NULL AND r."no_aplicada_at" IS NULL),
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

UPDATE "plan_borrador" SET "pasos" = "pasos" - 'beneficios' WHERE "pasos" ? 'beneficios';
ALTER TABLE "plan_borrador" DROP CONSTRAINT "plan_borrador_pasos_conocidos";
ALTER TABLE "plan_borrador" ADD CONSTRAINT "plan_borrador_pasos_conocidos"
  CHECK (("pasos" - ARRAY['general','precio','orden','topes','modulos','vigencia']) = '{}'::jsonb);

UPDATE "plan_cambio_programado" SET "version" = "version" - 'beneficios' WHERE "version" ? 'beneficios';
UPDATE "plan_version_empresa" SET "version" = "version" - 'beneficios' WHERE "version" ? 'beneficios';

DROP TABLE "plan_beneficio";

COMMIT;
