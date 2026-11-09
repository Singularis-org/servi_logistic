# SLT-99 — planes-vista-empresa-cambiar-plan · tasks.md

> Parte de `dev` con SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de
> órdenes» integrada (ya lo está). Reparto: `backend_dev` T1–T4, `frontend_dev` T5–T7, cualquiera T8.
> Cada task cierra con `pnpm exec vitest related --run <sus archivos>` en verde y un commit
> `feat(SLT-99): …` / `test(SLT-99): …`. Mapa `R<n> → test` en `progress/impl_SLT-99.md`.

## T0 — Antes de tocar código

- [x] **T0.1** Respuestas del humano a P1–P9 escritas en `requirements.md > Decisiones cerradas` (2026-11-09);
  R6, R7, R10, R13–R20 ajustados. *Hecho:* solo queda P10 (insignia de un monto fijo que redondea a 0 %),
  que no bloquea T1–T4.
- [x] **T0.2** P9: se acepta un solo PR; línea `tamano-pr-aceptado` en `progress/features/SLT-99.md`.
- [x] **T0.3** P10 cerrada por el humano (2026-11-09): sin insignia cuando el % equivalente de un descuento anual
  en monto fijo redondea a 0 %. Movida a `requirements.md > Decisiones cerradas`; «Preguntas abiertas: Ninguna.».

## T1 — El corte (R10) · backend

- [x] **T1.1** Sin código nuevo: el corte es `fechaDeEfectoPorDefecto(tipoVigente, ahora)` de
  `lib/planes/ciclo.ts` (SLT-86), que no cambia. Se fija su contrato para el maestro con un test propio.
  *Hecho:* `tests/unit/planes/proximo-periodo-de-cobro.test.ts` en verde con, por cada tipo:
  - quincenal: el 1 a las 00:00 → el 16; el 15 a las 23:59:59.999 → el 16; el 16 a las 00:00 → el 1 del mes
    siguiente; el 31 de diciembre → el 1 de enero;
  - mensual: el 1 a las 00:00 → el 1 del mes siguiente; el 31 de enero → el 1 de febrero; el 28 de febrero
    (año de 28) y el 29 de febrero (año de 29) → el 1 de marzo; el 31 de diciembre → el 1 de enero;
  - bimestral: el 1 de enero a las 00:00 → el 1 de marzo; el 29 de febrero → el 1 de marzo; el 1 de marzo a
    las 00:00 → el 1 de mayo; el 30 de noviembre → el 1 de enero siguiente;
  - anual: el 1 de enero a las 00:00 → el 1 de enero siguiente; el 31 de diciembre a las 23:59:59.999 → el 1
    de enero siguiente;
  - zona: el 30 de noviembre a las 23:59 de Costa Rica (ya 1 de diciembre en UTC) cuenta como noviembre;
  - nunca devuelve el día de hoy.

## T2 — Repositorio (R2, R10–R17) · backend · depende de T1

- [x] **T2.1** `esPlanDisponible(plan, versionPendiente)` en `lib/planes/costo-concreto.ts` (design §3, paso 3).
  *Hecho:* casos en `tests/unit/services/mi-plan-cambio-service.test.ts` (público con costo; archivado;
  custom; sin precio; versión pendiente sin costo).
- [x] **T2.2** Tipos `EmpresaParaElMaestro`, `ResultadoCambioDelMaestro`, `ResultadoCancelarDelMaestro` en
  `IPlanesRepository`; `PlanVista` y los tres `*Result` de §4 en `lib/types/planes.ts`. Sin el estado
  `pendiente_de_plataforma` (P3). *Hecho:* typecheck.
- [x] **T2.3** `empresaParaElMaestro`, `cambiarPlanPorLaEmpresa(org, plan, actor, ahora)` y
  `cancelarCambioPorLaEmpresa` en `PlanesRepository`, en el orden de §3: el corte se calcula bajo el cerrojo
  con el tipo vigente; reutiliza `bloquearEmpresa`, `excedidosDe`, `escribirPendiente`,
  `cancelarPendienteDeEmpresaEnTx`, `fechaDeEfectoPorDefecto` e `inicioDelDiaPlataforma`. Ampliar el `motivo`
  de `PlanesRepository` en `lib/db/excepciones-aislamiento.ts`.
  *Hecho:* `tests/integration/db/mi-plan-cambiar-plan.test.ts` en verde con:
  - R10/R11: una empresa de cada tipo de cobro guarda como fecha el inicio de su próximo período; el plan y el
    tipo vigente; la empresa sigue igual antes; sin filas en `wallet_movimiento` ni
    `cobro_plataforma_movimiento`;
  - R12: `no_disponible` para archivado, custom propio y ajeno, sin costo;
  - R13: `tope_excedido` por un solo rol aunque la suma de «Usuarios» quepa, y por API keys, sin escribir;
  - R14: aplicar con el reloj en el corte para quincenal, mensual, bimestral y anual: período en curso sin
    tramo (`esTramo = false`) y costo base = `montoDelPeriodo` del plan nuevo; `plan_asignado` firmado por el
    maestro; tope pasado entre medias → se aplica igual;
  - R15: reemplazo sin historial (el trabajo viejo no aplica nada); pedir el activo cancela con fila;
  - R16: cancelar con fila `plan_cambio_empresa_cancelado`; sin pendiente → `sin_cambio_programado`;
  - R17: pendiente del superadmin con otro tipo de cobro → el maestro lo reemplaza (queda su plan, el tipo
    vigente y su corte) y, en otro caso, lo cancela con fila firmada por el maestro;
  - R2: dos empresas, B intacta.

## T3 — Servicio (R1, R2, R5, R12, R18) · backend · depende de T2

- [x] **T3.1** `IMiPlanCambioService` y `MiPlanCambioService` (§4): `verPlanes`, `cambiarPlan`,
  `cancelarCambio`, con el orden quién → zod estricto → repositorio con `ahora`. `verPlanes` calcula `corte`
  con `fechaDeEfectoPorDefecto(tipoCobro, ahora)`. Usa `mensajeTopesSobran` (`lib/planes/mensajes.ts`); si
  T5.1 aún no lo creó, lo crea aquí con su test en `planes-vista.test.ts`.
  *Hecho:* `tests/unit/services/mi-plan-cambio-service.test.ts` en verde: `forbidden` sin llamadas para cada
  rol no maestro, superadmin y `null` (R1); `validation_error` con `organizacionId` o campos de más (R2);
  `verPlanes` filtra archivados, custom y sin costo (R5), da `corte` según el tipo y `primerPeriodo` completo
  con el precio del corte (R10, R19), `hayPendiente` y `activoEsCustom`; `sin_plan` y `puedeCambiar = false`
  (R18); el `mensaje` de `tope_excedido` (R13); `sin_cambio_programado` (R16).

## T4 — Borde (R1) · backend · depende de T3

- [x] **T4.1** `lib/actions/mi-plan.ts` (`cambiarMiPlanAction`, `cancelarCambioMiPlanAction`), sin
  `revalidatePath` ni el texto de la ruta (guardia de SLT-91 R10).
- [x] **T4.2** `construirMiPlanCambioService` y `verPlanesDeMiPlan` en `lib/actions/_shared/mi-plan.ts`;
  `"mi-plan": "nucleo"` en `lib/modulos/reparto.ts`.
  *Hecho:* guardias en verde (`pnpm run test:guardias`), incluidas reparto de módulos, `mi-plan-solo-maestro`
  y `plataforma-solo-en-lista`.

## T5 — Lógica de vista (R4, R6, R8, R13) · frontend · [P] con T1–T4

- [ ] **T5.1** `components/shared/planes/planes-vista.ts` (§5) con `TEXTOS_PLANES`, y `mensajeTopesSobran` en
  `lib/planes/mensajes.ts` (lo usa también T3).
  *Hecho:* `tests/unit/planes/planes-vista.test.ts` en verde: suma de usuarios y «Sin tope» (R4); precio
  mensual y anual con descuento; insignia solo en anual y solo con descuento anual: en %, el suyo; en monto
  fijo, el equivalente redondeado (un caso que sube, uno que baja, uno en ,5); «Sin cuota · solo pagas el
  costo por orden» con `0.00` en las dos vistas y sin insignia (R6, P1); «equivale por mes» en céntimos
  exactos (R8); «sobra 1 {rol}» / «sobran N {rol en plural}» por cada rol y por API keys (R13, P4).

## T6 — Componentes compartidos (R5–R9) · frontend · depende de T5

- [ ] **T6.1** `CarruselDePlanes.tsx` y `DetalleDePlan.tsx` (§5), con los íconos de módulo en un
  `Record<ModuloApagable, LucideIcon>`.
  *Hecho:* `tests/components/CarruselDePlanes.test.tsx` (R5, R6; R7: «Contáctanos» deshabilitado con
  «Próximamente» sin `onContactar`, y custom activo como tarjeta activa; modo sin empresa de R9) y
  `tests/components/DetalleDePlan.test.tsx` (R8 con «Sin cuota» en la tabla y la comparación, aviso previo de
  R13, modo sin empresa de R9) en verde.
- [ ] **T6.2** `tests/unit/guards/planes-compartidos-sin-empresa.guardia.test.ts`: barre
  `components/shared/planes/` y falla con un import prohibido o una prop `organizacionId`; con
  autocomprobación (encuentra los dos componentes). *Hecho:* en verde y rojo a propósito con un import de
  prueba.

## T7 — «Mi plan» (R3, R16–R21) · frontend · depende de T4 y T6

- [ ] **T7.1** `PlanActivo.tsx` (R3) y `CambioDePlan.tsx` (R8, R16–R20); `MiPlanModule.tsx` los compone con
  el pendiente y `ConsumoDelPlan` debajo, sin cambios (P8); `page.tsx` lee `verMiPlan` y `verPlanesDeMiPlan`
  en paralelo.
  *Hecho:*
  - `tests/components/MiPlanModule.test.tsx`: panel activo (R3); el caso de SLT-58 R11 se reescribe a R19;
    los casos de SLT-86 y de `ConsumoDelPlan` siguen (R21);
  - `tests/components/MiPlanCambioDePlan.test.tsx`: confirmación con el corte y el primer período completo,
    sin campo de fecha (R19); con custom activo, el aviso «Si dejas tu plan a la medida, solo la plataforma
    puede volver a asignártelo» y sin él con plan público (R19, P6); pendiente (del maestro y del
    superadmin) con «Cancelar cambio» y «Cambiar a {plan}», y la confirmación avisa del reemplazo (R17, P3);
    «Cancelar cambio» con confirmación (R16); sin plan sin «Cambiar a» (R18); los cuatro rechazos (R20);
  - `tests/integration/mi-plan-page.test.tsx`: `forbidden` en cualquiera de las dos lecturas → «no
    encontrado» (R1).

## T8 — E2E y cierre (R21, R22, R23) · depende de T7

- [ ] **T8.1** `e2e/mi-plan-cambiar-plan.spec.ts` en el proyecto `aislamiento` de `playwright.config.ts`, tras
  `planes-superadmin`: el superadmin crea dos planes públicos y asigna uno a una empresa; el maestro ve el
  activo, cambia al otro, ve «Desde el {corte}: …» con el corte que da `fechaDeEfectoPorDefecto` para el tipo
  de la empresa, lo cancela y ya no lo ve; un `admin` recibe «no encontrado» en `/mi-plan`. Archiva al final
  los planes que creó (el catálogo es global). Sin `waitForTimeout`. *Hecho:* verde en local contra base
  desechable.
- [ ] **T8.2** `./init.sh` en verde; E2E de planes en local (`grep -rl "mi-plan\|Mi plan" e2e/`); mapa
  `R1–R23 → test` en `progress/impl_SLT-99.md`. *Hecho:* sin rojos nuevos frente a `tests/baseline-rojos.json`.

## Archivos esperados

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
`tests/unit/planes/proximo-periodo-de-cobro.test.ts`
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

30 archivos (75 % de los 40 de `gate.tamano_pr`); ~1 800 líneas estimadas frente a 1 000: exceso aceptado por
el humano el 2026-11-09 (P9, `tamano-pr-aceptado` en la ficha).
