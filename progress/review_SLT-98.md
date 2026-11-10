# review SLT-98 «Reporte de bugs: imágenes»

Reviewer, F2.2, 2026-11-10. Worktree `.worktrees/SLT-98-reporte-bugs-imagenes`, rama
`feature/SLT-98-reporte-bugs-imagenes`, HEAD `4c4bbf89` (el código es el de `f0a2f89e`; después solo hay
docs). Base `origin/dev`. Ruta completa: toca almacenamiento, permisos y migración.

## Verificación ejecutada (por mí, sobre HEAD)

- `.env` del worktree: `DATABASE_URL` apunta a `localhost:5432/servi_logistic_slt98`, y las cuatro
  variables SUPABASE están vacías. Ninguna apunta a una base remota ni a un recurso de Ordenex.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm exec eslint --max-warnings=0` sobre los 29 `.ts/.tsx/.mjs` del diff: exit 0.
- vitest de los 11 archivos de test tocados, con la base `servi_logistic_slt98`: 11/11 archivos y
  197/197 tests, sin saltados. `bug-report.test.ts` corrió contra la base.
- Guardias y censos de esquema contra la misma base: 15/15 archivos y 265/265 tests, sin saltados.
  - `schema-drift-saneamiento`, `nucleo-sin-modulos`, `catalogo-postgres-acota-esquema` y
    `consultas-concurrentes-en-transaccion`;
  - `storage-solo-por-adaptador`, `plataforma-solo-en-lista`, `rls-por-empresa` y `organizacion-en-modelos`;
  - `superficie-de-uso`, `modulos-reparto`, `nombres-estado-retirados`, `censo-order-status-rename`,
    `pais-sin-literales`, `e2e-sin-saltos` y `analytics/aislamiento`.
- `node scripts/tamano-pr.mjs`: AVISO, no rojo. Da 34/40 archivos y 3374/1000 líneas, y lo acepta la
  línea `tamano-pr-aceptado` de `progress/features/SLT-98.md`, que ya da la cifra real.
- No corrí:
  - `./init.sh`, la suite completa ni `test:guardias` entero (regla de la sesión);
  - el E2E. Me baso en las dos corridas que el implementer pegó en `impl_SLT-98.md`: 21 passed ×2,
    0 failed, 0 skipped, 0 flaky. Corrieron sobre un build de `873b4d67`. Después solo cambiaron el spec
    E2E y `docs/architecture.md`, así que el código probado es el final.
  - Tampoco comprobé la RLS a mano: no hay `psql`. Lo cubre `bug-report.test.ts` («con servi_app, SELECT,
    INSERT, UPDATE y DELETE de bug_report_image dan 42501»), que pasó contra la base.

## Checklist

### Ruta y especificación
- [x] Ruta completa, correcta para almacenamiento, permisos y migración (`complexity` medium).
- [x] `requirements.md` tiene R1–R23 en EARS.
- [x] `design.md` tiene `## Lo que ya existe` con la búsqueda hecha, y §12 con las alternativas
      descartadas.
- [x] El diff no re-crea nada de «Lo que ya existe»:
  - reutiliza `carpeta-de-empresa`, el patrón de creación perezosa del bucket, el contrato parcial de
    `SupabaseSignedUrlProvider`, `componerCorreo` y el doble de Storage;
  - `tipoPorFirma` es nuevo, pero no había en el repo ningún detector de firma de bytes (lo busqué).
- [ ] **Todas las tasks en `[x]`: T11 sigue en `[ ]`.** Ver B1.

### Tamaño y equipo
- [x] `tamano-pr` en aviso, con la aceptación humana de la cifra real.
- [x] Rama `feature/SLT-98-reporte-bugs-imagenes`, con assignee en la ficha (Camilo).

### Trazabilidad
- [x] `impl_SLT-98.md` tiene el mapa R → test.
- [x] Cada R1–R23 tiene al menos un test concreto que existe con el nombre del mapa y afirma lo que pide
      el requisito. Lo comprobé abriendo cada test. R17 no tiene test, como dice `tasks.md`, y lo revisé
      en el diff de `.env.example`: lleva `BUG_REPORT_BUCKET=` y un comentario que da el valor por
      defecto `bug-reports` y dice que la app lo crea sola, privado, con 5 MB y solo PNG, JPG y WebP.
      Cumple.

### Calidad de código
- [x] Typecheck y lint en verde (los corrí yo, ver arriba).
- [ ] `gate-completo` de CI: pendiente, porque aún no hay PR.
- [x] El flujo tiene E2E (`reporte-de-bugs.spec.ts`, `describe` «SLT-98 — imágenes»), con su salida
      local en la bitácora.
- [x] No entra ninguna dependencia: ni `package.json` ni el lockfile están en el diff.

### Seguridad y configuración
- [x] No hay secretos en el código. El bucket sale de `BUG_REPORT_BUCKET` y los límites de
      `lib/config/reporte-bug.ts`.
- [x] No hay webhooks.

### Proyecto (`docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`)
- [x] La tabla nueva tiene RLS. `bug_report_image` no lleva `organization_id`, a propósito: es de
      plataforma (está en `MODELOS_DE_PLATAFORMA`, con RLS sin políticas y `REVOKE ALL` a `servi_app`), y
      la empresa se lee de `bug_report`, igual que en `bug_report_status_change` (SLT-97 «Reporte de bugs:
      módulo del superadmin»). Las guardias de clasificación están en verde.
- [x] La migración trae `down.sql` (`DROP TABLE IF EXISTS`, y declara la pérdida del dato) y no edita
      ninguna migración aplicada. La ida y vuelta (deploy → rollback → deploy) y el `migrate diff` vacío
      están en la bitácora.
- [x] Ni literales de país o moneda, ni recursos de Ordenex.
- [x] Los logs solo llevan el nombre de la causa y el id del reporte: ni PII ni URLs firmadas.
- [x] Las capas son correctas:
  - la lógica, en `ReporteBugService` y `ReportesBugPlataformaService`;
  - los datos, en `BugReportRepository`;
  - el borde, en Server Actions con zod `.strict()`;
  - Storage, solo por el adaptador.
- [x] Los permisos se validan en el servidor. `prepararSubidas` y `enviar` se cierran a quien no es usuario
      de empresa, y `detalle` a quien no es de plataforma.
- [~] E2E en local: hay constancia de `reporte-de-bugs` ×2 sobre el código final. El grupo `aislamiento`
      entero (que incluye `dos-empresas-humo`) no se corrió en local. Se acepta que lo corra la matriz
      `e2e-grupo` del CI en el PR a `dev`, como en SLT-97 «Reporte de bugs: módulo del superadmin»
      (vuelta 2). Ver B1.
- [x] Los comentarios explican el porqué: el orden en serie, el reintento único, por qué no hay upsert y
      por qué se usa `<img>`.

## Foco de seguridad (lo que pidió el leader)

- **Ruta `<org>/<usuario>/<imagenId>.<ext>`:**
  - la arma siempre el servidor (`rutaDeImagen` con `actor.usuarioId`, y `EXTENSION_POR_TIPO`);
  - la empresa la pone el adaptador con `conEmpresa(org del actor)`;
  - la entrada solo declara tipo y tamaño (al pedir permiso), o id uuid y tipo (al enviar).

  Si alguien manda el `imagenId` de otro usuario, la ruta apunta a la carpeta propia, donde ese archivo
  no está: sale `imagenes_invalidas`. El `CHECK storage_path_forma` y el `UNIQUE (storage_path)` son la
  segunda red.
- **Subida:**
  - `createSignedUploadUrl` va sin upsert, así que el token vale solo para su ruta y no pisa un objeto que
    ya existe;
  - no hay ninguna lectura con ese token;
  - el doble lo modela así y su contrato lo prueba con el caso R9 de `storage-falso`.
- **Validación en el servidor (R10):**
  - `leer` baja el objeto y comprueba `1 ≤ bytes.length ≤ IMAGEN_BYTES_MAX` (5 242 880) y que
    `tipoPorFirma(bytes) === tipo`;
  - la extensión de la ruta sale del tipo, así que un tipo cambiado entre el permiso y el envío da «no
    existe»;
  - el tamaño que se guarda es el medido.
- **Bucket:**
  - si falta, se crea con `public: false`, `fileSizeLimit: IMAGEN_BYTES_MAX` y los tres tipos;
  - un «already exists» o un 409 se toleran, y se reintenta una sola vez;
  - ninguna operación pide una URL pública (la superficie del cliente no la expone, y hay un test).
- **Enlaces de 24 h:**
  - el correo usa `ENLACE_CORREO_SEGUNDOS`: se firman una vez y van iguales a cada destinatario;
  - el detalle usa `ENLACE_DETALLE_SEGUNDOS`, con `conEmpresa(organizacionId leído de la base)` y en
    cada carga (el E2E comprueba que el `src` cambia al recargar);
  - el DTO no lleva rutas ni empresa;
  - la respuesta del envío es exactamente `{ status: "enviado" }`.
- **La empresa nunca lee:**
  - en la base, RLS sin políticas y `REVOKE ALL` a `servi_app`, con 42501 probado contra la base;
  - en Storage, el bucket es privado y solo lo toca el service role del servidor.
- **Migración:**
  - los identificadores están en inglés;
  - los CHECK (`position` 1–5, tipo, tamaño 1 B–5 MB, forma de la ruta) están probados también como
    dueño;
  - la cascada desde `bug_report` funciona;
  - el `down.sql` es seguro y los cuatro censos y guardias de esquema están en verde.
- **El doble de Storage es coherente con Supabase:**
  - `POST /object/upload/sign` responde una `url` relativa a `/storage/v1`, que es lo que espera
    storage-js;
  - el token dura 2 h, está atado a su ruta y no amplía el upsert;
  - el `PUT` va sin `apikey`;
  - sin bucket responde 400 con `statusCode "404"`, y aplica los límites del bucket con 413 y 415;
  - responde CORS en todas las respuestas.

  Lo único que no se puede comprobar en local, el gateway y el CORS reales y el error de bucket
  inexistente en `createSignedUploadUrl`, es justo lo que design §15 deja para la comprobación en
  preview.

## Hallazgos

### B1 — BLOQUEANTE: T11 sigue en `[ ]`

**Dónde:** `specs/SLT-98-reporte-bugs-imagenes/tasks.md`, T11.

`CHECKPOINTS.md` (ruta completa) pide todas las tasks en `[x]`. De lo que T11 pide como «Hecho», el
implementer cumplió su parte:
- E2E ×2 sobre el código final;
- `tamano-pr` en aviso con la aceptación;
- el subpunto de `docs/architecture.md`.

Faltan tres cosas que no son suyas:
1. El grupo `aislamiento` entero. Lo corre CI (`e2e-grupo`) en el PR a `dev`.
2. `gate-completo`. También CI.
3. La comprobación contra Supabase real en el preview (design §15). La hacen el humano o el leader antes
   del merge, y solo se puede hacer con el PR abierto.

**Qué falta para cerrarlo:** lo mismo que se aceptó en la vuelta 2 de SLT-97 «Reporte de bugs: módulo
del superadmin»:
- marcar T11 `[x]` con las salvedades escritas en la propia task: `aislamiento` y `gate-completo` quedan
  para CI, y la comprobación en preview para el humano o el leader antes de pedir el merge;
- anotar esa comprobación como condición de merge en `progress/features/SLT-98.md`.

Es un commit de docs. La vuelta 2 puede acotarse a ese rango.

### m1 — menor: sin tope de permisos por usuario o por tiempo

R9 limita a 5 los permisos por petición, pero nada impide pedir permisos una y otra vez y llenar el
bucket de objetos sin fila (5 MB cada uno) sin enviar nunca un reporte. El spec no lo pide, y P1 aceptó
que queden imágenes sueltas («sin purga»). Aun así, es una vía de abuso por parte de un usuario
autenticado. Propuesta: anotarlo en `progress/deudas.md` (rate limit o purga de objetos sin fila más
viejos que X).

### m2 — menor: un bucket que ya existía no se revisa

Si `BUG_REPORT_BUCKET` apunta a un bucket que ya existe y no tiene límites o es público, el adaptador lo
usa tal cual («un bucket que ya existe no se toca»). Los límites de R16 solo se cumplen si lo crea la app.
El servidor sigue validando el tamaño y la firma, pero:
- `leer` bajaría entero un objeto de más de 5 MB antes de rechazarlo;
- el `content-type` guardado lo fija el `PUT` del navegador y no se comprueba (`download` da `Blob.type`),
  así que con un bucket sin `allowed_mime_types` se podría servir, por el enlace firmado, un objeto con
  prefijo PNG y `content-type: text/html`. Se serviría desde el origen de Storage, no desde el de la app.

Ningún R lo pide. Propuesta: en la comprobación en preview, mirar que el bucket creado tenga los límites;
como mejora futura, comprobar `Blob.type === tipo` en `leer`.

### m3 — menor: el design se editó después de aprobado

`e80aab41` cambia la redacción del design (§15, §5.2 y §9.1) para alinearla con el código: el nombre del
estado y del log por las guardias, y qué test de SLT-97 cambia. No cambia ningún requisito ni ninguna
decisión. Lo acepto. Solo lo anoto para que el humano lo vea en el PR.

## Desviaciones que anotó el implementer

- **`EnviarReporteBugInput` y `EnviarReporteBugDatos`** (`z.input` y `z.output`): son necesarios por el
  `.default([])` de `imagenes`, que mantiene compatible la entrada de SLT-87 «Reporte de bugs: botón
  flotante y envío». Son correctos y no merecen cambio.
- **Dos archivos fuera de «Archivos esperados»**
  (`tests/unit/components/reportes-plataforma-page.test.tsx` y
  `tests/unit/actions/reportes-bug-plataforma-action.test.ts`): solo cambian para compilar, y están
  anotados en `tasks.md`. Sin cambio.
- **Propuestas de T5** (el `file_size_limit` del doble solo en bytes, el upsert que manda el token y el
  segundo `PUT` que da 409): son más estrictas que lo que el spec fija y coherentes con Supabase. Sin
  cambio.
- **Propuestas de T9:**
  - «Reintentar» queda deshabilitado si otra imagen tiene un error que solo admite «Quitar». Es coherente
    con R7, porque «Enviar» ya estaría bloqueado.
  - El scroll interno del panel, la caja sin vista previa y el `aria-label` del input están bien.

  Sin cambio.
- **Propuestas de T10** (la numeración por posición aunque una imagen falle y el caso del orden de los
  bloques): bien. Sin cambio.

## Veredicto

**RECHAZADO** por un solo bloqueante de proceso (B1: T11 en `[ ]`), que se cierra con un commit de docs.
El código y los tests cumplen R1–R23:
- el modelo de seguridad de la subida, la validación, el bucket, los enlaces y la migración es correcto;
- typecheck, lint, los 11 archivos de test (197/197) y las 15 guardias y censos (265/265) pasan en
  verde.

m1–m3 no bloquean.

## Vuelta 2 (acotada a 253a521a..9399854a)

Reviewer, F2.2 vuelta 2, 2026-11-10. HEAD `9399854a`. Alcance: el cierre de B1 (`68fc1fe9`) y la
enmienda del tope diario (m1 → R24–R31, design §16, T12–T16). Decisiones cerradas del humano, que no se
reabren aquí: tope blando de 21 (máx. 25), día calendario en la zona del país de la empresa, cuentan los
permisos concedidos, sin cupo se envía solo el texto sin aviso, se devuelve el cupo si Storage falla,
tamaño aceptado y E2E «Solo CI».

### Verificación ejecutada (por mí, sobre HEAD)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .`: exit 0.
- `pnpm exec eslint` sobre los `.ts/.tsx` del diff: sin salida, es decir, sin errores.
- vitest con la base local `servi_logistic_slt98`:
  - `bug-report.test.ts` (integración), `reporte-bug-service.test.ts`, `reporte-bug-action.test.ts` y
    `ReporteBugBoton.test.tsx`: 4/4 archivos y 115/115 tests;
  - guardias `api-key-dependencias-usuario`, `organizacion-en-modelos`, `pais-sin-literales`,
    `plataforma-solo-en-lista`, `rls-por-empresa`, `e2e-sin-saltos` e `historico-sin-migracion`: 7/7
    archivos y 136/136 tests;
  - censos de esquema y RLS (`nucleo-sin-modulos`, `schema-drift-saneamiento`,
    `verificar-rls-despliegue` y los de `tests/integration/db/*rls*` y `*plataforma*`): 8/8 archivos y
    101/101 tests.
- `node scripts/tamano-pr.mjs`: AVISO, no rojo. Da 36/40 archivos y **4171**/1000 líneas, con la línea de
  aceptación presente (ver m6).
- `20261112120000_bug_report_image` no está en `origin/dev`. Por eso ampliarla, en vez de crear una
  migración nueva, no edita una migración ya aplicada (`docs/checkpoints-proyecto.md`).
- No corrí `./init.sh`, la suite completa, `next build` ni el E2E (regla de la sesión). El E2E nuevo
  (`e2e/reporte-de-bugs.spec.ts:740`) lo leí línea a línea; no se ha ejecutado nunca.

### Checklist

- [x] B1 de la vuelta 1: T11 está en `[x]` con sus salvedades, y la condición de merge (preview contra
  Supabase real, más `gate-completo` y los grupos E2E de CI) está en `progress/features/SLT-98.md`.
- [x] Trazabilidad R24–R31: cada uno tiene al menos un test real, que pasó (salvo el E2E, que solo está
  escrito).
  - R24: `bug-report.test.ts`, «5+5+5+5 da 20 y 1 más da 21» y «con 20, consumir 5 da 25»; en el
    servicio, la fecha de la zona del país (05:30 UTC → día anterior en CR) y el caso de país sin zona,
    que lanza sin consumir; en la action, ese caso responde `error`.
  - R25: con 21 y con 25 da `null` sin escribir; el servicio da exactamente `{status:"sin_cupo_imagenes"}`
    sin tocar el almacén; la action la pasa tal cual.
  - R26: «30 simultáneos de 1 sin fila → 1..21 y 9 null» y «2×5 con 19 → solo 24». Los dos usan un
    cerrojo real con `carreraContraCerrojo` (una fila sin confirmar o un `FOR UPDATE`) y un cliente con
    varias conexiones: no dependen de la suerte.
  - R27: en el repositorio, `GREATEST(…,0)` y el caso sin fila; en el servicio, devuelve y relanza, y si
    la devolución falla, registra y relanza el error original.
  - R28: `enviar` no toca el cupo; el panel solo pide permisos para la imagen que falló.
  - R29: tres tests del panel: sin cupo, en un reintento sin cupo y sin cupo con fallo del envío.
  - R30: en el servicio y en el E2E.
  - R31: con `servi_app`, SELECT, INSERT, UPDATE y DELETE dan 42501 y la tabla tiene RLS; un campo de
    más en la entrada de la action da `validation_error`.
- [x] Corrección del contador.
  - `INSERT … ON CONFLICT ("user_id","day") DO UPDATE … WHERE permits_granted < ${tope} RETURNING` es una
    sola sentencia. Con READ COMMITTED, el `DO UPDATE` bloquea la fila y vuelve a evaluar el `WHERE`
    sobre la última versión. Dos `INSERT` de una fila que aún no existe se ordenan por el índice único, y
    el segundo cae en la rama `DO UPDATE`.
  - El `WHERE` mira el conteo de antes, que es lo que pide el tope blando.
  - La fecha va como texto con `::date`, y el tope entra como parámetro.
  - Sigue el molde de `AsistenteUsoRepository`, que está en «Lo que ya existe».
- [x] Devolución (R27): `consumir` va antes del almacén y `devolver` en el `catch`, con la misma `fecha`
  aunque haya pasado la medianoche. Gana el error del almacén.
- [x] Migración.
  - Tabla `bug_report_upload_quota` con PK `(user_id, day)` y `CHECK (permits_granted >= 0)`.
  - FK a `usuario` con CASCADE.
  - `ENABLE ROW LEVEL SECURITY` sin políticas y `REVOKE ALL … FROM servi_app`.
  - Sin `updated_at`, a propósito.
  - `down.sql` borra las dos tablas en orden y declara la pérdida de datos.
  - Esquema Prisma coherente; la tabla está en `MODELOS_DE_PLATAFORMA` y la FK en
    `CLASIFICACION_FK_USUARIO`. Las guardias de esquema están en verde.
- [x] La regla del proyecto (sin literales de país en `lib/**`) se cumple: el servicio corta el día con
  `zonaDeLaEmpresa` y `fechaCalendario`, no con `fechaCalendarioCR`.
- [ ] **Tasks: T16 sigue en `[ ]`** → B2.
- [~] E2E de los grupos afectados en local (`docs/perfil-agentes.md > reviewer`): lo sustituye la
  decisión «Solo CI» del humano. No es hallazgo, pero el verde del grupo `aislamiento` en el PR es
  condición de merge.

### El E2E nuevo, leído con lupa (`e2e/reporte-de-bugs.spec.ts:740`)

- **Correcto.**
  - La siembra la hace `abrirBaseE2E()` como dueño (no `servi_app`), así que la RLS sin políticas no la
    estorba.
  - `ON CONFLICT … SET 21` deja el conteo en 21 haya corrido antes el test de las imágenes o no.
  - Recorrido en el panel: «subiendo» → `sin_cupo_imagenes` → `restaurarEstados` → envío con
    `imagenes: []` (el zod acepta `[]`) → «Gracias», que es `role="status"`. `getByRole("alert")` cuenta
    0 porque no hay error de imagen ni fallo.
  - Después del éxito, el campo queda vacío y el contador en «0/5 imágenes» (R8).
  - `peticionesStorage` sin PUT, porque el panel nunca llega al `fetch`.
  - Un solo reporte con `images: []`, y el conteo sigue en `[{dia, 21}]`.
- **Determinista y aislado.**
  - `playwright.config.ts` tiene `workers: 1` y `fullyParallel: false`, y el test va después del de las
    imágenes en el mismo `describe`, así que este último ya no puede encontrar el cupo lleno.
  - La empresa (y su maestro) la crea el `beforeAll` de este archivo; ningún otro spec usa ese usuario.
  - El `finally` borra todas las filas del maestro, también si el test falla o se reintenta.
  - La empresa es CR: `paisId` vale `"CR"` por defecto en la fábrica y en el esquema. Por eso
    `'America/Costa_Rica'` en la siembra coincide con la zona que usa el servidor. Es un dato de prueba
    dentro de `e2e/`, fuera del alcance de `pais-sin-literales`, y design §16.6 lo justifica.
- **Riesgo residual:** la medianoche de CR (06:00 UTC). Si la siembra cae en un día y la petición en el
  siguiente, el servidor ve el cupo vacío, concede, hay PUT y el test falla. La ventana es de segundos.
  Ver m5.

### Hallazgos

#### B2 — BLOQUEANTE: T16 sigue en `[ ]`

**Dónde:** `specs/SLT-98-reporte-bugs-imagenes/tasks.md`, T16.

`CHECKPOINTS.md` pide todas las tasks en `[x]`. Es el mismo caso que B1 de la vuelta 1, y se cierra igual:
- marcar T16 `[x]` como «cerrada con salvedades»: el E2E del tope está escrito pero no se ha ejecutado,
  y lo ejecuta el grupo `aislamiento` de CI (decisión «Solo CI»);
- en `progress/features/SLT-98.md > Condición de merge`, decir de forma explícita que el grupo
  `aislamiento` tiene que pasar en verde, con 0 failed, 0 skipped y 0 flaky, **incluido el test nuevo
  «con el cupo del día lleno…»**, y que el enlace a esa corrida va a `impl_SLT-98.md`. Hoy la condición
  dice solo «grupos E2E de CI en verde».

Es un commit de docs. De paso puede llevar m4 y m6.

#### m4 — menor: tres comentarios y la documentación de arquitectura siguen con el «día» de antes

La decisión vigente es la zona del país de la empresa (R24, design §14 y §16.1). Estos textos no la
siguen:
- `docs/architecture.md` (viñeta «Tope diario») dice «día calendario de Costa Rica». Design §14 dice «la
  zona del país de su empresa».
- `db/migrations/20261112120000_bug_report_image/migration.sql:61` y `db/schema.prisma:6587` dicen «el
  día calendario del servidor».
- `lib/interfaces/repositories/ICupoImagenesReporte.ts` dice «la del día del servidor».

El código hace lo correcto; los textos engañan. Se arregla con un cambio de redacción. Los comentarios de
la migración se pueden cambiar mientras no esté en `dev`.

#### m5 — menor: el E2E del tope puede fallar si cruza la medianoche de CR

Es la propuesta del implementer. La probabilidad es muy baja, pero sería un falso rojo en CI. Basta con
anotarlo como riesgo conocido en el propio test o en `impl_SLT-98.md`. Si alguna vez falla a las ~06:00
UTC, la primera sospecha es esta. No pido cambiar el test.

#### m6 — menor: el tamaño real ya es 4171, por encima de las 4151 aceptadas

El gate da AVISO porque existe la línea `tamano-pr-aceptado`, pero T16 dice: «si la cifra real pasa de
ahí, el leader vuelve al humano». Son 20 líneas, del test de R24 de `9399854a`. Toca actualizar la cifra
en la línea de aceptación, con un aviso breve al humano.

### Propuestas del implementer (vuelta 2)

- La zona del país en vez de `fechaCalendarioCR`: ya la decidió el humano y es correcta (la guardia
  `pais-sin-literales` la exige).
- El nombre del `CHECK` (`…_permits_granted_no_negativo`): bien.
- `tests/fixtures/api-key-dependencias-usuario.ts` fuera de «Archivos esperados», con
  `BugReportUploadQuota.user` en `no_alcanzable`: el motivo es correcto. La única escritura sale de la
  action con el usuario de la sesión, y no hay ruta de API ni cron. Sin cambio.
- Mientras espera los permisos, el panel muestra «Subiendo imágenes…» y, sin cupo, restaura los estados:
  coherente con R29 («no marcar ninguna imagen»). Sin cambio.
- Lo que añade el E2E (el paso 5 compara todas las filas del maestro, el paso 2 comprueba R8, el paso 4
  comprueba `reporterUserId`, y el `finally` borra todas las filas del maestro): bien. El riesgo de la
  medianoche es m5.

### Veredicto de la vuelta 2

**RECHAZADO**, solo por B2 (T16 en `[ ]`), que es de proceso y se cierra con un commit de docs, igual
que B1.
- El código del tope cumple R24–R31: el contador es atómico en la base, la devolución es correcta, y la
  migración tiene RLS sin políticas, el `REVOKE`, el `CHECK` y el `down.sql`.
- Typecheck, lint, 115/115 tests de lo tocado y 237/237 de guardias y censos, en verde.
- El E2E nuevo se ve correcto y determinista salvo el borde de m5, pero no se ha ejecutado: su verde en
  CI es condición de merge.
- m4–m6 no bloquean. Si se quiere, m4 y m6 van en el mismo commit que B2.
