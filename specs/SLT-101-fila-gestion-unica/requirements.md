# SLT-101 «Fila de gestión única y lista con filtros» — requirements

> Ruta: completa (`ruta` vacía; pantalla de dinero). Zona: **frontend** (todo dato ya llega; ver
> PA1). Escrito por spec_author el 2026-11-09.
>
> Rebanada **S3** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2, R marcados `[S3]`; `design.md >
> 3. Fila de una gestión`; `tasks.md > Plan de las demás rebanadas > S3`), con el canvas aprobado
> en `specs/SLT-95-detalle-cierre-rediseno/canvas/project/` (`Fila2.dc.html` y la lista de
> `Main.dc.html`). La rebanada anterior, SLT-100 «Detalle de cierre único en /cierres-admin
> (mensajeros)», está en `dev` y dejó «Gestiones» montando `GestionesPorResultado` sin cambios.
> Este archivo **no reabre** nada del madre: copia los R `[S3]` con su número y su sentido, y añade
> solo lo que S3 necesita y el madre no detalla (R84-R91).

## Alcance

`/cierres-admin` › Mensajero › detalle de un cierre › pestaña «Gestiones», para la **central** y la
**bodega satélite**:

- Un componente de **lista** (`GestionesCierre`) con los filtros por resultado y su conteo, más
  «Todas» y «Con señales», la tabla con las columnas de R23 y «Descargar» en la misma barra.
- Un componente de **fila** (`FilaGestion`) parametrizado por `audiencia` (central, satélite,
  mensajero, solo lectura): fila cerrada con señales; fila desplegada con los datos de la orden,
  las tarjetas de dinero en cascada y «Ver cómo se calculó».
- `CierresAdminModule` monta la lista nueva en lugar de `GestionesPorResultado`.
- «Descargar» gana la columna «Señales» (D26).
- Las audiencias **mensajero** y **solo lectura** se construyen y se prueban con dobles; las montan
  SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» y SLT-104 «Detalle de cierre de
  bodega en el detalle único (central)».

## Lo que NO entra

- Las cifras que el servidor aún no emite (R64-R66): la tarifa del concepto del modelo nuevo y su
  % de IVA, el IVA incluido en el cobro («de eso, IVA»), el total «Se cobró» del fulfillment y la
  fecha del cargo, y el pago «por tarifa» con su ajuste en cascada. Las trae SLT-110 «Cifras del
  servidor en la fila: tarifas, IVA, pago y fulfillment» (o esta ficha, si Carlos lo decide en PA1).
  `tarifaFaltante` llega `false` en el admin hasta entonces, así que la señal «Sin tarifa de pago»
  no aparece en `/cierres-admin` hasta SLT-110.
- El visor de evidencia con «Anterior/Siguiente» y el botón único «Ver evidencia (n)» (R54): SLT-103
  «Diálogos del módulo de cierres y trato tú». Aquí la evidencia se abre como hoy.
- Sustituir `GestionesPorResultado` en el detalle de bodega (SLT-104 «Detalle de cierre de bodega en
  el detalle único (central)») y en `/cierre-dia` (SLT-108 «/cierre-dia: detalle y cola únicos para
  el mensajero»). Esas pantallas no cambian.
- «Devolver a gestión» montado en una pantalla (R61, SLT-109 «/cierre-dia: el cierre de hoy,
  rechazado o vencido como página»). Aquí solo existe como acción de la fila, probada con dobles.
- Borrar `GestionesPorResultado` o la fila vieja de `cierre-factura.tsx`: SLT-115 «Retirar los
  componentes de cierre sustituidos».
- Cualquier cambio de dinero, de permisos, de esquema o de servidor (R71, R72).

## Decisiones cerradas (no reabrir)

Vienen del spec madre (`specs/SLT-95-detalle-cierre-rediseno/requirements.md`), de
`progress/features/SLT-95.md` y de `progress/features/SLT-100.md`. Aquí solo están las que S3 hace
visibles.

| # | Fecha · quién | Decisión |
|---|---|---|
| D2 | 2026-11-08 · Carlos | Fila desplegada opción 2: 4 tarjetas en 2x2. «Ver cómo se calculó» = una tarjeta por concepto. |
| D4 | 2026-11-08 · Carlos | Los métodos de pago en 0 no se muestran. |
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D10 | 2026-11-09 · Carlos | TODAS las cifras del canvas van; las que no llegan las deriva el servidor (rebanadas de cifras). |
| D15 | 2026-11-09 · Carlos | Componentes iguales con props distintas, nunca uno por rol. |
| D16 | 2026-11-09 · Carlos | Tarjetas con mucha información en formato cascada: partidas en líneas simples, «−»/«+» delante, raya y total en negrita. |
| D17 | 2026-11-09 · Carlos / n0 | Se reutilizan tal cual `DescargarDatasetButton`, `Modal` y el conmutador de cierres; no se inventan controles. |
| D19 | 2026-11-09 · medición en prod | En prod todo cierre es del modelo viejo; el rediseño pinta los dos y el E2E cubre los dos. |
| D20 | 2026-11-09 · Carlos («unificamos») | Una cifra, un nombre. |
| D26 | 2026-11-09 · Carlos (PA4 de SLT-100) | «Descargar» nació con las columnas de R23; «Señales» la añade SLT-101. |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D2 | R25, R27, R28 |
| D4 | R27 |
| D5 | R71, R72 |
| D10 | R27, R29, R30 y `design.md > Cifras que faltan` (lo que trae SLT-110) |
| D15 | R22, R90 |
| D16 | R27, R28 |
| D17 | R84 (conmutador existente), R90 (`DescargarDatasetButton`) |
| D19 | R29, R77 |
| D20 | R27 (rótulos de la cuenta «Lo que se le factura a la tienda»), R85, R91 |
| D26 | R91 |

## Requisitos (EARS)

Los R con número ≤ 78 son copia del madre: mismo número y mismo sentido; R31 es de SLT-104 y no
entra. R84-R91 son nuevos de S3. El test previsto de cada R está en `tasks.md > Trazabilidad`.

### Lista y fila (copia del madre)

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
  | Devolver a gestión | no | no | en curso o rechazado (R61) | no |
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
  R64. (En S3, sin R64 todavía, la tarjeta del modelo nuevo muestra la base y el IVA que llegan, sin
  la línea de tarifa; la línea la añade SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago
  y fulfillment».)
- **R30** [S3] — El fulfillment de la fila DEBE mostrarse solo cuando quien mira es la central y
  `fulfillment` no es nulo, en el detalle de mensajero y en el de bodega.

### Lo que S3 añade (nuevo)

- **R84** [S3, nuevo] — Los filtros de «Gestiones» DEBEN ser excluyentes (uno activo a la vez) y
  presentarse en este orden: «Todas», los cinco resultados con el nombre vigente de cada uno, y «Con
  señales», cada uno con su conteo entre paréntesis, también los que valen 0. CUANDO se abre la
  pestaña, el filtro activo DEBE ser «Todas». CUANDO el usuario elige un filtro, la tabla DEBE
  mostrar solo las gestiones de ese resultado, o las que tienen al menos una señal (R24, R85). SI un
  filtro no tiene gestiones, ENTONCES la tabla DEBE mostrar un estado vacío con texto, nunca una
  tabla en blanco. Filtrar NO DEBE cambiar ningún importe ni el contenido de «Descargar».
- **R85** [S3, nuevo] — El texto de cada señal DEBE ser, en este orden y separado por « · »:
  - «Pago ajustado» (solo central, satélite y solo lectura; al mensajero no le llegan los ajustes);
  - incidente con `indemnizacion` nula: «<causa> · sin indemnizar» con la causa en su rótulo
    legible (central y satélite) o solo «<causa>» (mensajero y solo lectura), como el canvas;
  - «Vuelve a bodega», con la regla única de qué paquete vuelve (`vuelveABodega`);
  - «Rechazo automático» (central, satélite y solo lectura; nunca al mensajero, ficha 414);
  - «Sin tarifa de pago».

  El conteo de «Con señales» DEBE contar gestiones con al menos una señal **para esa audiencia**.
- **R86** [S3, nuevo] — La fila cerrada DEBE pintar el resultado con su botón de información (ficha
  456) y cada importe con el formateador compartido. SI un importe de la fila cerrada es nulo
  (`montoRecibido` fuera de una entrega, `ingresoEmpresa` de un cierre anterior al snapshot,
  `pagoMensajero` de un cierre anterior a la migración), ENTONCES la celda DEBE decir «—», nunca
  ₡0.
- **R87** [S3, nuevo] — CUANDO el usuario despliega una gestión, además de orden, producto y
  dirección (R25), la cabecera de la fila DEBE mostrar, solo cuando tienen valor, los datos que hoy
  enseña la fila: ubicación (zona, provincia, cantón, distrito), nueva fecha (reprogramado), motivo
  (en su forma legible de hoy), causa (incidente), el origen «Automático»/«Manual» de una devolución
  a origen (central, satélite y solo lectura) y la marca «La tienda» de una gestión registrada desde
  la ayuda (mensajero). Ninguno de estos es un importe.
- **R88** [S3, nuevo; **pendiente de PA2**] — Con audiencia central, satélite o solo lectura, la
  fila desplegada DEBE seguir mostrando, con las reglas de hoy, la indemnización de un incidente
  (el monto, o «—» con la nota de pendiente mientras sea nula) y el ingreso de bodega de la gestión
  (`ingresoBodegaRechazo`: en una devolución a origen siempre que llegue; en el modelo nuevo, en
  cualquier resultado distinto de cero, para que las filas sumen la línea de «Dinero», SLT-54 R71).
  Con audiencia mensajero NO DEBE mostrar ninguno de los dos.
- **R89** [S3, nuevo] — La lista y la fila DEBEN conservar los nombres accesibles de hoy: la región
  «Órdenes del cierre»; el botón que despliega la fila («Desglose de ingreso de la orden <remisión> ·
  <destinatario>», o «Detalle de la orden <remisión> · <destinatario>» sin snapshot); y los botones
  de acción con la orden en su nombre («Corregir métodos de pago de la orden …», «Corregir el
  resultado de la orden …», «Ajustar pago al mensajero de la orden …», «Ver evidencia de la orden
  …»). El filtro DEBE ser un grupo con nombre «Filtrar por resultado» cuyas opciones anuncian si
  están activas.
- **R90** [S3, nuevo] — CUANDO la central o la satélite abre la pestaña «Gestiones» de un cierre de
  mensajero en `/cierres-admin`, el sistema DEBE pintar la lista y la fila únicas (R22) con la
  audiencia del actor, en lugar de `GestionesPorResultado`, con «Descargar» en la barra de los
  filtros y, debajo de la tabla, las órdenes que pasaron a «Novedad interna» (R19). Los callbacks
  de las acciones DEBEN ser los mismos que hoy (`ofrecerCorreccionPagos`, `ofrecerCorreccionResultado`,
  `ofrecerAjustePago`, el visor de evidencia de hoy). El detalle de bodega y `/cierre-dia` NO DEBEN
  cambiar.
- **R91** [S3, nuevo] — «Descargar» de «Gestiones» DEBE llevar, después de las siete columnas de R82
  y en este orden, la columna «Señales», con el mismo texto que la celda de la tabla (R85) para la
  audiencia que descarga, y celda vacía en una gestión sin señales. DEBE seguir habiendo una fila
  por gestión del cierre, sea cual sea el filtro activo.

### Dinero intacto y verificación (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S3: la fila, central y satélite] — Para un mismo cierre, cada cifra que ve cada audiencia
  DEBE ser igual al céntimo al importe escrito a mano en el escenario E2E, con un cierre del modelo
  viejo y otro del modelo nuevo. En S3 se cubren las tarjetas, «Ver cómo se calculó» y la fila
  cerrada de la central y la satélite. El mensajero entra con SLT-108 «/cierre-dia: detalle y cola
  únicos para el mensajero».

## Preguntas abiertas

Para Carlos (no se implementa hasta que respondas PA1-PA3; PA4 y PA5 tienen propuesta por defecto):

- **PA1 — Cifras que aún no llegan.** La fila del canvas pinta cifras que el servidor no emite
  todavía (lista en `design.md > Cifras que faltan`): «de eso, IVA», el «Se cobró» y la fecha del
  fulfillment, el pago «por tarifa» y su «− Ajuste», y la tarifa y el % de IVA del modelo nuevo.
  Propuesta: S3 sale sin ellas (sin ₡0 ni rótulos vacíos) y las trae SLT-110 «Cifras del servidor
  en la fila: tarifas, IVA, pago y fulfillment», que ya está en el plan. Alternativa: traerlas aquí
  (pasa a fullstack, ~+12 archivos y ~+700 líneas). ¿Cuál?
- **PA2 — Datos de hoy que el canvas no dibuja.** La fila de hoy enseña la indemnización del
  incidente y el «Ingreso de bodega» por gestión (las filas suman la línea de «Dinero», SLT-54 R71;
  lo afirma `e2e/tarifas-activacion.spec.ts`). El canvas solo dibuja una entrega y no los ubica.
  Propuesta (R88): van en la cabecera de la fila desplegada, junto a orden/producto/dirección, solo
  para central, satélite y solo lectura. ¿De acuerdo, o prefieres otra ubicación o quitarlos?
- **PA3 — Tamaño.** Estimado ~31 archivos y ~1 900 líneas (límite 40/1 000). Los archivos caben; las
  líneas no (la mitad son tests y la adaptación de 6 E2E). Partir dejaría la lista sin fila o la fila
  sin montar. ¿Lo aceptas sin partir?
- **PA4 — Control de los filtros.** Propuesta: el conmutador que ya usa cierres (`SegmentedToggle`,
  botones con su conteo «Entregado (12)») en lugar de pastillas nuevas, y **sin buscador**, porque
  el canvas no lo dibuja en «Gestiones». ¿Te sirve, o quieres `BuscadorFiltros` con búsqueda por guía
  o destinatario?
- **PA5 — Orden de «Todas».** Propuesta: por resultado (Entregado, Reprogramado, Novedad, Devolución
  a origen, Incidente) y, dentro, el orden del servidor. Alternativa: primero las gestiones con
  señales (regla 3 del canvas: lo que pide atención, primero). ¿Cuál?

**Para el Preview** (no bloquean):
- en una gestión no entregada, «Recibió el mensajero» dice «Sin dato» (R27 literal: el servidor no
  manda monto recibido fuera de una entrega);
- «Ver cómo se calculó» enseña una tarjeta por concepto **cobrado** (D2); la tabla de la ficha 338
  con los nueve cobros posibles y sus ceros deja de verse en el detalle del admin;
- los nombres de los resultados son los vigentes («Devolución a origen por rechazo»), no los cortos
  de la maqueta («Devolución»).
