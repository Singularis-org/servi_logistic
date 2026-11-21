-- SLT-225 — el rastro de DESACTIVAR y REACTIVAR una zona en el historial de acciones (R1749, R1750).
--
-- DOS TIPOS NUEVOS Y NINGUNA ENTIDAD NUEVA: `zona` ya esta en `historial_accion_entidad`. La categoria
-- («hace desaparecer algo») se deriva en codigo, como `nodo_geografico_desactivado`/`_activado`.
--
-- VA SOLA: Postgres prohibe USAR un valor de enum en la misma transaccion que lo añade (55P04) y
-- Prisma Migrate corre cada `migration.sql` en su propia transaccion. Mismo patron que
-- `20261107130000_historial_tope_intentos`.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'zona_desactivada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'zona_reactivada';
