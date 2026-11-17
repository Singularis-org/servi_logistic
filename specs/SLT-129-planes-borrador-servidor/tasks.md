# SLT-129 — planes-borrador-servidor · tasks.md

Todo es backend (`backend_dev`). Las referencias `§n` son de `design.md`. Antes de cerrar cada tanda, corre
`./init.sh`. Si muere por memoria, corre solo typecheck y guardias, y deja la suite al CI.

## T1 — Esquema y migración (§1)

- [ ] T1.1 Modelo `PlanBorrador` en `db/schema.prisma`, con la relación opcional `borradorDeCambio` en `Plan` y
  un comentario que diga qué vive solo en el SQL.
- [ ] T1.2 `db/migrations/20261117120000_plan_borrador/migration.sql` (tabla, `UNIQUE`, FK `CASCADE`, los tres
  `CHECK`, RLS sin políticas, `REVOKE ALL … FROM servi_app`, dentro de `BEGIN/COMMIT`) y `down.sql`.
- [ ] T1.3 `{ modelo: "PlanBorrador", tabla: "plan_borrador" }` en la lista de plataforma de
  `lib/db/modelos-de-negocio.ts`.
- [ ] T1.4 Tests: `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts` (R24) y el caso de
  `servi_app` en `tests/integration/db/planes-acceso-servi-app.test.ts` (R23).

**Hecho:** la migración sube y baja en una base desechable, `prisma generate` y el typecheck pasan, la guardia
`organizacion-en-modelos` sigue en verde y R23 y R24 están en verde.

## T2 — Esquemas por paso y helpers puros (§3, §5.1) [P con T1]

- [ ] T2.1 En `lib/types/planes.ts`, exportar las reglas internas (`nombreSchema`, `fechaSchema`,
  `modulosSchema`, `unSoloModo`/`UN_SOLO_MODO` y los refines de `crearPlanSchema`) y hacer que
  `crearPlanSchema` las use, sin cambiar su salida ni sus mensajes.
- [ ] T2.2 `lib/types/plan-borrador.ts`: `PASOS_DE_CREAR`, `PASOS_DE_EDITAR`, el esquema de cada paso, la lista
  de descuentos, `guardarPasoBorradorSchema` y los esquemas de leer, descartar y confirmar. También los tipos de
  resultado de §4 (`GuardarPasoResult`, `BorradorVista`, `BorradorResumen`, `ConfirmarBorradorResult`…).
- [ ] T2.3 `lib/planes/borrador.ts`: `pasosDelModo`, `pasosQueFaltan`, `descuentosDeLaLista`,
  `peticionDeCrear`, `peticionDeEditar` y `BorradorNoEncontrado`.
- [ ] T2.4 Tests: `tests/unit/types/plan-borrador-schema.test.ts` (R3, R6, R7) y
  `tests/unit/planes/plan-borrador.test.ts` (R16 y la conversión de la petición).

**Hecho:** los tests nuevos en verde y `tests/unit/types/planes-schema*.test.ts` sin tocar y en verde (R21).

## T3 — Repositorio (§1.1, §5.4) — depende de T1 y T2

- [ ] T3.1 `lib/interfaces/repositories/IPlanBorradorRepository.ts`.
- [ ] T3.2 En `PlanesRepository`, los métodos de borrador: `crearBorrador`, `guardarPasoDeCreacion`,
  `guardarPasoDeCambio` (con `ON CONFLICT ("plan_id")` y el plan bajo `FOR SHARE`), `borrador`,
  `borradorDelPlan`, `borradores` y `descartar`. El nombre del iniciador se congela como el del rastro.
- [ ] T3.3 `consumirBorrador` (`FOR UPDATE` al empezar, `DELETE` solo en el camino `ok`) dentro de `crearEnTx`
  (con el `id` del borrador como id del plan), `crearYAsignar`, `editar` y `programarCambio`, con un parámetro
  opcional nuevo en `lib/interfaces/repositories/IPlanesRepository.ts`.
- [ ] T3.4 Ampliar el `motivo` de `PlanesRepository` en `lib/db/excepciones-aislamiento.ts`.

**Hecho:** typecheck en verde, y las suites de hoy de `tests/integration/db/planes-*.test.ts` sin cambios y en
verde (R21).

## T4 — Servicio (§5.2, §5.3) — depende de T3

- [ ] T4.1 `IPlanesService` y `PlanesService`: el tercer parámetro opcional `{ borradorId }` en `crear` y
  `editar`, que se pasa al repositorio. Sin él, el comportamiento es el de hoy.
- [ ] T4.2 `lib/interfaces/services/IPlanBorradorService.ts` y `lib/services/PlanBorradorService.ts`
  (`guardarPaso`, `leer`, `borradores`, `descartar`, `confirmar`).
- [ ] T4.3 Test: `tests/unit/services/plan-borrador-service.test.ts` (R1, R3, R6, R16, R19, R20).

**Hecho:** el test nuevo en verde y `tests/unit/services/planes-service*.test.ts` sin cambios y en verde.

## T5 — Actions (§4) — depende de T4

- [ ] T5.1 `lib/actions/plan-borrador.ts`: `guardarPasoBorradorAction`, `leerBorradorAction`,
  `descartarBorradorAction` y `confirmarBorradorAction`, con su composition root.
- [ ] T5.2 `"plan-borrador": "nucleo"` en `lib/modulos/reparto.ts`.
- [ ] T5.3 Test: `tests/unit/actions/plan-borrador.test.ts` (el actor sale de la sesión y el servicio se
  construye con el repositorio real).

**Hecho:** el test nuevo en verde y las guardias de reparto de módulos en verde.

## T6 — Integración contra Postgres — depende de T3–T5

- [ ] T6.1 `tests/integration/db/plan-borrador.test.ts`: R2, R4 (con dos conexiones en paralelo), R5 (los
  primeros guardados simultáneos), R8–R14 y R22.
- [ ] T6.2 `tests/integration/db/plan-borrador-confirmar.test.ts`: R17 (público y custom), R18 (pendiente,
  recepciones de SLT-128, trabajos de aviso, rastro), R19 (validación y reglas, el borrador queda) y R20 (dos
  confirmaciones simultáneas, borrador descartado).

**Hecho:** las dos suites en verde con `HAY_BASE_DE_DATOS`, y cada `R<n>` con su test en
`progress/impl_SLT-129.md`.

## T7 — Guardia (§7) [P con T6]

- [ ] T7.1 `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts`, con su contraprueba (R15).

**Hecho:** en verde sobre el árbol, y en rojo sobre un texto en memoria con un `DELETE FROM "plan_borrador"`
fuera de `PlanesRepository` o con `plan_borrador` en un cron.

## T8 — Cierre

- [ ] T8.1 `./init.sh` en verde.
- [ ] T8.2 Antes del PR, en local y sobre una base desechable: `e2e/planes-superadmin.spec.ts`,
  `e2e/planes-costeo.spec.ts`, `e2e/planes-costo-porcentual.spec.ts` y `e2e/mi-plan-cambiar-plan.spec.ts`
  (R21; el diff toca `db/`).
- [ ] T8.3 El mapa `R1–R24 → test` en `progress/impl_SLT-129.md`.

**Hecho:** el gate local en verde, los E2E de planes en verde y el mapa completo.

## Archivos esperados

Producción:
- `db/schema.prisma`
- `db/migrations/20261117120000_plan_borrador/migration.sql`
- `db/migrations/20261117120000_plan_borrador/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/modulos/reparto.ts`
- `lib/types/planes.ts`
- `lib/types/plan-borrador.ts`
- `lib/planes/borrador.ts`
- `lib/interfaces/repositories/IPlanBorradorRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/interfaces/services/IPlanBorradorService.ts`
- `lib/interfaces/services/IPlanesService.ts`
- `lib/services/PlanBorradorService.ts`
- `lib/services/PlanesService.ts`
- `lib/actions/plan-borrador.ts`

Tests:
- `tests/unit/types/plan-borrador-schema.test.ts`
- `tests/unit/planes/plan-borrador.test.ts`
- `tests/unit/services/plan-borrador-service.test.ts`
- `tests/unit/actions/plan-borrador.test.ts`
- `tests/unit/guards/plan-borrador-sin-caducidad.guardia.test.ts`
- `tests/integration/db/plan-borrador.test.ts`
- `tests/integration/db/plan-borrador-confirmar.test.ts`
- `tests/integration/db/planes-acceso-servi-app.test.ts`
- `tests/integration/db/migracion-plan-borrador-ida-y-vuelta.test.ts`

## Tamaño

26 archivos (tope 40). Unas 900 líneas de producción (tope 1000; aviso en 800) y unas 1600 de tests (tope
3000). Si se pasa de 1000 en producción, el corte está en `design.md > 11. Tamaño`.
