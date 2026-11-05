# SLT-86 «Planes: período de facturación quincenal, mensual, bimestral o anual»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-86 | planes-periodo-facturacion | fullstack | high | feature/SLT-86-planes-periodo-facturacion | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.2 (2026-11-05): alcance sembrado con /afinar-feature. Siguiente: spec_author.

## Evaluación
- zone fullstack: modelo del plan y del ciclo (base y `lib/planes/ciclo.ts`), migración y pantallas de planes.
- complexity high: cambia la regla de ciclo de SL-24/SLT-58 (tope de órdenes, ciclo corto) y migra planes.
- Cruce: SLT-83 (mía, PR #79) toca los mismos archivos de planes; depende de ella. Integrar dev tras su merge.

## Decisiones
- 2026-11-05 · Alcance y decisiones → `specs/SLT-86-planes-periodo-facturacion/requirements.md`.
- 2026-11-05 · spec_author bloqueó: ya existía el tipo de cobro por empresa (PR #72). Humano: el período vive en la empresa, descuento en el plan por período, migración sin perder nada. Requirements y tarjeta enmendados.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
