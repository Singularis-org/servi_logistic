# SLT-77 «Tope de intentos de entrega configurable por empresa»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-77 | tope-intentos-por-empresa | fullstack | high | feature/SLT-77-tope-intentos-por-empresa | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 desde el 2026-11-06: spec aprobado por Carlos («apruebo», también P1 y los textos de `design §4.2`). Tandas por `backend_dev` y `frontend_dev` lanzados directo por el leader, sin `implementer` (el hook lo corta). Base de pruebas: servi_gate_slt77. Sale con EP-8.

## Evaluación
fullstack / high: 10 services leen `reintentosConfig.MIN_INTENTOS_ENTREGA`, algunos en procesos sobre varias empresas, y alcanzar el tope lleva a `rechazada`, que genera cobro (276). Requiere migración y sección en Tarifas.

## Decisiones
- 2026-11-06 · Alcance y decisiones cerradas → `specs/SLT-77-tope-intentos-por-empresa/requirements.md`.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)
Subagentes en Opus.

## Cierre
