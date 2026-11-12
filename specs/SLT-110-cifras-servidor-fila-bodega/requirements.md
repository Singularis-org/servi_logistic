# SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» — requirements

> Ruta: completa (`ruta: completa`; pantalla de dinero). Zona: fullstack. Escrito por spec_author el
> 2026-11-12.
>
> Rebanada **S12** del rediseño de cierres. Spec madre, aprobado por Carlos:
> `specs/SLT-95-detalle-cierre-rediseno/` (R64-R66 `[S12]`; `tasks.md > Plan de las demás rebanadas
> > S12`). Precedente que se copia: SLT-101 «Fila de gestión única y lista con filtros»
> (`specs/SLT-101-fila-gestion-unica/`, R92-R96), que trajo R64-R66 a la fila de **mensajeros** de
> `/cierres-admin` por su decisión S3-1. La fila de **bodega** la montó SLT-104 «Detalle de cierre
> de bodega en el detalle único (central)» con `GestionesCierre` en audiencia «solo lectura». La
> vista del mensajero va en SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero».
>
> **Hallazgo que acota la ficha** (`design.md > Lo que ya existe`): el detalle de bodega ya usa el
> MISMO mapper que el de mensajeros (`toPendienteRowDesdeSnapshot`), así que cinco de las siete
> cifras de R64-R66 ya le llegan y la fila ya las pinta. Le faltan **dos**: la fecha del cargo de
> fulfillment (sale siempre nula) y «Sin tarifa de pago» (`tarifaFaltante` no se emite y queda
> `false`). Este spec se limita a esas dos y a probar contra la base las cinco que ya llegan. PA1 le
> pide a Carlos que confirme el acotamiento.

## Alcance

`/cierres-admin` › Bodega › detalle de un cierre de bodega › pestaña «Gestiones», visto por la
central (acceso total):

- **Servidor:** `CierresBodegaAdminRepository.findCierreBodegaConDetalle` emite, por gestión, la
  fecha en que se cargó el fulfillment al saldo de la tienda y la señal «Sin tarifa de pago», con
  la misma regla que el detalle de mensajeros (SLT-101 R94 y R96). Campos que ya existen en el
  contrato; sin migración y sin escrituras.
- **Pantalla:** sin cambios de código. La fila (`GestionesCierre`, audiencia «solo lectura»)
  ya pinta las dos cifras cuando llegan; se prueba que lo hace en el detalle de bodega.
- **Verificación:** integración contra Postgres real de las siete cifras de R64-R66 en el detalle
  de bodega, con mutación de la consulta, y E2E del escenario B6 de SLT-104 con los literales de
  la fila.

## Lo que NO entra

- La vista del mensajero en `/cierre-dia`: SLT-108 «/cierre-dia: detalle y cola únicos para el
  mensajero».
- La lectura del cierre de bodega por la satélite (permiso nuevo, filtro de zona): SLT-107 «Bodega
  satélite: Solicitados y su cierre de bodega en lectura». Lo que esa ficha hereda de esta está en
  `design.md > Lo que hereda SLT-107`.
- Las columnas de estas cifras en el Excel de cierres (`findGestionesDeCierresBodegaCompleto` y la
  hoja fundida): rebanada S15 del madre.
- Cambiar cómo se calcula, congela o asienta un importe, permisos, esquema o migraciones (R71, R72
  del madre). Todo es lectura de lo ya congelado.
- Rediseñar la fila, sus textos o sus tarjetas: son los de SLT-101.

## Decisiones cerradas (no reabrir)

No viene sembrado por `/afinar-feature`. Estas son las heredadas del madre y de SLT-101 que este
spec hace visibles en la fila de bodega.

| # | Fecha · quién | Decisión |
|---|---|---|
| D5 | 2026-11-08 · Carlos | Sin cambios de dinero. |
| D10 | 2026-11-09 · Carlos | Todas las cifras del canvas van; las que no llegan las deriva el servidor. |
| D20 | 2026-11-09 · Carlos («unificamos») | Una cifra, un nombre: la misma cifra sale igual en las dos pantallas. |
| S3-1 | 2026-11-09 · Carlos (PA1 de SLT-101) | R64-R66 de la fila de mensajeros entraron en SLT-101; SLT-110 queda con lo que no sea esa fila. |
| PA9 (SLT-101) | 2026-11-09 · SLT-101 | «Sin tarifa de pago» solo en el modelo nuevo: lo congelado del viejo no guarda si la zona tenía tarifa de pago. |
| F481 | 2026-10-15 · Carlos (ficha 481) | El fulfillment es dato de la central: a quien no tiene acceso total no le llega. |

Cobertura de las decisiones:

| Decisión | Requisitos |
|---|---|
| D5 | R213 |
| D10 | R64, R65, R66, R210, R211 |
| D20 | R212 |
| S3-1 | R64, R65, R66 (alcance: solo la fila de bodega) |
| PA9 (SLT-101) | R211 |
| F481 | R215 |

## Requisitos (EARS)

R64-R66 son copia del madre, con su número y su sentido, acotados a la fila de bodega. R210-R216
son nuevos de esta ficha (rango reservado R210-R229). El test previsto de cada R está en
`tasks.md > Trazabilidad`.

### Cifras nuevas del servidor (copia del madre, en la fila de bodega)

- **R64** [S12, fila de bodega] — CUANDO la gestión es del modelo nuevo, el servidor DEBE emitir,
  por concepto cobrado a la tienda, su tarifa congelada (`cierre_detail_concepto`: modo, valor, % de
  IVA, nivel y el grupo o la zona de su `tarifa_valor`), y la fila DEBE pintarla en «Ver cómo se
  calculó».
- **R65** [S12, fila de bodega] — El servidor DEBE emitir, por gestión: el IVA incluido en el cobro
  a la tienda (`ivaFlete` + `ivaComisionCod` + `ivaFleteDevolucion`), el total del fulfillment con
  IVA y la fecha en que se cargó al saldo de la tienda, y la fila DEBE pintarlos («de eso, IVA»,
  «Se cobró», «Se cargó al saldo de la tienda el …»).
- **R66** [S12, fila de bodega] — El servidor DEBE emitir, por gestión con pago congelado, el pago
  «por tarifa» (`gestion_pago_congelado.importe` del mensajero, con su modo y nivel) y, si hubo
  ajuste, la diferencia con su signo hasta `pagoMensajero`; la tarjeta «Se le paga al mensajero»
  DEBE pintarlos en cascada. Con audiencia central o satélite, `tarifaFaltante` DEBE llegar con su
  valor real.

### Lo que añade S12 en la fila de bodega (nuevo)

- **R210** — CUANDO la central abre el detalle de un cierre de bodega, el servidor DEBE emitir en
  cada gestión la fecha del cargo de fulfillment de su orden con la regla de SLT-101 R94: el
  instante del **último** movimiento de fulfillment de esa orden SI es un cargo; nula SI el último
  es un reverso o la orden no tiene ninguno. La lectura DEBE limitarse a las órdenes de los cierres
  del día incluidos en ESE cierre de bodega.
- **R211** — CUANDO la central abre el detalle de un cierre de bodega, el servidor DEBE emitir en
  cada gestión `tarifaFaltante` con la regla de SLT-101 R96: verdadero SI y solo SI la gestión es
  del modelo nuevo, su resultado tiene concepto de pago al mensajero en el catálogo de tarifas y no
  tiene fila congelada con actor mensajero; falso en el modelo viejo.
- **R212** — Para un mismo cierre del día, cada cifra de R64-R66 que emite el detalle de bodega
  (conceptos con su tarifa, IVA incluido, «Se cobró», % de IVA del fulfillment, fecha del cargo,
  pago por tarifa con su ajuste y `tarifaFaltante`) DEBE ser idéntica, campo a campo, a la que emite
  el detalle de ese cierre del día en `/cierres-admin` para la central.
- **R213** — Las cifras de R210 y R211 DEBEN llegar como valores de campos que el contrato ya
  tiene (`ingresoEmpresa.fulfillmentCargadoAt`, `tarifaFaltante`): ningún otro campo del detalle de
  bodega DEBE cambiar de nombre, de tipo ni de valor, ni los totales, «Dinero», «Mensajeros» o
  «Conciliación». Su lectura NO DEBE escribir en la base ni requerir migración.
- **R214** — CUANDO la central despliega en «Gestiones» del detalle de bodega una gestión con fecha
  de cargo, la tarjeta «Fulfillment» DEBE decir «Se cargó al saldo de la tienda el <fecha>, una vez
  por paquete.» antes de «No depende de esta gestión ni de este cierre.». SI la gestión tiene
  `tarifaFaltante`, ENTONCES su celda «Señales», el conteo de «Con señales» y la columna «Señales»
  de «Descargar» DEBEN incluir «Sin tarifa de pago».
- **R215** — MIENTRAS el actor no tenga acceso total, el servidor NO DEBE devolverle el detalle de
  un cierre de bodega (ni, por tanto, la fecha del cargo de fulfillment ni las demás cifras de la
  central).
- **R216** — El servidor DEBE leer los movimientos de fulfillment del detalle de bodega en **una**
  consulta por detalle abierto, sea cual sea el número de cierres del día o de gestiones que
  incluya.

## Preguntas abiertas

Para Carlos, en la aprobación del spec:

- **PA1 — Acotar la ficha a lo que falta.** La descripción pide que el repositorio de bodega emita
  tarifa por concepto, IVA incluido, fulfillment con fecha y pago por tarifa con ajuste. Cinco de
  esas siete cifras ya llegan al detalle de bodega desde SLT-101 (mismo mapper) y SLT-104 ya las
  pinta. Faltan la fecha del cargo de fulfillment y «Sin tarifa de pago». Recomendado: seguir con
  este spec acotado (dos cifras + integración y E2E de las siete). Alternativa: cerrar la ficha y
  abrir una más chica solo con las dos.
- **PA2 — Cambio visible en la bodega.** En cierres del modelo nuevo, la fila de bodega empezará a
  enseñar «Sin tarifa de pago» (fila, «Con señales» y «Descargar») donde hoy no sale nada; en prod
  todo cierre es del viejo (D19 del madre), así que no se verá hasta que una empresa active las
  tarifas nuevas. Es lo que R85 de SLT-101 ya pide para «solo lectura». ¿De acuerdo?
- **PA3 — E2E de la fecha del cargo.** El escenario B6 de SLT-104 no tiene fulfillment: el E2E
  cubre las cifras que B6 sí tiene (concepto, «de eso, IVA», «Por tarifa», «Se le paga») y la fecha
  del cargo y «Sin tarifa de pago» quedan cubiertas por integración contra la base y por test de
  componente. Recomendado así: añadir fulfillment a B6 cambiaría sus literales de SLT-104. ¿O
  quieres un escenario E2E propio con fulfillment en bodega?
