# SLT-143 — pago-plataforma-por-fuera · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-60 «Confirmación del pago a la plataforma por el
> superadmin» (done) · **Rama** `feature/SLT-143-pago-plataforma-por-fuera` · **Ruta** completa (dinero, migración)
>
> **Alcance (de la tarjeta).** Dos operaciones del superadmin, en el detalle de la empresa (Plataforma > Empresas):
> 1. **Registrar un pago que la empresa hizo por fuera.** Nace confirmado y repartido entre facturas **cerradas**
>    (sin excedentes, como en SLT-60). Baja la deuda al instante, crea el egreso «Pago a la plataforma» en la caja
>    de la empresa y baja su caja y su ganancia, como un pago desde la wallet.
> 2. **Anular, con motivo obligatorio, un pago ya confirmado.** Las facturas recuperan su saldo, la deuda sube y el
>    contra-asiento devuelve el dinero a la caja.
>
> **Lo que NO entra.**
> - Rechazar un pago por confirmar y el estado de cada pago en la wallet: SLT-142 «Rechazo del pago a la plataforma
>   y su estado en la wallet».
> - Los correos y cualquier otro aviso. **Pendiente para SLT-132 «Correos del pago a la plataforma»:** avisar al
>   maestro cuando la plataforma registra un pago hecho por fuera y cuando anula un pago confirmado (decisión P7 del
>   2026-11-19).
> - Una entrada de historial por estas dos operaciones (decisión P6 del 2026-11-19).
> - La mora y la operación congelada cuando la factura que recupera saldo ya venció: SLT-121 «Planes: plazo de
>   pago de la factura y operación congelada por mora», que aún no existe en el código. **Frontera:** esta ficha
>   deja el saldo en la única definición de SLT-60 (`factura_plataforma_saldos`), que es la que leerá SLT-121; no
>   calcula vencimientos ni congela nada (R30).
> - Cobrar de verdad (pasarela, conciliación bancaria): sigue fuera, como en SL-45 y SLT-60.
>
> Escrito por `spec_author` el 2026-11-19. El humano respondió ese mismo día P0–P7 y aceptó **un solo PR** por
> encima del tope.

## Requisitos (EARS)

Vocabulario (el de SLT-60, más tres términos):
- **Pago por fuera:** un pago a la plataforma que registró el superadmin.
- **Pago confirmado vigente:** un pago confirmado que no está anulado.
- **Anulación de la plataforma:** la anulación de un pago confirmado hecha por el superadmin.
- **Disponible para registrar:** como en SLT-60: el saldo de las facturas cerradas menos los pagos por confirmar.

### Registrar un pago hecho por fuera

- **R1.** CUANDO el superadmin registra un pago por fuera con datos válidos y un reparto válido, el sistema DEBE
  hacer todo esto en una sola operación:
  - escribir en el libro de la caja de la empresa un «Pago a la plataforma» por el monto, con la fecha y la
    referencia dadas;
  - dejarlo confirmado, con quién lo confirmó y cuándo;
  - guardar una aplicación por cada factura con monto mayor que 0 y bajar el saldo de cada factura en su monto;
  - bajar la deuda de la empresa con la plataforma en el monto.
- **R2.** CUANDO se registra un pago por fuera, la caja de la empresa DEBE cambiar igual que con un pago desde la
  wallet (SLT-60 R1): la cifra principal y la ganancia bajan en el monto, y «Salió» sube en el monto. Ejemplo: caja
  ₡500 000 y deuda ₡300 000; tras un pago de ₡100 000, caja ₡400 000 y deuda ₡200 000.
- **R3.** SI la caja de la empresa es menor que el monto, ENTONCES el sistema DEBE registrar el pago igual. La
  caja queda negativa.
- **R4.** CUANDO el superadmin escribe el monto en el formulario, el sistema DEBE proponer el reparto como en
  SLT-60 R14:
  - entre las facturas cerradas con saldo mayor que 0, de la más vieja a la más nueva;
  - el menor entre el saldo y lo que falta repartir;
  - con, por factura, el número, el período, el total, el saldo y el monto propuesto, que el superadmin puede
    ajustar.
- **R5.** Un reparto es válido solo si cumple las reglas de SLT-60 R15 y R17. La suma de los montos tiene que ser
  exactamente el monto del pago. SI no es válido, ENTONCES el sistema DEBE responder un error de validación que diga
  qué falla, sin escribir nada: ni el libro, ni la confirmación, ni las aplicaciones, ni el comprobante.
- **R6.** SI lo disponible para registrar es 0 o negativo, o el monto lo supera, ENTONCES el sistema DEBE responder
  un error de validación en `monto`, con el mensaje de SLT-60 R36, sin escribir nada. Igual a lo disponible, cabe.
  Ejemplo: cerradas por ₡380 000 y ₡200 000 por confirmar ⇒ ₡180 000 se registra y ₡180 000,01 no.
- **R7.** SI el monto no es mayor que 0, tiene más de dos decimales o no cabe en el importe del libro, o si la
  referencia está vacía, o si la fecha no cumple las reglas del egreso manual (SL-45 R12), ENTONCES el sistema DEBE
  responder un error de validación en ese campo, sin escribir nada.
- **R8.** DONDE el superadmin adjunta un comprobante, el sistema DEBE guardarlo como el comprobante de ese pago,
  en la carpeta de la empresa, con los tipos y el tamaño que admite el de la wallet. Sin comprobante, el pago se
  registra igual.
- **R9.** SI el registro se rechaza después de subir el comprobante, ENTONCES el sistema NO DEBE dejar ninguna
  fila del pago ni del comprobante, y DEBE tratar el archivo subido como la wallet trata el de un registro que no
  quedó (ficha 458-B).
- **R10.** CUANDO llega dos veces el mismo registro (misma clave), el sistema DEBE escribir un solo pago. Al segundo
  envío DEBE responder «ya registrado», sin escribir nada.
- **R11.** CUANDO llegan a la vez dos pagos de la misma empresa (dos por fuera, o uno por fuera y otro desde la
  wallet) y juntos superan lo disponible para registrar, el sistema DEBE aceptar solo los que caben y rechazar los
  demás según R6 (los de la wallet, según SLT-60 R2).
- **R12.** Un pago por fuera NO DEBE contarse como pago por confirmar. No sale en «Pagos por confirmar» ni en el
  contador de Empresas. Lo disponible para registrar baja exactamente en su monto.

### La marca en la wallet

- **R13.** MIENTRAS un pago fue registrado por la plataforma, el libro de la caja de la empresa DEBE mostrarlo con
  el concepto «Pago a la plataforma», con la referencia del superadmin y con «Registrado por la plataforma» en
  «Registró». Lo DEBE mostrar así en la tabla, en el detalle de la fila y en la descarga. Ni el nombre ni el id del
  superadmin DEBEN llegar a la empresa.
- **R14.** Un pago registrado por la empresa NO DEBE llevar la marca, tampoco después de que el superadmin lo
  confirme.
- **R15.** SI un `maestro` o un `admin` intenta anular un pago registrado por la plataforma, ENTONCES el sistema
  DEBE responder `forbidden` sin escribir nada, como con cualquier pago confirmado (SLT-60 R10).

### La sección «Pagos confirmados»

- **R16.** CUANDO el superadmin abre el detalle de una empresa, el sistema DEBE mostrar la sección «Pagos
  confirmados». Lista los pagos confirmados vigentes de la empresa, del confirmado más reciente al más viejo. Cada
  uno muestra:
  - la fecha, el monto y la referencia;
  - quién lo registró, o «Registrado por la plataforma»;
  - quién lo confirmó y cuándo;
  - las facturas a las que se aplicó, con su número y el monto aplicado;
  - «Ver comprobante» o «Sin comprobante»;
  - el botón «Anular…».

  Sin pagos confirmados vigentes, la sección dice «No hay pagos confirmados».
- **R17.** La cabecera de «Pagos confirmados» DEBE ofrecer el botón «Registrar pago hecho por fuera…», que abre el
  formulario con monto, fecha, referencia, comprobante opcional y el reparto. SI la empresa no tiene facturas
  cerradas con saldo, ENTONCES el formulario DEBE decir «La empresa no tiene facturas cerradas con saldo» y no
  ofrecer registrar.
- **R18.** SI falla la lectura de los pagos de la empresa, ENTONCES la sección DEBE decir «No se pudieron cargar
  los pagos confirmados», y el resto del detalle DEBE pintarse igual.
- **R19.** CUANDO un registro o una anulación termina bien, las secciones «Pagos por confirmar» y «Pagos
  confirmados» DEBEN mostrarlo sin recargar la página a mano.
- **R20.** CUANDO el superadmin pulsa «Ver comprobante» de un pago confirmado, el sistema DEBE abrirlo como en
  SLT-60 R33 y R34.

### Anular un pago confirmado

- **R21.** CUANDO el superadmin anula con motivo un pago confirmado vigente, sea de la empresa o por fuera, el
  sistema DEBE hacer todo esto en una sola operación:
  - guardar la anulación con el motivo, quién la hizo y cuándo;
  - escribir el contra-asiento que devuelve el monto a la caja: la cifra principal, «Entró» y la ganancia suben en
    el monto (SL-45 §4);
  - devolver a cada factura exactamente lo que se le había aplicado;
  - subir la deuda de la empresa en el monto.
- **R22.** Ejemplo: tras el pago de R2 (caja ₡400 000, deuda ₡200 000), al anularlo la caja vuelve a ₡500 000, la
  deuda a ₡300 000 y la factura a su saldo anterior.
- **R23.** SI el motivo está vacío o solo tiene espacios, ENTONCES el sistema DEBE responder un error de validación
  en `motivo`, sin escribir nada.
- **R24.** SI el pago ya está anulado, ENTONCES el sistema DEBE responder «ya anulado» sin escribir nada. Esto vale
  también para dos anulaciones simultáneas del mismo pago: exactamente una escribe.
- **R25.** SI el pago no existe o es de otra empresa que la del detalle, ENTONCES el sistema DEBE responder «no
  encontrado» sin escribir nada. SI está por confirmar, ENTONCES DEBE responder «no confirmado» sin escribir nada:
  rechazarlo es SLT-142.
- **R26.** CUANDO un pago confirmado se anula, el sistema DEBE dejar de contarlo como pagado:
  - no cuenta en la deuda (wallet y Empresas);
  - no cuenta en «Pagado» del listado de Empresas;
  - no cuenta en el saldo de las facturas;
  - no vuelve a ser un pago por confirmar.

  Lo disponible para registrar sube exactamente en su monto.
- **R27.** Un pago anulado por la plataforma NO DEBE poder confirmarse ni anularse otra vez. Confirmarlo responde
  «no encontrado» (SLT-60 R20) y anularlo, «ya anulado».
- **R28.** CUANDO un pago se anula por la plataforma, el libro de la wallet DEBE mostrarlo anulado con su motivo,
  como cualquier anulación de SL-45. El contra-asiento DEBE salir como fila propia.
- **R29.** SI se inserta en la base, con cualquier rol, el contra-asiento de un pago confirmado sin su anulación de
  la plataforma, ENTONCES la base DEBE rechazarlo (SLT-60 R11 sigue en pie).
- **R30.** La anulación NO DEBE escribir en las facturas: ni sus cifras, ni su número, ni su estado. El saldo
  recuperado se lee de la misma definición que usará SLT-121.

### Permisos y aislamiento

- **R31.** SI quien pide registrar por fuera, anular o leer los pagos confirmados no es el superadmin, ENTONCES el
  sistema DEBE responder `forbidden` antes de leer o escribir nada.
- **R32.** El rol de la app de una empresa DEBE poder leer solo sus propias anulaciones de la plataforma, y NO DEBE
  poder insertarlas, cambiarlas ni borrarlas (`42501`). Una anulación guardada NO DEBE poder cambiarse, tampoco por
  el dueño de la base.

### Despliegue

- **R33.** CUANDO se aplica la migración de esta ficha, el sistema NO DEBE crear datos: los pagos confirmados
  siguen confirmados y sin marca. La migración DEBE tener su `down.sql`, que la revierte entera, incluidos los
  cuerpos de SLT-60 que cambia.

### Punta a punta y ayuda

- **R34.** El sistema DEBE tener un E2E, en el grupo `dinero`, que recorra:
  - el superadmin registra un pago por fuera con el reparto propuesto;
  - en la wallet de la empresa, la deuda y la caja bajan en el monto, y la fila lleva «Registrado por la
    plataforma»;
  - el maestro no puede anularlo;
  - el superadmin lo anula con motivo;
  - la deuda y la caja vuelven a su valor, y el pago sale de «Pagos confirmados»;
  - en la wallet, el contra-asiento dice «Anulado por la plataforma» (R36).
- **R35.** La ayuda de la wallet (`docs/ayuda/oficina/wallet-caja.md`, sección «Lo que la empresa debe a la
  plataforma») DEBE explicar dos cosas:
  - el pago registrado por la plataforma: lleva la marca, baja la caja y la deuda, y la empresa no lo anula;
  - que la plataforma puede anular un pago confirmado, y que eso devuelve el monto a la caja y sube la deuda.

### La marca de la anulación en la wallet (decisión del 2026-11-19)

- **R36.** CUANDO la plataforma anula un pago (R21), el libro de la caja de la empresa DEBE mostrar «Anulado por
  la plataforma», sin el nombre ni el id del superadmin, igual que la marca del registro (R13). En concreto:
  - el contra-asiento lleva «Anulado por la plataforma» en «Registró», en la tabla, en el detalle de la fila y en
    la descarga;
  - el detalle del pago anulado dice, en su línea de anulación, que lo anuló la plataforma, junto al día, la hora y
    el motivo.

  Una anulación hecha por la empresa (SL-45) NO DEBE llevar esta marca.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Se ve en la wallet y baja la caja (2026-11-19) | R1, R2, R12, R34 |
| La marca en el libro (2026-11-19) | R13, R14, R34 |
| La caja puede quedar negativa (2026-11-19) | R3 |
| Frontera con SLT-121 (2026-11-19) | R30 |
| «Anulado por la plataforma» en el libro (2026-11-19) | R36, R34 |
| P0, un solo PR (2026-11-19) | Sin comportamiento: tamaño del PR |
| P1, campos y comprobante opcional | R7, R8, R9, R20 |
| P2, reparto como SLT-60 | R4, R5 |
| P3, el tope es lo disponible | R6, R11, R12 |
| P4, la sección «Pagos confirmados» | R16, R17, R18, R19 |
| P5, el mismo efecto al anular | R21, R22, R26 |
| P6, sin historial | Sin comportamiento nuevo: no se escribe historial (lo comprueba el test de integración, design §8) |
| P7, sin avisos | «Lo que NO entra» (pendiente para SLT-132) |
| Heredadas de SLT-60 y SL-45 | R5, R6, R10, R11, R15, R23, R24, R25, R27, R28, R29, R31, R32, R33 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-19 | ¿El pago por fuera se ve en la wallet y baja la caja? | **Sí, igual que un pago desde la wallet:** libro «Pago a la plataforma», baja la caja y la ganancia, y baja la deuda al instante, porque nace confirmado y repartido. Ejemplo: caja ₡500 000, deuda ₡300 000, pago ₡100 000 ⇒ caja ₡400 000, deuda ₡200 000 (humano). |
| 2026-11-19 | ¿Cómo se distingue en el libro de la wallet? | Mismo nombre, «Pago a la plataforma», con la marca **«Registrado por la plataforma»** y la referencia que puso el superadmin. Se ve en la tabla, en el detalle y en la descarga (humano). |
| 2026-11-19 | ¿Y si la caja no alcanza? | **Se registra igual:** la caja puede quedar negativa (humano). |
| 2026-11-19 | La mora de SLT-121 al anular con la factura vencida | Frontera: SLT-121 aún no existe y no se implementa aquí (leader). |
| 2026-11-19 | P0: no cabe en un PR (~46 archivos, ~1 200 líneas de producción) | **Un solo PR**, sin partir (humano). |
| 2026-11-19 | P1: campos del registro | Los de SL-45: monto, fecha, referencia obligatoria y comprobante **opcional** (humano). |
| 2026-11-19 | P2: reparto del pago por fuera | Como en SLT-60: propone las cerradas más viejas y el superadmin ajusta (humano). |
| 2026-11-19 | P3: tope del pago por fuera | El de SLT-60: saldo de las cerradas menos los pagos por confirmar (humano). |
| 2026-11-19 | P4: dónde se anula | Una sección nueva, «Pagos confirmados», en el detalle de la empresa, con «Anular…» por fila y «Registrar pago hecho por fuera…» en la cabecera (humano). |
| 2026-11-19 | P5: anular un pago de la empresa frente a uno por fuera | El mismo efecto: contra-asiento a la caja, la deuda sube y las facturas recuperan su saldo (humano). |
| 2026-11-19 | P6: historial | Sin entrada en el historial (humano). |
| 2026-11-19 | P7: avisos | Ninguno en esta ficha. Queda pendiente para SLT-132 «Correos del pago a la plataforma» (humano). |
| 2026-11-19 | ¿Cómo se ve en la wallet la anulación hecha por la plataforma? | **«Anulado por la plataforma»**, sin el nombre del superadmin, en la tabla, el detalle y la descarga, igual que la marca del registro (humano). |
| 2026-11-19 | Resueltas por herencia | La empresa no anula un pago registrado por la plataforma, porque nace confirmado (SLT-60, 2026-11-11). Solo el superadmin registra y anula (`ROLES_PLATAFORMA`). El superadmin no anula un pago por confirmar: eso es el rechazo de SLT-142. |
| 2026-11-11 / 2026-11-13 | Heredadas de SLT-60 (`specs/SLT-60-confirmar-pago-plataforma/requirements.md`) | Solo facturas cerradas, sin excedentes; una o varias facturas con pago parcial; confirmado, solo lo toca el superadmin; la deuda cuenta solo los pagos confirmados; libro y categoría de SL-45 (append-only, contra-asiento con motivo); E2E obligatorio (flujo crítico «Dinero: wallet»). |
