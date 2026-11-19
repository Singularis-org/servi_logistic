# Review SLT-80 «Guía de integración por API en la ayuda» (PR #233)

- **Ruta:** ligera, con review completa por pedido del leader: pantalla nueva en Ayuda, PDF con marca,
  control de acceso y contrato externo.
- **Revisado:** `origin/dev...c747d5d2`, en el worktree `.worktrees/SLT-80-guia-api-en-ayuda`.
- **Fuentes:** `specs/SLT-80-guia-api-en-ayuda/requirements.md` (R1300–R1317), `progress/features/SLT-80.md`
  (P1–P4 y la línea `tamano-pr-aceptado`) y `progress/impl_SLT-80.md`.
- **Grafo:** no usado. El spec avisa de que el grafo no indexa este worktree, así que todo se leyó con Grep/Read.

## Checklist

- [x] **Ruta.** La ligera vale.
  - No cambia el modelo de permisos: las dos rutas nuevas reutilizan `puedeLeerDocumento` y `ROLES_AYUDA`, y `middleware.ts` no se toca.
  - El diff no toca dinero, autenticación, webhooks ni integraciones externas. La guía documenta el contrato, pero no lo cambia.
- [x] **Spec ligero.** Tiene alcance, EARS, `## Tasks` (T0–T11, todas `[x]`), `## Archivos esperados` y «Lo que ya existe».
  - El diff no re-crea nada de esa lista. Reutiliza `pdf-inspector`, `registrarFuente`/`exigirCobertura`, `LOGO_CORREO_PNG_BASE64` y el layout de Ayuda.
- [ ] **Trazabilidad R1300–R1317 → test.** Cada R tiene su test. Pero el de R1304 no detecta el desfase que debe vigilar (B2).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs` da 35/40 archivos, 3407/1000 líneas de producción y 1272/3000 de tests.
  - Está aceptado en `progress/features/SLT-80.md`. Ver m2: el código pasa de lo que se aceptó.
- [x] **Dependencias.** `package.json` y el lockfile no cambian. `jspdf` ya estaba aprobada.
- [x] **Typecheck.** `pnpm run typecheck` da TC_EXIT=0.
- [x] **Lint.** Corrido sobre los archivos del diff: LINT_EXIT=0.
- [x] **Vitest de la feature.** 12 archivos y 170/170 en verde (con `con-desechable`, base `servi_slt80_desechable`):
  - guardia `guia-api-fuente-unica`, `guia-api-pdf`, `guia-api-descargas`;
  - `AccionesGuiaApi`, `enlaces-guia-api-configuracion` y `AyudaLayout`;
  - los dos `acotamiento-por-rol` y `contexto-documental`;
  - `openapi-466-descripciones`, `docs-marca-heredada` y `markdown.test.tsx`, este sin tocar.
- [ ] **Suite de integración.** `tests/integration/asistente-route.test.ts`, en HEAD, sigue esperando 37 documentos para el maestro (B1).
- [x] **E2E en local.** 15/15 con base desechable `servi_slt80_e2e_desechable` (migrada al día) y `next build` de HEAD con `NEXT_PUBLIC_APP_URL=http://localhost:3080`.
  - Corrieron `ayuda-guia-api`, `integraciones-por-empresa` y `dos-empresas-humo`, que es el flujo crítico «aislamiento entre empresas» y visita `/configuracion/api`.
  - Comando: `playwright test e2e/ayuda-guia-api.spec.ts e2e/integraciones-por-empresa.spec.ts e2e/dos-empresas-humo.spec.ts --no-deps`. Resultado: `15 passed (2.1m)`, E2E_EXIT=0.
  - El implementer solo había corrido `ayuda-guia-api`.
- [x] **Llega a producción.** `.next/server/app/(app)/ayuda/descargas/postman/route.js.nft.json` incluye `postman_collection.json`. El del PDF incluye `guia-integracion-api.md`.
- [x] **Seguridad y configuración.**
  - No hay secretos.
  - La colección de Postman solo lleva valores de ejemplo.
  - Las cabeceras llevan `Cache-Control: private, no-store` y `nosniff`.
  - No hay recursos de Ordenex.
  - El código nuevo no tiene literales de país ni de moneda (el `.md` sí, ver m4).
- [x] **Autorización en el servidor.** Las dos rutas resuelven el actor de la sesión y aplican `puedeLeerDocumento` antes de leer o generar nada.

## Lo que se comprobó, punto por punto (pedido del leader)

### 1. Trazabilidad

| R | Test | Estado |
|---|---|---|
| R1300 | guardia «R1300 — una sola fuente editable» (roles, el HTML y el `.py` no existen, el README nombra el `.md`) | ok |
| R1301 | `guia-api-pdf.test.ts`: títulos del PDF = títulos de `leerDocumentoAyuda`, en orden. `AccionesGuiaApi.test.tsx`: la página pinta ese cuerpo | ok |
| R1302 | guardia R1302: ≥10 bloques `json` (control de no-vacuidad) + mutación con un `json` roto | ok |
| R1303 / R1316 | guardia R1303: en las dos direcciones, con control de no-vacuidad (≥10 operaciones) y dos mutaciones | ok (mutación repetida, ver §3) |
| R1304 | guardia R1304: `cuerpo.includes(\`evento\`)` | **no detecta el desfase real (B2)** |
| R1305 | guardia R1305: ejemplo por sección, no-2xx propios en su sección, §8.1 para los comunes. Dos mutaciones | ok |
| R1306 | `AccionesGuiaApi.test.tsx` + E2E caso 1 (h1 «Ayuda», índice «Oficina», h2 de la guía) | ok |
| R1307 | `guia-api-descargas.test.ts`: null, mensajero, adminTienda, adminSatelite → mismo digest y mensaje que un documento inexistente. E2E caso 3: el mensajero recibe 404 en las dos descargas y en la pantalla | ok (ver m1 sobre «sin sesión») |
| R1308 | `AccionesGuiaApi.test.tsx`, con control negativo sobre otro documento | ok |
| R1309 | `guia-api-descargas.test.ts` (200, `application/pdf`, nombre del adjunto contra el frontmatter) + `guia-api-pdf.test.ts` (títulos) | ok |
| R1310 | `guia-api-pdf.test.ts`: portada (logo, franja #FFD000, título, versión), pie n/N en 2..N, texto solo en #111111, Archivo embebida, Courier en código, logo nulo o roto | ok |
| R1311 | `guia-api-pdf.test.ts`: la guía vigente sin error, y un ideograma o un carácter fuera de Courier lanzan `ErrorCaracterNoImprimible` | ok |
| R1312 | `guia-api-descargas.test.ts` (bytes exactos, adjunto `.json`, `outputFileTracingIncludes`) + guardia (sin otra copia) | ok |
| R1313 / R1314 | `enlaces-guia-api-configuracion.test.tsx` (rama maestro con literales, y rama sin permiso para null, admin, adminTienda, adminSatelite y mensajero) + E2E caso 1 | ok |
| R1315 | `guia-api-descargas.test.ts` (constantes = literales del spec, y el `route.ts` existe). Grep: ningún literal `/ayuda/descargas` fuera de `lib/ayuda/guia-api.ts` | ok (m5) |
| R1317 | recuentos 37→38 en `asistente/acotamiento-por-rol` y `contexto-documental`. El mensajero no recibe nada de oficina | ok en unit. **En integración falta el recuento (B1)** |

### 2. Acceso

- **Con sesión y rol no permitido:** `notFound()` en los dos handlers. Lo prueban unit (cuatro roles más null) y E2E (el mensajero recibe 404 en el PDF, en Postman y en la pantalla).
- **Acceso directo por URL:** el E2E pide las URLs con `page.request.get(..., { maxRedirects: 0 })`, no sigue el enlace.
- **`superadmin` y `apiKey`:** quedan fuera por `ROLES_AYUDA`, en `puedeLeerDocumento`. No tienen caso propio en el test de handler (m10).
- **Sin cookie:** `middleware.ts` responde 307 a `/login?redirect=<ruta>`. `/ayuda/...` no está en `PUBLIC_ROUTES` ni es ruta `/api`. Es lo que pide el leader, pero no lo que dice R1307 (m1).
- **Con una cookie vencida o inválida:** el actor sale null y el handler responde 404 (test unit, caso null).
- **Enlaces de configuración:** las dos pantallas solo los pintan en la rama `maestro`, que es la única que entra en ellas. El admin no ve esas pantallas, pero sí lee la guía en Ayuda, como dice el spec.

### 3. Fuente única: mutaciones repetidas por el reviewer

- **M1, la guía.** Cambié `## 5.9 **PUT** …/cancelar` por `**POST**` en el `.md`.
  - Rojo: 5 de 18. R1303 se pone rojo en las dos direcciones (operación sin documentar y endpoint que la spec no tiene) y R1305 también.
  - Restaurado con `git checkout --`.
- **M2, la spec de eventos.** Añadí `"en_bodega_satelite"` a `EVENTOS_PUBLICOS`, en `lib/types/webhook-eventos.ts`.
  - Resultado: **18/18 en verde**. Restaurado.
  - La guía dice en §6.5 que `en_bodega_satelite` «**nunca** viaja en un evento», y la guardia no lo ve. Es el hallazgo B2.
- **Otras comprobaciones de la guardia:**
  - R1302 y R1305 tienen controles de no-vacuidad y mutaciones sobre datos inyectados que sí ponen rojo.
  - La de Postman compara sha256 e `info.name` contra todos los `.json` del repositorio.
  - No es tautológica salvo en R1304.

### 4. Contenido: HTML de `origin/dev` (tras SLT-201) frente al `.md`

- **Títulos:** 65 frente a 65, con el mismo texto y el mismo orden. Solo cambian dos cosas:
  - las insignias pasan a `**POST** \`/api/...\``;
  - «RUPTURA A.» pasa a «**RUPTURA** Bloque A:».
- **Endpoints:** las 10 operaciones de §5.1–§5.10 están, con su método y su ruta.
- **Tablas:** 180 filas `<tr>` frente a 180 filas de tabla Markdown.
- **Bloques de código:** 24 `<pre>` frente a 26 bloques. Los dos de más son el ejemplo nuevo de §5.6, que R1305 obliga.
- **Diferencia palabra a palabra** sobre 10.283 frente a 10.333 palabras. Solo faltan:
  - los 43 glifos;
  - dos apariciones del título, que vivían en `<title>` y en la portada (ahora la dibuja el PDF);
  - «sin gestionar» → «con el paquete aún pendiente»;
  - «Asignada en el acto» → «Se asigna en el acto».
- **Los 43 glifos:**
  - ⚠ ×15 → «Atención:»;
  - ∈ ×3 → «es uno de»;
  - ☐ ×24 → `[ ]` en la tabla del checklist;
  - ✔ → columna «Hecho».

  Ninguno cambia el sentido.
- **Añadidos de contenido:**
  - el `404` en §5.5;
  - el ejemplo curl con su respuesta en §5.6.

  Salen de `openApiSpec` (los pide R1305), pero no son «solo formato» (m8).

### 5. PDF con marca

Generé el PDF con `tsx` desde el generador real y el `.md` real. Se guardó en
`C:/Users/ArqDev/AppData/Local/Temp/claude/aab05f6b97f87a08/2d003bec-e207-4dc1-be9b-6d1a94636296/scratchpad/guia.pdf`.

- **Estructura:** 131.501 bytes y 27 páginas.
- **Imagen:** una sola, la del logo en la portada.
- **Pie:** «Guía de integración — API de Servi Logistic · n / 27» en 26 de 26 páginas, todas menos la portada.
- **Fuentes:** `/BaseFont /ArchivoGuia` con **2 `/FontFile2`** embebidos (Regular y Bold). El código va en Courier estándar.
- **Texto (`pdftotext`):** salen el título y la versión de la portada, las 10 operaciones, los 15 «Atención» y las 24 casillas `[ ]`.
- **Paleta, en `lib/pdf/guia-api-pdf.ts`:**
  - `#111111` para el texto, `#FFD000` solo en rellenos y `#F7F7F5` de fondo;
  - el filete `#DDDDDA` es un gris neutro que no está en `docs/marca.md` (m9);
  - no hay nada de la paleta violeta de `lib/facturas-plataforma/pdf.ts`.
- **El test:** comprueba que todo el texto va en #111111 y que ninguno va en #FFD000.
- **No verificado:** no pude rasterizar el PDF porque no hay poppler, así que el aspecto visual queda para Carlos en Preview, como dice el spec.

### 6. Enlaces

- `/configuracion/api` e Integraciones llevan «Guía de integración» (`Link` a `RUTA_GUIA_API`) y «Descargar guía en PDF» (`<a>` a `RUTA_DESCARGA_GUIA_API_PDF`) en `AppPage.actions`, solo en la rama maestro.
- El E2E sigue el enlace desde `/configuracion/api` hasta la guía.

### 7. Dependencias

Ninguna nueva.

### 8. Nada visible fuera de Ayuda y de los dos enlaces

- **Ayuda:** sale el documento nuevo en el índice de oficina (maestro y admin) y la fila de tres acciones solo en ese slug. Hay control negativo sobre `wallet-caja`.
- **`markdown.tsx`:** se refactorizó a `bloques.ts` sin cambiar ninguna `className`. `markdown.test.tsx` sigue verde sin tocarlo.
- **Tamaños en escritorio:** los botones nuevos usan `h-11 md:h-8`. El tamaño por defecto de `Button` es `h-8`, así que en escritorio quedan como los de prod. En móvil suben a 44 px. `PageHeader` envuelve las acciones con `flex-wrap`.

## Hallazgos

### BLOQUEANTE

- **B1. Recuento sin actualizar en `tests/integration/asistente-route.test.ts`: rojo nuevo en `gate-completo`.**
  - **El rojo:** en HEAD (c747d5d2), «⭑ y un maestro, con EL MISMO cuerpo, recibe los 37» hace `expect(...documentos).toHaveLength(37)`. Con la guía son 38. El archivo no está en `tests/baseline-rojos.json`.
  - **El arreglo ya existe, pero sin commitear:** en el árbol del worktree hay una modificación **sin commitear**, de otro proceso (mtime 21:10, no la hice yo), que lo sube a 38 y añade que el mensajero no recibe la guía. Esa versión pasa 29/29 contra la base desechable, lo que confirma que la de HEAD está en rojo.
  - **Falta:** commitear ese cambio con su línea de motivo, como los otros cuatro recuentos de T9.
  - **Por qué no salió en local:** `./init.sh` rápido no lo seleccionó. Conviene un disparador que lance `tests/integration/asistente-route.test.ts` cuando cambie `docs/ayuda/**` (`docs/gate.md > Disparadores`).
- **B2. La guardia de R1304 no detecta el desfase que debe vigilar.**
  - **El fallo:** comprueba `cuerpo.includes(\`${evento}\`)` sobre toda la guía. Los 20 `OrderStatusValue` ya salen entre backticks en la tabla de estados (§4.7) y en §6.5. Así que promover un estado existente a evento público nunca la pone roja.
  - **Mutación M2:** `en_bodega_satelite` en `EVENTOS_PUBLICOS` deja 18/18 en verde, aunque §6.5 dice que ese estado «**nunca** viaja en un evento».
  - **Falta:**
    - acotar la comprobación a las filas de la tabla de §6.5 «Estados que este webhook puede emitir»;
    - exigir igualdad en las dos direcciones: el conjunto de §6.5 = `EVENTOS_PUBLICOS`;
    - añadir un caso MUTACION que demuestre el rojo con un estado existente promovido.

### menor

- **m1. R1307 dice «sin sesión → 404», pero sin cookie la respuesta es 307 a `/login?redirect=…`, por `middleware.ts`.**
  - Es lo que pide el leader. El handler sí da 404 con actor null (cookie vencida o inválida).
  - **Falta:** corregir el texto de R1307 para que diga lo que pasa. Opcional: un caso E2E sin cookie que espere 307 a `/login` con `maxRedirects: 0`.
- **m2. Tamaño.** El aceptado era «~1.760 de conversión + ~850 de código», con el argumento de que «el código cabe solo en el tope».
  - Medido: el código fuera de la conversión suma **1.126 añadidas y 176 borradas (1.302)**. Pasa del tope de 1.000.
  - Los archivos son 35/40, frente a los 29 previstos.
  - **Falta:** el leader debe contárselo a Carlos con los números reales.
- **m3. `docs/api/guia-integracion/README.md:60`** pide «un aviso `⚠` por cada comportamiento». Archivo no tiene ⚠: quien siga el README rompe el PDF (R1311 lanza).
  - **Falta:** cambiarlo por «Atención:» y anotar que solo valen los caracteres que cubre `COBERTURA_GUIA`.
- **m4. La guía dice «Logística de última milla — Costa Rica» y «hoy Costa Rica, UTC-6»** (líneas 27, 31, 271 y 915).
  - Ya estaba en el HTML (6 apariciones), y cambiar el contenido es de SLT-201. Pero ahora lo ven todas las empresas dentro de la app.
  - Queda como deuda de contenido.
- **m5. `RUTA_SWAGGER = "/api-docs"` vive en `AccionesGuiaApi.tsx`, no en `lib/ayuda/guia-api.ts`.**
  - R1315 pide que las URLs de R1308 salgan de una sola constante. Swagger no es una descarga, pero está en la lista de R1308.
- **m6. `EnlacesGuiaApi` está copiado tal cual en `configuracion/api/page.tsx` y en `configuracion/integraciones/page.tsx`.**
  - Debería ser un solo componente compartido, por ejemplo junto a `AccionesGuiaApi`.
- **m7. La rama va 5 commits por detrás de `origin/dev`** (los de SLT-204 «gate»). `git merge-tree` no da conflictos. Hay que traerlos antes del merge.
- **m8. Contenido añadido en la conversión:** §5.5 `404`, §5.6 ejemplo curl con su respuesta, y las dos reformulaciones de m4 de la sección 4.
  - Están justificados por R1305 y por las guardias de nombres.
  - **Falta:** decirlo en el PR para que Carlos no lo lea como «solo formato».
- **m9. El filete de tabla `#DDDDDA` no está en la paleta de `docs/marca.md`.** Es un gris neutro: aceptable, pero sin documentar.
- **m10. Al test de handler de R1307 le faltan `superadmin` y `apiKey`.** Los cubre `ROLES_AYUDA` en el predicado, pero un caso explícito no cuesta nada.

## Veredicto

**RECHAZADO.** Hay dos bloqueantes:

- **B1:** el recuento 37 de `tests/integration/asistente-route.test.ts` deja rojo `gate-completo`. El arreglo existe en el árbol, sin commitear.
- **B2:** la guardia de R1304 se queda en verde cuando un estado existente pasa a ser evento público. Hay que acotarla a §6.5 y exigir igualdad, con su mutación.

Lo demás está en verde:

- acceso por rol y por URL directa;
- fuente única en R1300–R1303 y R1305;
- conversión fiel;
- PDF con la marca de Servi Logistic y Archivo embebida;
- enlaces;
- dependencias y tamaños en escritorio;
- E2E afectados 15/15.

Para la vuelta 2 basta revisar el diff de B1 y B2.

## Vuelta 2 (acotada a 895cfcc9..06273eba, sin el merge de dev)

Commits revisados: fd0dc20e (B1), 0aae040c (B2), ba6ed9c5 (m1, m3, disparador), 1de8d280 (m6), 06273eba (bitácora).

### Checklist

- [x] **B1.** `tests/integration/asistente-route.test.ts`: el maestro espera 38, con el literal y el comentario «SLT-80 (P1 de Carlos): 37→38», y además que la lista contenga `oficina/guia-integracion-api`. El mensajero sigue en 8 (líneas 95 y 127, sin tocar) y ahora fija que no recibe ni el slug ni el título de la guía.
  - Contra la base desechable: 29/29 en verde.
  - Mutación del reviewer: `roles: [maestro, admin, mensajero]` en el frontmatter de la guía → 3 rojos (los tres casos del mensajero). Restaurado.
- [x] **B2.** La guardia de R1304 lee solo las filas de la tabla de §6.5 y compara con `EVENTOS_PUBLICOS` en los dos sentidos (`faltanEnTabla` y `sobranEnTabla`). La no-vacuidad exige `eventos.length === filas`.
  - Mutación repetida: `"en_bodega_satelite"` en `EVENTOS_PUBLICOS` (`lib/types/webhook-eventos.ts`) → **rojo**, con `faltanEnTabla: ["en_bodega_satelite"]`. En la vuelta 1 daba 18/18 en verde.
  - Mutación del otro sentido: borrar la fila `incidente` de la tabla de §6.5 → 2 rojos. El sentido «sobra en la tabla» lo cubre el caso MUTACION sintético.
  - Las dos restauradas con `git checkout --`; árbol limpio.
- [x] **m1.** R1307 dice ahora que, sin sesión, `middleware.ts` responde antes con 307 a `/login`, y que el 404 aplica a quien tiene sesión con otro rol. Coincide con lo que hace el código.
- [x] **m3.** El README pide «Atención:» y prohíbe `⚠ ✔ ☐ ∈` porque romperían la descarga (`ErrorCaracterNoImprimible`, R1311).
- [x] **m6.** Hay un solo `EnlacesGuiaApi` en `app/(app)/ayuda/_components/`, usado por las dos páginas de configuración. Las clases (`h-11 md:h-8`, outline) y las rutas, que salen de `lib/ayuda/guia-api.ts`, no cambian. `enlaces-guia-api-configuracion` y `AccionesGuiaApi` pasan 9/9.
- [x] **m7.** La rama va 0 commits por detrás de `origin/dev`.
- [x] **Disparador.** `arnes.config.json > gate.disparadores` incluye `docs/ayuda/**` y `lib/ayuda/**`, que lanzan asistente-route, asistente-imagenes, `tests/unit/asistente/`, `tests/unit/ayuda/`, asistente-sin-frontmatter y AyudaLayout. Las seis rutas existen.
  - `node scripts/test-rapido.mjs --comprobar tests/integration/asistente-route.test.ts` muestra `docs/ayuda/oficina/guia-integracion-api.md -> tests/integration/asistente-route, …` y termina en `entra`.
- [x] `tsc --noEmit` limpio, y eslint limpio sobre los archivos tocados.

### Tamaño real (3.406 líneas «de producción», 38/40 archivos)

| Bloque | Líneas | Archivos |
| --- | --- | --- |
| Guía `.md` nueva (conversión mecánica) | 958 | `docs/ayuda/oficina/guia-integracion-api.md` |
| Borrado del HTML y del generador viejo | 1.147 | `guia-integracion.html` (−1.036) y `generar-pdf.py` (−111) |
| Código | 1.240 (1.082 añadidas, 158 borradas) | `guia-api-pdf.ts` 541, `markdown.tsx`→`bloques.ts` 400 (de ellas ~347 son movimiento: +53/−156 y +191), `guia-fuente.ts` 84, las dos rutas 79, los dos componentes 86, `guia-api.ts` 22 y el resto 28 |
| README y `arnes.config.json` | 61 | docs y disparador |

El aceptado decía «~1.760 de conversión + ~850 de código». La conversión real es 958 + 1.147 de borrado, y el código, 1.240 líneas brutas (unas 1.080 netas nuevas). El leader debe pasarle estos números a Carlos (m2).

### Hallazgos de la vuelta 2

Ninguno nuevo. Siguen abiertos, sin bloquear, los menores que no se pidió arreglar: m2 (el leader lo comunica con la tabla de arriba), m4, m5, m8, m9 y m10.

### Veredicto vuelta 2

**OK.** B1 y B2 están resueltos y verificados con mutación. m1, m3, m6 y m7 están cerrados, y el disparador nuevo funciona.
