-- SLT-52 (T1.4, design §3, R14) — el rastro de los cambios del modelo nuevo de tarifas en el
-- historial de acciones.
--
-- Cinco tipos y dos entidades, 1:1 con sus tablas (criterio de la 381/457):
--   · `tarifa_valor_fijado`, `tarifa_valor_quitado` (mueve dinero): cambian lo que se cobra o paga.
--   · `grupo_distritos_creado`, `grupo_distritos_cambiado` (mueve dinero): mover un distrito de grupo
--     cambia el valor que se resuelve para sus ordenes.
--   · `grupo_distritos_borrado` (hace desaparecer algo): se lleva sus valores por cascada, como
--     `tarifa_borrada`.
--
-- VA SOLA: Postgres prohibe USAR un valor de enum en la misma transaccion que lo añade (55P04).
-- Nada aqui escribe filas; el primer uso llega con los services de T6. Mismo patron que
-- `20261102090000_slt76_historial_zona_distrito`. ADITIVA (R44): sin tablas, columnas ni datos.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'tarifa_valor_fijado';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'tarifa_valor_quitado';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'grupo_distritos_creado';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'grupo_distritos_cambiado';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'grupo_distritos_borrado';

ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'tarifa_valor';
ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'grupo_distritos';
