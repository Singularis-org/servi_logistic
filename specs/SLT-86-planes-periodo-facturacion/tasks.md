# SLT-86 — Planes: período de facturación · tasks.md

> Orden: T0 primero. T1–T9 son backend (`backend_dev`); T10–T13 son frontend (`frontend_dev`) y salen en cuanto
> T2 fija los tipos. `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. No queda ninguna pregunta
> abierta: P4 = (a) y las propuestas del spec las aprobó el humano el 2026-11-05.

## [x] T0 — Integrar `dev` tras el merge de SLT-83

- **Depende de:** el merge del PR #79 (SLT-83) en `dev`.
- **Pasos:**
  - `git merge origin/dev`;
  - releer los cuerpos vigentes de `plan_de_la_empresa`, `plan_tope_ordenes`, `plan_cupo_ordenes`, `costeo.ts`,
    `cobro.ts`, `mensajes.ts` y `PlanForm.tsx`;
  - confirmar dónde se cuenta «lo cobrado en el ciclo» (SLT-83 R24) y actualizar `design.md > §12`;
  - rehacer la lista de `design.md > §9` con los tests de SLT-83 que lean el tope de órdenes o el ciclo;
  - fijar el timestamp de la migración y actualizar `## Archivos esperados`.
- **Hecho:** rama al día; `./init.sh` en verde sin cambios propios; §9 y §12 al día.

## T1 — Migración y esquema (R1, R10, R11, R32–R36)

- **Depende de:** T0.
- **Pasos:**
  - `db/migrations/<ts>_plan_periodo_facturacion/{migration,down}.sql`, según `design.md > §8`;
  - `db/schema.prisma`: `PlanDescuentoPeriodo`, `PlanPrecioHistorial` y el pendiente en `Organizacion`, sin
    `topeOrdenesCiclo`, `precioAnual`, `descuentoAnualPct` ni `planCicloCortoDesdeAt`;
  - `lib/db/modelos-de-negocio.ts`: las dos tablas nuevas como plataforma.
- **Hecho:**
  - `prisma generate` ok;
  - `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts` verde en CI: P3, conversión, rastro de topes,
    entrada de todas las empresas a las 00:00 de hoy, negativas del `down` y cuerpos literales;
  - guardias `organizacion-en-modelos`, `unicos-por-empresa`, `fk-misma-empresa` y `rls` en verde.

## T2 — Tipos y esquemas zod (R1, R8, R10, R11, R16, R22)

- **Depende de:** T0. **[P]** con T1.
- **Pasos:**
  - `lib/types/planes.ts`: `TIPOS_COBRO` ×4, `DescuentoPeriodo`, `PrecioPlan`, `TopesPlan` sin órdenes,
    `vigenteDesde` y `cancelarCambioEmpresaSchema`;
  - `lib/types/consumo-plan.ts`.
- **Hecho:** `tests/unit/types/planes-schema-periodo.test.ts` verde.

## T3 — Período de calendario, SQL y TS (R4–R7)

- **Depende de:** T1, T2.
- **Pasos:** las funciones de `design.md > §3.1`, `lib/planes/ciclo.ts` (§3.2) y `plan_de_la_empresa` (§3.3).
- **Hecho:** `tests/unit/planes/ciclo-periodo.test.ts` y `tests/integration/db/plan-ciclo-periodo.test.ts`
  (tabla base = TS) verdes.

## T4 — Retirar el tope de órdenes (R8, R34)

- **Depende de:** T1, T2.
- **Pasos:**
  - borrar `CupoPlanRepository` e `ICupoPlanRepository`, y el chequeo previo en `BulkOrdenService` y en las rutas
    de carga masiva y de API key;
  - quitar la variante `ordenes` de `tope-error.ts`;
  - quitar las órdenes de `usoDe` y de las vistas previas en `PlanesRepository`;
  - retirar o adaptar los tests de `design.md > §9` que prueban el tope.
- **Hecho:** `tests/integration/db/plan-sin-tope-ordenes.test.ts` verde; `pnpm run typecheck` sin referencias
  al cupo.

## T5 — Costo base, tramo, siguiente cobro e historial (R9, R10, R12, R27, R30) [P]

- **Depende de:** T2, T3.
- **Pasos:** `lib/planes/cobro.ts`.
- **Hecho:** `tests/unit/planes/cobro-periodo.test.ts` verde; `cobro.test.ts` adaptado.

## T6 — Costeo y consumo (R7, R28) [P]

- **Depende de:** T2, T5.
- **Pasos:** `lib/planes/costeo.ts`, `lib/planes/consumo.ts`.
- **Hecho:** `tests/unit/planes/costeo-periodo.test.ts` verde (modo fijo y modo porcentual).

## T7 — Rastro, versión y mensajes (R24, R30, R31) [P]

- **Depende de:** T2.
- **Pasos:** `lib/planes/rastro.ts`, `lib/planes/mensajes.ts`.
- **Hecho:** `tests/unit/planes/rastro-periodo.test.ts` y `tests/unit/planes/mensajes-periodo.test.ts` verdes.

## T8 — Cambios de empresa con fecha de efecto y sus trabajos, y fin del ciclo corto (R2, R14, R16–R21)

- **Depende de:** T3, T4, T5.
- **Pasos:**
  - `PlanesRepository` (§5.1–§5.3) e `IPlanesRepository`;
  - `lib/planes/jobs-cambio-plan.ts`;
  - registrar el trabajo en `app/api/cron/procesar-jobs/route.ts` y en `lib/modulos/reparto.ts`.
- **Hecho:**
  - `tests/integration/db/planes-cambio-empresa.test.ts` y `tests/unit/planes/jobs-cambio-empresa.test.ts`
    verdes;
  - los tests de asignación y tipo de cobro de §9, adaptados.

## T9 — Ediciones de precio con fecha e historial; lecturas y servicios (R3, R13, R15, R22, R26, R27, R29, R32)

- **Depende de:** T7, T8.
- **Pasos:**
  - `PlanesService`, `IPlanesService`;
  - `PlanesRepository.crear`/`editar`/`programarCambio`/`aplicarCambioProgramado` (§5.4);
  - `MiPlanRepository`, `IMiPlanRepository`, `MiPlanService`, `EmpresasPlataformaRepository`;
  - `lib/actions/planes.ts`.
- **Hecho:** `tests/integration/db/plan-precio-historial.test.ts`, `plan-descuento-periodo.test.ts`,
  `plan-de-la-empresa-periodo.test.ts`, `tests/unit/services/planes-service-periodo.test.ts` y
  `tests/unit/actions/planes.composition-root.test.ts` verdes.

## T10 — Formulario del plan (R23, R25) [P]

- **Depende de:** T2.
- **Pasos:** `PlanForm.tsx`.
- **Hecho:** `tests/components/PlanFormDescuentos.test.tsx` verde; `PlanForm*.test.tsx` adaptados.

## T11 — Catálogo, detalle y detalle de empresa (R24–R26) [P]

- **Depende de:** T2, T7.
- **Pasos:** `PlanesModule.tsx`, `PlanDetalle.tsx`, `PlanEmpresa.tsx`, `TipoCobroCampo.tsx`, `tipo-cobro.ts`.
- **Hecho:** `tests/components/PlanEmpresaPeriodo.test.tsx` verde; `PlanEmpresa*.test.tsx`, `PlanDetalle*.test.tsx`
  y `PlanesModule.test.tsx` adaptados.

## T12 — «Mi plan», consumo y lista de empresas (R7, R8, R26–R29) [P]

- **Depende de:** T2, T5, T6.
- **Pasos:** `ConsumoDelPlan.tsx`, `AvisosDeTopes.tsx`, `MiPlanModule.tsx`, `EmpresasModule.tsx`.
- **Hecho:** `tests/components/ConsumoDelPlanPeriodo.test.tsx` y `tests/components/EmpresasModulePeriodo.test.tsx`
  verdes; `ConsumoDelPlan*.test.tsx` y `MiPlanModule.test.tsx` adaptados.

## T13 — No regresión y E2E (R37)

- **Depende de:** T1–T12.
- **Pasos:**
  - cerrar la lista de `design.md > §9`;
  - adaptar `e2e/_planes-fixture.ts`, `e2e/planes-superadmin.spec.ts` y `e2e/planes-costeo.spec.ts`;
  - `progress/impl_SLT-86.md` con el mapa `R<n> → test` y los tests retirados con su motivo.
- **Hecho:** typecheck y lint con 0 errores; `./init.sh` en verde; `gate-completo` verde en el PR.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261106120000_plan_periodo_facturacion/migration.sql`
- `db/migrations/20261106120000_plan_periodo_facturacion/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/types/planes.ts`
- `lib/types/consumo-plan.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/planes/ciclo.ts`
- `lib/planes/cobro.ts`
- `lib/planes/costeo.ts`
- `lib/planes/consumo.ts`
- `lib/planes/mensajes.ts`
- `lib/planes/rastro.ts`
- `lib/planes/tope-error.ts`
- `lib/planes/jobs-cambio-plan.ts`
- `lib/modulos/reparto.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `app/api/ordenes/carga-masiva/chunk/route.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/repositories/CupoPlanRepository.ts`
- `lib/interfaces/repositories/ICupoPlanRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/interfaces/repositories/IMiPlanRepository.ts`
- `lib/interfaces/services/IPlanesService.ts`
- `lib/services/PlanesService.ts`
- `lib/services/MiPlanService.ts`
- `lib/actions/planes.ts`
- `components/shared/ConsumoDelPlan.tsx`
- `components/shared/AvisosDeTopes.tsx`
- `components/shared/TipoCobroCampo.tsx`
- `components/shared/tipo-cobro.ts`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/mi-plan/_components/MiPlanModule.tsx`
- `tests/unit/types/planes-schema-periodo.test.ts`
- `tests/unit/types/planes-schema.test.ts`
- `tests/unit/planes/ciclo-periodo.test.ts`
- `tests/unit/planes/cobro-periodo.test.ts`
- `tests/unit/planes/cobro.test.ts`
- `tests/unit/planes/costeo-periodo.test.ts`
- `tests/unit/planes/costeo.test.ts`
- `tests/unit/planes/consumo.test.ts`
- `tests/unit/planes/rastro-periodo.test.ts`
- `tests/unit/planes/mensajes-periodo.test.ts`
- `tests/unit/planes/jobs-cambio-empresa.test.ts`
- `tests/unit/services/planes-service-periodo.test.ts`
- `tests/unit/services/planes-service-tipo-cobro.test.ts`
- `tests/unit/services/planes-service-inicio-ciclo.test.ts`
- `tests/unit/services/planes-service-crear-custom.test.ts`
- `tests/unit/services/planes-service-asignar-costo.test.ts`
- `tests/unit/services/bulk-orden-service.tope-plan.test.ts`
- `tests/unit/api/carga-composition-root-cupo.test.ts`
- `tests/unit/api/api-key-carga-tope-plan.test.ts`
- `tests/unit/utils/ciclo-plan.test.ts`
- `tests/unit/actions/planes.composition-root.test.ts`
- `tests/integration/db/plan-ciclo-periodo.test.ts`
- `tests/integration/db/plan-sin-tope-ordenes.test.ts`
- `tests/integration/db/planes-cambio-empresa.test.ts`
- `tests/integration/db/plan-descuento-periodo.test.ts`
- `tests/integration/db/plan-precio-historial.test.ts`
- `tests/integration/db/plan-de-la-empresa-periodo.test.ts`
- `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`
- `tests/integration/db/plan-ciclo.test.ts`
- `tests/integration/db/plan-ciclo-corto.test.ts`
- `tests/integration/db/_fixtures/ciclo-corto.ts`
- `tests/integration/db/_fixtures/planes.ts`
- `tests/integration/db/plan-topes-ordenes.test.ts`
- `tests/integration/db/plan-topes-concurrencia.test.ts`
- `tests/integration/db/plan-de-la-empresa.test.ts`
- `tests/integration/db/mi-plan-repository.test.ts`
- `tests/integration/db/planes-acceso-servi-app.test.ts`
- `tests/integration/db/plan-maestro-sin-tope.test.ts`
- `tests/integration/db/planes-cambio-programado.test.ts`
- `tests/integration/db/planes-cambio-correos.test.ts`
- `tests/integration/db/planes-catalogo.test.ts`
- `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`
- `tests/integration/db/planes-asignacion.test.ts`
- `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts`
- `tests/integration/db/planes-crear-custom-asigna.test.ts`
- `tests/integration/db/migracion-planes-custom-ida-y-vuelta.test.ts`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `tests/components/PlanFormDescuentos.test.tsx`
- `tests/components/PlanEmpresaPeriodo.test.tsx`
- `tests/components/ConsumoDelPlanPeriodo.test.tsx`
- `tests/components/EmpresasModulePeriodo.test.tsx`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanFormCosteo.test.tsx`
- `tests/components/PlanFormCustomAsigna.test.tsx`
- `tests/components/PlanFormVistaPreviaCustom.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `tests/components/PlanesModule.test.tsx`
- `tests/components/PlanEmpresa.test.tsx`
- `tests/components/PlanEmpresaTipoCobro.test.tsx`
- `tests/components/PlanEmpresaSinCosto.test.tsx`
- `tests/components/PlanVistaCosteo.test.tsx`
- `tests/components/MiPlanModule.test.tsx`
- `tests/components/ConsumoDelPlan.test.tsx`
- `tests/components/ConsumoDelPlanCosteo.test.tsx`
- `tests/integration/db/planes-edicion-en-uso.test.ts`
- `tests/integration/db/planes-historial.test.ts`
- `tests/integration/db/planes-lecturas-plataforma.test.ts`
- `tests/integration/db/planes-costeo-escritura.test.ts`
- `tests/integration/db/cobro-plataforma-plan.test.ts`
- `tests/integration/db/plan-costo-porcentual-escritura.test.ts`
- `tests/integration/db/plan-de-la-empresa-porcentual.test.ts`
- `tests/integration/db/cobro-plataforma-porcentual.test.ts`
- `tests/integration/plataforma-planes-page.test.tsx`
- `tests/unit/planes/tope-error.test.ts`
- `tests/unit/planes/rastro.test.ts`
- `tests/unit/planes/rastro-costeo.test.ts`
- `tests/unit/planes/rastro-costo-porcentual.test.ts`
- `tests/unit/planes/costeo-porcentual.test.ts`
- `tests/unit/planes/costo-concreto-porcentual.test.ts`
- `tests/unit/planes/mensajes-costo-porcentual.test.ts`
- `tests/unit/services/planes-service.test.ts`
- `tests/unit/services/planes-service-costeo.test.ts`
- `tests/unit/services/planes-service-costo-porcentual.test.ts`
- `tests/unit/services/planes-service-lecturas.test.ts`
- `tests/unit/services/mi-plan-service.test.ts`
- `tests/unit/services/email/plantilla-cambio-plan.test.ts`
- `tests/unit/types/planes-schema-costeo.test.ts`
- `tests/unit/types/planes-schema-costo-porcentual.test.ts`
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`
- `tests/components/PlanDetalleAsignar.test.tsx`
- `tests/components/PlanDetalleDesasignado.test.tsx`
- `tests/components/PlanEmpresaCostoPorcentual.test.tsx`
- `tests/components/PlanFormCostoPorcentual.test.tsx`
- `tests/components/ConsumoDelPlanPorcentual.test.tsx`
- `e2e/_planes-fixture.ts`
- `e2e/planes-superadmin.spec.ts`
- `e2e/planes-costeo.spec.ts`
- `e2e/dos-empresas-humo.spec.ts`
- `progress/impl_SLT-86.md`

El timestamp de la migración (`20261106120000`) quedó fijado en T0, detrás de la última de `dev`
(`20261104150200_cobro_plataforma_porcentual_funciones`).
