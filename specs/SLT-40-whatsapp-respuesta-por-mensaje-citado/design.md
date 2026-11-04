# SLT-40 — whatsapp-respuesta-por-mensaje-citado · design.md

> Las piezas marcadas `[pendiente Dn]` siguen la opción recomendada de
> `requirements.md > ## Preguntas abiertas`. Si el humano elige otra, cambia solo la función pura
> de decisión (§4) y sus tests; el resto del diseño no depende de D1–D4.

## Lo que ya existe

Buscado en el board (`feature_list.json`, por `context.id`, `citado`, `quoted`), en `specs/`
(`grep -ril "context.id|citad|quoted" specs/`) y en el código (`lib/`, `app/`). El grafo
(`codebase-memory-mcp`) **no tenía indexado este worktree** (`list_projects` solo lista
`SL-33-paleta-secundaria` de servi_logistic), así que el código se leyó con Grep/Read.

- **Board y specs: nada** sobre `context.id` ni enrutamiento por mensaje citado. La única
  otra coincidencia de «citado» en el board es la ficha que retira los `specs/` heredados (habla
  de la guardia `test-citado-desaparecido`), sin relación.
- **Código que se reutiliza** (verificado en esta rama):
  - `lib/types/whatsapp-webhook.ts` — `metaMessageSchema` (strip de zod; hoy descarta `context`),
    `WebhookMensajeEntrante` y `parseWebhookEventos`. Patrón de campos blandos con
    `.optional().catch(undefined)` (features 121 y 311) que se copia para `context`.
  - `lib/services/WebhookWhatsappService.ts` — firma HMAC, reparto por empresa con
    `IntegracionEnrutadoRepository` y `conEmpresa(organizacionId, …)` alrededor de la ingesta.
    **No se toca su flujo**; solo suma un contador nuevo del resumen.
  - `lib/services/ChatWhatsappService.ts` — `ingerirEventos`: migración por cambio de número,
    `resolverOrdenActivaPorNumero`, `upsertParaOrden`, `insertarEntranteIdempotente`,
    `marcarUltimoEntrante`. Es el único sitio donde se inserta el paso nuevo.
  - `lib/repositories/ChatConversacionRepository.ts` — `resolverOrdenActivaPorNumero` (la regla
    actual) y `upsertParaOrden` (get-or-create por `(orden_id, telefono_e164)` que pasa el hilo al
    mensajero indicado). Está en `EXCEPCIONES_SQL_A_MANO` como `porRls`.
  - `lib/repositories/ChatMensajeRepository.ts > findByWaMessageId` — ya busca un **saliente** por
    `wa_message_id`. No se usa tal cual (ver §6, alternativa B) pero confirma el criterio.
  - Índice único parcial `chat_mensaje_wa_message_id_key` (migración
    `20260723140000_chat_whatsapp`): la búsqueda por id citado ya está indexada y es única global
    (`docs/architecture.md > Multi-empresa > Globales a propósito`).
  - `lib/utils/whatsapp-telefono.ts > normalizarTelefonoWa` — la misma normalización para comparar
    `from` con `chat_conversacion.telefono_e164` (R11).
- **Hechos del código que fijan el diseño:**
  - Todo saliente a un cliente de una orden se guarda en `chat_mensaje` con su hilo: texto y media
    del chat, plantillas del chat y la plantilla de bienvenida
    (`lib/services/jobs/whatsapp-bienvenida-handler.ts`, que pasa por
    `ChatWhatsappService.enviarPlantilla`). Un saliente `queued` sin `wa_message_id` todavía no es
    citable; lo será cuando el reintento lo reconcilie.
  - `whatsapp_envio_entrega` (ficha 474) no tiene orden; sus destinatarios son usuarios de la
    empresa, no clientes (D2).
  - La regla actual no filtra por estado terminal (D1).

## 1. Modelo de datos

**Sin cambios.** Ni tablas, ni columnas, ni migraciones, ni RLS nuevas.

- El id citado no se persiste (fuera de alcance, `requirements.md > Lo que NO entra`).
- La lectura nueva toca `chat_mensaje`, `chat_conversacion` y `orden`: las tres son tablas de
  negocio con `organizacion_id`, RLS `<t>_por_empresa` y filtro inyectado por
  `lib/db/extension-empresa.ts`. Corre dentro del `conEmpresa` que ya abre
  `WebhookWhatsappService.procesarSiFirmaValida`, así que la búsqueda por id citado **solo ve los
  salientes de la empresa del lote** (R13) sin código de autorización adicional.
- Sin datos dependientes del país. Sin módulo que exigir: WhatsApp es núcleo desde el 2026-10-27
  (`docs/architecture.md > Módulos por empresa`).
- Sin dependencias nuevas.

## 2. Borde: parser del webhook (`lib/types/whatsapp-webhook.ts`) — R1, R2, R3

Campo nuevo en `metaMessageSchema`, blando como los de la 311:

```ts
context: z
  .object({ id: z.string().optional().catch(undefined) })
  .optional()
  .catch(undefined),
```

- El strip de zod descarta `from`, `forwarded`, `frequently_forwarded`, `referred_product` y todo
  lo demás de `context` (R3).
- `.catch(undefined)` en el objeto y en `id`: un `context` con forma rara degrada a «sin cita» en
  vez de tumbar el `parse` del lote, que respondería 200 perdiendo todos los mensajes (R2).

Tipo de dominio:

```ts
export interface WebhookMensajeEntrante {
  // …campos actuales…
  /** SLT-40 (R1): wamid del mensaje que el cliente cita con «Responder». Ausente si no hay. */
  citadoWaMessageId?: string;
}
```

Helper puro exportado y testeable: `citadoDe(m: MetaMessage): string | null` → `id.trim()` o
`null` si falta o queda vacío. `parseWebhookEventos` añade
`...(citado !== null ? { citadoWaMessageId: citado } : {})` para **todo** `type`, incluido `otro`
(un botón de plantilla trae `context.id` y su tipo es `otro`).

## 3. Repositorio — lectura del hilo citado

Método nuevo en `IChatConversacionRepository` / `ChatConversacionRepository`:

```ts
/** SLT-40: el hilo del SALIENTE cuyo wa_message_id es `waMessageId`, o null. Sin decidir nada. */
findHiloDeSalienteCitado(waMessageId: string): Promise<HiloCitado | null>;

export interface HiloCitado {
  conversacionId: string;
  ordenId: string;
  telefonoE164: string;            // del hilo (chat_conversacion.telefono_e164)
  ordenEliminada: boolean;         // orden.deleted_at IS NOT NULL
  ordenMensajeroAsignadoId: string | null; // orden.mensajero_asignado_id actual
}
```

Implementación: **una** consulta Prisma tipada, sin SQL a mano:

```ts
this.prisma.chatMensaje.findFirst({
  where: { waMessageId, direccion: "saliente" },
  select: { conversacion: { select: {
    id: true, ordenId: true, telefonoE164: true,
    orden: { select: { deletedAt: true, mensajeroAsignadoId: true } },
  } } },
});
```

- `ChatConversacionPrismaClient` amplía su `Pick` con `"chatMensaje"`.
- `direccion: "saliente"` cubre «el id es de un entrante» (R7).
- El filtro de empresa lo pone la extensión del cliente y lo respalda la RLS: un saliente de otra
  empresa devuelve `null` (R7, R13). No se añade `organizacion_id` a mano en el `where` (lo inyecta
  la extensión, igual que en el resto del repositorio).
- No consulta `whatsapp_envio_entrega` (D2 recomendada): un wamid de una entrega automática no
  está en `chat_mensaje` y devuelve `null` (R12).

## 4. Service — decisión pura y paso nuevo en `ingerirEventos`

### 4.1 Función pura de decisión (`lib/services/whatsapp/enrutado-por-cita.ts`, nuevo)

```ts
export type DecisionCita =
  | { via: "cita"; ordenId: string; mensajeroId: string; telefonoE164: string }
  | { via: "regla_actual"; motivo: MotivoSinCita };

export type MotivoSinCita =
  | "sin_cita" | "saliente_no_encontrado" | "orden_eliminada"
  | "orden_sin_mensajero" | "numero_distinto";

export function decidirEnrutadoPorCita(
  fromNormalizado: string,
  hilo: HiloCitado | null,
): DecisionCita;
```

Orden de las comprobaciones (cada una es una fila de D1–D4):

1. `hilo === null` → `regla_actual / saliente_no_encontrado` (R7, R12, R13).
2. `hilo.ordenEliminada` → `regla_actual / orden_eliminada` (R8) `[pendiente D1]`.
   El estado terminal **no** se mira (R9) `[pendiente D1]`.
3. `hilo.ordenMensajeroAsignadoId === null` → `regla_actual / orden_sin_mensajero` (R10)
   `[pendiente D4]`.
4. `normalizarTelefonoWa(hilo.telefonoE164) !== fromNormalizado` → `regla_actual /
   numero_distinto` (R11) `[pendiente D3]`.
5. Si no: `cita` con `ordenId = hilo.ordenId`, `mensajeroId = hilo.ordenMensajeroAsignadoId`
   (R6, `[pendiente D4]`) y `telefonoE164 = hilo.telefonoE164`.

Vive aparte del service para que D1–D4 se cambien en un solo sitio y se prueben sin fakes. El
motivo no se loguea ni sale en el resumen: existe para que los tests afirmen **por qué** se cayó a
la regla actual (R7–R12).

### 4.2 Paso nuevo en `ChatWhatsappService.ingerirEventos`

Justo antes de la llamada actual a `resolverOrdenActivaPorNumero`:

```
from = normalizarTelefonoWa(mensaje.telefonoE164)
decision = mensaje.citadoWaMessageId
  ? decidirEnrutadoPorCita(from, await conversacionRepo.findHiloDeSalienteCitado(id))
  : { via: "regla_actual", motivo: "sin_cita" }
resolucion = decision.via === "cita"
  ? { ordenId, mensajeroId, telefonoE164 } de la decisión
  : await conversacionRepo.resolverOrdenActivaPorNumero(from)   // igual que hoy
```

Todo lo que sigue no cambia: `upsertParaOrden({ ordenId, mensajeroId, telefonoE164 })` devuelve el
**mismo** hilo citado (único `(orden_id, telefono_e164)`) y, si la orden se reasignó, lo pasa al
mensajero actual (R6); `insertarEntranteIdempotente` conserva el dedupe (R15) y solo un insert
nuevo sella `ultimo_entrante_at` del hilo resuelto (R14).

- Interacción con el cambio de número (311): si el entrante trae `sistema`, la clave del upsert
  sigue siendo `telefonoNuevo`, como hoy. Un mensaje `system` no trae `context`, así que en la
  práctica no se cruzan; no se añade lógica para ese caso.
- Sin cita (`citadoWaMessageId` ausente) no se hace ninguna consulta extra (R18).

### 4.3 Resumen de la ingesta — R16

`IngestaResumen` gana `enrutadosPorCita: number`: entrantes **nuevos** (`insertado === true`)
registrados por la vía `cita`. Un entrante enrutado por cita nunca suma a `sinResolver` (no pasa
por la rama `resolucion === null`). `WebhookWhatsappService` actualiza `resumenVacio` y `sumar`;
el JSON del 200 del route lleva el campo nuevo (Meta lo ignora).

### 4.4 Logs — R17

El paso nuevo no escribe en el log. Si en el futuro se quisiera diagnosticar, solo con conteos
(regla R11 de la 109, que se mantiene).

## 5. Rutas y contratos

| Pieza | Cambio |
|---|---|
| `POST /api/webhooks/whatsapp` (`app/api/webhooks/whatsapp/route.ts`) | Sin cambios de código. El cuerpo 200 suma `enrutadosPorCita`. |
| `WebhookMensajeEntrante` | `citadoWaMessageId?: string` |
| `IChatConversacionRepository` | `findHiloDeSalienteCitado` + tipo `HiloCitado` |
| `IngestaResumen` | `enrutadosPorCita: number` |

Autorización: la del webhook de siempre (firma HMAC por empresa, SL-36). No hay sesión ni acción
nueva. La empresa la fija `conEmpresa` del lote; el paso nuevo no la puede cambiar.

## 6. Alternativas descartadas

- **A. Tabla o columna nueva `wamid → orden`** para resolver la cita. Descartada: `chat_mensaje`
  ya guarda el `wa_message_id` de cada saliente con un índice único, y el hilo ya conoce su orden.
  Una tabla más sería una segunda fuente de verdad que desincronizar y una migración sin necesidad.
- **B. Componer con `ChatMensajeRepository.findByWaMessageId` + `ChatConversacionRepository.findById`
  + un lector de orden.** Descartada: tres viajes a la base por entrante citado y una dependencia
  nueva del service (lector de orden) para lo que una sola consulta con `select` anidado resuelve.
- **C. SQL a mano (`$queryRaw`) con JOIN.** Descartada: Prisma expresa la relación sin raw, con lo
  que el filtro de empresa lo pone la extensión además de la RLS, y no crece la lista de SQL a mano.
- **D. Buscar también en `whatsapp_envio_entrega`.** Descartada con la opción recomendada de D2:
  esas entregas no tienen orden ni hilo al que llevar la respuesta. Si el humano elige D2 (b), se
  añade un método de solo lectura en `WhatsappEjecucionRepository` y un motivo `respuesta_a_envio`.
- **E. Meter la decisión dentro de `resolverOrdenActivaPorNumero`** (un parámetro opcional con el id
  citado). Descartada: mezcla en el repositorio la política de D1–D4, que `docs/architecture.md`
  pone en el service, y obliga a probarla contra la base.

## 7. Pruebas (mapa previsto `R<n> → test`)

| R | Test |
|---|---|
| R1, R2, R3 | `tests/unit/types/whatsapp-webhook.test.ts` (casos nuevos `context`) |
| R4, R6–R12 (lógica) | `tests/unit/services/enrutado-por-cita.test.ts` (función pura) |
| R4, R5, R6, R14, R15, R16, R17, R18 | `tests/unit/services/chat-whatsapp-respuesta-citada.test.ts` (service con fakes) |
| R4, R7 (repositorio) | `tests/unit/repositories/chat-conversacion-repository.test.ts` (mapeo de `findHiloDeSalienteCitado`) |
| R5, R7, R12, R13 | `tests/integration/db/chat-respuesta-citada.test.ts` (base real, dos empresas, `conEmpresa`) |
| R16 | `tests/unit/services/webhook-whatsapp-service.test.ts` (suma de `enrutadosPorCita`) |
| R18 | suites existentes `chat-whatsapp-service.test.ts` y `webhook-whatsapp.route.test.ts` en verde |

## 8. Riesgos

- **Payload real de `context`.** El repo no tiene capturado un webhook con «Responder». La forma
  `context: { from, id }` es la documentada por Meta para la Cloud API; el parser blando (R2) evita
  que una variación tumbe el lote. Si llega distinto, el entrante cae en la regla actual (hoy).
- **Fakes de tests que implementan `IChatConversacionRepository`** (`chat-whatsapp-service.test.ts`,
  `chat-whatsapp-actions.test.ts`) tendrán que añadir el método nuevo para que compile el typecheck.
