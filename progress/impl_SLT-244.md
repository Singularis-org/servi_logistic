# SLT-244 «Moneda e impuesto del país en pantallas: componentes de cierres» · implementación

## Tanda A (frontend_dev, 2026-11-23): T1.1, T1.2, T2.1

### Archivos
Producción (12):
- `components/private/cierres/cola/ColaCierres.tsx` (11 `money(` → `formatearMontoEn(moneda, …, SIN_MONTO_RAYA)`; cada tabla, `PanelSolicitados` y `PagoEntregadoCelda` leen `useMonedaDelPais()`; `celdaSolicitado`/`celdaBodega` reciben la moneda)
- `components/private/cierres/cola/TablaColaPropia.tsx` (3 `money(`; `columnasTablaPropia(acciones, moneda)` y `columnasTablaPropiaMovil(moneda)`: son funciones de columnas, no componentes, así que la moneda la lee `ColaCierres` y se la pasa)
- `components/private/cierres/detalle/CifrasCierre.tsx`, `Cuenta.tsx`, `DineroCierre.tsx`, `MensajerosCierreBodega.tsx` (leen el hook)
- `components/private/cierres/detalle/detalle-cierre-labels.ts` (5 funciones nuevas; salen sus 5 constantes y el import de `IMPUESTO_ROTULO`)
- `components/private/cierres/fila/fila-gestion-labels.ts` (`deEsoImpuesto`, `impuestoConPorcentaje(pct, pais)`; salen `DE_ESO_IVA` e `ivaConPorcentaje`)
- `app/(app)/cierres-admin/_components/cierre-labels.ts` (4 funciones; las constantes quedan = función con `IMPUESTO_ROTULO`)
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` (solo las 3 constantes + import de `IMPUESTO_ROTULO`)
- `components/private/cierres/detalle/detalle-cierre-vista.ts` (nuevo `PaisDelCierre`, design §4.1; ajuste provisional, abajo)
- `components/private/cierres/fila/fila-gestion-vista.ts` (ajuste provisional, abajo)

Tests (1): `tests/components/moneda-del-pais-cierres-componentes.test.tsx` (nuevo, 20 casos).

### Ajustes provisionales (los retiran T2.2 / T2.3)
- `detalle-cierre-vista.ts`: llama a `notaLeQueda*`, `fletePorEntregadoConImpuesto`, `comisionCodConImpuesto` e `impuestoNoEsDeLaEmpresa` con `IMPUESTO_ROTULO` (importado con comentario «provisional»).
- `fila-gestion-vista.ts`: igual con `IMPUESTO_ROTULO`, y `impuestoConPorcentaje(pct, PAIS_PROVISIONAL)` con `{ MONEDA_PLATAFORMA, IMPUESTO_ROTULO }`.
- Mismo texto que antes; hasta T2.2/T2.3 estos dos archivos importan `IMPUESTO_ROTULO` (R13 aún no se cumple en ellos).

### Mapa R → test (tanda A)
- R1 → `moneda-del-pais-cierres-componentes.test.tsx > SLT-244 R1` (mensajeros Pendientes/Resueltos, bodega central, A consolidar, Solicitados, cola propia escritorio y teléfono, «—» sin importe)
- R2 → `> SLT-244 R2` (CifrasCierre con métodos y «—», Cuenta línea y aparte, DineroCierre reparto y por tienda, MensajerosCierreBodega)
- R6 → `> SLT-244 R6` (las 14 funciones de design §5 con «IGV», literales a mano; con «IVA», texto de hoy)
- R9/R10 → cada caso de R1/R2 en tres montajes (`compruebaCostaRicaYCaida` + `compruebaImportes`); R6 con «IVA»
- R5 (parcial) → `impuestoConPorcentaje` con el separador de la moneda («3.5» / «3,5»)

### Comandos (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck` → `tsc --noEmit`, EXIT 0
- `pnpm exec eslint <13 archivos tocados>` → EXIT 0, sin avisos
- `pnpm exec vitest run` (test nuevo, CierresAdminModule, ColaCierres×3, CierreDia×6 + cola-propia-vista, DetalleCierre, DetalleCierreBodega, DetalleCierreDinero, DineroIdentidadesEnPantalla, rechazo-nombre-466-app, CierreDesgloseModeloNuevo, CierreCobrosDeLaGestion, moneda-del-pais-cierres-admin, guardias liquidacion-money-safe, flete-por-rechazo-censo, rechazo-nombre-466) → `Test Files 23 passed (23) · Tests 569 passed (569)`
- Extra: FilaGestion, fila-gestion-vista, detalle-cierre-vista, moneda-del-pais-tarifas, guardias cierres-trato-tu, cierre-bodega-vocabulario, pwa-mensajero-sin-recorte → `Test Files 7 passed (7) · Tests 532 passed (532)`

### Veredicto
Tanda A en verde: cola y detalle en la moneda del país, rótulos con impuesto como funciones; sin bloqueos.

## Tanda B (frontend_dev, 2026-11-23): T2.2, T2.3

### Archivos
Producción (7):
- `components/private/cierres/detalle/detalle-cierre-labels.ts` (`pieResumenMensajero(…, moneda)`, `pieBodega(…, moneda)` con `formatearMontoEn`; sale `money`)
- `components/private/cierres/detalle/detalle-cierre-vista.ts` (`cifrasDe`, `lineasDinero` y `pieTextoDe` con `pais: PaisDelCierre` obligatorio en las dos sobrecargas, en `pieTextoDe` antes del opcional; `notaOrigenIngresoBodega(d, moneda)`; `cuentaFactura`/`cuentaQueda`/`cifrasBodega` reciben el impuesto; `FLETE_*_CON_IVA_LABEL` → `fleteDevConImpuestoLabel`/`fleteNoEntregadasConImpuestoLabel`; salen `money` e `IMPUESTO_ROTULO`)
- `components/private/cierres/detalle/DetalleCierre.tsx` (`Cuerpo` lee `useMonedaDelPais()` y `useImpuestoDelPais()`, arma `pais` con `useMemo` y lo pasa a `modeloDe`)
- `components/private/cierres/fila/fila-gestion-labels.ts` (`porcentajeDe(valor, base, moneda)`, `conPorcentaje(rotulo, pct, base, moneda)` con `porcentajeParaVer` y `formatearMontoEn`; salen `money` y `porcentajeParaVerEnLaPlataforma`)
- `components/private/cierres/fila/fila-gestion-vista.ts` (`tarjetasDe(g, a, c, pais)`, `calculoDe(g, x, pais)`; rótulos con las funciones del impuesto de `cierre-labels.ts` y `cierre-detalle-shared.tsx`; salen `PAIS_PROVISIONAL`, `MONEDA_PLATAFORMA`, `IMPUESTO_ROTULO` y las constantes `IVA_*`)
- `components/private/cierres/fila/FilaGestion.tsx` (lee los dos hooks, pasa `pais`; sus 2 `money(` → `formatearMontoEn(moneda, …, SIN_MONTO_RAYA)`; `TarjetaMensajero` lee `useMonedaDelPais()`)
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts` (**provisional**: solo `porcentajeDe(valor, base, MONEDA_PLATAFORMA)` y el import, con `// provisional SLT-244 T3.1`)

Tests (3):
- `tests/unit/utils/detalle-cierre-vista.test.ts` (35 llamadas con `PAIS_PLATAFORMA`; ningún valor esperado cambia: el diff sin el argumento solo añade la constante)
- `tests/unit/utils/fila-gestion-vista.test.ts` (27 llamadas, ídem)
- `tests/components/moneda-del-pais-cierres-componentes.test.tsx` (+21 casos; 41 en total)

### Provisionales que quedan
- Ninguno en `components/private/cierres/**`: sin `IMPUESTO_ROTULO`, `PAIS_PROVISIONAL`, `money(` ni `porcentajeParaVerEnLaPlataforma` fuera de comentarios (Grep).
- `cierres-gestiones-modelo-nuevo-descarga-columnas.ts`: `MONEDA_PLATAFORMA` en `porcentajeDe` y su `money(` del monto fijo; los retira T3.1.
- `porcentajeParaVerEnLaPlataforma` sigue en `tarifas-textos.ts` sin llamadores de cierres; lo borra T4.1.

### Mapa R → test (tanda B), en `moneda-del-pais-cierres-componentes.test.tsx`
- R3 → `SLT-244 R3` (pie de mensajero y de bodega con «€» / «₡»; `disponibles` tras `pais`; nota de bodega del modelo viejo «€2 700»; `pieResumenMensajero`/`pieBodega`; el pie montado en los tres montajes)
- R4 → `SLT-244 R4` (fila central desplegada: columnas y cuatro tarjetas en tres montajes; ganancia de la tarjeta del mensajero; «—» sin importe; fulfillment «IGV 13 %»)
- R5 → `SLT-244 R5` («2 % de €25 000»; «3,5» con `MONEDA_CR` y «3.5» con `MONEDA_DE_PRUEBA`; modelo viejo «IGV flete (13 % de €4 000)», «Comisión COD (4 % de €25 000)», «IGV comisión (13 % de €1 000)», devolución; «Ver cómo se calculó» montado)
- R6 → `SLT-244 R6 — el detalle montado…` («Flete por entregado + IGV», «IGV (no es de la empresa)», «sin IGV, …»; con CR y sin proveedor, «IVA») y `R6 — la fila montada…` («de eso, IGV (no es de la empresa)», «Flete por novedad + IGV»)
- R8 → `llamadasSinPais` con `@ts-expect-error` en `cifrasDe`, `lineasDinero`, `tarjetasDe`, `calculoDe` y `porcentajeDe` (lo comprueba `pnpm run typecheck`)
- R9/R10 → cada caso montado pasa por `compruebaCostaRicaYCaida`; `detalle-cierre-vista.test.ts` y `fila-gestion-vista.test.ts` verdes sin cambiar valores

### Comandos (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck` → `tsc --noEmit`, EXIT 0 (antes de migrar los tests, solo señaló los dos `*-vista.test.ts`: ningún otro llamador)
- `pnpm exec eslint <10 archivos tocados>` → `No issues found`, EXIT 0
- `pnpm exec vitest run` (test nuevo, detalle-cierre-vista, fila-gestion-vista, FilaGestion, DetalleCierre, DetalleCierreBodega, DetalleCierreDinero, DetalleCierreGestiones, DineroIdentidadesEnPantalla, cierres-gestiones-modelo-nuevo-descarga, columnas-sensibles.guardia, guardias cierre-bodega-vocabulario, cierres-trato-tu, liquidacion-money-safe, pwa-mensajero-sin-recorte) → `Test Files 15 passed (15) · Tests 647 passed (647)`

### Veredicto
Tanda B en verde: detalle y fila con moneda e impuesto obligatorios desde los hooks; sin provisionales en la carpeta de cierres ni bloqueos.

## Tanda C — T3.1 (descarga «Gestiones») y T4.1 (`porcentajeParaVerEnLaPlataforma`)

### Paso 0 (T3.1, design §10)
- Borrador de `filaGestionModeloNuevoEn(moneda)` + `textoTarifa(t, moneda)` en `cierres-gestiones-modelo-nuevo-descarga-columnas.ts`, y `pnpm exec vitest run tests/unit/descarga/columnas-sensibles.guardia.test.ts` ANTES de tocar nada más → `Test Files 1 passed (1) · Tests 5 passed (5)`.
- La guardia invoca la factoría con la sonda como moneda y otra vez con la sonda como DTO (`fila(x)(dto)`): no lanza. Guardia sin tocar.

### Archivos
Producción (4):
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas.ts` — `textoTarifa(t, moneda)` (monto → `${MONTO_FIJO} ${formatearMontoEn(moneda, valor, SIN_MONTO_RAYA)}`, porcentaje → `porcentajeDe(valor, base, moneda)`); `filaGestionModeloNuevoEn(moneda)` sustituye a `filaGestionModeloNuevo`; salen el import de `money` y el provisional `MONEDA_PLATAFORMA`.
- `app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga.ts` — `moneda: FormatoMoneda` obligatoria en `LibroGestionesEntrada`; `libroGestiones` llama a la factoría una vez.
- `app/(app)/cierres-admin/_components/DescargarGestionesDialog.tsx` — lee `useMonedaDelPais()` y la pasa a `libroDe` → `libroGestiones`.
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts` — borrada `porcentajeParaVerEnLaPlataforma` y el import de `MONEDA_PLATAFORMA` que solo usaba ella. El typecheck no encontró otro llamador.

Tests (3):
- `tests/unit/descarga/cierres-gestiones-modelo-nuevo-descarga.test.ts` — 8 `libroGestiones` con `moneda: MONEDA_PLATAFORMA` y 3 `filaGestionModeloNuevoEn(MONEDA_PLATAFORMA)(…)`; ningún valor esperado cambia.
- `tests/components/moneda-del-pais-tarifas.test.tsx` — sale el caso «R18: `porcentajeParaVerEnLaPlataforma`…» y su import.
- `tests/components/moneda-del-pais-cierres-componentes.test.tsx` — +5 casos (46 en total) y un `@ts-expect-error` más; dobles de `descargar-blob` y espía de `construirDescarga` (pasa al real), como en `DescargarGestionesModeloNuevo.test.tsx`.

### Mapa R → test (tanda C), en `moneda-del-pais-cierres-componentes.test.tsx`
- R7 → `SLT-244 R7 — la descarga «Gestiones»…`: `filaGestionModeloNuevoEn(MONEDA_DE_PRUEBA)` da «Monto fijo €3 500 · grupo «San José centro» de la zona Centro», «2 % de €25 000 · valor base de la zona Centro» y «Monto fijo €2 500 · …» (pago); las demás celdas y las claves, iguales a las de `MONEDA_PLATAFORMA` (central y satélite); `libroGestiones` con `MONEDA_DE_PRUEBA` lleva «€» en la hoja «Gestiones».
- R7 → `SLT-244 R7 — DescargarGestionesDialog arma el libro…`: montado con el proveedor de prueba, la tarifa del libro que recibe el generador lleva «€»; con CR = sin proveedor = «₡3.500» / «₡25.000».
- R8 → `llamadasSinPais` gana `// @ts-expect-error R8: libroGestiones sin moneda` (lo comprueba `pnpm run typecheck`).
- R9 → `cierres-gestiones-modelo-nuevo-descarga.test.ts` verde sin cambiar valores; caso «con MONEDA_CR, el texto de hoy».

### Comandos (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck` → `tsc --noEmit`, EXIT 0
- `pnpm exec eslint <7 archivos tocados>` → EXIT 0, sin avisos
- `pnpm exec vitest run` (moneda-del-pais-cierres-componentes, cierres-gestiones-modelo-nuevo-descarga, columnas-sensibles.guardia, cierres-gestiones-paridad, DescargarGestionesDialog, DescargarGestionesModeloNuevo, moneda-del-pais-tarifas, moneda-del-pais-cierres-admin) → `Test Files 8 passed (8) · Tests 237 passed (237)`
- Finales de línea: LF en los 7 archivos (sin `\r`).

### Veredicto
Tanda C en verde: la tarifa de la descarga «Gestiones» sale en la moneda del país, `moneda` obligatoria en `libroGestiones` y `porcentajeParaVerEnLaPlataforma` borrada; sin bloqueos.
