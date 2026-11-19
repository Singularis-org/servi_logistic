# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T5.2 (frontend_dev)

## Archivos
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`: sale `editarPlan`; entran `borrador` (las cuatro actions), `previsualizarCambio` y `abrirEditar?`. Monta `AbrirPlanForm origen={{ planId }}` con `onCerrar`, `onBorradorGuardado`. `editando` arranca en `abrirEditar && !plan.archivado` (R26). Al cerrar el `Sheet` sin confirmar con algún paso guardado, aviso «El borrador queda guardado. Puedes retomarlo luego.» (`role="status"`, por el `Desenlace` de siempre) (R13). `alEditar` igual que antes.
- `app/(app)/plataforma/planes/[planId]/page.tsx`: lee `searchParams.editar === "1"` → `abrirEditar`; pasa las actions de `lib/actions/plan-borrador.ts` y `previsualizarCambioPlanAction`; `editarPlanAction` ya no baja. No lee ningún borrador (lo lee el panel al abrirse), así que antes del `notFound()` no se lee nada (R28).
- `tests/components/PlanDetalle.test.tsx`: `montar` con `accionesFalsas(editarPlan)` y `previsualizarCambioFalso()` de `plan-form-pasos.ts` (los casos de SLT-58 siguen midiendo la petición de editar en `editarPlan`); helper `abrirEdicion` espera a que el panel lea el borrador; «Siguiente» → «Guardar y continuar»; casos nuevos de R13 y R26.
- `tests/components/PlanDetalleAsignar.test.tsx`, `PlanDetalleDesasignado.test.tsx`, `PlanEmpresaCostoPorcentual.test.tsx`, `PlanVistaCosteo.test.tsx`: solo el montaje de `PlanDetalle` (props nuevas en vez de `editarPlan`); en Asignar, el bucle «ninguna action se llama» recorre también las del borrador.
- `specs/SLT-144-planes-form-pasos-borrador/tasks.md`: T5.2 en [x].

## R → test (`tests/components/PlanDetalle.test.tsx`)
- R13 → «R13: cerrar la edición con un paso guardado avisa», «R13: tras confirmar no avisa de un borrador guardado».
- R26 → «R26: con editar en la dirección abre el formulario», «R26: sin editar en la dirección el panel no se abre ni lee el borrador», «R26: un plan archivado no abre la edición aunque la dirección lo pida».
- SLT-128 R11 («N de M») → los tres «R11: …» de hoy, sin cambios, en verde.
- R28 (página): no lee borradores; su test de integración es de T5.3.

## Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run tests/components/PlanDetalle.test.tsx`: Test Files 1 passed (1), Tests 34 passed (34).
- `pnpm exec vitest run` de PlanDetalleAsignar, PlanDetalleDesasignado, PlanEmpresaCostoPorcentual y PlanVistaCosteo: 4 files, 27 passed.
- `pnpm run typecheck`: verde (sin errores).
- `pnpm exec eslint` de los 7 archivos: «No issues found», exit 0.

## Decisiones fuera del spec
- R13 en el detalle no llama a `router.refresh()` (en `PlanesModule` sí, para la sección «Borradores»): el detalle no pinta borradores y el panel relee el borrador al volver a abrirse.
- El aviso de R13 reutiliza el `Desenlace` `ok` (mismo `role="status"` que «Cambios guardados.»), sin estado nuevo.
- `searchParams` es opcional en la página: `tests/integration/plataforma-planes-page.test.tsx` la llama solo con `params`.
- `?editar=1` se queda en la dirección: tras cerrar o confirmar no se limpia, así que recargar la página reabre la edición. El spec no dice nada; si se quiere limpiar, `router.replace` al cerrar.
- R18 `validation_error`: «sin aviso de éxito» pasa a medirse como «ningún `status` fuera del panel», porque el formulario ya pinta «Borrador guardado el …» (`role="status"`, R7) dentro del panel.
- Se tocaron los cuatro tests que montan `PlanDetalle` (fuera del alcance nombrado) porque sin eso typecheck seguía rojo; solo el montaje.

Veredicto: T5.2 hecha y en verde (typecheck, eslint y PlanDetalle 34/34).
