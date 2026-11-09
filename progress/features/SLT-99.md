# SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-99 | planes-vista-empresa-cambiar-plan | fullstack | high | feature/SLT-99-planes-vista-empresa-cambiar-plan | Camilo (6ace53aa94bfd46ee6a600a5) | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 cerrado (2026-11-09): tarjeta asignada, rama publicada, worktree creado.
`/afinar-feature` cerrado (2026-11-09): `requirements.md` sembrado. Siguiente: F1.2 (`spec_author`).
F1.2 (2026-11-09): spec escrito; ajustado el mismo día con las respuestas del humano a P1–P9. Queda P10 (no bloquea).

## Evaluación
- zone `fullstack`: pantalla «Mi plan» con carrusel y componentes compartidos + servicio y action del cambio de plan por el maestro.
- complexity `high`; ruta completa: toca el cobro (cambio de plan al inicio del próximo período de cobro de la empresa).
- Tamaño: «Contáctanos» separado a SLT-117 para caber en el tope de PR.

## Decisiones
- 2026-11-09 (/afinar-feature): ver tabla en `specs/SLT-99-planes-vista-empresa-cambiar-plan/requirements.md`. Tarjeta editada (descripción, `complexity:high`); ficha nueva SLT-117 «Planes: solicitud de plan a la medida desde Contáctanos». Diseño aprobado: https://claude.ai/artifact/M1owRvXM3ziekGffd6ct45.
- 2026-11-09 (humano): respuestas a P1–P9 en las filas P1–P9 de `specs/SLT-99-planes-vista-empresa-cambiar-plan/requirements.md > Decisiones cerradas`; P2 reemplaza la fila «¿Desde cuándo rige?» (corte = inicio del próximo período de cobro de la empresa, no 1/16).
<!-- tamano-pr-aceptado: 2026-11-09 · ~31 archivos y ~1 800 líneas; pantalla y cambio de plan van juntos y se prueban juntos en el E2E (humano) -->

## Preguntas abiertas
- P10 (`requirements.md`): insignia de un descuento anual en monto fijo cuyo % equivalente redondea a 0 %. Propuesta: sin insignia. No bloquea T1–T4.

## Tandas

## Modelos (overrides)

## Cierre
