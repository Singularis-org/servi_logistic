# SLT-88 · implementación (T1-T4)

Rama `hotfix/SLT-88-adjuntos-chat-sin-aviso`, desde `origin/prod` (`fae6a5d3`). Sin migraciones, sin
dependencias. `next.config.ts`, `lib/actions/chat-whatsapp.ts`, `lib/services/ChatWhatsappService.ts` y
`comprimirImagen` no cambian (`git diff 2415ecaa HEAD --name-only`: 0 coincidencias).

## Tandas

| Tanda | Commit | Contenido |
|---|---|---|
| T1 | `02962a72` | `LIMITE_ADJUNTO_BYTES`, fuera `LIMITE_DOCUMENTO_BYTES`, comentarios; R5, R6, R11 |
| T2 y T3 | `10df2d72` | Textos, desenlaces de `aceptarArchivo`, `catch`, origen `"grabacion"`; `respuestaDe` en las tres vías; R1-R4, R7-R10, R12-R18 |
| T4 | este commit | Casillas y esta bitácora |

## Archivos

- `app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx`
- `lib/config/chat-media-envio.ts`
- `lib/clients/whatsapp-media-upload.ts` (solo comentario)
- `tests/components/ChatComposerAdjunto.test.tsx`
- `tests/components/ChatNotaVoz.test.tsx`
- `tests/unit/config/chat-media-envio.test.ts`
- `tests/unit/actions/chat-whatsapp-actions.test.ts`
- `tests/unit/services/chat-whatsapp-service.test.ts`
- `specs/SLT-88-adjuntos-chat-sin-aviso/tasks.md` (casillas)

`progress/features/SLT-88.md` no se tocó: lo lleva el leader (paso A de la T6).

## Mapa R → test

CC = `tests/components/ChatComposerAdjunto.test.tsx`, CF = `tests/unit/config/chat-media-envio.test.ts`,
CV = `tests/components/ChatNotaVoz.test.tsx`, TA = `tests/unit/actions/chat-whatsapp-actions.test.ts`,
TS = `tests/unit/services/chat-whatsapp-service.test.ts`.

| R | Test | Mutación que lo pone rojo |
|---|---|---|
| R1 | CC «R1: un JPEG de 4 MB + 1 byte se comprime y lo que viaja es el RESULTADO» | M01 |
| R2 | CC «R2: un JPEG/PNG de 4 MB exactos no se comprime y viaja tal cual» | M02 |
| R3 | CC «R3: si el resultado sigue en 7 MB / la compresion devolvio el original de 9 MB / el resultado queda 1 byte por encima…» | M03 |
| R4 | CC «R4: si preparar lanza, avisa y deja de decir «Preparando la foto…»» | M04 |
| R5 | CF «SLT-88 R5: imagen/video/audio/documento acepta 4 MB exactos y rechaza un byte mas» y «R5: el limite unico son 4 MB…»; CC «R5/R7: un PDF de 4 MB exactos SI queda en el composer» | M05-M08 |
| R6 | TA «(c) R11: 6 MB se rechaza…» y «SLT-88 R6: video/PDF de 5 MB responde demasiado_grande…»; TS «(b) R11: una imagen de 6 MB…» y «SLT-88 R6: video/PDF de 5 MB es demasiado_grande…» | M09, M10 |
| R7 | CC «R7: un video/audio/PDF de 5 MB se rechaza sin comprimir ni dejarlo en el composer» | M11-M15 |
| R8 | CV «SLT-88 R8: una grabacion de 4 MB + 1 byte avisa con su texto…» y «…de 4 MB exactos SI queda lista para enviar» | M16, M17 |
| R9 | CC «R1: el clip ofrece las CUATRO vias de adjuntar…» (el caso de 316 que pide el spec) | M18 |
| R10 | CC «R10: `demasiado_grande` del servidor (4194304 / 3145728)…» | M19, M20 |
| R11 | CF «R11: el multipart de un adjunto en el limite, con el peor pie y nombre, cabe bajo el corte» | M21 |
| R12 | CC «R12: si la accion rechaza su promesa / resuelve sin resultado…» | M22, M23 |
| R13 | CC «R19: si el envio falla, el adjunto SIGUE en el composer para reintentar» (ampliado) | M24 |
| R14 | CC «R14: {…} conserva su aviso propio y el adjunto», `it.each` de los siete estados | M25-M32 |
| R15 | CC «R15: si `enviarMensajeChat` / `enviarPlantillaChat` rechaza su promesa / resuelve sin resultado…» | M33, M34 |
| R16 | CC «R16: con el envio en vuelo, dos clicks y un Enter hacen UNA llamada, y el rechazo suelta el boton» | M35 |
| R17 | CC «R17: tras un rechazo, reintentar hace otra llamada con el mismo archivo y pie; el ok limpia» | M36, M37 |
| R18 | CC «R18: `ok` con `mutate` rechazando… (doble)» y «R18: `ok` con el fetcher del hilo fallando… (SWR real)» | M38 |

## Mutaciones: 38/38 muertas

Script fuera del repo, una a una y sin otra corrida en paralelo. Cada mutación: sustituye un texto exacto,
corre con `pnpm exec vitest run <test> --reporter=json`, lee `numTotalTests` y `numFailedTests`, restaura y
compara la huella SHA-256 de los cuatro archivos vigilados. Huella final igual a la inicial: `b65407fb3f074f07`.

**Autocomprobación, sin mutar:** CC 46 tests, CV 10, CF 14, TA 53, TS 46; 0 fallos en los cinco.

| Id | R | Mutación | Corridos | Rojos |
|---|---|---|---|---|
| M01 | R1 | `excedeLimite` en 5 MB | 46 | 1 |
| M02 | R2 | `>` por `>=` en `excedeLimite` | 46 | 2 |
| M03 | R3 | Sin la rama del aviso de foto | 46 | 3 |
| M04 | R4 | Sin el `catch` de `aceptarArchivo` | 46 | 1 |
| M05 | R5 | imagen a 5 MB | 14 | 3 |
| M06 | R5 | video a 16 MB | 14 | 3 |
| M07 | R5 | audio a 16 MB | 14 | 3 |
| M08 | R5 | documento a 25 MB | 14 | 3 |
| M09 | R6 | Acción: sin validar | 53 | 4 |
| M10 | R6 | Servicio: sin validar | 46 | 6 |
| M11 | R7 | Texto viejo («para este tipo.») | 46 | 5 |
| M12 | R7 | video a 16 MB | 46 | 2 |
| M13 | R7 | audio a 16 MB | 46 | 1 |
| M14 | R7 | documento a 25 MB | 46 | 1 |
| M15 | R7 | Comprimir también lo que no es imagen | 46 | 4 |
| M16 | R8 | Grabación con el texto de R7 (rama) | 10 | 1 |
| M17 | R8 | Grabación con el texto de R7 (sin origen) | 10 | 1 |
| M18 | R9 | `16 MB` en el texto | 46 | 1 |
| M19 | R10 | Quitar el adjunto en esa rama | 46 | 2 |
| M20 | R10 | Ignorar el límite que devolvió | 46 | 1 |
| M21 | R11 | Límite a 4,3 MB | 14 | 6 (incluye R11) |
| M22 | R12 | Sin el `catch` de `respuestaDe` | 46 | 5 |
| M23 | R12 | Sin `?? null` | 46 | 3 |
| M24 | R13 | Texto viejo de `fallo_subida` | 46 | 1 |
| M25 | R14 | `fuera_ventana` con el texto de R12 | 46 | 1 |
| M26 | R14 | `tipo_no_permitido` con el texto de R12 | 46 | 1 |
| M27 | R14 | `caption_largo` con el texto de R12 | 46 | 1 |
| M28 | R14 | `permanente` con el texto de R12 | 46 | 1 |
| M29 | R14 | `no_configurado` con el texto de R12 | 46 | 1 |
| M30 | R14 | `forbidden` con el texto de R12 | 46 | 1 |
| M31 | R14 | `unauthenticated` con el texto de R12 | 46 | 1 |
| M32 | R14 | Quitar el adjunto en `permanente` | 46 | 1 |
| M33 | R15 | `enviarMensajeChat` sin `respuestaDe` | 46 | 2 |
| M34 | R15 | `enviarPlantillaChat` sin `respuestaDe` | 46 | 2 |
| M35 | R16 | Sin el candado `enviandoRef` | 46 | 2 |
| M36 | R17 | Limpiar el adjunto en el fallo | 46 | 3 |
| M37 | R17 | No soltar el candado | 46 | 1 |
| M38 | R18 | `await mutate()` dentro del `try` de la acción | 46 | 1 |

**R18, medido:** en M38 solo cae el test del doble; el de SWR real sigue verde. Es decir, SWR absorbe el
fallo del fetcher, y por eso existe el doble que pide `tasks.md`.

## Comandos

| Comando | Resultado |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` | **Rojo:** 12 errores. Mismos 12 en `origin/prod` limpio (`comm` entre listas ordenadas: 0 solo aquí, 0 solo allí). Ninguno en un archivo de este cambio |
| `pnpm lint` | Exit 0: 0 errores, 234 avisos. En los archivos tocados, ESLint no imprime nada |
| `pnpm exec vitest related --run <archivos>` | Exit 0: 232 archivos, 3193 tests, 3193 pasan |
| `pnpm run test:guardias` | **Rojo:** 4 fallos de 4568 (4563 pasan, 1 saltado), todos en `dependencias-declaradas-presentes.guardia.test.ts`. Los mismos 4 en `origin/prod` limpio |

- **Typecheck:** los errores son del cliente Prisma generado de `node_modules`, compartido: `precioNegociable`,
  `topesPorRol`, `tarifas_activadas`… No se corrió `prisma generate`.
- **Guardias:** la de dependencias afirma cosas de `init.sh`; no se persiguió aquí porque no viene de este cambio.

### Base de datos

`vitest related` arrastra 20 archivos de integración (205 tests). `tests/integration/db/_postgres-real.ts`
carga `.env` si el proceso no trae `DATABASE_URL`.

- **Primera corrida: sin exportar la desechable.** Esos tests corrieron contra la base del `.env` del worktree:
  host local, distinta de la desechable, no producción (comprobado solo con booleanos). Pudieron escribir datos
  de prueba ahí. No se midió si dejaron algo.
- **Segunda corrida: con la desechable exportada.** Exit 0: 3193 de 3193, y los 205 de integración pasan, 0
  saltados. Es el resultado de la tabla.
- `pnpm run test:guardias` corrió sin exportarla.

## Desviaciones

1. **`./init.sh` no se corrió:** instrucción expresa de la tanda. Su casilla de T4 queda sin marcar y el «hecho
   cuando» de T4 sigue abierto. Lo corrido en su lugar es la tabla de arriba.
2. **R18, doble que rechaza.** Con él, el rechazo de `mutate` sube por `void enviar()` sin nadie que lo espere.
   El test aparta los oyentes de `unhandledRejection` solo mientras dura. Con SWR real ese camino no se da en este
   flujo (M38), y por eso no se añadió un `catch` alrededor de `mutate`.
3. **Tests sustituidos:** los de 5, 16 y 25 MB de CF y «R32: si tras convertir sigue por encima de 5 MB…» de CC,
   según `tasks.md`. Añadidos sin pedirlos: el caso de 3 MB de R10, y los de 4 MB exactos en PDF y en grabación.
4. **Toasts:** se buscan con `findAllByText`. Con prioridad alta, Base UI repite el título en el DOM.

## Sin verificar

- Todo lo de la T6: el 413 real de Vercel, el sobre real de la acción y el toast encima del Dialog en un teléfono.
- El reintento duplicado (`design.md` §10): riesgo conocido, sin idempotencia en este camino.
- `git diff origin/prod origin/dev` de la T5: no es de esta tanda.

## Veredicto

T1-T3 hechas con 38/38 mutaciones muertas; T4 queda abierta solo por `./init.sh`, que no se corrió por instrucción.
