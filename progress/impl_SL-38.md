# SL-38 «Distritos de zona especial por empresa» — bitácora de implementación

Spec: `specs/SL-38-zona-especial-por-empresa/` (commit `b16688a`), aprobado por Carlos el 2026-10-23
con P1: el Excel de cobertura queda con «Sí»/«No».

## Entorno

- Worktree `.worktrees/SL-38-zona-especial-por-empresa`, rama `feature/SL-38-zona-especial-por-empresa`.
- `node_modules` es un junction al del checkout principal, compartido con SL-32. `prisma generate`,
  el gate y el e2e corren dentro de un lock fuera del repo.
- Bases: Postgres local, solo bases desechables `sl38_*`. La base `servi-logistic` no se toca.

## T0 — Timestamps y base

- `origin/dev` (`197039c`): última migración `20261023090000_unicos_por_empresa`.
- `origin/feature/SL-32-rol-superadmin`: última migración `20261023100200_usuario_empresa_o_superadmin`.
- Las de SL-38, `20261023120000` y `20261023120100`, son posteriores a las dos. No se renumera nada.
- Base `sl38_base` recién creada + `prisma migrate deploy` (233 migraciones):
  `SELECT count(*) FROM distrito WHERE zona_especial IS TRUE` → **0** (de 494 distritos).
