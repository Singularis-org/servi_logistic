# SLT-190 «Recoger y Recolección según el canvas» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Este archivo es el spec entero: no hay `design.md`
ni `tasks.md`. Requisitos: **R850-R871** (rango reservado R850-R879; `grep` de `R85x`-`R87x` en
`specs/`: libre).

**Solo presentación.** No cambia datos, consultas, Server Actions, permisos ni dinero. Todo lo que
se pinta ya llega a las pantallas: `tiendaNombre`, `peso`, `estatusValue`, `montoCobrar`
(`lib/interfaces/services/IMisAsignacionesService.ts:15-34`) y `recolectadaAt`
(`lib/types/recoleccion-tienda.ts:94-96`). Si al implementar hiciera falta tocar `lib/`, `db/`,
`app/api/` o un `page.tsx`, se para: la ficha pasaría a la ruta completa (ver P3).

## Origen

Informe `progress/comparacion-canvas-pwa-2026-11-16.md`, sección SLT-164 «PWA del mensajero: Recoger
en bodega y Recolección», filas C1-C7. Diseño: canvas de SLT-156 «PWA de los mensajeros: tablas
usables en el móvil», artboards **Recoger**, **Recoleccion** y **EscanerAbierto** (transcripción en
texto: `Recoger.txt`, `Recoleccion.txt`, `EscanerAbierto.txt` del scratchpad de la comparación). Los
datos de los artboards son de ejemplo: se toma la disposición, nunca los valores.

Regla de la ficha: **la pantalla de hoy + solo los puntos de la ficha**, con los componentes que ya
existen. Lo que SLT-164 y SLT-168 decidieron y Carlos aprobó se mantiene salvo lo que la ficha pide.

| Fila | Qué dice el canvas | Código hoy (verificado en esta rama) | Aquí |
|---|---|---|---|
| C1 | «Filtros (1)» con el filtro «Tienda» puesto: `[button aria-label="Quitar filtro Tienda: …"] Tienda: …` antes del campo, y «Limpiar todo» (`Recoger.txt` l.10-13, `Recoleccion.txt` l.10-13) | `BuscadorFiltros` sin `filtros` (`RecogerModule.tsx:321-329`, `RecoleccionModule.tsx:240-248`) | R850-R854, **sujetos a P1 y P2** |
| C2 | Conmutador Mosaico/Detalle dentro de la barra fija, tras «Filtros» (`Recoger.txt` l.13-16) | En la fila de pestañas (`RecogerModule.tsx:346-359`); en Recolección, **dos**: cabecera de «Por recolectar» (`RecoleccionModule.tsx:262-265`) y de «Recogidos en tienda hoy» (`RecolectadasHoyLista.tsx:153`) | R859-R861 |
| C3 | Tarjetas numeradas: «1 · R-2026-0051 · 1 de 2 · 0,8 kg» (`Recoger.txt` l.24); filas 1, 2 (`Recoleccion.txt` l.20-21, l.24) | `mostrarRuta={false}` oculta el número (`RecogerModule.tsx:194-200`, `RecoleccionModule.tsx:186-193`, `RecolectadasHoyLista.tsx:117`) | R855-R858 |
| C4 | Fila plegada de Recolección: número, remisión, destinatario, «Cantón · Distrito — tienda, local», estado y «Valor a cobrar»; en «Recogidos hoy», además «· Recogido a las 10:42» (`Recoleccion.txt` l.20-24) | Fila compacta de remisión + destinatario + valor; estado y hora van al despliegue (`PosOrderCardDetalle.tsx:187-250`, `RecolectadasHoyLista.tsx:118-134`) | R862-R866, **la línea de ubicación sujeta a P3** |
| C5 | Diálogo: barra con «Recoger paquete» + «Cerrar» (44×44); debajo cámara, «o» y campo, sin icono ni descripción (`EscanerAbierto.txt` l.32-40) | El título va `sr-only` en el diálogo (`EscanerModal.tsx:111`) y la tarjeta repite icono, título y «Escanea o ingresa el número de guía» (`EscanerGuiaCard.tsx:234-244`) | R867-R871 |
| C6 | «Cerrar» de 44×44 | X de `Dialog` con `size="icon-sm"` (`components/ui/dialog.tsx:61-74`) | Entra por C5 (R869): el «Cerrar» de la barra nueva mide 44 px. Solapa con SLT-193 (ver abajo) |
| C7 | Disparador con icono de cámara y chevron | `ScanLine`, sin chevron (`EscanerModal.tsx:144`) | **Fuera**: no está en la ficha |

## Lo que ya existe

Buscado `filtro tienda`, `tiendaNombre`, `Quitar filtro`, `trasFiltros`, `VistaCardsToggle`,
`mostrarRuta`, `textoParada`, `Recogido a las`, `EscanerModal`, `DialogTitle`, `showCloseButton` y
`R85x`-`R87x` en `feature_list.json`, `specs/`, `progress/` y el código, con Grep/Read. **El grafo no
se consultó**: el MCP de código no estaba entre las herramientas de esta sesión; se usó Grep/Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SLT-189 «Reparto del mensajero según el canvas» (mergeada): mismas filas en Reparto. Su R794 fija que la fila de Recoger y Recolección «no cambia»; su alcance manda C4 a esta ficha. | R862 sustituye R794 **solo en Recolección**; en Recoger R794 sigue (R866). |
| Board | SLT-168 «Escaneo continuo en las recogidas del mensajero» (mergeada en `dev`): el diálogo de Recoger y Recolección es `TarjetaEscaneoContinuo`; R833 exige conservar título, nombre accesible y botón. | No se repite nada: solo cambia el encabezado del diálogo (C5). R833 se cumple (el título pasa a la barra). Archivos compartidos: `RecogerPaqueteCard.tsx`, `RecoleccionModule.tsx`, `components/shared/EscaneoContinuo.tsx` y sus tests (`RecogerPaqueteCard.test.tsx`, `RecoleccionModule.test.tsx`, `EscaneoContinuo.test.tsx`, `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`). |
| Board | SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (`pending`): incluye «Cerrar» del diálogo del escáner. | Aquí solo el «Cerrar» de la barra de Recoger y Recolección (R869); SLT-193 puede darlo por hecho en esas dos pantallas. |
| Board | SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» (`pending`): toca el `BuscadorFiltros` de `RecoleccionModule.tsx`. | Choque de archivo previsible; no hay solape de comportamiento. |
| Board | SLT-192 «Mapa de ruta según el canvas» (en vuelo, en paralelo): `RepartoModule.tsx`, `RutaMapaInner.tsx`, `HojaParadaMapa.tsx`. | Ningún archivo en común con `## Archivos esperados`. |
| `components/shared/BuscadorFiltros.tsx:149-171,244-249,593` | `filtros`/`activos`/`onActivosChange`/`onLimpiarTodo`, el resumen «Filtros (n)» y el hueco `trasFiltros` (SLT-189 DS3). | **Se reutilizan**: el filtro y el conmutador entran por props que ya existen. |
| `components/shared/FilterComponent.tsx:901-935` | Control `single` con rótulo dentro («Tienda: {valor}», ficha 372). | Propuesta para el control del filtro (P2). |
| `RepartoModule.tsx:853-883` | Patrón de un filtro puesto en la barra móvil (cantón/distrito) con «Limpiar todo». | Mismo patrón. |
| `pos-card/PosOrderCardMosaico.tsx:95-124`, `PosOrderCardDetalle.tsx:81-90` | Número de parada y «{n} de {total}» con `mostrarRuta`, ligado a `secuenciaRuta` (siempre `null` fuera de Reparto, `IMisAsignacionesService.ts:58`). | Se añade una posición en la lista, aparte de la ruta (DS3). |
| `pos-card/PosOrderCardDetalle.tsx:176-185` | `filaReparto` (SLT-189): variante opcional de la fila compacta. | Mismo mecanismo para la fila de Recolección (DS5). |
| `RecolectadasHoyLista.tsx:60-71,120-134` | Hora fija en Costa Rica (`horaDe`) y el pie «Recogido a las». | Se reutiliza `horaDe` en la fila plegada. |
| `components/ui/dialog.tsx:46` | `showCloseButton` del `DialogContent`. | Se apaga cuando la barra trae su «Cerrar». |

## Alcance

- **Dentro** (solo `/mis-asignaciones/recoger` y `/recoleccion`): filtro «Tienda» (C1, si P1 lo
  confirma); tarjetas numeradas (C3); conmutador en la barra fija (C2); fila plegada de Recolección
  con ubicación, estado y hora (C4); barra del diálogo del escáner con título y «Cerrar» (C5, C6).
- **Fuera:**
  - C7 (chevron del disparador): no está en la ficha.
  - Reparto: ni filtro, ni numeración, ni fila (SLT-189).
  - Datos nuevos del servidor (cantón, distrito o dirección de la tienda): ver P3.
  - El flujo continuo del escáner (SLT-168), los textos de la sesión y los de las recepciones.
  - Los demás usos de `EscanerModal` y `EscanerGuiaCard` (recepciones de bodega, Reparto, buscador
    con cámara).

## Decisiones cerradas (no reabrir)

Ninguna sembrada por `/afinar-feature`. Las heredadas que este spec respeta: 455 R7 (el chip dice el
estado de la orden), SLT-168 (Carlos, 2026-11-17: en Recolección no se usan «Recolectada»/
«Recolectadas»), 277 R16/R20 (los contadores cuentan lo que el mensajero tiene; el buscador solo
cambia lo que se ve) y 277 R22 (el escáner resuelve contra la lista completa).

## Decisiones del spec (se aprueban con el spec)

| # | Decisión | Por qué | Cubierta por |
|---|---|---|---|
| DS1 | El filtro «Tienda» compara por `tiendaNombre` y sus opciones son las tiendas de las órdenes cargadas en la pantalla (sin repetir, orden alfabético). | El DTO solo trae el nombre de la tienda; sin servidor nuevo. | R851 |
| DS2 | El filtro se trata como el término: filtra lo que se ve en todas las listas de la pantalla, no cambia contadores ni lo que acepta el escáner, y cuenta como «búsqueda activa» para el vacío y para el puntero a la otra pestaña. | 277 R16/R20/R22; si no, con solo el filtro puesto, una pestaña vacía diría «no tienes órdenes», que es falso. | R852-R854 |
| DS3 | El número de la tarjeta es su **posición en la lista visible** (1..n), no una parada: nombre accesible «Orden {n} de {total}», sin «Parada», «Sin posición» ni «Pendiente de optimizar». Prop nueva y opcional de `PosOrderCardProps`; ausente = como hoy. | Estas órdenes no son paradas (`IMisAsignacionesService.ts:58`, comentarios de `RecogerModule.tsx:183-185` y `RecoleccionModule.tsx:173-176`); el canvas sí las numera. | R855-R858 |
| DS4 | En Recolección queda **un** conmutador, en la barra, siempre visible (también con «Por recolectar» vacía), que gobierna las dos listas. | Hoy hay dos mandos para una sola preferencia y el de arriba desaparece con la lista vacía. | R860 |
| DS5 | La fila plegada nueva es **solo de Recolección** (prop opcional como `filaReparto`); el estado plegado es el nombre vigente del catálogo (no «Por recolectar»/«Recolectado» del canvas, nombres retirados por la 455), en texto, sin botón de información (un botón no puede ir dentro del botón de la fila); el chip con su información sigue en el despliegue. | 455 R7 y la decisión de Carlos en SLT-168; el canvas usa nombres retirados. | R862, R864 |
| DS6 | «Recogido a las {hora}» pasa del despliegue a la fila plegada en Detalle y no se repite al desplegar; en Mosaico sigue como hoy. | Canvas l.24; un dato en dos sitios. | R863, R865 |
| DS7 | El título visible del diálogo lo pinta `EscanerModal` (prop opcional `titulo`) con un «Cerrar» de 44×44, y la tarjeta se monta sin su encabezado (prop opcional en `EscanerGuiaCard`, pasada por `TarjetaEscaneoContinuo`). Sin las props, los demás usos no cambian. **Descartado:** dejar el encabezado de la tarjeta y solo quitar la descripción: seguiría habiendo dos títulos (el `sr-only` del diálogo y el de la tarjeta) y la X pequeña del `Dialog`. | Canvas l.32-40; R833 de SLT-168 (el título se conserva, cambia de sitio). | R867-R871 |

## Requisitos (EARS)

«Las dos pantallas» = Recoger en bodega (`/mis-asignaciones/recoger`) y Recolección (`/recoleccion`).
«Listas de la pantalla» = en Recoger, las pestañas «Para recoger hoy» y «Para otro día»; en
Recolección, «Por recolectar en tienda» y «Recogidos en tienda hoy».

### Filtro «Tienda» (C1) — sujetos a P1 y P2

- **R850** — En las dos pantallas, el selector «Filtros» de la barra DEBE ofrecer «Tienda», y sus
  opciones DEBEN ser las tiendas de las órdenes cargadas en la pantalla, sin repetir y en orden
  alfabético.
- **R851** — CUANDO el mensajero elige una tienda en el filtro, el sistema DEBE dejar a la vista, en
  todas las listas de la pantalla, solo las órdenes de esa tienda que además cumplan el término del
  buscador.
- **R852** — MIENTRAS el filtro «Tienda» está puesto, la barra DEBE mostrar «Filtros (1)», un control
  visible con «Tienda: {nombre}» de al menos 44 px de alto (forma según P2) y «Limpiar todo»; CUANDO
  el mensajero quita el filtro o pulsa «Limpiar todo», el sistema DEBE volver a mostrar todas las
  órdenes (y, con «Limpiar todo», vaciar también el término).
- **R853** — El filtro «Tienda» NO DEBE cambiar los contadores (pestañas de Recoger, aviso de órdenes
  nuevas, «{n} paquetes por recolectar en tienda.», «{n} paquetes recogidos en tienda hoy.») ni las
  guías que acepta el escáner.
- **R854** — SI el filtro (con o sin término) deja vacía una lista que tiene órdenes, ENTONCES el
  sistema DEBE mostrar en ella el vacío de búsqueda de hoy (R521 de SLT-156) y, en Recoger, el puntero
  a la otra pestaña con lo que allí deja el filtro (277 R11/R21), no el vacío «sin órdenes».

### Tarjetas numeradas (C3)

- **R855** — En las dos pantallas, en Mosaico y en Detalle, cada tarjeta DEBE mostrar a la izquierda
  de la remisión su posición en la lista visible (1, 2, …), y en Mosaico la línea bajo la remisión
  DEBE decir «{posición} de {total} · {peso}».
- **R856** — El número de R855 DEBE tener el nombre accesible «Orden {posición} de {total}» y NO
  DEBE ir acompañado de «Parada», «Sin posición» ni «Pendiente de optimizar».
- **R857** — CUANDO el término, el filtro o la pestaña cambian lo que se ve, la numeración DEBE
  recalcularse sobre la lista visible, de 1 a n sin huecos, en cada lista por separado.
- **R858** — En Reparto, el número de parada, «{n} de {total}» y «Pendiente de optimizar» NO DEBEN
  cambiar.

### Conmutador en la barra fija (C2)

- **R859** — En Recoger, el conmutador Mosaico/Detalle DEBE estar dentro de la barra de búsqueda y
  filtros, después del campo y de «Filtros», y la fila de las pestañas NO DEBE contener ningún
  conmutador.
- **R860** — En Recolección DEBE haber un único conmutador, dentro de la barra tras «Filtros», visible
  también cuando «Por recolectar en tienda» está vacía; las cabeceras «Por recolectar en tienda» y
  «Recogidos en tienda hoy» NO DEBEN contener conmutador; y CUANDO el mensajero lo usa, las dos
  listas DEBEN cambiar de vista a la vez.
- **R861** — MIENTRAS el mensajero desplaza la lista, el conmutador DEBE seguir visible pegado arriba
  con la barra (R496); a 360 px y 414 px de ancho la barra NO DEBE desbordar en horizontal (R501) y
  «Mosaico» y «Detalle» DEBEN medir al menos 44 × 44 px (R493).

### Fila plegada de Recolección (C4)

- **R862** — En Recolección, vista Detalle, la fila plegada de cada orden de las dos listas DEBE
  mostrar: el número (R855), la remisión, el destinatario, la línea de ubicación de la tienda (P3;
  propuesta: «{tienda}»), el nombre vigente del estado actual de la orden y «Valor a cobrar» con el
  monto en columna fija; el texto se parte en líneas, sin «…» (R490).
- **R863** — En «Recogidos en tienda hoy», la línea de ubicación plegada DEBE terminar en « · Recogido
  a las {hora}», con la hora de la recolección en Costa Rica (la misma de hoy).
- **R864** — La fila plegada NO DEBE mostrar «Por recolectar», «Recolectada» ni «Recolectado» como
  estado, y la guardia `nombres-estado-retirados` DEBE seguir en verde.
- **R865** — CUANDO el mensajero toca una fila de Recolección, el sistema DEBE desplegar lo mismo que
  hoy (chip de estado con su información, ubicación con navegar, intentos), salvo «Recogido a las»,
  que NO DEBE repetirse; en Mosaico, «Recogido a las {hora}» DEBE seguir como hoy.
- **R866** — En Recoger, la fila plegada de Detalle NO DEBE cambiar salvo el número de R855 (remisión
  arriba y destinatario debajo, R794 de SLT-189).

### Diálogo del escáner (C5, C6)

- **R867** — CUANDO el mensajero abre «Escanear o escribir guía» en Recoger, el diálogo DEBE mostrar
  arriba una barra con el título visible «Recoger paquete» y el botón «Cerrar», y debajo «Escanear con
  cámara», «o» y «Número de guía»; NO DEBE mostrar el icono de la tarjeta, un segundo título ni
  «Escanea o ingresa el número de guía».
- **R868** — CUANDO el mensajero abre «Escanear o escribir guía» en Recolección, el diálogo DEBE
  mostrar lo mismo que R867 con el título «Recolectar en tienda».
- **R869** — En esos dos diálogos DEBE haber un solo botón «Cerrar», de al menos 44 × 44 px; CUANDO el
  mensajero lo pulsa, el diálogo DEBE cerrarse con el efecto de hoy (cámara apagada; refresco una vez
  si hubo al menos una recepción, R598).
- **R870** — Los diálogos de Recoger y Recolección DEBEN conservar el nombre accesible del diálogo y
  de la sección («Recoger paquete» / «Recolectar en tienda», «Recoger por número de guía o escaneo» /
  «Recolectar por número de guía o escaneo»), el botón de envío y la sesión continua de SLT-168
  (contadores y lista de lecturas, R830-R833).
- **R871** — Los demás usos de `EscanerModal` y `EscanerGuiaCard` (recepciones en bodega, Reparto,
  buscador con cámara) NO DEBEN cambiar: mismo encabezado de tarjeta y misma X del diálogo.

## Tasks

Orden: (T1 ∥ T2 ∥ T3) → T4 → T5 → T6. `[P]` = paralelizable con sus hermanas.

- [ ] **T1 [P] — Posición y fila de Recolección en la tarjeta** (`pos-card/PosOrderCard.tsx`,
  `pos-card/PosOrderCardMosaico.tsx`, `pos-card/PosOrderCardDetalle.tsx`). Props opcionales en
  `PosOrderCardProps`: la posición en la lista (DS3) y la variante de fila de Recolección con la línea
  de ubicación y el sufijo de hora (DS5, DS6). Ausentes = como hoy.
  *Hecho:* `tests/components/PosOrderCardPosicion.test.tsx` (nuevo) cubre R855, R856 y R858 (sin la
  prop y con `mostrarRuta`, la parada de Reparto intacta); `PosOrderCardDetalleCompacta.test.tsx`
  cubre R862 (con fixture de estado `recolectando`), R864 y R866 (sin la prop: remisión y
  destinatario). Mutación: devolver el número a `secuenciaRuta` deja R855 en rojo.
- [ ] **T2 [P] — Filtro «Tienda», función pura**
  (`app/(app)/mis-asignaciones/_components/filtro-tienda.ts`, nuevo). Opciones a partir de las
  órdenes (DS1) y filtrado por tienda.
  *Hecho:* `tests/unit/components/filtro-tienda.test.ts` cubre R850 (sin repetir, alfabético) y R851
  (combinado con `filtrarAsignaciones`).
- [ ] **T3 [P] — Barra del diálogo** (`components/shared/EscanerModal.tsx`,
  `components/shared/EscanerGuiaCard.tsx`, `components/shared/EscaneoContinuo.tsx`). Prop `titulo`
  en `EscanerModal` (barra visible + «Cerrar» 44 px + `showCloseButton={false}`) y prop para montar
  la tarjeta sin encabezado, pasada por `TarjetaEscaneoContinuo` (DS7).
  *Hecho:* `EscanerModal.test.tsx` cubre R869 (un solo «Cerrar», 44 px por clase) y R871 (sin
  `titulo`, la X de siempre); `EscanerGuiaCard.test.tsx` cubre R871 (sin la prop, icono, título y
  descripción siguen); `EscaneoContinuo.test.tsx` sigue en verde.
- [ ] **T4 — Recoger en bodega** (`RecogerModule.tsx`, `RecogerPaqueteCard.tsx`; depende de T1-T3).
  `filtros`/`activos`/`onLimpiarTodo` en la barra con el control de P2; `VistaCardsToggle` a
  `trasFiltros` y fuera de la fila de pestañas; posición en las tarjetas; `buscando` = término o
  filtro (DS2); diálogo con `titulo="Recoger paquete"` y tarjeta sin encabezado.
  *Hecho:* `RecogerModule.test.tsx` cubre R851-R854 (contadores intactos, vacío y puntero con solo
  el filtro), R857 y R859; `RecogerPaqueteCard.test.tsx` cubre R867, R869 y R870.
- [ ] **T5 — Recolección** (`RecoleccionModule.tsx`, `RecolectadasHoyLista.tsx`; depende de T1-T3).
  Filtro y conmutador en la barra; se quita el conmutador de las dos cabeceras (y las props
  `vistaPedida`/`onVistaChange` de `RecolectadasHoyLista` que quedan sin uso); fila de Recolección en
  Detalle con «Recogido a las» plegado; diálogo con `titulo="Recolectar en tienda"`.
  *Hecho:* `RecoleccionModule.test.tsx` cubre R851-R854, R857, R860, R862-R865 y R868-R870; los
  asertos de hoy que exigen un conmutador por sección o «Recogido a las» en el despliegue se
  reescriben a R860/R865, no se borran. Mutación: volver a pintar el conmutador en la cabecera deja
  R860 en rojo.
- [ ] **T6 — E2E y gate** (depende de T4 y T5). En `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`:
  (a) a 360 y 414 px la barra con filtro puesto y conmutador no desborda y sus controles miden 44 px
  (R852, R861); (b) el conmutador sigue pegado arriba al bajar (R861); (c) el diálogo muestra la barra
  con el título y un «Cerrar» de 44 × 44 (R867-R869); (d) la fila de Recolección plegada muestra
  estado y, en «Recogidos hoy», la hora (R862, R863). E2E en local sobre base desechable
  (`docs/perfil-agentes.md > Todos los agentes`) y `./init.sh`.
  *Hecho:* E2E en verde en local; `INIT_EXIT=0`; mapa `R<n> -> test` completo en
  `progress/features/SLT-190.md`.

## Tamaño

21 archivos (11 de producción, 10 de tests; ~53% de `max_archivos`). Estimado: ~260 líneas de
producción y ~650 de tests.

## Archivos esperados

Producción:
- `app/(app)/mis-asignaciones/_components/RecogerModule.tsx`
- `app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx`
- `app/(app)/mis-asignaciones/_components/filtro-tienda.ts`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCard.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx`
- `app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx`
- `app/(app)/recoleccion/_components/RecoleccionModule.tsx`
- `app/(app)/recoleccion/_components/RecolectadasHoyLista.tsx`
- `components/shared/EscanerModal.tsx`
- `components/shared/EscanerGuiaCard.tsx`
- `components/shared/EscaneoContinuo.tsx`

Tests:
- `tests/unit/components/filtro-tienda.test.ts`
- `tests/components/PosOrderCardPosicion.test.tsx`
- `tests/components/PosOrderCardDetalleCompacta.test.tsx`
- `tests/components/RecogerModule.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/EscanerModal.test.tsx`
- `tests/components/EscanerGuiaCard.test.tsx`
- `tests/components/EscaneoContinuo.test.tsx`
- `e2e/pwa-mensajero-recoger-recoleccion.spec.ts`

## Preguntas abiertas

- **P1 (C1, bloquea R850-R854)** — El filtro «Tienda» contradice el spec de SLT-156 (`design.md §9`:
  Recoger y Recolección «sin `filtros`»); el informe lo marca como **no determinable** (cambio del
  canvas posterior o error de transcripción). ¿Entra el filtro? Si no, R850-R854 se retiran y el resto
  del spec no cambia.
- **P2 (C1, forma)** — El canvas dibuja un chip «Tienda: {nombre}» que se quita al tocarlo («Quitar
  filtro Tienda: …»). Hoy la app no tiene ese chip: un filtro puesto es un selector con el rótulo
  dentro («Tienda: {nombre}», `FilterComponent` `single`), como el cantón de Reparto. Propuesta:
  reutilizar el selector (se quita desde «Filtros» o «Limpiar todo»). ¿O se quiere el chip nuevo?
- **P3 (C4, ubicación)** — El canvas pone «Cantón · Distrito — tienda, local». La orden solo trae el
  **nombre** de la tienda; el cantón y el distrito de la orden son los del destinatario, y la dirección
  de la tienda («local 3») no viaja. Propuesta: la línea muestra solo «{tienda}» (sin servidor). Si se
  quiere cantón, distrito y dirección de la tienda, hace falta leerlos en el servidor: ficha aparte por
  la ruta completa.
