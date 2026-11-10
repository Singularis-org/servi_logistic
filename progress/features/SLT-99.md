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

- 2026-11-09 (humano): P10 → sin insignia cuando el % equivalente de un descuento anual en monto fijo redondea a 0 %. La implementación mueve P10 a «Decisiones cerradas» del requirements (T0).

- 2026-11-10 (tras tanda 1, `progress/impl_SLT-99.md`): los 4 desvíos aceptados uno por uno (humano): `IPlanesDelMaestroRepository` aparte; `@sin-superficie` en las 2 actions hasta T7; `NOMBRES_DEL_TOPE` en `lib/planes/mensajes.ts`; empresa de la sesión inexistente → error con contexto.

- 2026-11-10 (tras tanda 2, `progress/impl_SLT-99.md`, humano): «Activo desde» (R8) se agrega: el backend envía la entrada del plan (`plan_ciclo_ancla_at`) a la pantalla. Primera asignación pendiente sin plan: el maestro NO puede cancelarla (sin botón, como P5). Los 4 desvíos de la tanda 2 aceptados uno por uno: íconos por `ORDEN_MODULOS`; selector Mensual/Anual controlado por quien monta; test de SLT-86 a «Cancelar cambio» por P3; los tres textos nuevos.

- 2026-11-10 (tras tanda 3, humano): «Activo desde» se muestra como «1 sep 2026» (no `AAAA-MM-DD`); se aceptan los 4 E2E de «Mi plan» acotados al panel «Plan activo» y el E2E nuevo que crea y asigna los planes en la base; cupo `fullstack` sube a 5 en `arnes.config.json`.
<!-- tamano-pr-aceptado: 2026-11-10 · 46 archivos (amplía la aceptación del 2026-11-09): «Activo desde», el E2E y 4 E2E existentes ajustados (humano) -->

- 2026-11-10 (tras la revisión, `progress/review_SLT-99.md`, humano): M1 se arregla en código (rechazar bajo el cerrojo la cancelación de una primera asignación pendiente sin plan). M2: la constancia de integración con base y E2E la da el CI del PR a `dev` (no borrador); no se mergea sin `gate-completo` y `e2e` en verde. m1: elegir el plan activo con un pendiente cancela el pendiente. m2 y m3 se corrigen.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-11-09 · Tanda 1 (backend_dev) · T0–T4 · typecheck, lint, guardias (solo la baseline) y `related` en verde; la integración de `mi-plan-cambiar-plan` la corre CI. Desvíos: `IPlanesDelMaestroRepository` y `@sin-superficie` en las actions hasta T7. Detalle en `progress/impl_SLT-99.md`.
- 2026-11-10 · Tanda 2 (frontend_dev) · T5–T7 · typecheck, lint, tests de componente, `related` y guardias (solo la baseline) en verde; `@sin-superficie` retiradas. Desvíos: íconos en SVG en línea en `IconoDelModulo.tsx` (por `ORDEN_MODULOS`), «Activo desde» sin dato en «Mi plan», sin «Cancelar cambio» para la primera asignación sin plan. 2 preguntas abiertas. Detalle en `progress/impl_SLT-99.md`.
- 2026-11-10 · Tanda 3 (implementer) · «Activo desde» (R8) + T8 · typecheck, lint, `related` y guardias (solo la baseline) en verde; E2E `mi-plan-cambiar-plan` escrito y listado en `aislamiento`, sin correr en local (CI). `./init.sh` rojo en el paso 3 por el cupo del board (5 `fullstack`, máx. 3). Desvíos: «Activo desde» en `AAAA-MM-DD`; 4 E2E de «Mi plan» acotan el título al panel «Plan activo». 3 preguntas. Detalle en `progress/impl_SLT-99.md`.
- 2026-11-10 · Ajuste (frontend_dev) · «Activo desde» (R8) en «1 sep 2026» con `fechaCortaEnZona` · cupo (paso 3), typecheck y lint en verde; `test:rapido` rojo por timeout de una guardia bajo carga (sola en verde); guardias solo con la baseline.

## Modelos (overrides)

## Cierre
