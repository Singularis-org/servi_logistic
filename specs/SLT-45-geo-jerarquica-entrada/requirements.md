# SLT-45 — geo-jerarquica-entrada · requirements.md

> **Zona** backend · **Complejidad** high · **depends_on** SLT-44 · **Rama** `feature/SLT-45-geo-jerarquica-entrada`
> (montada sobre SLT-71, PR #81).
>
> **Alcance.** La entrada de órdenes pasa por el nodo geográfico sin romper a los integradores. La API v1
> (`/api/ordenes/api-key/*`) no cambia: un adaptador traduce provincia/cantón/distrito a nodo. Nace la API v2
> en las rutas que llevan ubicación (crear orden, carga por lote, cotización, consulta por guía) más
> `GET /api/v2/geografia?pais=`. `resolveGeo` y la carga masiva pasan a N niveles; la plantilla de CR no
> cambia. Crear y corregir órdenes escribe `nodo_geografico_id` y las 3 FK viejas.
>
> **Lo que NO entra.** Guardar órdenes de países que no tengan forma de 3 niveles → SLT-48 (hoy
> `provincia_id`/`canton_id` son NOT NULL y las migraciones son solo aditivas). Guía de integración
> HTML/PDF con v2 → SLT-80. Pantalla del superadmin y escrituras de administración en el nodo → SLT-46.
> Filtros, exportes y presentación → SLT-47. Retirar v1 → sin ficha; se decide más adelante (decisión 5 de la épica).
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Qué hace v2 con un país que no es de 3 niveles? | v2 acepta la ruta genérica (`ubicacion[]` o `ubicacion_codigo`), pero solo guarda órdenes cuyo nodo cae en profundidad 2 o 3 de un país de 3 niveles; cualquier otro caso responde un error claro de «país aún no habilitado». `GET /api/v2/geografia` funciona para cualquier país. Los tests de 2 y 4 niveles cubren el catálogo y la validación, no la creación. Guardar N niveles queda para SLT-48. |
| 2026-11-05 | ¿Qué rutas tiene v2? | Las que llevan ubicación: crear orden, carga por lote, cotización y consulta por guía (que devuelve la ruta con el tipo de cada nodo), más `GET /api/v2/geografia`. Analítica, cancelar y habilitar quedan solo en v1. |
| 2026-11-05 | ¿De dónde salen los payloads reales para el contrato de v1? | De la copia de producción que la épica ya exige para ensayar (nunca de producción). Los anonimiza un script de esta ficha y quedan como fixture. |
| 2026-11-05 | ¿Dónde va la documentación de v2? | OpenAPI (`lib/api/openapi-spec.ts` y su `.yaml` espejo), colección Postman y `docs/api/CHANGELOG.md` en SLT-45. La guía HTML/PDF para integradores, en SLT-80. |
| 2026-11-05 | ¿Hace falta E2E nuevo? | No. Contrato de v1 congelado, integración de v2 contra Postgres real y carga masiva de CR con su plantilla. Los E2E existentes deben seguir verdes. Motivo: no hay pantalla nueva. |
| 2026-11-05 | Autenticación y empresa | Heredado: la misma API key de v1; la empresa sale de la key (SL-18). La autorización se valida en el service. |
| 2026-11-05 | Migraciones | Heredado de la épica: solo aditivas, cada una con `down.sql`. |
