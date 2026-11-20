-- SLT-121 (design §1.1, §2, §8.2) — el plazo de pago de las facturas de la plataforma y la operación congelada
-- por mora.
--
-- Piezas:
--   · tres columnas en `organizacion` (§1.1), con el CHECK de la gracia y el índice de las congeladas. Son de
--     plataforma: `servi_app` las LEE en su fila (ya tiene SELECT) pero no las escribe, porque su UPDATE es por
--     columna (SLT-77: solo `tope_intentos_entrega` y `updated_at`). Así la empresa no se descongela sola;
--   · `factura_plataforma_mora` (§2.1): la ÚNICA definición de la fecha límite y de «vencida». Es la lectura de la
--     empresa (EXECUTE para `servi_app`, con el 42501 de `plan_de_la_empresa`, R33) y la que usan las demás;
--   · `organizacion_mora_congelar`, `organizacion_mora_descongelar_si_pagada` y
--     `organizacion_mora_descongelar_a_mano` (§2.2-§2.4), solo del dueño. No escriben historial ni encolan: lo hace
--     el repositorio en la misma transacción, con `appendAccion` (guardia `historial-accion-escrituras-cubiertas`);
--   · `bloqueo_por_mora()` y su trigger `<tabla>_bloqueo_por_mora` (§2.5; R16): toda escritura de `servi_app` con
--     la empresa del contexto congelada y sin `app.mora_permitida` falla con SQLSTATE SL121. Se instala en cada
--     tabla con la política `<tabla>_por_empresa` y en `organizacion`. Una tabla de negocio nueva sin él pone en
--     rojo `tests/integration/db/bloqueo-por-mora-cobertura.test.ts`.
--
-- La gracia global (`FACTURA_DIAS_GRACIA`) la lee TS y llega por parámetro: la base no la conoce. La hora es la de
-- la plataforma con el desfase fijo `interval '6 hours'`, como `plan_inicio_periodo_calendario`, hasta SLT-90.
--
-- R7: NO toca filas. Ninguna empresa nace congelada ni con gracia propia.
--
-- ATOMICIDAD: BEGIN/COMMIT, a mano (`db:migrate:create` falla con P3006 en este repo). Prefijo 20261126120100:
-- después de 20261126120000_mora_enums, que va sola (55P04).

BEGIN;

-- ─── 1. Las columnas (§1.1; R2, R3, R22, R23) ───────────────────────────────────────────────────────
ALTER TABLE "organizacion"
  ADD COLUMN "factura_dias_gracia" INTEGER,
  ADD COLUMN "congelada_at" TIMESTAMP(3),
  ADD COLUMN "descongelada_hasta" DATE;

-- R3: la gracia propia es de 1 a 60 días; NULL = rige la global.
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_factura_dias_gracia_rango"
  CHECK ("factura_dias_gracia" IS NULL OR "factura_dias_gracia" BETWEEN 1 AND 60);

-- La corrida de madrugada recorre las congeladas sin barrer todas las empresas.
CREATE INDEX "organizacion_congelada_idx" ON "organizacion" ("id") WHERE "congelada_at" IS NOT NULL;

-- ─── 2. La fecha límite y «vencida» (§2.1; R1, R6, R33) ─────────────────────────────────────────────
-- Una fila por factura CERRADA con saldo > 0; el saldo es el de `factura_plataforma_saldos` (SLT-60, sin los
-- pagos anulados de SLT-143), que solo trae las cerradas: la en curso y la por cerrar no aparecen. Una pagada
-- tampoco: su fecha límite deja de importar.
--   · fecha_limite = día de emisión (el día de la plataforma en que empieza `hasta`) + gracia, en días corridos;
--   · vence_at     = las 00:00 de la plataforma del día siguiente a la fecha límite, en UTC;
--   · vencida      = `p_ahora` (UTC) ya llegó a `vence_at`.
-- La guarda: si quien llama es `servi_app` (el rol de la envoltura, que una función SECURITY DEFINER no cambia),
-- solo la empresa del contexto; sin contexto u otra empresa, 42501. El dueño la llama para cualquier empresa.
CREATE FUNCTION factura_plataforma_mora(p_org text, p_ahora timestamp, p_gracia_global integer)
  RETURNS TABLE(factura_id text, numero integer, hasta_at timestamp, saldo numeric,
                fecha_limite date, vence_at timestamp, vencida boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contexto text := current_setting('app.organizacion_id', true);
  v_gracia   integer;
BEGIN
  IF (current_setting('role', true) = 'servi_app' OR session_user = 'servi_app')
     AND (v_contexto IS NULL OR v_contexto = '' OR p_org IS DISTINCT FROM v_contexto) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'factura_plataforma_mora: solo se lee la mora de la empresa del contexto';
  END IF;
  SELECT COALESCE(o."factura_dias_gracia", p_gracia_global) INTO v_gracia FROM "organizacion" o WHERE o."id" = p_org;
  RETURN QUERY
    SELECT s."factura_id", s."numero", s."hasta_at", s."saldo", l."fecha_limite",
           ((l."fecha_limite" + 1)::timestamp + interval '6 hours')::timestamp,
           p_ahora >= ((l."fecha_limite" + 1)::timestamp + interval '6 hours')
      FROM factura_plataforma_saldos(p_org) s
      CROSS JOIN LATERAL (SELECT ((s."hasta_at" - interval '6 hours')::date + v_gracia)::date AS "fecha_limite") l
     WHERE s."saldo" > 0
     ORDER BY l."fecha_limite", s."numero";
END $$;
REVOKE EXECUTE ON FUNCTION factura_plataforma_mora(text, timestamp, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION factura_plataforma_mora(text, timestamp, integer) TO servi_app;

-- ─── 3. Congelar (§2.2; R7, R8, R9, R23) ────────────────────────────────────────────────────────────
-- En la transacción de la corrida de madrugada. El candado de los pagos de la empresa va PRIMERO, como en
-- `pago_plataforma_confirmar`, para no cruzarse con una confirmación (§4.3); después la empresa en FOR UPDATE, para
-- que dos corridas o un descongelamiento a mano se serialicen.
-- Solo de 00:00 a 05:59 de la plataforma (R8): fuera de la franja responde sin escribir, también en un reintento.
CREATE FUNCTION organizacion_mora_congelar(p_org text, p_ahora timestamp, p_gracia_global integer) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_org      record;
  v_hoy      date := (p_ahora - interval '6 hours')::date;
  v_facturas jsonb;
  v_saldo    numeric(14, 2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));
  SELECT o."id", o."congelada_at", o."descongelada_hasta" INTO v_org
    FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF v_org."id" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'organizacion_mora_congelar: no existe la empresa ' || p_org;
  END IF;

  IF extract(hour FROM p_ahora - interval '6 hours') >= 6 THEN
    RETURN jsonb_build_object('resultado', 'fuera_de_franja');
  END IF;
  IF v_org."congelada_at" IS NOT NULL THEN
    RETURN jsonb_build_object('resultado', 'ya_congelada');
  END IF;
  IF v_org."descongelada_hasta" IS NOT NULL AND v_org."descongelada_hasta" >= v_hoy THEN
    RETURN jsonb_build_object('resultado', 'descongelada_a_mano');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', m."factura_id", 'numero', m."numero", 'saldo', m."saldo"::text)
                   ORDER BY m."numero"),
         SUM(m."saldo")
    INTO v_facturas, v_saldo
    FROM factura_plataforma_mora(p_org, p_ahora, p_gracia_global) m
   WHERE m."vencida";
  IF v_facturas IS NULL THEN
    RETURN jsonb_build_object('resultado', 'al_dia');
  END IF;

  UPDATE "organizacion" SET "congelada_at" = p_ahora WHERE "id" = p_org;
  RETURN jsonb_build_object('resultado', 'congelada', 'facturas', v_facturas, 'saldo_vencido', v_saldo::text);
END $$;
REVOKE EXECUTE ON FUNCTION organizacion_mora_congelar(text, timestamp, integer) FROM PUBLIC;

-- ─── 4. Recalcular: descongelar si ya no hay vencidas (§2.3; R5, R19, R21, R34) ─────────────────────
-- La pieza SQL de `recalcularCongelamiento`. Corre en la transacción que cambió el saldo o la gracia, después del
-- cambio, y lo ve. NUNCA congela (R21) y no toca `descongelada_hasta`.
CREATE FUNCTION organizacion_mora_descongelar_si_pagada(p_org text, p_ahora timestamp, p_gracia_global integer)
  RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_congelada timestamp;
BEGIN
  SELECT o."congelada_at" INTO v_congelada FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF v_congelada IS NULL THEN
    RETURN 'sin_cambio';
  END IF;
  IF EXISTS (SELECT 1 FROM factura_plataforma_mora(p_org, p_ahora, p_gracia_global) m WHERE m."vencida") THEN
    RETURN 'sin_cambio';
  END IF;
  UPDATE "organizacion" SET "congelada_at" = NULL WHERE "id" = p_org;
  RETURN 'descongelada';
END $$;
REVOKE EXECUTE ON FUNCTION organizacion_mora_descongelar_si_pagada(text, timestamp, integer) FROM PUBLIC;

-- ─── 5. Descongelar a mano (§2.4; R22, R23) ─────────────────────────────────────────────────────────
-- El motivo y el rango de `p_hasta` (decisión P4) los valida el servicio; el motivo va solo al historial (P5).
-- `p_ahora` no decide nada aquí: va para que las tres funciones se llamen igual desde el repositorio.
CREATE FUNCTION organizacion_mora_descongelar_a_mano(p_org text, p_hasta date, p_ahora timestamp) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_congelada timestamp;
BEGIN
  SELECT o."congelada_at" INTO v_congelada FROM "organizacion" o WHERE o."id" = p_org FOR UPDATE;
  IF v_congelada IS NULL THEN
    RETURN 'no_congelada';
  END IF;
  UPDATE "organizacion" SET "congelada_at" = NULL, "descongelada_hasta" = p_hasta WHERE "id" = p_org;
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION organizacion_mora_descongelar_a_mano(text, date, timestamp) FROM PUBLIC;

-- ─── 6. El bloqueo en la base (§2.5; R10, R12, R16, R18) ────────────────────────────────────────────
-- SIN SECURITY DEFINER: necesita el `current_user` real. Pasan el dueño (el superadmin, los cierres y toda función
-- SECURITY DEFINER, porque ahí `current_user` no es `servi_app`) y los caminos con `app.mora_permitida` (§6.1). La
-- empresa que se mira es la de la transacción, así que una empresa congelada no frena a otra (R18).
-- Por SENTENCIA: una lectura por clave primaria por escritura, no por fila. Las lecturas no lo disparan (R10).
CREATE FUNCTION bloqueo_por_mora() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user = 'servi_app'
     AND COALESCE(current_setting('app.mora_permitida', true), '') = ''
     AND EXISTS (SELECT 1 FROM "organizacion" o
                  WHERE o."id" = current_setting('app.organizacion_id', true)
                    AND o."congelada_at" IS NOT NULL)
  THEN
    RAISE EXCEPTION 'empresa_congelada' USING ERRCODE = 'SL121';
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION bloqueo_por_mora() FROM PUBLIC;

-- En cada tabla con la política `<tabla>_por_empresa` (las de negocio y `jobs`), leída de `pg_policy` como la
-- guardia `rls-por-empresa`, y en `organizacion`, por la columna que el maestro sí escribe (`tope_intentos_entrega`).
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.relname::text AS tabla
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polname = c.relname || '_por_empresa'
    UNION
    SELECT 'organizacion'
     ORDER BY 1
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION bloqueo_por_mora()',
      r.tabla || '_bloqueo_por_mora', r.tabla);
  END LOOP;
END
$do$;

COMMIT;
