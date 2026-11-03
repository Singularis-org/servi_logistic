-- DOWN (SLT-75, T2, R12) — quita el indice unico por empresa. Revertir ESTA antes que
-- 20261101090000 (su down.sql reinserta filas que el indice rechazaria).
DROP INDEX IF EXISTS "zona_distrito_organizacion_id_distrito_id_key";
