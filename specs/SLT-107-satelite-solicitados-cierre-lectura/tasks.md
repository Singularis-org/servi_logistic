# SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» — tasks

> `[P]` = paralelizable con la task anterior. Servidor (T1) = `backend_dev`; pantalla (T2-T4) =
> `frontend_dev`. T2 depende de T1.1 y T1.3 (tipos). **Antes del primer gate, copia `.env` al
> worktree** (sin `.env` el gate sale verde saltándose la integración) y **exporta la base
> desechable antes de cualquier `vitest`** (`vitest related` toca la base local). Parte de
> `origin/dev` con SLT-111 «Cifras del servidor: reparto en % y señales de la cola» ya mergeada (PA4).

## Tamaño

30 archivos (75 % de 40; fuera `specs/` y `progress/`): 17 de producción (1 nuevo) y 13 de tests y
E2E (1 nuevo).

| Parte | Líneas estimadas |
|---|---|
| Servidor (repositorio, servicios, action, tipos) | ~200 |
| Pantalla (cola, vista, labels, detalle común, módulos, página) | ~440 (≈ 60 salen de `CierresBodegaAdminModule`) |
| **Producción** | **~640** |
| Integración nueva (dos empresas, dos zonas, mutaciones) | ~400 |
| Unit de servicios y repositorio | ~380 |
| Componentes y vista | ~520 |
| E2E | ~260 |
| **Tests y E2E** (con el ×2 de lo que pesan de verdad) | **~1 560** |
| **Total** | **~2 200** |

No cabe en 1 000 líneas: `requirements.md > PA-T`. Si el gate pasa de 2 400 al cerrar T5, para y
avisa.

## T0 — Comprobaciones previas (sin código)

- [x] **T0.1** — Grep de quién llama a `findCierreBodegaConDetalle` y de quién construye
  `CierresBodegaAdminService` o un `ListarConsolidacionServiceResult` tipado (dobles incluidos). Si
  aparece un archivo fuera de `## Archivos esperados`, se añade aquí antes de seguir. **Hecho:** lista
  en `progress/impl_SLT-107.md`.
- [ ] **T0.2** [P] — Grep en `tests/` y `e2e/` (incluido `e2e/_wallet-iva-sl39-siembra.ts`) de lo que
  desaparece de la pestaña «Solicitados»: `CierreBodegaFacturaResumen` dentro de la cola, los
  comprobantes de «Cierres de bodega solicitados» y la página propia de `CierresBodegaSolicitadosLista`;
  y de las guardias que leen `CierresBodegaAdminModule.tsx` o `ConsolidacionBodegaModule.tsx`
  (`contadores-cabecera`, `cascada-central-en-las-dos-pantallas`, `cierre-bodega-vocabulario`,
  `liquidacion-money-safe`, `cierres-descarga-detallada-puerta`). **Hecho:** cada uno que vaya a
  cambiar está en `## Archivos esperados` (si pasa de 32 archivos, para: no cabe en un PR).
- [x] **T0.3** [P] — PA3: leer el servicio de «Corregir recibido» y anotar si reescribe
  `cierre_bodega.conciliado_at`. **Hecho:** nota con archivo y línea.
- [x] **T0.4** [P] — Confirmar que la satélite abre por `hrefDetalleCierre` un cierre del día de su
  zona ya consolidado en un cierre de bodega (R294). **Hecho:** nota con archivo y línea; si no lo abre,
  se para y se pregunta.

## T1 — Servidor (`backend_dev`)

- [x] **T1.1** — `ICierresBodegaAdminRepository` / `CierresBodegaAdminRepository`:
  `AlcanceLecturaBodega` y `findCierreBodegaConDetalle(id, zona, alcance)` con `findFirst` y `zonaId`
  en el `where` cuando el alcance es de zona; `null` antes de leer cierres del día, gestiones, detalle y
  cargos (R280, R281). **Hecho:** `tests/unit/repositories/cierres-bodega-admin-repository.test.ts`
  afirma el `where` exacto de los dos alcances y que con cabecera `null` no hay más llamadas.
- [x] **T1.2** — `CierresAdminService.ts`: `export` de `ocultarFulfillmentSiNoCentral` (sin cambiar su
  cuerpo). `CierresBodegaAdminService`: cuarto parámetro `zonaDelUsuario`; guardia de R280-R282; `null`
  → `no_encontrada` (toda la empresa) o `forbidden` (zona); `ocultarFulfillmentSiNoCentral` en cada
  gestión y `desmarcable: false` para quien no es acceso total (R283). **Hecho:**
  `tests/unit/services/cierres-bodega-admin-service.test.ts`: satélite de su zona `ok` sin fulfillment
  (los seis campos, `fulfillmentCargadoAt` incluido) y `desmarcable` false; mismo doble leído por
  central y satélite → resultados iguales salvo R283 (R284) y mismas llamadas al repositorio; satélite
  sin zona, de otra zona y sin `zonaDelUsuario` → `forbidden` sin firmar evidencias; mensajero →
  `forbidden` sin llamar al repo; aprobar y rechazar con satélite → `forbidden` (R285).
- [x] **T1.3** — `ICierreBodegaService`: `CifraConConteo`, `ResumenSolicitados` y
  `solicitadosResumen` en el `ok` de `ListarConsolidacionServiceResult`. `CierreBodegaService`:
  parámetro `ahora`, `resumenSolicitados(cierres, desde)` exportada y su uso en `listarConsolidacion`
  (sin zona: ceros sin leer la zona horaria) (R287). **Hecho:**
  `tests/unit/services/consolidacion-cola-satelite.test.ts` con literales: tres pendientes 438 163,27 +
  (−1 200,00) + 0,00 = 436 963,27 (signo), recibido a las 00:00 del día 30 hacia atrás entra y a las
  23:59 del día 31 no, `faltaPorRecibir` 15 000,00 entra y 0,00 / −500,00 no; conteos; sin zona →
  `"0.00"` y 0.
- [x] **T1.4** — `lib/actions/cierre-bodega.ts`: `buildCierresBodegaAdminService` inyecta
  `new OrdenRepository(prisma)`. **Hecho:** T1.5 (caso por la Server Action sin `deps` de servicio).
- [x] **T1.5** — `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts` contra Postgres
  real, con la siembra de `design.md > Verificación` (dos empresas, dos zonas en A, CB1-CB7, gestiones
  de los dos modelos, fulfillment cargado). Antes de afirmar, cuenta lo sembrado y falla si falta.
  Casos: R280, R281 (otra zona, sin zona, inexistente), R283 sobre la base, R284 (central vs
  satélite), R287 con literales, R52 (rango de `solicitadoAt` en la página y el `total`), empresa
  cruzada → `no_encontrada`, y uno que llama a la Server Action `verCierreBodegaDetalle` solo con
  `getActor` (composition root). **Hecho:** verde con la base desechable, y las seis mutaciones de
  `design.md > Verificación` ejecutadas de una en una, cada una con su test en rojo, anotadas en
  `progress/impl_SLT-107.md` (con la salida que lo demuestra: el arnés de mutaciones se autocomprueba).
- [x] **T1.6** [P] — `tests/unit/services/cierre-bodega-service.test.ts`: adaptar los dobles y las
  aserciones de `listarConsolidacion` al campo nuevo, sin cambiar ningún otro literal (R72). **Hecho:**
  verde; el diff solo añade `solicitadosResumen`.

## T2 — Lógica pura de la cola (`frontend_dev`, depende de T1.3)

- [ ] **T2.1** — `detalle-cierre-vista.ts`: `CifraId` + `porLlegar`, `recibido30Dias`,
  `faltaPorRecibir`. `cola-cierres-vista.ts`: `COLUMNAS_SOLICITADOS_SATELITE`, `columnasCola("bodega",
  "satelite", pestana)` según la pestaña, `tarjetasSolicitados(resumen)`. `cola-cierres-labels.ts`:
  los textos de `design.md > cola-cierres-vista.ts y cola-cierres-labels.ts` (R286, R288, R289).
  **Hecho:** `tests/unit/utils/cola-cierres-vista.test.ts`: columnas de «Solicitados» en orden y sin
  Bodega ni Solicitó; las de «A consolidar», central y mensajeros sin cambios (R296); tarjetas en orden,
  notas en singular, plural y 0, `aviso` solo con conteo > 0, strings sin tocar (R71).

## T3 — Componentes (`frontend_dev`, depende de T2)

- [ ] **T3.1** — `DetalleCierreBodegaAbierto.tsx` (nuevo) con el bloque de `CierresBodegaAdminModule`
  movido sin cambiar su JSX; `CierresBodegaAdminModule` lo monta con `audiencia="central"` (R295).
  **Hecho:** `CierresBodegaAdminDetalleUnico`, `CierresBodegaAdminDeepLink` y
  `CierresBodegaAdminRefresco` verdes **sin editarlos**.
- [ ] **T3.2** — `CifrasCierre`: `totales` opcional. `ColaCierres`: `solicitados` como objeto,
  `PanelSolicitados`, `TablaColaSolicitados` (celdas de bodega compartidas + Recaudado + «Ver»), pie de
  «Solicitados» (R286, R288, R289). **Hecho:** `tests/components/ColaCierresConsolidar.test.tsx`:
  tarjetas, columnas y celdas con literales («—» sin marca, Falta resaltada solo > 0, signo de «Debe
  llegar»), nombre accesible de «Ver», región, carga, error, vacío, pie y paginación, sin aviso ni
  botón; lo de R201 se reescribe a R289.
- [ ] **T3.3** — `CierresBodegaSolicitadosLista.tsx`: `leerSolicitados(page, pageSize, filtros)`
  exportada (la lista de hoy la sigue usando sin filtros para el caso sin zona).
  `ConsolidacionBodegaModule`: estado y SWR de «Solicitados» con filtros, conteo del servidor, filtros
  que devuelven las dos pestañas a la página 1, «Ver» con `verCierreBodegaDetalle`, toasts de R293,
  `DetalleCierreBodegaAbierto` audiencia satélite sin conciliación, «Ver su cierre» (R52, R290-R294).
  `page.tsx`: pasa `solicitadosResumen`. **Hecho:**
  `tests/components/ConsolidacionBodegaRefresco.test.tsx`: (a) filtro → las dos lecturas llevan el
  filtro y las dos páginas vuelven a 1 (R291, deuda R191); (b) página 2 en «A consolidar», ir a
  «Solicitados» y volver → sigue en 2 y con el filtro (R291, deuda R190); (c) conteo «Solicitados <n>»
  = `total` filtrado (R290); (d) «Ver» → detalle con pestañas Dinero, Gestiones, Mensajeros y
  Conciliación, franja «la central aún no marca el dinero recibido» si no hay marca, pie solo
  «Cerrar», sin `ConciliacionAcciones` ni celda de fulfillment (R292, R51); (e) `forbidden` → toast
  y ningún diálogo (R293, R50); (f) «Ver su cierre» → cierra y navega a `hrefDetalleCierre` (R294);
  (g) sin zona igual que hoy (R202); (h) tras solicitar, el `mutate` sigue revalidando las dos listas.

## T4 — Tests y E2E existentes (`frontend_dev`, depende de T3)

- [ ] **T4.1** — Adaptar `tests/components/paginacion/ColasPaginacion.test.tsx` (la paginación de
  «Solicitados» ahora la monta el módulo; mismo nombre), `tests/components/descarga/CierresDescargaColumnas.test.tsx`
  (doble tipado con `solicitadosResumen`) y `tests/unit/descarga/censo-tablas.ts` si la guardia lo pide.
  **Hecho:** verdes; cada aserción que cambia de localizador conserva su número.
- [ ] **T4.2** — `e2e/cierre-bodega-satelite.spec.ts`: la satélite ve «Solicitados» con sus tres
  tarjetas y la fila del cierre recién solicitado; filtra por fecha y la fila sale y el conteo baja
  (R52, R290); «Ver» abre el detalle en lectura (R50). **Hecho:** verde en local con base desechable y
  `NEXT_PUBLIC_APP_URL` como en `gate.yml`.
- [ ] **T4.3** — `e2e/cierres-rediseno.spec.ts`: la satélite abre su cierre de bodega (uno del modelo
  viejo y otro del nuevo) y cada cifra del detalle es igual al céntimo al literal escrito a mano y a lo
  que ve la central del mismo cierre; ninguna celda de fulfillment (R77, R51). **Hecho:** verde en
  local; mutación `paraLaCentral` → `totalPagoMensajero` en la cabecera lo pone rojo.

## T5 — Gate

- [ ] **T5.1** — `./init.sh` verde (con `.env` y la base desechable). **Hecho:** `INIT_EXIT=0` escrito
  dentro del log; tamaño leído (si pasa de 2 400 líneas, PA-T).
- [ ] **T5.2** — R72: `git diff --stat origin/dev` sin `db/` y, en `lib/actions/`, solo el builder de
  T1.4. **Hecho:** nota en `progress/impl_SLT-107.md`.
- [ ] **T5.3** — E2E en local de lo que toca la pantalla: `grep -rl` en `e2e/` por «Solicitados»,
  «Cierres de bodega solicitados» y «cierres-admin»; todos verdes. **Hecho:** lista y resultado en
  `progress/impl_SLT-107.md`.

## T6 — Antes de promover (leader)

- [ ] **T6.1** — Carlos aprueba en Preview las tarjetas de «Solicitados» y sus notas (PA2) y el detalle
  de la satélite en los dos modos (PA1). No se promueve a `prod` sin ese OK.

## Trazabilidad

| R | Test |
|---|---|
| R32 | `tests/components/ColaCierresConsolidar.test.tsx` (tarjetas propias en «Solicitados»; aviso y botón solo en «A consolidar») |
| R49 | `ColaCierresConsolidar.test.tsx`; `tests/unit/utils/cola-cierres-vista.test.ts`; `e2e/cierre-bodega-satelite.spec.ts` |
| R50 | `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts` (otra zona → `forbidden`); `tests/components/ConsolidacionBodegaRefresco.test.tsx` (d, e); `e2e/cierre-bodega-satelite.spec.ts` |
| R51 | `tests/unit/services/cierres-bodega-admin-service.test.ts`; `ConsolidacionBodegaRefresco.test.tsx` (d); `e2e/cierres-rediseno.spec.ts` |
| R52 | integración (rango de `solicitadoAt`); `ConsolidacionBodegaRefresco.test.tsx` (a); `e2e/cierre-bodega-satelite.spec.ts` |
| R68 | `tests/unit/services/consolidacion-cola-satelite.test.ts` (literales); integración (R287) |
| R71 | `cola-cierres-vista.test.ts` y `ColaCierresConsolidar.test.tsx` (strings sin tocar, signo) |
| R72 | `tests/unit/services/cierre-bodega-service.test.ts` (literales sin cambio); T5.2 |
| R77 | `e2e/cierres-rediseno.spec.ts` (dos modelos, central y satélite) |
| R280 | integración (S1 lee CB1; mutación «sin `zonaId` en la cabecera»); `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` |
| R281 | integración (CB5, sin zona, inexistente); `cierres-bodega-admin-service.test.ts` (sin firmar) ; `cierres-bodega-admin-repository.test.ts` (sin más lecturas) |
| R282 | `cierres-bodega-admin-service.test.ts` (mensajero) |
| R283 | `cierres-bodega-admin-service.test.ts` (seis campos y `desmarcable`); integración (sobre la base) |
| R284 | `cierres-bodega-admin-service.test.ts` (igualdad salvo R283, mismas llamadas); integración |
| R285 | `cierres-bodega-admin-service.test.ts` (aprobar, rechazar) |
| R286 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx` |
| R287 | `consolidacion-cola-satelite.test.ts`; integración (mutaciones de estado, de zona y de 30 días) |
| R288 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx` |
| R289 | `ColaCierresConsolidar.test.tsx`; `tests/components/paginacion/ColasPaginacion.test.tsx` |
| R290 | `ConsolidacionBodegaRefresco.test.tsx` (c); `e2e/cierre-bodega-satelite.spec.ts` |
| R291 | `ConsolidacionBodegaRefresco.test.tsx` (a, b) — cubre la deuda R190/R191 de SLT-106 |
| R292 | `ConsolidacionBodegaRefresco.test.tsx` (d) |
| R293 | `ConsolidacionBodegaRefresco.test.tsx` (e) |
| R294 | `ConsolidacionBodegaRefresco.test.tsx` (f) |
| R295 | `CierresBodegaAdminDetalleUnico`, `CierresBodegaAdminDeepLink`, `CierresBodegaAdminRefresco` sin editar (T3.1); `ConsolidacionBodegaRefresco.test.tsx` (d) |
| R296 | `cola-cierres-vista.test.ts` (columnas de hoy); `ColaCierresConsolidar.test.tsx` y `ColaCierresBodega.test.tsx` sin cambios en sus aserciones de «A consolidar» y central |

## Archivos esperados

- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/actions/cierre-bodega.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/services/CierreBodegaService.ts`
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/cola-cierres-vista.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`
- `components/private/cierres/detalle/DetalleCierreBodegaAbierto.tsx`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/CifrasCierre.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista.tsx`
- `app/(app)/cierres-admin/page.tsx`
- `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/unit/repositories/cierres-bodega-admin-repository.test.ts`
- `tests/unit/services/consolidacion-cola-satelite.test.ts`
- `tests/unit/services/cierre-bodega-service.test.ts`
- `tests/unit/utils/cola-cierres-vista.test.ts`
- `tests/components/ColaCierresConsolidar.test.tsx`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/unit/descarga/censo-tablas.ts`
- T0.1 (2026-11-12): llamadas a `findCierreBodegaConDetalle(id, zona)` con dos argumentos o dobles de
  `cierreBodega.findUnique` que rompen con `alcance` obligatorio y `findFirst` (una línea cada uno):
  - `tests/integration/db/486-evidencias-cierres-sql-real.test.ts`
  - `tests/integration/db/ajuste-pago-mensajero-lectura.int.test.ts`
  - `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts`
  - `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
  - `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts`
  - `tests/integration/db/slt76-desmarcable.int.test.ts`
  - `tests/unit/repositories/cierre-bodega-repository.test.ts`
  - `tests/unit/repositories/cierre-pagos-lectura.test.ts`
- T1.3 (2026-11-12): doble tipado de `listarConsolidacion` que rompe el typecheck con el campo nuevo
  obligatorio `solicitadosResumen` (una línea, como `CierresDescargaColumnas.test.tsx`):
  - `tests/components/descarga/CierresDescarga.test.tsx`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/cierres-rediseno.spec.ts`
- `progress/impl_SLT-107.md`
- `progress/features/SLT-107.md`
