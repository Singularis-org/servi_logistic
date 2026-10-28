# SL-24 — planes-y-limites · tasks.md

> Requisitos en `requirements.md` (R1–R36) y diseño en `design.md`. P1–P5 están cerradas
> (2026-10-27). **No se empieza ninguna task hasta que el humano apruebe el spec.**
>
> Reparto: `backend_dev` hace T0–T6, T7a, T8 y T9; `frontend_dev` hace T7b.
> `[P]` = puede ir en paralelo con las otras `[P]` de la misma tanda.

## Tanda A — base

- [x] **T0. Preparación.**
  - Comprobar que `20261026120200_job_estado_descartado` sigue siendo la última migración de
    `dev`. Si no, renombrar las tres de SL-24 a timestamps posteriores **antes** de aplicarlas en
    ninguna base compartida.
  - Comprobar si `scripts/verificar-rls-despliegue.ts` cuenta tablas de plataforma con RLS. Si
    las cuenta, se ajusta en T1.
  - **Hecho:** nota en `progress/impl_SL-24.md` con la última migración vista y la decisión.
- [x] **T1. Migración `20261027130000_plan` + Prisma** (depende de T0).
  - Las tablas, enum, `CHECK`, FK, RLS sin políticas y `REVOKE` de `design.md > §2`.
  - Las columnas de `organizacion` y el índice parcial de `orden`.
  - En Prisma, los modelos `Plan` (con `topeApiKeys`), `PlanTopeRol`, `PlanModulo` y
    `PlanRastro` y los enums `PlanVisibilidad` y `PlanRastroAccion`; en `Organizacion`, las dos
    columnas y las relaciones, con sus comentarios de lo que vive solo en SQL.
  - Clasificar los cuatro modelos en `MODELOS_DE_PLATAFORMA`.
  - Escribir `down.sql`.
  - **Hecho:**
    - `pnpm run typecheck` y las guardias `organizacion-en-modelos`, `rls-por-empresa`,
      `unicos-por-empresa` y el diff de drift en verde;
    - `tests/integration/db/planes-catalogo.test.ts` cubre los `CHECK` (R3, R25) y R1, R6 y R7
      a nivel de base;
    - `tests/integration/db/planes-acceso-servi-app.test.ts` da `42501` en cada escritura y
      lectura con `servi_app` (R8).
- [x] **T2. Migración `20261027130100_historial_accion_planes` + tipos** [P con T3] (depende de T1).
  - El tipo `plan_asignado`, la entidad `plan`, la categoría `cambia_plan` y
    `etiquetaDeEntidad("plan", …)`.
  - `down.sql` con el patrón de `20261026120100`.
  - **Hecho:** las guardias `historial-accion-*` en verde.
- [x] **T3. Migración `20261027130200_plan_topes_triggers` + traducción** [P con T2] (depende de T1).
  - Las funciones y los cinco triggers de `design.md > §4`, sobre `orden`, `usuario` y `api_key`.
  - `lib/db/sqlstate.ts`, extraído de `contexto-empresa.ts` sin cambiar su comportamiento.
  - `lib/planes/tope-error.ts`, `lib/planes/ciclo.ts` y `lib/planes/mensajes.ts`.
  - **Hecho:**
    - en verde contra Postgres:
      - integración: `plan-topes-ordenes`, `plan-topes-usuarios`, `plan-topes-api-keys`,
        `plan-topes-concurrencia` y `plan-ciclo`;
      - unit: `ciclo-plan`, `sqlstate` y `tope-error`;
    - queda probado contra la base que el JSON viaja en `MESSAGE` por las dos formas de error de
      Prisma (`design.md > §4.1`);
    - las mutaciones 1, 2, 3, 5, 6 y 7 de `design.md > §11` medidas y anotadas.

## Tanda B — gestión del superadmin

- [ ] **T4. `PlanesRepository` + `PlanesService` + `lib/types/planes.ts`** (depende de T2 y T3).
  - Crear, editar, archivar, asignar, asignables y públicos, con los cerrojos de
    `design.md > §4.4` y §5.
  - `lib/planes/rastro.ts` (`diferenciasDelPlan`) y la escritura de `plan_rastro` en la misma
    transacción (`design.md > §2.8, §9`).
  - Extraer `lib/repositories/_shared/modulos-en-tx.ts` de `ModulosEmpresaRepository`, sin
    cambiar su comportamiento.
  - La excepción en `EXCEPCIONES_DE_PLATAFORMA`.
  - **Hecho:**
    - `planes-schema`, `planes-service`, `rastro`, `planes-asignacion`, `planes-edicion-en-uso`
      y `planes-historial` en verde;
    - las suites de SL-23 (`modulos-empresa-service`, `organizacion-modulo`,
      `modulos-empresa-historial`) siguen en verde sin tocarlas;
    - la mutación 4 medida;
    - la carga de 500 filas, medida con plan y sin plan, anotada en `progress/impl_SL-24.md`
      (`design.md > §15`).
- [ ] **T5. `lib/actions/planes.ts`** (depende de T4).
  - Las cinco actions y su composition root.
  - `planes: "nucleo"` en `lib/modulos/reparto.ts`.
  - **Hecho:** `planes.composition-root` en verde y `modulos-reparto.guardia` en verde.

## Tanda C — las vías de alta

- [ ] **T6. Órdenes: `CupoPlanRepository` + `BulkOrdenService` + los dos routes** [P con T7a] (depende de T3).
  - El 4º parámetro opcional del constructor y la comprobación previa en `cargarMasiva` (también
    en la vista previa) y en `cargarViaApi`.
  - La reclasificación tras el trigger.
  - La inyección en `chunk/route.ts` y `api-key/carga/route.ts`.
  - **Hecho:**
    - `bulk-orden-service.tope-plan`, `api-key-carga-tope-plan` y
      `carga-composition-root-cupo` en verde;
    - las suites existentes de `BulkOrdenService` en verde **sin tocar ningún archivo de
      `tests/fabricas/`**.
- [ ] **T7a. Usuarios y API keys: servicios** [P con T6] (depende de T3).
  - `UsuarioService` (crear, actualizar, cambiarEstado) y `AprobacionPostulacionService` traducen
    el tope a su resultado (`design.md > §6.3`).
  - `ApiKeyService` (crear, activar) hace lo mismo (`design.md > §6.5`).
  - Los tipos de resultado ganan la variante `tope_plan`.
  - Confirmar la clave del campo de rol en `UsuarioForm` (`rolId`).
  - Confirmar que `mapDuplicadoError` y el `catch` de `ApiKeyService.crear` dejan pasar el error
    sin cambiarlo.
  - Buscar los escritores de `usuario.estado = 'activo'`. Si alguno desbloquea cuentas solo,
    parar y preguntar (`design.md > §15`).
  - **Hecho:**
    - `usuario-service-tope-plan`, `aprobacion-postulacion-tope-plan` y
      `api-key-service-tope-plan` en verde;
    - `UserRepository.ts` y `ApiKeyRepository.ts` sin cambios en el diff.
- [ ] **T7b. Las cuatro pantallas existentes** (depende de T7a).
  - `UsuariosModule`, `PostulacionesPendientesPanel`, `ApiKeysModule` y `ApiKeyAccionCell`
    muestran `mensaje` con `tope_plan` (`design.md > §8`).
  - **Hecho:** `UsuariosTopePlan`, `PostulacionesTopePlan` y `ApiKeysTopePlan` (componentes) en
    verde.

## Tanda D — cierre

- [ ] **T8. Guardias** [P con T9] (depende de T1).
  - `planes-sin-seed` y `planes-sin-borrado`, con contraprueba sintética.
  - **Hecho:** las dos en verde y en rojo con su contraprueba.
- [ ] **T9. Migración de ida y vuelta + E2E** [P con T8] (depende de T5 y T6).
  - `migracion-sl24-ida-y-vuelta`.
  - `e2e/_planes-fixture.ts` y el caso nuevo de `e2e/dos-empresas-humo.spec.ts`
    (`design.md > §11.1`).
  - **Hecho:**
    - `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts` en verde, con los casos previos
      de SL-17 y SL-23 intactos;
    - el test de ida y vuelta en verde.
- [ ] **T10. Documentación y gate.**
  - `docs/architecture.md > Multi-empresa` gana un párrafo «Planes y límites (SL-24)»: tablas,
    triggers, cerrojos y quién escribe.
  - Mapa `R<n> → test` completo en `progress/impl_SL-24.md`.
  - **Hecho:** `./init.sh` en verde y cada R1–R36 con al menos un test que existe.

## No se tocan, a propósito

Ver `design.md > §14`. Van aquí y no en «Archivos esperados», porque
`scripts/archivos-en-vuelo.mjs` lee todas las rutas de esa sección. Son las fábricas de test y
los scripts de la demo de QA, de SL-43, y en SLT-32 el directorio de autenticación de `lib`,
`AuthService` y `UserRepository`. Tampoco se toca `ApiKeyRepository`.

## Archivos esperados

### Base de datos
- `db/schema.prisma`
- `db/migrations/20261027130000_plan/migration.sql`
- `db/migrations/20261027130000_plan/down.sql`
- `db/migrations/20261027130100_historial_accion_planes/migration.sql`
- `db/migrations/20261027130100_historial_accion_planes/down.sql`
- `db/migrations/20261027130200_plan_topes_triggers/migration.sql`
- `db/migrations/20261027130200_plan_topes_triggers/down.sql`

### lib
- `lib/db/sqlstate.ts`
- `lib/db/contexto-empresa.ts`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/planes/tope-error.ts`
- `lib/planes/ciclo.ts`
- `lib/planes/mensajes.ts`
- `lib/planes/rastro.ts`
- `lib/types/planes.ts`
- `lib/types/api-key.ts`
- `lib/interfaces/services/IApiKeyService.ts`
- `lib/services/ApiKeyService.ts`
- `lib/actions/api-keys.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/types/usuario.ts`
- `lib/types/aprobacion-postulacion.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/interfaces/repositories/ICupoPlanRepository.ts`
- `lib/interfaces/services/IPlanesService.ts`
- `lib/interfaces/services/IBulkOrdenService.ts`
- `lib/interfaces/services/IUsuarioService.ts`
- `lib/interfaces/services/IAprobacionPostulacionService.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/repositories/CupoPlanRepository.ts`
- `lib/repositories/ModulosEmpresaRepository.ts`
- `lib/repositories/_shared/modulos-en-tx.ts`
- `lib/services/PlanesService.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/UsuarioService.ts`
- `lib/services/AprobacionPostulacionService.ts`
- `lib/actions/planes.ts`
- `lib/actions/usuarios.ts`
- `lib/actions/aprobacion-postulaciones.ts`
- `lib/modulos/reparto.ts`

### app
- `app/api/ordenes/carga-masiva/chunk/route.ts`
- `app/api/ordenes/api-key/carga/route.ts`
- `app/(app)/configuracion/_components/UsuariosModule.tsx`
- `app/(app)/_components/PostulacionesPendientesPanel.tsx`
- `app/(app)/configuracion/api/_components/ApiKeysModule.tsx`
- `app/(app)/configuracion/api/_components/ApiKeyAccionCell.tsx`

### tests
- `tests/integration/db/_fixtures/planes.ts`
- `tests/integration/db/plan-topes-ordenes.test.ts`
- `tests/integration/db/plan-topes-concurrencia.test.ts`
- `tests/integration/db/plan-topes-usuarios.test.ts`
- `tests/integration/db/plan-topes-api-keys.test.ts`
- `tests/unit/services/api-key-service-tope-plan.test.ts`
- `tests/unit/planes/rastro.test.ts`
- `tests/components/ApiKeysTopePlan.test.tsx`
- `tests/integration/db/plan-ciclo.test.ts`
- `tests/integration/db/planes-catalogo.test.ts`
- `tests/integration/db/planes-asignacion.test.ts`
- `tests/integration/db/planes-edicion-en-uso.test.ts`
- `tests/integration/db/planes-historial.test.ts`
- `tests/integration/db/planes-acceso-servi-app.test.ts`
- `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts`
- `tests/unit/utils/ciclo-plan.test.ts`
- `tests/unit/types/planes-schema.test.ts`
- `tests/unit/services/planes-service.test.ts`
- `tests/unit/services/bulk-orden-service.tope-plan.test.ts`
- `tests/unit/services/usuario-service-tope-plan.test.ts`
- `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts`
- `tests/unit/api/api-key-carga-tope-plan.test.ts`
- `tests/unit/api/carga-composition-root-cupo.test.ts`
- `tests/unit/actions/planes.composition-root.test.ts`
- `tests/unit/db/sqlstate.test.ts`
- `tests/unit/planes/tope-error.test.ts`
- `tests/unit/guards/planes-sin-seed.guardia.test.ts`
- `tests/unit/guards/planes-sin-borrado.guardia.test.ts`
- `tests/components/UsuariosTopePlan.test.tsx`
- `tests/components/PostulacionesTopePlan.test.tsx`

### e2e
- `e2e/_planes-fixture.ts`
- `e2e/dos-empresas-humo.spec.ts`

### docs y progreso
- `docs/architecture.md`
- `progress/impl_SL-24.md`
