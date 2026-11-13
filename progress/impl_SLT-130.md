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
