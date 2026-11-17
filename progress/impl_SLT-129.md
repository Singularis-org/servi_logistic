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
