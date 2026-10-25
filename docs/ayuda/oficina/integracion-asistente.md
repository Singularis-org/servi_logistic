---
titulo: Guía · Conectar el Asistente IA
modulo: configuracion
roles: [maestro]
actualizado: 2026-10-25
fuentes:
  - lib/types/integraciones.ts
  - lib/clients/probadores/asistente-probador.ts
  - lib/clients/anthropic-asistente.ts
  - specs/SL-36-integraciones-por-empresa/design.md
  - https://docs.anthropic.com/en/api/getting-started
  - https://docs.anthropic.com/en/api/models-list
---

# Guía · Conectar el Asistente IA

Con esta integración funciona el **panel del asistente**, que responde preguntas sobre cómo se usa la
aplicación a partir de esta misma ayuda. Es un servicio **recomendado**.

Lo que se conecta es una **clave de API de Anthropic**, la empresa que da el modelo del asistente.

> Los pasos dentro de la consola de Anthropic dependen de cómo esté hoy. Donde dice **(verificar en
> la consola)**, el nombre exacto del menú o del botón puede ser otro.

## Lo que necesitas antes de empezar

- Una **cuenta en la consola de Anthropic** de tu empresa.
- **Saldo o un método de pago** en esa cuenta. Anthropic cobra cada consulta según sus precios, a tu
  cuenta.

## Paso 1 · Crear la clave de API

1. Entra a la consola de Anthropic.
2. Abre la sección de **claves de API** (API keys) **(verificar en la consola)**.
3. Crea una clave nueva. Ponle un nombre que diga para qué es; por ejemplo, «asistente de la
   aplicación».
4. Copia la clave. **Anthropic la muestra una sola vez**: si la pierdes, creas otra.

## Paso 2 · Pegarla y guardar

1. Pega la clave en **Clave de API**.
2. Guarda. La aplicación pide a Anthropic la lista de modelos con tu clave. Si Anthropic responde, la
   integración queda **Conectada**.

## Si la prueba falla

| Lo que dice la pantalla | Qué revisar |
| --- | --- |
| Anthropic rechazó la credencial | La clave está mal copiada, fue desactivada o borrada en la consola de Anthropic. Crea otra (paso 1) |
| Anthropic respondió con un error de su lado | Vuelve a probar más tarde |
| Anthropic no respondió a tiempo | Vuelve a probar en unos minutos |

**La prueba solo comprueba que la clave es válida, no el saldo.** Si la cuenta de Anthropic se queda
sin saldo, la conexión puede salir bien y el asistente no responder hasta que lo recargues en la
consola de Anthropic.

## Mientras no esté conectado

El panel del asistente dice que **no está configurado** y no responde. La ayuda escrita de cada
pantalla sigue disponible, en el botón **?** y en **Ayuda**.

## Lo que esta pantalla NO hace

- **No crea tu cuenta ni tu clave en Anthropic.** Eso se hace en la consola de Anthropic.
- **No paga a Anthropic.** Cada consulta se cobra a tu cuenta de Anthropic.
- **No cambia lo que sabe el asistente.** Responde a partir de esta ayuda; lo que no está escrito
  aquí, no lo sabe.
- **No vuelve a mostrar la clave guardada.**
