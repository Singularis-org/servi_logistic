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
