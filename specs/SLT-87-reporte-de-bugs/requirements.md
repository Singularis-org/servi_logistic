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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

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
