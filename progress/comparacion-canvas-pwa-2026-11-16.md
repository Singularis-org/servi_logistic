# Comparación canvas actual ↔ PWA del mensajero implementada

Fecha: 2026-11-16 · rama `dev` (825ba66d) · solo lectura.
Canvas: `scratchpad/canvas-slt156/project/*.dc.html` + `canvas.json` (notas «Diseño final» 1-13), tratado como diseño de referencia.
Transcripción comparada: `specs/SLT-156-pwa-mensajero-tablas/design.md` y `requirements.md` (R490-R544), y las decisiones de `progress/features/SLT-16{3,4,5,6}.md`.

Fichas: SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (base común), SLT-163 «PWA del mensajero: Reparto en el móvil», SLT-164 «PWA del mensajero: Recoger en bodega y Recolección», SLT-165 «PWA del mensajero: Cierre del día en tarjetas», SLT-166 «PWA del mensajero: mapa de ruta». Ranking e Histórico fuera de alcance.

Severidad: **alta** = dato o acción que falta o sobra · **media** = texto u orden/posición distinto · **baja** = espaciado, tamaño o estilo.
Origen:
- **Transcripción**: `design.md`/`requirements.md` no lo recogen o lo fijan distinto del canvas; la hija siguió el spec.
- **Implementación**: el spec sí lo recogía como el canvas y el código se apartó (con o sin desviación aceptada).
- **No determinable**: el spec dice otra cosa y sin la v35 no se puede saber si fue error de transcripción o cambio posterior del canvas.

## Resumen

| Ficha | alta | media | baja | total |
|---|---|---|---|---|
| SLT-163 Reparto | 2 | 5 | 3 | 10 |
| SLT-166 Mapa | 1 | 5 | 2 | 8 |
| SLT-164 Recoger / Recolección | 1 | 4 | 2 | 7 |
| SLT-165 Cierre del día | 1 | 11 | 1 | 13 |
| SLT-156 Común (encabezado, menú) | 0 | 0 | 2 | 2 |
| **Total** | **5** | **25** | **10** | **40** |

**¿Cambió el canvas después de la v35?** No hay prueba directa. Todos los detalles que `design.md` atribuye a la «v35» coinciden con el canvas actual: KPI con cifra de 20 px, avisos en una línea, barra de 52 px con contador, «Volver», colores y leyenda del mapa, botones bajo el mapa, hoja, pantalla completa y escáner. Tres puntos contradicen el spec y podrían ser un cambio posterior o un error de transcripción; sin la v35 no se puede saber cuál:
1. el filtro «Tienda» de Recoger y Recolección (C1);
2. el folio en la fila de «Cierres solicitados» (K10/K11);
3. «destinatario · dirección» en la fila de Detalle (D4).

Las notas 12 («Flotantes») y 13 («Placeholder») ya estaban recogidas en R497 y R506.

Artboards sin diferencias en lo comprobado: **RepartoGestionar** (diálogo «¿Gestionar esta orden?», `ConfirmarGestionDialog.tsx:18-22,47-54`), **SolicitarCierre** (diálogo, `CierreDiaModule.tsx:643-661`), **CierreVer** («Volver» 44 px, `DetalleCierre.tsx:379-383`), **CierreDia sin gestiones** (botón gris, «0 gestiones», «No tienes gestiones pendientes», `DetalleCierre.tsx:448,462-463`), **Ayuda** (pantalla de hoy) y el panel de **RepartoFoco** salvo D7. Todos los artboards se pudieron mapear a código.

---

## SLT-163 «PWA del mensajero: Reparto en el móvil»

Artboards **RepartoMejorado**, **RepartoDetalle**, **RepartoFoco** y **RepartoGestionar**. Código: `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`, `pos-card/PosOrderCardMosaico.tsx`, `pos-card/PosOrderCardDetalle.tsx`, `KpisMensajero.tsx`, `GestionarOrdenPanel.tsx` y `VerificarGuiaGate.tsx`.

| # | Artboard | Diferencia | Sev. | Canvas | Código | Origen |
|---|---|---|---|---|---|---|
| D1 | RepartoMejorado, RepartoDetalle | El canvas **no** dibuja el disparador «Escanear o escribir guía» en Reparto; el código lo monta bajo el encabezado. | alta | `RepartoMejorado.dc.html`: tras «Salir» vienen directamente los KPI («Pendientes5 / Entregado3…»); no hay ningún «Escanear». Solo `RepartoFoco` tiene la cámara. | `RepartoModule.tsx:824-830` (`<EscanerGuiaReparto>`) | Decisión del leader del 2026-11-14 (R503, `design.md §7`, «misma posición en todas las pantallas»), tomada aparte del canvas. La nota 9 dice «en todas las pantallas», pero el artboard no lo dibuja: hay que confirmarlo con Carlos. |
| D2 | RepartoMejorado, RepartoDetalle | El conmutador Mosaico/Detalle va **dentro de la barra fija**, junto a «Filtros (1)». En el código va en la cabecera de la sección, junto a «Sincronizar ruta», y no queda fijo. | media | `<div aria-label="Vista de las tarjetas">` dentro de `role="search" … position: sticky`; nota 3: «barra fija con buscador, conmutador y Filtros» | `RepartoModule.tsx:885-894` | Transcripción: §5/§8 no ubican el conmutador. |
| D3 | RepartoDetalle | La fila compacta muestra la **guía** (99054752) en mono. El código muestra la **remisión**, y la guía no sale en la fila. | alta | `<span style="font-family:'JetBrains Mono'…">99054752</span>` | `pos-card/PosOrderCardDetalle.tsx:195-197` (`orden.numRemision`) | Implementación: R508 y §8 dicen «guía (arriba, en mono)». |
| D4 | RepartoDetalle | La segunda línea de la fila es «destinatario · dirección». El código pone solo el destinatario; la dirección va al despliegue. | media | «María Fernanda … de la Cruz · San Pedro de Montes de Oca, 300 m norte…» y «José Antonio Céspedes Montero · Condominio Las Palmas…» | `PosOrderCardDetalle.tsx:198-200` | No determinable: R508 y §8 dicen «destinatario debajo». |
| D5 | RepartoDetalle | Fila desplegada: el canvas muestra solo «Cantón · Distrito — dirección» y los dos botones. El código añade el chip de estado y las marcas, el botón Navegar y los intentos. | media | Desplegado: «Montes de Oca · San Pedro — San Pedro de…», «Gestionar más tarde», «Gestionar» | `PosOrderCardDetalle.tsx:218-235` | Transcripción: decisión explícita de §8 («Intentos y marcas siguen en el despliegue»). |
| D6 | RepartoMejorado, RepartoDetalle | «Con ayuda solicitada»: en el canvas es una **fila compacta desplegable** (parada 9, guía, «nombre · tienda», «Valor a cobrar») con «Recuperar» y «Conversación» al desplegar. El código pinta la tarjeta Detalle completa, no compacta y sin número de parada. | media | `[button aria-expanded="true"] 9 99054790 Ana Lucía Vargas Quesada · Distribuidora Comercial…Valor a cobrar₡6.500` | `RepartoModule.tsx:668-726` (sin `compacta`, `mostrarRuta={false}`) | Transcripción: `design.md` no trata esta sección. Quitar el número de parada es intencionado (feature 235 R15). |
| D7 | RepartoFoco | En el modo foco el canvas **mantiene los KPI 2×2** encima de «Volver a la lista». El código los omite. | media | `RepartoFoco.txt` l.9-13: «Pendientes5… Total a cobrar₡41.000», luego «Volver a la lista» | `RepartoModule.tsx:782-817` (el foco no pinta `{kpis}`, que va en `:833`) | No determinable: §8 no menciona los KPI en el foco. |
| D8 | RepartoMejorado | KPI: el canvas pone el icono a la izquierda y la cifra de **20 px** a su derecha, bajo el rótulo. El código pone la cifra a **14 px** en una fila propia a todo el ancho. | baja | `<span style="font-size: 20px; font-weight: 600; white-space: nowrap">₡41.000</span>` | `KpisMensajero.tsx:94-113` | Implementación: §8 transcribió 20 px; se cambió en la review de SLT-163 (m3, «cifra en una línea a 14 px», `progress/features/SLT-163.md:30`). |
| D9 | RepartoMejorado | «Ver detalle completo» mide 44 px en el canvas. En el código es texto de 10 px sin alto mínimo: incumple R493 y el inventario de §4. | baja | `[button aria-expanded="false" min-height=44px] Ver detalle completo` | `pos-card/PosOrderCardMosaico.tsx:273` | Implementación. |
| D10 | RepartoMejorado (y Recoger) | «Navegar» es un botón de 44×44 aparte del bloque de dirección. En el código todo el bloque navy es el enlace y el icono mide 14 px. | baja | `[button aria-label="Navegar" width=44px,height=44px]` | `PosOrderCardMosaico.tsx:177-200` | Transcripción: no está en el inventario de §4. |

## SLT-166 «PWA del mensajero: mapa de ruta»

Artboards **RepartoMapa** y **RepartoMapaCompleto**. Código: `RutaMapaInner.tsx`, `HojaParadaMapa.tsx`, `RepartoModule.tsx` y `ruta-mapa-iconos.ts`.

| # | Artboard | Diferencia | Sev. | Canvas | Código | Origen |
|---|---|---|---|---|---|---|
| M1 | RepartoMapa, RepartoMapaCompleto | Las paradas **gestionadas** (gris con check) no se pintan: el código solo dibuja la siguiente y las pendientes. | alta | `[button aria-label="Parada 1, gestionada"]`, `"Parada 2, gestionada"` | `RutaMapaInner.tsx:348-362` (`"siguiente"` o `"pendiente"`) | Implementación: deuda documentada en `progress/features/SLT-166.md:39-41`; el módulo no recibe las órdenes gestionadas. |
| M2 | RepartoMapa | Con el mapa abierto, el canvas pone «Ver mapa completo» y **«Ocultar mapa»** bajo el mapa, y la fila del aviso queda solo con «Ver más». El código deja «Mostrar/Ocultar mapa» en la fila del aviso (o en la cabecera) y bajo el mapa solo «Ver mapa completo». | media | l.24 «Ver más» (sin «Mostrar mapa»); l.37-38 «Ver mapa completo», «Ocultar mapa» | `RepartoModule.tsx:744-756,904`; `RutaMapaInner.tsx:375-386` | Implementación: desviación de R541 aceptada por el leader (`SLT-166.md:32`). |
| M3 | RepartoMapa | «El punto de partida es aproximado…» va **bajo la leyenda**. En el código va encima del mapa. | media | l.35-36: leyenda y después la nota | `RepartoModule.tsx:930-935` | Implementación: §11 lo transcribió «Debajo». |
| M4 | RepartoMapa | El rótulo visible «Mapa de ruta» va sobre el mapa aunque haya avisos. El código solo lo pinta cuando no hay avisos. | media | `[section aria-label="Mapa de ruta"] Mapa de ruta` tras el aviso | `RepartoModule.tsx:920-927` | Transcripción: no está en §11. |
| M5 | RepartoMapaCompleto | Hoja de la parada, cabecera: el canvas pone en una fila «3 · R-2026-0031 · destinatario · En reparto», y la dirección con «Montes de Oca · San Pedro — …». El código titula «Parada 3 de N», pone la remisión debajo, el chip aparte y la dirección sin cantón ni distrito. | media | `RepartoMapaCompleto.txt` l.15-16 | `HojaParadaMapa.tsx:107,138-161` | Transcripción parcial: §11 lista los datos, no su formato. |
| M6 | RepartoMapaCompleto | La hoja tiene un botón **«Cerrar» (X 44 px)** que el canvas no dibuja; allí solo hay asa. | media | `[section aria-label="Parada 3"]` con asa, sin cerrar | `HojaParadaMapa.tsx:145-148` | Implementación. Es una acción de más, pero sirve al teclado y al lector: por eso es media y no alta. |
| M7 | RepartoMapaCompleto | A pantalla completa el código pinta la leyenda abajo; el canvas no la dibuja. | baja | no aparece «Siguiente/Pendiente…» | `RutaMapaInner.tsx:371-373` | Implementación. |
| M8 | RepartoMapa | La línea de la ruta es negra (`#111111`, 3 px) en el canvas. En el código es azul `#2563eb`, en hex fijo (solo el tramo siguiente es `#111111`). | baja | `<polyline … stroke="#111111" stroke-width="3">` | `RutaMapaInner.tsx:319-329` | Transcripción: §11 solo trata los marcadores. |

## SLT-164 «PWA del mensajero: Recoger en bodega y Recolección»

Artboards **Recoger**, **EscanerAbierto** y **Recoleccion**. Código: `RecogerModule.tsx`, `RecogerPaqueteCard.tsx`, `recoleccion/_components/RecoleccionModule.tsx`, `RecolectadasHoyLista.tsx`, `components/shared/EscanerModal.tsx` y `EscanerGuiaCard.tsx`.

| # | Artboard | Diferencia | Sev. | Canvas | Código | Origen |
|---|---|---|---|---|---|---|
| C1 | Recoger, Recoleccion, EscanerAbierto | **Filtro «Tienda»**: el canvas lo tiene en «Filtros (1)», con su chip activo. En el código `BuscadorFiltros` no lleva filtros. | alta | `[button aria-label="Quitar filtro Tienda: Distribuidora Comercial…"]`, «Filtros (1)» | `RecogerModule.tsx:321-329`; `RecoleccionModule.tsx:271-279` (sin `filtros`) | No determinable: §9 dice «sin `filtros`». |
| C2 | Recoger, Recoleccion | El conmutador Mosaico/Detalle va en la barra fija. El código lo pone en la fila de pestañas (Recoger) y en **dos** cabeceras (Recolección). | media | `[div aria-label="Vista de las tarjetas"]` dentro de la barra fija | `RecogerModule.tsx:346-359`; `RecoleccionModule.tsx:293-296`; `RecolectadasHoyLista.tsx:153` | Transcripción. |
| C3 | Recoger, Recoleccion | El canvas numera las tarjetas («1 · R-2026-0051 · 1 de 2 · 0,8 kg»; filas 1, 2). El código lo oculta con `mostrarRuta={false}`. | media | `Recoger.txt` l.24; `Recoleccion.txt` l.20-21 | `RecogerModule.tsx:194-200`; `RecoleccionModule.tsx:213-220` | Transcripción: §9 no lo trata y el código conserva «no son paradas» (455/235). |
| C4 | Recoleccion | La fila plegada de Detalle muestra «Cantón · Distrito — tienda, local», el estado («Por recolectar» / «Recolectado») y «· Recogido a las 10:42». En el código la fila compacta solo lleva remisión, destinatario y valor; lo demás va al despliegue. | media | `Recoleccion.txt` l.20, l.24 | `PosOrderCardDetalle.tsx:186-216`; `RecolectadasHoyLista.tsx:118-134` | Transcripción: §9 reutiliza la fila compacta de Reparto. |
| C5 | EscanerAbierto | El diálogo del canvas tiene una barra con «Recoger paquete» + «Cerrar» y debajo la cámara, «o» y el campo. El código repite el encabezado de la tarjeta (icono, título y la descripción «Escanea o ingresa el número de guía»), que no está en el canvas. | media | l.32-40: título, Cerrar, sección sin descripción | `EscanerGuiaCard.tsx:218-227`; `RecogerPaqueteCard.tsx:83`; `RecoleccionModule.tsx:250` | Transcripción parcial (§7). |
| C6 | EscanerAbierto | «Cerrar» del diálogo: 44×44 en el canvas; en el código es la X de `Dialog` con `size="icon-sm"`. | baja | `[button aria-label="Cerrar" width=44px,height=44px]` | `components/ui/dialog.tsx:66-69` | Implementación: §7 dice «Cerrar (44 px)». |
| C7 | Recoger, Recoleccion | El disparador lleva icono de cámara y **chevron**. El código usa `ScanLine` y no tiene chevron. | baja | nota 9 y §7 («icono de cámara… y chevron») | `components/shared/EscanerModal.tsx:96-105` | Implementación. |

## SLT-165 «PWA del mensajero: Cierre del día en tarjetas»

Artboards **GestionesVolumen**, **CierreDia**, **CierresSolicitados**, **SolicitarCierre** y **CierreVer**. Código en `components/private/cierres/…` y `app/(app)/cierre-dia/_components/…`.

| # | Artboard | Diferencia | Sev. | Canvas | Código | Origen |
|---|---|---|---|---|---|---|
| K1 | GestionesVolumen | Orden en la tarjeta: el canvas pone a la izquierda **guía (mono) → destinatario → tienda** y a la derecha resultado, «Ganancia» y monto. El código pone destinatario → «guía · tienda» → resultado. | media | `<span>14974806</span><span>María Fernanda…</span><span>Distribuidora…</span>` · `<span>Entregado</span><span>Ganancia</span><span>₡1.500</span>` | `fila/FilaGestion.tsx:112-113,144-158` | Transcripción: §10 fijó esas áreas. |
| K2 | GestionesVolumen | «Devolver a gestión» va **solo en la fila desplegada**. En el código está en la tarjeta plegada (área `acciones`). | media | l.34, dentro del desplegado | `FilaGestion.tsx:304-324` | Transcripción: §10 «resultado acciones». |
| K3 | GestionesVolumen | Toda la fila es el disparador (`aria-label="Ver detalle"`, 56 px). En el código despliega un chevron aparte. | media | `[button aria-label="Ver detalle" … min-height=56px]` | `FilaGestion.tsx:325-334` | Transcripción: §10, chevron con `TACTIL_MOVIL`. |
| K4 | GestionesVolumen, CierreDia | Placeholder del buscador de «Gestiones»: el canvas pone «Busca…» y el código «Guía, remisión o nombre». | media | `placeholder="Busca…"` | `fila/fila-gestion-labels.ts:31` | Decisión de Carlos del 2026-11-14 (P2, `SLT-156.md:28`) que el canvas no recoge. Manda la decisión; solo hay que confirmarla. |
| K5 | GestionesVolumen, CierresSolicitados | Barra fija con gestiones: el canvas muestra solo el botón con el contador. El código pinta además, encima, «Se agrupan todas tus gestiones pendientes. No se puede deshacer.». | media | `[div aria-label="Solicitar cierre del día"]` → solo el botón «Solicitar cierre del día150 gestiones» | `detalle/DetalleCierre.tsx:448`; `detalle/detalle-cierre-vista.ts:687` | Implementación: §10, «el contador sustituye la línea». |
| K6 | GestionesVolumen | Paginación: el canvas tiene «Anterior · 1–25 de 118 · Siguiente». El código añade primera y última página (`showFirstLast`). | baja | `[nav aria-label="Paginación"]` con 2 botones | `fila/GestionesCierre.tsx:216-224` | Implementación. |
| K7 | GestionesVolumen | El rótulo visible «Órdenes del cierre» del canvas en el código es solo `aria-label`. | media | l.24 «Órdenes del cierre» | `GestionesCierre.tsx:177` | Transcripción. |
| K8 | CierreDia | «Rechazados por la tienda»: el canvas usa filas **desplegables**. Plegada: guía, destinatario, «Motivo: …» y la fecha corta «13 nov»; desplegada: «Tienda» y «Fecha del rechazo 13 nov 2026». En el código es una tarjeta fija con todo a la vista y sin despliegue. | media | l.20-23 (`aria-expanded`) | `detalle/RechazosDeTiendaCierre.tsx:42-44,76-99` | Transcripción: §10, «mismo patrón de áreas». |
| K9 | CierreDia | El código pinta además «Al aprobar el cierre, las N pasan solas a «…»». El canvas no lo dibuja. | media | solo l.18-19: nota + «Separar 2 órdenes…» | `RechazosDeTiendaCierre.tsx:62` | No determinable: es texto de hoy que el canvas omite. |
| K10 | CierresSolicitados | En el canvas el **folio** va visible en la fila (mono, arriba) y «Ver» va en el desplegado, a todo el ancho. En el código el folio va en el desplegado y «Ver» en la fila. | media | `A1F3C2E9` + «Solicitado 13 nov, 17:30» + «Destino: Bodega Central» · desplegado: solo `Ver` | `cola/TablaColaPropia.tsx:105-141` | No determinable: §10 manda el folio a `renderExpanded`. |
| K11 | CierresSolicitados | El desplegado del código trae «Recaudado» y «Pago». El canvas no los muestra. | alta | el desplegado solo tiene «Ver» | `TablaColaPropia.tsx:129-141` | No determinable (§10). |
| K12 | CierresSolicitados | Rótulos: el canvas pone «Solicitado {fecha}», «Destino: …» y «Ganancia» sobre el monto. El código pone la fecha y el destino sin prefijo y el monto sin rótulo. | media | l.12 | `TablaColaPropia.tsx:111-123` | Transcripción. |
| K13 | CierresSolicitados | La barra «Busca por folio / Filtros / Descargar» va «fija al hacer scroll» en el canvas. En el código `FiltrosColaPropiaBarra` lleva `tactil` pero no `fija`. | media | l.9 «fija al hacer scroll» | `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx:105-115`; `cola/ColaCierres.tsx:310-313` | Transcripción: §10 no la declara fija. |

## SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (base común)

Artboards **Menu** y **Ayuda**, más el encabezado de todos los artboards.

| # | Artboard | Diferencia | Sev. | Canvas | Código | Origen |
|---|---|---|---|---|---|---|
| G1 | todos (encabezado) | El canvas dibuja a 44×44 la hamburguesa, «Instalar la aplicación», «Ayuda de esta pantalla», «Cambiar tema», «Notificaciones» y «Salir». En el código, `SidebarTrigger` usa `size="icon-sm"` e «Instalar» usa `size="icon"` (`size-8`). | baja | `[button aria-label="Toggle Sidebar" width=44px,height=44px]` y siguientes | `components/ui/sidebar.tsx:254-260`; `components/shared/InstalarPwaButton.tsx:30`; `components/ui/button.tsx:113` | Transcripción: el inventario de §4 no incluye el encabezado (nota 2: «todos los botones táctiles»). |
| G2 | Menu | Los ítems del menú lateral miden 44 px en el canvas. En el código, `SidebarMenuButton` es `h-8` y los subítems `h-7`. | baja | `[a min-height=44px] Reparto`, etc. | `components/ui/sidebar.tsx:487-488,682`; `app/(app)/_components/Sidebar.tsx:390-417` | Transcripción: no está en §4. |

## Notas de método

- Para extraer el texto visible de cada artboard se usó un script propio (`scratchpad/scripts/txt.py`). Las líneas «fija al hacer scroll» y «fija abajo al hacer scroll» son anotaciones del canvas, no texto de la interfaz.
- No se ejecutó la app: los tamaños salen de las clases (por ejemplo, `size="touch"` = 44 px y `icon-sm` < 44 px), no de una medición.
- No se revisaron a fondo la cabecera «Tu cierre del día» de CierreVer (folio, estado, aprobado por…) ni el panel completo de GestionarOrdenPanel. En lo leído coinciden con el canvas.
