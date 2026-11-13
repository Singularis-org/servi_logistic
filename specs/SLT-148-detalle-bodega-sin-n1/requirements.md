# SLT-148 «Detalle del cierre de bodega sin N+1» — requirements

> Ruta: completa (lee dinero congelado). Zona: backend. Escrito por spec_author el 2026-11-13.
> Rango reservado: **R420-R429** (SLT-147 «Limpieza de backend de cierres: deudas D63, D66, D68 y
> D72» usa R410-R419). No viene sembrado por `/afinar-feature`: las decisiones de abajo son las del
> encargo y las heredadas.

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero: todo es lectura de lo ya congelado. |
| E1 | 2026-11-13 · encargo de la ficha | Ninguna cifra ni la forma de la respuesta cambian: misma firma de `findCierreBodegaConDetalle`, mismo DTO, mismo orden. |
| E2 | 2026-11-13 · encargo de la ficha | El objetivo es un número de consultas **constante**: igual con 1 que con N cierres del día. Se mide con el contador de consultas de los tests de integración. |
| E3 | 2026-11-13 · encargo de la ficha | Sin migraciones. Si hiciera falta un índice, es pregunta aparte (no hace falta: `design.md > Modelo de datos`). |
| E4 | 2026-11-13 · encargo de la ficha | El alcance (zona de la satélite) sigue en el `WHERE`; se prueba contra Postgres real, no con dobles. |
| H-141 | 2026-11-12 · SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» | El detalle y la lectura en lote de SLT-141 dan las mismas cifras agregadas (R387 de SLT-141). |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D5 | R422, R429 |
| E1 | R422, R423, R424, R427 |
| E2 | R420, R421 |
| E3 | R429 (solo lectura, sin cambio de esquema: `design.md`) |
| E4 | R425, R426 |
| H-141 | R422 (la paridad de SLT-141 sigue verde sin tocarla) |

## Alcance

`CierresBodegaAdminRepository.findCierreBodegaConDetalle` (detalle de un cierre de bodega, que
consumen `CierresBodegaAdminService.verCierreBodegaDetalle` para la central y la satélite) lee hoy
dos consultas **por cada cierre del día** del cierre de bodega (gestiones y filas congeladas), más
las de las relaciones de cada una. Pasa a leer todos los cierres del día en lote.

Dentro: solo ese método. Fuera: el servicio, la interfaz `ICierresBodegaAdminRepository`, las
pantallas, `CifrasBodegaLoteRepository` (SLT-141) y cualquier otra lectura.

En los requisitos, **N** = número de cierres del día consolidados en el cierre de bodega pedido, y
«sentencias» = las sentencias SQL que emite la llamada, contadas con el cliente espía de los tests de
integración (`crearPrismaDeTestConEspia`).

## Requisitos (EARS)

- **R420** — CUANDO se lee el detalle de un cierre de bodega con N ≥ 1 cierres del día, el sistema
  DEBE emitir el mismo número de sentencias que con N = 1, sea cual sea N y sea cual sea el número
  de gestiones de cada cierre del día.
- **R421** — CUANDO se lee el detalle de un cierre de bodega con un solo cierre del día, el sistema
  DEBE emitir como mucho las sentencias medidas para ese caso antes de esta ficha (línea base de
  T0).
- **R422** — CUANDO se lee el detalle de un cierre de bodega, el sistema DEBE devolver exactamente
  la misma respuesta que antes de esta ficha: cabecera, resumen de cada cierre del día y cada
  gestión con todos sus campos (importes, descriptivos congelados, pagos, ajustes, fecha del cargo
  de fulfillment vigente y `tarifaFaltante`), igual a los valores calculados a mano del corpus.
- **R423** — El sistema DEBE devolver los cierres del día del más reciente al más antiguo por fecha
  de solicitud, y dentro de cada uno solo sus gestiones, de la más reciente a la más antigua por
  fecha de registro, aunque las fechas de gestiones de cierres del día distintos se intercalen.
- **R424** — SI una misma orden tiene gestiones en dos cierres del día del mismo cierre de bodega,
  ENTONCES el sistema DEBE componer cada gestión con la fila congelada de su propio cierre del día.
- **R425** — SI el cierre de bodega no existe o está fuera del alcance de quien lee (otra zona para
  la satélite), ENTONCES el sistema DEBE devolver «no encontrado» tras leer solo la cabecera (las 4 sentencias
  que Prisma emite para ella, medidas en T0), con el alcance en su `WHERE`, sin leer
  cierres del día, gestiones, filas congeladas ni cargos de fulfillment.
- **R426** — CUANDO se leen las gestiones y las filas congeladas, el sistema DEBE acotar en la
  propia sentencia a los cierres del día del cierre de bodega pedido: ninguna gestión ni fila
  congelada de otro cierre de bodega llega a leerse.
- **R427** — SI a una gestión le falta su fila congelada, ENTONCES el sistema DEBE fallar con el
  error de detalle faltante que nombra ese cierre del día y esa orden, sin devolver un detalle
  parcial.
- **R428** — SI el cierre de bodega no tiene cierres del día, ENTONCES el sistema DEBE devolver la
  cabecera con la lista de cierres del día vacía, sin leer gestiones ni filas congeladas.
- **R429** — El sistema NO DEBE emitir ninguna sentencia de escritura al leer el detalle de un
  cierre de bodega.

## Preguntas abiertas

Ninguna que dependa de Carlos.

- Para el leader: `progress/deudas.md` (en este worktree y en la raíz) no tiene una entrada D67; la
  más alta es D66. La deuda está descrita solo en `feature_list.json`. Al cerrar, T5 la registra
  como resuelta (ver `tasks.md`).
