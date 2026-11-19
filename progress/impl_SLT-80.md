# impl SLT-80 «Guía de integración por API en la ayuda»

## Tanda 1 (T1, T2, T9, T10) — backend_dev, 2026-11-18

### Archivos

- Creado `docs/ayuda/oficina/guia-integracion-api.md` (conversión mecánica del HTML de SLT-201, con
  un script jsdom de un solo uso fuera del repo). Frontmatter: `titulo`, `modulo: configuracion`,
  `roles: [maestro, admin]`, `actualizado: 2026-11-18`, `fuentes` (la lista «Qué actualizar» del
  README viejo). Sin `pantalla` (D7).
- Borrados `docs/api/guia-integracion/guia-integracion.html` y `generar-pdf.py`.
- Reescrito `docs/api/guia-integracion/README.md` (fuente única, descarga desde la app, qué
  actualizar).
- Creado `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts`.
- Modificados: `tests/unit/api/openapi-466-descripciones.test.ts`,
  `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (rutas al `.md`, frases del marcado
  retiradas, suelo anti-vacuidad 50→46 con motivo), `tests/components/AyudaLayout.test.tsx`,
  `tests/unit/ayuda/acotamiento-por-rol.test.ts`, `tests/unit/asistente/acotamiento-por-rol.test.ts`
  (también la carpeta de oficina 22→23), `tests/unit/asistente/contexto-documental.test.ts`.

### Decisiones de formato en la conversión

- Orden: título `#` de la guía, la portada como párrafo («Documentación técnica…», «Versión del
  documento…»), la intro y el aviso, después `# Contenido` y el resto en el orden del HTML.
- `# Contenido`: lista plana; las entradas de primer nivel en negrita (sin listas anidadas).
- Insignias → `**POST** \`/api/...\``; etiquetas RUPTURA/YA VIGENTE → `**RUPTURA**`.
- `<div class="warn">` → cita `>`. `<pre>` → bloques `json` (los que `generar-pdf.py` validaba como
  JSON), `bash` (curl) y `text` (`Authorization:`).
- Tres retoques forzados por el renderizador, sin cambiar el contenido técnico: dos celdas con `|`
  dentro de código (`{ id, nombre } | null` → «`{ id, nombre }` o `null`»; `mensajero | tienda |
  api` → «`mensajero`, `tienda` o `api`»), porque la tabla se parte por `|`; y `«*<resultado> ·
  pendiente de confirmación*»` → «`<resultado>` · *pendiente de confirmación*» (marcador angular
  dentro de código).

### Tamaño del cuerpo (dato para P1)

74.275 bytes UTF-8 · 73.012 caracteres · 925 líneas (cuerpo sin frontmatter).

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R1300 | `guia-api-fuente-unica.guardia.test.ts` > R1300 (3 casos) |
| R1301 (lectura por `leerDocumentoAyuda`) | la guardia lee el cuerpo por `leerDocumentoAyuda` |
| R1302 | guardia > R1302 (no-vacuidad ≥10 bloques, todos parsean, MUTACION) |
| R1303, R1316 | guardia > R1303 / R1316 (ida, vuelta, control de extracción, MUTACION) |
| R1304 | guardia > R1304 |
| R1305 | guardia > R1305 — **ROJO**, ver Bloqueos |
| R1312 (sin otra copia) | guardia > R1312 |
| R1317 | `tests/unit/asistente/acotamiento-por-rol.test.ts` (38/38/10/8/7) + `contexto-documental.test.ts` (38) |

### Mutaciones (T10)

Antes: `git add -A docs tests specs` para que `git checkout --` restaure desde el índice.

(a) Path ficticio en `openApiSpec.paths` (`lib/api/openapi-spec.ts`, script
`mutar80.cjs spec` que inserta `"/api/ordenes/api-key/mutacion-slt80": { get: … }`):

```
node con-desechable.cjs <wt> servi_slt80_desechable -- pnpm exec vitest run tests/unit/guards/guia-api-fuente-unica.guardia.test.ts -t R1303
exit=1
     × cada operación de `openApiSpec.paths` sale con su método y su ruta exactos 25ms
     × MUTACION: una operación ficticia añadida a una copia de la spec pone rojo el caso de R1303 4ms
      Tests  2 failed | 3 passed | 11 skipped (16)
+   "**GET** `/api/ordenes/api-key/mutacion-slt80`",
```

Restaurado: `git checkout -- lib/api/openapi-spec.ts` (`git diff --stat` vacío).

(b) `json` roto (coma final en el primer bloque ```json de la guía, `mutar80.cjs json`):

```
node con-desechable.cjs <wt> servi_slt80_desechable -- pnpm exec vitest run tests/unit/guards/guia-api-fuente-unica.guardia.test.ts -t R1302
exit=1
     × todos parsean, sustituidos los marcadores angulares 7ms
      Tests  1 failed | 2 passed | 13 skipped (16)
+   "bloque json #1: Expected double-quoted property name in JSON at position 253 (line 8 column 2) · {
```

Restaurado: `git checkout -- docs/ayuda/oficina/guia-integracion-api.md` (`git diff --stat` vacío).

Además la guardia lleva casos MUTACION permanentes sobre datos inyectados (R1302, R1303, R1305).

### Verificación (base `servi_slt80_desechable`, solo los tests tocados)

```
pnpm exec vitest run <11 archivos: la guardia nueva, los 4 de T9, los 2 de T2,
  ayuda-render-sin-filtracion, nombres-estado-retirados, ayuda-pantalla-ruta-existe, markdown.test>
 Test Files  4 failed | 7 passed (11)
      Tests  5 failed | 157 passed (162)
```

Verdes: guardia nueva salvo R1305, los 4 de T9, `openapi-466-descripciones`, `docs-marca-heredada`,
`ayuda-render-sin-filtracion`. Rojos (los 5, ver Bloqueos):

1. `guia-api-fuente-unica` > R1305.
2. `ayuda-pantalla-ruta-existe` > «ningún documento queda huérfano» (la guía no declara `pantalla`).
3. `markdown.test.tsx` > «el frontmatter NO acaba en el cuerpo» (`actualizado:` en la prosa).
4. y 5. `nombres-estado-retirados` > árbol y contexto del asistente (`B.`, `sin gestionar`, `Asignada`).

typecheck: `pnpm run typecheck` → exit 0. lint: `pnpm run lint` → exit 0, «0 errors, 248 warnings»,
ninguno en los archivos de esta tanda.

### Bloqueos (decisión del leader / Carlos; no se improvisó)

- **R1305 literal choca con la guía de SLT-201.** Las secciones de operación no nombran 401, 403, 422
  ni 500 (que son de todas las operaciones y están en §4.3, §4.4 y §8.1). Fuera de esos cuatro
  quedan dos huecos de contenido: §5.5 no nombra `404` y §5.6 no tiene bloque de código. Opciones:
  (a) los códigos que declaran TODAS las operaciones se exigen en §8.1 «Por código», y los demás en
  la sección; más una línea en §5.5 y un ejemplo en §5.6 (cambio de contenido); (b) reformular R1305.
- **D7 contra `ayuda-pantalla-ruta-existe`.** La guardia exige `pantalla` salvo a las cuatro guías
  enlazadas desde `CATALOGO_INTEGRACIONES` (SL-36). El spec dice que la guardia vigila el `.md` «sin
  cambios», pero no es así. Propuesta: ampliar la exención con la guía de SLT-80, derivada de la
  constante de `lib/ayuda/guia-api.ts` (T6), como SL-36 la deriva del catálogo.
- **`markdown.test.tsx` exige que ningún cuerpo contenga `actualizado:`.** La guía dice «contra el
  contrato actualizado: `…Nombre`, …» (§Cambios, punto 5). T3 pide no tocar ese test. Propuesta:
  «contra el contrato actualizado (`…Nombre`, …)».
- **`nombres-estado-retirados`** (vigila `docs/ayuda/**`; el HTML no se vigilaba):
  - `## **RUPTURA** B. El estado real…` → «B.» seguido de espacio (abreviatura de bodega para la
    guardia). Propuesta: «B · El estado real…» o «Bloque B: …».
  - `El mensajero terminó el día sin gestionar el paquete.` → es `DESCRIPCION_ESTADO.novedad_interna`,
    ya exceptuado en `lib/types/order-status.ts`. La comprobación del contexto del asistente no
    admite excepciones: hay que reformular o ampliar la guardia.
  - `Asignada en el acto` (la guía, no un estado). Propuesta: «Se asigna en el acto».

### Veredicto

T2 y T9 hechos y en verde; T1 y T10 hechos pero no «Hecho»: 5 rojos que piden decisión (arriba).

## Tanda 1b (los 5 rojos de la tanda 1) — backend_dev, 2026-11-18

Decisiones del implementer en `progress/features/SLT-80.md > Decisiones`.

### Archivos

- Creado `lib/ayuda/guia-api.ts` (D7/R1315, adelantado de T6): `SLUG_GUIA_API`, `RUTA_GUIA_API`,
  `RUTA_DESCARGA_GUIA_API_PDF`, `RUTA_DESCARGA_POSTMAN`.
- `docs/ayuda/oficina/guia-integracion-api.md`: `404` en §5.5 (texto de `NotFound` de openApiSpec);
  curl + respuesta en §5.6 (`cargaId` de §5.1, `{ url, expiraEnSegundos }` de `PdfGenerateResponse`);
  «Bloque A:/B:/C:»; «actualizado (…)»; «Se asigna en el acto»; `novedad_interna` reformulada.
- `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts`: R1305 con §8.1 (`seccionGeneralDeErrores`,
  `codigosComunes`); control de no-vacuidad de §8.1; dos casos MUTACION nuevos; slug importado de
  `lib/ayuda/guia-api.ts`.
- `tests/unit/guards/ayuda-pantalla-ruta-existe.guardia.test.ts`: exención de la guía derivada de
  `SLUG_GUIA_API`, con motivo (SLT-80, D7), y un caso que ancla que el documento existe.

Nota sobre la regla 1: §8.1 cubre solo los códigos que declaran TODAS las operaciones. Si cubriera
cualquier código que nombra, 404 y 409 (también en §8.1) taparían los huecos por operación: con la
regla amplia, quitar el `404` de §5.5 seguía en verde (mutación (d) abajo lo pone rojo con la estricta).

### Mutaciones

Antes: `git add -A docs tests lib specs progress`.

(c) Quitar la fila `500` de §8.1 (`sed -i '/^| \`500\` | \`INTERNAL\` |/d'`):

```
pnpm exec vitest run tests/unit/guards/guia-api-fuente-unica.guardia.test.ts -t R1305
exit=1
     × sin huecos en ninguna sección
      Tests  1 failed | 3 passed | 14 skipped (18)
+   "§8.1 «Por código»: no nombra 500",
+   "**POST** `/api/ordenes/api-key/carga`: no nombra 500",
    … (las 10 operaciones)
```

Restaurado: `git checkout -- docs/ayuda/oficina/guia-integracion-api.md` (`git diff --stat` vacío).

(d) Quitar la línea nueva del `404` en §5.5:

```
exit=1
     × sin huecos en ninguna sección
+   "**POST** `/api/ordenes/api-key/orden/{id}/generate`: no nombra 404",
```

Restaurado igual.

### Verificación (base `servi_slt80_desechable`, los 11 de la tanda)

```
pnpm exec vitest run <guardia nueva, AyudaLayout, 2× acotamiento-por-rol, contexto-documental,
  openapi-466-descripciones, docs-marca-heredada, ayuda-render-sin-filtracion,
  nombres-estado-retirados, ayuda-pantalla-ruta-existe, markdown.test>
EXIT=0
 Test Files  11 passed (11)
      Tests  165 passed (165)
```

typecheck: `pnpm run typecheck` → exit 0.
lint: `pnpm run lint` → exit 0, «0 errors, 248 warnings» (las mismas que la tanda 1), ninguno en los archivos de esta tanda.

### Veredicto

T1 y T10 hechos y en verde; los 11 tests de la tanda, typecheck y lint en verde.

## Tanda 2 (T7, T8) — frontend_dev, 2026-11-18

### Archivos
- `app/(app)/ayuda/_components/AccionesGuiaApi.tsx` (nuevo): tres `<a href>` (no `next/link`: son descargas GET, D2/D3) en un `<nav aria-label>`; Swagger con `target="_blank" rel="noopener noreferrer"` y aviso `sr-only`. URLs de `lib/ayuda/guia-api.ts` (R1315); `/api-docs` es constante local (ruta existente, no de esta ficha).
- `app/(app)/ayuda/[...slug]/page.tsx`: pinta `<AccionesGuiaApi />` solo si `doc.slug === SLUG_GUIA_API`.
- `app/(app)/configuracion/api/page.tsx`, `app/(app)/configuracion/integraciones/page.tsx`: `actions={<EnlacesGuiaApi />}` solo en el `AppPage` de la rama del maestro. «Guía de integración» con `Link` (es página), «Descargar guía en PDF» con `<a>` (descarga).
- `tests/components/AccionesGuiaApi.test.tsx`, `tests/components/enlaces-guia-api-configuracion.test.tsx` (nuevos).

### Mapa R → test (esta tanda)
- R1306, R1301 (pantalla) → `AccionesGuiaApi.test.tsx > «%s abre la guía: el cuerpo del .md y las tres acciones»` (maestro y admin, página real con el catálogo real).
- R1308 → `AccionesGuiaApi.test.tsx > «Descargar PDF», «Swagger» y «Postman» con sus rutas exactas` + `control negativo: otro documento de Ayuda NO lleva las acciones`.
- R1313 / R1314 → `enlaces-guia-api-configuracion.test.tsx > «$ruta: Guía de integración y Descargar guía en PDF»` (las dos pantallas) + `la rama «sin permiso» no los lleva` (null, admin, adminTienda, adminSatelite, mensajero).
- R1315 (parcial, UI) → los href se comparan contra literales del spec; M4/M7 cambian la constante y ponen rojo.

### Mutaciones
Script `mut80.sh` (sed + `con-desechable ... -- pnpm exec vitest run <test>` + `git checkout -- <archivo>`; antes, commit WIP para que el checkout restaure lo de esta tanda). `git status -s` vacío al final.
- M1 quitar la condición del slug (acciones en todo documento) → exit=1, 1 failed | 4 passed (5)
- M2 no pintar nunca las acciones → exit=1, 2 failed | 3 passed (5)
- M3 quitar `target="_blank"` del Swagger → exit=1, 1 failed | 4 passed (5)
- M4 `RUTA_DESCARGA_POSTMAN` → `/ayuda/descargas/postman.json` → exit=1, 1 failed | 4 passed (5)
- M5 quitar `actions` de integraciones → exit=1, 1 failed | 3 passed (4)
- M6 poner los enlaces en la rama «sin permiso» de `/configuracion/api` → exit=1, 1 failed | 3 passed (4)
- M7 `RUTA_DESCARGA_GUIA_API_PDF` → `/ayuda/descargas/guia-api` → exit=1, 2 failed | 2 passed (4)

### Verificación (base `servi_slt80_desechable`)
`con-desechable ... -- pnpm exec vitest run tests/components/{AccionesGuiaApi,enlaces-guia-api-configuracion,ConfiguracionApiPage,AyudaDocumentoPage,AyudaLayout}.test.tsx` → EXIT=0, «Test Files 5 passed (5) · Tests 33 passed (33)». No hay test previo de `configuracion/integraciones/page.tsx`.
typecheck: `pnpm run typecheck` → exit 0.
lint: `pnpm run lint` → exit 0, «0 errors, 248 warnings» (las mismas de antes), ninguno en archivos de esta tanda.

### Veredicto
T7 y T8 hechos; tests nuevos con 7 mutaciones en rojo, typecheck y lint en verde.

## Tanda 3 (T3, T4, T5, T6) — backend_dev, 2026-11-18

### Archivos
- `lib/ayuda/bloques.ts` (nuevo, T3/D5): `analizarBloques` (líneas → bloques: título, párrafo, lista,
  tabla, cita, código, separador) y `partirInline` (negrita, cursiva, código en línea). Lo usan la
  pantalla y el PDF.
- `lib/ayuda/markdown.tsx`: solo pinta; el análisis sale de `bloques.ts`. `markdown.test.tsx` sin tocar, 16/16.
- `assets/fuentes/Archivo-guia-regular-subset.ttf` y `…-bold-subset.ttf` (T4): instanciados con fontTools
  4.63.0 (wght 400/700, wdth 100) del variable de google/fonts `ofl/archivo` en el commit
  `6c70c829f09ea345d3590406693220ea35c6553f` (sha256 `0e094a7d…b05053`). OFL 1.1 comprobada en `OFL.txt` y
  `METADATA.pb` de ese origen. El aviso y la licencia van dentro de cada TTF (`name` IDs 0/13/14).
- `lib/pdf/guia-fuente.ts` (T4): origen, licencia, sha256 y comandos; base64 de los dos pesos y `COBERTURA_GUIA`.
- `lib/pdf/guia-api-pdf.ts` (T5): `construirPdfGuiaApi(bloques, {actualizado}, logo)`.
- `app/(app)/ayuda/descargas/guia-integracion-api/route.ts` y `…/postman/route.ts` (T6).
- `next.config.ts`: `outputFileTracingIncludes["/ayuda/descargas/postman"]` = la colección (la lee del disco).
  Los TTF NO hacen falta en el trazado: viajan en base64 dentro de `guia-fuente.ts`, como la etiqueta.
- `docs/ayuda/oficina/guia-integracion-api.md`: 43 sustituciones de símbolos que Archivo no tiene (ver Decisiones).
- Tests nuevos: `tests/unit/pdf/guia-api-pdf.test.ts`, `tests/unit/ayuda/guia-api-descargas.test.ts`.
- **Fuera de «Archivos esperados» (2 tests de guardia que se ponían rojos):**
  - `tests/unit/guards/etiqueta-fuente-diferida.guardia.test.ts`: exigía UN solo archivo en `assets/fuentes/`;
    ahora nombra los tres, uno a uno.
  - `tests/unit/guards/ayuda-md-viajan-a-produccion.guardia.test.ts`: exigía `["/**"]` como únicas claves del
    trazado; ahora admite exactamente `/ayuda/descargas/postman` además, y `/**` sigue intacta.
  - El PR pasa de 29 a 31 archivos (tope 40; aviso del 80% en 32).

### Decisiones (para revisión)
- **La guía cambia 4 símbolos que Archivo no tiene** (U+2208 ∈, U+2610 ☐, U+26A0 ⚠, U+2714 ✔), medidos en el
  cmap del variable. R1311 exige que la guía vigente se genere sin error y prohíbe sustituir en silencio, y no
  se metió otra fuente. Va en un commit aparte (`5414f62e`) para poder revertirlo si se decide otra cosa:
  `⚠ ` → `Atención: ` (15), ` ∈ ` → ` es uno de ` (3), en la checklist `✔` → `Hecho` y `☐` → `[ ]` (25).
- **404 de las rutas.** Usan el mismo `notFound()` que `[...slug]/page.tsx`. En un route handler Next 16 lo
  convierte en `Response(null, {status: 404})` (`app-route/module.js:475`), y un documento inexistente pasa
  por el mismo `notFound()`: la respuesta es idéntica en estado y cuerpo dentro de la ruta. La página de Ayuda
  pinta además la vista 404 en HTML. Sin cookie de sesión, `middleware.ts` redirige a `/login` antes de llegar
  al handler, igual que con la página. No se tocó `middleware.ts` (D3): con sesión deja pasar `/ayuda/*`.
- **Código en línea en Archivo**, no en Courier: la guía lo usa con `…` (U+2026), que Courier no escribe.
- **El mensaje de `ErrorCaracterNoImprimible`** es el de las etiquetas («La etiqueta de la guia …»). Se reutiliza
  la clase tal cual (R1311 la nombra) con identidad «de integración por API» y campo «línea n del .md (tipo)».

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R1301 | `guia-api-pdf.test.ts` «cada título del .md sale en el PDF…» (títulos sacados del cuerpo de `leerDocumentoAyuda` con regex propia) |
| R1307 | `guia-api-descargas.test.ts` «R1307 · null/mensajero/adminTienda/adminSatelite → el mismo 404…» (×2 rutas) |
| R1309 | `guia-api-descargas.test.ts` «R1309 · maestro/admin → 200, application/pdf, adjunto…» + `guia-api-pdf.test.ts` títulos en orden |
| R1310 | `guia-api-pdf.test.ts`: portada (logo, #FFD000, título, versión), pie n / N en 2..N, ningún texto #FFD000, Archivo + Courier, caída sin logo (null y PNG roto) |
| R1311 | `guia-api-pdf.test.ts`: la guía vigente se genera; U+9B31 en un párrafo y `→` en código lanzan `ErrorCaracterNoImprimible` |
| R1312 | `guia-api-descargas.test.ts`: bytes iguales al `Buffer` del disco, adjunto `.json`, y la clave de trazado en `next.config.ts` |
| R1315 | `guia-api-descargas.test.ts` «las rutas de descarga viven donde dicen las constantes…» |

### Mutaciones (base `servi_slt80_desechable`, restauradas con `git checkout --`)
```
# 1a. Sin chequeo de rol en la ruta del PDF: `if (doc === null) notFound();`
node con-desechable.cjs <wt> servi_slt80_desechable -- pnpm exec vitest run tests/unit/ayuda/guia-api-descargas.test.ts
       × R1307 · null → el mismo 404 que un documento que no existe
       × R1307 · mensajero → … · × adminTienda → … · × adminSatelite → …
      Tests  4 failed | 11 passed (15)
# 1b. Igual en la ruta de Postman: `if (guia === null) notFound();`
      Tests  4 failed | 11 passed (15)   (los mismos cuatro)
# 2. Pie pintado en #FFD000: `l.doc.setTextColor(0xff, 0xd0, 0x00);` tras `l.archivo(PT_PIE, …)`
node con-desechable.cjs <wt> servi_slt80_desechable -- pnpm exec vitest run tests/unit/pdf/guia-api-pdf.test.ts
     × R1310 · todo el texto en #111111: ningún texto en #FFD000
      Tests  1 failed | 9 passed (10)
# 3. Sin pie: `// pies(l);`
     × R1310 · el pie «… · n / N» está en las páginas 2..N y no en la portada
      Tests  1 failed | 9 passed (10)
# 4. (extra) Sin exigir cobertura: `// exigirCoberturaDeBloques(...)`
     × R1311 · un carácter que Archivo no cubre lanza ErrorCaracterNoImprimible nombrándolo
     × R1311 · y en un bloque de código, un carácter que Courier no escribe también lanza
      Tests  2 failed | 8 passed (10)
```

### Verificación (base `servi_slt80_desechable`)
```
pnpm exec vitest run tests/unit/ayuda/guia-api-descargas.test.ts tests/unit/pdf/guia-api-pdf.test.ts
  tests/unit/ayuda/markdown.test.tsx tests/unit/guards/guia-api-fuente-unica.guardia.test.ts
  tests/unit/guards/ayuda-md-viajan-a-produccion.guardia.test.ts tests/unit/guards/ayuda-pantalla-ruta-existe.guardia.test.ts
  tests/unit/guards/ayuda-render-sin-filtracion.guardia.test.ts tests/unit/guards/docs-marca-heredada.guardia.test.ts
  tests/unit/guards/etiqueta-fuente-diferida.guardia.test.ts tests/unit/guards/nombres-estado-retirados.guardia.test.ts
  tests/components/AccionesGuiaApi.test.tsx tests/unit/api/openapi-466-descripciones.test.ts
 Test Files  12 passed (12)
      Tests  169 passed (169)
pnpm run typecheck   → tsc --noEmit, exit 0
pnpm run lint        → exit 0 (0 errors; 248 warnings previos, ninguno en archivos de esta tanda)
```
El PDF de la guía vigente: 27 páginas, ~131 KB, ~200 ms. Revisado a ojo (render con PyMuPDF): portada,
tablas con cabecera repetida, citas y código con fondo, pie en 2..27.

### Veredicto
T3, T4, T5 y T6 hechos; 169/169, typecheck y lint en verde; 5 mutaciones en rojo. Pendiente: T11 (E2E y gate).

## T11 E2E — frontend_dev, 2026-11-18

Parte E2E de T11. El `./init.sh` del cierre de T11 lo corre el implementer (no corrido aquí).

### Archivos
- `e2e/ayuda-guia-api.spec.ts` (nuevo): 3 casos con sesión real (`sesionDe`), empresa propia y un mensajero de una zona satélite.
- `playwright.config.ts`: el spec entra en el proyecto `aislamiento` (la guardia `e2e-sin-saltos` exige un proyecto por spec).

### Mapa R → caso E2E
- R1313, R1306, R1308 → «el maestro llega a la guía desde /configuracion/api y ve las tres acciones».
- R1309, R1312 → «el maestro descarga el PDF y la colección de Postman con su sesión» (200, `application/pdf`, `%PDF`, nombre de adjunto; Postman 200 JSON con `info` e `item`).
- R1307 → «el mensajero recibe 404 en la guía, el PDF y la colección de Postman» (`maxRedirects: 0`).

`grep -rl "/ayuda" e2e/` antes de crear el spec: sin resultados; no hay otros E2E de `/ayuda`.

### Comando (base desechable `servi_slt80_e2e_desechable`: crear + migrate deploy + db:seed; `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3080`)
```
E2E_PUERTO=3080 E2E_STORAGE_PUERTO=54380 pnpm exec playwright test e2e/ayuda-guia-api.spec.ts --no-deps --reporter=list
```
`--no-deps`: el spec no depende de `plataforma-vacia` (crea su empresa con la fábrica); en CI corre con su grupo.

Primera corrida: 1 failed (el `#` del `.md` se pinta como `h2` bajo el `h1` «Ayuda»; ajustado el oráculo al nivel real y añadido el índice «Oficina»). Después, dos corridas seguidas sobre la misma base:
```
  3 passed (9.7s)
  3 passed (9.8s)
```
Corrida final (tras restaurar la mutación y reconstruir):
```
  ok 1 [aislamiento] › e2e\ayuda-guia-api.spec.ts:61:7 › SLT-80 — guía de integración por API en Ayuda › el maestro llega a la guía desde /configuracion/api y ve las tres acciones (R1313, R1306, R1308) (1.8s)
  ok 2 [aislamiento] › e2e\ayuda-guia-api.spec.ts:87:7 › SLT-80 — guía de integración por API en Ayuda › el maestro descarga el PDF y la colección de Postman con su sesión (R1309, R1312) (591ms)
  ok 3 [aislamiento] › e2e\ayuda-guia-api.spec.ts:108:7 › SLT-80 — guía de integración por API en Ayuda › el mensajero recibe 404 en la guía, el PDF y la colección de Postman (R1307) (606ms)
  3 passed (10.3s)
E2E_EXIT=0
```

### Mutación
`lib/ayuda/documento.ts > puedeLeerDocumento`: `return documentoVisiblePara(doc, rol);` → `return true;` + `next build`:
```
  x  3 [aislamiento] › ... › el mensajero recibe 404 en la guía, el PDF y la colección de Postman (R1307)
    Error: mensajero en /ayuda/descargas/guia-integracion-api
    Expected: 404
    Received: 200
  1 failed
  2 passed (9.7s)
E2E_EXIT=1
```
Restaurada con `git checkout -- lib/ayuda/documento.ts`, reconstruida y en verde (arriba).

### Otros comandos
```
pnpm exec eslint e2e/ayuda-guia-api.spec.ts playwright.config.ts  → LINT_EXIT=0
pnpm exec tsc --noEmit                                             → TSC_EXIT=0
vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts        → 38 passed (38)
```
Servidores parados al terminar (Playwright cierra los suyos; 3080 y 54380 sin escucha).

### Veredicto
Parte E2E de T11 en verde (3/3, dos corridas) y la mutación del permiso la pone roja; falta el `./init.sh` del implementer.

## Cierre del implementer — 2026-11-18

### Mapa R → test (consolidado)

| R | Test |
|---|---|
| R1300, R1302, R1303, R1304, R1305, R1316 | `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts` |
| R1301 | `tests/unit/pdf/guia-api-pdf.test.ts` (títulos en orden) + `tests/components/AccionesGuiaApi.test.tsx` |
| R1306 | `tests/components/AccionesGuiaApi.test.tsx` + `e2e/ayuda-guia-api.spec.ts` |
| R1307 | `tests/unit/ayuda/guia-api-descargas.test.ts` + `tests/unit/ayuda/acotamiento-por-rol.test.ts` + `e2e/ayuda-guia-api.spec.ts` |
| R1308 | `tests/components/AccionesGuiaApi.test.tsx` |
| R1309, R1310, R1311 | `tests/unit/pdf/guia-api-pdf.test.ts` (+ cabeceras en `guia-api-descargas.test.ts`) |
| R1312 | `tests/unit/ayuda/guia-api-descargas.test.ts` + guardia `guia-api-fuente-unica` (sin otra copia) |
| R1313, R1314, R1315 | `tests/components/enlaces-guia-api-configuracion.test.tsx` |
| R1317 | `tests/unit/asistente/acotamiento-por-rol.test.ts` + `tests/unit/asistente/contexto-documental.test.ts` |

### Verificación final (base `servi_slt80_desechable`)

Typecheck, lint y todos los tests que el diff toca más las guardias de Ayuda y `e2e-sin-saltos`:

```
TYPECHECK_EXIT=0
LINT_EXIT=0
 Test Files  18 passed (18)
      Tests  262 passed (262)
VITEST_EXIT=0
```

E2E: `e2e/ayuda-guia-api.spec.ts` 3 passed / 0 failed (ver «T11 E2E»).

### Gate (`./init.sh`)

`INIT_EXIT=1`: se para en el validador antes de typecheck/tests:
`specs/SLT-80-guia-api-en-ayuda/ no cuadra con feature_list.json: SLT-80 se llama "guia-integracion-api-ayuda"`
(la ficha en `feature_list.json` tiene name `guia-integracion-api-ayuda` y rama
`feature/SLT-80-guia-integracion-api-ayuda`; la rama y el spec usan `guia-api-en-ayuda`). Es dato del
leader (`feature_list.json` no se versiona); el implementer no lo toca.

### Para el reviewer

- La guía cambió 43 glifos que Archivo no tiene (⚠ ∈ ☐ ✔) en un commit aparte (`5414f62e`), para cumplir R1311.
- R1305: §8.1 cubre solo los códigos comunes a todas las operaciones (401, 403, 422, 500); el resto se exige por sección.
- R1307: sin cookie, `middleware.ts` redirige a `/login` antes del handler (igual que la página); con sesión y rol no permitido, 404 con `notFound()`.
- `ErrorCaracterNoImprimible` reutiliza el mensaje de etiquetas («La etiqueta de …»).
- Tamaño: 34 archivos fuera de `specs/` y `progress/` (dos guardias ajustadas fuera de «Archivos esperados» y `playwright.config.ts`), sobre el aviso del 80%; tamaño aceptado por Carlos (P2).

### Gate tras corregir la ficha y fusionar origin/dev (SLT-201, SLT-202, SLT-207) — 2026-11-18

- 1.ª corrida: rojo NUEVO en `asistente-sin-frontmatter.guardia` (recuento 37→38 que faltaba en T9, y la
  fuente `docs/api/CHANGELOG.md` que el cuerpo nombra). Arreglo: recuento a 38 con su motivo, y
  `docs/api/CHANGELOG.md` fuera de `fuentes` (el integrador debe seguir leyendo su ruta).
- 2.ª corrida: rojo NUEVO en `marca-estaticos.guardia` (literal «Servi Logistic» en `lib/pdf/guia-api-pdf.ts`).
  Arreglo: `MARCA.nombre`; `guia-api-pdf.test.ts` sigue verde contra el literal del spec.
- 3.ª corrida: `Test Files 100/100 · 100/100 · 100/100 · 71/71` y **`INIT_EXIT=0`**.
  Aviso: tamaño 34/40 archivos, aceptado por Carlos (P2).

## Arreglos de review

### B2 — backend_dev, 2026-11-18

- **Archivo:** `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts` (solo este).
- **Cambio:** R1304 ya no busca cada evento entre backticks en toda la guía. Dos funciones puras:
  - `eventosDeLaTabla65(texto)`: filas de la tabla de §6.5 (sin cabecera ni separador) y, por fila, la primera celda que es solo código;
  - `desfaseTabla65(texto, publicos)`: `faltanEnTabla` y `sobranEnTabla`.
- **Casos R1304 (4):**
  - no-vacuidad: `EVENTOS_PUBLICOS` ≥ 1, la tabla tiene ≥ 1 fila, el conjunto extraído no está vacío y cada fila aporta su estado (12/12);
  - igualdad en los dos sentidos contra `EVENTOS_PUBLICOS`;
  - MUTACION (a): la lista con `en_bodega_satelite` añadido → `faltanEnTabla = ["en_bodega_satelite"]`;
  - MUTACION (b): una tabla inyectada con `recolectando` de más → `sobranEnTabla = ["recolectando"]` (y la tabla de §6.6 no se cuela).
- **Verde:** `con-desechable … servi_slt80_desechable -- pnpm exec vitest run tests/unit/guards/guia-api-fuente-unica.guardia.test.ts`
  → `Test Files 1 passed (1) · Tests 20 passed (20) · EXIT=0`.
- **Mutación real, a mano:** `sed -i '91i\  "en_bodega_satelite",' lib/types/webhook-eventos.ts` y la misma guardia:
  ```
  Test Files  1 failed (1)
       Tests  1 failed | 19 passed (20)
  FAIL ... R1304 — la tabla de §6.5 es exactamente `EVENTOS_PUBLICOS` > ninguno falta en la tabla y la tabla no trae ninguno de más
  +   "faltanEnTabla": [
  +     "en_bodega_satelite",
  EXIT=1
  ```
  Restaurado con `git checkout -- lib/types/webhook-eventos.ts`; `git status --short lib/` vacío.
- **Typecheck:** `pnpm run typecheck` → `TC_EXIT=0`. **Lint:** `pnpm exec eslint <guardia>` → `LINT_EXIT=0`.
- **Veredicto:** B2 cerrado; la guardia de R1304 se pone roja con un estado existente promovido a evento.

### m6 — frontend_dev, 2026-11-18
- Un solo `EnlacesGuiaApi` en `app/(app)/ayuda/_components/EnlacesGuiaApi.tsx` (mismo markup, `Link` a `RUTA_GUIA_API` y `<a>` a `RUTA_DESCARGA_GUIA_API_PDF`); `configuracion/api/page.tsx` y `configuracion/integraciones/page.tsx` lo importan. Ninguna regla de `docs/conventions.md` ni guardia pide otra ubicación; `grep "function EnlacesGuiaApi"` → 1 sola definición.
- `vitest run` enlaces-guia-api-configuracion + ConfiguracionApiPage + AccionesGuiaApi → `3 passed (3) · 14 passed (14) · EXIT=0`; `tsc --noEmit` → 0; `eslint` de los 3 archivos → 0.

### Arreglos de review: verificación (2026-11-18)

- B1: `tests/integration/asistente-route.test.ts` 37→38 (P1), con un negativo: el mensajero no recibe `oficina/guia-integracion-api`. 29/29.
- m1 (texto de R1307), m3 (README sin `⚠`) y un disparador nuevo en `arnes.config.json`: `docs/ayuda/**` y `lib/ayuda/**` disparan los tests del asistente y de Ayuda. `node scripts/test-rapido.mjs --comprobar tests/integration/asistente-route.test.ts` → «entra».
- m4 sin tocar (pendiente de Carlos). Fusión de origin/dev sin conflictos.
- Gate: `INIT_EXIT=0`; asistente-route corrió dentro del rápido (29 tests). el PR pasa del tamano (38/40 archivos, 3406/1000 lineas de produccion, 1358/3000 de tests).
- E2E (`servi_slt80_e2e_desechable`: migrate deploy + `next build`): `DEPLOY_EXIT=0 · BUILD_EXIT=0 · 3 passed (22.8s) · E2E_EXIT=0`.
