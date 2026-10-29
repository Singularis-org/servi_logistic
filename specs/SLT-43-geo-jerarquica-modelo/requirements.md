# SLT-43 — geo-jerarquica-modelo · requirements.md

> Zona: backend · Complejidad: high · depends_on: SL-20 · Rama: feature/SLT-43-geo-jerarquica-modelo
> (PR hacia `epic/GEO-geografia-jerarquica`)
>
> **Alcance.** Fase *expand* de la épica GEO: crea `tipo_nivel_geografico` y `nodo_geografico`
> (con ruta, trigger de profundidad/país e índice GIN) y añade columnas nuevas, que admiten NULL, en
> `orden`, `zona_distrito`, `distrito_zona_especial` y `cierre_detail`. Triggers de sincronía
> mantienen el nodo al día desde `provincia`/`canton`/`distrito`, `orden` y las zonas. Copia en la
> migración los nodos (conservando ids) y los tipos de **todos** los países existentes desde
> `pais.nivel_N_*`; las órdenes, las zonas y el snapshot se llenan con un script aparte, por lotes y
> reanudable. La app funciona igual para Costa Rica.
>
> **Lo que NO entra.** Lecturas y repositorios sobre el modelo nuevo → SLT-44. API v1/v2 y CSV →
> SLT-45. Pantalla del superadmin, edición de tipos y escrituras en `nodo_geografico` → SLT-46.
> Filtros, exportes y presentación → SLT-47. Borrar, renombrar o reescribir lo viejo → SLT-48.
> Ejecutar el script de datos en producción: lo hace una persona, fuera de horario.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Forma de `cierre_detail.ubicacion_snapshot` (qué niveles, con tipo y nombre, y con qué claves). La
  decide `design.md`; las tres columnas de nombre actuales no se tocan.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-29 | ¿Dónde se integra? | En la rama épica `epic/GEO-geografia-jerarquica`, que nace de `dev`; un PR por tarjeta hacia ella y uno final de la épica a `dev`. El gate de CI debe correr también en PRs a `epic/**` (`/afinar-regla`). |
| 2026-10-29 | ¿Se permite `ALTER TYPE`? | Solo `ADD VALUE IF NOT EXISTS`. Quitar o renombrar valores sigue prohibido hasta SLT-48. |
| 2026-10-29 | ¿Qué pasa con el historial viejo por provincia/cantón/distrito? | Convive: lo viejo no se reescribe y `nodo_geografico` es un valor más del enum, para lo que se escriba desde SLT-46. |
| 2026-10-29 | ¿Qué países llenan `tipo_nivel_geografico`? | Todos los que existan al migrar, no solo Costa Rica. |
| 2026-10-29 | ¿Tope del trigger de `orden`? | ≤ 1 ms por fila, medido en una carga masiva de prueba. Si se pasa, el PR no entra. |
| 2026-10-29 | ¿E2E? | No hay E2E nuevo: integración contra Postgres real para cada trigger y el E2E existente de órdenes como red. Se hereda de SL-20. |
| 2026-10-29 | Verificaciones previas | Los previews de Vercel no apuntan a producción, y Supabase de producción tiene backup activo (Camilo). |
| 2026-10-29 | Precedentes | Se heredan SL-20 (tabla `pais`, `historial_plataforma`, identificadores en español), la ficha 374 (retiro por `activo`, unicidad por padre) y SL-17 (geografía de plataforma, solo lectura para la empresa). La épica reabre «siempre 3 niveles» y «nombres internos» de SL-20, por decisión del humano del 2026-10-27. |
