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
