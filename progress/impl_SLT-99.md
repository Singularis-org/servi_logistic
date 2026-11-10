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
