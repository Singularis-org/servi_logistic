# SLT-42 «Teléfono, documento y hora por país»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-42 | telefono-documento-hora-por-pais | fullstack | high | feature/SLT-42-telefono-documento-hora-por-pais | Camilo (6ace53aa94bfd46ee6a600a5) | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 cerrado (2026-11-03): tarjeta asignada, rama publicada (fb250fc2), worktree creado.
Siguiente: `/afinar-feature SLT-42` y después spec (F1.2). Sin spec todavía.

## Evaluación
- zone `fullstack`: catálogo por país en DB (migración, seed) + validación y formato en UI.
- complexity `high`: toca unos 80 archivos (teléfono ~12, documento ~43, zona horaria ~47 con tests),
  incluye jobs/cron y cortes de día; posible dependencia nueva (libphonenumber).
- Cupo fullstack: 0 en vuelo antes de tomarla (en vuelo: SL-33 frontend, SLT-43/44/65 backend).
- Cruce de archivos: sin `tasks.md` aún; repetir `archivos-en-vuelo.mjs --candidata SLT-42` en F2.0.
- `depends_on`: SL-20, `done`.

## Decisiones
- 2026-10-26 (en /afinar-feature SL-20): teléfono con libphonenumber (dependencia nueva, requiere
  los cuatro checks y aprobación); zona horaria es del país; documento único por país y tipo.
- 2026-11-03: por ahora solo se soporta Costa Rica. Prefijo y validación de teléfono, tipos de
  documento y zona horaria salen de **catálogos por país**; se siembra solo CR y se agregan filas
  cuando entre un país nuevo.

## Preguntas abiertas
- Con solo CR, ¿entra libphonenumber ahora o se pospone? (humano, en /afinar-feature)

## Tandas

## Modelos (overrides)

## Cierre
