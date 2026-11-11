# SLT-127 «Cola de bodega de la central con la cola única» — bitácora de implementación

## Tanda única (frontend_dev, 2026-11-11): T0-T5

Worktree `.worktrees/SLT-127-cola-bodega-central-ui`, rama `feature/SLT-127-cola-bodega-central-ui`
(desde f797d463). `node_modules`: junction al del checkout principal. Grafo: no consultado (el índice
de este worktree no existe, `design.md > Lo que ya existe`); todo con Grep/Read. Bases desechables
`slt127_a` (vitest y gate), `slt127_e1`, `slt127_e2`, `slt127_e3` (una por corrida E2E), creadas con
`prisma migrate deploy` + `db:seed`; la URL se exporta y nunca se imprime. Sin dependencias nuevas.

### Commits

| SHA | Task |
|---|---|
| b161a12c | T1 — lógica pura (`cola-cierres-vista.ts`, `cola-cierres-labels.ts`) + test |
| b65558e2 | T2 — `ColaCierres` con `tipo` bodega + `ColaCierresBodega.test.tsx` |
| c8e817f4 | T3 — `CierresBodegaAdminModule` monta la cola; comentario en `CierresBodegaResueltosLista` + `CierresBodegaAdminCola.test.tsx` |
| 5b6f7246 | T2 (ajuste) — una sola `DataTable` en `ColaCierres` (`TablaCola<T>` genérica) |
| 578b22bb | T4 — tests y guardias adaptados |
| b0ed03b3 | T5 — E2E |

### Archivos creados / modificados (28, sin `specs/` ni `progress/`)

Producción: `components/private/cierres/cola/ColaCierres.tsx`, `cola-cierres-vista.ts`,
`cola-cierres-labels.ts`; `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`,
`CierresBodegaResueltosLista.tsx`.

Tests nuevos: `tests/components/ColaCierresBodega.test.tsx`, `tests/components/CierresBodegaAdminCola.test.tsx`;
ampliado: `tests/unit/utils/cola-cierres-vista.test.ts`.

Tests adaptados: los 7 que abren el detalle (`CierresBodegaAdminDetalleUnico`, `CierresBodegaAdminRefresco`,
`CierreBodegaDetalleCascadas`, `CierreBodegaDesglosePorTienda`, `CierreBodegaDetalleGestiones`,
`cierre-detalle-ajuste-badge`, `DineroIdentidadesEnPantalla`); descarga (`CierresDescarga`,
`CierresDescargaColumnas`, `CierresBodegaDescargaDetallada`); paginación (`ColasPaginacion`,
`BajoRiesgoPaginacion`, `paginacion-transversal`); `tests/unit/descarga/censo-tablas.ts`,
`tests/unit/descarga/cobertura-tablas.guardia.test.ts` (**de más**, ver desvíos),
`tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`.
`cierre-bodega-vocabulario` siguió verde: no se tocó.

E2E: `e2e/_escenarios/cierres.ts`, `e2e/cierre-bodega-satelite.spec.ts`, `e2e/cierres-rediseno.spec.ts`,
`e2e/ajuste-pago-mensajero-cierre.spec.ts`.

### T0

- **T0.1** — censo con `grep -rlE` en `tests/` y `e2e/`: coincide con `## Archivos esperados`. Salen
  además `ColaCierres.test.tsx` («pendientes de decisión.» de mensajeros), `CierresDescargaNiveles`
  (botón «Descargar Cierres de bodega pendientes», que no cambia), `paginacion-dominios`,
  `contadores-cabecera`, y tests de repositorio/servicio que solo nombran los listados en prosa o en
  su inventario: ninguno cambia.
- **T0.2** — `money()` ejecutado una vez (tsx) y copiado a mano en el test: `"349100.00"` → «₡349.100»,
  `"334100.00"` → «₡334.100», `"15000.00"` → «₡15.000», `"0.00"` → «₡0», `"-500.00"` → «-₡500»,
  `"15500.00"` → «₡15.500». Fecha: `fechaHora("2026-11-08T01:55:00.000Z")` → «2026-11-07 19:55».
- **T0.3** — guardias en limpio: 342/343 verdes; único rojo `dependencias-declaradas-presentes`
  (está en `tests/baseline-rojos.json`). Línea en `progress/features/SLT-127.md > Tandas`.

### Desvíos del design (decididos y anotados)

1. **`ColaCierresProps` sigue siendo la de mensajeros**; la de bodega es `ColaCierresBodegaProps` y el
   componente recibe `ColaCierresProps | ColaCierresBodegaProps`. Con la unión bajo el nombre
   `ColaCierresProps`, el `Partial<ColaCierresProps>` + spread de `ColaCierres.test.tsx` deja de
   compilar, y ese test debía seguir verde sin tocarlo (R135). La unión discriminada es la misma.
2. **Una sola `<DataTable>` en `ColaCierres.tsx`** (`TablaCola<T>`, genérica): `cobertura-tablas`
   cuenta las tablas por archivo; con una por tipo pedía registrar una segunda tabla.
3. **`montajesPrevistos` de `ColaCierres` caduca** (no solo sale SLT-105): con dos montajes reales la
   guardia `cobertura-tablas` exige quitar el campo («la segunda pantalla llegó y el campo sobra»).
   SLT-106 y SLT-108 se añadirán a `montajes` cuando monten la cola. Los casos (b) y (c) de esa guardia
   y «el censo real cumple» pasan a probar la excepción sobre una copia del censo devuelta a un
   montaje (`conUnMontaje`): mismo comportamiento vigilado. Archivo **29.º** respecto a la lista
   (28 en el diff porque la guardia de vocabulario no cambió).
4. **`PAGINACION_POR_CONCILIAR_LABEL` / `PAGINACION_CONCILIADOS_LABEL` viven en el módulo** (`export
   const`), no en `cola-cierres-labels.ts`: `paginacion-transversal` censa esas constantes por ruta en
   `app/`. `PAGINACION_BODEGA_RESUELTOS_LABEL` pierde el `export` en `CierresBodegaResueltosLista.tsx`
   (el componente queda sin montar; si no, el censo contaría 14 controles para 13 listados).

### Mapa R → test

| R | Test |
|---|---|
| R32 | `ColaCierresBodega.test.tsx` («sin tarjetas de cifras…», tablist de bodega); `cola-cierres-vista.test.ts` (`columnasCola · bodega central`) |
| R37 | `CierresAdminPage.test.tsx` (sin cambios, verde) |
| R44 | `cola-cierres-vista.test.ts` (columnas, `accionBodegaDe`); `e2e/cierre-bodega-satelite.spec.ts` (describe de C1 adaptado) |
| R127 | `CierresBodegaAdminCola.test.tsx` (conteos 37/21 desde `total`, arranque en «Por conciliar», pestaña conserva filtro y página); `ColaCierresBodega.test.tsx` (tablist) |
| R128 | `CierresBodegaAdminCola.test.tsx` (barra sin Mensajero; filtrar → las dos lecturas con filtro y `page: 1`; «Descargar» de la pestaña activa); `CierresDescarga.test.tsx` (adaptado) |
| R129 | `ColaCierresBodega.test.tsx` (celdas con literales, «—» sin marca, Falta resaltada si y solo si falta, pastillas sin enum); `cola-cierres-vista.test.ts` |
| R130 | `cola-cierres-vista.test.ts` (`accionBodegaDe`, incluido rechazado sin marca); `ColaCierresBodega.test.tsx` (nombres, variante, `abrir(id)`); `CierresBodegaAdminDetalleUnico.test.tsx` (adaptado) |
| R131 | `CierresBodegaAdminCola.test.tsx` (descripción; pie solo en «Por conciliar»); `ColaCierresBodega.test.tsx` (pie y paginación en el footer) |
| R132 | `CierresBodegaAdminCola.test.tsx` (vacío y error de cada pestaña con sus textos); `ColaCierresBodega.test.tsx` (región, carga, error, vacío) |
| R133 | `censo-tablas.ts` + `cobertura-tablas.guardia.test.ts`; `cascada-central-en-las-dos-pantallas.guardia.test.ts`; `CierresBodegaAdminCola.test.tsx` (tablist y tabla; ni `group`, ni lista de comprobantes, ni «Ver / decidir») |
| R134 | `ColaCierresBodega.test.tsx` (negativos: «987.654», «45.678», «NOTA-SLT127-ZQ», «Marcadora-ZQ7», «modelo nuevo», «Ver detalles») |
| R135 | `ColaCierres.test.tsx` y `CierresAdminModule.test.tsx` (sin tocar, verdes); `cola-cierres-vista.test.ts` (columnas de mensajero) |
| R71 | `liquidacion-money-safe.test.ts` (verde); `cola-cierres-vista.test.ts` (`recibidoCola` devuelve el string del servidor) |
| R72 | sin cambios en `lib/`, `db/` ni Server Actions (diff) |

### Mutaciones (cada una restaurada después)

| Mutación | Resultado |
|---|---|
| `accionBodegaDe` devuelve `verConciliar` para incompleto | `cola-cierres-vista.test.ts`: 1 failed (`accionBodegaDe: incompleto`) |
| Recibido pinta `money("0.00")` si es null | `ColaCierresBodega.test.tsx`: 2 failed |
| Falta resaltada siempre | `ColaCierresBodega.test.tsx`: 1 failed |
| Conteo de pestañas con `items.length` | `CierresBodegaAdminCola.test.tsx`: 4 failed |
| Conciliados sin `filtros` | `CierresBodegaAdminCola.test.tsx`: 1 failed |
| Filtrar solo reinicia la cola | `CierresBodegaAdminCola.test.tsx`: 1 failed |

### Salida real de los comandos

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → sin salida (verde).
- `pnpm exec eslint` sobre los archivos tocados → «No issues found» (un aviso previo en
  `DineroIdentidadesEnPantalla.test.tsx:541`, `eslint-disable` sin uso, no es de este diff).
- `pnpm run test:guardias` → `Test Files 1 failed | 342 passed (343)`; el rojo, solo
  `dependencias-declaradas-presentes` (baseline).
- `pnpm exec vitest related --run <28 archivos>` → `Test Files 38 passed (38) · Tests 734 passed (734)`,
  `RELATED_EXIT=0`. Además, verdes sin tocar: `ColaCierres`, `CierresAdminModule`, `CierresAdminPage`,
  `CierreBodegaTarjetaCascada`, `CierreBodegaMarcaConciliacion`, `CierreFacturaFechaCR`,
  `DeudasD39D40ModeloEnPantalla`, `CierresAdminFiltros`, `CierresDescargaNiveles`,
  `contadores-cabecera`, `liquidacion-money-safe` → `11 passed (11) · 166 passed`.
- `next build` (`NEXT_PUBLIC_APP_URL=http://localhost:3000`) → `BUILD_EXIT=0`.
- E2E (`next start` vía Playwright, puerto 3000, sin reintentos):
  - base `slt127_e1` · `--project=dinero` `cierre-bodega-satelite` + `cierres-rediseno` +
    `ajuste-pago-mensajero-cierre` → `16 passed (1.2m)`, `E2E_EXIT=0`.
  - base `slt127_e2` · `--project=dinero` entero → `95 passed (4.6m)`, `E2E_EXIT=0`.
  - base `slt127_e3` · `e2e/dos-empresas-humo.spec.ts --project=aislamiento` → `18 passed (1.3m)`,
    `E2E_EXIT=0`.
- `node scripts/tamano-pr.mjs` → sin la marca: rojo «28/40 archivos, 1651/1000 lineas»; con la marca
  de Carlos en `progress/features/SLT-127.md`: `AVISO … aceptado por el humano`, `TAM_EXIT=0`.
- `./init.sh` → `INIT_EXIT=1`, **antes de los tests**: «✗ feature_list.json invalido: SLT-105 tiene
  ruta "sdd", que no es una ruta del arnes … SLT-127 tiene ruta "sdd" …». Es la copia local del board
  en la raíz del checkout principal (fuera de este worktree, del leader); no la toqué.

### Veredicto

Hecho T0-T5 con todo verde salvo `./init.sh`, que corta en el validador de `feature_list.json` (ruta
"sdd" de SLT-105 y SLT-127 en la copia local del leader); al corregirla, el leader repite el gate.
