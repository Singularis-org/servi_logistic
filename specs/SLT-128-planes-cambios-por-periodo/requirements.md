# SLT-128 — planes-cambios-por-periodo · requirements.md

> **Título actual de la ficha:** «Planes: el cambio programado del plan llega a cada empresa al inicio de su
> período» (el slug y la rama conservan el nombre original).
>
> **Zona** backend · **Complejidad** high · **Ruta** completa · **depends_on** SLT-118 «Planes: factura por empresa
> y período con la cuota y las órdenes» (apilada sobre su rama) · **Rama** `feature/SLT-128-planes-cambios-por-periodo`
>
> **Alcance (rebanada 1; el humano lo cambió el 2026-11-11 con P3).** Una edición **programada** de un plan (con
> fecha «A partir de») ya no se aplica a todas sus empresas a la vez: cada empresa con ese plan la recibe al inicio
> de su siguiente período de cobro que empiece en esa fecha o después. Vale para todo lo editable del plan: nombre,
> costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes. Trae la versión del plan por
> empresa, un solo pendiente por plan con el reemplazo por empresa, «Cancelar cambio» y archivar bloqueados con el
> cambio a medias, el cierre de la factura que espera a la recepción y los correos por empresa: uno al guardar con
> la fecha de esa empresa y los recordatorios contados hasta ella (sustituye SL-24 R42). La edición «De inmediato»
> **sigue como hoy** en esta rebanada.
>
> **Lo que NO entra.**
> - Quitar «De inmediato» y la regla de «hoy» en toda edición: SLT-135 «Planes: sin «De inmediato» al editar un
>   plan» (depende de esta).
> - El formulario por pasos dentro de un sheet y la lista de fechas por empresa en pantalla: SLT-130 «Planes:
>   formulario por pasos compartido en un sheet (crear y editar)».
> - El borrador del plan guardado en el servidor por pasos: SLT-129 «Planes: borrador del plan guardado en el
>   servidor por pasos».
> - El cambio de plan de una empresa (de un plan a otro): ya lo resuelve SLT-118 R30.
>
> Sembrado por `/afinar-feature` el 2026-11-11; Alcance acotado tras el corte (P3) el mismo día. La tabla de
> «Decisiones cerradas» la fijó el humano ANTES del spec y no se reabre.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-11. Diseño en `design.md` («§N»); tareas en `tasks.md`. Heredan SL-24
> «Planes y límites» (R16, R17, R37–R45), SLT-58 «Planes: pantallas del superadmin» (R36), SLT-86 «Planes: período
> de facturación de calendario por empresa y sin tope de órdenes» (R15, R22) y SLT-118 «Planes: factura por empresa
> y período con la cuota y las órdenes» (R30, R36–R39). Las horas son las de la plataforma (−06:00, CR).
>
> **Vocabulario.**
> - *Edición programada*: la que el superadmin guarda con una fecha «A partir de» F (hoy, SL-24 R37 y SLT-86 R22).
>   Rige desde las 00:00 de F. La edición sin fecha («De inmediato») no entra aquí (salvo R16).
> - *Versión*: el nombre, los topes, los módulos, el precio, el cobro por orden y la periodicidad de órdenes de un
>   plan. La *versión del plan* es la de su fila (catálogo, detalle, asignaciones). La *versión de la empresa* es la
>   que rige para esa empresa: la del plan, salvo durante un cambio a medias.
> - *Recepción* de una empresa: el instante en que recibe la versión programada. Es F si F es inicio de un período
>   de calendario de su tipo de cobro (SLT-86 R4) y, si no, el inicio del siguiente período de su tipo (como
>   `fechaDeEfectoPorDefecto`, SLT-118 R30).
> - *Cambio a medias*: un pendiente que alguna empresa ya recibió y otra todavía no.
> - *Plan partido*: alguna empresa del plan corre una versión distinta de la del plan.

### Recepción por empresa

- **R1** — CUANDO el superadmin guarda una edición programada con fecha F, el sistema DEBE fijar, en la misma
  transacción, la recepción de cada empresa que tiene el plan según su tipo de cobro. Ejemplos con F = 16 de
  noviembre de 2026: quincenal → 16 de noviembre; mensual → 1 de diciembre; bimestral → 1 de enero de 2027; anual
  → 1 de enero de 2027. Con F = 1 de diciembre: quincenal y mensual → 1 de diciembre.
  *Test:* `tests/unit/planes/recepcion.test.ts` (los cuatro tipos, F inicio y no inicio),
  `tests/integration/db/planes-cambio-por-empresa.test.ts`.
- **R2** — MIENTRAS no llegue la recepción de una empresa, el sistema DEBE seguir aplicándole la versión que
  tenía. DESDE las 00:00 de su recepción DEBE aplicarle la versión programada, **a ella sola**: sus altas de
  usuarios y de API keys se cuentan contra los topes nuevos, la siguiente orden se cobra con el cobro por orden
  nuevo, y el nombre nuevo sale en «Mi plan», en el detalle de empresa del superadmin y en la factura que se abre.
  Las demás empresas del plan NO DEBEN cambiar hasta su propia recepción. Ejemplo: plan con tope de 3 `admin` y
  cobro por orden 100, editado a 1 y 80 con F = 16 de noviembre; el 20 de noviembre la quincenal ya no puede
  activar un segundo `admin` y su orden se cobra 80; la mensual activa el tercero y paga 100 hasta el 1 de
  diciembre.
  *Test:* `tests/integration/db/planes-version-por-empresa.test.ts` (los triggers de topes, la tarifa, «Mi plan» y
  el detalle de empresa, con SQL a mano para los triggers).
- **R3** — El costo base y los descuentos DEBEN seguir rigiendo por SLT-86 R15 (desde el primer período de cada
  empresa que empieza en F o después), que es su recepción: ninguna cuota DEBE cobrarse con el precio nuevo a una
  empresa antes de su recepción, ni con el precio viejo después.
  *Test:* `tests/integration/db/plan-precio-historial.test.ts` (quincenal y anual con F futura aplicada por la
  cola: la quincenal lo ve desde su recepción y la anual desde el 1 de enero).
- **R4** — CUANDO una empresa recibe la versión programada, el sistema DEBE, en esa transacción, encender los
  módulos añadidos y apagar los quitados **solo en esa empresa**, comparando con la versión que ella tenía, y NO
  DEBE tocar sus otros módulos ni sus excepciones (SL-24 R11, R17, por empresa).
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`.
- **R5** — El sistema DEBE aplicar cada recepción una sola vez, a sus 00:00 o, como tarde, en la siguiente pasada
  horaria del barrido (SL-24 R38). Correr el trabajo dos veces, a la vez que el barrido o con el reloj por detrás
  de la recepción NO DEBE aplicarla dos veces ni adelantarla. La recepción NO DEBE cambiar la entrada ni el ciclo
  de la empresa.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`, `tests/unit/cron/procesar-jobs-plan-cambio.test.ts`.
- **R6** — *(P2)* SI al recibir el cambio una empresa ya pasa algún tope nuevo, ENTONCES el sistema DEBE aplicarlo
  igual y, desde ese instante, rechazar sus altas que pasen el tope hasta que su uso baje, sin tocar lo ya creado
  (SL-24 R16, SLT-58 R36). Al guardar, la respuesta DEBE seguir avisando de cada empresa y tope que ya se pasa,
  como hoy.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts` (3 `admin` activos, tope nuevo 1: se recibe,
  activar otro se rechaza, inactivar dos y activar uno entra).
- **R7** — CUANDO una empresa recibe un cambio de la periodicidad de órdenes, su factura en curso NO DEBE cambiar:
  DEBE cerrarse con la periodicidad con la que se abrió, y la siguiente DEBE abrirse en la recepción con la
  periodicidad nueva (SLT-118 R36, por empresa). Ejemplo: órdenes quincenales → mensuales con F = 16 de
  noviembre y dos empresas, una mensual y otra bimestral: la mensual (recepción el 1 de diciembre) factura el 16 al
  30 de noviembre quincenal y luego diciembre entero; la bimestral (recepción el 1 de enero) sigue quincenal hasta
  la emitida el 1 de enero. Una empresa con tipo quincenal haría rechazar el guardado (SLT-118 R37).
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R8** — SI al recibir una versión con órdenes mensuales la empresa tiene tipo de cobro quincenal, ENTONCES el
  trabajo DEBE fallar sin escribir nada para esa empresa (SLT-118 R37, ahora por empresa). La regla al guardar no
  cambia.
  *Test:* `tests/integration/db/planes-periodicidad-ordenes.test.ts`.
- **R9** — *(decisión «Cierre de la factura»)* MIENTRAS una empresa tenga una recepción pendiente con su instante
  en o antes del fin de una factura por cerrar, el proceso NO DEBE cerrar esa factura ni las siguientes: DEBE
  cerrarlas en la primera corrida después de la recepción, con la versión nueva (su nombre en la cuota). Vale para
  toda edición programada, no solo la de la periodicidad, y sustituye la espera por `plan_cambio_programado` de
  SLT-118 R39. Ejemplo: recepción el 1 de diciembre que la cola aún no aplicó a las 00:10 → la factura del 16 al 30
  de noviembre no se cierra; recibida a las 00:40, la corrida de la 01:10 la cierra.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### La versión del plan

- **R10** — *(P5)* La versión del plan DEBE seguir siendo la de antes hasta que la última empresa que lo tenía
  reciba el cambio. En esa misma transacción el sistema DEBE pasar el plan a la versión programada, dejar la fila
  `cambio_aplicado` del rastro (SL-24 R43), borrar el pendiente y dejar a todas sus empresas con la versión del
  plan, sin encender ni apagar ningún módulo. Si el plan no tiene empresas (o ya no le queda ninguna sin
  recibirlo), el cambio DEBE pasar al plan a las 00:00 de F, como hoy (SL-24 R38).
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`, `tests/integration/db/planes-historial.test.ts`.
- **R11** — *(P5)* MIENTRAS el plan tenga un pendiente, el detalle del plan DEBE mostrar «Cambio programado desde
  F» y cuántas de sus empresas ya lo recibieron, con el texto «N de M empresas ya lo recibieron».
  *Test:* `tests/components/PlanDetalle.test.tsx`, `tests/integration/db/planes-cambio-por-empresa.test.ts` (la
  lectura del detalle).
- **R12** — MIENTRAS una empresa no haya recibido el pendiente, «Mi plan» y el detalle de empresa del superadmin
  DEBEN mostrar el cambio programado con **su** recepción, no con F. Una vez recibido, NO DEBEN mostrar ningún
  cambio programado del plan.
  *Test:* `tests/integration/db/planes-version-por-empresa.test.ts`.

### Reemplazar, cancelar, archivar y editar en el acto

- **R13** — *(decisión «Varios cambios pendientes» y P6)* CUANDO el superadmin programa otro cambio de un plan con
  un pendiente, el sistema DEBE reemplazarlo: una empresa que aún no lo recibió NO DEBE recibirlo nunca; una que ya
  lo recibió DEBE conservar esa versión (no se deshace). Y **todas** las empresas del plan DEBEN recibir el cambio
  nuevo en su recepción calculada con la fecha nueva (R1). Ejemplo: «+10 000» con F = 16 de noviembre y luego
  «+5 000 más» guardado el 21 de noviembre con F = 21 de noviembre → la quincenal recibe el primero el 16 y el plan
  final el 1 de diciembre; la mensual recibe solo el plan final el 1 de diciembre.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`, `tests/integration/db/planes-cambio-programado.test.ts`.
- **R14** — *(P1; P8 abierta)* SI alguna empresa ya recibió el pendiente, o el plan está partido por un cambio
  anterior que este reemplazó, ENTONCES «Cancelar cambio» DEBE rechazarse sin escribir nada, con el mensaje
  «Alguna empresa ya recibió este cambio. Para volver atrás, programa otro cambio con los valores de antes.». SI
  ninguna lo recibió, ENTONCES DEBE cancelarse como hoy (SL-24 R39, R43, R45).
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`, `tests/unit/services/planes-service.test.ts`.
- **R15** — *(decisión «Archivar un plan con un cambio a medias»; sustituye SL-24 R40)* SI el plan tiene un
  pendiente y alguna de sus empresas aún no lo recibió, ENTONCES archivar DEBE rechazarse sin escribir nada, con
  el mensaje «El plan tiene un cambio programado que aún no llegó a todas sus empresas. Espera a que termine o
  cancélalo.». Un pendiente de un plan sin empresas DEBE seguir cancelándose al archivar (SL-24 R40).
  *Test:* `tests/integration/db/planes-cambio-programado.test.ts`, `tests/components/PlanDetalle.test.tsx` (el
  mensaje).
- **R16** — *(P7 abierta, propuesta)* SI el plan está partido, ENTONCES la edición «De inmediato» DEBE rechazarse
  sin escribir nada, con el mensaje «Alguna empresa ya recibió el cambio programado. Programa este cambio con una
  fecha.». SI no lo está, ENTONCES DEBE seguir como hoy (SL-24 R15: a todas en el acto; el pendiente sigue).
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`.

### Empresas que entran, salen o cambian de tipo durante el cambio

- **R17** — *(P4)* CUANDO una empresa entra a un plan con un pendiente (asignación, custom, cambio de plan del
  superadmin o del maestro), SI su entrada es en F o después, ENTONCES DEBE entrar ya con la versión programada (sus
  módulos, y el rechazo por topes de SL-24 R12 contra esos topes); SI es antes de F, ENTONCES DEBE entrar con la
  versión del plan y recibir la programada en su recepción (R1, con su tipo nuevo), con sus recordatorios (R21)
  contados desde su entrada.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`.
- **R18** — CUANDO una empresa deja un plan con un pendiente, el sistema DEBE borrar en esa transacción su
  recepción y su versión propia; sus trabajos ya encolados NO DEBEN hacer nada. SI era la última sin recibirlo y F
  ya pasó, ENTONCES R10 DEBE cumplirse en esa misma transacción.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`.
- **R19** — *(P4)* CUANDO se aplica un cambio de tipo de cobro a una empresa con una recepción pendiente, el
  sistema DEBE recalcularla con el tipo nuevo: el primer inicio de un período del tipo nuevo que no sea anterior a
  F ni al efecto del cambio de tipo. Los recordatorios ya encolados para la fecha vieja NO DEBEN salir y los de la
  nueva DEBEN contarse desde ese instante (R21). Ejemplo: F = 5 de enero de 2027 y una empresa mensual (recepción
  el 1 de febrero) que pasa de mensual a bimestral con efecto el 1 de enero: al aplicarse el cambio de tipo, su
  recepción pasa al 1 de marzo. Si el cambio de tipo rige el mismo instante que la recepción, la recepción no se
  mueve.
  *Test:* `tests/integration/db/planes-cambio-por-empresa.test.ts`.

### Correos por empresa

- **R20** — *(decisiones «Correos» y «¿Por empresa o por plan?»)* CUANDO el superadmin guarda una edición
  programada, el sistema DEBE encolar en esa transacción, por cada empresa del plan, un correo a todos sus maestros
  activos (SL-24 P7) con qué cambia respecto de **la versión de esa empresa**, desde **su recepción** y sus topes
  ya pasados. Un reemplazo DEBE decir que reemplaza al previsto para la recepción anterior de esa empresa, si la
  tenía, sin correo de cancelación aparte (SL-24 R45). Un fallo del correo NO DEBE deshacer la edición.
  *Test:* `tests/integration/db/planes-cambio-correos.test.ts` (quincenal y mensual: cada correo con su fecha).
- **R21** — *(decisión «Correos»)* Por cada empresa, con d = los días de calendario entre el día en que se guarda y
  el día de su recepción, el sistema DEBE programar sus recordatorios a las 00:00 de n días antes de su recepción:
  - d > 7: a 7 y a 1 día;
  - 4 ≤ d ≤ 7: a 3 y a 1 día (guardado el 11, recepción el 16 → el 13 y el 15, más el del 11 al guardar);
  - d ≤ 3: solo el de 1 día, si cae después del instante de guardar.
  *Test:* `tests/unit/planes/recepcion.test.ts` (d = 0, 1, 3, 4, 7, 8 y 30; el de 1 día que cae antes de guardar),
  `tests/integration/db/planes-cambio-correos.test.ts`.
- **R22** — Cada recordatorio DEBE salir como mucho una vez por empresa y fecha, aunque el trabajo se repita, e
  indicar los topes que la empresa ya pasa en ese momento (SL-24 R42). NO DEBE salir si la empresa ya recibió el
  cambio, si el cambio se reemplazó o canceló, si la empresa dejó el plan o si su recepción cambió (R19). El de 3
  días DEBE decir «Faltan 3 días: el plan <nombre> de <empresa> cambia a partir del <fecha>.», con el asunto «El
  plan <nombre> cambia en 3 días».
  *Test:* `tests/integration/db/planes-cambio-correos.test.ts`, `tests/unit/services/email/plantilla-cambio-plan.test.ts`.

### Fechas, datos previos, base y cola

- **R23** — *(decisión «Fecha mínima»; P9 abierta)* SI la fecha de una edición programada es anterior a hoy,
  ENTONCES el sistema DEBE responder `validation_error` en `vigenteDesde` sin escribir nada (SLT-86 R22). Las demás
  reglas de la fecha NO DEBEN cambiar en esta rebanada: un precio con fecha de hoy se aplica en el acto a todas y el
  resto exige una fecha posterior a hoy (SL-24 R37), hasta SLT-135 «Planes: sin «De inmediato» al editar un plan».
  *Test:* `tests/unit/services/planes-service-periodo.test.ts` (existente, sin cambios).
- **R24** — *(P10 abierta, propuesta)* CUANDO se aplica la migración, cada pendiente ya guardado DEBE quedar con
  una recepción por cada empresa de su plan **en su fecha F** (la que se anunció por correo, sin llevarla al inicio
  de un período), y DEBE aplicarse por empresa con R2–R10. Los recordatorios ya encolados sin empresa DEBEN
  repartirse como hoy, solo a las empresas que aún no lo recibieron.
  *Test:* `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`.
- **R25** — SI alguna empresa corre una versión propia (plan partido), ENTONCES el `down.sql` DEBE negarse sin tocar
  nada: quitar las tablas la dejaría en la versión del plan sin aviso. Sin ninguna, DEBE dejar la base como estaba
  (tablas, funciones y triggers de antes).
  *Test:* `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`.
- **R26** — Las recepciones y las versiones por empresa DEBEN ser de plataforma: el rol `servi_app` NO DEBE leerlas
  ni escribirlas (`42501`), también con SQL a mano (SL-24 R8). La empresa solo ve su propia versión por
  `plan_de_la_empresa`.
  *Test:* `tests/integration/db/planes-version-por-empresa.test.ts`.
- **R27** — Los trabajos de recepción y de recordatorio por empresa DEBEN ser de núcleo (SL-24 R44): corren sea cual
  sea el estado de los módulos de la empresa.
  *Test:* `tests/unit/cron/procesar-jobs-plan-cambio.test.ts`.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Base de trabajo | — (proceso: rama apilada sobre SLT-118) |
| ¿Cuándo rige un cambio del plan? | R1, R2, R3, R5 (sin «De inmediato»: SLT-135, por P3) |
| ¿Qué campos? | R2, R3, R4, R7 |
| Fecha mínima | R23 |
| Varios cambios pendientes del mismo plan | R13 |
| Archivar un plan con un cambio a medias | R15 |
| Correos | R20, R21, R22 |
| ¿Por empresa o por plan? | R20, R21, R22 |
| Cierre de la factura | R9 |
| E2E | — (sin E2E propio; antes del PR corren en local los E2E de planes, `docs/perfil-agentes.md`) |
| P3 · Tamaño | — (proceso: 29 archivos, `tasks.md > Archivos esperados`) |
| P1 · Cancelar con empresas que ya lo recibieron | R14 |
| P6 · Reemplazo con empresas que ya recibieron el primero | R13 |
| P2 · Tope por debajo del uso | R6 |
| P4 · Empresa que entra al plan durante la ventana | R17, R19 |
| P5 · Cuándo la versión nueva es «el plan» | R10, R11 |

## Preguntas abiertas

Ninguna. P7–P10 cerradas por el humano el 2026-11-11 (filas de «Decisiones cerradas»).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | Base de trabajo | **Apilada sobre la rama de SLT-118** (humano). Se rebasa si SLT-118 cambia. |
| 2026-11-11 | ¿Cuándo rige un cambio del plan? | Sin «De inmediato». El superadmin elige «A partir de» y cada empresa lo recibe al inicio de su siguiente período de cobro que empiece en esa fecha o después. Ejemplo: fecha 16 nov → la mensual el 1 dic, la quincenal el 16 nov (humano, ficha). El período de cada empresa se calcula como en SLT-118 R30 (`fechaDeEfectoPorDefecto` por su tipo de cobro). |
| 2026-11-11 | ¿Qué campos? | Todo lo editable del plan: nombre, costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes (esta última hereda SLT-118 R36). Hoy solo el precio va por período (SLT-86 R22); topes, módulos y cobro por orden tienen edición inmediata o fecha única (SL-24 R15/R37) (humano, ficha). |
| 2026-11-11 | Fecha mínima | `≥ hoy`, heredado de SLT-86 R22. |
| 2026-11-11 | Varios cambios pendientes del mismo plan | **Un solo pendiente por plan.** El cambio nuevo reemplaza al anterior para las empresas que todavía no lo recibieron; las que ya lo recibieron se quedan con él. Ejemplo: «+10 000» desde el 16 nov y luego «+5 000 más» desde el 21 nov → la mensual recibe solo el plan final el 1 dic (humano; ajusta SL-24 R39). |
| 2026-11-11 | Archivar un plan con un cambio a medias | **No se puede archivar** mientras quede alguna empresa sin recibir el cambio (humano; sustituye SL-24 R40). |
| 2026-11-11 | Correos | Siempre sale uno al guardar. Recordatorios contados hasta la fecha de cada empresa: más de 7 días → a 7 y a 1 día; de 4 a 7 días (7 incluido) → a 3 y a 1 día (ejemplo: se guarda el 11 y rige el 16 → correos el 11, el 13 y el 15); 3 días o menos → solo el de 1 día, si cae después de guardar (humano, ficha; sustituye SL-24 R42). |
| 2026-11-11 | ¿Por empresa o por plan? | **Por empresa**: cada maestro recibe sus recordatorios contados hasta su fecha (humano). Destinatarios, heredados de SL-24 P7. |
| 2026-11-11 | Cierre de la factura | El cierre espera a los cambios pendientes de cada empresa con efecto ≤ su fin: extiende SLT-118 R39 a toda edición del plan. |
| 2026-11-11 | E2E | No toca un flujo crítico de `docs/checkpoints-proyecto.md`; sin E2E propio salvo que el spec encuentre uno (los de planes existentes se ajustan si rompen). |
| 2026-11-11 | P3 · Tamaño | **Se parte en dos** (humano). Esta ficha queda como «Planes: el cambio programado del plan llega a cada empresa al inicio de su período» (~29 archivos): versión del plan por empresa, todo lo editable con fecha, reemplazo, archivar bloqueado, cierre que espera y correos por empresa. **«De inmediato» sigue como hoy en esta rebanada.** Quitarlo es SLT-135 «Planes: sin «De inmediato» al editar un plan» (depende de esta). SLT-130 depende de las dos. |
| 2026-11-11 | P1 · Cancelar con empresas que ya lo recibieron | **«Cancelar cambio» solo mientras ninguna empresa lo haya recibido** (efecto de hoy, SL-24 R39/R45). Si alguna ya lo recibió, se rechaza y se pide programar otro cambio con los valores de antes (humano). Sustituye la propuesta «cancela lo que falta» del sembrado. |
| 2026-11-11 | P6 · Reemplazo con empresas que ya recibieron el primero | Lo recibido no se deshace y **también reciben el cambio nuevo** en su siguiente período que empiece en la fecha nueva o después: al final todas quedan con la misma versión (humano). Precisa «Varios cambios pendientes». |
| 2026-11-11 | P2 · Tope por debajo del uso | Como hoy (SL-24 R16, SLT-58 R36): se guarda, la respuesta y los correos avisan por empresa; al recibirlo no se bloquea la aplicación y desde ahí se rechazan las altas que pasen el tope hasta que el uso baje; lo creado no se toca (humano). |
| 2026-11-11 | P4 · Empresa que entra al plan durante la ventana | Según la fecha: si entra en la fecha «A partir de» o después, con la versión nueva; si antes, con la vigente y recibe la nueva en su primer período que empiece en esa fecha o después. Si cambia de tipo de cobro, su fecha se recalcula con los períodos del tipo nuevo (humano). |
| 2026-11-11 | P5 · Cuándo la versión nueva es «el plan» | **Cuando la recibe la última empresa**; sin empresas, a las 00:00 de la fecha elegida. Mientras tanto el detalle muestra «Cambio programado» y cuántas empresas ya lo recibieron. La lista de fechas por empresa va con SLT-130 (humano). |
| 2026-11-11 | P7 · «De inmediato» con el plan partido (R16) | **Se rechaza** y se pide programar el cambio con fecha (humano; propuesta del spec). |
| 2026-11-11 | P8 · Cancelar un pendiente que reemplazó a otro ya recibido (R14) | **Se bloquea** igual que P1: cancelarlo dejaría el plan partido (humano; propuesta del spec). |
| 2026-11-11 | P9 · «Hoy» en esta rebanada (R23) | Se queda como está (a todas en el acto); `≥ hoy` por empresa entra en SLT-135 (humano; propuesta del spec). |
| 2026-11-11 | P10 · Pendientes previos al despliegue y empresas que entran (R17, R24) | (a) un pendiente guardado antes del despliegue llega a todas en la fecha anunciada, aunque caiga a mitad de período; (b) una empresa que entra antes de la fecha recibe solo los recordatorios, sin el correo de guardado (humano; propuesta del spec). |
| 2026-11-12 | P11 · R3: con qué se compara el precio del cambio para escribir la fila de F | Con el precio que el historial ya da en F, no con la fila del plan de hoy: un reemplazo que revierte el precio de un cambio ya recibido sí escribe su fila (humano; desvío de T5). |
| 2026-11-12 | P12 · R20: qué fecha lleva el correo «cancelado» | La fecha de recepción de cada empresa, la que se le anunció; F si no tiene recepción (humano; desvío de T5). |
