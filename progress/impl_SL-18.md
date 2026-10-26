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
