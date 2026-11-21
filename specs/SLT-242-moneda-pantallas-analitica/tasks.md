# SLT-242 — Moneda del país en pantallas: analítica · tasks

> Requisitos en `requirements.md`; el cómo, en `design.md`. Una task está hecha cuando pasa su criterio
> **y** `pnpm run typecheck` está en verde. `[P]` = puede ir en paralelo con las otras `[P]` de su
> bloque. Cada task añade sus casos a `tests/components/moneda-del-pais-analitica.test.tsx` (archivo
> nuevo, lo crea la primera que llegue). Cada caso de pantalla se prueba con `MONEDA_DE_PRUEBA` + «IGV»,
> con `MONEDA_CR` + «IVA» y sin proveedor: con CR el texto debe ser el mismo que sin proveedor (R12,
> R13). Los tests existentes que solo cambian la forma de llamar **no cambian ningún valor esperado**.

## Bloque 1 — Servidor: catálogo, servicio y acción (R7–R11)

- [ ] **T1.1** [P] `lib/analytics/metrics.ts`: `rotuloIngresoPorImpuesto(impuesto)`,
  `etiquetaEnElPais(metrica, impuesto)`, la etiqueta de `ingreso_iva` con `IMPUESTO_ROTULO` y las 5
  apariciones de «IVA» de las descripciones interpoladas (design §7). Sin «IVA» fuera de comentarios.
  - Casos de R8 (`etiquetaEnElPais` puro) y R11 en `moneda-del-pais-analitica.test.tsx`.
  - *Hecho:* en verde; `modulo-puro.guardia.test.ts`, `catalogo-produccion.guardia.test.ts`,
    `metrics-caja-naturaleza.guardia.test.ts` y el resto de `tests/unit/analytics/` verdes sin tocarlos.
- [ ] **T1.2** `lib/services/AnaliticaFinancieraService.ts`: `PaisDeLaAnalitica`,
  `PAIS_DE_LA_PLATAFORMA`, octavo parámetro del constructor, `importeConNeto` / `importeSoloBruto` con
  el código y la etiqueta de `cabecera` con `etiquetaEnElPais` (design §6.1). Sin `monedaConfig`.
  Corrige el comentario de `moneda` en `lib/types/analitica-financiera.ts`. Depende de T1.1.
  - Casos de R7 y R8 (con los dobles de `_dobles-analitica-financiera.ts`).
  - *Hecho:* en verde; los tests de `tests/unit/services/` que usan `_dobles-analitica-financiera.ts`,
    `financiera-contratos.test.ts`,
    `cache-financiera.guardia.test.ts` y los de integración que construyen el servicio, verdes sin
    tocarlos.
- [ ] **T1.3** `lib/actions/analitica-financiera.ts`: `deps.paisService`, lectura del país con
  `paisParaPantallasDelActor(actor?.organizacionId ?? null, …)` después del `forbidden` y solo sin
  `deps.service`; `construirServicio(logger, pais)` (design §6.2). Depende de T1.2.
  - Casos de R9 y R10 (`vi.mock` del servicio, `paisService` doblado).
  - *Hecho:* en verde; `analitica-financiera-action.test.ts` verde sin tocarlo.

## Bloque 2 — Formateador y paquete de analítica (R2, R5, R6) (en paralelo con el bloque 1)

- [ ] **T2.1** `components/private/analytics/formato.ts`: las dos firmas de `formatearValor`, `"moneda"`
  con `formatearMontoEn(moneda, …)`, lanza si falta la moneda; sin `formatMonto` (design §3).
  - Tests que solo cambian la forma de llamar (tercer argumento `MONEDA_PLATAFORMA`):
    `analytics-formato.test.ts`, `AnalyticsTablaResumen.test.tsx`, `AnalyticsKpiCard.test.tsx`,
    `TableroFinanciero.test.tsx`, `PanelConciliacion.test.tsx`,
    `dinero-centimos-cuando-existen.guardia.test.ts`.
  - `analytics-paquete-guard.test.ts`: la aserción de `formato.ts` pide `formatearMontoEn` en vez de
    `formatMonto` (design §8).
  - Casos de R5 y R6 (`@ts-expect-error` y el `throw`).
  - *Hecho:* en verde.
- [ ] **T2.2** Hoja de cliente `components/private/analytics/CifraAnalitica.tsx` (`CifraAnalitica` y
  `MontoAnalitico`, design §4.2). Depende de T2.1.
  - *Hecho:* casos de R4 (`MontoAnalitico`) y R13 en verde; `analytics-paquete-guard.test.ts` verde.
- [ ] **T2.3** Componentes del paquete (design §4.1 y la fila de `KpiCard` de §4.2). Depende de T2.2.
  - `KpiValor.tsx`, las cinco `Grafica*.tsx`, `SerieTextual.tsx` y `TablaResumen.tsx` leen
    `useMonedaDelPais()`.
  - `KpiCard.tsx` pinta la variación con `CifraAnalitica`, sin `"use client"`.
  - Casos de R2.
  - *Hecho:* en verde; `AnalyticsKpiCard.test.tsx`, `AnalyticsTablaResumen.test.tsx`,
    `AnalyticsPesoBajoUnPunto.test.tsx`, `analytics-paleta.test.ts` y los tests de las gráficas verdes
    sin cambiar valores.

## Bloque 3 — Pantallas de `/analitica` (R1, R3, R4, R17) (depende del bloque 2)

- [ ] **T3.1** [P] Tablero financiero (design §4.2): `TableroFinanciero.tsx` (`TotalDelDto` y la línea
  del bruto) y `PanelConciliacion.tsx` (las tres cifras del cuadre) con `CifraAnalitica`.
  - `tablero-financiero.guardia.test.ts`: el contrapeso acepta `<CifraAnalitica` (design §8).
  - Casos de R1.
  - *Hecho:* en verde; `TableroFinanciero.test.tsx`, `PanelConciliacion.test.tsx`,
    `DineroIdentidadesEnPantalla.test.tsx` y `tablero-financiero.guardia.test.ts` sin cambiar valores.
- [ ] **T3.2** [P] Productos (design §5.1, §5.2): `ProductosTabla.tsx` (`textoPendiente(…, moneda)`,
  columnas con la moneda) y `DineroProductoDetalle.tsx` con `formatearMontoEn(moneda, …, SIN_MONTO_RAYA)`.
  - `ProductosTablaDinero.test.tsx`: sus 2 llamadas a `textoPendiente` pasan `MONEDA_PLATAFORMA`.
  - Casos de R3.
  - *Hecho:* en verde; el resto de tests de productos y `DineroIdentidadesEnPantalla.test.tsx` sin
    cambiar valores.
- [ ] **T3.4** Pistas con el impuesto en `DineroProductoDetalle.tsx` (R17, design §5.2). Depende de
  T3.2 (mismo archivo).
  - `pistasConImpuesto(impuesto)` con `empresaPista` y `retornoPista`; salen de la constante de textos.
  - El componente lee `useImpuestoDelPais()` y la pasa con `useMemo`.
  - Casos de R17 en `moneda-del-pais-analitica.test.tsx`, con el censo «sin IVA» del archivo y su
    contraprueba.
  - *Hecho:* en verde; `ProductosTablaDinero.test.tsx` y `DineroIdentidadesEnPantalla.test.tsx` siguen
    esperando «IVA» sin cambiar ningún valor.
- [ ] **T3.3** [P] `KpisFinancieros.tsx` con `MontoAnalitico` (R4, design §4.2).
  - *Hecho:* caso de R4 en verde; los tests de las tarjetas financieras sin cambiar valores.

## Bloque 4 — Guardias y cierre (depende de los bloques 1–3)

- [ ] **T4.1** Censo de R18 de SLT-235: `CENSO_MONEDA_DEL_PAIS` gana el bloque «SLT-242» con los 17
  archivos de design §8; el test de SLT-241 corta 16 entradas; caso nuevo «los 17 de SLT-242 dan rojo
  con `money(` o `formatMontoString(`» (R15).
  - *Hecho:* en verde, y rojo si en uno de ellos se reescribe un `money(`.
- [ ] **T4.2** `pais-sin-literales` (R16): fuera las 2 entradas de SLT-242, `TOPE_EXCEPCIONES = 12` y la
  línea de «Bajadas» del comentario de cabecera. No se toca `FichaQueLoRetira`.
  - Caso en `moneda-del-pais-analitica.test.tsx`: ninguna excepción con `ficha === "SLT-242"` y tope 12.
  - *Hecho:* `pnpm run test:guardias` en verde.
- [ ] **T4.3** Cierre.
  - `./init.sh` en verde.
  - E2E en local sobre una base desechable (`docs/perfil-agentes.md > E2E en local antes del PR`): el
    grupo `dinero` y los que salgan de `grep -rl` en `e2e/` por `analitica` (hoy
    `e2e/analitica-roles.spec.ts`, `e2e/cierres-admin.spec.ts` y `e2e/guia-api-ejemplos-ejecutables.spec.ts`).
  - El mapa R → test va en `progress/impl_SLT-242.md`.
  - El reviewer comprueba en el diff lo de R14 (design §10).
  - *Hecho:* todo verde y el mapa con los 17 requisitos.

## Archivos esperados

Producción:
- `components/private/analytics/formato.ts`
- `components/private/analytics/CifraAnalitica.tsx`
- `components/private/analytics/KpiValor.tsx`
- `components/private/analytics/KpiCard.tsx`
- `components/private/analytics/GraficaBarras.tsx`
- `components/private/analytics/GraficaDonut.tsx`
- `components/private/analytics/GraficaLineas.tsx`
- `components/private/analytics/GraficaRanking.tsx`
- `components/private/analytics/GraficaReparto.tsx`
- `components/private/analytics/SerieTextual.tsx`
- `components/private/analytics/TablaResumen.tsx`
- `app/(app)/analitica/_components/financiero/TableroFinanciero.tsx`
- `app/(app)/analitica/_components/financiero/PanelConciliacion.tsx`
- `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`
- `app/(app)/analitica/_components/entregas/DineroProductoDetalle.tsx` (también R17: sin archivo nuevo)
- `app/(app)/analitica/_components/finanzas/KpisFinancieros.tsx`
- `lib/services/AnaliticaFinancieraService.ts`
- `lib/actions/analitica-financiera.ts`
- `lib/analytics/metrics.ts`
- `lib/types/analitica-financiera.ts` (solo el comentario del campo `moneda`)

Tests:
- `tests/components/moneda-del-pais-analitica.test.tsx`
- `tests/components/moneda-del-pais-pantallas.test.tsx`
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`
- `tests/unit/components/analytics-formato.test.ts`
- `tests/unit/components/analytics-paquete-guard.test.ts`
- `tests/components/AnalyticsTablaResumen.test.tsx`
- `tests/components/AnalyticsKpiCard.test.tsx`
- `tests/components/TableroFinanciero.test.tsx`
- `tests/components/PanelConciliacion.test.tsx`
- `tests/components/ProductosTablaDinero.test.tsx`
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts`
- `tests/unit/guards/tablero-financiero.guardia.test.ts`

Grep del 2026-11-21. Si el typecheck o un test señalan otro llamante de `formatearValor` con una unidad
que puede ser `moneda`, o de `textoPendiente`, se añade aquí antes del PR (design §11).

## Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 20 | unas 320 |
| Tests | 12 | unas 700 (unas 550 del archivo nuevo) |
| **Total** | **32** | |

Es el 80% de `gate.tamano_pr` (40 archivos): llega al umbral del aviso sin pasarlo. Quedan 8 archivos
de margen; si se pasa de 40, el implementer para y el leader decide. Las líneas quedan muy por debajo
de sus dos topes (1 000 de producción y 3 000 de tests).
