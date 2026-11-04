# SLT-83 «Planes: costo por orden porcentual sobre el valor del paquete»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-83 | planes-costo-por-orden-porcentual | fullstack | high | feature/SLT-83-planes-costo-por-orden-porcentual | Camilo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.3 (2026-11-04): spec en specs/SLT-83-planes-costo-por-orden-porcentual/ (R1-R29). Siguiente: F1.4, aprobación humana.

## Evaluación
- zone fullstack: modelo del plan (modo + % + mínimo), congelado en la orden, cargo en wallet al
  estado final (SL-40), formulario del plan y «Mi plan» (SLT-58/SLT-66).
- complexity high: mueve el momento del cargo de dinero para un modo y toca tres pantallas.

## Decisiones
- 2026-11-04 · Decisiones del humano antes de la tarjeta:
  - Dos modos de costo por orden en el plan: fijo (SLT-66) o % de `orden.monto_cobrar`, con mínimo
    opcional. `monto_cobrar` 0 = se cobra el mínimo; nunca cae al global.
  - El global sigue solo fijo; el modo % existe solo en el plan.
  - Modo %: el cargo sale cuando la orden llega a un estado final (no al crear). También si termina
    devuelta, rechazada o cancelada: % del `monto_cobrar` igual.
  - Manda el plan vigente al crear la orden (modo, % y mínimo congelados en la orden).
  - La excepción fija por empresa (SL-40) sigue ganando sobre el plan %.

- 2026-11-04 · /afinar-feature: el mínimo es piso (mayor de los dos; primero se decidió «solo con
  monto 0» y el humano lo cambió); anulada no se cobra; salir del estado final = reverso y recobro;
  % 0–100 con 2 decimales, redondeo mitad arriba; «Mi plan» = base + cobrado real. Board actualizado
  (descripción). Sembrado `specs/SLT-83-planes-costo-por-orden-porcentual/requirements.md`.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-04 · A (T0–T5; T5 sin [x] hasta CI) · 2f1fda7d…f8577877 · integración 99/99, ida y vuelta 5/5, demo-qa 12/12 en servi_logistic_slt83; typecheck limpio; guardias: 6 rojos ajenos (4 baseline, 2 timeout). init.sh local cortado por falta de memoria: confirma CI. Avisos: estado final + anular en una sentencia no deja movimientos (neto igual, lo juzga el reviewer); zona horaria en el test de R24 (T7); textos de wallet y formulario a revisar en C/D.

## Modelos (overrides)

## Cierre
