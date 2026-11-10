# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — requirements (v2)

> Ruta: completa (complexity `high`, pantallas de dinero, permisos en S9b). Escrito por spec_author
> el 2026-11-09. **v2 reescribe el v1 del mismo día**: el alcance pasó de «el detalle» al
> **rediseño completo del módulo de cierres** (decisión de Carlos, D15) y Carlos aprobó el canvas
> entero (D18).
>
> Fuentes: `progress/features/SLT-95.md` (decisiones fechadas), el canvas aprobado en
> `canvas/project/` (`canvas.json`, notas n0, n1, n2, c3, s2, m2, p1, p2; componentes
> `Main.dc.html`, `ColaCierres.dc.html`, `Fila2.dc.html`, `Dialogos.dc.html`) y los inventarios
> `inventario-bodega.md` e `inventario-central-dialogos.md`.
>
> El canvas es una maqueta con datos inventados: **sus cifras, nombres de personas y textos de
> ejemplo no son requisitos**. La estructura, los nombres de las cifras, las reglas, las props y los
> comportamientos sí.

## Qué cambió respecto al v1

| v1 | v2 |
|---|---|
| Un componente de detalle para `/cierres-admin` | **Cuatro** componentes únicos parametrizados para todo el módulo: detalle, cola, fila de gestión y diálogos (D15). |
| Cola, resueltos, `/cierre-dia`, consolidación y `/wallet/satelites` fuera | Dentro. Nada se deja fuera (D15). |
| Cifras que no llegan del servidor: se omiten (PA2) | **Todas van** (D10): se derivan en el servidor de datos que ya existen (R64-R70). |
| «Rechazados por la tienda» oculta sin rechazos (PA4) | Siempre visible, con estado vacío (D11). |
| Impresión: Ctrl+P de la pestaña activa (PA5) | Se quita la impresión; se usa «Descargar» (D12). |
| Títulos de Excel según modelo (R30 del v1) | Documento **nuevo** para el modelo nuevo; el modelo viejo baja con el formato actual (D14, D19). |
| Corte C → A1 → A2 → B | Corte en 17 rebanadas (`## Rebanadas`). SLT-95 se queda con la primera, **S1**. |
| — | Trato «tú» en todo el módulo (D6, regla 7). |
| — | Cambios de comportamiento de la nota p2 (R21, R44, R47, R50, R52, R54, R57, R78). |

Siguen valiendo del v1, renumerados: cabecera, «Por revisar», 4 cifras, métodos en 0 ocultos, sin
«Debe», un solo scroll, pie fijo, pestañas, cascadas de «Dinero», fila 2x2, «Ver cómo se calculó»,
señales, pestañas de bodega, sin cambios de dinero y accesibilidad.

## Alcance

El módulo de cierres entero, en las tres audiencias:

- **Central** (maestro/admin): `/cierres-admin` › Mensajero (cola, detalle, fila, diálogos de
  decisión, de la fila y del pago) y › Bodega (cola «Por conciliar / Conciliados», detalle de
  bodega, conciliación); `/wallet/satelites` y `/wallet/satelites/[zonaId]`.
- **Bodega satélite** (adminSatelite): `/cierres-admin` › Mensajero (la misma cola y el mismo
  detalle que la central, con audiencia satélite) y › Bodega («A consolidar / Solicitados» y su
  cierre de bodega en solo lectura).
- **Mensajero**: `/cierre-dia` (su cierre de hoy, rechazado o vencido como página; sus cierres
  solicitados con la misma cola; el detalle de un cierre pasado).

Todo se pinta con **cuatro componentes únicos** (D15, nota n0):

1. **Detalle del cierre** — props `tipo` (mensajero|bodega) × `audiencia`
   (central|satélite|mensajero) × `modo` (decidir|solo lectura|vencido|en curso|rechazado) ×
   `marco` (modal|página).
2. **Cola de cierres** — props `tipo` × `rol` (central|satélite|mensajero).
3. **Fila de una gestión** — prop `audiencia` (central|satélite|mensajero|solo lectura).
4. **Diálogos** — uno por acción, misma caja (`Modal` existente), botones al pie.

**Sin cambios de dinero** (D5): ningún cálculo, snapshot, asiento, tarifa ni Server Action de
escritura cambia. Las cifras nuevas se **derivan en el servidor** de datos que ya existen y se
pintan como string.

## Lo que NO entra

- Cambiar cómo se calcula o se asienta cualquier importe, o qué se congela al solicitar un cierre.
- Activar el modelo nuevo de tarifas o retirar el viejo (eso es SLT-57 «Tarifas flexibles: retirar
  el modelo viejo»).
- Las superficies que solo **enlazan** a un cierre (`/wallet/mensajeros`, `/wallet/tiendas`,
  `/mi-wallet`, `/wallet`, `/ordenes`, notificaciones; inventario §D): siguen enlazando igual.
  `hrefDetalleCierre` no cambia.
- El editor de desglose (`DesglosePagoField`), el escáner (`EscanerGuiaCard`) y los formularios de
  pago (`RegistrarPagoDialog`, `AnularPagoDialog`): se reutilizan dentro de los diálogos sin
  rediseñarse; solo cambian sus textos al trato «tú» (R56).

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-08 · Carlos | Opción A: UN componente de detalle (tipo `mensajero`/`bodega`) para «Ver detalle» y «Ver / decidir». **v2:** se extiende a todas las audiencias y a `/cierre-dia` (D15). |
| D2 | 2026-11-08 · Carlos | Fila desplegada opción 2: 4 tarjetas en 2x2. «Ver cómo se calculó» = una tarjeta por concepto. |
| D3 | 2026-11-08 · Carlos | «Le queda a la empresa» es la única cifra de ganancia de la empresa; se quita «Debe». |
| D4 | 2026-11-08 · Carlos | Los métodos de pago en 0 no se muestran. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | canvas n2 | Reglas: 1) identidad y estado arriba; 2) cada cifra una vez, un nombre; 3) lo que pide atención, primero; 4) acciones fijas al pie; 5) un solo scroll; 6) métodos en 0 ocultos; **7) un solo trato: tú** (v2). |
| D7 | canvas n1 (v2) | Cambia con la prop: cifra 2 («Se le paga hoy a la tienda» / «Debe llegar a la central»); el mensajero ve 3 cifras (Recaudado, Gestiones, Tu ganancia) y no ve el dinero de la empresa; pestañas (+ «Rechazados por la tienda», «Pago al mensajero» (central, aprobado) · bodega + «Mensajeros» y «Conciliación» · mensajero rechazado + «Corregir»); pie (Aprobar/Rechazar · Destrabar · Marcar recibido/Desmarcar · Solicitar cierre · Solicitar aprobación). |
| D8 | 2026-11-08 · tarjeta | Incluye el pago al mensajero (= «Ganancia») en Incidente de `/cierre-dia` y su Excel, y `verFulfillment` por audiencia en bodega. **v2:** «títulos de Excel según modelo» queda sustituido por D14. |
| D9 | 2026-11-09 · Carlos (PA1) | Se parte en rebanadas, una ficha por rebanada. |
| D10 | 2026-11-09 · Carlos (PA2) | TODAS las cifras del canvas van; la rebanada de cifras del servidor deja de ser opcional. |
| D11 | 2026-11-09 · Carlos (PA4) | «Rechazados por la tienda» no se oculta sin rechazos: se muestra con su estado vacío. |
| D12 | 2026-11-09 · Carlos (PA5) | Se quita la impresión del detalle; quien la necesite usa «Descargar». |
| D13 | 2026-11-09 · Carlos (PA7 v1) | El código muerto se retira en una ficha aparte. |
| D14 | 2026-11-09 · Carlos (PA6) | Excel: documento nuevo para el modelo nuevo (columnas a aprobar en este spec); los cierres del modelo viejo siguen bajando con el formato actual. |
| D15 | 2026-11-09 · Carlos | Rediseño completo del módulo, «no dejes absolutamente nada fuera». Lo que hace la satélite con sus mensajeros es lo mismo que la central: componentes IGUALES con props distintas, nunca uno por rol. |
| D16 | 2026-11-09 · Carlos | Tarjetas con mucha información (fila, cálculo, conciliación) en formato cascada: partidas en líneas simples, «−»/«+» delante, raya y total en negrita. |
| D17 | 2026-11-09 · Carlos / n0 | Se reutilizan tal cual: barra de DataTable = `BuscadorFiltros` + `DescargarDatasetButton`; `Modal` para los diálogos; el conmutador Bodega/Mensajero. |
| D18 | 2026-11-09 · Carlos | Canvas aprobado (versión 33) con sus notas, incluidas p1 (cifras a traer del servidor) y p2 (cambios de comportamiento). |
| D19 | 2026-11-09 · medición en prod (leader) | La empresa NO ha activado el modelo nuevo: `tarifa_valor` = 0 filas; `cierre_detail` = 918 gestiones, todas `tarifa_modelo = viejo`. El formato actual del Excel es el de todos los cierres de prod; el documento nuevo no tendrá datos hasta que se activen tarifas. Las vistas del modelo viejo deben verse bien con el rediseño y el E2E cubre los dos modelos. |

Cobertura: D1 → R1; D2 → R25, R27, R28; D3 → R6, R9; D4 → R7, R27; D5 → R71, R72; D6 → R2,
R4, R5, R6, R7, R11, R12, R56; D7 → R6, R10, R12; D8 → R30, R58; D9 → `## Rebanadas`;
D10 → R64-R70; D11 → R17; D12 → R21; D13 → R76; D14 → R73, R74, R75; D15 → R1, R22, R32, R53;
D16 → R15; D17 → R32, R37, R53; D18 → R21, R44, R47, R50, R52, R54, R57, R78 y R64-R70;
D19 → R29, R73, R77.

## Requisitos (EARS)

Cada requisito lleva entre corchetes la rebanada que lo implementa (`## Rebanadas`). **SLT-95 = S1.**

### A. Detalle del cierre (un componente)

- **R1** [S1] — El sistema DEBE pintar todo detalle de cierre del módulo (de mensajero o de bodega;
  visto por la central, la satélite o el mensajero; en modal o en página) con un único componente,
  parametrizado por `tipo`, `audiencia`, `modo` y `marco`. Ninguna pantalla DEBE montar otro
  componente de detalle de cierre.
- **R2** [S1] — El detalle DEBE mostrar arriba, antes de cualquier cifra, la identidad y el estado:
  - mensajero: título («Cierre de <mensajero>», o «Tu cierre del día» con audiencia mensajero),
    destino, folio, fechas (solicitud; resolución y quién, si la hay);
  - bodega: «Cierre de bodega · <zona>», quién lo solicitó, número de mensajeros, folio y fechas
    (solicitud; recibido, si lo hay).

  Estados: mensajero «Sin solicitar» (en curso), Solicitado, Aprobado, Rechazado, Vencido; bodega
  Pendiente de conciliar, Recibido, Recibido incompleto. El estado DEBE salir de las funciones que
  lo pintan hoy (`EstadoCierreBadge`, `estadoConciliacionDe`).
- **R3** [S1] — SI el cierre de mensajero retiene reprogramadas (`reprogramadasRetenidasHoy` > 0),
  ENTONCES la cabecera DEBE mostrar la marca de retención con esa cifra.
- **R4** [S1] — Entre la cabecera y las cifras, el detalle DEBE mostrar una franja con lo que pide
  atención, y NO DEBE pintarla si no hay nada:
  - modo decidir (central o satélite, mensajero): «Por revisar:» con incidentes sin indemnizar,
    rechazados por la tienda, pagos ajustados y paquetes que vuelven a bodega, cada uno con su
    conteo; los que valen 0 no aparecen;
  - modo decidir, bodega: pagos ajustados y, si falta, que el dinero no se ha marcado recibido
    (satélite: «la central aún no marca el dinero recibido»);
  - modo vencido, central o satélite: que el mensajero no lo envió y está bloqueado, y que
    destrabar es una excepción;
  - audiencia mensajero, rechazado: «Motivo del rechazo:» con el motivo, o «La bodega no indicó un
    motivo.»;
  - audiencia mensajero, vencido o bloqueado: el texto de `avisoBloqueo` (`conCta: false`);
  - audiencia mensajero, en curso, con `puedesSolicitar = false`: «Antes de cerrar:» con el
    `motivoBloqueo` del servidor.
- **R5** [S1] — La franja de R4 DEBE quedar fija (fuera de la región con desplazamiento).
- **R6** [S1] — Con audiencia central o satélite, el detalle DEBE mostrar exactamente cuatro
  cifras, en este orden, con el string del servidor pintado con el formateador compartido:

  | # | Mensajero | Bodega |
  |---|---|---|
  | 1 | «Recaudado» = `totales.general` | «Recaudado» = `totales.general` |
  | 2 | «Se le paga hoy a la tienda» = `pagoTienda` | «Debe llegar a la central» = `paraLaCentral` |
  | 3 | «Pago al mensajero» = `totalPagoMensajero` | «Pago a mensajeros» = `totalPagoMensajero` |
  | 4 | «Le queda a la empresa» = `netoEmpresa` | «Le queda a la empresa» = `netoEmpresa` |

  Con audiencia mensajero DEBE mostrar tres: «Recaudado», «Gestiones» (número de gestiones del
  cierre) y «Tu ganancia» = `totalPagoMensajero`. Un valor negativo DEBE pintarse con su signo.
- **R7** [S1] — Bajo «Recaudado», el detalle DEBE listar efectivo, SINPE y transferencia, y NO DEBE
  pintar un método que valga cero.
- **R8** [S1] — Cada cifra DEBE llevar su línea de contexto, hecha solo de conteos y strings del
  servidor: cifra 2 mensajero = número de tiendas y «ganan en total» `ganaLaTienda`; cifra 2 bodega
  = estado de conciliación; cifra 3 = gestiones y cuántas con pago ajustado (mensajero) o mensajeros
  y ajustes (bodega); cifra 4 = nota fija de qué se restó; «Gestiones» = entregadas y cuántas
  vuelven o con novedad; «Tu ganancia» = cuántos pagos ajustó la bodega.
- **R9** [S1] — El detalle NO DEBE pintar «Debe», ni `ganancia`, ni otro rótulo de ganancia de la
  empresa que «Le queda a la empresa». Con audiencia mensajero NO DEBE pintar ninguna cifra del
  dinero de la empresa (cobro a la tienda, facturado, IVA, le queda, pago a la bodega). Dentro de
  una pestaña, una misma cifra del servidor NO DEBE aparecer con dos rótulos.
- **R10** [S1] — El detalle DEBE ofrecer estas pestañas, con su conteo, y abrir en la primera:

  | tipo · audiencia · modo | Pestañas |
  |---|---|
  | mensajero · central | Dinero · Gestiones (n) · Rechazados por la tienda (n) · Pago al mensajero (solo aprobado y con permiso de pagar) |
  | mensajero · satélite | Dinero · Gestiones (n) · Rechazados por la tienda (n) |
  | mensajero · mensajero · rechazado | Corregir · Gestiones (n) · Rechazados por la tienda (n) |
  | mensajero · mensajero · otro modo | Gestiones (n) · Rechazados por la tienda (n) |
  | bodega · central o satélite | Dinero · Gestiones (n) · Mensajeros (n) · Conciliación |
- **R11** [S1] — MIENTRAS el detalle esté abierto, el cuerpo de la pestaña activa DEBE ser la única
  región con desplazamiento; cabecera, franja, cifras, pestañas y pie DEBEN seguir visibles.
- **R12** [S1] — El pie DEBE quedar fijo, con una línea de contexto y estas acciones (las que
  dependen de un permiso solo aparecen con ese permiso, igual que hoy):

  | tipo · audiencia · modo | Acciones |
  |---|---|
  | mensajero · central/satélite · decidir | «Rechazar» y «Aprobar». SI hay paquetes que vuelven, el botón dice «Revisar paquetes y aprobar» y la línea dice cuántos paquetes hay que confirmar y cuántos incidentes indemnizar |
  | mensajero · central/satélite · vencido | «Cerrar» y «Destrabar cierre vencido» |
  | mensajero · central/satélite · solo lectura | «Cerrar» |
  | bodega · central | las acciones que ya decide `ConciliacionAcciones` para el estado (Marcar recibido / Corregir / Desmarcar), y «Cerrar» |
  | bodega · satélite | «Cerrar» |
  | mensajero · mensajero · en curso | «Solicitar cierre» |
  | mensajero · mensajero · rechazado | «Solicitar aprobación del cierre rechazado» |
  | mensajero · mensajero · vencido | «Solicitar aprobación del cierre vencido» |
  | mensajero · mensajero · solo lectura | «Cerrar» |

  Cada acción DEBE lanzar el mismo flujo que hoy (motivo obligatorio; confirmación física;
  indemnización; destrabar; conciliación; solicitar y re-solicitar).
- **R13** [S1] — DONDE `marco` sea modal, el detalle DEBE ser un `dialog` con botón «Cerrar» (X)
  arriba y nombre accesible que contenga «Detalle del cierre» o «Detalle del cierre de bodega»;
  DONDE sea página, DEBE ser una región sin X.
- **R14** [S1] — En «Dinero» de mensajero, el detalle DEBE mostrar: el reparto «¿A dónde va lo
  recaudado?» en «Se le paga hoy a la tienda» = `pagoTienda` y «Sale de lo recaudado» =
  `cobradoSobreRecaudado` (decisión de Carlos 2026-11-09: el reparto usa el MISMO nombre que la
  cifra o la cuenta, para cumplir R9); la cascada «Lo que se le factura a la tienda» (`fleteConIva`,
  `comisionConIva`, subtotal «Sale de lo recaudado» = `cobradoSobreRecaudado`, flete de no entrega
  `fleteDevolucionConIva` rotulado según el modelo como hoy, «Total facturado» =
  `totalesIngreso.total`); la cascada «De lo facturado, le queda a la empresa» (total facturado,
  − IVA `ivaFacturado`, − pago al mensajero, − pago a la bodega `totalIngresoBodegaRechazos`
  rotulado según el modelo, = `netoEmpresa`); y SI `partesPorTienda` tiene dos o más tiendas,
  «Por tienda» con recaudado, «Se le paga hoy» y «Gana en total», en el orden del servidor.
- **R15** [S1] — Las cascadas del detalle, de la fila (R27, R28) y de la conciliación (R43, R59)
  DEBEN pintarse en formato cascada: una partida por línea, «−» o «+» delante de lo que se resta o
  suma, subtotal con raya punteada y total en negrita con raya continua.
- **R16** [S1] — En «Dinero» de bodega, el detalle DEBE mostrar: el reparto en «Debe llegar a la
  central» = `paraLaCentral`, «Pago a mensajeros» = `totalPagoMensajero` y «Gana la bodega
  satélite» = `totalIngresoBodegaRechazos` (mismos nombres que la cuenta, decisión de Carlos
  2026-11-09); las cascadas «Lo que va a la central» (las líneas de hoy,
  `lineasCascadaCentral`), «Lo que se le factura a la tienda» y «De lo facturado, le queda a la
  empresa» (con − pago a mensajeros y − gana la bodega satélite); y «Por tienda» del agregado con
  dos o más tiendas.
- **R17** [S2] — «Rechazados por la tienda» DEBE listar los `rechazosDeTienda` (guía, destinatario,
  motivo, tienda, fecha) con la nota de que no suman al pago del mensajero. SI no hay ninguno,
  ENTONCES la pestaña DEBE seguir visible con su conteo 0 y un estado vacío.
- **R18** [S2] — «Pago al mensajero» DEBE montar la sección de pago de hoy (pendiente, registrar,
  anular, pagos registrados), con el mismo permiso y la misma relectura tras registrar o anular.
- **R19** [S2] — El detalle de mensajero DEBE seguir mostrando, en «Gestiones», las órdenes que el
  corte pasó a «Novedad interna» y su marca de registro.
- **R20** [S1] — Las pestañas DEBEN exponerse como `tablist`/`tab`/`tabpanel`, y cada cifra y cada
  región de dinero DEBE tener un nombre accesible único.
- **R21** [S2] — El detalle NO DEBE ofrecer impresión. En «Gestiones» DEBE ofrecer «Descargar»
  (el `DescargarDatasetButton` existente) con las gestiones de ese cierre, con las mismas columnas
  que la audiencia ve en la tabla.

### B. Lista de gestiones y fila (un componente de fila)

- **R22** [S3] — El sistema DEBE pintar toda gestión de un cierre con un único componente de fila,
  parametrizado por `audiencia` (central, satélite, mensajero, solo lectura).
- **R23** [S3] — «Gestiones» DEBE ofrecer filtros por resultado con su conteo, más «Todas» y «Con
  señales». Columnas: guía, destinatario · tienda, resultado, recibido, y además:
  - central y satélite: cobro a la tienda (`ingresoEmpresa.total`), pago al mensajero, señales;
  - bodega: además la columna Mensajero;
  - mensajero: «Ganancia» (`pagoMensajero`) y señales, sin cobro a la tienda.
- **R24** [S3] — Las señales de una gestión DEBEN derivarse solo de campos que llegan: «Pago
  ajustado» (`ajustesPago` no vacío); incidente sin indemnizar; «Vuelve a bodega» (reprogramado,
  novedad, devolución a origen); rechazo automático (`esRechazoSla`); «Sin tarifa de pago»
  (`tarifaFaltante`). Una gestión sin ninguna DEBE mostrar la celda vacía.
- **R25** [S3] — CUANDO el usuario despliega una gestión, la fila DEBE mostrar los datos de la orden
  (orden, producto, dirección) y las tarjetas de dinero que permite su audiencia:

  | Tarjeta | central | satélite | mensajero | solo lectura |
  |---|---|---|---|---|
  | Recibió el mensajero | sí | sí | sí | sí |
  | Se le cobra a la tienda (+ «Ver cómo se calculó») | sí | sí | no | sí |
  | Se le paga al mensajero (mensajero: «Tu ganancia») | sí | sí | sí | sí |
  | Fulfillment | sí | no | no | solo si quien mira es la central |
- **R26** [S3] — Las acciones de la fila DEBEN aparecer SOLO cuando hoy se ofrecen (mismo permiso,
  mismo estado del cierre, mismo resultado, mismo callback):

  | Acción | central | satélite | mensajero | solo lectura |
  |---|---|---|---|---|
  | Corregir métodos de pago | sí | no | no | no |
  | Ajustar pago | sí | sí | no | no |
  | Corregir el resultado | sí | no | no | no |
  | Ver evidencia | sí | sí | sí | sí |
  | Devolver a gestión | no | no | en curso o rechazado (R51) | no |
- **R27** [S3] — Las tarjetas DEBEN mostrar, en formato cascada (R15): «Recibió el mensajero» =
  `pagos` por método sin los de 0 y total `montoRecibido`; «Se le cobra a la tienda» = cada concepto
  no nulo con IVA y total `ingresoEmpresa.total`; «Se le paga al mensajero» = `pagoMensajero` y, si
  hubo ajuste, la marca «Ajustado», el motivo y quién y cuándo del último ajuste; «Fulfillment» =
  `fulfillment` e `ivaFulfillment`. SI una tarjeta no tiene dato, ENTONCES DEBE decir «Sin dato»,
  no ₡0.
- **R28** [S3] — CUANDO el usuario pulsa «Ver cómo se calculó», la fila DEBE desplegar una tarjeta
  por concepto cobrado, con su base y su IVA tal como llegan, y la nota de que son las tarifas
  congeladas al crear el cierre. Pulsar otra vez DEBE plegarlo.
- **R29** [S3] — SI la gestión es del modelo viejo, ENTONCES «Ver cómo se calculó» DEBE mostrar la
  tarifa congelada aplicada (columna GAM, no GAM o pacto especial) y los rótulos del modelo viejo,
  como hoy en el desglose. SI es del modelo nuevo, ENTONCES DEBE mostrar la tarifa del concepto de
  R64.
- **R30** [S3] — El fulfillment de la fila DEBE mostrarse solo cuando quien mira es la central y
  `fulfillment` no es nulo, en el detalle de mensajero y en el de bodega.
- **R31** [S6] — MIENTRAS el detalle sea de tipo bodega, sus filas DEBEN usar la audiencia «solo
  lectura»: ninguna acción de corrección ni de ajuste; las evidencias sí.

### C. Cola de cierres (un componente)

- **R32** [S4] — El sistema DEBE pintar toda lista de cierres del módulo con un único componente de
  cola, parametrizado por `tipo` y `rol`, con: título «Cierres del día» y descripción por rol;
  pestañas con conteo; la barra existente (`BuscadorFiltros` + `DescargarDatasetButton`) con los
  filtros de hoy por rol; tarjetas de cifras cuando el rol las tiene; una tabla con una fila por
  cierre y sus acciones; y un pie.
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

### D. Detalle de mensajero en `/cierres-admin`

- **R38** [S2] — CUANDO la central o la satélite abre un cierre de mensajero (cola, resueltos o
  enlace `?cierre=`), el sistema DEBE abrir el detalle único con `tipo` mensajero y la audiencia
  del actor, en lugar del modal actual.
- **R39** [S2] — Los diálogos de decisión que lanza el pie (rechazar, confirmar paquetes,
  indemnizar, destrabar, registrar pago tras aprobar) DEBEN seguir funcionando igual, con el
  `Modal` existente.

### E. Bodega

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
- **R44** [S7] — La cola de bodega de la central DEBE tener las pestañas «Por conciliar (n)» y
  «Conciliados (n)». «Por conciliar» DEBE incluir los pendientes de conciliar y los recibidos
  incompletos; «Conciliados», solo los recibidos completos. Columnas: Folio, Bodega, Solicitó,
  Solicitado, Cierres, Debe llegar, Recibido, Falta, Estado. Acciones: «Ver / conciliar»
  (pendiente), «Ver / corregir» (incompleto), «Ver» (recibido).
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
- **R49** [S9] — La pestaña «Solicitados» de la satélite DEBE mostrar las tarjetas «Por llegar a la
  central», «Recibido por la central (30 días)» y «Falta por recibir» (R68), y la tabla con Folio,
  Solicitado, Cierres, Recaudado, Debe llegar, Recibido, Falta, Estado y «Ver».
- **R50** [S9] — CUANDO la satélite pulsa «Ver» en uno de sus cierres de bodega, el sistema DEBE
  abrir el detalle único con `tipo` bodega, audiencia satélite y modo solo lectura. SI el cierre de
  bodega no es de su zona, ENTONCES el servidor DEBE responder `forbidden` y la pantalla no DEBE
  mostrar nada de él.
- **R51** [S9] — Con audiencia satélite, el detalle de bodega NO DEBE mostrar fulfillment ni
  acciones de conciliación.
- **R52** [S9] — La lista «Solicitados» DEBE respetar el filtro de fecha de solicitud, igual que su
  descarga.

- **R78** [S17] — `/wallet/satelites/[zonaId]` DEBE ofrecer las pestañas «Conciliación» y
  «Movimientos», abriendo en «Conciliación». CUANDO la central despliega una consolidación, la fila
  DEBE mostrar dos tarjetas en formato cascada («Lo que va a la central»: métodos, recaudado,
  − pago a mensajeros, − gana la bodega satélite, = debe llegar a la central; «Conciliación»: debe
  llegar, − recibido, = falta por recibir) y el enlace «Ver el cierre de bodega completo», que abre
  el detalle único de ese cierre de bodega. Las cifras, acciones y avisos de hoy no cambian.

### F. Diálogos (una caja)

- **R53** [S5] — Todo diálogo del módulo DEBE montarse sobre el `Modal` existente, con título,
  descripción, cuerpo y los botones al pie. Los diálogos son: rechazar, confirmar paquetes,
  indemnizar, destrabar, ajustar pago, registrar pago, anular pago, corregir métodos, corregir el
  resultado, evidencia, solicitar cierre de bodega, marcar recibido, corregir recibido, desmarcar,
  solicitar cierre del día, enviar cierre vencido, enviar cierre rechazado y devolver a gestión.
- **R54** [S5] — El visor de evidencia DEBE ser un solo diálogo con «Anterior», «Siguiente» y
  «foto i de n» en la descripción. La fila DEBE ofrecer un solo botón «Ver evidencia (n)» (o «Ver
  evidencia» con una foto) en lugar de un botón por foto.
- **R55** [S5] — El diálogo «Solicitar cierre del día» DEBE mostrar el resumen Gestiones, Recaudado
  y Tu ganancia, con las cifras de la página.
- **R56** [S5] — Todos los textos del módulo (pantallas, diálogos, toasts, avisos y mensajes del
  servidor que el módulo muestra) DEBEN usar el trato «tú» y llevar sus tildes. Ningún texto del
  módulo DEBE contener voseo («Indicá», «tenés», «podés», «resolvé»…).
- **R57** [S5] — SI se intenta registrar un pago a un mensajero sin saldo, ENTONCES el diálogo DEBE
  decir que el mensajero no tiene ganancia pendiente, sin mencionar una tienda.

### G. Mensajero (`/cierre-dia`)

- **R58** [S10] — La sección «Incidente» de `/cierre-dia` y su descarga DEBEN incluir la columna
  «Ganancia» con el `pagoMensajero` de la gestión. La indemnización DEBE seguir sin mostrarse.
- **R59** [S10] — CUANDO el mensajero pulsa «Ver» en uno de sus cierres, el sistema DEBE abrir el
  detalle único con audiencia mensajero, modo solo lectura y marco modal, con la nota de que los
  montos son los congelados al solicitar.
- **R60** [S10; tarjetas en S14] — «Cierres solicitados» de `/cierre-dia` DEBE ser la cola única con rol mensajero:
  tarjetas «Ganancia pendiente de pago» y «Ganancia pagada este mes» (R69); columnas Folio,
  Solicitado, Destino, Estado, Recaudado, Ganancia, Pago («Pendiente de pago», «Liquidado», el
  motivo en un rechazado, «—»); acción «Ver»; paginación de hoy.
- **R61** [S11] — `/cierre-dia` DEBE pintar el cierre en curso del mensajero con el detalle único,
  audiencia mensajero, modo en curso y marco página: gestiones con «Devolver a gestión» y el pie
  «Solicitar cierre».
- **R62** [S11] — MIENTRAS el mensajero tenga un cierre rechazado, `/cierre-dia` DEBE pintarlo en
  modo rechazado: pestaña «Corregir» con la explicación de hoy y «Órdenes por volver a gestionar»
  (con «Ya la volviste a gestionar» / «Falta volver a gestionarla» e «Ir a Entregas»), y el pie
  «Solicitar aprobación del cierre rechazado».
- **R63** [S11] — MIENTRAS el mensajero tenga un cierre vencido, `/cierre-dia` DEBE pintarlo en
  modo vencido con el pie «Solicitar aprobación del cierre vencido».

### H. Cifras nuevas del servidor (nota p1)

Ninguna cambia dinero: todas se derivan en el servidor de datos que ya existen y viajan como string
de escala 2 (o entero, en porcentajes y conteos). La pantalla solo las pinta.

- **R64** [S12] — CUANDO la gestión es del modelo nuevo, el servidor DEBE emitir, por concepto
  cobrado a la tienda, su tarifa congelada (`cierre_detail_concepto`: modo, valor, % de IVA, nivel y
  el grupo o la zona de su `tarifa_valor`), y la fila DEBE pintarla en «Ver cómo se calculó».
- **R65** [S12] — El servidor DEBE emitir, por gestión: el IVA incluido en el cobro a la tienda
  (`ivaFlete` + `ivaComisionCod` + `ivaFleteDevolucion`), el total del fulfillment con IVA y la fecha
  en que se cargó al saldo de la tienda, y la fila DEBE pintarlos («de eso, IVA», «Se cobró», «Se
  cargó al saldo de la tienda el …»).
- **R66** [S12] — El servidor DEBE emitir, por gestión con pago congelado, el pago «por tarifa»
  (`gestion_pago_congelado.importe` del mensajero, con su modo y nivel) y, si hubo ajuste, la
  diferencia con su signo hasta `pagoMensajero`; la tarjeta «Se le paga al mensajero» DEBE pintarlos
  en cascada. Con audiencia central o satélite, `tarifaFaltante` DEBE llegar con su valor real.
- **R67** [S8] — El servidor DEBE emitir «Debe llegar a la central» del conjunto a consolidar y de
  cada cierre del día a consolidar, con la misma derivación que `paraLaCentral`.
- **R68** [S9] — El servidor DEBE emitir para la zona de la satélite: «Por llegar a la central»
  (suma de `paraLaCentral` de sus cierres de bodega sin conciliar), «Recibido por la central (30
  días)» (suma de `montoRecibido` conciliado en los últimos 30 días calendario de Costa Rica) y
  «Falta por recibir» (suma de `faltaPorRecibir` positivo de los recibidos incompletos), con sus
  conteos. Estas tarjetas NO DEBEN depender del filtro de fecha.
- **R69** [S14] — El servidor DEBE emitir para el mensajero: «Ganancia pendiente de pago» (suma de
  `pendientePagoMensajero` de sus cierres aprobados, con el número de cierres con pendiente > 0) y
  «Ganancia pagada este mes» (suma de sus pagos vigentes con fecha del pago en el mes en curso de
  Costa Rica, con el número de pagos).
- **R70** [S13] — El servidor DEBE emitir el reparto de lo recaudado en porcentajes enteros que
  sumen 100, y la barra de «Dinero» DEBE dibujarse con ellos. SI lo recaudado es cero o alguna parte
  es negativa, ENTONCES el servidor DEBE emitir `null` y la pantalla DEBE pintar solo la leyenda con
  los importes. La cola de mensajeros DEBE además mostrar en Señales, por cierre, incidentes sin
  indemnizar, pagos ajustados y paquetes que vuelven, con conteos emitidos por el servidor.

### I. Dinero intacto y verificación

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S2, S3, S6, S9, S10, S11, S12] — Para un mismo cierre, cada cifra que ve cada audiencia
  (central, satélite, mensajero) DEBE ser igual al céntimo al importe escrito a mano en el escenario
  E2E, con un cierre del modelo viejo y otro del modelo nuevo.

### J. Excel

- **R73** [S15] — SI todas las gestiones de los cierres de una descarga son del modelo viejo,
  ENTONCES el archivo DEBE salir con el formato actual, sin cambiar columnas, títulos ni claves.
- **R74** [S15] — SI todas son del modelo nuevo, ENTONCES el archivo DEBE salir con el documento
  nuevo (`design.md > Excel`).
- **R75** [S15] — SI una descarga mezcla cierres de los dos modelos, ENTONCES el archivo DEBE llevar
  las hojas del documento nuevo con los cierres del modelo nuevo y las hojas del formato actual con
  los del viejo, sin repetir ningún cierre.

### K. Retiro

- **R76** [S16] — Cuando todas las rebanadas estén en `dev`, ningún archivo de `app/` DEBE importar
  los componentes sustituidos (`design.md > Qué sustituye cada componente`), y esos componentes DEBEN
  estar borrados.

## Rebanadas

Detalle de archivos, tamaño y tareas en `tasks.md`; reparto y dependencias, aquí. Cada una es una
ficha con su PR, su gate y su E2E. SLT-95 se queda con S1 y su `description` se acota a ella.

| # | Ficha | Zona | R | Archivos | Depende de |
|---|---|---|---|---|---|
| S1 | **SLT-95** «Rediseño del detalle de cierre (mensajero y bodega)» → acotar a «Detalle de cierre único: componente base» | frontend | R1-R16, R20, R71 | ~13 | — |
| S2 | nueva «Detalle de cierre único en /cierres-admin (mensajeros)» | frontend | R17-R19, R21, R38, R39, R77 | ~32 | S1 |
| S3 | nueva «Fila de gestión única y lista con filtros» | frontend | R22-R30 | ~16 | S2 |
| S4 | nueva «Cola de cierres única: mensajeros (central y satélite)» | frontend | R32-R37 | ~22 | S2 |
| S5 | nueva «Diálogos del módulo de cierres y trato tú» | fullstack | R53-R57 | ~30 | S3, S4 |
| S6 | nueva «Detalle de cierre de bodega en el detalle único (central)» | frontend | R31, R40-R43 | ~20 | S3 |
| S7 | nueva «Cola de bodega de la central: Por conciliar / Conciliados» | fullstack | R44 | ~14 | S4, S6 |
| S8 | nueva «Bodega satélite: A consolidar con la cola única» | fullstack | R45-R48, R67 | ~22 | S4, S5 |
| S9 | nueva «Bodega satélite: Solicitados y su cierre de bodega en lectura» | fullstack | R49-R52, R68 | ~20 | S6, S8 |
| S10 | nueva «/cierre-dia: detalle y cola únicos para el mensajero» | frontend | R58-R60 | ~18 | S3, S4 |
| S11 | nueva «/cierre-dia: el cierre de hoy, rechazado o vencido como página» | frontend | R61-R63 | ~16 | S10 |
| S12 | nueva «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» | fullstack | R64-R66 | ~18 | S3 |
| S13 | nueva «Cifras del servidor: reparto en % y señales de la cola» | fullstack | R70 | ~14 | S4 |
| S14 | nueva «Cifras del servidor: ganancia pendiente y pagada del mensajero» | fullstack | R69 | ~10 | S10 |
| S15 | nueva «Excel del modelo nuevo de cierres» | fullstack | R73-R75 | ~14 | S12 |
| S16 | nueva (chore) «Retirar los componentes de cierre sustituidos» | frontend | R76 | ~25 | S1-S15, S17 |
| S17 | nueva «Estado de cuenta de la satélite: conciliación en pestaña» | frontend | R78 | ~10 | S6 |

Las rebanadas sin dependencia entre sí pueden ir en paralelo (S3 ‖ S4; S6 ‖ S10 ‖ S12 ‖ S13), pero
varias tocan `CierresAdminModule.tsx` o `CierresBodegaAdminModule.tsx`: el candado de archivos
(`docs/equipo.md`) decide si dos van a la vez.

## Preguntas abiertas

- **PA1: «Recibido por la central (30 días)» frente al filtro.** R68 deja las tres tarjetas de
  «Solicitados» fuera del filtro de fecha (son estado), mientras la lista lo respeta (R52). ¿De
  acuerdo, o quieres que las tarjetas sigan al filtro?
- **PA2: varios cierres rechazados a la vez en `/cierre-dia`.** Hoy la página muestra un panel de
  corrección por cada cierre rechazado («1 de 2»). El canvas solo dibuja uno. Propuesta: la página
  pinta el que pide acción primero (vencido, luego el rechazado más antiguo, luego el de hoy) y los
  demás se abren desde «Cierres solicitados» en modo rechazado. ¿De acuerdo?
- **PA3: documento Excel del modelo nuevo.** Propuesta de hojas y columnas en `design.md > Excel`.
  Necesita tu aprobación antes de S15 (D14). Hoy no tendría datos en prod (D19).
