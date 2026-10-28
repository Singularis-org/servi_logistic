---
titulo: Guía · Conectar Google Maps
modulo: configuracion
roles: [maestro]
actualizado: 2026-10-25
fuentes:
  - lib/types/integraciones.ts
  - lib/clients/probadores/google-maps-probador.ts
  - lib/services/GeocodificacionService.ts
  - lib/services/AsignabilidadCoordenadasService.ts
  - specs/SL-36-integraciones-por-empresa/design.md
  - https://developers.google.com/maps/documentation/geocoding/overview
  - https://developers.google.com/maps/documentation/geocoding/get-api-key
  - https://developers.google.com/maps/api-security-best-practices
  - https://cloud.google.com/resource-manager/docs/creating-managing-projects
  - https://cloud.google.com/billing/docs/how-to/modify-project
---

# Guía · Conectar Google Maps

Con esta integración la aplicación **ubica en el mapa la dirección de cada orden nueva**. Con esa
ubicación la orden aparece en el mapa y la ruta del mensajero la ordena por cercanía. Es un servicio
**requerido**.

Lo que se conecta es una **clave de API** de Google Cloud con la **Geocoding API** habilitada.

> Los pasos dentro de Google Cloud dependen de cómo esté hoy su consola. Donde dice **(verificar en
> la consola)**, el nombre exacto del menú o del botón puede ser otro.

## Lo que necesitas antes de empezar

- Una **cuenta de Google** de tu empresa con acceso a la consola de Google Cloud.
- Un **proyecto** de Google Cloud con **facturación activa**. Google cobra el uso de la Geocoding API
  según sus precios, a tu cuenta.

## Paso 1 · Elegir o crear el proyecto

1. Entra a la consola de Google Cloud.
2. Elige el proyecto de tu empresa o crea uno nuevo.
3. Comprueba que el proyecto tiene una cuenta de facturación vinculada **(verificar en la consola)**.

## Paso 2 · Habilitar la Geocoding API

1. En la biblioteca de APIs del proyecto, busca **Geocoding API** **(verificar en la consola)**.
2. Habilítala.

Sin este paso la clave existe, pero Google rechaza las búsquedas de direcciones.

## Paso 3 · Crear la clave de API

1. En las credenciales del proyecto, crea una **clave de API** **(verificar en la consola)**.
2. **Restringe la clave a la Geocoding API.** Así, si alguien la obtuviera, no podría usarla para
   otros servicios de tu cuenta.
3. Copia la clave.

No le pongas una restricción por sitio web ni por dirección IP sin consultarlo antes: la aplicación
llama a Google desde sus servidores, no desde tu navegador, y una restricción así puede hacer que
Google la rechace.

## Paso 4 · Pegarla y guardar

1. Pega la clave en **Clave de API**.
2. Guarda. La aplicación busca en Google **una dirección fija de prueba** con tu clave. Si Google
   responde, la integración queda **Conectada**.

## Si la prueba falla

| Lo que dice la pantalla | Qué revisar |
| --- | --- |
| Google Maps rechazó la credencial | La clave está mal copiada o fue borrada, la Geocoding API no está habilitada en el proyecto (paso 2), la clave está restringida a otra API, o el proyecto no tiene facturación |
| Google Maps no respondió a tiempo | Vuelve a probar en unos minutos |

## Mientras no esté conectado

La aplicación **no se detiene**:

- las órdenes nuevas se quedan sin ubicación, pero **se pueden asignar igual**;
- no aparecen en el mapa y la ruta del mensajero no las ordena por cercanía;
- las direcciones que la aplicación ya conocía siguen ubicándose.

Un matiz: una orden recién creada **no se puede asignar hasta que la aplicación intenta ubicarla
por primera vez**. Ese intento corre en segundo plano, cada minuto; después del intento, la orden ya
se puede asignar aunque se haya quedado sin ubicación.

## Lo que esta pantalla NO hace

- **No crea tu proyecto ni tu clave en Google.** Eso se hace en la consola de Google Cloud.
- **No paga a Google.** El uso de la Geocoding API se cobra a la facturación de tu proyecto.
- **No ordena las rutas.** Ordenar la ruta con calles y tráfico es la integración **Optimización de
  rutas**, que pide otra credencial: la clave de Maps no sirve para eso.
- **No vuelve a mostrar la clave guardada.**
