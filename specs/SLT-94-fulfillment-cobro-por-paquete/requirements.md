# SLT-94 — fulfillment-cobro-por-paquete · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: — · Rama: feature/SLT-94-fulfillment-cobro-por-paquete
> Épica: EP-8 Tarifas flexibles · Sale en el mismo despliegue que el PR #97 (release EP-8).
>
> **Alcance.** La marca `fulfillment` de la tienda pasa a ser «se recoge en tienda (sí/no)» y solo
> decide el estado en que nace la orden; se migra con valor = NO(fulfillment). El fulfillment
> (servicio de empacado y almacenaje) se configura solo como precio propio de la tienda, en monto fijo
> + IVA. Si la tienda tiene un valor > 0 y la empresa ya activó sus tarifas nuevas, se le cobra
> fulfillment + IVA una vez por paquete al crear la orden (API, pantalla o carga masiva), y cuenta como
> ganancia de la empresa con esa fecha. Si la orden se elimina, se devuelve el cobro. Recoger en tienda
> y fulfillment pueden convivir. Rige desde el despliegue: nada retroactivo, cierres congelados
> intactos.
>
> **Lo que NO entra.** Rediseño del modal de cierre (SLT-95). Borrar la columna vieja
> `usuario.fulfillment` (se deja de leer y escribir, no se borra). Cobrar fulfillment en el modelo
> viejo de tarifas. Cambiar textos del informe de picking por WhatsApp (siguen diciendo «tienda con
> fulfillment»; solo cambia el predicado que los alimenta). Limpiar valores de fulfillment ya guardados
> en zona, grupo o en % (quedan inertes, R14).
>
> Las decisiones las fijó Carlos el 2026-11-08 ANTES del spec (`progress/features/SLT-94.md`). No se
> reabren.

## Decisiones cerradas (no reabrir)

| # | Decisión (Carlos, 2026-11-08) | Cubierta por |
|---|---|---|
| D1 | Fulfillment = servicio de empacado y almacenaje: cobro a la tienda, ganancia de la empresa. | R19, R20, R37 |
| D2 | Se cobra UNA vez por paquete (orden) al CREARSE la orden. No depende de la gestión ni del cierre. | R15, R18, R23 |
| D3 | Si la orden se elimina, se devuelve el cobro. | R26, R27, R28 |
| D4 | La marca `Usuario.fulfillment` pasa a «se recoge en tienda (sí/no)» y SOLO decide el estado en que nace la orden. Migración: valor nuevo = NOT fulfillment, en columna nueva con backfill; la vieja no se borra. | R1–R9, R35 |
| D5 | Se cobra si la tienda tiene un valor de fulfillment > 0. Recoger en tienda + fulfillment pueden convivir. | R15, R17, R18 |
| D6 | El fulfillment SOLO se configura como precio propio de la tienda (no zona base, no grupo) y SOLO en monto fijo (+ su % de IVA). Se restringe en services de escritura y en la pantalla de Tarifas. | R10–R14 |
| D7 | Vale igual para orden creada por API, a mano y por carga masiva: todos los caminos de creación. | R5, R15, R23 |
| D8 | Solo modelo NUEVO: mientras la empresa siga en el modelo viejo, NO se cobra. Empieza cuando active sus tarifas nuevas. | R16 |
| D9 | Un cambio de valor en Tarifas cuenta para órdenes nuevas; cierres congelados y movimientos ya escritos no se tocan. | R21, R22, R32 |
| D10 | Rediseño del modal de cierre (SLT-95) fuera de alcance. | R32 (el cierre no cambia) |

## Requisitos (EARS)

**Glosario.** *Orden viva*: orden con `deleted_at` nulo. *Eliminar*: fijar `deleted_at` (por pantalla
o por API key). *Restaurar*: devolver `deleted_at` a nulo (recuperar, solo `maestro`). *Cancelar por
API*: el cambio de estado de la API que no es una eliminación. *Empresa activada*: la que tiene su
activación de tarifas (SLT-54). *Valor de fulfillment de la tienda*: el valor del concepto
`tienda_fulfillment` en el nivel «tienda en todas sus zonas», en modo monto, con su % de IVA.
*Cobro de fulfillment*: el cargo a la tienda por el monto más su IVA. *Devolución*: el movimiento
compensatorio que le devuelve a la tienda un cobro. *Marca*: «se recoge en tienda» (sí/no).

### Marca «se recoge en tienda»

- **R1.** El sistema DEBE guardar por usuario la marca «se recoge en tienda» (sí/no) como un dato
  propio, distinto del valor de fulfillment de las tarifas.
- **R2.** CUANDO se aplica la migración, el sistema DEBE dejar en cada usuario existente la marca igual
  a la negación de su `fulfillment` anterior, sin cambiar ninguna otra columna ni fila.
- **R3.** CUANDO se crea un usuario sin indicar la marca, el sistema DEBE guardarla en «sí».
- **R4.** SI el usuario no tiene el rol `adminTienda`, ENTONCES el sistema DEBE guardar la marca en «sí»
  aunque la petición pida «no», al crear y al editar (también al cambiarle el rol).
- **R5.** CUANDO se crea una orden por cualquier vía (carga por pantalla, carga masiva o API key), el
  sistema DEBE decidir su estado inicial, si lleva guía en el acto y si entra al manifiesto SOLO con la
  marca de la tienda dueña de la orden: «sí» → `por_recolectar_en_tienda`, con guía y con manifiesto;
  «no» → `en_preparacion`, sin guía y sin manifiesto.
- **R6.** El sistema NO DEBE usar ningún valor de fulfillment (modelo viejo o nuevo) para decidir el
  estado inicial de una orden.
- **R7.** MIENTRAS una tienda tiene la marca en «no», el sistema DEBE tratarla como tienda con paquetes
  en bodega en el picking (selector de tiendas, órdenes en preparación y generación del informe de
  picking); MIENTRAS la tiene en «sí», NO DEBE ofrecerla ahí.
- **R8.** CUANDO alguien cambia la marca de una tienda, el sistema DEBE registrar el hecho en el
  historial de acciones con el valor anterior y el nuevo, en la misma transacción; y NO DEBE
  registrarlo si la marca no cambió.
- **R9.** La ficha de usuario DEBE mostrar, solo para el rol `adminTienda`, el control con el rótulo
  «Se recoge en tienda» y el valor guardado de la marca.

### Valor de fulfillment (configuración)

- **R10.** SI se intenta fijar un valor de `tienda_fulfillment` en un nivel distinto de «tienda en
  todas sus zonas» (zona, grupo, tienda en una zona, tienda en un grupo), ENTONCES el sistema DEBE
  responder `validation_error` sobre el campo culpable sin escribir nada.
- **R11.** SI se intenta fijar un valor de `tienda_fulfillment` en modo porcentaje, ENTONCES el sistema
  DEBE responder `validation_error` sin escribir nada. El % de IVA sigue siendo obligatorio como en
  todo cobro a la tienda (SLT-52 R4).
- **R12.** La base de datos DEBE rechazar toda fila nueva o modificada de `tarifa_valor` con concepto
  `tienda_fulfillment` que no sea del nivel «tienda en todas sus zonas» en modo monto.
- **R13.** La pantalla de Tarifas DEBE ofrecer el fulfillment solo en el precio propio de la tienda,
  solo en monto (sin selector de modo) y con su % de IVA, y NO DEBE ofrecerlo en los valores de zona
  ni de grupo.
- **R14.** SI existe un valor de `tienda_fulfillment` guardado antes del despliegue en otro nivel o en
  porcentaje, ENTONCES el sistema DEBE ignorarlo en toda resolución (cotización, costo por API,
  listado, cierre y cobro) como si no existiera, y NO DEBE borrarlo.

### Cobro al crear la orden

- **R15.** CUANDO se crea una orden viva, la empresa de la orden está activada y la tienda dueña tiene
  un valor de fulfillment mayor que cero, el sistema DEBE cobrarle a esa tienda, una sola vez, el monto
  de ese valor y su IVA (monto × % de IVA / 100, redondeo HALF_UP a 2 decimales, como `ivaDe`), en la
  MISMA transacción que crea la orden y por cualquier vía de creación.
- **R16.** MIENTRAS la empresa no está activada, el sistema NO DEBE cobrar fulfillment al crear
  órdenes, aunque la tienda tenga un valor de fulfillment en el modelo nuevo o en el viejo.
- **R17.** SI la tienda no tiene valor de fulfillment, o vale cero, ENTONCES el sistema NO DEBE escribir
  ningún movimiento de fulfillment para esa orden.
- **R18.** El cobro NO DEBE depender de la marca «se recoge en tienda», de la vía de creación ni de
  ninguna gestión o cierre: una tienda con la marca en «sí» y valor > 0 también se cobra.
- **R19.** El cobro DEBE escribir en el libro de la tienda un débito «Fulfillment» por el monto y, si el
  IVA es mayor que cero, un débito «IVA del fulfillment» por el IVA; y en la caja de la empresa sus dos
  ingresos espejo por los mismos importes; todos con la fecha de creación de la orden. El disponible
  de la tienda DEBE bajar exactamente monto + IVA.
- **R20.** El cobro DEBE sumar el monto a la ganancia de la empresa y el IVA al IVA cobrado; NO DEBE
  cambiar la cifra de dinero que entró a la caja; y DEBE mover «De las tiendas» de la caja lo mismo que
  la suma de saldos de las tiendas (invariante R8 de la ficha 459, sin excepción nueva).
- **R21.** El sistema DEBE congelar en el cobro el monto, el % de IVA, el IVA, la tienda cobrada y la
  referencia al valor que lo produjo; un cambio o borrado posterior de ese valor NO DEBE alterar
  ningún cobro ni devolución ya escritos.
- **R22.** CUANDO cambia el valor de fulfillment de una tienda, el sistema DEBE aplicar el valor nuevo
  solo a las órdenes creadas después del cambio.
- **R23.** Una orden DEBE tener a lo sumo un cobro inicial de fulfillment, garantizado por una
  restricción única en la base. Un reintento por API o una fila de carga masiva que no llega a crear la
  orden (duplicada u omitida) NO DEBE escribir cobro; en una carga parcial solo se cobran las órdenes
  efectivamente creadas.
- **R24.** SI la transacción que crea la orden se deshace, ENTONCES NO DEBE quedar ningún movimiento de
  fulfillment de esa orden en ningún libro.
- **R25.** Los movimientos de fulfillment DEBEN ser inmutables: la aplicación NO DEBE actualizarlos ni
  borrarlos, y el rol de la aplicación NO DEBE tener permiso de escritura directa sobre el registro de
  cobros.

### Devolución al eliminar

- **R26.** CUANDO se elimina una orden (por pantalla o por API) cuyo último movimiento de fulfillment es
  un cobro, el sistema DEBE devolverle a la tienda cobrada el mismo monto y el mismo IVA de ese cobro,
  con créditos compensatorios en el libro de la tienda y sus reversos en la caja, con la fecha de la
  eliminación y en la misma transacción, sin modificar el cobro.
- **R27.** CUANDO se repite la eliminación de una orden ya eliminada, o dos eliminaciones de la misma
  orden corren a la vez, el sistema DEBE escribir a lo sumo una devolución por cada cobro.
- **R28.** SI una orden no tiene ningún cobro de fulfillment (creada antes del despliegue, con la
  empresa sin activar o sin valor), ENTONCES su eliminación y su restauración NO DEBEN escribir ningún
  movimiento de fulfillment.
- **R29.** CUANDO se restaura una orden cuyo último movimiento de fulfillment es una devolución, el
  sistema DEBE volver a cobrar el mismo monto y el mismo IVA congelados del cobro original (no el valor
  vigente), con la fecha de la restauración. *(Pendiente de confirmar: Pregunta P1.)*
- **R30.** CUANDO se cancela una orden por API sin eliminarla, el sistema NO DEBE devolver el cobro de
  fulfillment. *(Pendiente de confirmar: Pregunta P2.)*
- **R31.** SI la orden cambia de tienda después de cobrada, ENTONCES la devolución DEBE ir a la tienda
  congelada en el cobro.

### Lo que no cambia

- **R32.** El sistema NO DEBE sumar el fulfillment en la liquidación del cierre (ingresos y libros que
  escribe la aprobación de un cierre, pago al mensajero, cobros de flete, comisión e IVA) ni alterar
  cierres congelados; el cierre sigue congelando el fulfillment solo para mostrarlo.
- **R33.** La cotización y el costo por API DEBEN seguir publicando el fulfillment y su IVA; para una
  empresa activada, con el mismo importe que se cobra al crear la orden (R10–R15).
- **R34.** El sistema NO DEBE cobrar fulfillment a ninguna orden creada antes del despliegue.
- **R35.** Las migraciones NO DEBEN mover ni borrar filas existentes, salvo escribir la columna nueva
  de la marca; cada una DEBE traer `down.sql`, y el `down` de la marca DEBE devolver a la columna vieja
  los cambios hechos en la nueva antes de soltarla.

### Visibilidad y analítica

- **R36.** La tienda (Mi wallet) y la empresa (wallet de tiendas, estado de cuenta, libro de caja)
  DEBEN ver cada movimiento de fulfillment con su rótulo («Fulfillment», «IVA del fulfillment»,
  «Devolución de fulfillment», «Devolución del IVA del fulfillment») y la orden de origen (guía o
  remisión).
- **R37.** Analítica DEBE contar los cobros y devoluciones de fulfillment en la ganancia de la empresa,
  el IVA cobrado, el catálogo de dinero en caja y la cuenta por pagar a tiendas, por la fecha del
  movimiento; y la composición de la ganancia en la wallet DEBE mostrar el fulfillment neto de
  devoluciones.

### Multi-empresa

- **R38.** El sistema DEBE escribir el cobro y la devolución en la empresa de la orden, leyendo solo la
  activación y el valor de esa empresa; una empresa NO DEBE ver ni alterar movimientos de fulfillment de
  otra.

## T0 — medido en producción por Carlos (2026-11-08, solo lectura)

- `_prisma_migrations` sin terminar: 0.
- `tarifa_valor`: 0 filas (ningún fulfillment en el modelo nuevo, ninguno en zona, grupo ni %).
- `tarifas` (modelo viejo) con `fulfillment > 0`: 0.
- `usuario.fulfillment = true`: 0 en todos los roles.
- Órdenes vivas: ~831, todas de tiendas con `fulfillment = false`. 0 creadas en las últimas 24 h.
- `cierre_detail`: 918 filas, todas `tarifa_modelo = 'viejo'`.

Consecuencia: el backfill deja «se recoge en tienda» = sí en todos los usuarios (nadie cambia de estado
de nacimiento) y al desplegar no hay nada que cobrar, devolver ni migrar de nivel o modo. Las consultas
para re-medir justo antes del merge están en `design.md > §9`.

## Preguntas abiertas

- **P1. Restaurar una orden eliminada: ¿se vuelve a cobrar?** Recomendación: sí, con el mismo monto e
  IVA congelados del cobro original (R29), igual que el cobro de plataforma (SL-40 R16): restaurar
  deshace un error, no es una orden nueva. Sin esto, una orden restaurada viviría sin cobro.
- **P2. La cancelación por API (que no es eliminación) ¿devuelve el cobro?** Recomendación: no (R30). La
  decisión D3 habla de eliminar, y SL-40 (P3) ya trata la cancelación como un cambio de estado, no como
  anulación.
- **P3. Cuentas dedicadas de API key (rol `apiKey`).** Con R4 no pueden marcarse «no se recoge», así
  que sus órdenes nacerán siempre en `por_recolectar_en_tienda`. Hoy, por API, una orden con valor de
  fulfillment > 0 nace en `en_preparacion` (predicado por tarifa). En producción no hay ningún caso
  (T0: 0 valores). Recomendación: aceptarlo; una tienda con paquetes en bodega que use API debe tener
  su key apuntando a la tienda real (ficha 302), que sí lleva la marca.
