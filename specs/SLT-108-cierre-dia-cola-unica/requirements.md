# SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» — requirements

> Ruta: completa. Zona: **frontend**. Escrito por spec_author el 2026-11-11.
> - **v2**, del mismo día, tras las respuestas de Carlos (PA1-PA4): SLT-108 se queda con **S10a**.
> - **v3**: el pendiente de pago (R164, R165) pasa a SLT-137 «/cierre-dia: cola de cierres del
>   mensajero con filtros», que depende de esta, junto con la cola.
>
> Rebanada S10 del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/`:
> - `requirements.md` v2: R58-R60 `[S10]`; R77 incluye S10;
> - `design.md`: `> Props → quién las usa` y `> Qué sustituye cada componente`;
> - `tasks.md > Plan de las demás rebanadas > S10`.
>
> Canvas aprobado: `Main.dc.html` con `MensDetalle.dc.html` («Mensajero 5»).
>
> Ya están en `dev`:
> - SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)»: el detalle único, con audiencia
>   mensajero;
> - SLT-101 «Fila de gestión única y lista con filtros»;
> - SLT-102 «Cola de cierres única: mensajeros (central y satélite)»;
> - SLT-127 «Cola de bodega de la central con la cola única»;
> - SLT-103 «Diálogos del módulo de cierres y trato tú» (PR #131, mergeado).
>
> Los R ≤ 78 son copia del madre. Los nuevos empiezan en R150 para no chocar con SLT-103, que llega
> a R146.

## Alcance

`/cierre-dia`, rol mensajero:

- **Detalle de un cierre pasado.** «Ver» en uno de sus cierres abre el detalle único
  (`DetalleCierre`) con `tipo` mensajero, audiencia mensajero, modo solo lectura y marco modal. Sustituye
  al modal de hoy con el comprobante (`CierreFacturaDetalle` en variante mensajero).
  - «Gestiones» lleva la lista y la fila únicas (`GestionesCierre`), su «Descargar» y las órdenes
    pasadas a «Novedad interna».
  - «Rechazados por la tienda» lleva `RechazosDeTiendaCierre`.
- **«Ganancia» en «Incidente».** La sección del día y su descarga la añaden.

La tira «Cierres solicitados» de hoy (`ListaComprobantes` + `CierreFacturaResumenPropio`) **no cambia
en esta ficha**: sigue siendo el sitio desde el que se pulsa «Ver».

## Fuera de alcance

### → SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros»

Estos requisitos pasan a SLT-137 con su texto tal cual, para que su spec los copie con el mismo
número. También se va allí el cambio de `montajes` de `ColaCierres.tsx` en
`tests/unit/descarga/censo-tablas.ts` (añadir `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`),
y las adaptaciones de `cascada-central-en-las-dos-pantallas.guardia.test.ts` y
`BajoRiesgoPaginacion.test.tsx`.

- **R60** [S10; tarjetas en S14] — «Cierres solicitados» de `/cierre-dia` DEBE ser la cola única con
  rol mensajero:
  - tarjetas «Ganancia pendiente de pago» y «Ganancia pagada este mes» (R69);
  - columnas Folio, Solicitado, Destino, Estado, Recaudado, Ganancia y Pago («Pendiente de pago»,
    «Liquidado», el motivo en un rechazado, «—»);
  - acción «Ver»;
  - la paginación de hoy.
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
  - en un `aprobado` sin ese dato: «Sin dato» (PA1);
  - en cualquier otro estado: «—».

  *Nota de v3:* con PA1 = (a), SLT-137 emite el dato (R164, abajo). La rama «Sin dato» queda solo
  para una respuesta que no lo traiga.
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
- **R166** (la mitad «cola» del R161 de v1) — `/cierre-dia` NO DEBE montar la tarjeta-comprobante
  propia (`CierreFacturaResumenPropio`) ni la tira de comprobantes (`ListaComprobantes`).
- **R167** (PA2, decisión de Carlos 2026-11-11) — La barra de la cola con rol mensajero DEBE usar el
  componente de filtros de la app: `BuscadorFiltros` (`components/shared/BuscadorFiltros.tsx`) con
  `FilterComponent` (`components/shared/FilterComponent.tsx`), como `FiltrosCierresBarra` en
  `/cierres-admin`. DEBE ofrecer:
  - buscador por folio;
  - filtro por fecha de solicitud;
  - filtro por estado.

  El filtrado DEBE hacerse en el servidor, con el alcance del mensajero en el `WHERE`. El conteo de
  la pestaña y el archivo de «Descargar» DEBEN respetar los filtros puestos.

#### Pendiente de pago por cierre (servidor), que pinta la celda «Pago» de R157

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

**Cálculo que se reutiliza (no se escribe otro):**
- `derivarPendienteCierre`, en `lib/utils/pendiente-cierre.ts:59`, que usa `calcularSplitPago`
  (`lib/utils/cuenta-por-pagar.ts:22`);
- `sumarVigentesPorCierre`, en `ILiquidacionPagoRepository.ts:369` / `LiquidacionPagoRepository.ts:546`;
- `sumarPremiosVivosPorCierre`, en `IPagoMensajeroMovimientoRepository.ts:206` /
  `PagoMensajeroMovimientoRepository.ts:362`.

Se combinan igual que en `CierresAdminService.conPendiente` (`lib/services/CierresAdminService.ts:1287-1364`).

**Diseño previsto:**
- campo aditivo `CierrePasadoDTO.pendientePagoMensajero?: string | null`, que solo emite el listado
  paginado;
- parámetro opcional `pendientes` al final del constructor de `CierreDiaService`; sin él, el campo no
  sale;
- inyección en `lib/actions/cierre-dia.ts > buildService`;
- test de cableado con el patrón de `gestion-desde-ayuda-cableado.test.ts`.

**Prueba de integración contra Postgres real** (`tests/integration/db/cierre-dia-pendiente-pago.test.ts`,
base desechable). Para un mensajero M:

| Cierre | Estado | `P` | `E` | Pagos y premios | Pendiente esperado |
|---|---|---|---|---|---|
| C1 | aprobado | 4 500,00 | 1 000,00 | un pago vigente de 1 000,00 y uno anulado de 500,00 | `min(P,E)` = 1 000 → generado 3 500,00 − 1 000,00 vigente = **`"2500.00"`** (el anulado no resta) |
| C2 | aprobado | 2 000,00 | 5 000,00 | sin pagos | **`"0.00"`** |
| C3 | solicitado | — | — | — | **`null`** |

Además, otro mensajero M2 con un cierre aprobado y un pago, que no debe aparecer en la página de M.
Antes de mirar valores, `expect(items).toHaveLength(3)`.

**Mutaciones que deben ponerla en rojo:**
1. Contar el pago anulado → C1 da `"2000.00"`.
2. Pasar `pagadoVigente: "0.00"` fijo → C1 da `"3500.00"`.
3. Quitar el filtro de aprobados → C3 deja de ser `null`.

Tamaño que se lleva: ~6 archivos y ~250 líneas (servicio, interfaz, acción, test de servicio,
integración y cableado).

### Otros

- El cierre del día en curso, rechazado o vencido como página, y «Devolver a gestión» en la fila
  (R61-R63): SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página».
- Las tarjetas de R69: SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero».
- Borrar `CierreFacturaDetalle` y los demás componentes sustituidos: SLT-115 «Retirar los
  componentes de cierre sustituidos».
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71, R72).
- Cualquier cambio en `lib/`: SLT-108 es solo de pantalla.

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Una cifra, un nombre; un solo trato: tú. |
| D8 | 2026-11-08 · tarjeta | El pago al mensajero (= «Ganancia») entra en «Incidente» de `/cierre-dia` y en su Excel. |
| D11 | 2026-11-09 · Carlos (PA4) | «Rechazados por la tienda» no se oculta sin rechazos: estado vacío. |
| D12 | 2026-11-09 · Carlos (PA5) | Se quita la impresión del detalle; la hoja del mensajero cae con S10. |
| D15, D17 | 2026-11-09 · Carlos | Componentes iguales con props distintas; se reutilizan `DetalleCierre`, `GestionesCierre`, `DescargarDatasetButton` y `Modal`. |
| S3-PA6 | SLT-101 (R87 retirado) | La fila única enseña solo lo que dibuja el canvas: sin marca «La tienda», ni ubicación, motivo, causa u origen en la cabecera. Rige también para el mensajero. |
| S10-PA1 | 2026-11-11 · Carlos | PA1 = (a), el pendiente se trae ahora y no espera a SLT-112; vive en SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» porque allí está la celda que lo muestra. Con el cálculo que ya existe en el servidor y un test de integración contra Postgres real con mutación; R71 y R72 siguen aplicando. SLT-108 vuelve a ser frontend. |
| S10-PA2 | 2026-11-11 · Carlos | Los filtros de la cola van con el componente de filtros de la app y filtrado en el servidor: R167 en SLT-137. |
| S10-PA3 | 2026-11-11 · Carlos | Se parte: SLT-108 = S10a (detalle + Incidente); SLT-137 = la cola y su pendiente de pago. |
| S10-PA4 | 2026-11-11 · Carlos | SLT-103 (#131) ya está en `dev`; se parte de `origin/dev` actualizado. |

Cobertura:

| Decisión | Requisitos |
|---|---|
| D5 | R71, R72 |
| D6 | R150 |
| D8 | R58, R162 |
| D11 | R151 |
| D12 | R161 |
| D15, D17 | R59, R151, R152 |
| S3-PA6 | R151 |
| S10-PA1, S10-PA2, S10-PA3 | `## Fuera de alcance > → SLT-137` (R60, R155-R160, R163-R167) |
| S10-PA4 | `tasks.md > T0.1` |

## Requisitos (EARS)

El test previsto de cada R está en `tasks.md > Trazabilidad`.

### Copia del madre

- **R58** [S10] — La sección «Incidente» de `/cierre-dia` y su descarga DEBEN incluir la columna
  «Ganancia» con el `pagoMensajero` de la gestión. La indemnización DEBE seguir sin mostrarse.
- **R59** [S10] — CUANDO el mensajero pulsa «Ver» en uno de sus cierres, el sistema DEBE abrir el
  detalle único con audiencia mensajero, modo solo lectura y marco modal, con la nota de que los
  montos son los congelados al solicitar.
- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S10] — Para un mismo cierre, cada cifra que ve el mensajero en el detalle DEBE ser igual
  al céntimo al importe escrito a mano en el escenario E2E, con un cierre del modelo viejo y otro del
  modelo nuevo.

### Detalle de un cierre pasado

- **R150** — El detalle de un cierre pasado DEBE mostrar arriba el título «Tu cierre del día», el
  destino, el folio y la fecha de solicitud (y la de resolución, si la hay). Debajo DEBE mostrar
  tres cifras:
  - «Recaudado» = `totales.general` de ese cierre, con efectivo, SINPE y transferencia, sin los que
    valen cero;
  - «Gestiones» = el número de gestiones del cierre;
  - «Tu ganancia» = `totalPagoMensajero` de ese cierre.

  NO DEBE pintar ninguna cifra del dinero de la empresa (cobro a la tienda, facturado, IVA, «Le queda
  a la empresa», pago a la bodega, ingreso de bodega) ni la pestaña «Dinero».
- **R151** — El detalle de un cierre pasado DEBE ofrecer las pestañas «Gestiones (n)» y «Rechazados
  por la tienda (n)», y abrir en «Gestiones».
  - «Gestiones» DEBE listar las gestiones del cierre con la lista y la fila únicas en audiencia
    mensajero: columna «Ganancia», sin cobro a la tienda y sin acciones de corrección.
  - Debajo DEBE listar las órdenes que el corte pasó a «Novedad interna», con su marca de registro,
    tal como las emite el servidor.
  - «Rechazados por la tienda» DEBE seguir visible con conteo 0 y su estado vacío cuando no hay
    rechazos.
- **R152** — En «Gestiones», el detalle de un cierre pasado DEBE ofrecer «Descargar» con una fila
  por gestión del cierre y estas columnas, en este orden:
  - Nº Guía, Destinatario, Tienda, Resultado, Recibido, Ganancia y Señales;
  - «Ganancia» = `pagoMensajero`;
  - «Señales» = el mismo texto que la fila enseña al mensajero.

  El archivo NO DEBE llevar «Cobro a la tienda» ni otro dato del dinero de la empresa.
- **R153** — SI la lectura del cierre responde `no_encontrada`, ENTONCES el sistema DEBE avisar
  «Este cierre ya no está disponible.» y NO DEBE abrir el detalle. SI falla por otro motivo,
  ENTONCES DEBE avisar «No se pudo cargar el detalle de este cierre.» y NO DEBE abrir el detalle.
- **R154** — CUANDO el mensajero pide ver la evidencia de una gestión del detalle, el sistema DEBE
  abrir el visor de evidencia de `/cierre-dia` con las URL firmadas que llegaron del servidor.
- **R161** — `/cierre-dia` NO DEBE montar el comprobante del cierre (`CierreFacturaDetalle`) ni
  ofrecer imprimir un cierre pasado.

### «Ganancia» en «Incidente»

- **R162** — En la sección «Incidente» de `/cierre-dia` y en su descarga, «Ganancia» DEBE ir después
  de la evidencia, igual que en «Devolución a origen por rechazo». SI el `pagoMensajero` de la
  gestión es nulo, ENTONCES la celda DEBE pintar «—» en pantalla y quedar vacía en el archivo, nunca
  0.

## Preguntas abiertas

Ninguna. PA1-PA4 y PA-T están resueltas (`## Decisiones cerradas`).
