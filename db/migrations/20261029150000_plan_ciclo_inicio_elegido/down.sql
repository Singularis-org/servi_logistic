-- SLT-58 — revierte 20261029150000_plan_ciclo_inicio_elegido (design §11.2, R41).
--
-- Las tres funciones vuelven a su cuerpo de origen, copiado LITERALMENTE de 20261028130200
-- (`plan_tope_ordenes`, `plan_cupo_ordenes`) y de 20261029120000 (`plan_de_la_empresa`); solo cambia
-- `CREATE` por `CREATE OR REPLACE`, que conserva dueño y privilegios (los GRANT de servi_app siguen).
-- Primero las funciones (dejan de llamar a la envoltura) y después la envoltura, el CHECK y la columna.
--
-- Bajar pierde el inicio de los ciclos cortos en curso: esas empresas pasan a contar desde el ancla
-- futura (uso 0) hasta su fecha. Es la reversión de una columna que esta misma migración añade, no
-- una migración destructiva del `up` (precedente: los `down.sql` de SL-24 que quitan
-- `plan_ciclo_ancla_at`).

-- Origen: 20261028130200_plan_topes_triggers.
CREATE OR REPLACE FUNCTION plan_tope_ordenes() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org     text;
  v_plan    text;
  v_ancla   timestamp;
  v_maximo  integer;
  v_total   integer;
  v_pedidas integer;
BEGIN
  FOR v_org IN SELECT DISTINCT n."organizacion_id" FROM "nuevas" n ORDER BY 1 LOOP
    SELECT o."plan_id", o."plan_ciclo_ancla_at" INTO v_plan, v_ancla
      FROM "organizacion" o WHERE o."id" = v_org FOR SHARE;
    CONTINUE WHEN v_plan IS NULL;
    SELECT p."tope_ordenes_ciclo" INTO v_maximo FROM "plan" p WHERE p."id" = v_plan FOR SHARE;
    CONTINUE WHEN v_maximo IS NULL;
    PERFORM pg_advisory_xact_lock(24, hashtext(v_org));
    v_total := plan_uso_ordenes(v_org, plan_inicio_ciclo(v_ancla, now() AT TIME ZONE 'UTC'));
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

-- Origen: 20261028130200_plan_topes_triggers.
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
           plan_uso_ordenes(o."id", plan_inicio_ciclo(o."plan_ciclo_ancla_at", (now() AT TIME ZONE 'UTC')))
      FROM "organizacion" o
      JOIN "plan" p ON p."id" = o."plan_id"
     WHERE o."id" = p_organizacion_id
       AND p."tope_ordenes_ciclo" IS NOT NULL;
END $$;

-- Origen: 20261029120000_plan_de_la_empresa.
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

DROP FUNCTION plan_inicio_ciclo_en_curso(timestamp, timestamp, timestamp);
ALTER TABLE "organizacion" DROP CONSTRAINT "organizacion_plan_ciclo_corto_check";
ALTER TABLE "organizacion" DROP COLUMN "plan_ciclo_corto_desde_at";
