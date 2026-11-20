# impl SLT-186 «Tests con estados retirados del catálogo»

Ruta ligera, solo tests. Rango R1150-R1159. Alcance: las 2 entradas del spec + el alcance ampliado
de `progress/features/SLT-186.md` (SLT-178, SLT-179, SLT-180, SLT-181, SLT-184): **13 archivos**.
Diff de producción: **vacío** (`lib/`, `app/`, `db/`, `scripts/` sin tocar; ver `git diff --stat`).

Base: `servi_slt186_desechable` (Postgres local 18.2), `prisma migrate deploy` + `pnpm run db:seed`,
siempre por `con-desechable.cjs`. Rama mergeada con `origin/dev` antes de empezar (sin conflictos).

## T1 — Medición (antes)

`vitest run <13 archivos>` en base vacía: **12 failed | 1 passed (13); 14 failed | 61 passed | 104 skipped (179)**.

| archivo | primer error (antes) | segundo nivel (con el primero arreglado) | arreglo |
|---|---|---|---|
| `db/analytics-daily-job` | R45 `estatusId`: el catálogo no tiene el estado de fulfillment retirado por la 155 (`:331`) | — | siembra en la tx + control positivo (R1152/R1153) |
| `db/satelite-bodega-alcance-real` | `estatus()`: no hay `ayuda_tienda` (`:178`) | — | `ayuda_tienda` -> `reprogramado` (en `ESTADOS_BODEGA_SATELITE`) (R1154) |
| `db/cierre-descarga-intentos-entrega-sql-real` | falta `devolucion_por_confirmar` (`:165`) | — | destino de la visita -> `novedad` (el predicado mira `origen_tipo`, no el destino) |
| `db/cierre-sin-gestion-tope-sql-real` | falta `devolucion_por_confirmar` (`:182`) | — | destino de la visita -> `novedad` |
| `db/corte-diario-segundo-cierre-sql-real` | falta `ayuda_tienda` (`:108`) | — | el corte barre un solo origen desde la 454 (`en_reparto`): fuera de la cuarentena y del control |
| `db/correccion-dia-reparto-efectos.int` | no hay `ayuda_tienda` (`:97`) | R26 esperaba 0 policies; desde SL-17 hay `orden_dia_reparto_cambio_por_empresa` (`servi_app`) | estados admitidos = `ESTADOS_CON_DIA_DE_REPARTO_VIVO` (2); R26 afirma la única policy de empresa y que no mira `auth.` |
| `db/correccion-dia-reparto.int` | no hay `ayuda_tienda` (`:77`) | R23: 8 columnas (`organizacion_id`, SL-17) vs 7 | R6 pasa a los DOS estados admitidos; R23 con `organizacion_id` |
| `db/corregir-datos-cliente.repo` | no hay `ayuda_tienda` (`:98`) | — | se quita de la lista (ningún caso lo usaba) |
| `db/traspaso-mensajero.int` | no hay `ayuda_tienda` (`:78`) | T9.9: payload `['origen','mensajeroId']` (SLT-59 D28) | R4 -> `en_reparto` es el ÚNICO traspasable (`ESTADOS_TRASPASABLES`); T9.9 afirma `origen: "traspaso"` |
| `db/gestiones-detalle-api-405` | falta `devolucion_por_confirmar` (`:140`) | R19: 15 consultas vs 14 (`cierre_detail_concepto`, SLT-52) | destino -> `novedad`; lista y número con `cierre_detail_concepto` |
| `db/costo-y-zona-api-415` | 8/11 rojos: `ivaFulfillment` nuevo en `costoReal/costoEstimado` (`:495`) | detalle 15 vs 14 (`cierre_detail_concepto`), listado 11 vs 9 (+`cierre_detail_concepto`, +`tarifa_activacion` SLT-54) | `ivaFulfillment: "0.00"` (tarifa del modelo viejo: cero por regla R47, `ivaFulfillmentDeTarifa`); listas y números medidos |
| `repositories/dinero-productos.int` | (k) R22: `modelo: 'viejo'` no es un importe (`:759`) | (449-h) era VACUO: miraba las claves del sobre `{modelo, tarifa}` | se recorren los importes DENTRO del sobre `TarifaCongelada`; 449-h mira la `TarifaVigente` de dentro con control `valorFlete` |
| `db/tarifa-zona-borrado-fk-real` | verde en local (18.2), rojo solo en CI (PG 17) `:382` | — | caso dependiente de la versión; el detector se afirma siempre (ver abajo) |

Ningún caso mostró un fallo real de producción (R1157): el rollup no descarta la orden huérfana y el
listado de la bodega no deja ver órdenes fuera de su alcance. `ivaFulfillment = "0.00"` es la regla
documentada para el modelo viejo (openapi `DESC_IVA_FULFILLMENT`), no un defecto.

### `tarifa-zona-borrado-fk-real`: por qué rojo en CI y verde en local (hipótesis anotada)

- `orden_zona_id_fkey` es `ON DELETE RESTRICT` (`pg_constraint.confdeltype = 'r'`, medido).
- Medido en la desechable (18.2) con dos tablas temporales: RESTRICT -> SQLSTATE **23001**, texto
  «violates RESTRICT setting of foreign key constraint» (sin traducir: texto nuevo); NO ACTION -> **23503**.
- `@prisma/adapter-pg` 7.8.0 (`dist/index.js:486`) solo traduce **23503** a `ForeignKeyConstraintViolation`
  (=> `P2003`, `PrismaClientKnownRequestError`); 23001 sale como `DriverAdapterError` sin `code`.
- **Hipótesis (no medida: no hay Postgres 17 local y Docker no está arrancado):** hasta Postgres 17 la
  violación de una RESTRICT se reportaba con 23503, igual que NO ACTION; por eso en CI (`postgres:17`,
  `.github/workflows/gate.yml:155`) el adapter la traduce a `P2003` y la «comprobación ingenua» la caza.
- El código de la app no depende de la versión: `esViolacionDeClaveForanea` acepta `P2003`, 23503 y 23001.
- Arreglo: el caso lee `server_version_num`; afirma SIEMPRE `esViolacionDeClaveForanea(e) === true`;
  en >= 18 afirma la cicatriz como antes; en <= 17 afirma `P2003` conocido. Si el brazo <= 17 se pone
  rojo en CI, la hipótesis era falsa: medir y reescribir (lo dice el test).

## Después

- (a) base vacía (migrate + seed): `Test Files 13 passed (13) · Tests 179 passed (179) · EXIT=0`.
- (b) con `en_fulfillment`, `ayuda_tienda` y `devolucion_por_confirmar` insertados y CONFIRMADOS en la
  desechable (R1151): `Test Files 13 passed (13) · Tests 179 passed (179) · EXIT=0`; filas borradas al terminar
  (`DELETE ... RETURNING` devolvió las 3).
- Número de casos: 179 antes y 179 después (R1156).

## Mutaciones (cada una restaurada desde copia; `git status -s lib/` vacío tras M2)

| # | mutación | comando | resultado |
|---|---|---|---|
| M1 (R1153) | quitar el `INSERT` de la fila huérfana en R45 | `vitest run analytics-daily-job.test.ts -t HUERFANO` | ROJO: `SLT-186: la fila huerfana debe existir en order_status: expected null not to be null` |
| M2 (R1155) | `condicionPasoPorBodegaSatelite()` -> `TRUE` en `OrdenRepository.ts` | `vitest run satelite-bodega-alcance-real.test.ts` | ROJO 2/4: «lo que no es de esta bodega no sale» `expected [ …(6) ] to not include '<id>'` (las 3 de fuera por alcance, incluida `propia-reprogramada`, entran) |
| M3 | umbral de versión `>= 180000` -> `>= 990000` (fuerza el brazo <= 17 en PG 18) | `vitest run tarifa-zona-borrado-fk-real.test.ts` | ROJO: `en Postgres <= 17 se esperaba un P2003 traducido: expected false to be true` |
| M4 | cuarentena/control del corte sin `en_reparto` (`in: []`) | `vitest run corte-diario-segundo-cierre-sql-real.test.ts` | ROJO 3/4: `el corpus NO quedo sembrado ... ordenesABarrer: 0` |

## Mapa R -> test

| R | test |
|---|---|
| R1150 | corrida (a): los 13 archivos, 179/179, 0 saltados (incluye `analytics-daily-job` y `satelite-bodega-alcance-real`) |
| R1151 | corrida (b) con las filas retiradas confirmadas: 179/179 |
| R1152 | `analytics-daily-job.test.ts` > «el estatus HUERFANO del catalogo no descarta la orden ni hace fallar la corrida (R45)» (INSERT ... WHERE NOT EXISTS dentro de `enTransaccionRevertida`) |
| R1153 | mismo caso: `expect(filaHuerfana, "SLT-186: ...").not.toBeNull()` + `not.toContain` en `ORDER_STATUS_SEED`; M1 |
| R1154 | `satelite-bodega-alcance-real.test.ts` > escenario `propia-reprogramada` (comentario con `ESTADOS_BODEGA_SATELITE`) |
| R1155 | `satelite-bodega-alcance-real.test.ts` > «lo que no es de esta bodega no sale…»; M2 |
| R1156 | 179 casos antes y después; ninguna aserción quitada; literales medidos (no generados) |
| R1157 | sin fallo de producción (sección T1) |
| R1158 | `tests/baseline-rojos.json`: 13 entradas quitadas (69 -> 56) |

## Archivos

- tests/integration/db/analytics-daily-job.test.ts
- tests/integration/db/satelite-bodega-alcance-real.test.ts
- tests/integration/db/cierre-descarga-intentos-entrega-sql-real.test.ts
- tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts
- tests/integration/db/corte-diario-segundo-cierre-sql-real.test.ts
- tests/integration/db/correccion-dia-reparto-efectos.int.test.ts
- tests/integration/db/correccion-dia-reparto.int.test.ts
- tests/integration/db/corregir-datos-cliente.repo.test.ts
- tests/integration/db/traspaso-mensajero.int.test.ts
- tests/integration/db/gestiones-detalle-api-405.test.ts
- tests/integration/db/costo-y-zona-api-415.test.ts
- tests/integration/db/tarifa-zona-borrado-fk-real.test.ts
- tests/integration/repositories/dinero-productos.int.test.ts
- tests/baseline-rojos.json
- specs/SLT-186-tests-estados-retirados/requirements.md (tasks marcadas)
- progress/features/SLT-186.md, progress/impl_SLT-186.md

`_semilla-rollup.ts` no se tocó: la fila huérfana se añade al `BaseSembrada` en el propio caso.

## Gate

- `bash ./init.sh` (rápido) por `con-desechable.cjs` sobre `servi_slt186_desechable`, log completo:
  - 1ª corrida: INIT_EXIT=1 por `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts` (timeout de
    20 s por saturación; recorre el árbol versionado, no toca nada de esta ficha). Sola: 11/11 en 5,8 s.
  - 2ª corrida: **INIT_EXIT=0**. typecheck OK; lint `0 errors, 248 warnings` (heredados); test:rapido y
    guardias verdes (100/100 archivos en cada tanda; 82/82 en la última).
- `node scripts/tamano-pr.mjs`: `14/40 archivos, 0/1000 lineas de produccion, 311/3000 de tests`.
- Baseline: 13 entradas que citaban SLT-186 quitadas (69 -> 56); no queda ninguna con SLT-186.

**Veredicto:** los 13 archivos del alcance de SLT-186 «Tests con estados retirados del catálogo» verdes en base vacía y con historial, sin tocar producción; el caso FK queda condicionado a la versión de Postgres con hipótesis anotada para PG 17.
