# SLT-40 «Respuestas de WhatsApp enrutadas por mensaje citado»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-40 | whatsapp-respuesta-por-mensaje-citado | backend | medium | feature/SLT-40-whatsapp-respuesta-por-mensaje-citado | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 desde el 2026-10-29. Spec `specs/SLT-40-whatsapp-respuesta-por-mensaje-citado/` (R1–R18,
commit `5643872`) aprobado por escrito por Camilo («aprobado», 2026-10-29), con D1–D4 en la
opción recomendada. Tarjeta movida a «En curso» con la aprobación registrada.

## Evaluación
- **zone: backend.** Parser del webhook (`lib/types/whatsapp-webhook.ts`), ingesta y
  `ChatConversacionRepository`. Sin UI.
- **complexity: medium.** Sin migraciones ni dependencias nuevas; una consulta y una función pura
  de decisión, con ajustes en tres suites que afirman la forma exacta del resumen de ingesta.
- **Cupo:** segunda feature `backend` en vuelo de Camilo (con SL-24).
- **Cruce de archivos:** ni los PR abiertos #37 (SL-24) y #29 ni las ramas de SLT-51 y SLT-56
  tocan WhatsApp, chat o el webhook (2026-10-29).
- **Lo que ya existe:** ningún spec cubre `context.id`. Relacionados: 109, 120, 311, 474.

## Tandas
- 2026-10-29 · F1.0 tomada (`2b79c69`) · F1.2 spec por `spec_author`.
- 2026-10-29 · F2.1 tanda 1: T1 parser `context.id` (`12f0fee`) y T2 función de decisión
  (`9b1cfec`) en paralelo; vitest related verde, typecheck verde con heap de 8 GB. El worktree no
  traía `node_modules` (solo caché `.vite`): se enlazó por junction al del checkout principal.

## Modelos (overrides)

## Cierre
