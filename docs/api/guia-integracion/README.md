# Guía de integración — API de Servi Logistic (dónde se edita)

El manual de integración del canal por API key tiene **una sola fuente**:
`docs/ayuda/oficina/guia-integracion-api.md`. De ese archivo salen las tres cosas que existen de
la guía (SLT-80):

| Qué | Cómo sale del `.md` |
|---|---|
| La pantalla en Ayuda | `/ayuda/oficina/guia-integracion-api`, solo para maestro y admin (`roles` del frontmatter). |
| El PDF que se entrega al integrador | Se descarga desde la app en `/ayuda/descargas/guia-integracion-api`. Se genera en el momento con jsPDF, con la marca Servi Logistic, y se llama `Guia-Integracion-API-Servi-Logistic-<actualizado>.pdf`. No se commitea ningún PDF. |
| Lo que lee el asistente | El asistente recibe la guía en el contexto de maestro y admin, como el resto de Ayuda. |

Hasta noviembre de 2026 la guía era un HTML de esta carpeta que se imprimía a mano con Chrome
(`generar-pdf.py`). Los dos se retiraron: con dos fuentes vivas, lo que se veía en la app y lo que
recibía el integrador acababan siendo distintos.

## Cómo se edita

- Se edita el `.md` y nada más. Sigue el contrato de `docs/ayuda/README.md` (frontmatter,
  subconjunto de Markdown que pinta `lib/ayuda/markdown.tsx`: sin enlaces, imágenes, HTML crudo ni
  listas anidadas). Los marcadores angulares (`<ordenId>`) van siempre dentro de código.
- Cada operación lleva su método y su ruta en el título: `**POST** \`/api/...\``.
- La guardia `tests/unit/guards/guia-api-fuente-unica.guardia.test.ts` comprueba que la guía nombra
  cada operación de `openApiSpec.paths` y cada evento de `EVENTOS_PUBLICOS`, que no nombra rutas que
  la spec no tiene, y que todo bloque `json` es JSON válido.

## Qué actualizar en cada versión

1. **El frontmatter**: `actualizado` (la fecha da nombre al PDF) y la línea «Versión del documento»
   del comienzo de la guía.
2. **La sección «Cambios respecto de la versión de <anterior>»**: qué se rompe, desde cuándo, qué
   tiene que cambiar el integrador y la tabla de lo ya vigente. La fuente es
   `docs/api/CHANGELOG.md`: cada entrada del changelog posterior a la versión anterior tiene que
   estar reflejada.
3. **Las secciones afectadas**, contrastadas con el código y no con el spec:
   - rutas y validación: `app/api/ordenes/api-key/**`;
   - forma de las respuestas: `lib/api/openapi-spec.ts` (el `.yaml` es un espejo generado) y los
     DTO de `lib/types/api-orden.ts`, `lib/types/cotizacion.ts`, `lib/api/analitica-api-key-dto.ts`;
   - catálogo de estados y nombres visibles: `lib/types/order-status.ts` (`ORDER_STATUS_SEED`,
     `NOMBRE_ESTADO`, `DESCRIPCION_ESTADO`, `CODIGO_VIGENTE_DE_ANTERIOR`);
   - webhooks: `lib/types/webhook-eventos.ts` (`EVENTOS_PUBLICOS`), `lib/types/orden-evento.ts`,
     `lib/services/WebhookEstadoService.ts`, `lib/services/WebhookEventoOrdenService.ts`,
     `lib/crypto/webhook-firma.ts`, `lib/config/webhook.ts` y `lib/services/JobQueueService.ts`
     (reintentos);
   - eliminación, cancelación y habilitación: `lib/types/order-status-eliminables.ts`,
     `lib/repositories/OrdenRepository.ts` (`ESTADOS_CANCELABLES_API`),
     `lib/services/ApiHabilitacionService.ts`.
4. **El índice** («Contenido») si cambian las secciones.
5. **`fuentes`** del frontmatter si la guía pasa a apoyarse en un archivo nuevo.

## Reglas del documento

- Los **códigos anteriores** al cambio de nombres de estados (los siete de la tabla A.1 y los
  cuatro resultados de A.2) solo pueden aparecer en la sección de cambios. En el resto de la
  guía se usan los vigentes.
- Todos los bloques `json` tienen que ser JSON válido; la guardia de arriba se pone roja si no.
  Los `curl` van en bloques `bash` y los fragmentos con marcadores angulares (`<ordenId>`,
  `<host-de-storage>`) se admiten dentro de las cadenas.
- Los importes, guías, UUID y claves son ilustrativos; nunca datos reales.
- Tono: «usted», frases cortas, un aviso «Atención:» por cada comportamiento que suele sorprender.
  Nada de símbolos fuera de la fuente del PDF (`⚠`, `✔`, `☐`, `∈`): la descarga falla con
  `ErrorCaracterNoImprimible` (R1311).
