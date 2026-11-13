# SLT-148 «Detalle del cierre de bodega sin N+1» — bitácora de implementación

## Tanda 1 — backend_dev: T0-T5 (2026-11-13)

Rama `feature/SLT-148-detalle-bodega-sin-n1`, desde `ffba8ed4` (spec aprobado). Base desechable
`slt148_wt` (migrada, solo catálogos), exportada antes de cada `vitest`. MCP del grafo: no usado
(proyecto del worktree recién creado); todo con Grep/Read.

### Archivos

- `lib/repositories/CierresBodegaAdminRepository.ts` — `findCierreBodegaConDetalle` en lote (T2.1);
  helper privado `conCabecera` (la cabecera con `desmarcable`, compartida por el corte N = 0 y el
  camino normal); comentario de `findGestionesDeCierresBodegaCompleto` al día.
- `tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts` (nuevo) — corpus y R420-R429.
- `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` — dobles de Prisma (T3.1).
- `tests/unit/repositories/cierre-pagos-lectura.test.ts` — dobles de Prisma (T3.2).

No tocados: `lib/interfaces/`, servicios, pantallas, `db/`, `CifrasBodegaLoteRepository`.
`progress/deudas.md` no se toca en esta rama (D67 llega con otro PR; la cierra el leader).

### T0 — medido con el código de hoy (`ffba8ed4`)

Contador: `crearPrismaDeTestConEspia`, sentencias emitidas por una llamada al repositorio dentro de
la transacción del test.

| Caso | Sentencias | Detalle |
|---|---|---|
| B1 (N = 1, 1 gestión) | **24** | cabecera 4 + cierres del día 2 + cargos 1 + gestiones 11 + filas 5 + modelo nuevo 1 |
| BX (N = 3, 2 + 2 + 1 gestiones) | **56** | 24 + 2 × 16 (gestiones 11 + filas 5 por cada cierre del día de más): el N+1 |
| B0 (N = 0) | **7** | cabecera 4 + cierres del día 2 + modelo nuevo 1 |
| BZ con S (fuera de alcance) | **4** | solo la cabecera: `cierre_bodega` + `zona` + `usuario` × 2 |

`BX > B1`: la deuda se reproduce; se sigue. Constantes en el test:
`CONSULTAS_DETALLE_UNO_LINEA_BASE = 24`, `CONSULTAS_DETALLE_SIN_DIAS = 7`,
`TABLAS_DE_LA_CABECERA = [cierre_bodega, zona, usuario, usuario]`.

Hallazgo para R425: la cabecera es UNA lectura (`findFirst`), pero Prisma la emite como 4 sentencias
(la suya y una por relación de `BODEGA_RESUMEN_SELECT`), **también cuando no hay fila**. «Una sola
sentencia» del requisito no se puede cumplir ni hoy; el test afirma lo que R425 protege: que lo emitido
es exactamente la lectura de la cabecera (sin `cierre_dia`, gestiones, filas ni cargos) y que la zona
de S va en los parámetros de su `WHERE`.

### T1 — cálculo a mano (literales del test)

Todo modelo NUEVO «solo flete» (G1a, G2a: pedido 20 000; G3a: pedido 10 000): flete 3 000,00 monto;
IVA 3 000 × 13 % = 390,00; con IVA = total = 3 390,00; IVA incluido 390,00; sin comisión (no cobra);
sin concepto de fulfillment → 0,00 / 0,00 / % null.

G2b (NUEVO, pedido 25 000 con comisión): flete 3 500,00, IVA 455,00 (3 500 × 13 %), con IVA 3 955,00;
comisión 25 000 × 2 % = 500,00, IVA 65,00, con IVA 565,00; total 3 500 + 455 + 500 + 65 = 4 520,00; IVA
incluido 455 + 65 = 520,00; fulfillment 600,00 + IVA 78,00 = 678,00. Pago congelado 2 500,00, pagado
1 800,00 → ajuste «resta» 700,00. Pagos por orden del enum: efectivo 15 000,00, SINPE 10 000,00.

G1b (VIEJO, rechazo, pedido 15 000, no central, no especial): flete devuelto 1 500,00, IVA 1 500 × 13 %
= 195,00, con IVA = total = 1 695,00; IVA incluido 195,00; fulfillment de la columna 0,00, IVA 0,00.

Cabecera BX: snapshots sembrados (efectivo 55 000, SINPE 20 000, general 75 000, pago 7 300, bodega
500); para la central 75 000 − 7 300 − 500 = 67 200,00 = falta por recibir (sin monto); el efectivo cubre
(55 000 ≥ 7 800). B0: todo 0,00, cubre (0 ≥ 0).

Cargos de fulfillment: O1 un cargo el 2026-11-05 15:00 UTC → esa fecha en G1a y G2a; O4 cargo y luego
reverso → null; O2 y O3 sin movimientos → null.

Orden: cierres del día por `solicitadoAt desc` D2 (17:00), D3 (16:00), D1 (15:00) — insertados D1, D2,
D3. Gestiones por `createdAt desc` dentro de cada uno, intercaladas entre cierres: D2 [G2b 13:00, G2a
11:00], D3 [G3a 09:00], D1 [G1b 12:00, G1a 10:00]. O1: «Calle 1, D1» en D1 y «Calle 1, D2» en D2.

T1.8 contra el código de hoy (antes de tocar `lib/`): **7 passed (7), EXIT=0** (R421-R429; R420 entra
en T2). Commit `94489f6d` (solo el test).

### T2 — el método en lote

`findCierreBodegaConDetalle`: cabecera y cierres del día sin cambios; con N = 0 devuelve la cabecera y
`[]` sin más lecturas; si no, en paralelo `cargosFulfillmentVigentes(idsDia)`,
`gestionOrden.findMany({ cierreId: { in: idsDia } }, createdAt desc, { ...GESTION_ADMIN_SELECT,
cierreId })` y `cierreDetail.findMany({ cierreId: { in: idsDia } }, { ...DETALLE_ADMIN_SELECT,
cierreId })`; agrupado por `cierreId` conservando el orden de la consulta; fila congelada por
`${cierreId}:${ordenId}`; el mismo `CierreDetalleFaltanteError(cd.id, g.ordenId)` recorriendo en el
mismo orden. Firma, interfaz y DTO iguales (`git diff` no toca `lib/interfaces/`).

Números nuevos (mismo corpus, mismo contador):

| Caso | Antes (T0) | Después |
|---|---|---|
| B1 (N = 1) | 24 | **24** |
| BX (N = 3) | 56 | **24** |
| B0 (N = 0) | 7 | **7** |
| fuera de alcance | 4 | **4** |

Archivo de integración con el código nuevo: **8 passed (8), EXIT=0** (R420-R429). Commit `296434f3`.

### T3 — dobles de Prisma

- `cierres-bodega-admin-repository.test.ts`: `gestionDbRow` / `detalleDbRow` ganan `cierreId: "cd1"`;
  el caso R11 afirma UNA llamada a `gestionOrden.findMany` y UNA a `cierreDetail.findMany` con `where`
  exacto `{ cierreId: { in: ["cd1", "cd2"] } }` y que cada gestión cae en su cierre del día (la
  respuesta trae la de cd2 primero); el caso SLT-110 con una sola respuesta. R19 y SLT-107 sin cambios.
- `cierre-pagos-lectura.test.ts`: el doble del detalle de bodega da `cierreId: "cd1"` a sus filas
  (vía overrides: `filaAdmin` / `filaSnapshot` también los usa el camino 2) y la aserción pasa a
  `toEqual({ ...GESTION_ADMIN_SELECT, cierreId: true })`.

`vitest related --run lib/repositories/CierresBodegaAdminRepository.ts`: **227 archivos, 221 passed /
6 failed; 3085 tests passed, 26 failed, 14 skipped; EXIT=1**. Las dos suites de unidad y todas las de
cierres que no dependen de datos: verdes. Los 6 rojos son de entorno, no de esta ficha: la base
desechable solo trae catálogos y esas suites exigen filas previas (`orden` o `usuario` vacía →
«Corre `pnpm run db:seed`»): `cierre-bodega-desglose-por-tienda-sql-real`, `486-evidencias-cierres-sql-real`,
`454/cierre-bodega-sf001-sql-real`, `cierre-bodega-conciliacion.int`, `corregir-conciliacion.int`,
`marca-conciliacion.int`.

### T4 — regresión de los consumidores (sin tocar sus aserciones)

Con el código nuevo: `cierres-bodega-cifras-lote-sql-real`, `cierre-bodega-cifras-fila-sql-real`,
`cierre-reparto-porcentajes-sql-real`, `ajuste-pago-mensajero-lectura.int`, `slt76-desmarcable.int` y
`tests/unit/services/cierres-bodega-admin-service.test.ts`: **verdes** (89 passed).
`cierre-bodega-desglose-por-tienda-sql-real` y `486-evidencias-cierres-sql-real`: **rojas por falta de
datos** (`orden` vacía), igual con el código de ANTES de la ficha (`ffba8ed4` restaurado a mano solo para
esa corrida y devuelto con `git checkout`: 2 failed, 10 skipped, EXIT=1, mismo mensaje). **T4.1 queda
abierta** hasta correrlas contra una base con datos (el gate del leader o CI).

### T5 — mutaciones (aplicadas por script sobre `CierresBodegaAdminRepository.ts`, revertidas con `git checkout`)

Script: `mutar.mjs <archivo> <Mn>` (falla si no encuentra el texto) + bucle que corre
`pnpm exec vitest run tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts --reporter=verbose`
con la base exportada, revierte y vuelve a correr. En cada corrida roja los otros 7 `it` se
EJECUTARON y pasaron (ninguno `skip`).

| # | Mutación | Corrida | Test que cae | Aserción | Revertida |
|---|---|---|---|---|---|
| M1 | lectura de gestiones y filas por cierre del día (bucle) | EXIT=1, 1 failed / 7 passed | R420 | `expected 56 to be 24` | EXIT=0, 8 passed |
| M2 | fila congelada solo por `ordenId` | EXIT=1, 1/7 | R422/R423/R424 | `direccion` «Calle 1, D1» → «Calle 1, D2» | EXIT=0, 8 passed |
| M3 | gestiones por `cierre: { cierreBodegaId }` sin `cierreId IN` | EXIT=1, 1/7 | R426 | `gestion_orden: parametro ajeno <id de BX>` | EXIT=0, 8 passed |
| M4 | gestiones `createdAt asc` | EXIT=1, 1/7 | R422/R423/R424 | `toEqual` entero: orden de gestiones distinto | EXIT=0, 8 passed |
| M5 | saltar la gestión sin fila en vez de lanzar | EXIT=1, 1/7 | R427 | `expected null to be an instance of CierreDetalleFaltanteError` | EXIT=0, 8 passed |
| M6 | sin el corte N = 0 | EXIT=1, 1/7 | R428 | las tablas de B0 incluyen `gestion_orden` | EXIT=0, 8 passed |
| M7 | zona fuera del `where`, filtrada en memoria al final | EXIT=1, 1/7 | R425 | 23 sentencias ≠ las 4 de la cabecera | EXIT=0, 8 passed |
| M7b | (variante) zona filtrada en memoria justo tras la cabecera | EXIT=1, 1/7 | R425 | los parámetros de la cabecera no incluyen la zona de S | EXIT=0, 8 passed |
| M8 | `cargoFulfillmentAt: null` para todas | EXIT=1, 1/7 | R422/R423/R424 | `fulfillmentCargadoAt` «2026-11-05T15:00:00.000Z» → null | EXIT=0, 8 passed |
| M9 | `cierreId` en el DTO de la gestión | EXIT=1, 1/7 | R422/R423/R424 | `+ "cierreId": …` en cada gestión | EXIT=0, 8 passed |

Ninguna sobrevive. Tras la campaña `git status --short lib/` vacío y
`git diff --stat ffba8ed4 -- lib/` = solo `lib/repositories/CierresBodegaAdminRepository.ts | 114 (66+, 48−)`.

### Mapa R → test (`cierre-bodega-detalle-lote-sql-real.test.ts`, salvo indicación)

| R | Test |
|---|---|
| R420 | «R420: mismas sentencias con N = 3 (BX, 2 + 2 + 1 gestiones) que con N = 1 (B1, 1 gestion)»; unidad: «R11 / SLT-148: UNA lectura de gestiones y UNA de snapshot…» |
| R421 | «R421: B1 (un cierre del dia) no cuesta mas sentencias que la linea base de T0» |
| R422 | «R422/R423/R424: BX entero, para la central y para S, igual a lo escrito a mano» |
| R423 | ídem (orden de cierres del día y de gestiones intercaladas en el literal) |
| R424 | ídem (O1 con «Calle 1, D1» en D1 y «Calle 1, D2» en D2) |
| R425 | «R425: BZ con S y un id inexistente con la central -> null tras la UNICA lectura de la cabecera» |
| R426 | «R426: gestiones y filas congeladas acotadas en la sentencia a los cierres del dia de BX» |
| R427 | «R427: BF (gestion sin fila congelada) rechaza nombrando su cierre del dia y su orden» |
| R428 | «R428: B0 sin cierres del dia -> la cabecera y una lista vacia, sin leer gestiones ni filas» |
| R429 | «R429: ninguna sentencia de escritura al leer ningun detalle (BX, B1, B0, BZ, BF, fuera de alcance)» |

### Salidas reales

- `pnpm exec tsc --noEmit -p .` → TSC_EXIT=0 (tras T2/T3; el código no cambió después).
- `pnpm exec eslint` de los 4 archivos tocados → «No issues found», ESLINT_EXIT=0.
- Archivo de integración (código final) → 8 passed (8), EXIT=0.
- `vitest related --run lib/repositories/CierresBodegaAdminRepository.ts` → EXIT=1: 221/227 archivos
  verdes; los 6 rojos son suites que exigen datos previos en la base (ver T3), rojas igual sin esta ficha.
- `./init.sh` y E2E (T6.3): no corridos aquí; los corre el leader. T6.2 (`progress/deudas.md`): fuera
  de esta rama por instrucción del leader.

### Abierto

- R425 dice «una sola sentencia»; Prisma emite 4 para la cabecera (con o sin fila). El test fija las 4
  de la cabecera y la zona en su `WHERE`; el texto del requisito queda para que el leader lo ajuste.
- T4.1: `cierre-bodega-desglose-por-tienda-sql-real` y `486-evidencias-cierres-sql-real` por correr
  contra una base con datos.

**Veredicto:** el detalle de bodega pasa de 56 a 24 sentencias con N = 3 (igual que N = 1), con la
respuesta idéntica a los literales a mano y las 9 mutaciones (+1 variante) en rojo; queda T4.1 para
una base con datos.

## Tanda 2 — backend_dev: guardia R23 de la 212 (2026-11-13)

El gate del leader (772fe8d0) salió rojo en `tests/unit/guards/pagos-proyeccion.guardia.test.ts` («el
tercer camino importa y USA `select: GESTION_ADMIN_SELECT`»): el lote pedía `{ ...GESTION_ADMIN_SELECT,
cierreId }`. Arreglo sin tocar la guardia (`debe0cb9`): las gestiones pasan a ser relación de la lectura
de `cierre_dia` con `select: GESTION_ADMIN_SELECT` tal cual (Prisma: una sentencia por nivel con
`cierre_id IN`, agrupada y en `createdAt desc` por cierre del día); las filas congeladas siguen en una
lectura con `cierreId IN`. Como Prisma emite las sentencias de una relación aunque no haya padres, el
corte N = 0 pasa a usar `_count.cierresDia` de la cabecera, antes de leer `cierre_dia`.

Sentencias: B1 24, BX 24 (R420/R421 verdes), B0 5 (antes 7; el test pasa a «como mucho» la línea base).
Guardia: 10 passed. `vitest run tests/unit/guards`: 243/244 archivos, 3617 passed, 4 failed, todos en
`dependencias-declaradas-presentes.guardia` (`init.sh` no llama a `scripts/verificar-dependencias.mjs`;
viene de la sincronización del arnés mergeada desde dev, `9aa7e060`; ajeno a esta ficha). Integración
8 passed. Mutaciones sobre el código nuevo: M1 (filas por cierre del día) → R420 «expected 34 to be 24»;
M2 → R422 (`direccion`); M3 (`cierre_detail` por `cierreBodegaId`) → R426 «parametro ajeno»; M6 (sin
el corte) → R428 (`gestion_orden` leída). Todas EXIT=1 con 1 failed / 7 passed; revertidas 8 passed.
