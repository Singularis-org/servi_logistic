# Review SLT-212 «Rojos en dev: demo-qa (pago a la plataforma) y escenario 459 (gestión que no vuelve en el cierre)»

PR #243 · rama `feature/SLT-212-rojos-dev-demo-459` · HEAD revisado `d474bacf` · diff `origin/dev...HEAD` (base `ab489908`).
Ruta declarada: directa; revisión completa a petición del leader (la migración cambia funciones del cobro de la plataforma).
Todo lo de abajo se corrió en bases desechables locales (`servi_slt212_desechable` = a, `servi_slt212b_desechable` = b,
`servi_slt212c_desechable` = c y una nueva `servi_slt212r_desechable` = r), 2026-11-19 entre las 02:30 y las 03:00 hora de
Bogotá, es decir, DENTRO de la ventana roja de A (01:00–06:00 Bogotá). Postgres local: `TimeZone = America/Bogota`.

## Checklist

| # | Punto | Resultado |
|---|---|---|
| 1a | Migración `20261119120000_cobro_plataforma_ocurrido_utc`: las 3 funciones son byte a byte las de `20261104150200` salvo el reloj | OK. Extraídas con awk y comparadas con `diff`: las únicas diferencias son los 4 `now()` → `(now() AT TIME ZONE 'UTC')` (conciliar ×2, al_crear ×1, al_cambiar_borrado ×1) y `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION` en `cobro_plataforma_porcentual_conciliar` (obligado: el original la creaba). Sin CR. Ninguna migración posterior a `20261104150200` redefine esas funciones (grep en `db/migrations`). |
| 1b | `down.sql` restaura lo anterior | OK. Idéntico a las 3 definiciones de `20261104150200` (mismo `diff`, solo el `CREATE OR REPLACE`). Aplicado a mano en la base a: `al_crear` vuelve a `now()` a secas. |
| 1c | En una base UTC el valor escrito es el mismo | OK. `SET LOCAL TimeZone='UTC'` + `INSERT` en `timestamp(3)` de `now()` y `now() AT TIME ZONE 'UTC'` → iguales (`true`). |
| 1d | `CREATE OR REPLACE` conserva permisos y atributos | OK. En a y r: `SECURITY DEFINER`, `search_path=public, pg_temp`, sin `EXECUTE` a `PUBLIC` (el `REVOKE` de `20261104150200` sobrevive). |
| 1e | Mismo timestamp que `20261119120000_historial_accion_ordenes_retiradas_a_central` (ya en dev) | Sin riesgo técnico, medido. Prisma ordena por nombre completo: `…_cobro_…` < `…_historial_…`. `_prisma_migrations` guarda el nombre completo: no hay unicidad por timestamp (precedente: el par `20261117120000_*`). Simulación del caso real (Preview/prod tienen ya `historial` y reciben `cobro` después): base r creada con `historial` y sin `cobro`, luego `prisma migrate deploy` con `cobro` → «All migrations have been successfully applied», `migrate status` → «up to date». `scripts/migrate-deploy.ts` no añade guardas de orden. Las dos migraciones no se tocan (enum vs funciones). Renombrar no hace falta (ver menor m1). |
| 2 | Otras columnas `timestamp` sin zona escritas con `now()` en funciones o triggers | Ninguna. `pg_proc` del esquema `public` (base a, con la migración): solo 6 funciones usan reloj (`now()`, `current_timestamp`, `localtimestamp`, `clock_timestamp`, `current_date`, `transaction_timestamp`, `statement_timestamp`) y TODAS usan ya `AT TIME ZONE 'UTC'`: las 3 de esta ficha, `fulfillment_al_cambiar_borrado`, `plan_de_la_empresa`, `factura_plataforma_en_curso`. Lo que queda del mismo defecto son los `DEFAULT CURRENT_TIMESTAMP` de columnas sin zona (ver menor m2, para otra ficha). |
| 3 | El test nuevo da rojo con el `down.sql` y verde con la migración | OK, repetido en la base a: con migración 2/2 verde; `down.sql` aplicado → 2/2 rojo (`expected [ 50400, +0, 50400 ] to deeply equal [ +0, +0, +0 ]` y `expected [ 50400, 50400 ] …`); reaplicada → 2/2 verde. Cada uno de los 4 `INSERT` con reloj cae en una posición distinta con 50400 s: los cuatro están cubiertos. El reverso de la orden fija usa el `deleted_at` de la app (0 en ambos casos): no es vacuo, es el control. |
| 3b | `demo-qa.test.ts` (el síntoma A) | Dentro de la ventana roja: con `down.sql` → `12 failed | 2 passed`, `validation_error (monto)` en `registrarEgreso(pago_plataforma)` (reproduce); con la migración → verde (junto con `orden-traspaso-migration`, 29/29). |
| 4 | Fixture 459 (`comoApp`): no debilita libro-caja/wallet | OK. Solo envuelve `solicitarCierre` + `aprobarCierre` en `servi_app` con la empresa ya fijada en la tx (falla explícita si no la hay) y vuelve al dueño con `SET LOCAL ROLE NONE`. Es más estricto (RLS activa, como en producción); no cambia ninguna aserción ni dato sembrado. Mutación en la base b (con una central ajena commiteada): con el arreglo `libro-caja-revision-458e` + `como-quedo` 14/14 verde; con el fixture de origin/dev 8 rojos con «Esta gestión no pertenece a lo que vuelve en este cierre». Los 38 archivos que usan `caja-459`/`libro-468`/`wallet-458`: 37 verdes en la base a; el rojo (`caja-invariante-tiendas`, 3 casos) es residuo de la base a: también rojo con el fixture de origin/dev en a, y 8/8 verde en la base c con el arreglo. |
| 5 | Lista de migraciones en `orden-traspaso-migration.test.ts` | Correcta en HEAD (verde en a), pero CHOCA con dev: origin/dev añadió `20261119120000_historial_accion_ordenes_retiradas_a_central` en la misma línea → conflicto de merge (B1). |
| — | Typecheck (`tsc --noEmit`) | OK, exit 0. |
| — | Lint de los 3 archivos de test | OK, exit 0. |
| — | Tamaño del PR (`tamano-pr.mjs`) | OK: 5/40 archivos, 235/1000 líneas de producción, 133/3000 de tests. |
| — | Migración con `down.sql`; sin tabla nueva (RLS/`organizacion_id` no aplica); sin literales de país/moneda; sin Ordenex; sin dependencias | OK. |
| — | Trazabilidad (ruta directa: test que reproduce el fallo) y mapa en la bitácora | OK: `cobro-plataforma-ocurrido-utc.test.ts` (A) y los usuarios de `caja-459` (B), ambos reproducidos rojos antes del arreglo. |
| — | Comentarios explican el porqué | OK. |
| — | Suelo de la ruta (`CHECKPOINTS.md > Ruta`, `docs/specs.md > Tres rutas`) | FALLA (B3). |
| — | E2E afectados corridos en local (`docs/perfil-agentes.md > reviewer`, punto 6) | FALLA (B2). |
| — | `gate-completo` en verde en el PR | No ha corrido: el PR está `CONFLICTING` / `DIRTY` (B1). |
| — | `progress/features/SLT-212.md > Cierre` | Pendiente (normal en esta fase). |

## Hallazgos

### B1 — BLOQUEANTE: el PR no se puede mergear (conflicto con dev)
`gh pr view 243`: `mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`; `git merge-tree HEAD origin/dev` → conflicto en
`tests/integration/db/orden-traspaso-migration.test.ts`. El check `gate-completo` no ha corrido. Falta: merge de `origin/dev`
en la rama y resolver la lista con LAS DOS, en este orden (el de `readdirSync().sort()`):
`"20261117120000_plan_borrador", "20261119120000_cobro_plataforma_ocurrido_utc", "20261119120000_historial_accion_ordenes_retiradas_a_central"`.
Ningún otro archivo de dev necesita la migración nueva (las listas de `historial-accion-*-migration` y
`correccion-resultado-gestion-migration` son de valores de enum, no de migraciones). Después, `gate-completo` en verde.

### B2 — BLOQUEANTE: sin constancia de los E2E afectados corridos en local
`docs/perfil-agentes.md > reviewer` (6) y `> Todos los agentes`: un PR que toca `db/` y dinero corre en local los E2E que lo
cubren más el grupo `dinero` entero, en base desechable nueva. `progress/impl_SLT-212.md` no menciona ninguno. Afectados
(`grep` en `e2e/` por cobro/pago/factura de la plataforma): `e2e/cobro-plataforma-sl40.spec.ts`, `e2e/facturas-plataforma.spec.ts`,
`e2e/pago-plataforma-confirmacion.spec.ts`, `e2e/pago-plataforma-sl45.spec.ts`, y `pnpm exec playwright test --project=dinero`.
Ojo: el Postgres local está en `America/Bogota`, así que en local estos E2E SÍ ejercitan el cambio. Falta: correrlos y pegar la
salida en la bitácora.

### B3 — BLOQUEANTE: la ruta directa está por debajo del suelo
- El diff toca `db/migrations/` (`arnes.config.json > rutas.completa_si_toca`, por defecto migraciones) y funciones del cobro de la
  plataforma (dinero). `docs/specs.md > Tres rutas`: «Va siempre por la completa»; «Bajar por debajo del suelo, nunca». La
  revisión completa que pidió el leader no sustituye la ruta: la ruta completa exige además `specs/<feature>/{requirements,design,tasks}.md`.
- La ruta directa exige `complexity: low`: `progress/features/SLT-212.md > Evaluación` dice `low`, pero `feature_list.json` (raíz)
  dice `medium`. Incoherencia que hay que resolver en el tracker.
- El gate no lo detectó porque el worktree no tiene `feature_list.json` (no versionado): `scripts/validate-features.mjs § 7` no
  encuentra la ficha de la rama y se salta el suelo. El `INIT_EXIT=0` de la bitácora no cubre este punto.
Falta: que el leader suba la ficha a `ruta:completa` en el tracker (o lo decida el humano por escrito, `docs/specs.md`: subir
siempre se puede) y deje el spec que esa ruta exige. No lo puede rebajar el reviewer.

### m1 — menor: timestamp compartido con `historial_accion_ordenes_retiradas_a_central`
Medido: sin riesgo (ver 1e). No propongo renombrar. Si se quiere que el nombre refleje el orden real de despliegue en Preview/prod
(donde `historial` ya va delante), `20261119120100_cobro_plataforma_ocurrido_utc` lo haría sin coste: aún no está aplicada en
ninguna base compartida. Si se renombra, cambiar también la lista de `orden-traspaso-migration`, el test nuevo (comentario
línea 21) y la bitácora.

### m2 — menor (para otra ficha): `DEFAULT CURRENT_TIMESTAMP` en columnas `timestamp` sin zona
`information_schema.columns` (base a): ~129 columnas `timestamp without time zone` con `DEFAULT CURRENT_TIMESTAMP` (lo que genera
Prisma para `@default(now())`). Toman el valor con la TimeZone de la sesión cuando el `INSERT` no da la columna, igual que el
defecto de esta ficha. En prod/CI/Supabase (UTC) no se nota; en una base local en Bogotá, sí. Las más cercanas al dinero, que
además se insertan desde triggers SQL sin valor explícito o desde la app: `cobro_plataforma_movimiento.created_at`,
`cobro_plataforma_traza.created_at`, `cobro_plataforma_porcentual_orden.created_at`, `orden_fulfillment_movimiento.created_at`,
`factura_plataforma.created_at`, `wallet_movimiento.fecha_movimiento`, `wallet_tienda_movimiento.fecha_movimiento`,
`pago_mensajero_movimiento.fecha_movimiento`, `carga.fecha_carga`, `cierre_dia.solicitado_at`, `cierre_bodega.solicitado_at`,
`tarifa_activacion.activada_at`, `jobs.run_after`. Cuáles se escriben de verdad por el default (y no con valor de la app) está
sin medir. Ninguna FUNCIÓN ni trigger del esquema escribe ya `now()` sin `AT TIME ZONE 'UTC'`.

### m3 — menor: bitácora
- Mutación del fixture 459: la bitácora dice `14 failed (14)`; en mi corrida en la base b salieron 8 rojos de 14. Depende de qué
  central devuelve `findFirst`; el veredicto (rojo sin el arreglo) se mantiene.
- Dejar anotado en «Abierto» que la base a quedó con restos (rojo de `caja-invariante-tiendas` también sin el cambio).

## Bases desechables que dejé
`servi_slt212r_desechable` (creada para la simulación de orden; tiene `historial_accion_ordenes_retiradas_a_central` aplicada).
En la base a apliqué `down.sql` y luego `migration.sql`: queda como estaba (con la migración). El worktree quedó limpio
(`git status` sin cambios tras restaurar el fixture con `git checkout HEAD --`).

## Veredicto

**RECHAZADO.** El contenido técnico está bien y verificado (migración idéntica salvo el reloj, `down.sql` fiel, mismo valor en UTC,
test que muerde con el `down.sql`, fixture más estricto sin debilitar nada, sin riesgo por el timestamp compartido). Faltan:
B1 resolver el conflicto con dev y tener `gate-completo` verde; B2 los E2E de cobro/factura/pago de la plataforma y el grupo
`dinero` en local, con su salida en la bitácora; B3 subir la ruta (migración + dinero) con la decisión del humano y el spec que
pida esa ruta.

## Vuelta 2 (acotada a cb87c369..bb4310c5)

Revisado el 2026-11-19 sobre `bb4310c5` (= `origin/feature/SLT-212-rojos-dev-demo-459` = head del PR #243). Ruta COMPLETA, spec
aprobado por Carlos el 2026-11-19 (según el leader). Base desechable: `servi_slt212r_desechable` (`migrate deploy` + `db:seed`).

### Hallazgos de la vuelta 1

| Hallazgo | Estado | Evidencia |
|---|---|---|
| B1 conflicto con dev | **Resuelto** | `merge-base HEAD origin/dev` = `c760bf8c` = `origin/dev`; `git merge-tree --write-tree HEAD origin/dev` sin conflicto; `gh pr view 243`: `MERGEABLE` / `CLEAN`, `gate-completo` SUCCESS y los E2E de CI (`aislamiento`, `reparto`, `dinero`, `e2e`) SUCCESS sobre `bb4310c5`. Lista de `orden-traspaso-migration` con `…120000_historial…` y luego `…120100_cobro…` (orden de `readdirSync().sort()`). |
| B2 E2E en local | **Resuelto** | `progress/impl_SLT-212.md > Tanda 2 > B2`: los 4 specs de cobro/factura/pago de la plataforma `16 passed` (`--no-deps`; el rojo con dependencias es `superadmin-empresas:215`, aviso de bienvenida sin `NEXT_PUBLIC_APP_URL`, ajeno) y `--project=dinero` 125 + 1 re-corrido verde (caída del worker en Windows, no aserción), en base nueva con todas las migraciones y Postgres en America/Bogota. El build es de `d474bacf` (antes del merge) porque el cliente Prisma compartido no tenía el enum de SLT-211; la diferencia con `bb4310c5` son las funciones idénticas y el enum de dev, y el E2E de CI sobre `bb4310c5` está verde. Aceptado. |
| B3 ruta | **Resuelto** | `specs/SLT-212-rojos-dev-demo-459/{requirements,design,tasks}.md` presentes; requirements en EARS (R1–R6) con tabla de trazabilidad; design con `## Lo que ya existe` no vacía (y el diff no re-crea nada de esa lista) y alternativas descartadas. `feature_list.json`: `ruta: completa`, `complexity: medium`; `progress/features/SLT-212.md` coherente. |
| m1 hora de migración | **Resuelto** | `20261119120100_cobro_plataforma_ocurrido_utc`; las tres últimas de `origin/dev` son `20261117120000_*` y `20261119120000_historial_accion_ordenes_retiradas_a_central`: la nueva va después de todas. |

### Checklist

- [x] 1. Trazabilidad R1–R6 con test real y mutación (abajo).
- [~] 2. Tasks: T1–T7 `[x]`; T8 (aprobación de Carlos + `gate-completo`) abierta: es la puerta humana posterior a esta review (menor m4).
- [x] 2b. Tamaño: `node scripts/tamano-pr.mjs` → `5/40 archivos, 235/1000 líneas de producción, 133/3000 de tests`.
- [x] 3. Checkpoints (`CHECKPOINTS.md`, `docs/checkpoints-proyecto.md`): sin tabla nueva (RLS/`organizacion_id` no aplican), migración con `down.sql` y sin editar una aplicada, sin literales de país/moneda ni Ordenex, sin dependencias nuevas, comentarios de porqué.
- [x] 4. Verificación ejecutable (abajo) e `./init.sh`.
- [x] 5. Reglas de `docs/perfil-agentes.md > reviewer`: `down.sql` presente; E2E afectados en local con constancia (B2).

### Migración `20261119120100_cobro_plataforma_ocurrido_utc`, función a función

Única migración anterior que define las tres funciones por última vez: `20261104150200_cobro_plataforma_porcentual_funciones`
(`grep` en `db/migrations`: ninguna posterior las redefine). Comparación textual de cada bloque `CREATE … END $$;` (script de diff
línea a línea, normalizando solo `CREATE OR REPLACE` → `CREATE`):

| Función | Líneas antes/después/down | Diferencias en `migration.sql` | `down.sql` == origen |
|---|---|---|---|
| `cobro_plataforma_porcentual_conciliar` | 41/41/41 | 2 líneas, solo `now()` → `(now() AT TIME ZONE 'UTC')` (cargo y `COALESCE(deleted_at, …)` del reverso) | idéntico |
| `cobro_plataforma_al_crear_orden` | 30/30/30 | 1 línea, solo el reloj del `INSERT` del cargo | idéntico |
| `cobro_plataforma_al_cambiar_borrado` | 31/31/31 | 1 línea, solo el reloj del re-cobro | idéntico |

`migration.sql` solo contiene `BEGIN`, tres `CREATE OR REPLACE FUNCTION` y `COMMIT` (ni `DROP`, ni `REVOKE`/`GRANT`, ni DML).
Firmas, `SECURITY DEFINER`, `search_path`, importes, fuentes, secuencias y condiciones: literales. `CREATE OR REPLACE` conserva dueño y ACL.

### Trazabilidad con mutación (base `servi_slt212r_desechable`)

| R | Test | Verde con el cambio | Mutación | Resultado mutado |
|---|---|---|---|---|
| R1 | `cobro-plataforma-ocurrido-utc.test.ts` | `2 passed (2)` | `down.sql` aplicado (`prisma db execute`) | `2 failed (2)`: `expected [50400, 0, 50400]` y `[50400, 50400]` (14 h exactas) |
| R1 | ídem | — | cada uno de los 4 `AT TIME ZONE 'UTC'` devuelto a `now()` por separado (líneas 51, 56, 81, 118) | **los 4 mutantes en rojo** (`1 failed / 1 passed` cada uno); restaurada la migración → `2 passed` |
| R2 | ídem (control de tipos y secuencias) + `cobro-plataforma-cargos`, `cobro-plataforma-porcentual` | verdes | — (el diff textual prueba que importe/fuente/secuencia no cambian) | — |
| R3 | ídem (desfase 0 contra `now() AT TIME ZONE 'UTC'`; en sesión UTC `now()::timestamp` es el mismo valor) | verde | — | — |
| R4 | `demo-qa.test.ts` | `14 passed (14)` (tras `db:seed`; 07:13 Bogotá, fuera de la ventana 00–05: la prueba determinista del defecto es la de R1) | — | — |
| R5 | `libro-caja-revision-458e.test.ts` + `como-quedo.test.ts` con una empresa ajena con zona central **commiteada** | `14 passed (14)` | fixture de `origin/dev` (sin `comoApp`), restaurado con `git checkout --` (árbol limpio después) | `14 failed (14)`, 2 × «no pertenece a lo que vuelve en este cierre» |
| R6 | los usuarios de `_fixtures/caja-459.ts` | `vitest` de CI (3 shards) verde en `bb4310c5` | — | el diff del fixture no toca aserciones ni datos sembrados (solo `comoApp` + `SET LOCAL ROLE NONE`) |

La central ajena se borró después de la mutación de R5.

### Hallazgos nuevos

- **m4 — menor:** `tasks.md` T8 sigue `[ ]`. Es la aprobación humana del código y el `gate-completo` (ya verde); se marca cuando
  Carlos apruebe, no la puede cerrar el implementer.
- **m5 — menor:** el E2E local se corrió con el build de `d474bacf` (pre-merge). Compensado por el E2E de CI verde sobre `bb4310c5`;
  el cliente Prisma compartido sigue sin el enum de SLT-211 hasta que el leader lo regenere.
- **m6 — menor (no del diff):** la primera corrida de `./init.sh` (base `servi_slt212r_desechable`) salió `INIT_EXIT=1` con 3
  archivos por **timeout** (120 s) en la tanda 7: `cierre-sin-gestion-confirmacion-migration` (`afterAll` y R40, el `down.sql`
  real con `ALTER TABLE`), `cierres-gestiones-modelo-nuevo-descarga-sql-real` (8) y `estado-cuenta-concurrencia-458` (candado
  advisory). Ninguno usa `caja-459` ni el cobro de la plataforma; los tres juntos y solos → `23 passed (23)`; la segunda corrida
  completa → verde. Espera de candados bajo carga, no un rojo de esta ficha. Si se repite en otras ramas, pedir ficha propia.

### Verificación ejecutable

- `./init.sh` (rápido) contra `servi_slt212r_desechable`, con `INIT_EXIT=$?` escrito dentro del log: 1ª corrida `INIT_EXIT=1`
  (m6, timeouts ajenos); 2ª corrida **`INIT_EXIT=0`**: typecheck ✓, lint ✓, cliente de Prisma ✓, tamaño ✓, `test:rapido` en 7
  tandas todas verdes (`100 passed (100)` × 6 y `66 passed (66)`; la mayor `1790 passed`).
- Lote del diff (`cobro-plataforma-ocurrido-utc`, `demo-qa`, `libro-caja-revision-458e`, `como-quedo`, `orden-traspaso-migration`,
  `cobro-plataforma-cargos`, `cobro-plataforma-porcentual`): verdes (demo-qa tras `db:seed`).
- PR #243 en GitHub: head `bb4310c5`, `MERGEABLE`/`CLEAN`, `gate-completo` y E2E de CI en SUCCESS.

### Veredicto vuelta 2

**OK.** B1, B2, B3 y m1 resueltos. Migración: solo `CREATE OR REPLACE` de las tres funciones, idénticas a `20261104150200` salvo los
cuatro relojes; `down.sql` idéntico al origen; hora posterior a todas las de `origin/dev`. R1–R6 trazados a tests que muerden
(los 4 relojes, uno a uno, y el fixture sin `comoApp` con central ajena commiteada). Menores m4–m6 sin bloqueo. Queda la puerta
humana: aprobación de Carlos del cambio en funciones de cobro (T8) antes del aviso «listo para mergear».
