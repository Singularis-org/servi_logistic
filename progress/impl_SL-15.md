# SL-15 — El nombre heredado en código y UI: bitácora de implementación

## T1 — Módulo de marca, patrón y guardia

Rama `feature/SL-15-nombre-ordenex-codigo`, sobre `e03d82b` (dev con SL-8, SL-10, SL-11, SL-12,
SL-13 y SL-14 integradas). Fecha: 2026-10-22.

### T1.1 Medición

Comandos, con mayúsculas exactas y sin `specs/`, `docs/` ni `progress/`:
`git grep -I -c -E 'Ordenex|ordenex|ORDENEX'` (líneas por archivo, como en design §1) y
`git ls-files | grep -E 'ordenex|ordx_'`.

| Carpeta | design §1 (archivos / líneas) | Hoy | Diferencia y causa |
|---|---|---|---|
| `app/` | 67 / 437 | 58 / 422 | −9 archivos: SL-8 (`_landing/*` ×5, `page.tsx`, `layout.tsx`, `globals.css`, y además `(app)/_components/Sidebar.tsx`, que design §1 no contaba como suyo) |
| `lib/` | 155 / 552 | 152 / 544 | −3: SL-14 (`config/push.ts`, `whatsapp-envios/informes/aviso-interno.ts`, `utils/linkificar.ts`) |
| `components/` | 16 / 49 | 15 / 48 | −1: SL-8 (`shared/Logo.tsx`) |
| `hooks/` | 2 / 3 | 2 / 3 | = |
| `public/` | 3 / 10 | 3 / 10 | = (`sw.js`, `offline.html`, etiquetas de capturas de `manifest.json`; `name`/`short_name` ya los dejó SL-8 en «Servi Logistic») |
| `scripts/` | 6 / 21 | 3 / 13 | −3: SL-11 (`seed-maestro.ts`, `seed-usuarios-qa.ts`) y SL-12 (`backfill-analitica.ts`). Quedan los tres de R12 |
| `db/schema.prisma` | 1 / 46 (+1 `ordx_`) | 1 / 46 (+1) | = |
| `db/migrations/` | 25 / 36 | 20 / 28 | −4 SL-11 (usuario maestro) y −1 SL-13 (`459` borrada). **Queda `20260827160000_orden_num_remision_unico_parcial/migration.sql:62`**: SL-13 solo limpió el integrador heredado de esa migración y la palabra sigue; SL-13 ya está integrada, así que pasa a SL-15 (T9). SL-15 tiene 20 archivos en 19 carpetas, no 19 en 18 |
| `.github/workflows/gate.yml` | 1 / 1 | 1 / 1 | = (línea 349) |
| `tests/` | 336 / 1.932 | 319 / 1.898 | −24 que limpiaron SL-8 (4), SL-12 (4) y SL-14 (16); +7 nuevos con la palabra que trajeron las fichas integradas: guardias `dominio-…-fuera` (SL-14), `fuera-datos-…` (SL-11), `sin-integrador-de-…` (SL-13), `backfills-retirados` (SL-12), `test-citado-desaparecido` y `catalogo-produccion` (SL-10), y `tests/baseline-rojos.json` |
| `e2e/` | 3 / 5 | 3 / 5 | = |
| Diseños (`design-*`, `DESIGN.md`, `.design-work/`) | — | 14 / 25 | No los medía design §1; son de SL-16 |
| `middleware.ts` (`ordx_`) | — | 1 | Solo `ordx_` |

Con `ordx_` incluido hay 661 archivos fuera de `specs/`, `docs/` y `progress/` (`ordx_`: 76 archivos,
64 de ellos en `tests/`; design decía 81 contando los ya limpiados). En las carpetas que la guardia
no lee: `specs/` 210, `docs/` 25, `progress/` 11.

Rutas con la palabra (fuera de `specs/`, `docs/`, `progress/`):
- `lib/utils/ingreso-….ts` → SL-15 (T7, glosario);
- `tests/unit/utils/ingreso-….test.ts` → la ruta es de SL-27 (P4); el contenido, de SL-15;
- `tests/unit/guards/dominio-…-fuera`, `fuera-datos-…` y `sin-integrador-de-…` (guardias nuevas de
  SL-14, SL-11 y SL-13) → la ruta es de SL-27; el contenido, de SL-15 (ver decisiones);
- `.design-work/landing-…-direcciones.html`, `design-notificaciones/notificaciones-….html` → SL-16.

### T1.2 Módulo de marca

`lib/config/marca.ts` (de SL-8) tiene la forma de design §3: `MARCA = { nombre: "Servi Logistic" }`
y `EMPRESA = { enFrase: "la empresa", alInicio: "La empresa", membrete: null as string | null }`,
con el comentario de transición a SL-17. No se tocó. `tests/unit/config/marca.test.ts` (de SL-8)
ya afirmaba los cuatro literales; solo se le añadió la referencia a SL-15 R1 en el comentario.

Mutaciones (una a una, restauradas con `git checkout`):

| Mutación en `lib/config/marca.ts` | Resultado |
|---|---|
| `nombre: "X"` | rojo (1 caso) |
| `enFrase: "la compañía"` | rojo |
| `alInicio: "La Empresa"` | rojo |
| `membrete: "ACME"` | rojo |

### T1.3 Patrón y guardia

- `tests/fixtures/nombre-heredado.ts`: `NOMBRE_HEREDADO` (cuatro formas armadas por partes),
  `PATRON_NOMBRE_HEREDADO` (sin `i` ni `g`) y `contieneNombreHeredado`.
- `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`: universo, alcances `archivo`, `prefijo`,
  `soloRuta` y `linea` (con `en` opcional), autocomprobación de design §7, regla de excepción sin
  uso y 640 entradas `retira: "SL-15"`, una por archivo pendiente.

Excepciones de otras fichas (todas con su uso comprobado por la guardia):

| Alcance | Retira |
|---|---|
| `design-notificaciones/`, `design-whatsapp/`, `DESIGN.md`, `.design-work/` | SL-16 |
| Líneas de `tests/` que nombran un archivo de `docs/` con la palabra en su nombre (`docs/limpieza-….md`, `…-api-key.postman_collection.json`) | SL-16 |
| `tests/unit/api/openapi-406-evidencias-url.test.ts` (afirma el YAML de `docs/api/`; es el único con el dominio `.co` que queda) | SL-16 |
| `tests/unit/asistente/contexto-457/458/460/461.test.ts` | SL-16 |
| Ruta de `tests/unit/utils/ingreso-….test.ts` | SL-27 |
| Rutas de las guardias `dominio-…-fuera`, `fuera-datos-…`, `sin-integrador-de-…` | SL-27 |

Decisiones:
1. **Sin excepción de SL-14, SL-11, SL-12 ni SL-13**: las cuatro fichas ya están integradas. Las
   líneas con el dominio `.co` que quedan son solo las de `openapi-406`, que la propia guardia de
   SL-14 atribuye a SL-16; se le da la misma ficha.
2. **Rutas de las tres guardias nuevas → SL-27, solo la ruta.** Las citan `specs/SL-11…`,
   `specs/SL-13…` y `specs/SL-14…` (y `specs/SL-8…`); renombrarlas pondría rojo
   `test-citado-desaparecido` y la anotación iría en un `specs/` ajeno (R18 lo prohíbe). Su sujeto
   es la herencia, y la decisión de SL-10 (requirements, 2026-10-21) asigna a SL-27 «las guardias
   cuyo sujeto es herencia». Mismo trato que P4: la ruta se queda, el contenido lo limpia SL-15.
3. **Línea `docs/limpieza-….md` de `no-embalaje` → SL-16**, como dice design §7 («la guardia de
   palabra prohibida de SL-10 R11»), aunque la nota de SL-10 hable de SL-27 para su alta en
   `no-embalaje`. Si SL-16 no renombra ese documento, la entrada pasará a SL-27 en esa ficha.
4. **Universo `git ls-files --cached --others --exclude-standard`** (design dice `git ls-files`):
   así un archivo nuevo sin commitear ya sale en rojo. Sigue dejando fuera `.worktrees/`,
   `node_modules/` y `.next/` (ignorados).
5. La entrada pendiente de la guardia `no-emb…` se escribe por partes: esa guardia marca su propio
   nombre en cualquier línea del repo.
6. Las rutas pendientes que llevan la palabra se escriben con `${n}` (`n = NOMBRE_HEREDADO.minusculas`),
   para que la guardia no se contenga a sí misma.

Comprobaciones de que salta (restauradas tras cada una):

| Mutación | Resultado |
|---|---|
| Quitar la pendiente `.github/workflows/gate.yml` | rojo: `R15 … .github/workflows/gate.yml:349` |
| Limpiar la palabra de `public/offline.html` (su excepción deja de cubrir) | rojo: «la excepcion «archivo public/offline.html» (retira SL-15) ya no cubre nada: bórrala» |
| `git ls-files` vacío (`.split("\0").slice(0, 0)`) | rojo: «ninguna excepcion sobra» y «la lectura del arbol no esta vacia» |
| Extra: bandera `i` en el patrón del fixture | rojo: autocomprobación de `OrdenExistente`, R17 y R15 |

### T1.4 `marca-estaticos`

`tests/unit/guards/marca-estaticos.guardia.test.ts`:
- R5: `app/`, `lib/`, `components/`, `hooks/` y `middleware.ts` (versionado y nuevo sin ignorar) sin
  `/Servi\s+Logistic/i`, salvo `lib/config/marca.ts`; autocomprobación (no marca `servi-logistic:`
  ni `servi_logistic`).
- R6: `manifest.name` y `short_name` iguales a `MARCA.nombre`, `description` lo contiene; las
  etiquetas de capturas, el `<title>` de `offline.html` y `TITULO_RESERVA` de `sw.js` están en
  `PENDIENTES_T2` (las cambia T2), y cada pendiente sale en rojo si ya no lleva el nombre heredado.

| Mutación | Resultado |
|---|---|
| `MARCA.nombre = "X"` | rojo: `manifest.name`, `short_name`, `description` y «el modulo de marca si contiene el literal» |
| `export const NOMBRE_A_MANO = "Servi Logistic";` al final de `lib/config/email.ts` | rojo: `lib/config/email.ts:146` |
| Archivo nuevo sin commitear `hooks/zz-mutacion.ts` con el literal | rojo |
| `<title>` de `offline.html` ya con «Servi Logistic» | rojo: «pendiente … quitala de PENDIENTES_T2» |

### Salidas

- `pnpm run typecheck` → `tsc --noEmit`, sin errores (exit 0).
- `pnpm run lint` → exit 0, `0 errors, 232 warnings`, ninguno en los archivos de T1
  (`eslint` sobre los cuatro: «No issues found»).
- `pnpm exec vitest run tests/unit/config/marca.test.ts tests/unit/guards/sin-nombre-heredado.guardia.test.ts tests/unit/guards/marca-estaticos.guardia.test.ts tests/unit/guards/no-embalaje.test.ts`
  → 4 archivos, 33 tests en verde.
- `pnpm exec vitest related --run tests/fixtures/nombre-heredado.ts lib/config/marca.ts` → 18
  archivos, 209 tests en verde.
- `pnpm exec vitest run guard` (todas las guardias, para ver el efecto de T1 en las demás): 6 rojos,
  ninguno de T1:
  - 4 de `dependencias-declaradas-presentes` (guardia 420): ya están en `tests/baseline-rojos.json`
    (los retira SL-29);
  - 1 de `dominio-…-fuera` (SL-14): **ya estaba rojo antes de T1**, comprobado con `git stash`.
    Lo causan líneas con el dominio `.co` en `specs/SL-15-nombre-ordenex-codigo/` (design 15, 41,
    244 y 259; requirements 36, 150 y 175; tasks 138 y 216). Ni el spec ni esa guardia son de esta
    tanda: **decide el leader**;
  - 1 de `no-embalaje`, que causaba la lista de pendientes y quedó arreglado (decisión 5).

### Excepciones retiradas en T1

Ninguna: T1 crea la lista.

### Mapa R → test (T1)

| R | Test |
|---|---|
| R1 | `tests/unit/config/marca.test.ts` |
| R5, R6 | `tests/unit/guards/marca-estaticos.guardia.test.ts` |
| R15, R16, R17, R20 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` |

**Veredicto T1:** módulo comprobado, patrón y guardia en verde con 640 pendientes y 14 excepciones
de otras fichas, `marca-estaticos` en verde; las mutaciones muerden. Queda un rojo previo ajeno
(`dominio-…-fuera` sobre el spec de SL-15) para el leader.

## Gate por tanda

- T1 (`f9f4202`): `TEST_RAPIDO_BASE=dev ./init.sh`, log `_trabajo/SL-15-gate-T1.log`: guardias `289 passed | 2 skipped (291)`, `3904 passed | 19 skipped (3923)`; «1 rojo(s) heredado(s) del baseline»; `== init OK ==`, `INIT_EXIT=0`. Antes de pasar: el spec citaba el dominio literal (rojo de la guardia de SL-14) y se reescribió en palabras (`592c4ce`); la bitácora nombraba al integrador heredado (rojo de la guardia de SL-13) y se corrigió.

## T2 (backend)

Parte de T2.1 de `lib/` y `app/api*`, y T2.2 parcial. La parte de componentes y `public/` es de frontend_dev.

**Producción** (pasan a `MARCA.nombre`, importado de `lib/config/marca.ts`):
- `lib/asistente/instrucciones.ts`: regla de design §3. El asistente y «entra a …» van con `MARCA`; la oficina
  (`maestro`, `admin`) y «le manda envíos a …» (`adminTienda`) van con `EMPRESA.enFrase`. La primera línea
  queda como el ejemplo de §3: «Sos el asistente de ayuda de Servi Logistic. Te pregunta alguien de una
  empresa de mensajería de Costa Rica que la usa.»
- `lib/services/email/plantillas/otp-codigo.ts`: texto y HTML (en el HTML, pasando por `escaparHtml`).
- `lib/config/email.ts`: `DEFAULT_FROM_NAME = MARCA.nombre`.
- `lib/utils/aviso-ubicacion-denegada.ts`: los cinco textos al usuario. Los comentarios pasan a «la app».
- `lib/interfaces/external/IAsistenteProvider.ts`: un comentario, que pasa a «la plataforma».
- `lib/api/openapi-spec.ts`: `info.title`, y dos comentarios («la plataforma ENVIA/entrega»).
- `app/api-docs/route.ts`: `<title>`.

**Decisión.** En `openapi-spec.ts` quedan 4 apariciones de otras tandas: dos `Bearer ordx_...` (T3) y dos
descripciones de clase B: «los CINCO conceptos que … factura» y «… puede retirar una provincia». Se dejan
porque el encargo acota este archivo a los títulos. El archivo sigue en la guardia.

**Tests** (R2, R19: afirman el literal «Servi Logistic», no `MARCA.nombre`):
- nuevo `tests/unit/api/titulo-marca-plataforma.test.ts`: `info.title` del OpenAPI y el `<title>` de `GET /api-docs`;
- `tests/unit/asistente/instrucciones.test.ts`: «entra a Servi Logistic como …» ×5, «oficina de la empresa»,
  y un caso nuevo con la línea del asistente, «envíos a la empresa» y la ausencia de «Servi Logistic, una empresa»;
- `tests/unit/services/email-notificacion.test.ts`: un caso nuevo con el texto y el HTML del OTP;
- `tests/unit/config/email-config.test.ts`: `fromName` por defecto;
- `tests/unit/utils/aviso-ubicacion-denegada.test.ts` y `tests/components/GestionarOrdenUbicacionContexto.test.tsx`:
  los literales de los avisos. En el componente también se limpian un comentario y el nombre de un `describe`
  («con la app instalada»);
- `tests/integration/asistente-route.test.ts`: «entra a Servi Logistic como …» ×2. No estaba en el encargo,
  pero lo puso rojo `vitest related`;
- `tests/unit/services/nodemailer-email-sender.test.ts`: `fromName` del fixture. Es un dato de entrada, no
  un contrato, y pasa a «Servi Logistic».

**Mutaciones:**
- `MARCA.nombre = "Mutante"`: 15 rojos en 6 de 7 archivos. El de nodemailer sigue verde, como se espera de
  un fixture. Restaurado.
- en `adminTienda`, `EMPRESA.enFrase` → `MARCA.nombre`: 1 rojo en `instrucciones.test.ts`. Restaurado.
- en el HTML del OTP, el literal heredado en lugar de `MARCA`: 1 rojo en `email-notificacion.test.ts`. Restaurado.

**Excepciones retiradas** de `PENDIENTES_SL15` (12): `app/api-docs/route.ts`, `lib/asistente/instrucciones.ts`,
`lib/config/email.ts`, `lib/interfaces/external/IAsistenteProvider.ts`,
`lib/services/email/plantillas/otp-codigo.ts`, `lib/utils/aviso-ubicacion-denegada.ts`,
`tests/components/GestionarOrdenUbicacionContexto.test.tsx`, `tests/integration/asistente-route.test.ts`,
`tests/unit/asistente/instrucciones.test.ts`, `tests/unit/config/email-config.test.ts`,
`tests/unit/services/nodemailer-email-sender.test.ts` y `tests/unit/utils/aviso-ubicacion-denegada.test.ts`.
Se queda `lib/api/openapi-spec.ts`. `email-notificacion.test.ts` no tenía entrada.

**Salida:**
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errores, 232 warnings, todos anteriores.
- `vitest related --run` de los 7 archivos de producción: 104 archivos. Al principio dio 1 rojo
  (`asistente-route`), ya arreglado.
- tests de contrato y guardia `sin-nombre-heredado`: verdes (35 tests en la última pasada de 3 archivos).
- `html-lang` y las guardias que leen estos archivos: 5 archivos, 48 tests en verde.

Veredicto: T2 backend hecho; la guardia está verde con 12 excepciones menos.

## T2 (frontend)

Parte de T2.1 de `components/` y `public/`, y T2.2 de esos archivos.

**Producción:**
- `components/shared/AvisoVersionNueva.tsx`: el `titulo` por defecto pasa a `` `Hay una versión nueva de ${MARCA.nombre}` ``.
- `components/shared/PushOptIn.tsx`: `TEXTOS.instalarTitulo` pasa a `` `Agrega ${MARCA.nombre} a tu pantalla de inicio` ``.
- `components/shared/AsistentePanel.tsx`: la `SheetDescription` y el texto de la conversación vacía usan `{MARCA.nombre}`.
- `app/(app)/_components/Sidebar.tsx`: no queda nada (SL-8 ya usa `MARCA.nombre`). No se toca.
- `public/sw.js`: solo `TITULO_RESERVA = "Servi Logistic"`. Los mensajes `MENSAJE_*`, el `tag` y su comentario
  son de T3.1 (design §5) y se quedan.
- `public/offline.html`: `<title>Servi Logistic — Sin conexión</title>`.
- `public/manifest.json`: las tres `label` de `screenshots`. Los colores y las demás claves no cambian.

**Tests** (R2, R6, R19: afirman el literal «Servi Logistic» escrito a mano):
- `tests/components/PushOptIn.test.tsx`: «Agrega Servi Logistic a tu pantalla de inicio» ×3.
- `tests/components/NotificationsBell.push.test.tsx`: el mismo literal ×1. No estaba en el encargo, pero lo puso
  rojo `vitest related`. Sus dos mensajes `…:push-recibido` y `…:relevo-ahora` son de T3, así que sigue en la guardia.
- `tests/unit/guards/pwa-push.guardia.test.ts`: el título de reserva «Servi Logistic» ×3. Los `tag` y el
  comentario del mensaje son de T3, así que sigue en la guardia.
- `tests/unit/guards/pwa-aviso-sin-recarga.guardia.test.ts` (G3): ahora afirma el título entero, «Hay una versión
  nueva de Servi Logistic». Antes solo afirmaba el comienzo, sin el nombre.
- `tests/components/AsistentePanel.test.tsx`: un caso nuevo con la descripción y la conversación vacía.
- `tests/unit/guards/marca-estaticos.guardia.test.ts`: `PENDIENTES_T2` queda vacía. Ahora las seis comprobaciones
  de R6 comparan con `MARCA.nombre`.
- Datos neutros (R20): en `pwa-manifiesto-atajos.guardia` los comentarios dicen «dos copias de la app», y el valor
  de ejemplo de `id` pasa a «servi-logistic». En `pwa-servida-sin-sesion.guardia`, el comentario de la medición dice
  «el despliegue de la app de origen en Vercel». Las aserciones no cambian.

**Mutaciones** (todas restauradas; `git diff` lo comprueba después):
- `AvisoVersionNueva`, `${MARCA.nombre}` → «Acme»: 1 rojo en `pwa-aviso-sin-recarga`.
- `PushOptIn`, ídem: 2 rojos en `PushOptIn.test.tsx`.
- `AsistentePanel`, la descripción → «Acme»: 1 rojo; la conversación vacía → «Acme»: 1 rojo.
- `sw.js`, `TITULO_RESERVA` → «Acme»: 4 rojos (`pwa-push` ×3 y `marca-estaticos` ×1).
- `offline.html`, `<title>` → «Acme»: 1 rojo en `marca-estaticos`.
- `manifest.json`, una `label` → «Acme»: 1 rojo en `marca-estaticos`.
- `offline.html`, el `<title>` con el nombre heredado: la guardia `sin-nombre-heredado` da rojo en `public/offline.html:7`.

**Excepciones retiradas** de `PENDIENTES_SL15` (8): `components/shared/AsistentePanel.tsx`,
`components/shared/AvisoVersionNueva.tsx`, `components/shared/PushOptIn.tsx`, `public/manifest.json`,
`public/offline.html`, `tests/components/PushOptIn.test.tsx`, `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
y `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`. Se quedan, por los restos de T3: `public/sw.js`,
`tests/unit/guards/pwa-push.guardia.test.ts` y `tests/components/NotificationsBell.push.test.tsx`.

**Salida:**
- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: 0 errores, 232 warnings, todos anteriores.
- `vitest related --run` de los 3 componentes: 53 archivos, 685 passed y 26 skipped. Al principio dio 1 rojo
  (`NotificationsBell.push`), ya arreglado.
- guardias `sin-nombre-heredado`, `marca-estaticos`, `pwa-push`, `pwa-manifiesto-atajos`, `pwa-servida-sin-sesion`
  y `pwa-aviso-sin-recarga`, más `tests/unit/pwa/manifest.test.ts`: 7 archivos, 114 tests en verde.

Veredicto: T2 frontend hecho; la guardia está verde con 8 excepciones menos y `PENDIENTES_T2` vacía.
- T2 (`72babd3`): log `_trabajo/SL-15-gate-T2.log`: relacionados `115 passed (115)`, `1526 passed | 26 skipped (1552)`; guardias `289 passed | 2 skipped (291)`; `== init OK ==`, `INIT_EXIT=0`.

## T3 (backend)

T3.2, T3.3 y T3.4 (clases C y C'). T3.1 queda para `frontend_dev`.

**Código:**
- T3.2 (R10): `lib/crypto/webhook-firma.ts` firma con `X-Servi-Logistic-Signature` y `X-Servi-Logistic-Timestamp`.
  `lib/api/openapi-spec.ts` las vuelve a documentar en `info.description`, interpoladas de las constantes del emisor.
  Hasta ahora no estaban en el contrato desde que el evento dejó de ser operación.
- T3.3 (R11): `API_KEY_PREFIX = "svl_"`, `PREFIX_VISIBLE_CHARS = API_KEY_PREFIX.length + 7` (11) y
  `WEBHOOK_SECRET_PREFIX = "svl_whsec_"`. El `Bearer` de `info.description` pasa a `svl_...`. Se cambiaron los
  comentarios de `middleware.ts`, de las tres rutas de `app/api/ordenes/api-key/**`, de `ApiKeyService`,
  `WebhookEstadoService`, `lib/types/api-key.ts` e `IApiKeyRepository`, y el único del prefijo anterior que había en
  `db/schema.prisma` (línea 2948, solo el comentario: ningún modelo, campo ni `@map` cambia).
- T3.4 (R12): `scripts/rollup-analitica-manual.ts` (`esDestinoLocalOrdenex` pasa a `esDestinoLocal`, según la
  excepción del glosario de design §3), `scripts/contraste-454.ts` (`/^servi_logistic(_…)?$/`) y `scripts/drenar-jobs.ts`
  aceptan `localhost:5432/servi_logistic`. En `tests/integration/db/*` no había ningún `DATABASE_URL` por defecto en
  código: `_postgres-real.ts` lee `.env`. Lo único que nombraba la base eran comentarios, en
  `analytics-daily-job`, `analytics-daily-migration`, `job-tipo-analitica-invalidacion-migration` y
  `job-tipo-analitica-rollup-migration`, y pasan a `servi_logistic`.

**Decisiones:**
- **El `Bearer` de la descripción de `evidenciasUrl` (`openapi-spec.ts`, ~línea 1131) se queda con el prefijo
  anterior.** Ese schema tiene paridad exacta con `docs/api/api-key-openapi.yaml`: lo comprueban
  `openapi-webhook-estado-actualizado` («paridad TS↔YAML») y `openapi-406-evidencias-url` («el espejo `.yaml`…»). Lo
  medí: cambiarlo pone las dos en rojo, y `docs/` no es de esta ficha. Por eso
  `openapi-webhook-contrato.test.ts:233` sigue afirmando ese literal. El spec de SL-16 ya reclama `openapi-spec.ts`
  junto con el `.yaml` (su decisión 2026-10-21 y su R16), así que lo tiene que cambiar esa ficha, en los dos lados a
  la vez. **El leader tiene que decidir** si la entrada `lib/api/openapi-spec.ts` (y la del test de contrato) pasa a
  `retira: "SL-16"`. Si no, SL-15 no puede cerrar con R16.
- Las cabeceras se documentan en `info.description` y no en el schema, por la misma paridad. `info.description` no
  tiene espejo comprobado: la suite `tests/unit/api` entera sigue en verde.
- `scripts/contraste-454.ts` y `scripts/drenar-jobs.ts` no exportan su guarda y ejecutan `main()` al importarse.
  Testearlas pedía cambiar su estructura, así que R12 queda cubierto por `esDestinoLocal`. Las otras dos guardas
  quedaron verificadas por lectura.
- Datos de prueba (R20): el prefijo anterior pasa a `svl_` en 62 archivos de `tests/`. Así, por ejemplo, el
  `keyPrefix` de 12 caracteres queda en 11 (`svl_` + 7), que es la regla nueva. Tres sitios afirmaban la longitud y
  cambian al literal 11: `api-key-service.test.ts`, en dos casos (`slice(0, 11)`), y el nombre del caso R17 de
  `api-key-generator`. La URL de prueba de `webhook-sender` pasa a `/hooks/pedidos`.
- El caso de R11 en `api-key-auth-service.test.ts` arma la key con el prefijo anterior desde
  `NOMBRE_HEREDADO.prefijoLlave` (R17/R20) y usa el mismo secreto que la key viva. Un repo que solo conoce el hash de
  la key viva comprueba que da `unauthenticated` y que el resultado es igual al de una key desconocida.

**Mapa R → test (T3 backend):**
- R10 → `tests/unit/crypto/webhook-firma.test.ts` (literales y claves exactas de `cabecerasFirma`);
  `tests/unit/api/openapi-webhook-estado-actualizado.test.ts` («SL-15 R10», que también afirma que no hay otra
  cabecera de firma). Además `webhook-sender`, `webhook-estado-service` y `WebhookEventoOrdenService` afirman las
  cabeceras nuevas.
- R11 → `tests/unit/utils/api-key-generator.test.ts` (`"svl_"` y 11); `tests/unit/utils/api-key-hash.test.ts`;
  `tests/unit/services/api-key-auth-service.test.ts` («SL-15 R11»); `openapi-webhook-estado-actualizado.test.ts`
  («SL-15 R11», `Bearer svl_...`). Los tests de ruta de API key también usan `svl_`.
- R12 → `tests/unit/services/analitica-rollup-handler.test.ts` (acepta `servi_logistic`, rechaza la base local
  anterior y los hosts remotos).

**Mutaciones** (con `mut.sh`, que restaura siempre; lo comprobé después con `git grep`):
- `API_KEY_PREFIX` vuelve al prefijo anterior: 3 rojos (generator y hash).
- `PREFIX_VISIBLE_CHARS = 12`: 3 rojos (generator y `api-key-service`).
- `WEBHOOK_SIGNATURE_HEADER` → `X-Svl-Signature`: 8 rojos (firma, sender, los dos servicios y el OpenAPI).
- `ApiKeyAuthService` normaliza el prefijo anterior al nuevo antes del hash: 1 rojo (el caso R11).
- `esDestinoLocal` también acepta la base anterior: 1 rojo.
- `info.description` gana un `X-Webhook-Signature`: 1 rojo («ninguna otra cabecera de firma»).
- `info.description` sin `Bearer svl_...`: 1 rojo.

**Salidas:**
- `pnpm run typecheck`: `tsc --noEmit` sin errores.
- `pnpm run lint`: 0 errores, 232 warnings. Ninguno está en una línea tocada: los de los tests tocados son `_args`/`_u`
  anteriores.
- `vitest related --run` sobre los 86 archivos tocados: `Test Files 262 passed | 7 skipped (269)`,
  `Tests 3690 passed | 75 skipped (3765)`. La primera pasada dio 2 rojos en `api-key-service.test.ts`, por
  `slice(0, 12)`, ya corregidos. Los 7 archivos saltados no los identifiqué uno a uno.
- `tests/unit/api` entero, más `openapi-canal-rutas-reales` y las dos guardias de frontera: en verde, una vez revertida
  la línea de `evidenciasUrl`.
- La guardia `sin-nombre-heredado`: 13 passed.

**Excepciones retiradas** de `PENDIENTES_SL15` (83). Son 14 de código: `app/api/ordenes/api-key/{analitica/,carga/,}route.ts`,
`lib/crypto/webhook-firma.ts`, `lib/interfaces/repositories/IApiKeyRepository.ts`, `lib/services/ApiKeyService.ts`,
`lib/services/WebhookEstadoService.ts`, `lib/types/api-key.ts`, `lib/utils/api-key-generator.ts`,
`lib/utils/webhook-secret-generator.ts`, `middleware.ts` y `scripts/{contraste-454,drenar-jobs,rollup-analitica-manual}.ts`.
Las otras 69 son de `tests/`: los de API key, webhooks, rutas e integración que solo tenían el prefijo o las cabeceras,
y los 4 de `tests/integration/db` con la base local. Se quedan porque les quedan restos de otras tandas:
`db/schema.prisma` (T8), `lib/api/openapi-spec.ts` (ver decisión), `tests/unit/api/openapi-webhook-contrato.test.ts` y
`tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`.

Veredicto: T3 backend hecho; typecheck, lint, related y guardia en verde; queda abierta la paridad con el YAML de `evidenciasUrl`, que es de SL-16.
- Decisión del implementer (T3): el `Bearer` con el prefijo viejo en la descripción de `evidenciasUrl` (`lib/api/openapi-spec.ts`) tiene que ser idéntico a su copia en `docs/api/api-key-openapi.yaml`, que es de SL-16 (su R16 pide cambiar los dos a la vez) y `docs/` queda fuera de SL-15. Opción mínima: esa aparición, y la aserción de `openapi-webhook-contrato.test.ts` que la fija, pasan a `retira: "SL-16"` en T11.

## T3 (frontend)

T3.1 (R9, design §5): prefijo `servi-logistic:` en almacenamiento, eventos, mensajes del service
worker y `tag` de las notificaciones; cookie de tema `servi_logistic_tema`.

**Hecho.**
- Producción (12): `public/sw.js` (3 mensajes + `tag: "servi-logistic:" + evento`),
  `lib/pwa/actualizacion.ts` (los mismos 3 mensajes), `lib/tema/tema.ts` (`COOKIE_TEMA`),
  `lib/audio/preferencia-sonido.ts`, `lib/utils/preferencia-navegacion.ts`,
  `lib/manifiesto/preferencia-columnas.ts`, `lib/columnas/preferencia-columnas.ts`,
  `hooks/usePreferenciaSonido.ts`, `hooks/usePreferenciaColumnas.ts`,
  `components/shared/RevisionSinpeBodega.tsx`, y los comentarios de
  `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts` y
  `app/(app)/cierres-admin/_components/cierres-bodega-descarga-columnas.ts`.
- Tests (18): los de contrato afirman el literal nuevo (R19): `pwa-relevo-y-purga.guardia`,
  `pwa-push.guardia` (tags), `usePushEnVentana`, `useTonoAlIncrementar`, `NotificationsBell.push`,
  `NotificationsBell`, `ChatNoLeidos`, `AppLayout` (cookie), `preferencia-columnas` del manifiesto,
  `orden-efectivo`, `ColumnasPopoverReordenar`, `DescargarManifiestoColumnas`,
  `OrdenesDescargaColumnas`, `DescargarCoberturaButton`, y las claves de
  `descarga/CierresDescargaColumnas`, `CierresDescargaNiveles` y `ProductosDescargaColumnas`.
  `tema-encendido.guardia`: el nombre de la cookie, que se armaba por partes, pasa a literal
  `"servi_logistic_tema"`.

**Decisiones.**
- Reemplazo mecánico de `ordenex:` solo cuando NO le sigue un espacio (así no toca las claves de
  objeto `ordenex: …` del dinero y la wallet, que son de T4) y de `ordenex_tema`.
- design §2 (clase C) dice «nada que migrar»: no hay purga ni lectura de respaldo de las claves
  viejas en el navegador. No se añadió ninguna.
- `pwa-relevo-y-purga.guardia`: el host de ejemplo de los dobles del SW (era el nombre heredado
  con `.app`, no el dominio de la marca anterior) pasa a `app.ejemplo.test`. Es dato neutro (R20);
  el SW solo distingue `localhost`/`127.0.0.1`, que no cambian. Con eso el archivo queda limpio.
- `hooks/usePreferenciaColumnas.ts`: el comentario histórico del evento antiguo queda como
  `` `…:manifiesto-columnas-cambio` `` (ese nombre nunca existió con el prefijo nuevo).

**Mutaciones (cada una revertida tras medir).**
| Mutación | Tests | Resultado |
|---|---|---|
| `tag` del SW a `mutado:` | `pwa-push.guardia` | rojo |
| `MENSAJE_PUSH_RECIBIDO` del SW a `mutado:` | `pwa-relevo-y-purga` + `pwa-push` | rojo (1 de 2) |
| `MENSAJE_PUSH_RECIBIDO` de `actualizacion.ts` | `usePushEnVentana` + `NotificationsBell.push` | rojo (2 de 2) |
| `COOKIE_TEMA` a `mutado_tema` | `AppLayout` | rojo |
| prefijo del manifiesto | `preferencia-columnas` (manifiesto) | rojo |
| `CLAVE_SONIDO` | `NotificationsBell` + `ChatNoLeidos` | rojo (2 de 2) |
| prefijo de descarga | `orden-efectivo` | verde (sobrevive: sus claves son datos de entrada) |
| prefijo de descarga | `OrdenesDescargaColumnas` + `DescargarCoberturaButton` | rojo (2 de 2) |
| `app/layout.tsx` con `"servi_logistic_tema"` | `tema-encendido.guardia` | rojo |

**Excepciones retiradas de `sin-nombre-heredado` (26, `retira: "SL-15"`).** Los 12 de producción
de arriba y: `tests/components/AppLayout.test.tsx`, `ChatNoLeidos.test.tsx`,
`ColumnasPopoverReordenar.test.tsx`, `DescargarManifiestoColumnas.test.tsx`,
`NotificationsBell.push.test.tsx`, `NotificationsBell.test.tsx`, `OrdenesDescargaColumnas.test.tsx`,
`tests/unit/app/tarifas/DescargarCoberturaButton.test.tsx`, `tests/unit/columnas/orden-efectivo.test.ts`,
`tests/unit/guards/pwa-push.guardia.test.ts`, `tests/unit/guards/pwa-relevo-y-purga.guardia.test.ts`,
`tests/unit/hooks/usePushEnVentana.test.tsx`, `tests/unit/hooks/useTonoAlIncrementar.test.tsx`,
`tests/unit/manifiesto/preferencia-columnas.test.ts`. Siguen pendientes (T4, DTO `IngresoOrdenex`
y `liquidado.ordenex`): los tres de `tests/components/descarga/`.

**Salida.**
- Guardia `sin-nombre-heredado`: 1 archivo, 13 tests, verde.
- `vitest related --run` (lo tocado + las dos guardias PWA): 330 archivos, 4662 passed, 26 skipped, EXIT=0.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0 (0 errores, 232 warnings preexistentes).

**Veredicto:** T3.1 hecha; R9 con sus dos extremos cambiados a la vez y afirmados como literal.
- T3 (`18160d9`): log `_trabajo/SL-15-gate-T3.log`: relacionados `463 passed | 7 skipped (470)`, `6512 passed | 101 skipped (6613)`; guardias `289 passed | 2 skipped (291)`; `== init OK ==`, `INIT_EXIT=0`.

## T4 (backend)

**Alcance medido.** De la lista de T4.1 en `lib/`, solo dos archivos tienen texto visible con el
nombre: `lib/constants/wallet-rotulos.ts` y `lib/constants/origen-legible-rotulos.ts`. El resto
(`lib/utils/estado-cuenta*.ts`, `lib/utils/descripcion-*.ts`, `lib/types/wallet*.ts`,
`lib/actions/{wallet*,abono-tienda,estado-cuenta}.ts`) solo lo lleva en comentarios (T8) o en
identificadores (`deOrdenex`, `"solo_ordenex"`: T7). No se tocaron.

**Hecho.**
- `wallet-rotulos.ts`: `CATEGORIA_LABEL`, `ORIGEN_LABEL`, `ORIGEN_TIENDA_LABEL` y `ORIGEN_PAGO_LABEL`
  interpolan `EMPRESA` en el mismo `Record` (`alInicio` a inicio de frase, `enFrase` dentro). Los
  comentarios del archivo, triviales, pasan a «la empresa»: el archivo queda limpio.
- `origen-legible-rotulos.ts`: `gastoDeOrdenex` y `gastoFijo` con `EMPRESA.enFrase`. La clave
  `gastoDeOrdenex` se queda (identificador, T7), así que el archivo sigue en la guardia.
- Tests de contrato (R19) con el literal nuevo («La empresa le cobra a una tienda», «Pago de la
  empresa a una tienda», «Gasto de la empresa»…), solo donde el valor sale de esos dos módulos:
  20 archivos de `tests/` + `tests/integration/db/cobro-tienda-461.test.ts:114` (no corre sin base).
  En los tests mixtos (`wallet-conceptos-manuales`, `wallet-registrar-movimiento-dialog`,
  `nombres-wallet-461`, `DesgloseTiendaAbono457`) solo cambió la parte de lib; los rótulos propios de
  `app/` (nombre del concepto del diálogo, libro de la tienda «Ordenex le paga a la tienda»,
  `TIPO_EGRESO_MANUAL_LABEL`) siguen con el literal viejo para frontend.
- Datos neutros (R20) sin tocar: la fuente ficticia de `nombres-wallet-461` (líneas «y NO ladra»),
  los `origen.texto` de entrada en `EstadoCuenta458DPantalla` y `mi-wallet-page`.

**Quedan 3 rojos que cierra frontend (contrato ya escrito, valor de `app/` aún viejo).**
- `wallet-labels.test.ts` «el tipo de egreso manual se llama «Gasto de la empresa»»: espera
  `TIPO_EGRESO_MANUAL_LABEL.gasto_variable` (app) = «Gasto de la empresa» = `CATEGORIA_LABEL`.
- `nombres-wallet-461` (2 casos): «Una tienda le paga a la empresa» debe ser a la vez
  `CATEGORIA_LABEL.ingreso_abono_tienda` y `CONCEPTOS_MANUALES.label.abono_tienda` (app).
- Aviso a frontend: `WalletFechaCostaRica459` afirma ahora «Órdenes que componen La empresa le paga a
  un mensajero del …»: la mayúscula a mitad de frase sale de interpolar el concepto en `app/`; si se
  quiere minúscula, es cosa de esa composición.

**T4.2.** `wallet-labels.test.ts` prueba `app/(app)/wallet/_components/wallet-labels.ts`: el caso con
`vi.mock` de `lib/config/marca.ts` queda para frontend, como pide la tanda.

**Mutaciones (revertidas tras medir).**
| Mutación | Tests | Resultado |
|---|---|---|
| `ingreso_cobro_tienda` vuelve al literal con el nombre heredado + `gastoDeOrdenex` igual | `wallet-labels` + `wallet-origen-legible` | rojo (5 de 31, 2 de 2 archivos) |

**Excepciones retiradas de `sin-nombre-heredado` (5).** `lib/constants/wallet-rotulos.ts`,
`tests/components/DetalleMovimientoCierre.test.tsx`, `tests/components/WalletFechaCostaRica459.test.tsx`,
`tests/unit/components/wallet-indemnizacion-libro.test.tsx`, `tests/unit/guards/incidente-exhaustividad.test.ts`.

**Salida.**
- Guardia `sin-nombre-heredado`: 13 passed.
- `vitest related --run` de los dos módulos: 268 archivos, `3 failed | 3242 passed | 288 skipped`
  (los 3 de arriba, de frontend).
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0 (0 errores, 232 warnings preexistentes).

**Veredicto:** T4.1 backend hecha; quedan 3 rojos de contrato que cierra el lado `app/` de T4.1.

## T4 (frontend)

**Alcance.** Todo `app/(app)/wallet/**`, `app/(app)/mi-wallet/**`, `components/shared/wallet/**`,
`components/shared/estado-cuenta/**` y `components/shared/sinpe-textos.ts`: 40 archivos con la palabra.

**Hecho.**
- Textos visibles (clase B): cada literal que nombra a la empresa interpola `EMPRESA` en el mismo
  `Record`/constante (`alInicio` al inicio de frase, `enFrase` dentro). `DUENO_LABEL.propio` y
  `PANEL_TEXTO.esOrdenex` valen `EMPRESA.alInicio`. Ningún texto de dinero usa `MARCA`.
- B' (ejemplo): el placeholder SINPE pasa a «Ej: Mensajería Ejemplo CR S.A.», literal.
- La descripción de `/wallet` pasa a plantilla (`description={`…`}`).
- Comentarios: los de los archivos editados que solo nombraban a la empresa pasan a «la empresa»
  (triviales). Los identificadores (`esOrdenex`, `deOrdenex`, `ordenexCobra`, `"solo_ordenex"`,
  `"gasto_ordenex"`, `data-bolsillo="ordenex"`, `ORDENEX_NEUTRO`…) se quedan: son T7.
- Se cierran los 3 rojos que dejó backend (`wallet-labels` «Gasto de la empresa», y los 2 de
  `nombres-wallet-461` con «Una tienda le paga a la empresa»).

**Decisiones.**
- **Mayúscula a mitad de frase (el aviso de backend).** Los nombres accesibles que meten el concepto de
  la fila dentro de una frase lo citan ahora entre «»: «Órdenes que componen «La empresa le paga a un
  mensajero» del …». El concepto se cita tal como se lee en la fila, y el defecto se va también en los
  conceptos que ya iban con mayúscula («Flete cobrado…»). Mismo criterio que ya usaban
  `VerMovimientoCaja` y el rótulo del comprobante. Funciones tocadas: `DETALLE_MOVIMIENTO_NOMBRE` y
  `DETALLE_MI_MOVIMIENTO_NOMBRE` (las 5 claves de cada una), `PANEL_TEXTO.verNombre`/`verNombreAnulado`,
  `DOCUMENTO_CAJA_ACCION.anularNombre`/`verComprobanteNombre` y `BUSQUEDA_POR_GUIA_TEXTO.bloque`. Bajar a minúscula se
  descartó: «Órdenes que componen la empresa le paga…» se lee igual de mal.
- `mi-wallet-labels` R45 («la pista de Cargos usa la MISMA palabra que la fila»): la fila empieza frase
  («La empresa te cobró») y la pista la lleva dentro («lo que la empresa te cobró»), así que se compara
  sin distinguir mayúsculas. Sigue siendo una relación entre dos valores, no un valor contra su fuente.
- `wallet-textos-458` T9: el patrón leía solo `description="…"`; con la plantilla habría quedado ciego.
  Lee ahora las dos formas, y la contraprueba suma la forma de plantilla.
- Guardias de textos retirados (`caja-textos-459`, `nombres-wallet-461`): los nombres y fragmentos
  retirados que llevaban la palabra («Cobro de …», «porque de este dinero … todavía», «Pago a … anulado»)
  se reescriben con «la empresa», junto con sus fuentes ficticias y contrapruebas. Así la guardia sigue
  cazando el mismo texto con el nombre de hoy.
- Datos de entrada (R20) en los tests tocados (`origen.texto`, `dueno`): pasan a «la empresa», igual que
  su aserción. No cambia lo que comprueban.

**T4.2 (R4).** `vi.doMock` + `vi.resetModules` + `import()` dinámico, solo dentro de su `describe`, para
no tocar los literales del resto del archivo (R19). El mock pone «Acme Envíos» en las tres formas.
- `tests/unit/components/wallet-labels.test.ts` «SL-15 R4 …»: 7 rótulos concretos con el nombre, más un
  barrido de los textos de 11 módulos de rótulos de la wallet (>300 textos, >50 con «Acme Envíos») que
  exige que ninguno diga «la empresa» a mano.
- `tests/components/EstadoCuenta.test.tsx` «SL-15 R4 …»: monta el estado de cuenta real de una tienda. La
  tarjeta, el «Ver» y el panel dicen «Acme Envíos», y el documento no contiene «la empresa».

**T4.3 (R21).** `tests/integration/wallet-page.test.tsx` y `tests/integration/mi-wallet-page.test.tsx`
montan la página real con el módulo REAL. Cada una tiene 3 casos: sin el patrón de `nombre-heredado.ts`;
sin «Servi Logistic»; y con «la empresa» en sitios concretos (descripción y región «Ganancia de la
empresa»; tarjeta «La empresa te debe ₡28.800», filas «La empresa te cobró el flete» y «La empresa te
pagó»). Se lee el texto y los nombres accesibles (`aria-label`, `title`, `placeholder`, `alt`) con el
helper nuevo `tests/fixtures/texto-leible.ts`. Los `data-*` no se leen: son técnicos (T7).

**Mutaciones (script en el scratchpad, cada archivo restaurado tras medir).**
| Mutación | Tests | Resultado |
|---|---|---|
| M1 `CAJA_RESUMEN_LABEL.ganancia` con el nombre heredado | wallet-page + wallet-labels | rojo 4/31: R21 «sin nombre heredado», R21 «dice la empresa», R4 barrido, R53 de la 458-E |
| M2 la misma, con «Servi Logistic» | wallet-page | rojo 3/16: R21 «sin Servi Logistic», R21 «dice la empresa», R53 |
| M3 la misma, «Ganancia de la empresa» escrita a mano | wallet-labels + wallet-page | rojo 1/31: R4 barrido (las de página siguen verdes, como debe ser) |
| M4 `fraseDelSaldo` con «La empresa le debe…» a mano | EstadoCuenta | rojo 1/21: R4 |
| M5 `CATEGORIA_MI_WALLET_LABEL.flete` con el nombre heredado | mi-wallet-page | rojo 4/42: R21 «sin nombre heredado», R21 «dice la empresa», + 2 previos |
| M6 la misma, con «Servi Logistic» | mi-wallet-page | rojo 4/42: R21 «sin Servi Logistic», R21 «dice la empresa», + 2 previos |

**Mapa R → test (esta parte).**
- R3 (wallet): los tests de contrato con el literal nuevo: `wallet-labels`, `mi-wallet-labels`,
  `wallet-conceptos-manuales`, `wallet-registrar-movimiento-dialog`, `desglose-tienda-labels`,
  `saldo-tienda-card.negativo`, `wallet-textos-458`, `caja-textos-459`, `nombres-wallet-461` y los
  componentes de la wallet (`CajaResumenCard`, `CajaComposicionBarra`, `ComposicionGananciaCard`,
  `DetalleFilaComposicion`, `DetalleMovimientoCierre`, `DetalleMiMovimientoCierre`, `EstadoCuenta*`,
  `WalletLedger*`, `MiWalletComprobante458`, `PagoMensajeroAcciones`, …).
- R4: `wallet-labels.test.ts` y `EstadoCuenta.test.tsx`, describe «SL-15 R4».
- R21: `wallet-page.test.tsx` y `mi-wallet-page.test.tsx`, describe «SL-15 R21».
- R19/R20: las aserciones van con el literal escrito («La empresa …»), nunca leído de `EMPRESA`.

**Salida.**
- Guardia `sin-nombre-heredado`: 13 passed.
- `vitest related --run` sobre los 91 archivos tocados más el fixture nuevo: 136 archivos,
  `2014 passed | 17 skipped`, 0 failed (incluidos los 3 rojos que dejó backend).
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0 (0 errores, 232 warnings preexistentes).
- MCP del grafo: no se usó; la exploración fue con Grep/Read.

**Excepciones retiradas de `sin-nombre-heredado` (53).**
- `app/` y `components/` (31): `app/(app)/mi-wallet/_components/MiEstadoCuenta.tsx`, `app/(app)/mi-wallet/_components/ResumenMiWallet.tsx`, `app/(app)/mi-wallet/_components/VerComprobanteMiMovimiento.tsx`, `app/(app)/mi-wallet/_components/mi-estado-cuenta-descarga-columnas.ts`, `app/(app)/mi-wallet/_components/mi-estado-cuenta-labels.ts`, `app/(app)/mi-wallet/_components/mi-wallet-labels.ts`, `app/(app)/mi-wallet/page.tsx`, `app/(app)/wallet/_components/ComposicionGananciaCard.tsx`, `app/(app)/wallet/_components/DesgloseEgresosLista.tsx`, `app/(app)/wallet/_components/DetalleFilaComposicion.tsx`, `app/(app)/wallet/_components/FilaComposicion.tsx`, `app/(app)/wallet/_components/WalletLedger.tsx`, `app/(app)/wallet/_components/WalletModule.tsx`, `app/(app)/wallet/_components/composicion-detalle-labels.ts`, `app/(app)/wallet/mensajeros/_components/EstadoCuentaMensajero.tsx`, `app/(app)/wallet/mensajeros/_components/estado-cuenta-mensajero-labels.ts`, `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`, `app/(app)/wallet/page.tsx`, `app/(app)/wallet/satelites/_components/satelites-labels.ts`, `app/(app)/wallet/satelites/page.tsx`, `app/(app)/wallet/tiendas/_components/EstadoCuentaTienda.tsx`, `app/(app)/wallet/tiendas/_components/PagosTiendaEstadoCuenta.tsx`, `app/(app)/wallet/tiendas/_components/SaldosTiendasTable.tsx`, `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts`, `components/shared/estado-cuenta/TarjetasEstadoCuenta.tsx`, `components/shared/estado-cuenta/estado-cuenta-descarga-columnas.ts`, `components/shared/estado-cuenta/estado-cuenta-lineas.ts`, `components/shared/sinpe-textos.ts`, `components/shared/wallet/RegistrarMovimientoDialog.tsx`, `components/shared/wallet/conceptos-filtro.ts`, `components/shared/wallet/registrar-movimiento-labels.ts`
- `tests/` (22): `tests/components/DesgloseTiendaAbono457.test.tsx`, `tests/components/DetalleMiMovimientoCierre.test.tsx`, `tests/components/EstadoCuenta458DPantalla.test.tsx`, `tests/components/EstadoCuentaAnulados.test.tsx`, `tests/components/EstadoCuentaMensajeroAnular.test.tsx`, `tests/components/MiWalletComprobante458.test.tsx`, `tests/components/PagoMensajeroAcciones.test.tsx`, `tests/components/PagosTiendaEstadoCuenta.test.tsx`, `tests/components/ResumenMiWallet.test.tsx`, `tests/components/WalletCuentasPorPagarRefrescoP1.test.tsx`, `tests/components/WalletLedgerAcciones459.test.tsx`, `tests/components/WalletLedgerAcciones461.test.tsx`, `tests/integration/wallet-satelites.test.tsx`, `tests/unit/components/desglose-tienda-ledger.test.tsx`, `tests/unit/components/mi-wallet-labels.test.ts`, `tests/unit/components/wallet-labels.test.ts`, `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`, `tests/unit/descarga/estado-cuenta-descarga-columnas.test.ts`, `tests/unit/descarga/libro-kardex-468.test.ts`, `tests/unit/descarga/wallet-tienda-descarga-columnas.test.ts`, `tests/unit/guards/nombres-wallet-461.guardia.test.ts`, `tests/unit/guards/wallet-textos-458.guardia.test.ts`

Siguen en la guardia (solo por identificadores, T7): `BarraComposicionCaja`, `CajaResumenCard`,
`libro-caja-labels`, `wallet-conceptos-manuales`, `wallet-labels`, `EstadoCuentaAcciones`,
`estado-cuenta-tienda-labels`, `EstadoCuenta.tsx`, `estado-cuenta-labels`, `DetalleMovimientoPanel`,
`detalle-movimiento-panel-labels`.

**Veredicto:** T4.1 (frontend), T4.2 y T4.3 hechas; la wallet nombra a la empresa con `EMPRESA`, R4 y
R21 muerden (6 mutaciones en rojo) y todo lo relacionado está verde.
- Sincronización con `dev` (`35f88b1`, trae SL-34): merge `102871d`. Conflicto trivial de comentario en `pwa-servida-sin-sesion.guardia.test.ts`, resuelto con el lado de `dev`. La guardia `sin-nombre-heredado` vio dos archivos nuevos de SL-34 (`_terminos-por-hash.ts`, `recursos-origen-fuera.guardia.test.ts`): entran como pendientes SL-15 para T10 (`57abf97`). La guardia de SL-34 marcó el nombre del integrador en el spec de SL-15: reescrito con el marcador «el integrador» (`b150709`).
- T4 (`b150709`): log `_trabajo/SL-15-gate-T4.log`: relacionados `529 passed | 48 skipped (577)`, `7410 passed | 372 skipped (7782)`; guardias `290 passed | 2 skipped (292)`, `3944 passed | 20 skipped (3964)`; `== init OK ==`, `INIT_EXIT=0`.

## T5 (backend)

**Alcance medido.**
- `lib/analytics/metrics.ts`: 1 `etiqueta` («Ganancia de …») y 5 `descripcion` (`ingreso_flete`,
  `ingreso_comision_cod`, `dinero_en_caja`, `ganancia_ordenex`, `cuenta_por_pagar_tienda`) nombraban a
  la empresa.
- Servicios de cierre (`CierreDiaService`, `CierresAdminService`, `CierresBodegaAdminService`;
  revisados también `CierreBodegaService` y el resto de `lib/services/` con la palabra): **no
  componen ningún texto visible con el nombre**. Solo lo llevan en identificadores
  (`ingresoOrdenex`, `gananciaOrdenex`, `netoOrdenex`, el import de `lib/utils/ingreso-…`: T7) y en
  comentarios (T8). No se tocaron. Los mensajes de error de `AbonoTiendaService` («pago de una tienda
  a …») no son de cierre: quedan para T6 («el resto»).

**Hecho.**
- `metrics.ts` importa `EMPRESA` de `lib/config/marca.ts` (módulo puro: `modulo-puro.guardia` verde)
  y las 6 cadenas pasan a plantilla con `EMPRESA.enFrase` (ninguna empieza frase). Nunca `MARCA`.
- El `id` `ganancia_ordenex` y su cita literal dentro de la descripción de `dinero_en_caja`
  («eso es ganancia_…») se quedan: son identificador (T7).
- Comentarios triviales del mismo archivo (6 líneas) pasan a «la empresa». La cabecera (línea 9) cita
  el id y se queda.

**Tests (R3/R19, contrato con el literal nuevo).**
- `tests/unit/analytics/etiquetas-visibles.guardia.test.ts`: «Ganancia de la empresa».
- `tests/unit/analytics/metrics.test.ts` «SL-15 R3 …»: la etiqueta y las 5 descripciones con
  «la empresa», escritas a mano; y ningún texto del catálogo con el nombre heredado ni «Servi
  Logistic» (se tapan antes los `id` del catálogo: la cita del id es T7 y no es prosa).
- `tests/unit/analytics/kpis-financieros.test.ts:270`: «ya descontado lo de la empresa». **Rojo para
  frontend**: el valor sale de `app/(app)/analitica/_components/finanzas/cargar-kpis.ts:85`
  (`porPagarTiendas`), que sigue con el nombre heredado.
- Tests de servicios de cierre: no hay literal que cambiar (solo `ingresoOrdenex: null`, identificador).

**T5.2 (R4), parte de `metrics.test.ts`.** «SL-15 R4 …»: `vi.doMock` de `@/lib/config/marca` con
«Acme Envíos» en las tres formas, `vi.resetModules` e `import()` dinámico dentro de su `describe`.
Afirma «Ganancia de Acme Envíos», la descripción de `cuenta_por_pagar_tienda`, 50 textos leídos, 6 con
«Acme Envíos» (a mano) y ninguno con «la empresa». El caso de `CierreBodegaDetalleCascadas.test.tsx`
es de frontend.

**Mutaciones (sobre `metrics.ts`, restaurado desde copia tras cada una).**
| Mutación | Tests (metrics + etiquetas-visibles) | Resultado |
|---|---|---|
| M1 etiqueta con el nombre heredado escrito a mano | 49 | rojo 4: etiquetas-visibles, R3 literal, R3 ausencia, R4 |
| M2 etiqueta «Ganancia de la empresa» escrita a mano | 49 | rojo 1: R4 |
| M3 «lo que la empresa le debe entregar» a mano en `cuenta_por_pagar_tienda` | 49 | rojo 1: R4 |
| M4 «Ingreso de Servi Logistic por comision» | 49 | rojo 3: R3 literal, R3 ausencia, R4 |

**Excepciones retiradas de `sin-nombre-heredado`: ninguna.** Los 4 archivos tocados siguen con el
id `ganancia_…` (y `deOrdenex` en `kpis-financieros`): T7.

**Salida.**
- Guardia `sin-nombre-heredado`: 13 passed.
- `vitest related --run` (metrics.ts + los 3 tests): 222 archivos, `1 failed | 2624 passed | 192
  skipped`; el rojo es `kpis-financieros` «la pista de «Por pagar a tiendas»…» (frontend, arriba).
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0 (0 errores, 232 warnings preexistentes).

**Para frontend (T5.1 `app/`).** Cerrar el rojo de `kpis-financieros` en `cargar-kpis.ts:85`. Los
tests de componentes con «Ganancia de …» (`TableroFinanciero`, `DineroIdentidadesEnPantalla`…) siguen
verdes porque leen textos de `app/`: revisarlos al pasar `app/(app)/analitica/**`.

**Veredicto:** T5.1 backend hecha (métricas; los servicios de cierre no tenían texto visible); 1 rojo
de contrato que cierra frontend.

## T5 (frontend)

**Alcance medido.** Textos visibles que nombran a la empresa en `app/(app)/cierres-admin/**`,
`app/(app)/cierre-dia/**` y `app/(app)/analitica/**`: 22 cadenas en 8 archivos. En `cierre-dia/**`
no hay ninguna (solo comentarios: T8). El resto de apariciones son identificadores (T7:
`TotalesIngreso…`, `netoOrdenex`, `NETO_ORDENEX_*`, la clave `ordenex` de las columnas y del DTO,
`lib/utils/ingreso-…`) o comentarios.

**Hecho.**
- `cierre-detalle-shared.tsx`: `INGRESO_TOTAL_LABEL` «Total de la empresa», `INGRESO_PANEL_LABEL`
  «Ingreso de la empresa», `INGRESO_BRUTO_NOTA`.
- `cierre-labels.ts`: `INGRESO_TOTAL_COL`, `NETO_ORDENEX_LABEL` «Neto de la empresa»,
  `FACTURADO_ORDENEX_LABEL` «Lo que la empresa facturó», `GANA_LA_TIENDA_NOTA`,
  `GANA_LA_TIENDA_NEGATIVO_NOTA` y `NETO_ORDENEX_NEGATIVO_NOTA` (empiezan frase: `alInicio`),
  `NETO_ORDENEX_NOTA`, `CASCADA_FACTURA_TIENDA_TITULO`, `CASCADA_NETO_ORDENEX_TITULO`.
- `CierresBodegaAdminModule.tsx`: los dos `ariaLabel` del panel de ingreso (agregado y por día).
- `cargar-kpis.ts:85`: «…ya descontado lo de la empresa» (cierra el rojo de backend en
  `kpis-financieros`).
- Analítica de productos: «Cobró la empresa» en `PRODUCTOS_COLUMNAS`, `DETALLE_DINERO_TEXTOS`
  (columna y total), el aviso `avisoLiquidado` y el encabezado del archivo descargado.
- Todo en el mismo literal con plantilla y `EMPRESA` (`enFrase` dentro de frase, `alInicio` al
  inicio). Ningún texto de dinero usa `MARCA`.
- Comentarios triviales de los archivos editados que solo nombraban a la empresa (T8 parcial). El
  comentario de anchos de `ProductosTabla` (`MIN_DINERO`) aclara que los 80 px se midieron con el
  rótulo anterior, más corto.

**Decisión: el wordmark de `cierre-factura.tsx`.** La hoja compacta del comprobante llevaba el
nombre como texto (`text-brand`, en mayúsculas). Por la regla de design §3 es `EMPRESA`: el
comprobante del cierre lo emite la empresa que liquida con el mensajero (mueve dinero), no la
plataforma. Y es un **membrete**, así que se usa `EMPRESA.membrete`: en transición vale `null` y no
se pinta, por la misma razón que la etiqueta no dice «LA EMPRESA · GUÍA». Cuando SL-17 ponga el
nombre de la organización, aparece solo. El par P16 de `factura-contraste` describe ahora «el
membrete de la empresa»; sigue exento y su utilidad `text-brand` sigue en el archivo.

**Tests (R3/R19, contrato con el literal nuevo, escrito a mano).**
- `cierre-bodega-vocabulario.guardia` «SL-15 R3 …» (nuevo): los 10 rótulos y notas del cierre con
  el texto de hoy. Más los dos que ya tenía (`NETO_…`, `FACTURADO_…`) con el literal nuevo.
- `ProductosTablaDinero` «SL-15 R3 …» (nuevo): las 4 cadenas de «Cobró la empresa». Hacía falta:
  los casos de antes localizan la cifra por la constante y no veían el nombre (mutación M7).
- `CierreFacturaPapel` «SL-15 — el membrete …» (nuevo): en transición la hoja no dice «Servi
  Logistic», ni «la empresa», ni el nombre heredado.
- Literal nuevo en los existentes: `CierreBodegaDesglosePorTienda`, `CierreBodegaDetalleCascadas`,
  `CierreBodegaDetalleGestiones`, `CierreFacturaSinGestionar`, `CierreMensajeroDetalleCascadas`,
  `CierresAdminModule`, `rechazo-nombre-466-app` (línea 146; la 125 es `tarifas-labels`, de T6),
  `analitica-productos-descarga-columnas`, `cierres-gestiones-fundida-descarga-columnas`,
  `TableroFinanciero` (la etiqueta del DTO, «Ganancia de la empresa», como el catálogo),
  `DineroIdentidadesEnPantalla` (títulos), `kpis-financieros` (ya lo tenía backend).

**T5.2 (R4), parte de `CierreBodegaDetalleCascadas.test.tsx`.** «SL-15 R4 …»: `vi.doMock` de
`@/lib/config/marca` con «Acme Envíos» en las tres formas, `vi.resetModules` e `import()` dinámico
del módulo y de las acciones (los `vi.mock` de arriba se reevalúan tras el reset). Afirma «Neto de
Acme Envíos» con su cifra, «Lo que Acme Envíos facturó», las regiones «Ingreso de Acme Envíos del
cierre de bodega» y «… · Ana Mensajera», y que ni el texto ni los `aria-label` dicen «la empresa».
Además, `CierreFacturaPapel` tiene su caso con mock: con membrete «Acme Envíos», la hoja lo pinta
una vez.

**Mutaciones (script en el scratchpad; cada archivo copiado antes y restaurado, `cmp` igual).**
| Mutación | Tests | Resultado |
|---|---|---|
| M1 `NETO_ORDENEX_LABEL = "Neto de la empresa"` a mano | Cascadas + vocabulario | rojo 1/51: R4 (los de literal, verdes, como debe ser) |
| M2 `ariaLabel="Ingreso de la empresa del cierre de bodega"` a mano | Cascadas + DesglosePorTienda | rojo 1/51: R4 |
| M3 membrete «La empresa» escrito y siempre visible | CierreFacturaPapel | rojo 2/37: transición y mock |
| M4 membrete «Servi Logistic» | CierreFacturaPapel | rojo 2/37 |
| M5 `cierre-factura.tsx` de `HEAD` (wordmark con el nombre heredado) | CierreFacturaPapel | rojo 2/37 |
| M6 `cargar-kpis.ts` de `HEAD` | kpis-financieros | rojo 1/18 |
| M7 `ProductosTabla.tsx` de `HEAD` | ProductosTablaDinero + 466 | **verde 61/61**: hueco, de ahí el caso nuevo |
| M7' el mismo, con el caso nuevo | ProductosTablaDinero | rojo 1/48 |
| M7'' `DineroProductoDetalle.tsx` de `HEAD` | ProductosTablaDinero | rojo 1/48 |
| M8 `cierre-labels.ts` y `cierre-detalle-shared.tsx` de `HEAD` | vocabulario | rojo 12/43 |

**Excepciones retiradas de `sin-nombre-heredado` (2).** `app/(app)/analitica/_components/finanzas/cargar-kpis.ts`,
`tests/components/CierreFacturaSinGestionar.test.tsx`. El resto de archivos tocados sigue con
identificadores (T7) o comentarios fuera de lo trivial (T8): `CierreDiaModule.tsx`,
`cierre-dia-descarga-columnas.ts`, `DesglosePorTienda.tsx` y `CascadasCierreMensajero.tsx` no se
tocaron (solo comentarios o identificadores).

**Salida.**
- Guardia `sin-nombre-heredado`: 13 passed.
- `vitest related --run` sobre los 23 archivos tocados: 192 archivos, `2980 passed | 17 skipped`,
  0 failed. Aparte, `kpis-financieros`, `TableroFinanciero`, `etiquetas-visibles`,
  `factura-contraste`, `CierreFacturaPapel` y la guardia: 6 archivos, 215 passed.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0 (0 errores, 232 warnings preexistentes).
- MCP del grafo: no se usó; la exploración fue con Grep/Read.
- Finales de línea: los 8 archivos de `app/` estaban en CRLF en el árbol; se escribieron en LF (el
  diff de git no lo muestra, `.gitattributes` normaliza).

**Veredicto:** T5.1 (frontend) y T5.2 hechas; cierres y analítica nombran a la empresa con
`EMPRESA`, el membrete del comprobante es `EMPRESA.membrete`, R4 muerde y todo lo relacionado está
verde.
- T5 (`5ef4e28`): log `_trabajo/SL-15-gate-T5.log`: relacionados `699 passed | 73 skipped (772)`; guardias `290 passed | 2 skipped (292)`, `3954 passed | 20 skipped (3974)`; `== init OK ==`, `INIT_EXIT=0`.

## T6 (backend)

**Alcance medido (`lib/`).** Texto visible con el nombre, fuera de comentarios e identificadores:
- `lib/types/historial-accion.ts`: 3 rótulos;
- `lib/types/plantilla-datos.ts`: 4 descripciones, el `ejemplo` y el `sinpeNombre` de la vista previa;
- `lib/utils/egreso-anulable.ts`: 4 nombres de egreso;
- `lib/services/AbonoTiendaService.ts`: los 5 mensajes de error;
- `lib/pdf/etiquetas-dibujo.ts`: `ROTULO_GUIA`;
- los dos informes PDF: el encabezado y el sello.

El resto de `lib/types/**` y `lib/utils/**` solo lo lleva en comentarios (T8) o en identificadores
(T7: `"gasto_ordenex"`, `"tienda_paga_a_ordenex"`, `"ordenex_debe"`, `"solo_ordenex"`,
`"concepto_ordenex"`, `ganancia_ordenex`, `deOrdenex`, el import de `lib/utils/ingreso-…`).
`lib/actions/rechazo-tienda-cobro.ts` y `lib/types/historial-accion-etiquetas.ts` solo tienen
comentarios: no se tocaron. En `plantilla-datos.ts` ya no queda ninguna línea con el dominio de la
marca anterior (lo quitó SL-14), así que no había nada que respetar.

**Hecho.**
- Historial, egresos, errores de `AbonoTiendaService` y descripciones de guía y zona: plantilla con
  `EMPRESA.enFrase` en el mismo `Record` o literal. Ninguno empieza frase.
- **Decisión: dos descripciones de plantilla van con `MARCA`, no con `EMPRESA`.** Son «Cuándo se
  registró la orden en …» y «Correo con el que el mensajero entra a …». Nombran el sistema donde se
  registra la orden y en el que se inicia sesión, o sea lo que se abre (regla de uso de design §3), y
  pasan a `${MARCA.nombre}`. La tabla de §2 mete «las descripciones» en B como ejemplo medido. Manda la
  regla de uso, que decide caso a caso: en un texto mixto, cada mención va con lo suyo.
- B' (ejemplo): el titular del SINPE pasa a «Mensajería Ejemplo CR S.A.», el mismo literal que T4 puso
  en `sinpe-textos`. Cambian a la vez `ejemplo` y `DATOS_PLANTILLA_EJEMPLO.negocio.sinpeNombre`, que R12
  exige iguales.
- **R7.** `ROTULO_GUIA` vale `"GUÍA"` sin membrete, y con membrete, el membrete en mayúsculas
  (`toLocaleUpperCase("es-CR")`) seguido de « · GUÍA». Sigue siendo una constante de módulo: la leen la
  verificación y el generador de cliente.
- **R8, tránsito.** Sin membrete, no se dibuja la línea gris de encima del título y el sello es
  «Informe de tránsito · <fecha> <hora>». Con membrete, esa línea es el membrete y el sello empieza por
  «<membrete> · ».
- **R8, picking.** `ROTULOS_HELVETICA.marca` vale «Picking».
  - Sin membrete, el encabezado es ese rótulo en Helvetica.
  - Con membrete, es «<membrete> · Picking» con la fuente embebida y saneado por `Saneador`, como el
    nombre de la tienda. En SL-17 el membrete será un dato de la base, y la fuente estándar borraría lo
    que no sea Latin-1.
  - El sello es «Picking <tienda> · <fecha> <hora>», con «<membrete> · » delante cuando lo hay.
- Comentarios triviales de los archivos ya editados pasan a «la empresa» o a «GUÍA»: los del historial,
  los de `AbonoTiendaService`, el diagrama de la cabecera de `etiquetas-dibujo` y el de
  `etiquetas-maqueta`.
- Datos de prueba (F): la URL del QR del smoke pasa a `https://ejemplo.test/paquete/1042`.

**Tests de contrato (R3/R19).** Llevan el literal nuevo escrito a mano.
- `catalogo-y-choke-point`: los 3 rótulos con «a la empresa», y un caso nuevo «SL-15 R3»: ningún texto
  del catálogo lleva el nombre heredado ni «Servi Logistic».
- `HistorialAccionesAbonoTienda457`: la pantalla.
- `plantilla-datos` «SL-15 R3»: las 4 descripciones (2 con «la empresa» y 2 con «Servi Logistic») y el
  SINPE de ejemplo.
- `wallet-anulacion-service`: «Anulación de: Gasto fijo de la empresa» y «Anulación de: Indemnización
  que la empresa paga por un incidente».

**Tests de R7.**
- `etiquetas-verificacion.ts` exporta `ROTULO_GUIA_SIN_MEMBRETE = "GUÍA"`, literal.
- `verificarEtiqueta` recibe un 8.º parámetro opcional, `rotuloGuiaEsperado`, que por defecto vale ese
  literal. El rótulo se busca por el texto esperado y su caja tiene que acabar antes del QR. Se
  comprueba en los dos generadores, las cuatro hojas y todo el corpus.
- `etiquetas-pdf-lote.smoke.test.ts` «SL-15 R7», 2 casos sobre el PDF real del servidor, leído con
  `pdf-inspector.ts` a través de `leerEtiqueta`:
  - en transición, el rótulo dice solo «GUÍA»; con el mock, «ACME ENVÍOS · GUÍA»;
  - en los dos, el rótulo queda encima del número, y su caja y la del número terminan antes del QR;
  - ningún texto lleva el nombre heredado, «Servi Logistic» ni «la empresa».
- «El recuadro del número de guía» se lee como el QR. La etiqueta solo dibuja un recuadro, el del
  importe, y lo que hay a la derecha del rótulo y del número es el QR.

**Tests de R8.**
- `informe-transito-pdf.test.ts`: «SL-15 R8», 2 casos sobre el PDF real, y el pie de R29 ya sin nombre.
- `picking-pdf.test.ts`: «SL-15 R8», 2 casos sobre la maqueta y sobre el PDF real (con
  `pdf-inspector`), y los tres sellos de R21 ya sin nombre.

**Tests de R4 (T6.4 y los mocks de T6.2 y T6.3).** Todos con `vi.doMock("@/lib/config/marca")`
(«Acme Envíos» en las tres formas), `vi.resetModules` e `import()` dinámico, dentro de su `describe`.
- `catalogo-y-choke-point`: exactamente 3 textos con «Acme Envíos», y ninguno con «la empresa».
- `plantilla-datos`: la guía y la zona. Salen 3 textos, porque el alias `num_guia` hereda la
  descripción de `guia`.
- El smoke de etiquetas, el de tránsito y el de picking, ya descritos arriba.

**Mutaciones.** El script `t6b-mutaciones.py`, en el scratchpad, copia el archivo, lo muta, corre los
tests y lo restaura. Al terminar, `md5sum -c` da OK en los 6 archivos de producción.
| Mutación | Tests | Resultado |
|---|---|---|
| M1 `ROTULO_GUIA` con el nombre heredado | smoke + diseño-353 + lote | rojo 42/69: los 2 de SL-15 R7, y la verificación (V8) en 32+8 |
| M2 `ROTULO_GUIA = "LA EMPRESA · GUÍA"` | ídem | rojo 42/69 |
| M3 `ROTULO_GUIA = "GUÍA"` fijo (ignora el membrete) | smoke | rojo 1/7: R7 con mock |
| M4 el rótulo se dibuja en `anchoTextoCabecera - 4` (pisa el QR) | smoke + diseño-353 | rojo 34/46: los 2 de R7 por «antes del QR» |
| M5 tránsito: encabezado «La empresa» siempre | tránsito | rojo 2/21: R8 transición y mock |
| M6 tránsito: sello «Servi Logistic · …» | tránsito | rojo 3/21: R29 y los 2 de R8 |
| M7 tránsito: sello con el nombre heredado | tránsito | rojo 3/21 |
| M8 picking: el encabezado ignora el membrete | picking | rojo 1/23: R8 con mock |
| M9 picking: sello con el nombre heredado | picking | rojo 5/23: 3 de R21 y los 2 de R8 |
| M10 historial: «…a la empresa» escrita a mano | catálogo + pantalla 457 | rojo 1/52: R4 (los de literal siguen verdes, como debe ser) |
| M11 historial: `abono_tienda` con el nombre heredado | ídem | rojo 5/52: R3 barrido, R3 literal, R4 y 2 de pantalla |
| M12 plantilla: «Número de guía de la empresa» a mano | plantilla-datos | rojo 1/74: R4 |
| M13 plantilla: `fecha_creacion` con `EMPRESA` en vez de `MARCA` | plantilla-datos | rojo 2/74: R3 y R4 |
| M14 plantilla: titular SINPE con el nombre heredado | plantilla-datos | rojo 2/74: R12 y R3 |
| M15 egreso: «Gasto fijo de …» con el nombre heredado | wallet-anulacion-service | rojo 1/19 |

**Excepciones retiradas de `sin-nombre-heredado` (15).**
- `lib/` (8): `lib/pdf/etiquetas-dibujo.ts`, `lib/pdf/etiquetas-maqueta.ts`,
  `lib/services/AbonoTiendaService.ts`, `lib/types/historial-accion.ts`, `lib/types/plantilla-datos.ts`,
  `lib/utils/egreso-anulable.ts`, `lib/whatsapp-envios/informes/picking/pdf.ts`,
  `lib/whatsapp-envios/informes/transito/pdf.ts`.
- `tests/` (7): `tests/components/HistorialAccionesAbonoTienda457.test.tsx`,
  `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`,
  `tests/unit/pdf/etiquetas-pdf-lote.smoke.test.ts`, `tests/unit/pdf/informe-transito-pdf.test.ts`,
  `tests/unit/services/abono-tienda-anulacion.test.ts`,
  `tests/unit/services/wallet-anulacion-service.test.ts`, `tests/unit/whatsapp-envios/picking-pdf.test.ts`.

Siguen en la guardia, solo por comentarios o identificadores: `lib/types/historial-accion-etiquetas.ts`,
`lib/actions/rechazo-tienda-cobro.ts`, `lib/whatsapp-envios/informes/picking/informe.ts` y el resto de
`lib/types/**` y `lib/utils/**`.

**Salida.**
- Guardia `sin-nombre-heredado` sola: 13 passed.
- `vitest related --run` sobre los 18 archivos tocados: 362 archivos, `1 failed | 4520 passed | 399
  skipped`.
  - El único rojo es la guardia `sin-nombre-heredado`, en «ninguna excepcion sobra», por **timeout**: el
    límite es de 20 s y el barrido del árbol tardó 91 s, con 362 archivos en paralelo.
  - Sola pasa en verde, así que no es un rojo de contenido.
  - Si molesta en el gate, el arreglo es el que SL-34 aplicó a su guardia: el barrido en `beforeAll`,
    fuera del timeout del caso.
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0 (0 errores, 232 warnings preexistentes).
- Finales de línea: los 19 archivos en LF.
- MCP del grafo: no se usó; la exploración fue con Grep/Read.

**Para frontend (T6.1, `app/`).**
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx:131` pinta en la vista previa «… · Guía», con el nombre
  heredado escrito a mano.
- Lo coherente con R7 es usar el mismo `ROTULO_GUIA` de `lib/pdf/etiquetas-dibujo.ts`, que ese archivo
  ya importa para los otros rótulos.
- Esta parte no deja rojos de contrato abiertos.

**Veredicto:** T6.1 (lib), T6.2, T6.3 y T6.4 hechas. El historial, las plantillas, los egresos, los
errores del pago de una tienda, la etiqueta y los dos informes nombran a la empresa con `EMPRESA`, y a
la plataforma con `MARCA` donde toca. R7 y R8 muerden: las 15 mutaciones dan rojo.

## T6 (frontend)

**Alcance medido.** En `app/(app)/{configuracion,novedades,ordenes,mis-asignaciones}/**` y
`components/shared/RevisionSinpeBodega.tsx` hay 19 líneas con la palabra en 10 archivos. Texto
visible, 5:
- la descripción del vacío de `ApiKeysModule`;
- la de `envios-whatsapp/page.tsx`;
- el placeholder SINPE de `CrearZonaForm`;
- `PAGO_ZONA_TEXTO.seccionAyuda` en `tarifas-labels.ts`;
- el rótulo de la cabecera de `EtiquetaGuia`.

El resto son comentarios. `RevisionSinpeBodega.tsx` y `ordenes-descarga-columnas.ts` no la llevan.
`GestionarDesdeAyudaModal.tsx` solo la tiene en comentarios que citan la ruta `lib/utils/ingreso-…`.

**Hecho.**
- `tarifas-labels.ts`: «Lo que ${EMPRESA.enFrase} paga por cada gestión…», en el mismo `Record`. Cierra
  la línea 125 de `rechazo-nombre-466-app`, que T5 dejó para esta tanda.
- `ApiKeysModule.tsx`: «…conectar sistemas externos con ${MARCA.nombre}.». La API es de la plataforma.
- `envios-whatsapp/page.tsx`: «Mensajes de WhatsApp que ${MARCA.nombre} manda solo…», con la
  `description` en plantilla.
- `CrearZonaForm.tsx`: el placeholder es ahora «Ej: Mensajería Ejemplo CR S.A.» (B', el mismo literal de
  T4 y de T6 backend).
- `EtiquetaGuia.tsx`: la cabecera pinta `{ROTULO_GUIA}` de `lib/pdf/etiquetas-dibujo.ts`, igual que el
  papel (R7). Dice «GUÍA» en transición y «<MEMBRETE> · GUÍA» con membrete.
- Comentarios triviales (T8 parcial):
  - pasan a «la empresa»: `CrearZonaForm:527`, los 4 de `tarifas-labels`, `RechazarNovedadModal:44` y
    `CorregirUbicacionAviso:33`;
  - pasan a «la app»: `GestionarOrdenPanel:103` («con la app abierta»), `carga-masiva-clasificacion:43`
    y su copia en `OrdenesCargaPreview.test.tsx:459`. Nombran lo que se abre y lo que guarda.
- No se tocaron, porque citan la ruta del archivo que renombra T7: `tarifas-labels.ts:34`,
  `RechazarNovedadModal.tsx:104` y `GestionarDesdeAyudaModal.tsx`, con su test.

**Decisión: `envios-whatsapp` lleva `MARCA`.** Quien «manda solo» los mensajes es la automatización
de la plataforma, lo que responde. Por la regla de design §3, eso es `MARCA` y no la empresa.

**Guardia: el barrido pasa a `beforeAll`.** Se hizo como SL-34 en `recursos-origen-fuera`:
- un `beforeAll(() => { arbol(); }, BARRIDO_TIMEOUT_MS)` en el `describe` raíz, con un plazo de 180 s;
- los casos leen la caché, así que el barrido ya no cuenta dentro del timeout de 20 s de ningún caso;
- no cambia lo que comprueba.

Las 3 autocomprobaciones de T1, repetidas:
| Mutación | Resultado |
|---|---|
| quitar la pendiente `tarifas-labels.ts` | rojo 1/13: R15 |
| volver a poner `EtiquetaGuia.tsx`, ya limpio | rojo 1/13: «ninguna excepcion sobra» |
| `git ls-files` vacío (`.split("\0").slice(0, 0)`) | rojo 2/13: «ninguna excepcion sobra» y «la lectura del arbol no esta vacia» |

Se restauró y `md5sum -c` dio OK.

**Tests de contrato (R3/R19).** Todos llevan el literal escrito a mano.
- `rechazo-nombre-466-app` C29-C32: «Lo que la empresa paga…».
- `TarifasClaridadMontos` «SL-15 R3» (nuevo): la ayuda de la sección en `CrearZonaForm` montado, y el
  placeholder «Ej: Mensajería Ejemplo CR S.A.».
- `ApiKeysModule` R16: el vacío dice «…con Servi Logistic.».
- `ConfiguracionEnviosWhatsappPage` «SL-15 R3» (nuevo): la descripción de la lista, vista por el maestro.
- `EtiquetaGuia` «SL-15 R7» (nuevo), 2 casos:
  - en transición, el rótulo de la cabecera es exactamente «GUÍA», y la etiqueta no lleva el nombre
    heredado, ni «Servi Logistic», ni «la empresa»;
  - con `vi.doMock("@/lib/config/marca")` (membrete «Acme Envíos»), `vi.resetModules` e `import()`
    dinámico, el rótulo es «ACME ENVÍOS · GUÍA».

**Mutaciones.** El script `t6f-mut.py`, en el scratchpad, copia, muta, corre, restaura y comprueba el
md5 en cada una.
| Mutación | Tests | Resultado |
|---|---|---|
| M1 la cabecera con el nombre heredado «· Guía» a mano (el `HEAD`) | EtiquetaGuia | rojo 2/10: R7 transición y membrete |
| M2 la cabecera «GUÍA» fija (ignora el membrete) | EtiquetaGuia | rojo 1/10: R7 membrete |
| M3 `seccionAyuda` con el nombre heredado | 466 + TarifasClaridadMontos | rojo 2/37 |
| M4 el vacío de API keys «…con la empresa.» | ApiKeysModule | rojo 1/32: R16 |
| M5 la descripción de envíos con el nombre heredado | ConfiguracionEnviosWhatsappPage | rojo 1/8 |
| M6 el placeholder SINPE con el nombre heredado | TarifasClaridadMontos | rojo 1/23 |

**Mapa R → test (esta parte).**
- R3: `rechazo-nombre-466-app`, `TarifasClaridadMontos`, `ApiKeysModule` y
  `ConfiguracionEnviosWhatsappPage`, en los casos «SL-15 R3» y R16.
- R7 (vista previa): `EtiquetaGuia.test.tsx`, describe «SL-15 R7».
- R15 y R16: la guardia, con el barrido en `beforeAll`.

**Excepciones retiradas de `sin-nombre-heredado` (8).**
- `app/(app)/configuracion/api/_components/ApiKeysModule.tsx`
- `app/(app)/configuracion/envios-whatsapp/page.tsx`
- `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
- `app/(app)/ordenes/_components/carga-masiva-clasificacion.ts`
- `tests/components/OrdenesCargaPreview.test.tsx`

Siguen en la guardia, por la ruta citada en un comentario (T7) o por identificadores:
- `tarifas-labels.ts`;
- `RechazarNovedadModal.tsx`;
- `GestionarDesdeAyudaModal.tsx` y su test;
- `rechazo-nombre-466-app.test.ts`, por `NETO_…_NOTA`.

**Salida.**
- Guardia `sin-nombre-heredado` sola: 13 passed (1,46 s).
- Los 5 tests tocados: 87 passed.
- `vitest related --run` sobre los 16 archivos tocados: `89 passed (89)` archivos, `1233 passed (1233)`
  tests, 0 failed. Incluye la guardia.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, con 0 errores y 232 warnings preexistentes.
- Finales de línea: los 16 archivos estaban en CRLF en el árbol y se escribieron en LF.
- MCP del grafo: no se usó. La exploración fue con Grep/Read.

**Veredicto:** T6.1 (frontend) hecha:
- configuración, novedades, órdenes y mis-asignaciones nombran a la empresa con `EMPRESA` y a la
  plataforma con `MARCA`;
- la vista previa de la etiqueta usa `ROTULO_GUIA`;
- la guardia barre en `beforeAll`;
- las 6 mutaciones y las 3 autocomprobaciones dan rojo, y todo lo relacionado está verde.
- T6 (`2ce275f`): log `_trabajo/SL-15-gate-T6.log`: relacionados `813 passed | 87 skipped (900)`, `11408 passed | 689 skipped (12097)`; guardias `290 passed | 2 skipped (292)`, `3954 passed | 20 skipped (3974)`; `== init OK ==`, `INIT_EXIT=0`.
- Decisión del implementer (T7): el renombre de identificadores cruza `lib/`, `app/`, `components/` y `tests/`, y tiene que ser atómico para que el typecheck no quede rojo entre commits. Lo hace entero `backend_dev`, porque los identificadores nacen en `lib/`; en `app/` y `components/` el cambio es mecánico, sin tocar la UI.

## T7

Renombre de identificadores (clase D), atómico en `lib/`, `app/`, `components/` y `tests/`
(`hooks/` no tenía ninguno). Lo empezó un `backend_dev` que se cortó con el árbol sin commitear;
este lo revisó, lo completó y lo commitea. Base: `a8163de`.

**T7.1 — Medición (sobre `a8163de`, `git grep -w`, archivos de producción | de tests).** Regla del
glosario (design §3): la palabra se sustituye en la misma posición, respetando mayúsculas.

| antes | después | prod | tests |
|---|---|---|---|
| `netoOrdenex` | `netoEmpresa` | 9 | 17 |
| `ingresoOrdenex` | `ingresoEmpresa` | 10 | 29 |
| `IngresoOrdenexDTO` | `IngresoEmpresaDTO` | 6 | 15 |
| `ganancia_ordenex` | `ganancia_empresa` | 3 | 19 |
| `TotalesIngresoOrdenex` | `TotalesIngresoEmpresa` | 10 | 14 |
| `deOrdenex` | `deEmpresa` | 4 | 23 |
| `pagoTiendaOrdenex` | `pagoTiendaEmpresa` | 7 | 4 |
| `esOrdenex` | `esEmpresa` | 6 | 8 |
| `NETO_ORDENEX_LABEL` | `NETO_EMPRESA_LABEL` | 4 | 6 |
| `DesgloseIngresoOrdenex` | `DesgloseIngresoEmpresa` | 2 | 3 |
| `FACTURADO_ORDENEX_LABEL` | `FACTURADO_EMPRESA_LABEL` | 4 | 4 |
| `concepto_ordenex` | `concepto_empresa` | 2 | 1 |
| `totalesIngresoOrdenex` | `totalesIngresoEmpresa` | 4 | 2 |
| `solo_ordenex` | `solo_empresa` | 5 | 5 |
| `ordenex_debe` | `empresa_debe` | 3 | 10 |
| `gananciaOrdenex` | `gananciaEmpresa` | 3 | 1 |
| `CASCADA_NETO_ORDENEX_TITULO` | `CASCADA_NETO_EMPRESA_TITULO` | 3 | 3 |
| `tienda_paga_a_ordenex` | `tienda_paga_a_empresa` | 3 | 3 |
| `NETO_ORDENEX_NOTA` | `NETO_EMPRESA_NOTA` | 3 | 2 |
| `NETO_ORDENEX_NEGATIVO_NOTA` | `NETO_EMPRESA_NEGATIVO_NOTA` | 3 | 2 |
| `toIngresoOrdenex` | `toIngresoEmpresa` | 4 | 2 |
| `gasto_ordenex` | `gasto_empresa` | 3 | 3 |
| `SOLO_ORDENEX` | `SOLO_EMPRESA` | 0 | 1 |
| `OTROS_EGRESOS_DE_ORDENEX` | `OTROS_EGRESOS_DE_EMPRESA` | 0 | 1 |
| `ORDENEX_NEUTRO` | `EMPRESA_NEUTRO` | 1 | 0 |
| `TARIFA_ORDENEX` | `TARIFA_EMPRESA` | 0 | 1 |
| `ORDENEX_PAGA` | `EMPRESA_PAGA` | 0 | 1 |
| `DESDE_ORDENEX` | `DESDE_EMPRESA` | 0 | 1 |
| `ordenexPaga` | `empresaPaga` | 2 | 0 |
| `SuperficieOrdenex` | `SuperficieEmpresa` | 1 | 0 |
| `ordenexPista` | `empresaPista` | 1 | 0 |
| `ordenexCobra` | `empresaCobra` | 2 | 0 |
| `netoOrdenexAgregado` | `netoEmpresaAgregado` | 1 | 0 |
| `lineasNetoOrdenex` | `lineasNetoEmpresa` | 1 | 0 |
| `gastoDeOrdenex` | `gastoDeEmpresa` | 2 | 0 |
| `BOLSILLO_ORDENEX` | `BOLSILLO_EMPRESA` | 1 | 0 |

Además:
- la clave suelta `ordenex` (propiedad del reparto `liquidado.ordenex`, `IdDinero`, la clave de la
  barra de caja, `PRODUCTOS_COLUMNAS.ordenex`, variables locales): 301 apariciones en el diff, todas
  a `empresa`;
- el módulo `lib/utils/ingreso-ordenex.ts` → `lib/utils/ingreso-empresa.ts` (`git mv`), con sus 44
  imports `@/lib/utils/ingreso-…` y las rutas citadas en comentarios de `lib/` y `app/`.
- `esDestinoLocal…`: ya no existía con la palabra en `a8163de` (solo en `specs/` y en esta
  bitácora), así que la excepción del glosario no tuvo nada que hacer.
- Total: 72 archivos de producción y 131 de tests (203, más el rename).

**Decisiones.**
- **Ningún valor de base cambia (R14b).** Los literales string renombrados (`"ganancia_ordenex"`,
  `"concepto_ordenex"`, `"ordenex_debe"`, `"tienda_paga_a_ordenex"`, `"solo_ordenex"`,
  `"gasto_ordenex"`, `"ordenex"`) se buscaron en `db/` y `scripts/` en `a8163de`: cero apariciones.
  Son discriminantes de unión, ids del catálogo de métricas y claves de `Record` en memoria; ninguno
  es enum de Postgres, columna, `@map` ni valor guardado. Tampoco hay cambios en `lib/api/` ni
  `app/api/`, así que el contrato público no se mueve.
- **Textos visibles intactos.** Los mensajes de aserción y los títulos de test con la palabra se
  quedan (por ejemplo «De Ordenex» en `caja-invariante-tiendas`, `"solo ordenex"` en
  `caja-composicion`): son prosa (T10). Los comentarios solo cambiaron donde citan un identificador
  o la ruta del módulo; la prosa de comentario es T8.
- **`data-bolsillo="empresa"`** en `CajaResumenCard.tsx`: atributo técnico, no visible; sus dos
  lectores (`CajaResumenCard.test.tsx`, `CajaComposicionBarra.test.tsx`) cambian a la vez. El e2e no
  lo usa.
- **`procesar-jobs-whatsapp-bienvenida.test.ts`:** el agente anterior había puesto
  `"bienvenida_empresa"`. Es dato de prueba (clase F), no identificador; como ya había retirado la
  entrada de la guardia, en lugar de revertir se usa el valor que fija design §2 F: `"bienvenida"`.
- **`tests/unit/utils/ingreso-ordenex.test.ts`** conserva la ruta (excepción `soloRuta`, SL-27) e
  importa de `@/lib/utils/ingreso-empresa`. Sus comentarios en prosa siguen (T10).
- **Rutas literales:** `caja-173-alcance` (import y lista de archivos de dinero),
  `flete-por-rechazo-censo` y `cierre-dia-repository.test.ts` citan `ingreso-empresa.ts`.
  `LandingPage.test.tsx` no cita la ruta (dice «la utilidad de ingreso del flete de `lib/utils/`»),
  no hubo nada que cambiar.
- **Fuera de T7, quedan:** la ruta vieja en comentarios de `db/schema.prisma:2547` (T8) y de dos
  migraciones, `20260831120000_rechazo_tienda_cobro` y
  `20260907130000_historial_accion_zona_central_cambiada` (T9). También queda prosa con la palabra
  en dos descripciones de `lib/api/openapi-spec.ts` (líneas 1486 y 2006): es texto, no
  identificador, y lo anoto para quien cierre la clase B.

**Excepciones retiradas de `sin-nombre-heredado` (130: 40 de producción y 90 de tests).** La de
`lib/utils/ingreso-….ts` pasa a `"lib/utils/ingreso-empresa.ts"`, porque el archivo conserva
comentarios en prosa (T8). Retiradas:
- app/(app)/analitica/_components/entregas/DineroProductoDetalle.tsx
- app/(app)/analitica/_components/entregas/ProductosTabla.tsx
- app/(app)/analitica/_components/entregas/analitica-productos-descarga-columnas.ts
- app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx
- app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx
- app/(app)/cierres-admin/_components/cierre-labels.ts
- app/(app)/configuracion/tarifas/_components/tarifas-labels.ts
- app/(app)/novedades/_components/GestionarDesdeAyudaModal.tsx
- app/(app)/novedades/_components/RechazarNovedadModal.tsx
- app/(app)/wallet/_components/libro-caja-labels.ts
- app/(app)/wallet/_components/wallet-conceptos-manuales.ts
- app/(app)/wallet/_components/wallet-labels.ts
- app/(app)/wallet/tiendas/_components/EstadoCuentaAcciones.tsx
- app/(app)/wallet/tiendas/_components/estado-cuenta-tienda-labels.ts
- components/shared/estado-cuenta/EstadoCuenta.tsx
- components/shared/estado-cuenta/estado-cuenta-labels.ts
- components/shared/wallet/DetalleMovimientoPanel.tsx
- components/shared/wallet/detalle-movimiento-panel-labels.ts
- lib/analytics/metrics.ts
- lib/constants/origen-legible-rotulos.ts
- lib/interfaces/repositories/ITarifaVigenteRepository.ts
- lib/repositories/CierreBodegaRepository.ts
- lib/repositories/RechazoTiendaCobroRepository.ts
- lib/services/CierreDiaService.ts
- lib/services/CierresBodegaAdminService.ts
- lib/services/ConteoProductosService.ts
- lib/services/CotizacionOrdenService.ts
- lib/services/DetalleDineroProductoService.ts
- lib/services/DetalleEnLoteService.ts
- lib/services/RechazoTiendaService.ts
- lib/services/WalletFeedService.ts
- lib/types/analitica-financiera.ts
- lib/types/cotizacion.ts
- lib/types/dinero-productos.ts
- lib/types/orden.ts
- lib/types/rechazo-tienda-cobro.ts
- lib/types/tarifa.ts
- lib/utils/api-orden-costo.ts
- lib/utils/cierre-detalle.ts
- lib/utils/efecto-movimiento.ts
- tests/components/BusquedaPorGuia469.test.tsx
- tests/components/CajaComposicionBarra.test.tsx
- tests/components/CajaResumenCard.test.tsx
- tests/components/CierreBodegaDesglosePorTienda.test.tsx
- tests/components/CierreBodegaDetalleGestiones.test.tsx
- tests/components/CierreCobrosDeLaGestion.test.tsx
- tests/components/CierreDetalleIncidente.test.tsx
- tests/components/CierreMotivoRechazoAutomatico.test.tsx
- tests/components/CierrePremioPendiente.test.tsx
- tests/components/CierreRechazosDeTienda.test.tsx
- tests/components/CierreTarifaAplicada.test.tsx
- tests/components/CierreTarifaEspecial.test.tsx
- tests/components/CierresAdminDeepLink.test.tsx
- tests/components/CierresAdminIndemnizacion.test.tsx
- tests/components/CierresAdminModule.test.tsx
- tests/components/CierresAdminPage.test.tsx
- tests/components/CierresAdminPagoMensajero.test.tsx
- tests/components/ComposicionGananciaCard.test.tsx
- tests/components/CorregirResultadoCierre.test.tsx
- tests/components/DetalleFilaComposicion.test.tsx
- tests/components/DetalleMovimientoPanel.test.tsx
- tests/components/EstadoCuenta.test.tsx
- tests/components/EstadoCuentaAcciones.test.tsx
- tests/components/GestionarDesdeAyudaModal.test.tsx
- tests/components/TableroFinanciero.test.tsx
- tests/components/WalletCaja463.test.tsx
- tests/components/WalletCaja468.test.tsx
- tests/components/WalletCajaBarra467.test.tsx
- tests/components/WalletFiltroAQuien458E.test.tsx
- tests/components/WalletLedgerVer458C.test.tsx
- tests/components/WalletLibroCaja458E.test.tsx
- tests/components/WalletRefrescoDirigido.test.tsx
- tests/components/descarga/CierresAdminDescargaDetallada.test.tsx
- tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx
- tests/components/descarga/CierresDescargaColumnas.test.tsx
- tests/components/descarga/CierresDescargaNiveles.test.tsx
- tests/components/descarga/DescargarGestionesDialog.test.tsx
- tests/components/descarga/ProductosDescargaColumnas.test.tsx
- tests/fixtures/dto-financiero-servido.ts
- tests/fixtures/estado-cuenta.ts
- tests/fixtures/gestion-detalle-478.ts
- tests/integration/actions/analitica-financiera-action.test.ts
- tests/integration/api/procesar-jobs-whatsapp-bienvenida.test.ts
- tests/integration/db/wallet-caracterizacion-458.test.ts
- tests/integration/mi-wallet-page.test.tsx
- tests/integration/wallet-page.test.tsx
- tests/unit/analytics/alcance-dinero.guardia.test.ts
- tests/unit/analytics/detalle-dinero-producto.test.ts
- tests/unit/analytics/etiquetas-visibles.guardia.test.ts
- tests/unit/analytics/financiera-borde.guardia.test.ts
- tests/unit/analytics/financiera-contratos.test.ts
- tests/unit/analytics/financiera-correspondencia.guardia.test.ts
- tests/unit/analytics/financiera-desglose-ids.guardia.test.ts
- tests/unit/analytics/financiera-forma-importe.guardia.test.ts
- tests/unit/analytics/financiera-granularidad.test.ts
- tests/unit/analytics/financiera-ingresos-repo.test.ts
- tests/unit/analytics/fulfillment-fuera-de-la-formula.guardia.test.ts
- tests/unit/analytics/kpis-financieros.test.ts
- tests/unit/analytics/metrics.test.ts
- tests/unit/analytics/tablero-financiero-cargar.test.ts
- tests/unit/components/desglose-tienda-labels.test.ts
- tests/unit/components/rechazo-nombre-466-app.test.ts
- tests/unit/components/saldo-tienda-card.negativo.test.tsx
- tests/unit/components/wallet-conceptos-manuales.test.ts
- tests/unit/components/wallet-page-cobros-pendientes.test.tsx
- tests/unit/descarga/analitica-productos-descarga-columnas.test.ts
- tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts
- tests/unit/descarga/cierres-gestiones-paridad.test.ts
- tests/unit/guards/caja-textos-459.guardia.test.ts
- tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts
- tests/unit/guards/flete-por-rechazo-censo.guardia.test.ts
- tests/unit/guards/wallet-sin-uuid.guardia.test.tsx
- tests/unit/repositories/cierre-dia-repository.test.ts
- tests/unit/repositories/cierres-gestiones-descarga-dto.test.ts
- tests/unit/services/CierresAdminService.gestiones-completo.test.ts
- tests/unit/services/CierresBodegaAdminService.gestiones-completo.test.ts
- tests/unit/services/analitica-financiera-serie-frontera.test.ts
- tests/unit/services/analitica-financiera-serie.test.ts
- tests/unit/services/cierre-desglose-tres-superficies.test.ts
- tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts
- tests/unit/services/cierres-bodega-pendientes-paginado.test.ts
- tests/unit/services/cotizacion-orden-service.test.ts
- tests/unit/services/libro-kardex-468.test.ts
- tests/unit/utils/aporte-por-orden-equivalencia.test.ts
- tests/unit/utils/aporte-por-orden.test.ts
- tests/unit/utils/cascadas-cierre-bodega.test.ts
- tests/unit/utils/dinero-por-producto.test.ts
- tests/unit/utils/libro-kardex-468.test.ts
- tests/unit/utils/partes-por-tienda.test.ts
- tests/unit/utils/tarifa-especial-por-distrito.test.ts

**Mutaciones (todas revertidas).**

| mutación | test | resultado |
|---|---|---|
| M1 `gasto_empresa` vuelve a la palabra en `lib/utils/efecto-movimiento.ts:30` | `sin-nombre-heredado` | rojo 1/13, señala `efecto-movimiento.ts:30` |
| M2 `ingreso-ordenex.test.ts` importa de la ruta vieja | el propio test | rojo: `Cannot find package '@/lib/utils/ingreso-…'` |

**Mapa R → test.** R14b: el diff no toca `db/`, y `git grep` de los literales renombrados en `db/` y
`scripts/` da 0. R15: `sin-nombre-heredado` (M1). Glosario y ruta nueva: typecheck y
`ingreso-ordenex.test.ts` (M2). T7.2 «Hecho»: `test-citado-desaparecido.guardia` en verde.

**Salida.**
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 232 warnings preexistentes.
- `sin-nombre-heredado` + `test-citado-desaparecido`: `2 passed (2)` archivos, `28 passed (28)` tests.
- `vitest related --run` sobre los 203 archivos tocados, en 6 bloques (la línea de comandos de Windows
  no admite los 203 a la vez). Todos con exit 0 y 0 failed:
  - bloque 00: `527 passed | 156 skipped (683)` archivos, `7350 passed | 1001 skipped (8351)` tests;
  - bloque 01: `774 passed | 219 skipped (993)`, `11958 passed | 1738 skipped (13696)`;
  - bloque 02: `565 passed | 196 skipped (761)`, `8358 passed | 1452 skipped (9810)`;
  - bloque 03: `65 passed | 10 skipped (75)`, `858 passed | 105 skipped (963)`;
  - bloque 04: `36 passed (36)`, `791 passed | 1 skipped (792)`;
  - bloque 05: `28 passed (28)`, `678 passed (678)`.
- Finales de línea: los 203 archivos en LF.
- MCP del grafo: no se usó. Fue un renombre mecánico revisado con `git diff`/`git grep`.
- Commit del código: `797e2ff`.

**Veredicto:** T7.1 y T7.2 hechas. Los identificadores, el módulo `ingreso-empresa` y sus imports
dicen «empresa»; no cambia ningún valor de base ni ningún texto visible; la guardia retira 130
excepciones y todo lo relacionado está en verde. T7.3 (`./init.sh` y push) queda para el implementer.
- T7 (`2babe5c`): dos agentes acabaron haciendo el mismo renombre (el primero no se había cortado del todo); el segundo revisó el árbol del primero y lo commiteó (`797e2ff`), con la bitácora (`2babe5c`). Log `_trabajo/SL-15-gate-T7.log`: relacionados `1165 passed | 230 skipped (1395)`, `17473 passed | 1800 skipped (19273)`; guardias `290 passed | 2 skipped (292)`, `3954 passed | 20 skipped (3974)`; `== init OK ==`, `INIT_EXIT=0`.

## T8 (backend)

**Alcance.** Comentarios de clase E en `lib/`, `db/schema.prisma` y `.github/workflows/gate.yml`, y la
prosa de clase B que quedaba en `lib/api/openapi-spec.ts`. `scripts/` y `middleware.ts` ya no tenían
la palabra fuera de las excepciones de otras fichas (seeds de SL-11, backfills de SL-12): no se tocan.
Fuera: `app/`, `components/`, `hooks/` (frontend), `db/migrations/` (T9), `tests/` y `e2e/` (T10).

**Hecho.** 111 archivos: 108 de `lib/` (281 líneas de comentario), `db/schema.prisma` (46 líneas),
`gate.yml` (1 línea) y la guardia. Reescritura con un script de un solo uso (en el scratchpad, no
versionado) que solo toca las líneas con la palabra y conserva los finales de línea (los 111 en LF).

**Decisiones (criterio de E).**
- Por defecto, la empresa usuaria: «la empresa» (y en mayúsculas «LA EMPRESA», «A LA EMPRESA», «DE LA
  EMPRESA», «LA EMPRESA LE COBRA»). En las 14 líneas donde la palabra abría la línea del comentario,
  la frase venía de la línea anterior: va en minúscula.
- Como plataforma, «la plataforma»: «CUANDO NACIÓ LA ORDEN en la plataforma»
  (`ICierresAdminService.ts`), «así la plataforma nunca guarda un nombre que nadie tecleó» (3 archivos)
  y, en `schema.prisma`, «Ese número NO lo genera la plataforma: lo trae la tienda».
- Como origen histórico: `gate.yml`, «Los seeds heredados de la app de origen».
- El «a quién» del aporte de capital: «La empresa», que es lo que pinta hoy (`EMPRESA.alInicio`), en
  `libro-caja-a-quien-sql.ts`, `LibroCajaAutoriaService.ts` y `types/libro-caja-autoria.ts`.
- La cita de la ruta vieja en `schema.prisma` → `lib/utils/ingreso-empresa.ts`.
- `openapi-spec.ts`: `OrdenCosto.description` → `"Los CINCO conceptos que " + EMPRESA.enFrase + " factura…"`
  (concatenado, porque la cadena lleva acentos graves de Markdown); el párrafo del nodo retirado
  → `` `… ${EMPRESA.alInicio} puede retirar una provincia…` ``. Se importa `EMPRESA` junto a `MARCA`.
  El espejo `docs/api/api-key-openapi.yaml` conserva la palabra en esas dos frases: es de SL-16, y
  ningún test compara esas dos descripciones con el yaml (`openapi-374` compara las de las
  propiedades y los mensajes, no esa frase; sigue en verde).
- No tocado, a propósito: la descripción de `evidenciasUrl` con el `Bearer` del prefijo viejo
  (`openapi-spec.ts:1131`), que tiene que coincidir con `docs/api/*.yaml`. Queda para T11, así que
  `lib/api/openapi-spec.ts` sigue en `PENDIENTES_SL15`.

**`db/schema.prisma` (R14b).** Las 46 líneas cambiadas solo difieren DESPUÉS del primer `//`. Lo
comprueba un script sobre `git diff -U0`: `pares 46 46 fuera de comentario 0`. No se renombra ningún
modelo, campo, enum ni `@map`. El spec contaba 47 (46 + 1 de `ordx_`); hoy son 46 y no hay `ordx_`.
`pnpm exec prisma validate` (con una DATABASE_URL de mentira): `The schema at db\schema.prisma is valid`.

**Excepciones retiradas de la guardia (109).** `.github/workflows/gate.yml`, `db/schema.prisma` y los
107 de `lib/` que quedaron limpios del todo, es decir, todos los de `lib/` menos `lib/api/openapi-spec.ts`
(`lib/actions/*` 6, `lib/auth/menu-visibility.ts`, `lib/config/*` 2, `lib/interfaces/repositories/*` 13,
`lib/interfaces/services/*` 14, `lib/repositories/*` 12, `lib/services/*` 20, `lib/types/*` 18,
`lib/utils/*` 20, `lib/whatsapp-envios/informes/picking/informe.ts`).

| mutación | test | resultado |
|---|---|---|
| M1 la palabra vuelve en `lib/utils/comprobante.ts:57` | `sin-nombre-heredado` | rojo 1/13, señala `comprobante.ts:57` |
| M2 vuelve la excepción de `db/schema.prisma` | `sin-nombre-heredado` | rojo 1/13: «ya no cubre nada: bórrala» |

Las dos revertidas; la guardia vuelve a `13 passed (13)`.

**Salida.**
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 232 warnings preexistentes (ninguno de `openapi-spec.ts`).
- `sin-nombre-heredado`: `13 passed (13)`.
- Las guardias que leen `progress/` (SL-11, SL-13, SL-14, SL-34), una a una: `31`, `7`, `9` y `39 passed | 1 skipped`. Juntas en un solo `vitest run` dieron 3 rojos por tiempo (30-40 s por caso, carga en paralelo), no por contenido.
- `vitest related --run lib/api/openapi-spec.ts`: `22 passed (22)` archivos, `272 passed (272)` tests.
- `vitest related --run` sobre los 108 de `lib/`: exit 0, `917 passed | 252 skipped (1169)` archivos,
  `14081 passed | 1866 skipped (15947)` tests.
- Los tests que leen como texto los archivos tocados, más `tests/unit/guards/` y `tests/unit/db/`:
  `226 passed` y 1 rojo, `dependencias-declaradas-presentes.guardia` (4 casos). Es preexistente y no lo
  causa este cambio: no encuentra un marcador de `init.sh`, que no se toca aquí.
- MCP del grafo: no se usó. Fue un barrido de comentarios revisado con `git grep`/`git diff`.

**Veredicto:** T8 backend hecha. `lib/`, `schema.prisma` y `gate.yml` ya no tienen la palabra, salvo
`openapi-spec.ts:1131`, que espera a T11. Se retiran 109 excepciones y lo relacionado está en verde.

## T8 (frontend)

**Alcance.** Comentarios y JSDoc de clase E en `app/`, `components/` y `hooks/`. Medido con
`git grep -w -i` de la palabra: 30 líneas en 9 archivos, todos de `app/(app)/` (`cierre-dia`,
`cierres-admin`, `wallet`). `components/`, `hooks/` y `app/_landing/LandingPoliticas.tsx` ya no
la tenían (SL-8 y T4–T6 los dejaron limpios). Los aciertos sin `-w` (`OrdenExistente`) no son la
palabra. Fuera: `lib/`, `db/` (T8 backend), `db/migrations/` (T9), `tests/` y `e2e/` (T10).

**Hecho.** 9 archivos de `app/` y la guardia. Reescritura con un script de un solo uso (en el
scratchpad, no versionado) con pares exactos de texto, cada uno con una sola aparición; los 9 en LF.
Solo cambian comentarios: ni comportamiento ni texto visible. No apareció texto VISIBLE con la
palabra escapado de T4–T6, así que no hay cambio de contrato ni test nuevo.

**Decisiones (criterio de E).**
- Por defecto, «la empresa» (en mayúsculas «LA EMPRESA», «A LA EMPRESA»).
- Como plataforma: «la orden se registró en la plataforma» (`cierres-gestiones-fundida-descarga-columnas.ts`).
- La etiqueta antigua citada («Total …» en `CascadasCierreMensajero.tsx` y `CierresAdminModule.tsx`)
  → «Total de la empresa»: se cita para explicar el fallo, no para conservar el literal.
- Las dos tablas de texto de `CascadasCierreMensajero.tsx` se realinean (la cifra sigue a la derecha).
- Para no repetir «la empresa» dos veces en la misma frase: `cierre-dia-descarga-columnas.ts:8`
  («ese dinero no es suyo») y `cierre-factura.tsx:2642` («es su facturación»).

**Excepciones retiradas de la guardia (9).** Las 9 de `app/(app)/` en `PENDIENTES_SL15`. No queda
ninguna entrada SL-15 de `app/`, `components/` ni `hooks/` (las de `tests/components/` son de T10).

| mutación | test | resultado |
|---|---|---|
| M1 la palabra vuelve en `CajaResumenCard.tsx:99` | `sin-nombre-heredado` | rojo, señala `CajaResumenCard.tsx:99` |

Revertida; la guardia vuelve a `13 passed (13)`.

**Salida.**
- `sin-nombre-heredado`: `13 passed (13)`.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 232 warnings preexistentes.
- `vitest related --run` sobre los 9 archivos: `63 passed (63)` archivos, `1078 passed (1078)` tests.
- Los 27 tests que citan por ruta los archivos tocados (lecturas como texto): `27 passed (27)`,
  `580 passed (580)`.
- MCP del grafo: no se usó; barrido de comentarios con `git grep`/`git diff`.

**Veredicto:** T8 frontend hecha. `app/`, `components/` y `hooks/` ya no tienen la palabra; se
retiran 9 excepciones y lo relacionado está en verde.
- T8 (`ab1288f`): log `_trabajo/SL-15-gate-T8.log`: relacionados `1254 passed | 255 skipped (1509)`, `18989 passed | 2003 skipped (20992)`; guardias `290 passed | 2 skipped (292)`, `3954 passed | 20 skipped (3974)`; `== init OK ==`, `INIT_EXIT=0`.

## T9

**Alcance.** T9.1 y T9.2: las migraciones con la palabra (clase G) y los cuatro tests que las leen
como texto. Fuera: las del usuario maestro (SL-11; ya no llevaban la palabra) y la `459` (SL-13 la
borró). `20260827160000_orden_num_remision_unico_parcial/migration.sql` SÍ entra (medición de T1: SL-13
solo limpió el integrador heredado; la palabra seguía en la línea 62). Son 20 archivos en 19 carpetas.

**T9.1 — hecho.** 24 archivos: 20 de migración (35 líneas de comentario y el mensaje del `RAISE`), 4
tests (6 líneas de comentario y 2 nombres de caso) y la guardia. Script de un solo uso en el
scratchpad (no versionado): pares exactos por archivo, cada uno debe aparecer las veces previstas
(`archivos 24 errores 0`); conserva LF (los 24 `w/lf`). No se renombra ni se consolida nada.

**Decisiones (criterio de E).**
- La empresa usuaria: «la empresa» («caja PRINCIPAL de la empresa», «el cobro de la empresa a una
  tienda», «PAGO DE UNA TIENDA A LA EMPRESA», «NO TOCA LA CAJA DE LA EMPRESA», «sueldo o gasto de la
  empresa»…).
- La plataforma: quien genera `num_guia` (`siguiente_num_guia()`) y quien NO genera `num_remision`
  → «la plataforma», igual que la frase espejo de `schema.prisma` en T8 (migraciones `…825160000` y
  `…827160000`, y los dos tests `orden-num-remision-*`).
- La ruta vieja del módulo de ingreso → `lib/utils/ingreso-empresa.ts` (2 migraciones), como en T8.
- La base local (clase C'): `localhost:5432/servi_logistic`.
- Los clones con el nombre heredado (de la 457, la 461 y la 474; clase F) → `servi_logistic_457`,
  `servi_logistic_461` y `servi_logistic_474`.
- `20260927120100_abono_tienda_457_tablas_y_checks/down.sql`: el `RAISE EXCEPTION` pasa a
  «rollback 457: hay % filas que usan el pago de una tienda a la empresa o su anulacion; se aborta
  sin borrar nada». Cambia el texto, no el comportamiento. `abono-tienda-457-migration` afirma
  `"rollback 457"` (sigue verde); su caso (e), que compara la función dinámica con la de la 461, lee
  el `down` de la migración 1, no este.
- Ninguna sentencia cambió: sobre `git diff -U0 -- db/migrations`, toda línea `+`/`-` empieza por
  `--` salvo el par del `RAISE`.
- **Hecho:** `git grep -il` de la palabra sobre `db/migrations/` no devuelve nada (exit 1): las de
  SL-11 ya no la llevan y la de SL-13 está borrada, así que no queda ninguna cubierta por otra ficha.

**T9.2 — esquema en una base local propia y desechable** (`servi_logistic_sl15`, y la sombra
`servi_logistic_sl15_sombra`). La URL se cargó con `source` desde el scratchpad en cada comando, con
una comprobación por script antes de escribir (local, nombre de base exacto, sin los dos proyectos
remotos ni `supabase`) y la salida filtrada; no se imprimió ni se copió al worktree. No hay `.env` en
el worktree ni `DIRECT_URL` en el entorno (se hizo `unset` igualmente).
- `prisma migrate reset --force`: Prisma 7 ya no admite `--skip-seed`. Sin él, creó la base
  (`PostgreSQL database servi_logistic_sl15 created`) y luego se negó a resetear: detecta un agente y
  exige consentimiento humano explícito. No se forzó. Como la base estaba recién creada y vacía
  (`migrate status`: 228 migraciones, ninguna aplicada), se aplicaron con `prisma migrate deploy`,
  que en una base vacía hace lo mismo que el reset sin borrar nada:
  `All migrations have been successfully applied.` (exit 0). Ninguna migración abortó por datos: no
  hizo falta la siembra de SINPE ni valores inventados.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script --exit-code`
  (base con las 228 aplicadas): `-- This is an empty migration.`, exit 0.
- `prisma migrate diff --from-migrations db/migrations --to-schema db/schema.prisma --script
  --exit-code`: Prisma 7 ya no tiene `--shadow-database-url`; la sombra va en la config. Se usó una
  config de un solo uso en el scratchpad (`--config`, con `shadowDatabaseUrl`); la sombra se creó con
  `prisma db execute --stdin` (`CREATE DATABASE`). Resultado: `-- This is an empty migration.`,
  exit 0.
- Integración con `DATABASE_URL` cargada: los 15 tests de `tests/integration/db/` y `tests/unit/db/`
  que nombran alguna de las 19 carpetas, más los que importan sus fixtures
  (`cobro-tienda-461-completar-migration`, `wallet-461-fechas-cr-migration`) y cuatro que tocan esas
  tablas (`cierre-rechazo-tienda-migration`, `rechazo-tienda-cobro.int`, `abono-tienda-457`,
  `abono-tienda-457-concurrencia`): 21 archivos, `15 passed | 6 failed`,
  `216 passed | 10 failed | 26 skipped`. Los 6 rojos:
  - `cobro-tienda-461-completar-migration` R34: `40P01 deadlock` por correr en paralelo con otro
    archivo que hace `ALTER TABLE`; solo: `6 passed (6)`.
  - `orden-traspaso-migration`, `premio-ranking-devengo-migration`, `rechazo-tienda-cobro.int`,
    `caja-invariante-tiendas` y `wallet-458-migration` (c): fallan ANTES de leer las migraciones, en
    su comprobación de datos: «la tabla `orden` esta vacia… Corre `pnpm run db:seed`», «no hay ningun
    usuario `mensajero`… (SL-31)», «faltan la zona central, el tipo `cedula` o una orden… (SL-31)».
    Una base vacía no los tiene y `db:seed` solo siembra tipos de identificación y roles. No los causa
    este cambio (comentarios y un mensaje; el diff de esquema es vacío): es la deuda de datos de
    prueba de SL-31.
  - Tras rehacer `down.sql` (ver Incidente), los cuatro tests editados, con la base:
    `4 passed (4)`, `54 passed (54)`.
- **Bases locales:** las migraciones se editaron EN SITIO. Una base que ya las tenía aplicadas no ve
  el cambio (solo comentarios y el mensaje de un `RAISE` de un `down.sql`, que `migrate deploy` no
  aplica nunca) y su `_prisma_migrations` guarda el checksum viejo: se rehace con
  `prisma migrate reset` (lo corre el humano; Prisma no deja a un agente) o, si está vacía, con
  `migrate deploy`. El CI parte de una base vacía.
- Las bases `servi_logistic_sl15` y `servi_logistic_sl15_sombra` quedan en el Postgres local; son
  desechables.

**Incidente.** Al revertir la mutación M1 se restauró `down.sql` con `git checkout`, que lo devolvió
a HEAD y borró también la edición de T9.1. La guardia lo cazó (rojo en `down.sql:7` y `:27`); se
reaplicaron las dos líneas y se repitieron la guardia y los cuatro tests con la base.

**Excepciones retiradas de la guardia (24).** Las 20 de `db/migrations/` (todas) y
`tests/integration/db/abono-tienda-457-migration.test.ts`,
`tests/integration/db/caja-tesoreria-migration.test.ts`,
`tests/unit/db/orden-num-remision-parcial.test.ts` y
`tests/unit/db/orden-num-remision-por-tienda.test.ts`, que quedaron limpios del todo.

| mutación | test | resultado |
|---|---|---|
| M1 la palabra vuelve al `RAISE` de `down.sql:27` | `sin-nombre-heredado` | rojo 1/13, señala `down.sql:27` |
| M2 vuelve la excepción de `20260712160000_wallet_movimiento/migration.sql` | `sin-nombre-heredado` | rojo: «ya no cubre nada: bórrala» |
| M3 columna de más (`ALTER TABLE "orden" ADD COLUMN "zz_sl15" integer;`) en la última migración | `prisma migrate diff --from-migrations … --exit-code` | exit 2, propone `DROP COLUMN "zz_sl15"` |

Las tres revertidas; la guardia vuelve a `13 passed (13)`.

**Salida.**
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 232 warnings preexistentes.
- `sin-nombre-heredado`: `13 passed (13)`.
- Las guardias que leen `progress/` (SL-11, SL-13, SL-14, SL-34), una a una: `31`, `7`, `9` y `39 passed | 1 skipped`. Juntas en un solo `vitest run` dieron 3 rojos por tiempo (30-40 s por caso, carga en paralelo), no por contenido.
- MCP del grafo: no se usó; barrido de comentarios con `git grep`/`git diff`.

**Veredicto:** T9 hecha. `db/migrations/` ya no tiene la palabra, solo cambiaron comentarios y el
mensaje del `RAISE`, el esquema da diff vacío contra `schema.prisma` y se retiran 24 excepciones.
- T9 (`1b23c58`): log `_trabajo/SL-15-gate-T9.log`: relacionados `1256 passed | 255 skipped (1511)`, `19006 passed | 2003 skipped (21009)`; guardias `290 passed | 2 skipped (292)`, `3954 passed | 20 skipped (3974)`; `== init OK ==`, `INIT_EXIT=0`. Nota del implementer: `prisma migrate reset` no se pudo ejecutar porque Prisma 7 exige el consentimiento del humano cuando lo lanza un agente. Sobre una base recién creada y vacía, `migrate deploy` hace lo mismo, y el diff contra el esquema salió vacío. Los 5 tests de integración en rojo fallan por falta de datos de partida (remiten a SL-31), no por este cambio.

## T10 (unit e integración)

Parte A de T10.1: `tests/unit/**`, `tests/integration/**` y `tests/baseline-rojos.json`.
129 archivos editados y 1 nuevo. La parte B (`tests/components/`, `tests/fixtures/`, `e2e/`) no se tocó.

**Qué cambió.** Solo comentarios, nombres de caso (`describe`/`it`/`it.each`), mensajes de
aserción y datos de entrada que no son contrato. Lo que comprueba cada test no cambia.
- Comentarios y nombres de caso: la empresa usuaria pasa a «la empresa» («el pago de una tienda a la
  empresa», ««De la empresa»», «Cobró la empresa», ««Total de la empresa»»). Cuando el sujeto es lo
  que se instala o guarda datos, pasa a «la app» o «la plataforma» («la app NUNCA guarda»,
  «el contador interno de la plataforma», «petición SALIENTE de la plataforma»). Lo que habla de la
  historia o de la base heredada pasa a «el producto de origen» o «heredado».
- Datos neutros (design §2 F): `@<palabra>.test` → `@ejemplo.test`; `https://<palabra>.app` →
  `https://ejemplo.app` (también `cdn.ejemplo.app`); `https://<palabra>.cr` → `https://ejemplo.cr`;
  el clon `<palabra>_459` → `servi_logistic_459`; el contenedor `<palabra>-f81-pg` →
  `servi-logistic-f81-pg`; el proyecto GCP de prueba → `servi-logistic-prod-123`; el `name` del
  doble de Meta en `whatsapp-app-id` → `"Servi Logistic"`; el nombre de caso `"solo <palabra>"` →
  `"solo empresa"`. Ninguno lo afirma un `expect` contra un valor de producción.
- `tests/baseline-rojos.json`: la palabra estaba en el TEXTO del `motivo` de
  `dependencias-declaradas-presentes` (no en una ruta). Pasa a «el init.sh del producto de origen»;
  la clave (la ruta) y la ficha que la retira (SL-29) no cambian.

**Decisiones.**
- `caja-173-alcance` (R63) afirmaba que las pantallas congeladas NO contienen el literal de la
  ganancia con la palabra. Ese literal ya no existe en el código: la etiqueta es
  `` `Ganancia de ${EMPRESA.enFrase}` ``. El texto ausente pasa a `"Ganancia de ${EMPRESA"`, que es la
  forma que hoy tiene en el código; así la ausencia sigue midiendo algo (mutación M5).
- `recursos-origen-fuera` (SL-34) importaba la guardia de dominio de SL-14 por su ruta, que lleva la
  palabra (excepción solo de ruta, SL-27): una ruta en un `import` es contenido. Opción mínima: el
  detector `lineasConDominio`, `ExcepcionDominio` y `EXCEPCIONES_DOMINIO` se mueven, sin cambiar una
  línea de lógica, a un módulo nuevo `tests/unit/guards/_dominio-heredado.ts` (no es un test, como
  `_terminos-por-hash.ts`). La guardia de dominio los importa y los reexporta; `recursos-origen-fuera`
  los importa del módulo. La regex del dominio se arma con `NOMBRE_HEREDADO.minusculas`. Efecto
  secundario bueno: importar la guardia de SL-14 ya no registra sus casos dentro de la de SL-34.
- Guardias que detectan la palabra o el dominio, armadas por partes con `tests/fixtures/nombre-heredado.ts`:
  `dominio-…-fuera` (regex y autocomprobaciones), `recursos-origen-fuera` (la forma `github-url` pasa
  a `new RegExp` con la raíz, y sus dos casos sintéticos), `fuera-datos-…` (`const HEREDADO`, y el
  texto de la falta pasa a «nombra el nombre heredado» en el detector y en la contraprueba a la vez),
  `sin-integrador-de-…` (`ESTE_ARCHIVO` con plantilla; el caso que lo lee sigue verde, así que la
  ruta resuelve).
- Se quedan sin tocar, porque los cubre la excepción de línea de SL-16 (nombran un archivo de `docs/`):
  `catalogo-produccion.guardia:491`, `no-emb…:181,184`, `openapi-canal-rutas-reales:10,52`,
  `sin-integrador-de-…:14,33`, `openapi-266-habilitar:165`, `openapi-320-eliminar:248`. Tampoco los
  archivos con excepción propia de SL-16 (`contexto-457/458/460/461`, `openapi-406-evidencias-url`).
- `tests/unit/api/openapi-webhook-contrato.test.ts:233` afirma el `Bearer` con el prefijo viejo que
  sigue en `lib/api/openapi-spec.ts` (decisión de T3: va con SL-16, la decide el leader en T11). Se
  queda pendiente `SL-15`, igual que `lib/api/openapi-spec.ts`.
- `tablero-doble-vs-servicio`: el recuadro del comentario se reflujó para que no se descuadre.

**Mutaciones** (script de un solo uso en el scratchpad; añade una línea, corre la guardia y restaura
el contenido byte a byte; `git status` limpio en esos archivos después):

| mutación | test | resultado |
|---|---|---|
| M1 la palabra en un comentario de `tests/unit/utils/caja-tesoreria.test.ts` (ya sin excepción) | `sin-nombre-heredado` | rojo 1/13, R15 |
| M2 el dominio de la marca anterior en `lib/utils/anotacion-de-fila.ts` | guardia de dominio de SL-14 | rojo 1/9, R9 |
| M3 una URL de PR a un repo `<palabra>-app` en `lib/utils/anotacion-de-fila.ts` | `recursos-origen-fuera` | rojo 1/31, R1-R9/R23 |
| M4 la palabra en `tests/integration/db/_fixtures/orden-minima.ts` | `fuera-datos-…` | rojo 1/31, R16 |
| M5 `` `Ganancia de ${EMPRESA.enFrase}` `` como código en `ResumenMiWallet.tsx` | `caja-173-alcance` | rojo 1/37, R63 |

**Salida.**
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 232 warnings (los mismos de antes).
- `sin-nombre-heredado`: `13 passed (13)`.
- Los 79 archivos de `tests/unit/` tocados: `79 passed`, `1776 passed | 1 skipped`.
- Los 44 de `tests/integration/` tocados (sin base): `15 passed | 29 skipped`, `153 passed | 303 skipped`.
- `vitest related` de los 6 módulos no-test tocados: `8 passed | 43 skipped`.
- `tests/unit/guards` entera: `203 passed | 1 failed`; el rojo es
  `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json` (SL-29).
- MCP del grafo: no se usó; barrido con `git grep`.

**Excepciones retiradas de la guardia (128):** todas las `retira: "SL-15"` de `tests/unit/**`,
`tests/integration/**` y `tests/baseline-rojos.json`, salvo
`tests/unit/api/openapi-webhook-contrato.test.ts`. Quedan 30 pendientes `SL-15`: `e2e/` (3),
`lib/api/openapi-spec.ts`, `tests/components/**` (24), `tests/fixtures/api-key-dependencias-usuario.ts`
y `openapi-webhook-contrato`. Las de ruta de SL-27 (`ingreso-…`, `dominio-…-fuera`, `fuera-datos-…`,
`sin-integrador-de-…`) siguen, con el contenido ya limpio.

**Veredicto:** T10.1 parte A hecha. `tests/unit/` e `tests/integration/` ya no llevan la palabra
salvo las líneas de SL-16 y la aserción de contrato que espera a T11; la guardia retira 128 entradas.

## T10 (componentes, fixtures, e2e)

Parte B de T10.1: `tests/components/**` (24), `tests/fixtures/api-key-dependencias-usuario.ts` y
`e2e/{mi-wallet,wallet,wallet-mensajeros}.spec.ts`. 28 archivos, 66 líneas cambiadas, más la guardia.

**Qué cambió.** Solo comentarios, nombres de caso, mensajes de aserción (`laCuentaCierra(…, "<mensaje>")`)
y datos de entrada. Ningún `expect` afirmaba un literal de producción con la palabra: lo que comprueba
cada test no cambia.
- Comentarios y nombres de caso: la empresa usuaria pasa a «la empresa» («neto de la empresa», «el
  margen de la empresa», «el pago de una tienda a la empresa», «(la empresa debe)»). En los e2e, en
  inglés como el resto del comentario: «the company».
- `CierreFacturaFilaIncidente`: el comentario citaba la cifra «Total <palabra>»; pasa a «Total de la
  empresa», que es el rótulo que hoy tiene `cierre-labels.ts`.
- `WalletDescarga`: el comentario «si «<palabra>» y «Tienda» fueran la misma» pasa a «La empresa», que
  es hoy `DUENO_LABEL.propio` (`EMPRESA.alInicio`).
- Datos neutros (design §2 F): `https://<palabra>.app/paquete/…` → `https://ejemplo.app/paquete/…`
  (escáneres, QR, recogida, verificación de guía, confirmación física); `https://<palabra>.test/…` →
  `https://ejemplo.test/…` (`RecoleccionModule`); `@<palabra>.test` → `@ejemplo.test` (descargas de
  configuración y transversal); el nombre `"Maestra <palabra>"` → `"Maestra Ejemplo"`
  (`IncidentesDescarga`, `BajoRiesgoPaginacion`). En `QrScanner` e `IncidentesDescarga` el mismo valor
  es entrada y salida esperada (el test comprueba que pasa tal cual): cambian los dos a la vez.

**Decisiones.**
- `design-notificaciones/`, `design-whatsapp/`, `DESIGN.md` y `.design-work/` son excepción de SL-16
  (prefijo), no pendientes de SL-15: no se tocan. En `app/(app)/` no queda ninguna pendiente SL-15.
- Ningún archivo de esta parte lleva la palabra en su nombre: no hubo renombres.
- E2E: no se corren (sin dev server; su receta de siembra sigue abierta). Ninguno buscaba en pantalla
  un texto con la palabra (solo estaba en los comentarios de cabecera), así que no hubo que ajustar
  ningún selector. Comprobé con `git grep -F` en `app/ components/ lib/` los 22 textos que buscan:
  18 existen. Faltan 4, y faltaban ya en el merge-base con `dev` (no los quitó SL-15; deriva previa,
  fuera de alcance): `mi-wallet` «Desglose de movimientos» y «Filtrar por concepto»; `wallet`
  «Filtrar por tipo» y «Registrar movimiento manual».
- Quedan sin tocar `tests/unit/api/openapi-webhook-contrato.test.ts` y `lib/api/openapi-spec.ts`
  (el `Bearer` de `evidenciasUrl`, T11).

**Mutaciones.**

| mutación | test | resultado |
|---|---|---|
| M6 la palabra en un comentario al final de `tests/components/QrScanner.test.tsx` (ya sin excepción) | `sin-nombre-heredado` | rojo 1/13, señala `QrScanner.test.tsx:261`; restaurado byte a byte |

**Salida.**
- `sin-nombre-heredado`: `13 passed (13)`.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores y 232 warnings (los mismos de antes).
- Los 24 de `tests/components/` tocados: `24 passed`, `437 passed`.
- `vitest related --run tests/fixtures/api-key-dependencias-usuario.ts`: `1 passed`, `12 passed`.
- Finales de línea: todos los tocados `w/lf`.
- MCP del grafo: no se usó; barrido con `git grep`.

**Excepciones retiradas de la guardia (28):** las 3 de `e2e/`, las 24 de `tests/components/**` y
`tests/fixtures/api-key-dependencias-usuario.ts`. Quedan 2 `retira: "SL-15"`, las dos del `Bearer`:
`lib/api/openapi-spec.ts` y `tests/unit/api/openapi-webhook-contrato.test.ts`.

**Veredicto:** T10.1 parte B hecha; `tests/` y `e2e/` ya no llevan la palabra salvo las excepciones de
otras fichas y la aserción del `Bearer` que espera a T11.
- T10 (`74a1050`): log `_trabajo/SL-15-gate-T10.log`: relacionados `1276 passed | 255 skipped (1531)`, `19273 passed | 2013 skipped (21286)`; guardias `290 passed | 2 skipped (292)`, `3945 passed | 20 skipped (3965)`; `== init OK ==`, `INIT_EXIT=0`.
- Aviso de integración (T10): `EXCEPCIONES_DOMINIO` y `lineasConDominio` de la guardia de dominio de SL-14 viven ahora en `tests/unit/guards/_dominio-heredado.ts`, porque la guardia de SL-34 los importaba por una ruta con el nombre heredado. Si SL-16 edita esas excepciones en la guardia vieja, al integrar hay que llevarlas al módulo nuevo.

## T11

Cierre: T11.1, T11.2 y la parte documental de T11.4. Base del diff: `git merge-base HEAD dev` =
`35f88b1` (`dev` mergeado hasta ahí). `git status -sb` limpio al empezar.

### T11.1 — excepciones (R16)

- Las dos últimas `retira: "SL-15"` (el `Bearer` con el prefijo de llave heredado en la descripción
  de `evidenciasUrl`, `lib/api/openapi-spec.ts:1131`, y su aserción
  `tests/unit/api/openapi-webhook-contrato.test.ts:233`) pasan a `retira: "SL-16"`. Motivo: ese
  texto debe ser idéntico al de `docs/api/api-key-openapi.yaml`, que es de SL-16.
- Acotadas al mínimo que admite la guardia: alcance `linea` con la regex
  `Authorization: Bearer <prefijo heredado>` (armada con `NOMBRE_HEREDADO.prefijoLlave`) y `en` igual
  a la ruta exacta de cada archivo. Ya no cubren el archivo entero: otra línea con la palabra en esos
  dos archivos sale en rojo (mutación M1).
- `PENDIENTES_SL15` y su helper `pendiente` se borran: `EXCEPCIONES` es solo
  `EXCEPCIONES_DE_OTRAS_FICHAS`. Caso nuevo en «lista de excepciones (R16)»: «solo quedan
  excepciones de fichas no integradas: ninguna la retira SL-15».
- Comprobado en el spec de SL-16 (solo lectura, worktree `SL-16-nombre-ordenex-docs`,
  `specs/SL-16-nombre-ordenex-docs/`):
  - `requirements.md:17`: el alcance de SL-16 incluye «`lib/api/openapi-spec.ts` y
    `app/api-docs/route.ts`»; `requirements.md:155`: «Archivos de OpenAPI en el inventario de SL-15
    (P3) | Pasan a SL-16: `lib/api/openapi-spec.ts`, …»;
  - `requirements.md:118-119`: «**R16.** Toda descripción que esta feature cambie en
    `lib/api/openapi-spec.ts` DEBE aparecer igual, con los espacios colapsados, en
    `docs/api/api-key-openapi.yaml`.»;
  - `design.md:117-118`: «Si SL-15 ya cambió un rótulo o un identificador cuando se implemente SL-16,
    el doc pasa a decir lo que dice el código, y esa excepción no se escribe.» Y `tasks.md:9` (T0)
    exige SL-15 integrado en `dev` antes de empezar: SL-16 encuentra `svl_` en el generador y cambia
    el `Bearer` del YAML y de `openapi-spec.ts` a la vez.
  - Matiz para el reviewer: `requirements.md:23-25` de SL-16 dice que renombrar los prefijos «lo hace
    SL-15». SL-15 lo hizo en el código que los emite (`lib/utils/api-key-generator.ts`); la frase de
    la descripción vive en un archivo que la decisión P3 pasó a SL-16. La cobertura sale de su R16 y
    del criterio de `design.md:117`; ninguna línea del spec de SL-16 nombra esta frase en concreto.

Mutaciones (restauradas con `git checkout` y con copia; `git status` sin más cambios que la guardia):

| Mutación | Resultado |
|---|---|
| M1 `// <prefijo heredado>abc` al final de `lib/api/openapi-spec.ts` | rojo 1/14: R15 señala `lib/api/openapi-spec.ts:2443` |
| M2 las excepciones con `retira: "SL-16"` de la guardia pasan a `"SL-15"` | rojo 1/14: «solo quedan excepciones de fichas no integradas» |

Guardia `sin-nombre-heredado`: `14 passed (14)` (13 + el caso nuevo).

### T11.2 — revisión del diff contra `dev` (R18)

Script: `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/t11-revision-diff.mjs`
(`node t11-revision-diff.mjs <repo> <base> [hasta]`). Lee `git diff --name-only` y `git diff -U0`.
Para cada línea `-` con el dominio de la marca anterior, el integrador, una provincia, `SINPE` o un
importe en colones, busca su par `+` en el mismo hunk (máximo de tokens comunes) y la marca si: no
tiene par, cambia la ocurrencia del término, quita un token que no lleva la palabra heredada, o la
línea `-` no lleva la palabra y aun así cambia. Autocomprobación: sobre el merge de SL-13
(`55f18ac^1..55f18ac`) marca 204 de 204 líneas del integrador; muerde.

Salida sobre `35f88b1...HEAD`:

```
archivos en el diff: 665
specs/ en el diff: 3 (specs/SL-15-nombre-ordenex-codigo/design.md, specs/SL-15-nombre-ordenex-codigo/requirements.md, specs/SL-15-nombre-ordenex-codigo/tasks.md)
specs/ fuera de SL-15: 0
entradas de arnes.manifest: 43; archivos del manifest en el diff: 0

lineas - con dominio/integrador/provincia/SINPE/colon: 67; solo cambia la palabra: 64; a revisar: 3
por clase: {"colon":59,"SINPE":8}
```

- `specs/`: solo el spec propio. Cambió por las guardias de SL-14 (el dominio escrito en palabras,
  `592c4ce`) y de SL-34 (recursos de origen, al traer `dev`); ningún `specs/` ajeno.
- `arnes.manifest`: ninguno de sus 43 archivos o carpetas está en el diff.
- Dominio, integrador y provincias: 0 líneas `-` (el diff no las toca).
- Los 3 marcados, revisados a mano, son el mismo caso:
  - `tests/components/EstadoCuentaMensajeroAnular.test.tsx:104` y `:141`:
    `"Ver Liquidación del 2026-09-15 por ₡5.000"` → `"Ver «Liquidación» del 2026-09-15 por ₡5.000"`;
  - `tests/components/WalletLedgerVer458C.test.tsx:172`:
    `"Ver Sueldo del 2026-09-20 por ₡25.000"` → `"Ver «Sueldo» del 2026-09-20 por ₡25.000"`.

  El importe no cambia. Las comillas vienen de `PANEL_TEXTO.verNombre`/`verNombreAnulado` (`5e21297`,
  T4 frontend, «Decisiones», «Mayúscula a mitad de frase»): el concepto que ahora empieza por «La
  empresa …» se cita entre «» dentro de la frase, y la plantilla cambia para todos los conceptos. No
  es un literal de colones editado: es el nombre accesible que produce el código, y el test lo afirma
  como literal (R19). Lo acepto.
- Las 64 restantes: el importe, `SINPE` y el resto de la línea quedan iguales; solo cambia la palabra
  (o el identificador que la lleva, p. ej. `NETO_<PALABRA>_LABEL` → `NETO_EMPRESA_LABEL`). Muestra
  revisada a mano con `VER_OK=1`.

### T11.3 — comprobación visual: NO ejecutada

No se ejecutó: el leader prohibió levantar dev servers en esta tanda. **Pendiente para el humano.**
Evidencia sustituta que sí existe:
- `/wallet` y `/mi-wallet`: render de la página en `tests/integration/wallet-page.test.tsx` y
  `tests/integration/mi-wallet-page.test.tsx`, describe «SL-15 R21» (texto legible sin la palabra ni
  «Servi Logistic» en los textos de dinero, con «la empresa» donde antes iba).
- `/cierres-admin`: tests de componente de cierres, `tests/components/CierreBodegaDetalleCascadas.test.tsx`
  («SL-15 R4»), `CierreBodegaDesglosePorTienda`, `CierreFacturaSinGestionar`,
  `CierreMensajeroDetalleCascadas` y la guardia `cierre-bodega-vocabulario` («SL-15 R3»).
- `/analitica`: `tests/unit/analytics/metrics.test.ts` («SL-15 R3/R4») y
  `tests/components/ProductosTablaDinero.test.tsx`.
- Etiqueta PDF: `tests/unit/pdf/etiquetas-pdf-lote.smoke.test.ts` («SL-15 R7»), que lee el PDF real
  con `tests/unit/pdf/pdf-inspector.ts`; vista previa en `tests/components/EtiquetaGuia.test.tsx`.
- `/configuracion/api`: prefijo `svl_` y 11 caracteres visibles en
  `tests/unit/utils/api-key-generator.test.ts` («SL-15 R11»); textos de la pantalla en
  `tests/components/ApiKeysModule.test.tsx` («SL-15 R3»).
- Aviso de versión nueva (`AvisoVersionNueva`): `tests/unit/guards/pwa-aviso-sin-recarga.guardia.test.ts`
  (G3) afirma el título entero «Hay una versión nueva de Servi Logistic».

### T11.4 — mapa R → test (completo)

| R | Test |
|---|---|
| R1 | `tests/unit/config/marca.test.ts` |
| R2 | `tests/unit/api/titulo-marca-plataforma.test.ts` (`info.title` y `<title>` de `/api-docs`), `tests/unit/asistente/instrucciones.test.ts`, `tests/components/AsistentePanel.test.tsx`, `tests/unit/services/email-notificacion.test.ts` (OTP), `tests/unit/config/email-config.test.ts`, `tests/unit/utils/aviso-ubicacion-denegada.test.ts`, `tests/components/PushOptIn.test.tsx`, `tests/unit/guards/pwa-aviso-sin-recarga.guardia.test.ts` (G3) |
| R3 | wallet (T4): `tests/unit/components/wallet-labels.test.ts`, `mi-wallet-labels.test.ts`, `wallet-textos-458`, `caja-textos-459`, `nombres-wallet-461` y los componentes de la wallet; cierres y analítica (T5): `cierre-bodega-vocabulario.guardia` «SL-15 R3», `ProductosTablaDinero` «SL-15 R3», `tests/unit/analytics/metrics.test.ts` «SL-15 R3»; resto (T6): `catalogo-y-choke-point` «SL-15 R3», `plantilla-datos` «SL-15 R3», `ApiKeysModule`, `TarifasClaridadMontos`, `ConfiguracionEnviosWhatsappPage`, `rechazo-nombre-466-app` |
| R4 | `wallet-labels.test.ts` y `EstadoCuenta.test.tsx` «SL-15 R4» (T4); `metrics.test.ts` y `CierreBodegaDetalleCascadas.test.tsx` «SL-15 R4» (T5); `catalogo-y-choke-point`, `plantilla-datos`, `etiquetas-pdf-lote.smoke` (R7 con mock), `informe-transito-pdf` y `picking-pdf`, con `vi.doMock("@/lib/config/marca")` (T6) |
| R5, R6 | `tests/unit/guards/marca-estaticos.guardia.test.ts` |
| R7 | `tests/unit/pdf/etiquetas-pdf-lote.smoke.test.ts` «SL-15 R7» (PDF real con `pdf-inspector`, sin y con membrete, antes del recuadro), `tests/components/EtiquetaGuia.test.tsx` «SL-15 R7» |
| R8 | `tests/unit/pdf/informe-transito-pdf.test.ts` y `tests/unit/whatsapp-envios/picking-pdf.test.ts`, «SL-15 R8» |
| R9 | `tests/unit/guards/pwa-relevo-y-purga.guardia.test.ts`, `tests/unit/hooks/usePushEnVentana.test.tsx`, `tests/unit/guards/tema-encendido.guardia.test.ts` «SL-15 R9» (cookie `servi_logistic_tema`), `tests/unit/manifiesto/preferencia-columnas.test.ts` |
| R10 | `tests/unit/crypto/webhook-firma.test.ts`, `tests/unit/clients/webhook-sender.test.ts`, `tests/unit/api/openapi-webhook-estado-actualizado.test.ts` «SL-15 R10» |
| R11 | `tests/unit/utils/api-key-generator.test.ts`, `tests/unit/utils/api-key-hash.test.ts`, `tests/unit/services/api-key-auth-service.test.ts` «SL-15 R11» (401 con el prefijo anterior), `openapi-webhook-estado-actualizado.test.ts` «SL-15 R11» (`Bearer svl_...`) |
| R12 | `tests/unit/services/analitica-rollup-handler.test.ts` «SL-15 R12» |
| R13 | `pnpm run typecheck` (renombre atómico), `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`, `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` y el test de `lib/utils/ingreso-empresa.ts`, que conserva su ruta (excepción de SL-27) (T7) |
| R14 | `sin-nombre-heredado.guardia` (migraciones sin la palabra) y T9.2: `prisma migrate deploy` sobre una base desechable y `prisma migrate diff --from-migrations … --to-schema db/schema.prisma --exit-code` vacío (mutación M3 de T9: exit 2) |
| R14b | `sin-nombre-heredado.guardia` (`db/schema.prisma` sin la palabra), el script de T8 sobre `git diff -U0` («fuera de comentario 0»), `prisma validate` y el `migrate diff` vacío de T9.2 |
| R15, R16, R17 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`, con su autocomprobación; R16 además con «ninguna excepcion sobra» y «solo quedan excepciones de fichas no integradas» (T11); R17 con `tests/fixtures/nombre-heredado.ts` |
| R18 | la revisión del diff de T11.2 (arriba) |
| R19 | los tests de contrato de T2 a T10 con el literal escrito a mano (p. ej. `titulo-marca-plataforma`, `instrucciones`, `AsistentePanel`, `pwa-aviso-sin-recarga`, `email-notificacion` y los de R3) |
| R20 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`, que recorre `tests/` y `e2e/` |
| R21 | `tests/integration/wallet-page.test.tsx` y `tests/integration/mi-wallet-page.test.tsx` «SL-15 R21», con `tests/fixtures/texto-leible.ts` |
| R22 | `./init.sh` con `INIT_EXIT=0` en T1–T10 (sección «Gate por tanda», 10 entradas); el de T11 lo corre el leader |

### Salida

- `pnpm exec vitest run tests/unit/guards/sin-nombre-heredado.guardia.test.ts`: `14 passed (14)`.
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, `232 problems (0 errors, 232 warnings)` (los mismos de antes).
- MCP del grafo: no se usó; Grep/Read y `git diff`.

**Excepciones retiradas:** las 2 últimas `retira: "SL-15"` (reasignadas a SL-16 y acotadas a una
línea). Quedan 0 de SL-15.

**Veredicto:** T11.1, T11.2 y el mapa de T11.4 hechos; T11.3 pendiente para el humano.
- T11 (`de692ff`), gate final: log `_trabajo/SL-15-gate-T11.log`: relacionados `1276 passed | 255 skipped (1531)`, `19274 passed | 2013 skipped (21287)`; guardias `290 passed | 2 skipped (292)`, `3946 passed | 20 skipped (3966)`; «1 rojo(s) heredado(s) del baseline»; `== init OK ==`, `INIT_EXIT=0`.
- Pendientes para el humano: T11.3 (comprobación visual de `/wallet`, `/mi-wallet`, `/cierres-admin`, `/analitica`, la etiqueta PDF, `/configuracion/api` y el aviso de versión); en esta tanda no se podían levantar dev servers. Rehacer las bases locales con `prisma migrate reset` (Prisma 7 exige que lo lance un humano). Cuatro textos que buscan los e2e de wallet no existen en el código, y ya faltaban antes de SL-15.
