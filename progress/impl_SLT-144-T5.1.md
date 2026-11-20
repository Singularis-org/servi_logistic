# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T5.1 (frontend_dev)

## Archivos
- NUEVO `app/(app)/plataforma/planes/_components/BorradoresDePlanes.tsx`: sección «Borradores» (`<section>` con `<h2>`, región accesible), tabla Nombre · Tipo · Empezado por · Empezado el · Guardado el · acciones; «Retomar» (botón para una creación, `Link` a `/plataforma/planes/<planId>?editar=1` para un cambio); «Descartar» con `Modal` y el error dentro del diálogo; aviso «No se pudieron cargar los borradores.» con `borradores === null`; no se pinta sin borradores. Textos en `TEXTOS_BORRADORES`.
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`: sale `crearPlan`; entran `borradores` y `borrador` (actions). Monta `BorradoresDePlanes` sobre el catálogo, la marca «Cambio en borrador» (`Badge` info) en `Catalogo`, el panel con `AbrirPlanForm` (`origen` `null` o `{ borradorId }`), y el aviso «El borrador queda guardado. Puedes retomarlo luego.» al cerrar tras un `onBorradorGuardado`.
- `app/(app)/plataforma/planes/page.tsx`: `verBorradoresDePlanes` en el mismo `Promise.all`, después del `notFound()`; si lanza o no es `ok`, `borradores: null`. Baja las cuatro actions de `lib/actions/plan-borrador.ts`; quita `crearPlanAction`.
- `tests/components/PlanesModule.test.tsx`: casos de hoy adaptados (borrador en memoria; la petición de crear se reconstruye con `peticionDeCrear`) y casos nuevos R13, R24–R27.
- `tests/components/PlanVistaCosteo.test.tsx` y `tests/components/PlanEmpresaCostoPorcentual.test.tsx`: solo el montaje de `PlanesModule` (`crearPlan` → `borradores={[]}` + dobles de las actions); sin tocar aserciones.
- `specs/SLT-144-planes-form-pasos-borrador/tasks.md`: T5.1 en [x].

## R → test (`tests/components/PlanesModule.test.tsx`)
- R13 → «R13: cerrar con un paso guardado avisa» (incluye que cerrar sin guardar no avisa).
- R24 → «R24: un borrador de creación y uno de cambio», «R24: sin borradores no hay sección», «R24: error de lectura con el catálogo».
- R25 → «R25: la marca solo en el plan con borrador».
- R26 → «R26: retomar una creación abre el panel con su id» (y el `href` `?editar=1` del de cambio).
- R27 → «R27: descartar con confirmación», «R27: ya no existe», «R27: un fallo deja la fila».

## Salida
- `pnpm exec vitest run tests/components/PlanesModule.test.tsx`: 1 file, 21 passed (12 de hoy + 9 nuevos).
- `pnpm exec vitest run tests/components/PlanVistaCosteo.test.tsx tests/components/PlanEmpresaCostoPorcentual.test.tsx -t "catálogo"`: 2 files, 4 passed, 14 skipped (los casos del catálogo; el resto monta `PlanDetalle`, T5.2).
- `pnpm run typecheck`: sin errores fuera de `PlanDetalle.tsx` y `tests/components/PlanForm*.test.tsx` (T5.2 y T3.4).
- `pnpm exec eslint` de los 6 archivos tocados: «No issues found», exit 0.

## Decisiones fuera del spec
- Al cerrar el panel tras guardar, además del aviso de R13, `router.refresh()`: sin releer, la sección «Borradores» no trae el borrador recién guardado y no se puede retomar (R30 paso 1).
- R13 se dispara solo si ESE panel guardó algún paso (`onBorradorGuardado`, design §4.6). Retomar una creación y cerrar sin guardar nada no avisa: `PlanForm` no avisa a quien lo monta de un «Descartar y empezar de nuevo», y avisar «queda guardado» de un borrador recién descartado sería falso.
- El aviso de «Borrador descartado.» / «Ese borrador ya no existe.» lo pinta `PlanesModule` (no la sección): tras releer sin borradores la sección desaparece y el aviso se perdería.
- Fallo al descartar: «No se pudo descartar el borrador. Inténtalo de nuevo.» (mismo texto que el panel, T3.3); `forbidden` usa «No tienes permiso para esto.». Título del diálogo «Descartar el borrador», botones «Descartar» y «Cancelar».
- «Cambio de <plan>»: nombre del catálogo por `planId`; si no está, el `nombre` del resumen.
- Columnas «Empezado por» y «Empezado el» se ocultan por debajo de `md`, como las secundarias del catálogo; la cabecera de acciones lleva «Acciones» solo para lectores de pantalla.
- Los tests de este archivo navegan con su propio `guardarHasta`/`terminar` («Guardar y continuar») en vez de `avanzarHasta`/`terminar` de `tests/components/plan-form-pasos.ts`, que aún pulsan «Siguiente» y los está adaptando T3.4 en paralelo.
- `tests/components/PlanFormVistaPreviaCustom.test.tsx` también monta `PlanesModule` con `crearPlan`: es de T3.4, no se tocó.

Veredicto: T5.1 hecha; `PlanesModule.test.tsx` 21/21 en verde, eslint limpio y typecheck sin errores propios.
