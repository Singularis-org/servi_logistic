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
| R8 | SI quien pide «Mi plan» no es un `maestro` ni un `admin` de una empresa (cualquier otro rol, el superadmin o sin sesión), ENTONCES el sistema DEBE responder `forbidden` sin leer la base, y la página DEBE responder «no encontrado». La comprobación vive en el servicio. | `tests/unit/services/mi-plan-service.test.ts` (los siete roles; cero llamadas al repositorio); `tests/integration/mi-plan-page.test.tsx`; `e2e/planes-superadmin.spec.ts` (**enmienda del 2026-10-29:** la respuesta HTTP de `/mi-plan` para el `mensajero` de A tiene status 404, no 200 con el texto «No encontramos esta página») |
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
| R25 | Esta feature NO DEBE cambiar ninguna regla de SL-24 (topes, ciclo, asignación, edición, cambio programado, correos, rastro): las pantallas solo llaman a las actions existentes y las lecturas nuevas no escriben. **Excepción decidida por el humano el 2026-10-29 (enmienda, ampliada al cerrar P7):** en la primera asignación con fecha elegida, el ancla sigue R32–R34 en lugar de SL-24 R9, y ningún tope ya pasado (órdenes, roles ni API keys) rechaza la asignación: se asigna y se avisa (R36, R42) en lugar de SL-24 R12. | Suite de SL-24 en verde sin tocar sus tests (`tests/integration/db/plan*.test.ts`, `tests/unit/services/planes-service.test.ts`); `tests/integration/db/plan-de-la-empresa.test.ts` (la función es `STABLE` y no escribe) |
| R26 | El sistema DEBE nombrar en español todo identificador de la base que añade esta feature, y su migración DEBE traer un `down.sql` que la revierta. | `tests/integration/db/plan-de-la-empresa.test.ts` (nombre leído de `pg_proc`; el `down.sql` en una transacción deja el catálogo como antes) |
| R27 | La feature NO DEBE añadir ninguna dependencia de terceros. | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) y diff de `package.json` sin dependencias nuevas |
| R28 | El E2E DEBE cubrir el flujo: el superadmin crea por pantalla un plan custom para la empresa A y se lo asigna desde el detalle de la empresa; el maestro de A ve en «Mi plan» el nombre, sus topes y su consumo; el maestro de B, sin plan, ve «sin límites» y nada del plan de A; un rol sin acceso (`mensajero` de A) recibe «no encontrado» en «Mi plan». | `e2e/planes-superadmin.spec.ts` |

### Enmienda del 2026-10-29 — inicio del ciclo elegido en la primera asignación

> Revisión por F1.2 sobre el spec aprobado (decisiones del humano del 2026-10-29, filas «Inicio del
> ciclo en la primera asignación» y siguientes de `## Decisiones cerradas`). Diseño en
> `design.md > §11`; tasks T12–T18.
>
> **Excepción a R25 decidida por el humano (ampliada el 2026-10-29 al cerrar P7).** Estas filas
> cambian dos reglas de SL-24, y solo en la primera asignación con fecha elegida: el ancla deja de ser
> siempre el instante de la asignación (SL-24 R9) y **ningún** tope ya pasado (órdenes, usuarios de
> cualquier rol con tope ni API keys) rechaza la asignación: rige la regla de SL-24 R16, se asigna y se
> avisa, y las altas que pasen el tope quedan bloqueadas (SL-24 R12 deja de aplicarse ahí). Una
> asignación sin fecha y todo cambio de plan siguen exactamente como en SL-24, R12 y P2a incluidas
> (ver P14).
>
> Vocabulario nuevo:
> - **Fecha de inicio del ciclo**: la fecha `AAAA-MM-DD` que elige el superadmin en la primera
>   asignación, en la hora de la plataforma. «Hoy» es la fecha de la plataforma en ese momento.
> - **Rango permitido**: desde «hoy menos un mes» hasta «hoy más un mes» (mismo día del mes, o el
>   último día del mes si ese día no existe). Los dos límites son decisión del humano (P6 cerrada).
> - **Ciclo corto**: con una fecha futura, el primer ciclo, que va del instante de la asignación hasta
>   las 00:00 de la fecha elegida en la hora de la plataforma.

| R | Requisito | Test previsto |
|---|---|---|
| R29 | CUANDO el superadmin asigna un plan a una empresa sin plan, el sistema DEBE aceptar una fecha de inicio del ciclo de órdenes. CUANDO la petición no trae fecha, el sistema DEBE comportarse como SL-24 R9 (el ancla es el instante de la asignación). El modal de primera asignación DEBE ofrecer la fecha con «hoy» preseleccionado y enviarla con la asignación. | `tests/unit/services/planes-service-inicio-ciclo.test.ts` (sin fecha, el repositorio recibe «sin fecha»); `tests/components/PlanEmpresa.test.tsx` (hoy por defecto; la fecha elegida viaja en la llamada); suite de SL-24 sin tocar (`planes-asignacion.test.ts`: el ancla sin fecha sigue siendo `now()` en UTC) |
| R30 | SI la fecha de inicio no es una fecha `AAAA-MM-DD` válida, o es anterior a «hoy menos un mes», o es posterior a «hoy más un mes», ENTONCES el servicio DEBE responder `validation_error` en el campo `inicioCiclo` sin llamar al repositorio, sea cual sea lo que haya dejado elegir la pantalla. «Hoy» lo da el reloj del servicio en la hora de la plataforma. | `tests/unit/services/planes-service-inicio-ciclo.test.ts` (reloj fijo: hoy−1 mes entra y el día anterior no; hoy+1 mes entra y el día siguiente no; hoy 31 de marzo → el límite pasado es el 28 o 29 de febrero; `2026-02-30` y `"ayer"` → `validation_error`; cero llamadas al repositorio); `tests/unit/utils/ciclo-plan.test.ts` (`rangoDelInicioDelCiclo`) |
| R31 | SI la petición trae fecha de inicio y la empresa ya tiene plan (también si lo recibió entre la lectura del servicio y el cerrojo del repositorio), ENTONCES el sistema DEBE responder `validation_error` en `inicioCiclo` sin escribir nada. CUANDO se cambia el plan de una empresa que ya tenía uno, el sistema DEBE conservar su ancla y su ciclo como hasta ahora (SL-24 P2a). | `tests/unit/services/planes-service-inicio-ciclo.test.ts`; `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (empresa con plan + fecha → rechazo, ancla, plan e historial intactos) |
| R32 | CUANDO la fecha elegida es «hoy», el sistema DEBE anclar el ciclo en el instante de la asignación (como SL-24 R9). CUANDO es otra fecha, el sistema DEBE anclarlo a las 00:00 de ese día en la hora de la plataforma, guardado en UTC como el resto del ciclo (decisión de SL-24 del 2026-10-28). | `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (hoy → ancla = `now()` UTC; fecha pasada y futura → 06:00 UTC de ese día) |
| R33 | CUANDO la fecha elegida es pasada, el ciclo en curso DEBE ser el que resulta de esa ancla con la regla de SL-24 R20, y el uso de órdenes DEBE contar las órdenes vivas de la empresa creadas desde el inicio de ese ciclo, aunque se crearan antes de la asignación. El trigger de tope, el cupo de la carga (`plan_cupo_ordenes`), «Mi plan» y el detalle de la empresa DEBEN contar lo mismo. | `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (órdenes de hace 10 días con fecha de hace 15: cuentan; una anulada no; una de hace 20 días no; `plan_cupo_ordenes`, `plan_de_la_empresa` y el trigger dan el mismo uso) |
| R34 | CUANDO la fecha elegida es futura, el sistema DEBE contar como primer ciclo el ciclo corto (desde el instante de la asignación hasta las 00:00 de la fecha elegida), con las órdenes vivas creadas desde la asignación, y DEBE empezar en la fecha elegida el ciclo siguiente y, desde ahí, un ciclo mensual anclado en esa fecha con la regla de SL-24 R20 (elegida el 5: del 5 al 4). Las órdenes creadas antes de la asignación NO DEBEN contar. | `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (asignada hoy con fecha a 7 días: una orden previa no cuenta, una posterior sí; con el reloj de la base movido pasada la fecha, el uso vuelve a 0 y el ciclo empieza el día elegido); `tests/integration/db/plan-ciclo-corto.test.ts` |
| R35 | El inicio del ciclo en curso (con o sin ciclo corto) DEBE calcularse igual en la base y en `lib/planes/ciclo.ts`, y el inicio del ciclo siguiente que calcula `lib/planes/ciclo.ts` DEBE ser el instante en que la base cambia de ciclo, para una misma tabla de casos. | `tests/unit/utils/ciclo-plan.test.ts` y `tests/integration/db/plan-ciclo-corto.test.ts`, los dos con la tabla `tests/integration/db/_fixtures/ciclo-corto.ts` (ancla pasada, de hoy y futura; un minuto antes del ancla, en el ancla y un minuto después; ancla el 31; sin ciclo corto guardado). La integración comprueba además que la base, en el «siguiente» de TS, da ese mismo instante, y un milisegundo antes, el ciclo en curso de TS |
| R36 | SI con la fecha elegida la empresa ya usa más órdenes que el tope de órdenes del plan, ENTONCES el sistema DEBE asignar el plan igual, devolver en la respuesta un aviso con el uso, el tope y el día en que empieza el siguiente ciclo (P10), y, desde ese momento, rechazar las altas de órdenes de la empresa que pasen el tope hasta que su uso baje o empiece el siguiente ciclo (la regla de SL-24 R16). Un uso igual al tope no avisa. | `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (3 órdenes del ciclo y tope 2: asignada, aviso con 3 y 2; crear una se rechaza con `SL024`; anular dos y crear una entra); `tests/unit/services/planes-service-inicio-ciclo.test.ts` (el aviso viaja en `avisos` del `ok`) |
| R37 | CUANDO el superadmin abre el modal de primera asignación o cambia en él la fecha, el sistema DEBE leer del servidor, con la misma definición de uso que la asignación, qué topes del plan pasaría la empresa (órdenes con esa fecha, usuarios de cada rol con tope y API keys) y, antes de confirmar, DEBE mostrar un aviso por cada uno: «La empresa ya lleva {usados} de {maximo} órdenes en este ciclo: no podrá crear más hasta {fecha}.» para las órdenes, «La empresa ya tiene {usados} de {maximo} {rol}: no podrá activar ni crear más hasta bajar del tope.» para un rol y «La empresa ya tiene {usados} de {maximo} API keys activas: no podrá crear ni activar más hasta bajar del tope.» para las keys. Sin tope pasado, no muestra aviso. SI la lectura falla, ENTONCES el modal NO DEBE dejar confirmar y solo DEBE ofrecer «Reintentar» y «Volver» (P11). Esa lectura DEBE responder `forbidden` sin leer la base a quien no sea el superadmin, y DEBE validar la fecha con R30 y R31. | `tests/unit/services/planes-service-inicio-ciclo.test.ts` (`previsualizarAsignacion`: cada rol de empresa `forbidden` con cero llamadas; fecha fuera de rango `validation_error`); `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (los avisos de la vista previa son los que devuelve la asignación); `tests/components/PlanEmpresa.test.tsx` (aviso de órdenes con «3.200 de 3.000» y la fecha; aviso de rol con su etiqueta de `ROL_LABELS`; aviso de API keys; sin aviso cuando no pasa; cambiar la fecha relee; lectura fallida → sin «Asignar plan», con «Reintentar» y «Volver») |
| R42 | SI en la primera asignación con fecha la empresa ya tiene más usuarios `activo` de un rol que su tope en el plan, o más API keys `activa` que el tope de keys, ENTONCES el sistema DEBE asignar el plan igual (excepción a SL-24 R12, decisión del 2026-10-29), devolver un aviso por cada tope pasado con el uso y el tope, y, desde ese momento, rechazar toda alta de usuarios de ese rol (crear activo, activar, aprobar postulación, cambiar a ese rol) y toda alta de API keys (crear activa, activar) que pase el tope, hasta que el uso baje (la regla de SL-24 R16). Sin fecha o en un cambio de plan, SL-24 R12 sigue rechazando. | `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (3 `adminTienda` activos y tope 2: asignada con aviso 3/2; crear o activar un `adminTienda` → `SL024`; inactivar dos y crear uno entra; ídem con 2 keys activas y tope 1; empresa con plan que cambia a uno menor → `tope_excedido` como hoy); `tests/unit/services/planes-service-inicio-ciclo.test.ts` (avisos de rol y de keys en el `ok`); `tests/integration/db/planes-asignacion.test.ts` (existente, sin tocar: sin fecha, R12 rechaza) |
| R38 | El modal de primera asignación DEBE titularse «¿Asignar este plan a la empresa?» y DEBE decir «El ciclo de órdenes empieza el {fecha}.» con la fecha elegida, en lugar de «El ciclo de órdenes empieza hoy.». | `tests/components/PlanEmpresa.test.tsx` |
| R39 | CUANDO se asigna el primer plan con una fecha de inicio, el sistema DEBE guardar esa fecha (`AAAA-MM-DD`) en la fila `plan_asignado` del historial de la empresa, en la misma transacción que la asignación. Una asignación sin fecha y un cambio de plan DEBEN seguir guardando la fila como en SL-24. | `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (`valor_nuevo` = la fecha; cambio de plan → `NULL`); `tests/integration/db/planes-historial.test.ts` (existente, sin tocar: sin fecha → `NULL`) |
| R40 | MIENTRAS la empresa esté en su ciclo corto, «Mi plan» y la sección de plan del detalle de la empresa DEBEN mostrar el uso de órdenes del ciclo corto y «Se reinicia en N días ({fecha})» con N contado hasta las 00:00 de la fecha elegida y esa fecha (no un mes después). | `tests/unit/planes/consumo.test.ts` (asignada el 29 de octubre con fecha 5 de noviembre: «en 7 días (2026-11-05)»); `tests/integration/db/plan-de-la-empresa.test.ts` (la función devuelve el inicio del ciclo corto y el ancla futura); `tests/components/MiPlanModule.test.tsx` |
| R41 | Los cambios de base de esta enmienda DEBEN ir en una migración nueva, sin editar ninguna anterior, con identificadores en español y un `down.sql` que deje las funciones de SL-24 y `plan_de_la_empresa` exactamente como estaban. Las empresas que ya tienen plan DEBEN seguir contando su ciclo igual que antes de la migración. | `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts` (definiciones de `pg_get_functiondef` antes, tras el `up` y tras el `down`; empresa con plan anterior: mismo uso antes y después); suite de SL-24 en verde sin tocar |

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
| Inicio del ciclo en la primera asignación (2026-10-29) | R29, R31, R32, R39, R41 |
| Fecha pasada (2026-10-29) | R30, R33 |
| Fecha futura (2026-10-29) | R30, R34, R35, R40 |
| Tope ya pasado con fecha pasada (2026-10-29) | R36, R37 |
| P6 — límite futuro hoy + 1 mes | R30 |
| P7 — usuarios y API keys: se asigna y se avisa | R37, R42; P14 y P15 cerradas el 2026-10-29 |
| P8 — sin texto del ciclo corto | R38, R40 |
| P9 — «hoy» es el instante | R32 |
| P10 — fecha del aviso = inicio del siguiente ciclo | R36, R37 |
| P11 — vista previa fallida no deja confirmar | R37 |
| P12 — fecha no visible en el historial, guardada en `valor_nuevo` | R39 (y R21 sin cambios) |
| P13 — textos del campo aprobados | R30, R31, R37 (vía `design.md §6.5`) |
| Textos del modal de primera asignación (2026-10-29) | R37, R38 |
| R8: 404 HTTP real en `/mi-plan` (2026-10-29) | R8 (test previsto ampliado al E2E) |

## Preguntas abiertas

Ninguna.

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
| 2026-10-29 | Texto del cambio programado | El mismo en todas las pantallas: «Cambio programado desde <fecha>». En el detalle del plan no se usa «Rige desde». |
| 2026-10-29 | ¿Qué pasa si no se puede leer el plan actual en la confirmación de «Cambiar plan»? | No se deja confirmar. El modal dice «No se pudo cargar el plan actual» y solo ofrece «Reintentar» y «Volver»: sin el resumen no se confirma. |
| 2026-10-29 | ¿La primera asignación (empresa sin plan) pide confirmación? | Sí, con el mismo modal que «Cambiar plan»: «Asignar <plan> a <empresa>: desde ahora tendrá …», con los topes del plan (órdenes por ciclo, cada rol con tope, API keys; lo que no tiene tope sale como «sin límite»), los módulos incluidos y el aviso de que el ciclo de órdenes empieza hoy (SL-24 R9: la primera asignación fija el ancla). |
| 2026-10-29 | Textos nuevos de la revisión de diseño | Aprobados: «Con monto», «Programar cambio» y «Reintentar» (tabla de textos de `design.md §6.5`). |
| 2026-10-29 | Inicio del ciclo en la primera asignación | En la primera asignación (empresa sin plan), el superadmin puede elegir a mano la fecha de inicio del ciclo de órdenes. Por defecto es hoy. Solo se elige en la primera asignación: al cambiar de plan el ciclo sigue como está (P2a de SL-24 no cambia). |
| 2026-10-29 | Fecha pasada | Como mucho 1 mes atrás. Las órdenes vivas creadas desde esa fecha cuentan para el ciclo en curso. |
| 2026-10-29 | Fecha futura | El primer ciclo va de hoy hasta esa fecha (un ciclo corto) y desde ahí sigue con el día de la fecha elegida (elegida el 5 de noviembre: del 5 al 4). El límite de la fecha futura lo propone el design y lo decide el humano (P6). |
| 2026-10-29 | Tope ya pasado con fecha pasada | Se asigna igual y se avisa. El modal muestra el aviso antes de confirmar («La empresa ya lleva 3.200 de 3.000 órdenes en este ciclo: no podrá crear más hasta <fin del ciclo>») y la empresa queda bloqueada para órdenes nuevas hasta bajar del tope o hasta el siguiente ciclo. Es la misma regla que SL-24 usa al editar un plan. |
| 2026-10-29 | Textos del modal de primera asignación | Aprobados: el título «¿Asignar este plan a la empresa?» y la frase «El ciclo de órdenes empieza el <fecha>.», que sustituye a «El ciclo de órdenes empieza hoy.» (tabla de textos de `design.md §6.5`). |
| 2026-10-29 | R8: «no encontrado» en `/mi-plan` | `/mi-plan` debe responder un 404 HTTP real a los roles sin acceso (hoy responde 200 con «No encontramos esta página» porque `loading.tsx` hace streaming antes del `notFound()`). El test previsto de R8 exige el status 404 en el E2E. El arreglo lo hace el implementer. |
| 2026-10-29 | P6 — Límite de la fecha futura | Como mucho hoy + 1 mes (mismo día del mes siguiente, o su último día). Aprobada la propuesta. |
| 2026-10-29 | P7 — Topes de usuarios y de API keys en la primera asignación | **No se aprobó la propuesta.** En la primera asignación, si la empresa ya pasa el tope de usuarios de algún rol o el de API keys, se asigna y se avisa, igual que con las órdenes: el modal muestra el aviso en la vista previa y después no se pueden activar ni crear más usuarios de ese rol ni más keys hasta bajar del tope. Amplía la excepción a SL-24 R12 (y a R25) en la primera asignación. |
| 2026-10-29 | P8 — Texto del ciclo corto | Sin texto nuevo: «Se reinicia en N días ({fecha})» contado hasta la fecha elegida y, en el modal, «El ciclo de órdenes empieza el {fecha}.». Aprobada. |
| 2026-10-29 | P9 — «Hoy» | Con «hoy», el ancla es el instante de la asignación. Aprobada. |
| 2026-10-29 | P10 — «<fin del ciclo>» del aviso | Es el día en que empieza el siguiente ciclo. Aprobada. |
| 2026-10-29 | P11 — Falla la vista previa del modal | No se puede confirmar: solo «Reintentar» y «Volver», con «No se pudo comprobar el consumo de la empresa». Aprobada. |
| 2026-10-29 | P12 — Fecha elegida en el historial de asignaciones | No se muestra en la tabla del historial; se guarda en `valor_nuevo` de `plan_asignado`. Aprobada. |
| 2026-10-29 | P13 — Textos nuevos del campo de fecha | Aprobados tal como están en `design.md §6.5`: «Inicio del ciclo de órdenes», «Elige una fecha entre el {min} y el {max}.», «La fecha de inicio solo se elige en la primera asignación.» y «No se pudo comprobar el consumo de la empresa». |
| 2026-10-29 | P1 — Ruta y lugar de «Mi plan» en el menú | Ruta propia `/mi-plan`, ítem de primer nivel «Mi plan» después de «Histórico» y antes de «Empresas» (no dentro de «Configuración», que es solo del `maestro`). Aprobada la propuesta (`design.md §4.1`). |
| 2026-10-29 | P2 — Historial en el detalle de la empresa | El detalle del plan muestra su `plan_rastro` (R16); el detalle de la empresa, su historial de asignaciones de `historial_accion` (R21). Aprobada la propuesta. |
| 2026-10-29 | P3 — Empresa sin plan | «Mi plan» y el detalle de la empresa muestran solo «sin límites», sin filas de consumo (R6, R19). Aprobada la propuesta. |
| 2026-10-29 | P4 — Alcance de SL-24 R8 | Cada empresa lee SU plan por la función `plan_de_la_empresa`, acotada a la empresa del contexto (R9); las tablas de planes siguen cerradas a `servi_app`. Es una excepción a SL-24 R8. Aprobada. |
| 2026-10-29 | P5 — «Empresa demo» del E2E | La empresa A del fixture de dos empresas hace de empresa demo (R28). Aprobada la propuesta. |
| 2026-10-29 | P14 — Primera asignación sin fecha | La excepción a SL-24 R12 solo vale para la primera asignación con fecha elegida. Sin fecha, SL-24 R12 sigue rechazando con `tope_excedido`. Aprobada la propuesta. |
| 2026-10-29 | P15 — Textos de los avisos de rol y de API keys | Aprobados tal cual: `rolYaPasado` «La empresa ya tiene {usados} de {maximo} {rol}: no podrá activar ni crear más hasta bajar del tope.» y `apiKeysYaPasadas` «La empresa ya tiene {usados} de {maximo} API keys activas: no podrá crear ni activar más hasta bajar del tope.» (tabla de textos de `design.md §6.5`). |
