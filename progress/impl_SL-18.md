# SL-18 — bitácora de implementación

## Tanda 1: únicos de `usuario` (R1–R5) — 2026-10-26, backend_dev

Base: `servi_logistic_sl18` (local, `localhost:5432`, Postgres 16.1, propia de la feature; la URL se
exporta por comando, sin `.env` en el worktree). `prisma migrate deploy` aplicó todas las
migraciones de la rama más la nueva. Sin `db:seed`: los tests de la tanda crean sus datos.

### Archivos

Creados:
- `db/migrations/20261026090000_usuario_unico_por_empresa/migration.sql` (encima de
  `20261025160100_entorno_marca`, la última de la rama)
- `db/migrations/20261026090000_usuario_unico_por_empresa/down.sql`
- `tests/integration/db/usuario-unico-por-empresa.test.ts`

Modificados:
- `db/schema.prisma` (`Usuario`: fuera `@unique` de `email`/`cedula`; `@@unique` con `map` y `@@index([email])`, cuyo nombre por defecto es `usuario_email_idx`)
- `lib/interfaces/repositories/IUserRepository.ts` (`CuentaPublica`, `CuentaConHash`; fuera `UsuarioConHash`, `findByEmail`, `findByEmailWithHash`)
- `lib/repositories/UserRepository.ts` (`findCuentasPorEmail`, `findCuentasPorEmailConHash`)
- `lib/repositories/PostulacionRepository.ts` (`findFirst`)
- `lib/services/AuthService.ts` (ajuste mínimo PROVISIONAL hasta T2.2)
- `lib/services/PasswordResetService.ts` (ajuste mínimo PROVISIONAL hasta T3.2)
- `tests/integration/db/aislamiento-usuarios.test.ts`, `unicos-por-empresa.test.ts`, `organizacion-alta.test.ts`
- Dobles de unit: `tests/unit/repositories/user-repository.test.ts`, `tests/unit/services/{auth-service,postulacion-login-regresion,usuario-zona,usuario-vehiculo,usuario-service,usuario-service-superadmin,usuario-restablecer-contrasena,usuario-impacto-zona,nombres-que-imprime-la-etiqueta,otp-challenge-issuer}.test.ts`, `tests/unit/services/email/correos-sin-secretos.test.ts`, `tests/unit/{password-reset-service,password-reset-enlace}.test.ts`, `tests/unit/actions/password-reset-degrada-a-consola.test.ts`, `tests/unit/guards/379-maestro-sin-bloqueo.guardia.test.ts`

### Decisiones

- **Forma de la cuenta** (design §3.1 no fija los nombres): `CuentaPublica = { id, email, estado,
  organizacionId, rol: RolValue, empresaNombre: string | null }`; `CuentaConHash` suma
  `passwordHash`. `rol` y `empresaNombre` salen aplanados de `rol.value` y `organizacion.nombre`.
- **El orden se aplica en el repositorio**, no en el `orderBy`: Prisma no fija dónde caen los NULL
  al ordenar por una relación, y la de plataforma tiene que ir al final. Son 1 o 2 filas.
  `localeCompare(..., "es")`.
- **Llamadores provisionales**: `AuthService.login` y `PasswordResetService` toman la PRIMERA cuenta
  del orden (`const [usuario = null] = ...`), con comentario «PROVISIONAL hasta T2.2/T3.2». Con
  una sola cuenta por email, el comportamiento es el de antes.
- **R3 y R4 sobre un clon de `usuario`** (patrón de SL-17 T3.9): en la tabla real, dos cuentas sin
  empresa chocan antes con `usuario_un_solo_superadmin` (SL-32, OID anterior), y no se ve si el
  `NULLS NOT DISTINCT` del email hace lo suyo. En la tabla real queda el caso visible de R3: el
  superadmin entra con el email y la cédula de A, y la segunda cuenta sin empresa da P2002.
- **R5, `campo` del `conflict`**: la cuenta sintética repite email Y cédula; cuál salta primero
  depende del orden de los índices (OID). Medido: tras recrear `usuario_email_key` en la mutación,
  salía `cedula`. El test fija `status: "conflict"` y `campo ∈ {email, cedula}`.
- **`organizacion-alta.test.ts`**: los dos casos «R46/R36: email/documento ya usado → conflicto y
  revierte» pasan a «SL-18 R1: el alta se crea». La empresa nueva no tiene a nadie, así que el
  P2002 de esos índices ya no puede darse en un alta. `campoDuplicado` queda como defensa.
- **R2 «se edita»**: `UpdateUsuarioData` no admite email ni cédula (Decisión 5), así que no hay
  edición de esos campos que probar. R2 se prueba en el alta.

### Mapa R → test

| R | Archivo | Caso |
|---|---|---|
| R1 | `tests/integration/db/usuario-unico-por-empresa.test.ts` | «R1: el mismo email y la misma cedula se crean en A y en B, cada cuenta en su empresa» |
| R1 | `tests/integration/db/aislamiento-usuarios.test.ts` | «SL-18 R1 (antes R36): un usuario de B con el email / la cédula de un usuario de A se crea en B» (2) |
| R1 | `tests/integration/db/unicos-por-empresa.test.ts` | «por empresa — usuario_email_key / usuario_cedula_key: dos empresas conviven…» (2) |
| R1 | `tests/integration/db/organizacion-alta.test.ts` | «SL-18 R1 (antes R46/R36): un email / documento ya usado en OTRA empresa no impide el alta» (2) |
| R2 | `usuario-unico-por-empresa.test.ts` | «R2: el email repetido en la MISMA empresa da UsuarioDuplicadoError('email') y no escribe»; «R2: la cedula repetida … UsuarioDuplicadoError('cedula') …» |
| R3 | `usuario-unico-por-empresa.test.ts` | «R3: el superadmin (sin empresa) entra con el email y la cedula de una cuenta de A; una segunda cuenta sin empresa con ese email da P2002»; clon: «R3: dos cuentas SIN empresa con el mismo email chocan en usuario_email_key», «… misma cedula … usuario_cedula_key» |
| R4 | `usuario-unico-por-empresa.test.ts` | «R4: sin repetidos, down.sql deja los dos unicos globales…»; «R4: con un email repetido entre empresas, down.sql aborta nombrando usuario_email_key y no cambia nada»; «R4: con la cedula repetida tambien, el mensaje nombra los dos indices…» |
| R5 | `usuario-unico-por-empresa.test.ts` | «R5: la key «tienda-x» se crea en A y en B; repetida en A responde `conflict` y no escribe» |
| §3.1 | `tests/unit/repositories/user-repository.test.ts` | «SL-18: findCuentasPorEmailConHash busca por email sin empresa y expone el hash»; «…ordenadas por nombre de empresa y la de plataforma al final»; «findCuentasPorEmail no selecciona passwordHash (R7)…»; «sin cuentas … lista vacia» |

### `prisma migrate diff`

`pnpm exec prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` contra
`servi_logistic_sl18`, tras el deploy y otra vez tras restaurar la mutación:
`-- This is an empty migration.`

### Mutación (T1.4)

En `servi_logistic_sl18`: `DROP INDEX "usuario_email_key"; CREATE UNIQUE INDEX "usuario_email_key" ON "usuario" ("email") NULLS NOT DISTINCT;`
(sin `organizacion_id`).
- `vitest run usuario-unico-por-empresa.test.ts -t R1` → **rojo**: `× R1: el mismo email y la
  misma cedula se crean en A y en B…` con `UsuarioDuplicadoError: El campo email ya esta en uso
  por otro usuario` (`mapDuplicadoError lib/repositories/UserRepository.ts:682`). `Tests 1 failed | 10 skipped (11)`.
- Restaurado el índice compuesto. Después se recreó también `usuario_cedula_key` para volver al
  orden de la migración. Resultado: el archivo entero queda **verde**, `Tests 11 passed (11)`, y el
  drift vacío.

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, exit 0, sin errores.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run lint` → exit 0: `✖ 231 problems (0 errors, 231
  warnings)`, ninguno en archivos de esta tanda. Sin `NODE_OPTIONS`, eslint muere sin memoria en
  esta máquina, y el primer reintento cayó con un crash nativo (exit 3221226505). El segundo pasó.
- Unit tocados (17 archivos): `Test Files 17 passed (17)`, `Tests 203 passed (203)`.
- Integración (con `DATABASE_URL` → `servi_logistic_sl18`, `--reporter=verbose`):
  `usuario-unico-por-empresa`, `aislamiento-usuarios`, `unicos-por-empresa`, `organizacion-alta`
  → `Test Files 4 passed (4)`, `Tests 63 passed (63)`, 0 skipped (contado en el log: 63 ✓, 0 ↓/×).
- Guardias (`pnpm run test:guardias`): `Test Files 1 failed | 312 passed (313)`, `Tests 4 failed |
  4342 passed | 1 skipped`. El único rojo es `dependencias-declaradas-presentes.guardia.test.ts`
  («init.sh ya no tiene el marcador >>> FIN PASO 2…»). Está en `tests/baseline-rojos.json`; no es
  de esta tanda.
- `vitest related --run` sobre los 5 archivos de `lib/` cambiados (abarca 382 archivos):
  `Test Files 54 failed | 327 passed (382)`, `Tests 43 failed | 4451 passed | 330 skipped`. 41 de los
  archivos rojos están en `tests/baseline-rojos.json`. Los otros 13 cayeron porque el servidor
  Postgres local entró en recuperación a mitad de la corrida (`el sistema de base de datos está en
  modo de recuperación`, `ECONNRESET`, timeouts).
- Esos 13 se volvieron a correr en serie (`--no-file-parallelism`): `Test Files 1 failed | 12 passed
  (13)`, `Tests 40 passed | 11 skipped (51)`. El único rojo es `demo-qa.test.ts`. Falla en el
  `beforeAll` con «SL-44 E2E: faltan catálogos en la base (corre `pnpm run db:seed`): vehiculo: moto,
  carro, camion», porque la base de la feature no tiene seed, y sus 11 casos quedan skipped. No
  viene de esta tanda.

### Veredicto

Tanda 1 implementada; R1–R5 con test en verde contra Postgres real, mutación anotada y drift vacío.

### Re-verificación del implementer (2026-10-26)

Diff revisado contra T1.1–T1.5 y design §2 M1 / §3.1: coincide. Sin restos de `findByEmail`,
`findByEmailWithHash` ni `UsuarioConHash` en `lib/`, `app/`, `tests/`, `e2e/` ni `scripts/`.
Todo contra `servi_logistic_sl18`:
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → exit 0.
- `pnpm run lint` (con el mismo `NODE_OPTIONS`) → exit 0, `231 problems (0 errors, 231 warnings)`.
- Unit modificados (`git diff --name-only -- tests/unit`, 16 archivos): `Test Files 16 passed (16)`,
  `Tests 197 passed (197)`. Además `postulacion-repository.test.ts` + `postulacion-sin-empresa.test.ts`:
  `2 passed`, `13 passed`.
- `prisma migrate status`: up to date. `prisma migrate diff`: `-- This is an empty migration.`
- Integración en serie (`--no-file-parallelism`), dos corridas seguidas: las dos `Test Files 4 passed (4)`,
  `Tests 63 passed (63)`.
- `down.sql` sobre la tabla real (sin repetidos) → `usuario_email_key (email)` y
  `usuario_cedula_key (cedula)` globales, `usuario_email_idx` fuera; `migration.sql` de nuevo →
  `(organizacion_id, email|cedula) NULLS NOT DISTINCT` + `usuario_email_idx (email)`. El caso que
  aborta con repetidos lo cubre el test R4 sobre el clon.
- Mutación (`usuario_email_key` sin `organizacion_id`): el archivo entero sale en rojo, incluido
  `× R1: el mismo email y la misma cedula se crean en A y en B…` (también R3, R5, control y R4 del
  clon, que comparan contra la forma del índice). Restaurado: `Tests 11 passed (11)`, drift vacío.
- No corridos aquí (los corre el leader): `./init.sh`, guardias, `vitest related` completo.

### Fix tras el gate (2026-10-26)

`pnpm run typecheck` del gate incluye `e2e/`: `e2e/superadmin-arranque.spec.ts(63,5) TS2322` por un
`usuario.findUnique({ where: { email } })`. Pasa a `findFirst` con `{ email, organizacionId: null }`
(el superadmin es la cuenta sin empresa, R3). Grep multilínea sin más `findUnique`/`upsert`/`update`/
`delete` por email o cédula en `lib`, `app`, `tests`, `e2e`, `scripts`, `db`.
`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 `error TS`. El E2E no se corrió.

## Tanda 2: login (R6–R15)

2026-10-26, backend_dev. Base `servi_logistic_sl18` (local, `localhost:5432`). La URL se exporta por
comando, sin `.env` en el worktree. SLT-32 no está en `dev` (`puedeIniciarSesion` no existe en
`lib/`), así que el predicado va inline en una sola función con el comentario de design §9.

### Archivos

Creados:
- `tests/unit/services/auth-service-empresas.test.ts`
- `tests/integration/actions/login-varias-empresas.test.ts`

Modificados:
- `lib/types/auth.ts` (T2.1): `loginInputSchema` suma `organizacionId` (uuid, nullable, opcional) y
  pasa a `.strict()`. Nuevos `EmpresaParaElegir` y `NOMBRE_EMPRESA_PLATAFORMA = "Plataforma"`.
  `LoginResult` suma `elegir_empresa`.
- `lib/interfaces/services/IAuthService.ts` (T2.1): `LoginCommandInput.organizacionId?: string | null`;
  `LoginCommandResult` suma `elegir_empresa`.
- `lib/services/AuthService.ts` (T2.2): `login` según design §3.2, pasos 1–8. Se quita la marca
  PROVISIONAL. El predicado `puedeIniciarSesion` es una función del módulo, no exportada, con
  `// SLT-32: puedeIniciarSesion`, y usa `esPlataforma` de `lib/auth/plataforma.ts`.
  `verifyChallenge` y `logout` no cambian.
- `lib/actions/auth.ts` (T2.3): `case "elegir_empresa"` devuelve las empresas tal cual, sin cookie.
  `organizacionId` llega al servicio por el spread de `parsed.data`. Se corrige el comentario de
  SL-17, que ya no dice «único global».
- `tests/unit/services/auth-service.test.ts`: solo el comentario de cabecera. Los dobles ya usaban
  `findCuentasPorEmailConHash` desde T1.3, y todos los casos (una cuenta) siguen en verde.
- `tests/unit/types/auth-schemas.test.ts`: 2 casos nuevos (uuid, null o texto; `.strict()`).
- `tests/integration/actions/auth-action.test.ts`: 1 caso nuevo (pasa `organizacionId` y propaga
  `elegir_empresa` sin cookie).

`app/`: no se tocó. `LoginForm.tsx` compila porque su `switch` no es exhaustivo. Hoy `elegir_empresa`
no hace nada en la pantalla (ni mensaje ni redirección) hasta T7.1/SLT-41.

Llamadores revisados (grep en `app`, `components`, `lib`, `tests`, `e2e`, `scripts` y `db`):
`LoginForm.tsx`, `LogoutButton.tsx`, `auth-action.test.ts`, `empresa-de-la-peticion.test.ts`,
`auth-schemas.test.ts`, `LoginForm.test.tsx` y los `vi.mock("@/lib/actions/auth")` de componentes.
Ninguno necesitó cambios para tipar.

### Mapa R → test

| R | Archivo | Caso |
|---|---|---|
| R6 | `tests/unit/services/auth-service-empresas.test.ts` | «R6: la contrasena vale en una sola cuenta habilitada → sesion de esa cuenta; con riesgo alto, OTP de esa cuenta» |
| R7 | `auth-service-empresas.test.ts` | «R7: la contrasena vale en dos o mas cuentas → elegir_empresa en el orden del repositorio, «Plataforma» con null, sin escrituras» |
| R7 | `tests/integration/actions/login-varias-empresas.test.ts` | «R7: sin elegir, la respuesta es elegir_empresa con A y B por nombre, y no se escribe nada» |
| R8 | `auth-service-empresas.test.ts` | «R8: la lista excluye la cuenta con otra contrasena, la inactiva y la bloqueada» |
| R9 | `auth-service-empresas.test.ts` | «R9: sin cuentas, o sin ninguna contrasena valida → invalid_credentials igual en los dos casos; un fallo por cuenta no bloqueada, o uno sin cuenta» |
| R10 | `auth-service-empresas.test.ts` | «R10: la contrasena vale en A → ningun fallo registrado en B, donde no vale» |
| R11 | `auth-service-empresas.test.ts` | «R11: con empresa elegida se evalua solo esa cuenta; con una empresa sin cuenta del email → invalid_credentials» |
| R11 | `login-varias-empresas.test.ts` | «R11: con B elegida, la cookie es de una sesion de la cuenta de B; con una empresa sin cuenta del email, invalid_credentials» |
| R11 | `tests/unit/types/auth-schemas.test.ts` | «SL-18 R11: organizacionId acepta un uuid o null (plataforma) y rechaza otro texto» |
| R12 | `auth-service-empresas.test.ts` | «R12: todas las cuentas bloqueadas → account_locked; la contrasena solo vale en cuentas no habilitadas → account_unavailable» |
| R13 | `login-varias-empresas.test.ts` | «R13: con la cookie de esa sesion, empresaDeLaPeticion() es B y el listado de usuarios no trae los de A» |
| R14 | `login-varias-empresas.test.ts` | «R14: con riesgo alto y B elegida, el OTP del desafio abre la sesion de la cuenta de B, no la de A» |
| R15 | `auth-service-empresas.test.ts` | «R15: una cuenta sin empresa que no es la de plataforma nunca es opcion ni abre sesion» |
| R7, R11 (action) | `tests/integration/actions/auth-action.test.ts` | «SL-18 R7, R11: pasa organizacionId al servicio y devuelve elegir_empresa tal cual, sin cookie» |

El test de integración usa la action real con `AuthService`, los repositorios reales sobre
`getPrismaClient()` (cliente extendido con el resolutor `empresaDeLaPeticion`) y el `RiskEngine`
real. Solo hay dobles en `next/headers` (la cookie) y en `IEmailProvider` (para leer el OTP).
- R11, con riesgo bajo, siembra un `trusted_device` y un intento exitoso de la cuenta de B.
- R14 entra con otro UA y otra IP (40 + 30 ≥ 50).

Los datos se commitean con sufijo y se borran en `afterAll`, bajo `bajoLockDeEscrituraReal`.

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 `error TS`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run lint` → exit 0, `✖ 231 problems (0 errors, 231
  warnings)`, igual que en Tanda 1. Ninguno está en archivos de esta tanda.
- Tests tocados, en serie (`--no-file-parallelism`) contra `servi_logistic_sl18`:
  `auth-service-empresas`, `auth-service`, `auth-action`, `auth-schemas`, `empresa-de-la-peticion` y
  `login-varias-empresas` → `Test Files 6 passed (6)`, `Tests 65 passed (65)`, 0 skipped.
- `pnpm exec vitest related --run lib/services/AuthService.ts lib/types/auth.ts
  lib/interfaces/services/IAuthService.ts lib/actions/auth.ts` (sin `DATABASE_URL`) → `Test Files 76
  passed | 2 skipped (78)`, `Tests 849 passed | 41 skipped (890)`. Los 2 archivos skipped necesitan
  base; el de esta tanda se corrió aparte con base (punto anterior).
- `pnpm run test:guardias` → `Test Files 1 failed | 310 passed | 2 skipped (313)`, `Tests 4 failed |
  4323 passed | 20 skipped`. El único rojo es `dependencias-declaradas-presentes.guardia.test.ts`, el
  mismo de Tanda 1, que está en `tests/baseline-rojos.json`.

### Mutación (T2.2)

- **M1 (R10).** Antes de `if (validas.length === 0)`, se registra `password_incorrecta` en cada cuenta
  no bloqueada donde la contraseña no vale. `auth-service-empresas.test.ts` → `Tests 6 failed | 2
  passed (8)`. Cae `× R10: la contrasena vale en A → ningun fallo registrado en B…`, y también R6, R8,
  R9, R11 y R12, que cuentan intentos.
- **M2 (R8).** `elegibles` se calcula desde `noBloqueadas` en vez de `validas`, es decir, se ofrecen
  empresas sin validar la contraseña. → `Tests 4 failed | 4 passed (8)`. Cae `× R8: la lista excluye
  la cuenta con otra contrasena…`, y también R6, R10 y R12.
- Restaurado: el `diff` contra la copia sale idéntico, y los 6 archivos vuelven a `Tests 65 passed (65)`.

### Desviaciones y puntos abiertos

- **`riskReason` en R15.** El paso 6 de design §3.2 registra `estado_no_activo:<estado>` en la primera
  cuenta válida. Si una cuenta sin empresa y sin rol de superadmin está `activo` (R15, defensivo,
  porque el CHECK `usuario_empresa_o_superadmin` lo impide en la base), el texto queda
  `estado_no_activo:activo`. Se dejó como dice el design. Si se quiere otro motivo (p. ej.
  `sin_empresa`), lo deciden spec o leader.
  **Resuelto el 2026-10-26** (Camilo): el motivo es `sin_empresa`. Design §3.2 paso 6 revisado y
  aserción en el caso R15 de `auth-service-empresas.test.ts` (`b0bf091`). Mutación (volver a
  `estado_no_activo:` siempre) → R15 en rojo, 1 de 8; restaurado → 20/20 con `auth-service.test.ts`.
- **Cuentas bloqueadas solo en parte.** Si hay cuentas bloqueadas y en las demás la contraseña no
  vale, la respuesta es `invalid_credentials`, porque R9 habla de «cuentas no bloqueadas». Solo con
  TODAS bloqueadas sale `account_locked` (R12). Así lo dicen R9, R12 y design §3.2.
- **`NOMBRE_EMPRESA_PLATAFORMA`** vive en `lib/types/auth.ts` para que T3.1 (la plantilla de
  recuperación) reutilice el mismo texto.
- `LoginForm` no se tocó: `elegir_empresa` no muestra nada hasta T7.1.

### Veredicto

Tanda 2 implementada: R6–R15 tienen test (unit e integración contra Postgres real), las mutaciones dan
rojo y se restauraron, y typecheck y lint están en verde.

## Tanda 3: recuperar contraseña (R16–R21)

2026-10-26, backend_dev. Base `servi_logistic_sl18` (local, `localhost:5432`). Restricción del leader:
no se toca `app/` (las pantallas son T7.2).

### Archivos

Creados:
- `lib/services/email/plantillas/recuperar-contrasena.ts` (T3.1). Usa `componerCorreo` y pone un botón
  por cuenta con el nombre de su empresa. La cuenta sin empresa sale como `NOMBRE_EMPRESA_PLATAFORMA`
  (importado de `lib/types/auth.ts`, sin copiarlo). El asunto es «Recupera tu acceso a Servi Logistic»:
  no lleva «contraseña» ni enlaces, porque lo prohíbe SL-41 R11.
- `tests/unit/services/email/recuperar-contrasena.test.ts`
- `tests/unit/password-reset-por-empresa.test.ts`
- `tests/integration/actions/recuperar-por-empresa.test.ts`

Modificados:
- `lib/services/PasswordResetService.ts` (T3.2), según design §4.1:
  - Se quitan la marca PROVISIONAL (`cuentaProvisional`), `verificarCodigo`, `restablecer` y
    `codigoCoincideConDesafioActivo`.
  - `solicitar` recorre todas las cuentas de `findCuentasPorEmail`. Para cada una que esté bajo el
    límite emite un enlace con `DEVICE_HASH_RECUPERACION` y TTL `OTP_TTL_MINUTES`. Después envía un
    solo correo, o ninguno si no hubo enlaces.
  - Sin URL base no emite nada y avisa sin el email. Si el envío falla, anula los enlaces emitidos
    (`consumirSiActivo`), registra solo `causa=<nombre del error>` y responde `ok`.
  - `emitirEnlace(usuarioId, marca, ttlMs, ip)` es privado. `emitirEnlaceBienvenida` y
    `anularEnlaceBienvenida` quedan como envoltorios con la misma firma.
  - El canje acepta las dos marcas, bienvenida y recuperación (`MARCAS_DE_ENLACE`). Los pasos 5 y 8
    no cambian.
  - El constructor cambia: el 3.er argumento era `OtpChallengeIssuer` y ahora es `CorreoDeRecuperacion`
    (`{ sender, baseUrl, contacto? }`). `ResetOtpRepo` ya no pide `markConsumed`.
- `lib/interfaces/services/IPasswordResetService.ts`: se quitan `verificarCodigo`, `restablecer`,
  `VerificarCodigoInput` y `RestablecerInput`. `SolicitarResetInput.deviceHash` se queda, porque es la
  firma de design §4.1, pero la fila ya no lo guarda.
- `lib/types/password-reset.ts`: se quitan `verifyResetCodeSchema`, `resetPasswordSchema`, sus tipos de
  entrada y el import de `OTP_CODE_LENGTH`. Se quedan `VerifyResetCodeResult` (lo usa el envoltorio, y
  el `switch` del formulario necesita sus tres casos para compilar) y `ResetPasswordResult`.
- `lib/actions/password-reset.ts` (T3.3): `verificarCodigoRecuperacion` y `restablecerContrasena`
  quedan como **envoltorios de transición** `(...ignorados: unknown[])`. No tocan servicio ni base,
  responden siempre `{ status: "invalid_or_expired" }` y llevan un comentario: «T7.2 los borra junto al
  paso del código».
- `lib/actions/_shared/contexto-peticion.ts` (T3.3): `buildPasswordResetService` inyecta
  `{ sender: crearEmailSender(), baseUrl: baseUrlDeLaApp(), contacto: emailContacto() }`. Se quitan
  `OtpChallengeIssuer` y `crearEmailProvider` de aquí. El emisor sigue vivo para el OTP del login
  (`lib/actions/auth.ts`).
- Tests ajustados (T3.2): se borran los casos del código por email y se conservan los del enlace.
  - `password-reset-service.test.ts`: quedan R1/R3, R2 y R19 de la solicitud.
  - `password-reset-actions.test.ts`: los casos del código pasan a ser R20 (envoltorios sin servicio).
  - `password-reset-schemas.test.ts`: R7/R8 sobre `crearConEnlaceSchema`.
  - `password-reset-enlace.test.ts`: cambia el doble del 3.er argumento.
  - `password-reset-enlace-action.test.ts`: se quitan dos claves del doble.
  - `password-reset-degrada-a-consola.test.ts`: fija `NEXT_PUBLIC_APP_URL`, porque sin URL base no se
    envía.
  - `correos-sin-secretos.test.ts`: el correo capturado de recuperación es el de enlaces; sus secretos
    del asunto pasan a ser la URL, el id, el secreto y `#enlace=`.
  - `otp-challenge-issuer.test.ts`: se borra el bloque SL-41 R9, «login y recuperación mandan el mismo
    correo», que SL-18 R16 deja obsoleto.
  - `empresa-de-la-peticion.test.ts`: el caso de recuperación prueba solo `solicitar`.
  - `organizacion-alta.test.ts` (R44, primer acceso): se recupera con el enlace del correo en vez del
    código.
  - `enlace-bienvenida.test.ts`: cambia el doble del 3.er argumento.

`app/` no se tocó. `BienvenidaMaestroService` no cambió.

### Llamadores revisados

Grep en `lib`, `app`, `components`, `tests`, `e2e`, `scripts` y `db` de lo que cambia o se borra:
`verificarCodigo`, `restablecer`, `verificarCodigoRecuperacion`, `restablecerContrasena`,
`verifyResetCodeSchema`, `resetPasswordSchema`, `VerifyResetCode*`, `ResetPassword*`,
`VerificarCodigoInput`, `RestablecerInput`, `new PasswordResetService` y `buildPasswordResetService`.
- `app/recuperar-contrasena/_components/RecuperarContrasenaForm.tsx` y
  `tests/integration/recuperar-contrasena-{form,enlace,page}.test.tsx`: compilan sin cambios y los
  tests siguen en verde (3 archivos, 22 tests; mockean las actions).
- `lib/actions/organizaciones.ts`: usa `buildPasswordResetService` para la bienvenida; sin cambios.
- `lib/db/excepciones-aislamiento.ts`: la excepción de `password-reset.ts` sigue siendo cierta.
- `e2e/_superadmin-fixture.ts > recuperarContrasena`: **compila** (typecheck incluye `e2e/`), pero en
  ejecución ya no puede pasar, porque el correo no lleva código y «Verificar código» responde siempre
  el genérico. Es T7.3 y no se cambió. Lo usan los E2E que la llamen (solo CI del PR a producción).
- Homónimo `restablecerContrasena` de `lib/actions/usuarios.ts` / `UsuarioService`: no se tocó.
- `scripts/` y `db/`: sin referencias.

### Mapa R → test

| R | Archivo | Caso |
|---|---|---|
| R16 | `tests/unit/password-reset-por-empresa.test.ts` | «R16: dos cuentas → un solo correo al email con dos enlaces, cada uno con su empresa («Plataforma» la de plataforma)» |
| R16 | `password-reset-por-empresa.test.ts` | «R16: la cuenta que superó AUTH_RESET_MAX_REQUESTS se omite; las demás reciben su enlace» |
| R16 | `password-reset-por-empresa.test.ts` | «R16: el enlace vence a los AUTH_OTP_TTL_MINUTES» |
| R16 | `tests/unit/services/email/recuperar-contrasena.test.ts` | «R16: N cuentas → N líneas «<empresa>: <url>»…» y «R16: la cuenta sin empresa sale como «Plataforma»…» |
| R17 | `password-reset-por-empresa.test.ts` | «R17: un email sin cuentas no emite ni envía, y responde igual que uno con cuentas» |
| R17 | `password-reset-por-empresa.test.ts` | «R17: con todas las cuentas al límite no emite ni envía, y responde lo mismo» |
| R18 | `tests/integration/actions/recuperar-por-empresa.test.ts` | «R18: el enlace de B cambia solo la contraseña de B; la de A sigue entrando con la vieja» |
| R19 | `password-reset-por-empresa.test.ts` | «R19: vencido / ya usado / sustituido por otro enlace de recuperación / sustituido por uno de bienvenida / no es de recuperación ni de bienvenida → invalid_or_expired sin cambiar ninguna contraseña» (5 casos) y el control «un enlace de recuperación vigente se canjea…» |
| R20 | `recuperar-por-empresa.test.ts` | «R20: con un desafío real activo, «verificar código» y «restablecer con código» no cambian ninguna contraseña ni consumen el desafío» (comprueba además que el servicio no tiene `verificarCodigo` ni `restablecer`) |
| R20 | `tests/unit/password-reset-actions.test.ts` | «SL-18 R20 — los envoltorios de transicion…»: los dos responden `invalid_or_expired` sin llamar a ningún método del servicio |
| R21 | `password-reset-por-empresa.test.ts` | «R21: a create solo llega el hash del secreto que viaja en el enlace» y «R21: ni la solicitud, ni un envío fallido, ni un canje bueno o malo escriben el secreto en console» |
| R21 | `recuperar-contrasena.test.ts` | «R21: cada secreto aparece solo detrás de `#enlace=<id>.`, y nunca en el asunto» |

El doble de desafíos de `password-reset-por-empresa` es un repositorio en memoria que imita al real:
una fila está activa si no se consumió y no venció, y «último» es la activa más reciente. Así los
enlaces salen del correo y se canjean de verdad. R18 y R20 corren con las actions reales, los
repositorios sobre `getPrismaClient()` y el `comoPlataforma` de cada action. Solo el transporte del
correo es doble.

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → 0 `error TS`. Incluye `e2e/` y `app/`
  sin tocar.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint <los 20 archivos tocados>` → `No issues
  found`, exit 0.
- Unit tocados y vecinos: 14 archivos, `Tests 114 passed (114)`. Son `password-reset-*` (6),
  `recuperar-contrasena`, `correos-sin-secretos`, `otp-challenge-issuer`, `empresa-de-la-peticion`,
  `password-reset-degrada-a-consola`, `bienvenida-maestro-service`, `bienvenida-maestro` y
  `organizaciones-action.composition-root`.
- Pantalla (mockean las actions): `recuperar-contrasena-{form,enlace,page}` → `Tests 22 passed (22)`.
- Integración en serie (`--no-file-parallelism`) contra `servi_logistic_sl18`: `recuperar-por-empresa`,
  `organizacion-alta` y `enlace-bienvenida` → `Test Files 3 passed (3)`, `Tests 20 passed (20)`, 0
  skipped.
- `pnpm exec vitest related --run` de los 6 archivos de `lib/` tocados, sin `DATABASE_URL` →
  `Test Files 18 passed | 3 skipped (21)`, `Tests 173 passed | 20 skipped (193)`, 0 rojos. Los 3
  skipped son los de base, corridos aparte en el punto anterior.
- `pnpm run test:guardias` → `Test Files 1 failed | 310 passed | 2 skipped (313)`, `Tests 4 failed |
  4323 passed`. El único rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está en
  `tests/baseline-rojos.json`, igual que en las Tandas 1 y 2.
- Nota del comando: en `.env` el valor de `DATABASE_URL` va entre comillas simples. Con
  `tr -d '"'` el host salía mal (`ENOTFOUND base`), así que se usó `tr -d "\"'"`. Se comprobó solo el
  nombre de la base (`servi_logistic_sl18`) y el host (`localhost:5432`).

### Mutación (T3.2/T3.3)

- **M1 (R18/R19).** `MARCAS_DE_ENLACE = [DEVICE_HASH_BIENVENIDA]`: el canje deja de aceptar la marca de
  recuperación. → `Tests 4 failed | 14 passed (18)`. Caen:
  - `× control: un enlace de recuperación vigente se canjea…`;
  - `× R19: ya usado…`, porque el primer canje ya no da `ok`;
  - `× R21: ni la solicitud… escriben el secreto` (su control de camino entero);
  - `× R18: el enlace de B cambia solo la contraseña de B…`, con base real.
- **M2 (R16/R18).** `solicitar` emite todos los enlaces para `cuentas[0].id`, así que el enlace de B
  cambia la de A. → `Tests 5 failed | 13 passed (18)`. Caen `× R16: dos cuentas…`, `× R16: la cuenta
  que superó…`, `× R19: ya usado`, `× R21 …console` y `× R18: el enlace de B…` (base real).
- Restaurado tras cada mutación: el `diff` contra la copia sale vacío.

### Desviaciones y puntos abiertos

- **Las acciones del código siguen exportadas** como envoltorios de transición, por la restricción de
  no tocar `app/`. Así lo indicó el leader, aunque design §4.1 y T3.3 dicen «fuera». Por eso R20 se
  prueba por comportamiento (no cambian nada ni consumen el desafío) y no con «el módulo ya no las
  exporta». T7.2 las borra, con `VerifyResetCodeResult`.
- **Mientras tanto, la pantalla de recuperar no funciona.** El paso 1 sigue diciendo «Enviar código»
  y pasa al campo del código, pero el correo ya trae enlaces. El enlace sí funciona: lo canjea el modo
  `#enlace=` de la misma pantalla, con el texto de SL-41 («Crea tu contraseña»). El paso del código
  responde siempre el genérico. Se arregla en T7.2.
- **E2E en riesgo hasta T7.3.** `e2e/_superadmin-fixture.ts > recuperarContrasena` compila, pero en
  ejecución falla: espera un código en el log. Afecta solo al CI del PR a producción.
- **Texto de la bienvenida.** `plantillaBienvenidaMaestro` (SL-41) todavía dice «…entra en
  …/recuperar-contrasena y pide un código con tu correo». Desde SL-18 es un enlace. No se cambió: el
  leader pidió no tocar la bienvenida, y `bienvenida-maestro.test.ts` fija ese texto. Lo decide el
  leader (¿T7.2?).
- **Constructor de `PasswordResetService`.** El 3.er argumento pasa de emisor de OTP a
  `CorreoDeRecuperacion`. El contacto del pie entra por ahí (`emailContacto()` en el composition root),
  así la plantilla sigue siendo pura, como la de bienvenida.
- **Qué cuentas reciben enlace.** Todas las del email, sin filtrar por `estado`, como dice design §4.1
  y como hacía el flujo anterior. El canje no mira el estado, pero el login sí. Una cuenta sin empresa
  que no es de plataforma (R15, defensivo, imposible por el CHECK) también saldría como «Plataforma».
- `findCuentasPorEmail` devuelve las cuentas por nombre de empresa y la de plataforma al final. El
  correo respeta ese orden.

### Veredicto

Tanda 3 implementada: R16–R21 tienen test (unit e integración contra Postgres real), las dos mutaciones
dan rojo y se restauraron, typecheck y lint en verde, y `app/` y `BienvenidaMaestroService` sin tocar.

### Re-verificación del implementer (2026-10-26)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0.
- En serie contra `servi_logistic_sl18`: `password-reset-por-empresa`, `recuperar-contrasena`
  (plantilla), `recuperar-por-empresa`, `enlace-bienvenida`, `organizacion-alta`,
  `password-reset-actions` y `auth-service-empresas` → `Test Files 7 passed (7)`, `Tests 52 passed (52)`.
- Sin marca PROVISIONAL en `PasswordResetService`. «Plataforma» sale de `NOMBRE_EMPRESA_PLATAFORMA`.

## Tanda 4: guardia de únicos (R22, R23, R30) — 2026-10-26, backend_dev

### Archivos

- `lib/db/excepciones-aislamiento.ts` (mod.): tipo `UnicoSinEmpresa` y `UNICOS_SIN_EMPRESA`,
  60 entradas: 8 `global` y 52 `anclado` (motivo «FK NOT NULL a `<tabla>`»).
- `tests/unit/guards/_unicos-por-empresa.ts` (nuevo): detector. Recorre TODO el historial de
  `db/migrations` (no solo desde `20261023090000`: los 52 anclados son anteriores y (b) necesita
  verlos) y aplica en orden `CREATE UNIQUE INDEX`, `DROP INDEX`, `ADD/DROP CONSTRAINT … UNIQUE`,
  renombres de índice/restricción/columna/tabla, `DROP COLUMN`, `DROP TABLE` y el `EXECUTE '…'` de
  tarifas. Si una migración tiene más `UNIQUE` escritos que reconocidos, lanza error con su nombre.
  Tablas de negocio: `MODELOS_DE_NEGOCIO.tabla` (la guardia `organizacion-en-modelos` ya ata
  `tabla` al `@@map`).
- `tests/unit/guards/unicos-por-empresa.guardia.test.ts` (nuevo): casos (a)–(d) de design §5.
- `docs/architecture.md` (mod.): viñeta «Únicos» de Multi-empresa con el párrafo de design §8 y la
  lista de globales. Es la parte de T6.3 que (c) necesita; D14 de `progress/deudas.md` sigue para
  la Tanda 6.

### Llamadores revisados

`excepciones-aislamiento.ts`: las guardias `sql-a-mano-por-empresa`, `plataforma-solo-en-lista`,
`storage-solo-por-adaptador` e `integracion-enrutado.test.ts` (solo `EXCEPCIONES_DE_PLATAFORMA`,
sin cambio); en `scripts/` solo comentarios; nada en `e2e/` ni `db/`. Ningún test ni script leía
la viñeta de `architecture.md`.

### Mapa R → test (`tests/unit/guards/unicos-por-empresa.guardia.test.ts`)

| R | Test |
|---|---|
| R22 | «R22 (a): todo único final de negocio empieza por organizacion_id o está en UNICOS_SIN_EMPRESA»; autoprueba «R22 (d): un único nuevo sin organizacion_id…» y «R22 (d): mutación M4b…» |
| R23 | «R23 (b): toda entrada de UNICOS_SIN_EMPRESA existe en las migraciones y sigue sin la columna»; «R23: cada entrada trae motivo, no se repite…»; «R23 (d): una entrada que no existe, o cuyo índice ya empieza por organizacion_id, hace fallar (b)» |
| R30 | «R23, R30 (c): docs/architecture.md > Multi-empresa nombra cada único global a propósito»; «R30: docs/architecture.md dice que usuario.email y usuario.cedula son por empresa y por qué num_guia sigue global»; «R23, R30 (d): si la sección Multi-empresa deja de nombrar un global, (c) falla» |

### Verificación (implementer)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run lint` → exit 0, 0 errors, 231 warnings (ninguna en
  los archivos de la tanda).
- `vitest run tests/unit/guards/unicos-por-empresa.guardia.test.ts` → `Tests 15 passed (15)`.
- backend_dev corrió además las guardias que leen las listas o la doc: 14 archivos, 214 passed,
  0 failed, 1 skipped (ya marcado así en `recursos-origen-fuera`). Sin base de datos: la tanda no
  la toca.

### Mutación

- 19:24:47 M4b real: `zona_nombre_key` en `20261023090000_unicos_por_empresa/migration.sql` sin
  `organizacion_id` → 6 rojos, entre ellos «R22 (a)» (las autopruebas (d) también caen porque
  parten del historial real). Restaurado con `git checkout`.
- 19:24:51 quitar `push_suscripcion.endpoint` de la lista de globales de `docs/architecture.md` →
  2 rojos, «R23, R30 (c)» y su (d), nombrando `push_suscripcion.push_suscripcion_endpoint_key`.
  Restaurado; 15/15 de nuevo.
- La guardia es `*.guardia.test.ts` bajo `tests/unit/guards/`, el patrón que `./init.sh` corre
  entero; no corrí init.sh.

### Desviaciones y puntos abiertos

- **8 globales, no 5.** El detector encontró 3 únicos posteriores a SL-17 sin `organizacion_id` ni
  FK que los ancle: `integracion_whatsapp_numero_id_key` e
  `integracion_whatsapp_resumen_verificacion_key` (SL-36) y `usuario_un_solo_superadmin` (SL-32,
  índice sobre `((true))`). Van como `global` y la doc los nombra. Design §2/§5/§8 y T6.3 dicen
  «5»: a decidir si se ajusta el texto del spec.
- La guardia también exige sacar de la lista una entrada cuyo índice ya empiece por
  `organizacion_id` (más estricto que R23, coherente con «solo puede bajar»). No hay techo numérico:
  sobrar ya pone la guardia en rojo, como en `sql-a-mano`.
- (a) se aplica a todo único final de negocio, no solo a los creados desde `20261023090000`:
  superconjunto de R22, necesario para sembrar y validar los 52 anclados.

### Veredicto

Tanda 4 hecha; sin bloqueos ni dependencias nuevas. Sin push (lo hace el leader).

### Fix tras el gate (2026-10-26)

- **Rojo:** `test:rapido` dio rojo, fuera del baseline, en `analytics-daily-guards` («solo los
  modulos declarados… nombran la tabla»), en `financiera-fuente` («ningun archivo de la feature
  nombra una tabla fuera de TablaDinero») y en `pagos-frontera` («ningún camino de
  `LiquidacionPago` nombra el desglose [D1]» y «CIERRE: los ÚNICOS módulos de `lib/`…»).
- **Causa confirmada:** `UNICOS_SIN_EMPRESA`, en `lib/db/excepciones-aislamiento.ts`, nombra
  `analytics_daily` y `gestion_orden_pago`. Esas guardias censan qué archivos de `lib/` nombran esas
  tablas. `analytics-daily-guards` y `pagos-frontera` buscan subcadenas, así que también caza el
  nombre del índice (`analytics_daily_grano_key`, `gestion_orden_pago_gestion_id_metodo_key`): no
  basta con quitar el campo `tabla`. `financiera-fuente` mete el archivo en su censo porque ya
  nombraba los repositorios de analítica en `porRls(...)`.
- **Arreglo, sin tocar esas guardias:** ningún código de producción lee la lista, así que pasa
  entera, sin cambios (8 `global` y 52 `anclado`), a `tests/unit/guards/_unicos-sin-empresa.ts`,
  junto al detector. `lib/db/excepciones-aislamiento.ts` queda igual que en `60f426d` (diff vacío).
  Las guardias censan `app`, `lib`, `scripts`, `components`, `hooks`, `providers` y `e2e`, y no
  `tests/`. Se descartó ampliar sus listas blancas: habría que debilitar tres guardias de otras
  features.
- **Spec (revisión 2026-10-26):**
  - design §2, §5 y §8 y tasks T4.1 y T6.3: los globales a propósito son 8, no 5;
  - nueva ubicación de la lista en design §5, T4.1 y la lista de archivos de tasks;
  - `docs/architecture.md` apunta a la ruta nueva.
- **Verificación:**
  - typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`) → exit 0;
  - lint con el mismo NODE_OPTIONS → exit 0, 0 errores y 231 warnings, ninguno de la tanda;
  - vitest de `unicos-por-empresa`, `financiera-fuente`, `pagos-frontera` y
    `analytics-daily-guards` → `Test Files 4 passed (4)`, `Tests 70 passed (70)`;
  - backend_dev corrió además `sql-a-mano-por-empresa`, `plataforma-solo-en-lista` y
    `storage-solo-por-adaptador`: 7 archivos, 105 passed.
- **Nota:** donde la sección de arriba dice que la lista vive en `lib/db/excepciones-aislamiento.ts`,
  ahora vive en `tests/unit/guards/_unicos-sin-empresa.ts`.

## Tanda 5: índices de rutas calientes (R24, R25) — 2026-10-26, backend_dev

Base `servi_logistic_sl18` (local, `localhost:5432`, Postgres 16.1). La URL se exporta por comando,
sin `.env` en el worktree. Grafo de código no consultado: la exploración fue con Grep/Read.

### Archivos

- `db/migrations/20261026090100_indices_rutas_calientes/migration.sql` (nuevo)
- `db/migrations/20261026090100_indices_rutas_calientes/down.sql` (nuevo)
- `db/schema.prisma`: tres `@@index` (`Tarifa`, `WhatsappEnvioEjecucion`, `AnalyticsDaily`). Salen
  `@@index([createdAt])` de `Tarifa` y `@@index([createdAt(sort: Desc)])` de `WhatsappEnvioEjecucion`.
- `tests/integration/db/indices-rutas-calientes.test.ts` (nuevo)

### Medición (T5.1)

**Datos.** La base de la feature solo tenía una organización y ninguna fila de negocio. `scripts/demo-qa`
pide los catálogos del seed (ver Tanda 1, `demo-qa.test.ts`) y no da volumen, así que se sembraron
datos sintéticos de A y B en una transacción revertida, en modo `session_replication_role = replica`.
El script estuvo en el worktree como `.tmp-medir.ts` y se borró. Hubo tres corridas:

- (1) A 2.000 / B 40.000 órdenes, cada empresa en bloque y fechas al azar;
- (2) 20.000 / 20.000, también en bloque;
- (3) 20.000 / 20.000 **intercaladas** por fecha, que es como escribe producción. Es la que decide.

`historial_accion` y `gestion_orden` llevan el mismo volumen que `orden`, `whatsapp_envio_ejecucion` la
cuarta parte, `tarifas` la décima, `plantilla_mensaje` la centésima y `analytics_daily` 365 días × N
cubos.

**Método.** Cada SQL es el que emite el repositorio por el cliente de la app (extensión +
`conEmpresa`), capturado con `crearPrismaDeTestConEspia`. Se pasa por `EXPLAIN (ANALYZE, BUFFERS)` con
`comoApp`, es decir como `servi_app` y con la empresa fijada. Cada consulta se mide en tres estados:

- antes;
- con el índice de prueba `(organizacion_id, <cols>)`;
- con el índice de prueba y sin el viejo, en un `SAVEPOINT`.

| Consulta (origen) | Plan antes (corrida 3) | Plan después | Decisión |
|---|---|---|---|
| Listado de órdenes por defecto (`lib/repositories/OrdenRepository.ts:1963 list`; `WHERE deleted_at IS NULL AND organizacion_id=$1 ORDER BY prioridad DESC, created_at DESC, id`) | `Seq Scan on orden`: 20.000 filas leídas y 20.000 descartadas (`Rows Removed by Filter`, las de la otra empresa) + top-N sort. 55–68 ms | `(organizacion_id, created_at)`: **no se usa**, el plan no cambia, también sin `orden_created_at_idx` | **Descartado**: el `ORDER BY` empieza por `prioridad`. Ver puntos abiertos |
| Listado filtrado por estado (`OrdenRepository.list` con `estatusId`) | `Bitmap Index Scan on orden_estatus_id_idx`: 5.000 filas, 2.500 ajenas. 7,4 ms | `(organizacion_id, estatus_id)`: no se elige mientras exista `orden_estatus_id_idx`. Sin él: 2.500 filas, 6,6–7 ms | **Descartado**: la ganancia es marginal y `orden_estatus_id_idx` no se puede borrar (otras rutas y la FK) |
| Ventana intradía de gestiones (`lib/repositories/AnaliticaOperativaVivaRepository.ts:397 contarGestionesVigentes`, SQL a mano, empresa por RLS) | `Index Scan using gestion_orden_created_at_idx`: 92 filas, 46 ajenas. Consulta total 92–138 ms, dominada por el CTE de `orden_historial_estado` | Con el viejo presente, el planificador **sigue con el viejo**. Sin él: `Bitmap Index Scan` del compuesto, 46 filas, mismo tiempo total | **Descartado**: solo se usaría borrando el viejo, y el viejo lo fija `analitica-operativa-indices.test.ts` (R25 de la 126), que mide sin empresa. En las corridas 1 y 2 sí se elegía; ver puntos abiertos |
| Listado de tarifas (`lib/repositories/TarifaRepository.ts:175 list`; `WHERE organizacion_id=$1 ORDER BY created_at DESC LIMIT`) | `Index Scan Backward using tarifas_created_at_idx`, `Rows Removed by Filter` 24–25 (filas de la otra empresa) | Con el viejo, sigue el viejo. Sin él: `Index Scan Backward` del compuesto, 0 descartadas | **Entra** `tarifas_organizacion_id_created_at_idx`; se borra `tarifas_created_at_idx` |
| Historial de acciones (`lib/repositories/HistorialAccionRepository.ts:130 list`; `ORDER BY created_at DESC, id`) | `historial_accion_created_at_id_idx`, 24–28 descartadas. En la corrida 1, como la empresa chica: 470 descartadas y 506 buffers | Compuesto `(organizacion_id, created_at DESC, id)`: 25 filas y 28 buffers. Con el viejo presente, el plan **alterna**: en el test, 2 de 5 corridas eligieron el viejo, por el bloat que dejan las corridas revertidas | **Descartado**: el viejo lo fija `historial-accion-migration.test.ts`, que mide su plan sin empresa, y con él vivo el compuesto no es estable. Punto abierto |
| Historial de envíos WhatsApp (`lib/repositories/WhatsappEjecucionRepository.ts:279 historial`; `ORDER BY created_at DESC, id DESC`) | `Index Scan using whatsapp_envio_ejecucion_created_at_idx`, 18–33 descartadas | Con el viejo, sigue el viejo. Sin él: el compuesto, 0 descartadas | **Entra** `whatsapp_envio_ejecucion_organizacion_id_created_at_idx`; se borra `whatsapp_envio_ejecucion_created_at_idx` |
| Listado de plantillas (`lib/repositories/PlantillaMensajeRepository.ts:136 list`) | `Index Scan Backward using plantilla_mensaje_created_at_idx`, 21–32 descartadas con 200 por empresa | Sin el viejo usa el compuesto, pero en la corrida en serie con otras suites el plan fue `Seq Scan` + sort | **Descartado**: con el volumen real (decenas de plantillas por empresa) el plan correcto es `Seq Scan` y el índice no aporta. No es una ruta caliente |
| Rollup de analítica (`lib/repositories/AnaliticaOperativaRollupRepository.ts:97 agregarCubos`; `WHERE fecha BETWEEN … AND organizacion_id=$3 GROUP BY fecha, zona_id`) | `Bitmap Index Scan on analytics_daily_grano_key`: 1.620 filas, 810 ajenas. 3,5–3,9 ms | `Bitmap Index Scan` del compuesto `(organizacion_id, fecha)`: 810 filas, 1,1 ms. Se elige aunque exista el único | **Entra** `analytics_daily_organizacion_id_fecha_idx`. `analytics_daily_grano_key` se queda: es el único del upsert |

**Resultado:** en M2 entran 3 índices y se borran 2 viejos.

### Llamadores revisados

- **`tarifas_created_at_idx` (borrado).** Su única lectura por fecha es `TarifaRepository.list`, que
  siempre lleva empresa.
  - `CoberturaRepository`, `TarifaVigenteRepository` y `OrdenRepository:2113` no ordenan ni filtran
    por `created_at`.
  - No está en `comoPlataforma` ni en ningún job.
  - Tests: `tests/unit/db/tarifas-rls.test.ts:93` solo lee el texto de la migración de 2026-07, que
    no cambia.
- **`whatsapp_envio_ejecucion_created_at_idx` (borrado).** Su única lectura por fecha es `historial`,
  que lleva empresa. Las demás lecturas de la tabla no lo usan:
  - `ultimaPruebaDe` va por `(envio_id, created_at DESC)`;
  - `ultimaPorEnvio` filtra por `envio_id`;
  - la purga filtra por `pdf_caduca_at`;
  - `scripts/migrar-storage-a-carpetas.ts:196` filtra por `organizacionId`, sin orden.

  Los jobs corren por empresa con `conEmpresa` (`app/api/cron/procesar-jobs/route.ts:95`). Ningún test
  nombra el índice viejo.
- **Se quedan:**
  - `gestion_orden_created_at_idx`: lo fija `tests/integration/db/analitica-operativa-indices.test.ts`;
  - `historial_accion_created_at_id_idx`: lo fija `tests/integration/db/historial-accion-migration.test.ts:199,293`;
  - `plantilla_mensaje_created_at_idx` (aparece en `plantillas.int.test.ts:85`, solo como texto de la
    migración vieja);
  - `orden_created_at_idx`: lo fija `cohorte-carga-indices.int.test.ts:85`;
  - `orden_estatus_id_idx`;
  - `analytics_daily_grano_key`.
- **Creados.** Sin `map:` y con el nombre que deriva Prisma: `tarifas_organizacion_id_created_at_idx`,
  `whatsapp_envio_ejecucion_organizacion_id_created_at_idx` y
  `analytics_daily_organizacion_id_fecha_idx`.
- **`usuario_email_idx` (R25).** Ya existía (M1, Tanda 1). Solo se le añade el test.

### Mapa R → test

Todos los casos están en `tests/integration/db/indices-rutas-calientes.test.ts`.

| R | Caso |
|---|---|
| R24 | «R24: cada índice elegido existe con `organizacion_id` primero». Hay un caso por índice (3): comprueba `pg_indexes` y las columnas exactas |
| R24 | «R24: con dos empresas sembradas, el plan de la consulta real nombra su índice». Hay 3 casos: `TarifaRepository.list`, `WhatsappEjecucionRepository.historial` y `AnaliticaOperativaRollupRepository.agregarCubos`. El SQL es el que emite el repositorio por la extensión. Antes del `EXPLAIN` se siembran A y B intercaladas y se hace `ANALYZE`; el `EXPLAIN` corre como `servi_app` con A |
| R25 | «R25: … va por `usuario_email_idx` y no recorre la tabla». La consulta es `findCuentasPorEmailConHash` en `comoPlataforma`, sin empresa y como dueño, sobre 500 cuentas por empresa con los mismos emails |

Todo corre en una transacción revertida, con el lock `CLAVE_LOCK_ESCRITURA_REAL`. Sin
`enable_seqscan = off`.

### Ida y vuelta de `down.sql` y `migrate diff`

1. Antes de M2 se guardó `pg_indexes` de las 6 tablas candidatas (41 índices).
2. `prisma migrate deploy` aplicó M2. `pg_indexes` mostró +3 y −2, y
   `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` dio
   `-- This is an empty migration.`
3. `prisma db execute --file down.sql` devolvió `pg_indexes` **idéntico** al de antes (41). El diff
   contra el `schema.prisma` de `HEAD` (el anterior) salió vacío.
4. `prisma db execute --file migration.sql` dejó `pg_indexes` idéntico al de tras el deploy, y el diff
   contra el `schema.prisma` nuevo salió vacío.
5. `prisma migrate status`: `Database schema is up to date!`

La migración se reescribió dos veces durante la medición, cuando salieron `gestion_orden`,
`historial_accion` y `plantilla_mensaje`. Cada vez se aplicó `down.sql`, se borró su fila de
`_prisma_migrations` en la base local y se volvió a desplegar. La ida y vuelta de arriba es la de la
versión final.

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 `error TS`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run lint` → exit 0: `231 problems (0 errors, 231
  warnings)`, las mismas cifras que en la Tanda 1. Ninguno es de esta tanda.
- Test nuevo contra `servi_logistic_sl18`:
  - versión final: 5 corridas seguidas con `Tests 7 passed (7)`;
  - restaurada la mutación: otra corrida verde.
- Integración en serie (`--no-file-parallelism`). Son los tests que tocan las tablas o los índices
  cambiados, más el nuevo:
  - `analytics-daily-migration`, `tarifa-zona-is-default-migration`, `whatsapp-envios-migration`,
    `whatsapp-envio-historial`, `purga-pdf-indices-migration`, `whatsapp-envio-purga-seleccion`,
    `indices-rutas-calientes`, `usuario-unico-por-empresa` y `plantillas/plantillas.int`;
  - además, los unitarios `analytics-daily-contrato` y `db/tarifas-rls`.

  Resultado: `Test Files 11 passed (11)`, `Tests 178 passed (178)`, 0 skipped.
- `pnpm exec vitest run tests/unit/guards tests/unit/analytics` → `Test Files 1 failed | 395 passed
  (396)`, `Tests 4 failed | 5302 passed | 1 skipped (5307)`. El único rojo es
  `dependencias-declaradas-presentes.guardia.test.ts` (marcador de `init.sh`). Está en
  `tests/baseline-rojos.json` y no es de esta tanda. `unicos-por-empresa.guardia.test.ts` pasa: M2 no
  crea ningún único.
- **Visto de paso.** En una corrida intermedia, `historial-accion-migration.test.ts` dio 7 rojos, entre
  ellos «R8: y NO tiene policies» y `referencia a otra empresa: historial_accion.actor_usuario_id ->
  usuario`. Está en `tests/baseline-rojos.json` y M2 final no toca esa tabla.

### Mutación (20:53–20:54)

Cada mutación se hizo sobre `servi_logistic_sl18` y se restauró después.

| Mutación | Resultado |
|---|---|
| M1: `DROP INDEX tarifas_organizacion_id_created_at_idx` | **Rojo**, `2 failed`: «… no esta en pg_indexes» y «el plan de TarifaRepository.list no usa …». El plan pasa a `Seq Scan on tarifas` |
| M2: el mismo índice con las columnas invertidas `(created_at, organizacion_id)` | **Rojo**, `1 failed`: «tarifas_organizacion_id_created_at_idx no lleva organizacion_id primero». El caso del plan sigue verde, porque el índice invertido se sigue nombrando: lo caza solo `pg_indexes` |
| M3: `DROP INDEX whatsapp_envio_ejecucion_organizacion_id_created_at_idx` | **Rojo**, `2 failed`. El plan pasa a `Seq Scan on whatsapp_envio_ejecucion` |
| M4: `DROP INDEX analytics_daily_organizacion_id_fecha_idx` | **Rojo**, `2 failed`. El plan pasa a `Index Scan using analytics_daily_grano_key` |
| M5: `DROP INDEX usuario_email_idx` | **Rojo**, `1 failed`: «el login no usa usuario_email_idx». El plan pasa a `Seq Scan on usuario` |

Restaurado: `Tests 7 passed (7)`, drift vacío y `pg_indexes` igual que tras el deploy.

### Desviaciones y puntos abiertos

- **Nombres.** Design M2 pedía `<tabla>_org_<cols>_idx`. Se usó el nombre que deriva Prisma
  (`<tabla>_organizacion_id_<cols>_idx`), sin `map:`. El motivo es que
  `analytics-daily-migration.test.ts:217` fija la lista exacta de `map:` del modelo `AnalyticsDaily`:
  con `map:` ese test de la 123 caía.
- **Datos sintéticos.** Se sembraron en modo réplica en vez de usar `scripts/demo-qa`, porque la base
  no tiene seed ni volumen. Las FK y los triggers no cambian el plan.
- **Siembra intercalada en el test.** El test siembra las dos empresas intercaladas por fecha. Con la
  siembra en bloque, el rollup salió una vez por `analytics_daily_organizacion_id_idx`.
- **No hizo falta `enable_seqscan = off`.**
- **Tres candidatos fuera (decisión humana).**
  - `gestion_orden` e `historial_accion`: el compuesto solo se usa de forma estable si se borra el
    índice viejo por fecha. A ese índice lo fijan tests de otras features que miden sin empresa
    (126 R25 y 362 R40). En producción no se encontró ninguna lectura sin empresa. Borrarlos obliga a
    reescribir esos tests.
  - `plantilla_mensaje` no es ruta caliente.
- **El listado de órdenes queda sin índice, punto abierto.** Lo que lo resuelve es
  `(organizacion_id, prioridad DESC, created_at DESC, id)`: pasa de un `Seq Scan` de 40.000 filas a
  un `Index Scan` de 25 filas (0,1 ms frente a 55–68 ms). No es «`organizacion_id` + las columnas de
  antes» (design M2), y `orden` es la tabla con más escrituras. Necesita decisión.
- **Grafo de código.** No se consultó el MCP; la exploración fue con Grep/Read.

### Veredicto

Tanda 5 implementada. Entran 3 índices y salen 2 viejos. R24 y R25 tienen test verde contra Postgres
real, la mutación está anotada, `down.sql` hace la ida y vuelta y el drift está vacío. Quedan 4
candidatos para decisión humana.

### Re-verificación del implementer (2026-10-26, 21:02–21:10)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run lint` → exit 0, `231 problems (0 errors, 231 warnings)`.
- `indices-rutas-calientes.test.ts` contra `servi_logistic_sl18` → `Tests 7 passed (7)`.
  Ojo: sin `DATABASE_URL` el archivo se salta (7 skipped) y no falla; una URL con comillas
  sobrantes dio «Unable to start a transaction in the given time».
- Mutación propia, 21:03: `DROP INDEX analytics_daily_organizacion_id_fecha_idx` → `2 failed | 5 passed`
  (pg_indexes y plan de `AnaliticaOperativaRollupRepository.agregarCubos`). Restaurado → 7/7.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --exit-code` → exit 0,
  «No difference detected».
- No corrí `./init.sh` ni la suite completa; no hay push (lo pidió el leader).

## Tanda 5 — ampliación: órdenes, gestiones e historial (R24) — 2026-10-26, backend_dev

La amplió Camilo el 2026-10-26. Base `servi_logistic_sl18` (local, `localhost:5432`). La URL se
exporta por comando, sin `.env` en el worktree. El grafo de código no se consultó: la exploración
fue con Grep/Read.

### Archivos

- `db/migrations/20261026090200_indices_ordenes_gestiones_historial/migration.sql` (nuevo)
- `db/migrations/20261026090200_indices_ordenes_gestiones_historial/down.sql` (nuevo)
- `db/schema.prisma`, tres `@@index` nuevos:
  - `Orden`: `[organizacionId, prioridad(sort: Desc), createdAt(sort: Desc), id]`, sin `WHERE`
    (ver Desviaciones);
  - `GestionOrden`: `[organizacionId, createdAt]`, en lugar de `[createdAt]` con
    `map: "gestion_orden_created_at_idx"`;
  - `HistorialAccion`: `[organizacionId, createdAt(sort: Desc), id]`, en lugar de
    `[createdAt(sort: Desc), id]`.
- `lib/repositories/AnaliticaOperativaVivaRepository.ts`: solo cambia el comentario que nombraba
  el índice viejo.
- `tests/integration/db/indices-rutas-calientes.test.ts`: tres rutas más y la comprobación del
  predicado parcial.
- `tests/integration/db/analitica-operativa-indices.test.ts` y
  `tests/integration/db/historial-accion-migration.test.ts`, reescritos (ver abajo).
- `tests/unit/guards/organizacion-en-modelos.guardia.test.ts`, una línea (ver Desviaciones).
- `specs/SL-18-unicos-secuencias-por-empresa/design.md` (§2 M3 y §6) y `tasks.md` (T5.4), con su
  revisión.

### Medición antes/después

Mismo método que T5.1:
- dos empresas de 20.000 filas en `orden`, `gestion_orden` e `historial_accion`, intercaladas
  por fecha, más `orden_historial_estado`;
- una transacción revertida y modo `replica`;
- `EXPLAIN (ANALYZE, BUFFERS)` como `servi_app` con A fijada.

El script se corrió desde el scratchpad y no se dejó en el worktree.

| Consulta | Antes | Después (nuevo, sin el viejo) |
|---|---|---|
| `OrdenRepository.list` por defecto (`deleted_at IS NULL AND organizacion_id=$1 ORDER BY prioridad DESC, created_at DESC, id ASC LIMIT 25`) | `Seq Scan on orden`: 19.200 filas, 20.800 descartadas, top-N heapsort, 1.064 buffers, 27,5 ms | `Index Scan using orden_organizacion_id_prioridad_created_at_id_idx`, `Index Cond: organizacion_id`, sin sort: 25 filas, 28 buffers, 0,10–0,15 ms |
| `count` del mismo listado | `Seq Scan`: 1.064 buffers, 17 ms | Sin cambio (`Seq Scan`). Con el mapa de visibilidad recién creado, el planificador no hace `Index Only Scan`. El índice no buscaba esto |
| `contarGestionesVigentes`, ventana de un día (empresa por RLS) | `Index Scan using gestion_orden_created_at_idx`: 192 leídas, **96 descartadas** (las de B) | Con el viejo vivo, el plan **seguía con el viejo**. Sin él: `Bitmap Index Scan on gestion_orden_organizacion_id_created_at_idx`, `Index Cond: organizacion_id = NULLIF(current_setting(...)) AND created_at >= … AND created_at < …`, 96 filas, 0 descartadas |
| `HistorialAccionRepository.list` (`organizacion_id=$1 ORDER BY created_at DESC, id ASC LIMIT 25`) | `Index Scan using historial_accion_created_at_id_idx`: 24 descartadas | `Index Scan using historial_accion_organizacion_id_created_at_id_idx`, `Index Cond: organizacion_id`: 0 descartadas, 5 buffers |

### Índices

- **Creados:**
  - `orden_organizacion_id_prioridad_created_at_id_idx`, **parcial** `WHERE deleted_at IS NULL`;
  - `gestion_orden_organizacion_id_created_at_idx`;
  - `historial_accion_organizacion_id_created_at_id_idx`.

  Los nombres son los que deriva Prisma, sin `map:`.
- **Borrados:** `gestion_orden_created_at_idx` y `historial_accion_created_at_id_idx`.
- **Se quedan:**
  - `orden_created_at_idx`: lo usa la ventana de carga de la cohorte (`CohorteCargaRepository`,
    411 R36). Con datos, el plan de esa ventana lo sigue eligiendo, como dueño y como `servi_app`;
  - `orden_prioridad_clave_remision_idx`: orden por remisión, 423;
  - `orden_organizacion_id_idx`: el nuevo es parcial y no lo sustituye.
- **Lo que el índice de `orden` no cubre:** el sentido no por defecto (`created_at ASC`), el orden por
  guía o remisión y la vista «Eliminadas». Esos casos ordenan en memoria, como antes.

### Llamadores revisados de los índices borrados

- **`gestion_orden` por `created_at`.** Las lecturas son:
  - `AnaliticaOperativaVivaRepository` (Q3/Q4) y `AnaliticaRollupRepository` (job
    `analitica_rollup_diario`);
  - `TableroDiaRepository`, `ConteoDevolucionesRepository`, `ConteoProductosRepository` y
    `ConteoPorStatusRepository`.

  Todas son SQL a mano por el cliente de la app. Sin contexto, la extensión lo rechaza
  (`EmpresaNoResuelta`, `lib/db/extension-empresa.ts`). Los jobs recurrentes corren una vez por
  empresa con `conEmpresa` (`conSuEmpresa`, `app/api/cron/procesar-jobs/route.ts`).
  `scripts/rollup-analitica-manual.ts` usa el mismo cliente. Los `comoPlataforma` del repo (login,
  sesión, rastreo por guía, empresas, cobro, jobs, storage) no leen `gestion_orden` por fecha.
  `scripts/contraste-454.sql` y `scripts/medir-462-retenidas.sql` son consultas de consola de
  diagnóstico, no rutas de la app.
- **`historial_accion` por `created_at`.** El único lector es `HistorialAccionRepository`
  (`list` y `listAll`, con empresa). La otra escritura es `registrar-accion.ts`, un
  `createMany`. No hay retención, cron ni script que lea la tabla.
- **Tests que nombraban los viejos.** Solo los dos reescritos. `orden-clave-remision.guardia`
  vigila que nadie recree `orden_prioridad_clave_remision_idx` sin `WHERE`. M3 no lo toca.

### Tests ajenos reescritos y qué siguen protegiendo

- **`analitica-operativa-indices.test.ts` (126 R25).** Sigue fijando las tres afirmaciones de R25.
  1. Una migración crea el índice y su `down.sql` lo revierte. Las aserciones sobre la migración de
     la 126 se conservan (es historia aplicada). Se suman las de M3: borra el viejo y crea
     `(organizacion_id, created_at)`; el down restaura `("created_at")`.
  2. `schema.prisma` declara el índice. La aserción lee el bloque `model GestionOrden`, porque
     `Tarifa` tiene el mismo `@@index`, y exige que no vuelva `@@index([createdAt]`.
  3. El plan intradía con `enable_seqscan = off` nombra el índice y no hace `Seq Scan`. Ahora corre
     como `servi_app` con una empresa (`comoApp`), como en la app, y exige el **rango de
     `created_at` dentro del `Index Cond`**: la ventana sigue teniendo índice. El caso
     discriminante no cambia.
- **`historial-accion-migration.test.ts` (362 R40).**
  - **Las tres consultas siguen sin `Seq Scan` y con su índice.** Llevan
    `organizacion_id = $n`, como las emite el repositorio. La primera página exige
    `historial_accion_organizacion_id_created_at_id_idx`; actor y entidad conservan los suyos.
  - **El corpus se siembra en modo `replica`.** Lleva un actor sintético y dos empresas de 3.000
    filas, intercaladas. Antes leía un usuario existente y caía por el trigger de misma empresa:
    esos 4 casos estaban rojos (archivo en `baseline-rojos.json`) y ahora pasan.
  - **Índices en la base.** El caso de los índices exige el nuevo y la ausencia del viejo.
  - **Siguen rojos (baseline, de SL-17, ajenos a esta tanda):** «R8: y NO tiene policies» y «la FK
    del actor es RESTRICT».

### Mapa R → test

| R | Caso |
|---|---|
| R24 | `indices-rutas-calientes.test.ts`, «R24: cada índice elegido existe con `organizacion_id` primero». Son 6 casos, 3 nuevos. Comprueban las columnas exactas y, si el índice es parcial, el predicado |
| R24 | `indices-rutas-calientes.test.ts`, «R24: con dos empresas sembradas, el plan de la consulta real nombra su índice». Son 6 casos, 3 nuevos: `OrdenRepository.list`, `AnaliticaOperativaVivaRepository.contarGestionesVigentes` (vía `cubosDelDiaEnCurso`; la empresa la pone la RLS y el test busca la policy en el `Index Cond`) y `HistorialAccionRepository.list` |
| R24 (126 R25, 362 R40) | `analitica-operativa-indices.test.ts` y `historial-accion-migration.test.ts`, reescritos |
| R25 | sin cambio (`usuario_email_idx`) |

### Ida y vuelta, drift y salidas

- **Ida y vuelta del down y drift.**
  1. `prisma migrate deploy` aplicó M3. `pg_indexes` de las 3 tablas pasó a +3 y −2, y
     `migrate diff --from-config-datasource --to-schema db/schema.prisma --exit-code` dio
     «No difference detected» (exit 0).
  2. `prisma db execute --file down.sql` dejó `pg_indexes` **idéntico** al de antes. El diff contra
     el `schema.prisma` de HEAD salió con exit 0.
  3. Reaplicado `migration.sql`, `pg_indexes` quedó idéntico al de tras el deploy y el diff salió
     con exit 0. `migrate status` dio «Database schema is up to date!».
- **Typecheck:** `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 `error TS`.
- **Lint:** `NODE_OPTIONS=--max-old-space-size=8192 pnpm run lint` → exit 0, `231 problems (0 errors,
  231 warnings)`. Son las mismas cifras de antes.
- **`indices-rutas-calientes.test.ts`:** 5 corridas seguidas con `Tests 13 passed (13)`.
- **Ajenos reescritos:**
  - `analitica-operativa-indices.test.ts` → `Tests 7 passed (7)`;
  - `historial-accion-migration.test.ts` → `Tests 2 failed | 10 passed (12)`. Los 2 rojos son los de
    baseline de arriba; antes eran 6.
- **Integración en serie** (`--no-file-parallelism`, con `DATABASE_URL` y sin skips de base):
  - archivos: `indices-rutas-calientes`, `analitica-operativa-indices`, `historial-accion-migration`,
    `orden-indices-filtros-migracion`, `orden-busqueda-trgm-migration`, `orden-orden-remision-natural`,
    `gestion-orden-anulacion-migration`, `cohorte-carga-indices.int`, `schema-drift-saneamiento`,
    `historial-accion-lectura`, `historial-accion-orden-total` y `tests/unit/db`;
  - resultado: `Test Files 3 failed | 20 passed (23)`, `Tests 19 failed | 307 passed | 2 skipped`;
  - los 3 archivos rojos están en `baseline-rojos.json`:
    - `historial-accion-lectura`, 16 rojos: pide `db:seed` y el actor de otra empresa;
    - `historial-accion-migration`, los 2 de SL-17;
    - `cohorte-carga-indices`, 1 rojo. **Lo causa M3**: ver puntos abiertos.
- **Guardias y unitarios:** `pnpm exec vitest run tests/unit/guards tests/unit/analytics
  tests/unit/db` (sin `DATABASE_URL`) → `Test Files 1 failed | 407 passed (408)`,
  `Tests 4 failed | 5478 passed | 1 skipped`.
  - El único rojo es `dependencias-declaradas-presentes.guardia` (baseline).
  - `unicos-por-empresa.guardia` pasa.
  - Antes del arreglo de la autocomprobación de `organizacion-en-modelos.guardia` eran
    `2 failed | 406 passed`.

### Mutación

Cada mutación se hizo con `DROP INDEX` en `servi_logistic_sl18` y se restauró después.

| Mutación | Resultado |
|---|---|
| M6: `DROP INDEX orden_organizacion_id_prioridad_created_at_id_idx` | **Rojo**, `2 failed | 11 passed`: pg_indexes y plan. El plan pasa a `Seq Scan on orden` |
| M7: `DROP INDEX gestion_orden_organizacion_id_created_at_idx` | **Rojo**, `2 failed`: el plan pasa a `Seq Scan on gestion_orden g`. En `analitica-operativa-indices`: `2 failed | 5 passed` |
| M8: `DROP INDEX historial_accion_organizacion_id_created_at_id_idx` | **Rojo**, `2 failed`: el plan pasa a `Seq Scan on historial_accion`. En `historial-accion-migration`, además de los 2 de baseline, caen «los TRES índices existen» y «(1/3) la PRIMERA PÁGINA» |
| M9: el de `orden` recreado **sin** `WHERE` | **Rojo**, `1 failed`: el caso de `pg_indexes` caza el predicado perdido |
| M10: `gestion_orden_created_at_idx` de vuelta, junto al nuevo | **Rojo**, `1 failed`: el plan de `contarGestionesVigentes` vuelve al viejo. Confirma por qué se borra |

Restaurado: `pg_indexes` idéntico al de tras el deploy, drift con exit 0 y `13 passed`.

### Desviaciones y puntos abiertos

- **Parcial que Prisma no expresa.** El `WHERE deleted_at IS NULL` vive solo en el SQL, como
  `orden_prioridad_clave_remision_idx`. `migrate diff` no lo ve, así que no hay drift. Lo protege
  el caso de `pg_indexes` (mutación M9).
- **`organizacion-en-modelos.guardia.test.ts` (SL-17), una línea.** Su autocomprobación quitaba
  solo el primer `@@index([organizacionId…])` de `Orden`. Con dos índices, el otro seguía cumpliendo
  R2 y el caso caía. Ahora quita todos (`/gm`). La protección es la misma: `Orden` sin índice por
  empresa → la guardia lo nombra.
- **PUNTO ABIERTO: `cohorte-carga-indices.int.test.ts` (411 R36), caso «y también el de la ventana
  de carga sobre `orden(created_at)`».**
  - **Qué pasa.** Pasaba antes de M3 (6/6) y ahora cae (1 rojo). En la base de test, `orden` está
    vacía (SL-11), y con `enable_seqscan = off` el planificador elige el compuesto nuevo
    (`Index Only Scan`, `created_at` como filtro de índice) en lugar de `orden_created_at_idx`.
    Probado también sin `id` en el índice: cae igual.
  - **Con datos no pasa.** Con 40.000 órdenes sembradas, la misma ventana va por
    `orden_created_at_idx`, como dueño y como `servi_app` con empresa. Es un artefacto de la tabla
    vacía.
  - **Por qué no se tapa.** El archivo está entero en `baseline-rojos.json`, así que el gate no se
    pone rojo. No se tocó: no estaba entre los tests que se podían reescribir, y su protección
    nombra el índice concreto.
  - **Necesita decisión:** que acepte cualquier índice con `created_at` en el `Index Cond`, o que
    siembre volumen como el de SL-18.
- **`count` del listado de órdenes.** Sigue en `Seq Scan`. El índice sirve la página, no el total.

### Veredicto

Ampliación implementada. Entran 3 índices y salen 2 viejos. R24 queda verde en sus 13 casos y en 5
corridas, la mutación caza cada índice, `down.sql` hace la ida y vuelta y el drift está vacío. Queda
abierto un caso de la 411 (cohorte), que el baseline enmascara y que necesita decisión.
