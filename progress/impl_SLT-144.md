# impl SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa»

Bitácora consolidada del implementer. Detalle y salida completa por tanda en `progress/impl_SLT-144-T1.md`,
`-T2.1-T3.1.md`, `-T3.2-T3.3.md`, `-T3.4.md`, `-T4.md`, `-T5.1.md`, `-T5.2.md`, `-T5.3-T5.4.md` y `-T6.md`.

**Estado (2026-11-18): T1–T8 hechas.** R29 resuelta por decisión humana (opción B: se borran `crearPlanAction` y `editarPlanAction`). La shell volvió a
funcionar tras matar los indexadores; se retomó y se verificó todo lo que estaba sin commit.

PR: https://github.com/Singularis-org/servi_logistic/pull/209 (listo, no draft).
Base de integración: `servi_logistic_slt144`. Base E2E: `servi_logistic_slt144_e2e`, recreada el 2026-11-18
(DROP/CREATE, migrate deploy, db:seed) tras el merge de origin/dev.

## Commits (publicados)
- `3e363d83` T1 (vista previa del cambio, «N de M», lector de borradores), T2.1 (`plan-form/borrador.ts`), T3.1.
- `8136eb6f` T3.2 y T3.3 (`usar-borrador.ts`, `AbrirPlanForm.tsx`, «Guardar y continuar»).
- `4b50e8e9` T3.4 (tests de hoy adaptados), T4.1 (`FechasPorEmpresa.tsx`), T5.1 (`BorradoresDePlanes.tsx`, lista).
- `c670d9c6` T5.2 (detalle con `AbrirPlanForm`, `?editar=1`, `previsualizarCambioPlanAction`).
- `df4569bb` T5.3 (R28 en `plataforma-planes-page`) y T5.4 (fuera los `@sin-superficie` de `plan-borrador.ts`).
- `0446e7f4` merge de origin/dev (`0711fe33`): trae `ade528fa`, que arregla el rojo de
  `migracion-plan-borrador-ida-y-vuelta` (la migración `factura_plataforma_aviso_enums` tiene el mismo timestamp).
- `0a1a8f86` T6.1 (`e2e/planes-borrador.spec.ts`, R30) y T6.2 («Guardar y continuar» en los E2E de planes).
- `4362e2cc` T7.1 (capturas, ver abajo). `bc22ea49` bitácora de T8.
- `eaa798e6` T5.4: borra `crearPlanAction` y `editarPlanAction` y sus tests (decisión humana R29; detalle en `impl_SLT-144-T5.4.md`).

## Archivos tocados (todos)
Producción: `lib/types/planes.ts`, `lib/interfaces/repositories/IPlanesRepository.ts`, `lib/repositories/PlanesRepository.ts`,
`lib/interfaces/services/IPlanesService.ts`, `lib/services/PlanesService.ts`, `lib/actions/planes.ts`,
`lib/actions/_shared/planes-plataforma.ts`, `lib/actions/plan-borrador.ts`, `components/shared/FormularioPorPasos.tsx`,
`app/(app)/plataforma/planes/page.tsx`, `_components/PlanesModule.tsx`, `_components/BorradoresDePlanes.tsx`,
`_components/PlanForm.tsx`, `plan-form/{borrador.ts, usar-borrador.ts, AbrirPlanForm.tsx, FechasPorEmpresa.tsx,
PasoCuandoRige.tsx, PasoRevisar.tsx, estado.ts, textos.ts}`, `[planId]/page.tsx`, `[planId]/_components/PlanDetalle.tsx`.
Config: `playwright.config.ts`.
E2E: `e2e/planes-borrador.spec.ts` (con capturas opcionales por `SLT144_CAPTURAS`), `planes-superadmin`, `planes-costeo`,
`planes-costo-porcentual`. Capturas: `progress/capturas/SLT-144/`.
Tests: los 24 de «Archivos esperados» más, fuera de la lista, solo montaje o dobles (sin cambiar aserciones):
9 `tests/unit/services/planes-service*.test.ts` (doble `vistaPreviaCambio`), `tests/components/PlanVistaCosteo.test.tsx`,
`PlanEmpresaCostoPorcentual.test.tsx`, `PlanDetalleAsignar.test.tsx`, `PlanDetalleDesasignado.test.tsx`.

## Mapa R → test
| R | Test |
|---|---|
| R1 | `tests/components/PlanFormBorrador.test.tsx` «R1: crear guarda General sin borrador y el resto con su id», «R1: editar guarda cada paso con el plan», «R1: un paso con error no llama a guardar» |
| R2 | `tests/unit/planes/plan-form-borrador.test.ts` «R2: cada paso, ida y vuelta, al crear y al editar» (+4 casos R2) |
| R3 | `PlanFormBorrador.test.tsx` «R3: validation_error de un tope se pinta en Topes», «R3: archivado…», «R3: un fallo de red no avanza» |
| R4 | `PlanFormBorrador.test.tsx` «R4: con un guardado en vuelo no se puede confirmar ni guardar otra vez»; `FormularioPorPasos.test.tsx` «R4: deshabilitado apaga toda la lista…» |
| R5 | `FormularioPorPasos.test.tsx` «R5: solo se elige un paso guardado o el que sigue…»; `PlanFormBorrador.test.tsx` «R5: no se salta a Topes sin guardar Cobro por orden» |
| R6 | `FormularioPorPasos.test.tsx` «R6: ✓ con su nombre accesible», «R6: un paso guardado que cambió…»; `PlanFormBorrador.test.tsx` «R6: tocar un paso guardado lo deja Sin guardar» |
| R7 | `PlanFormBorrador.test.tsx` «R7: estado y hora tras guardar General» |
| R8 | `PlanFormBorrador.test.tsx` «R8: con Topes sin guardar no se confirma…», «R8: confirmar llama una vez con el borrador y entrega el ok» |
| R9 | `PlanFormBorrador.test.tsx` «R9: pasos_pendientes…», «R9: una fecha pasada al programar…», «R9: borrador_no_encontrado» |
| R10 | `PlanFormBorrador.test.tsx` «R10: un id nuevo al guardar avisa y deja solo ese paso guardado» |
| R11 | `PlanFormBorrador.test.tsx` «R11: crear con el borrador borrado no guarda en otro» |
| R12 | `PlanFormBorrador.test.tsx` «R12: pasos ajenos se cargan y se avisa» |
| R13 | `PlanesModule.test.tsx` «R13: cerrar con un paso guardado avisa»; `PlanDetalle.test.tsx` «R13: cerrar la edición con un paso guardado avisa», «R13: tras confirmar no avisa…» |
| R14 | `PlanFormBorrador.test.tsx` «R14: cargando, error con Reintentar y plan sin borrador», «R14: retomar una creación que ya no existe ofrece Cerrar» |
| R15 | `PlanFormBorrador.test.tsx` «R15: editar retoma el borrador de otro superadmin…», «R15: retomar una creación en Topes»; `plan-form-borrador.test.ts` «R15: el primer paso sin guardar…» |
| R16 | `PlanFormBorrador.test.tsx` «R16: descartar y empezar de nuevo» (+2) |
| R17 | `PlanFormFechasPorEmpresa.test.tsx` «R17: una fila por empresa con su fecha», «R17: De inmediato no muestra la tabla», «R17: los pasos de antes no piden la fecha» |
| R18 | `PlanFormFechasPorEmpresa.test.tsx` «R18: aviso por empresa y el botón final sigue habilitado» |
| R19 | `PlanFormFechasPorEmpresa.test.tsx` «R19: plan sin empresas» |
| R20 | `PlanFormFechasPorEmpresa.test.tsx` «R20: cargando», «R20: error con Reintentar», «R20: una respuesta vieja no se pinta» |
| R21 | `tests/integration/db/planes-previsualizar-cambio.test.ts` «R21: misma fecha y mismos avisos que programar», «R21: leer no escribe», «R21: un plan que no existe…» |
| R22 | `tests/unit/services/planes-previsualizar-cambio.test.ts` «R22: forbidden por rol…» (+3) y `recibeEl` quincenal/mensual/null |
| R23 | `tests/integration/db/planes-cambio-por-empresa.test.ts` «R23 (SLT-144): la empresa que entra en F cuenta en N y en M» |
| R24 | `PlanesModule.test.tsx` «R24: un borrador de creación y uno de cambio», «R24: sin borradores no hay sección», «R24: error de lectura con el catálogo» |
| R25 | `PlanesModule.test.tsx` «R25: la marca solo en el plan con borrador» |
| R26 | `PlanesModule.test.tsx` «R26: retomar una creación abre el panel con su id»; `PlanDetalle.test.tsx` «R26: con editar en la dirección abre el formulario» (+2) |
| R27 | `PlanesModule.test.tsx` «R27: descartar con confirmación», «R27: ya no existe», «R27: un fallo deja la fila» |
| R28 | `tests/integration/plataforma-planes-page.test.tsx` «R28: %s → notFound() en «Planes» y en el detalle, sin leer borradores», «R28: sin sesión…», «R28: el superadmin sí los lee…» |
| R29 | `tests/unit/guards/superficie-de-uso.guardia.test.ts` (R-A y «caducadas») — verde, 18/18, tras borrar `crearPlanAction` y `editarPlanAction` (T5.4) |
| R30 | `e2e/planes-borrador.spec.ts` (2 casos) — verde, dos corridas |

## Salida real (resumen; completa en cada bitácora)
- T1: typecheck 0 errores; `planes-service*` 9 archivos / 404 passed; integración (`servi_logistic_slt144`,
  `--no-file-parallelism`) cambio-por-empresa + cambio-programado + previsualizar-cambio: 3 archivos / 33 passed.
- T2.1+T3.1: 2 archivos / 18 passed; `vitest related` 25 archivos / 380 passed.
- T3.2+T3.3: PlanFormBorrador + FormularioPorPasos + plan-form-borrador: 3 archivos / 44 passed.
- T3.4: los 9 PlanForm*: 9 archivos / 113 passed; `git diff -U0 … | grep toHaveBeenCalledWith` sin salida.
- T4.1: PlanFormFechasPorEmpresa + PlanFormBorrador: 2 archivos / 33 passed; `PasoCuandoRige.tsx` 20 insertions, 0 deletions.
- T5.1: PlanesModule 21/21. T5.2: PlanDetalle 34/34, otros 4 de PlanDetalle 27 passed; typecheck 0 errores.
- T5.3: plataforma-planes-page 28/28. `test:guardias`: 7 rojos en 4 archivos: `dependencias-declaradas-presentes`
  (baseline), `superficie-de-uso` R-A (no baseline), `descargas-por-registro` y `sin-estados-retirados` (no baseline;
  probable timeout por la máquina saturada, sin re-medir).

- 2026-11-18 (implementer): `superficie-de-uso` R-A sigue roja con exactamente
  `lib/actions/planes.ts:47 crearPlanAction` y `lib/actions/planes.ts:56 editarPlanAction` (17 passed, 1 failed).
  `descargas-por-registro` + `sin-estados-retirados`: 2 files / 15 passed (eran timeout por saturación).
  `migracion-plan-borrador-ida-y-vuelta` + `plataforma-planes-page` (`servi_logistic_slt144`, `--no-file-parallelism`):
  2 files / 33 passed.
- T6: typecheck exit 0, eslint de los E2E exit 0; Playwright `aislamiento` + `dinero` (planes-borrador, planes-superadmin,
  planes-costeo, planes-costo-porcentual, mi-plan-cambiar-plan, dos-empresas-humo y `plataforma-vacia`):
  corrida 1 `40 passed (3.2m)`, corrida 2 `40 passed (3.8m)`, 0 failed/skipped/flaky. Detalle en `impl_SLT-144-T6.md`.
- T7.1: tercera corrida de `planes-borrador` con `SLT144_CAPTURAS`: `12 passed (1.1m)`.

## T7.1 · Maqueta y textos
Capturas: `progress/capturas/SLT-144/crear-retomado-topes.png` (crear retomado en «Topes», «Borrador · 3 de 5 pasos
guardados», tres ✓, aviso de borrador, «Guardar y continuar») y `editar-cuando-rige.png` (editar, «Cuándo rige» con
«A partir de» y la tabla Empresa / Período / Recibe el cambio el con M Mensual y N Anual).
Frente a `specs/SLT-130-planes-form-pasos/maqueta/formulario-planes-c.html`: igual el estado «Borrador · n de m pasos
guardados», «Guardar y continuar», el aviso «Borrador: se guarda al continuar…». Dos diferencias, ambas fijadas por
design §9 (aprobado): «Borrador guardado el f» (maqueta: «a las HH») y la cabecera «Recibe el cambio el» (maqueta:
«Rige desde»). La maqueta no tiene «De inmediato»; aquí sí (no es de esta ficha: SLT-135).
Textos de §9: todos en `plan-form/textos.ts`, salvo `pasoGuardado`/`marcaSinGuardar` en `TEXTOS_FORMULARIO_POR_PASOS`
(`components/shared/FormularioPorPasos.tsx`) y los de hosts en los `TEXTOS` de `BorradoresDePlanes.tsx`,
`PlanesModule.tsx` y `PlanDetalle.tsx`. Las demás apariciones de esos literales en el código son comentarios.

## Decisiones fuera del spec (implementer)
- Dobles de 9 tests de `PlanesService` con `vistaPreviaCambio` (consecuencia de T1.1).
- Caso R17 de SLT-128 en `planes-cambio-por-empresa.test.ts`: `{1,2}` → `{2,3}`, porque R23 cuenta a C a propósito.
- T3.4: `PlanForm.test.tsx` «“Crear plan” se deshabilita…» termina en `toBeDisabled()` (design §4.4: tras el `ok` el
  formulario queda en vuelo hasta desmontarse); `PlanFormPeriodicidad` R35 partido en dos montajes con los mismos valores.
- `PlanDetalle.test.tsx` «R18: validation_error»: «sin aviso de éxito» se mira fuera del panel (el panel ya tiene su `role="status"` de R7).
- El resto de decisiones de cada subagente está en su bitácora.

## T8.1 · Gate
- Decisión humana 2026-11-18 (R29, opción B): se borran `crearPlanAction` y `editarPlanAction`; deja sin efecto SLT-129
  R21 en ese punto (anotado en design §4 y en el «Hecho» de T5.4). `PlanesService.crear/editar` se quedan: los usa
  `PlanBorradorService.confirmar`.
- `./init.sh` con una copia temporal de `arnes.config.json` (`fullstack: 8`, exceso aceptado por la geo en pausa; sin
  commitear, restaurada con `git checkout`):
  - intento 1: 5 guardias rojas por timeout (hook 60 s / test 20 s) bajo carga; las 5 solas: 5 files / 112 passed;
  - intento 2: solo `filtros-url-r25` (timeout del `beforeAll` que arranca ESLint);
  - intento 3: `== init OK ==` (exit 0).
- Sin procesos de vitest/tsc/next/playwright vivos al terminar.

## Pendiente
- `gate-completo` en CI sobre el push de este commit.
