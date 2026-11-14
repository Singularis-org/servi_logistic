# SLT-155 «Evaluar el lector de código de barras en toda la app» — brief de diseño

> Insumo para `/design`. Cubre **toda la app para bodega y tienda**: dónde se escribe o se busca
> una guía, cómo es hoy el escáner de cámara y cómo conviven cámara y pistola en una sola entrada.
> Leído del worktree `SLT-155-lector-codigo-barras` (base origin/dev, 2026-11-13). Sin código.
> Complementa `evaluacion.md` (mismo directorio); lo no comprobable sin navegador o pistola va
> marcado **[verificar en dispositivo]**, y lo no comprobable leyendo, **[verificar]**.

Pedido de Carlos (2026-11-13): «todo lugar donde puedan usar la pistola, por ejemplo los buscadores
de la app para buscar órdenes, pero conviviendo con el escáner que ya tenemos, que es con cámara
para los QR». Decisiones ya tomadas (`progress/features/SLT-155.md`): pistola 2D con sufijo Enter;
uso en bodega y tienda, no en el móvil del mensajero por ahora.

Fichas que salen de aquí: SLT-157 «Guía única leída por cámara o pistola», SLT-158 «Entrada de
escaneo para pistola», SLT-159 «Escaneo continuo en recepciones y recogidas», SLT-160 «Buscar
escaneando en los listados».

Roles (`lib/auth/rol-label.ts:9-19`): **no existe un rol «operador de bodega»**. Bodega central =
`maestro` y `admin`; bodega satélite = `adminSatelite`; tienda = `adminTienda`.

---

## 1. El escáner de cámara de hoy

Tres piezas compartidas, una dentro de otra:

| Pieza | Archivo | Qué es |
|---|---|---|
| `EscanerModal` | `components/shared/EscanerModal.tsx:53-82` | Botón disparador + `Dialog`. Arranca **siempre cerrado** (decisión del humano 2026-07-31, `:27-30`); el contenido se monta al abrir y se desmonta al cerrar para apagar la cámara (`:21-25`). |
| `EscanerGuiaCard` | `components/shared/EscanerGuiaCard.tsx:57-176` | Tarjeta con **dos caminos**: cámara (`QrScanner`) y número tecleado (`<form>`). No sabe de dominio. |
| `QrScanner` | `components/shared/QrScanner.tsx:42-250` | Botón de cámara + visor html5-qrcode + error de permisos. |

### 1.1 Cómo se abre

- **Disparador** (`EscanerModal.tsx:63-66`): `Button variant="outline"` con icono `ScanLine` y el
  texto del `label`; por defecto **«Recibir paquete»** (`:41`). Al lado contrario, acciones opcionales
  (`:67`; en Órdenes de tienda, la carga masiva, `OrdenesListado.tsx:1409`).
- **Diálogo** (`EscanerModal.tsx:69-79`): `max-h-[90dvh] max-w-md`, sin superficie propia (la tarjeta
  es la superficie), título solo para lector de pantalla (`:76`), cierre con la «X» del Dialog.
- **Foco al abrir**: no se fija; va al primer tabulable, que es el botón de cámara (ver 1.2).
  **[verificar en dispositivo]** (`evaluacion.md` §2).

### 1.2 Qué muestra la tarjeta (de arriba abajo)

1. Encabezado (`EscanerGuiaCard.tsx:88-98`): icono en recuadro (`Package` por defecto, `:65`), título
   y descripción de la superficie.
2. **Botón de cámara** (`QrScanner.tsx:145-175`): recuadro discontinuo a todo el ancho, icono
   `Camera` en círculo, textos **«Escanear con cámara»** y **«Apunta al código de la guía»**
   (`:167-172`); `aria-label="Escanear con cámara"` (`:151`). Va **antes** del campo
   (`EscanerGuiaCard.tsx:100-106`).
3. Separador **«o ingresa manualmente»** (`EscanerGuiaCard.tsx:110-116`).
4. Formulario (`:118-163`): etiqueta **«Número de guía»** (`:130`), `<input inputMode="numeric">` con
   placeholder **«Ej. 1024»** (`:142-151`) y botón submit de ancho completo debajo (`:152-160`) con el
   texto de cada superficie. El campo se **deshabilita** mientras `procesando` (`:147`).
5. Línea de éxito persistente con `CheckCircle2` (`:167-`), p. ej. «Guía **1024** recibida correctamente.».

### 1.3 El visor (cámara abierta)

- `QrScanner.tsx:178-248`: caja negra a la altura del vídeo; región `aria-label="Visor de cámara QR"`
  (`:193`).
- Mientras arranca: overlay con spinner y **«Iniciando cámara…»** (`:197-204`).
- Marco de enfoque cuadrado (`:209-225`): 70 % del lado corto del visor (`:15`, `:22-25`), cuatro
  esquinas en color primario, máscara oscura alrededor y una **línea de barrido animada** (`:224`).
- Pie: icono `ScanLine` + **«Buscando código…»** (`:231-234`) y botón **«Cerrar cámara»** (`:235-246`).
- Cámara trasera (`facingMode: "environment"`, `:95`), 10 fps (`:97`).

### 1.4 Qué lee y qué pasa al leer

- **Lee**: html5-qrcode sin `formatsToSupport` (`:94-115`), así que decodifica QR y también códigos de
  barras **[verificar en dispositivo]**. Pero todas las superficies interpretan el resultado con
  `extractNumGuiaFromScan` (`lib/utils/paquete-url.ts:55-67`), que **solo acepta la URL del QR**
  (`<origin>/paquete/<numGuia>`): si la cámara lee el CODE128 (`1024`), sale «Código inválido».
- **Al leer**: entrega **una sola vez** (pestillo `entregado`, `:82`, `:108-113`), **cierra la cámara**
  y llama a `onDecoded`. Para la siguiente guía hay que volver a pulsar «Escanear con cámara».
- **Errores**: sin permiso o sin cámara → toast de error con el mensaje de la superficie (todas pasan
  **«No se pudo abrir la cámara.»**; el por defecto es «No se pudo acceder a la cámara. Debes habilitar
  los permisos de cámara en la configuración del navegador para usar esta función.», `:9-10`,
  `:118-123`). Código no reconocido → toast **«Código inválido.»** de la superficie.
- Mientras la superficie procesa, el botón de cámara se deshabilita (`:145`, `:153`).

### 1.5 Dónde está la cámara hoy (bodega y tienda)

| # | Pantalla | Rol | Disparador | Título / descripción de la tarjeta | Botón | Acción |
|---|---|---|---|---|---|---|
| C1 | `/ordenes` | maestro, admin | «Recibir paquete» | «Recibir paquete» / «Escanea o ingresa el número de guía» (`EscanerRecepcionBodegaCentral.tsx:134-152`) | «Recibir» | `recibirEnBodegaCentralPorQr` (`:89`) |
| C2 | `/ordenes` | adminTienda | «Recibir paquete» (label por defecto; **no coincide** con el título) | «Recibir en tienda» / «Escanea el código de la guía devuelta o ingresa su número» (`EscanerRecepcionOrigen.tsx:140-158`) | «Recibir en tienda» | `recibirEnOrigenPorQr` (`:90`, `:130`) |
| C3 | `/recepcion-satelite/por-recibir` | adminSatelite | «Recibir paquete» | «Recibir paquete» / «Escanea o ingresa el número de guía» (`recepcion-satelite/_components/EscanerRecepcion.tsx:153-171`), montado en `PorRecibirModule.tsx:76` | «Recibir» | `recibirPorQr` (`:105`, `:138`) |
| C4 | `/recepcion-satelite/en-bodega` | adminSatelite | idem C3 | idem C3, montado en `RecepcionSateliteModule.tsx:477-478` | «Recibir» | idem C3 |
| C5 | `/cierres-admin` → aprobar un cierre con paquetes que vuelven | maestro, admin; adminSatelite **[verificar]** | Sin disparador propio: se abre en el `Modal` «Confirmar los paquetes que vuelven» al pedir la aprobación (`CierresAdminModule.tsx:1013-1017`, `:1590-1623`) | «Confirmar paquete recibido» / «Escanea el código de la guía o escribe su número» (`cierre-confirmacion-fisica.tsx:50-51`, `:666-689`), icono `PackageCheck` | «Confirmar» | Marca la fila del cierre en cliente (`interpretarLectura`, `:334-`) |

Textos de resultado (toasts) de C1-C4: éxito «Guía N recibida en bodega central.» / «Guía N recibida;
queda por devolver a la tienda.» (`EscanerRecepcionBodegaCentral.tsx:46-50`), «Guía N recibida en
tienda.» (`EscanerRecepcionOrigen.tsx:39`), «Guía N recibida.» (`EscanerRecepcion.tsx:49`); repetida
«La guía N ya estaba recibida.» (info); errores «Orden no encontrada.», «Código inválido.», «Esta
orden es de otra tienda.» (C2, `:48`), «Esta orden pertenece a otra zona.» (C3/C4, `:58`), «No se
puede recibir: la orden está en "<estado>".», «No tienes permiso para recibir órdenes.», «Tu sesión
expiró. Inicia sesión de nuevo.», «La orden cambió de estado. Vuelve a intentar./escanear.».

C5 no usa toasts: barra fija arriba con progreso (`role="status"`), faltantes y un **aviso persistente**
(`role="alert"`) (`cierre-confirmacion-fisica.tsx:612-641`): «No se pudo leer un número de guía en ese
código. Escanea de nuevo o escribe el número.» (`:118-119`), «Esa guía no pertenece a este cierre.»
(`:121`). Es lo más parecido a un escaneo continuo que hay hoy.

Diferencias del camino tecleado entre superficies (el mismo campo, tres reglas): C1 acepta lo que
`Number()` convierta a entero positivo y **siempre limpia** (`EscanerRecepcionBodegaCentral.tsx:121-131`);
C2 exige dígitos con toast «El número de guía solo admite dígitos.» y conserva el texto si falla
(`EscanerRecepcionOrigen.tsx:120-137`); C3/C4 rechazan lo no numérico **sin mensaje**
(`EscanerRecepcion.tsx:134`); C5 distingue medio `camara`/`manual` (`cierre-confirmacion-fisica.tsx:343-348`).

---

## 2. Todos los lugares donde bodega y tienda escriben o buscan una guía

Búsqueda: `BuscadorFiltros` (`components/shared/BuscadorFiltros.tsx`) es el buscador de **todos** los
listados. Su campo es un `Input type="search"` **fuera de cualquier `<form>`** y sin `onKeyDown`
(`:510-529`): **Enter no hace nada**; busca solo, con debounce de 500 ms (`DEBOUNCE_MS_DEFAULT`,
`components/shared/FilterComponent.tsx:166`) y desde `minChars`. Tiene «X» de limpiar (`:530-542`).
Ninguno tiene cámara. No hay **buscador global** en la app (sin `cmdk`/command palette; búsqueda en
todo el repo).

### 2.1 Entradas de flujo (ejecutan una acción sobre la guía)

Son C1-C5 de la tabla 1.5. Todas: `EscanerGuiaCard`, **con cámara**, Enter envía (es un `<form>`),
sin autoenfoque, el campo se deshabilita al procesar salvo C5.

### 2.2 Buscadores de listados

| # | Pantalla | Rol (`lib/auth/menu-visibility.ts`) | Componente | Placeholder (texto exacto) | Qué hace con una guía | Cámara | Enter |
|---|---|---|---|---|---|---|---|
| B1 | `/ordenes` | maestro, admin, adminTienda (`:406-409`) | `BuscadorFiltros` en `OrdenesListado.tsx:1452-1464` | «Guía, remisión, teléfono, destinatario o producto» (`ordenes-filtros-def.ts:163`), mín. 3 (`lib/types/orden.ts:130`) | Solo dígitos → **ruta exacta** por `num_guia` con fallback (`lib/services/OrdenService.ts:170-183`) | No | Nada |
| B2 | `/recepcion-satelite/en-bodega` | adminSatelite (`:484-490`) | `BuscadorFiltros` en `SateliteOrdenesListado.tsx:714-724` | el mismo de B1 | **Sin ruta exacta**: busca por contención en la columna de búsqueda, que incluye la guía (`lib/utils/filtros-listado-ordenes.ts:90-101`); `1024` también trae `10245` **[verificar]** | No | Nada |
| B3 | `/novedades` | adminTienda (`:498-501`) | `BuscadorFiltros` en `NovedadesFiltrosBarra.tsx:69-77` | «Guía, remisión, teléfono, destinatario o producto» (`novedades-filtros.ts:77-78`), mín. 0 (`:90`) | Coincidencia exacta o por texto **[verificar]** | No | Nada |
| B4 | `/historico/conversaciones` | maestro, admin (`:260-263`, `:680-685`) | `BuscadorFiltros` en `HistoricoFiltrosBar.tsx:137-140` + filtro de texto «Orden» | Buscador: «Destinatario, teléfono, guía, remisión o mensajero» (`historico-filtros-def.ts:43`); filtro «Orden»: «Número exacto de guía o remisión» (`:49`, `:110-114`) | Filtro «Orden»: dígitos → exacto (`HistoricoConversacionesRepository.ts:215`) | No | Nada **[verificar el filtro `text` de `FilterComponent`]** |
| B5 | `/historico/acciones` | maestro (`:312`, `:687-689`) | `BuscadorFiltros` en `HistorialAccionesFiltrosBar.tsx:132-135` | «Persona, guía, remisión o nombre de lo afectado» (`historial-acciones-filtros-def.ts:83`) | Por texto **[verificar]** | No | Nada |
| B6 | `/wallet` (Caja principal) | maestro, admin (`:536-541`) | `BuscadorFiltros` en `LibroCajaBarra.tsx:143-146` | «Buscar por guía, remisión, descripción, nombre o referencia anotada, o quién registró» (`libro-caja-labels.ts:81-82`) | Por texto **[verificar]** | No | Nada |
| B7 | `/wallet/tiendas/[id]`, `/wallet/mensajeros/[id]` (estado de cuenta) | maestro, admin | `BuscadorFiltros` en `components/shared/estado-cuenta/EstadoCuenta.tsx:761-765`, montado en `EstadoCuentaTienda.tsx:60`, `EstadoCuentaMensajero.tsx:53` | vista oficina: «Buscar por guía, remisión, descripción o quién registró» (`estado-cuenta-labels.ts:183`) **[verificar qué vista usa cada montaje]** | Por texto **[verificar]** | No | Nada |
| B8 | `/mi-wallet` | adminTienda (`:280`, `:575-578`) | `EstadoCuenta` vía `MiEstadoCuenta.tsx:122` | vista tienda: «Buscar por guía, remisión o descripción» (`estado-cuenta-labels.ts:184`) | Por texto **[verificar]** | No | Nada |
| B9 | `/cierres-admin` (listado) | maestro, admin, adminSatelite (`:637-640`) | `BuscadorFiltros` en `FiltrosCierresBarra.tsx:390-404` | «Usa los filtros para acotar los cierres» | **Inerte a propósito**: «un cierre no se busca escribiendo» (`:69-72`); `onChange={SIN_BUSQUEDA}` | No | Nada |

### 2.3 Lo que se revisó y NO lleva guía (fuera del patrón)

- Asignar a mensajero/bodega/satélite, traspasar, devolver a tienda: **no hay campo**; el lote se marca
  en la tabla (`evaluacion.md` §2, fila 10). Es la ficha 5 pospuesta.
- Gestiones de un cierre: barra sin buscador (`components/private/cierres/fila/GestionesCierre.tsx:77`,
  `buscador={false}`), solo pastillas de resultado.
- `/monitoreo` filtra por **nombre de mensajero** («Buscar mensajero…», `TableroDiaControles.tsx:29-30`,
  `:59-66`); `/wallet/tiendas` busca por tienda (`estado-cuenta-tienda-labels.ts:50-53`);
  `/wallet/mensajeros` «Buscar por nombre» (`CuentasPorPagarTable.tsx:107`); `/wallet/satelites` vista
  bodega «Buscar por descripción o quién registró» (`estado-cuenta-labels.ts:185`); `FiltrosEntregas`
  busca secciones (`app/(app)/_components/FiltrosEntregas.tsx:41`); usuarios (`UsuariosModule.tsx:488`).
- `/incidentes`, `/mi-bodega`, `/dashboard`: sin buscador de texto.
- No hay página de detalle de orden en `(app)`; la única ruta por guía es `/paquete/[numGuia]`, para que
  una **cámara externa** abra la URL del QR.
- Mensajero (fuera de alcance por la decisión de Carlos, pero usan las mismas piezas): «Recoger paquete»
  (`RecogerPaqueteCard.tsx:86-95`), «Recolectar en tienda» (`RecoleccionModule.tsx:248-257`; la hace el
  mensajero en la tienda, no el adminTienda), verificar guía antes de gestionar (`VerificarGuiaGate.tsx:101-136`)
  y su cola del cierre (`cierre-dia/_components/FiltrosColaPropiaBarra.tsx:103`). Heredarán lo que se haga
  en las piezas compartidas.

### 2.4 Cuenta por rol

| Rol | Entradas de flujo | Buscadores con guía | Total | Con cámara hoy |
|---|---|---|---|---|
| maestro | C1, C5 | B1, B4, B5, B6, B7 (+ B9 inerte) | 7 (+1) | 2 |
| admin | C1, C5 | B1, B4, B6, B7 (+ B9 inerte) | 6 (+1) | 2 |
| adminSatelite | C3, C4, C5 **[verificar]** | B2 (+ B9 inerte) | 4 (+1) | 3 |
| adminTienda | C2 | B1, B3, B8 | 4 | 1 |

Lugares distintos: **14** (5 entradas de flujo + 9 buscadores, uno inerte). **Con cámara hoy: 5**, todos
entradas de flujo; **ningún buscador**.

---

## 3. Componentes existentes que el patrón debe reusar

| Pieza | Dónde | Para qué en el patrón |
|---|---|---|
| `QrScanner` | `components/shared/QrScanner.tsx` | El visor de cámara, tal cual (marco, barrido, permisos, apagado al desmontar). No crear otro. |
| `EscanerModal` | `components/shared/EscanerModal.tsx` | El Dialog que monta/desmonta la cámara; sigue arrancando cerrado. |
| `EscanerGuiaCard` | `components/shared/EscanerGuiaCard.tsx` | La tarjeta de los flujos C1-C5; el cambio de orden (campo primero) y de foco se hace aquí una vez. |
| `BuscadorFiltros` | `components/shared/BuscadorFiltros.tsx` | El buscador de B1-B8; el botón de cámara y el Enter se añaden aquí una vez, con una prop para encenderlo. |
| `Input`, `Button` | `components/ui/input`, `components/ui/button` | El campo y los botones (icono `size="icon"`/`"icon-xs"`, como la «X» de `BuscadorFiltros.tsx:531-541`). |
| `Dialog` | `components/ui/dialog` | Visor de cámara desde un buscador. |
| `useToast` | `hooks/useToast.ts:14` | Resultado de cada acción (ya lo usan C1-C4). |
| Tono | `lib/audio/tono-notificacion.ts:89` (`prepararAudio`), `:107` (`reproducirTono`); preferencia `lib/audio/preferencia-sonido.ts:25`; hook `hooks/useTonoAlIncrementar.ts:34` | Pitido de acierto/error respetando la preferencia de sonido. Hoy hay **un** tono; acierto y error distintos requieren uno nuevo en el mismo módulo. |
| Línea de éxito / aviso persistente | `EscanerGuiaCard.tsx:167-` (`exito`); aviso `role="alert"` de `cierre-confirmacion-fisica.tsx:634-641` | Último resultado visible sin depender del toast. |
| Lectura de guía | `lib/utils/paquete-url.ts:55-67` (`extractNumGuiaFromScan`) | Se amplía en SLT-157 a dígitos **o** URL; todo pasa por ahí. |
| Precedente de orden «campo primero, cámara debajo» | `VerificarGuiaGate.tsx:106-136` | Ya existe en la app (mensajero): input + botón en fila y `QrScanner` debajo. |

Iconos lucide ya en uso: `Camera` (`QrScanner.tsx:164`), `ScanLine` (`EscanerModal.tsx:64`), `Search`
(`BuscadorFiltros.tsx:506`), `PackageCheck`, `Package`, `Store`.

---

## 4. Propuesta de convivencia cámara + pistola

### 4.1 La regla común

**Una sola entrada por lugar**: el campo de texto es el receptor de la pistola (la pistola teclea en
él y manda Enter) y lleva **al lado un botón de cámara** (icono `Camera`, `aria-label="Escanear con
cámara"`) que abre el visor existente (`QrScanner`). Lo que llega por cualquiera de los dos caminos
pasa por **la misma lectura** (SLT-157 «Guía única leída por cámara o pistola»): acepta dígitos del
CODE128 (`1024`) o la URL del QR (`…/paquete/1024`) y devuelve el número; lo demás se rechaza **siempre
con mensaje**. Así:

- la pistola puede leer cualquiera de los dos códigos de la etiqueta;
- la cámara deja de rechazar el código de barras;
- lo que se ve en el campo tras una lectura es **el número de guía**, no la URL.

Comportamiento de pistola (SLT-158 «Entrada de escaneo para pistola»): ráfaga de caracteres + Enter
= lectura de pistola; tras cada lectura el campo **se vacía y vuelve a tener el foco**, nunca se
deshabilita (se bloquea el envío, no el campo); feedback con destello del campo y tono (si el sonido
está activado). El tecleo humano sigue funcionando igual que hoy.

### 4.2 Las tres variantes

| | (a) Buscador de un listado — **busca** | (b) Entrada de un flujo de una guía — **ejecuta** | (c) Flujo de muchas guías seguidas — **escaneo continuo** |
|---|---|---|---|
| Dónde | B1-B8 (`BuscadorFiltros`), SLT-160 «Buscar escaneando en los listados» | C1-C4 con escaneo esporádico; C5 una a una | C1-C4 en tanda, C5 (SLT-159 «Escaneo continuo en recepciones y recogidas») |
| Campo | El buscador de hoy, con el botón de cámara dentro del campo a la derecha (junto a la «X») | En la tarjeta, **arriba** y con autoenfoque al abrir; botón de acción debajo como hoy | Igual que (b), fijo arriba del modal |
| Botón de cámara | Abre el visor en un `Dialog`; al leer, cierra y pone la guía en el buscador | Despliega `QrScanner` bajo el campo (deja de ser el bloque grande que va primero) | Igual que (b); decidir si la cámara queda abierta entre lecturas (hoy se cierra tras cada una, `QrScanner.tsx:108-113`) |
| Enter (pistola) | **Reemplaza** el término (no lo concatena) y busca **ya**, sin esperar el debounce ni `minChars` | Ejecuta la acción (Recibir / Recibir en tienda / Confirmar) | Ejecuta, limpia, re-enfoca y suma a la lista |
| Resultado | El listado filtrado; con ruta exacta solo en B1 (en B2-B8 trae parecidos, ver 2.2) | Toast + línea de último resultado | Contador de la sesión («7 recibidas · 1 con error»), lista de lo leído y aviso de repetida; el error queda persistente como en C5 |
| Foco por defecto | **No** autoenfocar al entrar (competiría con los filtros); atajo de teclado para enfocar **[decidir]** | Sí, al abrir el modal | Sí, y se recupera tras cada lectura |

### 4.3 Móvil (tienda con el teléfono) vs escritorio (bodega con pistola)

| | Móvil | Escritorio |
|---|---|---|
| Entrada principal | **Cámara**. El botón de cámara debe ser grande y visible; el campo es el respaldo para teclear | **Pistola**. El campo manda; el botón de cámara es secundario (webcam rara vez) |
| Autoenfoque | Evitarlo: con `inputMode="numeric"` (`EscanerGuiaCard.tsx:144`) abre el teclado y tapa el visor. Proponer autoenfoque solo con puntero fino **[verificar en dispositivo]** | Siempre en (b) y (c) |
| Pistola Bluetooth en el teléfono | Funciona como teclado si el campo tiene foco; puede ocultar el teclado en pantalla o no según el SO **[verificar en dispositivo]** | — |
| Ancho | Buscador con mínimo de 250 px (`BuscadorFiltros.tsx:500-505`): el icono de cámara debe caber sin recortar la guía | Sin restricción |
| Tras leer con cámara | Cierra el visor y muestra el resultado (hoy) | Igual |

### 4.4 Lo que el diseño anterior no cubría y debe mostrar `/design`

1. El buscador de Órdenes (B1) con el icono de cámara y el estado «escaneado» (término reemplazado,
   búsqueda inmediata).
2. La tarjeta de flujo con el **campo primero** y la cámara como botón secundario, en escritorio y en
   móvil (C1/C2, que comparten modal en `/ordenes`).
3. El modal de escaneo continuo (SLT-159) con cámara abierta y con pistola.
4. Los estados comunes: escuchando (foco), leyendo, acierto, error persistente, repetida, cámara sin
   permiso.

---

## 5. Lo que queda por determinar

- Si `adminSatelite` ve y usa la confirmación física de un cierre (C5) **[verificar]**.
- Cómo resuelven una guía los buscadores B3, B5-B8 en servidor (exacto o por texto) **[verificar]**.
- Qué vista (`oficina`/`tienda`) monta cada `EstadoCuenta` de B7 **[verificar]**.
- Si el filtro de texto «Orden» de B4 (`FilterComponent`, `kind: "text"`) hace algo con Enter **[verificar]**.
- Si la cámara de html5-qrcode lee de verdad el CODE128 impreso y con qué tasa de acierto **[verificar en dispositivo]**.
- Con qué foco abre hoy el Dialog (Base UI) y si el Enter de la pistola abre la cámara **[verificar en dispositivo]**.
- Decisiones de producto para Carlos: atajo para enfocar el buscador (a); cámara abierta entre lecturas en
  el escaneo continuo (c); si el disparador de tienda pasa a decir «Recibir en tienda» como su tarjeta (C2).
