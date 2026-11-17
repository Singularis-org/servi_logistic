# SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» — requirements (ruta ligera)

Zona frontend, complexity low. Rango de requisitos: **R940-R969** (usados R940-R948).
Depende de SLT-160 «Buscar escaneando en los listados» (en `dev`) y va **después** de SLT-193
«Botones de 44 px pendientes en la PWA del mensajero», que deja la cámara del buscador con su barra
«Escanear con cámara» y su «Cerrar» de 44 px (`specs/SLT-193-botones-44-pwa-mensajero/requirements.md`,
bloque B, fila «Cámara del buscador»). Ese trabajo no se repite aquí.

## Origen

- Ficha: el canvas de la pistola (https://claude.ai/artifact/BKro9B2dap6jrmGejRq6M3) cubre 9
  buscadores; SLT-160 hizo B1-B8. Llevar el mismo buscador con escaneo a recolección, devoluciones y
  rechazos. Sin acceso al canvas: se trabaja con lo que transcribió SLT-160.
- Comentario de la tarjeta (2026-11-16): llevar también los filtros a 44 px.
- SLT-160, `## Alcance > Fuera` (R771): «los controles de filtro que monta cada pantalla (`children`:
  Estado, Zona, Fecha…) y el botón de descarga de `DataTable` siguen a 32 px aunque el canvas los dibuje
  a 44 px. Van a SLT-194».

## Lo que ya existe (evidencia)

Buscado `escaneo`, `BuscadorFiltros`, `devoluci`, `rechaz`, `SLT-194` en `specs/`, `progress/`,
`feature_list.json` y el código (Grep/Read; no se consultó el grafo).

| Pantalla | Dónde | Estado hoy | Entra |
| --- | --- | --- | --- |
| **Recolección** (`/recoleccion`, mensajero) | `app/(app)/recoleccion/_components/RecoleccionModule.tsx:282-305` | `BuscadorFiltros` «Buscar guías» **sin** `escaneo` (filtro de cliente, `debounceMs={0}`, `tactil`, `fija`, filtro «Tienda» y conmutador de vista). | **Sí** |
| **Devoluciones** (`/novedades`, pestaña «En devolución», adminTienda) | `NovedadesModule.tsx:674` → `NovedadesFiltrosBarra.tsx:69-70` | **Ya tiene** el buscador con `escaneo`: es B3 de SLT-160; la misma barra sirve a las dos pestañas de novedades (`novedad-grupo-textos.ts`, ficha 325). Lo vigila `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`. | **No** (ya hecho) |
| **Rechazos** (`/novedades`, pestaña «Devolución a origen por plazo vencido») | `NovedadesTabs.tsx:43,88-90` → `RechazosSlaModule.tsx` | **No tiene buscador**: lista paginada por servidor (`listarRechazosSlaTiendaAction`, solo valida `page`). | **No** (ver Preguntas abiertas) |

La lectura «devoluciones y rechazos = las pestañas de `/novedades`» sale del subtítulo de la página
(`specs/236-ayuda-tienda-novedades/requirements.md:393`: «solicitudes de ayuda, devoluciones y rechazos
por plazo vencido»). No hay otra pantalla de devoluciones o rechazos con buscador de guía en la app.

Piezas que se reusan, sin crear otras:
- `BuscadorFiltros` con `escaneo` (Enter, `leerGuia`, selección, cámara aparte de 44 px, ayuda debajo,
  campo de 44 px): `components/shared/BuscadorFiltros.tsx`.
- `EscanerModal` (la cámara del buscador ya monta uno con `soloIcono`); su barra la fija SLT-193.
- `FilterComponent` y `FiltroTienda`: los filtros de hoy, solo cambia su alto dentro de una barra con
  `escaneo`.

## Alcance

**Dentro:**
1. Recolección: su buscador pasa `escaneo` (igual que B1-B8). Lo leído por pistola o cámara **filtra**
   las dos listas («Por recolectar en tienda» y «Recogidos en tienda hoy»); no recolecta.
2. Filtros a 44 px: en toda barra con `escaneo` (B1-B8 y Recolección), los controles de filtro que
   monta la pantalla (los de `FilterComponent` y el «Tienda» de Recolección) miden 44 px, como el campo,
   la cámara, «Filtros» y «Limpiar todo» (R771 de SLT-160).

**Fuera:**
- Devoluciones: ya hecho por SLT-160 (B3).
- Rechazos por plazo vencido: no hay buscador que reusar (Preguntas abiertas).
- Botón de descarga de `DataTable` a 44 px (Preguntas abiertas).
- La barra y el «Cerrar» del diálogo de la cámara: SLT-193.
- «Por recoger» (`RecogerModule.tsx:361`) y los buscadores sin `escaneo`: no cambian.
- Búsqueda exacta por guía en Recolección: el filtro de cliente de hoy (`filtrarAsignaciones`) busca
  el número como texto, igual que B3-B8.

## Decisiones (tomadas aquí)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | El alto de 44 px de los filtros lo da la **barra**: `BuscadorFiltros` con `escaneo` lo comunica a sus `children` (contexto de React) y `FilterComponent` / `FiltroTienda` lo aplican. Ninguna pantalla pasa una prop nueva. | Una sola fuente («barra con escaneo = 44 px», D1 de SLT-160). **Descartado:** una prop en cada montaje de `FilterComponent` (8 pantallas): se puede olvidar en una y deja dos altos en la misma fila. **Descartado:** selectores de descendiente en el contenedor de la barra: frágil ante el marcado interno de cada control. |
| D2 | En Recolección la cámara del buscador solo **busca**. Recolectar sigue siendo «Escanear o escribir guía» y su diálogo «Recolectar en tienda», sin cambios. | Diseño puntual. Un paquete leído para buscarlo no debe cambiar de estado. |

## Requisitos (EARS)

### Recolección

- **R940** — El buscador «Buscar guías» de `/recoleccion` DEBE ser el `BuscadorFiltros` con `escaneo`:
  botón «Escanear con cámara» de 44 px junto al campo y fuera de él, campo de 44 px de alto y debajo el
  texto de ayuda de R770 como descripción accesible del campo. Su nombre accesible, su placeholder, el
  filtro «Tienda», el conmutador de vista y la barra fija NO DEBEN cambiar.
  - *Test:* `tests/components/RecoleccionModule.test.tsx`; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` (Recolección en la lista con `escaneo`).
- **R941** — CUANDO se pulsa Enter en el buscador de Recolección con una guía (dígitos, URL
  `/paquete/<n>` o `#<n>`), el campo DEBE quedar con el número, las dos listas DEBEN mostrar solo las
  órdenes que casan con ese número y el texto DEBE quedar seleccionado, de modo que la siguiente lectura
  lo sustituya.
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — con órdenes `91024` y `95555` en «Por recolectar» y otra `91024` en «Recogidos hoy», escribir `https://app.ejemplo.test/paquete/91024` + Enter: el campo vale `91024`, sale la tarjeta `91024` en cada lista y no la `95555`.
- **R942** — CUANDO la cámara del buscador de Recolección lee una guía, el sistema DEBE cerrar el visor,
  poner el número en el buscador y filtrar las dos listas, y NO DEBE recolectar la orden (D2).
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — doble de `html5-qrcode` con `decodedText = "91024"`: el diálogo se cierra, el campo vale `91024` y el doble de la acción de recolectar no se llama.
- **R943** — La pantalla de Recolección DEBE ofrecer dos accesos distintos: «Escanear o escribir guía»
  (recolectar, diálogo «Recolectar en tienda») y «Escanear con cámara» (buscar). CUANDO se pulsa
  «Escanear con cámara», NO DEBE abrirse el diálogo «Recolectar en tienda».
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — los dos botones existen con esos nombres; pulsar el del buscador no muestra un diálogo con título «Recolectar en tienda».
- **R944** — MIENTRAS el mensajero está bloqueado por cierre pendiente, el buscador de Recolección DEBE
  seguir visible con su botón de cámara (solo filtra), como hoy sigue visible el buscador.
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — con `bloqueo` activo: sin «Escanear o escribir guía», con «Escanear con cámara» y el campo «Buscar guías».
- **R945** — CUANDO la pantalla de Recolección mide 360 px de ancho, la barra con la cámara NO DEBE
  desbordar en horizontal y el botón «Escanear con cámara» DEBE medir al menos 44 × 44 px.
  - *E2E:* `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` — `scrollWidth <= clientWidth` del documento y `boundingBox` del botón ≥ 44 × 44.

### Filtros a 44 px

- **R946** — En una barra con `escaneo` (B1-B8 y Recolección), los controles de filtro montados en ella
  con `FilterComponent` —texto, selección múltiple, selección única, casilla, pastillas y rango de
  fechas— DEBEN medir 44 px de alto (D1).
  - *Test:* `tests/unit/components/filtros-barra-escaneo.test.tsx` (nuevo) — `BuscadorFiltros escaneo` con un `FilterComponent` de cada tipo: cada disparador o caja lleva `h-11`/`min-h-11`. `tests/components/EstadoCuentaBarra467.test.tsx`, `tests/components/WalletCajaBarra467.test.tsx` y `tests/components/MiWalletFiltros.test.tsx`: la aserción literal de `h-8` en los disparadores de B6-B8 pasa a `h-11` (misma altura que el buscador).
- **R947** — En la barra de Recolección, el filtro «Tienda» DEBE medir 44 px de alto en todos los
  anchos.
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — con el filtro «Tienda» puesto, su disparador lleva `min-h-11` sin prefijo `max-md:`.
- **R948** — Los mismos controles de filtro fuera de una barra con `escaneo` NO DEBEN cambiar de alto:
  `FilterComponent` suelto o en barras sin `escaneo` (p. ej. `/cierres-admin`, usuarios, Entregas) y el
  «Tienda» de «Por recoger».
  - *Test:* `tests/unit/components/filtros-barra-escaneo.test.tsx` — el mismo `FilterComponent` dentro de `BuscadorFiltros` sin `escaneo` y suelto conserva `h-8`; `FiltroTienda` sin barra con `escaneo` conserva `max-md:min-h-11`. `tests/unit/components/filter-component.test.tsx` y `tests/unit/components/buscador-filtros-*.test.tsx` existentes sin tocar y en verde.

## Trazabilidad (R → test)

Literales a mano; en los negativos, guías imposibles por casualidad (`91024`, `95555`).

| R | Test |
| --- | --- |
| R940 | `tests/components/RecoleccionModule.test.tsx`; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` |
| R941 | `tests/components/RecoleccionModule.test.tsx` |
| R942 | `tests/components/RecoleccionModule.test.tsx` |
| R943 | `tests/components/RecoleccionModule.test.tsx` |
| R944 | `tests/components/RecoleccionModule.test.tsx` |
| R945 | `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` |
| R946 | `tests/unit/components/filtros-barra-escaneo.test.tsx`; `tests/components/{EstadoCuentaBarra467,WalletCajaBarra467,MiWalletFiltros}.test.tsx` |
| R947 | `tests/components/RecoleccionModule.test.tsx` |
| R948 | `tests/unit/components/filtros-barra-escaneo.test.tsx`; `tests/unit/components/filter-component.test.tsx` (sin tocar) |

## Tasks

Requisito previo: SLT-193 mergeado en `dev` y traído a esta rama antes de T1 (comparte
`BuscadorFiltros.tsx`).

- [ ] **T1 — Alto desde la barra (D1).** `BuscadorFiltros` con `escaneo` provee el contexto de alto;
  `FilterComponent` (texto, casilla, pastillas, `Select` vía `className`), `MultiSelectFilter`,
  `DateRangeFilter` y `FiltroTienda` lo leen. Sin barra con `escaneo`, el valor por defecto deja todo
  como hoy. No se tocan `components/ui/*`. *Hecho:* R946 y R948 en verde; los tres tests de B6-B8 con
  el literal `h-11`.
- [ ] **T2 [P] — Recolección (depende de T1 solo para R947).** `RecoleccionModule` pasa `escaneo` al
  `BuscadorFiltros`; guardia `buscadores-con-escaneo` con Recolección en la lista. *Hecho:* R940-R944 y
  R947 en verde; los tests existentes de `RecoleccionModule` en verde.
- [ ] **T3 — E2E.** R945 en `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` a 360 px, en local con base
  desechable (`docs/perfil-agentes.md > Todos los agentes`). *Hecho:* el spec entero en verde, sin
  reintentos.
- [ ] **T4 — Dispositivo.** En Preview, en `/recoleccion` con el teléfono: leer una etiqueta con la
  cámara del buscador y comprobar que filtra y no recolecta. Nota en `progress/features/SLT-194.md`.
  *Hecho:* nota escrita.
- [ ] **T5 — Cierre.** `./init.sh` en verde; E2E locales de las pantallas con filtros que cambian de alto
  (`grep -rl` en `e2e/` por los nombres de B1-B8). *Hecho:* gate y E2E en verde.

## Tamaño

- Archivos: **15** (7 de producción, 8 de tests); tope 40, 80 % = 32.
- Producción: ~90 líneas (contexto ~20, `FilterComponent` y sus dos controles ~40, `FiltroTienda` ~10,
  `BuscadorFiltros` ~10, Recolección ~5).
- Tests: ~320 líneas (filtros nuevo ~150, Recolección ~110, E2E ~30, guardia y literales ~30).

## Archivos esperados

Marcados **[SLT-193]** los que también toca SLT-193 «Botones de 44 px pendientes en la PWA del mensajero».

Producción:
- `components/shared/BuscadorFiltros.tsx` **[SLT-193]**
- `components/shared/alto-controles-barra.ts` (nuevo: el contexto de D1)
- `components/shared/FilterComponent.tsx`
- `components/shared/MultiSelectFilter.tsx`
- `components/shared/DateRangeFilter.tsx`
- `app/(app)/mis-asignaciones/_components/FiltroTienda.tsx`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`

Tests:
- `tests/unit/components/filtros-barra-escaneo.test.tsx` (nuevo)
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/EstadoCuentaBarra467.test.tsx`
- `tests/components/WalletCajaBarra467.test.tsx`
- `tests/components/MiWalletFiltros.test.tsx`
- `tests/unit/components/filter-component.test.tsx` (solo si falla por el contexto; se espera sin tocar)
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`

## Preguntas abiertas

- **Rechazos por plazo vencido (para Carlos):** la pestaña «Devolución a origen por plazo vencido» de
  `/novedades` no tiene buscador; darle uno exige búsqueda nueva en servidor
  (`listarRechazosSlaTiendaAction` solo pagina). No es «el mismo buscador» sino uno nuevo con su consulta.
  Propuesta: fuera de esta ficha; si se quiere, ficha aparte.
- **Qué pantallas son «devoluciones» y «rechazos» (para Carlos):** sin el canvas se tomaron las dos
  pestañas de `/novedades`. Si el canvas dibuja otras pantallas, hay que nombrarlas.
- **Descarga de `DataTable` a 44 px (para Carlos):** SLT-160 la mandó aquí junto a los filtros, pero la
  tarjeta solo pide los filtros y el botón vive en `DataTable`, que no sabe si su barra lleva `escaneo`.
  Propuesta: fuera.
- **Filtros a 44 px también en B1-B8 de escritorio (para Carlos):** se aplicó a toda barra con
  `escaneo` porque así lo dejó R771 de SLT-160 y así mantiene una fila de un solo alto. Si solo se quería
  en Recolección, R946 se acota y salen los tres tests de B6-B8.
