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
