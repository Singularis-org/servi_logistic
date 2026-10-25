---
titulo: Guía · Conectar WhatsApp Business
modulo: configuracion
roles: [maestro]
actualizado: 2026-10-25
fuentes:
  - lib/types/integraciones.ts
  - lib/clients/probadores/whatsapp-probador.ts
  - app/api/webhooks/whatsapp/route.ts
  - specs/SL-36-integraciones-por-empresa/design.md
  - https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
  - https://developers.facebook.com/docs/whatsapp/business-management-api/get-started
  - https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
  - https://developers.facebook.com/docs/graph-api/webhooks/getting-started
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings
---

# Guía · Conectar WhatsApp Business

Con esta integración la aplicación **envía los avisos a tus clientes, mantiene el chat con ellos y
gestiona tus plantillas** desde el número de WhatsApp Business de tu empresa. Es un servicio
**requerido**.

> Los pasos dentro de Meta dependen de cómo esté hoy su panel. Donde dice **(verificar en la
> consola)**, el nombre exacto del menú o del botón puede ser otro.

## Lo que necesitas antes de empezar

- Una **cuenta comercial de Meta** (Meta Business) de tu empresa.
- Una **app de Meta** con el producto **WhatsApp** agregado, creada desde el panel de desarrolladores
  de Meta.
- Un **número de teléfono** registrado en esa cuenta de WhatsApp Business. Un número que ya está
  conectado en otra empresa de la aplicación no se puede conectar en la tuya.

## Los cinco campos del formulario

| Campo | Qué es | De dónde sale |
| --- | --- | --- |
| **Nombre visible** | Cómo quieres ver este número dentro de la aplicación | Lo eliges tú |
| **Phone Number ID** | El identificador del número para la API. **No es el número de teléfono** | Configuración de la API de WhatsApp en tu app de Meta |
| **WABA ID** | El identificador de tu cuenta de WhatsApp Business | La misma pantalla de configuración de la API |
| **Token de acceso** | El permiso para que la aplicación use tu número | Un usuario del sistema de tu cuenta comercial |
| **App Secret** | La clave con la que Meta firma los mensajes que llegan | Configuración básica de tu app de Meta |

## Paso 1 · Copiar el Phone Number ID y el WABA ID

1. Entra al panel de desarrolladores de Meta y abre tu app.
2. En el producto **WhatsApp**, abre la configuración de la API **(verificar en la consola)**.
3. Elige el número que vas a conectar. Junto a él aparecen su **Phone Number ID** y el **WABA ID**
   (identificador de la cuenta de WhatsApp Business).
4. Pega cada uno en su campo. Copia los identificadores largos, no el número de teléfono.

## Paso 2 · Crear un token de acceso permanente

El token temporal que Meta muestra al empezar **caduca en pocas horas**: no sirve aquí. Hace falta el
token de un **usuario del sistema**.

1. En la configuración de tu cuenta comercial de Meta, crea un **usuario del sistema** (o usa uno que
   ya tengas) **(verificar en la consola)**.
2. Asígnale tu app y tu cuenta de WhatsApp Business **(verificar en la consola)**.
3. Genera un token para ese usuario, para tu app, con los permisos de WhatsApp de mensajería y de
   administración de la cuenta **(verificar en la consola)**.
4. Copia el token y pégalo en **Token de acceso**. Meta lo muestra una vez: si lo pierdes, generas
   otro.

## Paso 3 · Copiar el App Secret

1. En tu app de Meta, abre la **configuración básica** **(verificar en la consola)**.
2. Junto a **Clave secreta de la app** (App Secret), pide mostrarla. Meta puede pedirte tu contraseña.
3. Cópiala y pégala en **App Secret**.

La conexión no puede probar el App Secret: se comprueba con el primer mensaje que llegue. Si el App
Secret está mal, la aplicación **descarta los mensajes que llegan** a ese número, sin avisar al
cliente. Por eso, después de conectar, conviene mandar un mensaje de prueba al número y ver que entra
al chat.

## Paso 4 · Guardar y probar

Guarda el formulario. La aplicación consulta en Meta **tu número y tu cuenta de WhatsApp Business**
con el token. Si sale bien, la integración queda **Conectada** y te muestra **una sola vez**:

- la **URL del webhook**;
- el **token de verificación**.

**Cópialos los dos antes de cerrar.** El token de verificación no vuelve a aparecer.

## Paso 5 · Configurar el webhook en Meta

El webhook es la puerta por la que Meta le avisa a la aplicación de los mensajes que llegan y de si
los que enviaste se entregaron.

1. En tu app de Meta, en el producto **WhatsApp**, abre la configuración del webhook **(verificar en
   la consola)**.
2. En **URL de devolución de llamada** (callback URL), pega la **URL del webhook**.
3. En **Token de verificación**, pega el **token de verificación**.
4. Confirma. Meta llama en ese momento a la aplicación; si el token coincide, la verificación pasa y
   en la tarjeta se actualiza la **hora del último contacto del webhook**.
5. Suscríbete al campo **messages** del webhook **(verificar en la consola)**.

La URL del webhook es **la misma para todas las empresas**: la aplicación reconoce que el mensaje es
tuyo por el número que lo recibe.

## Si la prueba falla

| Lo que dice la pantalla | Qué revisar |
| --- | --- |
| WhatsApp rechazó la credencial | El token está mal copiado, caducó o fue revocado. Genera otro (paso 2) |
| El token no tiene permiso | Al usuario del sistema le falta la app, la cuenta o los permisos de WhatsApp (paso 2) |
| Meta no encuentra ese Phone Number ID | Copiaste el número de teléfono en vez de su identificador, o el número es de otra cuenta (paso 1) |
| Meta no encuentra ese WABA ID | El identificador de la cuenta está mal copiado (paso 1) |
| El número ya está conectado en otra empresa | Ese número lo usa otra empresa de la aplicación. Se libera cuando esa empresa lo desconecta |

## Si dejas de recibir mensajes

- **La hora del último contacto del webhook no se mueve:** revisa en Meta que la URL y el token del
  webhook son los de la aplicación y que sigue suscrito a **messages**. Si perdiste el token,
  **regenéralo** en la tarjeta y pégalo de nuevo en Meta: el anterior deja de valer al instante.
- **Cambiaste el App Secret en Meta:** edita la integración y pega el nuevo. Con el viejo, los mensajes
  que llegan se descartan.

## Lo que esta pantalla NO hace

- **No crea tu cuenta de Meta, tu app ni tu número.** Eso se hace en Meta.
- **No configura el webhook por ti.** La URL y el token se pegan en Meta a mano.
- **No paga a Meta.** Lo que cobra Meta por los mensajes se le paga a Meta, con tu cuenta comercial.
- **No aprueba plantillas.** Las plantillas se crean desde **Configuración · Plantillas** y las aprueba
  Meta.
- **No vuelve a mostrar el token de verificación ni ninguna credencial guardada.**
