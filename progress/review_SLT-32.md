# review SLT-32 «Login bloqueado para usuarios sin empresa»

Diff revisado: `origin/dev...e988471` (rama `feature/SLT-32-login-exige-empresa`). Ficha **sin SDD**:
la trazabilidad se mide contra las viñetas de «Alcance» de `progress/features/SLT-32.md`.

## Verificación ejecutada por el reviewer
- `pnpm run typecheck`: exit 0.
- `eslint` sobre los 9 `.ts` tocados: 0 errores, 0 warnings.
- `vitest run tests/unit/auth tests/unit/services/auth-service.test.ts`: 19 archivos, 274/274.
- `vitest run tests/unit/repositories` (por `PUBLIC_SELECT`): 128 archivos, 2045/2045.
- Mutaciones repetidas (las tres revertidas; `git status` limpio después):
  - M-login (`if (!puedeIniciarSesion(usuario))` → `if (false)`): 3 rojos en `SLT-32: usuario sin empresa`.
  - M-OTP (`!usuario || !puedeIniciarSesion(usuario)` → `!usuario` en `verifyChallenge`): 1 rojo
    (`SLT-32: OTP valido de un usuario sin empresa…`).
  - M-actor (lo mismo en `resolveActorFromSession`): 3 rojos (2 en `resolve-actor.test.ts`, 1 en
    `empresa-de-la-peticion.test.ts`).
- `./init.sh` no corrido: rojo conocido y ajeno (validador del board Jira/Trello), excluido por el leader.

## Checklist

### Trazabilidad por viñeta de alcance
- [x] `AuthService.login` sin empresa → `account_unavailable`, intento fallido `sin_empresa`, sin sesión:
  `auth-service.test.ts > SLT-32: usuario sin empresa` (null y "", más el caso de riesgo alto). Mutación roja.
- [x] `verifyChallenge` revalida antes de crear sesión: `SLT-32: OTP valido de un usuario sin empresa…`. Mutación roja.
- [x] `resolveActorFromSession` → `null` sin empresa: `resolve-actor.test.ts` (null, "") y
  `empresa-de-la-peticion.test.ts`. Mutación roja.
- [x] Predicado único `puedeIniciarSesion`, usado por los tres caminos: `puede-iniciar-sesion.test.ts`.
- [x] Mapa alcance → test en `progress/impl_SLT-32.md`.

### CHECKPOINTS.md
- [n/a] Especificación (sin SDD por decisión humana del 2026-10-23).
- [x] Assignee y rama publicada (ficha `in_progress`, Camilo).
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente del PR.
- [ ] **Flujo crítico «Login y sesión»**: el diff cambia el login, el OTP y la resolución de sesión, y no
  hay salida local de ningún E2E en `progress/impl_SLT-32.md` (ver B1).
- [x] Sin dependencias nuevas.
- [x] Sin secretos ni configuración hardcodeada.
- [ ] `./init.sh` en verde: rojo ajeno (board), no imputable a la rama.

### docs/checkpoints-proyecto.md y perfil-agentes > reviewer
- [x] Sin tablas, migraciones ni queries de negocio nuevas; sin literales de país/moneda; sin Ordenex.
- [x] Capas: la regla vive en `lib/auth/` + `lib/services/`; el repositorio solo añade un campo al select.
- [x] Sin `console.log` de PII.
- [x] Comentarios explican el porqué.
- [ ] **Aislamiento entre empresas**: el diff toca la sesión; `e2e/dos-empresas-humo.spec.ts` no se corrió (ver B1).
- [x] `lib/auth/plataforma.ts` no se creó ni se tocó (no existe en el worktree ni en el diff).

## Puntos pedidos por el leader

1. **Bucle de redirecciones: NO hay bucle.** Con sesión válida y usuario sin empresa:
   - `middleware.ts` deja pasar (`isSessionActive` solo mira sesión y `estado`).
   - `app/(app)/layout.tsx` no redirige con actor `null`: pinta el shell con sidebar vacío.
   - `/dashboard`: `primerDestino(itemsVisibles(…, null))` es `null` (`puedeVer` devuelve false sin
     actor), así que no redirige y pinta el placeholder «Bienvenido / Has iniciado sesión correctamente».
   - El resto de páginas de `app/(app)` con actor null hacen `notFound()` o 403; ninguna manda a `/login`.
   - La única que manda a `/login` es `app/paquete/[numGuia]`. De ahí `/login` (sesión válida) va a
     `/dashboard`, y allí se para. Son dos saltos y termina.
   - Las Server Actions lanzan `UnauthenticatedError` con actor null.

   El acceso de negocio sí queda cortado. Lo que no se corta es la sesión: ver m1.
2. **Test R14 de SL-17: coherente.** R14 exige que el usuario sin empresa no opere. Un actor `null` lo
   cumple con más fuerza. La decisión humana del 2026-10-23 bloquea a todo usuario sin empresa mientras no
   exista el superadmin. R14 sigue cubierto en `empresaDeLaPeticion` (`R14: el superadmin (organizacion_id
   NULL) no tiene empresa`, l.150, intacto). El comentario del test deja dicho cuándo revertirlo.
3. **`verifyChallenge`:** no hay efecto indeseado de seguridad. Que `findById` nulo ya no cree sesión
   es fallar cerrado: antes se concedía sesión a un usuario inexistente. El desafío queda consumido
   antes del chequeo, lo cual es correcto: no se puede reintentar. Efectos menores en m2 y m3.
4. **`lib/auth/plataforma.ts`:** no se creó ni se tocó. Sin choque con SL-32.

## Hallazgos

- **B1 — BLOQUEANTE.** Falta la salida local del E2E de dos flujos críticos.
  - Qué falla: `CHECKPOINTS.md > Calidad de código`, con `docs/checkpoints-proyecto.md > Flujos críticos`.
  - Por qué aplica: la feature cambia «Login y sesión» y toca la sesión, así que también aplica
    «Aislamiento entre empresas».
  - Qué hay: `progress/impl_SLT-32.md` no trae ninguna corrida E2E. Es el mismo criterio que bloqueó a
    SL-37 en su vuelta 1.
  - Qué falta:
    - correr `e2e/dos-empresas-humo.spec.ts`. Hace el login real de dos maestros con empresa y prueba
      que el bloqueo no deja fuera a quien sí la tiene;
    - correr `e2e/auth.spec.ts`, o explicar con evidencia por qué no es ejecutable: depende de un usuario
      sembrado a mano;
    - pegar ambas salidas en `progress/impl_SLT-32.md`.
  - Recomendado, no exigido: un caso E2E de login de un usuario sin empresa que vea `account_unavailable`.
- **m1 — menor.** Una sesión ya abierta sin empresa no se cierra.
  - El middleware la deja pasar y `/login` la devuelve a `/dashboard`.
  - El usuario queda en un shell vacío con el texto «Has iniciado sesión correctamente».
  - Solo sale con «Salir». No puede volver a `/login` para ver `account_unavailable`.
  - No hay bucle ni acceso a datos. Queda fuera de la letra del alcance: la viñeta pide `null` en
    `resolveActorFromSession`, y eso se cumple.
  - Propuesta: aplicar `puedeIniciarSesion` en `isSessionActive`, para que el middleware borre la cookie
    y mande a `/login`. Va como ficha aparte o como decisión del humano.
- **m2 — menor.** La rama `usuario_no_encontrado` de `verifyChallenge` (`findById` → `null`) no tiene
  test. Es un cambio de comportamiento: antes creaba sesión.
- **m3 — menor.** El OTP sin empresa responde `invalid_or_expired`, que la UI muestra como código inválido.
  - El mensaje confunde, pero el impacto es bajo: el login, que va antes, ya rechaza con
    `account_unavailable`.
  - Solo lo verá quien pierda la empresa entre el login y el OTP. Está documentado en la bitácora.
- **m4 — menor.** `UsuarioPublico` gana `organizacionId`, así que los consumidores que serializan la forma
  pública al cliente ahora llevan el id de la empresa del propio usuario. Dentro de la misma empresa no es
  sensible. Se anota por si la forma pública cruza a otra empresa en el futuro.
- **m5 — menor (coordinación).** Cuando SL-32 enganche `esPlataforma(rol)`:
  - `puedeIniciarSesion` necesita el rol, y `findByEmailWithHash` solo trae `rolId`;
  - el test de `empresa-de-la-peticion.test.ts` debe volver a esperar el actor.

  Ya está en «Preguntas abiertas». Hay que avisar a Carlos Restrepo en el PR.

## Veredicto
**RECHAZADO**: un bloqueante (B1, falta la evidencia E2E de los flujos críticos tocados). El código y la
trazabilidad unitaria están bien y no hay bucle de redirecciones.

## Vuelta 2 (diff completo `origin/dev...b58bd34`, tras el merge `17ed8b7`)

Se revisa el estado tras las vueltas 2 y 3 del implementer: m1 incluido por decisión humana, E2E
creado y luego retirado, merge de `origin/dev` (SL-18, SL-32) y predicado con plataforma. `origin/dev`
avanzó a `3bc855f` después del merge, pero solo con archivos del arnés (`scripts/trello.mjs`, docs y
una guardia de Trello). No toca auth.

### Verificación ejecutada por el reviewer
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `eslint` sobre los `.ts` del diff: exit 0.
- `vitest run tests/unit/auth` + `auth-service*.test.ts` + los tests de services y guardias del diff:
  28 archivos, 411/411.
- Integración contra el Postgres local (`.env` principal): `auth-action`, `login-varias-empresas` (R14,
  camino OTP con `findCuentaPorId`) y `recuperar-por-empresa` pasan 20/20. `app-layout-superadmin` y
  los middlewares de `chat-media` y `webhook-whatsapp` también pasan.
- Guardias (`vitest run guard`): 4403 pasan y 4 fallan, todos en `dependencias-declaradas-presentes`.
  Ese archivo está en `tests/baseline-rojos.json`, así que no es hallazgo. `e2e-sin-saltos` sale verde.
- Mutación: `tieneEmpresa || esPlataforma(rol)` → sin la excepción de plataforma. Da 6 rojos, uno por
  camino: predicado, login, OTP, actor, guard y R14 de SL-17. Revertida; `git status` limpio.

### Checklist
- [x] Trazabilidad por viñeta de alcance (ficha sin SDD). La mutación pone rojo cada camino:
  - login sin empresa → `auth-service.test.ts > SLT-32: usuario sin empresa`, con null, cadena vacía y riesgo alto;
  - OTP → `verifyChallenge > SLT-32: OTP valido…`, con los casos sin empresa, no activa e inexistente;
  - actor → `resolve-actor.test.ts`, `empresa-de-la-peticion.test.ts`;
  - guard (m1) → `empresa-de-la-peticion.test.ts > SLT-32: isSessionActive…`;
  - predicado único → `puede-iniciar-sesion.test.ts`.
- [x] E2E borrado: nació en esta rama (no existe en `origin/dev`) y no cubría ninguna viñeta que quede
  sin test.
  - Su escenario ya no se puede sembrar: el CHECK `usuario_empresa_o_superadmin` (migración
    `20261023100200`) exige `organizacion_id IS NULL` ⇔ rol superadmin. Un usuario de empresa sin
    empresa no puede existir en la base, así que el bloqueo es defensivo.
  - El caso (b), un usuario con empresa que entra, lo siguen cubriendo `auth.spec.ts` (test 2) y la
    integración `auth-action`.
- [x] La plataforma no pierde la sesión en ningún camino. Hay un test con superadmin en cada uno:
  - login: `SL-32: … SI inicia sesion`;
  - OTP: `SL-32: OTP valido de la cuenta de plataforma…`;
  - actor: `resolve-actor > SL-32…` y `R14: el actor superadmin lleva organizacionId null`, restaurado;
  - guard: el caso `plataforma` dentro del test de `isSessionActive`.
- [x] Exigir `activo` en `resolveActorFromSession` no rompe nada:
  - solo hay dos sitios que crean sesión (`AuthService.login` y `verifyChallenge`), y los dos exigen `activo`;
  - toda ruta que resuelve el actor pasa antes por el middleware, que ya exigía `activo`;
  - las rutas fuera del guard (`/api/cron`, `/api/ordenes/api-key`, `/api/webhooks` y las públicas) no
    llaman a `resolveActorFromSession`: `postulacion-recurso` lo evita a propósito y
    `etiquetas-guia` se usa desde `/paquete`, que sí pasa por el guard;
  - el cambio solo cierra la ventana entre la desactivación y el siguiente request.
- [x] El OTP no filtra información. El fallo nuevo solo se alcanza con el código correcto, y responde
  igual que el código inválido o el desafío vencido (`invalid_or_expired`). La causa (`sin_empresa`,
  `estado_no_activo:<e>`, `usuario_no_encontrado`) solo va a `login_attempt`. No confía el dispositivo
  ni crea sesión.
- [x] El merge no perdió nada de dev en `AuthService.ts` ni en `auth-service.test.ts`:
  - los nombres de todos los `it`/`describe` de dev siguen presentes (comparado con `origin/dev`);
  - el diff de `AuthService.ts` respecto a dev solo cambia la función provisional por el import, un
    comentario y el bloque de `verifyChallenge`;
  - el flujo multiempresa de SL-18 queda intacto: `elegibles`, `riskReason` y `NOMBRE_EMPRESA_PLATAFORMA`.
- [x] m4 de la vuelta 1 resuelto: `UsuarioPublico` y `PUBLIC_SELECT` quedan como en dev. El OTP usa
  `findCuentaPorId`, que reutiliza `CUENTA_SELECT`.
- [x] m2 resuelto: la rama `usuario_no_encontrado` tiene su test.
- [x] Capas, RLS y Ordenex:
  - no hay tablas, migraciones ni queries de negocio nuevas;
  - `findCuentaPorId` lee `usuario` dentro de `comoPlataforma`, igual que el `findById` al que sustituye;
  - sin literales de país ni moneda, sin Ordenex y sin dependencias nuevas;
  - los comentarios explican el porqué.
- [x] La regla vive en un solo sitio: el predicado provisional de SL-18 se borró y los cuatro llamadores
  importan `lib/auth/puede-iniciar-sesion.ts`, que importa `esPlataforma` de `lib/auth/plataforma.ts`
  sin repetir el literal.
- [ ] `gate-completo` en CI: pendiente del PR.
- [~] Flujos críticos E2E (B1 de la vuelta 1): ver mB1.

### Hallazgos
- **mB1 — menor (decisión humana en la puerta de merge).** B1 de la vuelta 1 queda resuelto en lo que
  depende del agente.
  - En la vuelta 2 se corrió `auth.spec.ts`. El login con empresa entra, y los rojos están explicados
    como deuda del spec, no de SLT-32.
  - `dos-empresas-humo.spec.ts` está montado como dice su cabecera, pero no se ejecutó. Faltan
    `SL17_HUMO_MAESTRO_A/_B`, dos buzones reales que debe dar un humano.
  - Nada de esto se repitió tras la vuelta 3. Ahora el guard lee `rol` en el middleware y el actor exige
    `activo`.
  - Antes del merge, recomendado: correr `e2e/superadmin-arranque.spec.ts`, el camino de plataforma
    por el middleware, y que el humano decida si el humo de dos empresas se corre o queda abierto.
  - No bloquea: está cubierto por unit, por integración real y por la mutación.
- **m3 — menor (se mantiene).** Si un usuario pierde la empresa entre el login y el OTP, ve
  «código inválido». Es aceptable: es el único fallo del contrato y no filtra información.
- **m6 — menor.** `progress/impl_SLT-32.md` atribuye el rojo (c) de m1 en E2E (500 por
  `EmpresaNoResuelta`) a dos instancias de `AsyncLocalStorage`. Dev ya lo corrigió en `c04da42`
  (ALS en `globalThis`, entró con el merge). Con el E2E retirado no queda prueba de extremo a extremo
  de la redirección a `/login`. Como el caso no se puede sembrar, es solo informativo.

### Veredicto vuelta 2
**OK**: sin bloqueantes. El merge conserva lo de dev, el predicado es único y respeta la plataforma, y
los cuatro caminos tienen tests que fallan si se rompe la regla.
