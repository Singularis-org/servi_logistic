# SLT-58 — planes-superadmin-ui · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-24 · **Rama:** feature/SLT-58-planes-superadmin-ui
>
> **Alcance:**
> - Superadmin: pantalla del catálogo de planes (crear, editar, archivar, programar o cancelar un cambio) y, en el detalle de cada empresa, su plan, su consumo y asignar o cambiar el plan, con el historial (`plan_rastro`). Usa las actions de SL-24 (`@sin-superficie`).
> - Empresa (maestro y admin): vista «Mi plan» con nombre, precio y módulos, consumo frente a cada tope, días hasta el reinicio del ciclo, aviso al 80 % y al 100 %, y el cambio programado con su fecha.
> - Backend: solo las lecturas que faltan (plan y consumo de la empresa; catálogo y detalle para el superadmin), sin cambiar reglas de SL-24.
>
> **Lo que NO entra:**
> - Pedir o elegir un cambio de plan desde la empresa → SL-25 (autoservicio).
> - Cobro real o moneda del precio → D26 / SL-21.
> - Un tipo de plan nuevo: «enterprise» es un custom.
> - Cambios de reglas de topes o de correos → ya cerrados en SL-24.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario. Se hereda el de `specs/SL-24-planes-y-limites/requirements.md` (plan, empresa con plan,
> tope, roles con tope, ciclo, uso, cambio programado). Además:
> - **«Mi plan»**: la pantalla de la empresa con su plan y su consumo.
> - **Fila de consumo**: una por tope que el plan puede tener: órdenes del ciclo en curso, una por cada
>   rol con tope (`maestro`, `admin`, `mensajero`, `adminTienda`, `adminSatelite`) y API keys activas.
> - **Estado de una fila**: `sin límite` (el plan no tiene ese tope), `normal`, `cerca del tope`
>   (uso ≥ 80 % del tope y menor que el tope) o `lleno` (uso ≥ tope).
> - **Hora de la plataforma**: Costa Rica, UTC−6 (P8 de SL-24), hasta SL-21.
>
> La columna «Test previsto» la confirma el implementer en `progress/impl_SLT-58.md`.

### «Mi plan» (empresa)

| R | Requisito | Test previsto |
|---|---|---|
| R1 | CUANDO un `maestro` o un `admin` de una empresa con plan abre «Mi plan», el sistema DEBE mostrar el nombre del plan, su precio como texto informativo sin símbolo de moneda («negociable», «sin precio», «<monto> al mes», con el anual si lo tiene) y la lista de módulos incluidos en el plan con su nombre comercial. | `tests/components/MiPlanModule.test.tsx`; `tests/unit/planes/consumo.test.ts` (texto del precio) |
| R2 | CUANDO se muestra el consumo de una empresa con plan, el sistema DEBE pintar una fila de consumo por cada tope: «<usados> de <máximo> órdenes del ciclo», «<usados> de <máximo> <rol>» para cada rol con tope, con la etiqueta del rol de `ROL_LABELS`, y «<usados> de <máximo> API keys», con los miles agrupados con punto («1.000 de 3.000»). El uso DEBE ser el mismo que cuentan los topes de SL-24: órdenes vivas creadas en el ciclo en curso, usuarios `activo` del rol y keys `activa`. | `tests/unit/planes/consumo.test.ts`; `tests/integration/db/plan-de-la-empresa.test.ts` (el uso devuelto es igual al de `plan_uso_ordenes`, `plan_uso_rol` y `plan_uso_api_keys`) |
| R3 | SI el plan no tiene un tope, ENTONCES el sistema DEBE pintar esa fila con su uso y el texto «sin límite» en lugar del máximo, y NO DEBE marcarla nunca como «cerca del tope» ni «lleno». | `tests/unit/planes/consumo.test.ts` |
| R4 | SI el uso de una fila es mayor o igual que el 80 % del tope y menor que el tope, ENTONCES el sistema DEBE marcarla «cerca del tope». SI el uso es mayor o igual que el tope (incluido un tope 0, o una empresa que ya lo pasa por una edición del plan), ENTONCES el sistema DEBE marcarla «lleno». En otro caso, la fila no lleva marca. La comparación es exacta en enteros (sin redondeo: 79 de 99 no está cerca; 80 de 100 sí). | `tests/unit/planes/consumo.test.ts` (79/99, 80/100, 99/100, 100/100, 101/100, 0/0, sin tope) |
| R5 | CUANDO se muestra el plan de una empresa, el sistema DEBE decir cuántos días faltan para que empiece el siguiente ciclo de órdenes, con la regla de ciclos de SL-24 (R20: mismo día y hora que el ancla, último día del mes si ese día no existe): «Se reinicia en N días», con N = días completos o fracción hasta el inicio del siguiente ciclo, redondeado hacia arriba (mínimo 1), y la fecha de ese día en la hora de la plataforma. | `tests/unit/utils/ciclo-plan.test.ts` (ancla el 15 y el 31 de enero, a mitad de ciclo y a un minuto del cambio); `tests/unit/planes/consumo.test.ts` |
| R6 | MIENTRAS una empresa no tenga plan, el sistema DEBE mostrar en «Mi plan» el texto «Tu empresa no tiene plan asignado: sin límites» y NO DEBE mostrar precio, módulos, filas de consumo ni ciclo. | `tests/components/MiPlanModule.test.tsx`; `tests/integration/db/plan-de-la-empresa.test.ts` (sin plan, la lectura devuelve nada) |
| R7 | MIENTRAS el plan de la empresa tenga un cambio programado pendiente, el sistema DEBE mostrar en «Mi plan» la fecha desde la que rige (la fecha que eligió el superadmin, en la hora de la plataforma) y una línea por cada cosa que cambia (nombre, cada tope, módulos que se incluyen o dejan de incluirse, precio), con los mismos textos que el correo de SL-24 (`lineasDeCambioDelPlan`). Sin cambio pendiente, esa sección no se muestra. | `tests/components/MiPlanModule.test.tsx`; `tests/unit/services/mi-plan-service.test.ts` (las líneas salen de comparar la versión vigente con la pendiente) |
| R8 | SI quien pide «Mi plan» no es un `maestro` ni un `admin` de una empresa (cualquier otro rol, el superadmin o sin sesión), ENTONCES el sistema DEBE responder `forbidden` sin leer la base, y la página DEBE responder «no encontrado». La comprobación vive en el servicio. | `tests/unit/services/mi-plan-service.test.ts` (los siete roles; cero llamadas al repositorio); `tests/integration/mi-plan-page.test.tsx` |
| R9 | El sistema DEBE dar a una empresa solo el plan y el consumo propios: la lectura de «Mi plan» toma la empresa de la sesión, nunca de la petición. SI se pide el plan o el consumo de otra empresa, o se lee sin empresa en el contexto, por cualquier vía (incluido el SQL a mano con el rol de la app), ENTONCES el sistema DEBE rechazarlo (`42501`). La lectura NO DEBE incluir datos de otras empresas: ni los avisos guardados con el cambio programado ni quién lo programó. Las tablas de planes siguen sin poder leerse directamente con el rol de la app. | `tests/integration/db/plan-de-la-empresa.test.ts` (propia: bien; de otra: `42501`; sin contexto: `42501`; `SELECT` a `plan` con `servi_app`: `42501`; la respuesta no tiene `avisos_al_programar` ni actor) |
| R10 | El sistema DEBE ofrecer «Mi plan» en el menú solo al `maestro` y al `admin`, con una única lista de roles que leen el menú, la página y el servicio, y NO DEBE cambiar el aterrizaje después de entrar de ningún rol. | `tests/unit/auth/menu-mi-plan.test.ts` (los siete roles; identidad de la constante; `primerDestino` de cada rol igual que antes) |
| R11 | «Mi plan» NO DEBE ofrecer pedir, elegir ni cambiar de plan: es solo información. | `tests/components/MiPlanModule.test.tsx` (sin botones ni formularios); `tests/unit/guards/superficie-de-uso.guardia.test.ts` (existente: «Mi plan» no monta ninguna action de escritura) |
| R12 | «Mi plan» DEBE ser parte del núcleo: se ve sea cual sea el estado de los módulos de la empresa. | `tests/unit/guards/modulos-reparto.guardia.test.ts` (existente, con la ruta nueva en el reparto); `tests/unit/auth/menu-mi-plan.test.ts` (con todos los módulos apagados sigue en el menú) |

### Catálogo de planes (superadmin)

| R | Requisito | Test previsto |
|---|---|---|
| R13 | CUANDO el superadmin abre «Planes», el sistema DEBE listar todos los planes, también los archivados (marcados como tales), con su nombre, su visibilidad («Público» o «Custom de <empresa>»), su precio informativo, sus topes, cuántas empresas lo tienen asignado y, si tiene un cambio programado pendiente, su fecha. | `tests/unit/services/planes-service-lecturas.test.ts`; `tests/integration/db/planes-lecturas-plataforma.test.ts`; `tests/components/PlanesModule.test.tsx` |
| R14 | CUANDO el superadmin crea un plan desde «Planes», el sistema DEBE pedir los datos de SL-24 R1 y R3 (nombre; público o custom y, si es custom, la empresa; tope de órdenes por ciclo, uno por cada rol con tope y de API keys, cada uno vacío = sin límite; módulos incluidos; forma del precio y sus montos) y enviarlos a `crearPlanAction`. La visibilidad DEBE ofrecer solo «Público» y «Custom»: no hay un tipo «enterprise». | `tests/components/PlanForm.test.tsx` (lo que se envía; solo dos visibilidades) |
| R15 | CUANDO el superadmin edita un plan no archivado, el sistema DEBE dejarle elegir entre aplicar «de inmediato» o «a partir de una fecha» (solo la fecha, P8 de SL-24) y enviarlo a `editarPlanAction`. CUANDO la respuesta trae avisos de empresas que ya pasan un tope nuevo (R16 de SL-24), el sistema DEBE mostrar cada uno con la empresa, el tope, el uso y el tope nuevo. | `tests/components/PlanForm.test.tsx`; `tests/components/PlanDetalle.test.tsx` (avisos) |
| R16 | CUANDO el superadmin abre el detalle de un plan, el sistema DEBE mostrar su versión vigente, su cambio programado pendiente (fecha y una línea por cosa que cambia) si lo hay, las empresas que lo tienen asignado y su rastro de plataforma (`plan_rastro`), del más reciente al más antiguo, con quién, cuándo, qué acción y qué cambió. | `tests/unit/services/planes-service-lecturas.test.ts`; `tests/integration/db/planes-lecturas-plataforma.test.ts`; `tests/components/PlanDetalle.test.tsx` |
| R17 | CUANDO el superadmin cancela el cambio pendiente o archiva un plan, el sistema DEBE pedir confirmación antes de llamar a `cancelarCambioPlanAction` o a `archivarPlanAction`. MIENTRAS un plan esté archivado, el sistema NO DEBE ofrecer editarlo, archivarlo ni asignarlo. | `tests/components/PlanDetalle.test.tsx` |
| R18 | SI una action de planes responde un rechazo (`forbidden`, `validation_error`, `not_found`, `archivado`, `custom_de_otra_empresa`, `sin_cambio_programado` o `tope_excedido`), ENTONCES la pantalla DEBE mostrar un mensaje que lo explique (los `validation_error` junto a su campo) y NO DEBE dar el cambio por hecho. | `tests/components/PlanForm.test.tsx`; `tests/components/PlanDetalle.test.tsx`; `tests/components/PlanEmpresa.test.tsx` |

### Plan de una empresa (superadmin)

| R | Requisito | Test previsto |
|---|---|---|
| R19 | CUANDO el superadmin abre el detalle de una empresa, el sistema DEBE mostrar su plan (nombre, precio, módulos incluidos) y su consumo con las mismas filas, marcas y días hasta el reinicio de R2–R5, o «Sin plan: sin límites» si no tiene, y el cambio programado pendiente de su plan si lo hay (R7). | `tests/unit/services/planes-service-lecturas.test.ts`; `tests/components/PlanEmpresa.test.tsx`; `tests/integration/plataforma-empresa-detalle-page.test.tsx` |
| R20 | CUANDO el superadmin asigna o cambia el plan de una empresa desde su detalle, el sistema DEBE ofrecer solo los planes asignables a esa empresa (SL-24 R7: públicos y custom suyos, no archivados) y enviar la elección a `asignarPlanAction`. SI la asignación se rechaza por tope (SL-24 R12), ENTONCES el sistema DEBE mostrar qué tope se pasa, con el uso y el tope, y la empresa sigue con su plan. | `tests/components/PlanEmpresa.test.tsx` |
| R21 | CUANDO el superadmin abre el detalle de una empresa, el sistema DEBE mostrar su historial de asignaciones de plan, del más reciente al más antiguo, con la fecha, quién lo hizo y el plan asignado. | `tests/integration/db/planes-lecturas-plataforma.test.ts`; `tests/components/PlanEmpresa.test.tsx` |
| R22 | SI quien abre «Planes», el detalle de un plan o la sección de plan del detalle de una empresa no es el superadmin, ENTONCES el sistema DEBE responder «no encontrado» sin leer nada, y las lecturas del servicio DEBEN responder `forbidden` sin llamar al repositorio. SI el plan pedido no existe o el segmento no es un uuid, ENTONCES el sistema DEBE responder «no encontrado». | `tests/unit/services/planes-service-lecturas.test.ts` (cada rol de empresa, cero llamadas); `tests/integration/plataforma-planes-page.test.tsx` |
| R23 | El sistema DEBE ofrecer «Planes» en el menú solo al superadmin, sin cambiar su aterrizaje (`/plataforma/empresas`). | `tests/unit/auth/menu-visibility.test.ts` (los casos de SL-32/SL-20 actualizados con «Planes»); `tests/unit/auth/destino-post-login.test.ts` (existente) |
| R24 | Cada action de `lib/actions/planes.ts` DEBE tener una pantalla que la dispare, y NINGUNA DEBE conservar la marca `@sin-superficie`. | `tests/unit/guards/superficie-de-uso.guardia.test.ts` (existente: R-A y «ninguna anotación sobrevive a su motivo») |

### Transversales

| R | Requisito | Test previsto |
|---|---|---|
| R25 | Esta feature NO DEBE cambiar ninguna regla de SL-24 (topes, ciclo, asignación, edición, cambio programado, correos, rastro): las pantallas solo llaman a las actions existentes y las lecturas nuevas no escriben. | Suite de SL-24 en verde sin tocar sus tests (`tests/integration/db/plan*.test.ts`, `tests/unit/services/planes-service.test.ts`); `tests/integration/db/plan-de-la-empresa.test.ts` (la función es `STABLE` y no escribe) |
| R26 | El sistema DEBE nombrar en español todo identificador de la base que añade esta feature, y su migración DEBE traer un `down.sql` que la revierta. | `tests/integration/db/plan-de-la-empresa.test.ts` (nombre leído de `pg_proc`; el `down.sql` en una transacción deja el catálogo como antes) |
| R27 | La feature NO DEBE añadir ninguna dependencia de terceros. | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) y diff de `package.json` sin dependencias nuevas |
| R28 | El E2E DEBE cubrir el flujo: el superadmin crea por pantalla un plan custom para la empresa A y se lo asigna desde el detalle de la empresa; el maestro de A ve en «Mi plan» el nombre, sus topes y su consumo; el maestro de B, sin plan, ve «sin límites» y nada del plan de A; un rol sin acceso (`mensajero` de A) recibe «no encontrado» en «Mi plan». | `e2e/planes-superadmin.spec.ts` |

### Cobertura de las decisiones cerradas

| Decisión (fila) | Requisitos |
|---|---|
| ¿SL-26 sigue? (no; los planes pasan aquí) | R13–R24 |
| ¿Qué es «enterprise»? (custom, sin tipo nuevo) | R14 |
| ¿Quién ve «Mi plan»? (maestro y admin; en el service, con test) | R8, R10 |
| ¿Qué muestra «Mi plan»? | R1, R2, R3, R5, R6 |
| Aviso de tope (80 % y 100 %) | R4 |
| Cambio programado | R7 (y R16, R19 para el superadmin) |
| ¿Pedir cambio de plan desde la empresa? (no) | R11 |
| ¿E2E? (crear custom, asignar, el maestro ve sus topes; permiso y aislamiento) | R28 (y R8, R9) |
| Heredado de SL-24: solo el superadmin gestiona | R22, R24 |
| Heredado de SL-24: archivar en vez de borrar | R13, R17 |
| Heredado de SL-24: precio sin moneda (D26) | R1, R13 |
| Heredado de SL-24: ciclo en UTC desde el alta | R2, R5 |
| Heredado de SL-24: identificadores en español | R26 |
| Heredado de SL-24: sin dependencias nuevas | R27 |
| Alcance: «sin cambiar reglas de SL-24» | R25 |
| Alcance: historial (`plan_rastro`) | R16 (rastro del plan), R21 (asignaciones de la empresa); ver P2 |

## Preguntas abiertas

- Ruta y lugar en el menú de «Mi plan» (¿dentro de Configuración o propia?): lo propone spec_author y lo aprueba el humano con el spec.
  **Propuesta (`design.md > §4.1`):** ruta propia `/mi-plan`, ítem de primer nivel «Mi plan» justo
  después de «Histórico» y antes de «Empresas». No puede ir dentro de «Configuración»: ese ítem es
  solo del `maestro`, y un subítem no puede ser más ancho que su padre (`puedeVer`), así que el
  `admin` no lo vería.
- **P2 — Historial en el detalle de la empresa.** El Alcance dice «con el historial (`plan_rastro`)»,
  pero `plan_rastro` es por plan: no guarda la empresa. Las asignaciones de una empresa están en su
  `historial_accion` (`plan_asignado`). **Propuesta:** el detalle del plan muestra su `plan_rastro`
  (R16) y el detalle de la empresa, su historial de asignaciones (R21). ¿Vale así, o el detalle de la
  empresa debe mostrar también el `plan_rastro` de su plan actual?
- **P3 — Empresa sin plan.** **Propuesta:** «Mi plan» y el detalle de la empresa muestran solo
  «sin límites», sin filas de consumo (R6, R19): sin ancla no hay ciclo de órdenes que contar.
  ¿Vale, o se quiere ver al menos usuarios por rol y API keys aunque no haya plan?
- **P4 — Alcance de R8 de SL-24.** SL-24 R8 dice que una empresa no lee planes «por cualquier vía».
  Esta ficha deja que cada empresa lea SU plan por una sola función acotada a la empresa del contexto
  (R9; las tablas siguen cerradas a `servi_app`). Lo entiendo como decidido por la fila «¿Qué muestra
  "Mi plan"?»; se pide confirmarlo al aprobar el spec.
- **P5 — «Empresa demo» del E2E.** La fila del E2E habla de «la empresa demo». El E2E de este repo no
  usa la demo de QA (`scripts/demo-qa.ts`) sino las empresas A y B que crea su fixture.
  **Propuesta:** la empresa A del fixture hace de «empresa demo» (R28).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-29 | ¿SL-26 sigue? | No: cancelada. Empresas y módulos ya tienen pantalla; los planes pasan aquí, sin depender de SL-25. |
| 2026-10-29 | ¿Qué es «enterprise»? | Un plan custom con nombre comercial. Sin tipo nuevo. |
| 2026-10-29 | ¿Quién ve «Mi plan»? | Maestro y admin de la empresa. Validado en el service, con test. |
| 2026-10-29 | ¿Qué muestra «Mi plan»? | Nombre, precio (informativo), módulos incluidos y consumo por tope: órdenes del ciclo («1.000 de 3.000»), días hasta el reinicio, usuarios por rol («10 de 10 mensajeros») y API keys. Un tope sin límite se muestra como «sin límite»; una empresa sin plan, como «sin límites». |
| 2026-10-29 | Aviso de tope | Al 80 % se marca «cerca del tope»; al 100 %, «lleno». |
| 2026-10-29 | Cambio programado | «Mi plan» muestra el cambio pendiente con su fecha y qué cambia. |
| 2026-10-29 | ¿Pedir cambio de plan desde la empresa? | No. Solo información. Va a SL-25. |
| 2026-10-29 | ¿E2E? | Sí: el superadmin crea un custom y lo asigna a la empresa demo; el maestro ve sus topes y su consumo en «Mi plan». Cubre el permiso y el aislamiento. |
| 2026-10-29 | Heredado de SL-24 | Solo el superadmin gestiona planes (validado en el service); archivar en vez de borrar; precio sin moneda (D26); ciclo en UTC desde el alta; identificadores en español; sin dependencias nuevas. |
| 2026-10-29 | ¿Se puede tocar `tests/unit/services/planes-service.test.ts` (R25)? | Solo de forma mecánica: se añaden tres `vi.fn` (`catalogo`, `detalle`, `planDeEmpresa`) a su `doble()` para que compile con la interfaz ampliada, sin cambiar ninguna aserción. Es una excepción a R25 decidida por el humano durante la implementación (T4). |
| 2026-10-29 | ¿«Cambiar plan» en el detalle de la empresa pide confirmación? | Sí. Antes de llamar a `asignarPlanAction`, un modal (el mismo patrón que archivar y cancelar) resume qué cambia para esa empresa: tope de órdenes, tope de cada rol, tope de API keys y módulos que entran o salen. El resumen sale de `diferenciasDelPlan` / `lineasDeCambioDelPlan`, no se calcula aparte. Lo decidió el humano tras la revisión de diseño (`progress/design_SLT-58.md`). |
