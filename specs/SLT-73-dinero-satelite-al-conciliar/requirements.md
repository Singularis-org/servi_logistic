# SLT-73 «El dinero de la satélite entra a la wallet de la central solo al conciliar»

> Requisitos en notación EARS. Sin detalles de implementación: el CÓMO vive en `design.md` y el
> desglose en `tasks.md`. Cada `R<n>` termina mapeado a un test (`design.md > Trazabilidad`).
> HOTFIX a producción: rama `hotfix/SLT-73-dinero-satelite-al-conciliar`, nacida de `origin/prod`.

## Alcance

**Problema (prod, 2026-10-31, solo lectura, sin datos personales).** Hay 1 cierre del día satélite
aprobado, ₡76.890 todo SINPE, 0 consolidaciones y 0 conciliaciones. La caja de la central ya tiene 6
movimientos de ese cierre: COD 76.890, flete 7.800, IVA del flete 1.014, comisión COD 2.691,15, IVA
de la comisión 349,85 y egreso por el pago al mensajero 6.000. Y `/wallet/satelites` muestra la
satélite al día, por dos causas: su pendiente es Σ(`total_efectivo` − `monto_recibido`) de las
**consolidaciones**, así que no cuenta los cierres aprobados sin consolidar ni el SINPE.

**Qué cambia.**
1. Cuando se aprueba un cierre del día de la satélite, no entra **nada** a los libros de dinero:
   caja de la central, libro por tienda y libro del pago al mensajero.
2. Ese dinero queda como deuda de la satélite y entra al **conciliar** la consolidación.
3. La deuda cuenta todos los métodos de pago, menos lo que gana la satélite y lo que paga a sus
   mensajeros.
4. La migración saca de esos libros lo que ya se registró de cierres satélite sin conciliar.

**Lo que NO entra.**
- Los cierres con destino `bodega_central`: no cambian.
- El cálculo de los snapshots del cierre (37/39/56/69): no cambia.
- La consolidación (40): no cambia.
- Lo que no es dinero dentro de la aprobación tampoco cambia: transición de estado, montos de
  indemnización capturados en la gestión, liberación de `sin_gestionar`, devoluciones, aplicación
  de gestiones e historial.
- Registrar en la caja la ganancia de la satélite como egreso: hoy no existe, es un hueco de la 56
  y la 393 que sigue igual (Q3).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Cubierta por |
|---|---|---|---|
| D1 | HOTFIX urgente a producción. | Carlos, 2026-10-31 | `tasks.md` (rama desde `prod`) |
| D2 | **Todo** lo de un cierre del día satélite espera a la conciliación para entrar a la wallet de la central: COD, flete, comisión, IVA, pago al mensajero… Nada entra al aprobar. | Carlos, 2026-10-31 | R1, R2, R10 |
| D3 | La deuda de la satélite con la central suma **todos los métodos de pago** (efectivo, SINPE, transferencia). El SINPE de la satélite (ficha 429) es solo el medio por el que ella recibe, y sigue siendo deuda. **Reabre la Q2 de la ficha 431** (saldo sobre `total_efectivo`). | Carlos, 2026-10-31 | R4, R5, R8 |
| D4 | De la deuda **se descuentan** las ganancias de la satélite y lo que ella paga a sus mensajeros. La conciliación debe mostrar lo que le pertenece a la satélite. | Carlos, 2026-10-31 | R4, R9 |
| D5 | Si se recibe menos de lo esperado, entra lo recibido y la diferencia queda como deuda abierta. | Carlos, 2026-10-31 | R5, R11, R13 |
| D6 | Se revierte lo ya registrado en la wallet por cierres satélite sin conciliar, para que entre al conciliar. | Carlos, 2026-10-31 | R16–R20 |
| D7 | La ganancia de la satélite es **el dato que ya existe**: `cierre_dia.total_ingreso_bodega_rechazos`. Ver la nota de abajo. | Carlos, 2026-10-31 | R4, R9 |
| D8 | El **saldo de la tienda también espera** a la conciliación: «hasta que no se concilie el cierre no se puede mostrar dinero, porque es dinero que no se sabe si ya entró o no». Lo mismo vale para el resto de esa transacción, salvo lo que el código muestre que no es dinero. | Carlos, 2026-10-31 | R1, R2, R10, R16 |
| D9 | Se reabre la decisión de la ficha 431 «consolidar/conciliar no mueve dinero» (su R14): conciliar **sí** escribe en los libros. | Carlos, 2026-10-31 | R10, R12 |
| D10 | Q1 = A: al conciliar con menos de lo esperado, los asientos del cierre entran completos y la caja lleva UNA fila «diferencia de la satélite» por esperado − recibido, que queda como deuda abierta. | Carlos, 2026-10-31 | ver Q1 |
| D11 | Q2: una conciliación que ya asentó dinero NO se puede revertir; el monto se arregla con «Corregir» (ajusta la fila de diferencia). | Carlos, 2026-10-31 | ver Q2 |
| D12 | La diferencia de la satélite (D10) NO es ganancia de la empresa ni dinero «De las tiendas»: va a un **bolsillo nuevo de la caja, «Por cobrar a satélites»**. Cuando la satélite paga la diferencia (ingreso), el bolsillo baja. Motivo: clasificada como `terceros` rompe la invariante R8 de la 459 («De las tiendas» = Σ saldos de las tiendas), porque con D10 las tiendas conservan su crédito completo. | Carlos, 2026-10-31 | R24–R30 (enmienda aprobada por Carlos 2026-10-31) |
| D13 | Q6: la barra de composición gana un **tercer tramo, «Por cobrar a satélites»**. No se resta de la empresa. | Carlos, 2026-10-31 | R30 |
| D14 | Q7: el bloque «Por cobrar a satélites» se muestra **siempre**, también con ₡0. | Carlos, 2026-10-31 | R28 |
| D15 | Premios e incentivos no se tocan: los registra una persona después, no la aprobación. T8 los deja en su libro (`premio_ranking`, `incentivo`, filas con `premio_dia`). Carlos había pedido retirarlos y lo revocó al ver ese hallazgo: «entonces no hay que hacer nada con ellos». | Carlos, 2026-10-31 | R16 |
| D16 | Dentro del hotfix se alinean con la deuda nueva (R4/R5) el estado de cuenta de la bodega (458, «Pendiente de llegar») y la tarjeta «Conciliación» de `/cierres-admin`, cuya nota «Desmarcar no mueve dinero» ya es falsa. | Carlos, 2026-10-31 | R31–R35 (enmienda 2) |

**Nota sobre D7: el dato que ya existe.**
- `db/schema.prisma:1598`: `CierreDia.totalIngresoBodegaRechazos`, «snapshot total del ingreso de
  bodega por rechazos» (feature 56). Lo agrega `CierreBodega.totalIngresoBodegaRechazos`
  (`db/schema.prisma:1657`).
- Se calcula por gestión con `ingresoBodegaPorResultado` (`lib/utils/ingreso-bodega.ts:18`), a
  partir de `TarifaZonaMensajero.cobroRechazado` (`db/schema.prisma:1791`).
- La ficha 393 lo llama «lo que gana la satélite por rechazos». Ya lo resta, junto con el pago a
  mensajeros, en `paraLaCentral(totalGeneral, pagoMensajero, ganaBodegaSatelite)`
  (`lib/utils/ingreso-empresa.ts:681-690`), que es «lo que la bodega satélite le entrega a la
  central» (cascada B, `specs/393-cierre-bodega-dos-cascadas/requirements.md:25-48`).
- No hay en el código ninguna otra remuneración de la satélite: se buscó en `db/schema.prisma`,
  `lib/` y `specs/`.

**Qué de la aprobación es dinero (D8).** La aprobación de un cierre escribe en tres libros: la caja,
`wallet_tienda_movimiento` y `pago_mensajero_movimiento`
(`lib/repositories/CierresAdminRepository.ts:1891-1953`). Las escrituras son:
- los ingresos de la 42;
- el libro por tienda de la 43;
- el COD a la caja de la 173;
- el libro y el egreso del pago al mensajero de la 44;
- el egreso de indemnización de la 158.

Las cinco son dinero y esperan. No son dinero, y siguen al aprobar:
- `gestion_orden.indemnizacion`, el monto capturado: es dato de la gestión, y la 158 lo lee al
  asentar;
- todo lo que toca `orden.*` y el historial.

## Requisitos (EARS)

### A. Al aprobar un cierre del día

- **R1.** CUANDO se aprueba un `cierre_dia` con `destino_tipo = bodega_satelite`, el sistema NO DEBE
  escribir, por ese cierre, ninguna fila en la caja de la central (`wallet_movimiento`), en el libro
  por tienda (`wallet_tienda_movimiento`) ni en el libro del pago al mensajero
  (`pago_mensajero_movimiento`).
- **R2.** CUANDO se aprueba un `cierre_dia` con `destino_tipo = bodega_satelite`, el sistema DEBE
  hacer, en la misma transacción y igual que hoy, todo lo de la aprobación que no es dinero: la
  transición a `aprobado` con su actor y su fecha, la persistencia de los montos de indemnización
  capturados en sus gestiones, la liberación de las órdenes `sin_gestionar`, las devoluciones, la
  aplicación de gestiones y el historial.
- **R3.** CUANDO se aprueba un `cierre_dia` con `destino_tipo = bodega_central`, el sistema DEBE
  escribir en los tres libros exactamente las mismas filas que antes de esta ficha.

### B. La deuda de la satélite

- **R4.** El sistema DEBE calcular lo que una satélite le debe a la central por un cierre del día
  aprobado como `total_general − total_pago_mensajero − total_ingreso_bodega_rechazos`, con los
  snapshots del cierre. Ese aporte se conserva con su signo y nunca se recorta a cero.
- **R5.** El sistema DEBE calcular la deuda de una zona satélite como la suma de los aportes (R4)
  de todos sus `cierre_dia` en `aprobado` con destino `bodega_satelite` y esa zona,
  **consolidados o no** y sea cual sea el estado de su consolidación, menos la suma de
  `monto_recibido` de las consolidaciones de esa zona que no estén rechazadas.
- **R6.** MIENTRAS una zona satélite tenga al menos un `cierre_dia` aprobado sin consolidar con
  aporte distinto de cero, `/wallet/satelites` NO DEBE mostrarla al día. Además DEBE mostrar,
  separado, cuánto de su deuda está sin consolidar y cuántos cierres lo forman.
- **R7.** El sistema DEBE derivar con la misma fórmula de R5 las cifras de cabecera de
  `/wallet/satelites` (pendiente total, bodegas con pendiente, diferencia total) y su descarga. La
  suma de las filas debe cuadrar con la cabecera.
- **R8.** El sistema DEBE calcular el «falta por recibir» de una consolidación como
  `paraLaCentral(snapshot de la consolidación) − (monto_recibido ?? 0)`. Es la misma cifra, desde
  una sola función, en `/wallet/satelites` y en las superficies de `/cierres-admin` que hoy lo
  muestran (431/R26).
- **R9.** MIENTRAS se muestre una consolidación en la conciliación, el sistema DEBE mostrar:
  - lo recaudado por método (efectivo, SINPE, transferencia) y su total;
  - lo que le pertenece a la satélite: el pago a sus mensajeros y su ganancia por rechazos;
  - el neto que debe (R8 antes de restar lo recibido), lo recibido y lo que falta.

### C. Al conciliar

- **R10.** CUANDO se marca recibida una consolidación, el sistema DEBE escribir en la misma
  transacción de la marca, por cada `cierre_dia` aprobado con destino `bodega_satelite` que ella
  incluye, las filas de los tres libros que la aprobación de un cierre de la central habría escrito
  para ese cierre: mismas categorías, mismos montos y mismo origen (`cierre_dia`, su id).
- **R11.** SI al marcar recibida el monto recibido difiere del neto esperado de la consolidación
  (R8 sin lo recibido), ENTONCES el sistema DEBE escribir en la caja un único movimiento de
  «diferencia de la satélite» por esa diferencia. Va como egreso si se recibió menos y como ingreso
  si se recibió más. Así, el efecto de la consolidación en la caja descuenta lo que no llegó, y la
  diferencia sigue como deuda (R5). *(Forma cerrada por D10; a qué bolsillo de la caja va: R24–R27.)*
- **R12.** SI cualquier escritura de R10/R11 falla, ENTONCES el sistema DEBE revertir la marca
  entera. Y CUANDO se reintenta una marca o un asiento ya escrito, el sistema NO DEBE duplicar
  ninguna fila de ningún libro.
- **R13.** CUANDO se corrige el monto recibido de una consolidación conciliada (ficha 473), el
  sistema DEBE escribir un único movimiento nuevo de diferencia por la variación del faltante, sin
  modificar ni borrar ningún movimiento anterior. Si la diferencia no varía, NO DEBE escribir
  ninguno.
- **R14.** SI se pide revertir la conciliación de una consolidación cuyos asientos (R10) ya están
  escritos, ENTONCES el sistema DEBE rechazar la reversión con un desenlace propio que se muestra
  en pantalla, sin cambiar la marca ni ningún libro. *(Sujeto a Q2.)*
- **R15.** El sistema DEBE dejar cada movimiento de diferencia (R11/R13) enlazado a la marca o a la
  corrección que lo originó, con quién, cuándo, el esperado y el recibido.
- **R22.** CUANDO se escriben filas por R10/R11/R13, el sistema DEBE fecharlas en el instante de
  la conciliación o de la corrección, y no en el de la aprobación del cierre del día.

### D. Migración de datos

- **R16.** CUANDO se aplica la migración, el sistema DEBE retirar de los tres libros las filas con
  origen `cierre_dia` de los cierres que cumplan dos condiciones: destino `bodega_satelite` en
  `aprobado`, y sin consolidar o con su consolidación sin conciliar. Cada fila retirada se conserva
  íntegra en un respaldo. Del libro del mensajero NO DEBE retirar los premios del ranking
  (`premio_ranking`), los incentivos (`incentivo`) ni ninguna fila con `premio_dia` (la
  compensación de un premio anulado): no los escribe la aprobación, así que se quedan en su libro
  (D15).
- **R17.** La migración NO DEBE tocar las filas de cierres con destino `bodega_central` ni las de
  cierres satélite cuya consolidación esté conciliada.
- **R18.** SI alguno de los cierres de R16 tiene un pago al mensajero registrado contra él
  (`liquidacion_pago.cierre_id`), ENTONCES la migración DEBE abortar sin cambiar nada y con un
  mensaje que diga cuántos son.
- **R19.** CUANDO se aplica el `down.sql` de la migración, el sistema DEBE restaurar exactamente las
  filas retiradas (mismos id, montos, categorías y fechas) y quitar el respaldo.
- **R20.** CUANDO se concilia la consolidación de un cierre retirado por R16, el sistema DEBE
  escribir sus filas por R10, como con cualquier cierre satélite aprobado después del despliegue.

### E. Transversales

- **R21.** El sistema DEBE acotar a la empresa activa toda lectura y escritura de esta ficha.
  Toda tabla nueva lleva `organizacion_id`, RLS por empresa y está clasificada como de negocio.
- **R23.** El sistema DEBE seguir permitiendo marcar, corregir y revertir solo a quien tiene acceso
  total (431/R27), con el guard antes de tocar cualquier repositorio.

### F. El bolsillo «Por cobrar a satélites» (enmienda D12)

> **Enmienda del 2026-10-31 al spec aprobado. Aprobada por Carlos 2026-10-31**: D12, R24–R30, y
> Q6 y Q7 cerradas como D13 y D14.
>
> Vocabulario. La caja de la central (ficha 459, SL-39) se parte hoy en cuatro cifras cuya suma es
> la cifra principal (Entró − Salió): la ganancia, el IVA cobrado, «Saldo inicial y aportes»
> (capital) y «De las tiendas». Cada concepto de la caja tiene un dueño (`propio`, `terceros` o
> `capital`) que decide a qué cifra va. Esta enmienda añade un quinto bolsillo.

- **R24.** El sistema DEBE asignar a los conceptos de caja «diferencia de la satélite» (entregó
  menos y entregó más) un dueño propio, «por cobrar a satélites», distinto de la ganancia, del
  IVA, del capital y de «De las tiendas». Ningún otro concepto de la caja DEBE tener ese dueño.
- **R25.** CUANDO se escribe en la caja una diferencia de la satélite por «entregó menos», el
  sistema DEBE subir el bolsillo «Por cobrar a satélites» en ese importe. CUANDO se escribe una por
  «entregó más» —incluido el pago posterior de la diferencia registrado con «Corregir» (R13)—, DEBE
  bajarlo en ese importe. En los dos casos la ganancia, el IVA, el capital y «De las tiendas» NO
  DEBEN cambiar.
- **R26.** El sistema DEBE seguir cumpliendo la invariante R8 de la ficha 459 («De las tiendas» de
  la caja = Σ saldos de las tiendas) después de marcar recibida y de corregir una consolidación
  con cualquier diferencia, positiva, negativa o cero.
- **R27.** El sistema DEBE cumplir, sobre cualquier conjunto de movimientos de la caja (con o sin
  filtros), la identidad: Entró − Salió = ganancia + IVA + capital + «De las tiendas» − «Por cobrar
  a satélites».
- **R28.** MIENTRAS se muestra la tarjeta de la caja en `/wallet`, el sistema DEBE mostrar el
  bolsillo «Por cobrar a satélites» como bloque propio, separado del de la empresa y del de las
  tiendas, con ese rótulo, su importe y su signo derivados por el servidor y una pista que diga qué
  es. Si el importe es negativo, la pista DEBE decir que es la central la que le debe a las
  satélites. El bloque DEBE mostrarse siempre, también con importe cero (D14).
- **R29.** MIENTRAS se muestra una fila de diferencia de la satélite en el libro de la caja o en su
  descarga, el sistema DEBE mostrar como dueño el rótulo del bolsillo nuevo, no «Tienda» ni la
  empresa.
- **R30.** MIENTRAS la caja está en estado «saldo» y el bolsillo «Por cobrar a satélites» es
  mayor que cero, la barra de composición DEBE mostrar tres tramos: «De las tiendas», «De la
  empresa» y «Por cobrar a satélites» (D13). Cada tramo DEBE quedar entre 0 % y 100 %, los tres
  DEBEN sumar 100 % y el cálculo NO DEBE dividir por cero. Con el bolsillo en cero o negativo, la
  barra DEBE comportarse exactamente como antes de esta ficha.

### G. Estado de cuenta de la bodega y tarjeta de `/cierres-admin` (enmienda 2, D16)

> **Enmienda 2 del 2026-10-31. Aprobada por Carlos 2026-10-31** (D16). D15 no añade requisitos:
> los premios y los incentivos no se tocan (ver la tabla de decisiones y R16).

- **R31.** El sistema DEBE calcular el pendiente del estado de cuenta de una bodega satélite
  (`/wallet/satelites/[zonaId]`, ficha 458) con la fórmula de R5. Sin filtros, el saldo corrido
  final y el «Pendiente de llegar» DEBEN ser iguales a la deuda de esa zona en `/wallet/satelites`.
- **R32.** MIENTRAS se muestra el estado de cuenta de una bodega, el sistema DEBE mostrar como
  «declarado» de cada consolidación su neto para la central: la suma de los aportes (R4) de sus
  cierres, no el efectivo. Además DEBE mostrar una fila por cada `cierre_dia` aprobado de la zona
  que cuenta en la deuda (R5) y no pertenece a una consolidación no rechazada, fechada en su
  aprobación y con su aporte.
- **R33.** El sistema DEBE dar las mismas cifras que R31/R32 en los totales del estado de cuenta,
  en los totales del periodo y en su descarga.
- **R34.** MIENTRAS se muestra la región «Conciliación» de un cierre de bodega en `/cierres-admin`,
  lo recibido + lo que falta DEBE ser igual a la línea «Para la central» de la misma tarjeta, y
  ningún texto de esa región DEBE decir que la falta se cuenta sobre el efectivo.
- **R35.** El sistema NO DEBE mostrar en ninguna superficie de la conciliación que desmarcar no
  mueve dinero ni que la marca es informativa. DEBE decir que marcar recibido asienta el dinero en
  la caja y que, después, el monto se arregla con «Corregir» (R13, R14). *(Texto: Q10.)*

## Preguntas abiertas

- **Q1 — CERRADA (D10): opción A.** Cuando se recibe menos, ¿cómo se reparte lo recibido entre los movimientos? D5
  dice «entra lo recibido», pero los movimientos son por concepto y por cierre del día, y la
  recepción es por consolidación. Opciones:
  - **(A, recomendada; es la que escriben R10/R11).** Los tres libros reciben completos los
    movimientos de cada cierre de la consolidación. En la caja se añade **una** fila de «diferencia
    de la satélite» por esperado − recibido, así que el efectivo de la caja sube lo recibido. La
    tienda y el mensajero quedan con su derecho completo: lo que falta lo debe la satélite a la
    central, no la tienda. Respeta la identidad de la 173 (COD en caja = COD acreditado a
    tiendas).
  - **(B) Prorrateo.** Cada concepto se escala por recibido/esperado. Rompe la identidad de la 173
    y el libro por tienda: ¿a qué tienda se le acredita menos?
  - **(C) Nada entra hasta recibirlo completo.** Contradice «entra lo recibido».
- **Q2 — CERRADA (D11): bloquear revertir, usar Corregir.** Revertir una conciliación que ya escribió asientos. Los libros son append-only y
  el único `(origen_tipo, origen_id, categoria)` impide re-escribir un asiento de `cierre_dia` ya
  usado. Opciones:
  - **(A, recomendada; es la que escribe R14).** La reversión se bloquea cuando ya hay asientos.
    Un error de monto se arregla con «Corregir» (473, R13), que sigue funcionando. En prod hay 0
    conciliaciones, así que hoy no quita nada en uso.
  - **(B)** Contra-asientos en los tres libros. Necesita categorías de reverso nuevas para flete,
    comisión, IVA, COD, pago al mensajero y libro por tienda: es ficha aparte.
- **Q3 (no bloquea) La ganancia de la satélite no es un egreso de la caja.** La satélite se queda
  `total_ingreso_bodega_rechazos` de lo que recaudó, pero la caja no registra ningún egreso por eso
  (hueco declarado en la 393, hallazgo 12, y en la 56). Con la opción A, cuando eso es mayor que
  cero, la caja queda por encima del efectivo real en ese importe. Por defecto queda igual que hoy.
  ¿Hace falta registrarlo?
- **Q4 (no bloquea) Pago al mensajero de la satélite.** El libro del mensajero (44) da por pagado
  `min(P, efectivo)` (`lib/services/WalletMensajeroFeedService.ts:40-73`). Si el cierre es todo
  SINPE, el mensajero queda con cuenta por pagar aunque la satélite ya descontó P. Así está el caso
  de prod: P 6.000, efectivo 0. Por defecto no cambia: se escribe igual, pero al conciliar.
- **Q5 (no bloquea) Tienda ya pagada con un saldo que incluía COD satélite sin conciliar.** El
  libro por tienda no enlaza cada pago a un cierre, así que la migración no puede detectarlo. Si a
  la tienda de ese cierre ya se le pagó, quitar su crédito la deja en negativo hasta la
  conciliación. El leader debe medirlo en prod (solo lectura) antes de desplegar.
- **Q6 — CERRADA (D13): tercer tramo en la barra.** Restar lo por cobrar del tramo de la empresa
  queda descartado. Cómo se calcula: `design.md §2.9`.
- **Q7 — CERRADA (D14): el bloque se muestra siempre**, también con ₡0.
- **Q10 — CERRADA (Carlos, 2026-11-01): definitiva. Texto de la nota de la conciliación (R35):**
  «Marcar recibido asienta el dinero en la caja. Después no se puede desmarcar: si el monto no es
  el correcto, usa «Corregir»». Es texto de producto y lo fijó Carlos (SLT-76, R16).
- **Q11 (enmienda 2, verificar en T13) Rechazar una consolidación.** No se determinó en el código si
  rechazar una consolidación suelta sus cierres (`cierre_bodega_id`). R32 se escribe para que la fila
  de cada cierre salga de la misma condición que usa R5, sea cual sea la respuesta.
- **CERRADA (Carlos, 2026-11-01): rótulos definitivos.** Carlos fijó «Por cobrar a satélites», y
  el 2026-11-01 dejó como definitivos las pistas del bloque y el dueño de la fila en el libro
  («Satélite») (SLT-76, R16).
