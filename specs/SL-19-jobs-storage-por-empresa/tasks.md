# SL-19 — jobs-storage-por-empresa · tasks.md

> Orden: T1 → (T2 ‖ T5) → T3 → T4 → T6 → (T7 ‖ T8) → T9 → T10 → T11 → T12.
> `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. Cada tanda cierra con `./init.sh`
> en verde. Un commit por task (`feat(SL-19): …`, `test(SL-19): …`).
> Reparto por capa (`docs/perfil-agentes.md > implementer`): todo es de `backend_dev`. No hay UI.
> Cada test de integración se mata a mano una vez con la mutación de `design.md > §6`, y el
> resultado (rojo con la mutación, verde sin ella) se anota en `progress/impl_SL-19.md`.

## T1. Medir antes de construir

- [x] **T1.1** Contra Postgres real (base local o contenedor propio, nunca QA ni producción), con dos
  organizaciones de prueba y en una transacción revertida, medir y anotar en `progress/impl_SL-19.md`:
  1. con la política nueva aplicada a mano, `JobRepository.enqueue` dentro de `comoApp(tx, A)` devuelve
     la fila (el `RETURNING` pasa la política) y la guarda con A;
  2. con A fijada, `INSERT … ON CONFLICT ("dedupe_key") … DO NOTHING` con una clave que ya tiene un job
     de B: qué devuelve y qué le pasa a la fila de B (`design.md > §2.4`);
  3. `claimBatch` en plataforma ve los jobs de A, de B y sin empresa.
  - Hecho cuando: los tres resultados están anotados. Si el 1 o el 3 no se cumplen, se para y se
    corrige el diseño antes de T2.

## T2. La política de `jobs` (depende de T1)

- [x] **T2.1** Migración `20261025150000_jobs_por_empresa`, con `migration.sql` y `down.sql`
  (`design.md > §2.1`). Antes de crearla se comprueba que su timestamp es posterior a la última
  migración de `origin/dev`.
  - Hecho cuando: `pnpm run db:migrate` y después el `down.sql` y otra vez la migración dejan
    `pg_policies` de `jobs` con solo `jobs_por_empresa`; con el `down.sql` aplicado, solo
    `jobs_abierta`.
- [x] **T2.2** `tests/integration/db/jobs-por-empresa-migracion.test.ts` (R11).
  - Hecho cuando: está verde, y en rojo con la mutación de §6.

## T3. Clasificación y guardias de la base (depende de T2)

- [x] **T3.1** `lib/db/modelos-de-negocio.ts`: lista `MODELOS_CON_EMPRESA_OPCIONAL` con `Job`;
  `MODELOS_DIFERIDOS` vacía (`design.md > §5.1`). Se actualiza el comentario de cabecera con los
  conteos.
- [x] **T3.2** `organizacion-en-modelos.guardia.test.ts`: la lista nueva entra en la suma, y cada
  modelo de ella exige `organizacion_id` nulable y un índice que empiece por esa columna (R13, R14).
  - Hecho cuando: está verde con el esquema real, y en rojo con un esquema inventado donde `Job`
    pierde la nulabilidad o el índice.
- [x] **T3.3** `rls-por-empresa.guardia.test.ts`: comprueba también las tablas de empresa opcional, y
  añade la comprobación de políticas abiertas (`design.md > §5.2`, R9, R12, R13).
  - Hecho cuando:
    - está verde con las migraciones reales;
    - las tres autocomprobaciones de §5.2 están escritas y pasan;
    - si una tabla de negocio aparece con una política abierta heredada, está informado al leader
      (no se añade excepción).

## T4. Tests de `jobs` con dos empresas (depende de T2) [P]

- [x] **T4.1** [P] `tests/integration/db/jobs-por-empresa.test.ts`: R1, R2, R3, R4, R5, R7, R10.
  - Hecho cuando: está verde, y en rojo con las mutaciones (a), (b) y (c) de §6, cada una por
    separado.
- [x] **T4.2** [P] `tests/integration/db/jobs-drenador-dos-empresas.test.ts`: R6 (reclamo, `complete`
  y `fail` con reintento y con agotamiento).
  - Hecho cuando: está verde, y en rojo con su mutación.
- [x] **T4.3** [P] `tests/integration/db/geocode-salud-dos-empresas.test.ts`: R8.
  - Hecho cuando: está verde, y la mutación de §6 está anotada según SL-36 esté o no mergeado en la
    rama.

## T5. La carpeta de la empresa (depende de T1) [P con T2]

- [x] **T5.1** `lib/storage/carpeta-de-empresa.ts`: `RutaDeAlmacenInvalida`, `empresaDelAlmacen`,
  `rutaEnCarpeta`, `rutaRelativa` (`design.md > §3.3`).
- [x] **T5.2** `tests/unit/storage/carpeta-de-empresa.test.ts`: R17 (cada forma inválida, una por
  caso) y R18 (empresa, plataforma, sin contexto con sesión, sin contexto sin sesión).
  - Hecho cuando: está verde, y en rojo si se acepta `..` o si se resuelve empresa en plataforma.

## T6. Adaptadores (depende de T5)

- [x] **T6.1** `SupabaseFileStorage` y `SupabaseSignedUrlProvider` (`design.md > §3.2`), con la
  re-indexación por ruta relativa de `createSignedUrls` (R19).
- [x] **T6.2** `SupabaseAlmacenDescargas` y `SupabaseAlmacenEnviosWhatsapp`.
- [x] **T6.3** Borrar `lib/storage/getFile.ts`, que no tiene usos, después de comprobar con Grep que
  sigue sin tenerlos.
- [x] **T6.4** Ajustar los cuatro tests de `tests/unit/storage/`: corren dentro de `conEmpresa`,
  afirman la ruta completa que recibe el cliente y la relativa que se devuelve.
  - Hecho (T6) cuando:
    - `pnpm exec vitest related --run lib/storage/*.ts` está verde;
    - el comentario de cada interfaz de `lib/interfaces/external/` dice que la ruta es relativa a la
      carpeta de la empresa;
    - `typecheck` está verde sin tocar ninguna composition root.

## T7. Purga de descargas por empresa (depende de T6) [P]

- [x] **T7.1** `app/api/cron/purga-descargas/route.ts` con `paraCadaEmpresa` y `deps.empresas`
  (`design.md > §3.4`).
- [x] **T7.2** `tests/unit/api/cron-purga-descargas.test.ts` ampliado y `purga-descargas` añadido a
  `tests/unit/cron/crons-sin-empresas.test.ts`: dos empresas, una que falla, ninguna (R21).
  - Hecho cuando: está verde, y en rojo si se quita `paraCadaEmpresa`.

## T8. Guardia de acceso a Storage (depende de T6) [P]

- [ ] **T8.1** `EXCEPCIONES_DE_STORAGE` en `lib/db/excepciones-aislamiento.ts` (de momento vacía; el
  comando de T10 entra ahí) y `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts`
  (`design.md > §5.3`, R20).
  - Hecho cuando: está verde con el código real, y en rojo con el archivo inventado de la
    autocomprobación y con una excepción sin ficha.

## T9. Storage con dos empresas (depende de T6)

- [ ] **T9.1** `tests/integration/storage/storage-dos-empresas.test.ts` sobre el doble
  `e2e/_storage-falso/servidor.mjs`, con los cuatro adaptadores reales: R15, R16 (firmar, descargar y
  borrar desde B un objeto de A), R19 y R22.
  - Hecho cuando: está verde, y en rojo con la mutación de §6 (`rutaEnCarpeta` sin carpeta).

## T10. Lo ya guardado (depende de T6 y T8)

- [ ] **T10.1** `scripts/migrar-storage-a-carpetas.ts` (`design.md > §4`), con su entrada en
  `EXCEPCIONES_DE_PLATAFORMA` y en `EXCEPCIONES_DE_STORAGE` (ficha SL-19), y el script
  `storage:migrar-a-carpetas` en `package.json`.
- [ ] **T10.2** `tests/integration/storage/migrar-storage-a-carpetas.test.ts`: Postgres real con dos
  empresas, más el doble de Storage. Cubre R23 (modo de prueba sin efectos), R24 (después, B no ve lo
  de A y A firma lo suyo), R25 (segunda corrida sin cambios), R26, R27 y R28 (ida y vuelta).
  - Hecho cuando: está verde, y en rojo con las mutaciones (a) y (b) de §6.
- [ ] **T10.3** Correr el comando contra la base y el Storage **locales** (o el doble), sin y con
  `--aplicar`, y anotar los conteos en `progress/impl_SL-19.md`.
- [ ] **T10.4** **PUERTA HUMANA.** Correr el comando contra dev compartido, QA y producción (en
  producción, solo sin `--aplicar`) según el orden de `design.md > §4`, después del despliegue.
  - El agente no lo hace sin un OK explícito de Carlos, y depende de la pregunta abierta 2.
  - Hecho cuando: los conteos de cada entorno están anotados, y la corrida final sale en 0 salvo los
    huérfanos.

## T11. E2E (depende de T6)

- [ ] **T11.1** Revisar `e2e/_escenarios/reparto.ts` y `e2e/_escenarios/cierres.ts`: los adaptadores
  corren dentro de la empresa del escenario, y lo que se siembra en el doble va en su carpeta.
- [ ] **T11.2** Correr, uno a uno, los specs E2E que usan evidencias o comprobantes
  (`pnpm exec playwright test e2e/<archivo>.spec.ts`).
  - Hecho cuando: están verdes, o el rojo está identificado como previo a SL-19, con su evidencia.

## T12. Cierre

- [ ] **T12.1** `docs/architecture.md > Multi-empresa`:
  - una viñeta de `jobs`: política por empresa, quién ve los jobs sin empresa y por qué
    `dedupe_key` sigue global;
  - una de Storage: carpeta de la empresa en los adaptadores, rutas relativas en la base, la guardia
    de R20 y el comando de §4.
- [ ] **T12.2** `progress/impl_SL-19.md` con:
  - el mapa `R<n> → test`, con los 28 requisitos;
  - las mutaciones y su resultado;
  - las mediciones de T1.1 y los conteos de T10.3.
- [ ] **T12.3** `./init.sh` en verde.

## Archivos esperados

Datos:
- `db/migrations/20261025150000_jobs_por_empresa/migration.sql`
- `db/migrations/20261025150000_jobs_por_empresa/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`

Storage:
- `lib/storage/carpeta-de-empresa.ts`
- `lib/storage/SupabaseFileStorage.ts`
- `lib/storage/SupabaseSignedUrlProvider.ts`
- `lib/storage/SupabaseAlmacenDescargas.ts`
- `lib/storage/SupabaseAlmacenEnviosWhatsapp.ts`
- `lib/storage/getFile.ts`
- `lib/interfaces/external/IFileStorage.ts`
- `lib/interfaces/external/ISignedUrlProvider.ts`
- `lib/interfaces/external/IAlmacenDescargas.ts`
- `lib/interfaces/external/IAlmacenEnviosWhatsapp.ts`
- `app/api/cron/purga-descargas/route.ts`

Comando:
- `scripts/migrar-storage-a-carpetas.ts`
- `package.json`

Tests:
- `tests/integration/db/jobs-por-empresa.test.ts`
- `tests/integration/db/jobs-por-empresa-migracion.test.ts`
- `tests/integration/db/jobs-drenador-dos-empresas.test.ts`
- `tests/integration/db/geocode-salud-dos-empresas.test.ts`
- `tests/integration/storage/storage-dos-empresas.test.ts`
- `tests/integration/storage/migrar-storage-a-carpetas.test.ts`
- `tests/unit/storage/carpeta-de-empresa.test.ts`
- `tests/unit/storage/supabase-file-storage.test.ts`
- `tests/unit/storage/supabase-signed-url-provider.test.ts`
- `tests/unit/storage/almacen-descargas.test.ts`
- `tests/unit/storage/supabase-almacen-envios-whatsapp.test.ts`
- `tests/unit/api/cron-purga-descargas.test.ts`
- `tests/unit/cron/crons-sin-empresas.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/unit/guards/organizacion-en-modelos.guardia.test.ts`
- `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts`

E2E:
- `e2e/_escenarios/reparto.ts`
- `e2e/_escenarios/cierres.ts`

Docs y estado:
- `docs/architecture.md`
- `progress/impl_SL-19.md`
- `specs/SL-19-jobs-storage-por-empresa/requirements.md`
- `specs/SL-19-jobs-storage-por-empresa/design.md`
- `specs/SL-19-jobs-storage-por-empresa/tasks.md`
