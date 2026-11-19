-- DOWN de SLT-48 20261117120000 — NO HACE NADA, a propósito, como los de 20261106120000 (SLT-46) y
-- 20261110130100 (SLT-89).
--
-- Postgres no tiene `ALTER TYPE … DROP VALUE`: quitar `nodo_geografico_movido` exige recrear
-- `historial_plataforma_accion` (`RENAME` + `CREATE TYPE` + `ALTER COLUMN … TYPE`), y la guardia de
-- SLT-48 prohíbe `RENAME` (R14). El valor sin usar es inocuo: tras la vuelta nada lo escribe. Si hubiera
-- filas con él, se quedan.
--
-- Volver a aplicar la ida no falla: usa `ADD VALUE IF NOT EXISTS`.

SELECT 1;
