# SLT-102 «Cola de cierres única: mensajeros (central y satélite)» — requirements

> Ruta: completa (`ruta` vacía; complexity `high`; pantalla de dinero). Zona: **frontend**, que pasa
> a **fullstack** si Carlos responde «sí» a PA1 (señales que hoy no emite el servidor).
> Escrito por spec_author el 2026-11-10.
>
> Rebanada **S4** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2, R marcados `[S4]`: R32-R37;
> `design.md > 2. Cola de cierres — ColaCierres`, `> Props → quién las usa`, `> Qué sustituye cada
> componente`; `tasks.md > Plan de las demás rebanadas > S4`). Canvas aprobado:
> `specs/SLT-95-detalle-cierre-rediseno/canvas/project/ColaCierres.dc.html` con sus instancias
> «Central 1» (`CentralColaMensajeros.dc.html`), «Central 3» (`CentralColaMensajerosResueltos.dc.html`)
> y «Satélite 1» (`SatColaMensajeros.dc.html`).
>
> Ya están en `dev` SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (el detalle
> que abre la cola) y SLT-101 «Fila de gestión única y lista con filtros» (la lista de gestiones
> dentro del detalle, con las props aditivas de `BuscadorFiltros`). Este archivo **no reabre**
> nada del madre: copia los R `[S4]` con su número y su sentido y añade solo lo que S4 necesita y
> el madre no detalla (R99-R108; R70 y R109-R110 solo si PA1 = sí).
> **Carlos: «sé fiel al diseño».** Donde el spec se aparta del canvas, lo dice y por qué
> (`design.md > Fidelidad al canvas`).

## Alcance

`/cierres-admin` › Mensajero, para la **central** (maestro/admin, rol `central`) y la **bodega
satélite** (adminSatelite, rol `satelite`):

- Un componente de **cola** (`ColaCierres`, `components/private/cierres/cola/`), el mismo para los
  dos roles, con props por rol: descripción, pestañas «Pendientes / Resueltos» con su conteo, la
  barra de filtros de hoy (`FiltrosCierresBarra` = `BuscadorFiltros` + `FilterComponent`) con
  «Descargar» (`DescargarCierresButton` → `DescargarDatasetButton`) en la misma fila, una tabla
  con una fila por cierre (`DataTable` existente) y un pie.
- Columnas Folio, Mensajero, Solicitado / Resuelto, Estado, Recaudado, Pago al mensajero, Señales
  y acciones; en Resueltos de la central, además «Pago entregado» y «Registrar pago».
- `CierresAdminModule` monta la cola en lugar de las tarjetas-comprobante de hoy
  (`ListaComprobantes` + `CierreFacturaResumen`, `CierresAdminHistoricoLista`) y del
  `SegmentedToggle` de pestañas.
- Las piezas del componente que solo usan otros roles o tipos (tarjetas de cifras, aviso, botón
  del pie: bodega satélite y mensajero) **no** se construyen aquí: las añade la rebanada que las
  monta (SLT-106 «Bodega satélite: A consolidar con la cola única», SLT-108 «/cierre-dia: detalle
  y cola únicos para el mensajero»).

## Lo que NO entra

- La cola de bodega de la central (SLT-105 «Cola de bodega de la central: Por conciliar y
  Conciliados») ni la de la satélite (SLT-106, SLT-107 «Bodega satélite: Solicitados y su cierre
  de bodega en lectura»): `CierresBodegaAdminModule` y `ConsolidacionBodegaModule` no cambian y
  siguen usando `ListaComprobantes`.
- `/cierre-dia` (SLT-108).
- Los datos que la tarjeta-comprobante de hoy enseña y la fila del canvas no dibuja: destino,
  métodos de pago, ingreso de bodega, el desplegable «Ver detalles» y el motivo de un rechazo.
  Siguen en el detalle del cierre (SLT-100). Misma regla que Carlos fijó en SLT-101 (PA2, «sé fiel
  al diseño»); **PA5** pide que lo confirme.
- El trato «tú» de los textos que la cola **reutiliza** sin escribirlos (el placeholder «Usá los
  filtros…» de `FiltrosCierresBarra`, compartido con bodega; los diálogos): SLT-103 «Diálogos del
  módulo de cierres y trato tú». Los textos **nuevos** de esta ficha nacen en «tú».
- El reparto en porcentajes de «Dinero» (SLT-111 «Cifras del servidor: reparto en % y señales de
  la cola»). Las señales con conteo del servidor de R70, salvo que PA1 las traiga aquí.
- Las columnas y el contenido de «Descargar» de la cola (Resumen y Detalle): no cambian.
- Borrar `CierreFacturaResumen`, `CierresAdminHistoricoLista` o `ListaComprobantes`: SLT-115
  «Retirar los componentes de cierre sustituidos».
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71,
  R72).

## Decisiones cerradas (no reabrir)

Vienen del spec madre (`specs/SLT-95-detalle-cierre-rediseno/requirements.md`), de
`progress/features/SLT-95.md`, `SLT-100.md` y `SLT-101.md`, y de las reglas que Carlos repitió al
lanzar esta ficha (`progress/features/SLT-102.md > Decisiones`). Aquí solo las que S4 hace visibles.

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Reglas: lo que pide atención, primero; un solo trato: tú. |
| D15 | 2026-11-09 · Carlos | Lo que hace la satélite con sus mensajeros es lo mismo que la central: componentes IGUALES con props distintas, nunca uno por rol. |
| D17 | 2026-11-09 · Carlos / n0 | Se reutilizan tal cual la barra de DataTable (`BuscadorFiltros` + `DescargarDatasetButton`), `Modal` y el conmutador Bodega/Mensajero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado (versión 33) con sus notas. |
| D20 | 2026-11-09 · Carlos | Una cifra, un nombre. |
| S3-4 | 2026-11-09 · Carlos (SLT-101 PA4) | Filtros = `BuscadorFiltros` (+ `FilterComponent`). Nada de `SegmentedToggle` ni controles nuevos; lo que falte, prop aditiva mínima. |
| S4-1 | 2026-11-10 · Carlos (al lanzar S4) | Fiel al canvas aprobado; donde el spec se aparte, lo dice y por qué. |
| S4-2 | 2026-11-10 · Carlos | Mismo flujo en central y satélite = UN componente con props por rol. |
| S4-3 | 2026-11-10 · Carlos | Un solo PR, sin partir (estimación en `tasks.md > Tamaño`). |
| S4-4 | 2026-11-10 · Carlos | Una cifra del canvas que el servidor no emite hoy se marca como pregunta abierta (posible cambio de zona a fullstack). |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D5 | R71, R72, R101 |
| D6 | R102 (orden de las señales), R106 (textos nuevos en «tú») |
| D15, S4-2 | R32, R33, R34 |
| D17 | R32, R37, R100 |
| D18, S4-1 | R33, R34, R35, R99-R106 (cada uno cita lo que dibuja el canvas); `design.md > Fidelidad al canvas` |
| D20 | R101 («Recaudado», «Pago al mensajero» con los nombres del detalle) |
| S3-4 | R99 (pestañas con `Tabs` de `components/ui`, no `SegmentedToggle`), R100 |
| S4-3 | `tasks.md > Tamaño`; PA4 |
| S4-4 | PA1; R70, R109, R110 (condicionados a PA1) |

## Requisitos (EARS)

Los R con número ≤ 78 son copia del madre: mismo número y mismo sentido. R99-R108 son nuevos de
S4. R70 (parte de la cola), R109 y R110 son **condicionales**: entran solo si Carlos responde «sí» a
PA1; si responde «no», se quedan en SLT-111 y se borran de aquí antes de implementar. El test
previsto de cada R está en `tasks.md > Trazabilidad`.

### Cola de cierres (copia del madre)

- **R32** [S4] — El sistema DEBE pintar toda lista de cierres del módulo con un único componente de
  cola, parametrizado por `tipo` y `rol`, con: título «Cierres del día» y descripción por rol;
  pestañas con conteo; la barra existente (`BuscadorFiltros` + `DescargarDatasetButton`) con los
  filtros de hoy por rol; tarjetas de cifras cuando el rol las tiene; una tabla con una fila por
  cierre y sus acciones; y un pie.

  *Alcance en S4:* `tipo` mensajero con `rol` central y satélite. El título es el de la página
  (`AppPage`, un solo `h1`); las tarjetas de cifras no existen para estos dos roles (el canvas no
  las dibuja) y llegan con SLT-106 y SLT-108.
- **R33** [S4] — La cola de cierres de mensajeros DEBE ser la misma para central y satélite:
  pestañas «Pendientes (n)» / «Resueltos (n)»; columnas Folio, Mensajero, Solicitado (Resuelto en
  Resueltos), Estado, Recaudado, Pago al mensajero, Señales; acciones «Ver / decidir» (solicitado),
  «Ver» y «Destrabar» (vencido), «Ver» (resueltos).
- **R34** [S4] — DONDE el rol sea central, la pestaña «Resueltos» DEBE añadir la columna «Pago
  entregado» («Pendiente <monto>», «Liquidado», o «—» si no está aprobado), y la acción «Registrar
  pago» en un aprobado con pendiente mayor que cero. DONDE el rol sea satélite, NO DEBE mostrar ni
  la columna ni la acción.
- **R35** [S4] — La columna Señales de la cola DEBE mostrar, de lo que ya llega por fila: mensajero
  bloqueado (con su conteo), reprogramadas retenidas y «Bloqueante hasta re-solicitud» en un
  rechazado.
- **R36** [S4] — CUANDO el usuario pulsa «Ver / decidir» o «Ver» en la cola, el sistema DEBE abrir
  el detalle único (R1) del cierre de esa fila, en el modo que corresponde a su estado.
- **R37** [S4] — El conmutador «Bodega» / «Mensajero» DEBE seguir siendo el de hoy (`CierresTabs`),
  sin cambios de comportamiento.

### Lo que S4 añade (nuevo)

- **R99** [S4, nuevo] — Las pestañas de la cola DEBEN ser un `tablist` con nombre «Cierres del día
  por estado» y dos `tab`: «Pendientes <n>» y «Resueltos <n>», con el conteo detrás del nombre
  separado por un espacio (como el canvas). Cada `n` DEBE ser el `total` que devuelve el servidor
  para esa lista con los filtros puestos, nunca el número de filas de la página. CUANDO se abre la
  pantalla, la pestaña activa DEBE ser «Pendientes». CUANDO el usuario cambia de pestaña, los
  filtros puestos y la página y el tamaño de página de cada pestaña DEBEN conservarse.
- **R100** [S4, nuevo] — Entre las pestañas y la tabla, la cola DEBE pintar UNA barra para las dos
  pestañas: la de hoy (`FiltrosCierresBarra`, con los filtros Fecha de solicitud, Mensajero y
  Estado — (enmienda Carlos 2026-11-10: sin filtro Bodega, fiel al canvas); la mitad de bodega lo
  conserva) y, en la misma fila y a la derecha, «Descargar» de
  la pestaña activa (el `DescargarCierresButton` de hoy, con sus niveles Resumen y Detalle). Filtrar
  DEBE acotar las dos listas y sus conteos exactamente como hoy y NO DEBE tocar el parámetro
  `?cierre=` de la URL.
- **R101** [S4, nuevo] — Cada fila DEBE pintar, sin derivar nada en el cliente:
  - Folio: «#» y el folio corto de hoy (`folioDe`), en letra monoespaciada;
  - Mensajero: `mensajeroNombre`;
  - Solicitado (Pendientes) = `solicitadoAt`, o Resuelto (Resueltos) = `resueltoAt`, en fecha y
    hora de Costa Rica con el formateador del detalle (`fechaHora`); «—» si llega nulo;
  - Estado: la pastilla de hoy (`EstadoCierreBadge`);
  - Recaudado = `totales.general` y Pago al mensajero = `totalPagoMensajero`, con el formateador
    compartido (`money()`), alineados a la derecha.
- **R102** [S4, nuevo] — El texto de la celda Señales DEBE ser, en este orden y separado por « · »,
  solo las que apliquen:
  1. «Mensajero bloqueado · <cierresAbiertos>» SI `bloqueoMensajero.bloqueado`;
  2. «Bloqueante hasta re-solicitud» SI el estado es `rechazado`;
  3. «Retiene <n> paquete(s) reprogramado(s) para hoy» (texto de hoy, `retieneReprogramadas`) SI
     `reprogramadasRetenidasHoy` > 0;
  4. *(solo si PA1 = sí)* las de R110.

  Cada señal DEBE conservar como nombre accesible y `title` la nota larga de hoy
  (`notaMensajeroBloqueado`, `RECHAZADO_BLOQUEANTE_NOTA`, `notaRetieneReprogramadas`). SI una fila
  no tiene ninguna señal, ENTONCES la celda DEBE quedar vacía. SI `bloqueoMensajero` no llega,
  ENTONCES la fila NO DEBE afirmar ni negar el bloqueo (no pinta nada de él).
- **R103** [S4, nuevo] — La celda «Pago entregado» (R34) DEBE salir de `pendientePagoMensajero`
  tal cual llega: `null` → «—»; un importe que no es mayor que cero → «Liquidado»; mayor que cero →
  «Pendiente <money(pendiente)>». CUANDO la central pulsa «Registrar pago», el sistema DEBE abrir
  el diálogo de hoy (`RegistrarPagoMensajeroDialog`, sin el modo «tras aprobar») con ese cierre, su
  mensajero y ese pendiente; tras un registro efectivo DEBE volver a leer las listas del servidor,
  de modo que la fila muestre el pendiente nuevo que derive el servidor. Cerrar el diálogo sin
  registrar NO DEBE cambiar nada.
- **R104** [S4, nuevo] — MIENTRAS una lista carga, falla o no tiene filas, la tabla DEBE mostrar el
  estado de carga, el error o el vacío con los textos de hoy («No se pudieron cargar los cierres
  pendientes.» / «No se pudo cargar el histórico de cierres.»; «No hay cierres pendientes de
  decisión.» / «Aún no hay cierres resueltos.»). La tabla de cada pestaña DEBE estar dentro de una
  región con el nombre de hoy: «Pendientes de decisión» y «Histórico».
- **R105** [S4, nuevo] — Los botones de la fila DEBEN conservar los nombres accesibles de hoy:
  «Ver / decidir»; «Ver» con nombre «Ver el cierre de <mensajero>» (vencido) o «Ver el cierre
  resuelto de <mensajero>» (Resueltos); «Destrabar» con nombre «Destrabar cierre vencido abandonado
  de <mensajero>». «Registrar pago» DEBE llamarse «Registrar pago del cierre de <mensajero>».
  CUANDO el usuario pulsa «Destrabar», el sistema DEBE abrir la misma confirmación de hoy
  («Destrabar cierre vencido abandonado», `confirmarDestrabar`).
- **R106** [S4, nuevo] — La cola DEBE mostrar, encima de las pestañas, la descripción de su rol:
  - central: «Bodega central · <zona>. Revisa el cierre de cada mensajero y apruébalo o
    recházalo.»;
  - satélite: «Bodega satélite · <zona>. Revisa el cierre de cada mensajero de tu bodega y
    apruébalo o recházalo.»

  con el nombre de zona que resuelva PA3 (sin zona: «Bodega central.» / «Bodega satélite.» y el
  resto de la frase). Y un pie: en Pendientes, «Un cierre vencido se puede destrabar como
  excepción.» seguido de la paginación de hoy; en Resueltos, la paginación de hoy. La descripción
  vieja de la página («Revisá el detalle…», voseo) NO DEBE seguir pintándose.
- **R107** [S4, nuevo] — CUANDO la central o la satélite abre `/cierres-admin` › Mensajero, el
  sistema DEBE pintar la cola única (R32) con el rol del actor (central = acceso total, satélite =
  adminSatelite, el mismo criterio que hoy da la audiencia del detalle), en lugar de las
  tarjetas-comprobante de hoy, y `CierresAdminModule` NO DEBE montar `ListaComprobantes`,
  `CierreFacturaResumen`, `CierresAdminHistoricoLista` (el componente) ni el `SegmentedToggle` de
  pestañas. MIENTRAS el adminSatelite no tenga zona, DEBE seguir viendo el aviso de hoy en lugar de
  la cola. La mitad de bodega y `/cierre-dia` NO DEBEN cambiar.
- **R108** [S4, nuevo] — La cola NO DEBE pintar de la tarjeta-comprobante de hoy lo que el canvas
  no dibuja en la fila: destino, métodos de pago, ingreso de bodega, el desplegable «Ver detalles»
  ni el motivo del rechazo (PA5). Esos datos DEBEN seguir visibles en el detalle del cierre.

### Señales del servidor (solo si PA1 = sí; copia parcial del madre y nuevos)

- **R70** [S4 por PA1, solo la parte de la cola] — La cola de mensajeros DEBE además mostrar en
  Señales, por cierre, incidentes sin indemnizar, pagos ajustados y paquetes que vuelven, con
  conteos emitidos por el servidor. *(El reparto en porcentajes de R70 sigue en SLT-111.)*
- **R109** [S4 por PA1, nuevo] — El servidor DEBE emitir, con cada cierre de la cola y de Resueltos,
  un campo **aditivo** con tres enteros: gestiones con resultado incidente y `indemnizacion` nula;
  gestiones con al menos un ajuste de pago; gestiones cuyo resultado vuelve a bodega (la regla
  única `RESULTADOS_QUE_VUELVEN`, la misma de la señal «Vuelve a bodega» de la fila, R85). DEBE
  calcularlos con UNA sola consulta por página, acotada en el `WHERE` a los cierres de esa página y
  a la empresa del actor, sin escribir nada ni requerir migración. Para un mismo cierre, cada
  conteo DEBE ser igual al número de gestiones con esa señal en la lista «Gestiones» de su detalle.
- **R110** [S4 por PA1, nuevo] — Tras las señales de R102, la celda DEBE añadir, solo las que valgan
  más de cero y en este orden: «<n> incidente(s) sin indemnizar», «<n> pago(s) ajustado(s)»,
  «<n> vuelve(n) a bodega» (textos del canvas, singular o plural según `n`).

### Dinero intacto (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.

## Preguntas abiertas

Para Carlos. Ninguna bloquea escribir el código salvo PA1, que decide la zona y si T1 existe.

- **PA1 — Señales que el canvas pinta y el servidor no emite hoy (posible cambio a fullstack).**
  «Central 1» y «Satélite 1» pintan en Señales «1 incidente sin indemnizar · 6 vuelven a bodega» y
  «1 pago ajustado». Por fila de la cola hoy solo llegan el bloqueo, las reprogramadas retenidas y
  el estado; esos tres conteos los asigna el madre a SLT-111 «Cifras del servidor: reparto en % y
  señales de la cola» (R70). **Recomendación: traerlos aquí**, como hiciste en SLT-100 (D23) y en
  SLT-101 (S3-1): la cola sale completa como el canvas, la ficha pasa a **fullstack** (+6 archivos,
  ~+450 líneas: una consulta agregada por página en `CierresAdminRepository`, el campo aditivo en
  el servicio y su test de integración contra la base) y SLT-111 se queda solo con el reparto en %.
  Si dices «no», R70/R109/R110 y T1 se borran y la columna sale con las tres señales de R102.
- **PA2 — Cabecera: conmutador y descripción.** El canvas pone en una fila el título y la
  descripción a la izquierda y el conmutador «Bodega / Mensajero» a la derecha. Hoy el conmutador
  vive debajo del título, encima de las dos mitades (`CierresTabs`, R37), y la mitad de bodega aún
  no es la cola única. **Recomendación:** en S4 el conmutador se queda donde está y la descripción
  por rol va al principio de la cola (debajo del conmutador); se juntan en la fila del canvas
  cuando la bodega pase a la cola (SLT-105 / SLT-106), que es cuando las dos mitades tienen
  descripción propia. Moverlo ya obliga a sacar el estado del conmutador a la cabecera de la
  página (~+3 archivos).
- **PA3 — Nombre de la zona en la descripción.** El canvas escribe «Bodega central · GAM» y
  «Bodega satélite · Limón». Para la satélite el nombre existe (su `zonaId` y el catálogo de
  filtros, ya cargados en la página). Para la central no he encontrado de dónde sale «GAM»: el
  catálogo dice que incluye «la central (la GAM)» pero no la marca. **Recomendación:** satélite con
  el nombre de su zona; central con el nombre de su zona solo si T0.2 encuentra la fuente en el
  código, y si no, «Bodega central.» sin nombre hasta que digas de dónde sale.
- **PA4 — Tamaño.** ~43 archivos / ~1 700 líneas (con PA1: ~49 / ~2 150); el límite es 40. La
  mayoría son tests y E2E que hoy localizan los cierres por la tarjeta-comprobante
  («Comprobante del cierre de …») y deben pasar a la fila de la tabla. Siguiendo tu regla «no
  partir» (S4-3), se pide la marca `tamano-pr-aceptado`.
- **PA5 — Lo que la tarjeta de hoy enseña y la fila del canvas no.** Destino, métodos de pago,
  ingreso de bodega, «Ver detalles» y el motivo del rechazo dejan la cola y quedan en el detalle
  (R108), con la misma regla de tu PA2 de SLT-101. ¿Lo confirmas, o quieres alguno de vuelta (por
  ejemplo, el motivo del rechazo junto a «Bloqueante hasta re-solicitud»)? No bloquea: se mira en
  Preview.

**Para el Preview** (no bloquean):
- el pie de Pendientes dice «Un cierre vencido se puede destrabar como excepción.» siempre, haya o
  no un vencido en la página (como el canvas);
- fechas como «2026-11-07 18:42» (formateador del detalle) en vez de «07/11 18:42» del canvas
  (SLT-92 «Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa» unifica);
- la paginación es la de hoy («1-10 de 12» y selector de tamaño) en vez del texto «Mostrando 3 de 12
  · 10 por página» del canvas;
- el placeholder de la barra sigue en voseo («Usá los filtros…») hasta SLT-103.
