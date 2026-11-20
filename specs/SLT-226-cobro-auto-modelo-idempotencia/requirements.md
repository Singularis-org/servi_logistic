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
> **Enmienda del alcance (humano, 2026-11-20, con la ficha ya implementada en el PR #263).** Entra además:
> - **Varios proveedores:** el intento y el evento admiten `rebill`, `wompi` y `global66`. El proveedor entra como
>   parámetro al crear el intento, no como literal.
> - **El método del cobro** se guarda en el intento: `tarjeta`, `recurrente` o `transferencia`, como conjunto cerrado.
> - **Marcar pagado a mano:** la función de dominio y su permiso (solo el superadmin) para marcar como pagado un
>   intento pendiente con la referencia del proveedor cuando el aviso no llega, por la misma vía de la capa 3 y con
>   rastro en el historial de plataforma.
>
> **Lo que NO entra.**
> - La interfaz de proveedores y el adaptador de Rebill: SLT-227 «Cobro automático: interfaz de proveedores y
>   adaptador de Rebill». El de Wompi: SLT-252 «Cobro automático: adaptador de Wompi». La transferencia y el enlace
>   de Global66: SLT-253 «Cobro automático: transferencia y enlace con Global66» (enmienda del 2026-11-20).
> - Qué método y qué proveedor usa cada país: SLT-251 «Cobro automático: medios y proveedor por país» (enmienda del
>   2026-11-20).
> - La casilla «Recordar tarjeta» y lo que se guarda del medio de pago al marcarla: SLT-232 «Cobro automático:
>   medios de pago guardados y cobro recurrente». En el intento solo queda el id del pago del proveedor (enmienda
>   del 2026-11-20).
> - La pantalla para marcar pagado a mano: SLT-234 «Cobro automático: panel del superadmin para cobros y
>   proveedor» (enmienda del 2026-11-20).
> - El endpoint del webhook: SLT-228 «Cobro automático: webhook por proveedor y el de Rebill».
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
  Desde la enmienda del 2026-11-20, también el proveedor y el método (R32; design §12.2).
- **Método del cobro:** `tarjeta`, `recurrente` o `transferencia` (enmienda del 2026-11-20).
- **Referencia del proveedor:** el `payment_id` que el superadmin copia del proveedor al marcar pagado a mano.
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
- **R8.** Un intento NO DEBE poder borrarse con el rol de la app, y NO DEBE poder cambiar su empresa, su factura, su proveedor, su clave, sus
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

### La marca en «Registró»

- **R29.** CUANDO la wallet muestra un «Pago a la plataforma» que nació de un intento aprobado en línea, la
  columna «Registró» (y el detalle del movimiento) DEBE mostrar «Pagado en línea», nunca «Automático · Plantilla
  de gasto fijo». Los demás movimientos automáticos DEBEN seguir mostrando lo mismo que hoy.

### Proveedor y método (enmienda del 2026-11-20)

- **R30.** El sistema DEBE admitir como proveedor de un intento y de un evento solo `rebill`, `wompi` y `global66`.
  SI se intenta guardar un intento o un evento con otro proveedor, con cualquier rol (también el dueño de la base),
  ENTONCES la base DEBE rechazarlo sin escribir. SI llega al servicio un evento con otro proveedor, ENTONCES el
  servicio DEBE rechazarlo sin registrarlo ni consultar a nadie.
- **R31.** CUANDO se pide un intento, el pedido DEBE traer el proveedor y el método, y el intento DEBE nacer con
  esos dos valores. SI el método no es `tarjeta`, `recurrente` ni `transferencia`, ENTONCES la base DEBE rechazar el
  intento sin escribir. Ejemplo: se pide con `wompi` y `tarjeta` ⇒ el intento nace con proveedor `wompi` y método
  `tarjeta`, y su fila de historial lleva los dos.
- **R32.** CUANDO se pide un intento para una factura cuyo intento vivo es de otro proveedor o de otro método, el
  sistema DEBE tratarlo como otra clave (R3): en una sola operación, anular el vivo con el motivo «clave distinta» y
  crear uno nuevo con el proveedor y el método pedidos. Con el mismo proveedor, el mismo método y el mismo saldo,
  aplica R2. Ejemplo: vivo de ₡20 000 con `tarjeta`; la empresa pide `transferencia` ⇒ el de tarjeta queda
  `anulado` y nace uno de ₡20 000 con `transferencia`; sigue habiendo un solo vivo (R4).
- **R33.** El método de un intento NO DEBE poder cambiar después de crearlo, con ningún rol (también el dueño de la
  base), igual que el proveedor en R8.
- **R34.** Un intento NO DEBE guardar del medio de pago nada más que el id del pago del proveedor: ni número, CVV,
  vencimiento, marca, últimos 4 dígitos ni titular de la tarjeta, ni ids de cliente o de tarjeta del proveedor.
  Lo que se guarda al marcar «Recordar tarjeta» es de SLT-232 y no va en el intento.

### Marcar pagado a mano (enmienda del 2026-11-20)

- **R35.** CUANDO el superadmin marca como pagado un intento `pendiente` con la referencia del proveedor, el sistema
  DEBE registrarlo igual que R17, en una sola operación, con el candado de la empresa y la factura bloqueada:
  - el intento pasa a `aprobado`, con la referencia como id del pago del proveedor;
  - el libro recibe un «Pago a la plataforma» por el monto local, con la marca «Pagado en línea» y la referencia;
  - el pago queda confirmado y aplicado entero a la factura del intento;
  - la caja, la ganancia y la deuda bajan en el monto (R18 y R19 aplican igual, y «Registró» dice «Pagado en
    línea», R29).

  Ejemplo: una transferencia de Global66 de ₡20 000 llegó sin aviso; el superadmin la marca con la referencia
  `G66-123` ⇒ el intento queda `aprobado` con `G66-123`, la deuda baja ₡20 000 y el saldo de la factura queda en 0.
- **R36.** CUANDO se marca pagado a mano, el sistema DEBE dejar en el historial de plataforma, en la misma operación,
  la fila `pendiente` → `aprobado` con el superadmin como quien lo hizo y la marca de que fue a mano. La
  confirmación del pago DEBE llevar al superadmin como quien la confirmó.
- **R37.** El mismo pago (proveedor, referencia) DEBE contar una sola vez, venga por el aviso del proveedor, por la
  marca a mano o por los dos:
  - CUANDO se marca a mano una referencia que ya es el pago de ese intento, el sistema DEBE responder «ya
    registrado» sin escribir nada;
  - CUANDO llega el aviso del proveedor de un pago ya marcado a mano, el sistema DEBE responder «ya registrado» sin
    escribir nada, también si el intento no tiene id externo;
  - CUANDO la marca y el aviso llegan a la vez, el sistema DEBE dejar un solo «Pago a la plataforma», una
    confirmación y una aplicación.
- **R38.** SI el intento no existe, no está `pendiente`, la referencia está vacía, la referencia ya es el pago de
  otro intento del mismo proveedor o el saldo de la factura es menor que el monto del intento, ENTONCES el sistema
  DEBE rechazar la marca sin escribir nada y DEBE decir cuál de esos casos fue.
- **R39.** SI marca pagado a mano un rol que no es el superadmin, ENTONCES el sistema DEBE responder `forbidden`
  antes de leer o escribir nada. El rol de la app NO DEBE poder ejecutar la función de la base que marca el pago
  (`42501`).

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
| El borrado del intento se cierra solo con el `REVOKE` (2026-11-20) | R8, R26 |
| «Pagado en línea» en «Registró», en este PR (2026-11-20) | R29 |
| Enmienda: varios proveedores (2026-11-20) | R30, R31, R32 |
| Enmienda: el método del cobro en el intento (2026-11-20) | R31, R32, R33 |
| Enmienda: marcar pagado a mano (2026-11-20) | R35, R36, R37, R38, R39 |
| Enmienda: lo que queda fuera, y en el intento solo el id del pago (2026-11-20) | R34 (el resto, sin comportamiento: fichas aparte) |

## Preguntas abiertas

Ninguna bloquea el spec. Las dos de la enmienda llevan una propuesta, que vale si el humano no dice otra cosa:

1. **¿La marca a mano admite también un intento `creado`?** El humano escribió «un intento pendiente», y así va en
   R35 y R38. Un intento llega a `pendiente` cuando el proveedor crea el cobro (R10). Si la transferencia de
   Global66 de SLT-253 «Cobro automático: transferencia y enlace con Global66» no crea cobro en el proveedor, sus
   intentos se quedarían en `creado` y no se podrían marcar. **Propuesta:** solo `pendiente`, como dijo el
   humano. Si SLT-253 lo necesita, admitir `creado` es una condición más en la función (design §12.4).
2. **Tamaño de los tests.** La enmienda suma unas 380–480 líneas de tests a las 2 534 medidas, así que queda en
   2 900–3 000, en el borde del tope de 3 000 (design §12.8). P5 aceptó pasar el tope de **producción**, no el de
   tests. **Propuesta:** si al medir pasa de 3 000, se acepta igual que P5 y se anota el marcador.

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
| 2026-11-20 | T0.3: con el trigger `cobro_intento_sin_borrar`, una empresa con intentos no se puede limpiar (tests y demo) | **Se quita el trigger** (humano, opción a). El borrado de `cobro_intento` queda cerrado solo por `REVOKE DELETE` a `servi_app`, como `pago_plataforma_confirmacion` (SLT-60). El dueño de la base sí puede borrar, para limpiar la demo y los tests. |
| 2026-11-20 | ¿Qué muestra «Registró» en un pago en línea? | **«Pagado en línea»**, nunca «Automático · Plantilla de gasto fijo», y se corrige en este PR (humano). Es la alternativa 6 del design, que deja de estar descartada (R29). Sube el tamaño del PR, ya aceptado por P5. |
| 2026-11-20 | Enmienda: ¿solo Rebill? | **No: varios proveedores** (humano). El modelo admite `rebill`, `wompi` y `global66` en `cobro_intento` y en `cobro_webhook_evento`. El proveedor entra como parámetro al crear el intento, no como literal en el servicio. |
| 2026-11-20 | Enmienda: ¿se guarda el método del cobro? | **Sí, en el intento** (humano): `tarjeta`, `recurrente` o `transferencia`, como conjunto cerrado. Si forma parte de la clave de idempotencia lo decide el design (§12.2). |
| 2026-11-20 | Enmienda: ¿qué pasa si el aviso del proveedor no llega? | **El superadmin marca pagado a mano** un intento pendiente con la referencia del proveedor (humano). Ejemplo: una transferencia de Global66 que llegó sin aviso. Usa la vía de la capa 3: único (proveedor, payment_id), `FOR UPDATE` y el candado de la empresa; si el aviso llega después, responde «ya registrado» y no cuenta doble. Aquí entran solo la función de dominio y el permiso (solo el superadmin), con rastro en el historial de plataforma con el actor. La pantalla es de SLT-234 «Cobro automático: panel del superadmin para cobros y proveedor». |
| 2026-11-20 | Enmienda: ¿qué queda fuera? | **Fichas aparte** (humano): el método y el proveedor por país, SLT-251 «Cobro automático: medios y proveedor por país»; los adaptadores, SLT-227 «Cobro automático: interfaz de proveedores y adaptador de Rebill», SLT-252 «Cobro automático: adaptador de Wompi» y SLT-253 «Cobro automático: transferencia y enlace con Global66»; la casilla «Recordar tarjeta», SLT-232 «Cobro automático: medios de pago guardados y cobro recurrente». En el intento solo queda `pago_proveedor_id`, nada más de la tarjeta. |
