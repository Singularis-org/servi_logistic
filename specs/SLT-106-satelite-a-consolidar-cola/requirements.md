# SLT-106 «Bodega satélite: A consolidar con la cola única» — requirements

> Ruta: completa (`ruta` = completa; complexity `medium`; pantalla de dinero y lecturas nuevas en el
> servidor). Zona: **fullstack**. Escrito por spec_author el 2026-11-12.
>
> Rebanada **S8** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2: R45-R48 y R67 `[S8]`; `design.md >
> De dónde sale cada cifra` (fila R67) y `> Props → quién las usa` (Cola · bodega · satélite);
> `tasks.md > Plan de las demás rebanadas > S8`). Canvas aprobado:
> `specs/SLT-95-detalle-cierre-rediseno/canvas/project/ColaCierres.dc.html`, rama «bodega · satélite»
> (líneas 163-181) y `Dialogos.dc.html` (`solicitarBodega`, líneas 185-187).
>
> Dependencias en `dev`: SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (la cola),
> SLT-103 «Diálogos del módulo de cierres y trato tú» (el patrón del resumen en el diálogo). Patrón
> directo: SLT-127 «Cola de bodega de la central con la cola única» (el `tipo` bodega de la cola).
> Este archivo **no reabre** nada del madre.

## Alcance

`/cierres-admin` › Bodega, para la **bodega satélite** (`adminSatelite`, acotada a su zona):

- `ConsolidacionBodegaModule` monta la cola única (`ColaCierres`, `tipo` bodega, `rol` satélite) en
  lugar de las tarjetas-comprobante de «A consolidar» (`ListaComprobantes` +
  `CierreConsolidableFacturaResumen`), de los cinco paneles de totales (`TotalesPanel`,
  `PagoMensajeroTotal`, `IngresoBodegaRechazosTotal`, `CentralDebeTotal`) y del `SegmentedToggle`
  con dos `PanelConmutado`.
- Pestaña «A consolidar»: tarjetas de cifras, aviso del bloqueo, tabla de los cierres del día a
  consolidar y pie con «Solicitar cierre de bodega».
- El servidor emite lo que la cola pinta y hoy no llega: «Debe llegar a la central» del conjunto y de
  cada cierre (R67), la fecha de aprobación y las gestiones ajustadas de cada cierre, los conteos del
  conjunto y los nombres de los mensajeros con cierres sin resolver (R47).
- El diálogo «Solicitar cierre de bodega» gana el resumen de cifras (R48).
- Pestaña «Solicitados»: entra en la misma cola como pestaña, pero su contenido sigue siendo la lista
  de hoy (`CierresBodegaSolicitadosLista`) hasta SLT-107 (R201).

## Lo que NO entra

- «Solicitados» con la cola única, sus tarjetas, su «Ver» y el permiso de la satélite sobre su cierre
  de bodega (R49-R52, R68): SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura».
- Cambiar cómo se calcula «La central debe» (`totalCentralDebeAgregado`): SLT-123 «Pago al mensajero
  independiente del efectivo». Aquí se pinta el valor que ya emite el servidor.
- Títulos, columnas y claves de los archivos de «Descargar»: no se tocan (van con SLT-113 «Excel del
  modelo nuevo de cierres»).
- El trato «tú» de los textos que el módulo ya tiene (toasts y aviso de sin zona con voseo): SLT-134
  «Textos de pantalla de cierres en tú, con guardia». Los textos **nuevos** de esta ficha nacen en «tú».
- La puerta de `solicitarCierreBodega` y sus mensajes de conflicto (R200, R72).
- Borrar `CierreConsolidableFacturaResumen`, `TotalesPanel`, `CentralDebeTotal` y demás: SLT-115
  «Retirar los componentes de cierre sustituidos».
- La cola de mensajeros, la cola de bodega de la central y el detalle único (R206).
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71, R72).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D4 | 2026-11-08 · Carlos | Los métodos de pago en 0 no se muestran. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D15 / S4-2 | 2026-11-09 / 2026-11-10 · Carlos | Mismo flujo = UN componente con props; nunca un componente por rol o por tipo. |
| D17 | 2026-11-09 · Carlos | Se reutilizan tal cual `BuscadorFiltros` (vía `FiltrosCierresBarra`), `DescargarDatasetButton` y el conmutador Bodega/Mensajero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado (versión 33) con sus notas. |
| D19 | 2026-11-09 · medición en prod | Las vistas del modelo viejo deben verse bien; el E2E cubre los dos modelos. |
| D9 | 2026-11-09 · Carlos | Una ficha por rebanada; esta es S8. |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D4 | R196 (métodos de «Recaudado» que no valen 0) |
| D5 | R71, R72, R200, R67 (misma `paraLaCentral`, ninguna fórmula nueva) |
| D15 / S4-2 | R32, R204 (la misma `ColaCierres` que mensajeros y central) |
| D17 | R32, R37, R191 |
| D18 | R45-R48, R190, R192, R196, R197, R199, R207 (cada uno cita lo que dibuja el canvas) |
| D19 | R196 (contexto de «Gana la bodega satélite» por modelo, E2E con los dos) |
| D9 | `## Alcance` y `## Lo que NO entra` |

## Requisitos (EARS)

Los R ≤ 78 son copia del madre, con su número y su sentido. R190-R207 son nuevos de S8. El test
previsto de cada R está en `tasks.md > Trazabilidad`.

### Cola única (copia del madre)

- **R32** [S4; alcance S8] — El sistema DEBE pintar toda lista de cierres del módulo con un único
  componente de cola, parametrizado por `tipo` y `rol`, con: descripción por rol; pestañas con conteo;
  la barra existente (`BuscadorFiltros` + `DescargarDatasetButton`) con los filtros de hoy por rol;
  tarjetas de cifras cuando el rol las tiene; una tabla con una fila por cierre y sus acciones; y un
  pie. DONDE el `tipo` sea bodega y el `rol` satélite, la cola DEBE mostrar tarjetas de cifras, aviso y
  botón en el pie solo en la pestaña «A consolidar».
- **R37** [S4] — El conmutador «Bodega» / «Mensajero» DEBE seguir siendo el de hoy (`CierresTabs`),
  sin cambios de comportamiento.

### A consolidar (copia del madre)

- **R45** [S8] — La pestaña «A consolidar» de la satélite DEBE mostrar: tarjetas «Recaudado» (con
  métodos), «Pago a mensajeros», «Gana la bodega satélite», «Debe llegar a la central» (R67) y, SI
  `totalCentralDebeAgregado` ≠ 0, «La central debe» con su nota; la tabla de cierres del día a
  consolidar con Folio, Mensajero, Aprobado, Recaudado, Pago, Gana bodega, A la central (R67),
  Señales y «Ver su cierre»; y al pie el botón «Solicitar cierre de bodega».
- **R46** [S8] — MIENTRAS la satélite no pueda solicitar el cierre de bodega, el botón DEBE estar
  deshabilitado y la cola DEBE mostrar el aviso con el motivo.
- **R47** [S8] — SI el motivo es que hay cierres de mensajero sin resolver, ENTONCES el aviso DEBE
  nombrar a los mensajeros que los tienen.
- **R48** [S8] — El diálogo «Solicitar cierre de bodega» DEBE mostrar el resumen Recaudado, Pago a
  mensajeros, Gana la bodega satélite y Debe llegar a la central, con las mismas cifras de las
  tarjetas.
- **R67** [S8] — El servidor DEBE emitir «Debe llegar a la central» del conjunto a consolidar y de
  cada cierre del día a consolidar, con la misma derivación que `paraLaCentral`.

### Pestañas, barra y filas (nuevos de S8)

- **R190** — La cola de bodega de la satélite DEBE presentar un `tablist` con nombre «Cierre de bodega
  por etapa» con dos pestañas, «A consolidar <n>» y «Solicitados <n>». En «A consolidar», n DEBE ser
  el total de cierres del día consolidables que da el servidor con los filtros puestos; en
  «Solicitados», el total de cierres de bodega de la zona que da el servidor. CUANDO la satélite entra
  en `/cierres-admin` › Bodega, la pestaña activa DEBE ser «A consolidar». CUANDO cambia de pestaña,
  el sistema DEBE conservar los filtros puestos y la página en la que estaba «A consolidar».
- **R191** — La cola DEBE mostrar una sola barra de filtros para las dos pestañas, la de hoy
  (`FiltrosCierresBarra`) sin el filtro de Mensajero, y en la misma fila el «Descargar» de la pestaña
  activa, con los mismos archivos de hoy. CUANDO la satélite cambia un filtro, el sistema DEBE
  devolver «A consolidar» a su página 1.
- **R192** — Cada fila de «A consolidar» DEBE pintar, sin derivar ni calcular nada en el cliente:
  - Folio: «#» + el folio del cierre del día, en monoespaciado;
  - Mensajero: su nombre;
  - Aprobado: fecha y hora en que se aprobó el cierre del día; SI no llega, ENTONCES «—»;
  - Recaudado: `totales.general`;
  - Pago: `totalPagoMensajero`;
  - Gana bodega: `totalIngresoBodegaRechazos`;
  - A la central: `paraLaCentral` de ese cierre, en negrita y con su signo;
  - Señales: «1 pago ajustado» / «<n> pagos ajustados» SI el cierre tiene gestiones ajustadas, y
    vacía SI no tiene;
  - la acción «Ver su cierre», con nombre accesible «Ver el cierre de <mensajero>».
- **R193** — CUANDO la satélite pulsa «Ver su cierre», el sistema DEBE abrir el detalle único (R1) de
  ese cierre del día con `tipo` mensajero y audiencia satélite: el mismo que abre el enlace
  `hrefDetalleCierre(cierreDiaId)`.
- **R194** — El servidor DEBE emitir, por cada cierre del día a consolidar, la fecha de aprobación del
  cierre (`resuelto_at`) y el número de sus gestiones con al menos un ajuste del pago al mensajero
  (una gestión ajustada dos veces cuenta una), en la página, en el conjunto completo y dentro de la
  zona del actor, igual que hoy.
- **R195** — El servidor DEBE emitir, sobre el conjunto completo a consolidar de la zona y sin
  depender de los filtros ni de la página: el número de cierres, el número de mensajeros distintos y
  el tipo de bloqueo de «Solicitar cierre de bodega» (sin zona, cierres sin resolver, nada que
  consolidar, o ninguno).
- **R196** — Las tarjetas de «A consolidar» DEBEN pintar el conjunto completo (no la página ni los
  filtros), en este orden y con estas notas:
  - «Recaudado»: `totalesAgregados.general`, con los métodos de pago que no valen cero;
  - «Pago a mensajeros»: `totalPagoMensajeroAgregado`, nota «<n> mensajero(s) · se paga del
    efectivo»;
  - «Gana la bodega satélite»: `totalIngresoBodegaRechazosAgregado`; SI ningún cierre del conjunto es
    del modelo nuevo, ENTONCES con la nota «por devoluciones a origen»; SI alguno lo es, ENTONCES sin
    nota (en el modelo nuevo la bodega cobra por cualquier resultado);
  - «Debe llegar a la central»: `paraLaCentralAgregado`, destacada, nota «recaudado − mensajeros −
    bodega»;
  - «La central debe»: `totalCentralDebeAgregado`, en tono de aviso, nota «el efectivo no alcanzó
    para pagar a todos los mensajeros»; SI vale "0.00", ENTONCES NO DEBE pintarse.
- **R197** — El pie de «A consolidar» DEBE mostrar el botón «Solicitar cierre de bodega» y la
  paginación de hoy, y además:
  - SI se puede solicitar, ENTONCES «Se enviarán los <n> cierres aprobados a la central. No se puede
    deshacer.» (con n = 1: «Se enviará el cierre aprobado a la central. No se puede deshacer.»), con n
    del R195;
  - SI el bloqueo es de cierres sin resolver, ENTONCES «Se habilita cuando no quede ningún cierre de
    mensajero por resolver.»;
  - SI el bloqueo es que no hay nada que consolidar, ENTONCES ningún texto.
  CUANDO la satélite pulsa el botón habilitado, el sistema DEBE abrir el diálogo «Solicitar cierre de
  bodega».
- **R198** — MIENTRAS la satélite no pueda solicitar, el aviso de R46 DEBE ir entre la barra y las
  tarjetas con `role="status"`, y el botón deshabilitado DEBE referirlo con `aria-describedby`.
- **R199** — SI hay cierres del día de la zona en `solicitado`, ENTONCES el motivo del bloqueo que
  emite el servidor DEBE ser:
  - un cierre: «Todavía no puedes consolidar: <A> tiene un cierre sin resolver. Apruébalo o
    recházalo primero.»;
  - varios cierres de un mismo mensajero: «Todavía no puedes consolidar: <A> tiene cierres sin
    resolver. Apruébalos o recházalos primero.»;
  - varios mensajeros: «Todavía no puedes consolidar: <A>, <B> y <C> tienen cierres sin resolver.
    Apruébalos o recházalos primero.»;
  con cada nombre una sola vez, en orden alfabético, y solo los mensajeros con cierres `solicitado`
  de destino satélite en la zona del actor (el mismo conjunto que bloquea `solicitarCierreBodega`).
- **R200** — `solicitarCierreBodega` NO DEBE cambiar: la misma puerta (cierres sin resolver, nada que
  consolidar) y los mismos mensajes de `conflict` de hoy.
- **R201** — MIENTRAS la pestaña activa sea «Solicitados», la cola DEBE mostrar la lista de hoy
  (`CierresBodegaSolicitadosLista`, con su paginación propia), sin tarjetas, sin aviso y sin el botón
  de solicitar.
- **R202** — SI la satélite no tiene zona asignada, ENTONCES la pantalla DEBE seguir como hoy: el aviso
  de sin zona y la lista de solicitados, sin cola, sin tarjetas y sin botón.
- **R203** — La cola DEBE mostrar la descripción «Bodega satélite · <zona>. Junta los cierres
  aprobados de tus mensajeros y envíalos a la central.» («Bodega satélite. …» si no llega el nombre).
  La tabla de «A consolidar» DEBE estar en una región con nombre «Cierres del día a consolidar».
  MIENTRAS su página no haya llegado, DEBE mostrar el estado de carga. SI la lectura falla, ENTONCES
  DEBE mostrar «No se pudieron cargar los cierres a consolidar.». SI está vacía, ENTONCES DEBE mostrar
  «No hay cierres del día aprobados para consolidar.». La paginación DEBE conservar su nombre
  «Paginación de los cierres del día a consolidar».
- **R204** — `ConsolidacionBodegaModule` DEBE montar `ColaCierres` y NO DEBE montar `ListaComprobantes`,
  `CierreConsolidableFacturaResumen`, `TotalesPanel`, `PagoMensajeroTotal`,
  `IngresoBodegaRechazosTotal`, `CentralDebeTotal`, `SegmentedToggle` ni `PanelConmutado`. El neto
  agregado (`totalNetoAgregado`) deja de pintarse; sigue en el contrato. El censo de tablas
  (`tests/unit/descarga/censo-tablas.ts`) DEBE listar `ConsolidacionBodegaModule.tsx` entre los
  `montajes` de `ColaCierres`.
- **R205** — CUANDO la solicitud termina en `ok`, el sistema DEBE avisar «Cierre de bodega solicitado
  correctamente.», cerrar el diálogo, revalidar las páginas de las dos listas y refrescar la ruta, como
  hoy.
- **R206** — La cola de cierres de mensajeros (SLT-102) y la cola de bodega de la central (SLT-127)
  DEBEN seguir igual: mismas pestañas, columnas, acciones, textos y nombres accesibles.
- **R207** — El resumen del diálogo de R48 DEBE ser una lista de definiciones con nombre «Resumen del
  cierre de bodega a solicitar», con los cuatro pares en el orden de R48 y los mismos strings del
  servidor que las tarjetas, formateados con `money()`. El título, la descripción y el botón del
  diálogo NO DEBEN cambiar.

### Dinero intacto (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe: ni
  snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.

## Preguntas abiertas

- **PA1 — Textos nuevos (se validan en Preview).** El canvas da los textos de ejemplo del aviso, del
  pie y de las notas de las tarjetas; el spec los escribe en R196, R197 y R199 con plural y singular,
  y la nota de «Gana la bodega satélite» por modelo (el canvas dice «por devoluciones y no
  entregadas», que en el modelo viejo es «devoluciones a origen» y en el nuevo sería falso: SLT-54
  R71). **Recomendación:** tal como están; Carlos los mira en Preview, como en SLT-127 (PA3).
- **PA3 — Permiso de «Ver su cierre» (lo confirma T0.2).** R193 da por hecho que el `?cierre=` de
  hoy abre a la satélite un cierre del día **aprobado** de su zona, como abre los de su cola. Si
  T0.2 encuentra que no, se para: abrirlo pediría un permiso nuevo, fuera de esta rebanada.
- **PA2 — Conteo de «Solicitados».** La lista de hoy no aplica los filtros (los aplica solo su
  descarga; R52 lo arregla en SLT-107). Para que el número de la pestaña diga lo mismo que la lista,
  n es el total de la zona **sin** filtros. **Recomendación:** aceptarlo así hasta SLT-107, que hará
  que lista, descarga y conteo filtren igual.
- **PA-T — Tamaño (para Carlos).** 31 archivos (78 % de 40, por debajo del 80 %): cabe, justo. Líneas estimadas ~1 100-1 300
  (tope 1 000; `tasks.md > Tamaño`). Si al cerrar T5 el gate pasa de 1 000 líneas:
  **(a, recomendado)** marca `<!-- tamano-pr-aceptado: … -->` en `progress/features/SLT-106.md`, como en
  SLT-102 y SLT-127; **(b)** corte en dos rebanadas verticales que se mergean solas:
  - **C1 — Servidor y diálogo, pantalla de hoy:** R67, R194, R195, R199, R200, R207 y R48. Se ve sin
    la cola: el motivo con nombres sale en el aviso de hoy (`motivo-bloqueo-bodega`) y el resumen en
    el diálogo de hoy. ~14 archivos.
  - **C2 — La cola:** R32, R45, R46, R190-R193, R196-R198, R201-R206. ~18 archivos.
  El coste de (b): `e2e/cierre-bodega-satelite.spec.ts` y `ColasPaginacion.test.tsx` se tocan dos
  veces.
