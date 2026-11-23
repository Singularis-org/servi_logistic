# SLT-155 «Evaluar el lector de código de barras en toda la app» — evaluación

> Entregable de la ficha (ruta ligera, evaluación; zona fullstack). No se cambió código.
> Leído desde el worktree `SLT-155-lector-codigo-barras` (base origin/dev, 2026-11-13).
> Lo que no se pudo comprobar sin navegador ni pistola va marcado **[verificar en dispositivo]**.

Pedido de Carlos: «Quiero que evaluemos y planeemos que en toda la app se pueda usar la pistola
lectora de código de barras, no sé si ya es compatible (esto donde aplique).»

Supuesto de trabajo: la pistola (USB o Bluetooth HID) actúa como **teclado** («keyboard wedge»):
escribe el contenido del código en el campo que tenga el foco, muy rápido, y normalmente termina
con Enter (sufijo configurable en la pistola).

---

## 1. Qué códigos imprime la app

Hay **un solo objeto con códigos: la etiqueta de guía**. Cada etiqueta lleva dos códigos con el
mismo dato (`num_guia`, entero positivo, UNIQUE en `orden`), pero **en formatos distintos**:

| Código | Contenido exacto | Dónde se genera |
|---|---|---|
| Código de barras 1D **CODE128** | `String(numGuia)` → solo dígitos, p. ej. `1024`. Sin prefijo, sin guiones, texto legible debajo (`displayValue`/`includetext`) | Navegador: `app/(app)/ordenes/_components/etiquetas-pdf.ts:38-50` (jsbarcode). Servidor/lote por API: `lib/pdf/etiquetas-pdf-lote.ts:43-53` (bwip-js) |
| **QR** | URL absoluta `<origin>/paquete/<numGuia>` (p. ej. `https://…/paquete/1024`) | `lib/utils/paquete-url.ts:35-38` (`buildPaqueteUrl`); servidor `lib/pdf/etiquetas-pdf-lote.ts:37-40,86` (qrcode); navegador desde el canvas de qrcode.react (`etiquetas-pdf.ts:96`) |

Origen del dato: `lib/services/EtiquetaGuiaService.ts:158-159` (`qrValue` y `barcodeValue` =
`String(numGuia)`); tipo en `lib/types/etiqueta-guia.ts:36-37`.

Qué NO lleva código: el folio del cierre (SLT-153 «Cabecera del detalle del cierre con rótulos y
folio buscable» lo hizo buscable como texto, no se imprime en barras), la remisión, el manifiesto y
los comprobantes. Los únicos generadores de barras/QR del repo son los dos de la etiqueta.

Consecuencias para la pistola:
- **El CODE128 es el código «amigo» de la pistola**: lo lee cualquier pistola (1D o 2D) y lo que
  teclea son dígitos, que salen igual en distribución de teclado US y latinoamericana.
- **El QR solo lo lee una pistola 2D (imager)** y lo que teclea es una URL. Con una pistola
  configurada en teclado US sobre un equipo con distribución latinoamericana, `:` y `/` pueden
  salir cambiados (p. ej. `Ñ`, `-`) **[verificar en dispositivo]**. Y una pistola 2D apuntada a la
  etiqueta lee el código que quede bajo el láser: puede ser cualquiera de los dos.

---

## 2. Dónde aplica: inventario de flujos

Patrón actual compartido: casi todas las superficies usan `EscanerModal`
(`components/shared/EscanerModal.tsx`) + `EscanerGuiaCard` (`components/shared/EscanerGuiaCard.tsx`),
que ofrece **dos caminos**: cámara (`QrScanner`, html5-qrcode) y número tecleado (un `<form>` con un
`<input inputMode="numeric">` y botón submit). La pistola usa el **camino tecleado**.

Hechos del componente compartido que valen para todas las superficies que lo usan:

- **Enter dispara la acción**: el input vive en un `<form onSubmit>` (`EscanerGuiaCard.tsx:118-123`),
  así que el Enter de la pistola equivale a pulsar el botón. Sí.
- **No se enfoca solo**: el input no tiene `autoFocus` (`EscanerGuiaCard.tsx:142-151`) y el Dialog
  no fija `initialFocus` (`EscanerModal.tsx:69-73`, `components/ui/dialog.tsx`). Con el defecto de
  Base UI el foco va al **primer elemento tabulable**, que es el botón «Escanear con cámara»
  (`QrScanner` se pinta antes que el formulario, `EscanerGuiaCard.tsx:100-106`). Si el operador
  dispara la pistola sin tocar el campo, los dígitos se pierden y **el Enter abre la cámara**
  **[verificar en dispositivo]**. Hoy hay que tocar/clicar el campo antes de cada sesión.
- **Pierde el foco tras cada lectura**: el input se deshabilita mientras `procesando`
  (`EscanerGuiaCard.tsx:147`); un input deshabilitado suelta el foco, así que la **segunda** guía
  ya no entra en el campo. Escanear varias seguidas exige volver a tocar el campo cada vez.
- **Si la lectura falla, el texto se queda**: `onSubmit` que devuelve `false` conserva el valor
  (`EscanerGuiaCard.tsx:72-78`). La lectura siguiente de la pistola se **concatena** (`1024` +
  `1025` = `10241025`) y falla también.
- **Formato aceptado por el camino tecleado: solo dígitos** (`/^\d+$/`). Lee bien el CODE128; el QR
  leído por una pistola 2D (una URL) se rechaza, y en varias superficies **sin ningún mensaje**.
- **Camino cámara: solo acepta la URL del QR** (`extractNumGuiaFromScan`, `lib/utils/paquete-url.ts:55-67`
  hace `new URL(texto)`). `QrScanner` arranca html5-qrcode sin `formatsToSupport`
  (`components/shared/QrScanner.tsx:92-107`), que por defecto decodifica también CODE128: si la
  cámara apunta al **código de barras** entrega `1024`, `new URL("1024")` falla y sale «Código
  inválido» **[verificar en dispositivo]**. Es el mismo problema de formato, del otro lado.
- **Sin feedback sonoro** en ninguna lectura; el visual es un toast + la línea «Guía N recibida»
  (`exito`). En la app ya existe audio reutilizable: `lib/audio/tono-notificacion.ts` y
  `lib/audio/preferencia-sonido.ts` (usados por `hooks/useTonoAlIncrementar.ts`).

### Inventario

| # | Flujo (quién) | Dónde | Enter dispara | Autoenfoque | Varias seguidas | Formato tecleado aceptado | PWA mensajero |
|---|---|---|---|---|---|---|---|
| 1 | Recepción en bodega central (bodega) | `app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx:121-142`, montado en `OrdenesListado.tsx:1408-1417` | Sí (form) | No | No (se deshabilita; sí limpia siempre, `return true` en :129) | Dígitos (`Number(valor)`, :123-127); URL → «Código inválido» con toast | No aplica |
| 2 | Recepción en origen / tienda — devoluciones que vuelven (tienda) | `app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx:120-146`, montado en `OrdenesListado.tsx:1414-1416` | Sí | No | No (se deshabilita; error deja texto) | Dígitos (:122); URL → toast «solo admite dígitos» | No aplica |
| 3 | Recepción en bodega satélite (satélite) | `app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx:131-161`; montado en `PorRecibirModule.tsx:76` y `RecepcionSateliteModule.tsx:478` | Sí | No | No (se deshabilita; error deja texto) | Dígitos (:134); URL → **rechazo mudo** | No aplica |
| 4 | Recolección en tienda (mensajero recolector) | `app/(app)/recoleccion/_components/RecoleccionModule.tsx:158,173-174,248-257` | Sí | No | No | Dígitos (:173); URL → rechazo mudo **[verificar el R11 de su spec]** | Sí (Bluetooth HID) con toque previo |
| 5 | Recogida en bodega (mensajero) | `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx:71-95`, montado en `RecogerModule.tsx:306` | Sí | No | No | Dígitos (:73); URL → **rechazo mudo** | Sí con toque previo |
| 6 | Verificar guía antes de gestionar en reparto (mensajero) | `app/(app)/mis-asignaciones/_components/VerificarGuiaGate.tsx:64-68,106-136`, montado en `GestionarOrdenPanel.tsx:1033` | Sí (form, botón «Gestionar») | No | No aplica (una guía) | Dígitos (:66); URL → **rechazo mudo** | Sí con toque previo |
| 7 | Confirmación física de un cierre (bodega, cierres-admin) | `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx:334-348,666-679`; `CierresAdminModule.tsx:1620` | Sí | No (vive en un modal propio, sin `EscanerModal`) | **Casi**: el input no se deshabilita (no pasa `procesando`); un aviso conserva el texto | Dígitos (:346); URL → aviso «ilegible» persistente | No aplica |
| 8 | Buscar una orden por guía en Órdenes (todos los roles con listado) | `app/(app)/ordenes/_components/OrdenesListado.tsx:1452-1458` → `components/shared/BuscadorFiltros.tsx:510-529`; servidor `lib/services/OrdenService.ts:170-179` (dígitos → ruta rápida exacta por `num_guia`) | No hace falta: busca con debounce al escribir; Enter no hace nada (no hay form) | No | No: la segunda lectura se **añade** al término anterior; hay que limpiar | Dígitos sí (búsqueda exacta); URL no encuentra nada | No aplica |
| 9 | Buscar en el listado de la satélite y demás listados con `BuscadorFiltros` (cierres-admin, cierre-dia, novedades…) | `recepcion-satelite/_components/SateliteOrdenesListado.tsx:714`, `cierres-admin/_components/FiltrosCierresBarra.tsx:390`, `cierre-dia/_components/FiltrosColaPropiaBarra.tsx:103`, `novedades/_components/NovedadesFiltrosBarra.tsx:69` | Igual que 8 | No | Igual que 8 | Dígitos se buscan como texto **[verificar si cada repositorio tiene ruta exacta por guía como Órdenes]** | `cierre-dia` sí |
| 10 | Asignar a mensajero / bodega / satélite, traspasar, deshacer, devolver a tienda | `ordenes/_components/AsignarBodegaModal.tsx:98`, `AsignarRecoleccionModal.tsx:63`, `TraspasarMensajeroModal.tsx:163`, `DevolverATiendaModal.tsx`, `recepcion-satelite/_components/AsignarSateliteModal.tsx:90` | — | — | — | **No hay entrada**: el lote se arma marcando filas de la tabla | — |

Fuera de alcance: el rastreo público de la landing (`app/_landing/RastreoDialog.tsx:247-271`) lo
usa el cliente final, no un operador con pistola; y la página `/paquete/<numGuia>`
(`app/paquete/[numGuia]/page.tsx`) existe para que una **cámara externa** abra la URL del QR.

Nº de flujos de operador evaluados: **10** (9 con campo donde se puede escanear, 1 sin entrada).

---

## 3. Qué ya es compatible y qué no

Leyendo el **código de barras CODE128** con una pistola con sufijo Enter:

| # | Flujo | Una lectura | Varias seguidas sin tocar la pantalla | Lee el QR (pistola 2D) | Veredicto |
|---|---|---|---|---|---|
| 1 | Recepción bodega central | Sí, tocando el campo antes | No | No | Funciona a medias |
| 2 | Recepción en origen/tienda | Sí, tocando el campo antes | No | No | Funciona a medias |
| 3 | Recepción satélite | Sí, tocando el campo antes | No | No (mudo) | Funciona a medias |
| 4 | Recolección en tienda (PWA) | Sí, tocando el campo antes | No | No | Funciona a medias |
| 5 | Recogida en bodega (PWA) | Sí, tocando el campo antes | No | No (mudo) | Funciona a medias |
| 6 | Verificar guía en reparto (PWA) | Sí, tocando el campo antes | No aplica | No (mudo) | Funciona (salvo foco) |
| 7 | Confirmación física de cierre | Sí, tocando el campo antes | Sí mientras no falle una lectura | No | El más cercano |
| 8 | Buscar en Órdenes | Sí, enfocando el buscador | No (concatena) | No | Funciona a medias |
| 9 | Otros buscadores | Como texto **[verificar]** | No (concatena) | No | Por verificar |
| 10 | Armar lotes para asignar/devolver | No hay campo | — | — | No compatible |

Resumen: **la app ya es «compatible» en lo mínimo** — en 8 de los 9 flujos con campo, una pistola
que lea el CODE128 y mande Enter hace la acción **si antes se toca el campo** (el 9 queda por
verificar). Ninguno sirve para **escaneo continuo** (el uso real de una pistola en bodega), ninguno
se enfoca solo, ninguno acepta el QR por pistola, y la cámara rechaza el código de barras. Lo que
falta no es soporte de hardware: es foco, limpieza y un formato de lectura único.

---

## 4. Propuesta

### 4.1 Patrón único

Dos piezas compartidas; las superficies no cambian de lógica de negocio (siguen llamando a sus
Server Actions de hoy):

1. **Una sola función de lectura de guía** (`lib/utils/paquete-url.ts`, junto a
   `extractNumGuiaFromScan`): recibe cualquier texto capturado —por cámara o por teclado— y
   devuelve `numGuia | null`. Acepta: dígitos (`1024`), la URL del QR (`…/paquete/1024`), con
   espacios, tabuladores o caracteres de control alrededor (prefijo/sufijo de la pistola). Rechaza
   todo lo demás con el mismo «Código inválido» **con mensaje**, nunca en silencio. Reemplaza los
   siete `/^\d+$/` y los siete `extractNumGuiaFromScan` sueltos (filas 1-7), y quita la distinción
   `MedioDeCaptura` del cierre (`cierre-confirmacion-fisica.tsx:39,343-348`). De paso, la cámara
   pasa a leer también el código de barras.
2. **Una entrada de escaneo** dentro de `EscanerGuiaCard` (hook `useEntradaEscaneo` o similar):
   - el campo **recibe el foco al abrir** el modal (`initialFocus` del Dialog al input, no al botón
     de cámara), sin tocar la decisión del 2026-07-31 de que el modal arranca cerrado;
   - el campo **no se deshabilita** mientras procesa (se bloquea el envío, `aria-busy`, no el
     `disabled`), así que **conserva el foco**; y vuelve a enfocarse tras cada resultado;
   - **se vacía siempre** después de una lectura de pistola (también si falla), y el último error
     queda visible en una línea persistente con la guía leída, para no concatenar;
   - detecta la **ráfaga** (caracteres a < ~30-50 ms entre sí) para distinguir pistola de tecleo
     humano: en ráfaga, Enter envía y limpia; tecleado a mano, se comporta como hoy;
   - **feedback**: tono corto distinto para acierto y error reutilizando `lib/audio/tono-notificacion.ts`
     y respetando `preferencia-sonido`; destello verde/rojo del campo; la línea `exito` ya existe.

Sobre esas dos piezas, el **modo escaneo continuo** en las recepciones: el modal no se cierra entre
guías y muestra el contador de la sesión («7 recibidas · 1 con error») y la lista de lo leído, con
aviso de guía repetida en la sesión.

No hace falta escuchar el teclado en toda la página (captura global): mete riesgo (atajos, campos de
otros formularios) y con el autoenfoque del modal no aporta. Se descarta salvo que Carlos lo pida.

### 4.2 Librerías

**No se propone ninguna.** La detección de ráfaga + Enter son unas decenas de líneas sobre
`keydown`/`input`; el sonido ya existe en el repo; la cámara ya tiene html5-qrcode. La librería
conocida para esto, `onscan.js`, por lo que sé no publica release desde hace años: fallaría el
check 2 de `docs/architecture.md > Dependencias de terceros` (release en los últimos 12 meses). No
se pudo verificar en red, así que cuenta como desconocido, no como sí; de todos modos no hace falta.

Nota aparte (no la abre esta ficha): `html5-qrcode` ya está instalada; si al tocar `QrScanner` se
quiere revisar su salud contra los cuatro checks, va como deuda, no aquí.

### 4.3 Fichas propuestas (en orden)

| Orden | Ficha (título corto) | Alcance | Zona | Complejidad | Ruta | Depende de |
|---|---|---|---|---|---|---|
| 1 | **Lectura de guía única: dígitos o URL, cámara o pistola** | Función única de lectura en `lib/utils/paquete-url.ts`; las 7 superficies (filas 1-7) la usan en los dos caminos; rechazo siempre con mensaje; la cámara acepta el CODE128. ~10 archivos de producción | frontend | low | ligera | — |
| 2 | **Entrada de escaneo para pistola en `EscanerGuiaCard`** | Autoenfoque al abrir, no deshabilitar el campo, limpiar y re-enfocar tras cada lectura, detección de ráfaga, tono y destello. Beneficia a las filas 1-7 sin tocarlas una a una (la 7 hereda el foco con su propio modal) | frontend | medium | ligera (comportamiento compartido; sin esquema ni permisos) | 1 |
| 3 | **Escaneo continuo en recepciones y recogidas** | Contador y lista de la sesión dentro del modal, aviso de repetida; filas 1-5. Es UI nueva dentro del modal: pasa por `/design` antes | frontend | medium | completa | 2 |
| 4 | **Buscar por escaneo en los listados** | En `BuscadorFiltros`, una ráfaga + Enter **reemplaza** el término (no lo añade) y busca sin esperar el debounce; un atajo para enfocar el buscador. Verificar la fila 9 (ruta exacta por guía fuera de Órdenes) | frontend | low | ligera | 1 |
| 5 | **Armar el lote por escaneo para asignar o devolver** (opcional) | En Órdenes y en la satélite, escanear guías marca las filas (aunque estén en otra página) y abre el modal de asignar/traspasar/devolver con ese lote. Hay que resolver guía→orden fuera de la página visible | fullstack | high | completa (+ `/design`) | 2, 4 |

Con 1 + 2 la pistola queda **operativa en todos los flujos de captura** (incluida la PWA del
mensajero por Bluetooth). La 3 es la que convierte la pistola en ganancia real en bodega. La 5 solo
si Carlos ve que asignar marcando filas es un cuello de botella.

---

## 5. Preguntas para Carlos

1. **¿Qué pistola usan o van a comprar, y cómo está configurada?** ¿1D (solo barras) o 2D (lee
   también QR)? ¿Manda Enter al final? ¿Teclado US o latinoamericano?
   *Recomendación:* 2D, sufijo Enter, sin prefijo. Con la ficha 1 da igual qué código lea, pero el
   Enter sí hace falta (sin él cada lectura necesita un clic en «Recibir»).
2. **¿La pistola se usa también en el teléfono del mensajero (Bluetooth), o solo en bodega y
   tienda?** Cambia la prioridad de las filas 4-6.
   *Recomendación:* empezar por bodega/tienda (filas 1-3 y 7); en la PWA la cámara ya cubre el caso
   y las fichas 1-2 la dejan funcionando igual por si alguien conecta una pistola.
3. **¿Interesa la ficha 5 (armar lotes de asignación escaneando)?**
   *Recomendación:* dejarla para después de usar la 3 unas semanas en bodega y decidir con el uso
   real.

## Pendiente de verificar en dispositivo (lo hace la ficha 1 o 2, no hace falta Carlos)

- Que el foco inicial del modal cae en el botón de cámara y que el Enter de la pistola lo activa.
- Que html5-qrcode, sin `formatsToSupport`, decodifica el CODE128 de la etiqueta y hoy termina en
  «Código inválido».
- Cómo teclea la URL del QR una pistola 2D con distribución de teclado distinta a la del equipo.
