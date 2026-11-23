# SLT-243 «Moneda e impuesto del país en pantallas: cierres del admin» · implementación

## Tanda 1 (frontend_dev, 2026-11-23): bloques 1–3 (T1.1, T2.1, T2.2, T2.3, T3.1, T3.2)

### Archivos
Producción (12):
- `components/shared/DesglosePagoField.tsx` (`mensajeDeCuadre` sin default; sale el import de `MONEDA_PLATAFORMA`)
- `app/(app)/cierres-admin/_components/CorregirPagosDialog.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog.tsx`
- `app/(app)/cierres-admin/_components/MarcaAjustado.tsx`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` (solo `TotalesPanel` + imports)
- `app/(app)/cierres-admin/_components/pago-mensajero-labels.ts`
- `app/(app)/cierres-admin/_components/PendienteLiquidarBadge.tsx`
- `app/(app)/cierres-admin/_components/RegistrarPagoMensajeroDialog.tsx`
- `app/(app)/cierres-admin/_components/PagoMensajeroSeccion.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` (sale el import de `moneyTope`)

Tests (4):
- `tests/components/moneda-del-pais-cierres-admin.test.tsx` (nuevo, 42 casos)
- `tests/components/GestionarOrdenPanelCentimos.test.tsx` (3 llamadas con `MONEDA_PLATAFORMA`)
- `tests/components/moneda-del-pais-pantallas.test.tsx` (caso «sin moneda» → `MONEDA_PLATAFORMA` vs `MONEDA_CR`)
- `tests/components/CierresAdminPagoMensajero.test.tsx` (`registrado("50000.00", MONEDA_PLATAFORMA)`)

Ningún valor esperado de un test que ya existía cambió.

### Mapa R → test (`tests/components/moneda-del-pais-cierres-admin.test.tsx`)
| R | describe |
|---|---|
| R1 | «SLT-243 R1 — /cierre-dia pinta el total general y el pago al mensajero…» (incluye «sin importe» → «—») |
| R2 | «SLT-243 R2 — el dialogo de ajustar el pago…» |
| R3 | «SLT-243 R3 — la marca «ajustado»…» |
| R4 | «SLT-243 R4 — la consolidacion de bodega…» |
| R5 | «SLT-243 R5 — el panel de totales de la correccion…» |
| R6 | «SLT-243 R6 — el pago al mensajero…» (insignia, `registrado`/`anulado`, toast del diálogo de registrar) |
| R7 | «SLT-243 R7 — el aviso de cuadre de CorregirPagosDialog…» |
| R8 | «SLT-243 R8 — el typecheck rechaza…» (3 `@ts-expect-error`; lo comprueba `pnpm run typecheck`) |
| R9 | «SLT-243 R9 — el tope de la indemnizacion…» (ayuda, error de exceso y validador) |
| R12/R13 | En cada describe de R1–R7 y R9: `it.each` sobre los 3 montajes (prueba+IGV, CR+IVA, sin proveedor) y un caso que afirma CR === sin proveedor carácter a carácter, con literales «€…» y «₡…» escritos a mano |

Pendiente para tandas siguientes: R10, R11 (bloque 4), R15, R16 (bloque 5), R14 (reviewer).

### Verificación (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint <16 archivos tocados>`: exit 0, sin salida.
- `pnpm exec vitest run` sobre el test nuevo + 3 tests tocados + CorregirPagosCierre, DineroIdentidadesEnPantalla,
  cierre-detalle-ajuste-badge, AjustarPagoMensajeroDialog, CorregirResultadoCierre, CierrePremioPendiente,
  CierresAdminIndemnizacion, los 9 de `CierreDia*`, ConsolidacionBodegaRefresco, consolidables-paginado,
  liquidacion-money-safe y liquidacion-alcance: **24 archivos, 568 tests, todos verdes**.
- Guardias que leen el fuente (cierres-retirados, pagos-captura, factura-contraste, impresion-flujo,
  cierre-bodega-vocabulario, cierre-detalle-superficies, cascada-central-en-las-dos-pantallas,
  pais-sin-literales, dinero-centimos-cuando-existen): **9 archivos, 263 tests, verdes**.

Veredicto: bloques 1–3 hechos, typecheck/lint/tests tocados en verde, sin bloqueos.

## Tanda 2 (frontend_dev, 2026-11-23): bloque 4 (T4.1, T4.2, T4.3)

### Archivos
- Nuevo: `app/(app)/cierres-admin/_components/encabezados-con-impuesto.ts` (T4.1).
- Declaraciones (T4.2): `cierres-gestiones-modelo-nuevo-descarga-columnas.ts` (5),
  `cierres-resumen-modelo-nuevo-descarga-columnas.ts` (1), `cierres-bodega-modelo-nuevo-descarga-columnas.ts` (1),
  `cierres-gestiones-fundida-descarga-columnas.ts` (3; ya no importa los `*_CON_IVA_LABEL`).
- Componentes (T4.3): `CierresAdminModule.tsx`, `CierresBodegaAdminModule.tsx`, `ConsolidacionBodegaModule.tsx`,
  `DescargarGestionesDialog.tsx`, `DescargarCierresButton.tsx` (`useMemo`).
- Tests: `tests/components/moneda-del-pais-cierres-admin.test.tsx` (describes R10 y R11); solo literales de
  encabezado en las 8 suites de design §7 y en `e2e/cierres-rediseno.spec.ts` (7 líneas, 9 literales; las líneas
  ~141 y ~599 de pantalla no se tocan).
- `cierre-labels.ts` no se toca.

### Mapa R → test (`tests/components/moneda-del-pais-cierres-admin.test.tsx`)
| R | describe / caso |
|---|---|
| R10 | «SLT-243 R10 — …»: (a) 9 encabezados de Perú a mano; las 4 declaraciones con «IGV» (claves, orden y resto iguales); las 9 claves están entre las 4; clave conocida con otro rótulo intacta. (b) mismo arreglo / mismas hojas con `IMPUESTO_ROTULO`. (c) `conImpuestoEnResultado` con libro, sin libro y con error. (d) `DescargarCierresButton` lista «Flete + impuesto (IGV)» |
| R11 | «SLT-243 R11 — censo «sin IVA» …»: 5 archivos sin «IVA» ni rótulos de pantalla; las 4 usan `encabezadoBase`; contraprueba |
| R12 (descargas) | R10 (a) con «IVA» = columna «Costa Rica» a mano; R10 (d) CR = sin proveedor; las 8 suites de §7 pasan con solo los encabezados cambiados |
| R13 (descargas) | R10 (a) `encabezadoBase` = Costa Rica; R10 (d) sin proveedor lista «Flete + impuesto (IVA)» |

### Verificación (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint <20 archivos tocados>`: 0 errores, 1 warning previo (`_recorte` en
  `DescargarGestionesModeloNuevo.test.tsx:166`, línea no tocada).
- vitest, test nuevo + 8 suites de §7: **9 archivos, 216 tests, verdes**.
- vitest, los «Hecho» de T4.1–T4.3 (cierre-resultado-fila-label, rechazo-nombre-466-app, flete-por-rechazo-censo,
  rechazo-nombre-466, cierre-bodega-vocabulario, CierreDesgloseModeloNuevo, DescargarGestionesDialog,
  CierresDescargaColumnas, paginacion-transversal) + cierres-descarga-detallada-frontera: **10 archivos, 138 tests, verdes**.
- `pais-sin-literales.guardia`: 49 tests, verde.
- E2E editado, no corrido (T5.3).

Veredicto: bloque 4 hecho, typecheck/lint/tests tocados en verde, sin bloqueos.
