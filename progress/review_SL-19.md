# Review SL-19 «jobs-storage-por-empresa»

## Vuelta 1 (HEAD `ce24e26`, diff `origin/dev...HEAD`, 44 archivos)

Reviewer, 2026-10-25. Base `servi_logistic_sl19` (tests) y `servi_logistic_sl19_e2e` (E2E). El MCP del
grafo no tiene indexado este worktree (`list_projects` solo trae el de SL-36): exploré con Grep/Read.

### Verificación ejecutada (salida real)

- `pnpm run typecheck` → `CMD_EXIT=0`.
- `pnpm run lint` → `0 errors, 231 warnings`; ninguno en archivos del diff.
- `pnpm run test:guardias` → `Test Files 1 failed | 308 passed (309)`. El rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`.
- Tests de la feature (19 archivos: jobs, migración, drenador, geocode, storage unit e integración,
  crons, guardias, censo) → `Test Files 19 passed (19)`, `Tests 210 passed (210)`, sin skips.
- Ida y vuelta de SL-17/38/40, `integracion-migracion`, `catalogo-postgres-acota-esquema` → `5 passed`, `31 passed`.
- Regresión de integración (30 archivos: aislamiento-*, dos-empresas, job-repository-*, jobs-cola, siembras,
  whatsapp-envio-*, geocode, analytics) → `25 passed | 5 failed`. Los 5 están en `tests/baseline-rojos.json`
  y fallan por la base sin sembrar («no hay ningun usuario modelo», «catalogo local no tiene el estatus»).
- E2E `e2e/dos-empresas-humo.spec.ts` (checkpoint de proyecto: la feature toca `lib/db/`, un cron y la cola)
  → con `--no-deps`, `6 passed (2.1m)`. Con sus dependencias, el proyecto `plataforma-vacia` cae en
  `superadmin-empresas` paso 2 porque el `.env` local trae SMTP («Empresa creada, pero el correo… no
  salió» en vez de «El correo no está configurado»): es del entorno, no de SL-19. Puertos 3119/54319 libres al terminar.

### Mutaciones propias (todas restauradas; `git status --porcelain` vacío; política devuelta y tests en verde: `10 passed`, `94 passed`)

| # | Mutación | Resultado |
|---|---|---|
| RV1 | Política en la base: `ALTER POLICY "jobs_por_empresa" USING ("organizacion_id" IS NOT NULL OR …)` | ROJO 5 de 12: R1, R2, R5, R10 y el ciclo de R11. Restaurada con el `USING` original. |
| RV2 | `SupabaseSignedUrlProvider.createSignedUrl` firma `path` sin la carpeta | ROJO 5 de 82: R16 (dos casos), unit del provider, R24 y R28 del comando. |
| RV3 | `validarRuta` acepta `..` cuando no es el primer segmento (`segmento === ".." && ruta.startsWith("..")`) | **VERDE 73/73: sobrevive** (ver B1). |

### Checklist

**Especificación**
- [x] `requirements.md` con R1–R28 en EARS.
- [x] `design.md` con alternativas descartadas y su porqué (§2.3, §2.4, §3.6).
- [ ] `tasks.md` todo `[x]`: falta **T10.4**, la puerta humana posterior al merge (m7).
- [x] `design.md` abre con `## Lo que ya existe` (8 filas). El diff no re-crea nada de la lista: reutiliza M4, `conSuEmpresa`, la regla de `empresaEnCurso` y el doble de Storage, y borra `getFile.ts`, que nadie usaba.

**Equipo**
- [x] Assignee Carlos Restrepo y rama `feature/SL-19-…` (`progress/features/SL-19.md`).

**Trazabilidad**
- [x] Mapa R→test de los 28 en `progress/impl_SL-19.md`, con tests que existen y pasan.
- [ ] R17 verificado solo en parte: la cláusula «un segmento `..`» no se cubre cuando el `..` va en medio de la ruta (B1).

**Calidad de código**
- [x] Typecheck y lint sin errores.
- [~] `gate-completo`: lo dirá el CI. Lo que he corrido no deja rojos fuera del baseline.
- [x] Flujos críticos: los 11 E2E de evidencias y cierres (bitácora) y el humo de dos empresas (corrido aquí; m6).
- [x] Sin dependencias nuevas (`package.json` solo añade el script `storage:migrar-a-carpetas`).

**Seguridad y configuración**
- [x] Sin secretos. El comando imprime solo conteos y rutas de huérfanos, y de un error solo su `name`.
- [x] Buckets por los mismos `load*Config`; nada nuevo hardcodeado.

**Datos (checkpoints-proyecto)**
- [x] Migración nueva con `down.sql`. No edita ninguna aplicada; el timestamp `20261025150000` es posterior a la última de dev (`20261025120100`).
- [x] `jobs` con RLS por empresa; no queda ninguna política abierta (guardia y `pg_policies`: solo `jobs_por_empresa`).
- [x] Ningún literal de país ni moneda, y ningún recurso de Ordenex en el diff.
- [x] Sin `console.log` de secretos ni PII.

**Verificación final**
- [~] `./init.sh`: la bitácora da `INIT_EXIT=0`. Aquí corrí sus piezas (typecheck, lint, guardias, related) por separado.
- [ ] Veredicto OK: no (B1).

### Prioridades del encargo

**(a) Política de `jobs`.**
- `migration.sql` hace `DROP POLICY "jobs_abierta"` + `CREATE POLICY "jobs_por_empresa" FOR ALL TO servi_app`, con `USING` y `WITH CHECK` iguales a las de negocio, y todo en una sola transacción.
- `down.sql` hace la inversa exacta y deja `jobs_abierta` como la creó SL-17 M1.
- El ciclo up → down → up lo prueba `jobs-por-empresa-migracion` contra Postgres. Mi RV1 lo pone rojo.
- En la base no queda ninguna política abierta.
- La guardia tiene un hueco teórico: m2.

**(b) Drenador y consultas como `servi_app`.**
- El reclamo, el cierre y el re-agendado corren en `comoPlataforma`, es decir, como dueño y sin `FORCE`. Lo comprueba R6, con A, B y un job sin empresa.
- Los handlers corren en `conSuEmpresa`. El encolado hereda la empresa por el `DEFAULT`, y el `RETURNING` pasa la política (R4).
- Revisé todo el SQL sobre `jobs` fuera de `JobRepository`:
  - `GeocodeSaludRepository` lleva su filtro y además la RLS;
  - `WhatsappEnvioRepository.encendidosHoraFijaSinJobPendiente` y `jobsProgramadosPendientes` corren en el mantenimiento por empresa y en las pantallas de envíos, y los jobs `whatsapp_envio_programado` nacen en la empresa;
  - `scripts/drenar-jobs.ts` y las siembras corren en plataforma.
- No hay pantallas de salud ni scripts que cuenten `jobs` como `servi_app`. Ninguna consulta se queda sin filas en silencio en QA ni en prod, que nacieron con M4.
- El único caso degradado es una base anterior a M4 (dev local), y está documentado en design §2.2.

**(c) Storage.**
- La empresa sale siempre de `contextoActual()`, o de la sesión si no hay contexto. Nunca sale de la ruta.
- Los cuatro adaptadores aplican `rutaEnCarpeta` en cada operación.
- Se rechazan la ruta vacía, la `/` inicial, `\`, los segmentos vacíos y `.`/`..`. El código es correcto, pero el test de `..` es incompleto (B1).
- Desde B no se llega a A: R16 tiene 5 casos contra el doble real, y RV2 los pone rojos.
- `createSignedUrls` re-indexa por la ruta relativa y descarta lo que cae fuera de la carpeta (R19; la M12 del implementer).
- La guardia `storage-solo-por-adaptador` tiene huecos por alias y desestructuración (m1). Hoy ningún archivo los usa (Grep).

**(d) Comando `migrar-storage-a-carpetas`.**
- Sin `--aplicar`, ninguna rama llama a `upload` ni a `remove`: todas van detrás de `modo !== "prueba"` o de `modo === "aplicar"`.
- Es idempotente: comprueba si el destino ya existe y compara bytes por sha256 si están los dos.
- `--revertir` es la operación inversa, con ida y vuelta probada (R28).
- No imprime secretos.
- Aceptable: `--revertir` devuelve a la raíz **todo** objeto con fila que esté en la carpeta, también los subidos después de SL-19. Es lo que necesita una versión anterior de la app.

**(e) Desviaciones declaradas.** Todas aceptables:
1. **Censo de `verificar-rls-despliegue.ts` (77 → 78 políticas).** Aceptable y necesario: sin él, el script de despliegue saldría rojo en un despliegue correcto.
2. **`purga-descargas` añade `empresas: { procesadas, fallidas }`.** Aceptable:
   - es un campo añadido, y los dos de antes se conservan;
   - el único consumidor es el cron de `vercel.json`, que ignora el cuerpo;
   - es el patrón de `purga-pdf-cargas`, y `crons-sin-empresas` lo exige;
   - `fallidas` lleva ids de empresa, sin rutas ni PII.

   Queda pendiente actualizar design §7 y quitar la rama solo-para-tests (m3).
3. **R10 con claves de B y sin empresa** (la `dedupe_key` es global). Aceptable: es consecuencia de la pregunta 1, cerrada.
4. **Comentario desfasado en `GeocodeSaludRepository`.** Aceptable en su momento. SL-36 ya está mergeada, así que hoy se puede corregir (m4).
5. **T2.2 en la base compartida, en una transacción revertida con `LOCK TABLE`.** Aceptable: el test pasa y no deja nada.
6. **`SupabaseFileStorage.remove` ahora lanza `EmpresaNoResuelta`/`RutaDeAlmacenInvalida`.** Aceptable. `compensarEvidencias` corre en el mismo contexto que la subida, así que no enmascara el rollback.
7. **M11.b, además de M11.a.** Aceptable: mide justo lo que pide §6.
8. **Modo réplica al sembrar el test del comando.** Aceptable: va dentro de una transacción revertida y el comando solo lee `organizacion_id` y la ruta.
9. **`soloEmpresas`, más conteos que R23 y `--revertir` sin tocar temporales.** Aceptables: R23 es un mínimo, y los conteos de más (discrepancias, fallos) hacen más seguro el comando.

**(f) Despliegue: qué ve el usuario entre el merge y T10.4.** Lo he sacado leyendo el código; no lo he ejecutado contra QA.
- **Firma en lote** (evidencias en cierres, incidentes, mis asignaciones, devoluciones y API de órdenes): la ruta que no existe en la carpeta se omite. El usuario ve la fila **sin imagen ni enlace**, sin error.
- **Firma de un objeto** (comprobantes de wallet, abono, aporte y pago por cuenta; documentos de postulación; PDF de envíos por WhatsApp): el adaptador lanza `Error("fallo al firmar …")`. El usuario recibe el **error genérico controlado** (`withErrorHandler`/`ejecutar`), sin caída del proceso. Design §3.6 C lo describía como «no encontrado», y no lo es (m8).
- **API de PDF de etiquetas** (`ApiPdfEtiquetaService.porOrden`/`porCarga`): con la ruta ya persistida, re-firma y falla. Responde error (5xx) y **no regenera** el PDF hasta que se corre el comando.
- **Envíos por WhatsApp con PDF guardado y sin `mediaId`:** `almacen.leer` lanza y el job se reintenta con backoff. Si la ventana dura más que sus reintentos, acaba en dead-letter.
- **Purgas en la ventana** (m5):
  - `purga-pdf-cargas` borra `<org>/x` (no existe, es un no-op), limpia la referencia y deja el PDF viejo en la raíz como huérfano. El comando lo lista y no lo borra (R27);
  - el mantenimiento de WhatsApp marca como purgada la ejecución, pero el PDF sigue en la raíz, y el comando después lo **mueve** a la carpeta (lee `pdf_ruta` también de las purgadas), donde ya nadie lo borra;
  - los `tmp/` viejos de `descargas` los borra el comando (R26).
- **Producción:** sin empresas reales, sin efecto.
- **Recomendación para T10.4:** correr el comando justo después del despliegue en dev y en QA, o pausar antes los dos crons de purga.

**(g) Trazabilidad.**
- Los 28 R tienen su test, y todos pasan.
- Mutaciones propias: la política (RV1) y el prefijo (RV2) mueren. El rechazo de `..` en medio de la ruta (RV3) **sobrevive** (B1).

**(h) Censos.**
- `verificar-rls-despliegue.ts` y su test unitario están actualizados (78/151/77).
- En `tests/integration/db/` ningún censo cuenta `jobs_abierta` ni el total de políticas: los ida y vuelta de SL-17/38/40 aplican solo las migraciones previas, y los 5 pasan.
- `organizacion-en-modelos` y `rls-por-empresa` ya clasifican `Job` como de empresa opcional.

### Hallazgos

**B1 — BLOQUEANTE.** R17 no está verificado para un segmento `..` que no va al principio de la ruta.
- **Dónde:** `tests/unit/storage/carpeta-de-empresa.test.ts:25-26`.
- **Qué falla:** los únicos casos con `..` son `"../<A>/foto.jpg"` y `".."`. RV3 cambia `lib/storage/carpeta-de-empresa.ts:49` por `segmento === "." || (segmento === ".." && ruta.startsWith(".."))`, que acepta `orden-1/../../<A>/foto.jpg`. Pasa en verde `tests/unit/storage` y `storage-dos-empresas` (73/73).
- **Por qué importa:** es la única defensa de R16 por construcción. Un refactor de `validarRuta` que mire solo el prefijo pasaría el gate.
- **Arreglo:** añadir al `it.each` de R17 al menos `["segmento .. en medio", "orden-1/../../" + ORG_A + "/foto.jpg"]` y `["segmento .. al final", "orden-1/.."]`. Si es posible, también un caso en `storage-dos-empresas.test.ts` (R16): firmar desde B `x/../../<A>/<ruta>` se rechaza sin llamar a Storage. Luego, matar el test con RV3 y anotarlo en la bitácora.

**m1 — menor.** La guardia `storage-solo-por-adaptador` no ve los accesos por alias.
- **Dónde:** `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts:35`.
- **Qué no ve:** `const { storage } = createServerClient(); storage.from(…)`, ni `const s = supabase.storage; s.from(…)`. Tampoco un `StorageClient` de `@supabase/storage-js`, ni archivos de la raíz (`middleware.ts`).
- **Hoy:** nadie los usa (Grep).
- **Arreglo:** casar también `\bstorage\s*\}\s*=\s*create\w*Client` y `=\s*\w+\.storage\s*;`, con su autocomprobación.

**m2 — menor.** La guardia RLS solo cuenta las políticas con `TO … servi_app`.
- **Dónde:** `tests/unit/guards/rls-por-empresa.guardia.test.ts:67`.
- **Qué no ve:** una `CREATE POLICY … USING (true)` sin `TO`, o con `TO PUBLIC`, que también aplica a `servi_app` y la abriría sin que la guardia lo note.
- **Hoy:** no hay ninguna en `db/migrations` (Grep).
- **Arreglo:** tratar la ausencia de `TO` y `TO PUBLIC` como «para servi_app», con su autocomprobación.

**m3 — menor.** `app/api/cron/purga-descargas/route.ts:88` y design §7 no cuadran con el código.
- La rama `if (deps.service !== undefined && deps.empresas === undefined) return corrida()` existe solo para los tests de controller anteriores, y corre fuera de toda empresa. Mejor que esos tests pasen `empresas` y quitar la rama.
- Design §7 (`specs/…/design.md:418`) sigue diciendo que la respuesta no cambia: hay que actualizarlo con `empresas`.

**m4 — menor.** El comentario de `lib/repositories/GeocodeSaludRepository.ts:42` y `:75` dice que la política de `jobs` «está abierta hasta SL-19». Ya no lo está, y SL-36 ya está en `dev`: se puede corregir sin choque.

**m5 — menor.** Las purgas, en la ventana entre el despliegue y T10.4, dejan vivos objetos que tendrían que borrar (ver (f)).
- `PurgaPdfCargasService.ts:78` limpia la referencia de un PDF que sigue en la raíz.
- `whatsapp-envio-mantenimiento-handler.ts:66-67` marca como purgada una ejecución cuyo PDF el comando moverá después.
- **Arreglo:** documentar en T10.4 que el comando se corre justo después del despliegue, o que se pausan esos crons. Opcional: que el comando salte las ejecuciones con `pdf_purgado_at` y las cuente aparte.

**m6 — menor.** La bitácora no recoge el E2E `dos-empresas-humo`, que exige `docs/checkpoints-proyecto.md` (la feature toca `lib/db/`, un cron y la cola). Lo corrí en esta revisión (6 passed con `--no-deps`). Anotarlo en `progress/impl_SL-19.md`.

**m7 — menor.** T10.4 está abierta (`tasks.md:119`). Es la puerta humana posterior al merge y no se puede hacer antes. La feature no puede pasar a `done` hasta cerrarla.

**m8 — menor.** Design §3.6 C y §4 dicen que en la ventana un archivo antiguo da «no encontrado». En la firma de un objeto da un error genérico (5xx o error de la action), y en la API de PDF de etiquetas no se regenera. Conviene corregir el texto, para que quien apruebe T10.4 sepa lo que ve el usuario.

### Veredicto

**RECHAZADO** por B1. Es un test que falta, no un fallo del código. Con B1 resuelto y matado con su mutación,
lo demás son menores y no bloquean.
