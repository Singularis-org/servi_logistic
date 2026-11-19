# SLT-214 «Planes: beneficios de texto con ícono» — bitácora de implementación

## Tanda 1 (backend_dev): T1 y T2

### Archivos

Creados:
- `lib/planes/beneficios.ts`: catálogo de íconos, esquemas, `claveDelBeneficio` y `cambiosDeBeneficios` (design §3.1).
- `db/migrations/20261120120000_plan_beneficio/migration.sql` y `down.sql` (design §1.3).
- `tests/unit/planes/beneficios.test.ts`
- `tests/integration/db/plan-beneficio.test.ts` (solo R1 y R6; T3 añade R15, R17 y R18).
- `tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts`

Modificados:
- `db/schema.prisma`: modelo `PlanBeneficio` y `Plan.beneficios`.
- `lib/types/planes.ts`: `beneficios` opcional en `crearPlanSchema` y `edicionDelPlan`, y en `VersionPlan`, `PlanDTO` y
  `PlanVista`.
- `lib/db/modelos-de-negocio.ts` (fuera de la lista de `tasks.md`): `PlanBeneficio` en la lista de modelos de
  plataforma. Sin esto, la guardia `organizacion-en-modelos` queda en rojo.
- `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`: el control «ninguna migración posterior redefine
  la función» ahora mira solo las migraciones entre el origen y M (`c < M`). Antes miraba `c !== M`, y la
  `plan_de_la_empresa` de SLT-214 lo ponía en rojo aunque no cambia lo que repone ese `down.sql`.
- `tests/integration/db/orden-traspaso-migration.test.ts`: se declara la nueva migración en su lista de posteriores.
- `tests/integration/db/plan-de-la-empresa.test.ts`: la clave `beneficios` en la lista exacta de claves (R9 de SLT-58).

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R1 | `beneficios.test.ts` «R1: una lista vacía…», «R1: no hay tope…»; `plan-beneficio.test.ts` «R1: guarda una lista ordenada…» |
| R2 | `beneficios.test.ts` «R2: …extremos», «R2: un texto vacío…», «R2: admite 120…»; «crearPlanSchema: … los recorta» |
| R3 | `beneficios.test.ts` «SLT-214 R3 — el ícono del beneficio» (5 casos + sin ícono / claves de más) |
| R4 | `beneficios.test.ts` «compara sin mayúsculas…», «marca «Ya hay…»…», «editarPlanSchema y versionPlanSchema aplican R4» |
| R5 | `beneficios.test.ts` «ofrece exactamente los 12 íconos…» (el `aria-hidden` lo cubre T7) |
| R6 | `plan-beneficio.test.ts` «R6: los CHECK rechazan…», «R6: servi_app no lee ni escribe…», «R6: la empresa ve los beneficios solo por plan_de_la_empresa…»; `migracion-plan-beneficio-ida-y-vuelta.test.ts` «R6: subir crea plan_beneficio…» |
| R7 (CHECK de pasos) | `migracion-plan-beneficio-ida-y-vuelta.test.ts` «R7: el borrador admite el paso `beneficios`…» |
| R18 | `beneficios.test.ts` «R18: una versión sin `beneficios` sigue validando…»; ida y vuelta «R18, R23: los del plan en orden; la versión propia sin `beneficios`…» |
| R23 (SQL) | ida y vuelta «R18, R23: …»; `plan-beneficio.test.ts` «R6: la empresa ve los beneficios solo por plan_de_la_empresa…» |
| R25 (las tres formas de línea) | `beneficios.test.ts` «SLT-214 R25 — cambiosDeBeneficios» (6 casos). `lineasDeCambioDelPlan` es de T6 |

### Salida real

- `pnpm run typecheck` (tsc --noEmit): sin errores, rc 0.
- `pnpm exec eslint <los 9 .ts tocados>`: «No issues found», rc 0.
- `pnpm exec vitest run --no-file-parallelism tests/unit/planes/beneficios.test.ts tests/integration/db/plan-beneficio.test.ts tests/integration/db/migracion-plan-beneficio-ida-y-vuelta.test.ts tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`:
  `Test Files  4 passed (4)` / `Tests  54 passed (54)`.
- Los que tocan `plan_de_la_empresa` o `plan_borrador` (`grep -rl` en `tests/integration/db`), con `--no-file-parallelism`: `Test Files  21 passed`, y 2 rojos que se arreglaron arriba
  (`orden-traspaso-migration`, `plan-de-la-empresa`). Al volver a correrlos: `Test Files  2 passed (2)` / `Tests  22 passed (22)`.
- Los otros 8 tests que nombran las últimas migraciones de dev: `Test Files  8 passed (8)` / `Tests  112 passed (112)`.
- `tests/unit/planes` y `tests/unit/types`: `Test Files  117 passed (117)` / `Tests  2217 passed (2217)`.
- `pnpm run test:guardias`: `Test Files  360 passed (360)` / `Tests  5405 passed | 1 skipped (5406)`.
- La migración está aplicada con `prisma migrate deploy` en `servi_logistic_slt214` y `servi_logistic_slt214_e2e`, y el cliente está regenerado.

Veredicto: T1 y T2 en verde. Un archivo de producción de más (`lib/db/modelos-de-negocio.ts`), que pide la guardia.

## Tanda 2 (backend_dev): T3, T4, T5 y T6

### Archivos

Producción (todos en la lista de `tasks.md`):
- `lib/repositories/PlanesRepository.ts` (T3): `INCLUIR` con `beneficios` por `posicion`; `aDTO` los valida con
  `iconoDeBeneficioSchema`; `crearEnTx` los crea con la posición como índice y los pone en `creado`; `aplicarVersion`
  reemplaza la lista solo si la versión trae `beneficios` (R17, R18); `versionDelPlan` los añade.
- `lib/planes/rastro.ts` (T3): `"beneficios"` en `CampoDelPlan` y `CAMPOS` tras `modulos`; `planCanonico` los copia en
  orden; el alta sin beneficios omite la clave.
- `lib/planes/beneficios.ts` (T1, retocado): exporta `iconoDeBeneficioSchema` (lo usan `beneficioSchema` y `aDTO`).
- `lib/types/plan-borrador.ts`, `lib/planes/borrador.ts` (T4): paso `beneficios` en las tuplas, esquemas, uniones,
  `ValoresDeBeneficios`, `PasosDeCrear` y las dos peticiones.
- `lib/repositories/MiPlanRepository.ts`, `lib/planes/consumo.ts`, `lib/types/consumo-plan.ts`,
  `lib/services/MiPlanCambioService.ts` (T5): `beneficios` en la fila de `plan_de_la_empresa`, en `vigente`, en
  `PlanConConsumo` y en `vista`.
- `lib/planes/mensajes.ts` (T6): `CambioDelPlanParaCorreo.beneficios` y sus líneas tras los módulos.

Tests nuevos o ampliados (en la lista): `beneficios.test.ts` (T6), `rastro.test.ts` (R19), `plan-borrador-schema.test.ts`
(T4), `mi-plan-cambio-service.test.ts` (R24), `plan-beneficio.test.ts` (R15, R17, R18), `plan-borrador-confirmar.test.ts`
(R12, R15, R16; sus ayudantes guardan el paso nuevo), `mi-plan-repository.test.ts` (R23, R18; `beneficios: []` en el
`vigente` exacto), `planes-version-por-empresa.test.ts` (R16).

Tests adaptados FUERA de la lista de `tasks.md` (rompían por el cambio, sin tocar lo que prueban):
- `tests/unit/planes/plan-borrador.test.ts`: los pasos esperados y las peticiones llevan `beneficios`.
- `tests/unit/services/plan-borrador-service.test.ts`: el borrador completo del doble lleva el paso `beneficios`.
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: la fila falsa de `plan` lleva `beneficios: []`.
- `tests/components/ConsumoDelPlan.test.tsx`: el `PlanConConsumo` del doble lleva `beneficios: []` (solo tipo).

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R7 (tuplas) | `plan-borrador-schema.test.ts` «R7: va justo después de «Módulos»…»; `plan-borrador.test.ts` «los pasos de cada modo» |
| R10 | `plan-borrador-schema.test.ts` «R9, R10 (crear/editar)…», «R2–R4 (crear/editar): cada error en `beneficios.<i>.<campo>`…», «R3 (crear/editar)…», «R10: guardar el paso en los dos modos…» |
| R12 | `plan-borrador-confirmar.test.ts` «SLT-214 R12: un borrador sin el paso «Beneficios» da pasos_pendientes…» |
| R15 | `plan-beneficio.test.ts` «R15: crear con 3 beneficios los guarda y los lee en su orden…»; `plan-borrador-confirmar.test.ts` «SLT-214 R15: confirmar la creación…» |
| R16 | `plan-borrador-confirmar.test.ts` «SLT-214 R16: confirmar la edición deja los beneficios en la versión programada…»; `planes-version-por-empresa.test.ts` «SLT-214 R16: con el cambio a medias, la que lo recibió ve los beneficios nuevos…» |
| R17 | `plan-beneficio.test.ts` «R17: promover el cambio deja la lista del plan igual a la de la versión…» |
| R18 | `plan-beneficio.test.ts` «R18: una versión programada sin `beneficios`…»; `mi-plan-repository.test.ts` «R18: una versión propia sin `beneficios`…»; `rastro.test.ts` «la misma lista no es un cambio, y una versión sin `beneficios`…» |
| R19 | `rastro.test.ts` «SLT-214 R19 — los beneficios en diferenciasDelPlan» (alta sin/con, edición por texto, ícono, orden, quitar, agregar, vaciar); `plan-beneficio.test.ts` R17 (filas `creado`, `cambio_programado`, `cambio_aplicado`) |
| R23 | `mi-plan-repository.test.ts` «R23: sin versión propia, los del plan…», «R23: con una versión propia…», «R23: una versión propia con la lista vacía…» |
| R24 | `mi-plan-cambio-service.test.ts` «SLT-214 R24: cada plan de la lista y el custom activo llevan sus beneficios…» |
| R25 | `beneficios.test.ts` «SLT-214 R25 — lineasDeCambioDelPlan con los beneficios» (agrega/quita tras los módulos, solo íconos u orden, sin cambio) |

### Salida real

- `pnpm exec tsc --noEmit`: rc 2, con 4 errores, todos en `app/` y de T8 (frontend):
  `plan-form/usar-borrador.ts` (134, 140, 156) y `PlanForm.tsx` (250). `IdPasoGuardable` del formulario no tiene
  `beneficios` hasta que T8 añada el paso a `estado.ts`. Ningún error en `lib/` ni en `tests/`.
- `pnpm exec eslint` sobre los 22 archivos tocados: sin problemas, rc 0.
- Unit tocados (`beneficios`, `rastro`, `plan-borrador`, `plan-borrador-schema`, `mi-plan-cambio-service`,
  `plan-borrador-service`, `planes-repository-tipo-cobro`, `ConsumoDelPlan`): `Test Files  8 passed (8)` / `Tests  181 passed (181)`.
- Integración nuevos/ampliados, `--no-file-parallelism`: `Test Files  4 passed (4)` / `Tests  34 passed (34)`.
- Integración que importa lo tocado (63 archivos, `--no-file-parallelism`): `Test Files  1 failed | 62 passed (63)` /
  `Tests  791 passed | 14 skipped (805)`. El rojo es `demo-qa.test.ts`: «faltan catálogos en la base (… `pnpm run
  db:seed`): vehiculo» — la base desechable no tiene el seed; no lo toca este cambio.
- Unit y componentes que importan lo tocado (49 archivos): tras los arreglos de arriba, el único rojo que queda es
  `PlanesModule.test.tsx` (1), que recorre el formulario.
- Componentes del formulario de planes: `Test Files  10 failed | 14 passed (24)` / `Tests  62 failed`
  (`PlanForm*`, `PlanDetalle`, `PlanesModule`). Todos recorren los pasos: esperan el paso «Beneficios» que pone T8 y
  los ayudantes de T10 (`plan-form-pasos.ts`). Son de frontend_dev.
- `pnpm run test:guardias`: `Test Files  1 failed | 359 passed (360)`. El rojo es `superficie-de-uso`:
  `components/shared/planes/BeneficiosDelPlan.tsx` (T7) aún no lo monta nadie; lo montan T9 o una anotación.

Veredicto: T3–T6 en verde en `lib/` y sus tests; el typecheck de `app/`, los tests del formulario y la guardia de
superficie quedan en rojo hasta T7–T10 (frontend).

## Tanda 3 (frontend_dev): T8 y T10

### Archivos

Producción (en la lista de `tasks.md`, todos en `app/(app)/plataforma/planes/_components/`):
- `plan-form/PasoBeneficios.tsx` (nuevo, T8): la lista editable. Cada fila: `Select` «Ícono del beneficio n» con el
  ícono y el nombre de R5 en cada opción, `Input` «Texto del beneficio n» con `maxLength` 120, y «Subir / Bajar /
  Quitar beneficio n» (subir deshabilitado en la primera, bajar en la última). «Agregar beneficio» añade
  `{ icono: "check", texto: "" }` al final y lleva el foco a su texto. Vacío: «Este plan no tiene beneficios.».
  Mover o quitar descarta los errores `beneficios.*`, que son por posición.
- `plan-form/estado.ts`: `Formulario.beneficios` (con `clave` local para el `key`), `inicial` desde
  `plan.beneficios`, `versionDe` (sin la clave y con el texto recortado), `camposEnOrden` (`beneficios.<i>.icono` y
  `.texto` tras `modulos`), `IdPaso` y `pasosDe` (tras «Módulos») y `pasoDeLaClave`.
- `plan-form/borrador.ts`: `valoresDelPaso("beneficios")` y `formDelBorrador` con claves locales nuevas.
- `plan-form/textos.ts`: los textos de design §6 del paso.
- `plan-form/PasoRevisar.tsx`: fila «Beneficios» con `ListaDeBeneficios` (vacío: «Sin beneficios»). Al crear, siempre,
  tras «Módulos»; al editar, solo si cambian, como «antes → después» y antes de la fila de cuándo rige.
- `PlanForm.tsx`: monta `PasoBeneficios` en `case "beneficios"`. Con `IdPasoGuardable` ya con `beneficios`, los 4
  errores de typecheck heredados (`usar-borrador.ts` 134, 140, 156 y `PlanForm.tsx` 250) desaparecen sin tocar
  `usar-borrador.ts`.

Producción FUERA de la lista:
- `components/ui/select.tsx`: `SelectOption.icon?: ReactNode`, opcional y aditivo, que pinta un ícono decorativo
  delante de la etiqueta en la lista. Lo pide design §4.3 («en cada opción pinta el ícono y el nombre»); sin él, la
  opción es la de siempre (`Select.test.tsx` y los 375 archivos que la importan, en verde).

Tests (en la lista): `PlanFormBeneficios.test.tsx` (nuevo), `PlanFormPasos.test.tsx`, `plan-form-borrador.test.ts`,
`PlanFormBorrador.test.tsx` (contadores 6/7 y R11 al retomar), `plan-form-pasos.ts` (solo el comentario del tope de
vueltas: `accionesFalsas`, `avanzarHasta` y `terminar` ya pasan por el paso nuevo con la lista vacía),
`PlanesModule.test.tsx` y `PlanDetalle.test.tsx` (solo la lista de pasos de su «R6: el panel abre el formulario por
pasos»), y los cuatro E2E (`planes-borrador`: pasa por «Beneficios» y contadores 0/3/6 de 6 al crear y 0/4/7 de 7 al
editar; `planes-superadmin`, `planes-costeo` y `planes-costo-porcentual`: un `siguiente(…, "Beneficios")` tras
«Módulos»). Ninguna aserción de carga útil de los E2E cambia.

Tests FUERA de la lista (rompían solo por el paso nuevo):
- `tests/components/PlanForm.test.tsx`: las 3 peticiones exactas llevan `beneficios: []` (el borrador lo manda
  siempre, design §3.2 y `peticionDeCrear`/`peticionDeEditar` de T4).
- `tests/components/PlanFormRevisar.test.tsx`: la fila `["Beneficios", "Sin beneficios"]` al final de R22.

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R5 (selector) | `PlanFormBeneficios.test.tsx` «R5: el selector ofrece los 12 íconos, en orden y con su nombre; cada ícono es decorativo» |
| R7 | `PlanFormPasos.test.tsx` «R7: pasos al crear», «R7: pasos al editar»; `plan-form-borrador.test.ts` «R7: los pasos que se guardan…»; `PlanesModule.test.tsx` y `PlanDetalle.test.tsx` «R6: el panel abre el formulario por pasos» |
| R8 | `PlanFormBeneficios.test.tsx` «R8: agregar al final con «Check» y el foco en el texto, escribir, elegir ícono, subir, bajar y quitar» (incluye el orden que llega a la petición confirmada) |
| R9 | `PlanFormBeneficios.test.tsx` «R9: la lista vacía lo dice y deja guardar y continuar», «R9: quitar el último beneficio…»; `plan-form-borrador.test.ts` «R9, R11: la lista vacía también va y vuelve» |
| R10 | `PlanFormBeneficios.test.tsx` «R10: un texto vacío y uno repetido marcan su campo y no avanzan ni guardan», «R10: un error del servidor en `beneficios.<i>.texto` va bajo su campo», «R2: el texto admite hasta 120 caracteres en el campo» |
| R11 | `plan-form-borrador.test.ts` «R11: ida y vuelta en los dos modos…», «R11: un borrador guardado con beneficios pisa los del plan…»; `PlanFormBorrador.test.tsx` «SLT-214 R11: retomar un cambio con el paso «Beneficios» guardado lo muestra tal cual» |
| R13 | `PlanFormBeneficios.test.tsx` «R13: el paso abre con los beneficios vigentes del plan…», «R13: sin tocarlos, se programan los mismos»; `plan-form-borrador.test.ts` «R13: al crear, sin beneficios…» |
| R14 | `PlanFormBeneficios.test.tsx` «R14: al crear lista los beneficios en orden y con su ícono», «R14: al editar, si cambian, «antes → después»; si no, no hay fila», «R14: un plan que se queda sin beneficios dice «Sin beneficios» después»; `PlanFormRevisar.test.tsx` «R22: al crear lista los valores finales» |

### Salida real

- `pnpm run typecheck` (tsc --noEmit): sin errores, rc 0.
- `pnpm exec eslint` sobre los 20 archivos tocados (incluidos los 4 E2E): «No issues found», rc 0.
- `pnpm exec vitest run tests/components/PlanFormBeneficios.test.tsx tests/components/PlanFormBorrador.test.tsx`:
  `Test Files  2 passed (2)` / `Tests  38 passed (38)`.
- `pnpm exec vitest related --run` sobre los 8 archivos de producción y el ayudante (arrastra todo lo que importa
  `components/ui/select.tsx`): `Test Files  3 failed | 375 passed | 42 skipped (420)` /
  `Tests  3 failed | 5833 passed | 326 skipped (6162)`. Los 3 rojos:
  - `PlanesModule.test.tsx` y `PlanDetalle.test.tsx` «R6: el panel abre el formulario por pasos»: esperaban la lista
    de pasos sin «Beneficios»; arreglados arriba.
  - `RecoleccionModule.test.tsx` «vista DETALLE: las mismas secciones siguen encendidas tras conmutar»: no encontró
    «Ver en el mapa» con la máquina cargada (la corrida duró 22 min); solo, pasa.
- Revalidación: `pnpm exec vitest run` de `RecoleccionModule`, `PlanesModule`, `PlanDetalle`, `tests/components/PlanForm*`,
  `plan-form-borrador`, `plan-form-revision` y `Select`: `Test Files  18 passed (18)` / `Tests  334 passed (334)`.
- `pnpm run test:guardias`: `Test Files  357 passed | 3 skipped (360)` / `Tests  5380 passed | 28 skipped (5408)`.
  `superficie-de-uso` ya está en verde: `BeneficiosDelPlan` lo montan `PasoBeneficios` y `PasoRevisar`.
- E2E: no se corren en local por indicación del leader; se verifican en CI.

Veredicto: T8 y T10 en verde (typecheck, lint, tests del formulario y guardias); un archivo de producción fuera de
la lista (`components/ui/select.tsx`, aditivo) y dos tests fuera de la lista ajustados solo por el paso nuevo.

## Tanda 4 (frontend_dev): T9

### Archivos

Producción (todos en la lista de `tasks.md`):
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`: columna «Beneficios» tras «Topes», con `SOLO_DESDE_MD`,
  `ListaDeBeneficios plegable={3}` y «Sin beneficios» (R20, R21).
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`: `Dato` «Beneficios» tras «Módulos incluidos»
  con la lista completa y «Sin beneficios» (R22); `lineasDelRastro` pinta el alta «Beneficios: t1, t2, …» y pasa
  `beneficios` de una edición a `lineasDeCambioDelPlan` (R19, R25).
- `app/(app)/mi-plan/_components/PlanActivo.tsx`: bloque «Beneficios» tras los módulos, con la lista completa; sin
  beneficios no se pinta (R23).
- `components/shared/planes/CarruselDePlanes.tsx`: `ListaDeBeneficios plegable={3}` tras `ListaDeModulos` en
  `TarjetaDePlan`, en un contenedor `relative z-10` sobre el botón del plan; sin beneficios no se pinta (R21, R24).

Ninguna página server ni mapeo cambia: `PlanDelCatalogo`, `DetallePlan.plan`, `PlanConConsumo` y `PlanVista` ya traen
`beneficios` desde `lib/` (T3, T5). Nada fuera de la lista.

Tests (en la lista): `PlanesModule.test.tsx` (nuevo bloque SLT-214; la fila exacta de R13 lleva la celda «Sin
beneficios» y el caso de `md` incluye la columna nueva), `PlanDetalle.test.tsx`, `MiPlanModule.test.tsx` y
`MiPlanCambioDePlan.test.tsx` (bloques nuevos).

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R19 (vista) | `PlanDetalle.test.tsx` «R19: un alta con beneficios pinta «Beneficios: t1, t2, …» en orden», «R19: un alta sin beneficios (sin la clave) no pinta la línea», «R19, R25: una edición pinta «Se agrega» y «Se quita», tras los módulos», «R19, R25: una edición que solo cambia íconos u orden pinta una sola línea» |
| R20 | `PlanesModule.test.tsx` «R20: la columna va después de «Topes»; cada fila muestra los 3 primeros…», «R20: sin beneficios, la celda dice «Sin beneficios»»; «R13: una fila por plan…» (celda exacta) |
| R21 | `PlanesModule.test.tsx` «R21: con 3 o menos no hay «Mostrar más»…», «R21: «Mostrar más» despliega todos en su fila…», «R21: cada fila se despliega por su cuenta»; `MiPlanCambioDePlan.test.tsx` «R21, R24: «Mostrar más» despliega la tarjeta sola y no selecciona el plan…» |
| R22 | `PlanDetalle.test.tsx` «R22: todos, con su ícono y en orden, después de «Módulos incluidos»…», «R22: sin beneficios dice «Sin beneficios»» |
| R23 | `MiPlanModule.test.tsx` «R23: todos los de la versión que corre la empresa…», «R23: sin beneficios no hay sección…», «R18, R23: una versión sin la clave `beneficios`…» |
| R24 | `MiPlanCambioDePlan.test.tsx` «R24: cada tarjeta, también la del plan activo, muestra los 3 primeros…», «R24: el custom activo también muestra sus beneficios», «R21, R24: …no selecciona el plan…» |
| R25 (Mi plan) | `MiPlanModule.test.tsx` «R25: «Se agrega: …» y «Se quita: …» por cada beneficio…», «R25: si solo cambian íconos u orden, sale una sola línea» |

### Salida real

- `pnpm run typecheck` (tsc --noEmit): sin errores, rc 0.
- `pnpm exec eslint` sobre los 8 archivos tocados: sin salida, rc 0.
- `pnpm exec vitest run` de `PlanesModule`, `PlanDetalle`, `MiPlanModule` y `MiPlanCambioDePlan`:
  `Test Files  4 passed (4)` / `Tests  108 passed (108)`.
- `pnpm exec vitest related --run` sobre los 4 archivos de producción: `Test Files  13 passed (13)` /
  `Tests  225 passed (225)`.
- `pnpm run test:guardias`: `Test Files  357 passed | 3 skipped (360)` / `Tests  5380 passed | 28 skipped (5408)`.
- Archivos en LF (0 `\r` en los 8). E2E no corridos (T11, por indicación del leader).

Veredicto: T9 en verde (typecheck, lint, los 4 tests, related y guardias), sin archivos fuera de la lista.

## Tanda 5: T11

### Archivos

Creados:
- `e2e/planes-beneficios.spec.ts` (R26): dos casos en serie, con el estilo, el login por OTP, `crearEmpresaE2E`,
  `PlanesRepository.asignar` y los ayudantes de pasos de `e2e/planes-borrador.spec.ts`. Sufijo aleatorio en todo y
  archiva al final el plan público que crea.

Modificados:
- `playwright.config.ts`: `planes-beneficios` en el proyecto `aislamiento`, tras `planes-borrador` (cada spec debe
  nombrarse en un proyecto; un archivo sin nombrar no corre).

### R<n> → test (esta tanda)

| R | Test |
|---|---|
| R26.1–R26.3 | `planes-beneficios.spec.ts` «R26: crear un plan con 4 beneficios, verlos en el listado con «Mostrar más» y en el detalle, en orden» |
| R26.4 | `planes-beneficios.spec.ts` «R26: editar los beneficios programa el cambio con su fecha sin cambiar todavía los del plan» |

### Salida real

- `pnpm run typecheck` (tsc --noEmit): sin errores, rc 0.
- `pnpm exec eslint e2e/planes-beneficios.spec.ts playwright.config.ts`: «No issues found», rc 0.
- `pnpm exec playwright test --list e2e/planes-beneficios.spec.ts`: los 2 casos en `[aislamiento]`, más los 10 de
  `plataforma-vacia` que arrastra (`Total: 12 tests in 3 files`).
- `pnpm run test:guardias`: `Test Files  357 passed | 3 skipped (360)` / `Tests  5380 passed | 28 skipped (5408)`, rc 0.
- Archivo en LF.
- **El E2E NO se corrió en local**: falta de memoria, por orden del leader. Se verifica en el CI del PR. El «Hecho»
  de T11 (en verde en local, más los cuatro E2E de planes y `mi-plan-cambiar-plan`) queda pendiente de ese CI.

Veredicto: T11 escrito, tipado, lint y guardias en verde; su ejecución queda para el CI del PR.

## T7 (frontend_dev, en paralelo a la tanda 2)

- `components/shared/planes/BeneficiosDelPlan.tsx` (`IconoDeBeneficio`, `ListaDeBeneficios` con `plegable`, `vacio`
  y `textos`; esta última no está en design §4.2, se añadió para poder sustituir los rótulos).
- `tests/components/BeneficiosDelPlan.test.tsx`: R5 (ícono `aria-hidden`, los 12 íconos), R21 (sin botón con ≤3,
  «Mostrar más»/«Mostrar menos» con `aria-expanded`, cada lista por su cuenta), «Sin beneficios» opcional.
- Salida: `vitest run` 1 archivo, `Tests 7 passed (7)`; eslint rc 0; typecheck rc 0.

## Cierre (implementer)

### Mapa consolidado R<n> → test

| R | Test(s) |
|---|---|
| R1 | `tests/unit/planes/beneficios.test.ts`; `tests/integration/db/plan-beneficio.test.ts` «R1» |
| R2 | `beneficios.test.ts` (recorte, vacío, 120/121); `PlanFormBeneficios.test.tsx` «R2: 120 caracteres» |
| R3 | `beneficios.test.ts` «R3»; `plan-borrador-schema.test.ts` (los dos modos) |
| R4 | `beneficios.test.ts` (mayúsculas, tildes, espacios; error en `<j>.texto`) |
| R5 | `beneficios.test.ts` (12 íconos, orden, nombres); `BeneficiosDelPlan.test.tsx` «R5»; `PlanFormBeneficios.test.tsx` «R5» |
| R6 | `plan-beneficio.test.ts` (CHECK, `servi_app` 42501); `migracion-plan-beneficio-ida-y-vuelta.test.ts` (RLS) |
| R7 | ida y vuelta «R7» (CHECK); `plan-borrador-schema.test.ts` «R7»; `PlanFormPasos.test.tsx` «R7»; `plan-form-borrador.test.ts` «R7» |
| R8 | `PlanFormBeneficios.test.tsx` «R8» |
| R9 | `PlanFormBeneficios.test.tsx` «R9» (2); `plan-form-borrador.test.ts` «R9, R11» |
| R10 | `PlanFormBeneficios.test.tsx` «R10» (2); `plan-borrador-schema.test.ts` |
| R11 | `plan-form-borrador.test.ts` «R11» (2); `PlanFormBorrador.test.tsx` «SLT-214 R11» |
| R12 | `plan-borrador-confirmar.test.ts` «SLT-214 R12» |
| R13 | `PlanFormBeneficios.test.tsx` «R13» (2); `plan-form-borrador.test.ts` «R13» |
| R14 | `PlanFormBeneficios.test.tsx` «R14» (3); `PlanFormRevisar.test.tsx` «R22: al crear…» |
| R15 | `plan-beneficio.test.ts` «R15»; `plan-borrador-confirmar.test.ts` «SLT-214 R15» |
| R16 | `plan-borrador-confirmar.test.ts` «SLT-214 R16»; `planes-version-por-empresa.test.ts` «SLT-214 R16» |
| R17 | `plan-beneficio.test.ts` «R17» |
| R18 | `beneficios.test.ts` «R18»; `plan-beneficio.test.ts` «R18»; `mi-plan-repository.test.ts` «R18»; `rastro.test.ts`; `MiPlanModule.test.tsx` |
| R19 | `rastro.test.ts` «SLT-214 R19»; `PlanDetalle.test.tsx` (líneas del rastro) |
| R20 | `PlanesModule.test.tsx` «R20» |
| R21 | `BeneficiosDelPlan.test.tsx` «R21»; `PlanesModule.test.tsx`; `MiPlanCambioDePlan.test.tsx` |
| R22 | `PlanDetalle.test.tsx` «R22» |
| R23 | `mi-plan-repository.test.ts` (3); `MiPlanModule.test.tsx` «R23»; ida y vuelta «R18, R23» |
| R24 | `mi-plan-cambio-service.test.ts` «SLT-214 R24»; `MiPlanCambioDePlan.test.tsx` «R24» (y «Mostrar más» no selecciona) |
| R25 | `beneficios.test.ts` «SLT-214 R25» (con `lineasDeCambioDelPlan`); `MiPlanModule.test.tsx` «R25» |
| R26 | `e2e/planes-beneficios.spec.ts` (2 casos) — pendiente de CI |

Ningún R sin test.

### Archivos fuera de la lista de `tasks.md`

- Producción: `lib/db/modelos-de-negocio.ts` (guardia `organizacion-en-modelos`), `components/ui/select.tsx`
  (campo opcional `icon`), `playwright.config.ts` (registra el spec en `aislamiento`).
- Tests adaptados solo por el paso o la clave nueva: `migracion-slt128-ida-y-vuelta`, `orden-traspaso-migration`,
  `plan-de-la-empresa`, `plan-borrador`, `plan-borrador-service`, `planes-repository-tipo-cobro`,
  `ConsumoDelPlan`, `PlanForm`, `PlanFormRevisar`.

### Decisión a revisar (reviewer)

En «Revisar», al editar, la fila «Beneficios» solo sale si cambian («antes → después»), igual que las demás filas.
Al crear sale siempre. R14 no precisa el caso de edición.

### Entorno y verificación

- Bases desechables `servi_logistic_slt214` (integración) y `servi_logistic_slt214_e2e`, migradas y con
  `pnpm run db:seed`. `demo-qa.test.ts` caía solo por falta de seed; tras el seed: `Tests 14 passed (14)`.
- E2E (`planes-beneficios` y los cuatro de planes adaptados): NO corridos en local por falta de memoria, por orden
  del leader; se verifican en el CI del PR #245.
- `next build` no corrido en local (misma razón); lo cubre CI.
- Rojo CI `planes.composition-root.test.ts` (`TypeError ... reading 'map'`): la fila falsa de Prisma no traía `beneficios` (producción la trae siempre por el `include`). Arreglo solo en el test: `beneficios: []` en `filaPlan` y en el DTO esperado. Vitest de los 42 archivos unitarios que usan `PlanesRepository` (sin guardias estáticas): `Test Files 42 passed (42) / Tests 1056 passed (1056)`; eslint del archivo: `No issues found`.
