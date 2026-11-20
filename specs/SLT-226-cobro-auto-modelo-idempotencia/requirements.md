# SLT-226 — cobro-auto-modelo-idempotencia · requirements.md

> Zona: backend · Complejidad: high · depends_on: — · Rama: feature/SLT-226-cobro-auto-modelo-idempotencia
>
> **Alcance.** El modelo del cobro en línea de una factura de la plataforma:
> - la tabla `cobro_intento` y su máquina de estados (creado → pendiente → aprobado | rechazado | expirado;
>   aprobado → devuelto | contracargo);
> - el registro de los eventos del proveedor;
> - el registro del pago aprobado.
>
> La idempotencia va en 3 capas: al crear el intento, al recibir el evento y al registrar el pago. Cada empresa
> ve solo sus cobros (RLS), y el historial de plataforma registra cada transición.
>
> **Lo que NO entra.**
> - El adaptador de Rebill: SLT-227 «Cobro automático: proveedor de cobro y adaptador de Rebill».
> - El endpoint del webhook: SLT-228 «Cobro automático: webhook de Rebill».
> - La conversión a USD: SLT-229 «Cobro automático: cobro en USD para países sin cobertura». Aquí solo se
>   guardan sus campos.
> - El enlace de pago: SLT-230 «Cobro automático: enlace de pago por factura».
> - La UI y el botón «Pagar»: SLT-231 «Cobro automático: botón «Pagar» y estado de la factura».
> - La conciliación diaria y el efecto de una devolución o un contracargo en la caja: SLT-233 «Cobro
>   automático: conciliación, devoluciones y contracargos».
>
> Sembrado por `/afinar-feature` el 2026-11-20. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

Escritos por `spec_author` el 2026-11-20. Vocabulario:
- **Intento:** un cobro en línea de una factura de la plataforma (una fila de `cobro_intento`).
- **Intento vivo:** un intento en estado `creado` o `pendiente`.
- **Saldo de la factura:** el de SLT-60 «Confirmación del pago a la plataforma por el superadmin»: el total de
  una factura cerrada menos lo aplicado por los pagos confirmados y no anulados.
- **Clave del intento:** factura + monto local + moneda de cobro + tasa (la tasa vacía si se cobra en moneda local).
- **Pago del proveedor:** el pago que el proveedor identifica con su `payment_id`.
- **Evento:** un aviso del proveedor, identificado por (proveedor, `logId`).

### Crear el intento (capa 1 de la idempotencia)

- **R1.** CUANDO se pide un intento para una factura cerrada de la empresa, con saldo mayor que 0 y sin intento
  vivo, el sistema DEBE crear un intento en estado `creado` por el saldo de la factura, en la moneda local, con
  la moneda de cobro igual a la local y el monto cobrado igual al saldo. Ejemplo: factura de ₡30 000 con ₡10 000
  confirmados ⇒ intento de ₡20 000.
- **R2.** CUANDO se pide un intento para una factura que ya tiene un intento vivo con la misma clave, el sistema
  DEBE devolver ese intento sin crear otro.
- **R3.** SI la factura tiene un intento vivo con otra clave, ENTONCES el sistema DEBE, en una sola operación,
  anular el vivo y crear uno nuevo con la clave nueva.
- **R4.** El sistema NO DEBE dejar que una factura tenga dos intentos vivos, con ningún rol ni por ningún camino.
  Dos pedidos simultáneos para la misma factura DEBEN terminar con un solo intento vivo, y los dos DEBEN recibir
  ese mismo intento.
- **R5.** SI la factura no existe, es de otra empresa, no está cerrada o su saldo es 0, ENTONCES el sistema DEBE
  rechazar el pedido sin escribir nada.
- **R6.** Los importes del intento (monto local, monto cobrado y tasa) DEBEN guardarse en decimal y ser mayores
  que 0. La base DEBE rechazar:
  - un monto 0 o negativo;
  - una foto de conversión (tasa, fuente y fecha de la tasa) incompleta;
  - una foto de conversión presente cuando la moneda de cobro es la local;
  - un monto cobrado distinto del local cuando la moneda de cobro es la local.

### La máquina de estados

- **R7.** El sistema DEBE admitir solo estos cambios de estado:
  - `creado` → `pendiente`;
  - `pendiente` → `aprobado`, `rechazado` o `expirado`;
  - `creado` o `pendiente` → `anulado` (R11, R3; decisión P4);
  - `aprobado` → `devuelto` o `contracargo`.

  SI se intenta cualquier otro cambio, con cualquier rol (también el dueño de la base), ENTONCES la base DEBE
  rechazarlo sin cambiar la fila. Un intento nuevo DEBE nacer en `creado`.
- **R8.** Un intento NO DEBE poder borrarse ni cambiar su empresa, su factura, su proveedor, su clave, sus
  importes, sus monedas ni su foto de conversión. El id externo, el id del pago del proveedor y el pago del libro
  solo DEBEN poder pasar de vacío a un valor, una vez.
- **R9.** Un intento en `aprobado`, `devuelto` o `contracargo` DEBE tener el id del pago del proveedor y su
  «Pago a la plataforma» en el libro. La base DEBE rechazar lo contrario.
- **R10.** CUANDO el proveedor crea el cobro de un intento `creado`, el sistema DEBE guardar el id externo y
  pasar el intento a `pendiente`. Un mismo id externo de un proveedor NO DEBE poder estar en dos intentos.

### El saldo cambia con un intento vivo

- **R11.** CUANDO cambia el saldo de una factura que tiene un intento vivo, el sistema DEBE anular ese intento en
  la misma operación que cambia el saldo. El saldo cambia cuando:
  - se confirma un pago que se aplica a la factura (SLT-60);
  - se registra un pago por fuera que se aplica a ella (SLT-143);
  - se anula un pago confirmado que estaba aplicado a ella (SLT-143).

  Ejemplo: intento vivo de ₡20 000; el superadmin confirma un pago de ₡5 000 aplicado a esa factura ⇒ el intento
  queda `anulado` y el siguiente pedido crea uno de ₡15 000.

### Los eventos del proveedor (capa 2 de la idempotencia)

- **R12.** CUANDO llega un evento, el sistema DEBE guardarlo una sola vez por (proveedor, `logId`), con su tipo,
  el id del pago al que se refiere y la hora de llegada. NO DEBE guardar el cuerpo del evento ni datos de la
  tarjeta o del pagador.
- **R13.** SI llega un evento ya procesado con el mismo (proveedor, `logId`), ENTONCES el sistema DEBE ignorarlo
  sin cambiar ningún intento ni escribir nada más. SI el evento llegó antes pero su proceso no terminó, ENTONCES
  el sistema DEBE procesarlo otra vez.
- **R14.** CUANDO se procesa un evento, el sistema DEBE tomar el estado del pago consultándolo al proveedor, no
  del evento ni del orden de llegada, y DEBE llevar el intento hasta ese estado pasando por los estados
  intermedios. Ejemplos:
  - un evento de «pago pendiente» que llega después del de «pago aprobado» deja el intento `aprobado`;
  - un evento de un intento aún `creado` cuyo pago el proveedor da por aprobado deja el intento `aprobado`,
    pasando por `pendiente`.
- **R15.** SI el estado que da el proveedor ya está alcanzado, queda detrás del estado del intento o no se puede
  alcanzar desde él, ENTONCES el sistema NO DEBE cambiar el intento, y DEBE dejar el evento procesado con ese
  resultado.
- **R16.** SI la consulta al proveedor falla, ENTONCES el sistema NO DEBE cambiar el intento, y el evento DEBE
  quedar sin procesar para que un reintento lo procese.

### Registrar el pago aprobado (capa 3 de la idempotencia)

- **R17.** CUANDO el proveedor da por aprobado el pago de un intento vivo, por el monto y la moneda del intento, el
  sistema DEBE hacer todo esto en una sola operación, con la factura bloqueada:
  - pasar el intento a `aprobado` con el id del pago del proveedor;
  - escribir en el libro de la caja de la empresa un «Pago a la plataforma» por el monto local, con la marca
    «Pagado en línea» y el id del pago del proveedor;
  - dejarlo confirmado, sin persona que confirme, y aplicado entero a la factura del intento;
  - bajar la caja, la ganancia y la deuda en el monto, igual que el pago por fuera de SLT-143 (R2).

  Ejemplo: caja de ₡50 000 y factura de ₡30 000 pagada con tarjeta ⇒ la caja queda en ₡20 000, la deuda baja
  ₡30 000 y el saldo de la factura queda en 0.
- **R18.** SI la caja de la empresa es menor que el monto, ENTONCES el sistema DEBE registrar el pago igual. La
  caja queda negativa.
- **R19.** Un pago aprobado en línea NO DEBE contar como pago por confirmar: no sale en «Pagos por confirmar» y no
  resta de lo disponible para registrar.
- **R20.** CUANDO el mismo pago del proveedor (proveedor, `payment_id`) se registra dos veces, una tras otra o a la
  vez (webhook, conciliación o reintento), el sistema DEBE contarlo una sola vez: un solo «Pago a la plataforma»,
  una confirmación y una aplicación. La segunda vez DEBE responder «ya registrado» sin escribir nada.
- **R21.** SI el pago aprobado no corresponde a un intento vivo, o su monto o su moneda no coinciden con los del
  intento, o supera el saldo de la factura, ENTONCES el sistema NO DEBE escribir en el libro ni cambiar el
  intento, y DEBE dejar el evento procesado con el resultado «requiere revisión» (decisión P2).
- **R22.** CUANDO el pago aprobado de un intento vivo cumple R17, el sistema DEBE registrarlo aunque los pagos por
  confirmar dejen lo disponible para registrar por debajo de su monto. Un «Pago a la plataforma» que no sea el de
  un intento aprobado DEBE seguir sujeto al tope de SLT-60 (decisión P1).
- **R23.** CUANDO el proveedor da por devuelto o por contracargo el pago de un intento `aprobado`, el sistema DEBE
  pasar el intento a `devuelto` o `contracargo` sin escribir en el libro ni cambiar la deuda (eso es SLT-233).
- **R24.** CUANDO el proveedor da por rechazado o por expirado el pago de un intento vivo, el sistema DEBE pasar el
  intento a `rechazado` o `expirado` sin escribir en el libro (decisión P3).

### El historial de plataforma

- **R25.** CUANDO un intento nace o cambia de estado, por cualquier camino (incluida la anulación de R3 y R11), el
  sistema DEBE escribir en el historial de plataforma, en la misma operación, una fila por cambio con:
  - el intento y su factura;
  - el estado anterior (vacío al nacer) y el nuevo;
  - quién lo hizo, o vacío si fue el sistema;
  - el país de la empresa.

  Si el cambio no se guarda, su fila tampoco. Al pasar de `creado` a `aprobado` (R14) quedan dos filas.

### Acceso

- **R26.** El rol de la app de una empresa DEBE poder leer solo sus propios intentos, y NO DEBE poder insertarlos,
  cambiarlos ni borrarlos (`42501`). Ninguna empresa DEBE poder leer ni escribir los eventos del proveedor.
- **R27.** CUANDO un `maestro` o un `admin` pide los intentos de una factura de su empresa, el sistema DEBE
  devolverlos, del más nuevo al más viejo. CUANDO los pide el superadmin, DEBE devolver los de cualquier empresa.
  SI los pide cualquier otro rol, ENTONCES DEBE responder `forbidden` antes de leer nada.

### Despliegue

- **R28.** CUANDO se aplican las migraciones de esta ficha, el sistema NO DEBE crear datos. Las confirmaciones que
  ya existen DEBEN quedar igual, sin la marca de pago en línea, y la confirmación de SLT-60 y el registro por
  fuera de SLT-143 DEBEN comportarse igual. Cada migración DEBE tener su `down.sql`, que la revierte entera; el
  `down.sql` DEBE abortar sin cambiar nada si ya hay intentos.

### Cobertura de las decisiones cerradas

| Decisión (fecha) | Requisitos |
|---|---|
| Prioridad de la épica (2026-11-19) | Sin comportamiento: orden de trabajo |
| El pago en línea baja la caja como SLT-143 (2026-11-20) | R17, R18, R19, R22 |
| El intento cobra el saldo; si el saldo cambia, se anula (2026-11-20) | R1, R3, R11 |
| Quién ve los cobros (2026-11-20) | R26, R27 |
| La tabla de eventos se llama `cobro_webhook_evento` (2026-11-20) | R12, R13 |
| Importes en decimal y mayores que 0 (2026-11-20) | R6 |
| No se borra nada y los estados solo avanzan (2026-11-20) | R7, R8, R9 |
| Sin E2E (2026-11-20) | Sin comportamiento: lo cubren los tests de integración contra la base (design §8) |
| Ruta completa, un PR (2026-11-20) | Sin comportamiento: ver «Tamaño» en `design.md` y la decisión P5 |
| P1, el pago en línea se registra aunque haya pagos por confirmar (2026-11-20) | R22 |
| P2, el pago aprobado que no cabe queda «requiere revisión» (2026-11-20) | R21 |
| P3, el primer rechazo cierra el intento (2026-11-20) | R7, R24 |
| P4, estado terminal `anulado` (2026-11-20) | R3, R7, R11 |
| P5, un solo PR (2026-11-20) | Sin comportamiento: tamaño del PR |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-19 | ¿Prioridad? | Ficha prioritaria de la épica EP-9 «Cobro automático del plan con Rebill»: el resto de la épica depende de ella (humano: «idempotencia prioritario»). |
| 2026-11-20 | ¿El pago aprobado en línea baja la caja de la empresa? | **Sí, igual que SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado»** (humano). Se escribe en el libro un «Pago a la plataforma» con la marca «Pagado en línea» y el id del pago del proveedor. Nace confirmado y repartido, y baja la caja, la ganancia y la deuda. La caja puede quedar negativa (heredado de SLT-143). Ejemplo: caja de ₡50 000 y factura de ₡30 000 pagada con tarjeta; la caja queda en ₡20 000. |
| 2026-11-20 | ¿Qué monto cobra el intento? | **El saldo pendiente de la factura** (humano). Ejemplo: factura de ₡30 000 con ₡10 000 ya confirmados; se cobran ₡20 000. Si el saldo cambia mientras hay un intento vivo, ese intento se anula y el siguiente sale por el saldo nuevo. |
| 2026-11-20 | ¿Quién ve los cobros? | El `maestro` y el `admin` de la empresa, con RLS por empresa (humano; heredado de SL-45 «Pago a la plataforma desde la wallet» D5). El superadmin los ve todos. |
| 2026-11-20 | ¿Cómo se llama la tabla de eventos del proveedor? | `cobro_webhook_evento`, no `webhook_evento`, para no confundirla con el valor `webhook_evento` del enum `job_tipo` (ficha 454). El único sigue en (proveedor, logId). La descripción del board ya está actualizada. |
| 2026-11-20 | ¿Cómo se guardan los importes? | En decimal, nunca en float, como el resto de los importes de las facturas. El monto debe ser mayor que 0. |
| 2026-11-20 | ¿Se borran intentos o eventos? | No. Los cambios de estado solo avanzan y `servi_app` no tiene DELETE (como SL-45 D13). |
| 2026-11-20 | ¿Hace falta E2E? | No en esta ficha, porque no tiene pantalla. El flujo de punta a punta entra con SLT-231. |
| 2026-11-20 | ¿Qué ruta lleva y cabe en un PR? | Ruta completa, porque toca dinero, esquema e idempotencia. Se estiman unos 20 archivos: cabe en un PR. |
| 2026-11-20 | P1: ¿se registra el pago en línea si hay pagos por confirmar que dejan lo disponible por debajo de su monto? | **Sí, se registra igual** (humano). El tope de SLT-60 sigue igual para todo lo demás. El pago por confirmar que ya no cabe se rechaza al intentar confirmarlo, igual que hoy. |
| 2026-11-20 | P2: ¿qué pasa con un pago aprobado que no cabe (intento no vivo, otro monto u otra moneda, o mayor que el saldo)? | **Queda «requiere revisión»** (humano). No se escribe en la caja, y lo resuelve SLT-233 «Cobro automático: conciliación, devoluciones y contracargos». |
| 2026-11-20 | P3: con un enlace de pago que admite varios intentos, ¿el primer rechazo cierra el intento? | **Sí: queda `rechazado`, que es terminal** (humano). Para volver a intentar se crea un intento nuevo. |
| 2026-11-20 | P4: la decisión dice que el intento «se anula», pero la máquina de estados no tiene ese estado | **Un estado terminal nuevo, `anulado`**, distinto de `expirado` (humano). Se llega a él desde `creado` o `pendiente`. |
| 2026-11-20 | P5: ~24 archivos y ~1 300–1 500 líneas de producción, por encima del tope de 1 000 | **Un solo PR**, aunque pase el tope de líneas (humano). |
