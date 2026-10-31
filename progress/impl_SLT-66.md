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

## Tanda A — T3 y T4 (backend_dev, 2026-10-31)

### T3 — `tests/integration/db/plan-maestro-sin-tope.test.ts` (d0ef208): 7/7
- R1: `INSERT` de un tope de `maestro` → `23514`, también al crear un plan con `porRol.maestro`.
- R2: un `it.each` sobre los cuatro roles; con tope 1, el segundo alta da `TopeDelPlanAlcanzado`.
- R3: empresa con todos los topes llenos.
  - Crear, activar, aprobar un pendiente y pasar un admin a maestro: entran los cuatro.
  - El uso no cambia, salvo admin −1 por el cambio de rol.
  - Desviación: la aprobación de un maestro usa la misma sentencia `UPDATE` que `actualizarEstadoSiPendiente`, sin el filtro de rol, porque el repositorio solo aprueba mensajeros. Queda comentado en el test.
- R6: el tope de órdenes y el de keys siguen rechazando.
- Control de no vacuidad: los triggers están en `pg_trigger`.
- **Mutación 4** (el CHECK vuelve a admitir `maestro`, medida en `logistic_slt66`):
  - cae el caso R1: 1 fallado, 6 pasados;
  - CHECK de M1 restaurado: 7/7.

### T4 — tests existentes (b42329b), SIN CERRAR
| Archivo | Pasados / fallados |
|---|---|
| planes-catalogo | 14 / 0 |
| plan-topes-usuarios | 10 / 0 |
| planes-schema | 28 / 0 |
| consumo | 34 / **1** |
| mi-plan-service | 13 / 0 |
| planes-service-lecturas | 30 / 0 |
| plantilla-cambio-plan | 14 / 0 |
| mi-plan-repository | 3 / **1** |
| plan-de-la-empresa | 7 / 0 (`:123` y `:178` no se tocan, dependen de M3) |
| planes-lecturas-plataforma | 3 / 0 |
| rastro | 8 / **1** |
| planes-service | 80 / 0 |
| planes-service-inicio-ciclo | 28 / 0 |

Fixture tocado: `_fixtures/planes.ts:211`.

`costoPorOrden: null` también se añadió en líneas que la tabla no cita una a una (fila genérica «Fixtures»):
- mi-plan-service `:34`, `:113`;
- planes-service-lecturas `:41`, `:52`, `:98`;
- mi-plan-repository `:30`;
- planes-lecturas-plataforma `:32`;
- planes-schema `:24`, `:37`;
- planes-service `:43`, `:53`.

**Bloqueos (pendientes del humano, por R27 y T4).** Estos tres casos rojos exigen tocar líneas que §9.3 no cita:
1. `tests/unit/planes/consumo.test.ts:72-81`: la lista esperada todavía incluye `"maestro"` (`:75`).
2. `tests/unit/planes/rastro.test.ts:22-31`: el diff al crear trae `costoPorOrden: {antes: null, despues: null}`.
3. `tests/integration/db/mi-plan-repository.test.ts:83-88`: el `toEqual` de `vigente` necesita `costoPorOrden: null`.

Tests fuera de la tabla que rompe `costoPorOrden` obligatorio (aviso de T2, sin corroborar con base):
- `tests/unit/actions/planes.composition-root.test.ts` (3 fallos);
- `tests/components/PlanesModule.test.tsx` (T11);
- los seis de integración que usan `entradaDePlan`: planes-asignacion, planes-asignacion-inicio-ciclo, planes-cambio-correos, planes-cambio-programado, planes-edicion-en-uso, planes-historial. Con el arreglo de `_fixtures/planes.ts:211` pueden pasar; no se han corrido.

### Mapa R → test (añadido)
| R | Test |
|---|---|
| R1 | + `plan-maestro-sin-tope.test.ts` (R1), `planes-catalogo.test.ts` («R25 — tope por rol») |
| R2 | `plan-maestro-sin-tope.test.ts` (R2, `it.each`), `plan-topes-usuarios.test.ts:255` |
| R3 | `plan-maestro-sin-tope.test.ts` (R3) |
| R5 | `consumo.test.ts:69`, `mi-plan-service.test.ts`, `planes-service-lecturas.test.ts` (backend; las pantallas van en la tanda D) |
| R6 | `plan-maestro-sin-tope.test.ts` (R6) |

Typecheck: limpio en `lib/`, `app/`, `components/`, `tests/unit` y `tests/integration/db`. Quedan errores solo en tests de componentes y páginas (tanda D).

### T4 — ajustes autorizados por el humano (2026-10-31, «Sí, autoriza»), commit 29edc98
Filas añadidas a design §9.3 con fecha y la marca «autorizado por el humano». Líneas tocadas:
- `consumo.test.ts:73-77`: sin `"maestro"`, y el título dice «cuatro roles».
- `rastro.test.ts:31`: el diff de creación lleva `costoPorOrden` nulo.
- `mi-plan-repository.test.ts:88`.
- `planes.composition-root.test.ts`: cuatro entradas con `costoPorOrden: null`.

| Archivo (contra `logistic_slt66`) | Pasados / fallados |
|---|---|
| consumo | 35 / 0 |
| rastro | 9 / 0 |
| planes.composition-root | 4 / 0 |
| mi-plan-repository | 4 / 0 |
| planes-asignacion-inicio-ciclo | 11 / 0 |
| planes-asignacion | 11 / **1** |
| planes-cambio-correos | 0 / **9** |
| planes-cambio-programado | 2 / **8** |
| planes-edicion-en-uso | 1 / **6** |
| planes-historial | 5 / **2** |

**Bloqueo vigente.** Cinco archivos de integración de SL-24 arman a mano entradas de `crear` o `editar` sin `costoPorOrden`. La causa es la misma en todos: `validation_error` en `costoPorOrden`, y lo demás sale en cascada. Dónde:
- `planes-edicion-en-uso:38-47` (ayudante `editar`);
- `planes-cambio-correos:124-135` (ayudante `editar`);
- `planes-cambio-programado`: el ayudante `programar` (desde `:55`) y los literales de `~144-155` y `~181`;
- `planes-asignacion:198-205`;
- `planes-historial:87-94` y la edición que sigue; el caso R43 (`:329`) sale probablemente por lo mismo.

Arreglo mecánico propuesto: `costoPorOrden: entrada.costoPorOrden` en los ayudantes y `costoPorOrden: null` en los literales. No entra en la autorización: pendiente del humano. T4 sigue sin marcar.

### T4 — cierre (autorización del humano del 2026-10-31, «Sí»): commits 711de3b y d919805
En los cinco tests de integración de SL-24:
- `costoPorOrden: entrada.costoPorOrden` en los ayudantes y `null` en los literales:
  - `planes-edicion-en-uso:45`
  - `planes-cambio-correos:132`
  - `planes-cambio-programado:64, :146, :157, :185` (`:185` es el `pendiente.version` esperado)
  - `planes-asignacion:204`
  - `planes-historial:94, :104, :313`
- `planes-historial:125`: el diff esperado de alta de R29 suma `costoPorOrden: {antes: null, despues: null}`. Es el mismo trato que `rastro.test.ts:31`, bajo la autorización general («cae solo por costoPorOrden»). El test sigue comprobando el diff exacto.

Filas añadidas a design §9.3.

| Archivo (contra `logistic_slt66`) | Pasados / fallados |
|---|---|
| consumo | 35 / 0 |
| rastro | 9 / 0 |
| planes.composition-root | 4 / 0 |
| mi-plan-repository | 4 / 0 |
| planes-asignacion-inicio-ciclo | 11 / 0 |
| planes-edicion-en-uso | 7 / 0 |
| planes-cambio-correos | 9 / 0 |
| planes-cambio-programado | 10 / 0 |
| planes-asignacion | 12 / 0 |
| planes-historial | 7 / 0 |

- eslint: limpio en los archivos tocados.
- typecheck: sin errores fuera de `tests/components/` y `tests/integration/plataforma-*-page.test.tsx`, que son de la tanda D.

## Veredicto de la tanda A
T0–T4 hechas, con los tests de la tanda en verde contra `logistic_slt66`. Pendiente de otras tandas: los tests de componentes y de páginas (D) y `MiPlanRepository` provisional hasta T9.
