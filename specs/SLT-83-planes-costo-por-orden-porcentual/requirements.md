# SLT-83 — Planes: costo por orden porcentual sobre el valor del paquete

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-66, SL-40 ·
> **Rama** `feature/SLT-83-planes-costo-por-orden-porcentual`
>
> **Alcance.** El costo por orden de un plan tiene dos modos: **fijo** (el de SLT-66, cobrado al crear la
> orden) o **porcentual**: un % sobre `orden.monto_cobrar`, con un mínimo opcional que hace de piso
> (se cobra el mayor de los dos). En modo porcentual el cargo sale cuando la orden llega a un estado final, con el `monto_cobrar`
> de ese momento y las condiciones del plan congeladas al crearla. Se revierte si la orden sale del estado
> final o se anula. Entra el formulario del plan, el catálogo, el modal de asignación, «Mi plan», el
> detalle de empresa y la columna «Cobro por orden» del listado de Empresas.
>
> **Lo que NO entra.** Un valor global porcentual (el global sigue siendo solo fijo). Una excepción por
> empresa porcentual (sigue siendo solo fija). Un campo nuevo de «valor declarado» en la orden. El cobro
> real del costo base (sigue fuera, como en SLT-66). Ninguna de estas tiene ficha: no se pidieron.
>
> Sembrado por `/afinar-feature` el 2026-11-04. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-04. Amplían SLT-66 (R7, R8, R11, R12, R18–R20, R24, R28, R31)
> y SL-40 (R12, R15–R17) solo para el modo porcentual: el modo fijo, el valor global y la excepción por
> empresa siguen exactamente como están (R29). Cada requisito nombra el test que lo prueba; las rutas
> están en `tasks.md > Archivos esperados` y el detalle en `design.md > §9`.
>
> **Glosario.**
> - *Plan porcentual*: plan cuyo costo por orden es un porcentaje, con un mínimo opcional.
> - *Regla vigente de una empresa*: la de SLT-66 R12 (excepción > plan > global > 0), ahora con dos
>   modos en el escalón del plan.
> - *Orden porcentual*: orden creada mientras la regla vigente de su empresa era un plan porcentual. Lleva
>   congelados el porcentaje y el mínimo de ese instante.
> - *Estado final*: los de `ESTADOS_TERMINALES` (`entregado`, `devuelta_a_tienda`, `incidente`).
> - *Importe porcentual*: `max(redondeo(monto_cobrar × porcentaje / 100), mínimo)`, con `monto_cobrar`
>   vacío = 0, mínimo vacío = 0, y redondeo a 2 decimales con la mitad hacia arriba.
> - *Cargo vigente de una orden*: su último movimiento es un cargo (SL-40 §2.2).
> - *Órdenes del ciclo*: las de SLT-66 (creadas en el ciclo en curso y no anuladas).

### Configuración del plan

- **R1** — Cada plan DEBE admitir su costo por orden en uno de tres estados: fijo (el importe de SLT-66
  R7), porcentual (porcentaje y mínimo opcional) o vacío (se aplica el valor global, SLT-66 R12). SI una
  creación, edición o programación trae a la vez un importe fijo y un porcentaje, ENTONCES el sistema
  DEBE responder `validation_error` sin escribir nada, y la base DEBE rechazarlo con `23514` si llega por
  SQL a mano.
  *Test:* `tests/unit/types/planes-schema-costo-porcentual.test.ts`,
  `tests/integration/db/plan-costo-porcentual-escritura.test.ts`.
- **R2** — SI el porcentaje no es un texto con hasta dos decimales, mayor que 0 y como mucho 100, ENTONCES
  el sistema DEBE responder `validation_error` en el campo `costoPorOrdenPorcentual.porcentaje` sin
  escribir. SI el mínimo no es un importe `≥ 0` con hasta dos decimales que cabe en `DECIMAL(12,2)`,
  ENTONCES DEBE responder `validation_error` en `costoPorOrdenPorcentual.minimo` sin escribir. Un mínimo
  vacío es válido. La base DEBE rechazar con `23514` un porcentaje fuera de rango, un mínimo negativo o un
  mínimo sin porcentaje.
  *Test:* `tests/unit/types/planes-schema-costo-porcentual.test.ts` (0, 0.01, 100, 100.01, 2.355, -1,
  vacío), `tests/integration/db/plan-costo-porcentual-escritura.test.ts` (los `CHECK`).
- **R3** — SI quien crea, edita o programa el costo por orden porcentual no es el superadmin, ENTONCES el
  sistema DEBE responder `forbidden` sin llamar al repositorio (SL-24 R5).
  *Test:* `tests/unit/services/planes-service-costo-porcentual.test.ts`.
- **R4** — CUANDO el superadmin crea un plan, lo edita de inmediato o programa un cambio, el sistema DEBE
  guardar el modo, el porcentaje y el mínimo con la versión del plan. En concreto:
  - un cambio programado los aplica en su fecha, como el resto de la versión (SLT-66 R11);
  - cada cambio real deja su antes y su después en `plan_rastro`;
  - el cambio aparece en las líneas de «qué cambia» del detalle, de «Mi plan» y del correo de SL-24 R41;
  - una edición que no cambia nada no escribe.
  *Test:* `tests/unit/planes/rastro-costo-porcentual.test.ts`,
  `tests/integration/db/plan-costo-porcentual-escritura.test.ts` (edición inmediata, programada y
  aplicada; edición sin cambios).
- **R5** — Un plan porcentual DEBE tener costo concreto (SLT-66 R28) CUANDO su costo base tiene la forma
  «monto» y tiene porcentaje, con o sin mínimo. La asignación, la vista previa y la lista de asignables
  DEBEN aplicar esta definición igual que con el modo fijo (SLT-66 R28, R29).
  *Test:* `tests/unit/planes/costo-concreto-porcentual.test.ts`,
  `tests/unit/services/planes-service-costo-porcentual.test.ts` (`plan_sin_costo` con base «sin precio» y
  porcentaje; `ok` con base monto y porcentaje sin mínimo).

### Cobro de una orden porcentual

- **R6** — CUANDO se crea una orden por cualquier vía (pantalla, carga masiva o API) y la regla vigente de
  su empresa sale de un plan porcentual, el sistema DEBE, en la misma transacción, congelar en la orden el
  porcentaje y el mínimo del plan de ese instante. NO DEBE registrar ningún cargo al crearla, salvo que
  nazca ya en un estado final (R8).
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (alta por `createMany` de tres
  órdenes: tres condiciones congeladas y ningún movimiento).
- **R7** — SI la empresa tiene excepción, ENTONCES el sistema DEBE cobrar la orden al crearla por la
  excepción (fuente `empresa`) y NO DEBE congelar nada, aunque su plan sea porcentual. SI el plan es fijo
  o vacío, ENTONCES el cobro DEBE seguir siendo el de SLT-66 R12. El valor global y la excepción DEBEN
  seguir admitiendo solo un importe fijo.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (empresa con excepción y plan
  porcentual; plan fijo; plan vacío con global), y las suites de SL-40 y SLT-66 sin cambios (R29).
- **R8** — CUANDO una orden porcentual no anulada entra a un estado final, también al nacer en uno, el
  sistema DEBE registrar en la misma transacción un cargo de fuente `plan` por el importe porcentual,
  calculado con el `monto_cobrar` de ese instante y las condiciones congeladas. Se cobra igual con
  `entregado`, `devuelta_a_tienda` e `incidente`.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (un caso por cada estado final y uno
  de alta directa en estado final).
- **R9** — El importe porcentual DEBE calcularse en decimal exacto, sin coma flotante, y NUNCA DEBE caer al
  valor global. Con 2 % y mínimo 500:
  - `monto_cobrar` 10.000 cobra 500,00;
  - 100.000 cobra 2.000,00;
  - 0 cobra 500,00;
  - vacío cobra 500,00.

  Con 2,35 % y sin mínimo, 12.345 cobra 290,11. Sin mínimo y con `monto_cobrar` 0, cobra 0,00.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual-importe.test.ts` (la tabla de ejemplos sobre la
  función de importe y sobre cargos reales; un caso de mitad exacta, p. ej. 1 % de 1.050 = 10,50 y 0,5 %
  de 1.001 = 5,01).
- **R10** — El cargo porcentual NO DEBE llevar impuestos ni descuento anual, sea cual sea la forma del
  costo base (SLT-66 R14).
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (plan con descuento anual del 20 %).
- **R11** — CUANDO, después de crear una orden, cambia el plan de su empresa, se aplica un cambio
  programado, se le asigna otro plan, o se fija o quita la excepción o el valor global, el sistema DEBE
  conservar las condiciones congeladas de esa orden y cobrarla con ellas al llegar a su estado final. Una
  orden creada con modo fijo DEBE conservar su cargo fijo aunque el plan pase a porcentual.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (el plan pasa de 2 % a 5 % y luego a
  fijo antes del estado final: se cobra el 2 %; una orden fija conserva su cargo).
- **R12** — CUANDO una orden porcentual con cargo vigente pasa de un estado final a uno que no lo es, el
  sistema DEBE registrar en la misma transacción un reverso por el mismo importe y fuente, con el instante
  del cambio. CUANDO vuelve a entrar a un estado final, DEBE registrar un cargo nuevo con el
  `monto_cobrar` de ese instante. Pasar de un estado final a otro NO DEBE registrar nada.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (corrección `entregado →` no final →
  `entregado` con otro `monto_cobrar`; reversión de `incidente`; `entregado → incidente` si la arista
  existe, o el mismo caso por SQL de dueño).
- **R13** — CUANDO cambia el `monto_cobrar` de una orden porcentual que ya está en un estado final, el
  sistema NO DEBE modificar su cargo ni registrar movimientos.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts`.
- **R14** — CUANDO se anula una orden porcentual sin cargo vigente, el sistema NO DEBE registrar nada.
  CUANDO se anula con cargo vigente, DEBE registrar el reverso por el mismo importe (SL-40 R15). CUANDO se
  recupera, SI está en un estado final, ENTONCES DEBE registrar un cargo con el `monto_cobrar` de ese
  instante; SI no lo está, ENTONCES NO DEBE registrar nada hasta que entre a uno (R8).
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts`.
- **R15** — El sistema DEBE mantener, para cada orden porcentual y en todo momento, un cargo vigente si y
  solo si la orden no está anulada y está en un estado final. Su deuda DEBE ser 0 o el importe de su
  último cargo. Repetir o reintentar la misma operación NO DEBE registrar nada. Una sola sentencia que
  cambie a la vez el estado y la anulación DEBE dejar el mismo resultado que las dos por separado.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (secuencia larga con la comprobación
  del invariante tras cada paso; sentencia combinada).
- **R16** — SI la transacción que crea la orden o cambia su estado o su anulación no se confirma, ENTONCES
  el sistema NO DEBE dejar ni condiciones congeladas ni cargos ni reversos de esa operación.
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (`ROLLBACK` tras cada operación).
- **R17** — El sistema DEBE impedir en la base que una transacción de empresa (rol `servi_app`) escriba,
  modifique o borre las condiciones congeladas o los movimientos, aunque lo intente con SQL a mano
  (`42501`). La empresa DEBE leer solo las condiciones de sus órdenes, y una condición NO DEBE poder
  apuntar a una orden de otra empresa. SI falta la política, el `REVOKE` o el trigger de misma empresa,
  ENTONCES el gate DEBE fallar (guardias de SL-17).
  *Test:* `tests/integration/db/cobro-plataforma-porcentual-aislamiento.test.ts` y las guardias de
  `tests/unit/guards/` existentes (`organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`).
- **R18** — La deuda con la plataforma de la wallet DEBE incluir los cargos y reversos porcentuales, y NO
  DEBE cambiar ninguna cifra de la caja (SLT-66 R17, SL-40 R22, R27).
  *Test:* `tests/integration/db/cobro-plataforma-porcentual.test.ts` (deuda antes y después del estado
  final; `wallet_movimiento` sin filas nuevas) y el E2E (R28).
- **R19** — El conjunto de estados finales que usa la base DEBE ser exactamente `ESTADOS_TERMINALES`. SI
  divergen, ENTONCES el gate DEBE fallar.
  *Test:* `tests/integration/db/cobro-porcentual-estados-finales.test.ts` (recorre todos los valores de
  `order_status` y compara con `ESTADOS_TERMINALES`, con el literal escrito a mano como contrato).

### Pantallas

- **R20** — El formulario del plan DEBE ofrecer elegir el modo del costo por orden, «Fijo» o
  «Porcentual»:
  - con «Fijo», el campo «Costo por orden» de SLT-66 R23 (vacío = se aplica el valor global);
  - con «Porcentual», los campos «Porcentaje» (obligatorio) y «Mínimo» (opcional).

  Solo DEBE enviar los datos del modo elegido. Los errores de `validation_error` DEBEN mostrarse junto a su
  campo, y el formulario DEBE conservar lo escrito.
  *Test:* `tests/components/PlanFormCostoPorcentual.test.tsx`.
- **R21** — El catálogo, el detalle del plan y el modal de asignación (primera asignación y cambio de
  plan) DEBEN mostrar el costo por orden de un plan porcentual como «{p} % del valor del paquete, mínimo
  {m}», o «{p} % del valor del paquete» si no tiene mínimo. El modo fijo y el vacío se muestran como en
  SLT-66 R24.
  *Test:* `tests/unit/planes/mensajes-costo-porcentual.test.ts`,
  `tests/components/PlanEmpresaCostoPorcentual.test.tsx`.
- **R22** — SI la regla vigente de una empresa sale de un plan porcentual, ENTONCES la columna «Cobro por
  orden» del listado de «Empresas» DEBE mostrar «{p} % (mín. {m})», o «{p} %» sin mínimo, con la fuente
  «del plan». Con excepción DEBE seguir mostrando el importe con «propio» (SLT-66 R31).
  *Test:* `tests/components/EmpresasModuleCobroPorcentual.test.tsx`,
  `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts`.
- **R23** — MIENTRAS la regla vigente de la empresa sea un plan porcentual, «Mi plan» DEBE mostrar:
  - el costo base;
  - el porcentaje y el mínimo;
  - lo cobrado en el ciclo (R24);
  - las órdenes del ciclo aún sin estado final, como conteo y sin estimar su importe;
  - el total del ciclo hasta hoy = costo base + lo cobrado en el ciclo.

  SI la base no tiene forma «monto», ENTONCES DEBE mostrar «Costo base: por definir» y ningún total
  (SLT-66 R20). El detalle de empresa del superadmin DEBE mostrar los mismos datos, con el aviso «Plan sin
  costo concreto» cuando corresponda (SLT-66 R18, R20).
  *Test:* `tests/unit/planes/costeo-porcentual.test.ts`, `tests/components/ConsumoDelPlanPorcentual.test.tsx`.
- **R24** *(pendiente de P1; escrito con la recomendación)* — Lo cobrado en el ciclo DEBE ser la suma de
  los cargos menos la de los reversos de la empresa cuyo instante cae en el ciclo en curso, en decimal
  exacto y con dos decimales. Las órdenes del ciclo sin estado final DEBEN ser las órdenes porcentuales del
  ciclo que no están en un estado final.
  *Test:* `tests/integration/db/plan-de-la-empresa-porcentual.test.ts` (orden del ciclo anterior que
  termina en este; reverso dentro del ciclo; orden pendiente).
- **R25** — Mostrar «Mi plan» o el detalle de empresa NO DEBE escribir nada en `cobro_plataforma_movimiento`
  ni en `wallet_movimiento` (SLT-66 R21). La empresa DEBE leer su costeo solo por su lectura acotada, y
  pedir el de otra empresa DEBE fallar con `42501` (SLT-66 R22).
  *Test:* `tests/integration/db/plan-de-la-empresa-porcentual.test.ts`.
- **R26** — MIENTRAS la regla vigente de la empresa sea la excepción, un plan fijo, el global o `0.00`,
  «Mi plan» y el detalle de empresa DEBEN mostrar lo mismo que hoy (SLT-66 R18–R20).
  *Test:* `tests/components/ConsumoDelPlanCosteo.test.tsx` y `tests/unit/planes/costeo.test.ts` sin cambio
  de aserciones (solo el tipo, §9.3 de `design.md`).

### Migración, no regresión y E2E

- **R27** — Cada migración nueva DEBE traer su `down.sql`. CUANDO se aplica la migración, los planes que
  ya existen DEBEN quedar con su modo actual (fijo o vacío) sin cambio, y las versiones de los cambios
  programados pendientes DEBEN ganar el modo porcentual vacío. Tras aplicar los `down.sql`, una orden
  nueva DEBE cobrarse con la regla de SLT-66. La bajada DEBE negarse con un error claro SI quedan planes
  porcentuales o condiciones congeladas, porque perdería el cobro de esas órdenes.
  *Test:* `tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts`.
- **R28** — CUANDO corre el E2E de esta ficha, DEBE recorrer estos pasos y pasar en verde:
  1. el superadmin pone por pantalla en un plan con costo base el modo «Porcentual», 2 % y mínimo 500;
  2. el superadmin asigna ese plan a una empresa;
  3. el listado de «Empresas» muestra «2.00 % (mín. 500.00)» «del plan»;
  4. la empresa crea una orden con `monto_cobrar` 100.000, y la deuda de la wallet no cambia;
  5. la orden llega a `entregado`, y la deuda de la wallet sube 2.000,00;
  6. «Mi plan» muestra lo cobrado en el ciclo (2.000,00), 0 órdenes sin estado final y el total.
  *Test:* `e2e/planes-costo-porcentual.spec.ts`.
- **R29** — Las suites de SL-24, SL-40, SLT-58, SLT-66 y del ajuste de planes custom DEBEN seguir en verde.
  Solo cambian los casos enumerados en `design.md > §9.3`, y solo por el tipo nuevo del costeo y del costo
  vigente. No entra ninguna dependencia nueva.
  *Test:* `./init.sh` y el gate de CI (`gate-completo`).

## Preguntas abiertas

- **P1** *(bloquea R24; no bloquea el resto)* — «Lo cobrado de verdad en el ciclo»: ¿qué cargos cuentan?
  - **A (recomendada):** los cargos y reversos cuyo instante cae en el ciclo en curso. Una orden creada el
    ciclo anterior que se entrega en este cuenta en este. Es lo que hace hoy la wallet con los reversos
    (SL-40 D7: un período pasado no cambia), y cuadra con «cargos registrados hasta hoy».
  - **B:** el neto de las órdenes del ciclo (creadas en él), aunque su cargo salga en el ciclo siguiente.
    Entonces la cifra de un ciclo ya cerrado sigue cambiando.

  Ejemplo: una orden creada el día 30 del ciclo 1 se entrega el día 2 del ciclo 2 por 2.000,00. Con A
  cuenta en el ciclo 2; con B, en el ciclo 1, que ya cerró.

## Mapa decisiones → requisitos

| Decisión cerrada | R |
|---|---|
| Sobre `orden.monto_cobrar`; sin valor declarado | R8, R9 |
| El mínimo es piso; nunca cae al global | R9 |
| Global y excepción solo fijos; prioridad sin cambios | R7, R1 |
| El cargo sale al estado final, también devuelta o incidente | R6, R8, R19 |
| Manda el plan vigente al crear; condiciones congeladas | R6, R11 |
| Anulada no se cobra; reverso; recuperación | R14, R15 |
| Salir del estado final: reverso; volver: recobro | R12, R13, R15 |
| Rango y redondeo | R2, R9 |
| Impuestos | R10 |
| «Mi plan» con plan porcentual (y detalle de empresa) | R23, R24, R25 |
| Costo concreto | R5 |
| Quién configura | R3 |
| Wallet y caja | R18 |
| E2E | R28 |
| Sin librería nueva | R29 |

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-04 | ¿Sobre qué valor se calcula el %? | Sobre `orden.monto_cobrar` (el contra entrega). No se crea un campo de valor declarado. |
| 2026-11-04 | ¿Qué hace el mínimo? | Es opcional y es un **piso**: se cobra el mayor entre el % y el mínimo. Ejemplo con 2 % y mínimo 500: `monto_cobrar` 10.000 cobra 500; 100.000 cobra 2.000; 0 o vacío cobra 500. Sin mínimo, el piso es 0. Nunca cae al valor global. (Primero se decidió «solo cuando el monto es 0»; el humano lo cambió el mismo día.) |
| 2026-11-04 | ¿El global o la excepción pueden ser porcentuales? | No. Solo el plan. Prioridad sin cambios: excepción > plan > global > 0 (SLT-66 R12). Con excepción, el modo % del plan no aplica y se cobra al crear, como hoy. |
| 2026-11-04 | ¿Cuándo sale el cargo en modo %? | Cuando la orden entra a un estado final (`ESTADOS_TERMINALES`: `entregado`, `devuelta_a_tienda`, `incidente`), no al crearla. Se cobra igual si no se entregó (devuelta o incidente). El modo fijo sigue cobrando al crear (SLT-66 R12). |
| 2026-11-04 | ¿Qué plan define el cargo? | El vigente al **crear** la orden: modo, % y mínimo se congelan en la orden. Al estado final se aplican sobre el `monto_cobrar` de ese momento. Un cambio de plan posterior no la afecta (hereda el espíritu de SLT-66 R15). |
| 2026-11-04 | ¿Una orden anulada (`deleted_at`) se cobra en modo %? | No. Si se anula sin cargo, no se registra nada. Si ya tenía cargo, se revierte, como SL-40 R15. Si se recupera, espera su estado final (o se recobra si ya está en uno). |
| 2026-11-04 | ¿Y si la orden sale del estado final (corrección, reversión de incidente)? | Reverso del cargo. Al volver a entrar a un estado final se cobra de nuevo con el `monto_cobrar` de ese momento. |
| 2026-11-04 | Rango y redondeo | % mayor que 0 y como mucho 100, con 2 decimales. Cargo en decimal exacto, redondeado a 2 decimales, mitad hacia arriba (2,35 % de 12.345 = 290,11). Mínimo ≥ 0, `DECIMAL(12,2)`. |
| 2026-11-04 | Impuestos | Heredado de SLT-66 R14: el cargo de fuente `plan` no lleva impuestos ni descuento anual. |
| 2026-11-04 | ¿Qué muestra «Mi plan» con plan porcentual? | Costo base, el % y el mínimo, y lo cobrado de verdad en el ciclo. Total = base + cargos registrados hasta hoy. Las órdenes del ciclo aún sin estado final se muestran como conteo aparte, sin estimar. El detalle de empresa del superadmin muestra lo mismo (SLT-66 R18). |
| 2026-11-04 | ¿Cuándo tiene «costo concreto» un plan porcentual? | Heredado de SLT-66 R28: costo base de forma «monto» y un % definido. El mínimo no es obligatorio. |
| 2026-11-04 | Quién configura | Heredado de SL-24 R5: solo el superadmin. Validado en el service. |
| 2026-11-04 | Wallet y caja | Heredado de SLT-66 R17: cargos y reversos de fuente `plan` entran a la deuda de la wallet; ninguna cifra de la caja cambia. |
| 2026-11-04 | ¿Hace falta E2E? | Sí: mueve importes (`docs/checkpoints-proyecto.md > Flujos criticos`). |
| 2026-11-04 | ¿Librería nueva? | No. |
