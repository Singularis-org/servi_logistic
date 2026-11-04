# SLT-52 — tarifas-flexibles-modelo · requirements.md

> Zona: backend · Complejidad: high · depends_on: — · Rama: feature/SLT-52-tarifas-flexibles-modelo
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Modelo de datos nuevo de tarifas y un único resolver. La app trae la lista fija de
> conceptos por actor: a la TIENDA se le cobra flete por cada resultado de la gestión, fulfillment
> y comisión COD; al MENSAJERO y a la SATÉLITE se les paga por cada resultado que la empresa
> configure. Cada concepto lleva monto o % (lo elige la empresa); los cobros a la tienda llevan
> además su IVA, los pagos al mensajero y a la satélite no llevan IVA. Los valores viven por
> niveles: valor base de la zona, grupos de distritos con valor propio (la zona especial es un grupo
> más) y precio propio de la tienda. Desaparece la variante GAM del cálculo. Incluye los services de
> escritura que usará la pantalla de SLT-54.
>
> **Lo que NO entra.** Pantalla de Tarifas → SLT-54. Migración de las tarifas actuales → SLT-53.
> Valor propio del mensajero → SLT-55 (este modelo deja previsto el nivel y su precedencia).
> Quitar columnas viejas y el respaldo al modelo viejo → SLT-57. Ajuste del pago en el cierre →
> SLT-56 (ya en dev). Tope de intentos de entrega por empresa (hoy `REINTENTOS_MIN_INTENTOS`,
> global) → SLT-77. Incentivo manual a la satélite en la wallet → SLT-78.
>
> Sembrado por `/afinar-feature` el 2026-11-02. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Glosario.** *Concepto*: una línea de la lista fija de la app (p. ej. «flete por entregado a la
tienda», «pago al mensajero por rechazo»). *Valor*: lo que la empresa fija para un concepto en un
nivel: modo (monto o %), valor y, solo en los cobros a la tienda, % de IVA. *Grupo*: conjunto de distritos de UNA zona con valores
propios. *Sin tarifa*: ningún nivel tiene valor para ese concepto. *Modelo viejo*: `tarifas` +
`tarifa_zona_mensajero` + `distrito_zona_especial`, como hoy. *Empresa en el modelo nuevo*: la que
tiene al menos un valor guardado en el modelo nuevo.

### Catálogo de conceptos

- **R1.** El sistema DEBE ofrecer una lista cerrada de conceptos, fijada por la app y no editable
  por ninguna empresa: para la TIENDA, un flete por cada resultado de gestión (entregado,
  reprogramado, novedad, devolución por rechazo, incidente), fulfillment y comisión COD; para el
  MENSAJERO, un pago por cada resultado de gestión; para la SATÉLITE, un pago por cada resultado de
  gestión. Ningún concepto de pago existe sin un resultado de gestión.
- **R2.** SI la app gana un resultado de gestión nuevo, ENTONCES el sistema DEBE fallar en la
  verificación hasta que el catálogo tenga el flete a la tienda, el pago al mensajero y el pago a la
  satélite de ese resultado.

### Valores y niveles (escritura)

- **R3.** CUANDO el maestro fija el valor de un concepto, el sistema DEBE guardar el modo que la
  empresa eligió para ese concepto (monto o porcentaje), el valor y, solo si es un concepto de
  cobro a la tienda, su porcentaje de IVA.
- **R4.** SI un valor es negativo, o es un porcentaje mayor que 100, o es un cobro a la tienda sin
  IVA o con IVA fuera de 0 a 100, ENTONCES el sistema DEBE rechazarlo con error de validación sin
  escribir nada, y la base DEBE rechazarlo también cuando llega por debajo de la aplicación.
- **R45.** SI un valor de pago al mensajero o a la satélite trae IVA (aunque sea 0), ENTONCES el
  sistema DEBE rechazarlo con error de validación sin escribir nada, y la base DEBE rechazar
  cualquier fila de un concepto de pago con IVA.
- **R5.** El sistema DEBE aceptar valores de cobro a la tienda en estos niveles: zona (valor base),
  grupo de la zona, tienda en una zona, tienda en un grupo y tienda en todas sus zonas.
- **R6.** El sistema DEBE aceptar valores de pago al mensajero y a la satélite en estos niveles: zona
  y grupo, cada uno para todos los vehículos o para un vehículo concreto; y, solo para el
  mensajero, el valor propio de un mensajero (nivel previsto: lo escribe SLT-55).
- **R7.** SI un valor combina un nivel que no corresponde a su actor (tienda o vehículo en un
  concepto que no los admite, mensajero en un concepto que no es del mensajero, grupo sin zona, o
  ningún nivel), ENTONCES el sistema DEBE rechazarlo, en el service y en la base.
- **R8.** El sistema DEBE guardar a lo sumo un valor por empresa, concepto y nivel exacto; CUANDO el
  maestro fija de nuevo el mismo concepto en el mismo nivel, el sistema DEBE reemplazar el valor
  anterior.
- **R9.** CUANDO el maestro quita un valor, el sistema DEBE borrarlo y, desde ese momento, ese
  concepto en ese nivel DEBE resolverse con el nivel siguiente.
- **R10.** CUANDO el maestro crea un grupo, el sistema DEBE atarlo a una zona de su empresa con un
  nombre único dentro de esa zona.
- **R11.** SI se pide meter en un grupo un distrito que ya está en otro grupo de la misma zona, o un
  distrito que no pertenece a la zona del grupo, ENTONCES el sistema DEBE rechazarlo sin escribir
  nada, en el service y en la base.
- **R12.** CUANDO un distrito deja de pertenecer a una zona, el sistema DEBE sacarlo de los grupos
  de esa zona; CUANDO se borra un grupo, el sistema DEBE borrar sus distritos y sus valores.
- **R13.** SI quien pide escribir valores o grupos no es `maestro`, ENTONCES el sistema DEBE
  responder `forbidden` sin escribir; el `admin` DEBE poder leerlos y cualquier otro rol DEBE
  recibir `forbidden` también al leer.
- **R14.** CUANDO se fija o se quita un valor, o se crea, cambia o borra un grupo, el sistema DEBE
  registrar el hecho en el historial de acciones, con el actor y el valor anterior y el nuevo,
  dentro de la misma transacción del cambio.
- **R15.** MIENTRAS la empresa activa es A, el sistema NO DEBE leer, resolver ni escribir valores o
  grupos de otra empresa, tampoco con SQL a mano.

### Resolución: cobro a la tienda

- **R16.** El sistema DEBE resolver cada concepto de cobro a la tienda con la zona y el distrito
  de la ORDEN, concepto por concepto, con esta precedencia: tienda en el grupo del distrito >
  tienda en la zona > tienda en todas sus zonas > grupo del distrito > valor base de la zona.
- **R17.** SI la tienda no pactó el grupo del distrito pero sí la zona, ENTONCES el sistema DEBE
  usar su precio de zona antes que el valor del grupo.
- **R18.** SI la orden no tiene distrito, o su distrito no está en ningún grupo de la zona,
  ENTONCES el sistema DEBE saltar los niveles de grupo.

### Resolución: pago al mensajero y a la satélite

- **R19.** El sistema DEBE resolver el pago al mensajero de cada gestión con la zona DEL MENSAJERO
  que hoy usa cada camino del cierre y con el distrito de la orden, con esta precedencia: valor
  propio del mensajero > grupo para su vehículo > grupo para todos > zona para su vehículo > zona
  para todos.
- **R20.** El sistema DEBE resolver el pago a la satélite de cada gestión con la misma zona, el
  mismo distrito y la misma precedencia que el mensajero, sin el nivel del valor propio del
  mensajero.
- **R21.** SI el distrito de la orden no está en ningún grupo de la zona del mensajero, ENTONCES el
  sistema DEBE usar los valores de esa zona.
- **R22.** SI el mensajero no tiene vehículo, ENTONCES el sistema DEBE saltar los niveles por
  vehículo.

### «Sin tarifa» y el cero

- **R23.** SI ningún nivel tiene valor para un concepto, ENTONCES el sistema DEBE tratar ese concepto
  como «sin tarifa»; un valor 0 guardado DEBE resolverse como 0 y NO como «sin tarifa».
- **R24.** CUANDO se crea un cierre (solicitud, corte diario, re-solicitud de un rechazado o
  corrección de un resultado), el sistema DEBE contar como 0 cada concepto sin tarifa y DEBE crear
  el cierre igual.
- **R25.** CUANDO la API por key carga, cotiza o lee una orden cuyo flete por entregado no tiene
  tarifa, el sistema DEBE responder 409 como hoy.

### Cálculo

- **R26.** El sistema DEBE calcular el importe de un concepto en monto como el valor, y en
  porcentaje como la base por el valor dividido entre 100, redondeado a 2 decimales hacia arriba
  en el medio; y, solo en los cobros a la tienda, su IVA como el importe ya redondeado por el % de
  IVA, redondeado igual. Toda la
  aritmética DEBE ser decimal exacta y la salida texto con 2 decimales.
- **R27.** El sistema DEBE usar como base de un concepto de cobro a la tienda en porcentaje el valor
  del pedido de la orden (lo que se cobra contra entrega; sin valor, 0).
- **R28.** El sistema DEBE usar como base de un pago al mensajero o a la satélite en porcentaje el
  flete sin IVA que se le cobra a la tienda por ESA gestión según su resultado, con los valores
  congelados en el cierre de esa gestión; SI a la tienda no se le cobra nada por ese resultado,
  ENTONCES el pago en porcentaje DEBE dar 0.
- **R29.** CUANDO una gestión tiene resultado X, el sistema DEBE cobrar a la tienda el flete por X y
  su IVA; el flete por entregado DEBE contar como flete descontable de lo recaudado y el de
  cualquier otro resultado como flete no descontable (el que hoy se llama «flete devuelto»).
- **R30.** El sistema DEBE cobrar la comisión COD y su IVA solo en las gestiones entregadas de
  órdenes que cobran comisión.
- **R31.** El sistema DEBE resolver el fulfillment con la misma precedencia que el resto del cobro a
  la tienda y usarlo donde hoy se usa (costo y cotización de la API, congelado en el cierre), sin
  sumarlo a la liquidación del cierre ni a las wallets.
- **R32.** CUANDO una gestión tiene resultado X, el sistema DEBE pagar al mensajero el concepto «pago
  por X» y a la satélite su concepto «pago por X»; una satélite DEBE poder tener a la vez valores
  para varios resultados.
- **R33.** El sistema DEBE pagar cada gestión en el cierre al que pertenece, con los valores
  vigentes al congelar ese cierre, aunque la misma orden tenga otros intentos en otros cierres.
- **R34.** El sistema DEBE pagar al mensajero y a la satélite exactamente el importe del concepto,
  sin IVA: NO DEBE calcular, congelar ni sumar IVA alguno al pago, al devengo del mensajero ni al
  ingreso de la satélite.
- **R35.** MIENTRAS la empresa está en el modelo nuevo, el sistema NO DEBE usar la marca de zona
  de bodega principal (antes GAM) ni la marca de zona especial para elegir ningún valor.

### Convivencia con el modelo viejo

- **R36.** MIENTRAS la empresa no tiene ningún valor en el modelo nuevo, el sistema DEBE calcular el
  cobro y el pago con el modelo viejo y DEBE dar, centavo a centavo, los mismos importes que antes
  de esta ficha en listado, cierre, wallets, API y cotización.
- **R37.** MIENTRAS la empresa tiene al menos un valor en el modelo nuevo, el sistema DEBE calcular
  todo su cobro y su pago con el modelo nuevo, sin leer el viejo y sin mezclar los dos.

### Un solo cálculo

- **R38.** El sistema DEBE obtener, para la misma orden en el mismo instante, los mismos valores y
  los mismos importes en el listado de órdenes, el cierre, la carga y la lectura por API key, la
  cotización, el cobro por rechazo de tienda y la corrección de datos del cliente.
- **R39.** El sistema DEBE resolver un lote de órdenes o de gestiones con un número fijo de consultas,
  que no crece con el tamaño del lote.

### Congelado

- **R40.** CUANDO se congela un cierre, el sistema DEBE guardar, en la misma transacción que crea
  el detalle, por cada orden los conceptos de cobro a la tienda resueltos (concepto, modo, valor,
  IVA, nivel y valor de origen) y por cada gestión el concepto de pago al mensajero y a la satélite
  resuelto (concepto, modo, valor, nivel, valor de origen, base e importe, sin IVA), junto con el
  modelo que se usó.
- **R41.** SI un valor o un grupo cambia, o se borra, después de congelar un cierre, ENTONCES el
  sistema NO DEBE cambiar ningún importe de ese cierre en su detalle, su aprobación ni las wallets.
- **R42.** SI el cierre se congeló antes de esta ficha o con el modelo viejo, ENTONCES el sistema
  DEBE leerlo exactamente como hoy.
- **R43.** SI alguien intenta modificar o borrar lo congelado de un cierre con el rol de la
  aplicación, ENTONCES la base DEBE rechazarlo.

### Migración

- **R44.** El sistema DEBE crear el modelo nuevo con migraciones de esquema que no muevan, cambien
  ni borren ninguna fila existente, cada una con su `down.sql` que la revierte.

### Decisiones de Carlos tras T4 (añadidos 2026-11-02 21:00)

Ningún R anterior decía que el fulfillment fuera sin IVA (R3, R4 y R26 ya tratan todo cobro a la
tienda con su IVA); el «sin IVA» estaba solo en design §6 y en el código de T4. Por eso no se
enmienda ningún R en sitio: se añaden R46-R51.

- **R46.** MIENTRAS la empresa está en el modelo nuevo, el sistema DEBE calcular el IVA del
  fulfillment como el de cualquier cobro a la tienda (R26: el importe del concepto ya redondeado
  por su % de IVA) y DEBE cobrar a la tienda el fulfillment MÁS su IVA en el costo de la orden por
  API key y en los dos escenarios de la cotización, sin sumar ninguno de los dos a la liquidación
  del cierre ni a las wallets (R31).
- **R47.** MIENTRAS la empresa está en el modelo viejo, el sistema NO DEBE calcular IVA sobre el
  fulfillment: el costo y la cotización DEBEN dar, centavo a centavo, lo mismo que antes de esta
  ficha (R36).
- **R48.** CUANDO nace un cobro por rechazo de tienda y su flete sale del modelo nuevo, el sistema
  DEBE guardar en el cobro qué valor del modelo nuevo lo produjo (el del flete por devolución por
  rechazo a la tienda) y dejar vacía la referencia a la tarifa vieja.
- **R49.** CUANDO nace un cobro por rechazo de tienda y su flete sale del modelo viejo, el sistema
  DEBE guardar la tarifa vieja como hoy y dejar vacía la referencia al valor nuevo; la base DEBE
  rechazar un cobro que traiga las dos referencias a la vez.
- **R50.** SI el valor del modelo nuevo citado por un cobro por rechazo se borra o cambia después,
  ENTONCES el sistema DEBE permitir el borrado, DEBE dejar vacía la referencia del cobro y NO DEBE
  cambiar sus importes congelados; los cobros que existían antes de esta columna DEBEN quedar con
  la referencia vacía, sin tocar ninguna otra columna (R44).
- **R51.** SI una orden no tiene tarifa para el flete por entregado, ENTONCES el sistema DEBE
  tratarla como «sin tarifa» aunque tenga comisión COD o fulfillment configurados: la carga y la
  cotización por API key responden 409 (o la fila va a `error` en un lote mixto), la lectura por
  API key da el costo estimado `null` y la corrección de datos del cliente responde «sin tarifa».

### Base del % del pago = cobro congelado a la tienda (añadidos 2026-11-03)

R28 ya pedía la base «con los valores congelados en el cierre de esa gestión», pero tres caminos
la toman de los valores vigentes mientras la tienda se cobra con lo congelado (design §13). No se
enmienda R28: se añaden R52-R55, que fijan cada camino.

- **R52.** CUANDO se corrige el resultado de una gestión dentro de un cierre abierto, el sistema
  DEBE usar como base del pago en porcentaje al mensajero y a la satélite el flete sin IVA que ese
  cierre le cobra a la tienda por esa gestión con el resultado corregido, calculado solo con el
  cobro y el valor del pedido congelados en ese cierre para esa orden; un valor cambiado, creado o
  borrado después de congelar el cierre NO DEBE cambiar esa base.
- **R53.** CUANDO la re-solicitud de un cierre rechazado vincula una gestión rehecha de una orden que
  el cierre conserva, el sistema DEBE usar como base del pago en porcentaje de esa gestión el flete
  sin IVA que el cierre le cobra a la tienda por su resultado, calculado solo con el cobro y el
  valor del pedido congelados en ese cierre para esa orden.
- **R54.** SI el cobro a la tienda de esa orden se congeló con el modelo viejo y el pago de la
  gestión sale del modelo nuevo, ENTONCES el sistema DEBE usar como base el flete sin IVA que el
  cobro viejo congelado le cobra a la tienda por ese resultado; SI ese cobro no cobra nada (sin
  tarifa congelada o flete en 0), ENTONCES el pago en porcentaje DEBE dar 0.
- **R55.** CUANDO se crea un cierre (solicitud del mensajero o corte diario), el sistema DEBE
  calcular la base de cada pago en porcentaje a partir de los mismos valores de cobro que ese cierre
  congela para la tienda, en la misma transacción.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Base del «% del flete» | R28 |
| Base del % del pago cuando la gestión no es entrega (P1) | R28, R33, R40 |
| Grupo frente a vehículo en el pago (P2) | R19, R20 |
| ¿Fulfillment en el cierre y las wallets? (P3) | R31 |
| IVA del pago al mensajero y a la satélite (P4) | R3, R4, R26, R34, R45 |
| ¿Monto o %, quién decide? | R3 |
| Base de un concepto en % | R27, R28 |
| Cobro a la tienda | R1, R29, R30, R31 |
| Pago al mensajero | R1, R19, R32 |
| Pago a la satélite | R1, R20, R32 |
| ¿La satélite cobra distinto por vehículo? (P1) | R6, R20, R22 |
| ¿Pagos a la satélite que no dependan de un resultado? (P1) | R1 |
| ¿Pago por gestión o por orden? (P2) | R33 |
| Tienda frente a grupo | R16, R17 |
| Alcance de los grupos | R16, R19, R20 |
| Grupo para pagar al mensajero | R19, R21 |
| Valor propio del mensajero (SLT-55) frente a grupo | R6, R19 |
| ¿Qué es «sin tarifa»? | R23 |
| Convivencia hasta SLT-53 | R36, R37 |
| Un distrito en varios grupos | R11 |
| ¿Tope de intentos aquí? | R33 (cada gestión se paga, sin tope; el tope es SLT-77) |
| Sin tarifa: efecto | R24, R25 |
| Un solo cálculo | R38 |
| Congelado | R40, R41, R42, R43 |
| Zona que cobra y zona que paga | R16, R19 |
| Quién escribe | R13 |
| GAM | R35 |
| Dinero e IVA | R26, R29, R30 |
| E2E | R36 (E2E de cierre, wallet y satélite en verde), R16-R22 (contraprueba en Postgres) |
| Fulfillment con IVA (2026-11-02 21:00) | R46, R47, R40 (el % de IVA del fulfillment ya se congela en el cierre) |
| Traza del valor usado en el cobro por rechazo (2026-11-02 21:00) | R48, R49, R50 |
| «Sin tarifa» = sin flete por entregado (2026-11-02 21:00) | R51, R25 |
| Base del % del pago = lo cobrado a la tienda por esa gestión (2026-11-03) | R28, R52, R53, R54, R55 |
| R55 por construcción, sin abortar (2026-11-03) | R55 |

## Preguntas abiertas

P1-P4, abiertas por `spec_author` al diseñar, las cerró Carlos el 2026-11-02 (ver tabla).

- **P5 (2026-11-03, cerrada: opción (a), ver tabla).** ¿Cómo se PUBLICA el IVA del fulfillment en la API por key? Hoy el
  contrato (`docs/api/api-key-openapi.yaml`) tiene un solo campo `fulfillment` («monto fijo…,
  crudo») en la cotización, en la carga (`costoEnvio` + `fulfillment`) y en `costoEstimado` /
  `costoReal` de la lectura («exactamente cinco cadenas»). Opciones: (a) campo NUEVO `ivaFulfillment`
  junto a `fulfillment`, igual que `flete`/`iva` y `comision`/`ivaComision` (`"0.00"` en el modelo
  viejo; aditivo, pero rompe a quien valide «exactamente cinco»); (b) `fulfillment` pasa a llevar su
  IVA dentro (sin campo nuevo; cambia el significado de «crudo»). Propuesta de `spec_author`: (a).
  R46 no depende de la respuesta (el total y `costoEnvio` llevan el IVA en los dos casos); la task
  T4.8 sí, y queda bloqueada hasta que Carlos elija. Lo mismo aplica al detalle del cierre de
  administración, que muestra `fulfillment` (T5.3).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-02 | Base del «% del flete» | El flete de la orden cobrado a la tienda, sin IVA. |
| 2026-11-02 | Base del % del pago cuando la gestión no es entrega (P1) | El flete que se cobra a la tienda por ESA gestión según su resultado, con los valores vigentes en el cierre donde cae, y congelado ahí. Carlos: «no es que días después modifiquemos dineros… la gestión debe ser coherente siempre con el estado de la gestión». Si a la tienda no se le cobra nada por ese resultado, el % da 0. |
| 2026-11-02 | Grupo frente a vehículo en el pago (P2) | Gana el grupo: grupo por vehículo > grupo > zona por vehículo > zona. |
| 2026-11-02 | ¿Fulfillment en el cierre y las wallets? (P3) | No en esta ficha: se mantiene la frontera de hoy. |
| 2026-11-02 | IVA del pago al mensajero y a la satélite (P4) | No llevan IVA. Solo los cobros a la tienda llevan IVA. |
| 2026-11-03 | Cómo se publica el IVA del fulfillment en la API por key (P5) | Opción (a): campo nuevo `ivaFulfillment` junto a `fulfillment` (`"0.00"` en el modelo viejo), anotado en `docs/api/CHANGELOG.md`. Carlos aprobó el spec con (a). |
| 2026-11-02 | ¿Monto o %, quién decide? | La empresa, concepto por concepto. |
| 2026-11-02 | Base de un concepto en % | La fija la app por concepto: cobro a tienda → valor del pedido (recaudo); pago a mensajero o satélite → flete de la orden sin IVA. |
| 2026-11-02 | Cobro a la tienda | Flete por resultado de la gestión (hoy «flete» y «flete devuelto» son dos casos) + fulfillment + comisión COD. |
| 2026-11-02 | Pago al mensajero | Por cualquier resultado que la empresa configure (entregado, reprogramado, novedad, devolución por rechazo, incidente). |
| 2026-11-02 | Pago a la satélite | Mismo esquema que el mensajero; varios conceptos a la vez (p. ej. 2.000 por entrega + 1.500 por rechazo). Carlos: «súper configurable, la empresa decide por qué concepto pagarle». |
| 2026-11-02 | ¿La satélite cobra distinto por vehículo? (P1) | Lo decide cada empresa, como en el mensajero: por defecto un valor para todos los vehículos; la empresa puede activar valores por vehículo. |
| 2026-11-02 | ¿Pagos a la satélite que no dependan de un resultado? (P1) | No en esta ficha: todo pago sale de un resultado de gestión. Los incentivos aparte son un movimiento manual de wallet → SLT-78 (espejo de SLT-68). |
| 2026-11-02 | ¿Pago por gestión o por orden? (P2) | Por gestión. Cada gestión está atada a su mensajero y se paga en SU cierre con lo que la empresa tenga configurado entonces; el siguiente intento cae en otro cierre, quizá con otro mensajero, y se paga aparte. Igual para la satélite. |
| 2026-11-02 | Tienda frente a grupo | Gana la tienda. Puede pactar por zona y por grupo; si no pactó el grupo, se usa su precio de zona. |
| 2026-11-02 | Alcance de los grupos | Afectan al cobro a la tienda, al pago al mensajero y al pago a la satélite. |
| 2026-11-02 | Grupo para pagar al mensajero | Se busca el distrito de la orden en los grupos de la zona DEL MENSAJERO; si no está, se usa el valor base de esa zona. |
| 2026-11-02 | Valor propio del mensajero (SLT-55) frente a grupo | Gana el del mensajero, también sobre los grupos. |
| 2026-11-02 | ¿Qué es «sin tarifa»? | Que nadie haya configurado el valor en ningún nivel. Un 0 escrito vale 0 y NO es «sin tarifa». |
| 2026-11-02 | Convivencia hasta SLT-53 | Si la empresa no tiene valores en el modelo nuevo, se calcula con el viejo. SLT-57 quita ese respaldo. |
| 2026-11-02 | Un distrito en varios grupos | Un distrito está en a lo sumo un grupo por zona (misma regla que SLT-75 para zonas). |
| 2026-11-02 | ¿Tope de intentos aquí? | No: ficha aparte SLT-77. |
| heredado | Sin tarifa: efecto | El cierre registra 0 y no bloquea; la API por key responde 409 (274 R39). |
| heredado | Un solo cálculo | Un resolver para listado, cierre, API y cotización (274 R8/R21). |
| heredado | Congelado | Snapshot en `cierre_detail` y `gestion_orden`, ampliado a los conceptos nuevos (274 R22-R24). |
| heredado | Zona que cobra y zona que paga | Se cobra con la zona de la orden; se paga con la zona del mensajero (39, 415). |
| heredado | Quién escribe | Solo `maestro`; `admin` lee (`TarifaService`, D4). |
| heredado | GAM | Desaparece del cálculo; la marca queda como «zona de bodega principal» (SLT-51). |
| heredado | Dinero e IVA | `Decimal`, nunca `float`; IVA aparte en la wallet (SL-39). |
| heredado | E2E | Sin E2E propio: no hay pantalla (va en SLT-54). Los E2E de cierre, wallet y satélite siguen en verde; contraprueba del resolver en Postgres real. |
| 2026-11-02 21:00 | ¿El fulfillment del modelo nuevo lleva IVA? | Sí, como todo cobro a la tienda (Carlos, tras T4). Los pagos al mensajero y a la satélite siguen sin IVA (P4). |
| 2026-11-02 21:00 | ¿Se guarda qué `tarifa_valor` produjo el cobro por rechazo? | Sí: columna nueva + migración de esquema (Carlos, tras T4). |
| 2026-11-02 21:00 | ¿«Sin tarifa» si solo hay comisión o fulfillment? | Confirmado: «sin tarifa» = sin flete por entregado, aunque haya comisión o fulfillment (Carlos, tras T4). |
| 2026-11-03 | ¿De dónde sale la base del % del pago cuando el cobro a la tienda está congelado (398, 477, creación del cierre)? | Carlos: «la base del % del pago es siempre lo que se le cobra a la tienda por esa gestión». Si la tienda se cobra con lo congelado en el cierre, la base sale de ese mismo congelado, nunca del valor vivo. |
| 2026-11-03 | Aprobación de R52-R55 | Carlos aprobó R52-R55; R55 por construcción, sin abortar: la base se calcula en la tx de creación desde el cobro que ese cierre congela. |
