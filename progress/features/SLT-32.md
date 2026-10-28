# SLT-32 «Login bloqueado para usuarios sin empresa»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-32 | login-exige-empresa | backend | low | feature/SLT-32-login-exige-empresa | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 cerrada en la vuelta 3: rama al día con `dev` (merge de `origin/dev`, con SL-18 y SL-32) y
predicado unificado con el contrato de SL-18 design §9. Lista para review/PR. Ficha **sin SDD**
(sin label `sdd`, decisión del humano): no hay `specs/`; el alcance es la descripción de la
tarjeta, copiada abajo en «Alcance».

## Evaluación
- **zone: backend.** Toca `AuthService`, la action de login y `resolveActorFromSession`; la UI ya
  muestra `account_unavailable`.
- **complexity: low.** Un predicado y tres puntos de chequeo, con sus tests.
- **Cupo:** primera feature `backend` en vuelo de Camilo.
- **Cruce de archivos:** `archivos-en-vuelo.mjs --candidata SLT-32` no puede validar sin
  `tasks.md`. Revisión manual contra lo que ya tocan las ramas en vuelo de otra persona:
  - SL-32 (Carlos Restrepo): toca `app/login/_components/LoginForm.tsx` y añade
    `lib/auth/plataforma.ts` (`esPlataforma`, rol `superadmin`). No toca `AuthService`,
    `lib/actions/auth.ts` ni `lib/auth/resolve-actor.ts`. Sin choque de archivos.
  - SL-31 (Carlos Restrepo): no toca auth.
  - SL-38: sin assignee; no toca auth.

## Alcance (de la tarjeta)
Un usuario sin `organizacion_id` no puede iniciar sesión salvo que su rol sea superadmin.
Mientras el rol superadmin no exista en `dev` (llega con SL-32), se bloquea a todo usuario sin
empresa.
- `AuthService.login`: sin empresa → intento fallido con `riskReason: "sin_empresa"` y respuesta
  `account_unavailable`. No se crea sesión.
- `AuthService.verifyChallenge` (camino OTP): el mismo chequeo antes de crear la sesión.
- `resolveActorFromSession`: devuelve `null` para un usuario sin empresa (corta sesiones abiertas).
- Un único predicado (p. ej. `puedeIniciarSesion`) que SL-32 amplíe con «o es superadmin».
- Tests de los tres caminos.

## Decisiones
- 2026-10-23 — El humano: «hay que evitar que ingrese a menos que su rol sea superadmin; por
  ahora, mientras nace el rol, debe verificar que tenga una empresa asociada; si no, bloquea el
  ingreso».
- 2026-10-23 — El humano: ficha nueva, sin SDD.
- 2026-10-23 — El humano: incluir m1 de la review. `isSessionActive` (middleware) aplica también
  `puedeIniciarSesion`: una sesión abierta de un usuario sin empresa se trata como caducada (se
  borra la cookie y se manda a `/login`).

- 2026-10-28 — Vuelta 3 (backend_dev, encargo del leader): SLT-32 mergea segundo y engancha.
  `puedeIniciarSesion({ estado, organizacionId, rol })` = `activo && (empresa || esPlataforma(rol))`
  (contrato SL-18 design §9). Lo usan `AuthService.login` (cada cuenta candidata; sustituye la
  función provisional de SL-18), `verifyChallenge`, `resolveActorFromSession` e `isSessionActive`.
  Efecto nuevo: `resolveActorFromSession` también exige `activo` (antes solo lo hacía el guard).
- 2026-10-28 — El OTP lee la cuenta con `IUserRepository.findCuentaPorId` (forma `CuentaPublica`:
  estado, empresa, rol) en vez de ampliar `UsuarioPublico`; se revierte el `organizacionId` que la
  vuelta 1 había añadido a `UsuarioPublico`/`PUBLIC_SELECT`.
- 2026-10-28 — Se retira `e2e/login-sin-empresa.spec.ts`: con el CHECK `usuario_empresa_o_superadmin`
  de SL-32 una cuenta de empresa sin empresa no se puede sembrar (ni existir), y el spec no estaba en
  ningún proyecto de Playwright (`e2e-sin-saltos` rojo, `spec-sin-proyecto`). El camino permitido
  (superadmin sin empresa entra y su sesión vive en `/plataforma`) ya lo cubren
  `superadmin-arranque` y `superadmin-empresas`. El bloqueo queda defensivo y probado en unit.

## Preguntas abiertas
- (Cerrada 2026-10-28) Coordinación con SL-32: SL-32 ya está en `dev`; el predicado acepta
  `esPlataforma(rol)`. En el PR basta mencionarlo a Carlos Restrepo como aviso, no hay trabajo suyo.

## Tandas
- 2026-10-28 · vuelta 3: merge `origin/dev` + predicado SL-18 §9 + OTP/actor/guard con plataforma · `17ed8b7` · typecheck y eslint verdes; unit auth 1849/1849; integracion auth 32/32; guardias verdes salvo `dependencias-declaradas-presentes` (baseline); `vitest related` con 47 rojos de integracion de base local sin sembrar/superadmin previo (detalle en `progress/impl_SLT-32.md`).

## Modelos (overrides)

## Cierre
