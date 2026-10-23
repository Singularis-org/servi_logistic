# SL-40 «Cobro de la plataforma por orden» — requirements

> Ficha: SL-40 · zona fullstack · depende de SL-17 (aislamiento por empresa) y usa la pantalla
> «Empresas» de SL-32, las dos ya en `dev`. La línea de la wallet encaja en el sitio que dejó SL-39
> (en vuelo).
> Spec escrito el 2026-10-23 por `spec_author`. El archivo no venía sembrado por `/afinar-feature`:
> el alcance y las decisiones salen del encargo del leader con las decisiones de Carlos del mismo día.

## Pedido

Carlos Restrepo, 2026-10-23, por medio del leader: la plataforma cobra a cada empresa un monto fijo
por orden. Hay un valor global y una excepción opcional por empresa, y los dos los configura el
superadmin. Cuentan las órdenes creadas menos las anuladas, por cualquier vía. Por ahora solo se
muestra en la wallet de cada empresa como lo que le debe a la plataforma.

## Alcance

**Entra**

- El valor global del cobro por orden y la excepción por empresa, guardados en el servidor.
- Dónde los edita el superadmin: la pantalla «Empresas» (`/plataforma/empresas`), que ya existe.
- Un cargo por cada orden creada y su reverso cuando la orden se anula, con el importe congelado al
  crearla.
- Una línea en la wallet de la empresa: «Lo que la empresa debe a la plataforma».

**Lo que NO entra**

- Cobrar de verdad: ni pasarela, ni facturas, ni pagos de la empresa a la plataforma, ni saldar la
  deuda. El proveedor de cobro es una decisión pendiente del humano (`docs/plan-saas.md > Lo que
  falta del humano`).
- El IVA u otro impuesto del cobro de la plataforma (P2, abierta).
- Planes y límites (SL-24) y el resto del panel de superadmin (SL-26).
- Que la deuda cambie la caja: no es un movimiento de `wallet_movimiento`, no sale de la caja y no
  cambia ninguna cifra de la caja (D10).
- Ver la deuda de cada empresa desde la pantalla del superadmin. Por ahora solo la ve la empresa en
  su wallet (D4).
- Cobrar las órdenes creadas antes de esta ficha (D8).

## Decisiones cerradas (no reabrir)

| # | Decisión | Origen | Requisitos |
|---|---|---|---|
| D1 | El cobro es un **monto fijo por orden**. | Carlos, 2026-10-23 | R1, R12, R19 |
| D2 | Hay un **valor global de plataforma con excepción opcional por empresa**, y los configura el superadmin. | Carlos, 2026-10-23 | R1–R8 |
| D3 | **Cuentan las órdenes creadas menos las anuladas, por cualquier vía**: pantalla, carga masiva o API. | Carlos, 2026-10-23 | R12, R13, R15, R16 |
| D4 | **Por ahora solo se muestra en la wallet de cada empresa** como lo que debe a la plataforma. No hay cobro real ni pasarela. | Carlos, 2026-10-23 | R21, R27 |
| D5 | La configuración se edita en la pantalla **«Empresas»** que ya existe (SL-32): el valor global arriba y la excepción en cada fila. No hay pantalla nueva, así que no pasa por `/design`. | `spec_author` (`design.md > 9.1`) | R9, R10, R11 |
| D6 | «Anulada» quiere decir **eliminada** (`orden.deleted_at`), por pantalla o por API: es lo único que hoy saca una orden de la operación sin haberla gestionado (`design.md > 1.2`). | `spec_author`, sobre el código | R15 |
| D7 | Una orden anulada **se descuenta en el instante de su anulación**, con un reverso, y el cargo original no se toca. Si después se recupera, vuelve a cargarse por el mismo importe. | `spec_author` (`design.md > 2.3`) | R15, R16, R17 |
| D8 | **Sin cobro retroactivo.** Una orden creada antes de esta ficha no genera cargo, y anularla no genera reverso. La app nace vacía (`docs/plan-saas.md`, decisión 5), así que en producción no hay órdenes anteriores. | `spec_author` | R18 |
| D9 | Los cargos son datos de negocio de cada empresa, con el aislamiento de SL-17. El valor global es de plataforma. | Leader, 2026-10-23 | R20, R24, R28 |
| D10 | La línea es una **deuda** con la plataforma: no es un egreso pagado, no sale de la caja y no cambia ninguna cifra de la caja. | Leader, 2026-10-23 | R22, R27 |
| D11 | Sin valor global ni excepción, la tarifa vigente es **0,00**: el cargo se registra igual, con ese importe. | `spec_author` (`design.md > 2.4`) | R3 |

## Glosario

- **Tarifa vigente de una empresa**: su excepción si la tiene. Si no, el valor global. Si tampoco
  hay valor global, 0,00.
- **Cargo**: el registro de que la empresa debe a la plataforma el importe de una orden.
- **Reverso**: el registro que anula un cargo, por el mismo importe.
- **Orden anulada**: una orden eliminada (`deleted_at` con valor), por la pantalla o por la API.
- **Recuperar**: deshacer la eliminación de una orden (`deleted_at` vuelve a `NULL`).
- **Deuda con la plataforma**: la suma de los cargos de la empresa menos la de sus reversos.

## Requisitos (EARS)

### La configuración

- **R1.** El sistema DEBE guardar un único valor global de cobro por orden, como importe con dos
  decimales y mayor o igual que cero.
- **R2.** El sistema DEBE permitir guardar, para cada empresa, un valor de excepción opcional, con
  las mismas reglas que el valor global.
- **R3.** El sistema DEBE resolver la tarifa vigente de una empresa en este orden: su excepción si
  la tiene, el valor global si no, y 0,00 si no hay ninguno de los dos.
- **R4.** CUANDO el superadmin guarda el valor global o la excepción de una empresa, el sistema DEBE
  validar en el servidor que el importe es un número mayor o igual que cero, con dos decimales como
  máximo y que cabe en `DECIMAL(12,2)`. SI no lo es, ENTONCES el sistema DEBE responder
  `validation_error` con el campo y sin escribir nada.
- **R5.** CUANDO el superadmin quita la excepción de una empresa, el sistema DEBE aplicar el valor
  global a las órdenes que esa empresa cree desde ese momento.
- **R6.** SI quien lee o guarda el valor global o una excepción no es superadmin, ENTONCES el sistema
  DEBE responder `forbidden` antes de consultar la base.
- **R7.** SI el superadmin fija o quita la excepción de una empresa que no existe, ENTONCES el
  sistema DEBE responder `not_found` sin escribir nada.
- **R8.** El sistema DEBE impedir, en la base, que una transacción de empresa (rol `servi_app`)
  escriba el valor global, la excepción de cualquier empresa o un cargo o reverso, aunque lo intente
  con SQL a mano.

### La pantalla «Empresas»

- **R9.** CUANDO el superadmin abre «Empresas», la pantalla DEBE mostrar el valor global vigente, o
  «Sin configurar (0,00)» si no lo hay, con un formulario para cambiarlo.
- **R10.** CUANDO el superadmin abre «Empresas», cada fila del listado DEBE mostrar la tarifa vigente
  de esa empresa y decir si sale de su excepción o del valor global. Cada fila DEBE permitir fijar la
  excepción y quitarla.
- **R11.** CUANDO un guardado tiene éxito, la pantalla DEBE mostrar los valores nuevos sin que el
  superadmin recargue a mano. SI falla, ENTONCES la pantalla DEBE mostrar el error junto al campo, o
  un mensaje genérico sin detalle, y conservar lo escrito.

### Los cargos

- **R12.** CUANDO se crea una orden, venga de la pantalla, de la carga masiva o de la API, el sistema
  DEBE registrar en la misma transacción un cargo a la empresa de la orden por la tarifa vigente de
  esa empresa en ese instante.
- **R13.** SI la transacción que crea una orden no se confirma, ENTONCES el sistema NO DEBE dejar
  ningún cargo de esa orden.
- **R14.** CUANDO cambian el valor global o una excepción, el sistema DEBE mantener el importe de los
  cargos ya registrados tal como se registraron. Solo las órdenes creadas después usan la tarifa
  nueva (P1).
- **R15.** CUANDO se anula una orden que tiene su cargo vigente, por la pantalla o por la API, el
  sistema DEBE registrar en la misma transacción un reverso por el mismo importe del cargo, con el
  instante de la anulación, y sin modificar ni borrar el cargo.
- **R16.** CUANDO se recupera una orden anulada que tenía un reverso, el sistema DEBE registrar un
  cargo nuevo por el mismo importe que el cargo que se revirtió, con el instante de la recuperación.
- **R17.** El sistema DEBE mantener, para cada orden y en todo momento, una deuda de cero o del
  importe de su cargo. Anular una orden ya anulada, recuperar una orden viva o reintentar la misma
  operación NO DEBEN registrar ningún cargo ni reverso.
- **R18.** SI se anula o se recupera una orden que no tiene ningún cargo, porque se creó antes de esta
  ficha, ENTONCES el sistema NO DEBE registrar ni cargo ni reverso.
- **R19.** El sistema DEBE registrar cada cargo por exactamente la tarifa vigente, sin sumarle
  impuestos (P2).
- **R20.** El sistema DEBE registrar el cargo y el reverso de una orden con la empresa de esa orden, y
  NO DEBE permitir que un cargo apunte a una orden de otra empresa.

### La wallet

- **R21.** CUANDO un usuario con acceso total abre `/wallet`, la pantalla DEBE mostrar en el bolsillo
  de la empresa del resumen de la caja una región «Lo que la empresa debe a la plataforma», con la
  deuda con la plataforma y la pista «Lo que la plataforma cobra por cada orden creada, menos las
  anuladas. Todavía no se cobra: no sale de la caja.».
- **R22.** El sistema DEBE mantener los mismos valores, con cargos y sin ellos, en todas las cifras de
  la caja: la cifra principal, «Entró», «Salió», la ganancia, el IVA, «Saldo inicial y aportes», «Lo
  que la empresa les debe a las tiendas», «De la empresa», la barra de reparto y la tarjeta de
  composición.
- **R23.** El sistema DEBE calcular la deuda con todos los cargos y reversos de la empresa desde el
  principio, sin aplicar los filtros del libro (período, a quién, tipo o categoría). Al cambiar esos
  filtros, la cifra de la región NO DEBE cambiar.
- **R24.** MIENTRAS la empresa activa de la petición es A, el sistema DEBE calcular la deuda solo con
  los cargos y reversos de A, aunque otra empresa B tenga los suyos.
- **R25.** SI el actor no tiene acceso total, ENTONCES el sistema DEBE rechazar la lectura de la deuda
  antes de consultar la base.
- **R26.** El sistema DEBE entregar la deuda derivada en el servidor, como texto con dos decimales, y
  la pantalla DEBE pintarla sin sumar, restar ni convertir importes a número.
- **R27.** El sistema DEBE registrar los cargos y los reversos sin escribir ninguna fila en
  `wallet_movimiento`. Las descargas del libro de la caja DEBEN salir con las mismas columnas y los
  mismos saldos que antes de esta ficha.

### Garantías de construcción

- **R28.** El sistema DEBE declarar la tabla de cargos como tabla de negocio, con su política RLS por
  empresa para `servi_app` y sus triggers de misma empresa, de modo que las guardias de SL-17 la
  cubran. SI una de esas piezas falta, ENTONCES el gate DEBE fallar.
- **R29.** CUANDO se aplica el `down.sql` de cada migración de esta ficha, en orden inverso, la base
  DEBE quedar sin las tablas, las columnas, los tipos, las funciones ni los triggers que añadió, y
  crear y anular una orden DEBE seguir funcionando.

## Preguntas abiertas

- **P1 (ABIERTA, para Carlos). ¿Una orden creada antes de un cambio de tarifa se cobra a la tarifa
  vieja?**
  - **Recomendación: sí. El importe se congela al crear la orden** (registro por orden,
    `design.md > 2`). Es lo que la empresa vio vigente cuando la creó, y la deuda de ayer no cambia
    al tocar el precio hoy.
  - La otra opción es contar al vuelo (órdenes vivas × tarifa de hoy). Así, subir la tarifa
    encarecería también las órdenes que ya existen.
  - **Cambia el resultado** en cuanto la tarifa cambia con órdenes ya creadas. Ejemplo: con 100
    órdenes a 500,00 y la tarifa subida a 600,00, la deuda queda en 50.000,00 si se congela y en
    60.000,00 si se cuenta al vuelo.
  - El spec asume la recomendación (R14). Si Carlos elige contar al vuelo, cambian el modelo de datos
    y R12–R18.
- **P2 (ABIERTA, para Carlos). ¿El cobro de la plataforma lleva IVA u otro impuesto?**
  - No hay nada en `docs/` ni en el código que lo diga, y depende del país (SL-21).
  - Hasta que se decida, el cargo es exactamente la tarifa, sin impuestos (R19), y la pantalla no
    habla de impuestos.
  - Si lleva impuesto: ¿se suma a la tarifa o ya va incluido? ¿Con qué tasa, y de dónde sale? La
    respuesta añade un requisito y, como mucho, una columna en el cargo. No hace falta rehacer nada.
- **P3 (ABIERTA, para Carlos). ¿Una orden que la tienda cancela por la API cuenta como anulada?**
  - Hoy esa cancelación (`cancelacion_api`) no elimina la orden: la manda de vuelta a la tienda
    (`devolviendo_a_tienda`) cuando ya está en la bodega central o en camino.
  - **Recomendación: no cuenta como anulada.** La plataforma ya trabajó la orden: se recibió, se
    movió y se devuelve. El spec asume la recomendación (D6).
  - **Cambia el resultado**: cada orden cancelada así sigue debiendo su cargo. Si Carlos dice que sí
    cuenta, se añade un reverso en esa transición, con el mismo mecanismo que R15.
