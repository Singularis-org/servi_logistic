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
- 2026-11-17 T1 y T2 cerradas (hasta `d3a768cb`, camino A de Prisma). Decisiones del humano: (a) autoriza cambiar las ~70 aserciones que contradicen decisiones cerradas de SLT-48; cada cambio cita su R y el reviewer comprueba que no afloje otra regla; (b) R2: se acepta el 42501 «permiso denegado» para `servi_app`, sin permisos de escritura sobre las vistas; SL048 queda para el dueño y los scripts; (c) la API v1 queda igual: sigue exigiendo distrito, y un cantón sin distritos entra por v2 o por pantalla; (d) R28: la v1 responde exactamente lo mismo que hoy, sin campos nuevos; (e) el Postgres de Supabase de producción es 15 o más (dicho por el humano).
- 2026-11-18 Decisiones del humano tras T6: (a) T5.1, se retiran los 17 tests sin objeto (sincronía, copia vieja, DEFAULT 'CR', borrado y FK de las tablas viejas), con `@test-desaparecido` donde un spec los cite; el reviewer comprueba que cada regla viva tenga otro test; (b) se aceptan las 5 aserciones cambiadas fuera de la lista (Mover en el árbol, aviso del alta de país, E2E de 4 niveles, 2 de v2, export de mover); (c) se aceptan los 6 textos de CR cambiados en T4, como excepción a «CR igual que hoy»; (d) «Un <tipo>» en gruposUnicidad usa el género del tipo, como en SLT-47; (e) `nodo_geografico_movido` sigue el criterio actual del historial de plataforma, sin catálogo nuevo; se corrige design §7.1; (f) «Ubicación incompleta» se muestra antes de guardar, como en la maqueta, con Guardar apagado hasta llegar a la hoja.
- 2026-11-18 humano: en corregir ubicación queda un solo mensaje cuando la ubicación no llega a la hoja: el aviso nuevo «Ubicación incompleta: …» reemplaza a «Falta completar: <nivel>.», también en CR.
- 2026-11-18 init.sh rojo solo por cupo fullstack (8 in_progress, max 3): fichas geo en pausa más SLT-136 y SLT-144, aceptado por el humano («omite el cupo»). Typecheck, lint, guardias (solo dependencias-declaradas-presentes, baseline) y 158 archivos de test en verde.

<!-- tamano-pr-aceptado: 2026-11-18 · 233 archivos (57 prod / 176 tests) · aceptado por el humano -->
- 2026-11-18 review vuelta 1 RECHAZADO solo por tamaño. Humano: acepta 233 archivos; R25 se queda con los niveles del país y columna vacía (se corrige el texto de R25); con el formulario vacío sigue «Falta completar: <nivel>.»; la carrera de P1 se cierra ahora con un bloqueo corto sobre el nodo y su test.
