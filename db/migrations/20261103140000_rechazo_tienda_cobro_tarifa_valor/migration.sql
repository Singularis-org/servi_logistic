-- SLT-52 T4.6 (design §12.2, R48-R50) — traza del `tarifa_valor` usado en el cobro por rechazo.
--
-- Hasta aqui `rechazo_tienda_cobro` solo podia citar una fila de `tarifas` (modelo viejo) y, en el
-- modelo nuevo, se quedaba sin traza. Esta columna guarda QUE valor `tienda_flete_rechazo` produjo
-- los importes congelados.
--
-- R44/R50: solo esquema. Ninguna fila se mueve: las existentes quedan con la columna en NULL, sin
-- backfill, y por eso el CHECK vale sin `NOT VALID`.
-- Multi-empresa: la politica `rechazo_tienda_cobro_por_empresa` ya cubre la columna; el trigger de
-- misma empresa de la FK nueva va en la migracion siguiente, generada.

ALTER TABLE "rechazo_tienda_cobro" ADD COLUMN "tarifa_valor_id" TEXT;

-- R49: un cobro sale de UN modelo. Las dos referencias a la vez seria una traza contradictoria.
ALTER TABLE "rechazo_tienda_cobro" ADD CONSTRAINT "rechazo_tienda_cobro_una_tarifa"
  CHECK ("tarifa_id" IS NULL OR "tarifa_valor_id" IS NULL);

-- La FK SET NULL: borrar un valor busca por aqui los cobros que lo citan.
CREATE INDEX "rechazo_tienda_cobro_tarifa_valor_id_idx" ON "rechazo_tienda_cobro"("tarifa_valor_id");

-- SET NULL (precedente 337, igual que `cierre_detail_concepto.tarifa_valor_id`): la traza es
-- deseable, nunca un bloqueo para borrar el valor (R50). Los importes ya viajan COPIADOS en
-- `monto_flete`/`monto_iva` y no dependen de la fila citada.
ALTER TABLE "rechazo_tienda_cobro" ADD CONSTRAINT "rechazo_tienda_cobro_tarifa_valor_id_fkey"
  FOREIGN KEY ("tarifa_valor_id") REFERENCES "tarifa_valor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
