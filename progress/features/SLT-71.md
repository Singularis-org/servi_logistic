# SLT-71 «Geografía jerárquica: consultas de tránsito y analítica sobre el nodo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-71 | geo-jerarquica-transito-analitica | backend | high | feature/SLT-71-geo-jerarquica-transito-analitica | Camilo (6ace53aa94bfd46ee6a600a5) | in_progress (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 2026-11-04: tarjeta tomada, worktree creado. Pendiente: montar la base sobre SLT-44 (PR #55, sin
mergear), igual que SLT-65. El merge de `origin/feature/SLT-44-geo-jerarquica-dominio` choca en
`tests/integration/db/caja-459-migration.test.ts` y `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`;
se abortó y lo resuelve `backend_dev`. Siguiente: F1.1/F1.2 (spec).

## Evaluación
- zone backend: solo SQL crudo de repositorios (tránsito, conteos de analítica, ciclo de vida, gestión de orden).
- complexity high: mismo alcance y riesgo que SLT-65 (high), con `EXPLAIN ANALYZE` antes/después como condición de merge.
- Cupo backend: 4 en vuelo (SLT-42, 43, 44, 65) antes de tomarla; con SLT-71, 5.
- Dependencia: SLT-44 sigue in_progress (PR #55). Se toma igual montando la rama sobre la de SLT-44, como SLT-65.
- Cruce de archivos: pendiente de `tasks.md`.

## Decisiones
- 2026-11-04 · Alcance y decisiones cerradas en `specs/SLT-71-geo-jerarquica-transito-analitica/requirements.md` (`/afinar-feature`; tarjetas SLT-71 y SLT-47 actualizadas).
- 2026-11-04 · Base montada sobre SLT-65 (PR #75) en `fe16f5d1`, por decisión del humano.
- 2026-11-04 (humano): tomar SLT-71 con SLT-44 sin mergear y subir el cupo backend a 5 (`arnes.config.json`).
- 2026-10-31 (humano, al acotar SLT-65 con `/afinar-feature`): el dinero va aparte; SLT-71 sale de SLT-65.

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
