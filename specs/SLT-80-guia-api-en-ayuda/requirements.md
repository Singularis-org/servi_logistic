# SLT-80 «Guía de integración por API en la ayuda» — requirements

> Ruta ligera, zona fullstack. Rango reservado: **R1300–R1319** (se usan R1300–R1317). Sin migración,
> sin esquema, sin dependencia nueva (`jspdf` está aprobada: `docs/dependencias.md:52`). Depende de
> SLT-201 «Manual de la API al día: Swagger/Postman con la carga completa y guía PDF actualizada», que
> se mergea antes (T0). El grafo de código no indexa este worktree: todo se leyó con Grep/Read.

## Alcance

La guía de integración del canal por API key existe hoy solo como HTML editable en el repo
(`docs/api/guia-integracion/guia-integracion.html`, ~1.000 líneas). Su PDF lo imprime a mano quien
tenga Chrome, con `generar-pdf.py`. Ni el maestro ni el admin la ven dentro de la app.

Esta ficha:

1. **Pasa la guía a un único `.md` dentro de la Ayuda**: `docs/ayuda/oficina/guia-integracion-api.md`.
   Ese archivo es la **fuente única**. De él salen la pantalla de Ayuda, el PDF y lo que lee el
   asistente. El HTML y `generar-pdf.py` se retiran en el mismo PR.
2. **La muestra en Ayuda** solo a maestro y admin, con el layout y el renderizador que ya existen.
3. **Añade la descarga en PDF con la marca Servi Logistic**, generada con jspdf desde el mismo `.md`.
4. **Enlaza** a `/api-docs` y a la colección de Postman.
5. **Pone enlaces a la guía y a su PDF** desde `/configuracion/api` y `/configuracion/integraciones`.

**Por qué `.md` y no `.html` como fuente única.** La ficha pide «generado desde el mismo .md». La Ayuda
solo lee `.md` (`lib/ayuda/catalogo.ts`) y los pinta sin `dangerouslySetInnerHTML`
(`lib/ayuda/markdown.tsx`). Dejar el HTML como fuente habría obligado a meter HTML crudo en la app y a
generar el PDF desde HTML. `jsPDF.html()` necesita `html2canvas`, que sería una dependencia nueva. Con
dos fuentes vivas (el HTML para el PDF y el `.md` para la app), lo que se vería en la app y lo que
recibiría el integrador acabarían siendo distintos.

### Lo que ya existe (y se reutiliza, no se re-crea)

Términos buscados: `guía de integración`, `guia-integracion`, `ayuda`, `Postman`, `api-docs`, `jspdf`,
`logo`/`marca`. Se buscó en `feature_list.json`, en `specs/` y en el código.

| Qué | Dónde | Cómo se usa aquí |
|---|---|---|
| Módulo de Ayuda: layout, índice y acotamiento por rol | `app/(app)/ayuda/layout.tsx`, `app/(app)/ayuda/[...slug]/page.tsx`, `lib/ayuda/documento.ts` (`ROLES_AYUDA`, `puedeLeerDocumento`, `documentosQuePuedeLeer`) | Un `.md` en `docs/ayuda/oficina/` con `roles: [maestro, admin]` sale en el índice de la oficina. A los demás roles les da 404 sin tocar código. Es la regla de las fichas 433 y 435. |
| Catálogo y renderizador | `lib/ayuda/catalogo.ts` (`leerDocumentoAyuda`), `lib/ayuda/markdown.tsx`, `lib/ayuda/frontmatter.ts` | La pantalla los usa sin cambios. El PDF reutiliza el **mismo análisis de bloques** (T3). |
| Que los `.md` lleguen a producción | `next.config.ts` (`outputFileTracingIncludes: "/**": ["./docs/ayuda/**/*.md"]`) | Ya cubre el `.md` nuevo y la ruta de descarga. No se toca. |
| Guardias de contenido de Ayuda | `ayuda-render-sin-filtracion.guardia.test.ts` (sin enlaces, imágenes, HTML crudo ni listas anidadas), `ayuda-pantalla-ruta-existe.guardia.test.ts`, `nombres-estado-retirados.guardia.test.ts` (ya vigila `docs/api/**` y `docs/ayuda/**`) | Vigilan el `.md` nuevo sin cambios. |
| Swagger UI público | `app/api-docs/route.ts` (feature 106), spec en `lib/api/openapi-spec.ts` (`openApiSpec`) | La guía enlaza ahí. `openApiSpec.paths` es la referencia contra la que se comprueba la cobertura de la guía (R1303). |
| Colección de Postman | `docs/api/servi-logistic-api-key.postman_collection.json` (solo valores de ejemplo, como `svl_pega_aqui_tu_key`) | Se sirve tal cual, sin copia (R1313). |
| Eventos de webhook | `lib/types/webhook-eventos.ts` (`EVENTOS_PUBLICOS`) | Referencia de cobertura (R1304). |
| **PDF con logo (estructura)** | `lib/facturas-plataforma/pdf.ts` (SLT-136): función pura sobre jsPDF, cabecera con `addImage` del logo y el nombre en texto si el PNG no carga, pie y `imprimible` | Se copia la **estructura**. **La paleta no**: es la violeta de Singularis (`TINTA`, `VIOLETA`…), que no es la marca Servi Logistic. |
| **Fuente embebida en PDF** | `lib/pdf/etiquetas-fuente.ts` (subconjunto TTF con origen, sha256 y comando de subset) y `lib/pdf/etiquetas-fuente-registro.ts` (`registrarFuente`, `exigirCobertura`, `ErrorCaracterNoImprimible`, `escribibleEnFuenteEstandar`) | Archivo se embebe con el mismo patrón. La cobertura se exige con las mismas funciones (R1310). |
| **Logo Servi Logistic en PNG** | `lib/services/email/plantillas/logo-correo.ts` (`LOGO_CORREO_PNG_BASE64`, 360×105, generado de `public/brand/logo-horizontal-fondo-claro.svg`) | Es el logo del PDF. jsPDF no pinta SVG, y este PNG ya existe y lo verifica `logo-correo.test.ts`. |
| **Paleta y tipografía** | `docs/marca.md` (#111111, #FFD000, #F7F7F5; Archivo; regla «nunca texto amarillo sobre blanco») y `app/layout.tsx` (`Archivo` de `next/font/google`) | Son los colores y la tipografía del PDF (R1309). |
| Utilidades de test de PDF | `tests/unit/pdf/pdf-inspector.ts` (`textosDePagina`, `imagenesDePagina`, `fuentesDePagina`, `rectangulosDePagina`) y `tests/unit/pdf/ttf-lector.ts` | Los tests de R1308–R1310 las usan. |
| Ficha paralela | SLT-201 «Manual de la API al día: Swagger/Postman con la carga completa y guía PDF actualizada» (pending, sin spec) | Actualiza el HTML, el Postman y la spec. **Entra antes.** Esta ficha convierte el HTML **ya actualizado** (T0). |

**No se reutiliza**, y por qué:

- La paleta del HTML actual (azul marino y dorado, `--navy`/`--accent`) no es la marca Servi Logistic.
- Las etiquetas (`lib/pdf/etiquetas-dibujo.ts`) solo llevan el rótulo de texto `EMPRESA`, sin logo.
- El manifiesto es un XLSX, no un PDF (`lib/utils/manifiesto-xlsx.ts`).

No hay ninguna ficha ni spec que ya haga esto: nada que bloquear.

**Fuera de alcance:**

- **La API v2 de geografía (SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva»).** No está en
  `dev`. La description de la ficha la incluye, pero el leader la sacó el 2026-11-18. Si entra a la
  spec, queda cubierta por R1316.
- Cambiar el contenido técnico de la guía. Eso es de SLT-201. Aquí solo se convierte el formato.
- El `baseUrl: http://localhost:3000` de la colección de Postman.

**`/design`: no aplica.** No se crea ninguna pantalla nueva. La guía es un documento más de Ayuda y se
pinta con `AyudaLayout` y `[...slug]/page.tsx`, igual que los otros 37. Lo único visual que se añade:

- una fila de tres acciones encima del documento;
- un enlace y un botón en la cabecera (`AppPage.actions`) de dos pantallas que ya existen.

Todo con `Button` de `components/ui/`. El aspecto del PDF lo fija R1309 y se aprueba con Carlos en
Preview.

## Decisiones tomadas en este spec (se aprueban con él)

| # | Decisión | Alternativa descartada y por qué |
|---|---|---|
| D1 | La fuente única es `docs/ayuda/oficina/guia-integracion-api.md`. Se retiran `guia-integracion.html` y `generar-pdf.py`. `docs/api/guia-integracion/README.md` pasa a apuntar al `.md` y a la descarga desde la app. | Mantener el HTML como fuente: ver «Por qué `.md`» arriba (HTML crudo en la app y `html2canvas` como dependencia nueva). |
| D2 | El PDF se genera **en el servidor**, en una ruta GET con sesión: `/ayuda/descargas/guia-integracion-api`. Así un `<a href>` sirve de «descarga directa» desde cualquier pantalla. | Generarlo en el navegador, como la factura de SLT-136: obligaría a meter las ~1.000 líneas del `.md` en el HTML de `/configuracion/api` y de Integraciones para ofrecer la descarga desde ahí. |
| D3 | La colección de Postman se sirve **con sesión y solo a maestro y admin**, en `/ayuda/descargas/postman`. Se aplica la misma regla de lectura que a la guía. `middleware.ts` no se toca. | Servirla pública bajo `/api/docs/` (el prefijo ya es público): abriría una superficie pública nueva, y la ficha dice «solo con sesión». Ver P3. |
| D4 | Texto en **Archivo** embebida (Regular y Bold, subconjunto, con el patrón de `etiquetas-fuente.ts`). Bloques de código en **Courier** estándar de jsPDF, sin embeber. | JetBrains Mono embebida para el código: un archivo de fuente más, cuando el PR ya va al 72,5% del tope de archivos. |
| D5 | El PDF y la pantalla interpretan el Markdown con **un solo analizador de bloques** (`lib/ayuda/bloques.ts`). `markdown.tsx` pasa a usarlo para pintar en React y `guia-api-pdf.ts` para dibujar en jsPDF. | Que el PDF tenga su propio parser: dos lecturas del mismo `.md` que divergen sin que nada se ponga rojo. |
| D6 | La guía conserva su estructura y su tono («usted»: el lector es el integrador). No se le añade el cierre «Lo que esta pantalla NO hace» del README de Ayuda, porque no explica una pantalla. Su §1 «Qué NO resuelve» cumple ese papel. | Forzar el cierre: reordenaría un documento que el integrador ya conoce. |
| D7 | La guía **no declara `pantalla:`**. `/configuracion/api` ya la declara `oficina/configuracion-api.md`, y dos documentos con la misma ruta para el mismo rol rompen la unicidad del «?» (`candidatosRutaDocumento`). | Declarar `/configuracion/api`: el «?» de esa pantalla tendría dos candidatos. |

## Requisitos (EARS)

### Fuente única

- **R1300.** La guía de integración por API DEBE tener una sola fuente editable en el repositorio:
  `docs/ayuda/oficina/guia-integracion-api.md`, con `roles: [maestro, admin]`.
  - En el repositorio NO DEBEN existir `docs/api/guia-integracion/guia-integracion.html` ni
    `docs/api/guia-integracion/generar-pdf.py`.
  - `docs/api/guia-integracion/README.md` DEBE nombrar ese `.md` como la fuente.
- **R1301.** El sistema DEBE construir la pantalla de la guía y el PDF a partir del cuerpo que
  devuelve `leerDocumentoAyuda` para ese slug, y de ningún otro texto.
- **R1302.** Todo bloque de código marcado `json` de la guía DEBE ser JSON válido una vez sustituidos
  los marcadores angulares (`<ordenId>`). Es la comprobación que hoy hace `generar-pdf.py`.

### Cobertura contra la spec (que la guía no se desfase de la API)

- **R1303.** La guía DEBE nombrar, con su método y su ruta exactos, cada operación (método + ruta) de
  `openApiSpec.paths`. Y NO DEBE nombrar como endpoint del canal ninguna operación que no esté en
  `openApiSpec.paths`.
- **R1304.** La guía DEBE nombrar cada evento de `EVENTOS_PUBLICOS`.
- **R1305.** En la sección de cada operación, la guía DEBE incluir al menos un ejemplo (bloque de
  código). También DEBE nombrar cada código de respuesta que no sea 2xx declarado para esa operación
  en `openApiSpec`.

### Pantalla en Ayuda

- **R1306.** CUANDO un `maestro` o un `admin` abre `/ayuda/oficina/guia-integracion-api`, el sistema
  DEBE mostrar la guía dentro del módulo de Ayuda, con el índice de la oficina a la izquierda.
- **R1307.** SI quien pide la pantalla de la guía, su PDF o la colección de Postman no tiene sesión, o
  su rol no es `maestro` ni `admin`, ENTONCES el sistema DEBE responder 404, la misma respuesta que da
  a un documento que no existe.
- **R1308.** MIENTRAS se muestra la guía, el sistema DEBE ofrecer tres acciones:
  - «Descargar PDF», que lleva a `/ayuda/descargas/guia-integracion-api`;
  - «Referencia interactiva (Swagger)», que abre `/api-docs` en una pestaña nueva;
  - «Colección de Postman», que lleva a `/ayuda/descargas/postman`.

  Ningún otro documento de Ayuda DEBE mostrar esas acciones.

### PDF

- **R1309.** CUANDO un `maestro` o un `admin` pide `/ayuda/descargas/guia-integracion-api`, el
  sistema DEBE responder:
  - un PDF generado con jsPDF en ese momento a partir del `.md` de R1300;
  - con `Content-Type: application/pdf`;
  - como adjunto llamado `Guia-Integracion-API-Servi-Logistic-<actualizado>.pdf`, donde
    `<actualizado>` es el campo `actualizado` del frontmatter.

  Cada título del `.md` DEBE aparecer en el PDF, en el mismo orden.
- **R1310.** El PDF DEBE llevar la marca Servi Logistic:
  - **Portada:**
    - el logo de `LOGO_CORREO_PNG_BASE64`;
    - una franja de acento `#FFD000`;
    - el título «Guía de integración — API de Servi Logistic»;
    - «Versión del documento: <actualizado>».
  - **Fuente:** Archivo embebida en el texto; Courier en los bloques de código.
  - **Colores:** texto principal en `#111111`. El color `#FFD000` NO DEBE usarse nunca como color de
    texto.
  - **Pie:** en cada página menos la portada, «Guía de integración — API de Servi Logistic · n / N».
  - **Si el logo no carga:** SI el PNG del logo no se puede dibujar, ENTONCES la portada DEBE llevar
    «Servi Logistic» en texto y el PDF DEBE generarse igual.
- **R1311.** SI la guía contiene un carácter que no cubre la fuente embebida (o, en un bloque de
  código, la fuente estándar), ENTONCES la generación DEBE fallar con `ErrorCaracterNoImprimible`
  nombrando ese carácter, en vez de sustituirlo en silencio. La guía vigente DEBE generarse sin ese
  error.

### Postman

- **R1312.** CUANDO un `maestro` o un `admin` pide `/ayuda/descargas/postman`, el sistema DEBE
  responder con los bytes exactos de `docs/api/servi-logistic-api-key.postman_collection.json`, como
  adjunto `.json`. El repositorio NO DEBE contener otra copia de esa colección.

### Enlaces desde configuración

- **R1313.** MIENTRAS un `maestro` está en `/configuracion/api`, el sistema DEBE mostrar en la
  cabecera dos enlaces: uno a `/ayuda/oficina/guia-integracion-api` («Guía de integración») y otro a
  `/ayuda/descargas/guia-integracion-api` («Descargar guía en PDF»).
- **R1314.** MIENTRAS un `maestro` está en `/configuracion/integraciones`, el sistema DEBE mostrar los
  mismos dos enlaces de R1313.
- **R1315.** Las URLs de R1308, R1313 y R1314 DEBEN salir de una sola constante, la misma que usan
  las rutas de descarga.

### Condicional y asistente

- **R1316.** SI `openApiSpec.paths` incluye las operaciones de la API v2 de geografía (SLT-45),
  ENTONCES la guía DEBE documentarlas con el mismo criterio de R1303–R1305. El test de R1303 lo exige
  sin cambios: quien añada esas rutas a la spec ve rojo hasta documentarlas.
- **R1317.** El asistente DEBE recibir la guía en el contexto de `maestro` y `admin`, y NO DEBE
  recibirla en el de `mensajero`, `adminTienda` ni `adminSatelite`. Es la regla de lectura que ya rige
  para todo el catálogo. Pendiente de P1.

## Tasks

- [x] **T0 — Esperar a SLT-201.**
  - Comprobar en `origin/dev` que SLT-201 está mergeada (su commit toca
    `docs/api/guia-integracion/guia-integracion.html`) y traerla a la rama con `git merge origin/dev`.
  - **Hecho:** el HTML de la rama es el de SLT-201. Si SLT-201 no está en `dev`, se para y se avisa
    al leader.
- [x] **T1 — Convertir el HTML a `docs/ayuda/oficina/guia-integracion-api.md` (R1300, R1302, R1303–R1305).**
  - Frontmatter: `titulo`, `modulo: configuracion`, `roles: [maestro, admin]`, `actualizado` y
    `fuentes` (las de la lista «Qué actualizar» del README actual). Sin `pantalla` (D7).
  - Solo la sintaxis que pinta el renderizador:
    - los marcadores angulares, siempre dentro de código;
    - las insignias POST/GET pasan a `**POST** \`/api/...\``;
    - sin enlaces Markdown, sin listas anidadas.
  - Medir el tamaño del cuerpo y anotarlo en `progress/features/SLT-80.md` (dato para P1).
  - **Hecho:**
    - todas las secciones del índice («Contenido») del HTML están, con el mismo orden y el mismo texto;
    - `ayuda-render-sin-filtracion` y `nombres-estado-retirados` siguen en verde.
- [x] **T2 — Retirar la fuente vieja (R1300).**
  - Borrar `guia-integracion.html` y `generar-pdf.py`.
  - Reescribir `docs/api/guia-integracion/README.md`: dónde se edita (el `.md`), cómo se descarga el
    PDF (desde la app) y qué actualizar en cada versión.
  - Pasar al `.md` las lecturas del HTML en `tests/unit/api/openapi-466-descripciones.test.ts` y
    `tests/unit/guards/docs-marca-heredada.guardia.test.ts`.
  - **Hecho:** `grep -r "guia-integracion.html"` solo aparece en `docs/api/CHANGELOG.md` (es historia)
    y en `docs/limpieza-ordenex.md`; las dos pruebas, en verde.
- [x] **T3 [P tras T1] — Analizador de bloques común (D5).**
  - Extraer de `lib/ayuda/markdown.tsx` a `lib/ayuda/bloques.ts` el paso de líneas a bloques: título,
    párrafo, lista, tabla, cita y código.
  - `markdown.tsx` lo consume.
  - **Hecho:** `tests/unit/ayuda/markdown.test.tsx` en verde sin tocarlo.
- [x] **T4 — Fuente Archivo para PDF (D4, R1311).**
  - Subconjuntos Regular y Bold de Archivo, instanciados del variable con `fontTools`, en
    `assets/fuentes/`.
  - `lib/pdf/guia-fuente.ts` con el origen, la licencia (OFL, verificada en el origen), el sha256 y el
    comando de subset, como `etiquetas-fuente.ts`.
  - Rangos: los mismos de la etiqueta, más los caracteres que use la guía. Medirlos sobre el `.md` de
    T1.
  - **Hecho:** el test de cobertura de R1311 pasa sobre la guía.
- [x] **T5 — Generador `lib/pdf/guia-api-pdf.ts` (R1309–R1311).**
  - Función pura que recibe los bloques de T3, el frontmatter y el logo, y devuelve los bytes del PDF.
  - Copia la estructura de `lib/facturas-plataforma/pdf.ts`:
    - lienzo jsPDF;
    - logo con `addImage` y el nombre en texto si el PNG no carga;
    - paginación con pie.
  - Paleta de `docs/marca.md`.
  - **Hecho:** los tests de R1309–R1311 en verde con `pdf-inspector`.
- [x] **T6 — Rutas de descarga (R1307, R1309, R1312, R1315).**
  - `lib/ayuda/guia-api.ts`: el slug y las tres URLs.
  - `app/(app)/ayuda/descargas/guia-integracion-api/route.ts` y `app/(app)/ayuda/descargas/postman/route.ts`.
  - Las dos resuelven el actor y aplican `puedeLeerDocumento` sobre el documento de la guía: 404
    idéntico al de `[...slug]`.
  - **Hecho:** tests de handler en verde, también los de sin sesión y los roles no permitidos.
- [x] **T7 — Acciones en la pantalla (R1306, R1308).**
  - `app/(app)/ayuda/_components/AccionesGuiaApi.tsx`, que `[...slug]/page.tsx` pinta solo cuando
    `doc.slug` es el de la guía.
  - **Hecho:** test de componente en verde, con el control negativo: otro documento no lleva las
    acciones.
- [x] **T8 [P tras T6] — Enlaces en configuración (R1313, R1314).**
  - Añadir los dos enlaces a `actions` de `AppPage` en `configuracion/api/page.tsx` y en
    `configuracion/integraciones/page.tsx`, en la rama del `maestro`.
  - **Hecho:** test de componente en verde, y los enlaces no aparecen en la rama «sin permiso».
- [x] **T9 — Recuentos del catálogo (R1317).** El catálogo pasa de 37 a 38 documentos, +1 a `maestro` y
  `admin`.
  - Actualizar con su línea de motivo:
    - `tests/components/AyudaLayout.test.tsx`;
    - `tests/unit/ayuda/acotamiento-por-rol.test.ts`;
    - `tests/unit/asistente/acotamiento-por-rol.test.ts`;
    - `tests/unit/asistente/contexto-documental.test.ts`.
  - **Hecho:** los cuatro en verde y ningún otro recuento de rol cambia.
- [x] **T10 — Guardia de fuente única y cobertura (R1300–R1305, R1316).**
  - `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts`.
  - Control de no-vacuidad: hay al menos 10 operaciones y al menos un evento.
  - Mutación comprobada a mano y anotada en `progress/impl_SLT-80.md`:
    - un path ficticio añadido a una copia de `openApiSpec.paths` pone rojo R1303;
    - un `json` roto pone rojo R1302.
  - **Hecho:** guardia en verde sobre la guía real y en rojo en las dos mutaciones.
- [ ] **T11 — E2E y gate.**
  - `e2e/ayuda-guia-api.spec.ts`:
    - un maestro abre la guía desde `/configuracion/api`;
    - descarga el PDF y recibe 200 `application/pdf`;
    - un mensajero recibe 404 en las dos rutas.
  - Correr en local con base desechable los E2E de `/ayuda` (`grep -rl "/ayuda" e2e/`).
  - **Hecho:** `./init.sh` verde y los E2E en verde, anotados.

## Archivos esperados

Producción (17):

- `docs/ayuda/oficina/guia-integracion-api.md`
- `docs/api/guia-integracion/guia-integracion.html`
- `docs/api/guia-integracion/generar-pdf.py`
- `docs/api/guia-integracion/README.md`
- `lib/ayuda/guia-api.ts`
- `lib/ayuda/bloques.ts`
- `lib/ayuda/markdown.tsx`
- `lib/pdf/guia-api-pdf.ts`
- `lib/pdf/guia-fuente.ts`
- `assets/fuentes/Archivo-guia-regular-subset.ttf`
- `assets/fuentes/Archivo-guia-bold-subset.ttf`
- `app/(app)/ayuda/[...slug]/page.tsx`
- `app/(app)/ayuda/_components/AccionesGuiaApi.tsx`
- `app/(app)/ayuda/descargas/guia-integracion-api/route.ts`
- `app/(app)/ayuda/descargas/postman/route.ts`
- `app/(app)/configuracion/api/page.tsx`
- `app/(app)/configuracion/integraciones/page.tsx`

Tests (12):

- `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts`
- `tests/unit/pdf/guia-api-pdf.test.ts`
- `tests/unit/ayuda/guia-api-descargas.test.ts`
- `tests/components/AccionesGuiaApi.test.tsx`
- `tests/components/enlaces-guia-api-configuracion.test.tsx`
- `tests/components/AyudaLayout.test.tsx`
- `tests/unit/ayuda/acotamiento-por-rol.test.ts`
- `tests/unit/asistente/acotamiento-por-rol.test.ts`
- `tests/unit/asistente/contexto-documental.test.ts`
- `tests/unit/api/openapi-466-descripciones.test.ts`
- `tests/unit/guards/docs-marca-heredada.guardia.test.ts`
- `e2e/ayuda-guia-api.spec.ts`

## Trazabilidad prevista (R → test)

| R | Test |
|---|---|
| R1300, R1302, R1303, R1304, R1305, R1316 | `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts` |
| R1301 | `tests/unit/pdf/guia-api-pdf.test.ts` (títulos del PDF = títulos del cuerpo de `leerDocumentoAyuda`) + `tests/components/AccionesGuiaApi.test.tsx` (la página pinta ese cuerpo) |
| R1306 | `tests/components/AccionesGuiaApi.test.tsx` + `e2e/ayuda-guia-api.spec.ts` |
| R1307 | `tests/unit/ayuda/guia-api-descargas.test.ts` + `tests/unit/ayuda/acotamiento-por-rol.test.ts` + E2E |
| R1308 | `tests/components/AccionesGuiaApi.test.tsx` |
| R1309, R1310, R1311 | `tests/unit/pdf/guia-api-pdf.test.ts` (+ R1309 cabeceras en `guia-api-descargas.test.ts`) |
| R1312 | `tests/unit/ayuda/guia-api-descargas.test.ts` + guardia (sin otra copia) |
| R1313, R1314, R1315 | `tests/components/enlaces-guia-api-configuracion.test.tsx` |
| R1317 | `tests/unit/asistente/acotamiento-por-rol.test.ts` + `contexto-documental.test.ts` |

## Tamaño

- **Archivos:** 29 de 40, el 72,5%, por debajo del aviso del 80% (32). Quedan 3 de margen. Por eso
  se fija D4: Courier y no JetBrains Mono.
- **Líneas de producción (estimadas):** ~2.600, por encima del tope de 1.000.
  - Conversión mecánica, ~1.760: ~650 del `.md` nuevo, ~1.000 del HTML borrado y 111 de
    `generar-pdf.py` borrado.
  - Código, ~850: generador PDF ~300, rutas y constantes ~110, analizador común ~150 netas, acciones y
    enlaces ~90, README ~75, fuente ~60 (el base64 es una línea por peso).

  **El código cabe solo en el tope.** Lo que lo excede es el cambio de formato de un documento, y no
  se puede partir: retirar el HTML en otro PR deja dos fuentes vivas entre medias, justo lo que R1300
  prohíbe. Ver P2.
- **Líneas de tests (estimadas):** ~900, dentro del tope de 3.000.

## Preguntas abiertas

- **P1 — Asistente (Carlos).** Al vivir en `docs/ayuda/`, el asistente recibe la guía entera en el
  contexto de maestro y admin. El contexto crece en el tamaño de la guía, a medir en T1, y con él el
  coste por consulta. **Por defecto: sí** (R1317), porque así responde dudas de integración. Si
  prefieres que no la lea, hace falta un campo nuevo en el frontmatter que la excluya. Eso cambia el
  contrato de `docs/ayuda/README.md` y R1317 se invierte.
- **P2 — Tamaño del PR (Carlos).** ¿Aceptas `tamano-pr-aceptado` por la conversión mecánica? Serían
  ~1.760 líneas de documento, con el código (~850) por debajo del tope. La alternativa, partir,
  tampoco baja la primera rebanada del tope, porque la conversión sola ya lo supera.
- **P3 — Postman (Carlos).** Va con sesión, solo para maestro y admin (D3), y el integrador la recibe
  del maestro junto con el PDF. ¿O la quieres pública como `/api-docs`? Hacerla pública es un cambio
  de permisos y llevaría la ficha a la ruta completa.
- **P4 — SLT-45 (Carlos / Camilo).** ¿La API v2 de geografía va al canal por API key, es decir, a
  `openApiSpec.paths`? Si va y SLT-45 «Geografía jerárquica: API v1/v2 y carga masiva» se mergea
  después de esta ficha, la guardia de R1303/R1316 le exigirá documentar sus rutas en el `.md`. Hay
  que avisarlo en su spec.
