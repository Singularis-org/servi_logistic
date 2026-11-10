# SLT-89 «Geografía jerárquica: zonas de la empresa sobre el nodo»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-89 | geo-jerarquica-zonas | fullstack | high | feature/SLT-89-geo-jerarquica-zonas | Camilo (6ace53aa94bfd46ee6a600a5) | in_progress (tomada) |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 2026-11-10: spec aprobado (F1.4, «aprobado», por escrito) y tarjeta en in_progress. Spec R1–R48, T0–T9.
Backend lanzado; la pantalla (T7) espera la maqueta T0.2 (https://claude.ai/artifact/9QG7NyNkFdDcxu5zvWu1xD), sin aprobar.

## Evaluación
- zone fullstack: zona y zona especial asignables a cualquier nodo con herencia, `GeografiaSelector` a N
  niveles, aviso de impacto (órdenes pendientes que cambian de zona o tarifa), grupos de distritos de
  tarifas (SLT-52) sobre el nodo, trigger de `orden` a cualquier nodo, historial de la empresa.
- complexity high: toca zonas, tarifas y la cobertura de órdenes de todas las empresas; migraciones solo
  aditivas hasta SLT-48; equivalencia para CR (zonas, cobertura, cotizaciones y cierres).
- Cupo fullstack: 2 de 3 (SLT-46, SLT-89).
- Dependencias: SLT-46 sin mergear (PR #107); las geo en proceso están pausadas por decisión del humano.
- Cruce de archivos (F2.0, 2026-11-10): choques propios con la pila geo. Con otra persona: SLT-77 «Tope de intentos de entrega configurable por empresa» (14 archivos de Tarifas, historial, schema) y SLT-55 «Valor propio del mensajero» (9 de Tarifas), de Carlos Restrepo: **choque aceptado por el humano** y avisado en ambas tarjetas. SLT-97 «Reporte de bugs: módulo del superadmin» (sin assignee): schema, modelos-de-negocio, architecture. SLT-88 sin rama publicada.

## Decisiones
- 2026-11-09 (humano): «arranca 89, ignora las que están en proceso de geografía, están pausadas de
- 2026-11-10 (humano): «aprobado» — maqueta de T0.2 aprobada: https://claude.ai/artifact/9QG7NyNkFdDcxu5zvWu1xD (copia en el scratchpad `maqueta89/project/`). Desbloquea T7.
  momento»: la rama nace sobre `feature/SLT-46-geo-jerarquica-admin`; las fichas geo en vuelo no se tocan.
- 2026-11-09 · Alcance y decisiones cerradas en `specs/SLT-89-geo-jerarquica-zonas/requirements.md` (`/afinar-feature`; descripción de la tarjeta actualizada, complexity:high).

## Preguntas abiertas

## Tandas
- 2026-11-10 · Tanda 1 (T1.1–T1.6, T2.1–T2.5) hecha: `359ad4c8`..`3db049a3`. Censos +2 tablas/+2 triggers/+1 tipo de historial; resolver de tarifas 3→4 consultas por lote (decisión humana). Guardias 320 verdes salvo el rojo aceptado; contrato v1 22/22. Bitácora: `progress/impl_SLT-89.md`.
- 2026-11-10 · Tanda 2 (T3–T6, servidor) hecha: `aeb8ecbf`..`d4dbe8e1`. Guardias verdes salvo el rojo aceptado; contrato v1 22/22. Rojos hasta T7: 28 casos del formulario de zona (falta mandar «antes», T7.2) y grupos en Tarifas sin «antes» (T7.3). Pendiente decisión humana: historial al sacar un distrito viejo de su grupo (R21 vs R38).
- 2026-11-10 · Tanda 3 (T7.1–T7.3, T8.1, T9.1) hecha: `cf715317`..`5312a92b`. Maqueta aprobada; 28 rojos del formulario de zona resueltos; R22 padre siempre (decisión humana). E2E escrito, se corre en CI (sin psql local). Pendiente: review F2.2, T9.2, PR.

## Modelos (overrides)

## Cierre
