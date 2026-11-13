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

## T1, T4, T5 · frontend_dev · 2026-11-12

Rama al día con `origin/dev` (sin merge). Base desechable de unitarios `slt113_excel`; base E2E nueva
`slt113_e2e_1` (generate + migrate deploy + db:seed + next build por separado, como `gate.yml`). No hizo
falta `pago_satelite` en ninguna base. MCP del grafo: no usado (worktree sin indexar); Grep/Read.

### Archivos

Producción:
- `lib/types/descarga.ts` — `DescargaConfig.tituloHoja?`.
- `lib/utils/descarga-dataset.ts` — `nombreHoja(config.tituloHoja ?? titulo)` en hoja única, libro y
  guardia de límite; el nombre de archivo sigue en `titulo`.
- `components/shared/DataTable.tsx` — `DescargaFilasResult.libro?: { hojas: [DescargaHoja, ...] }`.
- `components/shared/DescargarDatasetButton.tsx` — rama `libro` (siempre xlsx, sin selector); sin
  `libro`, la rama de hoy sin cambiar una línea.
- `components/private/cierres/fila/fila-gestion-vista.ts` — `GestionConSenales` (`Pick` de seis campos)
  en `senalesDe` / `textoSenales`.
- NUEVO `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts` —
  columnas (35 central / 32 satélite) y proyecciones de «Gestiones» y «Rechazados por la tienda».
- NUEVO `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga.ts` — `libroGestiones`.
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx` — una llamada a la acción; libro si
  hay cierre nuevo; prop `audiencia` (ausente = `satelite`); `AccionGestionesDescarga` admite
  `rechazosDeTienda?` en `ok`.
- `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx` — pasa `audiencia`.

Tests:
- NUEVOS: `tests/unit/descarga/descarga-titulo-hoja.test.ts` (3),
  `tests/components/descarga/DescargarDatasetLibro.test.tsx` (3),
  `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` (15),
  `tests/components/descarga/DescargarGestionesModeloNuevo.test.tsx` (4).
- `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts` — los dos módulos nuevos en
  `SUBARBOL`, su pureza y `RechazoTiendaDescargaDTO` sin ids ni evidencia.
- `tests/unit/guards/estado-con-info.guardia.test.ts` — FUERA de la lista: una excepción `descarga` para
  la celda «Resultado» de «Gestiones» (igual que la de la hoja fundida).
- `e2e/cierres-rediseno.spec.ts` — describe SLT-113 (cierre viejo + nuevo en la misma empresa). No hizo
  falta tocar `e2e/_escenarios/cierres.ts`: el viejo se solicita antes de activar las tarifas de B.

### Desviaciones del design (para el leader)

1. **Dos módulos en vez de uno.** Un archivo que declara `: DescargaColumna[] =` tiene que llamarse
   `*-descarga-columnas.ts` (`columnas-sensibles.guardia`), y esa guardia ejecuta cada función exportada
   con una sonda: `libroGestiones` devuelve `null` con ella y la guardia lo rechaza. Columnas y
   proyecciones van en `…-descarga-columnas.ts` (la guardia de datos sensibles las cubre); el libro, en
   el nombre del design. En `textoTarifa`, una plantilla sobre `t.valor` para que la sonda llegue como su
   marcador (no cambia un string).
2. **Encabezados del flete de no entregadas.** «Flete de no entregadas» lo rechaza
   `nombres-estado-retirados.guardia` (participio plural). Se usa el rótulo aprobado de R65 de SLT-54,
   `FLETE_NO_ENTREGADAS_LABEL`: «Flete de gestiones no entregadas», «Tarifa del flete de gestiones no
   entregadas», «IVA del flete de gestiones no entregadas». Si Carlos prefiere otro texto, es una línea.
3. **Diálogo:** la llamada sigue siendo `filasDesdeResultado(accion(…))` (lo fija
   `cierres-descarga-detallada-puerta.test.ts`); la respuesta se guarda en el `.then` para armar el libro.
4. **Motivo** de «Gestiones» = `motivoGestionLegible` (el rótulo de la hoja de hoy), no el slug crudo.

### Mapa R → test (cliente)

| R | Test |
|---|---|
| R370 | `DescargarGestionesModeloNuevo.test.tsx` (a) · `DescargarDatasetLibro.test.tsx` (b, c) · `descarga-titulo-hoja.test.ts` (sin `tituloHoja`) · `cierres-gestiones-modelo-nuevo-descarga.test.ts` («todo viejo → null», «sin cierreModelo → null») · existentes sin tocar, verdes |
| R371 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` («el modelo es del CIERRE…», «sin cierreModelo → null») |
| R372 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` (`libroGestiones`) · `DescargarGestionesModeloNuevo.test.tsx` (b, c) · `descarga-titulo-hoja.test.ts` · `e2e/cierres-rediseno.spec.ts` (hojas) |
| R373 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` (encabezados, hoja vacía) · `DescargarDatasetLibro.test.tsx` (a: el selector no se aplica) |
| R374 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` (celdas A y B, vacías, «Ajuste» `-700.00`, `formato`, «ningún importe se recalcula») · `e2e/cierres-rediseno.spec.ts` (3503 y 2200 como número) |
| R375 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` (texto de tarifa con origen, folio, día del cargo) |
| R376 | `cierres-gestiones-modelo-nuevo-descarga.test.ts` (32 columnas de la satélite) · `DescargarGestionesModeloNuevo.test.tsx` (d) |

### Mutaciones (copia en el scratchpad + `cmp`; ninguna con el gate corriendo)

| id | mutación | resultado | cae |
|---|---|---|---|
| F1 | el generador ignora `tituloHoja` | MATADA | `descarga-titulo-hoja` (2 casos) |
| F2 | el botón sin libro añade `tituloHoja: titulo` a su llamada | MATADA | `DescargarDatasetLibro` (b) |
| F3 | el modelo viejo recibe el libro (`cierreModelo !== undefined`) | MATADA | unit «todo viejo → null», «mixto…»; componente (a), (c) |
| F4 | «Se le cobra a la tienda» sumado en el cliente con `Number(…).toFixed(2)` | MATADA | unit «ningún importe se recalcula» |
| F5 | clasificar por el modelo de la FILA (`ingresoEmpresa.tarifaModelo`) | MATADA | unit «el modelo es del CIERRE…» |
| F6 | E2E: libro desactivado en el diálogo (`false ? libroDe(…) : null`), build aparte | MATADA | E2E: hojas `["Gestiones de cierres"]` en vez de las tres |

### Salidas

- **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`, tras el `prisma generate`
  del E2E): `TC_EXIT=0`, 0 errores. Antes del generate: los 4 ajenos de SLT-139 de siempre y ninguno más.
- **Lint** (eslint sobre los archivos tocados y el spec E2E): 0 errores; 1 aviso `_recorte` sin usar en
  un doble (mismo patrón que `DescargarGestionesDialog.test.tsx`).
- **Unitarios y componentes** (`DATABASE_URL` → `slt113_excel`; `vitest run tests/unit/descarga
  tests/components/descarga tests/unit/guards` + `fila-gestion-vista`, `descarga-dataset`,
  `descarga-varias-hojas-464`, `folio-cierre`, `DescargarDataset`): 319 archivos, 4230 passed,
  1 skipped, 4 failed — los 4 de `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`
  (lee `init.sh`; ni `init.sh`, ni `scripts/`, ni ese test cambian en esta rama: ajeno).
- **E2E** (candado tomado 21:20:04, liberado 21:30:30; puerto 3000; `NEXT_PUBLIC_APP_URL` y
  `APP_BASE_URL` = `http://localhost:3000`): `prisma generate` a las 21:20:37 y otra vez a las 21:25:58
  (otra sesión regeneró el cliente compartido y el build de la mutación cayó por tipos de
  `EstadoCuentaRepository`). Builds: 21:20:56→21:22:46 (verde), F6 →21:27:51, final →21:30:07.
  `playwright test e2e/cierres-rediseno.spec.ts --project=dinero -g "SLT-113"`: 1 passed; 1 failed con
  F6; 1 passed tras revertir. El spec entero y el grupo `dinero` quedan para T6.

### Veredicto

T1, T4 y T5 hechas: libro de tres hojas en el «Detalle» con el archivo viejo idéntico, 6/6 mutaciones
matadas y E2E verde; para el leader, las desviaciones 1 y 2 (módulo partido por la guardia y rótulo de
R65 en el flete de no entregadas).

## Arreglos review 1 · frontend_dev · 2026-11-12

Antes: `git pull --ff-only` (al día), `git fetch`, árbol limpio; `origin/dev` había avanzado (SLT-112
«ganancia del mensajero en servidor») y se mergeó sin conflictos.

### Archivos
- `e2e/cierres-rediseno.spec.ts` (H1): el monto del cierre viejo pasa de 20000 a 18000 (`montoCobrar` y
  el pago en efectivo). 20000 es `UMBRAL_AVISO_FILAS_CORRIDA` y R47 (b) de `rollup-guards` lo prohíbe
  fuera de `lib/config/analitica-rollup.ts`. 18000 no es ninguna constante del código (grep: solo
  ejemplos de OpenAPI y fixtures de tests). Ningún otro literal del E2E dependía de él: del cierre viejo
  solo se afirma que su guía va en «Gestiones modelo anterior» y no en «Gestiones».
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts` (H5): el
  comentario de `textoTarifa` dice «Monto fijo <importe> · …» en vez de un literal de moneda.
- `specs/SLT-113-excel-modelo-nuevo-cierres/design.md` (H3): corpus de rechazos alineado con el test —
  central [R6]; satélite S [R1, R4] sin rango y [R1] con noviembre; bodega [R1]; nunca R2, R3, R5, R7 —
  con el porqué (`alcanceWhere`: la central solo ve `bodega_central`, la satélite su zona).
- `specs/SLT-113-excel-modelo-nuevo-cierres/tasks.md`: T6.2 `[x]` con evidencia. T6.1 y T6.4 quedan
  para el leader.

### Salidas
- `vitest run tests/unit/analytics/rollup-guards.test.ts`: 21 passed (21), EXIT=0.
- `pnpm run test:guardias` (`DATABASE_URL` → `slt113_excel`): Test Files 1 failed | 343 passed (344);
  Tests 4 failed | 4854 passed | 1 skipped. Los 4 rojos, todos de
  `dependencias-declaradas-presentes.guardia.test.ts` (baseline). EXIT=1 solo por esa baseline.
- `eslint` de los dos archivos de código tocados: EXIT=0.
- `tsc --noEmit` (con 8 GB; con el default se queda sin memoria): 4 errores, los ajenos conocidos del
  enum `pago_satelite` (SLT-139) en `EstadoCuentaRepository.ts` (2), `PagoMensajeroMovimientoRepository.ts`
  y `wallet-mensajero.ts`. Ninguno en archivos de esta feature.
- E2E (candado `e2e.lock` tomado 21:56:12, liberado 22:08:06; puerto 3000; base desechable NUEVA
  `slt113_e2e_r1`; `NEXT_PUBLIC_APP_URL=http://localhost:3000`; sin `demo-qa`):
  - `prisma generate` 21:56:46→21:56:54; `migrate deploy` verde; `db:seed` verde.
  - Primer `next build`: ROJO por los tipos de `pago_satelite`: otra sesión (SLT-139) regeneró el
    cliente compartido a las 21:57:14, entre mi generate y mi build.
  - Segundo `prisma generate` 21:59:37→21:59:45 (cliente sin `pago_satelite`) y `next build` inmediato:
    verde, 22:01:53. Durante el build, otra sesión volvió a regenerar el cliente (22:00:25, con
    `pago_satelite`). La única diferencia estructural entre los dos esquemas es ese valor del enum (diff
    normalizado), así que el runtime de `next start` no cambia para esta base.
  - `playwright test --project=dinero` 22:02:17→22:07:50: **107 passed**, EXIT=0. Dentro,
    `cierres-rediseno.spec.ts` **18/18** (el `--list` del archivo da 18), con el test de SLT-113 verde.
- Tamaño tras el merge: 51 archivos, +4300 −79 contra `origin/dev` (aceptado hasta 52).

### Veredicto
H1, H3 y H5 cerradas; guardias solo con la baseline; `dinero` 107/107 y `cierres-rediseno` 18/18 en local.

## Gate del leader (2026-11-12)
- Tras `npx prisma generate` desde este worktree (22:15:30), `./init.sh` con la base slt113_excel: `INIT_EXIT=0` (log `scratchpad/gate-113.log`). Tamaño medido por el gate: 45 archivos (la cifra 51 de T6.2 contaba specs/progress).
