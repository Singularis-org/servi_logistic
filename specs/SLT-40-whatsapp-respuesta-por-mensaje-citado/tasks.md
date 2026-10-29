# SLT-40 — whatsapp-respuesta-por-mensaje-citado · tasks.md

> **Bloqueo previo:** no se empieza T2 hasta que el humano responda D1–D4
> (`requirements.md > ## Preguntas abiertas`). Si alguna respuesta difiere de la recomendada, el
> `spec_author` reescribe los `R<n>` marcados y §4.1 del design antes de implementar.
>
> Todo es backend (`backend_dev`). Sin migraciones. Cada task cierra con
> `pnpm run typecheck` y `pnpm exec vitest related --run <archivos tocados>` en verde.

## Tareas

- [x] **T1 [P] — Parser: conservar `context.id`** (R1, R2, R3)
  - `lib/types/whatsapp-webhook.ts`: campo blando `context` en `metaMessageSchema`, helper puro
    `citadoDe`, `citadoWaMessageId?` en `WebhookMensajeEntrante`, propagación en
    `parseWebhookEventos` para todo `type`.
  - Tests en `tests/unit/types/whatsapp-webhook.test.ts`: con `context.id` en texto, imagen y
    `otro` (botón); `context` ausente; `context` con forma rara (`id` numérico, `context` string);
    `id` vacío/espacios; un mensaje con `context` raro no tumba a los demás del lote; solo sobrevive
    el id (`from`/`forwarded` no aparecen en el normalizado).
  - **Hecho:** los casos nuevos pasan y los existentes del archivo siguen en verde.

- [x] **T2 [P] — Función pura de decisión** (R6–R12; depende de D1–D4)
  - Nuevo `lib/services/whatsapp/enrutado-por-cita.ts`: `decidirEnrutadoPorCita`, `DecisionCita`,
    `MotivoSinCita` (design §4.1). El tipo `HiloCitado` se declara en
    `lib/interfaces/repositories/IChatConversacionRepository.ts` (lo comparte T3).
  - Tests en `tests/unit/services/enrutado-por-cita.test.ts`: un caso por motivo
    (`saliente_no_encontrado`, `orden_eliminada`, `orden_sin_mensajero`, `numero_distinto`), orden
    terminal no eliminada → `cita` (R9), `from` con/sin `+` normalizado casa (R11), mensajero
    resultante = el asignado actual de la orden (R6).
  - **Hecho:** cada `R6–R12` tiene al menos un `it` con su número en el nombre.

- [x] **T3 — Repositorio: `findHiloDeSalienteCitado`** (R4, R7, R13; depende de T2 por `HiloCitado`)
  - `lib/interfaces/repositories/IChatConversacionRepository.ts`: método nuevo.
  - `lib/repositories/ChatConversacionRepository.ts`: implementación con una consulta Prisma
    (design §3); `Pick` ampliado con `"chatMensaje"`.
  - Fakes que implementan la interfaz: `tests/unit/services/chat-whatsapp-service.test.ts` y
    `tests/unit/actions/chat-whatsapp-actions.test.ts` (añadir `findHiloDeSalienteCitado: vi.fn(async () => null)`).
  - Tests en `tests/unit/repositories/chat-conversacion-repository.test.ts`: mapea la fila a
    `HiloCitado` (`ordenEliminada` true/false, mensajero null), devuelve `null` sin fila, el `where`
    lleva `direccion: "saliente"`.
  - **Hecho:** typecheck verde con los fakes actualizados; tests del repositorio en verde.

- [x] **T4 — Service: paso nuevo en `ingerirEventos` y contador** (R4, R5, R6, R14–R18; depende de T1, T2, T3)
  - `lib/services/ChatWhatsappService.ts`: paso de design §4.2; `enrutadosPorCita` en
    `IngestaResumen`.
  - `lib/services/WebhookWhatsappService.ts`: `resumenVacio` y `sumar` con `enrutadosPorCita`.
  - Tests nuevos en `tests/unit/services/chat-whatsapp-respuesta-citada.test.ts`:
    - R5: dos órdenes vivas del mismo número; el entrante cita el saliente de la **menos** reciente
      → `upsertParaOrden` con esa orden; `resolverOrdenActivaPorNumero` **no** se llama.
    - R6: hilo guardado con mensajero A, orden reasignada a B → upsert con B.
    - R7–R12: con cada `null`/motivo se llama a la regla actual con el `from` normalizado.
    - R14: solo se sella `marcarUltimoEntrante` del hilo citado.
    - R15: segundo envío del mismo wamid (`insertarEntranteIdempotente` → false) no re-sella ni
      cuenta.
    - R16: `enrutadosPorCita` cuenta solo inserts nuevos por cita; `sinResolver` no los cuenta.
    - R17: logger espía sin número, cuerpo ni id citado.
    - R18: sin `citadoWaMessageId`, `findHiloDeSalienteCitado` no se llama.
  - Ajustar las aserciones de forma exacta del resumen donde existan
    (`tests/unit/services/webhook-whatsapp-service.test.ts`, `tests/unit/api/webhook-whatsapp-por-empresa.test.ts`,
    `tests/integration/api/webhook-whatsapp.route.test.ts`) para incluir `enrutadosPorCita: 0`,
    **sin** cambiar ninguna aserción de enrutamiento (R18).
  - **Hecho:** suites nuevas y existentes del chat y del webhook en verde.

- [x] **T5 — Integración contra Postgres** (R5, R7, R12, R13; depende de T4)
  - Nuevo `tests/integration/db/chat-respuesta-citada.test.ts`, dentro de `conEmpresa`:
    - R5: empresa A, un cliente con dos órdenes vivas asignadas, saliente en el hilo de la antigua;
      entrante que lo cita queda en ese hilo.
    - R13: el mismo flujo con el saliente en la empresa B y el lote en A → no se escribe nada en B
      y el entrante sigue la regla actual en A.
    - R7: id citado de un entrante → regla actual.
    - R12: id citado igual al `wa_message_id` de una `whatsapp_envio_entrega` → regla actual y la
      entrega no cambia (`updated_at`, `estado`).
  - **Hecho:** el archivo pasa en local con base de test o en CI (`gate-completo`).

- [ ] **T6 — Cierre** (depende de T1–T5)
  - Actualizar el comentario de `ChatConversacionRepository.resolverOrdenActivaPorNumero` y el de
    `ChatWhatsappService.ingerirEventos` para nombrar la vía por cita.
  - Mapa `R<n> → test` en `progress/impl_SLT-40.md` (R1–R18, sin huecos).
  - `./init.sh` en verde.
  - **Hecho:** gate local verde y mapa completo.

## Dependencias

```
T1 ─┐
T2 ─┼─> T3 ─> T4 ─> T5 ─> T6
    └─────────────^
```

T1 y T2 en paralelo. T3 necesita `HiloCitado` (T2). T4 necesita T1–T3.

## Archivos esperados

- `lib/types/whatsapp-webhook.ts`
- `lib/services/whatsapp/enrutado-por-cita.ts`
- `lib/interfaces/repositories/IChatConversacionRepository.ts`
- `lib/repositories/ChatConversacionRepository.ts`
- `lib/services/ChatWhatsappService.ts`
- `lib/services/WebhookWhatsappService.ts`
- `tests/unit/types/whatsapp-webhook.test.ts`
- `tests/unit/services/enrutado-por-cita.test.ts`
- `tests/unit/services/chat-whatsapp-respuesta-citada.test.ts`
- `tests/unit/services/chat-whatsapp-service.test.ts`
- `tests/unit/services/webhook-whatsapp-service.test.ts`
- `tests/unit/actions/chat-whatsapp-actions.test.ts`
- `tests/unit/repositories/chat-conversacion-repository.test.ts`
- `tests/unit/api/webhook-whatsapp-por-empresa.test.ts`
- `tests/integration/api/webhook-whatsapp.route.test.ts`
- `tests/integration/db/chat-respuesta-citada.test.ts`
- `progress/impl_SLT-40.md`
