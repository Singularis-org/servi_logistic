# SLT-152 «Tablas de cierres legibles» — requirements (ruta ligera)

> Ruta: **ligera** (`complexity: medium`, zona frontend). Escrito por spec_author el 2026-11-13 sobre el
> árbol del worktree `SLT-152-tablas-cierres-legibles` (rama desde `origin/dev`). Origen: lo que pidió
> Carlos tras probar en Preview (captura: «mensajero-satelite Demo QA A» montado sobre «Resultado»).
> Requisitos R440-R449 (el más alto en `specs/` era R439, SLT-149).

## Lo que ya existe

Buscado en el board (`feature_list.json`: «SLT-152», «columna», «Destinatario», «conteo»), en `specs/`
(«Destinatario · tienda», «Resueltos», «R84», «R99») y en el código (Grep; el grafo no se consultó).

- Ninguna otra ficha separa estas columnas ni cambia el formato del conteo de las pestañas.
- La fila y la lista únicas de gestiones son de SLT-101 «Fila de gestión única y lista con filtros»
  (R23: columnas; R84: el canvas pone el conteo detrás del nombre con un espacio). La cola única con
  pestañas es de SLT-102 (R99). Esta ficha **cambia ese texto a petición de Carlos**: no hay decisión
  cerrada que lo impida.
- Ya existe en el repo la forma «Nombre (n)»: `components/shared/SegmentedToggle.tsx:156`. Se reusa
  la forma, no el componente (las pestañas de la cola son `Tabs` y siguen siéndolo).
- No hay sistema de tablas compartido para la lista de gestiones: es una rejilla CSS propia
  (`plantillaFila`) que comparten cabecera y fila. Las colas usan `components/shared/DataTable`.

## Causa del texto montado (leída en el código)

`FilaGestion.tsx:119-126`: el texto de «Destinatario · tienda» y de «Mensajero» va en un `<span>`
**en línea** con `truncate` dentro de la celda de la rejilla (`:197`). `overflow: hidden` no se aplica
a un elemento en línea, así que `whitespace-nowrap` deja la línea entera y el texto sale de su pista
`minmax(0, …)` y se pinta encima de la columna siguiente. No es un problema de anchos sino de qué
elemento recorta.

## Inventario (tablas y columnas del módulo de cierres)

| # | Dónde | Qué se ve | Afectada |
|---|---|---|---|
| T1 | `components/private/cierres/fila/fila-gestion-labels.ts:31` | `COL_DESTINO = "Destinatario · tienda"` | sí: se parte en dos |
| T2 | `components/private/cierres/fila/fila-gestion-vista.ts:179-202` (`columnasDe`) | columnas por audiencia; `destino` en todas, `mensajero` solo con `conMensajero` | sí |
| T3 | `components/private/cierres/fila/FilaGestion.tsx:69-80` (`ANCHO`), `:119-126` (celdas destino y mensajero), `:195-200` (rejilla) | la fila | sí: texto montado |
| T4 | `components/private/cierres/fila/GestionesCierre.tsx:97-107` | la cabecera de la lista | sí: nueva columna |
| T5 | `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:1418` | detalle de un cierre de mensajero (central y satélite), sin Mensajero | sí (vía T1-T4) |
| T6 | `components/private/cierres/detalle/DetalleCierreBodegaAbierto.tsx:72-75` (`columnaMensajero`), montado por `CierresBodegaAdminModule.tsx:604` y `ConsolidacionBodegaModule.tsx:565` | detalle de un cierre de bodega, con Mensajero (el de la captura) | sí (vía T1-T4) |
| T7 | `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:477` | `/cierre-dia`, la lista del mensajero | sí (vía T1-T4) |
| P1 | `components/private/cierres/cola/ColaCierres.tsx:276-280` (`${p.label} ${p.conteo}`) | las pestañas con conteo | sí: «Nombre (n)» |
| P2 | consumidores de P1: `CierresAdminModule.tsx:1286-1287` (Pendientes/Resueltos), `CierresBodegaAdminModule.tsx:506`, `ConsolidacionBodegaModule.tsx:478` (A consolidar/Solicitados), `CierreDiaModule.tsx:597` («Cierres solicitados») | — | sí (vía P1) |
| N1 | `ColaCierres.tsx:240` (`DataTable`), celdas de mensajero `:491`, `:566` | las tablas de las colas | **no**: `<table>` real, el texto se parte en líneas y no se monta |
| N2 | `app/(app)/cierres-admin/_components/cierre-factura.tsx:1705`, `:2146` (`FilaGestion` local de `CierreFacturaDetalle`, `:2552`) | — | **no**: `CierreFacturaDetalle` no se monta en ninguna pantalla (código muerto; ver preguntas para el leader) |

## Alcance

- Partir «Destinatario · tienda» en dos columnas, «Destinatario» y «Tienda», en la lista única de
  gestiones (cabecera y fila), para todas sus audiencias (T5, T6, T7).
- Que el texto de Destinatario, Tienda y Mensajero quede dentro de su columna: recortado con «…» y con
  el texto entero en `title`; repartir los anchos de la rejilla para la columna nueva.
- Las pestañas con conteo de la cola única (P1) muestran «Nombre (n)». Al ser un solo componente,
  cambia en las cuatro colas (mensajeros, bodega central, bodega satélite y `/cierre-dia`).
- Actualizar los tests y E2E que hoy afirman «Destinatario · tienda» o «Nombre n» en las pestañas.

## Lo que NO entra

- **Las descargas Excel no cambian.** Es solo pantalla: `COLUMNAS_DESCARGA_DETALLE_CIERRE`,
  `COLUMNAS_DESCARGA_DETALLE_BODEGA` y sus filas siguen igual, y ningún archivo de descarga entra en el diff.
- Ningún cambio de datos ni de servidor: `destinatario` y `tiendaNombre` ya llegan en
  `CierreDetalleGestion` (`lib/interfaces/services/ICierreDiaService.ts:49,56`).
- Las tablas de las colas (N1) y el código muerto de `cierre-factura.tsx` (N2).
- ~~Las pastillas del filtro «Filtrar por resultado»~~: **entran** por PA1 (Carlos, 2026-11-13):
  `textoFiltro` pasa a «Entregado (12)» (R450).
- Las tarjetas de la fila desplegada y su cabecera (`DATO_ORDEN`…): no cambian.

## Decisiones del spec (técnicas; las propone el spec_author)

- **D1 — Recorta la celda, no un hijo en línea.** El elemento que lleva el texto de Destinatario,
  Tienda y Mensajero es de bloque (o es la propia celda de la rejilla) con
  `overflow-hidden text-ellipsis whitespace-nowrap` (`block truncate`) y `title` con el texto entero.
- **D2 — Anchos.** `destino` (1.7fr) se reparte en `destinatario: minmax(0,1.2fr)` y
  `tienda: minmax(0,1fr)`; `mensajero` sigue en `minmax(0,1.1fr)`. El resto de `ANCHO` no cambia. La
  plantilla sigue siendo la misma constante para cabecera y fila.
- **D3 — Conteo.** `` `${p.label} (${p.conteo})` `` en `ColaCierres.tsx`; el nombre accesible de la
  pestaña es ese mismo texto.
- Alternativa descartada: dejar el texto partirse en varias líneas (`break-words`) en lugar de
  recortar. Descartada porque cambia la altura de cada fila según el nombre y en móvil (mensajero)
  la lista se vuelve irregular; con `title` el dato entero sigue a mano.

## Requisitos (EARS)

- **R440** — CUANDO se pinta la lista de gestiones de un cierre para la central, la satélite o en
  solo lectura, su cabecera DEBE mostrar, en este orden, «Guía», «Destinatario», «Tienda»,
  [«Mensajero» solo con la columna de mensajero], «Resultado», «Recibido», «Se le cobra a la
  tienda»/el rótulo de cobro de hoy, el de pago de hoy y «Señales»; y para el mensajero, «Guía»,
  «Destinatario», «Tienda», «Resultado», «Recibido», «Ganancia», «Señales».
- **R441** — La lista NO DEBE mostrar la cabecera «Destinatario · tienda» en ninguna audiencia.
- **R442** — CUANDO se pinta una gestión, su fila DEBE mostrar el destinatario en la celda de
  «Destinatario» y el nombre de la tienda en la celda de «Tienda», cada uno en su celda y sin el
  separador «·» entre ambos.
- **R443** — La cabecera y cada fila de una misma lista DEBEN tener el mismo número de celdas y la
  misma plantilla de columnas (con y sin columna de mensajero).
- **R444** — CUANDO se pinta una gestión, las celdas de «Destinatario», «Tienda» y «Mensajero» DEBEN
  recortar su texto dentro de la columna (elemento de bloque con `overflow` oculto, sin salto de línea
  y con «…») y DEBEN llevar en `title` el texto entero.
- **R445** — SI la gestión no tiene nombre de mensajero, ENTONCES la celda de «Mensajero» DEBE mostrar
  «—».
- **R446** — CUANDO se abre el detalle de un cierre de bodega (con columna «Mensajero») en una
  ventana de 1280 px de ancho, ninguna celda de la cabecera ni de la primera fila DEBE invadir la
  caja de la celda siguiente (borde derecho de cada celda ≤ borde izquierdo de la siguiente), con un
  nombre de mensajero más largo que su columna.
- **R447** — CUANDO se pinta la cola de cierres con pestañas con conteo, cada pestaña DEBE mostrar
  «<nombre> (<n>)» —«Pendientes (37)», «Resueltos (12)», «A consolidar (3)», «Solicitados (8)»,
  «Cierres solicitados (1)»— y ese mismo texto DEBE ser su nombre accesible.
- **R448** — SI el conteo de una pestaña es 0, ENTONCES la pestaña DEBE mostrar «<nombre> (0)».
- **R449** — La cola NO DEBE mostrar ninguna pestaña con la forma «<nombre> <n>» (conteo sin
  paréntesis).
- **R450** — (PA1, Carlos 2026-11-13) CUANDO se pinta el filtro «Filtrar por resultado» de la lista de
  gestiones, cada pastilla DEBE mostrar «<nombre> (<n>)» —«Todas (4)», «Entregado (2)», «Reprogramado
  (0)», «Con señales (3)»— y NINGUNA DEBE tener la forma «<nombre> <n>».

## Tasks

- [x] **T1 — Columnas** (R440, R441, R443). En `fila-gestion-labels.ts` sustituir `COL_DESTINO` por
  `COL_DESTINATARIO = "Destinatario"` y `COL_TIENDA = "Tienda"`; en `fila-gestion-vista.ts`
  (`ColumnaId`, `columnasDe`) `destino` pasa a `destinatario` + `tienda`; `ANCHO` según D2.
  *Hecho:* typecheck verde; `tests/unit/utils/fila-gestion-vista.test.ts` afirma las listas de R440
  con los rótulos escritos a mano.
- [x] **T2 — Celdas que recortan** (R442, R444, R445). En `FilaGestion.tsx`, una celda por dato según
  D1, con `title`. *Hecho:* `tests/components/FilaGestion.test.tsx` comprueba por gestión: texto de
  cada celda, ausencia de «·» entre destinatario y tienda, `title` = texto entero y clases de recorte
  en el elemento que tiene el texto (no en un hijo en línea).
- [x] **T3 — Cabecera** (R440, R441, R443). `GestionesCierre.tsx` pinta la cabecera de las nuevas
  columnas. *Hecho:* `tests/components/DetalleCierreGestiones.test.tsx` y
  `tests/components/CierreBodegaDetalleGestiones.test.tsx` afirman la cabecera literal (con y sin
  Mensajero) y que cabecera y fila tienen el mismo número de celdas y el mismo `gridTemplateColumns`.
- [x] **T4 — Pestañas** (R447-R449). `ColaCierres.tsx:278` según D3. *Hecho:*
  `tests/components/ColaCierres.test.tsx` («Pendientes (37)», «Resueltos (12)» y un caso con «(0)»),
  `tests/components/ColaCierresConsolidar.test.tsx` («A consolidar (3)», «Solicitados (8)»),
  `tests/components/CierreDiaColaPropia.test.tsx` («Cierres solicitados (7)» / «(0)»), literales a
  mano; R449 con `not.toMatch(/^\S.* \d+$/)` sobre cada pestaña.
- [x] **T4b — Pastillas del filtro** (R450, PA1). `textoFiltro` en `fila-gestion-labels.ts` pasa a
  `` `${nombre} (${n})` ``. *Hecho:* `tests/unit/utils/fila-gestion-vista.test.ts` (las 7 opciones
  literales y `not.toMatch` en cada una) y los tests/E2E que leían «Entregado 2» al día.
- [x] **T5 — Tests y E2E con el texto viejo.** Actualizar los que afirman «Destinatario · tienda»,
  «destinatario · tienda» en la fila o «Nombre n» en las pestañas (lista en `## Archivos esperados`;
  el helper `pestanaDeCola` de `e2e/_escenarios/cierres.ts:164-167` pasa a `^${nombre} \(\d+\)$`).
  *Hecho:* `grep` de «Destinatario · tienda» y de `name: "… \d"` en pestañas sin resultados en
  `tests/` y `e2e/`.
- [x] **T6 — E2E sin texto montado** (R446). En `e2e/cierre-bodega-satelite.spec.ts`, donde ya se abre
  el detalle de bodega («Órdenes del cierre», `:277`): medir con `boundingBox()` la cabecera y la
  primera fila y afirmar R446 para cada par de celdas vecinas. Para que no pase en verde sin probar
  nada, afirmar antes que la celda de «Mensajero» recorta de verdad (`scrollWidth > clientWidth`); si
  el nombre del escenario no basta, darle uno más largo en el escenario de esa spec.
  *Hecho:* verde en local; con la mutación «quitar `block` de la celda de Mensajero» queda rojo
  (anotado en el `impl`, sin commitear la mutación).
- [ ] **T7 — Cierre.** `./init.sh` verde; E2E locales de `grep -rl "Órdenes del cierre\|tablist" e2e/`
  que tocan estas pantallas en verde (`docs/perfil-agentes.md > Todos los agentes`); comprobación de
  que ningún archivo de descarga está en el diff; mapa `R<n> -> test` en `progress/impl_SLT-152.md`.

Mapa previsto `R<n> -> test`:
R440, R441 → `tests/unit/utils/fila-gestion-vista.test.ts` + `tests/components/DetalleCierreGestiones.test.tsx`;
R442, R444, R445 → `tests/components/FilaGestion.test.tsx`; R443 → `tests/components/CierreBodegaDetalleGestiones.test.tsx`;
R446 → `e2e/cierre-bodega-satelite.spec.ts`; R447-R449 → `tests/components/ColaCierres.test.tsx`
(+ `ColaCierresConsolidar.test.tsx`, `CierreDiaColaPropia.test.tsx`).

## Tamaño

- **Producción:** 5 archivos, ~60-100 líneas añadidas+borradas.
- **Tests:** 16 archivos (12 de componente/unidad, 1 helper E2E, 3 specs E2E), ~200-350 líneas,
  casi todo cambio de literales y el bloque nuevo de R446.
- **Total archivos:** 21 de 40 (≤ 80 % = 32). No hace falta partir.

## Archivos esperados

- `components/private/cierres/fila/fila-gestion-labels.ts`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/GestionesCierre.tsx`
- `components/private/cierres/cola/ColaCierres.tsx`
- `tests/unit/utils/fila-gestion-vista.test.ts`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/DetalleCierreGestiones.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/ColaCierres.test.tsx`
- `tests/components/ColaCierresConsolidar.test.tsx`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierreDiaColaPropia.test.tsx`
- `tests/components/CierreDiaColaFiltros.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `e2e/_escenarios/cierres.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/cierre-dia.spec.ts`
- `e2e/cierres-rediseno.spec.ts`

## Preguntas abiertas

Para Carlos:
- **PA1** — Las pastillas del filtro «Filtrar por resultado» dentro del detalle («Entregado 12»,
  «Todas 20») usan la misma forma sin paréntesis. ¿También pasan a «Entregado (12)»? Por defecto no
  entran (pediste las pestañas). **Respondida (2026-11-13): SÍ** → R450, tarea T4b.

Para el leader:
- `CierreFacturaDetalle` (`app/(app)/cierres-admin/_components/cierre-factura.tsx:2552`) y su
  `FilaGestion` local (`:1705`) no se montan en ninguna pantalla: candidato a deuda de limpieza, fuera
  de esta ficha.
