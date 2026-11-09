# SLT-85 «Traza de facturación de los cobros por orden»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-85 | traza-facturacion-cobros | backend | medium | feature/SLT-85-traza-facturacion-cobros | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 (2026-11-09): spec aprobado por el humano («Aprobado, implementa»). Tarjeta en curso. F2.1 implementer.

## Evaluación
- zone backend: tabla nueva, migración con relleno de históricos, escritura junto al movimiento de cobro. Sin pantalla.
- complexity medium; ruta completa (dinero y migración).
- Toca lo de SL-40, SLT-66, SLT-83 y el período de SLT-86.

## Decisiones
- 2026-11-09 · Alcance y decisiones → `specs/SLT-85-traza-facturacion-cobros/requirements.md`. Tarjeta de Trello actualizada con el período (sí del humano).

- 2026-11-09 · F1.2: spec escrito (R1–R27; trigger AFTER INSERT sobre `cobro_plataforma_movimiento`, tabla `cobro_plataforma_traza`, relleno con `reconstruido`). Humano: P1 plan al cobrar, P2 período de los históricos con el tipo de hoy, P3 borrado igual que los movimientos, P4 down.sql se niega si hay filas en vivo. Todas = recomendación de spec_author.

<!-- tamano-pr-aceptado: 2026-11-09 · ~1.100–1.300 líneas, casi todo tests de integración; partir dejaría el reverso de cargos viejos sin traza en producción. Humano: «Aceptar en un PR». -->

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
