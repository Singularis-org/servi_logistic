-- SLT-77 (T1.1, design §1.1 y §2.3, R10) — el rastro del cambio de tope en el historial de acciones.
--
-- `tope_intentos_cambiado` (mueve dinero): bajar el tope adelanta rechazos, y un rechazo genera cobro. La
-- entidad `organizacion` es 1:1 con su tabla (criterio de la 381/457).
--
-- VA SOLA: Postgres prohibe USAR un valor de enum en la misma transaccion que lo añade (55P04), el mismo
-- motivo que `20261104140000`.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'tope_intentos_cambiado';
ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'organizacion';
