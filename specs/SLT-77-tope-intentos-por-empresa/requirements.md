# SLT-77 — tope-intentos-por-empresa · requirements.md

> Zona: fullstack · Complejidad: high · depends_on: ninguna · Rama: feature/SLT-77-tope-intentos-por-empresa
>
> **Alcance:** el `maestro` de cada empresa fija, en una sección de la pantalla de Tarifas, cuántos
> intentos de entrega se hacen antes de pasar una orden a rechazo, de 1 a 10. Toda empresa arranca
> en 3, el valor de hoy. Cada punto que hoy lee el valor global usa el de la empresa de la orden,
> también los procesos que corren sobre varias empresas.
>
> **Lo que NO entra:** cambiar qué cuenta como intento (276 R31/R32). Mostrar el número al
> mensajero (276 R10). Rechazar o cobrar órdenes en el momento de guardar. Conservar por orden el
> tope con que nació. Pantalla nueva.
>
> Sembrado por `/afinar-feature` el 2026-11-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

**Vocabulario.** *Tope*: el número de intentos de entrega de una empresa. *Intentos vigentes*: el
número de `contarIntentosVigentes` (215), sin cambios. *En el tope*: intentos vigentes `>= tope - 1`,
la gestión que se registre ahora es la que lo alcanza. *Agotada*: intentos vigentes `>= tope`.
*Rechazo por tope*: paso a `rechazada` que ocurre solo porque la orden está agotada, no porque venció
un plazo.

### A · El ajuste

- **R1.** El sistema DEBE guardar para cada empresa un único tope, entero, de 1 a 10.
- **R2.** CUANDO se aplica la migración, toda empresa existente DEBE quedar con tope 3; y toda empresa
  dada de alta después DEBE nacer con tope 3, sin que nadie lo fije.
- **R3.** CUANDO el `maestro` guarda un tope válido, el sistema DEBE dejarlo en la empresa de su sesión.
  La empresa NO DEBE salir de la entrada del cliente.
- **R4.** SI quien guarda no es `maestro`, incluido el `admin`, ENTONCES el sistema DEBE responder
  `forbidden`, sin validar la entrada y sin efectos.
- **R5.** SI el valor no es un entero de 1 a 10, ENTONCES el sistema DEBE responder `validation_error`
  en el servidor, sin efectos.
- **R6.** La base de datos DEBE rechazar un tope fuera de 1 a 10 aunque llegue por SQL a mano.
- **R7.** Guardar en una empresa NO DEBE cambiar el tope de otra. La aplicación NO DEBE poder escribir
  la fila de otra empresa, ni ninguna otra columna de `organizacion` que el tope y su fecha de
  actualización, tampoco con SQL a mano.
- **R8.** CUANDO se guarda un tope, el sistema NO DEBE escribir en órdenes, gestiones, historial de
  estados, cierres ni billeteras, aunque haya órdenes que ya alcancen el valor nuevo.
- **R9.** CUANDO se guarda un tope, la siguiente decisión de esa empresa DEBE usarlo, sin caché, esté o
  no activado el modelo nuevo de tarifas (SLT-54).
- **R10.** CUANDO un guardado cambia el tope, el sistema DEBE dejar en el historial de acciones, en la
  misma transacción, quién lo cambió, el valor anterior y el nuevo.
- **R11.** SI se guarda el mismo valor que ya rige, ENTONCES el sistema NO DEBE escribir ni dejar
  historial, y DEBE responder bien.

### B · La pantalla

- **R12.** MIENTRAS el rol es `maestro`, `/configuracion/tarifas` DEBE mostrar una sección con el tope
  vigente, un control para elegirlo de 1 a 10 y un botón de guardar. NO DEBE haber ruta nueva.
- **R13.** MIENTRAS el rol es `admin`, la sección DEBE mostrar el tope vigente en solo lectura, sin
  control ni botón (SLT-54 R55).
- **R14.** SI el rol es otro o no hay sesión, ENTONCES el sistema NO DEBE mostrar ni devolver el tope
  por esta pantalla.
- **R15.** MIENTRAS el valor elegido es menor que el guardado, la sección DEBE mostrar un aviso visible,
  antes de guardar, que diga que: guardar no rechaza ni cobra nada; las novedades que ya alcancen el
  nuevo tope se rechazan en la siguiente corrida automática, sin más clics, y ese rechazo genera cobro;
  y las órdenes en bodega que ya lo alcancen no se podrán asignar (decisión P1).
- **R16.** MIENTRAS el valor elegido es igual o mayor que el guardado, la sección NO DEBE mostrar ese
  aviso.
- **R17.** SI guardar falla, ENTONCES la sección DEBE decirlo y conservar el valor elegido; sus textos NO
  DEBEN usar siglas ni nombres de columna, NI afirmar que el número viene de una ley. A 390 px NO DEBE
  causar desplazamiento horizontal y sus controles DEBEN medir al menos 44 px de alto.

### C · Cada punto usa el tope de su empresa

- **R18.** MIENTRAS una orden está en el tope de su empresa, el servidor NO DEBE aceptar una gestión
  `reprogramada` ni `devuelta` sobre ella, ni desde el panel del mensajero ni desde la ayuda de la
  tienda; MIENTRAS no lo está, DEBE aceptarlas.
- **R19.** SI una orden está agotada para su empresa, ENTONCES la reprogramación de la tienda desde una
  devolución DEBE responder `conflict`, sin efectos.
- **R20.** SI una orden de un lote está agotada para su empresa, ENTONCES la asignación DEBE rechazar el
  lote completo, sin efectos, desde la bodega central y desde la satélite.
- **R21.** CUANDO se aprueba un cierre, una orden barrida a `sin_gestionar` DEBE pasar a `rechazada` si
  está agotada para su empresa, y a su bodega si no lo está.
- **R22.** CUANDO corre el proceso de devoluciones, una orden en `devuelta` DEBE decidirse con el tope de
  su empresa: causa `wrong_*` agotada escala sin esperar su ventana; causa `not_found` vencida escala si
  está agotada y se libera si no; por debajo del tope las ventanas no cambian. Esto incluye a la orden
  que quedó agotada porque se bajó el tope, sin ningún otro clic.
- **R23.** CUANDO corre el aviso diario de novedades, el texto de plazo de una tienda DEBE evaluar «en el
  tope» con el tope de su empresa.
- **R24.** Los datos «en el tope» de las listas del mensajero y de novedades de la tienda DEBEN
  calcularse con el tope de su empresa.
- **R25.** La línea de tiempo de una orden DEBE dar a `maestro`, `admin`, `adminTienda` y `adminSatelite`
  el tope de su empresa como total de «Intento X de N».
- **R26.** Los procesos automáticos DEBEN correr con el tope de la empresa que procesan: dos empresas con
  topes distintos y órdenes con los mismos intentos DEBEN dar desenlaces distintos en la misma ejecución.
- **R27.** SI no se puede leer el tope de la empresa en contexto, ENTONCES la operación DEBE fallar sin
  efectos y NO DEBE usar un valor por defecto. En un proceso automático, ese fallo NO DEBE frenar a las
  demás empresas.
- **R28.** DONDE el tope es 1, una orden sin intentos DEBE estar en el tope, y su primera gestión NO DEBE
  poder ser `reprogramada` ni `devuelta`.
- **R29.** CUANDO se sube el tope, una orden sin terminar que queda por debajo DEBE volver a admitir las
  gestiones y la asignación que R18 y R20 le negaban.
- **R30.** Esta feature NO DEBE cambiar qué cuenta como intento: para los mismos datos,
  `contarIntentosVigentes` DEBE devolver lo mismo.
- **R31.** Ningún punto DEBE leer un tope global: cambiar `REINTENTOS_MIN_INTENTOS` NO DEBE cambiar
  ninguna decisión.

### D · El número no llega al mensajero

- **R32.** El sistema NO DEBE enviar el tope al navegador del mensajero: ni en sus listas, ni en la
  gestión, ni en la línea de tiempo cuando la pide con su sesión. Solo el booleano ya decidido.
- **R33.** El módulo de la regla (`lib/types/tope-intentos.ts`) NO DEBE importar configuración de
  servidor ni contener el tope: entra por parámetro.

### E · Cambios mientras algo corre

- **R34.** Una misma ejecución (corrida de un proceso por empresa, aprobación de un cierre, lote de
  asignación, carga de una lista) DEBE decidir todas sus órdenes con un solo valor del tope.
- **R35.** SI, al ir a escribir un rechazo por tope en el proceso de devoluciones o en la aprobación de
  un cierre, el tope vigente deja a la orden por debajo, ENTONCES el sistema NO DEBE rechazarla ni
  generar cobro en esa ejecución: en la aprobación va a bodega; en el proceso de devoluciones queda
  omitida para la corrida siguiente.
- **R36.** SI el tope baja mientras corre una ejecución, ENTONCES esa ejecución DEBE terminar con el valor
  mayor con que decidió, sin rechazar por el nuevo; la orden DEBE resolverse en su siguiente paso.
- **R37.** El número de lecturas del tope en una corrida NO DEBE crecer con las órdenes candidatas: una
  por corrida, más una por cada rechazo por tope que se vaya a escribir (R35).

### F · Migración, reversión y rastro

- **R38.** Las migraciones de esta feature DEBEN traer `down.sql`, y tras aplicarlo la base DEBE quedar
  como la lee el código anterior.
- **R39.** El plan de reversión de EP-8 DEBE decir que volver a un despliegue anterior regresa a toda
  empresa a 3 sin escribir en la base, y qué pasa con las empresas que tenían otro valor (`design §8`).
- **R40.** El código NO DEBE afirmar que el número viene de una ley («por ley», «cota legal», «umbral
  legal»), salvo en specs históricos y migraciones ya aplicadas.
- **R41.** Ningún registro, motivo o aviso de esta feature DEBE contener datos personales, números de guía
  ni secretos. El historial de R10 solo lleva el actor de siempre y los dos números.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| De 1 a 10 | R1, R5, R6, R17, R28, R40 |
| Quién lo cambia | R3, R4, R13, R14 |
| Órdenes en curso | R8, R9, R15, R16, R21, R22, R29, R34, R35, R36 |
| Dónde vive | R12 |
| Valor inicial | R2 |
| No depende de la activación | R9 |
| Criterio de conteo | R30 |
| El número no llega al mensajero | R32, R33 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-06 | ¿Qué valores puede elegir una empresa? | De 1 a 10. El «mínimo de 3 por ley» de la feature 47 no limita a la empresa: decide y responde por su operación. |
| 2026-11-06 | ¿Quién lo cambia? | El `maestro` de la empresa. Otros roles no lo editan; lo que ve el `admin` sigue la regla de la pantalla (SLT-54 R55). |
| 2026-11-06 | ¿Qué pasa con las órdenes en curso? | Rige al guardar para todas las órdenes sin terminar. Guardar no rechaza ni cobra: una orden que ya alcanza el nuevo tope se resuelve en su siguiente paso normal, que incluye el proceso automático de `DevolucionSlaService`. Si sube, la orden gana intentos. |
| 2026-11-06 | ¿Dónde vive el ajuste? | Sección en `/configuracion/tarifas`. No es pantalla nueva. |
| 2026-11-06 | ¿Valor inicial? | 3 para toda empresa, también las existentes. Ninguna cambia sin decidirlo. |
| 2026-11-06 | ¿Depende de «Activar tarifas nuevas»? | No: rige al guardar, con o sin activación (SLT-54). |
| 2026-11-06 | ¿Criterio de conteo? | Sin cambios. Heredado de 276 R31/R32. |
| 2026-11-06 | ¿El número llega al navegador del mensajero? | No: solo el booleano ya decidido. Heredado de 276 R10. |
| 2026-11-06 | P1 · ¿Qué pasa con una orden en bodega que queda agotada al bajar el tope? | Se acepta, sin cambiar la regla de 276: no cobra, queda parada y el aviso de R15 lo dice. La salida es volver a subir el tope o un incidente. Una salida a rechazo desde bodega sería otra ficha. Carlos, «apruebo». |
