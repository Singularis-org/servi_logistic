# SLT-52 — tarifas-flexibles-modelo · requirements.md

> Zona: backend · Complejidad: high · depends_on: — · Rama: feature/SLT-52-tarifas-flexibles-modelo
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Modelo de datos nuevo de tarifas y un único resolver. La app trae la lista fija de
> conceptos por actor: a la TIENDA se le cobra flete por cada resultado de la gestión, fulfillment
> y comisión COD; al MENSAJERO y a la SATÉLITE se les paga por cada resultado que la empresa
> configure. Cada concepto lleva monto o % (lo elige la empresa) y su IVA. Los valores viven por
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
nivel: modo (monto o %), valor y % de IVA. *Grupo*: conjunto de distritos de UNA zona con valores
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
  empresa eligió para ese concepto (monto o porcentaje), el valor y su porcentaje de IVA.
- **R4.** SI un valor es negativo, o es un porcentaje mayor que 100, o su IVA está fuera de 0 a 100,
  ENTONCES el sistema DEBE rechazarlo con error de validación sin escribir nada, y la base DEBE
  rechazarlo también cuando llega por debajo de la aplicación.
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
  para todos (el orden entre grupo y vehículo depende de P2).
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
  en el medio; y su IVA como el importe ya redondeado por el % de IVA, redondeado igual. Toda la
  aritmética DEBE ser decimal exacta y la salida texto con 2 decimales.
- **R27.** El sistema DEBE usar como base de un concepto de cobro a la tienda en porcentaje el valor
  del pedido de la orden (lo que se cobra contra entrega; sin valor, 0).
- **R28.** El sistema DEBE usar como base de un pago al mensajero o a la satélite en porcentaje el
  flete de la orden cobrado a la tienda, sin IVA (qué flete, cuando la gestión no es una entrega,
  depende de P1).
- **R29.** CUANDO una gestión tiene resultado X, el sistema DEBE cobrar a la tienda el flete por X y
  su IVA; el flete por entregado DEBE contar como flete descontable de lo recaudado y el de
  cualquier otro resultado como flete no descontable (el que hoy se llama «flete devuelto»).
- **R30.** El sistema DEBE cobrar la comisión COD y su IVA solo en las gestiones entregadas de
  órdenes que cobran comisión.
- **R31.** El sistema DEBE resolver el fulfillment con la misma precedencia que el resto del cobro a
  la tienda y usarlo donde hoy se usa (costo y cotización de la API, congelado en el cierre), sin
  sumarlo a la liquidación del cierre ni a las wallets (depende de P3).
- **R32.** CUANDO una gestión tiene resultado X, el sistema DEBE pagar al mensajero el concepto «pago
  por X» y a la satélite su concepto «pago por X», cada uno con su IVA aparte; una satélite DEBE
  poder tener a la vez valores para varios resultados.
- **R33.** El sistema DEBE pagar cada gestión en el cierre al que pertenece, con los valores
  vigentes al congelar ese cierre, aunque la misma orden tenga otros intentos en otros cierres.
- **R34.** El sistema DEBE dejar el pago al mensajero y el pago a la satélite de cada gestión sin
  IVA en sus columnas de siempre, y DEBE guardar su IVA aparte, sin sumarlo al devengo del
  mensajero ni al ingreso de la satélite (depende de P4).
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
  resuelto (lo mismo, más la base y el importe), junto con el modelo que se usó.
- **R41.** SI un valor o un grupo cambia, o se borra, después de congelar un cierre, ENTONCES el
  sistema NO DEBE cambiar ningún importe de ese cierre en su detalle, su aprobación ni las wallets.
- **R42.** SI el cierre se congeló antes de esta ficha o con el modelo viejo, ENTONCES el sistema
  DEBE leerlo exactamente como hoy.
- **R43.** SI alguien intenta modificar o borrar lo congelado de un cierre con el rol de la
  aplicación, ENTONCES la base DEBE rechazarlo.

### Migración

- **R44.** El sistema DEBE crear el modelo nuevo con migraciones de esquema que no muevan, cambien
  ni borren ninguna fila existente, cada una con su `down.sql` que la revierte.

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| Base del «% del flete» | R28 |
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
| Dinero e IVA | R26, R34 |
| E2E | R36 (E2E de cierre, wallet y satélite en verde), R16-R22 (contraprueba en Postgres) |

## Preguntas abiertas

Abiertas por `spec_author` el 2026-11-02 al diseñar. Cada una dice qué propone el spec; el
humano la cierra al aprobarlo y la respuesta pasa a la tabla de decisiones.

- **P1. Base del % del pago cuando la gestión no es una entrega** (R28). Si al mensajero se le paga
  un 10 % «del flete» por un rechazo, ¿la base es el flete que se le cobra a la tienda por ESE
  rechazo, o el flete por entregado de la orden? Con la primera, si la empresa no le cobra nada a
  la tienda por un reprogramado, el % de un reprogramado da 0. *Propuesta del spec:* el flete de
  esa misma gestión (su resultado).
- **P2. Grupo frente a vehículo en el pago** (R19, R20). Zona base: moto 1.500 y carro 2.000;
  grupo «lejano»: 2.500 sin vehículo. Un mensajero en carro entrega en «lejano»: ¿2.500 (gana el
  grupo) o 2.000 (gana el vehículo)? *Propuesta del spec:* gana el grupo (grupo por vehículo >
  grupo > zona por vehículo > zona).
- **P3. Fulfillment en la liquidación** (R31). Hoy el fulfillment se congela y se muestra, y se
  cobra en el costo de la API, pero no entra en el cierre ni en las wallets. «Se le cobra a la
  tienda» ¿significa que ahora entra en la liquidación? Si entra: ¿por orden o por gestión, y con
  qué resultado? *Propuesta del spec:* esta ficha mantiene la frontera de hoy; meterlo es otra
  ficha.
- **P4. IVA del pago al mensajero y a la satélite** (R34). Cada concepto lleva su IVA, también los
  de pago. ¿Ese IVA se le paga al mensajero o a la satélite encima del pago (entra en su devengo),
  o es solo informativo? *Propuesta del spec:* se calcula y se congela aparte, sin entrar en el
  devengo ni en la wallet hasta decidirlo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-02 | Base del «% del flete» | El flete de la orden cobrado a la tienda, sin IVA. |
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
