# SLT-77 «Tope de intentos de entrega configurable por empresa»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-77 | tope-intentos-por-empresa | fullstack | high | feature/SLT-77-tope-intentos-por-empresa | Carlos Restrepo | spec_ready |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 desde el 2026-11-06: spec escrito (R1 a R41), espera aprobación de Carlos y su decisión sobre P1. Sale con EP-8.

## Evaluación
fullstack / high: 10 services leen `reintentosConfig.MIN_INTENTOS_ENTREGA`, algunos en procesos sobre varias empresas, y alcanzar el tope lleva a `rechazada`, que genera cobro (276). Requiere migración y sección en Tarifas.

## Decisiones
- 2026-11-06 · Alcance y decisiones cerradas → `specs/SLT-77-tope-intentos-por-empresa/requirements.md`.

## Preguntas abiertas
P1 del requirements (órdenes en bodega que quedan agotadas al bajar el tope): le toca a Carlos.

## Tandas

## Modelos (overrides)
Subagentes en Opus.

## Cierre
