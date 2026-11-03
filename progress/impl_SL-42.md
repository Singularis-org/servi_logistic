# SL-42 — bitácora de implementación (backend_dev)

## Tanda T1 (T1.1, T1.2) — 2026-11-03

### Archivos
Creados:
- `db/migrations/20261103120000_vehiculo_activo/migration.sql` + `down.sql`
- `db/migrations/20261103120100_vehiculo_rastro/migration.sql` + `down.sql`
- `lib/repositories/registrar-rastro-vehiculo.ts` (`appendRastroVehiculo(tx, entrada)`, escritor único)
- `tests/integration/db/vehiculos-plataforma.test.ts` (R22; T2 añade R6, R7, R21)

Modificados:
- `db/schema.prisma`: `activo Boolean @default(true)` en `Vehiculo`; `enum VehiculoRastroAccion`; `model VehiculoRastro`
- `lib/db/modelos-de-negocio.ts`: `VehiculoRastro` en `MODELOS_DE_PLATAFORMA`
- `tests/integration/db/vehiculos-migration.test.ts`: bloques SL-42/R23 (estático + Postgres)

### R → test
- R22 → `tests/integration/db/vehiculos-plataforma.test.ts` › «R22 — SQL a mano con servi_app: SELECT, INSERT, UPDATE y DELETE de `vehiculo_rastro` dan 42501» y «R22 — por el cliente de la app en contexto de empresa: leer o escribir el rastro se rechaza»
- R23 → `tests/integration/db/vehiculos-migration.test.ts` › «SL-42/R23 — el up y el down, contra Postgres» (filas previas activas; el down quita la columna con las mismas filas) y «SL-42/R23 — `servi_app` sigue sin escribir `vehiculos`» (INSERT/UPDATE/DELETE → 42501); más la forma en disco.

### Verificación
Con `DATABASE_URL` en la base local `logistic` (2026-11-03, `NODE_OPTIONS=--max-old-space-size=8192`):
- `pnpm exec prisma migrate deploy`: aplicó `20261103120000_vehiculo_activo` y `20261103120100_vehiculo_rastro`
  («All migrations have been successfully applied»).
- `pnpm run typecheck` (`tsc --noEmit`): sin errores.
- `pnpm run lint`: `✖ 234 problems (0 errors, 234 warnings)`, todos heredados; ninguno en los archivos de esta tanda.
- `pnpm exec vitest run tests/unit/guards/organizacion-en-modelos.guardia.test.ts tests/integration/db/vehiculos-migration.test.ts tests/integration/db/vehiculos-plataforma.test.ts`:
  `Test Files 3 passed (3)`, `Tests 33 passed (33)`, **0 skipped**. Los casos contra Postgres CORRIERON:
  R22 (SQL con servi_app → 42501; cliente de la app en contexto de empresa → rechazo), R23 (up: filas previas
  activas; down: quita la columna, idempotente; servi_app: INSERT/UPDATE/DELETE en `vehiculos` → 42501).
- Tras los tests la base quedó con las dos migraciones aplicadas: columna `vehiculos.activo` presente, tabla
  `vehiculo_rastro` presente, ambas filas de `_prisma_migrations` terminadas y sin rollback.
- `pnpm exec vitest related --run <archivos cambiados>`: **no terminó**. Claude Code lo paró por falta de
  memoria en el sistema, así que no hay resultado. Queda para CI (`gate-completo`) o para correrlo a mano.

### Veredicto
T1.1 y T1.2 hechas: migraciones aplicadas, guardia y tests de R22/R23 en verde contra Postgres; `vitest related` pendiente (lo paró la falta de memoria).
