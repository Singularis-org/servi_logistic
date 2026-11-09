# SLT-89 «Geografía jerárquica: zonas de la empresa sobre el nodo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-89 | geo-jerarquica-zonas | fullstack | high | feature/SLT-89-geo-jerarquica-zonas | Camilo (6ace53aa94bfd46ee6a600a5) | pending (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 2026-11-09: tomada y worktree montado. Rama sobre SLT-46 «Geografía jerárquica: administración de
países» (PR #107), que trae 43, 44, 45, 65 y 71. Siguiente: acotar (`/afinar-feature`) y spec (F1.2).

## Evaluación
- zone fullstack: zona y zona especial asignables a cualquier nodo con herencia, `GeografiaSelector` a N
  niveles, aviso de impacto (órdenes pendientes que cambian de zona o tarifa), grupos de distritos de
  tarifas (SLT-52) sobre el nodo, trigger de `orden` a cualquier nodo, historial de la empresa.
- complexity high: toca zonas, tarifas y la cobertura de órdenes de todas las empresas; migraciones solo
  aditivas hasta SLT-48; equivalencia para CR (zonas, cobertura, cotizaciones y cierres).
- Cupo fullstack: 2 de 3 (SLT-46, SLT-89).
- Dependencias: SLT-46 sin mergear (PR #107); las geo en proceso están pausadas por decisión del humano.
- Cruce de archivos: pendiente hasta tener `tasks.md` (F2.0).

## Decisiones
- 2026-11-09 (humano): «arranca 89, ignora las que están en proceso de geografía, están pausadas de
  momento»: la rama nace sobre `feature/SLT-46-geo-jerarquica-admin`; las fichas geo en vuelo no se tocan.
- 2026-11-09 · Alcance y decisiones cerradas en `specs/SLT-89-geo-jerarquica-zonas/requirements.md` (`/afinar-feature`; descripción de la tarjeta actualizada, complexity:high).

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
