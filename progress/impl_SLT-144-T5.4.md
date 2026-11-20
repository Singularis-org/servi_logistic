# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T5.4 (R29)

Decisión humana 2026-11-18: se borran `crearPlanAction` y `editarPlanAction`. `PlanesService.crear/editar` y
`IPlanesService` no se tocan (los usa `PlanBorradorService.confirmar`).

## Archivos tocados
- `lib/actions/planes.ts`: borradas `crearPlanAction` y `editarPlanAction` con sus JSDoc. `PlanResult` sigue en
  uso (archivar, asignar, cancelarCambioPlan): sin imports huérfanos. Cabecera: una frase que dice que crear y editar
  van por `lib/actions/plan-borrador.ts`.
- `tests/unit/actions/planes.composition-root.test.ts`: borrados los `it` «crearPlanAction, sin deps.service…» y
  «editarPlanAction acepta vigenteDesde…»; el de forbidden pasa de seis a cuatro actions (`Array(4)`, título «las
  cuatro actions»). Cabecera ajustada. Los mocks del cliente falso siguen usados por otros `it` (lint verde).
- `tests/integration/plataforma-planes-page.test.tsx`: fuera `crearPlanAction`/`editarPlanAction` del mock.
- Solo comentarios: `app/(app)/plataforma/planes/[planId]/page.tsx`, `[planId]/_components/PlanDetalle.tsx`,
  `lib/types/plan-borrador.ts`, `tests/components/plan-form-pasos.ts`, `tests/unit/types/plan-borrador-schema.test.ts`.

Tras el cambio, `grep crearPlanAction|editarPlanAction` en `app/ lib/ tests/` no da nada. No apareció ningún uso
fuera de tests propios; la guardia no marcó nada del servicio.

## Salida real
- `pnpm run typecheck` → `tsc --noEmit`, exit 0.
- `pnpm exec eslint` (los 8 archivos tocados) → exit 0, sin salida.
- `vitest run superficie-de-uso.guardia + planes.composition-root + plan-borrador-schema` →
  `Test Files 3 passed (3)` · `Tests 67 passed (67)`.
- `vitest run tests/integration/plataforma-planes-page.test.tsx --no-file-parallelism` (DATABASE_URL →
  `servi_logistic_slt144`) → `Test Files 1 passed (1)` · `Tests 28 passed (28)`. (Un primer intento dio
  `Errors 1 error` sin tests a los 60 s; el reintento idéntico pasó: arranque, no el cambio.)
- `pnpm run test:guardias` → `Test Files 1 failed | 352 passed | 3 skipped (356)` · `Tests 4 failed | 5266 passed |
  25 skipped (5295)`. El único rojo: `dependencias-declaradas-presentes.guardia.test.ts` (en `tests/baseline-rojos.json`).
  `superficie-de-uso` en verde (R29).

Veredicto: R29 verde; crear/editar sin action propia, servicio intacto, solo queda el rojo de baseline.
