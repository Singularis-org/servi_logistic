-- DOWN de SLT-128 (design §8; R25) — vuelve a una sola versión por plan.
--
-- SE NIEGA A BAJAR, sin tocar nada, si alguna empresa corre una versión propia (plan partido): quitar las
-- tablas la dejaría en la versión del plan sin aviso. Sin ninguna, deja la base como estaba: las ocho funciones
-- con su definición de antes, COPIADA LITERALMENTE de su última migración (la que nombra cada bloque), y sin
-- las dos funciones ni las dos tablas nuevas. Los pendientes siguen en `plan_cambio_programado` y el código de
-- antes los aplica a todas en su fecha; sus recepciones se van con la tabla.
--
-- `CREATE OR REPLACE` conserva dueño, REVOKE y GRANT de cada función.

BEGIN;

-- Frena recepciones y promociones entre la comprobación y el DROP TABLE.
LOCK TABLE "plan_version_empresa", "plan_cambio_recepcion" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "plan_version_empresa") THEN
    RAISE EXCEPTION 'SLT-128 down: alguna empresa corre una versión propia de su plan (cambio a medias); bajar la dejaría en la versión del plan sin aviso';
  END IF;
END $$;

-- Origen: 20261028130200_plan_topes_triggers.
CREATE OR REPLACE FUNCTION plan_tope_usuario() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan   text;
  v_rol    rol_value;
  v_maximo integer;
  v_total  integer;
BEGIN
  SELECT o."plan_id" INTO v_plan FROM "organizacion" o WHERE o."id" = NEW."organizacion_id" FOR SHARE;
  IF v_plan IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM "plan" p WHERE p."id" = v_plan FOR SHARE;
  SELECT r."value" INTO v_rol FROM "rol" r WHERE r."id" = NEW."rol_id";
  SELECT t."maximo" INTO v_maximo FROM "plan_tope_rol" t WHERE t."plan_id" = v_plan AND t."rol" = v_rol;
  IF v_maximo IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(24, hashtext(NEW."organizacion_id"));
  v_total := plan_uso_rol(NEW."organizacion_id", v_rol);
  IF v_total > v_maximo THEN
    RAISE EXCEPTION USING ERRCODE = 'SL024',
      MESSAGE = 'tope_plan ' || jsonb_build_object(
        'tope', 'rol',
        'rol', CASE WHEN v_rol = 'Admin Tienda' THEN 'adminTienda' ELSE v_rol::text END,
        'maximo', v_maximo, 'usados', v_total - 1, 'pedidas', 1)::text;
  END IF;
  RETURN NULL;
END $$;

-- Origen: 20261028130200_plan_topes_triggers.
CREATE OR REPLACE FUNCTION plan_tope_api_key() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan   text;
  v_maximo integer;
  v_total  integer;
BEGIN
  SELECT o."plan_id" INTO v_plan FROM "organizacion" o WHERE o."id" = NEW."organizacion_id" FOR SHARE;
  IF v_plan IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT p."tope_api_keys" INTO v_maximo FROM "plan" p WHERE p."id" = v_plan FOR SHARE;
  IF v_maximo IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(24, hashtext(NEW."organizacion_id"));
  v_total := plan_uso_api_keys(NEW."organizacion_id");
  IF v_total > v_maximo THEN
    RAISE EXCEPTION USING ERRCODE = 'SL024',
      MESSAGE = 'tope_plan ' || jsonb_build_object(
        'tope', 'api_keys', 'maximo', v_maximo, 'usados', v_total - 1, 'pedidas', 1)::text;
  END IF;
  RETURN NULL;
END $$;

-- Origen: 20261113120000_cobro_plataforma_sin_valor_empresa.
CREATE OR REPLACE FUNCTION cobro_plataforma_tarifa_de(p_organizacion_id text)
  RETURNS TABLE ("monto" numeric(12, 2), "fuente" cobro_plataforma_fuente, "porcentaje" numeric(5, 2), "minimo" numeric(12, 2))
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_plan      numeric(12, 2);
  v_pct       numeric(5, 2);
  v_minimo    numeric(12, 2);
  v_global    numeric(12, 2);
BEGIN
  SELECT p."costo_por_orden", p."costo_por_orden_pct", p."costo_por_orden_minimo"
    INTO v_plan, v_pct, v_minimo
    FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
   WHERE o."id" = p_organizacion_id;
  IF v_pct       IS NOT NULL THEN RETURN QUERY SELECT NULL::numeric(12,2), 'plan'::cobro_plataforma_fuente, v_pct, v_minimo;          RETURN; END IF;
  IF v_plan      IS NOT NULL THEN RETURN QUERY SELECT v_plan, 'plan'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);     RETURN; END IF;
  SELECT t."monto" INTO v_global FROM "cobro_plataforma_tarifa" t WHERE t."id";
  IF v_global    IS NOT NULL THEN RETURN QUERY SELECT v_global, 'global'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2); RETURN; END IF;
  RETURN QUERY SELECT 0::numeric(12,2), 'sin_configurar'::cobro_plataforma_fuente, NULL::numeric(5,2), NULL::numeric(12,2);
END $$;

-- Origen: 20261106130000_plan_de_la_empresa_pendiente_sin_plan.
CREATE OR REPLACE FUNCTION plan_de_la_empresa(p_organizacion_id text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_ahora    timestamp := now() AT TIME ZONE 'UTC';
  v_plan     jsonb;
BEGIN
  IF v_contexto IS NULL OR v_contexto = '' OR p_organizacion_id IS DISTINCT FROM v_contexto THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'plan_de_la_empresa: solo se lee el plan de la empresa del contexto';
  END IF;
  v_plan := (
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

-- Origen: 20261111130100_factura_plataforma.
CREATE OR REPLACE FUNCTION factura_plataforma_abrir(p_org text, p_desde timestamp) RETURNS "factura_plataforma"
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
BEGIN
  INSERT INTO "factura_plataforma"
    ("organizacion_id", "estado", "desde_at", "periodicidad", "plan_id", "plan_nombre", "tipo_cobro")
  SELECT o."id", 'en_curso', p_desde,
         CASE WHEN o."plan_id" IS NOT NULL THEN p."periodicidad_ordenes" ELSE 'quincenal' END,
         o."plan_id", p."nombre",
         CASE WHEN o."plan_id" IS NOT NULL THEN o."plan_tipo_cobro" END
    FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
   WHERE o."id" = p_org
  RETURNING * INTO v_f;
  IF v_f."id" IS NULL THEN
    RAISE EXCEPTION 'factura_plataforma_abrir: no existe la empresa %', p_org USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_f;
END $$;

-- Origen: 20261111130100_factura_plataforma.
CREATE OR REPLACE FUNCTION factura_plataforma_tomar_cambio(p_org text, p_efecto timestamp, p_plan_id text, p_tipo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_f "factura_plataforma";
  v_nombre varchar(80);
  v_periodicidad text;
  v_primera boolean;
BEGIN
  SELECT p."nombre", p."periodicidad_ordenes" INTO v_nombre, v_periodicidad FROM "plan" p WHERE p."id" = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_plataforma_tomar_cambio: no existe el plan %', p_plan_id USING ERRCODE = 'no_data_found';
  END IF;
  SELECT o."plan_id" IS NULL INTO v_primera FROM "organizacion" o WHERE o."id" = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'factura_plataforma_tomar_cambio: no existe la empresa %', p_org USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM factura_plataforma_avanzar(p_org, p_efecto);
  SELECT * INTO v_f FROM "factura_plataforma" WHERE "organizacion_id" = p_org AND "estado" = 'en_curso';
  IF p_efecto <= v_f."desde_at" THEN
    UPDATE "factura_plataforma"
       SET "plan_id" = p_plan_id, "plan_nombre" = v_nombre, "tipo_cobro" = p_tipo, "periodicidad" = v_periodicidad
     WHERE "id" = v_f."id";
    IF v_primera THEN
      UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = v_f."desde_at"
       WHERE "organizacion_id" = p_org AND "estado" = 'por_cerrar' AND "hasta_at" = v_f."desde_at";
      IF NOT FOUND THEN
        UPDATE "factura_plataforma" SET "primera_cuota_desde_at" = v_f."desde_at" WHERE "id" = v_f."id";
      END IF;
    END IF;
  ELSIF v_f."plan_id" IS NULL THEN
    UPDATE "factura_plataforma"
       SET "estado" = 'por_cerrar', "hasta_at" = p_efecto, "primera_cuota_desde_at" = p_efecto
     WHERE "id" = v_f."id";
    INSERT INTO "factura_plataforma"
      ("organizacion_id", "estado", "desde_at", "periodicidad", "plan_id", "plan_nombre", "tipo_cobro")
    VALUES (p_org, 'en_curso', p_efecto, v_periodicidad, p_plan_id, v_nombre, p_tipo);
  END IF;
END $$;

-- Origen: 20261111130100_factura_plataforma.
CREATE OR REPLACE FUNCTION factura_plataforma_cuota(
  p_org text, p_tramo_desde timestamp, p_plan_id text, p_tipo text, p_primera boolean
) RETURNS TABLE (
  plan_id text, plan_nombre varchar, tipo_cobro text, desde_at timestamp, hasta_at timestamp,
  precio_mensual numeric, cuota numeric, dias_cobrados integer, dias_periodo integer
)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_precio numeric;
  v_descuentos jsonb;
  v_costo numeric;
  v_s timestamp;
  v_e timestamp;
BEGIN
  IF p_plan_id IS NULL OR p_tramo_desde IS NULL THEN
    RETURN;
  END IF;
  SELECT h."precio_mensual", h."descuentos" INTO v_precio, v_descuentos
    FROM "plan_precio_historial" h
   WHERE h."plan_id" = p_plan_id AND h."desde_at" <= p_tramo_desde
   ORDER BY h."desde_at" DESC LIMIT 1;
  IF v_precio IS NULL THEN
    RETURN;
  END IF;
  v_costo := plan_costo_del_periodo(v_precio, v_descuentos, p_tipo);
  v_s := plan_inicio_periodo_calendario(p_tipo, p_tramo_desde);
  v_e := plan_fin_periodo_calendario(p_tipo, p_tramo_desde);
  IF v_s <> p_tramo_desde AND NOT p_primera THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org
       AND ((f."estado" = 'cerrada'
             AND ((f."cuota_desde_at" >= v_s AND f."cuota_desde_at" < v_e)
                  OR (f."primera_cuota_desde_at" >= v_s AND f."primera_cuota_desde_at" < v_e)))
            OR (f."estado" <> 'cerrada'
                AND f."primera_cuota_desde_at" >= v_s AND f."primera_cuota_desde_at" < v_e
                AND NOT (p_primera AND f."primera_cuota_desde_at" = p_tramo_desde)))
  ) THEN
    RETURN;
  END IF;

  plan_id := p_plan_id;
  SELECT p."nombre" INTO plan_nombre FROM "plan" p WHERE p."id" = p_plan_id;
  tipo_cobro := p_tipo;
  desde_at := p_tramo_desde;
  hasta_at := v_e;
  precio_mensual := v_precio;
  dias_periodo := plan_dias_de_calendario(v_s, v_e);
  IF v_s = p_tramo_desde THEN
    cuota := v_costo;
    dias_cobrados := dias_periodo;
  ELSE
    dias_cobrados := plan_dias_de_calendario(p_tramo_desde, v_e);
    cuota := plan_costo_del_tramo(v_costo, dias_cobrados, dias_periodo);
  END IF;
  RETURN NEXT;
END $$;

-- Origen: 20261111130100_factura_plataforma.
CREATE OR REPLACE FUNCTION factura_plataforma_cerrar(p_org text, p_ahora timestamp) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_espera timestamp;
  v_plan_id text;
  v_periodicidad timestamp;
  v_f "factura_plataforma";
  v_n "factura_plataforma";
  v_p "factura_plataforma";
  v_o record;
  v_c record;
  v_pc record;
  v_numero integer;
  v_cerradas integer := 0;
BEGIN
  SELECT o."plan_cambio_desde_at", o."plan_id" INTO v_espera, v_plan_id
    FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  -- La edición programada de la periodicidad del plan, si cambia la vigente (`version` es la de
  -- `VersionPlan`, en camelCase). Un plan tiene a lo sumo una (`plan_id` único).
  SELECT c."vigente_desde" INTO v_periodicidad
    FROM "plan_cambio_programado" c JOIN "plan" p ON p."id" = c."plan_id"
   WHERE c."plan_id" = v_plan_id
     AND c."version" ->> 'periodicidadOrdenes' IS NOT NULL
     AND c."version" ->> 'periodicidadOrdenes' IS DISTINCT FROM p."periodicidad_ordenes";
  v_espera := LEAST(v_espera, v_periodicidad);
  -- LEAST ignora los nulos: sin edición, avanza hasta `p_ahora`; con ella, la factura cuyo fin llega a su efecto
  -- queda en curso.
  PERFORM factura_plataforma_avanzar(p_org, LEAST(p_ahora, v_periodicidad - interval '1 microsecond'));
  FOR v_f IN
    SELECT * FROM "factura_plataforma"
     WHERE "organizacion_id" = p_org AND "estado" = 'por_cerrar' AND "hasta_at" <= p_ahora - interval '5 minutes'
     ORDER BY "desde_at"
  LOOP
    EXIT WHEN v_espera IS NOT NULL AND v_espera <= v_f."hasta_at";
    -- Cada SELECT INTO sin filas deja la variable en nulos: nada se arrastra de la vuelta anterior.
    SELECT * INTO v_o FROM factura_plataforma_ordenes(p_org, v_f."desde_at", v_f."hasta_at");
    SELECT * INTO v_n FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org AND f."desde_at" = v_f."hasta_at";
    SELECT * INTO v_p FROM "factura_plataforma" f
     WHERE f."organizacion_id" = p_org AND f."desde_at" = v_f."primera_cuota_desde_at";
    SELECT * INTO v_pc
      FROM factura_plataforma_cuota(p_org, v_f."primera_cuota_desde_at", v_p."plan_id", v_p."tipo_cobro", true);
    SELECT * INTO v_c
      FROM factura_plataforma_cuota(p_org, v_f."hasta_at", v_n."plan_id", v_n."tipo_cobro", false);
    SELECT COALESCE(max("numero"), 0) + 1 INTO v_numero FROM "factura_plataforma" WHERE "organizacion_id" = p_org;
    UPDATE "factura_plataforma"
       SET "estado" = 'cerrada', "numero" = v_numero,
           "cargos" = v_o.cargos, "reversos" = v_o.reversos, "total_ordenes" = v_o.total_ordenes,
           "movimientos" = v_o.movimientos,
           "primera_cuota_hasta_at" = v_pc.hasta_at, "primera_cuota_plan_id" = v_pc.plan_id,
           "primera_cuota_plan_nombre" = v_pc.plan_nombre, "primera_cuota_tipo_cobro" = v_pc.tipo_cobro,
           "primera_cuota_precio_mensual" = v_pc.precio_mensual, "primera_cuota" = v_pc.cuota,
           "primera_cuota_dias_cobrados" = v_pc.dias_cobrados, "primera_cuota_dias_periodo" = v_pc.dias_periodo,
           "cuota_plan_id" = v_c.plan_id, "cuota_plan_nombre" = v_c.plan_nombre, "cuota_tipo_cobro" = v_c.tipo_cobro,
           "cuota_desde_at" = v_c.desde_at, "cuota_hasta_at" = v_c.hasta_at,
           "precio_mensual" = v_c.precio_mensual, "cuota" = v_c.cuota,
           "dias_cobrados" = v_c.dias_cobrados, "dias_periodo" = v_c.dias_periodo,
           "total" = v_o.total_ordenes + COALESCE(v_c.cuota, 0) + COALESCE(v_pc.cuota, 0),
           "cerrada_at" = p_ahora
     WHERE "id" = v_f."id";
    v_cerradas := v_cerradas + 1;
  END LOOP;
  RETURN v_cerradas;
END $$;

-- Los lectores nuevos, cuando ya ninguna función los llama.
DROP FUNCTION plan_tope_rol_de(text, text, rol_value);
DROP FUNCTION plan_version_de(text, text);

DROP TABLE "plan_cambio_recepcion";
DROP TABLE "plan_version_empresa";

COMMIT;
