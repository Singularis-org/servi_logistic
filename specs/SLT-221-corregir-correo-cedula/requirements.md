# SLT-221 «Maestro: corregir correo y cédula de un usuario» — requirements

> Ruta completa. Una ficha, **dos PR secuenciales** sobre la misma rama
> (`feature/SLT-221-corregir-correo-cedula`): **PR 1 = cédula** (y la base del Histórico),
> **PR 2 = correo con confirmación**. Corte decidido por Carlos el 2026-11-19 («pon los dos en la
> misma»). Los requisitos se numeran desde **R1601** para no chocar con los `R16`, `R17`… que ya
> citan los comentarios del módulo de usuarios (feature 25, SLT-42, ficha 379).

## Alcance

El maestro corrige el **correo** y la **cédula** (número de documento) de un usuario de su empresa
desde el formulario de usuario de Configuración. Hoy los dos campos están deshabilitados al editar
(`UsuarioForm.tsx:477` y `:516`) y el borde los rechaza (`actualizarUsuarioSchema`, `.strict()`,
`lib/types/usuario.ts:78-98`).

- **Cédula:** se corrige en el acto, como el teléfono.
- **Correo:** el maestro lo pide; el cambio queda pendiente hasta que la persona lo confirma desde
  el correo nuevo.

### Lo que NO entra
- Cambiar la contraseña (ya existe: «Restablecer contraseña», feature 287).
- Que el propio usuario cambie su correo o su cédula desde su perfil.
- Cambiar el correo o la cédula del superadmin (es `not_found` para el módulo, SL-32).
- Avisar al correo anterior (D3).
- Migrar `PasswordResetService` al util de enlaces nuevo (design §3.4).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Requisitos |
|---|---|---|---|
| D1 | El maestro corrige el CORREO y la CÉDULA de un usuario desde el formulario de usuario de Configuración. | Carlos, 2026-11-19 | R1601, R1606, R1610 |
| D2 | Correo: el cambio solo se aplica cuando la persona lo confirma desde el correo NUEVO. Mientras no confirme, sigue entrando con el anterior. | Carlos, 2026-11-19 | R1615, R1622 |
| D3 | NO se avisa al correo anterior. | Carlos, 2026-11-19 | R1614 |
| D4 | Cada cambio (correo y cédula) queda en el Histórico de acciones con valor anterior y nuevo («es importante»). | Carlos, 2026-11-19 | R1604, R1608, R1622 |
| D5 | Correo y cédula siguen siendo únicos (por empresa: SL-18 / SLT-42). | Carlos, 2026-11-19 | R1603, R1611, R1624 |
| D6 | Una sola ficha, entregada en dos PR secuenciales: PR 1 cédula, PR 2 correo. No se crea ficha nueva. | Carlos, 2026-11-19 | — (proceso) |
| D7 | Para confirmar basta el enlace: no se pide la contraseña actual (el maestro no la conoce). El maestro ve el cambio pendiente y puede reenviarlo o cancelarlo. | Carlos (delegado), 2026-11-19 | R1618, R1619, R1620, R1628 |
| D8 | El enlace vence a las 72 h, configurable por entorno como el de bienvenida. | Carlos (delegado), 2026-11-19 | R1621 |
| D9 | Al confirmar el correo nuevo no se cierran las sesiones abiertas. | Carlos (delegado), 2026-11-19 | R1627 |
| D10 | Se ensanchan `valor_anterior` y `valor_nuevo` del Histórico y se declara una excepción en la guardia `historial-accion-sin-datos-cliente` para `usuario_cedula_cambiada` y `usuario_email_cambiado`. **Consecuencia aceptada:** el Histórico se descarga y no se purga, así que el correo y la cédula anteriores de un usuario quedan ahí para siempre. | Carlos, 2026-11-19 | R1604, R1608, R1622 |

## Requisitos (EARS)

### PR 1 — Cédula y base del Histórico

- **R1601** — WHEN el maestro guarda la edición de un usuario de su empresa con un número de
  documento distinto del guardado, THE SYSTEM SHALL reemplazar el documento del usuario por el
  nuevo, normalizado con la regla del tipo de documento resultante y del país de la empresa.
- **R1602** — IF el documento nuevo no cumple la regla del tipo resultante (el tipo nuevo si la
  misma edición lo cambia; si no, el guardado), THEN THE SYSTEM SHALL rechazar la edición con
  `validation_error` en el campo `cedula` y no cambiar ningún campo del usuario.
- **R1603** — IF otro usuario de la misma empresa ya tiene ese tipo y ese documento, THEN THE
  SYSTEM SHALL rechazar la edición con `conflict` en el campo `cedula`, no cambiar ningún campo, y
  el formulario SHALL mostrar «Ya está en uso por otro usuario» bajo «Número de documento».
- **R1604** — WHEN el documento de un usuario cambia, THE SYSTEM SHALL registrar en el Histórico
  de acciones, en la misma transacción que el cambio, una fila `usuario_cedula_cambiada` con el
  documento anterior en `valor_anterior`, el nuevo en `valor_nuevo`, el usuario afectado como
  entidad y el maestro como actor.
- **R1605** — IF la edición envía el mismo documento que el guardado, THEN THE SYSTEM SHALL no
  escribir ninguna fila `usuario_cedula_cambiada`.
- **R1606** — WHILE el formulario de usuario está en modo edición, THE SYSTEM SHALL permitir
  editar el campo «Número de documento».
- **R1607** — THE SYSTEM SHALL seguir rechazando con `validation_error` toda edición de usuario que
  incluya `email` o `password`: el correo solo cambia por el flujo de confirmación (R1610-R1632).
- **R1608** — THE SYSTEM SHALL guardar `valor_anterior` y `valor_nuevo` del Histórico de acciones
  completos hasta 254 caracteres, sin recortarlos.
- **R1609** — THE SYSTEM SHALL mostrar en la pantalla y en la descarga del Histórico los tipos
  `usuario_cedula_cambiada` («Cambió la cédula de un usuario») y `usuario_email_cambiado`
  («Cambió el correo de un usuario»), en la categoría «Cambia quién puede hacer qué».

### PR 2 — Correo con confirmación

- **R1610** — WHEN el maestro pide cambiar el correo de un usuario de su empresa por una dirección
  válida distinta de la actual, THE SYSTEM SHALL guardar un cambio pendiente y enviar al correo
  NUEVO un mensaje con un enlace de confirmación de un solo uso, sin cambiar el correo del usuario.
- **R1611** — IF otro usuario de la misma empresa ya usa el correo nuevo, THEN THE SYSTEM SHALL
  rechazar la petición con `conflict` en el campo `email`, sin crear el pendiente ni enviar nada.
- **R1612** — IF el correo pedido es igual al actual del usuario, THEN THE SYSTEM SHALL rechazar la
  petición con `validation_error` en el campo `email`, sin crear el pendiente ni enviar nada.
- **R1613** — IF el usuario es la cuenta dedicada de una API key (rol `apiKey`), THEN THE SYSTEM
  SHALL rechazar la petición con `validation_error` en el campo `email`: no hay persona que
  confirme.
- **R1614** — THE SYSTEM SHALL no enviar ningún mensaje al correo anterior del usuario por la
  petición, el reenvío, la cancelación ni la confirmación de un cambio de correo.
- **R1615** — WHILE un cambio de correo está pendiente, THE SYSTEM SHALL seguir autenticando al
  usuario con su correo anterior y no reconocer el correo nuevo como correo de su cuenta.
- **R1616** — WHEN el maestro pide un cambio de correo para un usuario que ya tiene uno pendiente,
  THE SYSTEM SHALL anular el pendiente anterior, de modo que su enlace deje de valer.
- **R1617** — IF el envío del mensaje de confirmación falla, THEN THE SYSTEM SHALL anular el
  pendiente recién creado, responder `envio_fallido`, y el formulario SHALL mostrar «No se pudo
  enviar el correo de confirmación. Inténtalo de nuevo.».
- **R1618** — WHILE un usuario tiene un cambio de correo pendiente, THE SYSTEM SHALL mostrar en su
  formulario de edición el correo nuevo, la fecha y hora de vencimiento del enlace (o «Vencido» si
  ya venció) y las acciones «Reenviar» y «Cancelar».
- **R1619** — WHEN el maestro pulsa «Cancelar» sobre un cambio pendiente, THE SYSTEM SHALL anular
  el pendiente, de modo que su enlace deje de valer y el formulario deje de mostrarlo.
- **R1620** — WHEN el maestro pulsa «Reenviar» sobre un cambio pendiente (vencido o no), THE SYSTEM
  SHALL emitir un enlace nuevo al mismo correo nuevo, con vencimiento contado desde ese momento, y
  el enlace anterior SHALL dejar de valer.
- **R1621** — THE SYSTEM SHALL dar a cada enlace de confirmación un vencimiento de
  `AUTH_CAMBIO_CORREO_TTL_HORAS` horas desde su emisión, 72 si la variable no está definida.
- **R1622** — WHEN la persona abre un enlace válido (existe, no anulado, no usado, no vencido y con
  el secreto correcto) y pulsa «Confirmar correo», THE SYSTEM SHALL, en una sola transacción,
  cambiar el correo del usuario por el nuevo, marcar el pendiente como confirmado y registrar en el
  Histórico una fila `usuario_email_cambiado` con el correo anterior en `valor_anterior`, el nuevo
  en `valor_nuevo` y como actor el maestro que pidió el cambio.
- **R1623** — IF el enlace no es válido por cualquier motivo (formato roto, inexistente, anulado,
  usado, vencido o secreto incorrecto), THEN THE SYSTEM SHALL responder con el mismo mensaje
  genérico («El enlace no es válido o ya venció. Pide a tu administrador que te envíe otro.») y no
  cambiar nada.
- **R1624** — IF al confirmar, el correo nuevo ya lo usa otro usuario de la misma empresa, THEN THE
  SYSTEM SHALL no cambiar nada, dejar el pendiente como estaba y mostrar «Ese correo ya lo usa otra
  cuenta de tu empresa. Habla con tu administrador.».
- **R1625** — WHEN dos confirmaciones del mismo enlace llegan a la vez, THE SYSTEM SHALL aplicar el
  cambio una sola vez y responder a la otra como enlace no válido (R1623).
- **R1626** — THE SYSTEM SHALL no cambiar nada al abrir la página del enlace: el cambio solo ocurre
  al pulsar «Confirmar correo».
- **R1627** — WHEN se confirma un cambio de correo, THE SYSTEM SHALL conservar las sesiones abiertas
  del usuario.
- **R1628** — THE SYSTEM SHALL aceptar la confirmación sin sesión iniciada y sin pedir la
  contraseña.
- **R1629** — IF un mismo enlace supera `AUTH_RESET_MAX_VERIFY_ATTEMPTS` intentos de confirmación
  desde la misma IP dentro de `AUTH_RESET_VERIFY_WINDOW_MINUTES`, THEN THE SYSTEM SHALL responder
  como enlace no válido (R1623) sin evaluar el secreto.
- **R1630** — IF el maestro pide, reenvía, cancela o consulta un cambio de correo de un usuario que
  no es de su empresa (o del superadmin), THEN THE SYSTEM SHALL responder `not_found` sin leer ni
  escribir nada de ese usuario.
- **R1631** — IF un usuario con un rol distinto de `maestro` pide, reenvía, cancela o consulta un
  cambio de correo, THEN THE SYSTEM SHALL responder `forbidden` sin leer ni escribir nada.
- **R1632** — THE SYSTEM SHALL no guardar en claro ni escribir en un log el secreto del enlace: en
  la base solo queda su hash, y la URL lo lleva solo en el fragmento (`#enlace=`).

## Preguntas abiertas

Ninguna. P1-P4 de la versión anterior quedaron cerradas como D6-D9.
