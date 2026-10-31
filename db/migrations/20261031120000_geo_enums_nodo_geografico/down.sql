-- DOWN de SLT-43 20261030120000 — NO HACE NADA, a propósito (design §3, R34).
--
-- Postgres no tiene `ALTER TYPE … DROP VALUE`: quitar `nodo_geografico` exige recrear los dos tipos
-- (`RENAME` + `CREATE TYPE` + `ALTER COLUMN … TYPE`), y la épica GEO prohíbe renombrar o recrear
-- enums hasta SLT-48 (requirements.md > Decisiones cerradas). El valor sin usar es inocuo: nada lo
-- escribe en SLT-43, y la pantalla de historial lo excluye de su filtro.
--
-- Volver a aplicar la ida no falla: usa `ADD VALUE IF NOT EXISTS`.

SELECT 1;
