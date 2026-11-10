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
> en la zona de cada empresa». Ajustados el mismo día con las respuestas del humano a P1–P5 y a P6–P8 (filas
> nuevas de «Decisiones cerradas»): P6 y P8 cambian R8, R10, R24 y R28 y traen R29; P7 trae R30–R33, que
> **modifican SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes» R16–R18**.
> Los marcados **(propuesta)** dependen de una pregunta abierta de abajo.
>
> **Vocabulario.**
> - *Factura*: el estado de cuenta interno de una empresa para un intervalo `[desde, hasta)`. Está **en
>   curso** (sin fin fijado), **por cerrar** (fin fijado, aún sin cifras) o **cerrada** (cifras guardadas).
> - *Plan de la factura*: el plan (o «sin plan») y el tipo de cobro con los que se cobra la factura entera.
>   Es el de la empresa en el `desde` de la factura, salvo R16.
> - *Movimiento*: un cargo o un reverso de `cobro_plataforma_movimiento` (SL-40). Su instante es
>   `ocurrido_at`, el mismo que `cobrado_at` de su traza (SLT-85).
> - *Cuota*: el costo base del plan por el uso de la plataforma en el período: el del período completo de
>   su tipo, con su descuento (SLT-86 R9, R10, R15). Sin prorrateo (decisión P3), salvo la primera factura con
>   plan de una empresa cuando es más corta que su período (R29, decisión P6).
> - *Primera factura con plan*: la factura con plan de una empresa sin ninguna factura anterior con plan.
> - *Efecto*: el instante desde el que rige un cambio de plan, de tipo o una primera asignación (las 00:00
>   de su fecha, SLT-86). En un cambio del superadmin, la fecha ya llevada al inicio de un período (R30).
> - *Tipo vigente*: el tipo de cobro que la empresa tiene en el instante en que se guarda el cambio.
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

- **R8** — SI la factura tiene plan con costo base y no es el caso de R29, ENTONCES su cuota DEBE ser el
  costo del período **completo** de su tipo con el descuento de ese período (SLT-86 R9, R10) y el precio del
  plan vigente en el `desde` de la factura (SLT-86 R15), en decimal exacto, a dos decimales y con la mitad
  hacia arriba. NO DEBE prorratearse por días (decisiones P3, P4 y P6), aunque la factura cubra menos días que
  su período. Ejemplos: quincenal 15 500 → 15 500.00; mensual 31 000 con 10 % de descuento mensual →
  27 900.00; un precio editado con efecto el 5 rige desde la primera factura cuyo `desde` es el 5 o posterior;
  una empresa que ya tenía plan y pasa de quincenal a mensual con efecto el 16 de noviembre → la factura del
  16 al 30 lleva la cuota mensual completa (consecuencia que confirma P9).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
  (el cambio de tipo con factura más corta).
- **R9** — SI la factura no tiene plan, o su plan no tiene costo base («sin precio»), ENTONCES la factura
  DEBE cerrarse sin cuota y con los cargos de sus órdenes (decisión «Empresa sin plan»).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R10** — Para un mismo precio, descuentos y tipo, la cuota que calcula la base DEBE ser igual a la de
  `lib/planes/cobro.ts`, la que muestran «Mi plan» y el detalle de empresa: el costo del período completo
  (`montoDelPeriodo`) en R8, y el costo del tramo (`costoDelTramo` con `diasDelTramo` y `diasDelPeriodo`,
  o sea `costoDelPeriodoEnCurso` con la entrada en el `desde` de la factura) en R29.
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

### Cambios de plan: sin corte ni prorrateo (decisiones P3 y P4)

- **R15** — CUANDO se aplica un cambio de plan o de tipo de cobro a una empresa que ya tiene plan, el sistema
  NO DEBE cortar la factura en curso ni cambiar su plan, su tipo ni su fin: DEBE cerrarse entera, con la
  cuota completa del plan de antes (R8), y la siguiente DEBE empezar en su fin natural con el plan y el tipo
  que la empresa tenga en ese instante. Vale también si el efecto cae a mitad del período (un pendiente
  guardado antes de esta ficha o uno aplicado por otra vía; desde R30 el superadmin ya no puede guardarlo).
  Ejemplos, con la factura de noviembre en curso desde el 1 y mensual 31 000:
  - cambio a quincenal 15 500 con efecto el 1 de diciembre (inicio del próximo período, como SLT-99 «Planes:
    el administrador de la empresa ve su plan y los públicos y cambia de plan» R10) → noviembre cierra con
    31 000.00 y la del 1 al 15 de diciembre, con 15 500.00;
  - el mismo cambio con efecto el 10 de noviembre, guardado como pendiente por SQL → noviembre cierra igual,
    entera, con 31 000.00, y la siguiente empieza el 1 de diciembre con quincenal.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R16** — SI el efecto de un cambio de plan, de tipo o de una primera asignación cae en o antes del `desde`
  de la factura en curso (inicio en el pasado, o un cambio que la cola aplica tarde), ENTONCES la factura en
  curso DEBE pasar entera al plan y tipo nuevos, con su cuota (R8, o R29 si es la primera factura con plan), y
  su fin natural DEBE recalcularse con el tipo nuevo (R2). Las facturas por cerrar y cerradas NO DEBEN cambiar
  nunca, ni debe crearse una factura vacía. Ejemplos: empresa sin plan con factura en curso desde el 1 de
  noviembre y primera asignación quincenal 15 500 con inicio el 1, aplicada el 10 → la factura del 1 al 15
  cierra con 15 500.00; empresa dada de alta el 10 (factura en curso desde el 10, R26) y primera asignación
  quincenal 15 500 con inicio el 10 → la factura del 10 al 15 cierra con 6 200.00 (R29). Con esto, a SLT-120
  «Planes: facturar el período en curso (1–15) tras asignar los primeros planes» le queda solo recalcular los
  cargos de las órdenes.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (inicio el 1 aplicado el 10; alta el 10
  con inicio el 10; cambio aplicado después de que la cola cerrara su factura: la cerrada no cambia y la en
  curso toma el plan nuevo).
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
  de su plan (R8 o R29) como prevista, con su fin (previsto o fijado), sin número. SI la empresa del contexto pide la de otra, ENTONCES
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

- **R28** — SI una primera asignación tiene su efecto E después del `desde` de la factura en curso (que es
  «sin plan»), ENTONCES la factura en curso DEBE fijarse en E sin plan y sin cuota, y la siguiente DEBE empezar
  en E con el plan y el tipo nuevos, hasta el fin natural de su período (R2) y con la cuota de R29. E es el
  día de inicio elegido, sin llevarlo al inicio de un período (decisión P8, R33): vale con un inicio pasado
  aplicado en el acto y con un inicio futuro que la cola aplica ese día.
  Ejemplos, con la factura sin plan en curso desde el 1 de noviembre, quincenal 15 500 y mensual 31 000:
  quincenal con inicio el 5 → del 1 al 4 sin plan y del 5 al 15 con 11 366.67; quincenal con inicio el 18
  (futuro) → del 1 al 17 sin plan y del 18 al 30 con 13 433.33; mensual con inicio el 18 → del 1 al 17 sin
  plan y del 18 al 30 con 13 433.33.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Cuota de la primera factura con plan (decisión P6)

- **R29** — SI una factura con plan con costo base es la primera factura con plan de la empresa y su `desde`
  es posterior al inicio del período de calendario de su tipo que contiene ese `desde`, ENTONCES su cuota
  DEBE ser proporcional a sus días con la regla de tramos de SLT-86 R12: el costo del período completo de R8
  (ya redondeado) × los días de calendario de la factura ÷ los días de ese período de calendario, en decimal
  exacto, a dos decimales y con la mitad hacia arriba. Es la única excepción al «sin prorrateo»: cualquier
  otra factura con plan DEBE llevar el período completo (R8). Ejemplos: quincenal 15 500 con primer plan
  desde el 10 → del 10 al 15, 6 días de 15 → 6 200.00; mensual 31 000 desde el 18 de noviembre → 13 de 30
  días → 13 433.33; quincenal 15 500 con primer plan desde el 1 → 15 500.00 (no es más corta).
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (alta el 10; inicio el 5 y el 18;
  segunda factura con plan más corta por un cambio de tipo: período completo),
  `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` (R10).

### Fecha de efecto de los cambios del superadmin (decisión P7)

> Modifican SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes»: R16 (la
> fecha elegida ya no rige tal cual), R17 (un cambio ya no abre un tramo a mitad del período del tipo vigente)
> y R18 («hoy» solo se aplica en el acto si es el primer día de un período). Aplica a «Asignar otro plan» a
> una empresa con plan, a «Crear custom» para una empresa con plan y a «Cambiar tipo de cobro».

- **R30** — CUANDO el superadmin guarda un cambio de plan o de tipo de cobro de una empresa que ya tiene plan
  con una fecha de efecto que no es el primer día de un período de calendario de su tipo vigente, el sistema
  DEBE llevar el efecto al primer día del período siguiente al que contiene esa fecha, con ese tipo vigente,
  en la hora de la plataforma, y guardar el pendiente, su trabajo en la cola y su historial con esa fecha.
  Ejemplos, con fecha elegida el 10 de noviembre: mensual → 1 de diciembre; quincenal → 16 de noviembre (y el
  20 → 1 de diciembre); bimestral → 1 de enero; anual → 1 de enero; mensual con «hoy» = 10 de noviembre → 1
  de diciembre, pendiente y sin aplicarse en el acto.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts` (asignar, los cuatro tipos y «hoy»),
  `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`, `tests/integration/db/planes-crear-custom-asigna.test.ts`,
  `tests/unit/services/planes-service-periodo.test.ts`.
- **R31** — SI la fecha de efecto elegida es el primer día de un período de calendario del tipo vigente,
  ENTONCES el sistema DEBE respetarla: futura → pendiente para ese día; hoy → se aplica en el acto (SLT-86
  R18). Ejemplos: mensual, 1 de diciembre → 1 de diciembre; quincenal, 16 de noviembre → 16 de noviembre;
  anual, 1 de enero → 1 de enero.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`.
- **R32** — CUANDO un cambio de R30 o R31 queda pendiente, la respuesta de asignar, de crear custom y de
  cambiar tipo de cobro DEBE devolver la fecha real (`vigenteDesde`, `AAAA-MM-DD`), y la confirmación en
  pantalla (detalle de empresa al asignar o cambiar el tipo; catálogo al crear el custom) DEBE mostrar esa
  fecha y no la elegida.
  *Test:* `tests/unit/services/planes-service-periodo.test.ts`, `tests/unit/services/planes-service-tipo-cobro.test.ts`,
  `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanesModule.test.tsx`.
- **R33** — SI la empresa no tiene plan (primera asignación), ENTONCES la fecha de inicio NO DEBE llevarse al
  inicio de un período: rige ese día, también si es futura (decisión P8), y su primera factura con plan sigue
  R28 y R29.
  *Test:* `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

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
| Período, tramos y zona | R2, R8, R10, R29 (el tramo de SLT-86 R12 solo en la primera factura con plan: P6) |
| Partición | R16 (lo que le queda a SLT-120), R24 (lectura sin pantalla), R26 |
| ¿E2E? | R11, R18, R21 (integración con base) |
| P1 · Numeración | R14 |
| P2 · Cuota en la fila de la factura cerrada; deuda | R5, R13, R18, R19, R20, R22 |
| P3 · Sin prorrateo ni corte; el período en curso entero con el plan viejo | R8, R15, R17, R30 |
| P4 · Inicio en el pasado: cuota completa en la factura en curso | R8, R16, R28 |
| P5 · Tamaño aceptado | — (proceso: línea `tamano-pr-aceptado` de la ficha; sin requisito testeable) |
| P6 · Primera factura con plan más corta: cuota proporcional | R8, R10, R16, R24, R28, R29 |
| P7 · El servidor del superadmin lleva el efecto al inicio del próximo período | R15, R30, R31, R32 |
| P8 · Primera asignación con fecha futura: rige ese día, cuota proporcional | R28, R29, R33 |
| Tamaño ~41 archivos (P7) | — (proceso: línea `tamano-pr-aceptado` de la ficha; ver P11) |

## Preguntas abiertas

P1–P8 las respondió el humano el 2026-11-10 y pasaron a «Decisiones cerradas». Quedan:

- **P9 (nueva) · Un cambio de tipo deja una factura más corta con la cuota completa del tipo nuevo.** Con
  P6 («cualquier otra factura cobra el período completo») y P7 (el efecto va al inicio del próximo período
  del tipo **vigente**), un cambio a un tipo más largo empieza a mitad del período del tipo nuevo: quincenal →
  mensual con efecto el 16 de noviembre deja la factura del 16 al 30 con la cuota mensual completa; quincenal
  → anual el 16 de noviembre, la del 16 de noviembre al 31 de diciembre con la cuota **anual** completa, y el
  1 de enero otra anual. Además «Mi plan» y el detalle de empresa mostrarán ahí el tramo proporcional de
  SLT-86 R12 (su entrada es el efecto), distinto de lo facturado. Así está escrito (R8). ¿Se confirma, o se
  prefiere (a) prorratear también esa factura, o (b) llevar el efecto de un cambio de tipo al inicio del
  próximo período común a los dos tipos (quincenal → anual: 1 de enero)? Las dos alternativas cambian R8,
  R29 o R30 y sus tests; no bloquean el resto.
- **P10 (nueva) · Rango de la fecha elegida.** SLT-86 R16 deja elegir de hoy a hoy + 12 meses. Propuesta del
  spec (R30, design §3.1): el rango se sigue mirando sobre la fecha **elegida**; la real puede caer hasta un
  período después del tope (anual: elegida el 10 de noviembre de 2027, real el 1 de enero de 2028). ¿Vale?
- **P11 (nueva) · Tamaño.** Con P7 dentro, `tasks.md > Archivos esperados` suma 44 archivos (el humano aceptó
  ~41): el ajuste en el servidor toca 5 de producción y 10 tests que hoy usan fechas a mitad de período o
  «hoy». Si hay que bajar a ~42, la propuesta es dejar fuera la confirmación con fecha del «Crear custom» del
  catálogo (`PlanesModule.tsx` y su test): la respuesta ya trae la fecha real, solo no se pinta. ¿Se acepta 44?

### Respondidas el 2026-11-10 (texto original, para el rastro)

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
