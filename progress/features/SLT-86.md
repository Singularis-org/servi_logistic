# SLT-86 «Planes: período de facturación quincenal, mensual, bimestral o anual»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-86 | planes-periodo-facturacion | fullstack | high | feature/SLT-86-planes-periodo-facturacion | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 (2026-11-05): spec aprobado («Aprobado, espera a SLT-83»). F2.1 arranca cuando SLT-83 (PR #79) esté en dev; T0 integra dev.

## Evaluación
- zone fullstack: modelo del plan y del ciclo (base y `lib/planes/ciclo.ts`), migración y pantallas de planes.
- complexity high: cambia la regla de ciclo de SL-24/SLT-58 (tope de órdenes, ciclo corto) y migra planes.
- 2026-11-05 · Cambios del humano tras el primer spec: períodos de calendario (1-15/16-fin, mes, bimestre, año), tramo inicial proporcional, sin tope de órdenes, migración con tramo desde el día de la migración, P4 = nada rige hasta la fecha de efecto (se retira el ciclo corto), 9 propuestas aprobadas. Todo en requirements.md.
- Cruce: SLT-83 (mía, PR #79) toca los mismos archivos de planes; depende de ella. Integrar dev tras su merge.

## Decisiones
- 2026-11-05 · Alcance y decisiones → `specs/SLT-86-planes-periodo-facturacion/requirements.md`.
- 2026-11-05 · spec_author bloqueó: ya existía el tipo de cobro por empresa (PR #72). Humano: el período vive en la empresa, descuento en el plan por período, migración sin perder nada. Requirements y tarjeta enmendados.
- 2026-11-05 · (humano, tras T1) Empresa sin plan con primera asignación pendiente: «Mi plan» muestra «Sin límites» y debajo «{Plan} empieza a regir el {fecha}»; el detalle de empresa del superadmin igual. R26 aplica también sin plan.

## Tandas
- 2026-11-05 · T0 (merge dev con SLT-83) + T1 (migración 20261106120000, esquema) · 229ddce1, 0999df40, e0362b2c, 77e62f60 · ida y vuelta 15/15 en servi_logistic_slt86; guardias de esquema 70/70; typecheck con 48 errores ESPERADOS (columnas retiradas, los cierran T4/T8/T9). T1 ya reescribe plan_de_la_empresa.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
