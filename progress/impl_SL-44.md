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

## Tanda 4 — Plataforma y aislamiento (T4.1–T4.4; agente SL-44-T4, base `sl44_aisl`)

**Archivos.**
- Nuevo: `e2e/_aislamiento-datos.ts`: `crearZonaE2E` (`ZonaService.crear`, con `crearZonaSchema`) y
  `crearOrdenE2E` (`BulkOrdenService.cargarMasiva` de la tienda: orden con guía y su fila de historial).
- `e2e/_dos-empresas-fixture.ts`: fuera `correoDelMaestro`, `liberarCorreos`, `solicitarRecuperacion`,
  `EnvioRegistrado`/`EmisorRegistrado` y sus imports (SMTP, `SL17_HUMO_MAESTRO_*`). Nadie más los usaba;
  lo que importa SL-45 (`altaDeEmpresa`, `clienteDueno`, `prepararAcceso`, `SINPE_DE_PRUEBA`, `Empresa`)
  sigue igual.
- `e2e/_superadmin-fixture.ts`: solo se añade `altaDeEmpresaPorPantalla`, `recuperarContrasena`,
  `AltaPorPantalla` y `AVISO_EMPRESA_CREADA`.
- `e2e/dos-empresas-humo.spec.ts` (T4.1, D16): el superadmin da de alta A y B en `/plataforma/empresas`.
  Cada maestro entra por «¿Olvidaste tu contraseña?» con el OTP del log y luego por `/login` con OTP.
  El primer caso afirma R16 y R17: un maestro por empresa y el código de recuperación leído de
  `[email][debug] to=<maestro>`. Sale la repetición `ya_existe`, que ya cubren `superadmin-empresas` y
  `organizacion-alta.test.ts`.
- `e2e/wallet-iva-aparte-sl39.spec.ts` (T4.2): fuera el `test.skip(SL39_UI)`.
- `e2e/cobro-plataforma-sl40.spec.ts`: fuera el `test.skip(SL40_UI)` y la cita a `SL17_HUMO_LOG_SERVIDOR`.
  El `beforeAll` guarda el valor GLOBAL antes del `deleteMany` y el `afterAll` lo devuelve (`upsert` o
  `deleteMany`). La línea 53 no se toca.
- `e2e/marca.spec.ts`: el `admin` sin empresa se cambia por el `maestro` de `crearEmpresaE2E`. Caso nuevo
  «un usuario de la fábrica entra por /login sin OTP (SL-44 T3.1)», que cierra el «Hecho» pendiente de T3.1.
- `e2e/auth.spec.ts`: reescrito con usuarios de la fábrica.
  - Bloqueo con 5 intentos fallidos por la UI; el 6.º, con la contraseña buena, da «Cuenta bloqueada».
  - Contraseña mala con un usuario que existe.
  - OTP real del log.
  - Los `alert` se buscan dentro de `[data-slot="card"]`, para no casar `#__next-route-announcer__`.
  - Teclado contra la UI de hoy: el foco al cargar y el botón de mostrar la contraseña.
  - Login y logout con un maestro: a un `adminTienda`, `/dashboard` lo redirige a `/ordenes`, y pulsar
    «Salir» en ese paso cruzaba el logout con la redirección y acababa en `/login?redirect=/ordenes`
    (medido 2 veces). Es una carrera del test, no un defecto.
- `e2e/rastreo-publico.spec.ts`: guía y factor de una orden creada por servicio, y guía inexistente
  comprobada en la base. Fuera `E2E_RASTREO_*`.
- `e2e/analitica-roles.spec.ts`: **rehecho contra la pantalla de hoy (desvío de D5, lo tiene que validar
  el leader).**
  - `AnaliticaShell` tiene comentadas las regiones «Filtros», «Tablero operativo» y «Tablero
    financiero», y `page.tsx` la sección de finanzas (decisión humana del 2026-08-18). Lo que el spec
    afirmaba (R6, R7, R10, R11, R14, R15, R17 de la 133) no tiene superficie, y su mutación de cabecera
    (`financiero` a un rol acotado) no se puede ver.
  - Ahora afirma el recorte que sí se pinta. Las secciones «Detalle - Movimiento de las órdenes» y
    «Detalle - Cohorte de carga» salen para todos (anti-vacío). «Detalle - Productos» la ven `maestro` y
    `adminTienda`, y `adminSatelite` no (`ALCANCE_PRODUCTOS`). El caso del `mensajero` (menú y ruta) queda
    igual.
- `zona-especial-dos-empresas.spec.ts` (T4.4): sin tocar.

**Corridas finales** (`E2E_PUERTO=3044 pnpm exec playwright test --project=aislamiento --reporter=list`).
La base es `sl44_aisl`, recreada (DROP + CREATE + `migrate deploy` + `db:seed`).
- Corrida 1: `50 passed (1.8m)` (9 de `plataforma-vacia` y 41 de `aislamiento`); 0 failed, 0 skipped,
  0 flaky.
- Corrida 2, con dependencias: `1 failed | 46 did not run | 3 passed (9.4s)`. Cae
  `superadmin-empresas.spec.ts:180`, «la base ya tiene empresas y el paso 1 exige el estado vacío», y
  `aislamiento` no corre porque depende de ese proyecto.
- Corrida 2b, la misma base con `--no-deps`: `41 passed (1.6m)`. `aislamiento` es re-ejecutable.
- El cobro global queda «sin configurar» tras las dos corridas: el `afterAll` de SL-40 lo devuelve.

**Mutaciones.** Las de código van todas dentro de una sola toma del lock: mutar, `tsc`, build, corrida
de los 6 specs con `--no-deps`, restaurar desde copia con `cmp` IDÉNTICO en los 6 archivos, y build
limpio con BUILD_LIMPIO=0. El script es `scratchpad/sl44/SL-44-T4/mutar.mjs`. La corrida mutada dio
`12 failed | 3 did not run | 20 passed`.
- **Puerta del humo** (`geografia/page.tsx`, `!actor || !esPlataforma(...)` pasa a `!actor`): cae el
  punto 6, «geografía: el maestro no recibe 404» (Expected 404, Received 200).
- **Aislamiento del humo** (dato: la tienda de A lleva un marcador `B-<uuid>`): cae «el maestro de A
  recorre…», con «/analitica, /ordenes, /configuracion…: marcadores de B en una pantalla de A».
  Restaurado con `cmp` IDÉNTICO.
- **auth** (`AuthService`, `passwordValida` siempre `true`): caen «existing user with the wrong
  password» y «N failed attempts… lock» (no aparece el error genérico). En esa corrida también cayó un
  logout por la carrera de arriba, que ya está corregida.
- **rastreo** (el factor errado devuelve `demasiados_intentos`): cae «los dos casos malos muestran el
  mismo texto», con Received «Demasiadas consultas seguidas…».
- **marca** (`Logo.tsx`: el horizontal oscuro se cambia por el claro): caen 5 casos por «logos visibles».
- **analitica** (`ALCANCE_PRODUCTOS.adminSatelite` pasa a `"acotado"`): cae solo el caso de
  `adminSatelite` (Expected 0, Received 1).
- **wallet-iva SL-39** (sin la entrada `iva` de `REGIONES_BOLSILLO_EMPRESA`, la de SL-39): cae «la
  region «IVA cobrado»…» (Expected 1, Received 0).
- **SL-40** (dato: 3 órdenes en vez de 2): cae T7 por los movimientos (+1). Restaurado con `cmp` IDÉNTICO.

**Excepciones de R8** (filas escritas con la empresa fijada):
- Las de `tests/fabricas/e2e.ts` (T3.1): la contraseña del maestro y el `trusted_device`.
- El humo, en `sembrarDatos`: zona, usuarios, orden, caja, cierre, tarifa, API key, webhook y plantilla
  con marcadores. Se queda así: son marcadores para buscar fugas. No se midió si `ApiKeyService` o
  `PlantillaService` servirían.
- SL-39: las filas de caja y los cierres del ejemplo §1.
- SL-40:
  - las órdenes creadas y eliminadas con `fijarEmpresa`, porque lo que se prueba son los triggers que
    cobran por cualquier vía;
  - la tienda y la zona de esas órdenes;
  - el saldo inicial;
  - el borrado y la restauración del cobro global, que no tiene pantalla para «sin configurar».
- `zona-especial`: la zona de su fixture.
- `rastreo-publico`, `analitica-roles`, `auth` y `marca` no tienen ninguna; solo usan el
  `trusted_device` de la fábrica.

**Defectos de producción:** ninguno.

**El conflicto del vacío (R26/R27), sin tapar.** `superadmin-empresas` exige `organizacion.count() == 0`
en su `beforeAll`, afirma «Aún no hay empresas» en el paso 1 y cuenta `== 2` en los pasos 3 y 4. Su
`afterAll` borra solo lo suyo, y `aislamiento` deja 15 empresas por corrida. Por eso la 2.ª corrida de
`--project=aislamiento` sobre la misma base cae en `plataforma-vacia`, y con la dependencia arrastra a
todo `aislamiento`. En CI no pasa, porque cada grupo tiene base nueva. Propuesta mínima, sin
condicionales:
- quitar la exigencia del vacío del `beforeAll` y la aserción del texto vacío del paso 1;
- el estado vacío ya lo cubre `tests/components/empresas-module.test.tsx`;
- contar por los slugs de la corrida en vez de `count() == 2` (filas del listado filtradas por slug);
- con eso, `plataforma-vacia` deja de depender del vacío, y la dependencia de R26 se puede mantener o
  quitar.

Si se quiere conservar el vacío en el E2E, la otra salida es un proyecto de limpieza (`teardown`) que
borre las empresas de `aislamiento`. Es cara por las FK `RESTRICT` de caja y cierres (A1).

**Comandos.**
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint` sobre los 10 archivos: «No issues found».
- `pnpm run test:guardias`: `1 failed | 303 passed (304)`. Solo cae
  `dependencias-declaradas-presentes`, que es del baseline. Un rojo nuevo de
  `sinpe-en-toda-superficie` (`sinpeNumero: "…"` literal en `_aislamiento-datos.ts`) se corrigió usando
  `SINPE_DE_PRUEBA`, y quedó 9/9.

**Veredicto:** `aislamiento` 41/41 en la 1.ª corrida sobre base nueva y en la 2.ª (`--no-deps`). Cada
spec tiene su mutación en rojo. Queda abierto el vacío de `plataforma-vacia` en la 2.ª corrida, con la
propuesta de arriba.

### Segundo aviso de SL-45 (coordinador)

- SL-45 cambia en `e2e/cobro-plataforma-sl40.spec.ts` el literal de la pista y `leerDeuda` (acepta
  la pista de «al día» con deuda 0), toca `e2e/_superadmin-fixture.ts` y `e2e/superadmin-empresas.spec.ts`,
  y añade `e2e/pago-plataforma-sl45.spec.ts`. Llega a `dev` antes que SL-44.
- SL-40 y SL-45 comparten la tarifa global: sus specs van en el **mismo grupo** (`aislamiento`), que
  con `workers: 1` los corre en serie.
- **Plan de integración (F2.3):** en `cobro-plataforma-sl40.spec.ts` se toma la versión de SL-45 y
  encima se le vuelve a quitar el skip `SL40_UI` y la cita a `SL17_HUMO_LOG_SERVIDOR`, y se conserva el
  `afterAll` que restaura el cobro global. `pago-plataforma-sl45.spec.ts` entra en el proyecto
  `aislamiento` y sin skip (la guardia `e2e-sin-saltos` lo exige).

## Tanda 7 (T7.1–T7.3) y el conflicto del vacío — agente SL-44-T7, base `sl44_t7`

**Archivos.**
- `e2e/home.spec.ts`: `git rm` (T7.1).
- `tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: nuevo (T7.2, D7).
- `e2e/superadmin-empresas.spec.ts`: sin exigir ni afirmar el vacío, y el listado comprobado por los slugs de la corrida.
- `playwright.config.ts`: solo el comentario que citaba `home.spec.ts`.
- `specs/SL-31-tests-datos-propios-ci/design.md`: la mención de `home.spec.ts` dice que lo retiró SL-44.
- `docs/verification.md`: la sección `## El E2E` y la línea de CI corregida (T7.3).
- `progress/deudas.md`: D16 y D17 RESUELTAS.
- `specs/SL-44-e2e-verde-ci/design.md`: D3 (el cambio y su motivo, A1), D4 (re-ejecutable) y la fila de D5.
- `specs/SL-44-e2e-verde-ci/tasks.md`: la fila R26 de la trazabilidad, y T7.1 y T7.3 marcadas.

**T7.1.**
- Citas vivas de `home.spec.ts` en `docs/`, `specs/`, `tests/` y `e2e/`: ninguna.
- Quedan solo las de SL-44 (D5 «se retira», T7.1 y la lista de archivos) y la de SL-31, ya anotada.
- `test-citado-desaparecido` y `sin-nombre-heredado`: 29/29 en verde.

**T7.2.** Funciones puras: `hallazgosDeContenido`, `proyectosDelConfig`/`hallazgosDeProyectos` y
`citasDeFlujosCriticos`/`hallazgosDeFlujosCriticos`.
- El config se lee como texto: los `specs("…")` y los `**/x.spec.ts` de cada `testMatch`.
  - Un proyecto sin `testMatch` recoge todos los specs.
  - Un `testMatch` que no se sabe leer es rojo.
- De los flujos críticos solo cuentan los backticks con forma de spec: `e2e/` y `lib/db/` no son citas.
- Fixtures: 23 casos.
  - Un verde.
  - Un rojo por motivo: `fixme`; `skip` condicional, de `describe` y en ejecución; `only` y `describe.serial.only`; `correct-password` (también en un archivo de apoyo); `@example.com`; `SL39_UI`, `SL40_UI`, `SL17_HUMO_` y `E2E_RASTREO_`.
  - Más rojos de proyecto: un spec fuera de proyecto, uno en dos proyectos, un proyecto sin `testMatch`, un `testMatch` ilegible, un config sin proyectos y un proyecto que nombra un spec inexistente.
  - Más rojos de flujos críticos: un flujo crítico sin archivo, con y sin `*`; un `*` que no casa con un trozo; la sección sin citas.
- Árbol real:
  - 1.ª corrida, a las 14:42: ROJA solo por `e2e/mi-wallet.spec.ts:52,53,56,57` y `e2e/wallet-mensajeros.spec.ts:61,62,65,66` (`@example.com` y `correct-password`). Son de dinero y no los toqué.
  - Corrida final: `24 passed (24)`, con los specs de dinero ya cambiados por sus agentes.
  - El caso del árbol afirma su tamaño: ≥ 20 specs, los 4 proyectos por nombre y ≥ 10 citas de flujos críticos.

**El conflicto del vacío (A1).**
- El estado vacío lo cubre `tests/components/empresas-module.test.tsx` («sin empresas pinta el estado vacío y no la tabla»: el texto y la ausencia de la tabla).
- Mutación bajo el lock: `empresas.length === 0` pasa a `< 0` en `EmpresasModule.tsx`.
  - Sin mutar, `24 passed`.
  - Mutado, `1 failed | 23 passed`; cae solo ese caso.
  - Restaurado desde copia, con `cmp` IDÉNTICO.
- Cambios en el E2E:
  - fuera la exigencia `organizacion.count() == 0` del `beforeAll`;
  - el paso 1 afirma el título, el formulario y que no hay aviso;
  - los `toHaveCount(2)` y los `count() == 2` pasan a `soloExistenAyB`: de los slugs que mandó la corrida, el listado y la base tienen A y B (una fila cada una), y nada más;
  - `afterAll` sin borrado;
  - cabecera reescrita.
- Sin condicionales.
- Mutación en el dato: el paso 2 da de alta una tercera empresa «X» de la corrida.
  - Cae el paso 2 en `soloExistenAyB` (`Expected 0, Received 1`): `1 failed | 4 did not run | 1 passed`.
  - Restaurado desde copia, con `cmp` IDÉNTICO.

**Corridas** (`E2E_PUERTO=3044 … --reporter=list`; los puertos 3044 y 54329, libres antes y después).
- `sl44_t7` recreada (DROP_CREATE=0, MIGRATE=0, SEED=0); `--project=plataforma-vacia`: `9 passed (16.6s)`, PW_EXIT=0.
- `--project=aislamiento`, 1.ª, misma base: `50 passed (1.8m)`, PW_EXIT=0.
- `--project=aislamiento`, 2.ª, misma base, con dependencias: `50 passed (1.8m)`, PW_EXIT=0.
- Las dos: 0 failed, 0 skipped, 0 flaky. La base quedó con 39 empresas.

**T7.3.**
- `docs/verification.md > El E2E` cubre:
  - CI en cada PR a `dev` y a `prod`, y `workflow_dispatch`;
  - los tres grupos con base propia;
  - el OTP, de la línea de debug de `E2E_LOG_SERVIDOR`. `AUTH_OTP_DEBUG_LOG=1` solo en Playwright y en CI, y nunca con `VERCEL_ENV=production`;
  - el doble `e2e/_storage-falso/servidor.mjs`;
  - local: `E2E_PUERTO`, base desechable y dos corridas.
- `docs/gate.md` y `docs/checkpoints-proyecto.md`, sin tocar.
- D19 (`SL40_UI`) también queda resuelta por SL-44 (T4), pero no la marqué: no estaba en el encargo.

**Comandos.**
- `pnpm exec eslint` sobre los 3 archivos de código: exit 0.
- `pnpm run typecheck`: exit 0.
- `pnpm run test:guardias`: `1 failed | 304 passed (305)`. Solo cae `dependencias-declaradas-presentes`, la del baseline.

**Defectos de producción:** ninguno. **Excepciones de R8 nuevas:** ninguna.

**Veredicto:** T7.1–T7.3 hechas. `aislamiento` sale verde dos veces seguidas sobre la misma base, y el vacío lo cubre el test de componente con su mutación.

## T6.3 — `wallet`, `mi-wallet`, `wallet-mensajeros` (agente SL-44-T6b)

Base propia `sl44_din2` en `sl44-pg`, servidor en 3044, logs fuera del repo (`scratchpad/sl44/SL-44-T6b/`).
El MCP del grafo no se usó (Grep/Read).

**Archivos:** nuevo `e2e/_escenarios/caja.ts`; reescritos `e2e/wallet.spec.ts`, `e2e/mi-wallet.spec.ts`,
`e2e/wallet-mensajeros.spec.ts`. Sin tocar `cierres.ts`, `reparto.ts`, `crons.ts`, `lib/` ni `app/`.

**API de `caja.ts`:**
- `crearEscenarioCaja(etiqueta) → { r, mensajero, conCod, sinCod, cierreId }`: `crearEscenarioReparto` con
  `TARIFA_CAJA` (flete 2.000 en las cuatro columnas, sin comisión ni IVA) y `PAGO_MENSAJERO_CAJA` (1.500 por
  entrega); un mensajero de la central; dos órdenes llevadas a `en_reparto` y entregadas por
  `MisAsignacionesService` (`conCod`: 8.000 = 1.000 efectivo + 7.000 transferencia; `sinCod`: sin cobro);
  `solicitarCierre` + `aprobarCierre` (maestro). Comprueba que las órdenes salieron de `en_reparto`.
- `importe(n) → RegExp`: el entero `n` como lo pinta la pantalla, tolerante a separadores y a `,00`.
- `movimientosCajaDe(r)`: lectura de `wallet_movimiento` de la empresa (el spec de `wallet` comprueba la fila
  manual).

**Cifras, escritas a mano en la cabecera de cada spec:** caja: libro flete 4.000 / contra-entrega 8.000 / pago
al mensajero 3.000 (3 movimientos); «Entró» 8.000 (el flete es un cargo a la tienda, no efectivo: ficha 459),
«Salió» 3.000, flujo 5.000, ganancia 1.000, a las tiendas 4.000; tras la corrección manual de 500: «Salió»
3.500, flujo 4.500, 4 movimientos. Tienda: a favor 8.000, cargos 4.000, ya pagado 0, saldo 4.000. Mensajero:
devengado 3.000, pagado mín(3.000, 1.000) = 1.000, cuenta por pagar 2.000. La deuda con la plataforma (SL-40)
no entra en la caja (D10 de SL-40) y no se afirma.

**Qué recorre cada spec:** `wallet`: cifras + libro + desglose del flete (las dos órdenes); filtro
«Entra/Sale» = «Sale» (1 fila, cifras quietas) y «Limpiar todo»; «Corrección de caja (resta)» sin motivo →
alerta «La descripción es obligatoria.» y ninguna fila manual en la base; con motivo → aviso de éxito,
cifras releídas y `egreso_ajuste` 500 en la base; mensajero y tienda → 404 sin cifras ni libro.
`mi-wallet`: resumen, tarjeta «Saldo actual», dos filas y desglose del flete; filtro «Tipo de movimiento»
(«Pagos» → 0 filas del cierre, «Cierres» → 2); mensajero y maestro → 404. `wallet-mensajeros`: fila con
devengado/pagado/cuenta/«Pendiente», buscador (sin coincidencia → fuera, su nombre → vuelve); estado de cuenta
(saldo, frase, devengo y pago, desglose del devengo con las dos órdenes); mensajero y tienda → 404 en la lista
y en el estado de cuenta.

**Salida real:**
- por spec sobre `sl44_din2` (`--project=dinero --reporter=list`): `mi-wallet` 3 passed, `wallet-mensajeros`
  3 passed (primera corrida); `wallet` 4 passed tras corregir el texto de la alerta (la primera esperaba «El
  motivo es obligatorio.»; la pantalla dice «La descripción es obligatoria.»).
- Final: `sl44_din2` recién recreada (DROP/CREATE + `migrate deploy` + `db:seed`, `DB_EXIT=0`) y los tres
  juntos dos veces seguidas: corrida 1 `10 passed (28.2s)`, corrida 2 `10 passed (29.1s)`; 0 failed, 0
  skipped, 0 flaky. 3044 y 54329 libres al terminar.

**Mutaciones** (UNA toma del lock: mutar → `next build` (`BUILD_MUT=0`) → los tres specs → restaurar desde
copia, `cmp OK` ×3 y `git diff --stat` vacío → `next build` limpio, `BUILD_LIMPIO=0`). Cada una en un cálculo
que solo afirma su spec, y cada spec cae en SU aserción:
- `wallet`: `LIQUIDEZ_POR_CATEGORIA.ingreso_flete` de `cargo_a_tienda` a `efectivo` (`lib/utils/caja-tesoreria.ts`)
  → rojo en el flujo: `Received "…₡9.000…"`, esperado 5.000.
- `mi-wallet`: `CUBETA_POR_CATEGORIA.flete` de `cargos` a `pagado` (`lib/utils/desglose-tienda.ts`) → rojo en
  «Cargos de la empresa»: `Received "…₡0…"`, esperado 4.000.
- `wallet-mensajeros`: `calcularSplitPago` con `pagado = P` (sin el mínimo con el efectivo,
  `lib/utils/cuenta-por-pagar.ts`) → rojo en la columna «Pagado»: `Received "₡3.000"`, esperado 1.000.

**Comprobaciones:** `pnpm exec eslint` (4 archivos) sin problemas; `pnpm run typecheck` exit 0;
`pnpm run test:guardias` → `1 failed | 304 passed (305)`, solo `dependencias-declaradas-presentes` (baseline).
Sin `skip`/`fixme`/`only`, sin `@example.com`, `correct-password` ni variables `E2E_RASTREO_*`/`SL17_HUMO_*`/`SL39_UI`.

**Excepciones de R8:** ninguna nueva (todo movimiento nace de aprobar el cierre o de la pantalla). Siguen las
de T3.1 (contraseña y dispositivo confiado). La de la fecha de gestión en el pasado no se usa aquí.

**Defectos de producción:** ninguno.

**Veredicto T6.3:** los tres specs 10/10 dos veces sobre base nueva, cada uno con su mutación en rojo.

## T6.1 + T6.2 — dinero: cierres del día, de bodega y bloqueos (agente SL-44-T6a)

Base propia `sl44_din1` en `sl44-pg`, servidor en 3044, log y trazas fuera del repo. MCP del grafo no usado (Grep/Read).

**Archivos:**
- reescritos: `e2e/{cierre-dia,cierres-admin,cierres-admin-rechazos-sla,cierre-bodega-satelite,cierre-vencido-modelo,reglas-bloqueos-cierre}.spec.ts`;
- `e2e/_escenarios/cierres.ts`: solo se AÑADE (firmas previas intactas) `rechazarCierre(r, cierreId, motivo, {quien?})`,
  `cierresDe(m)` (lectura), `anclarDevolucionHaceDias(r, orden, dias)` (excepción de R8, abajo) e `importe(n, {solo?})`
  (RegExp tolerante al símbolo/separadores; `solo` la ancla al texto entero del elemento);
- `e2e/_escenarios/crons.ts`: solo una línea de comentario (la excepción de la gestión se quita);
- producción (defectos, abajo): `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`, `CierresBodegaAdminModule.tsx`;
- tests nuevos: `tests/components/ConsolidacionBodegaRefresco.test.tsx`, `tests/components/CierresBodegaAdminRefresco.test.tsx`;
- `specs/SL-44-e2e-verde-ci/design.md > D4`: fila de `crons.ts` (gestión: se quita) y fila nueva de `anclarDevolucionHaceDias`.

**Contra la UI actual (R18), desvíos de la cabecera vieja:**
- `cierre-bodega-satelite`: desde la ficha 431 la central ya no aprueba/rechaza una consolidación; la «Marca recibido» por
  lo contado y la «Desmarca». El spec recorre solicitar (adminSatelite) → marcar recibido con evidencia y totales (maestro)
  → desmarcar.
- `reglas-bloqueos-cierre`: desde 241/271/431 la bodega satélite ya no se congela entera (`bloqueada` es constante `false`):
  avisa «Tienes 1 cierre abierto de tus mensajeros.» y el selector deshabilita al mensajero bloqueado
  («… (tiene cierres sin resolver)»). El spec afirma esa puerta y que el aviso de bloqueo total no sale.
- `cierres-admin`: la aprobación de un cierre con paquetes que vuelven pasa por la confirmación física de la guía (238).

**Excepciones de R8:**
- se QUITA la de la fecha de la gestión en el pasado: `corte-diario` toma toda gestión sin cierre sin mirar su fecha, así
  que el `vencido` sale del cron real con la gestión de hoy (`cierre-vencido-modelo`, `reglas-bloqueos-cierre`);
- NUEVA, `anclarDevolucionHaceDias` (`cierres-admin-rechazos-sla`): mueve 6 días atrás SOLO el `created_at` de la fila
  `anclaje_devolucion` de una orden en `novedad` (la escribe la aprobación del cierre). Sin reloj falso el plazo de 5 días
  de una `wrong_*` no vence, ningún servicio lo fija, y la vía del tope de intentos está cerrada (con el tope la `novedad` ya
  no se admite, 276). Gestión, aprobación y escalado: servicio y cron reales (`procesar-devueltas-sla`).

**Cifras (a mano, de lo que crea cada spec):** cierre-dia 8.000 efectivo + 3.000 SINPE = 11.000, ganancia 2 × 1.700; deshacer
7.000 → 2.000. cierres-admin 6.000 / 2.500. rechazos-sla automático 900, manual 2 × 900 = 1.800, total 2.700. bodega 9.000.
vencido 4.000; reglas 3.000.

**Defectos de producción encontrados y ARREGLADOS** (≤ 30 líneas, sin migración, mismo patrón ya aplicado en
`CierreDiaModule`/`CierresAdminModule` el 2026-08-19):
1. `ConsolidacionBodegaModule.confirmarSolicitud` solo hacía `router.refresh()`: las listas «A consolidar» y «Solicitados»
   (`useSWR` con `fallbackData`) no se releían; tras «Cierre de bodega solicitado correctamente.» la pestaña «Solicitados»
   decía «Aún no has solicitado ningún cierre de bodega.». Arreglo: `mutate` de `cierre-bodega:consolidables` y
   `cierres-bodega:solicitados`. Test: `ConsolidacionBodegaRefresco.test.tsx` (1 passed); mutación (sin el `mutate`) →
   `AssertionError: expected 1 to be greater than 1`; restaurado de copia, `cmp` OK.
2. `CierresBodegaAdminModule.refrescarListas` revalidaba solo la cola: la consolidación marcada no entraba en «Resueltos».
   Arreglo: también `cierres-bodega:resueltos`. Test: `CierresBodegaAdminRefresco.test.tsx` (1 passed); mutación (sin esa
   clave) → `expected 1 to be greater than 1`; restaurado, `cmp` OK.
   `vitest related` de los dos módulos: 13 archivos, 192 passed.

**Salida real:**
- por spec, en verde con `--project=dinero` (corridas `cd1`, `r2`, `r4`, `b5` en la bitácora del agente);
- final, `sl44_din1` recién recreada (`DROP_CREATE=0`, `MIGRATE=0`, `SEED=0`) y los 6 specs juntos dos veces seguidas:
  corrida 1 `18 passed (1.0m)`, corrida 2 `18 passed (42.8s)`; 0 failed, 0 skipped, 0 flaky. 3044 y 54329 libres antes y después.

**Mutaciones** (las de servidor en UNA toma del lock: mutar → `tsc` → `next build` → corrida → restaurar desde copia con
`cmp OK` → `next build` limpio, `BUILD_LIMPIO=0`; `git diff -- lib` vacío al final):
- `cierre-dia`: `listarCierreDia` calcula los totales sin la primera gestión → rojo `SINPE₡0` (esperado 3.000) en (a) y
  `Efectivo₡5.000` (esperado 7.000) en (b).
- `cierre-vencido-modelo`: la re-solicitud del `vencido` responde ok sin `transicionarASolicitado` → rojo en el paso 3 (el
  aviso de bloqueo sigue: `Received: 1`).
- `reglas-bloqueos-cierre`: `findMensajerosBloqueadosPorCierres` no marca a nadie → rojo en el paso 3 (la opción
  «… (tiene cierres sin resolver)» no existe). Una primera mutación en `existeBodegaSateliteBloqueada.mensajerosBloqueadosIds`
  SOBREVIVIÓ (el selector no lee ese campo, lee `listarMensajerosSatelite.bloqueadosIds`): se descartó y se mutó la puerta real.
- `cierre-bodega-satelite`: `solicitarCierreBodega` suma el snapshot sin el primer consolidable → rojo en el paso 1 (no
  aparece el total 9.000 en «Solicitados»).
- `cierres-admin-rechazos-sla`: el desglose SLA/manual intercambiado → rojo `Automático … ₡1.800` (esperado 900).
- `cierres-admin` (sin build: el snapshot lo congela el worker): `computeTotales` suma el efectivo como SINPE → rojo
  `Efectivo₡0` (esperado 6.000).
- Un primer intento del lote de servidor no compiló (`resolicitable` posiblemente null en la mutación del vencido): `next
  build` rojo, Playwright sin build; restaurado con `cmp OK` y build limpio en la misma toma; se repitió con la mutación corregida.

**Comprobaciones:** `pnpm exec eslint` (9 archivos) sin problemas; `pnpm run typecheck` exit 0; `pnpm run test:guardias` →
`1 failed | 304 passed (305)`, solo `dependencias-declaradas-presentes` (baseline).

**R → test:** R7/R8/R10/R18 → los 6 specs de arriba (con las excepciones de R8 anotadas en D4).

**Veredicto T6.1+T6.2:** los 6 specs 18/18 dos veces sobre base nueva, cada uno con su mutación en rojo, y dos defectos de
refresco de la pantalla de cierres de bodega arreglados con su test.

### Gate tras las tandas 4–7 (con el arreglo A2 de cierres de bodega)

`TEST_RAPIDO_BASE=origin/dev ./init.sh` → `init OK`, **INIT_EXIT=0** (log fuera del repo,
`scratchpad/sl44-gate-2.log`). D19 marcada resuelta en `progress/deudas.md`.

## T7.4 — Verde de verdad (en curso)

### CI, run 40132245831 (`workflow_dispatch` sobre `e015cdd`)

| Job | Resultado | Duración del job | Playwright |
|---|---|---|---|
| `e2e (reparto)` | success | 3,1 min | `15 passed (35.4s)` |
| `e2e (dinero)` | success | 3,0 min | `28 passed (50.3s)` |
| `e2e (aislamiento)` | **failure** | 4,8 min | `49 passed, 1 failed (2.5m)`: `marca.spec.ts:277` (`waitForLoadState("networkidle")`, timeout 30 s) |
| `e2e` (agregador) | failure (por aislamiento) | — | — |
| `gate-completo` | success | — | — |

Los tres grupos quedan muy por debajo de los 30 min (R28) y de la estimación de D8.

### Local, base nueva `sl44_t74` (DROP + CREATE + `migrate deploy` + `db:seed`, `next build` limpio)

`E2E_PUERTO=3044 pnpm run test:e2e -- --reporter=list`, dos veces seguidas:
- corrida 1: `92 passed, 1 failed (3.8m)`;
- corrida 2: `92 passed, 1 failed (4.0m)`.
El único rojo, en las dos y en CI, es el mismo `marca.spec.ts:277`. Se diagnostica aparte.

### Estado al entregar el informe

- Pendiente: el rojo de `marca.spec.ts:277` (`networkidle` en la landing a 1280 px). Un agente lo
  diagnostica (scratchpad `sl44/SL-44-marca/`, base `sl44_marca`): ¿carga continua legítima o bucle de
  peticiones (defecto de producción)? Sin su resultado, T7.4 sigue abierta.
- Pendiente: decisión humana sobre `superadmin-empresas` sin exigencia de base vacía (A1), y validar
  el nuevo alcance de `analitica-roles` (regiones financieras comentadas en `AnaliticaShell`).
