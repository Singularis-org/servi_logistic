# SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» — bitácora de implementación

## Tanda 1 — backend_dev: T0 y T1 (2026-11-13)

Rama `feature/SLT-141-excel-hojas-cierre-bodega`, con `origin/dev` (9221c836, merge de #150) ya
mergeado en e37f1f79. MCP del grafo: no usado; todo con Grep/Read.

### T0.1 — Comprobaciones en `origin/dev` (`git fetch` + `git grep`)

- **(a) cumple.** SLT-139 «Pago al mensajero independiente del efectivo: satélite» (#149, 2010ccd5) y
  SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (#150, 9221c836) están en `dev`.
  `sumarPagadoSatelitePorCierre` existe (`IPagoMensajeroMovimientoRepository.ts:246`,
  `PagoMensajeroMovimientoRepository.ts:410`).
- **(b) no existe todavía.** `cifrasModeloNuevo` solo lo emite el lado de mensajeros
  (`CierresAdminService.ts`, `ICierresAdminService.ts`, `lib/types/cierres-admin.ts`,
  `cierres-resumen-modelo-nuevo-descarga.ts`). Nada en `CierresBodega*`, `CierreBodega*` ni
  `cierre-bodega.ts`; ninguna hoja «Cierres» de bodega. Se sigue.
- **(c) lo que exporta SLT-140 y qué se reusa:**
  - **Se reusa — cifras:** `cifrasDelCierre` (`lib/utils/cifras-cierre.ts`). El bloque agregado de
    `verCierreBodegaDetalle` era, función por función y argumento por argumento, el mismo:
    `cifrasAgregadasBodega` (firma del design) delega en ella con los snapshots AGREGADOS del cierre
    de bodega. `CifrasAgregadasBodega` es alias de `CifrasCierre` (mismos ocho campos del design).
  - **Se reusa — «Pago entregado» (PA1):** `derivarPagoEntregadoCierre` (`lib/utils/pendiente-cierre.ts`)
    = `(P + premios vivos) − pendiente`, con la misma entrada que `derivarPendienteCierre`. Para T2.3:
    por cierre del día se llama a esta función (no a `P − pendiente` escrito aparte) y se suma con
    `Prisma.Decimal`. En BN da lo mismo (sin premios). Lo anoto porque el design dice «`P −
    derivarPendienteCierre(...)` (o la pieza de SLT-140)»: se toma la pieza de SLT-140, como pide la
    herencia `progress/features/SLT-140.md > Lo que hereda SLT-141`.
  - **Se reusa — «Por tienda» (T4):** `COLUMNAS_POR_TIENDA` y `filaPorTienda({ folio, parte })` de
    `cierres-resumen-modelo-nuevo-descarga-columnas.ts`: mismas cinco columnas y encabezados que el
    design de bodega. `parte` es `ParteDeTiendaDescargaDTO` (`tiendaNombre`, `recaudado`,
    `pagoTienda`, `ganaLaTienda`); `ParteDeTienda` lo satisface estructuralmente.
  - **Se reusa — nombres de hoja:** `HOJA_CIERRES`, `HOJA_POR_TIENDA`, `HOJA_CIERRES_ANTERIOR` de
    `cierres-resumen-modelo-nuevo-descarga.ts`.
  - **Se reusa — columnas marcadas (PA3):** `DescargaResumenCierres.obtenerFilasConColumnas?` de
    `DescargarCierresButton.tsx:164` (su comentario ya dice «bodega hasta SLT-141»).
  - **No se reusa:** `columnasCierresModeloNuevoPara` / `filaCierreModeloNuevo` (son las 20 columnas
    de mensajeros sobre `CierreAdminResumen`; bodega tiene 26/25 sobre `CierreBodegaResumen`), y
    `libroResumenCierres` / `obtenerResumenCierres` (tipados a `CierreAdminResumen`). T4 escribe las
    de bodega en `cierres-bodega-modelo-nuevo-descarga-columnas.ts` y `…-descarga.ts`.
  - **Nota para T4:** la audiencia de SLT-140 es `AudienciaDescargaGestionesFundida` con valor
    `"admin"` para la central, no `"central"` como escribe el design de bodega. Decide frontend_dev.

### T0.2 — Literales de `design.md > Verificación`, a mano (leyendo, sin ejecutar)

Leídas: `derivarIngresoOrden` (modelo nuevo: flete de entregado a `ingreso_flete`, de cualquier otro
resultado a `ingreso_flete_devolucion`; comisión solo en entregado), `totalesIngresoEmpresa` (suma
por concepto, `null` no aporta), `ivaFacturado`/`facturadoSinIva`, `netoEmpresa`, `ganaLaTienda`,
`pagoTiendaEmpresa`, `partesPorTienda` (agrupa por `tiendaId`, `computeTotales` solo con
`entregado`, orden por `pagoTienda` descendente), `saldoDe` (`esperado − recibido`), `esperadoDe` /
`paraLaCentral`, `estadoConciliacionDe`, `folioCierre` (últimos 8, mayúsculas) y
`derivarPendienteCierre` / `derivarPagoEntregadoCierre`.

| Literal | Cálculo | Design | ¿Casa? |
|---|---|---|---|
| Folio | `"…b0de9a01"` → `B0DE9A01` | B0DE9A01 | sí |
| Recaudado / Efectivo / SINPE / Transf. | snapshot 70 000 + 30 000 + 0 | 100 000 / 70 000 / 30 000 / 0 | sí |
| Debe llegar a la central | 100 000 − 3 000 − 500 | 96 500.00 | sí |
| Total facturado | 4 520 + 1 130 + 2 260 | 7 910.00 | sí |
| IVA facturado | 520 + 130 + 260 | 910.00 | sí |
| Le queda a la empresa | (7 910 − 910) − 3 000 − 500 | 3 500.00 | sí |
| Gana la tienda en total | 100 000 − 7 910 | 92 090.00 | sí |
| Gestiones / Pagos ajustados / Cierres incl. | G1-G3 / ajuste de G1 en D1 / D1 | 3 / 1 / 1 | sí |
| Pago entregado | D1 con marca: pendiente = 3 000 + 0 − 0 − 3 000 = 0; entregado = 3 000 + 0 − 0 | 3 000.00 | sí |
| Recibido / Falta por recibir | 96 000; `saldoDe(96 500, 96 000)` | 96 000.00 / 500.00 | sí |
| Estado | conciliado y falta 500 → `incompleto` | «Recibido incompleto» | sí |
| Conciliado el | 2026-11-07 02:30 UTC = 2026-11-06 20:30 CR | 2026-11-06 | sí |
| T1 | rec. 70 000; pago 70 000 − 4 520 = 65 480; gana 70 000 − 6 780 = 63 220 | 70 000 / 65 480 / 63 220 | sí |
| T2 | rec. 30 000; pago 30 000 − 1 130 = 28 870; gana 28 870 | 30 000 / 28 870 / 28 870 | sí |
| Σ «Se le paga hoy» | 65 480 + 28 870 = `pagoTienda` 100 000 − 4 520 − 1 130 | 94 350.00 | sí |
| Orden de «Por tienda» | 65 480 > 28 870 | T1, T2 | sí |

Todos casan. Se sigue.

### T0.3 — Consultas de `listarHistoricoCierresBodegaCompleto` hoy (base de R384)

Medido contra Postgres real (base desechable `slt141_wt`), con un test temporal (borrado tras medir)
que siembra en transacción revertida N cierres de bodega viejos conciliados de una zona nueva, cada
uno con un cierre del día aprobado, y cuenta los eventos `$on("query")` de la llamada con el filtro
`destinoZonaIds = [zona]` y actor `maestro`:

- **N = 1: 9 consultas. N = 3: 9 consultas.** Las mismas nueve: incompletos (`$queryRaw`),
  `cierre_bodega`, `zona`, `usuario` (solicitante), `usuario` (conciliador), `cierre_dia` (conteo),
  `conciliacion_bodega_ajuste`, `wallet_movimiento` y `cierre_dia` (D40, `incluyeModeloNuevo`).
- Las tres respuestas, `ok` con `incluyeModeloNuevo === false` en todos los items.

R384 para T3.1: con solo cierres viejos, el histórico sigue en **9**.

### T1.1 — `cifrasAgregadasBodega`

- `lib/utils/cifras-cierre-bodega.ts` (nuevo): `cifrasAgregadasBodega(resumen, gestiones)` con la firma
  del design; delega en `cifrasDelCierre` (ver T0.1 c). `SnapshotsAgregadosBodega` =
  `Pick<CierreBodegaResumen, "totales" | "totalPagoMensajero" | "totalIngresoBodegaRechazos">`.
- `lib/services/CierresBodegaAdminService.ts`: `verCierreBodegaDetalle` llama a `cifrasAgregadasBodega`
  en lugar del bloque agregado (−70 / +17 líneas). El bucle por cierre del día no se toca.
- `tests/unit/utils/cifras-cierre-bodega.test.ts` (nuevo, 4 casos): BN con literales; «Por tienda» en
  su orden (entrada desordenada); el snapshot agregado manda sobre la suma de las gestiones; sin
  gestiones.

**Mutación «suma de los cierres del día en vez del snapshot agregado»** — en
`cifrasAgregadasBodega`, `totales: resumen.totales` → `totales: computeTotales(gestiones)`:

```
npx vitest run tests/unit/utils/cifras-cierre-bodega.test.ts
  con la mutación:   Tests 2 failed | 2 passed (4)  EXIT=1
    × los minuendos son el snapshot AGREGADO … (expected '94350.00' to be '95350.00')
    × sin gestiones con desglose … (expected '0.00' to be '100000.00')
  revertida:         Tests 4 passed (4)  EXIT=0
```

Detalle de bodega sin tocar aserciones:

```
npx vitest run tests/unit/utils/cifras-cierre-bodega.test.ts \
  tests/unit/services/cierres-bodega-admin-service.test.ts \
  tests/unit/services/cierre-desglose-tres-superficies.test.ts
  Test Files 3 passed (3) · Tests 69 passed (69) · EXIT=0
```

### Verificación de la tanda

- `pnpm run typecheck` → EXIT 0.
- `pnpm exec eslint` sobre los tres archivos tocados → EXIT 0, sin avisos.
- `pnpm exec vitest related --run` (los tres archivos) → 196 archivos, 2 742 tests pasados, EXIT 0.
- `pnpm run test:guardias` → 343/344 archivos; **4 rojos ajenos a este cambio**, todos en
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (guardia 420): el `init.sh` de
  `origin/dev` (sin tocar aquí) tiene el marcador `# >>> FIN PASO 2: DEPENDENCIAS <<<` sin «(ficha
  420)» y no llama a `scripts/verificar-dependencias.mjs`. Desfase de arnés entre `init.sh` y la
  guardia, no de SLT-141; queda abierto para el leader.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R387 (paridad detalle ↔ derivación, parte unitaria) | `tests/unit/utils/cifras-cierre-bodega.test.ts` + `cierres-bodega-admin-service.test.ts` y `cierre-desglose-tres-superficies.test.ts` verdes sin tocar |
| R384 (línea base de lecturas) | medida T0.3 (9); el test va en T3.1 |

### Veredicto

T0 sin bloqueos y T1.1 hecha: verde, con la mutación probada en rojo.

## Tanda 2 — backend_dev: T2 (T2.1, T2.2, T2.3) (2026-11-13)

MCP del grafo: no usado; Grep/Read sobre el worktree.

### Archivos

- **Nuevos:** `lib/interfaces/repositories/ICifrasBodegaLoteLectura.ts` (`CierreDiaDeBodegaLoteRow`, todos
  los campos obligatorios), `lib/repositories/CifrasBodegaLoteRepository.ts` (tres consultas: `cierreDia`
  con el alcance en el `WHERE` (`cierreBodega: { zonaId }` / `{}`), `gestionOrden` y `cierreDetail` por
  `cierreId in idsDia`; mismo orden y mapper que el detalle; `CierreDetalleFaltanteError` sin fallback;
  `ids` vacío → `[]` sin consultar), `lib/services/cifras-bodega-descarga.ts` (piezas compartidas por los
  dos servicios: `cierresBodegaModeloNuevo`, `cifrasBodegaDescarga`, `pagoEntregadoPorBodega`,
  `LecturaCifrasBodegaAusenteError`, `LecturasPagoEntregadoBodega`).
- **Modificados:** `ICierreBodegaService.ts` (`CifrasCierreBodegaDescargaDTO`,
  `CifrasCierreBodegaCentralDescargaDTO`, `ConCifrasBodegaEnOk<R, C>` y el resultado de «Solicitados»),
  `ICierresBodegaAdminService.ts` (los dos `…CompletoServiceResult`), `lib/types/cierre-bodega.ts` (los
  tres tipos de borde), `CierresBodegaAdminRepository.ts` (exporta `DETALLE_CIERRE_SELECT` y
  `toDetalleCierreRow`), `CierresBodegaAdminService.ts` (`completoConCifras`, deps 5.ª `cifrasLote` y 6.ª
  `pagosEntregados`, opcionales), `CierreBodegaService.ts` (dep 5.ª `cifrasLote`, opcional; sin pagos),
  `lib/actions/cierre-bodega.ts` (inyecta las dos cosas en la central y la lectura en la satélite).
- **Tests nuevos:** `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts` (5 casos ×
  las dos descargas de la central), `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts`
  (4), `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts` (3).

### Decisiones técnicas de la tanda

- `ConCifrasBodegaEnOk` se declara en `ICierreBodegaService.ts` (junto a los DTO, como
  `ConCifrasModeloNuevoEnOk` de SLT-140 en `ICierresAdminService.ts`) y `lib/types/cierre-bodega.ts` lo
  importa: así los resultados de servicio y de borde usan el mismo genérico. Lleva el DTO como segundo
  parámetro para que la satélite no pueda tiparse con `pagoEntregado`.
- `partesPorTienda: ParteDeTienda[]` (como el design); satisface estructuralmente el
  `ParteDeTiendaDescargaDTO` que pide `filaPorTienda` de SLT-140.
- «Pago entregado» (PA1, decisión del leader): Σ por cierre del día de `derivarPagoEntregadoCierre`; las
  tres lecturas se llaman UNA vez para todo el lote (vigentes y premios con los aprobados; satélite solo
  con los aprobados con la marca, y sin ninguno no se llama).
- La zona horaria se lee solo cuando hay cierres nuevos (R384: sin ellos, ninguna lectura más).
- La lectura en lote se llama tras el tope (`limite_excedido` no lee nada nuevo).

### Mutaciones (aplicar → correr → revertir → correr), script `scratchpad/mut.py`

| # | Mutación | Test | Mutado | Revertido |
|---|---|---|---|---|
| M1 | central sin la lectura en lote (`undefined` en su lugar) | `cierre-bodega-cifras-cableado.test.ts` | 2 failed / 1 passed, EXIT=1 | 3 passed, EXIT=0 |
| M2 | central sin las tres lecturas de pago | idem | 2 failed / 1 passed, EXIT=1 | 3 passed, EXIT=0 |
| M3 | satélite sin la lectura en lote | idem | 1 failed / 2 passed, EXIT=1 | 3 passed, EXIT=0 |
| M4 | mandar `pagoEntregado` a la satélite (`.map(c => ({ ...c, pagoEntregado: null }))`) | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` | 1 failed / 3 passed, EXIT=1 | 4 passed, EXIT=0 |
| M5 | «Pago entregado» sin premios (`P − pendiente`) | `cierres-bodega-resumen-modelo-nuevo-service.test.ts` | (c) ×2 failed / 8 passed, EXIT=1 | 10 passed, EXIT=0 |
| M6 | leer el lote sin filtrar por `incluyeModeloNuevo` | los dos de servicio | 8 failed, EXIT=1 | 14 passed, EXIT=0 |

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R384 | `cierres-bodega-resumen-modelo-nuevo-service.test.ts` (a) · `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` («solo cierres viejos») |
| R385 | `cierres-bodega-resumen-modelo-nuevo-service.test.ts` (b) |
| R386 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` (sin `pagoEntregado`; M4) · cableado (satélite sin pagos) |
| R387 | (b) de la central y el caso R386 de la satélite (importes a mano) |
| R388 | (b) Gestiones / Pagos ajustados / Pago entregado · (c) PA1 |
| R389 | (c) una llamada por lectura · alcance `zona` de la satélite · `cierre-bodega-cifras-cableado.test.ts` (M1-M3). El conteo de consultas y el alcance en SQL van en T3.1 |

### Verificación de la tanda

- `pnpm run typecheck` → TC_EXIT=0.
- `pnpm exec eslint` sobre los 13 archivos tocados → LINT_EXIT=0, sin avisos.
- Tests nuevos: 3 archivos, 17 passed, EXIT=0.
- `pnpm exec vitest related --run` (los 13 archivos) → 241 archivos, 3 264 passed / 30 failed / 17
  skipped, REL_EXIT=1. Desglose de los 8 archivos rojos:
  - **1 por este cambio, corregido:** `tests/integration/db/deudas-d39-d40-modelo-nuevo.test.ts`. (i) Su
    `servicioZona` construía `CierreBodegaService` sin la lectura en lote y lee «Solicitados» con
    consolidaciones nuevas → `LecturaCifrasBodegaAusenteError` (el contrato «ruidosa si falta» de
    T2.3). Se le pasa la `CifrasBodegaLoteRepository` real, como producción. (ii) El caso «tres cierres
    cuestan una sentencia» contaba las de `cierre_detail` de esa descarga: con consolidaciones nuevas
    ahora son **2** (1 de D40 + 1 del lote de SLT-141, fija con tres). Aserción `1 → 2` con comentario.
    **Para el leader/reviewer:** es un literal existente cambiado a propósito (la lectura nueva es la de
    R385/R389, no una por fila). Tras el arreglo: 16/16 verdes.
  - **7 de entorno, no de código:** `marca-conciliacion.int`, `corregir-conciliacion.int`,
    `cierre-bodega-conciliacion.int`, `cierre-bodega-desglose-por-tienda-sql-real`,
    `486-evidencias-cierres-sql-real`, `454/cierre-bodega-sf001-sql-real`,
    `454/caracterizacion/alcance-satelite-y-sf001`: todos paran en su precondición de datos («`usuario`
    vacía / menos de 2 filas», «`orden` vacía: corre `pnpm run db:seed`»). La base desechable
    `slt141_wt` está migrada pero sin semilla. No la sembré (no estaba en el encargo): queda abierto.
- `pnpm run test:guardias` → 341/344 archivos; rojos: los 4 de la guardia 420 (baseline conocido) y 2
  timeouts de 20 s (`dominio-ordenex-fuera`, `otp-debug-solo-en-pruebas`) por correr a la vez que
  `vitest related`; re-ejecutados solos: 20/20 verdes, EXIT=0.

### Veredicto

T2 hecha: tipos, lectura en lote y servicios con cableado probado; las 6 mutaciones dan rojo y vuelven a
verde. Abierto: semilla de la base desechable para los 7 de integración y el literal 1 → 2 de D40.

## Tanda 3 — backend_dev: T3.1 (2026-11-13)

MCP del grafo: no usado; Grep/Read sobre el worktree. Base desechable `slt141_wt` (solo catálogos): el
test siembra todo (zonas, usuarios, órdenes, filas congeladas, cierres del día y de bodega) en una
transacción que siempre se revierte, y se autocomprueba (7 gestiones, 5 cierres del día consolidados) o
LANZA. Sin `return` temprano; sin base, `describe.skip` visible.

### Archivos

- **Nuevo:** `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` (7 casos).
- `lib/`: sin cambios (`git diff --stat lib/` vacío al terminar).

### Corpus (el del design, más dos)

BN, BV, BZ como `design.md > Verificación`. Dos añadidos, necesarios para lo que el design pide medir:

- **B2 (Este) y B3 (Oeste)**, nuevos, sin conciliar (cola): los otros dos de «1 contra 3 cierres
  nuevos».
- **B2 lleva a propósito un snapshot AGREGADO distinto de su día** (general 12 000 / P 800 contra
  10 000 / 600). En BN agregado y suma coinciden, así que la mutación «suma de los cierres del día en vez
  del snapshot agregado» no se vería en ningún literal de BN. Literales a mano de B2: facturado 1 130,00;
  IVA 130,00; neto (1 130 − 130) − 800 − 0 = 200,00; gana 12 000 − 1 130 = 10 870,00; por tienda
  10 000 / 8 870 / 8 870; «Pago entregado» = el de D2 (P del día 600, efectivo 10 000 la cubre: pendiente
  0) = 600,00. B3: 1 130 / 130 / 1 000 / 8 870 / entregado 0,00.
- Hallazgo de esquema: el CHECK `cierre_bodega_conciliacion_coherente` exige `aprobado` ⇔ conciliado.
  BZ, B2 y B3 (sin conciliar) van `solicitado`; sus cierres del día, `aprobado`. BV conciliado completo
  (Histórico); BN recibido incompleto (cola/Pendientes).

### Casos

| Caso | R |
|---|---|
| BN en Pendientes: `cifrasModeloNuevo` `toEqual` literal (7 910 / 910 / 3 500 / 92 090 / 3 gestiones / 1 ajuste / por tienda / «Pago entregado» 3 000,00) y la fila de hoy (folio B0DE9A01, 96 500, 96 000, falta 500, «Ana Pérez», 2026-11-07T02:30Z) | R387, R388 |
| Paridad: `cifrasAgregadasBodega` sobre el lote `toEqual` el detalle de BN, central y S; detalle contra literales | R387 |
| «Solicitados» de S (mixto BN + BV): cifras solo de BN, sin clave `pagoEntregado` | R386, R384 |
| Alcance en el WHERE: S con [BN, BZ] → solo D1; [BZ] → `[]`; `[]` → `[]` | R389 |
| B2 (snapshot agregado manda) y B3, literales | R387, R388 |
| 1 contra 3 cierres nuevos: mismas consultas, lote 2 llamadas, ninguna INSERT/UPDATE/DELETE | R389, R387 |
| Solo BV en Histórico: sin `cifrasModeloNuevo`, lote no llamado, 9 consultas (línea base T0.3), sin escrituras | R384 |

### Mutaciones (aplicar en producción → correr SOLO este test → revertir con `git checkout -- lib/` → correr)

Script `scratchpad/mut31.mjs <n>` (falla si el texto no casa una sola vez) + `scratchpad/t31.sh`
(`npx vitest run tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` con la base
desechable).

| # | Mutación | Mutado | Aserción que cae | Revertido |
|---|---|---|---|---|
| 1 | quitar el alcance del `where` (`CifrasBodegaLoteRepository`: `cierreBodega: {}`) | 1 failed / 6 passed, EXIT=1 | alcance: `expected [ [ …(2) ], [ …(2) ] ] to deeply equal [ [ …(2) ] ]` (llega el día de BZ) | 7 passed, EXIT=0 |
| 2 | leer el lote sin filtrar por `incluyeModeloNuevo` (`cierresBodegaModeloNuevo` → `[...items]`) | 2 failed / 5 passed, EXIT=1 | «Solicitados» (`[ {…}, {…} ]` vs `[ {…} ]`) y R384 (`"cifrasModeloNuevo" in` → `expected true to be false`) | 7 passed, EXIT=0 |
| 3 | suma de los cierres del día en vez del snapshot agregado (`cifrasAgregadasBodega`: `totales: computeTotales(gestiones)`) | 1 failed / 6 passed, EXIT=1 | B2: `- "ganaLaTienda": "10870.00"` / `+ "8870.00"` | 7 passed, EXIT=0 |
| 4 | mandar `pagoEntregado` a la satélite (`CierreBodegaService`: `.map(c => ({ ...c, pagoEntregado: null }))`) | 1 failed / 6 passed, EXIT=1 | «Solicitados»: `+ "pagoEntregado": null` | 7 passed, EXIT=0 |
| 5 | proyectar «Cierres modelo anterior» con todas las filas | **no aplica aquí** | — | — |

M5 vive en el libro del cliente (`cierres-bodega-modelo-nuevo-descarga.ts`, T4.1), que aún no existe; el
servidor no parte filas entre hojas. Queda para el test de T4.1 (`tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`, «ningún cierre en dos hojas»).

### Verificación de la tanda

- `pnpm run typecheck` → TC_EXIT=0.
- `pnpm exec eslint tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` → LINT_EXIT=0, sin avisos.
- El test, dos veces seguidas: `Tests 7 passed (7)` EXIT=0 y `Tests 7 passed (7)` EXIT=0 (ninguno saltado).
- `git diff --stat lib/` vacío.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R384 | `cierres-bodega-cifras-lote-sql-real.test.ts` (solo BV; mixto de S) |
| R386 | ídem («Solicitados» sin `pagoEntregado`; M4) |
| R387 | ídem (literales BN y B2/B3, paridad central y S, sin escrituras; M3) |
| R388 | ídem (Gestiones, Pagos ajustados, Pago entregado de BN y por día en B2/B3) |
| R389 | ídem (alcance en el WHERE, M1; consultas iguales con 1 y 3; M2) |

### Veredicto

T3.1 hecha: 7/7 verde contra Postgres real; 4 de las 5 mutaciones dan rojo y vuelven a verde; la 5.ª es
de T4.1 (cliente) y queda abierta allí.

## Tanda 4 — frontend_dev: T4 (T4.1, T4.2) (2026-11-13)

MCP del grafo: no usado; Grep/Read sobre el worktree. Sin `lib/` tocado.

### Archivos

- **Nuevos (producción):** `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
  (`COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO` 26, `columnasCierresBodegaModeloNuevoPara`, `filaCierreBodegaModeloNuevo`),
  `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga.ts` (`libroCierresBodega`,
  `obtenerResumenCierresBodega`).
- **Modificados:** `CierresBodegaAdminModule.tsx` (`descargaColaBodega(filtros, audiencia)`, ahora exportada,
  con `obtenerFilasConColumnas`), `CierresBodegaResueltosLista.tsx` (`descargaBodegaResueltos(filtros, audiencia)`,
  ídem), `CierresBodegaSolicitadosLista.tsx` (`obtenerFilas` vía el libro, audiencia `"satelite"` fija).
- **Tests:** nuevo `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (16), nuevo
  `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (6); los dos módulos añadidos a
  `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`.

### Reuso de SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros»

`HOJA_CIERRES` / `HOJA_POR_TIENDA` / `HOJA_CIERRES_ANTERIOR`, `COLUMNAS_POR_TIENDA` + `filaPorTienda` (la parte
de bodega `ParteDeTienda` la satisface; `tiendaId` no sale), `obtenerFilasConColumnas` de
`DescargarCierresButton` (PA3: la anterior con las columnas marcadas). Propio de bodega: solo «Cierres» (26/25
sobre `CierreBodegaResumen`).

### Decisiones técnicas

- Audiencia `"admin"`/`"satelite"` (decisión del leader). La central pasa la `audiencia` del módulo (default
  `"satelite"`, falla cerrado); «Solicitados» siempre `"satelite"`.
- «Destino» = `DESTINO_TIPO_LABEL.bodega_central` («Bodega central»), sin « · zona»: `CierreBodegaResumen` no
  trae el nombre de la zona central. Si el humano quiere «Bodega central · <zona>», hace falta un dato del
  servidor (abierto, menor).
- «Estado» y «Estado de conciliación» = `ESTADO_CONCILIACION_LABEL[estadoConciliacionDe(item)]` (PA2).
- «Recibido» y «Falta por recibir» con `formato: "monto"` (el archivo de hoy no los formatea; en el libro
  nuevo son importes, R387). «Pago entregado» de la central: `cifras.pagoEntregado ?? null`.
- «Solicitados» no recibe columnas marcadas (`DescargarDatasetButton` llama a `obtenerFilas()` sin
  argumentos): su «Cierres modelo anterior» sale con TODAS las columnas de hoy, en su orden (PA3).

### Mutaciones (aplicar → correr SOLO el test → revertir → correr)

| # | Mutación | Test | Mutado | Revertido |
|---|---|---|---|---|
| M5 (de T3) | libro: «Cierres modelo anterior» con `items.map(filaAnterior)` (todas) en vez de `anteriores` | `cierres-bodega-modelo-nuevo-descarga.test.ts` | 1 failed / 15 passed, EXIT=1: «mixto: … ningún cierre en dos hojas» `expected [ { estado: 'Recibido', …(10) }, …(3) ] to deeply equal [ { estado: 'Recibido', …(10) }, …(1) ]` | 16 passed, EXIT=0 |
| M7 | «Solicitados» con audiencia `"admin"` | `CierresBodegaResumenModeloNuevo.test.tsx` | 1 failed / 5 passed, EXIT=1: «(b, c) Solicitados, mixto …» | 6 passed, EXIT=0 |
| M8 | libro desactivado en «Por conciliar» (`obtenerFilasConColumnas` renombrada) | ídem | 1 failed / 5 passed, EXIT=1: «(b) Por conciliar, mixto …» | 6 passed, EXIT=0 |

Comando: `npx vitest run <test>` con `DATABASE_URL` de la desechable `slt141_wt` y `NODE_OPTIONS=--max-old-space-size=8192`.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R384 | `CierresBodegaResumenModeloNuevo.test.tsx` (a) ×3 pantallas · `cierres-bodega-modelo-nuevo-descarga.test.ts` («solo viejos → null», `obtenerResumenCierresBodega` solo viejos) · existentes sin tocar: `cierres-bodega-descarga-columnas.test.ts`, `CierresDescargaNiveles.test.tsx`, `CierresDescargaColumnas.test.tsx` |
| R385 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (solo nuevos, mixto, orden, ningún cierre en dos hojas; M5) · `CierresBodegaResumenModeloNuevo.test.tsx` (b) ×3 (M8) |
| R386 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (encabezados 26/25, «Por tienda», satélite sin la clave) · `CierresBodegaResumenModeloNuevo.test.tsx` (c) (M7) |
| R387 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (celdas BN, formato monto, negativos con signo + `celdaMonto`) |
| R388 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (folio, fechas en CR, Recibido/Resuelto/Conciliado vacíos, conteos) |

### Verificación de la tanda

- `pnpm run typecheck` → TC_EXIT=0.
- `pnpm exec eslint` sobre los 8 archivos tocados → LINT_EXIT=0, sin avisos.
- Nuevos + los tres existentes de T4.2 sin tocar + guardias de descarga (`cierres-descarga-detallada-frontera`,
  `columnas-sensibles`, `columnas-asercion-de-orden`, `cierres-descarga-detallada-money`,
  `cierre-bodega-vocabulario`, `ambito-columnas`): `Test Files 11 passed (11) · Tests 125 passed (125)`, EXIT=0.
  (`columnas-sensibles` dio rojo al primer intento: el módulo de columnas no exportaba ninguna lista; se
  exporta `COLUMNAS_CIERRES_BODEGA_MODELO_NUEVO` y su orden se afirma en el test unitario.)
- `pnpm exec vitest related --run` (los 8 archivos) → `Test Files 26 passed (26) · Tests 367 passed (367)`, REL_EXIT=0.

### Veredicto

T4.1 y T4.2 hechas: libro de bodega en las tres descargas, verde, con M5 en rojo real y revertida. Abierto: «Destino» sin el nombre de la zona central.

## Tanda 5 — frontend_dev: T5.1 (2026-11-13)

MCP del grafo: no usado; Grep/Read sobre el worktree. Sin `app/` ni `lib/` tocados (`git diff --stat app/ lib/` vacío).

### Archivos

- `e2e/cierres-rediseno.spec.ts`: describe «SLT-141 — el «Resumen» de «Conciliados» (bodega) con un cierre viejo y
  uno nuevo» + `ENCABEZADOS_CIERRES_BODEGA_CENTRAL` (26, literal a mano). BV = el escenario de SLT-107 (9.000 +
  rechazo, debe llegar 7.000); BN = B6 de SLT-104 activado en la satélite después de consolidar BV. Los dos se
  concilian por lo que debían. Se leen con ExcelJS las hojas, los encabezados de «Cierres», la fila de BN (Debe
  llegar 7.680, Le queda 780, Recaudado 10.000, Gana la tienda 6.497, Pago 2.200, Pago a la satélite 120, Total
  facturado 3.503, IVA 403, Gestiones 1, Cierres incluidos 1, Recibido 7.680, Falta 0, Estado «Recibido»), «Por
  tienda» (folio de BN, 10.000 · 6.497 · 6.497) y «Cierres modelo anterior» (solo BV: Total general 9.000).
- `e2e/_escenarios/cierres.ts`: nuevo `conciliarCierreBodega(r, id, monto)` (`marcarRecibida` con el maestro, como
  `lib/actions/conciliacion-satelites.ts`). Nada de lo que leen SLT-113 ni SLT-140 cambia.
- `specs/SLT-141-excel-hojas-cierre-bodega/tasks.md`: T5.1 marcada.

### Mapa R → test (E2E)

| R | Test |
|---|---|
| R384, R385 | describe SLT-141: nombres de hoja en orden; BN solo en «Cierres», BV solo en «Cierres modelo anterior» |
| R386 | ídem: encabezados de la central (26, con «Pago entregado») y «Por tienda» |
| R387 | ídem: importes como número (7.680, 780, …) |
| R388 | ídem: folio (`id.slice(-8)` en mayúsculas), Bodega, Destino, Estado, Recibido / Falta por recibir |

### Comandos y salida real

Base desechable `slt141_e2e` (crear-base.sh: DROP/CREATE + migrate deploy + db:seed) recreada antes de la
corrida 1; `DATABASE_URL` de esa base, `NODE_OPTIONS=--max-old-space-size=8192`,
`NEXT_PUBLIC_APP_URL=http://localhost:3044`; `pnpm exec next build` (sin `prisma generate`) → BUILD_EXIT=0.

- `E2E_PUERTO=3044 pnpm exec playwright test e2e/cierres-rediseno.spec.ts --project=dinero --reporter=list`
  - corrida 1: `20 passed (1.5m)`, E2E_EXIT=0 (0 failed / 0 skipped / 0 flaky)
  - corrida 2 (misma base): `20 passed (1.6m)`, E2E_EXIT=0 (0 failed / 0 skipped / 0 flaky)
- Primer intento del describe: rojo de la fábrica por el slug (`e2e-cierres-resumen-bodega-modelo--…`, truncado
  en guion → `invalida`); escenario renombrado a `cierres-bodega-resumen-nuevo`. No es de la app.

### Mutación (rojo real → verde)

- M9: `CierresBodegaResueltosLista.tsx` sin `obtenerFilasConColumnas` (y sin su import): «Conciliados» no usa el
  libro. Rebuild → `-g "SLT-141"`: `1 failed`, E2E_EXIT=1, `Expected ["Cierres","Por tienda","Cierres modelo
  anterior"]` · `Received ["Cierres de bodega resueltos"]`.
- `git checkout --` del archivo, rebuild → `1 passed (18.7s)`, E2E_EXIT=0. `git diff --stat app/ lib/` vacío.

### Verificación de la tanda

- `pnpm exec eslint e2e/cierres-rediseno.spec.ts e2e/_escenarios/cierres.ts` → LINT_EXIT=0.
- `pnpm run typecheck` → TC_EXIT=0.
- Puertos 3044 y 54329 libres al terminar.

### Veredicto

T5.1 hecha: E2E de SLT-141 verde dos veces seguidas (20/20) y rojo real con el libro desactivado.
