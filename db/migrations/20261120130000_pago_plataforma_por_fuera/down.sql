-- DOWN de SLT-143 (design §3.7; R33) — quita el registro por fuera y la anulación de la plataforma: repone los
-- cuerpos LITERALES de 20261116120000 (SLT-60) de las tres funciones que la migración cambió, quita las tres
-- funciones nuevas, la tabla `pago_plataforma_anulacion` (con sus triggers) y la columna `por_fuera`.
--
-- ABORTA si ya hay anulaciones de la plataforma: sus pagos tienen confirmación Y contra-asiento, un estado que
-- SLT-60 no conoce (su saldo volvería a contar lo aplicado y la deuda no cuadraría con la caja). Es el molde de
-- `quitar_valores_de_enum` de SL-45: no se borra nada y se pide resolverlo a mano.
-- Los pagos registrados por fuera SÍ se revierten: quedan como pagos confirmados de SLT-60, sin la marca.

BEGIN;

-- ─── 0. La guarda ───────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM "pago_plataforma_anulacion";
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SLT-143: % filas en pago_plataforma_anulacion; se aborta sin borrar nada', v_n;
  END IF;
END $$;

-- ─── 1. Los cuerpos de 20261116120000, literales (§5, §7 y §9 de esa migración) ─────────────────────
-- Los REVOKE de EXECUTE se conservan con el OR REPLACE.
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
                GROUP BY ap."factura_id") a ON a."factura_id" = f."id"
   WHERE f."organizacion_id" = p_org AND f."estado" = 'cerrada'
   ORDER BY f."desde_at";
$$;

CREATE OR REPLACE FUNCTION pago_plataforma_confirmar(p_org text, p_pago_id text, p_aplicaciones jsonb, p_por text,
                                          p_ahora timestamp) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pago          record;
  v_elemento      jsonb;
  v_factura_id    text;
  v_monto         numeric(14, 2);
  v_saldo         numeric(14, 2);
  v_suma          numeric(14, 2) := 0;
  v_vistas        text[] := ARRAY[]::text[];
  v_validas       jsonb := '[]'::jsonb;
  v_confirmacion  text;
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

  FOR v_elemento IN
    SELECT e FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_aplicaciones) = 'array'
                                            THEN p_aplicaciones ELSE '[]'::jsonb END) e
  LOOP
    v_factura_id := v_elemento ->> 'factura_id';
    -- R15: cerrada, de esta empresa y con saldo.
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
    -- R17: nunca más que el saldo de su factura.
    IF v_monto > v_saldo THEN
      RAISE EXCEPTION USING ERRCODE = 'SL060',
        MESSAGE = jsonb_build_object('codigo', 'supera_saldo', 'factura_id', v_factura_id)::text;
    END IF;
    v_vistas := v_vistas || v_factura_id;
    v_suma := v_suma + v_monto;
    v_validas := v_validas || jsonb_build_array(jsonb_build_object('factura_id', v_factura_id, 'monto', v_monto));
  END LOOP;

  -- R17: el reparto suma exactamente el monto del pago.
  IF v_suma <> v_pago."monto" THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060', MESSAGE = jsonb_build_object('codigo', 'suma_distinta')::text;
  END IF;

  INSERT INTO "pago_plataforma_confirmacion" ("organizacion_id", "pago_id", "confirmado_por", "confirmado_at")
  VALUES (p_org, v_pago."id", p_por, p_ahora)
  RETURNING "id" INTO v_confirmacion;

  INSERT INTO "pago_plataforma_aplicacion" ("organizacion_id", "confirmacion_id", "factura_id", "monto")
  SELECT p_org, v_confirmacion, a ->> 'factura_id', (a ->> 'monto')::numeric(14, 2)
    FROM jsonb_array_elements(v_validas) a;

  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION pago_plataforma_no_anular_confirmado() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."organizacion_id" IS NULL OR NEW."origen_id" IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pago_plataforma:' || NEW."organizacion_id"));
  IF EXISTS (SELECT 1 FROM "pago_plataforma_confirmacion" c
              WHERE c."organizacion_id" = NEW."organizacion_id" AND c."pago_id" = NEW."origen_id") THEN
    RAISE EXCEPTION USING ERRCODE = 'SL060',
      MESSAGE = jsonb_build_object('codigo', 'pago_confirmado', 'pago_id', NEW."origen_id")::text;
  END IF;
  RETURN NEW;
END $$;

-- ─── 2. Las funciones nuevas ────────────────────────────────────────────────────────────────────────
-- `pago_plataforma_confirmar` ya no llama a `_pago_plataforma_aplicar` (paso 1): se puede quitar.
DROP FUNCTION pago_plataforma_registrar_por_fuera(text, text, numeric, timestamp, text, text, jsonb, text, timestamp,
                                                  text, text);
DROP FUNCTION pago_plataforma_anular_confirmado(text, text, text, text, timestamp);
DROP FUNCTION _pago_plataforma_aplicar(text, text, numeric, jsonb, text, timestamp, boolean);

-- ─── 3. La tabla, con sus triggers ──────────────────────────────────────────────────────────────────
-- Las funciones de sus triggers (`verificar_misma_empresa`, `impedir_cambio_de_empresa`,
-- `pago_plataforma_inmutable`) son anteriores y se quedan.
DROP TABLE "pago_plataforma_anulacion";

-- ─── 4. La columna ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "pago_plataforma_confirmacion" DROP COLUMN "por_fuera";

COMMIT;
