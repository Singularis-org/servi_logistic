-- DOWN de SLT-226 (design §3.10; R28) — quita el modelo del cobro en línea: las funciones y los triggers nuevos,
-- `cobro_webhook_evento`, `cobro_intento` y la confirmación sin persona; repone los cuerpos LITERALES del tope
-- (20261116120000 §8) y de `_pago_plataforma_aplicar` de 7 argumentos (20261121130000 §4).
--
-- ABORTA si ya hay intentos: un intento aprobado tiene su «Pago a la plataforma» confirmado sin persona, un estado
-- que SLT-60 no conoce (y `confirmado_por` no podría volver a NOT NULL). Es el molde de SLT-143 §3.7: no se borra
-- nada y se pide resolverlo a mano. Sin intentos no puede haber confirmaciones `en_linea`.
--
-- ORDEN: va ANTES del down de 20261124130000_cobro_historial_enum, que quita los valores del historial.

BEGIN;

-- ─── 0. La guarda ───────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM "cobro_intento";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SLT-226: % filas en cobro_intento; se aborta sin borrar nada', v_n;
  END IF;
END $$;

-- ─── 1. Los cuerpos anteriores, literales ───────────────────────────────────────────────────────────
-- El tope de 20261116120000 §8, sin la salida del pago en línea. El REVOKE se conserva con el OR REPLACE.
CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_disponible numeric(14, 2);
BEGIN
  IF NEW."organizacion_id" IS NULL THEN
    RAISE EXCEPTION 'pago a la plataforma sin empresa' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));

  -- R11: el reenvío con la misma clave no es un pago nuevo. La app lo escribe con
  -- `INSERT … ON CONFLICT DO NOTHING`, y el trigger corre ANTES del choque con el único
  -- `(organizacion_id, clave_idempotencia)`: se deja pasar para que el ON CONFLICT lo descarte (o, en
  -- un INSERT sin ON CONFLICT, el único lo rechace con 23505). Ninguna de las dos escribe una fila.
  IF NEW."clave_idempotencia" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "wallet_movimiento" r
     WHERE r."organizacion_id" = NEW."organizacion_id" AND r."clave_idempotencia" = NEW."clave_idempotencia"
  ) THEN
    RETURN NEW;
  END IF;

  -- SLT-60 (R2, R3): solo se paga lo facturado y no comprometido por otro pago por confirmar. El texto del
  -- RAISE se deja literal: `caja-tesoreria-migration.test.ts` lo lee, y la app no lo muestra (pinta R36).
  v_disponible := pago_plataforma_disponible_de(NEW."organizacion_id");
  IF v_disponible <= 0 OR NEW."monto" > v_disponible THEN
    RAISE EXCEPTION 'el pago a la plataforma (%) supera la deuda vigente de la empresa (%)', NEW."monto", v_disponible
      USING ERRCODE = 'check_violation', CONSTRAINT = 'wallet_movimiento_tope_pago_plataforma';
  END IF;
  RETURN NEW;
END $$;

-- El reparto de 20261121130000 §4 (antes de delegar en la sobrecarga). Después, la sobrecarga ya no tiene quien
-- la llame y se quita.
CREATE OR REPLACE FUNCTION _pago_plataforma_aplicar(p_org text, p_pago_id text, p_monto numeric, p_aplicaciones jsonb,
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

DROP FUNCTION _pago_plataforma_aplicar(text, text, numeric, jsonb, text, timestamp, boolean, boolean);

-- ─── 2. Las funciones y los triggers nuevos ─────────────────────────────────────────────────────────
DROP TRIGGER "cobro_intento_saldo_aplicacion" ON "pago_plataforma_aplicacion";
DROP TRIGGER "cobro_intento_saldo_anulacion" ON "pago_plataforma_anulacion";
DROP FUNCTION cobro_intento_anular_por_saldo();
DROP FUNCTION cobro_evento_registrar(text, text, text, text, timestamp);
DROP FUNCTION cobro_evento_cerrar(text, text, text, text, timestamp);
DROP FUNCTION cobro_registrar_pago_aprobado(text, text, text, numeric, text, timestamp);
DROP FUNCTION cobro_intento_avanzar(text, text, text, timestamp);
DROP FUNCTION cobro_intento_registrar_enlace(text, text, text, timestamp);
DROP FUNCTION cobro_intento_obtener_o_crear(text, text, text, text, text, timestamp);
DROP FUNCTION _cobro_intento_pasar(text, text, text, timestamp);
DROP FUNCTION _cobro_historial("cobro_intento", text, text);

-- ─── 3. Las tablas, con sus triggers ────────────────────────────────────────────────────────────────
-- Las funciones de SL-17 (`verificar_misma_empresa`, `impedir_cambio_de_empresa`) son anteriores y se quedan.
DROP TABLE "cobro_webhook_evento";
DROP FUNCTION cobro_webhook_evento_inmutable();
DROP TABLE "cobro_intento";
DROP FUNCTION cobro_intento_solo_avanza();

-- ─── 4. La confirmación vuelve a pedir persona ──────────────────────────────────────────────────────
-- Sin intentos (paso 0) no hay confirmaciones sin persona: el SET NOT NULL no falla.
ALTER TABLE "pago_plataforma_confirmacion" DROP CONSTRAINT "pago_plataforma_confirmacion_quien";
ALTER TABLE "pago_plataforma_confirmacion" DROP COLUMN "en_linea";
ALTER TABLE "pago_plataforma_confirmacion" ALTER COLUMN "confirmado_por" SET NOT NULL;

COMMIT;
