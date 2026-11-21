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

## Tanda 3 — T10 E2E (frontend_dev)

### Archivos modificados
- `e2e/planes-superadmin.spec.ts`: `rellenarPlan` se parte en `rellenarGeneral` (Nombre, Visibilidad) y
  `rellenarRestoDelPlan` (Precio y descuentos → Cobro por orden → Topes → Módulos → «Revisar y crear»).
  Lo del custom (Empresa, Tipo de cobro, Inicio del período) se sigue rellenando en General; las
  aserciones de «sin Empresa/Tipo de cobro/Inicio» del público se hacen en General, que es donde los pide
  un custom. Helper `siguiente(form, paso)`.
- `e2e/planes-costeo.spec.ts`: el alta del custom de A va por pasos en el mismo orden; helper
  `siguientePaso(form, paso)`.
- `e2e/planes-costo-porcentual.spec.ts`: al editar, General → Precio y descuentos → «Cobro por orden»
  (radios, Porcentaje, Mínimo), después Topes → Módulos → «Cuándo rige» (queda en «De inmediato») →
  «Revisar y programar», y «Guardar». Helper `siguientePaso(form, paso)`.

Ninguna aserción cambia. «Siguiente» se pulsa por rol y nombre exacto y cada salto espera la condición:
el `h3` del paso siguiente visible (`getByRole("heading", { level: 3, name, exact: true })`); sin
`waitForTimeout`. Ninguno de los tres specs crea descuentos, así que la lista de líneas no se toca.

### Comandos
- `npx tsc --noEmit -p .` → exit 0, 0 `error TS`.
- `npx eslint e2e/planes-superadmin.spec.ts e2e/planes-costeo.spec.ts e2e/planes-costo-porcentual.spec.ts` → exit 0, sin avisos.
- Playwright: **no corrido en local.** El worktree no tiene `.env` y no hay base desechable: Docker
  Desktop está parado (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file
  specified.`), no hay `psql`, y el único Postgres local (5432) es el que aloja la base de desarrollo
  (`servi_logistic_simprod`). Crear en ese servidor una base nueva (`CREATE DATABASE
  servi_logistic_e2e_slt130`) lo bloqueó el permiso del entorno («Modify Shared Resources»); no se
  improvisó otra vía. Además, el `.env` del checkout principal trae `SUPABASE_URL` hacia un proyecto
  cuyo dueño no puedo confirmar desde el repo; el worktree no lo carga. Los tres specs los cubre el
  CI (`aislamiento`, `dinero`) o una corrida local cuando haya una base desechable aprobada.

### Veredicto
T10 adaptada (navegación por pasos, aserciones intactas, typecheck y lint verdes); el E2E queda sin
correr en local por falta de base desechable, pendiente de CI o de permiso para crearla.

## Tanda 3 — T8 y T9 (frontend_dev)

### Archivos
- Reescrito `tests/components/PlanFormDescuentos.test.tsx`: la lista de descuentos (R10–R13) y los casos de
  hoy de SLT-86 (errores de descuento de la action contra la línea de su período, «Rige desde» al editar el
  precio, custom para empresa con plan), ahora navegando con `plan-form-pasos.ts`. 23 tests.
- Creado `tests/components/PlanFormPasos.test.tsx` (R7, R9, R14, R16, R18–R21, R25). 13 tests.
- Creado `tests/components/PlanFormRevisar.test.tsx` (R22, R23). 3 tests.
- Usa el helper `tests/components/plan-form-pasos.ts` (de otro agente; no lo toqué).

### Mapa R → test
- R10 → `PlanFormDescuentos.test.tsx` «R10: cada línea viaja como el descuento de su período», «R10: cambiar el tipo conserva el valor»
- R11 → `PlanFormDescuentos.test.tsx` «R11: agrega el primer período libre», «R11: no repite período», «R11: con cuatro líneas no agrega más»
- R12 → `PlanFormDescuentos.test.tsx` «R12: lista vacía», «R12: quitar una línea»
- R13 → `PlanFormDescuentos.test.tsx` «R13: al editar abre con los descuentos del plan»
- Errores de descuento de la action (conservados) → `PlanFormDescuentos.test.tsx` «R23: un validation_error de la action en `precio.descuentos.<periodo>.monto` va junto a su línea y conserva lo escrito», «R23: un error del descuento entero va junto a su línea», «R10, R23: un porcentaje fuera de rango no deja avanzar y el error va junto a su línea»
- R7 → `PlanFormPasos.test.tsx` «R7: pasos al crear», «R7: pasos al editar»
- R9 → `PlanFormPasos.test.tsx` «R9: al editar la visibilidad está deshabilitada con su texto»
- R14 → `PlanFormPasos.test.tsx` «R14: solo dos modos»
- R16 → `PlanFormPasos.test.tsx` «R16: "Hoy" solo bajo lo que cambia al editar», «R16: al crear no hay "Hoy"»
- R18 → `PlanFormPasos.test.tsx` «R18: General sin nombre no avanza y enfoca Nombre», «R18: un error de otro paso no bloquea»
- R19 → `PlanFormPasos.test.tsx` «R19: Enter en un paso intermedio avanza y no guarda»
- R20 → `PlanFormPasos.test.tsx` «R20: volver y saltar a visitados conserva lo escrito»
- R21 → `PlanFormPasos.test.tsx` «R21: el foco va al título del paso»
- R25 → `PlanFormPasos.test.tsx` «R25: un validation_error de un tope lleva al paso Topes», «R25: empresa que ya no existe lleva a General»
- R22 → `PlanFormRevisar.test.tsx` «R22: al crear lista los valores finales»
- R23 → `PlanFormRevisar.test.tsx` «R23: solo lo que cambia», «R23: sin cambios»

### Notas
- Un descuento «Fijo» se pinta con `MontoInput` (`montoParaCampo`): el «1000.00» del plan se ve «1000» y un
  «7.5» pasado a «Fijo» se ve «7.50». Es la conducta de todo campo de monto, no un bug: el test de R10 usa
  un valor entero y el de R13 espera «1000».
- La clave de la fila de módulos en «Revisar» es la etiqueta del campo, «Módulos incluidos» (design §6).
- Sin bugs de implementación encontrados.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run tests/components/PlanFormDescuentos.test.tsx tests/components/PlanFormPasos.test.tsx tests/components/PlanFormRevisar.test.tsx`:
  `Test Files  3 passed (3)` · `Tests  39 passed (39)` · Duration 41.77s.
- `pnpm exec eslint` de los tres archivos: `ESLint: No issues found`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` (`tsc --noEmit`): 0 errores.

### Veredicto
T8 y T9 hechas: 39 tests verdes en los tres archivos y cada R de esta tanda tiene su test con el nombre exacto de requirements.md.

## Tanda 3 — T7 (frontend_dev)

### Archivos
- Creado `tests/components/plan-form-pasos.ts`: `avanzarHasta(user, titulo)`, `terminar(user)` (design §10) y
  `tituloDelPasoActual()` (el botón de la lista con `aria-current="step"`). Si «Siguiente» no avanza, falla
  con los campos `aria-invalid` y los avisos en pantalla.
- Adaptados en `tests/components/`: `PlanForm.test.tsx`, `PlanFormCosteo.test.tsx`,
  `PlanFormCostoPorcentual.test.tsx`, `PlanFormCustomAsigna.test.tsx`, `PlanFormPeriodicidad.test.tsx`,
  `PlanFormVistaPreviaCustom.test.tsx`, `PlanesModule.test.tsx`, `PlanDetalle.test.tsx`. Solo navegación o
  dónde se busca un campo; ninguna carga útil cambia de valor.

### R → test
- R6 → `PlanesModule.test.tsx` y `PlanDetalle.test.tsx` — «R6: el panel abre el formulario por pasos».
- R8 → `PlanFormCustomAsigna.test.tsx` — sus 12 casos de hoy, con `crear()` hasta «Revisar y crear» (p. ej.
  «D2, D6: el tipo elegido viaja a la action junto a la empresa y el inicio del ciclo»).
- R14 → `PlanFormCostoPorcentual.test.tsx` (10 casos «R20: …»), `PlanFormCosteo.test.tsx` («R23: …») y
  `PlanFormPeriodicidad.test.tsx` («R35: …»), navegando a «Cobro por orden».
- R15 → `PlanForm.test.tsx` — «R14: envía a la action nombre, custom con su empresa, topes (vacío = sin
  límite), módulos y precio».
- R17 → `PlanForm.test.tsx` — «R15: «De inmediato» envía vigenteDesde null», «R15: «A partir de» envía solo
  la fecha (AAAA-MM-DD)», «al editar, el botón dice «Programar cambio» con «A partir de» y vuelve a «Guardar»
  con «De inmediato»»; «Rige desde» al crear: `PlanFormCustomAsigna.test.tsx` — «D4, SLT-86 R16: empresa con
  plan → no pide el inicio; la action recibe «Rige desde» y no `inicioCiclo`».
- R24 → `PlanForm.test.tsx` — los de carga útil («R14: envía a la action…», «R14: un plan público sin topes
  ni precio…», «R15: «De inmediato»…») y ««Crear plan» se deshabilita mientras la petición está en vuelo».
- R26 → `PlanForm.test.tsx` — «R18: %o → muestra «%s» y no avisa de guardado» (4), «R18: si la action lanza,
  avisa con un genérico y no da el cambio por hecho», «si solo hay errores sin campo visible, el foco va al
  aviso general», «un rechazo de la action también lleva el foco al aviso general».
- R27 → `PlanFormVistaPreviaCustom.test.tsx` — sus casos «D13: …» y «D17: …», leyendo el aviso en el paso Topes.
- R28 → `PlanFormVistaPreviaCustom.test.tsx` — «R28: botón final bloqueado con su motivo y enlace a Topes».

### Aserciones que cambiaron de forma (no de valor)
- `PlanForm.test.tsx` «R15: no ofrece cambiar la visibilidad…»: antes `radiogroup Visibilidad` ausente; ahora
  presente con sus radios `aria-disabled="true"` (R9 lo exige visible y deshabilitado).
- `PlanForm.test.tsx` «el precio ofrece «Con monto»…» y «SLT-67: …»: el descuento anual ya no es un grupo
  fijo con radios «Porcentaje/Monto fijo», sino una línea de la lista («Tipo del descuento», «Valor»,
  «Fijo/%»). Es el cambio de forma de los descuentos que admite la tarea. Carga útil igual.
- `PlanForm.test.tsx` «el pie con el botón de enviar queda fijo al fondo del panel»: antes clase `sticky
  bottom-0`; design §3 la quita. Ahora: el botón no está dentro del contenido con scroll y sí en el pie
  `flex-none border-t`.
- Los casos que validaban pulsando «Crear plan» desde General (custom sin empresa, sin nombre, costo o
  porcentaje inválidos) pulsan «Siguiente» (R18): mismas aserciones, `enviar` no se llama.
- Errores de la action en otro paso: se leen donde R25 deja el formulario (Topes, Cobro por orden, General) y,
  si hay un segundo campo con error en otro paso, se salta a él por la lista.
- R6: jsdom descarta `width: min(920px, 100vw)`; el test mide el `maxWidth: none` en línea del Sheet.

### Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run` de los 8 archivos:
  `Test Files  8 passed (8)` · `Tests  114 passed (114)`.
- `pnpm exec eslint` de los 8 archivos y el helper: `ESLint: No issues found`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` (`tsc --noEmit`): 0 errores.
- Sin bugs de implementación encontrados.

### Veredicto
T7 hecha: los 8 archivos de planes navegan por pasos con sus aserciones de carga útil y de error intactas, y R6/R28 tienen test.

## Cierre — mapa R1–R28 y verificación final (implementer)

### Mapa R → test (rutas relativas a `tests/`)
| R | Test |
|---|---|
| R1–R5 | `components/FormularioPorPasos.test.tsx` — «R1: …» a «R5: …» (nombres exactos de requirements.md) |
| R6 | `components/PlanesModule.test.tsx` y `components/PlanDetalle.test.tsx` — «R6: el panel abre el formulario por pasos» |
| R7 | `components/PlanFormPasos.test.tsx` — «R7: pasos al crear», «R7: pasos al editar» |
| R8 | `components/PlanFormCustomAsigna.test.tsx` — sus 12 casos de hoy, navegando hasta «Revisar y crear» |
| R9 | `components/PlanFormPasos.test.tsx` — «R9: al editar la visibilidad está deshabilitada con su texto» |
| R10–R13 | `components/PlanFormDescuentos.test.tsx` — «R10: …» (2), «R11: …» (3), «R12: …» (2), «R13: …» |
| R14 | `components/PlanFormPasos.test.tsx` «R14: solo dos modos»; `PlanFormCostoPorcentual`, `PlanFormCosteo`, `PlanFormPeriodicidad` (adaptados) |
| R15 | `components/PlanForm.test.tsx` — «R14: envía a la action nombre, custom con su empresa, topes …» |
| R16 | `components/PlanFormPasos.test.tsx` — «R16: "Hoy" solo bajo lo que cambia al editar», «R16: al crear no hay "Hoy"»; `unit/planes/plan-form-revision.test.ts` «R16: textoDeHoy» |
| R17 | `components/PlanForm.test.tsx` — casos «R15: «De inmediato» …», «R15: «A partir de» …» y «Programar cambio»; `PlanFormDescuentos.test.tsx` casos de «Rige desde» al editar el precio |
| R18–R21 | `components/PlanFormPasos.test.tsx` — «R18: …» (2), «R19: …», «R20: …», «R21: …» |
| R22 | `components/PlanFormRevisar.test.tsx` «R22: al crear lista los valores finales»; `unit/planes/plan-form-revision.test.ts` «R22: filas al crear» |
| R23 | `components/PlanFormRevisar.test.tsx` «R23: solo lo que cambia», «R23: sin cambios»; `unit/planes/plan-form-revision.test.ts` «R23: filas al editar», «R23: sin cambios» |
| R24 | `components/PlanForm.test.tsx` — casos de carga útil y ««Crear plan» se deshabilita mientras la petición está en vuelo» |
| R25 | `components/PlanFormPasos.test.tsx` — «R25: un validation_error de un tope lleva al paso Topes», «R25: empresa que ya no existe lleva a General» |
| R26 | `components/PlanForm.test.tsx` — casos «R18: …» de rechazo, fallo de red y foco al aviso general |
| R27 | `components/PlanFormVistaPreviaCustom.test.tsx` — casos «D13: …» y «D17: …», en el paso Topes |
| R28 | `components/PlanFormVistaPreviaCustom.test.tsx` — «R28: botón final bloqueado con su motivo y enlace a Topes» |

Nota para el reviewer: R8, R15, R17, R24, R26 y R27 se cubren con los casos de hoy adaptados, como dice su
`Test:` en requirements.md; esos casos conservan su nombre histórico (no llevan el número de esta ficha).

### Verificación final (2026-11-13, `NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm run typecheck`: 0 errores (reportado por T7, T8/T9 y T10 sobre el árbol final).
- `pnpm exec eslint` de todos los `.ts/.tsx` tocados frente a `origin/dev` (incluye `e2e/`): exit 0, sin issues.
- `pnpm exec vitest related --run <todos los .ts/.tsx tocados, sin e2e/>`: `Test Files 88 passed (88)` ·
  `Tests 1314 passed | 17 skipped (1331)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 340 passed | 3 skipped (344)` · `Tests 4 failed | 4830 passed`.
  El rojo es `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (sobre `init.sh`), listado en
  `tests/baseline-rojos.json`; el diff no toca `init.sh`, `scripts/` ni `tests/unit/guards/`. Rojo heredado.
- `./init.sh` completo: no corrido en local (el gate local muere por memoria en este entorno); el gate completo corre en CI.
- E2E: los 3 specs adaptados, sin correr en local (ver «Tanda 3 — T10»). Pendientes de CI o de una base desechable aprobada.
- Pendiente de comprobar a mano en `pnpm dev` (T6): ancho `min(920px, 100vw)`, pasos al lado / arriba con < 768 px, pie fijo.

### Desviaciones del design para el reviewer
- «Siguiente» es `type="submit"` (design §4 dice `type="button"`): sin un botón de envío, Enter no envía un
  formulario con varios campos y R19 no se cumpliría. `onSubmit` decide por paso; solo el último guarda.
- Quitar una línea de descuento también descarta sus errores pendientes (design §5 solo lo dice del cambio de período).
- `filasDeRevision` recibe lo escrito (`escrito?: Formulario`) para pintar tal cual los valores aún no válidos (design §6).

### Constancia de T10 y T11 (decisión humana, 2026-11-13)
- El humano aceptó el E2E de CI como constancia («Aceptar CI como constancia»): `planes-superadmin` y
  `planes-costeo` pasaron en `e2e (aislamiento)` y `planes-costo-porcentual` en `e2e (dinero)`, run 43474894170 (ese run cayó en conjunto por el rojo de SLT-139); constancia válida: run 43498735892 sobre `1c0887a7`, 11/11 en verde.
  En local no corrieron: Docker parado y sin base desechable.
- `./init.sh` local muere por memoria en este entorno: lo sustituye el `gate-completo` de CI. Su único rojo
  (`migracion-slt139-ida-y-vuelta.test.ts`, ajeno al diff) ya lo arregló dev en `bc756367`; la rama lo trae
  con el merge `1ae4d46b`.
