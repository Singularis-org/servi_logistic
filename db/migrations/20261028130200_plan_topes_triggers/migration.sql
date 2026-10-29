-- SL-24 (design §3, §4) — el tope del plan lo hace cumplir la base, dentro de la transacción del alta.
--
-- Por qué en la base y no en los servicios (design §6.2, §12 alternativa 1): las órdenes y los
-- usuarios nacen por al menos ocho caminos de código, y uno nuevo que nadie enganche dejaría crear por
-- encima del tope con la suite en verde. Un trigger los cubre todos por construcción, también el SQL a
-- mano, y cuenta dentro de la misma transacción: si el uso pasa el tope, el alta entera se deshace.
--
-- Al ser SECURITY DEFINER (leen tablas de plataforma que `servi_app` no ve), la RLS no frena un error
-- de estas funciones. Por eso: `search_path` fijo, EXECUTE revocado a PUBLIC y la empresa sale siempre
-- de NEW o de la tabla de transición, que la RLS de `orden`, `usuario` y `api_key` ya validó. La única
-- que `servi_app` puede llamar es `plan_cupo_ordenes`, y exige que su argumento sea la empresa del
-- contexto (R8).
--
-- Sin carrera (design §4.4, R24): el alta toma la fila de la empresa y la del plan en FOR SHARE (choca
-- con el FOR UPDATE de asignar o editar, no con otras altas) y después el cerrojo consultivo
-- (24, hashtext(empresa)), que pone en fila las altas de una misma empresa. En READ COMMITTED cada
-- consulta de estas funciones toma una foto nueva: la segunda alta cuenta con la primera ya confirmada.
-- Una empresa sin plan no toma el consultivo: sus cargas concurrentes no se ponen en fila (R14).
--
-- El error es SQLSTATE `SL024` con el JSON en MESSAGE, no en DETAIL: el mensaje es lo que está
-- verificado que llega por las dos formas de error de Prisma 7 + adapter-pg (design §4.1).
--
-- En carpeta propia (precedente SL-40): se pueden quitar sin borrar el catálogo ni las asignaciones.
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- ─── El ciclo (§3, R20) ──────────────────────────────────────────────────────────────────────────
-- `ancla + n meses`, con el mayor n ≥ 0 que no pase de `p_ahora`. Siempre desde el ancla y nunca
-- encadenando ciclos: la suma de `interval` recorta al último día del mes sin arrastrar el recorte
-- (alta el 31: 28/29 de febrero, 31 de marzo, 30 de abril). Sin zona horaria: la frontera es la hora
-- del alta. Su gemela en TS es `lib/planes/ciclo.ts > inicioDelCiclo`.
--
-- El «ahora» de quien la llama es SIEMPRE `now() AT TIME ZONE 'UTC'`, nunca `now()::timestamp`
-- (decisión 2026-10-28): las columnas son `TIMESTAMP` sin zona y Prisma escribe `orden.created_at`
-- y el ancla en UTC; `now()::timestamp` daría la hora local de la sesión, y con
-- `TimeZone = America/Bogota` contaría las órdenes de las 5 h anteriores al inicio del ciclo.
CREATE FUNCTION plan_inicio_ciclo(p_ancla timestamp, p_ahora timestamp) RETURNS timestamp
  LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_meses integer;
BEGIN
  -- Meses de calendario entre los dos; el candidato solo puede pasarse por uno (mismo mes, día u
  -- hora posteriores), nunca quedarse corto.
  v_meses := (EXTRACT(YEAR FROM p_ahora)::integer - EXTRACT(YEAR FROM p_ancla)::integer) * 12
           + (EXTRACT(MONTH FROM p_ahora)::integer - EXTRACT(MONTH FROM p_ancla)::integer);
  IF v_meses > 0 AND p_ancla + make_interval(months => v_meses) > p_ahora THEN
    v_meses := v_meses - 1;
  END IF;
  IF v_meses <= 0 THEN
    RETURN p_ancla;
  END IF;
  RETURN p_ancla + make_interval(months => v_meses);
END $$;

-- ─── Conteos (§4.2) ──────────────────────────────────────────────────────────────────────────────
-- Las vivas de la empresa creadas desde el inicio del ciclo (R19): anular libera cupo al momento y
-- una orden de un ciclo pasado no cuenta. Usa `orden_organizacion_id_created_at_vivas_idx`.
CREATE FUNCTION plan_uso_ordenes(p_organizacion_id text, p_desde timestamp) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN (SELECT count(*)::integer FROM "orden" o
           WHERE o."organizacion_id" = p_organizacion_id
             AND o."created_at" >= p_desde
             AND o."deleted_at" IS NULL);
END $$;

-- Solo `activo` cuenta (R26): `pendiente`, `inactivo` y `bloqueado` no ocupan cupo.
CREATE FUNCTION plan_uso_rol(p_organizacion_id text, p_rol rol_value) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN (SELECT count(*)::integer FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id"
           WHERE u."organizacion_id" = p_organizacion_id
             AND r."value" = p_rol
             AND u."estado" = 'activo');
END $$;

-- «Viva, no revocada» = `activa` (feature 88/R7: una `inactiva` no autentica). Una eliminada ya no
-- existe: `eliminar` borra la fila (R35).
CREATE FUNCTION plan_uso_api_keys(p_organizacion_id text) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN (SELECT count(*)::integer FROM "api_key" k
           WHERE k."organizacion_id" = p_organizacion_id
             AND k."estado" = 'activa');
END $$;

-- La lectura previa de la carga de órdenes (§6.1): rechazar la petición entera antes de partirla en
-- lotes y avisar en la vista previa. SIN cerrojos: la autoridad sigue siendo el trigger. Sin plan o
-- sin tope de órdenes no devuelve filas. Solo la empresa del contexto: el cupo de otra es un dato de
-- otra empresa (R8).
CREATE FUNCTION plan_cupo_ordenes(p_organizacion_id text) RETURNS TABLE (maximo integer, usados integer)
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

-- ─── Triggers (§4.3) ─────────────────────────────────────────────────────────────────────────────
-- Órdenes: de SENTENCIA, para que un createMany de 500 filas cuente una vez y no 500. En la práctica
-- `nuevas` trae una sola empresa; se recorren en orden de id para que dos sentencias mixtas tomen los
-- cerrojos en el mismo orden. `usados` del error es el uso ANTES de esta sentencia.
CREATE FUNCTION plan_tope_ordenes() RETURNS trigger
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

-- Usuarios: el tope es la fila de `plan_tope_rol` del rol de NEW; sin fila no hay límite, y `apiKey`
-- nunca la tiene (CHECK de 20261028130000, R25). Qué es «alta» lo dice el WHEN de cada trigger.
-- El rol viaja con el nombre del enum de Prisma (`adminTienda`), no con el de Postgres.
CREATE FUNCTION plan_tope_usuario() RETURNS trigger
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

-- API keys: crear una `activa` o activar una `inactiva` es un alta (R35). Desactivar y eliminar, no.
CREATE FUNCTION plan_tope_api_key() RETURNS trigger
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

REVOKE EXECUTE ON FUNCTION plan_inicio_ciclo(timestamp, timestamp) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_uso_ordenes(text, timestamp) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_uso_rol(text, rol_value) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_uso_api_keys(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_cupo_ordenes(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_tope_ordenes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_tope_usuario() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION plan_tope_api_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plan_cupo_ordenes(text) TO servi_app;

-- Convive con el `AFTER INSERT … FOR EACH ROW` del cobro de SL-40: este es de sentencia.
CREATE TRIGGER "plan_tope_ordenes" AFTER INSERT ON "orden"
  REFERENCING NEW TABLE AS "nuevas"
  FOR EACH STATEMENT EXECUTE FUNCTION plan_tope_ordenes();

-- El WHEN es la definición de «alta de usuario» (R27, P4): crear uno activo, activarlo desde
-- `inactivo`, `bloqueado` o `pendiente` (aprobar su postulación), o cambiarle el rol. Bloquear o
-- inactivar no es alta. El superadmin (sin empresa) no tiene plan que cumplir.
CREATE TRIGGER "plan_tope_usuario_alta" AFTER INSERT ON "usuario"
  FOR EACH ROW WHEN (NEW."organizacion_id" IS NOT NULL AND NEW."estado" = 'activo')
  EXECUTE FUNCTION plan_tope_usuario();

-- De fila y no de sentencia: Postgres no admite tablas de transición con lista de columnas (UPDATE OF).
CREATE TRIGGER "plan_tope_usuario_cambio" AFTER UPDATE OF "rol_id", "estado" ON "usuario"
  FOR EACH ROW WHEN (
    NEW."organizacion_id" IS NOT NULL
    AND NEW."estado" = 'activo'
    AND (OLD."rol_id" IS DISTINCT FROM NEW."rol_id" OR OLD."estado" <> 'activo')
  )
  EXECUTE FUNCTION plan_tope_usuario();

CREATE TRIGGER "plan_tope_api_key_alta" AFTER INSERT ON "api_key"
  FOR EACH ROW WHEN (NEW."estado" = 'activa')
  EXECUTE FUNCTION plan_tope_api_key();

CREATE TRIGGER "plan_tope_api_key_cambio" AFTER UPDATE OF "estado" ON "api_key"
  FOR EACH ROW WHEN (NEW."estado" = 'activa' AND OLD."estado" <> 'activa')
  EXECUTE FUNCTION plan_tope_api_key();
