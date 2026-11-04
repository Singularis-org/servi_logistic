# Review SLT-40 «Respuestas de WhatsApp enrutadas por mensaje citado»

- Fase F2.4 · rama `feature/SLT-40-whatsapp-respuesta-por-mensaje-citado` · HEAD `578e2d3`.
- Diff revisado: `git diff origin/dev...HEAD`. Son 21 archivos: 6 de `lib/`, 9 de tests, el spec y la bitácora.
- Reviewer · 2026-10-29.

## Verificación ejecutada (en esta revisión)

| Qué | Resultado |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` | `tsc --noEmit` sin errores |
| `pnpm exec eslint <los .ts del diff>` | exit 0, sin incidencias |
| `vitest run` con las 10 suites del diff (parser, decisión, service con cita, repositorio, chat-whatsapp-service, webhook-whatsapp-service, webhook entregas, webhook por empresa, actions, integración) | `Test Files 9 passed \| 1 skipped` · `Tests 211 passed \| 5 skipped`. El skip es la integración, que no tiene `DATABASE_URL` |
| `tests/integration/db/chat-respuesta-citada.test.ts`, con el `DATABASE_URL` del `.env` principal (Postgres en `localhost:5432`, no Ordenex) | `Test Files 1 passed` · `Tests 5 passed (5)` |
| `pnpm run test:guardias` | 1 archivo rojo: `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (4 tests). Está en `tests/baseline-rojos.json` y el diff no toca `init.sh` ni `scripts/`, así que **no es hallazgo**. El resto, verde |

No corrí el E2E (ver B1).

## Checklist

### Especificación
- [x] `requirements.md` con R1–R18 en EARS. D1–D4 cerradas con la opción recomendada y la aprobación de Camilo del 2026-10-29.
- [x] `design.md` con alternativas descartadas y su porqué (§6, de la A a la E).
- [ ] **Todas las tasks en `[x]`.** T6 sigue en `[ ]` (ver B2).
- [x] `design.md` abre con `## Lo que ya existe` y el diff no re-crea nada de esa lista:
  - se reutilizan `normalizarTelefonoWa`, `upsertParaOrden`, `insertarEntranteIdempotente` y el patrón `.optional().catch(undefined)`;
  - `findByWaMessageId` no se duplica: la alternativa B está descartada con su motivo.

### Equipo
- [x] Assignee Camilo; rama del candado (`progress/features/SLT-40.md`).

### Trazabilidad (R → test, verificado leyendo cada `it`)
- [x] R1, R2 y R3 → `tests/unit/types/whatsapp-webhook.test.ts > SLT-40 · id citado del entrante`:
  - R1: texto, imagen, `button`/`otro` y el id recortado;
  - R2: sin `context`, un `it.each` de formas raras, un lote que no se cae y `citadoDe`;
  - R3: solo sobrevive el id.
- [x] R4 → `enrutado-por-cita.test.ts`, el repositorio (mapeo) y el service (`it.each` por los 5 tipos).
- [x] R5 → service (no llama a `resolverOrdenActivaPorNumero`) e integración contra Postgres. La integración mete en el mismo lote un entrante sin cita como contrapeso.
- [x] R6 → decisión y service: reasignada de A a B, el upsert va con B.
- [x] R7 → decisión, repositorio (`where` con `direccion: "saliente"`), service e integración (un id de entrante cae en la regla actual).
- [x] R8, R10 y R11 → decisión (un motivo por caso) y service (cae en la regla actual con el `from` normalizado).
- [x] R9 → decisión, service e integración: orden `entregado` viva, con autocomprobación del estado.
- [x] R12 → decisión, service e integración: la entrega no cambia y los conteos de envíos tampoco.
- [x] R13 → repositorio (sin fila da `null`) e integración: el saliente está en B, B no cambia y A sigue la regla actual.
- [x] R14, R15, R16 y R17 → `chat-whatsapp-respuesta-citada.test.ts`. R17 recorre las cinco ramas con el logger espía. R14 también se ve de paso en la integración R5.
- [x] R18 → service: sin cita no se llama a `findHiloDeSalienteCitado`. Las suites existentes siguen verdes; en ellas solo se añadió `enrutadosPorCita: 0` y ninguna aserción de enrutamiento cambió (revisado en el diff).
- [x] El mapa `R<n> -> test` está en `progress/impl_SLT-40.md`.

### Calidad de código
- [x] Typecheck sin errores.
- [x] Lint sin errores.
- [ ] `gate-completo` en CI: todavía no hay PR. Queda pendiente; no es hallazgo de esta vuelta.
- [ ] **Flujo crítico «Aislamiento entre empresas»**: no hay salida del E2E en la bitácora (ver B1).
- [x] Sin dependencias nuevas: el diff no toca `package.json` ni el lockfile.

### Seguridad y configuración
- [x] Sin secretos ni valores de entorno hardcodeados.
- [x] El webhook no es nuevo: firma HMAC por empresa (SL-36) sin cambios. La idempotencia por `wa_message_id` se conserva (R15).
- [x] Sin literales de país ni de moneda en código nuevo. El `506` solo aparece en los datos de los tests.

### Datos y seguridad (perfil)
- [x] Sin tablas, migraciones ni RLS nuevas.
- [x] Query nueva sobre negocio:
  - `chatMensaje.findFirst` pasa por la extensión del cliente. `ChatMensaje` está en `modelos-de-negocio.ts` y `findFirst` está en `CON_WHERE`, así que la extensión inyecta `organizacionId`.
  - La RLS cubre el `select` anidado.
  - Hay un test de integración con dos empresas (R13). Además, la mutación sin RLS lo pone en rojo (bitácora).
  - Es el mismo patrón del resto del repositorio, que no escribe `organizacionId` a mano.
- [x] Nada de Ordenex en el diff.
- [x] Nada de PII en el log: la rama nueva no loguea (R17 probado).

### Arquitectura y permisos
- [x] La política D1–D4 vive en `lib/services/whatsapp/enrutado-por-cita.ts` (función pura) y la lectura en el repositorio. Zod en el borde: `context` blando en `metaMessageSchema`.
- [x] Autorización: la del webhook de siempre. No se añade ningún módulo que exigir (WhatsApp es núcleo).

### Reglas del proyecto (perfil-agentes > reviewer)
- [x] Ninguna query de negocio sin `organizacion_id`: la inyecta la extensión y la RLS la respalda (R13 en integración).
- [x] Sin migraciones, así que no aplica `down.sql`. Sin literales de país ni moneda. Sin Ordenex. Sin dependencias.
- [x] Los comentarios explican el porqué: por qué la cita va antes, por qué no se filtra a mano y por qué el estado terminal no se mira.

## Hallazgos

**B1. BLOQUEANTE: falta la corrida del E2E de aislamiento `e2e/dos-empresas-humo.spec.ts`.**
- **Por qué se exige:** `docs/checkpoints-proyecto.md > Flujos críticos` lo pide a toda feature que toque datos de negocio o una entrada sin sesión. SLT-40 cumple las dos condiciones:
  - añade una lectura nueva de `chat_mensaje`, `chat_conversacion` y `orden`;
  - esa lectura corre en el webhook de WhatsApp, que no tiene sesión.
- **Qué pide `CHECKPOINTS.md`:** la salida local de ese E2E en `progress/impl_SLT-40.md`. Hoy no hay ninguna.
- **Precedente:** el mismo criterio bloqueó SL-36 (B1) y SLT-32 (B1).
- **Para cumplirlo:** correr `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --no-deps` y pegar la salida (passed, skipped y exit) en `progress/impl_SLT-40.md`. No hace falta tocar código.

**B2. BLOQUEANTE: T6 sigue en `[ ]` en `tasks.md`.**
- **Qué falta:** `CHECKPOINTS.md > Especificación` exige todas las tasks en `[x]`.
- **Por qué sigue abierta:** la bitácora la dejó así a la espera del gate verde. Su última salida de `./init.sh` todavía muestra 2 rojos de antes del merge con `origin/dev`.
- **Para cumplirlo:**
  1. Anotar en `progress/impl_SLT-40.md` la salida de `./init.sh` posterior al merge `578e2d3`. El leader informa que salió verde, con `Test Files 318 passed | 2 skipped` y `Tests 4468 passed | 20 skipped`.
  2. Marcar T6 en `[x]`.

**m1. menor: la suma de `enrutadosPorCita` entre empresas no se prueba con un valor distinto de 0.**
- **Qué falta:** design §7 asignaba a `tests/unit/services/webhook-whatsapp-service.test.ts` la suma de `enrutadosPorCita` (R16). El diff solo añade `enrutadosPorCita: 0` a los dobles.
- **Riesgo:** si alguien borra la línea nueva de `sumar`, ningún test se pone rojo. R16 sigue cubierto en el resumen de `ChatWhatsappService`, que es lo que pide el requisito.
- **Recomendado:** un caso con dos empresas cuyo doble devuelva `enrutadosPorCita: 1` en cada una, y comprobar que el total da 2.

**m2. menor: la capa de la extensión del cliente no tiene un test propio para `findHiloDeSalienteCitado`.**
- **Qué pasa:** la integración pasa al repositorio el `tx` sin la extensión, así que R13 lo prueba solo la RLS. Así lo dice la bitácora y la mutación lo confirma.
- **Por qué no bloquea:** la RLS es la barrera que el perfil exige demostrar. La extensión ya está probada en general (`lib/db/extension-empresa.ts`) y `ChatMensaje` está en su lista.
- **Lo deseable:** que la propia RLS y la extensión se prueben juntas en algún momento. No es requisito de esta ficha.

**m3. menor: dos archivos de test del diff no estaban en `tasks.md`.**
- `tests/unit/api/webhook-whatsapp-entregas.test.ts`: solo añade `enrutadosPorCita: 0` a un doble para que compile, sin aserciones de enrutamiento.
- R9 en la integración: está justificado, porque `HiloCitado` no trae el estado y la orden terminal solo se puede probar contra la base.

Ninguno de los dos cambia el alcance; los anoto solo para que conste.

## Veredicto

**RECHAZADO**, con 2 bloqueantes:
- **B1:** falta la evidencia del E2E `dos-empresas-humo`.
- **B2:** T6 sigue sin marcar y falta la salida de `./init.sh` posterior al merge.

Ninguno pide cambiar el código: el código, la trazabilidad R1–R18 y la integración contra Postgres están bien. Al cerrarlos, la vuelta 2 se acota a la bitácora y a `tasks.md`.
