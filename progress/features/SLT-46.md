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
- 2026-11-09 (humano): la pantalla vieja no lleva puente; SLT-46 no abre PR hasta tener la maqueta aprobada y T6 hecha. Maqueta en el lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH (T0.2), pendiente de aprobación.
- 2026-11-09 (humano): los niveles se reordenan arrastrando (drag and drop, con ▲▼ como alternativa de teclado), en el alta y en un país ya creado. En un país ya creado solo reasigna los nombres de cada profundidad (los lugares no se mueven: el tipo sale de la profundidad, P1). Falta pasarlo al spec (R nuevo) tras aprobar la maqueta.
- 2026-11-09 (humano): toda acción que guarda, edita o retira pide confirmación en un modal («¿Seguro?», antes → después) y valida antes de escribir. Falta pasarlo al spec tras aprobar la maqueta.
- 2026-11-09 (humano, «aprobado»): maqueta T0.2 aprobada (lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, versión 7): reordenar solo arrastrando por ⠿ (sin flechas visibles; teclado con la manija enfocada), título «Niveles N (máximo 10)», modal de confirmación antes → después en guardar, editar, crear, agregar nivel y retirar, validando antes de escribir.

## Preguntas abiertas
- 2026-11-09 (implementer, tanda 2): ¿retirar `PaisRepository.crear` (seis nombres) y adaptar `pais-repositorio.test.ts` (1 rojo; su historial pasa a P+1 filas por R37)? Decide el humano.
- 2026-11-09 (implementer, tanda 2): con `z.union`, una entrada sin `nombre` o con la forma vieja da el error en `fieldErrors.entrada` y no en `nombre`; design no lo prevé. Decide el humano.
- 2026-11-09 (implementer, tanda 2): aserciones sin respaldo: `carga-division.test.ts` (it de `listArbolDePais` por cast, rojo a propósito hasta T5.3) y `geo-lecturas-catalogo.test.ts` (compara una proyección de UI, no el repositorio). Las revisa T5.3/reviewer.

## Tandas
- 2026-11-09 · T3.1–T3.2, T4.1–T4.4, T7.1–T7.3 · `22f314b2`…`7abfe949` · tsc 0; unit tocados 449/449; guardias 337, único rojo el del baseline. La pantalla vieja no escribe (forma nueva de las actions) hasta T6. Rojos que son de T5: `carga-division` (9), `geografia-superadmin-sin-empresa` (2); `pais-repositorio` (1) espera decisión.
- 2026-11-06 · T1.1–T1.4, T2.1–T2.5 · `60e6869e`…`48ebaa2a` · tsc 0; eslint 0; guardias 336, único rojo el del
  baseline; T2: copia al nodo 9/9, migraciones aditivas 26, ida y vuelta 5/5, `prisma migrate diff` vacío.
  T0.1 sin cerrar: `./init.sh` local con la pila entera (1364 archivos, ~3,5 h, timeouts por carga); 11/12
  re-corridos en verde, `demo-qa` rojo por base sin siembra. Veredicto en CI. Base `logistic_slt46`.

## Modelos (overrides)

## Cierre
