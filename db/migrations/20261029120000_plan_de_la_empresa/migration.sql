-- SLT-58 (design §2) — «Mi plan»: la empresa lee SU plan y su consumo, por una sola función.
--
-- Ninguna tabla ni columna nueva. Las tablas `plan*` siguen con `REVOKE ALL` para `servi_app` (SL-24
-- R8); esta función es la segunda y última que `servi_app` puede llamar (la otra es
-- `plan_cupo_ordenes`), y copia sus tres defensas: `search_path` fijo, EXECUTE revocado a PUBLIC y la
-- empresa obligada a ser la del contexto (42501). Es SECURITY DEFINER porque lee tablas de plataforma.
--
-- STABLE: no escribe (R25). Lee `now()`, por eso no es IMMUTABLE.
--
-- El uso sale de las mismas `plan_uso_*` y `plan_inicio_ciclo` que los triggers de los topes (una sola
-- definición de «uso», SL-24 §4.2): lo que pinta «Mi plan» es exactamente lo que frena el alta (R2).
-- El «ahora» es `now() AT TIME ZONE 'UTC'` (decisión 2026-10-28 de SL-24, ver 20261028130200).
--
-- Empresa sin plan: el SELECT no devuelve fila y la función devuelve NULL (R6).
-- Del cambio programado solo la fecha y la versión: NUNCA `avisos_al_programar` (nombra otras
-- empresas) ni el actor (R9).
-- Los roles van con la etiqueta de Postgres (`'Admin Tienda'` como clave `admin_tienda`); el
-- repositorio la mapea.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
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
      'precio_negociable', p."precio_negociable",
      'precio_mensual', p."precio_mensual"::text,
      'precio_anual', p."precio_anual"::text,
      'descuento_anual_pct', p."descuento_anual_pct"::text,
      'tope_ordenes_ciclo', p."tope_ordenes_ciclo",
      'tope_api_keys', p."tope_api_keys",
      'topes_rol', COALESCE((SELECT jsonb_agg(jsonb_build_object('rol', t."rol", 'maximo', t."maximo"))
                               FROM "plan_tope_rol" t WHERE t."plan_id" = p."id"), '[]'::jsonb),
      'modulos', COALESCE((SELECT jsonb_agg(m."modulo") FROM "plan_modulo" m WHERE m."plan_id" = p."id"), '[]'::jsonb),
      'ciclo_inicio', plan_inicio_ciclo(o."plan_ciclo_ancla_at", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", plan_inicio_ciclo(o."plan_ciclo_ancla_at", v_ahora)),
        'api_keys', plan_uso_api_keys(o."id"),
        'maestro', plan_uso_rol(o."id", 'maestro'::rol_value),
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

REVOKE EXECUTE ON FUNCTION plan_de_la_empresa(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plan_de_la_empresa(text) TO servi_app;
