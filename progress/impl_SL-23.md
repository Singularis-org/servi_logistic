# impl SL-23 — Catálogo de módulos y módulos activos por empresa

Worktree: `.worktrees/SL-23-catalogo-modulos`, rama `feature/SL-23-catalogo-modulos`.

## T0 — Orden de migraciones y base de pruebas (2026-10-26)

- `git fetch origin` + `git ls-tree origin/dev db/migrations/`: la última migración de `origin/dev`
  sigue siendo `20261025160100_entorno_marca`. Las tres de T1 (`20261026120000`, `20261026120100`,
  `20261026120200`) van detrás sin renumerar.
- Base propia de la feature: `logistic_sl23` en el Postgres local (`localhost:5432`), creada
  vacía, `prisma migrate deploy` + `pnpm run db:seed` en verde. `DATABASE_URL` se exporta en la
  sesión apuntando a ella (mismas credenciales del `.env` local, solo cambia el nombre de la base);
  el `.env` no se copia al worktree.

## Tanda 1 — T1, T2 (2026-10-26, backend_dev)

### Archivos

Creados:
- `db/migrations/20261026120000_organizacion_modulo/{migration.sql,down.sql}`: enum `modulo_apagable`
  (9), tabla, FK `CASCADE`, único `(organizacion_id, modulo)`, índice, RLS + política
  `organizacion_modulo_por_empresa`, `GRANT SELECT` + `REVOKE INSERT, UPDATE, DELETE` a `servi_app`,
  trigger `…_sin_cambio_de_empresa` y backfill de los 9 módulos a cada empresa existente (R5).
- `db/migrations/20261026120100_historial_accion_modulos/{migration.sql,down.sql}`: `modulo_activado`,
  `modulo_desactivado` y la entidad `organizacion_modulo`. El down borra las filas que los usan
  (design §9) y recrea los tipos con la función dinámica de SL-36 (`_sl23`), no con lista fija: una
  lista fija borraría valores que otra rama añada después.
- `db/migrations/20261026120200_job_estado_descartado/{migration.sql,down.sql}`: `descartado`. El down
  pasa los descartados a `done` con `last_error` intacto y recrea `job_estado` con la misma función,
  que suelta y rehace el índice parcial `jobs_run_after_pending_idx` y el DEFAULT `'pending'`.
- `tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` (T1) y
  `tests/integration/db/organizacion-modulo.test.ts` (T2).

Modificados:
- `db/schema.prisma`: `ModuloApagable`, `OrganizacionModulo`, `Organizacion.modulos`,
  `JobEstado.descartado`, `HistorialAccionTipo.{modulo_activado,modulo_desactivado}`,
  `HistorialAccionEntidad.organizacion_modulo`. Cambios aditivos y localizados (choque con SL-43).
- `lib/db/modelos-de-negocio.ts`: `OrganizacionModulo` en `MODELOS_DE_NEGOCIO` (77 → 78).
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` y `tests/unit/scripts/verificar-rls-despliegue.test.ts`:
  la cuenta fija de tablas de negocio pasa de 77 a 78 (y el contrato a 79 políticas / 78 triggers).

### Base

`logistic_sl23`: `prisma migrate deploy` aplicó las tres; `prisma generate` ok;
`prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.`

### Mapa R → test

| R | Test |
|---|---|
| R4 | `organizacion-modulo.test.ts`: «cada empresa lee exactamente sus módulos», «sin fila, el módulo está apagado», «una fila como mucho… 23505» |
| R5 | `migracion-sl23-ida-y-vuelta.test.ts`: «cada empresa previa queda con los 9 módulos encendidos», «una empresa creada después… nace sin ningún módulo» |
| R6 | `organizacion-modulo.test.ts`: «una empresa dada de alta por OrganizacionService nace sin ningún módulo encendido» |
| R7 | `organizacion-modulo.test.ts`: «SQL a mano con servi_app: B ve solo lo suyo», «servi_app no escribe ninguna activación… 42501» (INSERT/UPDATE/DELETE, propia y ajena), «por el cliente de la app… tampoco se escribe»; `migracion-sl23-ida-y-vuelta.test.ts`: «RLS activa, FK en cascada y servi_app solo con SELECT» |
| R20 | `migracion-sl23-ida-y-vuelta.test.ts`: «un job se descarta con su motivo» y el down lo deja en `done` con `last_error`. (El descarte del drenador es T11.) |
| R25 | `organizacion-modulo.test.ts`: «cada empresa lee exactamente sus módulos», «quitar `ranking` a A no cambia nada en B» |
| R27 | `migracion-sl23-ida-y-vuelta.test.ts`: «tabla, columnas, tipo y valores nuevos con los nombres del design» (`information_schema`, `pg_enum`, índices, política, trigger) |

Mutaciones (sobre `logistic_sl23`, revertidas después y comprobadas): `GRANT INSERT, UPDATE, DELETE`
a `servi_app` → 3 casos rojos de `organizacion-modulo.test.ts`; política `USING (true)` → 2 rojos.

### Salida

- `vitest run tests/integration/db/migracion-sl23-ida-y-vuelta.test.ts` (con `DATABASE_URL`):
  `Test Files 1 passed (1) · Tests 8 passed (8)`.
- `vitest run tests/integration/db/organizacion-modulo.test.ts` (con `DATABASE_URL`):
  `Test Files 1 passed (1) · Tests 8 passed (8)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 309 passed (310) · Tests 4 failed | 4281 passed | 1 skipped`.
  El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`.
  `organizacion-en-modelos`, `rls-por-empresa` y `fk-misma-empresa` en verde.
- `pnpm run lint`: `0 errors, 231 warnings`; `eslint` sobre los 5 archivos TS de la tanda: exit 0.
- `pnpm exec vitest related --run lib/db/modelos-de-negocio.ts <los 4 tests tocados>` (con
  `DATABASE_URL`), segunda corrida con reporte JSON: 4 archivos, `41 passed, 0 failed`. La primera
  corrida del mismo comando recorrió muchos más archivos (casi toda la integración) y mostró casos
  rojos por timeout de 20 s en suites ajenas a esta tanda (premios del ranking, cierres,
  reconciliación de zonas); su resumen se perdió porque la salida se recortó con `head`. No se
  atribuyen a este cambio, pero no está demostrado: el reviewer o `./init.sh` deberían confirmarlo.
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, OOM): **ROJO, 3 errores**:
  - `lib/types/historial-accion.ts(661,7)`: falta `modulo_activado` | `modulo_desactivado` en `HISTORIAL_ACCION_TIPOS`;
  - `lib/types/historial-accion.ts(662,7)`: falta `organizacion_modulo` en `HISTORIAL_ACCION_ENTIDADES`;
  - `lib/repositories/HistorialAccionRepository.ts(159,5)`: el mismo hueco visto desde la lectura.

### Bloqueo: secuencia T1 / T6 del historial

T1 pide los dos `HistorialAccionTipo` y el `HistorialAccionEntidad` en `db/schema.prisma`, pero
`lib/types/historial-accion.ts` cierra el catálogo contra el enum de Prisma (`_AsegurarExhaustivoTipos`),
así que el typecheck exige listarlos ya. Listarlos es T6 (categoría `cambia_modulos`, etiquetas), y en
cuanto entran en `HISTORIAL_ACCION_TIPOS` la guardia `historial-accion-escrituras-cubiertas` exige su
productor (`ModulosEmpresaRepository`, T6) y fija 70 tipos; `catalogo-y-choke-point.test.ts` fija 70/25/4.
No hay forma de cerrar T1 con typecheck y guardias en verde a la vez sin adelantar parte de T6.
Opciones para el leader:
1. Mover a T6 la migración `20261026120100` y los tres valores del historial en `db/schema.prisma`
   (T1 queda verde; la base `logistic_sl23` ya la tiene aplicada y habría que revertirla con su down).
2. Aceptar el typecheck en rojo entre T1 y T6, sin mergear nada en medio.
3. Adelantar a esta tanda el catálogo de `lib/types/historial-accion.ts`, sabiendo que
   `historial-accion-escrituras-cubiertas` queda roja hasta T6.

Veredicto: T1 y T2 hechos y probados contra Postgres; la tanda no cierra por el typecheck rojo del bloqueo de arriba.

### Tanda 1 — adelanto de T6 (typecheck)

Decisión del leader (opción 3 del bloqueo de arriba): adelantar de T6 solo los valores del catálogo
de historial para que el typecheck cierre. No se adelanta servicio, repositorio, action ni el censo.

**Archivos tocados**
- `lib/types/historial-accion.ts`: `modulo_activado`, `modulo_desactivado` (bloque A.5) y la
  entidad `organizacion_modulo`; la categoría `cambia_modulos` («Cambia módulos») en
  `CATEGORIAS_ACCION`/`CATEGORIA_POR_ACCION`/`CATEGORIA_LABELS`; `ACCION_LABELS` («Activó/Desactivó un
  módulo de una empresa») y `ENTIDAD_LABELS` («Módulo»); totales del comentario (72 tipos, 26 entidades).
  La categoría la exige el tipo: `CATEGORIA_POR_ACCION` es un `Record` exhaustivo y ninguna de las
  cuatro existentes encaja (design §4.3 la define).
  La etiqueta de entidad es «Módulo» y no «Módulo de la empresa»: la prueba SL-15 R4 prohíbe escribir
  «la empresa» a mano en los textos del historial.
- `lib/types/historial-accion-etiquetas.ts`: fuente `organizacion_modulo: { moduloNombre }` y su
  constructor (`FuentesEtiqueta`/`CONSTRUCTORES` son exhaustivos sobre la entidad; design §4.3:
  `entidad_etiqueta` = nombre del módulo).
- `lib/repositories/HistorialAccionRepository.ts`: sin cambios (su error era consecuencia del catálogo).
- Tests con números o listas duras del catálogo, actualizados a 72/26/5 y con los valores de SL-23
  en `POSTERIORES`: `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` (más una aserción de
  `cambia_modulos`), `tests/integration/db/caja-459-migration.test.ts`,
  `correccion-resultado-gestion-migration.test.ts`, `historial-accion-cobro-tienda-migration.test.ts`,
  `historial-accion-conciliacion-bodega-migration.test.ts`,
  `historial-accion-orden-zona-reconciliada-migration.test.ts`,
  `historial-accion-zona-pago-mensajero-migration.test.ts`, `historial-accion-zona-sinpe-migration.test.ts`.

**Salida**
- `pnpm run typecheck`: exit 0 (antes: TS2741/TS2536 en `historial-accion-etiquetas.ts`, ya resueltos).
- `pnpm run lint`: 0 errors, 231 warnings (preexistentes); eslint de los archivos tocados: exit 0.
- `pnpm exec vitest run tests/unit/historial-accion/`: 2 files, 90 passed.
- Los 7 de integración arreglados (con base): 7 files, 97 passed.
- `vitest related` de los tres archivos: la primera corrida terminó y mostró los rojos de arriba más
  rojos de archivos que están todos en `tests/baseline-rojos.json` (analytics-daily-job,
  busqueda-por-guia-469, caja-caracterizacion-459, historial-accion-atomicidad, historial-accion-migration,
  wallet-458/461-migration, abono-tienda-457-migration, orden-traspaso-migration, 455/snapshot-lectura y
  otros). La segunda corrida completa la cortó Claude Code por falta de memoria; no se relanzó y se
  verificaron por separado los archivos afectados.
- `pnpm run test:guardias`: 2 files failed | 306 passed. `dependencias-declaradas-presentes` (4) está en
  baseline. **`historial-accion-escrituras-cubiertas` (2) es rojo esperado hasta T6**: `modulo_activado` y
  `modulo_desactivado` no tienen productor en el `CENSO` y la cifra dura sigue en 70. Su criterio de hecho
  está en T6, así que no se toca aquí.

Veredicto: typecheck verde; queda solo `historial-accion-escrituras-cubiertas` en rojo, esperado hasta que T6 escriba el productor.
