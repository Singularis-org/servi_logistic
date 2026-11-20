# SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora» · bitácora de implementación

## Tanda 1 — Base de datos (backend_dev, 2026-11-20)

### Archivos

Creados:
- `db/migrations/20261126120000_mora_enums/migration.sql` y `down.sql` (T1.1).
- `db/migrations/20261126120100_mora_congelamiento/migration.sql` y `down.sql` (T1.2).
- `tests/integration/db/_fixtures/fecha-limite-pago.ts` (T1.3, tabla compartida con la gemela TS de T2.2).
- `tests/integration/db/_fixtures/mora-121.ts` (helpers de los tests de la base; no estaba en `tasks.md`).
- `tests/integration/db/factura-plataforma-mora.test.ts` (T1.3).
- `tests/integration/db/mora-congelar.test.ts` y `bloqueo-por-mora.test.ts` (T1.4).
- `tests/integration/db/bloqueo-por-mora-cobertura.test.ts` y `mora-migration.test.ts` (T1.2).

Modificados:
- `db/schema.prisma`: 5 valores en `HistorialAccionTipo`, 2 en `JobTipo`, 3 columnas en `Organizacion`.
- `tests/integration/db/orden-traspaso-migration.test.ts`: las dos migraciones en su lista de posteriores.
- `tests/integration/db/caja-459-migration.test.ts`: los cinco tipos nuevos al final del enum.

### Desvíos frente al spec
- Timestamps `20261126120000` y `20261126120100` (no `20261124…`): `20261124120000` lo usa SLT-226 «Cobro automático:
  modelo del cobro e idempotencia» en otra rama. Primero fueron `20261125…`, pero la regex `/backfill|125/` de
  `tests/unit/analytics/backfill-guards.test.ts` los atrapaba; renombradas en la tanda T2.6.
- `organizacion_mora_congelar` con una empresa que no existe lanza `P0002` (el design no lo dice).
- La guarda de `factura_plataforma_mora` reconoce a `servi_app` por `current_setting('role')` (lo fija la envoltura
  con `set_config('role', …)` y SECURITY DEFINER no lo cambia) o por `session_user`.

### R → test (Tanda 1)
| R | Test |
|---|---|
| R1 | `factura-plataforma-mora.test.ts` (tabla de casos; cierre real 16 nov → 23 nov) |
| R6 | `factura-plataforma-mora.test.ts` (vencida desde `vence_at`; saldo 0/negativo fuera; parcial; anulado) |
| R33 | `factura-plataforma-mora.test.ts` (42501 otra empresa y sin empresa; privilegios) |
| R7, R8, R9, R18, R21, R23 | `mora-congelar.test.ts` |
| R5, R34 (pieza SQL) | `mora-congelar.test.ts` |
| R10, R12, R16, R18 | `bloqueo-por-mora.test.ts` |
| R16 | `bloqueo-por-mora-cobertura.test.ts`, `mora-migration.test.ts` |
| R3 (CHECK) | `mora-migration.test.ts` |

### Verificación (salida real)
- `pnpm exec vitest run` de los 5 archivos nuevos + `orden-traspaso-migration`: 6 archivos, 45 tests, 0 fallidos
  (bloqueo-por-mora 5, cobertura 1, factura-plataforma-mora 5, mora-congelar 10, mora-migration 9, orden-traspaso 15).
- `db:rollback` de la principal y `migrate deploy` otra vez: OK. El `down` de enums se prueba de ida y vuelta en
  `mora-migration.test.ts` (base propia), porque `db:rollback` solo revierte la última carpeta.
- `pnpm run lint`: 0 errores, 249 avisos (heredados; `eslint` sobre los archivos de esta tanda: limpio).
- `pnpm run typecheck`: ROJO, 4 errores, todos por los valores nuevos del enum en el cliente de Prisma:
  `lib/types/historial-accion.ts` (exhaustividad de `HISTORIAL_ACCION_TIPOS`), `HistorialAccionRepository.ts` (2) y
  `lib/modulos/reparto.ts` (`MODULO_POR_JOB`). Son T2.6 y T3.2.
- En rojo por lo mismo (comparan la base con `HISTORIAL_ACCION_TIPOS`, `MODULO_POR_JOB` o `buildHandlers`): 13
  inventarios de `historial_accion_tipo`, `catalogo.test.ts`, `procesar-jobs-modulos.test.ts`,
  `jobs-handler-por-tipo.guardia`. Más `backfill-guards.test.ts` (R5 de la 125: su regex `/125/` atrapa
  `20261125…`).

Veredicto: base de datos de la Tanda 1 lista y probada; typecheck e inventarios en rojo hasta decidir el orden
con T2.6 y T3.2 (BLOQUEADO devuelto al leader).

## Tanda T2.6 + adelanto de T3.2 (backend_dev, 2026-11-20)

### Base de la feature
- Revertidas las dos migraciones con sus `down.sql` (congelamiento y luego enums), borradas sus filas de
  `_prisma_migrations`, renombradas a `20261126120000_mora_enums` y `20261126120100_mora_congelamiento`, y vueltas a
  aplicar con `prisma migrate deploy` («All migrations have been successfully applied»). `migrate status`: «Database
  schema is up to date!». `db:generate`: OK.

### Archivos
Modificados:
- `db/migrations/20261126120000_mora_enums/migration.sql` y `down.sql`, `20261126120100_mora_congelamiento/*.sql`,
  `db/schema.prisma`: referencias al nombre nuevo.
- `lib/types/historial-accion.ts`: bloque A.7 con los cinco tipos; categoría `mora` («Mora y congelamiento») en
  `CATEGORIAS_ACCION`, `CATEGORIA_POR_ACCION`, `ACCION_LABELS` y `CATEGORIA_LABELS`. Las etiquetas no dicen «la
  empresa» (SL-15 R4 la reserva a la marca).
- `lib/types/historial-accion-etiquetas.ts`: la entidad `organizacion` admite `{ asunto?: "tope_intentos" | "mora" }`;
  con `mora` la etiqueta es «Plazo de pago y mora» (design §7.2). Sin `asunto`, la del tope, como antes.
- `lib/modulos/reparto.ts`: `mora_diaria` y `mora_aviso_correo` → `"nucleo"` en `MODULO_POR_JOB` (adelanto de T3.2).
- `tests/unit/guards/historial-accion-sin-datos-cliente.guardia.test.ts`: excepción declarada P5 para
  `empresa_descongelada_a_mano` en `MoraEmpresaRepository.ts`, con `escritorPendiente` (T2.4) y la nota de que Carlos
  Restrepo la acepta en la review del PR; el test de excepciones admite un archivo pendiente que aún no existe y exige
  que una excepción con escritor esté en `PUNTOS_DE_ESCRITURA`; test nuevo «SLT-121 P5».
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`: los cinco tipos en
  `ESCRITOR_PENDIENTE_EN_CURSO` (T2.4 y T2.5); el número duro pasa a 95.
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`: 95 tipos y 7 categorías; describe «SLT-121 R30».
- Inventarios de `historial_accion_tipo` con los cinco tipos detrás de SLT-225:
  `correccion-resultado-gestion-migration`, `historial-accion-cobro-tienda-migration`,
  `historial-accion-conciliacion-bodega-migration`, `historial-accion-orden-zona-reconciliada-migration`,
  `historial-accion-pago-mensajero-ajustado-migration`, `historial-accion-zona-pago-mensajero-migration`,
  `historial-accion-zona-sinpe-migration`.
- Sin cambios: `HistorialAccionRepository.ts` (sus errores de typecheck venían del catálogo incompleto).

### R → test (esta tanda)
| R | Test |
|---|---|
| R30 (catálogo, categoría, etiquetas) | `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` > «SLT-121 R30» |
| R30 (P5, excepción de texto libre) | `historial-accion-sin-datos-cliente.guardia.test.ts` > «SLT-121 P5» |
| R30 (escritura en la misma transacción) | pendiente: `mora-empresa-repository.test.ts` (T2.4) y `pago-plataforma-recalcula-mora.test.ts` (T2.5) |

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: verde (`tsc --noEmit` sin errores).
- `pnpm run lint`: 0 errores, 250 avisos (heredados; `eslint` sobre los archivos tocados en esta tanda: limpio).
- `pnpm run test:guardias`: 354 archivos verdes, 2 rojos:
  - `jobs-handler-por-tipo.guardia`: `['mora_diaria', 'mora_aviso_correo']` sin handler en `buildHandlers`. Es T3.2.
  - `cierres-componentes-retirados.guardia`: timeout de 20 s con la base de integración corriendo a la vez; solo, verde.
- Unitarios (15 archivos, 389 tests, 0 fallidos): las 8 guardias del historial, `catalogo-y-choke-point` (58),
  `lectura-borde-y-servicio` (39), `historial-acciones-filtros-def` (15), `rechazo-nombre-466-lib` (8),
  `modulos/catalogo` (13), `cron/procesar-jobs-modulos` (9), `analytics/backfill-guards` (21).
- Integración (31 archivos: los 27 que leen `historial_accion_tipo`/`HISTORIAL_ACCION_TIPOS`, entre ellos
  `mora-migration`, `orden-traspaso-migration` y `caja-459-migration`, + los otros 4 de la Tanda 1): 29 verdes, 299
  tests pasados, 4 fallidos, todos en `tests/baseline-rojos.json`: `abono-tienda-457-migration` (a) y (c) y
  `wallet-461-migration` (a) y (c). Los (c) son PG 17/18; los (a) miran posiciones fijas de la cola de enums que ya
  estaban corridas antes de esta feature.
- `caja-459-migration` (d) dio una vez `XX000 could not open relation with OID` corriendo en paralelo con los otros
  inventarios; solo y en la segunda pasada del conjunto, 6/6 verde.

Veredicto: T2.6 hecha y migraciones renombradas; typecheck, lint e inventarios en verde; solo queda en rojo
`jobs-handler-por-tipo` hasta los handlers de T3.2.
