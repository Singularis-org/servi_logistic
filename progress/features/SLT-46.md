# SLT-46 «Geografía jerárquica: administración de países»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-46 | geo-jerarquica-admin | fullstack | high | feature/SLT-46-geo-jerarquica-admin | Camilo (6ace53aa94bfd46ee6a600a5) | pending (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 2026-11-06: tomada y worktree montado. Rama sobre SLT-45 (PR #89), que trae 43, 44, 65 y 71.
Siguiente: acotar (`/afinar-feature`) y spec (F1.2).

## Evaluación
- zone fullstack: pantalla de geografía del superadmin a N niveles, alta de país con catálogo de tipos,
  edición de nombres de tipo, CSV de carga por tipo y profundidad, `GeografiaSelector`, asignación de zonas y
  zona especial a cualquier nodo, triggers de sincronía invertidos (el nodo copia a las 3 tablas viejas).
- complexity high: cambia la fuente de las escrituras de la geografía; migraciones solo aditivas hasta SLT-48;
  herencia de zona al asignar nodos intermedios.
- Cupo fullstack: 2 de 3 con esta (SLT-86, SLT-46). Zonas de la empresa separadas a SLT-89 (2026-11-06).
- Dependencias: SLT-44, SLT-65, SLT-71 sin mergear (PRs #55, #75, #81); rama apilada sobre SLT-45 (#89).
- Cruce de archivos: pendiente hasta tener `tasks.md` (`archivos-en-vuelo.mjs --candidata SLT-46`, F2.0).

## Decisiones
- 2026-11-06 (humano): «comienza 46 partiendo de 45»: la rama nace sobre `feature/SLT-45-geo-jerarquica-entrada`.
- Heredada de SLT-45 (2026-11-05): el CSV de división `leerDivisionDePais` pasa a esta ficha.
- 2026-11-06 · Alcance y decisiones cerradas en `specs/SLT-46-geo-jerarquica-admin/requirements.md`
  (`/afinar-feature`; SLT-46 editada, SLT-89 creada para las zonas, SLT-48 suma mover nodos y depende de SLT-89).

## Preguntas abiertas

## Tandas

## Modelos (overrides)

## Cierre
