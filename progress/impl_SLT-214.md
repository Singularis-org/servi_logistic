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

## Tanda 2 (backend_dev): T3, T4, T5 y T6

### Archivos

Producción (todos en la lista de `tasks.md`):
- `lib/repositories/PlanesRepository.ts` (T3): `INCLUIR` con `beneficios` por `posicion`; `aDTO` los valida con
  `iconoDeBeneficioSchema`; `crearEnTx` los crea con la posición como índice y los pone en `creado`; `aplicarVersion`
  reemplaza la lista solo si la versión trae `beneficios` (R17, R18); `versionDelPlan` los añade.
- `lib/planes/rastro.ts` (T3): `"beneficios"` en `CampoDelPlan` y `CAMPOS` tras `modulos`; `planCanonico` los copia en
  orden; el alta sin beneficios omite la clave.
- `lib/planes/beneficios.ts` (T1, retocado): exporta `iconoDeBeneficioSchema` (lo usan `beneficioSchema` y `aDTO`).
- `lib/types/plan-borrador.ts`, `lib/planes/borrador.ts` (T4): paso `beneficios` en las tuplas, esquemas, uniones,
  `ValoresDeBeneficios`, `PasosDeCrear` y las dos peticiones.
- `lib/repositories/MiPlanRepository.ts`, `lib/planes/consumo.ts`, `lib/types/consumo-plan.ts`,
  `lib/services/MiPlanCambioService.ts` (T5): `beneficios` en la fila de `plan_de_la_empresa`, en `vigente`, en
  `PlanConConsumo` y en `vista`.
- `lib/planes/mensajes.ts` (T6): `CambioDelPlanParaCorreo.beneficios` y sus líneas tras los módulos.

Tests nuevos o ampliados (en la lista): `beneficios.test.ts` (T6), `rastro.test.ts` (R19), `plan-borrador-schema.test.ts`
(T4), `mi-plan-cambio-service.test.ts` (R24), `plan-beneficio.test.ts` (R15, R17, R18), `plan-borrador-confirmar.test.ts`
(R12, R15, R16; sus ayudantes guardan el paso nuevo), `mi-plan-repository.test.ts` (R23, R18; `beneficios: []` en el
`vigente` exacto), `planes-version-por-empresa.test.ts` (R16).

Tests adaptados FUERA de la lista de `tasks.md` (rompían por el cambio, sin tocar lo que prueban):
- `tests/unit/planes/plan-borrador.test.ts`: los pasos esperados y las peticiones llevan `beneficios`.
- `tests/unit/services/plan-borrador-service.test.ts`: el borrador completo del doble lleva el paso `beneficios`.
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: la fila falsa de `plan` lleva `beneficios: []`.
- `tests/components/ConsumoDelPlan.test.tsx`: el `PlanConConsumo` del doble lleva `beneficios: []` (solo tipo).

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R7 (tuplas) | `plan-borrador-schema.test.ts` «R7: va justo después de «Módulos»…»; `plan-borrador.test.ts` «los pasos de cada modo» |
| R10 | `plan-borrador-schema.test.ts` «R9, R10 (crear/editar)…», «R2–R4 (crear/editar): cada error en `beneficios.<i>.<campo>`…», «R3 (crear/editar)…», «R10: guardar el paso en los dos modos…» |
| R12 | `plan-borrador-confirmar.test.ts` «SLT-214 R12: un borrador sin el paso «Beneficios» da pasos_pendientes…» |
| R15 | `plan-beneficio.test.ts` «R15: crear con 3 beneficios los guarda y los lee en su orden…»; `plan-borrador-confirmar.test.ts` «SLT-214 R15: confirmar la creación…» |
| R16 | `plan-borrador-confirmar.test.ts` «SLT-214 R16: confirmar la edición deja los beneficios en la versión programada…»; `planes-version-por-empresa.test.ts` «SLT-214 R16: con el cambio a medias, la que lo recibió ve los beneficios nuevos…» |
| R17 | `plan-beneficio.test.ts` «R17: promover el cambio deja la lista del plan igual a la de la versión…» |
| R18 | `plan-beneficio.test.ts` «R18: una versión programada sin `beneficios`…»; `mi-plan-repository.test.ts` «R18: una versión propia sin `beneficios`…»; `rastro.test.ts` «la misma lista no es un cambio, y una versión sin `beneficios`…» |
| R19 | `rastro.test.ts` «SLT-214 R19 — los beneficios en diferenciasDelPlan» (alta sin/con, edición por texto, ícono, orden, quitar, agregar, vaciar); `plan-beneficio.test.ts` R17 (filas `creado`, `cambio_programado`, `cambio_aplicado`) |
| R23 | `mi-plan-repository.test.ts` «R23: sin versión propia, los del plan…», «R23: con una versión propia…», «R23: una versión propia con la lista vacía…» |
| R24 | `mi-plan-cambio-service.test.ts` «SLT-214 R24: cada plan de la lista y el custom activo llevan sus beneficios…» |
| R25 | `beneficios.test.ts` «SLT-214 R25 — lineasDeCambioDelPlan con los beneficios» (agrega/quita tras los módulos, solo íconos u orden, sin cambio) |

### Salida real

- `pnpm exec tsc --noEmit`: rc 2, con 4 errores, todos en `app/` y de T8 (frontend):
  `plan-form/usar-borrador.ts` (134, 140, 156) y `PlanForm.tsx` (250). `IdPasoGuardable` del formulario no tiene
  `beneficios` hasta que T8 añada el paso a `estado.ts`. Ningún error en `lib/` ni en `tests/`.
- `pnpm exec eslint` sobre los 22 archivos tocados: sin problemas, rc 0.
- Unit tocados (`beneficios`, `rastro`, `plan-borrador`, `plan-borrador-schema`, `mi-plan-cambio-service`,
  `plan-borrador-service`, `planes-repository-tipo-cobro`, `ConsumoDelPlan`): `Test Files  8 passed (8)` / `Tests  181 passed (181)`.
- Integración nuevos/ampliados, `--no-file-parallelism`: `Test Files  4 passed (4)` / `Tests  34 passed (34)`.
- Integración que importa lo tocado (63 archivos, `--no-file-parallelism`): `Test Files  1 failed | 62 passed (63)` /
  `Tests  791 passed | 14 skipped (805)`. El rojo es `demo-qa.test.ts`: «faltan catálogos en la base (… `pnpm run
  db:seed`): vehiculo» — la base desechable no tiene el seed; no lo toca este cambio.
- Unit y componentes que importan lo tocado (49 archivos): tras los arreglos de arriba, el único rojo que queda es
  `PlanesModule.test.tsx` (1), que recorre el formulario.
- Componentes del formulario de planes: `Test Files  10 failed | 14 passed (24)` / `Tests  62 failed`
  (`PlanForm*`, `PlanDetalle`, `PlanesModule`). Todos recorren los pasos: esperan el paso «Beneficios» que pone T8 y
  los ayudantes de T10 (`plan-form-pasos.ts`). Son de frontend_dev.
- `pnpm run test:guardias`: `Test Files  1 failed | 359 passed (360)`. El rojo es `superficie-de-uso`:
  `components/shared/planes/BeneficiosDelPlan.tsx` (T7) aún no lo monta nadie; lo montan T9 o una anotación.

Veredicto: T3–T6 en verde en `lib/` y sus tests; el typecheck de `app/`, los tests del formulario y la guardia de
superficie quedan en rojo hasta T7–T10 (frontend).
