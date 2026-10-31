-- SLT-66 (design §2.3, §3) — la tarifa vigente con el escalón del plan, en UNA sola función.
--
-- `cobro_plataforma_tarifa_de` es la única definición de «cuánto se cobra por la próxima orden de esta
-- empresa» (R12): excepción > costo por orden del plan > global > 0. La usan el trigger de alta de SL-40
-- y `plan_de_la_empresa`, y el superadmin la lee como dueño. Así lo que la pantalla dice es lo que el
-- próximo cargo usará (§3.2).
--
-- Los dos `CREATE OR REPLACE` copian LITERALMENTE el cuerpo de su última versión
-- (`20261024120000_cobro_plataforma_blindaje_orden` y `20261029150000_plan_ciclo_inicio_elegido`),
-- salvo lo que se nombra aquí. El reviewer los compara línea a línea; `down.sql` devuelve los de origen.
-- `CREATE OR REPLACE` conserva dueño y privilegios: el `GRANT` de `plan_de_la_empresa` a `servi_app`
-- sigue, y los triggers no se tocan.
--
-- Concurrencia (§3.3): la función lee `organizacion` y `plan` sin cerrojo. Bajo READ COMMITTED una orden
-- que coincide con una edición del plan se carga con la versión confirmada en ese instante, y el cargo
-- queda congelado (R15). No se añade cerrojo para no alargar los de SL-24.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- R12–R14. Sin `GRANT` a `servi_app` (§11, alternativa 7): la empresa solo ve su número por la lectura
-- acotada (`plan_de_la_empresa`, R22). No mira `archivado_at` (R13: un plan archivado que la empresa
-- conserva sigue cobrando) ni el descuento ni la forma del costo base (R10, R14). LEFT JOIN: una empresa
-- sin plan conserva su excepción y el global.
CREATE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)
  RETURNS TABLE ("monto" numeric(12, 2), "fuente" cobro_plataforma_fuente)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_excepcion numeric(12, 2);
  v_plan      numeric(12, 2);
  v_global    numeric(12, 2);
BEGIN
  SELECT o."cobro_plataforma_por_orden", p."costo_por_orden"
    INTO v_excepcion, v_plan
    FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
   WHERE o."id" = p_organizacion_id;
  IF v_excepcion IS NOT NULL THEN RETURN QUERY SELECT v_excepcion, 'empresa'::cobro_plataforma_fuente; RETURN; END IF;
  IF v_plan      IS NOT NULL THEN RETURN QUERY SELECT v_plan, 'plan'::cobro_plataforma_fuente;         RETURN; END IF;
  SELECT t."monto" INTO v_global FROM "cobro_plataforma_tarifa" t WHERE t."id";
  IF v_global    IS NOT NULL THEN RETURN QUERY SELECT v_global, 'global'::cobro_plataforma_fuente;     RETURN; END IF;
  RETURN QUERY SELECT 0::numeric(12,2), 'sin_configurar'::cobro_plataforma_fuente;
END $$;
REVOKE EXECUTE ON FUNCTION cobro_plataforma_tarifa_de(text) FROM PUBLIC;

-- Origen: 20261024120000 (SL-40, review B2). Un solo cambio: el bloque que elegía `v_monto` y
-- `v_fuente` pasa a ser la función de arriba. Los dos INSERT, el `now()` y el `RETURN NULL`, iguales.
CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monto  numeric(12, 2);
  v_fuente cobro_plataforma_fuente;
BEGIN
  SELECT t."monto", t."fuente" INTO v_monto, v_fuente FROM cobro_plataforma_tarifa_de(NEW."organizacion_id") t;

  INSERT INTO "cobro_plataforma_movimiento"
    ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
  VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 1, 'cargo', v_fuente, v_monto, now());

  IF NEW."deleted_at" IS NOT NULL THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", 2, 'reverso', v_fuente, v_monto, NEW."deleted_at");
  END IF;
  RETURN NULL;
END $$;

-- Origen: 20261029150000 (SLT-58 §11.2). Tres cambios: sin `uso.maestro` (R5); `costo_por_orden`, el
-- del plan (lo usa la lectura del superadmin y la nota de P1); y `costo_vigente`, el de la función de
-- arriba (R18, P1). El contexto (`42501`), el `search_path`, el REVOKE y el GRANT no cambian (R22).
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
      'costo_por_orden', p."costo_por_orden"::text,
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente") FROM cobro_plataforma_tarifa_de(o."id") t),
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
