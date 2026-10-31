# impl SLT-73 — bitácora de implementación

## Tanda 1 — backend_dev: T1, T2 y T3 (2026-10-31)

Commits: `a0a35c13` (T1 + T2) y `1782766a` (T3) sobre `hotfix/SLT-73-dinero-satelite-al-conciliar`.
`prisma generate` corrido a las 16:52:08 (hora local) tras tocar `db/schema.prisma`.

### Archivos

**Creados**
- `db/migrations/20261031140000_slt73_diferencia_satelite_enums/{migration,down}.sql`
- `db/migrations/20261031140100_slt73_ajuste_conciliacion/{migration,down}.sql`
- `lib/repositories/_shared/asientos-cierre-dia.ts` (`asentarCierreDia`, `ASIENTOS_POR_DEFECTO`)
- `tests/integration/db/slt73-conciliacion-bodega-ajuste-rls.int.test.ts`
- `tests/integration/db/_fixtures/slt73-cierre-aprobable.ts`
- `tests/integration/db/slt73-aprobar-satelite-sin-asientos.int.test.ts`
- `tests/integration/db/slt73-aprobar-central-igual.int.test.ts`

**Modificados (código)**
- `db/schema.prisma`: 2 categorías, 1 origen, modelo `ConciliacionBodegaAjuste` y sus relaciones.
- `lib/db/modelos-de-negocio.ts`: la tabla nueva es de negocio (79).
- `lib/types/wallet.ts`: seeds de categoría y origen.
- `lib/utils/caja-tesoreria.ts`: naturaleza `terceros` (design §1.2) y liquidez `efectivo`.
- `lib/constants/wallet-rotulos.ts`, `lib/services/OrigenLegibleService.ts`,
  `lib/repositories/libro-caja-a-quien-sql.ts`, `lib/utils/aporte-por-orden.ts`,
  `lib/analytics/metrics.ts`: mapas totales que el typecheck o las guardias exigían.
- `lib/repositories/CierresAdminRepository.ts`: T2 (bloque movido) y T3 (`if bodega_central`).

**Modificados (tests)** — guardias de conteo y mapas: `aprobacion-escrituras-cubiertas`,
`rls-por-empresa`, `metrics-caja-naturaleza`, `api-key-dependencias-usuario` (fixture),
`wallet-labels`, `wallet-origen-legible`, `caja-tesoreria-migration`. Censo T3: ver abajo.

### Decisiones tomadas en T1

- **No hay CHECK de origen por categoría en `wallet_movimiento`** (solo lo tiene
  `pago_mensajero_movimiento`, SLT-68). El design dice «si existe»: no se crea.
- El `down.sql` de la migración A reutiliza la función dinámica de SLT-68 con un paso más (2b):
  guarda y recrea los triggers que dependen de la columna. Sin él, el rollback fallaba por
  `wallet_movimiento_tope_pago_plataforma` (SL-45). Medido con `db:rollback`.
- `id`/`created_at` siguen la convención del repo (`TEXT` y `TIMESTAMP(3)`), no `uuid`/`timestamptz`
  como dice la tabla del design: así no hay drift con `String @id` / `DateTime` de Prisma.
- Rótulos neutros, sin país ni moneda: «Diferencia de la satélite (entregó menos/más)» y el origen
  «Diferencia de la satélite». Son provisionales para el frontend.

### BLOQUEO DE DINERO (para el leader / humano)

`NATURALEZA_POR_CATEGORIA` = `terceros` (lo que pide design §1.2) **rompe la invariante R8 de la
459**: «De las tiendas» de la caja = Σ saldos de las tiendas. La guardia
`tests/unit/guards/caja-clasificacion-459.guardia.test.ts` queda ROJA:
`egreso_diferencia_satelite mueve «De las tiendas» y es pareja de 0 conceptos` (y la de ingreso).
Con Q1-A la tienda conserva su crédito completo, así que una diferencia `terceros` deja la caja con
«De las tiendas» por debajo de lo que se les debe; como `propio` bajaría la ganancia; no hay una
naturaleza «por cobrar a la satélite». El spec no resuelve esto: queda `terceros` y la guardia roja
hasta que se decida.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R1 | `slt73-aprobar-satelite-sin-asientos.int.test.ts` › «R1: tras aprobar, ninguno de los tres libros…» |
| R2 | mismo archivo › «R2: lo que no es dinero ocurre igual que en la central…»; contraparte central en `slt73-aprobar-central-igual` › «R3 (contra R2)» |
| R3 | `slt73-aprobar-central-igual.int.test.ts` › «R3: … exactamente las filas de siempre (literal)» |
| R21 (tabla nueva) | `slt73-conciliacion-bodega-ajuste-rls.int.test.ts` + guardias `rls-por-empresa`, `fk-misma-empresa`, `organizacion-en-modelos` |

### Mutaciones (design §6), harness con autocomprobación y reversión por `git checkout`

| Mutación | Archivo | Rojo |
|---|---|---|
| M1 quitar el `if destinoTipo` | CierresAdminRepository.ts | 1 (R1) |
| M2 invertirlo (`!==`) | CierresAdminRepository.ts | 2 (R1, R3) |
| M3 `bodega_satelite` en vez de `bodega_central` | CierresAdminRepository.ts | 2 (R1, R3) |
| M4 leer el destino con `this.prisma` (fuera de la tx) | CierresAdminRepository.ts | 0 — superviviente EQUIVALENTE |
| M5 persistencia de la indemnización dentro del `if` | CierresAdminRepository.ts | 1 (R2) |
| M6 saltarse el libro del mensajero | asientos-cierre-dia.ts | 1 (R3) |
| RLS desactivada en la tabla nueva | base local | 2 (RLS y WITH CHECK) |

M4 no se puede matar con un test determinista: `destino_tipo` solo se escribe al crear el cierre
(`CierreDiaRepository.crearCierre`) y el `updateMany` de la aprobación ya filtra por el destino del
alcance, así que dentro o fuera de la tx el valor es el mismo.

### Censo T3: tests que aprobaban un satélite y esperaban filas en los libros

- `tests/integration/db/nucleo-sin-modulos.test.ts` (afirma ahora 0 filas).
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts` y
  `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts` (0 al aprobar; luego
  `asentarCierreDia` y el literal de siempre).
- `tests/integration/db/cierre-rechazo-tienda-aprobacion.test.ts` (escenario 2, mismo arreglo).
- `tests/integration/db/_fixtures/caja-459.ts` (35 suites lo usan: asienta tras aprobar).
- `scripts/demo-qa/receta.ts` vía `tests/integration/db/demo-qa.test.ts`: NO se toca; la demo ya marca
  recibida la consolidación satélite antes del paso de dinero, así que vuelve a verde con T4.
- Dobles de las suites de aprobación de la CENTRAL (devuelven `destinoTipo: bodega_central`):
  9 archivos unit + `wallet-idempotencia` y `cierre-detail-congelado`.
- E2E: ninguno afirma dinero de un cierre satélite (el escenario de caja es central).

Los de `caja-459`, 454/455 y `cierre-rechazo-tienda-aprobacion` necesitan una base con órdenes y zona
central: aquí (y en CI) caen por entorno y están en `tests/baseline-rojos.json`. Compilan (typecheck).

Ajustes de conteo y listas (3.er commit): `scripts/verificar-rls-despliegue.ts` (contrato de despliegue:
153 triggers `sme_*`, medido en la base local), su test, `caja-459-migration`, `orden-incidente-migration`,
`mi-wallet-labels`, `caja-derivacion-457` (pool con las dos categorías), `caja-tesoreria` y
`caja-tesoreria-idempotencia` (el chequeo estructural mira ahora `asentarCierreDia`).

### Verificación (salida real)

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin eso el proceso muere por memoria): exit 0.
- `pnpm run lint`: 0 errores, 232 avisos, ninguno en archivos de esta tanda.
- Migraciones: deploy → `db:rollback` ×2 (enums 0, tabla 0, trigger de SL-45 restaurado) → deploy;
  `prisma migrate diff` base↔schema: «This is an empty migration».
- Tests de la tanda: los 3 `slt73-*` 12/12; las 9 suites de aprobación con dobles 246/246.
- `pnpm run test:guardias`: 316/318 archivos verdes. Rojos: `caja-clasificacion-459` (el BLOQUEO de
  arriba) y `dependencias-declaradas-presentes` (ya estaba, en el baseline).
- `pnpm exec vitest related --run <lib cambiados>`: 253 archivos rojos; 242 están en el baseline (base
  sin órdenes/zona central). De los 11 de fuera: 8 eran listas/conteos (arreglados arriba), más
  `caja-clasificacion-459` (bloqueo), `demo-qa` (vuelve con T4) y `geografia-por-pais` /
  `indices-rutas-calientes` (datos de geografía y plan de consulta de la base local; no tocan nada de esta ficha).

**Veredicto:** T1–T3 hechos y probados contra Postgres; queda abierto un bloqueo de dinero en la
naturaleza de la diferencia (guardia 459 en rojo) que tiene que decidir el humano.
