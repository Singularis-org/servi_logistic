# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T5.3 y T5.4 (backend_dev)

## Archivos
- `tests/integration/plataforma-planes-page.test.tsx` (T5.3): dobles nuevos para `verBorradoresDePlanes`, las cuatro
  actions de `lib/actions/plan-borrador.ts`, `PlanBorradorService` (constructor espía) y `previsualizarCambioPlanAction`
  en el mock de `lib/actions/planes`. Sin ellos, 5 casos del superadmin de SLT-58 estaban rojos (la página llamaba a un
  `verBorradoresDePlanes` indefinido y el detalle a un export ausente del mock). Bloque nuevo «SLT-144 R28»: 6 roles de
  empresa y sin sesión → `notFound()` en «Planes» y en el detalle sin leer ningún borrador; y el superadmin sí los lee
  con su actor. Sin cambios en las páginas.
- `lib/actions/plan-borrador.ts` (T5.4): fuera las cuatro líneas `@sin-superficie` (4 deletions).
- `specs/SLT-144-planes-form-pasos-borrador/tasks.md`: T5.3 en [x]. T5.4 queda en [ ] (ver abajo).

## R → test
- R28 → `tests/integration/plataforma-planes-page.test.tsx` — «R28: %s → notFound() en «Planes» y en el detalle, sin
  leer borradores» (6 roles), «R28: sin sesión → …», «R28: el superadmin sí los lee, con su actor».
- R29 → `tests/unit/guards/superficie-de-uso.guardia.test.ts` (R-A y «caducadas»). La de caducadas pasa sin las
  anotaciones (las cuatro actions tienen superficie). R-A está ROJA, ver abajo.

## Salida
- `pnpm exec vitest run tests/integration/plataforma-planes-page.test.tsx`: 1 file, 28 passed (antes 15 passed / 5 failed).
- `pnpm run typecheck`: exit 0.
- `pnpm exec eslint lib/actions/plan-borrador.ts tests/integration/plataforma-planes-page.test.tsx`: «No issues found», exit 0.
- `pnpm run test:guardias`: 4 files failed | 349 passed | 3 skipped; 7 tests failed | 5257 passed.
  - `dependencias-declaradas-presentes` (4 casos): en `tests/baseline-rojos.json`.
  - `superficie-de-uso` > R-A «ninguna Server Action … es inalcanzable sin su anotación» (47 ms): NO está en el baseline.
  - `descargas-por-registro` (26,7 s) y `sin-estados-retirados` (28,9 s): NO están en el baseline; por la duración,
    probable timeout por saturación (E2E/next build en paralelo). Sin re-medir.

## Bloqueo
R-A no puede ponerse roja por quitar anotaciones de actions que sí tienen superficie: la causa es otra action que se
quedó sin importador. La lista exacta no se pudo leer: la salida del run va filtrada y, al relanzar la guardia sola, la
máquina se quedó sin recursos (fork falla, workers de vitest mueren, y después el shell y ripgrep dejan de responder).
Hipótesis sin confirmar: `crearPlanAction` (`page.tsx` dejó de importarla en T5.1) y `editarPlanAction` (el detalle ya no
la baja, T5.2). Si es así, es el caso de «para y dímelo»: no se anotaron ni se borraron.

Veredicto: T5.3 hecha y verde; T5.4 aplicada pero bloqueada por R-A de superficie-de-uso, falta la lista exacta.
