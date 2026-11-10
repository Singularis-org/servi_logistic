# SLT-101 «Fila de gestión única y lista con filtros» — requirements

> Ruta: completa (`ruta` vacía; pantalla de dinero). Zona: **fullstack** desde las respuestas de
> Carlos del 2026-11-09 (PA1: las cifras del canvas que el servidor no emite se traen aquí).
> Escrito por spec_author el 2026-11-09; actualizado el mismo día con las respuestas de Carlos
> (`progress/features/SLT-101.md > Respuestas de Carlos (2026-11-09)`) y su corrección sobre los
> filtros («ojo los filtros tienen ya componente, por favor reúsalo»).
>
> Rebanada **S3** del rediseño de cierres. El spec madre, **aprobado por Carlos** (2026-11-09), es
> `specs/SLT-95-detalle-cierre-rediseno/` (`requirements.md` v2, R marcados `[S3]`; `design.md >
> 3. Fila de una gestión` y `> Cifras nuevas`; `tasks.md > Plan de las demás rebanadas > S3`), con
> el canvas aprobado en `specs/SLT-95-detalle-cierre-rediseno/canvas/project/` (`Fila2.dc.html` y la
> lista de `Main.dc.html`). La rebanada anterior, SLT-100 «Detalle de cierre único en /cierres-admin
> (mensajeros)», está en `dev` y dejó «Gestiones» montando `GestionesPorResultado` sin cambios.
> Este archivo **no reabre** nada del madre: copia los R `[S3]` con su número y su sentido, trae de
> S12 los R64-R66 (PA1) y añade solo lo que S3 necesita y el madre no detalla (R84-R98).
> **Carlos: «sé fiel al diseño».** Donde el spec se aparta del canvas, lo dice y por qué
> (`design.md > Fidelidad al canvas`).

## Alcance

`/cierres-admin` › Mensajero › detalle de un cierre › pestaña «Gestiones», para la **central** y la
**bodega satélite**:

- Un componente de **lista** (`GestionesCierre`) con los filtros por resultado y su conteo a la
  vista (más «Todas» y «Con señales»), montados sobre la barra de filtros de la app
  (`BuscadorFiltros` + `FilterComponent`), la tabla con las columnas de R23 y «Descargar» en la
  misma fila.
- Un componente de **fila** (`FilaGestion`) parametrizado por `audiencia` (central, satélite,
  mensajero, solo lectura): fila cerrada con señales; fila desplegada con los datos de la orden,
  las tarjetas de dinero en cascada y «Ver cómo se calculó».
- **Servidor:** el detalle del cierre de `/cierres-admin` emite las cifras de la fila que hoy no
  llegan (R64-R66, R92-R96): la tarifa congelada de cada concepto del modelo nuevo, el IVA incluido
  en el cobro, el «Se cobró» del fulfillment con su fecha de cargo, el pago «por tarifa» con su
  ajuste y la señal «Sin tarifa de pago». Campos aditivos, sin migración.
- `CierresAdminModule` monta la lista nueva en lugar de `GestionesPorResultado`.
- «Descargar» gana la columna «Señales» (D26).
- Las audiencias **mensajero** y **solo lectura** se construyen y se prueban con dobles; las montan
  SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» y SLT-104 «Detalle de cierre de
  bodega en el detalle único (central)».

## Lo que NO entra

- **Indemnización e «Ingreso de bodega» por gestión** (antes R88): el canvas aprobado no los dibuja
  en la fila (ni en `Fila2.dc.html` ni en la lista de `Main.dc.html`; solo aparece la señal
  «<causa> · sin indemnizar»). Por la respuesta de Carlos a PA2 no se añaden; lo agregado del
  cierre sigue en «Dinero» («− Ingreso de bodega…»). Se avisa a Carlos en el Preview.
- **Los demás datos de hoy que la cabecera del canvas no dibuja** (antes R87: ubicación, nueva
  fecha de un reprogramado, motivo, causa, origen «Automático»/«Manual», marca «La tienda»): el
  canvas dice «cabecera: solo datos de la orden» y dibuja Orden, Producto y Dirección. Se aplica la
  misma regla que PA2; **PA6** pide a Carlos que lo confirme.
- El visor de evidencia con «Anterior/Siguiente» y el botón único «Ver evidencia (n)» (R54): SLT-103
  «Diálogos del módulo de cierres y trato tú». Aquí la evidencia se abre como hoy.
- Sustituir `GestionesPorResultado` en el detalle de bodega (SLT-104 «Detalle de cierre de bodega en
  el detalle único (central)») y en `/cierre-dia` (SLT-108 «/cierre-dia: detalle y cola únicos para
  el mensajero»). Esas pantallas no cambian. Las cifras nuevas del servidor llegan también al
  detalle de bodega (mismo mapper), pero esa pantalla no las pinta hasta SLT-104.
- «Devolver a gestión» montado en una pantalla (R61, SLT-109 «/cierre-dia: el cierre de hoy,
  rechazado o vencido como página»). Aquí solo existe como acción de la fila, probada con dobles.
- Borrar `GestionesPorResultado` o la fila vieja de `cierre-factura.tsx`: SLT-115 «Retirar los
  componentes de cierre sustituidos».
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71,
  R72). Las cifras nuevas son **lecturas** de lo ya congelado.

## Decisiones cerradas (no reabrir)

Vienen del spec madre (`specs/SLT-95-detalle-cierre-rediseno/requirements.md`), de
`progress/features/SLT-95.md`, de `progress/features/SLT-100.md` y de las respuestas de Carlos a
este spec. Aquí solo están las que S3 hace visibles.

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
| S3-1 | 2026-11-09 · Carlos (PA1) | Las cifras del canvas que el servidor no emite se traen en esta ficha (pasa a fullstack). SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» queda con lo que no sea de la fila. |
| S3-2 | 2026-11-09 · Carlos (PA2, «sé fiel al diseño») | Indemnización e «Ingreso de bodega» por gestión solo donde el canvas los dibuje; no los dibuja, así que no van. Aviso en Preview. |
| S3-3 | 2026-11-09 · Carlos (PA3) | Un solo PR, sin partir. |
| S3-4 | 2026-11-09 · Carlos (PA4, corregido: «los filtros tienen ya componente, reúsalo») | Los filtros de «Gestiones» se construyen con `BuscadorFiltros` (la barra de filtros de la app), con el aspecto del canvas: conteo a la vista, sin buscador. Ni `SegmentedToggle` ni controles nuevos; lo que falte, prop aditiva del componente existente. |
| S3-5 | 2026-11-09 · Carlos (PA5) | «Todas» ordenadas por resultado. |
| S3-6 | 2026-11-09 · Carlos | R26 remite a R61 (errata del madre, que decía R51). |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D2 | R25, R27, R28 |
| D4 | R27 |
| D5 | R71, R72, R92 |
| D10 | R27, R29, R30, R64, R65, R66, R92-R96 |
| D15 | R22, R90 |
| D16 | R27, R28, R97 |
| D17 | R90 (`DescargarDatasetButton`); R84 (barra de filtros existente, S3-4) |
| D19 | R29, R77 |
| D20 | R27 (rótulos de la cuenta «Lo que se le factura a la tienda»), R85, R91 |
| D26 | R91 |
| S3-1 | R64, R65, R66, R92-R96 |
| S3-2 | «Lo que NO entra» (R88 retirado); R25 (cabecera solo orden, producto, dirección) |
| S3-3 | `tasks.md > Tamaño` |
| S3-4 | R84, R89 |
| S3-5 | R84 |
| S3-6 | R26 |

## Requisitos (EARS)

Los R con número ≤ 78 son copia del madre: mismo número y mismo sentido; R31 es de SLT-104 y no
entra. R64-R66 eran de S12 (SLT-110) y pasan aquí por S3-1. R84-R98 son nuevos de S3. **R87 y R88
quedan retirados** (S3-2 y PA6) y no se reutiliza su número. El test previsto de cada R está en
`tasks.md > Trazabilidad`.

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
  R64.
- **R30** [S3] — El fulfillment de la fila DEBE mostrarse solo cuando quien mira es la central y
  `fulfillment` no es nulo, en el detalle de mensajero y en el de bodega.

### Cifras nuevas del servidor (copia del madre, S12 → S3 por S3-1)

- **R64** [S3 por S3-1] — CUANDO la gestión es del modelo nuevo, el servidor DEBE emitir, por
  concepto cobrado a la tienda, su tarifa congelada (`cierre_detail_concepto`: modo, valor, % de
  IVA, nivel y el grupo o la zona de su `tarifa_valor`), y la fila DEBE pintarla en «Ver cómo se
  calculó».
- **R65** [S3 por S3-1] — El servidor DEBE emitir, por gestión: el IVA incluido en el cobro a la
  tienda (`ivaFlete` + `ivaComisionCod` + `ivaFleteDevolucion`), el total del fulfillment con IVA y
  la fecha en que se cargó al saldo de la tienda, y la fila DEBE pintarlos («de eso, IVA», «Se
  cobró», «Se cargó al saldo de la tienda el …»).
- **R66** [S3 por S3-1] — El servidor DEBE emitir, por gestión con pago congelado, el pago «por
  tarifa» (`gestion_pago_congelado.importe` del mensajero, con su modo y nivel) y, si hubo ajuste,
  la diferencia con su signo hasta `pagoMensajero`; la tarjeta «Se le paga al mensajero» DEBE
  pintarlos en cascada. Con audiencia central o satélite, `tarifaFaltante` DEBE llegar con su valor
  real.

### Lo que S3 añade (nuevo)

- **R84** [S3, nuevo] — Los filtros de «Gestiones» DEBEN montarse con la barra de filtros de la app
  (`BuscadorFiltros` con `FilterComponent`), **sin campo de búsqueda** y con todas las opciones a la
  vista (como el canvas). DEBEN ser excluyentes (uno activo a la vez) y presentarse en este
  orden: «Todas», los cinco resultados con el nombre vigente de cada uno (PA7), y «Con señales»,
  cada uno con su conteo detrás del nombre separado por un espacio («Entregado 12», como el canvas),
  también los que valen 0. CUANDO se abre la pestaña, el filtro activo DEBE ser «Todas» y la tabla
  DEBE listar las gestiones por resultado (Entregado, Reprogramado, Novedad, Devolución a origen por
  rechazo, Incidente) y, dentro de cada uno, en el orden del servidor. CUANDO el usuario elige un
  filtro, la tabla DEBE mostrar solo las gestiones de ese resultado, o las que tienen al menos una
  señal (R24, R85). SI un filtro no tiene gestiones, ENTONCES la tabla DEBE mostrar un estado vacío
  con texto, nunca una tabla en blanco. Filtrar NO DEBE cambiar ningún importe, ni el contenido de
  «Descargar», ni ningún parámetro de la URL de `/cierres-admin`.
- **R85** [S3, nuevo] — El texto de cada señal DEBE ser, en este orden y separado por « · »:
  - «Pago ajustado» (solo central, satélite y solo lectura; al mensajero no le llegan los ajustes,
    SLT-56 Q2);
  - incidente con `indemnizacion` nula: «<causa> · sin indemnizar» con la causa en su rótulo
    legible (central y satélite) o solo «<causa>» (mensajero y solo lectura), como el canvas;
  - «Vuelve a bodega», con la regla única de qué paquete vuelve (`vuelveABodega`);
  - «Rechazo automático» (central, satélite y solo lectura; nunca al mensajero, ficha 414);
  - «Sin tarifa de pago» (central, satélite y solo lectura) o «Sin tarifa» (mensajero), como el
    canvas.

  El conteo de «Con señales» DEBE contar gestiones con al menos una señal **para esa audiencia**.
- **R86** [S3, nuevo] — La fila cerrada DEBE pintar el resultado con su botón de información (ficha
  456) y cada importe con el formateador compartido. SI un importe de la fila cerrada es nulo
  (`montoRecibido` fuera de una entrega, `ingresoEmpresa` de un cierre anterior al snapshot,
  `pagoMensajero` de un cierre anterior a la migración), ENTONCES la celda DEBE decir «—», nunca
  ₡0.
- **R87** — *Retirado* (fidelidad al canvas: la cabecera solo lleva Orden, Producto y Dirección;
  PA6).
- **R88** — *Retirado* (S3-2: el canvas no dibuja indemnización ni «Ingreso de bodega» en la fila).
- **R89** [S3, nuevo] — La lista y la fila DEBEN conservar los nombres accesibles de hoy: la región
  «Órdenes del cierre»; el botón que despliega la fila («Desglose de ingreso de la orden <remisión> ·
  <destinatario>», o «Detalle de la orden <remisión> · <destinatario>» sin snapshot); y los botones
  de acción con la orden en su nombre («Corregir métodos de pago de la orden …», «Corregir el
  resultado de la orden …», «Ajustar pago al mensajero de la orden …», «Ver evidencia de la orden
  …»). El filtro DEBE ser un grupo con nombre «Filtrar por resultado» cuyas opciones anuncian si
  están activas (`aria-pressed`).
- **R90** [S3, nuevo] — CUANDO la central o la satélite abre la pestaña «Gestiones» de un cierre de
  mensajero en `/cierres-admin`, el sistema DEBE pintar la lista y la fila únicas (R22) con la
  audiencia del actor, en lugar de `GestionesPorResultado`, con «Descargar» en la misma fila que
  los filtros, a la derecha, y, debajo de la tabla, las órdenes que pasaron a «Novedad interna»
  (R19). Los callbacks de las acciones DEBEN ser los mismos que hoy (`ofrecerCorreccionPagos`,
  `ofrecerCorreccionResultado`, `ofrecerAjustePago`, el visor de evidencia de hoy). El detalle de
  bodega y `/cierre-dia` NO DEBEN cambiar.
- **R91** [S3, nuevo] — «Descargar» de «Gestiones» DEBE llevar, después de las siete columnas de R82
  y en este orden, la columna «Señales», con el mismo texto que la celda de la tabla (R85) para la
  audiencia que descarga, y celda vacía en una gestión sin señales. DEBE seguir habiendo una fila
  por gestión del cierre, sea cual sea el filtro activo.

#### Servidor (detalle de R64-R66)

- **R92** [S3, nuevo] — Las cifras de R64-R66 DEBEN derivarse en el servidor con aritmética
  decimal, viajar como string de escala 2 (los porcentajes, como el string congelado) y llegar como
  campos **aditivos** del detalle del cierre: ningún campo existente cambia de nombre, de tipo ni de
  valor. Su lectura NO DEBE escribir nada ni requerir migración.
- **R93** [S3, nuevo] — El servidor DEBE emitir el IVA incluido en el cobro de una gestión como la
  suma de los IVA de los conceptos presentes, o nulo SI ningún concepto aplica o no hay snapshot.
  La tarjeta «Se le cobra a la tienda» DEBE pintar «de eso, IVA (no es de la empresa)» con ese
  importe debajo del total, y NO DEBE pintar la línea cuando es nulo.
- **R94** [S3, nuevo] — El servidor DEBE emitir, con el fulfillment de la fila: el total «Se cobró»
  (`fulfillment` + `ivaFulfillment`), el % de IVA congelado del fulfillment (nulo en el modelo
  viejo, que no lo tiene) y la fecha del cargo, leída **solo** de los movimientos de fulfillment de
  las órdenes de ese cierre: la del último movimiento de la orden SI es un cargo; nula SI el último
  es un reverso o no hay ninguno. MIENTRAS quien mira no sea la central, el servidor NO DEBE emitir
  ninguno de los tres (nulos, ficha 481). SI la fecha es nula, ENTONCES la tarjeta DEBE omitir «Se
  cargó al saldo de la tienda el …, una vez por paquete.» y conservar «No depende de esta gestión ni
  de este cierre.».
- **R95** [S3, nuevo] — El pago «por tarifa» de R66 DEBE salir **solo** de la fila congelada de esa
  gestión con actor mensajero (nunca de la de la satélite), con su modo, su nivel y los nombres de
  zona, grupo o vehículo de su valor de tarifa (nulos si el valor se borró después). SI la gestión
  no tiene esa fila (modelo viejo), ENTONCES el servidor DEBE emitirlo nulo y la tarjeta DEBE pintar
  solo «Se le paga» y, si hubo ajuste, la marca, el motivo y quién y cuándo. SI hubo ajuste y
  `pagoMensajero` difiere del importe congelado, ENTONCES el servidor DEBE emitir la diferencia en
  valor absoluto con su signo («suma» o «resta»); SI no difieren o no hubo ajuste, nula.
- **R96** [S3, nuevo] — Con audiencia central o satélite, `tarifaFaltante` DEBE ser verdadero SI y
  solo SI la gestión es del modelo nuevo, su resultado tiene concepto de pago al mensajero en el
  catálogo de tarifas y no tiene fila congelada con actor mensajero. En el modelo viejo DEBE ser
  falso: lo congelado no guarda si la zona tenía tarifa de pago (PA9).
- **R97** [S3, nuevo] — En «Ver cómo se calculó» del modelo nuevo, cada tarjeta de concepto DEBE
  mostrar, como el canvas: el nombre del concepto como título; la línea «Tarifa: <origen>» según su
  nivel («grupo «<grupo>» de la zona <zona>», «valor base de la zona <zona>»; los demás niveles,
  PA8); la base («Monto fijo» en modo monto, o «<valor> % de <base>» en porcentaje); «+ IVA <% de
  IVA> %» con el IVA del concepto; y el total del concepto con el nombre del concepto. SI el valor
  de tarifa se borró después (nombres nulos), ENTONCES la línea DEBE decir el nivel sin nombres. La
  nota DEBE ser «Tarifas tal como estaban al crear el cierre (<fecha> <hora>). Si después cambian,
  aquí no cambia nada.».
- **R98** [S3, nuevo] — La tarjeta «Se le paga al mensajero» DEBE pintar en cascada, como el canvas:
  «Por tarifa · <origen>» con el importe congelado (R95); «− Ajuste» o «+ Ajuste» con la diferencia
  (R95) solo si no es nula; «Se le paga» = `pagoMensajero` en negrita; y debajo, separadas, «Motivo:
  «<motivo>»» y «Ajustó <nombre> · <fecha hora>» del último ajuste. Con ajuste, la tarjeta DEBE
  llevar la insignia «Ajustado» junto al título y el borde de aviso.

### Dinero intacto y verificación (copia del madre)

- **R71** [todas] — Los componentes del módulo NO DEBEN convertir un importe a número ni sumar,
  restar, redondear o reordenar importes en el cliente.
- **R72** [todas] — Ninguna rebanada DEBE modificar cómo se calcula, congela o asienta un importe:
  ni snapshots, ni asientos, ni tarifas, ni Server Actions de escritura, ni migraciones.
- **R77** [S3: la fila, central y satélite] — Para un mismo cierre, cada cifra que ve cada audiencia
  DEBE ser igual al céntimo al importe escrito a mano en el escenario E2E, con un cierre del modelo
  viejo y otro del modelo nuevo. En S3 se cubren las tarjetas, «Ver cómo se calculó» y la fila
  cerrada de la central y la satélite, incluidas las cifras de R64-R66. El mensajero entra con
  SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero».

## Preguntas abiertas

PA1-PA5 respondidas por Carlos el 2026-11-09 (decisiones S3-1 a S3-6). Quedan, para Carlos:

- **PA6 — Cabecera de la fila: solo lo que dibuja el canvas.** El canvas dice «cabecera: solo
  datos de la orden» y dibuja Orden, Producto y Dirección. La fila de hoy enseña además ubicación,
  nueva fecha (reprogramado), motivo (novedad, devolución), causa y el origen «Automático/Manual»
  de una devolución. Aplicando tu regla de PA2, **no van** (la causa sigue en la señal mientras no
  se indemniza; el rechazo automático, en su señal). ¿Lo confirmas, o quieres alguno de vuelta (por
  ejemplo, el motivo o la nueva fecha)? No bloquea: se implementa sin ellos y se mira en Preview.
- **PA7 — Nombre del resultado.** El canvas escribe «Devolución» en el filtro y en la fila; la app
  usa «Devolución a origen por rechazo» en todas partes (ficha 456: un nombre por estado, con su
  botón de información, lo vigila una guardia). Se pinta el nombre vigente. ¿O cambiamos el nombre
  corto en toda la app (otra ficha)?
- **PA8 — Textos de «Tarifa:» y «Por tarifa ·» que el canvas no dibuja.** El canvas da tres:
  «grupo «X» de la zona Y», «valor base de la zona Y» y «precio propio del mensajero». Para los
  niveles que no dibuja se propone: tienda en un grupo «precio propio de la tienda en el grupo «X»
  de la zona Y»; tienda en una zona «precio propio de la tienda en la zona Y»; tienda en todas sus
  zonas «precio propio de la tienda»; pago por zona o grupo con vehículo «… para <vehículo>». No
  bloquea: se revisan en Preview.
- **PA9 — «Sin tarifa de pago» en cierres del modelo viejo.** Lo congelado del modelo viejo no
  guarda si la zona tenía tarifa de pago, así que en el admin la señal solo puede salir en el modelo
  nuevo (R96). Hoy todos los cierres de prod son del viejo (D19): la señal no aparecerá en prod
  hasta que la empresa active las tarifas nuevas. La alternativa (mirar la tarifa **de hoy** de la
  zona) puede afirmar algo falso de un cierre pasado. ¿De acuerdo con dejarla solo para el modelo
  nuevo?

**Para el Preview** (no bloquean):
- en una gestión no entregada, «Recibió el mensajero» dice «Sin dato» (R27 literal: el servidor no
  manda monto recibido fuera de una entrega);
- «Ver cómo se calculó» enseña una tarjeta por concepto **cobrado** (D2); la tabla de la ficha 338
  con los nueve cobros posibles y sus ceros deja de verse en el detalle del admin;
- la fila ya no enseña la indemnización ni el «Ingreso de bodega» por gestión (S3-2);
- en un cierre del modelo viejo, «Se le paga al mensajero» no tiene línea «Por tarifa» (no hay pago
  congelado que leer, R95).
