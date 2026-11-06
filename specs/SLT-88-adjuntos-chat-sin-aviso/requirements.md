# SLT-88 «Las fotos pesadas del chat no se envían y no avisan» (HOTFIX)

## Alcance (de `progress/features/SLT-88.md`)

En producción, un mensajero adjunta una foto en el chat, pulsa enviar y no pasa nada: ni aviso ni
mensaje. La causa es **probable, sin medir** (`design.md` §1): Vercel corta el cuerpo a 4,5 MB, la
app solo comprime por encima de 5 MB y el composer no captura el rechazo de la acción.

Arreglo, rama desde `prod`:

1. Comprimir antes de enviar toda foto de más de 4 MB.
2. Si el envío falla por cualquier motivo, también por un rechazo de la petición sin respuesta de la
   acción, avisar «No se pudo enviar. Inténtalo de nuevo» y conservar el adjunto para reintentar.
3. Bajar a 4 MB los límites de video, audio y documentos, con aviso claro, en navegador y servidor.

**Lo que NO entra:**
- Enviar archivos de más de 4 MB.
- Cambiar la regla de cuándo se habilita `Adjuntar`.
- El audio que falla con `131053`.
- El `wamid` en los logs.
- Migraciones y dependencias nuevas: no hacen falta.

## Decisiones cerradas (no reabrir)

| Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|
| 2026-11-05 | Carlos | HOTFIX: rama desde `origin/prod`. | Proceso. La rama y el worktree ya existen. |
| 2026-11-05 | Carlos | Comprimir las fotos de más de 4 MB. | R1, R2, R3, R4 |
| 2026-11-05 | Carlos | Avisar de todo fallo de envío y conservar el adjunto. | R12, R13, R14, R15, R16, R17, R18 |
| 2026-11-05 | Carlos | Bajar a 4 MB video, audio y documentos, en navegador y servidor. | R5, R6, R7, R8, R9, R10, R11 |
| 2026-11-05 | Carlos | Enviar archivos de más de 4 MB queda fuera. | R5, R6 (se rechazan) |

## Requisitos (EARS)

«4 MB» es siempre 4 × 1024 × 1024 = 4 194 304 bytes.

### A. Fotos

- **R1** — CUANDO el mensajero elige o toma una imagen de más de 4 MB, el sistema DEBE comprimirla
  antes de dejarla lista para enviar. Lo que viaja DEBE ser el resultado, no el original.
- **R2** — SI la imagen es JPEG o PNG y pesa 4 MB o menos, ENTONCES el sistema NO DEBE comprimirla y
  DEBE enviar el archivo tal cual.
- **R3** — SI tras intentar comprimirla una foto en formato aceptado sigue por encima de 4 MB,
  también cuando la compresión devolvió el original tras fallar, ENTONCES el sistema DEBE mostrar
  `«No se pudo reducir la foto a 4 MB. Vuelve a tomarla o elige otra imagen.»`. NO DEBE dejarla en
  el composer ni llamar a la acción. La foto en formato no aceptado que no se pudo convertir conserva
  su aviso actual (316 R31).
- **R4** — SI preparar el archivo lanza un error inesperado, ENTONCES el sistema DEBE mostrar
  `«No se pudo preparar el archivo. Inténtalo de nuevo.»` y DEBE dejar de indicar «Preparando la foto…».

### B. Límites

- **R5** — El sistema DEBE aplicar un límite de 4 MB a imagen, video, audio y documento. Un archivo
  de exactamente 4 MB DEBE aceptarse y uno de un byte más DEBE rechazarse como `demasiado_grande`.
- **R6** — CUANDO `enviarMediaChat` o `ChatWhatsappService.enviarMedia` reciben un archivo de más de
  4 MB, el sistema DEBE responder `demasiado_grande` con `limiteBytes` de 4 MB y NO DEBE subir nada a
  Meta.
- **R7** — SI el mensajero elige un video, un audio o un documento de más de 4 MB, ENTONCES el sistema
  DEBE mostrar `«Ese archivo supera el límite de 4 MB. Elige uno más pequeño.»`, NO DEBE comprimirlo,
  NO DEBE dejarlo en el composer y NO DEBE llamar a la acción.
- **R8** — SI una nota de voz grabada supera 4 MB, ENTONCES el sistema DEBE mostrar
  `«La nota de voz supera el límite de 4 MB. Graba una más corta.»`, NO DEBE dejarla en el composer y
  NO DEBE llamar a la acción.
- **R9** — MIENTRAS el menú de adjuntar está abierto, el sistema DEBE mostrar
  `«El vídeo no puede pasar de 4 MB.»`.
- **R10** — CUANDO la acción responde `demasiado_grande`, el sistema DEBE mostrar el texto de R7 con
  el límite que devolvió y DEBE conservar el adjunto.
- **R11** — El cuerpo multipart de un adjunto de exactamente 4 MB, con un pie de 1024 caracteres
  multibyte y un nombre de archivo largo, DEBE medir menos de 4 500 000 bytes.

### C. Fallo de envío

- **R12** — SI la llamada a `enviarMediaChat` rechaza su promesa o resuelve sin resultado, ENTONCES el
  sistema DEBE mostrar `«No se pudo enviar. Inténtalo de nuevo»` y DEBE conservar el adjunto y el pie.
- **R13** — CUANDO la acción responde `fallo_subida`, el sistema DEBE mostrar el texto de R12 y DEBE
  conservar el adjunto y el pie.
- **R14** — CUANDO la acción responde `fuera_ventana`, `tipo_no_permitido`, `caption_largo`,
  `permanente`, `no_configurado`, `forbidden` o `unauthenticated`, el sistema DEBE mostrar su aviso
  propio actual y DEBE conservar el adjunto.
- **R15** — SI la llamada a `enviarMensajeChat` o a `enviarPlantillaChat` rechaza su promesa o resuelve
  sin resultado, ENTONCES el sistema DEBE mostrar el texto de R12 y DEBE conservar el borrador.
- **R16** — MIENTRAS un envío está en vuelo, un segundo click o un Enter NO DEBE provocar otra llamada
  a la acción, también cuando ese envío termina rechazado.
- **R17** — CUANDO, tras un rechazo, el mensajero vuelve a pulsar enviar, el sistema DEBE hacer una
  llamada nueva con el mismo archivo y el mismo pie. SI responde `ok`, ENTONCES DEBE limpiar el adjunto.
- **R18** — SI la acción responde `ok` y falla después la revalidación del hilo, ENTONCES el sistema
  NO DEBE mostrar el texto de R12 y el adjunto DEBE quedar limpio.

## Trazabilidad R → test

El test se escribe antes o junto al código; el implementer mide cada mutación y la anota en
`progress/impl_SLT-88.md`. CC = `tests/components/ChatComposerAdjunto.test.tsx`, CF =
`tests/unit/config/chat-media-envio.test.ts`.

| R | Test | La mutación que debe ponerlo rojo |
|---|---|---|
| R1 | CC: JPEG de 4 MB + 1 byte, `comprimirImagen` llamado; el `File` del `FormData` es el resultado | Dejar `excedeLimite` en 5 MB |
| R2 | CC: JPEG de 4 MB exactos, `comprimirImagen` no llamado y viaja el original | Cambiar `>` por `>=` en `excedeLimite` |
| R3 | CC: el doble devuelve 7 MB, y aparte el original de 9 MB; el literal sale en `role="alert"` y la acción no se llama | Quitar la rama del aviso de foto |
| R4 | CC: `comprimirImagen` rechaza; el literal sale y desaparece «Preparando la foto…» | Quitar el `catch` de `aceptarArchivo` |
| R5 | CF: los cuatro tipos, en 4 MB y en 4 MB + 1, contra literales | Subir cualquier tipo a otro valor |
| R6 | `tests/unit/actions/chat-whatsapp-actions.test.ts` y `tests/unit/services/chat-whatsapp-service.test.ts`: video y PDF de 5 MB, imagen de 6 MB; sin subida | Devolver `ok` sin validar en cualquiera de los dos |
| R7 | CC: video, audio y PDF de 5 MB | Dejar el texto o el límite viejos |
| R8 | `tests/components/ChatNotaVoz.test.tsx`: grabación con un `Blob` real de 4 MB + 1 byte | Usar el texto de R7 para la grabación |
| R9 | CC: el caso R1 existente de 316, ahora con `/4 MB/` y sin `16 MB` | Dejar `16 MB` en el texto |
| R10 | CC: el doble responde `demasiado_grande`; toast y adjunto presente | Quitar el adjunto en esa rama |
| R11 | CF: construir el `FormData` real con bytes reales y medir `new Response(fd).blob()`; `4_500_000` es literal del test | Subir el límite a 4,3 MB |
| R12 | CC: `enviarMediaChatMock.mockRejectedValue(new Error(...))`, y aparte `mockResolvedValue(undefined)` | Quitar el `catch` |
| R13 | CC: amplía el caso R19 de 316 con el literal | Dejar «No se pudo subir…» |
| R14 | CC: `it.each` de los siete estados con su texto literal | Cambiar uno por el texto de R12 |
| R15 | `tests/components/ChatComposerAdjunto.test.tsx`: `enviarMensajeChatMock` y `enviarPlantillaChatMock` que rechazan | Quitar el `catch` en cualquiera de las dos |
| R16 | CC: promesa pendiente, dos clicks y Enter, una sola llamada; se rechaza después y el botón vuelve a estar activo | Quitar el candado `enviandoRef` |
| R17 | CC: rechazo y luego `ok`; dos llamadas con el mismo `File` y el mismo `caption`; adjunto limpio | Limpiar el adjunto en el `catch`, o no soltar el candado |
| R18 | CC: `ok` con revalidación que falla; el literal no aparece y el adjunto queda limpio. Si SWR absorbe el fallo y la mutación sobrevive, se fuerza con un doble del `mutate` | Envolver `await mutate()` en el mismo `try` que la acción |

Los mapas finales con el nombre de cada test van en `progress/impl_SLT-88.md`. La comprobación real
del límite de Vercel no es un test automático: es la T6 de `tasks.md`.

## Preguntas abiertas

Ninguna que bloquee.
