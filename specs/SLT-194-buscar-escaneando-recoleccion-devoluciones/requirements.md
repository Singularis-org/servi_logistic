# SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» — requirements (ruta ligera)

Zona **fullstack** (era frontend; cambia con DC1, 2026-11-17), complexity low. Rango de requisitos:
**R940-R969** (usados R940-R957).
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
- Respuestas de Carlos a las cuatro preguntas del primer borrador (2026-11-17): `## Decisiones cerradas`.

## Lo que ya existe (evidencia)

Buscado `escaneo`, `BuscadorFiltros`, `devoluci`, `rechaz`, `busquedaTexto`, `SLT-194` en `specs/`,
`progress/`, `feature_list.json` y el código (Grep/Read; no se consultó el grafo).

| Pantalla | Dónde | Estado hoy | Entra |
| --- | --- | --- | --- |
| **Recolección** (`/recoleccion`, mensajero) | `app/(app)/recoleccion/_components/RecoleccionModule.tsx:282-305` | `BuscadorFiltros` «Buscar guías» **sin** `escaneo` (filtro de cliente, `debounceMs={0}`, `tactil`, `fija`, filtro «Tienda» y conmutador de vista). | **Sí** |
| **Devoluciones** (`/novedades`, pestaña «En devolución», adminTienda) | `NovedadesModule.tsx:674` → `NovedadesFiltrosBarra.tsx:69-70` | **Ya tiene** el buscador con `escaneo` (B3 de SLT-160). | **No** (DC2) |
| **Rechazos** (`/novedades`, pestaña «Devolución a origen por plazo vencido») | `NovedadesTabs.tsx:43,88-90` → `RechazosSlaModule.tsx` | **Sin buscador**. Lista de 10 por página por Server Action (`lib/actions/rechazos-sla-tienda.ts`, solo valida `page`) → `RechazosSlaTiendaService.listar` (rol `adminTienda`, tienda = `actor.usuarioId`) → `OrdenRepository.countRechazadasSlaByTienda` / `findRechazadasSlaByTienda`, que comparten `rechazoSlaWhere(tiendaId)` (`OrdenRepository.ts:6036-6089`). | **Sí** (DC1) |

Piezas que se reusan, sin crear otras:
- `BuscadorFiltros` con `escaneo` (Enter, `leerGuia`, selección, cámara aparte de 44 px, ayuda debajo,
  campo de 44 px): `components/shared/BuscadorFiltros.tsx`.
- `EscanerModal` (la cámara del buscador ya monta uno con `soloIcono`); su barra la fija SLT-193.
- **Criterio de búsqueda de servidor de `/ordenes` y la satélite (B1/B2):**
  - `terminoDeBusqueda` (`lib/utils/filtros-listado-ordenes.ts:95`) da el término normalizado y su
    forma solo-dígitos;
  - `OrdenRepository.criterioBusqueda` (`OrdenRepository.ts:1966-1976`, privado y estático de la misma
    clase que `rechazoSlaWhere`) lo convierte en `busquedaTexto contains`, como clave hermana (AND);
  - la columna generada `orden.busqueda_texto` ya tiene su índice de trigramas: no hay migración.
- Validación del término en el borde: `BUSQUEDA_MIN_CHARS` (3) y `BUSQUEDA_MAX_CHARS` (80) de
  `lib/types/orden.ts:130,135`, como el `q` de `/ordenes` (`:243`).
- Textos de «sin coincidencias» de `/novedades`: `SIN_COINCIDENCIAS_TITULO` y `LIMPIAR_BUSQUEDA`
  (`NovedadesModule.tsx:289,292`). Placeholder: `PLACEHOLDER_BUSQUEDA` de `/ordenes`
  (`ordenes-filtros-def.ts:163`), porque enumera lo que indexa esa misma columna.
- `FilterComponent`, `FiltroTienda` y `DescargarDatasetButton`: los de hoy; solo cambia su alto en móvil.
  `FiltroTienda` ya mide 44 px en móvil (`CLASE_SELECT_TIENDA`, `FiltroTienda.tsx:23`): no se toca.

## Alcance

**Dentro:**
1. **Recolección.** Su buscador pasa `escaneo`. Lo leído por pistola o cámara **filtra** las dos listas
   («Por recolectar en tienda» y «Recogidos en tienda hoy»); no recolecta.
2. **Rechazos por plazo vencido.** La pestaña monta el mismo `BuscadorFiltros` con `escaneo`, sin filtros,
   y la búsqueda se hace en servidor con el criterio de B1/B2, dentro del alcance de hoy (rol
   `adminTienda`, su tienda).
3. **Filtros a 44 px en móvil.** En toda barra con `escaneo` (B1-B8, Recolección y Rechazos), los
   controles de `FilterComponent` miden 44 px **solo en móvil** (`max-md:`). En escritorio siguen en 32.
4. **Descarga a 44 px en móvil.** El disparador «Descargar» de `DescargarDatasetButton` mide 44 px solo
   en móvil.

**Fuera:**
- Devoluciones: ya hecho por SLT-160 (B3).
- La barra y el «Cerrar» del diálogo de la cámara: SLT-193.
- Ruta exacta por guía en Rechazos (como B1): se busca por contención, como B3-B8 (puede traer parecidas).
- Descarga de la pestaña de Rechazos: no la tiene hoy y no la pide nadie.
- El selector de columnas que acompaña a «Descargar» (`ColumnasPopover` / `SelectorConDetalle`): la
  respuesta de Carlos nombra solo el botón de descarga.
- «Por recoger» (`RecogerModule.tsx:361`) y los buscadores sin `escaneo`: no cambian.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo |
| --- | --- | --- |
| DC1 | **Rechazos entra.** La pestaña «Devolución a origen por plazo vencido» recibe el MISMO `BuscadorFiltros` con `escaneo`. La búsqueda va en servidor y reutiliza el criterio por guía, remisión y cliente de B1-B8 (mismo patrón y mismo repositorio). No se crea un buscador nuevo. La ficha pasa a fullstack. El `WHERE` se prueba contra Postgres real, y una mutación del `WHERE` lo pone en rojo. Se respeta el alcance por empresa y por rol de hoy. Lo cubren R949-R957. | Carlos, 2026-11-17 |
| DC2 | «Devoluciones» y «Rechazos» son las dos pestañas de `/novedades`. Devoluciones ya está hecha (B3 de SLT-160) y queda fuera. | Carlos, 2026-11-17 |
| DC3 | **Descargar entra.** El botón de descarga va a 44 px **solo en móvil** (`max-md:`). Lo cubre R947. | Carlos, 2026-11-17 |
| DC4 | Los filtros van a 44 px **solo en móvil** (`max-md:`). En escritorio se quedan en `h-8` como hoy. Lo cubren R946 y R948. | Carlos, 2026-11-17 |

## Decisiones (tomadas aquí)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | El 44 px de móvil de los filtros lo da la **barra**: `BuscadorFiltros` con `escaneo` lo comunica a sus `children` por un contexto de React. `FilterComponent`, `MultiSelectFilter` y `DateRangeFilter` lo aplican. Ninguna pantalla pasa una prop nueva. | Una sola fuente («barra con escaneo», D1 de SLT-160). **Descartado:** una prop en cada montaje de `FilterComponent` (8 pantallas), porque se puede olvidar en una. **Descartado:** selectores de descendiente en el contenedor de la barra, porque son frágiles ante el marcado interno de cada control. |
| D2 | En Recolección la cámara del buscador solo **busca**. Recolectar sigue siendo «Escanear o escribir guía» y su diálogo «Recolectar en tienda», sin cambios. | Diseño puntual. Un paquete leído para buscarlo no debe cambiar de estado. |
| D3 | Rechazos: el término viaja como `q` opcional por la acción, el servicio y el repositorio de hoy. `rechazoSlaWhere(tiendaId, termino?)` añade `criterioBusqueda` como clave **hermana** de `tiendaId`, `deletedAt`, `estatus` e `historialEstados`, nunca dentro de un `OR` con ellas. `count` y `find` siguen compartiendo el mismo `where`. Sin `q`, el `where` es idéntico al de hoy. **Descartado:** filtrar en el cliente sobre el conjunto completo, como B3. Esta pestaña no tiene lectura completa (no tiene descarga) y DC1 pide servidor. **Descartado:** un método de repositorio nuevo, porque duplicaría el predicado SLA. | El mismo criterio de B1/B2 (`terminoDeBusqueda` + `criterioBusqueda`) y el mismo repositorio, como pide DC1. El AND garantiza que el término nunca ensancha el alcance por tienda. |
| D4 | Rechazos: `leerDeUrl={false}` y sin selector de filtros. La pestaña arranca con la página 1 precargada sin término, como hoy. | La precarga del servidor (`novedades/page.tsx`) no lee `q`. Leerlo de la URL mostraría un término que no se aplicó. |
| D5 | «Descargar» a 44 px en móvil en **todos** sus usos: se cambia una vez en `DescargarDatasetButton`. | Un componente, un alto. Acotarlo a los listados con `escaneo` exigiría que `DataTable` supiera de su barra. |

## Requisitos (EARS)

### Recolección

- **R940** — El buscador «Buscar guías» de `/recoleccion` DEBE ser el `BuscadorFiltros` con `escaneo`:
  botón «Escanear con cámara» de 44 px junto al campo y fuera de él, campo de 44 px de alto y debajo el
  texto de ayuda de R770 como descripción accesible del campo. Su nombre accesible, su placeholder, el
  filtro «Tienda», el conmutador de vista y la barra fija NO DEBEN cambiar.
  - *Test:* `tests/components/RecoleccionModule.test.tsx`; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` (Recolección en la lista con `escaneo`).
- **R941** — CUANDO se pulsa Enter en el buscador de Recolección con una guía (dígitos, URL
  `/paquete/<n>` o `#<n>`), el campo DEBE quedar con el número, las dos listas DEBEN mostrar solo las
  órdenes que casan con ese número y el texto DEBE quedar seleccionado.
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — con `91024` y `95555` en «Por recolectar» y otra `91024` en «Recogidos hoy», `https://app.ejemplo.test/paquete/91024` + Enter: el campo vale `91024`, sale `91024` en cada lista y no `95555`.
- **R942** — CUANDO la cámara del buscador de Recolección lee una guía, el sistema DEBE cerrar el visor,
  poner el número en el buscador y filtrar las dos listas, y NO DEBE recolectar la orden (D2).
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — doble de `html5-qrcode` con `decodedText = "91024"`: diálogo cerrado, campo `91024`, el doble de la acción de recolectar sin llamadas.
- **R943** — La pantalla de Recolección DEBE ofrecer dos accesos distintos: «Escanear o escribir guía»
  (recolectar, diálogo «Recolectar en tienda») y «Escanear con cámara» (buscar). CUANDO se pulsa
  «Escanear con cámara», NO DEBE abrirse el diálogo «Recolectar en tienda».
  - *Test:* `tests/components/RecoleccionModule.test.tsx`.
- **R944** — MIENTRAS el mensajero está bloqueado por cierre pendiente, el buscador de Recolección DEBE
  seguir visible con su botón de cámara (solo filtra).
  - *Test:* `tests/components/RecoleccionModule.test.tsx` — con `bloqueo`: sin «Escanear o escribir guía», con «Escanear con cámara» y «Buscar guías».
- **R945** — CUANDO la pantalla de Recolección mide 360 px de ancho, la barra con la cámara NO DEBE
  desbordar en horizontal y el botón «Escanear con cámara» DEBE medir al menos 44 × 44 px.
  - *E2E:* `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` — `scrollWidth <= clientWidth` y `boundingBox` ≥ 44 × 44.

### Filtros y descarga a 44 px en móvil

- **R946** — MIENTRAS la pantalla es móvil (`max-md`), en una barra con `escaneo` los controles de filtro
  montados con `FilterComponent` (texto, selección múltiple, selección única, casilla, pastillas y rango
  de fechas) DEBEN medir 44 px de alto. En escritorio DEBEN seguir midiendo 32 px (DC4, D1).
  - *Test:* `tests/unit/components/filtros-barra-escaneo.test.tsx` (nuevo) — `BuscadorFiltros escaneo` con un `FilterComponent` de cada tipo: cada disparador o caja lleva `max-md:h-11` y conserva `h-8`. Los tests de B6-B8 que afirman `h-8` (`EstadoCuentaBarra467`, `WalletCajaBarra467`, `MiWalletFiltros`) sin tocar y en verde.
- **R947** — MIENTRAS la pantalla es móvil, el disparador «Descargar» de `DescargarDatasetButton` DEBE
  medir 44 px de alto en todos sus usos. En escritorio NO DEBE cambiar (DC3, D5).
  - *Test:* `tests/components/DescargarDataset.test.tsx` — el botón lleva `max-md:h-11` y ninguna clase de alto sin prefijo nueva.
- **R948** — Los controles de filtro fuera de una barra con `escaneo` NO DEBEN cambiar de alto en ningún
  ancho: `FilterComponent` suelto o en barras sin `escaneo` (p. ej. `/cierres-admin`, usuarios, Entregas).
  - *Test:* `tests/unit/components/filtros-barra-escaneo.test.tsx` — el mismo `FilterComponent` dentro de `BuscadorFiltros` sin `escaneo` y suelto no lleva `max-md:h-11`. `tests/unit/components/filter-component.test.tsx` sin tocar y en verde.

### Rechazos por plazo vencido

- **R949** — La pestaña «Devolución a origen por plazo vencido» DEBE mostrar sobre la lista el
  `BuscadorFiltros` con `escaneo` (cámara, ayuda de R770, campo de 44 px), sin selector de filtros. Su
  nombre accesible DEBE ser «Buscar entre las órdenes con devolución a origen por plazo vencido», con
  el placeholder de `/ordenes` y un mínimo de `BUSQUEDA_MIN_CHARS`.
  - *Test:* `tests/components/RechazosSlaModule.test.tsx` — `getByRole("searchbox", { name: … })` con el literal, el placeholder literal «Guía, remisión, teléfono, destinatario o producto» y «Escanear con cámara»; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` — `RechazosSlaModule.tsx` en la lista.
- **R950** — CUANDO el buscador de Rechazos emite un término (tecleo tras el debounce, Enter o cámara),
  la pestaña DEBE pedir al servidor la página 1 de los rechazos que casan con ese término y mostrar esa
  página con su total.
  - *Test:* `tests/components/RechazosSlaModule.test.tsx` — escribir `91024` + Enter: el doble de `listarRechazosSlaTiendaAction` recibe `{ page: 1, q: "91024" }` y la lista muestra lo que devuelve.
- **R951** — CUANDO se cambia de página con un término puesto, la petición DEBE llevar ese mismo término;
  CUANDO el buscador se vacía, la pestaña DEBE volver a la página 1 sin término.
  - *Test:* `tests/components/RechazosSlaModule.test.tsx` — con `q` puesto, «Siguiente» pide `{ page: 2, q: "91024" }`; la «X» pide `{ page: 1 }` sin `q`.
- **R952** — SI con un término no casa ningún rechazo, ENTONCES la pestaña DEBE mostrar «Ninguna orden
  coincide con lo que buscaste» con el buscador visible y un «Limpiar la búsqueda» que lo vacía. SI sin
  término no hay rechazos, ENTONCES DEBE mostrar el vacío de hoy, sin barra.
  - *Test:* `tests/components/RechazosSlaModule.test.tsx` — los dos casos, con los literales.
- **R953** — CUANDO la acción recibe `q`, el servidor DEBE devolver solo los rechazos por plazo vencido
  cuya columna de búsqueda contiene el término, en su forma normalizada o en su forma solo-dígitos (el
  criterio de `/ordenes`). El total y la página DEBEN salir del mismo filtro.
  - *Test:* `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` (nuevo, `HAY_BASE_DE_DATOS`) — dos rechazos SLA de la misma tienda con guías `91024` y `95555`: `q="91024"` → total 1 y página con `91024`; por remisión y por destinatario fijados por el test → la orden correcta. Se mata con una mutación (quitar `criterioBusqueda` de `rechazoSlaWhere`) antes de darlo por bueno.
- **R954** — SI una orden casa con el término pero es de otra tienda, de otra empresa, está borrada, no
  está en `rechazada` o es un rechazo sin la transición del cron SLA, ENTONCES NO DEBE aparecer ni contar
  en el total.
  - *Test:* `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` — una orden `91024` en cada uno de esos casos: con `q="91024"` solo sale la de la tienda del actor. Se mata con una mutación (el término en un `OR` con `tiendaId`) antes de darlo por bueno.
- **R955** — La acción DEBE validar `q` como el `q` de `/ordenes`: recortado, entre `BUSQUEDA_MIN_CHARS`
  y `BUSQUEDA_MAX_CHARS` caracteres y opcional. SI no cumple, ENTONCES DEBE devolver `validation_error`
  sin llamar al servicio.
  - *Test:* `tests/unit/actions/rechazos-sla-tienda-action.test.ts` (nuevo) — `q="ab"` y `q` de 81 caracteres → `validation_error` y el doble del servicio sin llamadas; `q=" 91024 "` → el servicio recibe el término recortado.
- **R956** — CUANDO un actor que no es `adminTienda` pide la lista con término, el servicio DEBE devolver
  `forbidden` sin leer el repositorio. CUANDO lo pide un `adminTienda`, DEBE pasar el mismo término a la
  cuenta y a la página, acotadas a `actor.usuarioId`.
  - *Test:* `tests/unit/services/rechazos-sla-tienda-service.test.ts` — doble del repositorio: `count` y `find` reciben el mismo `tiendaId` y el mismo término (`terminoDeBusqueda`); con otro rol, cero llamadas.
- **R957** — MIENTRAS no haya término, la lectura de Rechazos DEBE ser la de hoy: mismo `where`, misma
  página 1 precargada por el servidor y ninguna petición nueva al entrar.
  - *Test:* `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` — sin `q`, salen los dos rechazos de la tienda; `tests/components/RechazosSlaModule.test.tsx` — al montar, el doble de la acción sin llamadas; los tests existentes (`rechazos-sla-tienda-service.test.ts`, `orden-repository.rechazos-sla.test.ts`, `NovedadesTabs.test.tsx`, `NovedadesPage.test.tsx`) en verde.

## Trazabilidad (R → test)

Literales a mano; en los negativos, guías imposibles por casualidad (`91024`, `95555`). El `WHERE` de
Rechazos se prueba contra Postgres real: un test de servicio con dobles no ve el SQL.

| R | Test |
| --- | --- |
| R940 | `tests/components/RecoleccionModule.test.tsx`; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` |
| R941 | `tests/components/RecoleccionModule.test.tsx` |
| R942 | `tests/components/RecoleccionModule.test.tsx` |
| R943 | `tests/components/RecoleccionModule.test.tsx` |
| R944 | `tests/components/RecoleccionModule.test.tsx` |
| R945 | `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` |
| R946 | `tests/unit/components/filtros-barra-escaneo.test.tsx` |
| R947 | `tests/components/DescargarDataset.test.tsx` |
| R948 | `tests/unit/components/filtros-barra-escaneo.test.tsx`; `tests/unit/components/filter-component.test.tsx` (sin tocar) |
| R949 | `tests/components/RechazosSlaModule.test.tsx`; `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` |
| R950 | `tests/components/RechazosSlaModule.test.tsx` |
| R951 | `tests/components/RechazosSlaModule.test.tsx` |
| R952 | `tests/components/RechazosSlaModule.test.tsx` |
| R953 | `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` |
| R954 | `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` |
| R955 | `tests/unit/actions/rechazos-sla-tienda-action.test.ts` |
| R956 | `tests/unit/services/rechazos-sla-tienda-service.test.ts` |
| R957 | `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts`; `tests/components/RechazosSlaModule.test.tsx` |

## Tasks

Requisito previo: SLT-193 mergeado en `dev` y traído a esta rama antes de T1 (comparte
`BuscadorFiltros.tsx`).

- [ ] **T1 — Alto en móvil desde la barra (D1).** `BuscadorFiltros` con `escaneo` provee el contexto; `FilterComponent`
  (texto, casilla, pastillas, `Select` vía `className`), `MultiSelectFilter` y `DateRangeFilter` añaden
  `max-md:h-11`. Sin barra con `escaneo`, el valor por defecto deja todo como hoy. No se tocan
  `components/ui/*`. *Hecho:* R946 y R948 en verde.
- [ ] **T2 [P] — Descarga (D5).** `DescargarDatasetButton`: `max-md:h-11` en el disparador. *Hecho:* R947
  en verde; los tests de descarga existentes en verde.
- [ ] **T3 [P] — Recolección.** `RecoleccionModule` pasa `escaneo`; la guardia incluye Recolección.
  *Hecho:* R940-R944 en verde; los tests existentes de `RecoleccionModule` en verde.
- [ ] **T4 [P] — Rechazos, servidor (backend_dev).** Lo de D3:
  - `q` opcional en el esquema de la acción;
  - `ListarRechazosSlaTiendaInput.busqueda?: TerminoBusqueda`, construido con `terminoDeBusqueda`;
  - `countRechazadasSlaByTienda` / `findRechazadasSlaByTienda` con el término opcional, en
    `IOrdenRepository` y `OrdenRepository`;
  - `rechazoSlaWhere` con `...OrdenRepository.criterioBusqueda(...)` como clave hermana.

  *Hecho:* R953-R957 en verde contra Postgres real, con las dos mutaciones muertas y anotadas en `progress/`. `orden-repository.rechazos-sla.test.ts` y los dobles del repositorio de otros tests, sin tocar y en verde.
- [ ] **T5 — Rechazos, pantalla (depende de T4).** `RechazosSlaModule` monta el buscador (D4), guarda el
  término, lo pasa en cada petición de página y pinta el «sin coincidencias». La guardia incluye
  `RechazosSlaModule.tsx`. *Hecho:* R949-R952 y la parte de cliente de R957 en verde.
- [ ] **T6 — E2E.** R945 en `e2e/pwa-mensajero-recoger-recoleccion.spec.ts` a 360 px. Además, los E2E de
  `/novedades` y de las pantallas B1-B8 (`grep -rl` en `e2e/`), en local con base desechable
  (`docs/perfil-agentes.md > Todos los agentes`). *Hecho:* todo en verde, sin reintentos.
- [ ] **T7 — Dispositivo.** En Preview y con el teléfono:
  - en `/recoleccion`, leer una etiqueta con la cámara del buscador: filtra y no recolecta;
  - en la pestaña de Rechazos, leer una guía: la encuentra.

  Nota en `progress/features/SLT-194.md`. *Hecho:* nota escrita.
- [ ] **T8 — Cierre.** `./init.sh` en verde. *Hecho:* gate en verde.

## Tamaño

- Archivos: **23** (13 de producción, 10 de tests); tope 40, 80 % = 32. Cabe.
- Producción: ~220 líneas.
  - Contexto y tres controles de filtro: ~50.
  - Descarga: ~3.
  - `BuscadorFiltros`: ~10.
  - Recolección: ~5.
  - `RechazosSlaModule`: ~70.
  - Acción, servicio, interfaces y repositorio: ~80.
- Tests: ~800 líneas.
  - Integración SQL: ~250.
  - `RechazosSlaModule`: ~160.
  - Filtros: ~130.
  - Recolección: ~110.
  - Acción y servicio: ~100.
  - Guardia, descarga y E2E: ~50.

## Archivos esperados

Marcados **[SLT-193]** los que también toca SLT-193 «Botones de 44 px pendientes en la PWA del mensajero».

Producción:
- `components/shared/BuscadorFiltros.tsx` **[SLT-193]**
- `components/shared/alto-controles-barra.ts` (nuevo: el contexto de D1)
- `components/shared/FilterComponent.tsx`
- `components/shared/MultiSelectFilter.tsx`
- `components/shared/DateRangeFilter.tsx`
- `components/shared/DescargarDatasetButton.tsx`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`
- `app/(app)/novedades/_components/RechazosSlaModule.tsx`
- `lib/actions/rechazos-sla-tienda.ts`
- `lib/interfaces/services/IRechazosSlaTiendaService.ts`
- `lib/services/RechazosSlaTiendaService.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`

Tests:
- `tests/unit/components/filtros-barra-escaneo.test.tsx` (nuevo)
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/DescargarDataset.test.tsx`
- `tests/components/RechazosSlaModule.test.tsx`
- `tests/unit/services/rechazos-sla-tienda-service.test.ts`
- `tests/unit/actions/rechazos-sla-tienda-action.test.ts` (nuevo)
- `tests/integration/db/rechazos-sla-busqueda-sql-real.test.ts` (nuevo)
- `tests/unit/components/filter-component.test.tsx` (solo si falla por el contexto; se espera sin tocar)
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`

## Preguntas abiertas

Ninguna. Las cuatro del primer borrador las respondió Carlos el 2026-11-17 (DC1-DC4).
