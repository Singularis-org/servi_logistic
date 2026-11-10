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
> en la zona de cada empresa». Los marcados **(propuesta)** dependen de una pregunta abierta de abajo.
>
> **Vocabulario.**
> - *Factura*: el estado de cuenta interno de una empresa para un intervalo `[desde, hasta)`. Está **en
>   curso** (sin fin fijado), **por cerrar** (fin fijado, aún sin cifras) o **cerrada** (cifras guardadas).
> - *Movimiento*: un cargo o un reverso de `cobro_plataforma_movimiento` (SL-40). Su instante es
>   `ocurrido_at`, el mismo que `cobrado_at` de su traza (SLT-85).
> - *Cuota*: el costo base del plan por el uso de la plataforma en el período (SLT-86 R9–R12, R15).
> - *Corte*: el fin que fija a la factura en curso un cambio de plan o de tipo que empieza a regir.
> - *Margen de cierre*: 5 minutos después del fin de la factura (design §4.3).

### Facturas y períodos

- **R1** — El sistema DEBE tener, para cada empresa, exactamente una factura en curso, y las facturas de una
  empresa DEBEN cubrir el tiempo sin huecos ni solapes: cada factura nueva empieza en el `hasta` de la
  anterior.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R2** — El fin natural de la factura en curso DEBE ser el fin del período de calendario que contiene su
  `desde` (SLT-86 R4): el de su tipo de cobro si la empresa tiene plan, y el del mes de calendario si no lo
  tiene. Ejemplos: quincenal con `desde` el 1 → hasta el 16 a las 00:00; sin plan con `desde` el 1 de
  noviembre → hasta el 1 de diciembre a las 00:00.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R3** — CUANDO pasan el fin de la factura en curso y el margen de cierre, el proceso automático DEBE, en
  su primera corrida posterior, cerrarla y dejar abierta la siguiente desde ese fin, sin que nadie lo pida.
  Ejemplo: quincenal → la corrida de las 00:10 del 16 cierra la del 1 al 15 y abre la del 16.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R4** — MIENTRAS no haya pasado el fin de una factura más el margen de cierre, el proceso NO DEBE
  cerrarla.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (corrida a las 00:04 del 16: no cierra).
- **R5** — CUANDO se cierra una factura, el sistema DEBE guardar en ella: número, `desde`, `hasta`, el plan
  (id y nombre) y el tipo de cobro que regían en su intervalo, o «sin plan»; la Σ de los cargos, la Σ de
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

- **R8** — SI la factura tiene plan con costo base, ENTONCES su cuota DEBE ser el costo del tramo que va de
  `max(desde, entrada de la empresa)` a `hasta`, con la regla de SLT-86: costo del período del tipo con su
  descuento (R9, R10), el precio del plan vigente cuando empieza ese tramo (R15) y, si el tramo no cubre el
  período de calendario entero, `costo × días del tramo ÷ días del período` (R12), en decimal exacto, a dos
  decimales y con la mitad hacia arriba. Ejemplos: quincenal 15 500 completa → 15 500.00; quincenal 15 500
  con entrada el 10 → 6 200.00; mensual 31 000 cortada el 10 en un mes de 30 días → 9 300.00.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R9** — SI la factura no tiene plan, o su plan no tiene costo base («sin precio»), ENTONCES la factura
  DEBE cerrarse sin cuota y con los cargos de sus órdenes (decisión «Empresa sin plan»).
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R10** — Para un mismo precio, descuentos, tipo y tramo, la cuota que calcula la base DEBE ser igual al
  costo que muestran «Mi plan» y el detalle de empresa (`lib/planes/cobro.ts`).
  *Test:* `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` (la tabla de ejemplos de SLT-86
  R9, R10 y R12, más tramos de 1 día y meses de 28 a 31 días).

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
  ni repetidos, en el orden de sus períodos, que se asigna al cerrar; la factura en curso no tiene número.
  **(propuesta, P1)**
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (dos empresas: cada una 1, 2, 3).

### Cambio de plan a mitad de período (SLT-86 R17–R20)

- **R15** — CUANDO un cambio de plan, de tipo de cobro o una primera asignación empieza a regir en un
  instante posterior al `desde` de la factura en curso, el sistema DEBE, en la misma transacción que lo
  aplica, fijar el fin de la factura en curso en ese instante, con el plan y el tipo de antes, y abrir la
  nueva desde ese instante con los nuevos. La parte de antes DEBE llevar la cuota proporcional del plan de
  antes (R8). **(propuesta, P3)** Ejemplo: mensual 31 000 → quincenal 15 500 con efecto el 10 de noviembre:
  factura del 1 al 9 con cuota 9 300.00 y factura del 10 al 15 con 6 200.00.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R16** — SI el cambio empieza a regir en o antes del `desde` de la factura en curso, ENTONCES el sistema NO
  DEBE cambiar ninguna factura cerrada ni crear una factura vacía: la factura en curso DEBE pasar entera al
  plan y tipo nuevos. **(propuesta, P4)** Ejemplo: sin plan con factura en curso desde el 1 y primera
  asignación con inicio el 1 → la factura del 1 al 15 cierra con la cuota quincenal completa.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.
- **R17** — MIENTRAS un cambio esté pendiente, y SI se cancela o se reemplaza, el sistema NO DEBE cortar
  ninguna factura. Un cambio de precio del plan (SL-24) NO DEBE cortar facturas: rige por R8 desde el primer
  tramo que empieza después.
  *Test:* `tests/integration/db/factura-plataforma-cambio-plan.test.ts`.

### Deuda con la plataforma

- **R18** — CUANDO una factura con cuota se cierra, la deuda de la empresa con la plataforma DEBE subir en
  esa cuota, en la misma transacción del cierre. Una factura en curso o por cerrar NO DEBE sumar a la deuda.
  La deuda DEBE ser la misma en la wallet de la empresa, en el tope del pago (en la app y en la base) y en
  el listado de empresas del superadmin: Σ cargos − Σ reversos + Σ cuotas cerradas − pagos vigentes.
  **(propuesta, P2)**
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`, `tests/unit/utils/deuda-plataforma.test.ts`.
- **R19** — La empresa DEBE poder pagar la cuota desde la wallet como paga hoy los cargos (SL-45). SI un pago
  supera la deuda con la cuota incluida, ENTONCES DEBE rechazarse igual que hoy, en la app y en la base. Los
  pagos ya hechos NO DEBEN cambiar.
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`.
- **R20** — Cerrar o cortar una factura NO DEBE escribir en `cobro_plataforma_movimiento`, en
  `cobro_plataforma_traza` ni en `wallet_movimiento`: los cargos de las órdenes ya están en la deuda y no se
  cuentan dos veces.
  *Test:* `tests/integration/db/factura-plataforma-deuda.test.ts`.

### Quién ve y quién escribe

- **R21** — Una empresa DEBE leer solo sus facturas: con otra empresa en el contexto, las de la primera no
  se ven, también con SQL a mano.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts` (dos empresas).
- **R22** — Nadie DEBE editar facturas: la empresa NO DEBE poder insertar, cambiar ni borrar una factura, ni
  ejecutar el cierre o el corte (`42501`), y ningún archivo de `lib/` ni de `app/` DEBE escribir la tabla
  (guardia). Solo las funciones del dueño en la base las escriben.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`,
  `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`.
- **R23** — El superadmin DEBE poder leer las facturas de todas las empresas (decisión «Quién ve»).
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`.
- **R24** — MIENTRAS una factura no esté cerrada, el sistema DEBE devolverla, a la empresa dueña y al
  superadmin, como «en curso» con su total parcial: el total de órdenes hasta ese instante y la cuota del
  tramo hasta su fin (previsto o fijado), sin número. SI la empresa del contexto pide la de otra, ENTONCES
  la base DEBE rechazarlo con `42501`.
  *Test:* `tests/integration/db/factura-plataforma-aislamiento.test.ts`.

### Proceso, arranque y vuelta atrás

- **R25** — El cierre DEBE correr solo, cada hora a los 10 minutos, una vez para todas las empresas, como
  trabajo recurrente de núcleo de la cola; su primera corrida la DEBE sembrar el despliegue. NO DEBE enviar
  correos ni avisos al cerrar (decisión «Aviso al cerrar»).
  *Test:* `tests/unit/planes/jobs-factura-plataforma.test.ts`.
- **R26** — CUANDO se aplica la migración, cada empresa DEBE quedar con una factura en curso desde el inicio
  del período de calendario en curso (el de su tipo si tiene plan; el del mes si no). Una empresa dada de
  alta después DEBE tener su primera factura desde las 00:00 del día de su alta.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts`.
- **R27** — SI hay alguna factura cerrada con cuota, ENTONCES el `down.sql` DEBE negarse sin tocar nada: quitar
  la tabla bajaría la deuda y dejaría los pagos de la cuota como sobrepago. Sin cuotas cerradas, DEBE dejar
  la base como estaba, con el tope del pago de SL-45 igual que antes.
  *Test:* `tests/integration/db/factura-plataforma-cierre.test.ts` (ida y vuelta).

### Cobertura de las decisiones cerradas

| Decisión (2026-11-10) | Requisitos |
|---|---|
| ¿Qué es la factura? | R1, R5, R7 |
| ¿Cuándo se cierra y se cobra la cuota? | R2, R3, R4, R24, R25 |
| ¿La cuota suma a la deuda? | R18, R19, R20 |
| Reversos | R6, R13 |
| Empresa sin plan | R2, R9 |
| Quién ve | R21, R22, R23, R24 |
| Aviso al cerrar | R25 |
| Detalle por orden | R7 |
| Período, tramos y zona | R2, R8, R10, R15 |
| Partición | R24 (lectura sin pantalla), R26 |
| ¿E2E? | R11, R18, R21 (integración con base) |

## Preguntas abiertas
- Numeración propia de la factura (formato y si es por empresa o global).
  **P1 · Propuesta del spec:** número correlativo **por empresa** desde 1, asignado al cerrar (R14). Global
  iría contra `docs/architecture.md > Multi-empresa` («los únicos y las secuencias se declaran por empresa,
  nunca globales») y revelaría a una empresa cuántas facturas emite la plataforma. El formato visible
  (prefijo, ceros) lo fija SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro»; aquí
  solo se guarda el entero. Pendiente del visto bueno del humano.
- Cómo se registra la cuota en la deuda sin `orden_id` (tabla o movimiento nuevo) respetando que los
  cargos solo los escriban triggers o funciones del dueño (guardia `cobro-plataforma-solo-por-trigger`).
  **P2 · Propuesta del spec:** la cuota vive en la fila de la factura cerrada (tabla nueva
  `factura_plataforma`), que solo escriben funciones `SECURITY DEFINER` del dueño, sin permiso de escritura
  ni de ejecución para la empresa; la guardia se amplía a la tabla. La deuda pasa a ser Σ cargos − Σ
  reversos + Σ cuotas cerradas − pagos, en el trigger del tope y en las lecturas de la app (R18). No se
  toca `cobro_plataforma_movimiento` (design §1.3, alternativas). Pendiente del visto bueno del humano.
- **P3 (nueva) · La parte del plan viejo en un cambio a mitad de período.** SLT-86 no dice qué cuesta. Propuesta
  (R15): proporcional a sus días con el precio y el tipo viejos, como el tramo de entrada. ¿Se aprueba, o la
  parte vieja no se cobra?
- **P4 (nueva) · Un cambio con efecto anterior al inicio de la factura en curso.** Pasa con una primera
  asignación con fecha pasada (hasta un mes atrás) o con un cambio que la cola aplica después de un cierre.
  Propuesta (R16): las facturas cerradas no cambian y el tramo anterior no se factura; la corrección única
  del 1–15 es de SLT-120 «Planes: facturar el período en curso (1–15) tras asignar los primeros planes». Si
  esta ficha se despliega antes del 16 de noviembre y los planes se asignan con inicio el 1, la factura del
  1 al 15 ya sale con su cuota completa (R16, R26), y a SLT-120 le queda solo recalcular los cargos de las
  órdenes. ¿De acuerdo?
- **P5 (nueva) · Tamaño del PR.** Son 29 archivos (73 % de 40), pero unas 1 700 líneas, por encima de las
  1 000 de `gate.tamano_pr`. Hay precedente de aceptar el exceso (SLT-85, 2026-11-09). Si no se acepta,
  propuesta de corte en dos rebanadas que se mergean solas: **A** (esta ficha) modelo, migración, cierre,
  corte en el cambio de plan, acceso y proceso (R1–R17, R21–R23, R25–R27); **B** (ficha nueva) la cuota en
  la deuda y la lectura en curso (R18–R20, R24). A deja facturas cerradas que nadie ve y que aún no suman; al
  mergear B la deuda las suma todas, porque se deriva y no se copia (design §5).

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
