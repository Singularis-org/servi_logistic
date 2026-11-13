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

## Bloqueo

T2.1 queda abierta: el método obligatorio rompe 12 dobles fuera de `## Archivos esperados` (T0.3 manda
parar). Arreglo propuesto, mecánico y sin tocar ninguna aserción: una línea por doble,
`findGestionesDeCierresEnAlcance: vi.fn(async () => { throw new Error("SLT-140: este doble no lee gestiones en lote"); })`.
Sube el tamaño de 25 a 37 archivos (por encima del 80 % de 40) y +36 líneas. Decide el leader.

## Veredicto

T0–T3 hechas y verdes salvo T2.1: typecheck rojo solo por los 12 dobles pendientes de decisión.
