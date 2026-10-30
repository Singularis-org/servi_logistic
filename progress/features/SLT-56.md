# SLT-56 «Ajustar en el cierre lo que ganó el mensajero»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-56 | ajuste-pago-mensajero-cierre | fullstack | medium | feature/SLT-56-ajuste-pago-mensajero-cierre | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-28). Spec R1-R21 @52e8eec1. F1.4 aprobada por escrito 2026-10-29 («dale aprobadas»), tarjeta en En curso. F2: implementer lanzado 2026-10-29.

## Evaluación
zone fullstack / complexity medium (épica EP-8). Toca `cierres-admin` (revisión del cierre),
`gestion_orden.pago_mensajero`, totales de `cierre_dia` y `cierre_bodega`. Independiente de SLT-52.

## Decisiones
- Alcance y decisiones cerradas: `specs/SLT-56-ajuste-pago-mensajero-cierre/requirements.md`.
- 2026-10-29 Q1: corregir entregada a rechazada repaga por la regla del rechazo; el ajuste queda en historial y la gestión sigue marcada «Ajustado» (reajustable).
- 2026-10-29 Q2: el mensajero ve solo el valor nuevo, sin marca ni motivo.
- 2026-10-29 choque de archivos ACEPTADO por Carlos con SLT-43 (`db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `lib/types/historial-accion.ts`) y SLT-58 (`lib/modulos/reparto.ts`), de Camilo. Si SLT-43 entra antes, las migraciones nuevas se renumeran por encima de las suyas ANTES de aplicarse en ningún entorno.

## Preguntas abiertas
Ninguna.
