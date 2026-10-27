-- SL-23 (design §4.3) — el rastro de encender y apagar módulos en el historial de acciones (R12).
--
-- Dos tipos, uno por operación, y la entidad `organizacion_modulo`, 1:1 con su tabla como las demás
-- del enum. `entidad_id` es el id de la fila creada o borrada: opaco y sin FK, así que sobrevive al
-- borrado de la fila al apagar. La fila del historial es de la empresa y el actor es el superadmin.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
-- Nada aquí escribe filas; el primer uso ocurre en runtime.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'modulo_activado';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'modulo_desactivado';

ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'organizacion_modulo';
