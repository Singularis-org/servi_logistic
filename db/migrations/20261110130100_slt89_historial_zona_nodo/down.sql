-- DOWN de SLT-89 20261110130100 — NO HACE NADA, a propósito (design §2.4, R33), como el de
-- 20261106120000 (SLT-46).
--
-- Postgres no tiene `ALTER TYPE … DROP VALUE`: quitar `zona_nodo_cambiado` exige recrear
-- `historial_accion_tipo` (`RENAME` + `CREATE TYPE` + `ALTER COLUMN … TYPE`), y la épica GEO prohíbe
-- renombrar o recrear enums. El valor sin usar es inocuo: tras bajar 20261110130000 nada lo escribe.
-- Si hubiera filas con él, se quedan y la pantalla del historial las sigue etiquetando.
--
-- Volver a aplicar la ida no falla: usa `ADD VALUE IF NOT EXISTS`.

SELECT 1;
