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
