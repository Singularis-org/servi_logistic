# SLT-77 «Tope de intentos de entrega configurable por empresa»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-77 | tope-intentos-por-empresa | fullstack | high | feature/SLT-77-tope-intentos-por-empresa | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.2 desde el 2026-11-06: spec aprobado por Carlos («apruebo», también P1 y los textos de `design §4.2`). Tandas por `backend_dev` y `frontend_dev` lanzados directo por el leader, sin `implementer` (el hook lo corta). Base de pruebas: servi_gate_slt77. Sale con EP-8.

## Evaluación
fullstack / high: 10 services leen `reintentosConfig.MIN_INTENTOS_ENTREGA`, algunos en procesos sobre varias empresas, y alcanzar el tope lleva a `rechazada`, que genera cobro (276). Requiere migración y sección en Tarifas.

## Decisiones
- 2026-11-06 · Alcance y decisiones cerradas → `specs/SLT-77-tope-intentos-por-empresa/requirements.md`.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-06 · Tandas 0 a G · ad372c0e, 68719ec9, a8e28961, 52521140, daecf7b3, e5e8143a, 0cf2eaab · detalle en `progress/impl_SLT-77.md`. `./init.sh` INIT_EXIT=0 sobre `servi_gate_slt77` recreada: test:rapido 21990 pasados, 26 saltados, 0 fallados. Requiere `NODE_OPTIONS=--max-old-space-size=8192`.
- 2026-11-06 · Producción medida antes de promover: `tarifa_valor` 0 filas, `cierre_detail` 705 todas `viejo`, `tarifas` sin cambios desde 2026-11-03. Sin T7.5 todavía.

## Modelos (overrides)
Subagentes en Opus.

## Cierre
