-- SLT-143 (design §1, §3) — el superadmin registra un pago a la plataforma hecho por fuera y anula un pago
-- confirmado.
--
-- Piezas:
--   · la tabla de NEGOCIO `pago_plataforma_anulacion` (§1.1), con las piezas de `pago_plataforma_confirmacion`
--     (20261116120000): `organizacion_id` con el DEFAULT de la empresa de la transacción, FK CASCADE, la política
--     `…_por_empresa` (la empresa solo LEE lo suyo, R32), el REVOKE de escritura a `servi_app`, el trigger
--     `…_inmutable` y los de misma empresa y sin cambio de empresa, GENERADOS con
--     `tsx scripts/generar-misma-empresa.ts --faltantes`. Su fila es la prueba, EN LA BASE, de que el
--     contra-asiento de un pago confirmado lo pidió la plataforma: solo la escribe una función del dueño (R29);
--   · la columna `pago_plataforma_confirmacion.por_fuera` (§1.2), de donde sale la marca de la wallet (R13, R14);
--   · `factura_plataforma_saldos` sin lo aplicado por confirmaciones anuladas (§3.2; R26, R30);
--   · el reparto de `pago_plataforma_confirmar` sacado a `_pago_plataforma_aplicar`, para que el registro por
--     fuera valide exactamente igual (§3.3; R5). `pago_plataforma_confirmar` conserva su comportamiento;
--   · `pago_plataforma_registrar_por_fuera` (§3.3) y `pago_plataforma_anular_confirmado` (§3.4);
--   · `pago_plataforma_no_anular_confirmado` con la excepción de la anulación de la plataforma (§3.5; R15, R29).
--
-- Las tres funciones escriben `organizacion_id = p_org` explícito: corren como dueño, quizá sin
-- `app.organizacion_id`, y el DEFAULT de la empresa de la transacción daría NULL (T0.2). Los `created_at` se
-- escriben con `now() AT TIME ZONE 'UTC'`, no con el DEFAULT `CURRENT_TIMESTAMP`, que convierte con el TimeZone
-- de la sesión (el arreglo de 20261119120100).
--
-- No escribe historial (decisión P6) ni avisos (P7).
--
-- R33: NO inserta datos. Las confirmaciones que ya existan quedan con `por_fuera = false` (el DEFAULT del
-- `ADD COLUMN`, que no dispara `…_inmutable`) y ningún pago queda anulado.
--
-- ATOMICIDAD: BEGIN/COMMIT, a mano (`db:migrate:create` falla con P3006 en este repo). Prefijo 20261120130000:
-- después de la mayor de `dev` (20261119120100_cobro_plataforma_ocurrido_utc) y de 20261120120000_plan_beneficio
-- de SLT-214, que aún no está en `dev` (decisión del leader tras T0).

BEGIN;

-- ─── 1. La tabla de la anulación (§1.1) ─────────────────────────────────────────────────────────────
CREATE TABLE "pago_plataforma_anulacion" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "confirmacion_id" TEXT NOT NULL,
    "anulado_por" TEXT NOT NULL,
    "anulado_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pago_plataforma_anulacion_pkey" PRIMARY KEY ("id")
);

-- R24: una anulación por confirmación, por empresa (guardia `unicos-por-empresa`).
CREATE UNIQUE INDEX "pago_plataforma_anulacion_org_confirmacion_key"
    ON "pago_plataforma_anulacion"("organizacion_id", "confirmacion_id");
-- SL-17/R2 (guardia `organizacion-en-modelos`).
CREATE INDEX "pago_plataforma_anulacion_organizacion_id_idx"
    ON "pago_plataforma_anulacion"("organizacion_id");

-- Como en la confirmación: CASCADE desde la empresa, sin acción hacia la confirmación y RESTRICT hacia quien
-- anuló (es evidencia).
ALTER TABLE "pago_plataforma_anulacion" ADD CONSTRAINT "pago_plataforma_anulacion_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pago_plataforma_anulacion" ADD CONSTRAINT "pago_plataforma_anulacion_confirmacion_id_fkey"
    FOREIGN KEY ("confirmacion_id") REFERENCES "pago_plataforma_confirmacion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "pago_plataforma_anulacion" ADD CONSTRAINT "pago_plataforma_anulacion_anulado_por_fkey"
    FOREIGN KEY ("anulado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R32. Sin el REVOKE, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría escritura a `servi_app`, y con ella
-- la empresa podría fabricar la excepción del trigger de §6.
ALTER TABLE "pago_plataforma_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pago_plataforma_anulacion_por_empresa" ON "pago_plataforma_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
REVOKE INSERT, UPDATE, DELETE ON "pago_plataforma_anulacion" FROM servi_app;

-- Misma empresa y sin cambio de empresa (SL-17).
-- GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`: no editar a mano.
--   · 2 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017). `anulado_por` es el
--     superadmin (`usuario.organizacion_id` nulo): el trigger lo deja pasar (T0.3).
--   · 1 tabla de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).

-- PagoPlataformaAnulacion.anulador
CREATE TRIGGER "sme_pago_plataforma_anulacion_anulado_por_34a529df" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "pago_plataforma_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- PagoPlataformaAnulacion.confirmacion
CREATE TRIGGER "sme_pago_plataforma_anulacion_confirmacion_i_71dd660a" BEFORE INSERT OR UPDATE OF "confirmacion_id", "organizacion_id"
  ON "pago_plataforma_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('pago_plataforma_confirmacion', 'confirmacion_id', 'id');

CREATE TRIGGER "pago_plataforma_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "pago_plataforma_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- R32: una anulación guardada no cambia, tampoco para el dueño. `pago_plataforma_inmutable()` (20261116120000)
-- ya es genérica y deja el cambio de empresa a `…_sin_cambio_de_empresa`.
CREATE TRIGGER "pago_plataforma_anulacion_inmutable" BEFORE UPDATE ON "pago_plataforma_anulacion"
  FOR EACH ROW EXECUTE FUNCTION pago_plataforma_inmutable();

-- ─── 2. La marca del pago registrado por la plataforma (§1.2; R13, R14, R33) ────────────────────────
ALTER TABLE "pago_plataforma_confirmacion" ADD COLUMN "por_fuera" BOOLEAN NOT NULL DEFAULT false;

-- ─── 3. El saldo sin los pagos anulados (§3.2; R21, R26, R30) ───────────────────────────────────────
-- Cuerpo de 20261116120000 §5 con UNA condición más: lo aplicado por una confirmación anulada no cuenta. Con eso
-- suben solos lo disponible (`pago_plataforma_disponible_de`) y el saldo que leerá SLT-121, sin escribir en
-- `factura_plataforma` ni en `pago_plataforma_aplicacion`. El REVOKE de EXECUTE se conserva con el OR REPLACE.
CREATE OR REPLACE FUNCTION factura_plataforma_saldos(p_org text)
  RETURNS TABLE(factura_id text, numero integer, desde_at timestamp, hasta_at timestamp,
                total numeric, aplicado numeric, saldo numeric)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f."id", f."numero", f."desde_at", f."hasta_at", f."total",
         COALESCE(a."aplicado", 0)::numeric(14, 2),
         (f."total" - COALESCE(a."aplicado", 0))::numeric(14, 2)
    FROM "factura_plataforma" f
    LEFT JOIN (SELECT ap."factura_id", SUM(ap."monto") AS "aplicado"
                 FROM "pago_plataforma_aplicacion" ap
                WHERE ap."organizacion_id" = p_org
                  AND NOT EXISTS (SELECT 1 FROM "pago_plataforma_anulacion" n
                                   WHERE n."organizacion_id" = p_org AND n."confirmacion_id" = ap."confirmacion_id")
                GROUP BY ap."factura_id") a ON a."factura_id" = f."id"
   WHERE f."organizacion_id" = p_org AND f."estado" = 'cerrada'
   ORDER BY f."desde_at";
$$;

-- ─── 4. El reparto, compartido por la confirmación y el registro por fuera (§3.3; R5) ───────────────
-- Los pasos 3 y 4 de `pago_plataforma_confirmar` de 20261116120000 §7, LITERALES salvo que el monto del pago
-- llega por parámetro y que la confirmación guarda `por_fuera`. El que llama ya tomó el candado de la empresa.
-- Sin EXECUTE para nadie más que el dueño: solo la llaman las dos funciones de abajo.
CREATE FUNCTION _pago_plataforma_aplicar(p_org text, p_pago_id text, p_monto numeric, p_aplicaciones jsonb,
                                         p_por text, p_ahora timestamp, p_por_fuera boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_elemento      jsonb;
  v_factura_id    text;
  v_monto         numeric(14, 2);
  v_saldo         numeric(14, 2);
  v_suma          numeric(14, 2) := 0;
  v_vistas        text[] := ARRAY[]::text[];
  v_validas       jsonb := '[]'::jsonb;
  v_confirmacion  text;
BEGIN
  FOR v_elemento IN
    SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_aplicaciones) = 'array'
                                            THEN p_aplicaciones ELSE '[]'::jsonb END) e
  LOOP
    v_factura_id := v_elemento ->> 'factura_id';
    -- SLT-60 R15: cerrada, de esta empresa y con saldo.
    SELECT s."saldo" INTO v_saldo FROM factura_plataforma_saldos(p_org) s WHERE s."factura_id" = v_factura_id;
    IF NOT FOUND OR v_saldo <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'factura_no_valida', 'factura_id', v_factura_id)::text;
    END IF;
    v_monto := round((v_elemento ->> 'monto')::numeric, 2);
    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'monto_no_positivo', 'factura_id', v_factura_id)::text;
    END IF;
    IF v_factura_id = ANY (v_vistas) THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'factura_repetida', 'factura_id', v_factura_id)::text;
    END IF;
    -- SLT-60 R17: nunca más que el saldo de su factura.
    IF v_monto > v_saldo THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'supera_saldo', 'factura_id', v_factura_id)::text;
    END IF;
    v_vistas := v_vistas || v_factura_id;
    v_suma := v_suma + v_monto;
    v_validas := v_validas || jsonb_build_array(jsonb_build_object('factura_id', v_factura_id, 'monto', v_monto));
  END LOOP;

  -- SLT-60 R17: el reparto suma exactamente el monto del pago.
  IF v_suma <> p_monto THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'suma_distinta')::text;
  END IF;

  INSERT INTO "pago_plataforma_confirmacion"
    ("organizacion_id", "pago_id", "confirmado_por", "confirmado_at", "por_fuera")
  VALUES (p_org, p_pago_id, p_por, p_ahora, p_por_fuera)
  RETURNING "id" INTO v_confirmacion;

  INSERT INTO "pago_plataforma_aplicacion" ("organizacion_id", "confirmacion_id", "factura_id", "monto")
  SELECT p_org, v_confirmacion, a ->> 'factura_id', (a ->> 'monto')::numeric(14, 2)
    FROM jsonb_array_elements(v_validas) a;
END $$;
REVOKE EXECUTE ON FUNCTION _pago_plataforma_aplicar(text, text, numeric, jsonb, text, timestamp, boolean) FROM PUBLIC;

-- La confirmación de SLT-60, con el reparto delegado. Candado, lectura del pago, `pago_no_encontrado` y
-- `ya_confirmado` quedan LITERALES; los tests de SLT-60 la vigilan sin cambios. Un pago anulado por la plataforma
-- tiene contra-asiento, así que sigue dando `pago_no_encontrado` (R27). El REVOKE se conserva.
CREATE OR REPLACE FUNCTION pago_plataforma_confirmar(p_org text, p_pago_id text, p_aplicaciones jsonb, p_por text,
                                                     p_ahora timestamp) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pago record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));

  SELECT p."id", p."monto" INTO v_pago
    FROM "wallet_movimiento" p
   WHERE p."id" = p_pago_id AND p."organizacion_id" = p_org
     AND p."tipo" = 'egreso' AND p."categoria" = 'egreso_pago_plataforma';
  -- R20: no existe, es de otra empresa o ya está anulado.
  IF v_pago."id" IS NULL OR EXISTS (
    SELECT 1 FROM "wallet_movimiento" a
     WHERE a."organizacion_id" = p_org AND a."tipo" = 'ingreso' AND a."categoria" = 'ingreso_ajuste'
       AND a."origen_tipo" = 'gasto' AND a."origen_id" = v_pago."id"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'pago_no_encontrado')::text;
  END IF;
  -- R19: confirmar dos veces no escribe nada.
  IF EXISTS (SELECT 1 FROM "pago_plataforma_confirmacion" c
              WHERE c."organizacion_id" = p_org AND c."pago_id" = v_pago."id") THEN
    RETURN 'ya_confirmado';
  END IF;

  PERFORM _pago_plataforma_aplicar(p_org, v_pago."id", v_pago."monto", p_aplicaciones, p_por, p_ahora, false);
  RETURN 'ok';
END $$;

-- ─── 5. Registrar un pago hecho por fuera (§3.3; R1–R3, R5–R12) ─────────────────────────────────────
-- Devuelve 'ok' o 'ya_registrado'; un reparto inválido sale con SL060 y el tope con el `check_violation` de
-- `wallet_movimiento_tope_pago_plataforma` (R6). Una sola sentencia: cualquier rechazo revierte el pago, el
-- comprobante y la confirmación juntos (R5, R9).
--   · El candado es el de siempre: serializa contra el registro desde la wallet, la confirmación y la anulación
--     (R11). El tope vuelve a tomarlo en el INSERT (es reentrante).
--   · No mira la caja: puede quedar negativa (R3; ningún trigger de `wallet_movimiento` la mira, T0.3).
--   · El pago entra en el libro antes de su confirmación, así que el tope lo compara con lo disponible sin
--     contarlo; ya confirmado no es «por confirmar», y lo disponible baja justo en su monto (R12).
CREATE FUNCTION pago_plataforma_registrar_por_fuera(p_org text, p_pago_id text, p_monto numeric, p_fecha timestamp,
                                                    p_referencia text, p_clave text, p_aplicaciones jsonb,
                                                    p_por text, p_ahora timestamp, p_comprobante_ruta text,
                                                    p_comprobante_tipo text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pago record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));

  -- R10: el reenvío con la misma clave no escribe nada.
  IF p_clave IS NOT NULL AND EXISTS (
    SELECT 1 FROM "wallet_movimiento" r WHERE r."organizacion_id" = p_org AND r."clave_idempotencia" = p_clave
  ) THEN
    RETURN 'ya_registrado';
  END IF;

  -- El mismo movimiento que escribe la wallet (SL-45): la caja, la ganancia y «Salió» cambian igual (R2).
  INSERT INTO "wallet_movimiento"
    ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion",
     "registrado_por", "fecha_movimiento", "created_at", "clave_idempotencia")
  VALUES (p_pago_id, p_org, 'egreso', 'egreso_pago_plataforma', p_monto, 'gasto', NULL, p_referencia,
          p_por, COALESCE(p_fecha, p_ahora), now() AT TIME ZONE 'UTC', p_clave)
  RETURNING "id", "monto" INTO v_pago;

  -- R8: el comprobante es opcional.
  IF p_comprobante_ruta IS NOT NULL THEN
    INSERT INTO "wallet_comprobante"
      ("id", "organizacion_id", "caja_movimiento_id", "storage_path", "content_type", "subido_por", "created_at")
    VALUES ((gen_random_uuid())::text, p_org, v_pago."id", p_comprobante_ruta, p_comprobante_tipo, p_por,
            now() AT TIME ZONE 'UTC');
  END IF;

  -- Con el monto ya guardado en DECIMAL(12,2): la suma del reparto se compara con lo que queda en el libro.
  PERFORM _pago_plataforma_aplicar(p_org, v_pago."id", v_pago."monto", p_aplicaciones, p_por, p_ahora, true);
  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_registrar_por_fuera(text, text, numeric, timestamp, text, text, jsonb,
                                                               text, timestamp, text, text) FROM PUBLIC;

-- ─── 6. Anular un pago confirmado (§3.4; R21–R27) ───────────────────────────────────────────────────
-- Devuelve 'ok' o 'ya_anulado'; si no, SL060 (`pago_no_encontrado`, `pago_no_confirmado`, `motivo_vacio`).
-- Escribe lo mismo que `EgresoCajaAnulacionService` (T0.2): la constancia con el motivo en
-- `ajuste_caja_anulacion` y el contra-asiento `ingreso_ajuste` con origen `gasto`, que devuelve el monto a la
-- caja. Antes, la fila de `pago_plataforma_anulacion`: es lo que deja pasar el contra-asiento en el trigger de
-- §7. Sin historial (P6). No toca `factura_plataforma` ni las aplicaciones (R30): el saldo vuelve por §3.
CREATE FUNCTION pago_plataforma_anular_confirmado(p_org text, p_pago_id text, p_motivo text, p_por text,
                                                  p_ahora timestamp) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pago          record;
  v_confirmacion  text;
BEGIN
  -- R24: con el mismo candado, dos anulaciones a la vez del mismo pago se serializan y solo una escribe.
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org));

  SELECT p."id", p."monto", p."descripcion" INTO v_pago
    FROM "wallet_movimiento" p
   WHERE p."id" = p_pago_id AND p."organizacion_id" = p_org
     AND p."tipo" = 'egreso' AND p."categoria" = 'egreso_pago_plataforma';
  -- R25: no existe o es de otra empresa.
  IF v_pago."id" IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'pago_no_encontrado')::text;
  END IF;
  -- R24, R27: ya tiene su contra-asiento.
  IF EXISTS (
    SELECT 1 FROM "wallet_movimiento" a
     WHERE a."organizacion_id" = p_org AND a."tipo" = 'ingreso' AND a."categoria" = 'ingreso_ajuste'
       AND a."origen_tipo" = 'gasto' AND a."origen_id" = v_pago."id"
  ) THEN
    RETURN 'ya_anulado';
  END IF;
  -- R25: uno por confirmar se rechaza (SLT-142), no se anula aquí.
  SELECT c."id" INTO v_confirmacion
    FROM "pago_plataforma_confirmacion" c
   WHERE c."organizacion_id" = p_org AND c."pago_id" = v_pago."id";
  IF v_confirmacion IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'pago_no_confirmado')::text;
  END IF;
  -- R23: el servicio ya lo filtra; esto es la red.
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'motivo_vacio')::text;
  END IF;

  INSERT INTO "pago_plataforma_anulacion" ("organizacion_id", "confirmacion_id", "anulado_por", "anulado_at")
  VALUES (p_org, v_confirmacion, p_por, p_ahora);

  INSERT INTO "ajuste_caja_anulacion" ("id", "organizacion_id", "movimiento_id", "motivo", "anulado_por", "created_at")
  VALUES ((gen_random_uuid())::text, p_org, v_pago."id", btrim(p_motivo), p_por, now() AT TIME ZONE 'UTC');

  INSERT INTO "wallet_movimiento"
    ("id", "organizacion_id", "tipo", "categoria", "monto", "origen_tipo", "origen_id", "descripcion",
     "registrado_por", "fecha_movimiento", "created_at")
  VALUES ((gen_random_uuid())::text, p_org, 'ingreso', 'ingreso_ajuste', v_pago."monto", 'gasto', v_pago."id",
          'Anulación de: ' || COALESCE(v_pago."descripcion", 'Pago a la plataforma'),
          p_por, p_ahora, now() AT TIME ZONE 'UTC');

  RETURN 'ok';
END $$;
REVOKE EXECUTE ON FUNCTION pago_plataforma_anular_confirmado(text, text, text, text, timestamp) FROM PUBLIC;

-- ─── 7. La empresa no anula un pago confirmado; la plataforma sí (§3.5; R15, R29) ───────────────────
-- Cuerpo de 20261116120000 §9 con UNA condición más: no cuenta la confirmación que ya tiene su anulación de la
-- plataforma. `servi_app` no puede escribir `pago_plataforma_anulacion` (§1), así que la empresa sigue rechazada
-- por cualquier camino, y el dueño también si escribe el contra-asiento a mano sin la anulación (R29). El
-- REVOKE de EXECUTE se conserva con el OR REPLACE.
CREATE OR REPLACE FUNCTION pago_plataforma_no_anular_confirmado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."organizacion_id" IS NULL OR NEW."origen_id" IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));
  IF EXISTS (SELECT 1 FROM "pago_plataforma_confirmacion" c
              WHERE c."organizacion_id" = NEW."organizacion_id" AND c."pago_id" = NEW."origen_id"
                AND NOT EXISTS (SELECT 1 FROM "pago_plataforma_anulacion" n
                                 WHERE n."organizacion_id" = c."organizacion_id" AND n."confirmacion_id" = c."id")) THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060',
      MESSAGE = jsonb_build_object('codigo', 'pago_confirmado', 'pago_id', NEW."origen_id")::text;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
