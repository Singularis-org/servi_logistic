# impl SLT-215 — Planes: niveles de beneficio por volumen de órdenes

## Tanda 1 (backend_dev): T1 y T2 — 2026-11-19

### Archivos

Nuevos:
- `lib/planes/niveles.ts` — `MAX_NIVELES`, `Nivel`, `DescuentoNivel`, textos de error, `descuentoNivelSchema`,
  `nivelSchema`, `nivelesSchema`, `descuentosDelNivel`, `textoDelNivel`, `textoDeLosNiveles`, `SIN_NIVELES`.
- `lib/planes/importes.ts` — hoja con `porcentajeSchema`, `SOLO_UNA_FORMA` e `importeCanonico` (ver Desviaciones).
- `db/migrations/20261121120000_plan_nivel_job_enum/{migration,down}.sql`
- `db/migrations/20261121120100_plan_nivel/{migration,down}.sql`
- `tests/unit/planes/niveles.test.ts`
- `tests/integration/db/plan-nivel.test.ts`
- `tests/integration/db/migracion-plan-nivel-ida-y-vuelta.test.ts`

Modificados:
- `lib/types/planes.ts` — `niveles` opcional en `crearPlanSchema` y `edicionDelPlan` (lo hereda
  `versionPlanSchema`), en `VersionPlan`, `PlanDTO` y `PlanVista`; reexporta `porcentajeSchema` y `SOLO_UNA_FORMA`.
- `lib/planes/rastro.ts` — reexporta `importeCanonico` desde `importes.ts` (sin cambio de comportamiento).
- `db/schema.prisma` — `PlanNivel`, `PlanNivelEmpresa`, `PlanNivelHistorial` y sus relaciones.
- `lib/db/modelos-de-negocio.ts` — `PlanNivel` de plataforma; `PlanNivelEmpresa` y `PlanNivelHistorial` de negocio.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` y `tests/unit/scripts/verificar-rls-despliegue.test.ts` —
  92 → 94 tablas de negocio (precedente: SLT-60).
- `tests/integration/db/orden-traspaso-migration.test.ts` — las dos migraciones nuevas en la lista del árbol.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R1 | `tests/unit/planes/niveles.test.ts` («la lista de niveles», «los niveles en los esquemas del plan»); `tests/integration/db/plan-nivel.test.ts` («R1: guarda los niveles…») |
| R2 | `niveles.test.ts` («R2 — los descuentos de un nivel»: 10 % + 10 %, nivel 0) |
| R3 | `niveles.test.ts` («R3 — la meta»: 0, negativa, decimal, NaN, no creciente) |
| R4 | `niveles.test.ts` («R4 — el descuento»: % 0, 100,01, 100, 0,01; monto 0, 0,01; las dos formas) |
| R5 | `niveles.test.ts` («R5 — hasta 10 niveles»: 11) |
| R6 | `plan-nivel.test.ts` (cada CHECK; `servi_app` sin SELECT/INSERT/UPDATE/DELETE en `plan_nivel`); `migracion-plan-nivel-ida-y-vuelta.test.ts` (RLS y privilegios tras subir) |
| R7 (base) | `migracion-plan-nivel-ida-y-vuelta.test.ts` (CHECK de pasos admite `niveles`; al bajar, vuelve a 7). El paso del formulario es de T5/T8 |
| R18 | `niveles.test.ts` (versión sin `niveles` valida y no trae la clave) |
| R20, R21 (textos) | `niveles.test.ts` («R21, R20 — los textos») |
| R29 (red de la base) | `plan-nivel.test.ts` (único parcial `plan_nivel_historial_un_cierre_por_mes`) |
| R35 | `plan-nivel.test.ts` (CHECK de motivo, niveles, órdenes, mes y órdenes) |
| R36 | `plan-nivel.test.ts` (A no ve nivel ni historial de B; nadie inserta, cambia ni borra; `servi_app` no ejecuta las cinco funciones; sin cambio de empresa SL017) |
| R37 | `migracion-plan-nivel-ida-y-vuelta.test.ts` (relleno: nivel 0, cuenta 0, entrada = ancla, mes de la migración, sin historial; C sin plan sin fila) |

R22–R28, R30–R34 viven en las funciones de la migración pero sus tests son de T3 y T6.

### Salida real

- `pnpm run typecheck`: sin errores (`tsc --noEmit`, salida vacía).
- `pnpm exec eslint` sobre los 11 archivos tocados: sin errores (exit 0).
- `pnpm run test:guardias`: 360 archivos pasan, 5412 tests pasan, 1 saltado.
- `vitest run` unit (niveles, verificar-rls-despliegue, rastro, beneficios, planes-schema-costo-porcentual,
  mensajes-periodo): 6 archivos, 110 tests pasan.
- `vitest run --no-file-parallelism` integración (plan-nivel, migracion-plan-nivel-ida-y-vuelta,
  orden-traspaso-migration, plan-beneficio): 4 archivos, 36 tests pasan (con base, ninguno saltado).

### Base de datos

`servi_logistic_slt215` en el Postgres local del `.env` del checkout principal: misma URL con solo el nombre de la
base cambiado (`DATABASE_URL` y `DIRECT_URL` exportadas en la sesión; el worktree no tiene `.env`). Recreada con
`DROP/CREATE`, `pnpm exec prisma migrate deploy` y `pnpm run db:seed`. `node_modules` del worktree es una junction al
del checkout principal.

### Desviaciones del design

1. **`lib/planes/importes.ts` (archivo nuevo).** `lib/types/planes.ts` importa `nivelesSchema` y `niveles.ts`
   necesitaba `porcentajeSchema`, `SOLO_UNA_FORMA` (de `planes.ts`) e `importeCanonico` (de `rastro.ts`, que a su
   vez importa valores de `planes.ts` en el nivel del módulo): un ciclo que deja un módulo a medio evaluar. Las tres
   piezas pasan a una hoja y `planes.ts`/`rastro.ts` las reexportan con su nombre: ningún importador cambia.
2. **`job_tipo` en Prisma, a T7.** La migración añade `plan_niveles_cerrar` en la base, pero el valor NO entra
   todavía en `enum JobTipo` de `db/schema.prisma`: con él, `MODULO_POR_JOB` (Record exhaustivo) rompe el typecheck y
   la guardia `jobs-handler-por-tipo` pide su handler, que son de T7. T7 lo añade junto con el handler.
3. **`@@index([organizacionId])` en `PlanNivelEmpresa`** (y su índice SQL) aunque la clave ya es `organizacion_id`:
   la guardia `organizacion-en-modelos` lo exige a toda tabla de negocio (mismo caso que `tarifa_activacion`).
4. **Triggers `<tabla>_sin_cambio_de_empresa`** en las dos tablas de negocio: los exige la guardia
   `fk-misma-empresa` (el design solo descartaba los `sme_*`, que siguen sin hacer falta).
5. **`plan_nivel_recalcular` sin fila de la empresa** devuelve NULL sin tocar nada, y rechaza (22023) un motivo que
   no sea `cambio_niveles` o `cambio_plan`. El design no decía qué hacer sin fila; T6 puede revisarlo.
6. **Textos de R21:** el monto y el porcentaje van con `importeCanonico` (dos decimales: «−10.00 %», «−1500.00»),
   como el costo por orden y los descuentos del período; la meta va sin separador de miles.

### Veredicto

T1 y T2 hechas; typecheck, lint, guardias y los tests de la tanda en verde.
