-- SLT-54 (T1.1, design §2.2, R4) — el rastro de la activacion de tarifas en el historial de acciones.
--
-- `tarifas_activadas` (mueve dinero): desde ese momento la empresa cobra y paga con otro modelo. La
-- entidad `tarifa_activacion` es 1:1 con su tabla (criterio de la 381/457).
--
-- VA SOLA: Postgres prohibe USAR un valor de enum en la misma transaccion que lo añade (55P04). Por
-- eso, ademas, el relleno de `20261104140100_tarifa_activacion` no podria dejar historial aunque
-- quisiera; y no quiere, porque esas activaciones no tienen actor.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'tarifas_activadas';
ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'tarifa_activacion';
