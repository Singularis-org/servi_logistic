# SLT-125 — geo-jerarquica-exportes · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SLT-47 · **Rama:** `feature/SLT-125-geo-jerarquica-exportes`
>
> **Alcance:** toda presentación de lugares se adapta a los niveles del país de la empresa; Costa Rica se ve y se descarga igual que hoy. Entran:
> - las 7 descargas: órdenes, satélite, novedades, ayuda, cierre de día, cierres admin y cobertura;
> - la etiqueta de guía y la página pública `/paquete`;
> - el PDF de tránsito;
> - las tarjetas POS y la de satélite, el detalle de asignación y el chat;
> - las variables de las plantillas de WhatsApp;
> - los nombres de lugar del listado `/ordenes` y del detalle de gestión, leídos del catálogo;
> - `ubicacion_snapshot` en los cierres: se escribe y se lee;
> - la consulta de geocodificación.
>
> **Lo que NO entra:**
> - Retirar las columnas y tablas viejas `provincia/canton/distrito` y achicar el catálogo de filtros (las listas planas que duplican `lugares`): SLT-48.
> - Filtros: ya están en SLT-47.
>
> Sembrado por `/afinar-feature` el 2026-11-12. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-12 | Tamaño (~95–115 archivos) | Un solo PR, aceptando el tamaño (precedente SLT-47 P6). |
| 2026-11-12 | Columnas de lugar en descargas con 3 columnas fijas (órdenes, satélite, cobertura) | Una columna por nivel del país, en el lugar de las 3 de hoy, con el nombre singular del tipo como encabezado. CR conserva nombres y orden (hay plantillas de Excel). Las descargas con una sola «Ubicación» la arman con toda la ruta. |
| 2026-11-12 | Tarjetas POS y satélite, chat y PDF de tránsito (hoy 2 niveles) | Los 2 niveles más hondos, como hoy. El título del PDF usa los nombres de tipo del país («COMUNA · BARRIO»); en CR sigue «CANTÓN · DISTRITO». |
| 2026-11-12 | Variables de WhatsApp | `{provincia}`, `{canton}` y `{distrito}` siguen funcionando como niveles 1–3, y ninguna plantilla guardada se rompe. Se suman `{nivel_1}…{nivel_N}` y `{ubicacion}` (toda la ruta), que el editor rotula con el nombre de tipo del país. |
| 2026-11-12 | `ubicacion_snapshot` | Los cierres nuevos lo escriben además de las 3 columnas de nombre. Los cierres admin y su descarga lo leen; si una fila vieja no lo tiene, leen las 3 columnas como hoy. Forma heredada de SLT-43 §2.6. El test de SLT-43 R40 («una fila nueva nace NULL») cambia con autorización (R38). |
| 2026-11-12 | Geocodificación | Dirección, luego todos los niveles del más hondo al más alto, luego el nombre del país de la empresa. CR produce exactamente la misma cadena que hoy, para no invalidar `GeocodeCache` (test). |
| 2026-11-12 | E2E | Uno nuevo con una empresa de un país de 4 niveles: descarga de órdenes con 4 columnas, etiqueta de guía con su ruta y cierre con sus 4 niveles. Los E2E de CR siguen en verde sin cambios. |
| 2026-11-12 | Heredadas | Los nombres internos `provincia/canton/distrito` se quedan en DB, código y API (SL-20). Encabezados de un país que no es CR con el singular del tipo, o `nivel_<n>` si chocan (SLT-45, SLT-46). Cada superficie conserva su separador y su orden de hoy. Las pantallas esperan una maqueta aprobada (SLT-46 P9). Migraciones solo aditivas hasta SLT-48. Ningún agente toca producción. Las aserciones existentes cambian solo con autorización humana (R38). |
