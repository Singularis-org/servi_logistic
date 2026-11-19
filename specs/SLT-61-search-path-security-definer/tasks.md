# SLT-61 «Endurecer search_path de las funciones SECURITY DEFINER» — tasks

Capa: todo `backend_dev` (`db/`, `scripts/`, `tests/`). Base desechable nueva para los tests de
integración, nunca la de desarrollo; `.env` copiado al worktree antes del primer gate (sin `.env` el
gate sale verde saltando la integración). Nunca `prisma migrate reset`: base nueva + `migrate
deploy` + seed. Nunca imprimir `.env` ni URLs.

## T1 · Guardia estática, primero en rojo (R6, R8)

- [ ] Crear `tests/unit/guards/security-definer-search-path.guardia.test.ts` según
      `design.md > Guardia`: reproduce las migraciones, calcula el estado vigente, falla nombrando
      función, valor y carpeta; comprueba el literal de `scripts/generar-misma-empresa.ts`; casos
      sintéticos de autocomprobación; censo vigente ≥ 40.
- **Hecho cuando:** `pnpm exec vitest run tests/unit/guards/security-definer-search-path.guardia.test.ts`
  sale **rojo** nombrando exactamente `verificar_misma_empresa` (vigente desde
  `20261022130300_misma_empresa_en_fk`), `geografia_del_pais_de_la_empresa` (desde
  `20261026130300_geografia_del_pais_de_la_empresa`) y el literal del generador; los casos
  sintéticos pasan. Rojo copiado en `progress/impl_SLT-61.md`.

## T2 · Test de catálogo y de tabla temporal, en rojo [P con T1] (R1, R5, R7)

- [ ] Crear `tests/integration/db/security-definer-search-path-migration.test.ts` según
      `design.md > Test de catálogo`: consulta acotada a `public` sin funciones de extensión; caso de
      la tabla temporal `organizacion` con conexión propia nueva; caso de control con el
      `search_path` viejo dentro de una transacción revertida.
- **Hecho cuando:** contra la base desechable migrada **sin** la migración de SLT-61, el caso de
  catálogo sale rojo listando las dos funciones con `{search_path=public}`, el caso de la tabla
  temporal sale rojo (el `INSERT` pasa, no hay `SL021`) y el de control sale verde. Anotado en
  `progress/impl_SLT-61.md`.

## T3 · Migración y down (R2) — depende de T1 y T2

- [ ] Crear `db/migrations/20261120120000_security_definer_search_path/migration.sql` y
      `down.sql` como en `design.md > Migración` (dos `ALTER FUNCTION`, sin esquema, en
      `BEGIN`/`COMMIT`). Si al rebasar hay una carpeta posterior a `20261119120000`, usar el
      siguiente timestamp libre.
- [ ] `pnpm exec prisma migrate deploy` sobre la base desechable.
- **Hecho cuando:** T1 y T2 pasan a verde sin tocar los tests; `pnpm exec prisma migrate status`
  limpio en la desechable.

## T4 · Generador (R8) — depende de T1

- [ ] En `scripts/generar-misma-empresa.ts`, `FUNCIONES_SQL`: `SET search_path = public` →
      `SET search_path = public, pg_temp`. Nada más en el archivo.
- **Hecho cuando:** la parte de R8 de la guardia de T1 pasa a verde.

## T5 · Ida y vuelta: cuerpo intacto (R2, R3, R4) — depende de T3

- [ ] Crear `tests/integration/db/migracion-search-path-ida-y-vuelta.test.ts` según
      `design.md > Test de ida y vuelta` (base propia `slt61_`, `PREVIA` calculada, foto con
      `md5(prosrc)` y atributos, exactamente dos cambios y solo en `proconfig`, down y reaplicación).
- **Hecho cuando:** verde; y con una mutación de prueba (añadir a la migración, en local y sin
  commitear, un `CREATE OR REPLACE` de una función cualquiera con un espacio de más en el cuerpo, o
  un `ALTER FUNCTION … SET search_path` sobre una tercera función) el test sale **rojo** nombrando
  esa función. Mutación revertida y anotada en `progress/impl_SLT-61.md`.

## T6 · Test que enumera migraciones — depende de T3

- [ ] Añadir `20261120120000_security_definer_search_path` (o el nombre final de T3) a la lista de
      `tests/integration/db/orden-traspaso-migration.test.ts`, con comentario «SLT-61: solo
      `ALTER FUNCTION … SET search_path`; no toca `orden_traspaso_mensajero`».
- **Hecho cuando:** ese archivo verde.

## T7 · Regla en el perfil [P con T5, T6]

- [ ] `docs/architecture.md > Principios`: punto nuevo «Toda función `SECURITY DEFINER` fija
      `SET search_path = public, pg_temp` (SLT-61); lo vigilan
      `security-definer-search-path.guardia` y su test de catálogo».
- **Hecho cuando:** el punto está y nombra la guardia.

## T8 · Regresión del comportamiento (R9) — depende de T3

- [ ] Correr con la migración aplicada: `tests/integration/db/geografia-dos-paises.test.ts`,
      `tests/integration/db/geografia-por-pais.test.ts`,
      `tests/integration/db/aislamiento-fk-misma-empresa.test.ts`,
      `tests/integration/db/plan-de-la-empresa.test.ts`,
      `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts`.
- [ ] `./init.sh` (rápido; el disparador de `db/migrations/**` corre los `migration`/`migracion`).
- [ ] E2E local (`docs/perfil-agentes.md`: el diff toca `db/`): `grep -rl` en `e2e/` por
      `zona_distrito`, geografía de otro país y misma empresa; correr los que salgan. No toca dinero:
      el grupo `dinero` no es obligatorio.
- **Hecho cuando:** todo verde; mapa `R<n> -> test` completo en `progress/impl_SLT-61.md`.

## T0 · Verificación previa en producción (leader, SOLO LECTURA) — antes de abrir el PR

- [ ] Con `.env.prod` (`DIRECT_URL`, sin imprimirla) y `SET default_transaction_read_only = on` tras
      conectar, las tres comprobaciones de `design.md > Producción (T0)`.
- **Hecho cuando:** en `progress/features/SLT-61.md` constan: las dos funciones existen con
  `{search_path=public}`; no hay otra `SECURITY DEFINER` de `public` sin `search_path=public,
  pg_temp`; los `md5(prosrc)` de las dos coinciden con la desechable. Cualquier diferencia **para**
  el PR y se lleva a Carlos.

## Archivos esperados

- `db/migrations/20261120120000_security_definer_search_path/migration.sql`
- `db/migrations/20261120120000_security_definer_search_path/down.sql`
- `scripts/generar-misma-empresa.ts`
- `docs/architecture.md`
- `tests/unit/guards/security-definer-search-path.guardia.test.ts`
- `tests/integration/db/security-definer-search-path-migration.test.ts`
- `tests/integration/db/migracion-search-path-ida-y-vuelta.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `progress/impl_SLT-61.md`
- `progress/features/SLT-61.md`

## Tamaño

10 archivos (25% de 40). Producción ≈ 30 líneas (migración, down, una línea del generador, un punto
del perfil). Tests ≈ 450 líneas (guardia ≈ 180, catálogo y tabla temporal ≈ 150, ida y vuelta
≈ 110, una línea en la lista de migraciones). Muy por debajo de los topes de 1000 / 3000.
