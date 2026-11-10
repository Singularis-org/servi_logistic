# SLT-98 — Reporte de bugs: imágenes · tasks.md

> Entrega 3 de 3. El tamaño (32 archivos, unas 2200-2500 líneas) depende de P2 de `requirements.md`. Si
> el humano acepta el exceso, el leader deja la línea `tamano-pr-aceptado` en
> `progress/features/SLT-98.md`. `[P]` = paralelizable con las demás `[P]` de su bloque, una vez cumplidas
> sus dependencias.
>
> **Reparto por capa:**
> - `backend_dev`: T1–T8, incluido el doble de Storage;
> - `frontend_dev`: T9 y T10;
> - el que acabe cierra T11.

## Bloque A — Datos

- [ ] **T1. Tabla y migración** (R13, R18, R19).
  - **Archivos:**
    - `db/schema.prisma`: el modelo `BugReportImage` y el inverso `images` en `BugReport`;
    - `db/migrations/20261112120000_bug_report_image/{migration,down}.sql` (design §2.1–§2.3), con un
      timestamp posterior a la última migración de `dev` al crearla.
  - **Hecho:**
    - `prisma validate` y `pnpm run typecheck` en verde;
    - `prisma migrate deploy` y `pnpm run db:rollback` aplican y revierten sobre una base desechable.
- [ ] **T2. Clasificación** (dep. T1; R18).
  - **Archivo:** `BugReportImage` en `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`).
  - **Hecho:** `pnpm run test:guardias` en verde (`organizacion-en-modelos`, `rls-por-empresa`,
    `plataforma-solo-en-lista`).

## Bloque B — Almacenamiento

- [ ] **T3. Configuración y catálogo** (dep. —; R10, R15, R17).
  - **Archivos:**
    - en `lib/config/reporte-bug.ts`: `IMAGENES_MAX`, `IMAGEN_BYTES_MAX`, `TIPOS_IMAGEN`,
      `EXTENSION_POR_TIPO`, `ENLACE_CORREO_SEGUNDOS`, `ENLACE_DETALLE_SEGUNDOS`, `bucketReporteBug` y
      `tipoPorFirma` (design §6);
    - `BUG_REPORTS` en `lib/storage/buckets.ts`;
    - `BUG_REPORT_BUCKET` en `.env.example`.
  - **Hecho:** `pnpm run typecheck` en verde. Los casos de `tipoPorFirma` van en el test del servicio
    (T7) y los de `bucketReporteBug` en el del adaptador (T4). Así no se abre otro archivo de test.
- [ ] **T4. Adaptador** (dep. T3; R9, R15, R16).
  - **Archivos:**
    - `lib/interfaces/external/IAlmacenImagenesReporte.ts`;
    - `lib/storage/SupabaseAlmacenImagenesReporte.ts` (design §3.2, §3.3).
  - **Hecho:** `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts` en verde, con un doble del
    cliente y sin red. `storage-solo-por-adaptador.guardia` sigue en verde.
- [ ] **T5 [P]. Doble de Storage** (dep. —; da soporte a R2, R9, R16 y R22 en el E2E).
  - **Archivo:** `e2e/_storage-falso/servidor.mjs`: la subida firmada, CORS y los límites del bucket
    (design §10).
  - **Hecho:** `tests/unit/e2e/storage-falso.test.ts` en verde, con sus casos nuevos y los de siempre.

## Bloque C — Servidor

- [ ] **T6. Contratos y repositorio** (dep. T2, T3; R12, R13, R19, R22).
  - **Archivos:**
    - en `lib/types/reporte-bug.ts`: `prepararSubidaImagenSchema`, el campo `imagenes` de
      `enviarReporteBugSchema`, `NuevaImagen` y los cambios de `NuevoBugReport`, `ReporteDetalleDatos` y
      `ReporteDetalleDTO` (design §6);
    - en `lib/repositories/BugReportRepository.ts`: `crear` con `createMany` de imágenes en la misma
      transacción, `detalle` con las imágenes en orden y `organizacionId`, y el `MOTIVO` nuevo (design
      §2.4, §7).
  - **Hecho:** `tests/integration/db/bug-report.test.ts` en verde con `DATABASE_URL` (un verde sin base
    no vale, `docs/verification.md`). Incluye el ajuste del `Object.keys(r)` de SLT-97.
- [ ] **T7. Subida, envío y correo** (dep. T4, T6; R9–R14, R20, R21).
  - **Archivos:**
    - `lib/interfaces/services/IReporteBugService.ts`: `prepararSubida` e `imagenes_invalidas`;
    - `lib/services/ReporteBugService.ts`: `prepararSubida` y `enviar` (design §5);
    - `lib/actions/reporte-bug.ts`: `prepararSubidaImagenReporteAction` y la composition root (design
      §4.1, §5.2);
    - `lib/services/email/plantillas/reporte-bug.ts`: los bloques de imágenes (design §8).
  - **Hecho:** en verde
    - `tests/unit/services/reporte-bug-service.test.ts`;
    - `tests/unit/actions/reporte-bug-action.test.ts`;
    - `tests/unit/services/email/plantilla-reporte-bug.test.ts`;
    - `modulos-reparto.guardia`.
- [ ] **T8. Detalle del superadmin, servidor** (dep. T4, T6; R22, R23).
  - **Archivos:**
    - `lib/services/ReportesBugPlataformaService.ts`: firma con `conEmpresa` y el TTL del detalle
      (design §7);
    - `lib/actions/reportes-bug-plataforma.ts`: la composition root.
  - **Hecho:** `tests/unit/services/reportes-bug-plataforma-service.test.ts` en verde, con el test de R4
    de SLT-97 ajustado.

## Bloque D — Interfaz

- [ ] **T9. Panel** (dep. T7; R1–R8, R11).
  - **Archivo:** `components/shared/ReporteBugBoton.tsx` (design §9.1, §9.3).
  - **Hecho:** `tests/components/ReporteBugBoton.test.tsx` en verde. El caso de SLT-87 «no hay campo de
    archivos» se sustituye por los de R1, citando este spec.
- [ ] **T10 [P]. Detalle, pantalla** (dep. T8; R22, R23).
  - **Archivos:**
    - `app/(app)/plataforma/reportes/[reporteId]/_components/ReporteDetalle.tsx`;
    - `app/(app)/plataforma/reportes/_components/reportes-textos.ts` (design §9.2, §9.3).
  - **Hecho:** `tests/components/ReporteDetalle.test.tsx` en verde.

## Bloque E — De punta a punta y cierre

- [ ] **T11. E2E, documentación y comprobación en preview** (dep. T5, T9, T10; R1, R2, R5, R7, R8, R13,
  R14, R16, R20, R22).
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
    - `node scripts/tamano-pr.mjs` en aviso y no en rojo, con la línea `tamano-pr-aceptado` si P2 se
      acepta;
    - **en el despliegue de preview, contra Supabase real** (design §15): con un `BUG_REPORT_BUCKET`
      que aún no exista, adjuntar una imagen crea el bucket privado con sus límites, el `PUT` del
      navegador sube sin `apikey` y sin error de CORS, y el enlace del correo abre la imagen. Lo hace el
      humano o el leader, y queda anotado en `progress/impl_SLT-98.md`. Si algo falla, se para y el spec
      vuelve al humano.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/components/ReporteBugBoton.test.tsx` «el panel muestra «Imágenes (opcional, máximo 5)», «Agregar imágenes» y «0/5 imágenes · PNG, JPG o WebP · hasta 5 MB cada una»»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R2 | `tests/components/ReporteBugBoton.test.tsx` «elegir una PNG la añade con su miniatura y «Quitar», la marca «Subiendo…», pide la subida con su tipo y tamaño y hace el PUT a la URL con el archivo y su content-type»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R3 | `tests/components/ReporteBugBoton.test.tsx` «con 5 imágenes «Agregar imágenes» está deshabilitado y el contador dice «5/5 imágenes»» y «elegir 7 con 3 en el panel añade 2 y avisa «Solo caben 5 imágenes: 5 no se agregaron.»» |
| R4 | `tests/components/ReporteBugBoton.test.tsx` «Quitar saca la imagen, baja el contador y no la manda al enviar»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R5 | `tests/components/ReporteBugBoton.test.tsx` «un GIF, un archivo vacío y uno de 5 MB + 1 byte quedan marcados con su motivo, sin pedir subida y solo con «Quitar»»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R6 | `tests/components/ReporteBugBoton.test.tsx` «si el PUT responde 500 o falla la red, la imagen dice «No se pudo subir.» con «Reintentar» y «Quitar», el texto sigue, y «Reintentar» pide una URL nueva y sube otra vez» |
| R7 | `tests/components/ReporteBugBoton.test.tsx` «mientras una imagen sube o tiene error, «Enviar» está deshabilitado, y con error se ve «Quita o reintenta las imágenes marcadas para poder enviar.»»; `e2e/reporte-de-bugs.spec.ts` (paso 1) |
| R8 | `tests/components/ReporteBugBoton.test.tsx` «el borrador guardado no lleva imágenes; al montar de nuevo el panel tiene el texto y 0/5 imágenes; Descartar y el envío bueno vacían las imágenes y revocan sus vistas previas»; `e2e/reporte-de-bugs.spec.ts` (paso 2) |
| R9 | `tests/unit/actions/reporte-bug-action.test.ts` «preparar sin sesión da unauthenticated; un tipo image/gif, un tamaño 0 o mayor que 5 MB y un campo de más dan validation_error, sin llamar al servicio»; `tests/unit/services/reporte-bug-service.test.ts` «preparar con un rol de plataforma o sin empresa da forbidden sin tocar el almacén» y «preparar pide la ruta <usuarioId>/<uuid>.<ext> dentro de conEmpresa de la empresa del actor»; `tests/unit/storage/supabase-almacen-imagenes-reporte.test.ts` «prepararSubida firma <org>/<ruta> sin upsert y devuelve la URL»; `tests/unit/e2e/storage-falso.test.ts` «un token de otra ruta no sube y sin upsert no pisa un objeto existente» |
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
| R22 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` «detalle firma las rutas con 3600 segundos dentro de conEmpresa de la empresa del reporte, en cada llamada, y el DTO no lleva rutas ni empresa» y «sin imágenes no llama al almacén»; `tests/components/ReporteDetalle.test.tsx` «el bloque Imágenes muestra una miniatura por imagen en orden, con alt «Imagen {n} del reporte» y enlace a la URL, y sin imágenes «Este reporte no trae imágenes.»»; `tests/integration/db/bug-report.test.ts` «detalle trae las imágenes por position y la empresa»; `e2e/reporte-de-bugs.spec.ts` (pasos 4 y 5) |
| R23 | `tests/unit/services/reportes-bug-plataforma-service.test.ts` «si firmar lanza, todas las url son null y el detalle se devuelve igual»; `tests/components/ReporteDetalle.test.tsx` «una imagen con url null muestra «No se pudo cargar esta imagen.» y el resto del detalle» |

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

**Total:** 32 archivos. Es justo el aviso del 80% (32 de 40), sin pasarlo; el máximo es 40. Son unas
2200-2500 líneas frente a un máximo de 1000, y el exceso queda pendiente de P2.

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
| Panel y detalle | ~420 |
| Documentación | ~15 |
| Doble de Storage | ~110 |
| Tests, contrato del doble y E2E | ~1050-1300 |

Si cambia el timestamp de la migración, se actualizan aquí sus dos rutas.
