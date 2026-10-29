# SLT-40 — bitacora de implementacion

## Tanda T4 (+ comentarios de T6) · 2026-10-29 · backend_dev

### Archivos
- `lib/services/ChatWhatsappService.ts` — paso por cita antes de `resolverOrdenActivaPorNumero`
  (design §4.2), `enrutadosPorCita` en `IngestaResumen`, comentario de `ingerirEventos` (T6).
- `lib/services/WebhookWhatsappService.ts` — `resumenVacio` y `sumar` con `enrutadosPorCita`.
- `lib/repositories/ChatConversacionRepository.ts` — comentario de `resolverOrdenActivaPorNumero`
  nombrando la via por cita (T6). Sin cambio de codigo.
- `tests/unit/services/chat-whatsapp-respuesta-citada.test.ts` — nuevo (19 tests).
- Forma exacta del resumen con `enrutadosPorCita: 0`, sin tocar aserciones de enrutamiento:
  `tests/unit/services/webhook-whatsapp-service.test.ts`,
  `tests/unit/api/webhook-whatsapp-por-empresa.test.ts`,
  `tests/unit/api/webhook-whatsapp-entregas.test.ts` (literal de un doble; no listado en tasks).
- `tests/integration/api/webhook-whatsapp.route.test.ts` — sin cambios: solo afirma
  `toMatchObject({ ok: true })`, no la forma exacta del resumen.

### Mapa R<n> -> test (esta tanda; `chat-whatsapp-respuesta-citada.test.ts`)
| R | it |
|---|---|
| R4 | `R4: un entrante de tipo %s con cita util se registra en el hilo citado` (texto, imagen, ubicacion, contactos, otro) |
| R5 | `R5: con dos ordenes vivas del numero, la cita al saliente de la MENOS reciente va a su hilo` |
| R6 | `R6: si la orden citada se reasigno ... el upsert pasa el hilo a B` |
| R7 | `R7: id citado sin saliente ... -> regla actual con el from normalizado`; `R7: sin cita util y sin orden por numero, cuenta sinResolver igual que hoy` |
| R8 | `R8: orden citada eliminada -> regla actual ...` |
| R9 | `R9: una orden citada en estado terminal pero no eliminada se enruta por cita` |
| R10 | `R10: orden citada sin mensajero asignado -> regla actual ...` |
| R11 | `R11: el from no coincide con el numero del hilo citado -> regla actual ...` |
| R12 | `R12: id citado de una entrega automatica (no esta en chat_mensaje) -> regla actual ...` |
| R14 | `R14: un entrante nuevo enrutado por cita sella SOLO la marca del hilo citado` |
| R15 | `R15: el mismo wamid repetido (dedupe) no re-sella la marca ni cuenta` |
| R16 | `R16: enrutadosPorCita cuenta solo inserts nuevos por cita y no suma a sinResolver` |
| R17 | `R17: ninguna rama del enrutado por cita escribe en el log ...` |
| R18 | `R18: sin citadoWaMessageId no se busca el hilo citado ...` + suites existentes en verde sin cambiar enrutamiento |

R1-R3 (T1), logica de R6-R12 (T2) y R4/R7/R13 de repositorio (T3) ya estan en sus tests;
R5/R7/R12/R13 contra Postgres quedan para T5.

### Salida real
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` -> `tsc --noEmit` sin errores.
- `pnpm exec eslint <7 archivos tocados>` -> `ESLint: No issues found`.
- `pnpm exec vitest related --run <archivos tocados>` ->
  `Test Files 40 passed | 4 skipped (44)` · `Tests 589 passed | 32 skipped (621)`.
  Los skipped son integracion sin base local (`HAY_BASE_DE_DATOS`), entre ellos
  `tests/integration/api/webhook-whatsapp.route.test.ts` y `chat-entrante-telefono-cr.test.ts`.
- `pnpm exec vitest run tests/unit/services/chat-whatsapp-respuesta-citada.test.ts` -> 19 passed.

### Veredicto
T4 lista: paso por cita cableado, contador agregado, R4-R6 y R14-R18 con test; typecheck y lint verdes.
