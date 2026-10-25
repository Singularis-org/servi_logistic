# impl SL-19 «jobs-storage-por-empresa» — bitácora

Rama `feature/SL-19-jobs-storage-por-empresa`, worktree `.worktrees/SL-19-jobs-storage-por-empresa/`.
Spec: `specs/SL-19-jobs-storage-por-empresa/`. Base local propia `servi_logistic_sl19` (nunca QA, dev
compartido ni producción).

## Tanda A — T1 a T4: la cola `jobs` con RLS por empresa (backend_dev, 2026-10-25)

### Archivos

- Migración: `db/migrations/20261025150000_jobs_por_empresa/{migration.sql,down.sql}` (design §2.1, tal cual).
- Clasificación: `lib/db/modelos-de-negocio.ts` — `MODELOS_CON_EMPRESA_OPCIONAL = [Job]`,
  `MODELOS_DIFERIDOS = []`, tipo `ModeloConEmpresaOpcional`, cabecera con los conteos (77/15/1/0).
- Censo (fuera del design, ver «Desviaciones»): `scripts/verificar-rls-despliegue.ts` —
  `contratoEsperado` suma las tablas de empresa opcional a las políticas `*_por_empresa` (no a los
  triggers sin cambio); `tests/unit/scripts/verificar-rls-despliegue.test.ts` ajustado (78/151/77) y un
  caso nuevo.
- Guardias: `tests/unit/guards/organizacion-en-modelos.guardia.test.ts` (clase nueva en la suma;
  nulabilidad e índice; R14), `tests/unit/guards/rls-por-empresa.guardia.test.ts` (tablas de empresa
  opcional; políticas abiertas; autocomprobaciones de §5.2).
- Tests de integración nuevos: `tests/integration/db/_jobs-dos-empresas.ts` (helper),
  `jobs-por-empresa.test.ts`, `jobs-por-empresa-migracion.test.ts`, `jobs-drenador-dos-empresas.test.ts`,
  `geocode-salud-dos-empresas.test.ts`.
- No se tocan `GeocodeSaludRepository.ts` ni `GeocodeSaludService.ts` (solo se mutaron y se revirtieron).

### Mediciones T1.1

Contra `servi_logistic_sl19`, en una transacción revertida, con dos organizaciones nuevas y la
política nueva aplicada a mano dentro de la transacción (antes de existir la migración):

1. **Cumple.** `JobRepository.enqueue` dentro de `comoApp(tx, A)` (rol `servi_app`) devuelve la fila
   (el `RETURNING` pasa la política) y la guarda con `organizacion_id = A` (la pone el `DEFAULT` de M4).
2. **Medido.** Con A fijada, `INSERT … ON CONFLICT ("dedupe_key") … DO NOTHING` con una clave que ya
   usa un job de B devuelve `null` («omitido»), sin error; la fila de B queda byte a byte igual y
   sigue habiendo 1 sola fila con esa clave. Es lo que preveía design §2.4.
3. **Cumple.** `claimBatch` como dueño (plataforma, `current_user` ≠ `servi_app`) reclama en una sola
   corrida 3 jobs: 1 de A, 1 de B y 1 sin empresa (0 ajenos: reloj inyectado en 1990).

### Migración: ciclo a mano

- `prisma migrate deploy` → aplicada; `pg_policies` de `jobs`: solo `jobs_por_empresa`
  (`USING` y `WITH CHECK` = `organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')`, `{servi_app}`, `ALL`).
- `down.sql` → solo `jobs_abierta` (`true`/`true`).
- `migration.sql` otra vez → solo `jobs_por_empresa`, idéntica.
- Estado final de la base: migración real aplicada, `prisma migrate status` → «Database schema is up to date!».

### Mapa R → test (tanda A)

| R | Test |
|---|---|
| R1 | `tests/integration/db/jobs-por-empresa.test.ts` › «R1 — con A fijada, leer jobs devuelve solo los de A, aunque el SQL no filtre» |
| R2 | ídem › «R2 — con A fijada, actualizar o borrar un job de B o sin empresa afecta cero filas y lo deja intacto» |
| R3 | ídem › «R3 — con A fijada, insertar un job de B o con organizacion_id NULL explicito se rechaza y no escribe nada» |
| R4 | ídem › «R4 — encolar dentro de A sin nombrar la empresa guarda el job con A y devuelve el job creado» |
| R5 | ídem › «R5 — con servi_app y sin empresa fijada, jobs devuelve cero filas y rechaza toda insercion» |
| R6 | `tests/integration/db/jobs-drenador-dos-empresas.test.ts` › «R6 — reclama en una corrida los vencidos de A, de B y sin empresa, y los cierra: completado, reintento y fallo terminal» |
| R7 | `jobs-por-empresa.test.ts` › «R7 — dentro de A, encolar dos veces la misma clave deja una sola fila y el segundo devuelve omitido» |
| R8 | `tests/integration/db/geocode-salud-dos-empresas.test.ts` › «R8 — A cuenta solo sus fallos de configuracion…» y «R8 — A revive solo sus jobs muertos por configuracion…» |
| R9 | `tests/unit/guards/rls-por-empresa.guardia.test.ts` › «R9, R12 — ninguna tabla comprobada conserva una política abierta para servi_app»; en Postgres, `jobs-por-empresa.test.ts` › «la politica aplicada es solo jobs_por_empresa» |
| R10 | `jobs-por-empresa.test.ts` › «R10 — A busca por claves de deduplicacion y recibe solo sus jobs, aunque pida claves de B y sin empresa» |
| R11 | `tests/integration/db/jobs-por-empresa-migracion.test.ts` › «R11 — la migracion trae su down.sql» y «R11 — up → down deja solo jobs_abierta; down → up deja las politicas igual que la primera vez» |
| R12 | `rls-por-empresa.guardia.test.ts` › «R9, R12 — …», «R12 — autocomprobación: quitar el DROP POLICY jobs_abierta de la migración real la pone en rojo», «R12 — autocomprobación inventada: una USING (true) junto a la de empresa falla…», «R12 — … un DROP posterior de la abierta la deja en verde» |
| R13 | `rls-por-empresa.guardia.test.ts` › «R13 — jobs y cada tabla de negocio tienen su política por empresa vigente», «R13 — autocomprobación: sin la migración de SL-19…»; `organizacion-en-modelos.guardia.test.ts` › «R13, R14 — autocomprobación sobre el esquema real: Job sin nulabilidad o sin el índice falla nombrándolo» |
| R14 | `organizacion-en-modelos.guardia.test.ts` › «R14 — Job ya no es diferido: es de empresa opcional, con su ficha», «R13, R14 — …», «R14 — autocomprobación: como diferido, a Job nadie le exige la nulabilidad» |

R15–R28 (Storage y comando) son de las tandas siguientes.

### Mutaciones

Cada una aplicada a mano, medida y revertida justo después (archivo restaurado desde copia y
comprobado con `cmp`/`git diff`; la base vuelta a la política real y comprobada en `pg_policies`).

| # | Mutación | Test | Con la mutación | Sin ella |
|---|---|---|---|---|
| M1 | `down.sql` sin el `CREATE POLICY "jobs_abierta"` (archivo) | `jobs-por-empresa-migracion` | ROJO (1 de 2: el ciclo) | verde 2/2 |
| M2 (a) | migración sin el `DROP POLICY "jobs_abierta"`: en la base, `jobs_abierta` recreada junto a `jobs_por_empresa` | `jobs-por-empresa` | ROJO 6 de 8 (precondición, R1, R2, R3, R5, R10; R4 y R7 siguen verdes, son positivos) | verde 8/8 |
| M3 (b) | `ALTER POLICY` con `… OR organizacion_id IS NULL` en `USING` y `WITH CHECK` | `jobs-por-empresa` | ROJO 5 de 8 (R1, R2, R3, R5, R10) | verde 8/8 |
| M4 (c) | `ALTER TABLE jobs ALTER COLUMN organizacion_id DROP DEFAULT` dentro de la tx del caso R4 | `jobs-por-empresa` | ROJO (R4) | verde 8/8 |
| M5 | reclamo con `comoApp(tx, A)` en vez de como dueño | `jobs-drenador-dos-empresas` | ROJO (R6: reclama 1 de 3) | verde 2/2 |
| M6.i | solo restaurar `jobs_abierta` (down aplicado), filtro de SL-36 intacto | `geocode-salud-dos-empresas` | verde 2/2 (esperado: segunda barrera) | — |
| M6.ii | solo quitar el filtro de SL-36 (`AND "organizacion_id" = ${organizacionId}`, dos líneas), política real | `geocode-salud-dos-empresas` | verde 2/2 (esperado: la RLS basta) | — |
| M6.iii | las dos juntas | `geocode-salud-dos-empresas` | ROJO 2/2 (cuenta 4 en vez de 1; revive 3 en vez de 1) | verde 2/2 |
| M7 | quitar `DROP POLICY "jobs_abierta"` de `migration.sql` (archivo) | `rls-por-empresa.guardia` | ROJO 2 de 18 (R9/R12 real y su autocomprobación) | verde 18/18 |
| M8 | `Job` de vuelta en `MODELOS_DIFERIDOS` y `MODELOS_CON_EMPRESA_OPCIONAL` vacía | `organizacion-en-modelos.guardia` + `rls-por-empresa.guardia` | ROJO 6 de 31 (3 de cada) | verde 31/31 |

Además, `scripts/verificar-rls-despliegue.ts` contra la base local tras la migración: «Punto 6: OK —
politicas *_por_empresa=78/78 … *_sin_cambio_de_empresa=77/77»; sin el cambio del contrato habría
esperado 77 y salido en rojo.

### Desviaciones y hallazgos

- **Censo no previsto en el design:** `scripts/verificar-rls-despliegue.ts` cuenta las políticas
  `LIKE '%_por_empresa'` contra `MODELOS_DE_NEGOCIO.length`. Con `jobs_por_empresa` la base tiene 78:
  el script de despliegue saldría en rojo en un despliegue correcto. Se suma
  `MODELOS_CON_EMPRESA_OPCIONAL` a las políticas (no a los triggers `*_sin_cambio_de_empresa`, que
  `jobs` no tiene).
- **R10:** `dedupe_key` es única en toda la tabla (design §2.4), así que B no puede tener la MISMA
  clave que A. El test pide desde A claves que existen para B y sin empresa, y comprueba que solo
  vuelve la de A.
- **Políticas abiertas heredadas:** ninguna. Con la comprobación nueva, ninguna de las 77 tablas de
  negocio conserva una política para `servi_app` que no compare con `app.organizacion_id`.
- **Comentario desfasado (no tocado, por encargo):** `GeocodeSaludRepository.ts` dice «la política de
  `jobs` está abierta hasta SL-19». Tras esta tanda ya no lo está; el filtro se queda como segunda
  barrera. Lo actualiza quien toque ese archivo.
- **T2.2 en la base compartida:** el ciclo up → down → up corre en una transacción revertida de la base
  de los tests (design §6 lo pide así), con `LOCK TABLE "jobs"` primero; no en una base propia como
  SL-17/SL-38.

### Verificación (salida real)

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, tsc muere por memoria) → `TC_EXIT=0`.
- `pnpm run lint` → `✖ 231 problems (0 errors, 231 warnings)`, ninguno en archivos de esta tanda; `LINT_EXIT=0`.
- `pnpm run test:guardias` → `Test Files 1 failed | 307 passed (308)`, `Tests 4 failed | 4220 passed | 1 skipped`.
  El rojo es `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (marcadores de
  `init.sh`), que está en `tests/baseline-rojos.json`: no es de esta tanda.
- Tests de la tanda contra `servi_logistic_sl19`:
  `jobs-por-empresa` 8/8, `jobs-por-empresa-migracion` 2/2, `jobs-drenador-dos-empresas` 2/2,
  `geocode-salud-dos-empresas` 2/2, `organizacion-en-modelos.guardia` 13/13, `rls-por-empresa.guardia` 18/18,
  `verificar-rls-despliegue` 4/4.
- Regresión de `jobs` (53 archivos de `tests/integration/` que usan `jobs` o `JobRepository`):
  `Test Files 9 failed | 44 passed (53)`. Los 9 rojos fallan en su `beforeAll` por base sin datos
  («tabla `orden` vacía», «sin zona central») y los 9 están en `tests/baseline-rojos.json`.
- `pnpm exec vitest related --run <los 10 archivos de la tanda>` contra `servi_logistic_sl19`: arrastra
  1151 archivos, porque `lib/db/modelos-de-negocio.ts` lo importa la extensión de Prisma.
  `Test Files 246 failed | 905 passed (1151)`. 245 de los 246 están en `tests/baseline-rojos.json`.
  El que queda, `tests/integration/db/arranque-superadmin.test.ts` (cuenta usuarios de la base
  compartida mientras otros archivos los insertan: 7 en vez de 1), sale verde 10/10 corrido solo. No
  toca `jobs`.

**Veredicto:** T1–T4 hechas; la cola `jobs` queda separada por empresa en la base, el drenador sigue
reclamando todo en plataforma, y cada test clave tiene su mutación roja anotada.

## Tanda B — T5 a T9: Storage por empresa (backend_dev, 2026-10-25)

Commits: `36d0517` (T5), `2de55f2` (T6), `78cfa83` (T7), `3e4dbb9` (T8), `60f443b` (T9).

### Archivos

- Nuevo: `lib/storage/carpeta-de-empresa.ts` — `RutaDeAlmacenInvalida`, `empresaDelAlmacen` (regla de
  `empresaEnCurso`, resolutor de sesión con import perezoso como `prisma-client.ts`), `rutaEnCarpeta`,
  `rutaRelativa`.
- Adaptadores: `lib/storage/{SupabaseFileStorage,SupabaseSignedUrlProvider,SupabaseAlmacenDescargas,SupabaseAlmacenEnviosWhatsapp}.ts`
  (design §3.2; `createSignedUrls` re-indexa por la ruta relativa, R19). Firmas y composition roots sin cambios.
- Borrado: `lib/storage/getFile.ts` (Grep: sin usos; solo lo citaba un comentario de `buckets.ts`, actualizado).
- Comentario de las cuatro interfaces de `lib/interfaces/external/` (ruta relativa a la carpeta).
- Cron: `app/api/cron/purga-descargas/route.ts` con `paraCadaEmpresa` y `deps.empresas` (design §3.4).
- Excepciones: `EXCEPCIONES_DE_STORAGE` (vacía) en `lib/db/excepciones-aislamiento.ts`.
- Tests nuevos: `tests/unit/storage/carpeta-de-empresa.test.ts`,
  `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts`,
  `tests/integration/storage/storage-dos-empresas.test.ts`.
- Tests ajustados: los cuatro de `tests/unit/storage/`, `tests/unit/e2e/storage-falso.test.ts` (su caso
  «clases reales» corre en `conEmpresa` y afirma que el objeto vive en la carpeta),
  `tests/unit/api/cron-purga-descargas.test.ts`, `tests/unit/cron/crons-sin-empresas.test.ts`.

### Mapa R → test (tanda B)

| R | Test |
|---|---|
| R15 | `tests/integration/storage/storage-dos-empresas.test.ts` › «SupabaseFileStorage: devuelve la ruta relativa y el objeto vive en <A>/<ruta>, no en la raiz», «SupabaseAlmacenEnviosWhatsapp: <envioId>/<ejecucionId>.pdf dentro de la carpeta de A», «SupabaseAlmacenDescargas: tmp/<uuid>.json.gz dentro de la carpeta de A, y A la firma»; unit: `supabase-file-storage.test.ts` › «sube a la carpeta de la empresa del bucket privado…» |
| R16 | `storage-dos-empresas.test.ts` › «firmar (uno y en lote), descargar y borrar desde B no alcanzan el objeto de A, que queda intacto», «leer, firmar y borrar un PDF de envios de A desde B…», «firmar desde B una descarga temporal de A falla», «con la misma ruta, cada empresa ve solo su objeto», «firmar o subir `../<A>/<ruta>` desde B no sale de la carpeta de B…» |
| R17 | `tests/unit/storage/carpeta-de-empresa.test.ts` › «R17 — una ruta invalida…» (8 casos: vacía, `/` inicial, `\`, segmento vacío en medio y al final, `.`, `..`, solo `..`); en cada adaptador › «SL-19 R17/R18: ruta invalida o sin empresa ⇒ falla sin llamar a Storage» |
| R18 | `carpeta-de-empresa.test.ts` › «con empresa en contexto…», «en plataforma: EmpresaNoResuelta…», «sin contexto y con sesion…», «sin contexto y sin sesion…», «…el resolutor real (perezoso) no da empresa»; `almacen-descargas.test.ts` › «guardar, firmar y purgar fuera de una empresa fallan con EmpresaNoResuelta» |
| R19 | `storage-dos-empresas.test.ts` › «las claves son las rutas relativas pedidas; la que falta se omite; cada URL sirve su objeto»; `supabase-signed-url-provider.test.ts` › «firma varias URLs en batch y devuelve mapa path relativo->url…», «SL-19 R19: una entrada que Storage devuelve fuera de la carpeta se descarta» |
| R20 | `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts` › «todo archivo fuera de lib/storage que accede a Storage está en EXCEPCIONES_DE_STORAGE», «cada excepción trae ficha SL-<n>, motivo y un archivo que existe…» y sus autocomprobaciones |
| R21 | `tests/unit/api/cron-purga-descargas.test.ts` › «dos empresas: purga lo vencido de cada carpeta…», «el fallo de una empresa no frena a la otra…», «sin empresas: 200 en cero, sin tocar Storage»; `tests/unit/cron/crons-sin-empresas.test.ts` › caso `purga-descargas` (3 tests); `storage-dos-empresas.test.ts` › «purga de descargas en A: borra lo vencido de <A>/tmp y deja <B>/tmp y la raiz» |
| R22 | `storage-dos-empresas.test.ts` › «purga de PDF de cargas (SupabaseFileStorage.remove en etiquetas)…», «mantenimiento de envios (borrar)…»; `supabase-almacen-envios-whatsapp.test.ts` › «SL-19 R22: borra solo dentro de la carpeta de la empresa en curso» |

### Mutaciones (tanda B)

Cada una aplicada a mano y revertida justo después desde una copia (`cmp` / `git diff --stat` vacío).

| # | Mutación | Test | Con la mutación | Sin ella |
|---|---|---|---|---|
| M9 | `validarRuta` acepta `..` | `carpeta-de-empresa` | ROJO 3 de 16 (`segmento ..`, `solo ..`, `rutaRelativa…`) | verde 16/16 |
| M10 | `empresaDelAlmacen` en plataforma devuelve una empresa en vez de lanzar | `carpeta-de-empresa` | ROJO 1 de 16 («en plataforma…») | verde 16/16 |
| M11.a | `rutaEnCarpeta` devuelve la ruta sin carpeta (la de §6) | `storage-dos-empresas` | ROJO 12/12 (la subida ya falla: la respuesta queda fuera de la carpeta) | verde 12/12 |
| M11.b | `rutaEnCarpeta` sin carpeta **y** `rutaRelativa` identidad (un mundo coherente sin carpetas) | `storage-dos-empresas` | ROJO 11 de 12: B firma y lee el `x` de A («promise resolved … instead of rejecting») y B borra el de A. Solo R19 sigue verde, que no depende de la carpeta | verde 12/12 |
| M12 | `createSignedUrls` indexa por `entry.path` (sin re-indexar) | `storage-dos-empresas` + `supabase-signed-url-provider` | ROJO 4 de 21 (R19 en los dos) | verde 21/21 |
| M13 | purga-descargas sin `paraCadaEmpresa` (`return corrida()` siempre) | `cron-purga-descargas` + `crons-sin-empresas` | ROJO 7 de 54; la respuesta es 500 con `EmpresaNoResuelta: … Storage.descargas:purgar` | verde 54/54 |
| M14 | archivo real `lib/services/intruso-sl19.ts` con `createServerClient().storage.from(…)` | `storage-solo-por-adaptador.guardia` | ROJO 1 de 7, nombra `lib/services/intruso-sl19.ts` | verde 7/7 (archivo borrado) |
| M15 | `EXCEPCIONES_DE_STORAGE` con una entrada de ficha `SL19` y archivo inexistente | `storage-solo-por-adaptador.guardia` | ROJO 1 de 7 («ficha «SL19» no es SL-<n>», «el archivo no existe») | verde 7/7 |

### Desviaciones y hallazgos

- **Respuesta de `purga-descargas`:** design §7 dice que mantiene `{ objetosBorrados, quedaPendiente }`.
  Se mantienen esos dos campos y, por el patrón de `purga-pdf-cargas` y de `crons-sin-empresas.test.ts`
  (que lo exige a todos los crons), se añade `empresas: { procesadas, fallidas }` (ids de empresa, sin
  rutas ni PII). Con `service` inyectado y sin `empresas` sigue una sola corrida con el cuerpo de antes
  (contrato de los tests de controller previos, igual que `purga-pdf-cargas`).
- **`SupabaseFileStorage.remove`** sigue sin propagar el error del SDK, pero ahora sí lanza
  `EmpresaNoResuelta` / `RutaDeAlmacenInvalida` antes de llamar a Storage (R17, R18).
- **Mutación de T9:** la de §6 tal cual (M11.a) pone todo en rojo porque la subida ya falla. Para medir
  justo «B firma y descarga el `x` de A» se anota también M11.b, que deja la subida funcionando.
- **E2E (T11, no tocado):** `e2e/_escenarios/reparto.ts` (l. 264-265) y `cierres.ts` (l. 62, 84)
  construyen `SupabaseFileStorage` / `SupabaseSignedUrlProvider`; compilan (typecheck verde), pero si
  operan fuera de `conEmpresa` fallarán con `EmpresaNoResuelta` al ejecutarse.
- **Vitest y CI:** `vitest.config.ts` incluye `tests/**/*.test.ts` y el gate de CI corre `vitest run`
  sin filtro de rutas, así que `tests/integration/storage/` entra. No necesita base.
- No apareció ningún acceso a `.storage` fuera de `lib/storage/` en `app/`, `lib/` ni `scripts/`.

### Verificación (salida real)

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`) → `TC_EXIT=0`.
- `pnpm run lint` → `✖ 231 problems (0 errors, 231 warnings)`, ninguno en archivos de esta tanda; `LINT_EXIT=0`.
- `pnpm run test:guardias` → `Test Files 1 failed | 306 passed | 2 skipped (309)`, `Tests 4 failed | 4208 passed | 20 skipped`.
  El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, en `tests/baseline-rojos.json` (el mismo de la tanda A).
- Tests de la tanda: `vitest run tests/unit/storage tests/unit/e2e/storage-falso.test.ts tests/integration/storage
  tests/unit/api/cron-purga-descargas.test.ts tests/unit/cron/crons-sin-empresas.test.ts
  tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts` → `Test Files 10 passed (10)`, `Tests 145 passed (145)`.
- `vitest related --run` de los 6 archivos de `lib/storage/` contra `servi_logistic_sl19` →
  `Test Files 16 failed | 319 passed (335)`. Los 16 están en `tests/baseline-rojos.json`; fallan por base
  sin sembrar o por `EmpresaNoResuelta` de Prisma (`WalletMovimiento`, `AporteCapital`, `CierreDia`), ninguno de Storage.
- `vitest related --run app/api/cron/purga-descargas/route.ts` → `Test Files 2 passed (2)`, `Tests 54 passed (54)`.

**Veredicto:** T5–T9 hechas; cada archivo de Storage vive en la carpeta de su empresa, desde otra empresa
no se alcanza, la purga de descargas corre por empresa y el gate vigila que nadie se salte los adaptadores.

## Tanda C — T10 a T12: lo ya guardado, E2E y cierre (backend_dev, 2026-10-25)

Commits: `4337e00` (T10.1), `afd8ef4` (T10.2), y el de docs de esta sección (T10.3, T11, T12.1, T12.2).
T10.4 (puerta humana) y T12.3 (`./init.sh`) quedan sin hacer.

### Archivos

- Nuevo: `scripts/migrar-storage-a-carpetas.ts` (design §4). `migrarStorageACarpetas({ db, storage, modo,
  bucket?, soloEmpresas? })` devuelve los conteos. `main` lo corre en `comoPlataforma("SL-19", …)` con
  `getPrismaClient()` y `createServerClient().storage`. Lee las 12 columnas de §3.1 con la API de modelos
  (`RUTAS_GUARDADAS`, con los buckets de los mismos `load*Config`) y deduplica por `(bucket, ruta)`. Mueve con
  `download` + `upload` sin pisar + `remove`. La existencia del destino sale del listado de su carpeta padre.
- `lib/db/excepciones-aislamiento.ts`: entrada SL-19 del comando en `EXCEPCIONES_DE_PLATAFORMA` y en
  `EXCEPCIONES_DE_STORAGE`, que deja de estar vacía.
- `package.json`: solo `"storage:migrar-a-carpetas": "tsx scripts/migrar-storage-a-carpetas.ts"` en `scripts`.
- Nuevo test: `tests/integration/storage/migrar-storage-a-carpetas.test.ts` (9 casos).
- `docs/architecture.md > Multi-empresa`: viñetas «Cola `jobs` (SL-19)» y «Storage (SL-19)».
- `e2e/_escenarios/reparto.ts` y `cierres.ts`: **sin cambios** (T11.1, ver abajo).

### T11.1 — revisión de los escenarios E2E

- `reparto.ts`: `SupabaseFileStorage` y `SupabaseSignedUrlProvider` solo los usa `misAsignaciones`. Sus
  tres llamadas (`recogerAsignaciones` l. 488, `escogerParaGestion` l. 552, `gestionar` l. 553) ya van
  dentro de `conEmpresa(org, …)`.
- `cierres.ts`: los dos `SupabaseSignedUrlProvider` (l. 62 y 84) solo se usan desde `solicitarCierre`
  y `aprobarCierre`, que ya envuelven en `conEmpresa(r.empresa.organizacionId, …)`.
- Ningún escenario ni spec siembra objetos en el doble por ruta (Grep de `storage/v1` y `.storage` en
  `e2e/`): todo lo sube la app por los adaptadores, que ya lo meten en la carpeta. No hay nada que tocar.

### T10.3 — el comando contra la base local y el doble

Contra `servi_logistic_sl19` y el doble `e2e/_storage-falso/servidor.mjs` en `127.0.0.1:54319`.
`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del doble se pasaron por entorno: `process.loadEnvFile()` no
pisa una variable ya puesta (medido con un `.env` de prueba). En el doble se sembraron a mano un temporal
`descargas/tmp/viejo-t103.json.gz` y un huérfano `gestion-evidencias/suelto-t103/sin-fila.jpg`. La base
local no tiene filas con ruta en las 12 columnas.

| Corrida | descargas | etiquetas-guia | gestion-evidencias | mensajero-docs | wallet-comprobantes | whatsapp-envios | Salida |
|---|---|---|---|---|---|---|---|
| sin `--aplicar` | temporales 1 | 0 | huérfanos 1 | 0 | 0 | 0 | 0 |
| `--aplicar` | temporales 1 (borrado) | 0 | huérfanos 1 | 0 | 0 | 0 | 0 |
| sin `--aplicar` otra vez | temporales 0 | 0 | huérfanos 1 | 0 | 0 | 0 | 0 |

En las tres corridas, todos los demás conteos salen en 0: a mover, ya en su sitio, duplicados, bytes
distintos, filas sin objeto, rutas no válidas y fallos. La única línea de detalle es
`huerfano gestion-evidencias suelto-t103/sin-fila.jpg`. La corrida prueba además que `findMany` de los
12 modelos funciona dentro de `comoPlataforma` con el cliente real (con extensión). El movimiento con
filas reales lo mide T10.2. El doble se paró al terminar (54319 libre).

### T11.2 — E2E, uno a uno, contra `servi_logistic_sl19_e2e`

`env E2E_SERVIDOR=dev E2E_PUERTO=3119 E2E_STORAGE_PUERTO=54319 pnpm exec playwright test e2e/<spec>.spec.ts`.
Antes de cada spec se comprobó que 3119 y 54319 estaban libres. Hubo dos arranques en falso, sin relación
con SL-19:
1. sin `E2E_SERVIDOR=dev`, el lanzador hace `next start`, y el worktree no tiene build;
2. a la base E2E le faltaban los catálogos («faltan catálogos: vehiculo»): se corrió `pnpm run db:seed`
   contra ella.

Después, los 11 specs que usan los escenarios con `gestionar` o cierres:

| Spec | Resultado |
|---|---|
| `mis-asignaciones` | 4 passed (46.8s) |
| `cierre-bodega-satelite` | 3 passed (31.1s) |
| `cierre-vencido-modelo` | 5 passed (28.4s) |
| `cierres-admin-rechazos-sla` | 1 passed (15.8s) |
| `cierres-admin` | 2 passed (19.2s) |
| `reglas-bloqueos-cierre` | 5 passed (30.9s) |
| `reintentos-escalado` | 2 passed (22.4s) |
| `cierre-dia` | 2 passed (18.2s) |
| `devolucion-origen` | 2 passed (19.6s) |
| `historial-orden` | 2 passed (15.2s) |
| `reprogramacion-liberacion` | 3 passed (18.2s) |

Ningún log trae `EmpresaNoResuelta` ni `ruta no atendida`. Al terminar, 3119 y 54319 quedaron libres. Otros
5 specs importan escenarios: `asignacion-satelite`, `recepcion-satelite`, `mi-wallet`, `wallet` y
`wallet-mensajeros`. No gestionan ni cierran, así que no tocan Storage, y no se corrieron.

### Mutaciones (tanda C)

Se aplicaron con `sed` sobre `scripts/migrar-storage-a-carpetas.ts` y se revirtieron justo después desde
una copia (`cmp` igual).

| # | Mutación | Test | Con la mutación | Sin ella |
|---|---|---|---|---|
| M16 (a) | mover a la raíz en vez de a la carpeta (`[origen, destino] = [ruta, ruta]`) | `migrar-storage-a-carpetas` | ROJO 7 de 9, R24 incluido: origen y destino son el mismo objeto; el comando lo cuenta como «duplicado igual» y lo borra, así que A ya no lo firma | verde 9/9 |
| M17 (b) | no comprobar el destino (`hayDestino = false` fuera de `--revertir`) | `migrar-storage-a-carpetas` | ROJO 3 de 9, los tres R25: la segunda corrida cuenta las filas como «sin objeto», y con la corrida cortada intenta subir encima y sale con 1 | verde 9/9 |

### Desviaciones y hallazgos

- **Modo réplica al sembrar (T10.2).** Una evidencia cuelga de gestión → orden → tienda, zona…, y un
  comprobante cuelga de un movimiento y un usuario. El comando solo lee `organizacion_id` y la ruta, y la
  base de los tests no trae catálogo. Por eso el test siembra con `SET LOCAL session_replication_role = replica`
  dentro de su transacción revertida, como la limpieza de `dos-empresas-entradas.test.ts`. Los CHECK siguen.
- **`soloEmpresas`:** es un parámetro de la función, no del comando, para que el test no dependa de las
  filas de otros tests en la base compartida. Las carpetas de empresa se reconocen con todas las organizaciones.
- **Más conteos de los que pide R23.** R23 pide a mover, ya en su sitio, filas sin objeto y huérfanos. Salen
  además temporales (R26), duplicados iguales (corrida cortada), bytes distintos, rutas no válidas (R17, o la
  misma ruta en filas de dos empresas) y fallos de Storage. El comando sale con 1 si hay bytes distintos,
  rutas no válidas o fallos.
- **`--revertir`** no borra temporales ni toca huérfanos; los huérfanos se siguen listando.
- **E2E:** hizo falta `E2E_SERVIDOR=dev` y sembrar los catálogos de la base E2E (ver T11.2). No es de SL-19.

### Mapa R → test (los 28)

| R | Test |
|---|---|
| R1 | `tests/integration/db/jobs-por-empresa.test.ts` › «R1 — con A fijada, leer jobs devuelve solo los de A…» |
| R2 | `jobs-por-empresa.test.ts` › «R2 — con A fijada, actualizar o borrar un job de B o sin empresa afecta cero filas…» |
| R3 | `jobs-por-empresa.test.ts` › «R3 — … insertar un job de B o con organizacion_id NULL explicito se rechaza…» |
| R4 | `jobs-por-empresa.test.ts` › «R4 — encolar dentro de A sin nombrar la empresa guarda el job con A…» |
| R5 | `jobs-por-empresa.test.ts` › «R5 — con servi_app y sin empresa fijada, jobs devuelve cero filas…» |
| R6 | `tests/integration/db/jobs-drenador-dos-empresas.test.ts` › «R6 — reclama en una corrida los vencidos de A, de B y sin empresa…» |
| R7 | `jobs-por-empresa.test.ts` › «R7 — dentro de A, encolar dos veces la misma clave deja una sola fila…» |
| R8 | `tests/integration/db/geocode-salud-dos-empresas.test.ts` › los dos casos «R8 — …» |
| R9 | `tests/unit/guards/rls-por-empresa.guardia.test.ts` › «R9, R12 — ninguna tabla comprobada conserva una política abierta…»; `jobs-por-empresa.test.ts` › «la politica aplicada es solo jobs_por_empresa» |
| R10 | `jobs-por-empresa.test.ts` › «R10 — A busca por claves de deduplicacion y recibe solo sus jobs…» |
| R11 | `tests/integration/db/jobs-por-empresa-migracion.test.ts` › «R11 — la migracion trae su down.sql», «R11 — up → down … down → up …» |
| R12 | `rls-por-empresa.guardia.test.ts` › «R9, R12 — …» y las tres autocomprobaciones R12 |
| R13 | `rls-por-empresa.guardia.test.ts` › «R13 — jobs y cada tabla de negocio tienen su política…»; `organizacion-en-modelos.guardia.test.ts` › «R13, R14 — autocomprobación…» |
| R14 | `tests/unit/guards/organizacion-en-modelos.guardia.test.ts` › «R14 — Job ya no es diferido…», «R14 — autocomprobación: como diferido…» |
| R15 | `tests/integration/storage/storage-dos-empresas.test.ts` › bloque «R15 — …» (tres adaptadores); `tests/unit/storage/supabase-file-storage.test.ts` |
| R16 | `storage-dos-empresas.test.ts` › bloque «R16 — desde B, la ruta de un objeto de A se comporta como inexistente» (5 casos) |
| R17 | `tests/unit/storage/carpeta-de-empresa.test.ts` › «R17 — una ruta invalida…» (8 casos); cada test de adaptador › «SL-19 R17/R18 …» |
| R18 | `carpeta-de-empresa.test.ts` › los casos R18 (empresa, plataforma, sesión, sin sesión); `almacen-descargas.test.ts` › «… fuera de una empresa fallan con EmpresaNoResuelta» |
| R19 | `storage-dos-empresas.test.ts` › «las claves son las rutas relativas pedidas…»; `supabase-signed-url-provider.test.ts` › dos casos R19 |
| R20 | `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts` › «todo archivo fuera de lib/storage…», «cada excepción trae ficha…» y autocomprobaciones |
| R21 | `tests/unit/api/cron-purga-descargas.test.ts` (dos empresas, una que falla, ninguna); `tests/unit/cron/crons-sin-empresas.test.ts` › `purga-descargas`; `storage-dos-empresas.test.ts` › «purga de descargas en A…» |
| R22 | `storage-dos-empresas.test.ts` › «purga de PDF de cargas…», «mantenimiento de envios (borrar)…»; `supabase-almacen-envios-whatsapp.test.ts` › «SL-19 R22 …» |
| R23 | `tests/integration/storage/migrar-storage-a-carpetas.test.ts` › «R23 — sin --aplicar cuenta por bucket … y no toca nada», «R23 — la salida son conteos y huerfanos…» |
| R24 | `migrar-storage-a-carpetas.test.ts` › «R24 — con --aplicar cada objeto pasa a la carpeta de su fila; A lo firma con el adaptador real y B no lo alcanza» |
| R25 | `migrar-storage-a-carpetas.test.ts` › «R25 — otra corrida sobre lo migrado no mueve nada ni falla…», «R25 — una corrida cortada … se completa sin fallar», «R25 — si raiz y carpeta tienen bytes distintos, no toca ninguno y sale con 1» |
| R26 | `migrar-storage-a-carpetas.test.ts` › «R26 — con --aplicar borra los temporales de descargas de la raiz y deja los de la carpeta de A» |
| R27 | `migrar-storage-a-carpetas.test.ts` › «R27 — el huerfano de la raiz no se mueve ni se borra, y se lista con su bucket y su ruta» |
| R28 | `migrar-storage-a-carpetas.test.ts` › «R28 — --revertir devuelve a la raiz lo que se movio …; ida y vuelta» |

### Mutaciones de toda la feature

Hay 17 mutaciones: M1–M8 (tanda A), M9–M15 (tanda B) y M16–M17 (tanda C). Cada una sale roja con la
mutación y verde sin ella. Las excepciones son M6.i y M6.ii, que siguen verdes a propósito: son las dos
barreras de R8, y con las dos juntas (M6.iii) sale rojo. El detalle está en la tabla «Mutaciones» de
cada tanda.

### Mediciones T1.1 y conteos T10.3

- **T1.1:** en «Tanda A › Mediciones T1.1». Las mediciones 1 y 3 se cumplen. En la 2, el `ON CONFLICT`
  con la clave de B devuelve «omitido» sin tocar la fila de B.
- **T10.3:** en la tabla de arriba.

### Archivos de la feature (`git diff --stat origin/dev...HEAD`, antes del commit de docs de esta tanda)

43 archivos, +3826 −179.

- **Código:**
  - `app/api/cron/purga-descargas/route.ts`;
  - `db/migrations/20261025150000_jobs_por_empresa/{migration.sql,down.sql}`;
  - `lib/db/{excepciones-aislamiento,modelos-de-negocio}.ts`;
  - las 4 interfaces de `lib/interfaces/external/`;
  - `lib/storage/{SupabaseAlmacenDescargas,SupabaseAlmacenEnviosWhatsapp,SupabaseFileStorage,SupabaseSignedUrlProvider,buckets,carpeta-de-empresa}.ts`;
  - `lib/storage/getFile.ts` (borrado);
  - `package.json`;
  - `scripts/{migrar-storage-a-carpetas,verificar-rls-despliegue}.ts`.
- **Tests:**
  - `tests/integration/db/{_jobs-dos-empresas.ts,geocode-salud-dos-empresas,jobs-drenador-dos-empresas,jobs-por-empresa-migracion,jobs-por-empresa}.test.ts`;
  - `tests/integration/storage/{migrar-storage-a-carpetas,storage-dos-empresas}.test.ts`;
  - `tests/unit/api/cron-purga-descargas.test.ts`, `tests/unit/cron/crons-sin-empresas.test.ts`;
  - `tests/unit/e2e/storage-falso.test.ts`;
  - `tests/unit/guards/{organizacion-en-modelos,rls-por-empresa,storage-solo-por-adaptador}.guardia.test.ts`;
  - `tests/unit/scripts/verificar-rls-despliegue.test.ts`;
  - los 5 de `tests/unit/storage/`.
- **Docs:** `specs/SL-19-jobs-storage-por-empresa/*`, `progress/features/SL-19.md`, `progress/impl_SL-19.md`,
  y en esta tanda `docs/architecture.md`.

### Verificación (salida real)

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`), después de los E2E → `TC_EXIT=0`.
- `pnpm run lint` → `✖ 231 problems (0 errors, 231 warnings)`, ninguno en archivos de esta tanda; `LINT_EXIT=0`.
- `pnpm run test:guardias` → `Test Files 1 failed | 306 passed | 2 skipped (309)`, `Tests 4 failed | 4208 passed | 20 skipped`.
  El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`
  (el mismo de las tandas A y B).
- `migrar-storage-a-carpetas.test.ts` contra `servi_logistic_sl19` → `Tests 9 passed (9)`. Junto con
  `storage-solo-por-adaptador` y `plataforma-solo-en-lista` → `Test Files 3 passed (3)`, `Tests 23 passed (23)`.
- `vitest related --run scripts/migrar-storage-a-carpetas.ts lib/db/excepciones-aislamiento.ts` → `Test Files 5 passed (5)`, `Tests 44 passed (44)`.

**Veredicto:** T10.1–T10.3, T11 y T12.1–T12.2 están hechas. El comando mueve, revierte y se puede repetir
sin efectos, los 11 E2E con evidencias o cierres pasan y los 28 requisitos tienen test. Quedan T10.4
(puerta humana) y T12.3.
