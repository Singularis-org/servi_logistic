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

Vocabulario de este archivo:
- **Integración**: la conexión de UNA empresa con UNO de los cuatro servicios.
- **Credencial**: lo secreto de una integración.
  - WhatsApp: token de acceso y App Secret.
  - Google Maps: clave de API.
  - Optimización de rutas: clave de la cuenta de servicio.
  - Asistente: clave de API.
- **Datos públicos**: lo no secreto (ids de Meta, proyecto de Google, nombre visible).
- **Maestro**: el usuario con rol `maestro` de esa empresa.
- **Catálogo de servicios**: la lista única de los cuatro servicios. Por cada uno dice sus campos, si
  es «requerido» o «recomendado», qué deja de funcionar sin él y cuál es su guía (design §8).

### A. Bóveda de credenciales

- **R1.** El sistema DEBE cifrar cada credencial con AES-256-GCM, con la criptografía nativa de la
  plataforma y sin librería de terceros.
  - Lo cifra con la versión de clave maestra activa.
  - Liga cada valor, como datos asociados, a la versión, la empresa, la integración y el campo,
    codificados en JSON.
  - Lo guarda con la forma `v<n>:<iv>:<tag>:<cifrado>`.
- **R2.** El sistema DEBE producir valores distintos al cifrar dos veces el mismo texto. Ningún valor
  guardado DEBE contener el texto en claro ni su base64.
- **R3.** SI un valor guardado está alterado, mal formado, trae una versión que no está en el anillo
  o se descifra con otro contexto (empresa, integración o campo), ENTONCES el sistema DEBE fallar con
  un único error «credencial ilegible», sin causa encadenada y sin fragmentos del valor.
- **R4.** SI la configuración de claves maestras falta, está mal formada o repite una versión,
  ENTONCES el sistema DEBE fallar al cifrar o descifrar con un error que nombra la variable o la
  posición, nunca el valor.
  - La configuración se lee en cada llamada, no al importar.
  - La aplicación arranca sin ella.
- **R5.** El sistema DEBE excluir las credenciales, sus valores cifrados y el resumen del token de
  verificación de toda respuesta a la pantalla, de todo log y de todo registro del historial. En la
  base solo DEBEN quedar valores con la forma `v<n>:…` y el resumen hexadecimal de 64 caracteres.

### B. Quién configura y aislamiento

- **R6.** SI quien pide una operación de configuración de integraciones no es el maestro de una
  empresa, ENTONCES el sistema DEBE rechazarla en el service sin leer el repositorio ni llamar al
  proveedor.
  - Las operaciones son: ver, dar de alta, editar, probar, regenerar el token y desconectar.
  - Se rechaza también a: otro rol, el superadmin y quien no tiene sesión.
- **R7.** El sistema DEBE tomar la empresa de toda operación de configuración de la sesión del actor,
  nunca de los datos que envía.
- **R8.** El sistema DEBE acotar a la empresa en curso toda lectura y escritura de integraciones.
  - Se acota por filtro en la consulta y por RLS `<t>_por_empresa` sobre `organizacion_id`.
  - Una empresa no puede leer, editar, probar ni desconectar la integración de otra, tampoco con SQL
    a mano.
- **R9.** SI el identificador de una integración no tiene forma válida, no existe o es de otra
  empresa, ENTONCES el sistema DEBE responder el mismo «no encontrada», sin distinguir los casos.
- **R10.** MIENTRAS una empresa tenga una integración de un servicio, el sistema DEBE rechazar una
  segunda alta de ese servicio, también si llegan dos altas a la vez.
- **R11.** SI el número de WhatsApp de un alta o una edición ya está conectado en otra empresa,
  ENTONCES el sistema DEBE rechazarlo con un error propio que no dice qué empresa lo tiene.

### C. Alta, edición y prueba

- **R12.** CUANDO el maestro da de alta un servicio con su formulario manual, el sistema DEBE probar
  la credencial contra el proveedor antes de escribir nada.
  - Si la prueba sale bien, crea la integración en estado «conectada» con los datos públicos que
    devuelve el proveedor.
- **R13.** SI la prueba de un alta o de una edición falla, ENTONCES el sistema DEBE dejar la
  integración sin crear ni modificar.
  - Muestra el texto propio del catálogo para ese servicio y ese motivo.
  - El detalle del proveedor va solo al log, sin credenciales.
- **R14.** CUANDO el maestro edita una integración, el sistema DEBE tratar los campos así:
  - un campo secreto vacío o ausente conserva el valor guardado, sin descifrarlo ni volver a cifrarlo;
  - si cambia un secreto o un dato público que la prueba verifica, vuelve a probar antes de guardar;
  - si cambia solo un dato que la prueba no verifica, guarda sin probar y no toca el estado.
- **R15.** CUANDO el maestro pide «Probar conexión», el sistema DEBE probar la credencial guardada.
  - Si sale bien, deja la integración «conectada» y limpia el último error.
  - Si sale mal, la deja en «error» con el código del catálogo y la hora de la prueba.
- **R16.** SI una empresa supera el límite de pruebas por minuto, ENTONCES el sistema DEBE rechazar la
  siguiente sin llamar al proveedor y decir cuándo puede volver a intentar.
  - Cuentan las pruebas de alta, de edición y de «Probar conexión».
  - El límite se fija en la configuración (design §6).
- **R17.** El sistema DEBE probar cada servicio con su operación de solo lectura del design §5:
  - WhatsApp: el número y la cuenta de WhatsApp Business;
  - Google Maps: una geocodificación de una dirección fija;
  - optimización de rutas: el intercambio de la clave de la cuenta de servicio por un token;
  - asistente: el listado de modelos.

### D. Webhook de WhatsApp

- **R18.** CUANDO el maestro da de alta WhatsApp o regenera su token de verificación, el sistema DEBE
  generar un token aleatorio y guardar solo su resumen.
  - Muestra ese token una sola vez, junto con la URL única del webhook.
  - Al recargar la pantalla, el token ya no aparece.
- **R19.** CUANDO llega la verificación del webhook (GET), el sistema DEBE devolver el `challenge`
  solo si el token coincide con el resumen de alguna integración de WhatsApp.
  - En cualquier otro caso responde 403.
  - Con token válido, anota en esa integración la hora del último contacto del webhook.
- **R20.** CUANDO llega un evento del webhook (POST), el sistema DEBE ubicar la empresa por el
  identificador del número de teléfono que trae el evento.
  - Verifica la firma con el App Secret de esa empresa, sobre el cuerpo crudo, en tiempo constante y
    antes de cualquier efecto.
  - Procesa los eventos de esa empresa solo dentro de su contexto.
- **R21.** SI ningún número del evento pertenece a una empresa, o la firma no valida con el App
  Secret de la empresa del número, ENTONCES el sistema DEBE descartar esos eventos sin efectos.
  - Si no queda ningún evento válido, responde 401.
- **R22.** El webhook de WhatsApp NO DEBE abrir el contexto de plataforma más que para traducir un
  número o un resumen de token a su empresa, y esa traducción solo DEBE devolver el identificador
  de la empresa y el de la integración.

### E. Uso de la credencial de la empresa

- **R23.** El sistema DEBE usar la credencial de la empresa en curso en cada consumidor de los cuatro
  servicios, y nunca una variable de entorno.
  - La empresa en curso sale de la sesión, del job o del webhook.
  - La lista de consumidores está en design §9.
  - En el entorno solo queda la clave maestra de cifrado.
- **R24.** SI la empresa no tiene WhatsApp configurado, ENTONCES el sistema DEBE tratarlo así:
  - en pantalla, las acciones de envío, chat y plantillas responden «WhatsApp no está configurado en
    tu empresa» con enlace a la configuración;
  - los jobs de WhatsApp fallan con un motivo recuperable, sin llamar a Meta;
  - el cron de sincronización de plantillas salta esa empresa.
- **R25.** SI la empresa no tiene Google Maps configurado y la dirección de una orden no está en la
  caché de ubicaciones, ENTONCES el sistema DEBE marcar su geocodificación como fallo de
  configuración, sin llamar al proveedor.
  - La orden queda asignable sin ubicación: la asignación no se bloquea.
- **R26.** SI la empresa no tiene optimización de rutas configurada, ENTONCES el sistema DEBE ordenar
  sus rutas con el orden local aproximado, sin llamar a Google y sin dejar el job muerto.
- **R27.** SI la empresa no tiene el asistente configurado, ENTONCES el sistema DEBE responder que la
  empresa no lo configuró, sin llamar al proveedor y sin contar la consulta en el tope diario.
- **R28.** El sistema NO DEBE compartir entre empresas ningún dato derivado de una credencial que
  guarde en memoria, como el token de acceso de Google o el identificador de la app de Meta.
- **R29.** SI una credencial guardada es ilegible al usarla, ENTONCES el sistema DEBE dejar la
  integración en «error» con el código «vuelve a escribir la credencial», sin llamar al proveedor.
- **R30.** SI durante un uso real el proveedor rechaza la credencial por autenticación, ENTONCES el
  sistema DEBE dejar la integración en «error» con el código propio de ese rechazo.
  - Las señales de rechazo de cada proveedor están en design §5.

### F. Desconectar

- **R31.** CUANDO el maestro pide desconectar un servicio, el sistema DEBE mostrar, antes de
  confirmar, su marca «requerido» o «recomendado» y qué deja de funcionar sin él, según el catálogo.
- **R32.** CUANDO el maestro confirma la desconexión, el sistema DEBE borrar la integración y sus
  credenciales de la base.
  - El servicio queda «sin configurar».
  - El número de WhatsApp queda libre para otra alta.

### G. Rastro

- **R33.** CUANDO el maestro crea, cambia, prueba, regenera el token o desconecta una integración, el
  sistema DEBE registrarlo en el historial de acciones en la misma transacción.
  - Registra quién, qué servicio, qué acción, cuándo y, en una prueba, si salió bien.
  - Nunca registra la credencial, su valor cifrado ni el mensaje del proveedor.
  - La fila sobrevive a la desconexión.

### H. Pantalla, guía y estado

- **R34.** El sistema DEBE mostrar al maestro, por cada uno de los cuatro servicios:
  - su estado: «conectada», «error» o «sin configurar»;
  - su marca «requerido» o «recomendado»;
  - el último error, con texto propio, solo en «error»;
  - la hora de la última prueba;
  - en WhatsApp, además, la hora del último contacto del webhook.
- **R35.** El sistema DEBE mostrar, desde el formulario de cada servicio, un enlace a su guía paso a
  paso publicada en la ayuda de la app (`/ayuda/...`).
  - La guía dice dónde entrar, qué crear, qué copiar y en qué campo pegarlo.
- **R36.** El sistema DEBE presentar los campos secretos como contraseñas sin valor inicial. Tras un
  rechazo, DEBE conservar en el formulario solo lo no secreto.
- **R37.** CUANDO el superadmin consulta el estado de las integraciones, el sistema DEBE devolver por
  empresa y servicio solo «conectada», «error» o «sin configurar».
  - Nunca devuelve credenciales, datos públicos ni mensajes de error.
  - Ninguna operación de cambio admite al superadmin (R6).

### I. Rotación de la clave maestra

- **R38.** MIENTRAS una versión vieja de la clave maestra siga en el anillo, el sistema DEBE seguir
  descifrando los valores de esa versión y cifrar todo valor nuevo con la versión activa.
- **R39.** CUANDO el superadmin ejecuta el comando de recifrado, el sistema DEBE recifrar con la
  versión activa cada credencial guardada en otra versión, empresa por empresa.
  - Al terminar, muestra cuántos valores quedan por versión y cuántos son ilegibles.
  - No imprime ningún valor.
- **R40.** DONDE el comando se ejecute en modo «solo contar», el sistema DEBE mostrar el mismo conteo
  sin escribir nada.

### J. Retiro de las claves de plataforma

- **R41.** El sistema NO DEBE leer en código de producción ninguna de las variables de credencial
  retiradas (design §9.3), y `.env.example` NO DEBE declararlas.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| La plataforma no presta claves | R23, R24, R25, R26, R27, R41 |
| Los cuatro servicios | R17, R23, R34 |
| Guía paso a paso | R35 |
| Solo el maestro | R6, R7 |
| Superadmin solo ve el estado | R6, R37 |
| Desconectar (D9) | R31, R32 |
| Rotación (D10) | R38, R39, R40 |
| Alta manual (D1) | R12 |
| Error del proveedor (D3) | R9, R13, R15 |
| Probar con límite (D4) | R16 |
| Rastro (D5) | R33 |
| Cifrado en la app (D8) | R1, R2, R3, R4 |
| Webhook por número | R19, R20, R21, R22 |
| Aislamiento (RLS, español) | R8, R10, R11 |
| Forma de la tabla y borrado (D6, D7) | R32 (borrado), R10 (forma); design §2 |
| E2E | R6, R12, R13, R18, R32, R36 (los recorre el E2E, tasks T9) |
| Sin librerías nuevas | R1 |

## Preguntas abiertas

> Las dos preguntas que dejó `/afinar-feature` se cerraron leyendo el código: la de Maps en design
> §7.1 y la de optimización de rutas en design §7.2. Quedan dos, y las dos son de negocio.
>
> **PROVISIONAL (leader, 2026-10-24, por la dispensa de Carlos «implementa ya»):** se implementan
> con la opción conservadora y Carlos las confirma o cambia al revisar el PR. (1) Las marcas quedan
> como la propuesta de abajo (WhatsApp y Maps requeridos; rutas y asistente recomendados): es solo
> texto, cambiarla es una constante. (2) La caché `geocode_cache` se mantiene compartida como hoy:
> no cambia comportamiento y guarda coordenadas de direcciones, no datos de la empresa.

1. **¿Qué servicios son «requeridos» y cuáles «recomendados»?** El código dice qué deja de funcionar
   sin cada uno (design §7.3), pero no decide la marca. Propuesta, pendiente de tu OK:
   - **WhatsApp, requerido.** Sin él no salen avisos a los clientes, no hay chat, no hay plantillas
     ni mensaje de bienvenida.
   - **Google Maps, requerido.** Sin él, ninguna orden nueva tiene ubicación. Se pueden asignar, pero
     no aparecen en el mapa y la ruta no las ordena por cercanía.
   - **Optimización de rutas, recomendado.** Sin ella, la ruta se ordena con un cálculo aproximado.
   - **Asistente, recomendado.** Sin él, el panel del asistente dice que no está configurado. La
     ayuda escrita sigue abierta.
2. **Caché compartida de ubicaciones.** Hoy, cuando una dirección ya se buscó una vez, su ubicación
   queda guardada para toda la plataforma (`geocode_cache`, clasificada como de plataforma). La app
   la usa antes de mirar si hay clave. Consecuencia: una empresa **sin** clave de Google Maps obtiene
   gratis la ubicación de cualquier dirección que otra empresa ya pagó.
   - ¿Se mantiene así?
   - ¿O una empresa sin Maps tampoco usa la caché, y entonces cada empresa tiene su caché propia o
     ninguna?
   - Mientras no lo decidas, el design deja la caché como está (§7.1) y R25 solo cubre las
     direcciones que no están en la caché.

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
