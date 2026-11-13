# SLT-113 «Excel del modelo nuevo de cierres» — bitácora de implementación

## T0, T2, T3 · backend_dev · 2026-11-12

Rama `feature/SLT-113-excel-modelo-nuevo-cierres`, al día con `origin/dev` (sin merge necesario).
Base desechable `slt113_excel` (base nueva + `prisma migrate deploy` + `db:seed`). No hizo falta
añadirle `pago_satelite` ni nada de SLT-139. MCP del grafo: este worktree no está indexado; todo por
Grep/Read.

### T0 — comprobaciones

- **T0.1** `git grep` en `origin/dev` (lib, app, components): `cierreModelo`, `folioCierre`,
  `tituloHoja`, `libro?:` sin resultados. `rechazosDeTienda` solo existe en el detalle de un cierre
  (`cierre-dia`), no en la hoja fundida. Nada hecho ni en vuelo.
  **Hallazgo:** `lib/utils/folio-cierre.ts` y `tests/unit/utils/folio-cierre.test.ts` YA existían
  (SLT-138, `normalizarFolio`). El spec los da por «nuevos»: se AÑADE `folioCierre` al módulo y dos
  casos al test, sin tocar lo de SLT-138.
- **T0.2** Literales, leyendo `derivarIngresoModeloNuevo`, `toIngresoEmpresa`, `toPagoPorTarifa`,
  `tarifaFaltanteDe` y `CATALOGO_CONCEPTOS` (no ejecutando):
  - A: flete 3 500,00 (monto) → IVA 13 % = 455,00; comisión 2 % de 25 000,00 = 500,00 → IVA 65,00;
    `total` = 4 520,00; `ivaIncluido` = 520,00; fulfillment 600,00 → IVA 78,00; pago congelado del
    mensajero 2 500,00 y `pagoMensajero` 1 800,00 → ajuste `{ resta, 700.00 }`. Casan con el design.
  - B (novedad): `tienda_flete_novedad` 1 500,00 → IVA 195,00; `total` 1 695,00; `ivaIncluido` 195,00.
    `mensajero_novedad` EXISTE en el catálogo → sin fila congelada del mensajero, `tarifaFaltante`
    = true. Casa.
  - C (viejo): 2 000,00 + 260,00 + 300,00 (3 %) + 39,00 = 2 599,00. Fechas: cargo 02:30 UTC del 07 →
    «2026-11-06» en CR; R1 03:00 UTC del 06 → «2026-11-05».
  - **No casa — corpus de alcance del design:** pide «rechazos con el alcance de la central: [R1]»
    y «con S: [R1]» sobre el MISMO N1. Imposible: `alcanceWhere` del acceso total es
    `destinoTipo = bodega_central` (sin zona) y el de S es `bodega_satelite` + su zona; los
    conjuntos son disjuntos (feature 230 §2.6), y N1 tiene que ser satélite para consolidarse en
    bodega. No toca ningún importe ni puerta: se corrigió el CORPUS, no el código. N1 es satélite
    Centro; la central tiene su propio N5 (`bodega_central`) con R6. Y «S sin rango: [R1]» tampoco
    casa con «con rango, R4 no está» (sin rango R4 SÍ sale): la aserción es `[R1, R4]` sin rango y
    `[R1]` con noviembre. Para el leader / spec_author.
- **T0.3** Dobles: los de `CierresAdminService.gestiones-completo` y
  `CierresBodegaAdminService.gestiones-completo` van `as unknown as` → no exigen el método nuevo y
  no se tocaron. **Pero otros 13 tests de servicio tipan su doble como `ICierresAdminRepository` /
  `ICierresBodegaAdminRepository` entero** (fuera de `## Archivos esperados`): recibieron UNA línea
  cada uno, `findRechazos…: vi.fn(async () => [])` (no-op, ninguna aserción cambia). Lista abajo.
  `e2e/_escenarios/cierres.ts` crea los cierres por servicio (`solicitarCierre`): no fija modelo ni
  siembra rechazos de tienda → T5 tendrá que ampliarlo (frontend_dev).

### Archivos

Producción (modificados):
- `lib/interfaces/services/ICierresAdminService.ts` — campos opcionales del DTO, `CierreGestionDescargaRow`
  (los seis campos nuevos OBLIGATORIOS: es lo que emite el repositorio), `RechazoTiendaDescargaDTO`,
  `ConRechazosDeTiendaEnOk`, `ListarGestionesDescargaServiceResult`.
- `lib/types/cierres-admin.ts`, `lib/types/cierre-bodega.ts` — tipos de borde con `rechazosDeTienda?`.
- `lib/interfaces/repositories/ICierresAdminRepository.ts`, `ICierresBodegaAdminRepository.ts` —
  retorno `CierreGestionDescargaRow[]` y los métodos de rechazos.
- `lib/repositories/CierresAdminRepository.ts` — `AJUSTES_PAGO_MENSAJERO_SELECT` y
  `PAGOS_CONGELADOS_MENSAJERO_SELECT` (una declaración para detalle y descarga); helpers con `Pick`;
  `toGestionDescargaDTO` con modelo y cargo obligatorios; `cierresDelModeloNuevo`;
  `componerGestionesDescarga(…, cargoPorOrden)`; `ORDEN_DETALLE_DESCARGA` (orden determinista de
  `cierre_detail`); `RECHAZO_TIENDA_DESCARGA_SELECT`, `toRechazoTiendaDescargaDTO`,
  `CIERRE_NUEVO_CON_GESTIONES`, `ORDEN_RECHAZOS_DESCARGA`; `findRechazosTiendaModeloNuevoCompleto`.
  Cargos de fulfillment solo con ids de cierres nuevos (sin ninguno, cero consultas).
- `lib/repositories/CierresBodegaAdminRepository.ts` — lo mismo para bodega; `cierreRechazoTienda`
  entra al `Pick` del cliente (solo lectura).
- `lib/services/CierresAdminService.ts`, `CierresBodegaAdminService.ts` — rechazos solo si hay un
  cierre nuevo, después del tope; `fulfillmentCargadoDia: null` para quien no es acceso total.
- `lib/utils/folio-cierre.ts` — `folioCierre(id)` (junto a `normalizarFolio` de SLT-138).
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `folioDe` delega en `folioCierre`.

Tests:
- Nuevos: `tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts`,
  `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts`.
- Ampliado: `tests/unit/utils/folio-cierre.test.ts` (dos casos de SLT-113).
- **Fuera de la lista del spec:**
  - `tests/unit/repositories/cierres-admin-gestiones-where.test.ts` — el literal «detalle menos
    descarga» deja de listar `ajustesPagoMensajero` y `pagosCongelados` (decisión del design
    §Servidor 2) y fija que las dos proyecciones comparten la MISMA constante (`toBe`).
  - Una línea no-op en 13 dobles: `CierresAdminService.aprobar.devolucion`,
    `cierres-admin-ajustar-pago`, `-aviso-rechazo`, `-confirmacion-fisica`, `-corregir-pagos`,
    `-corregir-resultado`, `-indemnizacion`, `-pendiente`, `-service`, `-tope-sin-gestion`,
    `cierres-bodega-admin-service`, `indemnizacion-tope-negocio-cierre`,
    `liberacion-al-aprobar-cierre` (todos en `tests/unit/services/`).
  - Con eso el PR pasa de los 31 archivos del plan a ~45: **supera los 40 de PA7**. Decide el leader
    con Carlos.

### Mapa R → test (backend)

| R | Test |
|---|---|
| R370 | integración «gestion C (cierre viejo)…» (modelo viejo: cifras de hoy, sin fecha ni pago por tarifa) · servicio (a) «todo viejo → sin rechazos ni clave» (admin y bodega) · `cierres-admin-gestiones-where.test.ts` |
| R371 | integración «gestion A» (`cierreModelo` nuevo), «D, con fila congelada VIEJA dentro de un cierre mixto…» (mutación «primera fila») |
| R372 | servicio (a), (b), (d) en los dos servicios |
| R373 | integración «rechazos — central [R6]; satelite sin rango [R1, R4]; con noviembre [R1]…» y «cierres de bodega…» (orden y conjunto) |
| R374 | integración «gestion A», «gestion B», «A, B y D salen con las MISMAS cifras que el detalle…» (paridad con `findCierreByIdEnAlcance`), «la lectura … no escribe» |
| R375 | integración «gestion A» (folio «ABCD1234», día del cargo «2026-11-06»), «rechazos…» (fecha «2026-11-05»), «con solo cierres viejos no se consulta `orden_fulfillment_movimiento`…» · `tests/unit/utils/folio-cierre.test.ts` |
| R376 | servicio (c) |

### Mutaciones (T3.2): aplicar, correr, anotar, revertir (copia de respaldo + `cmp`)

Contra la integración (M*) o el test de servicio (S*):

| id | mutación | resultado | cae |
|---|---|---|---|
| M1 | quitar `detalle: { some: { tarifaModelo: "nuevo" } }` del `where` de rechazos | MATADA | «rechazos…» (sale R2), «cierres de bodega…» |
| M2 | quitar el alcance del `where` de rechazos | MATADA | «rechazos…» (la central ve R1, R4, R7…) |
| M3 | quitar `filtrosWhere` del `where` de rechazos | MATADA | «rechazos…» (con noviembre sale R4) |
| M4 | clasificar el cierre por su PRIMERA fila | MATADA | «gestion A», «gestion B», «D…», paridad |
| M5 | no pasar el cargo a `toIngresoEmpresa` | MATADA | «gestion A» (`fulfillmentCargadoAt`), paridad |
| M6 | quitar `actor = mensajero` de `pagosCongelados` | MATADA | «gestion A» (900,00), «gestion B», «bodega» |
| M7 | folio del id de la orden | MATADA | «gestion A» |
| M8 | `ajustesPago: []` | MATADA | «gestion A», paridad |
| M9 | `tarifaFaltante: false` | MATADA | «gestion B», paridad |
| M10 | día del cargo por recorte del ISO | MATADA | «gestion A» («2026-11-07»), «bodega» |
| M11 | `pagoPorTarifa: null` | MATADA | «gestion A», paridad, «bodega» |
| M12 | quitar `gestiones: { some: {} }` | MATADA | «rechazos…» (sale R7) |
| M13 | pasar el cargo también en cierres viejos | MATADA | «gestion C» (la orden de C también está en N3 y tiene cargo) |
| M14 | quitar `cierreBodegaId not null` de rechazos de bodega | MATADA | «cierres de bodega…» |
| M15 | fecha del rechazo por recorte del ISO | MATADA | «rechazos…» («2026-11-06») |
| S1 | quitar la condición «algún cierre nuevo» (admin) | MATADA | servicio (a) |
| S2 | quitar el `null` de `fulfillmentCargadoDia` | MATADA | servicio (c) |
| S3 | quitar la condición «algún cierre nuevo» (bodega) | MATADA | servicio bodega (a) |

Primera pasada: M13 sobrevivió (el mapa de cargos solo traía órdenes de cierres nuevos) → se
añadió al corpus la orden de C congelada también en N3 con un cargo. Y la autocomprobación leía
`cierre_detail` sin `ORDER BY` (orden físico no determinista): se añadió `ORDEN_DETALLE_DESCARGA`
a la lectura y la orden D con el id más bajo, para que «primera fila» sea determinista. Tras los
cambios, las 18 vuelven a caer; `git diff` de `lib/` igual al de antes de cada mutación.

  - `tests/unit/repositories/cierres-gestiones-descarga-dto.test.ts` — su fila de gestión de mentira
    gana `ajustesPagoMensajero: []` y `pagosCongelados: []` (la proyección los lee ahora; sin ellos
    `toPagoPorTarifa` leía `undefined[0]`). Ninguna aserción cambia.

### Salidas (todas con `DATABASE_URL` exportada a `slt113_excel`, salvo donde se dice)

- **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): exit 1/2 con 4 errores,
  TODOS fuera de este diff y del cliente compartido de Prisma que SLT-139 regenera con
  `pago_satelite` (`PagoMensajeroMovimientoCategoria`): `EstadoCuentaRepository.ts(545,558)`,
  `PagoMensajeroMovimientoRepository.ts(50)`, `lib/types/wallet-mensajero.ts(67)`. Un worktree
  temporal en `HEAD` (sin este diff) da los MISMOS 4 con el mismo cliente (y 0 cuando el cliente
  estaba en el de dev): no son de esta rama. Ningún error en archivos de SLT-113.
- **Lint** (eslint sobre los archivos tocados): 0 errores, 4 avisos `_args` ya existentes en dos
  tests de dobles.
- **Unitarios**: `vitest run tests/unit/repositories tests/unit/services tests/unit/descarga
  tests/unit/utils/folio-cierre.test.ts tests/components/descarga
  tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts` → 593 archivos, 10 815
  tests, todos verdes.
- **Integración**: `cierres-gestiones-modelo-nuevo-descarga-sql-real` (11) + las dos de SLT-110
  `cierre-{bodega,detalle}-cifras-fila-sql-real` (17) → 28 passed, ninguno skipped. La nueva, tres
  veces seguidas en verde.
- **`vitest related`** sobre los archivos de producción tocados: 500 archivos, 59 tests rojos en 133
  archivos, TODOS de integración que exigen datos que la base desechable no tiene (`tabla orden
  vacia: corre db:seed`, `faltan la zona central…`, `usuario esta vacia`) y sus `TypeError` en
  cascada. El único rojo de unidad (`cierres-gestiones-descarga-dto`) era de este diff y está
  arreglado arriba.
- **Guardias** (`pnpm run test:guardias`): 343/344 archivos; el rojo es
  `dependencias-declaradas-presentes.guardia.test.ts` (lee `init.sh` del worktree), igual en el
  worktree temporal de `HEAD`: no es de esta rama.
  **Desliz anotado:** la PRIMERA corrida de guardias salió sin exportar `DATABASE_URL`, así que sus
  tests de integración leyeron la URL del `.env` (la base de desarrollo). Esas suites trabajan en
  transacción revertida; se repitió con la desechable. Avisar al leader.

### Veredicto

T0, T2 y T3 hechas: servidor de la hoja «Gestiones» y de «Rechazados por la tienda» con alcance en
el WHERE, 18/18 mutaciones matadas; quedan para el leader el corpus de alcance del design (no
casaba) y los ~14 archivos de test fuera de la lista (PR > 40 archivos).
