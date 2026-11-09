# SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)» — requirements

> Ruta: completa (complexity `high`, pantalla de dinero). Zona propuesta: `frontend` (ver
> `design.md > Zona`). Escrito por spec_author el 2026-11-09 desde `progress/features/SLT-95.md`
> y el canvas aprobado copiado en `canvas/project/` (n1, n2, `Main.dc.html`, `Fila2.dc.html`).
> El canvas es una maqueta con datos inventados: **sus cifras y textos de ejemplo no son
> requisitos**; los nombres de las cifras, la estructura y las reglas sí.

## Alcance

Un solo componente de detalle de cierre, con `tipo` `mensajero` o `bodega`, que sustituye a los
dos modales de `/cierres-admin`:

- el «Detalle del cierre» del mensajero, que abren «Ver / decidir» (cola) y «Ver el cierre…»
  (resueltos);
- el «Detalle del cierre de bodega», que abren «Ver / decidir» (cola) y «Ver el cierre de bodega
  resuelto…» (resueltos).

Forma común: cabecera con identidad y estado, franja «Por revisar», 4 cifras (métodos de pago en
0 ocultos), pestañas por tipo, un solo scroll y acciones fijas al pie. Fila de gestión desplegada
según la opción 2 del canvas. «Le queda a la empresa» es la única cifra de ganancia: se quita
«Debe».

Incluye además:
- el pago al mensajero en la sección «Incidente» de `/cierre-dia` y en su Excel;
- los títulos del Excel según el modelo de tarifas;
- el fulfillment de la fila según la audiencia también en el detalle de bodega.

**Sin cambios de dinero.** Ningún cálculo, snapshot, asiento ni Server Action de escritura
cambia. Lo único que cambia es la presentación y de qué campo del servidor sale cada cifra.

## Lo que NO entra

- `/cierre-dia` del mensajero (su tabla en vivo y su comprobante `CierreFacturaDetalle` con
  audiencia `mensajero`), salvo la columna de pago del incidente y su Excel (R28-R29).
- `/wallet/satelites` (`ConciliacionSatelite`): su fila desplegada con la cuenta de la
  consolidación queda como está. El detalle de bodega reutiliza sus mismas piezas
  (`ConciliacionAcciones`, `estadoConciliacionDe`), no la pantalla.
- La cola y los resueltos de `/cierres-admin` (listas, comprobantes compactos, filtros,
  descargas de resumen): solo cambia el modal que abren.
- Los diálogos que el detalle ya abre: rechazo con motivo, confirmación física, indemnización,
  corregir pagos, corregir resultado, ajustar pago, registrar y anular pago, marcar recibido,
  corregir y desmarcar. Se montan igual; solo cambia desde dónde se pulsan.
- Toda cifra que hoy no llega del servidor (PA2): no se inventa ni se calcula en el cliente.

## Decisiones cerradas (no reabrir)

| # | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-08 · Carlos | Opción A: UN componente (tipo `mensajero`/`bodega`) para «Ver detalle» y «Ver / decidir» del mensajero y «Ver / decidir» de bodega. |
| D2 | 2026-11-08 · Carlos | Fila desplegada opción 2: 4 tarjetas en 2x2 (Recibió el mensajero / Se le cobra a la tienda / Se le paga al mensajero / Fulfillment). «Ver cómo se calculó» = una tarjeta por concepto. |
| D3 | 2026-11-08 · Carlos | «Le queda a la empresa» es la única cifra de ganancia; se quita «Debe». |
| D4 | 2026-11-08 · Carlos | Los métodos de pago en 0 no se muestran. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D6 | 2026-11-08 · canvas n2 | Reglas: 1) identidad y estado arriba; 2) cada cifra una vez, con un nombre; 3) lo que pide atención, primero; 4) acciones fijas al pie; 5) un solo scroll; 6) métodos de pago en 0 ocultos. |
| D7 | 2026-11-08 · canvas n1 | Lo que cambia con el tipo: cifra 2 («Se le paga hoy a la tienda» / «Debe llegar a la central»); estados (Solicitado/Aprobado/Rechazado/Vencido / Pendiente/Recibido/Incompleto); pestañas (+ «Rechazados por la tienda» y «Pago al mensajero» / + «Mensajeros» y «Conciliación»); en Dinero, bodega suma «Lo que va a la central»; en Gestiones, bodega añade la columna Mensajero y es solo lectura; pie (Aprobar/Rechazar / Marcar recibido/Corregir/Desmarcar). |
| D8 | 2026-11-08 · tarjeta | Incluye: pago al mensajero en Incidente de `/cierre-dia` y su Excel; títulos de Excel según modelo; `verFulfillment` por audiencia en bodega. |

Cobertura: D1 → R1; D2 → R22, R23; D3 → R5, R8; D4 → R6, R22; D5 → R26, R27; D6 → R2, R4,
R8, R10, R11, R6; D7 → R2, R5, R9, R11, R13, R16; D8 → R25, R28, R29, R30.

## Requisitos (EARS)

Cada requisito lleva entre corchetes la rebanada en la que entraría si se acepta el corte de PA1
(C = `/cierre-dia` y Excel; A1 = componente y mensajero; A2 = lista y fila desplegada;
B = bodega).

### Componente común

- **R1** [A1, B] — CUANDO el usuario pulsa «Ver / decidir» o «Ver el cierre…» de un cierre de
  mensajero, o «Ver / decidir» o «Ver el cierre de bodega resuelto…» de un cierre de bodega, en
  `/cierres-admin`, el sistema DEBE abrir el mismo componente de detalle, con el tipo
  `mensajero` o `bodega` según el cierre.
- **R2** [A1, B] — El detalle DEBE mostrar arriba, antes de cualquier cifra, la identidad del
  cierre y su estado:
  - mensajero: nombre del mensajero, destino, folio, fecha de solicitud y, si la hay, la de
    resolución; estado Solicitado, Aprobado, Rechazado o Vencido;
  - bodega: zona, quién lo solicitó, número de mensajeros, folio y fechas; estado de
    conciliación Pendiente de conciliar, Recibido o Recibido incompleto.

  El estado DEBE salir de la misma función que pinta hoy ese estado en la lista
  (`EstadoCierreBadge`, `estadoConciliacionDe`).
- **R3** [A1] — SI el cierre de mensajero retiene reprogramadas (`reprogramadasRetenidasHoy`
  > 0), ENTONCES la cabecera DEBE mostrar la marca de retención con la cifra del servidor.
- **R4** [A1, B] — MIENTRAS el cierre esté pendiente de decisión (mensajero `solicitado`;
  bodega con conciliación pendiente o incompleta), SI hay al menos un asunto que atender,
  ENTONCES el detalle DEBE mostrar, entre la cabecera y las cifras, una franja «Por revisar» con
  cada asunto y su conteo. Asuntos:
  - mensajero: incidentes sin indemnizar; rechazados por la tienda; gestiones con pago ajustado;
    paquetes que vuelven a bodega (el mismo conjunto que pide la confirmación física);
  - bodega: gestiones con pago ajustado; dinero sin marcar como recibido; dinero recibido
    incompleto.

  SI no hay ningún asunto, o el cierre ya está resuelto, ENTONCES la franja NO DEBE pintarse.
- **R5** [A1, B] — El detalle DEBE mostrar exactamente cuatro cifras, en este orden, cada una
  con el string del servidor pintado con el formateador compartido:

  | # | Mensajero | Bodega |
  |---|---|---|
  | 1 | «Recaudado» = `cierre.totales.general` | «Recaudado» = `cierre.totales.general` |
  | 2 | «Se le paga hoy a la tienda» = `pagoTienda` | «Debe llegar a la central» = `paraLaCentral` |
  | 3 | «Pago al mensajero» = `cierre.totalPagoMensajero` | «Pago a mensajeros» = `cierre.totalPagoMensajero` |
  | 4 | «Le queda a la empresa» = `netoEmpresa` | «Le queda a la empresa» = `netoEmpresa` |

  Un valor negativo DEBE pintarse con su signo, sin recortarlo a cero.
- **R6** [A1, B] — Bajo «Recaudado», el detalle DEBE listar efectivo, SINPE y transferencia del
  cierre. SI un método vale cero, ENTONCES NO DEBE pintarse.
- **R7** [A1, B] — Cada cifra DEBE llevar su línea de contexto, hecha solo de conteos y de
  strings del servidor:
  - cifra 2 del mensajero: número de tiendas y «ganan en total» `ganaLaTienda`;
  - cifra 2 de bodega: el estado de conciliación;
  - cifra 3: número de gestiones y cuántas tienen el pago ajustado (mensajero), o número de
    mensajeros y gestiones ajustadas (bodega);
  - cifra 4: nota fija de qué se restó.
- **R8** [A1, B] — El detalle NO DEBE pintar el renglón «Debe», ni la `ganancia` del contrato,
  ni ningún otro rótulo de ganancia distinto de «Le queda a la empresa». Dentro de una misma
  pestaña, una misma cifra del servidor NO DEBE aparecer con dos rótulos distintos.
- **R9** [A1, B] — El detalle DEBE ofrecer pestañas según el tipo, y abrir en «Dinero»:
  - mensajero: «Dinero»; «Gestiones» con su conteo; «Rechazados por la tienda» con su conteo,
    solo si hay al menos uno (PA4); «Pago al mensajero», solo cuando hoy se ofrece el pago en el
    detalle (cierre aprobado y permiso de pagar);
  - bodega: «Dinero»; «Gestiones» con su conteo; «Mensajeros» con su conteo; «Conciliación».
- **R10** [A1, B] — MIENTRAS el detalle esté abierto, el cuerpo de la pestaña activa DEBE ser
  la única región con desplazamiento. Cabecera, «Por revisar», cifras, pestañas y pie DEBEN
  seguir visibles al desplazar el cuerpo.
- **R11** [A1, B] — El pie DEBE quedar fijo y contener las acciones del cierre y una línea de
  contexto:
  - mensajero `solicitado`: «Rechazar» y «Aprobar», que lanzan los mismos flujos de hoy (motivo
    obligatorio; confirmación física; indemnización);
  - mensajero en cualquier otro estado: solo «Cerrar»;
  - bodega: las acciones de conciliación que ya decide `ConciliacionAcciones` para ese estado
    (Marcar recibido / Corregir / Desmarcar), solo con permiso de conciliar, y «Cerrar».

### Dinero

- **R12** [A1] — En «Dinero» del mensajero, el detalle DEBE mostrar, en este orden:
  1. el reparto de lo recaudado en «A la tienda hoy» = `pagoTienda` y «Se lo cobra la empresa»
     = `cobradoSobreRecaudado`;
  2. la cascada «Lo que se le factura a la tienda»: `fleteConIva`, `comisionConIva`, subtotal
     «Sale de lo recaudado» = `cobradoSobreRecaudado`, flete de no entrega
     (`fleteDevolucionConIva`, rotulado según el modelo como hoy) y total facturado =
     `totalesIngreso.total`;
  3. la cascada «De lo facturado, le queda a la empresa»: total facturado, − `ivaFacturado`,
     − `totalPagoMensajero`, − `totalIngresoBodegaRechazos` (rotulado según el modelo como hoy),
     = `netoEmpresa`;
  4. SI `partesPorTienda` tiene dos o más tiendas, ENTONCES la tabla «Por tienda» con
     recaudado, «Se le paga hoy» y «Gana en total» de cada una, en el orden del servidor.
- **R13** [B] — En «Dinero» de bodega, el detalle DEBE mostrar:
  1. el reparto de lo recaudado en «A la central» = `paraLaCentral`, «A los mensajeros» =
     `cierre.totalPagoMensajero` y «A la bodega satélite» = `cierre.totalIngresoBodegaRechazos`;
  2. la cascada «Lo que va a la central», con las mismas líneas que hoy (`lineasCascadaCentral`);
  3. «Lo que se le factura a la tienda» y «De lo facturado, le queda a la empresa», con
     − pago a mensajeros y − gana la bodega satélite;
  4. SI hay dos o más tiendas, ENTONCES «Por tienda» del agregado (PA3).

### Gestiones

- **R14** [A2, B] — En «Gestiones», el detalle DEBE listar todas las gestiones del cierre (en
  bodega, las de todos sus cierres del día) con filtros por resultado. Cada filtro lleva su
  conteo, y hay además «Todas» y «Con señales». Columnas: guía, destinatario y tienda, resultado,
  recibido (`montoRecibido`), cobro a la tienda (`ingresoEmpresa.total`), pago al mensajero
  (`pagoMensajero`), señales. En bodega va además la columna Mensajero.
- **R15** [A2, B] — Las señales de una gestión DEBEN derivarse solo de campos que ya llegan:
  - «Pago ajustado»: `ajustesPago` no vacío;
  - incidente sin indemnizar: `resultado = incidente` e `indemnizacion = null`;
  - vuelve a bodega: reprogramado o devolución a origen;
  - rechazo automático: `esRechazoSla`;
  - sin tarifa congelada: `ingresoEmpresa` sin tarifa.

  Una gestión sin ninguna DEBE mostrar la celda vacía.
- **R16** [B] — MIENTRAS el detalle sea de tipo `bodega`, ninguna fila DEBE ofrecer acciones
  de corrección ni de ajuste. Las evidencias sí se pueden ver.
- **R17** [A1] — El detalle de mensajero DEBE seguir mostrando la sección de órdenes sin
  gestionar (264) y su marca de registro, en «Gestiones» y con las props del servidor.
- **R18** [A1] — «Rechazados por la tienda» DEBE listar los `rechazosDeTienda` del servidor,
  con guía, destinatario, motivo, tienda y fecha, y la nota de que no suman al pago del
  mensajero.
- **R19** [A1] — «Pago al mensajero» DEBE montar la sección de pago de hoy (pendiente,
  registrar y anular), con el mismo permiso y la misma relectura tras registrar o anular.
- **R20** [B] — «Mensajeros» DEBE mostrar una fila por cierre del día incluido, con mensajero,
  número de gestiones, recaudado (`totales.general`), pago (`totalPagoMensajero`), a la central
  (`paraLaCentral`), señales (`gestionesAjustadas`) y un enlace «Ver su cierre» a
  `hrefDetalleCierre(cierreDiaId)` (PA7).
- **R21** [B] — «Conciliación» DEBE mostrar declarado (`paraLaCentral`), recibido (`—` sin
  marca, nunca ₡0), falta por recibir (`faltaPorRecibir`) y quién marcó y cuándo («Aún nadie»
  sin marca).

### Fila desplegada

- **R22** [A2, B] — CUANDO el usuario despliega una gestión, el detalle DEBE mostrar:
  - los datos de la orden (remisión, producto, dirección);
  - cuatro tarjetas en 2x2:
    - «Recibió el mensajero»: `montoRecibido` y sus `pagos` por método, sin los métodos en 0;
    - «Se le cobra a la tienda»: `ingresoEmpresa.total` y cada concepto no nulo con su IVA;
    - «Se le paga al mensajero»: `pagoMensajero`. Si hubo ajuste: la marca «Ajustado», el pago
      anterior, el motivo y quién y cuándo del último ajuste;
    - «Fulfillment»: `fulfillment` e `ivaFulfillment`, solo según R25.

  SI una tarjeta no tiene dato (sin `ingresoEmpresa`, pago `null`), ENTONCES DEBE decir «Sin
  dato», no ₡0.
- **R23** [A2, B] — CUANDO el usuario pulsa «Ver cómo se calculó» en «Se le cobra a la tienda»,
  el detalle DEBE desplegar una tarjeta por concepto cobrado (flete, comisión, flete de no
  entrega), con su base y su IVA tal como llegan. En el modelo viejo, además, la tarifa
  congelada aplicada (columna GAM, no GAM o pacto especial), como hoy en el desglose. Debajo, la
  nota de que son las tarifas congeladas al crear el cierre. Pulsar otra vez DEBE plegarlo.
- **R24** [A2] — La fila del mensajero DEBE ofrecer «Corregir métodos de pago», «Ajustar pago»,
  «Corregir el resultado» y las evidencias SOLO cuando hoy se ofrecen: mismo permiso, mismo
  estado del cierre y mismo callback.
- **R25** [A2, B] — El fulfillment de la fila DEBE mostrarse solo con audiencia `admin` y
  `fulfillment` no nulo, en el detalle de mensajero y en el de bodega.

### Dinero intacto

- **R26** [A1, A2, B] — Los archivos del detalle NO DEBEN convertir un importe a número ni
  sumar, restar, redondear o reordenar importes en el cliente. La feature NO DEBE modificar
  servicios, repositorios, Server Actions, `db/` ni migraciones.
- **R27** [A1, B] — Para un mismo cierre, cada cifra del detalle nuevo DEBE ser igual al
  céntimo al campo del servidor que la alimenta, y al importe que el escenario E2E espera
  escrito como literal.

### `/cierre-dia` y Excel

- **R28** [C] — La sección «Incidente» de `/cierre-dia` DEBE mostrar la columna de pago al
  mensajero con el `pagoMensajero` que el servidor devuelve para esa gestión. La indemnización
  DEBE seguir sin mostrarse.
- **R29** [C] — La descarga de la sección «Incidente» de `/cierre-dia` DEBE incluir la columna
  de pago al mensajero con el mismo valor que la pantalla.
- **R30** [C] — CUANDO todas las gestiones de un archivo «Detalle» de cierres son del modelo
  nuevo, la columna de flete de no entrega DEBE titularse como en la pantalla del modelo nuevo
  (`FLETE_NO_ENTREGADAS_CON_IVA_LABEL`). CUANDO todas son del viejo, DEBE conservar el título de
  hoy (`FLETE_DEV_CON_IVA_LABEL`). La clave de la columna NO DEBE cambiar. La columna de
  ingreso de bodega ya lleva un título neutro («Ingreso bodega») y no cambia. El caso mixto y el
  alcance exacto de archivos quedan en PA6.

### Accesibilidad

- **R31** [A1, B] — El diálogo DEBE conservar en su nombre accesible «Detalle del cierre» o
  «Detalle del cierre de bodega», además de la identidad. Las pestañas DEBEN exponerse como
  `tablist`/`tab`/`tabpanel`, y cada cifra y cada región de dinero DEBE tener un nombre
  accesible único.

## Preguntas abiertas

- **PA1 (bloqueante): no cabe en un PR.** `## Archivos esperados` de `tasks.md` lista 58 rutas
  (código, tests unitarios, de componentes y E2E), frente al límite de 40 archivos y 1000 líneas
  (`docs/gate.md > Tamaño del PR`; el aviso salta al 80 %, 32 archivos). Corte propuesto en
  rebanadas verticales que se mergean solas:
  - **C — ficha nueva, va primero (independiente).** Pago del incidente en `/cierre-dia` y su
    Excel, y títulos de Excel según modelo (R28-R30). 10 archivos, frontend.
  - **A1 — SLT-95 (la ficha original se queda con esta).** Componente común y detalle del
    mensajero (R1-R12, R17-R19, R26, R27, R31). En «Gestiones» se monta la lista de hoy
    (`GestionesPorResultado`), sin tocarla. Quita «Debe». 33 archivos, más de la mitad tests
    existentes que montan el modal: queda en el aviso del 80 %.
  - **A2 — ficha nueva, `depends_on` A1.** Lista con filtros y señales, y fila desplegada
    opción 2 en el mensajero (R14, R15, R22-R25). 4 archivos nuevos más los tests de A1 que
    vuelva a tocar.
  - **B — ficha nueva, `depends_on` A2.** Detalle de bodega en el mismo componente (R13, R16,
    R20, R21 y las partes [B]). 11 archivos.
  - **D — opcional, fullstack, solo si Carlos lo quiere (PA2).**

  A1 superará casi seguro las 1000 líneas: un componente nuevo y ~20 tests adaptados. Hay dos
  salidas:
  - aceptar `tamano-pr-aceptado` para A1;
  - partirla otra vez: A1a = caparazón, cifras y «Dinero» detrás de una bandera sin enlace; A1b
    = cambio del modal y adaptación de tests y E2E.

  ¿Aceptas el corte, y cuál de las dos salidas para A1?
- **PA2: cifras del canvas que hoy NO llegan del servidor.** No se inventan ni se calculan en el
  cliente. Por defecto se omiten en A1, A2 y B:
  - a) los porcentajes y anchos de la barra de reparto;
  - b) «IVA incluido» sumado en la tarjeta de cobro (llegan `ivaFlete`, `ivaComisionCod` y
    `ivaFleteDevolucion` por separado);
  - c) el total del fulfillment con IVA (llegan los dos sumandos);
  - d) en el modelo nuevo, la tarifa de cada concepto (nivel, grupo, zona, monto fijo o %) y la
    del pago al mensajero («Precio propio del mensajero»). Están congeladas en
    `cierre_detail_concepto` y `gestion_pago_congelado`, pero no viajan al detalle;
  - e) la fecha en que el fulfillment se cargó al saldo de la tienda;
  - f) «Sin tarifa de pago» en el detalle de admin: `tarifaFaltante` llega siempre `false`.

  ¿Se omiten, o se abre la rebanada D (fullstack, lectura de datos congelados y derivados en el
  servidor, sin cambio de dinero)?
- **PA3: bodega sin «Por tienda» ni cascadas por mensajero en el canvas.** Hoy existen: 396
  R19/R20 y 393 R15. Propuesta:
  - conservar «Por tienda» del agregado en «Dinero» (umbral de dos tiendas);
  - sustituir las cascadas por mensajero por la pestaña «Mensajeros» y su «Ver su cierre».

  ¿De acuerdo?
- **PA4:** «Rechazados por la tienda» sin rechazos: ¿se oculta la pestaña? Por defecto sí.
- **PA5: impresión (223).** Con pestañas, Ctrl+P sobre el detalle del admin imprime solo la
  pestaña activa. La hoja del mensajero en `/cierre-dia` no cambia. ¿Aceptado?
- **PA6: títulos de Excel según modelo.**
  - a) ¿Qué archivos? Propuesta: el «Detalle» fundido de cierres de mensajero y de bodega, que
    trae `tarifaModelo` por fila. Los resúmenes por cierre no traen el modelo.
  - b) Un archivo mixto (gestiones de los dos modelos en el rango): ¿rótulo neutro, los dos
    rótulos, o el del modelo vigente de la empresa?
- **PA7: «Ver su cierre» en bodega** abre `/cierres-admin?cierre=<cierreDiaId>`. Funciona si el
  alcance del maestro en `verCierreDetalle` incluye los cierres con destino satélite (T0.2 lo
  comprueba). Si no, ¿se omite el enlace?
- **PA8: código muerto.** Al dejar de montarse en `/cierres-admin`, las ramas de audiencia
  `admin` de `CierreFacturaDetalle` (Liquidación, «Debe», tarjetas de cabecera) y
  `CascadasCierreMensajero` solo las usarían sus propios tests. `/cierre-dia` sigue usando
  `CierreFacturaDetalle` con audiencia `mensajero`. Propuesta: retirarlas en un `chore` aparte,
  para no inflar A1. ¿De acuerdo?
