# SLT-162 «Ranking del mensajero en tarjetas en el móvil» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Este archivo es el spec entero: no hay `design.md`
ni `tasks.md`. Requisitos: **R750-R765**, del rango reservado **R750-R769**.

**Solo presentación.** No cambia datos, consultas, Server Actions, permisos ni la puerta de módulo
(`exigirModuloEnRuta("ranking")`, `app/(app)/ranking/page.tsx:30-36`,
`app/(app)/ranking/historico/page.tsx:53-58`). Si al implementar hiciera falta tocar `lib/`, `db/`,
`app/api/` o un `page.tsx`, se para: la ficha pasaría a la ruta completa.

## Origen

Rebanada aparte de SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (decisión de Carlos
2026-11-14, `progress/features/SLT-156.md:28` y `specs/SLT-156-pwa-mensajero-tablas/requirements.md:31,471`).
Aplica a T6, T7 y T8 del inventario de SLT-156 el patrón que ya está en `dev`:

- inventario y diagnóstico: `specs/SLT-156-pwa-mensajero-tablas/requirements.md:73-75,127-129`;
- datos recomendados de cada tarjeta: misma ruta, `:170-180` (filas T6, T7, T8);
- pantallas de hoy con `archivo:línea`: `specs/SLT-156-pwa-mensajero-tablas/brief-diseno.md:318-353` (P5, P6);
- cómo se construye (CSS para maquetar, `useIsMobile` para cambiar columnas, una sola `DataTable`):
  `specs/SLT-156-pwa-mensajero-tablas/design.md:48-59,255-260,321-333`.

El diseño visual de los artboards «Ranking» e «Histórico» vive en el canvas de SLT-156
(https://claude.ai/artifact/SNvPjSLv5BApoQTsVQg9GU). **No lo he podido leer** (es un artifact de
claude.ai, sin acceso desde el agente): ver P1.

## Lo que ya existe

Buscado `ranking`, `podio`, `histórico`, `premio`, `tarjetas`, `móvil` y `R75x/R76x` en
`feature_list.json`, `specs/`, `progress/`, `app/(app)/ranking/`, `components/shared/` y `tests/`, con
Grep/Read. **El grafo no tiene indexado este worktree** (`index_status`: project not found).

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solo esta ficha. SLT-124 «Ranking de la central sin mensajeros de satélite» (`done`) es de datos, no de pantalla. | Se sigue. No es duplicado. |
| `specs/` | Ningún spec usa R750-R769. SLT-156 dejó Ranking fuera expresamente. | Se sigue. |
| `hooks/use-mobile.ts` | `useIsMobile` (corte 768 px, `false` en servidor). | **Se reutiliza.** |
| `components/private/cierres/cola/TablaColaPropia.tsx:105` + `ColaCierres.tsx:279,340-342` (SLT-165 «PWA del mensajero: Cierre del día en tarjetas») | Columnas móviles sobre la MISMA `DataTable` con `useIsMobile` y detalle por `renderExpanded`. | **Es el modelo a copiar** para T6 y T8. |
| `ColaCierres.tsx:237` | `DESPLEGABLE_TACTIL` (desplegar de la `DataTable` a 44 px en móvil). | **Se promueve** a `components/shared/texto-entero.ts` (pasa a tener dos consumidores) y `ColaCierres` lo importa de ahí. |
| `components/shared/texto-entero.ts` | `TEXTO_ENTERO`, `COLUMNA_FIJA`, `TACTIL_MOVIL`. | **Se reutiliza.** |
| `components/shared/BuscadorFiltros.tsx:171,176,181` | Props `buscador={false}` (solo los controles puestos), `fija`, `tactil`. | **Se reutiliza** para el selector de fecha del Histórico. |
| `components/shared/DataTable.tsx` + `DescargarDatasetButton` | La descarga de T6 y T8 (familia B, `filasLocales`). | **No se toca.** |
| `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts:41` | `ARCHIVOS_PWA_MENSAJERO`, reglas `recorte`/`escala`/`oculta` por archivo. | **Se amplía** con los archivos de esta ficha. |
| `e2e/_pwa-mensajero-fixture.ts` | `sinDesborde`, `sinElipsis`, `sinSolapes`, `tactil`, `ANCHOS_MOVIL`. | **Se reutiliza**; se añaden dos textos largos. |
| `app/(app)/ranking/_components/RankingPodio.tsx:191` | `truncate` en el nombre de la lista del resto del podio. | Se quita (R758). |

## Alcance

- **Dentro:** en `/ranking`, la tabla «Ranking del día» (T6), la tabla «Premios del podio» (T7) y el
  nombre recortado de la lista del podio (`RankingPodio`); en `/ranking/historico`, la tabla del
  ranking congelado (T8) y su selector «Fecha del histórico».
- «Móvil» = ventana de menos de 768 px, **para cualquier rol** (DC1 de SLT-156). En escritorio
  (≥ 768 px) las tablas conservan sus columnas y su orden.
- **Fuera:** datos, cálculos, orden de las filas (lo da el servidor), permisos, la puerta del
  módulo, el contenido de la descarga, el podio salvo su recorte (ver P3), el voseo de los textos
  (D70), y retirar la «versión anterior, debajo para comparar» (`ranking/page.tsx:57`; ver P6).

## Decisiones cerradas (no reabrir)

Heredadas de SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (`progress/features/SLT-156.md:16-28`,
diseño aprobado por Carlos 2026-11-14). Cada fila con los requisitos que la cubren.

| # | Decisión | Requisitos |
|---|---|---|
| DC1 | Las tablas pasan a tarjetas por **ancho** (< 768 px), para cualquier rol. | R750, R752, R755 |
| DC3 | Los botones de las tarjetas miden ≥ 44 px. | R753, R760 |
| DC8 | Búsqueda y filtros de cada lista en un único `BuscadorFiltros`. | R757 |
| DC10 | Ningún dato se recorta: el texto sigue en líneas; importes en columna fija. | R758, R759 |
| DC11 | Escala de espaciado 4/8. | R765 |
| — | Ranking va en ficha aparte con el patrón de SLT-156 (Carlos 2026-11-14). | todos |

## Requisitos (EARS)

«Ranking del día» = T6 (`RankingModule.tsx:94-130`); «Premios del podio» = T7
(`RankingModule.tsx:132-180` + `PremioInputRow`); «Histórico» = T8
(`RankingHistoricoModule.tsx:128-194`).

### Ranking del día

- **R750** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada fila de «Ranking del día»
  como una tarjeta con: posición y nombre del mensajero; debajo, «entregados / asignados»; y el
  «% del día» en una columna fija a la derecha.
- **R751** — MIENTRAS la ventana NO sea móvil, el sistema DEBE pintar «Ranking del día» con las cuatro
  columnas de hoy, en el mismo orden (Posición, Mensajero, % del día, Entregados / asignados).

### Premios del podio

- **R752** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada posición de «Premios del podio»
  como una tarjeta con: posición y ocupante (o «Sin ocupante elegible hoy»); la descripción del
  premio (o «Sin descripción»); y el monto en una columna fija (o «Sin premio asignado»), sin
  desplazamiento horizontal.
- **R753** — MIENTRAS la ventana sea móvil Y el usuario pueda editar los premios (acceso total), la
  tarjeta de cada posición DEBE mostrar los campos de monto y descripción y el botón «Guardar», cada
  uno con un área táctil de al menos 44 px de alto (el botón, 44 × 44 px), y CUANDO pulsa «Guardar»
  el sistema DEBE guardar el premio de esa posición igual que hoy.
- **R754** — MIENTRAS la ventana NO sea móvil, el sistema DEBE pintar «Premios del podio» con las
  columnas de hoy (Posición, Mensajero, Monto del premio, Descripción y, si es editable, Acciones).

### Histórico

- **R755** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada fila del Histórico como una
  tarjeta con: puesto y nombre del mensajero; debajo, «entregadas / asignadas»; a la derecha, en
  columna fija, el «% del día» y el monto del premio; y, CUANDO el usuario despliega la tarjeta, la
  Posición y la descripción del premio (si la tiene).
- **R756** — MIENTRAS la ventana NO sea móvil, el sistema DEBE pintar el Histórico con las siete
  columnas de hoy, en el mismo orden (Puesto, Posición, Mensajero, % del día, Entregadas, Asignadas,
  Premio).
- **R757** — El selector «Fecha del histórico» DEBE vivir dentro de una única instancia de
  `BuscadorFiltros` sin campo de búsqueda; MIENTRAS la ventana sea móvil DEBE medir al menos 44 px de
  alto; y CUANDO el usuario elige una fecha, el sistema DEBE navegar a `/ranking/historico?fecha=<fecha>`
  como hoy.

### Comunes a las tres

- **R758** — El sistema DEBE mostrar entero, en todos los anchos, cada dato de «Ranking del día»,
  «Premios del podio», el Histórico y la lista del podio (`RankingPodio`): nombre del mensajero,
  descripción del premio, monto, porcentaje y conteos. Ningún elemento que lo contenga DEBE tener
  `text-overflow: ellipsis`, `line-clamp` ni texto escondido por `overflow: hidden`, ni depender de
  `title` para leerse; el texto que no cabe DEBE seguir en las líneas siguientes, partiendo una
  palabra sin espacios si hace falta.
- **R759** — En cada tarjeta de R750, R752 y R755, el porcentaje y cada importe DEBEN ocupar una
  columna de ancho fijo que no se encoge ni se parte en líneas, y su caja NO DEBE intersectar la caja
  de ningún otro dato de la tarjeta.
- **R760** — MIENTRAS la ventana sea móvil, el control para desplegar una tarjeta del Histórico DEBE
  tener un área táctil de al menos 44 × 44 px.
- **R761** — MIENTRAS la ventana mida 360 o 414 px de ancho, `/ranking` y `/ranking/historico` NO DEBEN
  desbordar el ancho de la ventana, y ninguna de sus tarjetas, barras («Descargar», selector de fecha)
  ni secciones DEBE desbordar su contenedor.
- **R762** — «Descargar» de «Ranking del día» y del Histórico DEBE entregar las mismas columnas y filas
  que hoy, en cualquier ancho; cada pantalla DEBE seguir teniendo una sola instancia de `DataTable`
  por tabla.
- **R763** — MIENTRAS la ventana sea móvil, el sistema DEBE conservar los estados vacíos de hoy con sus
  mismos textos: «Todavía no hay mensajeros para mostrar hoy.» en el ranking, y en el Histórico los dos
  estados distintos «No se generó el snapshot de esta fecha.» (sin tabla ni «Descargar») y «Ese día no
  hubo actividad…».
- **R764** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar las tarjetas de «Ranking del día»,
  «Premios del podio» y del Histórico en el mismo orden en que hoy se pintan las filas (el del servidor;
  premios por posición 1-3).
- **R765** — Los márgenes, rellenos y huecos de `RankingModule`, `PremioInputRow`,
  `RankingHistoricoModule` y de las columnas móviles que añade la ficha DEBEN salir de la escala de
  4 px: sin medios pasos (`*-0.5`, `*-1.5`, `*-2.5`, `*-3.5`) ni espaciados arbitrarios.

## Tasks

Orden: T1 → (T2 ∥ T3) → T4 → T5 → T6. `[P]` = paralelizable con su hermana.

- [ ] **T1 — Base compartida.** Mover `DESPLEGABLE_TACTIL` de `ColaCierres.tsx:237` a
  `components/shared/texto-entero.ts` e importarlo desde ahí en `ColaCierres`. Añadir a
  `e2e/_pwa-mensajero-fixture.ts` un nombre de mensajero largo (80 caracteres con una palabra de 40
  sin espacios) y una descripción de premio larga (200 caracteres).
  *Hecho:* typecheck verde; `tests/components` de la cola de cierres sin cambios y en verde.
- [ ] **T2 [P] — Ranking del día y Premios** (`RankingModule.tsx`, `PremioInputRow.tsx`).
  Columnas móviles de T6 con `useIsMobile` sobre la MISMA `DataTable` (modelo:
  `columnasTablaPropiaMovil`), con `TEXTO_ENTERO` y `COLUMNA_FIJA`. Premios en móvil: el MISMO
  `<table>` se maqueta como tarjetas con clases `max-md:` (un solo DOM, sin duplicar inputs ni
  «Guardar»; `design.md §1` de SLT-156); `Guardar` con `size="touch"` en móvil o `TACTIL_MOVIL`,
  inputs con `max-md:h-11`. Quitar medios pasos de espaciado. Quitar el `truncate` del nombre en
  `FilaResto` (`RankingPodio.tsx:191`) por `TEXTO_ENTERO`.
  *Hecho:* tests de componente de R750-R754, R758 (podio y premios), R763 (ranking), R764 en verde,
  con `matchMedia` simulado a 360 y a 1280 px.
- [ ] **T3 [P] — Histórico** (`RankingHistoricoModule.tsx`, `ranking-historico-labels.ts` si hace falta
  un rótulo nuevo). Columnas móviles con `useIsMobile` y `renderExpanded` solo en móvil (Posición y
  descripción del premio); `DESPLEGABLE_TACTIL` en la sección. El `<Input type="date">` pasa a
  `children` de un `BuscadorFiltros` con `buscador={false}`, `tactil`, `leerDeUrl={false}`; su
  `onChange` sigue navegando con `router.push` como hoy. Quitar `gap-1.5`.
  *Hecho:* tests de componente de R755-R757, R763 (los dos vacíos), R764 en verde, a 360 y 1280 px.
- [ ] **T4 — Descarga y guardia.** Comprobar R762 a ancho móvil en
  `tests/components/descarga/RankingDescarga.test.tsx` y `RankingHistoricoDescarga.test.tsx` (mismas
  columnas y filas que a escritorio). Añadir a `ARCHIVOS_PWA_MENSAJERO`: `RankingModule.tsx`,
  `PremioInputRow.tsx`, `RankingHistoricoModule.tsx` con `recorte`, `escala` y `oculta`;
  `RankingPodio.tsx` con `recorte` solamente (nota: escala pendiente de P3; su `overflow-hidden` es la
  barra de progreso, no un dato).
  *Hecho:* guardia en verde; mutación: devolver `truncate` a `FilaResto` o `gap-1.5` al Histórico la
  pone en rojo.
- [ ] **T5 — E2E** `e2e/pwa-mensajero-ranking.spec.ts` a 360 y 414 px (`ANCHOS_MOVIL`): módulo
  `ranking` encendido, un mensajero con el nombre largo y entregas del día, premios con la
  descripción larga y un snapshot del Histórico sembrado con Prisma en la base desechable (precedente
  `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`). Afirma `sinDesborde`, `sinElipsis` y `sinSolapes`
  en las tres secciones y el podio, `tactil` en el desplegar del Histórico, el selector de fecha y
  —como maestro— «Guardar» de premios. Base desechable y `NEXT_PUBLIC_APP_URL` como en `gate.yml`.
  *Hecho:* E2E en verde en local (E2E_EXIT=0 en el log); mutaciones que lo ponen rojo: `truncate`
  en el nombre de la tarjeta, `size="sm"` en «Guardar», volver las columnas de escritorio en móvil.
- [ ] **T6 — Cierre local.** `./init.sh` verde con base desechable (`INIT_EXIT=0` en el log) y mapa
  `R → test` abajo completado con el nombre de cada caso.
  *Hecho:* cada R750-R765 con al menos un test que falla si se rompe.

### Mapa R → test (lo completa el implementer)

| R | Test |
|---|---|
| R750, R751 | `tests/components/RankingModule.test.tsx` |
| R752, R753, R754 | `tests/components/RankingModule.test.tsx`; R753 también `e2e/pwa-mensajero-ranking.spec.ts` |
| R755, R756, R757 | `tests/components/RankingHistoricoModule.test.tsx` |
| R758 | `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` + `e2e/pwa-mensajero-ranking.spec.ts` (`sinElipsis`) |
| R759 | `e2e/pwa-mensajero-ranking.spec.ts` (`sinSolapes`) |
| R760, R761 | `e2e/pwa-mensajero-ranking.spec.ts` (`tactil`, `sinDesborde`) |
| R762 | `tests/components/descarga/RankingDescarga.test.tsx`, `tests/components/descarga/RankingHistoricoDescarga.test.tsx` |
| R763 | `tests/components/RankingModule.test.tsx`, `tests/components/RankingHistoricoModule.test.tsx` |
| R764 | ídem R763 (orden por `compareDocumentPosition`) |
| R765 | `tests/unit/guards/pwa-mensajero-sin-recorte.guardia.test.ts` |

## Archivos esperados

Producción:
- `app/(app)/ranking/_components/RankingModule.tsx`
- `app/(app)/ranking/_components/PremioInputRow.tsx`
- `app/(app)/ranking/_components/RankingPodio.tsx`
- `app/(app)/ranking/_components/ranking-labels.ts`
- `app/(app)/ranking/historico/_components/RankingHistoricoModule.tsx`
- `app/(app)/ranking/historico/_components/ranking-historico-labels.ts`
- `components/shared/texto-entero.ts`
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

`ranking-labels.ts` y `ranking-historico-labels.ts` solo si hace falta un rótulo nuevo (p. ej. el
nombre accesible del desplegar).

## Tamaño

- **Archivos:** 16 (8 de producción, 8 de tests), frente al tope de 40 (80 % = 32). Cabe.
- **Líneas de producción:** ~200-300 (columnas móviles de T6 y T8, maquetación `max-md:` de premios,
  el `BuscadorFiltros` del Histórico, quitar un `truncate` y medios pasos, mover una constante).
  Tope 1000.
- **Líneas de tests:** ~600-850 (dos tests de componente ampliados, dos de descarga, la guardia y un
  E2E nuevo con su siembra). Tope 3000.

## Preguntas abiertas

- **P1 — Canvas no leído.** Los artboards «Ranking» e «Histórico» del canvas de SLT-156
  (https://claude.ai/artifact/SNvPjSLv5BApoQTsVQg9GU) no son accesibles desde el agente. El spec sale
  de la tabla «Datos recomendados» del spec aprobado de SLT-156 (`requirements.md:170-180`) y del
  brief. **Antes de F2, el leader o Carlos comparan R750, R752, R755 y R757 con esos artboards**; si
  difieren, manda el canvas y se corrige este archivo.
- **P2 — `BuscadorFiltros` en Ranking del día.** Hoy no tiene búsqueda ni filtros. Por defecto **no se
  añade** buscador (sería funcionalidad nueva y la descarga y el podio dependen del conjunto entero);
  en el Histórico, el único filtro (la fecha) entra en `BuscadorFiltros` (R757). ¿El artboard
  «Ranking» dibuja un buscador por nombre?
- **P3 — Escala de 4 px en el podio.** `RankingPodio` usa medios pasos (`mb-0.5`, `gap-1.5`, `mt-2.5`,
  `px-1.5`…). Normalizarlos cambia un poco el podio, que SLT-156 dio por bueno («ya es un patrón móvil
  y se reusa», `brief-diseno.md:23-24`). Por defecto **solo se le quita el recorte** (R758); ¿se
  normaliza también su escala?
- **P4 — «Descargar» a 44 px.** No lo pide SLT-165 en «Cierres solicitados» y el botón es de la
  `DataTable` compartida. Por defecto **solo debe caber** (R761), sin cambiar su alto.
- **P5 — Descripción del premio en el Histórico móvil.** Por defecto va al desplegar (R755), para que
  la columna fija del importe no tenga texto libre. Alternativa: debajo del monto, como en escritorio.
- **P6 — «Versión anterior, debajo para comparar».** T6 y T7 están marcadas así en
  `ranking/page.tsx:57` y repiten lo que muestra el podio. Retirarlas no es de esta ficha; queda anotado
  por si Carlos quiere una ficha aparte.
