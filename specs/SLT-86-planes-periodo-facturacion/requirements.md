# SLT-86 — Planes: período de facturación · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-83 ·
> **Rama** `feature/SLT-86-planes-periodo-facturacion`
>
> **Alcance.** Amplía el «tipo de cobro» de la empresa (PR #72, hoy `mensual` | `anual`) a cuatro
> períodos: quincenal, mensual, bimestral y anual. El período es el ciclo completo de la empresa: costo base
> del período, conteo de órdenes del período, y «Mi plan» con el período en curso y su reinicio. El plan
> guarda su costo base mensual y un descuento opcional por cada período, en porcentaje o en monto fijo.
> Entra el formulario del plan, el catálogo, el detalle, el modal de asignación, «Cambiar tipo de cobro»,
> «Mi plan», el detalle de empresa y la migración de planes y empresas existentes.
>
> **Enmienda del 2026-11-05** (`spec_author`, autorizado por el leader; solo lo que quedaba falso):
> - los períodos son **de calendario**;
> - el primer tramo incompleto cuesta en proporción a sus días;
> - **se retira el tope de órdenes por ciclo** de SL-24 para todos los planes: entra su retirada de la
>   pantalla, de la creación de órdenes y de la migración;
> - el «tope de órdenes por período» del texto original pasa a ser el conteo de órdenes del período, sin tope.
>
> **Lo que NO entra.** El cobro real del costo base en la wallet: sigue informativo (SLT-66 R21). No tiene
> ficha; se crea cuando se pida.
>
> Sembrado por `/afinar-feature` el 2026-11-05 y enmendado el mismo día tras el bloqueo de `spec_author`
> (ya existía el tipo de cobro por empresa). El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo
> aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-05 y rehechos tras las decisiones de calendario, tramo proporcional y
> retirada del tope de órdenes. Amplían o sustituyen:
> - el ajuste planes-custom: D4, D6–D10, D14 y D16;
> - SL-24: R3, R9–R12, R19 y R20, con la retirada del tope de órdenes;
> - SLT-58: R4, R5, R7, R15, R30–R42;
> - SLT-66: R18–R21 y R28.
>
> Parten de `dev` **con SLT-83 integrada** (`tasks.md > T0`). Cada requisito nombra su test; las rutas están
> en `tasks.md > Archivos esperados` y el detalle en `design.md`. Las propuestas del spec las aprobó el humano
> el 2026-11-05 y están en «Decisiones cerradas».
>
> **Glosario.**
> - *Período* (o *tipo de cobro*): `quincenal`, `mensual`, `bimestral` o `anual`. Es de la empresa.
> - *Período de calendario*: el tramo fijo del calendario que corresponde a cada tipo (R4). Siempre empieza
>   a las 00:00 de la hora de Costa Rica, que es la de la plataforma (SLT-58 P8).
> - *Entrada*: el instante desde el que rigen el plan y el tipo vigentes de la empresa. Guarda
>   `plan_ciclo_ancla_at` y siempre es las 00:00 de un día.
> - *Tramo*: el primer período tras una entrada que no cae en el inicio de un período de calendario. Va de la
>   entrada al fin de ese período de calendario.
> - *Período en curso*: el período de calendario que contiene «ahora», recortado por delante a la entrada si
>   la entrada es posterior a su inicio (o sea, un tramo).
> - *Costo base del período*: el que sale del costo base mensual del plan con el factor del período y su
>   descuento (R9, R10). El de un tramo es proporcional (R12).
> - *Fecha de efecto*: un día `AAAA-MM-DD` elegido por el superadmin. El cambio rige desde sus 00:00.
> - *Cambio de empresa pendiente*: un cambio de plan o de tipo de cobro con fecha de efecto futura,
>   guardado y aún sin aplicar.

### Período de la empresa

- **R1** — El tipo de cobro de una empresa DEBE ser uno de `quincenal`, `mensual`, `bimestral` o `anual`. SI
  una asignación, la creación de un custom con empresa o un «Cambiar tipo de cobro» traen otro valor o no lo
  traen, ENTONCES el sistema DEBE responder `validation_error` en `tipoCobro` sin escribir nada, y la base
  DEBE rechazar con `23514` cualquier otro valor escrito por SQL a mano.
  *Test:* `tests/unit/types/planes-schema-periodo.test.ts`, `tests/integration/db/planes-cambio-empresa.test.ts`.
- **R2** — CUANDO el superadmin asigna el **primer** plan a una empresa (modal o formulario del custom), el
  sistema DEBE:
  - guardar el tipo de cobro elegido;
  - poner la entrada en las 00:00 de la fecha de inicio elegida, también cuando es hoy (sustituye a SLT-58
    R32, que anclaba «hoy» en el instante de la asignación);
  - mantener el rango de SLT-58 R30 para esa fecha: de hoy − 1 mes a hoy + 1 mes.

  CUANDO la fecha es futura, la asignación DEBE guardarse como cambio de empresa pendiente (R20). Hasta sus
  00:00 la empresa DEBE seguir exactamente como estaba: sin plan y sin límites (SLT-58 R6), con sus módulos de
  antes. Desde ese instante DEBEN entrar el plan, el tipo, los topes de usuarios y API keys, los módulos del
  plan y el tramo. Ya no hay ciclo corto: se retiran SLT-58 R34 y R40.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts` (primera asignación quincenal con fecha
  pasada, hoy y futura; con fecha futura, antes de la fecha la empresa crea usuarios sin tope y sus módulos no
  cambian).
- **R3** — SI quien asigna, programa o cancela un cambio de empresa, cambia el tipo de cobro, crea, edita o
  programa un plan no es el superadmin, ENTONCES el sistema DEBE responder `forbidden` sin llamar al
  repositorio (SL-24 R5).
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`.

### Períodos de calendario y tramo

- **R4** — Los períodos de calendario DEBEN ser, cada uno desde las 00:00 de la hora de la plataforma de su
  primer día hasta las 00:00 del día siguiente al último:
  - quincenal: del 1 al 15 y del 16 al último día del mes (en febrero de 2027, del 16 al 28);
  - mensual: del 1 al último día del mes;
  - bimestral: ene–feb, mar–abr, may–jun, jul–ago, sep–oct y nov–dic;
  - anual: del 1 de enero al 31 de diciembre.
  *Test:* `tests/unit/planes/ciclo-periodo.test.ts`, `tests/integration/db/plan-ciclo-periodo.test.ts`.
- **R5** — MIENTRAS la entrada de la empresa sea posterior al inicio del período de calendario que contiene
  «ahora», el período en curso DEBE ser el tramo que va de la entrada al fin de ese período de calendario. Si
  no, DEBE ser el período de calendario completo. Ejemplos:
  - quincenal con entrada el 10: tramo del 10 al 15, y luego del 16 a fin de mes;
  - anual con entrada el 5 de noviembre: tramo del 5 de noviembre al 31 de diciembre, y luego años de
    calendario.
  *Test:* `tests/unit/planes/ciclo-periodo.test.ts`, `tests/integration/db/plan-ciclo-periodo.test.ts`.
- **R6** — Para un mismo tipo, una misma entrada y un mismo «ahora», el inicio y el fin del período en curso
  DEBEN ser los mismos en la base y en `lib/planes/ciclo.ts` (SLT-58 R35). Los bordes DEBEN caer a las 00:00
  de la plataforma, en UTC.
  *Test:* `tests/integration/db/plan-ciclo-periodo.test.ts`. Corre una tabla de fechas contra las dos con:
  fines de mes de 28 a 31 días, bisiestos, 31 de diciembre y 1 de enero, y un instante justo antes y otro
  justo después de cada borde.
- **R7** — «Mi plan», el detalle de empresa y su cálculo del total DEBEN contar como órdenes del período las
  órdenes vivas de la empresa creadas desde el inicio del período en curso, con la misma definición en la base
  y en TS. CUANDO empieza un período nuevo, el conteo DEBE volver a 0.
  *Test:* `tests/integration/db/plan-ciclo-periodo.test.ts`, `tests/integration/db/plan-de-la-empresa-periodo.test.ts`.

### Sin tope de órdenes

- **R8** — Ningún plan DEBE tener tope de órdenes por ciclo. En concreto:
  - SI una creación, edición o programación trae `topes.ordenesPorCiclo`, ENTONCES el sistema DEBE responder
    `validation_error` sin escribir;
  - crear órdenes por cualquier vía (pantalla, carga masiva, API key) NO DEBE rechazarse ni comprobarse antes
    por número de órdenes;
  - «Mi plan», el detalle de empresa, la asignación y su vista previa NO DEBEN mostrar tope, porcentaje,
    «cerca del tope» ni «lleno» de órdenes, ni avisos de órdenes;
  - los topes de usuarios por rol y de API keys DEBEN seguir exactamente como en SL-24 y SLT-58 (R36, R37).
  *Test:* `tests/integration/db/plan-sin-tope-ordenes.test.ts` (plan que tenía tope 2: la 3.ª orden por
  pantalla, carga masiva y API key entra; el tope de `adminTienda` sigue dando `SL024`),
  `tests/unit/types/planes-schema-periodo.test.ts`, `tests/components/ConsumoDelPlanPeriodo.test.tsx`.

### Costo base del período y descuentos

- **R9** — El costo base de un período completo DEBE salir del costo base mensual del plan:
  - quincenal = mensual ÷ 2;
  - mensual = mensual;
  - bimestral = mensual × 2;
  - anual = mensual × 12.

  A eso se le aplica el descuento del período (R10). El cálculo DEBE ser en decimal exacto, sin coma flotante,
  con un redondeo final a dos decimales, la mitad hacia arriba. Mensual 100.01 → quincenal 50.01; mensual
  50 000 → bimestral 100 000.00 y anual 600 000.00. Sin costo base («sin precio»), el costo DEBE ser «por
  definir» en todos los períodos.
  *Test:* `tests/unit/planes/cobro-periodo.test.ts`.
- **R10** — Cada plan con costo base DEBE admitir, por cada período, ningún descuento o UNO de estos:
  - porcentaje: texto con hasta dos decimales, `> 0` y `≤ 100`; resta `costo × % / 100`;
  - monto fijo: importe `≥ 0` con hasta dos decimales que cabe en `DECIMAL(12,2)`; resta su importe.

  El resultado NUNCA DEBE ser negativo (queda en 0.00). Ejemplos:
  - bimestral 100 000 con 5 000 fijo → 95 000.00; con 150 000 fijo → 0.00;
  - anual 600 000 con 10 % → 540 000.00.

  SI un descuento trae las dos formas, un porcentaje fuera de rango o un monto inválido, ENTONCES el sistema
  DEBE responder `validation_error` en `precio.descuentos.<periodo>.<campo>` sin escribir, y la base DEBE
  rechazar con `23514` esas formas por SQL a mano.
  *Test:* `tests/unit/types/planes-schema-periodo.test.ts`, `tests/unit/planes/cobro-periodo.test.ts`,
  `tests/integration/db/plan-descuento-periodo.test.ts`.
- **R11** — SI una creación, edición o programación trae descuentos con el costo base «sin precio»,
  ENTONCES el sistema DEBE responder `validation_error` en `precio` sin escribir. CUANDO un plan pasa a «sin
  precio», DEBE quedar sin descuentos.
  *Test:* `tests/unit/types/planes-schema-periodo.test.ts`, `tests/integration/db/plan-descuento-periodo.test.ts`.
- **R12** — El costo base de un tramo DEBE ser `costo del período × días del tramo ÷ días del período de
  calendario`, con días de calendario de la plataforma contados en los dos extremos, en decimal exacto y
  redondeado a dos decimales con la mitad hacia arriba. Ejemplos:
  - mensual 31 000 en un mes de 31 días con entrada el 10 → 22 días → 22 000.00;
  - quincenal 15 500 con entrada el 10 → 6 de 15 días → 6 200.00;
  - anual 600 000 con entrada el 5 de noviembre de 2026 → 57 de 365 días → 93 698.63.

  Un período completo DEBE costar el costo del período.
  *Test:* `tests/unit/planes/cobro-periodo.test.ts`.
- **R13** — Ningún descuento ni el tipo de cobro DEBEN cambiar el costo por orden ni el cargo de una orden
  (SLT-66, y el modo porcentual de SLT-83).
  *Test:* `tests/integration/db/plan-descuento-periodo.test.ts`.
- **R14** — Asignar, programar o aplicar un cambio de empresa o de plan, migrar y leer «Mi plan» NO DEBEN
  escribir en `wallet_movimiento` ni en `cobro_plataforma_movimiento` (SLT-66 R21).
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/plan-descuento-periodo.test.ts`.
- **R15** — El costo base de un período o de un tramo DEBE calcularse con el precio del plan vigente en el
  instante en que ese período o tramo **empieza**. Editar el costo base mensual o un descuento con fecha de
  efecto F NO DEBE cambiar la entrada, el tipo ni el período de ninguna empresa. El precio nuevo DEBE regir
  desde el primer período o tramo de cada empresa que empiece en o después de las 00:00 de F.
  *Test:* `tests/integration/db/plan-precio-historial.test.ts`. Caso base: dos empresas, quincenal y anual;
  precio editado con fecha el 5: la quincenal lo ve desde el 16 y la anual desde el 1 de enero. Casos extra:
  fecha de hoy; fecha futura aplicada por el trabajo; cambio programado cancelado; período que empieza
  exactamente a las 00:00 de F.

### Cambios de una empresa con fecha de efecto (cambiar de plan, cambiar tipo de cobro)

- **R16** — CUANDO el superadmin cambia de plan a una empresa que ya tiene plan, también al crear un custom
  para ella, o le cambia el tipo de cobro, la petición DEBE traer una fecha de efecto. SI falta, no es válida o
  cae fuera del rango de hoy a hoy + 12 meses (sin fechas pasadas), ENTONCES el sistema DEBE responder
  `validation_error` en `vigenteDesde` sin escribir nada.
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`, `tests/unit/types/planes-schema-periodo.test.ts`.
- **R17** — MIENTRAS no lleguen las 00:00 de la fecha de efecto, la empresa DEBE seguir exactamente como estaba:
  plan, tipo de cobro, topes, módulos, costo base, entrada y período. DESDE ese instante DEBEN regir el plan y el
  tipo nuevos, con sus topes, sus módulos y su costo base. La entrada DEBE pasar a ese instante, de modo que el
  período en curso sea el tramo hasta el fin del período de calendario del tipo nuevo, con costo proporcional
  (R12).
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`. Caso: mensual → quincenal con plan nuevo y
  fecha el 10. Antes de la fecha rigen plan, módulos y período viejos; al aplicar, tramo del 10 al 15 con 6/15
  del costo quincenal, y luego quincenas de calendario.
- **R18** — CUANDO la fecha de efecto es hoy, el sistema DEBE aplicar el cambio en la misma transacción, y un
  cambio de plan con un tope de usuarios o de API keys ya pasado DEBE rechazarse con `tope_excedido` (SL-24 R12).
  CUANDO la fecha es futura, el sistema DEBE guardar el cambio como pendiente y devolver como avisos, sin
  rechazar, los topes de usuarios y API keys que la empresa ya pasa contra el plan nuevo. Al
  aplicarse, un tope ya pasado no lo impide y rige SLT-58 R36: se aplica, y desde entonces se rechazan las altas
  de ese rol o de API keys.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`.
- **R19** — Una empresa DEBE tener como mucho un cambio pendiente, y una petición nueva DEBE reemplazarlo. SI la
  petición deja el mismo plan y el mismo tipo que rigen hoy, ENTONCES el sistema DEBE cancelar el pendiente si
  lo hay, o responder `ok` sin cambio si no lo hay. Reemplazar un pendiente por otro NO DEBE escribir
  historial. CUANDO se cancela un pendiente, con «Cancelar cambio» o con una petición igual a lo vigente, el
  sistema DEBE escribir en la misma transacción una fila `plan_cambio_empresa_cancelado` en el historial de la
  empresa, con quién canceló, cuándo y cuál era el cambio: plan, tipo y fecha de efecto (decisión del humano
  del 2026-11-05, que sustituye a «sin historial»). Sin pendiente no escribe nada.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`,
  `tests/integration/db/planes-cancelar-cambio-historial.test.ts`.
- **R20** — CUANDO llegan las 00:00 de la fecha de un cambio pendiente, el sistema DEBE aplicarlo una sola vez,
  con un trabajo programado a esa hora, y el barrido horario de SLT-58 DEBE recoger el que se pierda. Al
  aplicarlo, en una transacción y bajo el cerrojo de la empresa, el sistema DEBE:
  - escribir el plan, el tipo y la entrada;
  - sincronizar los módulos;
  - escribir la fila de historial con el actor que lo programó: `plan_asignado` si cambió el plan, o
    `plan_tipo_cobro_cambiado` con el tipo de antes y el nuevo si solo cambió el tipo (D16).

  Un pendiente reemplazado, cancelado o ya aplicado NO DEBE escribir nada.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/unit/planes/jobs-cambio-empresa.test.ts`.
- **R21** — CUANDO se archiva un plan, el sistema DEBE cancelar en la misma transacción los cambios de empresa
  pendientes hacia ese plan, y esas empresas DEBEN seguir como estaban. Una primera asignación pendiente hacia ese plan
  DEBE cancelarse igual, y la empresa sigue sin plan. Cada pendiente cancelado DEBE dejar la fila de R19, con
  quien archivó como actor (decisión del 2026-11-05).
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`,
  `tests/integration/db/planes-cancelar-cambio-historial.test.ts`.

### Cambios del plan con fecha de efecto (costo base mensual o descuentos)

- **R22** — CUANDO el superadmin edita el costo base mensual o algún descuento de un plan, la edición DEBE traer
  una fecha de efecto `≥ hoy` (SLT-58 exigía posterior a hoy), y ya no hay edición inmediata de
  esos campos. SI falta o es anterior a hoy, ENTONCES el sistema DEBE responder `validation_error` en
  `vigenteDesde` sin escribir. Según la fecha:
  - futura: la edición DEBE ser el cambio programado de SLT-58 (un pendiente por plan, reemplazable y
    cancelable, con recordatorios y correo);
  - hoy: DEBE aplicarse en la misma transacción.

  En los dos casos el precio rige según R15. Una edición que solo toca nombre, topes de usuarios o API keys o
  módulos DEBE seguir como en SLT-58.
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`, `tests/integration/db/plan-precio-historial.test.ts`.

### Pantallas

- **R23** — El formulario del plan DEBE:
  - pedir el costo base mensual y, por cada uno de los cuatro períodos, un descuento «Ninguno», «Porcentaje» o
    «Monto fijo» con su campo;
  - NO ofrecer el precio anual fijo, el descuento anual de hoy ni el tope de órdenes por ciclo;
  - al editar un plan con empresas, CUANDO cambia el costo base o un descuento, pedir la fecha de efecto, con
    mañana por defecto;
  - enviar solo el dato de la forma elegida;
  - mostrar los `validation_error` junto a su campo y conservar lo escrito.
  *Test:* `tests/components/PlanFormDescuentos.test.tsx`.
- **R24** — El catálogo, el detalle del plan y el modal de asignación DEBEN mostrar el costo base mensual y,
  por cada período con descuento, el período y su descuento, con los textos de `design.md > §7.1`. NO DEBEN
  mostrar tope de órdenes.
  *Test:* `tests/unit/planes/mensajes-periodo.test.ts`, `tests/components/PlanEmpresaPeriodo.test.tsx`.
- **R25** — El modal de cambio de plan, «Cambiar tipo de cobro» y el formulario del custom para una empresa que
  ya tiene plan DEBEN:
  - ofrecer los cuatro tipos;
  - pedir la fecha de efecto, por defecto el día de inicio del siguiente período de calendario de la empresa
    con su tipo vigente, que el superadmin puede cambiar dentro del rango de R16;
  - mostrar el costo base del primer período o tramo que abrirá el cambio, con el descuento del período y la
    proporción del tramo (R10, R12).

  El modal de primera asignación DEBE ofrecer los cuatro tipos y la fecha de inicio de R2, y mostrar ese mismo
  costo base.
  *Test:* `tests/components/PlanEmpresaPeriodo.test.tsx`, `tests/components/PlanFormDescuentos.test.tsx`.
- **R26** — MIENTRAS una empresa tenga un cambio pendiente, el detalle de empresa y «Mi plan» DEBEN mostrar
  «Desde el {fecha}: {plan} · {tipo}», y el detalle de empresa DEBE ofrecer «Cancelar cambio» (R19).
  MIENTRAS una empresa **sin plan** tenga una primera asignación pendiente (P4 = a), «Mi plan» y el detalle de
  empresa del superadmin DEBEN mostrar «Sin límites» y debajo «{Plan} empieza a regir el {fecha}» (decisión
  del 2026-11-05); el detalle de empresa DEBE ofrecer también «Cancelar cambio». El historial de asignaciones
  del detalle de empresa DEBE mostrar la fila de cancelación de R19 con el texto de `design.md > §7.1`
  (decisión del 2026-11-05).
  *Test:* `tests/components/PlanEmpresaPeriodo.test.tsx`, `tests/components/ConsumoDelPlanPeriodo.test.tsx`,
  `tests/integration/db/plan-ciclo-periodo.test.ts` (la lectura acotada devuelve el pendiente sin plan y sin
  el actor), `tests/unit/planes/mensajes-periodo.test.ts` (el texto de la fila de cancelación).
- **R27** — «Mi plan» y el detalle de empresa DEBEN mostrar:
  - el tipo vigente;
  - el período en curso (desde–hasta, marcado como tramo si lo es);
  - su costo base (R12, R15);
  - las órdenes del período (R7), sin tope;
  - «Se reinicia en N días ({fecha})» con su fin;
  - el siguiente cobro: el inicio del siguiente período de calendario o, si hay un pendiente, su fecha de
    efecto.

  Con tipo `anual` DEBEN mostrar el pago del inicio del período en curso y el siguiente, el 1 de enero.
  *Test:* `tests/unit/planes/cobro-periodo.test.ts`, `tests/components/ConsumoDelPlanPeriodo.test.tsx`,
  `tests/integration/db/plan-de-la-empresa-periodo.test.ts`.
- **R28** — El total estimado del período (SLT-66 R19) DEBE ser el costo base del período en curso (o de su
  tramo) más una de estas dos cosas:
  - en modo fijo, las órdenes del período por el costo por orden;
  - en modo porcentual, lo cobrado en el período (SLT-83 R23–R24, contado por la fecha del cargo dentro del
    período en curso de calendario).

  El aviso de que el anual no aplica al costo DEBE desaparecer. Sin costo base, «Costo base: por definir» y
  ningún total (SLT-66 R20).
  *Test:* `tests/unit/planes/costeo-periodo.test.ts`, `tests/integration/db/plan-de-la-empresa-periodo.test.ts`.
- **R29** — La lista de «Empresas» DEBE mostrar junto al plan el tipo de cobro vigente, con las cuatro
  etiquetas.
  *Test:* `tests/components/EmpresasModulePeriodo.test.tsx`.
- **R30** — El historial de asignaciones y el rastro del plan DEBEN mostrar tal cual las filas que ya existen:
  - `plan_asignado` con `mensual` o `anual`, y `plan_tipo_cobro_cambiado`;
  - en el rastro, los cambios de `precio_anual`, `descuento_anual_pct` y del tope de órdenes.

  Las filas nuevas DEBEN mostrar su tipo (también `quincenal` y `bimestral`) y su fecha de efecto.
  *Test:* `tests/unit/planes/rastro-periodo.test.ts`, `tests/unit/planes/cobro-periodo.test.ts`.

### Versión del plan, rastro y lectura acotada

- **R31** — CUANDO el superadmin crea un plan o guarda o programa una edición, el sistema DEBE guardar los
  descuentos con la versión del plan. Cada cambio real DEBE dejar su antes y su después en `plan_rastro` y
  salir en las líneas de «qué cambia» del detalle, de «Mi plan» y del correo de SL-24 R41. Una edición sin
  cambios NO DEBE escribir.
  *Test:* `tests/unit/planes/rastro-periodo.test.ts`, `tests/integration/db/plan-descuento-periodo.test.ts`.
- **R32** — La empresa DEBE leer su tipo, su período en curso, su cambio pendiente y el precio de su período solo
  por su lectura acotada (`plan_de_la_empresa`, SLT-66 R22). Esa lectura NO DEBE incluir el actor del pendiente.
  Pedir la de otra empresa DEBE fallar con `42501`, y el rol `servi_app` NO DEBE poder leer ni escribir las
  tablas nuevas del plan por SQL a mano.
  *Test:* `tests/integration/db/plan-de-la-empresa-periodo.test.ts`, `tests/integration/db/plan-descuento-periodo.test.ts`.

### Migración y no regresión

- **R33** — La migración DEBE traer su `down.sql`. Al aplicarse, para los precios:
  - SI algún plan o versión pendiente tiene un precio anual fijo mayor que mensual × 12, ENTONCES DEBE negarse
    sin cambiar nada, con un error que liste esos planes;
  - un plan con porcentaje de descuento anual DEBE quedar con ese porcentaje como descuento del período anual;
  - un plan con precio anual fijo DEBE quedar con descuento fijo anual = mensual × 12 − anual;
  - un plan sin anual DEBE quedar sin descuentos;
  - las versiones pendientes DEBEN convertirse igual.

  Para todo plan, el costo base anual de antes (D7) y el de después (R9, R10) DEBEN ser iguales.
  *Test:* `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.
- **R34** — Al aplicarse, la migración DEBE borrar el tope de órdenes de todos los planes y de las versiones
  pendientes. Por cada plan que lo tenía, DEBE dejar una fila `editado` en `plan_rastro` con el tope de antes y
  `null` después, firmada por el actor «Sistema (migración SLT-86)». El trigger que rechazaba
  órdenes por tope DEBE desaparecer.
  *Test:* `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`, `tests/integration/db/plan-sin-tope-ordenes.test.ts`.
- **R35** — Al aplicarse, toda empresa con plan DEBE conservar plan y tipo, y quedar con la entrada en las 00:00
  de la plataforma del día en que corre la migración, sin ciclo corto. Su período en curso DEBE ser el tramo
  hasta el fin de su período de calendario, con costo proporcional (R12). Las órdenes de ese día creadas antes de
  la migración DEBEN contar en él. Ejemplo: anual migrada el 5 de noviembre → tramo del 5 de noviembre al 31 de
  diciembre.
  *Test:* `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.
- **R36** — Tras aplicar el `down.sql`, los planes DEBEN volver a su precio anual o descuento anual. La bajada
  DEBE negarse con un error claro SI hay una empresa con tipo `quincenal` o `bimestral` o con un cambio pendiente,
  o un plan con un descuento que la forma de antes no puede representar. Estas pérdidas DEBEN quedar declaradas
  en su cabecera:
  - los topes de órdenes borrados no vuelven; el plan queda sin tope, que es «sin límite»;
  - las entradas de las empresas no vuelven a su ancla de antes.
  *Test:* `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.
- **R37** — Las suites de SL-24, SLT-58, SLT-66, SLT-83 y del ajuste planes-custom y los E2E de planes DEBEN
  seguir en verde, salvo los casos que `design.md > §9` lista como «se retiran o adaptan», cada uno con su
  motivo. No entra ninguna dependencia nueva.
  *Test:* `./init.sh` y el gate de CI (`gate-completo`).

## Mapa decisiones → requisitos

| Decisión cerrada | R |
|---|---|
| ¿Dónde vive el período? | R1, R2, R25, R29 |
| ¿Qué mueve el período? (el tope, sustituido por «Sin tope de órdenes») | R5, R7, R27, R28 |
| Costo base de cada período | R9 |
| Quincenal; bimestral y anual (sustituidas por «Períodos de calendario») | R4 |
| ¿Qué es el anual? | R4, R27 |
| Descuento | R10, R11, R13, R23, R24, R31 |
| ¿El costo base se cobra? | R14 |
| Cambio de período / P1 / fecha de efecto con tramo | R16–R22, R25, R26 |
| Migración de precios; P3 | R33, R36 |
| Migración de empresas (sustituye P2) | R35 |
| Historial | R30 |
| Ciclo corto (absorbido por el tramo); P4 (a) | R2, R5, R21 |
| Quién configura | R3 |
| Cálculo | R6, R9, R12 |
| ¿Librería nueva? | R37 |
| Editar el precio no reancla | R15, R22 |
| Períodos de calendario | R4, R5, R6 |
| Primer tramo proporcional | R5, R12, R17, R35 |
| Sin tope de órdenes | R7, R8, R23, R24, R34 |
| SLT-83 R24 por período de calendario | R28 |
| Propuestas del spec aprobadas: rango de fechas | R16, R22 |
| Propuestas del spec aprobadas: mañana por defecto al editar precio | R23 |
| Propuestas del spec aprobadas: topes al cambiar de plan | R18 |
| Propuestas del spec aprobadas: «Cancelar cambio» y cambio idéntico | R19, R26 |
| Propuestas del spec aprobadas: archivar cancela pendientes | R21 |
| Propuestas del spec aprobadas: primera asignación «hoy» a las 00:00 | R2 |
| Propuestas del spec aprobadas: costo base en el modal | R25 |
| Propuestas del spec aprobadas: actor de la migración | R34 |
| Propuestas del spec aprobadas: textos de `design.md > §7.1` | R24, R27 |
| R26 para una empresa sin plan con primera asignación pendiente | R26, R32 |
| Textos del rastro del plan (tras T9) | R24, R31 |
| Textos de SLT-83 en el período (tras T9) | R28 |
| Asignar el mismo plan con otro tipo (tras T9) | R19, R20 |
| ¿Cancelar un cambio pendiente deja historial? (tras T9) | R19, R21, R26 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Dónde vive el período? | **En la empresa**: se amplía `organizacion.plan_tipo_cobro` (PR #72, `progress/features/ajuste-planes-custom-asigna-y-cobro.md` D6–D10, D14, D16) de `mensual` \| `anual` a `quincenal` \| `mensual` \| `bimestral` \| `anual`. Se elige al asignar (modal y formulario del custom) y se cambia con «Cambiar tipo de cobro», como hoy. Un mismo plan sirve a empresas con distinto período. |
| 2026-11-05 | ¿Qué mueve el período? | Todo el ciclo de la empresa: costo base del período, tope de órdenes por período, «Mi plan» y detalle de empresa con el período en curso, su reinicio y el siguiente cobro. Reemplaza la regla de SL-24 (ciclo de órdenes siempre mensual). |
| 2026-11-05 | Costo base de cada período | El plan guarda el costo base **mensual**. El del período sale de él: quincenal = mensual ÷ 2; mensual = mensual; bimestral = mensual × 2; anual = mensual × 12. Después se aplica el descuento del período. |
| 2026-11-05 | ¿Cómo se cuenta el quincenal? | Cada 15 días exactos desde el ancla: asignado el 5, del 5 al 19, del 20 al 4, y así. Se corre respecto del mes. |
| 2026-11-05 | ¿Bimestral y anual? | 2 y 12 meses anclados en el día del ancla, con la regla de SL-24 R20 para días que no existen (ancla 31 → 28/feb). |
| 2026-11-05 | ¿Qué es el anual? | Un período de 12 meses: se muestra como un pago al inicio y otro al año. |
| 2026-11-05 | Descuento | Opcional y **definido en el plan, uno por período** (ej. «Pro»: 10 % en anual, 5.000 en bimestral, nada en quincenal). Cada período elige UNO: porcentaje (> 0 y ≤ 100) o monto fijo (≥ 0). Toda empresa con ese período lo recibe. El costo base con descuento nunca es negativo. Nunca toca el costo por orden (hereda SLT-66). Reemplaza el precio anual fijo y el descuento anual de hoy. |
| 2026-11-05 | ¿El costo base se cobra? | No. Sigue informativo, sin cargo en la wallet (SLT-66 R21). |
| 2026-11-05 | Cambio de período (cambiar tipo de cobro, cambiar de plan o editar el descuento) | El ciclo en curso termina como estaba; el siguiente ya usa el período nuevo, anclado en esa fecha. Encaja con el cambio programado (`vigente_desde`) de SLT-58. |
| 2026-11-05 | Migración | Sin perder nada. Plan con % de descuento anual → descuento % del período anual. Plan con precio anual fijo → descuento fijo del anual = mensual × 12 − anual (50.000/mes y 540.000/año → 60.000). Las empresas conservan su tipo de cobro, su ancla y su ciclo en curso. |
| 2026-11-05 | Historial | Las filas que ya existen (`plan_asignado` con el tipo, `plan_tipo_cobro_cambiado`) se siguen mostrando tal cual. |
| 2026-11-05 | Ciclo corto | Heredado de SLT-58 R34: con fecha futura, el primer ciclo va de la asignación a esa fecha; desde ahí sigue el período de la empresa. |
| 2026-11-05 | Quién configura | Heredado de SL-24 R5: solo el superadmin, validado en el service. |
| 2026-11-05 | Cálculo | Heredado de SLT-66 R19: decimal exacto, dos decimales, sin coma flotante. Base y TS calculan igual el inicio y el siguiente ciclo (SLT-58 R35). |
| 2026-11-05 | ¿Librería nueva? | No. |
| 2026-11-05 | P1 — ¿Qué «termina como estaba» y cuándo rige un cambio? | **Sustituye a la fila «Cambio de período».** TODO cambio (cambiar de plan, cambiar tipo de cobro, editar costo base mensual o descuento del plan) lleva una **fecha de efecto** elegida por el superadmin, a las 00:00 hora de Costa Rica. Hasta esa fecha sigue TODO como estaba (topes, módulos, costo base, período); desde esa fecha aplica TODO lo nuevo y el período nuevo se ancla en esa fecha. Fecha propuesta por defecto en el formulario: el inicio del siguiente período; el superadmin puede elegir otra (incluida hoy). Reutiliza el cambio programado (`vigente_desde`) de SLT-58 donde encaje; los límites de la fecha los propone el design. Reemplaza el efecto inmediato de topes y módulos. |
| 2026-11-05 | P2 — Empresas que hoy tienen tipo `anual` | **Sustituye, para ellas, a «conservan su ancla y su ciclo en curso».** Empiezan un ciclo anual nuevo desde hoy 00:00 CR (el día en que corre la migración), con uso en 0; el ancla pasa a esa fecha. |
| 2026-11-05 | P3 — Precio anual fijo mayor que mensual × 12 | (a) La migración se niega y lista esos planes. |
| 2026-11-05 | ¿Editar el precio o un descuento de un plan con fecha de efecto reancla a sus empresas? | **No.** Cada empresa sigue con su período; el precio nuevo rige desde el primer período de esa empresa que empiece en o después de la fecha de efecto. La fecha solo marca desde cuándo vale el precio nuevo. (Precisa P1 para las ediciones del plan.) |
| 2026-11-05 | P2 — ¿Cuentan las órdenes del día de la migración? | Sí. El ciclo anual nuevo empieza a las 00:00 CR del día de la migración y las órdenes de ese día creadas antes de la migración cuentan. |
| 2026-11-05 | Períodos de calendario | **Sustituye a «¿Cómo se cuenta el quincenal?», «¿Bimestral y anual?» y, en lo que dice de 12 meses, a «¿Qué es el anual?».** Los períodos son de calendario, ya no anclados al día de asignación: quincenal del 1 al 15 y del 16 a fin de mes; mensual del 1 a fin de mes; bimestral por bimestres calendario (ene–feb, mar–abr, may–jun, jul–ago, sep–oct, nov–dic); anual por año calendario (1 ene–31 dic). Todo a las 00:00 Costa Rica. |
| 2026-11-05 | Primer tramo incompleto | Si se entra a mitad de período (o la fecha de efecto cae a mitad), el primer tramo va desde la entrada hasta el fin de su período de calendario, y su costo base es proporcional a los días: costo del período × días del tramo ÷ días del período, decimal exacto, 2 decimales, mitad hacia arriba. Ej.: mensual 31.000 en mes de 31 días, entra el 10 → 22 días → 22.000. Quincenal, entra el 10 → tramo 10–15. |
| 2026-11-05 | Sin tope de órdenes | **Sustituye, en lo del tope, a «¿Qué mueve el período?».** Se retira el tope de órdenes por ciclo de SL-24 para todos los planes: campo del formulario, bloqueo al crear órdenes, aviso 80 %/lleno y su conteo como tope. «Mi plan» solo muestra cuántas órdenes lleva en el período. Los topes de usuarios y API keys siguen. La migración borra los topes de órdenes guardados y deja constancia en `plan_rastro`. |
| 2026-11-05 | Migración de empresas con plan | **Sustituye a P2 (las dos filas) y, en lo de las empresas, a «Migración».** El día de la migración (00:00 CR) toda empresa con plan empieza un tramo hasta el fin de su período de calendario, con costo proporcional; desde ahí, períodos de calendario. Ej.: anual migrada el 5 nov → tramo 5 nov–31 dic. |
| 2026-11-05 | Fecha de efecto con períodos de calendario | **Sustituye, en P1, a «el período nuevo se ancla en esa fecha».** Desde la fecha de efecto (00:00 CR) rige todo lo nuevo, con un tramo proporcional hasta el fin del período de calendario. La fecha por defecto sigue siendo el inicio del siguiente período, ahora de calendario. |
| 2026-11-05 | Ciclo corto | **Sustituye a la fila «Ciclo corto».** El ciclo corto de SLT-58 (fecha futura en la primera asignación) queda absorbido por el tramo; `spec_author` revisa si sobra (ver P4). |
| 2026-11-05 | SLT-83 R24 | «Lo cobrado en el ciclo» de SLT-83 pasa a ser por período de calendario (el período en curso, con su tramo). |
| 2026-11-05 | P4 — Primera asignación con fecha futura | **(a). Cierra la fila «Ciclo corto» anterior.** Nada rige hasta la fecha: la empresa sigue como estaba. Desde sus 00:00 CR entran plan, tipo, topes de usuarios, módulos y tramo. Se retira el ciclo corto de SLT-58 (columna y lógica). |
| 2026-11-05 | Rango de la fecha de efecto | Cambio de empresa: de hoy a hoy + 12 meses, sin fechas pasadas. Edición de precio o descuento del plan: hoy o posterior, con mañana por defecto en el formulario. |
| 2026-11-05 | Topes de usuarios y API keys al cambiar de plan | Con fecha de hoy, un tope ya pasado rechaza el cambio (`tope_excedido`). Con fecha futura, el cambio se guarda con aviso y al aplicarse rige SLT-58 R36. |
| 2026-11-05 | Cancelar un cambio pendiente | Botón «Cancelar cambio» en el detalle de empresa. Pedir un cambio idéntico a lo vigente (mismo plan y tipo) también cancela el pendiente, sin historial. |
| 2026-11-05 | Archivar un plan con cambios pendientes hacia él | Se cancelan esos pendientes en la misma transacción; las empresas siguen como estaban. |
| 2026-11-05 | Primera asignación «hoy» | Entra a las 00:00 CR de hoy, no en el instante de la asignación (sustituye a SLT-58 R32). |
| 2026-11-05 | Costo en el modal de asignación | El modal muestra el costo base del período con su descuento y, si es tramo, proporcional. |
| 2026-11-05 | Actor del rastro de la migración | «Sistema (migración SLT-86)». |
| 2026-11-05 | Textos de pantalla | Los de `design.md > §7.1`, aprobados con el spec. |
| 2026-11-05 | ¿R26 aplica a una empresa SIN plan con una primera asignación pendiente (P4 = a)? | **Sí.** «Mi plan» muestra «Sin límites» y debajo «{Plan} empieza a regir el {fecha}»; el detalle de empresa del superadmin muestra lo mismo. |
| 2026-11-05 | Migración extra del trabajo que aplica un cambio de empresa (tras T9) | Se acepta `20261106140000_plan_aplicar_cambio_empresa_enum` (el valor `plan_aplicar_cambio_empresa` de `job_tipo`), con su `down.sql`. |
| 2026-11-05 | Censo de la guardia `historial-accion-escrituras-cubiertas` (tras T9) | Se acepta el cambio: el productor de `plan_asignado` y `plan_tipo_cobro_cambiado` es `PlanesRepository.aplicarEnTx`. |
| 2026-11-05 | Textos del rastro del plan (tras T9) | Una línea por dato: el costo base mensual y cada descuento van en líneas aparte, y el lado vacío de un descuento dice «sin descuento». Se confirman las claves `descuento_<periodo>`, el texto «Descuento anual: 10.00 %», el separador « · » y las filas viejas como «15000.00 / mes · 150000.00 al año». |
| 2026-11-05 | Textos de SLT-83 en el período (tras T9) | «Cobrado en el ciclo» pasa a «Cobrado en el período» y «Total del ciclo hasta hoy» a «Total del período hasta hoy». |
| 2026-11-05 | Asignar el mismo plan con otro tipo (tras T9) | Confirmado: es un cambio de solo el tipo (`plan_tipo_cobro_cambiado`), sin revisar topes ni resincronizar módulos. |
| 2026-11-05 | ¿Cancelar un cambio pendiente deja historial? (tras T9) | **Sí. Sustituye, en lo del historial, a «Cancelar un cambio pendiente».** Cancelar un pendiente deja en el historial de la empresa una fila nueva «cambio cancelado» (`plan_cambio_empresa_cancelado`) con quién, cuándo y cuál era el cambio (plan, tipo y fecha de efecto), en la misma transacción. Vale para «Cancelar cambio», para la petición igual a lo vigente que cancela el pendiente y para el archivado de un plan que cancela los pendientes hacia él (R19, R21). Reemplazar un pendiente por otro no deja fila. |
