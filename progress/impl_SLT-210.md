# impl SLT-210 «Satélite: Vistas y ordenamiento en Órdenes de la bodega, como en Órdenes»

Ruta ligera. Spec aprobado por Carlos el 2026-11-19. Decisiones aplicadas (`progress/features/SLT-210.md`):
- P1: vistas por usuario, como `/ordenes` (sin cambio de modelo: `vista_filtro.usuario_id`).
- P2: se mantiene el agrupado por estado; el orden manda dentro de cada grupo; por defecto, igual que hoy.
- P3: mismo tamaño que hoy en `/ordenes` (`h-8` / `size-8`); NO se tocan `VistasFiltro` ni
  `SegmentedToggle`. T4 queda resuelta sin cambio de código: R1413 se prueba como «mismo alto que
  `/ordenes` y sin el alto táctil».

## Archivos

Producción
- `lib/types/recepcion-satelite.ts`: `CAMPOS_ORDEN_BODEGA_SATELITE` (`created_at`, `num_remision`) y
  `...esquemaOrdenamiento(..., "created_at", "desc")` en la base del paginado (la descarga lo hereda);
  la vigencia lo `omit`e.
- `lib/interfaces/repositories/IOrdenRepository.ts`: `RecepcionSateliteFiltro.orden?`.
- `lib/interfaces/services/IRecepcionSateliteService.ts`: `sortBy?`/`sortDir?` en la entrada.
- `lib/services/RecepcionSateliteService.ts`: `filtroDeRepo` pasa `orden` solo si la entrada lo trae.
- `lib/repositories/OrdenRepository.ts`: `ordenBodegaSatelite(orden?)` cambia SOLO el término de
  recencia (`o."created_at"` | `o."clave_remision"`, `ASC` | `DESC`) con fragmentos fijos elegidos por
  comparación; grupo de estado y prioridad delante, `id ASC` cierra. Sin orden, el texto de hoy.
- `lib/types/vista-filtro.ts`: superficie `"ordenes-bodega-satelite"`.
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`: prop `vistas` + `siembra` de
  `BuscadorFiltros`/`FilterComponent`, `aplicarVista`/`vistaPuestaId`/`catalogoVistas`/`filtroActual`
  como `OrdenesListado`; los dos `SegmentedToggle` con las opciones importadas de
  `ordenamiento-ordenes.ts`; emite el orden (`onOrdenChange`).
- `app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx`: estado `orden`, `claveDeOrden`
  en la clave de SWR, página 1 al cambiar, `fallbackData` solo con el orden por defecto, orden en la
  página y en la descarga (no en la vigencia).
- `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts`: `OrdenBodega`, `ORDEN_BODEGA_INICIAL`.

Tests
- Nuevo `tests/components/SateliteOrdenesListado.vistas-orden.test.tsx` (módulo real, 9 casos).
- Nuevo `tests/integration/db/satelite-orden-sql-real.test.ts` (Postgres real, dos zonas).
- `tests/integration/db/vista-filtro.test.ts`: caso R1411/R1412 con servicio + repositorio reales.
- `tests/unit/repositories/satelite-paginado-where.test.ts`, `tests/unit/services/recepcion-satelite-completo.test.ts`,
  `tests/unit/actions/recepcion-satelite-action.test.ts`: casos nuevos y literales del default actualizados.
- `tests/unit/guards/vistas-superficies-declaradas.guardia.test.tsx`: el montaje nuevo en el censo + control.
- `tests/unit/utils/vista-filtro-payload.test.ts`: la lista literal de superficies.
- `tests/components/descarga/SateliteDescarga.test.tsx`: la entrada de la descarga lleva el orden.
- `e2e/recepcion-satelite.spec.ts`: caso nuevo (ordenar, guardar y aplicar una vista).

Fuera de «Archivos esperados»: `components/shared/VistasFiltro.tsx` y `SegmentedToggle.tsx` NO se
tocan (P3). Entran `tests/unit/actions/recepcion-satelite-action.test.ts`,
`tests/components/descarga/SateliteDescarga.test.tsx` y `tests/integration/db/vista-filtro.test.ts`
(afirmaban la entrada exacta del borde, o es donde vive el `WHERE` de las vistas).

## Mapa R → test

| R | Test |
|---|---|
| R1400 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1400/R1401 … en ese orden, al inicio de la fila» |
| R1401 | ídem + `recepcion-satelite-action.test.ts` › «input vacio vale…» (literal `created_at`/`desc`) + `recepcion-satelite-completo.test.ts` › «R1401: sin orden…» + `satelite-orden-sql-real.test.ts` (sin orden = fecha desc) |
| R1402 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1402 — … desde la página 2; el campo no toca la dirección; la pre-cargada no se pinta» |
| R1403 | `satelite-paginado-where.test.ts` › «SLT-210 (R1403)…» + `satelite-orden-sql-real.test.ts` (grupo delante, cuatro combinaciones) + `recepcion-satelite-completo.test.ts` › «R1403/R1406…» |
| R1404 | `satelite-orden-sql-real.test.ts` (mismo conjunto y total por combinación; nada de la zona B en página ni descarga) |
| R1405 | `recepcion-satelite-action.test.ts` › «SLT-210 (R1405)…» (página y descarga, sin llamar al servicio) |
| R1406 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1406…» + `satelite-paginado-where.test.ts` › «SLT-210 (R1406)…» + `satelite-orden-sql-real.test.ts` (descarga = página fila a fila) |
| R1407 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1407…» |
| R1408 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1408/R1411…» |
| R1409 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1409/R1410 … repone término, filtro y valor…» |
| R1410 | ídem (búsqueda) + «R1410: «Limpiar todo» también la apaga» |
| R1411 | `vista-filtro.test.ts` › «SLT-210 (R1411/R1412)…» (Postgres) + guardia › «SLT-210 (R1411)…» + componente (lista y guarda en su superficie) + `vista-filtro-payload.test.ts` |
| R1412 | `vista-filtro.test.ts` › «SLT-210 (R1411/R1412)…» (otra persona no ve, no renombra, no actualiza, no borra) |
| R1413 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1413…» (`h-8`/`size-8`, sin `max-md:h-11`, como `/ordenes` hoy) |
| R1414 | `SateliteOrdenesListado.vistas-orden.test.tsx` › «R1414…» |

## Mutaciones (todas restauradas con `git checkout -- <archivo>`)

Corridas con `vitest run` sobre la base `servi_slt210_desechable`; cada una se puso ROJA:

| Mutación | Rojo |
|---|---|
| M1 `clave_remision` → `num_remision` (repo) | 3 (SQL unitario ×2, Postgres: `num_remision:desc`) |
| M2 dirección siempre `DESC` (repo) | 3 (SQL unitario ×2: R1403 y R1406; Postgres) — re-medido el 2026-11-19 con los dos archivos: `Tests 3 failed \| 17 passed (20)` |
| M3 el servicio no pasa `orden` | 3 (servicio ×2, Postgres) |
| M4 `fallbackData` también con otro orden (módulo) | 1 (R1402) |
| M5 descarga sin `...orden` (módulo) | 1 (R1406) |
| M6 `aplicarVista` no emite el filtro | 2 (R1409, R1410) |
| M7 «Limpiar todo» no apaga la vista | 1 (R1410) |
| M8 superficie `"ordenes"` en la satélite | 3 (guardia ×2, componente) |
| M9 cambiar el campo pone la dirección en `asc` | 2 (R1402, R1407) |
| M10 catálogo de vistas siempre «cargado» | 1 (R1414) |
| M11 cambiar el orden no vuelve a la página 1 | 1 (R1402) |
| M12 «Limpiar todo» resetea el orden | 1 (R1407) |

## Salida de los comandos

Todo con `con-desechable.cjs … servi_slt210_desechable` (base local migrada + `db:seed`).

- `npx tsc --noEmit -p .` → sin salida, exit 0.
- `eslint` sobre los archivos tocados → `0 errors, 2 warnings` (los dos ya existían en `dev`:
  `OrdenHistorialOrigenTipo` sin uso en `IOrdenRepository.ts` y `_args` en `satelite-paginado-where.test.ts`).
- `vitest run` de los 7 archivos de la feature → `Test Files 7 passed (7) · Tests 81 passed (81)`.
- `vitest run` de los 17 archivos vecinos (satélite, vistas, descarga, paginación, SQL real) → tras
  ajustar 5 literales del borde que ahora llevan el orden por defecto: `Tests 40 passed (40)` en los
  dos que fallaban; el resto `247 passed`.
- Componente nuevo → `Tests 9 passed (9)`.
- Gate rápido, 1.ª vuelta: `INIT_EXIT=1` — rojo NUEVO `tests/unit/repositories/criterio-unico.guardia.test.ts`
  (su MUTACION 4 busca el texto `${ordenBodegaSatelite()}` y la llamada es ahora
  `${ordenBodegaSatelite(filtro.orden)}`). Se ajusta el patrón: `Tests 22 passed (22)`.
- Gate rápido, 2.ª vuelta: `== init OK ==` · `INIT_EXIT=0` ·
  `✓ SLT-210: tamano del PR: 20/40 archivos, 272/1000 lineas de produccion, 983/3000 de tests`.
- E2E: `next build` → `BUILD_EXIT=0`; `playwright test e2e/recepcion-satelite.spec.ts --project=reparto`
  (E2E_PUERTO=3210) → `2 passed (29.4s)` · `E2E_EXIT=0`.

## Veredicto
SLT-210 hecha: vistas por usuario en su superficie y orden dentro del grupo de estado, R1400-R1414
con test, 12 mutaciones en rojo, gate y E2E en verde.
