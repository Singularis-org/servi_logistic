# SLT-119 — planes-pantallas-facturas · requirements.md

> **Título de la ficha:** «Planes: pantallas de facturas para el superadmin y el maestro»
>
> **Zona:** fullstack · **Complejidad:** medium · **Ruta:** completa · **depends_on:** SLT-118 «Planes: factura por
> empresa y período con la cuota y las órdenes» (PR #130), SLT-99 «Planes: el administrador de la empresa ve su plan y
> los públicos y cambia de plan» · **Rama:** feature/SLT-119-planes-pantallas-facturas
>
> **Alcance (description del board, fuente de verdad).** El superadmin ve las facturas de todas las empresas y el
> maestro las de su empresa en «Mi plan»: lista de períodos con su total (cuota + órdenes) y detalle completo de cada
> factura: cuota y cada cargo y cada reverso de orden con su fecha, número de guía y valor; incluida la factura en
> curso con total parcial. Solo lectura. Incluye el E2E diferido de SLT-118. Sale de partir SLT-118 el 2026-11-10.
> Desglose de cargos y reversos con fechas ampliado el 2026-11-12 (humano).
>
> **Lo que NO entra.** Aviso en la campanita, correo al cerrar y descarga en Excel/PDF → SLT-136 «Planes: aviso,
> correo y descarga de la factura». Plazo de pago y operación congelada por mora → SLT-121 «Planes: plazo de pago de
> la factura y operación congelada por mora». Recalcular los cargos del 1–15 → SLT-120 «Planes: facturar el período
> en curso (1–15) tras asignar los primeros planes». Cambiar cómo se calcula, se cierra o se numera una factura
> (SLT-118): aquí solo se lee. Factura electrónica, impuestos y moneda → SL-21. Zona horaria por empresa → SLT-90.
>
> No vino sembrado por `/afinar-feature`: lo escribe `spec_author` el 2026-11-12 desde la description del board y los
> specs de SLT-118 y SLT-99. El humano cerró P1–P5 el mismo día (filas de «Decisiones cerradas»).
>
> **Principio del humano (2026-11-12): las facturas van por empresa, no por plan.** Cada pantalla muestra todas las
> facturas de la empresa, también las de períodos sin plan o con un plan anterior; el plan es solo un dato de cada
> factura. El humano llama «administrador de la empresa» al `maestro`, el único rol que entra a «Mi plan» (SLT-91).

## Decisiones cerradas (no reabrir)

| Fecha | Decisión | Qué dice | Requisitos |
|---|---|---|---|
| 2026-11-10 | Quién ve (SLT-118) | Superadmin las de todas las empresas; maestro las de su empresa; nadie edita. Las pantallas son de esta ficha | R1, R12, R13, R14, R16 |
| 2026-11-10 | ¿E2E? (SLT-118) | Diferido a esta ficha: SLT-118 no tenía UI | R19 |
| 2026-11-10 | Formato del número (SLT-118 R14) | La base guarda el entero correlativo; el formato visible lo fija esta ficha | R4 |
| 2026-11-12 | Por empresa, no por plan (humano) | Las facturas son de la empresa: la lista lleva todas, con plan, sin plan o con un plan anterior, y los textos dicen «de la empresa», no «del plan» | R1, R12 |
| 2026-11-12 | P1 — Dónde ve el superadmin (humano: (a) con matiz) | En el detalle de cada empresa (`/plataforma/empresas/[organizacionId]`), en una **pestaña «Facturación»**, no en una sección suelta ni en una pantalla global | R12 |
| 2026-11-12 | Dónde ve el maestro (humano) | El listado de facturas de su empresa, en «Mi plan» | R1 |
| 2026-11-12 | P2 — Número (humano: (a)) | «N.º 7»: el entero tal cual | R4 |
| 2026-11-12 | P3 — Volumen del detalle (humano: (a)) | Páginas de 100 líneas leídas en el servidor, con el total de líneas | R10 |
| 2026-11-12 | P4 — Cómo se abre el detalle (humano: (a)) | Panel lateral dentro de la misma pantalla, sin ruta nueva | R6 |
| 2026-11-12 | P5 — Hora en las líneas (humano: (a)) | Fecha y hora | R7 |
| 2026-11-12 | P6 — Pestañas del detalle de empresa (humano: (a)) | Dos pestañas: «Empresa» (lo de hoy: plan, núcleo y módulos, sin cambios), que se abre por defecto, y «Facturación»; la pestaña elegida no va en la URL | R12 |
| 2026-11-12 | Desglose ampliado (humano) | El detalle lleva la cuota y cada cargo y cada reverso de orden con su fecha, número de guía y valor | R6, R7, R8, R9 |
| 2026-11-12 | Aviso, correo y descarga (humano) | Van a SLT-136; aquí no hay aviso, correo ni descarga | R16 |
| 2026-11-10 | En curso (SLT-118 R24) | La factura no cerrada se devuelve como «en curso», con total parcial, cuotas previstas y sin número | R2, R11 |

## Requisitos (EARS)

> Vocabulario de SLT-118 (`specs/SLT-118-planes-facturar-periodo-en-curso/requirements.md`): *factura*, *en curso*,
> *por cerrar*, *cerrada*, *cuota*, *primera cuota*, *movimiento*. Aquí, además:
> - *No cerrada*: una factura `en_curso` o `por_cerrar`.
> - *Línea*: una fila de la traza de SLT-85 «Traza de facturación de los cobros por orden» de la empresa con
>   `cobrado_at` en `[desde, hasta)` de la factura: un cargo o un reverso de una orden.
> - *Hora de la plataforma*: −06:00 (Costa Rica), hasta SLT-90 «Planes: ciclo y cobro en la zona de cada empresa».
> - *Maestro*: el rol de `ROLES_MI_PLAN` (SLT-91: «Mi plan» es solo del `maestro`).

### Lista de facturas

- **R1** — CUANDO el maestro abre «Mi plan», el sistema DEBE mostrar una sección «Facturas de la empresa» con
  **todas** las facturas de su empresa, cerradas y no cerradas, también las de períodos sin plan o con un plan
  anterior al actual, de la más reciente a la más antigua, y por cada una: su número (R4), su período (R3), el plan con
  el que se facturaron sus órdenes (o «Sin plan»), el total de órdenes, la suma de sus cuotas (la cuota de la emisión
  más la primera cuota; «—» si no lleva ninguna), el total y su estado. Ni el título ni los textos de la sección DEBEN
  presentarlas como facturas de un plan (decisión «Por empresa, no por plan»).
  *Test:* `tests/components/FacturasDeLaEmpresa.test.tsx` (una empresa con una factura sin plan, una con el plan
  anterior y la en curso con el actual: salen las tres; el título es «Facturas de la empresa»),
  `tests/integration/mi-plan-page.test.tsx`.
- **R2** — MIENTRAS una factura no esté cerrada, la lista y el detalle DEBEN mostrarla con el estado «En curso», sin
  número, con su total parcial (el total de órdenes hasta el momento de la lectura más las cuotas previstas) y cada
  cuota prevista marcada como «prevista». Una `por_cerrar` DEBE mostrarse igual que una `en_curso` (SLT-118 R24).
  *Test:* `tests/components/FacturasDeLaEmpresa.test.tsx`, `tests/components/DetalleDeFactura.test.tsx`.
- **R3** — El período de una factura DEBE mostrarse como el primer día y el último día de su intervalo `[desde, hasta)`
  en la hora de la plataforma: el último día es el anterior a `hasta`. En una no cerrada, `hasta` es su fin previsto.
  Ejemplos: `[1 nov 00:00, 16 nov 00:00)` → «1 nov 2026 – 15 nov 2026»; `[16 nov, 1 dic)` → «16 nov 2026 – 30 nov
  2026»; la sembrada histórica `[3 sep, 16 nov)` → «3 sep 2026 – 15 nov 2026»; una de R28 de SLT-118 de un solo día
  `[16 nov, 17 nov)` → «16 nov 2026 – 16 nov 2026».
  *Test:* `tests/unit/planes/facturas-vista.test.ts`.
- **R4** — Una factura cerrada DEBE mostrar su número como «N.º» seguido del entero correlativo de la base
  (SLT-118 R14), sin ceros a la izquierda: número 7 → «N.º 7». Una no cerrada NO DEBE mostrar número.
  *Test:* `tests/unit/planes/facturas-vista.test.ts`.
- **R5** — El total, el total de órdenes y cada cuota que muestran la lista y el detalle DEBEN ser los importes que
  devuelve la base (SLT-118 R5, R24), con el formato de dinero de la app, sin recalcularlos en la pantalla.
  *Test:* `tests/components/FacturasDeLaEmpresa.test.tsx` (importes con céntimos que un redondeo en pantalla
  cambiaría).

### Detalle de una factura

- **R6** — CUANDO el usuario abre una factura de la lista, en un panel lateral de la misma pantalla y sin cambiar de
  ruta, el sistema DEBE mostrar su detalle: número (si es
  cerrada), período, estado, el plan de sus órdenes y su periodicidad de órdenes («Quincenal» o «Mensual»); cada cuota
  que lleva, emitida o prevista, con su plan, su tipo de cobro, su tramo (primer y último día, como R3) y su importe, y
  en una cuota prorrateada (días cobrados distintos de los días del período) además «X de Y días»; el resumen de
  órdenes (Σ cargos, Σ reversos, número de movimientos y total de órdenes) y el total.
  *Test:* `tests/components/DetalleDeFactura.test.tsx` (una cerrada con las dos cuotas, una de ellas prorrateada; una
  sin cuota; una en curso con la cuota prevista).
- **R7** — El detalle DEBE listar las líneas de la factura, una por cada cargo y cada reverso, ordenadas por su
  instante de cobro de la más antigua a la más reciente (y por su identificador a igual instante), cada una con: la
  fecha y la hora del cobro en la hora de la plataforma, el número de guía de la orden, el tipo («Cargo» o «Reverso»)
  y el valor. El valor de un reverso DEBE mostrarse en negativo.
  *Test:* `tests/integration/db/factura-plataforma-detalle.test.ts` (qué líneas y en qué orden),
  `tests/components/DetalleDeFactura.test.tsx` (cómo se pinta cada una).
- **R8** — Para una factura cerrada, la suma de los valores de todas sus líneas DEBE ser igual a su total de órdenes y
  el número de líneas DEBE ser igual a su número de movimientos (SLT-118 R5, R7). Un cargo de un corte anterior
  reversado en esta factura DEBE salir solo como reverso en esta, y su cargo solo en la anterior (SLT-118 R6).
  *Test:* `tests/integration/db/factura-plataforma-detalle.test.ts` (cargo el 14, reverso el 17: dos facturas).
- **R9** — SI una línea no tiene número de guía (la traza lo guarda nulo), ENTONCES el detalle DEBE mostrar «—» en
  su lugar, sin ocultar la línea.
  *Test:* `tests/components/DetalleDeFactura.test.tsx`.
- **R10** — El detalle DEBE mostrar las líneas en páginas de 100, con la página anterior y la siguiente y el
  número total de líneas. Los totales del resumen (R6) DEBEN ser los de la factura entera, no los de la página. Pedir
  una página posterior a la última DEBE devolver una página vacía, sin error.
  *Test:* `tests/integration/db/factura-plataforma-detalle.test.ts` (230 líneas: páginas de 100, 100 y 30; la 4,
  vacía), `tests/components/DetalleDeFactura.test.tsx` (los botones y el total de líneas).
- **R11** — MIENTRAS una factura no esté cerrada, su detalle DEBE listar las líneas con instante de cobro desde su
  `desde` hasta el momento de la lectura, y su total de órdenes DEBE ser el parcial de ese momento (R2).
  *Test:* `tests/integration/db/factura-plataforma-detalle.test.ts`.

### Superadmin

- **R12** — CUANDO el superadmin abre el detalle de una empresa en Plataforma > Empresas, el sistema DEBE ofrecer una
  pestaña «Facturación» que, al elegirla, muestre las facturas de esa empresa con la misma lista (R1–R5) y el mismo
  detalle (R6–R11) que ve su maestro. Así el superadmin ve las facturas de cualquier empresa, una empresa a la vez.
  Lo que el detalle de empresa muestra hoy (plan, núcleo y módulos) DEBE ir en la pestaña «Empresa», que DEBE ser la
  elegida al abrir la pantalla, y la pestaña elegida NO DEBE guardarse en la URL.
  *Test:* `tests/integration/plataforma-empresa-detalle-page.test.tsx` (la pestaña, su contenido con la empresa de la
  URL, y el plan y los módulos visibles al abrir), `tests/integration/db/factura-plataforma-detalle.test.ts` (la
  lectura del superadmin devuelve las mismas facturas y líneas que la del maestro).

### Quién ve

- **R13** — SI quien pide las facturas o el detalle de su empresa no es el maestro (otro rol o sin sesión), ENTONCES
  el sistema DEBE responder `forbidden` sin leer la base; y SI quien pide las facturas o el detalle de una empresa por
  su identificador no es el superadmin, ENTONCES DEBE responder `forbidden` sin leer la base.
  *Test:* `tests/unit/services/factura-plataforma-service.test.ts`, `tests/unit/actions/facturas-plataforma.test.ts`.
- **R14** — SI el maestro pide el detalle de una factura que no es de su empresa, o el superadmin pide el de una
  factura que no es de la empresa que nombra, ENTONCES el sistema DEBE responder `not_found` sin devolver ningún dato
  de esa factura ni de sus líneas.
  *Test:* `tests/integration/db/factura-plataforma-detalle.test.ts` (dos empresas),
  `tests/unit/services/factura-plataforma-service.test.ts`.
- **R15** — SI la petición del detalle trae un identificador de factura o de empresa que no es un uuid, o una página
  que no es un entero ≥ 1, ENTONCES el sistema DEBE responder `validation_error` sin leer la base.
  *Test:* `tests/unit/services/factura-plataforma-service.test.ts`.
- **R16** — Las pantallas de facturas DEBEN ser de solo lectura: NO DEBEN ofrecer editar, pagar, anular, enviar ni
  descargar una factura (la descarga y el aviso son de SLT-136), y ninguna action, servicio ni repositorio nuevo DEBE
  escribir `factura_plataforma`, `cobro_plataforma_traza` ni `cobro_plataforma_movimiento`.
  *Test:* `tests/components/FacturasDeLaEmpresa.test.tsx`, `tests/components/DetalleDeFactura.test.tsx` (los únicos
  botones son abrir, cerrar y paginar), `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` (ya
  existe; barre los archivos nuevos).

### Fallos y vacío

- **R17** — SI la lectura de las facturas falla, ENTONCES la sección «Facturas de la empresa» de «Mi plan» o la pestaña
  «Facturación» del detalle de empresa DEBE decir «No se pudieron cargar las facturas» y el resto de la pantalla («Mi
  plan»: plan, consumo y cambio de plan; detalle de empresa: plan, núcleo y módulos) DEBE pintarse igual. SI la lectura del detalle falla, ENTONCES el detalle DEBE decir «No se pudo cargar la factura»
  y la lista DEBE seguir visible.
  *Test:* `tests/integration/mi-plan-page.test.tsx`, `tests/integration/plataforma-empresa-detalle-page.test.tsx`,
  `tests/components/DetalleDeFactura.test.tsx`.
- **R18** — SI la empresa no tiene ninguna factura (una empresa recién dada de alta antes de su primera corrida, o
  una lectura vacía), ENTONCES la lista DEBE decir «Aún no hay facturas de la empresa».
  *Test:* `tests/components/FacturasDeLaEmpresa.test.tsx`.

### De punta a punta (el E2E diferido de SLT-118)

- **R19** — El sistema DEBE pasar, en el navegador y sobre una base real, este recorrido: una empresa con un plan con
  costo base y costo por orden, dos órdenes con cargo y una de ellas eliminada (su reverso); el maestro ve en «Mi plan»
  la factura en curso con su total parcial y, en su detalle, los dos cargos y el reverso con su número de guía y su
  valor; tras el cierre de esa factura por `factura_plataforma_cerrar`, el maestro la ve como «N.º 1» con su cuota y
  su total, y el superadmin ve la misma factura y las mismas líneas en la pestaña «Facturación» del detalle de la
  empresa; el `admin` de la
  empresa no llega a «Mi plan» (404).
  *Test:* `e2e/facturas-plataforma.spec.ts` (proyecto `dinero`).

## Preguntas abiertas

Ninguna. P1–P6 las cerró el humano el 2026-11-12 (filas de «Decisiones cerradas»).
