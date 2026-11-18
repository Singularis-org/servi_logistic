# impl SLT-188 «Tests que dejan filas fuera de su transacción»

Base desechable: `servi_slt188_desechable` (Postgres local 18, por `con-desechable.cjs`; sin URL impresa).

## Tanda 1 — T1 y T2 (2026-11-18)

Arranque: `git merge origin/dev` sin conflictos (la rama iba 154 commits por detrás). Ninguna entrada de
`tests/baseline-rojos.json` cita SLT-188.

### Archivos

| Archivo | Qué |
|---|---|
| `scripts/filas-fuera-de-tx.ts` (nuevo) | `foto` / `comparar` (tsx, cliente de Prisma por `import()`) y `unir` (Node puro: Node 24 le quita los tipos). Lectura en tx `READ ONLY` + `REPEATABLE READ`. Tablas de empresa descubiertas en `pg_catalog` (toda tabla con `organizacion_id`, sin particiones). |
| `tests/unit/guards/filas-fuera-de-tx.guardia.test.ts` (nuevo) | 13 casos: fixtures de la regla, `unir` de shards, motivo sin URL y 3 casos contra Postgres real (se saltan sin base). |
| `.github/workflows/gate.yml` | Shard: paso «Foto de la base antes de la suite» (tras `db:seed`, `continue-on-error`, a `$RUNNER_TEMP`) y paso «Filas fuera de su transaccion» (`if: always()`, tras la suite) que sube `filas-fuera-de-tx.json` con el artefacto. `gate-completo`: paso «Filas fuera de su transaccion» con `MODO_FILAS: informe` (no pone rojo) que escribe el resumen en `$GITHUB_STEP_SUMMARY`. |

Sin cambios en `init.sh`, `lib/`, `app/`, `db/` (R1186, R1187).

### T1 — foto de una base nueva (R1171)

Base recién creada + `prisma migrate deploy` + `pnpm run db:seed`, luego
`pnpm exec tsx scripts/filas-fuera-de-tx.ts foto <scratchpad>/slt188-foto-nueva.json` (EXIT=0):

```
foto: 0 organizacion(es), 20 order_status, 93 tablas con organizacion_id (1 con filas)
    jobs: 1
```

- 0 organizaciones: lo que la suite deje colgando de una empresa es todo suyo.
- 20 `order_status` (los del seed).
- 93 tablas con `organizacion_id`; solo `jobs` trae 1 fila desde las migraciones (job de plataforma,
  no de una empresa: no cuenta, la comprobación solo mira filas de organizaciones nuevas).

### T1 — fixtures y CLI (R1176, R1175, R1189)

`vitest run tests/unit/guards/filas-fuera-de-tx.guardia.test.ts` en la desechable: **13 passed (13)**, EXIT=0.

CLI sobre la desechable, fuga confirmada A MANO (org + zona commiteadas por `pg`, luego borradas):

```
organizacion «Empresa fuga SLT188» (slt188-fuga-cli, slt188-fuga-cli) — organizacion: 1, zona: 1
    zona: Zona fuga SLT188
2 filas fuera de su transacción
CLI_FUGA_EXIT=1
borradas 1
0 filas fuera de su transacción
CLI_LIMPIO_EXIT=0
```

`unir` con Node puro (`node scripts/filas-fuera-de-tx.ts unir <dir> 2 --modo rojo` con un shard sin
informe): EXIT=1; el mismo en `--modo informe`: EXIT=0; un solo shard en 0: EXIT=0.

### Mutaciones (cada una restaurada con `git checkout -- scripts/filas-fuera-de-tx.ts`)

| Mutación | Resultado |
|---|---|
| M1 descubrimiento: `attname = 'organizacion_idx'` | ROJO: «org + zona + orden + usuario nuevos ... salida 1» (1 failed / 12 passed) |
| M2 `comparar` sin filtrar por la foto «antes» | ROJO: «filas de una organizacion que ya estaba ... salida 0» |
| M3 `codigoDeSalida` da 0 a un informe en `error` | ROJO: «un informe que no pudo comparar cuenta como fallo» |
| M4 no contar `orden` | ROJO: el caso contra Postgres real |
| M5 quitar `SET TRANSACTION READ ONLY` | ROJO: «un INSERT dentro revienta (25006)» |

La primera pasada de M5 dejó confirmada la fila `organizacion.slt188-ro` en la desechable (el caso solo
revertía en el `catch`). Arreglado el test: revierte SIEMPRE; borrada la fila; M5 repetida en rojo sin dejar
nada, y `comparar` contra la foto nueva tras la suite del archivo da `0 filas fuera de su transacción`.

### T2 — enganche en CI, modo informe (R1172-R1174)

YAML validado con `js-yaml` (pasos en orden: Base del shard -> Foto -> init.sh -> Filas fuera de tx -> Log ->
Informe del shard; en `gate-completo`: `--unir` -> Filas fuera de tx -> Resumen). Pendiente: informe de los 3
shards del CI del PR (lo trae el leader para T3).

### Mapa R -> test (tanda 1)

| R | Test |
|---|---|
| R1170 | `filas-fuera-de-tx.guardia.test.ts` «R1176: una organizacion nueva ...», «R1170: un `value` de order_status ...», «R1176/R1170: org + zona + orden + usuario nuevos (Postgres real)» |
| R1171 | foto de base nueva (arriba) + paso «Foto» de `gate.yml` tras `db:seed` |
| R1172 | `gate.yml` pasos «Foto» y «Filas fuera de su transaccion» del shard (evidencia: CI del PR) |
| R1173 | «R1173: los tres en 0 ...», «R1173: un shard con filas -> rojo, nombrando shard, organizacion, tabla y conteo» (rojo activo en T6) |
| R1174 | «R1174: falta el informe de un shard -> rojo», «R1174: un informe que no pudo comparar cuenta como fallo» |
| R1175 | «R1175: la lectura va en una transaccion READ ONLY», «R1176: foto y estado en la MISMA instantanea ... salida 0» |
| R1176 | los tres casos 1/0/0 con fixtures + CLI fuga/limpio |
| R1189 | «el motivo de un error no lleva la URL» |

### Gate (rápido, en la desechable)

- Primera pasada: INIT_EXIT=1. Rojo NUEVO en `recursos-origen-fuera.guardia.test.ts`: el caso R1189 traía un
  texto con forma de URL de Postgres (`secreto-postgres-url`). Reescrito sin esa forma (host y credencial de
  mentira, sin esquema de URL).
- Segunda pasada: typecheck ✓, lint ✓ (solo warnings ajenos), test:rapido 4 lotes verdes
  (1253 + 1752 + 1575/1 skipped + 712), migraciones con down ✓, `== init OK ==`, **INIT_EXIT=0**.
- `tests/baseline-rojos.json`: sin cambios (ninguna entrada cita SLT-188; R1188).

Veredicto tanda 1: T1 hecha y verde; T2 enganchada en modo informe, a falta del informe de los 3 shards del CI.

## Tanda 2 — T2 (cierre) a T8 (2026-11-18)

### T2 — informe del CI del PR #222 (run 44359606182, sobre d5f3a414)

Los 3 shards: `{"estado":"ok","organizaciones":[],"orderStatusNuevos":[],"totalFilas":0}`. `gate-completo`:
`shard 1/3 .. 3/3: 0 filas fuera de su transacción` · `total: 0 filas fuera de su transacción` (modo informe).

### ¿Es ciega? Evidencia de que no

- **Misma base:** `DATABASE_URL` y `DIRECT_URL` se fijan en el `env:` del workflow (`gate.yml:38-43`), y ningún
  paso del shard los cambia. `Base del shard` migra y siembra (`gate.yml:213-219`); la `Foto` corre después
  (`:225-228`) y antes de `init.sh --completo` (`:230-240`); `comparar` corre detrás (`:246-250`). Los tres
  `init-shard.log` dicen «DATABASE_URL viene del entorno; no se carga el .env», y el shard 1 corrió
  `filas-fuera-de-tx.guardia.test.ts (13 tests)` sin saltos: sus 3 casos de Postgres usan esa misma URL.
- **Pero** la foto imprimía su resumen solo en el log del paso, no en el artefacto. Por eso el informe gana ahora un
  **control** que sale en el resumen de `gate-completo`: tablas con `organizacion_id` antes y después, organizaciones
  y filas de la foto, y **las inserciones en `organizacion` durante la suite** (`pg_stat_user_tables.n_tup_ins`, que
  cuenta también las de tx revertidas). En CI (`comparar` con `exigirSuite`), un control con 0 tablas o con 0
  inserciones es **comprobación ciega**: el informe sale en `error` y `gate-completo` va a rojo (R1174).
- Local, en la desechable: foto y `comparar` SIN suite en medio -> `comprobacion ciega: la suite no inserto ninguna
  organizacion en esta base`, salida 1. Con la guardia entre medias -> `0 filas`, control con `1 insercion(es)`,
  salida 0. Con los 39 archivos -> `440 insercion(es)`.

### T3 — atribución (R1177, R1181, R1182)

- Clase (a): **tabla vacía** en CI: los 3 shards dieron 0, así que no hay archivo que atribuir. R1181: la ficha
  cierra con la detección y R1180, sin inventar arreglos.
- Clase (b): 39 archivos commitean una `organizacion` (`grep` de `crearOrganizacion(prisma|base|…)`,
  `prisma.organizacion.create` y la lista del spec). 35 escriben el motivo en el archivo (p. ej.
  `aislamiento-ordenes.test.ts:34`, «los repositorios abren su propia `$transaction`»). 4 no lo escriben:
  `integracion-migracion.test.ts:127`, `para-cada-empresa-modulo.test.ts:25`,
  `premio-ranking-idempotencia.test.ts:1080` y `419/_escenario-419.ts`. Los cuatro limpian. Van a la deuda
  **D79**, sin tocarlos: sin fuga medida (R1181) y con la decisión del leader sobre 419.

### T4 — escritores

Nada que arreglar: 0 filas en CI. El hallazgo de T7 (abajo) va a la deuda D80.

### T5 — `total-a-cobrar-sin-cerrado-sql-real` (R1180)

La central se crea siempre en la empresa de la tx, con control positivo (`count === 1` de centrales de esa empresa).
- ANTES del arreglo, con una central de otra empresa confirmada en la desechable: **4 failed (4)**,
  `DriverAdapterError: referencia a otra empresa: orden.zona_id -> zona` (SL017).
- DESPUÉS, con la central ajena: **4 passed (4)**. Base vacía (ajena borrada): **4 passed (4)**.
- Mutación del control (`!== 1` -> `!== 99`): **4 failed (4)**; restaurada con `git checkout --`.

### T6 — rojo activado y mutación (R1173, R1185)

`gate.yml`: `MODO_FILAS: rojo`. Mutación R1185 sobre un archivo que limpia (`para-cada-empresa-modulo.test.ts`,
sin el `deleteMany` del `afterAll`; restaurado con `git checkout --`):

```
organizacion «SL-23 con monitoreo» (prueba-1961478b68e7, e88403c5-…) — organizacion: 1, organizacion_modulo: 1
organizacion «SL-23 sin monitoreo» (prueba-20a92f2a466b, 5d1d891e-…) — organizacion: 1, organizacion_modulo: 1
4 filas fuera de su transacción
R1185_EXIT=1
unir … --modo rojo -> total: 4 filas fuera de su transacción; 0 shard(s) sin informe valido · UNIR_ROJO=1
```
Las 2 organizaciones se borraron de la desechable después.

### T7 — doble corrida (R1184)

Los 39 archivos de la clase (b), más `419/`, `454/`, `total-a-cobrar` y la guardia (88 archivos, 610 tests), dos veces
seguidas sobre `servi_slt188_desechable`, con foto y `comparar` en cada una:
- **Intento 1:** corrida 1 con 610 passed y `0 filas`. En la corrida 2 el worker de vitest **murió** en
  `454/caracterizacion/corte-concurrencia.test.ts` («Worker exited unexpectedly»; 2 casos sin correr) y la
  comprobación dio **12 filas**, salida 1: el escenario de `sembrarComprometido` (orden `R-454…`, «Central 454 …»,
  5 usuarios). Purgado de la desechable. El archivo solo: 3 de 3 verdes y `0 filas`. Va a la deuda **D80**.
- **Intento 2:** corrida 1 con 610 passed y `0 filas` (control: 440 inserciones); corrida 2 con 610 passed y `0 filas`
  (control: 440 inserciones). Salidas 0 y 0.

### T8 — cierre

- `git diff --name-only origin/dev -- lib app components hooks db`: vacío.
- `node scripts/tamano-pr.mjs`: `4/40 archivos, 96/1000 lineas de produccion, 87/3000 de tests`.
- `tests/baseline-rojos.json`: sin cambios (R1188).
- Gate rápido en la desechable, tras `git merge origin/dev` (con #222 dentro): typecheck ✓, lint ✓, test:rapido
  1250 + 1735 + 1595 (1 skipped) + 719 verdes, `== init OK ==`, **INIT_EXIT=0**.
- Queda para el leader: `gate-completo` del PR nuevo, que ya corre en modo rojo, tiene que decir
  «0 filas fuera de su transacción» en los 3 shards (R1183).

### Mapa R -> test (completo)

| R | Test / evidencia |
|---|---|
| R1170, R1175, R1176, R1189 | `filas-fuera-de-tx.guardia.test.ts` (tanda 1) |
| R1171 | foto de base nueva (tanda 1) + `gate.yml:225-228` |
| R1172 | `gate.yml:225-228` y `:246-250`; informe de los 3 shards del run 44359606182 |
| R1173 | «R1173: …» de la guardia; `MODO_FILAS: rojo`; T6 `UNIR_ROJO=1` |
| R1174 | «R1174: falta el informe…», «una comprobacion CIEGA no da 0: da fallo» (3 casos) |
| R1177, R1181 | T3: CI con 0 filas, tabla de atribución vacía |
| R1178, R1179, R1186, R1187 | sin escritores que arreglar (0 filas); nada en `lib/` |
| R1180 | `total-a-cobrar-sin-cerrado-sql-real.test.ts` (4 casos; con datos ajenos y en base vacía) |
| R1182 | inventario T3 -> D79 |
| R1183 | `gate-completo` del PR de la tanda 2 (pendiente del CI) |
| R1184 | T7 intento 2: 0 y 0 |
| R1185 | T6: mutación de `para-cada-empresa-modulo` -> salida 1 nombrando «SL-23 …» |
| R1188 | baseline sin cambios |

Veredicto tanda 2: T2-T8 hechas; rojo de CI activo; falta ver `gate-completo` del PR nuevo.
