# SL-11 «Fuera zonas y seeds de Ordenex» — bitácora del implementer

Worktree `.worktrees/SL-11-fuera-zonas-y-seeds-ordenex`, rama `feature/SL-11-fuera-zonas-y-seeds-ordenex`.
Base desechable `servi_logistic_sl11` en el mismo Postgres local del `.env` principal (localhost).

## T0 — Punto de partida (2026-10-21)

- `git merge dev` (en vez de rebase, por instrucción del leader): limpio, sin conflictos → `2090784`.
  Trae SL-10 integrada.
- `tests/baseline-rojos.json` existe y lleva las dos entradas de zona
  (`zona-central-guarda-y-rastro`, `zona-guardado-conserva-inactivos`).
- `DATABASE_URL` exportada en la sesión hacia `localhost/servi_logistic_sl11`; no contiene
  los ids de proyecto Supabase de la app de origen ni `supabase` (comprobado por script).
- `CREATE DATABASE servi_logistic_sl11`: OK.

## T1 — Línea base (código sin cambiar)

`prisma migrate deploy` sobre la base vacía (`_trabajo/migrate-antes.log`): aborta, como se esperaba.

```
Applying migration `20260918120200_zona_sinpe_no_nulo`
Error: P3018
Migration name: 20260918120200_zona_sinpe_no_nulo
Database error code: P0001
ERROR: FICHA 429: hay bodegas sin SINPE. Corre primero la siembra (`pnpm exec tsx scripts/seed-sinpe-inicial.ts`) con NEXT_PUBLIC_SINPE_NUMERO y NEXT_PUBLIC_SINPE_NOMBRE en el entorno, y vuelve a aplicar esta migracion.
EXIT=1
```

`./init.sh` (rápido) con esa base, log `_trabajo/gate-antes.log`:

```
Test Files  282 passed (282)
     Tests  3792 passed (3792)
[test:rapido] 4 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
INIT_EXIT=0
```

Rojos heredados (baseline, excluidos en modo rápido): `dependencias-declaradas-presentes`,
`reclasificacion-459-lista`, `zona-central-guarda-y-rastro`, `zona-guardado-conserva-inactivos`.
Lint: 0 errores, 235 avisos. Base borrada y recreada al acabar.

## T2 — Migraciones (backend_dev)

- `20260709120000_seed_maestro_user/migration.sql`: fuera el `INSERT INTO "usuario"`; quedan los
  catálogos `rol maestro` y `tipo_identificacion cedula`; cabecera sin «Ordenex». `down.sql`: no hace
  nada (`SELECT 1;`), con el comentario de por qué.
- `20260918120100_zona_sinpe/{migration,down}.sql`: solo los comentarios que nombraban
  `seed-sinpe-inicial.ts`.
- `20260918120200_zona_sinpe_no_nulo/migration.sql`: cabecera sin los 3 pasos con siembra; mensaje
  nuevo «hay bodegas sin SINPE: complétalo en cada bodega desde la aplicación y vuelve a aplicar esta
  migración». El SQL ejecutable (`DO`, `NOT NULL`, dos `CHECK`) no cambia.
- Borradas `20260720150000_drop_default_maestro_user/` y `20260713010000_seed_zonas_pago_distrito/`.

Sobre `servi_logistic_sl11` vacía (0 tablas), sin ninguna variable `*SINPE*` en el entorno:

```
$ pnpm exec prisma migrate deploy
...
All migrations have been successfully applied.
DEPLOY_EXIT=0          (229 «Applying migration»)

$ pnpm exec prisma migrate status
229 migrations found in prisma/migrations
Database schema is up to date!
STATUS_EXIT=0

zona=0  zona_distrito=0  usuario=0  provincia=7  canton=84  distrito=494
_prisma_migrations fallidas o revertidas=0  rol maestro=1  tipo_identificacion cedula=1
```

## T3 — Fuera el SINPE inicial y el desatasco (backend_dev)

- Borrados `scripts/seed-sinpe-inicial.ts` y, en esta misma tanda porque importan lo borrado y no
  compilarían, dos de los tests de D7: `tests/unit/scripts/seed-sinpe-inicial.test.ts` y
  `tests/unit/scripts/migrate-deploy-auto-resolucion.test.ts`.
- `scripts/migrate-deploy.ts`: fuera `sembrarSinpe` y `resolverMigracionRevertida` (interfaz y
  efectos reales) y la rama `auto.resolver`; el fallo de `migrate deploy` va directo a aviso de
  `SIGTERM` + `salir(1)`. Captura de salida y siembra de jobs sin cambios.
- `scripts/migrate-deploy-guardas.ts`: fuera `MIGRACIONES_AUTO_RESOLUBLES`, `DecisionAutoResolucion`
  y `decidirAutoResolucion`.
- Guardia `NEXT_PUBLIC_SINPE`: `PERMITIDOS` vacía, fuera el caso que leía `seed-zonas.ts`; la
  contraprueba de inyección se queda. Mutación: meter `lib/utils/sinpe-cr.ts` en `PERMITIDOS` pone
  en rojo la contraprueba (2 failed | 3 passed); restaurado.
- `prisma-client-sin-adaptador`: fuera el caso «sembrarSinpe usa la fábrica de la app».
- **Toque mínimo en archivo de T7**, solo para que compile: `tests/integration/db/zona-sinpe-migration.test.ts`
  pierde el import de `@/scripts/seed-sinpe-inicial`, `entornoDeSiembra` y los dos casos R10 del
  trasvase (los que D5 retira). Quedan para T7: el caso nuevo del aborto, la línea que afirma el
  mensaje viejo (`toContain("scripts/seed-sinpe-inicial.ts")`) y el `toThrow(/FICHA 429/)`, que ya no
  casan con el mensaje nuevo; y 6 avisos de lint `no-unused-vars` (`SEMILLA_*`, `CORREGIDO_*`,
  `ID_CORREGIDA`, `clienteDeSiembra`).

```
$ pnpm run typecheck
scripts/seed-zonas.ts(14,29): error TS2307: Cannot find module './seed-sinpe-inicial' ...
TC_EXIT=2      (único error: seed-zonas.ts, que se borra en T4)

$ pnpm exec vitest run tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts \
    tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts \
    tests/unit/guards/prisma-client-sin-adaptador.guardia.test.ts
 Test Files  3 passed (3)
      Tests  32 passed (32)
```

## T4 — Fuera los seeds y los archivos de Ordenex (backend_dev)

- Borrados: `public/geografia-cr-completa.xlsx`, `public/mapa-geografico-costa-rica.xlsx`,
  `public/geografia-cr-completa-NOTAS.md`, `scripts/seed-zonas.ts`, `scripts/seed-usuarios-qa.ts`,
  `scripts/seed-maestro.ts`, `04_insert_zonas_pago_distrito.sql`, y los tres tests de D7 que quedaban
  (`tests/unit/scripts/seed-zonas.test.ts`, `tests/unit/scripts/seed-zonas-codigo-dta.test.ts`,
  `tests/integration/db/seed-zonas-cruza-por-codigo.test.ts`); los otros dos salieron en T3.
- `package.json`: fuera `db:seed:maestro`, `db:seed:usuarios` y `db:seed:zonas`; queda `db:seed`.

```
$ pnpm run typecheck
tests/unit/scripts/carga-masiva-ejemplos-geo.test.ts(20,8): error TS2307: Cannot find module '@/scripts/seed-zonas' ...
TC_EXIT=2      (único error; ese archivo es de T8 y no se tocó por instrucción del leader)
```

Tras el commit de T4: `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` → 1 archivo, 13 tests en verde (R4).

## T5 — Fixture compartido (backend_dev)

Nuevo `tests/integration/db/_fixtures/orden-minima.ts`: `crearUsuarioDePrueba(tx, rol)` (email
`<rol>-<sufijo>@example.com`, cédula `fx-<sufijo>`, `cedula` de la migración `20260709120000`) y
`crearFksDeOrden(tx)` (`en_preparacion`, Cartago/Cartago, tienda `adminTienda`, zona inventada no
central con SINPE `80000000`, orden viva). Si falta catálogo o geografía lanza «… aplica las
migraciones». Sin `return null` ni `if (!x) return;`. Typecheck `TC_EXIT=0`.

## T6 — Los `zona-*` con sus datos (backend_dev)

- Los seis de R11 crean FK y actor tras `serializarEscriturasReales(tx)` en cada transacción
  revertida; fuera `fksDeOrden`, `usuario.findFirst` y los mensajes `db:seed:*`. Aserciones intactas.
  Actor: `admin` (en `zona-reconciliacion-ordenes`, `mensajero`, porque hace de mensajero y de cierre).
- `tests/baseline-rojos.json`: fuera las dos entradas de zona (R12). `gate-cableado-arnes-v2` 5/5.

Sobre `servi_logistic_sl11` recién migrada, sin ningún usuario y sin `db:seed`:

```
Test Files  6 passed (6)
     Tests  75 passed (75)
después: [{"usuario":"0","zona":"0","orden":"0"}]
```

**Desviación de la mutación de D6 (para el reviewer).** La mutación que fija D6/T6 —quitar la
creación de la orden en `crearFksDeOrden`— **sobrevive** (`6 passed / 75 passed`, medido dos veces):
ningún `zona-*` consume esa orden; cada escenario crea las suyas y del fixture solo lee FK. No se
cambió spec ni código por ello. En su lugar se midieron dos mutaciones que sí prueban la dependencia
(con `pnpm exec vitest run tests/integration/db/zona-`, 8 archivos, 108 tests, verde antes y después):

```
(a) tiendaId: randomUUID(), sin crear la orden del fixture -> Tests 32 failed | 76 passed (108)
    zona-central-guarda-y-rastro 3, zona-pago-mensajero-rastro 1, zona-reconciliacion-ordenes 28
    (orden_tienda_id_fkey)
(b) cantonId: randomUUID(), sin crear la orden del fixture -> Tests 64 failed | 44 passed (108)
    zona-central-guarda-y-rastro 16, zona-guardado-conserva-inactivos 2,
    zona-pago-mensajero-rastro 18, zona-reconciliacion-ordenes 28
    (distrito_canton_id_fkey, orden_canton_id_fkey)
revertidas -> Test Files 8 passed (8), Tests 108 passed (108); git status limpio
```

`zona-sinpe-rastro` y `zona-sinpe-revision` no llaman a `crearFksDeOrden` (solo a `crearUsuarioDePrueba`).
Queda abierto si la orden del fixture sobra: D6 la pide y ningún consumidor la usa.

## T7 — `zona-sinpe-migration` y `geografia-dta-2026-migration` (backend_dev)

- `zona-sinpe-migration`: el caso estático afirma el mensaje nuevo literal y que no nombra script,
  `pnpm`, `db:seed`, `process.env` ni variable en mayúsculas con guion bajo. Con 3 bodegas sin SINPE
  creadas por el test entre las dos migraciones, la `120200` aborta con el mensaje nuevo y las columnas
  siguen nullables; un `UPDATE` del test las completa y la migración aplica.
- `geografia-dta-2026-migration`: ya no aplica `20260713010000`; crea «Zona Fixture Buenos Aires»
  (9 distritos) y «Zona Fixture Bagaces» (4); Guácimo sin vínculos. Afirma el nombre de la zona fixture.

```
Test Files  2 passed (2)   Tests  48 passed (48)
contraprueba (copia de la 120200 sin el DO): Tests 2 failed | 28 passed (30)
  - caso estático «falta el RAISE EXCEPTION»; R8: got Code 23502 «contiene valores null»
restaurada: git status limpio en db/; ningún esquema t_% residual
```

## T8 — Test de la carga masiva (backend_dev)

`carga-masiva-ejemplos-geo.test.ts` parsea los `INSERT INTO "distrito"` de `20260713005000` y
`20260905175156` y normaliza con `normalizeZonaKey`. Casos: parser sobre línea literal, sobre formato
multilínea, 494 ternas sin repetidas, terna inventada ausente. Fuera el caso «tiene zona».

```
Tests  6 passed (6)
contraprueba (example de provincia = «Narnia» en copia de carga-masiva-fields.ts): Tests 1 failed | 5 passed (6)
restaurado; typecheck TC_EXIT=0
```

## T9 — Mensajes de los tests (backend_dev)

11 archivos de `tests/integration/db/` (incluye `419/_escenario-419.ts` y `_fixtures/caja-459.ts`):
solo el texto del `throw` pasa a «esta suite necesita crear su usuario en el test (SL-31)» (o su
zona/datos). Ninguna aserción cambia. `git grep -E "db:seed:(maestro|usuarios|zonas)"` sobre
`tests scripts lib app README.md` da 0 resultados (`rg` no está en el PATH).

Fuera de alcance, sin tocar (no piden un `db:seed…`; R3 no los cubre; candidatos para SL-31/SL-15):
`throw` que citan `scripts/seed-zonas.ts` en `api-key-eliminabilidad:53`, `455/caracterizacion/api-lectura:124`,
`454/_escenario:149`, `cierre-rechazo-tienda-aprobacion:763`, `deshacer-asignacion-zona-satelite.int:94,112`,
`correccion-dia-reparto.int:96`, `emisor-relaciones-anidadas:114`, `historial-accion-atomicidad:108`,
`orden-eliminada-actor-admin:66`; y comentarios en `lib/geo/normalize.ts:3`, `lib/actions/geografia.ts:44,187`,
`lib/interfaces/repositories/IGeoRepository.ts:26`, `GeografiaAdminModule.tsx:60`,
`geografia-renombrado-punto-unico.guardia.test.ts:13`, `lib/utils/sinpe-cr.ts:8`.

## T10 — README (backend_dev)

«Base de datos» en dos comandos (`pnpm exec prisma migrate deploy`, `pnpm db:seed`) más la nota de
`pnpm exec prisma migrate reset` para bases anteriores al 2026-10-21. «Usuario maestro (bootstrap)»
pasa a «### Usuarios»: «La app nace sin ningún usuario; el primero, el superadmin, llega con SL-32.»
Buscar `sinpe|seed-|xlsx|04_insert|maestro` en el README: 0.

## T11 — Guardia `fuera-datos-ordenex` (backend_dev)

`tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` (R1, R2, R3, R6, R9, R16), anti-vacuidad en
cada barrido, 4 contrapruebas sintéticas en rojo. Los literales prohibidos se componen por partes
para que la guardia se barra a sí misma. R16 usa regex de email (`"@prisma/client"` no cuenta).

```
Test Files  1 passed (1)   Tests  28 passed (28)
mutaciones en el árbol (revertidas, git status limpio):
  "db:seed:zonas" en package.json          -> 1 failed | 27 passed (R2)
  @example.com -> @ordenex.test en fixture -> 1 failed | 27 passed (R16)
  "corre pnpm db:seed:zonas" en README     -> 1 failed | 27 passed (R3)
typecheck TSC_EXIT=0; eslint ESLINT_EXIT=0
```

## T12 — Arranque y gate de cierre (implementer)

Sobre `servi_logistic_sl11` (migrada en T2, sin usuarios):

```
$ pnpm run db:seed
Seed de catalogos completado (tipo_identificacion, rol, order_status, vehiculos).
SEED_EXIT=0
$ pnpm exec prisma migrate status -> 229 migrations found / Database schema is up to date!
conteos: [{"usuario":"0","zona":"0","zd":"0","p":"7","c":"84","d":"494"}]

$ pnpm exec next dev -p 3111   (un solo dev server; parado y .next/dev borrado después)
 ✓ Ready in 4.6s
 GET /login 200 in 12.5s
 GET /login 200 in 63ms
curl: GET /login -> 200 (x2)
SELECT count(*) FROM usuario -> [{"count":"0"}]
```

`./init.sh` (rápido), log `_trabajo/gate-sl11.log`:

```
[test:rapido] 'origin/dev' no existe; se omite la seleccion por diff.
 Test Files  285 passed (285)
      Tests  3837 passed (3837)
[test:rapido] 2 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
✖ 235 problems (0 errors, 235 warnings)     (lint, igual que la línea base)
INIT_EXIT=0
```

Como el gate rápido no seleccionó por diff (no hay `origin/dev`, por la regla de no push), corrí a
mano `pnpm exec vitest related --run` con los 26 `.ts` cambiados, más `jobs-recurrentes-con-siembra`,
`migrate-deploy-guardas` y `test-citado-desaparecido`, contra la base (`_trabajo/related-sl11.log`):

```
Tests  32 failed | 304 passed | 278 skipped (614)   RELATED_EXIT=1
```

Los rojos son 42 archivos y **ninguno es de SL-11**: ni los `zona-*`, ni `geografia-dta-2026`, ni la
carga masiva, ni las guardias. Todos son suites que leen datos preexistentes de la base, la deuda que
el spec manda a SL-31 («los 68 de SL-31 revientan sobre una base vacía»). Motivos, por conteo:
31 «faltan la zona central, el tipo `cedula` o una orden…» (escenarios 419/459); 14 «esta suite
necesita crear su(s) usuario(s) en el test (SL-31)»; 6 «no tiene ni un usuario» (postulación);
3 «tabla `orden` vacia»; el resto, variantes de «`usuario` esta vacia». Sobre la base de la línea
base (sin órdenes ni usuarios) fallaban igual. Lo decide el leader.

R18: `git diff --name-only dev...HEAD` (55 rutas) no toca `specs/` fuera de
`specs/SL-11-fuera-zonas-y-seeds-ordenex/`, ni ninguna ruta de `arnes.manifest` (43 entradas,
incluidas `.claude/agents/`, `.claude/commands/` y `.claude/hooks/`). Las migraciones de geografía
`20260713005000`, `20260905175156` y `20260907120000` siguen en el árbol y no están en el diff.

`servi_logistic_sl11` borrada al acabar.

## T14 — Ajustes de la review del 2026-10-22 (backend_dev, vuelta 2)

Archivos:
- `.env.example`: fuera la línea de la cabecera que dejaba a SL-11 el comentario del script de SINPE;
  el párrafo sobre las variables de SINPE ya no nombra el script ni un archivo autorizado (B1, R20).
- `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts`: bloque R20 (`faltasDeEnvExample`), con
  no-vacuidad (existe, no vacío, habla de SINPE) y contraprueba sintética de las dos líneas viejas.
- `tests/integration/db/_fixtures/orden-minima.ts`: `crearFksDeOrden` ya no crea la orden (m1);
  `FksDeOrden` no cambia.
- `docs/limpieza-ordenex.md`: filas de zonas y de seeds en «Hecho (SL-11)»; la de seeds ya no propone
  seed de desarrollo; `seed-maestro.ts` (y `seed-usuarios-qa.ts`) marcados como salidos (m4).

Corridas (base desechable recién creada y migrada, `DEPLOY_EXIT=0`, sin variables de SINPE, sin
`db:seed`):
- Guardias `env-example-sin-valores`, `sinpe-sin-variables-de-entorno` y `fuera-datos-ordenex`:
  3 archivos, 40 tests en verde.
- Mutación R20 en el árbol: reponer la línea de la cabecera → `1 failed | 30 passed`
  (`nombra seed-sinpe-inicial`); reponer la frase del archivo autorizado → `1 failed | 30 passed`.
  Revertidas.
- `vitest run tests/integration/db/zona-`: 8 archivos, 108 tests en verde, 0 saltados.
- Mutación (a), `tiendaId` inexistente: 32 rojos (`zona-central-guarda-y-rastro`,
  `zona-pago-mensajero-rastro`, `zona-reconciliacion-ordenes`).
- Mutación (b), `cantonId` inexistente: 64 rojos (los tres de antes + `zona-guardado-conserva-inactivos`;
  `distrito_canton_id_fkey`). Revertidas: 108 en verde y árbol limpio.
- Conteo final `usuario`/`zona`/`orden` = 0/0/0.
- `pnpm run typecheck` `TC_EXIT=0`; eslint de los dos `.ts` tocados `ESLINT_EXIT=0`.

Veredicto: B1, m1 y m4 resueltos; R20 con guardia y contraprueba. Falta el gate (implementer).

### Vuelta 2: merge de `dev` y gate final (implementer)

- m7: `git merge dev` (trae SL-12) sin conflictos → `56aeb5d`, antes de T14.
- Spec: R20, T14, D6 sin orden en el fixture y trampa de mutación corregida → `7ccc9bf`.
- Sobre la base recién migrada en T14: `pnpm run db:seed` → «Seed de catalogos completado»;
  `migrate status` → «Database schema is up to date!»; conteos
  `[{"usuario":"0","zona":"0","zd":"0","p":"7","c":"84","d":"494"}]`.
- `touch -r node_modules pnpm-lock.yaml` y `./init.sh` (rápido), log `_trabajo/gate-sl11-v2.log`:

```
✖ 234 problems (0 errors, 234 warnings)
 Test Files  286 passed (286)
      Tests  3845 passed (3845)
[test:rapido] 2 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
INIT_EXIT=0
```

- `servi_logistic_sl11` borrada al acabar.

Menores de la review que no son de una línea y quedan anotados para el leader:
- m2 (SL-31): tests que leen `zona.findFirst()` de la base (`conteo-productos.int`, `analitica-financiera-action`,
  `wallet-origen-legible`, `caja-backfill`, `chat-media-*`, `dinero-productos`, `historico-conversaciones`,
  `orden-nota`) pasan a rojo o a verde vacío tras el `migrate reset` de T13; entran en el inventario de SL-31.
- m3 (SL-31): test de conteos 0/0/0 y 7/84/494 sobre base recién migrada en CI.
- m5 (SL-15): «Ordenex» en `_fixtures/caja-459.ts:319,344` y `premio-ranking-devengo-migration.test.ts:97-98`,
  y los comentarios que citan `scripts/seed-zonas.ts` listados en T9.
- m6 (SL-31): elegir entre `orden-minima.ts` y `personas-461.ts` para los 68 tests restantes.
- m8 (SL-31): tres mensajes «tabla `orden` vacia: corre `pnpm run db:seed`» mandan a un script que no crea órdenes.

## Mapa R<n> → test

| Req | Test o corrida |
|---|---|
| R1 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R2 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R3 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R4 | corrida T4/T12: los cinco archivos fuera del árbol; `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` verde tras el commit |
| R5 | corrida T2/T12: conteos 0/0/0 y 7/84/494 sobre la base recién migrada |
| R6 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R7 | corrida T2: `prisma migrate deploy` (exit 0) y `migrate status` limpio sin variables de SINPE |
| R8 | `tests/integration/db/zona-sinpe-migration.test.ts` |
| R9 | `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts` + `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R10 | `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts` |
| R11 | `tests/integration/db/zona-central-guarda-y-rastro.test.ts`, `tests/integration/db/zona-guardado-conserva-inactivos.test.ts`, `tests/integration/db/zona-pago-mensajero-rastro.test.ts`, `tests/integration/db/zona-reconciliacion-ordenes.test.ts`, `tests/integration/db/zona-sinpe-rastro.test.ts`, `tests/integration/db/zona-sinpe-revision.test.ts` (corrida T6 sin usuarios ni siembra) |
| R12 | corrida T6: las dos rutas ausentes de `tests/baseline-rojos.json` y en verde |
| R13 | `tests/integration/db/zona-sinpe-migration.test.ts` |
| R14 | `tests/integration/db/geografia-dta-2026-migration.test.ts` |
| R15 | `tests/unit/scripts/carga-masiva-ejemplos-geo.test.ts` |
| R16 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |
| R17 | corrida T12: `GET /login` 200 y `usuario` vacía |
| R18 | corrida T12: el diff contra `dev`, cruzado con `arnes.manifest` |
| R19 | corrida T12: `INIT_EXIT=0` |
| R20 | `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` |

## Notas del implementer

- La scratchpad de la sesión es compartida con otras sesiones: un primer commit de `tasks.md` tomó el
  mensaje de un `msg.txt` de SL-12. Se enmendó el mensaje antes de seguir (`92940bf`). Los temporales
  de SL-11 viven ya en `scratchpad/sl11/`.
- Un error de `new URL()` en el script que crea la base imprimió una vez la `DATABASE_URL` del `.env`
  principal (Postgres local) en la salida de la herramienta. No llegó a ningún archivo versionado.

## Commits (dev..HEAD, sin push)

```
cbfb276 test(SL-11): T11 guardia fuera-datos-ordenex
4557034 docs(SL-11): T10 README sin usuario maestro ni seeds retirados
d26170f test(SL-11): T9 mensajes de los tests sin los seeds retirados
2e9484c test(SL-11): T6 los zona-* crean sus datos con los fixtures
8e7e357 test(SL-11): T5 fixture compartido orden-minima
e8d1c5f test(SL-11): T8 carga masiva valida la terna contra las migraciones
f25d79d test(SL-11): T7 zona-sinpe-migration y geografia DTA 2026 con zonas propias
92940bf chore(SL-11): T0-T4 marcadas en tasks.md
d1674df feat(SL-11): T4 fuera los seeds y los archivos de Ordenex
62aae15 feat(SL-11): T3 fuera el SINPE inicial y el desatasco P3009
f94dcce feat(SL-11): T2 migraciones sin usuario ni zonas de serie
2090784 Merge branch 'dev' into feature/SL-11-fuera-zonas-y-seeds-ordenex
```
