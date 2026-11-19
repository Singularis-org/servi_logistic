-- SLT-48 (design §2.1, §7.1; R38) — el historial de plataforma de «mover un nodo».
--
-- `nodo_geografico_movido` lo escribe `GeoRepository.mover`, en la misma transacción que cambia el
-- `padre_id`, con la ruta del padre anterior y la del nuevo. La entidad es `nodo_geografico`, que ya
-- existe. Ninguna fila existente cambia.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
-- `IF NOT EXISTS` hace que reaplicar la ida después de su `down.sql` (que no quita el valor) no falle.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'nodo_geografico_movido';
