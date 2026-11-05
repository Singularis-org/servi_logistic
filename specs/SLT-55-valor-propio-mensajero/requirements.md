# SLT-55 — valor-propio-mensajero · requirements.md

> Zona: fullstack · Complejidad: small · depends_on: SLT-52 · Rama: feature/SLT-55-valor-propio-mensajero
>
> **Alcance:** la empresa fija, en la pantalla de Tarifas, el pago propio de un mensajero por cada
> resultado (entregado, reprogramado, novedad, rechazo, incidente), en monto o porcentaje y sin IVA.
> Si lo tiene, gana sobre el valor de la zona y sus grupos, en cualquier zona donde trabaje. El
> resultado que no se digite usa el valor de la zona. Incluye la escritura, que SLT-52 dejó prevista.
>
> **Lo que NO entra:** cambiar el nivel o la precedencia (SLT-52, R6 y R19). Valor propio para la
> satélite o la tienda. Cualquier pantalla nueva en el portal del mensajero. Retirar el modelo viejo
> → SLT-57.
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Glosario.** *Valor propio*: el pago que la empresa fija a UN mensajero por UN resultado, sin zona,
grupo, tienda ni vehículo. *Resultado*: entregado, reprogramado, novedad, devolución por rechazo o
incidente. *Dado de baja*: usuario en estado `inactivo` o `bloqueado`. *Caminos del cierre*: vista
previa del mensajero, solicitud, corte diario, re-solicitud de un rechazado (477) y corrección de un
resultado (398). *Concepto*, *valor*, *sin tarifa*, *modelo viejo* y *modelo nuevo*: como en SLT-52.
*Activación*: como en SLT-54.

### Escritura

- **R1.** CUANDO el `maestro` fija el pago de un mensajero por un resultado, el sistema DEBE guardar
  el modo, monto o porcentaje, y el valor como valor propio de ese mensajero, sin zona, grupo, tienda
  ni vehículo.
- **R2.** El sistema DEBE admitir un valor propio por cada uno de los 5 resultados, independientes
  entre sí: fijar o quitar uno NO DEBE cambiar los otros.
- **R3.** CUANDO se fija de nuevo el mismo mensajero y el mismo resultado, el sistema DEBE reemplazar
  el valor anterior sin crear otra fila; SI dos fijaciones chocan, ENTONCES una DEBE guardarse y la
  otra DEBE responder con el error de validación de SLT-52 R8, en la fila de ese resultado.
- **R4.** CUANDO se quita un valor propio, el sistema DEBE borrarlo y, desde ese momento, ese resultado
  de ese mensajero DEBE resolverse con el nivel siguiente.
- **R5.** SI un valor propio trae IVA (aunque sea 0), es negativo o es un porcentaje mayor que 100,
  ENTONCES el sistema DEBE rechazarlo con error de validación sin escribir nada.
- **R6.** SI un valor combina mensajero con zona, grupo, tienda o vehículo, o trae mensajero en un
  concepto de la tienda o de la satélite, ENTONCES el sistema DEBE rechazarlo sin escribir nada, en el
  service y en la base; en ningún caso DEBE guardarlo como valor de otro nivel.
- **R7.** SI el mensajero indicado no existe, es de otra empresa o no tiene rol `mensajero`, ENTONCES
  el sistema DEBE responder `validation_error` en `mensajeroId` sin escribir nada, salvo el reemplazo
  que permite R8.
- **R8.** SI se pide fijar un valor nuevo a un mensajero dado de baja, o a un usuario que ya no tiene
  rol `mensajero`, en un resultado donde no tiene valor, ENTONCES el sistema DEBE responder
  `validation_error` en `mensajeroId` sin escribir; reemplazar o quitar uno existente DEBE seguir siendo
  válido.
- **R9.** SI llega a la base un valor propio cuyo mensajero es de otra empresa, ENTONCES la base DEBE
  rechazarlo, también con SQL a mano.
- **R10.** SI quien pide fijar o quitar un valor propio no es `maestro`, ENTONCES el sistema DEBE
  responder `forbidden` sin escribir; el `admin` DEBE poder leerlo y cualquier otro rol DEBE recibir
  `forbidden` también al leer.
- **R11.** CUANDO se fija o se quita un valor propio, el sistema DEBE registrar `tarifa_valor_fijado` o
  `tarifa_valor_quitado` en la misma transacción, con el actor, el valor anterior y el nuevo, y una
  etiqueta que nombra el concepto y al mensajero con su nombre y primer apellido.

### Precedencia y cálculo

- **R12.** MIENTRAS la empresa está activada, el sistema DEBE pagar al mensajero, en cada uno de los
  caminos del cierre, su valor propio antes que el de grupo por vehículo, grupo, zona por vehículo y
  zona, y DEBE congelarlo con el nivel `mensajero` y el valor de origen.
- **R13.** El sistema DEBE aplicar el valor propio sea cual sea la zona que use el camino del cierre, y
  DEBE seguir aplicándolo si cambia la zona o el vehículo del mensajero.
- **R14.** SI el mensajero no tiene valor propio para el resultado de una gestión, ENTONCES el sistema
  DEBE pagarle con la precedencia de SLT-52 R19 para ese resultado, aunque tenga valor propio en otros;
  SI ningún nivel tiene valor, ENTONCES DEBE pagar 0 y crear el cierre (SLT-52 R24).
- **R15.** SI un valor propio vale 0, ENTONCES el sistema DEBE pagar 0 con el nivel `mensajero`, y NO
  DEBE caer al nivel siguiente.
- **R16.** El valor propio de un mensajero NO DEBE cambiar el pago de otro mensajero ni el pago a la
  satélite de la misma gestión.
- **R17.** SI un valor propio está en porcentaje, ENTONCES el sistema DEBE usar como base el flete sin
  IVA que se le cobra a la tienda por esa gestión, resuelto con la zona y el distrito de la orden, tenga
  o no valor de pago la zona del mensajero. Con flete por entregado de 3.000 más 13 % de IVA y valor
  propio de 20 %, el pago DEBE ser 600,00 y no 678,00; con precio de tienda de 2.500, 500,00; con flete
  de 10 % sobre un pedido de 20.000, 400,00; con flete de 3.333,33, 666,67.
- **R18.** SI a la tienda no se le cobra nada por ese resultado, ENTONCES un valor propio en porcentaje
  DEBE dar 0,00, con su base en 0,00 congelada (SLT-52 R28).
- **R19.** CUANDO un valor propio en porcentaje se paga en una re-solicitud o una corrección, el sistema
  DEBE usar como base el cobro congelado en ese cierre para esa orden, incluido el del modelo viejo
  (SLT-52 R52, R53 y R54).
- **R20.** SI el mensajero no tiene zona, ENTONCES el sistema DEBE seguir sin crearle cierre, en la
  solicitud y en el corte, y su vista previa DEBE seguir en 0, aunque tenga valor propio.

### Activación, faltantes y cierres hechos

- **R21.** MIENTRAS la empresa no está activada, el sistema DEBE calcular con el modelo viejo, centavo a
  centavo, también para un mensajero con valor propio; y fijar o quitar uno NO DEBE activar la empresa.
- **R22.** CUANDO la empresa se activa, los valores propios ya digitados DEBEN regir desde el siguiente
  cierre, sin cambiar ningún cierre ya creado.
- **R23.** El sistema NO DEBE contar un valor propio como cobertura de una zona: la lista de faltantes,
  el estado de la zona, «M de T zonas completas» y la confirmación que pide activar DEBEN dar lo mismo
  con él y sin él.
- **R24.** SI un valor propio cambia o se quita después de congelar un cierre, ENTONCES el sistema NO
  DEBE cambiar ningún importe de ese cierre en su detalle, su aprobación ni las wallets; el cambio DEBE
  aplicar desde el siguiente cierre.

### Mensajero dado de baja o retirado

- **R25.** MIENTRAS un mensajero está dado de baja o deja de tener rol `mensajero`, el sistema DEBE
  conservar su valor propio y DEBE seguir pagándolo en las gestiones suyas que se cierren.
- **R26.** SI se borra de la base un usuario con valor propio y sin gestiones, ENTONCES su valor propio
  DEBE borrarse con él; SI tiene gestiones, ENTONCES la base DEBE impedir borrarlo.

### Pantalla

- **R27.** `/configuracion/tarifas` DEBE tener una sección «Mensajeros con valor propio» con cada
  mensajero que tenga al menos uno: su nombre y el valor de cada resultado del catálogo, y «Usa la zona»
  en el que no tenga.
- **R28.** CUANDO el `maestro` añade o edita, la pantalla DEBE ofrecer una fila por resultado del
  catálogo con modo y valor, sin campo de IVA y sin referencia «Hoy rige», y DEBE decir que un campo vacío
  usa el valor de la zona, que un 0 escrito paga 0 y sobre qué se calcula el porcentaje. Enmienda SLT-54
  R20 solo en esta sección: el modelo viejo no tiene valor por mensajero.
- **R29.** CUANDO se guarda, el sistema DEBE fijar solo los resultados cambiados y quitar los vaciados;
  un resultado sin cambios NO DEBE escribir ni dejar historial, y la petición de fijar NO DEBE incluir
  la clave `ivaPct`.
- **R30.** SI en un guardado falla un resultado, ENTONCES el sistema DEBE conservar los ya guardados y la
  pantalla DEBE mostrar el error en esa fila, conservando lo digitado.
- **R31.** Al añadir, la pantalla DEBE ofrecer solo usuarios de la empresa con rol `mensajero`, no dados
  de baja y sin valor propio; SI no hay ninguno, ENTONCES DEBE decirlo en lugar de un selector vacío.
- **R32.** MIENTRAS un mensajero con valor propio está dado de baja o ya no tiene rol `mensajero`, la
  sección DEBE mostrarlo marcado como inactivo, con sus valores editables y quitables y sus filas vacías
  deshabilitadas.
- **R33.** CUANDO se quita un mensajero de la sección, la pantalla DEBE pedir confirmación diciendo
  cuántos valores se quitan y que pasa a usar el valor de la zona.
- **R34.** MIENTRAS la empresa no está activada, la sección DEBE decir que lo digitado no cambia ningún
  pago hasta activar; MIENTRAS está activada, DEBE decir que el cambio aplica desde el siguiente cierre y
  que los cierres hechos no cambian.
- **R35.** SI el rol es `maestro`, la sección DEBE permitir añadir, editar y quitar; SI es `admin`, DEBE
  mostrar los mismos datos sin controles de escritura; SI es otro rol, NO DEBE mostrarla.
- **R36.** SI ningún mensajero tiene valor propio, ENTONCES la sección DEBE mostrar un estado vacío que
  enseña el siguiente paso.
- **R37.** MIENTRAS la empresa activa es A, el sistema NO DEBE leer, ofrecer ni escribir valores propios
  ni mensajeros de otra empresa.
- **R38.** A 390 px de ancho, la sección NO DEBE dar scroll horizontal a la página y sus botones y
  campos DEBEN medir al menos 44 px de alto; en modo oscuro DEBE usar los tokens de `DESIGN.md`, y la
  moneda DEBE salir de `lib/config/moneda.ts`.

### Portal del mensajero

- **R39.** El portal del mensajero NO DEBE ganar ninguna pantalla, columna ni texto, y su «Ganancia» en
  `/cierre-dia` DEBE mostrar el importe calculado con el valor propio.

### E2E

- **R40.** Un E2E del proyecto `dinero` DEBE recorrer: el `maestro` digita un valor propio sin que el
  cierre cambie, activa, un cierre paga el valor propio en monto y en porcentaje mientras otro mensajero
  de la misma zona cobra el de la zona, el mensajero lo ve, un cambio posterior no mueve ese cierre y
  quitarlo devuelve al valor de la zona. Con dos empresas, B NO DEBE ver nada de A y `admin` NO DEBE poder
  escribir.

### Trazabilidad prevista

Rutas de `tasks.md`. El implementer la confirma con el test concreto en `progress/impl_SLT-55.md`.
`escritura` = `tests/integration/db/tarifas-valor-propio-escritura.test.ts`, `caminos` =
`tests/integration/db/tarifas-valor-propio-caminos.test.ts`, `pantalla-db` =
`tests/integration/db/tarifas-valor-propio-pantalla.test.ts`, `componente` =
`tests/components/TarifasMensajeros.test.tsx`, `service` = `tests/unit/services/tarifa-valor-service.test.ts`,
`e2e` = `e2e/tarifas-valor-propio-mensajero.spec.ts`.

| R | Test |
|---|---|
| R1, R2, R3, R4 | `escritura`, `service` |
| R5 | `service`, `tests/unit/types/tarifa-schemas.test.ts` |
| R6 | `service`, `escritura` (la base: ya en `tarifas-flexibles-migration.test.ts`) |
| R7, R8, R9 | `escritura` |
| R10 | `service`, `tests/integration/actions/tarifas-action.test.ts`, `pantalla-db` |
| R11 | `escritura` |
| R12, R13, R14, R15, R16, R17, R18, R19, R20 | `caminos` |
| R21, R22, R24, R25 | `caminos` |
| R23 | `pantalla-db`, `tests/unit/tarifas/faltantes.test.ts` |
| R26 | `escritura` |
| R27, R28, R30, R31, R32, R33, R34, R35, R36 | `componente` |
| R29 | `componente`, `tests/components/TarifasModulo.test.tsx` |
| R31, R32, R37 | `pantalla-db` |
| R38 | `e2e`, `componente` |
| R39 | `e2e` |
| R40 | `e2e` |

### Cobertura de las decisiones cerradas

| Decisión | R |
|---|---|
| ¿Dónde se digita? | R27, R28 |
| ¿Qué puede tener valor propio? | R2, R14, R28 |
| ¿El mensajero lo ve en su portal? | R39 |
| Nivel y precedencia | R1, R6, R12, R13, R14 |
| IVA, modo y permisos | R1, R5, R10, R28, R29, R35 |
| Cierres ya hechos | R22, R24 |
| Empresa sin activar | R21, R22, R34 |
| Faltantes de la zona | R23 |
| ¿E2E? | R40 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Dónde se digita? | En la pantalla de Tarifas, en una sección de mensajeros con valor propio. No en la ficha del mensajero. |
| 2026-11-05 | ¿Qué puede tener valor propio? | Cada uno de los 5 resultados. El que no se digite usa el valor de la zona. |
| 2026-11-05 | ¿El mensajero lo ve en su portal? | No cambia nada: ve sus pagos como hoy, con el importe correcto. |
| 2026-11-05 | Nivel y precedencia | Heredado de SLT-52 (R6, R19): valor propio > grupo > zona, sin zona, grupo ni vehículo. |
| 2026-11-05 | IVA, modo y permisos | Heredado de SLT-52: sin IVA, monto o porcentaje; `maestro` escribe, `admin` lee. |
| 2026-11-05 | Cierres ya hechos | Heredado de SLT-52: el pago queda congelado al cerrar; un cambio solo afecta lo que se cierre después. |
| 2026-11-05 | Empresa sin activar | Heredado de SLT-54: puede digitar, pero no aplica hasta activar. |
| 2026-11-05 | Faltantes de la zona | Heredado de SLT-54: el valor propio no cubre el faltante de una zona. |
| 2026-11-05 | ¿E2E? | Sí: es dinero (`docs/checkpoints-proyecto.md`). |
