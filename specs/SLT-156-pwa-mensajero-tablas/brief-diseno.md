# SLT-156 «PWA de los mensajeros: tablas usables en el móvil» — brief para el diseño

> Para dibujar TODAS las pantallas del rol `mensajero` tal como están hoy, con la navegación real.
> Leído del worktree `SLT-156-pwa-mensajero-tablas` (origin/dev). Todo `archivo:línea` es de ahí.
> Los textos van **literales**, copiados del código. Donde el código usa voseo («Intentá», «Contá»,
> «podés») se copia igual y se marca con ⚠ voseo: la guardia de trato
> (`tests/unit/guards/cierres-trato-tu.guardia.test.ts`) solo cubre cierres, así que fuera de cierres
> conviven «tú» y «vos». El diseño NO debe corregirlos en silencio: es una decisión aparte.
> Rutas de componentes relativas a la raíz del repo; `MA/` = `app/(app)/mis-asignaciones/_components/`.
> Decisiones ya tomadas por Carlos (`progress/features/SLT-156.md`): tarjetas por ancho < 768 px,
> Ganancia es el dato grande en Gestiones, botones de 44 px en toda la PWA del mensajero.

---

## 0. Correcciones al inventario de `requirements.md`

Al releer el código salieron tres diferencias con el inventario; el diseño debe seguir esto:

1. En «Con ayuda solicitada» el segundo botón dice **«Conversación»**, no «Ver hilo»
   (`MA/RepartoModule.tsx:146`, `:638`).
2. Recolección **no** tiene `ContactoButtons`: se retiraron con la agrupación por tienda
   (`app/(app)/recoleccion/_components/RecoleccionModule.tsx:278-282`). Sus cards no llevan acciones.
3. «Ranking del día» tiene **tres** bloques, no dos: arriba un podio visual `RankingPodio`
   (`app/(app)/ranking/page.tsx:51-55`), que ya es un patrón móvil y se reusa; debajo la tabla
   (T6) y los premios (T7), marcados en el código como «Versión anterior, debajo para comparar»
   (`ranking/page.tsx:57`).

---

## 1. Navegación en móvil (rol mensajero)

### 1.1 Qué hay y qué no hay

| Elemento | ¿Existe en móvil? | Cómo es hoy | Fuente |
|---|---|---|---|
| Barra superior fija / app bar | **No** | No hay header global. Arriba del todo, en el flujo de la página (no fijo), solo está el botón del menú. Debajo va el `PageHeader` de cada pantalla. | `app/(app)/layout.tsx:173` |
| Botón de menú (hamburguesa) | Sí, solo `< md` (768 px) | `SidebarTrigger`: botón `ghost`, tamaño `icon-sm` (**28×28 px**), icono lucide **`PanelLeft`** (`PanelLeftIcon`), texto oculto «Toggle Sidebar» (en inglés). Va solo, alineado a la izquierda, encima del `PageHeader`. Se desplaza con la página. | `layout.tsx:173`; `components/ui/sidebar.tsx:254-277`; `components/ui/button.tsx:116-117` |
| Menú lateral (drawer) | Sí | `Sheet` que entra **por la izquierda**, ancho **18rem (288 px)**, fondo `--sidebar` `#1C1C1A` (casi negro), texto `#C0C0BE`. El botón de cerrar del `Sheet` está oculto (`[&>button]:hidden`): se cierra tocando fuera. Título accesible en inglés («Sidebar» / «Displays the mobile sidebar.»). | `components/ui/sidebar.tsx:31`, `:182-205`; `app/globals.css:332-334` |
| Logo y nombre de la app | Sí, **solo dentro del drawer** | `Logo fondo="oscuro" ancho={160}` arriba del drawer (`SidebarHeader`, `px-3 py-4 min-h-14`). Fuera del drawer no hay logo ni nombre. | `app/(app)/_components/Sidebar.tsx:320-351` |
| Avatar / perfil | Solo en el pie del drawer | Círculo de 32 px con iniciales (fondo `--sidebar-primary` `#FFD000`), nombre completo y rol («Mensajero» según `ROL_LABELS`). **No es tocable**: no hay pantalla de perfil («Perfil» salió del menú, `lib/auth/menu-visibility.ts:834-835`). | `Sidebar.tsx:86-111`, `:455`; `layout.tsx:114-117` |
| Barra inferior (bottom nav) | **No existe** | — | — |
| Encabezado de cada pantalla | Sí | `PageHeader` (vía `AppPage`): fondo teñido por rol, en el mensajero **`bg-success/10`** (verde pálido, `#10b981` al 10 %). `h1` 24 px semibold + descripción 14 px gris. Debajo, la fila de controles que **envuelve** por debajo de `lg`. | `components/shared/AppPage.tsx:27-40`; `components/shared/PageHeader.tsx:34-40`, `:98-145` |
| Controles del encabezado (en este orden) | Sí | 1) fecha (oculta `< sm`), 2) «Instalar» (solo si el navegador ofrece instalar; en `< sm` solo icono), 3) «?» Ayuda (solo si la pantalla tiene documento), 4) tema, 5) campana, 6) «Salir». Detalle abajo. | `PageHeader.tsx:110-142` |
| Campana de notificaciones | Sí, en el encabezado | `Popover`; disparador redondo con icono lucide **`Bell`** (20 px). Con trabajo pendiente se vuelve píldora con texto «{n} por hacer». Panel: título «Notificaciones», bloques «Requieren tu acción» / «Para tu información», filtro «Todas», «Marcar todas como leídas», vacío «No tienes notificaciones.». Ancho `w-100 max-w-[calc(100vw-2rem)]`. | `components/shared/NotificationsBell.tsx:74-87`, `:254-277` |
| Botón flotante «Reportar un problema» | Sí, en todas las pantallas | Círculo de **48 px** (`size-12`), `fixed right-5`, `bg-card` con borde y sombra, icono lucide **`Bug`**. Abajo `bottom-5`; en `/mis-asignaciones/*` sube a `bottom-24` para quedar encima del chat. Abre un panel `w-[min(22rem,…)]` con «Describe el problema», contador «n/500», «Agregar imágenes», «Enviar», «Descartar». | `components/shared/ReporteBugBoton.tsx:32-56`, `:187-189`, `:553-562`; `layout.tsx:228` |
| Botón flotante de chat | Sí, **solo en Reparto y Recoger en bodega** | Círculo de **56 px** (`size-14`), `fixed bottom-5 right-5`, `bg-primary` (negro `#111111`), icono lucide **`MessageCircle`**, distintivo rojo con el número sin leer. Abre un `Dialog` de 85 dvh: lista de órdenes → conversación (en móvil, una vista a la vez). | `MA/chat/ChatFlotante.tsx:182-235`; `app/(app)/mis-asignaciones/recoger/page.tsx:62` |
| Banner de instalación PWA | **No hay banner** | Solo el botón «Instalar» del encabezado (`Download`), visible únicamente cuando el navegador dispara el evento (no en Safari ni Firefox). | `components/shared/InstalarPwaButton.tsx:8-39` |
| Aviso de versión nueva | Sí (del service worker) | Tarjeta `fixed top-0` centrada: «Hay una versión nueva de {marca}» / «Actualizar recarga la pantalla. Hazlo cuando hayas terminado lo que tengas a medias.» / «Actualizar ahora» / «Ahora no». | `components/shared/AvisoVersionNueva.tsx:38-50`; `layout.tsx:190` |
| Asistente («?») | Panel, sin botón propio | Lo abre el «?» del encabezado; no pinta nada cerrado. | `layout.tsx:213-222` |
| Aire inferior de la página | — | `pb-40` (160 px) por debajo de `lg` para que lo flotante no tape el final. | `layout.tsx:153-171` |

Controles del encabezado, detalle (`PageHeader.tsx:115-141`):

| # | Control | Texto visible en móvil (`< sm`) | Icono (lucide) | Fuente |
|---|---|---|---|---|
| 1 | Fecha | oculta | `Calendar` | `PageHeader.tsx:115-118` |
| 2 | Instalar | solo icono (aria «Instalar la aplicación»); desde `sm`: «Instalar» | `Download` | `InstalarPwaButton.tsx:27-38` |
| 3 | Ayuda de la pantalla | solo icono (aria «Ayuda de esta pantalla»); desde `sm`: «Ayuda» | `CircleHelp` | `components/shared/AyudaBoton.tsx:123-133` |
| 4 | Tema | solo icono; desde `sm` el nombre del tema | `Sun` / `Moon` | `components/shared/TemaToggle.tsx:60-79` |
| 5 | Campana | icono o píldora «{n} por hacer» | `Bell` | `NotificationsBell.tsx:254-271` |
| 6 | Salir | «Salir» (con icono) / «Saliendo…» | `LogOut` | `app/_components/LogoutButton.tsx:66-74` |

### 1.2 Entradas del menú del mensajero, en orden

Fuente: `lib/auth/menu-visibility.ts` (array `SIDEBAR_ITEMS`) + iconos de `Sidebar.tsx:161-216`.
Un ítem con hijos es un **desplegable** (`Collapsible`), no un enlace; los hijos no llevan icono y el
padre muestra un `ChevronRight` que gira 90° al abrir (`Sidebar.tsx:388-399`). El desplegable abre
solo si estás en uno de sus hijos.

| # | Texto | Tipo | Icono (lucide) | Ruta | Fuente |
|---|---|---|---|---|---|
| 1 | **Entregas** | desplegable | `Truck` | — | `menu-visibility.ts:442-450` |
| 1.1 | Reparto | hijo | — | `/mis-asignaciones/reparto` | `:447` |
| 1.2 | Recoger en bodega | hijo | — | `/mis-asignaciones/recoger` | `:448` |
| 2 | **Recolección** | enlace | `Store` | `/recoleccion` | `:457-461` |
| 3 | **Ranking** | desplegable (solo si el módulo `ranking` está activo para la empresa) | `Trophy` | — | `:520-529` |
| 3.1 | Ranking del día | hijo | — | `/ranking` | `:526` |
| 3.2 | Histórico | hijo | — | `/ranking/historico` | `:527` |
| 4 | **Cierre del día** | enlace | `ClipboardCheck` | `/cierre-dia` | `:627-631` |
| 5 | **Ayuda** | enlace | `CircleHelp` | `/ayuda` | `:829-833` (`ROLES_AYUDA` incluye `mensajero`, `lib/ayuda/documento.ts:52-55`) |

- Aterrizaje después de entrar: el primer hijo del primer ítem visible → **`/mis-asignaciones/reparto`**;
  `/mis-asignaciones` redirige ahí (`app/(app)/mis-asignaciones/page.tsx:15`).
- Al cargar, los ítems entran escalonados (deslizan de izquierda a derecha y aparecen, 340 ms + 80 ms
  por ítem), solo la primera vez (`Sidebar.tsx:218-297`).
- El mensajero **no** ve: Inicio, Analítica, Monitoreo, Órdenes, Wallet, Mi wallet, Novedades,
  Configuración, Cierres del día (admin), Incidentes, Histórico de conversaciones, Mi plan.

---

## 2. Pantallas

Todas usan el mismo armazón (`AppPage`): `PageHeader` a todo el ancho y debajo el contenido en
`Container` con `p-6` y `gap-6` (`components/shared/Container.tsx:18`). Ancho útil a 360 px = 312 px.

### P1 · Reparto — `/mis-asignaciones/reparto`

- **Título:** «Reparto». **Descripción:** «Órdenes en reparto por gestionar»
  (`app/(app)/mis-asignaciones/reparto/page.tsx:65`).
- **Orden de las secciones** (vista completa, `MA/RepartoModule.tsx:646-926`):
  1. **KPI** (`MA/KpisMensajero.tsx:30-52`), 4 tarjetas: «Pendientes» (`Truck`), «Entregado»
     (`PackageCheck`, `NOMBRE_ESTADO.entregado`), «Por cobrar» (`HandCoins`, moneda), «Total a cobrar»
     (`Wallet`, moneda). Rejilla `grid-cols-1` en móvil: **las 4 apiladas, una por fila**
     (`sm:grid-cols-2 lg:grid-cols-4`, `:58`). Cada tarjeta: círculo de 56 px con el icono en
     `bg-accent` (`#FFF8D9`), rótulo 12 px gris y cifra 24 px semibold.
  2. **Aviso de bloqueo** (solo si el mensajero tiene un cierre pendiente): caja roja `role="alert"`
     con el texto de `avisoDeBloqueo` (`:652-659`).
  3. **Filtro por cantón y distrito** `FiltroCantonDistrito`: «Filtrar por {cantón}» / «Filtrar por
     {distrito}», opciones «Todos los cantones» / «Todos los distritos», «Limpiar filtros» solo con
     filtro activo (`MA/FiltroCantonDistrito.tsx:23-28`; montado en `:688-697`).
  4. Sección **«En reparto / por gestionar»** (`h2` 18 px, `:705-712`) con el botón **«Sincronizar
     ruta»** (`RefreshCw`, `size="sm"`, «Sincronizando…») a la derecha (`MA/SincronizarRutaButton.tsx:130-136`).
  5. Avisos de ruta, si aplican: rojo «El orden mostrado no está actualizado» / «La ruta cambió desde
     el último cálculo. Pulsa «Sincronizar ruta» para recalcular el orden de entrega.» (`:724-732`);
     neutro «El orden de las paradas es aproximado» / «Lo calculamos en la app, por cercanía en línea
     recta: no toma en cuenta calles ni tráfico. Revísalo antes de salir.» (`:747-755`).
  6. **Mapa de ruta** plegable: rótulo «Mapa de ruta» + botón `ghost` `size="xs"` (24 px)
     «Mostrar mapa» / «Ocultar mapa»; nota «El punto de partida es aproximado (no se usó tu ubicación
     GPS reciente).» (`:764-801`).
  7. **Panel de gestión** de la orden seleccionada (o la primera), `GestionarOrdenPanel` (ver P1-D1).
     El detalle va **antes** de la lista (`:802-820`).
  8. **Buscador**: etiqueta «Buscar guías», placeholder «Filtra por número de guía, remisión, teléfono
     o nombre», + conmutador **Mosaico / Detalle** (`VistaCardsToggle`, iconos `LayoutGrid` / `Rows3`).
     En móvil se apilan (`:831-854`; `MA/VistaCardsToggle.tsx:27-37`).
  9. **Lista de órdenes** (L1): en Mosaico, carrusel `CarruselCards` de 1 tarjeta en móvil con la
     etiqueta «Órdenes 1-3 de 5»; en Detalle, lista `<ul>` de `PosOrderCardDetalle` (`:870-897`).
  10. **«Con ayuda solicitada»** (L2), solo si hay: título 12 px mayúsculas color aviso, ayuda «Tu
      tienda las está viendo en Novedades. Con «Recuperar» retirás la solicitud y la orden vuelve
      arriba.» ⚠ voseo; siempre en vista Detalle (`:141-143`, `:903-922`).
  11. Botón flotante de chat (sección 1.1).
- **Tarjeta de orden, vista Detalle** (`MA/pos-card/PosOrderCardDetalle.tsx:68-205`), una fila:
  - izquierda: botón cuadrado de **44 px** (`size-11`, `bg-brand` = negro) con `Navigation`, abre el
    mapa de ubicación;
  - centro: nº de parada (cuadro 20 px `bg-navy`), remisión en mono 11 px, chip de estado
    (`EstadoConInfo`, 9 px), marcas, nota de ayuda; badges de excepción «Pendiente de optimizar»
    (`outline`), «Para mañana» (`info`), «Gestionar más tarde» (`warning`); destinatario 14 px bold;
    ubicación con `MapPin` «cantón · distrito — dirección» o «Sin dirección»; intentos; si es para
    otro día, la frase de `avisoReservaParaOtroDia`;
  - derecha: «COBRAR» 9 px + monto en mono 14 px bold;
  - pie (borde punteado): las acciones.
- **Tarjeta, vista Mosaico** (`MA/pos-card/PosOrderCardMosaico.tsx:92-288`): cabecera con nº de
  parada (24 px), remisión, «{n} de {total}» o «Sin posición» · peso, chip de estado a la derecha;
  destinatario, producto (`Package`), intentos; bloque de ubicación sobre `bg-navy` (`MapPin`,
  cantón · distrito, dirección, `Navigation`) que abre Maps; badges de excepción; fila «COBRAR» +
  monto; desplegable **«Ver detalle completo»** (`ChevronDown`) con `AsignacionDetalle`; pie con
  acciones.
- **Acciones por tarjeta (L1)** (`RepartoModule.tsx:528-562`): izquierda **«Gestionar más tarde»**
  (`MarcarLuegoToggle`, `Clock`, `size="sm"` 28 px; `MA/MarcarLuegoToggle.tsx:78-90`); derecha
  **«Gestionar»** (`GestionarOrdenCardButton`, `Truck`, `size="sm"`; `MA/GestionarOrdenCardButton.tsx:59-66`).
- **Acciones por tarjeta (L2)** (`:616-641`): **«Recuperar»** (`Undo2`, `size="sm"`;
  `MA/RecuperarAyudaButton.tsx:80-87`) y **«Conversación»** (`secondary`, `size="sm"`).
- **Vacíos** (`:136`, `:150-151`, `:855-869`): «No hay órdenes en reparto.»; con búsqueda: «Ninguna guía
  en reparto coincide con la búsqueda.»; todas con ayuda: «Todas tus órdenes en reparto tienen ayuda
  solicitada; están abajo.».
- **Modo foco**: con una gestión fijada, la pantalla muestra **solo** el panel (sin KPI de la lista,
  filtro, mapa ni tarjetas) (`:661-678`). Los KPI siguen arriba porque los pinta la página.
- **Diálogos de esta pantalla:**
  - **P1-D0 «¿Gestionar esta orden?»** (al pulsar «Gestionar» en una tarjeta): «Si gestionas esta orden
    fuera del orden sugerido, tu ruta de reparto puede cambiar.» / «Aceptar» / «Cancelar»
    (`MA/GestionarOrdenCardButton.tsx:24-28`).
  - **P1-D1 Panel «Detalle de la orden»** (`MA/GestionarOrdenPanel.tsx:859-1332`), caja `max-w-md`
    redondeada:
    - cabecera pegajosa: «Guía {n}», «Parada {n} de {total}» o «{n} órdenes en reparto», chip de estado;
    - `AsignacionDetalle` en 3 bloques (`MA/AsignacionDetalle.tsx:92-171`): **Pedido** (Nº Guía,
      Nombre, Teléfono, Producto), **Entrega** (dirección destacada con `MapPin`, provincia / cantón /
      distrito, Notas, Intentos), **Cobro** («Valor a cobrar» en caja `bg-navy` 24 px mono + «Peso»
      si cabe);
    - fila de 4 botones grandes (≈ 72 px de alto, `py-3.5`, texto 12 px mayúsculas): **«Llamar»**
      (`Phone`, `bg-primary`), **«Mensaje»** (`MessageCircle`, `bg-success-strong`), **«Navegar»**
      (`Navigation`, `bg-navy`), **«Ayuda»** (`LifeBuoy`, `bg-destructive`) (`:892-944`);
    - hilo «Notas con la tienda» (`HiloNotasOrden`, compositor plegado) (`:972-1000`);
    - **paso 1 «Gestionar esta orden»** (`QrCode`): «Escanea el QR de la etiqueta o ingresa el número
      de guía para confirmar que tienes el paquete correcto.», campo «Número de guía» (placeholder
      «Ingresa el número de guía»), botón «Gestionar», escáner QR (`MA/VerificarGuiaGate.tsx:97-136`);
    - CTA pegajoso abajo: **«Gestionar esta orden»** (`Truck`, `py-4`, ≈ 56 px) (`:1311-1331`);
    - **paso 2 «¿Cómo terminó la gestión?»**: botones de 64 px en rejilla `grid-cols-1` (móvil)
      **«Entregar»** (`PackageCheck`), **«Rechazar»** (`XCircle`), **«Reprogramar»** (`RotateCcw`),
      **«Devolver»** (`Undo2`); aparte, bajo separador, «El paquete ya no se puede entregar ni
      devolver: está dañado, perdido o robado.» + **«Reportar incidente»** (`ShieldAlert`, 56 px,
      borde punteado); **«Cancelar gestión»** (`:1042-1113`, `:205-250`). En el último intento,
      nota: «A esta orden le queda el último intento de entrega: ya no se puede reprogramar ni
      devolver. Registra cómo terminó ahora — … Si el paquete se dañó, se perdió o te lo robaron,
      repórtalo como incidente.» (`:276-277`);
    - **paso 3, formulario** (título del resultado + «Atrás»): Entregar → desglose de pago
      (`DesglosePagoField`) o «Esta orden no tiene cobro asociado: no hay nada que recaudar.» +
      «Fotos de evidencia»; Reprogramar → «Nueva fecha» (mín. mañana) + motivo; Devolver → «Causa de
      la devolución» (radios) + fotos + motivo; Rechazar → fotos + motivo; Incidente → causa del
      incidente + fotos + motivo. Pie: «Cancelar gestión» y **«Guardar gestión»** («Procesando foto…»,
      «Obteniendo ubicación…») (`:1115-1303`).
  - **P1-D2 «Solicitar ayuda»** (`MA/SolicitarAyudaModal.tsx:52-91`): descripción «Contá qué está
    pasando con la orden de {destinatario} ({guía}). Tu tienda lo verá en Novedades.» ⚠ voseo; campo
    «Motivo (obligatorio)», textarea 3 filas, «Hasta {n} caracteres. Se publica en las notas de la
    orden.», error «El motivo es obligatorio.»; botón «Solicitar ayuda».
  - **P1-D3 «Conversación de la orden»** (desde «Conversación» en L2): hilo «Notas con la tienda»,
    «Cerrar» (`MA/HiloNotasAyudaModal.tsx:39-46`).
  - **P1-D4 Chat con clientes** (botón flotante): `Dialog` 85 dvh, lista → conversación
    (`MA/chat/ChatFlotante.tsx:207-235`).

### P2 · Recoger en bodega — `/mis-asignaciones/recoger`

- **Título:** «Recoger en bodega». **Descripción:** «Órdenes asignadas pendientes de recoger»
  (`app/(app)/mis-asignaciones/recoger/page.tsx:47-48`). Sin KPI.
- **Orden** (`MA/RecogerModule.tsx:281-396`):
  1. Aviso de bloqueo (caja roja), si aplica (`:284-291`).
  2. Disparador del escáner **«Recoger paquete»** (botón `outline`, `ScanLine`), solo si hay algo por
     recoger y no está bloqueado (`:305-310`; `components/shared/EscanerModal.tsx:61-67`). Abre un
     diálogo con la tarjeta «Recoger paquete» / «Escanea o ingresa el número de guía», campo manual
     con botón «Recoger», cámara (`MA/RecogerPaqueteCard.tsx:86-95`).
  3. Buscador «Buscar guías» (placeholder «Filtra por número de guía, remisión, teléfono o nombre»)
     + conmutador Mosaico / Detalle (`:323-344`).
  4. Pestañas: **«Para recoger hoy ({n})»** y **«Para otro día ({n})»** (`:355-366`;
     `lib/utils/dia-reparto-textos.ts:160-161`).
  5. En «hoy», banner azul `role="status"`: «1 orden nueva para recoger» / «{n} órdenes nuevas para
     recoger» (`:374-381`; `MA/recoger-grupos.ts:86-90`).
  6. Lista (L3): carrusel o `<ul>` de las **mismas tarjetas POS**, sin ruta y **sin acciones**
     (`:192-206`).
  7. Botón flotante de chat (mismo que Reparto).
- **Vacíos** (`MA/recoger-grupos.ts:64-74`, `:108-122`): «No hay órdenes para recoger hoy.», «No hay
  órdenes para otro día.», con búsqueda «Ninguna guía para recoger coincide con la búsqueda.»; más el
  puntero «Hay {1 orden | n órdenes | 1 coincidencia | n coincidencias} en «{otra pestaña}».».

### P3 · Recolección — `/recoleccion`

- **Título:** «Recolección». **Descripción:** «Órdenes por recolectar en tienda»
  (`app/(app)/recoleccion/page.tsx:43-44`). Sin KPI, sin chat.
- **Orden** (`app/(app)/recoleccion/_components/RecoleccionModule.tsx:209-315`):
  1. Encabezado de sección **«Por recolectar en tienda»** (`h2`) + conteo «1 paquete por recolectar
     en tienda.» / «{n} paquetes por recolectar en tienda.» + conmutador Mosaico / Detalle
     (`:68`, `:89-94`, `:211-228`).
  2. Aviso de bloqueo, o el disparador **«Recolectar en tienda»** (`EscanerModal`): tarjeta
     «Recolectar en tienda» / «Escanea o ingresa el número de guía», botón manual «Confirmar
     recolección», éxito «Guía {n} recolectada correctamente.», icono `Store` (`:234-268`).
  3. Lista L4 (carrusel o `<ul>` de tarjetas POS, **sin acciones**) (`:277-303`).
  4. Sección **«Recogidos en tienda hoy»** (`h2`) + conteo «1 paquete recogido en tienda hoy.» /
     «{n} paquetes recogidos en tienda hoy.» + su propio conmutador; lista L5 con pie «Recogido a las
     {hora}»; nota «Se muestran las {tope} más recientes de hoy.» si se recorta
     (`RecolectadasHoyLista.tsx:38-51`, `:94-169`).
- **Vacíos:** «No tienes órdenes por recolectar en tienda ahora mismo. Puedes escanear igual: si el
  maestro acaba de asignarte una, se confirmará aquí.» (la segunda frase no sale si está bloqueado)
  (`RecoleccionModule.tsx:71`, `:86-87`, `:273-276`); «Todavía no has recolectado ninguna orden hoy.
  Las que escanees aparecerán aquí.» (`RecolectadasHoyLista.tsx:42`).

### P4 · Cierre del día — `/cierre-dia`

- **Título:** «Cierre del día». **Descripción:** «Detalle de lo gestionado, totales por método de pago
  y solicitud de cierre» (`app/(app)/cierre-dia/page.tsx:60-61`).
- **Orden** (`app/(app)/cierre-dia/_components/CierreDiaModule.tsx:586-632`):
  1. **El cierre de la página** (`DetalleCierre` marco «pagina»): el de hoy en curso, o el
     rechazado/vencido que toca enviar, o el aviso de error.
  2. **«Cierres solicitados»** (`h2`) con la cola propia.
- **Detalle del cierre** (`components/private/cierres/detalle/DetalleCierre.tsx:271-365`), de arriba
  abajo:
  - cabecera: título **«Tu cierre del día»** + chip de estado («Sin solicitar» en el de hoy) +
    línea «{destino} · {folio o «Solicitud nueva»} · {fechas}», p. ej. «Hoy · sin solicitar»
    (`detalle-cierre-labels.ts:21-36`; `DetalleCierre.tsx:159-165`);
  - franjas de aviso (si aplican): «Motivo del rechazo:» ««…»» o «La bodega no indicó un motivo.»;
    «Tu cierre está bloqueado:» …; «Antes de cerrar:» … (`detalle-cierre-vista.ts:372-384`);
  - **KPI** (`CifrasCierre`, rejilla `grid-cols-2` en móvil, `CifrasCierre.tsx:79-97`): «Recaudado»
    (con los métodos de pago debajo), «Gestiones» (contexto «{n} entregas · {n} vuelven o con
    novedad»), **«Tu ganancia»** destacada (`border-brand/60 bg-brand-soft`, amarillo pálido)
    (`detalle-cierre-vista.ts:261-275`; `detalle-cierre-labels.ts:60-90`). Cifra 20 px (`sm:` 24 px)
    bold. Con 3 cajas en 2 columnas, la tercera queda sola en la segunda fila.
  - **pestañas** (subrayado, `gap-6`, sin envolver): en curso «Gestiones ({n})», «Rechazados por la
    tienda ({n})»; rechazado: «Corregir», «Gestiones ({n})», «Rechazados por la tienda ({n})»
    (`detalle-cierre-vista.ts:412-437`; `DetalleCierre.tsx:314-334`);
  - **pie pegajoso** abajo (`sticky bottom-0`): «Recaudado {monto} · {n} gestiones» + botón
    principal **«Solicitar cierre»** (en curso), **«Solicitar aprobación del cierre rechazado»**
    (+«Cerrar») o **«Solicitar aprobación del cierre vencido»** (`DetalleCierre.tsx:336-362`;
    `detalle-cierre-labels.ts:112-126`). Deshabilitado con su motivo en `title`.
- **Pestaña «Gestiones»** (T1, `components/private/cierres/fila/GestionesCierre.tsx:74-131`):
  pastillas «Filtrar por resultado»: «Todas ({n})», un resultado por pastilla, «Con señales ({n})»
  + **«Descargar»** (`Download`); caja «Órdenes del cierre» con cabecera de columnas **Guía ·
  Destinatario · Tienda · Resultado · Recibido · Ganancia · Señales** + columna de acciones
  (`fila-gestion-labels.ts:20-40`). Por fila: **«Devolver a gestión»** (`outline`, `sm`) y el
  desplegable (`ChevronDown`, 32 px) (`FilaGestion.tsx:216-246`). Al abrir: «Orden», «Producto»,
  «Dirección»; tarjetas **«Recibió el mensajero»** y **«Tu ganancia»** (el mensajero no ve el cobro
  a la tienda, `fila-gestion-vista.ts:351-366`); «Ver evidencia» (`FilaGestion.tsx:249-306`).
  Vacíos: «Este cierre no tiene gestiones.», «Ninguna gestión de este cierre tiene señales.».
  Debajo, si hay, «Pasaron a {Novedad interna}» (T3): «El corte del día las cerró sin gestión. No
  tienen dinero asociado.», columnas Guía · Destinatario · Tienda (`cierre-factura.tsx:1496-1512`).
- **Pestaña «Rechazados por la tienda»** (T2, `RechazosDeTiendaCierre.tsx:33-75`): nota «No son
  gestiones del mensajero y no suman a su pago.»; vacío «Este cierre no tiene paquetes rechazados por
  la tienda.»; con datos: «Separar {n} órdenes para devolución, sin escanearlas.», el efecto al
  aprobar, y columnas **Guía · Destinatario · Motivo · Tienda · Fecha del rechazo**. Sin acciones.
- **Pestaña «Corregir»** (T4, solo rechazado, `CorregirCierre.tsx:29-67`): «Cómo corregir» + «Si una
  gestión quedó mal, devuélvela a gestión: …» + «Envíalo hoy: si el corte de la noche llega antes, lo
  que corregiste pasa a un cierre nuevo.»; lista «Órdenes por volver a gestionar»: guía, remisión ·
  destinatario, badge «Ya la volviste a gestionar» / «Falta volver a gestionarla», botón
  **«Ir a Entregas»** (`outline`, `sm`) (`detalle-cierre-labels.ts:149-159`).
- **Cola «Cierres solicitados»** (T5, `components/private/cierres/cola/ColaCierres.tsx:263-330`):
  descripción «Tus cierres enviados a aprobación y cómo terminaron.»; pestaña única «Cierres
  solicitados ({n})»; barra de filtros (buscador «Busca por folio», «Fecha de solicitud», «Estado»)
  + «Descargar»; **tarjetas** «Ganancia pendiente de pago» y «Ganancia pagada este mes» (mismo
  `CifrasCierre`); tabla `DataTable` **Folio · Solicitado · Destino · Estado · Recaudado · Ganancia ·
  Pago · Acciones** con **«Ver»** por fila; paginación con primero/último y tamaño de página
  (`cola-propia-vista.ts:25-42`, `:65-76`, `:131-185`; `CierreDiaModule.tsx:611-627`). Vacíos: «Aún no
  has solicitado ningún cierre.», con filtros «Ningún cierre coincide con los filtros.»; error «No se
  pudieron cargar tus cierres solicitados.».
- **Diálogos** (`CierreDiaModule.tsx:634-704`):
  - **«Solicitar cierre del día»**: «Se agruparán todas tus gestiones pendientes en una solicitud de
    cierre. Esta acción no se puede deshacer.» + resumen (gestiones, recaudado, tu ganancia) +
    «Solicitar cierre».
  - **«Solicitar aprobación del cierre vencido»**: «Se enviará tu cierre vencido a tu bodega para
    aprobación. No se recalculan los montos ya registrados.» + «Solicitar aprobación».
  - **«Solicitar aprobación del cierre rechazado»**: «Se enviará de nuevo tu cierre rechazado a tu
    bodega para aprobación, con los totales de las gestiones que tenga al enviarlo.» (+ «Hay {n}
    órdenes que deshiciste y no volviste a gestionar: …») + «Solicitar aprobación» (`:169-193`).
  - **«Devolver la orden a gestión»**: «Orden {remisión} · {destinatario}. La gestión quedará anulada
    (queda el registro de quién la hizo y cuándo) y la orden volverá a tu lista para gestionar.» +
    «Devolver a gestión» (`:206-212`).
  - **Detalle de un cierre de la cola** («Ver»): el mismo `DetalleCierre` en marco modal, a pantalla
    casi completa en móvil (`h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)]`), solo lectura con «Cerrar»;
    si es rechazado, con «Corregir» y «Devolver a gestión» (`DetalleCierre.tsx:369-381`).
  - **Visor de evidencia** (`components/private/cierres/dialogos/VisorEvidencia.tsx`).
- **Error al leer el cierre que toca enviar:** «No se pudo cargar el cierre que tienes que enviar.
  Recarga la página.» + el botón de envío de su estado (`CierreDiaModule.tsx:509-527`).

### P5 · Ranking del día — `/ranking`

- **Título:** «Ranking». **Descripción:** «Ranking diario de mensajeros por entregas exitosas y premios
  del podio» (`app/(app)/ranking/page.tsx:43-44`). Solo lectura para el mensajero.
- **Orden:**
  1. **Podio** `RankingPodio` (`app/(app)/ranking/_components/RankingPodio.tsx:273-339`): tarjeta con
     «Ranking de mensajeros» (`Trophy`), «Efectividad · entregados / asignados · hoy», contador
     «{n} mensajeros»; podio en 3 columnas 2º-1º-3º (corona `Crown` sobre el 1º; avatar con
     iniciales; nombre; «{entregados}/{asignados} entregas»; pedestal con `Trophy`/`Medal`/`Award`,
     %, «{n}º lugar», premio si hay); lista del resto: lugar · nombre (+ chip **«Tú»** en su fila) ·
     «… entregas» · % (barra de progreso solo desde `sm`). Al mensajero se le recorta al **top 10** y,
     si quedó fuera, su fila se ancla al final bajo «Tu posición, fuera del top 10»
     (`ranking/page.tsx:13`, `:51-55`; `ranking-labels.ts:89-101`). Sin ocupante: «Sin ocupante».
  2. **«Ranking del día»** (T6, `RankingModule.tsx:94-130`): tarjeta con descripción «Ordenado por
     porcentaje de entregas exitosas del día. El conteo crudo (entregados / asignados) hace el
     porcentaje auditable.», tabla **Posición · Mensajero · % del día · Entregados / asignados** con
     «Descargar».
  3. **«Premios del podio»** (T7, `RankingModule.tsx:132-180`): «Tres posiciones del podio, cada una
     con un monto y una descripción opcionales.», tabla HTML **Posición · Mensajero · Monto del
     premio · Descripción** (textos vacíos «Sin ocupante elegible hoy», «Sin premio asignado», «Sin
     descripción», `ranking-labels.ts:62-78`).
- **Vacío:** «Todavía no hay mensajeros para mostrar hoy.» (`ranking-labels.ts:107`).

### P6 · Histórico del ranking — `/ranking/historico`

- **Título:** «Histórico del ranking». **Descripción:** «Resultado congelado del ranking diario de
  mensajeros. Es de solo lectura: no se recalcula ni se edita.»
  (`ranking/historico/_components/ranking-historico-labels.ts:69-71`).
- **Contenido** (`RankingHistoricoModule.tsx:128-194`): tarjeta con título «Ranking del día {fecha}»,
  «Generado el {fecha y hora}», selector **«Fecha del histórico»** (`<input type="date">`, `w-44`);
  tabla (T8) **Puesto · Posición · Mensajero · % del día · Entregado · Asignados · Premio** (el premio
  con su descripción debajo) + «Descargar» (`ranking-historico-labels.ts:26-35`).
- **Vacíos:** sin snapshot «No se generó el snapshot de esta fecha.» + «El histórico solo tiene los
  días que el congelado diario alcanzó a cerrar. Probá con otra fecha.» ⚠ voseo; sin actividad «Ese
  día no hubo actividad: ningún mensajero tuvo entregas ni asignaciones.» (`:76-80`). El texto «Ver
  el ranking de hoy» existe (`:81`) pero el módulo no lo pinta.

### P7 · Ayuda — `/ayuda` y `/ayuda/{documento}`

- **Título:** «Ayuda». **Descripción:** «Cómo funciona cada pantalla, explicado para tu trabajo.»
  (`app/(app)/ayuda/layout.tsx:43-44`). Una columna en móvil: índice arriba, documento debajo.
- **Índice** (`AyudaIndice.tsx:50-67`): buscador con `Search`, placeholder «Buscar…», lista de
  enlaces. Documentos del mensajero (`docs/ayuda/mensajero/*.md`): «Reparto», «Recoger en bodega»,
  «Recolección», «Ranking», «Cierre del día».
- **Sin documento elegido** (`ayuda/page.tsx:16-19`): «Elegí un tema del índice» / «Cada documento
  explica una pantalla: qué ves, qué podés hacer y qué no. También llegás a la ayuda de la pantalla
  en la que estés con el botón «?» del encabezado.» ⚠ voseo.
- **Documento** (`ayuda/[...slug]/page.tsx:57-90`): prosa `max-w-[72ch]`; pie «Actualizado el
  {fecha}», **«Volver al índice»** (`ArrowLeft`, solo `< lg`, `min-h-11` = 44 px) y «Siguiente:
  {título}» (`ArrowRight`). Ya cumple 44 px.

---

## 3. Componentes que se reusan (no inventar otros)

| Pieza | Componente | Ruta | Dónde ya se usa |
|---|---|---|---|
| Armazón de página | `AppPage` → `PageHeader` + `Container` | `components/shared/AppPage.tsx`, `PageHeader.tsx`, `Container.tsx` | todas |
| Menú | `Sidebar` sobre la primitiva `sidebar` (Sheet en móvil) | `app/(app)/_components/Sidebar.tsx`; `components/ui/sidebar.tsx` | todas |
| Tarjeta de orden, fila | `PosOrderCardDetalle` | `MA/pos-card/PosOrderCardDetalle.tsx` | Reparto, Recoger, Recolección |
| Tarjeta de orden, mosaico | `PosOrderCardMosaico` (+ `PosCardHeader`, `PosNavBlock`, `PosAmountRow`) | `MA/pos-card/` | ídem |
| Carrusel de tarjetas | `CarruselCards` | `components/shared/CarruselCards.tsx` | ídem |
| Conmutador Mosaico/Detalle | `VistaCardsToggle` | `MA/VistaCardsToggle.tsx` | ídem |
| Detalle de orden (3 bloques) | `AsignacionDetalle` | `MA/AsignacionDetalle.tsx` | panel y mosaico |
| Chip de estado con «i» | `EstadoConInfo`, `NotaAyudaConInfo` | (importados en las cards POS) | cards, panel, `FilaGestion` |
| Badge | `Badge` (`default`, `secondary`, `outline`, `success`, `warning`, `info`, `danger`, `destructive`) | `components/ui/badge.tsx` | cards, Corregir |
| Botón | `Button` (`xs` 24, `sm` 28, `default` 32, `lg` 36, `icon` 32, `icon-sm` 28 px) | `components/ui/button.tsx:107-119` | todas (**ninguno llega a 44 px**) |
| KPI del portal | `KpisMensajero` (+ `KpiValorAnimado`) | `MA/KpisMensajero.tsx` | Reparto |
| KPI de cierres | `CifrasCierre` | `components/private/cierres/detalle/CifrasCierre.tsx` | detalle del cierre y tarjetas de ganancia |
| Tabla | `DataTable` (una instancia; `renderExpanded`; `descarga`) | `components/shared/DataTable.tsx:369` | T5, T6, T8 |
| Columnas móviles sobre la misma tabla | `DetalleFilaComposicion` + `useIsMobile` (corte `max-width: 767px`) | `app/(app)/wallet/_components/DetalleFilaComposicion.tsx:203-253`; `hooks/use-mobile.ts` | wallet (precedente) |
| Fila de gestión | `GestionesCierre` / `FilaGestion` / `Cuenta` / `CalculoCobro` | `components/private/cierres/fila/`, `.../detalle/Cuenta.tsx` | T1 (también bodega y central) |
| Detalle del cierre | `DetalleCierre` (marco página o modal) | `components/private/cierres/detalle/DetalleCierre.tsx` | Cierre del día |
| Cola de cierres | `ColaCierres` + `TablaColaPropia` | `components/private/cierres/cola/` | T5 |
| Filtros / búsqueda | `BuscadorFiltros` + `FilterComponent` (pastillas) | `components/shared/BuscadorFiltros.tsx:214` | Gestiones, cola |
| Descarga | `DescargarDatasetButton` («Descargar») | `components/shared/DescargarDatasetButton.tsx:60`, `:158` | Gestiones, cola, ranking |
| Paginación | `Pagination` | `components/shared/Pagination.tsx:158` | cola |
| Escáner | `EscanerModal` + `EscanerGuiaCard` / `QrScanner` | `components/shared/EscanerModal.tsx`, `QrScanner.tsx` | Recoger, Recolección, panel |
| Modal de confirmación | `Modal` | `components/shared/Modal.tsx:139` | todos los diálogos |
| Vacío con icono | `EmptyState` | `components/shared/EmptyState.tsx:51` | ranking, ayuda |
| Podio + lista con «Tú» | `RankingPodio` | `app/(app)/ranking/_components/RankingPodio.tsx` | Ranking (patrón móvil ya hecho) |
| Pestañas | `Tabs` / `TabsList` / `TabsTrigger` | `components/ui/tabs` | Recoger, cierre, cola |

---

## 4. Tokens visuales que difieren de los globales

Globales (`app/globals.css`): fondo `#F7F7F5`, tarjeta `#fff`, texto `#111111`, borde `#e7e5e4`,
acento `#FFD000` / `#FFF8D9`, radio `0.625rem` (10 px, `:281`), Archivo y JetBrains Mono
(`app/layout.tsx:3-17`). Lo que estas pantallas usan además o distinto:

| Token / clase | Valor | Dónde |
|---|---|---|
| `--primary` y `brand` | **`#111111` (negro)**, no amarillo (`globals.css:173`, `:290`) | botón «Ir»/navegar de 44 px de la card, chat flotante, «Llamar», CTA «Gestionar esta orden», botón «Entregar» |
| `brand-light` / `--sidebar-primary` | `#FFD000` (`:176`, `:334`) | avatar del pie del menú, chip «Tú» del ranking |
| `brand-soft` = `--accent` | `#FFF8D9` (`:180`, `:296`) | círculo de los KPI de Reparto, caja «Tu ganancia», fila propia del ranking |
| `navy` / `navy-deep` | `#1C1C1A` / `#111111` (`:181-182`) | nº de parada, bloque de ubicación del mosaico, «Valor a cobrar», «Navegar» |
| `--sidebar` | `#1C1C1A`, texto `#C0C0BE` (`:332-333`) | drawer del menú |
| Tinte del encabezado del mensajero | `bg-success/10` (`success` = `#10b981`, `:194`) | `PageHeader.tsx:39` |
| `success-strong` | `#047857` (`:342`) | botón «Mensaje», chip «Entregado» |
| `warning-strong` / `warning-soft` | `#92400e` / `#fef3c7` (`:197`, `:346`) | título «Con ayuda solicitada», chip «Reprogramado», franja «Antes de cerrar» |
| `danger-strong` / `danger-soft` / `destructive` | `#b91c1c` / `#fee2e2` / `#ef4444` (`:199`, `:298`, `:347`) | avisos de bloqueo, «Ayuda», distintivo del chat |
| `info-strong` | `#1d4ed8` (`:348`) | «Ver cómo se calculó» |
| `hivis` | `#f4c500` (`:239`) | corona del 1º en el podio |
| `asfalto-*` | p. ej. `asfalto-1` `#e7e5e4` (`:184`) | escalón del 2º en el podio |
| Radios propios | cards POS `rounded-xl` (12 px); panel de gestión y sus botones `rounded-2xl` (16 px); KPI de cierre `rounded-xl` | cards y panel |
| Tamaños de letra pequeños | 9-11 px en chips y datos de la card POS (`text-[9px]`, `text-[10px]`, `text-[11px]`) | `PosOrderCardDetalle.tsx:111-189`, `PosOrderCardMosaico.tsx:103-158` |
| Monto en mono | `font-mono tabular-nums` (JetBrains Mono) | «COBRAR», guía, remisión |

Tema oscuro: existe (`globals.css:898+`, `--primary` pasa a `#FFD000`). El diseño de esta ficha puede
dibujarse solo en claro salvo que Carlos pida lo contrario.

---

## 5. Lo que no se pudo determinar leyendo el código

1. **Si el menú se cierra solo al tocar un enlace en móvil.** Ni `Sidebar.tsx` ni
   `components/ui/sidebar.tsx` llaman a `setOpenMobile(false)` al navegar; hay que comprobarlo en un
   teléfono.
2. **Medidas reales** a 360-414 px (desbordes, altura del podio, si las pestañas del detalle del cierre
   caben): son estimaciones por clases, como dice `requirements.md > Cómo verificar`.
3. **El texto exacto de `avisoBloqueo`** depende del estado del cierre (`lib/utils/bloqueo-cierre`); no se
   transcribió aquí.
4. **Los nombres de las pastillas de resultado** y de los estados de cierre salen de catálogos
   (`EstadoConInfo`, `estatusLabel`, `opcionesEstadoPropias`): son dinámicos; el diseño puede usar
   «Entregado», «Reprogramado», etc. como muestra.
5. **El contenido de las pantallas del chat** (`ChatOrdenesLista`, `ChatConversacion`) no se detalló:
   el chat está fuera del alcance de la ficha (`requirements.md > Alcance`).
