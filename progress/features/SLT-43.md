# SLT-43 «Geografía jerárquica: modelo y migración»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-43 | geo-jerarquica-modelo | backend | high | feature/SLT-43-geo-jerarquica-modelo | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-29): tomada en Trello (member + En curso), worktree creado.
Siguiente: `/afinar-feature SLT-43`, después F1.2 (spec_author).

## Evaluación
- zone `backend` y complexity `high`, de los labels de la tarjeta: migraciones, triggers de
  sincronía, script de datos por lotes y ensayo sobre una copia de producción.
- Dependencia SL-20: `done` (PR #26, cerrada el 2026-10-29).
- Cupo backend de Camilo: 2/3 con esta (SL-24 en vuelo).

## Decisiones
- 2026-10-29 · Rama épica (Camilo). Las tarjetas de la épica GEO (SLT-43 a SLT-48) se integran en
  `epic/GEO-geografia-jerarquica`, que nace de `dev` (`9e6ed97`). Cada tarjeta abre su PR hacia la
  épica, no hacia `dev`; al final va un PR de la épica a `dev`. `gate.yml` debe correr también en PRs
  hacia `epic/**`: ese cambio de arnés entra por `/afinar-regla` antes del primer PR de esta tarjeta.
  Sustituye a la regla 1 de protección de datos de la tarjeta («un PR por tarjeta a `dev`»).
- 2026-10-29 · Verificaciones previas que pide la tarjeta, confirmadas por Camilo:
  - los previews de Vercel no apuntan a la base de producción;
  - Supabase de producción tiene el backup activo.
- Pendiente antes de la primera migración: mergear el PR #29 (guardia de migraciones destructivas).

## Modelos (overrides)

## Cierre
