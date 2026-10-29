# SLT-40 — bitacora de implementacion

## Mapa consolidado R<n> -> test (T6)

Archivos: `U-parser` = `tests/unit/types/whatsapp-webhook.test.ts` · `U-dec` =
`tests/unit/services/enrutado-por-cita.test.ts` · `U-repo` =
`tests/unit/repositories/chat-conversacion-repository.test.ts` · `U-svc` =
`tests/unit/services/chat-whatsapp-respuesta-citada.test.ts` · `I-db` =
`tests/integration/db/chat-respuesta-citada.test.ts`.

| R | tests |
|---|---|
| R1 | U-parser: `R1:` texto, imagen y `button` (tipo `otro`) con `context.id` conservan el id citado; id recortado de espacios |
| R2 | U-parser: `R2:` sin `context` no lleva la clave; `it.each` de 7 formas raras (id numerico, string, null, array, sin id, vacio, espacios); un `context` raro no tumba el lote; `citadoDe` |
| R3 | U-parser: `R3: de context solo sobrevive el id` (`from`, `forwarded`, ... desaparecen) |
| R4 | U-dec `R4`; U-repo `R4` (mapeo a `HiloCitado`, orden eliminada / sin mensajero); U-svc `R4` (`it.each` por tipo) |
| R5 | U-svc `R5` (no llama a `resolverOrdenActivaPorNumero`); I-db `R5` |
| R6 | U-dec `R6`; U-svc `R6` (reasignada A -> B) |
| R7 | U-dec `R7`; U-repo `R7` (`where` con `direccion: "saliente"`), `R7/R13` (sin fila -> null); U-svc `R7` x2; I-db `R7` |
| R8 | U-dec `R8` x2; U-svc `R8` |
| R9 | U-dec `R9`; U-svc `R9`; I-db `R9` (orden `entregado` no eliminada) |
| R10 | U-dec `R10`; U-svc `R10` |
| R11 | U-dec `R11` x2 (distinto; con/sin `+` y separadores); U-svc `R11` |
| R12 | U-dec `R12`; U-svc `R12`; I-db `R12` (la entrega no cambia) |
| R13 | U-repo `R7/R13`; I-db `R13` (saliente en B, nada escrito en B; mutacion sin RLS lo pone rojo) |
| R14 | U-svc `R14` |
| R15 | U-svc `R15` |
| R16 | U-svc `R16` |
| R17 | U-svc `R17` (logger espia en las cinco ramas) |
| R18 | U-svc `R18`; suites existentes del webhook/chat en verde con solo `enrutadosPorCita: 0` añadido |

Notas: R9 se añadio a la integracion aunque `tasks.md` T5 no lo listaba (`HiloCitado` no trae el
estado; solo contra la base se prueba un estado terminal). El aislamiento de R13 lo prueba la RLS
(design §3 no filtra `organizacion_id` a mano); la capa de la extension del cliente no se prueba
aqui.

## Cierre T6 · `./init.sh` (rapido) · 2026-10-29
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`: typecheck, lint (0 errores), Prisma,
  validador y perfil en verde. `test:rapido`: `Test Files 2 failed | 40 passed | 3 skipped (45)` ·
  `Tests 2 failed | 646 passed | 22 skipped (670)`; `✗ 'pnpm run test:rapido' fallo`.
- Los 2 rojos, fuera del baseline, no son de este diff:
  `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts` (`job_tipo` trae
  `plan_cambios_vencidos` sin handler) y `tests/unit/cron/procesar-jobs-modulos.test.ts`.
  Causa: el `node_modules` del worktree es un junction al del checkout principal (en `dev`), cuyo
  cliente de Prisma se genero con el schema de `dev`, que ya trae la migracion
  `20261028130400_plan_cambio_enums` (`4d52232`, SL-24). Esta rama esta detras de `origin/dev` y
  no tiene ese handler. Se resuelve con la sincronizacion F2.3 (merge de `dev`), que pide el leader.
- Todas las suites de SLT-40 en verde dentro de esa corrida. T6 queda abierta hasta el gate verde.

## Cierre T6 · tras F2.3 (merge `578e2d3` de `origin/dev`) · 2026-10-29 · leader
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`: **verde** (exit 0). `test:rapido`:
  `Test Files 318 passed | 2 skipped (320)` · `Tests 4468 passed | 20 skipped (4488)`; 246 rojos
  heredados del baseline fuera de la seleccion (los compara CI). Los 2 rojos de arriba desaparecen.
- E2E `e2e/dos-empresas-humo.spec.ts --project=aislamiento` (review B1): **no corre en local**.
  - En el puerto 3000 hay un `next dev` del checkout principal; Playwright lo reutiliza y no crea
    `E2E_LOG_SERVIDOR`.
  - Con `E2E_SERVIDOR=dev E2E_PUERTO=3100` y la `DATABASE_URL` local, cae antes de cualquier
    flujo: `arranque:superadmin` falla con `P2028` (base local a medio sembrar, ya anotado en
    sesiones previas).
  - La evidencia de B1 es el job `e2e (aislamiento)` de CI en el PR, que corre ese mismo spec.
    Su resultado se anota aqui antes del merge.

## Tandas T1-T3 · 2026-10-29 · backend_dev
- T1 (`12f0fee`): `lib/types/whatsapp-webhook.ts` + U-parser. vitest related:
  `Test Files 5 passed | 1 skipped (6)` · `Tests 86 passed | 5 skipped (91)`.
- T2 (`9b1cfec`): `lib/services/whatsapp/enrutado-por-cita.ts`, `HiloCitado` en
  `lib/interfaces/repositories/IChatConversacionRepository.ts` + U-dec: `Tests 10 passed (10)`.
- T3 (`6dc7f26`): `findHiloDeSalienteCitado` en interfaz y `lib/repositories/ChatConversacionRepository.ts`,
  fakes en `tests/unit/services/chat-whatsapp-service.test.ts` y
  `tests/unit/actions/chat-whatsapp-actions.test.ts` + U-repo. vitest related:
  `Test Files 37 passed | 4 skipped (41)` · `Tests 541 passed | 32 skipped (573)`.
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192`) y eslint en verde en cada una.

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

## Tanda T5 — integracion contra Postgres

### Archivos
- Nuevo `tests/integration/db/chat-respuesta-citada.test.ts`. Sin cambios de produccion.

### Como mide
Transaccion revertida (`enTransaccionRevertida`, envuelve en `conEmpresa(A)`); siembra como dueno
por empresa (`fijarEmpresa` + `crearFksDeOrden`); ingesta con `ChatWhatsappService` y repositorios
reales sobre el `tx` como `servi_app` de A (`comoApp`, RLS activa); medicion como dueno (`RESET ROLE`).
Escenario: en A, mismo numero con dos ordenes vivas asignadas (antigua con hilo + saliente +
entrante previo; nueva gana la regla actual).

### R -> test
| R | `it` |
|---|---|
| R5 | `R5: con dos ordenes vivas asignadas, el entrante que cita el saliente de la ANTIGUA queda en su hilo` |
| R9 | `R9: la orden citada en estado terminal (entregado) y no eliminada se enruta por cita igual` |
| R7 | `R7: un id citado que es de un ENTRANTE no cuenta como cita y cae en la regla actual` |
| R12 | `R12: un id citado igual al wa_message_id de una entrega automatica cae en la regla actual y la entrega no cambia` |
| R13 | `R13: un saliente de la empresa B con el wamid citado no enruta: nada se escribe en B y A sigue la regla actual` |

### Salida real
- `DATABASE_URL=<postgres local, localhost:5432/logistic> pnpm exec vitest run tests/integration/db/chat-respuesta-citada.test.ts`
  -> `Test Files 1 passed (1)` · `Tests 5 passed (5)`.
- Mutacion (solo en el test, revertida): `comoApp` -> `fijarEmpresa` (sin RLS) -> R13 rojo, los otros 4 verdes.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` -> `tsc --noEmit` sin errores.
- `pnpm exec eslint tests/integration/db/chat-respuesta-citada.test.ts` -> sin incidencias.

### Veredicto
T5 lista: R5, R7, R9, R12 y R13 verdes contra Postgres local; R13 depende de la RLS y lo demuestra la mutacion.
