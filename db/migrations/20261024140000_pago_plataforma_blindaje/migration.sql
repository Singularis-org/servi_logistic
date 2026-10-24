-- SL-45 (review B1) — cierra en la base las vías por las que una empresa, con SQL a mano como
-- `servi_app`, bajaba su deuda con la plataforma (R9, R10, R17). Va en una migración nueva: las dos
-- de SL-45 ya están empujadas y no se editan.
--
-- Los cuatro ataques de la review, medidos como `servi_app` de la empresa:
--   a) UPDATE del monto de un pago                      → la deuda queda a favor de la empresa
--   b) DELETE del contra-asiento de un pago anulado      → el pago anulado vuelve a contar
--   c) INSERT a mano de un pago mayor que la deuda       → sobrepago sin tope
--   d) UPDATE de la categoría de un sueldo a pago        → «al día» sin que salga más dinero
--
-- 1. a), b) y d): REVOKE UPDATE, DELETE y no un trigger acotado a la categoría.
--   · La app nunca cambia ni borra una fila de `wallet_movimiento`: el libro es append-only y toda
--     anulación es un contra-asiento. Medido el 2026-10-24 en `lib/`, `app/` y `scripts/`: ningún
--     `walletMovimiento.update/updateMany/upsert/delete/deleteMany`, ningún `UPDATE`/`DELETE FROM`
--     a mano y ningún `SELECT … FOR UPDATE` sobre la tabla (que también pide UPDATE). La guardia
--     `pago-plataforma-inmutable-sl45` lo mantiene así.
--   · Las escrituras del libro son `createMany({ skipDuplicates })` = `INSERT … ON CONFLICT DO NOTHING`,
--     que solo pide INSERT.
--   · Las acciones referenciales (`registrado_por ON DELETE SET NULL`, …) corren como dueño: el REVOKE
--     no las frena. Las limpiezas de los tests corren con el cliente base, también como dueño.
--   · Cierra de paso la deuda previa: una empresa ya no puede reescribir su propia caja.
REVOKE UPDATE, DELETE ON "wallet_movimiento" FROM servi_app;

-- 2. c): el tope del pago también en la base, no solo en `TopePagoPlataformaService`.
--   · Misma regla que R13: Σ cargo − Σ reverso de `cobro_plataforma_movimiento` − Σ pagos vigentes
--     (los que no tienen `ingreso_ajuste` con `origen_tipo = 'gasto'` y `origen_id` = el pago).
--   · Mismo rechazo que R9: sin deuda (cero o a favor) no se paga, y nunca más de lo que se debe.
--     Igual a la deuda, cabe.
--   · Concurrencia (R10): toma el MISMO candado que `PagoPlataformaRepository.bloquear`, por empresa.
--     En la app ya lo tiene la transacción (el candado es reentrante). Para un INSERT a mano, el segundo
--     espera al COMMIT del primero; en READ COMMITTED cada sentencia de la función toma una foto nueva,
--     así que lee la deuda con el primero ya restado.
--   · Un INSERT de varias filas pasa por aquí fila a fila, y cada fila ve las anteriores de la misma
--     sentencia: tampoco se pasa del tope.
--   · SECURITY DEFINER: lee los cargos y los pagos como dueño, filtrando por la empresa de la fila, sin
--     depender de la RLS de quien inserta.
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

REVOKE EXECUTE ON FUNCTION wallet_movimiento_tope_pago_plataforma() FROM PUBLIC;

-- Solo el egreso: un `ingreso` con esta categoría ya lo rechaza el CHECK tipo<->categoría (23514) con
-- su propio nombre, y así ese rechazo sigue siendo el del CHECK.
CREATE TRIGGER "wallet_movimiento_tope_pago_plataforma" BEFORE INSERT ON "wallet_movimiento"
  FOR EACH ROW WHEN (NEW."categoria" = 'egreso_pago_plataforma' AND NEW."tipo" = 'egreso')
  EXECUTE FUNCTION wallet_movimiento_tope_pago_plataforma();
