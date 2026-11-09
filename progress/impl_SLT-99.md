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
