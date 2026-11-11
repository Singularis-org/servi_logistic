# SLT-127 «Cola de bodega de la central con la cola única» — requirements (C2)

> Ruta: completa (`ruta` = `sdd`; complexity `medium`; pantalla de dinero). Zona de la ficha:
> **fullstack**; en la práctica solo toca pantalla y tests: el servidor ya lo dejó listo C1
> (`design.md > Zona y capas`). Escrito por spec_author el 2026-11-11.
>
> **Segunda mitad (C2) de la S7** del rediseño de cierres. La primera, SLT-105 «Cola de bodega de la
> central: Por conciliar y Conciliados» (C1), está en `dev` (PR #124): la partición por conciliación
> vive en el servidor (página, total y descarga) y la pantalla sigue con «Pendientes» / «Resueltos»
> (R136 de C1). Los R de esta ficha son **copia tal cual** de
> `specs/SLT-105-cola-bodega-central/requirements.md > Fuera de alcance (van a C2)` y del madre
> `specs/SLT-95-detalle-cierre-rediseno/requirements.md` (v2, aprobado por Carlos el 2026-11-09), con
> su número. Donde el texto de C1 era un resumen, aquí se escribe en EARS sin cambiarle el sentido.
> Canvas aprobado: `specs/SLT-95-detalle-cierre-rediseno/canvas/project/ColaCierres.dc.html`, rama
> «bodega · central: Por conciliar / Conciliados» (líneas 192-210), instancia `CentralColaBodega.dc.html`.
> Patrón: la hermana SLT-102 «Cola de cierres única: mensajeros (central y satélite)».

## Alcance

`/cierres-admin` › Bodega, para la **central** (maestro/admin, acceso total):

- `CierresBodegaAdminModule` monta la cola única (`ColaCierres`, `tipo` bodega, `rol` central) en
  lugar de las tarjetas-comprobante (`ListaComprobantes` + `CierreBodegaFacturaResumen`), de
  `CierresBodegaResueltosLista` y del `SegmentedToggle` con dos `PanelConmutado`.
- Pestañas «Por conciliar <n>» / «Conciliados <n>» con el total del servidor; la barra de filtros de
  hoy sin Mensajero y «Descargar» en la misma fila; una tabla con Folio, Bodega, Solicitó, Solicitado,
  Cierres, Debe llegar, Recibido, Falta, Estado y la acción de la fila; descripción y pie.
- `ColaCierres` y su lógica pura (`cola-cierres-vista.ts`, `cola-cierres-labels.ts`) aceptan el `tipo`
  bodega. La rama mensajero no cambia.
- Se adaptan los tests y E2E que localizaban la pantalla de hoy por sus pestañas, regiones o botones.

## Lo que NO entra

- El servidor: la partición (R44 parte servidor, R122-R126 de C1) ya está en `dev`. Esta ficha no
  toca `lib/`, `db/` ni las Server Actions.
- La bodega satélite (SLT-106 «Bodega satélite: A consolidar con la cola única», SLT-107 «Bodega
  satélite: Solicitados y su cierre de bodega en lectura»): `ConsolidacionBodegaModule` y
  `CierresBodegaSolicitadosLista` no cambian. Tampoco se añaden a `ColaCierres` las piezas que solo
  usa la satélite (tarjetas de cifras, aviso, botón del pie).
- Títulos, columnas y claves de los archivos de «Descargar» (Resumen y Detalle): no se renombran
  (PA4 de C1; van con SLT-113 «Excel del modelo nuevo de cierres»).
- El trato «tú» de los textos que la cola **reutiliza** sin escribirlos (el placeholder de
  `FiltrosCierresBarra`, compartido con mensajeros): SLT-103 «Diálogos del módulo de cierres y trato
  tú». Los textos **nuevos** de esta ficha nacen en «tú».
- Borrar `CierresBodegaResueltosLista`, `CierreBodegaFacturaResumen`, `ListaComprobantes`,
  `PanelConmutado`: SLT-115 «Retirar los componentes de cierre sustituidos».
- El detalle de bodega (SLT-104 «Detalle de cierre de bodega en el detalle único (central)») y el
  saldo de `/wallet/satelites`: no cambian.
- Cambiar cómo se calcula, congela o asienta un importe, la conciliación, permisos, esquema o
  migraciones (R71, R72).

## Restricción de despliegue

C1 (SLT-105) y C2 (esta ficha) **se promueven a `prod` juntas** (PA0-b de C1). C2 se mergea en `dev`,
se aprueba con Carlos en Preview y solo entonces se promueven las dos. La vigila el leader en la
promoción (`tasks.md > T6`). No es comportamiento: sin R.

Al mergear C2, **R136 de C1 (la pantalla intermedia) deja de regir**: la sustituyen R44 (pantalla) y
R127-R135. Su E2E (`e2e/cierre-bodega-satelite.spec.ts`, describe «SLT-105 — un recibido incompleto…»)
se adapta a la cola nueva y sigue cubriendo R126 de C1.

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D15 / S4-2 | 2026-11-09 / 2026-11-10 · Carlos | Mismo flujo = UN componente con props; nunca un componente por rol o por tipo. |
| D17 | 2026-11-09 · Carlos | Se reutilizan tal cual `BuscadorFiltros` (vía `FiltrosCierresBarra`), `DescargarDatasetButton` (vía `DescargarCierresButton`) y el conmutador Bodega/Mensajero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado con sus notas. |
| L2 | 2026-11-11 · leader | Alcance mínimo de R44; se reutiliza lo que existe (`ColaCierres`, `BuscadorFiltros`, `DescargarDatasetButton`); no se rediseña. |
| PA0-b | 2026-11-11 · Carlos | C1 y C2 se promueven a `prod` juntas. |
| PA1 | 2026-11-11 · Carlos | «Conciliados» se define en positivo (recibido entero); «Por conciliar» es el resto. |
| PA3 | 2026-11-11 · Carlos | Textos de vacío y error: los nuevos, en «tú». Se validan en Preview. |
| PA4 | 2026-11-11 · Carlos | Las descargas no se renombran; va con SLT-113. |
| PA5 | 2026-11-11 · Carlos | Lo que la fila no enseña queda solo en el detalle. Se valida en Preview. |
| PA6 | 2026-11-11 · Carlos | «Recibido incompleto» conserva el tono de hoy (token `warning`). Se valida en Preview. |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D5 | R71, R72, R129 (celdas sin derivar en el cliente) |
| D15 / S4-2 | R32, R133 (la misma `ColaCierres` que mensajeros), R135 |
| D17 | R32, R37, R128 |
| D18 | R44, R127-R131 (cada uno cita lo que dibuja el canvas); `design.md > Fidelidad al canvas` |
| L2 | R133 (se monta lo que existe); `design.md > Alternativas descartadas` |
| PA0-b | `## Restricción de despliegue`; `tasks.md > T6` (sin R: no es comportamiento) |
| PA1 | R44, R127 (los conteos son los de la partición de C1, en positivo) |
| PA3 | R131, R132 |
| PA4 | R128 (el «Descargar» de hoy, sin renombrar) |
| PA5 | R134 |
| PA6 | R129 (Estado con `ESTADO_CONCILIACION_VARIANT` de hoy) |

## Requisitos (EARS)

Los R ≤ 78 son copia del madre; R127-R135, copia de `SLT-105 > Fuera de alcance`. Mismo número y
mismo sentido. El test previsto de cada R está en `tasks.md > Trazabilidad`.

### Cola única (copia del madre)

- **R32** [S4; alcance S7] — El sistema DEBE pintar toda lista de cierres del módulo con un único
  componente de cola, parametrizado por `tipo` y `rol`, con: descripción por rol; pestañas con conteo;
  la barra existente (`BuscadorFiltros` + `DescargarDatasetButton`) con los filtros de hoy por rol;
  tarjetas de cifras cuando el rol las tiene; una tabla con una fila por cierre y sus acciones; y un
  pie. DONDE el `tipo` sea bodega y el `rol` central, la cola NO DEBE mostrar tarjetas de cifras.
- **R37** [S4] — El conmutador «Bodega» / «Mensajero» DEBE seguir siendo el de hoy (`CierresTabs`),
  sin cambios de comportamiento.
- **R44** [S7; en C2 la parte de pantalla] — La cola de bodega de la central DEBE tener las pestañas
  «Por conciliar (n)» y «Conciliados (n)». «Por conciliar» DEBE incluir los pendientes de conciliar y
  los recibidos incompletos; «Conciliados», solo los recibidos completos. Columnas: Folio, Bodega,
  Solicitó, Solicitado, Cierres, Debe llegar, Recibido, Falta, Estado. Acciones: «Ver / conciliar»
  (pendiente), «Ver / corregir» (incompleto), «Ver» (recibido).

  *La partición la hace el servidor desde C1; aquí se pinta. El formato de la pestaña es el de R127
  («Por conciliar 3»), el mismo que la cola de mensajeros y el canvas.*

### Pestañas, barra y filas (copia de C1 > Fuera de alcance)

- **R127** — La cola de bodega de la central DEBE presentar un `tablist` con nombre «Cierres de bodega
  por estado» con dos pestañas, «Por conciliar <n>» y «Conciliados <n>», donde cada n DEBE ser el total
  que da el servidor para esa lista con los filtros puestos (no el número de filas de la página).
  CUANDO la central entra en `/cierres-admin` › Bodega, la pestaña activa DEBE ser «Por conciliar».
  CUANDO la central cambia de pestaña, el sistema DEBE conservar los filtros puestos y la página en la
  que estaba cada lista.
- **R128** — La cola DEBE mostrar una sola barra de filtros para las dos pestañas, la de hoy
  (`FiltrosCierresBarra`) sin el filtro de Mensajero (Fecha de solicitud y Bodega), y en la misma fila
  el «Descargar» de la pestaña activa. CUANDO la central cambia un filtro, el sistema DEBE aplicarlo a
  las dos listas y devolver cada una a su página 1.
- **R129** — Cada fila DEBE pintar, sin derivar ni calcular nada en el cliente:
  - Folio: «#» + `folioDe(cierreBodegaId)`, en monoespaciado;
  - Bodega: el nombre de la bodega satélite;
  - Solicitó: el nombre de quien lo solicitó;
  - Solicitado: fecha y hora de la solicitud;
  - Cierres: el número de cierres del día que consolida;
  - Debe llegar: `paraLaCentral`, en negrita;
  - Recibido: `montoRecibido`; SI no hay monto recibido, ENTONCES DEBE pintar «—» y NUNCA ₡0;
  - Falta: `faltaPorRecibir`; DEBE ir resaltada SI y solo SI `hayFaltantePorRecibir` es verdadero;
  - Estado: la pastilla con `ESTADO_CONCILIACION_LABEL` y `ESTADO_CONCILIACION_VARIANT` (PA6: el token
    de hoy); NO DEBE pintar el estado del enum (`Aprobado`, `Rechazado`, `Solicitado`).
- **R130** — CUANDO el estado de conciliación del cierre (`estadoConciliacionDe`) sea «pendiente», la
  fila DEBE ofrecer «Ver / conciliar» como acción principal; CUANDO sea «incompleto», «Ver / corregir»
  como acción principal; CUANDO sea «recibido», «Ver» como acción secundaria. Sus nombres accesibles
  DEBEN ser «Ver / conciliar el cierre de bodega de <bodega>», «Ver / corregir el cierre de bodega de
  <bodega>» y «Ver el cierre de bodega de <bodega>». CUANDO la central pulsa cualquiera de las tres, el
  sistema DEBE abrir el detalle único de bodega de ese cierre (R40).
- **R131** — La cola DEBE mostrar la descripción «Los cierres que mandan las bodegas satélite.
  Márcalos recibidos cuando llegue el dinero.». MIENTRAS la pestaña activa sea «Por conciliar», el pie
  DEBE mostrar «Un cierre «Recibido incompleto» se queda aquí hasta que la diferencia se reciba o se
  corrija.» y la paginación; MIENTRAS sea «Conciliados», el pie DEBE mostrar solo la paginación.
- **R132** — La tabla de cada pestaña DEBE estar en una región con nombre «Cierres de bodega por
  conciliar» o «Cierres de bodega conciliados». MIENTRAS su página no haya llegado, DEBE mostrar el
  estado de carga. SI la lectura falla, ENTONCES DEBE mostrar «No se pudieron cargar los cierres de
  bodega por conciliar.» o «No se pudieron cargar los cierres de bodega conciliados.». SI la lista está
  vacía, ENTONCES DEBE mostrar «No hay cierres de bodega por conciliar.» o «Aún no hay cierres de bodega
  conciliados.».
- **R133** — `CierresBodegaAdminModule` DEBE montar `ColaCierres` y NO DEBE montar `ListaComprobantes`,
  `CierreBodegaFacturaResumen`, `CierresBodegaResueltosLista`, `SegmentedToggle` ni `PanelConmutado`.
  La mitad de Mensajero, la pantalla de la satélite y el detalle NO DEBEN cambiar. El censo de tablas
  (`tests/unit/descarga/censo-tablas.ts`) DEBE dejar de listar SLT-105 en `montajesPrevistos` de
  `ColaCierres` y DEBE listar `CierresBodegaAdminModule.tsx` entre sus `montajes`.
- **R134** — La fila NO DEBE pintar lo que el canvas no dibuja: recaudado y métodos de pago, pago a
  mensajeros, lo que gana la bodega, quién marcó y su nota, la marca de modelo nuevo ni «Ver detalles».
  Esos datos DEBEN seguir en el detalle de bodega (PA5: se valida en Preview).
- **R135** — La cola de cierres de mensajeros (SLT-102) DEBE seguir igual: mismas pestañas, columnas,
  acciones, textos y nombres accesibles.

### Dinero intacto (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe: ni
  snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.

## Preguntas abiertas

- **PA-T (tamaño, para Carlos):** la estimación es de **28 archivos (70 % de 40) y ~980-1 080
  líneas** (tope 1 000; `tasks.md > Tamaño`). El archivo cabe; las líneas quedan en el borde. Si al
  cerrar T5 el gate pasa de 1 000 líneas: **(a, recomendado)** marca
  `<!-- tamano-pr-aceptado: … -->` en `progress/features/SLT-127.md`, como en SLT-102; **(b)** corte.
  No hay corte que deje la pantalla coherente y se mergee solo: montar la cola sin adaptar los tests
  y E2E deja la suite en rojo, y meter `tipo` bodega en `ColaCierres` sin montarlo es código sin
  superficie (guardia `superficie-de-uso`) y un corte por capa (`docs/specs.md > Partir una feature`).
  El único corte limpio sería sacar los dos tests nuevos de componente a una ficha de solo tests, que
  deja R127-R132 sin test en el PR que los implementa (el reviewer lo rechaza). Por eso se recomienda (a).
- **PA-P (texto, se valida en Preview):** el nombre accesible de las dos paginaciones pasa de «…
  pendientes» / «… resueltos» a «Paginación de los cierres de bodega por conciliar» / «… conciliados»,
  para que diga lo mismo que su pestaña y su región. Ningún documento lo fija; el spec lo propone y los
  tests de paginación que lo leen ya se tocan por la región. Si Carlos prefiere conservar los de hoy, se
  quitan 4 líneas.
