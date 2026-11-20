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

_Pendiente: los escribe spec_author (F1.2)._

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
