# SLT-88 · tasks — adjuntos del chat: hasta 4 MB y siempre con aviso (HOTFIX)

Rama `hotfix/SLT-88-adjuntos-chat-sin-aviso` desde `origin/prod` (`fae6a5d3`), en el worktree
`.worktrees/SLT-88-hotfix`. Para cada `R<n>`, el test y la mutación que lo mata están en
`requirements.md > Trazabilidad`. `[P]` = puede ir en paralelo con las demás que estén listas.

`node_modules` es compartido con `dev`: no correr `prisma generate` aquí. Sin migraciones ni dependencias.

**El paso A de la T6 va ANTES de la T1**, si se puede: necesita el Preview con el código de `prod`.

## T1 · El límite único (R5, R6, R11)

Dep.: —

- [x] `lib/config/chat-media-envio.ts`: `LIMITE_ADJUNTO_BYTES`, los cuatro tipos la referencian, fuera
      `LIMITE_DOCUMENTO_BYTES`, comentarios al día (`design.md` §3).
- [x] `lib/clients/whatsapp-media-upload.ts:16`: el comentario deja de decir 25 MB.
- [x] `tests/unit/config/chat-media-envio.test.ts`: reescribir los casos de 5, 16 y 25 MB; añadir R11 con
      bytes reales y el `4_500_000` como literal.
- [x] `tests/unit/actions/chat-whatsapp-actions.test.ts` y `tests/unit/services/chat-whatsapp-service.test.ts`:
      4 MB en `limiteBytes`; casos de video y PDF de 5 MB.
- **Hecho cuando:** esos tres tests están verdes, sus mutaciones quedaron medidas en rojo y `git diff`
  no toca `next.config.ts`, `lib/actions/chat-whatsapp.ts` ni `lib/services/ChatWhatsappService.ts`.

## T2 · Preparar el archivo (R1-R4, R7-R10)

Dep.: T1

- [x] `ChatConversacion.tsx`: textos de `design.md` §6, `AVISO_LIMITE_VIDEO` derivado del límite, la tabla de
      desenlaces de §4, el `catch` de `aceptarArchivo` y el origen `"grabacion"` desde `onGrabacion`.
- [x] Rama `demasiado_grande` de `enviarAdjunto` con el texto de R7 (R10).
- [x] `tests/components/ChatComposerAdjunto.test.tsx`: actualizar `:10`, `:147` y `:288-298`; añadir R1-R4,
      R7, R9, R10.
- [x] `tests/components/ChatNotaVoz.test.tsx`: R8, con un `Blob` real de 4 MB + 1 byte.
- **Hecho cuando:** están verdes, las mutaciones quedaron medidas en rojo y `comprimirImagen` no cambió.

## T3 · Fallo de envío (R12-R18)

Dep.: T2

- [x] `ChatConversacion.tsx`: `AVISO_FALLO_ENVIO`, `respuestaDe` y su uso en `enviarAdjunto`,
      `enviarTextoLibre` y `enviarComoPlantilla`. `fallo_subida` pasa al texto nuevo. `await mutate()`
      queda fuera del `try`.
- [x] `ChatComposerAdjunto.test.tsx`: R12-R18. **El fallo se prueba con una acción que RECHAZA la promesa**
      (`mockRejectedValue`), no solo con un `status` de fallo. R16 y R17 también terminan en rechazo.
- **Hecho cuando:**
  - están verdes, y quitar el `catch` los pone rojos (medido);
  - la autocomprobación pasa: sin mutar, el archivo corre N > 0 tests;
  - `progress/impl_SLT-88.md` trae cada mutación con su comando y su salida. Si R18 sobrevive porque SWR
    absorbe el fallo, se usa un doble del `mutate` y se anota.

## T4 · Gate y mapa

Dep.: T1-T3

- [x] Copiar `.env` al worktree antes del primer gate: sin él, la integración se salta y sale verde.
- [ ] Correr `./init.sh` en verde, con `INIT_EXIT=$?` escrito dentro del log. **Pendiente del leader:
      la tanda se corrió sin él por instrucción expresa (`progress/impl_SLT-88.md`).**
- [x] Mapa `R1..R18 → test` en `progress/impl_SLT-88.md`.
- **Hecho cuando:** el gate está verde y el mapa no deja ningún `R` sin test.

## T5 · Preparar la salida

Dep.: T4

- [ ] `git fetch origin` y, para los archivos de «Archivos esperados»:
      `git diff origin/prod origin/dev -- <archivos>`. Anotar el resultado en `progress/impl_SLT-88.md`.
      Si sale algo (`design.md` §8 no lo espera), se revisa antes de seguir.
- [ ] Reviewer: OK.
- [ ] El leader abre el PR a `prod`. El texto dice que la causa es probable, sin medir, hasta que la T6
      diga otra cosa.
- **Hecho cuando:** el PR está abierto con su URL de Preview, y el check `gate-completo` está en verde.

## T6 · Comprobación en el Preview de Vercel (FINAL)

Dep.: paso A antes de la T1; paso B tras la T5. **No se puede medir en local: ahí el límite no existe.**

Foto real de unos 4,7 MB, **sin datos de clientes**, y datos de QA, nunca de producción. Hace falta una
orden con un entrante del cliente, porque `Adjuntar` se habilita solo así. No hace falta que el mensaje
llegue a WhatsApp: si el Preview no lo tiene configurado, `no_configurado` ya prueba que la petición llegó
a la función.

**Entrar al Preview puede ser el problema:** `AUTH_OTP_DEBUG_LOG` solo está encendida en el Preview de la rama
`dev` (`docs/verification.md`), así que en esta rama el acceso con usuarios de QA no está garantizado. Si no
se puede entrar, en el paso B se pide a Carlos el acceso o que lo pruebe él. El paso B no se salta.

### Paso A — la causa, ANTES del arreglo (si se puede)

- [ ] Publicar la rama solo con el spec, que tiene el código de `prod`, y enviar la foto desde su Preview.
- [ ] Anotar el estado HTTP y el cuerpo de la petición en DevTools, si aparece en los logs de la función, y lo
      que ve el mensajero. Lo esperado es 413 y `FUNCTION_PAYLOAD_TOO_LARGE`, sin aviso.
- [ ] Si no se puede entrar al Preview: es aceptable mandar con `curl` un multipart de 4,7 MB y otro de 3,9 MB
      y comparar. Eso solo mide la plataforma, y se anota así.
- **Hecho cuando:** `progress/features/SLT-88.md` dice «causa medida: <resultado>», o «sin medir: <por qué>».
  Si el resultado **no** es el corte por tamaño, se PARA y decide Carlos.

### Paso B — el resultado, DESPUÉS del arreglo

- [ ] En un teléfono, en el Preview del PR:
  1. La foto de 4,7 MB se comprime y llega a la función, sin 413.
  2. Un PDF cercano a 4 MB (3,9 MB o más) llega a la función, sin 413: es lo que prueba el margen de R11 con
     el sobre real de la acción.
  3. Un PDF de 5 MB muestra el aviso de R7 y no sale ninguna petición.
  4. Con la red cortada, el aviso de R12 se ve **encima del chat** y el adjunto sigue; al volver la red, el
     reintento funciona.
- **Hecho cuando:** los cuatro puntos están anotados con su evidencia en `progress/features/SLT-88.md`.
  Si el 2 da 413, el límite de 4 MB no basta: se PARA y decide Carlos.

## Después de la T6: merge y sincronía

- [ ] Merge del PR a `prod`, por el humano y con `gate-completo` en verde.
- [ ] Sincronizar `prod` a `dev` y confirmar que `dev` conserva los 4 MB y el `catch`.

## Archivos esperados

- `app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx`
- `lib/config/chat-media-envio.ts`
- `lib/clients/whatsapp-media-upload.ts`
- `tests/unit/config/chat-media-envio.test.ts`
- `tests/unit/actions/chat-whatsapp-actions.test.ts`
- `tests/unit/services/chat-whatsapp-service.test.ts`
- `tests/components/ChatComposerAdjunto.test.tsx`
- `tests/components/ChatNotaVoz.test.tsx`
- `progress/impl_SLT-88.md`
- `progress/features/SLT-88.md`
