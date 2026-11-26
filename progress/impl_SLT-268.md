# SLT-268 «Integraciones: pasar las credenciales de v1 a v9 desde servi» — implementación

backend_dev, 2026-11-26. Una sola tanda (T0-T5). Base: `servi_slt268` (desechable, local), exportada
como `DATABASE_URL`/`DIRECT_URL` antes de cada vitest y del gate.

## T0. Paridad con prod

`git fetch origin prod` (origin/prod = 4e4f7b39) y
`git diff --stat origin/prod -- <los 15 archivos de tasks.md>`:

```
 lib/db/para-cada-empresa.ts | 5 ++++-
 1 file changed, 4 insertions(+), 1 deletion(-)
```

Solo difiere `lib/db/para-cada-empresa.ts`: en dev el cuerpo del bucle envuelve `conEmpresa` en
`permitidoEnMora("sistema", ...)` (SLT-121). La firma exportada `paraCadaEmpresa(fn, opciones?)` es
la misma en las dos ramas, y este cambio NO toca ese archivo ni importa `permiso-en-mora`. La ruta
solo llama `paraCadaEmpresa(fn)`, así que el cherry-pick a prod es limpio y la ruta funciona igual
sobre la versión de prod. No es bloqueo. Los otros 14 archivos son idénticos.

## Archivos

Creados:
- `app/api/cron/recifrar-integraciones/route.ts` — `construirServicioRecifrado`,
  `handleRecifrarIntegraciones`, `POST` (sin `GET`).
- `tests/unit/api/cron-recifrar-integraciones.test.ts`
- `tests/integration/db/recifrado-integraciones-extra.test.ts` (D12: archivo nuevo)

Modificados:
- `lib/config/integraciones.ts` — `VARIABLE_CLAVES_CIFRADO_EXTRA`, `leerEntrada(variable, ...)`,
  `sumarEntradas`, fusión de la variable extra y su documentación en la cabecera (D12).
- `tests/unit/config/integraciones-config.test.ts` — casos nuevos al final; los existentes, sin editar.
- `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts` — la variable nueva en permitidas (T4).
- `lib/modulos/reparto.ts` — `"recifrar-integraciones": "nucleo"` en `MODULO_POR_CRON`. No estaba en
  «Archivos esperados»: lo exige la guardia `modulos-reparto` (toda carpeta de `app/api/cron/` tiene
  destino). El bloque `MODULO_POR_CRON` es idéntico en `origin/prod` (el diff de ese archivo contra
  prod está en otros bloques, de SLT-121), así que el cherry-pick sigue limpio.
- `specs/SLT-268-integraciones-recifrar-v1-a-v9/tasks.md` — casillas.

No tocados (comprobado con `git status`): `RecifradoIntegracionesService.ts`,
`IntegracionRecifradoRepository.ts`, `vercel.json`, `db/`, `middleware.ts`,
`scripts/recifrar-integraciones.ts`, `tests/integration/db/recifrado-integraciones.test.ts`,
`.env.example`. Sin migraciones ni dependencias.

## Mapa R -> test

U = `tests/unit/config/integraciones-config.test.ts`, describe «SLT-268 R1-R5 — INTEGRACIONES_CLAVES_CIFRADO_EXTRA».
A = `tests/unit/api/cron-recifrar-integraciones.test.ts`.
I = `tests/integration/db/recifrado-integraciones-extra.test.ts`, describe «SLT-268 T3.1 — de v1 a v9 ...».

| R | Test |
|---|---|
| R1 | U «R1: el anillo tiene las entradas de las dos variables, en orden y con su clave» |
| R2 | U «R2: EXTRA %s = el mismo anillo de hoy» y «R2: EXTRA %s = los mismos mensajes de error de hoy, caracter por caracter» (ausente, vacía, espacios; literales); y los casos SL-36 previos, sin editar, en verde |
| R3 | U «R3: EXTRA mal formada (%s) nombra EXTRA y la entrada 2, sin valor ni version» (5 formas) y «R3: EXTRA con una clave de %s nombra EXTRA y la entrada 1» (16 y 33 bytes) |
| R4 | U «R4: una version de la principal repetida en EXTRA falla en la posicion de EXTRA; no elige clave» y «R4: una version repetida dentro de EXTRA tambien falla» |
| R5 | U «R5: la activa puede ser una version de EXTRA; ...», «R5: con EXTRA presente, una activa fuera de las dos nombra las dos variables, sin la version», «R5: cifra con la activa de EXTRA y descifra lo guardado con la principal» |
| R6 | A «SLT-268 R6 — ...»: «%s -> 401» (sin cabecera, secreto erróneo, sin Bearer, Bearer vacío), «CRON_SECRET %s -> 401 aunque la peticion traiga un Bearer», «por defecto lee CRON_SECRET del entorno: sin la variable, 401 y el anillo ni se mira»; en todos, la fábrica del servicio no se llama |
| R7 | A «el modulo exporta POST y no GET (Next responde 405 al GET)» |
| R8 | A «%s -> 400» (7 variantes: `solo_contar`, `=0`, `=true`, sin valor, repetida, otro parámetro, clave pegada como nombre; sin eco) y «?solo-contar=1 llama al servicio con soloContar: true; sin parametros, con false» |
| R9 | I «R9: ?solo-contar=1 cuenta por version e ilegibles y deja las filas identicas, updated_at incluido» |
| R10 | I «R10/R12/R17/R11: recifra a v9, cambia solo secretos, la copia entregada lo lee con solo v9 y la segunda corrida no hace nada» (resumen `recifrados: 4`, `porVersion: { v9: 4 }`) |
| R11 | I, mismo caso: segunda corrida `recifrados: 0` y foto idéntica, `updated_at` incluido |
| R12 | I, mismo caso: cada fila igual columna a columna salvo `secretos`/`updated_at` (11 columnas comparadas), la fila ilegible entera igual, y la fila de `organizacion` igual |
| R13 | A «copia el resumen campo a campo: un campo de mas en el servicio no sale» (7 claves exactas; sin claves base64, cifrado, id ni secreto); I comprueba que ninguna respuesta lleva claros, cifrados, ids ni claves |
| R14 | A «empresasConError > 0 -> 500 con las 7 claves, sin mensaje de error» |
| R15 | A «con la composicion real de la ruta y EXTRA repitiendo una version: no recorre empresas», «una ConfiguracionBovedaError del servicio -> 500 configuracion_boveda», «otro error cuyo mensaje lleva un cifrado: 500 recifrado_fallido, sin el mensaje en body ni log» |
| R16 | A «vercel.json no tiene un cron con el path de esta ruta» (con control de que `crons` no está vacío) |
| R17 | I, caso R10: cada valor en `v9:` y descifrado con `new BovedaIntegraciones(() => soloV9)` al texto sembrado |

## Salida de la verificación

- `pnpm typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, tsc se cae por memoria,
  exit 134, ajeno al cambio): `TC_EXIT=0`.
- `pnpm exec eslint <los 6 archivos tocados>`: «No issues found», `LINT_EXIT=0`.
- `vitest run` de A, U, I, `tests/integration/db/recifrado-integraciones.test.ts`, la guardia
  `sin-credenciales-de-entorno` y `cron-hora-cr`: `Test Files 6 passed (6)`, `Tests 87 passed (87)`,
  sin skipped. I corre contra `servi_slt268` (verbose: los 2 casos con tiempo, 234 ms y 34 ms).

- `./init.sh` (rápido, `.env` presente, base desechable exportada): `INIT_EXIT=0`. Dos rojos
  previos, ya corregidos: la guardia `modulos-reparto` (faltaba la ruta en `reparto.ts`) y la guardia
  `sin-nombre-heredado` (el test de integración nombraba la copia entregada por su nombre heredado;
  ahora dice «la copia entregada»). Avisos en amarillo, todos ajenos al cambio (node_modules
  compartido, gate.yml a mano, worktrees).

## Mutaciones (todas medidas, archivo restaurado tras cada una)

| Mutación | Tests | Resultado |
|---|---|---|
| R12: el repositorio también pone `ultimoErrorCodigo: null` | I | ROJO (1 de 2) |
| R6: se construye el servicio ANTES de comprobar el secreto | A | ROJO (15 de 23) |
| R6: `CRON_SECRET` no configurado se deja pasar | A | ROJO (3 de 23) |
| R8: aceptar `solo_contar` como alias | A | ROJO (1 de 23) |
| R13: responder `...resumen` más un campo extra | A | ROJO (2 de 23) |
| R9: `solo-contar` no pasa `soloContar: true` | A + I | ROJO (3 de 25) |
| T3: solo-contar que escribe (servicio sin `soloContar \|\|`) | I | ROJO (1 de 2) |
| R1/R5: quitar la lectura de EXTRA | U + I | ROJO (14 de 41) |
| R14: `empresasConError > 0` responde 200 | A | ROJO (1 de 23) |
| R15: `ConfiguracionBovedaError` cae en `recifrado_fallido` | A | ROJO (2 de 23) |
| R15/log: el `message` del error va al log | A | ROJO (1 de 23) |
| R2: el mensaje de la activa nombra EXTRA aunque no esté | U | ROJO (4 de 39) |

## Incidencia

Al montar el `DATABASE_URL` de la desechable, un `new URL()` inválido (comillas sin quitar) imprimió
en la salida de mi herramienta la URL local de desarrollo del `.env` (localhost, con su contraseña
local). No salió del equipo ni quedó en ningún archivo del repo.

## Veredicto

Hecho: R1-R17 con test, 12 de 12 mutaciones en rojo, typecheck, lint y gate local en verde; sin bloqueos para el cherry-pick a prod.
