# SLT-126 — cobro-retirar-valor-empresa · tasks.md

> Escrito por `spec_author` el 2026-11-11. Diseño en `design.md`. Una sola ficha y un solo PR (P0,
> `tamano-pr-aceptado`). `[P]` = puede ir en paralelo con las otras `[P]` de su misma tanda.
> «Hecho» incluye siempre: `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde.

## Tanda 0 — Antes de nada (leader / humano, sin código)

- [ ] **T0 — D1 preparado.** El leader deja escrita en `progress/features/SLT-126.md > Deudas` la consulta
  de solo lectura de D1 y quién la corre en producción **antes** del deploy de T1.
  *Cubre:* D1 (sin `R<n>`). *Hecho:* la consulta y el responsable están escritos; el informe se adjunta
  antes del merge a `prod`.

## Tanda 1 — Base y servidor

- [ ] **T1 — Migración y Prisma.** `db/migrations/20261113120000_cobro_plataforma_sin_valor_empresa/`
  (`migration.sql` y `down.sql`, design §1.1–§1.2) y `db/schema.prisma` (§1.3). El nombre va detrás de la
  última migración del repo al implementar.
  *Cubre:* R5, R6, R7, R10, R12. *Depende de:* nada.
  *Hecho:* `pnpm exec prisma validate` y `prisma generate` en verde; el cuerpo de la función en `down.sql`
  es idéntico byte a byte al de 20261104150200; la migración aplica sobre una base desechable.
- [ ] **T2 — Tests de la migración y de la regla.** Nuevos
  `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` y
  `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts` (design §5.1).
  *Cubre y prueba:* R5 y R11 (`cobro-plataforma-sin-valor-empresa`); R6, R7, R8, R9, R10, R12
  (`migracion-slt126-ida-y-vuelta`). *Depende de:* T1.
  *Hecho:* los dos en verde; cada caso nombra su `R<n>`; con la rama de la excepción repuesta a mano en la
  función, R6/R7 caen (mutación anotada en `progress/impl_SLT-126.md`).
- [ ] **T3 [P] — Quitar la escritura del valor propio (servidor).** `lib/actions/cobro-plataforma.ts`,
  `ICobroPlataformaService`, `CobroPlataformaService`, `ICobroPlataformaTarifaRepository`,
  `CobroPlataformaTarifaRepository`, `lib/types/cobro-plataforma.ts` (design §2). Ajusta
  `tests/unit/services/cobro-plataforma-service.test.ts`, `tests/unit/types/cobro-plataforma-schema.test.ts`
  y `tests/unit/actions/cobro-plataforma.composition-root.test.ts` (nuevo caso: el módulo exporta solo las
  dos actions del global).
  *Cubre y prueba:* R2 (`cobro-plataforma.composition-root.test.ts` y `cobro-plataforma-service.test.ts`).
  *Depende de:* nada (puede ir a la vez que T1).
  *Hecho:* `grep -rn "fijarDeEmpresa\|fijarCobroEmpresa\|existeEmpresa" lib app` sin resultados.
- [ ] **T4 [P] — Lecturas sin la fuente `empresa`.** `lib/types/empresas-plataforma.ts`,
  `lib/repositories/EmpresasPlataformaRepository.ts`, `lib/types/consumo-plan.ts`,
  `lib/repositories/MiPlanRepository.ts`, `lib/planes/costeo.ts` (design §2). Ajusta
  `tests/unit/actions/empresas-plataforma.composition-root.test.ts`,
  `tests/unit/services/empresas-plataforma-service.test.ts`, `tests/unit/planes/costeo.test.ts`,
  `tests/unit/planes/costeo-porcentual.test.ts`.
  *Cubre:* R11 (servidor), R3 (datos). *Depende de:* T1 (para `prisma generate` sin la columna).
  *Hecho:* `grep -rn "cobroPorOrden\b\|cobroPlataformaPorOrden" lib` sin resultados; `FuenteDelCosto` sin
  `"empresa"`.

## Tanda 2 — Tests de base que sembraban o esperaban el valor propio

- [ ] **T5 — Ajustar los tests de integración** (design §5.2): `_fixtures/cobro-porcentual.ts` (fuera
  `fijarExcepcion`), `empresas-plataforma-cobro.test.ts` (se borra), `empresas-plataforma.test.ts`,
  `empresas-plataforma-plan.test.ts`, `empresas-plataforma-cobro-porcentual.test.ts`,
  `cobro-plataforma-plan.test.ts`, `cobro-plataforma-cargos.test.ts`, `cobro-plataforma-porcentual.test.ts`,
  `cobro-plataforma-traza.test.ts`, `plan-de-la-empresa-costeo.test.ts`, `deuda-plataforma-wallet.test.ts`,
  `deuda-plataforma-plan.test.ts`, `empresas-plataforma-deuda-sl45.test.ts`, `pago-plataforma-sl45.test.ts`,
  `pago-plataforma-sl45-blindaje.test.ts` (siembra con plan fijo de 300,00), `tope-intentos-escritura.test.ts`.
  *Cubre:* sin `R<n>` nuevo; mantiene en verde lo que probaban SL-40, SL-45, SLT-66, SLT-83, SLT-85 sin la
  excepción. `plan-de-la-empresa-costeo.test.ts` prueba además R11 (`plan_de_la_empresa` nunca devuelve
  `empresa`). *Depende de:* T1, T3, T4.
  *Hecho:* `grep -rln "cobro_plataforma_por_orden\|cobroPlataformaPorOrden\|fijarDeEmpresa\|fijarExcepcion" tests`
  solo devuelve tests de migraciones anteriores (los de «No se tocan» del design) y
  `migracion-slt126-ida-y-vuelta.test.ts`; los archivos de la lista en verde; los tres de «No se tocan»
  corridos y en verde.

## Tanda 3 — Pantallas

- [ ] **T6 — Plataforma > Empresas.** `CobroPorOrden.tsx`, `EmpresasModule.tsx`, `page.tsx` (design §3).
  Ajusta `tests/components/EmpresasModuleCobro.test.tsx` (nuevos casos R1, R3, R4),
  `EmpresasModuleCobroPorcentual.test.tsx`, `EmpresasModulePlan.test.tsx`, `EmpresasModulePeriodo.test.tsx`,
  `empresas-module.test.tsx`, `tests/integration/empresas-page.test.tsx`.
  *Cubre y prueba:* R1, R3, R4 (`tests/components/EmpresasModuleCobro.test.tsx`). *Depende de:* T3, T4.
  *Hecho:* en ninguna fila hay «Cambiar», «Usar el global» ni un campo; la fuente es «del plan» o
  «global»; la ayuda es el texto exacto de R4; `pnpm run test:guardias` en verde.
- [ ] **T7 [P] — «Mi plan» y detalle de empresa sin la nota de la excepción.** `ConsumoDelPlan.tsx`,
  `PlanEmpresa.tsx` (design §3). Ajusta `tests/components/ConsumoDelPlanCosteo.test.tsx` y
  `tests/components/PlanEmpresaSinCosto.test.tsx`.
  *Cubre y prueba:* R11 (pantallas) en `ConsumoDelPlanCosteo.test.tsx` y `PlanEmpresaSinCosto.test.tsx`.
  *Depende de:* T4.
  *Hecho:* `grep -rn "textoExcepcion\|precio acordado para tu empresa\|excepción de la empresa" app components`
  sin resultados.

## Tanda 4 — Demo y E2E

- [ ] **T8 — Demo de QA con plan custom.** `scripts/demo-qa/receta.ts` (design §4) y
  `tests/integration/db/demo-qa.test.ts`.
  *Cubre y prueba:* R13 (`demo-qa.test.ts`: plan custom asignado con `costo_por_orden = 100.00` y un cargo
  de 100,00 `plan` por orden). *Depende de:* T1, T3.
  *Hecho:* el test en verde; la demo corrida dos veces seguidas (la segunda borra la primera, SL-43 R28)
  sin errores; los módulos de la empresa demo son los mismos antes y después de asignar el plan.
- [ ] **T9 — E2E del cobro.** `e2e/cobro-plataforma-sl40.spec.ts` (design §5.2).
  *Cubre y prueba:* R1, R3, R4 en el navegador (T8 del spec). *Depende de:* T6.
  *Hecho:* en una base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en `.github/workflows/gate.yml`:
  `e2e/cobro-plataforma-sl40.spec.ts`, `e2e/planes-costo-porcentual.spec.ts`, los que salgan de
  `grep -rl "plataforma/empresas\|Cobro por orden\|cobro_plataforma" e2e` y
  `pnpm exec playwright test --project=dinero` en verde, sin reintentos.

## Tanda 5 — Cierre

- [ ] **T10 — Gate y trazabilidad.** `./init.sh` en verde; `progress/impl_SLT-126.md` con el mapa
  `R<n> → test` de abajo y las mutaciones de T2.
  *Cubre:* todos. *Depende de:* T1–T9.
  *Hecho:* el mapa completo; ningún `R<n>` sin test.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/components/EmpresasModuleCobro.test.tsx`; `e2e/cobro-plataforma-sl40.spec.ts` |
| R2 | `tests/unit/actions/cobro-plataforma.composition-root.test.ts`; `tests/unit/services/cobro-plataforma-service.test.ts` |
| R3 | `tests/components/EmpresasModuleCobro.test.tsx`; `e2e/cobro-plataforma-sl40.spec.ts` |
| R4 | `tests/components/EmpresasModuleCobro.test.tsx`; `e2e/cobro-plataforma-sl40.spec.ts` |
| R5 | `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts` |
| R6 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R7 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R8 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R9 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R10 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R11 | `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts`; `tests/integration/db/plan-de-la-empresa-costeo.test.ts`; `tests/components/ConsumoDelPlanCosteo.test.tsx`; `tests/components/PlanEmpresaSinCosto.test.tsx` |
| R12 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R13 | `tests/integration/db/demo-qa.test.ts` |

## Estimación del diff

~55 archivos; **~1 500–1 800 líneas** (añadidas + borradas), por encima del tope de 1 000 que aceptó el
humano (P0). Reparto aproximado: producción ~350 (migración y `down.sql` ~90, `CobroPorOrden.tsx` −110, el
resto pequeño); tests borrados o recortados ~800 (editor de la celda, servicio, `empresas-plataforma-cobro`,
casos de la excepción en los tests de base, paso del E2E); tests nuevos ~450 (ida y vuelta ~250, regla
~150, casos de componente ~50).

## Archivos esperados

Producción:
- `db/migrations/20261113120000_cobro_plataforma_sin_valor_empresa/migration.sql`
- `db/migrations/20261113120000_cobro_plataforma_sin_valor_empresa/down.sql`
- `db/schema.prisma`
- `lib/actions/cobro-plataforma.ts`
- `lib/services/CobroPlataformaService.ts`
- `lib/interfaces/services/ICobroPlataformaService.ts`
- `lib/repositories/CobroPlataformaTarifaRepository.ts`
- `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts`
- `lib/types/cobro-plataforma.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/types/consumo-plan.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/planes/costeo.ts`
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `components/shared/ConsumoDelPlan.tsx`
- `scripts/demo-qa/receta.ts`

Tests:
- `tests/unit/services/cobro-plataforma-service.test.ts`
- `tests/unit/actions/cobro-plataforma.composition-root.test.ts`
- `tests/unit/types/cobro-plataforma-schema.test.ts`
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts`
- `tests/unit/services/empresas-plataforma-service.test.ts`
- `tests/unit/planes/costeo.test.ts`
- `tests/unit/planes/costeo-porcentual.test.ts`
- `tests/components/EmpresasModuleCobro.test.tsx`
- `tests/components/EmpresasModuleCobroPorcentual.test.tsx`
- `tests/components/EmpresasModulePlan.test.tsx`
- `tests/components/EmpresasModulePeriodo.test.tsx`
- `tests/components/empresas-module.test.tsx`
- `tests/components/ConsumoDelPlanCosteo.test.tsx`
- `tests/components/PlanEmpresaSinCosto.test.tsx`
- `tests/integration/empresas-page.test.tsx`
- `tests/integration/db/empresas-plataforma-cobro.test.ts`
- `tests/integration/db/empresas-plataforma-plan.test.ts`
- `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts`
- `tests/integration/db/empresas-plataforma.test.ts`
- `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`
- `tests/integration/db/cobro-plataforma-plan.test.ts`
- `tests/integration/db/cobro-plataforma-cargos.test.ts`
- `tests/integration/db/cobro-plataforma-porcentual.test.ts`
- `tests/integration/db/cobro-plataforma-traza.test.ts`
- `tests/integration/db/_fixtures/cobro-porcentual.ts`
- `tests/integration/db/plan-de-la-empresa-costeo.test.ts`
- `tests/integration/db/deuda-plataforma-wallet.test.ts`
- `tests/integration/db/deuda-plataforma-plan.test.ts`
- `tests/integration/db/pago-plataforma-sl45.test.ts`
- `tests/integration/db/pago-plataforma-sl45-blindaje.test.ts`
- `tests/integration/db/tope-intentos-escritura.test.ts`
- `tests/integration/db/demo-qa.test.ts`
- `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts`
- `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts`
- `e2e/cobro-plataforma-sl40.spec.ts`
