# impl SL-21 «Moneda e impuestos configurables por país» — bitácora backend_dev

## Tanda 1 — bloques 1 y 2 (T1.1, T1.2, T1.3, T2.1, T2.2, T2.3) · 2026-11-19

Grafo (`codebase-memory-mcp`): no usado; el worktree no está indexado (design, «Lo que ya existe»).
Exploración con Grep/Read.

### Commits
- `2ae66940` feat(SL-21): T1.1-T1.2 migración y esquema de moneda e impuesto del país
- `d70109a0` test(SL-21): T1.3 moneda e impuesto del país contra Postgres y migración de ida y vuelta
- `0eea7c71` feat(SL-21): T2.1 formatearMontoEn con la moneda como parámetro; los seis caminos delegan (T2.3 incluido)
- `2fa80a13` test(SL-21): T2.2 guardia 359 con el séptimo camino (formatearMontoEn)

### Archivos
Producción:
- `db/migrations/20261122120000_sl21_pais_moneda_impuesto/migration.sql` (nuevo)
- `db/migrations/20261122120000_sl21_pais_moneda_impuesto/down.sql` (nuevo)
- `db/schema.prisma` (6 campos de `Pais` con `///`)
- `lib/config/moneda.ts` (`FormatoMoneda`, `MONEDA_PLATAFORMA`, `MONEDA_DE_LOS_PLANES`, `formatearMontoEn`;
  `formatMontoString`/`formatMonto` delegan en él, `formatMontoTope` en su variante de cota interna)

Tests:
- `tests/fabricas/paises.ts` (`crearPaisDePrueba` acepta `moneda` e `impuestoNombre`, NULL por defecto)
- `tests/fabricas/reglas-pais.ts` (solo `MONEDA_DE_PRUEBA`; el resto de la fábrica es de T3.2)
- `tests/integration/db/migracion-sl21-ida-y-vuelta.test.ts` (nuevo)
- `tests/integration/db/pais-moneda-impuesto.test.ts` (nuevo)
- `tests/unit/config/moneda-formato-pais.test.ts` (nuevo; incluye el caso de integración de T2.3)
- `tests/unit/guards/dinero-centimos-cuando-existen.guardia.test.ts` (séptimo camino, recuento 7)

### Mapa R → test (de esta tanda)
| R | Test |
|---|---|
| R1 | `migracion-sl21-ida-y-vuelta.test.ts` («la subida carga CR, añade solo las seis columnas…», sin columna de tasa); `pais-moneda-impuesto.test.ts` (R1: nace sin datos; rangos válidos) |
| R2 | `pais-moneda-impuesto.test.ts` («R2: cada regla rechaza su caso (23514)…», 17 casos) |
| R3 | `migracion-sl21-ida-y-vuelta.test.ts` (subida, down, reaplicar; foto de esquema y filas) |
| R4 | `pais-moneda-impuesto.test.ts` («R4: una empresa lee… no puede escribirlos (42501)») |
| R8 | `moneda-formato-pais.test.ts` (0, 1 y 2 decimales; signo; acarreo; separadores) |
| R9 | `dinero-centimos-cuando-existen.guardia.test.ts` (7 caminos, mismo texto) y `moneda-formato-pais.test.ts` (fila CR migrada = `MONEDA_PLATAFORMA` con env vacío) |
| R19 (parte base) | `migracion-sl21-ida-y-vuelta.test.ts` (enums y `wallet_movimiento` iguales) |

### Verificación (salida real)
- Migración sobre `servi_logistic_sl21`: `prisma migrate deploy` aplica → `pnpm run db:rollback` revierte →
  `migrate deploy` reaplica. `prisma validate` verde; `prisma generate` hecho una vez.
  `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → «This is an empty
  migration.» (`--from-migrations` pide `shadowDatabaseUrl`, que el repo no configura.)
- `pnpm run typecheck` → verde (sin salida de `tsc --noEmit`).
- `pnpm run lint` → 0 errores, 249 warnings (preexistentes; el de `salidasQueCasan` en la guardia 359 ya estaba).
- `pais-moneda-impuesto.test.ts` + `migracion-sl21-ida-y-vuelta.test.ts` → 2 files, 8 passed.
- `pais-tabla`, `pais-repositorio`, `hora-por-pais-dos-empresas` → 3 files, 19 passed.
- `tests/unit/config/` + guardia 359 → 36 files, 391 passed (incluye `moneda-formato.test.ts` sin cambios).
- `moneda-formato-pais.test.ts` → 12 passed (el de integración T2.3 corre, no se salta).
- `pnpm run test:guardias` → 360 files, 5421 passed | 1 skipped.
- `vitest related --run lib/config/moneda.ts …` no terminó en 590 s (arrastra demasiados archivos). En su lugar,
  los 184 tests unitarios y de componentes que tocan dinero o los módulos de la ficha (grep de `config/moneda`,
  `formatMonto`, `money(`, `montoExacto`, `PriceLabel`, plantillas, tránsito, etiquetas, facturas, planes), en
  4 tandas: 175 files, 3 714 passed, 0 failed. Ningún valor esperado cambió (R9/R16).

### Desviaciones del design
- `formatearMontoEn` con un `number`: entra por `toFixed(ESCALA)` (2, la frontera), no por
  `toFixed(moneda.decimales)`. Motivo: `tests/unit/config/moneda-formato.test.ts` fija que el único
  `toFixed` del módulo es `toFixed(ESCALA)`, y así el cuadre a la escala de la moneda lo hace siempre el
  módulo sobre la cadena (half away from zero) y no el motor de JS en binario. Con la plataforma (2) es
  idéntico.
- Guardia 359: `formatearMontoEn` entra en las dos listas y `CAMINOS_PUBLICOS` pasa a contar nombres
  distintos (si no, daría 8 y no 7).
- La variante de cota (`formatearTopeEn`) no se exporta: un camino público más tendría que entrar en el
  censo de la 359 y hoy no tiene consumidor fuera de la plataforma.

### Veredicto
Bloques 1 y 2 hechos y en verde; listo para el bloque 3.
