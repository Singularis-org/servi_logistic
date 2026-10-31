# SLT-44 «Geografía jerárquica: dominio y repositorios»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-44 | geo-jerarquica-dominio | backend | high | feature/SLT-44-geo-jerarquica-dominio | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-30): tomada en Trello y worktree creado. La rama nace de `dev` y lleva mergeado
`feature/SLT-43-geo-jerarquica-modelo` (PR #44, todavía sin mergear) como base.
F1.1 (`/afinar-feature`) y F1.2 (spec R1–R26, `9b0cba7`) hechos. F1.4: spec aprobado por escrito por
Camilo («Aprobado», 2026-10-30); tarjeta movida a «En curso».
F2.1 (2026-10-31): T0–T6 hechas y T7.1 local en verde (`progress/impl_SLT-44.md`). Sin push. Pendiente:
`gate-completo` del PR (T7.1) y T7.2, puerta humana: `pnpm geo:equivalencia-dinero` sobre una copia de producción.
R25 literal no sale vacío hasta que el PR #44 (SLT-43) entre en `dev`. Siguiente: reviewer.

## Evaluación
- zone `backend` y complexity `high`, de los labels de la tarjeta.
- Dependencia SLT-43: PR #44 con CI verde y review aprobada, pendiente del merge humano. Esta rama
  apila sobre él; cuando se mergee, basta mergear `origin/dev` aquí.
- Cupo backend de Camilo: 3/3 con esta (SLT-43, SLT-59). SL-24 y SLT-40 pasaron a `done` el
  2026-10-30 (PR #37 y #41 mergeados).

## Decisiones
- 2026-10-30 · Alcance y decisiones cerradas en `specs/SLT-44-geo-jerarquica-dominio/requirements.md`.
- 2026-10-30 · Se parte en dos: el SQL crudo de los repositorios va a SLT-65 (nueva). SLT-46, SLT-47
  y SLT-48 dependen también de SLT-65.
