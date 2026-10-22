# SL-14 — Tareas

Precondiciones:

- SL-10 está integrada en `dev`, y con ella `.env.example` versionado.
- La rama de SL-14 está rebasada sobre `dev`.

Todo se hace en el worktree `.worktrees/SL-14-dominio-a-configuracion`. Cada `./init.sh` va a un log
con `INIT_EXIT=$?` dentro. El código, los docs y los tests no escriben el dominio literal: se escribe
`ordenex\.co` o «el dominio de Ordenex». La guardia no recorre `progress/`.

## Tareas

- [x] **T1 — Medida de partida.** Listar los archivos con el dominio usando el detector de D6 (no un
  `git grep -i` pelado, que da falsos positivos). Anotar la lista en `progress/impl_SL-14.md`.
  **Hecho:** lista anotada. Si aparece un archivo que no está en la tabla de Alcance, PARA y
  repórtalo.

- [x] **T2 — Guardia en rojo primero** (R9–R11, D6). Crear
  `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`: detector, excepciones temporales con su
  ficha, poda y autocomprobación.
  **Hecho:** la autocomprobación pasa. El barrido sale rojo nombrando los 32 archivos de SL-14: 3 de
  `docs/`, 5 de `lib/`, 23 de `tests/` y `.env.example`. Los 3 specs de SL-10 se limpian antes de T2
  (ampliación del leader, 2026-10-21), así que no aparecen.

- [x] **T3 [P] — Push** (R1–R3, D1). Quitar el default de `lib/config/push.ts` y exigir tres piezas.
  Reescribir los casos de `push-config.test.ts`. Ajustar los tests que activan push con dos claves.
  **Hecho:** `pnpm exec vitest related --run lib/config/push.ts` en verde. Rojo comprobado
  restaurando el default en una copia, y revertido.

- [x] **T4 [P] — Ejemplos** (R7, D2). Cambiar:
  - `lib/types/plantilla-datos.ts`;
  - `lib/whatsapp-envios/informes/aviso-interno.ts`;
  - `lib/api/openapi-spec.ts`;
  - `lib/utils/linkificar.ts`;
  - los tests que los afirman, incluida la línea 63 de `openapi-406-evidencias-url.test.ts`.

  **Hecho:** `vitest related` sobre los cuatro de `lib/` en verde, y el caso
  `valorDeCampo(...) === campo.ejemplo` sigue verde.

- [x] **T5 [P] — Fixtures de tests** (R9, D3).
  **Hecho:** cada archivo tocado pasa `pnpm exec vitest run <archivo>`, salvo los de integración que
  estén en el baseline. Ninguna aserción se elimina ni se sustituye por su propia fuente.

- [x] **T6 [P] — Docs del plan** (R9, D4). `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y
  `docs/checkpoints-proyecto.md`, sin el literal.
  **Hecho:** el detector no marca ninguno de los tres, y el comando de medida de §4 sigue escrito.

- [x] **T7 [P] — Contenido de `.env.example`** (R8, D5). Añadir a la guardia el caso de R8: las tres
  variables declaradas sin valor, y `VAPID_SUBJECT` documentada como obligatoria.
  **Hecho:** el caso en verde. `push-config.test.ts` y
  `sinpe-sin-variables-de-entorno.guardia.test.ts` en verde.

- [x] **T8 — R4–R6 siguen cubiertos.** Depende de T4 y T5. Citar en `progress/impl_SL-14.md` los
  casos existentes de ausencia de variable:
  - `informe-aviso-interno.test.ts`: base `null`;
  - `plantilla-datos.test.ts`: `urlBase: ""`;
  - `webhook-estado-service.test.ts`: `WEBHOOK_APP_ORIGIN: null`.

  **Hecho:** los tres en verde. Si alguno no existe, se añade.

- [x] **T9 — Guardia en verde.** Depende de T3 a T8.
  **Hecho:** guardia verde. La poda se comprueba quitando el dominio de una copia temporal de una
  entrada: rojo nombrando la entrada y su ficha. Después se revierte.

- [x] **T10 — Gate de cierre** (R12–R14). Depende de T9. Se corre el modo completo porque
  `.env.example` y los docs no entran en el grafo de `vitest related`.
  - `./init.sh --completo`: `INIT_EXIT=0`, o rojo solo en archivos del baseline. Log en
    `_trabajo/gate-completo-SL-14.log`.
  - R12: `git diff --name-only dev...HEAD` no toca `.gitignore`, ni `specs/` salvo el propio spec, ni
    `docs/api/`, `app/_landing/`, `app/page.tsx`, `app/globals.css`, `app/layout.tsx` o
    `scripts/seed-maestro.ts`.
  - R13: sin cambios en `package.json` ni en el lockfile, y `.env.example` sin nombres nuevos salvo
    las dos `NEXT_PUBLIC_*` que ya existían.
  - Mapa `R<n> → test` en `progress/impl_SL-14.md`.

  **Hecho:** las tres comprobaciones, con sus logs citados.

## Trazabilidad prevista

| Req | Test o corrida |
|---|---|
| R1 | `tests/unit/config/push-config.test.ts` |
| R2 | `tests/unit/config/push-config.test.ts` |
| R3 | `tests/unit/config/push-config.test.ts` |
| R4 | `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts` (base `null`) |
| R5 | `tests/unit/types/plantilla-datos.test.ts` (`urlBase: ""`) |
| R6 | `tests/unit/services/webhook-estado-service.test.ts` (`WEBHOOK_APP_ORIGIN: null`) |
| R7 | `tests/unit/types/plantilla-datos.test.ts`, `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts`, `tests/unit/api/openapi-406-evidencias-url.test.ts` |
| R8 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (caso `.env.example`) + `tests/unit/config/push-config.test.ts` |
| R9 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` |
| R10 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` + corrida de poda de T9 |
| R11 | `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` |
| R12 | corrida T10: diff contra `dev` |
| R13 | corrida T10: diff de `package.json`, lockfile y `.env.example` |
| R14 | corrida T10: log de `./init.sh --completo` |

## Archivos esperados

- `.env.example`
- `docs/limpieza-ordenex.md`
- `docs/plan-saas.md`
- `docs/checkpoints-proyecto.md`
- `lib/config/push.ts`
- `lib/types/plantilla-datos.ts`
- `lib/whatsapp-envios/informes/aviso-interno.ts`
- `lib/api/openapi-spec.ts`
- `lib/utils/linkificar.ts`
- `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`
- `tests/unit/config/push-config.test.ts`
- `tests/unit/actions/push-action.test.ts`
- `tests/unit/services/push-web-service.test.ts`
- `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`
- `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts`
- `tests/fixtures/plantilla-datos.ts`
- `tests/unit/utils/linkificar.test.ts`
- `tests/unit/types/plantilla-datos.test.ts`
- `tests/unit/config/email-config.test.ts`
- `tests/components/ChatBurbujaContenido.test.tsx`
- `tests/unit/services/email-notificacion.test.ts`
- `tests/unit/api/openapi-406-evidencias-url.test.ts`
- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts`
- `tests/unit/components/ordenes-columns.test.tsx`
- `tests/integration/api/webhook-evidencias-url-resuelve.route.test.ts`
- `tests/integration/actions/novedades-pestana-por-url.test.ts`
- `tests/unit/push/web-push-sender.test.ts`
- `tests/unit/repositories/orden-repository.test.ts`
- `tests/unit/services/WebhookEventoOrdenService.test.ts`
- `tests/unit/services/webhook-estado-service.test.ts`
- `tests/unit/services/webhook-estado-service.mensajero.test.ts`
- `tests/unit/services/nodemailer-email-sender.test.ts`
- `tests/unit/repositories/webhook-orden-reader.test.ts`
- `tests/unit/guards/mensajero-forma-unica.guardia.test.ts`
- la guardia del término vetado, en `tests/unit/guards/` (solo un comentario)
- `tests/unit/guards/pwa-push.guardia.test.ts`
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`
- `progress/impl_SL-14.md`
- `specs/SL-14-dominio-a-configuracion/requirements.md`
- `specs/SL-14-dominio-a-configuracion/design.md`
- `specs/SL-14-dominio-a-configuracion/tasks.md`
