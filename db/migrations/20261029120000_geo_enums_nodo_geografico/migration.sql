-- SLT-43 (design §2.5, R23) — `nodo_geografico` como entidad de los dos historiales.
--
-- `historial_accion_entidad` es el enum de entidades de `historial_accion` (el de tipos,
-- `historial_accion_tipo`, ya tiene los `nodo_geografico_*`). `historial_plataforma_entidad` es el
-- de `historial_plataforma`, donde SL-20 registra la geografía. Nadie escribe este valor en SLT-43:
-- lo usará SLT-46. Las filas viejas de provincia/cantón/distrito no se tocan.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
-- `IF NOT EXISTS` hace que reaplicar la ida después de su `down.sql` (que no quita el valor) no falle.

ALTER TYPE "historial_accion_entidad" ADD VALUE IF NOT EXISTS 'nodo_geografico';
ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'nodo_geografico';
