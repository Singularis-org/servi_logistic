# SL-36 — integraciones-por-empresa · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-17 · **Rama:** feature/SL-36-integraciones-por-empresa
>
> **Alcance.** Cada empresa configura con sus propias cuentas las cuatro integraciones de las que
> depende la app: WhatsApp Business (envíos, chat, plantillas y webhook de entrada), Google Maps
> (geocodificación), optimización de rutas de Google y el asistente IA (Anthropic). Las credenciales
> se guardan cifradas y aisladas por empresa, se prueban antes de guardarse y tienen estado visible.
> Cada servicio trae una **guía paso a paso** de dónde y cómo sacar su clave, para que el cliente la
> obtenga sin ayuda. La plataforma no aporta claves: se retiran las de entorno y la excepción
> `comoPlataforma("SL-36")` del webhook (deuda D10 de `progress/deudas.md`).
>
> **Lo que NO entra.**
> - Alta guiada de Meta (Embedded Signup): no planeada; el alta es manual.
> - La pantalla del superadmin con el estado de las integraciones de cada empresa → SL-26 (panel
>   de superadmin). SL-36 deja lista la lectura del estado.
> - La mensajería de WhatsApp en sí (plantillas, envíos, chat) ya existe: solo cambia de dónde lee
>   las credenciales.
>
> Sembrado por `/afinar-feature` el 2026-10-24. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.
> Referencia: `extracciones/integraciones-boveda-whatsapp-qc/` (`prompt.md`, `decisiones.md`), que se
> ADAPTA, no se copia.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. Sin Maps, ¿las asignaciones se **bloquean** o solo **se degradan**? spec_author lo verifica en el
   código (`lib/config/geocode.ts`, `lib/services/GeocodificacionService.ts` y sus consumidores) y
   lo convierte en el texto de «qué deja de funcionar» de ese servicio.
2. Qué datos pide la optimización de rutas por empresa: hoy usa una identidad federada (WIF) de
   plataforma más una cuenta de servicio (`lib/config/route-optimization.ts`). Lo resuelve el design;
   si exige algo que el cliente no puede obtener, se vuelve a preguntar al humano.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-24 | ¿La plataforma presta claves? | **No.** Sin clave propia, el servicio no está para esa empresa y la pantalla dice qué configurar. Se retiran las claves de entorno de los cuatro servicios; en el entorno solo queda la clave maestra de cifrado. |
| 2026-10-24 | ¿Qué servicios? | Los cuatro: WhatsApp, Google Maps, optimización de rutas y asistente IA. |
| 2026-10-24 | ¿Cómo sabe el cliente de dónde sacar cada clave? | Cada servicio trae una **guía paso a paso** (dónde entrar, qué crear, qué copiar y en qué campo pegarlo), accesible desde su formulario y publicada en la ayuda de la app (`app/(app)/ayuda/[...slug]`). |
| 2026-10-24 | ¿Quién configura? | Solo el usuario **maestro** de la empresa. Se valida en el service, con test. |
| 2026-10-24 | ¿Superadmin? | Solo ve el **estado** por empresa (conectada / error / sin configurar). Nunca la clave y nunca cambia nada. La UI va en SL-26. |
| 2026-10-24 | ¿Se puede desconectar? (D9) | **Sí.** Antes, aviso claro de qué deja de funcionar; cada servicio se marca «requerido» o «recomendado». |
| 2026-10-24 | Rotación de la clave maestra (D10) | Versiones de clave en el entorno y un comando del superadmin que recifra y muestra cuántas quedan por versión vieja; la vieja se retira cuando el conteo llega a 0. Sin KMS externo. |
| 2026-10-24 | Alta (D1) | Manual (formulario por servicio). La alta guiada de Meta queda fuera. |
| 2026-10-24 | Error del proveedor (D3) | Texto propio en pantalla; el detalle del proveedor va solo al log. Hereda de QC: «no existe», «borrada» y «de otra empresa» dan el mismo error. |
| 2026-10-24 | Probar conexión (D4) | Con límite de intentos por minuto y por empresa. |
| 2026-10-24 | Rastro (D5) | Queda registrado quién creó, cambió, probó o desconectó cada integración. La clave no se registra. |
| 2026-10-24 | Dónde se cifra (D8) | En la app (AES-256-GCM ligado a empresa, fila y campo), heredado de QC. Ni Vault ni KMS. |
| 2026-10-24 | Webhook de WhatsApp | Una sola URL que enruta por el número de teléfono (único entre empresas, heredado de QC). El App Secret y el verify token son de cada empresa. |
| 2026-10-24 | Aislamiento | RLS `<t>_por_empresa` por `organizacion_id` (heredado de SL-17). Identificadores en español, como el resto de la base. |
| 2026-10-24 | Forma de la tabla y borrado (D6, D7) | Los decide el design, con su alternativa descartada. |
| 2026-10-24 | E2E | Sí: credenciales y permisos son flujo crítico. |
| 2026-10-24 | Librerías | Ninguna nueva (`node:crypto`). |
