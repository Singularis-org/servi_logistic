# SLT-71 — geo-jerarquica-transito-analitica · requirements.md

> Zona: backend · Complejidad: high · depends_on: SLT-44 · Rama: feature/SLT-71-geo-jerarquica-transito-analitica
>
> **Alcance.** Pasar a `nodo_geografico` el SQL crudo que filtra o nombra por provincia, cantón o
> distrito en tránsito (`InformeTransitoRepository`: los nombres de cantón y distrito de cada fila
> se leen del catálogo), los 4 conteos de analítica (entregas, cargadas por día, devoluciones, por
> estado) y ciclo de vida (`CicloVidaRepository`). Un filtro por lugar pasa a `nodo_id = ANY($ids)`
> con los ids que calcula el dominio de SLT-44; la entrada sigue siendo `provincia_id`, `canton_id`
> y `distrito_id`. Costa Rica funciona igual y los conteos no se mueven.
>
> **Lo que NO entra.** Gestión de orden (`GestionOrdenRepository`: solo muestra nombres) → SLT-47.
> Filtros de pantalla y presentación → SLT-47. Órdenes, cierres, zonas y dinero → SLT-65. API
> v1/v2 → SLT-45. Retirar el modelo viejo → SLT-48.
>
> Sembrado por `/afinar-feature` el 2026-11-04. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-04 | ¿Qué lecturas bloquean por +20 %? | Tránsito y los 4 conteos de analítica. Ciclo de vida se mide y se informa, no bloquea. El Seq Scan nuevo sobre `orden` bloquea en todas (humano). |
| 2026-11-04 | ¿Costo fijo del catálogo (~4-5 ms por ordenar nombres)? | Se acepta, como en SLT-65 T8.3, si las consultas sobre `orden` no empeoran: se anota en el PR y no bloquea (humano). |
| 2026-11-04 | ¿Gestión de orden? | Fuera: solo muestra nombres; va a SLT-47 (humano). |
| 2026-11-04 | ¿Nombres de lugar en tránsito? | Se leen del catálogo nuevo en SLT-71. Excepción explícita al precedente de SLT-65, que dejaba los nombres del listado de `/ordenes` en las tablas viejas (humano). |
| 2026-10-31 | ¿Qué es regresión en el `EXPLAIN ANALYZE`? | +20 % (mediana de 5 corridas, suma de `Execution Time` con el catálogo incluido) o un Seq Scan nuevo sobre `orden`. Se corrige con un índice aditivo antes del merge. Heredado de SLT-65. |
| 2026-10-31 | ¿E2E nuevo? | No: bastan el script de equivalencia y los E2E existentes (no cambia ningún flujo visible). Heredado de SLT-65. |
| 2026-10-31 | ¿Guardia de caché del catálogo? | Se mantiene: ningún repositorio que use el catálogo se instancia a nivel de módulo. Heredado de SLT-65. |
| 2026-10-31 | ¿Órdenes con cadena incoherente? | El script las cuenta aparte y las nombra por id; si son la única diferencia, no bloquean el merge. Heredado de SLT-65. |
| 2026-10-30 | ¿Dónde se miden la equivalencia y los tiempos? | Script que corre una persona sobre la copia de producción, antes del merge. Ningún agente toca producción ni su copia. Heredado de SLT-44/SLT-65. |
| 2026-10-30 | ¿Lugar de una orden? | Se lee de las FK viejas (`COALESCE(distrito_id, canton_id)`); el deploy no depende del backfill de SLT-43. Heredado de la tarjeta y de SLT-43. |
| 2026-10-30 | ¿Árbol? | Sin `ruta` ni CTE recursiva. Heredado de SLT-43 y SLT-44. |
| — | ¿Migraciones? | Solo aditivas (regla de la épica, SLT-43). |
