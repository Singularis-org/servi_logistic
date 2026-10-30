---
titulo: Wallet · Caja
modulo: wallet
pantalla: /wallet
roles: [maestro, admin]
actualizado: 2026-10-30
fuentes:
  - app/(app)/wallet/_components/WalletModule.tsx
  - app/(app)/wallet/_components/CajaResumenCard.tsx
  - app/(app)/wallet/_components/BarraComposicionCaja.tsx
  - app/(app)/wallet/_components/ComposicionGananciaCard.tsx
  - app/(app)/wallet/_components/WalletLedger.tsx
  - app/(app)/wallet/_components/wallet-filtros-input.ts
  - app/(app)/wallet/_components/LibroCajaBarra.tsx
  - app/(app)/wallet/_components/libro-caja-filtros.ts
  - components/shared/wallet/zonas-filtros-labels.ts
  - app/(app)/wallet/_components/a-quien-selector.ts
  - app/(app)/wallet/_components/libro-caja-labels.ts
  - lib/actions/wallet-filtros.ts
  - lib/actions/libro-caja-autoria.ts
  - lib/actions/deuda-plataforma.ts
  - lib/utils/deuda-plataforma.ts
  - lib/services/TopePagoPlataformaService.ts
  - lib/actions/wallet-egresos.ts
  - app/(app)/wallet/_components/VerMovimientoCaja.tsx
  - components/shared/wallet/RegistrarMovimientoDialog.tsx
  - components/shared/wallet/AsiQueda.tsx
  - components/shared/wallet/DetalleMovimientoPanel.tsx
  - components/shared/wallet/AnularMovimientoDialog.tsx
  - components/shared/wallet/registrar-movimiento-labels.ts
  - app/(app)/wallet/_components/wallet-conceptos-manuales.ts
  - app/(app)/wallet/_components/wallet-labels.ts
  - app/(app)/wallet/_components/GastosFijosPlantillasPanel.tsx
  - app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts
  - lib/services/PagoPorCuentaTiendaService.ts
  - lib/services/AporteCapitalService.ts
  - lib/services/CobroTiendaService.ts
  - lib/services/CajaCobroTiendaFeedService.ts
  - lib/services/AjusteCajaService.ts
  - lib/services/AbonoTiendaService.ts
  - lib/services/RechazoTiendaCobroService.ts
  - lib/services/EgresoCajaAnulacionService.ts
  - lib/actions/wallet-anulacion.ts
  - lib/utils/descripcion-abono.ts
  - lib/actions/abono-tienda.ts
  - lib/utils/descripcion-pago-por-cuenta.ts
  - lib/utils/descripcion-cobro-tienda.ts
  - lib/utils/caja-tesoreria.ts
  - lib/utils/comprobante.ts
  - lib/types/wallet.ts
  - lib/actions/incentivo-mensajero.ts
  - lib/services/IncentivoMensajeroService.ts
---

# Wallet · Caja

**La caja de la empresa**: todo lo que entra y todo lo que sale. Es la pantalla del dinero de la empresa,
no del de las tiendas ni del de los mensajeros —esos tienen la suya—.

## Qué vas a ver

**El resumen de caja**, arriba: la cifra grande, lo que **entró** y lo que **salió**, la **ganancia de
la empresa**, el **saldo inicial y aportes**, el **IVA cobrado**, **lo que la empresa les debe a las
tiendas** y **lo que la empresa debe a la plataforma**.

**Cómo se compone la ganancia**, desglosada por concepto, para ver de dónde sale de verdad el margen —
fletes, comisiones, lo que la empresa les cobra a las tiendas— y no solo el total. El IVA va aparte, en
su propio bloque: no es ganancia.

**El desglose de egresos**, del otro lado.

**El libro**: la lista de movimientos, uno por línea (ver «Las columnas del libro», más abajo). Cada
fila tiene un botón **Ver** que abre su detalle. Una fila anulada dice **Anulado** y se ve **tachada**.

## Las columnas del libro

| Columna | Qué dice |
| --- | --- |
| **Fecha** | El día del movimiento, en hora de Costa Rica |
| **Movimiento y motivo** | El concepto, dicho desde la empresa; debajo, de dónde nace (con la tienda, el mensajero o el cierre) y el motivo que se escribió |
| **A quién** | La tienda, el mensajero, la persona o el proveedor del movimiento. Si es una tienda o un mensajero, el nombre lleva a su estado de cuenta. **La empresa** en un aporte, y **—** en un movimiento viejo que no lo anotaba |
| **Monto** | **Entra** o **Sale**, el importe y de quién es el dinero: **La empresa**, **Tienda** u **La empresa (capital)** |
| **Registró** | Quién lo registró o, si no lo tecleó nadie, **Automático** y qué lo produjo: «Automático · Aprobación del cierre por Ana», «Automático · Plantilla de gasto fijo» |
| **Ver** | Abre el detalle del movimiento. En una fila anulada, al lado dice **Anulado** |

Mientras se lee, **A quién** y **Registró** dicen «Cargando…»; si no se pudieron leer, dicen **«No se
pudo leer»** (no «—», que significaría que no hay dato).

## Los nombres: siempre desde la empresa, y diciendo quién le paga a quién

Cada concepto del libro se lee desde la empresa y dice quién le paga a quién. Los que más se ven:

| En la caja dice | Qué es |
| --- | --- |
| **Flete cobrado a la tienda**, **Comisión de contra-entrega cobrada a la tienda**, **IVA del flete cobrado a la tienda**… | El servicio, cobrado a cada tienda al aprobarse un cierre |
| **Contra-entrega cobrado a los clientes de la tienda** | Lo que el mensajero cobró a los clientes en nombre de la tienda. Es dinero de la tienda |
| **La empresa le cobra a una tienda** | Un cobro que la oficina le hace a mano a una tienda. Es ganancia de la empresa |
| **Cobro a una tienda anulado** | La anulación de ese cobro |
| **La empresa le paga a una tienda** / **Pago a una tienda anulado** | Lo que se le paga a una tienda de su saldo, y su anulación |
| **La empresa paga un gasto de una tienda** / **Pago de un gasto de una tienda anulado** | Lo que la empresa le pagó a un tercero en nombre de la tienda, y su anulación |
| **La empresa le paga a un mensajero** | El pago al mensajero |
| **Sueldo**, **Gasto de la empresa**, **Gasto fijo de la empresa** | Lo que la empresa gasta |
| **Pago a la plataforma** | Lo que la empresa le paga a la plataforma por el cobro de sus órdenes. Baja la deuda con la plataforma y la ganancia |
| **Corrección de caja (suma)** / **Corrección de caja (resta)** | Una corrección hecha a mano para cuadrar la caja |
| **Aporte de dinero a la caja** / **Aporte de dinero a la caja anulado** | El saldo inicial o un aporte de la empresa, y su anulación |
| **Una tienda le paga a la empresa** / **Pago de una tienda a la empresa anulado** | Lo que una tienda con saldo en contra le paga a la empresa, y su anulación. Es dinero de la tienda: sube lo que la empresa les debe a las tiendas |
| **Flete por devolución a origen cobrado a la tienda** / **Flete por devolución a origen cobrado a la tienda anulado** | El flete que la empresa le cobra a una tienda cuando su cliente rechaza el pedido, y su anulación. El IVA va en su propia línea, con su propia anulación |
| **Indemnización que la empresa paga por un incidente** | Lo que la empresa paga cuando un envío sufre un incidente. Si se anula, aparece una **Corrección de caja (suma)** por el mismo monto |

Debajo del concepto, en **Movimiento y motivo**, se dice de dónde nace cada línea con el mismo criterio: **Cierre del día**,
**Registrado a mano**, **Gasto o sueldo registrado a mano**, **Pago de la empresa a una tienda**, **Pago de
un gasto de una tienda**, **Cobro de la empresa a una tienda**, **Pago de una tienda a la empresa**…

## La cifra grande: «Flujo de dinero registrado» o «Dinero en caja»

La cifra grande es siempre la misma cuenta —**lo que entró menos lo que salió**—, pero **cambia de
nombre** según lo que la app sabe:

| La tarjeta dice | Cuándo | Qué significa |
| --- | --- | --- |
| **Flujo de dinero registrado** | No hay un saldo inicial registrado | Lo que entró menos lo que salió **desde el primer movimiento de la caja**. La tarjeta dice desde qué día cuenta |
| **Dinero en caja** | Alguien registró un saldo inicial | El saldo inicial más lo que entró menos lo que salió desde entonces |
| **Movimiento neto del periodo** | Elegiste un **periodo** o un **A quién** en la barra del libro | Lo que entró menos lo que salió **en lo que elegiste**. No es el dinero que hay hoy. Entra/Sale, Concepto, el buscador y el orden no la cambian |

> **«Flujo de dinero registrado» no es el saldo del banco.** La app no sabe con cuánto dinero empezó
> la empresa: solo cuenta lo que se registró desde que se empezó a usar. Por eso, mientras no haya un
> saldo inicial, la tarjeta no usa las palabras «Dinero en caja» y no pinta la barra de reparto.

### Por qué el flujo puede salir negativo

Si la tarjeta dice **Flujo de dinero registrado** y la cifra es negativa, **no es un error**: parte de
los pagos se hicieron con dinero que la empresa ya tenía **antes** de usar la app, y ese dinero no está
registrado. La salida sí quedó anotada; la plata con la que se pagó, no. La tarjeta lo dice con una
línea debajo de la cifra.

Si en cambio la tarjeta dice **Dinero en caja** y sale negativa, **sí hay algo que revisar**: el dinero
en caja no puede ser negativo. Revisá el saldo inicial y los pagos registrados.

### Lo que la empresa les debe a las tiendas

Es la **suma de los saldos de todas las tiendas**, ya descontados el flete, la comisión, el impuesto y
**lo que la empresa les cobró**. Si sale negativa, la tarjeta lo dice en palabras: son **las tiendas las
que le deben a la empresa**, y cuánto. El detalle de cada tienda está en **Wallet · Tiendas** («Ver la
deuda de cada tienda»).

### La barra de reparto

Solo aparece cuando hay un saldo inicial registrado (la cifra dice **Dinero en caja**). Parte el
dinero en **De las tiendas** y **De la empresa** (ganancia, IVA cobrado y aportes). Si uno de los dos está en
negativo, la barra no se parte y en su lugar te dice qué pasa.

## La ganancia de la empresa no incluye el IVA

El IVA que se les cobra a las tiendas sobre el flete y la comisión **no es ganancia**. Por eso el
resumen y la composición lo cuentan aparte:

- **Ganancia de la empresa** es lo que la empresa gana menos lo que gasta, **sin el IVA**.
  **Ingresos de la empresa** y **Gastos de la empresa**, debajo, tampoco lo llevan.
- En el lado de la empresa del resumen hay una región propia, **IVA cobrado**, entre la ganancia y
  **Saldo inicial y aportes**. Lleva el importe, su signo y la pista «IVA que se les cobró a las
  tiendas sobre el flete y la comisión. No es ganancia.».
- En la tarjeta **Cómo se compone la ganancia de la empresa**, el IVA no está en **Ingresos** ni en
  **Egresos**: va en el bloque **IVA cobrado (aparte de la ganancia)**, debajo de las dos columnas, con
  una fila por cada tipo de IVA y el **Total del IVA**. Cada fila abre su detalle de movimientos, como
  las demás. El total de **Ingresos** coincide con **Ingresos de la empresa**, el de **Egresos** con
  **Gastos de la empresa**, y el pie dice la ganancia sin IVA.

El IVA sigue siendo dinero de la empresa que está en la caja: la cifra grande lo cuenta igual que antes.

Lo mismo en el detalle de un cierre, en **Cierres**: **Lo que le queda a la empresa** sale sin el IVA,
y la cuenta lo muestra en su propia línea, **IVA facturado**.

## Lo que la empresa debe a la plataforma

La plataforma cobra a la empresa un monto fijo por cada orden. En el lado de la empresa del resumen,
debajo de **Saldo inicial y aportes**, hay una región propia que dice cuánto se debe y qué hacer. Cambia
según cómo esté la empresa con la plataforma:

| Cómo está | Qué dice la región | Botón |
| --- | --- | --- |
| **Debe** | **Lo que la empresa debe a la plataforma**, con lo que se debe y la pista «Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.» | **Registrar pago a la plataforma** |
| **Al día** | **Lo que la empresa debe a la plataforma**, en cero, con la pista «La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí.» | — |
| **A favor** | **Saldo a favor de la empresa con la plataforma**, con lo que tiene a favor y la pista «La empresa pagó más de lo que hoy debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.» | — |

- **Qué cuenta.** Cada orden que se crea, por la pantalla, por la carga masiva o por la API, suma lo
  que cobraba la plataforma por orden **el día en que se creó**. Si después cambia ese monto, las
  órdenes que ya existían no cambian. Una orden **eliminada** resta lo mismo que había sumado, y si se
  recupera vuelve a sumar. Una orden que la tienda cancela por la API y vuelve a la tienda **sigue
  contando**: no se eliminó.
- **Es de toda la historia.** La cifra no depende del periodo ni de nada de la barra del libro: cambiar
  los filtros mueve las cifras de la caja, pero esta no.
- **Lo ya pagado se descuenta.** Lo que se debe es lo que suman las órdenes, menos las eliminadas, menos
  los pagos registrados que no se anularon.
- **La deuda sola no cambia la caja.** Mientras no se paga, no es dinero que haya salido: la cifra grande,
  **Entró**, **Salió**, la ganancia, el IVA, la barra de reparto y **Cómo se compone la ganancia de la
  empresa** quedan igual que si no existiera. Por eso no lleva insignia ni color de signo.

### Pagarle a la plataforma

El pago se hace **por fuera de la app** (una transferencia, por ejemplo), y aquí se **registra**. Pulsá
**Registrar pago a la plataforma** en la región: se abre **Registrar un movimiento** con el concepto
**Pago a la plataforma** ya elegido. También se puede elegir desde **Registrar un movimiento**, en **Sale
dinero de la empresa**.

- **Se pide** el monto, la fecha, la **referencia del pago** y, si lo tenés, un comprobante. No se pide a
  quién: es la plataforma.
- **Qué le pasa a la caja.** Es dinero de la empresa que sale: la cifra grande baja en el monto,
  **Salió** sube en el monto y **la ganancia de la empresa baja** en el monto, como con un sueldo. **Lo que
  la empresa les debe a las tiendas**, el **saldo inicial y aportes** y el IVA no cambian.
- **La deuda baja** en el monto, y la región lo dice en cuanto se registra, sin recargar la página.
- En el libro sale como **Pago a la plataforma**, con dueño **La empresa**, y en **Cómo se compone la
  ganancia de la empresa** tiene su propia fila en **Egresos**.

**No se puede pagar de más.** El pago no puede superar lo que la empresa debe en ese momento, y sin
deuda no se registra. Si te pasás, el diálogo dice bajo el monto «El pago no puede ser mayor que lo que
la empresa debe a la plataforma.» y no registra nada.

**Cuándo aparece el saldo a favor.** Solo de una forma: si, después de pagar, se eliminan órdenes que ya
estaban pagadas. Lo que esas órdenes habían sumado se resta, y la empresa queda con dinero a favor, que
se descuenta de los cobros de las órdenes que vengan.

**Si un pago se registró mal**, no se edita: se anula desde su fila del libro (**Ver** y luego
**Anular…**), con un motivo, y se registra otro. Al anularlo, la deuda vuelve a subir en el monto y la
caja y la ganancia también. Se puede anular aunque la empresa esté al día o a favor.

## De dónde entra el dinero solo

La mayoría de los movimientos **no los teclea nadie**: entran cuando se aprueba el cierre de un
mensajero. En ese momento se registra lo recaudado, los fletes, las comisiones y lo que se le paga al
mensajero, todo de una vez.

Por eso la caja va al ritmo de los cierres, no de las entregas: una entrega de hoy aparece cuando su
cierre se apruebe.

## Lo que sí se registra a mano

**Registrar un movimiento** abre un diálogo con **once conceptos en tres grupos**, a la izquierda; a la
derecha, los campos del concepto que elegiste. Al elegir uno, el diálogo dice con una frase qué le pasa
al dinero de la empresa, al saldo de la cuenta (si la toca) y a la ganancia, y con qué nombre va a salir en
cada libro.

| Grupo | Conceptos |
| --- | --- |
| **Sale dinero de la empresa** | Gasto de la empresa · Sueldo · La empresa paga un gasto de una tienda · Corrección de caja (resta) · La empresa le paga a una tienda · La empresa le paga a un mensajero · La empresa le da un incentivo a un mensajero · Pago a la plataforma |
| **Llega dinero a la caja** | Aporte de dinero a la caja · Una tienda le paga a la empresa · Corrección de caja (suma) |
| **Se descuenta del saldo de una tienda** | La empresa le cobra a una tienda |

Los gastos fijos no están en la lista: se cobran solos desde sus plantillas, y el diálogo tiene un
enlace a ellas.

**Lo que se pide.** En **todos** los conceptos, **el monto**, **la fecha** y **el motivo**, y un
**comprobante opcional** (el incentivo a un mensajero no lo pide). Además, cada concepto pide lo suyo:

- **Sueldo** y **Gasto de la empresa**: **a quién se le pagó** —la persona o el proveedor, con su nombre
  libre—. **Es obligatorio.** La referencia es opcional.
- **Corrección de caja**: **a quién**, si lo sabés (opcional), y la referencia, también opcional.
- **Pago a la plataforma**: la **referencia del pago**, en lugar del motivo. No pide a quién. Más arriba,
  en **Pagarle a la plataforma**, está qué le pasa a la caja y a la deuda.
- **Los conceptos de una tienda o de un mensajero**: la cuenta, que se elige **buscando por su nombre**
  (solo cuentas activas).
- **Los pagos** (a una tienda, a un mensajero, de una tienda a la empresa, y el pago de un gasto de una
  tienda): **el método** —Efectivo, SINPE o Transferencia—; **en SINPE y transferencia la referencia es
  obligatoria**.

**La empresa le paga a una tienda** le entrega a la tienda lo que tiene a su favor: sale dinero de la caja
y baja **lo que la empresa les debe a las tiendas**; la ganancia no cambia. Solo se admite **hasta lo que
la empresa le debe** a esa tienda. **La empresa le paga a un mensajero** reparte el importe entre sus cierres
pendientes y baja lo que la empresa le debe; la caja no cambia con él. **La empresa le da un incentivo a un
mensajero** le reconoce un importe extra con su motivo: sube lo que la empresa le debe, baja la ganancia y
sale en su libro como «Incentivo», sumado a su último cierre aprobado (sin ninguno, no se puede registrar).
Se paga después con «La empresa le paga a un mensajero» y, si hubo un error, se anula desde «Ver» con un motivo.

### «Así queda»: el antes y el después, antes de registrar

Debajo del formulario, en cuanto escribís el monto (y elegís la cuenta, si el concepto la lleva), el
recuadro **Así queda** te dice cómo van a quedar, **antes y después**: el saldo de la cuenta, la cifra
grande de la caja, la **ganancia de la empresa**, **lo que la empresa les debe a las tiendas** y el **saldo
inicial y aportes**. Lo que el concepto no mueve dice **«no cambia»**. Las cifras las calcula el
servidor con la misma cuenta que la tarjeta de arriba.

- Si la tienda **queda con el saldo en contra**, el recuadro lo avisa en palabras, con el saldo y su
  signo, antes de que confirmes.
- Si el monto **supera lo que se puede pagar**, lo dice.
- Si no se pudo calcular, lo dice y **no enseña cifras**: podés registrar igual, el servidor revisa el
  movimiento antes de guardarlo.

Al registrar, el diálogo se cierra, el aviso te dice cómo quedó (el saldo que devolvió el servidor) y el
libro, las tarjetas y la composición se actualizan solos. Si algo no está bien, lo dice **bajo el campo**
y lo que escribiste se queda.

**Gastos fijos.** En vez de teclear el mismo gasto cada mes, se define una plantilla con **cada cuánto
se cobra**, y se puede **activar o desactivar** sin borrarla. Los que quedan pendientes de cobrar
aparecen en su propio panel, **«Cobros de gasto fijo por aprobar»**, y ahí **solo el maestro decide**:
el maestro ve en cada fila **Aprobar** y **Rechazar**; el **admin ve la misma lista, pero sin botones**,
y no puede aprobar ni rechazar ningún cobro de gasto fijo. Si sos admin y hay uno esperando, avisale
al maestro. Mientras nadie decida, ese dinero **no sale** de la caja.

**Cobros por devolución a origen de tienda** tienen también su panel de pendientes.

## La empresa le cobra a una tienda: se descuenta de su saldo y es ganancia

Cuando la empresa le cobra algo a una tienda —material de despacho entregado en la bodega, por ejemplo—
ese cobro **se descuenta del saldo a favor de la tienda** y pasa a ser **ganancia de la empresa**.
**No llega dinero nuevo** a la caja: el dinero ya estaba ahí, guardado para la tienda, y cambia de
dueño. Por eso:

- La **ganancia de la empresa** sube en el monto.
- **Lo que la empresa les debe a las tiendas** baja en el monto, y el saldo de esa tienda también.
- **Entró**, **Salió** y la cifra grande **no cambian**.
- Si la tienda no tiene saldo a favor, **su saldo queda en contra**: le debe ese dinero a la empresa, y
  se cobra cuando la gestión le vuelva a generar dinero a favor. El cobro no se compara contra ningún
  saldo disponible.

En el libro de la caja sale como **La empresa le cobra a una tienda**, con **Entra**, dueño
**La empresa** y origen **Cobro de la empresa a una tienda · la tienda · el motivo**. En **Wallet · Tiendas**
sale como **La empresa le cobra a la tienda**, y la tienda lo lee en su **Mi wallet** como **La empresa te
cobró**.

Se pide **la tienda** (solo tiendas activas), **el monto**, **la fecha** y **el motivo del cobro**. Al
registrarlo, el aviso te dice en cuánto quedó el saldo de la tienda y, si quedó en contra, que la
tienda le debe ese dinero a la empresa.

Algunos cobros antiguos no tenían su línea en la caja: se les añadió al corregir, con el origen
**Cobro de la empresa a una tienda (línea de caja completada al corregir)**. Se leen y se anulan igual
que los demás.

## Una tienda le paga a la empresa: llega dinero de la tienda y su saldo sube

Cuando una tienda está **en contra** —los cargos y los cobros de la empresa superaron lo que se le
recaudó— y le paga a la empresa lo que debe, se registra con **Una tienda le paga a la empresa**. Ese dinero
entra a la caja por el mismo bolsillo por el que habría entrado su contra-entrega: es dinero de la
tienda. Por eso:

- **Entró** y la cifra grande suben en el monto.
- **Lo que la empresa les debe a las tiendas** sube en el monto: la deuda de esa tienda baja.
- La **ganancia de la empresa no cambia**: lo que la tienda debía ya se contó como ganancia al aprobar cada cierre.
- Solo se admite si la tienda tiene **saldo en contra**, y **hasta lo que debe**. Si no debe nada, o si
  el monto supera lo que debe, el diálogo te lo dice bajo el campo y no registra nada.

Se pide **la tienda que paga**, **el monto**, **la fecha real del pago** (puede ser de hace meses; no
puede ser posterior a hoy), **el motivo del pago**, **el método de pago** —Efectivo, SINPE o
Transferencia; **en SINPE y transferencia la referencia es obligatoria**— y, si lo tenés, **un
comprobante** (opcional). Al registrarlo, el aviso te dice en cuánto quedó el saldo de la tienda y, si
sigue en contra, que la tienda todavía le debe ese dinero a la empresa.

En el libro de la caja sale como **Una tienda le paga a la empresa**, con **Entra**, dueño
**Tienda** y origen **Pago de una tienda a la empresa · la tienda · el motivo · el método**. En **Wallet ·
Tiendas** sale como «La tienda le paga a la empresa», y la tienda lo lee en su **Mi wallet** como «Le
pagaste a la empresa».

También se registra desde el desglose de la tienda en **Wallet · Tiendas**, con **Registrar pago de la
tienda a la empresa**: es el mismo formulario, con la tienda ya elegida. Solo aparece cuando la tienda
está en contra.

## La empresa paga un gasto de una tienda, o la empresa le cobra a una tienda: no son lo mismo

> **Elegir el equivocado descuadra la caja.** Los dos bajan el saldo de la tienda, pero solo uno
> registra que salió dinero. Ya pasó: pagos hechos en nombre de una tienda se anotaron como cobros,
> y la caja quedó mostrando dinero que ya se había ido.

La pregunta que decide es una sola: **¿salió dinero de la empresa hacia otra persona?**

| | La empresa paga un gasto de una tienda | La empresa le cobra a una tienda |
| --- | --- | --- |
| **Cuándo se usa** | La empresa **le pagó a un tercero en nombre de la tienda**: su proveedor, su publicidad, su personal | La empresa **le cobra algo** a la tienda y no le paga nada a nadie |
| **La caja** | **Baja: sale dinero** | **No cambia el dinero: pasa del saldo de la tienda a la ganancia de la empresa** |
| **El saldo de la tienda** | Baja en el monto | Baja en el monto |
| **La ganancia de la empresa** | No cambia | **Sube** en el monto |
| **En el libro de la tienda sale como** | «La empresa paga un gasto de la tienda» | «La empresa le cobra a la tienda» |
| **En la caja sale como** | «La empresa paga un gasto de una tienda», con dueño **Tienda** | «La empresa le cobra a una tienda», con dueño **La empresa** |

**Un ejemplo.** La empresa le paga **₡50.000 a Facebook** por la publicidad de una tienda, con dinero de
la empresa.

- Bien registrado, como **La empresa paga un gasto de una tienda**: la caja baja ₡50.000 (esa plata se fue
  a Facebook) y el saldo de la tienda baja ₡50.000 (se lo descontás). Todo cuadra.
- Mal registrado, como **La empresa le cobra a una tienda**: el saldo de la tienda baja igual, pero la caja
  **no registra la salida** y la ganancia sube ₡50.000 que la empresa no ganó. La caja queda mostrando
  ₡50.000 que ya no están.

Y al revés: si le entregaste a la tienda material de despacho en la bodega y se lo cobrás, **no salió
dinero hacia nadie** y ese dinero **es de la empresa**. Eso es **La empresa le cobra a una tienda**.

### Qué pide el pago de un gasto de una tienda

- **La tienda** por la que se paga (solo tiendas activas).
- **A quién se le pagó**: un nombre libre —Facebook, Jet Cargo, el nombre de una persona—.
- **El monto**, **la fecha** y **el motivo del pago**.
- **El método de pago**: Efectivo, SINPE o Transferencia. **En SINPE y transferencia la referencia es
  obligatoria.**
- **Un comprobante**, si lo tenés. Es opcional.

Si la tienda no tiene saldo suficiente, **el pago se registra igual y su saldo queda en contra**: la
tienda le debe ese dinero a la empresa. Al registrarlo, el aviso te dice en cuánto quedó su saldo y si
quedó en contra.

## Aporte de dinero a la caja

Es **dinero de la empresa que entra a la caja y no es ganancia**. Es opcional: si nadie lo registra, la
cifra grande sigue siendo el **Flujo de dinero registrado**. Dentro del concepto se elige qué es:

- **Saldo inicial**: el dinero que la empresa tenía al empezar a usar la app. **Solo puede haber uno.** Su
  fecha no puede ser posterior al día del primer movimiento de la caja. Si hay que cambiarlo, se anula
  el vigente y se registra otro.
- **Aporte**: dinero de la empresa que entra después.

Se piden **qué es** (saldo inicial o aporte), **el monto**, **la fecha**, **el motivo** y, si lo tenés,
**un comprobante**.

> **La app nunca propone una cifra.** El monto lo escribe una persona que sabe cuánto había. El campo
> arranca vacío y no trae ni un ejemplo de importe: si no sabés la cifra real, no lo registres.

Al registrar un saldo inicial, la cifra grande pasa a llamarse **Dinero en caja** y aparece la barra de
reparto. Si se anula, vuelve a **Flujo de dinero registrado**. La ganancia no cambia en ningún caso.

## Ver un movimiento

**Ver**, en cada fila del libro, abre su detalle a un costado: **a quién** (la tienda, el mensajero, la
persona o el proveedor), **por qué** (el motivo), **de dónde sale**, **cómo** se pagó (el método y la
referencia, si los tiene), el **comprobante**, **quién lo registró** —o **Automático** y qué lo produjo,
como «Aprobación del cierre»— y **cuándo**: el día y la hora de Costa Rica en que se tecleó («Ana · el
2026-09-26 a las 21:30»), que puede no ser la fecha del movimiento (un sueldo del 1 registrado el 26), su **estado** (**Vigente**, o **Anulado** con el día, quién lo anuló, el
motivo y cómo se anuló) y **Cómo quedó**: la cifra grande, la ganancia, lo que la empresa les debe a las tiendas y el
saldo inicial y aportes **justo después** de ese movimiento, y el saldo de la cuenta que tocó.

Un **cobro por devolución a origen** dice además en palabras que es un cargo a la tienda: la ganancia sube y el saldo
de la tienda baja, sin dinero nuevo en la caja.

## Anular: con motivo, y sin borrar nada

Un **sueldo**, un **gasto de la empresa**, un **gasto fijo cobrado**, un **pago de un gasto de una tienda**,
un **aporte de dinero a la caja**, un **cobro de la empresa a una tienda**, un **pago de una tienda a
la empresa** o una **corrección de caja** no se editan. Tampoco un **cobro por devolución a origen a una tienda** ni una
**indemnización por un incidente**. Ni un **pago de la empresa a una tienda**, un **pago a la plataforma** o un **premio del ranking**. Si hubo un error, se anulan desde el detalle de su fila: **Ver** y
luego **Anular…**. Es la misma forma para todos:

- **El motivo es obligatorio.** Queda guardado junto a la anulación.
- Se registra **hoy** un **movimiento contrario** por el mismo monto. El registro original, su
  comprobante y su historial **quedan intactos**: no se borra nada.
- La fila original pasa a decir **Anulado** y sale tachada. Una anulación no se deshace.
- Al anular un pago de un gasto de una tienda, la caja y el saldo de la tienda **vuelven a subir** en el
  monto. En el libro de la tienda aparece «Pago de un gasto de la tienda anulado».
- Al anular un cobro de la empresa a una tienda, la **ganancia baja** en el monto, **lo que la empresa les
  debe a las tiendas** y el saldo de la tienda **vuelven a subir**, y **Entró**, **Salió** y la cifra
  grande no cambian. En la caja aparece **Cobro a una tienda anulado**; en el libro de la tienda,
  «Cobro de la empresa a la tienda anulado».
- Al anular un pago de una tienda a la empresa, **Salió** sube en el monto, la cifra grande y **lo que
  la empresa les debe a las tiendas** bajan en el monto —la tienda vuelve a deber— y la ganancia no
  cambia. En la caja aparece **Pago de una tienda a la empresa anulado**; en el libro de la tienda, «Pago
  de la tienda a la empresa anulado».
- Al anular una corrección de caja, aparece la corrección contraria por el mismo monto.
- Al anular un **pago a la plataforma**, aparece una **Corrección de caja (suma)** por el mismo monto: la
  cifra grande, **Entró** y la ganancia vuelven a subir, y **lo que la empresa debe a la plataforma** sube
  en el monto.
- Un **cobro por devolución a origen** tiene dos líneas en la caja, el flete y su IVA: se anula desde **cualquiera de
  las dos** y se anulan **las dos juntas**. La **ganancia baja** en el flete y el **IVA cobrado** en su IVA, **lo que la empresa
  les debe a las tiendas** y el saldo de la tienda **vuelven a subir** en lo mismo (si al cobrarlo se le
  descontó a la tienda), y **Entró**, **Salió** y la cifra grande no cambian. En la caja aparecen
  **Flete por devolución a origen cobrado a la tienda anulado** y **IVA del flete por devolución a origen cobrado a la tienda
  anulado**. En **Analítica**, «Ingreso por flete» e «Ingreso por IVA» descuentan la anulación: el
  **neto** vuelve a ser el de antes del cobro.
- Al anular una **indemnización**, aparece una **Corrección de caja (suma)** por el mismo monto: la
  caja y la ganancia vuelven a subir.

Si te dice **«Ya estaba anulado; no se registró nada más»**, alguien se te adelantó. Si te dice **«Este
movimiento no se puede anular: …»** sobre un cobro, es uno de los cobros antiguos que ya se corrigieron como pago
de un gasto de la tienda, o uno sin su línea en la caja: se explica en el propio aviso.

Al anular un **gasto de la empresa**, un **sueldo** o un **gasto fijo cobrado**, se registra una **Corrección
de caja (suma)** por el mismo monto: la caja y la ganancia vuelven a subir. Los que se revirtieron antes,
sin motivo, se ven **Anulado · motivo no registrado**.

Lo que nace de un cierre, una anulación y las salidas de los cobros reclasificados **no ofrecen
Anular…**: el detalle no tiene el botón.

## El comprobante

- **Opcional.** Imagen JPEG, PNG o WebP, o un PDF, de hasta 4 MB. Un cobro a una tienda no lleva
  comprobante. El pago de una tienda a la empresa sí puede llevarlo.
- Se puede adjuntar **en todos los conceptos** al registrarlos.
- Se guarda **privado**: no tiene un enlace público. **Ver comprobante**, en el detalle de la fila
  (**Ver**), lo abre con un enlace que dura poco. Se nombra por lo que es —«Comprobante de «Sueldo» del
  2026-09-12»—, nunca por el nombre del archivo.
- Si un movimiento no tiene comprobante, en su detalle aparece **Adjuntar comprobante**, **una sola
  vez**: no se reemplaza ni se borra. Un movimiento anulado ya no admite uno.
- Si el comprobante no se pudo guardar, **no se registra nada**: probá de nuevo.

## Las fechas, en hora de Costa Rica

Todas las fechas de esta pantalla son días de Costa Rica: el «desde» de la cifra grande, la fecha de
un pago, de un cobro o de un aporte (**no puede ser posterior a hoy** en Costa Rica) y la de una
anulación, que se fecha **el día en que se anula**. Los movimientos a mano tienen además un límite hacia
atrás: si te pasás, la app te dice el primer día admitido. El aporte y el pago de una tienda a
la empresa no tienen ese límite: llevan la fecha real. Al filtrar por **Periodo**, el primer y el último
día son días completos de Costa Rica.

## Los cobros que eran pagos de un gasto

Algunos cobros antiguos se registraron como cobro cuando en realidad eran pagos hechos en nombre de
una tienda. Se corrigieron añadiendo su salida en la caja: en el libro aparecen como **La empresa paga un
gasto de una tienda** con el origen **Cobro reclasificado como pago de un gasto de la tienda**. Esas
salidas no se anulan desde acá, y la tienda los sigue viendo igual que antes en su libro.

## Buscar en el libro: los filtros

Los filtros están en **una sola barra, encima del libro**, en la misma fila que **Descargar**: el orden,
el buscador y el botón **Filtros**.

- **Más recientes / Más antiguas**: los dos botones con flechas del principio de la barra; el nombre de
  cada uno aparece al pasar el ratón. Se entra en **Más recientes**: lo último, arriba.
- **El buscador**: busca en la descripción, en el nombre o la referencia anotados y en quién registró
  el movimiento, sin distinguir mayúsculas. Escribí **al menos 3 caracteres**; con menos, el campo te
  dice cuántos faltan y no busca.
- **Filtros**: abre una lista de casillas —**Periodo**, **A quién**, **Entra/Sale** y **Concepto**—.
  Marcar una casilla pone su control en la barra, delante del buscador (marcarla sola no filtra nada);
  desmarcarla quita ese filtro.

Lo que hace cada casilla:

- **Periodo**: se eligen el primer y el último día en el calendario (días de Costa Rica) y se aplica
  solo, sin botón. Un solo día también vale.
- **A quién**: se elige de una lista de **las tiendas, los mensajeros y los nombres anotados a mano**
  (el de un sueldo, un gasto o una corrección) que tienen movimientos en el periodo, cada uno con qué es
  y cuántos movimientos tiene: «Tania Tienda · Tienda · 2 movimientos». Podés **buscar por el nombre de
  la tienda, del mensajero o de la persona**, sin mayúsculas ni tildes. Se aplica **al elegirlo**;
  **Todos** lo quita. Si la lista es muy larga, te pide que escribas parte del nombre.
- **Entra/Sale**: lo que entró a la caja o lo que salió. Sin elegir ninguno, dice **Todo**.
- **Concepto**: solo los conceptos con movimientos en el periodo y el «A quién» elegidos (y en Entra o
  Sale, si elegiste uno), cada uno con su número. Sin elegir ninguno, dice **Todos**.

**Periodo** y **A quién** mueven **toda la pantalla**: **las tarjetas de arriba, la composición de la
ganancia, el desglose de egresos, el detalle de cada fila de la composición y el libro cuentan solo el
periodo y el «A quién» elegidos**. Si elegís una tienda en **A quién**, lo que entró y lo que salió son
los movimientos cuyo **A quién** es esa tienda y la cifra grande pasa a llamarse **Movimiento neto del
periodo**. Ojo: el contra-entrega que cobró el mensajero a los clientes de esa tienda nace del cierre y
su **A quién** es el **mensajero**, no la tienda; para verlo, elegí al mensajero.

**Entra/Sale**, **Concepto**, el buscador y el orden **no cambian ninguna cifra**: solo qué filas del
libro se ven y en qué orden. Cualquier cambio vuelve a la primera página. **Limpiar todo** quita el texto
buscado, todos los filtros y todas las casillas (también el periodo y «A quién»); no toca el orden.

Si una lectura falla, la pantalla te lo dice y **se queda con lo que mostraba**: las cifras, el libro y
los filtros que ya estaban puestos, con sus casillas.

Si elegís un **nombre anotado** y alguno de sus sueldos, gastos o correcciones se **anuló**, aparecen las
dos filas —el anulado y su anulación, que también dice ese nombre en **A quién**— y se compensan: un
sueldo anulado no cuenta como dinero que salió.

Y se puede **descargar** el libro, con todos los filtros puestos, el texto buscado y el orden que estás
mirando, y las mismas columnas que la tabla (**A quién** y **Registró** incluidas), para cuadrar fuera.

## Lo que esta pantalla NO hace

- **No muestra lo que le debés a cada tienda.** Eso es **Wallet · Tiendas**.
- **No muestra lo que le debés a cada mensajero.** Eso es **Wallet · Mensajeros**.
- **No es el saldo del banco**, salvo que alguien haya registrado el saldo inicial real.
- **No se editan movimientos.** Un sueldo, un gasto, un pago de un gasto, un aporte, un cobro a una
  tienda, un pago de una tienda a la empresa, una corrección, un cobro por devolución a origen o una indemnización se
  anulan con motivo; los demás son inmutables. Un pago a la plataforma, también.
- **No cobra la plataforma.** El pago a la plataforma se hace por fuera de la app; aquí solo se registra.
- **No se corrigen cifras de entregas.** Un movimiento que nació de un cierre se arregla en el cierre,
  no acá.
