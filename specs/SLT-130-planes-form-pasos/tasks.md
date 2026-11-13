# SLT-130 — planes-form-pasos · tasks.md

> Toda la ficha es frontend (`frontend_dev`). `[P]` = puede ir en paralelo con las otras `[P]` de su tanda.
> Tamaño del PR aceptado por el humano (`progress/features/SLT-130.md`, `tamano-pr-aceptado`).
> Al cerrar cada task: `pnpm run typecheck`, `pnpm run lint` y
> `pnpm exec vitest related --run <archivos tocados>` en verde.

## Tanda 1 — piezas sin consumidor (no cambian la pantalla)

- [x] **T1 [P] — Componente de pasos y guarda de `useIsMobile`.** (R1–R5)
  - `hooks/use-mobile.ts`: sin `matchMedia`, devuelve `false` y no lanza (design §3).
  - `components/shared/FormularioPorPasos.tsx` con el contrato de design §3.
  - `tests/components/FormularioPorPasos.test.tsx` con un caso por cada requisito, R1–R5.
  - *Hecho:* los cinco casos pasan. `tests/components/` del Sidebar, si los hay, siguen en verde.
- [x] **T2 [P] — Mudar el estado y los textos del formulario, sin cambiar la conducta.**
  - `plan-form/textos.ts` (`TEXTOS_PLAN_FORM`, re-exportado desde `PlanForm.tsx`).
  - `plan-form/estado.ts`: `Formulario`, `inicial`, `versionDe`, `precioDe`, `camposEnOrden`, `tope`,
    `erroresDeZod`, `pasosDe` y `pasoDeLaClave` (design §4).
  - *Hecho:* `PlanForm.tsx` importa de ahí. Los 9 archivos de tests de planes de hoy pasan sin tocarlos
    (`pasosDe` y `pasoDeLaClave` aún sin usar). `PlanDetalle.tsx` y `PlanEmpresa.tsx` no cambian sus imports.
- [x] **T3 [P] — `filasDeRevision` y `textoDeHoy`.** (R16, R22, R23)
  - `plan-form/revision.ts` según design §6.
  - `tests/unit/planes/plan-form-revision.test.ts`:
    - «R22: filas al crear» (público y custom);
    - «R23: filas al editar» (solo lo que cambia, «antes → después», topes por rol, una fila de descuentos,
      la fila de cuándo rige);
    - «R23: sin cambios»;
    - «R16: textoDeHoy».
  - *Hecho:* pasan. Ningún texto copiado de `lib/planes/mensajes.ts`: se importan.

## Tanda 2 — el formulario por pasos (depende de T1, T2, T3)

- [x] **T4 — Los siete pasos.** (R8–R17, R22, R23, R27)
  - `plan-form/PasoGeneral.tsx`, `PasoPrecio.tsx`, `PasoCobroPorOrden.tsx`, `PasoTopes.tsx`,
    `PasoModulos.tsx`, `PasoCuandoRige.tsx` y `PasoRevisar.tsx`, con `PropsDelPaso` (design §2, §5).
  - Un solo componente por paso para los dos modos; ninguno con variante por modo.
  - En `PasoPrecio`, la lista de descuentos con `LineaDeDescuento` (design §5). `estado.ts` cambia
    `descuentos` a lista, y `inicial`, `precioDe` y `camposEnOrden` lo siguen.
  - *Hecho:* typecheck en verde. Cada JSX movido desde `PlanForm.tsx` conserva sus ids, textos y
    `aria-*`.
- [x] **T5 — `PlanForm` por pasos.** (R7, R18–R21, R24–R26, R28)
  - Estado `paso` y `visitados`; «Siguiente» con el esquema completo filtrado por paso; Enter según el paso.
  - Foco al título al cambiar de paso; `mostrarErrores` lleva al paso del primer error.
  - Vista previa del custom: el aviso se pinta en Topes y el motivo del bloqueo, con «Ir a Topes», junto
    al botón final.
  - Exporta `ESTILO_SHEET_PLAN`.
  - *Hecho:* `PlanForm.tsx` solo orquesta: estado, navegación, guardar y vista previa. Ya no tiene JSX de
    campos.
- [x] **T6 — Hosts en el Sheet ancho.** (R6)
  - `PlanesModule.tsx` y `PlanDetalle.tsx` según design §7.
  - *Hecho:* en `pnpm dev`, el panel de crear y el de editar miden `min(920px, 100vw)`. Los pasos van al
    lado en escritorio y arriba con menos de 768 px. El pie no se mueve al hacer scroll del contenido.

## Tanda 3 — tests (depende de T5 y T6)

- [x] **T7 [P] — Helper y tests de hoy adaptados.** (R8, R14, R15, R17, R24, R26, R27)
  - `tests/components/plan-form-pasos.ts` con `avanzarHasta` y `terminar` (design §10).
  - Adaptar, sin debilitar ninguna aserción de carga útil ni de error:
    - `PlanForm.test.tsx`, `PlanFormCosteo.test.tsx`, `PlanFormCostoPorcentual.test.tsx`;
    - `PlanFormCustomAsigna.test.tsx`, `PlanFormPeriodicidad.test.tsx`, `PlanFormVistaPreviaCustom.test.tsx`;
    - `PlanesModule.test.tsx` y `PlanDetalle.test.tsx`.
  - Casos nuevos:
    - «R6: el panel abre el formulario por pasos», en `PlanesModule.test.tsx` y en `PlanDetalle.test.tsx`;
    - «R28: botón final bloqueado con su motivo y enlace a Topes», en `PlanFormVistaPreviaCustom.test.tsx`.
  - *Hecho:* pasan. `git diff` de esos archivos solo añade navegación, o cambia el sitio donde se busca
    un campo. Ningún `expect` de carga útil cambia de valor, salvo la forma de los descuentos.
- [x] **T8 [P] — `PlanFormDescuentos.test.tsx` reescrito.** (R10–R13)
  - Casos: «R10: cada línea viaja como el descuento de su período», «R10: cambiar el tipo conserva el
    valor», los tres de R11, los dos de R12 y «R13: al editar abre con los descuentos del plan».
  - Se conservan los casos de hoy sobre errores de descuento de la action (claves
    `precio.descuentos.<período>.<forma>`), contra la línea de ese período.
  - *Hecho:* pasan.
- [x] **T9 [P] — Tests nuevos de pasos y de «Revisar».** (R7, R9, R14, R16, R18–R23, R25)
  - `tests/components/PlanFormPasos.test.tsx` y `tests/components/PlanFormRevisar.test.tsx`, con los
    nombres de caso que cita `requirements.md`.
  - *Hecho:* pasan. Cada `R<n>` de `requirements.md` tiene al menos un test con su número en el nombre.
- [x] **T10 — E2E de hoy adaptados.**
  - `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts` y `e2e/planes-costo-porcentual.spec.ts`
    navegan por los pasos; las aserciones no cambian.
  - *Hecho:* los tres pasan en local contra una base desechable
    (`docs/perfil-agentes.md > E2E en local antes del PR`), con constancia en `progress/impl_SLT-130.md`.

## Cierre

- [x] **T11 — Gate y trazabilidad.** `./init.sh` en verde. El mapa `R<n> -> test` (R1–R28) queda en
  `progress/impl_SLT-130.md`.

## Archivos esperados

- `components/shared/FormularioPorPasos.tsx`
- `hooks/use-mobile.ts`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/textos.ts`
- `app/(app)/plataforma/planes/_components/plan-form/estado.ts`
- `app/(app)/plataforma/planes/_components/plan-form/revision.ts`
- `app/(app)/plataforma/planes/_components/plan-form/PasoGeneral.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoPrecio.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoCobroPorOrden.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoTopes.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoModulos.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoCuandoRige.tsx`
- `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `tests/components/FormularioPorPasos.test.tsx`
- `tests/components/plan-form-pasos.ts`
- `tests/components/PlanFormPasos.test.tsx`
- `tests/components/PlanFormRevisar.test.tsx`
- `tests/unit/planes/plan-form-revision.test.ts`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanFormCosteo.test.tsx`
- `tests/components/PlanFormCostoPorcentual.test.tsx`
- `tests/components/PlanFormCustomAsigna.test.tsx`
- `tests/components/PlanFormDescuentos.test.tsx`
- `tests/components/PlanFormPeriodicidad.test.tsx`
- `tests/components/PlanFormVistaPreviaCustom.test.tsx`
- `tests/components/PlanesModule.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `e2e/planes-superadmin.spec.ts`
- `e2e/planes-costeo.spec.ts`
- `e2e/planes-costo-porcentual.spec.ts`
