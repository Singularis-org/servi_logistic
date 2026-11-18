# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T3.2 y T3.3 (frontend_dev)

## Archivos
- NUEVO `app/(app)/plataforma/planes/_components/plan-form/usar-borrador.ts`: `useBorrador` (estado del borrador, un solo `enVuelo` para guardar y confirmar, R10 id nuevo, R12 pasos ajenos con `leer`, confirmar, descartar), tipos `AccionesDelBorrador`, `PeticionDeGuardarPaso`, `EstadoDelBorrador`.
- NUEVO `app/(app)/plataforma/planes/_components/plan-form/AbrirPlanForm.tsx`: lee el borrador (`{ planId }` / `{ borradorId }` / `null`), «Cargando el borrador…», error con «Reintentar», creación borrada con «Cerrar».
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`: «Guardar y continuar» (valida el paso como SLT-130 R18 y guarda), aviso del paso, estado «Borrador · n de m», hora del último guardado, aviso de borrador por paso, ✓/«Sin guardar» por instantáneas, `elegibles` (sin `visitados`), lista deshabilitada en vuelo, confirmar, «Descartar y empezar de nuevo» con `Modal`. Props: `enviar` sale; entran `borrador`, `borradorInicial`, `onBorradorGuardado?` y, al editar, `previsualizarCambio` (solo declarada; la usa T4). Exporta `PrevisualizarCambioInput` y re-exporta `AccionesDelBorrador`.
- `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx`: motivo «Faltan pasos por guardar: …» con enlace «Ir a <primero>» (`faltan`, `idFaltan`, `onIrAlPrimeroQueFalta`).
- `app/(app)/plataforma/planes/_components/plan-form/textos.ts`: textos de design §9 (también los de T4) y los nuevos de abajo.
- `components/shared/FormularioPorPasos.tsx`: prop `deshabilitado` (R4); se quita `visitados` (ya nadie la usa).
- `tests/components/FormularioPorPasos.test.tsx`: `visitados` → `elegibles` en los casos de SLT-130; caso nuevo R4.
- NUEVO `tests/components/PlanFormBorrador.test.tsx`.
- `specs/SLT-144-planes-form-pasos-borrador/tasks.md`: T3.2 y T3.3 en [x].

## R → test (`tests/components/PlanFormBorrador.test.tsx` salvo indicación)
- R1 → «R1: crear guarda General sin borrador y el resto con su id», «R1: editar guarda cada paso con el plan», «R1: un paso con error no llama a guardar».
- R3 → «R3: validation_error de un tope se pinta en Topes», «R3: archivado se pinta en el aviso del paso», «R3: un fallo de red no avanza».
- R4 → «R4: con un guardado en vuelo no se puede confirmar ni guardar otra vez»; y `tests/components/FormularioPorPasos.test.tsx` «R4: deshabilitado apaga toda la lista, también el paso actual».
- R5 → «R5: no se salta a Topes sin guardar Cobro por orden».
- R6 → «R6: tocar un paso guardado lo deja Sin guardar».
- R7 → «R7: estado y hora tras guardar General».
- R8 → «R8: con Topes sin guardar no se confirma y el enlace lleva a Topes», «R8: confirmar llama una vez con el borrador y entrega el ok».
- R9 → «R9: pasos_pendientes lleva al primero que falta», «R9: una fecha pasada al programar lleva a Cuándo rige», «R9: borrador_no_encontrado».
- R10 → «R10: un id nuevo al guardar avisa y deja solo ese paso guardado».
- R11 → «R11: crear con el borrador borrado no guarda en otro».
- R12 → «R12: pasos ajenos se cargan y se avisa».
- R14 → «R14: cargando, error con Reintentar y plan sin borrador», «R14: retomar una creación que ya no existe ofrece Cerrar».
- R15 → «R15: editar retoma el borrador de otro superadmin con su aviso», «R15: retomar una creación en Topes».
- R16 → «R16: descartar y empezar de nuevo», «R16: borrador_no_encontrado al descartar también empieza de nuevo», «R16: un fallo al descartar no toca el formulario».

## Salida
- `pnpm exec vitest run tests/components/PlanFormBorrador.test.tsx tests/components/FormularioPorPasos.test.tsx tests/unit/planes/plan-form-borrador.test.ts`: 3 files, 44 passed.
- `pnpm exec eslint` de los 8 archivos tocados: «No issues found», exit 0.
- `pnpm run typecheck`: rojo solo por el cambio de props de `PlanForm` (sale `enviar`): `PlanDetalle.tsx(410)` y `PlanesModule.tsx(184)` (T5) y los 9 `tests/components/PlanForm*.test.tsx` de hoy (T3.4). Ningún error en los archivos de esta tanda ni en `tests/unit/services`.

## Tests de hoy en rojo (esperado, no tocados)
- Los 9 de T3.4 (`PlanForm`, `PlanFormCosteo`, `PlanFormCostoPorcentual`, `PlanFormCustomAsigna`, `PlanFormPeriodicidad`, `PlanFormVistaPreviaCustom`, `PlanFormDescuentos`, `PlanFormPasos`, `PlanFormRevisar`): 112 de 112 fallan. Montan `PlanForm` con `enviar` y sin `borrador`/`borradorInicial`, así que revienta al arrancar (`borradorInicial` es `undefined`); aunque se montara, pulsan «Siguiente», que pasa a ser «Guardar y continuar», y esperan `enviar` en vez de `confirmar`.
- `tests/components/PlanesModule.test.tsx` (5 de 12) y `tests/components/PlanDetalle.test.tsx` (5 de 29): abren el panel, y los hosts todavía pasan `enviar` sin las actions del borrador (T5.1 y T5.2).

## Decisiones fuera del spec
- «Descartar y empezar de nuevo» se ve siempre que hay borrador abierto Y un aviso de borrador (el de R15 «Borrador de …» o el de R10/R12), no solo con el de R15: R10 dice «Si no lo quiere, tiene Descartar y empezar de nuevo».
- El diálogo de descartar: título «Descartar y empezar de nuevo», descripción el texto de §9, botones «Descartar» y «Cancelar». Texto nuevo para un fallo: «No se pudo descartar el borrador. Inténtalo de nuevo.» (`forbidden` usa el de hoy, «No tienes permiso para esto.»).
- R8: el enlace al primer paso que falta dice «Ir a <título>» (`irAPaso`), como el «Ir a Topes» de SLT-130 R28.
- R11 y los rechazos de guardar van al aviso del paso (`role="alert"`), no al aviso del borrador; R10 y R12, al aviso del borrador (`role="status"`).
- R12: si `leer` falla, los pasos ajenos quedan guardados sin instantánea, o sea «Sin guardar»: hay que volver a guardarlos antes de confirmar (no se confirma un valor que no está en pantalla).
- Confirmar no revalida todo en el cliente: llama a `confirmar` (design §4.3); las reglas que cruzan pasos las devuelve el servidor y van al paso del campo (R9). Se conserva la espera de la vista previa del custom (D17) antes de confirmar.
- Tras un `ok` de confirmar el formulario sigue «en vuelo» hasta que el host lo desmonta: así no puede salir un guardado tardío (design §4.4).
- `AbrirPlanForm` recibe además `onCerrar` (para «Cerrar» cuando la creación que se retomaba ya no existe; design §4.5 lo pide sin prop).
- Textos de T4 (`calculandoFechas`, `errorFechas`, `sinEmpresasDelPlan`, cabeceras) ya en `textos.ts`; `sinEmpresasDelPlan` se llama así porque `sinEmpresas` ya existe con otro texto.
- `FormularioPorPasos` pierde `visitados` (alias de T3.1) y gana `deshabilitado`.

Veredicto: T3.2 y T3.3 hechas y en verde; el rojo de typecheck y de tests es el previsto de T3.4 y T5.
