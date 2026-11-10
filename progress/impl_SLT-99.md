# SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan» · implementación

## Tanda 1 · T0–T4 backend (2026-11-09, backend_dev)

### Cambios
- **T0** (`d93efe1a`): P10 movida a `requirements.md > Decisiones cerradas` («Preguntas abiertas: Ninguna.»); `design.md` §8 y la cabecera, y T0.3 en `tasks.md`. Va con la línea de P10 de `progress/features/SLT-99.md > Decisiones`.
- **T1** (`7d0e8d5e`): `tests/unit/planes/proximo-periodo-de-cobro.test.ts`. Sin código: el corte es `fechaDeEfectoPorDefecto(tipoVigente, ahora)`.
- **T2** (`b6fd9f37`):
  - `lib/planes/costo-concreto.ts`: `esPlanDisponible`.
  - `lib/types/planes.ts`: `PlanVista` y los tres `*Result` de §4.
  - `lib/interfaces/repositories/IPlanesRepository.ts`: `EmpresaParaElMaestro`, `ResultadoCambioDelMaestro`, `ResultadoCancelarDelMaestro` e `IPlanesDelMaestroRepository`.
  - `lib/repositories/PlanesRepository.ts`: `empresaParaElMaestro`, `cambiarPlanPorLaEmpresa` y `cancelarCambioPorLaEmpresa`.
  - `lib/db/excepciones-aislamiento.ts`: se amplía el `motivo`.
  - `tests/integration/db/mi-plan-cambiar-plan.test.ts`.
- **T3** (`a1b9a478`):
  - `lib/interfaces/services/IMiPlanCambioService.ts` y `lib/services/MiPlanCambioService.ts`.
  - `lib/planes/mensajes.ts`: `NOMBRES_DEL_TOPE`, `lineaTopeSobra` y `mensajeTopesSobran`.
  - `tests/unit/services/mi-plan-cambio-service.test.ts`.
  - `tests/unit/planes/planes-vista.test.ts`: solo la parte de R13; T5.1 suma la de `planes-vista.ts`.
- **T4** (`97111992`):
  - `lib/actions/mi-plan.ts`: `cambiarMiPlanAction` y `cancelarCambioMiPlanAction`.
  - `lib/actions/_shared/mi-plan.ts`: `construirMiPlanCambioService` y `verPlanesDeMiPlan`.
  - `lib/modulos/reparto.ts`: `"mi-plan": "nucleo"`.

### Desvíos del design
1. **`IPlanesDelMaestroRepository`.** Los tres métodos nuevos no van en `IPlanesRepository` sino en una interfaz aparte del mismo archivo:
   - extiende `Pick<IPlanesRepository, "publicos" | "plan" | "preciosQueRigenDesde">`;
   - `PlanesRepository` implementa las dos;
   - `MiPlanCambioService` depende solo de ella.

   Por qué: con los métodos dentro de `IPlanesRepository` se rompían los dobles de 9 tests de `PlanesService` que no los usan. Eran 9 archivos más en un PR que ya va al 75 % del tope. Es el mismo criterio que la alternativa 5 del design.
2. **`@sin-superficie` en las dos actions.** La guardia `superficie-de-uso` exige que toda Server Action tenga superficie, y la de estas llega en T7 (`CambioDePlan`). Por eso llevan `@sin-superficie` con ese motivo. **T7 debe quitar las dos anotaciones** al montarlas.
3. **Nombres por rol del aviso de R13.** Viven en `NOMBRES_DEL_TOPE` (`lib/planes/mensajes.ts`), no en `TEXTOS_PLANES`, porque `mensajeTopesSobran` es de `lib/`. T5 puede reexportarlos en `TEXTOS_PLANES`. Además, `lineaTopeSobra` se exporta para el aviso previo del detalle.
4. **La empresa de la sesión no existe.** Es un caso imposible: `cambiarPlanPorLaEmpresa`, `cancelarCambioPorLaEmpresa` y `verPlanes` lanzan un error con contexto en lugar de inventar un estado de rechazo.
5. **`erroresDeCampo` duplicado.** El servicio lleva su propia copia de 7 líneas: la de `PlanesService` es privada.

### Mapa R<n> → test (solo los de esta tanda)
| R | Test |
|---|---|
| R1 | `tests/unit/services/mi-plan-cambio-service.test.ts` > «R1 — solo el maestro…» (6 roles, `null` y un maestro sin empresa; espía sin llamadas). La parte de la página llega con T7 (`tests/integration/mi-plan-page.test.tsx`). |
| R2 | `mi-plan-cambio-service.test.ts` > «R2 — …entrada estricta» (zod estricto en cambiar y cancelar; la empresa sale del actor); `tests/integration/db/mi-plan-cambiar-plan.test.ts` > «R2: … no tocan nada de B» |
| R5 (el filtro) | `mi-plan-cambio-service.test.ts` > «R5, R12 — esPlanDisponible» y «R5: solo los planes con costo concreto…» |
| R10 | `tests/unit/planes/proximo-periodo-de-cobro.test.ts`; `mi-plan-cambiar-plan.test.ts` > «R10, R11, R14: por cada tipo…»; `mi-plan-cambio-service.test.ts` > «R10: el corte sale del tipo vigente» |
| R11 | `mi-plan-cambiar-plan.test.ts` > «R10, R11, R14…» (plan, tipo vigente, fecha, actor; nada cambia antes del corte; sin `wallet_movimiento` ni `cobro_plataforma_movimiento`) |
| R12 | `mi-plan-cambiar-plan.test.ts` > «R12: …» (archivado, custom propio y ajeno, sin costo, versión programada sin costo, inexistente); unitarios de `esPlanDisponible` y «R12, R18: no_disponible y sin_plan» |
| R13 | `mi-plan-cambiar-plan.test.ts` > «R13: …» (un rol aunque la suma quepa; API keys; sin escribir); `tests/unit/planes/planes-vista.test.ts` (singular y plural por rol); `mi-plan-cambio-service.test.ts` > «R13: tope_excedido lleva el aviso…» |
| R14 | `mi-plan-cambiar-plan.test.ts` > «R10, R11, R14…» (los cuatro tipos al corte: sin tramo, costo = `montoDelPeriodo`, `plan_asignado` del maestro, tope pasado entre medias) |
| R15 | `mi-plan-cambiar-plan.test.ts` > «R15: …» (reemplazo sin historial, el trabajo viejo da `sin_pendiente`, el plan activo cancela con fila) |
| R16 | `mi-plan-cambiar-plan.test.ts` > «R16: …»; `mi-plan-cambio-service.test.ts` > «R16: sin pendiente…» |
| R17 (backend) | `mi-plan-cambiar-plan.test.ts` > «R17 (P3): …» (pendiente del superadmin con otro tipo: el maestro lo reemplaza y, en otra empresa, lo cancela) |
| R18 | `mi-plan-cambiar-plan.test.ts` > «R18: …»; `mi-plan-cambio-service.test.ts` > «R18 (P5)…» y «R12, R18…» |
| R19 (los datos) | `mi-plan-cambio-service.test.ts` > «R19: el primer período … con el precio que rige en el corte» y «R16, R17, R19: hayPendiente y activoEsCustom» |

R3, R4, R6–R9, R20–R23 y el resto de R1, R5, R17 y R19 son de T5–T8.

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: `tsc --noEmit` sin errores.
- `pnpm exec eslint` de los 15 archivos tocados: sin salida, exit 0.
- `pnpm run test:guardias`: `Test Files 1 failed | 338 passed | 3 skipped (342)`, `Tests 4 failed | 4783 passed | 25 skipped`.
  - Los 4 rojos son la baseline: `dependencias-declaradas-presentes`.
  - En la primera corrida salieron dos rojos más:
    - `superficie-de-uso`: real, arreglado (desvío 2);
    - `filtros-url-r25`: verde al correrlo solo, era carga.
- `vitest related --run` sin `tests/components/**` ni `tests/integration/**`, en 3 lotes de ≤5 archivos:
  - lote 1: 105 archivos, 1828 tests en verde;
  - lote 2: 18 archivos, 300 tests en verde;
  - lote 3: 111 archivos, 2099 tests en verde.
- Nuevos: `proximo-periodo-de-cobro` 20/20, `mi-plan-cambio-service` + `planes-vista` 33/33.
- `tests/integration/db/mi-plan-cambiar-plan.test.ts`: 9 casos, se saltan en local sin `HAY_BASE_DE_DATOS`. **Los corre CI.** T2.3 queda marcada con esa condición.
- Sin dependencias nuevas.
- MCP del grafo: no se usó; la exploración fue con Grep/Read.

### Preguntas
Ninguna.

**Veredicto:** T0–T4 hechas; typecheck, lint, guardias (solo la baseline) y `related` en verde; la integración con base queda para CI.

## Tanda 2 · T5–T7 frontend (2026-11-10, frontend_dev)

### Cambios
- **T5** (`48920a19`): `components/shared/planes/planes-vista.ts` (`TEXTOS_PLANES`, `usuariosDelPlan`, `usuariosEnUso`, `usoDeLasFilas`, `precioDeLaVista` con la insignia, `filasDePeriodos`, `filasDeComparacion`, `excedidosContra`); `tests/unit/planes/planes-vista.test.ts` ampliado. Lleva también la línea de desvíos aceptados de la tanda 1 en `progress/features/SLT-99.md`.
- **T6** (`9d7820c8`): `components/shared/planes/{CarruselDePlanes,DetalleDePlan,IconoDelModulo}.tsx`; `tests/components/{CarruselDePlanes,DetalleDePlan}.test.tsx`; `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts` (verde, y rojo a propósito con un `import "@/lib/auth/resolve-actor"` de prueba en `IconoDelModulo.tsx`, revertido).
- **T7** (`be036ab6`):
  - `app/(app)/mi-plan/_components/{PlanActivo,CambioDePlan}.tsx` (nuevos), `MiPlanModule.tsx`, `page.tsx`.
  - `lib/actions/mi-plan.ts`: fuera las dos `@sin-superficie` (y las temporales de los compartidos de T6).
  - Tests: `tests/components/MiPlanModule.test.tsx` reescrito (SLT-58 R11 → R19), `tests/components/MiPlanCambioDePlan.test.tsx` (nuevo), `tests/components/_mi-plan-planes.ts` (datos de ejemplo), `tests/components/ConsumoDelPlanPeriodo.test.tsx` y `tests/integration/mi-plan-page.test.tsx` ajustados.

### Desvíos del design
1. **Íconos en SVG en línea, en un archivo aparte.** Como el diseño aprobado (pedido del leader), no `lucide-react` (`BarChart3`/`Activity`/`Trophy` de §5). Viven en `components/shared/planes/IconoDelModulo.tsx`, un archivo más que la lista de `tasks.md`. Van por el orden de `ORDEN_MODULOS` y no por clave: la guardia `tests/unit/tablero-dia/primitivas.guardia.test.ts` no deja escribir «monitoreo» en `components/shared/`. Un tipo de tupla exige un ícono por módulo. El commit de T6 aún tenía la clave literal (esa guardia en rojo en ese commit); T7 lo arregla.
2. **El carrusel no guarda la vista.** Recibe `vista` y `onCambiarVista`, porque el detalle también la usa (§5 no las listaba).
3. **«Activo desde» (R8) no sale en «Mi plan».** `PlanConConsumo` no trae la fecha de entrada (`plan_ciclo_ancla_at`). `DetalleDePlan` acepta `activoDesde` opcional y lo pinta si llega (probado), pero «Mi plan» no lo tiene que pasar. Ver Preguntas.
4. **Sin plan, la primera asignación pendiente no se cancela desde «Mi plan».** «Cancelar cambio» solo sale con plan (`plan.cobro.pendiente`). Sin plan sigue «{Plan} empieza a regir el {fecha}» (SLT-86 R26), como P5 («sin plan no elige»). Ver Preguntas.
5. **Textos que §6 no fijaba.**
   - El cuerpo de «Plan a la medida» sale del canvas aprobado, sin «Solo lo ve tu empresa» porque SLT-116 la monta sin empresa.
   - El primer período sin cuota dice «…, Sin cuota.».
   - El rechazo genérico (`validation_error`, `forbidden` o la action que lanza) dice «No se pudo guardar. Inténtalo de nuevo.», el mismo de `PlanForm`.
6. **`ConsumoDelPlanPeriodo.test.tsx` (SLT-86 R26) cambia un caso.** «sin botón para cancelarlo» pasa a «con «Cancelar cambio»» por R16/R17 (P3).
7. **«Cambiar a {plan}» sigue habilitado con el aviso de topes.** El aviso previo de R13 sale, y el rechazo lo da el servicio (R20). El spec no pide deshabilitarlo.
8. **Plan activo público fuera del catálogo disponible.** Si está archivado o sin costo concreto, su tarjeta no sale en el carrusel y el detalle va sin columna «Tu plan». Es un caso raro, y comparar exigiría su `PlanVista`, que `verPlanes` no devuelve.

### Mapa R<n> → test (esta tanda)
| R | Test |
|---|---|
| R1 (página) | `tests/integration/mi-plan-page.test.tsx` > «SLT-99 R1 — `forbidden` en cualquiera de las dos lecturas…» y los 6 roles + sin sesión (sin leer ningún repositorio) |
| R3 | `tests/components/MiPlanModule.test.tsx` > «SLT-99 R3 — el panel del plan activo» (3 casos) |
| R4 | `tests/unit/planes/planes-vista.test.ts` > «R4 — «Usuarios» es la suma de los topes por rol»; `MiPlanModule.test.tsx` > «con tope en los cuatro roles…» |
| R5 | `tests/components/CarruselDePlanes.test.tsx` > «R5 — …» (orden, datos, módulos con ícono, «Activo» solo en el suyo, sin «Público» ni «Ver detalles», tarjeta clickeable con `aria-pressed`) |
| R6 | `planes-vista.test.ts` > «R6 (P1, P10) — …» (porcentaje, monto fijo hacia abajo, hacia arriba y en ,5, 0 % sin insignia, sin cuota); `CarruselDePlanes.test.tsx` > «R6 — …» |
| R7 | `CarruselDePlanes.test.tsx` > «R7 — «Plan a la medida»» (P7 deshabilitado con «Próximamente»; con `onContactar`; custom activo) |
| R8 | `planes-vista.test.ts` > «R8 — …»; `tests/components/DetalleDePlan.test.tsx` > «R8 — …» (tabla resaltada, comparación, tarjeta activa, sin cuota); `MiPlanCambioDePlan.test.tsx` |
| R9 | `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`; `CarruselDePlanes.test.tsx` y `DetalleDePlan.test.tsx` > «R9 — montado sin empresa» |
| R13 (aviso previo) | `DetalleDePlan.test.tsx` > «R13 — el aviso previo…»; `planes-vista.test.ts` > «R13 (P4) — el aviso previo mira cada rol…» |
| R16 | `tests/components/MiPlanCambioDePlan.test.tsx` > ««Cancelar cambio» pide confirmación…», ««Volver» cierra…» |
| R17 | `MiPlanCambioDePlan.test.tsx` > «se muestra con «Cancelar cambio»… avisa del reemplazo» (el pendiente se ve igual sea de quien sea: SLT-86 R32) |
| R18 | `MiPlanCambioDePlan.test.tsx` > «R18 (P5) — sin plan»; `DetalleDePlan.test.tsx` > «sin «Cambiar a» si quien monta no pasa la acción»; `MiPlanModule.test.tsx` > «sin plan: …» |
| R19 | `MiPlanCambioDePlan.test.tsx` > «R19 — la confirmación del cambio» (corte y primer período sin fecha; P6 con custom; «Listo…» y `router.refresh()`); `MiPlanModule.test.tsx` > «SLT-99 R19 (sustituye SLT-58 R11)…» |
| R20 | `MiPlanCambioDePlan.test.tsx` > «R20 — …» (`tope_excedido`, `no_disponible`, `sin_plan`, `sin_cambio_programado`) |
| R21 | `MiPlanModule.test.tsx` (casos de SLT-58 y SLT-86 en verde; «R21 (P8): el consumo y el costeo… debajo»); `ConsumoDelPlanPeriodo.test.tsx`; `mi-plan-solo-maestro.guardia.test.ts` sin cambios y en verde |

R22 y R23 son de T8.

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: `tsc --noEmit` sin errores (tras cada task y al final).
- `pnpm exec eslint` de lo tocado (`app/(app)/mi-plan`, `components/shared/planes`, `lib/actions/mi-plan.ts` y los 8 tests): `ESLint: No issues found`.
- Tests propios:
  - `planes-vista`: 25/25.
  - `CarruselDePlanes`: 11/11.
  - `DetalleDePlan`: 8/8.
  - `MiPlanModule` + `ConsumoDelPlanPeriodo`: 28/28.
  - `MiPlanCambioDePlan`: 11/11.
  - `tests/integration/mi-plan-page.test.tsx`: 10/10 (jsdom, sin base).
- `vitest related --run --exclude "tests/integration/**"`, 2 lotes de ≤5:
  - lote 1, los 4 de `components/shared/planes`: 6 archivos, 83 tests en verde;
  - lote 2, `PlanActivo`, `CambioDePlan`, `MiPlanModule`, `page` y `lib/actions/mi-plan.ts`: 3 archivos, 39 tests en verde.
- `pnpm run test:guardias`:
  - final: `Test Files 1 failed | 339 passed | 3 skipped (343)`, `Tests 4 failed | 4793 passed | 25 skipped`. Los 4 rojos son la baseline (`dependencias-declaradas-presentes`).
  - Primera corrida, antes del arreglo del desvío 1: había un quinto rojo real, `tablero-dia/primitivas` («ninguna primitiva conoce el dominio del tablero del día», por `IconoDelModulo.tsx`). Arreglado y en verde, también al correrlo solo.
  - `superficie-de-uso` está en verde sin las anotaciones `@sin-superficie`.
- Sin dependencias nuevas.
- MCP del grafo: no se usó; la exploración fue con Grep/Read.

### Preguntas
1. **«Activo desde» (R8).** Para mostrarlo en la tarjeta del plan activo hace falta la fecha de entrada (`plan_ciclo_ancla_at`) en `PlanConConsumo`. Es un cambio de backend en `lib/planes/consumo.ts` y `lib/types/consumo-plan.ts`. ¿Se suma (T8 o backend_dev) o se acepta sin esa línea?
2. **Sin plan con primera asignación pendiente.** ¿El maestro debe poder cancelarla desde «Mi plan»? Hoy no puede, y se lee como P5.

**Veredicto:** T5–T7 hechas. typecheck, lint, `related`, tests de componente y guardias en verde, sin rojos nuevos (solo la baseline). Quedan 2 preguntas (R8 «Activo desde» y el pendiente sin plan).

## Tanda 3 · Activo desde + E2E (2026-11-10, implementer)

### Cambios
- **Activo desde** (`dd3f1c6e`, R8):
  - `lib/types/consumo-plan.ts`: `PlanConConsumo.activoDesde` (`AAAA-MM-DD` de la plataforma).
  - `lib/planes/consumo.ts`: `planConConsumo` lo saca de `entrada` (`plan_ciclo_ancla_at`), que `MiPlanRepository` y `PlanesRepository.planDeEmpresa` ya leían para el tramo. Sin consulta nueva.
  - `app/(app)/mi-plan/_components/CambioDePlan.tsx`: lo pasa al detalle del plan activo.
  - Tests: `tests/unit/services/mi-plan-service.test.ts` y `tests/components/MiPlanCambioDePlan.test.tsx` (casos nuevos); `tests/components/ConsumoDelPlan.test.tsx` (el campo en su objeto de ejemplo).
  - Lleva la línea de decisiones de la tanda 2 en `progress/features/SLT-99.md`.
- **Decisiones** (`83d3afa5`): dos filas del 2026-11-10 en `requirements.md > Decisiones cerradas`.
- **T8.1 E2E** (`c25d59fd`, R22):
  - `e2e/mi-plan-cambiar-plan.spec.ts` y `playwright.config.ts` (grupo `aislamiento`, tras `planes-superadmin`; `aislamiento` está en la matriz de `gate.yml`).
  - `e2e/{planes-superadmin,planes-costeo,planes-costo-porcentual,cierre-modelo-nuevo-plan-porcentual}.spec.ts`: una línea cada uno (desvío 2).

### Desvíos
1. **«Activo desde» en `AAAA-MM-DD`, no «1 sep 2026».** Todas las fechas de «Mi plan» y del detalle (período en curso, próximo cobro, corte, pendiente) van en `AAAA-MM-DD` de la plataforma (`fechaCalendarioCR`). Se sigue ese formato para que el detalle no mezcle dos. Cambiarlo a «1 sep 2026» es solo el formateo en `planConConsumo` (ver Preguntas).
2. **Cuatro E2E ya existentes acotan el título al panel «Plan activo».** Abren `/mi-plan` y buscaban `getByRole("heading", { name: <plan>, exact: true })` en toda la página. Desde la tanda 2, el nombre sale en tres títulos: el panel, `ConsumoDelPlan` y la tarjeta del carrusel. Con el modo estricto de Playwright habrían caído en CI (R21). Se acota a `region "Plan activo"`.
3. **El E2E crea y asigna los planes por detrás.** Usa `PlanesRepository` real con el superadmin de prueba como actor (`crearPlanPublicoConCosto` de `_planes-fixture.ts`, `asignar`). Las pantallas del superadmin ya las recorre `planes-superadmin`. Elige las tarjetas con teclado (`press("Enter")`), porque el catálogo es global y una tarjeta puede quedar fuera de la parte visible del carrusel.

### Mapa R<n> → test (R1–R23, completo)
| R | Test (archivo › caso) |
|---|---|
| R1 | `tests/unit/services/mi-plan-cambio-service.test.ts` › «R1 — solo el maestro…»; `tests/integration/mi-plan-page.test.tsx` › «SLT-99 R1 — `forbidden` en cualquiera de las dos lecturas…» |
| R2 | `mi-plan-cambio-service.test.ts` › «R2 — …entrada estricta»; `tests/integration/db/mi-plan-cambiar-plan.test.ts` › «R2: … no tocan nada de B» |
| R3 | `tests/components/MiPlanModule.test.tsx` › «SLT-99 R3 — el panel del plan activo»; `e2e/mi-plan-cambiar-plan.spec.ts` › «el maestro ve su plan activo…» |
| R4 | `tests/unit/planes/planes-vista.test.ts` › «R4 — «Usuarios» es la suma de los topes por rol» |
| R5 | `tests/components/CarruselDePlanes.test.tsx` › «R5 — …»; `mi-plan-cambio-service.test.ts` › «R5: solo los planes con costo concreto…» |
| R6 | `planes-vista.test.ts` › «R6 (P1, P10) — …»; `CarruselDePlanes.test.tsx` › «R6 — …» |
| R7 | `CarruselDePlanes.test.tsx` › «R7 — «Plan a la medida»» |
| R8 | `tests/components/DetalleDePlan.test.tsx` › «R8 — …»; `tests/components/MiPlanCambioDePlan.test.tsx` › «R8 — «Activo desde» en el detalle del plan activo» (2 casos); `tests/unit/services/mi-plan-service.test.ts` › «SLT-99 R8 — «Activo desde» es la entrada de la empresa…»; E2E › «el maestro ve su plan activo…» |
| R9 | `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`; `CarruselDePlanes.test.tsx` y `DetalleDePlan.test.tsx` › «R9 — montado sin empresa» |
| R10 | `tests/unit/planes/proximo-periodo-de-cobro.test.ts`; `mi-plan-cambiar-plan.test.ts` › «R10, R11, R14: por cada tipo…»; `mi-plan-cambio-service.test.ts` › «R10: el corte sale del tipo vigente» |
| R11 | `mi-plan-cambiar-plan.test.ts` › «R10, R11, R14…»; E2E (el plan activo no cambia antes del corte) |
| R12 | `mi-plan-cambiar-plan.test.ts` › «R12: …»; `mi-plan-cambio-service.test.ts` › «R5, R12 — esPlanDisponible» |
| R13 | `mi-plan-cambiar-plan.test.ts` › «R13: …»; `planes-vista.test.ts` › «R13 (P4) — …»; `DetalleDePlan.test.tsx` › «R13 — el aviso previo…»; `mi-plan-cambio-service.test.ts` › «R13: tope_excedido lleva el aviso…» |
| R14 | `mi-plan-cambiar-plan.test.ts` › «R10, R11, R14…» |
| R15 | `mi-plan-cambiar-plan.test.ts` › «R15: …» |
| R16 | `mi-plan-cambiar-plan.test.ts` › «R16: …»; `MiPlanCambioDePlan.test.tsx` › ««Cancelar cambio» pide confirmación…»; E2E (cancela y el pendiente desaparece) |
| R17 | `mi-plan-cambiar-plan.test.ts` › «R17 (P3): …»; `MiPlanCambioDePlan.test.tsx` › «se muestra con «Cancelar cambio»… avisa del reemplazo» |
| R18 | `mi-plan-cambiar-plan.test.ts` › «R18: …»; `MiPlanCambioDePlan.test.tsx` › «R18 (P5) — sin plan» |
| R19 | `MiPlanCambioDePlan.test.tsx` › «R19 — la confirmación del cambio»; `mi-plan-cambio-service.test.ts` › «R19: el primer período…»; E2E (la confirmación con el corte, sin campo de fecha) |
| R20 | `MiPlanCambioDePlan.test.tsx` › «R20 — …» (los cuatro rechazos) |
| R21 | `MiPlanModule.test.tsx` › «R21 (P8): …»; `tests/components/ConsumoDelPlanPeriodo.test.tsx`; `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts`; los 4 E2E de «Mi plan» (desvío 2) y `gate-completo` en CI |
| R22 | `e2e/mi-plan-cambiar-plan.spec.ts` › «el maestro ve su plan activo, cambia a otro plan público, ve el pendiente al corte y lo cancela (R22)» y «el admin de la misma empresa recibe «no encontrado»…» |
| R23 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente); sin cambios en `package.json` |

Todos los archivos de la tabla existen. R2 y R10–R18 (integración con base) y R22 (E2E) los corre CI.

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: `tsc --noEmit` sin errores. Cubre también el E2E, porque el `tsconfig` incluye `e2e/`.
- `pnpm exec eslint` de lo tocado: sin salida.
- Tests propios (`MiPlanCambioDePlan`, `mi-plan-service` y `ConsumoDelPlan`): `Test Files 3 passed`, `Tests 36 passed`.
- `vitest related --run --exclude "tests/integration/**"` de `consumo-plan.ts`, `consumo.ts` y `CambioDePlan.tsx`: `Test Files 36 passed`, `Tests 767 passed`.
- `pnpm exec playwright test --list`: lista los dos casos del E2E en `[aislamiento]`:
  - `mi-plan-cambiar-plan.spec.ts:140:5 › el maestro ve su plan activo, cambia…`;
  - `mi-plan-cambiar-plan.spec.ts:207:5 › el admin de la misma empresa…`.

  `Total: 189 tests in 43 files`. **No se corrió en local**: necesita base y `.env`. Lo corre CI.
- Guardia `e2e-sin-saltos`: `Tests 38 passed`.
- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`: **rojo en el paso 3, antes del typecheck**. El error es `feature_list.json invalido: zona fullstack: SLT-46, SLT-81, SLT-89, SLT-97, SLT-99 (5 in_progress, max 3)`. Es el cupo del board, no el código. Por eso se corrió a mano el paso que sigue, `pnpm run test:guardias`:
  - `Test Files 1 failed | 339 passed | 3 skipped (343)`;
  - `Tests 4 failed | 4793 passed | 25 skipped`;
  - los 4 rojos son la baseline, `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`.
- Tamaño: 46 archivos frente a `origin/dev`. Lo aceptado eran ~31.
- Sin dependencias nuevas.

### Preguntas
1. **Formato de «Activo desde».** ¿Se queda `2026-09-01`, como el resto de fechas del plan, o pasa a «1 sep 2026» solo en esa línea?
2. **Cupo del board.** `./init.sh` no pasa del paso 3 mientras Camilo tenga más de 3 features `fullstack` en vuelo en la copia local del board.
3. **Tamaño del PR.** Son 46 archivos frente a los ~31 aceptados. ¿Se amplía la línea `tamano-pr-aceptado`?

**Veredicto:** «Activo desde» (R8) y el E2E (R22) hechos, y R1–R23 mapeados a tests que existen. typecheck, lint, `related` y guardias en verde (solo la baseline). `./init.sh` cae por el cupo del board.

## 2026-11-10 · Ajuste: «Activo desde» en formato corto (frontend_dev)
- `components/shared/planes/DetalleDePlan.tsx` muestra «Activo desde» como «1 sep 2026» con `fechaCortaEnZona` (`lib/whatsapp-envios/informes/formato.ts`, el mismo de los correos de cambio de plan); tests `DetalleDePlan.test.tsx`, `MiPlanCambioDePlan.test.tsx` (R8) y E2E `mi-plan-cambiar-plan.spec.ts` (R22) ajustados. Paso 3 (cupo) en verde; typecheck y lint en verde; `test:rapido` rojo solo por timeout de `tarifa-status-retirado.guard` bajo carga (solo: 8/8 verde); `test:guardias` solo con la baseline (`dependencias-declaradas-presentes`).

## 2026-11-10 · Correcciones de la revisión (implementer)
- M1 y m1 en `d7ae12b7`, m2 en `dd7355fd`, m3 en `fe453ac2` (detalle en `progress/review_SLT-99.md > Correcciones`); M2 lo cierra el CI del PR. typecheck y lint en verde; tests tocados y directos en verde; guardias solo con la baseline; 2 casos de integración nuevos sin correr en local (CI).

## 2026-11-10 · CI PR #115: rojo y arreglo (backend_dev)
- `gate-completo` (run 42868755488) rojo fuera del baseline en `tests/integration/db/mi-plan-cambiar-plan.test.ts`, un caso: «R18 (P5, decisión 2026-11-10): sin plan, el maestro no cancela la primera asignación pendiente → sin_plan sin escribir». Error: `no quedó pendiente: {"estado":"validation_error","fieldErrors":{"vigenteDesde":[SOLO_CON_PLAN]}}`.
- Causa: fallo del test, no del código. El fixture armaba la primera asignación futura con `vigenteDesde` (fecha de efecto, solo para empresas con plan, SLT-86 R16); la primera asignación lleva `inicioCiclo` (SLT-58 R31). Arreglo: `inicioCiclo: dia(5)`, como `planes-asignacion-inicio-ciclo.test.ts` (R39). Sin cambios en el baseline.
