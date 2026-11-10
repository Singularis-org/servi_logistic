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
>
> **Cambio de fondo del humano (2026-11-10, tras aprobar el spec; fila «Periodicidad de órdenes» de
> «Decisiones cerradas»).** El «período» del Alcance pasa a ser el **corte de órdenes**: cada plan define
> la periodicidad de facturación de órdenes (quincenal o mensual), la empresa sin plan factura quincenal,
> hay una factura por corte y la cuota se suma en la factura del corte en que empieza su período de cobro.
> El Alcance no se reescribe; los requisitos de abajo ya lo aplican.
>
> **Segundo cambio de fondo (2026-11-10, fila «Cuota por adelantado»).** La factura se emite al **inicio** de
> cada corte con las órdenes del corte anterior y la cuota del período de cobro que **empieza** en ese corte,
> cobrada por adelantado. El bloqueo por falta de pago es de SLT-121 «Planes: plazo de pago de la factura y
> operación congelada por mora»: aquí solo se emite y se suma a la deuda.

## Requisitos (EARS)

> Escritos por `spec_author` el 2026-11-10. Diseño en `design.md` («§N»); tareas en `tasks.md`.
> Heredan SL-40 «cobro de la plataforma por orden», SL-45 «pago a la plataforma», SLT-85 «Traza de
> facturación de los cobros por orden» y SLT-86 «Planes: período de facturación de calendario por empresa y
> sin tope de órdenes». Las horas son las de la plataforma (−06:00, CR) hasta SLT-90 «Planes: ciclo y cobro
> en la zona de cada empresa». Ajustados el mismo día con P1–P11 y con la periodicidad de órdenes.
>
> **Reescritos el 2026-11-10 por la cuota por adelantado y P12–P16.** Cambian R3, R5, R8, R9, R10, R15, R16,
> R24, R26, R27, R28, R29, R30 (solo un ejemplo del test) y R38; R35–R37 pasan de propuesta a cerrados (P12–P14);
> R39 y R40 son nuevos. Siguen igual R1, R2, R4, R6, R7, R11–R14, R17–R23, R25 y R31–R34. Quedan **en propuesta,
> pendientes de P17 y P18** (`## Preguntas abiertas`): la factura de R28 que junta órdenes sin plan y primera
> cuota (P17) y el corte en el instante de aplicar de R16 (P18). Lo demás no depende de ellas.
>
> **Vocabulario.**
> - *Periodicidad de órdenes*: cada cuánto se factura lo de las órdenes: **quincenal** (cortes el 1 y el 16)
>   o **mensual** (corte el 1). La define el plan (R35); sin plan, quincenal.
> - *Corte*: el inicio de un período de calendario de la periodicidad de órdenes (SLT-86 R4: quincenal 1–15 y
>   16–fin; mensual, el mes).
> - *Período de cobro*: el de la cuota, del tipo de cobro de la empresa (quincenal, mensual, bimestral o
>   anual; SLT-86 R4). Es distinto del corte: un plan anual con órdenes quincenales tiene 24 facturas al año y
>   una sola cuota.
> - *Factura*: el estado de cuenta interno de una empresa para el intervalo de órdenes `[desde, hasta)`. Está
>   **en curso** (sin fin fijado), **por cerrar** (fin fijado, aún sin cifras) o **cerrada** (cifras guardadas).
>   Un solo tipo de factura.
> - *Emisión*: el `hasta` de una factura, normalmente un corte. Ahí se emite: lleva las órdenes de su intervalo
>   y, por adelantado, la cuota del período de cobro que **empieza** en su emisión (R8). Se cierra (se guardan
>   sus cifras) en la primera corrida tras su emisión más el margen de cierre (R3).
> - *Plan de la factura*: el plan (o «sin plan»), su tipo de cobro y su periodicidad de órdenes, con los que se
>   facturan sus **órdenes**. Son los de la empresa en el `desde` de la factura, salvo R16.
> - *Plan de la cuota*: el de la factura siguiente, la que empieza en la emisión: el plan que rige desde ese
>   instante.
> - *Movimiento*: un cargo o un reverso de `cobro_plataforma_movimiento` (SL-40). Su instante es
>   `ocurrido_at`, el mismo que `cobrado_at` de su traza (SLT-85).
> - *Cuota*: el costo base del plan por el uso de la plataforma en **un período de cobro completo**, con su
>   descuento (SLT-86 R9, R10, R15). Sin prorrateo (P3), salvo la primera cuota de un plan (R29, P6).
> - *Primera cuota*: la de una empresa que recibe su primer plan (primera asignación). La lleva la factura que
>   se emite al empezar a regir ese plan (R16, R28, R29). La factura sembrada al desplegar no es una primera
>   asignación (R26).
> - *Efecto*: el instante desde el que rige un cambio de plan, de tipo o una primera asignación (las 00:00
>   de su fecha, SLT-86). En un cambio del superadmin, la fecha ya llevada al inicio de un período (R30).
> - *Tipo vigente*: el tipo de cobro que la empresa tiene en el instante en que se guarda el cambio.
> - *Tipo nuevo*: el tipo de cobro con el que queda la empresa tras el cambio (igual al vigente si solo cambia
>   el plan).
> - *Tipo de referencia*: el más largo entre el vigente y el nuevo, en el orden quincenal < mensual <
>   bimestral < anual (decisión P9). Todo inicio de un período de un tipo más largo es también inicio de un
>   período de cada tipo más corto (1 de enero; 1 de enero, marzo, mayo, julio, septiembre y noviembre; 1 de
>   cada mes; 1 y 16 de cada mes).
> - *Margen de cierre*: 5 minutos después del fin de la factura (design §4.3).

### Facturas y cortes

- **R1** — El sistema DEBE tener, para cada empresa, exactamente una factura en curso, y las facturas de una
  empresa DEBEN cubrir el tiempo sin huecos ni solapes: cada factura nueva empieza en el `hasta` de la
  anterior.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R2** — El fin natural de la factura en curso DEBE ser el fin del período de calendario de su
  **periodicidad de órdenes** que contiene su `desde` (SLT-86 R4): la del plan de la factura si lo tiene, y
  quincenal si es «sin plan». NO DEBE depender del tipo de cobro. Ejemplos: quincenal con `desde` el 1 →
  hasta el 16 a las 00:00; sin plan con `desde` el 16 de noviembre → hasta el 1 de diciembre; plan anual con
  órdenes mensuales y `desde` el 1 de noviembre → hasta el 1 de diciembre (no el 1 de enero).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R3** — *(cambiado: emitir)* CUANDO pasan el fin de la factura en curso y el margen de cierre, el proceso
  automático DEBE, en su primera corrida posterior (salvo R39), emitirla y cerrarla con sus cifras y dejar
  abierta la siguiente desde ese fin, sin que nadie lo pida. Ejemplos: órdenes quincenales → la corrida de las
  00:10 del 16 emite la del 1 al 15 (con la cuota que empieza el 16, si la hay) y abre la del 16; órdenes
  mensuales → la de las 00:10 del 1 de diciembre emite la de noviembre.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R4** — MIENTRAS no haya pasado el fin de una factura más el margen de cierre, el proceso NO DEBE
  cerrarla.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (corrida a las 00:04 del 16: no cierra).
- **R5** — *(cambiado: la cuota con su plan y su tramo)* CUANDO se cierra una factura, el sistema DEBE guardar
  en ella: número, `desde`, `hasta`, su plan (id y nombre), su tipo de cobro y su periodicidad de órdenes, o
  «sin plan» con periodicidad quincenal; la Σ de los cargos, la Σ de los reversos (en positivo) y el número de
  movimientos con instante en `[desde, hasta)`; el total de órdenes (cargos − reversos); la cuota si la lleva
  (R8, R29), con su plan (id, nombre y tipo de cobro), el tramo del período de cobro que cubre
  (`[cuota_desde, cuota_hasta)`), su precio y sus días; el total (total de órdenes + cuota) y el instante del
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

### Cuota por adelantado

- **R8** — *(cambiado: por adelantado)* CUANDO se emite una factura en el instante X (su `hasta`), SI el plan de
  la cuota (el que rige desde X) tiene costo base y X es el **inicio de un período de cobro** de su tipo,
  ENTONCES la factura DEBE llevar la cuota de ese período **completo**, que empieza en X, con el descuento de
  ese período (SLT-86 R9, R10) y el precio del plan vigente en X (SLT-86 R15), en decimal exacto, a dos
  decimales y con la mitad hacia arriba; NO DEBE prorratearse por días (decisiones P3 y P4). SI X no es inicio
  de un período de cobro y la factura no lleva la primera cuota (R16, R28), ENTONCES NO DEBE llevar cuota. Cada
  período de cobro DEBE cobrarse en una sola factura. Ejemplos, con órdenes quincenales:
  - mensual 31 000 con 10 % de descuento mensual → la emitida el 1 de diciembre (órdenes del 16 al 30 de
    noviembre) lleva 27 900.00, la cuota de diciembre; la emitida el 16 de diciembre, ninguna;
  - quincenal 15 500 → cada factura lleva 15 500.00, la de la quincena que empieza en su emisión;
  - anual → solo la emitida el 1 de enero (órdenes del 16 al 31 de diciembre) lleva la cuota del año que
    empieza; las otras 23 del año, ninguna;
  - bimestral → las emitidas el 1 de enero, marzo, mayo, julio, septiembre y noviembre;
  - un precio editado con efecto el 5 rige desde la primera cuota cuyo período empieza el 5 o después;
  - un pendiente guardado antes de esta ficha o por SQL que deja un plan nuevo rigiendo a mitad de su período
    de cobro (quincenal → mensual con efecto el 16 de noviembre) → la emitida el 16 de noviembre no lleva
    cuota, y la primera cuota mensual va en la emitida el 1 de diciembre.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (mensual con órdenes quincenales; anual con
  órdenes mensuales; precio editado), `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (el
  pendiente por SQL a mitad de período).
- **R9** — *(cambiado: la primera cuota)* SI el plan de la cuota no existe («sin plan») o no tiene costo base
  («sin precio»), y la factura no lleva la primera cuota (R28), ENTONCES la factura DEBE emitirse sin cuota y
  con los cargos de sus órdenes (decisión «Empresa sin plan»).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R10** — *(cambiado: la entrada del tramo)* Para un mismo precio, descuentos y tipo, la cuota que calcula la
  base DEBE ser igual a la de `lib/planes/cobro.ts`, la que muestran «Mi plan» y el detalle de empresa: el costo
  del período completo (`montoDelPeriodo`) en R8, y el costo del tramo (`costoDelTramo` con `diasDelTramo` y
  `diasDelPeriodo`, o sea `costoDelPeriodoEnCurso` con la entrada en el inicio del tramo) en R29.
  *Test:* `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` (la tabla de ejemplos de SLT-86
  R9, R10 y R12: los cuatro tipos, sin descuento, en porcentaje, en monto, monto mayor que el costo, 100.01;
  y tramos: quincenal 15 500 desde el 10 → 6 200.00, quincena de 13 y de 16 días, mes de 31 días, febrero
  bisiesto y no, año de 365 y 366, un tramo de 1 día y un redondeo con la mitad exacta).

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
- **R39** — *(nuevo)* MIENTRAS la empresa tenga un cambio de plan o de tipo pendiente, o una primera asignación
  pendiente, con efecto en o antes del fin de una factura por cerrar, el proceso NO DEBE cerrar esa factura:
  DEBE cerrarla en la primera corrida después de que la cola aplique el cambio, con la cuota del plan nuevo.
  Ejemplo: cambio pendiente con efecto el 1 de diciembre que la cola aún no aplicó a las 00:10 → la factura
  del 16 al 30 de noviembre no se cierra; aplicado a las 00:40, la corrida de la 01:10 la cierra con la cuota
  del plan nuevo.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Cambios de plan: sin corte ni prorrateo (decisiones P3 y P4)

- **R15** — *(cambiado: ejemplos)* CUANDO se aplica un cambio de plan o de tipo de cobro a una empresa que ya
  tiene plan, el sistema NO DEBE cortar la factura en curso ni cambiar su plan, su tipo, su periodicidad ni su
  fin: sus órdenes DEBEN facturarse enteras con el plan de antes, y la siguiente DEBE empezar en su fin natural
  con el plan, el tipo y la periodicidad que la empresa tenga en ese instante. Vale también si el efecto cae a
  mitad de la factura (un pendiente guardado antes de esta ficha o uno aplicado por otra vía; desde R30 el
  superadmin ya no puede guardarlo). Ejemplos, con mensual 31 000 y órdenes quincenales:
  - cambio a quincenal 15 500 con efecto el 1 de diciembre (inicio del próximo período, como SLT-99 «Planes:
    el administrador de la empresa ve su plan y los públicos y cambia de plan» R10) → la emitida el 16 de
    noviembre (órdenes del 1 al 15) sin cuota; la emitida el 1 de diciembre (órdenes del 16 al 30 con el plan de
    antes) con 15 500.00, la del 1 al 15 de diciembre con el plan nuevo; la emitida el 16 de diciembre con
    15 500.00. La de noviembre (31 000.00) ya salió en la emitida el 1 de noviembre;
  - el mismo cambio con efecto el 10 de noviembre, guardado como pendiente por SQL → la del 1 al 15 de noviembre
    se emite entera con el plan de antes y lleva 15 500.00 (la quincena del 16, plan nuevo), y la del 16 empieza
    con quincenal. Sin devolución de la mensual de noviembre (R40).
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R16** — *(cambiado: la primera cuota; el corte al aplicar, propuesta P18)* SI el efecto E de un cambio de
  plan, de tipo o de una primera asignación cae en o antes del `desde` D de la factura en curso (inicio en el
  pasado, o un cambio que la cola aplica tarde), ENTONCES la factura en curso DEBE pasar entera al plan, el tipo y
  la periodicidad nuevos para sus órdenes, y su fin natural DEBE recalcularse con la periodicidad nueva (R2). Su
  cuota:
  - en un cambio, la del período que empieza en D, en la factura emitida en D si aún no está cerrada (R8, R39);
  - en una primera asignación, la primera cuota (R29) del tramo que empieza en D, en la factura emitida en D si
    aún no está cerrada; si ya está cerrada o no existe, la factura en curso DEBE fijarse en el instante en que
    se aplica y emitirse con sus órdenes desde D y esa cuota, y la siguiente abrirse desde ese instante con el
    plan nuevo (propuesta P18).

  Las facturas cerradas NO DEBEN cambiar nunca, ni debe crearse una factura vacía. Ejemplos, con quincenal
  15 500: empresa sin plan con factura en curso desde el 1 de noviembre y primera asignación con inicio el 1,
  aplicada en el acto el 10 a las 15:00 (la emitida el 1 ya cerrada) → la del 1 de noviembre a las 00:00 al 10 a
  las 15:00 se emite con sus órdenes y 15 500.00, y la siguiente, del 10 a las 15:00 al 16, con la quincena del
  16; empresa dada de alta el 10 con inicio el 10, aplicada a las 09:00 → la del 10 a las 00:00 a las 09:00 se
  emite con órdenes en 0 y 6 200.00 (R29); primera asignación con inicio el 16 que la cola aplica a las 00:00:30
  del 16 → la emitida el 16 (órdenes sin plan del 1 al 15) aún no está cerrada (R39) y lleva 15 500.00, sin
  corte. Con esto, a SLT-120 «Planes: facturar el período en curso (1–15) tras asignar los primeros planes» le
  queda solo recalcular los cargos de las órdenes.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (inicio el 1 aplicado el 10; alta el 10
  con inicio el 10; inicio el 16 aplicado por la cola; cambio aplicado después de que la cola cerrara su
  factura: la cerrada no cambia y la en curso toma el plan nuevo; plan con órdenes mensuales tomado por una
  factura quincenal: su fin pasa al 1 del mes siguiente).
- **R17** — MIENTRAS un cambio esté pendiente, y SI se cancela o se reemplaza, el sistema NO DEBE cambiar
  ninguna factura. Un cambio de precio del plan (SL-24) NO DEBE cambiar facturas: rige por R8 desde la primera
  cuota cuyo período empieza en su efecto o después.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R40** — *(nuevo)* Un cambio de plan o de tipo de cobro, aplicado en cualquier momento, NO DEBE devolver ni
  cambiar una cuota ya emitida: la factura cerrada sigue igual y la deuda NO DEBE bajar por el cambio
  (decisión «Cuota por adelantado»: sin devoluciones).
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`.

### Deuda con la plataforma

- **R18** — CUANDO una factura con cuota se cierra, la deuda de la empresa con la plataforma DEBE subir en
  esa cuota, en la misma transacción del cierre. Una factura en curso o por cerrar NO DEBE sumar a la deuda.
  La deuda DEBE ser la misma en la wallet de la empresa, en el tope del pago (en la app y en la base) y en
  el listado de empresas del superadmin: Σ cargos − Σ reversos + Σ cuotas de facturas cerradas − pagos
  vigentes (decisión P2). La cuota vive solo en la fila de la factura cerrada: no hay otro libro de cuotas.
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`, `tests/unit/utils/deuda-plataforma.test.ts`.
- **R19** — La empresa DEBE poder pagar la cuota desde la wallet como paga hoy los cargos (SL-45). SI un pago
  supera la deuda con la cuota incluida, ENTONCES DEBE rechazarse igual que hoy, en la app y en la base. Los
  pagos ya hechos NO DEBEN cambiar. El plazo de pago y el bloqueo por mora NO entran aquí (SLT-121 «Planes:
  plazo de pago de la factura y operación congelada por mora»).
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
- **R24** — *(cambiado: la cuota prevista por adelantado)* MIENTRAS una factura no esté cerrada, el sistema DEBE
  devolverla, a la empresa dueña y al superadmin, como «en curso» con su total parcial: el total de órdenes
  hasta ese instante y, si al emitirse llevará cuota, esa cuota como prevista: la primera cuota si la lleva
  (R16, R28), o la del período de cobro que empieza en su fin, con el plan del cambio pendiente de la empresa si
  su efecto es ese fin o antes y, si no, con el plan vigente; con su periodicidad y su fin (previsto o fijado),
  sin número. SI la empresa del contexto pide la de otra, ENTONCES la base DEBE rechazarlo con `42501`.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts` (plan mensual: la del 16 al 30 con la
  cuota de diciembre prevista y la del 1 al 15 sin cuota; un cambio pendiente al 1 de diciembre: la prevista es
  la del plan nuevo).

### Proceso, arranque y vuelta atrás

- **R25** — El cierre DEBE correr solo, cada hora a los 10 minutos, una vez para todas las empresas, como
  trabajo recurrente de núcleo de la cola; su primera corrida la DEBE sembrar el despliegue. NO DEBE enviar
  correos ni avisos al cerrar (decisión «Aviso al cerrar»).
  *Test:* `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R26** — *(cambiado: P15)* CUANDO se aplica la migración, cada empresa DEBE quedar con una factura en curso
  desde el inicio del **corte** en curso de su periodicidad de órdenes (la de su plan; quincenal si no tiene),
  con el plan, el tipo y la periodicidad que tiene en ese momento. El período de cobro en curso de cada empresa
  con plan DEBE contar como pagado: NO DEBE cobrarse, y su primera cuota DEBE ser la del primer período de cobro
  que empiece después, en la factura emitida en ese inicio (R8). La factura sembrada NO DEBE llevar primera
  cuota (no es una primera asignación). Ejemplos, desplegado el 10 de noviembre de 2026 con órdenes quincenales:
  quincenal → la primera cuota en la emitida el 16 de noviembre; mensual → en la emitida el 1 de diciembre;
  bimestral y anual → en la emitida el 1 de enero de 2027; sin plan → ninguna. Hasta entonces sus facturas
  llevan solo órdenes. Una empresa dada de alta después DEBE tener su primera factura desde las 00:00 del día de
  su alta.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R27** — *(cambiado: las columnas de la cuota)* SI hay alguna factura cerrada con cuota, ENTONCES el
  `down.sql` DEBE negarse sin tocar nada: quitar la tabla bajaría la deuda y dejaría los pagos de la cuota como
  sobrepago. Sin cuotas cerradas, DEBE dejar la base como estaba: sin la tabla, sin la periodicidad de órdenes
  en `plan` y con el tope del pago de SL-45 igual que antes.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (ida y vuelta).

### Primera asignación con efecto dentro de la factura en curso

- **R28** — *(cambiado: la factura fijada lleva la primera cuota, propuesta P17)* SI una primera asignación tiene
  su efecto E después del `desde` de la factura en curso (que es «sin plan»), ENTONCES la factura en curso DEBE
  fijarse en E sin plan y emitirse con las órdenes sin plan de su intervalo y la primera cuota del plan nuevo
  (R29), y la siguiente DEBE empezar en E con el plan, el tipo y la periodicidad nuevos, hasta el fin natural de
  su corte (R2). E es el día de inicio elegido, sin llevarlo al inicio de un período (decisión P8, R33): vale con
  un inicio pasado aplicado en el acto y con un inicio futuro que la cola aplica ese día. Ejemplos, con quincenal
  15 500 y mensual 31 000, los dos con órdenes quincenales, y la factura sin plan en curso desde el 1 o el 16 de
  noviembre: quincenal con inicio el 5 → la del 1 al 4 sin plan con sus órdenes y 11 366.67, y la del 5 al 15
  con el plan; quincenal con inicio el 18 (futuro) → la del 16 al 17 sin plan con 13 433.33; mensual con inicio
  el 18 → la del 16 al 17 con 13 433.33, y la emitida el 1 de diciembre con la mensual de diciembre; anual con
  órdenes mensuales e inicio el 18 → la del 16 al 17 con la cuota de 44 de 365 días, la del 18 al 30 sin cuota,
  y la anual siguiente en la emitida el 1 de enero.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Primera cuota de un plan (decisión P6)

- **R29** — *(cambiado: cobrada al empezar)* SI una factura lleva la primera cuota de un plan con costo base
  (R16, R28), ENTONCES esa cuota DEBE ser la del tramo del período de cobro que contiene su inicio C (E en R28; D
  en R16), de C al fin de ese período: completa si C es inicio del período (R8; P4); si no, la proporcional, con
  la regla de tramos de SLT-86 R12: el costo del período completo de R8 (ya redondeado) × los días de calendario
  del tramo ÷ los días del período, en decimal exacto, a dos decimales y con la mitad hacia arriba. El tramo
  puede pasar del `hasta` de las facturas siguientes (un plan anual con órdenes quincenales); el resto de ese
  período NO DEBE cobrarse en otra factura. Es la única excepción al «sin prorrateo»: cualquier otra cuota sigue
  R8. Ejemplos: quincenal 15 500 con primer plan desde el 10 → 6 de 15 días → 6 200.00; mensual 31 000 desde el
  18 de noviembre → 13 de 30 días → 13 433.33; anual desde el 18 de noviembre → 44 de 365 días, y ninguna cuota
  en diciembre; quincenal 15 500 desde el 1 → 15 500.00 (R8: es inicio de período).
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (alta el 10; inicio el 5 y el 18;
  anual desde el 18 con órdenes quincenales: la cuota en la emitida el 18 y ninguna en las de diciembre),
  `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` (R10).

### Fecha de efecto de los cambios del superadmin (decisiones P7, P9, P10 y P11)

> Modifican SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes»: R16 (la
> fecha elegida ya no rige tal cual; el rango sigue mirando la elegida, R34), R17 (un cambio ya no abre un
> tramo a mitad de período) y R18 («hoy» solo se aplica en el acto si es el primer día de un período del tipo
> de referencia). Aplica a «Asignar otro plan» a una empresa con plan, a «Crear custom» para una empresa con
> plan y a «Cambiar tipo de cobro». Con R37, el efecto así llevado es además un corte de órdenes (R38), y la
> factura emitida en él lleva la cuota del plan nuevo (R8).

- **R30** — *(cambiado: un ejemplo del test)* CUANDO el superadmin guarda un cambio de plan o de tipo de cobro de
  una empresa que ya tiene plan con una fecha de efecto que no es el primer día de un período de calendario de su
  **tipo de referencia** (el más largo entre el vigente y el nuevo), el sistema DEBE llevar el efecto al primer
  día del período de ese tipo de referencia siguiente al que contiene esa fecha, en la hora de la plataforma, y
  guardar el pendiente, su trabajo en la cola y su historial con esa fecha. Hasta entonces la empresa DEBE
  seguir con su plan y su tipo actuales (R15, R17). Así, un cambio a un tipo más largo rige al inicio de un
  período del tipo nuevo y no en el próximo inicio del vigente (decisión P9), y uno a un tipo más corto o igual,
  al inicio del próximo período del vigente. Ejemplos, con fecha elegida el 10 de noviembre de 2026:
  - mismo tipo: mensual → 1 de diciembre; quincenal → 16 de noviembre (y el 20 → 1 de diciembre); bimestral →
    1 de enero; anual → 1 de enero de 2027;
  - a un tipo más largo: quincenal → anual → 1 de enero de 2027 (no el 16 de noviembre); quincenal → mensual →
    1 de diciembre; mensual → bimestral → 1 de enero;
  - a un tipo más corto: anual → mensual → 1 de enero de 2027; mensual → quincenal → 1 de diciembre (no el 16);
  - «hoy» = 10 de noviembre, mensual → 1 de diciembre, pendiente y sin aplicarse en el acto.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts` (asignar: mismo tipo en los cuatro tipos, a
  uno más largo, a uno más corto y «hoy»), `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`
  (quincenal → anual, anual → mensual, mensual → quincenal), `tests/integration/db/planes-crear-custom-asigna.test.ts`,
  `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (quincenal → anual guardado el 10 de
  noviembre: las emitidas el 16 de noviembre y el 1 y el 16 de diciembre llevan la cuota quincenal que empieza,
  y la emitida el 1 de enero lleva la cuota anual completa), `tests/unit/services/planes-service-periodo.test.ts`.
- **R31** — SI la fecha de efecto elegida es el primer día de un período de calendario del tipo de referencia,
  ENTONCES el sistema DEBE respetarla: futura → pendiente para ese día; hoy → se aplica en el acto (SLT-86
  R18). Ejemplos: mensual, 1 de diciembre → 1 de diciembre; quincenal, 16 de noviembre → 16 de noviembre;
  anual, 1 de enero → 1 de enero; quincenal → anual el 1 de enero de 2027 (inicio común) → 1 de enero; mensual
  → anual con «hoy» = 1 de enero → se aplica en el acto. Una fecha que es inicio del vigente pero no del tipo de
  referencia NO DEBE respetarse: quincenal → mensual el 16 de noviembre → 1 de diciembre (R30).
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`
  (inicio común futuro y «hoy»; 16 de noviembre de quincenal → mensual).
- **R32** — CUANDO un cambio de R30 o R31 queda pendiente, la respuesta de asignar, de crear custom y de
  cambiar tipo de cobro DEBE devolver la fecha real (`vigenteDesde`, `AAAA-MM-DD`), y las dos confirmaciones en
  pantalla, la del detalle de empresa al asignar o cambiar el plan o el tipo y la del catálogo al crear el custom
  (decisión P11), DEBEN mostrar esa fecha y no la elegida.
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`, `tests/unit/services/planes-service-tipo-cobro.test.ts`,
  `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanesModule.test.tsx`.
- **R33** — SI la empresa no tiene plan (primera asignación), ENTONCES la fecha de inicio NO DEBE llevarse al
  inicio de un período: rige ese día, también si es futura (decisión P8), y su primera cuota sigue R16, R28 y R29.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R34** — El tope de «hoy + 12 meses» de la fecha de efecto (SLT-86 R16) DEBE validarse sobre la fecha
  **elegida** por el superadmin, antes de llevarla (decisión P10): una fecha elegida dentro del rango DEBE
  aceptarse aunque la real quede después del tope, y la respuesta y la confirmación DEBEN mostrar la real
  (R32); una fecha elegida fuera del rango DEBE rechazarse con `validation_error` en `vigenteDesde`, como hoy.
  Ejemplos, con hoy el 10 de noviembre de 2026: quincenal → anual elegida el 10 de noviembre de 2027 → pendiente
  para el 1 de enero de 2028; elegida el 11 de noviembre de 2027 → `validation_error`.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts` (elegida en el tope con la real después),
  `tests/unit/services/planes-service-periodo.test.ts` (elegida fuera de rango; la respuesta trae la real).

### Periodicidad de órdenes del plan (cambio de fondo del 2026-11-10)

- **R35** — *(cerrado con P14)* Cada plan DEBE tener una periodicidad de órdenes, quincenal o mensual, que el
  superadmin elige en el formulario del plan al crearlo y al editarlo. La edición DEBE seguir las reglas de la
  del resto del plan (SL-24: en el acto o programada con su fecha, con su fila de rastro). SI el formulario o la
  petición no la traen, ENTONCES crear DEBE dejarla en quincenal y editar NO DEBE cambiarla. Los planes que ya
  existen DEBEN quedar en quincenal al aplicar la migración. Cualquier otro valor DEBE rechazarse con
  `validation_error` en `periodicidadOrdenes`.
  *Test:* `tests/integration/db/planes-periodicidad-ordenes.test.ts` (crear con y sin ella; editar en el acto y
  programado; el rastro; un plan existente queda quincenal; valor inválido),
  `tests/components/PlanFormPeriodicidad.test.tsx` (el campo, su valor al editar y lo que manda).
- **R36** — *(cerrado con P13)* CUANDO cambia la periodicidad de órdenes de un plan, la factura en curso de cada
  empresa con ese plan NO DEBE cambiar: DEBE cerrarse con la periodicidad con la que se abrió, y la siguiente
  DEBE abrirse en su fin con la periodicidad nueva. Ejemplos, editada el 10 de noviembre en el acto: quincenal →
  mensual → la del 1 al 15 sigue quincenal, la siguiente va del 16 al 30 (fin del mes, R2) y después la de
  diciembre entero; mensual → quincenal → la de noviembre sigue entera y la siguiente es la del 1 al 15 de
  diciembre.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (las dos ediciones).
- **R37** — *(cerrado con P12)* Una empresa NO DEBE quedar con tipo de cobro quincenal en un plan con órdenes
  mensuales (la cuota del 16 no tendría factura que la emita). Así:
  - SI se asigna, se crea un custom o se cambia el tipo de cobro con esa combinación, ENTONCES DEBE rechazarse con
    `validation_error` en `tipoCobro`, sin escribir nada;
  - SI se edita la periodicidad de un plan a mensual (en el acto o programada) y alguna empresa lo tiene, o lo
    tiene como cambio pendiente, con tipo quincenal, ENTONCES DEBE rechazarse con `validation_error` en
    `periodicidadOrdenes`, sin escribir nada;
  - SI una edición programada ya no pasa esa regla al aplicarse, ENTONCES el trabajo DEBE fallar sin escribir
    nada, como hoy con una versión que no valida.
  *Test:* `tests/integration/db/planes-periodicidad-ordenes.test.ts` (asignar, crear custom y cambiar tipo con la
  combinación; editar a mensual con una empresa quincenal y con un pendiente quincenal; programada que ya no pasa).
- **R38** — *(cambiado: la cuota del plan nuevo)* CUANDO se aplica un cambio de plan o de tipo de cobro guardado
  por R30 o R31, su efecto DEBE coincidir con la emisión de una factura de la empresa: la factura en curso se
  emite entera con el plan de antes para sus órdenes y con la cuota del plan nuevo, y todos los cargos de cada
  factura salen del costo por orden de un solo plan. Ejemplo: mensual con órdenes quincenales a un plan mensual
  con órdenes mensuales, guardado el 10 de noviembre → efecto el 1 de diciembre; las dos de noviembre con el plan
  de antes, la emitida el 1 de diciembre con la cuota de diciembre del plan nuevo, y la de diciembre entera con
  el nuevo.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Qué es la factura? | R1, R5, R7 |
| ¿Cuándo se cierra y se cobra la cuota? (con los dos cambios de fondo: al terminar cada corte; la cuota, por adelantado en la emitida al empezar su período) | R2, R3, R4, R8, R24, R25, R39 |
| ¿La cuota suma a la deuda? | R18, R19, R20 |
| Reversos | R6, R13 |
| Empresa sin plan (con el cambio de fondo: quincenal) | R2, R9 |
| Quién ve | R21, R22, R23, R24 |
| Aviso al cerrar | R25 |
| Detalle por orden | R7 |
| Período, tramos y zona | R2, R8, R10, R29 (el tramo de SLT-86 R12 solo en la primera cuota: P6) |
| Partición | R16 (lo que le queda a SLT-120), R24 (lectura sin pantalla), R26 |
| ¿E2E? | R11, R18, R21 (integración con base) |
| P1 · Numeración | R14 |
| P2 · Cuota en la fila de la factura cerrada; deuda | R5, R13, R18, R19, R20, R22 |
| P3 · Sin prorrateo ni corte; el período en curso entero con el plan viejo | R8, R15, R17, R30, R38 |
| P4 · Inicio en el pasado: cuota completa | R8, R16, R28, R29 (dónde se emite: P18 abierta) |
| P5 · Tamaño aceptado | — (proceso: línea `tamano-pr-aceptado` de la ficha; sin requisito testeable) |
| P6 · Primera factura más corta: cuota proporcional | R10, R16, R24, R28, R29 |
| P7 · El servidor del superadmin lleva el efecto al inicio del próximo período | R15, R30, R31, R32 |
| P8 · Primera asignación con fecha futura: rige ese día, cuota proporcional | R28, R29, R33 |
| Tamaño ~41 archivos (P7) | — (proceso: línea `tamano-pr-aceptado` de la ficha; ampliada por P11 y P16) |
| P9 · Cambio a un tipo más largo: rige al inicio de un período del tipo nuevo | R8, R30, R31 |
| P10 · Tope de 12 meses sobre la fecha elegida | R34, R32 |
| P11 · 44 archivos; fecha real en las dos confirmaciones | R32 (las dos confirmaciones); el tamaño es proceso |
| Periodicidad de órdenes por plan; sin plan quincenal; una factura por corte; un solo tipo de factura | R1, R2, R5, R15, R16, R24, R26, R28, R35, R36, R37, R38 |
| P12 · Cuota quincenal con órdenes mensuales: se rechaza | R37 |
| P13 · Periodicidad editada: rige desde el siguiente corte | R36 |
| P14 · Planes existentes: quincenal | R35 |
| Cuota por adelantado; primera factura del plan con la cuota; sin devoluciones | R3, R5, R8, R9, R15, R16, R24, R28, R29, R38, R39, R40 |
| P15 · Al desplegar, el período en curso cuenta como pagado | R26 |
| Bloqueo por falta de pago en SLT-121 | R19 (fuera de alcance, sin test propio) |
| P16 · 49 archivos | — (proceso: línea `tamano-pr-aceptado` de la ficha) |

## Preguntas abiertas

De la cuota por adelantado (2026-11-10). Los requisitos marcados «propuesta» están escritos con la propuesta;
si el humano elige otra cosa, cambian esos requisitos y sus tests, no el resto. Revisadas contra el cobro
adelantado: P6 (la primera cuota sigue proporcional del inicio al fin del período, cobrada al empezar), P7, P9 y
P10 (el efecto cae en una emisión: la factura emitida ahí lleva la cuota del plan nuevo, sin devolver nada) no
quedan contradichas. P4 sí, en un punto: P18.

- **P17 · Primera cuota de una empresa que ya opera sin plan.** El humano dijo «la primera factura de un plan
  lleva solo la cuota (órdenes en 0)». Eso pasa tal cual con una empresa nueva que recibe el plan el día de su
  alta (R16). Pero si la empresa ya venía operando sin plan, al empezar el plan hay órdenes sin plan pendientes
  de facturar. Propuesta (R28): **una sola factura**, la que se emite al empezar el plan, con esas órdenes sin
  plan y la primera cuota. La otra salida es emitir dos facturas en el mismo instante: una con las órdenes sin
  plan y otra solo con la cuota (más filas y una regla de orden entre las dos). ¿Una o dos?
- **P18 · Plan con inicio en el pasado (P4) cuando la factura que debía llevar la cuota ya salió.** P4 dice «la
  cuota completa va en la factura en curso». Con el cobro por adelantado, la cuota debería emitirse al empezar
  el plan, pero esa factura ya está cerrada (por ejemplo, inicio el 1 asignado el 10: la emitida el 1 salió sin
  plan). Propuesta (R16): **cortar la factura en curso en el instante en que se aplica** y emitirla ya, con sus
  órdenes desde su inicio y la cuota; la siguiente sigue hasta el fin del corte. Así se cobra por adelantado,
  pero sale una factura que no termina en un corte (del 1 al 10 a las 15:00). La otra salida es la letra de P4:
  dejar la cuota en la factura en curso, que se emite al final de su corte (el 16), o sea a período vencido solo
  en este caso; si esa emisión es también inicio de otro período, esa factura llevaría dos cuotas. ¿Cortar al
  aplicar, o esperar al fin del corte?

### Respondidas el 2026-11-10, tercera tanda (texto original, para el rastro)

- **P12 · Cuota quincenal con órdenes mensuales.** Con tipo de cobro quincenal y un plan de órdenes mensuales,
  la cuota del 16 empezaría a mitad de la factura del mes. Propuesta (R37): **no se permite**; se rechaza al
  asignar, al crear el custom, al cambiar el tipo y al editar el plan. Otras dos salidas: (a) cuando el tipo es
  quincenal, las órdenes se facturan quincenales aunque el plan diga mensual (sin rechazos, pero el plan deja de
  mandar en ese caso); (b) la factura del mes lleva las dos cuotas quincenales (dos cuotas en una fila, y un
  cambio de plan el 16 dejaría dos planes en la misma factura). ¿Rechazo, (a) o (b)?
- **P13 · Cambio de la periodicidad de un plan con facturas en curso.** Propuesta (R36): la factura en curso de
  cada empresa termina con la periodicidad con la que se abrió y la nueva rige desde el siguiente corte. Así, de
  quincenal a mensual a mitad de mes sale una factura del 16 al fin de mes antes de la primera mensual entera.
  ¿Vale, o la nueva periodicidad debe esperar al siguiente 1 de mes?
- **P14 · Valor de los planes que ya existen.** Propuesta (R35): **quincenal**, el mismo de la empresa sin plan.
  Es el único valor que admite cualquier tipo de cobro sin chocar con R37 (todo inicio de un período de cobro
  cae el 1 o el 16), y es el corte con el que SLT-120 «Planes: facturar el período en curso (1–15) tras asignar
  los primeros planes» corrige el 1–15. ¿Vale quincenal para todos, o hay planes que deben quedar en mensual?
- **P15 · La primera cuota de las empresas con plan anual o bimestral al desplegar.** La factura que siembra la
  migración es la primera con plan de cada empresa. Con la regla de la cuota (R8, R29), una empresa anual
  desplegada el 10 de noviembre de 2026 paga en la factura del 1 al 15 de noviembre la cuota de lo que queda del
  año (61 de 365 días) y la anual entera el 1 de enero; una bimestral en un mes par, lo que queda de su bimestre.
  Las mensuales y quincenales, la cuota completa del 1 de noviembre. Propuesta (R26): así. La otra salida es no
  cobrar nada hasta el próximo inicio de su período de cobro (la anual, nada hasta el 1 de enero). ¿Cuál?
- **P16 · Tamaño.** Con la periodicidad del plan, `tasks.md > Archivos esperados` pasa de 44 a **49** archivos
  (122 % de `max_archivos` = 40): suma `lib/planes/rastro.ts`, `lib/planes/mensajes.ts`, `PlanForm.tsx` y dos
  tests. Si hay que volver a 44, el corte es una ficha aparte «Planes: el superadmin edita la periodicidad de
  órdenes del plan» (formulario, edición, rastro y R37), que se mergea sola después de esta. Aquí quedaría la
  columna con quincenal para todos (R35 sin la edición), y R36 y R37 no harían falta hasta esa ficha. ¿Se aceptan
  49 o se corta?

### Respondidas el 2026-11-10, segunda tanda (texto original, para el rastro)

- **P9 · Un cambio de tipo deja una factura más corta con la cuota completa del tipo nuevo.** Con
  P6 («cualquier otra factura cobra el período completo») y P7 (el efecto va al inicio del próximo período
  del tipo **vigente**), un cambio a un tipo más largo empieza a mitad del período del tipo nuevo: quincenal →
  mensual con efecto el 16 de noviembre deja la factura del 16 al 30 con la cuota mensual completa; quincenal
  → anual el 16 de noviembre, la del 16 de noviembre al 31 de diciembre con la cuota **anual** completa, y el
  1 de enero otra anual. Además «Mi plan» y el detalle de empresa mostrarán ahí el tramo proporcional de
  SLT-86 R12 (su entrada es el efecto), distinto de lo facturado. Así está escrito (R8). ¿Se confirma, o se
  prefiere (a) prorratear también esa factura, o (b) llevar el efecto de un cambio de tipo al inicio del
  próximo período común a los dos tipos (quincenal → anual: 1 de enero)? Las dos alternativas cambian R8,
  R29 o R30 y sus tests; no bloquean el resto.
- **P10 · Rango de la fecha elegida.** SLT-86 R16 deja elegir de hoy a hoy + 12 meses. Propuesta del
  spec (R30, design §3.1): el rango se sigue mirando sobre la fecha **elegida**; la real puede caer hasta un
  período después del tope (anual: elegida el 10 de noviembre de 2027, real el 1 de enero de 2028). ¿Vale?
- **P11 · Tamaño.** Con P7 dentro, `tasks.md > Archivos esperados` suma 44 archivos (el humano aceptó
  ~41): el ajuste en el servidor toca 5 de producción y 10 tests que hoy usan fechas a mitad de período o
  «hoy». Si hay que bajar a ~42, la propuesta es dejar fuera la confirmación con fecha del «Crear custom» del
  catálogo (`PlanesModule.tsx` y su test): la respuesta ya trae la fecha real, solo no se pinta. ¿Se acepta 44?

### Respondidas el 2026-11-10, primera tanda (texto original, para el rastro)

- **P6 · Factura más corta que su período de calendario.** Sin prorrateo (P3, P4), una factura con
  plan lleva siempre la cuota completa de su período (R8), aunque cubra menos días: una empresa dada de alta
  el 10 con plan quincenal paga la quincena entera en la factura del 10 al 15; una primera asignación anual
  sobre la factura sin plan de noviembre la deja del 1 de noviembre al 31 de diciembre con la cuota anual
  completa (R16, R28); y la factura sin plan se fija en el inicio del período del tipo nuevo (R28). Propuesta
  del spec: así, por coherencia con «sin prorrateo». Además, «Mi plan» y el detalle de empresa siguen
  mostrando el costo del tramo proporcional de SLT-86 R12 y R27 en esos casos, que ya no es lo que se
  factura: ¿se alinea esa vista en otra ficha (sugerencia: junto con P7) o se acepta la diferencia?
- **P7 · El servidor del superadmin aún acepta fechas de efecto a mitad de período.** Hoy
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
- **P8 · Primera asignación con fecha futura.** P3 habla de cambios; una primera asignación puede
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
| 2026-11-10 | P6 · Factura más corta que su período | La primera factura de una empresa que recibe su primer plan, si es más corta que su período, cobra la cuota **proporcional a los días** (regla de tramos de SLT-86 R12, decimal exacto). Única excepción al «sin prorrateo»: cualquier otra factura cobra el período completo. Ej.: quincenal 15 500 con primer plan desde el 10 → 6 200.00. El valor de la base y el de la app coinciden (humano). |
| 2026-11-10 | P7 · Fecha de efecto del superadmin a mitad de período | Entra **en SLT-118**. Si el superadmin programa un cambio de plan o de tipo de cobro con fecha de efecto a mitad del período de la empresa, el sistema la **lleva al inicio del próximo período** de esa empresa (10 nov en mensual → 1 dic; quincenal → 16 o 1; bimestral y anual según SLT-86) y la respuesta y la confirmación devuelven la fecha real. Una fecha exactamente en un inicio de período se respeta. Modifica SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes» R16–R18 (humano). |
| 2026-11-10 | P8 · Primera asignación con fecha futura | Rige ese día (no se lleva al inicio de período), con cuota proporcional como en P6 (humano). |
| 2026-11-10 | Tamaño con P7 | Se acepta ~41 archivos; línea `tamano-pr-aceptado` en la ficha (humano). |
| 2026-11-10 | P9 · Cambio a un tipo de cobro más largo | Rige al inicio de un período del **tipo nuevo** (1 de enero para anual; 1 del próximo bimestre para bimestral; 1 del mes para mensual), no en el próximo inicio del tipo viejo; hasta entonces la empresa sigue con su tipo y plan actuales. Ninguna factura queda corta salvo la primera de R29. Un cambio a un tipo más corto o igual sigue R30 (inicio del próximo período del vigente). Ej.: quincenal → anual el 10 nov rige el 1 ene (humano). |
| 2026-11-10 | P10 · Rango de la fecha elegida | El tope de 12 meses se valida sobre la fecha **elegida** por el superadmin; la real puede quedar después y la respuesta y la confirmación la muestran (humano). |
| 2026-11-10 | P11 · Tamaño 44 | Se aceptan 44 archivos, con la fecha real en las dos confirmaciones (cambio de plan de la empresa y crear custom); línea `tamano-pr-aceptado` en la ficha (humano). |
| 2026-11-10 | Periodicidad de órdenes (cambio de fondo, tras aprobar el spec) | Las órdenes **no** se facturan con el período de cobro de la cuota. Cada **plan** define la periodicidad de facturación de órdenes: **quincenal** (cortes 1 y 16) o **mensual** (del 1 a fin de mes); la edita el superadmin en el formulario de planes. Empresa **sin plan: quincenal** (sustituye a «mensual» de la fila «Empresa sin plan»). Hay **una factura por corte de órdenes**; la cuota del plan se suma en la factura del corte en que **empieza** su período de cobro (anual: en la del 1 de enero; mensual: en la del 1 de cada mes; quincenal: en cada una). Un solo tipo de factura y un solo plazo de pago. La cuota conserva sus reglas: período completo; P6 primera proporcional; P7, P9 y P10 fecha de efecto del superadmin; P4 inicio pasado (humano). |
| 2026-11-10 | P12 · Cuota quincenal con órdenes mensuales | **No se permite**: se rechaza al asignar, al crear el custom, al cambiar el tipo y al editar el plan (R37, como propuso el spec) (humano). |
| 2026-11-10 | P13 · Periodicidad de órdenes editada con facturas en curso | Rige desde el **siguiente corte**: la factura en curso termina con la periodicidad con la que se abrió (R36, como propuso el spec) (humano). |
| 2026-11-10 | P14 · Periodicidad de los planes que ya existen | **Quincenal** para todos (R35) (humano). |
| 2026-11-10 | Cuota por adelantado (cambio de fondo) | La factura se emite **al inicio de cada corte de órdenes** y lleva (a) los cargos y reversos de las órdenes del corte **anterior** y (b) la cuota del período de cobro que **empieza** en ese corte, cobrada por adelantado. La **primera** factura de un plan lleva solo la cuota (órdenes en 0). Ej.: plan mensual con órdenes quincenales → el 1 de cada mes, órdenes del 16 a fin del mes anterior + cuota del mes; el 16, solo órdenes del 1 al 15. Plan anual → solo órdenes en cada corte, salvo el del 1 de enero, que suma la cuota anual. **Sin devoluciones**: un cambio o una baja no devuelve cuota ya facturada. Sustituye, en lo que toca a la cuota, a «¿Cuándo se cierra y se cobra la cuota?» (humano). |
| 2026-11-10 | P15 · Empresas que ya operan al desplegar | Su período de cobro en curso **cuenta como pagado**: no se les cobra cuota hasta el próximo inicio de su período; mientras tanto solo se facturan sus órdenes (humano). |
| 2026-11-10 | Bloqueo por falta de pago | Es de SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora»; aquí solo se emite la factura y se suma a la deuda (humano). |
| 2026-11-10 | P16 · Tamaño 49 | Se aceptan 49 archivos; línea `tamano-pr-aceptado` en la ficha (humano). |
