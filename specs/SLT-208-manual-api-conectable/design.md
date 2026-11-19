# Diseño — SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte»

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
