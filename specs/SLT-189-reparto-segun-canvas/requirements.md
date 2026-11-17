# SLT-189 «Reparto del mensajero según el canvas» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Este archivo es el spec entero: no hay `design.md`
ni `tasks.md`. Requisitos: **R790-R802** (rango reservado R790-R809; `grep` de `R79x`/`R80x` en
`specs/` del repo y de los worktrees: libre).

**Solo presentación.** No cambia datos, consultas, Server Actions, permisos ni dinero. Todo lo que
pinta ya llega a la pantalla en `MiAsignacionDTO` (`lib/interfaces/services/IMisAsignacionesService.ts`):
`numGuia` (`:17`), `numRemision` (`:18`), `destinatario` (`:20`), `direccion` (`:22`) y `tiendaNombre`
(`:30`); los KPI ya los monta la página como prop `kpis` (`RepartoModule.tsx:130-136`). Si al
implementar hiciera falta tocar `lib/`, `db/`, `app/api/` o un `page.tsx`, se para: la ficha pasaría a
la ruta completa.

## Origen

Informe `progress/comparacion-canvas-pwa-2026-11-16.md`, sección SLT-163 «PWA del mensajero: Reparto
en el móvil», filas D1-D7. Diseño: canvas de SLT-156 «PWA de los mensajeros: tablas usables en el
móvil», artboards **RepartoMejorado**, **RepartoDetalle** y **RepartoFoco** y la nota «Diseño final» 3
(«Reparto: KPI 2×2, barra fija con buscador, conmutador y Filtros…»). Los datos de los artboards son
de ejemplo: se toma la disposición, nunca los valores.

Regla de la ficha: **la pantalla de hoy + solo los puntos de la ficha**, con los componentes que ya
existen. Lo que SLT-163 decidió y Carlos aprobó se mantiene salvo lo que la ficha pide cambiar.

| Fila | Qué dice el canvas | Código hoy (verificado) | Aquí |
|---|---|---|---|
| D1 | No dibuja «Escanear o escribir guía» en Reparto | `RepartoModule.tsx:824-830` lo monta | **Se queda** (Carlos, DC1) → R802 |
| D2 | Conmutador Mosaico/Detalle dentro de la barra fija, tras «Filtros» (`RepartoDetalle.txt` l.15-19) | En la cabecera de la sección, junto a «Sincronizar ruta», no fijo (`RepartoModule.tsx:885-894`) | R795-R797 |
| D3 | Fila Detalle con la **guía** en mono (`RepartoDetalle.txt` l.26-36) | Pinta `orden.numRemision` (`pos-card/PosOrderCardDetalle.tsx:195-197`): fallo de R508 | R790-R791 |
| D4 | Segunda línea «destinatario · dirección» (l.27, l.32, l.35; sin dirección, solo el nombre: l.26) | Solo `orden.destinatario` (`PosOrderCardDetalle.tsx:198-200`); la dirección va al despliegue (`:224-232`) | R792 |
| D5 | Despliegue reducido a dirección + dos botones | Chip, marcas, Navegar, intentos (`PosOrderCardDetalle.tsx:218-235`) | **Fuera** (no está en la ficha) → R793 conserva el de hoy |
| D6 | «Con ayuda solicitada» como fila compacta desplegable: guía, «nombre · tienda», «Valor a cobrar»; al desplegar, «Recuperar» y «Conversación» (l.37-41) | Tarjeta Detalle completa, sin `compacta` (`RepartoModule.tsx:668-726`) | R800-R801 |
| D7 | En modo foco, los KPI 2×2 encima de «Volver a la lista» (`RepartoFoco.txt` l.9-13) | El foco no pinta `{kpis}` (`RepartoModule.tsx:782-817`; los KPI van en `:833`) | R798-R799 |

## Lo que ya existe

Buscado `reparto`, `fila compacta`, `numGuia`, `conmutador`, `VistaCardsToggle`, `con ayuda`, `modo foco`
y `R79x/R80x` en `feature_list.json`, `specs/`, `progress/` y el código, con Grep/Read. **El grafo no
tiene indexado este worktree** (`index_status`: project not found).

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SLT-190 «Recoger y Recolección según el canvas» (`pending`, sin assignee): mismo informe, filas C1-C7 de las otras dos pantallas (incluye su conmutador en la barra, C2, y su fila plegada, C4). | No es duplicado: aquí solo Reparto. Comparte archivos (ver `## Archivos esperados`). |
| `specs/SLT-156-pwa-mensajero-tablas/requirements.md:259-316` | R502-R516 (Reparto) y R517 (Recoger y Recolección usan «las mismas tarjetas compactas de R508»). | Se mantienen; R790-R792 corrigen la fila de R508 **solo en Reparto** (DS2). |
| `pos-card/PosOrderCardDetalle.tsx:175-238` | La fila compacta desplegable (`compacta`), con `TEXTO_ENTERO` y `COLUMNA_FIJA`. | **Se reutiliza**; una prop opcional elige la fila de Reparto. |
| `RecogerModule.tsx:192-200`, `recoleccion/_components/RecoleccionModule.tsx:211-219`, `RecolectadasHoyLista.tsx:118-119` | Los otros tres consumidores de `compacta`. Su canvas pinta la **remisión** (`Recoger.txt` l.24, `Recoleccion.txt` l.20-24). | **No cambian** (R794). |
| `components/shared/BuscadorFiltros.tsx:593-721` | La barra (`fija`, `tactil`). Los `children` se pintan **antes** del campo (`:622`); «Filtros» va al final (`:703-721`). | Se le añade un hueco opcional al final, tras «Filtros» (DS3). |
| `VistaCardsToggle.tsx` | El conmutador de hoy (grupo «Vista de las órdenes»). | **Se reutiliza tal cual**, solo cambia de sitio. |
| `GestionarOrdenPanel.tsx:843`, `chat/chat-format.ts:72` | Precedente de «guía, y si no hay, remisión» (`numGuia ?? numRemision`). | Mismo criterio en R791. |
| `RecuperarAyudaButton`, `AYUDA_ACCION_HILO` (`RepartoModule.tsx:169,708-721`) | Acciones de la sección de ayuda (feature 235 R19/R25/R35). | Se reutilizan; pasan al despliegue de la fila. |

## Alcance

- **Dentro** (solo `/mis-asignaciones/reparto`): guía en la fila Detalle (D3); «destinatario ·
  dirección» en esa fila (D4); conmutador Mosaico/Detalle dentro de la barra fija (D2); KPI en el modo
  foco (D7); «Con ayuda solicitada» como fila compacta desplegable (D6).
- **Fuera:**
  - D1: el escáner «Escanear o escribir guía» **se queda** en Reparto (Carlos).
  - D5 (despliegue de la fila reducido), D8 (KPI a 20 px), D9 («Ver detalle completo» a 44 px) y D10
    («Navegar» aparte): no están en la ficha.
  - Recoger en bodega y Recolección (conmutador, fila plegada, filtro «Tienda»): SLT-190.
  - El número de parada en «Con ayuda solicitada» que dibuja el canvas: lo prohíbe la feature 235 R15
    (estas órdenes no son paradas).
  - Textos de la sección de ayuda, nombres accesibles de tarjetas y botones y el rótulo del grupo del
    conmutador: no cambian.
  - Datos nuevos del servidor: ninguno hace falta.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién | Cubierta por |
|---|---|---|---|
| DC1 | El escáner «Escanear o escribir guía» sigue en Reparto, donde está hoy (D1 no se aplica). | Carlos, 2026-11-16 (ficha) | R802 |

## Decisiones del spec (se aprueban con el spec)

| # | Decisión | Por qué | Cubierta por |
|---|---|---|---|
| DS1 | Orden sin guía (`numGuia === null`): la fila muestra la remisión en su lugar. | El DTO la permite nula (`IMisAsignacionesService.ts:17`); mismo criterio que `GestionarOrdenPanel.tsx:843` y `chat-format.ts:72`. | R791 |
| DS2 | La fila nueva (guía + «destinatario · dirección») es **solo de Reparto**; Recoger y Recolección conservan la de hoy. Se elige con una prop opcional de `PosOrderCardProps`; ausente = la fila de hoy. | Su canvas pinta la remisión y otra segunda línea (C4); cambiarlas es SLT-190. | R790, R794 |
| DS3 | El conmutador entra en la barra por un hueco **opcional al final** de `BuscadorFiltros` (tras «Filtros»); sin la prop, la barra no cambia para sus demás consumidores. **Descartado:** pasarlo como `children`, que se pintan antes del campo (`BuscadorFiltros.tsx:622`) y lo dejarían a la izquierda del buscador, no donde lo pone el canvas. | Orden del canvas: campo → «Filtros» → conmutador (`RepartoDetalle.txt` l.15-19). SLT-190 reutiliza el mismo hueco. | R795, R798 |
| DS4 | Los KPI se ven en **todo** el modo foco (antes y después de confirmar la guía), siempre encima del panel. | El canvas solo dibuja el foco antes de confirmar; cambiar los KPI de sitio a mitad de la gestión movería el panel bajo el dedo. | R798 |
| DS5 | La fila de ayuda va compacta **en Mosaico y en Detalle** (la sección no sigue al conmutador, como hoy, `RepartoModule.tsx:650-652`); su segunda línea es «destinatario · tienda» y su despliegue es el de hoy con «Recuperar» y «Conversación». | Canvas l.39-41; la tienda es quien atiende la ayuda («Tu tienda las está viendo en Novedades»). | R800, R801 |

## Requisitos (EARS)

«Fila de Reparto» = la fila compacta de la vista Detalle en la lista «En reparto / por gestionar» de
`/mis-asignaciones/reparto`. «Guía» = `numGuia`.

### Fila Detalle (D3, D4)

- **R790** — En la vista Detalle de Reparto, la fila plegada de cada orden de «En reparto / por
  gestionar» DEBE mostrar arriba, en mono, la guía de la orden, y NO DEBE mostrar la remisión.
- **R791** — SI la orden no tiene guía, ENTONCES la fila de Reparto DEBE mostrar la remisión en el
  sitio de la guía.
- **R792** — La fila plegada de Reparto DEBE mostrar debajo de la guía «{destinatario} · {dirección}»
  entero (se parte en líneas, sin «…», R490); SI la orden no tiene dirección, ENTONCES DEBE mostrar
  solo el destinatario, sin « · ».
- **R793** — CUANDO el mensajero toca la fila de Reparto, el sistema DEBE desplegar lo mismo que hoy:
  estado y marcas, «Cantón · Distrito — dirección» con su botón de navegar, intentos, «Gestionar más
  tarde» y «Gestionar»; plegada, NO DEBE mostrar «Gestionar» ni «Gestionar más tarde».
- **R794** — En Recoger en bodega y Recolección (incluida «Recolectadas hoy»), la fila plegada de la
  vista Detalle NO DEBE cambiar: remisión arriba y destinatario solo debajo.

### Conmutador en la barra fija (D2)

- **R795** — Fuera del modo foco, el conmutador Mosaico/Detalle de Reparto DEBE estar dentro de la
  barra de búsqueda y filtros, después del campo de búsqueda y de «Filtros», y la cabecera «En reparto
  / por gestionar» NO DEBE contener ningún conmutador (conserva «Sincronizar ruta»).
- **R796** — MIENTRAS el mensajero desplaza la lista de Reparto, el conmutador DEBE seguir visible
  pegado al borde superior junto con la barra (R496); y CUANDO lo usa, DEBE cambiar la vista como hoy
  (R507).
- **R797** — A 360 px y a 414 px de ancho, la barra de Reparto con el conmutador NO DEBE desbordar en
  horizontal (R501) y los botones «Mosaico» y «Detalle» DEBEN medir al menos 44 × 44 px (R493).

### KPI en el modo foco (D7)

- **R798** — MIENTRAS Reparto esté en modo foco, el sistema DEBE pintar los cuatro KPI
  («Pendientes», «Entregado», «Por cobrar», «Total a cobrar», en 2 × 2 en móvil, R502) encima de
  «Volver a la lista» y del panel «Detalle de la orden», antes y después de confirmar la guía.
- **R799** — MIENTRAS Reparto esté en modo foco, el sistema NO DEBE pintar la barra de búsqueda y
  filtros, el conmutador, «Escanear o escribir guía» ni las tarjetas de la lista (R510-R511 se
  mantienen).

### «Con ayuda solicitada» como fila desplegable (D6)

- **R800** — En la sección «Con ayuda solicitada», en Mosaico y en Detalle, cada orden DEBE pintarse
  como fila compacta plegada con la guía (R790-R791), «{destinatario} · {tienda}» entero debajo y
  «Valor a cobrar» con el monto en columna fija a la derecha, sin número de parada ni «Pendiente de
  optimizar» (feature 235 R15).
- **R801** — CUANDO el mensajero toca una fila de «Con ayuda solicitada», el sistema DEBE desplegar
  «Recuperar» y «Conversación» (además del estado con la nota de ayuda, la dirección e intentos de
  hoy); plegada, NO DEBE mostrarlos; y con el mensajero bloqueado por un cierre, «Recuperar» DEBE
  seguir pulsable (feature 235 R25).

### Lo que se queda (D1)

- **R802** — Fuera del modo foco y sin bloqueo, el sistema DEBE seguir pintando «Escanear o escribir
  guía» bajo el encabezado y encima de los KPI y de la barra (R500, R503 sin cambios).

## Tasks

Orden: (T1 ∥ T2) → T3 → T4. `[P]` = paralelizable con su hermana.

- [x] **T1 [P] — Fila de Reparto** (`pos-card/PosOrderCard.tsx`, `pos-card/PosOrderCardDetalle.tsx`).
  Prop opcional en `PosOrderCardProps` que elige la fila de Reparto y su segunda línea (dirección o
  tienda); ausente = la fila de hoy (DS2). Con ella: `numGuia ?? numRemision` en mono arriba;
  «destinatario · dirección» o «destinatario · tienda» con `TEXTO_ENTERO`, omitiendo « · » si falta
  el segundo dato. Despliegue sin cambios.
  *Hecho:* `tests/components/PosOrderCardDetalleCompacta.test.tsx` con R790, R791, R792, R793 y R794
  (sin la prop: remisión y destinatario solo) en verde, con fixture cuya guía y remisión difieren.
- [x] **T2 [P] — Hueco al final de la barra** (`components/shared/BuscadorFiltros.tsx`). Prop opcional
  que se pinta después de «Filtros», dentro de la misma fila con `flex-wrap`; ausente = mismo DOM que
  hoy (DS3).
  *Hecho:* `tests/unit/components/buscador-filtros-movil.test.tsx` comprueba el orden campo →
  «Filtros» → hueco y que sin la prop no se añade nada; tests de `BuscadorFiltros` existentes en verde.
- [x] **T3 — Reparto** (`RepartoModule.tsx`, depende de T1 y T2). Pasar `VistaCardsToggle` al hueco de
  la barra y quitarlo de la cabecera de la sección (`:885-894`); pintar `{kpis}` en la rama de foco
  encima de «Volver a la lista» y del panel (`:790-817`); `renderCardEnReparto` con la fila de Reparto
  (dirección) en Detalle; `renderCardConAyuda` con `compacta` y la fila de Reparto (tienda), sin tocar
  sus acciones ni `mostrarRuta={false}`.
  *Hecho:* tests de componente de R795, R796 (cambio de vista), R798, R799, R800, R801 y R802 en verde
  (`RepartoMovil.test.tsx`, `RepartoModoFoco.test.tsx`, `RepartoAyuda.test.tsx` y los que se rompan por
  desplegar la fila de ayuda); los asertos que hoy exigen «sin KPI en foco»
  (`RepartoMovil.test.tsx:198-203`, `RepartoModoFoco.test.tsx:153-159`) se reescriben a R798, no se
  borran. Mutaciones: quitar `{kpis}` del foco, volver a `numRemision` en la fila y devolver el
  conmutador a la cabecera dejan algún test en rojo.
- [x] **T4 — E2E y gate** (depende de T3). En `e2e/pwa-mensajero-reparto.spec.ts`: (a) la fila Detalle
  muestra `orden.numGuia` y la dirección plegada (R790, R792) y no desborda a 360/414 (R797); (b) el
  foco muestra «Indicadores de mis asignaciones» (cambia el aserto de `:182`, R798); (c) el conmutador
  sigue pegado arriba al bajar (R796) y mide 44 px (R797). Correr el E2E en local sobre base
  desechable (`docs/perfil-agentes.md > Todos los agentes`) y `./init.sh`.
  *Hecho:* E2E de Reparto en verde en local; `INIT_EXIT=0`; mapa `R<n> -> test` completo en
  `progress/features/SLT-189.md`.

## Archivos esperados

Producción:
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCard.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`
- `components/shared/BuscadorFiltros.tsx`

Tests:
- `tests/components/PosOrderCardDetalleCompacta.test.tsx`
- `tests/components/RepartoMovil.test.tsx`
- `tests/components/RepartoModoFoco.test.tsx`
- `tests/components/RepartoAyuda.test.tsx`
- `tests/components/RepartoAyudaResueltaPorLaTienda.test.tsx`
- `tests/components/RepartoModule.test.tsx`
- `tests/unit/components/buscador-filtros-movil.test.tsx`
- `e2e/pwa-mensajero-reparto.spec.ts`

`RepartoAyudaResueltaPorLaTienda.test.tsx` y `RepartoModule.test.tsx` solo si se rompen al plegar la
fila de ayuda o mover el conmutador; se listan para que el choque se vea. `VistaCardsToggle.tsx`,
`RecogerModule.tsx`, `RecoleccionModule.tsx` y `RecolectadasHoyLista.tsx` no se tocan.
**Choque previsible con SLT-190** («Recoger y Recolección según el canvas», `pending`):
`BuscadorFiltros.tsx`, `PosOrderCard.tsx` y `PosOrderCardDetalle.tsx`. Conviene que SLT-190 arranque
después del merge de esta y reutilice el hueco de la barra (DS3) y la prop de la fila (DS2).

## Tamaño

- **Archivos:** 12 (4 de producción, 8 de tests), frente al tope de 40 (80 % = 32). Cabe.
- **Líneas de producción:** ~100-180 (una prop y la fila en la tarjeta, un hueco en la barra, mover el
  conmutador, KPI en el foco y la fila de ayuda). Tope 1000.
- **Líneas de tests:** ~350-550 (asertos nuevos y reescritos en cinco tests de componente, uno de la
  barra y tres casos del E2E). Tope 3000.

## Preguntas abiertas

Ninguna que bloquee. Para confirmar con Carlos al aprobar el spec (están decididas, no abiertas):
- DS4: KPI visibles también **después** de confirmar la guía (el canvas solo dibuja el antes).
- DS5: la fila de ayuda despliega, además de «Recuperar» y «Conversación», lo que hoy lleva la tarjeta
  (estado con la nota de ayuda, dirección, intentos); reducirlo a los dos botones sería D5, fuera de
  la ficha.
