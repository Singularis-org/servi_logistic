# SLT-214 «Planes: beneficios de texto con ícono» — bitácora de implementación

## Tanda 1 (backend_dev): T1 y T2

### Archivos

Creados:
- `lib/planes/beneficios.ts`: catálogo de íconos, esquemas, `claveDelBeneficio` y `cambiosDeBeneficios` (design §3.1).
- `db/migrations/20261120120000_plan_beneficio/migration.sql` y `down.sql` (design §1.3).
- `tests/unit/planes/beneficios.test.ts`
- `tests/integration/db/plan-beneficio.test.ts` (solo R1 y R6; T3 añade R15, R17 y R18).
- `tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts`

Modificados:
- `db/schema.prisma`: modelo `PlanBeneficio` y `Plan.beneficios`.
- `lib/types/planes.ts`: `beneficios` opcional en `crearPlanSchema` y `edicionDelPlan`, y en `VersionPlan`, `PlanDTO` y
  `PlanVista`.
- `lib/db/modelos-de-negocio.ts` (fuera de la lista de `tasks.md`): `PlanBeneficio` en la lista de modelos de
  plataforma. Sin esto, la guardia `organizacion-en-modelos` queda en rojo.
- `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`: el control «ninguna migración posterior redefine
  la función» ahora mira solo las migraciones entre el origen y M (`c < M`). Antes miraba `c !== M`, y la
  `plan_de_la_empresa` de SLT-214 lo ponía en rojo aunque no cambia lo que repone ese `down.sql`.
- `tests/integration/db/orden-traspaso-migration.test.ts`: se declara la nueva migración en su lista de posteriores.
- `tests/integration/db/plan-de-la-empresa.test.ts`: la clave `beneficios` en la lista exacta de claves (R9 de SLT-58).

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R1 | `beneficios.test.ts` «R1: una lista vacía…», «R1: no hay tope…»; `plan-beneficio.test.ts` «R1: guarda una lista ordenada…» |
| R2 | `beneficios.test.ts` «R2: …extremos», «R2: un texto vacío…», «R2: admite 120…»; «crearPlanSchema: … los recorta» |
| R3 | `beneficios.test.ts` «SLT-214 R3 — el ícono del beneficio» (5 casos + sin ícono / claves de más) |
| R4 | `beneficios.test.ts` «compara sin mayúsculas…», «marca «Ya hay…»…», «editarPlanSchema y versionPlanSchema aplican R4» |
| R5 | `beneficios.test.ts` «ofrece exactamente los 12 íconos…» (el `aria-hidden` lo cubre T7) |
| R6 | `plan-beneficio.test.ts` «R6: los CHECK rechazan…», «R6: servi_app no lee ni escribe…», «R6: la empresa ve los beneficios solo por plan_de_la_empresa…»; `migracion-plan-beneficio-ida-y-vuelta.test.ts` «R6: subir crea plan_beneficio…» |
| R7 (CHECK de pasos) | `migracion-plan-beneficio-ida-y-vuelta.test.ts` «R7: el borrador admite el paso `beneficios`…» |
| R18 | `beneficios.test.ts` «R18: una versión sin `beneficios` sigue validando…»; ida y vuelta «R18, R23: los del plan en orden; la versión propia sin `beneficios`…» |
| R23 (SQL) | ida y vuelta «R18, R23: …»; `plan-beneficio.test.ts` «R6: la empresa ve los beneficios solo por plan_de_la_empresa…» |
| R25 (las tres formas de línea) | `beneficios.test.ts` «SLT-214 R25 — cambiosDeBeneficios» (6 casos). `lineasDeCambioDelPlan` es de T6 |

### Salida real

- `pnpm run typecheck` (tsc --noEmit): sin errores, rc 0.
- `pnpm exec eslint <los 9 .ts tocados>`: «No issues found», rc 0.
- `pnpm exec vitest run --no-file-parallelism tests/unit/planes/beneficios.test.ts tests/integration/db/plan-beneficio.test.ts tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`:
  `Test Files  4 passed (4)` / `Tests  54 passed (54)`.
- Los que tocan `plan_de_la_empresa` o `plan_borrador` (`grep -rl` en `tests/integration/db`), con `--no-file-parallelism`: `Test Files  21 passed`, y 2 rojos que se arreglaron arriba
  (`orden-traspaso-migration`, `plan-de-la-empresa`). Al volver a correrlos: `Test Files  2 passed (2)` / `Tests  22 passed (22)`.
- Los otros 8 tests que nombran las últimas migraciones de dev: `Test Files  8 passed (8)` / `Tests  112 passed (112)`.
- `tests/unit/planes` y `tests/unit/types`: `Test Files  117 passed (117)` / `Tests  2217 passed (2217)`.
- `pnpm run test:guardias`: `Test Files  360 passed (360)` / `Tests  5405 passed | 1 skipped (5406)`.
- La migración está aplicada con `prisma migrate deploy` en `servi_logistic_slt214` y `servi_logistic_slt214_e2e`, y el cliente está regenerado.

Veredicto: T1 y T2 en verde. Un archivo de producción de más (`lib/db/modelos-de-negocio.ts`), que pide la guardia.
