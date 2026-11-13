# SLT-60 — confirmar-pago-plataforma · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SL-45 «Pago a la plataforma desde la wallet», SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» · **Rama** `feature/SLT-60-confirmar-pago-plataforma`
>
> **Alcance.** El pago a la plataforma que la empresa registra en su wallet (SL-45) queda «Por confirmar»: la
> caja baja al registrar, pero la deuda no baja hasta que el superadmin lo confirme. Solo se pagan facturas
> **cerradas**: el tope de registro es el saldo de las facturas cerradas menos los pagos por confirmar. En el
> detalle de la empresa (Plataforma > Empresas), el superadmin ve los pagos por confirmar y los confirma
> repartiéndolos entre una o varias facturas cerradas, con pago parcial (el sistema propone las más viejas
> primero). Una factura queda pagada cuando su saldo llega a 0. La empresa anula su pago solo mientras está por
> confirmar. Empresas muestra el contador de pagos por confirmar.
>
> **Lo que NO entra.**
> - Rechazar un pago con motivo y mostrar el estado de cada pago en la wallet: SLT-142 «Rechazo del pago a la plataforma
>   y su estado en la wallet» (sale de este corte).
> - Que el superadmin registre un pago hecho por fuera y anule un pago confirmado: SLT-143 «El superadmin registra un pago
>   hecho por fuera y anula un pago confirmado» (sale de este corte).
> - Los correos al superadmin y al maestro: SLT-132 «Correos del pago a la plataforma».
> - El período de gracia, la mora y la operación congelada: SLT-121 «Planes: plazo de pago de la factura y
>   operación congelada por mora».
> - Las pantallas de lista y detalle de facturas: SLT-119 «Planes: pantallas de facturas para el superadmin y
>   el maestro».
> - Cobrar de verdad (pasarela, conciliación bancaria): sigue fuera, como en SL-45.
> - Absorbe SLT-131 «Planes: el superadmin marca pagada la factura de un ciclo», cancelada el 2026-11-11.
>
> Sembrado por `/afinar-feature` el 2026-11-11 y acotado el 2026-11-13 (corte en tres por tamaño). El bloque de
> Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no
> los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Escritos por `spec_author` el 2026-11-13. Vocabulario:
- **Pago**: una fila del libro de la caja con la categoría «Pago a la plataforma» (SL-45).
- **Pago anulado**: el que tiene su contra-asiento.
- **Pago confirmado**: el que el superadmin confirmó.
- **Pago por confirmar**: el que no está anulado ni confirmado.
- **Saldo de una factura cerrada**: su total menos lo que se le aplicó en las confirmaciones.
- **Disponible para registrar**: la suma del saldo de las facturas cerradas de la empresa menos la suma de sus
  pagos por confirmar.

### Registro del pago por la empresa

- **R1.** CUANDO un `maestro` o un `admin` registra un pago cuyo monto no supera lo disponible para registrar
  de su empresa, el sistema DEBE guardarlo como pago por confirmar. Con el mismo efecto en la caja que en
  SL-45: la cifra principal y la ganancia bajan en el monto, y «Salió» sube en el monto.
- **R2.** SI el monto de un pago supera lo disponible para registrar, ENTONCES el sistema DEBE rechazarlo como
  error de validación en el campo `monto`. No debe escribir ninguna fila en el libro ni en el historial.
  Igual al disponible, cabe.
- **R3.** SI la empresa no tiene facturas cerradas con saldo, o lo disponible para registrar es 0 o
  negativo, ENTONCES el sistema DEBE rechazar cualquier pago como en R2.
- **R4.** SI se intenta insertar un pago directamente en la base con el rol de la app (sin pasar por la
  pantalla) y su monto supera lo disponible, ENTONCES la base DEBE rechazarlo sin escribir la fila.
- **R5.** CUANDO dos pagos de la misma empresa se registran a la vez y juntos superan lo disponible, el sistema
  DEBE aceptar como mucho los que caben y rechazar los demás según R2.
- **R6.** MIENTRAS un pago está por confirmar, el sistema NO DEBE descontarlo de la deuda de la empresa con la
  plataforma, pero SÍ DEBE descontarlo de lo disponible para registrar.

### La deuda

- **R7.** El sistema DEBE calcular la deuda de la empresa con la plataforma así: cargos − reversos + cuotas de
  las facturas cerradas − la suma de los pagos **confirmados**. Debe dar la misma cifra en la wallet de la
  empresa y en el listado de Empresas del superadmin.
- **R8.** El sistema DEBE mostrar en el listado de Empresas, como «Pagado», la suma de los pagos
  **confirmados** de cada empresa.

### Anulación por la empresa

- **R9.** CUANDO un `maestro` o un `admin` anula con motivo un pago por confirmar, el sistema DEBE anularlo
  como en SL-45. El contra-asiento devuelve el monto a la caja, y el monto vuelve a lo disponible para
  registrar.
- **R10.** SI un `maestro` o un `admin` intenta anular un pago confirmado, ENTONCES el sistema DEBE responder
  `forbidden` y no escribir nada: ni la constancia de anulación, ni el contra-asiento, ni el historial.
- **R11.** SI se intenta insertar en la base, con cualquier rol, el contra-asiento de un pago confirmado,
  ENTONCES la base DEBE rechazarlo.

### Lo que ve el superadmin en el detalle de la empresa

- **R12.** CUANDO el superadmin abre el detalle de una empresa, el sistema DEBE mostrar la sección «Pagos por
  confirmar». Lista los pagos por confirmar de esa empresa, del más viejo al más nuevo, cada uno con su
  monto, su fecha, su referencia y quién lo registró. Sin pagos por confirmar, la sección dice «No hay pagos
  por confirmar».
- **R13.** SI la lectura de los pagos por confirmar falla, ENTONCES la sección DEBE decir «No se pudieron
  cargar los pagos por confirmar» y el resto del detalle de la empresa DEBE pintarse igual.
- **R14.** CUANDO el superadmin elige confirmar un pago, el sistema DEBE proponer un reparto:
  - entre las facturas cerradas de la empresa con saldo mayor que 0, de la más vieja a la más nueva;
  - aplicando a cada una el menor entre su saldo y lo que falta repartir del pago, hasta agotarlo;
  - con, por factura, el número, el período, el total, el saldo y el monto propuesto.
- **R15.** El sistema NO DEBE ofrecer en el reparto ni aceptar al confirmar una factura en curso, una por
  cerrar, una de otra empresa ni una con saldo 0 o menor.

### Confirmar y repartir

- **R16.** CUANDO el superadmin confirma un pago por confirmar con un reparto válido, el sistema DEBE, en una
  sola operación:
  - dejarlo confirmado, con quién lo confirmó y cuándo;
  - guardar una aplicación por cada factura con monto mayor que 0;
  - bajar el saldo de cada factura en su monto;
  - bajar la deuda de la empresa en el monto del pago.

  La caja de la empresa y las facturas cerradas (sus cifras, su número y su estado) no cambian.
- **R17.** Un reparto es válido solo si cumple todo esto:
  - cada monto tiene como mucho dos decimales y no es negativo; los de 0 no se guardan;
  - ningún monto supera el saldo de su factura en el momento de confirmar;
  - ninguna factura aparece dos veces;
  - la suma de los montos es exactamente el monto del pago.

  SI no se cumple, ENTONCES el sistema DEBE responder un error de validación que diga qué falla, sin escribir
  nada.
- **R18.** CUANDO el saldo de una factura cerrada llega a 0 por las aplicaciones, el sistema DEBE tratarla
  como pagada: no vuelve a ofrecerse en el reparto (R14).
- **R19.** SI el superadmin confirma un pago que ya está confirmado, ENTONCES el sistema DEBE responder «ya
  confirmado» sin escribir nada. Esto vale también para dos confirmaciones simultáneas del mismo pago:
  exactamente una escribe.
- **R20.** SI el superadmin confirma un pago anulado, inexistente o de otra empresa que la del detalle,
  ENTONCES el sistema DEBE responder «no encontrado» sin escribir nada.
- **R21.** CUANDO la empresa anula un pago y el superadmin lo confirma a la vez, el sistema DEBE dejar que
  gane exactamente una de las dos operaciones. Si gana la anulación, la confirmación responde «no
  encontrado». Si gana la confirmación, la anulación responde `forbidden`.
- **R22.** CUANDO se confirma un pago por confirmar, lo disponible para registrar de la empresa NO DEBE
  cambiar: el saldo baja y los pagos por confirmar bajan en el mismo monto.
- **R23.** CUANDO una confirmación termina bien, la sección «Pagos por confirmar» DEBE dejar de mostrar ese
  pago sin recargar la página a mano.

### Permisos y aislamiento

- **R24.** SI quien pide ver los pagos por confirmar de una empresa, o confirmar uno, no es el superadmin,
  ENTONCES el sistema DEBE responder `forbidden` antes de leer o escribir nada.
- **R25.** El rol de la app de una empresa DEBE poder leer solo sus propias confirmaciones y aplicaciones, y
  NO DEBE poder insertarlas, cambiarlas ni borrarlas (`42501`).
- **R26.** Una confirmación o una aplicación guardada NO DEBE poder cambiarse, tampoco por el dueño de la base.

### Listado de Empresas

- **R27.** MIENTRAS una empresa tiene pagos por confirmar, el listado de Empresas DEBE mostrar en su fila
  cuántos son: «1 pago por confirmar» o «N pagos por confirmar». Con 0, no muestra nada.

### Despliegue

- **R28.** CUANDO se aplica la migración de esta ficha, el sistema NO DEBE crear confirmaciones ni
  aplicaciones para los pagos que ya existan: quedan por confirmar.
- **R29.** La migración DEBE tener su `down.sql`, que la revierte entera, incluido el tope de registro de
  SLT-118.

### Punta a punta

- **R30.** El sistema DEBE tener un E2E, en el grupo `dinero`, que recorra:
  - la empresa paga una factura cerrada y la deuda no baja;
  - un pago mayor que lo disponible es rechazado;
  - el superadmin ve el contador en Empresas y confirma el pago con el reparto propuesto;
  - la deuda de la empresa baja;
  - la empresa ya no puede anular el pago confirmado.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| SLT-60 y SLT-131, un solo flujo | R16 |
| La caja baja al registrar, la deuda al confirmar | R1, R6, R7 |
| Pagos registrados antes de esta feature | R28 (más la comprobación antes del deploy, en `tasks.md`) |
| Una o varias facturas, pago parcial, propone las más viejas | R14, R16, R17, R18 |
| Solo facturas cerradas, sin excedentes | R15, R17 |
| Tope al registrar | R2, R3, R4, R5, R6, R22 |
| La empresa anula solo mientras está por confirmar | R9, R10, R11, R21 |
| Corte por tamaño, tamaño (×2) | Sin comportamiento: definen el alcance y el tamaño del PR |
| Avisos solo en la app: el contador | R27 |
| Datos del pago | R12 (el registro no cambia: SL-45) |
| Quién registra y quién confirma | R1, R24 |
| Libro y categoría | R9, R26 |
| Deuda | R7, R8 |
| E2E | R30 |

## Preguntas abiertas

- **Factura cerrada con total negativo.** El código de SLT-118 lo permite: una factura sin cuota cuyos
  reversos, por fecha del reverso, superan sus cargos. Las decisiones no lo cubren. El design asume esto
  (design §3.1):
  - su saldo cuenta con signo en lo disponible para registrar, igual que en la deuda;
  - nunca se ofrece ni acepta aplicaciones (R15).

  Si el humano decide otra cosa, cambian R3, R15 y la función del saldo.
- **¿El superadmin ve el comprobante del pago al confirmar?** El código no lo resuelve:
  - el comprobante (`wallet_comprobante`) solo se abre hoy desde la sesión de la empresa;
  - abrirlo desde la plataforma pide firmar la URL con `conEmpresa` de esa empresa, como el detalle de
    `bug_report`.

  El design asume que **no** lo ve en esta ficha: la sección muestra monto, fecha, referencia y quién lo
  registró. Si el humano lo quiere, son unos 3 archivos más.
- **Textos de la wallet que dejan de ser ciertos.** Con esta ficha, tres textos de SL-45 dicen algo que ya no
  es verdad:
  - la pista de la región («…sale de la caja y baja esta deuda»);
  - el mensaje del tope («El pago no puede ser mayor que lo que la empresa debe a la plataforma.»);
  - la ayuda `docs/ayuda/oficina/wallet-caja.md` («La deuda baja en el monto»).

  Cambiarlos rompe unos 6 tests más que fijan esos literales. Propuesta: que los ajuste SLT-142 «Rechazo del
  pago a la plataforma y su estado en la wallet», que es la ficha del estado del pago en la wallet. La
  alternativa es meterlos aquí. Decide el humano.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | SLT-60 y SLT-131 se pisan | Un solo flujo: el pago de la wallet se confirma y se reparte entre facturas. SLT-131 se cancela (humano). |
| 2026-11-11 | ¿Cuándo baja la caja de la empresa? | **Al registrar**: el dinero ya salió. La deuda baja solo al confirmar (humano). |
| 2026-11-11 | Pagos registrados antes de esta feature | Quedan confirmados (humano). **2026-11-13:** en producción no hay pagos registrados y solo existe el período en curso: no hace falta aplicarlos a facturas. Comprobación antes del deploy: contar los pagos en prod; con más de 0, se decide (humano). |
| 2026-11-11 | ¿Cómo se aplica un pago a las facturas? | A **una o varias** facturas y se admite **pago parcial**. El sistema propone las más viejas primero y el superadmin ajusta. Ejemplo: un pago de 300 000 contra la factura 1–15 nov (200 000, queda pagada) y la 16–30 nov (100 000, queda con saldo de 80 000). Una factura queda pagada cuando su saldo llega a 0 (humano). |
| 2026-11-13 | Pago mayor que el saldo de las facturas cerradas | **Solo se pagan facturas cerradas, sin excedentes.** No se confirma más que el saldo de las cerradas, y la factura en curso no recibe pagos (humano). |
| 2026-11-13 | Tope al registrar | Saldo de las facturas **cerradas** menos los pagos **por confirmar**. Ejemplo: tiene cerradas por 380 000 y 200 000 por confirmar, así que puede registrar hasta 180 000. Sin facturas cerradas, no puede registrar. Ajusta la decisión del 2026-11-11 (deuda menos pagos vigentes) y D4 de SL-45 (humano). |
| 2026-11-11 | ¿Cuándo anula la empresa su propio pago? | **Solo mientras está «Por confirmar»**. Una vez confirmado, solo lo toca el superadmin (humano). |
| 2026-11-13 | Corte por tamaño | Tres fichas: esta (confirmar y repartir), SLT-142 «Rechazo del pago a la plataforma y su estado en la wallet» y SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado» (humano). |
| 2026-11-11 | Avisos | En esta ficha, **solo en la app**: contador de «pagos por confirmar» en Empresas. El estado de cada pago en la wallet va a SLT-142. Los correos van a SLT-132 (humano). |
| 2026-11-11 | Datos del pago | Heredados de SL-45: monto, fecha, referencia y comprobante opcional. |
| 2026-11-11 | Quién registra en la empresa | Heredado de SL-45 D5: `maestro` y `admin`. Confirmar y repartir: solo el superadmin. |
| 2026-11-11 | Libro y categoría | Heredado de SL-45 D6, D8 y D13: categoría `egreso_pago_plataforma`, anulación por contra-asiento con motivo y libro append-only en la base. |
| 2026-11-11 | Deuda | Heredada de SLT-118: cargos − reversos + cuotas de facturas cerradas − pagos, pero ahora solo cuentan los pagos **confirmados**. |
| 2026-11-11 | E2E | Obligatorio: toca el flujo crítico «Dinero: wallet» (`docs/checkpoints-proyecto.md`). |
| 2026-11-11 | Tamaño | Los correos salen a SLT-132 para que quepa en el tope del PR (humano). |
| 2026-11-13 | Tamaño tras la segunda pasada | El humano acepta un PR por encima del tope (~46 archivos, ~13 son tests existentes que hay que sembrar con una factura cerrada); no se parte otra vez. |
