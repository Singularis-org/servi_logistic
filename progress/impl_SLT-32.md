# impl SLT-32 — Login bloqueado para usuarios sin empresa (backend_dev)

Ficha sin SDD: no hay `R<n>`; el mapa va contra los puntos del alcance (`progress/features/SLT-32.md`).

## Archivos
- Nuevo: `lib/auth/puede-iniciar-sesion.ts` (predicado unico `puedeIniciarSesion({ organizacionId })`).
- `lib/services/AuthService.ts`: chequeo en `login` (tras estado, antes del riesgo) y en `verifyChallenge` (antes de confiar el dispositivo y crear la sesion).
- `lib/auth/resolve-actor.ts`: devuelve `null` si el predicado falla.
- `lib/interfaces/repositories/IUserRepository.ts` + `lib/repositories/UserRepository.ts`: `organizacionId` en `UsuarioPublico` / `PUBLIC_SELECT` (lo necesita `findById` del OTP; `findByEmailWithHash` ya traia la fila entera).
- Tests: `tests/unit/auth/puede-iniciar-sesion.test.ts` (nuevo), `tests/unit/services/auth-service.test.ts`, `tests/unit/auth/resolve-actor.test.ts`, `tests/unit/auth/empresa-de-la-peticion.test.ts` (caso SL-17 R14 superadmin invertido; ver dudas).

## Alcance → test
- Login sin empresa → `auth-service.test.ts > AuthService.login > SLT-32: usuario sin empresa > rechaza con account_unavailable y registra intento fallido sin_empresa cuando la empresa es null|vacia` y `> no emite OTP a un usuario sin empresa aunque el riesgo sea alto`.
- Login con empresa sin cambios → `> con empresa concede la sesion igual que antes y no registra sin_empresa` (+ suite previa de login en verde).
- OTP sin empresa → `AuthService.verifyChallenge > SLT-32: OTP valido de un usuario sin empresa no concede sesion ni confia el dispositivo`.
- Actor sin empresa → `resolve-actor.test.ts > SLT-32: devuelve null cuando la sesion es valida pero la empresa del usuario es null|vacia`; `empresa-de-la-peticion.test.ts > SLT-32: un usuario sin empresa no obtiene actor mientras el superadmin no exista`.
- Predicado → `puede-iniciar-sesion.test.ts` (con empresa, null, ausente, "" y "   ").

## Mutaciones (todas rojas, todas revertidas)
- M1 quitar chequeo en login → 3 tests de `SLT-32: usuario sin empresa`.
- M2 quitar chequeo en verifyChallenge → `SLT-32: OTP valido de un usuario sin empresa...`.
- M3 quitar chequeo en resolveActor → 2 de resolve-actor + 1 de empresa-de-la-peticion.
- M4 predicado `return true` → 11 tests.
- M5 predicado sin `trim`/vacio → 4 tests (casos vacios).

## Salida
- `vitest related --run` (archivos tocados, antes del ajuste del test SL-17): 643 archivos, 8179 pasan, 1 falla (`empresa-de-la-peticion > R14: el actor superadmin lleva organizacionId null`), 505 skipped. Tras el ajuste: los 5 archivos de auth, 43/43.
- `pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 232 warnings preexistentes; en los archivos tocados, 0 nuevos.

### Verificacion del implementer (2026-10-23, tras commits fe1a5e1 + ac7066f)
- `vitest run` de los 4 archivos de auth tocados: 4 files, 42/42 pasan.
- `vitest related --run` sobre el diff vs `dev`: 578 files pasan / 65 skipped; 8180 tests pasan, 505 skipped, 0 fallan.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: 0 errores, 232 warnings (preexistentes).
- `pnpm run test:guardias`: 297 files pasan, 1 falla (4 tests) en
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (marcador de paso 2 de
  `init.sh`). Preexistente: archivo listado en `tests/baseline-rojos.json`; esta rama no toca `init.sh`.
- `./init.sh` (rapido): **exit 1 en el validador de `feature_list.json`**, antes de llegar a tests:
  fichas de otro board (`SLT-32`, se esperaba proyecto `SL`), id duplicado 32
  (rol-superadmin / login-exige-empresa) y SL-38 en vuelo sin assignee. Es estado del board /
  `arnes.config.json > jira.project`, no del codigo: lo resuelve el leader.

## Decisiones / avisos para el leader
- Test SL-17 R14 (`empresa-de-la-peticion.test.ts`) invertido a esperar `null`, por la decision
  humana 2026-10-23. Cuando SL-32 enganche `esPlataforma(rol)` debe volver a esperar el actor. Avisar a Carlos Restrepo.
- El predicado hoy recibe solo `organizacionId`; `findByEmailWithHash` trae `rolId`, no el rol.
  SL-32 tendra que pasar el rol al ampliarlo.
- `verifyChallenge` sin empresa responde `invalid_or_expired` (unico fallo existente del contrato;
  la UI lo muestra como `otp_invalid`). Efecto colateral: si `findById` no encuentra al usuario, ya no se crea sesion (`usuario_no_encontrado`).
- Riesgo fuera de alcance: `isSessionActive` (`lib/auth/session-guard.ts:23-38`) no aplica el
  predicado; una sesion abierta sin empresa pasa el middleware y `app/login/page.tsx:17-23` la
  devolveria a `/dashboard` → posible bucle de redirecciones (no verificado).
- backend_dev corrio `pnpm install --frozen-lockfile` en el worktree: tiene `node_modules` propio
  (no enlazado). Lockfile sin cambios.

## Veredicto
Implementado; tests tocados y related en verde. Gate rapido rojo por el validador del board (ajeno al codigo).

## Vuelta 2 (m1 y m2 de la review, 2026-10-23)

### Archivos
- `lib/auth/session-guard.ts`: `isSessionActive` exige `estado === "activo" && puedeIniciarSesion(usuario)`.
  `organizacionId` entra en el MISMO `select` de `usuario.findUnique` (sin otra lectura). Sigue en
  `comoPlataforma("SL-17", "validar sesión")`. Docstring: tres condiciones.
- `lib/auth/puede-iniciar-sesion.ts`: solo el comentario de cabecera (lista de quienes lo consultan).
- `tests/unit/auth/empresa-de-la-peticion.test.ts`: test nuevo (m1).
- `tests/unit/services/auth-service.test.ts`: test nuevo (m2).
- Sin tests existentes ajustados: los de middleware mockean `isSessionActive`, y el unico que
  ejercita la implementacion real («isSessionActive valida en plataforma…») ya usaba usuarios con empresa.

### Middleware (m1)
`middleware.ts:72` pasa solo si `isSessionActive` es true; si no, `middleware.ts:76` responde con
`rechazoSinSesion` (redirect a `/login`, `:109-112`) y `middleware.ts:80` borra la cookie. Igual
que con una sesion caducada. Con esto se cierra el posible bucle `/login` ↔ `/dashboard` que se
anoto arriba.

### Tests nuevos → mutacion
- `SLT-32: isSessionActive rechaza la sesion de un usuario activo sin empresa (null o vacia)`
  (null y "" → false; con empresa → true; 3 lecturas de usuario para 3 validaciones, con
  `select { estado, organizacionId }`). Mutacion: `return usuario?.estado === "activo";` → cae solo este test (1/16).
- `SLT-32: OTP valido cuyo usuario ya no existe no concede sesion y registra usuario_no_encontrado`.
  Mutacion: `if (usuario && !puedeIniciarSesion(usuario))` (compila: tsc 0 errores) → cae solo este test (1/18).
- Las dos mutaciones se revirtieron; no quedan en el diff.

### Verificacion
- `vitest run` de los 2 archivos: 34/34 en verde.
- `vitest related --run` (session-guard, predicado y los 2 tests): 522 files pasan / 36 skipped;
  7389 tests pasan, 283 skipped, 0 fallan.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: 0 errores, 232 warnings (preexistentes).

Veredicto vuelta 2: m1 y m2 cerrados, en verde.

## Vuelta 2 — E2E (hallazgo B1 de la review, 2026-10-23, backend_dev)

### Archivos
- `e2e/login-sin-empresa.spec.ts` (nuevo). Nada mas tocado en codigo: `git diff lib/` vacio.

### Montaje (sin credenciales)
- `:3000` lo ocupa el dev server de OTRO proyecto (`arc/labs`): no se toco ni se reutilizo. Server propio
  en `:3011` con una config de Playwright TEMPORAL fuera del repo (scratchpad: `testDir` al `e2e/` del
  worktree, `baseURL`/`webServer` en `:3011`, `reuseExistingServer: false`, `workers: 1`).
  `playwright.config.ts` sin cambios. `rm -rf .next` antes de cada arranque.
- Base: Postgres LOCAL (`localhost:5432`). Base DESECHABLE `slt32_e2e` creada para esto
  (`prisma migrate deploy` + `pnpm run db:seed`). Un lanzador del scratchpad carga el `.env` principal
  solo en su proceso, reescribe `DATABASE_URL` a `slt32_e2e`, quita `DIRECT_URL`, fija
  `NEXT_PUBLIC_APP_URL` a `:3011` y `PRISMA_LOG_QUERIES=off`; aborta si el host no es local. La base
  del `.env` no se uso. No se copio el `.env` al worktree.
- Sin OTP: el dispositivo del navegador queda confiado (como `_dos-empresas-fixture.ts`).

### 1. `e2e/login-sin-empresa.spec.ts`
- (a) usuario activo, contraseña correcta, `organizacion_id` NULL → se queda en `/login`, ve
  «Esta cuenta no está disponible para iniciar sesión», 0 sesiones, 1 `login_attempt` con `sin_empresa`.
- (b) control con empresa, mismo montaje → sale de `/login` y tiene 1 sesion.
- (c) m1. La base NO deja quitarle la empresa a un usuario (trigger `impedir_cambio_de_empresa`, SL-17:
  `una fila no cambia de empresa: usuario`, visto en una corrida intermedia), asi que el caso real de m1
  es una sesion VIVA de un usuario sin empresa (p. ej. emitida antes de SLT-32). Se siembra la fila de
  `session` y su cookie; control: lo mismo con empresa → `/dashboard` 200.
- Lo sembrado se borra en `afterAll` (sesiones, intentos, dispositivos, OTP, preferencias, usuarios, organizacion).

Corrida final:
```
Running 3 tests using 1 worker

  ✓  1 e2e\login-sin-empresa.spec.ts:125:7 › SLT-32 — el login exige empresa › (a) un usuario activo sin empresa se queda en /login con «cuenta no disponible» (13.8s)
  ✓  2 e2e\login-sin-empresa.spec.ts:143:7 › SLT-32 — el login exige empresa › (b) control: un usuario con empresa, mismo montaje, sí entra (1.9s)
  ✘  3 e2e\login-sin-empresa.spec.ts:155:7 › SLT-32 — el login exige empresa › (c) m1: una sesión viva de un usuario sin empresa vuelve a /login en el siguiente request (2.9s)

  1) ... › (c) m1: una sesión viva de un usuario sin empresa vuelve a /login en el siguiente request

    Error: expect(received).toEqual(expected) // deep equality
      Object {
    -   "ruta": "/login",
    -   "status": 200,
    +   "ruta": "/dashboard",
    +   "status": 500,
      }

  1 failed
  2 passed (30.8s)
```
Log del server en esa peticion (1 ocurrencia):
```
[WebServer] ⨯ EmpresaNoResuelta: Sin empresa en contexto para Usuario.findUnique: la operacion no se ejecuto
[WebServer]     at aplicar (lib\db\extension-empresa.ts:206:29)
[WebServer]     at <unknown> (lib\db\extension-empresa.ts:241:26)
[WebServer]     at async (lib\auth\session-guard.ts:36:21)
[WebServer]     at async esperarDentro (lib\db\contexto-empresa.ts:24:10)
[WebServer]     at async middleware (middleware.ts:72:21)
```

**Rojo de (c): defecto real, PREEXISTENTE de SL-17, que deja m1 sin cumplir en el dev server.**
- `isSessionActive` envuelve la lectura en `comoPlataforma(...)`, pero la extension NO ve ese
  contexto: `contextoActual()` devuelve `undefined` (extension-empresa.ts:230) y cae al resolutor por
  sesion (:240). Con empresa, el resolutor la devuelve y la lectura pasa (por eso el control da 200).
  Sin empresa no hay contexto → `EmpresaNoResuelta` → el middleware responde 500 en vez de
  redirigir a `/login`, y la cookie no se borra.
- Causa probable (no verificada a fondo): dos instancias de `AsyncLocalStorage`
  (`lib/db/contexto-empresa.ts:14`, `const` de modulo). El cliente Prisma es un singleton en
  `globalThis.__prisma__` (prisma-client.ts:129-148) que creo el bundle de la app (la Server Action de
  login); el middleware se compila aparte y su `comoPlataforma` escribe en SU almacen, no en el que lee
  la extension. Misma familia que el «dos instancias de AsyncLocalStorage» anotado en SL-17 T4.2. No
  probado en build de produccion.
- Preexistente: la lectura que falla (`session-guard.ts:36`, `usuario.findUnique` dentro de
  `comoPlataforma`) ya estaba en `197039c` (merge-base, `select: { estado: true }`); SLT-32 solo añadio
  `organizacionId` al `select`. Antes de SLT-32 una sesion de un usuario sin empresa daba el mismo 500.
- Efecto: el usuario sin empresa NO accede (500), pero NO vuelve a `/login`. El test unitario de m1
  pasa porque corre en un solo modulo; el E2E es el que lo destapa. Decision para el leader/humano.

### Mutacion (a)
`if (!puedeIniciarSesion(usuario))` → `if (false)` en `lib/services/AuthService.ts` (server arrancado
de cero con el archivo mutado):
```
  ✘  1 e2e\login-sin-empresa.spec.ts:125:7 › ... › (a) un usuario activo sin empresa se queda en /login con «cuenta no disponible» (8.1s)
  -  2 ... (b) control ...
  -  3 ... (c) m1 ...

    Error: expect(locator).toBeVisible() failed
    Locator: getByRole('alert').filter({ hasText: 'Esta cuenta no está disponible para iniciar sesión' })
    Expected: visible
    Error: element(s) not found

  1 failed
  2 did not run
```
Revertido con Edit; `git diff lib/` vacio.

### 2. `e2e/auth.spec.ts`
Sembrados en `slt32_e2e`, con empresa y dispositivo confiado: `valid-user@example.com` /
`correct-password` y `locked-user@example.com` con 5 `login_attempt` fallidos recientes
(`AUTH_MAX_FAILED_ATTEMPTS` = 5). `otp-required-user@example.com` NO se sembro (el test usa un codigo
fijo «123456» de placeholder: no es ejecutable tal cual).
```
Running 11 tests using 1 worker

  ✘   1 e2e\auth.spec.ts:38:9 › Auth E2E Flow › (a) Successful login without challenge › should login and redirect to home (8.4s)
  ✓   2 e2e\auth.spec.ts:62:9 › Auth E2E Flow › (a) Successful login without challenge › should respect redirect query parameter (1.3s)
  ✘   3 e2e\auth.spec.ts:80:9 › Auth E2E Flow › (b) Invalid credentials › should show generic error message and remain on /login (730ms)
  ✘   4 e2e\auth.spec.ts:102:9 › Auth E2E Flow › (b) Invalid credentials › should show validation errors for empty fields (5.7s)
  ✘   5 e2e\auth.spec.ts:115:9 › Auth E2E Flow › (c) Account locked › should show account locked error with retry time (727ms)
  ✘   6 e2e\auth.spec.ts:145:9 › Auth E2E Flow › (d) Logout using PageHeader topbar button › should logout and redirect to the public home (/) (5.7s)
  ✘   7 e2e\auth.spec.ts:175:9 › Auth E2E Flow › (d) Logout using PageHeader topbar button › after logout, accessing protected route should redirect to /login (5.7s)
  ✘   8 e2e\auth.spec.ts:204:9 › Auth E2E Flow › OTP Challenge Flow › should transition to challenge phase and verify OTP code (5.8s)
  ✘   9 e2e\auth.spec.ts:247:9 › Auth E2E Flow › Accessibility › login form should be keyboard navigable (5.6s)
  ✓  10 e2e\auth.spec.ts:263:9 › Auth E2E Flow › Accessibility › should move focus to first error field after invalid submission (783ms)
  ✘  11 e2e\auth.spec.ts:276:9 › Auth E2E Flow › Accessibility › error messages should have aria-live and aria-describedby (666ms)

  1) (a) should login and redirect to home
    TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
    waiting for navigation to "/" until "load"
      navigated to "http://localhost:3011/dashboard"
  2) (b) should show generic error message and remain on /login
    Error: strict mode violation: getByRole('alert') resolved to 2 elements:
        1) <div role="alert" data-slot="alert" ...> aka getByRole('alert').filter({ hasText: 'Correo o contraseña inválidos' })
        2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
  3) (b) should show validation errors for empty fields
    Locator:  getByRole('alert')  Expected: 2  Received: 3
  4) (c) should show account locked error with retry time
    Error: strict mode violation: getByRole('alert') resolved to 2 elements:
        1) <div role="alert" data-slot="alert" ...> aka getByRole('alert').filter({ hasText: 'Cuenta bloqueada. Intenta de' })
        2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
  5) (d) should logout and redirect to the public home (/)
    TimeoutError: page.waitForURL: Timeout 5000ms exceeded.  navigated to "http://localhost:3011/dashboard"
  6) (d) after logout, accessing protected route should redirect to /login
    TimeoutError: page.waitForURL: Timeout 5000ms exceeded.  navigated to "http://localhost:3011/dashboard"
  7) OTP Challenge Flow
    Error: expect(locator).toBeVisible() failed  Locator: locator('input[id="code"]')  element(s) not found
  8) login form should be keyboard navigable
    Error: expect(locator).toBeFocused() failed  Locator: locator('input[type="email"]')  Received: inactive
  9) error messages should have aria-live and aria-describedby
    Error: strict mode violation: getByRole('alert') resolved to 3 elements: #email-error, #password-error, #__next-route-announcer__

  9 failed
  2 passed (1.1m)
```
(Mensajes de error resumidos; se omiten trazas y avisos `[WebServer]`.)

Causa de cada rojo. Ninguno es imputable a SLT-32: el diff de la rama no toca UI, rutas ni el form.
- 1), 5), 6): el login con empresa FUNCIONA (sale de `/login` a `/dashboard`); el spec espera `/` (y
  `localhost:3000` fijo). `getRedirectTarget` manda a `/dashboard` por defecto desde `86d70bf`
  (punto de partida) y la landing `/` es publica (feature 86). Spec desactualizado. El test 2
  (`?redirect=/dashboard`) pasa con el mismo usuario: SLT-32 no deja fuera a quien tiene empresa.
- 2), 4): el mensaje correcto SI esta en pantalla (Playwright lo cita: «Correo o contraseña
  inválidos», «Cuenta bloqueada. Intenta de…»); falla el localizador `getByRole('alert')` sin filtrar,
  que tambien encuentra el `__next-route-announcer__` vacio de Next. Spec fragil, preexistente.
- 3), 9): mismo motivo (3 `alert` en vez de 2).
- 7) OTP: usuario `otp-required-user` no sembrado y codigo placeholder; el spec se declara no ejecutable.
- 8) teclado: el primer Tab no cae en el email (otro elemento enfocable antes en `/login`). UI
  preexistente; SLT-32 no toca `app/`.

### 3. `e2e/dos-empresas-humo.spec.ts`
`SL17_HUMO_MAESTRO_A/_B` NO existen en el entorno ni en el `.env` principal: no se inventaron correos.
Primera corrida (webServer de la config temporal, sin log):
```
  ✘  1 e2e\dos-empresas-humo.spec.ts:139:5 › alta de A y B por el servicio, repetición idempotente y correo de recuperación aceptado por el SMTP (1ms)
  -  2..6 (did not run)
    Error: SL-17 T4.2: falta SL17_HUMO_LOG_SERVIDOR (archivo con el stdout/stderr del dev server). Sin él no se ve EmpresaNoResuelta.
  1 failed
  5 did not run
```
Segunda corrida, montada como dice su cabecera (dev server propio en `:3011` con stdout/stderr a un
archivo y `SL17_HUMO_LOG_SERVIDOR` apuntando a el; SMTP del `.env` principal):
```
  ✘  1 e2e\dos-empresas-humo.spec.ts:139:5 › alta de A y B por el servicio, repetición idempotente y correo de recuperación aceptado por el SMTP (0ms)
  -  2..6 (did not run)
    Error: SL-17 T4.2: falta SL17_HUMO_MAESTRO_A (el correo real del maestro de A, solo local y QA).
  1 failed
  5 did not run
```
Falta: dos buzones reales de prueba en `SL17_HUMO_MAESTRO_A/_B` (los da un humano; el arbol no puede
llevarlos). El resto del montaje ya quedo probado aqui. Sin ejecutar no hay evidencia de aislamiento:
queda abierto.

### Verificacion
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint e2e/login-sin-empresa.spec.ts`: exit 0, sin salida.
- Guardia `recursos-origen-fuera`: 35 passed, 1 skipped (emails solo `@example.test`/`@example.com`).

### Limpieza
- `DROP DATABASE slt32_e2e WITH (FORCE)` → «existe slt32_e2e? false».
- Dev servers propios muertos: 0 procesos escuchando en `:3011`. `:3000` (labs) intacto.
- `git diff lib/` vacio; `.next` del worktree borrado; log del server borrado (dev registra los
  argumentos de las Server Actions).

Veredicto vuelta 2 E2E: login sin empresa bloqueado y con empresa entra (mutacion la pone roja); m1 ROJO
en E2E por un defecto preexistente de SL-17 en el middleware (500 en vez de /login); humo de dos
empresas no ejecutable sin `SL17_HUMO_MAESTRO_A/_B`.

## Vuelta 3 (2026-10-28) — merge de `origin/dev` y predicado unificado con SL-18 §9

### Archivos
- `lib/auth/puede-iniciar-sesion.ts`: `puedeIniciarSesion({ estado, organizacionId, rol })` =
  `activo && (empresa no vacia || esPlataforma(rol))`. Un solo tipo de entrada para los cuatro
  llamadores (sirve a `CuentaConHash`, `CuentaPublica` y a la fila Prisma con `rol` aplanado).
- `lib/services/AuthService.ts`: conflicto resuelto con el flujo multiempresa de SL-18; se borra
  la funcion provisional y se importa la unica. `verifyChallenge` usa `findCuentaPorId` y registra
  `usuario_no_encontrado` / `estado_no_activo:<estado>` / `sin_empresa`; responde
  `invalid_or_expired` (unico fallo del contrato del OTP).
- `lib/interfaces/repositories/IUserRepository.ts`, `lib/repositories/UserRepository.ts`:
  `findCuentaPorId(id): CuentaPublica | null` (reusa `CUENTA_SELECT`/`aCuentaPublica`). Se revierte
  el `organizacionId` en `UsuarioPublico`/`PUBLIC_SELECT` de la vuelta 1.
- `lib/auth/resolve-actor.ts`, `lib/auth/session-guard.ts`: pasan `{ ...usuario, rol: rol.value }`;
  el guard pide `rol { value }` en la misma lectura. `resolveActorFromSession` exige ahora tambien
  `activo` (antes solo el guard).
- Borrado `e2e/login-sin-empresa.spec.ts` (no sembrable con el CHECK de SL-32; sin proyecto).
- Tests: `auth-service.test.ts` (conflicto + mocks a `findCuentasPorEmailConHash`/`findCuentaPorId`
  + plataforma en login y OTP + OTP de cuenta bloqueada), `puede-iniciar-sesion.test.ts` (reescrito),
  `resolve-actor.test.ts` (estado + plataforma + no activo), `empresa-de-la-peticion.test.ts`
  (restaurado R14 de SL-17: superadmin con actor `organizacionId: null`; guard con plataforma viva),
  y `findCuentaPorId: vi.fn()` en 8 dobles completos de `IUserRepository`.

### Alcance → test
- Login sin empresa (rol de empresa) → `auth-service.test.ts > SLT-32: usuario sin empresa > rechaza con account_unavailable ... (null|vacia)` y `> no emite OTP ...`.
- Login plataforma permitido → `> SL-32: la cuenta de plataforma (superadmin, sin empresa) SI inicia sesion`.
- OTP sin empresa / no activa / inexistente / plataforma → `AuthService.verifyChallenge > SLT-32: OTP valido de un usuario sin empresa ...`, `> ... dejo de estar activa ...`, `> ... ya no existe ...`, `> SL-32: OTP valido de la cuenta de plataforma ... concede sesion`; real contra Postgres: `tests/integration/actions/login-varias-empresas.test.ts > R14` (camino OTP con `findCuentaPorId`).
- Actor → `resolve-actor.test.ts > SLT-32: devuelve null ... (null|vacia)`, `> SL-32: la cuenta de plataforma ... conserva su actor`, `> SLT-32: ... ya no esta activo`; `empresa-de-la-peticion.test.ts > R14`, `> SLT-32: un usuario de rol de empresa sin empresa no obtiene actor`, `> SLT-32: un usuario inactivo no obtiene actor ...`.
- Guard (m1) → `empresa-de-la-peticion.test.ts > SLT-32: isSessionActive rechaza la sesion de un usuario de empresa sin empresa (null o vacia)` (incluye plataforma viva) y `> isSessionActive ... sigue exigiendo usuario activo`.
- Predicado → `puede-iniciar-sesion.test.ts` (empresa, null, blanco, superadmin, inactivo/bloqueado/pendiente).
- Plataforma E2E (sin cambios): `superadmin-arranque`, `superadmin-empresas` (login + `/plataforma/empresas`).

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0 (tras `pnpm install --frozen-lockfile` y `prisma generate`: el worktree tenia node_modules y cliente Prisma de antes del merge).
- `pnpm exec eslint <18 archivos tocados>`: exit 0.
- Unit auth + usuario + actions (`tests/unit/auth tests/unit/actions` + 9 archivos de services): 139 files, 1849/1849.
- Guardias `tests/unit/guards`: 222 passed, 3 failed → `dependencias-declaradas-presentes` (preexistente, en `tests/baseline-rojos.json`; `init.sh` igual a dev), `e2e-sin-saltos` (era `login-sin-empresa.spec.ts` sin proyecto: resuelto al borrarlo), `otp-debug-solo-en-pruebas` (timeout bajo carga, 27 s; verde al repetir).
- Integracion de auth contra Postgres local (`auth-action`, `login-varias-empresas`, `recuperar-por-empresa`, middlewares, repositorios de usuario): 8 files, 32/32.
- `vitest related --run` de los 5 archivos de `lib/` tocados: 645 files, 589 pasan / 56 fallan. Separado:
  - 9 de componentes/unit: flakes bajo carga; repetidos solos, 9 files 171/171.
  - 47 de integracion: entorno local. Base sin sembrar (31× «faltan la zona central, el tipo `cedula` o una orden», mas «tabla `orden` vacia», «no tiene ninguna zona»), superadmin previo en la base (`aislamiento-usuarios`, `usuario-empresa-o-superadmin`, `usuarios-sin-superadmin`: «la base ya tiene un superadmin»), y esquema/datos de la wallet (`wallet-458-migration` 23503≠23001, `wallet-tienda-cobro`, `aporte-capital`, `wallet-cierres-selector`, `premio-ranking-idempotencia`). Ninguno toca sesion, actor, OTP ni `findCuentaPorId` (grep: 0 referencias); siguen rojos repetidos solos.

Veredicto vuelta 3: predicado unico con plataforma permitida, OTP revalidado; verde en lo que toca el cambio, rojos de integracion restantes son de la base local.
