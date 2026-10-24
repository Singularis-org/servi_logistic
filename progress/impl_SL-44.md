# SL-44 — E2E en verde en CI · bitácora del implementer

- Worktree `.worktrees/SL-44-e2e-verde-ci`, rama `feature/SL-44-e2e-verde-ci`. `origin/dev` mergeado
  (sin rebase) en `47a2e66`: trae SL-39 y SL-40 (`e2e/cobro-plataforma-sl40.spec.ts` entra en alcance).
- Base local: un contenedor propio `sl44-pg` (`postgres:17`, puerto 5444, credenciales locales de
  usar y tirar), bases `sl44_*`. No se usa la base `servi-logistic` ni el `.env` de la raíz: el `.env`
  del worktree solo tiene `DATABASE_URL` a ese contenedor y un `SESSION_SECRET` generado.
- Dependencias: `pnpm install --frozen-lockfile` real en el worktree (no junction: hay otras sesiones vivas).

## Tanda 1

### T1.1 — El error real de cada spec (run 40020120423)

`gh run view 40020120423 --log-failed`: **49 failed, 28 did not run, 3 passed** (14,2 min). Primer
error por spec (entre paréntesis, los casos con ese error):

| Spec | Primer error | ¿Coincide con D5? |
|---|---|---|
| `analitica-roles` (7) | `page.waitForURL: Timeout 5000ms` (login de usuario fijo inexistente) | Sí |
| `asignacion-satelite` (1) | `waitForURL` timeout | Sí |
| `auth` (11) | 4× `waitForURL` timeout; `toContainText`/`toHaveCount`/`toBeVisible`: el `getByRole('alert')` casa también `__next-route-announcer__`; `toBeFocused`, `toHaveAttribute` | Sí, y añade: los localizadores de `alert` son ambiguos (casan el anunciador de rutas de Next) |
| `cierre-bodega-satelite` (3) | `waitForURL` timeout | Sí |
| `cierre-dia` (2) | `waitForURL` timeout | Sí |
| `cierre-vencido-modelo` (1) | `waitForURL` timeout | Sí |
| `cierres-admin-rechazos-sla` (1) | `waitForURL` timeout | Sí |
| `cierres-admin` (2) | `waitForURL` timeout | Sí |
| `devolucion-origen` (1) | `waitForURL` timeout | Sí |
| `dos-empresas-humo` (1) | `falta SL17_HUMO_LOG_SERVIDOR` | Sí |
| `historial-orden` (1) | `waitForURL` timeout | Sí |
| `home` (1) | `toHaveTitle` | Sí (se retira) |
| `marca` (1) | `usuario_empresa_o_superadmin` check (admin sin `organizacion_id`) | Sí |
| `mi-wallet` (2) | `waitForURL` timeout | Sí |
| `mis-asignaciones` (4) | `waitForURL` timeout | Sí |
| `rastreo-publico` (1) | `toBeVisible` (guía fija inexistente) | Sí |
| `recepcion-satelite` (1) | `waitForURL` timeout | Sí |
| `reglas-bloqueos-cierre` (1) | `waitForURL` timeout | Sí |
| `reintentos-escalado` (1) | `waitForURL` timeout | Sí |
| `reprogramacion-liberacion` (1) | `waitForURL` timeout | Sí |
| `superadmin-arranque` (1) | `falta SL17_HUMO_LOG_SERVIDOR` | Sí |
| `superadmin-empresas` (1) | `falta SL17_HUMO_LOG_SERVIDOR` | Sí |
| `wallet-mensajeros` (2) | `waitForURL` timeout | Sí |
| `wallet` (2) | `waitForURL` timeout | Sí |

Los 28 «did not run» son los casos seriales tras el primer rojo de su `describe` y los saltados
(`wallet-iva-aparte-sl39` por `SL39_UI`). `--log-failed` no lista los 3 verdes, así que no se
nombran; `zona-especial-dos-empresas` no aparece entre los rojos. D5 es coherente con el run; no se
corrige.

### T1.2 — Guarda del OTP en producción (R1–R3)

- `lib/config/email.ts > otpDebugLogHabilitado`: `VERCEL_ENV === "production"` → `false`.
- `tests/unit/config/email-config.test.ts` y `tests/unit/services/email-notificacion.test.ts`: los 4
  casos de D1 (el segundo espía `info`, `warn`, `log`, `error` y `debug`: el código no sale por ningún
  canal). `VERCEL_ENV` se guarda y se restaura en cada caso.
- `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts`: función pura `hallazgosOtpDebug`
  con un fixture verde, 6 rojos de asignación fuera de pruebas y uno por cada motivo de `.env.example`
  (con valor; sin la variable), y la pasada por `git ls-files`. **Decisión:** ignora los `.md` y las
  líneas de comentario, porque README, specs y progress citan `AUTH_OTP_DEBUG_LOG=1` en prosa; eso no
  es «dar un valor» (R3).
- Salida: 3 archivos, **49 passed**. typecheck sin errores; eslint sin hallazgos.
- **Mutación (a)**, sin el `if`: **4 failed | 34 passed** (los 4 `production`). Restaurado desde
  copia, `cmp` OK, vuelta a 38 passed.
- **Mutación (b)**, `lib/zz-mutacion-sl44.env` con `AUTH_OTP_DEBUG_LOG=1` (`git add -N`): rojo
  `lib/zz-mutacion-sl44.env:1 · asignacion-fuera-de-pruebas`. Retirado: 11 passed.

### T1.3 — Medir el servidor del E2E (D3)

`next build` (exit 0) + `next start -p 3044` (`NODE_ENV=production`) contra `sl44_e2e`.

1. **Cookie `secure` en `http://localhost`: entra.** Login real por `/login` con un maestro de
   `altaDeEmpresa` + `prepararAcceso` (spec temporal, borrado): `url_final=/dashboard dashboard=si`,
   `cookies=[{"name":"session","secure":true,"httpOnly":true,"domain":"localhost"}]`.
2. **`@next/env` respeta un vacío ya definido.** Con un `.env` con `SMTP_HOST=127.0.0.1`,
   `SMTP_PORT=1` y `SMTP_USER`/`SMTP_PASSWORD` inventados, y el proceso con `SMTP_USER=""
   SMTP_PASSWORD=""`: `[email] sin SMTP configurado; no se envia. to=<…> asunto="Tu codigo de
   verificacion de Servi Logistic"` (emisor de consola). Contraste sin esas variables en el proceso:
   `NodemailerEmailSender` → `ECONNREFUSED 127.0.0.1:1`. Una clave **ausente** sí la rellena el `.env`.
3. **Decisión: `next start` en CI**, por los motivos de D3; ninguna medida lo contradice.
   `E2E_SERVIDOR=dev` queda para local. El lanzador pasa `SMTP_USER=""` y `SMTP_PASSWORD=""` al hijo;
   no borra claves ni pone un `SMTP_HOST` cerrado.

## Tanda 2

### T2.1 — Doble de Storage (D2; R4, R5, R6)

**Archivos creados:** `e2e/_storage-falso/servidor.mjs`, `tests/unit/e2e/storage-falso.test.ts`,
`e2e/fixtures/evidencia.jpg` (274 B, 32x24, generado con el `sharp` ya instalado desde un script de
un solo uso fuera del repo; FFD8 inicial, FFD9 final, decodifica a 2304 bytes RGB).

**Protocolo leído de `@supabase/storage-js` 2.110.1** (`node_modules/.pnpm/@supabase+storage-js@2.110.1/.../src/`):
- base `${SUPABASE_URL}/storage/v1`: supabase-js `SupabaseClient.ts:321`.
- upload/update: `packages/StorageFileApi.ts:93` (`x-upsert` solo en POST), `:114-117` (Uint8Array = cuerpo
  crudo + content-type; Blob = multipart `:98-104`), `:142-149` (`POST|PUT /object/<b>/<p>` → `{ Id, Key }`).
- createSignedUrl: `:716-721` (`POST /object/sign/<b>/<p>` `{ expiresIn }` → `{ signedURL }` relativo), `:731-733`
  (URL absoluta = `${url}${signedURL}` con `encodeURI`).
- createSignedUrls: `:800-805` (`POST /object/sign/<b>` `{ expiresIn, paths }`), `:815-820` (array `{ error, path, signedURL }`).
- download `:906-915` (`GET /object/<b>/<p>`); exists `:993` (HEAD); remove `:1154-1159` (`DELETE /object/<b>` `{ prefixes }`);
  list `:1401-1408` (`POST /object/list/<b>`); `_getFinalPath` `:1495-1497`.
- createBucket: `packages/StorageBucketApi.ts:215-227` (`POST /bucket`).
- errores: `lib/common/fetch.ts:66-86` (no-ok → `StorageApiError(message, status, statusCode)`).
- Uso en la app: `SupabaseFileStorage.ts:47,61`, `SupabaseSignedUrlProvider.ts:50,64`,
  `SupabaseAlmacenDescargas.ts:82,88,101,116,126`, `SupabaseAlmacenEnviosWhatsapp.ts:70,76,91,99,108`.
  Los `SupabaseAlmacen*` deciden por `/already exists/|409` y `/not found/|404`: el doble responde
  duplicado como Storage real (400, `statusCode: "409"`, «The resource already exists»).
- Decisión: los buckets existen implícitos al subir (la creación perezosa ya tiene sus tests de unidad);
  multipart se rechaza explícito; una ruta desconocida da 501 con mensaje en stderr.

**R → test** (`tests/unit/e2e/storage-falso.test.ts`):
- R4 → «R4: las clases reales de lib/storage con SUPABASE_URL al doble suben y firman contra él» y «R4/R5: lo subido…».
- R5 → «R4/R5: lo subido… mismos bytes y tipo», «R5: firmar varios…», «R5: firmar un objeto que no se subió…»,
  «R5: borrar deja el objeto sin firma…», «R5: una URL firmada con un token que no casa…».
- R6 → `git diff --stat -- lib/storage lib/actions app/api` vacío.

**Salida real:**
- `pnpm exec vitest run tests/unit/e2e/storage-falso.test.ts` → `Tests 11 passed (11)`.
- Mutación (servir lo firmado con otros bytes): `Tests 5 failed | 6 passed (11)`; restaurado desde copia,
  `cmp` idéntico, de nuevo `11 passed`.
- Como script: `E2E_STORAGE_PUERTO=54391 node e2e/_storage-falso/servidor.mjs` → `/salud` 200; con
  `E2E_STORAGE_PUERTO=abc` lanza «no es un puerto valido».
- `pnpm exec eslint <2 archivos>` → exit 0. `pnpm run typecheck` → exit 0.
- `pnpm run test:guardias` → `Test Files 1 failed | 303 passed (304)`; el rojo es
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (4 casos: `init.sh` sin el marcador
  «>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<» ni `scripts/verificar-dependencias.mjs`). `init.sh` no está
  tocado en esta rama: heredado, ajeno a T2.1.

**Veredicto T2.1:** doble y test de contrato en verde, mutación en rojo, R6 intacto.

### Gate de la tanda 1 (con T2.1)

`TEST_RAPIDO_BASE=origin/dev ./init.sh`: `Tests 4145 passed | 1 skipped`, 247 rojos del baseline
fuera de la selección, `init OK`, **INIT_EXIT=0**. El rojo de
`dependencias-declaradas-presentes.guardia.test.ts` que vio T2.1 está en `tests/baseline-rojos.json`.

### Aviso de choque con SL-45 (coordinador, 2026-10-24)

SL-45 cambia la pista de la deuda que fija `e2e/cobro-plataforma-sl40.spec.ts:53` e importa
`e2e/_dos-empresas-fixture.ts` y `e2e/_wallet-iva-sl39-siembra.ts`. Regla para SL-44: esas dos
fixtures conservan sus exportaciones y firmas (solo se añade), y el texto de la línea 53 no se fija
como literal nuevo.

## Tanda 3

### T3.1 — `tests/fabricas/e2e.ts` (D4; R7, R10, R11, R12)

**Archivos creados:** `tests/fabricas/e2e.ts`, `tests/unit/fabricas/e2e-host.test.ts`.

**API:** `validarUrlBaseE2E(url)`, `abrirBaseE2E(): PrismaClient`, `catalogosQueFaltan(p)`,
`correoE2E(rol)`, `crearEmpresaE2E(etiqueta): Promise<EmpresaE2E>`,
`crearUsuarioE2E(e, rol, extra?: { zonaId?, vehiculoId? }): Promise<UsuarioE2E>`,
`confiarDispositivo(u, userAgent)` (upsert, repetible), `sesionDe(browser, u): Promise<Cookie[]>`
(confía el UA de su contexto y entra por `/login`).

**Desvíos de la firma de D4:**
- sin `tiendaId`: `usuario` no tiene esa columna; el `adminTienda` ES la tienda;
- con `vehiculoId`: `UsuarioService.crear` exige vehículo al mensajero; por defecto, el primero de `VEHICULOS_SEED`.

**Servicios:** empresa por `OrganizacionService.altaEmpresa` en `comoPlataforma("SL-44", …)`; usuarios por
`UsuarioService.crear` (la composición de `lib/actions/usuarios.ts`) en `conEmpresa`, con actor el maestro y
`passwordMode: "manual"` (hashea `hashPassword`).
**Excepciones de R8** (cliente dueño, no son estado de negocio): la contraseña del maestro (`altaEmpresa` le
pone una inservible y solo «recuperar contraseña» con OTP la cambia) y el `trusted_device` (técnica de `prepararAcceso`).
**R12:** toda función valida `DATABASE_URL` antes de abrir el cliente dueño o tocar `getPrismaClient`; rechaza
`?host=`/`?hostaddr=` (pg los deja pisar el host). **R11:** la base inalcanzable o un catálogo de `db:seed`
ausente (rol, order_status, vehiculo, tipo_identificacion `cedula`, provincia) lanza con el nombre de lo que falta.

**R → test** (`tests/unit/fabricas/e2e-host.test.ts`): R12 → «un host remoto inventado lanza antes de abrir
conexión» (+ `?host=`, prefijo `localhost.`, mensaje sin URL; «localhost y 127.0.0.1 se aceptan»);
R11 → «sin DATABASE_URL lanza…», «nombra el catálogo y el valor que falta»; R10 → «son @example.test…»,
«dos llamadas dan correos distintos». R7: la fábrica; su uso en los specs lo prueban T3.2–T6.

**Salida real:**
- `pnpm exec vitest run tests/unit/fabricas/e2e-host.test.ts` → `Tests 11 passed (11)`.
- Mutación (chequeo de host a `false &&`): `Tests 4 failed | 7 passed (11)`; restaurado de copia, `cmp` idéntico.
- Humo contra `sl44_e2e` (localhost, script tsx de un solo uso, ya borrado, bajo `gate.lock`): empresa + maestro,
  adminTienda, adminSatelite (zona), mensajero (zona y vehículo): misma `organizacion_id`, rol, `activo`,
  contraseña verifica, `trusted_device` = 1 tras dos llamadas → `HUMO_OK`, exit 0.
- `pnpm exec eslint` (2 archivos) → sin problemas. `pnpm run typecheck` → exit 0.
- `pnpm run test:guardias` → `1 failed | 303 passed (304)`: solo `dependencias-declaradas-presentes` (baseline).

**Veredicto T3.1:** fábrica en verde con humo real; queda el login sin OTP en `marca` (lo corre el agente de Playwright).

### T2.2 — Lanzador y configuración de Playwright (D3; R14, R24, R26)

**Archivos:** `e2e/_servidor-app.mjs` (nuevo), `playwright.config.ts`, `e2e/_dos-empresas-fixture.ts`
(solo `LogDelServidor`: comentario, variable y mensaje; sin cambios de firma ni exportaciones),
cabeceras de `e2e/superadmin-arranque.spec.ts` y `e2e/superadmin-empresas.spec.ts`.

**Decisiones:**
- El lanzador **trunca** el log al arrancar: cada corrida tiene su log entero y solo suyo (artefacto
  de R25); `LogDelServidor` mide el tamaño al crearse, dentro de un test con el servidor ya arriba.
- `next` se lanza con `process.execPath` + `next/dist/bin/next` (sin shell ni `.cmd`). Señales
  SIGINT/SIGTERM/SIGHUP y `exit` matan al hijo; en Windows `taskkill /T /F`. Playwright 1.61.1 ya
  hace `taskkill /T` del árbol en Windows y `kill(-pid)` en Linux; `gracefulShutdown: SIGTERM` deja
  que el lanzador vacíe el log en Linux.
- `workers: 1` también en local (superadmin único y crons que recorren todas las empresas);
  `fullyParallel: false`.
- **Desvío de D3 (no lo dice):** el config carga el `.env` del checkout con `process.loadEnvFile` si
  existe (no pisa el entorno). Sin eso los workers no tienen `DATABASE_URL` en local (primera corrida:
  «falta DATABASE_URL»). En CI no hay `.env`.
- `home.spec.ts` fuera de todos los proyectos; `cobro-plataforma-sl40` en `aislamiento`.

**Salida real** (base propia `sl44_t22` en `sl44-pg`, recreada + `migrate deploy` + `db:seed`, porque
`sl44_e2e` la escribía a la vez T3.1 y el paso 1 de `superadmin-empresas` exige el vacío):
- `next build` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, OOM en «Running TypeScript»
  con la máquina cargada) → exit 0.
- `E2E_PUERTO=3044 pnpm exec playwright test --project=plataforma-vacia --reporter=list`:
  corrida 1 `9 passed (15.8s)`, corrida 2 `9 passed (16.9s)`; 0 failed, 0 skipped, 0 flaky.
  Log del servidor con 6 líneas `[email][debug] to=`. 3044 y 54329 libres antes y después.
- Mutación `AUTH_OTP_DEBUG_LOG: ""` en `webServer.env` → `2 failed | 6 did not run | 1 passed`:
  «el log del servidor no recibió ningún código para superadmin-e2e@example.test en 60000 ms».
  Restaurado desde copia, `cmp` idéntico.
- `pnpm exec eslint` (5 archivos) → sin problemas. `tsc --noEmit` → exit 0.
- `pnpm run test:guardias` → `1 failed | 303 passed (304)`: solo `dependencias-declaradas-presentes` (baseline).

**R → test:** R14 → `superadmin-arranque.spec.ts` + la mutación de arriba; R24 → `failOnFlakyTests`
en `playwright.config.ts`; R26 → proyecto `plataforma-vacia` y `dependencies` de `aislamiento`.

**Veredicto T2.2:** `plataforma-vacia` 9/9 dos veces sin levantar nada a mano; mutación en rojo.

## T2.3 — Montaje en `gate.yml` (D6; R20–R23, R25, R28)

**Archivo:** `.github/workflows/gate.yml` (solo este).

- Cabecera: «PR hacia `dev` → gate-completo + e2e».
- El job `e2e` antiguo (solo `base_ref == 'prod'`, `pnpm run test:e2e`, 60 min) se sustituye por:
  - `e2e-grupo`: matriz `grupo: [aislamiento, reparto, dinero]`, `fail-fast: false`,
    `timeout-minutes: 30` (R28), `postgres:17` propio (R21), mismo `if` que `gate-completo` (R20).
    Pasos: checkout, pnpm, Node 24, install frozen, `prisma generate` + `next typegen`;
    credenciales efímeras `SESSION_SECRET` y `CRON_SECRET` con `::add-mask::` antes de
    `$GITHUB_ENV` (R23; `grep -c "secrets\." gate.yml` = 0), `E2E_LOG_SERVIDOR=$RUNNER_TEMP/servidor-e2e.log`;
    «Base del grupo» con `set -euo pipefail` (R21); «Build de la app» con `pnpm exec next build`;
    caché de navegadores igual que antes; `pnpm exec playwright test --project=<grupo>`;
    `if: failure()` → artefacto `e2e-<grupo>` con `test-results/`, `playwright-report/` y el log (R25).
  - `e2e` (agregador): `needs: [e2e-grupo]`, `if: always() && (…)`, rojo con
    «los grupos del E2E (e2e-grupo) salieron '<resultado>'» salvo `success` (R22).

**Validación local:** `actionlint` no está instalado. YAML parseado con `js-yaml@4.3.0` (ya en
node_modules): jobs `estatico,vitest,gate-completo,e2e-grupo,e2e`; matriz, timeout, `if` y pasos
como arriba. Guardias que leen `gate.yml` (`gate-cableado-arnes-v2`, `otp-debug-solo-en-pruebas`,
`analitica-rollup-handler`): 3 files, 37 passed. `node scripts/check-perfil.mjs`: EXIT=0.
Pendiente (lo lanza el leader): `gh workflow run gate.yml --ref feature/SL-44-e2e-verde-ci` y el rojo de R22.

**Veredicto T2.3:** workflow montado y parseado; falta la corrida real de CI.

### T2.3 — Primera corrida en CI (run 40112266371, `workflow_dispatch` sobre `cc461a7` de T2.3)

- `gate-completo` y los 3 shards de vitest: **success**.
- `e2e (aislamiento)`: `15 passed, 20 failed, 6 skipped, 10 did not run` (3,4 min de Playwright). Los
  **9 de `plataforma-vacia` en verde** en CI (superadmin-arranque 1-3, superadmin-empresas 1-6, con el
  OTP leído del log). Los rojos son los specs heredados aún sin reescribir (tanda 4), `waitForURL`.
- `e2e (reparto)`: 10 failed, 6 did not run: specs heredados sin reescribir (tanda 5).
- `e2e (dinero)`: rojo en «Build de la app», `JavaScript heap out of memory` con 4 GB. Arreglo: el
  paso de build lleva `NODE_OPTIONS=--max-old-space-size=8192`.
- `e2e` (agregador): **failure** con `los grupos del E2E (e2e-grupo) salieron 'failure': mira el job
  de cada grupo y su artefacto e2e-<grupo>` → R22 comprobado con un grupo rojo real.

## T3.2 (parcial: reparto, crons, cierre mínimo) + Tanda 5 — agente SL-44-T5

Base propia `sl44_rep` en `sl44-pg`, servidor en 3044, log del servidor fuera del repo. El MCP del
grafo no se usó (Grep/Read).

**Archivos:**
- nuevos: `e2e/_escenarios/reparto.ts`, `e2e/_escenarios/crons.ts`, `e2e/_escenarios/cierres.ts`
  (mínimo: solicitar y aprobar; el grupo `dinero` lo amplía);
- reescritos: `e2e/{asignacion-satelite,recepcion-satelite,mis-asignaciones,devolucion-origen,historial-orden,reintentos-escalado,reprogramacion-liberacion}.spec.ts`;
- `tests/fabricas/e2e.ts`: solo se AÑADE `extra.fulfillment` a `crearUsuarioE2E` (tienda con bodega
  propia: sus órdenes nacen `en_preparacion`);
- `specs/SL-44-e2e-verde-ci/design.md > D4`: la fila de `crons.ts`, con lo medido (abajo).

**API de los escenarios** (detalle en la cabecera de cada archivo):
- `reparto.ts`: `crearEscenarioReparto(etiqueta, {tarifa?, tarifaMensajero?})` (empresa, zona central y
  satélite por `ZonaService` con SINPE confirmado por `SinpeBodegaService`, tienda con `fulfillment`,
  tarifa por `TarifaService`, adminSatelite), `crearMensajero(r, zona)`, `crearOrden(r, {zona,
  montoCobrar?, …})` (`BulkOrdenService.cargarMasiva`), `llevarA(r, orden, destino, {mensajero})`
  (generarGuia → rutear → recibir → asignar/asignarDesdeBodega → recoger, desde el estado ACTUAL),
  `gestionar(r, orden, m, {resultado…})` (escoger + gestionar, evidencia al doble de Storage),
  `corregirFechaReprogramacion`, `estadoDe`, `gestionesDe`, `paginaDe(browser, u, ctx?)`, `hoyCR`/`mananaCR`.
- `crons.ts`: `llamarCron(nombre, {secreto?})`, `correrCron(nombre)` (exige 200),
  `drenarGeocodificacion(ordenIds)` (`procesar-jobs` hasta que la geocodificación falla POR
  CONFIGURACIÓN: sin eso ninguna asignación acepta la orden).
- `cierres.ts`: `solicitarCierre(r, m)`, `aprobarCierre(r, cierreId, {quien?})` (confirmación física =
  las gestiones retornables del cierre con su guía).

**Desvíos de D4 medidos:** la orden no la crea `OrdenService` (ya no tiene `crear`, ver la cabecera de
`lib/actions/ordenes.ts`) sino la carga masiva; `RecepcionBodegaCentralService` no hace falta en estos
flujos (la tienda con bodega propia entra a la central por `generarGuia`). Desde la ficha 454 la
gestión NO mueve la orden: la mueve la APROBACIÓN del cierre, por eso `reparto` necesita `cierres.ts`.
La UI de 276 cambió `reintentos-escalado`: con 2 intentos el panel ya no ofrece «Reprogramar» ni
«Devolver» (el escalado de la tercera devolución de la 47 no existe); el spec afirma esa puerta.

**Excepciones de R8 (D4):** en el grupo `reparto` no queda ninguna. La de la fecha de reprogramación
en el pasado se QUITA: la produce `CorreccionFechaReprogramacionService` (fecha = hoy) con su liberador
por defecto (no-op; la action inyecta el real, que la soltaría en el acto) y la libera el cron real. La
de la fecha de una gestión en el pasado (`corte-diario`) queda para `dinero`. Siguen las de T3.1
(contraseña y dispositivo confiado).

**Salida real:**
- por spec, sobre `sl44_rep`: los 7 en verde con `--project=reparto`.
- Final, `sl44_rep` recién recreada (DROP/CREATE + `migrate deploy` + `db:seed`, `DB_EXIT=0`) y
  `pnpm exec playwright test --project=reparto --reporter=list` dos veces seguidas:
  corrida 1 `15 passed (45.3s)`, corrida 2 `15 passed (47.2s)`; 0 failed, 0 skipped, 0 flaky.

**Mutaciones** (las de código, en UNA toma del lock: mutar → `next build` → corrida → restaurar desde
copia con `cmp OK` y `git diff` vacío → `next build` limpio, `BUILD_LIMPIO=0`):
- `recepcion-satelite`: `recibirPorQr` responde `ok` sin llamar al servicio → rojo en
  `porRecibir…toHaveCount(0)` (Received 2).
- `asignacion-satelite`: `asignarDesdeSatelite` responde `ok` sin asignar → rojo en «Mensajero recogiendo
  en la bodega» de la fila.
- `mis-asignaciones`: el borde de `gestionar` intercambia efectivo↔transferencia → rojo (a) en los pagos
  guardados y (d) en «Totales del día»: `Received "Efectivo₡3.000"`. (Una primera versión, todo a
  efectivo, chocaba con el único `(gestion, metodo)` y no llegaba a los totales: se descartó.)
- `devolucion-origen`: `devolverATienda` responde `ok` sin transicionar → rojo en «Devolviendo a tienda».
- `historial-orden`: `obtenerHistorialOrden` borra el actor de las transiciones → rojo en `Por <mensajero>`.
- `reprogramacion-liberacion`: la ruta `liberar-reprogramadas` no llama al servicio → rojo en
  `liberadas >= 1` (Received 0).
- `reintentos-escalado`: sin rebuild, `REINTENTOS_MIN_INTENTOS=4` en el entorno (umbral 3→4) → rojo en
  la nota del tope del panel.

**Comprobaciones:** `pnpm exec eslint` (10 archivos) sin problemas; `pnpm run typecheck` exit 0;
`tests/baseline-rojos.json` sin cambios. `pnpm run test:guardias` → `2 failed | 302 passed (304)`:
`dependencias-declaradas-presentes` (baseline) y `sinpe-en-toda-superficie`, que señala SOLO
`e2e/_aislamiento-datos.ts` (`sinpeNumero: "…"` literal, del agente de `aislamiento`; el de
`reparto.ts` se corrigió con una constante).

**Defectos de producción:** ninguno encontrado.

**Veredicto:** grupo `reparto` 15/15 dos veces sobre base nueva, cada spec con su mutación en rojo.
