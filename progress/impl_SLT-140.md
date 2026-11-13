# impl SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» — bitácora backend_dev

Tanda backend: T0–T3 (2026-11-12). Base desechable `slt140_excel` (base nueva + `prisma migrate deploy` +
`db:seed`), cliente Prisma compartido sin regenerar. MCP del grafo no usado (Grep/Read en el worktree).

## T0 — Comprobaciones

- **T0.1** `origin/dev` = `2010ccd5`, que es el merge de #149 (SLT-139). `git grep` en `origin/dev` de
  `cifrasModeloNuevo`, `derivarPagoEntregadoCierre`, `cifrasDelCierre`, `obtenerFilasConColumnas`,
  `findGestionesDeCierresEnAlcance`: cero resultados. Nada existía.
- **T0.2** Literales de `design.md > Verificación` comprobados leyendo el código: en el modelo nuevo el
  flete de cualquier resultado que no es `entregado` (G2 novedad) va a `ingreso_flete_devolucion`
  (`derivarIngresoModeloNuevo`), así que no entra en `pagoTiendaEmpresa` (recaudado − flete − comisión,
  con IVA) y sí en `ganaLaTienda` (recaudado − total facturado). Con eso: 94 350,00 · 7 910,00 · 910,00 ·
  92 090,00 · 3 500,00 (neto = sin IVA 7 000,00 − 3 000,00 − 500,00) · por tienda Norte 100 000,00 /
  94 350,00 / 94 350,00 y Sur 0,00 / 0,00 / −2 260,00 (recaudado por `computeTotales`, solo entregadas) ·
  pendiente 1 800,00 (marca `true`: P − pagado) y entregado 1 200,00. Todos casan; ninguno se ajustó.
  La siembra sigue el patrón de SLT-113 (`cierre_detail` + `cierre_detail_concepto` con `tarifa_modelo`
  `nuevo`); la comisión de G1 es 1 % sobre 100 000,00 (`modo: porcentaje`).
- **T0.3** Dobles que tipan `ICierresAdminRepository` ENTERO (los que el método obligatorio rompe),
  medidos con `pnpm run typecheck`: **12, todos fuera de `## Archivos esperados`**:
  `tests/unit/services/{cierres-admin-ajustar-pago, cierres-admin-aviso-rechazo,
  cierres-admin-confirmacion-fisica, cierres-admin-corregir-pagos, cierres-admin-corregir-resultado,
  cierres-admin-indemnizacion, cierres-admin-pendiente, cierres-admin-service, cierres-admin-tope-sin-gestion,
  CierresAdminService.aprobar.devolucion, indemnizacion-tope-negocio-cierre, liberacion-al-aprobar-cierre}.test.ts`.
  Los dos que el design anticipaba (`cierres-admin-completo`, `cierres-admin-filtro-estado`) usan
  `as unknown as` y NO hay que tocarlos. **PARO aquí (regla de T0.3)**: ver `## Bloqueo`.
  `e2e/_escenarios/cierres.ts` no siembra ningún cierre del modelo nuevo (cero `tarifaModelo`): T5 tendrá
  que añadir el escenario.
- **T0.4** Línea base de consultas de `listarHistoricoCierresAdminCompleto` con un conjunto SOLO viejo
  (V1), medida con el `CierresAdminService.ts` de `HEAD` antes del cambio: **7** (cierres, usuario, zona,
  señales, pagos vigentes, premios, conteo de bloqueo). Con el código nuevo: 7.

## Archivos

Producción (7):
- `lib/utils/cifras-cierre.ts` (nuevo): `cifrasDelCierre`, `SnapshotsCierre`, `CifrasCierre`.
- `lib/utils/pendiente-cierre.ts`: `derivarPagoEntregadoCierre`.
- `lib/services/CierresAdminService.ts`: `verCierreDetalle` llama a `cifrasDelCierre`;
  `conPendiente` → `conPendienteYEntregado` (mismas lecturas); `completoConCifras` en los dos
  `listar…Completo`; `toCifrasDescarga`, `basePendiente`, `reglaDelCierre` (módulo).
- `lib/repositories/CierresAdminRepository.ts`: `findGestionesDeCierresEnAlcance`.
- `lib/interfaces/repositories/ICierresAdminRepository.ts`: el método, OBLIGATORIO.
- `lib/interfaces/services/ICierresAdminService.ts`: `ParteDeTiendaDescargaDTO`, `CifrasCierreDescargaDTO`,
  `ExtraCifrasModeloNuevo`, `ConCifrasModeloNuevoEnOk`; los dos `…CompletoServiceResult`.
- `lib/types/cierres-admin.ts`: réplica de borde (`ConCifrasModeloNuevoEnOk` en los dos `…CompletoResult`).
  Ninguna acción ni schema cambia.

Tests (4):
- `tests/unit/utils/cifras-cierre.test.ts` (nuevo).
- `tests/unit/utils/pendiente-cierre.test.ts` (casos a–e nuevos; ninguna aserción existente tocada).
- `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` (nuevo).
- `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (nuevo).

Desviación menor del design (anotada): `entradaPendiente` es `basePendiente` + `reglaDelCierre` (el
nombre y la forma de `LiquidacionService`). Motivo: la guardia de SLT-139 en `pendiente-cierre.test.ts`
cuenta 6 llamadas literales `derivarPendienteCierre({` que nombran `pagadoPorSatelite` o
`reglaDelCierre(`; con una entrada armada fuera de la llamada esa guardia se ponía roja. Así queda verde
sin tocarla, y el pendiente y lo entregado siguen saliendo de la misma base y la misma regla.

## R → test (parte backend)

| R | Test |
|---|---|
| R377 | `cierres-resumen-modelo-nuevo-descarga-service.test.ts` (a) · integración (solo viejos: sin la clave, sin leer gestiones, 7 consultas) |
| R378 | `cierres-resumen-modelo-nuevo-descarga-service.test.ts` (b) |
| R379 | integración («Pagos ajustados» del Excel = el de la página; Gestiones = Σ grupos del detalle) |
| R380 | `cifras-cierre.test.ts` (literales) · integración (N1 y N2 contra literales y contra `verCierreDetalle`) |
| R381 | `cifras-cierre.test.ts` (partición y sumas) · integración (`partesPorTienda` = detalle sin `tiendaId`) |
| R382 | `pendiente-cierre.test.ts` (a–e) · servicio (c, d) · integración (1 200,00; satélite y `solicitado` → `null`) |
| R383 | integración (24 consultas con 1 y con 3 nuevos; 7 solo viejos; alcance en el WHERE; sin escrituras) · servicio (a, b, e) |

## Mutaciones (T3.2) — de una en una, revertidas con `git checkout`, `git diff -- lib` vacío tras cada una

| # | Mutación | Resultado | Lo mata |
|---|---|---|---|
| M1 | quitar `cierre: alcanceWhere(alcance)` de los dos `where` de la lectura en lote | MATADA | integración «el alcance va en el WHERE…» |
| M2 | la lectura en lote dentro de un bucle por cierre | MATADA | integración: 56 consultas frente a 24 · servicio (b): 2 llamadas |
| M3 | clasificar por `pagoIndependienteEfectivo` en vez de `incluyeModeloNuevo` | MATADA | integración N2 · servicio «la clasificación la da `incluyeModeloNuevo`» |
| M4 | `pagoEntregado` sin la puerta `esAccesoTotal` | MATADA | servicio (c) · integración satélite |
| M5 | `derivarPagoEntregadoCierre` sin los premios | MATADA | `pendiente-cierre.test.ts` (c) −500,00, (d), suma |
| M6 | `cifrasDelCierre` con `pagoTienda` desde `totalesIngreso.total` | MATADA | `cifras-cierre.test.ts`, servicio (b–d), integración N1/N2/S1 |

## Salidas (comandos de `docs/perfil-agentes.md`)

- `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`): **exit 2, 12 errores TS2322, todos en
  los 12 dobles de T0.3**; cero en `lib/` y en los tests nuevos.
- `pnpm run lint`: exit 0, 0 errores (251 warnings previos; ninguno en archivos de esta tanda).
- `vitest run` de los 4 archivos de la tanda: 4 files, 69 tests passed.
- Detalle y pendiente existentes, sin tocar aserciones: 27 archivos de `tests/unit/services` del servicio
  + `tests/unit/repositories/cierres-admin-repository.test.ts`: 27 files, 610 passed.
  Integración existente: `cierre-iva-aparte-sl39`, `cierre-reparto-porcentajes-sql-real`,
  `cierre-incluye-modelo-nuevo`, `slt123-pago-independiente`, `slt139-pago-satelite`,
  `cierre-detalle-cifras-fila-sql-real`, `cierres-gestiones-modelo-nuevo-descarga-sql-real`: verdes (74
  passed). `cierre-desglose-por-tienda-sql-real` y `cierre-rechazo-tienda-aprobacion` fallan en su
  `beforeAll` por diseño en una base sin órdenes («la tabla `orden` esta vacia»): el ambiente, no el cambio.
- `pnpm run test:guardias`: 4854 passed, 4 failed, todos en `dependencias-declaradas-presentes.guardia`
  (`init.sh` no cita `scripts/verificar-dependencias.mjs`). Ya roto en `origin/dev` (`9aa7e060`, sync del
  arnés 2.14.0); ajeno a esta tanda.
- `vitest related` de los 4 archivos de `lib/` se cortó a mano: arrastraba cientos de suites de
  integración ajenas que dependen de datos sembrados (memoria «nunca la suite completa»).

## Bloqueo (resuelto)

T2.1: el método obligatorio rompía 12 dobles fuera de `## Archivos esperados`. 2026-11-12, decisión del leader:
se aplica el arreglo mecánico (`findGestionesDeCierresEnAlcance: vi.fn` que lanza si se llama; ninguna
aserción tocada), los 12 entran en `## Archivos esperados` y T2.1 queda `[x]`. Typecheck en 0. Commit
`f653f15a`. Deuda anotada en `progress/features/SLT-140.md > Decisiones`: fábrica de dobles de
`ICierresAdminRepository`.

# Tanda frontend_dev: T4–T5 (2026-11-12/13)

MCP del grafo no usado (Grep/Read en el worktree, como la tanda backend).

## Archivos

Producción (5):
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts` (nuevo):
  `columnasCierresModeloNuevoPara` (20 central / 19 satélite), `filaCierreModeloNuevo`, `COLUMNAS_POR_TIENDA`,
  `filaPorTienda`.
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga.ts` (nuevo): `libroResumenCierres`,
  `obtenerResumenCierres`.
- `DescargarCierresButton.tsx`: `DescargaResumenCierres.obtenerFilasConColumnas?`; en «Resumen» el control
  la llama con las columnas marcadas; sin ella, `obtenerFilas` tal cual.
- `CierresAdminModule.tsx` (`descargaColaCierres` exportada, con `audiencia`) y
  `CierresAdminHistoricoLista.tsx` (`descargaHistoricoCierres` con `audiencia`): añaden
  `obtenerFilasConColumnas`; `titulo`, `columnas`, `ambitoColumnas` y `obtenerFilas` sin cambios.

Tests y E2E (5):
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (nuevo, 17).
- `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` (nuevo, 7: a×2, b×2, c, d, e).
- `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`: los dos módulos nuevos en `SUBARBOL`.
- `e2e/_escenarios/cierres.ts`: `cierreModeloNuevo(browser, r, { cobro, pago, montoCobrar })` (activa
  tarifas por la pantalla, entrega en efectivo y solicita).
- `e2e/cierres-rediseno.spec.ts`: describe «SLT-140 — el «Resumen» de /cierres-admin con un cierre viejo y uno
  nuevo» (escenario B + pago parcial de 1.200 desde la fila).

Desviaciones menores del design (anotadas):
- El folio lo calcula el LIBRO (`folioCierre(item.cierreId)`) y llega a la proyección ya hecho: la guardia
  `columnas-sensibles` ejecuta cada export de un `*-descarga-columnas.ts` con una sonda y rechaza leer
  `cierreId` (identificador interno). Por la misma sonda (un solo argumento), las proyecciones reciben UN
  objeto: `filaCierreModeloNuevo({ folio, item, cifras }, audiencia)` y `filaPorTienda({ folio, parte })`
  (una fila por parte, en vez de `filasPorTienda(item, cifras)`).
- «Pago entregado» vacío en «Pendientes» (PA2) sale del `null` del servidor (un cierre no aprobado no lo
  tiene); el cliente no ramifica por pestaña.

## R → test (parte cliente; la de servidor, arriba)

| R | Test |
|---|---|
| R377 | componente (a) «Pendientes» y (a) «Resueltos»/satélite: `toEqual` al literal de hoy, sin `tituloHoja` ni `hojasAdicionales`; (e) sin el campo, `obtenerFilas()` sin argumentos · unit `libroResumenCierres` `null` sin cifras y solo viejos · unit `obtenerResumenCierres` solo viejos = `filasDesdeResultado` |
| R378 | unit «solo nuevos», «mixto», «un cierre nuevo sin sus cifras es un error» · componente (b), (c) · E2E SLT-140 (hojas en orden) |
| R379 | unit encabezados 20/19 y «Por tienda» · unit N1 (folio, fechas en CR, Gestiones, Pagos ajustados) y N2 (vacíos) · E2E (encabezados de «Cierres» y «Por tienda») |
| R380 | unit `formato: "monto"` · unit N1 contra literales · unit «el string del servidor TAL CUAL» (señuelo) · unit −2260.00 con signo · E2E (números de Excel: 10000, 6497, 3503, 403, 900) |
| R381 | unit «solo nuevos» (dos filas de N1 en el orden del detalle) · E2E (una fila de «Por tienda») |
| R382 | unit satélite sin la clave · componente (d) 19 columnas · componente (b) «Pendientes» con «Pago entregado» `null` · E2E «Pago entregado» 1200 |

## Mutaciones (cliente) — de una en una, restauradas desde copia y `md5sum -c` OK tras cada una

| # | Mutación | Resultado | Lo mata |
|---|---|---|---|
| C1 | el viejo recibe el libro: `esModeloNuevo` = `incluyeModeloNuevo !== undefined` | MATADA (4) | componente (c) · unit «solo viejos», «mixto», `obtenerResumenCierres` con nuevos |
| C1' | quitar `if (nuevos.length === 0) return null` | MATADA (1) | unit «solo cierres viejos: `null`» (el componente no la ve: sin cierres nuevos el servidor no manda `cifras`) |
| C2 | «Pago entregado» relleno: `cifras.pagoEntregado ?? "0.00"` | MATADA (2) | componente (b) «Pendientes» · unit N2 |
| C3 | «Le queda a la empresa» calculada en el cliente con `Number(...)` y `toFixed(2)` | MATADA (1) | unit «el string del servidor TAL CUAL» (con N1 todo cuadra y la sobrevivía: por eso el señuelo) |

## Salidas

- `pnpm run typecheck`: exit 0 (tras los 12 dobles y tras T4–T5).
- `pnpm run lint`: exit 0, 0 errores, 251 warnings (los mismos de antes; ninguno en archivos de esta tanda).
- vitest (base `slt140_excel`): los 2 nuevos 24/24; frontera + columnas-sensibles + nuevo 28/28; existentes de
  descarga (`CierresDescargaNiveles`, `CierresDescargaColumnas`, `CierresDescarga`,
  `DescargarGestionesModeloNuevo`, `DescargarDatasetLibro`, `tests/unit/descarga`) 54 archivos / 551 verdes sin
  tocar aserciones; filtro final (nuevos + descarga + `tests/unit/services`) 403 archivos / 8158 verdes.
- `pnpm run test:guardias`: 4854 passed, 4 failed, todos en `dependencias-declaradas-presentes.guardia` (ya roto
  en `origin/dev`, ver arriba).
- E2E, base desechable nueva (`migrate deploy` + `db:seed` + `prisma generate` + `next build` por separado,
  `NEXT_PUBLIC_APP_URL=http://localhost:3000`, puerto 3000, candado `e2e.lock`): describe SLT-140 1/1; grupo
  `dinero` entero **108/108** (`cierres-rediseno` entero dentro: 19/19), 5.4 min.

## Veredicto

T0–T5 hechas y verdes; T6 (cierre, implementer) pendiente.
