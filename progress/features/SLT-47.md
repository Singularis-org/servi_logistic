# SLT-47 «Geografía jerárquica: filtros de N niveles»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-47 | geo-jerarquica-presentacion | fullstack | medium | feature/SLT-47-geo-jerarquica-presentacion | Camilo (6ace53aa94bfd46ee6a600a5) | pending (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.1 2026-11-11: tomada y acotada con `/afinar-feature`. Rama sobre `feature/SLT-89-geo-jerarquica-zonas` (pila geo sin mergear). Siguiente: spec_author (F1.2).

## Evaluación
- zone fullstack (antes frontend): los filtros cambian también sus consultas en el servidor (satélite, novedades, órdenes, analítica).
- Partida en 2 por el humano: la presentación, los exportes, los cierres y la geocodificación van a SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación».

## Decisiones
- 2026-11-11 (humano): «continua, estan en pausa las demas, la idea es sacar todo lo de geografia antes de mergear con dev»: el exceso de cupo (backend 6/5, fullstack 4/3) lo causan las geo en pausa y se acepta; la pila geo se mergea entera al final.
- 2026-11-11 · Alcance y decisiones cerradas en `specs/SLT-47-geo-jerarquica-presentacion/requirements.md` (`/afinar-feature`; tarjeta renombrada a «filtros de N niveles», zone fullstack, SLT-125 creada y añadida a las dependencias de SLT-48).

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
<!-- tamano-pr-aceptado: 2026-11-11 · humano: «Un PR, aceptando el tamaño»; 81 archivos / ~4.100 líneas estimados en el spec -->
- 2026-11-11 tanda 1 servidor (T0–T2.4, T2.5 parcial) hecha hasta 214f8934; R36/R16 autorizados (ddd7acad). Falta T2.3 cierre, T2.5 R29, T3.1.
