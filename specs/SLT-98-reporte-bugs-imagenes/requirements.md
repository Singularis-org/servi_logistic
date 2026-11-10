# SLT-98 — reporte-bugs-imagenes · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** SLT-97 ·
> **Rama** `feature/SLT-98-reporte-bugs-imagenes`
>
> **Alcance.** Entrega 3 de 3 del reporte de bugs. En el panel de SLT-87 se pueden adjuntar imágenes,
> que se suben a un bucket privado propio para los reportes. El correo a `BUG_REPORT_EMAILS` lleva un
> enlace temporal a cada imagen, y el detalle del superadmin de SLT-97 las muestra.
>
> **Lo que NO entra.** Adjuntos que no sean imágenes, como videos, PDF o logs. Editar o borrar las
> imágenes de un reporte ya enviado. Guardar las imágenes en el borrador.
>
> Sembrado por `/afinar-feature` el 2026-11-10. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> «Imagen válida» es un archivo PNG, JPG o WebP de 1 byte a 5 MB. «Usuario de empresa» es el de SLT-87
> «Reporte de bugs: botón flotante y envío» (R11): con sesión, con empresa y sin rol de plataforma. Esta
> entrega sustituye la viñeta «ningún campo para adjuntar archivos» de R4 de SLT-87, como dejó escrito
> el corte en tres entregas (P1 del 2026-11-09).

**El panel**

- **R1.** CUANDO el usuario abre el panel de reporte, el sistema DEBE mostrar, además de lo de SLT-87:
  - la sección «Imágenes (opcional, máximo 5)»;
  - la acción «Agregar imágenes»;
  - el contador con el texto exacto «{n}/5 imágenes», donde {n} es el número de imágenes del panel (por
    ejemplo, «2/5 imágenes»), seguido de «PNG, JPG o WebP · hasta 5 MB cada una».
- **R2.** CUANDO el usuario elige imágenes con «Agregar imágenes», el sistema DEBE añadir cada una al
  panel con su miniatura y su acción «Quitar». El sistema NO DEBE subir nada al almacenamiento hasta que
  el usuario pulse «Enviar» (decisión P1).
- **R3.** MIENTRAS el panel tenga 5 imágenes, el sistema DEBE mantener «Agregar imágenes» deshabilitado.
  SI el usuario elige más imágenes de las que caben, ENTONCES el sistema DEBE añadir las primeras hasta
  llegar a 5 y avisar en el panel cuántas no se añadieron.
- **R4.** CUANDO el usuario pulsa «Quitar» en una imagen, el sistema DEBE sacarla del panel y del
  reporte, y bajar el contador en uno.
- **R5.** SI una imagen elegida no es PNG, JPG ni WebP, está vacía o pesa más de 5 MB, ENTONCES el
  sistema DEBE marcarla en el panel con su motivo y ofrecer solo «Quitar». Esa imagen nunca se sube.
- **R6.** CUANDO el usuario pulsa «Enviar» con imágenes, el sistema DEBE subir primero cada imagen al
  almacenamiento y, solo si todas subieron, mandar el reporte. Mientras sube, «Enviar» DEBE mostrar
  «Subiendo imágenes…».
- **R7.** SI la subida de una imagen falla durante el envío, ENTONCES el sistema DEBE:
  - no mandar el reporte, así que nada se guarda y no sale correo;
  - marcar esa imagen con el aviso de fallo y las acciones «Reintentar» y «Quitar»;
  - conservar el texto y las demás imágenes.

  CUANDO el usuario pulsa «Reintentar», el sistema DEBE repetir el envío. Las imágenes que ya subieron
  en el intento anterior no se suben otra vez: se reutilizan (decisión P1; design §4.2).

  MIENTRAS alguna imagen esté marcada con un error (de R5, de este requisito o de R11), el sistema DEBE
  mantener «Enviar» deshabilitado y mostrar el aviso de que hay que quitarla o reintentarla para poder
  enviar.
- **R8.** El sistema NO DEBE guardar las imágenes en el borrador: al recargar la página o al cerrar la
  pestaña y volver, el panel DEBE mostrar el texto del borrador y ninguna imagen. CUANDO el usuario
  pulsa «Descartar» o el reporte se guarda, el panel DEBE quedar sin imágenes.

**La subida**

- **R9.** CUANDO el panel pide permiso para subir las imágenes de un envío, el sistema DEBE dar un
  permiso de subida directa al almacenamiento por imagen, solo si:
  - la petición es de un usuario de empresa;
  - pide entre 1 y 5 permisos;
  - el tipo declarado de cada imagen es PNG, JPG o WebP y su tamaño declarado va de 1 byte a 5 MB;
  - la entrada no trae campos fuera del contrato.

  La ubicación del archivo la DEBE fijar el servidor con la empresa y el usuario de la sesión, nunca la
  entrada. El permiso DEBE servir para esa ubicación y nada más: no deja leer otro archivo ni sustituir
  uno ya subido.

  SI la petición no cumple alguna de esas condiciones, ENTONCES el sistema DEBE rechazarla sin dar
  ningún permiso.

**El envío**

- **R10.** CUANDO llega un envío con imágenes, el sistema DEBE comprobar en el servidor, antes de guardar
  nada, que cada imagen cumple tres cosas:
  - existe en el almacenamiento, en la ubicación de ese usuario y esa empresa;
  - pesa entre 1 byte y 5 MB;
  - sus primeros bytes son la firma del tipo declarado (PNG, JPG o WebP).
- **R11.** SI alguna imagen no pasa R10, ENTONCES el sistema DEBE:
  - rechazar el envío sin guardar el reporte ni enviar correo;
  - decirle al panel qué imágenes fallaron, para que las marque como en R5 y conserve el texto.
- **R12.** SI el envío trae más de 5 imágenes, una imagen repetida, un identificador de imagen que no es
  válido, un tipo fuera de PNG, JPG o WebP, o campos fuera del contrato, ENTONCES el sistema DEBE
  rechazarlo como error de validación, sin guardar nada y sin enviar correo.
- **R13.** CUANDO se guarda un reporte con imágenes, el sistema DEBE guardar con él cada imagen, en el
  orden en que se adjuntó, con su tipo y su tamaño. Se guardan el reporte y todas sus imágenes, o nada.
- **R14.** La respuesta del envío NO DEBE llevar ningún enlace ni dato de las imágenes guardadas.

**El almacenamiento**

- **R15.** El sistema DEBE guardar las imágenes en un bucket privado, propio de los reportes:
  `bug-reports` por defecto, o el que diga `BUG_REPORT_BUCKET`. NO DEBE usar el bucket de otra función
  ni generar una URL pública de ninguna imagen.
- **R16.** SI el bucket no existe cuando se pide una subida, ENTONCES el sistema DEBE crearlo privado,
  con un límite de 5 MB por archivo y solo PNG, JPG y WebP, y seguir con la subida. SI otro proceso lo
  creó a la vez, ENTONCES DEBE seguir sin error.
- **R17.** `.env.example` DEBE documentar `BUG_REPORT_BUCKET` con su valor por defecto, y decir que la
  app crea el bucket sola, privado y con sus límites.

**Acceso y datos**

- **R18.** El sistema NO DEBE permitir que una empresa lea, modifique ni borre los datos de las imágenes
  de ningún reporte, ni de los suyos ni de los de su gente. Esto DEBE cumplirse también con SQL a mano
  bajo el rol de la app: la base responde `42501`.
- **R19.** La base DEBE rechazar más de 5 imágenes en un reporte, una imagen con un tipo fuera de PNG,
  JPG o WebP y una con un tamaño fuera de 1 byte a 5 MB, también para el dueño. Los identificadores
  nuevos de la base DEBEN estar en inglés.

**El correo**

- **R20.** CUANDO se guarda un reporte con imágenes, el correo a cada destinatario de `BUG_REPORT_EMAILS`
  DEBE llevar, en el orden de las imágenes, un enlace por imagen que dé acceso de lectura a esa imagen
  durante 24 horas. NO DEBE llevar las imágenes como adjuntos. Un reporte sin imágenes DEBE llevar el
  correo de SLT-87, sin la sección de imágenes.
- **R21.** SI no se puede generar el enlace de una imagen, ENTONCES el sistema DEBE:
  - enviar el correo igual, con un aviso en el lugar de ese enlace;
  - responder «Gracias, recibimos tu reporte».

**El detalle del superadmin**

- **R22.** CUANDO el superadmin abre el detalle de un reporte, el sistema DEBE mostrar el bloque
  «Imágenes»:
  - con imágenes, una miniatura por imagen, en su orden, y cada una con un enlace para verla en grande;
    cada carga del detalle genera enlaces temporales nuevos;
  - sin imágenes, el texto «Este reporte no trae imágenes.».
- **R23.** SI no se puede generar el enlace de una imagen en el detalle, ENTONCES el sistema DEBE
  mostrar el resto del detalle y, en el lugar de esa imagen, «No se pudo cargar esta imagen.».

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Contenido (hasta 5, de 5 MB, PNG, JPG o WebP) | R1, R3, R5, R9, R10, R12, R16, R19 |
| Borrador | R8 |
| ¿Dónde se guardan? | R9 (ubicación), R15 |
| Correo | R20, R21 |
| Contador | R1, R3 |
| Cómo sube | R6, R9, R10, R11 |
| Nombre y creación del bucket | R15, R16, R17 |
| Duración del enlace del correo | R20 (24 horas), R22 (enlaces nuevos en cada carga) |
| Si una imagen no sube | R7, R11 |
| P1 (se suben al enviar) | R2, R6, R7, R8 |
| P2 (exceso de líneas aceptado) | Sin requisito: proceso; la línea `tamano-pr-aceptado` la deja el leader en `progress/features/SLT-98.md` |
| P3 (24 h en el detalle) | R22 |
| P4 (5 MB = 5 × 1024 × 1024 bytes) | R5, R9, R10, R16, R19 |
| Visibilidad | R14, R18, R22 (el detalle ya es solo del superadmin por R2 de SLT-97 «Reporte de bugs: módulo del superadmin») |
| Vista de referencia | R1, R2, R4, R6 (los textos van en design §9) |
| ¿Hace falta E2E? | El E2E de `tasks.md` (T11): adjuntar, enviar y verlas en el detalle |
| ¿Librería nueva? No | Sin requisito: lo hace cumplir `guard-dependencias-aprobadas` |
| Ruta | El proceso: tres archivos y aprobación |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | Contenido | Imágenes opcionales: hasta 5, de 5 MB cada una, PNG, JPG o WebP. (Heredado del alcance original de SLT-87.) |
| 2026-11-05 | Borrador | Las imágenes no se guardan en el borrador: si se cierra sin enviar, hay que adjuntarlas otra vez. (Heredado de SLT-87.) |
| 2026-11-09 | ¿Dónde se guardan? | En un bucket privado nuevo, propio de los reportes. No van a la carpeta de la empresa (SLT-87 P4). |
| 2026-11-09 | Correo | El correo lleva un enlace temporal a cada imagen, no adjuntos (SLT-87 P6). |
| 2026-11-09 | Contador | El panel muestra «{n}/5 imágenes», con el mismo formato que «{n}/500». Al llegar a 5, «Agregar imágenes» se desactiva. (Comentario en la tarjeta, 2026-11-09.) |
| 2026-11-09 | Cómo sube | Subida firmada directa al bucket, porque una Server Action admite ~4,5 MB por cuerpo y una imagen puede tener 5. El servidor valida tamaño, tipo y firma de bytes antes de dar el reporte por bueno. (Diseño contrastado por spec_author en SLT-87.) |
| 2026-11-10 | Nombre y creación del bucket | Se llama `bug-reports` por defecto y se puede cambiar con la variable `BUG_REPORT_BUCKET`, documentada en `.env.example`. La app lo crea sola, PRIVADO y con sus límites (5 MB; PNG, JPG o WebP), en el primer uso, igual que el bucket `descargas`. Va al catálogo `lib/storage/buckets.ts`. |
| 2026-11-10 | Duración del enlace del correo | 24 horas. El detalle del superadmin genera enlaces nuevos cada vez que se abre. |
| 2026-11-10 | Si una imagen no sube | El reporte no se envía hasta que todas las imágenes suban. El panel marca la que falló, con la opción de quitarla o reintentarla, y el texto queda guardado. |
| 2026-11-10 | Visibilidad | Solo el superadmin ve las imágenes. La empresa no. (Heredado de SLT-87 y SLT-97.) |
| 2026-11-10 | Vista de referencia | El panel con el espacio de imágenes está en https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms. Si la vista choca con el spec, manda el spec. |
| 2026-11-10 | ¿Hace falta E2E? | Sí: adjuntar, enviar y verlas en el detalle del superadmin. |
| 2026-11-10 | ¿Librería nueva? | No. |
| 2026-11-10 | Ruta | Completa: almacenamiento, permisos y migración. |
| 2026-11-10 | P1 — ¿Cuándo se suben las imágenes? (y qué pasa con las huérfanas) | Al pulsar «Enviar», no al elegirlas. Al elegirlas, el panel solo las muestra con una miniatura local, con «Quitar» y con la validación de tipo y tamaño en el cliente. Al pulsar «Enviar», el panel pide los permisos, sube cada imagen por PUT directo (porque el límite de ~4,5 MB por cuerpo sigue) y después manda el reporte; mientras tanto, «Enviar» muestra el progreso («Subiendo imágenes…»). Si una subida falla, el reporte no se guarda: esa imagen queda marcada con «Reintentar» y «Quitar», y el texto se conserva. Así no quedan huérfanas por cerrar o descartar: sin purga y sin ficha aparte. Lo que pasa con las imágenes que sí subieron en un intento fallido lo elige el spec, lo más simple (design §4.2). |
| 2026-11-10 | P2 — Tamaño del PR | Se acepta el exceso de líneas en un solo PR. La línea `tamano-pr-aceptado` la deja el leader. |
| 2026-11-10 | P3 — Duración del enlace del detalle | 24 horas, igual que la del correo. |
| 2026-11-10 | P4 — Qué es «5 MB» | 5 × 1024 × 1024 bytes (5 242 880). |
