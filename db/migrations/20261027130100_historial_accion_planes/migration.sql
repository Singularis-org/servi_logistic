-- SL-24 (design §9) — asignar o cambiar el plan de una empresa queda en su historial de acciones (R29).
--
-- Un tipo, `plan_asignado`, y la entidad `plan`. `entidad_id` es el id del plan nuevo: opaco y sin
-- FK, como el resto. La fila es de la empresa y el actor es el superadmin. Crear, editar y archivar un
-- plan NO van aquí: son de plataforma y van a `plan_rastro` (20261027130000).
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
-- Nada aquí escribe filas; el primer uso ocurre en runtime.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'plan_asignado';

ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'plan';
