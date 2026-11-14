# SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — requirements (BORRADOR: inventario y diagnóstico)

> Estado: **borrador previo a `/design`**. Aún sin requisitos EARS, sin `design.md` ni `tasks.md`.
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

## Preguntas abiertas

Para Carlos (dependen de él):

1. **¿Qué dato manda en la tarjeta de «Gestiones del cierre»?** Recomendación: **Ganancia** a la
   derecha (es lo que el mensajero quiere comprobar antes de solicitar el cierre) y «Recibido» al
   tocar. Alternativa: «Recibido», si lo que más se discute es el efectivo que entrega.
2. **¿Alcance: solo las tablas (Cierre del día y Ranking) o también los botones de las cards del
   portal (Reparto/Recoger/Recolección) a 44 px?** Recomendación: incluirlos; es el mismo
   problema en las pantallas donde el mensajero pasa el turno, y es un cambio de tamaño, no de
   diseño.
3. **¿El cambio a tarjetas aplica solo al mensajero o a todos los roles en el móvil?** Las tablas
   T1 y T5 son compartidas con bodega y central. Recomendación: condicionarlo al **ancho de
   pantalla**, no al rol; así el admin que abra un cierre en el teléfono también gana, y no hay
   dos caminos de código por rol.

Técnicas (se resuelven en `/design`, no son de Carlos):

4. Modo «tarjetas» dentro de `DataTable` frente a columnas móviles por consumidor (precedente
   wallet). Pesa el censo de tablas y la descarga.
5. Variante táctil de `Button`: nueva variante de tamaño o una clase solo en móvil.
6. Medir antes de diseñar: los anchos de este diagnóstico son estimados; T6 y las pestañas de
   `DetalleCierre` pueden no fallar.
7. Tamaño del PR: 6 tablas + botones + E2E móviles puede pasar del 80 % de `gate.tamano_pr`.
   Corte natural si hace falta: rebanada 1 «Cierre del día» (T1, T2, T3, T5), rebanada 2 «Ranking»
   (T6, T7, T8), rebanada 3 «Botones de las cards del portal».
