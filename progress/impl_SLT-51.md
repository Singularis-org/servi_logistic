# SLT-51 — bitácora de implementación

## Backend (backend_dev, T1-T3) — 2026-10-29

Commits: `bce03bc3` (T1), `54534e50` (T2), `764ceaff` (T3). `bce03bc3` solo no compila
(ZonaService se adapta en `54534e50`); la rama compila desde `54534e50`.

### Archivos

- `lib/types/zona.ts` — `crearZonaSchema.cobroVehiculo` `.default(false)`; `actualizarZonaSchema` con
  `cobroVehiculo`/`tarifas` `.optional()` sin default y `superRefine` (los dos ausentes válido; uno
  solo → issue en el que falta; los dos → `applyTarifaRules`). `.strict()` se mantiene.
- `lib/interfaces/repositories/IZonaRepository.ts` — `UpdateZonaData.cobroVehiculo?`/`tarifas?`.
- `lib/services/ZonaService.ts` — `prepararDatos` valida vehículos solo con `tarifas` y propaga
  `undefined`; `crear` pasa los valores del zod. `MSG_SIN_ZONA_CENTRAL` con «zona de bodega principal».
  Sin cambios en dependencias inyectadas (composition root intacto).
- `lib/repositories/ZonaRepository.ts` — `update`: sin `tarifas` no lee `pagosPrevios`, no hace
  `deleteMany`/`createMany` de `tarifa_zona_mensajero` ni escribe `zona_pago_mensajero_cambiado`;
  `cobroVehiculo: undefined` no escribe la columna.
- Tests: `tests/unit/types/zona-schema.test.ts`, `tests/unit/services/zona-service.test.ts`,
  `tests/integration/actions/zonas-action.test.ts`, `tests/integration/db/zona-guardado-conserva-costos.test.ts` (nuevo).

### Mapa R → test (parte backend)

| R | Test |
|---|---|
| R2 | `zonas-action.test.ts` › «SLT-51/R2 …» (admin, mensajero, adminTienda, adminSatelite, apiKey: crear/obtener/actualizar/borrar → `forbidden`, 0 llamadas al repositorio) |
| R5 | `zona-schema.test.ts` › «R5: crear SIN los dos…»; `zona-service.test.ts` › «R5: crear sigue pasando valores…»; `zona-guardado-conserva-costos.test.ts` › «R5: crear SIN costos…» |
| R6 | `zona-guardado-conserva-costos.test.ts` › «⭑ R6/R7: actualizar con { nombre, distritoIds }…» |
| R7 | mismo caso (cobro_vehiculo sigue `true`) + `zona-schema.test.ts` › «R7…» + `zona-service.test.ts` › «R7…» + `zonas-action.test.ts` › «R7…» |
| R8 | `zona-schema.test.ts` › «R8» ×2; `zonas-action.test.ts` › «⭑ R8» ×2 (0 llamadas al repo); `zona-guardado-conserva-costos.test.ts` › «⭑ R8: solo `tarifas`…» (foto antes = después) |
| R9 | `zona-pago-mensajero-rastro.test.ts` (18, aserciones 380 sin cambios); `zona-schema.test.ts` › «R9…»; `zona-service.test.ts` › «R9…»; contraprueba en `zona-guardado-conserva-costos.test.ts` |
| R10 (MSG) | `zona-service.test.ts` y `zonas-action.test.ts` (literal del motivo `esCentral`) |

### Mutaciones (contra Postgres, base `servi_slt51` local)

| Mutación en `ZonaRepository.update` | Resultado `zona-guardado-conserva-costos.test.ts` |
|---|---|
| `deleteMany` de `tarifa_zona_mensajero` incondicional | ROJO: 1 failed / 3 passed (R6/R7) |
| `cobroVehiculo: data.cobroVehiculo ?? false` | ROJO: 1 failed / 3 passed («expected false to be true») |
| quitar `tocaPagos &&` de la fila 380 | ROJO: 1 failed / 3 passed («expected 2 to be 1») |
| revertido | VERDE: 4 passed / 0 skipped |

R8 en `zona-schema.test.ts` antes del cambio: 3 failed / 22 passed (R5, R7 y «solo cobroVehiculo»;
«solo tarifas» ya fallaba por `cobroVehiculo` obligatorio). Después: 25 passed.

### Salidas

- Archivos propios (con base): `zonas-action` 31 ✓, `zona-guardado-conserva-costos` 4 ✓,
  `zona-pago-mensajero-rastro` 18 ✓, `zona-service` 37 ✓, `zona-schema` 25 ✓ — 115 passed, 0 failed, 0 skipped.
- `vitest related` sobre los 4 archivos de `lib/` (arrastra 418 archivos, porque `ZonaRepository` se
  importa en todo el dominio): 312 archivos verdes, 106 rojos; los 106 están en
  `tests/baseline-rojos.json`, y el error dominante es de entorno (`orden` vacía: falta `db:seed`
  en la base de la feature, y fixtures que cruzan empresas). El único vecino de zonas
  (`tarifa-zona-borrado-fk-real.test.ts`) falla igual con los 4 archivos de `lib/` en su versión
  anterior (9 skipped, beforeAll: `orden` vacía).
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él tsc muere por heap):
  EXIT 0 tras T2. Al cierre sale EXIT 2 con 3 errores AJENOS (`HistorialAccionRepository.ts`,
  `historial-accion.ts:696`, el enum `cierre_dia_pago_mensajero_ajustado`): el Prisma client del
  `node_modules` compartido (junction) lo regeneró el worktree de SLT-56 con su schema. No se
  regenera desde aquí para no romper SLT-56; con `prisma generate` de esta rama vuelve a verde.
- `pnpm run lint`: 0 errores (230 warnings del repo; ninguno nuevo en los archivos tocados).
- `eslint` sobre los archivos tocados: 0 errores, 1 warning previo (`normalizeName` sin usar en
  `ZonaRepository.ts:10`, ya en HEAD).
- MCP del grafo (`codebase-memory-mcp`) no conectó en esta sesión; exploración con Grep/Read.

Pendiente para frontend: `tests/components/ZonaCentralConfirmacion.test.tsx` lleva su propio
literal del motivo viejo (es un doble, sigue verde); T8 lo actualiza.

**Veredicto:** T1-T3 hechos; R6/R7 probados contra Postgres y la mutación los pone rojos.
