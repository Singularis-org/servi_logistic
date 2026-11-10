# SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — requirements

> Ruta: completa (`ruta: completa`; complexity `medium`; pantalla de dinero). Zona: **frontend**, que
> pasa a **fullstack** si Carlos responde «sí» a PA1 (lectura de un cierre del día de la satélite
> por la central) o a PA3 (fecha de congelación por cierre del día). Escrito por spec_author el
> 2026-11-10.
>
> Rebanada **S6** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2, R marcados `[S6]`: R31, R40-R43;
> `design.md > Props → quién las usa` fila «Detalle · bodega · central · decidir / solo lectura ·
> modal», `> Qué sustituye cada componente`; `tasks.md > Plan de las demás rebanadas > S6`). Canvas
> aprobado: `specs/SLT-95-detalle-cierre-rediseno/canvas/project/Main.dc.html` (rama `tipo`
> bodega) con sus instancias «Central 8» (`Bodega.dc.html`, modo decidir) y «Central 9»
> (`BodegaRecibido.dc.html`, modo solo lectura), y la fila `FilaSoloLectura.dc.html`
> (`Fila2.dc.html` con audiencia «solo lectura»).
>
> Ya están en `dev` SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» (S1: el
> `DetalleCierre` con `tipo` bodega, sus cifras, su «Dinero», sus pestañas y su pie, probado sin
> montar), SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)», SLT-101 «Fila de
> gestión única y lista con filtros» (`GestionesCierre` ya trae `columnaMensajero` y la audiencia
> «solo lectura») y SLT-102 «Cola de cierres única: mensajeros (central y satélite)». Este archivo
> **no reabre** nada del madre: copia los R `[S6]` con su número y su sentido y añade solo lo que
> S6 necesita y el madre no detalla (R111-R121). **Carlos: «sé fiel al diseño».** Donde el spec se
> aparta del canvas, lo dice y por qué (`design.md > Fidelidad al canvas`).

## Alcance

`/cierres-admin` › Bodega, para la **central** (maestro/admin, acceso total). Al pulsar «Ver /
decidir» en la cola de pendientes o «Ver» en Resueltos:

- `CierresBodegaAdminModule` monta el **detalle único** (`DetalleCierre`, `tipo` bodega, audiencia
  central, marco modal) en lugar del `Modal` de hoy con sus paneles sueltos.
- El detalle trae las cuatro pestañas del canvas: «Dinero» (ya hecha en S1), «Gestiones (n)» con la
  fila única en audiencia «solo lectura» y la columna Mensajero, «Mensajeros (n)» (una fila por
  cierre del día incluido, con «Ver su cierre») y «Conciliación» (la cuenta en formato cascada).
- El pie lleva las acciones de `ConciliacionAcciones` (Marcar recibido / Corregir / Desmarcar) y
  «Cerrar», con los mismos flujos de hoy.

## Lo que NO entra

- La cola de bodega de la central («Por conciliar / Conciliados», SLT-105 «Cola de bodega de la
  central: Por conciliar y Conciliados»): las tarjetas `CierreBodegaFacturaResumen`, la barra y el
  `SegmentedToggle` de hoy siguen igual. Solo cambia lo que se abre al pulsar.
- El cierre de bodega visto por la satélite (SLT-107 «Bodega satélite: Solicitados y su cierre de
  bodega en lectura») y su «A consolidar» (SLT-106 «Bodega satélite: A consolidar con la cola
  única»). `ConsolidacionBodegaModule` no cambia.
- El reparto en porcentajes de «Dinero» (SLT-111 «Cifras del servidor: reparto en % y señales de la
  cola»): la barra sigue como la dejó S1.
- El trato «tú» de los textos que se **reutilizan** sin escribirlos (los toasts de error de
  `abrirDetalle` en voseo, los diálogos de `ConciliacionAcciones`): SLT-103 «Diálogos del módulo de
  cierres y trato tú». Los textos **nuevos** de esta ficha nacen en «tú».
- Lo que el modal de hoy pinta y el canvas no dibuja, y que deja de verse en el detalle de bodega:
  las dos cascadas y el «Por tienda» **por cada cierre del día**, el desglose «Ingreso de la empresa»
  por concepto (`TotalesIngresoPanel`) y el «Motivo de rechazo» de una consolidación `rechazado`
  histórica (la ficha 431 retiró ese rótulo; su comentario en `CierresBodegaAdminModule.tsx` dice que
  hay cero en producción). Lo de cada cierre del día pasa a su propio detalle, al que lleva «Ver su
  cierre» (R42, R115; ver **PA1**).
- Borrar `CascadaDinero`, `GestionesPorResultado`, `TotalesPanel`, `TotalesIngresoPanel` o
  `lineasCascadaDueno`: SLT-115 «Retirar los componentes de cierre sustituidos».
- Cambiar cómo se calcula, congela o asienta un importe, la conciliación, esquema o migraciones
  (R71, R72).

## Decisiones cerradas (no reabrir)

Vienen del spec madre (`specs/SLT-95-detalle-cierre-rediseno/requirements.md`), de
`progress/features/SLT-95.md`, `SLT-100.md`, `SLT-101.md` y `SLT-102.md`, y de las reglas que Carlos
repitió en cada rebanada. Aquí solo las que S6 hace visibles.

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Reglas: identidad y estado arriba; lo que pide atención, primero; acciones fijas al pie; un solo scroll; un solo trato: tú. |
| D15 | 2026-11-09 · Carlos | Componentes IGUALES con props distintas, nunca uno por rol ni por tipo. |
| D16 | 2026-11-09 · Carlos | Tarjetas con mucha información (conciliación) en formato cascada. |
| D17 | 2026-11-09 · Carlos / n0 | Se reutilizan tal cual `BuscadorFiltros` + `DescargarDatasetButton`, `Modal` y el conmutador Bodega/Mensajero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado (versión 33) con sus notas. |
| D20 | 2026-11-09 · Carlos | Una cifra, un nombre. |
| S3-4 | 2026-11-09 · Carlos (SLT-101 PA4) | Filtros = `BuscadorFiltros` (+ `FilterComponent`); nada de controles nuevos. |
| S4-1 | 2026-11-10 · Carlos | Fiel al canvas aprobado; donde el spec se aparte, lo dice y por qué, como pregunta. |
| S4-3 | 2026-11-09/10 · Carlos | Un solo PR, sin partir («si dale con que no partas el código para evitar errores», SLT-100). |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D5 | R71, R72, R114, R117 |
| D6 | R111 (estado y modo), R112 (acciones al pie), R117 (textos nuevos en «tú») |
| D15 | R40, R31, R113 (el mismo `DetalleCierre` y la misma `GestionesCierre` que el detalle de mensajero) |
| D16 | R43, R117 |
| D17 | R113 («Descargar» = `DescargarDatasetButton`; filtros = `BuscadorFiltros` de `GestionesCierre`) |
| D18, S4-1 | R41-R43, R111-R121 (cada uno cita lo que dibuja el canvas); `design.md > Fidelidad al canvas` |
| D20 | R114 («A la central» por cierre, nombre del canvas), R117 («Recibido», «Falta por recibir» con los rótulos que ya existen) |
| S3-4 | R113 |
| S4-3 | `tasks.md > Tamaño`; PA4 |

## Requisitos (EARS)

Los R con número ≤ 78 son copia del madre: mismo número y mismo sentido. R111-R121 son nuevos de
S6 (R115, R116 dependen de PA1; R120, de PA3; R121, de PA2). El test previsto de cada R está en
`tasks.md > Trazabilidad`.

### Detalle de bodega (copia del madre)

- **R31** [S6] — MIENTRAS el detalle sea de tipo bodega, sus filas DEBEN usar la audiencia «solo
  lectura»: ninguna acción de corrección ni de ajuste; las evidencias sí.
- **R40** [S6] — CUANDO la central abre un cierre de bodega, el sistema DEBE abrir el detalle único
  con `tipo` bodega y audiencia central, en lugar del modal actual.
- **R41** [S6] — «Gestiones» de bodega DEBE listar las gestiones de todos los cierres del día
  incluidos, con la columna Mensajero.
- **R42** [S6] — «Mensajeros» DEBE mostrar una fila por cierre del día incluido: mensajero,
  gestiones, recaudado, pago, a la central (`paraLaCentral` de ese cierre), señales
  (`gestionesAjustadas`) y el enlace «Ver su cierre» a `hrefDetalleCierre(cierreDiaId)`.
- **R43** [S6] — «Conciliación» DEBE mostrar en formato cascada «Debe llegar a la central»
  (`paraLaCentral`), «− Recibido» (`—` sin marca, nunca ₡0), «Falta por recibir»
  (`faltaPorRecibir`) y quién marcó y cuándo («Aún nadie» sin marca).

### Lo que S6 añade (nuevo)

- **R111** [S6, nuevo] — CUANDO la central abre un cierre de bodega, el detalle DEBE abrirse en
  modo «decidir» SI la consolidación está pendiente de conciliar (`conciliado = false`), y en modo
  «solo lectura» SI está recibida o recibida incompleta (`conciliado = true`), tanto desde «Ver /
  decidir» de la cola como desde «Ver» de Resueltos. El estado de la cabecera DEBE ser la pastilla
  de hoy (`estadoConciliacionDe` + `ESTADO_CONCILIACION_VARIANT`): «Pendiente de conciliar» ámbar,
  «Recibido» verde, «Recibido incompleto» ámbar.
- **R112** [S6, nuevo] — DONDE el actor pueda conciliar (`puedeConciliar`, decidido en el servidor),
  el pie DEBE pintar `ConciliacionAcciones` con la consolidación abierta (bodega, día en calendario
  de Costa Rica, declarado = `paraLaCentral`, la marca y la nota del servidor) y «Cerrar»: en modo
  decidir, «Cerrar» secundario y después la acción; en solo lectura, la acción y después «Cerrar»
  principal. DONDE no pueda, el pie DEBE pintar solo «Cerrar». CUANDO una marca, corrección o
  desmarcado termina (también en `conflict`), el sistema DEBE cerrar el detalle y volver a leer las
  dos listas («Pendientes» y «Resueltos»), igual que hoy.
- **R113** [S6, nuevo] — «Gestiones» de bodega DEBE montar la lista única (`GestionesCierre`) con
  audiencia «solo lectura», la columna Mensajero (el `mensajeroNombre` del cierre del día de cada
  gestión), los filtros por resultado con su conteo, «Ver evidencia» en el visor de hoy y el
  fulfillment de la fila porque quien mira es la central (R30). El orden de «Todas» DEBE ser el de
  la lista única (por resultado) y, dentro de cada resultado, el de `cierres[]` del servidor y luego
  el de sus gestiones. A la derecha de los filtros DEBE ofrecer «Descargar»
  (`DescargarDatasetButton`) con todas las gestiones del detalle y las mismas columnas que se ven,
  incluida «Mensajero» (R21 aplicado a bodega).
- **R114** [S6, nuevo] — Cada fila de «Mensajeros» DEBE pintar, sin derivar nada en el cliente y en
  el orden de `cierres[]` del servidor: Mensajero = `mensajeroNombre`; Gestiones = número de
  gestiones de ese cierre del día; Recaudado = `totales.general`; Pago = `totalPagoMensajero`; A la
  central = `paraLaCentral` de ese cierre (con su signo si es negativo); los cuatro números alineados
  a la derecha y los importes con el formateador compartido (`money()`). Señales DEBE decir «1 pago
  ajustado» / «N pagos ajustados» SI `gestionesAjustadas` > 0, y «—» SI vale 0 o no llega.
- **R115** [S6, nuevo; depende de PA1] — CUANDO la central pulsa «Ver su cierre» en una fila de
  «Mensajeros», el sistema DEBE cerrar el detalle de bodega y abrir el detalle único de ese cierre
  del día (`tipo` mensajero, audiencia central) por el enlace de hoy (`hrefDetalleCierre`), sin que
  el detalle de bodega quede abierto debajo.
- **R116** [S6, nuevo; solo si PA1 = sí] — SI la central abre un cierre del día cuyo destino es una
  bodega satélite de su empresa, ENTONCES el servidor DEBE devolver su detalle, y el detalle DEBE
  abrirse en modo «solo lectura» con las filas en audiencia «solo lectura», sin la pestaña «Pago al
  mensajero» y sin ninguna acción de decisión, destrabe, corrección, ajuste ni pago. Las Server
  Actions de escritura NO DEBEN ensanchar su alcance: sobre ese cierre DEBEN seguir respondiendo
  como hoy. Un cierre de **otra empresa** NO DEBE devolverse.
- **R117** [S6, nuevo] — La pestaña «Conciliación» DEBE ser una cuenta en formato cascada (R15) con
  título «Conciliación» y estas líneas: «Debe llegar a la central» = `paraLaCentral`; «− Recibido» =
  `montoRecibido`, o «—» SI llega `null`; «Falta por recibir» = `faltaPorRecibir` como total en
  negrita (con su signo; negativo = llegó de más); y bajo la cuenta, separada por raya punteada,
  «Marcó: <conciliadoPorNombre> · <fecha y hora de conciliadoAt>» o «Marcó: Aún nadie» SI no hay
  marca. Ninguna línea DEBE convertir, sumar ni restar importes en el cliente.
- **R118** [S6, nuevo] — CUANDO se abre el detalle de bodega, `CierresBodegaAdminModule` NO DEBE
  montar el `Modal` «Detalle del cierre de bodega» de hoy ni sus piezas (`TotalesPanel`,
  `CascadaDinero`, `DesglosePorTienda`, `TotalesIngresoPanel`, los bloques «Cierre del día · <X>»,
  `GestionesPorResultado`). La cola de pendientes, Resueltos, la barra de filtros, la descarga de la
  cola y el conmutador Bodega/Mensajero NO DEBEN cambiar.
- **R119** [S6, nuevo] — El detalle de bodega DEBE ser un `dialog` cuyo nombre accesible contenga
  «Detalle del cierre de bodega» y la zona, con «Cerrar» (X) arriba. SI la lectura del detalle
  devuelve `no_encontrada`, `forbidden`, `unauthenticated` u otro error, ENTONCES el sistema NO DEBE
  abrir el detalle y DEBE mostrar los avisos de hoy (con `no_encontrada`, además, volver a leer las
  listas).
- **R120** [S6, nuevo; solo si PA3 = sí] — En «Gestiones» de bodega, «Ver cómo se calculó» DEBE
  fechar la nota de las tarifas congeladas con el instante en que se solicitó el cierre del día de
  esa gestión. SI PA3 = no, ENTONCES la nota DEBE salir sin fecha («Tarifas tal como estaban al
  crear el cierre.»), nunca con la fecha del cierre de bodega.
- **R121** [S6, nuevo; según PA2] — El conteo de la pestaña «Mensajeros (n)» DEBE ser igual al
  número de filas que la pestaña pinta (cierres del día incluidos).

### Dinero intacto y verificación (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S6] — Para un mismo cierre de bodega, cada cifra que ve la central (las cuatro cifras,
  «Mensajeros» y «Conciliación») DEBE ser igual al céntimo al importe escrito a mano en el escenario
  E2E, con un cierre de bodega del modelo viejo y otro del modelo nuevo.

## Preguntas abiertas

Para Carlos. PA1 decide la zona y si existen T1, R115 y R116; las demás no bloquean empezar.

- **PA1 — «Ver su cierre» no abre nada para la central hoy (posible cambio a fullstack).** El canvas
  pone en cada fila de «Mensajeros» el enlace «Ver su cierre» (R42). Todos los cierres del día de un
  cierre de bodega son de una **bodega satélite**, y la central solo puede leer cierres del día con
  destino bodega central: `CierresAdminService.resolveAlcance` (`lib/services/CierresAdminService.ts:512-521`)
  le da `destinoTipo: "bodega_central"` y `findCierreByIdEnAlcance` lo exige en el `WHERE`
  (`lib/repositories/CierresAdminRepository.ts:1613-1614`, `alcanceWhere` en la línea 852). El enlace
  abriría `/cierres-admin?cierre=<id>` y la pantalla respondería «no disponible». Y es justo donde
  tienen que ir las dos cascadas y el «Por tienda» de cada cierre del día que el modal de hoy
  enseñaba y el canvas ya no dibuja en el detalle de bodega.
  **Recomendación: (a)** traer aquí la lectura: con acceso total, `verCierreDetalle` devuelve también
  los cierres del día de las bodegas satélite de la empresa, **solo para leer** (R116): se abren en
  solo lectura, sin pago, decisión, corrección ni ajuste, y las Server Actions de escritura no
  cambian su alcance. La ficha pasa a **fullstack** (+6 archivos, ~+450 líneas: el alcance de lectura
  en servicio y repositorio, el modo forzado en `CierresAdminModule` y su test, un test de servicio y
  uno de integración contra la base con un cierre de otra empresa que no se cuela).
  (b) Pintar «Ver su cierre» sin destino hasta otra ficha: no se ve el detalle de cada mensajero
  desde ninguna parte (hoy sí, en el modal). (c) Quitar el enlace: desviación del canvas.
- **PA2 — «Mensajeros (n)»: ¿mensajeros o cierres?** R42 pide una fila **por cierre del día**, y S1
  cuenta la pestaña y la cabecera («2 mensajeros») por **mensajeros distintos**
  (`vistaBodegaDesdeAdmin`, `new Set(mensajeroId)`). Si un mensajero tiene dos cierres del día en la
  misma consolidación (posible: se consolidan todos los aprobados sin cierre de bodega), la pestaña
  diría «Mensajeros (1)» con dos filas. El canvas no dibuja ese caso. **Recomendación:** la pestaña
  cuenta filas (cierres) (R121), y la cabecera sigue contando mensajeros distintos, que es lo que
  dice su texto.
- **PA3 — Fecha de «Tarifas tal como estaban al crear el cierre (…)» en la fila de bodega.** La fila
  del canvas fecha la nota con el cierre del día. En bodega cada gestión es de un cierre del día
  distinto y `CierreBodegaDetalleCierre` no trae su `solicitadoAt`. **Recomendación:** traerlo
  (campo aditivo en `CierreBodegaDetalleCierre` y un campo opcional en la fila; +6 archivos contando
  su test, ~+120 líneas) para pintar la nota como el canvas. Si dices «no», la nota sale sin fecha
  (R120), nunca con la del cierre de bodega.
- **PA4 — Tamaño.** ~42 archivos / ~2 700 líneas con PA1 y PA3 (sin ellas, ~30 / ~1 900); el límite
  es 40. Casi la mitad son tests y E2E que hoy abren el modal de bodega y leen sus paneles. Siguiendo
  tu regla «no partir» (S4-3), se pide la marca `tamano-pr-aceptado`.
- **PA5 — Botones de la conciliación al pie.** El canvas dibuja «Marcar recibido» y «Desmarcar» del
  alto de los demás botones del pie, y «Desmarcar» con borde. `ConciliacionAcciones` los pinta en
  tamaño `sm` y «Desmarcar» como `ghost` (sin borde), y lo comparte con `/wallet/satelites`.
  **Recomendación:** dejarlo como está en S6 (un componente compartido no se retoca para una
  pantalla) y que SLT-114 «Estado de cuenta de la satélite: conciliación en pestaña», que rediseña la
  otra pantalla que lo monta, lo iguale en las dos. Se mira en Preview.

**Para el Preview** (no bloquean):
- las pestañas dicen «Gestiones (31)» / «Mensajeros (2)» con paréntesis (S1, R10 del madre) y el
  canvas «Gestiones 31»;
- fechas como «2026-11-07 19:05» (`fechaHora`) en vez de «07/11/2026 19:05» del canvas (SLT-92
  «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa» unifica);
- en una consolidación ya asentada en la caja no aparece «Desmarcar» (SLT-76): el canvas lo dibuja
  en «Recibido» porque no distingue ese caso;
- los toasts de error al abrir el detalle siguen en voseo hasta SLT-103.
