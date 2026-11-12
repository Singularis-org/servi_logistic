# SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» — requirements

> Ruta: completa. Zona: **fullstack**. Escrito por spec_author el 2026-11-12.
>
> **Estado: BLOQUEADO, no cabe en un PR** (`## Preguntas abiertas > PA1`). Este archivo deja escritos
> el alcance y los requisitos para que el humano decida el corte. Faltan `design.md` y `tasks.md`:
> se escriben cuando se haya decidido el corte, una vez por rebanada.
>
> Es la parte 2 de SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (S10b). Los
> requisitos que vienen de allí se copian **tal cual y con su número**:
> `specs/SLT-108-cierre-dia-cola-unica/requirements.md > ## Fuera de alcance > → SLT-137`.
> Spec madre: `specs/SLT-95-detalle-cierre-rediseno/` (aprobado por Carlos el 2026-11-09):
> R60 `[S10]`, `design.md > 2. Cola de cierres — ColaCierres` (rol `mensajero`) y
> `tasks.md > Plan de las demás rebanadas > S10`.
> Los requisitos nuevos de esta ficha usan el rango **R168-R189**.

## Alcance

`/cierre-dia`, rol mensajero, sección «Cierres solicitados»:

- **La cola única con rol mensajero.** `ColaCierres` (`components/private/cierres/cola/ColaCierres.tsx`)
  sustituye a la tira de hoy (`ListaComprobantes` + `CierreFacturaResumenPropio`). Lleva una pestaña,
  las columnas de R60/R156, la celda «Pago» de R157, «Descargar», la paginación de hoy y «Ver», que
  abre el detalle único que dejó SLT-108.
- **El pendiente de pago por cierre, en el servidor.** El listado paginado emite
  `pendientePagoMensajero` con el cálculo que ya usa la cola del admin (R164, R165). Lo pinta la celda
  «Pago».
- **Buscador y filtros, en el servidor.** Se busca por folio y se filtra por fecha de solicitud y por
  estado con `BuscadorFiltros` + `FilterComponent`, como hace `FiltrosCierresBarra` en `/cierres-admin`
  (R167). El filtrado va en el `WHERE`, junto al alcance del mensajero.

## Fuera de alcance

- Las tarjetas «Ganancia pendiente de pago» y «Ganancia pagada este mes» (R69):
  SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero». Hasta entonces, R158.
- Borrar `CierreFacturaResumenPropio`, `ListaComprobantes` y los demás componentes sustituidos:
  SLT-115 «Retirar los componentes de cierre sustituidos». Esta ficha deja de montarlos (R166) pero
  no los borra.
- El cierre del día en curso, rechazado o vencido como página (R61-R63): SLT-109 «/cierre-dia: el
  cierre de hoy, rechazado o vencido como página».
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71, R72).

## Decisiones cerradas (no reabrir)

Vienen de `specs/SLT-108-cierre-dia-cola-unica/requirements.md > ## Decisiones cerradas`.

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Una cifra, un nombre; un solo trato: tú. |
| D15, D17 | 2026-11-09 · Carlos | Componentes iguales con props distintas: se reutilizan `ColaCierres`, `DescargarDatasetButton` y la barra de filtros de la app. |
| S10-PA1 | 2026-11-11 · Carlos | El pendiente de pago se trae ahora, no espera a SLT-112. Vive en esta ficha porque aquí está la celda que lo muestra. Se calcula con lo que ya existe en el servidor y se prueba contra Postgres real, con mutación. R71 y R72 siguen aplicando. |
| S10-PA2 | 2026-11-11 · Carlos | Los filtros de la cola usan el componente de filtros de la app y se aplican en el servidor (R167). |
| S10-PA3 | 2026-11-11 · Carlos | SLT-108 es S10a (detalle + Incidente) y SLT-137 es S10b (la cola y su pendiente de pago). |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D5 | R71, R72, R164 (lo que se le paga no cambia por leerlo) |
| D6 | R180 |
| D15, D17 | R60, R159, R167, R177 |
| S10-PA1 | R157, R164, R165 |
| S10-PA2 | R167, R168-R172, R177 |
| S10-PA3 | R60, R155-R160, R163-R167 |

## Requisitos (EARS)

El test previsto de cada R irá en `tasks.md > Trazabilidad` cuando se escriba, uno por rebanada
(`PA1`).

### Copia del madre y de SLT-108 (texto tal cual)

- **R60** [S10; tarjetas en S14] — «Cierres solicitados» de `/cierre-dia` DEBE ser la cola única con
  rol mensajero:
  - tarjetas «Ganancia pendiente de pago» y «Ganancia pagada este mes» (R69);
  - columnas Folio, Solicitado, Destino, Estado, Recaudado, Ganancia y Pago («Pendiente de pago»,
    «Liquidado», el motivo en un rechazado, «—»);
  - acción «Ver»;
  - la paginación de hoy.
- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R155** — La cola con rol mensajero DEBE tener:
  - la descripción «Tus cierres enviados a aprobación y cómo terminaron.»;
  - una sola pestaña, «Cierres solicitados <n>», donde `n` es el `total` del servidor;
  - un `tablist` llamado «Tus cierres»;
  - la tabla dentro de una región llamada «Cierres solicitados».

  Sin pestañas «Pendientes» / «Resueltos» y sin el conmutador «Bodega» / «Mensajero».
- **R156** — Cada fila de la cola con rol mensajero DEBE pintar:
  - Folio: «#» + los últimos 8 caracteres del id del cierre, en mayúsculas;
  - Solicitado: la fecha y hora de solicitud en la zona de la empresa, con el mismo formato que la
    cola de la central;
  - Destino: el rótulo del tipo de destino («Bodega central», «Bodega satélite»), sin la zona;
  - Estado: la pastilla de estado de hoy;
  - Recaudado: `totales.general`; Ganancia: `totalPagoMensajero`, los dos con el formateador
    compartido;
  - la acción «Ver», con el nombre accesible de hoy, «Ver del cierre del <día>».
- **R157** — La celda «Pago» de la cola con rol mensajero DEBE decir:
  - en un `rechazado`: «Motivo: «<motivo>»», o «La bodega no indicó un motivo.» si no hay motivo;
  - en un `aprobado` con el pendiente de pago emitido por el servidor: «Pendiente de pago» si es
    mayor que cero, y «Liquidado» si no lo es;
  - en un `aprobado` sin ese dato: «Sin dato» (PA1 de SLT-108);
  - en cualquier otro estado: «—».
- **R158** — MIENTRAS el servidor no emita las cifras de R69, la cola con rol mensajero NO DEBE
  pintar tarjetas de cifras: ni las rotuladas «Ganancia pendiente de pago» o «Ganancia pagada este
  mes», ni ninguna cifra en 0 en su lugar.
- **R159** — La barra de la cola con rol mensajero DEBE ofrecer el «Descargar» de hoy: mismo título
  «Cierres solicitados», mismas columnas, mismo ámbito de columnas y el conjunto completo de los
  cierres del mensajero que resuelve el servidor.
- **R160** — La cola con rol mensajero DEBE conservar:
  - el estado vacío «Aún no has solicitado ningún cierre.»;
  - el error «No se pudieron cargar tus cierres solicitados.»;
  - la paginación de hoy, con su nombre «Paginación de los cierres solicitados», sus tamaños de
    página y la relectura de todas las páginas tras solicitar un cierre.
- **R163** — La cola de la central y la de la satélite NO DEBEN cambiar: mismas pestañas, columnas,
  celdas y acciones que hoy.
- **R164** — El listado paginado de «Cierres solicitados» del mensajero DEBE emitir, por cada
  cierre, `pendientePagoMensajero`:
  - en un `aprobado`: lo que queda por pagarle de ese cierre, con la regla y la función de la cola
    del admin (`derivarPendienteCierre`):
    - `min(P, E)`: `P` es el pago al mensajero congelado del cierre y `E` el efectivo congelado;
    - se suman los premios vivos del cierre;
    - se restan los pagos **vigentes** registrados contra ese cierre (un pago anulado no resta);
    - el resultado es un string de escala 2, nunca negativo;
  - en cualquier otro estado: `null`.

  Lo que se le paga al mensajero NO DEBE cambiar por leerlo, ni ningún snapshot.
- **R165** — El listado paginado DEBE obtener los pagos vigentes y los premios vivos con una lectura
  de cada uno por página, sin que el número de consultas crezca con el tamaño de página. La acción
  de producción DEBE construir el servicio con esas dos lecturas inyectadas: un servicio sin ellas
  NO DEBE emitir un `pendientePagoMensajero` inventado.
- **R166** — `/cierre-dia` NO DEBE montar la tarjeta-comprobante propia (`CierreFacturaResumenPropio`)
  ni la tira de comprobantes (`ListaComprobantes`).
- **R167** (decisión de Carlos 2026-11-11) — La barra de la cola con rol mensajero DEBE usar el
  componente de filtros de la app: `BuscadorFiltros` (`components/shared/BuscadorFiltros.tsx`) con
  `FilterComponent` (`components/shared/FilterComponent.tsx`), como `FiltrosCierresBarra` en
  `/cierres-admin`. DEBE ofrecer:
  - buscador por folio;
  - filtro por fecha de solicitud;
  - filtro por estado.

  El filtrado DEBE hacerse en el servidor, con el alcance del mensajero en el `WHERE`. El conteo de
  la pestaña y el archivo de «Descargar» DEBEN respetar los filtros puestos.

La tabla de la prueba de integración de R164 y sus tres mutaciones están en
`specs/SLT-108-cierre-dia-cola-unica/requirements.md > Pendiente de pago por cierre (servidor)`. El
`design.md` de la rebanada que lleve R164 las copia.

### Nuevos: la cola

- **R180** — Todo texto nuevo de la cola con rol mensajero y de su barra DEBE tratar de tú, sin
  voseo (por ejemplo «Busca», nunca «Buscá»).
- **R181** — CUANDO el mensajero pulsa «Ver» en una fila de la cola, el sistema DEBE abrir el
  detalle de ese cierre (R59 de SLT-108). MIENTRAS ese detalle se lee, el botón «Ver» de esa fila
  DEBE estar deshabilitado y con `aria-busy="true"`.

### Nuevos: buscador y filtros (servidor)

- **R168** — El listado paginado de «Cierres solicitados» y su archivo DEBEN aceptar el mismo bloque
  `filtros`, con solo estas claves, todas opcionales: `desde`, `hasta`, `estados` y `folio`.
  - SI la petición trae cualquier otra clave, dentro o fuera de `filtros` (entre ellas `mensajeroId`,
    `mensajeroIds` y `destinoZonaIds`), ENTONCES el sistema DEBE responder `validation_error` sin
    leer la base.
  - SI `desde` es posterior a `hasta`, ENTONCES DEBE responder `validation_error`.
- **R169** — DONDE el filtro trae `desde`, `hasta` o los dos, el listado DEBE devolver solo los
  cierres con fecha de solicitud igual o posterior a las 00:00 de `desde` y anterior a las 00:00 del
  día siguiente a `hasta`, en la zona horaria del país de la empresa.
- **R170** — DONDE el filtro trae `estados`, el listado DEBE devolver solo los cierres cuyo estado
  esté en esa lista. SI `estados` llega vacío o con un valor que no es un estado de cierre, ENTONCES
  el sistema DEBE responder `validation_error`.
- **R171** — DONDE el filtro trae `folio`, el sistema DEBE quitarle los espacios de los extremos y un
  «#» inicial, y pasarlo a mayúsculas. El listado DEBE devolver solo los cierres cuyo folio (los 8
  caracteres de R156, sin «#») contenga ese texto.
  - SI el texto queda vacío, ENTONCES el filtro DEBE ignorarse.
  - SI tiene un carácter que no puede estar en un folio (fuera de `0-9` y `A-F`), ENTONCES el
    listado DEBE devolver cero cierres y `total` 0.
  - SI pasa de 20 caracteres antes de normalizar, ENTONCES DEBE responder `validation_error`.
- **R172** — Cada filtro, solo o combinado con los demás, DEBE aplicarse dentro del alcance del
  mensajero de la sesión: ninguno DEBE devolver ni contar un cierre de otro mensajero. El `total`
  DEBE ser el número de cierres del mensajero que cumplen todos los filtros a la vez.
- **R173** — MIENTRAS no haya ningún filtro puesto, el listado paginado y su archivo DEBEN devolver
  los mismos cierres que hoy y en el mismo orden.
- **R174** — CUANDO el mensajero pulsa «Descargar» con filtros puestos, el archivo DEBE llevar todos
  los cierres del mensajero que cumplen esos filtros, no solo la página visible.

### Nuevos: buscador y filtros (pantalla)

- **R175** — CUANDO el mensajero cambia el folio, la fecha o el estado, la cola DEBE volver a la
  página 1 y pedir al servidor la página con los filtros nuevos. El conteo de la pestaña DEBE ser el
  `total` de esa respuesta.
- **R176** — SI hay algún filtro puesto y el servidor devuelve cero cierres, ENTONCES la cola DEBE
  decir «Ningún cierre coincide con los filtros.» en lugar de «Aún no has solicitado ningún cierre.».
- **R177** — La barra de la cola con rol mensajero DEBE ofrecer:
  - un campo de búsqueda con la guía «Busca por folio»;
  - en el selector «Filtros», solo «Fecha de solicitud», con los mismos atajos de rango que
    `/cierres-admin`, y «Estado», con los cuatro estados del cierre con su etiqueta legible y sin
    agruparlos por lista.

  NO DEBE ofrecer «Bodega» ni «Mensajero», ni el aviso «Filtro activo: los dos listados muestran
  solo lo que casa con él.».
- **R178** — CUANDO el mensajero pulsa «Limpiar todo», la barra DEBE vaciar el folio, la fecha y el
  estado, y la cola DEBE volver a la lista sin filtros, en la página 1.
- **R179** — La barra de filtros de `/cierres-admin` (cola de mensajeros y de bodega) y la de la
  consolidación de bodega NO DEBEN cambiar: mismos filtros, mismo campo de búsqueda sin efecto y
  mismo aviso.

## Preguntas abiertas

### PA1 — No cabe en un PR (BLOQUEANTE)

`gate.tamano_pr` (sin valor en `arnes.config.json`, así que rige el de por defecto): 40 archivos y
1000 líneas añadidas + borradas. Lo medido como referencia: SLT-108 «/cierre-dia: detalle y cola
únicos para el mensajero» cerró con 16 archivos y 946 líneas, al 95 %
(`progress/impl_SLT-108.md > Tamaño`).

Estimación de esta ficha entera:

| Parte | Archivos | Líneas |
|---|---|---|
| Cola rol mensajero (vista, labels, `ColaCierres`, `CierreDiaModule`) y sus tests y adaptaciones (`censo-tablas.ts`, guardia de cascada, `BajoRiesgoPaginacion`, `CierreDiaModule.test`, `CierresDescarga.test`, E2E) | ~13 | ~550 |
| Pendiente de pago (servicio, interfaz, acción, test de servicio, integración, cableado; estimado de SLT-108) | ~6 | ~250 |
| Buscador y filtros (schema, repositorio con folio, servicio, acción, barra, guardia del schema, integración SQL real, test de la barra, E2E) | ~11 | ~550 |
| **Total** | **~28** | **~1 350** |

Los archivos caben (70 %), pero las líneas pasan del tope y el gate se pondría en rojo.

**Corte propuesto, en dos rebanadas verticales que se mergean solas:**

1. **SLT-137 se queda con la cola y su pendiente de pago.** Requisitos: R60 (sin tarjetas), R71, R72,
   R155-R160, R163-R166, R180 y R181. Unos 19 archivos y ~800 líneas. El «Descargar» y la paginación
   siguen como hoy, y la barra deja el sitio de los filtros vacío. Al mergearla, el mensajero ya ve la
   cola única con «Pendiente de pago» / «Liquidado».
2. **Ficha nueva, «/cierre-dia: buscador y filtros de la cola del mensajero»**, con
   `depends_on: SLT-137`. Requisitos: R167-R179 y R180. Unos 11 archivos y ~550 líneas. Su spec copia
   estos R con el mismo número.

Alternativa, si se quiere más margen en la primera: partirla otra vez. La cola saldría primero con
«Sin dato» en «Pago» (R157 lo permite) y el pendiente de pago (R164, R165) iría en una ficha
intermedia. Serían tres PR de ~400-550 líneas, a cambio de un ciclo más.

Le toca decidir a Carlos: el corte en dos, el corte en tres o aceptar el tamaño
(`docs/gate.md > Tamaño del PR`: línea `tamano-pr-aceptado` en `progress/features/SLT-137.md`).

### PA2 — Qué significa «buscar por folio»

R171 propone que el folio **contenga** el texto: con «3F2A» salen los cierres cuyo folio tiene
«3F2A» en cualquier posición. La otra opción es exigir el folio exacto, los 8 caracteres. Es más
simple en el servidor, pero el buscador no devuelve nada hasta que se teclea el folio entero.
Pregunta para Carlos. Si no responde, se queda «contiene».
