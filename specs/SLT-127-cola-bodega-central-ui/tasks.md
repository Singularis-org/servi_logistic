# SLT-127 «Cola de bodega de la central con la cola única» — tasks (C2)

> Zona de trabajo: `frontend_dev` (sin servidor; `design.md > Zona y capas`). Un commit por task.
> Copia `.env` al worktree antes del primer gate y exporta la base desechable antes de cualquier
> `vitest` (memorias «Worktree sin .env = gate ciego» y «vitest related toca la base local»).
>
> **Tamaño:** 28 archivos (70 % de 40) y ~980-1 080 líneas (tope 1 000). Reparto estimado (añadidas +
> borradas): `ColaCierres.tsx` ~120 · vista ~80 · labels ~50 · módulo ~220 · `CierresBodegaResueltosLista`
> ~4 · `ColaCierresBodega.test.tsx` ~160 · `CierresBodegaAdminCola.test.tsx` ~140 · vista test ~80 ·
> 7 tests que abren el detalle ~35 · 3 de descarga ~20 · 3 de paginación ~30 · guardias y censo ~20 ·
> E2E ~95. Si al cerrar T5 `./init.sh` pasa de 1 000 líneas, **para** y el leader resuelve PA-T
> (`requirements.md > Preguntas abiertas`). Para no pasarse: tests de componente por tabla
> (`it.each`), sin fábricas nuevas si las de los tests de bodega de hoy sirven.

## T0 — Comprobaciones previas (sin código de producción)

- [x] **T0.1** Repite el censo de `design.md > Tests y guardias que cambian` con `grep -rl` en `tests/`
  y `e2e/` por: «Ver / decidir el cierre de bodega», «cierre de bodega resuelto de», «Cierres de bodega
  por estado», `"Cierres de bodega (pendientes|resueltos)"` como región o `seccion`/`tabla`,
  «pendientes de decisión.» y «Aún no hay cierres de bodega resueltos», `PAGINACION_BODEGA_`.
  **Hecho:** la lista coincide con `## Archivos esperados`, o el leader tiene el archivo de más.
- [x] **T0.2** Escribe a mano, en el test, el literal que `money()` da hoy para `"349100.00"`,
  `"334100.00"`, `"15000.00"`, `"0.00"` y `"-500.00"` (ejecútalo una vez y cópialo; no lo importes).
  **Hecho:** literales en `ColaCierresBodega.test.tsx` con el comentario de dónde salen.
- [x] **T0.3** Corre `pnpm run test:guardias` en limpio y anota las verdes de partida
  (`cierre-bodega-vocabulario`, `cascada-central-en-las-dos-pantallas`, `contadores-cabecera`,
  `superficie-de-uso`, `cobertura-tablas`, `liquidacion-money-safe`). **Hecho:** línea en
  `progress/features/SLT-127.md > Tandas`.

## T1 — Lógica pura · `frontend_dev` (depende de T0)

- [x] **T1.1** `cola-cierres-vista.ts`: `TipoCola` += `"bodega"`; rama bodega de `columnasCola`;
  `tablistCola`, `folioBodegaCola`, `recibidoCola`, `faltaResaltada`, `accionBodegaDe`
  (`design.md > cola-cierres-vista.ts`). La rama mensajero no cambia.
- [x] **T1.2** `cola-cierres-labels.ts`: los textos de `design.md > cola-cierres-labels.ts`, en «tú».
- [x] **T1.3** `tests/unit/utils/cola-cierres-vista.test.ts`: casos de bodega (columnas en orden, igual
  en las dos pestañas; folio; «—» con `montoRecibido` null; `faltaResaltada` con `"15000.00"`,
  `"0.00"`, `"-500.00"`; las tres acciones por estado, incluido un `rechazado` sin marca → «Ver /
  conciliar»); el caso de columnas de mensajero de hoy sigue igual.
  **Hecho:** test verde; la mutación «`accionBodegaDe` devuelve `verConciliar` para incompleto» lo pone
  rojo.

## T2 — Componente · `frontend_dev` (depende de T1)

- [x] **T2.1** `ColaCierres.tsx`: props en unión discriminada (`design.md > ColaCierres con tipo
  bodega`); `TablaColaMensajero` (código de hoy, movido) y `TablaColaBodega`; `tablist` por
  `tablistCola(tipo)`.
- [x] **T2.2** `tests/components/ColaCierresBodega.test.tsx` (nuevo): lo de `design.md > Verificación >
  Componente`, con literales escritos a mano. Los negativos de R134 buscan valores que no pueden salir
  por casualidad (p. ej. una nota «NOTA-SLT127-ZQ» y un recaudado `"987654.32"`), no textos cortos.
  **Hecho:** verde; `tests/components/ColaCierres.test.tsx` sigue verde **sin tocarlo** (R135); las
  mutaciones «Recibido con `money("0.00")` si es null» y «Falta resaltada siempre» lo ponen rojo.

## T3 — Montaje en `/cierres-admin` › Bodega · `frontend_dev` (depende de T2)

- [x] **T3.1** `CierresBodegaAdminModule.tsx`: página de Conciliados en el módulo con
  `["cierres-bodega:resueltos", page, pageSize, filtros]` y `fallbackData` como la cola; `aplicarFiltros`
  devuelve las dos listas a la página 1; monta `ColaCierres` (`design.md > Montaje`); quita los imports
  y el JSX de `ListaComprobantes`, `CierreBodegaFacturaResumen`, `CierresBodegaResueltosLista`,
  `SegmentedToggle` y `PanelConmutado`; paginaciones con `PAGINACION_POR_CONCILIAR_LABEL` y
  `PAGINACION_CONCILIADOS_LABEL` (PA-P).
- [x] **T3.2** `CierresBodegaResueltosLista.tsx`: solo el comentario de «sin montar; lo retira SLT-115»
  (`design.md > Montaje`). Sin cambios de comportamiento.
- [x] **T3.3** `tests/components/CierresBodegaAdminCola.test.tsx` (nuevo): lo de `design.md >
  Verificación > Módulo`. **Hecho:** verde; las mutaciones «conteo con `items.length`», «Conciliados
  sin `filtros`» y «filtrar solo reinicia la cola» lo ponen rojo; `CierresBodegaAdminRefresco.test.tsx`
  sigue revalidando las dos claves.

## T4 — Tests y guardias que cambian · `frontend_dev` (depende de T3) [P con T5]

- [x] **T4.1** [P] Los 7 tests que abren el detalle: «Ver / decidir el cierre de bodega de Limón» →
  «Ver / conciliar el cierre de bodega de Limón»; en `CierresBodegaAdminDetalleUnico`, además la pestaña
  `tab /^Conciliados/` y «Ver el cierre de bodega de Limón». Mismo comportamiento vigilado.
- [x] **T4.2** [P] Descarga: `CierresDescarga`, `CierresDescargaColumnas`,
  `CierresBodegaDescargaDetallada` (pestaña de bodega `/^Conciliados/` como `tab`). Los nombres de los
  botones de descarga no cambian.
- [x] **T4.3** [P] Paginación: `ColasPaginacion`, `BajoRiesgoPaginacion`, `paginacion-transversal`
  (región, `table`, `tablist`, pestaña, etiqueta y `ruta` de la paginación de Conciliados).
- [x] **T4.4** [P] `censo-tablas.ts`: `ColaCierres` con `CierresBodegaAdminModule.tsx` en `montajes` y
  sin SLT-105 en `montajesPrevistos`; el `nombre` y la `razon` de la tabla mencionan bodega.
  `cascada-central-en-las-dos-pantallas`: dos superficies. `cierre-bodega-vocabulario`: solo si está
  roja (T0.3).
  **Hecho de T4:** `pnpm run test:guardias` y `pnpm exec vitest related --run <archivos de T1-T4>` en
  verde; ningún test borrado ni con `.skip`.

## T5 — E2E · `frontend_dev` (depende de T3) [P con T4]

- [x] **T5.1** `e2e/_escenarios/cierres.ts`: `pestanaDeColaBodega(page, "Por conciliar" | "Conciliados")`
  (`tablist` «Cierres de bodega por estado», `tab` `^<nombre> \d+$`) y `regionColaBodega(page, …)`.
- [x] **T5.2** `e2e/cierre-bodega-satelite.spec.ts`: selectores a los helpers + `filaDeCola`; el describe
  de C1 se reescribe como en `design.md > Verificación > E2E` (conteos `Por conciliar 1` → `0`,
  `Conciliados 1`, «Ver / corregir», pastilla y Falta en la fila).
- [x] **T5.3** `cierres-rediseno.spec.ts:777-778` y `ajuste-pago-mensajero-cierre.spec.ts:294-295`:
  región «Cierres de bodega por conciliar» y «Ver / conciliar el cierre de bodega de …».
  **Hecho de T5:** los tres specs verdes en local con base desechable nueva y `NEXT_PUBLIC_APP_URL` como
  en `gate.yml`, y el grupo `dinero` entero (`pnpm exec playwright test --project=dinero`): la pantalla
  es de dinero (`docs/perfil-agentes.md > Todos los agentes`). Sin reintentos: un inestable se arregla.

## T6 — Cierre (leader)

- [ ] `./init.sh` verde; tamaño medido (PA-T resuelta si pasa de 1 000 líneas).
- [ ] Review OK antes del PR; PR a `dev`.
- [ ] Preview con Carlos: textos (PA3, PA-P), lo que la fila no enseña (PA5), tono de «Recibido
  incompleto» (PA6).
- [ ] **Promoción a `prod` de C1 (SLT-105) y C2 juntas** (PA0-b); no antes de la aprobación en Preview.

## Trazabilidad

| R | Test |
|---|---|
| R32 | `tests/components/ColaCierresBodega.test.tsx` (monta `tipo` bodega, `rol` central; sin tarjetas de cifras); `tests/unit/utils/cola-cierres-vista.test.ts` (`columnasCola("bodega", …)`) |
| R37 | `tests/components/CierresAdminPage.test.tsx` (existente, sin cambios: `group` «Tipo de cierre») |
| R44 | `tests/unit/utils/cola-cierres-vista.test.ts` (columnas y acción por estado); `e2e/cierre-bodega-satelite.spec.ts` (describe de C1 adaptado: incompleto en «Por conciliar», recibido entero en «Conciliados») |
| R127 | `tests/components/CierresBodegaAdminCola.test.tsx` (conteos desde `total`, arranca en «Por conciliar», cambiar de pestaña conserva filtro y página); `tests/components/ColaCierresBodega.test.tsx` (`tablist` «Cierres de bodega por estado») |
| R128 | `tests/components/CierresBodegaAdminCola.test.tsx` (barra sin Mensajero; filtrar → las dos lecturas con filtro y `page: 1`; «Descargar» de la pestaña activa); `tests/components/descarga/CierresDescarga.test.tsx` (adaptado) |
| R129 | `tests/components/ColaCierresBodega.test.tsx` (celdas con literales; «—» sin marca; Falta resaltada solo con faltante; pastilla sin «Aprobado»); `tests/unit/utils/cola-cierres-vista.test.ts` |
| R130 | `tests/unit/utils/cola-cierres-vista.test.ts` (`accionBodegaDe`); `tests/components/ColaCierresBodega.test.tsx` (nombres accesibles y variante); `tests/components/CierresBodegaAdminDetalleUnico.test.tsx` (adaptado: abre el detalle único) |
| R131 | `tests/components/ColaCierresBodega.test.tsx` (descripción; pie solo en «Por conciliar») |
| R132 | `tests/components/ColaCierresBodega.test.tsx` (región, carga, error y vacío por pestaña) |
| R133 | `tests/unit/descarga/censo-tablas.ts` + `cobertura-tablas.guardia.test.ts`; `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`; `tests/components/CierresBodegaAdminCola.test.tsx` (hay `tablist` y `table`, no hay `group` segmentado ni tarjeta-comprobante) |
| R134 | `tests/components/ColaCierresBodega.test.tsx` (negativos con valores imposibles por casualidad) |
| R135 | `tests/components/ColaCierres.test.tsx` y `tests/components/CierresAdminModule.test.tsx` (existentes, verdes sin cambios); `tests/unit/utils/cola-cierres-vista.test.ts` (columnas de mensajero de hoy) |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (ya censa `cola/`); `tests/unit/utils/cola-cierres-vista.test.ts` (las funciones devuelven el string del servidor) |
| R72 | reviewer: el diff no toca `lib/`, `db/` ni Server Actions; guardias de dinero de hoy en verde |

## Archivos esperados

Producción:
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/cola-cierres-vista.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaResueltosLista.tsx`

Tests nuevos o ampliados:
- `tests/components/ColaCierresBodega.test.tsx`
- `tests/components/CierresBodegaAdminCola.test.tsx`
- `tests/unit/utils/cola-cierres-vista.test.ts`

Tests adaptados:
- `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
- `tests/components/CierresBodegaAdminRefresco.test.tsx`
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/components/paginacion/paginacion-transversal.test.tsx`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts` (solo si T0.3 / T4.4 la ve roja)

E2E:
- `e2e/_escenarios/cierres.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`

Total: 28 archivos (27 si la guardia de vocabulario no cambia).
