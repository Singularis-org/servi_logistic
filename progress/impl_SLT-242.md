# impl SLT-242 «Moneda del país en pantallas: analítica»

Implementer, 2026-11-21. Rama `feature/SLT-242-moneda-pantallas-analitica`, apilada sobre SLT-241.
Archivos del diff desde el spec aprobado (`98793e82`), sin contar `specs/` ni `progress/`: **32/40**, todos de «Archivos esperados».

## Tandas (commits locales, sin push)
1. `ece9bf02` T1.1–T1.3 + T4.2 adelantada (backend_dev). T4.2 se adelantó porque las 2 excepciones de SLT-242 eran justo `metrics.ts` y `AnaliticaFinancieraService.ts`: sin ella, `pais-sin-literales` daba rojo en «la lista solo baja».
2. `3cd38de5` bloques 2 y 3, T2.1–T3.4 (frontend_dev, uno detrás de otro). Juntos en un commit: el bloque 2 solo deja el typecheck con 4 TS2345 en `TableroFinanciero.tsx`/`PanelConciliacion.tsx`, que cierra el bloque 3.
3. T4.1 censo R15 (backend_dev).

## Archivos
Producción (20): `components/private/analytics/{formato.ts, CifraAnalitica.tsx (nuevo), KpiValor, KpiCard, GraficaBarras, GraficaDonut, GraficaLineas, GraficaRanking, GraficaReparto, SerieTextual, TablaResumen}.tsx`;
`app/(app)/analitica/_components/{financiero/TableroFinanciero, financiero/PanelConciliacion, entregas/ProductosTabla, entregas/DineroProductoDetalle, finanzas/KpisFinancieros}.tsx`;
`lib/analytics/metrics.ts`, `lib/services/AnaliticaFinancieraService.ts`, `lib/actions/analitica-financiera.ts`, `lib/types/analitica-financiera.ts` (solo comentario).

Tests (12): `tests/components/moneda-del-pais-analitica.test.tsx` (nuevo), `tests/components/moneda-del-pais-pantallas.test.tsx`, `tests/unit/guards/_pais-sin-literales-excepciones.ts`, `tests/unit/components/analytics-formato.test.ts`, `tests/unit/components/analytics-paquete-guard.test.ts`, `tests/components/{AnalyticsTablaResumen, AnalyticsKpiCard, TableroFinanciero, PanelConciliacion, ProductosTablaDinero}.test.tsx`, `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`, `tests/unit/guards/tablero-financiero.guardia.test.ts`.
Los tests existentes que cambian solo cambian la forma de llamar (tercer argumento `MONEDA_PLATAFORMA`); ningún valor esperado cambia.

## Para el reviewer
- **Desviación de design §5.2 (T3.4):** `empresaPista` y `retornoPista` siguen en `DETALLE_DINERO_TEXTOS.totales`, calculadas con `pistasConImpuesto(IMPUESTO_ROTULO)`, porque `ProductosTablaDinero.test.tsx`, `rechazo-nombre-466-app.test.ts` y `textos-455-recorrido.test.ts` las leen de ahí y no se podían tocar. El componente ya no las lee de la constante: pinta `pistasConImpuesto(useImpuestoDelPais())` con `useMemo`. El censo «sin IVA» del archivo está verde.
- `GraficaMarco.tsx` no entra en el censo de R15: no está en design §4/§8 ni en el diff.
- `etiquetaEnElPais` usa un `Map` para que un id como `"toString"` no devuelva un método heredado.

## Mapa R → test
Todos en `tests/components/moneda-del-pais-analitica.test.tsx` salvo que se diga otro archivo.

| R | Test |
|---|---|
| R1 | `describe("SLT-242 R1 — el tablero financiero y la conciliacion pintan los importes con la moneda del pais")` (7 casos) |
| R2 | `describe("SLT-242 R2 — los componentes del paquete pintan la unidad `moneda` con la moneda del pais")` (12 casos) |
| R3 | `describe("SLT-242 R3 — la tabla y el detalle de productos pintan los importes con la moneda del pais")` |
| R4 | `describe("SLT-242 R4 — MontoAnalitico pinta el importe string…")` (3) y `describe("SLT-242 R4 — las tarjetas financieras pintan el importe con la moneda del pais")` |
| R5 | `describe("SLT-242 R5 — conteos, porcentajes y duraciones no cambian con la moneda del pais")` (6) |
| R6 | `describe("SLT-242 R6 — sin moneda, el typecheck rechaza una unidad que puede ser `moneda`")` (4, con `@ts-expect-error` y el `throw`) |
| R7 | `describe("SLT-242 R7 — el campo `moneda` de cada importe es el codigo de la moneda del pais")` (9) |
| R8 | `describe("SLT-242 R8 — la etiqueta de la metrica del impuesto nombra el impuesto del pais")` (6) |
| R9 | `describe("SLT-242 R9 — la accion lee el pais de la empresa de la sesion y lo pasa al servicio")` (5) |
| R10 | `describe("SLT-242 R10 — sin los datos del pais, la moneda y el rotulo de la plataforma, y la consulta no falla")` (2) |
| R11 | `describe("SLT-242 R11 — el catalogo toma el nombre del impuesto de un solo rotulo")` (3) |
| R12 | Cada caso de pantalla de R1–R4 y R17 se monta con `MONEDA_CR` + «IVA» y exige el mismo texto que sin proveedor; R8 comprueba «Ingreso por IVA» sin país. Más los existentes sin cambiar valores: `TableroFinanciero`, `PanelConciliacion`, `AnalyticsKpiCard`, `AnalyticsTablaResumen`, `ProductosTablaDinero`, `DineroIdentidadesEnPantalla`, `descarga/AnaliticaFinancieraExport`, `analytics-formato`, `dinero-centimos-cuando-existen.guardia`, `analitica-financiera-action` |
| R13 | `describe("SLT-242 R13 — la hoja de cliente sin proveedor pinta con la moneda de la plataforma")` (3) |
| R14 | Lo comprueba el reviewer en el diff (design §10): sin sumas ni restas nuevas, ningún id con «iva» renombrado, `page.tsx` y `DECIMALES_DE_LA_CUENTA` sin cambios, nada de otra rebanada ni de plataforma |
| R15 | `tests/components/moneda-del-pais-pantallas.test.tsx` > «SLT-242 R15: los 17 archivos de la analítica están en el censo y dan rojo con money( o formatMontoString(» |
| R16 | `describe("SLT-242 R16 — la lista de excepciones de `pais-sin-literales` pierde las 2 de SLT-242")` (2) + `tests/unit/guards/pais-sin-literales.guardia.test.ts` |
| R17 | `describe("SLT-242 R17 — las pistas del detalle de dinero nombran el impuesto del pais")` (incluye el censo «sin IVA» y su contraprueba) |

## Salida real (resumida de los informes de los subagentes)
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; con 4 GB se queda sin memoria): 0 errores tras el bloque 3.
- `eslint` sobre los archivos tocados: 0 errores. 1 aviso previo, no tocado: `salidasQueCasan` sin usar en `dinero-centimos-cuando-existen.guardia.test.ts:252`.
- `vitest run tests/components/moneda-del-pais-analitica.test.tsx`: 76/76.
- `vitest run tests/components/moneda-del-pais-pantallas.test.tsx`: 116/116. Prueba de rojo: con `money(1)` añadido a `KpiValor.tsx` fallan 2 (R18 de SLT-235 y R15); restaurado.
- `vitest related --run` bloque 1: 5922 ok, 2 timeouts por carga (`SatelitePaginacion.test.tsx`, `catalogo-produccion.guardia.test.ts`) que pasan solos (17/17); ninguno en el baseline.
- `vitest related --run` bloques 2+3: 52 archivos, 987 ok, 17 saltados, 0 rojos. Aparte, 9 archivos de pantallas/guardias: 267/267.
- `pnpm run test:guardias` (tras cada tanda): 357 archivos ok, 3 saltados; 5419 tests ok, 28 saltados.

## Pendiente (T4.3)
- `./init.sh` y E2E (grupo `dinero`, `e2e/analitica-roles.spec.ts`, `e2e/cierres-admin.spec.ts`, `e2e/guia-api-ejemplos-ejecutables.spec.ts`): por orden del leader corren en CI; no corridos aquí. T4.3 queda sin marcar hasta ese verde.
