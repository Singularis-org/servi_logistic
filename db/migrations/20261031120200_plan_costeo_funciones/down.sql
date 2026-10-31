-- DOWN de SLT-66 (design §2.3) — devuelve `cobro_plataforma_al_crear_orden` y `plan_de_la_empresa` a
-- su última versión anterior a la ficha y suelta `cobro_plataforma_tarifa_de`.
--
-- Los dos cuerpos están COPIADOS LITERALMENTE de su migración de origen (el texto entre `$$` es el
-- mismo byte a byte; `migracion-slt66-ida-y-vuelta.test.ts` compara el `md5` de `pg_get_functiondef`
-- antes de M1 y tras bajar). `CREATE OR REPLACE` conserva dueño, privilegios y los triggers.
--
-- Tras bajar, una orden nueva se carga con la regla de SL-40, sin el escalón del plan (R25).
--
-- ORDEN: va después del down de 20261031120300 y antes del de 20261031120100, que quita el valor
-- `'plan'` que nombra el cuerpo de la función que se suelta aquí.

-- Origen: 20261024120000_cobro_plataforma_blindaje_orden (SL-40, review B2).
CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_monto  numeric(12, 2);
  v_fuente cobro_plataforma_fuente;
BEGIN
  SELECT o."cobro_plataforma_por_orden" INTO v_monto FROM "organizacion" o WHERE o."id" = NEW."organizacion_id";
  IF v_monto IS NOT NULL THEN
    v_fuente := 'empresa';
  ELSE
    SELECT t."monto" INTO v_monto FROM "cobro_plataforma_tarifa" t WHERE t."id";
    IF v_monto IS NOT NULL THEN
      v_fuente := 'global';
    ELSE
      v_monto := 0;
      v_fuente := 'sin_configurar';
    END IF;
  END IF;

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

-- Origen: 20261029150000_plan_ciclo_inicio_elegido (SLT-58 §11.2).
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

DROP FUNCTION cobro_plataforma_tarifa_de(text);
