-- SLT-83 — revierte 20261104150200_cobro_plataforma_porcentual_funciones (design §2.3). Va ANTES de los
-- down de 20261104150100 y 20261104150000 (orden inverso: M3 → M2 → M1).
--
-- Los cuerpos que vuelven están COPIADOS LITERALMENTE de su migración de origen (el texto entre `$$` es el
-- mismo byte a byte; `migracion-slt83-ida-y-vuelta.test.ts` compara el `md5` de `pg_get_functiondef`
-- antes de subir y tras bajar). `CREATE OR REPLACE` conserva dueño, privilegios y triggers.
--
-- Este down NO se niega solo: si quedan órdenes porcentuales, se niega el de 20261104150100, que va
-- justo después (R27). Bajado este, una orden nueva vuelve a cobrarse con la regla de SLT-66.

DROP TRIGGER "cobro_plataforma_al_cambiar_estado" ON "orden";
DROP FUNCTION cobro_plataforma_al_cambiar_estado();

-- Origen: 20261104130000_plan_sin_negociable_y_tipo_cobro (ajuste planes-custom).
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
      'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente") FROM cobro_plataforma_tarifa_de(o."id") t),
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

-- Origen: 20261023130200_cobro_plataforma_triggers_orden (SL-40). `CREATE OR REPLACE` en vez del
-- `CREATE` de origen; el cuerpo es el mismo.
CREATE OR REPLACE FUNCTION cobro_plataforma_al_cambiar_borrado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ultimo "cobro_plataforma_movimiento"%ROWTYPE;
BEGIN
  SELECT m.* INTO v_ultimo FROM "cobro_plataforma_movimiento" m
   WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."id"
   ORDER BY m."secuencia" DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NEW."deleted_at" IS NOT NULL AND v_ultimo."tipo" = 'cargo' THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", v_ultimo."secuencia" + 1, 'reverso',
            v_ultimo."fuente", v_ultimo."monto", NEW."deleted_at");
  ELSIF NEW."deleted_at" IS NULL AND v_ultimo."tipo" = 'reverso' THEN
    INSERT INTO "cobro_plataforma_movimiento"
      ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
    VALUES (gen_random_uuid()::text, NEW."organizacion_id", NEW."id", v_ultimo."secuencia" + 1, 'cargo',
            v_ultimo."fuente", v_ultimo."monto", now());
  END IF;
  RETURN NULL;
END $$;

-- Origen: 20261031140200_plan_costeo_funciones (SLT-66).
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

-- Origen: 20261031140200_plan_costeo_funciones (SLT-66). DROP y CREATE: vuelve la firma de dos columnas.
DROP FUNCTION cobro_plataforma_tarifa_de(text);
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

DROP FUNCTION plan_cobro_del_ciclo(text, timestamp);
DROP FUNCTION cobro_plataforma_porcentual_conciliar(text);
DROP FUNCTION cobro_plataforma_importe_porcentual(numeric, numeric, numeric);
DROP FUNCTION orden_estado_es_final(text);
