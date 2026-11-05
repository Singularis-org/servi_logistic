# SLT-83 — planes-costo-por-orden-porcentual · tasks.md

> Requisitos: `requirements.md` (R1–R29). Diseño: `design.md`. Reparto por capa (`docs/perfil-agentes.md >
> implementer`): `backend_dev` en tandas A–C, `frontend_dev` en D, los dos en E. `[P]` = puede ir en
> paralelo con las demás `[P]` de su tanda. Cada task cierra con su test en verde y `./init.sh` en verde al
> final de la tanda.
>
> **P1 cerrada** (2026-11-04, opción A): lo cobrado en el ciclo se filtra por la fecha del cargo (R24, T7).

## Tanda A — base de datos (backend_dev)

- [x] **T0. Comprobar el punto de partida.** Las migraciones de `dev` siguen terminando en
  `20261104130100`; si no, renombrar los timestamps de §2 antes de escribirlas. Buscar en `db/migrations/`
  y `lib/` todo lo que llama a `cobro_plataforma_tarifa_de` (`design.md > §13`).
  *Hecho:* lista de llamadores anotada en `progress/impl_SLT-83.md`.
- [x] **T1. M1 `20261104150000_plan_costo_por_orden_porcentual`** (design §2.1) con su `down.sql`, que se
  niega si hay datos porcentuales. Prisma: `Plan.costoPorOrdenPct`, `Plan.costoPorOrdenMinimo` con el
  comentario de los `CHECK`. Depende de T0.
  *Hecho:* `tests/integration/db/plan-costo-porcentual-escritura.test.ts`, casos de `CHECK` (R1, R2) en
  verde; diff de drift vacío.
- [x] **T2. M2 `20261104150100_cobro_plataforma_porcentual_orden`** (design §2.2): tabla, índices, RLS,
  política, `REVOKE`, triggers de SL-17 generados, índice `(organizacion_id, ocurrido_at)` y `down.sql`.
  Prisma: modelo, relaciones inversas en `Orden` y `Organizacion`. `MODELOS_DE_NEGOCIO` gana el modelo.
  Depende de T1.
  *Hecho:* guardias `organizacion-en-modelos`, `rls-por-empresa`, `fk-misma-empresa` en verde;
  `tests/integration/db/cobro-plataforma-porcentual-aislamiento.test.ts` (R17) en verde.
- [x] **T3. M3 `20261104150200_cobro_plataforma_porcentual_funciones`** (design §2.3, §3): las nueve
  piezas, con los cuerpos copiados literalmente de su origen salvo lo que nombra el design, y el `down.sql`
  con los cuerpos de origen. Depende de T2.
  *Hecho:* `cobro-plataforma-porcentual.test.ts` (R6–R8, R10–R16, R18; tabla de §3.5 entera),
  `cobro-plataforma-porcentual-importe.test.ts` (R9) y `cobro-porcentual-estados-finales.test.ts` (R19)
  en verde; las suites de SL-40 y SLT-66 (`cobro-plataforma-cargos`, `cobro-plataforma-plan`) sin cambios
  y en verde.
- [x] **T4. Ida y vuelta** de M1–M3: `tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts` (R27). Con
  `aplicarMigracionesHasta`: sube, crea y cobra una orden porcentual, comprueba que las bajadas se niegan,
  limpia, baja las tres y crea una orden que se cobra con la regla de SLT-66. Depende de T3.
  *Hecho:* test en verde.
- [ ] **T5. Invariante de SL-40.** Buscar tests y guardias que afirmen «toda orden tiene su cargo» y
  acotarlos a las órdenes sin condiciones (design §13), con la causa en `progress/impl_SLT-83.md`.
  Depende de T3. `[P]` con T4.
  *Hecho:* la suite de integración de `db` en verde con `./init.sh --completo` (o en CI).

## Tanda B — tipos, dominio y escritura (backend_dev)

- [x] **T6. Tipos y esquemas** (design §4.1): exportar `porcentajeSchema`; `costoPorOrdenPorcentualSchema`;
  campo en `crearPlanSchema`, `editarPlanSchema` y `versionPlanSchema` con el refine de «no los dos»;
  `VersionPlan`, `PlanDTO`; `CostoVigente` y `CosteoDelCiclo` en unión (`lib/types/consumo-plan.ts`).
  Ajustar por tipo los tests de §9.3. Depende de T1.
  *Hecho:* `tests/unit/types/planes-schema-costo-porcentual.test.ts` (R1, R2) en verde; typecheck en verde.
- [x] **T7. Lecturas** (design §4.3): `MiPlanRepository`, `PlanesRepository.planDeEmpresa`,
  `EmpresasPlataformaRepository.planYCobroVigente`, `lib/planes/consumo.ts`, `lib/planes/costeo.ts`.
  Depende de T3 y T6.
  *Hecho:* `tests/unit/planes/costeo-porcentual.test.ts` (R23),
  `tests/integration/db/plan-de-la-empresa-porcentual.test.ts` (R24, R25) y
  `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts` (R22) en verde;
  `tests/unit/planes/costeo.test.ts` y `plan-de-la-empresa-costeo.test.ts` en verde solo con cambios de
  tipo (R26).
- [x] **T8. Escritura y rastro** (design §4.2): `PlanesRepository.crear`/`aplicarVersion`/`aDTO`,
  `diferenciasDelPlan`, `lineasDeCambioDelPlan`, `tieneCostoConcreto`. Depende de T6. `[P]` con T7.
  *Hecho:* `tests/unit/planes/rastro-costo-porcentual.test.ts` (R4),
  `tests/unit/planes/costo-concreto-porcentual.test.ts` (R5),
  `tests/integration/db/plan-costo-porcentual-escritura.test.ts` completo (R1, R2, R4) en verde.
- [x] **T9. Servicio** `PlanesService`: el orden quién → zod → existe → reglas no cambia; `plan_sin_costo`
  con la definición nueva. Depende de T8.
  *Hecho:* `tests/unit/services/planes-service-costo-porcentual.test.ts` (R3, R5) en verde; las demás
  `planes-service*.test.ts` en verde con cambios solo de tipo.

## Tanda C — textos (backend_dev)

- [x] **T10. Textos** (design §4.4): `textoDelCostoPorOrdenPorcentual`, `textoDelCobroVigente`, las líneas
  de «Mi plan» porcentual. Depende de T6. `[P]` con T7–T9.
  *Hecho:* `tests/unit/planes/mensajes-costo-porcentual.test.ts` (R21, R22) en verde.

## Tanda D — pantallas (frontend_dev)

- [x] **T11. `PlanForm.tsx`** (design §6.1, R20). Depende de T6 y T10. `[P]`
  *Hecho:* `tests/components/PlanFormCostoPorcentual.test.tsx` en verde; `PlanFormCosteo.test.tsx` y
  `PlanForm.test.tsx` en verde.
- [x] **T12. `plan-vista.ts`** (catálogo, detalle, modal; design §6.2, R21). Depende de T10. `[P]`
  *Hecho:* `tests/components/PlanEmpresaCostoPorcentual.test.tsx` en verde.
- [ ] **T13. `CobroPorOrden.tsx` / `EmpresasModule.tsx`** (design §6.3, R22). Depende de T7 y T10. `[P]`
  *Hecho:* `tests/components/EmpresasModuleCobroPorcentual.test.tsx` en verde;
  `EmpresasModuleCobro.test.tsx` en verde.
- [ ] **T14. `ConsumoDelPlan.tsx`** («Mi plan» y detalle de empresa; design §6.4, R23, R26). Depende de T7 y
  T10. `[P]`
  *Hecho:* `tests/components/ConsumoDelPlanPorcentual.test.tsx` en verde; `ConsumoDelPlan.test.tsx` y
  `ConsumoDelPlanCosteo.test.tsx` en verde sin cambiar aserciones.

## Tanda E — E2E y cierre (los dos)

- [ ] **T15. E2E** `e2e/planes-costo-porcentual.spec.ts` (design §9.2, R28). Ajustar por tipo
  `e2e/_planes-fixture.ts`. Depende de T11–T14.
  *Hecho:* `pnpm exec playwright test e2e/planes-costo-porcentual.spec.ts` en verde; `planes-costeo.spec.ts`
  y `cobro-plataforma-sl40.spec.ts` en verde.
- [ ] **T16. Trazabilidad y cierre.** Mapa `R<n> → test` completo en `progress/impl_SLT-83.md`, con la lista
  de tests tocados por tipo (design §9.3) y las mutaciones de §9.4 medidas. `./init.sh` en verde. Depende
  de todas.
  *Hecho:* los 29 `R` con test; ninguna dependencia nueva (R29).

## Archivos esperados

Base de datos:

- `db/schema.prisma`
- `db/migrations/20261104150000_plan_costo_por_orden_porcentual/migration.sql`
- `db/migrations/20261104150000_plan_costo_por_orden_porcentual/down.sql`
- `db/migrations/20261104150100_cobro_plataforma_porcentual_orden/migration.sql`
- `db/migrations/20261104150100_cobro_plataforma_porcentual_orden/down.sql`
- `db/migrations/20261104150200_cobro_plataforma_porcentual_funciones/migration.sql`
- `db/migrations/20261104150200_cobro_plataforma_porcentual_funciones/down.sql`
- `lib/db/modelos-de-negocio.ts`

Dominio, repositorios y servicios:

- `lib/types/planes.ts`
- `lib/types/consumo-plan.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/planes/costeo.ts`
- `lib/planes/costo-concreto.ts`
- `lib/planes/consumo.ts`
- `lib/planes/rastro.ts`
- `lib/planes/mensajes.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/interfaces/repositories/IMiPlanRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/services/PlanesService.ts`
- `lib/actions/planes.ts`

Pantallas:

- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/plan-vista.ts`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `components/shared/ConsumoDelPlan.tsx`

Tests nuevos:

- `tests/unit/types/planes-schema-costo-porcentual.test.ts`
- `tests/unit/services/planes-service-costo-porcentual.test.ts`
- `tests/unit/planes/rastro-costo-porcentual.test.ts`
- `tests/unit/planes/costo-concreto-porcentual.test.ts`
- `tests/unit/planes/mensajes-costo-porcentual.test.ts`
- `tests/unit/planes/costeo-porcentual.test.ts`
- `tests/integration/db/plan-costo-porcentual-escritura.test.ts`
- `tests/integration/db/cobro-plataforma-porcentual.test.ts`
- `tests/integration/db/cobro-plataforma-porcentual-importe.test.ts`
- `tests/integration/db/cobro-plataforma-porcentual-aislamiento.test.ts`
- `tests/integration/db/cobro-porcentual-estados-finales.test.ts`
- `tests/integration/db/plan-de-la-empresa-porcentual.test.ts`
- `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts`
- `tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts`
- `tests/components/PlanFormCostoPorcentual.test.tsx`
- `tests/components/PlanEmpresaCostoPorcentual.test.tsx`
- `tests/components/EmpresasModuleCobroPorcentual.test.tsx`
- `tests/components/ConsumoDelPlanPorcentual.test.tsx`
- `e2e/planes-costo-porcentual.spec.ts`

Tests existentes que cambian solo por tipo (design §9.3):

- `tests/unit/planes/costeo.test.ts`
- `tests/unit/planes/rastro-costeo.test.ts`
- `tests/unit/types/planes-schema-costeo.test.ts`
- `tests/unit/services/planes-service.test.ts`
- `tests/unit/services/planes-service-costeo.test.ts`
- `tests/unit/services/planes-service-asignar-costo.test.ts`
- `tests/unit/services/planes-service-crear-custom.test.ts`
- `tests/unit/services/planes-service-inicio-ciclo.test.ts`
- `tests/unit/services/planes-service-lecturas.test.ts`
- `tests/unit/services/planes-service-tipo-cobro.test.ts`
- `tests/components/ConsumoDelPlan.test.tsx`
- `tests/components/ConsumoDelPlanCosteo.test.tsx`
- `tests/components/EmpresasModuleCobro.test.tsx`
- `tests/components/EmpresasModulePlan.test.tsx`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanFormCosteo.test.tsx`
- `tests/components/PlanFormCustomAsigna.test.tsx`
- `tests/integration/db/plan-de-la-empresa-costeo.test.ts`
- `tests/integration/db/_fixtures/planes.ts`
- `e2e/_planes-fixture.ts`

Estado de la feature:

- `progress/impl_SLT-83.md`
- `progress/features/SLT-83.md`
