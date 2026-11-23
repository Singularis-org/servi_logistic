# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» · T6.1 y T6.2 (frontend_dev)

Estado: **verde** (2026-11-18, implementer). T6.1 y T6.2 en `[x]`.

## Archivos

- `e2e/planes-borrador.spec.ts` (nuevo, T6.1, R30).
- `playwright.config.ts`: `planes-borrador` en el proyecto `aislamiento`, junto a `planes-superadmin`, `planes-costeo` y
  `mi-plan-cambiar-plan` (un solo proyecto, guardia `e2e-sin-saltos`).
- `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts`, `e2e/planes-costo-porcentual.spec.ts` (T6.2): el
  helper de paso pulsa «Guardar y continuar» en lugar de «Siguiente». Las aserciones no cambian.

## R30 → test

| Requisito | Test |
|---|---|
| R30.1, R30.2 | `e2e/planes-borrador.spec.ts` — «R30: crear y editar un plan por pasos con borrador — crear, cerrar, retomar desde «Borradores» y «Crear plan»» |
| R30.3, R30.4, R30.5 | `e2e/planes-borrador.spec.ts` — «R30: crear y editar un plan por pasos con borrador — editar con empresas, retomar, fecha de cada empresa y programar» |

## Qué recorre

- Datos: dos empresas (`crearEmpresaE2E`) y un plan público con costo (`crearPlanPublicoConCosto`), asignado por
  `PlanesRepository.asignar` a M («Mensual») y a N («Anual»). El superadmin entra con OTP.
- Crear: tres pasos guardados, se cierra el panel con «Cerrar», aviso «El borrador queda guardado…», fila con
  «Plan nuevo» en la región «Borradores». «Retomar» abre en «Topes», «Borrador · 3 de 5 pasos guardados», los ✓
  (botones «<paso> (guardado)») y los mismos valores. Termina con «Crear plan»: sale de «Borradores» y está en el
  catálogo.
- Editar: cuatro pasos guardados (con tope de Mensajero 5), se cierra; en la lista la marca «Cambio en borrador» y la
  fila «Cambio de <plan>». «Editar» otra vez: aviso «Borrador de …, guardado el AAAA-MM-DD HH:mm», abre en «Módulos»,
  el tope guardado. «Cuándo rige» con «A partir de» F = 1 del mes siguiente: fila de M `[M, Mensual, F]` y de N
  `[N, Anual, 1 de enero en o tras F]`, calculadas a mano en el spec. «Programar cambio»: la región «Cambio programado»
  dice «Cambio programado desde F» y «0 de 2 empresas ya lo recibieron»; la marca ya no está en la lista.
- `afterAll` archiva los dos planes públicos (como `mi-plan-cambiar-plan`).

## Salida de los comandos (2026-11-18, implementer, tras merge de origin/dev `0711fe33`)

Base desechable `servi_logistic_slt144_e2e` recreada (DROP/CREATE), `prisma migrate deploy` y `db:seed`.
`next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3044` (exit 0). `E2E_PUERTO=3044`.

- `pnpm run typecheck`: exit 0 (tras `prisma generate`; el primer intento falló por el cliente Prisma viejo tras el merge).
- `pnpm exec eslint e2e/planes-borrador.spec.ts e2e/planes-costeo.spec.ts e2e/planes-costo-porcentual.spec.ts e2e/planes-superadmin.spec.ts playwright.config.ts`: exit 0, sin salida.
- `pnpm exec playwright test --project=aislamiento --project=dinero --reporter=list` con `planes-borrador`,
  `planes-superadmin`, `planes-costeo`, `planes-costo-porcentual`, `mi-plan-cambiar-plan`, `dos-empresas-humo` y la
  dependencia `plataforma-vacia` (`superadmin-arranque`, `superadmin-empresas`):
  - corrida 1: `40 passed (3.2m)`, 0 failed, 0 skipped, 0 flaky;
  - corrida 2, misma base: `40 passed (3.8m)`, 0 failed, 0 skipped, 0 flaky.
  - R30: `planes-borrador.spec.ts:195` ✓ (3.8s) y `:270` ✓ (4.3s).
  - Los tres rojos del CI de #209 (`planes-costeo.spec.ts:247`, `planes-superadmin.spec.ts:226`,
    `planes-costo-porcentual.spec.ts:227`) ✓: caían porque el CI corrió los specs SIN la adaptación (pulsaban
    «Siguiente», que ya no existe, hasta agotar el tiempo del test: «Target page … has been closed»).

## Veredicto

T6.1 y T6.2 verdes en local, dos corridas seguidas.
