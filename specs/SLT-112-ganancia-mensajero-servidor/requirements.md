# SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» — requirements

> Ruta: completa. Zona: **fullstack**. Rebanada **S14** del rediseño de cierres
> (`specs/SLT-95-detalle-cierre-rediseno/`, `tasks.md > Plan de las demás rebanadas > S14`).
> Escrito por spec_author el 2026-11-12. Requisitos nuevos en el rango **R350-R369** (se usan
> R350-R360). Los del madre (R60, R69, R71, R72) y los de SLT-108 (R158) y SLT-123 (R315, R320,
> R325, R327) se citan sin renumerar.

## Alcance

**Lo que pide la ficha.** «Cierres solicitados» de `/cierre-dia` (la cola única con rol mensajero,
SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros») pinta hoy la tabla sin tarjetas:
SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» fijó (R158) que no se pinten mientras
el servidor no emita las cifras de R69. Esta ficha hace que el servidor las emita y que la cola las
pinte:

- **«Ganancia pendiente de pago»**: lo que todavía se le debe al mensajero por sus cierres aprobados,
  con el número de cierres que tienen algo pendiente.
- **«Ganancia pagada este mes»**: lo que se le pagó en el mes en curso, con el número de pagos.

**Lo que ya existe y se reutiliza** (detalle en `design.md > Lo que ya existe`):
- La regla de lo pendiente de un cierre (`derivarPendienteCierre`), con la marca de SLT-123
  «Pago al mensajero independiente del efectivo» (cierre nuevo: `P` completo; cierre viejo:
  `P − min(P, E)`), los premios vivos y los pagos vigentes. Ya la usa la celda «Pago» de la cola
  (SLT-137 R164, SLT-123 R320).
- Los pagos de liquidación (`liquidacion_pago`, con `fecha_pago`) y su anulación
  (`liquidacion_anulacion`).

**Lo que NO entra.**
- Cambiar cómo se calcula, congela, paga o anula nada (R72): sin escrituras, sin migraciones.
- Lo «pagado por la satélite» como dato: el movimiento `pago_satelite` y su lectura nacen en SLT-139
  «Pago al mensajero independiente del efectivo: satélite». Aquí solo se deja el punto donde se suma,
  según la respuesta a PA1 (R353).
- Las tarjetas en el archivo de «Descargar» (SLT-108 R159: el archivo no cambia).
- Otras pantallas (`/wallet/mensajeros`, `/cierres-admin`).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién, cuándo | Cubierta por |
|---|---|---|---|
| D1 | Las cifras de R69 se calculan en el servidor; la pantalla solo las pinta (nota p1 de SLT-95, R71). | Carlos, SLT-95 | R355, R358 |
| D2 | Mientras el servidor no emita las cifras, la cola no pinta tarjetas ni ceros en su lugar. | SLT-108 R158 | R357 |
| D3 | Lo pendiente sale de `derivarPendienteCierre`, con la regla de cada cierre según su marca. | SLT-123 D12 y R320 | R350, R351 |
| D4 | Si lo «pagado por la satélite» cuenta en «Ganancia pagada este mes» lo decide este spec. | SLT-123 D12 (PA5) | R353 (pendiente de PA1) |

## Requisitos (EARS)

Vocabulario: **el mensajero** = el usuario de la sesión, con rol `mensajero`. **Lo pendiente de un
cierre** = lo que emite la regla única de SLT-123 R320 para ese cierre (R315 si es nuevo, R325 si es
viejo). **Pago vigente** = un pago de liquidación al mensajero sin anulación. **Mes en curso** = el
mes calendario de hoy en la zona horaria del país de la empresa. Los importes son strings de escala 2;
los conteos, enteros.

### Las cifras

- **R350** — CUANDO el mensajero carga `/cierre-dia`, el servidor DEBE emitir «Ganancia pendiente de
  pago»: la suma de lo pendiente de cada uno de sus cierres en estado `aprobado`, y el número de esos
  cierres cuyo pendiente es mayor que cero. Los cierres en cualquier otro estado NO DEBEN contar.
  (Concreta la primera mitad de R69.)
- **R351** — Lo pendiente de cada cierre que entra en R350 DEBE ser el mismo, al céntimo, que la celda
  «Pago» de la cola emite para ese cierre: misma regla (marca del propio cierre, R327), mismos premios
  vivos y mismos pagos vigentes. Con todos los cierres aprobados del mensajero en una sola página de
  la cola, «Ganancia pendiente de pago» DEBE ser igual a la suma de los pendientes de esa página.
- **R352** — CUANDO el mensajero carga `/cierre-dia`, el servidor DEBE emitir «Ganancia pagada este
  mes»: la suma de los montos de sus pagos vigentes cuya fecha del pago cae dentro del mes en curso
  (desde el día 1, incluido, hasta el día 1 del mes siguiente, excluido), y el número de esos pagos.
  Un pago anulado NO DEBE contar, aunque su fecha sea del mes. (Concreta la segunda mitad de R69.)
- **R353** — *(Según PA1.)* DONDE el servidor tenga la lectura de lo «pagado por la satélite»,
  «Ganancia pagada este mes» DEBE sumar además los movimientos «pagado por la satélite» del mensajero
  con fecha del movimiento dentro del mes en curso, y contar cada uno como un pago. MIENTRAS no la
  tenga, DEBE ser exactamente la de R352.
- **R354** — Las dos cifras DEBEN contar solo lo del mensajero de la sesión y de la empresa activa: con
  otro mensajero de la misma empresa y otra empresa en la base, ninguno de sus cierres ni de sus pagos
  DEBE sumar. Y NO DEBEN depender de los filtros, la búsqueda ni la página de la cola: con cualquier
  filtro aplicado, las cifras DEBEN ser las mismas que sin filtros.
- **R355** — Las cifras DEBEN calcularse con `Prisma.Decimal` y emitirse como string de escala 2 (los
  conteos como enteros), sin convertir ningún importe a número de coma flotante. Sin cierres
  aprobados o sin pagos en el mes, DEBEN valer `"0.00"` con conteo 0.
- **R356** — El número de consultas a la base para emitir las cifras NO DEBE crecer con el número de
  cierres aprobados ni de pagos del mensajero.
- **R357** — SI el servidor no tiene las lecturas de las cifras o la lectura falla, ENTONCES NO DEBE
  emitir ninguna cifra en su lugar (ni ceros), la cola NO DEBE pintar las tarjetas (como R158) y
  `/cierre-dia` DEBE cargar igual, con el resto de la página.
- **R359** — SI quien pide las cifras no tiene rol `mensajero`, ENTONCES el servidor DEBE responder
  `forbidden` sin leer ningún cierre ni pago.

### La pantalla

- **R358** — CUANDO el servidor emite las cifras, la cola con rol mensajero DEBE pintar, entre la barra
  (búsqueda, filtros y «Descargar») y la tabla, dos tarjetas en este orden, también cuando valen
  `"0.00"`:
  - «Ganancia pendiente de pago», destacada, con el importe y la nota «1 cierre aprobado sin
    liquidar», «<n> cierres aprobados sin liquidar» o, con 0, «Ningún cierre aprobado sin liquidar»;
  - «Ganancia pagada este mes», con el importe y la nota «1 pago», «<n> pagos» o, con 0, «Ningún pago
    este mes».
  Los importes DEBEN pintarse con el formato de moneda de la app tal como llegan, sin sumarlos,
  convertirlos ni recalcularlos (R71). Las tarjetas NO DEBEN cambiar al filtrar ni al paginar.
- **R360** — CUANDO la central registra o anula un pago a un cierre del mensajero, la siguiente carga
  de `/cierre-dia` DEBE mostrar las dos cifras ya con ese cambio: las cifras se leen en cada carga y no
  se guardan en ningún sitio.

### Lo que no cambia

- **R72** (madre) aplica: ninguna escritura, snapshot, asiento, tarifa ni migración nueva. La regla de
  lo pendiente (SLT-123 R315, R325) y la celda «Pago» (SLT-137 R164) no cambian su resultado.
- **R158** (SLT-108) sigue valiendo para la respuesta sin cifras (R357).

## Relación con requisitos ya en `dev`

- **R69** (SLT-95): R350-R353 lo concretan. Donde el canvas dice «9 cierres liquidados», manda R69
  («número de pagos»): ver PA3.
- **R60** (SLT-95): sus tarjetas quedan cubiertas por R358.
- **SLT-108 R158**: se cumple con R357; el test que hoy afirma «sin tarjetas» se divide en «sin cifras →
  sin tarjetas» y «con cifras → dos tarjetas» (`tasks.md > T5`).
- **SLT-123 R320**: R351 lo extiende a la tarjeta (una sola función para la celda y la tarjeta).
- **SLT-139 R335, R338** (en especificación): cuando lo «pagado por la satélite» entre en lo pendiente
  de un cierre (R338), la tarjeta lo hereda por R351 sin código propio. Ver `design.md > SLT-139`.

## Trazabilidad

La tabla completa, con el caso, está en `tasks.md > Trazabilidad`. Resumen:

| R | Test principal |
|---|---|
| R350, R351, R352, R354, R356 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` |
| R353 | `tests/unit/services/cierre-dia-ganancia.test.ts` (con y sin la lectura) |
| R355 | `tests/unit/services/cierre-dia-ganancia.test.ts` · `tests/unit/guards/liquidacion-money-safe.test.ts` |
| R357 | `tests/unit/services/cierre-dia-ganancia.test.ts` · `tests/components/CierreDiaPage.test.tsx` · `tests/components/CierreDiaColaPropia.test.tsx` |
| R358 | `tests/unit/utils/cola-propia-vista.test.ts` · `tests/components/CierreDiaColaPropia.test.tsx` · `e2e/cierres-rediseno.spec.ts` |
| R359 | `tests/unit/services/cierre-dia-ganancia.test.ts` |
| R360 | `e2e/cierres-rediseno.spec.ts` · `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` |
| R72 | `tests/integration/db/cierre-dia-ganancia-sql-real.test.ts` (sin escrituras) · `tests/unit/services/cierre-dia-pendiente-pago.test.ts` verde sin cambiar aserciones |

## Preguntas abiertas

- **PA1 — ¿Lo «pagado por la satélite» cuenta en «Ganancia pagada este mes»?** (SLT-123 D12.) Con
  SLT-139, al conciliar un cierre nuevo de satélite el libro del mensajero recibe un movimiento
  `pago_satelite = P` fechado el día de la conciliación (SLT-139 R317), y ese cierre deja de estar
  pendiente (R319). Si no cuenta como pagado, ese dinero sale de «pendiente» y no aparece en «pagada»:
  el mensajero de una satélite vería «Ningún pago este mes» aunque ya cobró. **Recomendación: sí
  cuenta**, con la fecha del movimiento (la de la conciliación, no la del día en que la satélite le
  entregó el dinero, que el sistema no conoce) y cada movimiento como un pago. Esta ficha deja el punto
  de suma (R353) sin depender del valor de categoría, que aún no existe; la lectura la implementa y la
  inyecta SLT-139 (`design.md > SLT-139`). Si la respuesta es «no», R353 y su punto de suma se quitan
  antes de implementar.
- **PA2 — Lo que un cierre viejo dio por pagado con el efectivo.** En un cierre viejo, `min(P, E)` se
  da por pagado con el efectivo que el mensajero recaudó (movimiento `pago_efectivo`, al aprobar en la
  central y al conciliar en una satélite, SLT-123 R325). No es un pago de liquidación, así que con R352
  no cuenta en «pagada este mes». **Recomendación: no contarlo**: R69 habla de pagos, el mensajero no
  recibió ese dinero en el mes (se lo quedó del recaudo del día) y, desde SLT-123/SLT-139, ningún cierre
  nuevo lo genera.
- **PA3 — La nota de «Ganancia pagada este mes».** El canvas dice «9 cierres liquidados»; R69 dice «el
  número de pagos». Un cierre pagado en dos partes son dos pagos y un cierre liquidado.
  **Recomendación: seguir R69** («<n> pagos», R358), que es lo que suma la tarjeta; contar cierres
  liquidados en el mes pediría decidir en qué mes cae un cierre pagado en dos meses.
