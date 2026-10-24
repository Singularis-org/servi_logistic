# SL-45 «Pago a la plataforma desde la wallet» — requirements

> Ficha: SL-45 · zona fullstack · depende de SL-40 (cargos y deuda con la plataforma) y de SL-39 (IVA
> aparte), las dos ya en `dev`.
> Spec escrito el 2026-10-24 por `spec_author`. El archivo no venía sembrado por `/afinar-feature`:
> el alcance y las decisiones salen del pedido de Carlos y del encargo del leader del mismo día.

## Pedido

Carlos Restrepo, 2026-10-24, literal:

> «este texto "Lo que la plataforma cobra por cada orden creada, menos las anuladas. Todavía no se
> cobra: no sale de la caja." debería ser más claro pues debe llevar a la persona a hacer el pago y no
> solo eso si no a registrarlo, es decir en el boton de registrar movimientos faltaría el pago a la
> plataforma que descuente del apartado que muestra la deuda»

## Alcance

**Entra**

- El texto de la región «Lo que la empresa debe a la plataforma» de `/wallet`: dice cuánto se debe y
  qué hacer (pagar y registrar el pago), con un botón que abre el registro.
- Un concepto nuevo, «Pago a la plataforma», en el diálogo «Registrar movimiento» de `/wallet`. Es un
  egreso de la caja: baja el dinero en caja y descuenta la deuda.
- La deuda mostrada pasa a ser cargos − reversos − pagos vigentes, y puede quedar a favor de la empresa.
- La anulación de un pago mal registrado, por el mismo «Anular…» del libro de la caja que ya usan los
  demás egresos.
- La fila «Pago a la plataforma» en la tarjeta de composición, en el libro, en la analítica de la
  ganancia y en la ayuda.

**Lo que NO entra**

- Cobrar de verdad: ni pasarela, ni facturas, ni conciliación con lo que la plataforma recibe. El pago
  lo hace la empresa por fuera de la app y aquí solo se registra. El proveedor de cobro sigue pendiente
  del humano (`docs/plan-saas.md > Lo que falta del humano`).
- Cambiar cómo nacen los cargos y los reversos (SL-40): el pago no los toca.
- Pagar más de lo que se debe: se rechaza (D4).
- Editar un pago: se anula y se registra otro (R17).
- Repartir un pago entre órdenes o períodos: el pago baja la deuda acumulada, sin imputarse a cargos
  concretos.
- Ver el pago o la deuda de cada empresa desde la pantalla del superadmin, salvo que Carlos diga que sí
  en P2 (R28).
- Que «Así queda» muestre la deuda antes y después: muestra las cifras de la caja, como cualquier
  egreso.

## Decisiones cerradas (no reabrir)

| # | Decisión | Origen | Requisitos |
|---|---|---|---|
| D1 | El texto de la deuda lleva a la persona a **pagar y a registrar el pago**, con un botón que abre el registro. | Carlos, 2026-10-24 | R1, R2, R3, R4, R5 |
| D2 | En «Registrar movimiento» entra el tipo **«Pago a la plataforma»**: es un egreso que **sale de la caja** y **descuenta la deuda**. | Carlos, 2026-10-24 | R6, R7, R8, R13 |
| D3 | **Deuda mostrada = cargos − reversos − pagos registrados y no anulados**, sobre todo el historial. | Leader, 2026-10-24 | R13, R14 |
| D4 | **El sobrepago se rechaza**: un pago no puede superar la deuda vigente, y sin deuda no se registra. La deuda solo queda a favor de la empresa si, después de pagar, se anulan órdenes ya pagadas. | `spec_author`, con el precedente del pago de una tienda a la empresa (457, R15) y del pago a una tienda (172, R31) (`design.md > 3`) | R3, R9, R10, R18 |
| D5 | Registran y anulan el pago **`maestro` y `admin`** (acceso total), los mismos que ven la caja y la deuda. | `spec_author`, sobre `esAccesoTotal` y SL-40 R25 | R19 |
| D6 | La anulación sigue **el mecanismo de los egresos sin documento** (458-B): «Anular…» del libro, motivo obligatorio, contra-asiento y constancia. No hay un camino nuevo. | Leader, 2026-10-24; `design.md > 5` | R15, R16, R17, R23 |
| D7 | Todo va por empresa, con la extensión, la RLS y las guardias de SL-17. La empresa **no puede alterar los cargos**: el pago no escribe en la tabla de cargos y el `REVOKE` de SL-40 sigue igual. | Leader, 2026-10-24 | R20, R21, R22 |
| D8 | El pago tiene **categoría propia del libro, `egreso_pago_plataforma`**, añadida con el patrón de categorías de siempre. Ninguna categoría existente sirve (`design.md > 2`). | `spec_author` | R7, R23, R24, R26, R27 |
| D9 | El pago es un **gasto propio de la empresa pagado en efectivo**, como el sueldo: baja la caja y **baja la ganancia**. | `spec_author`, con la ganancia de caja de SL-39 (`design.md > 4`) | R8, R25 |
| D10 | Migraciones nuevas, con timestamp posterior a todas las de `dev` (la última es `20261024120000`). | Leader, 2026-10-24 | R27 |

## Glosario

- **Pago a la plataforma**: un egreso de la caja, registrado a mano, por el que la empresa deja dicho
  que le pagó a la plataforma.
- **Pago vigente**: un pago registrado que no está anulado.
- **Deuda vigente**: Σ cargos − Σ reversos − Σ pagos vigentes de la empresa, desde el principio.
- **Estado de la deuda**: «debe» si la deuda vigente es mayor que cero, «al día» si es cero y «a favor»
  si es menor que cero.
- **Acceso total**: los roles `maestro` y `admin`.

## Requisitos (EARS)

### La región de la deuda

- **R1.** CUANDO un usuario con acceso total abre `/wallet` y el estado de la deuda es «debe», la
  región del bolsillo de la empresa DEBE mostrar:
  - el rótulo «Lo que la empresa debe a la plataforma» y el importe de la deuda vigente;
  - la pista «Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado.
    Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la
    caja y baja esta deuda.»;
  - un botón «Registrar pago a la plataforma».
- **R2.** CUANDO el estado de la deuda es «al día», la región DEBE mostrar el importe 0,00 con la pista
  «La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí.», y NO DEBE mostrar
  el botón.
- **R3.** CUANDO el estado de la deuda es «a favor», la región DEBE mostrar el rótulo «Saldo a favor de
  la empresa con la plataforma», el importe en positivo y la pista «La empresa pagó más de lo que hoy
  debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.», y NO DEBE mostrar
  el botón.
- **R4.** CUANDO el usuario pulsa «Registrar pago a la plataforma», el sistema DEBE abrir el diálogo
  «Registrar movimiento» con el concepto «Pago a la plataforma» ya elegido.
- **R5.** CUANDO se registra o se anula un movimiento de la caja desde `/wallet` con éxito, la región DEBE
  mostrar la deuda vigente nueva sin que el usuario recargue la página.

### El concepto «Pago a la plataforma»

- **R6.** El diálogo «Registrar movimiento» DEBE ofrecer el concepto «Pago a la plataforma» en el grupo
  «Sale dinero de la empresa». El concepto:
  - DEBE mostrar la frase «Sale dinero de la empresa hacia la plataforma y baja lo que la empresa le
    debe; baja la ganancia.»;
  - DEBE mostrar la frase del libro «Se registra en el libro como «Pago a la plataforma».»;
  - DEBE pedir el monto, la fecha y la referencia del pago, y admitir un comprobante opcional, como el
    sueldo;
  - NO DEBE pedir «a quién».
- **R7.** CUANDO un usuario con acceso total registra un pago válido que no supera la deuda vigente, el
  sistema DEBE escribir en una sola transacción:
  - un único egreso del libro de la caja con la categoría «Pago a la plataforma», el monto, la fecha
    elegida, la referencia y su autor;
  - la entrada del historial del egreso registrado.
- **R8.** El sistema DEBE contar el pago como un egreso propio de la empresa en efectivo. Con un pago de
  M, la cifra principal baja M, «Salió» sube M y la ganancia baja M. «Lo que la empresa les debe a las
  tiendas», «Saldo inicial y aportes» y el IVA DEBEN quedar iguales.
- **R9.** SI el monto supera la deuda vigente, o la deuda vigente es cero o menor, ENTONCES el sistema
  DEBE responder `validation_error` en el campo `monto`, con el mensaje «El pago no puede ser mayor que
  lo que la empresa debe a la plataforma.», y sin escribir nada.
- **R10.** SI dos pagos de la misma empresa se registran a la vez, ENTONCES el sistema DEBE evaluar el
  tope de cada uno con lo que el otro ya escribió, de modo que entre los dos nunca superen la deuda
  vigente.
- **R11.** SI llega un segundo envío con la misma clave de idempotencia, ENTONCES el sistema NO DEBE
  escribir nada y DEBE responder con el pago original.
- **R12.** SI el monto no es mayor que cero, tiene más de dos decimales o no cabe en `DECIMAL(12,2)`, la
  referencia está vacía o la fecha no cumple las reglas del egreso manual, ENTONCES el sistema DEBE
  responder `validation_error` con el campo y sin escribir nada.

### La deuda

- **R13.** El sistema DEBE calcular la deuda vigente como Σ cargos − Σ reversos − Σ pagos vigentes de la
  empresa, con todo el historial y sin los filtros del libro (período, a quién, tipo o categoría).
- **R14.** El sistema DEBE entregar, derivados en el servidor y como texto con dos decimales, la deuda
  vigente con su signo, su estado («debe», «al día» o «a favor») y su importe en positivo. La pantalla
  DEBE pintarlos sin sumar, restar, comparar ni convertir importes a número.

### La anulación

- **R15.** CUANDO un usuario con acceso total anula un pago con motivo desde «Anular…» del libro de la
  caja, el sistema DEBE escribir en una sola transacción la constancia con el motivo y el contra-asiento
  por el monto del pago. Con un pago de M, la deuda vigente sube M, la cifra principal sube M y la
  ganancia sube M.
- **R16.** SI el pago ya está anulado, ENTONCES el sistema DEBE responder `ya_anulado` sin escribir nada.
- **R17.** El sistema NO DEBE permitir editar ni borrar un pago registrado. La corrección es anularlo y
  registrar otro.
- **R18.** El sistema DEBE permitir anular un pago vigente aunque la deuda vigente sea cero o esté a favor.

### Permisos y aislamiento

- **R19.** SI el actor no tiene acceso total (`mensajero`, `adminTienda`, `adminSatelite`, `apiKey` o
  `superadmin`), ENTONCES el sistema DEBE responder `forbidden` antes de consultar la base, al registrar
  y al anular un pago.
- **R20.** MIENTRAS la empresa activa de la petición es A, el sistema DEBE registrar el pago en A y
  calcular la deuda vigente y el tope solo con los cargos, los reversos y los pagos de A. Un pago o una
  anulación de A NO DEBEN cambiar la deuda ni la caja de otra empresa B.
- **R21.** SI una petición de la empresa B intenta anular un pago de la empresa A, ENTONCES el sistema
  DEBE responder `no_encontrado` sin escribir nada.
- **R22.** El sistema NO DEBE crear, modificar ni borrar ningún cargo ni reverso de la plataforma al
  registrar o anular un pago. Una transacción de empresa (rol `servi_app`) DEBE seguir sin poder escribir
  en la tabla de cargos.

### Libro, composición, analítica y descargas

- **R23.** El libro de la caja DEBE mostrar el pago con el nombre «Pago a la plataforma», como dinero de
  la empresa y con la acción «Anular…». Su contra-asiento NO DEBE ofrecer ninguna acción.
- **R24.** La tarjeta «Cómo se compone la ganancia de la empresa» DEBE mostrar los pagos en una fila
  propia «Pago a la plataforma» de la columna «Egresos», que abre su detalle. El total de «Egresos» DEBE
  seguir siendo igual a «Gastos de la empresa».
- **R25.** El sistema DEBE contar el pago como egreso propio en la métrica `ganancia_empresa` y en la serie
  «Finanzas por día», con la misma ganancia que la caja para el mismo rango.
- **R26.** Las descargas del libro de la caja DEBEN incluir el pago con su nombre y las mismas columnas que
  antes de esta ficha. Sus saldos DEBEN coincidir con los de la caja.

### Garantías de construcción

- **R27.** CUANDO se aplican los `down.sql` de esta ficha en orden inverso, la base DEBE quedar sin la
  categoría `egreso_pago_plataforma` y con la regla tipo-categoría del libro igual que antes. SI alguna
  fila usa esa categoría, ENTONCES el `down.sql` DEBE abortar sin borrar nada.
- **R28.** DONDE la columna de la deuda en «Empresas» esté incluida (solo si P2 = sí), CUANDO el superadmin
  abre `/plataforma/empresas`, cada fila DEBE mostrar el estado y el importe de la deuda vigente de esa
  empresa, calculados en el servidor con la regla de R13.

## Preguntas abiertas

- **P1 (CERRADA por `spec_author`, D4): ¿qué pasa si alguien paga de más?** Se rechaza (R9).
  - Es lo que ya hacen los otros dos pagos contra un saldo: el de una tienda a la empresa (457) y el de la
    empresa a una tienda (172).
  - Un saldo a favor voluntario dejaría a la empresa con dinero dentro de la plataforma, sin que nadie lo
    haya pedido.
  - El saldo a favor existe igual, pero solo por un camino: anular órdenes ya pagadas (R3).
  - Si Carlos prefiere admitir el pago de más, cambian solo R9 y R10 y sus tests. El resto del spec no
    cambia.
- **P2 (ABIERTA, para Carlos): ¿ve el superadmin, en «Empresas», cuánto debe o tiene a favor cada
  empresa?**
  - **Recomendación: no en esta ficha.** Nadie lo ha pedido, y es la pantalla del panel de SL-26.
  - Si es sí, es una columna «Plataforma» con «Debe 500,00», «Al día» o «A favor 500,00» (R28,
    `design.md > 9`, tanda E de `tasks.md`).
  - Esa columna toca dos archivos que SL-41 tiene en vuelo.
