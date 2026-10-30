# SLT-40 — whatsapp-respuesta-por-mensaje-citado · requirements.md

> **Zona:** backend · **Complejidad:** medium · **Rama:** feature/SLT-40-whatsapp-respuesta-por-mensaje-citado
>
> **Alcance (de la tarjeta, pedido del 2026-10-26).** Hoy un mensaje entrante de un cliente por
> WhatsApp se asigna por su número (`from`) a la orden viva y asignada más reciente con ese
> `telefono_dest` (`ChatConversacionRepository.resolverOrdenActivaPorNumero`). Si el cliente tiene
> varias órdenes vivas, la respuesta puede caer en el hilo equivocado. Cuando el cliente usa
> «Responder», Meta manda `context.id` (el wamid del mensaje citado), pero el parser
> (`lib/types/whatsapp-webhook.ts`, `metaMessageSchema`) lo descarta con el strip de zod.
> La feature usa `context.id`: si coincide con un saliente de `chat_mensaje` de la misma empresa,
> el entrante va al hilo de ese saliente; si no, sigue la regla actual.
>
> **Lo que NO entra.**
> - Citas a un mensaje **entrante** (el cliente cita su propio mensaje): la tarjeta pide casar con
>   un *saliente*. Un `context.id` que sea de un entrante sigue la regla actual (R7).
> - Enrutar **reacciones** por `reaction.message_id`: hoy la reacción se resuelve por número como
>   cualquier entrante (feature 311) y no cambia.
> - Cambiar la regla actual por número: se conserva tal cual para todo entrante sin cita útil.
> - Guardar en la base el id citado o pintar la cita en la UI del chat (burbuja «en respuesta a»).
> - Ninguna tabla, columna ni migración nueva.
>
> Esta ficha llega **sin afinar** (no hay sembrado de `/afinar-feature`): no hay tabla de
> decisiones cerradas previa. Los tres puntos que la tarjeta deja «a decidir en el spec», más uno
> que aparece al leer el código (D4), quedan como **decisiones abiertas** en `## Preguntas
> abiertas`. Los requisitos que dependen de ellas están redactados con la opción recomendada y
> marcados `[pendiente Dn]`: si el humano elige otra, se reescriben antes de implementar.

## Requisitos (EARS)

Vocabulario de este archivo:
- **Entrante**: un mensaje que el cliente manda y que llega por el webhook de WhatsApp.
- **Empresa del lote**: la empresa a la que el webhook atribuye el evento por su
  `phone_number_id` (SL-36). Todo lo de abajo ocurre dentro de ella.
- **Id citado**: el valor de `context.id` del entrante, cuando viene y no está vacío.
- **Saliente citado**: el mensaje de `chat_mensaje` con dirección *saliente*, de la empresa del
  lote, cuyo `wa_message_id` es igual al id citado.
- **Hilo citado**: el hilo de chat (`chat_conversacion`) al que pertenece el saliente citado, y su
  **orden citada**.
- **Regla actual**: la resolución por número que existe hoy (orden no eliminada, con mensajero
  asignado, cuyo `telefono_dest` normalizado coincide con el `from`, la de `asignado_at` más
  reciente; sin coincidencia, el entrante cuenta como `sinResolver` y no se registra).
- **Enrutar por cita**: registrar el entrante en el hilo citado en vez de en el que daría la regla
  actual.

### A. Borde del webhook (parser)

- **R1.** CUANDO un entrante del webhook trae `context.id` como texto no vacío, el sistema DEBE
  conservar ese valor como id citado del entrante normalizado, sea cual sea el `type` del mensaje.
- **R2.** SI un entrante trae `context` ausente, con una forma inesperada, sin `id`, con un `id`
  que no es texto o con un `id` vacío o solo de espacios, ENTONCES el sistema DEBE tratarlo como
  un entrante sin id citado, sin rechazar el lote: el resto de mensajes y statuses del mismo POST
  se ingieren y el webhook responde 200.
- **R3.** El sistema NO DEBE conservar en el entrante normalizado ningún otro campo de `context`
  (`from`, `forwarded`, `frequently_forwarded`, `referred_product` u otros): solo el id citado.

### B. Enrutamiento por cita

- **R4.** CUANDO llega un entrante con id citado que corresponde a un saliente citado y se cumplen
  las condiciones de R8 a R11, el sistema DEBE registrar el entrante en el hilo citado, con la
  orden citada, sea cual sea el tipo del entrante (texto, media, ubicación, contactos u `otro`).
- **R5.** MIENTRAS el número del cliente tenga más de una orden viva y asignada, CUANDO llegue un
  entrante cuyo saliente citado pertenece a una orden que NO es la de `asignado_at` más reciente,
  el sistema DEBE registrarlo en el hilo de la orden citada y NO en el de la más reciente.
- **R6.** CUANDO un entrante se enruta por cita, el sistema DEBE dejar el hilo citado a cargo del
  mensajero asignado **actual** de la orden citada (si es otro que el guardado en el hilo, el hilo
  pasa a él, igual que hace hoy la regla actual con una reasignación). `[pendiente D4]`
- **R7.** SI el id citado no corresponde a ningún saliente citado —no existe en `chat_mensaje`, es
  de un mensaje entrante, o es de otra empresa—, ENTONCES el sistema DEBE resolver el entrante con
  la regla actual, con el mismo resultado que tendría sin id citado.
- **R8.** SI la orden citada está eliminada (`deleted_at` no nulo), ENTONCES el sistema DEBE
  resolver el entrante con la regla actual. `[pendiente D1]`
- **R9.** MIENTRAS la orden citada no esté eliminada, el sistema DEBE enrutar por cita aunque su
  estado sea terminal (`entregado`, `devuelta_a_tienda`, `incidente`). `[pendiente D1]`
- **R10.** SI la orden citada no tiene mensajero asignado, ENTONCES el sistema DEBE resolver el
  entrante con la regla actual. `[pendiente D4]`
- **R11.** SI el `from` del entrante, normalizado, es distinto del `telefono_e164` del hilo
  citado, ENTONCES el sistema DEBE resolver el entrante con la regla actual. `[pendiente D3]`
- **R12.** SI el id citado coincide con el `wa_message_id` de una entrega de un envío automático
  (`whatsapp_envio_entrega`) y con ningún saliente citado, ENTONCES el sistema DEBE resolver el
  entrante con la regla actual y NO DEBE escribir nada en las tablas de envíos automáticos.
  `[pendiente D2]`
- **R13.** El sistema NO DEBE enrutar por cita a un hilo de otra empresa: un saliente de otra
  empresa con ese mismo `wa_message_id` no cuenta como saliente citado (cae en R7), y el entrante
  no deja ninguna fila en la otra empresa.

### C. Efectos del registro

- **R14.** CUANDO un entrante se enruta por cita y se registra por primera vez, el sistema DEBE
  sellar la marca del último entrante del **hilo citado** (la que abre la ventana de 24 h) y NO
  la de ningún otro hilo.
- **R15.** SI un entrante enrutado por cita llega repetido (mismo wamid propio), ENTONCES el
  sistema NO DEBE crear un segundo registro ni volver a sellar la marca del último entrante.
- **R16.** El resumen de la ingesta DEBE informar cuántos entrantes nuevos se registraron por cita
  (conteo agregado, sin números ni ids), y un entrante enrutado por cita NO DEBE contar como
  `sinResolver`.
- **R17.** El sistema NO DEBE escribir en el log el número del cliente, el cuerpo del mensaje ni el
  id citado en ninguna rama del enrutamiento por cita.

### D. Lo que no cambia

- **R18.** CUANDO llega un entrante sin id citado, el sistema DEBE resolverlo con la regla actual,
  con el mismo resultado que antes de esta feature (los tests existentes de la ingesta siguen en
  verde sin cambiar sus aserciones de enrutamiento).

## Preguntas abiertas

**Respondidas (2026-10-29):** Camilo aprueba el spec por escrito («aprobado») tal como está, con
D1–D4 en la opción recomendada. Los `[pendiente Dn]` quedan cerrados con esa opción.

### D1. Orden citada cerrada o eliminada (de la tarjeta)

Dato del código: la regla actual **no** excluye órdenes en estado terminal; solo exige
`deleted_at IS NULL` y mensajero asignado (`ChatConversacionRepository.ts:90-98`).

- **(a) Recomendada.** Eliminada → regla actual (R8). Terminal (entregada, devuelta, incidente) →
  se enruta por cita igual (R9). Es coherente con la regla actual, que tampoco mira el estado, y un
  cliente que responde a un mensaje de una orden entregada suele hablar de esa orden (reclamo,
  vuelto, comprobante).
- (b) Eliminada **o** terminal → regla actual. Más conservadora, pero puede mandar el reclamo de
  una orden entregada al hilo de otra orden viva.
- (c) Siempre al hilo citado, también si está eliminada. La orden eliminada no aparece en las
  pantallas del mensajero, así que el mensaje quedaría invisible.

Afecta a R8 y R9.

### D2. Respuestas a envíos masivos (`whatsapp_envio_entrega`, de la tarjeta)

Dato del código: `whatsapp_envio_entrega` no tiene orden. Sus destinatarios son **usuarios de la
empresa** (por rol o por usuario, ficha 474), no clientes de órdenes. Su `wa_message_id` es único
global. Hoy la respuesta de uno de esos usuarios se resuelve por número; lo normal es que no case
con ninguna orden y quede `sinResolver`.

- **(a) Recomendada.** No se busca en `whatsapp_envio_entrega`: el id citado no casa con
  `chat_mensaje`, así que el entrante sigue la regla actual (R12). Cero cambio de comportamiento
  para esas respuestas.
- (b) Se detecta que es respuesta a un envío automático y se descarta sin pasar por la regla
  actual, con un conteo aparte en el resumen. Evita que la respuesta de un usuario interno caiga en
  el hilo de una orden si su número coincide con un `telefono_dest`.
- (c) Guardar la respuesta junto a la entrega (columna o tabla nueva). Es otra feature: necesita
  migración y una pantalla donde verla.

Afecta a R12.

### D3. El `from` debe coincidir con el `telefono_e164` del hilo citado (de la tarjeta)

- **(a) Recomendada.** Se exige la coincidencia (normalizada); si no coincide, regla actual (R11).
  Coste: una comparación. Efecto lateral bueno: tras un cambio de número (feature 311), el hilo ya
  migrado al número nuevo **sí** casa, así que una respuesta citada desde el número nuevo llega al
  hilo, cosa que hoy no pasa (limitación conocida de R16 de la 311).
- (b) No se exige: el cuerpo viene firmado por Meta (HMAC) y nadie puede citar un mensaje que no
  recibió. Pierde la defensa ante un hilo cuyo número cambió por la corrección de datos del
  cliente (feature 312).
- (c) Se exige y, si no coincide, el entrante se descarta (`sinResolver`) en vez de ir a la regla
  actual.

Afecta a R11.

### D4. Mensajero del hilo citado cuando la orden se reasignó (aparece al leer el código)

La tarjeta dice «al hilo (orden y mensajero) de ese saliente». Pero el hilo es único por
`(orden, número)` y hoy cada entrante o saliente lo pasa al mensajero asignado **actual** de la
orden (`upsertParaOrden` actualiza `mensajero_id`). Si la orden se reasignó después del saliente
citado, «el mensajero del hilo» y «el mensajero de la orden» difieren.

- **(a) Recomendada.** El hilo pasa al mensajero asignado actual de la orden (R6), igual que hoy;
  si la orden ya no tiene mensajero, regla actual (R10). El mensaje lo ve quien lleva la orden.
- (b) Se respeta el mensajero guardado en el hilo, aunque ya no lleve la orden. El mensaje lo ve
  alguien que puede no tener ya acceso operativo a esa orden.

Afecta a R6 y R10.

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Cubierta por |
|---|---|---|---|
| 1 | Solo cuenta como cita un saliente de `chat_mensaje` de la misma empresa; si no, regla actual. | Tarjeta SLT-40 | R4, R7, R13 |
| 2 | Sin cita útil, la regla actual por número se conserva intacta. | Tarjeta SLT-40 | R7, R18 |
| 3 | El parser deja de descartar `context.id` (hoy lo quita el strip de zod). | Tarjeta SLT-40 | R1, R2, R3 |

La búsqueda de lo existente (nada previo sobre `context.id` ni enrutamiento por cita) está en
`design.md > ## Lo que ya existe`.
