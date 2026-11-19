# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T2.1 y T3.1 (frontend_dev)

## Archivos
- NUEVO `app/(app)/plataforma/planes/_components/plan-form/borrador.ts`: `valoresDelPaso`, `formDelBorrador`, `pasoInicial`, `fechaHora`.
- `app/(app)/plataforma/planes/_components/plan-form/estado.ts`: `IdPasoGuardable`, `PASOS_QUE_SE_GUARDAN(modo)`.
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`: `fechaHora` ahora se importa de `plan-form/borrador` (se quita la privada y el import de `horaCostaRica`).
- `components/shared/FormularioPorPasos.tsx`: `elegibles`, `guardados`, `sinGuardar`, ✓ (`lucide-react` `Check`), «Sin guardar», `aria-label` «<título> (guardado)», `pasosElegibles(pasos, guardados)`. `visitados` sigue como alias opcional hasta que T3.2 pase `PlanForm` a `elegibles`.
- NUEVO `tests/unit/planes/plan-form-borrador.test.ts`; ampliado `tests/components/FormularioPorPasos.test.tsx`.
- `specs/SLT-144-planes-form-pasos-borrador/tasks.md`: T2.1 y T3.1 en [x].

## R → test
- R2 → `tests/unit/planes/plan-form-borrador.test.ts`: «R2: cada paso, ida y vuelta, al crear y al editar», «R2: General al crear, público y custom con empresa sin plan y con plan», «R2: General al editar es solo el nombre», «R2: los tres casos de vigencia», «R2: un paso sin guardar deja la base y los guardados van encima».
- R15 (`pasoInicial`) → mismo archivo: «R15: el primer paso sin guardar, o Revisar con todos guardados».
- R5 → `tests/components/FormularioPorPasos.test.tsx`: «R5: solo se elige un paso guardado o el que sigue a uno guardado», «R5: el paso actual se puede elegir aunque no sea elegible».
- R6 → mismo archivo: «R6: ✓ con su nombre accesible», «R6: un paso guardado que cambió pierde el ✓ y dice Sin guardar».

## Salida
- `vitest run` de los dos tests: 2 files, 18 passed.
- `vitest related --run` de los 4 archivos fuente: 25 files, 380 passed.
- `eslint` de los 6 archivos: exit 0, sin avisos.
- `pnpm run typecheck`: 2 errores, ninguno mío: `tests/integration/db/planes-cambio-por-empresa.test.ts(962)` TS1128 (T1.4 de backend_dev en curso). En la primera pasada había además `vistaPreviaCambio` ausente en los dobles de `IPlanesRepository` (T1.1 en curso); en la segunda ya no.

## Decisiones fuera del spec
- `pasoGuardado` y `marcaSinGuardar` (design §9) viven en `TEXTOS_FORMULARIO_POR_PASOS`, no en `plan-form/textos.ts`: los pinta el componente compartido, que no importa textos de planes.
- La regla de R5 se exporta como `pasosElegibles` desde `FormularioPorPasos` para probarla allí; `PlanForm` la usará en T3.2.
- `PASOS_QUE_SE_GUARDAN` es una función de `modo` (design §4.3 la escribe así).

Veredicto: T2.1 y T3.1 hechas y en verde; el typecheck solo falla en el trabajo de backend_dev en curso.
