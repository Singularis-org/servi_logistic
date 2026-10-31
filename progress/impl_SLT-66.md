# impl SLT-66 — planes-sin-tope-maestro-y-costeo

## Tanda A — T1 y T2 (backend_dev, 2026-10-31)

### T0 — comprobaciones previas (implementer, 2026-10-31)
1. La última migración de `origin/dev` sigue siendo `20261030120100_incentivo_mensajero_checks`: las migraciones de la ficha van detrás sin renombrar.
2. Últimas versiones en `origin/dev`: `cobro_plataforma_al_crear_orden` en `20261024120000_cobro_plataforma_blindaje_orden` y `plan_de_la_empresa` en `20261029150000_plan_ciclo_inicio_elegido`. Coinciden con design §13.
3. El PR #51 (SLT-67) entró en `dev` el 2026-10-31 a las 13:11 UTC. La rama todavía no lo tiene: T10 aplica.
4. Empresas con plan asignado (`organizacion.plan_id IS NOT NULL`, solo lectura):
   - `logistic_slt66`: 0
   - `logistic` (base local principal, que va por `20261029150000`): 0
   - QA y producción: sin acceso desde aquí; el leader lo resuelve con el humano antes de M4.

Base de la feature: `logistic_slt66`, creada con `prisma migrate deploy` y `db:seed`.

### Archivos
- Creados:
  - `db/migrations/20261031120000_plan_costeo_y_maestro_sin_tope/migration.sql` (con la cabecera de borrado definitivo)
  - `db/migrations/20261031120000_plan_costeo_y_maestro_sin_tope/down.sql`
  - `tests/integration/db/migracion-slt66-ida-y-vuelta.test.ts` (solo los casos R4 de M1; los R25 son de T6)
  - `tests/unit/types/planes-schema-costeo.test.ts`
  - `tests/unit/planes/rastro-costeo.test.ts`
  - `tests/unit/services/planes-service-costeo.test.ts`
  - `tests/integration/db/planes-costeo-escritura.test.ts`
- Modificados:
  - `db/schema.prisma` (`Plan.costoPorOrden`, comentario de `PlanTopeRol`)
  - `lib/types/planes.ts` (`ROLES_CON_TOPE` sin maestro, `costoPorOrden` en esquemas, `VersionPlan`, `PlanDTO`)
  - `lib/planes/rastro.ts` (campo `costoPorOrden`, canónico)
  - `lib/planes/mensajes.ts` (`textoDelCostoPorOrden`, `Costo base:`, `Costo por orden:`)
  - `lib/repositories/PlanesRepository.ts` (`crear`, `aplicarVersion`, `aDTO`, `usoDe`, `COLUMNA_DEL_ROL`, `vigente` de `planDeEmpresa`)
  - `lib/repositories/MiPlanRepository.ts` (solo lo que exige el typecheck; ver «Decisiones provisionales»)

### Mapa R → test (de esta tanda)
| R | Test |
|---|---|
| R1 | `planes-schema-costeo.test.ts` («El maestro no admite tope»), `planes-service-costeo.test.ts` («un tope de maestro»), `migracion-slt66-ida-y-vuelta.test.ts` (CHECK `23514`) |
| R4 | `migracion-slt66-ida-y-vuelta.test.ts` (siembra, borrado, versión pendiente, rastro/asignación/base intactos, down) |
| R7 | `planes-schema-costeo.test.ts` (tres formas de base × con/sin costo) |
| R8 | `planes-schema-costeo.test.ts`, `planes-service-costeo.test.ts`, `migracion-slt66-ida-y-vuelta.test.ts` (CHECK de la columna) |
| R9 | `rastro-costeo.test.ts` (línea «Costo base:») |
| R11 | `rastro-costeo.test.ts`, `planes-service-costeo.test.ts`, `planes-costeo-escritura.test.ts` |

### Decisiones provisionales (a cerrar en T9)
- `MiPlanRepository`: `plan_de_la_empresa` aún no devuelve `costo_por_orden` (lo hace M3). El zod lo lee como
  `optional()` y `vigente.costoPorOrden` cae a `null`; `uso.maestro` sigue en el zod (la función lo devuelve) pero ya
  no entra en `porRol`. T9 vuelve obligatorio `costo_por_orden` y quita `uso.maestro`.

### Hallazgo para T4 (no resuelto aquí)
`costoPorOrden` es obligatorio en la entrada (design §4.1). Los tests existentes que mandan entradas sin tipar no los
marca el typecheck, pero caen en ejecución con `validation_error`:
- `tests/integration/db/_fixtures/planes.ts:204` (`entradaDePlan`), que usan `planes-asignacion`, `planes-asignacion-inicio-ciclo`,
  `planes-cambio-correos`, `planes-cambio-programado`, `planes-edicion-en-uso` y `planes-historial`;
- los literales `CREAR`/`VERSION` de `tests/unit/services/planes-service.test.ts`.
Ninguno está en la tabla de design §9.3 salvo por la fila genérica «Fixtures … suman `costoPorOrden: null`».

`vitest related --run` sobre los 5 archivos de `lib/` (sin base: los de integración se saltan): 3893 pasados, 106
fallados, 264 saltados. Fallan:
- en la tabla de §9.3 o en la fila de fixtures: MiPlanModule (3), PlanDetalle (3), PlanEmpresa (45), PlanForm (13),
  consumo (1), rastro (8: el `PlanDTO` del fixture sin `costoPorOrden`), planes-schema (6), mi-plan-service (3),
  planes-service-lecturas (3), planes-service (16), plantilla-cambio-plan (1);
- FUERA de §9.3: `tests/unit/actions/planes.composition-root.test.ts` (3, entrada sin `costoPorOrden`) y
  `tests/components/PlanesModule.test.tsx` (1, «Nuevo plan» crea con el `PlanForm` que aún no manda el campo: lo
  arregla T11).

### Evidencia
- `prisma migrate deploy` (base `logistic_slt66`): aplica `20261031120000_plan_costeo_y_maestro_sin_tope`.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an empty migration.`
- `prisma generate`: OK.
- vitest (con `DATABASE_URL` de la feature):
  - `migracion-slt66-ida-y-vuelta.test.ts`: 7/7
  - `planes-costeo-escritura.test.ts`: 4/4
  - `rastro-costeo.test.ts`: 9/9
  - `planes-schema-costeo.test.ts`: 12/12
  - `planes-service-costeo.test.ts`: 39/39
- `pnpm run typecheck`: 0 errores en `lib/`, `app/` y `components/`; 31 en tests existentes (T4): ConsumoDelPlan.test.tsx:26;
  MiPlanModule.test.tsx:18,36; PlanDetalle.test.tsx:25; PlanEmpresa.test.tsx:35,42,45,71; PlanesModule.test.tsx:20,34;
  PlanForm.test.tsx:23; integration/db/_fixtures/planes.ts:204; mi-plan-repository.test.ts:25;
  planes-lecturas-plataforma.test.ts:27; plataforma-empresa-detalle-page.test.tsx:169,176,188;
  plataforma-planes-page.test.tsx:67,72; unit/planes/consumo.test.ts:69; unit/planes/rastro.test.ts:9;
  mi-plan-service.test.ts:29,43,98,105; planes-service-inicio-ciclo.test.ts:29; planes-service-lecturas.test.ts:33,46,96,99;
  planes-service.test.ts:24.
- `eslint` sobre los archivos tocados: sin avisos.

### Veredicto
T1 y T2 hechas: tests nuevos en verde, drift vacío y typecheck limpio en el código de producción. Quedan 31 errores de
tipos en tests existentes, que son de T4.
