# Diseño — SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte»

## Lo que ya existe

Buscado en el board (`feature_list.json`, título y descripción): `postman`, `swagger`, `openapi`,
`guía de integración`, `guia de integracion`, `manual`, `url de producción`, `api key`.
- **SLT-80** «Guía de integración por API en la ayuda» (done): dejó la guía como fuente única en
  `docs/ayuda/oficina/guia-integracion-api.md`, su PDF (`construirPdfGuiaApi`) y la guardia
  `guia-api-fuente-unica`. Se reusan tal cual: esta ficha solo edita el `.md`.
- **SLT-201** «Manual de la API al día: Swagger/Postman con la carga completa y guía PDF actualizada»
  (done) y **SLT-203** «API: publicar los intentos de entrega en la respuesta de la carga» (done): ya
  están en la base de la rama (dev ab489908). Esta ficha parte de su texto.
- **SLT-45** «Geografía jerárquica: API v1/v2 y carga masiva» (in_progress): toca también el canal y
  la guía cuando sus rutas entren en la spec. Sin choque de archivos hoy; si llega antes a dev, la
  guardia de SLT-80 le exigirá documentar sus rutas en esta misma guía.
- `url de producción`: nada en el board.

Buscado en el grafo (`R-job-singularis-projects-servi_logistic`; el worktree no está indexado):
`openapi servers url produccion postman guia integracion` y nombres `app_url|base_url|appUrl|
construirPdfGuiaApi|altaDeEmpresa`.
- `NEXT_PUBLIC_APP_URL` (SL-41, SL-14): la URL de la app por entorno. **No se reusa** para el contrato:
  la guía y el `.yaml` son documentos estáticos que tienen que decir producción en todos los entornos;
  por eso la constante `lib/api/url-produccion.ts` y el `servers` relativo (D1).
- `construirPdfGuiaApi` y `analizarBloques` (SLT-80): **se reusan** para el test del PDF (R10).
- `altaDeEmpresa`, `sembrarDatos`, `clienteDueno` y `LogDelServidor` de `e2e/_dos-empresas-fixture.ts`
  (SL-17): **se reusan** para las tres empresas del E2E.
- El doble de Storage del E2E (`e2e/_storage-falso/servidor.mjs`, SL-44) y el lanzador
  `e2e/_servidor-app.mjs`: **se reusan** vía `playwright.config.ts` para los PDF de etiquetas.
- Guardias previas: `guia-api-fuente-unica` (SLT-80), `docs-marca-heredada` (SL-16),
  `openapi-canal-rutas-reales`. **Se conservan**; la guardia nueva cubre lo que ninguna mira (URL,
  símbolos, país y moneda, rutas del repositorio). `docs-marca-heredada` se actualiza en tres frases.
- Tests de dobles del aislamiento por tienda (`ordenes-api-key-tienda-destino-aislamiento.route.test.ts`,
  feature 302): una sola empresa y dobles; el caso de dos empresas contra la app real no estaba.

## Principio

El código es la fuente. La API no cambia: cada discrepancia se corrige en la documentación (guía,
colección, contrato y su espejo). La tabla de las 20 discrepancias, con su archivo:línea, está en
`progress/impl_SLT-208.md`.

## Decisiones

### D1 · `servers` con dos entradas: `/` y producción
El contrato publica `servers: [{ url: "/" , description: "Este servidor" }, { url: "https://www.servilogistic.co", description: "Producción" }]`.
- «Try it out» de Swagger usa el primero: el host donde se abrió `/api-docs` (producción, Preview o local).
- Quien genera un cliente desde el contrato ve producción en la lista, y la guía (sección 4.8) le dice que elija esa.
- La URL de producción vive en una constante (`lib/api/url-produccion.ts`) que usan la spec y la guardia.

**Alternativas descartadas:**
- *Sin `servers`* (lo que había desde el 2026-09-01): el integrador que genera su cliente se queda sin base, y el propio changelog de entonces lo advertía.
- *Solo producción* (la primera vuelta de esta ficha): desde Preview o local, «Try it out» mandaba a producción, donde la clave de ese entorno da `401` y el navegador puede bloquearlo por CORS. Choca con `CHECKPOINTS.md > Configuracion` (review H9).

### D2 · Ejemplos ejecutables con E2E, no con una copia de los ejemplos
El E2E lee los `curl` del `.md` y las peticiones del `.json` y los ejecuta contra `next start` con el
doble de Storage del E2E. La forma de la respuesta se compara en los dos sentidos con el `json` que la
guía pone debajo.

**Alternativa descartada:** *newman*. Es una dependencia nueva (regla 7) y no ejecuta los `curl` de la
guía. Un `pm` mínimo con las aserciones que usa la colección basta, y lanza ante cualquier aserción que
no conoce.

### D3 · Postman válido para cualquier tienda
La colección no manda parámetros vacíos: el listado filtra solo por la remisión recién creada (siempre
existe) y deja `estado`, `desde`, `hasta` y `num_guia` desactivados. La cancelación lleva un script
previo que omite la petición si la carga no dejó guía (fulfillment, `pm.execution.skipRequest()`). Las
etiquetas aceptan `409` en ese caso, que es lo que documenta la guía.

**Alternativa descartada:** *tomar la guía del detalle de la orden antes de cancelar*. Con fulfillment
el detalle tampoco tiene guía hasta que se prepara la orden: el resultado es el mismo con una petición más.

### D4 · Guardia sobre lo que lee el integrador
La guardia mira el `.md`, el `.json`, el contrato **serializado** (lo que sirve `/api/docs/openapi`) y
el `.yaml`. En el `.yaml`, los símbolos y el país o la moneda se vigilan también en los comentarios
(review H8). Los comentarios del `.ts` no, porque no se sirven.

**Alternativa descartada:** *vigilar el fuente `.ts` entero*. Sus comentarios citan `design §…` de otras
fichas y no los lee ningún integrador; vetarlos obligaría a reescribir historia del código sin ganancia.

### D5 · Moneda y país sin literales
La guía y el contrato dicen «la moneda del país de la empresa» y «la zona horaria del país de la
empresa» (`docs/checkpoints-proyecto.md`). Las filas de historial anteriores al 2026-11-18 conservan lo
que se dijo entonces.
