# SLT-99 — planes-vista-empresa-cambiar-plan · tasks.md

> Parte de `dev` con SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de
> órdenes» integrada (ya lo está). Reparto: `backend_dev` T1–T4, `frontend_dev` T5–T7, cualquiera T8.
> Cada task cierra con `pnpm exec vitest related --run <sus archivos>` en verde y un commit
> `feat(SLT-99): …` / `test(SLT-99): …`. Mapa `R<n> → test` en `progress/impl_SLT-99.md`.

## T0 — Antes de tocar código

- [ ] **T0.1** Respuestas del humano a P1–P9 escritas en `requirements.md > Decisiones cerradas`. Si cambian
  P2 (corte frente a SLT-86), P3, P4 o P5, `spec_author` ajusta R13, R14, R17 o R18 antes de T2.
  *Hecho:* ninguna pregunta abierta sin respuesta o marcada «se acepta la propuesta».
- [ ] **T0.2** Si P9 decide partir, la ficha se acota a la rebanada «ver» (`design.md > §10`) y este archivo
  se reescribe. *Hecho:* `## Archivos esperados` refleja la rebanada.

## T1 — El próximo corte (R10) · backend

- [ ] **T1.1** `proximoCorte(ahora): string` en `lib/planes/ciclo.ts`, sobre
  `fechaDeEfectoPorDefecto("quincenal", ahora)`. *Hecho:* `tests/unit/planes/proximo-corte.test.ts` en verde
  con el 1 a las 00:00, el 15 a las 23:59:59.999, el 16 a las 00:00, el 31 de diciembre y febrero de 28 y 29.

## T2 — Repositorio (R2, R11–R17) · backend · depende de T1

- [ ] **T2.1** `esPlanDisponible(plan, versionPendiente)` en `lib/planes/costo-concreto.ts` (design §3, paso 3).
  *Hecho:* casos en `tests/unit/services/mi-plan-cambio-service.test.ts` (público con costo; archivado;
  custom; sin precio; versión pendiente sin costo).
- [ ] **T2.2** Tipos `EmpresaParaElMaestro`, `ResultadoCambioDelMaestro`, `ResultadoCancelarDelMaestro` en
  `IPlanesRepository`; `PlanVista` y los tres `*Result` de §4 en `lib/types/planes.ts`. *Hecho:* typecheck.
- [ ] **T2.3** `empresaParaElMaestro`, `cambiarPlanPorLaEmpresa` y `cancelarCambioPorLaEmpresa` en
  `PlanesRepository`, en el orden de §3, reutilizando `bloquearEmpresa`, `excedidosDe`, `escribirPendiente`
  y `cancelarPendienteDeEmpresaEnTx`. Ampliar el `motivo` de `PlanesRepository` en
  `lib/db/excepciones-aislamiento.ts`.
  *Hecho:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` en verde con:
  - R11: pendiente con el plan, el tipo vigente y el corte; la empresa sigue igual antes; sin filas en
    `wallet_movimiento` ni `cobro_plataforma_movimiento`;
  - R12: `no_disponible` para archivado, custom propio y ajeno, sin costo;
  - R13: `tope_excedido` por un rol y por API keys, sin escribir;
  - R14: aplicar con el reloj en el corte (quincenal sin tramo; mensual con corte el 16 → tramo hasta fin de
    mes); `plan_asignado` firmado por el maestro; tope pasado entre medias → se aplica igual;
  - R15: reemplazo sin historial (el trabajo viejo no aplica nada); pedir el activo cancela con fila;
  - R16: cancelar con fila `plan_cambio_empresa_cancelado`; sin pendiente → `sin_cambio_programado`;
  - R17: pendiente del superadmin → `pendiente_de_plataforma` al cambiar y al cancelar;
  - R2: dos empresas, B intacta.

## T3 — Servicio (R1, R2, R5, R12, R18) · backend · depende de T2

- [ ] **T3.1** `IMiPlanCambioService` y `MiPlanCambioService` (§4): `verPlanes`, `cambiarPlan`,
  `cancelarCambio`, con el orden quién → zod estricto → corte → repositorio. Usa `mensajeTopesSobran`
  (`lib/planes/mensajes.ts`); si T5.1 aún no lo creó, lo crea aquí con su test en `planes-vista.test.ts`.
  *Hecho:* `tests/unit/services/mi-plan-cambio-service.test.ts` en verde: `forbidden` sin llamadas para cada
  rol no maestro, superadmin y `null` (R1); `validation_error` con `organizacionId` o campos de más (R2);
  `verPlanes` filtra archivados, custom y sin costo (R5) y calcula `primerPeriodo` con el precio del corte
  (R19); `sin_plan` (R18); el `mensaje` de `tope_excedido` (R13).

## T4 — Borde (R1) · backend · depende de T3

- [ ] **T4.1** `lib/actions/mi-plan.ts` (`cambiarMiPlanAction`, `cancelarCambioMiPlanAction`), sin
  `revalidatePath` ni el texto de la ruta (guardia de SLT-91 R10).
- [ ] **T4.2** `construirMiPlanCambioService` y `verPlanesDeMiPlan` en `lib/actions/_shared/mi-plan.ts`;
  `"mi-plan": "nucleo"` en `lib/modulos/reparto.ts`.
  *Hecho:* guardias en verde (`pnpm run test:guardias`), incluidas reparto de módulos, `mi-plan-solo-maestro`
  y `plataforma-solo-en-lista`.

## T5 — Lógica de vista (R4, R6, R8, R13) · frontend · [P] con T2–T4

- [ ] **T5.1** `components/shared/planes/planes-vista.ts` (§5) con `TEXTOS_PLANES`, y `mensajeTopesSobran` en
  `lib/planes/mensajes.ts` (lo usa también T3).
  *Hecho:* `tests/unit/planes/planes-vista.test.ts` en verde: suma de usuarios y «Sin tope» (R4); precio
  mensual y anual con descuento, insignia solo con descuento anual en %, «Sin cuota» con `0.00` (R6, P1);
  «equivale por mes» en céntimos exactos (R8); «sobran N» por tope (R13).

## T6 — Componentes compartidos (R5–R9) · frontend · depende de T5

- [ ] **T6.1** `CarruselDePlanes.tsx` y `DetalleDePlan.tsx` (§5), con los íconos de módulo en un
  `Record<ModuloApagable, LucideIcon>`.
  *Hecho:* `tests/components/CarruselDePlanes.test.tsx` (R5, R6, R7, modo sin empresa de R9) y
  `tests/components/DetalleDePlan.test.tsx` (R8, aviso previo de R13, modo sin empresa de R9) en verde.
- [ ] **T6.2** `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`: barre
  `components/shared/planes/` y falla con un import prohibido o una prop `organizacionId`; con
  autocomprobación (encuentra los dos componentes). *Hecho:* en verde y rojo a propósito con un import de
  prueba.

## T7 — «Mi plan» (R3, R17–R21) · frontend · depende de T4 y T6

- [ ] **T7.1** `PlanActivo.tsx` (R3) y `CambioDePlan.tsx` (R8, R17–R20); `MiPlanModule.tsx` los compone con
  el pendiente y `ConsumoDelPlan` (P8); `page.tsx` lee `verMiPlan` y `verPlanesDeMiPlan` en paralelo.
  *Hecho:*
  - `tests/components/MiPlanModule.test.tsx`: panel activo (R3); el caso de SLT-58 R11 se reescribe a R19;
    los casos de SLT-86 siguen;
  - `tests/components/MiPlanCambioDePlan.test.tsx`: confirmación con corte y primer período, sin campo de
    fecha (R19); pendiente y «Cancelar cambio» con confirmación (R16, R19); pendiente de plataforma sin
    botones (R17); sin plan sin «Cambiar a» (R18); los cinco rechazos (R20);
  - `tests/integration/mi-plan-page.test.tsx`: `forbidden` en cualquiera de las dos lecturas → «no
    encontrado» (R1).

## T8 — E2E y cierre (R21, R22, R23) · depende de T7

- [ ] **T8.1** `e2e/mi-plan-cambiar-plan.spec.ts` en el proyecto `aislamiento` de `playwright.config.ts`, tras
  `planes-superadmin`: el superadmin crea dos planes públicos y asigna uno a una empresa; el maestro ve el
  activo, cambia al otro, ve «Desde el {proximoCorte}: …», lo cancela y ya no lo ve; un `admin` recibe «no
  encontrado» en `/mi-plan`. Archiva al final los planes que creó (el catálogo es global). Sin
  `waitForTimeout`. *Hecho:* verde en local contra base desechable.
- [ ] **T8.2** `./init.sh` en verde; E2E de planes en local (`grep -rl "mi-plan\|Mi plan" e2e/`); mapa
  `R1–R23 → test` en `progress/impl_SLT-99.md`. *Hecho:* sin rojos nuevos frente a `tests/baseline-rojos.json`.

## Archivos esperados

`lib/planes/ciclo.ts`
`lib/planes/costo-concreto.ts`
`lib/planes/mensajes.ts`
`lib/types/planes.ts`
`lib/interfaces/repositories/IPlanesRepository.ts`
`lib/repositories/PlanesRepository.ts`
`lib/interfaces/services/IMiPlanCambioService.ts`
`lib/services/MiPlanCambioService.ts`
`lib/actions/mi-plan.ts`
`lib/actions/_shared/mi-plan.ts`
`lib/modulos/reparto.ts`
`lib/db/excepciones-aislamiento.ts`
`app/(app)/mi-plan/page.tsx`
`app/(app)/mi-plan/_components/MiPlanModule.tsx`
`app/(app)/mi-plan/_components/PlanActivo.tsx`
`app/(app)/mi-plan/_components/CambioDePlan.tsx`
`components/shared/planes/CarruselDePlanes.tsx`
`components/shared/planes/DetalleDePlan.tsx`
`components/shared/planes/planes-vista.ts`
`tests/unit/planes/proximo-corte.test.ts`
`tests/unit/planes/planes-vista.test.ts`
`tests/unit/services/mi-plan-cambio-service.test.ts`
`tests/integration/db/mi-plan-cambiar-plan.test.ts`
`tests/integration/mi-plan-page.test.tsx`
`tests/components/CarruselDePlanes.test.tsx`
`tests/components/DetalleDePlan.test.tsx`
`tests/components/MiPlanModule.test.tsx`
`tests/components/MiPlanCambioDePlan.test.tsx`
`tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`
`e2e/mi-plan-cambiar-plan.spec.ts`
`playwright.config.ts`

31 archivos (78 % de los 40 de `gate.tamano_pr`); ~1 800 líneas estimadas frente a 1 000 (P9).
