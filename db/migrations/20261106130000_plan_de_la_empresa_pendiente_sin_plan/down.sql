-- SLT-86 — revierte 20261106130000: `plan_de_la_empresa` vuelve a devolver NULL a una empresa sin plan,
-- aunque tenga una primera asignación pendiente. El cuerpo está COPIADO LITERALMENTE de su migración de
-- origen, 20261106120000_plan_periodo_facturacion (lo comprueba plan-ciclo-periodo.test.ts). `CREATE OR
-- REPLACE` conserva dueño, REVOKE y el GRANT a `servi_app`. Sin pérdidas: la función no guarda datos.
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
