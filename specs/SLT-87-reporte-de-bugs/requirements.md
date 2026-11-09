# SLT-87 — Reporte de bugs: botón flotante y módulo del superadmin · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** — ·
> **Rama** `feature/SLT-87-reporte-de-bugs`
>
> **Alcance.** Un botón flotante en el layout privado, para todo usuario logueado, abre un panel tipo
> minichat donde se describe un problema y se adjuntan capturas. El texto del borrador vive en
> localStorage hasta «Enviar» o «Descartar». Al enviar, el reporte se guarda con su contexto y se manda una
> copia por correo, con las imágenes adjuntas, a la lista de `BUG_REPORT_EMAILS`. El superadmin tiene un
> módulo para listarlos, verlos y gestionar su estado con una nota interna.
>
> **Lo que NO entra.** Respuestas o conversación con quien reporta; avisos a la empresa o al usuario;
> que la empresa vea sus reportes. No tienen ficha: no se pidieron.
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2) cuando se resuelva el bloqueo por tamaño (ver «Preguntas
abiertas», P1)._

## Preguntas abiertas

> spec_author, F1.2 (2026-11-09): **BLOQUEADO: no cabe en un PR.** No se escribieron `design.md` ni
> `tasks.md`. Búsqueda previa (`docs/specs.md > Antes de especificar`): en el board, «reporte de
> bug», «bug report» y «BUG_REPORT» solo aparecen en esta ficha; en `specs/` y en el código no hay
> nada equivalente. Coincide solo la palabra «flotante» con `ChatFlotante` del mensajero, que es otra
> cosa (ver P5). El índice del grafo no existe para este worktree: se buscó con Grep/Read.

### P1 — Corte en rebanadas (bloqueante)

El recuento de `## Archivos esperados` de la feature entera da **~38-40 archivos**, frente a
`gate.tamano_pr.max_archivos = 40` (el 80% son 32), y bastante más de 1000 líneas. Sale de:

- **Esquema:** esquema, 2 migraciones con su `down.sql`, `modelos-de-negocio.ts`,
  `excepciones-aislamiento.ts`.
- **Servidor:** config, tipos, 2 interfaces, repositorio, servicio, adaptador de Storage con su
  interfaz, plantilla de correo, `IEmailSender` y `NodemailerEmailSender` (hoy no admiten adjuntos),
  2 archivos de actions, `reparto.ts` y menú.
- **Pantallas:** layout, botón y panel, 2 páginas y 2 componentes de `/plataforma`.
- **E2E:** el doble de Storage del E2E (hoy no admite subida firmada) y `playwright.config.ts`.
- **Resto:** `.env.example`, `docs/architecture.md` y ~9 archivos de test.

**Propuesta de corte, en rebanadas verticales que se mergean solas** (`docs/specs.md > Partir una
feature`):

| Rebanada | Qué entrega | Deja el producto funcionando porque… | ~archivos |
|---|---|---|---|
| **1 · SLT-87** (se queda con la ficha) | La tabla `bug_report` con su migración y su RLS. El botón flotante y el panel para todo rol, el borrador en localStorage, el envío **solo de texto** con el contexto automático y la copia por correo a `BUG_REPORT_EMAILS`. E2E: el borrador sobrevive a recargar, se envía, sale «Gracias» y la copia aparece en el log del emisor de consola. | Los reportes ya llegan por correo aunque aún no haya pantalla; nadie ve una pantalla a medias. | ~27 |
| **2 · nueva** (`depends_on` 1) | El módulo del superadmin en `/plataforma`: listado con filtros por empresa, estado y fecha; el detalle; los estados nuevo → en revisión → resuelto / descartado, con su nota interna y su historial. El E2E se amplía: el reporte enviado aparece en el módulo y cambia de estado. | Es aditiva: un ítem nuevo de menú, solo para el superadmin. | ~16 |
| **3 · nueva** (`depends_on` 2) | Las imágenes: hasta 5, de 5 MB, PNG, JPG o WebP. Se validan en el servidor y se guardan en la carpeta de la empresa (SL-19). Viajan como adjuntos del correo y se muestran en el detalle. El E2E se amplía con una imagen. | El panel gana el campo de imágenes; lo anterior no cambia. | ~15 |

Recomendación: este corte. La decisión «¿Hace falta E2E?» queda cubierta entre la rebanada 1
(borrador y envío) y la 2 (aparece en el módulo). Ninguna decisión cerrada cambia: solo se reparte.
Si el humano acepta, las fichas nuevas se crean con `/afinar-feature` (paso 5) y esta ficha acota su
`description` a la rebanada 1.

### Lo que el código ya dejó claro (para no redescubrirlo al especificar cada rebanada)

- **Dónde vive el reporte.** Recomiendo una tabla **de plataforma** (como `historial_plataforma` o
  `plan_rastro`): RLS sin políticas y `REVOKE ALL … FROM servi_app`. La escribe y la lee solo un
  repositorio en `comoPlataforma`, con su entrada en `EXCEPCIONES_DE_PLATAFORMA`, y la empresa la
  toma de la sesión en el servidor. Así la empresa no la puede leer ni con SQL a mano (`42501`).
  Descartada la tabla de negocio con la política `<t>_por_empresa`: esa política deja leer a la
  empresa, y el `INSERT … RETURNING` de Prisma exige `SELECT`. La columna de empresa es nulable,
  para el superadmin. Ficha `"SL-…"` en `comoPlataforma` por la deuda D29.
- **Imágenes (rebanada 3).** Vercel corta el cuerpo de una Server Action a ~4,5 MB
  (`lib/config/chat-media-envio.ts`, SLT-88), así que una sola imagen de 5 MB no cabe por ese
  camino. Recomiendo la subida directa a Storage con URL firmada de subida, emitida por el
  adaptador en la carpeta de la empresa. El bucket se crea con `fileSizeLimit` y
  `allowedMimeTypes`, y al confirmar el envío el servidor relee cada objeto y comprueba tamaño y
  firma de bytes. Eso exige enseñar la subida firmada a `e2e/_storage-falso/servidor.mjs`.
  Descartada la compresión obligatoria en el navegador: el original no se guardaría y 5 imágenes
  comprimidas pueden pasar igualmente de 4,5 MB.
- **Correo.** Va después de guardar, fuera de la transacción y con su `catch`, sin cola: la decisión
  cerrada excluye marca y reintento, y un `JobTipo` nuevo cuesta migración de enum, registro en el
  drenador y `reparto.ts`. Un correo por destinatario, porque `EmailMessage.to` es una sola
  dirección. Con la plantilla `componerCorreo` (SL-41).

### Preguntas para el humano (de una en una; cada una con recomendación)

- **P2 — ¿El superadmin ve el botón, y con imágenes?** No tiene empresa: `lib/storage/` falla en
  plataforma (SL-19, R18), así que sus imágenes no tienen carpeta. *Recomendación:* sí ve el botón
  («todo usuario logueado»); su reporte se guarda sin empresa y **solo con texto**, sin campo de
  imágenes.
- **P3 — ¿Qué es «versión de la app»?** No existe ninguna: `package.json` dice `0.1.0` y nadie la
  sube. *Recomendación:* el commit corto de `VERCEL_GIT_COMMIT_SHA`, resuelto en el servidor, y
  «local» fuera de Vercel.
- **P4 — Para leer las imágenes, ¿el superadmin puede entrar en el contexto de la empresa del
  reporte (`conEmpresa`)?** Solo para firmar las URLs (rebanada 3). *Recomendación:* sí. Es la
  única forma sin abrir `lib/storage/` a la plataforma, que SL-19 cerró a propósito.
- **P5 — ¿Dónde va el botón en `/mis-asignaciones`?** Ahí `ChatFlotante` ya ocupa la esquina
  inferior derecha (`fixed bottom-5 right-5`). *Recomendación:* el botón va abajo a la derecha en
  todo el portal y, en esa ruta, se apila encima del chat.
- **P6 — ¿Los adjuntos de 5 × 5 MB caben en un correo de Brevo?** En base64 son ~33 MB, y no consta
  el tope del SMTP. *Recomendación:* se mandan igual. Si el SMTP lo rechaza, la decisión cerrada ya
  dice que el reporte se guarda sin marca, y la copia del superadmin está en el módulo.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Quién ve el botón? | Todo usuario logueado, de cualquier rol, en todo el layout privado, también en móvil y en la PWA del mensajero. |
| 2026-11-05 | ¿Minichat de un envío o conversación? | Un solo envío. Sin respuestas. Al enviar: «Gracias, recibimos tu reporte», el panel queda vacío y el usuario no ve nada más de ese reporte. |
| 2026-11-05 | Contenido | Descripción obligatoria e imágenes opcionales: hasta 5, de 5 MB cada una, PNG, JPG o WebP. |
| 2026-11-05 | Borrador | Solo el texto se guarda en localStorage, y sobrevive a cerrar la pestaña hasta «Enviar» o «Descartar». Las imágenes no se guardan: si se cierra sin enviar, hay que adjuntarlas de nuevo. |
| 2026-11-05 | Contexto automático | Usuario, empresa, rol, página (URL), navegador/dispositivo, versión de la app y fecha. El usuario no lo escribe. |
| 2026-11-05 | Copia por correo | Al guardar el reporte se envía un correo con descripción, contexto e imágenes adjuntas a los destinatarios de `BUG_REPORT_EMAILS` (separados por «,»; se documenta en `.env.example`). Usa el SMTP que ya tiene la app. |
| 2026-11-05 | Si el correo falla o la lista está vacía | El reporte se guarda igual y el usuario ve «Gracias». No queda marca ni reintento: el correo es un extra. |
| 2026-11-05 | Módulo del superadmin | En `/plataforma`: listado con filtros (empresa, estado, fecha), detalle con descripción, imágenes y contexto, y estado nuevo → en revisión → resuelto / descartado, con nota interna. |
| 2026-11-05 | Visibilidad | Solo el superadmin ve los reportes. La empresa (maestro, admin) no ve ninguno, ni de su gente. Nunca se notifica a la empresa ni al usuario. |
| 2026-11-05 | Imágenes guardadas | Heredado de SL-19: por los adaptadores de `lib/storage/`, en la carpeta de la empresa del contexto. |
| 2026-11-05 | Correo con la marca | Heredado de SL-41: usa la plantilla común (`lib/services/email/plantillas/plantilla-marca.ts`). |
| 2026-11-05 | Borrado e identificadores | Heredado de la 4: borrado lógico y `created_at` / `updated_at`; identificadores de base en inglés. |
| 2026-11-05 | ¿Hace falta E2E? | Sí, el flujo de enviar (borrador, envío, aparece en el módulo del superadmin) toca permisos entre empresa y plataforma. |
| 2026-11-05 | ¿Librería nueva? | No. |
