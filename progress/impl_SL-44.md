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
