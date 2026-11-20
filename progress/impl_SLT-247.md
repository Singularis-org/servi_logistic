# impl SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de reenviarlo»

## Tanda 1 — Esquema e historial (backend_dev, 2026-11-20)

T1.1–T1.4 de `specs/SLT-247-cierre-rechazado-gestiona-sin-gestion/tasks.md`. Sin productor todavía: llega
en la Tanda 2 del mismo PR.

### Archivos

Producción:
- `db/migrations/20261124130000_orden_historial_origen_retorno_rechazo_cierre/{migration,down}.sql` — un
  `ADD VALUE IF NOT EXISTS`; el down recrea el tipo con los 34 valores MEDIDOS en una base nueva.
- `db/schema.prisma` — `retorno_por_rechazo_cierre` al final de `OrdenHistorialOrigenTipo`.
- `lib/types/orden-historial.ts` — el valor en `ORDEN_HISTORIAL_ORIGEN_TIPO_SEED`, fuera de
  `ORIGEN_TIPOS_VISITA_REAL`, `ORIGEN_TIPOS_CON_GESTION` y `ORIGENES_GESTION_FUERA_DEL_CIERRE`.
- `lib/types/order-status-transiciones.ts` — arista #74 `novedad_interna -> en_reparto via
  retorno_por_rechazo_cierre, rol "admin (rechazar cierre)"`.

Tests nuevos:
- `tests/integration/db/247-origen-retorno-rechazo-migration.test.ts` (12: 6 estáticos + 6 contra Postgres).

Tests tocados:
- `tests/unit/types/orden-historial-types.test.ts` — 35 valores + bloque SLT-247 (3 casos).
- `tests/unit/domain/order-status-transiciones.guardia.test.ts` — bloque SLT-247 (4 casos); el par ilegal
  `novedad_interna -> en_reparto` de R6 pasa a `novedad_interna -> reprogramado`; recuentos 61/56; 276
  ve 4 salidas.
- `tests/fixtures/inventario-transiciones-140.ts` — #74 y recuento 61 aristas / 56 pares.
- `tests/unit/guards/origenes-admitidos-en-cierre.guardia.test.ts` — la familia, ADMITIDA (no produce gestión).
- `tests/unit/repositories/orden-historial-cobertura.test.ts` — en `FAMILIAS_SIN_PRODUCTOR` hasta la Tanda 2.
- Por arrastre (solo añaden el valor posterior a sus listas, sin cambiar lo que afirman): 12
  `*-migration.test.ts` de `orden_historial_origen_tipo`, `correccion-resultado-gestion-migration.test.ts`
  (posición relativa en lugar de «es el último») y `455/caracterizacion/transiciones.test.ts` (61 aristas).

### Desvíos del design (anotados)

1. **Timestamp de la migración: `20261124130000`, no `20261120120000`.** `db/migrations` ya tenía
   `20261123120100_zona_activa` y `origin/dev` trae `20261124120000_sl21_pais_moneda_impuesto`: con el
   número del design se aplicaría fuera de orden. El design prevé renumerar. No es `20261125…` porque
   `tests/unit/analytics/backfill-guards.test.ts` rechaza cualquier carpeta con «125» (ficha 125).
2. **El down retipa DOS columnas, no una.** Medido contra la base (`pg_attribute`):
   `orden_evento.familia_aplicacion` (454) también usa el tipo, con el CHECK
   `orden_evento_familia_aplicacion_check`. El down suelta el CHECK, retipa las dos columnas y lo recrea
   con su texto original. Sin soltarlo, el down revienta (mutación M3).
3. **La arista entra en la Tanda 1 (lo pide tasks.md), su productor en la Tanda 2.** El design dice «en el
   MISMO commit que su productor»; las dos tandas van en el mismo PR. Mientras tanto, la familia está
   declarada en `FAMILIAS_SIN_PRODUCTOR` de `orden-historial-cobertura.test.ts`. **La Tanda 2 debe moverla**
   a `PUNTOS_DE_ESCRITURA` (#37, `CierresAdminRepository.resolverCierre`) y devolver la lista a
   `["recoleccion_tienda"]`.

### Mapa R → test (Tanda 1)

- R1771 (familia propia, no cuenta como intento, sin gestión enlazada):
  `orden-historial-types.test.ts > SLT-247/R1771 …` (3), `order-status-transiciones.guardia.test.ts >
  SLT-247/R1771 …` (4), `247-origen-retorno-rechazo-migration.test.ts` (12). El resto de R1771 (la fila
  escrita por el rechazo) es de la Tanda 2.

### Mutaciones (todas rojas, todas restauradas)

| # | Mutación | Resultado |
|---|---|---|
| M1 | down.sql sin retipar `orden_evento.familia_aplicacion` | rojo: el `beforeAll` revienta (1 failed, 6 skipped) |
| M2 | down.sql sin `correccion_resultado_gestion` en la lista | rojo: 2 failed (estático + DB) |
| M3 | down.sql sin `DROP CONSTRAINT` del CHECK | rojo: el `beforeAll` revienta |
| M4 | down.sql sin recrear el CHECK | rojo: 2 failed |
| M5 | quitar la arista #74 del mapa | rojo: 6 failed en el guardia |
| M6 | meter la familia en `ORIGEN_TIPOS_VISITA_REAL` | rojo: 4 failed (types, guardia, migración) |

### Verificación

Base desechable nueva `servi_slt247_t1b` (`migrate deploy` + `db:seed`), exportada antes de cada vitest.

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` — exit 0.
- `pnpm run lint` — `0 errors, 249 warnings` (ninguno en archivos de esta tanda).
- `pnpm run test:guardias` — `Test Files 360 passed (360)`, `Tests 5432 passed | 1 skipped`.
- `pnpm exec vitest run` sobre los 61 archivos de `tests/` que nombran el enum, el inventario,
  `TRANSICIONES` o el valor nuevo — `Test Files 61 passed (61)`, `Tests 1179 passed (1179)`.
- `./init.sh` — `INIT_EXIT=1`, SOLO por `faltan specs para features sdd en vuelo: SLT-248` (spec de otra
  ficha en escritura en su worktree; el leader lo resuelve). Se corta antes del resto, que se corrió a mano
  arriba.

**Veredicto:** Tanda 1 hecha y verde salvo el rojo ajeno de `validate-features` (SLT-248).
