# impl SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)»

## Entorno del worktree
- El cliente Prisma no venía generado: `pnpm run db:generate` con `DATABASE_URL` ficticio (no conecta).
- `tsc` y vitest pesados con `NODE_OPTIONS=--max-old-space-size=8192`.

## Tanda 1 — T1 (frontend_dev)

### Archivos
- Modificado `hooks/use-mobile.ts`: sin `matchMedia`, `subscribe` → `() => {}` y snapshot `false`.
- Creado `components/shared/FormularioPorPasos.tsx` (design §3; exporta también `TEXTOS_FORMULARIO_POR_PASOS`).
- Creado `tests/components/FormularioPorPasos.test.tsx`.

### Mapa R → test (`components/FormularioPorPasos.test.tsx`)
- R1 → «R1: numera los pasos, marca el actual y pinta "Paso n de m"»
- R2 → «R2: la orientación de la prop llega al contenedor»
- R3 → «R3: en pantalla angosta pasa a horizontal»
- R4 → «R4: sin matchMedia usa la prop»
- R5 → «R5: no visitado deshabilitado; visitado llama a onIr»

### Salida
- `vitest run tests/components/FormularioPorPasos.test.tsx tests/unit/planes/plan-form-revision.test.ts`:
  2 archivos, 11 tests, verdes.
- `eslint` de los archivos de la tanda: sin issues. `typecheck` tras T2/T3: 0 errores.

## Tanda 1 — T2 y T3 (frontend_dev)

### Archivos
- Creado `app/(app)/plataforma/planes/_components/plan-form/textos.ts`: `TEXTOS_PLAN_FORM` movido tal cual,
  más los textos nuevos de design §4–§6 (títulos de pasos, `visibilidadFija`, `sinDescuentos`, `hoy`,
  `descuentos`, `topeDeRol`, `topeDeApiKeys`, `ninguno`, `sinCambios`, `revisarAlCrear`, `revisarAlEditar`,
  `comprobandoConsumo`, `irATopes`).
- Creado `plan-form/estado.ts`: `Formulario`, `Errores`, `inicial`, `tope`, `precioDe`, `versionDe`,
  `erroresDeZod`, `CamposVisibles`, `camposEnOrden` (movidos sin cambios de conducta) y `IdPaso`,
  `PasoDelPlan`, `pasosDe`, `pasoDeLaClave` (nuevos, aún sin consumidor).
- Creado `plan-form/revision.ts`: `filasDeRevision`, `haySoloExtras`, `extrasDeGeneral`, `filaDeCuandoRige`,
  `textoDeHoy`.
- Modificado `PlanForm.tsx`: importa de `plan-form/` y re-exporta `TEXTOS_PLAN_FORM`. Sin cambio de conducta.
- Creado `tests/unit/planes/plan-form-revision.test.ts`.

### Mapa R → test (de esta tanda)
- R16 → `unit/planes/plan-form-revision.test.ts` «R16: textoDeHoy …»
- R22 → `unit/planes/plan-form-revision.test.ts` «R22: filas al crear — público …» y «… — custom …»
- R23 → `unit/planes/plan-form-revision.test.ts` «R23: filas al editar …» (dos casos) y «R23: sin cambios …»

### Salida
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él tsc muere por memoria): 0 errores.
  Antes hubo que generar el cliente Prisma del worktree (`pnpm run db:generate` con un `DATABASE_URL` ficticio).
- `pnpm run lint`: 0 errores, 257 warnings (todos ajenos); los archivos tocados, sin issues.
- `vitest run` de los 9 archivos de planes + el unitario nuevo: 10 archivos, 137 tests, todos verdes.
- `vitest related --run` de PlanForm.tsx y `plan-form/*`: 21 archivos, 333 tests, todos verdes.

### Veredicto
T2 y T3 hechas: estado y textos mudados sin cambio de conducta; filas de «Revisar» y «Hoy» puras y probadas.

## Tanda 2 — T4, T5, T6 (frontend_dev)

### Archivos
- Creados en `app/(app)/plataforma/planes/_components/plan-form/`: `PasoGeneral.tsx`, `PasoPrecio.tsx`,
  `PasoCobroPorOrden.tsx`, `PasoTopes.tsx`, `PasoModulos.tsx`, `PasoCuandoRige.tsx`, `PasoRevisar.tsx`.
  Un componente por paso para los dos modos; las diferencias van por condiciones sobre `modo`.
- Modificado `plan-form/estado.ts`: `descuentos` pasa a `LineaDeDescuento[]` (`inicial`, `precioDe`,
  `camposEnOrden` lo siguen); `primerPeriodoLibre`; `PropsDelPaso`; `EmpresaParaCustom` se muda aquí (PlanForm
  la re-exporta); `PasoDelPlan = PasoDelFormulario & { id: IdPaso }` (import solo de tipo); `camposEnOrden`
  ordenado por pasos (R25).
- Modificado `plan-form/revision.ts`: `filasDeRevision` acepta `escrito` (lo crudo del formulario); un tope,
  un descuento o un porcentual que no pasa el esquema se pinta tal cual (design §6).
- Modificado `plan-form/textos.ts`: + `anterior`, `siguiente`, `periodoDelDescuento`, `valorDelDescuento`,
  `tipoDelDescuento`, `descuentoFijo`, `descuentoPorciento`, `quitarDescuento`, `agregarDescuento` (textos de
  design §4–§5); − `descuentoNinguno`, `descuentoPorcentaje`, `descuentoMonto` (sin uso).
- Reescrito `PlanForm.tsx`: solo orquesta (estado, `paso`/`visitados`, Siguiente/Anterior/lista, guardar,
  vista previa del custom). Exporta `ESTILO_SHEET_PLAN` y lo de antes.
- Modificados `PlanesModule.tsx` y `[planId]/_components/PlanDetalle.tsx`: solo design §7.
- Modificado `tests/unit/planes/plan-form-revision.test.ts`: + caso «valores aún no válidos se pintan tal cual».

### R → dónde se implementa
- R6 → `PlanesModule.tsx`, `PlanDetalle.tsx` (`ESTILO_SHEET_PLAN`, `flex min-h-0 flex-1`).
- R7 → `estado.ts > pasosDe` + `PlanForm` (abre en General).
- R8, R9 → `PasoGeneral` (visibilidad `disabled` con `visibilidadFija` al editar).
- R10–R13 → `PasoPrecio` (`LineaDelDescuento`), `estado.ts` (`inicial`, `precioDe`, `primerPeriodoLibre`).
- R14 → `PasoCobroPorOrden`. R15 → `PasoTopes`, `PasoModulos`.
- R16 → `PasoPrecio` (costo base) y `PasoTopes` (cada tope), con `textoDeHoy`.
- R17 → `PasoCuandoRige`.
- R18 → `PlanForm > siguiente` (esquema completo filtrado por `pasoDeLaClave` del paso actual).
- R19 → `PlanForm > alEnviar` (un solo `<form>`; en pasos intermedios el submit es «Siguiente»).
- R20 → `PlanForm > anterior / alElegirPaso`. R21 → efecto sobre `paso` que enfoca el `<h3>`.
- R22, R23 → `PasoRevisar` + `revision.ts` (lista del primer período del custom debajo de las filas).
- R24–R26 → `PlanForm > guardar / mostrarErrores` (va al paso del primer error; sin campo, a «Revisar»).
- R27 → `PasoTopes` (avisos o fallo con «Reintentar»). R28 → `PasoRevisar` (motivo + «Ir a Topes»;
  el botón final lo enlaza con `aria-describedby`).

### Desajustes spec ↔ código (resueltos sin reabrir decisiones)
1. Design §4 dice que «Siguiente» es `type="button"`. Con eso Enter no envía el formulario cuando el paso
   tiene más de un campo (envío implícito de HTML), y R19 no se cumpliría. «Siguiente» es `type="submit"` y
   `alEnviar` decide por el paso: solo el último guarda. Las `key` distintas impiden reutilizar el nodo.
2. `camposEnOrden` se reordenó al orden de los pasos: es «el orden de pantalla» de R25.
3. Las leyendas «Topes» y «Cobro por orden» repiten el título del paso: pasan a `sr-only` (texto y aria iguales).
4. Una línea de descuento que se quita también descarta sus errores (design §5 solo lo dice del cambio de
   período): sin eso caerían al aviso general de «Revisar».
5. T6 «Hecho» pide comprobarlo en `pnpm dev`: no hecho aquí (sin navegador); queda para la revisión manual.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: 0 errores.
- `pnpm exec eslint` sobre PlanForm, PlanesModule, PlanDetalle, `plan-form/` y el unitario: 0 problemas.
- `vitest run tests/components/FormularioPorPasos.test.tsx tests/unit/planes/plan-form-revision.test.ts`:
  2 archivos, 12 tests, verdes.
- `vitest related --run <archivos tocados>`: 21 archivos, 334 tests; 245 verdes, 89 rojos, todos en los 9
  archivos de planes de la Tanda 3. Los otros 12 (PlanEmpresa*, PlanDetalleAsignar, PlanDetalleDesasignado,
  ConsumoDelPlanPorcentual, PlanVistaCosteo, las dos de integración de páginas y el unitario), verdes.

### Rojos esperables para la Tanda 3 (navegación por pasos; ninguno por un fallo del formulario)
- `PlanForm.test.tsx` 23/25 · `PlanFormDescuentos.test.tsx` 19/20 · `PlanFormVistaPreviaCustom.test.tsx` 10/13
- `PlanFormCostoPorcentual.test.tsx` 10/10 · `PlanFormCustomAsigna.test.tsx` 9/12 · `PlanFormCosteo.test.tsx` 7/7
- `PlanFormPeriodicidad.test.tsx` 5/5 · `PlanDetalle.test.tsx` 3/28 · `PlanesModule.test.tsx` 3/11
- Causa: buscan en pantalla campos de otro paso («Con monto», «Costo por orden», topes, «Aplicar»…) o el
  botón «Guardar»/«Crear plan», que solo está en el último paso; `PlanFormDescuentos` además usa los radios
  «Ninguno/Porcentaje/Monto fijo» de la forma vieja.

### Veredicto
T4, T5 y T6 hechas: formulario por pasos compartido, typecheck y lint en verde; los rojos son los 9 de planes que adapta la Tanda 3.
