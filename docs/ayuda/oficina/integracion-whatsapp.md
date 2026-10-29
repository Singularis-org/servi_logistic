---
titulo: Guía · Conectar WhatsApp Business
modulo: configuracion
roles: [maestro]
actualizado: 2026-10-29
fuentes:
  - lib/types/integraciones.ts
  - lib/clients/probadores/whatsapp-probador.ts
  - app/api/webhooks/whatsapp/route.ts
  - lib/services/WebhookWhatsappService.ts
  - lib/services/ChatWhatsappService.ts
  - lib/repositories/ChatConversacionRepository.ts
  - app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx
  - specs/SL-36-integraciones-por-empresa/design.md
  - https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
  - https://developers.facebook.com/docs/whatsapp/business-management-api/get-started
  - https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks
  - https://developers.facebook.com/docs/whatsapp/embedded-signup/manage-accounts#subscribe-to-webhooks
  - https://developers.facebook.com/docs/graph-api/webhooks/getting-started
  - https://developers.facebook.com/docs/development/create-an-app/app-dashboard/basic-settings
  - https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers#display-names
---

# Guía · Conectar WhatsApp Business

Con esta integración la aplicación **envía los avisos a tus clientes, mantiene el chat con ellos y
gestiona tus plantillas** desde el número de WhatsApp Business de tu empresa. Es un servicio
**requerido**.

> Los pasos dentro de Meta dependen de cómo esté hoy su panel. Donde dice **(verificar en la
> consola)**, el nombre exacto del menú o del botón puede ser otro.

## Lo que necesitas antes de empezar

- Una **cuenta comercial de Meta** (portafolio comercial) de tu empresa.
- Una **app de Meta** con el producto **WhatsApp** agregado, creada desde el panel de desarrolladores
  de Meta, **solo para esta aplicación**.
- Un **número de teléfono** registrado en esa cuenta de WhatsApp Business. Un número que ya está
  conectado en otra empresa de la aplicación no se puede conectar en la tuya.

> **Una app de Meta tiene un solo webhook.** Si la app que vas a usar ya la usa otro sistema (otro
> software, un bot, un CRM), al pegar aquí la URL del webhook **ese otro sistema deja de recibir los
> mensajes de sus clientes**. Crea una app de Meta exclusiva para esta aplicación.

> **Si administras varios negocios en Meta**, la app, la cuenta de WhatsApp y el usuario del sistema
> tienen que estar **en el mismo negocio**. Para saber cuál es: en tu app de Meta, abre la
> configuración básica y mira el **portafolio comercial** al que pertenece **(verificar en la
> consola)**. En WhatsApp Manager, revisa también el selector de **cuenta de WhatsApp**, arriba: si
> no ves tu número, probablemente estás en otra cuenta.

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

1. En la configuración de tu cuenta comercial de Meta, abre **Usuarios del sistema**. Crea uno o usa
   uno que ya tengas **(verificar en la consola)**.
2. En **Asignar activos**, dale **control total** sobre **las dos cosas**: tu **app** de Meta y tu
   **cuenta de WhatsApp Business**. Si falta cualquiera de las dos, la prueba de conexión falla:
   según lo que responda Meta, con «El token no tiene permiso…» o con «Meta no encuentra ese Phone
   Number ID…».
3. Pulsa **Generar token**. Elige **tu app**, caducidad **Nunca**, y marca los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`. Con esos dos basta: si Meta
   ofrece otros, no hacen falta.
4. Copia el token y pégalo en **Token de acceso**. Meta lo muestra una vez: si lo pierdes, generas
   otro.

> Si cambias de app de Meta, el token de la app anterior **no sirve** para la nueva: genera uno nuevo
> para la nueva app y pégalo en la integración.

## Paso 3 · Copiar el App Secret

1. En tu app de Meta, abre la **configuración básica** **(verificar en la consola)**.
2. Junto a **Clave secreta de la app** (App Secret), pide mostrarla. Meta puede pedirte tu contraseña.
3. Cópiala y pégala en **App Secret**.

La conexión no puede probar el App Secret: se comprueba con el primer aviso que llegue de Meta. Si el
App Secret está mal, la aplicación **descarta todo lo que llega** a ese número, sin avisar al
cliente. El paso 8 explica cómo comprobarlo.

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

## Paso 6 · Publicar la app de Meta

Mientras la app está **en desarrollo**, Meta no le envía los avisos de mensajes reales: el webhook
queda verificado pero mudo. En el panel de tu app, abre **Publicar** y publícala **(verificar en la
consola)**. Si Meta pide completar datos (por ejemplo la URL de la política de privacidad), están en
la configuración básica de la app.

## Paso 7 · Suscribir la app a tu cuenta de WhatsApp

> **Este paso es el que más se olvida, y sin él no llega nada**, aunque el webhook esté verificado y
> la app publicada.

Si conectaste el número a mano (y no con un asistente de registro de Meta), tu app puede no estar
suscrita a tu cuenta de WhatsApp Business. Para suscribirla, en una terminal, cambia `<WABA_ID>` por
tu WABA ID y `<TOKEN>` por el token del paso 2:

```
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer <TOKEN>"
```

Debe responder `{"success":true}`. Para comprobarlo:

```
curl "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer <TOKEN>"
```

En la respuesta debe aparecer **tu app**. Si aparece también otra app (de un sistema anterior), esa
otra sigue recibiendo los avisos de tu número.

En Windows, usa `curl.exe` en lugar de `curl` dentro de PowerShell.

## Paso 8 · Comprobar que todo funciona

1. Desde cualquier celular, escribe un mensaje a tu número de WhatsApp Business.
2. Recarga **Configuración · Integraciones**: la **hora del último contacto del webhook** debe ser la
   de ahora. Eso confirma que Meta llama a la aplicación y que el App Secret es el correcto.

> **Ese mensaje de prueba no aparece en ningún chat, y es lo esperado.** La aplicación solo guarda
> los mensajes que llegan del **teléfono de destino de una orden que tenga un mensajero asignado**
> (y que no se haya borrado). Si ese número tiene varias órdenes asignadas, el mensaje va a la
> asignada más recientemente, salvo que el cliente use **Responder** sobre un mensaje de otra orden.
> Los mensajes de cualquier otro número se reciben y se descartan.
>
> Para verlo en el chat, crea una orden con tu número como teléfono de destino, asígnala a un
> mensajero y escribe desde ese número: el mensaje aparece en el chat de esa orden.

## Si la prueba falla

| Lo que dice la pantalla | Qué revisar |
| --- | --- |
| WhatsApp rechazó la credencial | El token está mal copiado, caducó o fue revocado. Genera otro (paso 2) |
| El token no tiene permiso | Al usuario del sistema le falta la app, la cuenta o los permisos de WhatsApp (paso 2) |
| Meta no encuentra ese Phone Number ID | Copiaste el número de teléfono en vez de su identificador, el número es de otra cuenta (paso 1), o al usuario del sistema le falta la cuenta de WhatsApp Business (paso 2) |
| Meta no encuentra ese WABA ID | El identificador de la cuenta está mal copiado (paso 1) |
| El número ya está conectado en otra empresa | Ese número lo usa otra empresa de la aplicación. Se libera cuando esa empresa lo desconecta |

## Si no llegan los mensajes

| Lo que ves | Qué revisar |
| --- | --- |
| La hora del último contacto del webhook **nunca** se mueve | Que la app esté publicada (paso 6) y suscrita a tu cuenta de WhatsApp (paso 7). Que la URL del webhook y **messages** estén en Meta (paso 5) |
| La hora se movió una vez (al verificar) y después no más | La app no está publicada (paso 6) o no está suscrita a tu cuenta (paso 7) |
| Los mensajes que envías se quedan con un solo ✓ | Si les pasa a todos: Meta no está avisando de las entregas, que es el mismo caso de las dos filas anteriores. Si es uno suelto, puede estar todavía en reintento |
| La hora no se mueve y cambiaste de app de Meta | El App Secret y el token guardados son los de la app anterior. Edita la integración y pega los de la nueva (pasos 2 y 3) |
| Otro sistema de tu empresa dejó de recibir mensajes | Los dos usan la misma app de Meta. Una app tiene un solo webhook: separa las apps |
| Un cliente escribe y no aparece en el chat | Ese número no es el teléfono de destino de ninguna orden con mensajero asignado (paso 8) |

- **Si perdiste el token de verificación:** **regenéralo** en la tarjeta y pégalo de nuevo en Meta:
  el anterior deja de valer al instante.
- **Si cambiaste el App Secret en Meta:** edita la integración y pega el nuevo. Con el viejo, los
  mensajes que llegan se descartan.

## Los chulos de los mensajes que envías

En el chat de cada orden, los mensajes que salen muestran su estado:

| Se ve | Qué significa |
| --- | --- |
| ✓ gris | Salió hacia Meta, o la aplicación lo está reintentando porque Meta no respondió. Aún no hay confirmación de entrega |
| ✓✓ gris | Llegó al celular del cliente |
| ✓✓ azul | El cliente lo leyó |
| **Falló** | Meta no pudo entregarlo |

El chat se actualiza solo cada pocos segundos. Si el cliente tiene apagadas las **confirmaciones de
lectura** en la privacidad de su WhatsApp, Meta no avisa cuándo lo leyó y el mensaje se queda en
✓✓ gris. Eso lo decide cada cliente en su celular: no se cambia desde la aplicación ni desde Meta.

Los estados solo cambian mientras el webhook funciona. Si un mensaje salió cuando el webhook no
estaba bien configurado, se queda con un solo ✓ aunque el cliente lo haya recibido.

## Nombre y foto del perfil

Lo que ve el cliente en WhatsApp (nombre, foto, descripción) se cambia en **WhatsApp Manager**, no en
esta aplicación:

1. En WhatsApp Manager, elige tu cuenta de WhatsApp en el selector de arriba.
2. Abre **Números de teléfono**, entra a tu número y abre la pestaña **Perfil** **(verificar en la
   consola)**.
3. Ahí cambias la **foto**, la descripción y los datos de contacto. Se aplican sin revisión.
4. El **nombre visible** también se edita ahí, pero **Meta lo revisa** antes de mostrarlo. Mientras
   tanto se sigue viendo el anterior.

Cuando Meta apruebe el nombre nuevo, cámbialo también en el campo **Nombre visible** de esta
integración, para que dentro de la aplicación diga lo mismo.

## Cuida la SIM del número

El número funciona en la nube de Meta, sin celular. Pero si algún día hay que volver a registrarlo o
verificarlo, Meta envía un código por SMS o llamada a ese número. **Guarda la SIM** en un lugar
seguro: sin ella, recuperar el número se complica.

## Lo que esta pantalla NO hace

- **No crea tu cuenta de Meta, tu app ni tu número.** Eso se hace en Meta.
- **No configura el webhook por ti.** La URL y el token se pegan en Meta a mano.
- **No publica tu app ni la suscribe a tu cuenta de WhatsApp.** Eso se hace en Meta (pasos 6 y 7).
- **No cambia el nombre ni la foto de tu perfil de WhatsApp.** Eso se hace en WhatsApp Manager.
- **No muestra en el chat los mensajes de números que no son el destino de una orden con mensajero
  asignado.**
- **No paga a Meta.** Lo que cobra Meta por los mensajes se le paga a Meta, con tu cuenta comercial.
- **No aprueba plantillas.** Las plantillas se crean desde **Configuración · Plantillas** y las aprueba
  Meta.
- **No vuelve a mostrar el token de verificación ni ninguna credencial guardada.**
