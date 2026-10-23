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
