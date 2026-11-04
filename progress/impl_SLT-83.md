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
