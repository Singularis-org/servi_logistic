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
