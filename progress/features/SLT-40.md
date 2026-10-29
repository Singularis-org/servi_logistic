# SLT-40 «Respuestas de WhatsApp enrutadas por mensaje citado»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-40 | whatsapp-respuesta-por-mensaje-citado | backend | medium | feature/SLT-40-whatsapp-respuesta-por-mensaje-citado | Camilo | spec_ready |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.3: spec escrito en `specs/SLT-40-whatsapp-respuesta-por-mensaje-citado/` (R1–R18, 6 tareas).
Espera aprobación humana (F1.4) y respuesta a las decisiones abiertas D1–D4 de
`requirements.md > Preguntas abiertas`. T2 en adelante bloqueadas hasta entonces.

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

## Modelos (overrides)

## Cierre
