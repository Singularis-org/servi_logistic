# SL-24 — planes-y-limites · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** SL-23 · **Rama:** `feature/SL-24-planes-y-limites`
>
> **Alcance:** catálogo de planes que crea y edita el superadmin (públicos o custom atados a una
> empresa, con precio mensual, anual u «negociable»), asignación de un plan a cada empresa y topes
> contados en el servidor, dentro de la misma transacción del alta: órdenes por ciclo, usuarios por
> rol y módulos incluidos. Al llegar al tope el alta se rechaza. Solo backend: servicio, repositorio,
> server actions de superadmin y la comprobación en cada alta, con tests.
>
> **Lo que NO entra:**
> - Pantallas para crear planes y asignarlos → SL-26 «Panel de superadmin».
> - Catálogo público y elección de plan al registrarse → SL-25 «Registro de empresas en autoservicio».
> - Cobro real, pasarela o facturación del plan → sin ficha (el precio es informativo).
> - Moneda por país del precio → SL-21 «Moneda e impuestos configurables por país».
>
> Sembrado por `/afinar-feature` el 2026-10-27. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Vocabulario.
> - **Plan**: un registro del catálogo de planes, público o custom.
> - **Empresa con plan**: la que tiene un plan asignado. Una empresa sin plan no tiene límites (R14).
> - **Tope**: el máximo de un plan para una cosa contada: órdenes por ciclo, usuarios de un rol o
>   API keys. Cada tope es opcional; sin tope, esa cosa no tiene límite.
> - **Roles con tope**: `maestro`, `admin`, `mensajero`, `adminTienda` (Admin Tienda) y
>   `adminSatelite`. `superadmin` no lleva tope. Las cuentas `apiKey` tampoco: las API keys tienen
>   su propio tope (R35).
> - **Ciclo**: el periodo de conteo de órdenes. Es siempre mensual y está anclado en la fecha de
>   alta del primer plan de la empresa (R20).
> - **Uso**: lo que la empresa lleva contado.
>   - De órdenes: las creadas en el ciclo en curso y no anuladas (R19).
>   - De un rol: sus usuarios en estado `activo` (R26).
>   - De API keys: sus keys en estado `activa` (R35).
> - **Alta**: toda operación que hace crecer un uso.
>   - Crear órdenes por cualquier vía.
>   - Crear un usuario activo, o hacer que uno existente pase a contar: activarlo desde
>     `inactivo` o `bloqueado`, aprobar su postulación o cambiarlo a otro rol.
>   - Crear una API key activa o activar una inactiva.
> - **Anulada**: una orden eliminada (`deleted_at` con valor). Es la definición de SL-40 D6; la
>   cancelación por API no es una anulación.
>
> La columna «Test previsto» la confirma el implementer en `progress/impl_SL-24.md`.

### Catálogo de planes

| R | Requisito | Test previsto |
|---|---|---|
| R1 | CUANDO el superadmin crea un plan, el sistema DEBE guardarlo con su nombre, su visibilidad (público o custom), su tope de órdenes por ciclo (opcional), un tope por cada rol con tope (cada uno opcional), su tope de API keys (opcional), sus módulos incluidos (un subconjunto de los 8 módulos de SL-23) y su precio, y devolver su identificador. Ningún plan nace archivado. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-catalogo.test.ts` |
| R2 | SI un plan custom no nombra exactamente una empresa existente, o un plan público nombra alguna, o una edición intenta cambiar la visibilidad de un plan o la empresa de un plan custom, ENTONCES el sistema DEBE rechazar la petición sin escribir nada. | `tests/unit/types/planes-schema.test.ts`; `tests/unit/services/planes-service.test.ts` |
| R3 | El sistema DEBE aceptar como precio de un plan exactamente una de estas formas: sin precio; «negociable» (sin monto); un monto mensual solo; un monto mensual con un precio anual fijo; o un monto mensual con un porcentaje de descuento sobre el anual, mayor que 0 y como mucho 100. Los montos son ≥ 0, con dos decimales como máximo, y caben en `DECIMAL(12,2)`. SI la petición combina «negociable» con un monto, o un anual fijo con un porcentaje, o trae un anual sin mensual, ENTONCES el sistema DEBE responder `validation_error` sin escribir nada. | `tests/unit/types/planes-schema.test.ts`; `tests/integration/db/planes-catalogo.test.ts` (los `CHECK` de la base rechazan las mismas combinaciones con SQL a mano como dueño) |
| R4 | El sistema NO DEBE generar por el precio de un plan ningún cobro, movimiento de caja, cargo ni deuda. Lo guarda sin moneda propia. | `tests/integration/db/planes-asignacion.test.ts` (asignar un plan con precio no añade filas a `wallet_movimiento` ni a `cobro_plataforma_movimiento`) |
| R5 | SI quien pide crear, editar (de inmediato o programado), archivar o asignar planes, cancelar un cambio programado, o listar los planes asignables a una empresa, no es el superadmin (incluido el `maestro` de la empresa afectada), ENTONCES el sistema DEBE responder `forbidden` sin leer ni escribir nada. La comprobación vive en el servicio. | `tests/unit/services/planes-service.test.ts` (cada rol de empresa, cero llamadas al repositorio) |
| R6 | CUANDO el superadmin archiva un plan, el sistema DEBE conservarlo, mantenerlo asignado a las empresas que ya lo tienen, con sus topes vigentes para ellas, y dejar de ofrecerlo entre los planes asignables. SI se pide asignar o editar un plan archivado, ENTONCES el sistema DEBE rechazarlo sin escribir nada. No existe forma de borrar un plan. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-catalogo.test.ts` (tras archivar, la empresa con el plan sigue topada); `tests/unit/guards/planes-sin-borrado.guardia.test.ts` |
| R7 | CUANDO se piden los planes públicos (la lectura de servidor que expondrá SL-25; esta ficha no la publica en ninguna action ni ruta), el sistema DEBE devolver solo los públicos no archivados, nunca uno custom. CUANDO el superadmin pide los planes asignables a una empresa, el sistema DEBE devolver los públicos no archivados y los custom no archivados de esa empresa, nunca los custom de otra. | `tests/integration/db/planes-catalogo.test.ts` |
| R8 | El sistema DEBE impedir que una empresa lea o escriba planes, sus topes, sus módulos incluidos y su rastro de plataforma, y que escriba su propia asignación de plan, por cualquier vía. Eso incluye el SQL a mano con el rol de la app. El sistema DEBE impedir también que una empresa lea el uso o el cupo de otra. | `tests/integration/db/planes-acceso-servi-app.test.ts` (`SELECT`/`INSERT`/`UPDATE` con `servi_app` → `42501`; `plan_cupo_ordenes` con otra empresa → error) |

### Asignación a una empresa

| R | Requisito | Test previsto |
|---|---|---|
| R9 | CUANDO el superadmin asigna un plan a una empresa, el sistema DEBE guardar la asignación. Si la empresa no tenía plan, guarda además la fecha de alta, que ancla sus ciclos (R20). CUANDO se cambia el plan de una empresa que ya tenía uno, el sistema DEBE conservar esa fecha: el cambio no reinicia el ciclo. | `tests/integration/db/planes-asignacion.test.ts` |
| R10 | CUANDO se asigna o se cambia el plan de una empresa, el sistema DEBE dejar encendidos para ella exactamente los módulos incluidos en el plan nuevo, en la misma transacción que la asignación: enciende los incluidos que estaban apagados y apaga los encendidos que no están incluidos. | `tests/integration/db/planes-asignacion.test.ts` |
| R11 | MIENTRAS una empresa tenga plan, el sistema DEBE permitir al superadmin encender por excepción un módulo no incluido con el interruptor de SL-23, y DEBE conservar esa excepción hasta el siguiente cambio de plan de esa empresa o hasta que una edición de los módulos del plan quite ese módulo (R17). | `tests/integration/db/planes-asignacion.test.ts` (asignar, encender la excepción con `ModulosEmpresaService`, editar los topes del plan: sigue encendido; cambiar de plan: se apaga) |
| R12 | SI la empresa ya usa más que algún tope del plan que se le asigna, ENTONCES el sistema DEBE rechazar la asignación sin cambiar nada: ni el plan ni los módulos ni el historial. El rechazo DEBE decir qué tope se pasa, con el uso y el tope. Un uso igual al tope no impide la asignación. Las órdenes se comparan con el ciclo en curso; los usuarios, por rol; las API keys, con las activas. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-asignacion.test.ts` (bajar de plan con 3 `adminTienda` activos a un tope de 2 → rechazo con `adminTienda`, 3 y 2; a un tope de 3 → asignado; ídem con API keys) |
| R13 | SI la empresa o el plan no existen, o el plan es custom de otra empresa, ENTONCES el sistema DEBE rechazar la asignación sin escribir nada. SI se asigna el plan que la empresa ya tiene, ENTONCES el sistema DEBE responder bien sin cambiar nada y sin registrar ninguna acción. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-asignacion.test.ts` |
| R14 | MIENTRAS una empresa no tenga plan, el sistema NO DEBE limitar ninguna de sus altas ni cambiar sus módulos. Las empresas que existen al desplegar y las que crea el superadmin después quedan sin plan. | `tests/integration/db/plan-topes-ordenes.test.ts` y `plan-topes-usuarios.test.ts` (empresa sin plan crea por encima de cualquier tope de otro plan); `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` (ninguna empresa previa queda con plan); `tests/integration/db/organizacion-modulo.test.ts` (existente, sin cambios) |

### Edición de un plan en uso

| R | Requisito | Test previsto |
|---|---|---|
| R15 | CUANDO el superadmin edita un plan para aplicar de inmediato, el sistema DEBE aplicar la versión nueva al momento a todas las empresas que lo tienen: la siguiente alta de cualquiera de ellas se cuenta contra el tope nuevo. (Revisado el 2026-10-28: la edición puede ser también programada, R37.) | `tests/integration/db/planes-edicion-en-uso.test.ts` |
| R16 | SI alguna de las empresas que tienen el plan ya usa más que alguno de los topes nuevos, ENTONCES el sistema DEBE guardar la edición igual (inmediata o programada), devolver un aviso que nombre cada empresa y cada tope que se pasa, con su uso y el tope nuevo, y, desde el momento en que la versión nueva rige, rechazar las altas de esa empresa que pasen el tope hasta que su uso baje. (Revisado el 2026-10-28: antes la edición se rechazaba.) | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-edicion-en-uso.test.ts` (empresa con 3 `adminTienda` activos, tope nuevo 2: se guarda, aviso con 3 y 2, crear un `adminTienda` se rechaza, inactivar dos y crear uno entra) |
| R17 | CUANDO cambian los módulos incluidos de un plan en uso, sea por una edición inmediata o al aplicarse un cambio programado, el sistema DEBE encender los añadidos y apagar los quitados en cada empresa que tiene el plan en ese momento, en la misma transacción, y NO DEBE tocar los demás módulos de esas empresas, incluidas sus excepciones. | `tests/integration/db/planes-edicion-en-uso.test.ts`; `tests/integration/db/planes-cambio-programado.test.ts` |

### Cambio programado de un plan

| R | Requisito | Test previsto |
|---|---|---|
| R37 | CUANDO el superadmin edita un plan con una fecha de vigencia (`vigente_desde`) futura, el sistema DEBE guardar la versión nueva completa (topes, módulos incluidos, precio y nombre) como cambio programado. La fecha que elige el superadmin rige desde las 00:00 de ese día en la hora de la plataforma (Costa Rica, UTC−6) hasta que SL-21 traiga zona por empresa, sin modificar la versión vigente. MIENTRAS no llegue esa fecha, el sistema DEBE contar las altas, mostrar el precio y mantener los módulos con la versión vigente. SI la fecha no es posterior al momento de guardar, ENTONCES el sistema DEBE responder `validation_error` sin escribir nada. | `tests/unit/types/planes-schema.test.ts`; `tests/integration/db/planes-cambio-programado.test.ts` (programado a mañana: hoy el tope viejo sigue rigiendo) |
| R38 | CUANDO llega la fecha de vigencia de un cambio programado, el sistema DEBE aplicarlo entero en una transacción: topes, precio y nombre del plan, y los módulos de cada empresa con R17. El sistema DEBE hacerlo, como tarde, en la siguiente pasada del drenador de trabajos. El cambio NO DEBE reiniciar el ciclo de órdenes de ninguna empresa: desde esa fecha, lo ya usado en el ciclo en curso se cuenta contra el tope nuevo. | `tests/integration/db/planes-cambio-programado.test.ts` (handler con el reloj pasado la fecha; ancla y uso del ciclo intactos); `tests/unit/cron/procesar-jobs-plan-cambio.test.ts` |
| R39 | El sistema DEBE guardar como mucho un cambio programado por plan: CUANDO el superadmin programa otro, el sistema DEBE reemplazar el pendiente. CUANDO el superadmin cancela el cambio pendiente, el sistema DEBE borrarlo. Un cambio reemplazado o cancelado NO DEBE aplicarse nunca, ni enviar recordatorios. | `tests/integration/db/planes-cambio-programado.test.ts` (los trabajos del cambio viejo corren y no hacen nada) |
| R40 | SI se archiva un plan con un cambio programado pendiente, ENTONCES el sistema DEBE cancelar ese cambio en la misma transacción. | `tests/integration/db/planes-cambio-programado.test.ts` |
| R41 | CUANDO el superadmin guarda una edición, inmediata o programada, el sistema DEBE enviar a todos los maestros activos de cada empresa que tiene el plan un correo con qué cambia y desde cuándo, y, si la empresa ya pasa algún tope nuevo, cuál, con su uso y el tope. Un fallo del correo NO DEBE deshacer ni impedir la edición. Una edición sin cambios no envía nada. | `tests/integration/db/planes-cambio-correos.test.ts` (emisor de correo doble); `tests/unit/services/email/plantilla-cambio-plan.test.ts` |
| R42 | MIENTRAS un cambio programado siga pendiente, el sistema DEBE enviar a esos mismos destinatarios un recordatorio 7 días antes y otro 1 día antes de la fecha de vigencia. Solo se envían los que caen después del momento de programar. Cada recordatorio sale como mucho una vez por empresa, aunque el trabajo se reintente o se ejecute dos veces. Va a las empresas que tienen el plan cuando sale el recordatorio, e indica los topes que ya pasan en ese momento. | `tests/integration/db/planes-cambio-correos.test.ts` (fecha a 10 días: dos recordatorios; a 3 días: solo el de 1 día; doble ejecución: un correo por empresa) |
| R43 | CUANDO el superadmin programa, reemplaza o cancela un cambio, o el sistema lo aplica, el sistema DEBE dejar una fila en el rastro de plataforma con quién (el sistema, al aplicar), cuándo, qué plan, qué acción y qué cambia, en la misma transacción. | `tests/integration/db/planes-historial.test.ts` |
| R45 | CUANDO se cancela un cambio programado, a mano o al archivar el plan, el sistema DEBE enviar a todos los maestros activos de cada empresa que tiene el plan un correo con el texto «El cambio del plan <nombre> previsto para <fecha> se canceló; tu plan sigue igual». CUANDO se reemplaza por otro, el sistema NO DEBE enviar un correo de cancelación aparte: el correo del cambio nuevo (R41) DEBE decir que reemplaza al previsto para la fecha anterior. Un fallo del correo NO DEBE deshacer la cancelación. | `tests/integration/db/planes-cambio-correos.test.ts` (cancelar a mano; archivar con un cambio pendiente; reemplazar: un solo correo por maestro, con la frase del reemplazo); `tests/unit/services/email/plantilla-cambio-plan.test.ts` |
| R44 | Los trabajos que aplican cambios y envían sus correos DEBEN ser parte del núcleo: corren sea cual sea el estado de los módulos de las empresas. | `tests/unit/guards/modulos-reparto.guardia.test.ts` (existente: los tipos nuevos están en `MODULO_POR_JOB` como `nucleo`) |

### Tope de órdenes

| R | Requisito | Test previsto |
|---|---|---|
| R18 | El sistema DEBE contar el uso de órdenes en el servidor, dentro de la misma transacción que crea las órdenes, y nunca a partir de un dato que mande el cliente. | `tests/integration/db/plan-topes-ordenes.test.ts` (inserción con SQL a mano y `servi_app`, sin pasar por ningún servicio, también se rechaza) |
| R19 | El sistema DEBE contar como uso de órdenes las órdenes de la empresa creadas dentro del ciclo en curso que no estén anuladas. CUANDO se anula una orden creada en el ciclo en curso, el sistema DEBE liberar su cupo al momento. Anular una orden creada en un ciclo pasado NO DEBE liberar cupo del ciclo en curso. Recuperar una orden anulada no es un alta: el sistema NO DEBE bloquearla aunque deje el uso por encima del tope. | `tests/integration/db/plan-topes-ordenes.test.ts` (al tope, anular una por pantalla y otra por API: se puede crear de nuevo; anular una del ciclo anterior no abre cupo; recuperar al tope funciona; una creada en el ciclo anterior no cuenta) |
| R20 | El sistema DEBE calcular el ciclo de órdenes desde la fecha de alta del plan en la empresa. Cada ciclo empieza el mismo día del mes que el alta y a la misma hora, y termina justo antes de que empiece el siguiente (alta el 15: ciclo del 15 al 14). SI un mes no tiene ese día, ENTONCES el ciclo de ese mes empieza su último día, y el siguiente vuelve al día del alta (alta el 31 de enero: ciclos desde el 28 o 29 de febrero, el 31 de marzo y el 30 de abril). El ciclo es siempre mensual, aunque el plan tenga precio anual. | `tests/integration/db/plan-ciclo.test.ts` (función de inicio de ciclo con fechas fijas); `tests/unit/utils/ciclo-plan.test.ts` |
| R21 | SI una petición de alta de órdenes, por la carga masiva por pantalla o por la API key, haría que el uso pase el tope, ENTONCES el sistema DEBE rechazar la petición entera sin crear ninguna de sus órdenes, y decir el tope y el uso en un mensaje claro. Una petición que deja el uso exactamente en el tope se acepta. | `tests/unit/services/bulk-orden-service.tope-plan.test.ts`; `tests/integration/db/plan-topes-ordenes.test.ts` (las dos rutas de creación: con guía y sin guía) |
| R22 | CUANDO la carga masiva por pantalla se rechaza por tope, también en la vista previa, el sistema DEBE devolver como error cada fila que se iba a crear, con el mensaje del tope, y seguir mostrando como duplicada o con error las filas que ya lo eran. | `tests/unit/services/bulk-orden-service.tope-plan.test.ts` |
| R23 | CUANDO una carga por API key se rechaza por tope, el sistema DEBE responder HTTP 409 con `code: "CONFLICT"` y `details.codigo = "tope_plan"`, con el tope y el uso en `details`, sin crear ninguna orden. | `tests/unit/api/api-key-carga-tope-plan.test.ts` |
| R24 | El sistema NO DEBE dejar que el uso de una empresa pase un tope, ni con dos altas a la vez para la misma empresa, ni con un alta a la vez que un cambio de plan o una edición de topes. SI dos altas concurrentes caben por separado pero no juntas, ENTONCES el sistema DEBE aceptar una y rechazar la otra. | `tests/integration/db/plan-topes-concurrencia.test.ts` (dos transacciones en paralelo con un cupo de 1; alta y bajada de plan en paralelo) |

### Tope de usuarios por rol

| R | Requisito | Test previsto |
|---|---|---|
| R25 | El sistema DEBE aceptar en un plan un tope opcional para cada rol con tope, y ningún tope de usuarios para `apiKey` ni para `superadmin`. Las cuentas `apiKey` NO DEBEN contar en ningún tope de usuarios por rol. Las tiendas son el rol `adminTienda`: el sistema NO DEBE tener un tope de tiendas aparte. | `tests/unit/types/planes-schema.test.ts`; `tests/integration/db/planes-catalogo.test.ts` (el `CHECK` de rol); `tests/integration/db/plan-topes-usuarios.test.ts` (crear una key no cambia ningún uso de rol) |
| R26 | El sistema DEBE contar como uso de un rol solo los usuarios de la empresa con ese rol en estado `activo`. Los `pendiente`, `inactivo` y `bloqueado` no cuentan. | `tests/integration/db/plan-topes-usuarios.test.ts` |
| R27 | SI un alta de usuario (crearlo activo, activarlo desde `inactivo` o `bloqueado`, aprobar su postulación o cambiarlo a otro rol) haría que el uso de su rol pase el tope, ENTONCES el sistema DEBE rechazarla sin cambiar nada, por cualquier vía, y decir el rol, el tope y el uso en un mensaje claro. Un rol sin tope no tiene límite. | `tests/integration/db/plan-topes-usuarios.test.ts` (las cuatro vías con los repositorios reales y con SQL a mano); `tests/unit/services/usuario-service-tope-plan.test.ts`; `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts` |
| R28 | CUANDO la pantalla de usuarios recibe un rechazo por tope, el sistema DEBE mostrar su mensaje: bajo el campo de rol al crear o editar, y en el aviso al activar. CUANDO lo recibe el panel de postulaciones, DEBE mostrarlo en el aviso al aprobar. | `tests/components/UsuariosTopePlan.test.tsx`; `tests/components/PostulacionesTopePlan.test.tsx` |

### Rastro, aislamiento y forma

| R | Requisito | Test previsto |
|---|---|---|
| R29 | CUANDO el superadmin crea, edita o archiva un plan, el sistema DEBE dejar un registro de plataforma con quién lo hizo, cuándo, qué plan, qué acción y qué cambió (valor anterior y nuevo de cada campo cambiado), aunque ninguna empresa use el plan. CUANDO el superadmin asigna o cambia el plan de una empresa, el sistema DEBE registrarlo en `historial_accion` de esa empresa. Los módulos que la sincronización enciende o apaga dejan además sus filas de SL-23. Todo va en la misma transacción que el cambio: si el registro falla, el cambio no persiste. | `tests/integration/db/planes-historial.test.ts` (plan público sin empresas: su fila de rastro; edición: el diff exacto; asignación: `historial_accion`; registro que falla: nada persiste) |
| R30 | El sistema DEBE guardar los planes en la plataforma y la asignación y los conteos por empresa: el plan de una empresa y su uso no cambian por nada que haga otra, salvo que el superadmin edite un plan que comparten. | `tests/integration/db/plan-topes-ordenes.test.ts` (A al tope, B con el mismo plan sigue creando); `tests/integration/db/planes-acceso-servi-app.test.ts` |
| R31 | El sistema DEBE nombrar en español toda tabla, columna, tipo, función, trigger y valor de la base que añade esta feature. | `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` (lee `information_schema`, `pg_enum`, `pg_proc` y `pg_trigger`) |
| R32 | La semilla (`pnpm run db:seed`) NO DEBE crear planes ni asignaciones. Cada test que necesite un plan lo crea. | `tests/unit/guards/planes-sin-seed.guardia.test.ts` |
| R33 | El humo de dos empresas DEBE cubrir el bloqueo: la empresa A tiene un plan con tope de N órdenes por ciclo y N órdenes creadas. Su tienda intenta crear una más por la carga masiva de la pantalla, ve el mensaje del tope y la orden no existe. La tienda de B, sin plan, crea la suya. | `e2e/dos-empresas-humo.spec.ts` |
| R34 | La feature NO DEBE añadir ninguna dependencia de terceros. | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) y diff de `package.json` vacío en dependencias |

### Tope de API keys

| R | Requisito | Test previsto |
|---|---|---|
| R35 | El sistema DEBE contar como uso de API keys las keys de la empresa en estado `activa`; una key `inactiva` no cuenta, y una eliminada ya no existe. SI crear una key o activar una inactiva haría que el uso pase el tope de API keys del plan, ENTONCES el sistema DEBE rechazarlo sin cambiar nada, por cualquier vía, y decir el tope y el uso en un mensaje claro. Sin tope de API keys no hay límite. | `tests/integration/db/plan-topes-api-keys.test.ts` (crear y activar con `ApiKeyRepository` real y con SQL a mano); `tests/unit/services/api-key-service-tope-plan.test.ts` |
| R36 | CUANDO la pantalla de API keys recibe un rechazo por tope, al crear o al activar una key, el sistema DEBE mostrar su mensaje en el aviso. | `tests/components/ApiKeysTopePlan.test.tsx` |

### Cobertura de las decisiones cerradas

| Decisión (fila) | Requisitos |
|---|---|
| ¿Qué limita un plan? | R1, R19, R25, R26, R35, R10 |
| ¿Qué pasa al llegar al tope? | R21, R22, R23, R27, R28, R35, R36, R24 |
| ¿Quién crea los planes? | R1, R5 |
| Plan público o custom | R1, R2, R6, R7, R13 |
| Precio | R3, R4 |
| Periodo de órdenes | R20 |
| ¿Una anulada libera cupo? | R19 |
| Usuarios | R25, R26, R27 |
| Módulos y plan | R10, R11, R17 |
| Bajar de plan | R12 |
| Editar topes de un plan en uso | R15, R16 |
| Empresa sin plan | R14 |
| Pantalla | Sin requisito propio: ninguna pantalla nueva. R28 y R36 solo hacen que tres pantallas existentes (usuarios, postulaciones y API keys) muestren el mensaje del servidor (`design.md > §8`) |
| ¿Queda rastro? | R29 |
| Aislamiento | R8, R30 |
| Identificadores de la base | R31 |
| ¿Seeds? | R32 |
| ¿Hace falta E2E? | R33 |
| ¿Librería? | R34 |
| «Contados en el servidor, en la misma transacción del alta» (Alcance) | R18, R24 |
| P1 — Mensual o anual | R20, R4 |
| P2 — Ciclo al cambiar de plan, anulada de un ciclo pasado, orden recuperada | R9, R12, R19 |
| P3 — Editar módulos de un plan en uso | R17, R11 |
| P4 — Quién cuenta para el tope de usuarios | R26, R27 |
| P5 — Rastro de plataforma | R29, R8 |
| Tope de API keys | R1, R25, R35, R36, R12, R16 |
| Mensaje del tope en «Usuarios» y postulaciones | R28 |
| Carga de más de 500 filas parcial ante carrera | R24 (el tope nunca se pasa), R21 (sin carrera, se rechaza entera); `design.md > §6.1` |
| 2026-10-28 — Edición programada con `vigente_desde` | R37, R38, R15 |
| 2026-10-28 — Un solo cambio programado por plan; se puede cancelar | R39, R40, R5 |
| 2026-10-28 — El cambio no reinicia ciclos | R38 |
| 2026-10-28 — Empresa que ya pasa el tope nuevo | R16 |
| 2026-10-28 — Correo al guardar y recordatorios | R41, R42, R44 |
| 2026-10-28 — Rastro del cambio programado | R43 |
| P6 — El nombre también se programa | R37, R38 |
| P7 — Destinatarios de los correos | R41, R42, R45 |
| P8 — Hora en que empieza la fecha | R37, R42 |
| P9 — Archivar cancela el pendiente | R40, R45 |
| 2026-10-28 — Correo al cancelar un cambio | R45 |
| 2026-10-28 — `{cosa}` de los avisos al superadmin | R16 (el aviso nombra el tope); `design.md > §6.4` |

## Preguntas abiertas

Ninguna. P1–P5 las cerró el humano el 2026-10-27 y P6–P9 el 2026-10-28 (filas fechadas abajo).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-27 | ¿Qué limita un plan? | Órdenes por ciclo, usuarios por rol y módulos incluidos. Las «tiendas» son el tope del rol Admin Tienda: no hay tope aparte. |
| 2026-10-27 | ¿Qué pasa al llegar al tope? | Bloqueo duro: el alta se rechaza con un mensaje claro y no se crea nada. Vale para todas las vías (pantalla, carga masiva, API). |
| 2026-10-27 | ¿Quién crea los planes? | El superadmin, uno por uno desde la app, sin desarrollo. Solo el superadmin, validado en el service con test. Se hereda de SL-23 y SL-40 D2. |
| 2026-10-27 | Plan público o custom | Público: lo pueden tener varias empresas y lo verá el autoservicio (SL-25). Custom: atado a UNA empresa, no visible al público, con sus propios topes. Los planes no se borran: se archivan (borrado lógico). |
| 2026-10-27 | Precio | Opcional. Monto mensual, con precio anual fijo o un % de descuento sobre el anual. También puede ser «negociable» (sin monto). Solo informativo: sin cobro real (se hereda de SL-40 D4). Sin moneda propia hasta SL-21 (se hereda de SL-40 `design.md`). |
| 2026-10-27 | Periodo de órdenes | Ciclo desde la fecha de alta del plan en la empresa (alta el 15, ciclo del 15 al 14). |
| 2026-10-27 | ¿Una anulada libera cupo? | Sí: cuentan las creadas menos las anuladas en el ciclo. Se hereda de SL-40 D3. |
| 2026-10-27 | Usuarios | Tope por rol, cada uno opcional: un rol sin tope no tiene límite. |
| 2026-10-27 | Módulos y plan | El plan trae módulos incluidos. Al asignar o cambiar plan, los módulos se sincronizan solos (se encienden los incluidos y se apagan los no incluidos). El superadmin puede encender por excepción un módulo no incluido con el interruptor de SL-23. |
| 2026-10-27 | Bajar de plan | No se permite si la empresa ya usa más que algún tope del plan nuevo: el cambio se rechaza diciendo qué tope se pasa. |
| 2026-10-27 | Editar topes de un plan en uso (**revisada el 2026-10-28**) | Aplica al momento a todas sus empresas. Si alguna ya pasa el nuevo tope, la edición se rechaza (misma regla que bajar de plan). **Revisión del 2026-10-28:** ya no se rechaza; se guarda y se avisa (fila «Empresa que ya pasa el tope nuevo» de abajo). La regla de bajar de plan al asignar no cambia. |
| 2026-10-27 | Empresa sin plan | Sin límites: las empresas de hoy y las que cree el superadmin siguen igual hasta que se les asigne un plan. |
| 2026-10-27 | Pantalla | Ninguna en esta ficha: solo backend. Las pantallas van en SL-26. |
| 2026-10-27 | ¿Queda rastro? | Sí: crear, editar o archivar un plan y asignarlo a una empresa van a `historial_accion`. Se hereda de SL-23 y SL-36. |
| 2026-10-27 | Aislamiento | Los planes son de plataforma; la asignación y los conteos, por empresa. Se hereda de SL-17. |
| 2026-10-27 | Identificadores de la base | En español. Se hereda de SL-23 y SL-19 D5. |
| 2026-10-27 | ¿Seeds? | No: la app nace sin planes. Los tests crean los suyos. Se hereda de SL-17 D10. |
| 2026-10-27 | ¿Hace falta E2E? | Sí: es un flujo crítico de permisos. Se amplía el humo de dos empresas: una al tope de órdenes no puede crear una más. Se hereda de SL-23. |
| 2026-10-27 | ¿Librería? | Ninguna dependencia nueva. |
| 2026-10-27 | P1 — ¿Mensual o anual por empresa? | El anual es solo una forma de precio. El tope de órdenes se cuenta siempre por ciclo mensual desde el alta. |
| 2026-10-27 | P2 — Ciclo al cambiar de plan, anulada de un ciclo pasado, orden recuperada | a) Cambiar de plan NO reinicia el ciclo: el ancla es la del primer plan. b) Anular una orden de un ciclo pasado NO libera cupo del ciclo en curso. c) Recuperar una orden anulada NO se bloquea en el tope. |
| 2026-10-27 | P3 — Editar los módulos de un plan en uso | Se aplica solo lo añadido y lo quitado en cada empresa del plan, y se respetan las excepciones de cada empresa en los demás módulos. |
| 2026-10-27 | P4 — ¿Quién cuenta para el tope de usuarios? | Solo los usuarios `activo`. Activar un usuario `inactivo` o `bloqueado` cuando su rol está en el tope se rechaza con el error de tope. Cambiar a un rol lleno, también. |
| 2026-10-27 | P5 — ¿Rastro de un plan sin empresas? | Sí hay rastro de plataforma: crear, editar o archivar un plan deja registro (quién, cuándo, qué cambió) aunque ninguna empresa lo use, en una tabla nueva de plataforma sin `organizacion_id`. Asignar un plan a una empresa sigue yendo también a `historial_accion`. |
| 2026-10-27 | Tope de API keys | El plan tiene un tope opcional de API keys por empresa. Cuentan las keys vivas, no revocadas (definición en `design.md > §4.3`: estado `activa`). Crear una key al tope se rechaza. Las cuentas `apiKey` NO cuentan en el tope de usuarios por rol. |
| 2026-10-27 | Mensaje del tope en «Usuarios» y postulaciones | Se queda el cambio mínimo de `design.md > §8` en las dos pantallas existentes. |
| 2026-10-27 | Carga de más de 500 filas parcial ante una carrera | Aceptado tal como lo describe `design.md > §6.1`: el tope nunca se pasa y el resumen dice qué entró. |
| 2026-10-28 | Edición programada del plan | Al editar un plan, el superadmin elige aplicar de inmediato o a partir de una fecha (`vigente_desde`, columna en la base). Hasta esa fecha rige la versión actual y desde ella, la nueva. Cubre todo el plan: topes, módulos incluidos y precio. Pedida después de aprobar, con la tanda A ya implementada (`8a37167`): entra como migración y tasks nuevas, sin rehacer T0–T3. |
| 2026-10-28 | ¿Cuántos cambios programados por plan? | Uno solo. Programar otro reemplaza al pendiente, y se puede cancelar. |
| 2026-10-28 | Ciclo de órdenes ante un cambio | El cambio no reinicia ciclos. Cada empresa sigue su ciclo y, desde la fecha, lo ya usado se cuenta contra el tope nuevo (coherente con P2a). |
| 2026-10-28 | Empresa que ya pasa el tope nuevo | Se guarda igual (no se rechaza) y se avisa. Desde la fecha efectiva, esa empresa queda bloqueada para altas nuevas hasta bajar del tope. Aplica también a la edición inmediata y reemplaza la regla del 2026-10-27 de rechazar la edición. La regla de no bajar de plan al ASIGNAR un plan menor no cambia. |
| 2026-10-28 | Correos del cambio | Al guardar el cambio, programado o inmediato, se envía un correo al maestro de cada empresa con ese plan: qué cambia, desde cuándo y, si ya pasa algún tope, cuál. Los cambios programados tienen recordatorios 7 días antes y 1 día antes. Usa `lib/services/email/*` y `plantilla-marca.ts`, sin dependencias nuevas. |
| 2026-10-28 | Rastro del cambio programado | Programar, reemplazar, cancelar y aplicar un cambio van a `plan_rastro`. |
| 2026-10-28 | P6 — ¿El nombre del plan también se programa? | Sí: el nombre se programa con el resto. |
| 2026-10-28 | P7 — ¿Quién recibe los correos? | Todos los maestros activos de cada empresa. |
| 2026-10-28 | P8 — ¿A qué hora empieza la fecha? | A las 00:00 de esa fecha en la hora de la plataforma (Costa Rica, UTC−6, como los crons), hasta SL-21. SL-26 pide solo la fecha. |
| 2026-10-28 | P9 — ¿Archivar un plan cancela su cambio pendiente? | Sí. |
| 2026-10-28 | Correo al cancelar un cambio | Cancelar un cambio programado, a mano o al archivar el plan, envía correo a los maestros activos de las empresas del plan: «El cambio del plan X previsto para <fecha> se canceló; tu plan sigue igual». Si el cambio se reemplaza, el correo del cambio nuevo lo deja claro y no sale un correo de cancelación aparte (decidido en `design.md > §16.4`). |
| 2026-10-28 | Texto `{cosa}` de los avisos al superadmin | Aprobado tal como está en `lib/planes/mensajes.ts`: «órdenes en el ciclo en curso», «API keys activas» y «usuarios activos con el rol {rol}». |
