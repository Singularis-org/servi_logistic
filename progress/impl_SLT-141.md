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
