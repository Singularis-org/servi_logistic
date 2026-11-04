# SLT-71 «Geografía jerárquica: consultas de tránsito y analítica sobre el nodo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-71 | geo-jerarquica-transito-analitica | backend | high | feature/SLT-71-geo-jerarquica-transito-analitica | Camilo (6ace53aa94bfd46ee6a600a5) | in_progress (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.3 2026-11-04: spec en `specs/SLT-71-geo-jerarquica-transito-analitica/` (R1–R25), tarjeta en spec_ready.
Siguiente: F1.4, aprobación humana.
Base sobre SLT-65 (PR #75) en `fe16f5d1`. La base local `logistic` tiene drift de migraciones (las geo con nombres viejos;
`20261104120100` pudo quedar fallida): la decide el humano.

## Evaluación
- zone backend: solo SQL crudo de repositorios (tránsito, conteos de analítica, ciclo de vida, gestión de orden).
- complexity high: mismo alcance y riesgo que SLT-65 (high), con `EXPLAIN ANALYZE` antes/después como condición de merge.
- Cupo backend: 4 en vuelo (SLT-42, 43, 44, 65) antes de tomarla; con SLT-71, 5.
- Dependencia: SLT-44 sigue in_progress (PR #55). Se toma igual montando la rama sobre la de SLT-44, como SLT-65.
- Cruce de archivos: pendiente de `tasks.md`.

## Decisiones
- 2026-11-04 · Alcance y decisiones cerradas en `specs/SLT-71-geo-jerarquica-transito-analitica/requirements.md` (`/afinar-feature`; tarjetas SLT-71 y SLT-47 actualizadas).
- 2026-11-04 · Base montada sobre SLT-65 (PR #75) en `fe16f5d1`, por decisión del humano.
- 2026-11-04 (humano): acepta el choque de archivos con SLT-64 (Carlos Restrepo): `CicloVidaRepository.ts`,
  `ConteoCargadasPorDiaRepository.ts`, `CohorteCargaRepository.ts`, `tests/unit/analytics/ciclo-vida.test.ts`.
  SLT-64 entra primero; SLT-71 lo integra en F2.3. Choque con fichas propias (SLT-42/43/44/65) solo avisa.
- 2026-11-04 · F1.2: spec R1–R25; P1–P3 cerradas por el humano (filas en `requirements.md`).
- 2026-11-04 (humano): tomar SLT-71 con SLT-44 sin mergear y subir el cupo backend a 5 (`arnes.config.json`).
- 2026-10-31 (humano, al acotar SLT-65 con `/afinar-feature`): el dinero va aparte; SLT-71 sale de SLT-65.

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
