-- Revierte 20260709120000_seed_maestro_user: no hace nada, a proposito.
--
-- La migracion solo asegura dos catalogos (rol 'maestro', tipo_identificacion 'cedula').
-- Este down nunca los borro: pudieron existir antes (scripts/seed-catalogos.ts u otras
-- migraciones) y otros registros dependen de ellos. Y ya no hay usuario que borrar:
-- desde SL-11 la migracion no inserta ninguno.
SELECT 1;
