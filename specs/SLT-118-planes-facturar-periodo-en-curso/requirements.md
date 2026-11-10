# SLT-118 — planes-facturar-periodo-en-curso · requirements.md

> **Título actual de la ficha:** «Planes: factura por empresa y período con la cuota y las órdenes»
> (el slug y la rama conservan el nombre original).
>
> **Zona:** backend · **Complejidad:** high · **Ruta:** completa (dinero, esquema y migración) · **depends_on:** — · **Rama:** feature/SLT-118-planes-facturar-periodo-en-curso
>
> **Alcance.** Una factura por empresa y período de cobro: estado de cuenta interno que junta la
> cuota del plan (uso de la plataforma) y los cargos y reversos de las órdenes del período (el
> detalle por orden ya existe en la traza de SLT-85). Un proceso automático la cierra al terminar
> cada período, registra la cuota y la suma a la deuda de la empresa con la plataforma.
>
> **Lo que NO entra.** Las pantallas de facturas del superadmin y del maestro → SLT-119 (después de
> SLT-99). La corrección única del 1–15 tras asignar los primeros planes → SLT-120, que depende de
> esta. Factura electrónica (Hacienda), impuestos y moneda → SL-21. Avisos por correo al cerrar.
> Zona horaria de cada empresa → SLT-90.
>
> Sembrado por `/afinar-feature` el 2026-11-10. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-10. Diseño en `design.md` («§N»); tareas en `tasks.md`.
> Heredan SL-40 «cobro de la plataforma por orden», SL-45 «pago a la plataforma», SLT-85 «Traza de
> facturación de los cobros por orden» y SLT-86 «Planes: período de facturación de calendario por empresa y
> sin tope de órdenes». Las horas son las de la plataforma (−06:00, CR) hasta SLT-90 «Planes: ciclo y cobro
> en la zona de cada empresa». Ajustados el mismo día con las respuestas del humano a P1–P5 (filas nuevas
> de «Decisiones cerradas»). Los marcados **(propuesta)** dependen de una pregunta abierta de abajo.
>
> **Vocabulario.**
> - *Factura*: el estado de cuenta interno de una empresa para un intervalo `[desde, hasta)`. Está **en
>   curso** (sin fin fijado), **por cerrar** (fin fijado, aún sin cifras) o **cerrada** (cifras guardadas).
> - *Plan de la factura*: el plan (o «sin plan») y el tipo de cobro con los que se cobra la factura entera.
>   Es el de la empresa en el `desde` de la factura, salvo R16.
> - *Movimiento*: un cargo o un reverso de `cobro_plataforma_movimiento` (SL-40). Su instante es
>   `ocurrido_at`, el mismo que `cobrado_at` de su traza (SLT-85).
> - *Cuota*: el costo base del plan por el uso de la plataforma en el período: el del período completo de
>   su tipo, con su descuento (SLT-86 R9, R10, R15). Sin prorrateo (decisión P3).
> - *Efecto*: el instante desde el que rige un cambio de plan, de tipo o una primera asignación (las 00:00
>   de su fecha, SLT-86).
> - *Margen de cierre*: 5 minutos después del fin de la factura (design §4.3).

### Facturas y períodos

- **R1** — El sistema DEBE tener, para cada empresa, exactamente una factura en curso, y las facturas de una
  empresa DEBEN cubrir el tiempo sin huecos ni solapes: cada factura nueva empieza en el `hasta` de la
  anterior.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R2** — El fin natural de la factura en curso DEBE ser el fin del período de calendario que contiene su
  `desde` (SLT-86 R4): el del tipo de cobro de su plan si lo tiene, y el del mes de calendario si es «sin
  plan». Ejemplos: quincenal con `desde` el 1 → hasta el 16 a las 00:00; sin plan con `desde` el 1 de
  noviembre → hasta el 1 de diciembre a las 00:00.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R3** — CUANDO pasan el fin de la factura en curso y el margen de cierre, el proceso automático DEBE, en
  su primera corrida posterior, cerrarla y dejar abierta la siguiente desde ese fin, sin que nadie lo pida.
  Ejemplo: quincenal → la corrida de las 00:10 del 16 cierra la del 1 al 15 y abre la del 16.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R4** — MIENTRAS no haya pasado el fin de una factura más el margen de cierre, el proceso NO DEBE
  cerrarla.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (corrida a las 00:04 del 16: no cierra).
- **R5** — CUANDO se cierra una factura, el sistema DEBE guardar en ella: número, `desde`, `hasta`, su plan
  (id y nombre) y su tipo de cobro, o «sin plan»; la Σ de los cargos, la Σ de
  los reversos (en positivo) y el número de movimientos con instante en `[desde, hasta)`; el total de
  órdenes (cargos − reversos); la cuota (R8–R10); el total (total de órdenes + cuota) y el instante del
  cierre.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R6** — Cada cargo y cada reverso DEBE contar en la factura cuyo `[desde, hasta)` contiene su instante, y
  en ninguna otra. Un reverso de un cargo de un período anterior DEBE contar en la factura del período del
  reverso (decisión «Reversos»).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (cargo el 14, reverso el 17: el reverso
  resta en la del 16 al 30 y la del 1 al 15 no cambia).
- **R7** — El detalle por orden de una factura DEBEN ser las filas de la traza de SLT-85 de esa empresa con
  `cobrado_at` en `[desde, hasta)`, sin copiarlas, y la Σ de su `valor_cobrado` DEBE ser igual al total de
  órdenes de la factura.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.

### Cuota

- **R8** — SI la factura tiene plan con costo base, ENTONCES su cuota DEBE ser el costo del período
  **completo** de su tipo con el descuento de ese período (SLT-86 R9, R10) y el precio del plan vigente en el
  `desde` de la factura (SLT-86 R15), en decimal exacto, a dos decimales y con la mitad hacia arriba. NO DEBE
  prorratearse por días (decisiones P3 y P4), aunque la entrada de la empresa sea posterior al inicio del
  período: la regla de tramo proporcional de SLT-86 R12 sigue solo para lo que se muestra, no para la factura.
  Ejemplos: quincenal 15 500 → 15 500.00; quincenal 15 500 con entrada el 10 → 15 500.00; mensual 31 000
  con 10 % de descuento mensual → 27 900.00; un precio editado con efecto el 5 rige desde la primera factura
  cuyo `desde` es el 5 o posterior.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R9** — SI la factura no tiene plan, o su plan no tiene costo base («sin precio»), ENTONCES la factura
  DEBE cerrarse sin cuota y con los cargos de sus órdenes (decisión «Empresa sin plan»).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R10** — Para un mismo precio, descuentos y tipo, la cuota que calcula la base DEBE ser igual al costo
  del período completo de `lib/planes/cobro.ts` (`montoDelPeriodo`), el que muestran «Mi plan» y el detalle
  de empresa para un período sin tramo.
  *Test:* `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` (la tabla de ejemplos de SLT-86
  R9 y R10: los cuatro tipos, sin descuento, en porcentaje, en monto, monto mayor que el costo, 100.01).

### Cierre: una sola vez y sin cambios después

- **R11** — Cada período de una empresa DEBE facturarse una sola vez. Correr el cierre dos veces, a la vez
  desde dos conexiones o tras un fallo a medias NO DEBE crear una segunda factura del mismo intervalo, ni
  cambiar la ya cerrada, ni sumar dos veces su cuota a la deuda.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R12** — SI el cierre falla en una empresa, ENTONCES el proceso DEBE seguir con las demás y fallar al
  final, para que la cola lo reintente; las empresas que cerraron bien NO DEBEN repetirse ni deshacerse.
  *Test:* `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R13** — SI alguien intenta cambiar una factura cerrada, también el dueño de la base, ENTONCES la base
  DEBE rechazarlo con `SL118` sin cambiar nada (decisión «Reversos»: una factura cerrada no cambia).
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`.
- **R14** — Cada factura cerrada DEBE llevar un número correlativo por empresa que empieza en 1, sin huecos
  ni repetidos, en el orden de sus períodos, que se asigna al cerrar; la factura en curso no tiene número
  (decisión P1). El formato visible lo fija SLT-119 «Planes: pantallas de facturas para el superadmin y el
  maestro»; aquí se guarda el entero.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (dos empresas: cada una 1, 2, 3).

### Cambios de plan: sin corte ni prorrateo (decisiones P3 y P4)

- **R15** — CUANDO se aplica un cambio de plan o de tipo de cobro a una empresa que ya tiene plan, el sistema
  NO DEBE cortar la factura en curso ni cambiar su plan, su tipo ni su fin: DEBE cerrarse entera, con la
  cuota completa del plan de antes (R8), y la siguiente DEBE empezar en su fin natural con el plan y el tipo
  que la empresa tenga en ese instante. Vale también si el efecto cae a mitad del período (un pendiente
  guardado antes de esta ficha o uno aplicado por otra vía). Ejemplos, con la factura de noviembre en curso
  desde el 1 y mensual 31 000:
  - cambio a quincenal 15 500 con efecto el 1 de diciembre (inicio del próximo período, como SLT-99 «Planes:
    el administrador de la empresa ve su plan y los públicos y cambia de plan» R10) → noviembre cierra con
    31 000.00 y la del 1 al 15 de diciembre, con 15 500.00;
  - el mismo cambio con efecto el 10 de noviembre → noviembre cierra igual, entera, con 31 000.00, y la
    siguiente empieza el 1 de diciembre con quincenal.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R16** — SI el efecto de un cambio de plan, de tipo o de una primera asignación cae en o antes del `desde`
  de la factura en curso (inicio en el pasado, o un cambio que la cola aplica tarde), ENTONCES la factura en
  curso DEBE pasar entera al plan y tipo nuevos, con la cuota completa de su período (R8), y su fin natural
  DEBE recalcularse con el tipo nuevo (R2). Las facturas por cerrar y cerradas NO DEBEN cambiar nunca, ni
  debe crearse una factura vacía. Ejemplo: empresa sin plan con factura en curso desde el 1 de noviembre y
  primera asignación quincenal 15 500 con inicio el 1, aplicada el 10 → la factura del 1 al 15 cierra con
  15 500.00. Con esto, a SLT-120 «Planes: facturar el período en curso (1–15) tras asignar los primeros
  planes» le queda solo recalcular los cargos de las órdenes.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (inicio el 1 aplicado el 10; cambio
  aplicado después de que la cola cerrara su factura: la cerrada no cambia y la en curso toma el plan nuevo).
- **R17** — MIENTRAS un cambio esté pendiente, y SI se cancela o se reemplaza, el sistema NO DEBE cambiar
  ninguna factura. Un cambio de precio del plan (SL-24) NO DEBE cambiar facturas: rige por R8 desde la primera
  factura cuyo `desde` es igual o posterior a su efecto.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Deuda con la plataforma

- **R18** — CUANDO una factura con cuota se cierra, la deuda de la empresa con la plataforma DEBE subir en
  esa cuota, en la misma transacción del cierre. Una factura en curso o por cerrar NO DEBE sumar a la deuda.
  La deuda DEBE ser la misma en la wallet de la empresa, en el tope del pago (en la app y en la base) y en
  el listado de empresas del superadmin: Σ cargos − Σ reversos + Σ cuotas de facturas cerradas − pagos
  vigentes (decisión P2). La cuota vive solo en la fila de la factura cerrada: no hay otro libro de cuotas.
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`, `tests/unit/utils/deuda-plataforma.test.ts`.
- **R19** — La empresa DEBE poder pagar la cuota desde la wallet como paga hoy los cargos (SL-45). SI un pago
  supera la deuda con la cuota incluida, ENTONCES DEBE rechazarse igual que hoy, en la app y en la base. Los
  pagos ya hechos NO DEBEN cambiar.
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`.
- **R20** — Cerrar una factura o aplicar R16 y R28 NO DEBE escribir en `cobro_plataforma_movimiento`, en
  `cobro_plataforma_traza` ni en `wallet_movimiento`: los cargos de las órdenes ya están en la deuda y no se
  cuentan dos veces.
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`.

### Quién ve y quién escribe

- **R21** — Una empresa DEBE leer solo sus facturas: con otra empresa en el contexto, las de la primera no
  se ven, también con SQL a mano.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts` (dos empresas).
- **R22** — Nadie DEBE editar facturas: la empresa NO DEBE poder insertar, cambiar ni borrar una factura, ni
  ejecutar el cierre ni la toma de un cambio (`42501`), y ningún archivo de `lib/` ni de `app/` DEBE
  escribir la tabla: la guardia `cobro-plataforma-solo-por-trigger` se amplía a ella (decisión P2). Solo las
  funciones del dueño en la base las escriben.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`,
  `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`.
- **R23** — El superadmin DEBE poder leer las facturas de todas las empresas (decisión «Quién ve»).
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`.
- **R24** — MIENTRAS una factura no esté cerrada, el sistema DEBE devolverla, a la empresa dueña y al
  superadmin, como «en curso» con su total parcial: el total de órdenes hasta ese instante y la cuota
  completa de su plan (R8) como prevista, con su fin (previsto o fijado), sin número. SI la empresa del contexto pide la de otra, ENTONCES
  la base DEBE rechazarlo con `42501`.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`.

### Proceso, arranque y vuelta atrás

- **R25** — El cierre DEBE correr solo, cada hora a los 10 minutos, una vez para todas las empresas, como
  trabajo recurrente de núcleo de la cola; su primera corrida la DEBE sembrar el despliegue. NO DEBE enviar
  correos ni avisos al cerrar (decisión «Aviso al cerrar»).
  *Test:* `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R26** — CUANDO se aplica la migración, cada empresa DEBE quedar con una factura en curso desde el inicio
  del período de calendario en curso (el de su tipo si tiene plan; el del mes si no), con el plan y el tipo
  que tiene en ese momento. Una empresa dada de
  alta después DEBE tener su primera factura desde las 00:00 del día de su alta.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R27** — SI hay alguna factura cerrada con cuota, ENTONCES el `down.sql` DEBE negarse sin tocar nada: quitar
  la tabla bajaría la deuda y dejaría los pagos de la cuota como sobrepago. Sin cuotas cerradas, DEBE dejar
  la base como estaba, con el tope del pago de SL-45 igual que antes.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (ida y vuelta).

### Primera asignación con efecto dentro de la factura en curso

- **R28** — SI una primera asignación tiene su efecto después del `desde` de la factura en curso (que es «sin
  plan»), ENTONCES, con P = el inicio del período de calendario del tipo nuevo que contiene el efecto:
  - si P está en o antes del `desde`, la factura en curso DEBE pasar entera al plan nuevo, como en R16;
  - si P es posterior, la factura en curso DEBE fijarse en P sin plan y sin cuota, y la siguiente DEBE
    empezar en P con el plan nuevo y su cuota completa.

  Ejemplos, con la factura sin plan en curso desde el 1 de noviembre: quincenal con inicio el 5 → del 1 al
  15 con la cuota quincenal completa; quincenal con inicio el 18 → del 1 al 15 sin plan y del 16 al 30 con la
  cuota completa; mensual con inicio el 18 → noviembre entera con la cuota mensual completa.
  **(propuesta, P6)**
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Qué es la factura? | R1, R5, R7 |
| ¿Cuándo se cierra y se cobra la cuota? | R2, R3, R4, R24, R25 |
| ¿La cuota suma a la deuda? | R18, R19, R20 |
| Reversos | R6, R13 |
| Empresa sin plan | R2, R9 |
| Quién ve | R21, R22, R23, R24 |
| Aviso al cerrar | R25 |
| Detalle por orden | R7 |
| Período, tramos y zona | R2, R8, R10 (los tramos quedan solo para mostrar: P3 los quita de la factura) |
| Partición | R16 (lo que le queda a SLT-120), R24 (lectura sin pantalla), R26 |
| ¿E2E? | R11, R18, R21 (integración con base) |
| P1 · Numeración | R14 |
| P2 · Cuota en la fila de la factura cerrada; deuda | R5, R13, R18, R19, R20, R22 |
| P3 · Sin prorrateo ni corte; el período en curso entero con el plan viejo | R8, R15, R17 |
| P4 · Inicio en el pasado: cuota completa en la factura en curso | R8, R16, R28 |
| P5 · Tamaño aceptado | — (proceso: línea `tamano-pr-aceptado` de la ficha; sin requisito testeable) |

## Preguntas abiertas

P1–P5 las respondió el humano el 2026-11-10 y pasaron a «Decisiones cerradas». Quedan:

- **P6 (nueva) · Factura más corta que su período de calendario.** Sin prorrateo (P3, P4), una factura con
  plan lleva siempre la cuota completa de su período (R8), aunque cubra menos días: una empresa dada de alta
  el 10 con plan quincenal paga la quincena entera en la factura del 10 al 15; una primera asignación anual
  sobre la factura sin plan de noviembre la deja del 1 de noviembre al 31 de diciembre con la cuota anual
  completa (R16, R28); y la factura sin plan se fija en el inicio del período del tipo nuevo (R28). Propuesta
  del spec: así, por coherencia con «sin prorrateo». Además, «Mi plan» y el detalle de empresa siguen
  mostrando el costo del tramo proporcional de SLT-86 R12 y R27 en esos casos, que ya no es lo que se
  factura: ¿se alinea esa vista en otra ficha (sugerencia: junto con P7) o se acepta la diferencia?
- **P7 (nueva) · El servidor del superadmin aún acepta fechas de efecto a mitad de período.** Hoy
  `PlanesService` (asignar a una empresa con plan, crear custom con empresa con plan, cambiar tipo de cobro)
  acepta cualquier día de hoy a hoy + 12 meses (SLT-86 R16), y «hoy» se aplica en el acto (SLT-86 R18). La
  pantalla ya propone el inicio del próximo período (`fechaDeEfectoPorDefecto`, SLT-86 R25), pero deja
  elegir otro día. La base de esta ficha ya cobra la cuota sin corte pase lo que pase (R15), pero un cambio
  con efecto a mitad de período cambia el **costo por orden** desde ese día, y P3 pide el período en curso
  entero con el plan viejo también en el costo por orden. El ajuste mínimo es validar en el servidor que
  `vigenteDesde` sea el inicio del próximo período del tipo vigente (o forzarlo), con `validation_error` en
  `vigenteDesde` si no; **modifica SLT-86 «Planes: período de facturación de calendario por empresa y sin
  tope de órdenes» R16–R18**: R16 (rango → una sola fecha), R17 (sin tramo en el cambio) y R18 (sin «hoy»). La UI no se rehace: el campo de fecha ya trae ese valor y el error de campo ya se pinta.
  **No cabe en esta ficha:** son unos 12 archivos más (`PlanesService`, `IPlanesRepository` —el tipo vigente
  en `EmpresaDePlanes`—, `lib/planes/mensajes.ts` y unos 9 tests de servicio e integración que hoy usan «hoy»
  u otros días), y la ficha pasaría de 29 a ~41 archivos, por encima de `max_archivos` = 40. Propuesta de
  corte: ficha nueva «Planes: el cambio del superadmin rige al inicio del próximo período de cobro», que se
  mergea sola (no depende de esta ni esta de ella). Dos preguntas para esa ficha: (a) ¿validar y rechazar, o
  llevar la fecha en silencio al inicio del próximo período?; (b) ¿se permite también el inicio de un período
  posterior (hasta 12 meses), o solo el próximo, como SLT-99 R10? Y una de UI, que no se inventa aquí: ¿el
  campo de fecha pasa a solo lectura?
- **P8 (nueva) · Primera asignación con fecha futura.** P3 habla de cambios; una primera asignación puede
  tener inicio de hoy a hoy + 1 mes (SLT-86 R2) en cualquier día. Esta ficha la factura con R28 sin tocar el
  servidor. ¿Debe también la primera asignación futura caer en el inicio de un período (iría en la ficha de
  P7)?

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-10 | ¿Qué es la factura? | Estado de cuenta interno por empresa y período, sin impuestos ni envío a Hacienda (SL-21). |
| 2026-11-10 | ¿Cuándo se cierra y se cobra la cuota? | Automáticamente al terminar el período de cobro de la empresa (p. ej. el 16 a las 00:00 cierra el 1–15). Mientras está abierto, se lee como factura en curso con total parcial. |
| 2026-11-10 | ¿La cuota suma a la deuda? | Sí: al cerrar, la cuota entra a la deuda con la plataforma, que la empresa paga desde la wallet como hoy. |
| 2026-11-10 | Reversos | Cada cargo o reverso va en la factura del período en que ocurrió; una factura cerrada no cambia. |
| 2026-11-10 | Empresa sin plan | Tiene factura mensual con los cargos de sus órdenes y sin cuota. |
| 2026-11-10 | Quién ve | Superadmin todas, maestro las de su empresa; nadie edita. Las pantallas van a SLT-119. |
| 2026-11-10 | Aviso al cerrar | No por ahora. |
| 2026-11-10 | Detalle por orden | Se reutiliza la traza de SLT-85 (plan, tipo de cobro, período, valor cobrado, guía); no se duplica. |
| 2026-11-10 | Período, tramos y zona | Heredados de SLT-86 (período de calendario por tipo de cobro; costo del período por tramos) y hora de la plataforma (CR) hasta SLT-90. |
| 2026-11-10 | Partición | Datos y cierre aquí; pantallas (SLT-119) y corrección del 1–15 (SLT-120) en fichas nuevas. |
| 2026-11-10 | ¿E2E? | Diferido a SLT-119 (aquí no hay UI); aquí, tests de integración con base del cierre y la deuda. |
| 2026-11-10 | P1 · Numeración de la factura | Número correlativo **por empresa** desde 1, asignado al cerrar (humano, pregunta del spec). |
| 2026-11-10 | P2 · Cómo entra la cuota a la deuda | La cuota vive en la fila de la factura cerrada (tabla nueva que solo escriben funciones del dueño). Deuda = cargos − reversos + cuotas de facturas cerradas − pagos, en la base y en la app. La guardia `cobro-plataforma-solo-por-trigger` se amplía a la tabla nueva (humano). |
| 2026-11-10 | P3 · Cambio de plan a mitad de período | **Sin prorrateo ni corte a mitad de período** (distinto de la propuesta del spec). Todo cambio de plan o de tipo de cobro del superadmin rige al **inicio del próximo período de cobro** de la empresa; el período en curso se cobra entero con el plan viejo (cuota y costo por orden). Alineado con SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan» (humano). |
| 2026-11-10 | P4 · Plan asignado con inicio en el pasado | Cuota completa del período desde ese inicio en la factura en curso; las facturas cerradas nunca se tocan. A SLT-120 «Planes: facturar el período en curso (1–15) tras asignar los primeros planes» le queda solo recalcular los cargos de las órdenes (humano). |
| 2026-11-10 | P5 · Tamaño del PR | Aceptado en un solo PR (~29 archivos, ~1 700 líneas); línea `tamano-pr-aceptado` en la ficha (humano). |
