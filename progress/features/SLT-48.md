# SLT-48 «Geografía jerárquica: retirar modelo viejo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-48 | geo-jerarquica-contract | fullstack | high | feature/SLT-48-geo-jerarquica-contract | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

Rama `feature/SLT-48-geo-jerarquica-contract` desde `feature/SLT-125-geo-jerarquica-exportes` (PR #161). Épica geo apilada antes de mergear a dev.

## Estado
F2 (2026-11-17): spec aprobado por el humano («aprobado»). Sigue T0 maqueta.

## Evaluación
- zone fullstack (acotación 2026-11-17): migraciones, Prisma y lectores al nodo, más pantallas de mover nodos y de N niveles (SLT-125 P6).
- complexity high, ruta completa: migraciones con DROP de FK y triggers, tarifas y permisos de superadmin. ~35-50 archivos de producción y 60-90 de tests, tamaño aceptado.
- Cupo: excedido por las fichas geo en pausa; el humano lo aceptó (2026-11-17: «omite el cupo, las tareas estan en pausa como parte de una tarea mas grande»).
- `depends_on` (SLT-45, 46, 47, 65, 71, 89, 125) siguen in_progress: terminadas, esperan el merge de la pila geo.

## Decisiones
- 2026-11-17, humano: «arranca 48, omite el cupo».
- 2026-11-17: acotada con `/afinar-feature`. Alcance y decisiones en `specs/SLT-48-geo-jerarquica-contract/requirements.md`. El deploy 2 pasó a SLT-196 «Geografía jerárquica: borrar el modelo viejo». En Trello, zone pasó a fullstack y complexity a high.

## Preguntas abiertas
Ninguna (cerradas el 2026-11-17 en `requirements.md`).

## Tandas

## Modelos (overrides)

## Cierre
- 2026-11-17 spec escrito; P1–P5 y tamaño (~150 archivos) cerrados por el humano. spec_ready.
- 2026-11-17 spec aprobado («aprobado»). in_progress. Sigue T0.
- 2026-11-17 T0 maqueta aprobada por el humano («Aprobada», `a1452d24`, specs/SLT-48-geo-jerarquica-contract/maqueta-SLT-48.html). Puntos abiertos cerrados: (1) descendientes desglosados por nivel; (2) selectores sobrantes apagados; (3) hoja más alta que el último nivel se pinta con su tipo («Barrio: Las Acacias»), «Sin <nivel>» solo para órdenes a medias; (4) grupos en país de 2 niveles: sección vacía con explicación, sin botón de crear; (5) buscador de zonas: 3 primeros tipos y «…»; (6) la fila del camino en el modal Mover se llama «Ubicación». Textos provisionales: los de la maqueta.
