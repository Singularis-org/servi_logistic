# SLT-32 «Login bloqueado para usuarios sin empresa»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-32 | login-exige-empresa | backend | low | feature/SLT-32-login-exige-empresa | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1: implementación. Ficha **sin SDD** (sin label `sdd`, decisión del humano): no hay `specs/`;
el alcance es la descripción de la tarjeta, copiada abajo en «Alcance».

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

## Preguntas abiertas
- Coordinación con SL-32: cuando SL-32 mergee `lib/auth/plataforma.ts`, el predicado debe
  aceptar `esPlataforma(rol)`. Quien mergee segundo lo engancha. Avisar a Carlos Restrepo en el PR.

## Tandas

## Modelos (overrides)

## Cierre
