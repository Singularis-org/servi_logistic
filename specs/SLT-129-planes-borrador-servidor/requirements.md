# SLT-129 — planes-borrador-servidor · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/SLT-129-planes-borrador-servidor`
>
> **Alcance.** El servidor guarda el avance del formulario de planes paso a paso (General, Precio y
> descuentos, Cobro por orden, Topes, Módulos y, al editar, Cuándo rige). Crear: el plan nace como
> borrador; no aparece entre los asignables ni en el catálogo público y no afecta a ninguna empresa hasta
> «Crear plan». Editar: el cambio se guarda como borrador del cambio; no se programa, no se aplica y no
> sale ningún correo hasta «Programar cambios». El borrador se retoma desde cualquier dispositivo y otro
> superadmin lo ve. Crear o programar solo se admite con todos los pasos anteriores guardados. Los
> descuentos van como lista: cada línea tiene período (quincenal, mensual, bimestral o anual, sin
> repetir), monto y tipo fijo o porcentual.
>
> **Lo que NO entra.** La pantalla («Guardar y continuar», ✓ por paso, la marca «Borrador» en la lista de
> planes, el botón «Descartar borrador», la fecha de cada empresa) → SLT-144. Quitar «De inmediato» al
> editar → SLT-135.
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Vocabulario.** *Borrador de creación*: el avance de un plan que todavía no existe. *Borrador de cambio*:
el avance de una edición de un plan que ya existe. *Pasos*: los de SLT-130 «Planes: formulario por pasos
compartido en un sheet (crear y editar)», con sus ids: `general`, `precio`, `orden`, `topes`, `modulos` y,
solo en un borrador de cambio, `vigencia`. *Claves de campo*: las que ya usan `crearPlanAction` y
`editarPlanAction` en `fieldErrors` (`nombre`, `precio.mensual`, `precio.descuentos.<período>.<forma>`,
`topes.porRol.admin`…), que el formulario de SLT-130 ya sabe llevar a su paso.

### Quién

- **R1.** SI quien llama a cualquier operación de borradores (guardar un paso, leer uno, listarlos,
  descartar o confirmar) no es el superadmin de plataforma, ENTONCES el sistema DEBE responder `forbidden`
  sin leer ni escribir nada en la base.
  *Test:* `tests/unit/services/plan-borrador-service.test.ts > «cualquier rol que no es superadmin recibe
  forbidden y el repositorio no se llama»`, con un caso por operación y por rol (`maestro`, `admin`, `null`).

### Guardar un paso

- **R2.** CUANDO el superadmin guarda el paso `general` de un plan nuevo sin indicar borrador, el sistema
  DEBE crear un borrador de creación con ese paso guardado, quién lo empezó y cuándo, y devolver su id.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «guardar General sin borrador crea uno con el
  iniciador y la fecha»`.
- **R3.** SI se guarda un paso distinto de `general` de un plan nuevo sin indicar borrador, ENTONCES el
  sistema DEBE responder `validation_error` en la clave `paso` y no crear nada.
  *Test:* `tests/unit/services/plan-borrador-service.test.ts > «un plan nuevo empieza por General»`.
- **R4.** CUANDO el superadmin guarda un paso de un borrador que ya existe, el sistema DEBE reemplazar solo
  los valores de ese paso y dejar los demás pasos como estaban, también si otro superadmin guarda otro
  paso del mismo borrador a la vez.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «guardar un paso no toca los demás»` y
  `> «dos guardados simultáneos de pasos distintos conservan los dos»` (dos conexiones en paralelo).
- **R5.** CUANDO el superadmin guarda un paso del cambio de un plan, el sistema DEBE guardarlo en el único
  borrador de cambio de ese plan, lo haya empezado él u otro superadmin, y crearlo solo si no existe;
  nunca DEBE haber dos borradores de cambio del mismo plan.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «el segundo superadmin sigue el borrador del
  primero»` y `> «dos primeros guardados simultáneos del mismo plan dejan un solo borrador»`.
- **R6.** SI los valores de un paso no cumplen las reglas de ese paso (sus campos y las reglas entre
  campos del mismo paso, iguales a las de crear y editar de hoy), ENTONCES el sistema DEBE responder
  `validation_error` con las claves de campo y no escribir nada. Las reglas que cruzan pasos o necesitan la
  base o el reloj (la empresa existe, el rango de las fechas, los topes que una empresa ya pasa, tipo de
  cobro quincenal con facturación mensual) NO se aplican al guardar un paso.
  *Test:* `tests/unit/types/plan-borrador-schema.test.ts > un caso por paso con un valor inválido y su
  clave` y `tests/unit/services/plan-borrador-service.test.ts > «un paso inválido no llega al
  repositorio»`, `> «una fecha fuera de rango se acepta al guardar General»`.
- **R7.** El sistema DEBE recibir y devolver los descuentos del paso `precio` como una lista de líneas, cada
  una con período (`quincenal`, `mensual`, `bimestral` o `anual`), tipo (fijo o porcentual) y valor. SI dos
  líneas tienen el mismo período, ENTONCES DEBE responder `validation_error` en
  `precio.descuentos.<período>`; SI el valor de una línea no cumple la regla de su tipo (la de hoy para el
  monto y para el porcentaje), ENTONCES DEBE responder `validation_error` en
  `precio.descuentos.<período>.<monto|porcentaje>`; SI el precio es «sin precio» y trae líneas, ENTONCES
  DEBE responder `validation_error` en `precio`.
  *Test:* `tests/unit/types/plan-borrador-schema.test.ts > «período repetido»`, `> «porcentaje 0 y 100.01»`,
  `> «monto inválido»`, `> «sin precio con líneas»`, `> «la lista vacía es sin descuentos»`.
- **R8.** SI se guarda un paso del cambio de un plan que no existe, ENTONCES el sistema DEBE responder
  `not_found`; SI el plan está archivado, ENTONCES DEBE responder `archivado`; SI se guarda en un borrador
  de creación que no existe, ENTONCES DEBE responder `borrador_no_encontrado`. En los tres casos no escribe
  nada.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «plan inexistente, plan archivado y borrador
  inexistente no escriben»`.

### Leer y listar

- **R9.** CUANDO el superadmin pide un borrador, por su id o por el plan del cambio, el sistema DEBE
  devolver los pasos guardados con los valores tal como se guardaron (los descuentos en lista y en el mismo
  orden), la lista de pasos guardados, el nombre de quien lo empezó, cuándo lo empezó y cuándo se guardó
  por última vez, a cualquier superadmin y desde cualquier sesión. SI el plan no tiene borrador de cambio,
  ENTONCES DEBE devolver que no hay borrador.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «otro superadmin lee el borrador tal como se
  guardó»` y `> «un plan sin borrador de cambio devuelve null»`.
- **R10.** CUANDO el superadmin pide la lista de borradores, el sistema DEBE devolver todos los borradores
  de creación y de cambio, de todos los superadmins, cada uno con su id, si es de creación o de cambio, el
  plan del cambio, un nombre (el del paso `general` si está guardado; si no, el del plan en un cambio, o
  ninguno en una creación), quién lo empezó, cuándo y cuándo se guardó por última vez.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «la lista trae los borradores de los dos
  superadmins con su nombre»`.

### Lo que un borrador no hace

- **R11.** MIENTRAS un plan solo exista como borrador de creación, el sistema NO DEBE incluirlo en los
  planes asignables a una empresa, en los planes públicos (el carrusel de «Mi plan»), en el catálogo de
  planes del superadmin ni en ninguna lectura de cobro, facturación o trabajos, y DEBE rechazar con
  `not_found` asignarlo a una empresa.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «un borrador completo no aparece en asignables,
  públicos ni catálogo, y asignarlo da not_found»` (incluye uno custom con su empresa).
- **R12.** MIENTRAS exista un borrador de cambio de un plan, el sistema NO DEBE modificar el plan, su
  precio, sus topes, sus módulos, su cambio programado, las recepciones ni las versiones por empresa, y NO
  DEBE encolar trabajos ni correos.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «guardar los seis pasos del cambio deja el plan,
  el pendiente y la cola de trabajos igual»` (foto de `plan`, `plan_tope_rol`, `plan_modulo`,
  `plan_descuento_periodo`, `plan_precio_historial`, `plan_cambio_programado`, `plan_cambio_recepcion`,
  `plan_version_empresa` y `jobs`, antes y después).
- **R13.** CUANDO se guarda un paso o se descarta un borrador, el sistema NO DEBE añadir filas a
  `plan_rastro`.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «guardar y descartar no dejan rastro»`.

### Descartar y no caducar

- **R14.** CUANDO cualquier superadmin descarta un borrador, lo haya empezado él u otro, el sistema DEBE
  borrarlo con todos sus pasos y dejar el plan del cambio como estaba. SI el borrador no existe, ENTONCES
  DEBE responder `borrador_no_encontrado`.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «otro superadmin descarta el borrador y ya no se
  lee»` y `> «descartar uno inexistente da borrador_no_encontrado»`.
- **R15.** El sistema NO DEBE borrar ni vencer un borrador por el paso del tiempo: solo lo borran
  descartarlo, confirmarlo o el borrado del plan del cambio (R22).
  *Test:* `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts` (solo `PlanesRepository` borra
  borradores, y ningún trabajo ni cron los nombra), con su contraprueba sobre texto en memoria.

### Confirmar

- **R16.** SI al confirmar un borrador le falta algún paso (en una creación: `general`, `precio`, `orden`,
  `topes` y `modulos`; en un cambio, además, `vigencia`), ENTONCES el sistema DEBE responder
  `pasos_pendientes` con los pasos que faltan en el orden del formulario, y no escribir nada.
  *Test:* `tests/unit/services/plan-borrador-service.test.ts > «crear sin Topes y programar sin Cuándo
  rige dan pasos_pendientes»`.
- **R17.** CUANDO el superadmin confirma con «Crear plan» un borrador de creación completo, el sistema DEBE
  aplicar a la petición armada con sus pasos la validación completa y las reglas de crear un plan de hoy
  (también la asignación del custom a su empresa) y, si pasan, crear el plan, dejar su fila de siempre en
  `plan_rastro` y borrar el borrador, todo en una sola operación.
  *Test:* `tests/integration/db/plan-borrador-confirmar.test.ts > «crear un público desde el borrador»` y
  `> «crear un custom desde el borrador lo asigna a su empresa»` (plan, rastro `creado`, borrador
  borrado).
- **R18.** CUANDO el superadmin confirma con «Programar cambios» un borrador de cambio completo, el sistema
  DEBE aplicar a la petición armada con sus pasos la validación completa y las reglas de editar un plan de
  hoy y, si pasan, programar el cambio con el mecanismo por empresa de SLT-128 «Planes: cambios por período
  de cobro de cada empresa» (o aplicarlo como hoy si la fecha lo pide), con sus avisos y correos de
  siempre, dejar su fila de siempre en `plan_rastro` y borrar el borrador, todo en una sola operación.
  *Test:* `tests/integration/db/plan-borrador-confirmar.test.ts > «programar desde el borrador crea el
  pendiente y una recepción por empresa»` (pendiente, recepciones, trabajos de aviso, rastro
  `cambio_programado`, borrador borrado).
- **R19.** SI la validación completa o una regla de crear o de editar rechaza la confirmación, ENTONCES el
  sistema DEBE devolver el mismo resultado que daría crear o editar hoy (`validation_error` con las claves
  de campo, `not_found`, `archivado`, `tope_excedido`, `cambio_a_medias`…), sin escribir nada, y el
  borrador DEBE quedar igual.
  *Test:* `tests/integration/db/plan-borrador-confirmar.test.ts > «un custom con tipo quincenal y
  facturación mensual da validation_error y el borrador queda»` y `> «una fecha de efecto pasada da
  validation_error en vigenteDesde y el borrador queda»`.
- **R20.** SI el borrador ya no existe al confirmar (otro superadmin lo descartó o lo confirmó antes, o se
  confirma dos veces a la vez), ENTONCES el sistema DEBE responder `borrador_no_encontrado` sin crear ningún
  plan ni programar ningún cambio.
  *Test:* `tests/integration/db/plan-borrador-confirmar.test.ts > «dos confirmaciones simultáneas crean un
  solo plan»` y `> «confirmar un borrador descartado da borrador_no_encontrado»`.
- **R21.** El sistema DEBE seguir creando y editando planes por `crearPlanAction` y `editarPlanAction`
  exactamente como hoy.
  *Test:* las suites de hoy sin cambios en sus aserciones: `tests/unit/services/planes-service.test.ts`,
  `tests/integration/db/planes-crear-custom-asigna.test.ts`,
  `tests/integration/db/planes-cambio-programado.test.ts` y
  `tests/integration/db/planes-cambio-por-empresa.test.ts`.

### Datos

- **R22.** CUANDO se borra un plan (el custom que cae con su empresa), el sistema DEBE borrar con él su
  borrador de cambio.
  *Test:* `tests/integration/db/plan-borrador.test.ts > «borrar la empresa del custom borra el borrador
  de su plan»`.
- **R23.** El sistema NO DEBE dejar que el rol de la aplicación (`servi_app`) lea ni escriba los
  borradores, como en las demás tablas de planes.
  *Test:* `tests/integration/db/planes-acceso-servi-app.test.ts > «servi_app no lee ni escribe
  plan_borrador»` (SQLSTATE `42501`).
- **R24.** CUANDO se revierte la migración de esta feature, el sistema DEBE quedar como antes de aplicarla,
  y aplicarla de nuevo DEBE dar el mismo esquema.
  *Test:* `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts`.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| No caduca; descartar lo borra | R14, R15 |
| Un borrador de cambio por plan, compartido, con quién y cuándo; cualquiera lo sigue o lo descarta | R5, R9, R10, R14 |
| `plan_rastro` solo con lo definitivo | R13, R17, R18 |
| Solo el superadmin | R1 |
| Un descuento por período, sin repetir | R7 |
| Programar con el mecanismo por empresa de SLT-128 | R18 |
| Sin E2E en esta ficha | Ningún `R<n>` pide E2E: todos se prueban con unit e integración contra Postgres. |
| Ruta completa: esquema y migración nuevos | R22, R23, R24 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Se descarta o caduca un borrador abandonado? | No caduca. Queda hasta que alguien lo termina o lo descarta; descartar lo borra. Sin vencimiento automático. |
| 2026-11-17 | ¿Puede haber varios borradores de cambio por plan? | No: uno por plan, compartido entre superadmins; se ve quién lo empezó y cuándo, y cualquiera lo sigue o lo descarta. Misma regla que el cambio programado (SL-24 R39). |
| 2026-11-17 | ¿Qué queda en `plan_rastro`? | Solo lo definitivo: «Crear plan» y «Programar cambios» dejan su fila de siempre. Guardar un paso y descartar un borrador no dejan fila. |
| 2026-11-17 | ¿Quién opera los borradores? | Solo el superadmin (heredado de SL-24). |
| 2026-11-17 | ¿Descuentos? | Un descuento por período, sin repetir (heredado de SLT-86 R23; `plan_descuento_periodo` ya tiene esa clave). |
| 2026-11-17 | ¿Cómo se programa el cambio al confirmar? | Con el mecanismo por empresa de SLT-128. |
| 2026-11-17 | ¿E2E? | No en esta ficha: no tiene pantalla. El E2E va en SLT-144. |
| 2026-11-17 | ¿Ruta? | Completa: esquema y migración nuevos. |
| 2026-11-17 | ¿Puede haber varios borradores de creación a la vez? | Sí, sin límite: cada «Nuevo plan» es uno y la lista (R10) los muestra todos. |
| 2026-11-17 | ¿Qué pasa si dos superadmins guardan el MISMO paso del mismo borrador casi a la vez? | Gana el último guardado, sin aviso (R4 protege los pasos distintos, no el mismo). |
