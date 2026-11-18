# SLT-135 — planes-sin-de-inmediato · tasks.md

> Tareas de SLT-135 «Planes: sin «De inmediato» al editar un plan». Requisitos en `requirements.md` (R1–R23),
> diseño en `design.md` («§N»). `[P]` = se puede hacer en paralelo con las demás `[P]` de su bloque. Cada tanda
> cierra con `./init.sh` en verde. Rama apilada sobre SLT-144 «Planes: formulario por pasos conectado al borrador
> y a la fecha de cada empresa»: si SLT-144 cambia, se rebasa antes de seguir.

## T1 · Contrato — backend_dev

- [x] **T1.1** `lib/types/planes.ts` (§1):
  - `editarPlanSchema.vigenteDesde` obligatoria; ausente o `null` lleva `FECHA_DE_EFECTO_OBLIGATORIA`, que se
    mueve aquí;
  - `previsualizarCambioSchema.vigenteDesde` sin `null`;
  - `FechaDeEmpresa.recibeEl: string`;
  - los comentarios.

  En `lib/planes/mensajes.ts`: reexportar la constante, quitar `MENSAJE_EDITAR_CAMBIO_A_MEDIAS` y actualizar el
  comentario de `introCambioPlan`. En `lib/types/plan-borrador.ts`: el comentario del paso `vigencia`.
  *Hecho:* `pnpm run typecheck` señala solo los usos que arreglan T2–T5 (anotarlos en
  `progress/impl_SLT-135.md`).

## T2 · Servicio y repositorio — backend_dev

- [x] **T2.1** `PlanesService.editar` según §2: sin `editarYa`, sin la rama del precio y sin «posterior a hoy»;
  F ≥ hoy → `programarCambio`. `previsualizarCambio` con `recibeEl` siempre fecha. Depende de T1.
  *Hecho:* typecheck verde en `lib/services/`; ningún `vigenteDesde === null` en `editar`.
- [x] **T2.2** Quitar `PlanesRepository.editar`, y `editar` y `ResultadoEdicion` de `IPlanesRepository` (§3).
  Comentarios de `IPlanesService` y de `editarPlanAction` (`lib/actions/planes.ts`). Depende de T2.1.
  *Hecho:* `grep -n "editar(" lib/repositories/PlanesRepository.ts` no devuelve el método; `planPartido` sigue
  usado por `cancelarCambio`.

## T3 · Tests unitarios del servidor — backend_dev

- [x] **T3.1 [P]** `tests/unit/services/planes-service.test.ts`: R1, R7, R9 y R22 con fecha. Fuera los casos de
  «editar de inmediato» y el de R16 (`cambio_a_medias` en editar). Depende de T2.
  *Hecho:* verde; los nombres de los `it` llevan su `R<n>`.
- [x] **T3.2 [P]** `tests/unit/services/planes-service-periodo.test.ts`: R2 y R3; «hoy en el acto» pasa a «hoy
  programa con las 00:00 de hoy».
  *Hecho:* verde.
- [x] **T3.3 [P]** Los dos tests del costo por orden. Las mismas aserciones, con fecha (`programarCambio` en lugar
  de `editar`):
  - `tests/unit/services/planes-service-costeo.test.ts`;
  - `tests/unit/services/planes-service-costo-porcentual.test.ts`.

  *Hecho:* verdes.
- [x] **T3.4 [P]** `tests/unit/services/planes-previsualizar-cambio.test.ts`: R13; las entradas inválidas llevan
  fecha.
  *Hecho:* verde.
- [x] **T3.5 [P]** Los esquemas: R1 y R10. Las entradas válidas llevan fecha.
  - `tests/unit/types/planes-schema.test.ts`;
  - `tests/unit/types/planes-schema-costeo.test.ts`;
  - `tests/unit/types/planes-schema-costo-porcentual.test.ts`;
  - `tests/unit/types/plan-borrador-schema.test.ts`.

  *Hecho:* los cuatro verdes.

## T4 · Tests de integración — backend_dev

Base desechable (`docs/verification.md`). Depende de T2.

- [ ] **T4.1** Los requisitos nuevos:
  - `tests/integration/db/planes-cambio-por-empresa.test.ts`: R4 y R8 (el test de R8 sustituye al de SLT-128
    R16);
  - `tests/integration/db/planes-cambio-programado.test.ts`: R5;
  - `tests/integration/db/plan-precio-historial.test.ts`: R6, y los casos de la edición inmediata reescritos con F.

  *Hecho:* los tres verdes.
- [ ] **T4.2 [P]** El resto de R6 y R11, R12:
  - `tests/integration/db/plan-descuento-periodo.test.ts`: R6;
  - `tests/integration/db/plan-borrador-confirmar.test.ts`: R11 y R12. El caso «De inmediato rechazado por el
    repositorio» pasa a R11.

  *Hecho:* verdes.
- [ ] **T4.3 [P]** Los que editaban sin fecha o con `repo.editar` como atajo, con las mismas aserciones de su
  ficha. Programar y correr `recibirCambio` / `aplicarCambioProgramado` con el reloj en la recepción, o SQL a mano
  si solo preparan datos:
  - `tests/integration/db/planes-edicion-en-uso.test.ts` (además, R3);
  - `tests/integration/db/planes-cambio-correos.test.ts`, `planes-historial.test.ts` y
    `plan-costo-porcentual-escritura.test.ts`;
  - `tests/integration/db/planes-costeo-escritura.test.ts`, `planes-periodicidad-ordenes.test.ts` y
    `factura-plataforma-cambio-plan.test.ts`;
  - `tests/integration/db/planes-asignacion.test.ts` y `cobro-plataforma-plan.test.ts`.

  *Hecho:* los nueve verdes y ningún `vigenteDesde: null` de editar en `tests/integration/`.

## T5 · El formulario — frontend_dev

Depende de T1 (tipos).

- [x] **T5.1** `plan-form/estado.ts`, `plan-form/borrador.ts` y `plan-form/revision.ts` (§5): sin `aplicar`;
  `vigenteDesde` con mañana al editar; `camposEnOrden`, `valoresDelPaso`, `conVigencia` y `filaDeVigencia`.
  *Hecho:* typecheck verde en `plan-form/`.
- [x] **T5.2** `PasoCuandoRige.tsx`, `PlanForm.tsx`, `textos.ts` y `FechasPorEmpresa.tsx`:
  - un solo campo de fecha;
  - «Programar cambio» siempre;
  - la fecha que viaja;
  - `RECHAZOS`;
  - la tabla siempre.

  Depende de T5.1.
  *Hecho:* en pantalla, editar un plan muestra «A partir de» con mañana, la tabla de fechas y «Programar
  cambio»; ninguna cadena «De inmediato» en `app/`.
- [x] **T5.3 [P]** `PlanDetalle.tsx` (R20) y `PlanEmpresa.tsx` (`cambio_a_medias` → genérico).
  *Hecho:* typecheck y lint verdes.

## T6 · Tests del formulario — frontend_dev

Depende de T5.

- [x] **T6.1 [P]** `tests/unit/planes/plan-form-borrador.test.ts` (R15) y `tests/unit/planes/plan-form-revision.test.ts`
  (R18).
  *Hecho:* verdes.
- [x] **T6.2 [P]** Los tests de componentes:
  - `tests/components/PlanForm.test.tsx`: R14–R17. Fuera los de «De inmediato» y «vuelve a Guardar»;
  - `tests/components/PlanFormRevisar.test.tsx`: R18;
  - `tests/components/PlanFormFechasPorEmpresa.test.tsx`: R19;
  - `tests/components/PlanFormBorrador.test.tsx`: el botón «Programar cambio»;
  - `tests/components/PlanDetalle.test.tsx`: R20.

  *Hecho:* verdes. Si otro test de componentes de planes cae por la fecha por defecto, se ajusta y se anota en
  `progress/impl_SLT-135.md` (y en `## Archivos esperados`).

## T7 · E2E — frontend_dev

- [ ] **T7.1** `e2e/planes-costo-porcentual.spec.ts` (R23), con `correrCron` de `e2e/_escenarios/crons.ts`:
  1. Poner «A partir de» = hoy (`fechaCalendarioCR`).
  2. Pulsar «Programar cambio» y esperar «Cambio programado desde <hoy>.».
  3. Correr `procesar-jobs` hasta que el plan quede porcentual. Esperar la condición, nunca `waitForTimeout`.

  Depende de T5.
  *Hecho:* verde dos veces seguidas sobre la misma base desechable. Además, en local (`docs/perfil-agentes.md`):
  - `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts` y `e2e/mi-plan-cambiar-plan.spec.ts`;
  - el grupo `dinero` (`pnpm exec playwright test --project=dinero`), porque toca el precio;
  - `e2e/dos-empresas-humo.spec.ts`, porque el diff toca `lib/repositories/`.

  Constancia en `progress/impl_SLT-135.md`.

## T8 · Cierre

- [ ] **T8.1** `./init.sh` verde. Mapa `R<n> → test` completo (R1–R23) en `progress/impl_SLT-135.md`. Nada en
  `lib/`, `app/` ni `tests/` menciona «De inmediato» salvo el correo de R21 y su test.
  *Hecho:* gate local verde, `gate-completo` en CI verde y el mapa sin huecos.
- [ ] **T8.2** Tamaño. El PR pasa del tope de `gate.tamano_pr` (40 archivos): unos 48, 17 de producción y unos 31
  de tests. **Tamaño aceptado por el humano el 2026-11-18** («Un PR sobre el tope», P1 en
  `requirements.md > Decisiones cerradas`), como en SLT-144. El leader deja el marcador `tamano-pr-aceptado` en
  `progress/features/SLT-135.md`. Líneas estimadas: unas 250 de producción y entre 800 y 1 200 de tests, dentro
  de sus topes.
  *Hecho:* marcador escrito y el aviso de tamaño del gate explicado en el PR.

## Archivos esperados

Producción (17):
- `lib/types/planes.ts`
- `lib/types/plan-borrador.ts`
- `lib/planes/mensajes.ts`
- `lib/services/PlanesService.ts`
- `lib/interfaces/services/IPlanesService.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/actions/planes.ts`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoCuandoRige.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/estado.ts`
- `app/(app)/plataforma/planes/_components/plan-form/borrador.ts`
- `app/(app)/plataforma/planes/_components/plan-form/revision.ts`
- `app/(app)/plataforma/planes/_components/plan-form/textos.ts`
- `app/(app)/plataforma/planes/_components/plan-form/FechasPorEmpresa.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`

Tests (32):
- `tests/unit/services/planes-service.test.ts`
- `tests/unit/services/planes-service-periodo.test.ts`
- `tests/unit/services/planes-service-costeo.test.ts`
- `tests/unit/services/planes-service-costo-porcentual.test.ts`
- `tests/unit/services/planes-previsualizar-cambio.test.ts`
- `tests/unit/types/planes-schema.test.ts`
- `tests/unit/types/planes-schema-costeo.test.ts`
- `tests/unit/types/planes-schema-costo-porcentual.test.ts`
- `tests/unit/types/plan-borrador-schema.test.ts`
- `tests/unit/planes/plan-form-borrador.test.ts`
- `tests/unit/planes/plan-form-revision.test.ts`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanFormRevisar.test.tsx`
- `tests/components/PlanFormFechasPorEmpresa.test.tsx`
- `tests/components/PlanFormBorrador.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `tests/components/PlanFormDescuentos.test.tsx` (añadido en T6.2: buscaba el grupo «Aplicar»)
- `tests/integration/db/planes-cambio-por-empresa.test.ts`
- `tests/integration/db/planes-cambio-programado.test.ts`
- `tests/integration/db/plan-precio-historial.test.ts`
- `tests/integration/db/plan-descuento-periodo.test.ts`
- `tests/integration/db/plan-borrador-confirmar.test.ts`
- `tests/integration/db/planes-edicion-en-uso.test.ts`
- `tests/integration/db/planes-cambio-correos.test.ts`
- `tests/integration/db/planes-historial.test.ts`
- `tests/integration/db/plan-costo-porcentual-escritura.test.ts`
- `tests/integration/db/planes-costeo-escritura.test.ts`
- `tests/integration/db/planes-periodicidad-ordenes.test.ts`
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
- `tests/integration/db/planes-asignacion.test.ts`
- `tests/integration/db/cobro-plataforma-plan.test.ts`
- `e2e/planes-costo-porcentual.spec.ts`

Total: 49 (tamaño aceptado por el humano el 2026-11-18, `tamano-pr-aceptado`).
