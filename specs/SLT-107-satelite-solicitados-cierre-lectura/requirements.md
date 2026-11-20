# SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» — requirements

> Ruta: completa (`ruta` = completa; complexity `medium`; **permiso nuevo** y pantalla de dinero).
> Zona: **fullstack**. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S9** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2: R49-R52 y R68 `[S9]`, R32, R71, R72 y
> R77; `design.md > Autorización` «Único cambio de permiso (S9, R50)»; `tasks.md > Plan de las demás
> rebanadas > S9`). Canvas aprobado: `canvas/project/ColaCierres.dc.html`, rama «bodega · satélite»,
> pestaña «Solicitados» (líneas 182-191), y `Main.dc.html` (detalle de bodega con audiencia satélite,
> líneas 396 y 404).
>
> Dependencias en `dev`: SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (el
> detalle de bodega), SLT-106 «Bodega satélite: A consolidar con la cola única» (la cola de la
> satélite, que dejó «Solicitados» como pestaña con la lista de hoy, R201), SLT-110 «Cifras del
> servidor en la fila: bodega» (fecha del cargo de fulfillment). En vuelo: SLT-111 «Cifras del
> servidor: reparto en % y señales de la cola» (PR #139), cuya herencia se cumple aquí (D-H111).
> Este archivo **no reabre** nada del madre.

## Alcance

`/cierres-admin` › Bodega, para la **bodega satélite** (`adminSatelite`, acotada a su zona):

- **Permiso nuevo en el servidor:** la satélite lee el detalle de **su** cierre de bodega (el de su
  zona) por el mismo método que la central (`verCierreBodegaDetalle`), con el filtro de zona en la
  consulta, sin los campos de fulfillment ni la marca `desmarcable`. Fuera de su zona: `forbidden`.
- **Pestaña «Solicitados» con la cola única:** tarjetas «Por llegar a la central», «Recibido por la
  central (30 días)» y «Falta por recibir» (cifras nuevas del servidor, R68), tabla de cierres de
  bodega con «Ver», pie con su texto y la paginación. Sustituye a la lista de hoy dentro de la cola
  (R201 de SLT-106).
- **Filtros en «Solicitados»:** la lista y su conteo respetan la barra de filtros, igual que ya lo
  hace su descarga (R52). Acaba la excepción PA2 de SLT-106 (conteo sin filtros).
- **«Ver»** abre el detalle único con `tipo` bodega, audiencia satélite y marco modal, sin acciones
  salvo «Cerrar».
- El montaje del detalle de bodega pasa a **un solo componente** que usan la central y la satélite.
- Deuda de SLT-106: R190/R191 sin test (conservar filtros y página al cambiar de pestaña; un filtro
  vuelve a la página 1) queda cubierta aquí (R291).

## Lo que NO entra

- La conciliación (marcar recibido, corregir, desmarcar) y quién puede hacerla: siguen siendo de la
  central (R285). Ningún permiso de escritura cambia.
- El enlace directo `?cierreBodega=` para la satélite (hoy solo lo tiene la central, SLT-114).
- Que la lista de «Solicitados» del servidor (`CierreBodegaService.listarCierresBodegaSolicitados*`)
  deje de emitir `desmarcable`: es un dato de la cabecera que ya viaja desde la feature 170 y la
  pantalla de la satélite no lo usa. Si se quiere quitar, ficha aparte.
- Títulos, columnas y claves de los archivos de «Descargar»: no se tocan (SLT-113 «Excel del modelo
  nuevo de cierres»).
- Trato «tú» de los textos que el módulo ya tiene con voseo (toasts de `ConsolidacionBodegaModule` y
  `CierresBodegaAdminModule`): SLT-134 «Textos de pantalla de cierres en tú, con guardia». Los textos
  **nuevos** de esta ficha nacen en «tú».
- Borrar `CierresBodegaSolicitadosLista`, `CierreBodegaFacturaResumen` y `ListaComprobantes`: SLT-115
  «Retirar los componentes de cierre sustituidos». La lista de hoy se sigue montando sin zona (R202).
- `/wallet/satelites` y su enlace al detalle de bodega (R78, S17).
- Calcular, congelar o asentar importes de otra forma; esquema y migraciones (R72).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D4 | 2026-11-08 · Carlos | Los métodos de pago en 0 no se muestran. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D9 | 2026-11-09 · Carlos | Una ficha por rebanada; esta es S9. |
| D15 / S4-2 | 2026-11-09 / 2026-11-10 · Carlos | Mismo flujo = UN componente con props; nunca un componente por rol o por tipo. |
| D17 | 2026-11-09 · Carlos | Se reutilizan tal cual `BuscadorFiltros` (vía `FiltrosCierresBarra`), `DescargarDatasetButton` y el conmutador Bodega/Mensajero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado (versión 33) con sus notas. |
| D19 | 2026-11-09 · medición en prod | Las vistas del modelo viejo deben verse bien; el E2E cubre los dos modelos. |
| D-S9 | 2026-11-09 · Carlos (madre `design.md > Autorización`) | Único cambio de permiso: la satélite lee el detalle de SU cierre de bodega; filtro de zona en el `WHERE` del repositorio (no se lee y se descarta); fuera de zona o sin zona, `forbidden`; el servidor no emite fulfillment ni `desmarcable` para ella. |
| D-H110 | 2026-11-12 · leader (`specs/SLT-110-cifras-servidor-fila-bodega/design.md > Lo que hereda SLT-107`) | Al abrir el detalle de bodega a la satélite, `fulfillmentCargadoAt` se anula junto con los demás campos de fulfillment, como `ocultarFulfillmentSiNoCentral`. |
| D-H111 | 2026-11-12 · leader y Carlos (`progress/features/SLT-111.md` en la rama de SLT-111, T7.3) | Si la satélite abre por `verCierreBodegaDetalle` y se mapea con `vistaBodegaDesdeAdmin`, recibe `porcentajesReparto` sin más código: no lo recalcula ni lo deriva en el cliente, no añade lecturas para el reparto ni escribe. |
| D-PA2-106 | 2026-11-12 · Carlos (SLT-106 PA2) | El conteo de «Solicitados» fue sin filtros **hasta SLT-107**; esta ficha lo pasa a «con los filtros puestos» (R290). |
| D-T03 | 2026-11-12 · Carlos (T0.3, opción a) | «Corregir recibido» reescribe `cierre_bodega.conciliado_at` (`CierresBodegaAdminRepository.corregirConciliacion`), y se acepta: el ancla de «Recibido por la central (30 días)» es el `conciliado_at` **vigente**. Un cierre recibido hace 45 días y corregido hoy cuenta en los 30 días (R287). |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D4 | R286 (ninguna tarjeta de «Solicitados» lleva métodos de pago) |
| D5 | R71, R72, R287 (sumas de importes ya derivados por el mapper; ninguna fórmula nueva) |
| D9 | `## Alcance` y `## Lo que NO entra` |
| D15 / S4-2 | R32, R295 (la misma `ColaCierres` y un solo montaje del detalle de bodega) |
| D17 | R52, R290, R291 (la barra y «Descargar» de hoy) |
| D18 | R49, R286, R288, R289, R292 (cada uno cita lo que dibuja el canvas) |
| D19 | R77 (E2E con un cierre de cada modelo) |
| D-S9 | R50, R280, R281, R283 |
| D-H110 | R283 |
| D-H111 | R284 |
| D-PA2-106 | R290 |
| D-T03 | R287 |

## Requisitos (EARS)

Los R ≤ 78 son copia del madre, con su número y su sentido. R280-R296 son nuevos de S9. El test
previsto de cada R está en `tasks.md > Trazabilidad`.

### Copia del madre

- **R32** [S4; alcance S9] — El sistema DEBE pintar toda lista de cierres del módulo con un único
  componente de cola, parametrizado por `tipo` y `rol`, con: descripción por rol; pestañas con conteo;
  la barra existente (`BuscadorFiltros` + `DescargarDatasetButton`) con los filtros de hoy por rol;
  tarjetas de cifras cuando el rol las tiene; una tabla con una fila por cierre y sus acciones; y un
  pie. DONDE el `tipo` sea bodega y el `rol` satélite, la cola DEBE mostrar tarjetas de cifras, aviso y
  botón en el pie solo en la pestaña «A consolidar».
  *Alcance S9:* la pestaña «Solicitados» tiene sus propias tarjetas (R49) y su pie sin botón (R289);
  el aviso y el botón siguen siendo solo de «A consolidar».
- **R49** [S9] — La pestaña «Solicitados» de la satélite DEBE mostrar las tarjetas «Por llegar a la
  central», «Recibido por la central (30 días)» y «Falta por recibir» (R68), y la tabla con Folio,
  Solicitado, Cierres, Recaudado, Debe llegar, Recibido, Falta, Estado y «Ver».
- **R50** [S9] — CUANDO la satélite pulsa «Ver» en uno de sus cierres de bodega, el sistema DEBE
  abrir el detalle único con `tipo` bodega, audiencia satélite y modo solo lectura. SI el cierre de
  bodega no es de su zona, ENTONCES el servidor DEBE responder `forbidden` y la pantalla no DEBE
  mostrar nada de él.
  *Lectura de «modo solo lectura»:* sin ninguna acción salvo «Cerrar» (R292; PA1).
- **R51** [S9] — Con audiencia satélite, el detalle de bodega NO DEBE mostrar fulfillment ni
  acciones de conciliación.
- **R52** [S9] — La lista «Solicitados» DEBE respetar el filtro de fecha de solicitud, igual que su
  descarga.
- **R68** [S9] — El servidor DEBE emitir para la zona de la satélite: «Por llegar a la central»
  (suma de `paraLaCentral` de sus cierres de bodega sin conciliar), «Recibido por la central (30
  días)» (suma de `montoRecibido` conciliado en los últimos 30 días calendario de Costa Rica) y
  «Falta por recibir» (suma de `faltaPorRecibir` positivo de los recibidos incompletos), con sus
  conteos. Estas tarjetas NO DEBEN depender del filtro de fecha.
  *Nota:* «de Costa Rica» = la zona horaria del país de la empresa (`reglasPais.zonaHoraria`), como
  el madre fija en `design.md > Datos que dependen del país`; ningún literal de país en código.
- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S9] — Para un mismo cierre, cada cifra que ve cada audiencia (central, satélite,
  mensajero) DEBE ser igual al céntimo al importe escrito a mano en el escenario E2E, con un cierre
  del modelo viejo y otro del modelo nuevo.
  *Alcance S9:* el detalle de bodega visto por la satélite frente al visto por la central.

### Permiso de lectura del detalle de bodega (servidor)

- **R280** — CUANDO un `adminSatelite` pide el detalle de un cierre de bodega, el servidor DEBE
  devolverlo SOLO SI la zona del cierre de bodega es la zona de ese usuario, leída de su usuario en la
  base (nunca de la petición), y el filtro de zona DEBE ir en la consulta que lee la cabecera del
  cierre de bodega, junto al de empresa.
- **R281** — SI el que pide es un `adminSatelite` y el cierre de bodega no es de su zona, no existe o
  el usuario no tiene zona, ENTONCES el servidor DEBE responder `forbidden`, sin leer los cierres del
  día ni las gestiones de ese cierre y sin firmar ninguna evidencia. Para acceso total, un cierre que
  no existe DEBE seguir respondiendo `no_encontrada`.
- **R282** — SI el que pide no es de acceso total ni `adminSatelite`, ENTONCES el servidor DEBE
  responder `forbidden` antes de leer nada, como hoy.
- **R283** — CUANDO el que pide no es de acceso total, el servidor DEBE emitir, en cada gestión del
  detalle, `fulfillment`, `ivaFulfillment`, `tarifa.fulfillment`, `fulfillmentConIva`,
  `ivaPctFulfillment` y `fulfillmentCargadoAt` en `null` (los que vengan), con la misma función que
  ya los anula en el detalle de mensajeros (`ocultarFulfillmentSiNoCentral`), y la cabecera DEBE
  llevar `desmarcable: false`. El criterio DEBE ser «no es acceso total» (falla cerrado), no «es
  `adminSatelite`».
- **R284** — Para un mismo cierre de bodega, el resultado que recibe la satélite DEBE ser igual al
  que recibe la central en todo campo distinto de los de R283 (cabecera, cierres del día, totales,
  derivados, desglose por tienda y, cuando exista, `porcentajesReparto`), y el servidor NO DEBE
  ejecutar para ella ninguna lectura que no ejecute para la central.
- **R285** — `aprobarCierreBodega`, `rechazarCierreBodega` y las acciones de la conciliación (marcar
  recibido, corregir, desmarcar) NO DEBEN cambiar: para un `adminSatelite` DEBEN seguir respondiendo
  `forbidden`.

### «Solicitados» con la cola única (pantalla y servidor)

- **R286** — Las tarjetas de «Solicitados» DEBEN pintar, en este orden, sin métodos de pago y con los
  strings del servidor formateados con `money()`:
  - «Por llegar a la central»: el monto de R287, destacada, con la nota «1 cierre pendiente de
    conciliar» / «<n> cierres pendientes de conciliar»;
  - «Recibido por la central (30 días)»: el monto de R287, con la nota «1 cierre de bodega» /
    «<n> cierres de bodega»;
  - «Falta por recibir»: el monto de R287, con la nota «1 llegó incompleto» / «<n> llegaron
    incompletos», y en tono de aviso SOLO SI su conteo es mayor que 0.
  Las tres DEBEN pintarse también cuando valen "0.00" (PA2).
- **R287** — `listarConsolidacion` DEBE emitir, para la zona del actor y sin depender de filtros ni
  de páginas, tres pares (monto como string de escala 2, conteo entero):
  - «por llegar»: los cierres de bodega de la zona sin marca de recibido (`conciliadoAt` nulo); monto
    = suma de su `paraLaCentral`, con su signo;
  - «recibido en 30 días»: los de la zona con `conciliadoAt` desde las 00:00 de hace 29 días en la
    zona horaria de la empresa (30 días calendario contando hoy) hasta ahora; monto = suma de su
    `montoRecibido`;
  - «falta por recibir»: los de la zona con marca de recibido y `faltaPorRecibir` mayor que 0; monto =
    suma de su `faltaPorRecibir`.
  Las sumas DEBEN hacerse con aritmética decimal en el servidor sobre los campos que ya emite el mapper
  de la cabecera, y el conjunto DEBE ser el que `listarConsolidacion` ya lee de la zona. SI la satélite
  no tiene zona, ENTONCES los tres pares DEBEN ser `"0.00"` y 0.
- **R288** — Cada fila de «Solicitados» DEBE pintar, sin derivar ni calcular nada en el cliente:
  - Folio: «#» + el folio del cierre de bodega, en monoespaciado;
  - Solicitado: fecha y hora de la solicitud;
  - Cierres: `cantidadCierres`;
  - Recaudado: `totales.general`;
  - Debe llegar: `paraLaCentral`, en negrita y con su signo;
  - Recibido: `montoRecibido`; SI no hay marca, ENTONCES «—» (nunca cero);
  - Falta: `faltaPorRecibir`, resaltada SOLO SI es mayor que 0;
  - Estado: «Pendiente de conciliar», «Recibido incompleto» o «Recibido», de `estadoConciliacionDe`;
  - la acción «Ver», con nombre accesible «Ver el cierre de bodega #<folio>».
  La tabla NO DEBE tener las columnas Bodega ni Solicitó.
- **R289** — MIENTRAS la pestaña activa sea «Solicitados», la cola DEBE mostrar las tarjetas de R286,
  la tabla en una región con nombre «Cierres de bodega solicitados» y un pie con el texto «"Ver" abre
  el cierre de bodega con su dinero, sus gestiones, sus mensajeros y lo que marcó la central.» y la
  paginación con su nombre de hoy («Paginación de los cierres de bodega solicitados»), sin aviso y sin
  el botón de solicitar. MIENTRAS su página no haya llegado, DEBE mostrar el estado de carga; SI la
  lectura falla, ENTONCES «No se pudieron cargar los cierres de bodega solicitados.»; SI está vacía,
  ENTONCES «Aún no has solicitado ningún cierre de bodega.». Este requisito sustituye a R201 de
  SLT-106.
- **R290** — El conteo de la pestaña «Solicitados <n>» DEBE ser el `total` que da el servidor con los
  filtros puestos, el mismo de la tabla. La página 1 precargada por el Server Component SOLO DEBE
  usarse mientras no haya filtros. Sustituye a la cláusula «el total de cierres de bodega de la zona»
  de R190 de SLT-106.
- **R291** — CUANDO la satélite cambia un filtro, el sistema DEBE pedir las dos pestañas con ese
  filtro y devolver las dos a su página 1. CUANDO cambia de pestaña, el sistema DEBE conservar los
  filtros puestos y la página en la que estaba cada pestaña.

### «Ver»: el detalle de bodega con audiencia satélite (pantalla)

- **R292** — CUANDO la satélite pulsa «Ver», el sistema DEBE abrir el detalle único (R1) con `tipo`
  bodega, audiencia satélite y marco modal, con las pestañas Dinero, Gestiones, Mensajeros y
  Conciliación; la pestaña Gestiones en «solo lectura» sin fulfillment; y en el pie solo «Cerrar». El
  `modo` DEBE salir de la marca de recibido (`modoBodegaDe`), de modo que un cierre sin marca muestre
  «la central aún no marca el dinero recibido» (R4 del madre) y el pie «Declarado … · la central lo
  marca recibido cuando llega» (PA1). El detalle NO DEBE montar `ConciliacionAcciones`.
- **R293** — SI la lectura del detalle no responde `ok`, ENTONCES el sistema NO DEBE abrir el detalle
  y DEBE avisar: `forbidden` y `no_encontrada` → «No tienes permiso para ver este cierre de bodega.»;
  `unauthenticated` → «Tu sesión expiró. Inicia sesión de nuevo.»; cualquier otro → «No se pudo abrir
  el detalle del cierre de bodega. Inténtalo de nuevo.».
- **R294** — CUANDO la satélite pulsa «Ver su cierre» en la pestaña Mensajeros del detalle de bodega,
  el sistema DEBE cerrar el detalle de bodega y abrir el detalle del cierre del día por
  `hrefDetalleCierre(cierreDiaId)`, el mismo camino que la central.
- **R295** — El detalle de bodega DEBE montarse con un único componente para la central y la
  satélite, parametrizado por la audiencia y por el nodo de la conciliación (ausente para la
  satélite). Para la central, el detalle DEBE seguir igual: mismas pestañas, cifras, acciones, textos
  y nombres accesibles (suite de `CierresBodegaAdminDetalleUnico` sin cambios).
- **R296** — La pestaña «A consolidar» (SLT-106), la cola de mensajeros (SLT-102) y la cola de bodega
  de la central (SLT-127) DEBEN seguir igual, salvo lo que R291 añade a «A consolidar» (pedir con los
  filtros y volver a la página 1 ya lo hacía; conservar página y filtros al volver de «Solicitados»).

## Preguntas abiertas

- **PA1 — Modo del detalle de la satélite.** El madre dice «modo solo lectura» (R50) y a la vez da a
  la satélite el texto «la central aún no marca el dinero recibido» en modo decidir de bodega (R4), y
  el canvas (`Main.dc.html` 396 y 404) también. **Recomendación (aplicada en R292):** `modo` =
  `modoBodegaDe` (decidir si no hay marca, solo lectura si la hay) y «solo lectura» entendido como «sin
  acciones»: el pie de la satélite solo tiene «Cerrar» en los dos modos (`accionesDe` ya lo hace así
  para audiencia ≠ central). Si Carlos prefiere modo solo lectura siempre, R292 pierde la franja y la
  coletilla del pie; el resto no cambia.
- **PA2 — Textos y ceros de las tarjetas de «Solicitados».** El canvas solo muestra el caso con datos.
  **Recomendación (aplicada en R286):** las tres tarjetas siempre, también en "0.00"; notas en singular
  o plural con el conteo (también 0: «0 cierres pendientes de conciliar»); «Falta por recibir» en aviso
  solo con conteo > 0. Se validan en Preview, como PA1 de SLT-106.
- **PA3 — Ancla de «30 días».** R68 dice «conciliado en los últimos 30 días»; el dato es
  `cierre_bodega.conciliado_at`. No consta si «Corregir recibido» reescribe esa fecha. **Recomendación:**
  contar por el `conciliadoAt` vigente (la última marca); T0.3 mide si la corrección lo reescribe y lo
  anota. Si lo reescribe, un cierre corregido «rejuvenece» en la tarjeta; se acepta salvo que Carlos
  diga lo contrario. **Cerrada (D-T03, 2026-11-12):** lo reescribe y Carlos lo acepta (opción a).
- **PA4 — Orden con SLT-111 (PR #139).** Las dos tocan `CierresBodegaAdminService` y la suite del
  detalle de bodega. **Recomendación:** mergear SLT-111 antes de empezar T1 y partir de `origin/dev`;
  si no, R284 se prueba sin `porcentajesReparto` y se re-ejecuta al integrar.
- **PA-T — Tamaño.** Estimado ~2 200 líneas (≈ 640 producción y ≈ 1 560 tests y E2E, con el factor
  ×2 de los tests) en 30 archivos: cabe en archivos (30 de 32), no en 1 000 líneas.
  **Recomendación:** aceptarlo en un PR como SLT-106 (2 656 aceptadas). Si no, el corte natural es
  (a) permiso y detalle (R50, R51, R77, R280-R285, R292-R295) y (b) «Solicitados» con tarjetas y
  filtros (R49, R52, R68, R286-R291, R296), cada uno mergeable solo. No se parte sin tu OK.
