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
> - **Tope**: el máximo de un plan para una cosa contada: órdenes por ciclo, o usuarios de un rol.
>   Cada tope es opcional; sin tope, esa cosa no tiene límite.
> - **Roles con tope**: `maestro`, `admin`, `mensajero`, `adminTienda` (Admin Tienda) y
>   `adminSatelite`. `apiKey` y `superadmin` no llevan tope (P4).
> - **Ciclo**: el periodo de conteo de órdenes, anclado en la fecha de alta del plan en la empresa (R20).
> - **Uso**: lo que la empresa lleva contado. De órdenes: las creadas en el ciclo en curso y no
>   anuladas (R19). De un rol: sus usuarios en estado que cuenta, `activo` o `bloqueado` (R26, P4).
> - **Alta**: toda operación que hace crecer un uso. Es crear órdenes por cualquier vía, o crear un
>   usuario que cuenta. También lo es que un usuario existente pase a contar: reactivarlo, aprobar
>   su postulación o cambiarlo a un rol con tope.
> - **Anulada**: una orden eliminada (`deleted_at` con valor). Es la definición de SL-40 D6; la
>   cancelación por API no es una anulación.
>
> La columna «Test previsto» la confirma el implementer en `progress/impl_SL-24.md`. Los requisitos
> marcados **(Pn)** están escritos con la propuesta de `design.md` para la pregunta abierta n; si
> el humano decide otra cosa, se reescriben antes de implementar.

### Catálogo de planes

| R | Requisito | Test previsto |
|---|---|---|
| R1 | CUANDO el superadmin crea un plan, el sistema DEBE guardarlo con su nombre, su visibilidad (público o custom), su tope de órdenes por ciclo (opcional), un tope por cada rol con tope (cada uno opcional), sus módulos incluidos (un subconjunto de los 8 módulos de SL-23) y su precio, y devolver su identificador. Ningún plan nace archivado. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-catalogo.test.ts` |
| R2 | SI un plan custom no nombra exactamente una empresa existente, o un plan público nombra alguna, o una edición intenta cambiar la visibilidad de un plan o la empresa de un plan custom, ENTONCES el sistema DEBE rechazar la petición sin escribir nada. | `tests/unit/types/planes-schema.test.ts`; `tests/unit/services/planes-service.test.ts` |
| R3 | El sistema DEBE aceptar como precio de un plan exactamente una de estas formas: sin precio; «negociable» (sin monto); un monto mensual solo; un monto mensual con un precio anual fijo; o un monto mensual con un porcentaje de descuento sobre el anual, mayor que 0 y como mucho 100. Los montos son ≥ 0, con dos decimales como máximo, y caben en `DECIMAL(12,2)`. SI la petición combina «negociable» con un monto, o un anual fijo con un porcentaje, o trae un anual sin mensual, ENTONCES el sistema DEBE responder `validation_error` sin escribir nada. | `tests/unit/types/planes-schema.test.ts`; `tests/integration/db/planes-catalogo.test.ts` (los `CHECK` de la base rechazan las mismas combinaciones con SQL a mano como dueño) |
| R4 | El sistema NO DEBE generar por el precio de un plan ningún cobro, movimiento de caja, cargo ni deuda. Lo guarda sin moneda propia. | `tests/integration/db/planes-asignacion.test.ts` (asignar un plan con precio no añade filas a `wallet_movimiento` ni a `cobro_plataforma_movimiento`) |
| R5 | SI quien pide crear, editar, archivar o asignar planes, o listar los planes asignables a una empresa, no es el superadmin (incluido el `maestro` de la empresa afectada), ENTONCES el sistema DEBE responder `forbidden` sin leer ni escribir nada. La comprobación vive en el servicio. | `tests/unit/services/planes-service.test.ts` (cada rol de empresa, cero llamadas al repositorio) |
| R6 | CUANDO el superadmin archiva un plan, el sistema DEBE conservarlo, mantenerlo asignado a las empresas que ya lo tienen, con sus topes vigentes para ellas, y dejar de ofrecerlo entre los planes asignables. SI se pide asignar o editar un plan archivado, ENTONCES el sistema DEBE rechazarlo sin escribir nada. No existe forma de borrar un plan. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-catalogo.test.ts` (tras archivar, la empresa con el plan sigue topada); `tests/unit/guards/planes-sin-borrado.guardia.test.ts` |
| R7 | CUANDO se piden los planes públicos (la lectura de servidor que expondrá SL-25; esta ficha no la publica en ninguna action ni ruta), el sistema DEBE devolver solo los públicos no archivados, nunca uno custom. CUANDO el superadmin pide los planes asignables a una empresa, el sistema DEBE devolver los públicos no archivados y los custom no archivados de esa empresa, nunca los custom de otra. | `tests/integration/db/planes-catalogo.test.ts` |
| R8 | El sistema DEBE impedir que una empresa lea o escriba planes, sus topes y sus módulos incluidos, y que escriba su propia asignación de plan, por cualquier vía. Eso incluye el SQL a mano con el rol de la app. El sistema DEBE impedir también que una empresa lea el uso o el cupo de otra. | `tests/integration/db/planes-acceso-servi-app.test.ts` (`SELECT`/`INSERT`/`UPDATE` con `servi_app` → `42501`; `plan_cupo_ordenes` con otra empresa → error) |

### Asignación a una empresa

| R | Requisito | Test previsto |
|---|---|---|
| R9 | CUANDO el superadmin asigna un plan a una empresa, el sistema DEBE guardar la asignación. Si la empresa no tenía plan, guarda además la fecha de alta, que ancla sus ciclos (R20). | `tests/integration/db/planes-asignacion.test.ts` |
| R10 | CUANDO se asigna o se cambia el plan de una empresa, el sistema DEBE dejar encendidos para ella exactamente los módulos incluidos en el plan nuevo, en la misma transacción que la asignación: enciende los incluidos que estaban apagados y apaga los encendidos que no están incluidos. | `tests/integration/db/planes-asignacion.test.ts` |
| R11 | MIENTRAS una empresa tenga plan, el sistema DEBE permitir al superadmin encender por excepción un módulo no incluido con el interruptor de SL-23, y DEBE conservar esa excepción hasta el siguiente cambio de plan de esa empresa o hasta que una edición de los módulos del plan quite ese módulo (R17). | `tests/integration/db/planes-asignacion.test.ts` (asignar, encender la excepción con `ModulosEmpresaService`, editar los topes del plan: sigue encendido; cambiar de plan: se apaga) |
| R12 | SI la empresa ya usa más que algún tope del plan que se le asigna, ENTONCES el sistema DEBE rechazar la asignación sin cambiar nada: ni el plan ni los módulos ni el historial. El rechazo DEBE decir qué tope se pasa, con el uso y el tope. Un uso igual al tope no impide la asignación. Las órdenes se comparan con el ciclo en curso (P2). | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-asignacion.test.ts` (bajar de plan con 3 `adminTienda` a un tope de 2 → rechazo con `adminTienda`, 3 y 2; a un tope de 3 → asignado) |
| R13 | SI la empresa o el plan no existen, o el plan es custom de otra empresa, ENTONCES el sistema DEBE rechazar la asignación sin escribir nada. SI se asigna el plan que la empresa ya tiene, ENTONCES el sistema DEBE responder bien sin cambiar nada y sin registrar ninguna acción. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-asignacion.test.ts` |
| R14 | MIENTRAS una empresa no tenga plan, el sistema NO DEBE limitar ninguna de sus altas ni cambiar sus módulos. Las empresas que existen al desplegar y las que crea el superadmin después quedan sin plan. | `tests/integration/db/plan-topes-ordenes.test.ts` y `plan-topes-usuarios.test.ts` (empresa sin plan crea por encima de cualquier tope de otro plan); `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` (ninguna empresa previa queda con plan); `tests/integration/db/organizacion-modulo.test.ts` (existente, sin cambios) |

### Edición de un plan en uso

| R | Requisito | Test previsto |
|---|---|---|
| R15 | CUANDO el superadmin edita los topes de un plan, el sistema DEBE aplicarlos al momento a todas las empresas que lo tienen: la siguiente alta de cualquiera de ellas se cuenta contra el tope nuevo. | `tests/integration/db/planes-edicion-en-uso.test.ts` |
| R16 | SI alguna de las empresas que tienen el plan ya usa más que alguno de los topes nuevos, ENTONCES el sistema DEBE rechazar la edición entera sin cambiar nada y nombrar cada empresa y cada tope que se pasa, con su uso y el tope nuevo. | `tests/unit/services/planes-service.test.ts`; `tests/integration/db/planes-edicion-en-uso.test.ts` |
| R17 | CUANDO el superadmin cambia los módulos incluidos de un plan en uso, el sistema DEBE encender los añadidos y apagar los quitados en cada empresa que tiene el plan, en la misma transacción, y NO DEBE tocar los demás módulos de esas empresas, incluidas sus excepciones (P3). | `tests/integration/db/planes-edicion-en-uso.test.ts` |

### Tope de órdenes

| R | Requisito | Test previsto |
|---|---|---|
| R18 | El sistema DEBE contar el uso de órdenes en el servidor, dentro de la misma transacción que crea las órdenes, y nunca a partir de un dato que mande el cliente. | `tests/integration/db/plan-topes-ordenes.test.ts` (inserción con SQL a mano y `servi_app`, sin pasar por ningún servicio, también se rechaza) |
| R19 | El sistema DEBE contar como uso de órdenes las órdenes de la empresa creadas dentro del ciclo en curso que no estén anuladas. CUANDO se anula una orden del ciclo en curso, el sistema DEBE liberar su cupo al momento. Recuperar una orden anulada no es un alta y no se bloquea (P2). | `tests/integration/db/plan-topes-ordenes.test.ts` (al tope, anular una por pantalla y otra por API: se puede crear de nuevo; una creada en el ciclo anterior no cuenta) |
| R20 | El sistema DEBE calcular el ciclo de órdenes desde la fecha de alta del plan en la empresa. Cada ciclo empieza el mismo día del mes que el alta y a la misma hora, y termina justo antes de que empiece el siguiente (alta el 15: ciclo del 15 al 14). SI un mes no tiene ese día, ENTONCES el ciclo de ese mes empieza su último día, y el siguiente vuelve al día del alta (alta el 31 de enero: ciclos desde el 28 o 29 de febrero, el 31 de marzo y el 30 de abril). Ciclo mensual a la espera de P1. | `tests/integration/db/plan-ciclo.test.ts` (función de inicio de ciclo con fechas fijas); `tests/unit/utils/ciclo-plan.test.ts` |
| R21 | SI una petición de alta de órdenes, por la carga masiva por pantalla o por la API key, haría que el uso pase el tope, ENTONCES el sistema DEBE rechazar la petición entera sin crear ninguna de sus órdenes, y decir el tope y el uso en un mensaje claro. Una petición que deja el uso exactamente en el tope se acepta. | `tests/unit/services/bulk-orden-service.tope-plan.test.ts`; `tests/integration/db/plan-topes-ordenes.test.ts` (las dos rutas de creación: con guía y sin guía) |
| R22 | CUANDO la carga masiva por pantalla se rechaza por tope, también en la vista previa, el sistema DEBE devolver como error cada fila que se iba a crear, con el mensaje del tope, y seguir mostrando como duplicada o con error las filas que ya lo eran. | `tests/unit/services/bulk-orden-service.tope-plan.test.ts` |
| R23 | CUANDO una carga por API key se rechaza por tope, el sistema DEBE responder HTTP 409 con `code: "CONFLICT"` y `details.codigo = "tope_plan"`, con el tope y el uso en `details`, sin crear ninguna orden. | `tests/unit/api/api-key-carga-tope-plan.test.ts` |
| R24 | El sistema NO DEBE dejar que el uso de una empresa pase un tope, ni con dos altas a la vez para la misma empresa, ni con un alta a la vez que un cambio de plan o una edición de topes. SI dos altas concurrentes caben por separado pero no juntas, ENTONCES el sistema DEBE aceptar una y rechazar la otra. | `tests/integration/db/plan-topes-concurrencia.test.ts` (dos transacciones en paralelo con un cupo de 1; alta y bajada de plan en paralelo) |

### Tope de usuarios por rol

| R | Requisito | Test previsto |
|---|---|---|
| R25 | El sistema DEBE aceptar en un plan un tope opcional para cada rol con tope, y ningún tope para `apiKey` ni para `superadmin`. Las tiendas son el rol `adminTienda`: el sistema NO DEBE tener un tope de tiendas aparte. | `tests/unit/types/planes-schema.test.ts`; `tests/integration/db/planes-catalogo.test.ts` (el `CHECK` de rol) |
| R26 | El sistema DEBE contar como uso de un rol los usuarios de la empresa con ese rol en estado `activo` o `bloqueado` (P4). | `tests/integration/db/plan-topes-usuarios.test.ts` |
| R27 | SI un alta de usuario (crearlo, reactivarlo, aprobar su postulación o cambiarlo a otro rol) haría que el uso de su rol pase el tope, ENTONCES el sistema DEBE rechazarla sin cambiar nada, por cualquier vía, y decir el rol, el tope y el uso en un mensaje claro. Un rol sin tope no tiene límite. | `tests/integration/db/plan-topes-usuarios.test.ts` (las cuatro vías con los repositorios reales y con SQL a mano); `tests/unit/services/usuario-service-tope-plan.test.ts`; `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts` |
| R28 | CUANDO la pantalla de usuarios recibe un rechazo por tope, el sistema DEBE mostrar su mensaje: bajo el campo de rol al crear o editar, y en el aviso al activar. CUANDO lo recibe el panel de postulaciones, DEBE mostrarlo en el aviso al aprobar. | `tests/components/UsuariosTopePlan.test.tsx`; `tests/components/PostulacionesTopePlan.test.tsx` |

### Rastro, aislamiento y forma

| R | Requisito | Test previsto |
|---|---|---|
| R29 | CUANDO el superadmin crea, edita o archiva un plan, o asigna o cambia el plan de una empresa, el sistema DEBE registrar en `historial_accion` de cada empresa afectada quién lo hizo, cuándo, qué plan y qué acción, en la misma transacción que el cambio. Los módulos que la sincronización enciende o apaga dejan además sus filas de SL-23. Si el registro falla, el cambio no persiste (P5). | `tests/integration/db/planes-historial.test.ts` |
| R30 | El sistema DEBE guardar los planes en la plataforma y la asignación y los conteos por empresa: el plan de una empresa y su uso no cambian por nada que haga otra, salvo que el superadmin edite un plan que comparten. | `tests/integration/db/plan-topes-ordenes.test.ts` (A al tope, B con el mismo plan sigue creando); `tests/integration/db/planes-acceso-servi-app.test.ts` |
| R31 | El sistema DEBE nombrar en español toda tabla, columna, tipo, función, trigger y valor de la base que añade esta feature. | `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` (lee `information_schema`, `pg_enum`, `pg_proc` y `pg_trigger`) |
| R32 | La semilla (`pnpm run db:seed`) NO DEBE crear planes ni asignaciones. Cada test que necesite un plan lo crea. | `tests/unit/guards/planes-sin-seed.guardia.test.ts` |
| R33 | El humo de dos empresas DEBE cubrir el bloqueo: la empresa A tiene un plan con tope de N órdenes por ciclo y N órdenes creadas. Su tienda intenta crear una más por la carga masiva de la pantalla, ve el mensaje del tope y la orden no existe. La tienda de B, sin plan, crea la suya. | `e2e/dos-empresas-humo.spec.ts` |
| R34 | La feature NO DEBE añadir ninguna dependencia de terceros. | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) y diff de `package.json` vacío en dependencias |

### Cobertura de las decisiones cerradas

| Decisión (fila) | Requisitos |
|---|---|
| ¿Qué limita un plan? | R1, R19, R25, R26, R10 |
| ¿Qué pasa al llegar al tope? | R21, R22, R23, R27, R28, R24 |
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
| Pantalla | Sin requisito propio: ninguna pantalla nueva. R28 solo hace que dos pantallas existentes muestren el mensaje del servidor (`design.md > §8`) |
| ¿Queda rastro? | R29 |
| Aislamiento | R8, R30 |
| Identificadores de la base | R31 |
| ¿Seeds? | R32 |
| ¿Hace falta E2E? | R33 |
| ¿Librería? | R34 |
| «Contados en el servidor, en la misma transacción del alta» (Alcance) | R18, R24 |

## Preguntas abiertas

1. **Mensual o anual por empresa.** ¿La empresa queda suscrita en mensual o en anual? Si es anual,
   ¿el tope de órdenes sigue contándose por ciclo mensual desde la fecha de alta, o por ciclo anual?
   Del humano.
   - El spec no la decide. R20 está escrito con ciclo mensual, que es el ejemplo de la decisión
     «Periodo de órdenes». La opción propuesta va en `design.md > §3`, marcada «a confirmar por el
     humano».
2. **El ciclo al cambiar de plan, y la orden recuperada** (de spec_author, 2026-10-27).
   - a) ¿El cambio de plan reinicia el ciclo? «Fecha de alta del plan» puede leerse como la fecha
     del primer plan o como la del plan vigente. Si el cambio lo reinicia, el ciclo nuevo empieza
     en cero y la regla «bajar de plan» nunca podría rechazar por órdenes. **Propuesta:** el ancla
     es la del primer plan y se conserva al cambiar (`design.md > §3, §5.2`).
   - b) ¿Anular una orden de un ciclo pasado libera cupo en el ciclo en curso? **Propuesta:** no.
     Cuentan las creadas en el ciclo que siguen vivas.
   - c) Recuperar una orden anulada (`restore`, SL-40) ¿cuenta como alta y se bloquea al tope?
     **Propuesta:** no se bloquea. Deshace un error, como lo trata SL-40, y puede dejar el uso
     uno por encima del tope.
3. **Editar los módulos de un plan en uso** (de spec_author). La decisión «Módulos y plan» habla de
   asignar o cambiar de plan. **Propuesta (R17):** se aplica solo la diferencia (los añadidos se
   encienden y los quitados se apagan) en cada empresa del plan, y las excepciones de los demás
   módulos se respetan. La alternativa es resincronizar todo, lo que borraría las excepciones de
   todas las empresas del plan.
4. **Quién cuenta para el tope de usuarios** (de spec_author). **Propuesta (R25, R26):** cuentan
   los estados `activo` y `bloqueado`; no cuentan `pendiente` (postulación sin aprobar) ni
   `inactivo` (baja lógica). `apiKey` no lleva tope: es la cuenta técnica de una key, no una
   persona.
5. **Rastro de un plan público** (de spec_author). `historial_accion` es de negocio y exige
   empresa, y el superadmin no tiene (SL-40 `design.md > §3.1`). **Propuesta (R29):** la fila va a
   cada empresa afectada: la del custom, y para un público, cada empresa que lo tiene asignado en
   ese momento. Crear o editar un plan público que ninguna empresa tiene no deja fila; solo
   quedan sus fechas en el propio plan. La alternativa es una tabla de rastro de plataforma
   (`design.md > §12`, alternativa 6).

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
| 2026-10-27 | Editar topes de un plan en uso | Aplica al momento a todas sus empresas. Si alguna ya pasa el nuevo tope, la edición se rechaza (misma regla que bajar de plan). |
| 2026-10-27 | Empresa sin plan | Sin límites: las empresas de hoy y las que cree el superadmin siguen igual hasta que se les asigne un plan. |
| 2026-10-27 | Pantalla | Ninguna en esta ficha: solo backend. Las pantallas van en SL-26. |
| 2026-10-27 | ¿Queda rastro? | Sí: crear, editar o archivar un plan y asignarlo a una empresa van a `historial_accion`. Se hereda de SL-23 y SL-36. |
| 2026-10-27 | Aislamiento | Los planes son de plataforma; la asignación y los conteos, por empresa. Se hereda de SL-17. |
| 2026-10-27 | Identificadores de la base | En español. Se hereda de SL-23 y SL-19 D5. |
| 2026-10-27 | ¿Seeds? | No: la app nace sin planes. Los tests crean los suyos. Se hereda de SL-17 D10. |
| 2026-10-27 | ¿Hace falta E2E? | Sí: es un flujo crítico de permisos. Se amplía el humo de dos empresas: una al tope de órdenes no puede crear una más. Se hereda de SL-23. |
| 2026-10-27 | ¿Librería? | Ninguna dependencia nueva. |
