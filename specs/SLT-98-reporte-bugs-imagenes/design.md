# SLT-98 — Reporte de bugs: imágenes · design.md

> Entrega 3 de 3. Construye sobre `bug_report`, `BugReportRepository`, `ReporteBugService` y el panel de
> SLT-87 «Reporte de bugs: botón flotante y envío», y sobre el detalle de SLT-97 «Reporte de bugs: módulo
> del superadmin». Lo marcado *(P1)* a *(P4)* sigue la decisión cerrada del mismo nombre en
> `requirements.md` (2026-11-10). La de más peso es P1: **las imágenes se suben al pulsar «Enviar», no al
> elegirlas.**

## Lo que ya existe

**Búsqueda.** El 2026-11-10 se buscó en `feature_list.json` (todos los estados), en `specs/` y en el
código «imagen», «adjunt», `bug-reports`, `BUG_REPORT_BUCKET`, `bug_report_image`, `createSignedUploadUrl`
y «subida firmada». El grafo no tiene índice para este worktree (`index_status`: proyecto no
encontrado), así que se buscó con Grep y Read.

Solo aparecieron esta ficha y sus dos hermanas, SLT-87 y SLT-97, ya en `dev`. **No hay ninguna subida
firmada directa en el repo:** todas las subidas de hoy pasan por el servidor (`SupabaseFileStorage.upload`,
`SupabaseAlmacen*.guardar`), y por eso el chat topa en 4 MB (`LIMITE_ADJUNTO_BYTES`).

**Lo que se reutiliza:**

| Pieza | Dónde | Uso aquí |
|---|---|---|
| Tabla `bug_report`, `BugReportRepository` en `comoPlataforma` con su entrada en `EXCEPCIONES_DE_PLATAFORMA` | `db/migrations/20261110120000_bug_report`, `lib/repositories/BugReportRepository.ts` | Se le cuelga `bug_report_image` (§2); `crear` y `detalle` la escriben y la leen. |
| `ReporteBugService.enviar` y `enviarReporteBugAction` | `lib/services/ReporteBugService.ts`, `lib/actions/reporte-bug.ts` | El envío gana la validación de imágenes (§5). La action nueva de subida va en el mismo archivo. |
| `ReportesBugPlataformaService.detalle` y la página del detalle | `lib/services/ReportesBugPlataformaService.ts`, `app/(app)/plataforma/reportes/[reporteId]/` | Firman las imágenes en cada carga (§7). |
| Carpeta de la empresa en el bucket | `lib/storage/carpeta-de-empresa.ts` (`empresaDelAlmacen`, `rutaEnCarpeta`) | El adaptador nuevo guarda en `<organizacion_id>/<ruta>`, como todos (§3.2). |
| Bucket creado solo en el primer uso | `SupabaseAlmacenDescargas.guardar` y `SupabaseAlmacenEnviosWhatsapp.guardar` (`esBucketInexistente`, `esBucketYaExistente`, reintento único) | El mismo patrón, con límites (§3.3). |
| Firma en lote parcial | `SupabaseSignedUrlProvider.createSignedUrls` | El mismo contrato `Record<ruta, url>`, que omite lo que no pudo firmar (§3.2). |
| Catálogo de buckets | `lib/storage/buckets.ts` | Entra `BUG_REPORTS: "bug-reports"`. |
| Lista de tipos de imagen | `GESTION_ALLOWED_MIME`, `POSTULACION_ALLOWED_MIME` (`["image/jpeg", "image/png", "image/webp"]`) | Mismo trío; la lista propia vive en `lib/config/reporte-bug.ts` para no acoplar el reporte a la gestión de órdenes. |
| Bloques del correo | `componerCorreo` con `boton` (HTML: botón y URL visible; texto plano: `<texto>: <url>`) y `nota` | Los enlaces del correo (§8). |
| Doble de Storage del E2E | `e2e/_storage-falso/servidor.mjs` y su test de contrato `tests/unit/e2e/storage-falso.test.ts` | Se le enseña la subida firmada y CORS (§10). |
| `<img>` con URL firmada y `eslint-disable-next-line @next/next/no-img-element` | `app/(app)/incidentes/_components/IncidentesAdminModule.tsx` | Las miniaturas del detalle. |

**Lo que NO se reutiliza, y por qué:**
- **`SupabaseFileStorage` y `SupabaseSignedUrlProvider`.** Suben por el servidor o solo firman lectura.
  Ninguno pide un permiso de subida ni crea el bucket. Añadirles esos métodos los cambiaría para las
  ~25 composition roots que los usan.
- **`validarAdjunto` del chat (`lib/config/chat-media-envio.ts`).** Su límite lo fija el transporte (4 MB)
  y su lista de tipos no admite WebP a propósito. Aquí son 5 MB y WebP sí entra.
- **`lib/supabase/browser.ts`.** No lo usa nadie y pide una clave anónima pública. El navegador sube con
  un `fetch` `PUT` a la URL firmada, que lleva su propio token (§4.2).

## 1. Resumen del flujo

```
ReporteBugBoton (cliente)
  │ elige archivos → miniatura local y «Quitar»; ¿PNG/JPG/WebP y 1 B–5 MB? (cortesía, R2, R5). No sube nada.
  │
  │ «Enviar» («Subiendo imágenes…», R6)
  │  1. prepararSubidaImagenesReporteAction({ imagenes: [{ tipo, tamano }] })  solo las aún no subidas (R9)
  │       sesión → zod → ReporteBugService.prepararSubidas
  │         → conEmpresa(org) → almacen.prepararSubida("<usuarioId>/<imagenId>.<ext>") por imagen
  │             createSignedUploadUrl; si «Bucket not found» → createBucket privado con límites → reintento (R16)
  │       ← { status: "listas", permisos: [{ imagenId, url }] }
  │  2. por cada una, en paralelo: fetch(url, { method: "PUT", body: archivo, … })  → Storage
  │       alguna falla → se marca «No se pudo subir.» y NO se manda el reporte (R7)
  │  3. todas subidas → enviarReporteBugAction({ descripcion, pagina, ventana, appInstalada,
  │                                               imagenes: [{ id, tipo }] })
  ▼
ReporteBugService.enviar
  ├─ puerta de empresa (SLT-87 R11)
  ├─ por cada imagen: conEmpresa(org) → almacen.leer(ruta) → existe, 1 B–5 MB, firma de bytes (R10)
  │     alguna falla → borra las que fallaron (mejor esfuerzo) → { status: "imagenes_invalidas", imagenes } (R11)
  ├─ BugReportRepository.crear(... imagenes)  ← una transacción: bug_report + bug_report_image (R13)
  ├─ conEmpresa(org) → almacen.firmar(rutas, 24 h)  (R20, R21)
  └─ un correo por destinatario, con «Ver imagen {n}: <url>»
  ▼
{ status: "enviado" }  (R14: sin enlaces)

/plataforma/reportes/[reporteId] → ReportesBugPlataformaService.detalle
  └─ conEmpresa(reporte.organizacionId) → almacen.firmar(rutas, 24 h) en cada carga (R22, R23)
```

## 2. Modelo de datos

### 2.1 Tabla `bug_report_image` (de plataforma)

Una fila por imagen. Va en una tabla y no en una columna (alternativa A, §12). Los identificadores van en
inglés, como `bug_report` (R19).

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `TEXT` PK | El `imagenId` (uuid) que dio el servidor al preparar la subida. También es el nombre del archivo. |
| `bug_report_id` | `TEXT NOT NULL` FK → `bug_report(id)` `ON DELETE CASCADE` | Muere con su reporte (borrado de empresas demo, SL-43). |
| `position` | `SMALLINT NOT NULL` | El orden en que se adjuntó, de 1 a 5. `CHECK (position BETWEEN 1 AND 5)` y `UNIQUE (bug_report_id, position)`: entre los dos, nunca más de 5 por reporte (R19). |
| `storage_path` | `VARCHAR(255) NOT NULL UNIQUE` | Ruta relativa a la carpeta de la empresa: `<reporter_user_id>/<id>.<ext>` (§3.1). `CHECK (storage_path ~ '^[^/]+/[^/]+\.(png|jpg|webp)$')`. |
| `content_type` | `VARCHAR(20) NOT NULL` | `CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp'))` (R19). |
| `size_bytes` | `INTEGER NOT NULL` | `CHECK (size_bytes BETWEEN 1 AND 5242880)`. Es el `IMAGEN_BYTES_MAX` de §6, con un comentario que cita el archivo *(P4)*. |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | |

- **Sin `updated_at` ni `deleted_at`, a propósito.** La fila no se edita ni se borra sola: editar o borrar
  las imágenes de un reporte enviado no entra («Lo que NO entra»). Muere con su reporte. Es el mismo
  criterio que `bug_report_status_change` en SLT-97.
- **Índice:** el `UNIQUE (bug_report_id, position)` sirve también para leer las imágenes de un reporte
  en orden. No hace falta otro.
- **Prisma:** el modelo es `BugReportImage` (`@@map("bug_report_image")`), con la relación `bugReport
  BugReport` y el inverso `images BugReportImage[]` en `BugReport`.
- **Clasificación:** `{ modelo: "BugReportImage", tabla: "bug_report_image" }` en `MODELOS_DE_PLATAFORMA`
  (`lib/db/modelos-de-negocio.ts`), con el comentario «sin acceso para `servi_app`; lo escribe el servidor
  en plataforma (SLT-98)».
- **Sin `organization_id`:** la empresa se lee del `bug_report` padre. La tabla es de plataforma y no se
  reparte por empresa.

### 2.2 Acceso (R18)

```sql
ALTER TABLE "bug_report_image" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bug_report_image" FROM servi_app;
```

`ALTER DEFAULT PRIVILEGES` (`20261022130000`) le daría CRUD a `servi_app`: de ahí el `REVOKE`. La RLS sin
políticas es la segunda red, como en `bug_report`.

### 2.3 Migración

`db/migrations/20261112120000_bug_report_image/`, con un timestamp posterior a la última migración de
`dev` al crearla, escrita a mano como las demás (P3006 de `db:migrate:create`).
- **`migration.sql`:** la tabla, sus `CHECK`, el `UNIQUE` de la ruta, el `UNIQUE (bug_report_id,
  position)`, la FK, la RLS y el `REVOKE`.
- **`down.sql`:** `DROP TABLE IF EXISTS "bug_report_image";` y nada más, porque no se crea ningún tipo.
  Bajarla deja en el bucket los archivos sin fila: es lo esperado de un down.

Dispara `gate.disparadores` (esquema y migraciones): corren en local los tests de migración y
`verificar-rls`.

### 2.4 Quién escribe

Solo `BugReportRepository`, dentro del `comoPlataforma` que ya abre `crear`. El repositorio no tiene
ningún `update` ni `delete` de `bugReportImage`. La entrada de `EXCEPCIONES_DE_PLATAFORMA` no cambia de
archivo. El `MOTIVO` de `crear`, en el propio repositorio, pasa a decir «guardar un reporte de problema y
sus imágenes en `bug_report` y `bug_report_image`…».

## 3. Almacenamiento

### 3.1 El bucket y la ruta de cada objeto

- **Bucket:** `bucketReporteBug()` de `lib/config/reporte-bug.ts` (§6). Toma `BUG_REPORT_BUCKET` recortada
  o, si está vacía o falta, `BUCKETS.BUG_REPORTS` (`"bug-reports"`). Lo lee el servidor; en el navegador
  no se llama.
- **Ruta relativa:** `<usuarioId>/<imagenId>.<ext>`, con `ext` de `EXTENSION_POR_TIPO` (`png`, `jpg`,
  `webp`). El adaptador le antepone la carpeta de la empresa, así que el objeto queda en
  `<organizacion_id>/<usuario_id>/<imagen_id>.<ext>`.
  - Los dos ids son uuid y no llevan nada que escriba el usuario: ni el nombre del archivo ni la
    extensión que traía.
  - La empresa y el usuario salen de la sesión (R9). En el envío, la ruta se reconstruye con los mismos
    datos de sesión, así que un usuario no puede adjuntar el archivo de otro: con el mismo `imagenId`, la
    ruta apunta a su propia carpeta, donde ese archivo no está (R10).

### 3.2 Adaptador `SupabaseAlmacenImagenesReporte`

`lib/storage/SupabaseAlmacenImagenesReporte.ts` implementa `IAlmacenImagenesReporte`
(`lib/interfaces/external/IAlmacenImagenesReporte.ts`). Es el molde de `SupabaseAlmacenDescargas`:
- **cliente Storage perezoso e inyectable**, con la superficie mínima `ImagenesStorageClientLike`;
- **service role** (`createServerClient`), nunca desde el cliente;
- **bucket inyectable**, por defecto `bucketReporteBug()`;
- **toda ruta pasa por `empresaDelAlmacen` y `rutaEnCarpeta`.** En plataforma o sin empresa falla con
  `EmpresaNoResuelta` antes de llamar a Storage, como todos los adaptadores (`docs/architecture.md >
  Storage (SL-19)`).

Vive en `lib/storage/`, así que `storage-solo-por-adaptador.guardia` no pide excepción.

```ts
export interface IAlmacenImagenesReporte {
  /** R9, R16: URL firmada de subida (sin upsert) para `ruta`; crea el bucket si falta. */
  prepararSubida(ruta: string): Promise<{ url: string }>;
  /** R10: los bytes, o `null` si el objeto (o el bucket) no existe. Otro error se propaga. */
  leer(ruta: string): Promise<Uint8Array | null>;
  /** R20–R23: URL firmada de lectura por ruta. Parcial: omite la que no pudo firmar. */
  firmar(rutas: string[], ttlSegundos: number): Promise<Record<string, string>>;
  /** R11: borra lo que el envío rechazó. Propaga el error; el servicio lo trata como mejor esfuerzo. */
  borrar(rutas: string[]): Promise<void>;
}
```

| Método | SDK | Detalle |
|---|---|---|
| `prepararSubida` | `from(b).createSignedUploadUrl(completa)` | Sin `{ upsert: true }`: el token no pisa un objeto que ya existe (R9). Devuelve `data.signedUrl`, que es absoluta: `SUPABASE_URL/storage/v1/object/upload/sign/<b>/<org>/<usuario>/<id>.<ext>?token=…`. Storage la deja valer 2 horas, y el SDK no permite cambiarlo. |
| `leer` | `from(b).download(completa)` | «not found» (mensaje o 404) → `null`. Devuelve `new Uint8Array(await data.arrayBuffer())`. |
| `firmar` | `from(b).createSignedUrls(completas, ttl)` | Re-indexa por la ruta relativa con `rutaRelativa`, como `SupabaseSignedUrlProvider`. Si la llamada entera da error, lanza. |
| `borrar` | `from(b).remove(completas)` | Con lista vacía no llama. |

### 3.3 Creación del bucket (R16)

En `prepararSubida`, el mismo patrón que `SupabaseAlmacenDescargas.guardar`:
1. Pide la URL. Si el error es «bucket no existe» (`/bucket not found|not found/i` o `statusCode` 404),
   llama a:

   ```ts
   createBucket(bucket, {
     public: false,
     fileSizeLimit: IMAGEN_BYTES_MAX,
     allowedMimeTypes: [...TIPOS_IMAGEN],
   })
   ```

   Son las opciones de `StorageBucketApi.createBucket` de `@supabase/storage-js`, ya instalada.
2. Un «ya existe» (`/already exists/` o 409) es otro envío que lo creó a la vez y se ignora. Cualquier
   otro error lanza `fallo al crear el bucket de reportes: <mensaje>`.
3. Pide la URL otra vez, y solo una.

Un bucket que ya existe no se toca. Si alguien lo creó a mano con otros límites, manda lo que tenga: el
servidor valida igual (R10).

## 4. La subida

La subida ocurre **dentro del envío**, al pulsar «Enviar», y nunca al elegir la imagen *(P1)*. Una sola
llamada pide los permisos de todas las imágenes que faltan por subir.

### 4.1 Action `prepararSubidaImagenesReporteAction` (R9)

En `lib/actions/reporte-bug.ts`, junto a `enviarReporteBugAction`. Es de núcleo por el archivo
(`"reporte-bug": "nucleo"` en `lib/modulos/reparto.ts`), así que `reparto.ts` no cambia.

- **Orden:** sesión (sin ella → `unauthenticated`) → zod → `servicio.prepararSubidas(actor, entrada)`. El
  servicio es la puerta (§5.1).
- **Entrada** (`prepararSubidasImagenesSchema`, `strict` en los dos niveles):

  ```ts
  {
    imagenes: z
      .array(z.object({ tipo: z.enum(TIPOS_IMAGEN), tamano: z.number().int().min(1).max(IMAGEN_BYTES_MAX) }).strict())
      .min(1)
      .max(IMAGENES_MAX),
  }
  ```

  El tamaño declarado sirve para cortar pronto. La red de verdad es el bucket (`fileSizeLimit`) y la
  lectura del envío (R10).
- **Salida:** los permisos van en el mismo orden que la entrada.

  ```ts
  | { status: "listas"; permisos: { imagenId: string; url: string }[] }
  | { status: "unauthenticated" } | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "error" }
  ```

- **Fallo:** `{ status: "error" }`, y en el log `[reporte-bug] fallo al preparar la subida
  causa=<error.name>`.

### 4.2 El navegador: el envío en tres pasos (R6, R7)

Al pulsar «Enviar», el panel pasa a `enviando`. El botón muestra «Subiendo imágenes…» mientras hay
imágenes por subir y «Enviar» con su `loading` durante el paso 3.
1. **Permisos.** Si hay imágenes en estado `pendiente` o `error_subida`, llama a
   `prepararSubidaImagenesReporteAction` con ellas, en el orden del panel.
   - Si no responde `listas`, no se sube nada: esas imágenes pasan a `error_subida` y el reporte no se
     manda.
2. **Subidas,** en paralelo, una por imagen:

   ```ts
   await fetch(url, { method: "PUT", body: archivo, headers: { "content-type": tipo, "x-upsert": "false" } });
   ```

   - **El cuerpo es el `File` crudo, no `FormData`:** es lo que hace `uploadToSignedUrl` de storage-js
     con un cuerpo que no es `Blob`, y lo que acepta el doble (que rechaza el multipart a propósito).
   - **Lo bueno es un 2xx.** La imagen pasa a `subida` y guarda su `imagenId`. Cualquier otra
     respuesta, o un fallo de red, la deja en `error_subida`. La respuesta no se lee.
   - **No hay cliente de Supabase en el navegador ni clave anónima:** la URL lleva su token.
   - Si alguna queda en `error_subida`, el envío para aquí: **el reporte no se manda** (R7), y el panel
     vuelve a `editando` con el texto intacto.
3. **Reporte.** Con todas en `subida`, llama a `enviarReporteBugAction` con `imagenes: [{ id: imagenId,
   tipo }]`, en el orden del panel.

**Las que ya subieron se reutilizan, no se borran.** Es lo más simple que pidió el humano en P1.
- Una imagen en `subida` conserva su `imagenId`. «Reintentar», que repite el envío entero, solo pide
  permiso para las que fallaron, y el reporte usa las ya subidas.
- No hace falta ninguna action de borrado ni ningún permiso de borrar para el navegador.
- Lo mismo vale si falla el paso 3 (`error`): «Enviar» otra vez reutiliza las subidas.
- **El único resto posible:** que el usuario quite una imagen ya subida, descarte o cierre la pestaña
  **después** de un envío que falló a medias. Esos objetos quedan en el bucket sin fila. Es un caso raro
  (hace falta un fallo de red), y por P1 no hay purga. Queda escrito en §15.

## 5. Servicio `ReporteBugService`

### 5.1 `prepararSubidas(actor, { imagenes })` (R9)

1. **Puerta**, la misma de `enviar`: rol de plataforma o sin `organizacionId` → `forbidden`.
2. Para cada imagen, en orden: `imagenId = nuevoId()`, con `randomUUID` inyectable, y `ruta =
   <actor.usuarioId>/<imagenId>.<ext>`.
3. Dentro de un solo `conEmpresa(organizacionId, …)`, `almacen.prepararSubida(ruta)` para cada ruta.
   - El contexto se abre aquí, explícito, en vez de dejar que `empresaDelAlmacen` lo saque de la sesión:
     así la empresa es la del actor ya resuelto, y el test no depende de `next/headers`.
   - Van en serie, para que la creación del bucket (§3.3) la haga como mucho la primera.
   - Si una falla, falla la llamada entera.
4. Devuelve `{ status: "listas", permisos: [{ imagenId, url }] }`.

### 5.2 `enviar(actor, entrada, entorno)` (cambia)

El constructor gana `almacen: IAlmacenImagenesReporte` como **segundo** parámetro, antes de `sender`. El
resto de parámetros no cambia; `nuevoId` va al final, con su valor por defecto.

1. **Puerta** (SLT-87 R11), sin cambios.
2. **Validación de imágenes (R10).** Con `entrada.imagenes` vacía no se toca Storage. Si hay imágenes,
   dentro de `conEmpresa(organizacionId, …)` y **en serie**, para no tener 25 MB en memoria a la vez,
   para cada `{ id, tipo }`:
   - `ruta = <actor.usuarioId>/<id>.<ext(tipo)>` y `bytes = await almacen.leer(ruta)`;
   - es válida si `bytes !== null`, si `1 ≤ bytes.length ≤ IMAGEN_BYTES_MAX` y si `tipoPorFirma(bytes)
     === tipo` (§6).

   Si `leer` lanza un error que no es «no existe», se propaga: la action responde `error` y el panel
   avisa con el texto de SLT-87 R10.
3. **Rechazo (R11).** Si alguna no vale:
   - borra con `almacen.borrar` las rutas de las que existían y no valen, como mejor esfuerzo: un fallo se
     registra como `[reporte-bug] fallo al borrar imagenes rechazadas causa=<name>` y no cambia la
     respuesta;
   - devuelve `{ status: "imagenes_invalidas", imagenes: [ids] }`, sin llamar al repositorio ni al
     emisor.
4. **Guardado (R13).** `repo.crear({ ...lo de SLT-87, imagenes })`, con `imagenes: [{ id, position: i + 1,
   storagePath: ruta, contentType: tipo, sizeBytes: bytes.length }]`. El tamaño es el medido, no un
   número del cliente. Si `crear` devuelve `null` → `forbidden`.
5. **Enlaces (R20, R21).** Si hay imágenes: `conEmpresa(organizacionId, () => almacen.firmar(rutas,
   ENLACE_CORREO_SEGUNDOS))`.
   - Si lanza: se registra `[reporte-bug] fallo al firmar las imagenes reporte=<id> causa=<name>` y se
     sigue con `{}`.
   - Una ruta que falte en el resultado lleva el aviso de §8 en el correo.
   - Se firma una sola vez, y los mismos enlaces van a todos los destinatarios.
6. **Correo:** como en SLT-87, con `imagenes: [{ posicion, url: string | null }]` en los datos de la
   plantilla.
7. Devuelve `{ status: "enviado" }`. Sin enlaces ni datos de las imágenes (R14).

**Contrato de `enviar`** (`lib/types/reporte-bug.ts`): `enviarReporteBugSchema` gana

```ts
imagenes: z
  .array(z.object({ id: z.string().uuid(), tipo: z.enum(TIPOS_IMAGEN) }).strict())
  .max(IMAGENES_MAX)
  .default([])
  .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, "Imagen repetida.")
```

Cumple R12. Sin el campo, es un reporte sin imágenes, igual que en SLT-87.

**Salida de la action:** `EnviarReporteBugServiceResult` (`lib/interfaces/services/IReporteBugService.ts`)
gana `| { status: "imagenes_invalidas"; imagenes: string[] }`. La interfaz gana `prepararSubidas`.

**Composition root** (`construirServicio` en `lib/actions/reporte-bug.ts`): `new ReporteBugService(new
BugReportRepository(getPrismaClient()), new SupabaseAlmacenImagenesReporte(), crearEmailSender())`.

## 6. Configuración y tipos

En `lib/config/reporte-bug.ts`, que también importa el navegador. Por eso no importa nada del servidor;
`process.env` solo lo lee `bucketReporteBug`, y el navegador no la llama.

```ts
export const IMAGENES_MAX = 5;
export const IMAGEN_BYTES_MAX = 5 * 1024 * 1024;   // P4; el CHECK de bug_report_image usa 5242880
export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"] as const;
export type TipoImagenReporte = (typeof TIPOS_IMAGEN)[number];
export const EXTENSION_POR_TIPO: Record<TipoImagenReporte, "png" | "jpg" | "webp">;
export const ENLACE_CORREO_SEGUNDOS = 24 * 60 * 60;   // decisión del 2026-11-10
export const ENLACE_DETALLE_SEGUNDOS = 24 * 60 * 60;  // P3: igual que el del correo
export function bucketReporteBug(valor = process.env.BUG_REPORT_BUCKET): string;
/** R10: el tipo que dicen los primeros bytes, o null. Pura. */
export function tipoPorFirma(bytes: Uint8Array): TipoImagenReporte | null;
```

**`tipoPorFirma`:**
- PNG: `89 50 4E 47 0D 0A 1A 0A` (8 bytes);
- JPEG: `FF D8 FF`;
- WebP: `52 49 46 46` («RIFF») en 0–3 y `57 45 42 50` («WEBP») en 8–11.

Con menos bytes de los que mira, `null`.

**`lib/types/reporte-bug.ts`:**
- `prepararSubidasImagenesSchema` y el campo `imagenes` de `enviarReporteBugSchema` (§4.1, §5.2).
- `NuevoBugReport` gana `imagenes: NuevaImagen[]`, con `{ id, position, storagePath, contentType,
  sizeBytes }`. `BugReportCreado` no cambia: las URL las pone el servicio.
- `ReporteDetalleDatos`, que lee el repositorio, gana:
  - `organizacionId: string`;
  - `imagenes: { id: string; ruta: string }[]`, en orden de `position`.
- `ReporteDetalleDTO`, el del cliente, pasa a `Omit<ReporteDetalleDatos, "organizacionId" | "imagenes">`
  más `destinosPermitidos` e `imagenes: ImagenDelReporteDTO[]`, con `{ id: string; url: string | null
  }`. **La ruta y el id de la empresa no cruzan al navegador.**

Así `IBugReportRepository.ts` no cambia: sus firmas usan esos tipos.

**`.env.example` (R17),** debajo de `BUG_REPORT_EMAILS`:

```
# SLT-98 — bucket PRIVADO de Supabase Storage para las imagenes de los reportes de problema.
# Vacio o ausente: "bug-reports". La app lo crea sola en la primera subida, privado, con un
# limite de 5 MB por archivo y solo PNG, JPG y WebP. Las imagenes solo se leen por enlace
# firmado de 24 h, en el correo y en el detalle del superadmin.
BUG_REPORT_BUCKET=
```

**`lib/storage/buckets.ts`:** `BUG_REPORTS: "bug-reports"`, con un comentario como el de `DESCARGAS`
(lo crea solo, privado; el nombre efectivo lo da `lib/config/reporte-bug.ts`).

**Datos que dependen del país:** ninguno.

## 7. Repositorio y detalle del superadmin

**`BugReportRepository.crear`:** tras `bugReport.create`, en la misma `$transaction`, hace
`tx.bugReportImage.createMany({ data: imagenes.map(… bugReportId: fila.id) })` si hay imágenes. Un
`CHECK` o un `UNIQUE` que falle deshace también el reporte (R13).

**`BugReportRepository.detalle`:** tras el historial, en serie como el resto, hace
`tx.bugReportImage.findMany({ where: { bugReportId }, orderBy: { position: "asc" }, select: { id,
storagePath } })`. Devuelve también `organizacionId: r.organizationId`.

**`ReportesBugPlataformaService.detalle` (R22, R23):**
- El constructor gana `almacen: IAlmacenImagenesReporte`.
- Sin imágenes, no llama a Storage.
- Con imágenes:

  ```ts
  conEmpresa(reporte.organizacionId, () => almacen.firmar(rutas, ENLACE_DETALLE_SEGUNDOS))
  ```

  - **Por qué `conEmpresa`:** el superadmin no tiene empresa, y el adaptador, como todos, trabaja en la
    carpeta de la empresa del contexto. El contexto se abre con la empresa del reporte, que sale de la
    base y no de la entrada. Es el mismo recurso que usa `scripts/demo-qa/borrar.ts` para borrar los
    archivos de una empresa desde fuera de ella. El servicio no abre `comoPlataforma`: las lecturas de la
    base las hace el repositorio en el suyo.
  - Si `firmar` lanza, todas las `url` quedan en `null` y se registra `[reportes-bug-plataforma] fallo al
    firmar imagenes reporte=<id> causa=<name>`. El detalle se pinta igual (R23).
- Cada llamada firma de nuevo. La página es dinámica (lee sesión), así que no hay caché que reutilice
  enlaces (R22).

**Composition root** (`construirServicio` en `lib/actions/reportes-bug-plataforma.ts`): `new
ReportesBugPlataformaService(new BugReportRepository(getPrismaClient()), new
SupabaseAlmacenImagenesReporte())`. El servicio sigue sin emisor de correo ni cola (SLT-97 R4): el test
de R4 se ajusta a «solo recibe el repositorio y el almacén de imágenes».

## 8. Correo (`plantillaReporteBug`)

`ReporteBugCorreoParams` gana `imagenes: { posicion: number; url: string | null }[]`, con `[]` por
defecto.

- **Con imágenes**, los bloques van detrás de la descripción y antes del contexto:
  1. `parrafo` «Imágenes ({k}). Los enlaces vencen en 24 horas:»;
  2. por cada imagen, en orden:
     - con `url`: `boton` con el texto «Ver imagen {n}» y esa `url`. En texto plano queda «Ver imagen {n}:
       <url>»; en HTML, el botón y la URL visible debajo;
     - sin `url`: `nota` «Imagen {n}: no se pudo generar el enlace. Mírala en el detalle del reporte.».
- **Sin imágenes:** el correo de SLT-87, idéntico (R20).
- **Escapado:** las URL y los textos pasan por `componerCorreo` como todo lo demás. No se arma HTML propio.
- **Sin adjuntos:** `EmailMessage` no lleva `attachments` (R20). El logo de marca va en línea, como ya
  iba.

## 9. Interfaz y textos

### 9.1 Panel (`components/shared/ReporteBugBoton.tsx`)

**Estado de las imágenes:** un `useReducer` en el mismo archivo, con una lista de hasta 5 elementos
`{ clave, archivo, vistaPrevia, estado, imagenId?, tipo }`.
- `clave` es local (`crypto.randomUUID()`) y sirve para React y para quitar.
- `vistaPrevia` es `URL.createObjectURL(archivo)`. Se revoca al quitar, al vaciar y al desmontar.
- `estado`:
  - `pendiente`: elegida y válida en el cliente, todavía sin subir;
  - `subiendo`: solo durante el envío;
  - `subida`: con su `imagenId`; se reutiliza en un reintento (§4.2);
  - `error_tipo`, `error_vacia` y `error_tamano`, que solo admiten «Quitar»;
  - `error_subida`, que admite «Reintentar» y «Quitar»;
  - `rechazada`, la que el servidor no aceptó y solo admite «Quitar».

**Sección «Imágenes»**, debajo del contador de caracteres:
- **Rótulo** (R1).
- **Una rejilla de miniaturas** `<img src={vistaPrevia}>`. Lleva `eslint-disable-next-line
  @next/next/no-img-element` con el motivo «object URL local», como en `ChatConversacion`. Cada
  miniatura lleva su estado en texto y sus botones, con `aria-label` numerados.
- **El botón «Agregar imágenes»** abre un `<input type="file" accept="image/png,image/jpeg,image/webp"
  multiple hidden>`. Está deshabilitado con 5 imágenes o mientras se envía (R3).
- **El contador** «{n}/5 imágenes», en un `<span aria-live="polite">`, seguido de « · PNG, JPG o WebP ·
  hasta 5 MB cada una».

**Al elegir archivos:**
- Se toman los primeros `5 - n`. Si sobran, sale el aviso de sobrantes (R3).
- Cada archivo se clasifica por `file.type` y `file.size`. Si no vale, queda con su error (R5). Si vale,
  queda `pendiente`. **No se llama al servidor ni a Storage** (R2, P1).
- Se vacía `input.value`, para poder volver a elegir el mismo archivo.

**«Enviar»** (R6, R7):
- Deshabilitado si la descripción está vacía (SLT-87 R5), si alguna imagen está en un estado de error
  o mientras se envía.
- Corre los tres pasos de §4.2. En el paso de las subidas, el botón dice «Subiendo imágenes…» y cada
  imagen que sube, «Subiendo…».

**«Reintentar»** (en una imagen en `error_subida`) repite el envío entero, igual que «Enviar»: sube las
que quedan en `pendiente` o en `error_subida`, reutiliza las que están en `subida` y manda el reporte.
Mientras alguna imagen tenga error, «Enviar» queda deshabilitado, y «Reintentar» es la forma de volver a
probar sin quitarla.

**Respuestas del envío:**
- `enviado`: «Gracias» y se vacían el texto y las imágenes (R8).
- `imagenes_invalidas`: las imágenes con esos ids pasan a `rechazada`; el texto queda (R11). No sale el
  aviso general de fallo, sino el de bloqueo (R7).
- Cualquier otra: el aviso de SLT-87 R10, sin tocar texto ni imágenes. Las ya `subida` se reutilizan en
  el próximo «Enviar».

**«Descartar»** vacía el texto y las imágenes (R8). **Cerrar el panel** no toca las imágenes: siguen
mientras el layout siga montado. Al recargar, se pierden (R8).

### 9.2 Detalle (`ReporteDetalle.tsx`)

Una cuarta `Card`, «Imágenes», entre «Contexto» y «Estado»:
- **Con imágenes:** una rejilla. Cada imagen es un `<a href={url} target="_blank" rel="noopener
  noreferrer" aria-label="Abrir la imagen {n} en grande">` con un `<img src={url} alt="Imagen {n} del
  reporte" loading="lazy">` dentro, con `object-cover` y un lado fijo de 8 rem.
- **Con `url` en `null`:** en su lugar, una caja con el texto de fallo (R23).
- **Sin imágenes:** el texto de vacío (R22).

### 9.3 Textos

Los del panel son constantes de `TEXTOS_REPORTE_BUG`, en `ReporteBugBoton.tsx`. Los del detalle van en
`TEXTOS_REPORTE_DETALLE`, en `reportes-textos.ts`. Los del correo, en la plantilla. Los tests los comparan
literalmente.

| Dónde | Texto exacto |
|---|---|
| Rótulo de la sección (R1) | «Imágenes (opcional, máximo 5)» |
| Botón (R1, R3) | «Agregar imágenes» |
| Contador (R1) | «{n}/5 imágenes»: «0/5 imágenes», «2/5 imágenes», «5/5 imágenes» |
| Ayuda junto al contador (R1) | «PNG, JPG o WebP · hasta 5 MB cada una», separada del contador por « · » |
| Miniatura del panel | `alt` «Imagen {n}» |
| Quitar (R4) | «Quitar», con `aria-label` «Quitar imagen {n}» |
| Reintentar (R7) | «Reintentar», con `aria-label` «Reintentar imagen {n}» |
| Botón «Enviar» mientras suben las imágenes (R6) | «Subiendo imágenes…» |
| Imagen mientras sube, solo durante el envío (R6) | «Subiendo…» |
| Tipo no admitido (R5) | «Solo PNG, JPG o WebP.» |
| Archivo vacío (R5) | «El archivo está vacío.» |
| Demasiado grande (R5) | «Pesa más de 5 MB.» |
| Fallo de subida (R7) | «No se pudo subir.» |
| Rechazada por el servidor (R11) | «No pudimos aceptar esta imagen. Quítala para enviar.» |
| Sobrantes (R3) | «Solo caben 5 imágenes: {m} no se agregaron.» |
| Bloqueo del envío (R7) | «Quita o reintenta las imágenes marcadas para poder enviar.» |
| Correo: encabezado (R20) | «Imágenes ({k}). Los enlaces vencen en 24 horas:» |
| Correo: cada enlace (R20) | «Ver imagen {n}» (texto plano: «Ver imagen {n}: <url>») |
| Correo: sin enlace (R21) | «Imagen {n}: no se pudo generar el enlace. Mírala en el detalle del reporte.» |
| Detalle: bloque (R22) | «Imágenes» |
| Detalle: imagen (R22) | `alt` «Imagen {n} del reporte»; enlace `aria-label` «Abrir la imagen {n} en grande» |
| Detalle: sin imágenes (R22) | «Este reporte no trae imágenes.» |
| Detalle: sin enlace (R23) | «No se pudo cargar esta imagen.» |

## 10. Doble de Storage del E2E (`e2e/_storage-falso/servidor.mjs`)

Hoy no atiende la subida firmada (`noAtendida` → 501), ni CORS, ni los límites del bucket. Le faltan
cuatro cosas, con las rutas y las formas de `@supabase/storage-js` instalada:

1. **`createSignedUploadUrl`:** `POST /object/upload/sign/<bucket>/<path>`, con `x-upsert` opcional
   (`StorageFileApi.ts:381-420`).
   - Responde `{ url: "/object/upload/sign/<bucket>/<path>?token=<t>" }` y guarda el token con su clave,
     su `upsert` y 2 horas de vida.
   - Si el bucket no está en `estado.buckets`, responde `400 { statusCode: "404", error: "Bucket not
     found", message: "Bucket not found" }`. Así el E2E recorre la creación del bucket (R16).
   - Si el objeto existe y no hay upsert, responde `DUPLICADO`.
2. **`uploadToSignedUrl` / `PUT` del navegador:** `PUT /object/upload/sign/<bucket>/<path>?token=<t>`
   (`:275-342`).
   - Valida que el token exista, sea de esa clave y no haya vencido. Si no, `TOKEN_INVALIDO`.
   - Rechaza el multipart, como `subir`.
   - Aplica los límites guardados del bucket: más bytes que `file_size_limit` dan `400 { statusCode:
     "413", … }`, y un `content-type` fuera de `allowed_mime_types` da `400 { statusCode: "415", … }`.
   - No pisa un objeto existente sin upsert.
   - Responde `{ Key }`.
3. **`createBucket` con opciones:** guarda `public`, `file_size_limit` y `allowed_mime_types` del cuerpo
   (`StorageBucketApi.ts:194-227`) en un `Map` de buckets. El `Set` de hoy pasa a ser las claves de ese
   mapa. Las subidas normales siguen creando el bucket implícito sin límites, como hoy.
4. **CORS:**
   - todas las respuestas llevan `Access-Control-Allow-Origin: *`;
   - `OPTIONS` en cualquier ruta de `/storage/v1/` responde `204`, con `Access-Control-Allow-Methods: GET,
     POST, PUT, DELETE, OPTIONS` y `Access-Control-Allow-Headers: authorization, apikey, content-type,
     x-upsert, cache-control, x-client-info`.

   Hace falta porque el navegador del E2E (`BASE_URL`) sube a `127.0.0.1:<PUERTO_STORAGE>`, que es otro
   origen. Supabase Storage real responde CORS a los navegadores.

El test de contrato `tests/unit/e2e/storage-falso.test.ts` lo cubre con el cliente real (`createClient`).
Casos:
- `createSignedUploadUrl` + `uploadToSignedUrl` + `download` devuelven los bytes;
- sin bucket, «Bucket not found»; tras `createBucket` con límites, un archivo que pasa el límite da 413 y
  un tipo no permitido da 415;
- un token de otra ruta da error;
- `OPTIONS` responde los encabezados de CORS.

## 11. E2E (amplía `e2e/reporte-de-bugs.spec.ts`)

Un `describe` nuevo, «SLT-98 — imágenes», en el proyecto `aislamiento`. Las imágenes se generan en el
propio spec como `Buffer`: dos PNG válidas de 1×1 y un GIF (`GIF89a…`). Se pasan con
`setInputFiles({ name, mimeType, buffer })` sobre el `input` de archivos del panel; no hace falta ningún
archivo en disco.

1. **Adjuntar** (R1, R2, R5, R7): el maestro abre `/ordenes` y el panel, y escribe una descripción única.
   Adjunta las dos PNG y el GIF.
   - El GIF muestra «Solo PNG, JPG o WebP.» y el aviso de bloqueo, y «Enviar» queda deshabilitado.
   - Hasta aquí no ha habido ninguna petición a Storage: se comprueba con `page.on("request")` filtrando
     por `/storage/v1/` (R2).
   - «Quitar imagen 3» deja «2/5 imágenes» y habilita «Enviar».
2. **Enviar** (R6, R13, R14): «Enviar» pasa por «Subiendo imágenes…», sale «Gracias, recibimos tu
   reporte» y el panel queda sin imágenes y en «0/5 imágenes».
3. **Correo** (R20): en el log del servidor, el correo a `reportes-e2e@example.test` con la descripción
   lleva «Ver imagen 1: <url>» y «Ver imagen 2: <url>». Un `page.request.get(url)` de la primera da 200
   con `image/png`.
4. **Detalle** (R22): el superadmin entra con OTP (`conCandadoDelSuperadmin`), filtra por la empresa de la
   corrida y abre el reporte.
   - El bloque «Imágenes» tiene dos `img` con `alt` «Imagen 1 del reporte» y «Imagen 2 del reporte».
   - Las dos cargan: `expect.poll` sobre `naturalWidth > 0`.
   - Tras `page.reload()`, el `src` de la primera es distinto del de antes, porque el enlace es nuevo.
5. **Sin imágenes** (R22): el reporte que envía el describe de SLT-97 abre con «Este reporte no trae
   imágenes.». Es una aserción más en ese test, sin crear otro reporte.

Todo se espera con `expect`, nunca con `waitForTimeout`. Las descripciones llevan el UUID de la corrida.
`playwright.config.ts` no cambia: `BUG_REPORT_BUCKET` vacío da `bug-reports`, y el doble ya arranca.

## 12. Alternativas descartadas

- **A. Una columna `images JSONB` (o `TEXT[]`) en `bug_report`.**
  - No admite un `CHECK` por imagen de tipo y tamaño, ni el `UNIQUE` de la ruta.
  - El «máximo 5» quedaría en una expresión sobre el JSON.
  - Cambiar el tipo de una columna de `bug_report` arrastra el `Object.keys(r)` de los tests de SLT-97
    igual.
  - La tabla cuesta lo mismo en archivos y deja R19 en la base.
- **B. Subir por una Server Action o un route handler propio.**
  - Una Server Action admite ~4,5 MB por cuerpo en Vercel, y una imagen puede pesar 5 MB (decisión «Cómo
    sube»).
  - Un route handler tiene el mismo tope de cuerpo de la función.
  - La subida firmada no pasa por la función.
- **C. Validar la firma de bytes en el navegador y fiarse.** El navegador es del usuario: la decisión
  pide que lo valide el servidor. En el cliente solo se mira el `type` y el `size`, por cortesía de red.
- **D. Comprobar el tamaño con los metadatos del objeto (`info`/`list`) en vez de descargarlo.** Ahorra
  memoria, pero la firma de bytes exige leer el principio del archivo igual, y storage-js no expone una
  descarga por rango. Además, el doble no atiende `info`. Leer cada imagen, en serie, cuesta como mucho
  5 MB a la vez.
- **E. Que el adaptador reciba la empresa como parámetro para el superadmin.** Rompería la regla de SL-19
  («la empresa sale del contexto, nunca de la ruta ni del llamador») en el único adaptador que la
  incumpliría. `conEmpresa` con la empresa del reporte, leída de la base, da lo mismo sin abrir esa
  puerta.
- **F. Subir cada imagen al elegirla.** Era la primera versión de este spec. El humano la descartó en P1:
  deja una huérfana por cada imagen que se quita, se descarta o se abandona al cerrar la pestaña.
  Subiendo al enviar, solo puede quedar resto tras un envío que falló a medias (§4.2).
- **G. Purga programada de huérfanas.** Descartada en P1: con la subida al enviar casi no hay huérfanas,
  y la purga costaba 6-7 archivos más (cron, `vercel.json`, listado, guardia de crons y tests).
- **H. Borrar en el reintento las imágenes que ya subieron, en vez de reutilizarlas.** Exige una action
  de borrado para el navegador, con su puerta y su test, y una subida de más en cada reintento.
  Reutilizar es más simple y no deja más resto.

## 13. Dependencias

Ninguna librería nueva (decisión «¿Librería nueva? No»). `createSignedUploadUrl` y `createBucket` con
límites son de `@supabase/storage-js`, ya instalada (la versión que cita el doble, 2.110.1).

## 14. Documentación

`docs/architecture.md > Multi-empresa`, un subpunto «Imágenes (SLT-98, migración `20261112120000`)» bajo
«Reportes de problemas»:
- `bug_report_image` es de plataforma, con RLS sin políticas y `REVOKE ALL`.
- Las imágenes viven en el bucket privado `BUG_REPORT_BUCKET` (`bug-reports`), en
  `<organizacion_id>/<usuario_id>/<imagen_id>.<ext>`.
- Se suben al pulsar «Enviar», directo con una URL firmada que pide el servidor, y el envío las valida
  por tamaño y firma de bytes.
- Se leen solo por enlace firmado de 24 h, en el correo y en el detalle. El superadmin firma con
  `conEmpresa` de la empresa del reporte.

## 15. Riesgos

- **Gateway y CORS de Supabase real.** El `PUT` del navegador a la URL firmada no lleva `apikey`. La
  documentación de storage-js dice que la URL firmada «no necesita más autenticación», y el doble lo
  modela así, pero nadie en el repo lo ha hecho todavía contra el proyecto real. T11 lo comprueba a mano
  en el despliegue de preview antes de pedir el merge. Si el gateway exigiera la clave, la corrección es
  mandar `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el `PUT`. Eso es una corrección del spec que vuelve al
  humano, no un cambio silencioso.
- **El error de «bucket no existe» en `createSignedUploadUrl`.** Se asume que sale con el mismo mensaje o
  `statusCode` 404 que en `upload`. El test de unidad lo fija con un doble, y T11 lo mira en preview con
  un bucket que aún no existe.
- **Resto tras un envío fallido a medias** *(P1)*. Si el usuario quita, descarta o cierra después de un
  envío en el que algunas imágenes subieron y otras no, las que subieron quedan sin fila. Sin purga, por
  decisión. También quedan las que el servidor rechaza y no pudo borrar (R11, mejor esfuerzo).
- **Borrado de empresas demo.** `bug_report_image` cae en cascada, pero sus archivos quedan en el bucket:
  `scripts/demo-qa/borrar.ts` no conoce este bucket. Las empresas demo casi nunca reportan.
- **Tiempo del envío.** El usuario espera a que suban hasta 25 MB antes del «Gracias». Lo hace visible el
  «Subiendo imágenes…» (R6).
- **Tamaño:** 32 archivos, justo en el aviso del 80%, y unas 2100-2400 líneas. El exceso de líneas está
  aceptado *(P2)*. Un archivo más de lo previsto pasa el aviso, sin llegar a rojo.
- **Tests de SLT-87 y SLT-97 que cambian de sentido:**
  - `ReporteBugBoton.test.tsx` afirma que no hay campo de archivos (R4 de SLT-87, sustituido aquí);
  - `bug-report.test.ts` cuenta las claves del detalle (`toHaveLength(16)`);
  - el test de R4 de SLT-97 mira el constructor.

  Se ajustan en esta rama, citando este spec.
