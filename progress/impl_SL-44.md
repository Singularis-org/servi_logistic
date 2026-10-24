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
