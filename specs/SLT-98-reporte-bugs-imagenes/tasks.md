# SLT-98 — Reporte de bugs: imágenes · tasks.md

> Entrega 3 de 3. Son 32 archivos y unas 2100-2400 líneas. El humano aceptó el exceso de líneas (P2 del
> 2026-11-10), y la línea `tamano-pr-aceptado` la deja el leader en `progress/features/SLT-98.md`. Las
> imágenes se suben al pulsar «Enviar», no al elegirlas (P1). `[P]` = paralelizable con las demás `[P]` de su bloque, una vez cumplidas
> sus dependencias.
>
> **Reparto por capa:**
> - `backend_dev`: T1–T8, incluido el doble de Storage;
> - `frontend_dev`: T9 y T10;
> - el que acabe cierra T11.

## Bloque A — Datos

- [x] **T1. Tabla y migración** (R13, R18, R19).
  - **Archivos:**
    - `db/schema.prisma`: el modelo `BugReportImage` y el inverso `images` en `BugReport`;
    - `db/migrations/20261112120000_bug_report_image/{migration,down}.sql` (design §2.1–§2.3), con un
      timestamp posterior a la última migración de `dev` al crearla.
  - **Hecho:**
    - `prisma validate` y `pnpm run typecheck` en verde;
    - `prisma migrate deploy` y `pnpm run db:rollback` aplican y revierten sobre una base desechable.
- [x] **T2. Clasificación** (dep. T1; R18).
  - **Archivo:** `BugReportImage` en `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`).
  - **Hecho:** `pnpm run test:guardias` en verde (`organizacion-en-modelos`, `rls-por-empresa`,
    `plataforma-solo-en-lista`).

## Bloque B — Almacenamiento

- [x] **T3. Configuración y catálogo** (dep. —; R10, R15, R17).
  - **Archivos:**
    - en `lib/config/reporte-bug.ts`: `IMAGENES_MAX`, `IMAGEN_BYTES_MAX`, `TIPOS_IMAGEN`,
      `EXTENSION_POR_TIPO`, `ENLACE_CORREO_SEGUNDOS`, `ENLACE_DETALLE_SEGUNDOS`, `bucketReporteBug` y
      `tipoPorFirma` (design §6);
    - `BUG_REPORTS` en `lib/storage/buckets.ts`;
    - `BUG_REPORT_BUCKET` en `.env.example`.
  - **Hecho:** `pnpm run typecheck` en verde. Los casos de `tipoPorFirma` van en el test del servicio
    (T7) y los de `bucketReporteBug` en el del adaptador (T4). Así no se abre otro archivo de test.
- [x] **T4. Adaptador** (dep. T3; R9, R15, R16).
  - **Archivos:**
    - `lib/interfaces/external/IAlmacenImagenesReporte.ts`;
    - `lib/storage/SupabaseAlmacenImagenesReporte.ts` (design §3.2, §3.3).
  - **Hecho:** `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts` en verde, con un doble del
    cliente y sin red. `storage-solo-por-adaptador.guardia` sigue en verde.
- [x] **T5 [P]. Doble de Storage** (dep. —; da soporte a R2, R9, R16 y R22 en el E2E).
  - **Archivo:** `e2e/_storage-falso/servidor.mjs`: la subida firmada, CORS y los límites del bucket
    (design §10).
  - **Hecho:** `tests/unit/e2e/storage-falso.test.ts` en verde, con sus casos nuevos y los de siempre.

## Bloque C — Servidor

- [x] **T6. Contratos y repositorio** (dep. T2, T3; R12, R13, R19, R22).
  - **Archivos:**
    - en `lib/types/reporte-bug.ts`: `prepararSubidasImagenesSchema`, el campo `imagenes` de
      `enviarReporteBugSchema`, `NuevaImagen` y los cambios de `NuevoBugReport`, `ReporteDetalleDatos` y
      `ReporteDetalleDTO` (design §6);
    - en `lib/repositories/BugReportRepository.ts`: `crear` con `createMany` de imágenes en la misma
      transacción, `detalle` con las imágenes en orden y `organizacionId`, y el `MOTIVO` nuevo (design
      §2.4, §7).
  - **Hecho:** `tests/integration/db/bug-report.test.ts` en verde con `DATABASE_URL` (un verde sin base
    no vale, `docs/verification.md`). Incluye el ajuste del `Object.keys(r)` de SLT-97.
- [x] **T7. Subida, envío y correo** (dep. T4, T6; R9–R14, R20, R21).
  - **Archivos:**
    - `lib/interfaces/services/IReporteBugService.ts`: `prepararSubidas` e `imagenes_invalidas`;
    - `lib/services/ReporteBugService.ts`: `prepararSubidas` y `enviar` (design §5);
    - `lib/actions/reporte-bug.ts`: `prepararSubidaImagenesReporteAction` y la composition root (design
      §4.1, §5.2);
    - `lib/services/email/plantillas/reporte-bug.ts`: los bloques de imágenes (design §8).
  - **Hecho:** en verde
    - `tests/unit/services/reporte-bug-service.test.ts`;
    - `tests/unit/actions/reporte-bug-action.test.ts`;
    - `tests/unit/services/email/plantilla-reporte-bug.test.ts`;
    - `modulos-reparto.guardia`.
- [x] **T8. Detalle del superadmin, servidor** (dep. T4, T6; R22, R23).
  - **Archivos:**
    - `lib/services/ReportesBugPlataformaService.ts`: firma con `conEmpresa` y el TTL del detalle
      (design §7);
    - `lib/actions/reportes-bug-plataforma.ts`: la composition root.
  - **Hecho:** `tests/unit/services/reportes-bug-plataforma-service.test.ts` en verde, con el test de R4
    de SLT-97 ajustado.

## Bloque D — Interfaz

- [x] **T9. Panel** (dep. T7; R1–R8, R11).
  - **Archivo:** `components/shared/ReporteBugBoton.tsx`: el envío en tres pasos de design §4.2, y
    design §9.1 y §9.3.
  - **Hecho:** `tests/components/ReporteBugBoton.test.tsx` en verde. El caso de SLT-87 «no hay campo de
    archivos» se sustituye por los de R1, citando este spec.
- [x] **T10 [P]. Detalle, pantalla** (dep. T8; R22, R23).
  - **Archivos:**
    - `app/(app)/plataforma/reportes/[reporteId]/_components/ReporteDetalle.tsx`;
    - `app/(app)/plataforma/reportes/_components/reportes-textos.ts` (design §9.2, §9.3).
  - **Hecho:** `tests/components/ReporteDetalle.test.tsx` en verde.

## Bloque E — De punta a punta y cierre

- [x] **T11. E2E, documentación y comprobación en preview** (dep. T5, T9, T10; R1, R2, R5, R6, R7, R8,
  R13, R14, R16, R20, R22).
  - **Archivos:**
    - el `describe` «SLT-98 — imágenes» y la aserción de «Este reporte no trae imágenes.» en
      `e2e/reporte-de-bugs.spec.ts` (design §11);
    - el subpunto de `docs/architecture.md` (design §14).
  - **Hecho:**
    - dos corridas seguidas de `e2e/reporte-de-bugs.spec.ts` sobre una base desechable, con 0 failed, 0
      skipped y 0 flaky (`docs/verification.md > El E2E`), y la salida pegada en `progress/impl_SLT-98.md`;
    - el grupo `aislamiento` entero, porque el diff toca `db/` (`docs/perfil-agentes.md > E2E en local
      antes del PR`);
    - `./init.sh` en verde, o el check `gate-completo` de CI si el humano lo sustituye como en SLT-97;
    - `node scripts/tamano-pr.mjs` en aviso y no en rojo, con la línea `tamano-pr-aceptado` (P2);
    - **en el despliegue de preview, contra Supabase real** (design §15): con un `BUG_REPORT_BUCKET`
      que aún no exista, enviar un reporte con una imagen crea el bucket privado con sus límites, el `PUT` del
      navegador sube sin `apikey` y sin error de CORS, y el enlace del correo abre la imagen. Lo hace el
      humano o el leader, y queda anotado en `progress/impl_SLT-98.md`. Si algo falla, se para y el spec
      vuelve al humano.
  - **Cerrada con salvedades** (review F2.2, igual que SLT-97): E2E ×2 21/21, documentación y tamaño hechos
    por el implementer. El grupo `aislamiento` y `./init.sh` se sustituyen por `gate-completo` y los grupos
    E2E de CI en el PR a `dev`. La comprobación en preview es **condición de merge** y queda anotada en
    `progress/features/SLT-98.md`.

## Bloque F — Tope diario de imágenes (enmienda del 2026-11-10, hallazgo m1; design §16)

> Se arregla en este mismo PR (decisión «Tope diario»). P5–P12 están cerradas: día calendario de Costa
> Rica, cuentan los permisos concedidos, tope blando (con el conteo por debajo de 21 se concede todo lo
> pedido; desde 21, nada) y, sin cupo, el panel envía solo el texto y sin aviso. P13 está abierta sin
> bloquear: el spec sigue su recomendación. Reparto: `backend_dev` T12–T14; `frontend_dev` T15; el que
> acabe cierra T16.

- [x] **T12. Tabla del cupo** (dep. —; R26, R31).
  - **Archivos:**
    - `db/migrations/20261112120000_bug_report_image/migration.sql`: `bug_report_upload_quota` con su PK
      compuesta, el `CHECK`, la FK, la RLS y el `REVOKE` (design §16.2);
    - `db/migrations/20261112120000_bug_report_image/down.sql`: su `DROP TABLE IF EXISTS`, antes del de
      `bug_report_image`;
    - `db/schema.prisma`: el modelo `BugReportUploadQuota` y su inverso en `Usuario`;
    - `lib/db/modelos-de-negocio.ts`: la entrada en `MODELOS_DE_PLATAFORMA`.
  - **Hecho:**
    - `prisma validate` y `pnpm run typecheck` en verde;
    - `prisma migrate deploy` y `pnpm run db:rollback` aplican y revierten sobre una base desechable;
    - `pnpm run test:guardias` en verde, con `organizacion-en-modelos`, `rls-por-empresa`,
      `plataforma-solo-en-lista` y `catalogo-postgres-acota-esquema`;
    - `tests/integration/db/schema-drift-saneamiento.test.ts` en verde, con el censo de `updated_at` en 18;
    - anotado en `progress/impl_SLT-98.md` qué bases compartidas ya tenían `20261112120000` aplicada y
      cómo se rehicieron (design §15).
- [ ] **T13. Repositorio del cupo** (dep. T12; R24–R27, R31).
  - **Archivos:**
    - `lib/interfaces/repositories/ICupoImagenesReporte.ts` (nuevo);
    - `lib/repositories/BugReportRepository.ts`: `consumir` (con `WHERE "permits_granted" < tope`, el
      tope blando) y `devolver`, en `comoPlataforma` con `MOTIVO_CUPO`, cada uno con una sola sentencia
      (design §16.3);
    - `lib/config/reporte-bug.ts`: `IMAGENES_POR_DIA_MAX = 21`.
  - **Hecho:** `tests/integration/db/bug-report.test.ts` en verde **con `DATABASE_URL`** (un verde sin
    base no vale), con los casos de R24, R26, R27 y R31 del mapa. `consultas-concurrentes-en-transaccion`
    y `sql-a-mano-por-empresa` siguen en verde.
- [ ] **T14. Servicio y action** (dep. T13; R24, R25, R27, R28, R30).
  - **Archivos:**
    - `lib/interfaces/services/IReporteBugService.ts`: la variante `{ status: "sin_cupo_imagenes" }`;
    - `lib/services/ReporteBugService.ts`: `cupo` como tercer parámetro, `ahora` al final y el
      `prepararSubidas` de design §16.4;
    - `lib/actions/reporte-bug.ts`: la variante en el resultado y la composition root con `repo` dos
      veces.
  - **Hecho:** `tests/unit/services/reporte-bug-service.test.ts` y `tests/unit/actions/reporte-bug-action.test.ts`
    en verde, con los casos del mapa, y `pnpm run typecheck` en verde.
- [ ] **T15. Panel** (dep. T14; R28, R29, R30).
  - **Archivo:** `components/shared/ReporteBugBoton.tsx`: con `sin_cupo_imagenes`, saltar al envío del
    reporte sin las imágenes sin permiso, sin `PUT` y sin aviso (design §16.5). Ningún texto nuevo.
  - **Hecho:** `tests/components/ReporteBugBoton.test.tsx` en verde, con los casos del mapa.
- [ ] **T16. E2E, documentación y cierre** (dep. T12–T15; R24, R29, R30).
  - **Archivos:**
    - en `e2e/reporte-de-bugs.spec.ts`, el test de design §16.6;
    - en `docs/architecture.md`, la viñeta del tope (design §14).
  - **Hecho:**
    - dos corridas seguidas de `e2e/reporte-de-bugs.spec.ts` sobre una base desechable, con 0 failed, 0
      skipped y 0 flaky, y la salida pegada en `progress/impl_SLT-98.md`;
    - `./init.sh` en verde, o `gate-completo` si el humano lo sustituye, como en T11;
    - `node scripts/tamano-pr.mjs` sin rojo, dentro de lo aceptado en P12 (~35 archivos y ~3.900
      líneas). Si la cifra real pasa de ahí, el leader vuelve al humano.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/components/ReporteBugBoton.test.tsx` «el panel muestra «Imágenes (opcional, máximo 5)», «Agregar imágenes» y «0/5 imágenes · PNG, JPG o WebP · hasta 5 MB cada una»»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R2 | `tests/components/ReporteBugBoton.test.tsx` «elegir una PNG la añade con su miniatura y «Quitar», sin llamar a la action de permisos ni a fetch»; `e2e/reporte-de-bugs.spec.ts` (paso 1: ninguna petición a `/storage/v1/` antes de «Enviar») |
| R3 | `tests/components/ReporteBugBoton.test.tsx` «con 5 imágenes «Agregar imágenes» está deshabilitado y el contador dice «5/5 imágenes»» y «elegir 7 con 3 en el panel añade 2 y avisa «Solo caben 5 imágenes: 5 no se agregaron.»» |
| R4 | `tests/components/ReporteBugBoton.test.tsx` «Quitar saca la imagen, baja el contador y no la manda al enviar»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R5 | `tests/components/ReporteBugBoton.test.tsx` «un GIF, un archivo vacío y uno de 5 MB + 1 byte quedan marcados con su motivo, sin pedir subida y solo con «Quitar»»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R6 | `tests/components/ReporteBugBoton.test.tsx` «Enviar con dos imágenes pide los dos permisos en una llamada, en orden, hace un PUT por imagen con el archivo y su content-type, muestra «Subiendo imágenes…» mientras tanto, y solo después llama a enviarReporteBugAction con los imagenId en orden»; `e2e/reporte-de-bugs.spec.ts` (paso 2) |
| R7 | `tests/components/ReporteBugBoton.test.tsx` «si un PUT responde 500 o falla la red, no se llama a enviarReporteBugAction, la imagen dice «No se pudo subir.» con «Reintentar» y «Quitar», el texto sigue y «Enviar» queda deshabilitado con «Quita o reintenta las imágenes marcadas para poder enviar.»», «si la action de permisos no responde listas, no hay ningún PUT ni envío», y ««Reintentar» pide permiso solo para la que falló, reutiliza el imagenId de la que subió y manda el reporte con las dos»; `e2e/reporte-de-bugs.spec.ts` (paso 1: el GIF bloquea «Enviar») |
| R8 | `tests/components/ReporteBugBoton.test.tsx` «el borrador guardado no lleva imágenes; al montar de nuevo el panel tiene el texto y 0/5 imágenes; Descartar y el envío bueno vacían las imágenes y revocan sus vistas previas»; `e2e/reporte-de-bugs.spec.ts` (paso 2) |
| R9 | `tests/unit/actions/reporte-bug-action.test.ts` «pedir permisos sin sesión da unauthenticated; 0 o 6 imágenes, un tipo image/gif, un tamaño 0 o de 5 242 881 y un campo de más dan validation_error, sin llamar al servicio»; `tests/unit/services/reporte-bug-service.test.ts` «pedir permisos con un rol de plataforma o sin empresa da forbidden sin tocar el almacén» y «da un permiso por imagen, en orden, con la ruta <usuarioId>/<uuid>.<ext> dentro de conEmpresa de la empresa del actor»; `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts` «prepararSubida firma <org>/<ruta> sin upsert y devuelve la URL»; `tests/unit/e2e/storage-falso.test.ts` «un token de otra ruta no sube y sin upsert no pisa un objeto existente» |
| R10 | `tests/unit/services/reporte-bug-service.test.ts` «tipoPorFirma reconoce PNG, JPEG y WebP y da null con un GIF y con bytes de menos» y «enviar lee cada imagen en la ruta del usuario de la sesión y acepta solo las que existen, pesan 1 B–5 MB y tienen la firma de su tipo» |
| R11 | `tests/unit/services/reporte-bug-service.test.ts` «una imagen que falta, una de 5 MB + 1 o una «PNG» con firma JPEG da imagenes_invalidas con su id, sin llamar al repositorio ni al emisor, y borra las que existían»; `tests/components/ReporteBugBoton.test.tsx` «con imagenes_invalidas marca esas imágenes «No pudimos aceptar esta imagen. Quítala para enviar.» y conserva el texto» |
| R12 | `tests/unit/actions/reporte-bug-action.test.ts` «6 imágenes, un id repetido, un id que no es uuid, un tipo image/gif o un campo de más en una imagen dan validation_error sin llamar al servicio» |
| R13 | `tests/integration/db/bug-report.test.ts` «crear con 3 imágenes guarda bug_report y bug_report_image con position 1..3, tipo y tamaño» y «si una imagen viola un CHECK, no queda ni el reporte»; `tests/unit/services/reporte-bug-service.test.ts` «el tamaño que guarda es el medido, no uno del cliente»; `e2e/reporte-de-bugs.spec.ts` (pasos 2 y 4) |
| R14 | `tests/unit/actions/reporte-bug-action.test.ts` «la respuesta buena es exactamente { status: "enviado" }, también con imágenes» |
| R15 | `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts` «bucketReporteBug: vacío o ausente da bug-reports, y BUG_REPORT_BUCKET recortada manda» y «ninguna operación pide una URL pública (la superficie del cliente no la expone)» |
| R16 | `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts` ««Bucket not found» ⇒ createBucket privado con fileSizeLimit 5242880 y los tres tipos, y UN reintento», ««already exists» al crear se ignora» y «otro error al crear lanza sin reintentar»; `tests/unit/e2e/storage-falso.test.ts` «sin bucket, Bucket not found; con límites, 413 y 415» |
| R17 | Revisión del diff de `.env.example` por el reviewer: la línea `BUG_REPORT_BUCKET=` con su comentario (design §6). No hay test automático de un comentario. |
| R18 | `tests/integration/db/bug-report.test.ts` «con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report_image dan 42501» |
| R19 | `tests/integration/db/bug-report.test.ts` «la base rechaza position 6, content_type image/gif, size_bytes 0 y 5242881, también como dueño, y borrar el bug_report se lleva sus imágenes» |
| R20 | `tests/unit/services/email/plantilla-reporte-bug.test.ts` «con dos imágenes, el texto plano lleva «Imágenes (2). Los enlaces vencen en 24 horas:», «Ver imagen 1: <url1>» y «Ver imagen 2: <url2>» en orden, sin adjuntos» y «sin imágenes, el correo es idéntico al de SLT-87»; `tests/unit/services/reporte-bug-service.test.ts` «firma las rutas una vez con 86400 segundos y manda los mismos enlaces a cada destinatario»; `e2e/reporte-de-bugs.spec.ts` (paso 3) |
| R21 | `tests/unit/services/reporte-bug-service.test.ts` «si firmar lanza o le falta una ruta, el correo sale con «Imagen {n}: no se pudo generar el enlace…» y la respuesta es enviado»; `tests/unit/services/email/plantilla-reporte-bug.test.ts` «una imagen sin url lleva la nota en su lugar» |
| R22 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` «detalle firma las rutas con 86400 segundos dentro de conEmpresa de la empresa del reporte, en cada llamada, y el DTO no lleva rutas ni empresa» y «sin imágenes no llama al almacén»; `tests/components/ReporteDetalle.test.tsx` «el bloque Imágenes muestra una miniatura por imagen en orden, con alt «Imagen {n} del reporte» y enlace a la URL, y sin imágenes «Este reporte no trae imágenes.»»; `tests/integration/db/bug-report.test.ts` «detalle trae las imágenes por position y la empresa»; `e2e/reporte-de-bugs.spec.ts` (pasos 4 y 5) |
| R23 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` «si firmar lanza, todas las url son null y el detalle se devuelve igual»; `tests/components/ReporteDetalle.test.tsx` «una imagen con url null muestra «No se pudo cargar esta imagen.» y el resto del detalle» |
| R24 | `tests/integration/db/bug-report.test.ts` «R24 — consumir suma los permisos del día: 5 + 5 + 5 + 5 da 20 y 1 más da 21» y «R24 — tope blando: con 20 concedidos, consumir 5 devuelve 25 y el día queda en 25»; `tests/unit/services/reporte-bug-service.test.ts` «R24 — prepararSubidas consume el cupo con el usuario de la sesión, la fecha de Costa Rica, el número de imágenes y el tope 21, antes de tocar el almacén», «R24 — con consumir devolviendo 25, da listas con un permiso por imagen» y «R24 — la fecha del cupo es el día de Costa Rica: a las 05:30 UTC del 11 cuenta en 2026-11-10» |
| R25 | `tests/integration/db/bug-report.test.ts` «R25 — con 21 concedidos, consumir 1 devuelve null y el día sigue en 21» y «R25 — con 25 concedidos, consumir 1 devuelve null y el día sigue en 25»; `tests/unit/services/reporte-bug-service.test.ts` «R25 — si consumir devuelve null, da exactamente { status: "sin_cupo_imagenes" } y no llama al almacén ni a devolver»; `tests/unit/actions/reporte-bug-action.test.ts` «R25 — sin_cupo_imagenes pasa tal cual, sin más campos»; `e2e/reporte-de-bugs.spec.ts` «con el cupo del día lleno, el reporte se envía solo con el texto, sin subir nada y sin aviso» (paso 5: el conteo sigue en 21) |
| R26 | `tests/integration/db/bug-report.test.ts` «R26 — 30 consumos simultáneos de 1 del mismo usuario sin fila dejan exactamente 21 concedidos y 9 null» y «R26 — dos consumos simultáneos de 5 con 19 concedidos: entra uno solo y el día queda en 24, no en 29» |
| R27 | `tests/integration/db/bug-report.test.ts` «R27 — devolver resta los permisos sin bajar de 0 y sin fila no hace nada»; `tests/unit/services/reporte-bug-service.test.ts` «R27 — si el almacén falla, devuelve el cupo de la petición y relanza; si devolver también falla, registra «fallo al devolver el cupo de imagenes» y relanza el error original» |
| R28 | `tests/unit/services/reporte-bug-service.test.ts` «R28 — enviar no consume ni lee el cupo»; `tests/components/ReporteBugBoton.test.tsx` «R28 — «Reintentar» tras un PUT fallido pide permiso solo para la que falló: la que ya subió no vuelve a la action de permisos» |
| R29 | `tests/components/ReporteBugBoton.test.tsx` «R29 — con sin_cupo_imagenes no hay PUT, se llama a enviarReporteBugAction con el texto e imagenes: [], no hay ningún role="alert" y sale «Gracias, recibimos tu reporte» con 0/5 imágenes», «R29 — en un reintento sin cupo, el reporte lleva solo las imágenes ya subidas, en orden, y no la que falló» y «R29 — sin cupo y con el envío respondiendo error, las imágenes siguen en pendiente y ninguna pasa a error_subida»; `e2e/reporte-de-bugs.spec.ts` «con el cupo del día lleno, el reporte se envía solo con el texto, sin subir nada y sin aviso» |
| R30 | `tests/unit/services/reporte-bug-service.test.ts` «R30 — enviar un reporte sin imágenes da enviado sin llamar al cupo, aunque el cupo doble diga que no hay»; `e2e/reporte-de-bugs.spec.ts` «con el cupo del día lleno, el reporte se envía solo con el texto, sin subir nada y sin aviso» (pasos 2 y 4) |
| R31 | `tests/integration/db/bug-report.test.ts` «R31 — con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report_upload_quota dan 42501, y la tabla tiene RLS en public»; `tests/unit/actions/reporte-bug-action.test.ts` «R31 — pedir permisos con un campo usuarioId, fecha o cupo de más da validation_error sin llamar al servicio» |

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261112120000_bug_report_image/migration.sql`
- `db/migrations/20261112120000_bug_report_image/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/config/reporte-bug.ts`
- `lib/storage/buckets.ts`
- `.env.example`
- `lib/interfaces/external/IAlmacenImagenesReporte.ts`
- `lib/storage/SupabaseAlmacenImagenesReporte.ts`
- `lib/types/reporte-bug.ts`
- `lib/repositories/BugReportRepository.ts`
- `lib/interfaces/services/IReporteBugService.ts`
- `lib/services/ReporteBugService.ts`
- `lib/actions/reporte-bug.ts`
- `lib/services/email/plantillas/reporte-bug.ts`
- `lib/services/ReportesBugPlataformaService.ts`
- `lib/actions/reportes-bug-plataforma.ts`
- `components/shared/ReporteBugBoton.tsx`
- `app/(app)/plataforma/reportes/[reporteId]/_components/ReporteDetalle.tsx`
- `app/(app)/plataforma/reportes/_components/reportes-textos.ts`
- `docs/architecture.md`
- `e2e/_storage-falso/servidor.mjs`
- `e2e/reporte-de-bugs.spec.ts`
- `tests/integration/db/bug-report.test.ts`
- `tests/unit/services/reporte-bug-service.test.ts`
- `tests/unit/actions/reporte-bug-action.test.ts`
- `tests/unit/services/email/plantilla-reporte-bug.test.ts`
- `tests/unit/services/reportes-bug-plataforma-service.test.ts`
- `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts`
- `tests/unit/e2e/storage-falso.test.ts`
- `tests/components/ReporteBugBoton.test.tsx`
- `tests/components/ReporteDetalle.test.tsx`
- `lib/interfaces/repositories/ICupoImagenesReporte.ts`

**Enmienda del tope diario (T12–T16):** solo `lib/interfaces/repositories/ICupoImagenesReporte.ts` es
nuevo en el PR. Los demás archivos que toca ya estaban en esta lista: la migración, `db/schema.prisma`,
`lib/db/modelos-de-negocio.ts`, `lib/config/reporte-bug.ts`, `lib/repositories/BugReportRepository.ts`,
`lib/interfaces/services/IReporteBugService.ts`, `lib/services/ReporteBugService.ts`,
`lib/actions/reporte-bug.ts`, `components/shared/ReporteBugBoton.tsx`, `docs/architecture.md`,
`e2e/reporte-de-bugs.spec.ts`, `tests/integration/db/bug-report.test.ts`,
`tests/unit/services/reporte-bug-service.test.ts`, `tests/unit/actions/reporte-bug-action.test.ts` y
`tests/components/ReporteBugBoton.test.tsx`.

En total quedan **35 archivos** (34 reales tras F2.1, más 1) y unas **3.900 líneas** (3374 + ~530). Están
por encima del aviso del 80% y por debajo del máximo de 40, y el humano los aceptó (P12: «Aceptar ~3.900,
un PR»).

Reparto aproximado de las ~530 líneas (el tope blando y el envío sin aviso quitan `usados` y los textos
del aviso):

| Parte | Líneas |
|---|---|
| Migración y modelo | ~50 |
| Repositorio, interfaz y configuración | ~65 |
| Servicio y action | ~40 |
| Panel | ~25 |
| Documentación | ~5 |
| Tests de integración | ~130 |
| Tests de servicio y action | ~130 |
| Tests de componente | ~60 |
| E2E | ~40 |

`lib/interfaces/repositories/IBugReportRepository.ts` y `lib/db/excepciones-aislamiento.ts` siguen sin
cambiar (design §16.3).

**Añadidos en la implementación (T6, T8):** dos tests de SLT-97 cuyos dobles construyen tipos o el
servicio que cambian aquí, ajustados solo para compilar:
- `tests/unit/components/reportes-plataforma-page.test.tsx` (`imagenes: []` en el `ReporteDetalleDTO` de prueba);
- `tests/unit/actions/reportes-bug-plataforma-action.test.ts` (el almacén doble en el constructor).

**Total:** 32 archivos. Es justo el aviso del 80% (32 de 40), sin pasarlo; el máximo es 40. Son unas
2100-2400 líneas frente a un máximo de 1000; el exceso está aceptado (P2). P1 no quita archivos: la
subida se mueve al envío, pero las piezas son las mismas. Ahorra unas 100 líneas, porque desaparecen la
subida al elegir y su estado por imagen.

**Lo que no está y por qué:**
- `lib/interfaces/repositories/IBugReportRepository.ts` no cambia: sus firmas usan tipos de
  `lib/types/reporte-bug.ts`.
- `lib/modulos/reparto.ts` no cambia: la action nueva vive en `reporte-bug.ts`, ya de núcleo.
- `playwright.config.ts` no cambia: el bucket por defecto vale y el doble ya arranca.
- `lib/db/excepciones-aislamiento.ts` no cambia: el archivo de la excepción es el mismo y el motivo largo
  vive en el repositorio.

Si una de estas resulta necesaria, se añade aquí antes de tocarla, y el aviso del 80% salta.

**Reparto aproximado de las líneas:**

| Parte | Líneas |
|---|---|
| Datos | ~80 |
| Almacenamiento y configuración | ~220 |
| Servidor | ~330 |
| Panel y detalle | ~380 |
| Documentación | ~15 |
| Doble de Storage | ~110 |
| Tests, contrato del doble y E2E | ~1000-1250 |

Si cambia el timestamp de la migración, se actualizan aquí sus dos rutas.
