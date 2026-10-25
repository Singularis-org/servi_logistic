# SL-36 — T6.6, T6.7 y cierre de «Hecho (todo T6)» (backend_dev)

Sin commit (lo hace el leader). LF en todo lo tocado. Sin dependencias nuevas.

## Archivos

- `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts` — NUEVO. Guardia R41 con su autocomprobación.
- `playwright.config.ts` — `webServer.env` con `INTEGRACIONES_PROBADOR_DOBLE: "1"` y el anillo de claves
  (`INTEGRACIONES_CLAVES_CIFRADO` y `INTEGRACIONES_CLAVE_ACTIVA`). No pasaba ninguna variable retirada.
- `e2e/_escenarios/crons.ts` — el comentario y el mensaje de error de `drenarGeocodificacion` ya no citan
  `GOOGLE_MAPS_API_KEY`. Ahora dicen que las empresas del E2E no configuran Google Maps en `/configuracion/integraciones`.
  El marcador que se espera (`[geocode:config]`, `lib/geo/fallo-config-geocode.ts`) sigue igual.
- `.env.example` — sección nueva «SL-36: bóveda de integraciones por empresa». Declara las cuatro `INTEGRACIONES_*`
  y explica que las credenciales se configuran por empresa.
- `README.md` — fuera la fila y la nota de la variable de Maps. Entran las cuatro `INTEGRACIONES_*` y una subsección
  «Credenciales de WhatsApp, Google Maps, optimización de rutas y asistente», con el orden del despliegue (design §18).
  No nombra ninguna variable retirada: remite a design §9.3.

## T6.6 — evidencia de los builders de `app/api/cron/procesar-jobs/route.ts`

`buildHandlers` registra estos handlers que consumen una integración. Ninguno lee el entorno: todos resuelven la
credencial de la empresa del job. El job corre dentro de `conEmpresa(empresaDelJob)`.

| Job | Builder (línea del route) | Dónde se lee la credencial de la empresa |
|---|---|---|
| `geocodificacion` | `buildGeocodificacionService(now)` (l.133) | `geocodificacion-handler.ts:110`, `deps.credenciales ?? credencialesIntegracionReales()`. El cliente se arma por job con `claveApi` (`crearCliente`, l.81) |
| `optimizacion_ruta` | `buildOptimizacionRutaService(now)` (l.141) | `optimizacion-ruta-handler.ts:98`, `new RutasPorEmpresa({ credenciales: … credencialesIntegracionReales() })`. `projectId` y `getToken` salen de `rutas.deLaEmpresa()` en cada llamada |
| `whatsapp_template_sync` | `crearWhatsappTemplateSyncHandler()` (l.157) | `whatsapp-template-sync-handler.ts:36`, `await whatsappDeLaEmpresa()` |
| `whatsapp_chat_envio` | `crearWhatsappChatEnvioHandler()` (l.162) | `whatsapp-chat-envio-handler.ts:30`, `await whatsappDeLaEmpresa()` |
| `whatsapp_bienvenida` | `crearWhatsappBienvenidaHandler()` (l.169) | `whatsapp-bienvenida-handler.ts:60`, `await whatsappDeLaEmpresa()` |
| `whatsapp_envio_{programado,evento,ejecucion,reintento,mantenimiento}` | l.215-219 | Los cinco importan `buildEnviosWhatsappDeps` (`whatsapp-envio-deps.ts`). `metaReal()` (l.42) hace `await whatsappDeLaEmpresa()` |

`whatsappDeLaEmpresa` (`lib/services/whatsapp/whatsapp-de-la-empresa.ts:52-54`) hace `empresaEnCurso()` y luego
`conEmpresa(organizacionId, () => credenciales.leer("whatsapp"))` con `credencialesIntegracionReales()`.

Los demás handlers no consumen ninguna de las cuatro integraciones: `liberar_reprogramadas`, `webhook_estado`/`webhook_evento`
(webhooks salientes, fuera de alcance según §9.3), `analitica_*` y `push_web`.

No hizo falta cambiar el route: ya compilaba y recibía la credencial.

## T6.6 — el doble no se activa en producción (design §15)

Hay un test para cada mitad. No añadí ninguno:
- `tests/unit/clients/probadores/probador-doble.test.ts`:
  - «mitad 1: sin la variable (o con otro valor) no se elige»;
  - «mitad 2: en producción no se elige aunque la variable esté en 1»;
  - «`crearProbadores` da los reales en producción y el doble en E2E».
- `tests/unit/actions/integraciones.composition-root.test.ts`:
  - «design §15: en producción los cuatro probadores son los reales aunque pidan el doble»;
  - «… fuera de producción y con la variable, el doble».

Anillo del E2E: si el entorno (o el `.env` local, que el config ya carga) trae el par `INTEGRACIONES_CLAVES_CIFRADO` +
`INTEGRACIONES_CLAVE_ACTIVA`, se respeta. Si no, se usa uno de prueba fijo: `v1:` + base64 de un texto legible
(`"e2e-clave-de-prueba-no-secreta!!"`, 32 bytes). Se calcula en el config, así que no hay ningún literal con forma de secreto.
- Comprobado con `tsx`: `leerAnilloDeClaves` lo acepta (`activa v1`, 32 bytes).
- `recursos-origen-fuera` en verde.

## T6.7 — guardia `sin-credenciales-de-entorno` (R41)

- Las 19 variables están escritas literal, copiadas de design §9.3. No se importan de producción.
- Recorre `archivosDeCodigoCensados()` filtrado a `app/`, `lib/` y `scripts/`. Mira también `.env.example`, que no
  puede declararlas (§9.3).
- Formas que caza:
  - `process.env.X` y `process.env?.X`;
  - `process.env["X"]`, con `'`, `"` o backtick;
  - destructuring de `process.env`, también multilínea y con alias;
  - el acceso `.X` o `["X"]` sobre cualquier objeto (cubre `env.X` del patrón `env = process.env`);
  - el nombre como literal de texto (cubre `const VARIABLE = "X"; env[VARIABLE]`, que es el patrón de `lib/config/integraciones.ts`).
- Autocomprobación dentro del test, al estilo de `sinpe-sin-variables-de-entorno.guardia.test.ts`:
  - anti-vacuidad: más de 100 archivos, las tres raíces presentes y los consumidores clave dentro;
  - la lista mide 19 y no repite nombres;
  - un texto sintético con las 10 variantes de las 5 formas, para CADA una de las 19 variables: el detector caza cada forma;
  - `.env.example` sintético: caza `X=` y ` X =`, y no caza `# … X=`;
  - 15 variables permitidas en las 5 formas no disparan: `WHATSAPP_API_VERSION`, las `INTEGRACIONES_*`, `VERCEL_ENV`,
    las vecinas por prefijo `WHATSAPP_APP_ID_ANTIGUO` y `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, entre otras;
  - la prosa en un comentario no dispara;
  - contraprueba sobre el árbol real: `lib/config/whatsapp.ts` con la permitida cambiada por una retirada se caza.

### Mutaciones reales (en disco; cada una revertida y comprobada)

| Mutación | Resultado |
|---|---|
| `export const __mutacion = process.env.GOOGLE_MAPS_API_KEY;` al final de `lib/config/geocode.ts` | ROJO: `lib/config/geocode.ts: GOOGLE_MAPS_API_KEY (process.env.X)` y `(acceso .X / [X])` |
| `ANTHROPIC_API_KEY=` al final de `.env.example` | ROJO: «`.env.example` no declara ninguna variable retirada» |
| `const { WHATSAPP_APP_SECRET } = process.env;` en `scripts/recifrar-integraciones.ts` | ROJO: `scripts/recifrar-integraciones.ts: WHATSAPP_APP_SECRET (destructuring)` |
| Revertidas las tres | VERDE, 9/9. `git status` no muestra `lib/config/geocode.ts` ni el script |

## Cierre «Hecho (todo T6)» — Grep final

Las 19 variables de §9.3 como palabra completa (`grep -rnwE`):

| Dónde | Resultado |
|---|---|
| `app/`, `lib/` y `scripts/` | 0 menciones de cualquier tipo |
| Lecturas de `process.env` en `app/`, `lib/` y `scripts/` (`process\.env.{0,6}(V)\b`) | 0 |
| `e2e/_escenarios/crons.ts`, `.env.example`, `README.md` y `playwright.config.ts` | 0 |

Siguen nombrándolas, a propósito, los tests que prueban que ya no se leen: `vi.stubEnv(...)` en `tests/unit/**`.
También `extracciones/…/inventario.md`, un documento histórico fuera del alcance de la guardia.

## R → test

| R | Test |
|---|---|
| R41 | `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`, «app/, lib/ y scripts/ no leen ninguna variable retirada de design §9.3» y «`.env.example` no declara ninguna variable retirada» (+ 7 de autocomprobación) |

## Comandos (salida real, resumida)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit`, `TC_EXIT=0`.
- `pnpm run lint`: `✖ 231 problems (0 errors, 231 warnings)`, `LINT_EXIT=0`. `eslint` sobre los 3 archivos `.ts` tocados: sin salida.
- `pnpm run test:guardias`: `Test Files 1 failed | 305 passed | 2 skipped (308)`, `Tests 4 failed | 4190 passed | 20 skipped`.
  Los 4 rojos son `dependencias-declaradas-presentes`, el rojo de baseline.
- `pnpm exec vitest run tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`: `Tests 9 passed (9)`.
- `pnpm exec vitest related --run playwright.config.ts e2e/_escenarios/crons.ts tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`:
  `Test Files 1 passed`, `Tests 9 passed`, `REL_EXIT=0`.
- `pnpm exec vitest run` sobre `probador-doble.test.ts` y `integraciones.composition-root.test.ts`: `Tests 20 passed (20)`.
- No corrí `./init.sh`, la suite completa ni el E2E (fuera del encargo). El punto «`./init.sh` en verde» del «Hecho (todo T6)» lo cierra el leader.

## Desviaciones y notas

1. La guardia es más estricta que «lectura de `process.env`»: también caza el nombre como literal y el acceso `.X` sobre
   cualquier objeto. Así cubre la indirección por constante y el `env` pasado. Hoy da 0 hallazgos. Si algún día un texto
   de UI necesitara nombrar una de estas variables, se le añadiría una allowlist con motivo. Hoy no existe.
2. El anillo del E2E respeta el del entorno si viene el par completo. Lo elegí para no dejar ilegibles las integraciones
   de una base local de desarrollo. En CI no hay ninguno, así que se usa el de prueba fijo.
3. `google-auth-library` y `@vercel/oidc` siguen en `package.json` y ya no los usa el código de la app (T6b, nota 10).
   Quitarlos lo decide un humano.

## Veredicto

T6.6 y T6.7 hechas:
- R41 tiene su guardia, con autocomprobación y 3 mutaciones reales en rojo;
- hay 0 lecturas de `process.env` de las variables de §9.3 en `app/`, `lib/` y `scripts/`;
- solo queda el rojo de baseline `dependencias-declaradas-presentes`.
