# SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — requirements

> Estado: **spec completo** (2026-11-14), escrito sobre el diseño aprobado por Carlos (canvas
> https://claude.ai/artifact/SNvPjSLv5BApoQTsVQg9GU, `progress/features/SLT-156.md > Decisiones`).
> Inventario y diagnóstico de abajo: los escribió el leader antes de `/design` y se conservan como
> contexto. Lo nuevo: `## Decisiones cerradas (no reabrir)`, `## Requisitos (EARS)` (R490-R544),
> `## Partir una feature` y `## Preguntas abiertas`. Diseño: `design.md`; tareas: `tasks.md`.
> **No cabe en un PR**: el corte en rebanadas está en `## Partir una feature`.
> Pedido de Carlos: «Tenemos una deuda con la PWA, especialmente en el apartado de las tablas;
> debemos mejorar la PWA, especialmente para los mensajeros.»
> Leído desde el worktree `SLT-156-pwa-mensajero-tablas` (origin/dev). Las cifras de ancho son
> **estimaciones a partir de las clases**, no mediciones: hay que medirlas (ver «Cómo verificar»).

## Alcance

- **Dentro:** las pantallas que ve el rol `mensajero` en su menú y, en ellas, cada tabla o
  listado; el objetivo es que se lean y se operen en un teléfono de 360-414 px de ancho, sin
  scroll horizontal y con controles tocables.
- **Fuera (propuesto):** las mismas tablas vistas por otros roles en escritorio (no deben
  cambiar), el flujo de gestión de una orden (`GestionarOrdenPanel`, ya `max-w-md`), el mapa,
  el chat, el manifiesto, los iconos y el service worker (funcionan; no son el problema que pide
  Carlos), y las páginas de `/ayuda` (documentación, sin tablas).
- **Alcance tras el diseño aprobado (2026-11-14, manda sobre la línea anterior):** entran las
  pantallas Reparto, Recoger en bodega, Recolección y Cierre del día (incluido el detalle de «Ver»),
  los botones flotantes (reportar problema y chat: solo su tamaño al desplazar), el **mapa de ruta**
  (rediseñado, decisión de Carlos) y, del flujo de gestión, **solo** el modo foco y la
  verificación de la guía («Confirmar guía»). En escritorio (≥ 768 px) las tablas conservan sus
  columnas; lo único que cambia ahí es que ningún dato se recorta (quita el «…»/`title` de SLT-152
  «Tablas de cierres legibles», que afecta también a bodega y central).
- **Sigue fuera:** el contenido del chat, el manifiesto, los iconos, el service worker, `/ayuda`,
  **Ranking** (no aparece en el diseño aprobado; ver `## Preguntas abiertas`, P1) y el **voseo**
  fuera de cierres (D70 del proyecto: decisión aparte, no se corrige en esta ficha).
- Ficha relacionada, ya cerrada: SLT-152 «Tablas de cierres legibles» (columnas separadas en
  `FilaGestion`). No la reabre: SLT-152 resolvió el texto montado en escritorio, no el móvil.

## Inventario

### Menú del mensajero (`lib/auth/menu-visibility.ts`)

| Ítem | Ruta | Fuente |
|---|---|---|
| Entregas › Reparto | `/mis-asignaciones/reparto` (`/mis-asignaciones` redirige aquí, `app/(app)/mis-asignaciones/page.tsx:15`) | `menu-visibility.ts:442-449` |
| Entregas › Recoger en bodega | `/mis-asignaciones/recoger` | `menu-visibility.ts:448` |
| Recolección (en tienda) | `/recoleccion` | `menu-visibility.ts:457-460` |
| Ranking › Ranking del día | `/ranking` | `menu-visibility.ts:520-528` |
| Ranking › Histórico | `/ranking/historico` | `menu-visibility.ts:527`; gate `app/(app)/ranking/historico/page.tsx:56` |
| Cierre del día | `/cierre-dia` | `menu-visibility.ts:627-631` |
| Ayuda | `/ayuda` | final del array (documentación, sin tablas) |

No son del mensajero, aunque el pedido los nombraba:
- **`/mi-wallet`** es solo del `adminTienda` (`ROLES_MI_WALLET`, `menu-visibility.ts:280` y `:575-578`).
- **Notificaciones:** no hay pantalla; son push del service worker (`public/sw.js:178`, `:204`) y
  `PushReactivacion` en `app/(app)/layout.tsx:201`.
- **Perfil:** no hay pantalla de perfil; el pie del `Sidebar` (`app/(app)/_components/Sidebar.tsx`)
  y el botón de reporte de bugs (`layout.tsx:228`) son lo único.

**Total: 6 pantallas operativas + Ayuda.**

### Tablas y listados por pantalla

| # | Pantalla | Listado | Componente | Columnas / datos | Vista móvil | Filtros / búsqueda / descarga | Acciones por fila |
|---|---|---|---|---|---|---|---|
| L1 | Reparto | Órdenes por gestionar | `RepartoModule.tsx:870-897` → `PosOrderCardMosaico` (en `CarruselCards`) o `PosOrderCardDetalle` (lista `<ul>`) | Card POS: navegar, remisión, destinatario, intentos, monto, estado | **Sí (cards)** | Buscador (guía, remisión, teléfono, nombre) `:831-847` + conmutador mosaico/detalle `VistaCardsToggle` `:850`; filtro cantón/distrito (`FiltroCantonDistrito`) | «Gestionar más tarde» (`MarcarLuegoToggle`, `size="sm"`), «Gestionar» (`GestionarOrdenCardButton`, `size="sm"`) `:528-560` |
| L2 | Reparto | Con ayuda solicitada | `RepartoModule.tsx:899+`, misma card (`mostrarRuta={false}`, `:615`) | Igual que L1 | **Sí (cards)** | — | «Recuperar» (`RecuperarAyudaButton`, `sm`) y «Ver hilo» (`size="sm"`) `:616-640` |
| L3 | Recoger en bodega | Por recoger | `RecogerModule.tsx:245-268` (carrusel o `<ul>` de cards POS) + `RecogerPaqueteCard` `:306` | Card POS | **Sí (cards)** | `VistaCardsToggle` `:340`; escáner | Recoger por escáner o a mano |
| L4 | Recolección | Por recolectar | `RecoleccionModule.tsx:284-298` (carrusel o `<ul>`) | Card POS | **Sí (cards)** | `VistaCardsToggle` `:222`; `EscanerModal` `:248` | Contacto (`ContactoButtons`), recolectar |
| L5 | Recolección | Recolectadas hoy | `RecolectadasHoyLista.tsx:156` | Card POS (detalle) | **Sí (cards)** | — | — |
| T1 | Cierre del día | Gestiones del cierre (pestaña «Gestiones») | `GestionesCierre.tsx:74-131` + `FilaGestion.tsx:207-247` (rejilla CSS, no `DataTable`); montado en `CierreDiaModule.tsx:477` | Guía, Destinatario, Tienda, Resultado, Recibido, Ganancia, Señales + columna de acciones (`fila-gestion-vista.ts:186-193`) = **8 pistas** | **No** | Pastillas «Filtrar por resultado» (`GestionesCierre.tsx:77-92`); «Descargar» (`CierreDiaModule.tsx:486-493`) | «Devolver a gestión» (`size="sm"`, `FilaGestion.tsx:220-234`), desplegar detalle (`size-8`, `:236-245`); en el detalle «Ver cálculo» (texto 13 px, `:178-186`) |
| T2 | Cierre del día | Rechazados por la tienda | `RechazosDeTiendaCierre.tsx:27-71` (rejilla) | Guía, Destinatario, Motivo, Tienda, Fecha = **5 pistas** (`80px` fijo) | **No** | — | — |
| T3 | Cierre del día | Órdenes sin gestión | `SeccionSinGestion`, `app/(app)/cierres-admin/_components/cierre-factura.tsx:2483-2540` (`SIN_GESTION_GRID_COLS`, `:1478`) | Guía, Destinatario, Tienda = 3 pistas | Parcial (cabe, recorta) | — | — |
| T4 | Cierre del día | Órdenes en corrección | `CorregirCierre.tsx:43-63` (`<ul>` con `flex-wrap`) | Guía, remisión, destinatario, estado | **Sí (lista que envuelve)** | — | «Ir a Entregas» (`size: "sm"`) |
| T5 | Cierre del día | Cierres solicitados (histórico propio) | `ColaCierres.tsx:240-249` (`DataTable`) con `columnasTablaPropia` (`TablaColaPropia.tsx:82-90`; `cola-propia-vista.ts:65-75`), montado en `CierreDiaModule.tsx:597-631` | Folio, Solicitado, Destino, Estado, Recaudado, Ganancia, Pago, Acciones = **8 columnas** | **No** | Buscador + filtros (`FiltrosColaPropiaBarra.tsx:103-116`) y «Descargar» (`ColaCierres.tsx:284-287`); tarjetas de ganancia (`:304-306`); `Pagination` con primero/último y tamaño de página (`CierreDiaModule.tsx:612-626`) | «Ver» (`size="sm"`, `TablaColaPropia.tsx:61-76`) |
| T6 | Ranking del día | Ranking | `RankingModule.tsx:103-128` (`DataTable`); columnas `:33-56` | Posición, Mensajero, % del día, «Entregados / asignados» = 4 | **No** | «Descargar» (`:123-127`) | — |
| T7 | Ranking del día | Premios del podio | `RankingModule.tsx:138-177` (`<table>` HTML cruda) + `PremioInputRow` | Posición, Mensajero, Monto del premio, Descripción = 4 (el mensajero no edita) | **No** | — | — (solo lectura para el mensajero) |
| T8 | Ranking › Histórico | Ranking congelado de un día | `RankingHistoricoModule.tsx:161-190` (`DataTable`); columnas `:61-95` | Puesto, Posición, Mensajero, %, Entregadas, Asignadas, Premio = **7** | **No** | Selector de fecha (`<Input type="date">`, `:138-148`) y «Descargar» (`:184`) | — |

**Total: 13 listados; 6 ya tienen vista móvil (L1-L5 con cards POS y T4 con lista que envuelve),
1 cabe a medias (T3) y 6 son tablas sin vista móvil (T1, T2, T5, T6, T7, T8).** Las tablas están
todas en **Cierre del día** y **Ranking**; el portal de reparto/recogida/recolección ya es de cards.

### PWA

- Manifiesto `public/manifest.json`: `display: standalone`, `orientation: portrait-primary`,
  `start_url: "/"`, 4 iconos (2 `maskable`), 3 capturas (2 `narrow` 540×1170, 1 `wide`). Sin `shortcuts`.
- Service worker `public/sw.js`: autodestrucción en `localhost` (`:41-58`), interruptor
  `RESCATE_FORZOSO` (`:39`), precache de páginas (`:231-235`), `fetch` con respaldo
  `/offline.html` (`:326-349`), `push` y `notificationclick` (`:178`, `:204`).
- `scripts/generate-pwa-icons.mjs`: genera los iconos.
- `scripts/capturas-pwa.mjs`: genera las capturas del diálogo de instalación. Solo captura `/` y
  `/login` (`PANTALLA_POR_CAPTURA`, `:45-49`), sin sesión; espera la app servida en `CAPTURAS_URL`
  (por defecto `http://localhost:3000`) y se corre con `node scripts/capturas-pwa.mjs`. **No sirve
  para verificar esta ficha**: no entra con un mensajero ni visita sus pantallas.
- Guardias que tocan la PWA: `tests/unit/pwa/manifest.test.ts`, `tests/unit/pwa/capturas-pwa.test.ts`,
  `tests/unit/guards/pwa-*.guardia.test.ts`, `marca-pwa-capturas-iconos.guardia.test.ts`.

### Patrón móvil que ya existe y se puede reusar

1. **Card POS del mensajero** — `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
   (una fila por orden: acción grande a la izquierda, identificación al centro, monto a la derecha)
   y `PosOrderCardMosaico.tsx`, con `VistaCardsToggle.tsx` y `components/shared/CarruselCards`. Ya la
   comparten Reparto, Recoger y Recolección: es el lenguaje que el mensajero ya conoce.
2. **Columnas alternativas en móvil sobre la MISMA `DataTable`** —
   `app/(app)/wallet/_components/DetalleFilaComposicion.tsx:203-253`: con `useIsMobile()`
   (`hooks/use-mobile.ts`, corte `max-width: 767px`) pasa de 4 columnas a 2 (texto apilado con
   `wrap-anywhere` + importe a la derecha). Desborde 0 medido. Conserva una sola instancia de
   `DataTable` (lo exige el censo `tests/unit/descarga/censo-tablas.ts`).
3. **Detalle desplegable de `DataTable`** (`renderExpanded`, `components/shared/DataTable.tsx:248`) y
   el detalle de `FilaGestion` (`FilaGestion.tsx:249-260`), que ya es responsivo (`grid-cols-1`
   y `sm:grid-cols-2`).
4. **Precedente de E2E en móvil**: `e2e/cierre-dia.spec.ts:179-200` (`setViewportSize` 375×667).

No hay un modo «tarjetas» genérico dentro de `DataTable`: por debajo de `sm` solo hay scroll
horizontal sin flechas (`DataTable.tsx:748`).

## Diagnóstico

Ancho útil de contenido a 360 px: 360 − `p-6` del `Container` (`components/shared/Container.tsx:18`)
= **312 px** (366 px a 414). Tamaños de botón (`components/ui/button.tsx:108-118`): `xs` 24 px, `sm` 28 px,
`default` 32 px, `icon` 32 px, `lg`/`icon-lg` 36 px: **ninguna variante llega a 44 px**.

| # | Qué falla a 360-414 px (estimado por código) |
|---|---|
| T1 Gestiones | No hay scroll: la rejilla se **aplasta**. Pistas con mínimo: guía ≥ 70 px (`GUIA_CELDA`), resultado ≥ 110 px, acciones `auto` (32 px del chevron + ~130 px de «Devolver a gestión» cuando aparece) + 7 huecos de 8 px + 32 px de relleno ⇒ ~300-430 px antes de pintar destinatario, tienda, recibido, ganancia y señales. Destinatario y tienda quedan en «…» (el texto entero solo en `title`, que en táctil no se ve); los importes (`<span>` sin recorte, `FilaGestion.tsx:154`) **se montan sobre la columna vecina** (el mismo fallo que SLT-152 arregló en escritorio). Chevron de 32 px y «Devolver» de 28 px < 44 px. «Ver cálculo» es texto de 13 px sin área táctil. |
| T2 Rechazados | 5 pistas con `80px` fijo y fecha `whitespace-nowrap`: destinatario y tienda se recortan a pocos caracteres; el motivo (sin recorte) envuelve en varias líneas. Legible a duras penas, sin acciones. |
| T3 Sin gestión | 3 pistas: cabe; destinatario y tienda se recortan. Menor. |
| T5 Cierres solicitados | `DataTable` de 8 columnas con `px-3`: ancho mínimo estimado ~750-850 px ⇒ **scroll horizontal de ~2,5 pantallas**; las flechas de scroll no existen por debajo de 640 px (`DataTable.tsx:748`), así que el desborde solo se descubre arrastrando. «Ver», la única acción, queda **fuera de la vista a la derecha** y mide 28 px. La barra de filtros (buscador `min-w-[250px]`, disparador `min-w-56`) y «Descargar» se apilan (`ColaCierres.tsx:284-287`): caben, pero empujan la tabla hacia abajo junto a las tarjetas de ganancia y la paginación con primero/último + selector de tamaño. |
| T6 Ranking | 4 columnas; la cabecera «Entregados / asignados» es la más ancha. Probablemente cabe o desborda poco (a medir). Es la tabla menos grave. |
| T7 Premios | `<table>` cruda con `overflow-x-auto` y «Descripción» de texto libre: scroll horizontal sin flechas ni pista visual. |
| T8 Histórico | `DataTable` de 7 columnas ⇒ scroll horizontal; «Puesto» y «Posición» son dos columnas casi iguales a ojos del mensajero; selector de fecha y «Descargar» encima. |
| Cierre del día (marco) | Las pestañas del detalle (`DetalleCierre.tsx:315-328`, `gap-6`, sin `overflow-x` ni `flex-wrap`) pueden no caber a 360 px con «Gestiones (n)» + «Rechazados por la tienda (n)» + «Corregir». A medir. |
| L1-L5 (cards) | No tienen problema de tabla. Sí de tamaño táctil: «Gestionar», «Gestionar más tarde», «Recuperar», «Ver hilo» son `sm` (28 px) y «Mostrar mapa» es `xs` (24 px, `RepartoModule.tsx:774-782`). |

Riesgos de diseño que salen del código:
- **Censo de tablas** (`tests/unit/descarga/censo-tablas.ts`): cuenta instancias de `<DataTable>` por
  archivo y obliga a decidir la descarga. Una vista de tarjetas que sea un componente distinto
  sin `DataTable` cambia el censo; dos instancias (una móvil, otra escritorio) lo rompen. El
  precedente de la wallet evita esto con una sola instancia y dos juegos de columnas.
- **Los E2E corren en `Desktop Chrome`** (`playwright.config.ts:77-129`): hoy nada en CI mira 360 px
  salvo el caso (d) de `cierre-dia.spec.ts`.
- `T1` lo comparten mensajero, bodega y central (`audiencia`): cambiar `FilaGestion` toca
  `/cierres-admin` y la satélite. La vista móvil debe ir condicionada al ancho, no a la audiencia.

### Cómo verificar (después, no ahora)

`scripts/capturas-pwa.mjs` no cubre estas pantallas. La verificación propuesta es un E2E por
pantalla con `page.setViewportSize({ width: 360, height: 780 })` (y 414), como el caso (d) de
`e2e/cierre-dia.spec.ts`, que afirme: `document.documentElement.scrollWidth <= 360`, la tabla sin
desborde (`scrollWidth <= clientWidth` del contenedor), y la caja de cada acción ≥ 44×44 px.

## Propuesta de patrón

**Una sola regla para toda la PWA del mensajero: por debajo de 768 px, cada fila se pinta como la
tarjeta del portal (la fila POS de `PosOrderCardDetalle`): 2-3 datos clave en la tarjeta, la acción
principal en el pie con un área de 44 px, y el resto del detalle al tocar (desplegable en la propia
tarjeta). En escritorio, la tabla de hoy sin cambios.**

Cómo, reusando lo que hay:
- Para las `DataTable` (T5, T6, T8): una sola instancia, columnas alternativas en móvil con
  `useIsMobile` (precedente `DetalleFilaComposicion`), con una columna «tarjeta» que apila los datos
  y el desglose por `renderExpanded`. Así el censo y la descarga no cambian. Alternativa a decidir en
  `/design`: un modo `vista="tarjetas"` dentro de `DataTable` para no repetir la columna apilada en
  cada consumidor.
- Para las rejillas (T1, T2, T3): en móvil, la fila pasa de rejilla a tarjeta; el detalle desplegable
  de `FilaGestion` ya es responsivo y se reusa tal cual.
- Para T7: lista de 3 renglones (uno por puesto del podio), no tabla.
- Botones de las tarjetas: una variante táctil ≥ 44 px solo en móvil (hoy no existe en `button.tsx`).
- Filtros, búsqueda y descarga: se quedan arriba de la lista; en móvil, plegados tras un botón
  «Filtros» si el `/design` lo pide (hoy `BuscadorFiltros` ya los apila).

Datos recomendados en la tarjeta (el resto, al tocar):

| Pantalla / listado | Línea 1 | Línea 2 | Derecha / pie | Al tocar |
|---|---|---|---|---|
| T1 Gestiones del cierre | Destinatario | Guía · tienda | Resultado (chip) + **Ganancia**; «Devolver a gestión» si aplica | Recibido, señales, orden, producto, dirección, cálculo, evidencia |
| T2 Rechazados por la tienda | Destinatario | Guía · tienda | Fecha | Motivo |
| T3 Sin gestión | Destinatario | Guía · tienda | — | — |
| T5 Cierres solicitados | Fecha solicitado + estado (chip) | Destino | **Ganancia** + «Ver» | Folio, recaudado, pago |
| T6 Ranking del día | Posición + mensajero | Entregados / asignados | **% del día** | — |
| T7 Premios | Posición + mensajero | Descripción | Monto | — |
| T8 Histórico | Puesto + mensajero | Entregadas / asignadas | **%** + premio | Posición |
| L1-L5 (cards POS) | Sin cambio de contenido | — | Solo subir los botones a ≥ 44 px | — |

## Decisiones cerradas (no reabrir)

Copiadas de `progress/features/SLT-156.md > Decisiones` (Carlos, 2026-11-13/14, diseño aprobado
sobre el canvas). Cada fila con los requisitos que la cubren.

| # | Decisión | Requisitos |
|---|---|---|
| DC1 | Las tablas pasan a tarjetas por **ancho** de pantalla (< 768 px), para cualquier rol, no por rol. | R523, R524, R528, R529, R535 |
| DC2 | En la tarjeta de «Gestiones del cierre» el dato principal es la **Ganancia**. | R523 |
| DC3 | Todos los botones de las tarjetas del mensajero (Reparto, Recoger, Recolección y las nuevas) miden ≥ 44 px. | R493 |
| DC4 | Reparto: KPI en 2×2. | R502 |
| DC5 | Buscador y filtros fijos arriba (la «barra fija con Filtros»). | R496, R503, R518, R519, R527 |
| DC6 | Carrusel (Mosaico) por defecto; lista (Detalle) compacta. | R507, R508, R517 |
| DC7 | Lista primero; la gestión va en modo foco, sin botón duplicado, con «Confirmar guía». | R504, R510, R511, R512, R513 |
| DC8 | Un solo `BuscadorFiltros` en todas las pantallas. | R495, R505, R527 |
| DC9 | El patrón de Reparto se aplica a Recoger, Recolección y Cierre del día. | R518, R519, R527 |
| DC10 | Ningún dato se recorta: el texto sigue en líneas; importes y guía en columna fija; se quita el «…»/`title` de SLT-152 «Tablas de cierres legibles». | R490, R491, R492 |
| DC11 | Escala de espaciado 4/8. | R494 |
| DC12 | Escáner único y colapsado «Escanear o escribir guía» (abre `EscanerModal`), bajo el encabezado y encima de los filtros; solo el modo foco lo muestra abierto. | R500, R510, R514, R515, R516 |
| DC13 | Mapa rediseñado con Leaflet: marcadores con los colores de la app, hoja inferior, pantalla completa, centrado con el carrusel. | R539, R540, R541, R542, R543 |
| DC14 | «Solicitar cierre del día» solo en Cierre del día, en barra fija inferior con contador; su diálogo lleva «Cancelar». | R531, R532, R533 |
| DC15 | Placeholder del buscador: «Guía, remisión, teléfono o nombre». | R506 |
| DC16 | Los flotantes (reportar problema y chat) se achican al hacer scroll. | R497, R498, R499, R534 |
| DC17 | Volumen: tarjeta compacta, resumen por resultado con conteo, paginación de 25 (`Pagination`). | R508, R523, R526, R527 |
| DC18 | Avisos en una línea. | R509 |

## Requisitos (EARS)

Numeración global reservada: R490-R559 (SLT-154 usa R460-R489). Usados: **R490-R544**.
«Pantallas del mensajero» = Reparto (`/mis-asignaciones/reparto`), Recoger en bodega
(`/mis-asignaciones/recoger`), Recolección (`/recoleccion`) y Cierre del día (`/cierre-dia`).
«Móvil» = ancho de ventana menor de 768 px (el corte de `useIsMobile`). La rebanada que entrega
cada requisito está entre corchetes; el corte, en `## Partir una feature`.

### Base común [A]

- **R490** — El sistema DEBE mostrar entero todo dato de una orden, gestión o cierre (guía,
  remisión, destinatario, tienda, dirección, producto, motivo, fecha, estado, importe) en las
  pantallas del mensajero: ningún elemento que lo contenga DEBE tener `text-overflow: ellipsis`,
  `line-clamp` ni texto escondido por `overflow: hidden`, y el texto que no cabe en una línea DEBE
  seguir en las siguientes, partiendo una palabra sin espacios si hace falta.
- **R491** — El sistema DEBE mostrar en pantalla, sin «…», el destinatario, la tienda y el
  mensajero de cada fila de gestión (`FilaGestion`) y de cada fila de «Rechazados por la tienda» y
  «Órdenes sin gestión», en todos los anchos y para todas las audiencias (mensajero, bodega,
  central); ninguno DEBE depender del atributo `title` para leerse entero.
- **R492** — En cada fila o tarjeta de las pantallas del mensajero, la guía y cada importe DEBEN
  ocupar una columna propia de ancho fijo que no se encoge ni se parte en líneas (importe alineado
  a la derecha), y su caja NO DEBE intersectar la caja de ningún otro dato.
- **R493** — Todo control accionable de las tarjetas, filas y barras de las pantallas del
  mensajero (inventario en `design.md §4`) DEBE tener, en móvil, un área táctil de al menos
  44 × 44 px.
- **R494** — Los márgenes, rellenos y huecos de los componentes que toca esta ficha DEBEN salir de
  la escala de 4 px (`design.md §3`): sin medios pasos (`*-0.5`, `*-1.5`, `*-2.5`, `*-3.5`) ni
  valores arbitrarios de espaciado.
- **R495** — La búsqueda y los filtros de cada lista de las pantallas del mensajero DEBEN vivir en
  una única instancia de `BuscadorFiltros` por lista; ninguna de esas listas DEBE tener un campo de
  búsqueda ni un control de filtro fuera de ella.
- **R496** — MIENTRAS la ventana sea móvil, `BuscadorFiltros` DEBE caber en el ancho útil sin
  desbordarlo y, DONDE la pantalla lo declare fijo, DEBE quedar visible pegado al borde superior de
  la ventana mientras se desplaza la lista.
- **R497** — CUANDO el usuario desplaza la página hacia abajo, el sistema DEBE reducir el botón
  flotante «Reportar un problema» y el botón flotante del chat a 44 px de diámetro.
- **R498** — CUANDO el usuario desplaza la página hacia arriba o vuelve al inicio, el sistema DEBE
  devolver los botones flotantes a su tamaño de hoy (48 px «Reportar un problema», 56 px el chat).
- **R499** — MIENTRAS un botón flotante esté reducido, el sistema DEBE conservar su nombre
  accesible, su distintivo de no leídos (chat) y su acción.
- **R500** — En Reparto, Recoger en bodega y Recolección, el sistema DEBE ofrecer un único
  disparador de escaneo con el texto «Escanear o escribir guía», situado bajo el encabezado de la
  página y encima de `BuscadorFiltros`, que arranca cerrado y abre `EscanerModal`.
- **R501** — A 360 px y a 414 px de ancho, ninguna pantalla del mensajero DEBE desbordar en
  horizontal: el `scrollWidth` del documento y el de cada lista DEBEN ser menores o iguales que su
  `clientWidth`, con los textos más largos de `design.md §12`.

### Reparto [B]

- **R502** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar los cuatro KPI de Reparto
  («Pendientes», «Entregado», «Por cobrar», «Total a cobrar») en una rejilla de 2 columnas y 2
  filas.
- **R503** — Fuera del modo foco, el sistema DEBE pintar Reparto en este orden: KPI; aviso de
  bloqueo (si aplica); «Escanear o escribir guía»; `BuscadorFiltros` fijo arriba; sección «En
  reparto / por gestionar» con «Sincronizar ruta», los avisos de ruta, el mapa de ruta y la lista;
  «Con ayuda solicitada» (si hay).
- **R504** — Fuera del modo foco, el sistema NO DEBE pintar el panel de gestión de ninguna orden
  en Reparto.
- **R505** — El `BuscadorFiltros` de Reparto DEBE ofrecer en «Filtros» los filtros «Cantón» y
  «Distrito», combinados en AND con el término; el distrito DEBE quedar deshabilitado sin cantón,
  cambiar el cantón DEBE vaciar el distrito y «Limpiar todo» DEBE quitar término y filtros.
- **R506** — En Reparto, Recoger en bodega y Recolección, el campo de búsqueda DEBE tener el
  placeholder «Guía, remisión, teléfono o nombre» y DEBE filtrar por número de guía, remisión,
  teléfono y nombre del destinatario (coincidencia parcial, sin distinguir mayúsculas ni acentos).
- **R507** — CUANDO se abre Reparto, el sistema DEBE mostrar la lista en vista Mosaico (carrusel);
  CUANDO el mensajero elige Detalle en el conmutador, DEBE mostrarla como lista de tarjetas
  compactas.
- **R508** — En vista Detalle, cada tarjeta DEBE presentar en su fila principal el número de
  parada, el destinatario, la guía, el estado y el monto a cobrar en columna fija, con las
  acciones en su pie, sin recortar ningún dato.
- **R509** — CUANDO aplica un aviso de ruta («El orden mostrado no está actualizado», «El orden de
  las paradas es aproximado»), el sistema DEBE mostrarlo en una sola línea con su título y DEBE
  desplegar su descripción completa al tocarlo.
- **R510** — CUANDO el mensajero pulsa «Gestionar» en una tarjeta y acepta «¿Gestionar esta
  orden?», el sistema DEBE pasar a modo foco con esa orden: solo su panel, con el bloque de
  verificación de la guía (escáner y campo «Número de guía») ya abierto.
- **R511** — MIENTRAS Reparto esté en modo foco, el botón que envía la guía DEBE decir «Confirmar
  guía» y la pantalla NO DEBE mostrar ningún otro botón «Gestionar» ni «Gestionar esta orden».
- **R512** — CUANDO el mensajero confirma en modo foco una guía que coincide con la de la orden, el
  sistema DEBE pasar al paso «¿Cómo terminó la gestión?»; SI no coincide, ENTONCES DEBE avisar «La
  guía {n} no corresponde a esta orden.» y quedarse en la verificación.
- **R513** — CUANDO el mensajero, en modo foco y antes de confirmar la guía, pulsa «Volver a la
  lista», el sistema DEBE salir del modo foco sin fijar ninguna gestión y mostrar la vista
  completa.
- **R514** — CUANDO el mensajero, fuera del modo foco, escanea o escribe en «Escanear o escribir
  guía» la guía de una de sus órdenes por gestionar y acepta «¿Gestionar esta orden?», el sistema
  DEBE abrir esa orden en modo foco con la guía ya confirmada (paso «¿Cómo terminó la gestión?»).
- **R515** — SI la guía escaneada o escrita en Reparto no es de ninguna orden suya por gestionar,
  ENTONCES el sistema DEBE avisar «La guía {n} no está en tu lista de reparto.» y no cambiar de
  vista.
- **R516** — MIENTRAS el mensajero esté bloqueado por un cierre pendiente, el sistema NO DEBE
  mostrar «Escanear o escribir guía» en Reparto, Recoger en bodega ni Recolección.

### Recoger en bodega y Recolección [C]

- **R517** — CUANDO se abre Recoger en bodega o Recolección, el sistema DEBE mostrar sus listas en
  vista Mosaico (carrusel) y ofrecer Detalle con las mismas tarjetas compactas de R508 (sin
  acciones).
- **R518** — El sistema DEBE pintar Recoger en bodega en este orden: aviso de bloqueo (si aplica);
  «Escanear o escribir guía» (abre la tarjeta «Recoger paquete» de hoy); `BuscadorFiltros` fijo
  arriba; pestañas «Para recoger hoy ({n})» / «Para otro día ({n})»; aviso de órdenes nuevas; lista.
- **R519** — El sistema DEBE pintar Recolección en este orden: aviso de bloqueo o «Escanear o
  escribir guía» (abre la tarjeta «Recolectar en tienda» de hoy); `BuscadorFiltros` fijo arriba;
  «Por recolectar en tienda» con su conteo y su lista; «Recogidos en tienda hoy» con su conteo y su
  lista.
- **R520** — CUANDO el mensajero escribe un término en Recolección, el sistema DEBE filtrar con él
  las dos listas («Por recolectar en tienda» y «Recogidos en tienda hoy»).
- **R521** — SI el término no deja ninguna orden en una lista de Recoger en bodega o de
  Recolección, ENTONCES el sistema DEBE mostrar en esa lista el vacío de búsqueda («Ninguna guía
  para recoger coincide con la búsqueda.» en Recoger, el de `design.md §9` en Recolección), distinto
  del vacío sin órdenes.
- **R522** — CUANDO el mensajero confirma una guía en el escáner de Recoger en bodega o de
  Recolección, el sistema DEBE recogerla o recolectarla con el mismo resultado y los mismos
  mensajes de hoy.

### Cierre del día [D]

- **R523** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada gestión de la pestaña
  «Gestiones» como una tarjeta: destinatario; guía · tienda; resultado (chip); la **Ganancia** como
  dato principal en columna fija a la derecha; las señales si las hay; y sus acciones («Devolver a
  gestión» si aplica y desplegar el detalle). Para cualquier audiencia.
- **R524** — MIENTRAS la ventana mida 768 px o más, el sistema DEBE pintar «Gestiones»,
  «Rechazados por la tienda» y «Órdenes sin gestión» con las mismas columnas y en el mismo orden
  de hoy.
- **R525** — CUANDO se despliega una tarjeta de gestión en móvil, el sistema DEBE mostrar su
  detalle de hoy («Orden», «Producto», «Dirección», «Recibió el mensajero», «Tu ganancia», «Ver
  evidencia», «Ver cálculo») en una sola columna.
- **R526** — MIENTRAS la ventana sea móvil y la lista de «Gestiones», ya filtrada, tenga más de 25
  gestiones, el sistema DEBE paginarla de 25 en 25 con `Pagination`; CUANDO cambian la pastilla de
  resultado o el término, DEBE volver a la página 1.
- **R527** — MIENTRAS la ventana sea móvil, la pestaña «Gestiones» DEBE tener fijos arriba un
  `BuscadorFiltros` con campo de búsqueda (por guía, remisión o destinatario, en AND con el
  resultado) y las pastillas por resultado con su conteo («Todas ({n})», una por resultado, «Con
  señales ({n})»).
- **R528** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada fila de «Rechazados por la
  tienda» como una tarjeta: destinatario; guía · tienda; fecha del rechazo en columna fija; motivo
  completo.
- **R529** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada fila de «Órdenes sin
  gestión» como una tarjeta: destinatario; guía · tienda; remisión · producto con su estado de
  origen.
- **R530** — MIENTRAS la ventana sea móvil, las pestañas del detalle del cierre («Corregir»,
  «Gestiones ({n})», «Rechazados por la tienda ({n})») DEBEN caber sin desbordar, pasando a otra
  línea si hace falta.
- **R531** — MIENTRAS el cierre en curso se muestre en Cierre del día, su botón principal DEBE
  decir «Solicitar cierre del día»; MIENTRAS la ventana sea móvil, el pie del cierre de la página
  (con el contador «Recaudado {monto} · {n} gestiones» y su botón, también el del rechazado o
  vencido) DEBE ir en una barra fija al borde inferior de la ventana, sin tapar la última fila.
- **R532** — El sistema NO DEBE mostrar «Solicitar cierre del día» en Reparto, Recoger en bodega
  ni Recolección.
- **R533** — CUANDO el mensajero pulsa «Solicitar cierre del día», el sistema DEBE abrir el diálogo
  «Solicitar cierre del día» con su resumen (gestiones, recaudado, tu ganancia), el botón de
  confirmar y «Cancelar»; CUANDO pulsa «Cancelar», DEBE cerrarlo sin enviar nada.
- **R534** — MIENTRAS haya una barra fija inferior, el sistema DEBE pintar los botones flotantes
  por encima de ella, sin solaparse.
- **R535** — MIENTRAS la ventana sea móvil, el sistema DEBE pintar cada cierre de «Cierres
  solicitados» como una tarjeta: fecha de solicitud y estado; destino; Ganancia en columna fija;
  «Ver»; y, al desplegar, folio, recaudado y pago.
- **R536** — MIENTRAS la ventana sea móvil, la barra de filtros de «Cierres solicitados»,
  «Descargar», las tarjetas de ganancia y la paginación DEBEN caber sin desbordar.
- **R537** — CUANDO el mensajero pulsa «Ver» en móvil, el sistema DEBE abrir el detalle del cierre
  a pantalla completa, con las tarjetas de R523, R528 y R529 y «Cerrar».
- **R538** — «Descargar» de «Gestiones» y de «Cierres solicitados» DEBE entregar las mismas
  columnas y filas que hoy, en cualquier ancho.

### Mapa de ruta [E]

- **R539** — Los marcadores del mapa de ruta (paradas, parada activa y origen) DEBEN pintarse con
  los colores de la paleta de la app (`design.md §11`), sin colores fuera de ella.
- **R540** — CUANDO el mensajero toca el marcador de una parada, el sistema DEBE abrir una hoja
  inferior con los datos de esa parada (número, destinatario, dirección, estado, monto a cobrar) y
  la acción «Gestionar» de su tarjeta; CUANDO la cierra, DEBE volver al mapa.
- **R541** — CUANDO el mensajero pulsa «Pantalla completa», el sistema DEBE mostrar el mapa a toda
  la ventana; CUANDO pulsa «Salir de pantalla completa», DEBE devolverlo a su sitio en la página.
- **R542** — MIENTRAS el mapa esté abierto en vista Mosaico, CUANDO cambia la tarjeta visible del
  carrusel, el sistema DEBE centrar el mapa en la parada de esa tarjeta y marcarla como activa.
- **R543** — SI una parada no tiene coordenadas, ENTONCES el sistema DEBE dejarla en la lista y
  fuera del mapa, como hoy.
- **R544** — El control «Mostrar mapa» / «Ocultar mapa» DEBE conservar sus textos y abrir o cerrar
  el mapa como hoy, con área táctil de 44 px.

## Partir una feature

Archivos esperados del conjunto: 95 (46 de producción y 49 de tests; `tasks.md > Archivos
esperados`), más del doble del tope de `gate.tamano_pr` (40). **No cabe en un PR.** Se parte en cinco rebanadas verticales; cada una se
mergea sola y deja las pantallas funcionando (las no tocadas siguen como hoy). En el board: SLT-156
se queda con la rebanada A y su `description` se acota a ella; B-E se crean con `/afinar-feature`
(paso 5) con `depends_on` encadenado. Estimaciones por clases y por el tamaño de los archivos de
hoy; el gate las mide de verdad.

| Rebanada | Título propuesto | Requisitos | Archivos (prod / tests) | Líneas (prod / tests) | Depende de |
|---|---|---|---|---|---|
| **A** | «PWA del mensajero: base común (ningún dato se recorta, 44 px, flotantes)» | R490-R499, R501 (base: Reparto y cierre en escritorio) | 14 / 13 | ~300 / ~900 | — |
| **B** | «PWA del mensajero: Reparto en móvil (KPI 2×2, modo foco, escáner)» | R500 (Reparto), R502-R516 | 13 / 15 | ~600 / ~1 400 | A |
| **C** | «PWA del mensajero: Recoger en bodega y Recolección» | R500 (Recoger, Recolección), R506, R516, R517-R522 | 5 / 7 | ~220 / ~600 | A |
| **D** | «PWA del mensajero: Cierre del día en tarjetas» | R523-R538 | 14 / 14 | ~650 / ~1 500 | A |
| **E** | «PWA del mensajero: mapa de ruta» | R539-R544 | 6 / 7 | ~380 / ~550 | B |

Qué entra en cada una (detalle de tareas y archivos en `tasks.md`):

- **A — base común.** Variante táctil de `Button`; `BuscadorFiltros` que cabe en 312 px con las
  props `fija` y `tactil`; la regla «ningún dato se recorta» en `FilaGestion`, rechazados, sin
  gestión y las tarjetas POS (`PosOrderCardDetalle`, `PosOrderCardMosaico`, `PosNavBlock`), que
  quita el «…»/`title` de SLT-152; `VistaCardsToggle` a 44 px; flotantes que se achican; la
  constante «Escanear o escribir guía»; la guardia estática (sin recorte, escala de 4 px) y el
  fixture E2E de textos largos. **E2E a 360 px:** Reparto sin desborde, sin «…» en tarjetas, y
  flotantes a 44 px al bajar; `/cierre-dia` a 1280 px sin «…» ni solapes en «Gestiones».
  Deja todo funcionando: nada cambia de sitio, solo deja de recortarse y crece.
- **B — Reparto.** KPI 2×2, orden de secciones, lista primero, `BuscadorFiltros` con cantón y
  distrito, Mosaico/Detalle compacto, avisos en una línea, modo foco con «Confirmar guía» y
  «Volver a la lista», escáner de lista, botones de tarjeta a 44 px. **E2E a 360 px:** Reparto con
  la orden de destinatario más largo, sin desborde ni «…», y el flujo Gestionar → foco → Confirmar
  guía → resultado.
- **C — Recoger en bodega y Recolección.** Orden de secciones, escáner «Escanear o escribir guía»,
  `BuscadorFiltros` (nuevo en Recolección), Mosaico por defecto. **E2E a 360 px:** las dos pantallas
  con textos largos, sin desborde ni «…», y la búsqueda en Recolección.
- **D — Cierre del día.** Tarjetas de «Gestiones» (Ganancia), rechazados, sin gestión y cola;
  buscador y pastillas fijos, paginación de 25, pestañas que envuelven, barra fija «Solicitar
  cierre del día» con diálogo y «Cancelar», «Ver» a pantalla completa. **E2E a 360 px:**
  `/cierre-dia` con 30 gestiones de textos largos (paginación), sin desborde ni «…», barra fija
  visible, «Ver». Si al implementar el gate avisa del 80 %, se parte en D1 «el cierre de hoy»
  (R523-R534, R538) y D2 «cierres solicitados y Ver» (R535-R537).
- **E — mapa.** Marcadores con la paleta, hoja inferior, pantalla completa, centrado con el
  carrusel. **E2E a 360 px:** Reparto con mapa abierto, sin desborde; tocar un marcador abre la
  hoja; pantalla completa y vuelta.

Orden sugerido: A; luego B, C y D en paralelo (entre sí solo comparten la lista de la guardia
`pwa-mensajero-sin-recorte`, un conflicto de una línea); E al final (comparte `RepartoModule.tsx`
con B).

## Preguntas abiertas

Respondidas por Carlos (2026-11-13), quedan en `## Decisiones cerradas`: dato principal de
«Gestiones» (Ganancia, DC2); botones de las cards a 44 px (DC3); tarjetas por ancho (DC1).
Técnicas 4-7 del borrador: resueltas en `design.md` (§5 columnas móviles sobre la misma
`DataTable`; §4 variante táctil; §12 medición con E2E; tamaño: `## Partir una feature`).

**Para Carlos (dependen de él):**

- **P1. Ranking.** La `description` de la ficha dice «tablas y pantallas del mensajero», y Ranking
  del día / Histórico tienen tres tablas sin vista móvil (T6-T8), pero el diseño aprobado no las
  nombra. ¿Quedan fuera de SLT-156 (ficha aparte) o son una rebanada F? Recomendación: ficha
  aparte; el podio (`RankingPodio`) ya es móvil y las tablas de debajo están marcadas como
  «Versión anterior, debajo para comparar».
- **P2. Buscador de «Gestiones del cierre».** La gestión de un cierre no trae el teléfono del
  destinatario (`ICierreDiaService`): con el placeholder decidido («Guía, remisión, teléfono o
  nombre») habría que añadirlo al repositorio del cierre. Recomendación: en «Gestiones» buscar por
  guía, remisión o nombre, con el placeholder «Guía, remisión o nombre», sin tocar el backend
  (es lo que dice R527).

**Para el leader, contra el canvas (no son de Carlos: el diseño ya está aprobado; si el canvas dice
otra cosa, manda el canvas y se corrige el requisito):**

- **C1.** Posición del escáner respecto de los KPI de Reparto (R503 lo pone debajo de los KPI).
- **C2.** Texto del control para salir del modo foco antes de confirmar («Volver a la lista», R513).
- **C3.** Qué hace el escáner de la lista de Reparto y su aviso de guía ajena (R514, R515).
- **C4.** Datos de la fila principal de la tarjeta Detalle compacta (R508) y de la hoja inferior
  del mapa (R540); textos «Pantalla completa» / «Salir de pantalla completa» (R541).
- **C5.** «Avisos en una línea»: si la descripción se despliega al tocar (R509) o no se muestra.
- **C6.** Si la paginación de 25 y el buscador de «Gestiones» son solo en móvil (R526, R527) o en
  todos los anchos.
- **C7.** La escala «4/8»: R494 la lee como múltiplos de 4 px; si el canvas usa solo 4, 8, 16, 24…
  se endurece la guardia.
- **C8.** Texto del botón de confirmar del diálogo (hoy «Solicitar cierre»; R533 no lo cambia) y
  del vacío de búsqueda de Recolección (R521).
