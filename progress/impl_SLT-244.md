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
