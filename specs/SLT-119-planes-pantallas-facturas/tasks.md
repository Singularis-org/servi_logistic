# SLT-119 — planes-pantallas-facturas · tasks.md

> Requisitos R1–R19 (`requirements.md`); diseño en `design.md` («§N»). Parte de `dev` con SLT-118 «Planes: factura
> por empresa y período con la cuota y las órdenes» y SLT-99 «Planes: el administrador de la empresa ve su plan y los
> públicos y cambia de plan» mergeadas. **No empezar hasta que el humano cierre P1–P5**: si elige otra opción que la
> recomendada, el spec se reescribe antes (P1 (b) y P4 (b) cambian archivos esperados).
>
> Capas: `backend_dev` T1–T3; `frontend_dev` T4–T6; T7 el implementer. `[P]` = paralelizable con la anterior.

## T1 — Tipos y repositorio (backend)

- [ ] **T1.1** Tipos de §3 en `lib/types/factura-plataforma.ts` (línea, página, detalle, resultados, esquemas zod,
  `LINEAS_POR_PAGINA = 100`). *Hecho:* `pnpm run typecheck` verde.
- [ ] **T1.2** (dep. T1.1) `detalleDeLaEmpresa` y `detalleParaPlataforma` en `IFacturaPlataformaRepository` y
  `FacturaPlataformaRepository` (§2): cabecera desde `deLaEmpresa()`, líneas por `cobradoAt` en `[desde, hasta)`
  ordenadas por `(cobradoAt, id)`, `count` en la misma transacción, `null` si no está. Ninguna escritura.
  *Hecho:* typecheck y lint verdes; la guardia `cobro-plataforma-solo-por-trigger` verde.
- [ ] **T1.3** (dep. T1.2) `tests/integration/db/factura-plataforma-detalle.test.ts` (R7, R8, R10, R11, R12, R14),
  escrito antes de dar T1.2 por bueno. *Hecho:* verde en base local desechable; cada `it` nombra su `R<n>`.

## T2 — Servicio (backend)

- [ ] **T2.1** (dep. T1.1) [P] `lib/interfaces/services/IFacturaPlataformaService.ts` y
  `lib/services/FacturaPlataformaService.ts` (§4): actor → esquema → repositorio; lista de la más reciente a la más
  antigua. *Hecho:* typecheck verde.
- [ ] **T2.2** (dep. T2.1) `tests/unit/services/factura-plataforma-service.test.ts` (R1 orden, R13, R14, R15) con un
  repositorio doble que falla si se le llama en `forbidden` o `validation_error`. *Hecho:* verde.

## T3 — Bordes (backend)

- [ ] **T3.1** (dep. T2.1) `lib/actions/_shared/facturas-plataforma.ts` (composition root, `verFacturasDeMiPlan`,
  `verFacturasDeEmpresa`) y `lib/actions/facturas-plataforma.ts` (`verDetalleFacturaMiPlanAction`,
  `verDetalleFacturaEmpresaAction(organizacionId, input)`, con `deps`). `"facturas-plataforma": "nucleo"` en
  `lib/modulos/reparto.ts`. *Hecho:* `pnpm run test:guardias` verde (reparto, mi-plan-solo-maestro).
- [ ] **T3.2** (dep. T3.1) `tests/unit/actions/facturas-plataforma.test.ts` (R13: actor de la sesión y empresa
  ligada). *Hecho:* verde.

## T4 — Vista pura (frontend)

- [ ] **T4.1** (dep. T1.1) [P] `components/shared/facturas/facturas-vista.ts` (§6.1: número, período, estado, suma de
  cuotas, instante, textos) y `tests/unit/planes/facturas-vista.test.ts` (R2, R3, R4). *Hecho:* verde; ningún import
  de `lib/actions`, `lib/services`, `lib/repositories` ni `lib/db`.

## T5 — Componentes (frontend)

- [ ] **T5.1** (dep. T4.1) `components/shared/facturas/FacturasDeLaEmpresa.tsx` y
  `tests/components/FacturasDeLaEmpresa.test.tsx` (R1, R2, R5, R16, R17, R18). *Hecho:* verde.
- [ ] **T5.2** (dep. T4.1) [P] `components/shared/facturas/DetalleDeFactura.tsx` (en `Sheet`) y
  `tests/components/DetalleDeFactura.test.tsx` (R2, R6, R7, R9, R10, R16, R17). *Hecho:* verde.

## T6 — Pantallas (frontend)

- [ ] **T6.1** (dep. T3.1, T5.1, T5.2) «Mi plan»: `app/(app)/mi-plan/page.tsx` (lectura aislada) y
  `app/(app)/mi-plan/_components/MiPlanModule.tsx` (sección al final). Ajustar
  `tests/components/MiPlanModule.test.tsx` y ampliar `tests/integration/mi-plan-page.test.tsx` (R1, R17).
  *Hecho:* verdes; la guardia `mi-plan-solo-maestro` verde (ningún archivo nuevo nombra la ruta).
- [ ] **T6.2** (dep. T3.1, T5.1, T5.2) [P] Detalle de empresa: `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
  (lectura aislada, action ligada a la empresa) y `tests/integration/plataforma-empresa-detalle-page.test.tsx` (R12,
  R17). *Hecho:* verde.

## T7 — E2E, docs y cierre

- [ ] **T7.1** (dep. T6.1, T6.2) `e2e/facturas-plataforma.spec.ts` (R19, design §9) y su entrada en el proyecto
  `dinero` de `playwright.config.ts`. *Hecho:* `pnpm exec playwright test e2e/facturas-plataforma.spec.ts` verde en
  base desechable, sin reintentos; `pnpm exec playwright test --project=dinero` verde antes del PR
  (`docs/perfil-agentes.md`); la guardia `e2e-sin-saltos` verde.
- [ ] **T7.2** [P] `docs/architecture.md > Facturas de la plataforma > Lectura`: quitar «aún no existe», decir dónde
  se pintan (sección de «Mi plan» y del detalle de empresa), las líneas desde la traza y el número «N.º». *Hecho:*
  el texto describe el código.
- [ ] **T7.3** (dep. todo) Mapa `R<n> -> test` en `progress/impl_SLT-119.md`, sin huecos (R1–R19). `./init.sh` verde.
  *Hecho:* cada R con al menos un test que existe y pasa.

## Archivos esperados

- `lib/types/factura-plataforma.ts`
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`
- `lib/repositories/FacturaPlataformaRepository.ts`
- `lib/interfaces/services/IFacturaPlataformaService.ts`
- `lib/services/FacturaPlataformaService.ts`
- `lib/actions/_shared/facturas-plataforma.ts`
- `lib/actions/facturas-plataforma.ts`
- `lib/modulos/reparto.ts`
- `components/shared/facturas/facturas-vista.ts`
- `components/shared/facturas/FacturasDeLaEmpresa.tsx`
- `components/shared/facturas/DetalleDeFactura.tsx`
- `app/(app)/mi-plan/page.tsx`
- `app/(app)/mi-plan/_components/MiPlanModule.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `docs/architecture.md`
- `tests/integration/db/factura-plataforma-detalle.test.ts`
- `tests/unit/services/factura-plataforma-service.test.ts`
- `tests/unit/actions/facturas-plataforma.test.ts`
- `tests/unit/planes/facturas-vista.test.ts`
- `tests/components/FacturasDeLaEmpresa.test.tsx`
- `tests/components/DetalleDeFactura.test.tsx`
- `tests/components/MiPlanModule.test.tsx`
- `tests/integration/mi-plan-page.test.tsx`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `e2e/facturas-plataforma.spec.ts`
- `playwright.config.ts`
- `progress/impl_SLT-119.md`

27 rutas, por debajo del 80% de `gate.tamano_pr` (32 de 40).
