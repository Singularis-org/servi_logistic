# SL-14 — Diseño

> El dominio de Ordenex se escribe como la regex `ordenex\.co` o como `<dominio-ordenex>`, nunca
> literal (requirements > «Cómo se escribe el dominio en este spec»).

## Lo que ya existe

Términos buscados: `dominio`, `SITE_URL`, `APP_URL`, `APP_BASE_URL`, `VAPID`, `example.com`, `ordenex\.co`.

- **Board** (`feature_list.json`, todos los estados): ninguna otra ficha trata el dominio ni el
  origen público. Tres fichas se solapan **en archivos**, no en alcance:
  - SL-8: landing, paleta y `app/layout.tsx`;
  - SL-11: `scripts/seed-maestro.ts`;
  - SL-16: `docs/api/`.

  Las tres quedan como excepciones temporales de la guardia (R10). Además, SL-10 versiona
  `.env.example` (decisión del humano, P4).
- **Specs:** el dominio aparece en 6 specs de Ordenex (86, 288, 404, 406 ×2, 426). SL-14 no los toca:
  los retira SL-27. En el spec 234, `git grep` también marca
  `ingresoOrdenex.comision…`, pero es un falso positivo. Ningún spec define un dominio configurable.
- **Código** (Grep/Read; en esta sesión no había herramientas del grafo `codebase-memory-mcp`).
  **Ya hay código que resuelve el origen público, y se reutiliza:**

  | Consumidor | Variable | Si falta |
  |---|---|---|
  | QR de etiqueta (`lib/utils/paquete-url.ts > resolveAppOrigin`) | `NEXT_PUBLIC_APP_URL` | `window.location.origin`, o ruta relativa |
  | `evidenciasUrl` del webhook (`lib/config/webhook.ts > WEBHOOK_APP_ORIGIN`) | `NEXT_PUBLIC_APP_URL` | se omite el campo |
  | `enlace` del aviso interno (`lib/config/whatsapp-envios.ts > baseUrlEnlace`) | `NEXT_PUBLIC_APP_URL`, si no `NEXT_PUBLIC_SITE_URL` | la ejecución sale `error` nombrando `enlace` |
  | `{{url_guia}}` (`lib/utils/whatsapp-envio-valores.ts`) | `NEXT_PUBLIC_SITE_URL` | cadena vacía |
  | `metadataBase` (`app/layout.tsx`) | `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
  | Remitente de correo (`lib/config/email.ts`) | `SMTP_USER`, `SMTP_FROM` | sin canal |

  `APP_BASE_URL` solo aparece en `.github/workflows/gate.yml` (entorno del E2E). Las dos variables
  `NEXT_PUBLIC_*` están en el README, pero no en `.env.example`.
- **Valor de verdad con el dominio:** solo `DEFAULT_SUBJECT` de `lib/config/push.ts`.
- **Migraciones:** ninguna de `db/` lleva el dominio. Lo mismo `public/`, `e2e/`, `.github/` y
  `.claude/`. Si apareciera en una migración ya aplicada, se editaría en sitio (decisión del humano:
  no hay ninguna base desplegada y la historia se aplana antes del primer push).
- **`example.com`** ya es el dominio de fixtures del repo (112 archivos de `tests/` y `e2e/`), y SL-11
  lo fija para los seeds.

## Modelo de datos, autorización y país

No aplica: no hay tablas, RLS, migraciones ni cambios de autorización, ni datos que dependan del
país. Los textos de Costa Rica de las líneas tocadas no cambian.

## D1 — `VAPID_SUBJECT` obligatoria (R1–R3)

`lib/config/push.ts`:

- Se borra `DEFAULT_SUBJECT`.
- `piezasVapidAusentes()` mira `[VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT]`, en ese orden.
  `pushConfigurado()` y `clavePublicaPush()` heredan el cambio sin tocarse.
- `loadPushConfig()` lanza `PushNoConfiguradoError(VAPID_SUBJECT)` si falta.
- Se actualizan el comentario de `pushConfigurado` y el de cabecera.

Se mantiene el invariante R30 de la ficha 410 de Ordenex: un push sin configurar no rompe nada. El
borde ya pregunta a `pushConfigurado()` antes de actuar, así que sin `VAPID_SUBJECT` pasa lo mismo que
hoy sin claves:

- el control de activación no se ofrece;
- no se encola nada;
- el handler deja constancia del nombre de la variable.

`lib/services/jobs/push-web-handler.ts` y `lib/notificaciones/notificadores.ts` no cambian.

**Tests afectados:**

- `tests/unit/config/push-config.test.ts`: los casos «hay canal SOLO con las dos» y «nombra las dos
  que faltan» se reescriben a tres piezas. El caso que esperaba el default retirado pasa a ser el de
  R1/R3.
- `tests/unit/actions/push-action.test.ts`, `tests/unit/services/push-web-service.test.ts` y
  `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts` ponen hoy solo las dos claves. Si alguno
  activa push con ellas, añade `VAPID_SUBJECT`; si no, no se toca.

### Alternativa descartada: derivar el `subject` de `NEXT_PUBLIC_SITE_URL`

VAPID acepta un `subject` `https:`. Se descarta por tres motivos:

1. En desarrollo el valor es `http://localhost:3000`, que `web-push` rechaza, y habría que diseñar qué
   hacer en ese caso.
2. El `subject` es un contacto para el servicio de push, no el dominio de la app.
3. La variable ya existe: volverla obligatoria es el cambio más pequeño. Lo confirmó el humano (P2).

### Alternativa descartada: una variable nueva `PUBLIC_DOMAIN` / `APP_BASE_URL` para todo

Obliga a migrar cinco consumidores que ya funcionan, cada uno con su regla de ausencia ya testeada.
Es rediseño, no arreglo mínimo, y rompe R13.

## D2 — Ejemplos con dominio reservado (R7)

Se cambia `<dominio-ordenex>` por `example.com`, conservando subdominio, ruta y parte local:

| Archivo | Después |
|---|---|
| `lib/types/plantilla-datos.ts`: `ejemplo` de `url_guia` | `https://example.com/?guia=10432` |
| `lib/types/plantilla-datos.ts`: `DATOS_PLANTILLA_EJEMPLO.negocio.urlBase` | `https://example.com` |
| `lib/types/plantilla-datos.ts`: JSDoc de `urlBase` | «p. ej. `https://example.com`» |
| `lib/whatsapp-envios/informes/aviso-interno.ts`: `ejemplo` de `enlace` | `https://example.com/cierres` |
| `lib/api/openapi-spec.ts`: ejemplo de `evidenciasUrl` | `https://app.example.com/api/ordenes/api-key/orden/100235` |
| `lib/utils/linkificar.ts`: dos comentarios | `www.example.com`, `example.com/guia` |

Los dos literales de `plantilla-datos.ts` cambian juntos. Así `valorDeCampo(campo,
DATOS_PLANTILLA_EJEMPLO) === campo.ejemplo` (`tests/unit/types/plantilla-datos.test.ts`) sigue verde.

Corrección del 2026-10-22: el caso de paridad de `openapi-webhook-estado-actualizado` SÍ compara
el ejemplo entre TS y YAML. Por eso el ejemplo `evidenciasUrl` del YAML cambia junto con el TS
(ampliación de R12). El resto de `docs/api/` sigue siendo de SL-16.

### Alternativa descartada: armar el ejemplo con el dominio configurado

El `ejemplo` vive en catálogos constantes que los tests comparan con los datos de ejemplo. Leerlo del
entorno lo haría depender del build, y sin la variable quedaría vacío, cuando el catálogo exige un
`ejemplo` no vacío. El humano aceptó `example.com` (P3).

## D3 — Fixtures de tests (R9)

En los 23 archivos de `tests/` que son de SL-14, la misma sustitución:

- `https://app.<dominio-ordenex>` → `https://app.example.com`
- `https://<dominio-ordenex>` → `https://example.com`
- `*@<dominio-ordenex>` → `*@example.com`

Cuidados (memoria del proyecto: «Literal: contrato o polizón»):

- **Pares entrada/aserción:** los dos lados cambian en el mismo commit. Por ejemplo, el
  `not.toContain` del mismo email en `webhook-orden-reader.test.ts`, o la `BASE` de
  `informe-aviso-interno.test.ts`. Ninguna aserción se afloja ni se sustituye por su propia fuente.
- **`tests/unit/guards/pwa-push.guardia.test.ts`:** `hostname` y URL de la ventana cambian juntos.
- **la guardia del término vetado:** solo cambia el comentario de la línea 160. SL-10 edita
  este archivo, y SL-14 lo toca después de integrarse SL-10.
- **`tests/unit/services/nodemailer-email-sender.test.ts`:** `name: "Ordenex"` se queda (SL-15).
- **`tests/unit/api/openapi-406-evidencias-url.test.ts`:**
  - SL-14 cambia solo la línea 63, que es el ejemplo TS.
  - Las líneas que leen el YAML y el CHANGELOG de `docs/api/` siguen hasta SL-16.
  - Por eso todo el archivo es una excepción temporal de SL-16.
- **Tests de integración con base:** solo cambia el literal del origen; el baseline de SL-10 manda.

## D4 — Docs del plan sin el literal (R9)

Hoy son prosa permanente, pero bajo la regla nueva no queda ninguna excepción permanente. Se
reescriben sin el literal y sin perder el sentido:

- `docs/limpieza-ordenex.md` §4: el título pasa a «4. Dominio de Ordenex». Se añade una línea que
  remite a la guardia como medida viva y a sus excepciones temporales. El comando `git grep … 'ordenex\.co'` no casa con el detector, porque la barra
  rompe la coincidencia, y se queda.
- `docs/plan-saas.md:63` y `docs/checkpoints-proyecto.md:31`: «el dominio de Ordenex», sin literal.

## D5 — Contenido de `.env.example` (R8)

Precondición: SL-10 ya versionó el archivo (P4). SL-14 no toca `.gitignore`. Cambios:

- En el bloque VAPID, `VAPID_SUBJECT` se marca como obligatoria y se borra la línea del default de
  Ordenex.
- Bloque nuevo «Origen público de la app», con `NEXT_PUBLIC_APP_URL=` y `NEXT_PUBLIC_SITE_URL=`. Su
  comentario dice qué consumidor usa cada variable, qué pasa si falta (la tabla de «Lo que ya
  existe») y que se inlinean al compilar.

## D6 — Guardia `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (R9–R11)

- **Universo:** `git ls-files`, que no ve `.worktrees/`, más `.env.example`. Se excluyen los binarios
  por extensión, como hace la guardia del término vetado. También queda fuera `progress/`: es el estado del arnés, no
  la app (decisión del humano). No es una excepción de la lista, sino que no se recorre, así que no
  tiene poda.
- **Detector:** función pura `lineasConDominio(texto): number[]` con
  `new RegExp("ordenex" + "\\.co(?![a-z0-9-])", "i")`. La regex se compone por partes para que el
  archivo de la guardia no contenga el literal. La negación de después:
  - evita los identificadores, como `ingresoOrdenex.comision`;
  - deja fuera también el `.com` de Ordenex. Ese dominio no aparece hoy en el repo, y si se quiere
    vigilar se abre una ficha.
- **Excepciones:** constante `{ ruta, ficha, motivo }`. Todas son temporales y `ficha` es
  obligatoria. Las rutas que terminan en `/` son prefijos; los 6 specs de Ordenex van por archivo, no
  como `specs/`. Entradas:

  | Ruta | Ficha |
  |---|---|
  | `app/_landing/LandingNav.tsx` | SL-8 |
  | `app/_landing/primitivas.tsx` | SL-8 |
  | `app/page.tsx` | SL-8 |
  | `app/globals.css` | SL-8 |
  | `scripts/seed-maestro.ts` | SL-11 |
  | `docs/api/` | SL-16 |
  | `tests/unit/api/openapi-406-evidencias-url.test.ts` | SL-16 |
  | los 6 specs de Ordenex (uno por archivo) | SL-27 |

- **Poda (R10):** si una entrada ya no existe o ya no contiene el dominio, la guardia sale en rojo con
  «la entrada `<ruta>` (ficha `<SL-n>`) ya no tiene el dominio: bórrala de la lista». Así SL-8, SL-11 y
  SL-16 y SL-27 la vacían al limpiar su parte, y cuando no queda ninguna entrada, la limpieza está cerrada.
- **Autocomprobación (R11):** casos sintéticos que muerden y casos que no. Los que muerden se
  construyen por concatenación, igual que la regex.
- Contiene `guard` en el nombre, así que entra en `gate.siempre` y corre en cada `./init.sh`.

## Riesgos

- **Push sin `VAPID_SUBJECT`** deja de enviar sin errores visibles. El handler registra la pieza que
  falta y hoy no hay despliegues.
- **Orden de integración:** SL-10 primero (`.env.example` versionado y la guardia del término vetado). Las dos
  fichas son del mismo assignee.
- **Avisar a SL-8, SL-11, SL-16 y SL-27:** la guardia les saldrá en rojo cuando limpien su parte, y
  tendrán que borrar su entrada.
- **SL-15 en paralelo** toca el nombre «Ordenex» en algunos de los mismos tests. El rebase es trivial.
