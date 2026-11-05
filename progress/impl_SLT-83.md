# SLT-83 — bitácora de implementación

Base de la feature: `servi_logistic_slt83` en el Postgres local (`localhost:5432`), creada con
`CREATE DATABASE servi_logistic_slt83` y migrada con `pnpm exec prisma migrate deploy`. `DATABASE_URL`
exportada en cada comando hacia esa base (usuario/clave del `.env` del repo principal, que apunta a
localhost); el worktree no tiene `.env`.

## T0

**Punto de partida.** `git ls-tree origin/dev db/migrations/` (tras `git fetch origin dev`, 2026-11-04)
termina en `20261104130100_historial_accion_plan_tipo_cobro_cambiado`, igual que el worktree. Los
timestamps de design §2 (`20261104150000`, `…150100`, `…150200`) siguen siendo posteriores: no se
renombra nada.

**Llamadores de `cobro_plataforma_tarifa_de`** (Grep en `db/migrations/` y `lib/`, design §13):

| Dónde | Qué es |
|---|---|
| `db/migrations/20261031140200_plan_costeo_funciones/migration.sql:24` | la definición (`CREATE FUNCTION … (p_organizacion_id text)`) y su `REVOKE EXECUTE` (l. 42) |
| `db/migrations/20261031140200_plan_costeo_funciones/migration.sql:52` | **llamada**: `cobro_plataforma_al_crear_orden()` (trigger de alta) |
| `db/migrations/20261031140200_plan_costeo_funciones/migration.sql:87` | **llamada**: `plan_de_la_empresa` (cuerpo de SLT-66, ya reemplazado) |
| `db/migrations/20261031140200_plan_costeo_funciones/down.sql:2, 86` | el down que la suelta |
| `db/migrations/20261104130000_plan_sin_negociable_y_tipo_cobro/migration.sql:67` | **llamada**: `plan_de_la_empresa` (último cuerpo vigente) |
| `db/migrations/20261104130000_plan_sin_negociable_y_tipo_cobro/migration.sql:15` | solo comentario |
| `db/migrations/20261104130000_plan_sin_negociable_y_tipo_cobro/down.sql:38` | **llamada**: el cuerpo de `plan_de_la_empresa` que el down repone |
| `lib/repositories/PlanesRepository.ts:1196` | **llamada**: `planDeEmpresa` (`FROM cobro_plataforma_tarifa_de(${organizacionId})`) |
| `lib/repositories/EmpresasPlataformaRepository.ts:132` | **llamada**: `planYCobroVigente` (`CROSS JOIN LATERAL cobro_plataforma_tarifa_de(i."id")`); l. 118 es su comentario |
| `lib/repositories/MiPlanRepository.ts:44` | solo comentario (lee `plan_de_la_empresa`) |
| `lib/planes/consumo.ts:82`, `lib/planes/costeo.ts:11`, `lib/types/empresas-plataforma.ts:26` | solo comentarios |

Comprobación en la base (design §13), sobre `servi_logistic_slt83` migrada hasta `20261104130100`:
`SELECT proname FROM pg_proc WHERE prosrc LIKE '%cobro_plataforma_tarifa_de%'` →
`cobro_plataforma_al_crear_orden`, `plan_de_la_empresa`. Coincide con la lista de design §13: ninguna
función no listada la usa.

Fuera de `db/` y `lib/` (no lo pide T0, para T3): la nombran también
`tests/integration/db/cobro-plataforma-plan.test.ts`, `migracion-slt66-ida-y-vuelta.test.ts` y
`plan-de-la-empresa-costeo.test.ts`.

## T1

**Archivos.**
- Creado `db/migrations/20261104150000_plan_costo_por_orden_porcentual/migration.sql` (design §2.1, literal).
- Creado `db/migrations/20261104150000_plan_costo_por_orden_porcentual/down.sql`: `RAISE EXCEPTION` si
  algún plan tiene `costo_por_orden_pct` o alguna versión pendiente tiene `costoPorOrdenPorcentual` no
  nulo; si no, quita la clave de las versiones, los tres `CHECK` y las dos columnas.
- Modificado `db/schema.prisma`: `Plan.costoPorOrdenPct` (`Decimal(5,2)`) y `Plan.costoPorOrdenMinimo`
  (`Decimal(12,2)`), con el comentario de los tres `CHECK`.
- Creado `tests/integration/db/plan-costo-porcentual-escritura.test.ts` (solo los `CHECK`; T8 lo completa).

**R → test.**
- R1 → `plan-costo-porcentual-escritura.test.ts`: «nace sin porcentaje ni mínimo», «rechaza con 23514 un
  plan fijo y porcentual a la vez», «las tres formas válidas entran».
- R2 → mismo archivo: porcentaje `0`, `-1`, `100.01` rechazados; `0.01`, `100`, `100.00` entran; mínimo
  negativo rechazado y `0` entra; mínimo sin porcentaje rechazado (solo y junto a un fijo).

**Salida.**
- `pnpm exec prisma migrate deploy` → `All migrations have been successfully applied.`
- Drift: `pnpm exec prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`
  → `-- This is an empty migration.`
- `down.sql` a mano en `BEGIN … ROLLBACK`: sin datos porcentuales deja 0 columnas `costo_por_orden_%`
  nuevas; con un plan al 5 % falla con `P0001 SLT-83 down: hay planes porcentuales; bajar los dejaría sin
  costo por orden`. (La ida y vuelta con test es T4.)
- `pnpm exec vitest run tests/integration/db/plan-costo-porcentual-escritura.test.ts` →
  `Test Files 1 passed (1) · Tests 11 passed (11)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, exit 0, sin errores.
- `pnpm exec eslint tests/integration/db/plan-costo-porcentual-escritura.test.ts` → sin salida (0 problemas).

**Veredicto T0+T1:** punto de partida confirmado, M1 aplicada sin drift y sus `CHECK` probados en verde.

## T2

**Archivos.**
- Creado `db/migrations/20261104150100_cobro_plataforma_porcentual_orden/migration.sql` (design §2.2):
  tabla `cobro_plataforma_porcentual_orden` (PK `orden_id`, FK `orden` CASCADE, FK `organizacion`
  RESTRICT, `CHECK` de porcentaje y mínimo), `UNIQUE (organizacion_id, orden_id)`, índice
  `(organizacion_id)`, RLS + política `cobro_plataforma_porcentual_orden_por_empresa`,
  `REVOKE INSERT, UPDATE, DELETE … FROM servi_app`, índice `(organizacion_id, ocurrido_at)` en
  `cobro_plataforma_movimiento` y los dos triggers de SL-17 pegados de
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`.
- Creado su `down.sql`: se niega si la tabla tiene filas; si no, triggers, política, tabla e índice.
- Modificado `db/schema.prisma`: `model CobroPlataformaPorcentualOrden` (con el comentario de `CHECK`,
  política, `REVOKE` y triggers), `Orden.cobroPorcentual`, `Organizacion.cobrosPorcentuales` y
  `@@index([organizacionId, ocurridoAt])` en `CobroPlataformaMovimiento`.
- Modificado `lib/db/modelos-de-negocio.ts`: entra `CobroPlataformaPorcentualOrden`.
- Creado `tests/integration/db/cobro-plataforma-porcentual-aislamiento.test.ts` (R17).
- **Contadores existentes que sube la tabla nueva** (no son cambios de regla: son el control positivo
  que cada tabla de negocio nueva actualiza, como hicieron SL-40, SLT-56, SLT-73 y SLT-52):
  - `tests/unit/guards/rls-por-empresa.guardia.test.ts`: el control `tablas.length` pasa de 85 a 86;
  - `scripts/verificar-rls-despliegue.ts`: `TRIGGERS_MISMA_EMPRESA` 167 → 168 (la FK nueva a `orden`);
  - `tests/unit/scripts/verificar-rls-despliegue.test.ts`: `MODELOS_DE_NEGOCIO` 85 → 86 y el contrato
    86/167/85 → 87/168/86, más el 167 → 168 de los casos con lista inventada.
  Medido en `servi_logistic_slt83`: `pg_trigger` tiene 168 `sme_*` y 86 `*_sin_cambio_de_empresa`.

**R → test.**
- R17 → `cobro-plataforma-porcentual-aislamiento.test.ts`: `servi_app` no inserta/actualiza/borra
  condiciones (42501) y sí lee la suya; tampoco escribe movimientos (42501); lee solo sus condiciones;
  condición de A con orden de B → SL017; cambiar la empresa de una condición → SL017.
- R17 (gate) → guardias `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa`.

**Salida.**
- `prisma migrate deploy` → aplicada; `prisma migrate diff --from-config-datasource --to-schema
  db/schema.prisma --script` → `-- This is an empty migration.`;
  `generar-misma-empresa.ts --faltantes` después → 0 triggers pendientes.
- `down.sql` en `BEGIN … ROLLBACK` con la tabla vacía: tabla e índice desaparecen.
- `pnpm exec vitest run` de `cobro-plataforma-porcentual-aislamiento`, `plan-costo-porcentual-escritura`,
  las tres guardias y `verificar-rls-despliegue` → `Test Files 6 passed (6) · Tests 63 passed (63)`.
- `pnpm run typecheck` → exit 0. `eslint` de los archivos tocados → 0 problemas.

**Veredicto T2:** tabla de condiciones aislada por empresa y de solo lectura para `servi_app`, en verde.

## T3

**Archivos.**
- Creado `db/migrations/20261104150200_cobro_plataforma_porcentual_funciones/migration.sql` (design §2.3,
  §3): `orden_estado_es_final`, `cobro_plataforma_importe_porcentual`, `cobro_plataforma_tarifa_de`
  (DROP + CREATE con `porcentaje` y `minimo`), `cobro_plataforma_porcentual_conciliar`,
  `cobro_plataforma_al_crear_orden` (rama porcentual), `cobro_plataforma_al_cambiar_borrado` (entrada de
  conciliación al principio), `cobro_plataforma_al_cambiar_estado` + trigger `AFTER UPDATE OF estatus_id`,
  `plan_cobro_del_ciclo` y `plan_de_la_empresa` (`costo_vigente` con `porcentaje`/`minimo`,
  `cobro_ciclo`, `costo_por_orden_pct`, `costo_por_orden_minimo`). Todas `SECURITY DEFINER`,
  `search_path` fijo y `REVOKE EXECUTE … FROM PUBLIC`; `plan_de_la_empresa` conserva su `GRANT`.
- Creado su `down.sql`: los cuerpos de origen se extrajeron por script de sus migraciones
  (`20261104130000` para `plan_de_la_empresa`, `20261023130200` para `al_cambiar_borrado`, `20261031140200`
  para `al_crear_orden` y `tarifa_de`), así que son byte a byte los de origen.
- Creado `tests/integration/db/_fixtures/cobro-porcentual.ts` (empresas, planes, órdenes por SQL de dueño,
  movimientos, condiciones, deuda).
- Creados `tests/integration/db/cobro-plataforma-porcentual.test.ts`,
  `cobro-plataforma-porcentual-importe.test.ts`, `cobro-porcentual-estados-finales.test.ts`.
- **Tests existentes tocados (design §9.3, solo forma):**
  - `tests/integration/db/plan-de-la-empresa-costeo.test.ts`: el `costo_vigente` CRUDO de
    `plan_de_la_empresa` gana `porcentaje: null, minimo: null` en los dos `expect(r.empresa)`; las
    aserciones de cargo, repositorio y superadmin no cambian.
  - `tests/integration/db/plan-de-la-empresa.test.ts` (R9 de SLT-58, lista exacta de claves): gana
    `costo_por_orden_pct`, `costo_por_orden_minimo` y `cobro_ciclo`. Es el mismo tipo de cambio que hizo
    SLT-66 en esa lista; §9.3 nombra solo el de `-costeo`, así que lo dejo anotado para el reviewer.

**Comprobaciones.**
- `down.sql` en `BEGIN … ROLLBACK` sobre la base migrada: el `md5(pg_get_functiondef)` y el `proacl` de
  `cobro_plataforma_tarifa_de`, `plan_de_la_empresa`, `cobro_plataforma_al_crear_orden` y
  `cobro_plataforma_al_cambiar_borrado` son iguales a los de antes de subir M3.
- Drift: `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` →
  `-- This is an empty migration.`
- Mutaciones de design §9.4, aplicadas a mano en la base y revertidas: `round` → `trunc` y quitar
  `incidente` de `orden_estado_es_final` → 11 tests en rojo en los tres archivos nuevos; restaurados los
  cuerpos de la migración → verde.

**R → test.**
- R6 → `cobro-plataforma-porcentual.test.ts` «R6: un alta de tres órdenes en una sola sentencia…» y §3.5.
- R7 → «R7: con excepción…», «R7: con plan fijo o vacío…».
- R8 → «R8: entrar a %s…» (×3), «R8: una orden que nace en %s…» (×3), «…nace anulada…».
- R9 → `cobro-plataforma-porcentual-importe.test.ts` (9 casos sobre la función y 9 sobre cargos reales).
- R10 → «R10: el cargo porcentual no lleva el descuento anual…».
- R11 → «R11: cambie lo que cambie…», «R11: una orden creada con modo fijo…».
- R12 → «R12: salir de un estado final…», «R12: pasar de un estado final a otro…».
- R13 → «R13: cambiar el monto_cobrar…» y el último paso de §3.5.
- R14 → «R14: anular sin cargo vigente…», «R14: anular con cargo vigente…».
- R15 → «R15: el invariante se cumple tras cada paso…», «R15: una sentencia que cambia estado y anulación…».
- R16 → «R16: si la operación no se confirma…».
- R18 → «R18: la deuda de la wallet sube…» y la deuda de A en cada paso de §3.5.
- R19 → `cobro-porcentual-estados-finales.test.ts`.

**Salida.**
- `pnpm exec vitest run` de `cobro-plataforma-porcentual-importe`, `cobro-porcentual-estados-finales`,
  `cobro-plataforma-porcentual`, `cobro-plataforma-cargos` (SL-40), `cobro-plataforma-plan` (SLT-66),
  `plan-de-la-empresa-costeo`, `plan-de-la-empresa` y `cobro-plataforma-porcentual-aislamiento` →
  `Test Files 8 passed (8) · Tests 99 passed (99)`.
- `pnpm run typecheck` → exit 0. `eslint` de los seis archivos de test tocados → 0 problemas.

**Veredicto T3:** el cobro porcentual vive en la base con un solo invariante, y SL-40/SLT-66 siguen verdes.

## T4

**Archivos.** Creado `tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts` (R27), con base propia
`slt83_iv_<rand>` (se crea y se borra en el test; la de la feature no se toca) y `aplicarMigracionesHasta`.

**Qué recorre.** Siembra antes de M1 (empresa, plan fijo de 100 asignado, global 500, cambio programado
pendiente) → sube M1–M3 → el plan sigue fijo y la versión gana `costoPorOrdenPorcentual: null`; una orden
con plan fijo se carga 100.00 «plan» → el plan pasa al 2 % (mínimo 500): una orden de 100.000 congela
sin cargo y al entrar a `entregado` se carga 2.000,00 → los `down.sql` de M2 y M1 se niegan (P0001, con
su mensaje) con la condición congelada, con el plan porcentual y con una versión pendiente porcentual, y
la foto no cambia → limpios esos datos como dueño, bajan M3, M2 y M1 y la foto (columnas, constraints,
índices, tipos, md5 de funciones, triggers, privilegios y políticas) es la de antes de M1, la versión
pendiente vuelve a la sembrada y una orden nueva se carga 100.00 «plan» (regla de SLT-66).

**R → test.** R27 → `migracion-slt83-ida-y-vuelta.test.ts` (5 casos).

**Salida.** `pnpm exec vitest run tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts` →
`Test Files 1 passed (1) · Tests 5 passed (5)`; la base temporal no queda (`pg_database` sin `slt83%`).
`eslint` → 0 problemas.

**Veredicto T4:** ida y vuelta de M1–M3 en verde, con las bajadas negándose ante datos porcentuales.

## T5

**Búsqueda** (design §13: el invariante «toda orden tiene su cargo» de SL-40 deja de ser cierto para las
órdenes porcentuales sin estado final). Grep en `tests/`, `scripts/`, `lib/`, `app/` y `e2e/` de
`cobro_plataforma_movimiento`, `cobrosPlataforma`, «toda orden», «sin cargo», «cada orden»:

| Dónde | Qué afirma | Qué se hace |
|---|---|---|
| `tests/integration/db/demo-qa.test.ts:889` | toda orden de la empresa demo tiene exactamente un cargo | **Acotado** a las órdenes sin condiciones congeladas (`NOT EXISTS` en `cobro_plataforma_porcentual_orden`). La demo tiene excepción propia (R7: no congela nada), así que hoy no le quita ninguna orden |
| `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | nadie escribe cargos desde `lib/`/`app/` | Sigue cierto (escriben solo los triggers). Sin cambio |
| `tests/integration/db/cobro-plataforma-cargos.test.ts` R18 | una orden sin cargo (anterior a SL-40) se anula y recupera sin registrar nada | No afirma el invariante: sin cambio |
| `tests/integration/db/demo-qa-borrado.test.ts:114, 232` | la empresa sembrada tiene filas en `cobro_plataforma_movimiento` | Su empresa no tiene plan porcentual: sigue cierto. Sin cambio |
| `db/migrations/20261024120000_cobro_plataforma_blindaje_orden` (comentario) | «desde SL-40 toda orden tiene su cargo» | Migración aplicada: no se edita. La nueva regla queda en la cabecera de `20261104150200` |
| `scripts/` | ninguna comprobación del invariante | — |

**Fuera de mi capa, para el leader:** los textos de la wallet (`app/(app)/wallet/_components/wallet-labels.ts:127-128`,
«Lo que la plataforma cobra por cada orden creada…», «Cada orden nueva suma su cobro aquí») y su E2E
(`e2e/cobro-plataforma-sl40.spec.ts:57-59`) y la descripción del formulario de planes («el costo por orden
se cobra en cada orden nueva», `PlanesModule.tsx:33`, `PlanDetalle.tsx:73`) dejan de ser exactos para un
plan porcentual. No son tests del invariante ni lo pide el spec; no los toco (UI, y cambiar el texto es una
decisión fuera del spec).

**Archivos.** Modificado `tests/integration/db/demo-qa.test.ts` (el acotado y su comentario).

**Salida.**
- La base de la feature necesitó `pnpm run db:seed` (faltaban los catálogos de vehículos que pide la demo).
- `pnpm exec vitest run tests/integration/db/demo-qa.test.ts` → `Test Files 1 passed (1) · Tests 12 passed (12)`.
- `eslint` → 0 problemas.

**Pendiente:** el «Hecho» de T5 es la suite de integración de `db` entera en verde con `./init.sh --completo`
o en CI. No la corro aquí (instrucción: nunca la suite completa en local), así que T5 queda **sin marcar**
en `tasks.md` hasta que CI la dé en verde.

**Veredicto T5:** el único test que afirmaba el invariante queda acotado; verificación completa pendiente de CI.

## Guardias al cierre de la Tanda A

`pnpm run test:guardias` → `Test Files 3 failed | 325 passed (328) · Tests 6 failed | 4562 passed | 1 skipped`.
Ninguno es de este cambio:
- `dependencias-declaradas-presentes.guardia.test.ts` (4): está en `tests/baseline-rojos.json`.
- `descargas-por-registro.guardia.test.ts` y `sin-estados-retirados.guardia.test.ts` (1 cada uno): `Test timed
  out in 20000ms`, también al correrlos solos (la máquina tenía otros `tsc`/`vitest` de otros worktrees).
  Recorren `app/` y `lib/` buscando símbolos de UI y de estados retirados; esta tanda no toca ninguno de
  esos archivos. Queda para CI.

**Aviso para T7 (no es de esta tanda):** los movimientos guardan `ocurrido_at = now()` (como SL-40), que en
una columna `TIMESTAMP` sin zona toma la zona de la sesión, mientras `plan_inicio_ciclo_en_curso` trabaja en
UTC (`now() AT TIME ZONE 'UTC'`). En Supabase la sesión es UTC; la base local de esta feature está en
`America/Bogota`. Si el test de R24 (T7) sale corrido 5 h en local, la causa es esa, no la función.

## T6

**Archivos.**
- `lib/types/planes.ts`: `porcentajeSchema` exportado; `costoPorOrdenPorcentualSchema` (`{ porcentaje, minimo }`,
  `.strict()`) y su tipo `CostoPorOrdenPorcentual`; `costoPorOrdenPorcentual` obligatorio (`null` = no
  porcentual) en `crearPlanSchema`, `editarPlanSchema` y `versionPlanSchema`, con el refine de «un solo modo»
  (`path: ["costoPorOrdenPorcentual"]`) en los tres esquemas finales. `editarPlanSchema` sale ahora de un
  objeto base (`edicionDelPlan`) porque zod 4 no deja `.omit()` sobre un objeto con refinamientos.
  `VersionPlan` y `PlanDTO` ganan el campo.
- `lib/types/consumo-plan.ts`: `CostoVigente` (unión fijo/porcentual), `CobroDelCiclo`, y `CosteoDelCiclo`
  discriminado por `modo` (design §4.3).
- Lo mínimo para que compile (la lógica completa va en T7/T8): `PlanesRepository.aDTO` arma
  `costoPorOrdenPorcentual` de `costoPorOrdenPct`/`costoPorOrdenMinimo` (`toFixed(2)`); el DTO de `crear` y la
  `vigente` de `planDeEmpresa` lo pasan; `MiPlanRepository` lee `costo_por_orden_pct`/`_minimo` de
  `plan_de_la_empresa` a la versión vigente; `costeoDelCiclo` devuelve `modo: "fijo"`.
- **Fuera de mi capa (ajustes mínimos, sin texto ni comportamiento visible nuevo; los rehace la Tanda D):**
  - `components/shared/ConsumoDelPlan.tsx`: `CostoDelCiclo` tipado a la rama `modo: "fijo"` y montado solo
    con ella (el typecheck se rompía al pasar a unión). La rama porcentual es de T14.
  - `app/(app)/plataforma/planes/_components/PlanForm.tsx` (`versionDe`): envía `costoPorOrdenPorcentual:
    null`. No es de tipo sino de ejecución: con la clave ya obligatoria en el esquema, el formulario daba
    `validation_error` en todo envío y 21 tests de `PlanForm*`/`PlanDetalle`/`PlanesModule` caían. Es lo
    que el design pide para «el modo no elegido» (§6.1). El selector de modo es de T11.
- Creado `tests/unit/types/planes-schema-costo-porcentual.test.ts`.

**Tests existentes tocados solo por tipo (design §9.3).** Ganan `costoPorOrdenPorcentual: null` (PlanDTO,
VersionPlan o entrada de crear/editar) o `modo: "fijo"` (costeo); ninguna aserción de comportamiento cambia:
- §9.3: `tests/unit/planes/costeo.test.ts` (`modo` en el `toEqual`), `rastro-costeo.test.ts`,
  `tests/unit/types/planes-schema-costeo.test.ts`, `tests/unit/services/planes-service{,-costeo,-asignar-costo,
  -crear-custom,-inicio-ciclo,-lecturas}.test.ts`, `tests/components/ConsumoDelPlan.test.tsx`,
  `ConsumoDelPlanCosteo.test.tsx`, `PlanForm.test.tsx` (el payload esperado gana la clave),
  `PlanFormCosteo.test.tsx`, `tests/integration/db/_fixtures/planes.ts`, `e2e/_planes-fixture.ts`.
- No nombrados en §9.3, mismo tipo de cambio (construyen `PlanDTO`/`VersionPlan` o una entrada de
  `editar`): `tests/unit/planes/rastro.test.ts`, `tests/unit/types/planes-schema.test.ts`,
  `tests/unit/services/mi-plan-service.test.ts`, `tests/components/{MiPlanModule,PlanDetalle,PlanDetalleAsignar,
  PlanDetalleDesasignado,PlanEmpresa,PlanEmpresaSinCosto,PlanEmpresaTipoCobro,PlanesModule,PlanVistaCosteo}.test.tsx`,
  `tests/integration/{plataforma-empresa-detalle-page,plataforma-planes-page}.test.tsx`,
  `tests/integration/db/{cobro-plataforma-plan,mi-plan-repository,planes-asignacion,planes-cambio-correos,
  planes-cambio-programado,planes-costeo-escritura,planes-edicion-en-uso,planes-historial,
  planes-lecturas-plataforma}.test.ts`. En `mi-plan-repository` la `vigente` esperada gana la clave.

**R → test.**
- R1 → `planes-schema-costo-porcentual.test.ts`: «%s entra al crear, al editar y en una versión programada»
  (fijo, porcentual con y sin mínimo, vacío), «fijo y porcentual a la vez es validation_error en
  costoPorOrdenPorcentual, en las tres entradas», «la clave ausente es validation_error…», «un importe fijo
  dentro del porcentual…».
- R2 → mismo archivo: porcentaje `0.01`, `2`, `2.35`, `100`, `100.00` entran; `0`, `0.00`, `100.01`, `2.355`,
  `-1`, vacío, número y `null` → error en `costoPorOrdenPorcentual.porcentaje`; mínimo `0`, `500`, `500.5`,
  `9999999999.99` entran, `null` vale; negativo, tres decimales, fuera de `DECIMAL(12,2)`, vacío y número →
  error en `costoPorOrdenPorcentual.minimo`.

**Salida.**
- `pnpm exec vitest run tests/unit/types/planes-schema-costo-porcentual.test.ts` →
  `Test Files 1 passed (1) · Tests 33 passed (33)`.
- Unit tocados (`tests/unit/types/planes-schema{,-costeo}`, `tests/unit/planes/`, `tests/unit/services/planes-service*`,
  `mi-plan-service`, más el nuevo) → `Test Files 17 passed (17) · Tests 451 passed (451)`.
- Componentes y páginas tocados (16 archivos, incl. `PlanFormCustomAsigna`) → `Test Files 16 passed (16) ·
  Tests 243 passed (243)`.
- Integración de `db` tocada (`cobro-plataforma-plan`, `mi-plan-repository`, `planes-costeo-escritura`,
  `planes-lecturas-plataforma`) → `Test Files 4 passed (4) · Tests 28 passed (28)`; (`planes-asignacion`,
  `planes-cambio-correos`, `planes-cambio-programado`, `planes-edicion-en-uso`, `planes-historial`) →
  `Test Files 5 passed (5) · Tests 45 passed (45)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, sin errores.
- `pnpm exec eslint` de los 46 archivos tocados → 0 problemas.

**Veredicto T6:** el borde admite el modo porcentual con un solo modo a la vez, y lo existente compila y pasa sin cambios de aserción.

## T8

(Hecha antes que T7: T7 necesita el `tieneCostoConcreto` de R5 para el aviso del costeo.)

**Archivos.**
- `lib/planes/costo-concreto.ts`: `PlanParaCosto` gana `costoPorOrdenPorcentual`; `tieneCostoConcreto` =
  base «monto» y (fijo o porcentual) (R5).
- `lib/planes/rastro.ts`: campo `costoPorOrdenPorcentual` en `CampoDelPlan`/`CAMPOS` y en `planCanonico`
  (`porcentaje` y `minimo` con `importeCanonico`; `"2"` = `"2.00"`).
- `lib/planes/mensajes.ts`: `CambioDelPlanParaCorreo.costoPorOrdenPorcentual`; `textoDelCostoPorOrdenPorcentual`
  (design §4.4, la usa la línea; su test de textos es T10); línea `Costo por orden porcentual: A → B` en
  `lineasDeCambioDelPlan`; constante `SIN_COSTO_PORCENTUAL`.
- `lib/repositories/PlanesRepository.ts`: `columnasDelPorcentual`; `crearEnTx` y `aplicarVersion` escriben
  `costoPorOrdenPct`/`costoPorOrdenMinimo` (`null` las vacía al pasar a fijo o vacío). `aDTO` ya lo hizo T6.
- Creados `tests/unit/planes/rastro-costo-porcentual.test.ts`, `tests/unit/planes/costo-concreto-porcentual.test.ts`;
  completado `tests/integration/db/plan-costo-porcentual-escritura.test.ts` (5 casos nuevos).
- Tests existentes tocados por tipo: `tests/unit/planes/costeo.test.ts` (los `tieneCostoConcreto({...})` y
  `conCosto` ganan `costoPorOrdenPorcentual: null`), `tests/components/PlanVistaCosteo.test.tsx` (dos
  `lineasDeCosto({...})`), y el rastro de alta exacto de `tests/unit/planes/rastro.test.ts` y
  `tests/integration/db/planes-historial.test.ts`, que gana `costoPorOrdenPorcentual: { antes: null, despues:
  null }` (el mismo cambio que SLT-66 hizo con `costoPorOrden`).

**ABIERTO (texto no fijado por el spec).** La línea `Costo por orden porcentual: A → B` necesita un texto
para el lado vacío (el plan es fijo o vacío antes o después). Puse `SIN_COSTO_PORCENTUAL = "sin costo
porcentual"`, provisional, en una sola constante. Además, al pasar de fijo a porcentual la línea del fijo
dice `100.00 por orden → se aplica el valor global` (texto de SLT-66 para `costoPorOrden: null`), que no es
exacto con un plan porcentual. Los dos los decide el humano; no cambio el de SLT-66.

**R → test.**
- R4 → `rastro-costo-porcentual.test.ts` (canónico sin cambios, cambio de porcentaje, quitar mínimo, fijo →
  porcentual, alta; líneas de «qué cambia» en los tres sentidos y rastro viejo) y
  `plan-costo-porcentual-escritura.test.ts`: «R4: crear un plan porcentual…», «R4: editar de inmediato pasa de
  fijo a porcentual y de vuelta…», «R4: una edición sin cambio real…», «R4: programarlo no toca las columnas;
  aplicar el programado…».
- R1, R2 → mismo archivo: «R1, R2: fijo y porcentual a la vez, o un porcentaje o mínimo fuera de rango, no
  escriben nada» (más los `CHECK` de T1).
- R5 → `costo-concreto-porcentual.test.ts` (con y sin mínimo, mínimo 0.00, base sin precio, base 0.00, sin
  ningún modo, fijo).

**Salida.**
- `pnpm exec vitest run tests/integration/db/plan-costo-porcentual-escritura.test.ts` → `Test Files 1 passed (1) ·
  Tests 16 passed (16)`.
- `tests/unit/planes/` (incl. los dos nuevos) + `planes-historial`, `planes-costeo-escritura`,
  `planes-cambio-programado`, `planes-cambio-correos`, `planes-edicion-en-uso`, `planes-crear-custom-asigna`,
  `cobro-plataforma-plan` → `Test Files 15 passed (15) · Tests 186 passed (186)`.
- `tests/unit/planes/`, `plantilla-cambio-plan`, `mi-plan-service`, `planes-service*`, `PlanVistaCosteo`,
  `PlanEmpresa`, `PlanDetalle` → 20 archivos; tras corregir el rastro de alta de `rastro.test.ts`, en verde
  (`Tests 485`).
- `pnpm run typecheck` → sin errores. `eslint` de los 11 archivos tocados → 0 problemas.

**Veredicto T8:** el modo porcentual se escribe, se rastrea y cuenta como costo concreto; queda abierto un texto.

## T7

**Archivos.**
- `lib/planes/centimos.ts`: `aCentimosConSigno` y `aTexto` con signo. Lo cobrado en el ciclo (R24, por fecha del
  movimiento) puede ser negativo: un reverso de este ciclo de un cargo del anterior.
- `lib/planes/costeo.ts`: `costeoDelCiclo(plan, costoVigente, ordenes, cobroCiclo)` con la rama porcentual (total =
  base + cobrado, céntimos exactos, `null` con base por definir). Sobrecargas: con `CostoVigente` fijo devuelve la
  rama fijo y `cobroCiclo` es opcional (las llamadas de SLT-66 no cambian salvo el `modo`); con el porcentual es
  obligatorio. `TarifaLeida` y `costoVigenteDeLaTarifa` (la fila de `cobro_plataforma_tarifa_de` → `CostoVigente`;
  una forma imposible lanza), compartida por las tres lecturas.
- `lib/planes/consumo.ts`: `PlanConUsoLeido.costoVigente: CostoVigente` y `cobroCiclo`; pasa todo a `costeoDelCiclo`.
- `lib/interfaces/repositories/IMiPlanRepository.ts`, `lib/repositories/MiPlanRepository.ts`: el zod de
  `costo_vigente` admite `monto` null, `porcentaje`, `minimo`; suma `cobro_ciclo`; mapea a `CostoVigente`.
- `lib/repositories/PlanesRepository.ts` (`planDeEmpresa`): lee `porcentaje`/`minimo` de la tarifa y
  `plan_cobro_del_ciclo(org, plan_inicio_ciclo_en_curso(corto, ancla, now UTC))` en la misma `comoPlataforma`.
- `lib/repositories/EmpresasPlataformaRepository.ts` (`planYCobroVigente`) y `lib/types/empresas-plataforma.ts`:
  `EmpresaListada.cobroVigente: CostoVigente`.
- **Fuera de mi capa (ajuste mínimo de tipo):** `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx` —
  `cobroVigente: CostoVigente` y el importe se pinta solo en el modo fijo (igual que hoy). Para un plan porcentual
  la celda queda solo con la fuente («del plan») hasta T13, que trae el texto.
- Creados `tests/unit/planes/costeo-porcentual.test.ts`, `tests/integration/db/plan-de-la-empresa-porcentual.test.ts`,
  `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts`.

**Tests existentes tocados solo por tipo (design §9.3).** Los `costoVigente`/`cobroVigente` ganan `modo: "fijo"` y
los `PlanConUsoLeido` ganan `cobroCiclo: { cobrado: "0.00", pendientes: 0 }` (el modo fijo no lo usa):
- §9.3: `tests/unit/planes/costeo.test.ts`, `tests/components/ConsumoDelPlanCosteo.test.tsx`,
  `EmpresasModuleCobro.test.tsx`, `EmpresasModulePlan.test.tsx`, `tests/integration/db/plan-de-la-empresa-costeo.test.ts`
  (el `costoVigente` leído por el repositorio y el superadmin se compara con `{ modo: "fijo", ...esperado }`).
- Mismo cambio, no nombrados en §9.3: `tests/components/{empresas-module,MiPlanModule,PlanEmpresa,PlanEmpresaSinCosto,
  PlanEmpresaTipoCobro,PlanVistaCosteo}.test.tsx`, `tests/integration/{empresas-page,plataforma-empresa-detalle-page}.test.tsx`,
  `tests/integration/db/empresas-plataforma-plan.test.ts` (`toEqual({ modo: "fijo", ...esperado })`),
  `tests/unit/services/{empresas-plataforma-service,mi-plan-service,planes-service-lecturas}.test.ts`.

**R → test.**
- R23 → `costeo-porcentual.test.ts` (base + cobrado; el número de órdenes no multiplica; sin mínimo; decimal exacto y
  grande; cobrado negativo; base por definir sin total y con aviso; excepción con plan porcentual; anual; sin
  `cobroCiclo` lanza; `costoVigenteDeLaTarifa`) y `plan-de-la-empresa-porcentual.test.ts` «R23, R24: «Mi plan»
  (MiPlanRepository)… total base + cobrado» y «…el detalle de empresa del superadmin… lee lo mismo».
- R24 → `plan-de-la-empresa-porcentual.test.ts`: «plan_de_la_empresa cuenta por la fecha del movimiento y las
  pendientes del ciclo» (orden del ciclo anterior entregada en este: cuenta; reverso en el ciclo de un cargo del
  anterior: resta; pendiente del ciclo; anulada y pendiente del ciclo anterior: no cuentan → 1.500,00 y 2), «lo
  cobrado puede ser negativo…», «una empresa con plan fijo…».
- R25 → mismo archivo: ««Mi plan» y el detalle de empresa no escriben movimientos ni wallet», «pedir el de otra
  empresa da 42501, y plan_cobro_del_ciclo está cerrada a servi_app».
- R22 → `empresas-plataforma-cobro-porcentual.test.ts` (porcentual con y sin mínimo «del plan», igual a lo que congela
  la orden; excepción → fijo «propio»; plan fijo y sin plan como hoy).
- R26 → `tests/unit/planes/costeo.test.ts` y `ConsumoDelPlanCosteo.test.tsx` en verde con cambios solo de tipo.

**Salida.**
- `tests/unit/planes/` (incl. `costeo-porcentual` 19 casos), `empresas-plataforma-service`, `mi-plan-service`,
  `planes-service-lecturas` → `Test Files 12 passed (12) · Tests 202 passed (202)`.
- Integración: `empresas-plataforma-cobro-porcentual`, `plan-de-la-empresa-porcentual`, `plan-de-la-empresa-costeo`,
  `empresas-plataforma-plan`, `empresas-plataforma`, `mi-plan-repository`, `plan-de-la-empresa`,
  `planes-lecturas-plataforma` → `Test Files 8 passed (8) · Tests 43 passed (43)`
  (`plan-de-la-empresa-porcentual`: 7 casos).
- Componentes y páginas tocados (12 archivos) → `Test Files 12 passed (12) · Tests 241 passed (241)`.
- `pnpm run typecheck` → sin errores. `eslint` de los 29 archivos tocados → 0 problemas.
- El aviso de zona horaria de la Tanda A no mordió: el test pone el ancla a 10 días y separa los ciclos por días.

**Veredicto T7:** las tres lecturas dan el modo, lo cobrado en el ciclo y las pendientes, y el modo fijo sigue igual.

## T9

**Archivos.**
- `lib/services/PlanesService.ts`: **sin cambios de código**. El orden quién → zod → existe → reglas → repositorio ya
  cubre el campo nuevo (lo valida el esquema de T6) y `plan_sin_costo` usa `tieneCostoConcreto`, que T8 amplió
  (R5). Lo confirma el test nuevo.
- Creado `tests/unit/services/planes-service-costo-porcentual.test.ts` (26 casos).
- Las demás `tests/unit/services/planes-service*.test.ts` no cambian en T9 (sus ajustes de tipo fueron en T6/T7).

**R → test.**
- R3 → «%s: crear un plan porcentual → forbidden sin llamar al repositorio» y «%s: editar de inmediato o programar
  el porcentual → forbidden…» (sin sesión y los seis roles de empresa), «forbidden va antes que zod…», y el control
  «el superadmin sí crea, edita y programa…».
- R1, R2 (en el servicio) → «%s → validation_error en %s, al crear y al editar, sin llamar al repositorio».
- R5 → «base monto y porcentaje %s → ok y se asigna, con fecha y sin ella» (con y sin mínimo), «base «sin precio» y
  porcentaje → plan_sin_costo, sin asignar ni vista previa», «un pendiente que pasa a porcentual…», «asignables
  conserva los porcentuales de base monto…», «crear un custom porcentual…».

**Salida.**
- `pnpm exec vitest run tests/unit/services/planes-service-costo-porcentual.test.ts` → `Test Files 1 passed (1) ·
  Tests 26 passed (26)`.
- `pnpm exec vitest run tests/unit/services/planes-service` (las 8) → `Test Files 8 passed (8) · Tests 281 passed (281)`.
- `pnpm run typecheck` → sin errores. `eslint` del test nuevo y de `PlanesService.ts` → 0 problemas.

**Veredicto T9:** el servicio aplica R3 y R5 al modo porcentual sin cambiar su orden.

## T10

**Archivos.**
- `lib/planes/mensajes.ts` (design §4.4): `textoDelCostoPorOrdenPorcentual` (ya entró en T8 porque la usa la línea de
  «qué cambia»; aquí gana su test); `textoDelCobroVigente(c: CostoVigente)` — fijo: el importe de hoy con `money`,
  que es como la celda lo pinta desde SL-40; porcentual: `«{p} % (mín. {m})»` / `«{p} %»`, sin moneda;
  `NOTA_COBRO_PORCENTUAL` y `lineasDelCosteoPorcentual(costeo)` con las cuatro líneas de «Mi plan»
  (`Costo por orden: …`, `Cobrado en el ciclo: {c}`, `Órdenes del ciclo sin estado final: {n}`, `Total del ciclo
  hasta hoy: {base} + {c} = {t}`, `null` sin total con base por definir). Las consumen T12–T14 (frontend_dev).
- Creado `tests/unit/planes/mensajes-costo-porcentual.test.ts`.

**Textos de la Tanda A marcados como inexactos.** Ninguno sale de `lib/planes/mensajes.ts`: son literales de su propio
archivo de UI — `app/(app)/wallet/_components/wallet-labels.ts:127-128` (`deudaPlataformaPista`,
`deudaPlataformaAlDiaPista`), `app/(app)/plataforma/planes/_components/PlanesModule.tsx:33` (`descripcionNuevo`) y
`app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx:73` (`descripcionEditar`). No los toco.

**Avisos para el humano / frontend_dev.**
- Con lo cobrado negativo (R24) la línea del total queda `50000.00 + -500.00 = 49500.00`: es el literal de §4.4 con el
  valor con signo; si se quiere otra forma, es un texto a decidir.
- `{n}` de pendientes va sin separador de miles (`formatearConteo` vive en `consumo.ts`, que ya importa `mensajes.ts`:
  usarlo aquí haría un ciclo). El componente puede formatearlo si hace falta.

**R → test.**
- R21 → `mensajes-costo-porcentual.test.ts`: con mínimo, sin mínimo, dos decimales desde «2»/«500», fijo y vacío como
  SLT-66 R24.
- R22 (textos) → mismo archivo: `«2.00 % (mín. 500.00)»`, `«2.35 %»`, fijo con `money` para las cuatro fuentes.
- R23 (textos) → mismo archivo: las líneas con y sin mínimo, con pendientes, y sin total con base por definir.

**Salida.**
- `pnpm exec vitest run tests/unit/planes/mensajes-costo-porcentual.test.ts` → `Test Files 1 passed (1) · Tests 13 passed (13)`.
- `tests/unit/planes/`, `plantilla-cambio-plan`, `ConsumoDelPlan`, `ConsumoDelPlanCosteo`, `EmpresasModuleCobro`,
  `PlanEmpresa`, `PlanVistaCosteo` → `Test Files 16 passed (16) · Tests 277 passed (277)`.
- `pnpm run typecheck` → sin errores. `eslint` de `mensajes.ts` y del test → 0 problemas.

## Guardias al cierre de las Tandas B y C

`pnpm run test:guardias` → `Test Files 1 failed | 324 passed | 3 skipped (328) · Tests 4 failed | 4541 passed | 24 skipped`.
El único rojo es `dependencias-declaradas-presentes.guardia.test.ts` (4), que está en `tests/baseline-rojos.json`
(igual que al cierre de la Tanda A). Los dos timeouts de la Tanda A no se repitieron.

**Veredicto T10:** los textos del modo porcentual viven en un solo sitio, con test; quedan dos avisos de forma para el humano.

## Textos aprobados (2026-11-04)

Tres textos que decidió el humano el 2026-11-04.

Archivos modificados:
- `lib/planes/mensajes.ts`: `SIN_COSTO_PORCENTUAL` pierde el «ABIERTO ... provisional» y queda
  aprobado; nueva `COBRA_PORCENTUAL = "cobra porcentual"` y `textoDelLadoFijo` (lado del fijo vacío con
  el porcentual de ese mismo lado no nulo → «cobra porcentual»; sin porcentual sigue SLT-66);
  `sumaDelCobrado` (cobrado negativo → `«− <abs>»` con U+2212, por el texto decimal, sin aritmética).
- `tests/unit/planes/rastro-costo-porcentual.test.ts`: casos nuevos; los dos casos SLT-83 de fijo ↔
  porcentual pasan a esperar «cobra porcentual» (no se tocó ninguna aserción de SLT-66).
- `tests/unit/planes/mensajes-costo-porcentual.test.ts`: casos nuevos del total con resta.

R → test:
- R4 (rastro fijo → porcentual: «100.00 por orden → cobra porcentual»; porcentual → fijo: «cobra
  porcentual → 100.00 por orden»; sin porcentual sigue «se aplica el valor global»; el texto aprobado
  de `SIN_COSTO_PORCENTUAL`) → `tests/unit/planes/rastro-costo-porcentual.test.ts` > «las líneas de
  "qué cambia"».
- R23 (total con cobrado negativo: «50000.00 − 500.00 = 49500.00»; con 0 sigue «+») →
  `tests/unit/planes/mensajes-costo-porcentual.test.ts` > «SLT-83 R23 — las líneas de "Mi plan"».

Salida real:
```
pnpm exec vitest run tests/unit/planes/
 Test Files  10 passed (10)
      Tests  162 passed (162)
pnpm exec vitest run tests/unit/services/email/plantilla-cambio-plan.test.ts tests/unit/services/mi-plan-service.test.ts
 Test Files  2 passed (2)
      Tests  28 passed (28)
pnpm run typecheck   → tsc --noEmit, sin errores
pnpm exec eslint lib/planes/mensajes.ts tests/unit/planes/rastro-costo-porcentual.test.ts tests/unit/planes/mensajes-costo-porcentual.test.ts → sin salida, exit 0
```

Avisos:
- La dirección inversa (porcentual → fijo) se implementó: la línea se arma lado por lado con el
  porcentual de ese mismo lado, así que es simétrica sin ambigüedad.
- Hoy ninguna pantalla de `app/` llama a `lineasDelCosteoPorcentual`; el texto con resta llega a la UI
  cuando la tanda de frontend la use.

Veredicto: textos aprobados aplicados, con test y en verde.

## T11

**Archivos.**
- `app/(app)/plataforma/planes/_components/PlanForm.tsx` (design §6.1): `RadioGroup` «Cobro por orden» con «Fijo» y
  «Porcentual» (de `components/ui/radio-group`); con «Fijo», el «Costo por orden» de SLT-66 sin cambios; con
  «Porcentual», «Porcentaje» (obligatorio, sufijo `%` visual `aria-hidden`) y «Mínimo» (opcional, `MontoInput`, el
  mismo del costo por orden). El modo inicial sale de `costoPorOrdenPorcentual !== null`. `versionDe` envía solo el
  modo elegido (el otro, `null`); el estado guarda los dos, así cambiar de modo no borra lo escrito.
  `camposEnOrden` registra `costoPorOrdenPorcentual.porcentaje`/`.minimo` en modo porcentual (error junto al campo y
  foco); `rechazoConCampo` no apunta a «Costo por orden» oculto en modo porcentual. Se quita el comentario
  provisional de T6.
- Etiquetas nuevas en `TEXTOS_PLAN_FORM` (las fija design §6.1 / R20: «Cobro por orden», «Fijo», «Porcentual»,
  «Porcentaje», «%», «Mínimo»). Son etiquetas del formulario, no textos de dinero: siguen el patrón del resto del
  formulario, no `lib/planes/mensajes.ts`.
- Creado `tests/components/PlanFormCostoPorcentual.test.tsx` (10 casos).

**Tests existentes tocados.** Ninguno.

**R → test.**
- R20 → `PlanFormCostoPorcentual.test.tsx`: «el selector ofrece «Fijo» y «Porcentual»…», «con «Porcentual» pide
  «Porcentaje» (obligatorio, con sufijo %) y «Mínimo» (opcional)», «con «Porcentual» envía solo el porcentaje y el
  mínimo; el fijo viaja null», «el mínimo vacío viaja como null», «con «Fijo» el porcentual viaja null aunque se haya
  escrito», «cambiar de modo no borra lo escrito en el otro», «al editar un plan porcentual abre en «Porcentual»…»,
  «al editar un plan fijo abre en «Fijo»», «un porcentaje inválido no llega a la action…», «el validation_error de la
  action en .porcentaje y .minimo sale junto a cada campo y conserva lo escrito».

**Salida.**
```
pnpm exec vitest run tests/components/PlanFormCostoPorcentual.test.tsx tests/components/PlanFormCosteo.test.tsx tests/components/PlanForm.test.tsx tests/components/PlanFormCustomAsigna.test.tsx
 Test Files  4 passed (4)
      Tests  55 passed (55)
pnpm exec vitest run tests/components/PlanDetalle.test.tsx tests/components/PlanesModule.test.tsx
 Test Files  2 passed (2)
      Tests  26 passed (26)
NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck → tsc --noEmit, sin errores
pnpm exec eslint "app/(app)/plataforma/planes/_components/PlanForm.tsx" tests/components/PlanFormCostoPorcentual.test.tsx → No issues found
```

**Veredicto T11:** el formulario elige el modo, envía solo el elegido y pinta los errores junto a su campo.
