# SLT-187 «Tests de migración desfasados tras SL-17» — bitácora (backend_dev)

## Entorno
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), `migrate deploy`
  (331 migraciones) + `pnpm run db:seed`:
  - **A** `servi_slt187_desechable`: vacía (solo catálogos). R1160.
  - **B** `servi_slt187b_desechable`: + empresa AJENA CONFIRMADA con una orden en `ayuda_tienda` SIN fila
    de solicitud, sembrada con un test temporal (`454/zz-slt187-ajena.tmp.test.ts`, `crearEscenario` +
    `sembrarOrden` en una tx que SÍ se confirma; borrado antes de commitear). R1166.
- `prisma generate` no se ejecutó. `git diff --name-only origin/dev -- lib app components hooks db scripts`
  vacío. Ninguna migración tocada.

## T1 — medir (base A, antes)
14 archivos (7 del spec + 7 del alcance ampliado de `progress/features/SLT-187.md`): 13 rojos, 30 casos
fallidos / 236 verdes. `retiro-estados` pasaba en A (13/13) y en B daba `P0001` (reproducido).
R1168: la base tiene lo que dicen las migraciones de SL-17 (consultado `pg_policies`, `pg_indexes`,
`information_schema`, `pg_constraint`): `<tabla>_por_empresa` FOR ALL TO servi_app con
`organizacion_id = NULLIF(current_setting('app.organizacion_id'),'')`, `organizacion_id` NOT NULL con FK
RESTRICT e índice, y los únicos de idempotencia sobre `(organizacion_id, clave_idempotencia)`. Nada sin
migración que lo respalde: no hubo que parar.

| archivo | primer error | causa | arreglo |
|---|---|---|---|
| historial-accion-migration | R8 espera 0 policies; FK: espera 1 | SL-17: policy + FK `organizacion_id` | policy literal exacta; FK por nombre (2) + def literal de la de empresa; `entidad_id` sin FK |
| postulacion-recurso-migration | R22 0 policies; columnas; índices; 6 casos «no hay usuario» | SL-17 + base vacía | policy literal; `organizacion_id` NOT NULL; índice `_organizacion_id_idx` literal; `unUsuario` CREA su usuario en la tx (`crearUsuarioDePrueba`) con control positivo |
| vista-filtro-migration | down de posteriores; columnas; índices; FK; policies; «usuario vacía» | filtro ausente + SL-17 + base vacía | barrido solo `< CARPETA` + 2 controles (R1163); columna, índice, FK y policy literales; usuario sembrado |
| wallet-458-migration | `slice(-2)` y tamaños | valores añadidos al final después | posiciones literales `slice(25,27)/(16,18)/(63,65)`; origen/entidad sin los seis; tamaños `>=` (sustitución explícita de R1164) |
| wallet-461-idempotencia-clave | `indexdef` sobre `(clave_idempotencia)` | `unicos_por_empresa` | `indexdef` literal `(organizacion_id, clave_idempotencia)`; caso NUEVO «otra empresa no choca» (ACEPTADO, ACEPTADO, 23505 + control 2 empresas) |
| 454/orden-evento-migration | lista de columnas | SL-17 | `organizacion_id` en la lista y en el bucle NOT NULL |
| 454/retiro-estados-migration | `P0001` solo con datos ajenos | M3 recorre toda `orden` | ver T6 |
| habilitacion-api-migration | modelo Prisma 8 vs SQL 7 | SL-17 añadió la columna por ALTER | `prisma == sql + ["organizacion_id"]` |
| orden-traspaso-migration | lista de posteriores 136 vs 33; columnas | 103 migraciones sin declarar + SL-17 | las 103 declaradas como literales (2 de SL-17 marcadas: sí tocan la tabla, medido con grep); `organizacion_id` en columnas |
| premio-ranking-devengo-migration | `AGREGADOS_DESPUES` | SLT-73 y SLT-94 añadieron orígenes | los dos declarados con su migración |
| push-canal-restricciones | 0 policies | SL-17 | policy literal exacta por tabla |
| ranking-snapshot-migration | R12 P2022 | esquema temporal sin `organizacion_id` | ver abajo |
| webhook-suscripcion-circuito-migracion | columnas tras el down | SL-17 | `organizacion_id` en la lista |
| busqueda-usa-indice | plan elige `orden_organizacion_id_created_at_vivas_idx` | carrera de coste con el parcial de SL-24 | ver abajo |

### Decisiones
- **retiro-estados (T6, R1166):** `m3SoloDeLaEmpresa` corre el SQL de M3 como `servi_app` con la empresa de
  la tx fijada: la RLS por empresa de SL-17 deja al `DO` ver/tocar solo lo del escenario. El DDL de la 455
  sigue con el rol dueño; `GRANT INSERT, DELETE ON order_status TO servi_app` dentro de la tx revertida
  (Postgres comprueba el permiso aunque no toque filas). El retiro del catálogo era no-op ya ((c) lo
  afirma). Esquema desechable descartado: el escenario usa servicios reales sobre ~30 tablas.
- **busqueda-usa-indice:** «¿PUEDE el trigram servir?» se mide sobre `pg_temp.orden` (solo el corpus de la
  tx, control de 300 filas) con UN índice creado con `pg_get_indexdef` del real; el SQL capturado solo cambia
  `"public"."orden"` → `pg_temp."orden"`. Sin carrera de coste, sin lock sobre `orden`, sin pending list.
- **ranking-snapshot:** el esquema temporal recibe las sentencias REALES de SL-17 M2 y `unicos_por_empresa`
  que nombran `ranking_snapshot_*` (10, contadas; sin triggers sme_ ni FK a `organizacion`, que dio 40P01);
  `crearPrismaDeTestEnEsquema(esquema, { organizacionId })` (nuevo parámetro opcional en `_postgres-real.ts`)
  fija `app.organizacion_id` por conexión (`-c` del pool). El DROP del esquema reintenta en 40P01 (medido 1/4).

## Antes / después (vitest, los 14 archivos)
- Antes, A: 13 archivos rojos, 30 fallidos / 236 verdes (266).
- Después, A: 1 fallido / 260 verdes / 6 saltados (los de bloque B/C de `ranking` cuando el beforeAll
  cayó en el deadlock ya corregido); tras el reintento: 1 fallido (wallet-458 (c)) / 266 verdes.
- Después, B (orden ajena): `Tests 1 failed | 266 passed (267)`; el fallido es wallet-458 (c).
- retiro-estados: A 13/13, B 13/13.

## Mutaciones (una a una, restauradas desde copia; `scratchpad/mut.sh`)
| id | archivo | mutación | resultado |
|---|---|---|---|
| M1 | historial-accion | policyname literal | 1 failed |
| M2 | historial-accion | quitar la FK de empresa de la lista | 1 failed |
| M3 | postulacion-recurso | roles `{public}` | 1 failed |
| M4 | postulacion-recurso | `unUsuario` sin sembrar | 6 failed |
| M5 | vista-filtro | quitar el filtro `< CARPETA` | 1 failed (control) |
| M5c | vista-filtro | quitar filtro Y el control | 1 failed: «20261022130100… fue tocado» |
| M6-M9 | vista-filtro | columna / policy / FK RESTRICT→CASCADE / usuario sin sembrar | 1 failed cada una |
| M10 | wallet-458 | `slice(26,28)` (valor insertado antes) | 2 failed ((a)+(c) previo) |
| M11 | wallet-458 | «no recibe» contra `caja` | 2 failed |
| M12 | wallet-461 | misma empresa en vez de otra | 1 failed |
| M13 | wallet-461 | indexdef viejo | 1 failed |
| M14b/M15 | orden-evento | NOT NULL esperado YES / quitar columna | 1 failed cada una |
| M16 | retiro-estados (base B) | sin `set_config('role','servi_app')` | suite roja: `P0001 … sin fila de solicitud` |
| M17/M18 | orden-traspaso | quitar una posterior / la columna | 1 failed cada una |
| M19 | busqueda-usa-indice | copia sin el índice | 4 failed (`Seq Scan on orden`) |
| M20 | ranking-snapshot | sin las sentencias de SL-17 | 1 failed (R12) |
| M21-M24 | push / webhook / habilitacion / premio | literal policy / columna / `+organizacion_id` / origen | 1 failed cada una |

M14 (quitar `organizacion_id` del bucle) quedó verde, como se espera de quitar un check; por eso M14b.

## Mapa R → test
- R1160: los 14 archivos verdes en A (salvo wallet-458 (c), causa SLT-195).
- R1161/R1162: `historial-accion-migration` «R8: su UNICA policy…», `postulacion-recurso-migration` «R22…»,
  `vista-filtro-migration` «la RLS esta habilitada…», `push-canal-restricciones` «y su UNICA policy…».
- R1163: `vista-filtro-migration` «ningun `down.sql` ANTERIOR fue tocado» (M5, M5c).
- R1164: `wallet-458-migration` «(a)…posiciones que les dio la 458-B» (M10, M11).
- R1165: `wallet-461-idempotencia-clave` «R67 · la barrera…» y «R67 · SLT-187: la MISMA clave en OTRA
  empresa…»; `454/orden-evento-migration` «append-only…».
- R1166: `454/retiro-estados-migration` (13/13 en A y B; M16).
- R1167: tabla de mutaciones; ningún caso bajó (wallet-461 sube de 5 a 6).
- R1168: T1 (sin parada).
- R1169: `tests/baseline-rojos.json` (abajo).

## Baseline (T7)
Quitadas 13: busqueda-usa-indice, habilitacion-api-migration, historial-accion-migration,
orden-traspaso-migration, postulacion-recurso-migration, premio-ranking-devengo-migration,
push-canal-restricciones, ranking-snapshot-migration, vista-filtro-migration, wallet-461-idempotencia-clave,
webhook-suscripcion-circuito-migracion, 454/orden-evento-migration, 454/retiro-estados-migration.
Queda 1: `wallet-458-migration`, motivo nuevo medido (caso (c) en el escenario 459, `repartoMensajero`
sin_saldo, D64), la retira SLT-195; `desde` sin cambiar.

## Typecheck, lint, gate
- `pnpm run typecheck`: sin errores.
- `pnpm exec eslint <15 archivos>`: 0 errores, 1 warning previo (`wallet-461…:30 'cat'`, no tocado).
- `./init.sh` (rápido, base A, vía con-desechable): `== init OK ==`, **INIT_EXIT=0**. Guardias 60/60
  archivos (757 casos). Aviso: 620 tests relacionados (por `_postgres-real.ts`) pasan del presupuesto (150)
  y no se corren en local: los cubre `gate-completo` en CI. Los 14 archivos de la ficha se corrieron aparte
  (arriba).
- `node scripts/tamano-pr.mjs`: 16/40 archivos, 0/1000 líneas de producción, 698/3000 de tests.
- `_postgres-real.ts`: único helper tocado; parámetro opcional, retrocompatible (las otras 10 llamadas no
  cambian).

## Veredicto
Los 14 tests de migración desfasados vuelven a verde salvo wallet-458 (c), que es del escenario 459 (SLT-195).
