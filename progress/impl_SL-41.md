# SL-41 «Plantillas de correo y bienvenida del maestro» — bitácora de implementación

Spec: `specs/SL-41-plantillas-correo-bienvenida/` (`7be57e8`, R1–R37), aprobado por Carlos el
2026-10-23. Sus respuestas P1–P4 están en la cabecera de `tasks.md`; añaden R38–R40
(`requirements.md > Decisiones de la aprobación`) y `design.md > 16`.

## Entorno

- Worktree `.worktrees/SL-41-plantillas-correo-bienvenida`, rama `feature/SL-41-plantillas-correo-bienvenida`.
  Base: `dc95473` (`origin/dev`). `node_modules` es un junction al del checkout principal.
- `prisma generate`, typecheck, vitest y el gate corren dentro del lock compartido
  (`scratchpad/gate.lock`), cediendo prioridad a SL-39 y SL-40.
- Base desechable `sl41_base` (Postgres local), con `prisma migrate deploy`. La base
  `servi-logistic` no se toca.
- Migración nueva: `20261023140000_usuario_contrasena_definida_at`, posterior a las de SL-40
  (`20261023130000…`). Aplicada, revertida con `down.sql` y reaplicada en `sl41_base`;
  `migrate diff` da vacío.

## Estado de las tareas

- **Todas cerradas (T0–T15)** el 2026-10-24. Detalle de la última sesión al final, en
  «Sesión 2026-10-24».
- **T1 aprobada por Carlos Restrepo el 2026-10-24**, con un cambio: el logo va incrustado como
  adjunto CID (antes, `src` absoluto a `{baseUrl}/brand/…`).
- **Para T19 de SL-32 (P2):** el correo real de bienvenida se comprueba en cada entorno con Brevo,
  `SMTP_FROM` y `NEXT_PUBLIC_APP_URL` puestos. En producción, `NEXT_PUBLIC_APP_URL=https://servilogistic.co`.

## Mapa R → test

| R | Test |
|---|---|
| R1, R5, R6 | `tests/unit/services/email/plantilla-marca.test.ts` |
| R2, R3, R4 | `tests/unit/services/email/plantilla-marca.test.ts` (estructura, paleta, sin amarillo como texto, sin la marca anterior, cabecera de texto) |
| R7, R11, R35 | `tests/unit/services/email/correos-sin-secretos.test.ts` |
| R8, R10, R11 | `tests/unit/services/email-notificacion.test.ts` (literales nuevos, regex del fixture E2E) |
| R9 | `tests/unit/services/otp-challenge-issuer.test.ts` |
| R12, R23, R24, R27, R28 | `tests/unit/actions/organizaciones-action.test.ts`, `tests/unit/actions/organizaciones-action.composition-root.test.ts` |
| R13, R14 | `tests/unit/services/email/bienvenida-maestro.test.ts` |
| R15, R17, R18, R19, R22 | `tests/unit/password-reset-enlace.test.ts`; borde: `tests/unit/password-reset-enlace-action.test.ts` |
| R16, R23 (servicio), R24, R34, R40 | `tests/unit/services/bienvenida-maestro-service.test.ts` |
| R20, R22 | `tests/integration/db/enlace-bienvenida.test.ts` (Postgres real) |
| R18, R19 (UI), R21 | `tests/integration/recuperar-contrasena-enlace.test.tsx` |
| R25, R26, R29 | `tests/components/empresas-module.test.tsx` |
| R31 | `tests/components/reenviar-bienvenida-boton.test.tsx` |
| R30, R32, R33 | `tests/unit/actions/reenviar-bienvenida-action.test.ts`, `tests/integration/db/bienvenida-maestro-repository.test.ts` |
| R34 | también `tests/unit/password-reset-enlace.test.ts` (espía `console.*`) |
| R36, R37 | `tests/unit/config/email-config.test.ts` |
| R38 | `tests/integration/db/bienvenida-maestro-repository.test.ts`, `tests/integration/db/user-repository-contrasena-definida.test.ts`, `tests/unit/actions/reenviar-bienvenida-action.test.ts`, `tests/components/empresas-module.test.tsx`, `tests/integration/empresas-page.test.tsx` |
| R39 | `tests/unit/services/email/plantilla-marca.test.ts`, `tests/unit/config/email-config.test.ts` |
| R2 (logo CID) | `tests/unit/services/email/plantilla-marca.test.ts` (`cid:` en la cabecera, adjunto PNG con ese cid), `tests/unit/services/email/logo-correo.test.ts` (bytes = `public/brand/logo-correo.png`), `tests/unit/services/nodemailer-email-sender.test.ts` (adjunto `inline` con `cid`) |
| E2E | `e2e/superadmin-empresas.spec.ts`: 7 passed el 2026-10-24 |

## Detalle por parte

Archivos, mutaciones (todas vistas en rojo y restauradas) y salida real de cada subagente.

### SL-41 — notas de backend_dev parte A (plantillas, config, maqueta)

Worktree: `R:/job/singularis/projects/servi_logistic/.worktrees/SL-41-plantillas-correo-bienvenida`
(rama `feature/SL-41-plantillas-correo-bienvenida`). No he commiteado nada: todo está en el árbol.
MCP del grafo: no lo usé; trabajé con Grep/Read.

#### T0 — premisas (base `git merge-base HEAD origin/dev` = `dc954731e9a04ebc37c10ea9d7434bc6b04c4f85`)

| Premisa | Estado |
|---|---|
| `plantillaOtpCodigo` en `lib/services/email/plantillas/otp-codigo.ts:23`, usada solo por `EmailProvider.ts:20` | CONFIRMADA |
| `PasswordResetService` en `lib/services/PasswordResetService.ts`, `solicitar` → `otpIssuer.emitir` (l. 54) | CONFIRMADA |
| `EmailOtpChallengeRepository` + interfaz en `lib/repositories/` y `lib/interfaces/repositories/` | CONFIRMADA (B ya añadió `consumirSiActivo`) |
| `altaEmpresaAction` en `lib/actions/organizaciones.ts:33` | CONFIRMADA |
| `EXCEPCIONES_DE_PLATAFORMA` (`lib/db/excepciones-aislamiento.ts:78`) con `lib/actions/password-reset.ts` (l. 105) y `lib/actions/organizaciones.ts` (l. 155) | CONFIRMADA |
| Censo de `contrasena-maqueta-unica`: 4 archivos (1, 1, 2, 2); `RecuperarContrasenaForm.tsx` con 2 | CONFIRMADA |
| `PUBLIC_ROUTES` de `middleware.ts:11` con `/recuperar-contrasena`, firmada en `rastreo-sin-ruta-nueva.guardia.test.ts:54-57` | CONFIRMADA |
| Login (`AuthService.ts:132`) y recuperación (`PasswordResetService.ts:54`) usan el mismo `OtpChallengeIssuer.emitir` | CONFIRMADA |
| Regex de `e2e/_superadmin-fixture.ts:89`: `cuerpo="[^"]*?\\n(\d{6})\\n` sobre el JSON del texto | CONFIRMADA. Ojo: un `"` ASCII antes del código la rompería (JSON lo escapa como `\"`); los textos nuevos no tienen comillas ASCII |
| PNG `public/brand/logo-horizontal-fondo-claro.png` | EXISTE, 1466 × 428 px |
| `emailConfig()` del diseño §16.3 | REFUTADA: no existe; hay `loadEmailConfig()`, y lanza sin SMTP. Ver decisión D1 |

#### Archivos

Creados:
- `lib/config/app-url.ts`: `baseUrlDeLaApp()`
- `lib/services/email/plantillas/plantilla-marca.ts`: `componerCorreo`, `escaparHtml`, tipos `Bloque` y `CorreoDeMarca`
- `lib/services/email/plantillas/bienvenida-maestro.ts`: `plantillaBienvenidaMaestro`, `BienvenidaMaestroParams`
- `tests/unit/config/app-url.test.ts`
- `tests/unit/services/email/plantilla-marca.test.ts`
- `tests/unit/services/email/bienvenida-maestro.test.ts`
- `tests/unit/services/email/correos-sin-secretos.test.ts`
- `specs/SL-41-plantillas-correo-bienvenida/maqueta/{otp.html,bienvenida.html,bienvenida-sin-url.html,README.md}`

Modificados:
- `lib/config/email.ts`: host de Brevo, comentarios sin Gmail/Google, `emailContacto()`
- `lib/config/whatsapp-envios.ts`: `baseUrlEnlace()` delega en `baseUrlDeLaApp()`
- `lib/services/email/plantillas/otp-codigo.ts`: reescrito sobre `componerCorreo`, con la misma firma
- `.env.example`: sección de correo de Brevo, `AUTH_BIENVENIDA_TTL_HORAS=`, `EMAIL_CONTACTO=`, y `NEXT_PUBLIC_APP_URL` citada como necesaria
- `tests/unit/config/email-config.test.ts`: R36, R37 y R39; renombrados los tests que hablaban de Google
- `tests/unit/services/nodemailer-email-sender.test.ts`: el test de Google pasa a ser de Brevo, con host `smtp-relay.brevo.com`
- `tests/unit/services/email-notificacion.test.ts`:
  - literales nuevos de R8, R10 y R11 (l. 55-56 y 143 del original);
  - test de la regex E2E;
  - `crearEmailSender` sin «Google»
- `tests/unit/services/otp-challenge-issuer.test.ts`:
  - test R9;
  - `consumirSiActivo: vi.fn()` en los 3 dobles que ya había, porque la interfaz que amplió B los dejaba sin tipar
- `tests/unit/guards/html-lang.guardia.test.ts`: el censo pasa de 4 a 5 documentos y añade `plantilla-marca.ts`. **El reviewer tiene que validar esto**: la guardia se puso roja como debía, y la plantilla declara `lang="es"`

#### Mapa R → test (lo mío)

| R | Test |
|---|---|
| R1 | `plantilla-marca.test.ts > componerCorreo — mensaje (R1)`; `correos-sin-secretos.test.ts > se capturaron los tres correos`: los tres salen con HTML de la plantilla |
| R2 | `plantilla-marca.test.ts > estructura del HTML (R2)`: orden, logo, franja, pie, tablas y 600 px. La maqueta está **pendiente de aprobación** (T1) |
| R3 | `plantilla-marca.test.ts > colores (R3)`: paleta y mezcla, nada de amarillo como texto, nada de la marca anterior, contraste ≥ 4.5 y blanco solo en el botón |
| R4 | `plantilla-marca.test.ts > sin URL base (R4)`; `email-notificacion.test.ts > R4 — sin URL base el OTP sale igual…` |
| R5 | `plantilla-marca.test.ts > texto plano (R5)` |
| R6 | `plantilla-marca.test.ts > escapado (R6)`; `bienvenida-maestro.test.ts > escapa el nombre, la empresa y el email…` |
| R7 | `correos-sin-secretos.test.ts > R7` |
| R8 | `email-notificacion.test.ts > plantillaOtpCodigo en la plantilla común (SL-41)`: R8 asunto, texto, HTML y contacto |
| R9 | `otp-challenge-issuer.test.ts > OtpChallengeIssuer (SL-41 R9)` |
| R10 | `email-notificacion.test.ts > R8, R10 — …`; `… > SL-41 — el patrón del fixture E2E encuentra el código…` |
| R11 | `email-notificacion.test.ts > R11 — …`; `correos-sin-secretos.test.ts > R11 (x2)` |
| R13 | `bienvenida-maestro.test.ts > plantillaBienvenidaMaestro (R13)` |
| R14 | `bienvenida-maestro.test.ts > plantillaBienvenidaMaestro (R14)` |
| R35 | `correos-sin-secretos.test.ts > R35 (x2)`: la clave SMTP del entorno, el passwordHash, el code_hash y cualquier bcrypt |
| R36 | `email-config.test.ts > SL-41 R36 — sin SMTP_HOST asume el relay de Brevo…` |
| R37 | `email-config.test.ts > los textos del correo describen Brevo`: email.ts y la sección de `.env.example` sin gmail, google, «contraseña de aplicación» ni apppasswords; nombran Brevo y las variables nuevas |
| R39 | `email-config.test.ts > emailContacto` (5 casos); `plantilla-marca.test.ts > contacto en el pie (R39)`; `email-notificacion.test.ts > R8 — con EMAIL_CONTACTO…` |
| §8 | `app-url.test.ts`: las dos variables, solo SITE, APP vacía, ninguna, barra final y `baseUrlEnlace` igual. `informe-aviso-interno.test.ts` sigue verde |

#### Mutaciones

Script de un solo uso: `scratchpad/sl41/mutar.mjs`. Por cada mutación aplica el cambio, corre los
tests, restaura y compara el archivo byte a byte con el original (`restaurado=true` en todas).
Salida cruda en `scratchpad/sl41/mutaciones.log`. Todas dieron exit=1 con los tests nombrados.

| # | Archivo mutado | Cambio | Test que cae | Resultado |
|---|---|---|---|---|
| M1 | `lib/config/app-url.ts` | sin quitar la barra final | app-url › quita la barra final, también si hay varias | muere |
| M2 | `lib/config/email.ts` | host `smtp.gmail.com` | R36 Brevo/587/STARTTLS; email.ts no menciona «gmail» | muere |
| M3 | `lib/config/email.ts` | `emailContacto` sin `z.email()` | es null si el valor no es un email | muere |
| M4 | `NodemailerEmailSender.ts` | host fijo | autentica en el relay de Brevo con el login y la clave SMTP | muere |
| M5 | `plantilla-marca.ts` | tinta secundaria `#777777` | 5 tests: paleta (x2), contraste ≥ 4.5, nota, pie con mailto | muere |
| M6 | `plantilla-marca.ts` | `escaparHtml` no escapa `'` | 3 tests de escapado (R6) | muere |
| M7 | `plantilla-marca.ts` | `baseUrl === undefined` (logo aunque sea null) | R4 de la plantilla; R4 del OTP | muere |
| M8 | `plantilla-marca.ts` | texto plano sin la línea de contacto | R39 pie; R8 con EMAIL_CONTACTO | muere |
| M9 | `plantilla-marca.ts` | bloques separados por `\n` y no por `\n\n` | R5 orden y líneas en blanco; R8/R10 literal del OTP | muere |
| M11 | `plantilla-marca.ts` | franja con `color:` en vez de `background-color:` | franja de 4 px; el amarillo nunca es texto; contraste | muere |
| M12 | `otp-codigo.ts` | asunto sin tildes | R8 asunto; SL-32 m4 asunto; R9 login y recuperación | muere |
| M13 | `otp-codigo.ts` | código dentro de un párrafo (`Código: 045912`) | R8/R10 texto; R8 HTML; SL-32 m4 línea debug; **regex E2E** | muere |
| M14 | `bienvenida-maestro.ts` | sin el botón | R13 texto plano; R13 botón y URL visible | muere |
| M15 | `bienvenida-maestro.ts` | asunto con la URL | correos-sin-secretos › R11 | muere |
| M16 | `bienvenida-maestro.ts` | «72» literal | las horas salen del parámetro | muere |
| M17 | `plantilla-marca.ts` | pie con `process.env.SMTP_PASSWORD` | correos-sin-secretos › R35 contraseña SMTP | muere |
| M18 | `plantilla-marca.ts` | `lang="en"` | html-lang › los cinco documentos completos y su censo | muere |
| M21 | `plantilla-marca.ts` | párrafo sin escapar | escapa nombre/empresa/email (bienvenida); escapa párrafos (plantilla) | muere |
| M22 | `plantilla-marca.ts` | href del botón sin escapar | escapa la URL del botón | muere |
| M23 | `plantilla-marca.ts` | pie con el nombre heredado en MAYÚSCULAS (armado por partes) | correos-sin-secretos › R7 | muere |
| M24 | `.env.example` | «Gmail» en la sección de correo | la sección de correo de .env.example no menciona «gmail» | muere |

Las ids M10, M19 y M20 del script estaban marcadas `skip` y no se corrieron.

#### Salida real

- Mis tests: `pnpm exec vitest run` de los 10 archivos (los 8 míos, `informe-aviso-interno.test.ts` y `html-lang.guardia.test.ts`) → **Test Files 10 passed (10), Tests 123 passed (123)**.
- `pnpm exec vitest related --run` de mis 6 archivos de `lib/` → **Test Files 360 passed | 123 skipped (483); Tests 5184 passed | 777 skipped (5961)**, REL_EXIT=0.
- `pnpm exec eslint` de mis 14 archivos → **No issues found**.
- `pnpm run test:guardias` → **Test Files 1 failed | 299 passed | 2 skipped (302); Tests 4 failed | 4101 passed | 20 skipped**.
  - `sin-nombre-heredado` y `html-lang` están en verde.
  - Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts`: `init.sh` no invoca `scripts/verificar-dependencias.mjs`. Vienen de la base: `init.sh` y la guardia no cambian desde `dc95473`, y `git show dc95473:init.sh | grep -c verificar-dependencias` = 0. No son míos.
- `pnpm run typecheck` → TC_EXIT=2. **Ningún error en mis archivos.** Todos vienen del trabajo de B en curso:
  - `IPasswordResetService` y `AuthConfig.BIENVENIDA_TTL_HORAS` ampliados y `consumirSiActivo` en la interfaz. Los dobles sin actualizar están en `empresa-de-la-peticion.test.ts`, `password-reset-actions.test.ts`, `password-reset-service.test.ts`, `auth-service.test.ts` y `postulacion-login-regresion.test.ts`;
  - `schema.prisma` cambiado sin `prisma generate`, en `OrdenRepository.ts`, `BienvenidaMaestroRepository.ts`, `UserRepository.ts`, `DistritoZonaEspecialRepository.ts`, `_shared/zona-especial.ts`, `e2e/_zona-especial-fixture.ts` y varios `tests/integration/db/*`.
- CRLF: 0 bytes `\r` en todos mis archivos.

#### Decisiones y desviaciones

- **D1 (T15).** `emailConfig().contacto` no existe y `loadEmailConfig()` lanza sin SMTP. Añadí un lector aparte, `emailContacto(): string | null`, en `lib/config/email.ts`: lee `EMAIL_CONTACTO`, recorta los espacios y valida con `z.email()`. Si la variable falta, está vacía o no es un email, devuelve `null`. Así el OTP por consola sigue funcionando sin SMTP. **design §16.3 dice `emailConfig().contacto`**: el leader debería actualizarlo a `emailContacto()`.
- **D2.** `componerCorreo` sigue pura. `plantillaOtpCodigo` lee `baseUrlDeLaApp()` y `emailContacto()` del entorno y se los pasa; la firma es la misma.
- **D3.** `BienvenidaMaestroParams.baseUrl` es `string` y no `string | null`, porque sin URL base la bienvenida no sale (R23, R40) y la nota 5 la usa. **El servicio de T7 tiene que comprobar el `null` antes de llamar.**
- **D4.** El bloque `boton` pinta en el HTML, bajo el botón, «Si el botón no funciona, copia este enlace en tu navegador:» y la URL como enlace; así se cumple «URL visible» de R13. En el texto plano queda `Crear mi contraseña: <url>` (§3.3), sin esa frase. Está explicado en el README de la maqueta.
- **D5.** `escaparHtml` escapa también `'` (`&#39;`).
- **D6.** Cada zona del HTML lleva `data-zona="cabecera|contenido|pie"` para que el test compruebe el orden. Es inocuo en los clientes de correo.
- **D7.** El censo de `html-lang` pasa a 5 con la plantilla. Ver «Modificados».
- **D8.** La regex E2E no está copiada: el test la lee de `e2e/_superadmin-fixture.ts` y la cocina. Si el fixture cambia de forma, el test se pone rojo con mensaje.
- **D9.** La maqueta usa como URL base `https://app.example.com`, así que el logo no carga en local y sale el `alt`. Lo dice el README. `bienvenida-sin-url.html` cambia la cabecera por la que da `componerCorreo` con `baseUrl: null`.
- `AUTH_BIENVENIDA_TTL_HORAS` en `lib/config/auth.ts` es de B; yo solo lo documenté en `.env.example`.
- No toqué los archivos de B, `db/` ni `lib/config/auth.ts`. No hay dependencias nuevas.

#### Pendiente fuera de mi parte

- T1: Carlos tiene que aprobar la maqueta (`specs/SL-41-plantillas-correo-bienvenida/maqueta/README.md`). Si cambia algo, se tocan `plantilla-marca.ts` y los literales de los tests.
- design §16.3: renombrar `emailConfig().contacto` → `emailContacto()`.

### SL-41 — notas de backend_dev B (T2-auth, T3, T4, T6, T14-datos)

Worktree: `.worktrees/SL-41-plantillas-correo-bienvenida`. Nada commiteado (commitea el implementer).
Base: `sl41_base`. Todo lo que dependía del cliente generado se corrió bajo `bajo-lock.sh`
(sesiones `b-sesion1.log`, `b-sesion2.log` y `b-sesion3.log` en esta misma carpeta, con las URLs enmascaradas).
MCP de grafo: no lo usé; exploré con Grep/Read.

#### Archivos

Creados:
- `db/migrations/20261023140000_usuario_contrasena_definida_at/migration.sql` (el SQL de §16.1, a mano)
- `db/migrations/20261023140000_usuario_contrasena_definida_at/down.sql`
- `lib/interfaces/repositories/IBienvenidaMaestroRepository.ts`
- `lib/repositories/BienvenidaMaestroRepository.ts`
- `tests/unit/password-reset-enlace.test.ts` (14 tests)
- `tests/integration/db/enlace-bienvenida.test.ts` (8 tests, Postgres real, filas commiteadas y dos conexiones)
- `tests/integration/db/bienvenida-maestro-repository.test.ts` (5 tests, Postgres real, transacción revertida)
- `tests/integration/db/user-repository-contrasena-definida.test.ts` (1 test, Postgres real)

Modificados:
- `lib/config/auth.ts`: `BIENVENIDA_TTL_HORAS: readPositiveInt("AUTH_BIENVENIDA_TTL_HORAS", 72)`.
- `lib/interfaces/repositories/IEmailOtpChallengeRepository.ts` y `lib/repositories/EmailOtpChallengeRepository.ts`:
  `consumirSiActivo(id)` = `updateMany({ where: { id, consumedAt: null, expiresAt: { gt: ahora } }, data: { consumedAt: ahora } })` y devuelve `count === 1`.
- `db/schema.prisma`: `contrasenaDefinidaAt DateTime? @map("contrasena_definida_at")` en `Usuario`.
- `lib/repositories/UserRepository.ts`: `updatePasswordHash` pone `contrasenaDefinidaAt: new Date()` en el mismo `update`.
- `lib/interfaces/services/IPasswordResetService.ts`: `emitirEnlaceBienvenida` y `crearContrasenaConEnlace`, con
  sus tipos de entrada y salida (`EmitirEnlaceBienvenidaInput`, `EnlaceBienvenidaEmitido`, `CrearContrasenaConEnlaceInput`).
- `lib/services/PasswordResetService.ts`: los dos métodos (§6.1, los 8 pasos en orden, consume ANTES de guardar),
  `export const DEVICE_HASH_BIENVENIDA = "bienvenida"`, `ResetOtpRepo` ampliado con `create | findActiveById | consumirSiActivo`
  (`findActiveById` ya existía en la interfaz y en el repo: devuelve null si no existe, está consumido o vencido).
- `tests/integration/user-repository-update-password.test.ts` (test con doble del repo): el contrato literal
  `data: { passwordHash }` y `keys === ["passwordHash"]` pasa a `{ passwordHash, contrasenaDefinidaAt: expect.any(Date) }`
  y las dos claves. Es el contrato que cambia §16.1 (aprobado), no un polizón. Sigue probando «no toca otros campos».

#### Migración (sl41_base, sesión 1)

| Paso | Columna `usuario.contrasena_definida_at` | `_prisma_migrations` |
|---|---|---|
| antes | 0 | — |
| `prisma migrate deploy` | 1 | aplicada (finished) |
| `pnpm run db:rollback` (aplica `down.sql` + resolve) | 0 | «Rollback completado: 20261023140000_usuario_contrasena_definida_at» |
| `prisma migrate deploy` otra vez | 1 | aplicada (finished, sin rolled_back) |

- `prisma migrate status`: «239 migrations found… Database schema is up to date!»
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an empty migration.`
- Guardias de migración (`fk-misma-empresa`, `rls-por-empresa`, `organizacion-en-modelos`, `historico-sin-migracion`…):
  en verde dentro de `pnpm run test:guardias` (ver abajo). Columna nulable en una tabla que ya tiene RLS y
  `organizacion_id`: no pide política, trigger ni clasificación nuevos.

#### Mapa R → test (lo mío)

| R | Test |
|---|---|
| R15 | `tests/unit/password-reset-enlace.test.ts` › «R15: el secreto tiene 43+ caracteres base64url y a la base solo llega su hash», «R15: dos emisiones dan secretos distintos» |
| R17 | `password-reset-enlace.test.ts` › «R17: por defecto el enlace vence a las 72 horas», «R17: con AUTH_BIENVENIDA_TTL_HORAS=24 vence a las 24 horas» |
| R18 | `password-reset-enlace.test.ts` › «R18: … consume el enlace ANTES de guardarla» (orden `["consumirSiActivo","updatePasswordHash"]`); `enlace-bienvenida.test.ts` › «R22: el ultimo manda…» (canje bueno con repos reales: hash cambia y `contrasena_definida_at` queda puesta) |
| R19 | `password-reset-enlace.test.ts` › los 6 rechazos (vencido/consumido/inexistente, sustituido, sin último, otro deviceHash, secreto erróneo, sin separador) y «pasado el limite de intentos…»: en todos, ni `updatePasswordHash` ni `consumirSiActivo` |
| R20 | `enlace-bienvenida.test.ts` › «R20: dos llamadas a la vez por conexiones distintas: exactamente una devuelve true» (5 rondas), «R20: dos canjes a la vez del mismo enlace…»; `password-reset-enlace.test.ts` › «R20: si otro canje gano la carrera…» |
| R22 | `password-reset-enlace.test.ts` › «R22: sustituido…», «R22: sin desafio activo mas reciente…»; `enlace-bienvenida.test.ts` › «R22: el ultimo manda…» y «R22: un codigo de «recuperar contrasena» posterior…» (filas reales) |
| R34 | `password-reset-enlace.test.ts` › «ni al emitir, ni en un canje bueno, ni en uno rechazado» (espía `console.log/info/warn/error/debug`; control: el canje bueno llegó a guardar) |
| R38 (datos) | `tests/integration/db/bienvenida-maestro-repository.test.ts` › «sale la empresa cuyo PRIMER maestro no fijo contrasena…», «cada empresa sale una sola vez y las de otras no se mezclan»; `tests/integration/db/user-repository-contrasena-definida.test.ts`; `tests/integration/user-repository-update-password.test.ts` |
| T4 (§6.2; R12/R30 por la vía del servicio) | `bienvenida-maestro-repository.test.ts` › «devuelve el maestro MAS ANTIGUO de esa empresa, con el nombre de esa empresa» (otra empresa y otro rol más antiguos no salen), «con dos maestros del mismo instante, desempata por id», «una empresa sin maestro devuelve null…» |
| T3 (§5.4) | `enlace-bienvenida.test.ts` › vencida → false, ya consumida → false, solo toca la fila pedida, id inexistente → false |

#### Salida real

Mis 5 archivos (sesión 1, sl41_base, `DATABASE_URL` puesta):
`Test Files 5 passed (5)` · `Tests 30 passed (30)`: **0 saltados**. Los de integración CORRIERON
(14 unit + 8 + 5 + 1 + 2 = 30).

`vitest related --run` de auth.ts, EmailOtpChallengeRepository + interfaz, PasswordResetService + interfaz,
BienvenidaMaestroRepository + interfaz (sesión 2): `Test Files 84 passed (84)` · `Tests 870 passed | 26 skipped (896)`, EXIT=0.
Incluye `password-reset-service.test.ts`, `password-reset-actions.test.ts`, `auth-service.test.ts`, etc., sin tocarlos.

`vitest related --run lib/repositories/UserRepository.ts` (sesión 2): `36 failed | 255 passed (291)` archivos ·
`21 failed | 3324 passed | 274 skipped`. **Ninguno es mío**: los 45 errores son de siembra de una base sin semillas
(31× «faltan la zona central, el tipo `cedula` o una orden…», 8× `tx.zona.findFirstOrThrow()`, 2× «tabla `usuario` vacía…»,
4× «tabla `orden` vacía / faltan catálogos… corre `pnpm run db:seed`»). Dos de ellos corridos solos dan lo mismo.
`sl41_base` es la app vacía, sin seeds (regla del producto); en CI esos archivos usan una base sembrada.

`pnpm run test:guardias` (sesión 2): `1 failed | 301 passed (302)` · `4 failed | 4120 passed | 1 skipped`.
El rojo es `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (ficha 420): «init.sh ya no tiene el
marcador ">>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<"» y «init.sh no contiene scripts/verificar-dependencias.mjs».
`init.sh` no está modificado en el worktree: es de la base (o del arnés), no de SL-41.

ESLint de mis 13 archivos: `ESLINT_EXIT=0`, sin avisos.

Typecheck (sesión 1): `TC_EXIT=2`, **6 errores, todos en dobles de tests que no son míos** (ver Bloqueo).

#### (Resuelto por la parte C) Dobles que se quedaban cortos

Vitest los pasa en verde (no comprueba tipos), pero `tsc` falla:

| Archivo:línea | Error | Arreglo mínimo propuesto |
|---|---|---|
| `tests/unit/password-reset-service.test.ts:9` | TS2741: falta `BIENVENIDA_TTL_HORAS` en el literal `CONFIG: AuthConfig` | añadir `BIENVENIDA_TTL_HORAS: 72,` |
| `tests/unit/password-reset-service.test.ts:67` | TS2345: el doble `otpRepo` no cumple el `ResetOtpRepo` ampliado | añadir `create: vi.fn(), findActiveById: vi.fn(), consumirSiActivo: vi.fn(),` al `otpRepo` de `buildDeps` |
| `tests/unit/password-reset-actions.test.ts:14` | TS2322: `buildService` devuelve `IPasswordResetService` sin los 2 métodos nuevos | añadir `emitirEnlaceBienvenida: vi.fn(), crearContrasenaConEnlace: vi.fn(),` al objeto por defecto |
| `tests/unit/auth/empresa-de-la-peticion.test.ts:290` | TS2739: literal `IPasswordResetService` sin los 2 métodos | añadir los dos `vi.fn()` |
| `tests/unit/services/auth-service.test.ts:62` | TS2741: literal `IEmailOtpChallengeRepository` sin `consumirSiActivo` | añadir `consumirSiActivo: vi.fn(),` |
| `tests/unit/services/postulacion-login-regresion.test.ts:65` | TS2741: ídem | añadir `consumirSiActivo: vi.fn(),` |

Ninguna aserción cambia: son dobles que deben cumplir la interfaz que el diseño amplía (§5.4 y §6.1). Si el leader
lo autoriza, son 6 líneas. `tests/unit/services/otp-challenge-issuer.test.ts` (de A) no aparece entre los errores.

#### Mutaciones (sesión 3, `b-sesion3.log`; salida de cada una en `mut-B/<M>.txt`)

Script `mutaciones-B.py`: copia, muta, corre vitest sobre sl41_base, restaura y comprueba byte a byte.
Control **M0** (sin mutar, los 5 archivos): `5 passed (5)`, `30 passed (30)` → CONTROL VERDE. Después, `git diff --stat`
y el sha1 de `BienvenidaMaestroRepository.ts` (`dedd4be7…`) iguales a los de antes, y las líneas clave revisadas a mano.
(Dos corridas anteriores no valen y no cuentan: la 1.ª no capturó los nombres de los tests y la 2.ª lanzó el bash de WSL;
su M0 salió rojo y por eso se repitió.)

| M | Archivo | Cambio | Test que cae (rojo por nombre) | |
|---|---|---|---|---|
| M1 | EmailOtpChallengeRepository | quitar `consumedAt: null` del `where` | enlace-bienvenida › «R20: dos llamadas a la vez…», «una fila ya consumida devuelve false…», «R20: dos canjes a la vez…» (3 de 8) | muere |
| M2 | EmailOtpChallengeRepository | quitar `expiresAt: { gt }` | enlace-bienvenida › «una fila vencida devuelve false…» | muere |
| M3 | EmailOtpChallengeRepository | `count === 1` → `count >= 0` | enlace-bienvenida › 5 de 8 (carrera, vencida, consumida, id inexistente, dos canjes) | muere |
| M4 | BienvenidaMaestroRepository | quitar `organizacionId` del `where` de `maestroParaBienvenida` | bienvenida-maestro › «devuelve el maestro MAS ANTIGUO…», «una empresa sin maestro devuelve null…» | muere |
| M5 | BienvenidaMaestroRepository | quitar `rol: { value: "maestro" }` | ídem (2) | muere |
| M6 | BienvenidaMaestroRepository | quitar el «IS NULL» (`if (m.contrasenaDefinidaAt === null)`) | bienvenida-maestro › «sale la empresa cuyo PRIMER maestro…», «cada empresa sale una sola vez…» | muere |
| M7 | BienvenidaMaestroRepository | orden `createdAt asc` → `desc` | bienvenida-maestro › «MAS ANTIGUO…» y los 2 de pendientes | muere |
| M8 | BienvenidaMaestroRepository | desempate `id asc` → `desc` | bienvenida-maestro › «con dos maestros del mismo instante, desempata por id» | muere |
| M9 | UserRepository | quitar `contrasenaDefinidaAt: new Date()` | user-repository-contrasena-definida › «tras llamarlo, la columna deja de ser NULL…»; user-repository-update-password › «actualiza password_hash y contrasena_definida_at…» | muere |
| M10 | PasswordResetService | guardar la contraseña ANTES de consumir | password-reset-enlace › «R18: … consume el enlace ANTES de guardarla», «R20: si otro canje gano la carrera…» | muere |
| M11 | PasswordResetService | ignorar el `false` de `consumirSiActivo` | password-reset-enlace › «R20: si otro canje gano la carrera…»; enlace-bienvenida › «R20: dos canjes a la vez…» | muere |
| M12 | PasswordResetService | quitar `ultimo.id !== challenge.id` (paso 5) | password-reset-enlace › «R22: sustituido…»; enlace-bienvenida › «R22: el ultimo manda…», «R22: un codigo de recuperar… posterior…» | muere |
| M13 | PasswordResetService | quitar la comprobación de `deviceHash` (paso 4) | password-reset-enlace › «R19: un desafio de login o recuperacion (otro deviceHash)…» | muere |
| M14 | PasswordResetService | `codeHash: secreto` (sin hash) | password-reset-enlace › «R15: … a la base solo llega su hash», «R34: …» | muere |
| M15 | PasswordResetService | TTL fijo a 72 | password-reset-enlace › «R17: con AUTH_BIENVENIDA_TTL_HORAS=24…» | muere |
| M16 | PasswordResetService | `randomBytes(16)` (128 bits, 22 chars) | password-reset-enlace › «R15: el secreto tiene 43+ caracteres…» | muere |
| M17 | PasswordResetService | quitar `verifyPassword` (paso 6) | password-reset-enlace › «R19: secreto erroneo…», «R19: pasado el limite…», «R34: …» | muere |
| M18 | PasswordResetService | quitar el limitador (paso 2) | password-reset-enlace › «R19: pasado el limite de intentos…» | muere |

18/18 mueren, con el control verde.

#### Decisiones y desviaciones

- `organizacionesConBienvenidaPendiente` trae todos los maestros con empresa, ordenados por `created_at, id`, y elige el
  primero de cada empresa en JS. Filtrar `contrasena_definida_at IS NULL` en el `where` estaría mal: si el primero ya la
  fijó, el segundo pasaría a ser «el primero pendiente». Sin SQL a mano (no toca `EXCEPCIONES_SQL_A_MANO`). El «IS NULL» de
  §16.2 vive, pues, en `if (m.contrasenaDefinidaAt === null)`; la mutación equivalente es quitar ese `if`.
- Los dos métodos comparten la constante `ORDEN_PRIMER_MAESTRO` (`createdAt asc, id asc`): si cada uno eligiera a un maestro
  distinto, el botón se ocultaría por la contraseña de quien no recibe el correo.
- El repositorio NO llama a `comoPlataforma` (lo abre la action, que ya está en `EXCEPCIONES_DE_PLATAFORMA`); por eso
  `organizacionId` va explícito en el `where`. Los tests lo corren con el cliente base sobre la transacción del test
  (`clienteConTransaccionAnidada`), igual que `empresas-plataforma.test.ts`.
- `enlace-bienvenida.test.ts` COMMITEA sus filas (la carrera necesita dos conexiones de verdad) y sostiene
  `tomarLockDeEscrituraReal` del `beforeAll` al `afterAll`; borra desafíos, usuarios y organización al final.
- Los tests de R22 con filas reales retrasan 60 s el `created_at` del desafío viejo: es `TIMESTAMP(3)` y dos emisiones
  seguidas pueden empatar en el milisegundo.
- Limitador del canje: `buildResetRateKey(challengeId, ip)`. Renombré el parámetro de los dos helpers privados
  de `email` a `sujeto` (email en el flujo del código, challengeId en el del enlace); el comportamiento no cambia.
- `crearContrasenaConEnlace` rechaza un enlace sin `.` (o con un lado vacío) aunque zod ya lo valide en el borde: no cuesta
  nada y evita un `findActiveById("")`.

#### Limpieza

- No creé bases `sl41_*` nuevas; `sl41_base` queda con la migración aplicada (deploy → rollback → deploy).
- El lock `gate.lock` quedó suelto (comprobado al final).
- `enlace-bienvenida.test.ts` borra en su `afterAll` las filas que commitea.

#### Veredicto

T2-auth, T3, T4, T6 y T14 (datos) hechos y probados contra Postgres real (30/30, 0 saltados; 18/18 mutaciones mueren). El typecheck queda ROJO por 6 dobles de tests ajenos que no cumplen las interfaces ampliadas: hace falta autorización para añadir 6 líneas `vi.fn()`.

### SL-41 — notas de backend_dev C (T0-dobles, T7 servicio, T8 actions, T11 docs)

Worktree: `R:/job/singularis/projects/servi_logistic/.worktrees/SL-41-plantillas-correo-bienvenida`.
**Nada commiteado** (commitea el implementer). No he tocado `app/**`, `tests/components/**` ni
`tests/integration/recuperar-contrasena-enlace.test.tsx`. MCP del grafo: no lo usé; trabajé con Grep/Read.
Todo lo que necesitaba el cliente generado corrió bajo `bajo-lock.sh` (`c-sesion1.log`, `c-sesion2.log` y
`c-sesion3.log` en esta carpeta; el 2 y el 3 están en cp1252: léelos con `iconv -f cp1252`). El primer intento
de la sesión 2 caducó tras 1 h de esperar el lock (SL-39 y frontend-SL-41) y se relanzó.

#### Archivos

Creados:
- `lib/interfaces/services/IBienvenidaMaestroService.ts`: `EstadoBienvenida`, `EnviarBienvenidaInput`, `EnviarBienvenidaResultado`, `IBienvenidaMaestroService`
- `lib/services/BienvenidaMaestroService.ts`: el servicio (§6.3, §16.4) y `urlDelEnlace(baseUrl, enlace)`
- `lib/actions/_shared/contexto-peticion.ts` (sin "use server"): `RequestContext`, `buildPasswordResetService`, `requestContextFromHeaders` y el `verifyLimiter` del proceso, movidos desde `password-reset.ts` (§7.1)
- `tests/unit/services/bienvenida-maestro-service.test.ts` (14 tests)
- `tests/unit/actions/reenviar-bienvenida-action.test.ts` (27 tests)
- `tests/unit/password-reset-enlace-action.test.ts` (10 tests)

Modificados:
- `lib/actions/organizaciones.ts`: `AltaEmpresaActionResultado` con `bienvenida`; deps `bienvenida`, `bienvenidaRepo`, `getContext`; `altaEmpresaAction` con la bienvenida; `reenviarBienvenidaAction(input, deps?)` y `ReenviarBienvenidaResultado`; `bienvenidasPendientesAction(deps?)` y `BienvenidasPendientesResultado`; `construirBienvenida()` como composition root
- `lib/actions/password-reset.ts`: importa de `_shared/` (re-exporta el TIPO `RequestContext`); `crearContrasenaConEnlace(input, deps?)`
- `lib/types/password-reset.ts`: `ENLACE_BIENVENIDA_REGEX` y `crearConEnlaceSchema` (+ `CrearConEnlaceInput`)
- `README.md` > «El correo, sin el cual nadie entra»; `docs/architecture.md` > Alta de empresa (el marcador `<!-- perfil: ... -->` de la línea 1 no se toca)
- Tests ampliados: `tests/unit/actions/organizaciones-action.test.ts`, `tests/unit/actions/organizaciones-action.composition-root.test.ts`, `tests/unit/actions/alta-empresa-rol.test.ts`
- T0, solo dobles (una línea `vi.fn()` cada uno, ninguna aserción tocada): `tests/unit/password-reset-service.test.ts` (`BIENVENIDA_TTL_HORAS: 72`; `create`, `findActiveById`, `consumirSiActivo`), `tests/unit/password-reset-actions.test.ts` y `tests/unit/auth/empresa-de-la-peticion.test.ts` (`emitirEnlaceBienvenida`, `crearContrasenaConEnlace`), `tests/unit/services/auth-service.test.ts` y `tests/unit/services/postulacion-login-regresion.test.ts` (`consumirSiActivo`)

`EXCEPCIONES_DE_PLATAFORMA` no crece: las tres llamadas nuevas a `comoPlataforma` están en `organizaciones.ts` y `password-reset.ts`, que ya figuran; `_shared/contexto-peticion.ts`, el servicio y el repositorio no lo llaman. `plataforma-solo-en-lista` en verde.

#### Mapa R → test (lo mío)

| R | Test |
|---|---|
| R12 | `organizaciones-action.test.ts` › «SL-41 R12 — … una sola vez, con el organizacionId del alta y la IP de la petición, en plataforma con SL-41»; `organizaciones-action.composition-root.test.ts` › «SL-41: sin deps.bienvenida, el repositorio real recibe la empresa nueva y el emisor recibe el correo» |
| R16 | `bienvenida-maestro-service.test.ts` › «R16 — la URL del correo es <base>/recuperar-contrasena#enlace=<enlace>, sin query y sin el secreto en la ruta» |
| R23 (servicio) | `bienvenida-maestro-service.test.ts` › «R23 — falla el SMTP», «falla la emisión del enlace», «falla la lectura del maestro», «lanza algo que no es un Error»; «R23 y R40 — sin URL base» |
| R23 (action) | `organizaciones-action.test.ts` › «SL-41 R23 y R24» (no_enviada ×2, sin_correo, la bienvenida lanza, falla `getContext`, `sin_maestro` → no_enviada) |
| R24 | `bienvenida-maestro-service.test.ts` › «R24 — … sin_correo», «con SMTP, un messageId null no lo convierte en sin_correo»; `organizaciones-action.test.ts` › «bienvenida sin_correo»; composition root → `sin_correo` sin SMTP |
| R27 | `organizaciones-action.test.ts` › «SL-41 R27 — ya_existe / conflicto / invalida: … no llama a la bienvenida» (ni `getContext`); y R48 no autorizado: `enviar` no llamado |
| R28 | `organizaciones-action.test.ts` › «SL-41 R28 — aunque el servicio de bienvenida los devolviera, el JSON de la respuesta no los contiene» |
| R30 | `reenviar-bienvenida-action.test.ts` › «R30 — devuelve lo que dice el servicio: enviada/no_enviada/sin_correo/sin_maestro» (con org, IP y contexto SL-41), «si armar el envío falla…» |
| R32 | `reenviar-bienvenida-action.test.ts` › «R32 — rol %s» (6 roles: ni `enviar` ni `getContext`), «sin sesión, y aunque el id no sea un UUID: no_autorizado antes que invalida» |
| R33 | `reenviar-bienvenida-action.test.ts` › «R33 — si no es un UUID / falta / no es un objeto / es null → invalida», «un UUID … sin maestro, o que no existe → sin_maestro» |
| R34 | `bienvenida-maestro-service.test.ts` › «R34 — …» (3 tests; espía `console.log/info/warn/error/debug`: ni secreto, ni enlace, ni URL, ni email, ni message; la línea de error exacta) |
| R38 (action) | `reenviar-bienvenida-action.test.ts` › «R38 — bienvenidasPendientesAction»: no_autorizado sin leer (6 roles y sin sesión), ok en plataforma SL-41, error sin mensaje en respuesta ni consola |
| R39 (servicio) | `bienvenida-maestro-service.test.ts` › «R39: el pie lleva el contacto que recibe el servicio» |
| R40 | `bienvenida-maestro-service.test.ts` › «R23 y R40 — no_enviada sin emitir el enlace ni enviar, y un aviso que nombra NEXT_PUBLIC_APP_URL» |
| R18/R19 (borde) | `password-reset-enlace-action.test.ts` › 6 enlaces mal formados, contraseñas distintas (error en `confirmPassword`), política débil → validation_error sin llamar al servicio; «R18: ok … en plataforma con SL-41»; «R19: invalid_or_expired tal cual» |

#### Mutaciones (`mutaciones-C.py`; salida JSON por mutación en `mut-C/<M>.json`)

Control **M0** (los 11 archivos, sin mutar): `exit=0 total=124` → CONTROL VERDE. Cada mutación restaura y
compara byte a byte (`restaurado=True` en todas). Tras la tanda, `git diff --stat` de los archivos mutados
solo muestra mis cambios.

| M | Archivo | Cambio | Cae (por nombre) | |
|---|---|---|---|---|
| M1 | BienvenidaMaestroService | `#enlace=` → `?enlace=` | service › R16 | muere |
| M2 | BienvenidaMaestroService | sin el corte de `baseUrl === null` | service › R23 y R40 | muere |
| M3 | BienvenidaMaestroService | el log de error añade `error.message` | service › R34 (SMTP falla), R34 (emisión falla) | muere |
| M4 | BienvenidaMaestroService | estado fijo `enviada` (ignora `smtpConfigurado`) | service › R24 sin_correo | muere |
| M5 | organizaciones.ts | `{ ...r, ...b, bienvenida }` | organizaciones-action › R12, R23/R24 (×5), R48 superadmin; alta-empresa-rol › superadmin | muere |
| M6 | organizaciones.ts | `enviarBienvenida` relanza en vez de `no_enviada` | organizaciones-action › bienvenida lanza, falla getContext; reenviar › si armar el envío falla | muere |
| M7 | organizaciones.ts | sin `if (r.estado !== "creada") return r` | organizaciones-action › R27 ya_existe/conflicto/invalida | muere |
| M8 | organizaciones.ts | `construirBienvenida` con `baseUrl` null | composition-root › los 2 | muere |
| M9 | organizaciones.ts | `construirBienvenida` con un repo de mentira en vez del real | composition-root › SL-41 repositorio real | muere |
| M10 | organizaciones.ts | reenvío valida antes de autorizar | reenviar › R32 sin sesión y no-UUID | muere |
| M11 | organizaciones.ts | `z.uuid()` → `z.string()` | reenviar › R33 no es un UUID | muere |
| M12 | organizaciones.ts | `error` con el detalle del error | reenviar › R38 error sin mensaje | muere |
| M13 | organizaciones.ts | motivo de plataforma de pendientes cambiado | reenviar › R38 ok en plataforma SL-41 | muere |
| M14 | types/password-reset.ts | secreto `{43}` → `{22,}` | enlace-action › secreto corto | muere |
| M15 | types/password-reset.ts | refine siempre true | enlace-action › contraseñas no coinciden | muere |
| M16 | password-reset.ts | ficha `SL-41` → `SL-17` en `crearContrasenaConEnlace` | enlace-action › R18 ok en plataforma | muere |
| M17 | password-reset.ts | motivo de `restablecer` | empresa-de-la-peticion › los tres pasos en comoPlataforma | muere |
| M18 | password-reset.ts | `solicitarRecuperacion` no valida la entrada | password-reset-actions › rechaza email invalido | muere |
| M19 | PasswordResetService | `verificarCodigo` sin el `if (!usuario)` | — | SOBREVIVE (equivalente con estos dobles: `findLatestActiveByUsuarioId` devuelve undefined y sale igual `invalid_or_expired`; no cuenta) |
| M19b | PasswordResetService | `recientes <` → `<=` | password-reset-service › R19: supera RESET_MAX_REQUESTS -> no emite OTP (sesión 3) | muere |
| M20 | AuthService | `>=` → `>` en el bloqueo | auth-service › R21, R21a 6to intento | muere |
| M21 | AuthService | sin el `estado !== "activo"` | postulacion-login-regresion › R23 | muere |

#### Salida real

- Mis 13 archivos (sesión 1): `Test Files 13 passed (13)`, `Tests 142 passed (142)`; ESLint de los 17 archivos: `ESLINT_EXIT=0`, sin salida.
- Sesión 2 (tras la tanda de mutaciones, con el árbol restaurado):
  - `pnpm run typecheck` → **TC_EXIT=0** (en la sesión 1 quedaban 2 errores en `tests/components/*` del frontend y 1 mío, ya corregido; en la 2, ninguno).
  - `pnpm run test:guardias` → `Test Files 1 failed | 301 passed (302)`, `Tests 4 failed | 4120 passed | 1 skipped`. Los 4 rojos son `dependencias-declaradas-presentes.guardia.test.ts` (ficha 420, `init.sh`), los de la base y el baseline. `plataforma-solo-en-lista`, `use-server-exports-async` y `sin-nombre-heredado` en verde.
  - `pnpm exec vitest related --run` de mis 6 archivos de `lib/` → `Test Files 14 passed (14)`, `Tests 143 passed (143)`, REL_EXIT=0. Ningún rojo por siembra.
- CRLF: 0 bytes `\r` en todos mis archivos. Sin «Ordenex» en lo que añadí (`docs/architecture.md` ya lo citaba 4 veces en la base).

#### Decisiones y desviaciones

- **D1. `no_enviada` lleva `email: string | null`.** El design pone `{ estado: EstadoBienvenida; email: string }`, pero si falla la lectura del propio maestro (paso 1 de §6.3) no hay email que dar y no quiero inventarlo. `EnviarBienvenidaResultado` = `{ estado: "enviada" | "sin_correo"; email: string } | { estado: "no_enviada"; email: string | null } | { estado: "sin_maestro" }`. El frontend ya compila contra él (typecheck verde).
- **D2. Contacto del pie (R39) por constructor.** 6.º parámetro de `BienvenidaMaestroService`, `contacto: string | null = null`; el composition root le pasa `emailContacto()`. Así el servicio no lee el entorno y se prueba sin `process.env`.
- **D3. `deps.bienvenidaRepo`** en `OrganizacionesDeps`, para inyectar el repositorio en `bienvenidasPendientesAction`. El design no nombra el dep.
- **D4. La action también envuelve la bienvenida en try/catch.** El servicio nunca lanza, pero `getContext` (`headers()`), `getPrismaClient` o `comoPlataforma` sí pueden; cualquier fallo es `no_enviada` y el log solo lleva `organizacion` y `error.name`. En el reenvío, el mismo fallo es `{ estado: "no_enviada", email: null }`.
- **D5. `sin_maestro` en el alta → `no_enviada`.** Una empresa recién creada tiene maestro; si la lectura no lo encuentra, el correo no salió (R23). `AltaEmpresaActionResultado.bienvenida` sigue siendo `EstadoBienvenida`.
- **D6. `getContext` del alta solo se llama con `creada`** (R27 lo prueba).
- **D7. Contrato literal cambiado (no polizón):** `alta-empresa-rol.test.ts` y el test «el superadmin sí llega al servicio» de `organizaciones-action.test.ts` comparaban `toEqual({ estado: "creada", organizacionId, maestroId })`; con §7.2 aprobado la respuesta lleva `bienvenida`. Les inyecté un doble de bienvenida y `getContext`, y el literal pasa a incluir `bienvenida: "enviada"`. Sin el doble, la action iría a la base y a `headers()`.
- **D8. Composition root:** el doble de `getPrismaClient` gana `usuario`, `emailOtpChallenge` y `organizacion`; se sustituye solo `crearEmailSender` (`vi.mock` con `importOriginal`). El 2.º test lee lo que dejó el 1.º (misma llamada a la action); vitest los corre en orden dentro del archivo.
- **D9.** Los tests de `crearContrasenaConEnlace` van en un archivo nuevo (`tests/unit/password-reset-enlace-action.test.ts`), no en `password-reset-actions.test.ts`, para no tocar ese más allá de sus dobles.
- **D10.** `causaDe()` está duplicada (servicio y action): 3 líneas, y compartirla obligaría a exportar algo desde un archivo "use server" o a crear otro módulo para ello.

#### Para el frontend / el leader

- `tests/integration/empresas-page.test.tsx` mockea `@/lib/actions/organizaciones` solo con `altaEmpresaAction`: si `page.tsx` importa `reenviarBienvenidaAction` y `bienvenidasPendientesAction`, ese mock tiene que ampliarse (es del frontend; aparece como modificado en el árbol).
- design §6.3: anotar D1 (`email: string | null` en `no_enviada`) y D2 (contacto por constructor).
- Mutaciones: 21/21 con efecto mueren (M19 descartada por equivalente y sustituida por M19b). Tras la sesión 3, `git status` de `PasswordResetService.ts` y `AuthService.ts` vacío.

### SL-41 — notas del frontend_dev (T9, T10 + T14 UI, T12)

Worktree `.worktrees/SL-41-plantillas-correo-bienvenida`, sobre HEAD 011b278 más el trabajo del backend
en curso (sin commitear). No hice commit, checkout ni stash. No toqué `lib/**` ni `tests/unit/**`.

#### Archivos

Creados:
- `app/(app)/plataforma/empresas/_components/ReenviarBienvenidaBoton.tsx`
- `tests/components/reenviar-bienvenida-boton.test.tsx`
- `tests/integration/recuperar-contrasena-enlace.test.tsx`

Modificados:
- `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`: modo enlace (§9.2).
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`: `desenlaceDe` con `bienvenida`, los dos
  avisos, la columna «Bienvenida» y las props `reenviarBienvenida` y `bienvenidaPendiente`. Sale `TEXTOS.avisoCreada`.
- `app/(app)/plataforma/empresas/page.tsx`: llama a `bienvenidasPendientesAction()` en el mismo `Promise.all`
  que el listado. Pasa `reenviarBienvenida` y `bienvenidaPendiente` (`null` si no da `ok`).
- `tests/components/empresas-module.test.tsx`: se cambian los casos del aviso viejo de SL-32 R37 y se añaden
  R25, R26, R29 y R38.
- `tests/integration/empresas-page.test.tsx`: el mock de `@/lib/actions/organizaciones` gana las dos actions
  nuevas (sin ellas la página se caía). Los roles de empresa tampoco leen las pendientes. Dos casos R38 nuevos.
- `e2e/_superadmin-fixture.ts`: `enlaceEnviadoA(log, email)`. El bucle de espera de `codigoEnviadoA` se
  saca a `ultimaCoincidencia()`, y la regex del código no cambia.
- `e2e/superadmin-empresas.spec.ts`: lo detallo en la sección E2E de abajo.

#### R → test

| R | Test |
|---|---|
| R18 (UI) | `recuperar-contrasena-enlace.test.tsx`: «con ok envía el enlace (no email y código) y lleva al éxito con /login», «con validation_error…» |
| R19 (UI) | `recuperar-contrasena-enlace.test.tsx`: «con invalid_or_expired muestra el genérico y «Pedir un código por correo» vuelve al paso 1», «con #enlace= vacío…» |
| R21 | `recuperar-contrasena-enlace.test.tsx`: «con #enlace= borra el fragmento nada más montar y no pinta el secreto», «con otro fragmento no toca la barra…», «el título es «Crea tu contraseña»…» |
| R25 | `empresas-module.test.tsx`: «R25: con «enviada», un aviso de estado que nombra el email del maestro», «tras el éxito avisa de la bienvenida enviada…» |
| R26 | `empresas-module.test.tsx`: «R26: con «no_enviada»…», «R26: con «sin_correo»…», «R26: sin «bienvenida» / con un valor fuera del contrato se toma como «no_enviada»» |
| R29 | `empresas-module.test.tsx`: «R29: sin el dato de pendientes (null)…», «R29: una empresa sin maestros no lo lleva aunque figure como pendiente», «la tabla gana una columna final «Bienvenida»», «el botón de la fila reenvía la bienvenida de ESA empresa». `empresas-page.test.tsx`: «R38: si la lectura de pendientes falla, vale R29…» |
| R31 | `reenviar-bienvenida-boton.test.tsx`: `it.each` de enviada / no_enviada / sin_correo / sin_maestro / no_autorizado / invalida / fuera del contrato; «una excepción de red cuenta como «No salió», sin su detalle»; «mientras envía, el botón queda ocupado…» |
| R38 (UI) | `empresas-module.test.tsx`: «R38: la empresa pendiente lleva el botón», «R38: la empresa cuyo maestro ya creó su contraseña no lo lleva». `empresas-page.test.tsx`: «R38: con la lectura de pendientes, solo la fila pendiente lleva «Reenviar bienvenida»» |
| E2E | `e2e/superadmin-empresas.spec.ts`, pasos 2, 5-6 (A) y 7. **NO ejecutado**: lo corre el implementer. |

#### Mutaciones: 23 aplicadas, 23 mueren

Lo hace el script `d-mutaciones.py` (junto a estas notas). Primero corre cada test sin mutar, y los cuatro
salen verdes. Después aplica cada mutación, corre su test y restaura el archivo desde la copia en memoria.
Comprobé que los cuatro archivos fuente vuelven a su contenido.

| # | Mutación | Tests en rojo |
|---|---|---|
| M1 | sin `replaceState` | «…borra el fragmento nada más montar…», «con #enlace= vacío…» |
| M2 | el título es siempre «Nueva contraseña» | «el título es «Crea tu contraseña»…», «con validation_error…» |
| M3 | envía siempre con `restablecerContrasena` | «con ok envía el enlace…», «validation_error», «invalid_or_expired…» |
| M4 | con enlace, `invalid_or_expired` no marca el enlace como muerto | «con invalid_or_expired muestra el genérico…» |
| M5 | «Pedir un código» no vuelve al paso 1 | ídem |
| M6 | un `#enlace=` vacío entra en modo enlace | «con #enlace= vacío…» |
| M7 | `sin_correo` muestra «No salió» genérico | «con sin_correo pinta su resultado» |
| M8 | la excepción de red muestra «sin maestro» | «una excepción de red…» |
| M9 | `enviada` sin el email | «con enviada pinta su resultado» |
| M10 | `sin_maestro` muestra «No salió» | «con sin_maestro…» |
| M11 | `loading={false}` | «mientras envía, el botón queda ocupado…» |
| M12 | lo desconocido muestra «sin correo» | «con invalida / no_autorizado / no_enviada…» |
| M13 | una bienvenida desconocida cuenta como `enviada` | «R26: sin «bienvenida»…», «R26: con un valor fuera del contrato…» |
| M14 | el aviso de `enviada` pierde `role="status"` | «R25: con «enviada»…» |
| M15 | `sin_correo` pierde su línea | «R26: con «sin_correo»…» |
| M16 | con `null` ya no vale R29 | «R29: sin el dato de pendientes (null)…», «el botón de la fila reenvía…» |
| M17 | se ignoran las pendientes | «R29: una empresa sin maestros…», «R38: la empresa cuyo maestro ya creó su contraseña…» |
| M18 | una fila sin maestros también lleva el botón | «R29: sin el dato… (null)», «R29: una empresa sin maestros…» |
| M19 | el aviso no lleva el email | «tras el éxito avisa…», «R25…» |
| M20 | el reenvío lleva el slug en vez del id | «el botón de la fila reenvía la bienvenida de ESA empresa» |
| M21 | `no_enviada` muestra el aviso de `enviada` | los 4 casos de R26 |
| M22 | page: las pendientes siempre `null` | «R38: con la lectura de pendientes, solo la fila pendiente…» |
| M23 | page: un error cuenta como «ninguna pendiente» | «R38: si la lectura de pendientes falla, vale R29…» |

#### Salida real (resumida; log completo en `d-sesion2.log`, dentro del lock)

```
TC_EXIT=0            (pnpm run typecheck, contra las actions reales del backend)
ESLINT_EXIT=0        (pnpm exec eslint, sobre mis 10 archivos)
vitest run (mis 4 tests, más recuperar-contrasena-form, recuperar-contrasena-page y las guardias
contrasena-maqueta-unica y buttonvariants-pasa-por-cn): Test Files 8 passed (8), Tests 99 passed (99)
vitest related --run (los 4 fuentes): Test Files 6 passed (6), Tests 79 passed (79)
Mutaciones: 23/23 MUEREN
```

La primera vuelta (`d-sesion1.log`) dio dos rojos, ya corregidos:
- typecheck: un `vi.fn()` sin tipo no encaja en la prop. Los tests lo convierten al tipo de la prop, con un
  comentario: le dan respuestas fuera del contrato a propósito.
- lint: `react-hooks/set-state-in-effect`. Ver la desviación 1.

#### Desviaciones y notas para el implementer

1. **§9.2 pide guardar el enlace y llamar a `replaceState` «en el mismo efecto». No se puede tal cual.**
   Un `setState` dentro de un efecto es error de lint en este repo. Lo que hice:
   - el fragmento se lee con `useSyncExternalStore`, que es el patrón del repo (`AbrirEnAppNavegacion`,
     `CarruselCards`). El servidor ve `""`;
   - se copia a estado durante el render, el patrón de `MarcarRecibidoDialog`;
   - un `useLayoutEffect` sin `setState` lo borra de la barra antes del pintado.

   El efecto para R21 es el mismo, y lo sostiene el test «borra el fragmento nada más montar», que muere con M1.
2. **Las actions del formulario no se inyectan por prop.** Se importan directamente y el test las sustituye
   con `vi.mock`. `crearContrasenaConEnlace` sigue ese mismo patrón. En `EmpresasModule` sí van por prop.
3. **Con `#enlace=` vacío** se muestra directamente el genérico de R19, sin llamar a la action. El spec no
   lo dice; un enlace vacío es un enlace roto.
4. **Con `invalid_or_expired` en modo enlace desaparece el formulario.** Quedan el genérico y «Pedir un
   código por correo», porque un enlace muerto no se reintenta. El botón de envío dice «Crear contraseña».
5. **Aviso de advertencia (R26).** `Alert` no tiene variante de advertencia. Usé la base, con su
   `role="alert"`, `border-warning/40`, `text-warning-strong` y el icono `TriangleAlert` como primer hijo,
   igual que `TableroDiaAvisoRefresco`.
6. **La región `role="status"` del botón existe siempre**, vacía hasta el primer resultado, para que el lector
   de pantalla la anuncie. Por eso varios tests viejos que miraban `queryByRole("status")` en toda la
   pantalla ahora buscan el texto del aviso (`/^Empresa creada/`). En el E2E, lo mismo en los pasos 1, 3 y 4.
7. **Fila con maestro pero sin bienvenida pendiente** (R38): la celda muestra «—», como la de una empresa
   sin maestros. El spec no dice qué poner ahí.
8. **E2E (T12), sin ejecutar.** Lo que espera:
   - **Variables del dev server:** necesita `NEXT_PUBLIC_APP_URL`. Sin ella no hay enlace (R40) y el paso
     2 falla en `enlaceEnviadoA` con un mensaje que nombra la variable. Lo anoté en la cabecera.
   - **Paso 2:** sin `SMTP_*`, el aviso esperado es la advertencia de `sin_correo`, no el de R25. El paso
     lee el enlace de cada alta y comprueba que la fila lleva «Reenviar bienvenida».
   - **Pasos 5-6, maestro A:** abre `/recuperar-contrasena#enlace=…` después de pasar por `/login`, porque
     un `goto` que solo cambia el fragmento no vuelve a montar el formulario. Ve «Crea tu contraseña»,
     comprueba que la barra ya no tiene fragmento, crea la contraseña y ve «Contraseña actualizada». Un
     segundo uso del enlace muestra el genérico y «Pedir un código por correo». Después entra con
     `entrarConOtp`.
   - **Pasos 5-6, maestro B:** sigue por «¿Olvidaste tu contraseña?», para que la recuperación por código
     no pierda cobertura.
   - **Paso 7, nuevo (R38):** con las dos contraseñas creadas, ninguna fila ofrece el botón. Depende de que
     `restablecer()` también ponga `contrasena_definida_at` (T14 backend).
   - **Alertas:** el anunciador de rutas de Next es `role="alert"`, así que las alertas se filtran por texto.
9. Contratos del backend: casan. `reenviarBienvenidaAction(input: unknown, deps?)` y
   `crearContrasenaConEnlace(input: unknown, deps?)` son más anchas que la firma de la prop, así que encajan.
   El typecheck pasa contra el código real.
10. El grafo MCP no se usó: el trabajo era sobre archivos concretos, que leí con Read/Grep.

#### Rojo bajo carga del gate

**Veredicto: el fallo NO lo introdujo SL-41. Ya estaba en el componente de dc95473 y bajo carga falla igual.
Pero es un bug real del componente, no del test, y lo arreglé en el componente.** Los tests no se tocaron.

### Causa
Dentro de `startTransition(async () => { const res = await action(); setPhase(...) })`, los `setState` que
van después del `await` ya no forman parte de la transición (React 19). Se pintan en un carril normal y
`isPending` vuelve a false después, con la transición. Hay un hueco en el que la fase nueva ya está en
pantalla con `isPending` aún en true, y por eso con sus campos `disabled={isPending}`. `findByLabelText(...)`
encuentra el campo en ese hueco. `user.type` sobre un input deshabilitado no escribe nada.
- Paso email→código: el código queda vacío, la validación del cliente falla y la pantalla sigue en «Verificar
  código». Luego `findByLabelText("Nueva contraseña")` agota su tiempo. Es el rojo «sigue en Verificar código».
- Paso código→contraseña: la contraseña queda vacía. Es el rojo `toHaveValue("Abcdef1!")` → `""`. En el
  DOM volcado de los fallos «Contraseña actualizada» se ve `value=""` y «Debe tener al menos 8 caracteres».
Sin carga, la transición se pinta enseguida y el hueco no se ve. El usuario real también lo sufre: si teclea
justo al aparecer la fase, pierde esas teclas.
Lo que añadió SL-41 (`useSyncExternalStore`, el render-copy, `useLayoutEffect`) no cambia nada sin `#enlace=`:
el snapshot siempre es `""`, el `if` del render nunca dispara y el efecto sale en la primera línea.

### Evidencia
Escenario: N copias en paralelo de `vitest run tests/integration/recuperar-contrasena-form.test.tsx` más M
procesos node quemando CPU. Script: `carga/ronda.sh`; logs en `carga/`.

| componente | carga fuerte (6 copias + 12 burners, 18 corridas) | carga media (5 + 9, 15 corridas) |
|---|---|---|
| SL-41 antes del arreglo | **18/18 en rojo**, 81 tests caídos | **12/15 en rojo**, 20 tests caídos |
| dc95473 (base, restaurado después, `cmp` OK) | **18/18 en rojo**, 74 tests caídos | **11/15 en rojo**, 23 tests caídos |
| arreglo, solo `startTransition` interno | 0/18 | 0/15 |
| arreglo final (+ foco por efecto) | **0/18** | **0/15** |
| (control) test con espera `toBeEnabled()` en los helpers, componente sin tocar | 0/18 | — |

En las dos tandas de antes, los fallos son de los mismos tipos que en el gate: «Unable to find a label …
Nueva contraseña» (36 frente a 41), `toHaveValue(Abcdef1!)` (12 frente a 7), «/El código es inválido/»
(17 frente a 10) y «Contraseña actualizada» (7 frente a 9).
En el gate se vio lo mismo: el archivo tardó 18,2 s y 13,4 s, frente a 7,6 s cuando corre solo.

### Cambio (`app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`, diff en `e-arreglo.diff`)
1. En los tres handlers, el `switch` que va tras el `await` queda envuelto en `startTransition(() => {...})`.
   Es la forma que documenta React. La fase nueva y `isPending=false` se pintan juntas.
2. El foco al entrar en una fase lo hace ahora `useEffect(..., [phase])`, que sustituye al foco de montaje.
   Antes eran dos `setTimeout(…focus, 0)`. Con la fase en la transición, el temporizador podría disparar antes
   de que se pinte la fase. No hay `setState` en el efecto, así que lint no protesta. `pedirCodigo` y
   «Volver» conservan su `setTimeout`.
Lo comprobé con un test temporal, ya borrado: el foco va al email al montar, al código tras el paso 1
(`user.keyboard` escribe ahí) y a «Nueva contraseña» tras el paso 2. Pasó 1/1.

### Mutaciones (`e-mutaciones.py` → `e-mutaciones.log`)
- M1–M6 repetidas (M4 con la sangría nueva): **las 6 MUEREN**, con los mismos tests en rojo que antes.
- M24 (sin foco por fase en la contraseña) y M25 (sin foco en el código): **SOBREVIVEN**. Ningún test comprueba
  el foco al entrar en una fase. Ya pasaba con los `setTimeout` de dc95473: es un hueco preexistente, no lo cierro.
- Quitar el `startTransition` interno no se ve en un test aislado. Solo se ve bajo carga: es la tabla de arriba.

### Salida real (`e-verifica.log`, dentro del lock)
```
TC_EXIT=0
ESLINT_EXIT=0
Test Files  4 passed (4)   Tests  25 passed (25)   (form 11, enlace 7, page 3, guardia contrasena-maqueta-unica 4)
VITEST_EXIT=0
```
R18/R19/R21 siguen en verde: el test de enlace pasa 7/7 y M1–M6 mueren. La guardia de la maqueta única
sigue en verde.

## Gate local (`TEST_RAPIDO_BASE=dev ./init.sh`, dentro del lock, base `sl41_base`)

- Gate 1 (`435355c`): `INIT_EXIT=1`. Rojos nuevos: `tests/integration/recuperar-contrasena-form.test.tsx`
  (3 tests) y `tests/integration/db/abono-tienda-457-concurrencia.test.ts` (deadlock; no reaparece).
- Gate 2: `INIT_EXIT=1`. Rojo nuevo: el mismo `recuperar-contrasena-form.test.tsx` (otro test).
  Diagnóstico: bug previo del componente bajo carga (18/18 en rojo también con el de `dc95473`),
  que SL-41 destapa porque toca el archivo. Se arregla en el componente (`284e328`), sin tocar tests.
- Gate 3 (`284e328`): **`INIT_EXIT=0`**, `== init OK ==`. Vitest: 453 archivos y 6163 tests pasados
  (26 saltados); segunda tanda, 301 archivos y 4109 tests pasados (1 saltado).
  Log: `scratchpad/sl41-gate-3.log`.

#### E2E y captura — frontend_dev — 2026-10-23

**Preparación.** HEAD `45f44fa` (284e328 es ancestro; solo cambia la bitácora). Antes de arrancar: nada en el 3000, ningún
`next dev` vivo y `gate.lock` libre. Base desechable `sl41_e2e`: `CREATE DATABASE`, `prisma migrate deploy` («All migrations
have been successfully applied») y `db:seed` («Seed de catalogos completado»). Todo lo demás corrió dentro de
`bajo-lock.sh frontend-SL-41-e2e` con `SL41_DB=sl41_e2e`, con el lock retenido de principio a fin (tomado a las 23:43:32):
`prisma generate`, `rm -rf .next`, `pnpm dev` (`AUTH_OTP_DEBUG_LOG=1`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, sin `SMTP_*`,
stdout+stderr a `f-dev.log`, `SL17_HUMO_LOG_SERVIDOR` apuntando a él; «Ready in 556ms»), Playwright, y matar el server.
Script: `sl41/f-e2e.sh`.

### Salida real de Playwright (`e2e/superadmin-empresas.spec.ts --reporter=list`)
```
  ok 1 › 1. «Empresas» abre en el estado vacío (R29) (1.1s)
  ok 2 › 2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29) (1.6s)
  ok 3 › 3. repetir el slug, el email o el documento de A marca su campo y no crea nada (R31, R32, R33) (3.8s)
  ok 4 › 4. un slug inválido marca el campo sin crear nada (R34) (1.1s)
  x  5 › 5-6. el maestro de A crea su contraseña con el enlace de bienvenida, «Empresas» le da 404 y no la ve (R18, R19, R35) (1.0m)
  -  6 › 5-6. el maestro de B crea su contraseña con «¿Olvidaste tu contraseña?» ... (serial: no corre)
  -  7 › 7. con las dos contraseñas creadas, ninguna fila ofrece «Reenviar bienvenida» (R38)
    Error: expect(locator).toBeVisible() failed — getByText('Contraseña actualizada'), Timeout 60000ms (spec:306)
  1 failed | 2 did not run | 4 passed (1.4m)
PW_EXIT=1
```
El paso 2 sí pasó: el aviso `sin_correo` en pantalla, el enlace leído del log para A y B, y «Reenviar bienvenida» en cada fila.

### Causa del rojo: bug de SL-41 en `lib/` (backend). NO lo toqué; paro aquí.
Log del dev server, al pulsar «Crear contraseña»:
```
⨯ ReferenceError: RequestContext is not defined
    at module evaluation (.next/dev/server/chunks/ssr/[root-of-the-server]__1k_st7_._.js:3373:5)
    at <unknown> (.next-internal/server/app/recuperar-contrasena/page/actions.js (server actions loader):1:1)
 POST /recuperar-contrasena 500 in 340ms
[browser] Uncaught ReferenceError: RequestContext is not defined   (lo pinta app/error.tsx)
```
- Origen: `lib/actions/password-reset.ts:23`, `export type { RequestContext };`. Es un re-export LOCAL de un import con
  `type` inline, dentro de un archivo `"use server"`. El transform de server actions de Turbopack (Next 16.2.10) lo trata
  como un export de runtime. En el chunk compilado la lista de exports validados es
  `[solicitarRecuperacion, verificarCodigoRecuperacion, restablecerContrasena, crearContrasenaConEnlace, RequestContext]`, y
  el módulo revienta al evaluarse.
- Alcance: cae el módulo ENTERO, no solo el enlace. Tampoco funcionan «Enviar código», «Verificar código» ni
  «Restablecer contraseña» de `/recuperar-contrasena`, que en `dc95473` sí iban (el `RequestContext` era una interfaz local).
  Los tests de vitest no lo ven: importan el módulo sin pasar por el compilador de Next. El typecheck tampoco.
- Contraste: `lib/actions/geografia.ts:55` usa `export type { … } from "…"` (re-export con `from`), y ese caso funciona.
- Arreglo propuesto (backend): borrar la línea 23. Nadie importa `RequestContext` desde `@/lib/actions/password-reset`
  (grep vacío). Si hace falta mantenerlo, `export type { RequestContext } from "@/lib/actions/_shared/contexto-peticion";`.
  Hay que volver a correr este E2E después: es el único test que pasa por el compilador real.

### Capturas de T10 (fuera del repo)
Las sacó un spec temporal, `e2e/zz-captura-sl41-temporal.spec.ts`: login del superadmin, alta de dos empresas desde el
formulario y clic en «Reenviar bienvenida» de una fila. Resultado `1 passed (7.4s)`, `CAP_EXIT=0`. El spec ya está BORRADO
y no se commitea. Su `afterAll` borró sus empresas.
- `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl41/capturas/t10-1-aviso-sin-correo.png`: página completa con la advertencia (R26: «Empresa creada, pero el correo de bienvenida no salió…» + «El correo no está configurado en este entorno.») y la columna «Bienvenida» con un botón en cada fila.
- `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl41/capturas/t10-1b-aviso-detalle.png`: solo el aviso.
- `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl41/capturas/t10-2-reenvio-sin-correo.png`: página completa tras el reenvío; bajo el botón de la fila, «No salió: el correo no está configurado.».
- `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl41/capturas/t10-2b-tabla-bienvenida.png`: solo la tabla, con la columna y el resultado.
- El aviso de «enviada» no se capturó: sin SMTP no sale.

### Limpieza
Dev server matado con `taskkill /T` (sin procesos `next` ni `playwright` del worktree vivos y «nada en 3000»). Borrados
`.next`, `test-results`, el spec temporal, `f-dev.log` (guarda los argumentos de las actions, con contraseñas y enlaces),
`f-pw.log`, `f-cap.log` y `f-lock.log`. `DROP DATABASE sl41_e2e`: queda solo `sl41_base`. `gate.lock` suelto.
`git status --porcelain` limpio en el worktree.

## Dónde queda (2026-10-23, cierre del día) y qué falta

Último commit de código: `284e328`. Gate local verde en `284e328` (`INIT_EXIT=0`). Las bases `sl41_*`
están borradas, no hay dev server vivo y el lock está suelto.

1. **T1, la propuesta de `/design`, espera la aprobación de Carlos.** Está en
   `specs/SL-41-plantillas-correo-bienvenida/maqueta/`:
   - `README.md`: la estructura, la tabla de contraste medida con `tests/fixtures/contraste.ts`,
     tamaños, los textos finales (asunto, preheader y bloques) y qué mirar en Gmail y Outlook;
   - `otp.html`, `bienvenida.html` y `bienvenida-sin-url.html`, renderizados con el
     `componerCorreo` real.

   El logo, con `src` absoluto a `{baseUrl}/brand/…`, no se ve al abrir los `.html` en local. Si
   Carlos cambia algo, se ajusta `lib/services/email/plantillas/plantilla-marca.ts`, se actualiza
   `design.md > 3.2` y `6.4`, y se cierra T1.
2. **BLOQUEANTE, encontrado en el E2E: `/recuperar-contrasena` da 500 con el dev server real.**
   - **Causa:** `lib/actions/password-reset.ts:23`, `export type { RequestContext };` dentro de un
     archivo `"use server"`. Turbopack lo trata como un export de valor y el módulo falla al
     cargarse con `ReferenceError: RequestContext is not defined`.
   - **Alcance:** caen las 4 actions de la pantalla, incluido el flujo por código, que en `dc95473`
     funcionaba.
   - **Por qué el gate no lo vio:** ni vitest ni el typecheck pasan por el compilador de Next.
   - **Arreglo:** borrar esa línea, porque nadie importa `RequestContext` desde ese módulo. Va con
     `backend_dev`.
   - **Después:** gate y repetir `pnpm exec playwright test e2e/superadmin-empresas.spec.ts`. Hoy
     da 4 passed, 1 failed (paso 5, el maestro A con el enlace) y 2 did not run.
   - **Antes del PR:** comprobar que ningún otro archivo `"use server"` de SL-41 reexporta tipos.
3. **T10:** las capturas están fuera del repo, en
   `scratchpad/sl41/capturas/t10-1-aviso-sin-correo.png`, `t10-1b-aviso-detalle.png`,
   `t10-2-reenvio-sin-correo.png` y `t10-2b-tabla-bienvenida.png`. El aviso de «enviada» solo se
   ve con SMTP. T10 se cierra cuando Carlos las vea.
4. **T12 y T13** quedan abiertas hasta que el E2E dé verde.
5. **Merge de `origin/dev`:** hoy `dev` sigue en `dc95473` y SL-40 no ha entrado. Cuando entre, hay
   que mergear y resolver los choques de `app/(app)/plataforma/empresas/page.tsx` y
   `EmpresasModule.tsx`.
6. **Hueco anotado:** dos mutaciones del foco al entrar en cada paso de `/recuperar-contrasena`
   sobreviven. No hay test de foco, y con `dc95473` tampoco lo había.

## Sesión 2026-10-24 (backend_dev): bloqueante, logo CID, merge de SL-40, T10, T12 y T13

### 1. Bloqueante de `/recuperar-contrasena` (commit `08c8ac2`)
- Borrada `export type { RequestContext };` de `lib/actions/password-reset.ts`. Nadie lo importaba
  desde ahí.
- Censo de los archivos `"use server"` de `lib/` y `app/`: ningún otro tiene una lista
  `export type { … }` ni `export { type … }` sin `from`. Los demás exports de tipo son
  declaraciones (`export type X = …`) o, en `lib/actions/geografia.ts`, una lista con `from`, que sí
  compila.
- Guardia nueva `tests/unit/guards/use-server-sin-reexport-de-tipos.guardia.test.ts`: control de
  no vacuidad, sin infractores, y una contraprueba con la línea original, la forma inline y la
  multilínea.
- **Mutación:** con la línea devuelta a `password-reset.ts` la guardia se pone roja
  (`1 failed | 2 passed`, infractor `lib/actions/password-reset.ts: export type { RequestContext }`).
  **Muere.**

### 2. T1 aprobada y logo incrustado (commit `cb16feb`)
**Aprobación:** Carlos Restrepo aprobó la maqueta el **2026-10-24**, con un cambio: el logo tiene
que verse, así que va como adjunto CID. Colores, tamaños y textos, sin cambios respecto a
`maqueta/README.md`.
- `public/brand/logo-correo.png`: 360 × 105 px, 6.806 bytes y fondo blanco aplanado. Sale del SVG
  de marca con `node scripts/generar-logo-correo.mjs`, que usa `sharp`, ya aprobada. El mismo
  script escribe sus bytes en base64 en `lib/services/email/plantillas/logo-correo.ts`. El correo
  no lee `public/` con `fs`: en Vercel ese archivo no viaja a la función (ver
  `outputFileTracingIncludes`).
- `EmailMessage.imagenesEnLinea?: ImagenEnLinea[]`, la ampliación mínima del contrato.
  `NodemailerEmailSender` las manda como `attachments` con `cid`, `encoding: "base64"` y
  `contentDisposition: "inline"`.
- `componerCorreo`: la cabecera pinta `<img src="cid:logo@servilogistic" … width="180">` y el
  mensaje lleva el adjunto. **R4 se mantiene:** sin `baseUrl`, la cabecera sigue siendo de texto y
  el mensaje no lleva adjunto.
  - **Abierto para Carlos:** el logo ya no depende de la URL, así que R4 podría relajarse para que
    el OTP lleve logo también sin `NEXT_PUBLIC_APP_URL`. No se toca sin su OK.
- Maqueta regenerada: `otp.html` y `bienvenida.html` llevan el mismo PNG en data URI, solo para la
  vista previa local. Comprobado con Chromium: `img.complete=true`, `naturalWidth=360`, pintado a
  180. Captura en
  `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl41/capturas/t1-otp-logo.png`.
- Tests:
  - `plantilla-marca.test.ts`: `cid:` en la cabecera, ningún `src` remoto, un adjunto PNG con
    firma válida por cada `cid:` y ninguno sin `baseUrl`;
  - `logo-correo.test.ts`: los bytes son los de `public/brand/logo-correo.png`, sha256, 360 px y
    menos de 20 KB;
  - `nodemailer-email-sender.test.ts`: el adjunto `inline` y nada cuando no hay imágenes;
  - `email-notificacion.test.ts`: el OTP con `cid:`.
- **Mutaciones:**
  - quitar el adjunto en `componerCorreo` da 2 rojos: **muere**;
  - añadir un byte al PNG da rojo en `logo-correo.test.ts`: **muere**.
- `design.md > 3.2` y `> 12 (A6)`, y `maqueta/README.md`, actualizados.
- `.env.example`: `NEXT_PUBLIC_APP_URL` también arma los enlaces de los correos. El valor de
  producción es `https://servilogistic.co`. El dominio no está en el código.

### 3. Merge de `origin/dev` (`87269af`, SL-40), commit `4859471`
- Choques en `page.tsx`, `EmpresasModule.tsx`, `empresas-module.test.tsx` y
  `empresas-page.test.tsx`. Se resolvieron sumando los dos lados:
  - `Promise.all` con pendientes y cobro global;
  - props de las dos features;
  - la tabla con «Cobro por orden» y «Bienvenida».
- `tests/components/EmpresasModuleCobro.test.tsx`, de SL-40, recibe `reenviarBienvenida` y
  `bienvenidaPendiente: []`.
- Typecheck en 0. Pasan los 18 tests de `EmpresasModuleCobro` y los 131 de los archivos fusionados
  y de correo.

### 4. T12, el E2E (base desechable `sl41_e2e2`, borrada al terminar)
Antes de arrancar, el puerto 3000 estaba libre. Se ejecutaron `migrate deploy` y el seed, y se
levantó `pnpm dev` sin `SMTP_*`, con `AUTH_OTP_DEBUG_LOG=1` y
`NEXT_PUBLIC_APP_URL=http://localhost:3000`.
```
  ok 1 › 1. «Empresas» abre en el estado vacío (R29) (1.1s)
  ok 2 › 2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29) (1.4s)
  ok 3 › 3. repetir el slug, el email o el documento de A marca su campo y no crea nada (R31, R32, R33) (4.0s)
  ok 4 › 4. un slug inválido marca el campo sin crear nada (R34) (1.1s)
  ok 5 › 5-6. el maestro de A crea su contraseña con el enlace de bienvenida, «Empresas» le da 404 y no la ve (R18, R19, R35) (3.2s)
  ok 6 › 5-6. el maestro de B crea su contraseña con «¿Olvidaste tu contraseña?», «Empresas» le da 404 y no la ve (R18, R19, R35) (2.6s)
  ok 7 › 7. con las dos contraseñas creadas, ninguna fila ofrece «Reenviar bienvenida» (R38) (339ms)
  7 passed (24.4s)   PW_EXIT=0
```
- Log del dev server: `500s=0` y ningún `is not defined`.
- El servidor se mató («nada en 3000») y se borraron `.next`, `test-results` y el log, que guarda
  contraseñas y enlaces.

### 5. T10
Pasan los tests de componente: `empresas-module.test.tsx`, `reenviar-bienvenida-boton.test.tsx` y
`EmpresasModuleCobro.test.tsx`. Las capturas están en «Capturas de T10». La revisión visual de
Carlos queda a su criterio; no bloquea.

### 6. T13, el gate final (dentro del lock, base desechable `sl41_base`, que se recreó con `migrate deploy` y el seed y se borró al terminar)
Comando: `TEST_RAPIDO_BASE=origin/dev ./init.sh`. Log:
`C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl41-gate-final.log`.
```
✓ typecheck paso
✓ lint paso
 Test Files  461 passed (461)      Tests  6258 passed | 26 skipped (6284)
 Test Files  303 passed (303)      Tests  4137 passed | 1 skipped (4138)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
== init OK ==
INIT_EXIT=0
```
El primer intento dio `INIT_EXIT=1`: `sl41_base` no existía (se había borrado el 2026-10-23) y los
tests de integración se quedaron colgados 120 s cada uno. Se cortó, se recreó la base y se repitió.
No fue un rojo del código.

**Veredicto:** SL-41 lista para revisión. T0–T15 cerradas, cada R1–R40 con su test, E2E con 7
passed y gate con `INIT_EXIT=0`.

## Vuelta 2: corrección del rechazo de la revisión (frontend_dev, 2026-10-24)

Rechazo: `progress/review_SL-41.md` (H1 bloqueante; m1, m2 y m3 menores). Head de partida `3e0aa6b`.
MCP del grafo: no lo usé; Grep/Read sobre el worktree.

### Qué se corrigió
1. **H1 (R19).** `RecuperarContrasenaForm.tsx`: un `validation_error` con `fieldErrors.enlace` en
   modo enlace pasa al estado `enlaceInvalido` («El enlace no es válido o ya venció.» y «Pedir un
   código por correo»), igual que `invalid_or_expired`. Los errores de `password`/`confirmPassword`
   siguen pintándose en su campo.
2. **m3 (texto de éxito).** En modo enlace: «Contraseña creada / Tu contraseña se creó
   correctamente. Ya puedes iniciar sesión con ella.». El flujo de recuperación conserva «Contraseña
   actualizada / se restableció». El E2E (`e2e/superadmin-empresas.spec.ts`, paso del enlace) espera
   ahora «Contraseña creada»; el del código, «Contraseña actualizada».
3. **m2 («Reenviar» que falla).** Si `sender.enviar` LANZA, `BienvenidaMaestroService` llama a
   `PasswordResetService.anularEnlaceBienvenida(enlace)` (nuevo; consume el desafío recién emitido
   con `consumirSiActivo`) y relanza. Como el canje exige que el enlace sea el último activo (R22) y
   `findLatestActiveByUsuarioId` excluye los consumidos, el enlace anterior vuelve a valer. Si anular
   falla, se ignora y manda el error del envío (sigue `no_enviada`, R23).
   **`sin_correo` se deja como está, a propósito:** sin SMTP el emisor de consola ES la entrega
   (en local y en el E2E el enlace se lee del registro con `AUTH_OTP_DEBUG_LOG=1`). No falló nada;
   anular ahí rompería ese camino. La UI ya dice «No salió: el correo no está configurado.», y en un
   entorno sin SMTP no hay bienvenida previa que haya salido por correo. Cortar antes de emitir con
   `smtpConfigurado=false` rompería el E2E y el desarrollo local por la misma razón.
4. **m1 → R4 (decisión del leader, 2026-10-24).** El logo por CID va siempre, con o sin
   `NEXT_PUBLIC_APP_URL`. `CorreoDeMarca` ya no tiene `baseUrl` (la plantilla no lo usaba para nada
   más); `componerCorreo` adjunta siempre el logo; el OTP ya no lee `baseUrlDeLaApp()`. La
   bienvenida sigue necesitando la URL para su enlace (R23, R40). `requirements.md` (R4 y R40) y
   `design.md` llevan la nota con la fecha.

### Archivos modificados
- `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx`
- `lib/interfaces/services/IPasswordResetService.ts`, `lib/services/PasswordResetService.ts`,
  `lib/services/BienvenidaMaestroService.ts`
- `lib/services/email/plantillas/plantilla-marca.ts`, `otp-codigo.ts`, `bienvenida-maestro.ts`
- `specs/SL-41-plantillas-correo-bienvenida/requirements.md`, `design.md`
- Tests: `tests/integration/recuperar-contrasena-enlace.test.tsx`,
  `tests/unit/services/bienvenida-maestro-service.test.ts`, `tests/unit/password-reset-enlace.test.ts`,
  `tests/integration/db/enlace-bienvenida.test.ts`, `tests/unit/services/email/plantilla-marca.test.ts`,
  `tests/unit/services/email-notificacion.test.ts`, `e2e/superadmin-empresas.spec.ts`, y el método
  nuevo en los dobles de `tests/unit/auth/empresa-de-la-peticion.test.ts`,
  `tests/unit/password-reset-actions.test.ts` y `tests/unit/password-reset-enlace-action.test.ts`.

### Mapa R → test (lo que cambió)
| Requisito | Test |
|---|---|
| R19 (enlace mal formado) | `recuperar-contrasena-enlace.test.tsx` > «con validation_error del ENLACE (mal formado) muestra el genérico…» |
| R18 / m3 (texto de éxito por flujo) | `recuperar-contrasena-enlace.test.tsx` > «con ok envía el enlace…» (creada) y `recuperar-contrasena-form.test.tsx` (actualizada) |
| R22 / m2 (envío fallido no rompe el anterior) | `bienvenida-maestro-service.test.ts` > «falla el SMTP: anula el enlace recién emitido…» y «…también anular…»; `password-reset-enlace.test.ts` > «anularEnlaceBienvenida»; Postgres: `enlace-bienvenida.test.ts` > «m2: anular el enlace nuevo devuelve el valor al anterior…» |
| R24 / m2 (`sin_correo` no anula) | `bienvenida-maestro-service.test.ts` > «R24 — el correo pasa por el emisor (de consola)…» |
| R4 (nuevo) | `plantilla-marca.test.ts` > «el logo siempre, sin depender de la URL base (R4)»; `email-notificacion.test.ts` > «R4 — sin URL base el OTP lleva el logo por CID…» |

### Mutaciones (script `scratchpad/sl41fix/mut.mjs`, con autocomprobación en verde antes; restaura byte a byte)
```
BASE sin mutar: exit=0
H1: sin mapear fieldErrors.enlace al genérico: exit=1 failed=1 -> MUERE
m3a: éxito siempre con el texto de recuperación: exit=1 failed=1 -> MUERE
m3b: éxito siempre con el texto de creación: exit=1 failed=1 -> MUERE
m2a: el envío fallido no anula el enlace nuevo: exit=1 failed=1 -> MUERE
m2b: anular deja escapar su propio error: exit=1 failed=1 -> MUERE
m2c: anularEnlaceBienvenida no consume: exit=1 failed=1 -> MUERE
R4a: cabecera de texto en vez del logo: exit=1 failed=4 -> MUERE
R4b: sin adjuntar el logo: exit=1 failed=3 -> MUERE
```
BD (base desechable `sl41f_base`, dentro del lock): `enlace-bienvenida.test.ts` 9/9 en verde, ninguno
saltado. Mutación «anular consume otro id»: `1 failed | 8 passed` → MUERE. Restaurado.

### Tests tocados (sin la suite completa)
13 archivos (formulario, enlace, servicio, plantillas, actions, guardia `html-lang`): `Test Files 13
passed`, `Tests 159 passed`, EXIT=0.

### Gate (dentro de `gate.lock`, owner `frontend-SL-41-fix`; base `sl41f_base`, borrada al terminar)
Comando: `TEST_RAPIDO_BASE=origin/dev ./init.sh`. Log: `scratchpad/sl41-gate-fix.log` (URLs enmascaradas).
```
✓ typecheck paso
✓ lint paso
 Test Files  461 passed (461)      Tests  6264 passed | 26 skipped (6290)
 Test Files  303 passed (303)      Tests  4137 passed | 1 skipped (4138)
✓ test:rapido paso
✓ todas las migraciones tienen down.sql
== init OK ==
INIT_EXIT=0
```

**Veredicto:** H1, m2, m3 y R4 corregidos, cada uno con su test y su mutación muerta; gate con `INIT_EXIT=0`.
