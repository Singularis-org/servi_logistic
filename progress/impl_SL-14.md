# impl SL-14 «Dominio de origen a configuración»

Worktree `.worktrees/SL-14-dominio-a-configuracion`, rama `feature/SL-14-dominio-a-configuracion`.

## T-sync (2026-10-21)

`git merge dev` sin conflictos: commit `20f0d47`. Trae SL-10 con `.env.example` versionado.

## T1 — Medida de partida

Detector de D6 (`ordenex\.co(?![a-z0-9-])`, sin distinguir mayúsculas) con
`git grep -IicP` sobre todo lo versionado salvo `progress/`, más `.env.example`.

| Grupo | Archivos | Coincide con la tabla de Alcance |
|---|---|---|
| landing y paleta (SL-8) | `app/_landing/LandingNav.tsx`, `app/_landing/primitivas.tsx`, `app/page.tsx`, `app/globals.css` | sí, 4 |
| SL-11 | `scripts/seed-maestro.ts` | sí, 1 |
| SL-16 | `docs/api/` (4) + `tests/unit/api/openapi-406-evidencias-url.test.ts` | sí |
| SL-27 | specs 86, 288, 404, 406 ×2, 426 | sí, 6 |
| SL-14 docs | `docs/limpieza-ordenex.md`, `docs/plan-saas.md`, `docs/checkpoints-proyecto.md` | sí, 3 |
| SL-14 lib | `lib/api/openapi-spec.ts`, `lib/config/push.ts`, `lib/types/plantilla-datos.ts`, `lib/utils/linkificar.ts`, `lib/whatsapp-envios/informes/aviso-interno.ts` | sí, 5 |
| SL-14 tests | 23 archivos de `tests/` (sin `openapi-406`) | sí, 23 |
| SL-14 `.env.example` | líneas 5 (cabecera de excepciones) y 172 (default VAPID) | sí, 1 |
| **FUERA DE LA TABLA** | `specs/SL-10-gate-verde-heredado/design.md` (l. 16, 222), `requirements.md` (l. 32), `tasks.md` (l. 15) | **no, 3** |

### Bloqueo (PARA, según T1)

Los 3 archivos de `specs/SL-10-gate-verde-heredado/` llegaron con el merge de `dev` después de que
se midiera el spec. Nombran el dominio al hablar del comentario VAPID de `.env.example`.

- R12 prohíbe a SL-14 tocar `specs/` salvo el suyo, así que no puedo reescribirlos.
- R10 solo admite excepciones de la tabla de Alcance, cada una con la ficha que la retira, y esta
  tabla no tiene ninguna ficha para los specs de SL-10.

Sin una decisión, la guardia de R9 sale en rojo con estos 3 archivos. Opciones (decide el humano):

1. Excepción temporal por archivo atada a SL-27, o a otra ficha que diga el humano.
2. Permitir que SL-14 reescriba esas 4 líneas sin el literal: amplía R12 y es una excepción a
   «no tocar specs ajenos».
3. Otra ficha nueva que los retire.

T2–T10 quedan sin empezar hasta la decisión.

## Decisión del leader sobre el bloqueo de T1

R12 ampliada (commit `8d94164`): los 3 specs de SL-10 se limpian sin el literal. Ese trabajo es del
implementer y está **sin commitear** en el árbol (`specs/SL-10-gate-verde-heredado/`). backend_dev no
lo toca. La guardia lee el disco, así que con esos cambios en el árbol no los marca.

## T2 — Guardia en rojo primero (`aefe245`)

Archivo: `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (nuevo).

- Detector `lineasConDominio`, regex compuesta por partes (D6).
- 13 excepciones `{ruta, ficha, motivo}`: 4 de SL-8, 1 de SL-11, 2 de SL-16 (`docs/api/` como prefijo
  y `openapi-406`), y 6 specs de SL-27 por archivo.
- Poda `excepcionesSinDominio` y barrido `hallazgosFueraDeExcepciones`, funciones puras con casos
  sintéticos que muerden.
- Universo: `git ls-files -z` más `.env.example`, sin `progress/` y sin binarios por extensión.

`pnpm exec vitest run tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts`: 7 passed, 1 failed.
El fallo es el barrido R9, rojo esperado: «32 archivo(s)», 78 líneas. Archivos: `.env.example`,
los 3 de `docs/`, los 5 de `lib/` y los 23 de `tests/`, los mismos de T1. Los specs de SL-10 no
salen.

## T3 — Push (`3fbf28a`)

Archivos: `lib/config/push.ts` y `tests/unit/config/push-config.test.ts`.

- Se borra `DEFAULT_SUBJECT`. `piezasVapidAusentes` mira tres piezas y `loadPushConfig` lanza
  `PushNoConfiguradoError(VAPID_SUBJECT)`. Se actualizan los comentarios de cabecera y de
  `pushConfigurado`.
- Tests: casos nuevos SL-14/R1 (dos claves sin subject: sin canal, `null`, `["VAPID_SUBJECT"]`,
  también en blanco), SL-14/R1 (nombra las tres en orden), SL-14/R2 (lanza nombrándola) y SL-14/R3
  (subject = valor recortado). Los casos que activan push con dos claves pasan a tres.
- `push-action`, `push-web-service` y `jobs-handler-por-tipo` no activan push con dos claves: no se
  tocan.

Corridas:

- `pnpm exec vitest run tests/unit/config/push-config.test.ts`: 13 passed.
- `vitest related --run lib/config/push.ts` se quedó colgado más de 10 min y se mató. En su lugar
  corrí los 32 archivos de `tests/` que importan `config/push`, `actions/push`, `notificadores`,
  `web-push-sender` o `push-web-handler`, más `push-web-service` y `jobs-handler-por-tipo`:
  31 passed, 1 failed, 1 skipped (33 archivos); 502 passed, 4 failed, 2 skipped.
  - El fallo es `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`, 4 casos:
    «init.sh ya no tiene el marcador >>> FIN PASO 2 …». Es ajeno a SL-14 (habla de `init.sh`).
- **Rojo comprobado:** con `push.ts` de `HEAD~` (default restaurado), `push-config.test.ts` dio
  3 failed, 10 passed: R1 sin canal, R1 tres en orden y R2 lanza. Revertido; `git diff` mostró
  solo mi cambio antes del commit.

## T4 — Ejemplos (`4c12076`), PARCIAL: T4 queda sin marcar

Archivos: `lib/types/plantilla-datos.ts` (ejemplo `url_guia`, `urlBase` y JSDoc),
`lib/whatsapp-envios/informes/aviso-interno.ts` y `lib/utils/linkificar.ts` (dos comentarios).

`pnpm exec vitest related --run` sobre los cuatro de `lib/` (con `openapi-spec.ts` cambiado):
271 passed, 1 failed, 6 skipped (278 archivos); 3730 passed, 1 failed, 16 skipped.

### Bloqueo: `lib/api/openapi-spec.ts` no puede cambiar sin tocar `docs/api/`

El fallo es `tests/unit/api/openapi-webhook-estado-actualizado.test.ts`, caso «2026-09-01: paridad
TS↔YAML — el schema publicado es espejo EXACTO del objeto TS». Compara con `JSON.stringify` el
schema TS con el de `docs/api/api-key-openapi.yaml`, que lleva el mismo ejemplo `evidenciasUrl` en
la línea 961. D2 dice que ningún test compara ese valor, pero este sí lo compara.

- R7 pide cambiar el ejemplo TS.
- R12 prohíbe tocar `docs/api/`, que es de SL-16.

Revertí `openapi-spec.ts` y su par (línea 63 de `openapi-406-evidencias-url.test.ts`). Tras
revertir, `openapi-webhook-estado-actualizado`, `openapi-406`, `plantilla-datos`,
`informe-aviso-interno` y `linkificar` dieron 5 archivos y 119 passed.

Consecuencia: la guardia sale roja con un solo hallazgo, `lib/api/openapi-spec.ts:1165`.

Opciones (decide el leader o el humano):

1. Ampliar R12 para cambiar esa línea del YAML (`docs/api/api-key-openapi.yaml:961`) junto al TS y
   la línea 63 de `openapi-406`. El arreglo es de 3 líneas.
2. Excepción temporal `lib/api/openapi-spec.ts` → SL-16. Choca con R7.
3. Que SL-16 cambie TS y YAML a la vez.

`valorDeCampo(campo, DATOS_PLANTILLA_EJEMPLO) === campo.ejemplo` sigue verde (`plantilla-datos.test.ts`).

### Cierre de T4 (`6cf2861`), tras la decisión del leader del 2026-10-22 (opción 1)

Cambian a `https://app.example.com/api/ordenes/api-key/orden/100235` estas 3 líneas, sin CRLF:

- `lib/api/openapi-spec.ts:1165`;
- `docs/api/api-key-openapi.yaml:961`;
- `tests/unit/api/openapi-406-evidencias-url.test.ts:63`.

No se toca nada más de `docs/api/`. Las dos excepciones de SL-16 se quedan en la guardia:

- `openapi-406` aún lleva el dominio en las líneas 86 y 156, las que leen el YAML y el CHANGELOG.
- `docs/api/` lo sigue llevando en `CHANGELOG.md`, `guia-integracion/guia-integracion.html` y
  `manual-metricas-por-mensajero.md`.

Corrí `pnpm exec vitest run` sobre los 19 archivos de `tests/unit/api/` que leen `openapi-spec` o el
YAML: 19 passed, 0 failed; 245 passed, 0 failed. Entre ellos están `openapi-webhook-estado-actualizado`
(con el caso de paridad TS↔YAML), `openapi-406-evidencias-url`, `openapi-webhook-contrato` y
`openapi-404-mensajero`. T4 queda marcado.

## T5 — Fixtures de tests (`94da7b3`)

Archivos: 21 con `perl s/<dominio>(?![a-z0-9-])/example.com/gi`, más `no-embalaje.test.ts` (solo
el comentario, reescrito como «sitio de Ordenex»). Se ven en `git show --stat 94da7b3`.

- Los pares entrada/aserción cambian juntos: `webhook-orden-reader` (`carlos@…`), `email-config`,
  `pwa-push` (`hostname` y URL) y la `BASE` de `informe-aviso-interno`.
- `name: "Ordenex"` se queda.
- Los `not.toContain` revisados no se vuelven vacíos: `b.example.com` y `secreta.example.com` no son
  subcadena de `app.example.com`.
- También el comentario de la guardia nueva: citaba el nombre de `no-embalaje`, y esa guardia lo
  marcaba.

`pnpm exec vitest run <los 21 archivos>`: 18 passed, 1 failed, 2 skipped; 390 passed, 1 failed,
9 skipped.

- Skipped, por falta de base: `tests/integration/db/455/caracterizacion/webhook-estado.test.ts` y
  `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`. No se arreglan.
- **Rojo heredado del spec, no de T5:** `tests/unit/guards/no-embalaje.test.ts` > «no queda ninguna
  referencia a 'embalaje' fuera del whitelist». Lo marcan `specs/SL-14-dominio-a-configuracion/design.md`
  (líneas 130, 162 y 197) y `tasks.md` (línea 134), que citan el nombre de esa guardia. No lo
  arreglé:
  - D3 dice que en `no-embalaje` solo cambia el comentario;
  - `design.md` no es mío.

  Decide el leader: alta de los dos specs en su whitelist, o reescribir la prosa del spec.

## T6 — Docs del plan (`a3d8205`)

Archivos: `docs/limpieza-ordenex.md` (§4 «Dominio de Ordenex» y línea de medida viva hacia la
guardia), `docs/plan-saas.md` y `docs/checkpoints-proyecto.md`.

El detector (`git grep -nIiP`) no marca ninguno (exit 1). El comando de medida de §4 sigue escrito
en la línea 694.

## T7 — `.env.example` (`a1e9e1b`)

Archivos: `.env.example` y la guardia, con el caso R8.

- Cambios en `.env.example`:
  - bloque «Origen público de la app» con `NEXT_PUBLIC_APP_URL=` y `NEXT_PUBLIC_SITE_URL=`, el
    consumidor y la ausencia de cada una, y que se inlinean al compilar;
  - `VAPID_SUBJECT` pasa a obligatoria y se borra el default;
  - en la cabecera, fuera la línea de excepción VAPID, y «fase 3» → SL-20, SL-21 y SL-22 (deuda D3).
- Caso R8 de la guardia: las tres `NOMBRE=` sin valor, y el comentario «VAPID_SUBJECT es OBLIGATORIA
  para que haya push».

Corrida sobre la guardia, `env-example-sin-valores`, `push-config` y `sinpe-sin-variables-de-entorno`:
3 archivos passed, 1 failed; 31 passed, 1 failed. El fallo es el barrido R9 de la guardia, con el
único hallazgo `lib/api/openapi-spec.ts:1165` (bloqueo de T4). R8 en verde.

## T8 — R4–R6 siguen cubiertos

`pnpm exec vitest run --reporter=verbose` sobre los 4 archivos: 4 passed, 180 passed.

- R4: `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts` > «sin base URL: enlace vacio (el
  motor lo convierte en error nombrando `enlace`)», con `baseUrl: () => null`.
  - Lo encadena `tests/unit/services/ejecucion-envio-service.test.ts` > «una variable de la
    plantilla sin valor -> error nombrandola, sin enviar».
  - `EjecucionEnvioService.ts:196-197` trata igual una clave ausente y `""`.
- R5: `tests/unit/types/plantilla-datos.test.ts` > «`url_guia` es vacia sin guia y sin URL publica,
  nunca un enlace roto» (`urlBase: ""`).
- R6: `tests/unit/services/webhook-estado-service.test.ts` > «268/R24 (2): con el origin SIN resolver
  el campo se OMITE (y `loadWebhookConfig` no lanza)» (`WEBHOOK_APP_ORIGIN: null`).

No hizo falta añadir ninguno.

## T9 — Guardia en verde (`4a07307`)

`pnpm exec vitest run --reporter=verbose` sobre las tres guardias, con T4 ya cerrado:

| Archivo | passed | failed |
|---|---|---|
| `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` | 9 | 0 |
| `tests/unit/guards/no-embalaje.test.ts` | 1 | 0 |
| `tests/unit/guards/env-example-sin-valores.guardia.test.ts` | 4 | 0 |

Total: 3 archivos, 14 passed, EXIT=0.

- El barrido R9 ya no da hallazgos.
- `no-embalaje` sale verde porque el spec ya no nombra el término (`b51dd51`).
- Los specs de SL-10 se commitearon aparte, en `24cf900`, que no es de backend_dev. La guardia
  queda verde contra lo commiteado, no solo contra el disco.

**Poda comprobada:** quité el dominio de `specs/426-api-401-json/requirements.md` en el árbol, desde
una copia de respaldo. Salió EXIT=1: «ninguna entrada sobra» en rojo con «la entrada
`specs/426-api-401-json/requirements.md` (ficha `SL-27`) ya no tiene el dominio: bórrala de la
lista». Restaurado desde la copia: `git diff --name-only -- specs/426-api-401-json/` vacío.

## Cierre backend_dev

Corridas con `pnpm --dir <worktree>`. Sin `--dir`, la cabecera de `pnpm run` mostró la ruta del
worktree de SL-8, y repetí las corridas con la ruta explícita:

- `pnpm run typecheck`: TC_EXIT=0.
- `pnpm run lint`: LINT_EXIT=0, 0 errores y 235 warnings. Ninguno está en las líneas cambiadas, pero `WebhookEventoOrdenService.test.ts` y `webhook-estado-service.test.ts` traen 14 heredados (review H5).
- `pnpm exec vitest run` sobre los 19 de `tests/unit/api/` y las 3 guardias: 22 passed, 0 failed;
  259 passed, 0 failed.

Mapa `R<n> → test`:

| Req | Test |
|---|---|
| R1 | `push-config.test.ts`: «SL-14/R1: con las dos claves pero SIN `VAPID_SUBJECT` no hay canal» y «SL-14/R1: … nombra las tres» |
| R2 | `push-config.test.ts`: «SL-14/R2: `loadPushConfig` sin `VAPID_SUBJECT` lanza nombrandola» |
| R3 | `push-config.test.ts`: «SL-14/R3: hay canal SOLO con las tres …» |
| R4–R6 | ver T8 |
| R7 | `plantilla-datos.test.ts` (ejemplo = valor), `informe-aviso-interno.test.ts`, `openapi-406-evidencias-url.test.ts` (línea 63) y la paridad TS↔YAML de `openapi-webhook-estado-actualizado.test.ts` |
| R8 | guardia: «.env.example declara el origen publico y VAPID_SUBJECT sin valor …» |
| R9 | guardia: «ningun archivo versionado fuera de la lista …» |
| R10 | guardia: «toda entrada es temporal …», «la poda muerde …», «ninguna entrada sobra …» y la corrida de poda de T9 |
| R11 | guardia: los 3 casos de «autocomprobacion del detector» |

Veredicto: T2–T9 hechas y en verde. Queda T10, el gate completo, que no corre backend_dev.

## T10 — Gate de cierre (implementer, 2026-10-22)

### Base propia

- Se creó `servi_logistic_sl14` en el servidor del `.env` principal (`localhost:5432`, que no es
  ningún proyecto de Ordenex) con `prisma db execute`. No se imprimió ninguna credencial.
- `prisma migrate deploy` se paró en `20260918120200_zona_sinpe_no_nulo` («FICHA 429: hay bodegas sin
  SINPE»).
- Lo resolví así:
  1. `migrate resolve --rolled-back` de esa migración;
  2. `scripts/seed-sinpe-inicial.ts` con valores INVENTADOS (`NEXT_PUBLIC_SINPE_NUMERO=88888888`,
     `NEXT_PUBLIC_SINPE_NOMBRE="Prueba SL14"`), que solo hace un UPDATE de 7 zonas;
  3. `migrate deploy` otra vez: «All migrations have been successfully applied» (231).
- **No** se corrió `db:seed` ni `seed-maestro`: llevan datos de personas reales y son de SL-11.

### `./init.sh --completo`

Lo corrí con `DATABASE_URL` y `DIRECT_URL` hacia esa base, en HEAD `f000cf0`. Log en
`_trabajo/gate-completo-SL-14.log`, que no se versiona.

- `INIT_EXIT=1`.
- Typecheck ✓, lint ✓ y perfil ✓. No aparece «Instalando dependencias». El único «will be removed» es
  un DeprecationWarning de `pg@9`, no de pnpm.
- Vitest: `Test Files 238 failed | 2278 passed (2516)`, `Tests 259 failed | 32642 passed | 1280
  skipped (34181)`.
- Comparación con el baseline: «hay 234 archivo(s) de test en rojo que NO estan en el baseline». Los
  4 restantes sí están en el baseline, entre ellos `dependencias-declaradas-presentes` y
  `reclasificacion-459-lista`.

**Los 234 son de integración con base:** 232 de `tests/integration/db/`, más
`tests/integration/repositories/` (1) y `tests/integration/actions/analitica-financiera-action.test.ts`.
La causa es la base recién migrada y **sin sembrar**. Mensajes más frecuentes:

- «tabla `orden` vacia: corre `pnpm run db:seed`» ×79;
- «hay DATABASE_URL pero faltan la zona central…» ×31;
- «la tabla `usuario` esta vacia» ×29;
- `conCorpus is not a function` ×26;
- «no hay ningun usuario …».

Esos tests se saltan sin `DATABASE_URL` y revientan con una base vacía. No es un rojo del diff de
SL-14: es deuda de semilla de SL-11, que les da fixtures propios (design de SL-10, D3). **No se
arregló nada.** La lista completa está en el log, desde la línea 26110.

De los archivos de integración que tocó SL-14, dos salen en esa lista. Solo les cambió el literal del
origen, y fallan por la misma base vacía, antes de llegar a la aserción del origen:

- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts`: «tabla `orden` vacia»;
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`: «la tabla `orden` esta
  vacia».

**R14 no se cumple tal como está escrito**: hay rojos fuera del baseline. Todos son ajenos al diff y
del mismo tipo (base sin semilla). Decide el leader: meterlos en el baseline, sembrar la base o
esperar a SL-11.

**Decisión del leader (2026-10-22):** R14 se da por cumplido con el gate rápido en verde. Los 234
rojos del modo completo fallan por la base vacía y son la deuda de SL-31. El reviewer comprobó que no
vienen del diff (`progress/review_SL-14.md`).

### Vuelta 2: menores de la review

- H1: T1 y T10 marcadas `[x]`.
- H2: corregida la frase de D2 en `design.md`.
- H3: el leader confirma que SL-27 existe en el board; la copia local estaba desactualizada.
- H4: D3 marcada como resuelta en `progress/deudas.md`.
- H5: corregida la frase de lint en esta bitácora.

### R12: `git diff --name-only dev...HEAD`

Fuera de lo permitido no toca nada. Las únicas rutas vigiladas que aparecen son las permitidas por
las ampliaciones:

- `docs/api/api-key-openapi.yaml`: una línea, el ejemplo `evidenciasUrl`;
- los 3 specs de SL-10;
- los 3 de SL-14.

No aparecen `.gitignore`, `app/_landing/`, `app/page.tsx`, `app/globals.css`, `app/layout.tsx`,
`scripts/seed-maestro.ts` ni `arnes.manifest`.

### R13

- `git diff --stat dev...HEAD -- package.json pnpm-lock.yaml`: vacío.
- Nombres declarados en `.env.example` frente a `dev`: solo se suman `NEXT_PUBLIC_APP_URL=` y
  `NEXT_PUBLIC_SITE_URL=`, que el código ya leía.

| Req | Corrida |
|---|---|
| R12 | diff contra `dev` (arriba) |
| R13 | diff de `package.json`, lockfile y nombres de `.env.example` (arriba) |
| R14 | `_trabajo/gate-completo-SL-14.log`, `INIT_EXIT=1` por 234 rojos de integración sin semilla |

### Commits de SL-14

| SHA | Qué |
|---|---|
| `20f0d47` | merge de `dev` |
| `fc9b0f2` | T1 |
| `8d94164` | R12 ampliada (specs de SL-10) |
| `aefe245` | T2 |
| `3fbf28a` | T3 |
| `4c12076` | T4, parcial |
| `94da7b3` | T5 |
| `a3d8205` | T6 |
| `a1e9e1b` | T7 |
| `040ca08` | T8 |
| `b51dd51` | R12 ampliada (YAML) y prosa sin el término vetado |
| `6cf2861` | T4, cierre |
| `4a07307` | T9 |
| `24cf900` | specs de SL-10 (los commiteó el leader) |
| `f000cf0` | bitácora de T4 y T9 |
