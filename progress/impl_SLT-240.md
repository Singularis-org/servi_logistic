# impl SLT-240 «Moneda del país en pantallas: órdenes, novedades e incidentes» — backend_dev, tanda T1.1 + T2.1

## Archivos
- `lib/config/moneda.ts` — `formatearTopeEn(moneda, max, sinMonto = SIN_MONTO)` exportada; comentario actualizado (censo 359, no suma a `CAMINOS_PUBLICOS`).
- `lib/pdf/etiquetas-dibujo.ts` — `moneda: FormatoMoneda` obligatoria en `drawEtiqueta`, `datosDeEtiqueta`, `textosConFuenteEmbebida` e `importeDeEtiqueta`; fuera la caída y el import de `MONEDA_PLATAFORMA`.
- `tests/unit/config/moneda-formato-pais.test.ts` — describe «formatearTopeEn» (R10).
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` — en el `it` de `moneyTope`: `formatearTopeEn(MONEDA_PLATAFORMA, x) === formatMontoTope(x)` en todo `CORPUS_STRING`.
- `tests/unit/pdf/etiquetas-capacidad.test.ts`, `etiquetas-diseno-353.test.ts` — pasan `MONEDA_PLATAFORMA`.
- `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts` — pasa `MONEDA_PLATAFORMA` + describe SLT-240 R7 (símbolo U+20BF, cobertura real, `doc.text` no llamado) con control positivo.

## R → test
- R10: `moneda-formato-pais.test.ts > formatearTopeEn — …` (3 casos) y guardia 359 `moneyTope … (cota)`.
- R7: `etiquetas-caracter-no-cubierto.test.ts > SLT-240 — una moneda cuyo simbolo la fuente embebida no cubre`.
- R14 (lado de `lib/pdf`): firma obligatoria; el `@ts-expect-error` es de T2.2.

## Verificación (vitest de la raíz, el worktree no tiene node_modules)
- 5 archivos tocados: verdes (136 pasados, 1 skipped por BD).
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts`: **1 rojo** — «el dato `montoCobrar` … sin ella, en la de CR» llama `datosDeEtiqueta(e)` sin moneda y espera la caída a CR que el design §5 elimina. Choque spec↔test; no tocado (fuera de la lista).
- typecheck: 168 errores; relevantes: `app/(app)/ordenes/_components/etiquetas-pdf.ts` (T2.2, esperado), `tests/unit/components/etiquetas-pdf.test.ts:874` (T2.2), `tests/unit/services/etiquetas-lote-pdf-service.test.ts:587` (inesperado, mismo choque). El resto: cliente Prisma viejo del node_modules compartido (no regenerado).
- lint de los 7 archivos: 0 errores, 1 warning previo (`salidasQueCasan`, línea 252, no es del diff).

Veredicto (tanda 1): T1.1 hecha; T2.1 hecha salvo el choque con `etiquetas-lote-pdf-service.test.ts`, que necesita decisión.

## Cierre de T2.1 (decisión del leader: quitar la caída a CR del test)
- `tests/unit/services/etiquetas-lote-pdf-service.test.ts` — test renombrado a «el dato `montoCobrar` de la etiqueta se pinta en la moneda recibida»; parámetro `moneda: FormatoMoneda` (obligatorio); fuera `expect(monto()).toBe("₡1.234.567")`. Los otros valores esperados no cambian; ningún import quedó sin uso.
- vitest (`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run tests/unit/services/etiquetas-lote-pdf-service.test.ts tests/unit/pdf/`, node_modules del worktree):
  `Test Files  1 failed | 13 passed (14)` / `Tests  9 failed | 238 passed (247)`. `etiquetas-lote-pdf-service.test.ts`: verde. Los 9 rojos son todos de `tests/unit/pdf/etiquetas-dos-generadores.test.ts` (R22): llama `buildEtiquetasPdf` sin moneda → `TypeError: Cannot read properties of undefined (reading 'decimales')` en `importeDeEtiqueta`. Es de T2.2 (generador del navegador).
- typecheck (`tsc --noEmit`, con `--max-old-space-size=8192`; sin él aborta con exit 134 por memoria): 14 errores, todos TS2554 por la moneda obligatoria, en `tests/components/EtiquetaFechaEnPantalla.test.tsx`, `tests/components/EtiquetaGuiaPreview.test.tsx`, `tests/unit/components/etiquetas-pdf.test.ts`, `tests/unit/components/etiquetas-pdf-descarga.test.ts`, `tests/unit/pdf/etiquetas-dos-generadores.test.ts`. Ninguno en `etiquetas-lote-pdf-service.test.ts` ni en `app/`. Ojo: en el worktree hay cambios sin commit de T2.2 que hizo otro agente (`etiquetas-pdf.ts`, `EtiquetaGuia.tsx`, `EtiquetasGuiaModal.tsx`, `etiquetas-pdf-descarga.test.ts`): ya cambiaron la firma de `buildEtiquetasPdf` y por eso los errores se movieron a sus llamadores en los tests.
- lint (`pnpm exec eslint tests/unit/services/etiquetas-lote-pdf-service.test.ts`): 0 problemas.

Veredicto: T2.1 cerrada; los rojos que quedan son de T2.2, que está en curso.

## T2.2–T2.3 (frontend_dev, 2026-11-20)

### Archivos
Producción:
- `app/(app)/ordenes/_components/etiquetas-pdf.ts` — `moneda: FormatoMoneda` obligatoria en `buildEtiquetasPdf` y `descargarEtiquetasPdf`; se pasa a `drawEtiqueta`.
- `app/(app)/ordenes/_components/EtiquetasGuiaModal.tsx` — `useMonedaDelPais()` y cuarto argumento de `descargarEtiquetasPdf`.
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx` — `formatearMontoEn(useMonedaDelPais(), montoCobrar)` (fuera `formatMonto`).

Tests:
- `tests/unit/components/etiquetas-pdf.test.ts` — `construir` y `textosConFuenteEmbebida` con `MONEDA_PLATAFORMA`; nuevo `describe` R14 con `@ts-expect-error` en `buildEtiquetasPdf` y `drawEtiqueta` sin moneda (más un caso de ejecución: sin moneda lanza, no cae a la plataforma).
- `tests/unit/components/etiquetas-pdf-descarga.test.ts` — llamadas con `MONEDA_PLATAFORMA`; el caso R28 (símbolo por entorno) pasa la `MONEDA_PLATAFORMA` reimportada tras `resetModules`.
- `tests/components/EtiquetaFechaEnPantalla.test.tsx` — `MONEDA_PLATAFORMA`.
- `tests/unit/pdf/etiquetas-dos-generadores.test.ts` — `MONEDA_PLATAFORMA` en las dos llamadas; caso R6 con `MONEDA_DE_PRUEBA`.
- `tests/components/EtiquetasGuiaModal.test.tsx` — las dos `toHaveBeenCalledWith` ganan `MONEDA_PLATAFORMA`; caso R6 con el proveedor de prueba.
- `tests/components/EtiquetaGuiaPreview.test.tsx` — dos llamadas con `MONEDA_PLATAFORMA`; caso de paridad R6 con `MONEDA_DE_PRUEBA`.
- `tests/components/moneda-del-pais-ordenes.test.tsx` (nuevo) — casos de R5.

Ningún valor esperado de los tests existentes cambió. `tests/components/EtiquetaGuia.test.tsx` sin tocar.

### R → test
- R5: `moneda-del-pais-ordenes.test.tsx > SLT-240 R5 — vista previa de la etiqueta` (moneda de prueba, sin proveedor, CR = sin proveedor, `null` → `-` en los tres).
- R6: `etiquetas-dos-generadores.test.ts > SLT-240 R6 — …` (navegador = lote = `formatearMontoEn(MONEDA_DE_PRUEBA, v)`); `EtiquetasGuiaModal.test.tsx > SLT-240 R6: dentro del proveedor del pais…` (cuarto argumento `MONEDA_DE_PRUEBA`); `EtiquetaGuiaPreview.test.tsx > SLT-240 R6 — paridad vista previa <-> PDF…`.
- R14: `etiquetas-pdf.test.ts > SLT-240 R14 — sin moneda por defecto…` (`@ts-expect-error` en `buildEtiquetasPdf` y `drawEtiqueta`; lo hace cumplir el typecheck).
- R12/R13 (lo de esta tanda): los tests existentes verdes sin cambiar valores esperados, `EtiquetaGuia.test.tsx` verde sin tocar, y los casos CR/sin proveedor de R5.

### Salida real (worktree, node_modules propio, NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm exec vitest run tests/unit/components/etiquetas-pdf.test.ts tests/unit/components/etiquetas-pdf-descarga.test.ts tests/components/EtiquetaFechaEnPantalla.test.tsx tests/unit/pdf/etiquetas-dos-generadores.test.ts tests/components/EtiquetasGuiaModal.test.tsx tests/components/EtiquetaGuiaPreview.test.tsx tests/components/moneda-del-pais-ordenes.test.tsx tests/components/EtiquetaGuia.test.tsx`:
  `Test Files  8 passed (8)` / `Tests  140 passed (140)`.
- `pnpm run typecheck` (`tsc --noEmit`): 0 errores.
- `pnpm exec eslint` de los 10 archivos: 0 errores, 4 warnings `no-unused-vars` en `etiquetas-pdf.test.ts` (`MAQUETA_BASE`, `PT_A_MM_MAQUETA`, `lineasDe`, `textosConY`), los mismos 4 que en HEAD: previos, no del diff.

Veredicto (T2.2–T2.3): hechas; los cuatro de T2.2 y los de T2.3 en verde, typecheck en 0, sin archivos fuera de la lista.

## Tanda 3 (parcial) — T3.1, T3.2, T3.5 (frontend_dev, 2026-11-20)

### Archivos
Producción:
- `app/(app)/ordenes/_components/OrdenesCargaResumen.tsx` — `useMonedaDelPais()`; la celda de monto pasa de `formatMonto` a `formatearMontoEn(moneda, row.montoCobrar)` (sin monto, `SIN_MONTO` por defecto) (R2).
- `app/(app)/ordenes/_components/OrdenesConMontoAjustadoTabla.tsx` — fuera `montoExacto`; `exacta = useMemo({ ...moneda, decimales: ESCALA_PRESENTACION })` y `formatearMontoEn(exacta, v, SIN_MONTO_RAYA)` en las dos columnas (R3, design §4 y nota de R3).
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx` — `importe(u, campo, moneda)` con `formatearMontoEn(moneda, u[campo], SIN_MONTO_RAYA)`; la rama `sin_tarifa` sigue primero; fuera `money` (R4). Rótulos «Flete + IVA»/«Comisión + IVA» sin tocar (son de T3.6).

Tests:
- `tests/components/moneda-del-pais-ordenes.test.tsx` — dobles de `carga-masiva-resumen`, `useToast` y `etiquetas-guia` (los de `OrdenesCargaResumen.test.tsx`); `describe` de R1, R2, R3, R4 y R8.

T3.5: R1 (`ordenes-columns`, vía `PriceLabel`) y R8 (`PosOrderCardDetalle` + `novedadAOrdenCard`) ya cumplían sin tocar producción.

### R → test (`moneda-del-pais-ordenes.test.tsx`)
- R1: `SLT-240 R1 — celdas de importe del listado de órdenes` (monto, flete, fulfillment y comisión = `formatearMontoEn(MONEDA_DE_PRUEBA, v)`; sin proveedor = plataforma; CR = sin proveedor).
- R2: `SLT-240 R2 — resumen de la carga masiva` («€12 501», sin proveedor, CR = sin proveedor, `null` → `-` en los tres).
- R3: `SLT-240 R3 — tabla del monto redondeado` (`€11 898.81` y `€11 899`, distintos; sin proveedor = `montoExacto`; CR = sin proveedor).
- R4: `SLT-240 R4 — aviso de cambio de ubicación` (flete y comisión en la moneda de prueba; `sin_tarifa` → «Sin tarifa configurada» en las dos filas con las tres monedas; sin proveedor; CR = sin proveedor).
- R8: `SLT-240 R8 — tarjeta de novedades` (moneda de prueba, sin proveedor, CR = sin proveedor).

### Salida real (worktree, NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm exec vitest run tests/components/moneda-del-pais-ordenes.test.tsx`: `Test Files  1 passed (1)` / `Tests  21 passed (21)`.
- `pnpm exec vitest related --run` de los 3 archivos de producción: `Test Files  55 passed (55)` / `Tests  756 passed (756)`.
- Directos: `OrdenesCargaResumen.test.tsx`, `OrdenesCargaPreview.test.tsx`, `CorregirDatosCliente.ordenes.test.tsx`, `CorregirDatosCliente.novedades.test.tsx`: `Test Files  4 passed (4)` / `Tests  98 passed (98)`, sin tocarlos.
- `pnpm run typecheck` (`tsc --noEmit`): exit 0.
- `pnpm exec eslint` de los 4 archivos: `No issues found`.

Veredicto (T3.1, T3.2, T3.5): hechas; casos de R1/R2/R3/R4/R8 en verde, tests existentes verdes sin tocar, typecheck y lint en 0, sin archivos fuera de la lista.

## Tanda 3 — T3.3, T3.4 (frontend_dev, 2026-11-20)

### Archivos

Producción:
- `app/(app)/incidentes/_components/IncidentesAdminModule.tsx` — `useMonedaDelPais()`; el detalle pinta
  `formatearMontoEn(moneda, detalle.indemnizacion, SIN_MONTO_RAYA)` (R9); `MONTO_AYUDA` / `MONTO_EXCEDE`
  pasan a `montoAyuda(moneda)` / `montoExcede(moneda)` exportadas, con
  `formatearTopeEn(moneda, INDEMNIZACION_MONTO_MAX, SIN_MONTO_RAYA)`; textos alrededor sin cambiar (R10, R17).
  De `cierre-detalle-shared` solo importa ya `EstadoCierreBadge`.
- `app/(app)/incidentes/_components/IncidentesHistoricoTabla.tsx` — `useMonedaDelPais()`;
  `columnasHistorico(onAbrir, moneda)` con `formatearMontoEn(moneda, i.indemnizacion, SIN_MONTO_RAYA)` (R9).
  Ya no importa `money`.
- `app/(app)/historico/acciones/_components/historial-acciones-columnas.ts` —
  `export function columnasHistorialAcciones(moneda: FormatoMoneda)` con
  `formatearMontoEn(moneda, fila.monto, SIN_MONTO_RAYA)` (R11).
- `app/(app)/historico/acciones/_components/HistorialAccionesModule.tsx` —
  `const columnas = useMemo(() => columnasHistorialAcciones(moneda), [moneda])` sobre `useMonedaDelPais()`.

Tests:
- `tests/components/moneda-del-pais-ordenes.test.tsx` — casos de R9, R10 y R11 (+13); dobles de
  `@/lib/actions/incidentes`, `next/navigation` y `@/lib/actions/historial-acciones`.
- `tests/components/IncidentesAdminModule.test.tsx` — `montoExcede(MONEDA_PLATAFORMA)`; el literal entero
  `₡9.999.999.999,99 (10 dígitos y 2 decimales)…` se conserva sin tocar.
- `tests/components/DineroIdentidadesEnPantalla.test.tsx` — el test del tope lee `montoExcede(MONEDA_PLATAFORMA)`;
  `USA_EL_FORMATEADOR` gana `formatearMontoEn|formatearTopeEn`.
- `tests/components/HistorialAccionesValorInfo.test.tsx`, `tests/unit/components/historial-acciones-descarga-columnas.test.ts`,
  `tests/integration/db/455/caracterizacion/snapshot-correccion.test.ts` — pasan a
  `columnasHistorialAcciones(MONEDA_PLATAFORMA)`; ningún valor esperado cambia (R15).

Sin otros llamantes de `MONTO_AYUDA`, `MONTO_EXCEDE`, `columnasHistorico` ni `columnasHistorialAcciones`
fuera de la lista (los `MONTO_*` de `CierresAdminModule.tsx` son suyos y no se tocan).

### R → test

- R9: `moneda-del-pais-ordenes.test.tsx` › `SLT-240 R9 — indemnización de la cola de incidentes` (columna del
  histórico y detalle: moneda de prueba, sin importe `—`, sin proveedor, CR = sin proveedor).
- R10: › `SLT-240 R10 — tope de la indemnización en el formulario de aprobación` (ayuda y error con la moneda
  de prueba, `€9 999 999 999`; el tope anunciado con 0 decimales lo acepta `montoValido`; sin proveedor; CR = sin proveedor).
- R11: › `SLT-240 R11 — importe del registro de acciones (HistorialAccionesModule)` (moneda de prueba, `—`,
  sin proveedor, CR = sin proveedor).
- R12: casos «R12» de los tres `describe` anteriores + `IncidentesAdminModule.test.tsx` › «un monto por encima
  del TOPE se bloquea…» (literal entero `₡9.999.999.999,99 …`).
- R15: `HistorialAccionesValorInfo.test.tsx`, `historial-acciones-descarga-columnas.test.ts`,
  `snapshot-correccion.test.ts` sin cambiar valores esperados.
- R17: el mismo literal de `IncidentesAdminModule.test.tsx` (texto «(10 dígitos y 2 decimales)» intacto) y
  `montoAyuda` conserva «con hasta 2 decimales (por ejemplo 12500.00)».

### Salida real (worktree, NODE_OPTIONS=--max-old-space-size=8192)

- `pnpm exec vitest run tests/components/moneda-del-pais-ordenes.test.tsx`: `Test Files 1 passed (1)` / `Tests 34 passed (34)`.
- `pnpm exec vitest related --run` de los 4 archivos de producción: `Test Files 15 passed | 1 skipped (16)` /
  `Tests 236 passed | 3 skipped (239)`. El saltado es `snapshot-correccion.test.ts` (sin `HAY_BASE_DE_DATOS`);
  compila (typecheck en 0).
- `pnpm exec vitest run tests/unit/guards/estado-con-info.guardia.test.ts …snapshot-correccion.test.ts
  …DineroIdentidadesEnPantalla.test.tsx`: `Test Files 2 passed | 1 skipped (3)` / `Tests 60 passed | 3 skipped (63)`.
  La guardia `estado-con-info` en verde sin tocarla.
- `pnpm run typecheck` (`tsc --noEmit`): exit 0.
- `pnpm exec eslint` de los 10 archivos tocados: 0 errores, 1 warning previo en
  `DineroIdentidadesEnPantalla.test.tsx:542` (directiva `eslint-disable` sin uso; línea no tocada).

Veredicto (T3.3, T3.4): hechas; casos de R9/R10/R11 en verde, tests existentes verdes sin cambiar valores, typecheck en 0, sin archivos fuera de la lista.

## Tanda 5 — T3.6 rótulos con impuesto de órdenes (frontend_dev, 2026-11-20)

### Archivos

- Nuevo: `app/(app)/ordenes/_components/rotulos-con-impuesto.ts` (`rotuloFleteConImpuesto`, `rotuloComisionConImpuesto`).
- `app/(app)/ordenes/_components/ordenes-columns.tsx`: `flete`/`comision` con `rotulo…ConImpuesto(IMPUESTO_ROTULO)`;
  nueva `conImpuestoDelPais(columnas, impuesto)` (identidad con `IMPUESTO_ROTULO`).
- `app/(app)/ordenes/_components/OrdenesModule.tsx`: `useImpuestoDelPais()`, `useMemo(conImpuestoDelPais(columnsProp ?? ordenesColumnsDe(etiquetas), impuesto))`
  y `columnasDescargaOrdenes(etiquetas, impuesto)`.
- `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts`: caída en `COLUMNAS_DESCARGA_ORDENES`;
  `columnasDescargaOrdenes(etiquetas, impuesto)` sustituye los encabezados de `fleteConIva`/`comisionConIva`.
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`: borradas `AVISO_FILA_FLETE`/`AVISO_FILA_COMISION`
  (sin otros llamantes); filas con `rotulo…ConImpuesto(useImpuestoDelPais())`.
- Tests: `tests/unit/components/ordenes-descarga-columnas.test.ts`, `tests/components/moneda-del-pais-ordenes.test.tsx`.

### R → test

- R16: `moneda-del-pais-ordenes.test.tsx` > «SLT-240 R16 — rótulos con impuesto de órdenes» (listado montado
  por `OrdenesModule` con «Flete + IGV»/«Comisión + IGV»; selector de columnas de la descarga con los dos;
  aviso con las dos filas) y «censo “sin IVA”» (4 archivos de design §5 + contraprueba).
  `ordenes-descarga-columnas.test.ts` > «SLT-240/R16» (caso «IGV»: solo cambian `fleteConIva`/`comisionConIva`;
  `conImpuestoDelPais` con «IGV» solo cambia `flete`/`comision`).
- R12: mismo archivo, casos «R13 y R12» del listado y del aviso (CR = sin proveedor = «Flete + IVA»);
  `conImpuestoDelPais(cols, IMPUESTO_ROTULO)` devuelve el mismo arreglo (`toBe`); la lista de 22 encabezados
  intacta; siguen verdes sin tocarlos `ordenes-columns.test.tsx`, `OrdenesPage.test.tsx`,
  `OrdenesDescargaColumnas.test.tsx`, `detalle-columnas.test.tsx`, `recibidas-columns.test.tsx`,
  `ordenes-columnas-money-safe.guardia.test.ts`, `descarga-dataset-roundtrip.test.ts`, `descarga-170-volumen.test.ts`,
  `archivo-identico-470.test.ts`.
- R15: caso «IGV» de la descarga (claves y orden del contrato; solo dos encabezados distintos); `filaDescargaOrden` sin cambios.
- R17: ningún texto de formato de entrada tocado; el «IVA» solo sale de `IMPUESTO_ROTULO` (censo «sin IVA»).

### Salida real (worktree, NODE_OPTIONS=--max-old-space-size=8192)

- `pnpm exec vitest run tests/components/moneda-del-pais-ordenes.test.tsx tests/unit/components/ordenes-descarga-columnas.test.ts`:
  `Test Files 2 passed (2)` / `Tests 58 passed (58)`.
- `pnpm exec vitest related --run` de los 5 archivos de producción: `Test Files 73 passed (73)` / `Tests 1027 passed (1027)`
  (pasa de ~60 archivos, pero corrió entero y en verde).
- Explícitos (los 6 de «sin tocarlos» + 3 de descarga): `Test Files 9 passed (9)` / `Tests 141 passed (141)`.
- `pnpm run typecheck` (`tsc --noEmit`): sin errores.
- `pnpm exec eslint` de los 7 archivos tocados: sin salida (0 errores, 0 warnings).

Veredicto (T3.6): hecha; R16 en verde con CR idéntico, sin «IVA» literal nuevo en producción, solo archivos de la lista.

## Tanda 6 — T4.1, T4.2 y mapa consolidado (frontend_dev, 2026-11-20)

### Archivos
- `tests/components/moneda-del-pais-pantallas.test.tsx` — `CENSO_MONEDA_DEL_PAIS` gana los 12 archivos de design §7;
  el caso «rojo si un archivo REAL del censo vuelve a un formateador implícito» añade, por archivo, la
  reescritura con `formatMonto(` de `@/lib/config/moneda` (además de la de `money(`, que ya tenía).
- `tests/components/moneda-del-pais-ordenes.test.tsx` — `describe` «SLT-240 R19 — excepciones de pais-sin-literales».
- `tests/unit/guards/_pais-sin-literales-excepciones.ts` sin tocar: no hay entradas de SLT-240; `FichaQueLoRetira`
  conserva `SLT-240` (decisión P2); `TOPE_EXCEPCIONES` sigue en 19.

### Mapa R → test (consolidado, verificado con grep sobre cada archivo)

Abreviatura: `MPO` = `tests/components/moneda-del-pais-ordenes.test.tsx`.

| R | Archivo | Test |
|---|---|---|
| R1 | `MPO` | «SLT-240 R1 — celdas de importe del listado de órdenes (ordenes-columns)» › «con la moneda de prueba, monto, flete, fulfillment y comisión salen en la moneda del país» |
| R2 | `MPO` | «SLT-240 R2 — resumen de la carga masiva (OrdenesCargaResumen)» › «con la moneda de prueba, el monto sale en «€» con espacio de miles» y «sin monto pinta `-`…» |
| R3 | `MPO` | «SLT-240 R3 — tabla del monto redondeado (OrdenesConMontoAjustadoTabla)» › «con la moneda de prueba (0 decimales), símbolo y miles del país y la cola de 2 decimales» |
| R4 | `MPO` | «SLT-240 R4 — aviso de cambio de ubicación (CorregirUbicacionAviso)» › «con la moneda de prueba, flete y comisión…» y «la ubicación sin tarifa sigue diciendo «Sin tarifa configurada»…» |
| R5 | `MPO` | «SLT-240 R5 — vista previa de la etiqueta (EtiquetaGuia)» › «con la moneda de prueba…» y «sin monto pinta `-`…» |
| R6 | `tests/unit/pdf/etiquetas-dos-generadores.test.ts`; `tests/components/EtiquetasGuiaModal.test.tsx`; `tests/components/EtiquetaGuiaPreview.test.tsx` | «SLT-240 R6 — con la moneda del pais, el PDF del navegador dice el importe del lote»; «SLT-240 R6: dentro del proveedor del pais, el PDF se pide con la moneda del pais»; «SLT-240 R6 — paridad vista previa <-> PDF con la moneda del pais» |
| R7 | `tests/unit/pdf/etiquetas-caracter-no-cubierto.test.ts` | «SLT-240 — una moneda cuyo simbolo la fuente embebida no cubre» › «R7: lanza ErrorCaracterNoImprimible desde el IMPORTE y sin haber escrito nada» |
| R8 | `MPO` | «SLT-240 R8 — tarjeta de novedades (PosOrderCardDetalle + novedadAOrdenCard)» › «con la moneda de prueba…» |
| R9 | `MPO` | «SLT-240 R9 — indemnización de la cola de incidentes» › «columna del histórico: … sin importe, `—`», «detalle: con la moneda de prueba…», «detalle sin importe (pendiente): `—`…» |
| R10 | `MPO`; `tests/unit/config/moneda-formato-pais.test.ts`; `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` | «SLT-240 R10 — tope de la indemnización…» › «con la moneda de prueba (0 decimales), la ayuda y el error…» y «el tope anunciado con una moneda de 0 decimales NUNCA queda por encima…»; «formatearTopeEn — la cota en la moneda del país (SLT-240 R10)»; «`moneyTope` comparte el aspecto pero NUNCA queda por encima (cota)» |
| R11 | `MPO` | «SLT-240 R11 — importe del registro de acciones (HistorialAccionesModule)» › «con la moneda de prueba, el monto sale en la moneda del país; sin monto, `—`» |
| R12 | `MPO` + existentes | los casos «R12: con la moneda de CR…» de cada `describe` de R1–R5, R8–R11 y R16; `tests/components/IncidentesAdminModule.test.tsx` › «un monto por encima del TOPE se bloquea…» (literal `₡9.999.999.999,99` intacto); `tests/unit/components/ordenes-descarga-columnas.test.ts` › «R12: `conImpuestoDelPais` con el rótulo de la plataforma devuelve EL MISMO arreglo»; tests existentes de las pantallas verdes sin cambiar valores (tandas anteriores) |
| R13 | `MPO` | los casos «R13: sin proveedor…» de cada `describe` de R1–R5, R8–R11 y R16 |
| R14 | `tests/unit/components/etiquetas-pdf.test.ts` | «SLT-240 R14 — sin moneda por defecto en el PDF del navegador» › «buildEtiquetasPdf y drawEtiqueta no compilan sin moneda (lo hace cumplir el typecheck)» y «en ejecucion, sin moneda no imprime…» |
| R15 | `tests/unit/components/ordenes-descarga-columnas.test.ts`; `tests/unit/components/historial-acciones-descarga-columnas.test.ts`; `tests/components/HistorialAccionesValorInfo.test.tsx` | «R16/R15: con «IGV», la descarga cambia SOLO los encabezados del flete y la comisión»; los otros dos sin cambiar valores esperados. **Verificación de diff:** el reviewer comprueba que de los `*-descarga-columnas.ts` solo cambia `ordenes-descarga-columnas.ts`, y solo en sus encabezados |
| R16 | `MPO`; `tests/unit/components/ordenes-descarga-columnas.test.ts` | «SLT-240 R16 — rótulos con impuesto de órdenes» (listado, descarga y aviso con «IGV»); «SLT-240 R16 — censo «sin IVA» de los rótulos…» (+ contraprueba); «SLT-240/R16 — los rótulos con impuesto de órdenes, con el del país» |
| R17 | `tests/components/IncidentesAdminModule.test.tsx` | «un monto por encima del TOPE se bloquea, y el mensaje dice QUÉ corregir» (literal «(10 dígitos y 2 decimales)…» sin cambios). **Verificación de diff:** el reviewer comprueba que no cambia ningún texto de formato de entrada ni un «IVA» fuera de los archivos de T3.6 |
| R18 | `tests/components/moneda-del-pais-pantallas.test.tsx` | «SLT-235/T4.1 — censo de R18…» › «R18: $archivo no llama a los formateadores implícitos ni lee monedaConfig» (con los 12 de design §7) y «R18: rojo si un archivo REAL del censo vuelve a un formateador implícito» (`money(` y `formatMonto(` de `@/lib/config/moneda`) |
| R19 | `MPO`; `tests/unit/guards/pais-sin-literales.guardia.test.ts` | «SLT-240 R19 — excepciones de pais-sin-literales» › «ninguna excepción queda a nombre de SLT-240» y «el tope no crece…»; la guardia en verde sin cambios |

Todos los R1–R19 tienen test. R15 y R17 llevan además la comprobación de diff del reviewer (T4.3).

### Salida real (worktree, NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm exec vitest run tests/components/moneda-del-pais-pantallas.test.tsx tests/components/moneda-del-pais-ordenes.test.tsx`:
  `Test Files 2 passed (2)` / `Tests 127 passed (127)`.
- `pnpm run test:guardias`: `Test Files 357 passed | 3 skipped (360)` / `Tests 5419 passed | 28 skipped (5447)`.
- `pnpm run typecheck` (`tsc --noEmit`): exit 0.
- `pnpm run lint`: `✖ 249 problems (0 errors, 249 warnings)`, exit 0; `pnpm exec eslint` de los 2 archivos tocados: sin salida.

Veredicto (T4.1, T4.2): hechas; censo con los 12 archivos y su contraprueba `money(`/`formatMonto(`, R19 con su caso, mapa R1–R19 completo.
