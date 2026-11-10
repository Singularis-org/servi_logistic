# impl SLT-98 «Reporte de bugs: imágenes»

Implementer, F2.1, 2026-11-10. Worktree `.worktrees/SLT-98-reporte-bugs-imagenes`. Entrega 3 de 3.

## Entorno
- `.env` del worktree copiado del principal, con `DATABASE_URL` a `servi_logistic_slt98` (Postgres local,
  localhost:5432) y vacías las cuatro variables SUPABASE y `PRISMA_LOG_QUERIES` (el principal apunta a
  un proyecto remoto; no se usa). El almacenamiento se prueba con el doble `e2e/_storage-falso/`.
- Bases propias recreadas con `DROP/CREATE`: `servi_logistic_slt98` y `servi_logistic_slt98_e2e`. Las dos
  con `prisma migrate deploy` (hasta `20261111120000_bug_report_status`) y `db:seed` («Seed de catalogos
  completado (rol, order_status, vehiculos).»).
- `pnpm install --frozen-lockfile` (3 min 17 s, sin dependencias nuevas) y `prisma generate`.
- `origin/dev` no trae migraciones posteriores a `20261111120000`: el timestamp `20261112120000` vale.

## Tareas

### T1–T4 — backend_dev — commits 77a2ebe1 (T1), 87db13a7 (T2), 214d55fa (T3), 02eaf108 (T4)
- T1 `db/schema.prisma` (`BugReportImage`, inverso `images`, alineado a mano, sin `prisma format`) y
  `db/migrations/20261112120000_bug_report_image/{migration,down}.sql`. `prisma validate` válido.
  Ida y vuelta en `servi_logistic_slt98`: `migrate deploy` aplica → `db:rollback` «Rollback completado:
  20261112120000_bug_report_image» → `migrate deploy` «All migrations have been successfully applied».
  `migrate diff --from-config-datasource --to-schema db/schema.prisma --script --exit-code`: exit 0,
  «-- This is an empty migration.» En la base: RLS activa con 0 políticas, `servi_app` sin permisos sobre
  `bug_report_image`, CHECK `position_rango`, `storage_path_forma`, `content_type_permitido`, `size_bytes_rango`.
- T2 `BugReportImage` en `MODELOS_DE_PLATAFORMA`. Guardias `organizacion-en-modelos`, `rls-por-empresa`,
  `plataforma-solo-en-lista`: 41/41.
- T3 `lib/config/reporte-bug.ts`, `lib/storage/buckets.ts` (`BUG_REPORTS`), `.env.example` (texto de design §6).
- T4 `IAlmacenImagenesReporte` + `SupabaseAlmacenImagenesReporte`; `supabase-almacen-imagenes-reporte.test.ts` 15/15.
  Relacionados de config/buckets/adaptador: 14 archivos, 208/208.
- `pnpm run test:guardias`: 341/342 archivos, 4808/4813; los 4 rojos son de `dependencias-declaradas-presentes`
  (baseline), 1 saltado.
- Guardias de esquema contra `servi_logistic_slt98`: `schema-drift-saneamiento`, `nucleo-sin-modulos`,
  `catalogo-postgres-acota-esquema`, `consultas-concurrentes-en-transaccion`: 4 archivos, 52/52, 0 saltados.
- Typecheck (8 GB): verde tras T1; tras T4, 1 error ajeno a T1–T4 en `tests/unit/e2e/storage-falso.test.ts:220`
  (TS2769, `Uint8Array<ArrayBufferLike>` como `BodyInit`), de T5: se arregla en la tanda siguiente.
- Un `vitest related` con `lib/db/modelos-de-negocio.ts` pasó de 10 min y se cortó; ese archivo lo cubren las guardias.
- (propuesta) `BugReportImage.id` sin `@default(uuid())`: el id lo da siempre el servidor al preparar la subida.
  `leer` devuelve `null` también con «not found» del objeto.

### Arreglo, T6 y T8 — backend_dev — commits fbe1322b (arreglo T5), 39a9aa97 (T6), 5cf47ec2 (T8)
- fbe1322b: el cuerpo del PUT del contrato del doble va como `new Uint8Array(bytes)`; lo probado no cambia.
- T6: `lib/types/reporte-bug.ts` (design §6), `BugReportRepository` (`createMany` en la misma
  `$transaction`, `detalle` con imágenes por position y `organizacionId`, `MOTIVO` nuevo). Ajustes de
  compilación en `ReporteBugService` (`imagenes: []` hasta T7), `IReporteBugService`, tests de servicio y
  componentes.
- T8: `ReportesBugPlataformaService(repo, almacen, log = console.error)` firma con `ENLACE_DETALLE_SEGUNDOS`
  dentro de `conEmpresa`; composition root con `SupabaseAlmacenImagenesReporte`.
- Tests heredados que cambian de sentido:
  - R4 de SLT-97 «Reporte de bugs: módulo del superadmin»: `ReportesBugPlataformaService.length` pasa de 1
    a 2 («solo recibe el repositorio y el almacén de imágenes»), con cita a design §7 y §15.
  - En `bug-report.test.ts` el `toHaveLength(16)` cuenta los 16 pares de estados de R17 de SLT-97 y NO
    cambia; lo que cambia de sentido es el `toEqual` del detalle (R14 de SLT-97), que ahora lleva
    `imagenes: []`, con cita a este spec.
- Cifras: typecheck (8 GB) 0 errores; eslint 0 avisos; vitest de los 7 archivos tocados 119/119
  (`bug-report.test.ts` con base 33/33, 0 saltados; `reportes-bug-plataforma-service` 18/18;
  `reporte-bug-service` 8/8; `storage-falso` 15/15); `test:guardias` 341/342 archivos, 4808/4813, solo el
  rojo del baseline; guardias de esquema + `consultas-concurrentes-en-transaccion` contra la base 52/52, 0 saltados.
- Avisos:
  - `EnviarReporteBugInput` (`z.input`, lo que manda el cliente) y `EnviarReporteBugDatos` (`z.output`, lo
    que recibe el servicio) se separan por el `.default([])` de `imagenes` (fuera de design §6).
  - Dos archivos fuera de «Archivos esperados», anotados en tasks.md: `tests/unit/components/reportes-plataforma-page.test.tsx`
    y `tests/unit/actions/reportes-bug-plataforma-action.test.ts` (solo para compilar). Son 34: pasa el aviso del 80%, sin rojo.
  - `MOTIVO_LEER` también cambia para nombrar las imágenes.
- (propuesta) design §15 cita el `toHaveLength(16)` como test que cambia; el que cambia es el `toEqual`
  del detalle de R14 de SLT-97. Corregirlo en el spec.

### T7 «Subida, envío y correo» — backend_dev — commit 977a2b65
- `IReporteBugService` (`prepararSubidas`, `imagenes_invalidas`), `ReporteBugService(repo, almacen, sender,
  destinatarios?, log?, nuevoId = randomUUID)`, `prepararSubidaImagenesReporteAction` + composition root en
  `lib/actions/reporte-bug.ts`, bloques de imágenes en la plantilla del correo (design §8).
- Contrato para el panel: `prepararSubidaImagenesReporteAction({ imagenes: [{ tipo, tamano }] })` ⇒
  `{ status: "listas", permisos: [{ imagenId, url }] }` en orden | `unauthenticated` | `forbidden` |
  `validation_error` | `error`. Envío rechazado por R10 ⇒ `{ status: "imagenes_invalidas", imagenes: string[] }`.
  Respuesta buena exactamente `{ status: "enviado" }`.
- Tests: `reporte-bug-service` 18/18, `reporte-bug-action` 14/14, `plantilla-reporte-bug` 9/9,
  `modulos-reparto.guardia` 41/41, `bug-report.test.ts` con base 33/33 (0 saltados). Typecheck (8 GB) 0
  errores. eslint limpio. `test:guardias` 341/342, 4808 ✓, 4 ✗ (todos `dependencias-declaradas-presentes`,
  baseline), 1 saltado.
- El caso R13 de SLT-87 «Reporte de bugs: botón flotante y envío» en la action espera ahora `imagenes: []`
  (lo pone el `.default([])` del zod).
- Avisos:
  - La guardia `nombres-estado-retirados` rechaza «rechazadas»: el log queda
    `[reporte-bug] fallo al borrar imagenes no aceptadas causa=<name>`. (propuesta) corregir design §5.2.
  - `superficie-de-uso`: la action lleva `@sin-superficie` provisional hasta que T9 la importe; T9 la quita.
  - Un envío rechazado solo borra las imágenes inválidas que existían; las válidas se quedan para el
    reintento (§4.2); si borrar falla, se registra y la respuesta no cambia.

### T9 «Panel» — frontend_dev — commit 873b4d67
- `components/shared/ReporteBugBoton.tsx`: imágenes en un `useReducer` y envío en tres pasos (design §4.2,
  §9.1, §9.3); las vistas previas se revocan al quitar, descartar, enviar bien y desmontar.
- `tests/components/ReporteBugBoton.test.tsx`: 11 casos nuevos con los nombres del mapa (R1, R2, R3 ×2, R4,
  R5, R6, R7 ×3, R8, R11). El caso de R4 de SLT-87 «Reporte de bugs: botón flotante y envío» que afirmaba
  «no hay campo de archivos» pasa a «abre un panel con descripción, Enviar y Descartar», con comentario que
  cita este spec.
- `lib/actions/reporte-bug.ts`: fuera la anotación provisional `@sin-superficie`.
- Cifras: typecheck (8 GB) 0 errores; eslint exit 0; componente 27/27; con `reporte-bug-action`,
  `superficie-de-uso`, `ancla-de-carga`, `censo-order-status-rename`: 5 archivos, 80/80; `test:guardias`
  341/342, 4808 ✓, 4 ✗ solo del baseline.
- Avisos: el estado `rechazada` de design §9.1 se llama `no_aceptada` en el código (`censo-order-status-rename`
  veta la palabra); el texto visible no cambia. Si el servidor no da permisos (cualquier estado distinto de
  `listas` o caída), todas las imágenes pendientes quedan «No se pudo subir.», sin PUT ni envío.
- (propuesta) «Reintentar» deshabilitado si hay un error que solo admite «Quitar», con descripción vacía o
  enviando; el panel tiene alto máximo y se desplaza por dentro (5 imágenes en móvil); un tipo no admitido
  muestra una caja `role="img"` sin vista previa; el aviso de sobrantes se borra al volver a elegir, quitar,
  descartar o enviar; el input lleva `aria-label="Elegir imágenes del reporte"`.

### T10 «Detalle, pantalla» — frontend_dev — commit 5ab3288c
- `ReporteDetalle.tsx`: bloque «Imágenes» entre «Contexto» y «Estado» (design §9.2); miniatura de 8 rem por
  imagen, en orden, con enlace en otra pestaña «Abrir la imagen {n} en grande»; url null ⇒ «No se pudo
  cargar esta imagen.»; sin imágenes «Este reporte no trae imágenes.». `<img>` con el mismo
  `eslint-disable-next-line @next/next/no-img-element` de otros módulos (`next/image` pediría declarar el
  dominio de Storage en `next.config`).
- `reportes-textos.ts`: textos de §9.3, `textoAltImagenReporte(n)`, `textoAbrirImagenReporte(n)`.
- `ReporteDetalle.test.tsx` + `reportes-plataforma-page.test.tsx`: 32/32. eslint sin avisos.
- (propuesta) La numeración sigue la posición aunque una imagen falle (la 3.ª sigue siendo «Imagen 3»).
  El caso extra «el bloque Imágenes va entre Contexto y Estado» no está en el mapa.

### T5 «Doble de Storage» — backend_dev — commit 6b37e81c
- `e2e/_storage-falso/servidor.mjs`: `POST /object/upload/sign/<bucket>/<ruta>` (token de 2 h atado a su
  ruta y a su upsert; sin bucket 400 «Bucket not found»; objeto existente sin upsert 409), PUT sin `apikey`
  (token de la ruta → no multipart → 413 → 415 → no pisa), `createBucket` guarda `public`,
  `file_size_limit` y `allowed_mime_types`; CORS en todas las respuestas y `OPTIONS` 204.
- `tests/unit/e2e/storage-falso.test.ts`: 15/15 (11 de siempre + R9, R16, subida firmada, CORS). eslint sin avisos.
- (propuesta) `file_size_limit` solo en bytes («5MB» da 500); el upsert lo manda el token y el `x-upsert`
  del PUT no lo amplía; el token se reutiliza mientras no vence, pero un segundo PUT sin upsert da 409. El
  spec no fija ninguno de los tres.

### T11 «E2E, documentación y comprobación en preview» — frontend_dev — commit f0a2f89e (parcial)
- `e2e/reporte-de-bugs.spec.ts`: `describe` «SLT-98 — imágenes», pasos 1–4 de design §11 en un test (dos PNG
  y un GIF generados en el test; ninguna petición a `/storage/v1/` antes de «Enviar»; los 2 PUT firmados y
  las filas de `bug_report_image` con position 1 y 2; el correo del log con «Ver imagen 1/2» y el enlace da
  200 `image/png` con los mismos bytes; el superadmin ve las dos miniaturas y, al recargar, otro `src`).
  Paso 5: «Este reporte no trae imágenes.» en el caso de SLT-97 «Reporte de bugs: módulo del superadmin».
  «Subiendo imágenes…» se comprueba reteniendo los PUT con `page.route` hasta ver el texto.
- `docs/architecture.md`: subpunto «Imágenes (SLT-98, migración `20261112120000`)» (design §14).
- `e2e-sin-saltos` 38/38; eslint del spec limpio.
- Pendiente (no es del implementer): T11 sin `[x]` hasta la comprobación en preview contra Supabase real
  (design §15), que hacen el humano o el leader; el grupo `aislamiento` entero y `gate-completo` de CI.

## E2E — dos corridas sobre el código final
Base `servi_logistic_slt98_e2e` recreada (DROP/CREATE, `migrate deploy`, `db:seed`) solo antes de la 1.ª.
`next build` con 8 GB y `NEXT_PUBLIC_APP_URL=http://localhost:3044`: exit 0 en 262 s, sobre 873b4d67; después
solo cambiaron `e2e/reporte-de-bugs.spec.ts` y `docs/architecture.md`, así que el build es el del código final.
`E2E_PUERTO=3044 pnpm exec playwright test e2e/reporte-de-bugs.spec.ts --reporter=list`:

| Corrida | Resultado | Caso SLT-98 |
|---|---|---|
| 1 | `21 passed (2.1m)` · 0 failed · 0 skipped · 0 flaky | `✓ 21 [aislamiento] › e2e\reporte-de-bugs.spec.ts:582:7 › SLT-98 — imágenes › adjuntar, bloquear con un GIF, enviar, el correo con los enlaces y el detalle del superadmin (11.6s)` |
| 2 | `21 passed (1.7m)` · 0 failed · 0 skipped · 0 flaky | el mismo, (9.9s) |

Los 21 incluyen los 10 de `plataforma-vacia`, que arrastra `aislamiento`. Línea del correo en el log de la
corrida 1: `Imágenes (2). Los enlaces vencen en 24 horas: … Ver imagen 1: http://127.0.0.1:54329/storage/v1/object/sign/bug-reports/<org>/<usuario>/<uuid>.png?token=…`.

## Verificación final (implementer, HEAD f0a2f89e)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0 (3 min 51 s).
- `pnpm run lint`: exit 0 (2 min 46 s).
- vitest de los 11 archivos de test tocados (con `DATABASE_URL` a `servi_logistic_slt98`):
  `Test Files 11 passed (11)` · `Tests 197 passed (197)`, 0 saltados.
- Guardias de esquema contra `servi_logistic_slt98` (`schema-drift-saneamiento`, `nucleo-sin-modulos`,
  `catalogo-postgres-acota-esquema`, `consultas-concurrentes-en-transaccion`): `Test Files 4 passed (4)` ·
  `Tests 52 passed (52)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 341 passed (342)` · `Tests 4 failed | 4808 passed | 1 skipped`.
  El único rojo es `dependencias-declaradas-presentes.guardia.test.ts`, en `tests/baseline-rojos.json`.
- `node scripts/tamano-pr.mjs`: AVISO, no rojo: «34/40 archivos, 3374/1000 lineas», aceptado por el humano.
  Ojo: la línea aceptada habla de ~2.200–2.500 líneas; el diff real son ~3.300.
- No corridos por regla de esta sesión: `./init.sh`, la suite completa y el grupo `aislamiento` entero (CI).

## Mapa R → test
Los nombres son los del «Mapa R → test» de `tasks.md`; todos existen con ese nombre (prefijo «Rn — » en
los unit de T7).

| R | Tests |
|---|---|
| R1 | `tests/components/ReporteBugBoton.test.tsx` (R1); `e2e/reporte-de-bugs.spec.ts` SLT-98 paso 1 |
| R2 | `ReporteBugBoton.test.tsx` (R2); E2E paso 1 (sin `/storage/v1/` antes de «Enviar») |
| R3 | `ReporteBugBoton.test.tsx` (R3 ×2) |
| R4 | `ReporteBugBoton.test.tsx` (R4); E2E paso 1 |
| R5 | `ReporteBugBoton.test.tsx` (R5); E2E paso 1 (GIF) |
| R6 | `ReporteBugBoton.test.tsx` (R6); E2E paso 2 |
| R7 | `ReporteBugBoton.test.tsx` (R7 ×3); E2E paso 1 (el GIF bloquea «Enviar») |
| R8 | `ReporteBugBoton.test.tsx` (R8); E2E paso 2 |
| R9 | `tests/unit/actions/reporte-bug-action.test.ts`; `tests/unit/services/reporte-bug-service.test.ts` (×2); `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts`; `tests/unit/e2e/storage-falso.test.ts` |
| R10 | `reporte-bug-service.test.ts` (`tipoPorFirma`; lectura y validación en `enviar`) |
| R11 | `reporte-bug-service.test.ts`; `ReporteBugBoton.test.tsx` |
| R12 | `reporte-bug-action.test.ts` |
| R13 | `tests/integration/db/bug-report.test.ts` (×2); `reporte-bug-service.test.ts` (tamaño medido); E2E pasos 2 y 4 |
| R14 | `reporte-bug-action.test.ts` |
| R15 | `supabase-almacen-imagenes-reporte.test.ts` (×2) |
| R16 | `supabase-almacen-imagenes-reporte.test.ts` (×3); `storage-falso.test.ts` |
| R17 | Revisión del diff de `.env.example` (sin test automático, según tasks.md) |
| R18 | `bug-report.test.ts` (servi_app ⇒ 42501) |
| R19 | `bug-report.test.ts` (CHECK y cascada) |
| R20 | `tests/unit/services/email/plantilla-reporte-bug.test.ts` (×2); `reporte-bug-service.test.ts`; E2E paso 3 |
| R21 | `reporte-bug-service.test.ts`; `plantilla-reporte-bug.test.ts` |
| R22 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` (×2); `tests/components/ReporteDetalle.test.tsx`; `bug-report.test.ts`; E2E pasos 4 y 5 |
| R23 | `reportes-bug-plataforma-service.test.ts`; `ReporteDetalle.test.tsx` |

## Propuestas y avisos consolidados
- (propuesta) design §15 cita el `toHaveLength(16)` de `bug-report.test.ts` como test que cambia; no cambia
  (cuenta los 16 pares de R17 de SLT-97); el que cambia es el `toEqual` del detalle de R14 de SLT-97.
- (propuesta) design §5.2: la línea de log dice «rechazadas», vetada por `nombres-estado-retirados`; el código
  usa «no aceptadas». Design §9.1: el estado `rechazada` se llama `no_aceptada` (`censo-order-status-rename`).
- Tipos: `EnviarReporteBugInput` (z.input) y `EnviarReporteBugDatos` (z.output), fuera de design §6.
- Dos archivos fuera de «Archivos esperados» (solo para compilar), anotados en tasks.md: 34 archivos.
- Tamaño real ~3.374 líneas frente a las ~2.200–2.500 aceptadas: el leader decide si se reconfirma con el humano.
- Las propuestas menores de T5, T9 y T10 están en sus secciones.
