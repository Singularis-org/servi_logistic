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

## Tanda T2 (T2.1 hecha; T2.2–T2.6 PARADAS) — 2026-11-04

### Archivos
Modificados:
- `lib/types/vehiculos.ts`: `activo` en `VehiculoDTO`; `renombrarVehiculoSchema` y `cambiarActivacionVehiculoSchema` (`strict`, con `id` dentro del objeto) y sus tipos de entrada.
- `lib/repositories/VehiculoRepository.ts`: `toDTO` devuelve `activo` (solo eso, para que compile; el resto de T2.2 no se tocó).
- `tests/unit/types/vehiculos.test.ts`: bloque «SL-42/R9».
- Fixtures con `activo: true`: `tests/unit/services/vehiculo-service.test.ts`, `tests/integration/actions/vehiculos-action.test.ts`, `tests/components/TarifasAlineacionRejilla.test.tsx`, `tests/components/TarifasClaridadMontos.test.tsx`.

### R → test (esta tanda)
- R9 → `tests/unit/types/vehiculos.test.ts` › «SL-42/R9 — renombrar y cambiar la activacion validan la entrada entera» (vacío, <2 y >40 tras normalizar, campo desconocido en los tres schemas, id vacío, `activo` no booleano). La parte del borde (`validation_error` por campo) queda para T2.4.

### Verificación (NODE_OPTIONS=--max-old-space-size=8192)
- `pnpm run typecheck`: sin errores (tras añadir `activo` a las fixtures tipadas como `VehiculoDTO`).
- `pnpm exec eslint` sobre los archivos de lib y el test de tipos: sin salida (0 problemas).
- `pnpm exec vitest run tests/unit/types/vehiculos.test.ts tests/unit/services/vehiculo-service.test.ts tests/integration/actions/vehiculos-action.test.ts tests/components/TarifasAlineacionRejilla.test.tsx tests/components/TarifasClaridadMontos.test.tsx`: `Test Files 5 passed (5)`, `Tests 46 passed (46)`. Sin integración contra Postgres en esta task.

### Bloqueo de T2.2 (hueco del design, sin decidir)
R21 pide congelar el **nombre** del actor en `vehiculo_rastro`. El nombre está en `usuario`, que es modelo de **negocio** (`lib/db/modelos-de-negocio.ts`). El design §3 (alternativa A3) descarta `comoPlataforma` porque supone que «ninguna operación toca una tabla de negocio». Pero sin contexto, la extensión rechaza todo modelo de negocio con `EmpresaNoResuelta` (`lib/db/extension-empresa.ts`, `aplicar`, rama `!ctx`), también dentro de la `$transaction` interactiva. `resolverActorCongelado(tx, id)` fallaría así, y R7 lo prohíbe. Los precedentes leen el actor dentro de `comoPlataforma`: `PlanesRepository` (SL-24, en `EXCEPCIONES_DE_PLATAFORMA`) y `geografia-plataforma.ts` (SL-20). Hace falta decisión humana; opciones en el informe al leader.

Un segundo punto para T2.4: `app/(app)/configuracion/vehiculos/_components/VehiculosModule.tsx` importa `crearVehiculo`, `actualizarVehiculo` y `borrarVehiculo`. Sacarlos de `lib/actions/vehiculos.ts` antes de T4.2 deja el typecheck rojo, y backend no toca `app/`.

### Veredicto
T2.1 hecha y verde. T2.2–T2.6 paradas por el hueco del contexto de datos para el actor del rastro (R7 contra R21).
