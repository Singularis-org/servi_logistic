# SLT-191 «Cierre del día del mensajero según el canvas» — requirements

Ruta: **ligera** (zona frontend, complejidad low). Este archivo es el spec entero: no hay `design.md`
ni `tasks.md`. Requisitos: **R810-R824** (rango reservado R810-R829; `grep` de `R81x`/`R82x` en
`specs/` del repo y de todos los worktrees: libre).

**Solo presentación.** No cambia datos, consultas, Server Actions, permisos ni dinero. Todo lo que
se pinta ya llega a la pantalla: la gestión en `CierreDetalleGestion` (`numGuia`, `destinatario`,
`tiendaNombre`, `resultado`, `pagoMensajero`), el rechazo en `CierreRechazoDeTienda` (`numGuia`,
`destinatario`, `motivo`, `tiendaNombre`, `rechazadoAt`) y el cierre en `CierrePasadoDTO`
(`cierreId`, `solicitadoAt`, `destinoTipo`, `estado`, `totalPagoMensajero`). Si al implementar hiciera
falta tocar `lib/`, `db/`, `app/api/` o un `page.tsx`, se para: la ficha pasaría a la ruta completa.

## Origen

Informe `progress/comparacion-canvas-pwa-2026-11-16.md`, sección SLT-165 «PWA del mensajero: Cierre
del día en tarjetas», filas K1-K13. Diseño: canvas de SLT-156 «PWA de los mensajeros: tablas usables
en el móvil», artboards **GestionesVolumen**, **CierreDia** y **CierresSolicitados** (transcritos en
`scratchpad/canvas-txt/*.txt`). Los datos de los artboards son de ejemplo: se toma la disposición,
nunca los valores.

Regla de la ficha: **la pantalla de hoy + solo los puntos de la ficha**, con los componentes que ya
existen. Lo que SLT-165 decidió y Carlos aprobó se mantiene salvo lo que la ficha pide cambiar.

| Fila | Qué dice el canvas | Código hoy (verificado) | Aquí |
|---|---|---|---|
| K1 | Tarjeta: izquierda **guía (mono) → destinatario → tienda**; derecha resultado, «Ganancia» y monto (`GestionesVolumen.txt` l.25-26, l.35-42) | Áreas `dest / guia·tienda / resultado acciones`, monto sin rótulo (`fila/FilaGestion.tsx:112-113,143-160`) | R810 |
| K2 | «Devolver a gestión» solo en el desplegado (l.34, tras «Ver evidencia») | En la tarjeta plegada, área `acciones` (`FilaGestion.tsx:304-324`) | R811 |
| K3 | Toda la tarjeta es el disparador (`aria-expanded`, 56 px, l.25) | Chevron aparte de 44 px (`FilaGestion.tsx:325-334`) | R812-R813 |
| K8 | «Rechazados por la tienda» en filas desplegables: plegada guía, destinatario, «Motivo: …», fecha; desplegada «Tienda» y «Fecha del rechazo» (`CierreDia.txt` l.20-23) | Tarjeta fija con todo a la vista (`detalle/RechazosDeTiendaCierre.tsx:42-44,75-100`) | R815-R817 |
| K10 | Fila de «Cierres solicitados» con el **folio** arriba en mono; «Ver» solo en el desplegado, a todo el ancho (`CierresSolicitados.txt` l.12-17) | Folio en el desplegado y «Ver» en la fila (`cola/TablaColaPropia.tsx:105-141`) | R818-R819 |
| K11 | El desplegado solo tiene «Ver» | Trae «Folio», «Recaudado» y «Pago» (`TablaColaPropia.tsx:129-141`) | R820 (DC1) |
| K12 | Rótulos «Solicitado {fecha}», «Destino: …» y «Ganancia» sobre el monto (l.12) | Fecha y destino sin prefijo, monto sin rótulo (`TablaColaPropia.tsx:111-123`) | R818 |
| K13 | Barra «Busca por folio / Filtros / Descargar» fija al hacer scroll (l.6-9) | `FiltrosColaPropiaBarra.tsx:103-116` lleva `tactil` sin `fija`; el envoltorio de barra y «Descargar» no es fijo (`cola/ColaCierres.tsx:308-311`) | R822-R823 |

## Lo que ya existe

Buscado `cierre-dia`, `FilaGestion`, `RechazosDeTiendaCierre`, `TablaColaPropia`, `detallePropioMovil`,
`BARRA_FIJA`, `Devolver a gestión`, `canvas` y `R81x/R82x` en `feature_list.json`, `specs/`, `progress/` y
el código, con Grep/Read. **No se consultó el grafo** (este worktree se leyó con Grep/Read).

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| `specs/SLT-156-pwa-mensajero-tablas/requirements.md:335-380` | R523 (tarjeta de gestión «para cualquier audiencia»), R524, R525, R528 (rechazo como tarjeta), R535 (cola propia en tarjetas), R536. | Se mantienen salvo en `/cierre-dia` en móvil, donde R810-R822 los sustituyen en lo que dice la ficha (DS1). |
| Board | SLT-189 «Reparto del mensajero según el canvas» (`done`) y SLT-190 «Recoger y Recolección según el canvas» (`pending`): mismo informe, otras pantallas. | No es duplicado. No comparten archivos con esta. |
| `pos-card/PosOrderCardDetalle.tsx:198-228` | Fila compacta de Reparto: toda la fila es un `<button aria-expanded>` con rótulo y monto en columna fija a la derecha («Valor a cobrar»). | Mismo patrón para los rechazos y la cola (R816, R818); la tarjeta de gestión no puede envolverse en un botón (DS2). |
| `components/shared/BuscadorFiltros.tsx:56-57` | `BARRA_FIJA` («sticky top-0 z-20 bg-background py-2»), la de «Gestiones» (R527). | **Se reutiliza** en el envoltorio de la barra de la cola (DS6). |
| `cierre-factura.tsx:1495-1496,2201`; `fila-gestion-labels.ts:46`; `cola-propia-vista.ts:67-74` | Rótulos «Tienda», «Motivo», «Fecha del rechazo», «Ganancia», «Solicitado», «Destino». | Se reutilizan; no se crean textos nuevos salvo el «:» del canvas. |
| `hooks/use-mobile.ts:3-4` | `useIsMobile`, corte 768 px (el mismo que `max-md:`). | Ya lo usan `GestionesCierre.tsx:91` y `ColaCierres.tsx:277`. |

## Alcance

- **Dentro** (solo `/cierre-dia`, solo móvil < 768 px, solo el propio mensajero): orden de la tarjeta
  de gestión (K1), «Devolver a gestión» al desplegar (K2), toda la tarjeta despliega (K3), rechazos en
  filas desplegables (K8), folio en la fila y «Ver» al desplegar (K10), sin «Recaudado» ni «Pago» en
  el desplegado (K11), rótulos «Solicitado», «Destino» y «Ganancia» (K12), barra de la cola fija (K13).
  Vale para el cierre de hoy, el rechazado o vencido y el detalle de «Ver» de un cierre pasado (todos
  con `audiencia="mensajero"`, `CierreDiaModule.tsx:483,536,562,710`).
- **Fuera:**
  - K4 (placeholder «Busca…»): manda la decisión de Carlos del 2026-11-14 («Guía, remisión o nombre»).
  - K5 (texto sobre el botón «Solicitar cierre del día»), K6 (primera/última página), K7 (rótulo
    visible «Órdenes del cierre»): no están en la ficha.
  - K9 («Al aprobar el cierre, las N pasan solas…», `RechazosDeTiendaCierre.tsx:62`): no es parte de
    las filas; **se queda** como hoy.
  - Lo que el canvas añade al desplegado de la gestión («Tienda», l.30): no está en la ficha.
  - El formato de fecha corta del canvas («13 nov», «13 nov 2026»): no está en la ficha (DS5).
  - Escritorio (≥ 768 px) y `/cierres-admin` (central, satélite, bodega): no cambian (DS1).
  - Datos nuevos del servidor: ninguno hace falta.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién | Cubierta por |
|---|---|---|---|
| DC1 | En «Cierres solicitados» se quitan «Recaudado» y «Pago» del desplegado (como el canvas). | Carlos, 2026-11-16 (`progress/features/SLT-191.md`) | R820, R821 |

Comprobado para DC1: la cola propia es **solo del mensajero** (`TablaColaPropia.tsx:3-8`, rol
mensajero; `/cierres-admin` usa `TablaColaBodega` y `TablaColaMensajero`, `ColaCierres.tsx:343-352`).
El desplegado solo existe en el teléfono (`ColaCierres.tsx:340`); en escritorio la tabla sigue con sus
ocho columnas, «Recaudado» y «Pago» incluidas (`cola-propia-vista.ts:65-76`). Ningún otro rol pierde
nada. Efecto en el teléfono: el estado de pago de cada cierre («Pendiente de pago», «Liquidado», el
motivo de rechazo, `cola-propia-vista.ts:113-139`) deja de verse en la lista; siguen el chip de estado
en la fila y las tarjetas de ganancia de arriba (`ColaCierres.tsx:328-330`).

## Decisiones del spec (se aprueban con el spec)

| # | Decisión | Por qué | Cubierta por |
|---|---|---|---|
| DS1 | Todo cambia **solo** en `/cierre-dia`, con ventana < 768 px (`useIsMobile`). La tarjeta de gestión se elige por `audiencia === "mensajero"` y móvil; los rechazos desplegables, por una prop opcional que solo pasa `CierreDiaModule`; la cola y su barra, por `tipo === "propios"` y móvil. Sin la prop o en escritorio, el DOM es el de hoy. | `FilaGestion`, `GestionesCierre` y `RechazosDeTiendaCierre` también los usa `/cierres-admin` (`CierresAdminModule.tsx:1436,1471`; `DetalleCierreBodegaAbierto.tsx:72`). La ficha es la del mensajero. | R814, R817, R821, R823 |
| DS2 | «Toda la tarjeta despliega» con el botón de despliegue de hoy **estirado** sobre la tarjeta (cubre su área; el resto del contenido no captura el toque) y el botón de información del resultado por encima. **Descartado:** envolver la tarjeta en un `<button>` como `PosOrderCardDetalle.tsx:198`: la tarjeta lleva `EstadoConInfo`, que es un botón (`EstadoInfo.tsx:111-121`), y un botón dentro de otro es HTML inválido; quitar la información del chip tampoco vale (la guardia `estado-con-info.guardia.test.ts:218` exige `EstadoConInfo` en la fila). | Accesible y sin tocar la guardia. | R812, R813 |
| DS3 | La tarjeta de gestión sigue toda la fila K1: además del orden guía → destinatario → tienda a la izquierda, el resultado pasa a la derecha encima de «Ganancia» y el monto. | Es la misma fila del informe y el mismo artboard; sin «Devolver» ni chevron en la tarjeta, la línea `resultado acciones` de hoy queda vacía. | R810 |
| DS4 | Nombres accesibles de hoy: el disparador de la gestión conserva `detalleOrdenAriaLabel` / `desgloseAriaLabel` (no el «Ver detalle» del canvas) y «Ver» conserva «Ver del cierre del {día}». El folio conserva el «#» de hoy (`folioDe`, mismo que en escritorio). | Los leen los E2E (`FilaGestion.tsx:328`, `pwa-mensajero-cierre-dia.spec.ts:198`) y R89. | R812, R819 |
| DS5 | Fechas con el formato de hoy: la del rechazo con `fechaCalendarioCR` plegada y desplegada; la de solicitud con `fechaHora`. | El formato corto del canvas no está en la ficha. | R815, R816, R818 |
| DS6 | La barra fija es el **envoltorio** de barra y «Descargar» de `ColaCierres.tsx:308-311` con `BARRA_FIJA`. **Descartado:** `fija` en el `BuscadorFiltros` de `FiltrosColaPropiaBarra`: dejaría «Descargar» fuera (es hermano, `:310`) y el `sticky` solo actuaría dentro de su envoltorio (`:309`), así que no quedaría fija. | Una sola barra fija, como R527 en «Gestiones». | R822 |

## Requisitos (EARS)

«Móvil» = ventana de menos de 768 px. «Tarjeta de gestión del mensajero» = cada gestión de la pestaña
«Gestiones» en `/cierre-dia` (cierre de hoy, rechazado o vencido, y el detalle de «Ver»).

### Tarjeta de gestión (K1, K2, K3)

- **R810** — MIENTRAS la ventana sea móvil, la tarjeta de gestión del mensajero plegada DEBE mostrar
  a la izquierda, cada uno en su línea y en este orden, la guía en mono («—» sin guía), el
  destinatario y la tienda, enteros (R490); y a la derecha, en columna fija, el resultado con su
  información, el rótulo «Ganancia» y el monto debajo («—» si es nulo, R86). Las señales, si las hay,
  siguen debajo.
- **R811** — MIENTRAS la ventana sea móvil, la tarjeta de gestión del mensajero plegada NO DEBE
  mostrar «Devolver a gestión»; CUANDO se despliega una gestión que lo ofrece, el sistema DEBE
  mostrarlo al pie del desplegado con el nombre accesible de hoy, deshabilitado con su motivo si
  viene de la ayuda de la tienda o mientras está en vuelo (R244), y al pulsarlo DEBE abrir el mismo
  diálogo de hoy. El resto del desplegado es el de hoy (R525).
- **R812** — CUANDO el mensajero toca cualquier punto de la tarjeta de gestión plegada que no sea la
  información del resultado, el sistema DEBE desplegarla; y CUANDO la toca desplegada, DEBE plegarla.
  El disparador DEBE ser un botón con `aria-expanded`, el nombre accesible de hoy y al menos 44 px de
  alto.
- **R813** — CUANDO el mensajero toca la información del resultado en la tarjeta, el sistema DEBE
  abrir esa información sin desplegar ni plegar la tarjeta; y la tarjeta NO DEBE tener un botón
  dentro de otro.
- **R814** — MIENTRAS la ventana mida 768 px o más, o la audiencia no sea el mensajero
  (`/cierres-admin`, detalle de bodega), la fila de gestión NO DEBE cambiar: columnas de hoy en
  escritorio (R524) y, en móvil, la tarjeta de hoy con «Devolver a gestión» y chevron en la fila
  (R523).

### Rechazados por la tienda (K8)

- **R815** — MIENTRAS la ventana sea móvil, en `/cierre-dia` cada rechazo de «Rechazados por la
  tienda» DEBE pintarse como fila plegada con la guía en mono, el destinatario, «Motivo: {motivo}»
  entero y la fecha del rechazo en columna fija a la derecha, sin la tienda.
- **R816** — CUANDO el mensajero toca la fila de un rechazo, el sistema DEBE desplegar «Tienda» con su
  nombre y «Fecha del rechazo» con la fecha; CUANDO la toca desplegada, DEBE plegarla. Toda la fila es
  un botón con `aria-expanded` de al menos 44 px.
- **R817** — La nota, «Separar N órdenes…», «Al aprobar el cierre, las N pasan solas…» y el estado
  vacío de la pestaña NO DEBEN cambiar; y MIENTRAS la ventana mida 768 px o más, o fuera de
  `/cierre-dia`, la lista NO DEBE cambiar (R524, R528).

### Cierres solicitados (K10, K11, K12)

- **R818** — MIENTRAS la ventana sea móvil, cada fila plegada de «Cierres solicitados» DEBE mostrar
  arriba el folio en mono (`#XXXXXXXX`), debajo «Solicitado {fecha y hora}» con el chip de estado y
  «Destino: {destino}»; y a la derecha, en columna fija, el rótulo «Ganancia» con el monto debajo.
- **R819** — MIENTRAS la ventana sea móvil, la fila plegada de «Cierres solicitados» NO DEBE mostrar
  «Ver»; CUANDO el mensajero la despliega, el sistema DEBE mostrar «Ver» a todo el ancho, de al menos
  44 px, con el nombre accesible «Ver del cierre del {día}», deshabilitado mientras lee (R181), y al
  pulsarlo DEBE abrir el detalle a pantalla completa (R537).
- **R820** — El desplegado de una fila de «Cierres solicitados» NO DEBE mostrar «Folio», «Recaudado»
  ni «Pago».
- **R821** — MIENTRAS la ventana mida 768 px o más, «Cierres solicitados» NO DEBE cambiar: sus ocho
  columnas de hoy, con «Recaudado» y «Pago» (R60, R156, R157), sin desplegable; y las colas de
  `/cierres-admin` NO DEBEN cambiar.

### Barra fija (K13)

- **R822** — MIENTRAS la ventana sea móvil y el mensajero desplaza «Cierres solicitados», la barra
  con el buscador «Busca por folio», «Filtros» y «Descargar» DEBE seguir visible pegada al borde
  superior, sin desbordar a 360 px ni a 414 px (R536) y con sus botones de 44 px (R493).
- **R823** — MIENTRAS la ventana mida 768 px o más, o en las colas de `/cierres-admin`, la barra NO
  DEBE quedar fija.

### Trazabilidad

- **R824** — Cada requisito R810-R823 DEBE quedar mapeado a un test que falle si se revierte su
  cambio, en `progress/features/SLT-191.md`.

## Tasks

Orden: (T1 ∥ T2 ∥ T3) → T4. `[P]` = paralelizable con sus hermanas.

- [x] **T1 [P] — Tarjeta de gestión** (`fila/FilaGestion.tsx`, `fila/GestionesCierre.tsx`). Prop
  opcional en `FilaGestionProps` que activa la tarjeta del mensajero; `GestionesCierre` la pasa con
  `esMovil && audiencia === "mensajero"`; ausente = DOM de hoy. Con ella: áreas nuevas (guía, dest,
  tienda a la izquierda; resultado, «Ganancia» y monto a la derecha), «Devolver a gestión» al pie del
  desplegado, botón de despliegue estirado sobre la tarjeta y `EstadoConInfo` por encima (DS2).
  *Hecho:* `FilaGestion.test.tsx` y `GestionesCierreMovil.test.tsx` con R810-R814 en verde (incluido
  el caso admin en móvil sin cambios y un aserto de que ningún `button` contiene otro); guardias
  `estado-con-info` y `pwa-mensajero-sin-recorte` en verde. Mutaciones: devolver «Devolver» a la
  fila plegada y quitar el estiramiento del botón dejan algún test en rojo.
- [x] **T2 [P] — Rechazos desplegables** (`detalle/RechazosDeTiendaCierre.tsx`,
  `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`). Prop opcional que activa la fila
  desplegable en móvil (`useIsMobile`); `CierreDiaModule` la pasa en sus tres usos (`:551,582,730`);
  ausente = DOM de hoy. Rótulos `FILA_MOTIVO_LABEL`, `FILA_TIENDA_LABEL`, `RECHAZOS_FECHA_COL`.
  *Hecho:* `CierreRechazosDeTienda.test.tsx` con R815-R817 en verde (con y sin la prop, móvil y
  escritorio); `CierreDiaModule.test.tsx` en verde.
- [x] **T3 [P] — Cola propia y barra** (`cola/TablaColaPropia.tsx`, `cola/ColaCierres.tsx`,
  `cola/cola-propia-vista.ts`). Columna «Cierre» con folio, «Solicitado …» + estado y «Destino: …»;
  columna «Ganancia» con rótulo y monto, sin «Ver»; `detallePropioMovil` pasa a recibir las acciones y
  pinta solo «Ver» a todo el ancho; el envoltorio de barra y «Descargar» lleva `BARRA_FIJA` con
  `tipo === "propios"` y móvil (DS6). Actualizar el comentario de `columnasColaPropiaMovil`.
  *Hecho:* `CierreDiaColaPropia.test.tsx` con R818-R823 en verde; el aserto de hoy
  `["Folio", "#AAAA1111", "Recaudado", …]` (`:333`) y `"₡875Ver"` (`:310`) se reescriben a R819-R820,
  no se borran. Mutación: volver a pintar «Recaudado» en el desplegado deja un test en rojo.
- [ ] **T4 — E2E y gate** (depende de T1-T3). En `e2e/pwa-mensajero-cierre-dia.spec.ts` a 360 y 414
  px: (a) la tarjeta de gestión muestra la guía antes que el destinatario y no muestra «Devolver a
  gestión» hasta desplegar tocando el texto de la tarjeta (R810-R812); (b) en «Cierres solicitados»
  el folio se ve plegado, «Ver» solo tras desplegar (cambia `:198-203`) y la barra sigue arriba al
  bajar (R818-R819, R822). Correr el E2E en local sobre base desechable
  (`docs/perfil-agentes.md > Todos los agentes`) y `./init.sh`.
  *Hecho:* E2E en verde en local; `INIT_EXIT=0`; mapa `R<n> -> test` completo en
  `progress/features/SLT-191.md` (R824).

## Archivos esperados

Producción:
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/GestionesCierre.tsx`
- `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `components/private/cierres/cola/TablaColaPropia.tsx`
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/cola-propia-vista.ts`

Tests:
- `tests/components/FilaGestion.test.tsx`
- `tests/components/GestionesCierreMovil.test.tsx`
- `tests/components/CierreRechazosDeTienda.test.tsx`
- `tests/components/CierreDiaModule.test.tsx`
- `tests/components/CierreDiaColaPropia.test.tsx`
- `e2e/pwa-mensajero-cierre-dia.spec.ts`

Estado:
- `progress/features/SLT-191.md`

`CierreDiaModule.test.tsx` solo si se rompe al pasar la prop de los rechazos; se lista para que el
choque se vea. `FiltrosColaPropiaBarra.tsx`, `BuscadorFiltros.tsx`, `DataTable.tsx`, `EstadoInfo.tsx`,
`CierresAdminModule.tsx` y `DetalleCierreBodegaAbierto.tsx` no se tocan.
**Sin choque con SLT-159 «Escaneo continuo en recepciones y recogidas»** (en vuelo): ninguno de estos
archivos está en sus `## Archivos esperados` (`specs/SLT-159-escaneo-continuo-recepciones/tasks.md`;
su único E2E de cierres es `e2e/cierres-admin.spec.ts`, que aquí no se toca). Tampoco con SLT-190
«Recoger y Recolección según el canvas».

## Tamaño

- **Archivos:** 14 (7 de producción, 6 de tests, 1 de estado), frente al tope de 40 (80 % = 32). Cabe.
- **Líneas de producción:** ~180-280 (prop y áreas de la tarjeta, botón estirado, «Devolver» al
  desplegado; fila desplegable de rechazos; celdas de la cola, desplegado con «Ver» y barra fija).
  Tope 1000.
- **Líneas de tests:** ~400-650 (asertos nuevos y reescritos en cinco tests de componente y dos
  casos del E2E). Tope 3000.

## Preguntas abiertas

Ninguna que bloquee. Para confirmar con Carlos al aprobar el spec (están decididas, no abiertas):
- DC1, efecto en el teléfono: el estado de pago de cada cierre pasado («Pendiente de pago»,
  «Liquidado» o el motivo del rechazo) deja de verse en la lista; queda el chip de estado y, en
  escritorio, la columna «Pago».
- DS3: el resultado pasa a la derecha de la tarjeta, encima de «Ganancia» (resto de la fila K1).
