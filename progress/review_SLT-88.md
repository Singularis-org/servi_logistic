# Review SLT-88 «Las fotos pesadas del chat no se envían y no avisan» (hotfix)

Rama `hotfix/SLT-88-adjuntos-chat-sin-aviso`, HEAD revisado `fa777e17`, base `origin/prod` `fae6a5d3`.
Fecha: 2026-11-05. El grafo no tiene proyecto de este worktree: se revisó con Grep, Read y git.

## Veredicto: OK

Sin bloqueantes. **El OK es para abrir el PR, no para mergear:** faltan `gate-completo` en verde y la T6
paso B en un teléfono. La causa del reporte sigue **sin medir**.

## Checklist

| Punto | Estado | Evidencia |
|---|---|---|
| Trazabilidad R1-R18 → test | Pasa | Tests leídos; ninguno vacío. Mapa en `progress/impl_SLT-88.md` |
| Tasks en `[x]` | Parcial (menor m8) | T1-T3 sí. T4 `./init.sh`, T5 y T6 abiertas: son de la salida, salvo lo anotado en m8 |
| `design.md > Lo que ya existe` | Pasa | Abre con la sección; el diff no re-crea nada de la lista |
| Alternativa descartada | Pasa | `design.md` §9 |
| Typecheck | Rojo ajeno | 12 errores, 0 en este diff (abajo) |
| Lint | Pasa | Exit 0; ningún archivo del diff en el log |
| `vitest related` con la base desechable | Pasa | 232 archivos, 3193 de 3193, exit 0 |
| Guardias | Rojo ajeno | 4 fallos de 4568, los 4 en `dependencias-declaradas-presentes`, listada en `tests/baseline-rojos.json:51` |
| `./init.sh` | No corrido | Cae en el typecheck por el Prisma compartido. Corrí sus piezas, salvo validador de features y perfil |
| `gate-completo` | Pendiente | No hay PR |
| E2E de flujo crítico | No aplica | El chat vive bajo `mis-asignaciones`, pero no es asignación ni recepción (`design.md` §7). Lectura aceptada |
| Dependencias, migraciones, RLS, `organizacion_id` | No aplica | El diff no los toca |
| Recursos de Ordenex, secretos, PII en logs | Pasa | Ninguno en el diff. Ver m1 para un dato real en un `.md` |
| Literal de país en código nuevo | Pasa | «Costa Rica» solo en `progress/features/SLT-88.md:13`, no en código |
| Comentarios explican el porqué | Pasa | |
| `tests/baseline-rojos.json` | Pasa | Sin cambios |
| Cierre y desmontar worktree | Pendiente | Es posterior al merge |

## Respuestas a los ataques

### 1. Síntoma real: foto de 4,7 MB

- **Siempre se intenta comprimir:** `ChatConversacion.tsx:461` usa el mismo límite que valida. Resultado de
  1600 px y calidad 0,85. Si `comprimirImagen` falla, devuelve el original y sale el aviso de R3 (`:491-493`).
- **Sin camino silencioso en lo que se puede alcanzar:** toda salida de `aceptarArchivo` y de `enviarAdjunto`
  deja aviso, toast o adjunto limpio tras `ok`. Las dos salidas sin aviso de `enviar` (`:650`, `:653`) son envío en
  curso, preparación o nada que enviar, y el botón está deshabilitado. Excepción: una red colgada, m5.
- **El rechazo llega de verdad:** `server-action-reducer.js:114-122` lanza con una respuesta que no es RSC, y
  `:302-305` llama a `reject(e)`. Un 413 de Vercel recorre ese camino.
- **`respuestaDe` no se traga nada que deba subir:** el reducer también rechaza con el error de redirección
  (`:225-233`), pero ni `chat-whatsapp.ts` ni `lib/auth/resolve-actor.ts` llaman a `redirect()` ni lanzan.
- **Toast encima del Dialog:** los dos van por portal a `body`, sin contexto de apilado que los separe; viewport
  `z-[100]` (`providers/ToastProvider.tsx:106`), Dialog `z-50` (`components/ui/dialog.tsx:35,55`). Comprobado solo
  en el código. **La confirmación visual es la T6.**

### 2. R18 y duplicados

- `mutate` queda fuera del `try` en las tres vías. Tras `ok`, un fallo de revalidación no dice «No se pudo enviar».
- **Sí se puede reenviar algo ya enviado**, y el riesgo es más ancho de lo que dice `design.md` §10. Ver m2.
  Lo acepto para el hotfix: en `prod` el adjunto ya se conservaba y el botón seguía activo, así que el mismo
  reenvío ya era posible, sin aviso. El daño es una foto o un texto repetido al destinatario, sin dinero de por medio.

### 3. Límites

- **Servidor igual que navegador:** los dos usan `validarAdjunto` (`lib/actions/chat-whatsapp.ts:196`,
  `ChatWhatsappService.ts:547`, `ChatConversacion.tsx:485`).
- **Sin consumidores de 5, 16 o 25 MB:** `LIMITE_DOCUMENTO_BYTES` ya no aparece en el código, tampoco en los
  consumidores de `origin/dev`. El único «16 MB» restante es la descarga (`lib/clients/whatsapp-media.ts:121`).
- **Margen medido con el sobre real, no estimado.** Pasé el `FormData` por el `encodeReply` de Flight de Next,
  que es lo que viaja:

| Caso, con archivo de 4 194 304 bytes | Cuerpo | Sobre | Margen frente a 4 500 000 |
|---|---|---|---|
| Sin pie | 4 194 701 | 397 | 305 299 |
| Pie de 1024 × 3 bytes, nombre de 255 | 4 198 111 | 3 807 | 301 889 |
| Pie de 1024 × 3 bytes, nombre multibyte | 4 198 100 | 3 796 | 301 900 |

  El archivo no se codifica en base64. Medido en Node, no en un navegador. El sobre real (3,8 KB) es algo mayor que
  el estimado en §3 (~3 KB), sin efecto. **Lo que hace Vercel con ese cuerpo sigue sin medir** (T6).
- **Otros caminos de subida:** `enviarMediaChat` tiene un único llamador. `enviarPlantillaChat` no lleva archivo.
  `whatsapp-subida-reanudable` sube un PDF de ejemplo generado en el servidor, sin pasar por una Server Action.

### 4. Nota de voz y video

- **R8:** por encima de 4 MB sale el aviso y la grabación se pierde, sin recomprimir. No se pierde en silencio, y
  el riesgo está declarado. Ver m6.
- **R9:** el texto sale en el menú bajo «Cámara», con literal en `ChatComposerAdjunto.test.tsx:178,180`.
- **Video de más de 4 MB:** aviso de R7, sin subir. Es la decisión de Carlos.

### 5. Regresiones

Fotos pequeñas, HEIC, PNG, `fuera_ventana`, `permanente`, `forbidden` y doble clic tienen test y pasan.
**Los textos de `enviarAdjunto` son ciertos.** Los de texto libre y plantilla no siempre: m3, anterior a este diff.

### 6. Tests

- La acción rechaza de verdad con `mockRejectedValue` en R12, R15, R16 y R17.
- **Seis mutaciones mías, sobre una copia desechable de HEAD.** Sin mutar corren 46 tests, 0 rojos:

| Mutación | Rojos | Cae |
|---|---|---|
| Sin `catch` en `respuestaDe` | 5 | R12, R15 ×2, R16, R17 |
| Umbral de compresión a 5 MB | 1 | R1 |
| `mutate` dentro del `try` | 1 | R18 (doble) |
| Sin toast en el rechazo del adjunto | 4 | R12 ×2, R16, R17 |
| Plantilla sin `respuestaDe` | 2 | R15 ×2 |
| El rechazo limpia el adjunto | 3 | R12 ×2, R17 |

  Coinciden con la bitácora donde se pueden comparar. No repetí las otras mutaciones.
- **Oyentes de `unhandledRejection` en R18** (`ChatComposerAdjunto.test.tsx:694-714`): se apartan solo durante el
  test y se restauran en `finally`. Otro archivo no se ve afectado. Sí puede ocultar un rechazo inesperado de ese mismo
  test: m7.

### 7. Salida

- **Diff:** 13 archivos, los 10 esperados más los 3 del spec. `next.config.ts`, la acción, el servicio y
  `comprimirImagen` no cambian.
- **`git diff origin/prod origin/dev`** en los 8 archivos de código y tests, con `fetch` hecho (`origin/dev` =
  `cc63e547`): **vacío**.
- **`git merge-tree --write-tree origin/dev HEAD`:** limpio (`41f45478`). La sincronización no chocará.
- **Cliente:** no conozco su nombre, así que no pude buscarlo como literal. Repasé los nombres propios añadidos en el
  diff y no aparece ninguno que lo parezca. Sí hay un dato real: m1.

### 8. Typecheck

12 errores en 5 archivos: `HistorialAccionRepository.ts`, `PlanesRepository.ts`, `lib/types/historial-accion.ts`,
`planes-cambio-programado.test.ts`, `planes-catalogo.test.ts`. **Ninguno viene de este diff:** ninguno de esos
archivos está tocado y los errores son de campos Prisma (`precioNegociable`, `topesPorRol`, `tarifas_activadas`). No
repetí la medida sobre un `origin/prod` limpio.

## Hallazgos

No hay `BLOQUEANTE`. Todos son `menor`.

- **m1 · menor · `progress/features/SLT-88.md:13`.** Número de guía real de producción («Guía 63078626») con su franja
  horaria, en un repo **público**. No nombra al cliente, y el rastreo público pide un segundo factor
  (`lib/types/rastreo-publico.ts:35-44`), así que no da acceso por sí solo. Pero es un dato de producción que no aporta
  nada al documento. Conviene quitarlo antes del PR. Ya está publicado en la rama remota desde `2415ecaa`: borrarlo
  en HEAD no lo saca del historial. Si eso importa, decide Carlos.
- **m2 · menor · `lib/services/ChatWhatsappService.ts:569-589`.** El reintento duplicado no viene solo de una red que cae
  al volver, como dice §10. Si Meta acepta y `insertarSaliente` lanza, la acción rechaza con el mensaje ya entregado:
  el aviso pide reintentar y sale otra vez. Igual si la función agota su tiempo tras enviar. Conviene ampliar el riesgo
  en el PR y dejar la idempotencia como deuda.
- **m3 · menor, anterior al diff · `ChatConversacion.tsx:608-609` y `:639-640`.** En texto libre y plantilla, `permanente`
  cae en `default`: Meta rechaza y el mensajero lee «Tu sesión expiró. Vuelve a entrar.». El tipo lo permite
  (`lib/types/chat-whatsapp.ts:71,117`) y la acción lo devuelve (`chat-whatsapp.ts:119,298`). También es un aviso
  falso, pero queda fuera de R14, que habla del adjunto. Anotar como deuda.
- **m4 · menor · `ChatConversacion.tsx:172-176`.** El rechazo se descarta sin dejar rastro. Con la causa sin medir, en
  producción no se podrá saber con qué frecuencia ocurre ni por qué. No incumple ningún R. Valorarlo si la T6 no aclara
  la causa.
- **m5 · menor, anterior al diff.** La acción no tiene tiempo máximo en el cliente. Con la red colgada, sin error, el
  botón queda en «enviando» hasta que el navegador corte, sin forma de cancelar.
- **m6 · menor, declarado · `ChatConversacion.tsx:489-490`.** La nota de voz no tiene aviso previo ni contador. Quien
  grabe de más pierde la nota al detener. A qué duración llega a 4 MB sigue sin medir. Cortarla está fuera de alcance
  (§9).
- **m7 · menor · `ChatComposerAdjunto.test.tsx:696`.** `ignorar` descarta cualquier rechazo. Mejor recoger los motivos y
  afirmar que solo llegó «revalidacion».
- **m8 · menor · casillas y estado.** En `tasks.md` siguen abiertos T4 `./init.sh` y el diff de T5, cuyo resultado ya
  está aquí. `progress/features/SLT-88.md:5,10` sigue diciendo `spec` y «falta el spec». El leader debe actualizarlos.

## Verificado y sin verificar

**Verificado por mí:** lectura del código y del reducer de Next, typecheck, lint, `vitest related` con la base desechable,
guardias contra la baseline, seis mutaciones, sobre real con `encodeReply`, diff contra `origin/dev` y fusión de prueba.

**Sin verificar:**
- Que Vercel corte a 4,5 MB en este despliegue, y por tanto **la causa del reporte**: la T6 paso A no se pudo medir.
- El comportamiento en un teléfono: compresión real, toast encima del chat y reintento con la red cortada.
- `gate-completo`, E2E y suite completa.
- `./init.sh` completo: validador de features y perfil.
- Los 12 errores de typecheck sobre un `origin/prod` limpio: dato de la bitácora.
- La redirección de `middleware.ts:112` con sesión vencida: lo tomo de `design.md` §5.

## Antes de mergear

1. `gate-completo` en verde.
2. T6 paso B, los cuatro puntos, con su evidencia. Si el PDF de 3,9 MB da 413, se para y decide Carlos.
3. El texto del PR dice que la causa es probable, sin medir.
