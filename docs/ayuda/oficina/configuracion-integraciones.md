---
titulo: Configuración · Integraciones
modulo: configuracion
pantalla: /configuracion/integraciones
roles: [maestro]
actualizado: 2026-10-25
fuentes:
  - app/(app)/configuracion/integraciones/page.tsx
  - lib/types/integraciones.ts
  - lib/config/integraciones.ts
  - lib/clients/probadores/probadores.ts
  - app/api/webhooks/whatsapp/route.ts
  - specs/SL-36-integraciones-por-empresa/requirements.md
  - specs/SL-36-integraciones-por-empresa/design.md
---

# Configuración · Integraciones

Las **cuentas de los servicios externos** que usa tu empresa: WhatsApp Business, Google Maps,
Optimización de rutas y el Asistente IA. **Cada empresa conecta las suyas.** La plataforma no presta
claves: un servicio que tu empresa no conecte, no funciona para ella.

Solo el **maestro** de la empresa abre esta pantalla.

## Las cuatro tarjetas

Una por servicio. Cada tarjeta dice:

- **Su estado:** «Conectada», «Error» o «Sin configurar» (abajo, qué significa cada uno).
- **Su marca:** **requerido** o **recomendado**. Un servicio recomendado se puede dejar sin
  configurar: la aplicación sigue funcionando, con menos.
- **La hora de la última prueba.**
- En WhatsApp, además, **la hora del último contacto del webhook**: la última vez que Meta llamó a la
  aplicación con tu token de verificación o con un mensaje firmado con tu App Secret.

Los tres estados:

- **Conectada** — la última prueba salió bien y el servicio está en uso.
- **Error** — la última prueba falló, o el proveedor rechazó la credencial mientras se usaba. La
  tarjeta muestra qué pasó y qué revisar.
- **Sin configurar** — tu empresa todavía no lo conectó.

## Las guías paso a paso

Cada formulario tiene un enlace a su **guía paso a paso**, que dice dónde entrar en la consola del
proveedor, qué crear, qué copiar y en qué campo pegarlo. También están en **Ayuda**, en el grupo
Oficina:

- **Guía · Conectar WhatsApp Business**
- **Guía · Conectar Google Maps**
- **Guía · Conectar la optimización de rutas**
- **Guía · Conectar el Asistente IA**

## Conectar un servicio

Llenas el formulario y guardas. **Antes de guardar, la aplicación prueba la credencial** con el
proveedor, con una consulta que no cambia nada de tu cuenta.

- **Si la prueba sale bien**, el servicio queda **Conectada**.
- **Si la prueba falla**, no se guarda nada. Sale un mensaje que dice qué revisar, y el formulario
  conserva lo que no es secreto. **Las claves y los tokens hay que volver a pegarlos**: por seguridad,
  nunca vuelven a la pantalla.

Cada servicio se conecta **una sola vez** por empresa. Para cambiar la credencial, se edita la que ya
está.

## Editar

Los campos secretos (tokens, claves, el App Secret) aparecen **vacíos**, aunque haya uno guardado.

- **Si dejas un secreto vacío**, se conserva el que estaba.
- **Si escribes uno nuevo**, o cambias un dato que la prueba revisa, la aplicación vuelve a probar
  antes de guardar. Si la prueba falla, se queda la credencial anterior.
- **Si cambias solo un dato que la prueba no revisa** (por ejemplo, el nombre visible de WhatsApp), se
  guarda sin probar.

## Probar conexión

El botón **Probar conexión** vuelve a probar la credencial guardada, sin cambiarla. Sirve para saber
si un servicio en **Error** ya se arregló del lado del proveedor.

**Hay un límite de pruebas por minuto para toda la empresa**, sumando los cuatro servicios y contando
las pruebas de conectar, de editar y de este botón. Al pasarlo, la aplicación no prueba y dice cuántos
segundos esperar.

## El token de verificación de WhatsApp

Al conectar WhatsApp, la aplicación genera un **token de verificación** y lo muestra **una sola vez**,
junto con la **URL del webhook**. Los dos van a la configuración del webhook en Meta (lo explica la
guía de WhatsApp).

> **Cópialo en ese momento.** Al recargar la pantalla ya no aparece: la aplicación no lo guarda
> legible. Si se pierde, se **regenera**.

**Regenerar el token** invalida el anterior al instante. Hasta que pegues el nuevo en Meta, Meta no
puede volver a verificar el webhook.

## Desconectar

> **Desconectar borra la credencial de tu empresa, y no se puede deshacer.** Para volver a usar el
> servicio hay que conectarlo de nuevo desde cero.

Antes de confirmar, la pantalla muestra la marca del servicio y **qué deja de funcionar sin él**:

- **WhatsApp Business:** no salen los avisos automáticos a los clientes, no hay chat con ellos, no se
  envía el mensaje de bienvenida y no se pueden crear ni sincronizar plantillas.
- **Google Maps:** las órdenes nuevas se quedan sin ubicación. Se pueden asignar igual, pero no
  aparecen en el mapa y la ruta del mensajero no las ordena por cercanía. Las direcciones que la app ya
  conocía siguen ubicándose.
- **Optimización de rutas:** la ruta de cada mensajero se ordena con un cálculo aproximado en línea
  recta, sin calles ni tráfico, y el mapa no dibuja el trazado.
- **Asistente IA:** el panel del asistente dice que no está configurado. La ayuda escrita de cada
  pantalla sigue disponible.

Al desconectar WhatsApp, su número queda libre: se puede conectar en otra empresa.

## Por qué un servicio pasa a «Error» sin que nadie lo toque

Si el proveedor **rechaza la credencial mientras se usa** (un token revocado en Meta, una clave
borrada en Google, una clave desactivada en Anthropic), la tarjeta pasa a **Error** con el motivo.
También si la credencial guardada **ya no se puede leer**: en ese caso la tarjeta pide volver a
escribirla.

El arreglo es siempre el mismo: corregir la credencial en el proveedor si hace falta, **editar** el
servicio con la credencial buena y guardar.

## Queda registrado

Conectar, editar, probar, regenerar el token y desconectar quedan en **Histórico · Acciones**, con
quién lo hizo y cuándo. **Nunca se registra la credencial.**

## Lo que esta pantalla NO hace

- **No muestra una credencial guardada.** Ni el maestro puede volver a verla: si se necesita, se saca
  otra vez de la consola del proveedor.
- **No crea las cuentas en los proveedores.** La cuenta de Meta, el proyecto de Google Cloud y la
  cuenta de Anthropic los creas tú, en sus consolas; las guías dicen cómo.
- **No paga a los proveedores.** Lo que cobra cada uno por su uso se le paga a él, con la facturación
  de tu cuenta.
- **No cambia la configuración del webhook en Meta.** La URL y el token se pegan allí a mano.
- **No la abren los administradores.** Es solo del maestro.
