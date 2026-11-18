# SLT-144 — planes-form-pasos-borrador · tasks.md

> Orden: T1 (servidor) va primero. T2 sale de él y T3 depende de T2. T4 y T5 dependen de T3. T6 y T7 van detrás de
> T4 y T5. T8 cierra. `[P]` = se puede hacer en paralelo con las otras `[P]` de la misma tanda.
> Capas (`docs/perfil-agentes.md > implementer`): T1 → `backend_dev`; de T2 a T6 → `frontend_dev`.

## T1 · Servidor: fecha de cada empresa, «N de M» y lector de borradores — backend_dev

- [x] **T1.1 [P]** `previsualizarCambioSchema`, `FechaDeEmpresa` y `VistaPreviaCambioResult` en `lib/types/planes.ts`.
  Añadir `vistaPreviaCambio(planId, topes)` a `IPlanesRepository` y su implementación en `PlanesRepository`, con
  `excedidosDe` y bajo `comoPlataforma("SL-24", …)` (design §3.1).
  *Hecho:* `pnpm run typecheck` verde, y el repositorio no escribe nada (revisión del diff: sin `create`, `update`,
  `delete` ni `jobs`).
- [x] **T1.2** Añadir `PlanesService.previsualizarCambio` y su firma en `IPlanesService`: quién → zod → repositorio →
  `fechaDeRecepcion` por empresa. Añadir `previsualizarCambioPlanAction` en `lib/actions/planes.ts`. Depende de T1.1.
  *Hecho:* `tests/unit/services/planes-previsualizar-cambio.test.ts` verde (R22, `recibeEl` con un ejemplo
  quincenal, uno mensual y F `null`).
- [x] **T1.3** Integración de la vista previa. Depende de T1.2.
  *Hecho:* `tests/integration/db/planes-previsualizar-cambio.test.ts` verde (R21: misma fecha que `recibe_at` y
  mismos avisos que el `ok` de programar con la misma F; foto sin cambios en `plan_cambio_programado`,
  `plan_cambio_recepcion` y `jobs`).
- [x] **T1.4 [P]** «N de M» por empresa en `PlanesRepository.detalle` / `pendienteDelDetalle` (design §3.2).
  *Hecho:* el caso nuevo de R23 en `tests/integration/db/planes-cambio-por-empresa.test.ts` está verde, y los casos
  de R11 de SLT-128 siguen verdes sin cambiar sus aserciones.
- [x] **T1.5 [P]** Añadir `verBorradoresDePlanes` en `lib/actions/_shared/planes-plataforma.ts` (design §3.3).
  *Hecho:* typecheck verde; se prueba con T5.3.

## T2 · Puro: del formulario al borrador — frontend_dev

- [x] **T2.1** Crear `plan-form/borrador.ts` con `valoresDelPaso`, `formDelBorrador`, `pasoInicial` y `fechaHora`
  (movida desde `PlanDetalle.tsx`, que pasa a importarla). En `estado.ts`, `IdPasoGuardable` y
  `PASOS_QUE_SE_GUARDAN`.
  *Hecho:* `tests/unit/planes/plan-form-borrador.test.ts` verde (R2: ida y vuelta por paso y por modo; `pasoInicial`).

## T3 · El formulario guarda por pasos — frontend_dev

- [x] **T3.1** `FormularioPorPasos`: `elegibles`, `guardados`, `sinGuardar`, el ✓ y «Sin guardar», con el nombre
  accesible (R5, R6).
  *Hecho:* `tests/components/FormularioPorPasos.test.tsx` verde, con los casos nuevos de R5 y R6 y los de SLT-130 R1–R4.
- [x] **T3.2** Crear `plan-form/usar-borrador.ts` y conectarlo en `PlanForm.tsx`: «Guardar y continuar», `enVuelo`
  único, confirmar, aviso del paso, estado y hora, `onBorradorGuardado`, y las nuevas props `borrador`,
  `borradorInicial` y `previsualizarCambio` (design §4.3, §4.4, §4.6, §4.7). Añadir los textos de §9 en `textos.ts`.
  Motivo «Faltan pasos por guardar» en `PasoRevisar.tsx`. Depende de T2.1 y T3.1.
  *Hecho:* `tests/components/PlanFormBorrador.test.tsx` verde en R1, R3–R12 y R16.
- [x] **T3.3** Crear `plan-form/AbrirPlanForm.tsx` (design §4.5). Depende de T3.2.
  *Hecho:* los casos R14 y R15 de `tests/components/PlanFormBorrador.test.tsx` están verdes.
- [x] **T3.4** Adaptar los tests de hoy con el helper (`accionesFalsas`, «Guardar y continuar»,
  `peticionConfirmada`) sin cambiar sus aserciones de carga útil (design §11). Depende de T3.2.
  *Hecho:* verdes `tests/components/PlanForm.test.tsx`, `PlanFormCosteo`, `PlanFormCostoPorcentual`,
  `PlanFormCustomAsigna`, `PlanFormPeriodicidad`, `PlanFormVistaPreviaCustom`, `PlanFormDescuentos`,
  `PlanFormPasos` y `PlanFormRevisar`. El diff de esos archivos no toca ninguna línea con `toHaveBeenCalledWith` de
  la petición.

## T4 · Fecha de cada empresa en el formulario — frontend_dev

- [x] **T4.1** Crear `plan-form/FechasPorEmpresa.tsx`. Poner en `PlanForm` el estado de la lectura (debounce y clave
  vigente). Montarlo en `PasoCuandoRige.tsx` (solo se añade debajo) y en `PasoRevisar.tsx` al editar (design §5).
  Depende de T1.2 y T3.2.
  *Hecho:* `tests/components/PlanFormFechasPorEmpresa.test.tsx` verde (R17–R20). `PasoCuandoRige.tsx` no cambia
  los controles de «Aplicar» ni de «Rige desde» (eso es de SLT-135 «Planes: sin «De inmediato» al editar un plan»).

## T5 · Lista de planes y detalle — frontend_dev

- [x] **T5.1 [P]** Crear `BorradoresDePlanes.tsx` y conectar `PlanesModule.tsx`: la sección, la marca, «Retomar»,
  «Descartar» y el aviso al cerrar. En `planes/page.tsx`, los borradores y las actions, y quitar `crearPlan`
  (design §6). Depende de T1.5 y T3.3.
  *Hecho:* `tests/components/PlanesModule.test.tsx` verde (R13, R24–R27, más los casos de hoy).
- [x] **T5.2 [P]** `PlanDetalle.tsx` y `[planId]/page.tsx`: `AbrirPlanForm` con `{ planId }`, `?editar=1`, las
  actions del borrador, `previsualizarCambioPlanAction` y el aviso al cerrar. Depende de T3.3 y T4.1.
  *Hecho:* `tests/components/PlanDetalle.test.tsx` verde (R13, R26, más los casos de hoy y el «N de M» de SLT-128 R11).
- [x] **T5.3** La página no lee borradores sin superadmin. Depende de T5.1.
  *Hecho:* `tests/integration/plataforma-planes-page.test.tsx` verde, con el caso de R28.
- [x] **T5.4** Quitar los cuatro `@sin-superficie` de `lib/actions/plan-borrador.ts`. Depende de T5.1 y T5.2.
  *Hecho:* `pnpm run test:guardias` verde (R29). 2026-11-18 (humano): crearPlanAction y editarPlanAction se borran; deja sin
  efecto SLT-129 R21 en ese punto.

## T6 · E2E — frontend_dev

- [x] **T6.1** Crear `e2e/planes-borrador.spec.ts` (R30) con los fixtures de `e2e/planes-superadmin.spec.ts`:
  superadmin con OTP, empresas con `crearEmpresaE2E` y un plan con dos empresas de tipos distintos. Esperar
  condiciones, nunca `waitForTimeout`. Depende de T5.
  *Hecho:* `pnpm exec playwright test e2e/planes-borrador.spec.ts` verde dos veces seguidas sobre la misma base
  desechable.
- [x] **T6.2 [P]** Adaptar `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts` y
  `e2e/planes-costo-porcentual.spec.ts` a «Guardar y continuar», con las mismas aserciones. Depende de T5.
  *Hecho:* los tres verdes en local. También `e2e/mi-plan-cambiar-plan.spec.ts` (sin cambios) y
  `e2e/dos-empresas-humo.spec.ts`, porque el diff toca `lib/repositories/`. Queda constancia en `progress/impl_SLT-144.md`.

## T7 · Revisión de textos y maqueta

- [x] **T7.1** Comparar con `specs/SLT-130-planes-form-pasos/maqueta/formulario-planes-c.html`: el estado «Borrador · n
  de m», «Guardar y continuar», el aviso de borrador y la tabla de «Cuándo rige». Comprobar que todos los textos de
  `design.md §9` están en `textos.ts` o en los `TEXTOS` de los hosts.
  *Hecho:* captura de crear y de editar en `progress/impl_SLT-144.md`, y ningún literal de §9 fuera de esos objetos.

## T8 · Cierre

- [ ] **T8.1** `./init.sh` verde. Mapa `R<n> → test` completo en `progress/impl_SLT-144.md` (R1–R30).
  *Hecho:* gate local verde, `gate-completo` en CI verde y el mapa sin huecos.

## Archivos esperados

Producción (23):
- `lib/actions/plan-borrador.ts`
- `lib/actions/planes.ts`
- `lib/actions/_shared/planes-plataforma.ts`
- `lib/types/planes.ts`
- `lib/services/PlanesService.ts`
- `lib/interfaces/services/IPlanesService.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `components/shared/FormularioPorPasos.tsx`
- `app/(app)/plataforma/planes/page.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/_components/BorradoresDePlanes.tsx`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/borrador.ts`
- `app/(app)/plataforma/planes/_components/plan-form/usar-borrador.ts`
- `app/(app)/plataforma/planes/_components/plan-form/AbrirPlanForm.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/FechasPorEmpresa.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoCuandoRige.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/estado.ts`
- `app/(app)/plataforma/planes/_components/plan-form/textos.ts`
- `app/(app)/plataforma/planes/[planId]/page.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`

Tests (24):
- `tests/unit/planes/plan-form-borrador.test.ts`
- `tests/unit/services/planes-previsualizar-cambio.test.ts`
- `tests/integration/db/planes-previsualizar-cambio.test.ts`
- `tests/integration/db/planes-cambio-por-empresa.test.ts`
- `tests/integration/plataforma-planes-page.test.tsx`
- `tests/components/PlanFormBorrador.test.tsx`
- `tests/components/PlanFormFechasPorEmpresa.test.tsx`
- `tests/components/FormularioPorPasos.test.tsx`
- `tests/components/PlanesModule.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `tests/components/plan-form-pasos.ts`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanFormCosteo.test.tsx`
- `tests/components/PlanFormCostoPorcentual.test.tsx`
- `tests/components/PlanFormCustomAsigna.test.tsx`
- `tests/components/PlanFormPeriodicidad.test.tsx`
- `tests/components/PlanFormVistaPreviaCustom.test.tsx`
- `tests/components/PlanFormDescuentos.test.tsx`
- `tests/components/PlanFormPasos.test.tsx`
- `tests/components/PlanFormRevisar.test.tsx`
- `e2e/planes-borrador.spec.ts`
- `e2e/planes-superadmin.spec.ts`
- `e2e/planes-costeo.spec.ts`
- `e2e/planes-costo-porcentual.spec.ts`

Total: 47 (tamaño aceptado por el humano el 2026-11-17, `tamano-pr-aceptado`).
