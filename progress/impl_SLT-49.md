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
