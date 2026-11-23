-- DOWN de SLT-46 20261106120000 — NO HACE NADA, a propósito (design §3, R9), como 20261104120000.
--
-- Postgres no tiene `ALTER TYPE … DROP VALUE`: quitar los tres valores exige recrear los dos tipos
-- (`RENAME` + `CREATE TYPE` + `ALTER COLUMN … TYPE`), y la épica GEO prohíbe renombrar o recrear
-- enums hasta SLT-48. Los valores sin usar son inocuos: tras la vuelta nada los escribe.
--
-- Volver a aplicar la ida no falla: usa `ADD VALUE IF NOT EXISTS`.

SELECT 1;
