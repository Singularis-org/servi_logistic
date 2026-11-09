# SLT-87 — Reporte de bugs: botón flotante y envío · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** — ·
> **Rama** `feature/SLT-87-reporte-de-bugs` · **Ruta** completa (permisos entre empresa y plataforma,
> y migración)
>
> **Alcance (entrega 1 de 3).**
> - **Botón.** Un botón flotante en el layout privado, para todo usuario logueado **de empresa**,
>   de cualquier rol. El superadmin no lo ve. Está también en móvil y en la PWA del mensajero, y en
>   `/mis-asignaciones` va apilado encima del botón del chat.
> - **Panel.** Abre un panel tipo minichat con la descripción del problema, obligatoria y **solo
>   texto**. El borrador de texto vive en localStorage hasta «Enviar» o «Descartar».
> - **Envío.** Al enviar, el reporte se guarda con su contexto (usuario, empresa, rol, URL,
>   navegador/dispositivo y fecha; sin versión de la app). Sale una copia por correo, con la
>   plantilla de marca, a cada dirección de `BUG_REPORT_EMAILS` (documentada en `.env.example`).
> - **Si el correo falla.** El reporte se guarda igual y el usuario ve «Gracias, recibimos tu
>   reporte».
> - **Visibilidad.** La empresa nunca lee reportes.
> - **E2E.** Recorre el borrador, el envío, el «Gracias» y el correo en el log.
>
> **Lo que NO entra.**
> - El módulo del superadmin: listado, detalle, estados y nota interna. Va en SLT-97 «Reporte de
>   bugs: módulo del superadmin».
> - Las imágenes: subida, límites, bucket, enlaces en el correo y vista en el detalle. Van en SLT-98
>   «Reporte de bugs: imágenes».
> - Respuestas o conversación con quien reporta, y avisos a la empresa o al usuario.
> - Que la empresa vea sus reportes.
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. El 2026-11-09, al partir la ficha en tres entregas, **el humano
> cambió el Alcance y «Lo que NO entra»** a esta entrega 1 y añadió las filas P1–P6. `spec_author`
> no los reabre.

## Requisitos (EARS)

**Botón y panel**

- **R1.** MIENTRAS un usuario de una empresa tenga sesión, el sistema DEBE mostrar el botón
  flotante «Reportar un problema» en todas las páginas del layout privado, en pantallas de
  escritorio y de móvil, también en la app instalada (PWA).
- **R2.** SI el usuario de la sesión es de la plataforma (superadmin), ENTONCES el sistema NO DEBE
  mostrar el botón.
- **R3.** MIENTRAS la página sea `/mis-asignaciones` o una de sus subrutas, el sistema DEBE mostrar
  el botón encima del botón del chat, sin solaparse con él.
- **R4.** CUANDO el usuario pulsa el botón, el sistema DEBE abrir un panel con:
  - un campo de descripción de texto que no admite más de 500 caracteres;
  - un contador de los caracteres usados contra el máximo, con el texto exacto «{n}/500», donde
    {n} es el número de caracteres escritos (por ejemplo, «120/500»);
  - las acciones «Enviar» y «Descartar»;
  - ningún campo para adjuntar archivos.
- **R5.** MIENTRAS la descripción esté vacía o tenga solo espacios, el sistema DEBE mantener
  «Enviar» deshabilitado.

**Borrador**

- **R6.** CUANDO el usuario escribe en la descripción, el sistema DEBE guardar el texto en el
  almacenamiento local del navegador. El panel DEBE mostrar ese mismo texto en todos estos casos:
  - al cerrar y volver a abrir el panel;
  - al recargar la página;
  - al cerrar la pestaña y volver.
- **R7.** El sistema DEBE guardar el borrador por usuario: el borrador de un usuario NO DEBE
  aparecer en el panel de otro usuario que entre en el mismo navegador.
- **R8.** CUANDO el usuario pulsa «Descartar», el sistema DEBE borrar su borrador y dejar el panel
  vacío, sin guardar ningún reporte.

**Envío**

- **R9.** CUANDO el reporte se guarda, el sistema DEBE:
  - mostrar «Gracias, recibimos tu reporte»;
  - borrar el borrador y dejar el panel vacío;
  - no mostrarle al usuario ningún otro dato de ese reporte.
- **R10.** SI el reporte no se puede guardar, ENTONCES el sistema DEBE avisar del fallo en el panel
  y conservar el borrador.
- **R11.** SI una petición de envío llega sin sesión, de un usuario sin empresa o de un rol de la
  plataforma, ENTONCES el sistema DEBE rechazarla sin guardar nada y sin enviar ningún correo.
- **R12.** SI la descripción recibida en el servidor queda vacía tras recortar espacios, supera
  500 caracteres, la página trae query o fragmento, o la entrada trae campos fuera del contrato,
  ENTONCES el sistema DEBE rechazarla como error de validación, sin guardar nada y sin enviar
  ningún correo.
- **R13.** CUANDO se guarda un reporte, el sistema DEBE registrar con él:
  - el usuario, la empresa y el rol, tomados de la sesión en el servidor y nunca de la entrada del
    cliente;
  - el nombre del usuario en ese momento;
  - la página desde la que se envió: solo la ruta, sin query ni fragmento;
  - el navegador (agente de usuario de la petición);
  - el dispositivo: ancho y alto de la ventana, y si corre como app instalada;
  - la fecha y hora del servidor.

  NO DEBE registrar la versión de la app.

**Acceso de la empresa**

- **R14.** El sistema NO DEBE permitir que una empresa lea, modifique ni borre ningún reporte, ni
  los suyos ni los de su gente. Esto DEBE cumplirse también con SQL a mano bajo el rol de la app:
  la base responde `42501`.

**Copia por correo**

- **R15.** CUANDO se guarda un reporte, el sistema DEBE enviar un correo por cada dirección válida
  de `BUG_REPORT_EMAILS` (lista separada por «,»):
  - con la plantilla de marca;
  - con la descripción y el contexto de R13;
  - a nadie más: ni a quien reporta ni a su empresa.
- **R16.** SI `BUG_REPORT_EMAILS` está vacía, ausente o sin ninguna dirección válida, ENTONCES el
  sistema DEBE guardar el reporte y responder «Gracias» sin enviar correo.
- **R17.** SI el envío del correo falla para uno o para todos los destinatarios, ENTONCES:
  - el reporte DEBE quedar guardado y el usuario DEBE ver «Gracias»;
  - el sistema NO DEBE dejar marca ni programar reintento;
  - los demás destinatarios DEBEN recibir su copia.
- **R18.** El sistema DEBE escapar en el HTML del correo todo dato variable: la descripción, los
  nombres, la página y el navegador.

**Datos y configuración**

- **R19.** Cada reporte DEBE guardarse con fecha de creación, fecha de actualización y marca de
  borrado lógico, que nace vacía. Los identificadores de la tabla DEBEN estar en inglés.
- **R20.** `.env.example` DEBE documentar `BUG_REPORT_EMAILS`, vacía, con su formato (separada por
  «,») y lo que pasa si queda vacía.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Quién ve el botón? (con P2 y P5) | R1, R2, R3, R11 |
| ¿Minichat de un envío o conversación? | R4, R9 |
| Contenido (la parte de texto) | R4, R5, R12 |
| Borrador (la parte de texto) | R6, R7, R8 |
| Contexto automático (con P3) | R13 |
| Copia por correo (la parte sin imágenes) | R15, R20 |
| Si el correo falla o la lista está vacía | R16, R17 |
| Visibilidad (la parte de esta entrega) | R14, R15 |
| Correo con la marca | R15, R18 |
| Borrado e identificadores | R19 |
| ¿Hace falta E2E? (la parte de esta entrega) | E2E de R1, R2, R6, R8, R9, R13 y R15 (`tasks.md`) |
| ¿Librería nueva? No | Sin requisito: lo hace cumplir `guard-dependencias-aprobadas` |
| P1 (partir en 3) | El alcance de este archivo |
| P4, P6 y Módulo del superadmin, Imágenes guardadas | No son de esta entrega: SLT-97 y SLT-98 |
| Q1 (exceso de líneas aceptado) | Sin requisito: proceso; la línea `tamano-pr-aceptado` va en `progress/features/SLT-87.md` |
| Q2 (solo la ruta) | R12, R13 |
| Q3 (máximo de 500) | R4, R12 |
| Contador «{n}/500» | R4 |
| Q4 (sin tope de envíos) | Sin requisito: no se construye nada |
| Q5 (`organization_id` en inglés) | R19 |

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Quién ve el botón? | Todo usuario logueado, de cualquier rol, en todo el layout privado, también en móvil y en la PWA del mensajero. **(2026-11-09: P2 retira al superadmin; P5 fija la posición en `/mis-asignaciones`.)** |
| 2026-11-05 | ¿Minichat de un envío o conversación? | Un solo envío. Sin respuestas. Al enviar: «Gracias, recibimos tu reporte», el panel queda vacío y el usuario no ve nada más de ese reporte. |
| 2026-11-05 | Contenido | Descripción obligatoria e imágenes opcionales: hasta 5, de 5 MB cada una, PNG, JPG o WebP. **(2026-11-09: la entrega 1 es solo texto; las imágenes pasan a SLT-98.)** |
| 2026-11-05 | Borrador | Solo el texto se guarda en localStorage, y sobrevive a cerrar la pestaña hasta «Enviar» o «Descartar». Las imágenes no se guardan: si se cierra sin enviar, hay que adjuntarlas de nuevo. **(2026-11-09: lo de las imágenes pasa a SLT-98.)** |
| 2026-11-05 | Contexto automático | Usuario, empresa, rol, página (URL), navegador/dispositivo, versión de la app y fecha. El usuario no lo escribe. **(2026-11-09: P3 retira la versión de la app.)** |
| 2026-11-05 | Copia por correo | Al guardar el reporte se envía un correo con descripción, contexto e imágenes adjuntas a los destinatarios de `BUG_REPORT_EMAILS` (separados por «,»; se documenta en `.env.example`). Usa el SMTP que ya tiene la app. **(2026-11-09: sin imágenes en la entrega 1; en SLT-98 van como enlaces temporales, no adjuntos, por P6.)** |
| 2026-11-05 | Si el correo falla o la lista está vacía | El reporte se guarda igual y el usuario ve «Gracias». No queda marca ni reintento: el correo es un extra. |
| 2026-11-05 | Módulo del superadmin | En `/plataforma`: listado con filtros (empresa, estado, fecha), detalle con descripción, imágenes y contexto, y estado nuevo → en revisión → resuelto / descartado, con nota interna. **(2026-11-09: pasa a SLT-97.)** |
| 2026-11-05 | Visibilidad | Solo el superadmin ve los reportes. La empresa (maestro, admin) no ve ninguno, ni de su gente. Nunca se notifica a la empresa ni al usuario. **(2026-11-09: lo que ve el superadmin llega en SLT-97; esta entrega cubre que la empresa no lee y que no se le notifica.)** |
| 2026-11-05 | Imágenes guardadas | Heredado de SL-19: por los adaptadores de `lib/storage/`, en la carpeta de la empresa del contexto. **(2026-11-09: pasa a SLT-98 y P4 la cambia: bucket privado propio, no la carpeta de la empresa.)** |
| 2026-11-05 | Correo con la marca | Heredado de SL-41: usa la plantilla común (`lib/services/email/plantillas/plantilla-marca.ts`). |
| 2026-11-05 | Borrado e identificadores | Heredado de la 4: borrado lógico y `created_at` / `updated_at`; identificadores de base en inglés. |
| 2026-11-05 | ¿Hace falta E2E? | Sí, el flujo de enviar (borrador, envío, aparece en el módulo del superadmin) toca permisos entre empresa y plataforma. **(2026-11-09: esta entrega cubre borrador, envío, «Gracias» y correo en el log; «aparece en el módulo» pasa a SLT-97.)** |
| 2026-11-05 | ¿Librería nueva? | No. |
| 2026-11-09 | P1 — ¿Se parte la ficha? | Sí, en 3 entregas: SLT-87 (botón y envío de texto con copia por correo), SLT-97 «Reporte de bugs: módulo del superadmin» (depende de SLT-87) y SLT-98 «Reporte de bugs: imágenes» (depende de SLT-97). |
| 2026-11-09 | P2 — ¿El superadmin ve el botón? | No. Solo los usuarios de empresa. |
| 2026-11-09 | P3 — ¿Qué es «versión de la app»? | No se guarda versión: sale del contexto. |
| 2026-11-09 | P4 — ¿Dónde van las imágenes? (SLT-98) | A un bucket privado nuevo, propio de estos reportes, no a la carpeta de la empresa. |
| 2026-11-09 | P5 — ¿Dónde va el botón en `/mis-asignaciones`? | Apilado encima del botón del chat. |
| 2026-11-09 | P6 — ¿Las imágenes viajan en el correo? (SLT-98) | No como adjuntos: el correo lleva un enlace temporal a cada imagen. |
| 2026-11-09 | Q1 — La entrega pasa de 1000 líneas (~1250-1400) | Se acepta el exceso en un solo PR; el leader deja la línea `tamano-pr-aceptado` en `progress/features/SLT-87.md`. |
| 2026-11-09 | Q2 — ¿La página guarda la query? | No: solo la ruta, sin query ni fragmento. |
| 2026-11-09 | Q3 — Largo máximo de la descripción | 500 caracteres. |
| 2026-11-09 | Q4 — ¿Tope de envíos por usuario? | Sin tope por ahora. |
| 2026-11-09 | Q5 — ¿`organization_id` en una tabla de plataforma? | Sí, en inglés, y se anota en `docs/architecture.md`. |
| 2026-11-09 | ¿Cómo se ve el contador del panel? | Caracteres usados contra el máximo, con el texto exacto «{n}/500» (p. ej. «120/500»). |
