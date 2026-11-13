# Review SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» — vuelta 1

Reviewer, 2026-11-13. Ruta completa (fullstack / medium). Diff: `origin/dev...500a33d1` (PR #150).
Base de tests: `slt140_excel`. MCP del grafo no usado (Grep/Read y git en el worktree).

## Checklist

- [x] **Ruta:** completa, como exige el dinero (D5: solo lectura de lo congelado).
- [x] **Spec:** `requirements.md` (R377-R383, EARS), `design.md` con `## Lo que ya existe` al principio
  y `## Alternativas descartadas` (4), `tasks.md`. El diff no re-crea nada de la lista: reusa
  `derivarPendienteCierre`, `folioCierre`, `libro`/`tituloHoja` de SLT-113 y `partesPorTienda`.
- [ ] **Tasks:** T0-T5 `[x]`; **T6.1-T6.4 sin marcar** (ver B1).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 33/40 archivos, 2726/1000 líneas, con la línea
  `tamano-pr-aceptado` en `progress/features/SLT-140.md` (Carlos, PA4). Ver m2.
- [x] **Trazabilidad:** cada R377-R383 tiene tests reales (literales a mano, paridad con el detalle,
  conteo de consultas). Mapas R → test en `tasks.md > Trazabilidad` y en `progress/impl_SLT-140.md`.
- [x] **Typecheck:** `pnpm run typecheck` exit 0.
- [x] **Lint:** `eslint` sobre los `.ts/.tsx` del diff, exit 0.
- [x] **Tests:** los 7 archivos nuevos/tocados de la feature: 7 files / 100 passed (integración
  incluida, sin `skip`). Servicios + descarga + componentes de descarga + integración de detalle y
  pendiente: 470 files / 8 790 passed. `columnas-sensibles`, `pais-sin-literales`, `slt123`, `slt139`,
  `cierre-detalle-cifras-fila`, `cierres-gestiones-modelo-nuevo-descarga`: 89 passed.
- [x] **Mutaciones reproducidas** (revertidas con `git checkout`, `git status` limpio tras cada una):
  - quitar `cierre: alcanceWhere(alcance)` de los dos `where` de `findGestionesDeCierresEnAlcance`
    → MATADA (integración «el alcance va en el WHERE…»);
  - la lectura en lote dentro de un bucle por cierre en `completoConCifras` → MATADA (integración
    «mismas consultas con 1 y con 3» y servicio «UNA llamada con los ids nuevos»).
- [x] **`cifrasDelCierre` extraída tal cual:** mismas funciones y mismos argumentos que el bloque que
  vivía en `verCierreDetalle` (`resumen` y `found.gestiones`). En `tests/` el diff solo borra dos
  líneas: el título de un `it` de la guardia de frontera y un `import` ampliado. Ninguna aserción del
  detalle ni del pendiente cambia. La paridad Excel = detalle está probada contra Postgres
  (`cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts:465`, N1 y N2) y contra literales.
- [x] **Lectura en lote = lectura del detalle:** mismo `GESTION_ADMIN_SELECT`/`DETALLE_ADMIN_SELECT`,
  mismo orden (`createdAt desc`), mismo mapper y el mismo error duro sin fila congelada. Lo único que
  difiere es `cargoFulfillmentAt: null`, que solo alimenta `fulfillmentCargadoAt` (ninguna cifra).
- [x] **Modelo viejo idéntico:** componente (a) en las dos pestañas con `toEqual` a la configuración
  literal de hoy; servidor sin la clave `cifrasModeloNuevo` y 7 consultas (línea base) con solo viejos.
  El conjunto mixto añade «Cierres modelo anterior» con las columnas marcadas (componente (c), E2E).
- [x] **«Pago entregado» (PA1, PA2, R382):** `derivarPagoEntregadoCierre` = `(P + premios) −
  derivarPendienteCierre(input)`, con la MISMA entrada que el pendiente de la cola (`basePendiente` +
  `reglaDelCierre`). Hereda la regla de SLT-123 (marca de la fila; sin marca, el efectivo cubre) y la
  de SLT-139 (lo pagado por la satélite cuenta como entregado). Queda en `[0, P + premios]`: nunca
  negativo. `null` para no aprobados (vacío en «Pendientes»), y `null` para quien no es
  `esAccesoTotal` (el design aprobado fija `null`, línea 136); el cliente además no pone la columna
  ni la clave para la satélite. Decimal sobre string, sin floats.
- [x] **Desvíos:** `basePendiente` + `reglaDelCierre` mantiene verde la guardia de las 6 llamadas de
  `pendiente-cierre.test.ts:415` sin tocarla y sin debilitarla (cada llamada sigue nombrando
  `reglaDelCierre(`). Proyecciones con un objeto y folio calculado en el libro: es lo que exige la sonda
  de `columnas-sensibles.guardia` (ninguna proyección lee `cierreId`); la guardia corre verde y no se
  editó. La guardia de frontera solo AÑADE los dos módulos nuevos a su `SUBARBOL`.
- [x] **Los 12 dobles:** cada uno añade solo `findGestionesDeCierresEnAlcance` que lanza si se llama
  (+3 líneas, cero `-`). Decisión del leader con deuda anotada (fábrica de dobles).
- [x] **Literales a mano, trato en tú, dinero sin floats:** los tests de cifras y de «Pago entregado»
  usan literales escritos a mano; el señuelo «el string del servidor TAL CUAL» mata un cálculo en
  cliente. Ningún `Number`/`parseFloat` sobre importes en producción.
- [x] **Datos y seguridad:** sin tablas ni migraciones. La query nueva va acotada por el alcance en el
  `WHERE` y por empresa con la extensión del cliente + RLS, como el resto del repositorio. Nada de
  Ordenex.
- [x] **E2E (flujo crítico de cierres y dinero):** constancia en la bitácora: describe SLT-140 1/1 y
  grupo `dinero` 108/108 (incluye `cierres-rediseno` 19/19) con base desechable nueva.
- [ ] **`./init.sh`:** sin salida ni `INIT_EXIT` en la bitácora (T6.1; ver B1). El leader lo corre en
  paralelo.

## Hallazgos

- **B1 — BLOQUEANTE** · `specs/SLT-140-excel-hojas-cierre-mensajeros/tasks.md:96-103`: T6.1-T6.4 sin
  marcar (`CHECKPOINTS.md > Especificacion > Completa`: todas las tasks `[x]`). Falta:
  - T6.1: la salida de `./init.sh` con `INIT_EXIT` en `progress/impl_SLT-140.md`;
  - T6.3: las líneas de lo que hereda SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» en
    `progress/features/SLT-140.md` (`design.md > Archivos compartidos`). Hoy no están;
  - marcar T6.2 (la línea `tamano-pr-aceptado` ya existe) y T6.4 (los mapas R → test ya están en la
    bitácora).

  Es solo papeleo: el código no necesita cambios.
- **m1 — menor** · `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts:43`:
  el encabezado literal «SINPE» es un nombre de método de pago del país
  (`docs/checkpoints-proyecto.md > Arquitectura`). Lo exige R379 aprobado y coincide con los Excel de
  hoy (`cierres-bodega-descarga-columnas.ts`), así que no bloquea. Queda como deuda de SL-22.
- **m2 — menor** · el tamaño real es 33 archivos y 2 726 líneas. Lo aceptado en PA4 era «~1 400 líneas,
  25 archivos». La diferencia sale de los 12 dobles y de la bitácora y el spec. Conviene que el leader
  lo diga a Carlos al pedir el merge.
- **m3 — menor** · `lib/services/CierresAdminService.ts:1408` y `:1415`: `reglaDelCierre(...)` se evalúa
  dos veces con los mismos argumentos. Calcularla una vez en una constante haría visible a simple vista
  que la entrada es la misma.
- **m4 — menor (aviso)** · reproduje las dos mutaciones sobre el árbol del worktree mientras el leader
  corría su gate en paralelo. Cada una duró menos de 1 min y se revirtió con `git checkout`. Si el gate
  del leader leyó `lib/repositories/CierresAdminRepository.ts` o `lib/services/CierresAdminService.ts`
  en esa ventana, su veredicto no vale y hay que repetirlo.

## Veredicto

**RECHAZADO (CAMBIOS)**: solo por B1, que es papeleo de T6. El código, los tests y la trazabilidad
de R377-R383 están bien. Para la vuelta 2 basta comprobar B1 en el rango nuevo.
