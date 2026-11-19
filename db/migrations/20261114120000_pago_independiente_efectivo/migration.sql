-- SLT-123 (design §2 y §3.2-SLT-123; R310-R312, D5, D6) — la marca de la regla de pago al mensajero.
--
-- `pago_independiente_efectivo = true`: el pago al mensajero de ESTE cierre es independiente del
-- efectivo que recaudo (el libro solo devenga P; lo pendiente es P completo). `false`: la regla de la
-- feature 44 (`pago_efectivo = min(P,E)`). La pone el codigo al aprobar un cierre de la central.
--
-- `DEFAULT false` y SIN backfill: los cierres ya aprobados quedan con la regla de siempre sin escribir
-- una sola fila. Postgres >= 11 anade una columna con DEFAULT constante sin reescribir la tabla: ningun
-- UPDATE (R312). Los permisos de `servi_app` sobre `cierre_dia` son de tabla, no por columna (T0.3):
-- no hace falta GRANT.
ALTER TABLE "cierre_dia"
  ADD COLUMN "pago_independiente_efectivo" BOOLEAN NOT NULL DEFAULT false;
