# SLT-47 — geo-jerarquica-presentacion · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** SLT-44, SLT-65, SLT-71 ·
> **Rama:** `feature/SLT-47-geo-jerarquica-presentacion` (nace sobre `feature/SLT-89-geo-jerarquica-zonas`)
>
> **Alcance:** el filtro de lugar pasa a `FiltroUbicacion`, de N niveles según el país de la
> empresa (2 a 10), en órdenes, novedades, recepción satélite, mis-asignaciones y analítica,
> incluidas sus consultas en el servidor. Las vistas guardadas (`VistaFiltro`) y los enlaces viejos
> (`?provincia_id=`, `?canton_id=`, `?distrito_id=` y los de novedades por nombre) siguen filtrando
> igual. En Costa Rica se ve igual que hoy.
>
> **Lo que NO entra:**
> - Descargas, etiqueta de guía, PDF de tránsito, tarjetas POS, chat, detalle de gestión, nombres
>   del listado de `/ordenes`, `ubicacion_snapshot` en los cierres y geocodificación → SLT-125
>   «Geografía jerárquica: presentación, exportes, cierres y geocodificación».
> - Retirar el modelo viejo (`NivelGeografico`, `PROFUNDIDAD_DEL_NIVEL`, columnas viejas) → SLT-48
>   «Geografía jerárquica: retirar modelo viejo».
>
> Sembrado por `/afinar-feature` el 2026-11-11. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | ¿Cómo se ve el filtro de lugar con 2, 3, 4 o más niveles? | Listas encadenadas: una por nivel del país, rotulada con el nombre de su tipo. Cada lista se llena con los hijos del lugar elegido en la anterior, y se puede parar en cualquier nivel. Con muchos niveles, las listas pasan a la línea siguiente. CR se ve igual que hoy. |
| 2026-11-11 | ¿Cómo viaja el filtro? | Por identificador del nodo, nunca por nombre. Un solo parámetro lleva el último lugar elegido; al recargar, las listas se rearman subiendo hasta el nivel 1. Dos lugares con el mismo nombre (un municipio y un departamento, o dos distritos «San Rafael») no se confunden. El servidor filtra ese nodo y sus descendientes con el catálogo en memoria, sin CTE (heredada de SLT-44 y SLT-65). |
| 2026-11-11 | ¿Partir la ficha? | En 2. SLT-47 se queda con los filtros, las vistas guardadas y los enlaces viejos. SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación» se lleva lo demás y depende de esta. |
| 2026-11-11 | Novedades hoy filtra por nombre, solo provincia y cantón | Se iguala al resto: por identificador y con todos los niveles del país. Los enlaces viejos por nombre se traducen buscando cada nombre dentro de su padre (el cantón «Escazú» solo entre los cantones de la provincia elegida). |
| 2026-11-11 | ¿E2E nuevo? | Sí. Filtra órdenes por un cantón de CR, abre un enlace viejo con `?canton_id=` y una vista guardada, y comprueba que salen las mismas órdenes. Los E2E existentes siguen en verde. |
| 2026-11-11 | País de 2 niveles | Se oculta el filtro del nivel que hoy repite al nivel 2 (encargo de SLT-46 «Geografía jerárquica: administración de países», P10). |
| 2026-11-11 | Vistas guardadas | Pasan a la versión 2 del formato; las de la versión 1 se traducen al leerlas, en `leerPayloadGuardado`. Una persona las prueba con vistas reales sobre la copia de producción; ningún agente toca producción. |
| 2026-11-11 | Heredadas | Las pantallas esperan una maqueta aprobada por el humano (SLT-46 P9, SLT-89 P2). Toda escritura nueva pasa por el modal antes → después (SLT-46, SLT-89). Migraciones solo aditivas y con `down.sql` hasta SLT-48. El `EXPLAIN` no puede empeorar más de un 20 % ni añadir un Seq Scan nuevo sobre `orden` (SLT-65). Ningún repositorio con catálogo se instancia a nivel de módulo (SLT-65). Cada pantalla conserva sus permisos de hoy. |
