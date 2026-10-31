# SLT-66 — planes-sin-tope-maestro-y-costeo · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SL-24, SLT-58, SL-40 · **Rama** feature/SLT-66-planes-sin-tope-maestro-y-costeo
>
> **Alcance.** Ajusta el modelo de planes de SL-24 y su UI de SLT-58.
> - El rol maestro deja de tener tope y de contar en los topes. Los demás roles siguen con tope por rol.
> - El plan tiene costo base mensual y costo por orden.
> - El cobro por orden de SL-40 pasa a usar el costo del plan.
> - El formulario del plan, el modal de asignación y «Mi plan» reflejan los cambios.
>
> **Lo que NO entra.**
> - Cobrar de verdad el costo base: sin cargo en la wallet ni pasarela.
> - El formato de los montos de los campos (SLT-67).
> - Migrar otros formularios de monto (deuda D33).
>
> Sembrado por `/afinar-feature` el 2026-10-31. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-10-31. Cambian reglas ya probadas de SL-24 (R25: el maestro
> tenía tope), de SL-40 (R3: la tarifa vigente gana el escalón «plan») y de SLT-58 (R1, R2, R14: el
> maestro y el «precio» en pantalla). Cada cambio está acotado aquí y los tests que obliga a tocar están
> enumerados en `design.md > §10.2`. Todo lo demás de esas tres fichas sigue igual (R27).
>
> **Glosario.**
> - *Costo base*: lo que SL-24 llamaba precio mensual (`precio_mensual`), con sus cinco formas (SL-24 R3).
> - *Costo por orden del plan*: importe opcional del plan; vacío = el plan no lo fija.
> - *Costo por orden vigente de una empresa*: el de SL-40 R3 con un escalón más (R12).
> - *Órdenes del ciclo*: las creadas en el ciclo en curso de la empresa y no anuladas, la misma cuenta
>   que el tope de órdenes (SL-24 R19, SLT-58 R34).

### Maestro sin tope

- **R1** — El sistema NO DEBE admitir un tope de usuarios para el rol `maestro` en ningún plan: la base DEBE
  rechazar con `23514` toda fila de tope del rol `maestro`. SI el superadmin crea, edita o programa un plan
  con un tope de `maestro`, ENTONCES el sistema DEBE responder `validation_error` sin escribir nada.
- **R2** — Los roles `admin`, `mensajero`, `adminTienda` y `adminSatelite` DEBEN seguir admitiendo su tope
  y haciéndolo cumplir como en SL-24 (R25–R27).
- **R3** — CUANDO se crea, se activa, se aprueba la postulación o se cambia de rol a un usuario que queda con
  rol `maestro` en una empresa con plan, el sistema DEBE aceptarlo aunque los demás roles estén en su tope.
  Además NO DEBE cambiar el uso de ningún tope (órdenes, roles ni API keys).
- **R4** — CUANDO se aplica la migración de esta ficha, el sistema DEBE:
  - borrar los topes de `maestro` de todos los planes;
  - quitar el tope de `maestro` de las versiones de los cambios programados pendientes.

  NO DEBE tocar los demás topes, los módulos, el costo base, el rastro (`plan_rastro`) ni la asignación de
  ninguna empresa.
- **R5** — El sistema NO DEBE mostrar ningún campo, fila ni línea del rol `maestro` en estas pantallas:
  - el formulario del plan;
  - el catálogo y el detalle del plan;
  - el modal de asignación;
  - la sección de plan del detalle de empresa;
  - «Mi plan».
- **R6** — El tope de órdenes por ciclo y el tope de API keys DEBEN seguir funcionando como en SL-24
  (R18–R24, R35, R36).

### Costeo del plan

- **R7** — Cada plan DEBE tener un costo por orden opcional, independiente de la forma del costo base. Un
  plan sin precio, negociable o con monto puede llevarlo o dejarlo vacío.
- **R8** — SI el costo por orden no es un importe `≥ 0` con hasta dos decimales, escrito como texto, ENTONCES:
  - el sistema DEBE responder `validation_error` en el campo `costoPorOrden`, sin escribir;
  - la base DEBE rechazarlo también (`23514`) si llega por SQL a mano.

  Vacío es válido y se guarda como «sin costo por orden».
- **R9** — El sistema DEBE presentar como «costo base» mensual el importe que SL-24 llamaba precio mensual.
  Aplica al formulario, al catálogo, al detalle del plan, al modal de asignación, a las líneas de cambio
  (pantallas y correo) y a «Mi plan». Las cinco formas de SL-24 R3 se conservan, también el anual fijo o
  con descuento.
- **R10** — DONDE el plan tenga precio anual fijo o descuento anual, el sistema DEBE indicar junto al costo
  por orden que el anual no se aplica a él. El descuento NUNCA DEBE rebajar el costo por orden: ni en el
  cargo (R14) ni en el total estimado (R19).
- **R11** — CUANDO el superadmin crea un plan, lo edita de inmediato o programa un cambio, el sistema DEBE
  guardar el costo por orden con la versión del plan. En concreto:
  - un cambio programado lo aplica en su fecha, como el resto de la versión (SL-24 R37, R38);
  - cada cambio real del costo por orden deja su antes y su después en `plan_rastro`, como texto con dos
    decimales (SL-24 R29);
  - el cambio aparece en las líneas de «qué cambia» del detalle, de «Mi plan» y del correo de SL-24 R41;
  - una edición que no cambia nada no escribe.

  Cualquier actor que no sea el superadmin DEBE recibir `forbidden` sin que se llame al repositorio
  (SL-24 R5).

### Cobro por orden (SL-40)

- **R12** — CUANDO se crea una orden por cualquier vía, el sistema DEBE registrar su cargo con el costo por
  orden vigente de la empresa en ese instante. El importe se elige por este orden de prioridad:
  1. la excepción de la empresa (fuente `empresa`);
  2. si no la hay, el costo por orden del plan asignado a la empresa (fuente `plan`);
  3. si el plan no lo tiene o la empresa no tiene plan, el valor global (fuente `global`);
  4. si no hay ninguno, `0.00` (fuente `sin_configurar`, SL-40 D11).
- **R13** — MIENTRAS la empresa tenga asignado un plan archivado, su costo por orden DEBE seguir aplicando a
  las órdenes nuevas. Es la misma regla que SL-24 R6 aplica a los topes.
- **R14** — El importe de un cargo de fuente `plan` DEBE ser exactamente el costo por orden del plan, sin
  impuestos ni descuento anual (SL-40 R19), sea cual sea la forma del costo base.
- **R15** — CUANDO cambia el costo por orden que corresponde a una empresa, el sistema DEBE conservar el
  importe de los cargos de las órdenes ya creadas y aplicar el costo nuevo a las órdenes que se creen
  después. Pasa en estos casos:
  - una edición inmediata del plan;
  - un cambio programado que se aplica;
  - un cambio del plan asignado a la empresa;
  - un cambio del valor global o de la excepción.
- **R16** — CUANDO se anula una orden con cargo de fuente `plan`, el sistema DEBE registrar el reverso por el
  mismo importe y con la misma fuente. CUANDO se recupera, DEBE volver a cargarla por ese mismo importe,
  aunque el costo del plan haya cambiado entretanto (SL-40 D6, D7, R15–R17).
- **R17** — La deuda con la plataforma que la empresa ve en su wallet DEBE incluir los cargos y reversos de
  fuente `plan`, igual que los de las demás fuentes (SL-40 R21). NO DEBE cambiar ninguna cifra de la caja
  (SL-40 R22).

### Total estimado del ciclo

- **R18** — MIENTRAS la empresa tenga plan, «Mi plan» DEBE mostrar:
  - el costo base;
  - el costo por orden vigente de la empresa (R12);
  - las órdenes del ciclo;
  - el total estimado del ciclo.

  El detalle de empresa del superadmin DEBE mostrar los mismos datos de esa empresa.

  El costo por orden que se muestra es el que de verdad se cobra (P1, cerrada). Si sale de la excepción de
  la empresa, «Mi plan» lo acompaña con la nota «precio acordado para tu empresa». Así el total cuadra con
  la deuda de la wallet.
- **R19** — El total estimado del ciclo DEBE ser `costo base mensual + órdenes del ciclo × costo por orden
  vigente`. Se calcula en decimal exacto, con dos decimales y sin coma flotante, y nunca aplica el
  descuento anual.
- **R20** *(enmienda del 2026-10-31; escrito sobre la propuesta de P4, sin cerrar)* — Desde R28, toda
  asignación nueva lleva un plan con costo base mensual y costo por orden concretos, así que «Mi plan»
  muestra siempre `base + órdenes × costo = total`. Hay un caso que R28 no cubre: un plan sin costo base
  concreto que ya estaba asignado antes de esta ficha, o que se editó después de asignarse (R30). SI se da
  ese caso, ENTONCES «Mi plan» y el detalle de empresa NO DEBEN inventar un total. DEBEN mostrar:
  - «Costo base: por definir»;
  - el subtotal de las órdenes (`órdenes del ciclo × costo por orden vigente`);
  - la nota de que el total queda pendiente hasta que se concrete el costo base.

  El detalle de empresa del superadmin DEBE marcar además el aviso «Plan sin costo base concreto».
- **R21** — El costo base y el total estimado son solo informativos. Mostrar «Mi plan» o el detalle NO DEBE
  escribir nada en `cobro_plataforma_movimiento` ni en `wallet_movimiento`. La deuda de la wallet solo
  sube por los cargos de R12.
- **R22** — La empresa DEBE leer su costeo solo por la lectura acotada a su contexto (`plan_de_la_empresa`).
  Pedir el de otra empresa DEBE fallar con `42501`. El valor global, las tablas `plan*` y
  `cobro_plataforma_tarifa` DEBEN seguir sin acceso para `servi_app` (`42501`).

### Pantallas del superadmin

- **R23** — El formulario del plan DEBE ofrecer el campo «Costo por orden». Vacío significa que aplica el
  valor global. El campo:
  - muestra junto a él el error de `validation_error`, como el resto de campos (SLT-58 R18);
  - conserva lo escrito ante un error.
- **R24** — El catálogo, el detalle del plan y el modal de asignación (primera asignación y cambio de plan)
  DEBEN mostrar el costo base y el costo por orden del plan. Si el plan no tiene costo por orden, DEBEN
  mostrar el texto de «se aplica el valor global». El modal solo ofrece planes asignables (R29).

### Asignar solo planes con costo concreto (enmienda del 2026-10-31, P2)

> *Plan con costo concreto*: su costo base tiene la forma «monto» (mensual, con o sin anual) y tiene costo
> por orden. Un plan «sin precio», «negociable» o sin costo por orden no lo tiene.

- **R28** — SI el superadmin asigna a una empresa, o cambia por, un plan sin costo concreto, ENTONCES
  `asignar` y la vista previa de la primera asignación DEBEN responder `plan_sin_costo` sin escribir nada.
  El texto es «Ese plan no tiene costo base y costo por orden concretos: crea un custom con sus precios
  para asignarlo.». Hay una excepción: SI la empresa ya tiene ese mismo plan, ENTONCES la respuesta sigue
  siendo `ok` sin cambio (SL-24 R13).
- **R29** — La lista de planes asignables de una empresa NO DEBE incluir planes sin costo concreto. La usan
  el modal de asignación y la acción de R33.
- **R30** — Hay cosas que R28 NO DEBE cambiar:
  - editar, programar o archivar un plan, aunque lo deje sin costo concreto;
  - las asignaciones que ya existen;
  - el acceso de una empresa sin plan, que sigue entrando y operando como hoy (SL-24 R14).

  La migración no toca ninguna asignación.

### Empresas: cobro vigente y asignación descubrible (enmienda del 2026-10-31, P3 y pedido del humano)

- **R31** — La columna «Cobro por orden» del listado de «Empresas» DEBE mostrar, por empresa, el importe que
  se cobraría hoy por una orden nueva (R12) y su fuente:
  - «propio» si sale de la excepción;
  - «del plan» si sale del plan;
  - «global» si sale del valor global o no hay ninguno.

  Fijar y quitar la excepción no cambian (SL-40 R5, R11).
- **R32** — El listado de «Empresas» DEBE tener una columna «Plan», con el nombre del plan asignado o «Sin
  plan», y en cada fila la acción «Asignar plan» (sin plan) o «Cambiar plan» (con plan).
  - CUANDO el superadmin pulsa esa acción, el sistema DEBE llevarlo al bloque «Plan» del detalle de la
    empresa, donde vive el flujo de asignación de SLT-58 con su modal.
  - El enlace «Módulos» de cada fila DEBE pasar a «Plan y módulos». Su nombre accesible es «Plan y módulos
    de {empresa}».
- **R33** *(propuesta del `spec_author`, que el humano pidió como opcional)* — MIENTRAS un plan no esté
  archivado y tenga costo concreto, su detalle DEBE ofrecer «Asignar a una empresa». Al elegir la empresa,
  el sistema DEBE llevar al bloque «Plan» del detalle de esa empresa con el plan ya elegido. Las empresas
  que se ofrecen son:
  - para un plan público, las que no lo tienen ya;
  - para un custom, solo su empresa, si aún no lo tiene.

  Confirmar sigue siendo el flujo de SLT-58: modal, fecha en la primera asignación y avisos.

### Migración, no regresión y E2E

- **R25** — Cada migración nueva DEBE traer su `down.sql`. Tras aplicar los `down.sql`, una orden nueva DEBE
  cargarse con la regla de SL-40, sin el escalón del plan. La bajada que quitaría la fuente `plan` DEBE
  negarse con un error claro si ya existen cargos o reversos de esa fuente.
- **R26** — CUANDO corre el E2E de esta ficha, DEBE recorrer estos pasos y pasar en verde:
  1. el superadmin pone por pantalla un costo por orden de 100 en el plan de una empresa;
  2. el superadmin asigna ese plan desde la acción «Asignar plan» del listado de «Empresas» (R32);
  3. el listado muestra el plan, y en «Cobro por orden», 100 «del plan» (R31);
  4. la empresa crea una orden;
  5. la wallet de la empresa muestra la deuda con ese cargo de 100;
  6. «Mi plan» muestra el total estimado del ciclo con esa orden.
- **R27** — Las suites de SL-24, SL-40 y SLT-58 DEBEN seguir en verde. Solo cambian los casos enumerados en
  `design.md > §9.3`, y cada uno cambia solo por una de estas causas:
  - R1–R5;
  - el texto «costo base» de R9;
  - R28 (los planes que se asignan por servicio o por pantalla pasan a tener costo concreto);
  - R32 (el rótulo «Plan y módulos»).

  No entra ninguna dependencia nueva.

## Preguntas abiertas

- **P4 (abierta el 2026-10-31 por `spec_author`) — ¿Qué se hace con las empresas que ya tienen asignado un
  plan negociable o sin precio, o con un plan que se edite después hasta quedar así?** El código no lo
  resuelve: R28 solo frena las asignaciones nuevas, y la decisión del humano solo cubre esa regla.
  Desde `spec_author` no se puede saber cuántas hay en QA o en producción; T0 las cuenta.

  **Propuesta, sobre la que está escrito R20:**
  - no migrar ni desasignar nada;
  - «Mi plan» muestra «Costo base: por definir», el subtotal de las órdenes y la nota de total pendiente;
  - el superadmin ve el aviso «Plan sin costo base concreto» en el detalle de la empresa, y lo resuelve
    asignándole un custom con precios.

  Si el humano prefiere frenar también la edición que deja sin costo concreto a un plan asignado, sería un
  requisito nuevo sobre `editar`. No se ha escrito.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-30 | ¿Tope por rol o tope total de usuarios? | Por rol. El maestro no tiene tope ni cuenta en ninguno (se crea por base de datos): el formulario no deja fijarlo, «Mi plan» no lo muestra y la base no lo cuenta. Admin y los demás roles siguen con tope. Si un plan ya tiene tope de maestro, la migración lo borra. |
| 2026-10-30 | ¿Y el tope de API keys? | Sigue igual (SL-24). |
| 2026-10-30 | ¿Cómo se costea el plan? | El precio mensual pasa a ser el costo base (ej. 50.000/mes). Se añade un costo por orden ingresada (ej. 100). |
| 2026-10-30 | ¿El plan anual y su descuento? | Se mantienen. El descuento solo rebaja el costo base, nunca el costo por orden. |
| 2026-10-30 | ¿Cómo encaja con SL-40? | El costo por orden del plan reemplaza al valor global de SL-40. Prioridad: excepción por empresa > plan > global. Plan sin costo por orden: aplica el global; sin ninguno, 0,00 (SL-40 D11). |
| 2026-10-30 | ¿Qué órdenes se cobran? | Heredado de SL-40 D3/D6/D7: las creadas menos las anuladas, con su reverso al anular. |
| 2026-10-31 | ¿El costo base se anota en la wallet? | No. Solo se muestra: en el plan y en «Mi plan» como base + órdenes × costo = total estimado del ciclo. |
| 2026-10-31 | Cambio de plan a mitad de ciclo con otro costo por orden | Las órdenes ya creadas conservan su importe (se fija al crearlas, como en SL-40). Las nuevas usan el costo nuevo. |
| 2026-10-31 | ¿Un plan negociable puede tener costo por orden? | Sí, es opcional. El costo base puede ser «negociable» y el costo por orden se fija igual. Si se deja vacío, aplica el global. |
| 2026-10-31 | ¿E2E? | Sí, uno. El superadmin pone 100 por orden en el plan, la empresa crea una orden, la wallet muestra el cargo de 100 y «Mi plan» muestra el total estimado. |
| 2026-10-31 | ¿Quién edita y dónde se autoriza? | Heredado de SL-24/SLT-58: el superadmin edita en /plataforma/planes y la autorización se valida en el servicio. |
| 2026-10-31 | P1: ¿qué costo por orden muestra «Mi plan» si hay excepción? | El que de verdad se cobra (R12). La excepción va con la nota «precio acordado para tu empresa», y el total cuadra con la wallet. |
| 2026-10-31 | P2: ¿total con base negociable o sin precio? | No se muestra un total parcial. Para operar, la empresa tiene un plan con la negociación ya cerrada: no se puede asignar un plan sin costo base y costo por orden concretos (un «negociable» del catálogo se concreta en un custom con precios). «Mi plan» siempre muestra base + órdenes × costo = total. Una empresa sin plan sigue entrando como hoy. |
| 2026-10-31 | P3: ¿la columna «Cobro por orden» de «Empresas» muestra el escalón del plan? | Sí, entra: muestra el valor que se cobra y su fuente (excepción, plan o global). |
| 2026-10-31 | Asignar un plan no se encuentra desde el listado | El listado de «Empresas» gana la columna «Plan» y la acción «Asignar plan» / «Cambiar plan», que lleva al flujo de SLT-58. El enlace «Módulos» cambia a un rótulo que cubre plan y módulos. Desde el detalle del plan, «Asignar a una empresa» queda como propuesta opcional del `spec_author`. Con test de componente y en el E2E. |
| 2026-10-31 | Choque con SLT-56/SLT-64 en `db/schema.prisma` | Aceptado por el humano al aprobar el spec. |
