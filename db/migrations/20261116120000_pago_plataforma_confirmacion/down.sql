-- DOWN de SLT-60 (design §3.8; R29) — quita la confirmación del pago a la plataforma: los dos triggers nuevos de
-- `wallet_movimiento`, las dos tablas (con sus triggers de misma empresa, sin cambio de empresa e inmutable), las
-- funciones nuevas, y repone el tope del registro de SLT-118 con el cuerpo LITERAL de 20261111130100 §9.
--
-- Las confirmaciones y aplicaciones que hubiera se pierden con las tablas: sus pagos vuelven a contar como
-- vigentes en la deuda y en el tope de SLT-118, que es lo que eran antes de esta migración.

BEGIN;

-- ─── 1. Los dos triggers nuevos de `wallet_movimiento` ──────────────────────────────────────────────
-- El del tope no se quita: se repone su función en el paso 4.
DROP TRIGGER "pago_plataforma_no_anular_confirmado" ON "wallet_movimiento";
DROP FUNCTION pago_plataforma_no_anular_confirmado();

-- ─── 2. Las tablas, con sus triggers ────────────────────────────────────────────────────────────────
-- Los triggers caen con la tabla. La aplicación va antes: su FK apunta a la confirmación.
DROP TABLE "pago_plataforma_aplicacion";
DROP TABLE "pago_plataforma_confirmacion";
DROP FUNCTION pago_plataforma_inmutable();

-- ─── 3. Las funciones nuevas ────────────────────────────────────────────────────────────────────────
-- Las de SQL ya no tienen tablas que leer, pero siguen definidas: van en orden de dependencia.
DROP FUNCTION pago_plataforma_confirmar(text, text, jsonb, text, timestamp);
DROP FUNCTION pago_plataforma_disponible(text);
DROP FUNCTION pago_plataforma_disponible_de(text);
DROP FUNCTION pago_plataforma_por_confirmar(text);
DROP FUNCTION factura_plataforma_saldos(text);

-- ─── 4. El tope del pago, como lo dejó 20261111130100 §9 (SLT-118) ───────────────────────────────────
-- El REVOKE de EXECUTE se conserva con el OR REPLACE.
CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_cargos numeric(14, 2);
  v_pagos  numeric(14, 2);
  v_deuda  numeric(14, 2);
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

  SELECT COALESCE(SUM(CASE WHEN c."tipo" = 'cargo' THEN c."monto" ELSE -c."monto" END), 0)
    INTO v_cargos
    FROM "cobro_plataforma_movimiento" c
   WHERE c."organizacion_id" = NEW."organizacion_id";

  -- SLT-118 (R18, P2, P18): las dos cuotas de las facturas cerradas suman a la deuda; la en curso y la por
  -- cerrar, no.
  v_cargos := v_cargos + (SELECT COALESCE(SUM(COALESCE(f."cuota", 0) + COALESCE(f."primera_cuota", 0)), 0)
                            FROM "factura_plataforma" f
                           WHERE f."organizacion_id" = NEW."organizacion_id" AND f."estado" = 'cerrada');

  SELECT COALESCE(SUM(p."monto"), 0)
    INTO v_pagos
    FROM "wallet_movimiento" p
   WHERE p."organizacion_id" = NEW."organizacion_id"
     AND p."tipo" = 'egreso'
     AND p."categoria" = 'egreso_pago_plataforma'
     AND NOT EXISTS (
       SELECT 1 FROM "wallet_movimiento" a
        WHERE a."organizacion_id" = NEW."organizacion_id"
          AND a."tipo" = 'ingreso'
          AND a."categoria" = 'ingreso_ajuste'
          AND a."origen_tipo" = 'gasto'
          AND a."origen_id" = p."id"
     );

  v_deuda := v_cargos - v_pagos;
  IF v_deuda <= 0 OR NEW."monto" > v_deuda THEN
    RAISE EXCEPTION 'el pago a la plataforma (%) supera la deuda vigente de la empresa (%)', NEW."monto", v_deuda
      USING ERRCODE = 'check_violation', CONSTRAINT = 'wallet_movimiento_tope_pago_plataforma';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
