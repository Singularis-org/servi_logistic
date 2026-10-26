# impl SL-23 — Catálogo de módulos y módulos activos por empresa

Worktree: `.worktrees/SL-23-catalogo-modulos`, rama `feature/SL-23-catalogo-modulos`.

## T0 — Orden de migraciones y base de pruebas (2026-10-26)

- `git fetch origin` + `git ls-tree origin/dev db/migrations/`: la última migración de `origin/dev`
  sigue siendo `20261025160100_entorno_marca`. Las tres de T1 (`20261026120000`, `20261026120100`,
  `20261026120200`) van detrás sin renumerar.
- Base propia de la feature: `logistic_sl23` en el Postgres local (`localhost:5432`), creada
  vacía, `prisma migrate deploy` + `pnpm run db:seed` en verde. `DATABASE_URL` se exporta en la
  sesión apuntando a ella (mismas credenciales del `.env` local, solo cambia el nombre de la base);
  el `.env` no se copia al worktree.

