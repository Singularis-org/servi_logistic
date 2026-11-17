# impl SLT-129 — planes-borrador-servidor

## Tanda T1 + T2 (backend_dev, 2026-11-17)

**Archivos**
- Producción: `db/schema.prisma` (modelo `PlanBorrador`, `Plan.borradorDeCambio`),
  `db/migrations/20261117120000_plan_borrador/{migration.sql,down.sql}`, `lib/db/modelos-de-negocio.ts`,
  `lib/types/planes.ts` (exporta `nombreSchema`, `fechaSchema`, `modulosSchema`, `unSoloModo`/`UN_SOLO_MODO`,
  `noInicioYEfecto`/`NO_INICIO_Y_EFECTO` y los cuatro refines de General con su constante; `crearPlanSchema` y
  `asignarPlanSchema` las usan, mismo orden, paths y mensajes), `lib/types/plan-borrador.ts`, `lib/planes/borrador.ts`.
- Tests: `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts`,
  `tests/integration/db/planes-acceso-servi-app.test.ts` (caso R23 nuevo; la siembra añade un borrador del custom
  de A y la foto lo incluye), `tests/unit/types/plan-borrador-schema.test.ts`, `tests/unit/planes/plan-borrador.test.ts`.

**Base:** `servi_logistic_slt129` en el Postgres local (misma URL que `.env` cambiando la base), `migrate deploy`
completo + `db:seed`; down.sql y migration.sql reaplicados a mano (ida y vuelta).

**R → test (de esta tanda)**
| R | Test |
|---|---|
| R3 | `plan-borrador-schema.test.ts > R3 — «un plan nuevo empieza por General»` (falta el caso del servicio, T4) |
| R6 | `plan-borrador-schema.test.ts > R6 — un caso por paso con un valor inválido y su clave` y `> lo que cruza pasos…` |
| R7 | `plan-borrador-schema.test.ts > R7 — período repetido / porcentaje 0 y 100.01 / monto inválido / sin precio con líneas / la lista vacía es sin descuentos`; `plan-borrador.test.ts > R7` |
| R16 | `plan-borrador.test.ts > R16 — crear sin Topes y programar sin Cuándo rige` (el del servicio va en T4) |
| R17, R18 | `plan-borrador.test.ts > R17 / R18` (conversión a la petición de hoy; la integración va en T6) |
| R21 | `tests/unit/types/planes-schema*.test.ts` sin tocar, en verde |
| R23 | `planes-acceso-servi-app.test.ts > «R23 — servi_app no lee ni escribe plan_borrador»` |
| R24 | `migracion-plan-borrador-ida-y-vuelta.test.ts` |

**Salida real**
- `pnpm run typecheck`: sin errores.
- `pnpm run lint`: 0 errores, 248 warnings, ninguno en archivos de esta tanda.
- `vitest run` R23/R24 + guardia `organizacion-en-modelos`: 3 archivos, 25 passed.
- `vitest run` `plan-borrador*` + `planes-schema*` (4): 6 archivos, 175 passed.
- `vitest run` `organizacion-en-modelos`, `guard-dependencias-aprobadas`, `planes-service`, `planes-crear-custom-asigna`: 4 archivos, 113 passed.

**Veredicto:** T1 y T2 en verde; producción en 507 líneas añadidas tras dos tandas, por encima del reparto de §11.

## Tanda T3 + T4 + T5 (backend_dev, 2026-11-17) — sin R9–R10

**Archivos**
- Producción: `lib/interfaces/repositories/IPlanBorradorRepository.ts` (nuevo; extiende `Pick<IPlanesRepository, "plan">`
  para R8 en el servicio), `lib/repositories/PlanesRepository.ts` (`crearBorrador`, `guardarPasoDeCreacion`,
  `guardarPasoDeCambio`, `descartar`, `borrador`; `consumirBorrador` envuelve las transacciones de `crear`,
  `crearYAsignar`, `editar` y `programarCambio`; `crearEnTx` recibe el id del borrador),
  `lib/interfaces/repositories/IPlanesRepository.ts` (`borradorId?` en los cuatro), `lib/db/excepciones-aislamiento.ts`
  (motivo), `lib/interfaces/services/IPlanesService.ts` (`OpcionesDeBorrador`), `lib/services/PlanesService.ts`
  (`opciones?` en `crear`/`editar`; sin opciones las llamadas al repositorio no cambian de aridad),
  `lib/interfaces/services/IPlanBorradorService.ts`, `lib/services/PlanBorradorService.ts` (`guardarPaso`,
  `descartar`, `confirmar`), `lib/actions/plan-borrador.ts` (`guardarPasoBorradorAction`, `descartarBorradorAction`,
  `confirmarBorradorAction`), `lib/modulos/reparto.ts` (`"plan-borrador": "nucleo"`).
- Tests: `tests/unit/services/plan-borrador-service.test.ts`, `tests/unit/actions/plan-borrador.test.ts`.

**Corte de §11:** producción en `git diff dev --stat -- db lib` = **921 insertions, 51 deletions** (17 archivos) antes de
R9–R10. Leer y listar (`borradorDelPlan`, `borradores`, `leer`, `borradores` del servicio, `leerBorradorAction`) se
estima en ~80 líneas: pasaría de ~980. **No se implementó**; queda para la ficha aparte de design §11.

**Decisión de implementación a revisar:** `guardarPasoDeCambio` toma `plan_borrador WHERE plan_id = … FOR UPDATE`
ANTES del `plan FOR SHARE`, para seguir el orden de confirmar (borrador → plan) y no abrazarse con él (guardar con
el plan en SHARE esperando la fila del borrador mientras confirmar la tiene y espera el plan en UPDATE).

**R → test (de esta tanda)**
| R | Test |
|---|---|
| R1 | `plan-borrador-service.test.ts > R1 — …forbidden y el repositorio no se llama` (3 operaciones × maestro/admin/null); `plan-borrador.test.ts (actions) > R1 — con la sesión de un maestro…` |
| R3 | `plan-borrador-service.test.ts > R3 — un plan nuevo empieza por General` |
| R4, R5 | `plan-borrador-service.test.ts > R4 / R5` (con dobles; la concurrencia va en T6) |
| R6 | `plan-borrador-service.test.ts > R6 — un paso inválido no llega al repositorio…` y `> R6 — una fecha fuera de rango se acepta al guardar General` |
| R8 | `plan-borrador-service.test.ts > R8 — plan inexistente, plan archivado y borrador inexistente no escriben` (la de Postgres, T6) |
| R14 | `plan-borrador-service.test.ts > R14`; `plan-borrador.test.ts (actions) > R14 — descartar … borra por PlanesRepository` |
| R16 | `plan-borrador-service.test.ts > R16 — crear sin Topes y programar sin Cuándo rige dan pasos_pendientes` y `> lectura defensiva` |
| R17, R18 | `plan-borrador-service.test.ts > R17 / R18` (pasan por `PlanesService` con `{ borradorId }`; la integración, T6) |
| R19 | `plan-borrador-service.test.ts > R19 — el rechazo de crear pasa tal cual` |
| R20 | `plan-borrador-service.test.ts > R20 — sin borrador, o si desaparece dentro de la transacción…`; `plan-borrador.test.ts (actions) > R20` |
| R21 | `planes-service*.test.ts` y `tests/integration/db/planes-*.test.ts` sin tocar, en verde |

**Salida real**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: sin errores.
- `pnpm exec eslint` sobre los archivos tocados: 0 errores, 1 warning ajeno (`IOrdenRepository.ts`, no es de esta tanda).
- `vitest run` `plan-borrador-service`, `actions/plan-borrador`, `planes-service*` (9), `planes.composition-root`,
  guardias `modulos-reparto`, `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `organizacion-en-modelos`,
  `rls-por-empresa`, `planes/plan-borrador`, `types/plan-borrador-schema`: 19 archivos, 594 passed.
- `vitest run` `storage-solo-por-adaptador` + `guard-dependencias-aprobadas`: 2 archivos, 11 passed.
- `vitest run tests/integration/db/planes-*.test.ts --no-file-parallelism` (base `servi_logistic_slt129`): 18 archivos, 187 passed.
- Humo temporal contra la base (borrado tras correrlo): guardar 5 pasos → `pasos_pendientes` → confirmar crea el plan
  con el id del borrador y borra el borrador; reconfirmar → `borrador_no_encontrado`; dos pasos del cambio → una fila.
  Dejó un plan público «smoke …» en `servi_logistic_slt129`.

**Veredicto:** T3–T5 en verde sin R9–R10 (corte de §11 por tamaño: 921 líneas de producción).

## Tanda R9–R10 + T7 (backend_dev, 2026-11-17) — el humano aceptó el tamaño: sin corte de §11

**Archivos**
- Producción: `lib/interfaces/repositories/IPlanBorradorRepository.ts` (`BorradorListado`, `borradorDelPlan`,
  `borradores`), `lib/repositories/PlanesRepository.ts` (`borradorDelPlan` por `planId` único; `borradores` con el
  nombre del plan por la relación), `lib/interfaces/services/IPlanBorradorService.ts` y
  `lib/services/PlanBorradorService.ts` (`leer`, `borradores`; `vista()` comparte la lectura defensiva de
  confirmar), `lib/actions/plan-borrador.ts` (`leerBorradorAction`; la lista va sin action, design §4).
- Tests: `tests/unit/services/plan-borrador-service.test.ts` (+R9, R10; R1 cubre ahora `leer` y `borradores`),
  `tests/unit/actions/plan-borrador.test.ts` (+R9; R1 con las cuatro actions),
  `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts` (nuevo, R15).
- `specs/SLT-129-planes-borrador-servidor/tasks.md`: T3.2, T4.2, T5.1 y T7.1 marcadas.

**Decisión fuera del spec (a revisar):** la lista sale ordenada por `updated_at DESC, id` (lo último guardado
primero). R10 y design §4 no fijan orden; se eligió uno determinista.

**Producción:** `git diff dev --shortstat -- db lib` = 17 files changed, 1023 insertions(+), 51 deletions(-).

**R → test (de esta tanda)**
| R | Test |
|---|---|
| R1 | `plan-borrador-service.test.ts > R1 — … > leer / borradores con maestro/admin/sin sesión`; `plan-borrador.test.ts (actions) > R1 — … forbidden en las cuatro` |
| R9 | `plan-borrador-service.test.ts > R9 — por id devuelve los pasos tal como se guardaron…`, `> R9 — por plan … sin él, borrador null…`, `> R9 — lectura defensiva…`; `plan-borrador.test.ts (actions) > R9 — leer por plan va al repositorio real…` (la integración, T6) |
| R10 | `plan-borrador-service.test.ts > R10 — la lista trae creación y cambio con su nombre…` (la integración, T6) |
| R15 | `plan-borrador-sin-caducidad.guardia.test.ts` (árbol real + contraprueba en memoria: DELETE/TRUNCATE/delegado fuera de `PlanesRepository`, y `plan_borrador` en cron o `jobs-*`) |

**Salida real**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: sin errores.
- `pnpm exec eslint` sobre los 8 archivos tocados: exit 0, sin salida.
- `vitest run` `plan-borrador-service`, `actions/plan-borrador`, `plan-borrador-sin-caducidad`, `planes-sin-borrado`,
  `sql-a-mano-por-empresa`, `modulos-reparto`: 6 archivos, 113 passed.
- `vitest run` `actions/planes.composition-root`, `rls-por-empresa`, `organizacion-en-modelos`, `services/planes-service*` (9):
  12 archivos, 446 passed.

**Limpieza:** en `servi_logistic_slt129` se borró el plan público «smoke 741bbc86» (`105ecf5d-…`) y, por cascada, su
fila de `plan_tope_rol`, `plan_descuento_periodo` y `plan_precio_historial` (no tenía rastro, borrador ni trabajos).
Quedan 0 planes `smoke%`.

**Veredicto:** R9, R10 y R15 implementados y en verde en unitarios; falta T6 (integración).
