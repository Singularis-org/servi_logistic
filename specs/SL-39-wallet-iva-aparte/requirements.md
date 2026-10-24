# SL-39 «Wallet: IVA aparte de las ganancias» — requirements

> Ficha: SL-39 · zona fullstack · depende de SL-17 (aislamiento por empresa, ya en `dev`).
> Spec escrito el 2026-10-23 por `spec_author`. El archivo no venía sembrado por `/afinar-feature`:
> el alcance y las decisiones salen del pedido de Carlos y del encargo del leader del mismo día.

## Pedido

Carlos Restrepo, 2026-10-23: «las ganancias de la empresa, en la wallet suma el iva, y no debe ser
así, el iva debe mostrarse a parte de las ganancias ya que si no mostraría un dato falso».

## Alcance

**Entra**

- La cifra «Ganancia de la empresa» de la caja (`/wallet`), en sus dos tarjetas: el resumen de la
  caja y «Cómo se compone la ganancia de la empresa».
- Una línea propia de IVA en las dos tarjetas, con su importe y su signo.
- Las cifras que repiten esa ganancia: la métrica `ganancia_empresa` de la analítica (KPI, serie y
  bruto) y la ganancia diaria de la serie «Finanzas por día».
- Los textos que hoy dicen que la ganancia incluye impuestos, y la ayuda de la wallet.
- **El detalle de cierres de `cierres-admin`** (P1 = sí, Carlos, 2026-10-23), en el cierre de mensajero
  y en el de bodega:
  - «Ganancia» (la que se pinta como «Debe» cuando sale negativa) y «Lo que le queda a la empresa»
    (`netoEmpresa`) salen sin IVA;
  - el IVA va en una línea propia de la cascada.

**Lo que NO entra**

- Hacer la tasa de IVA configurable o renombrar el impuesto por país: es SL-21.
- El cobro de la plataforma por orden: es SL-40. Esta ficha deja el sitio preparado
  (`design.md > Preparado para SL-40`), pero no añade esa línea.
- En `cierres-admin`, lo que es de la tienda o es la factura sigue igual: «Lo que la empresa
  facturó» (lleva IVA porque es lo que se le factura a la tienda), «Pago a tienda», «Gana la
  tienda», «Cobrado sobre lo recaudado», «Para la central» y el desglose por tienda.
- `lib/utils/ingreso-empresa.ts`, que SL-38 tiene en vuelo: no se toca (`design.md > 12`).
- La columna «Ganancia» del cierre del día del mensajero (`cierre-dia`): es el pago del mensajero,
  no la ganancia de la empresa.
- «Así queda» / «Cómo quedó» (`components/shared/wallet/AsiQueda.tsx`): siguen enseñando la
  ganancia, que ya sale sin IVA porque usan la misma derivación. No ganan una línea de IVA.
- Cambiar el modelo de datos: ni tablas, ni columnas, ni categorías nuevas, ni migraciones.

## Decisiones cerradas (no reabrir)

| # | Decisión | Origen | Requisitos |
|---|---|---|---|
| D1 | La ganancia de la empresa se muestra **sin IVA**. | Carlos, 2026-10-23 | R1, R3, R8 |
| D2 | El IVA se muestra **aparte**, en una línea propia. | Carlos, 2026-10-23 | R2, R6, R7 |
| D3 | Arreglo mínimo: no se rediseña el modelo de datos. Las categorías de IVA ya son filas propias del libro; lo que cambia es cómo se clasifican al leer. | Leader, 2026-10-23 | R5, R14 |
| D4 | Se corrigen también los totales y las cifras que repiten la ganancia: la analítica y la serie diaria. | Leader, 2026-10-23 | R10, R11, R12, R13 |
| D5 | Las descargas del libro no tienen una cifra de ganancia. No se cambian, y se comprueba que no cambian. | Leader, 2026-10-23 (evidencia en `design.md`) | R19 |
| D6 | La tasa no se toca: sigue saliendo de `tarifas` y de su copia congelada en `cierre_detail`. Configurarla es SL-21. | Leader, 2026-10-23 | R15 |
| D7 | La wallet sigue siendo por empresa, con la extensión y la RLS de SL-17. | Leader, 2026-10-23 | R16, R17 |
| D8 | Los movimientos históricos no se recalculan ni se migran: la ganancia sin IVA se deriva al leer, también sobre los movimientos anteriores a esta ficha. | `spec_author`, decisión técnica: el libro ya guarda el IVA en filas propias (`design.md > Datos históricos`) | R14 |
| D9 | La pantalla queda preparada para que la línea de SL-40 entre sin rehacerla. | Leader, 2026-10-23 | R9 |
| D10 | P1 = sí. En el detalle de cierres de `cierres-admin`, «Ganancia/Debe» y «Lo que le queda a la empresa» salen sin IVA, con el IVA en una línea propia. Va en esta misma ficha. | Carlos, 2026-10-23 | R21–R27 |
| D11 | En el cierre, el IVA se separa al leer. `cierre_detail` congela las entradas de la fórmula, no la ganancia, así que no hay cifra congelada que corregir ni migración. | `spec_author`, decisión técnica (`design.md > 12.2`) | R25 |

## Glosario

- **Categorías de IVA**: las cuatro categorías del libro de la caja que mueven IVA:
  `ingreso_iva_flete`, `ingreso_iva_flete_devolucion`, `ingreso_iva_comision_cod` y
  `egreso_reverso_iva_flete_devolucion`. Los nombres son los del enum de hoy; esta ficha no los cambia.
- **IVA de la caja**: la suma de las tres categorías de ingreso de IVA menos el reverso de IVA,
  sobre el mismo conjunto de movimientos (mismos filtros) que la ganancia.
- **Ganancia**: los ingresos propios de la empresa menos sus egresos propios, **sin** las categorías
  de IVA.
- **Pantalla de la caja**: `/wallet`, para los roles con acceso total (`maestro`, `admin`).

## Requisitos (EARS)

### La cifra

- **R1.** El sistema DEBE calcular la ganancia de la caja como los ingresos propios menos los
  egresos propios, excluyendo de los dos lados las cuatro categorías de IVA.
- **R2.** El sistema DEBE calcular el IVA de la caja como la suma de las tres categorías de ingreso
  de IVA menos `egreso_reverso_iva_flete_devolucion`, con su signo («positivo», «negativo» o «en
  cero»), sobre el mismo conjunto de movimientos con el que calcula la ganancia.
- **R3.** El sistema DEBE excluir las categorías de IVA de los importes «Ingresos de la empresa» y
  «Gastos de la empresa» del resumen, de modo que la ganancia sea exactamente esos ingresos menos
  esos gastos.
- **R4.** El sistema DEBE cumplir, sobre cualquier conjunto de movimientos, que la ganancia más el
  IVA más el saldo inicial y aportes más «Lo que la empresa les debe a las tiendas» sea igual a la
  cifra principal de la caja.
- **R5.** El sistema DEBE mantener, para el mismo conjunto de movimientos, los mismos valores que
  antes de esta ficha en: la cifra principal, «Entró», «Salió», «Lo que la empresa les debe a las
  tiendas», «Saldo inicial y aportes», «De la empresa» de la barra, el porcentaje de la barra y su
  modo.

### La pantalla

- **R6.** CUANDO un usuario con acceso total abre `/wallet`, el sistema DEBE mostrar en el
  bolsillo de la empresa del resumen de la caja una región «IVA cobrado», hermana de la región de la
  ganancia y de la de «Saldo inicial y aportes». La región lleva el importe del IVA, la insignia de su
  signo y la pista «IVA que se les cobró a las tiendas sobre el flete y la comisión. No es ganancia.».
- **R7.** CUANDO un usuario con acceso total abre `/wallet`, la tarjeta «Cómo se compone la ganancia
  de la empresa» DEBE:
  - mostrar las categorías de IVA fuera de las columnas «Ingresos» y «Egresos»;
  - mostrarlas en un bloque «IVA cobrado (aparte de la ganancia)», con una fila por categoría de IVA
    y el total del IVA de la caja;
  - permitir abrir el detalle de movimientos de cada fila de ese bloque, como cualquier otra fila.
- **R8.** El sistema DEBE hacer que, en la tarjeta de composición, el total de la columna «Ingresos»
  sea igual a «Ingresos de la empresa», el total de «Egresos» igual a «Gastos de la empresa», y el pie
  muestre la ganancia sin IVA.
- **R9.** El sistema DEBE pintar las regiones secundarias del bolsillo de la empresa («Saldo inicial
  y aportes» e «IVA cobrado») a partir de una lista ordenada declarada en un solo sitio, de modo que
  añadir una región sea añadir una entrada a esa lista.
- **R10.** El sistema DEBE decir en estos textos que la ganancia no incluye el IVA:
  - la descripción de la tarjeta de composición;
  - la nota «en qué se diferencian» del resumen;
  - la pista de «Ganancia de la empresa».

  Y DEBE decir que «De la empresa» incluye el IVA en el nombre accesible de la barra y en el mensaje
  del modo `solo_tiendas`.

### Las cifras que repiten la ganancia

- **R11.** CUANDO la analítica sirve la métrica `ganancia_empresa` para un rango, el sistema DEBE
  devolver como neto la misma ganancia sin IVA que la caja devuelve para ese rango. Ni el neto ni el
  bruto de la métrica DEBEN contar las categorías de IVA.
- **R12.** CUANDO la analítica sirve la serie «Finanzas por día», el sistema DEBE calcular la
  ganancia de cada día sin las categorías de IVA. La suma de las ganancias diarias de un rango DEBE
  ser igual a la ganancia de la caja para ese rango.
- **R13.** El sistema DEBE hacer que el IVA de la caja de un rango sea igual al neto de la métrica
  `ingreso_iva` para ese mismo rango.

### Datos, tasa y empresa

- **R14.** SI hay movimientos de IVA anteriores a esta ficha, ENTONCES el sistema DEBE mostrarlos
  fuera de la ganancia y dentro del IVA al leerlos, sin modificar, añadir ni borrar ninguna fila de
  `wallet_movimiento`, y sin migración.
- **R15.** El sistema DEBE seguir tomando los importes de IVA de los movimientos que escribe la
  aprobación del cierre y el cobro por devolución a origen. Esta ficha no cambia cómo se calculan ni
  qué tasa usan.
- **R16.** MIENTRAS la empresa activa de la petición es A, el sistema DEBE calcular la ganancia y el
  IVA de la caja solo con movimientos de A, aunque otra empresa B tenga movimientos de IVA.
- **R17.** SI el actor no tiene acceso total, ENTONCES el sistema DEBE rechazar la lectura del
  resumen de la caja, IVA incluido, antes de consultar la base.

### Garantías de construcción

- **R18.** SI el catálogo de categorías de la caja gana una categoría cuyo nombre contiene `_iva_` y
  que no está en el conjunto de categorías de IVA, ENTONCES el gate DEBE fallar.
- **R19.** El sistema DEBE mantener las descargas del libro de la caja (Excel del kardex y su
  detalle por guía) con las mismas columnas y los mismos saldos que antes de esta ficha. La columna
  «Es dinero de» de un movimiento de IVA DEBE seguir diciendo la empresa.
- **R20.** El sistema DEBE entregar el IVA y su signo derivados en el servidor, como texto con dos
  decimales, y la pantalla DEBE pintarlos sin sumar, restar ni convertir importes a número.

### El detalle de cierres (`cierres-admin`)

- **R21.** El sistema DEBE calcular el IVA facturado de un cierre como la suma, sobre las gestiones
  de ese cierre, del IVA del flete, del IVA del flete por devolución a origen y del IVA de la comisión
  COD. Lo DEBE entregar derivado en el servidor, como texto con dos decimales, en el detalle del
  cierre de mensajero, en el agregado del cierre de bodega y en cada uno de sus cierres del día.
- **R22.** El sistema DEBE calcular la «Ganancia» de un cierre como lo facturado sin IVA menos el
  pago al mensajero, en los mismos tres niveles que R21.
- **R23.** El sistema DEBE calcular «Lo que le queda a la empresa» de un cierre como lo facturado sin
  IVA menos el pago al mensajero menos el ingreso de bodega por rechazos, en los mismos tres niveles
  que R21.
- **R24.** CUANDO un usuario abre el detalle de un cierre de mensajero o de bodega en
  `cierres-admin`, la cascada «Lo que le queda a la empresa» DEBE mostrar, justo después de «Lo que
  la empresa facturó», una línea propia «IVA facturado» que resta, con la nota «El IVA que se le
  cobró a la tienda en este cierre. No es de la empresa.». Los importes que la cascada muestra DEBEN
  cuadrar: facturado − IVA − pago al mensajero − ingreso de bodega = lo que le queda a la empresa.
- **R25.** SI el cierre es anterior a esta ficha, ENTONCES el sistema DEBE separar su IVA al leerlo, a
  partir de las entradas congeladas en `cierre_detail`, sin modificar `cierre_detail`, `cierre_dia`
  ni ningún snapshot del cierre, y sin migración.
- **R26.** El sistema DEBE mantener en el detalle del cierre, con el mismo valor que antes de esta
  ficha, estas cifras: «Lo que la empresa facturó», «Pago a tienda», «Gana la tienda», «Cobrado sobre
  lo recaudado», «Para la central», el aviso de efectivo y el desglose por tienda.
- **R27.** CUANDO la ganancia del cierre sale negativa y la pantalla muestra la tarjeta «Debe», su
  nota DEBE decir «Ingreso sin IVA menos el pago al mensajero.» (o «…a los mensajeros.» en el cierre
  de bodega).

## Preguntas abiertas

- **P1 (CERRADA el 2026-10-23).** Carlos decide que sí: el detalle de cierres de `cierres-admin` sale
  sin IVA en esta misma ficha (D10, R21–R27).
