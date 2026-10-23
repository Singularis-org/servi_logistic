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

**Gate 2 de la tanda 1, sobre `09b56e3`** (log fuera del repo, base `sl17_gate`): `INIT_EXIT=1`.
`Test Files  85 failed | 741 passed (826)`, `Tests  404 failed | 10790 passed | 56 skipped (11250)`.
Los 85 son todos de integración e insertan en tablas de negocio sin empresa: es el rojo previsto.
Los arreglan T2.6 y la ronda de reconciliación. Unitarios y guardias, verdes.

## Tanda 2 — implementer (consolidado de los informes de los subagentes)

Nueve subagentes en paralelo, con archivos disjuntos. Ninguno hizo commit ni dejó bases `sl17_*`.

### T2.1 Sesión y login (R12, R14, R15)
- `lib/auth/empresa-de-la-peticion.ts`: cookie → sesión → `usuario.organizacion_id`, en
  `comoPlataforma("SL-17", "resolver la empresa de la sesión")`, con un memo de 60 s por sesión. No
  lee cabeceras ni acepta argumentos. `resolve-actor.ts` y `session-guard.ts` van en «validar sesión»;
  `lib/actions/auth.ts` y `password-reset.ts`, en «login».
- **Desviación:** `Actor.organizacionId?: string | null` es **opcional** (el design dice `string | null`),
  igual que `zonaId`, para no tocar ~380 literales `Actor` de los tests. `resolveActorFromSession`
  lo puebla siempre.
- `app/login/page.tsx` y `app/recuperar-contrasena/page.tsx` no se tocaron: solo leen `Session`
  (plataforma), no `usuario`. Salen de `EXCEPCIONES_DE_PLATAFORMA`.
- `restablecer` (recuperar contraseña) escribe `usuario.password_hash` de la propia fila en contexto de
  plataforma.
- Tests: `tests/unit/auth/empresa-de-la-peticion.test.ts` 15/15, y 12 archivos existentes (156 tests)
  en verde. Seis mutaciones, todas con rojo.

### T2.2 API key, rastreo, postulaciones y WhatsApp (R13, R41)
- `buildAutenticar` corre en plataforma y devuelve `organizacionId`; una key sin empresa da 401. Las 9
  rutas de `app/api/ordenes/api-key/` corren su cuerpo en `conEmpresaDeLaKey(auth, …)`, explícito.
  `carga` y `cotizacion` tenían un `buildAutenticar` duplicado que se saltaba la empresa; ahora usan el común.
- Rastreo: una lectura en plataforma de `orden.organizacion_id` por `num_guia`; el resto, en `conEmpresa`.
- Postulaciones: sin contexto de empresa explícito devuelven el mensaje neutro que ya existía, antes de
  cualquier efecto (limitador, storage o escrituras).
- Webhook de WhatsApp: `repartirPorEmpresa` corre en `comoPlataforma("SL-36", …)` y cada lote escribe
  en su `conEmpresa`. Lo que no tiene empresa no escribe, y la respuesta sigue siendo 200.
- **Desviación:** `app/paquete/[numGuia]/page.tsx` queda sin cambios. Exige sesión y su empresa sale
  de la cookie; envolverla con la empresa de la guía sería una fuga, porque gana el contexto explícito.
- Tests: `tests/unit/api/api-key-empresa.test.ts` (19) y `tests/unit/actions/postulacion-sin-empresa.test.ts`
  (7), 26/26; 80 archivos existentes (1152 tests) en verde. Cuatro mutaciones, todas con rojo.
- Deuda:
  - lecturas de `organizacion_id` directas a Prisma en `api-key-request`, rastreo y el webhook, que
    deberían ir a sus repositorios;
  - los dobles de ~20 suites no traen `organizacionId`, y pasan por una rama sin contexto que falla
    cerrado por R11.

### T2.3 + T2.3b Crons, drenador y M4 (R16, R42)
- M4 `20261022130200_jobs_organizacion_id`, con `down.sql`, y `Job.organizacionId String?`. Drift vacío.
- Diez crons pasan por `paraCadaEmpresa`: `corte-diario`, `generar-gastos-fijos`, `liberar-reprogramadas`,
  `procesar-devueltas-sla`, `snapshot-ranking`, `purga-pdf-cargas`, `purga-postulaciones-recurso`,
  `aviso-reparto-manana`, `avisos-diarios` y `sync-plantillas-whatsapp`. La respuesta añade
  `empresas: { procesadas, fallidas }`. `purga-descargas` queda sin tocar: solo usa storage (SL-19).
- Drenador:
  - el reclamo y el cierre corren en `comoPlataforma("SL-17", "drenador: reclamo y cierre de jobs")`;
  - un job con empresa corre en `conEmpresa`, y uno sin empresa en «job sin empresa»;
  - los recurrentes sin empresa (`liberar_reprogramadas`, `analitica_rollup_diario`,
    `whatsapp_envio_mantenimiento`) pasan por `paraCadaEmpresa`.
- Tests: `tests/unit/cron/crons-sin-empresas.test.ts` (37); 26 archivos y 295 tests en verde. Cinco
  mutaciones con rojo.
- Desviación: si un test inyecta `service` y no `empresas`, el cron corre una sola vez, para no romper
  los tests de controller previos. En producción el GET siempre itera.

### T2.4 Cachés por empresa (R34)
- `next-analitica-cache.ts` y `next-tablero-dia-cache.ts`: clave `["org:"+id, …]`, etiquetas
  `org:<id>:<tag>` y producción dentro de `conEmpresa`. Sin empresa lanzan `EmpresaNoResuelta` y no
  cachean.
- El handler de `analitica-invalidacion-cache` invalida la etiqueta de la empresa del job. Sin empresa,
  lo avisa en el log y no invalida nada.
- Tests: `tests/unit/cache/cache-por-empresa.test.ts` 14/14. Cuatro mutaciones con rojo.

### T2.5 Guardias (R5, R23–R27)
- Cuatro guardias: `organizacion-en-modelos`, `rls-por-empresa`, `sql-a-mano-por-empresa` y
  `plataforma-solo-en-lista`. Comparten los detectores de `tests/unit/guards/_aislamiento-por-empresa.ts`
  y cada una tiene su autocomprobación.
- `EXCEPCIONES_SQL_A_MANO` tiene **47** archivos, no los ~66 del design: 12 solo lo nombran en
  comentarios, 10 no nombran tablas de negocio y 1 ya filtra.
- El esquema tiene 89 modelos: los 88 clasificados más `Organizacion`.
- Mutación en `excepciones-aislamiento.ts`: 5 rojos.

### T2.6 Fábricas y helper (R33)
- `tests/fabricas/organizaciones.ts`. `enTransaccionRevertida` crea y fija una empresa por defecto, y
  corre `fn` dentro de `conEmpresa`.
- **Desviación:** crear la organización antes del lock de la feature 227 reabría deadlocks (`40P01`
  en 6–8 archivos). Si lo único escrito es esa organización, `serializarEscriturasReales` hace
  `ROLLBACK TO SAVEPOINT`, toma el lock y la vuelve a crear con el mismo id.
- De los 85 rojos, **65 vuelven a verde** sin tocarlos (antes 218 tests pasados y 384 fallidos;
  después 564 y 66). Los 20 que quedan van a la ronda de reconciliación: R2 lleva los 9 que commitean
  fuera de la transacción; R3, los 3 con conexión propia y los 7 tests de migración; R1, el del
  retiro de los conteos.
- Mutaciones: sin `fijarEmpresa` vuelve el NOT NULL (14 de 20 en rojo); sin el rollback al savepoint
  vuelve el `40P01` (6 archivos).

### T2.7 M3: misma empresa en cada FK (R37–R39), con medición
- Archivos:
  - `lib/db/fk-de-negocio.ts`: parsea `db/schema.prisma`. Es la desviación decidida, porque el DMMF
    en ejecución no trae `relationFromFields`;
  - `scripts/generar-misma-empresa.ts`;
  - M3 `20261022130300_misma_empresa_en_fk`, con `down.sql`;
  - la guardia `tests/unit/guards/fk-misma-empresa.guardia.test.ts` y `tests/unit/db/fk-de-negocio.test.ts`
    (18/18).
- **FK de negocio a negocio cubiertas: 150**, el mismo conjunto que `pg_constraint`, con 0 compuestas.
  **Triggers: 223** (150 `sme_*` y 73 `_sin_cambio_de_empresa`), más 2 funciones. `orden` tiene 4 FK de
  negocio (`carga_id`, `mensajero_asignado_id`, `tienda_id` y `zona_id`), no las ~8 que estimaba el design.
- **Medición:** `INSERT` de una `orden` con sus 4 FK, 3 rondas de 1000 por modo, cronometrado con
  `clock_timestamp()`.

  | | media | mediana | p95 |
  |---|---|---|---|
  | con triggers | 2,66 ms | 1,51 ms | 6,44 ms |
  | sin triggers | 0,99 ms | 0,42 ms | 2,46 ms |
  | sobrecoste | +1,67 ms | +1,09 ms (≈0,27 ms por FK) | |

- Ida y vuelta: la diferencia son exactamente 225 objetos; sin M3 quedan 0 triggers de usuario. Drift vacío.
- Prueba a mano:
  - orden de B con la `tienda_id` de A → `SL017`, como dueño y como `servi_app`;
  - cambiar `organizacion_id` → `SL017`;
  - superadmin referenciado → pasa;
  - id inexistente → `23503`.
- Mutación en disco (borrar el trigger de `orden.zona_id`): la guardia en rojo nombrando `Orden.zona`.
  Restaurado.
- Desviación menor: la función busca con `%I.%I` y `TG_TABLE_SCHEMA`, para el esquema desechable de T3.6.

### T2.8 Alta de empresa (R44–R46, R48)
- `lib/types/organizacion.ts`, las interfaces, `OrganizacionService`, `OrganizacionRepository`,
  `lib/actions/organizaciones.ts` y `lib/auth/exigir-superadmin.ts`, que devuelve siempre `false`
  porque `lib/auth/plataforma.ts` no existe en esta rama.
- Firma ampliada (pregunta abierta 1, decisión del leader): `maestro: { nombre, email, telefono,
  documento, tipoDocumento }`.
- El hash no utilizable es `hashPassword(randomBytes(32))` con el hasher del login, `lib/utils/password.ts`.
  **`lib/auth/password.ts` no existe**: es una desviación del encargo.
- Tests: servicio 28, action 12 más 1 de composition root, e integración 8/8 contra Postgres. Cubren
  la creación, `ya_existe`, el conflicto por slug, el de email o documento con rollback total, la
  entrada inválida sin escrituras, que el login falle con cualquier contraseña y el primer acceso por
  «recuperar contraseña». Cuatro mutaciones con rojo.

### T2.9 Retiro de los conteos públicos (R43)
- 11 archivos borrados. `LandingHero` y `LandingBanda` quedan sin cifras; se conserva el rango fijo
  «1–3 Días de entrega», que no es un agregado.
- Guardia nueva `tests/unit/guards/conteos-publicos-retirados.guardia.test.ts` (18) y un caso R43 en
  `tests/components/LandingPage.test.tsx`. 109/109; dos mutaciones con rojo.
- Deuda: `WHERE_*_DISPONIBLE` (`geografia-activa.ts`) y `lib/utils/cifra-aproximada.ts` se quedan sin
  uso en producción.

### Ronda de reconciliación de la tanda 2 (R1, R2, R3 y cierre)
- **R1:** `EXCEPCIONES_DE_PLATAFORMA` queda con 12 entradas, sin `app/login`, `app/recuperar-contrasena`
  ni `app/paquete`; `comoPlataforma(` aparece exactamente en esos 12 archivos. Además:
  - `@sin-superficie` en `altaEmpresaAction` (la pantalla es de SL-32);
  - `cache-por-empresa.test.ts` usa `ANALITICA_TAGS`, y así `cache-tags` vuelve a verde;
  - `marca-texto-amarillo`: `apariciones: 1` en LandingHero;
  - `tests/unit/api/webhook-whatsapp-por-empresa.test.ts`, escrito por T2.2, entra en el árbol;
  - `emisor-relaciones-anidadas` y `geografia-catalogo-activo` pierden solo los casos de conteos
    públicos. `geografia-catalogo-activo` da 17/17. `emisor-relaciones-anidadas` sigue saltado: su
    `beforeAll` exige órdenes sembradas, ya está en `tests/baseline-rojos.json` y es deuda de SL-31.
  - Mutaciones: sin `org:` en la etiqueta, 3 rojos; webhook sin `conEmpresa`, 1 rojo.
- **R2:**
  - `_fixtures/escrituras-459.ts` siembra una organización commiteada, con sus usuarios y actores, y
    la borra al final.
  - Hay dos helpers nuevos: `conEmpresa459` y `clienteConEmpresa459`, que envuelve los clientes propios
    de los tests de concurrencia igual que `getPrismaClient()`, de modo que ahora corren como
    `servi_app` con RLS.
  - Los 9 archivos dan 9/9 y 43/43.
  - Mutación (sin `conEmpresa` en `conEmpresa459`): 17/17 en rojo en `cobro-tienda-461` y
    `abono-tienda-457` con
    `[AppError:INTERNAL] EmpresaNoResuelta: Sin empresa en contexto para Usuario.findUnique: la operacion no se ejecuto`.
- **R3:** 10 archivos y 121/121.
  - Tests de migración: lo que añade M2 entra como literal explícito, con una línea que cita SL-17 M2.
  - «Cero policies»: se sigue comprobando que la migración original no crea políticas, y la única
    política en la base es `<t>_por_empresa`, por nombre.
  - Mutaciones: sin `organizacion_id` en la lista esperada → rojo; sin `fijarEmpresa` vuelve `23502`;
    sin `SET DEFAULT` en el clon vuelve el NOT NULL.
  - Desviación: la guardia de `down.sql` de `usuario-preferencia` admite M2 y M3 por nombre exacto.
- **Cierre:**
  - `soloSeEscribioLaEmpresa` (`_postgres-real.ts`) acota `organizacion` a `public` con
    `pg_namespace`, y así vuelve a verde `catalogo-postgres-acota-esquema`. Los 6 tests del savepoint
    dan 57/57.
  - Ocho tests de wallet se arreglaron con `const sembradas = p`: era un TS2345 por el estrechamiento
    de tipo dentro de la closure.
- **Incidente: el cliente Prisma compartido.** Hacia las 23:17 otra sesión regeneró el cliente desde
  un esquema sin SL-17 (`node_modules` es un enlace compartido entre worktrees), y desapareció
  `prisma.organizacion`. Se regeneró desde SL-17. Mientras haya features en paralelo que cambian el
  esquema, el gate de cada worktree puede dejar a los demás con un cliente ajeno: hay que avisar al
  leader.

### Cierre de la tanda 2 — gate
Logs fuera del repo; la base `sl17_gate` se recreó en cada corrida.
- **Corrida 1, sobre `532f9c0`:** `INIT_EXIT=1`, con 1 rojo: `analytics-daily-guards`, un timeout de
  20 s en un barrido de archivos durante una corrida de 20 min. Solo da 26/26.
- **Corrida 2:** `INIT_EXIT=1`, con 84 rojos. **No vale:** a las 00:01:59 se regeneró el cliente
  compartido desde un esquema sin `Organizacion` (410 `Cannot read properties of undefined
  (reading 'create')`).
- **Corrida 3:** `INIT_EXIT=1`, con 10 rojos. **No vale:** el cliente volvió a regenerarse desde un
  esquema ajeno a las 00:22. Con el cliente regenerado, esos 10 dan 9 en verde y 1 en rojo de verdad:
  `organizacion-alta` contaba filas de forma global y lo rompían otros archivos que commitean
  organizaciones en paralelo. Se arregló acotando el conteo a su ejecución (`6d6bc71`). La mutación
  sin transacción en el repositorio da 2 rojos.
- **Merge de `origin/dev`** (PR #1 de SL-31: el CI migra y siembra catálogos, y trae baseline nuevo)
  con `--no-ff` en `79e5dce`. Sin conflictos de texto. `db:seed` sobre el esquema de SL-17 en una base
  nueva termina en 0 y deja 0 organizaciones (R32).
- **Corrida 4, sobre `79e5dce`** (base migrada y sembrada con `db:seed`): **`INIT_EXIT=0`**.
  - Relacionados: `Test Files  943 passed (943)`, `Tests  13098 passed | 26 skipped (13124)`.
  - Guardias: `Test Files  299 passed (299)`, `Tests  4085 passed | 1 skipped (4086)`.
  - 249 rojos heredados del baseline, que no cuentan.
  - Cliente al final: `CLIENTE_FIN mtime=2026-10-23 00:33:12 organizacion=1`, intacto.
