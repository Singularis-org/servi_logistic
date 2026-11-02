# SLT-52 «Tarifas flexibles: modelo y cálculo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-52 | tarifas-flexibles-modelo | backend | high | feature/SLT-52-tarifas-flexibles-modelo | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.0 (2026-11-02): spec aprobado, in_progress. Siguiente: implementer por tandas T0-T7.
`spec_author` escribe los EARS, `design.md` y `tasks.md`. Rama puesta al día con origin/dev (2979b7b6).

## Evaluación
backend / high: modelo nuevo + resolver único que reemplaza cuatro cálculos de dinero, con
snapshot ampliado en `cierre_detail` y `gestion_orden`. Plan de la épica:
`C:\Users\ArqDev\.claude\plans\rippling-launching-graham.md`.

## Decisiones
- 2026-11-02 · Alcance y decisiones cerradas → `specs/SLT-52-tarifas-flexibles-modelo/requirements.md`.
  Board actualizado: descripciones de SLT-52, SLT-54 y SLT-55; creadas SLT-77 (tope de intentos)
  y SLT-78 (incentivo a la satélite). P1 y P2 cerradas el mismo día.
- 2026-11-02 · Spec aprobado por Carlos («si dale») → in_progress. P1-P4 del spec cerradas (pagos sin IVA).
- 2026-11-02 · Choque aceptado con SLT-43, SLT-44 y SLT-65 (Camilo, geografía jerárquica) en
  `db/schema.prisma`, `lib/types/historial-accion.ts`, `lib/db/modelos-de-negocio.ts`,
  `OrdenRepository.ts`, `CierreDiaRepository.ts`, `docs/architecture.md`. Carlos: «Aceptar;
  resuelve quien mergee segundo». SLT-52 arranca sobre el distrito actual; quien mergee segundo
  integra dev y adapta los grupos.
- 2026-11-02 · Mismo dueño, SLT-64 (AVISO, no choca): comparte CierreDiaRepository/Service.
  Orden: SLT-52 primero; SLT-64 integra dev al retomarse.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
