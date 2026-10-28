# SLT-49 — etiquetas-lote-tienda · bitácora de implementación

## Tanda backend (T1–T4) — backend_dev, 2026-10-28

### Archivos

| Archivo | Cambio | Task |
|---|---|---|
| `lib/services/alcance-etiquetas-orden.ts` | nuevo: `AlcanceEtiquetasOrden` + `resolverAlcanceEtiquetasOrden` (pura) | T1 |
| `tests/unit/services/alcance-etiquetas-orden.test.ts` | nuevo: los 6 roles | T1 |
| `lib/interfaces/repositories/IOrdenRepository.ts` | `findEtiquetasByIds(ids, tiendaId: string \| null)`, `findEtiquetaByNumGuia(numGuia, tiendaId: string \| null)` + JSDoc | T2 |
| `lib/repositories/OrdenRepository.ts` | `tiendaId` no nulo entra en el `where` de las dos consultas | T2 |
| `tests/unit/repositories/orden-repository.guia.test.ts` | solo la firma: las llamadas pasan `null` (lo que afirman no cambia) | T2 |
| `lib/services/EtiquetaGuiaService.ts` | alcance de T1 → `tiendaId` al repo; `esVisiblePara` sobre el alcance (segunda capa); comentarios | T3 |
| `lib/actions/etiquetas-guia.ts` | solo JSDoc de `generarEtiquetas` y `obtenerEtiquetaPorGuia` | T3 |
| `tests/unit/services/etiqueta-guia-service.test.ts` | cambio de contrato explícito (ADMIN_TIENDA sale de los bucles «cualquier rol»), `fakeRepo` simula el `tiendaId` del `where`, bloque nuevo de la tienda, doble que ignora `tiendaId` | T3 |
| `tests/integration/db/etiquetas-frontera-tienda.test.ts` | nuevo: casos (a)–(f) contra Postgres | T4 |

`etiquetas-lote-pdf-service.test.ts` y `api-pdf-etiqueta-service.test.ts` no necesitaron cambios
(sus dobles son del service, no del repo): verdes sin tocarlos.

Nota sobre T4: la base local no tiene órdenes ni usuarios (la app nace vacía; solo catálogo), así
que el escenario no se apoya en `fksDeOrden` como el archivo patrón: siembra sus dos tiendas
`adminTienda`, su zona y sus dos órdenes con guía dentro de `enTransaccionRevertida` (todo se
revierte). Del catálogo usa rol `adminTienda`, `tipo_identificacion`, `order_status`
`por_recolectar_en_tienda` y un `canton`; si falta, el `beforeAll` falla con nombre.

### Mapa R → test (lo de esta tanda)

| R | Test |
|---|---|
| R7 | `tests/integration/db/etiquetas-frontera-tienda.test.ts` › «R7 (c): service + repo reales, adminTienda A pide [A, B] …»; `tests/unit/services/etiqueta-guia-service.test.ts` › «R7: tienda propia …», «R7: lote mixto …» |
| R8 | integración › «R8 (d): lote de UNO con la orden de B (Ver etiqueta por fila) …»; unit › «R8: lote de uno con la orden de otra tienda …» |
| R9 | integración › «R9 (e): obtenerEtiquetaPorGuia(guia de B) para adminTienda A -> no_encontrada …»; unit › «R9: por guia ajena …» |
| R10 | integración › «R10 (a): el REPO, saltandose el service, con tiendaId = A …», «R10 (b): el REPO, saltandose el service, por la guia de B …»; unit › «R10: el repo se llama con el usuarioId de la tienda …» |
| R11 | integración › «R11 (f): el maestro recibe las etiquetas de A y de B …»; unit › «R11/R12: maestro/admin/mensajero/adminSatelite -> repo llamado con `null` …»; `alcance-etiquetas-orden.test.ts` › «R11: maestro -> todas», «R11: admin -> todas» |
| R12 | `alcance-etiquetas-orden.test.ts` › «R12: mensajero -> todas …», «R12: adminSatelite -> todas …»; unit › «R11/R12: maestro/admin/mensajero/adminSatelite NO se filtran por dueño», «… -> repo llamado con `null` …» |
| R13 | `alcance-etiquetas-orden.test.ts` › «R13: apiKey -> propias …»; unit › casos feature 136 existentes + «R13: el repo se llama con el dueño de la key como `tiendaId` …» + «R13 segunda capa: …» |
| R14 | `alcance-etiquetas-orden.test.ts` (tabla rol → alcance). La mitad de pantalla (`OrdenesPage.test.tsx`) es de T7, frontend. |

R1–R6, R15 (pantalla) y R3 (E2E) son de T5–T8, fuera de esta tanda.

### Contrapruebas (design §5.3)

Aplicadas una a una con un script, corrido el test, revertidas; `git diff` vacío tras cada
reversión (comprobado).

1. **Quitar `tiendaId` del `where` de `findEtiquetasByIds`** → ROJO en (a):
   `× R10 (a): el REPO, saltandose el service, con tiendaId = A devuelve solo la orden de A` —
   `AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]`. `Tests 1 failed | 5 passed`:
   (c) sigue verde por la segunda capa, como se esperaba.
2. **Quitar `tiendaId` del `where` de `findEtiquetaByNumGuia`** → ROJO en (b):
   `× R10 (b): el REPO, saltandose el service, por la guia de B con tiendaId = A devuelve null` —
   `AssertionError: expected { …(15) } to be null`. `Tests 1 failed | 5 passed`.
3. **`resolverAlcanceEtiquetasOrden` devuelve `todas` para `adminTienda`** → ROJO en (c), (d), (e)
   y en los unit: `× R7 (c) …` (`expected [ …(2) ] to deeply equal [ Array(1) ]`), `× R8 (d) …`
   (`expected { status: 'ok', …(2) } to deeply equal { status: 'ok', etiquetas: [], …(1) }`),
   `× R9 (e) …` (`expected { status: 'ok', etiqueta: { …(16) } } to deeply equal { status: 'no_encontrada' }`),
   `× R14/R7: adminTienda -> propias …` (`expected { alcance: 'todas' } to deeply equal { alcance: 'propias', …(1) }`).
   `Tests 9 failed | 31 passed`. El test de la página (T7) no existe aún: lo cubre frontend.
4. **Quitar la segunda capa (`esVisiblePara` devuelve siempre `true`)** → ROJO en el unit con el
   doble que ignora `tiendaId`: `× R7/R8/R9 segunda capa: un repo que IGNORA tiendaId …` —
   `AssertionError: expected [ 'propia', 'ajena' ] to deeply equal [ 'propia' ]`; y
   `× R13 segunda capa …` — `expected [] to deeply equal [ { ordenId: 'ajena', …(1) } ]`.
   `Tests 2 failed | 32 passed`. La integración sigue verde (la frontera vive en el `where`).

Incidencia: en la primera pasada la reversión de la contraprueba 1 falló (el texto mutado
aparecía dos veces en `OrdenRepository.ts`) y contaminó las corridas 2–4. Se restauró el archivo
al commit, se marcaron las mutaciones con un comentario único y se repitieron las 4 desde cero;
los resultados de arriba son los de esa segunda pasada limpia.

### Salida de tests

`DATABASE_URL` exportada desde el `.env` del repo principal (comprobado: host local, booleano).

```
pnpm exec vitest run tests/integration/db/etiquetas-frontera-tienda.test.ts \
  tests/unit/services/alcance-etiquetas-orden.test.ts tests/unit/services/etiqueta-guia-service.test.ts \
  tests/unit/repositories/orden-repository.guia.test.ts tests/unit/services/etiquetas-lote-pdf-service.test.ts \
  tests/unit/services/api-pdf-etiqueta-service.test.ts tests/unit/services/api-pdf-etiqueta-columna-intacta.test.ts \
  tests/integration/actions/etiquetas-guia-action.test.ts
 Test Files  8 passed (8)
      Tests  120 passed (120)
```

Integración sola: `tests/integration/db/etiquetas-frontera-tienda.test.ts (6 tests)` — 6 passed,
0 skipped.

`pnpm exec vitest related --run` sobre los archivos cambiados (sin `DATABASE_URL`, tras T3):
`Test Files 449 passed | 196 skipped (645)`, `Tests 6434 passed | 1491 skipped (7925)`, 0 failed
(los skipped son los de `tests/integration/db/` sin base en esa corrida).

`pnpm run typecheck` → exit 0. `pnpm run lint` → exit 0 (0 errors, 230 warnings preexistentes;
los archivos tocados no añaden ninguno).

**Veredicto:** T1–T4 hechas; frontera de tienda en el `where`, probada contra Postgres, con las 4
contrapruebas en rojo.

## Tanda frontend (T5–T7) — frontend_dev, 2026-10-28

P1 y P2 resueltas por el humano en su opción por defecto: R5 tal cual (la casilla de una orden de
recogida sin guía se bloquea con «Sin guía todavía» aunque sea eliminable) y R9 dentro.

### Archivos

| Archivo | Cambio | Task |
|---|---|---|
| `app/(app)/ordenes/estados-etiquetas-tienda.ts` | nuevo: `ESTADOS_ETIQUETAS_TIENDA` (los 3 de recogida) y `MOTIVO_SIN_GUIA` | T5 |
| `app/(app)/ordenes/_components/OrdenesListado.tsx` | prop `puedeImprimirEtiquetasPropias` (default `false`); `haySeleccion` con la tercera condición; `elegibleEtiquetasTienda`; acción «Imprimir etiquetas» en `accionesPara` antes de «Eliminar», con `(N)`; `haySeleccionables`; `bloqueoSeleccion` con `MOTIVO_SIN_GUIA` antes de la regla de «Eliminar»; `EtiquetasGuiaModal` fuera del bloque `accionesLote`, montado una sola vez con `haySeleccion` (un solo `<EtiquetasGuiaModal` en el archivo). `accionesDe` sin cambios | T6 |
| `tests/components/OrdenesListado.etiquetas-tienda.test.tsx` | nuevo (jsdom): R1, R2 (×2), R3 parcial, R4, R5, R6 (×2), R15 | T6 |
| `app/(app)/ordenes/page.tsx` | `puedeImprimirEtiquetasPropias` derivado de `resolverAlcanceEtiquetasOrden(actor).alcance === "propias"`, sin lista de roles; se pasa a `OrdenesListado` | T7 |
| `tests/components/OrdenesPage.test.tsx` | `vi.mock` de `alcance-etiquetas-orden` que delega en la función real; 3 casos R14 nuevos. Ninguna aserción previa tocada | T7 |

`tests/components/OrdenesListadoEtiquetasChain.test.tsx`: sin tocar, verde (4/4).

### Mapa R → test (lo de esta tanda)

| R | Test |
|---|---|
| R1 | `OrdenesListado.etiquetas-tienda.test.tsx` › «R1 — la tienda puede marcar sus órdenes con guía en los 3 estados de recogida» |
| R2 | idem › «R2 — con toda la selección elegible, la barra ofrece «Imprimir etiquetas» sin conteo»; «R2 — si no toda la selección es elegible, el botón dice cuántas: «Imprimir etiquetas (1)»» |
| R3 | idem › «R3 (parcial, componente) — pulsar «Imprimir etiquetas (2)» abre la vista previa con SOLO esas órdenes» (el E2E de T8 sigue pendiente) |
| R4 | idem › «R4 — la barra de la tienda no trae ninguna otra acción de flujo; «Eliminar» sí, si la orden es eliminable» |
| R5 | idem › «R5 — una orden de recogida SIN guía no se marca y el «!» dice «Sin guía todavía», aunque sea eliminable» |
| R6 | idem › «R6 — si ninguna marcada está en recogida con guía, «Imprimir etiquetas» no aparece»; «R6/R5 — una página solo con órdenes de recogida sin guía no monta casillas …» |
| R14 (pantalla) | `OrdenesPage.test.tsx` › «R14 — adminTienda: la prop llega en `true` …»; «R14 — maestro y admin: la prop llega en `false` …»; «R14 — si la regla dijera `todas` para la tienda, la prop llega en `false` …» |
| R15 | `OrdenesListado.etiquetas-tienda.test.tsx` › «R15 — el maestro (con `accionesLote`) sigue imprimiendo en `en_bodega_central` y el modal abre»; `OrdenesListadoEtiquetasChain.test.tsx` (sin tocar, 4/4) |

### Contrapruebas (aplicar → ROJO → revertir)

1. **Listado:** quitar `row.numGuia !== null` de `elegibleEtiquetasTienda` → ROJO:
   `× R6/R5 — una página solo con órdenes de recogida sin guía no monta casillas: ninguna lleva a «Imprimir etiquetas»`
   `AssertionError: expected <span data-disabled …(9)></span> to be null` (`OrdenesListado.etiquetas-tienda.test.tsx:289`).
   `Tests 1 failed | 8 passed (9)`. R1 y R5 siguen verdes y es lo esperado: el bloqueo
   «Sin guía todavía» se evalúa ANTES que la elegibilidad, así que la fila sin guía nunca llega a
   marcarse; lo único que cambia la mutación es que la columna de casillas se monta sobre una página
   en la que ninguna fila lleva a un botón. Revertido.
2. **Página (regla):** `resolverAlcanceEtiquetasOrden` devolviendo `todas` para `adminTienda`
   (`if (actor.rol === "apiKey")`) → ROJO:
   `× R14 — adminTienda: la prop llega en `true` (marca su orden de recogida con guía e imprime)`
   `TestingLibraryElementError: Unable to find role="checkbox" and name "Seleccionar orden REM-5001"` (`OrdenesPage.test.tsx:705`).
   `Tests 1 failed | 17 passed (18)`. Revertido.

`git diff` sin mutaciones al terminar.

### Salida de los comandos

`pnpm exec vitest run --reporter=verbose` sobre los 3 archivos de componente:
`Test Files 3 passed (3)`, `Tests 31 passed (31)` (9 del test nuevo, 4 de la cadena, 18 de la página).

`pnpm exec vitest related --run` sobre los 5 archivos cambiados de la tanda:
`Test Files 25 passed (25)`, `Tests 299 passed (299)`, exit 0.

`pnpm run typecheck` → exit 0. `pnpm run lint` → exit 0 (0 errors, 230 warnings preexistentes;
`eslint` sobre los archivos tocados: «No issues found»).

**Veredicto:** T5–T7 hechas; la tienda ve «Imprimir etiquetas» solo en sus órdenes de recogida con
guía, la prop sale de la regla única, y el modal se monta una sola vez para todos los roles.

## T8 — E2E

**Archivos:** `e2e/etiquetas-lote-tienda.spec.ts` (nuevo); `playwright.config.ts` (el spec entra en el
proyecto `reparto`).

**Mapa:** R3 → `e2e/etiquetas-lote-tienda.spec.ts` › «marca 2 órdenes, ve 2 etiquetas en la vista
previa y descarga un PDF (R3)». Las 2 órdenes (centrales, de `r.tienda`) se llevan con `llevarA` a
`mensajero_recogiendo_en_bodega`; se marcan por `Seleccionar orden <numRemision>`, la vista previa se
afirma por `article` «Etiqueta de la orden <numRemision>» con su `numGuia` (y 2 artículos en el diálogo).

**Descarga `.pdf`: AFIRMADA.** `page.waitForEvent("download")` recibe el evento al pulsar «Descargar
etiquetas»; `suggestedFilename()` termina en `.pdf` y `failure()` es `null`. El riesgo de `design.md §7`
no se materializó: no hizo falta el plan B.

**Nota de selector:** con todas las órdenes marcadas elegibles, el botón se llama «Imprimir etiquetas»
sin conteo (el «(N)» solo sale cuando hay marcadas no elegibles); el spec usa `exact: true`.

**Cómo se corrió (local):** base desechable `servi_e2e_slt49` en el Postgres local (host local
comprobado sin imprimir la URL): DROP/CREATE, `prisma migrate deploy` (exit 0), `db:seed` (exit 0).
Entorno como el job de CI (`gate.yml`): `SESSION_SECRET` aleatorio, `APP_BASE_URL` y
`NEXT_PUBLIC_APP_URL` = `http://localhost:3044`, sin el resto del `.env` de desarrollo.
`next build` con `NODE_OPTIONS=--max-old-space-size=8192` (con 4 GB murió por memoria, como anota
`gate.yml`). `E2E_STORAGE_PUERTO=55329`: el 54329 cae en un rango de puertos excluido por Windows
(`54319-54418`, `EACCES`). `E2E_PUERTO=3044 pnpm exec playwright test e2e/etiquetas-lote-tienda.spec.ts
e2e/dos-empresas-humo.spec.ts --reporter=list` (arrastra `plataforma-vacia` por `dependencies`).

Corrida 1 (base recién creada) y corrida 2 (misma base), idénticas:
```
  ok 11 [reparto] › e2e\etiquetas-lote-tienda.spec.ts:41:7 › Etiquetas por lote — la tienda › marca 2 órdenes, ve 2 etiquetas en la vista previa y descarga un PDF (R3) (1.8s)
  ok 12 [aislamiento] › e2e\dos-empresas-humo.spec.ts:199:5 › alta de A y B desde «Empresas» por el superadmin, y el correo de recuperación de cada maestro consta en el log (R16, R17)
  ok 13 [aislamiento] › e2e\dos-empresas-humo.spec.ts:224:7 › el maestro de A recorre todas las rutas de su menú sin error ni datos de B
  ok 14 [aislamiento] › e2e\dos-empresas-humo.spec.ts:224:7 › el maestro de B recorre todas las rutas de su menú sin error ni datos de A
  ok 15 [aislamiento] › e2e\dos-empresas-humo.spec.ts:269:5 › cada maestro abre el webhook de su API key y ve su URL, no la de la otra empresa
  ok 16 [aislamiento] › e2e\dos-empresas-humo.spec.ts:290:5 › B abriendo los detalles de A ve «no encontrado», y A los ve con su marcador
  ok 17 [aislamiento] › e2e\dos-empresas-humo.spec.ts:318:5 › SL-23: el superadmin dejó A con los 3 módulos y B sin «Ranking»; B no lo ve ni lo abre, A sí (R15, R16, R25, R26)
  ok 18 [aislamiento] › e2e\dos-empresas-humo.spec.ts:390:5 › vehículos carga y escribir desde la pantalla falla cerrado (R40); geografía le da 404 al maestro (SL-32 R26)
  18 passed (1.3m)   # corrida 2: 18 passed (1.4m)
```
(1–10 son `superadmin-arranque` y `superadmin-empresas`, del proyecto `plataforma-vacia`, todos `ok`.)
0 failed, 0 skipped, 0 flaky en las dos.

El spec se vio en rojo antes de pasar: primero por el nombre del botón con «(2)» (no existe con todo
elegible) y luego por `numGuia` repetido dentro de la etiqueta (strict mode); los dos eran del spec,
no de producción.

**Comandos:** `pnpm exec vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts` → `Tests 30 passed
(30)`. `pnpm run lint` → exit 0 (0 errors, 230 warnings preexistentes; `eslint` sobre los 2 archivos
tocados: «No issues found»). `pnpm run typecheck` → exit 0.

**Veredicto:** T8 hecha; R3 cubierto por E2E con la descarga `.pdf` afirmada, y `dos-empresas-humo` verde.
