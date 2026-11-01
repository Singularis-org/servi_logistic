-- SLT-76 (design §9.1, R17, R19) — retira los respaldos de SLT-73 y SLT-75.
--
-- Carlos lo decidió el 2026-11-01, tras verificar en prod que SLT-73 y SLT-75 quedaron bien. ES
-- IRREVERSIBLE: desde aquí, el down de SLT-73 falla y el de datos de SLT-75 no hace nada (§9.2).
--
-- Un único bloque `DO`: todo o nada. Se borran SOLO las dos tablas de esas fichas. El esquema
-- `respaldo` se borra solo si queda vacío: sin CASCADE, Postgres rechaza el DROP con `2BP01` si queda
-- otro objeto, y el sub-bloque atrapa ESE error y deja lo ajeno intacto, con sus filas. Es el mismo
-- sub-bloque que ya usan los down de SLT-73 y SLT-75.
--
-- No toca `public` (R19): ni `zona_distrito`, ni los libros. Prisma solo compara `public`, así que
-- `schema.prisma` no cambia y no hay drift.
DO $slt76$
BEGIN
  DROP TABLE IF EXISTS respaldo.slt73_asientos;
  DROP TABLE IF EXISTS respaldo.slt75_zona_distrito_duplicado;
  BEGIN
    DROP SCHEMA IF EXISTS respaldo;
  EXCEPTION WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'slt76: el esquema respaldo conserva objetos de otra ficha; se deja';
  END;
END
$slt76$;
