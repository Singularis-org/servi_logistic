# SL-16 «Nombre «Ordenex» en docs, API y diseños» — bitácora del implementer

Worktree `.worktrees/SL-16-nombre-ordenex-docs`, rama `feature/SL-16-nombre-ordenex-docs`.
Sin base de datos: la feature no toca datos.

## T0 — Precondiciones (2026-10-22)

- `git merge da40c12` (dev con SL-8, SL-34 y SL-15): limpio → `b4dde73`.
- `git merge-base --is-ancestor e6abe5a HEAD` (SL-10) → `0`.
- SL-15 integrada. `EMPRESA` vive en `lib/config/marca.ts`, **sin campo `nombre`**:
  `EMPRESA.enFrase` = «la empresa», `EMPRESA.alInicio` = «La empresa», `membrete: null`.
  La plataforma es `MARCA.nombre` = «Servi Logistic». Término de transición: «la empresa».
- Cabeceras `X-Servi-Logistic-*` y prefijos `svl_` / `svl_whsec_` ya en el código (SL-15).
- El worktree no tenía `node_modules`: se creó el junction al compartido con
  `New-Item -ItemType Junction` (PowerShell). Nada instalado.

### Ajuste del spec (leader, 2026-10-22) → `f44f0d2` y `be8b7b9`

- Correcciones donde el spec decía «la retira SL-15»: no hay excepciones de identificador ni de
  cita (SL-15 ya renombró); el dominio de `docs/api/` lo dejó SL-14 a SL-16 (`EXCEPCIONES_DOMINIO`,
  `tests/unit/guards/_dominio-heredado.ts`). `EMPRESA.nombre` → `EMPRESA.enFrase`/`alInicio`.
- Nuevos R22–R25 y task T7b (Bearer de `evidenciasUrl`, dominio de `docs/api/`, excepciones
  `retira: "SL-16"` de SL-15 y SL-34, `docs/jira.md`, `pnpm-lock.yaml`).
- Origen del email de `pnpm-lock.yaml`: el campo `deprecated` de `glob@7.2.3`, que publica el autor
  del paquete en el registro de npm → excepción permanente documentada (R24).
- Primera corrida del gate: `INIT_EXIT=1`. Las guardias de SL-14 (dominio) y SL-34 (recursos de
  origen) marcaban **el propio spec de SL-16**: nombraba el dominio, el integrador y un email de
  ejemplo no reservado. Reescrito con los marcadores de SL-34 (`<tu-email>@example.com`, «el
  integrador», «el dominio de la marca anterior») → `be8b7b9`.

`./init.sh` (rápido), log `_trabajo/gate-T0.log`:

```
 Test Files  290 passed | 2 skipped (292)
      Tests  3946 passed | 20 skipped (3966)
[test:rapido] 1 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
INIT_EXIT=0
```

## T1 — Medir y clasificar (2026-10-22, backend_dev)

Medido con un script de un solo uso (scratchpad, no versionado) sobre el árbol de `6e9cadd`,
con el alcance cerrado de `design.md > Alcance de la guardia`. Cuenta cada aparición de la palabra
(sin distinguir mayúsculas) y del prefijo de llave heredado; el dominio se cuenta aparte (es la
palabra seguida de `.co`, o `\.co` en una regex). El grafo no se usó: todo es texto de docs, Grep
y lectura bastan.

### Suelo de archivos (R14)

- Hoy el alcance recorre **85 archivos**: `docs/api/` 7, `docs/ayuda/` 34, `design-notificaciones/` 6,
  `design-whatsapp/` 12, `tests/unit/api/openapi-*.test.ts` 19, y 7 sueltos (`DESIGN.md`,
  `lib/api/openapi-spec.ts`, `app/api-docs/route.ts`, `openapi-canal-rutas-reales.guardia.test.ts`
  y los tres de historia).
- T7 borra `design-notificaciones/notificaciones-ordenex.html` (R3) y T4 renombra la colección
  (no cambia el número). **Suelo firmado: 84** = 85 − 1, para que la guardia no se ponga roja por
  el borrado de T7. Si otra ficha retira archivos del alcance, lo baja a mano con el motivo.

### Tabla por archivo

Columnas: plataforma (P) · operador (O; entre paréntesis, cuántas son cita de un rótulo que el
código ya dice con `EMPRESA`) · dominio (D) · identificador viejo (I) · ruta con la palabra (R) ·
historia (H). «Cita» y «identificador viejo» ya no son excepción: el doc pasa a decir lo que dice
el código hoy.

| Archivo | P | O (citas) | D | I | R | H |
|---|---|---|---|---|---|---|
| `DESIGN.md` | 1 | 0 | 0 | 0 | 0 | 0 |
| `design-notificaciones/Push.dc.html` | 3 | 0 | 0 | 0 | 0 | 0 |
| `design-notificaciones/notificaciones-ordenex.html` | — | — | — | — | 1 | — |
| `design-whatsapp/Formulario.dc.html` | 1 | 0 | 0 | 0 | 0 | 0 |
| `design-whatsapp/Historial.dc.html` | 1 | 0 | 0 | 0 | 0 | 0 |
| `design-whatsapp/ListaMovil.dc.html` | 2 (1 cita) | 0 | 0 | 0 | 0 | 0 |
| `design-whatsapp/Main.dc.html` | 2 (1 cita) | 0 | 0 | 0 | 0 | 0 |
| `design-whatsapp/Vacio.dc.html` | 2 (1 cita) | 0 | 0 | 0 | 0 | 0 |
| `design-whatsapp/PdfPicking.dc.html` | 0 | 2 | 0 | 0 | 0 | 0 |
| `design-whatsapp/PdfTransito1.dc.html` | 0 | 2 | 0 | 0 | 0 | 0 |
| `design-whatsapp/PdfTransito2.dc.html` | 0 | 1 | 0 | 0 | 0 | 0 |
| `docs/api/CHANGELOG.md` | 4 | 1 | 3 | 12 | 0 | 0 |
| `docs/api/api-key-openapi.yaml` | 3 | 2 | 0 | 2 | 0 | 0 |
| `docs/api/guia-integracion/README.md` | 3 | 0 | 0 | 0 | 0 | 0 |
| `docs/api/guia-integracion/guia-integracion.html` | 18 | 19 | 9 | 14 | 0 | 0 |
| `docs/api/manual-metricas-por-mensajero.md` | 0 | 0 | 1 | 2 | 0 | 0 |
| `docs/api/ordenex-api-key.postman_collection.json` | 1 | 0 | 0 | 2 | 1 | 0 |
| `docs/ayuda/README.md` | 2 | 0 | 0 | 0 | 0 | 0 |
| `docs/ayuda/compartido/analitica.md` | 0 | 1 | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/cierres.md` | 0 | 1 | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/configuracion-plantillas.md` | 0 | 1 | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/configuracion-tarifas.md` | 0 | 1 | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/wallet-caja.md` | 0 | 121 (43) | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/wallet-mensajeros.md` | 0 | 3 (1) | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/wallet-satelites.md` | 0 | 2 | 0 | 0 | 0 | 0 |
| `docs/ayuda/oficina/wallet-tiendas.md` | 0 | 32 (12) | 0 | 0 | 0 | 0 |
| `docs/ayuda/publico/entrar-y-recuperar-contrasena.md` | 1 | 0 | 0 | 0 | 0 | 0 |
| `docs/ayuda/publico/rastreo-de-paquete.md` | 2 | 0 | 0 | 0 | 0 | 0 |
| `docs/ayuda/tienda/mi-wallet.md` | 0 | 50 (18) | 0 | 0 | 0 | 0 |
| `docs/limpieza-ordenex.md` | 0 | 0 | 0 | 0 | (1) | 35 |
| `docs/plan-saas.md` | 0 | 0 | 0 | 0 | 0 | 21 |
| `docs/marca.md` | 0 | 0 | 0 | 0 | 0 | **0** |
| `lib/api/openapi-spec.ts` | 0 | 0 | 0 | 1 | 0 | 0 |
| `tests/unit/api/openapi-266-habilitar.test.ts` | 1 | 0 | 0 | 0 | 0 | 0 |
| `tests/unit/api/openapi-320-eliminar.test.ts` | 1 | 0 | 0 | 0 | 0 | 0 |
| `tests/unit/api/openapi-406-evidencias-url.test.ts` | 0 | 0 | 3 | 0 | 0 | 0 |
| `tests/unit/api/openapi-webhook-contrato.test.ts` | 0 | 0 | 0 | 1 | 0 | 0 |
| `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts` | 2 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **50** | **239 (74)** | **16** | **34** | **2** | **56** |

Notas de la tabla:
- `notificaciones-ordenex.html` (6 apariciones dentro y la ruta) no se clasifica: se retira (R3).
- Las 5 «P» de ruta de la colección (`CHANGELOG.md` l. 710, `openapi-266` l. 165, `openapi-320`
  l. 248, `openapi-canal-rutas-reales` l. 10 y 52) pasan a `servi-logistic-api-key.postman_collection.json`.
  La l. 58 de `openapi-canal-rutas-reales` que citaba el design ya no tiene la palabra (SL-15).
- `docs/limpieza-ordenex.md`: la ruta cuenta dentro de su excepción de historia (R5).
- `.design-work/` (16 archivos, 5 apariciones en 3 archivos y una ruta) no es raíz del alcance:
  se retira entera (R4) y la guardia solo afirma que no existe.
- Fuera del alcance de la guardia, `tests/unit/asistente/contexto-{457,458,460,461}.test.ts` llevan
  26, 15, 15 y 28 líneas con la palabra: afirman textos de la ayuda y cambian en T6 (los vigila
  `sin-nombre-heredado`, R23).

### Hallazgo: `docs/marca.md` ya no tiene la palabra

`docs/marca.md` tiene **0 apariciones** (lo limpió SL-8: `1301424`, `8265c91`). Una excepción de
historia para ese archivo no cubriría nada y la caducidad (R12) la pondría en rojo desde el primer
día, que es justo el caso que el design describe («cuando … el archivo ya no tenga la palabra, su
excepción sobra»). Decisión: **la guardia registra solo dos excepciones de historia**
(`docs/limpieza-ordenex.md` y `docs/plan-saas.md`, las dos `retira: "SL-27"`) y sigue recorriendo
`docs/marca.md`, que tiene que quedarse limpio. La mutación 6b de T8 se hace con una de las otras dos.

### Identificadores viejos y citas: el nombre de hoy en el código

| Lo que dice el doc | Lo que dice el código hoy | Dónde |
|---|---|---|
| `X-<Palabra>-Signature` | `X-Servi-Logistic-Signature` | `lib/crypto/webhook-firma.ts:11` |
| `X-<Palabra>-Timestamp` | `X-Servi-Logistic-Timestamp` | `lib/crypto/webhook-firma.ts:13` |
| prefijo de la API key | `svl_` | `lib/utils/api-key-generator.ts:8` |
| prefijo del secreto de webhook | `svl_whsec_` (ningún doc del alcance lo cita) | `lib/utils/webhook-secret-generator.ts:9` |
| `info.title` del YAML | `` `${MARCA.nombre} — API de integración por API key` `` | `lib/api/openapi-spec.ts:119`, `app/api-docs/route.ts:14` |
| «Los CINCO conceptos que … factura» (YAML l. 1322) | `"Los CINCO conceptos que " + EMPRESA.enFrase + " factura…"` → **operador** | `lib/api/openapi-spec.ts:1486` |
| «… puede retirar una provincia» (YAML l. 1944) | `` `${EMPRESA.alInicio} puede retirar…` `` → **operador** (el design lo preveía plataforma; manda el código de SL-15) | `lib/api/openapi-spec.ts:2006` |
| comentario «lo que … ENVÍA al callback» (YAML l. 719) | «la plataforma ENVIA» → **plataforma** | `lib/api/openapi-spec.ts:907` |
| «Mensajes de WhatsApp que … manda solo» (maquetas `ListaMovil` l. 42, `Main` l. 71, `Vacio` l. 29) | `` `Mensajes de WhatsApp que ${MARCA.nombre} manda solo…` `` → **plataforma** (el design lo preveía operador; manda el código) | `app/(app)/configuracion/envios-whatsapp/page.tsx:36` |
| `Authorization: Bearer <prefijo>...` en `evidenciasUrl` | `svl_` (R23; hoy el TS todavía dice el prefijo viejo, l. 1131) | `lib/api/openapi-spec.ts:1131`, `tests/unit/api/openapi-webhook-contrato.test.ts:233` |

Citas de la ayuda: 74 fragmentos entre `«»` o `**` con la palabra existen **literalmente** en el
código de `app/`, `components/` o `lib/` (con `EMPRESA.alInicio`/`enFrase` y `MARCA.nombre`
resueltos y los espacios colapsados) una vez sustituidos por «La empresa»/«la empresa». Salen sobre
todo de `lib/constants/wallet-rotulos.ts`, `app/(app)/wallet/_components/wallet-labels.ts`,
`app/(app)/mi-wallet/_components/mi-wallet-labels.ts` y `components/shared/estado-cuenta/estado-cuenta-labels.ts`.
Ninguna cita mide un rótulo que siga en el código con la palabra: **no hay hallazgo de cita**
(SL-15 dejó el código en cero). Los 22 fragmentos en negrita que no están en el código son prosa
(p. ej. «**es ganancia de la empresa**») o rótulos con un monto dinámico («La empresa le debe ₡… a
Juan Pérez Mora», que el código arma con `${monto}`); se tratan como operador.

### Dominio en `docs/api/` y en `openapi-406` (R22)

16 apariciones, todas pasan a `example.com` conservando el subdominio (como hizo SL-14 en el YAML,
que ya dice `https://app.example.com/…` en l. 961):

- `docs/api/CHANGELOG.md` l. 360, 368, 1319 (`evidenciasUrl` de ejemplo, incluida la entrada
  histórica del 2026-08-22);
- `docs/api/guia-integracion/guia-integracion.html` l. 180, 380 (base URL de producción), 494, 595,
  678, 702, 722, 768 (`curl`) y 845 (`evidenciasUrl`);
- `docs/api/manual-metricas-por-mensajero.md` l. 208;
- `tests/unit/api/openapi-406-evidencias-url.test.ts` l. 86, 144 (regex con el punto escapado, que
  `lineasConDominio` no ve) y 156. Su caso «la entrada HISTÓRICA del 2026-08-22 NO se reescribe»
  pasa a afirmar el ejemplo con `example.com` (R22 manda sobre la decisión Q2 de la 406).
- `docs/api/api-key-openapi.yaml`: 0 (SL-14).

`EXCEPCIONES_DOMINIO` (`tests/unit/guards/_dominio-heredado.ts`) tiene hoy **2 entradas
`ficha: "SL-16"`**: `docs/api/` y `tests/unit/api/openapi-406-evidencias-url.test.ts`. Salen en T7b.

### Excepciones `retira: "SL-16"` de SL-15 y SL-34 (R23–R25), estado hoy

`tests/unit/guards/sin-nombre-heredado.guardia.test.ts` (`EXCEPCIONES_DE_OTRAS_FICHAS`):

| Excepción | ¿Cubre algo hoy? | Se retira cuando |
|---|---|---|
| prefijo `design-notificaciones/` | sí (`Push.dc.html`, `notificaciones-ordenex.html`) | T7 |
| prefijo `design-whatsapp/` | sí (8 maquetas) | T7 |
| archivo `DESIGN.md` | sí (título) | T7 |
| prefijo `.design-work/` | sí (3 archivos y una ruta) | T7 (se borra la carpeta) |
| línea `docs/…<palabra>…` o `<palabra>-api-key.postman_collection.json` en `tests/` | sí (`openapi-266` l. 165, `openapi-320` l. 248, `openapi-canal-rutas-reales` l. 10 y 52) | T4 |
| archivo `tests/unit/api/openapi-406-evidencias-url.test.ts` | sí (dominio) | T7b |
| archivos `tests/unit/asistente/contexto-{457,458,460,461}.test.ts` | sí (26, 15, 15 y 28 líneas) | T6 |
| línea `Authorization: Bearer <prefijo>` en `lib/api/openapi-spec.ts` y en `tests/unit/api/openapi-webhook-contrato.test.ts` | sí (l. 1131 y l. 233) | T7b (R23) |

Las cuatro `retira: "SL-27"` (`soloRuta` de `ingreso-…`, `dominio-…-fuera`, `fuera-datos-…`,
`sin-integrador-de-…`) no son de esta ficha y no se tocan.

`tests/unit/guards/recursos-origen-fuera.guardia.test.ts` (`EXCEPCIONES`, ambas `ficha: "SL-16"`):

| Excepción | Estado hoy | Qué hace SL-16 |
|---|---|---|
| `docs/jira.md` · email | cubre: l. 62 y 68 llevan un email no reservado (no se copia aquí) | T7b: pasa a `<tu-email>@example.com` y la excepción sale (R25); anotar para `arnes-sync --subir` |
| `pnpm-lock.yaml` · email | cubre: el aviso `deprecated` de `glob@7.2.3` (l. 3047 y 8156 son sus entradas) | T7b: queda **permanente**, documentada con su origen (registro de npm), sin `SL-16` (R24). El lockfile no se edita |

`EXCEPCIONES` de la guardia de SL-34 es temporal por contrato (su caso «toda excepción propia es
temporal: ficha SL-n») — R24 obliga a abrir ahí una forma de excepción permanente; queda para T7b.

### Frases dudosas entre plataforma y operador

Anotadas enteras (forma de hoy → propuesta). El resto de las 239 de operador son inequívocas: quien
cobra, paga, debe, gana, factura o emite.

- `docs/api/CHANGELOG.md` l. 572 — «**Qué cambia.** <Palabra> pasa a poder **retirar** una provincia, un
  cantón o un distrito de su…» → **operador** «La empresa pasa a poder…», igual que el TS de SL-15
  (`EMPRESA.alInicio` en `openapi-spec.ts:2006`).
- `docs/api/CHANGELOG.md` l. 1093 — «número tenía que ser único en TODO <Palabra>, no solo en tu cuenta»
  → **plataforma** «en TODO Servi Logistic»: habla de la unicidad en la base del sistema, no de quien cobra.
- `docs/api/CHANGELOG.md` l. 1108 — «**`num_guia` sigue siendo único en todo <Palabra>.** Ese número sí lo
  generamos nosotros» → **plataforma**, por lo mismo.
- `guia-integracion.html` l. 229 — «Fecha de despliegue pendiente: <Palabra> la avisará con antelación y
  la escribirá en el changelog del canal» → **plataforma**: despliega y publica el changelog quien
  mantiene la API.
- `guia-integracion.html` l. 280 — «(dato de referencia de <Palabra>: mediana 8,2 h, p90 22,1 h)» →
  **operador** «de la empresa». El dato de operación en sí es de otra ficha (regla 3 de
  `docs/limpieza-ordenex.md`); aquí solo cambia el nombre.
- `guia-integracion.html` l. 336 — «No existe un endpoint para crear API keys ni suscripciones de webhook:
  las emite <Palabra>.» → **operador**: las emite la oficina de la empresa (l. 352 lo dice).
- `guia-integracion.html` l. 352 — «La emite <Palabra>, no el integrador. Se genera desde la aplicación de
  <Palabra> (Configuración › API keys, personal de oficina)» → 1.ª **operador** «La emite la empresa»,
  2.ª **plataforma** «la aplicación de Servi Logistic».
- `guia-integracion.html` l. 359 — «si la key se emitió apuntando a una tienda ya registrada en
  <Palabra>, esa tienda» → **plataforma** «registrada en Servi Logistic» (el registro en el sistema).
- `guia-integracion.html` l. 363 — «(no es recuperable: <Palabra> tampoco puede volver a mostrarla)» →
  **operador** «la empresa tampoco puede…», quien la emitió.
- `guia-integracion.html` l. 475 — «si no, el redondeo lo hace <Palabra> y la fila creada lo declara en
  `montoAjustado`» → **plataforma**: redondea el sistema.
- `guia-integracion.html` l. 671 — «`gestiones.length` no es el contador de intentos de entrega de
  <Palabra>» → **plataforma**: es un contador del sistema.
- `guia-integracion.html` l. 814 — «Se registra en <Palabra>, una suscripción por dueño» → **plataforma**
  «Se registra en Servi Logistic».
- `guia-integracion.html` l. 817 — «Un secreto de firma, generado por <Palabra> y entregado una sola vez»
  → **plataforma**: lo genera el sistema (`webhook-secret-generator.ts`).
- `guia-integracion.html` l. 868 — «Las IPs de origen de las entregas no están definidas en esta guía:
  consultar con <Palabra>.» → **operador** «consultar con la empresa»: es el contacto del integrador.
- `design-whatsapp/PdfPicking.dc.html` l. 36 y 94, `PdfTransito1.dc.html` l. 43 y 114,
  `PdfTransito2.dc.html` l. 98 — el encabezado `<span>…</span>` y el pie «<Palabra> · Picking
  Abarrotes · …» / «<Palabra> · Informe de tránsito · …» de los PDF → **operador** «La empresa»: el
  código pone ahí el membrete de la empresa o nada (`lib/whatsapp-envios/informes/picking/pdf.ts:276-280`,
  `EMPRESA.membrete` es `null`), nunca la plataforma.
- `docs/ayuda/oficina/configuracion-plantillas.md` l. 51 — «3. **El tono.** Es la voz de <Palabra> ante
  el cliente, no una nota interna.» → **operador**: la plantilla la manda la empresa a su cliente.
- `docs/ayuda/publico/rastreo-de-paquete.md` l. 32 — «En la página principal de <Palabra> está el botón
  **Rastrear envío**» → **plataforma**: es la landing de la plataforma (`app/_landing/LandingNav.tsx:74`).
- `docs/ayuda/publico/rastreo-de-paquete.md` l. 77 — «El cliente final no tiene cuenta en <Palabra> ni
  debería necesitarla.» → **plataforma**: la cuenta es de la app.

### Plataforma (50): dónde y cómo

- Títulos y nombre de la app: `DESIGN.md` l. 1; `docs/ayuda/README.md` l. 2 y 8 («Ayuda de Servi
  Logistic», R18); `entrar-y-recuperar-contrasena.md` l. 12 («# Entrar a Servi Logistic»); YAML l. 1 y 6
  (R15); `guia-integracion/README.md` l. 1, 15 (`Guia-Integracion-API-Servi-Logistic (mes año).pdf`) y
  20; `guia-integracion.html` l. 5, 6 (`<meta name="author">`), 7, 41, 175 y 219; `info.name` de la
  colección (R2).
- Maquetas: «ORDENEX» del push → «SERVI LOGISTIC» (`Push.dc.html` l. 37, 51, 65); la cabecera
  `<span>` de la app en `Formulario` l. 62, `Historial` l. 41, `ListaMovil` l. 37, `Main` l. 47,
  `Vacio` l. 24; y la cita de `envios-whatsapp` (tabla de arriba).
- Lo que emite o hace el sistema: YAML l. 719; `CHANGELOG.md` l. 685 («es Servi Logistic quien lo
  entrega a tu callback»); `guia-integracion.html` l. 318, 811 («Servi Logistic envía»), 877, 999
  («Falla del lado de Servi Logistic»), 1025, y las dudosas de arriba.
- Rutas de la colección (5).

### Concordancia ajustada a mano

- La sustitución de operador es «la empresa» dentro de la frase y «La empresa» al inicio de frase o
  de rótulo (`«`, `**`, celda de tabla, `<p>`, `<span>`). Una línea que **empieza** con la palabra pero
  continúa la frase de la anterior lleva minúscula (8 casos en `wallet-caja.md` l. 57, 117, 182, 285,
  345, 360, 403; `wallet-tiendas.md` l. 84; `mi-wallet.md` l. 112).
- `wallet-caja.md` l. 267: «…de una tienda, u <Palabra> le cobra…» → «…de una tienda, **o** la empresa le
  cobra…». Es el único «u» ante la palabra en el alcance. `contexto-460` (l. 58, 100) y `contexto-461`
  (l. 69) afirman esa frase y cambian con ella.
- No hay «el/del/al/un» ante la palabra (medido), así que no aparece «del la empresa» ni parecidos.

### Forma final de cada frase de operador

Una por línea con la palabra (la primera aparición de la línea), 156 en total. Es la tabla
`FRASES_OPERADOR` de la guardia (T2): el texto de T6/T5/T7 tiene que contenerla, con los espacios
colapsados (así una frase partida en dos líneas de Markdown también vale).

En T2 se acortaron 8 frases para que la guardia no lleve montos en colones ni nombres de ejemplo (`wallet-caja.md` l. 284 y 290, `wallet-mensajeros.md` l. 45, `wallet-tiendas.md` l. 69, `mi-wallet.md` l. 66 y 67) ni geografía (`CHANGELOG.md` l. 572, YAML l. 1944). La lista de abajo es la definitiva.

- `design-whatsapp/PdfPicking.dc.html` (2):
  - l. 36: `600;">La empresa</span>`
  - l. 94: `<span>La empresa · Picking Abarrotes`
- `design-whatsapp/PdfTransito1.dc.html` (2):
  - l. 43: `600;">La empresa</span>`
  - l. 114: `<span>La empresa · Informe de tránsito`
- `design-whatsapp/PdfTransito2.dc.html` (1):
  - l. 98: `<span>La empresa · Informe de tránsito`
- `docs/api/CHANGELOG.md` (1):
  - l. 572: `La empresa pasa a poder **retirar**`
- `docs/api/api-key-openapi.yaml` (2):
  - l. 1322: `Los CINCO conceptos que la empresa factura por una orden, en el escenario de`
  - l. 1944: `La empresa puede retirar una`
- `docs/api/guia-integracion/guia-integracion.html` (17):
  - l. 280: `dato de referencia de la empresa`
  - l. 336: `las emite la empresa`
  - l. 345: `Requiere una API key emitida por la empresa`
  - l. 352: `La emite la empresa, no el integrador`
  - l. 353: `El comercio la solicita a la empresa y la empresa la entrega por un canal seguro`
  - l. 361: `solicita a la empresa`
  - l. 363: `la empresa tampoco puede volver a mostrarla`
  - l. 369: `La empresa puede desactivar la key`
  - l. 417: `requiere hablar con la empresa`
  - l. 467: `el paquete ya está en la bodega de la empresa`
  - l. 536: `la zona no tiene cobertura de la empresa. En ambos casos el mensaje es el mismo`
  - l. 537: `corrija la dirección o pida a la empresa reactivarlo`
  - l. 617: `(avise a la empresa)`
  - l. 819: `se puede desactivar, solicitándolo a la empresa. Sin suscripción activa, los`
  - l. 868: `consultar con la empresa`
  - l. 995: `ids contra la lista de §5.8. En cualquier otro endpoint, contacte a la empresa`
  - l. 997: `los casos. Si es de tarifa, es un tema comercial con la empresa, no de código`
- `docs/ayuda/compartido/analitica.md` (1):
  - l. 47: `qué cobró la empresa, cómo se compone la ganancia y la conciliación de los`
- `docs/ayuda/oficina/cierres.md` (1):
  - l. 28: `lo recaudado de sus entregas, el efectivo entra a la caja de la empresa y cada`
- `docs/ayuda/oficina/configuracion-plantillas.md` (1):
  - l. 51: `Es la voz de la empresa ante el cliente, no una nota interna`
- `docs/ayuda/oficina/configuracion-tarifas.md` (1):
  - l. 25: `El porcentaje que la empresa cobra por recaudar la plata del`
- `docs/ayuda/oficina/wallet-caja.md` (75):
  - l. 51: `La caja de la empresa`
  - l. 57: `ganancia de la empresa**, el **saldo inicial y aportes**`
  - l. 60: `fletes, comisiones, IVA, lo que la empresa les cobra a las tiendas`
  - l. 72: `El concepto, dicho desde la empresa`
  - l. 73: `**La empresa** en un aporte`
  - l. 81: `siempre desde la empresa, y diciendo quién le paga a quién`
  - l. 83: `concepto del libro se lee desde la empresa y dice quién le paga a quién. Los`
  - l. 89: `La empresa le cobra a una tienda`
  - l. 91: `La empresa le paga a una tienda`
  - l. 92: `La empresa paga un gasto de una tienda`
  - l. 93: `La empresa le paga a un mensajero`
  - l. 94: `Gasto de la empresa`
  - l. 96: `El saldo inicial o un aporte de la empresa, y su anulación`
  - l. 97: `Una tienda le paga a la empresa`
  - l. 98: `El flete que la empresa le cobra a una tienda cuando su cliente rechaza el`
  - l. 99: `Indemnización que la empresa paga por un incidente`
  - l. 102: `Pago de la empresa a una tienda`
  - l. 103: `Cobro de la empresa a una tienda`
  - l. 117: `la empresa: solo cuenta lo que se registró`
  - l. 123: `los pagos se hicieron con dinero que la empresa ya tenía`
  - l. 130: `### Lo que la empresa les debe a las tiendas`
  - l. 133: `lo que la empresa les cobró`
  - l. 134: `que le deben a la empresa`
  - l. 140: `**De la empresa**`
  - l. 156: `al dinero de la empresa, al saldo de la cuenta`
  - l. 161: `Sale dinero de la empresa`
  - l. 176: `tienda, a un mensajero, de una tienda a la empresa, y el pago de un gasto de una`
  - l. 181: `lo que la empresa les debe a las tiendas`
  - l. 182: `lo que la empresa le debe** a esa tienda`
  - l. 183: `pendientes y baja lo que la empresa le debe`
  - l. 189: `ganancia de la empresa`
  - l. 212: `## La empresa le cobra a una tienda`
  - l. 214: `Cuando la empresa le cobra algo a una tienda`
  - l. 220: `Lo que la empresa les debe a las tiendas`
  - l. 222: `le debe ese dinero a la empresa, y`
  - l. 228: `La empresa le cobra a la tienda`
  - l. 233: `tienda le debe ese dinero a la empresa`
  - l. 239: `## Una tienda le paga a la empresa`
  - l. 241: `los cargos y los cobros de la empresa superaron lo que se le`
  - l. 242: `y le paga a la empresa lo que debe, se registra con`
  - l. 248: `ganancia de la empresa no cambia`
  - l. 256: `sigue en contra, que la tienda todavía le debe ese dinero a la empresa`
  - l. 259: `Pago de una tienda a la empresa`
  - l. 260: `La tienda le paga a la empresa`
  - l. 261: `pagaste a la empresa`
  - l. 264: `Registrar pago de la tienda a la empresa**: es el mismo formulario`
  - l. 267: `## La empresa paga un gasto de una tienda, o la empresa le cobra a una tienda`
  - l. 273: `¿salió dinero de la empresa hacia otra persona?`
  - l. 277: `La empresa **le pagó a un tercero en nombre de la tienda**`
  - l. 278: `pasa del saldo de la tienda a la ganancia de la empresa`
  - l. 280: `La ganancia de la empresa`
  - l. 281: `La empresa paga un gasto de la tienda`
  - l. 284: `**Un ejemplo.** La empresa le paga`
  - l. 285: `con dinero de la empresa.`
  - l. 290: `que la empresa no ganó`
  - l. 294: `ese dinero **es de la empresa**`
  - l. 306: `tienda le debe ese dinero a la empresa. Al registrarlo, el aviso te dice en`
  - l. 311: `dinero de la empresa que entra a la caja y no es ganancia`
  - l. 314: `el dinero que la empresa tenía al empezar a usar la app`
  - l. 317: `dinero de la empresa que entra después`
  - l. 335: `la cifra grande, la ganancia, lo que la empresa les debe a las tiendas y el`
  - l. 343: `un **gasto de la empresa**, un **gasto fijo cobrado**`
  - l. 344: `cobro de la empresa a una tienda`
  - l. 346: `pago de la empresa a una tienda`
  - l. 355: `- Al anular un cobro de la empresa a una tienda, la`
  - l. 358: `Cobro de la empresa a la tienda anulado`
  - l. 359: `- Al anular un pago de una tienda a la empresa`
  - l. 360: `la empresa les debe a las tiendas`
  - l. 361: `Pago de una tienda a la empresa anulado`
  - l. 362: `de la tienda a la empresa anulado`
  - l. 365: `**lo que la empresa les debe a las tiendas** y el saldo de la tienda`
  - l. 388: `comprobante. El pago de una tienda a la empresa sí puede llevarlo`
  - l. 403: `la empresa no tienen ese límite`
  - l. 409: `**La empresa paga un gasto de una tienda** con el origen`
  - l. 467: `tienda, un pago de una tienda a la empresa, una corrección, un cobro por`
- `docs/ayuda/oficina/wallet-mensajeros.md` (3):
  - l. 45: `«La empresa le debe`
  - l. 46: `lo que la empresa le debe por sus cierres aprobados y`
  - l. 82: `La empresa le paga al mensajero`
- `docs/ayuda/oficina/wallet-satelites.md` (2):
  - l. 28: `a la caja de la empresa cuando se`
  - l. 117: `No es la caja de la empresa`
- `docs/ayuda/oficina/wallet-tiendas.md` (16):
  - l. 45: `desde la empresa** («La empresa le cobra a la tienda»)`
  - l. 66: `Es el extracto de la tienda con la empresa, como el de un banco`
  - l. 69: `«La empresa le debe`
  - l. 84: `«Pago de la empresa a una tienda · 2026-09-14`
  - l. 156: `La tienda le paga a la empresa`
  - l. 157: `le hizo a la empresa`
  - l. 158: `La empresa le cobra a la tienda`
  - l. 159: `La empresa le paga a la tienda`
  - l. 160: `La empresa no le debe nada a…`
  - l. 165: `Pagos de la empresa a la tienda`
  - l. 175: `El servicio de la empresa, al aprobarse un cierre`
  - l. 177: `Cobro de la empresa a la tienda anulado`
  - l. 178: `La empresa paga un gasto de la tienda`
  - l. 182: `Pago de la tienda a la empresa anulado`
  - l. 186: `entonces la tienda le debe ese dinero a la empresa`
  - l. 207: `No es la caja de la empresa`
- `docs/ayuda/tienda/mi-wallet.md` (31):
  - l. 37: `tu plata con la empresa`
  - l. 38: `entregas, cuánto te cobró la empresa de servicio, lo que te pagó, y cómo queda`
  - l. 47: `a tu favor, lo que le pagaste a la empresa y lo que la empresa te devolvió al`
  - l. 48: `Cargos de la empresa`
  - l. 49: `Lo que la empresa te pagó o pagó por ti`
  - l. 53: `extracto. Así distinguís lo que la empresa`
  - l. 56: `Un pago que la empresa te hizo y después anuló`
  - l. 66: `| **La empresa te debe`
  - l. 67: `a la empresa** | Tu saldo está en contra`
  - l. 68: `La empresa y vos no se deben nada`
  - l. 87: `dice qué hizo la empresa contigo`
  - l. 93: `La empresa anuló un pago hecho por ti`
  - l. 94: `La empresa anuló un cobro y te lo devolvió`
  - l. 95: `Le pagaste a la empresa`
  - l. 98: `La empresa te cobró el flete`
  - l. 99: `el servicio de la empresa`
  - l. 100: `**La empresa te cobró** — un cobro que la oficina te hace a mano`
  - l. 103: `**La empresa te pagó** — lo que la empresa ya te pagó de tu saldo`
  - l. 104: `La empresa pagó un gasto por ti`
  - l. 105: `La empresa anuló el pago que le hiciste`
  - l. 112: `**Anulado por la empresa**, el día y la hora`
  - l. 115: `## Un cobro que la empresa te hizo`
  - l. 121: `le debés ese dinero a la empresa, y se cobra`
  - l. 127: `## Un pago que la empresa hizo por ti`
  - l. 129: `A veces la empresa paga algo`
  - l. 133: `es dinero que la empresa ya puso por vos, en el tipo de movimiento`
  - l. 134: `le debés ese dinero a la empresa`
  - l. 138: `## Un pago que le hiciste a la empresa`
  - l. 140: `Si tu saldo quedó en contra y le pagaste a la empresa, lo ves como`
  - l. 145: `pagos que la empresa te hizo, en los pagos que la empresa hizo por ti, en los`
  - l. 146: `que le hiciste a la empresa. Se abre en otra pestaña con un enlace que dura`

## T2 — La guardia, primero en rojo (2026-10-22, backend_dev)

Archivo nuevo: `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (37 casos). Se commitea **en
rojo a propósito**: es el «primero en rojo» de TDD; T3–T7b la ponen en verde.

Qué lleva:
- La palabra y el prefijo desde `tests/fixtures/nombre-heredado.ts` (`NOMBRE_HEREDADO`); las rutas
  con la palabra van con `${P}`. El archivo no contiene la palabra en ninguna capitalización, ni el
  dominio, ni emails (lo comprueban `sin-nombre-heredado` y `recursos-origen-fuera`, abajo).
- `EXCEPCIONES`: solo dos de historia, `docs/limpieza-….md` y `docs/plan-saas.md`, `retira: "SL-27"`
  (`docs/marca.md` no: hallazgo de T1). Las clases dominio, identificador y cita existen en el tipo
  y se ejercen solo en las contrapruebas sintéticas.
- `TERMINO_EMPRESA = "la empresa"` y `TERMINO_EMPRESA_INICIO = "La empresa"`, escritos a mano y
  comparados con `EMPRESA.enFrase` / `EMPRESA.alInicio` importados de `@/lib/config/marca`.
- `FRASES_OPERADOR`: las 156 de T1, comparadas con los espacios colapsados.
- Caducidad (R12), anti-vacuidad (raíces + suelo 84, R14), forma de cada excepción (R9), lockstep
  de identificadores contra su `fuente` (R10) y de citas contra `app/`+`components/`+`lib/` sin
  comentarios (R11).
- Casos de R1–R5, R7, R15, R16, R18, R19 y R22.

Decisiones técnicas:
- **R18**: `leerCatalogoAyuda()` excluye el README a propósito (`ARCHIVO_EXCLUIDO`, `lib/ayuda/catalogo.ts:48`),
  así que el caso no puede leerlo por el catálogo como decía el design. Lee el README con
  `partirFrontmatter` (el mismo parser del catálogo), afirma `titulo` y el `# ` del cuerpo, y fija
  `ARCHIVO_EXCLUIDO === "README.md"` para que el motivo no se pierda.
- **R16**: frases escritas a mano (`DESCRIPCIONES_QUE_CAMBIAN`: «factura», «puede retirar» y el
  `Bearer svl_` de `evidenciasUrl`). Cada una se busca en los strings de `openApiSpec`; el tramo de
  esa descripción desde la frase hasta la primera comilla (el YAML las escapa) tiene que estar igual
  en el YAML con los espacios colapsados. Simulado sobre una copia en memoria del YAML con las tres
  sustituciones de T3/T7b: los tres casos pasan.
- **R7**: simulado aplicando a una copia en memoria las formas finales de T1: las 156 frases casan y
  no queda ninguna aparición fuera de historia.
- La búsqueda de R22 mira también el dominio con el punto escapado (`…\.co` de la regex de
  `openapi-406` l. 144), que `lineasConDominio` no ve.

### El rojo

`pnpm exec vitest run tests/unit/guards/docs-marca-heredada.guardia.test.ts` → `14 failed | 23 passed (37)`,
`EXIT=1`. Las 23 que pasan son todas las contrapruebas (R9–R12, R14 y el detector), la anti-vacuidad,
R1, R7 término y forma de las frases, R9/R10/R11/R12 sobre la lista real.

Los 14 rojos:

| Caso | Lo que dice |
|---|---|
| R8, R13 | **345 apariciones en 35 archivos** (exactamente las de T1: 289 de plataforma y operador + 16 de dominio + 34 de identificador viejo + 6 de `notificaciones-….html`) |
| R5 | 2 rutas: `design-notificaciones/notificaciones-….html` y `docs/api/…-api-key.postman_collection.json` |
| R2 | la ruta vieja de la colección sigue |
| R3, R4 | `notificaciones-….html` y `.design-work/` existen |
| R7 | 156 frases de operador sin su forma final |
| R15 | el título del YAML todavía es el viejo (TS y página ya dicen `Servi Logistic — API de integración por API key`) |
| R16 ×3 | «factura» y «puede retirar» no están igual en el YAML; el `Bearer svl_` no está todavía en el TS (R23) |
| R18 | el README se titula con el nombre viejo |
| R19 | `DESIGN.md` se titula con el nombre viejo |
| R22 ×2 | 16 líneas con el dominio (CHANGELOG 3, guía 9, manual 1, `openapi-406` 3 con la de la regex); `EXCEPCIONES_DOMINIO` tiene 2 entradas `SL-16` |

Conteo por archivo de R8/R13 (igual a la tabla de T1):

```
DESIGN.md 1 · design-notificaciones/Push.dc.html 3 · design-notificaciones/notificaciones-….html 6
design-whatsapp: Formulario 1, Historial 1, ListaMovil 2, Main 2, PdfPicking 2, PdfTransito1 2, PdfTransito2 1, Vacio 2
docs/api: CHANGELOG.md 20, api-key-openapi.yaml 7, guia-integracion/README.md 3, guia-integracion.html 60,
          manual-metricas-por-mensajero.md 3, …-api-key.postman_collection.json 3
docs/ayuda: README 2, compartido/analitica 1, oficina/cierres 1, configuracion-plantillas 1, configuracion-tarifas 1,
            wallet-caja 121, wallet-mensajeros 3, wallet-satelites 2, wallet-tiendas 32,
            publico/entrar-y-recuperar-contrasena 1, publico/rastreo-de-paquete 2, tienda/mi-wallet 50
lib/api/openapi-spec.ts 1 · tests/unit/api: openapi-266 1, openapi-320 1, openapi-406 3, openapi-webhook-contrato 1
tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts 2
```

`docs/limpieza-….md` (35 con la ruta) y `docs/plan-saas.md` (21) no salen: los cubre su excepción
de historia. `docs/marca.md`: 0.

### Comprobaciones

```
pnpm run typecheck                         → TC_EXIT=0
pnpm exec eslint tests/unit/guards/docs-marca-heredada.guardia.test.ts → LINT_EXIT=0
pnpm exec vitest run tests/unit/guards/dominio-…-fuera.guardia.test.ts tests/unit/guards/recursos-origen-fuera.guardia.test.ts tests/unit/guards/sin-nombre-heredado.guardia.test.ts
                                           → EXIT=0 (abajo)
```

Las tres guardias de barrido con la guardia nueva y la bitácora en el árbol (sin commitear; las tres
leen también lo no versionado): `Test Files 3 passed (3) · Tests 53 passed | 1 skipped (54)`, `EXIT=0`.
Ninguno de los dos archivos aparece en sus rojos.

### Mapa R → test (hasta T2)

| R | Caso en `docs-marca-heredada.guardia.test.ts` |
|---|---|
| R1 | «R1: se conservan en su ruta…» |
| R2 | «R2: la colección de Postman vive en su ruta nueva…» |
| R3, R4 | «R3: la exportación duplicada…», «R4: .design-work/ no existe» |
| R5 | «R5: ninguna ruta del alcance…» + contraprueba «R5: una ruta con la palabra salta…» |
| R7 | describe «R7: el operador es la empresa usuaria…» (3 casos) |
| R8, R13 | «R8, R13: ningún archivo del alcance…» + contrapruebas del detector |
| R9 | «R9: toda excepción tiene clase, ficha…» + contraprueba «R9: una excepción sin ficha…» |
| R10, R11 | «R10 y R11: ningún identificador ni cita…» + contrapruebas «R10: …», «R11: …» |
| R12 | «R12: ninguna excepción sobra» + contraprueba «R12: una excepción que no aparece…» |
| R14 | describe «anti-vacuidad (R14)» + describe «contrapruebas del detector…» |
| R15 | «R15: el título es el mismo…» |
| R16 | «R16: «…» dice lo mismo en el TS y en el YAML» (×3) |
| R18 | «R18: el documento índice…» |
| R19 | «R19: DESIGN.md se titula…» |
| R22 | describe «R22: sin el dominio…» (2 casos) |

Veredicto T2: guardia creada y en rojo exactamente por lo que midió T1; contrapruebas en verde.

## T6 — La ayuda (2026-10-22, frontend_dev)

Commit `docs(SL-16): T6 la ayuda sin el nombre heredado`.

- Los 12 documentos de `docs/ayuda/**`: se aplicó por línea la forma nueva de T1 (plataforma →
  «Servi Logistic»; operador → «la empresa»/«La empresa» con la concordancia de T1, incluido «u» → «o»
  de `wallet-caja.md` l. 267). Antes de escribir, cada línea original se comparó con el disco (0 sin
  casar). Las 131 frases de `FRASES_OPERADOR` de `docs/ayuda/` están en el texto (espacios colapsados).
- Ajuste a mano sobre T1: `wallet-caja.md` l. 161 enumera rótulos del diálogo separados por «·»; tres
  van en mayúscula («La empresa paga un gasto de una tienda», «La empresa le paga a una tienda», «La
  empresa le paga a un mensajero»), como sus `label` en `wallet-conceptos-manuales.ts` (241, 252, 218).
  Ninguna frase de `FRASES_OPERADOR` cambia.
- Citas de rótulos comprobadas contra el código de hoy (`EMPRESA.alInicio`/`enFrase`): «La empresa le
  cobra a la tienda», «La tienda le paga a la empresa», «Cobro de la empresa a la tienda anulado», «La
  empresa paga un gasto de la/una tienda», «La empresa no le debe nada a…», «La empresa le paga al
  mensajero», «La empresa le debe … a …».
- `actualizado: 2026-10-22` en el frontmatter de los 12 (el ejemplo de `README.md` l. 37 no se toca).
  Título del índice: «Ayuda de Servi Logistic» (R18).
- `tests/unit/asistente/contexto-{457,458,460,461}.test.ts`: cada literal con la palabra se reescribió
  a mano con la forma que dice ahora la ayuda (también los `not.toContain`, los nombres de `describe`/`it`
  y los comentarios). Cero apariciones en esos cuatro archivos.

Salidas:

- Comando de T6 (`tests/unit/asistente` + `nombres-wallet-461` + `nombres-estado-retirados` +
  `ayuda-pantalla-ruta-existe` + `AyudaDocumentoPage`): `Test Files 16 passed (16) · Tests 268 passed
  (268)`, `EXIT=0`. (Primera corrida: 2 rojos de `contexto-458` por la mayúscula de l. 161; corregido.)
- `pnpm run typecheck` → `TC=0`. `pnpm exec eslint tests/unit/asistente` → `LINT=0`.
- `docs-marca-heredada`: 0 líneas del informe nombran `docs/ayuda/`; R18 y el caso de frases de R7 sin
  rojos de la ayuda.

## T7 — Diseños (2026-10-22, frontend_dev)

- `design-notificaciones/Push.dc.html` (3: «SERVI LOGISTIC»), y los 8 `.dc.html` de `design-whatsapp/`:
  cabecera de la app y «Mensajes de WhatsApp que Servi Logistic manda solo» → plataforma; membrete y pie
  de los PDF (`PdfPicking`, `PdfTransito1`, `PdfTransito2`) → «La empresa». Ninguna línea cambiada nombra
  al integrador. Las 5 frases de `FRASES_OPERADOR` de `design-whatsapp/` están en el texto.
- `git rm` de `design-notificaciones/notificaciones-<palabra>.html` (R3) y `git rm -r .design-work`
  (16 archivos, R4).
- `DESIGN.md`: título `# DESIGN.md — Servi Logistic` y nota que remite a `docs/marca.md` (paleta,
  tipografía, logo) y aclara que los tokens describen `app/globals.css` hasta que SL-8 los migre (R19).

Salidas:

- `docs-marca-heredada`: `Tests 1 failed | 36 passed (37)`. El único rojo es «EXCEPCIONES_DOMINIO ya no
  tiene entradas que retire SL-16» (R22, `_dominio-heredado.ts`, de T7b). Nada en `design-*/`, `DESIGN.md`
  ni `docs/ayuda/`; R3, R4 y R19 en verde.
- `dominio-ordenex-fuera` + `recursos-origen-fuera`: `Tests 1 failed | 41 passed | 1 skipped`; el rojo
  es la contraprueba «el dominio en una ruta con excepción de SL-14: 0; en otra ruta: 1», que depende de
  `EXCEPCIONES_DOMINIO` (T7b en curso). Ninguno de mis archivos aparece.
- `sin-nombre-heredado` (esperado, lo retira T8/T7b): pide borrar 8 excepciones `retira: "SL-16"` que ya
  no cubren nada (`prefijo design-notificaciones/`, `prefijo design-whatsapp/`, `archivo DESIGN.md`,
  `prefijo .design-work/`, y los 4 `tests/unit/asistente/contexto-*.test.ts`). Su R15 lista además 3
  archivos que citan `docs/limpieza-<palabra>.md` (`catalogo-produccion.guardia`, `no-embalaje`,
  `sin-integrador-de-…`): vienen del cambio sin commitear de ese archivo de otro agente, no de T6/T7.

Veredicto T6+T7: ayuda y diseños sin el nombre heredado; solo queda en rojo lo que es de T7b/T8.

## T3 — El contrato de la API (2026-10-22, backend_dev) → `86b2207`

- `docs/api/api-key-openapi.yaml`: cabecera (l. 1), `info.title` «Servi Logistic — API de integración por
  API key» (l. 6, R15), el `Bearer svl_...` de `info.description` (l. 11, el TS ya lo decía), el
  comentario del webhook «lo que la plataforma ENVÍA» (l. 719, igual que el TS l. 907), «Los CINCO
  conceptos que la empresa factura» (l. 1322) y «La empresa puede retirar» (l. 1944) (R16).
- Sin cambio, porque SL-15 ya los dejó así (medido): `lib/api/openapi-spec.ts` (salvo el `Bearer` de
  `evidenciasUrl`, que va en T7b), el `<title>` de `app/api-docs/route.ts` (`${MARCA.nombre} — …`), el
  test (c) de `openapi-405-gestiones` («contador interno de la plataforma») y los comentarios de
  `openapi-webhook-estado-actualizado` («lo entrega la plataforma»).
- `pnpm exec vitest run tests/unit/api tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts` →
  `Test Files 33 passed (33) · Tests 419 passed (419)`. Guardia nueva: R15 y R16 «factura» / «puede
  retirar» en verde; R16 del `Bearer` rojo hasta T7b.

## T4 — La colección de Postman (2026-10-22, backend_dev) → `1de7526`

- `git mv` a `docs/api/servi-logistic-api-key.postman_collection.json` (R2, R5); `info.name` «Servi
  Logistic — API key (canal integradores)»; el `Bearer` de la descripción y el valor de ejemplo de la
  variable de la key con `svl_`. JSON válido (`JSON.parse`).
- Ruta nueva en `openapi-266-habilitar` l. 165, `openapi-320-eliminar` l. 248, los comentarios l. 10 y 52
  de `openapi-canal-rutas-reales` y `docs/api/CHANGELOG.md` l. 710.
- Mismo comando de API → `33 passed · 419 passed` (R17: 266 y 320 verdes con la ruta nueva). Guardia
  nueva: R2 verde; R5 solo seguía rojo por `notificaciones-….html` (T7, ya borrado).

## T5 — CHANGELOG, guía de integración y manual (2026-10-22, backend_dev) → `b568d3f`

- `docs/api/CHANGELOG.md`, sin entrada nueva: plataforma l. 685, 1093, 1108; operador l. 572 («La
  empresa pasa a poder **retirar**»); cabeceras `X-Servi-Logistic-*` (l. 387, 668, 690, 1326) y `svl_`
  (l. 351, 706, 914, 996, 1296).
- `guia-integracion/README.md`: título, nombre del PDF `Guia-Integracion-API-Servi-Logistic (mes año).pdf`
  y el pie, igual que el `@bottom-left` del HTML.
- `guia-integracion.html`: las 17 frases de operador de T1 y el resto plataforma (dudosas resueltas
  como anota T1), cabeceras y `svl_XXXXXXXXXXXX`.
- `manual-metricas-por-mensajero.md`: `svl_` (l. 41, 205) y el dominio de ejemplo a `app.example.com` (l. 208).
- Mismo comando de API → `33 passed · 419 passed` (incluye `openapi-466-descripciones`,
  `openapi-406-evidencias-url`, `changelog-455`). Guardia nueva: en `docs/api/` solo quedaban el dominio
  del CHANGELOG (3) y de la guía (9) y el `Bearer` del YAML l. 926, todos de T7b; R7 sin rojos de `docs/api/`.

## T7b — Ajustes de la review de SL-15 y SL-34 (2026-10-22, backend_dev)

1. **`Bearer` de `evidenciasUrl` (R23).** `svl_` en `lib/api/openapi-spec.ts` l. 1131, en el YAML l. 926 y
   en `openapi-webhook-contrato.test.ts` l. 233 (literal a mano). Salió su excepción de
   `sin-nombre-heredado` (`EXCEPCIONES_DE_OTRAS_FICHAS`).
2. **Dominio (R22).** `CHANGELOG.md` l. 360, 368, 1319 y `guia-integracion.html` (base URL de producción,
   tabla de entornos, 6 `curl` y el `evidenciasUrl`) → `https://app.example.com`. En
   `openapi-406-evidencias-url.test.ts`, l. 86, la regex de l. 144 (con el punto escapado) y l. 157; su caso
   «la entrada HISTÓRICA… NO se reescribe» afirma ahora el ejemplo con `example.com` y lo dice en un
   comentario (R22 manda sobre su decisión Q2). `EXCEPCIONES_DOMINIO` de `_dominio-heredado.ts` queda
   **vacía**; la guardia de SL-14 no se toca.
   - Efecto colateral: la contraprueba de `recursos-origen-fuera` «el dominio en una ruta con excepción de
     SL-14: 0» usaba la lista real. Ahora pasa una excepción sintética (`SL-99`) y añade el caso inverso:
     con la lista real vacía, `docs/api/` marca el dominio.
3. **Excepciones `retira: "SL-16"` de `sin-nombre-heredado`.** Salieron la de `openapi-406` y la del
   `Bearer`. La de «líneas de `tests/` que nombran un archivo de `docs/` con la palabra» **no podía salir
   entera**: al quitarla, su R15 marcó 5 líneas (`catalogo-produccion.guardia` l. 491, `no-embalaje`
   l. 181/184, `sin-integrador-de-…` l. 14/33) que nombran `docs/limpieza-<palabra>.md`, el archivo de
   historia que retira SL-27. Decisión: se estrecha a ese único archivo (`docs/limpieza-${n}\.md` en
   `tests/`) con `retira: "SL-27"`; la parte de la colección de Postman desaparece. (El «3 archivos» que
   anota T7 era este estado intermedio.) Las de `design-*`, `DESIGN.md`, `.design-work/` y
   `tests/unit/asistente/contexto-*` **no las toqué**: siguen y hoy salen como sobrantes (8), las retira T8/el otro agente.
4. **`docs/jira.md` (R25).** l. 62 y 68: el email de ejemplo pasa a `<tu-email>@example.com`; solo esas
   dos líneas. Salió su excepción de `recursos-origen-fuera`. **`docs/jira.md` es archivo del arnés:
   subir a la plantilla con `./scripts/arnes-sync.sh --subir`.**
5. **`pnpm-lock.yaml` (R24).** No se edita. En `recursos-origen-fuera` la forma mínima: `ficha` admite
   `SL-<n>` o `"permanente"`, y una permanente exige `origen` (campo nuevo, de dónde viene el valor fuera
   del repo). `problemaDeExcepcion()` lo valida; casos nuevos: «toda excepción propia es temporal (SL-n) o
   permanente con origen externo» (sobre la lista real), «SL-16 R24: una permanente sin origen, una
   temporal con origen o una ficha libre no valen» (7 contrapruebas), «SL-16 R24: las permanentes son solo
   las registradas a mano» (literal `["pnpm-lock.yaml"]`) y «SL-16 R25: docs/jira.md no tiene excepción».
   La de `pnpm-lock.yaml` sigue sujeta a «ninguna excepción propia sobra». Las de término no admiten permanente.

Salidas (árbol con T6/T7 ya commiteados):

```
pnpm run typecheck                                → TC_EXIT=0
pnpm exec eslint <los 9 .ts tocados>              → LINT_EXIT=0
pnpm exec vitest run tests/unit/api tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts \
  tests/unit/guards/sin-nombre-heredado.guardia.test.ts tests/unit/guards/dominio-…-fuera.guardia.test.ts \
  tests/unit/guards/recursos-origen-fuera.guardia.test.ts
                                                  → Test Files 1 failed | 35 passed (36)
                                                    Tests 1 failed | 474 passed | 1 skipped (476)
pnpm exec vitest run tests/unit/guards/docs-marca-heredada.guardia.test.ts → Tests 37 passed (37)
```

El único rojo es `sin-nombre-heredado` «ninguna excepción sobra»: las 8 `retira: "SL-16"` de diseños,
`DESIGN.md`, `.design-work/` y `contexto-*`, cuyo sujeto ya limpiaron T6/T7 (fuera de mi encargo).
`git ls-files --eol`: todo `i/lf w/lf`. Ninguna línea añadida lleva el dominio heredado, el prefijo viejo ni
un email no reservado.

| R | Test |
|---|---|
| R22 | `docs-marca-heredada` describe «R22» (2 casos) + `dominio-…-fuera` «ninguna entrada sobra» / barrido |
| R23 | `openapi-webhook-contrato` «la prosa dice que se OMITE…» (`Bearer svl_`) + `docs-marca-heredada` R16 del `Bearer` + `sin-nombre-heredado` R15/R16 |
| R24 | `recursos-origen-fuera` «toda excepción propia es temporal… o permanente», «SL-16 R24: …» (×2) |
| R25 | `recursos-origen-fuera` «SL-16 R25: docs/jira.md no tiene excepción» + su barrido R1-R9 |

Veredicto T3–T5+T7b: contrato, colección y `docs/api/` sin el nombre ni el dominio heredados; la guardia
nueva en verde; queda rojo solo la poda de 8 excepciones ajenas en `sin-nombre-heredado`.

## T8 — Guardia en verde, y comprobar que muerde (2026-10-22, backend_dev)

### Poda de `sin-nombre-heredado` → `dfffbc3`

Fuera las 8 excepciones `retira: "SL-16"` que ya no cubrían nada (`design-notificaciones/`,
`design-whatsapp/`, `.design-work/`, `DESIGN.md` y `tests/unit/asistente/contexto-4{57,58,60,61}.test.ts`)
y las dos constantes de motivo que quedaron sin uso (`SL16_DISENO`, `SL16_DOCS`).
`grep -n 'SL-16'` sobre `sin-nombre-heredado`, `_dominio-heredado.ts` y `recursos-origen-fuera`: solo
comentarios de historia y dos excepciones sintéticas dentro de contrapruebas (`hallazgos(ap, [...])`),
ninguna en una lista real.

```
pnpm exec vitest run docs-marca-heredada sin-nombre-heredado dominio-…-fuera recursos-origen-fuera
  tests/unit/api tests/unit/asistente openapi-canal-rutas-reales
                                   → Test Files 49 passed (49) · Tests 711 passed | 1 skipped (712)
pnpm run typecheck (tsc --noEmit)  → sin errores
```

### Mutaciones

Una a una en el árbol real con `scratchpad/sl16/t8/mut.mjs` (aplica) y `correr.sh` (mide
`docs-marca-heredada` y revierte con `git checkout -- .` / `git clean -- docs/api`; comprueba
`git status --porcelain` vacío antes y después de cada una). Base: `Tests 37 passed (37)`.

| # | Mutación | Caso rojo | Mensaje resumido |
|---|---|---|---|
| 1 | `Ayuda de <Palabra>` añadido a `docs/ayuda/oficina/cierres.md` (R8, R13) | R8, R13 | «1 aparición(es) en 1 archivo(s)… docs/ayuda/oficina/cierres.md:109» · `1 failed \| 36 passed` |
| 2 | excepción `identificador` «La empresa pasa a poder» con `fuente: lib/config/marca.ts`, que no lo contiene (R10, contraprueba) | R10 y R11; «solo queda la clase historia» | «el identificador «La empresa pasa a poder» ya no existe en lib/config/marca.ts… Lo citan: docs/api/CHANGELOG.md» · `2 failed \| 35 passed` |
| 3 | excepción `cita` «Es la voz de la empresa ante el cliente», que está en la ayuda y no en el código (R11) | R10 y R11; «solo queda la clase historia» | «la cita «…» ya no existe en app/, components/ ni lib/… La citan: docs/ayuda/oficina/configuracion-plantillas.md» · `2 failed \| 35 passed` |
| 4 | excepción de historia de `docs/no-existe.md` (R12) | R12 «ninguna excepción sobra» | «la excepción «docs/no-existe.md» (historia, retira SL-27) ya no aparece en el alcance: bórrala» · `1 failed \| 36 passed` |
| 5t | la de `docs/plan-saas.md` sin `retira`, sin cast (R9) | `tsc --noEmit` exit 2 | «TS2741: Property 'retira' is missing… required in type 'Excepcion'» (línea 81); vitest, que no tipa, da lo mismo que 5 |
| 5 | la misma con `as unknown as Excepcion` (R9) | R9; «…y la retira SL-27» | ««docs/plan-saas.md» (historia, retira undefined): sin ficha que la retire» · `2 failed \| 35 passed` |
| 6a | «La caja de la empresa» → «… Servi Logistic» en `FRASES_OPERADOR` (R7) | R7 «no nombra a la plataforma»; R7 «cada archivo contiene su forma final» | la frase de `wallet-caja.md` en ambos listados · `2 failed \| 35 passed` |
| 6c | `TERMINO_EMPRESA = "la compañía"` (R7) | R7 «el término… es el de lib/config/marca.ts»; R7 «cada frase lleva el término» | «expected 'la empresa' to be 'la compañía'»; 119 frases sin el término (las de «La empresa» al inicio pasan por `TERMINO_EMPRESA_INICIO`) · `2 failed \| 35 passed` |
| 6b | historia de `docs/plan-saas.md` apuntando a `docs/marca.md` (R12) | R12; R8, R13 | «la excepción «docs/marca.md»… ya no aparece en el alcance» y «21 aparición(es) en 1 archivo(s)» (las de `plan-saas.md` destapadas) · `2 failed \| 35 passed` |
| 7 | `MINIMO_ARCHIVOS = 85` (medido: 84) (R14) | R14 «recorre al menos el suelo firmado» | «expected 84 to be greater than or equal to 85» · `1 failed \| 36 passed` |
| 8 | archivo `docs/api/<palabra>-x.md` (R5) | R5 | «expected [ 'docs/api/<palabra>-x.md' ] to deeply equal []» · `1 failed \| 36 passed` |
| 9 | título del YAML → «Servi Logistic — API de integración» (R15) | R15 | `yaml: "Servi Logistic — API de integración"` frente a `ts`/`pagina` · `1 failed \| 36 passed` |
| 10 | YAML «o un distrito sin borrarlo» → «sin eliminarlo» (R16) | R16 «La empresa puede retirar una» | «expected '…' to contain 'La empresa puede retirar una provinci…'» · `1 failed \| 36 passed` |

Supervivientes: ninguno. Notas:
- 2 y 3 se midieron con un texto que SÍ está en el alcance, para que R12 no tape el rojo de R10/R11; el
  caso «solo queda la clase historia» también salta, como debe (las clases sin fuente no vuelven solas).
- 5: el tipo `retira: \`SL-${number}\`` ya lo impide en el typecheck; el caso R9 lo caza en runtime si
  alguien lo fuerza con un cast.
- Tras la última: `git status` limpio y `docs-marca-heredada` + `sin-nombre-heredado` → `Tests 51 passed (51)`.

Veredicto T8: la guardia está en verde y cada mutación pone en rojo su caso; `sin-nombre-heredado` ya no
tiene excepciones atadas a SL-16.

## T9 — Gate y trazabilidad (implementer)

`touch -r node_modules pnpm-lock.yaml` y `./init.sh` (rápido), log `_trabajo/gate-T9.log`:

```
✖ 232 problems (0 errors, 232 warnings)
 Test Files  291 passed | 2 skipped (293)
      Tests  3986 passed | 20 skipped (4006)
[test:rapido] 1 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
AVISO: 1 archivo(s) del arnes cambiados en este proyecto y sin subir a la plantilla: docs/jira.md.
INIT_EXIT=0
```

**Pendiente del leader (R25):** `docs/jira.md` es archivo del arnés (`arnes.manifest`). El ejemplo de
email pasó a `<tu-email>@example.com` (líneas 62 y 68). Hay que subirlo a la plantilla con
`./scripts/arnes-sync.sh --subir -m "jira.md: email de ejemplo reservado"` (o `/afinar-regla`); el gate
avisa hasta entonces. `scratchpad/recursos-origen.ref` no se leyó ni se imprimió en ningún paso.

**R20 sobre `git diff da40c12...HEAD`** (64 rutas):
- `specs/`: solo `specs/SL-16-nombre-ordenex-docs/`.
- `arnes.manifest`: solo `docs/jira.md`, autorizado por el leader (R20 corregido, R25).
- Líneas `+`/`-` que nombran al integrador: 0.
- Líneas `+`/`-` con SINPE o colones: 13 líneas lógicas (más la exportación borrada por R3). Medido con
  `git diff --word-diff=porcelain`: en las 13, lo único que cambia es la palabra heredada → «la
  empresa» / «Servi Logistic» (y sus literales en tests del asistente). Ningún literal de Costa Rica,
  SINPE o colones cambia; se lee R20 como «no tocar ese contenido», no «no tocar la línea».
- El dominio heredado sí se cambia en `docs/api/` (R22, autorizado).

## Mapa R<n> → test

| R | Test o corrida |
|---|---|
| R1–R16, R18, R19 | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (un `describe` por requisito); mutaciones de T8 |
| R6 | `docs-marca-heredada.guardia.test.ts` > «R6: la plataforma es Servi Logistic…» (`FRASES_PLATAFORMA`, vuelta 2) + los títulos de R2, R15, R18 y R19 |
| R17 | `tests/unit/api/openapi-266-habilitar.test.ts`, `tests/unit/api/openapi-320-eliminar.test.ts` |
| R20 | revisión del diff de T9 (arriba) |
| R21 | `./init.sh` → `INIT_EXIT=0` |
| R22 | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (R22) + `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` vía `tests/unit/guards/_dominio-heredado.ts` |
| R23 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` + `tests/unit/api/openapi-webhook-contrato.test.ts` + R16 de la guardia nueva |
| R24 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` (forma `permanente` con `origen` y, desde la vuelta 2, atada a su `valor`) |
| R25 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` (`docs/jira.md` sin excepción) |

## Commits (da40c12..HEAD, sin push)

```
dd5765a docs(SL-16): T8 mutaciones de la guardia
dfffbc3 test(SL-16): T8 fuera las excepciones de SL-15 atadas a SL-16
4ac0cee docs(SL-16): T3-T7b marcadas
543d944 test(SL-16): T7b ajustes de la review de SL-15 y SL-34 (R22-R25)
03c79c5 docs(SL-16): T7 disenos sin el nombre heredado
4baaadb docs(SL-16): T6 la ayuda sin el nombre heredado
b568d3f docs(SL-16): T5 CHANGELOG, guia de integracion y manual de metricas
1de7526 docs(SL-16): T4 coleccion de Postman en su ruta nueva
86b2207 docs(SL-16): T3 contrato de la API con el mismo texto en TS y YAML
593d054 docs(SL-16): R9 con dos excepciones de historia (docs/marca.md ya limpio)
5064084 docs(SL-16): T1 y T2 marcadas
35c959e test(SL-16): T2 guardia docs-marca-heredada, primero en rojo
35d5cf2 docs(SL-16): T1 medir y clasificar el nombre heredado en el alcance
6e9cadd docs(SL-16): T0 precondiciones y gate de partida
be8b7b9 docs(SL-16): spec sin el dominio, el integrador ni emails reales
f44f0d2 docs(SL-16): spec ajustado a SL-14/SL-15/SL-34 integradas (R22-R25, T7b)
b4dde73 Merge commit 'da40c12' into feature/SL-16-nombre-ordenex-docs
```

## Vuelta 2 — H1 y H2 de la review (2026-10-22, backend_dev)

Sin MCP del grafo en esta tanda: Grep/Read. No se leyó `scratchpad/recursos-origen.ref`.

### H1 (bloqueante, R6) → `9db8a04`

`FRASES_PLATAFORMA` en `tests/unit/guards/docs-marca-heredada.guardia.test.ts`, escrita a mano con la
forma final de cada línea de plataforma de T1 (las 58 filas con la marca, menos los títulos de R2,
R15, R18 y R19), incluidas las dudosas resueltas como plataforma. 50 frases:

| Archivo | Frases |
|---|---|
| `design-notificaciones/Push.dc.html` | 1 (`veces: 3`, las tres líneas del push) |
| `design-whatsapp/Formulario.dc.html`, `Historial.dc.html` | 1 + 1 |
| `design-whatsapp/ListaMovil.dc.html`, `Main.dc.html`, `Vacio.dc.html` | 2 + 2 + 2 |
| `docs/api/CHANGELOG.md` | 8 (incluye las dudosas l. 1093 y 1108) |
| `docs/api/api-key-openapi.yaml` | 2 (l. 1 y el comentario de webhooks l. 719) |
| `docs/api/guia-integracion/README.md` | 3 |
| `docs/api/guia-integracion/guia-integracion.html` | 22 (incluye las dudosas l. 229, 352, 359, 475, 671, 814, 817) |
| `docs/ayuda/publico/entrar-y-recuperar-contrasena.md`, `rastreo-de-paquete.md` | 1 + 2 (dudosas l. 32 y 77) |
| `tests/unit/api/openapi-266-habilitar.test.ts`, `openapi-320-eliminar.test.ts` | 1 + 1 |
| `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts` | 1 (`veces: 2`) |

- Por frase: el archivo la contiene con los espacios colapsados, al menos `veces` (por defecto 1); la
  frase nombra a la plataforma; no lleva `TERMINO_EMPRESA` ni `TERMINO_EMPRESA_INICIO`.
- Formas que cuentan como «nombra a la plataforma» (`MARCAS_PLATAFORMA`, documentado en el test):
  «Servi Logistic»; «SERVI LOGISTIC» (rótulo del push); `servi-logistic` (ruta de la colección);
  `Servi-Logistic` (cabeceras `X-Servi-Logistic-…` y el nombre del PDF de la guía); y «la plataforma»,
  la forma que T3 dejó en el comentario de webhooks del YAML (l. 719), que no dice «Servi Logistic».
- Anti-vacuidad: ≥ 50 frases; al menos una en cada raíz que tenía plataforma (`docs/api/`,
  `docs/ayuda/`, `design-notificaciones/`, `design-whatsapp/`, `tests/unit/api/`); todo archivo de la
  lista está en el alcance de la guardia.
- Contrapruebas sintéticas: «Servi Logistic envía» → «la empresa envía» falta (0 de 1); la forma
  partida en dos líneas vale; 2 de 3 repeticiones falta; una frase sin marca o con «la empresa» está
  mal formada.

Verde: `vitest run docs-marca-heredada.guardia.test.ts` → 42 passed.

**M5** (la de la review): en `guia-integracion.html` «Servi Logistic envía» → «la empresa envía». Hay
una sola aparición en el archivo; se mutó esa. Revertida con `git checkout`, árbol limpio después.

```
× cada archivo contiene su forma final de cada frase de plataforma
AssertionError: 1 frase(s) de plataforma sin su forma final:
docs/api/guia-integracion/guia-integracion.html · «<p><strong>Servi Logistic envía</strong>» (0 de 1)
Tests  1 failed | 41 passed (42)
M5_EXIT=1
```

### H2 (la permanente de `pnpm-lock.yaml`) → `5635a93`

- `ExcepcionRecurso` gana `valor?: { largo, sha256, veces }`. La permanente de `pnpm-lock.yaml` lleva
  la huella del único email que hay hoy (largo 8, `veces: 1`, l. 3049); el email no se escribe en el
  test.
- La detección de emails se extrae a `emailsVisibles()`, y la usan `detectar()` y la nueva
  `permanenteFueraDeValor()`: es el mismo código.
- `permanenteFueraDeValor()` reporta cada email con otra huella como `ruta:línea · email distinto…`, y
  la cuenta si el registrado no aparece exactamente `veces` veces. Nunca imprime el valor.
- `problemaDeExcepcion()` exige la huella (64 hex, `largo` > 0, `veces` entero > 0) en las permanentes
  y la prohíbe en las temporales.
- Caso real: «SL-16 H2: cada permanente de clase email cubre exactamente su valor, las veces
  registradas».
- Contrapruebas sintéticas (lockfile simulado, emails inventados en un dominio no reservado y
  partidos en el código): el mismo valor → verde (también en mayúsculas); el mismo + otro → rojo
  `x.lock:3`; solo otro → rojo (línea + «0 vez/veces»); el mismo dos veces → rojo «2 vez/veces»; el
  reporte no lleva `@`. Y en `problemaDeExcepcion`: sin huella, huella inválida, `veces: 0` y una
  temporal con valor → rechazo.
- Mutación real: añadir a `pnpm-lock.yaml` una línea de comentario con un email inventado → rojo
  `pnpm-lock.yaml:10413 · email distinto del que cubre la permanente` (`MH2_EXIT=1`). Antes de este
  cambio la cubría la excepción por `ruta` + `clase`. Revertida con `git checkout`, árbol limpio.

### Verde final

```
vitest run docs-marca-heredada, recursos-origen-fuera, dominio-ordenex-fuera, sin-nombre-heredado
 Test Files  4 passed (4)
      Tests  100 passed | 1 skipped (101)
VT_EXIT=0
pnpm run typecheck → TC_EXIT=0
eslint de los dos archivos → LINT_EXIT=0
```

Veredicto: H1 y H2 cerrados; M5 sale en rojo; el gate (`./init.sh`) queda para el implementer.

### Vuelta 2: gate (implementer)

- H5: R20 dice ahora «no tocar ese contenido» (`2c9df37`). H3 → `progress/deudas.md` D6 (`2c9df37`). H4: sin
  tocar, lo decide Carlos.
- Nota para el reviewer: el comentario de webhooks del YAML (l. 719) dice «la plataforma ENVÍA», igual que el
  comentario de `lib/api/openapi-spec.ts:907` que dejó SL-15; por eso `MARCAS_PLATAFORMA` admite «la plataforma».
- `touch -r node_modules pnpm-lock.yaml` y `TEST_RAPIDO_BASE=dev ./init.sh` (selección por diff, deuda D5),
  log `_trabajo/gate-v2.log`:

```
[test:rapido] tests relacionados con 14 archivo(s) del diff vs dev
 Test Files  30 passed (30)
      Tests  477 passed | 1 skipped (478)
[test:rapido] tests que corren siempre (gate.siempre: guard)
 Test Files  291 passed | 2 skipped (293)
      Tests  3993 passed | 20 skipped (4013)
[test:rapido] 1 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
INIT_EXIT=0
```
