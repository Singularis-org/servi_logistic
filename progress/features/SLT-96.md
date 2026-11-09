# SLT-96 «Consolidación de ₡0 no se puede marcar recibida»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-96 | consolidacion-cero-recibida | fullstack | low | feature/SLT-96-consolidacion-cero-recibida | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2: PR #101 a `prod` abierto (reviewer OK vuelta 2, gate local verde). Pendiente: T6 en Preview por Carlos, CI `gate-completo`, merge, y llevar a `dev`.

## Evaluación
fullstack: validación en cliente (`components/shared/monto-cliente.ts`, `MarcarRecibidoDialog.tsx`) y en el borde (`marcarConsolidacionRecibidaSchema`, corrección 473). low: sin migración (el CHECK de `cierre_bodega.monto_recibido` ya admite `>= 0`).

## Decisiones
- 2026-11-09, Carlos: hotfix; aceptar ₡0 en «Marcar recibido» y «Corregir» SOLO cuando lo declarado por la bodega es ₡0. Con declarado > 0 sigue exigiéndose monto > 0.
- 2026-11-09, Carlos aprobó el spec por adelantado (F1.4), por escrito: «te lo apruebo de una vez, necesito salir un momento». Vale para el spec que respete la decisión de arriba; si el spec se sale de ella, PARA.
- Caso real: consolidación de Turrialba (Oscar) del 2026-11-07, declarado ₡0 (una orden reprogramada).

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
