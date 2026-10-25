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
