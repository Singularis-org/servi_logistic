# SL-36 · T6.1 (consumidores de WhatsApp) y T6.2 (webhook) — bitácora de backend_dev

Fecha: 2026-10-25. Rama `feature/SL-36-integraciones-por-empresa`. Sin commit (lo hace el leader).
En paralelo otro backend_dev hace T7.1: `lib/actions/integraciones.ts`, `lib/actions/_shared/integraciones.ts`,
`lib/types/integraciones.ts` y sus tests aparecen modificados en el árbol y NO son de esta tanda.
MCP del grafo no consultado: el índice no tiene lo de T5 y todo se leyó con Grep/Read.

## Archivos

Creados:
- `lib/services/whatsapp/whatsapp-de-la-empresa.ts` — la ÚNICA puerta a la credencial de WhatsApp:
  `whatsappDeLaEmpresa()` (empresa del contexto o, sin contexto, de la sesión; lee con
  `CredencialesIntegracionService` dentro de `conEmpresa`; `sin_configurar`/`ilegible` →
  `WhatsappNoConfiguradoError`), `whatsappDeLaEmpresaOpcional()` (→ `null`), `credencialesIntegracionReales()`.
  Devuelve `{ organizacionId, integracionId, config, fetchImpl }`.
- `lib/clients/whatsapp-rechazo-credencial.ts` — R30: `fetchQueVigilaRechazo` (401 o `error.code` 190 →
  `marcarRechazo("whatsapp", "whatsapp.credencial_rechazada")` en la empresa del token; la respuesta no cambia).
- `tests/unit/services/whatsapp-sin-integracion.test.ts` (R24), `tests/unit/clients/whatsapp-rechazo-credencial.test.ts`
  (R30), `tests/unit/services/whatsapp-composition-root.test.ts` (composition root estático + dinámico).

Modificados (producción):
- `lib/config/whatsapp.ts` — fuera `loadWhatsappConfig`/`loadWhatsappWebhookConfig`; `whatsappConfigDe(credencial,
  datosPublicos)` puro; quedan `WHATSAPP_API_VERSION`, `…_TEMPLATE_CATEGORY`, `…_TEMPLATE_LANG`;
  `WhatsappNoConfiguradoError(motivo)` sin nombrar variables; `TEXTO_WHATSAPP_NO_CONFIGURADO` y `RUTA_CONFIGURAR_INTEGRACIONES`.
- `lib/clients/whatsapp-app-id.ts` — caché `Map<organizacionId, {integracionId, appId}>` (R28); sin anulación por
  entorno; `leerWhatsapp` obligatorio; usa el `fetch` de la empresa.
- `lib/services/jobs/whatsapp-envio-deps.ts` (`metaReal` asíncrona), `whatsapp-chat-envio-handler.ts`,
  `whatsapp-bienvenida-handler.ts`, `whatsapp-template-sync-handler.ts` (builders asíncronos; el handler acepta builder
  síncrono o asíncrono).
- `lib/services/EjecucionEnvioService.ts` — `meta` puede ser asíncrona (`await`); `MOTIVOS.noConfigurado` es texto fijo.
- `lib/services/whatsapp/construir-template-port.ts` — recibe `WhatsappDeLaEmpresa`.
- `lib/actions/chat-whatsapp.ts`, `lib/actions/plantillas.ts`, `lib/actions/plantillas-sync.ts`.
- `app/api/cron/sync-plantillas-whatsapp/route.ts` — service por empresa dentro de `paraCadaEmpresa`; `sinWhatsapp`.
- `app/api/chat/media/[mensajeId]/route.ts`.
- `app/api/webhooks/whatsapp/route.ts` — T6.2: delega en `WebhookWhatsappService`; `buildWebhookWhatsappService`;
  borrado `repartirPorEmpresa`, `firmaValida` local y la lectura de config.
- `lib/db/excepciones-aislamiento.ts` — fuera la entrada del route (queda la de `IntegracionEnrutadoRepository`).
- `lib/config/whatsapp-envios.ts` (solo comentario), `.env.example` (fuera las 5 variables de credencial y su texto).

Sin cambio de código (revisados): los 5 handlers `whatsapp-envio-{programado,evento,ejecucion,reintento,mantenimiento}`
y `lib/actions/envios-whatsapp.ts` (usan `buildEnviosWhatsappDeps`, que sigue síncrono; la credencial se lee en
`metaReal`, ya dentro de la ejecución), `PlantillaMensajeService.ts` y `documento-ejemplo-plantilla.ts` (reciben el
resolutor ya cableado; el texto de `sin_credencial` vive en `mensajeAppIdNoResuelto`), `lib/types/whatsapp-webhook.ts`
(desviación 1), `README.md` (no nombra ninguna variable de WhatsApp), `app/api/cron/procesar-jobs/route.ts` (los
`crearWhatsapp*Handler()` compilan igual y corren en `conSuEmpresa`).

Tests existentes actualizados: `tests/unit/clients/whatsapp-app-id.test.ts`, `tests/unit/config/whatsapp-webhook-config.test.ts`
(probaba `loadWhatsappWebhookConfig`, que ya no existe: ahora fija `whatsappConfigDe` y que el entorno no presta
piezas), `tests/unit/services/ejecucion-envio-service.test.ts`, `tests/unit/services/plantilla-enviar-aprobacion-sin-app-id.test.ts`,
`tests/unit/services/whatsapp-template-port-documento.test.ts` (`origen: "env"` → `"meta"`),
`tests/unit/actions/plantillas-composition-root-474.test.ts` (`construirWhatsappTemplatePort(wa)`),
`tests/unit/api/webhook-whatsapp-por-empresa.test.ts` (probaba `repartirPorEmpresa`, retirado por design §10: ahora
fija que el route no opera en plataforma, que delega con el cuerpo crudo y, con el service real, cada empresa ingiere
lo suyo), `tests/unit/api/webhook-whatsapp-entregas.test.ts` (mismo R38, por el service real),
`tests/integration/api/webhook-whatsapp.route.test.ts` (ahora base real, dos empresas), `tests/unit/cron/crons-sin-empresas.test.ts`
(`empresasExtra: { sinWhatsapp: 0 }` para el cron de plantillas). Ninguno se borró. `chat-media-proxy.route.test.ts`,
`procesar-jobs-whatsapp-{bienvenida,chat-envio}.test.ts`, `chat-whatsapp-actions`, `estado-app-meta`, `plantillas-actions`,
`envios-whatsapp-actions` siguen verdes sin cambios (inyectan sus dobles).

## Composition root: consumidor → quién construye → qué le pasa → test

| Consumidor | Quién lo construye | Qué le pasa | Test |
|---|---|---|---|
| Envíos automáticos: los 5 handlers `whatsapp_envio_*` y la action `probarEnvio` | `buildEnviosWhatsappDeps` → `EjecucionEnvioService({ meta: metaReal })` | `metaReal` → `whatsappDeLaEmpresa()` en la empresa del job (`conSuEmpresa`) o de la sesión → `WhatsappCloudClient` y `WhatsappMediaUploadClient` con `config` + `fetchImpl` de la empresa | `whatsapp-composition-root.test.ts` › «enviar…» y «subir el PDF…» (token de la empresa y marca en ESA empresa); `whatsapp-sin-integracion.test.ts` › «los cinco handlers…»; `ejecucion-envio-service.test.ts` |
| Job `whatsapp_chat_envio` | `buildWhatsappChatEnvioService` | `whatsappDeLaEmpresa()` → `WhatsappCloudClient({config, fetchImpl})` | `whatsapp-sin-integracion.test.ts` › «whatsapp_chat_envio…»; estático |
| Job `whatsapp_bienvenida` | `buildWhatsappBienvenidaDeps` | ídem | ídem › «whatsapp_bienvenida…»; estático |
| Job `whatsapp_template_sync` | `buildWhatsappTemplateSyncDeps` | `whatsappDeLaEmpresa()` → `construirWhatsappTemplatePort(wa)` | ídem › «whatsapp_template_sync…»; `plantillas-composition-root-474.test.ts` |
| Actions de chat (texto, media, plantilla) | `buildEnvioService` | `whatsappDeLaEmpresaOpcional()` (sesión) → cliente + subidor con `fetchImpl`; `null` → `no_configurado` | `whatsapp-sin-integracion.test.ts` › «chat…» (lee en `org-sesion`); estático |
| Actions de plantillas + `PlantillaMensajeService` | `buildPlantillaService` | UNA lectura `wa`: propagador `construirWhatsappTemplatePort(wa)` y `resolutorAppId: new ResolutorAppIdMeta({ leerWhatsapp: … wa })` | `plantillas-composition-root-474.test.ts`; `plantilla-enviar-aprobacion-sin-app-id.test.ts` |
| `estadoAppMeta` | la action | `new ResolutorAppIdMeta({ leerWhatsapp: () => whatsappDeLaEmpresa() })` | `whatsapp-sin-integracion.test.ts` › «estado de la app de Meta…» |
| `construir-template-port.ts` / `documento-ejemplo-plantilla.ts` | la fábrica | `WhatsappPlantillasClient` y `WhatsappSubidaReanudableClient` con `fetchImpl`; el resolutor lee la MISMA `wa` | estático (`whatsapp-composition-root.test.ts`); `whatsapp-template-port-documento.test.ts` |
| `whatsapp-app-id.ts` | quien construye `ResolutorAppIdMeta` (sin defecto: `leerWhatsapp` obligatorio) | caché por `organizacionId` | `whatsapp-app-id.test.ts` › «⭑ la caché de A no responde a B» |
| Action `sincronizarPlantillasWhatsapp` | la action | `deps.whatsapp ?? whatsappDeLaEmpresaOpcional` → `WhatsappPlantillasClient({config, fetchImpl})` | `whatsapp-sin-integracion.test.ts` › «sincronizar plantillas a mano…» |
| Cron `sync-plantillas-whatsapp` | `buildServiceDeLaEmpresa` DENTRO de `paraCadaEmpresa` | credencial de cada empresa en su contexto; `null` → salta y cuenta `sinWhatsapp` | `whatsapp-sin-integracion.test.ts` › «salta cada empresa…» (lee en `org-a` y `org-b`); `crons-sin-empresas.test.ts` |
| `app/api/chat/media/[mensajeId]` | `buildDescargador` | `whatsappDeLaEmpresaOpcional()` (sesión) → `WhatsappMediaClient({config, fetchImpl})`; `null` → 502 `no_configurado` | estático; `chat-media-proxy.route.test.ts` |
| Webhook | `buildWebhookWhatsappService` | `CredencialesIntegracionService({ repo: IntegracionRepository(prisma), cifrador })` → `leerAppSecret` (solo si la integración es la del número); `anotarWebhook` real; ingesta real | `tests/integration/api/webhook-whatsapp.route.test.ts` (base real) |

La capa estática (`whatsapp-composition-root.test.ts`) recorre app/ y lib/ (fuera de `lib/clients/`): toda
`new Whatsapp*Client(` lleva `fetchImpl`, y los sitios son exactamente los 8 de la tabla (11 construcciones).

## R<n> → test

| R | Test | Estado |
|---|---|---|
| R20 | `tests/integration/api/webhook-whatsapp.route.test.ts` › «⭑ R20: dos empresas, el evento de cada una se ingiere en SU empresa con SU App Secret» (base real) + `tests/unit/api/webhook-whatsapp-por-empresa.test.ts` › «SL-36/R20…» | verde, 0 skipped |
| R21 | ídem › «R21: el evento de A firmado con el App Secret de B -> 401…» y «número desconocido / sin firma -> 401» | verde |
| R19 | ídem › «R19: GET con el token de A devuelve el challenge y anota SOLO a A…» (base real; la unidad sigue en `webhook-whatsapp-service.test.ts`) | verde |
| R22 | `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts` (verde con la entrada quitada) + `webhook-whatsapp-por-empresa.test.ts` › «⭑ sin comoPlataforma ni repartirPorEmpresa…» | verde |
| R23 | `whatsapp-composition-root.test.ts` (token y fetch de la empresa del job) + `whatsapp-sin-integracion.test.ts` (cada consumidor pregunta a la empresa en curso) + `whatsapp-webhook-config.test.ts` › «token, número y WABA salen de la empresa aunque el entorno traiga las variables retiradas» | verde |
| R24 | `tests/unit/services/whatsapp-sin-integracion.test.ts` › «SL-36/R24 — actions, jobs y cron sin integración» (11 casos) | verde |
| R28 | `tests/unit/clients/whatsapp-app-id.test.ts` › «⭑ la caché de A no responde a B» (+ integración nueva no reutiliza la app vieja; sin WhatsApp no responde la caché) | verde |
| R29 (uso) | `whatsapp-sin-integracion.test.ts` › «R29: credencial ilegible -> mismo desenlace, y la integración queda marcada en SU empresa» | verde |
| R30 | `tests/unit/clients/whatsapp-rechazo-credencial.test.ts` › «⭑ Meta responde 401 a un envío: marcarRechazo('whatsapp', 'whatsapp.credencial_rechazada') en la empresa del token» (+ señal 401/190, no marca otros 4xx) + `whatsapp-composition-root.test.ts` (envío y subida reales) | verde |

## Mutaciones (script en el scratchpad: aplica, corre, restaura; 15 ejecuciones de 14 mutaciones, `restaurado=true` en todas)

| Mutación | Resultado |
|---|---|
| R28: clave de caché constante (sin empresa) en `get` y `set` | ROJO: «⭑ la caché de A no responde a B» |
| R20 (test): el evento de A firmado con el App Secret de B | ROJO: «⭑ R20: dos empresas…» |
| R20/R21: el service no comprueba la firma | ROJO 3 (R21 base real + 2 del route) |
| R20 composition root: `leerAppSecret` con `!==` en el id de integración | ROJO: «⭑ R20: dos empresas…» |
| R23/R24: la credencial se lee fuera de `conEmpresa` | ROJO 3 (actions) |
| R24: sin el corte de `sin_configurar` | ROJO 9 |
| R24: el cron no salta la empresa sin WhatsApp | ROJO: «salta cada empresa…» |
| R30: la marca de rechazo fuera de `conEmpresa` | ROJO: «⭑ Meta responde 401…» |
| R30: sin la señal `error.code` 190 | ROJO 2 |
| R30: `metaReal` construye el enviador sin `fetchImpl` | **VERDE en la 1.ª tanda** (sobrevivió: ningún test miraba con qué `fetch` se construye el cliente) → se añadió `whatsapp-composition-root.test.ts` → ROJO 2 |
| R30: `metaReal` construye el subidor sin `fetchImpl` | ROJO 2 |
| R30: chat action sin `fetchImpl` | ROJO (estático) |
| R30: puerto de plantillas sin `fetchImpl` | ROJO (estático) |
| R23: `metaReal` con la credencial de otra empresa fija | ROJO 4 |

## Grep de `process.env` (variables de WhatsApp de design §9.3)

`grep -rn` en `app/ lib/ scripts/` (`*.ts`, `*.tsx`): `WHATSAPP_CLOUD_TOKEN` 0, `WHATSAPP_NUMERO_ID` 0,
`WHATSAPP_WABA_ID` 0, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` 0, `WHATSAPP_APP_SECRET` 0, `WHATSAPP_APP_ID` 0 (la única
mención, en un comentario de `whatsapp-app-id.ts`, se reescribió sin el nombre). `.env.example`: 0 de las seis.
`README.md`: no nombraba ninguna. Quedan en el entorno, a propósito (no son claves): `WHATSAPP_API_VERSION`,
`WHATSAPP_TEMPLATE_CATEGORY`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_DEBUG_LOG` y las tres de `whatsapp-envios.ts`.

## Comandos (salida real resumida)

- `pnpm run typecheck` → `tsc --noEmit`, sin errores.
- `pnpm run lint` → exit 0, `0 errors, 232 warnings` (los mismos de antes); `eslint` de mis archivos: 0 errores, solo
  avisos preexistentes (`_job` en el handler de mantenimiento, `_d/_n/_i/_c` en `ejecucion-envio-service.test.ts`).
- `pnpm run test:guardias` → `Test Files 2 failed | 303 passed | 2 skipped`; `Tests 5 failed | 4180 passed | 20 skipped`.
  Rojos: `dependencias-declaradas-presentes` (4, baseline) y `ayuda-pantalla-ruta-existe` (1, se cierra en T7.2).
  `plataforma-solo-en-lista`: verde.
- 22 archivos de test tocados o de los consumidores, con la base de la feature: `Test Files 22 passed (22)`,
  `Tests 261 passed (261)`, 0 skipped (incluye `tests/integration/api/webhook-whatsapp.route.test.ts`, 5 casos).
- `pnpm exec vitest related --run <17 archivos de producción>` con la base: `Test Files 2 failed | 236 passed (238)`,
  `Tests 2 failed | 3123 passed (3125)`. Los dos rojos no son de esta tanda:
  - `tests/integration/db/whatsapp-envio-ejecucion-admintienda.test.ts`: «no hay ningun usuario modelo en la base de
    test», en `tests/baseline-rojos.json` (app vacía, SL-31). Inyecta su propia `meta` (no usa `metaReal`).
  - `tests/integration/db/siembra-whatsapp-envio-mantenimiento-idempotente.test.ts` › «la MIGRACION y el script
    siembran la MISMA fila»: 2 filas en vez de 1. Mide la siembra del job de mantenimiento (SQL de la migración +
    `seedJobWhatsappEnvioMantenimiento`, con `new Date()`); no pasa por ningún archivo de esta tanda salvo por importar
    el handler de mantenimiento, que no se tocó. No está en el baseline: lo dejo señalado para el leader.

## Desviaciones y decisiones

1. **`lib/types/whatsapp-webhook.ts` no se toca.** `WebhookWhatsappService` (T5.3) ya extrae
   `metadata.phone_number_id` con su propio zod laxo por `change` antes del parser de siempre, y le pasa al parser
   solo los `changes` de cada empresa; conservar `metadata` en el parser no lo usaría nadie.
2. **Una puerta común (`whatsapp-de-la-empresa.ts`)** en vez de repetir `leer` + `conEmpresa` en 10 sitios. Sin
   contexto explícito toma la empresa de la sesión (`empresaDeLaPeticion`), como la extensión; en plataforma o sin
   empresa falla con `EmpresaNoResuelta`. La variante opcional devuelve `null` también sin empresa (superadmin), para
   no cambiar el `forbidden` de las actions por un `unexpected`.
3. **R30 en el `fetch`, no en cada cliente.** Los seis clientes de Meta llaman por `fetchImpl`; un envoltorio cubre
   los seis. La marca captura la empresa al construirse, porque una action resuelta por cookie hace la llamada fuera
   de `conEmpresa`.
4. **`buildEnviosWhatsappDeps` sigue síncrono** (`meta` pasa a ser asíncrona): los 5 handlers de envíos y la action
   no cambian. `EjecucionEnvioService` solo añade `await`.
5. **Jobs sin WhatsApp** lanzan `WhatsappNoConfiguradoError`: la cola aplica backoff hasta `maxIntentos` y lo
   entierra con el motivo en `last_error` (no queda en bucle). Es el «motivo recuperable» de R24.
6. **Caché del app id por empresa con el id de la integración**: si la empresa conecta otra cuenta, la app vieja no
   se reutiliza. El test de R28 usa el mismo id de integración en A y B a propósito, para que solo la empresa las
   separe (si no, la mutación «clave sin empresa» sobreviviría por el id).
7. **Cron de plantillas**: `empresas.procesadas` cuenta solo las sincronizadas y se añade `empresas.sinWhatsapp`.
8. **Texto de R24 en pantalla**: las actions siguen devolviendo `status: "no_configurado"` (sin cambiar sus tipos);
   el texto «WhatsApp no está configurado en tu empresa» y la ruta del enlace quedan exportados en
   `lib/config/whatsapp.ts` para que la UI los use. Los toasts actuales (`ChatConversacion.tsx`, `PlantillasModule.tsx`,
   `SincronizarPlantillasButton.tsx`) dicen otro texto y no tienen enlace: es de frontend (T7.2), no se tocaron.
9. **Webhook en base real** con el composition root de producción sobre la transacción del caso
   (`clienteConTransaccionAnidada`) y una bóveda con anillo de prueba; la prueba de «ingerido en su empresa» es
   `ultimo_webhook_at`, que solo se anota tras validar la firma y filtrando por la empresa del contexto. Crear órdenes
   e hilos para ver una fila de chat exigiría la siembra que la app vacía no tiene (SL-31).

## Veredicto

T6.1 y T6.2 hechas: todos los consumidores de WhatsApp de design §9.1 leen la credencial de la empresa en curso,
el webhook delega y ya no opera en plataforma, 0 lecturas de las variables retiradas, 261 tests verdes y 13 de 14
mutaciones en rojo a la primera (la que sobrevivió destapó el hueco y ya está cubierta).
