# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T3.4 (frontend_dev)

## Archivos
- `tests/components/plan-form-pasos.ts` (ya existía de SLT-130; se amplía):
  - `accionesFalsas(enviar)`: las cuatro actions como `vi.fn` sobre un borrador en memoria. `guardarPaso` valida con `ESQUEMAS_DE_CREAR/EDITAR` del paso, como el servidor, y guarda el valor parseado. `confirmar` responde `pasos_pendientes` si falta algún paso; si no, llama a `enviar(peticionConfirmada(acciones))` y devuelve lo que responda (o lanza si `enviar` lanza).
  - `peticionConfirmada(acciones)`: `peticionDeCrear` / `peticionDeEditar` de `lib/planes/borrador.ts`.
  - `previsualizarCambioFalso()`: responde `{ estado: "ok", empresas: [], avisos: [] }`.
  - `conBorrador(enviar)` y `conBorradorDeCambio(enviar)`: props para montar `PlanForm` (este último añade `previsualizarCambio`).
  - `botonDeLaLista(titulo)`: encuentra el paso de la lista con o sin la marca «(guardado)».
  - `avanzarHasta` y `terminar` pulsan «Guardar y continuar» y esperan a que el guardado termine (sin `aria-busy`).
- `tests/components/PlanForm.test.tsx`, `PlanFormCosteo`, `PlanFormCostoPorcentual`, `PlanFormCustomAsigna`, `PlanFormPeriodicidad`, `PlanFormVistaPreviaCustom`, `PlanFormDescuentos`, `PlanFormPasos`, `PlanFormRevisar`:
  - `enviar={…}` pasa a `{...conBorrador(…)}` al crear y a `{...conBorradorDeCambio(…)}` al editar;
  - «Siguiente» pasa a «Guardar y continuar»;
  - el botón del paso en la lista pasa a `botonDeLaLista`;
  - `PlanFormVistaPreviaCustom` (D12) monta `PlanesModule` con `borradores={[]}` y `borrador={accionesFalsas(crearPlan)}`, porque T5.1 ya quitó `crearPlan`.

  El `enviar` de cada test sigue siendo el doble que recibe la petición, así que ninguna aserción de carga útil cambia.

## R → test
T3.4 no añade requisitos. Adapta los tests de SLT-58, SLT-66, SLT-83, SLT-86, SLT-118 y SLT-130 al borrador (design §11).

## Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run` de los 9 archivos: 9 archivos, 112 casos. Pasan 110 y fallan 2 (abajo).
- `pnpm exec eslint` del helper y los 9 archivos: «No issues found», exit 0.
- `pnpm run typecheck`: un único error, en `PlanDetalle.tsx` (`enviar`, de T5). Ninguno en los archivos de esta task.
- `git diff -U0 -- <los 10 archivos> | grep toHaveBeenCalledWith`: sin salida (exit 1).

## Casos que no pasan sin cambiar una aserción (no tocados)
1. `PlanForm.test.tsx` «“Crear plan” se deshabilita mientras la petición está en vuelo»: tras `resolver(OK)` espera `toBeEnabled()`. Con SLT-144 un `ok` de confirmar deja el formulario en vuelo hasta que el host lo desmonta (design §4.4; review m4 de SLT-129). El botón ya no se vuelve a habilitar.
2. `PlanFormPeriodicidad.test.tsx` «R35: al crear manda quincenal si no se toca y la elegida si se cambia»: después del primer `ok`, vuelve a la lista, cambia la periodicidad y confirma otra vez. Hoy no se puede: tras el `ok` todo queda deshabilitado (§4.4), y además el paso cambiado quedaría «Sin guardar» (R6).

Hace falta una decisión: partir el caso o cambiar su última aserción.

## Decisiones fuera del spec
- El `confirmar` falso llama al `enviar` del test con la petición reconstruida. Así las aserciones `expect(enviar)…` de hoy no cambian; la design (§11) habla de comparar con `peticionConfirmada(acciones)`, que es lo que recibe `enviar`.
- `botonDeLaLista`: con R6 el nombre accesible de un paso guardado es «<título> (guardado)». Las búsquedas por nombre exacto en la lista dejaban de encontrarlo; se cambian consultas, no aserciones.

Veredicto: T3.4 casi hecha. Hay 110 de 112 en verde; los 2 rojos chocan con design §4.4 y necesitan una decisión. T3.4 sigue en [ ].

## Cierre
Decisión aplicada a los dos rojos (design §4.4):
1. `PlanForm.test.tsx` «“Crear plan” se deshabilita mientras la petición está en vuelo»: tras `resolver(OK)` la aserción pasa de `toBeEnabled()` a `toBeDisabled()`, con comentario que cita §4.4. El caso no tenía rama de rechazo; no se añade (fuera del encargo).
2. `PlanFormPeriodicidad.test.tsx` «R35: al crear manda quincenal si no se toca y la elegida si se cambia»: partido en «R35: al crear manda quincenal si no se toca» y «R35: al crear manda la elegida si se cambia», cada uno con su montaje. El segundo cambia a «Mensual» en «Cobro por orden» antes de terminar. Las aserciones de carga útil siguen siendo `periodicidadOrdenes` `quincenal` / `mensual`; la segunda pasa de `mock.calls[1]` con `toHaveBeenCalledTimes(2)` a `mock.calls[0]` con `toHaveBeenCalledTimes(1)`, porque ahora es el primer envío de su montaje. `irAlPaso` y el import de `botonDeLaLista` quedaron sin uso y se quitan.

Salida:
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run` de los 9 archivos: `Test Files 9 passed (9)`, `Tests 113 passed (113)` (Duration 88.85s).
- `pnpm exec eslint tests/components/PlanForm.test.tsx tests/components/PlanFormPeriodicidad.test.tsx`: «ESLint: No issues found», exit 0.
- `git diff -U0 -- tests/components/PlanForm*.test.tsx | grep -n toHaveBeenCalledWith`: sin salida, exit 1. Ningún caso tocado usa `toHaveBeenCalledWith`.

Veredicto: T3.4 hecha; 113/113 verdes en los 9 archivos, [x] en tasks.md.
