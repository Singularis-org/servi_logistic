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

_Pendiente: los escribe spec_author (F1.2)._

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
