# SLT-58 — planes-superadmin-ui · tasks.md

> Diseño: `design.md`. Reparto por capa (`docs/perfil-agentes.md > implementer`): `backend_dev` para
> `lib/`, `db/` y sus tests; `frontend_dev` para `components/` y las páginas de `app/`.
> `[P]` = puede ir en paralelo con las demás `[P]` de su tanda. Un commit por task
> (`feat(SLT-58): …`, `test(SLT-58): …`).

## Tanda A — backend (backend_dev)

- [x] **T1 — Migración `plan_de_la_empresa`** (design §2). `migration.sql` a mano y `down.sql`.
  Antes, confirmar que `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` no aplica migraciones
  posteriores a SL-24 (si las aplica, PARAR y preguntar antes de tocar ese test).
  *Hecho:* `pnpm run db:migrate` aplica; `tests/integration/db/plan-de-la-empresa.test.ts` en verde con
  R2 (uso = `plan_uso_*`), R6 (sin plan → `NULL`), R9 (propia bien; otra y sin contexto `42501`;
  `SELECT` a `plan` con `servi_app` `42501`; sin `avisos_al_programar` ni actor en la respuesta), R25
  (`provolatile = 's'`) y R26 (nombre en `pg_proc`; el `down.sql` dentro de una transacción la quita y
  el `ROLLBACK` la deja).
- [x] **T2 [P] — Lógica pura** (design §6.1). `inicioDelSiguienteCiclo` en `lib/planes/ciclo.ts`;
  `lib/planes/consumo.ts` (`estadoDeLaFila`, `formatearConteo`, `filasDeConsumo`, `reinicioDelCiclo`);
  exportar `textoDelPrecio` y `SIN_LIMITE` de `lib/planes/mensajes.ts` sin cambiar su texto; tipos en
  `lib/types/consumo-plan.ts`.
  *Hecho:* `tests/unit/planes/consumo.test.ts` (R1 precio, R2, R3, R4 con 79/99, 80/100, 99/100,
  100/100, 101/100, 0/0 y sin tope; R5) y los casos nuevos de `tests/unit/utils/ciclo-plan.test.ts`
  (ancla el 15 y el 31 de enero, a mitad de ciclo y a un minuto del cambio) en verde.
- [x] **T3 — «Mi plan»: repositorio y servicio** (design §3.1). Depende de T1 y T2.
  `ROLES_MI_PLAN` en `lib/auth/menu-visibility.ts` (solo la constante en esta task),
  `IMiPlanRepository`, `MiPlanRepository` (`$queryRaw` + zod, mapeo de `'Admin Tienda'`),
  `IMiPlanService`, `MiPlanService` (autorización primero; `diferenciasDelPlan` →
  `lineasDeCambioDelPlan` para el pendiente) y el composition root `lib/actions/_shared/mi-plan.ts`.
  *Hecho:* `tests/unit/services/mi-plan-service.test.ts` en verde: R8 con los siete roles y sin sesión
  (cero llamadas al repositorio), R7 (líneas del pendiente), plan `null` → `{ estado: "ok", plan: null }`.
- [x] **T4 — Lecturas del superadmin** (design §3.2). Depende de T2.
  `catalogo`, `detalle`, `planDeEmpresa` en `IPlanesRepository`/`PlanesRepository` (sumar
  `historialAccion` y `planRastro` al `Pick`) y `catalogo`, `detallePlan`, `planDeEmpresa` en
  `IPlanesService`/`PlanesService`; tipos de §5 en `lib/types/planes.ts`; composition root
  `lib/actions/_shared/planes-plataforma.ts`; ampliar el `motivo` de `PlanesRepository` en
  `lib/db/excepciones-aislamiento.ts`.
  *Hecho:* `tests/unit/services/planes-service-lecturas.test.ts` (R13, R16, R19; R22: cada rol de
  empresa `forbidden` con cero llamadas, `planId` no uuid `validation_error`, inexistente `not_found`) y
  `tests/integration/db/planes-lecturas-plataforma.test.ts` (R13: archivados incluidos, nº de empresas,
  fecha del pendiente; R16: rastro del más reciente al más antiguo; R21: solo las asignaciones de esa
  empresa) en verde. La suite de SL-24 sigue verde sin tocar sus tests (R25).
- [x] **T5 — Rutas en el reparto y fin de `@sin-superficie`** (backend_dev, pero **se ejecuta después
  de T7, T8 y T9**, antes de T10: la marca solo se quita cuando hay pantalla; las rutas del reparto
  pueden adelantarse junto con T7/T8 si la guardia `modulos-reparto` lo pide al crear las páginas). `"/mi-plan"`, `"/plataforma/planes"` y `"/plataforma/planes/[planId]"`
  como `"nucleo"` en `lib/modulos/reparto.ts`; quitar las seis líneas `@sin-superficie` de
  `lib/actions/planes.ts` y actualizar su comentario de cabecera (ya no «sin pantalla todavía»).
  *Hecho:* `pnpm run test:guardias` en verde (`superficie-de-uso` R-A y «ninguna anotación sobrevive
  a su motivo», `modulos-reparto`): R12, R24.

## Tanda B — frontend (frontend_dev)

- [x] **T6 — Menú** (design §4). Depende de T3 (constante). Grep primero de los `toEqual` literales de
  los menús de `maestro`, `admin` y `superadmin` en `tests/`. Ítems «Mi plan» (`ROLES_MI_PLAN`, tras
  «Histórico») y «Planes» (`ROLES_PLATAFORMA`, entre «Empresas» y «Geografía»); `IconKey`
  `gaugeCircle` y `layers` y su mapa en `Sidebar.tsx`. Actualizar los casos literales de
  `menu-visibility.test.ts` citando SLT-58 R23 (y R10 si aparece alguno de maestro/admin).
  *Hecho:* `tests/unit/auth/menu-mi-plan.test.ts` (R10: siete roles, identidad de la constante,
  `primerDestino` de cada rol igual que antes; R12: con todos los módulos apagados sigue) y
  `menu-visibility.test.ts`, `destino-post-login.test.ts`, `menu-modulos.test.ts` y la guardia
  `superadmin-fuera-de-empresa` en verde (R23).
- [x] **T7 [P] — `ConsumoDelPlan` y «Mi plan»** (design §6.2, §6.4). Depende de T3.
  `components/shared/ConsumoDelPlan.tsx`, `app/(app)/mi-plan/page.tsx` (`notFound()` si `forbidden`) y
  `_components/MiPlanModule.tsx`.
  *Hecho:* `tests/components/MiPlanModule.test.tsx` (R1, R6, R7, R11: sin botones ni formularios) y
  `tests/integration/mi-plan-page.test.tsx` (R8: roles sin acceso y sin sesión → «no encontrado»).
- [x] **T8 [P] — «Planes» del superadmin** (design §6.3). Depende de T4.
  `app/(app)/plataforma/planes/page.tsx`, `_components/PlanesModule.tsx`, `_components/PlanForm.tsx`,
  `[planId]/page.tsx`, `[planId]/_components/PlanDetalle.tsx`.
  *Hecho:* `tests/components/PlanesModule.test.tsx` (R13), `tests/components/PlanForm.test.tsx` (R14:
  lo enviado y solo dos visibilidades; R15: inmediato o fecha; R18: `fieldErrors` junto al campo),
  `tests/components/PlanDetalle.test.tsx` (R15 avisos, R16, R17 confirmaciones y archivado sin
  controles, R18) y `tests/integration/plataforma-planes-page.test.tsx` (R22) en verde.
- [x] **T9 [P] — Plan en el detalle de la empresa** (design §6.3). Depende de T4 y T7.
  `[organizacionId]/_components/PlanEmpresa.tsx` y la lectura en `[organizacionId]/page.tsx`.
  *Hecho:* `tests/components/PlanEmpresa.test.tsx` (R18; R19; R20: solo asignables, mensaje del tope;
  R21) y los casos nuevos de `tests/integration/plataforma-empresa-detalle-page.test.tsx` (R19, y que
  un fallo de la lectura del plan no tumba los módulos) en verde.

## Tanda C — cierre

- [x] **T10 — E2E** (design §8, R28). Depende de T5–T9.
  `e2e/planes-superadmin.spec.ts` (y, si hace falta, ayudantes en `e2e/_planes-fixture.ts`).
  *Hecho:* `pnpm exec playwright test e2e/planes-superadmin.spec.ts` en verde en local, y el humo de dos
  empresas (`e2e/dos-empresas-humo.spec.ts`) sigue verde con `/mi-plan` en las rutas del maestro.
- [x] **T11 — Documentación y gate**. Depende de todo.
  Párrafo «Pantallas de planes (SLT-58)» en `docs/architecture.md > Multi-empresa > Planes y límites`
  (la función `plan_de_la_empresa` como segunda y última función que `servi_app` puede llamar; rutas);
  mapa `R<n> → test` en `progress/impl_SLT-58.md`.
  *Hecho:* `./init.sh` en verde; R27: `package.json` sin dependencias nuevas.

## Tanda D — enmienda del 2026-10-29: inicio del ciclo elegido (design §11; R29–R42 y R8)

> P6–P13 cerradas por el humano el 2026-10-29 (P7 con la regla ampliada: R42). Siguen abiertas P14
> (primera asignación sin fecha) y P15 (textos de los avisos de rol y de keys): T14 sigue la propuesta
> de P14 y T15 no fija los textos de P15 hasta que se aprueben. Si cambia alguna, se ajusta el punto de
> design §11 que la cita antes de tocar código.

- [ ] **T12 — Migración `plan_ciclo_inicio_elegido`** (backend_dev; design §11.2). Columna
  `plan_ciclo_corto_desde_at` + `CHECK`, función `plan_inicio_ciclo_en_curso`, `CREATE OR REPLACE` de
  `plan_tope_ordenes`, `plan_cupo_ordenes` y `plan_de_la_empresa`; `down.sql` con los cuerpos de origen
  copiados literalmente; campo en `db/schema.prisma` y comentario de `plan_asignado`. Antes: confirmar que
  `migracion-sl24-ida-y-vuelta.test.ts` no aplica migraciones posteriores (si las aplica, PARAR). Después:
  Grep de `plan_inicio_ciclo(` en `lib/` y `db/migrations/` posteriores: ningún caller de producción con
  el ancla de una empresa fuera de la envoltura.
  *Hecho:* `pnpm run db:migrate` aplica; `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts`
  en verde (R41: `pg_get_functiondef` de las tres funciones igual al de origen tras el `down`; empresa
  con plan previo, mismo uso antes y después; `UPDATE` de `servi_app` a la columna → `42501`);
  `tests/integration/db/plan-de-la-empresa.test.ts` en verde comparando con `plan_inicio_ciclo_en_curso`;
  suite de SL-24 en verde sin tocar sus tests.
- [ ] **T13 — Gemela TS del ciclo** (backend_dev; design §11.3). Depende de T12 (por la parte SQL).
  `inicioDelCicloEnCurso`, corrección de `inicioDelSiguienteCiclo` (antes del ancla → el ancla),
  `rangoDelInicioDelCiclo` y `anclaDeLaFechaElegida` en `lib/planes/ciclo.ts`; tabla
  `tests/integration/db/_fixtures/ciclo-corto.ts`.
  *Hecho:* casos nuevos de `tests/unit/utils/ciclo-plan.test.ts` (R30 rango con el 31 de marzo; R35 con
  la tabla) y `tests/integration/db/plan-ciclo-corto.test.ts` (R34, R35: mismo «en curso»; la base cambia
  de ciclo justo en el «siguiente» de TS) en verde; los casos de SLT-58 T2 siguen verdes.
- [ ] **T14 — Asignar con fecha y vista previa** (backend_dev; design §11.4). Depende de T12 y T13.
  `asignarPlanSchema` con `inicioCiclo` opcional, `previsualizarAsignacionSchema` y
  `VistaPreviaAsignacionResult` en `lib/types/planes.ts`; `PlanesService.asignar` (R30, R31 antes del
  repositorio) y `previsualizarAsignacion`; `PlanesRepository.asignar` (carrera R31, `usoDe` con ciclo
  candidato; en la primera asignación con fecha, TODOS los excedidos —órdenes, roles, API keys— a
  `avisos` en vez de `tope_excedido` (R36, R42); `plan_ciclo_corto_desde_at`, `valorNuevo` = fecha) y
  `vistaPreviaAsignacion` (con los tres tipos de tope); interfaces; `previsualizarAsignacionPlanAction` en
  `lib/actions/planes.ts`; `ciclo_corto_desde` en `MiPlanRepository` y `planCicloCortoDesdeAt` en
  `planDeEmpresa`; textos `ordenesYaPasadas`, `rolYaPasado` y `apiKeysYaPasadas` en
  `lib/planes/mensajes.ts` (los dos últimos, con P15 aprobada); `motivo` ampliado en
  `lib/db/excepciones-aislamiento.ts`. Si `tests/unit/services/planes-service.test.ts` necesita
  `vistaPreviaAsignacion` en su `doble()` para compilar, solo ese `vi.fn` (precedente de la decisión de
  T4); cualquier otro cambio a un test de SL-24, PARAR y preguntar.
  *Hecho:* `tests/unit/services/planes-service-inicio-ciclo.test.ts` (R29, R30 bordes con reloj fijo y
  cero llamadas, R31, R36 y R42 avisos en el `ok`, R37 `forbidden` por rol con cero llamadas) y
  `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (R31 carrera, R32, R33, R34, R36 bloqueo
  y desbloqueo de órdenes, R42 bloqueo y desbloqueo de `adminTienda` y de API keys, y cambio de plan a
  uno menor sigue en `tope_excedido`; R37 avisos de la vista previa = avisos de la asignación, R39) en
  verde; suite de SL-24 en verde sin tocar (`planes-asignacion.test.ts`: R12 sin fecha sigue rechazando).
- [ ] **T15 — Modal de primera asignación** (frontend_dev; design §11.5, §6.5). Depende de T14.
  Campo de fecha con hoy por defecto y `min`/`max` del servidor, vista previa al abrir y al cambiar la
  fecha, aviso, `cicloEmpiezaEl`, error de campo, P11; la página pasa `rangoInicioCiclo` y la action.
  «Cambiar plan» sin campo.
  *Hecho:* casos nuevos de `tests/components/PlanEmpresa.test.tsx` (R29 hoy por defecto y fecha enviada;
  R37 aviso de órdenes con «3.200 de 3.000» y fecha, aviso de un rol y de API keys, sin aviso si no
  pasa, relee al cambiar, lectura fallida → solo «Reintentar» y «Volver»; R38 título y frase;
  «Cambiar plan» no envía `inicioCiclo`; botón deshabilitado con la vista previa en vuelo o fallida) en
  verde.
- [ ] **T16 [P] — «Se reinicia» durante el ciclo corto** (frontend_dev; design §11.3, R40). Depende de
  T13. Puede ir en paralelo con T15.
  *Hecho:* casos nuevos de `tests/unit/planes/consumo.test.ts` (29 de octubre con ancla el 5 de
  noviembre: «en 7 días (2026-11-05)») y de `tests/components/MiPlanModule.test.tsx` en verde.
- [ ] **T17 [P] — R8: 404 HTTP real en `/mi-plan`** (frontend_dev; design §11.6). Independiente de
  T12–T16. El arreglo lo elige el implementer, sin mover la autorización fuera del servicio.
  *Hecho:* `e2e/planes-superadmin.spec.ts` exige `status() === 404` para el `mensajero` de A y pasa en
  local; `tests/integration/mi-plan-page.test.tsx` y el humo de dos empresas siguen verdes.
- [ ] **T18 — Documentación y gate de la enmienda**. Depende de T12–T17.
  En `docs/architecture.md > Multi-empresa > Planes y límites`, una línea sobre el inicio del ciclo
  elegido y `plan_inicio_ciclo_en_curso` como única definición del ciclo en curso; mapa `R29–R42 → test`
  y el test nuevo de R8 en `progress/impl_SLT-58.md`.
  *Hecho:* `./init.sh` en verde; `package.json` sin dependencias nuevas (R27).

## Archivos esperados

- `db/migrations/20261029120000_plan_de_la_empresa/migration.sql`
- `db/migrations/20261029120000_plan_de_la_empresa/down.sql`
- `lib/planes/ciclo.ts`
- `lib/planes/consumo.ts`
- `lib/planes/mensajes.ts`
- `lib/types/consumo-plan.ts`
- `lib/types/planes.ts`
- `lib/interfaces/repositories/IMiPlanRepository.ts`
- `lib/interfaces/services/IMiPlanService.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/interfaces/services/IPlanesService.ts`
- `lib/repositories/MiPlanRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/services/MiPlanService.ts`
- `lib/services/PlanesService.ts`
- `lib/actions/_shared/mi-plan.ts`
- `lib/actions/_shared/planes-plataforma.ts`
- `lib/actions/planes.ts`
- `lib/auth/menu-visibility.ts`
- `lib/modulos/reparto.ts`
- `lib/db/excepciones-aislamiento.ts`
- `app/(app)/_components/Sidebar.tsx`
- `app/(app)/mi-plan/page.tsx`
- `app/(app)/mi-plan/_components/MiPlanModule.tsx`
- `app/(app)/plataforma/planes/page.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/[planId]/page.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `components/shared/ConsumoDelPlan.tsx`
- `tests/unit/planes/consumo.test.ts`
- `tests/unit/utils/ciclo-plan.test.ts`
- `tests/unit/services/mi-plan-service.test.ts`
- `tests/unit/services/planes-service-lecturas.test.ts`
- `tests/unit/auth/menu-mi-plan.test.ts`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/integration/db/plan-de-la-empresa.test.ts`
- `tests/integration/db/planes-lecturas-plataforma.test.ts`
- `tests/integration/mi-plan-page.test.tsx`
- `tests/integration/plataforma-planes-page.test.tsx`
- `tests/integration/plataforma-empresa-detalle-page.test.tsx`
- `tests/components/MiPlanModule.test.tsx`
- `tests/components/PlanesModule.test.tsx`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanDetalle.test.tsx`
- `tests/components/PlanEmpresa.test.tsx`
- `e2e/planes-superadmin.spec.ts`
- `e2e/_planes-fixture.ts`
- `docs/architecture.md`
- `progress/impl_SLT-58.md`

Añadidos por la enmienda del 2026-10-29 (tanda D). Ya listados arriba y tocados de nuevo:
`lib/planes/ciclo.ts`, `lib/planes/mensajes.ts`, `lib/types/planes.ts`, `lib/interfaces/repositories/IPlanesRepository.ts`,
`lib/interfaces/services/IPlanesService.ts`, `lib/repositories/PlanesRepository.ts`, `lib/repositories/MiPlanRepository.ts`,
`lib/services/PlanesService.ts`, `lib/actions/planes.ts`, `lib/db/excepciones-aislamiento.ts`,
`app/(app)/plataforma/empresas/[organizacionId]/page.tsx`, `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`,
`app/(app)/mi-plan/page.tsx`, `tests/unit/utils/ciclo-plan.test.ts`, `tests/unit/planes/consumo.test.ts`,
`tests/integration/db/plan-de-la-empresa.test.ts`, `tests/components/PlanEmpresa.test.tsx`,
`tests/components/MiPlanModule.test.tsx`, `e2e/planes-superadmin.spec.ts`. No listados antes (nuevos o
existentes que ahora se tocan; `planes-service.test.ts` solo si hace falta el `vi.fn` de T14):

- `db/migrations/20261029150000_plan_ciclo_inicio_elegido/migration.sql`
- `db/migrations/20261029150000_plan_ciclo_inicio_elegido/down.sql`
- `db/schema.prisma`
- `app/(app)/mi-plan/loading.tsx`
- `tests/unit/services/planes-service-inicio-ciclo.test.ts`
- `tests/unit/services/planes-service.test.ts`
- `tests/integration/db/_fixtures/ciclo-corto.ts`
- `tests/integration/db/plan-ciclo-corto.test.ts`
- `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts`
- `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts`
