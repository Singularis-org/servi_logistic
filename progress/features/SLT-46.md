# SLT-46 «Geografía jerárquica: administración de países»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-46 | geo-jerarquica-admin | fullstack | high | feature/SLT-46-geo-jerarquica-admin | Camilo (6ace53aa94bfd46ee6a600a5) | in_progress (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 2026-11-06: spec aprobado (F1.4, «si», por escrito) y tarjeta en in_progress. Implementer lanzado
con el backend (T0.1, T1–T5; la UI espera la maqueta T0.2). Spec R1–R52, T0–T9. Rama sobre SLT-45 (PR #89).

## Evaluación
- zone fullstack: pantalla de geografía del superadmin a N niveles, alta de país con catálogo de tipos,
  edición de nombres de tipo, CSV de carga por tipo y profundidad, `GeografiaSelector`, asignación de zonas y
  zona especial a cualquier nodo, triggers de sincronía invertidos (el nodo copia a las 3 tablas viejas).
- complexity high: cambia la fuente de las escrituras de la geografía; migraciones solo aditivas hasta SLT-48;
  herencia de zona al asignar nodos intermedios.
- Cupo fullstack: 2 de 3 con esta (SLT-86, SLT-46). Zonas de la empresa separadas a SLT-89 (2026-11-06).
- Dependencias: SLT-44, SLT-65, SLT-71 sin mergear (PRs #55, #75, #81); rama apilada sobre SLT-45 (#89).
- Cruce de archivos (F2.0, 2026-11-06): choques propios con SLT-43/44/45/65/71 (vienen en la rama apilada).
  Con otra persona: SLT-77 (Carlos Restrepo), solo `db/schema.prisma`, zonas distintas; **choque aceptado por
  el humano** y avisado en la tarjeta de SLT-77. SLT-88 (Carlos) solo aviso, sin rama publicada.

## Decisiones
- 2026-11-06 (humano): «comienza 46 partiendo de 45»: la rama nace sobre `feature/SLT-45-geo-jerarquica-entrada`.
- Heredada de SLT-45 (2026-11-05): el CSV de división `leerDivisionDePais` pasa a esta ficha.
- 2026-11-06 · Alcance y decisiones cerradas en `specs/SLT-46-geo-jerarquica-admin/requirements.md`
  (`/afinar-feature`; SLT-46 editada, SLT-89 creada para las zonas, SLT-48 suma mover nodos y depende de SLT-89).

## Preguntas abiertas

## Tandas
- 2026-11-06 · T1.1–T1.4, T2.1–T2.5 · `60e6869e`…`48ebaa2a` · tsc 0; eslint 0; guardias 336, único rojo el del
  baseline; T2: copia al nodo 9/9, migraciones aditivas 26, ida y vuelta 5/5, `prisma migrate diff` vacío.
  T0.1 sin cerrar: `./init.sh` local con la pila entera (1364 archivos, ~3,5 h, timeouts por carga); 11/12
  re-corridos en verde, `demo-qa` rojo por base sin siembra. Veredicto en CI. Base `logistic_slt46`.

## Modelos (overrides)

## Cierre
