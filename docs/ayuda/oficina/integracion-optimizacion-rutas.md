---
titulo: Guía · Conectar la optimización de rutas
modulo: configuracion
roles: [maestro]
actualizado: 2026-10-25
fuentes:
  - lib/types/integraciones.ts
  - lib/clients/probadores/optimizacion-rutas-probador.ts
  - lib/auth/google-sa-token.ts
  - lib/config/route-optimization.ts
  - lib/clients/google-route-optimization.ts
  - lib/clients/google-routes.ts
  - lib/clients/fallback-route-optimization.ts
  - specs/SL-36-integraciones-por-empresa/design.md
  - https://developers.google.com/maps/documentation/route-optimization/overview
  - https://developers.google.com/maps/documentation/route-optimization/cloud-setup
  - https://developers.google.com/maps/documentation/routes
  - https://cloud.google.com/iam/docs/service-accounts-create
  - https://cloud.google.com/iam/docs/keys-create-delete
  - https://cloud.google.com/iam/docs/manage-access-service-accounts
  - https://cloud.google.com/resource-manager/docs/organization-policy/restricting-service-accounts
---

# Guía · Conectar la optimización de rutas

Con esta integración la aplicación **ordena la ruta de cada mensajero con calles y tráfico reales** y
el mapa **dibuja el trazado**. Es un servicio **recomendado**: sin él, la ruta se ordena con un cálculo
aproximado en línea recta.

Lo que se conecta es **la clave JSON de una cuenta de servicio** de Google Cloud. **No sirve una clave
de API**: la API de Route Optimization de Google no las acepta. Tampoco sirve la clave de Google Maps.

> Los pasos dentro de Google Cloud dependen de cómo esté hoy su consola. Donde dice **(verificar en
> la consola)**, el nombre exacto del menú o del botón puede ser otro.

## Lo que necesitas antes de empezar

- Un **proyecto** de Google Cloud con **facturación activa** (puede ser el mismo de Google Maps).
  Google cobra el uso según sus precios, a tu cuenta.
- Permiso en ese proyecto para habilitar APIs, crear cuentas de servicio, darles roles y crearles
  claves.

> **Si tu empresa usa una organización de Google Cloud**, puede tener una política que **prohíbe
> crear claves de cuentas de servicio**. Si al llegar al paso 4 Google no te deja crear la clave, es
> eso: lo resuelve quien administra la organización de Google Cloud de tu empresa. Mientras tanto, la
> aplicación sigue ordenando las rutas con el cálculo aproximado.

## Paso 1 · Habilitar las dos APIs

En la biblioteca de APIs del proyecto, habilita **(verificar en la consola)**:

1. **Route Optimization API** — ordena las paradas.
2. **Routes API** — dibuja el trazado en el mapa.

**La prueba de conexión no comprueba este paso.** Si falta, la conexión sale bien igual, y el error
aparece la primera vez que se optimiza una ruta (ver «Si después pasa a Error»).

## Paso 2 · Crear la cuenta de servicio

1. En **IAM y administración**, abre **Cuentas de servicio** y crea una **(verificar en la consola)**.
2. Ponle un nombre que diga para qué es; por ejemplo, «rutas de la aplicación».

## Paso 3 · Darle el rol

Dale a la cuenta de servicio, en el proyecto, el rol de **editor de Route Optimization**
(`roles/routeoptimization.editor`) **(verificar en la consola)**.

**La prueba de conexión tampoco comprueba este paso.** Sin el rol, la conexión sale bien y la primera
optimización falla.

## Paso 4 · Crear y descargar la clave JSON

1. Abre la cuenta de servicio y ve a sus **claves** **(verificar en la consola)**.
2. Agrega una clave nueva, de tipo **JSON**.
3. Google descarga un archivo `.json`. **Es la única copia**: Google no vuelve a mostrarla.

Guarda ese archivo como guardarías una contraseña. Después de pegarlo en la aplicación, lo más seguro
es borrarlo de tu computadora.

## Paso 5 · Pegarla y guardar

1. Abre el archivo `.json` con un editor de texto.
2. Copia **todo** su contenido, desde la primera llave `{` hasta la última `}`.
3. Pégalo en **JSON de la clave de la cuenta de servicio**.
4. Guarda. La aplicación pide a Google un permiso de acceso con esa clave. Si Google lo da, la
   integración queda **Conectada** y la tarjeta muestra el **proyecto** y la **cuenta de servicio**
   (nunca la clave).

## Si la prueba falla

| Lo que dice la pantalla | Qué revisar |
| --- | --- |
| Lo pegado no es el JSON de la clave de una cuenta de servicio | Faltó copiar una parte del archivo, o pegaste otra cosa (una clave de API, el nombre de la cuenta). Pega el archivo entero (paso 5) |
| Google rechazó la credencial | La clave fue borrada o desactivada en Google Cloud, o la cuenta de servicio fue eliminada. Crea una clave nueva (paso 4) |
| Google no respondió a tiempo | Vuelve a probar en unos minutos |

## Si después pasa a «Error»

Si la conexión salió bien pero la tarjeta pasa a **Error** la primera vez que se optimiza una ruta, a
la cuenta de servicio **le falta permiso**: la Route Optimization API no está habilitada en el proyecto
(paso 1) o la cuenta no tiene el rol (paso 3). Corrígelo en Google Cloud y pulsa **Probar conexión**.

Esa ruta no se pierde: se ordena con el cálculo aproximado.

## Mientras no esté conectado

La ruta de cada mensajero se ordena con un **cálculo aproximado en línea recta**, sin calles ni
tráfico, y el mapa no dibuja el trazado. El reparto sigue funcionando.

## Lo que esta pantalla NO hace

- **No crea la cuenta de servicio, el rol ni la clave.** Eso se hace en Google Cloud.
- **No comprueba que las APIs estén habilitadas ni que la cuenta tenga el rol.** Solo comprueba que la
  clave es válida.
- **No paga a Google.** El uso se cobra a la facturación de tu proyecto.
- **No ubica direcciones.** Eso es **Google Maps**, que es otra integración con otra credencial.
- **No vuelve a mostrar la clave guardada.**
