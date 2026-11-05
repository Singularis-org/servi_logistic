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
- 2026-11-04 · Textos tras B/C (humano): (1) lado vacío del rastro = «sin costo porcentual» (aprobado);
  (2) costo fijo que pasa a porcentual: «100.00 por orden → cobra porcentual» (sin % sigue «se aplica el
  valor global»); (3) total con cobrado negativo se muestra con resta: «50.000,00 − 500,00 = 49.500,00».
- 2026-11-04 · Textos tras D (humano, las cuatro propuestas aceptadas): descripción del formulario del plan
  (crear y editar), dos pistas de deuda con la plataforma en la wallet (`wallet-labels.ts`, fuera de los
  archivos esperados del spec) y nota en «Mi plan» porcentual. Literales en `progress/impl_SLT-83.md`.
- 2026-11-04 · (humano) La ayuda `docs/ayuda/oficina/wallet-caja.md` copia los dos textos nuevos de la
  wallet; la pista de deuda va en tercera persona: «las órdenes de la empresa» en lugar de «tus órdenes».

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-04 · A (T0–T5; T5 sin [x] hasta CI) · 2f1fda7d…f8577877 · integración 99/99, ida y vuelta 5/5, demo-qa 12/12 en servi_logistic_slt83; typecheck limpio; guardias: 6 rojos ajenos (4 baseline, 2 timeout). init.sh local cortado por falta de memoria: confirma CI. Avisos: estado final + anular en una sentencia no deja movimientos (neto igual, lo juzga el reviewer); zona horaria en el test de R24 (T7); textos de wallet y formulario a revisar en C/D.
- 2026-11-04 · B y C (T6–T10; T8 antes que T7) · a1f9b962…7e68b71d · unit e integración de los archivos tocados en verde (planes-service* 281/281, tests/unit/planes 186/186); typecheck y eslint limpios; guardias: solo el rojo del baseline. Adelantado a D: ConsumoDelPlan y CobroPorOrden solo pintan modo fijo; PlanForm envía costoPorOrdenPorcentual null. Textos pendientes del humano: vacío del rastro («sin costo porcentual», provisional), «→ se aplica el valor global» al pasar a %, total con cobrado negativo.
- 2026-11-04 · D (T11–T14 + textos aprobados) · 80cbac76…452eac15 · tests de lo tocado en verde (planes 162/162, PlanForm* 55/55, PlanVista/PlanEmpresa*/PlanDetalle* 130/130, EmpresasModule* 82/82, ConsumoDelPlan*/MiPlan 59/59); typecheck y eslint limpios. Sin cambiar aserciones de SLT-66.
- 2026-11-04 · E parcial (textos aprobados + T15) · b639a75c, 3a70cea6 · vitest 116/116 de lo tocado; E2E planes-costo-porcentual 5/5 dos corridas seguidas sobre servi_logistic_slt83_e2e; planes-costeo 5, cobro-plataforma-sl40 2, pago-plataforma-sl45 6 (con --no-deps). Aviso: superadmin-empresas.spec.ts:224 (correo de bienvenida) falla en local sin --no-deps, ajeno a SLT-83 y fuera del baseline: lo decide CI.

## Modelos (overrides)

## Cierre
