# SL-17 — bitácora de implementación

## T1.1 Spike de medición (design §6.5) — 2026-10-22, backend_dev

**Archivo creado:** `tests/integration/db/aislamiento-mecanismo.test.ts` (8 casos, uno o dos por punto).
Todo en un esquema desechable `sl17_spike_<ts>_<rand>` (tabla `prueba` con RLS + clon `LIKE public.provincia`)
y un rol de cluster `sl17_spike_app` (NOLOGIN NOBYPASSRLS); ambos se sueltan en `afterAll`.
Comprobado tras la corrida: 0 roles `sl17_spike_app` y 0 esquemas `sl17_spike_%` en `sl17_base`.

Base: `sl17_base` (local, desechable, 229 migraciones). Prisma 7.8.0, `@prisma/adapter-pg` 7.8.0.

| § | Resultado | Observación medida |
|---|---|---|
| 1 | PASA | `query.$allOperations` de cliente ve `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe` con `model: undefined`. Los hooks específicos (`query.$queryRaw`…) también los ven. |
| 2 | PASA | `findUnique({ where: { id, activo: false } })` → `null`; `findUniqueOrThrow`, `update`, `delete` → P2025; la fila queda intacta. Con el valor que casa, devuelve/escribe. |
| 3 | PASA | La URL local es superusuario (`rolsuper = true`). Como dueño ve 3 filas (A, A, B); con `set_config('role', …, true)` + empresa A, `current_user = sl17_spike_app` y ve solo `a1, a2`; con rol y sin empresa, 0 filas; la transacción siguiente vuelve a `current_user = dueño`, sin empresa y 3 filas. |
| 4 | PASA | Lote `[$queryRaw pid/txid, set_config, $queryRaw, SELECT]`: mismo `pg_backend_pid()` y mismo `txid_current()` (pool de 2), ve `org-a`, rol bajado, solo filas de A. El `Proxy` sobre el cliente extendido conserva tipos (tsc verde con `tx.provincia`, tupla del lote tipada), `this` (`$queryRaw`, `$executeRawUnsafe`, `provincia.count`) y la interactiva recibe `tx` operativo con empresa fijada; el lote devuelve el resultado sin el primer elemento. |
| 5 | PASA | Pool de 1 (mismo pid en las 3): conexión virgen → `NULL`; fijada con `true` → `"org-a"`; transacción siguiente → `""` (no NULL). Justifica el `NULLIF` de la política. |
| 6 | MEDIDO | `findFirst` sobre `provincia` (clon), 100 reps intercaladas tras 10 de calentamiento: sin envoltura media 0.717 ms / mediana 0.620 ms; con envoltura media 1.999 ms / mediana 1.761 ms; sobrecoste +1.282 ms media / +1.141 ms mediana (≈ ×2,8, local). |

Mutación de control: con la política cambiada a `USING (true)`, caen §3, §4a y §4b (3 rojos de 8). El test no pasa sin RLS efectiva.

### Salidas

```
$ pnpm exec vitest run tests/integration/db/aislamiento-mecanismo.test.ts --silent=false --reporter=verbose
[T1.1 §1a] $allOperations vio: [{"operation":"$queryRaw"},{"operation":"$executeRaw"},{"operation":"$queryRawUnsafe"},{"operation":"$executeRawUnsafe"}]
[T1.1 §1b] hooks especificos vieron: ["$queryRaw","$executeRaw","$queryRawUnsafe","$executeRawUnsafe"]
[T1.1 §3] la URL conecta como superusuario: true
[T1.1 §4a] pid 34768 -> 34768, tx 2433959 -> 2433959
[T1.1 §5] pid 17224/17224/17224; org virgen=null fijada="org-a" siguiente=""
[T1.1 §6] sin envoltura: media 0.717 ms, mediana 0.620 ms | con envoltura: media 1.999 ms, mediana 1.761 ms | sobrecoste: media +1.282 ms, mediana +1.141 ms (n=100)
 Test Files  1 passed (1)
      Tests  8 passed (8)

$ pnpm exec tsc --noEmit -p .        -> exit 0, sin salida
$ pnpm exec eslint tests/integration/db/aislamiento-mecanismo.test.ts  -> ESLint: No issues found
```

**Veredicto T1.1:** los 5 puntos de §6.5 se cumplen en Prisma 7.8 + PrismaPg; §6 no necesita cambios. Sobrecoste de la envoltura ≈ +1,1 ms por operación en local (en Supabase por pooler será mayor: un viaje de red por sentencia; lo mide T4.1).

## T1.4 + T1.5 Contexto, extension y paraCadaEmpresa (pista B) — 2026-10-22, backend_dev

**Creados:** `lib/db/contexto-empresa.ts`, `lib/db/extension-empresa.ts`, `lib/db/excepciones-aislamiento.ts`,
`lib/db/para-cada-empresa.ts`, `lib/auth/empresa-de-la-peticion.ts` (stub de T2.1, devuelve `null`),
`tests/unit/db/extension-empresa.test.ts` (66 casos), `tests/unit/db/para-cada-empresa.test.ts` (3).
**Modificado:** `lib/db/prisma-client.ts` (el singleton es `conAislamientoPorEmpresa(construirCliente(adapter), resolver)`; resolutor por `import()` perezoso; firma, `PRISMA_OMIT`, log y adaptador intactos).

| R | Test |
|---|---|
| R7 | `extension-empresa.test.ts > R7 — lecturas…` (findMany/findFirst/*OrThrow/count/aggregate/groupBy/findUnique*) |
| R8 | `> R8 — escrituras…` (updateMany/updateManyAndReturn/deleteMany/update/delete/upsert) |
| R9 | `> R9 — las creaciones…` (create/createMany/createManyAndReturn/upsert.create) |
| R10 | `> R10 — datos de otra empresa…` (9 formas) y `> SQLSTATE SL017 → EmpresaCruzada` |
| R11 | `> R11 — sin empresa…` (negocio y SQL a mano, sin ejecutar) |
| R14 | `> R14 — el superadmin…` |
| R35 | `> R35 — usuario sin empresa en plataforma` |
| R16 | `para-cada-empresa.test.ts` (N empresas, fallo aislado, 0 empresas) |

**Mutaciones** (cada una restaurada; despues 66/66 verde): sin filtro `where` → 20 rojos; sin inyectar
`organizacionId` en creaciones → 5 rojos; sin envoltura fuera de transaccion → 8 rojos; lote sin `set_config` → 1 rojo.

**Desviaciones:** (1) con escrituras de relacion en `data` (forma «checked») no se inyecta la columna: la pone el
`DEFAULT` de M2 desde el `set_config`; el DMMF de Prisma 7 en ejecucion no trae `relationFromFields`, asi que no se
puede saber si la forma admite el escalar. (2) `conEmpresa`/`comoPlataforma` esperan `fn()` dentro del contexto: las
`PrismaPromise` son perezosas y su `then` lo haria el llamador fuera. (3) Una operacion de negocio sin regla (operacion
nueva de Prisma) lanza en vez de pasar sin filtro.

```
$ pnpm exec vitest run tests/unit/db/extension-empresa.test.ts tests/unit/db/para-cada-empresa.test.ts
      Tests  69 passed (69)
$ pnpm exec vitest run tests/unit/guards/prisma-client-sin-adaptador.guardia.test.ts tests/unit/db/prisma-omit-busqueda-texto.test.ts
 Test Files  2 passed (2)   Tests  8 passed (8)
$ pnpm exec tsc --noEmit -p .   -> sin salida (exit 0)
$ pnpm exec eslint <los 8 archivos>   -> ESLint: No issues found
```

**Veredicto T1.4/T1.5:** extension, contexto y `paraCadaEmpresa` en verde con dobles; la prueba contra Postgres es T3.1.

## T1.2 + T1.3 (pista A) — clasificación, M1 y M2 — 2026-10-22, backend_dev

**Archivos**
- Nuevo: `lib/db/modelos-de-negocio.ts` (73 negocio + 14 plataforma + 1 diferido; cuadra 1:1 con los 88 modelos y sus `@@map`).
- Nuevo: `db/migrations/20261022130000_organizacion_y_rol_app/{migration.sql,down.sql}` (M1).
- Nuevo: `db/migrations/20261022130100_organizacion_id_en_negocio/{migration.sql,down.sql}` (M2, generado con un script de un solo uso fuera del repo).
- `db/schema.prisma`: `model Organizacion` + 73 relaciones inversas; en los 73 modelos `organizacionId` (`String?` en `Usuario`), relación `onDelete: Restrict, onUpdate: Cascade` y `@@index([organizacionId])`. `email`/`cedula` siguen `@unique` globales (R36).
- Guardias ajustadas (la clasificación nombra tablas sin acceder a ellas; `organizacion_id` es columna técnica): `tests/unit/guards/pagos-frontera.guardia.test.ts`, `tests/unit/guards/premio-ranking-alcance.guardia.test.ts`, `tests/integration/db/analytics-daily-guards.test.ts`, `tests/unit/guards/asistente-sin-persistencia.guardia.test.ts`, `tests/unit/analytics/analytics-daily-contrato.test.ts`.

**RLS activada.** Medido sobre las 228 migraciones previas: de plataforma/diferidas solo `"Session"` no tenía RLS → M1 la activa y su down la desactiva. Las 73 de negocio ya la tenían → M2 no activa ninguna nueva y su down no desactiva nada.

**Desviaciones del design (medidas)**
1. `@default(dbgenerated())` VACÍO en vez de con la expresión: Prisma 7 no introspecta el DEFAULT `NULLIF(current_setting(...))`, y con la expresión `migrate diff --from-config-datasource` propone 73 `SET DEFAULT` fantasma. Vacío → diff vacío. Mismo patrón que `Orden.busquedaTexto`/`claveRemision`. El DEFAULT real vive en el SQL de M2.
2. M2 borra las 3 filas sembradas de `premio_ranking` (de `20260716130000_premio_ranking`, sin empresa, monto/descripción NULL); sin eso, `migrate deploy` en una base nueva falla por NOT NULL. Su down las vuelve a sembrar. **Hueco funcional abierto:** `PremioRankingRepository.upsertPremio` solo hace `update`; una empresa nueva no tiene sus 3 filas y `UNIQUE(posicion)` es global → lo resuelven el alta de empresa (§7.7) y SL-18.
3. M1 añade `REVOKE ALL ON "_prisma_migrations" FROM servi_app` (no tiene RLS; una empresa no debe leerla).
4. M1 y M2 van en `BEGIN/COMMIT` (todo o nada).

**Ida y vuelta** (snapshot de `pg_policies`, `pg_roles`, `pg_auth_members`, `information_schema.tables/columns`, `relrowsecurity`, constraints, índices, grants, `pg_default_acl`, ACL normalizada con `acldefault`, filas de `premio_ranking`), sobre un clon de `sl17_base`:
M1 ida-y-vuelta IGUAL · M1 reaplicada IGUAL · M2 ida-y-vuelta IGUAL a solo M1 · M2+M1 abajo IGUAL a la previa. Única diferencia cruda: el ACL de tablas/secuencias pasa de NULL a explícito del dueño (equivalente; por eso se normaliza). Reaplicar M2 tras su down cambia solo `ordinal_position` de `organizacion_id` (attnum nuevo, propio de Postgres).

**Base recién migrada (230 migraciones con `migrate deploy`)**
- `migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → `-- This is an empty migration.` (antes de SL-17, sobre `sl17_base`: también vacío).
- `organizacion`: 0 filas (R32).
- INSERT en `orden` sin empresa, como dueño: `ERROR: el valor nulo en la columna «organizacion_id» de la relación «orden» viola la restricción "not-null"`. Como `servi_app` sin empresa: `el nuevo registro viola la política de seguridad de registros para la tabla «orden»` (la RLS salta antes que el NOT NULL; falla cerrado igual, R19).
- Como `servi_app` con empresa: `provincia` 7 y `rol` 6 legibles; `UPDATE vehiculos`, `DELETE provincia`, `INSERT organizacion` y leer `_prisma_migrations` → `permiso denegado` (R40). Dos empresas en `premio_ranking`: con A ve solo A, sin empresa 0, insertar con `organizacion_id` = B estando en A → violación de política (R17).

**Mapa R → test.** Las pruebas de arriba son manuales (psql); los tests ejecutables los escriben T2.5 (guardias de clasificación/RLS, R2–R5, R17, R24) y T3.5/`migracion-sl17-ida-y-vuelta.test.ts` (R6, R19, R22, R32, R40).

**Salidas**
```
$ pnpm exec tsc --noEmit -p .             -> exit 0, sin salida (tras pnpm run db:generate)
$ pnpm exec eslint lib/db/modelos-de-negocio.ts <4 tests tocados>   -> ESLint: No issues found
$ pnpm exec vitest run <68 tests que leen schema/migraciones>       -> 68 files, 917 tests passed
$ pnpm run test:guardias  -> 290 passed, 2 failed: dependencias-declaradas-presentes (marcador de init.sh) y
                             test-citado-desaparecido (excepciones temporales); ninguno lee schema, migraciones ni lib/db
```

**Veredicto T1.2/T1.3:** M1 y M2 aplican, revierten sin residuo y no dejan drift; queda abierto el podio de `premio_ranking` por empresa.

## Cierre de la tanda 1 — implementer

Bases: solo Postgres local, bases desechables `sl17_*` (`CREATE DATABASE` + `prisma migrate deploy`).
La base `servi-logistic` no se tocó.

**Gate 1 (sin commit), log fuera del repo, base `sl17_gate` recién migrada (230 migraciones):**
`TEST_RAPIDO_BASE=dev ./init.sh` → typecheck y lint verdes; `test:rapido` → `INIT_EXIT=1`.
- `Test Files  3 failed | 290 passed (293)`, `Tests  20 failed | 3992 passed | 1 skipped (4013)`.
- Rojos nuevos:
  - `tests/integration/db/zona-central-guarda-y-rastro.test.ts` (17) y
    `tests/integration/db/zona-guardado-conserva-inactivos.test.ts` (2): `prisma.zona.create()` →
    «Null constraint violation» en `organizacion_id`. Es el rojo previsto del cierre de la tanda 1
    (insertan en una tabla de negocio sin empresa). Lo arregla T2.6 (`enTransaccionRevertida` con
    empresa por defecto). No se silencia.
  - `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` (1): dos excepciones temporales de
    `specs/461-…` cuyo borrado «ya no está en la historia de git». Depende de la historia (el repo
    se aplanó en `86d70bf`), no de este diff, y no está en `tests/baseline-rojos.json`. Ajeno a SL-17:
    se avisa al leader.
- El modo rápido dijo «el diff vs dev no toca código con tests» porque el diff no estaba commiteado.
  Se repite el gate sobre el commit.

**Decisiones técnicas (no del humano) tomadas en la tanda 1:**
- `@default(dbgenerated())` vacío en el esquema (pista A, desviación 1): Prisma 7 no introspecta la
  expresión y escribirla daba drift perpetuo. El DEFAULT real vive en M2. Drift medido: vacío.
- M2 borra las 3 filas sembradas de `premio_ranking` (sin empresa) y su `down.sql` las resiembra.
  **Hueco abierto para el leader:** `UNIQUE(posicion)` global en `premio_ranking` y
  `upsertPremio` solo hace `update`, así que una empresa nueva no tiene podio y una segunda no podría
  sembrarlo. Va con SL-18 (únicos por empresa) o con el alta de empresa; no se tocó código.
- T2.7: el DMMF de Prisma 7 en ejecución no trae `relationFromFields` (0 de 88 modelos, medido por la
  pista B). `lib/db/fk-de-negocio.ts` leerá las FK parseando `db/schema.prisma` en vez de
  `Prisma.dmmf` (sin dependencia nueva; `@prisma/internals` lo sería).
- Riesgo anotado (pista B): dentro de una `$transaction` interactiva, usar el cliente global en vez
  de `tx` va filtrado por la extensión pero sin envoltura, como dueño; el SQL a mano ahí no tiene RLS.
  Deuda para T4.4.
- `node_modules` es un enlace compartido: `db:generate` regenera el cliente de los demás worktrees
  (SL-31, SL-32). Es el procedimiento normal del gate, pero un gate ajeno en paralelo puede ver
  nuestro cliente durante unos segundos.
