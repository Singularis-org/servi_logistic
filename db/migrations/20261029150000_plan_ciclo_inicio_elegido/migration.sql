-- SLT-58 (design §11.2) — inicio del ciclo elegido en la primera asignación (R29–R42).
--
-- Aditiva: una columna NULL en `organizacion`, su CHECK, una función nueva y el `CREATE OR REPLACE`
-- de las tres funciones que calculan el ciclo en curso con el ancla de una empresa. Nada de
-- 20261028130200 ni de 20261029120000 se edita (R41); `down.sql` devuelve sus cuerpos literales.
--
-- Una sola definición del ciclo en curso: los triggers, el cupo de la carga y «Mi plan» llaman a
-- `plan_inicio_ciclo_en_curso`. `plan_inicio_ciclo` (SL-24 R20) no se toca: la envoltura solo añade
-- el caso previo «antes del ancla».
--
-- Las empresas que ya tienen plan quedan con la columna NULL y un ancla pasada: la envoltura les da
-- exactamente `plan_inicio_ciclo(ancla, ahora)` y cuentan igual que antes (R41).
--
-- Multi-empresa: no hay tabla nueva. `organizacion` ya es de solo lectura para `servi_app` (SL-24 R8);
-- la columna hereda esa protección. El «ahora» sigue siendo `now() AT TIME ZONE 'UTC'` (decisión
-- 2026-10-28 de SL-24, ver 20261028130200).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- Dónde empieza el ciclo corto (R34): el instante de la asignación cuando el ancla elegida es futura.
-- NULL en todo lo demás, incluidas todas las empresas que ya tienen plan (R41: cuentan igual).
ALTER TABLE "organizacion" ADD COLUMN "plan_ciclo_corto_desde_at" TIMESTAMP(3);
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_ciclo_corto_check"
  CHECK ("plan_ciclo_corto_desde_at" IS NULL
         OR ("plan_ciclo_ancla_at" IS NOT NULL AND "plan_ciclo_corto_desde_at" < "plan_ciclo_ancla_at"));

-- El inicio del ciclo en curso, con el ciclo corto (R33, R34). Antes del ancla, el ciclo corto; sin
-- ciclo corto guardado, el ancla (= plan_inicio_ciclo, R41). Desde el ancla, la regla de SL-24 R20.
-- Gemela TS: lib/planes/ciclo.ts > inicioDelCicloEnCurso (R35).
CREATE FUNCTION plan_inicio_ciclo_en_curso(p_corto_desde timestamp, p_ancla timestamp, p_ahora timestamp)
  RETURNS timestamp LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_ahora < p_ancla THEN
    RETURN COALESCE(p_corto_desde, p_ancla);
  END IF;
  RETURN plan_inicio_ciclo(p_ancla, p_ahora);
END $$;
REVOKE EXECUTE ON FUNCTION plan_inicio_ciclo_en_curso(timestamp, timestamp, timestamp) FROM PUBLIC;

-- CREATE OR REPLACE conserva dueño y privilegios (los GRANT de servi_app siguen). Cada cuerpo es el
-- de su migración de origen con un solo cambio: el ciclo sale de `plan_inicio_ciclo_en_curso`.

-- Origen: 20261028130200 (SL-24 §4.3). Lee también "plan_ciclo_corto_desde_at".
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

-- Origen: 20261028130200 (SL-24 §6.1).
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

-- Origen: 20261029120000 (SLT-58 §2). Añade 'ciclo_corto_desde' (R40): NULL fuera del ciclo corto.
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
      'ciclo_inicio', plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora),
      'ciclo_ancla', o."plan_ciclo_ancla_at",
      'ciclo_corto_desde', o."plan_ciclo_corto_desde_at",
      'uso', jsonb_build_object(
        'ordenes', plan_uso_ordenes(o."id", plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", v_ahora)),
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
