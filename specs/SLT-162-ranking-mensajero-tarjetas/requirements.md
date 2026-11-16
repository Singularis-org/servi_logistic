# SLT-162 «Ranking del mensajero en tarjetas en el móvil» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Este archivo es el spec entero: no hay `design.md`
ni `tasks.md`. Requisitos: **R750-R768**, del rango reservado **R750-R769**.

**Solo presentación.** No cambia datos, consultas, Server Actions, permisos ni la puerta de módulo
(`exigirModuloEnRuta("ranking")`, `app/(app)/ranking/page.tsx:30-36`,
`app/(app)/ranking/historico/page.tsx:53-58`). La única línea en un `page.tsx` es pasar a
`RankingModule` el `mensajeroPropioId` que la página ya calcula para el podio (`ranking/page.tsx:53`),
sin leer nada nuevo. Si al implementar hiciera falta tocar `lib/`, `db/`, `app/api/` o leer otro dato
en un `page.tsx`, se para: la ficha pasaría a la ruta completa.

## Origen

Rebanada aparte de SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (decisión de Carlos
2026-11-14, `progress/features/SLT-156.md:28` y `specs/SLT-156-pwa-mensajero-tablas/requirements.md:31,471`).
Aplica a T6, T7 y T8 del inventario de SLT-156 el patrón que ya está en `dev`:

- inventario y diagnóstico: `specs/SLT-156-pwa-mensajero-tablas/requirements.md:73-75,127-129`;
- pantallas de hoy con `archivo:línea`: `specs/SLT-156-pwa-mensajero-tablas/brief-diseno.md:318-353` (P5, P6);
- cómo se construye (CSS para maquetar, `useIsMobile` para cambiar columnas, una sola `DataTable`):
  `specs/SLT-156-pwa-mensajero-tablas/design.md:48-59,255-260,321-333`.

**Diseño:** canvas de SLT-156 (https://claude.ai/artifact/SNvPjSLv5BApoQTsVQg9GU),
**canvas v.1794871729-fd71, `Ranking.dc.html`** (artboard «Ranking del día», 390 px) y
**`Historico.dc.html`** (artboard «Histórico»), más su nota «Diseño final: qué cambia respecto a hoy»
(puntos 1, 2, 4, 5 y 6, y «Todo lo demás es la pantalla de hoy»). Donde el spec dice «canvas» se
refiere a esos dos artboards. Manda sobre la tabla «Datos recomendados» de SLT-156
(`requirements.md:170-180`), que era previa al diseño.

## Lo que ya existe

Buscado `ranking`, `podio`, `histórico`, `premio`, `tarjetas`, `móvil` y `R75x/R76x` en
`feature_list.json`, `specs/`, `progress/`, `app/(app)/ranking/`, `components/shared/` y `tests/`, con
Grep/Read. **El grafo no tiene indexado este worktree** (`index_status`: project not found).

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solo esta ficha. SLT-124 «Ranking de la central sin mensajeros de satélite» (`done`) es de datos, no de pantalla. | Se sigue. No es duplicado. |
| `specs/` | Ningún spec usa R750-R769. SLT-156 dejó Ranking fuera expresamente. | Se sigue. |
| `hooks/use-mobile.ts` | `useIsMobile` (corte 768 px, `false` en servidor). | **Se reutiliza.** |
| `components/private/cierres/cola/TablaColaPropia.tsx:89-105` + `ColaCierres.tsx:214-223,279,340-342` (SLT-165 «PWA del mensajero: Cierre del día en tarjetas») | Columnas móviles sobre la MISMA `DataTable` con `useIsMobile`, cabeceras solo para lector (`renderHeader` con `sr-only`) y detalle por `renderExpanded`. | **Es el modelo a copiar** para T6 y T8. |
| `ColaCierres.tsx:237` | `DESPLEGABLE_TACTIL` (desplegar de la `DataTable` a 44 px en móvil, por selector de descendiente). | **Se promueve** a `components/shared/texto-entero.ts` (pasa a tener dos consumidores) y `ColaCierres` lo importa de ahí. |
| `components/shared/texto-entero.ts` | `TEXTO_ENTERO`, `COLUMNA_FIJA`, `TACTIL_MOVIL`. | **Se reutiliza.** |
| `components/shared/DataTable.tsx:612-616` + `DescargarDatasetButton.tsx:322-341` | La descarga de T6 y T8 (familia B, `filasLocales`); el botón es `Button` por defecto (32 px). | Contenido **sin cambios**; solo su tamaño en móvil (R766). |
| `components/shared/BuscadorFiltros.tsx` | Barra única de búsqueda y filtros. | **No se usa**: el canvas no dibuja búsqueda ni filtros en estas dos pantallas (R757). |
| `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts:41` | `ARCHIVOS_PWA_MENSAJERO`, reglas `recorte`/`escala`/`oculta` por archivo. | **Se amplía** con los archivos de esta ficha. |
| `e2e/_pwa-mensajero-fixture.ts` | `sinDesborde`, `sinElipsis`, `sinSolapes`, `tactil`, `ANCHOS_MOVIL`. | **Se reutiliza**; se añaden dos textos largos. |
| `app/(app)/ranking/_components/RankingPodio.tsx` | `truncate` en el nombre de la lista del resto (`:191`), medios pasos de espaciado y textos de 10-11 px. | Se ajusta al canvas (R758, R765, R767, R768). |

## Alcance

- **Dentro:** en `/ranking`, el podio (`RankingPodio`: recorte, escala, fila del resto y tamaño de
  texto, como lo dibuja el canvas), la tabla «Ranking del día» (T6) y la tabla «Premios del podio»
  (T7); en `/ranking/historico`, la tabla del ranking congelado (T8), su selector «Fecha del
  histórico» y «Descargar».
- «Móvil» = ventana de menos de 768 px, **para cualquier rol** (DC1 de SLT-156). En escritorio
  (≥ 768 px) las tablas conservan sus columnas y su orden.
- **Se queda como hoy** (nota del canvas: «Todo lo demás es la pantalla de hoy»): los pedestales del
  podio, el recorte al top 10 del mensajero y su fila anclada «Tu posición, fuera del top 10», los
  textos de cabecera y descripción de cada sección, los estados vacíos, y que «Ranking del día» y
  «Premios del podio» sigan debajo del podio (el canvas los dibuja ahí).
- **Fuera:** datos, cálculos, orden de las filas (lo da el servidor), permisos, la puerta del módulo,
  el contenido de la descarga y el voseo de los textos (D70).

## Decisiones cerradas (no reabrir)

Heredadas de SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (`progress/features/SLT-156.md:16-28`,
diseño aprobado por Carlos 2026-11-14) y fijadas por el canvas v.1794871729-fd71 (`Ranking.dc.html`,
`Historico.dc.html`). Cada fila con los requisitos que la cubren.

| # | Decisión | Requisitos |
|---|---|---|
| DC1 | Las tablas pasan a tarjetas por **ancho** (< 768 px), para cualquier rol. | R750, R752, R755 |
| DC3 | Los botones táctiles del mensajero miden ≥ 44 px (nota del canvas, punto 2). | R753, R757, R760, R766 |
| DC8 | Un solo `BuscadorFiltros` donde haya búsqueda o filtros. El canvas no dibuja ninguno en Ranking ni en Histórico: no se añade (antes P2). | R757 |
| DC10 | Ningún dato se recorta: el texto sigue en líneas; importes en columna fija. | R758, R759 |
| DC11 | Escala de espaciado 4/8 (nota del canvas, punto 5), también en el podio (antes P3). | R765 |
| DC19 | Canvas: las tarjetas llevan rótulo y cifra («Entregados / asignados», «% del día», «Monto del premio», «Premio»), sin cabecera de columnas. | R750, R752, R755 |
| DC20 | Canvas: «Descargar» en móvil a todo el ancho, 44 px, encima de la lista (antes P4). | R766 |
| DC21 | Canvas: en el Histórico la descripción del premio va visible junto al monto, no al desplegar; al desplegar van Puesto, Entregado y Asignados (antes P5). | R755 |
| DC22 | Canvas: la fila del mensajero que mira lleva el chip «Tú» en «Ranking del día». | R750 |
| — | Ranking va en ficha aparte con el patrón de SLT-156 (Carlos 2026-11-14). | todos |

## Requisitos (EARS)

«Ranking del día» = T6 (`RankingModule.tsx:94-130`); «Premios del podio» = T7
(`RankingModule.tsx:132-180` + `PremioInputRow`); «Histórico» = T8
(`RankingHistoricoModule.tsx:128-194`). «Sin dato» = `SIN_DATO` («—»).

### Ranking del día

- **R750** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada fila de «Ranking del día»
  como una tarjeta, sin cabecera de columnas visible y sin desplegar, con: arriba «{posición} ·
  {nombre}» (posición sin dato → «—») y, SI la fila es la del mensajero que mira, el chip «Tú» a la
  derecha; abajo a la izquierda el rótulo «Entregados / asignados» con «{entregados} / {asignados}»
  debajo; abajo a la derecha, en columna fija, el rótulo «% del día» con el porcentaje debajo.
- **R751** — MIENTRAS la ventana NO sea móvil, el sistema DEBE pintar «Ranking del día» con las cuatro
  columnas de hoy, en el mismo orden (Posición, Mensajero, % del día, Entregados / asignados).

### Premios del podio

- **R752** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada posición de «Premios del podio»
  como una tarjeta, sin cabecera de columnas visible ni desplazamiento horizontal, con: arriba
  «{n}º · {ocupante}» (o «Sin ocupante elegible hoy»); abajo a la izquierda la descripción del premio
  (o «Sin descripción»); abajo a la derecha, en columna fija, el rótulo «Monto del premio» con el
  monto debajo (o «Sin premio asignado»).
- **R753** — MIENTRAS la ventana sea móvil Y el usuario pueda editar los premios (acceso total), la
  tarjeta de cada posición DEBE mostrar los campos de monto y descripción y el botón «Guardar», cada
  uno con un área táctil de al menos 44 px de alto (el botón, 44 × 44 px), y CUANDO pulsa «Guardar»
  el sistema DEBE guardar el premio de esa posición igual que hoy. (Variante no dibujada: ver P1.)
- **R754** — MIENTRAS la ventana NO sea móvil, el sistema DEBE pintar «Premios del podio» con las
  columnas de hoy (Posición, Mensajero, Monto del premio, Descripción y, si es editable, Acciones).

### Histórico

- **R755** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada fila del Histórico como una
  tarjeta, sin cabecera de columnas visible, con: arriba «{posición}º · {nombre}» (posición sin dato →
  «— · {nombre}») y, a la derecha, el control para desplegar; abajo a la izquierda el rótulo «Premio»
  con «{monto} · {descripción}», solo «{monto}» si no hay descripción, o «Sin premio asignado» si no
  hay monto; abajo a la derecha, en columna fija, el rótulo «% del día» con el porcentaje debajo; y,
  CUANDO el usuario despliega la tarjeta, los pares rótulo-valor «Puesto», «Entregado» y «Asignados».
- **R756** — MIENTRAS la ventana NO sea móvil, el sistema DEBE pintar el Histórico con las siete
  columnas de hoy, en el mismo orden (Puesto, Posición, Mensajero, % del día, Entregado, Asignados,
  Premio).
- **R757** — El selector «Fecha del histórico» DEBE seguir siendo un campo de fecha con su rótulo
  encima, sin barra de búsqueda ni filtros; MIENTRAS la ventana sea móvil DEBE ocupar todo el ancho y
  medir al menos 44 px de alto; y CUANDO el usuario elige una fecha, el sistema DEBE navegar a
  `/ranking/historico?fecha=<fecha>` como hoy.

### Comunes

- **R758** — El sistema DEBE mostrar entero, en todos los anchos, cada dato de «Ranking del día»,
  «Premios del podio», el Histórico y el podio (`RankingPodio`): nombre del mensajero, descripción del
  premio, monto, porcentaje y conteos. Ningún elemento que lo contenga DEBE tener
  `text-overflow: ellipsis`, `line-clamp` ni texto escondido por `overflow: hidden`, ni depender de
  `title` para leerse; el texto que no cabe DEBE seguir en las líneas siguientes, partiendo una
  palabra sin espacios si hace falta.
- **R759** — En cada tarjeta de R750, R752 y R755 y en cada fila de R767, el porcentaje, los conteos y
  cada importe DEBEN ocupar una columna que no se encoge ni se parte en líneas, y su caja NO DEBE
  intersectar la caja de ningún otro dato.
- **R760** — MIENTRAS la ventana sea móvil, el control para desplegar una tarjeta del Histórico DEBE
  medir al menos 44 × 44 px, exponer su estado con `aria-expanded` y tener nombre accesible «Ver
  detalle» (plegado) u «Ocultar detalle» (desplegado).
- **R761** — MIENTRAS la ventana mida 360 o 414 px de ancho, `/ranking` y `/ranking/historico` NO DEBEN
  desbordar el ancho de la ventana, y ninguna de sus tarjetas, controles ni secciones DEBE desbordar
  su contenedor.
- **R762** — «Descargar» de «Ranking del día» y del Histórico DEBE entregar las mismas columnas y filas
  que hoy, en cualquier ancho; cada pantalla DEBE seguir teniendo una sola instancia de `DataTable`
  por tabla.
- **R763** — MIENTRAS la ventana sea móvil, el sistema DEBE conservar los estados vacíos de hoy con sus
  mismos textos: «Todavía no hay mensajeros para mostrar hoy.» en el ranking, y en el Histórico los dos
  estados distintos «No se generó el snapshot de esta fecha.» (sin lista ni «Descargar») y «Ese día no
  hubo actividad…».
- **R764** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar las tarjetas de «Ranking del día»,
  «Premios del podio» y del Histórico en el mismo orden en que hoy se pintan las filas (el del servidor;
  premios por posición 1-3).
- **R765** — Los márgenes, rellenos y huecos de `RankingModule`, `PremioInputRow`,
  `RankingHistoricoModule`, `RankingPodio` y de las columnas móviles que añade la ficha DEBEN salir de
  la escala de 4 px: sin medios pasos (`*-0.5`, `*-1.5`, `*-2.5`, `*-3.5`) ni espaciados arbitrarios.
- **R766** — MIENTRAS la ventana sea móvil, «Descargar» de «Ranking del día» y del Histórico DEBE
  ocupar todo el ancho de su sección, medir al menos 44 px de alto e ir encima de la lista de
  tarjetas; en escritorio DEBE quedar como hoy.

### Podio

- **R767** — MIENTRAS la ventana sea móvil, cada fila de la lista del resto del podio DEBE mostrar, en
  este orden: el lugar; el nombre (con el chip «Tú» a su lado si es la fila del mensajero que mira),
  que envuelve en líneas; «{entregados}/{asignados} entregas» sin partirse; y el porcentaje en columna
  fija a la derecha, sin barra de progreso.
- **R768** — MIENTRAS la ventana sea móvil, ningún texto del podio (nombres, conteos, «{n}º lugar»,
  premio, chip «Tú») DEBE medir menos de 12 px.

## Tasks

Orden: T1 → (T2 ∥ T3) → T4 → T5 → T6. `[P]` = paralelizable con su hermana.

- [ ] **T1 — Base compartida.** Mover `DESPLEGABLE_TACTIL` de `ColaCierres.tsx:237` a
  `components/shared/texto-entero.ts` e importarlo desde ahí en `ColaCierres`. Añadir ahí también
  `DESCARGA_MOVIL`: clase de selector de descendiente (mismo mecanismo que `DESPLEGABLE_TACTIL`) que
  pone el control de descarga de la `DataTable` a todo el ancho y `min-h-11` solo en `max-md:`. Si
  el selector no alcanza el botón, una prop opcional en `DataTable` apagada por defecto (los demás
  consumidores no cambian). Añadir a `e2e/_pwa-mensajero-fixture.ts` un nombre de mensajero largo
  (80 caracteres con una palabra de 40 sin espacios) y una descripción de premio larga (200
  caracteres).
  *Hecho:* typecheck verde; tests de la cola de cierres sin cambios y en verde.
- [ ] **T2 [P] — Ranking del día, Premios y podio** (`RankingModule.tsx`, `PremioInputRow.tsx`,
  `RankingPodio.tsx`, `ranking/page.tsx`). Columnas móviles de T6 con `useIsMobile` sobre la MISMA
  `DataTable` (modelo `columnasTablaPropiaMovil`, cabeceras `sr-only`), `TEXTO_ENTERO` y
  `COLUMNA_FIJA`; `page.tsx` pasa `mensajeroPropioId` a `RankingModule` para el chip «Tú» (rótulo
  existente `PODIO_LABELS.vos`). Premios en móvil: el MISMO `<table>` se maqueta como tarjetas con
  clases `max-md:` (un solo DOM, sin duplicar inputs ni «Guardar»); «Guardar» con `TACTIL_MOVIL`,
  inputs con `max-md:h-11`. Podio: fila del resto según R767, `TEXTO_ENTERO` en el nombre, escala de
  4 px y `max-md:text-xs` mínimo (R768). `DESCARGA_MOVIL` en la sección de T6.
  *Hecho:* tests de componente de R750-R754, R758 (podio y premios), R763 (ranking), R764, R766,
  R767 y R768 en verde, con `matchMedia` simulado a 360 y a 1280 px.
- [ ] **T3 [P] — Histórico** (`RankingHistoricoModule.tsx`, `ranking-historico-labels.ts` para los
  rótulos «Premio», «Ver detalle», «Ocultar detalle»). Columnas móviles con `useIsMobile` y
  `renderExpanded` solo en móvil (Puesto, Entregado, Asignados); `expandAriaLabel`;
  `DESPLEGABLE_TACTIL` y `DESCARGA_MOVIL` en la sección. El selector de fecha: rótulo encima, `w-full`
  y `max-md:h-11` (hoy `w-44`); su `onChange` sigue navegando con `router.push`. Quitar `gap-1.5`.
  *Hecho:* tests de componente de R755-R757, R760 (estado y nombre), R763 (los dos vacíos), R764 y
  R766 en verde, a 360 y 1280 px.
- [ ] **T4 — Descarga y guardia.** Comprobar R762 a ancho móvil en
  `tests/components/descarga/RankingDescarga.test.tsx` y `RankingHistoricoDescarga.test.tsx` (mismas
  columnas y filas que a escritorio). Añadir a `ARCHIVOS_PWA_MENSAJERO`: `RankingModule.tsx`,
  `PremioInputRow.tsx` y `RankingHistoricoModule.tsx` con `recorte`, `escala` y `oculta`;
  `RankingPodio.tsx` con `recorte` y `escala` (nota: su `overflow-hidden` es la barra de progreso,
  no un dato).
  *Hecho:* guardia en verde; mutación: devolver `truncate` al nombre del podio o `gap-1.5` al
  Histórico la pone en rojo.
- [ ] **T5 — E2E** `e2e/pwa-mensajero-ranking.spec.ts` a 360 y 414 px (`ANCHOS_MOVIL`): módulo
  `ranking` encendido, un mensajero con el nombre largo y entregas del día, premios con la descripción
  larga y un snapshot del Histórico sembrado con Prisma en la base desechable (precedente
  `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`). Afirma `sinDesborde`, `sinElipsis` y `sinSolapes`
  en el podio y las tres secciones; `tactil` en el desplegar del Histórico, el selector de fecha,
  «Descargar» de las dos pantallas y —como maestro— «Guardar» de premios. Base desechable y
  `NEXT_PUBLIC_APP_URL` como en `gate.yml`.
  *Hecho:* E2E en verde en local (E2E_EXIT=0 en el log); mutaciones que lo ponen rojo: `truncate`
  en el nombre de una tarjeta, quitar `DESCARGA_MOVIL`, `size="sm"` en «Guardar», volver las columnas
  de escritorio en móvil.
- [ ] **T6 — Cierre local.** `./init.sh` verde con base desechable (`INIT_EXIT=0` en el log) y mapa
  `R → test` de abajo completado con el nombre de cada caso.
  *Hecho:* cada R750-R768 con al menos un test que falla si se rompe.

### Mapa R → test (lo completa el implementer)

| R | Test |
|---|---|
| R750, R751 | `tests/components/RankingModule.test.tsx` |
| R752, R753, R754 | `tests/components/RankingModule.test.tsx`; R753 también `e2e/pwa-mensajero-ranking.spec.ts` |
| R755, R756, R757 | `tests/components/RankingHistoricoModule.test.tsx`; R757 (44 px) también el E2E |
| R758 | `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` + `e2e/pwa-mensajero-ranking.spec.ts` (`sinElipsis`) |
| R759 | `e2e/pwa-mensajero-ranking.spec.ts` (`sinSolapes`) |
| R760 | `tests/components/RankingHistoricoModule.test.tsx` (estado y nombre) + E2E (`tactil`) |
| R761 | `e2e/pwa-mensajero-ranking.spec.ts` (`sinDesborde`) |
| R762 | `tests/components/descarga/RankingDescarga.test.tsx`, `tests/components/descarga/RankingHistoricoDescarga.test.tsx` |
| R763, R764 | `tests/components/RankingModule.test.tsx`, `tests/components/RankingHistoricoModule.test.tsx` (orden por `compareDocumentPosition`) |
| R765 | `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` |
| R766 | tests de componente (orden respecto a la lista) + E2E (`tactil` y ancho) |
| R767, R768 | `tests/components/RankingPodio.test.tsx` + E2E (`sinSolapes` en la fila, tamaño de letra calculado) |

## Archivos esperados

Producción:
- `app/(app)/ranking/page.tsx`
- `app/(app)/ranking/_components/RankingModule.tsx`
- `app/(app)/ranking/_components/PremioInputRow.tsx`
- `app/(app)/ranking/_components/RankingPodio.tsx`
- `app/(app)/ranking/_components/ranking-labels.ts`
- `app/(app)/ranking/historico/_components/RankingHistoricoModule.tsx`
- `app/(app)/ranking/historico/_components/ranking-historico-labels.ts`
- `components/shared/texto-entero.ts`
- `components/shared/DataTable.tsx`
- `components/private/cierres/cola/ColaCierres.tsx`

Tests:
- `tests/components/RankingModule.test.tsx`
- `tests/components/RankingHistoricoModule.test.tsx`
- `tests/components/RankingPodio.test.tsx`
- `tests/components/descarga/RankingDescarga.test.tsx`
- `tests/components/descarga/RankingHistoricoDescarga.test.tsx`
- `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts`
- `e2e/pwa-mensajero-ranking.spec.ts`
- `e2e/_pwa-mensajero-fixture.ts`

`components/shared/DataTable.tsx` solo si `DESCARGA_MOVIL` no alcanza el botón por selector (T1); se
lista para que el choque con otras fichas se vea. `ranking-labels.ts` solo si hace falta un rótulo
nuevo para la tarjeta.

## Tamaño

- **Archivos:** 18 (10 de producción, 8 de tests), frente al tope de 40 (80 % = 32). Cabe.
- **Líneas de producción:** ~300-400 (columnas móviles de T6 y T8, maquetación `max-md:` de premios,
  la fila del resto del podio, el selector de fecha, dos constantes compartidas y quitar medios
  pasos). Tope 1000.
- **Líneas de tests:** ~700-950 (tres tests de componente ampliados, dos de descarga, la guardia y un
  E2E nuevo con su siembra). Tope 3000.

## Preguntas abiertas

- **P1 — Edición de premios en móvil.** El canvas (`Ranking.dc.html`) dibuja «Premios del podio» solo
  en lectura, como lo ve el mensajero. Para maestro/admin en un teléfono, R753 deja en la tarjeta los
  campos y «Guardar» a 44 px, con el mismo guardado de hoy. ¿Vale así, o el canvas tiene otra variante?

Cerradas por el canvas v.1794871729-fd71 (`Ranking.dc.html`, `Historico.dc.html`): la antigua P1
(canvas no leído), P2 (sin `BuscadorFiltros`: DC8), P3 (escala y texto ≥ 12 px también en el podio:
DC11, R765, R768), P4 («Descargar» a 44 px y a todo el ancho: DC20), P5 (descripción del premio
visible junto al monto: DC21) y P6 («Ranking del día» y «Premios» siguen bajo el podio: el canvas los
dibuja ahí).
