# SLT-268 «Integraciones: pasar las credenciales de v1 a v9 desde servi» — requirements

Ruta: **completa** (subida desde ligera el 2026-11-26: toca las credenciales de integraciones
externas y abre un endpoint que reescribe datos de prod en la base compartida con Ordenex).
Zona backend, complexity low.

## Alcance

**Problema.** La base de prod la comparten dos despliegues hasta un corte sin fecha: servi (este
repo) y la copia entregada Ordenex. Las credenciales de integraciones por empresa (tabla
`integracion`, columna `secretos`) están cifradas con la versión `v1` del anillo. La clave `v1` solo
existe dentro del Vercel de servi, como variable Sensitive: nadie la conoce y no se puede leer ni
reescribir sin perderla. Ordenex tiene un anillo con solo `v9`, una clave nueva que sí conocemos.
Para que Ordenex lea las credenciales sin que la empresa reconecte, hay que descifrar con `v1`
**dentro del runtime de servi** y recifrar a `v9`.

Volumen medido el 2026-11-24: 1 empresa con integraciones en prod y 3 credenciales (whatsapp y
google_maps conectadas, optimizacion_rutas en estado error), todas en `v1`.

**Entra:**
- servi acepta claves adicionales en el anillo desde una variable nueva,
  `INTEGRACIONES_CLAVES_CIFRADO_EXTRA`, que se fusiona con `INTEGRACIONES_CLAVES_CIFRADO` sin tocar
  esta última;
- un disparador manual que corre el recifrado existente (`RecifradoIntegracionesService`) dentro del
  runtime de servi: `POST /api/cron/recifrar-integraciones`, con un modo que solo cuenta y otro que
  ejecuta;
- los pasos operativos para hacer el paso de `v1` a `v9` en prod (sección aparte; no son requisitos de
  código).

**No entra:**
- cambiar la regla del recifrado. `RecifradoIntegracionesService` y su repositorio se reutilizan tal
  cual (`design.md > Lo que ya existe`);
- migraciones o cambios de esquema: servi no puede liberar migraciones a prod mientras comparta la
  base;
- quitar `v1` del anillo de servi (es Sensitive y no se puede reescribir sin perderla);
- programar el disparador en `vercel.json`;
- cualquier cambio en Ordenex.

## Decisiones cerradas (no reabrir)

| # | Decisión | Fuente | Cubierta por |
|---|---|---|---|
| D1 | Camino 2: recifrar desde servi, dentro de su runtime, porque solo allí existe `v1` | Carlos, 2026-11-26 (`progress/features/SLT-268.md > Decisiones`) | R10, R17 |
| D2 | La clave nueva entra por una variable APARTE; `INTEGRACIONES_CLAVES_CIFRADO` no se toca | encargo del leader, 2026-11-26 | R1, R2 |
| D3 | Sin migraciones ni cambios de esquema | encargo del leader; descripción de la ficha | R12 |
| D4 | El cambio sale a prod solo (release desde `origin/prod`): no depende de nada que esté solo en `dev` | encargo del leader | T0 de `tasks.md` (verificación, no comportamiento) |
| D5 | El recifrado reutiliza `RecifradoIntegracionesService`; no se reescribe | encargo del leader | R9, R10, R11 |
| D6 | El disparador se invoca a mano; no se programa | encargo del leader | R16 |
| D7 | El recifrado solo escribe el texto cifrado: la base es compartida con Ordenex | encargo del leader | R12 |
| D8 | Se acepta que `updated_at` cambie al recifrar (Prisma lo fija por `@updatedAt`); el repositorio no se toca (era P1) | Carlos, 2026-11-26 («dale») | R12 |
| D9 | La ruta se queda después del paso a `v9`: exige `CRON_SECRET`, es idempotente y es el único camino para rotar claves que solo existen en Vercel (era P2) | Carlos, 2026-11-26 («dale») | R6, R11 |
| D10 | La credencial de optimizacion_rutas se vuelve a pegar en servi después del recifrado, y queda en `v9` (era P3) | Carlos, 2026-11-26 («dale») | R5 (lo nuevo se cifra con la activa `v9`) |
| D11 | `lib/crypto/boveda-integraciones.ts` y `lib/config/integraciones.ts` son idénticos en `origin/prod` y en la copia de Ordenex, comentarios aparte: Ordenex lee el mismo formato y los mismos datos asociados (era P4) | leader, 2026-11-26 | R17 |
| D12 | SLT-268 no toca `scripts/recifrar-integraciones.ts`, `tests/integration/db/recifrado-integraciones.test.ts` ni `.env.example`. Los casos de integración van en un archivo nuevo y `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` se documenta en el comentario de `lib/config/integraciones.ts`. Motivo: choque de archivos con SLT-227 y SLT-257 (en vuelo, de otra persona) y un cherry-pick limpio a prod | leader, 2026-11-26 | `tasks.md > Archivos esperados` (verificación, no comportamiento) |

## Requisitos (EARS)

### Anillo de claves

- **R1.** El sistema DEBE formar el anillo de claves con las entradas de
  `INTEGRACIONES_CLAVES_CIFRADO` más las de `INTEGRACIONES_CLAVES_CIFRADO_EXTRA`. Las entradas de las
  dos variables tienen la misma forma: `v<n>:<base64 de 32 bytes>`, separadas por comas.
- **R2.** SI `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` no está definida, o solo contiene espacios,
  ENTONCES el sistema DEBE formar exactamente el mismo anillo y lanzar exactamente los mismos errores
  que antes de esta feature.
- **R3.** SI una entrada de `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` no tiene la forma
  `v<n>:<base64 de 32 bytes>`, ENTONCES el sistema DEBE lanzar `ConfiguracionBovedaError`. El mensaje
  nombra `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` y la posición de la entrada, y no incluye ni el valor ni
  la versión.
- **R4.** SI una versión aparece en las dos variables, o se repite dentro de
  `INTEGRACIONES_CLAVES_CIFRADO_EXTRA`, ENTONCES el sistema DEBE lanzar `ConfiguracionBovedaError`.
  El mensaje nombra la variable y la posición de la entrada repetida. El sistema no elige ninguna de
  las dos claves.
- **R5.** DONDE `INTEGRACIONES_CLAVE_ACTIVA` apunta a una versión de
  `INTEGRACIONES_CLAVES_CIFRADO_EXTRA`, el sistema DEBE cifrar todo valor nuevo con esa clave y seguir
  descifrando los valores guardados con cualquier versión de las dos variables. SI la activa no está
  en ninguna de las dos, ENTONCES el sistema DEBE lanzar `ConfiguracionBovedaError` sin valores.

### Disparador `/api/cron/recifrar-integraciones`

- **R6.** SI una petición al disparador no trae `Authorization: Bearer <CRON_SECRET>` con el valor
  correcto, o `CRON_SECRET` no está configurado, ENTONCES el sistema DEBE responder 401 sin leer el
  anillo y sin consultar ni escribir la base.
- **R7.** El disparador DEBE aceptar solo `POST`; no expone `GET`.
- **R8.** SI la petición trae un parámetro de consulta distinto de `solo-contar`, o `solo-contar` con
  un valor distinto de `1`, ENTONCES el sistema DEBE responder 400 sin ejecutar nada. La respuesta no
  repite el nombre ni el valor recibido.
- **R9.** CUANDO llega una petición autorizada con `?solo-contar=1`, el sistema DEBE contar, en todas
  las empresas, los valores legibles por versión y los ilegibles, sin escribir ninguna fila.
- **R10.** CUANDO llega una petición autorizada sin parámetros, el sistema DEBE recifrar con la versión
  activa cada valor legible guardado con otra versión, en todas las empresas, y responder con el
  resumen.
- **R11.** CUANDO se ejecuta el modo que recifra y ningún valor legible queda fuera de la versión
  activa, el sistema DEBE responder `recifrados: 0` sin escribir ninguna fila. Es decir, la segunda
  corrida no cambia nada.
- **R12.** CUANDO recifra una fila de `integracion`, el sistema DEBE cambiar solo `secretos` (y
  `updated_at`, aceptado en D8). Las demás columnas de la fila no cambian: `estado`,
  `datos_publicos`, `ultimo_error_codigo`, `ultima_prueba_at`, `ultimo_webhook_at`,
  `whatsapp_numero_id`, `whatsapp_resumen_verificacion`, `organizacion_id` y `created_at`. Ninguna
  otra tabla se escribe, y un valor ilegible se deja igual.
- **R13.** El sistema DEBE responder con un JSON cuyas únicas claves son `soloContar`,
  `versionActiva`, `porVersion` (versión -> número), `ilegibles`, `recifrados`, `conflictos` y
  `empresasConError`. La respuesta nunca incluye un secreto, un texto descifrado o cifrado, un id de
  integración o de empresa, ni el valor de una variable de entorno.
- **R14.** SI una o más empresas fallan durante la corrida (`empresasConError > 0`), ENTONCES el
  sistema DEBE responder 500 con el mismo resumen de R13, sin el mensaje del error.
- **R15.** SI el anillo no es válido (R3, R4, R5), ENTONCES el sistema DEBE responder 500 con el código
  `configuracion_boveda`, sin valores ni versiones de claves y sin tocar la base.
- **R16.** El disparador NO DEBE figurar entre los `crons` de `vercel.json`.

### Objetivo de la feature

- **R17.** CUANDO termina el modo que recifra, con un anillo `{v1, v9}` y la activa en `v9`, el
  sistema DEBE haber dejado todo valor que antes era legible descifrable con un anillo que solo
  contiene `v9`, que es el de Ordenex.

## Trazabilidad prevista (R -> test)

| R | Test |
|---|---|
| R1, R2, R3, R4, R5 | `tests/unit/config/integraciones-config.test.ts` (casos nuevos; claves generadas en el test) |
| R6, R7, R8, R13, R14, R15, R16 | `tests/unit/api/cron-recifrar-integraciones.test.ts` (servicio doble; R16 lee `vercel.json`) |
| R9, R10, R11, R12, R17 | `tests/integration/db/recifrado-integraciones-extra.test.ts` (archivo nuevo, D12; Postgres real, transacción revertida, servicio construido con la composición de la ruta) |

## Pasos operativos (no son requisitos de código)

Los hace Carlos, en este orden, **después** de que el código esté en prod:

1. **Release a prod** del código de esta feature (cherry-pick desde `origin/prod`). Sin las variables
   nuevas no cambia nada (R2).
2. En el Vercel de servi (Production), **añadir** `INTEGRACIONES_CLAVES_CIFRADO_EXTRA=v9:<clave v9>`
   (la misma que usa Ordenex) y **cambiar** `INTEGRACIONES_CLAVE_ACTIVA=v9`.
   `INTEGRACIONES_CLAVES_CIFRADO` no se toca: `v1` se queda para seguir leyendo.
3. **Redeploy** de prod en servi: las variables de Vercel solo se aplican en un despliegue nuevo.
4. `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<dominio-servi>/api/cron/recifrar-integraciones?solo-contar=1"`.
   Debe salir `versionActiva: "v9"`, `porVersion: { v1: 3 }` (o lo que haya ese día),
   `empresasConError: 0`.
5. El mismo `curl` **sin** `?solo-contar=1`: recifra.
6. Otra vez el paso 4: debe salir `v1` en 0 o ausente, y `ilegibles: 0`.
7. En Ordenex, abrir las integraciones de la empresa y probar la conexión de WhatsApp y Google Maps.
8. En servi, volver a pegar la credencial de optimizacion_rutas (D10). Se guarda cifrada con la
   activa `v9`, así que la leen los dos.

**Por qué este orden:**
- **El código va antes que las variables.** Con el código viejo, `INTEGRACIONES_CLAVE_ACTIVA=v9`
  apunta a una versión que no está en el anillo: `leerAnilloDeClaves` lanza y servi deja de leer y
  de guardar todas las integraciones.
- **La activa pasa a `v9`, y no solo se añade la clave.** El recifrado mueve los valores a la versión
  activa. Si la activa siguiera en `v1`, no movería nada. Además, todo lo que servi guarde después
  (reconexiones, credenciales nuevas) seguiría saliendo en `v1`, que Ordenex no puede leer.
- **`v1` se queda en el anillo de servi.** Una credencial escrita en `v1` entre el paso 3 y el 5
  sigue siendo legible. Y no se puede quitar sin reescribir la variable Sensitive.

**optimizacion_rutas** ya está en estado error: después del paso 5 su credencial queda en `v9` pero
sigue siendo la misma que fallaba. Por eso se vuelve a pegar en servi (paso 8, D10).

## Preguntas abiertas

Ninguna. P1 a P4 se cerraron el 2026-11-26 y están en `## Decisiones cerradas` (D8 a D11).
