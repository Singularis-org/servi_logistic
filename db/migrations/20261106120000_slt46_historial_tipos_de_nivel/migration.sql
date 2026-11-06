-- SLT-46 (design §2.3, §7; R37) — el historial de plataforma de los tipos de nivel geográfico.
--
-- `tipo_nivel_geografico_creado` lo escriben el alta de país (uno por tipo, `detalle.origen =
-- "alta_de_pais"`) y agregar un nivel (`detalle.origen = "nivel_agregado"`); `…_renombrado`, la
-- edición de los nombres de un tipo (una fila por nombre cambiado, `detalle.campo`). La entidad es
-- `tipo_nivel_geografico`. Ninguna fila existente cambia.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
-- `IF NOT EXISTS` hace que reaplicar la ida después de su `down.sql` (que no quita los valores) no falle.
--
-- Solo aditiva (R8). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_nivel_geografico_creado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_nivel_geografico_renombrado';
ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'tipo_nivel_geografico';
