# SLT-88 · design — adjuntos del chat: hasta 4 MB y siempre con aviso

> Código de referencia: `prod` (`fae6a5d3`, worktree `.worktrees/SLT-88-hotfix`), comprobado el
> 2026-11-05. El grafo no tiene proyecto para este worktree: se exploró con Grep y Read. El grafo de
> `dev` solo se usó para buscar duplicados y para §8.

## Lo que ya existe

Buscado `adjunt`, `foto`, `nota de voz`, `No se pudo enviar`, `FUNCTION_PAYLOAD`, `4,5 MB` y
`bodySizeLimit` en `feature_list.json`, `specs/`, `progress/deudas.md` y el código.

- **`specs/316-chat-enviar-media`.** Es la feature que este hotfix corrige. Se reutilizan `validarAdjunto`
  (la misma función en navegador y servidor), el orden normalizar → clasificar → validar, el candado
  `enviandoRef` y la conservación del adjunto (316 R19). Este spec **sustituye** sus topes (316 D6, D8
  y R10). El spec 316 no se edita: es histórico.
- **`comprimirImagen`** (`lib/utils/comprimir-imagen.ts`). Se reutiliza tal cual, sin cambios.
- **`lib/config/wallet-comprobante.ts`.** Precedente de un tope de 4 MB por el mismo transporte.
- **`AsistentePanel.tsx`** y `lib/config/asistente.ts` ya documentan el corte de ~4,5 MB de Vercel, para
  un Route Handler. Confirma el límite conocido del repo; no es código compartible.
- **`SLT-87`** tiene adjuntos, pero son los del reporte de bugs. No se solapa. En `progress/deudas.md`
  no hay nada de esto.

## 1. Causa: probable, sin medir

**Comprobado en el código:**

| Pieza | Dónde | Qué hace |
|---|---|---|
| Umbral de compresión | `ChatConversacion.tsx:428` | Solo comprime una imagen aceptada si pasa de `LIMITE_BYTES.imagen`, 5 MB. |
| Límite de la app | `chat-media-envio.ts:51-56`, `next.config.ts:74` | 5 MB de imagen, 16 de video y audio, 25 de documento. `bodySizeLimit` es `5mb`. |
| Reacción del cliente | `node_modules/next/dist/.../server-action-reducer.js:114-121` y `:302-305` | Una respuesta que no es RSC se convierte en un rechazo de la promesa de la acción. |
| Silencio | `ChatConversacion.tsx:490` y `:606-617` | `enviarAdjunto` no captura, y `enviar` tiene `try/finally` sin `catch`. Se llama con `void enviar()`. |

**Sin medir:**
- Que Vercel responda 413 a esta petición en este despliegue.
- El peso de la foto del reporte: no consta.
- El corte de red da exactamente el mismo síntoma.

Que los textos salieran en esa misma ventana, y que no haya errores en los logs de la función, encajan
con el corte por tamaño, pero no lo prueban. Se mide en la T6. El arreglo cubre las dos causas: el aviso
sale en cualquiera de ellas, y la compresión solo ayuda en la del tamaño.

## 2. Modelo de datos, autorización y país

Sin tablas, migraciones ni RLS. La autorización de `enviarMediaChat` no cambia. No hay datos que
dependan del país.

## 3. Límite único (R5, R6)

`lib/config/chat-media-envio.ts`:

- Nueva `LIMITE_ADJUNTO_BYTES = 4 * 1024 * 1024`. Los cuatro tipos de `LIMITE_BYTES` la referencian.
- Se conserva el `Record` por tipo: `validarAdjunto` y `limiteBytes` no cambian de forma.
- `LIMITE_DOCUMENTO_BYTES` se retira. Sus únicos usos son `LIMITE_BYTES` y su test.
- Los comentarios dejan de decir «los de Meta» y «25 MB», y explican que el tope lo pone el transporte.
  También el de `TIMEOUT_SUBIDA_MS`, cuyo valor no cambia, y el de `lib/clients/whatsapp-media-upload.ts:16`.

`lib/actions/chat-whatsapp.ts` y `ChatWhatsappService.ts` no cambian: heredan el límite por
`validarAdjunto`. `lib/clients/whatsapp-media.ts:121` habla de la descarga, no se toca.

**La imagen también baja a 4 MB.** Carlos nombra video, audio y documentos, pero también comprimir las
fotos de más de 4 MB y dejar fuera enviar archivos de más de 4 MB. Una foto no puede tener otro tope.

### Margen frente a Vercel (R11)

| Concepto | Bytes |
|---|---|
| Archivo en el límite | 4 194 304 |
| Pie: 1024 unidades UTF-16, a 3 bytes como máximo | 3 072 |
| Campos, cabeceras, límites, nombre y sobre de la acción (estimado, sin medir) | ~3 000 |
| **Total** | **~4 200 400** |
| Corte de Vercel, tomando el peor caso: 4,5 MB decimales | 4 500 000 |
| **Margen** | **~300 000 (~6,6 %)** |

R11 mide el multipart real en un test, sin el sobre de React. La comprobación con el sobre de verdad es
el paso B de la T6, con un archivo cercano a 4 MB.

`bodySizeLimit` **no cambia**: 5 MiB queda por encima de ese total, Vercel corta antes, y lo comparten la
gestión, la postulación y la wallet.

## 4. Preparar el archivo (R1-R4, R7, R8)

`aceptarArchivo` en `ChatConversacion.tsx`:

- **R1 y R2:** el umbral ya es `LIMITE_BYTES.imagen`. Baja con la constante, sin tocar las opciones de
  `comprimirImagen` (`saltarSiMenorA: 0`, `devolverOriginalSiMayor: false`).
- **R3:** `comprimirImagen` no lanza; si falla, devuelve el original. Por eso se decide por el resultado:

| `preparada` | Desenlace |
|---|---|
| MIME no aceptado y era imagen | `AVISO_NO_CONVERTIBLE`, sin cambios |
| Imagen aceptada y > 4 MB (no se redujo, o es el original) | Aviso nuevo de R3 |
| No imagen y > 4 MB | Aviso de R7 |
| Nota de voz y > 4 MB | Aviso de R8 |
| ≤ 4 MB | Queda en el composer |

- **R4:** se añade `catch` junto al `finally` actual, porque la llamada es `void aceptarArchivo(...)`.
- **R8:** recibe un parámetro de origen: `aceptarArchivo(archivo, "grabacion")` desde `onGrabacion`.

### La nota de voz

**Sí pasa por estos límites:** `useGrabadorVoz` entrega el `File` a `aceptarArchivo`, con la misma
validación. El grabador no fija duración ni bitrate, así que no se sabe a qué duración llega a 4 MB.
Hoy, una nota de hasta 16 MB pasa la validación del navegador y, por encima del corte de Vercel, moriría en
silencio. Con este cambio, por encima de 4 MB sale el aviso de R8 y **la grabación se pierde**, porque no se
recomprime. Cortarla automáticamente no está en el alcance (§9).

## 5. Fallo de envío (R12-R18)

Un helper local en `ChatConversacion.tsx`, usado por las tres vías:

```ts
const AVISO_FALLO_ENVIO = "No se pudo enviar. Inténtalo de nuevo";

/** `null` = la petición no trajo respuesta: rechazo o resultado vacío. Nunca lanza. */
async function respuestaDe<T>(llamada: () => Promise<T>): Promise<T | null>;
```

Cada vía hace `const res = await respuestaDe(() => enviarMediaChat(formData))`. Con `null` muestra el
toast y sale, **antes** de tocar el adjunto o el borrador.

- **El `try` envuelve solo la acción, nunca `await mutate()` (R18).** Si el mensaje ya salió, un fallo al
  refrescar el hilo no puede decir «No se pudo enviar»: invitaría a enviarlo dos veces.
- **Aviso:** `toast.error`, como el resto de ramas de la misma función. El toast va en `z-[100]` y el
  Dialog del chat en `z-50`, así que se pinta encima. La T6 lo confirma en un teléfono.
- **Doble clic y reintento (R16, R17):** `enviandoRef` ya bloquea y el `finally` de `enviar` ya lo suelta.
  No se cambia; se prueba con un rechazo.
- **Redirecciones:** `chat-whatsapp.ts` no llama a `redirect()`, así que el `catch` no se traga una.
  `middleware.ts:112` sí redirige con la sesión vencida. Si eso llega como rechazo, sale el aviso de R12
  en vez del de sesión. Es mejor que el silencio y no se persigue aquí.

### Qué estados llevan el texto nuevo

Interpretación de «por cualquier motivo»: todo fallo avisa y conserva el adjunto, pero el literal solo
sustituye a lo que **sí** se arregla reintentando: el rechazo, el resultado vacío y `fallo_subida`.
`fuera_ventana`, `tipo_no_permitido`, `caption_largo`, `permanente`, `no_configurado`, `forbidden` y
`unauthenticated` ya avisan con su causa. Decirles «inténtalo de nuevo» sería falso (R14).

## 6. Textos

| R | Texto |
|---|---|
| R3 | No se pudo reducir la foto a 4 MB. Vuelve a tomarla o elige otra imagen. |
| R4 | No se pudo preparar el archivo. Inténtalo de nuevo. |
| R7, R10 | Ese archivo supera el límite de 4 MB. Elige uno más pequeño. |
| R8 | La nota de voz supera el límite de 4 MB. Graba una más corta. |
| R9 | El vídeo no puede pasar de 4 MB. |
| R12, R13, R15 | No se pudo enviar. Inténtalo de nuevo |

El «4 MB» de R3, R7, R8 y R9 sale de `limiteLegible(LIMITE_BYTES.<tipo>)`. Los tests afirman el texto
literal, no la función que lo genera.

## 7. Tests y guardias que fijan los números

| Archivo | Qué fija hoy | Cambio |
|---|---|---|
| `tests/unit/config/chat-media-envio.test.ts` | 5, 16 y 25 MB; `LIMITE_DOCUMENTO_BYTES` | Reescribir a 4 MB (R5) y añadir R11 |
| `tests/unit/actions/chat-whatsapp-actions.test.ts:885-892` | `limiteBytes` de 5 MB | 4 MB (R6) |
| `tests/unit/services/chat-whatsapp-service.test.ts:1161-1169` | `limiteBytes` de 5 MB | 4 MB (R6) |
| `tests/components/ChatComposerAdjunto.test.tsx:147`, `:288-298`, `:10` | `16 MB`, `límite de 5 MB` | R3 y R9 |

- **Ninguna guardia** fija estos límites: busqué en `tests/unit/guards/` y no hay nada. `gestion-config`,
  `lib/config/gestion.ts` y `postulacion.ts` tienen sus propios 5 MB, y no se tocan.
- **Sin E2E nuevo.** El chat no es uno de los flujos críticos de `docs/checkpoints-proyecto.md`, aunque
  viva bajo `mis-asignaciones`, y ningún E2E usa `Adjuntar` (ese spec solo sube la evidencia de gestión).
  Además, el límite no existe ni en local ni en CI. La prueba real es la T6.
- `docs/ayuda/` no habla de estos límites: no hay ayuda que actualizar.

## 8. Salida: PR a `prod` y sincronía con `dev`

PR a `prod`, y después sincronizar a `dev`. Este agente no tiene shell, así que **el comando literal
`git diff origin/prod origin/dev -- <archivos>` queda en la T5**. Lo que sí se comprobó:

- `detect_changes` de `dev` contra `origin/prod`: `origin/dev` = `cc63e547`, base común `42328714`, 526
  archivos cambiados. **Ninguno** de los archivos de este spec está entre ellos, incluidos los de
  tests.
- `ChatConversacion.tsx`, `chat-media-envio.ts`, `chat-whatsapp.ts` y `next.config.ts` tienen sus puntos
  de control en las mismas líneas en los dos árboles.

Se espera una sincronía sin conflictos. La referencia es de la última vez que se hizo `fetch`.

## 9. Alternativas descartadas

- **Subir directo a Storage con URL firmada, o por trozos, para pasar de 4 MB.** Es lo que levantaría el
  tope de verdad, pero Carlos dejó fuera enviar archivos más grandes, y exige bucket, política y limpieza.
  No cabe en un hotfix.
- **Subir `bodySizeLimit`.** No arregla nada: Vercel corta antes, y afecta a todas las Server Actions.
- **Un solo `catch` en `enviar()`.** Es el menor diff, pero envuelve `await mutate()`: un fallo de
  revalidación tras un envío correcto diría «No se pudo enviar» y llevaría a duplicar el mensaje (R18).
- **Segunda pasada de compresión con menos calidad,** como `AsistentePanel.tsx:507`. A 1600 px y 0,85 no
  hay evidencia de que una foto pase de 4 MB, así que sería código para un caso sin medir. El aviso de R3
  ya lo cubre.
- **Cortar la grabación a 4 MB.** Evitaría perder la nota, pero añade un temporizador y un bitrate que nadie
  pidió. Se anota como riesgo.

## 10. Riesgos

- **Reintento duplicado.** Un rechazo puede llegar con el mensaje ya enviado (la red cae al volver). El
  reintento lo mandaría otra vez: no hay idempotencia en este camino, y añadirla no es de este hotfix.
- **Un video de cámara de 4 MB dura muy poco** (sin medir). Es consecuencia aceptada de la decisión; el
  aviso del menú se lee antes de grabar.
- **El mismo hueco de 4,5 a 5 MB** puede existir en otras Server Actions con tope de 5 MB (gestión,
  postulación). No está auditado ni entra aquí; conviene anotarlo como deuda.
