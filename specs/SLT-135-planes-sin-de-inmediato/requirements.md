# SLT-135 — planes-sin-de-inmediato · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** SLT-128 · **Rama:** `feature/SLT-135-planes-sin-de-inmediato`
>
> **Alcance.** Al editar un plan desaparece «De inmediato»: toda edición (incluido solo el nombre) lleva una
> fecha «A partir de» y llega a cada empresa al inicio de su período de cobro que empiece en esa fecha o
> después (mecanismo de SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su
> período»). Incluye retirar el camino inmediato del servicio, de la action y del paso «Cuándo rige» del
> formulario, y ajustar los tests (unitarios, de integración y E2E) que hoy editan «De inmediato».
>
> **Lo que NO entra.** El borrador del cambio → SLT-129 «Planes: borrador del plan guardado en el servidor por
> pasos» (en curso, PR #200). Conectar el formulario al borrador y mostrar la fecha de cada empresa → SLT-144
> «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa».
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: spec_author paró en F1.2 por tamaño (P1). Se escriben cuando el humano elija el corte o acepte el
tamaño._

## Preguntas abiertas

### P1 · Tamaño: no cabe en un PR (spec_author, 2026-11-18)

**Medición.** Se midió sobre el código con SLT-144 «Planes: formulario por pasos conectado al borrador y a la
fecha de cada empresa» mergeada en la rama. Quitar «De inmediato» toca unos **48 archivos**: 17 de producción y
unos 31 de tests. El tope es `gate.tamano_pr` = 40 archivos (80 % = 32). Las líneas sí caben: unas 250 de
producción y entre 800 y 1 200 de tests.

Casi todo el exceso son tests. Hoy hay 26 archivos de tests (unitarios, de integración y E2E) que editan con
`vigenteDesde: null`, que llaman a `PlanesRepository.editar` o que esperan el precio «hoy, en el acto».

**Producción (17).**
- Servidor:
  - `lib/types/planes.ts`
  - `lib/services/PlanesService.ts`
  - `lib/interfaces/services/IPlanesService.ts`
  - `lib/interfaces/repositories/IPlanesRepository.ts`
  - `lib/repositories/PlanesRepository.ts`
  - `lib/actions/planes.ts`
  - `lib/planes/mensajes.ts`
- Formulario, en `app/(app)/plataforma/planes/_components/`:
  - `PlanForm.tsx`
  - en `plan-form/`: `PasoCuandoRige.tsx`, `estado.ts`, `borrador.ts`, `revision.ts`, `textos.ts` y
    `FechasPorEmpresa.tsx`
- Pantallas:
  - `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
  - `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`

**Tests (unos 31).**
- Unitarios (11), en `tests/unit/`:
  - `services/`: `planes-service`, `-periodo`, `-costeo`, `-costo-porcentual` y `planes-previsualizar-cambio`
  - `types/`: `planes-schema`, `-costeo`, `-costo-porcentual` y `plan-borrador-schema`
  - `planes/`: `plan-form-borrador` y `plan-form-revision`
- Componentes (5), en `tests/components/`: `PlanForm`, `PlanFormRevisar`, `PlanFormFechasPorEmpresa`,
  `PlanDetalle` y `PlanFormBorrador`.
- Integración (13), en `tests/integration/db/`:
  - `plan-precio-historial`, `plan-descuento-periodo`, `planes-historial` y `planes-cambio-correos`
  - `planes-cambio-por-empresa`, `plan-borrador-confirmar` y `planes-edicion-en-uso`
  - `plan-costo-porcentual-escritura`, `planes-costeo-escritura` y `planes-periodicidad-ordenes`
  - `factura-plataforma-cambio-plan`, `planes-asignacion` y `cobro-plataforma-plan`
- E2E (1): `e2e/planes-costo-porcentual.spec.ts`.

**Propuesta de corte: tres rebanadas verticales.** Cada una se mergea sola y deja el producto funcionando.

- **A · «Editar con la fecha de hoy llega a cada empresa por su período».** SLT-135 se queda con esta
  rebanada.
  - Qué hace: una edición con «A partir de» = hoy deja de rechazarse si no cambia el precio. Ya no se aplica
    en el acto a todas si cambia el precio: va por el mecanismo de SLT-128 «Planes: el cambio programado del
    plan llega a cada empresa al inicio de su período».
  - Cumple la decisión «≥ hoy por empresa». «De inmediato» sigue en esta rebanada.
  - Archivos (unos 9): `PlanesService.ts`, `lib/types/planes.ts` (comentarios) y el texto de ayuda de la fecha.
    Tests: `planes-service-periodo`, `planes-service`, `plan-precio-historial`, `plan-descuento-periodo` y
    `planes-historial`.
- **B · «El formulario ya no ofrece «De inmediato»».** Ficha nueva; depende de A.
  - Qué hace en el formulario:
    - «Cuándo rige» pide solo la fecha «A partir de».
    - El botón final dice siempre «Programar cambio».
    - «Revisar» deja de mostrar «Aplicar: De inmediato».
    - La tabla con la fecha de cada empresa sale siempre.
  - Qué cambia fuera del formulario:
    - Un borrador que se guardó con «De inmediato» se reabre con «Cuándo rige» sin guardar.
    - El detalle del plan deja de decir «Cambios guardados.».
    - La vista previa (`previsualizarCambio`) exige la fecha.
    - El E2E programa con la fecha de hoy y corre `procesar-jobs`.
  - Archivos (unos 20): 10 de producción, 9 de tests y el E2E.
- **C · «El servidor ya no acepta editar sin fecha».** Ficha nueva; depende de B.
  - Qué hace:
    - `editarPlanSchema` y el paso `vigencia` del borrador exigen la fecha.
    - El servicio pierde `editarYa`, y el repositorio y su interfaz pierden `editar`.
    - Se retira SLT-128 R16 y su mensaje `MENSAJE_EDITAR_CAMBIO_A_MEDIAS`.
    - Se ajustan los textos de rechazo de `PlanForm` y `PlanEmpresa`.
  - Archivos (unos 29): 9 de producción y unos 20 de tests (los de integración y los de esquemas).

**Alternativa sin cortar:** aceptar unos 48 archivos en una sola ficha, como se aceptó en SLT-144 (47
archivos, marcador `tamano-pr-aceptado`).

**Pendiente del humano:** elegir el corte A/B/C (y crear las dos fichas con `/afinar-feature`) o aceptar el
tamaño. Después, spec_author escribe los requisitos, `design.md` y `tasks.md` de la ficha que corresponda.

### P2 · Fecha por defecto de «A partir de» al editar (para cuando se escriba el spec)

- Hoy: sin cambio de precio, el formulario abre en «De inmediato» con la fecha vacía. Con cambio de precio,
  «Rige desde» abre con mañana (`precioDesdePorDefecto`).
- Al quitar «De inmediato» hay que elegir con qué fecha abre el campo.
- Propuesta: mañana en los dos casos, por coherencia con el precio de hoy. La alternativa es hoy, lo más
  parecido al antiguo «De inmediato».

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Qué fechas admite «A partir de» al editar? | Desde hoy (≥ hoy). Una empresa cuyo período empieza hoy lo recibe hoy; las demás, al inicio de su siguiente período que empiece en la fecha o después. Sustituye la regla «posterior a hoy» de SL-24 R37; es el «≥ hoy por empresa» que SLT-128 P9 dejó para esta ficha. |
| 2026-11-11 | ¿Qué partes del plan se editan con fecha? | Todo lo editable: nombre, costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes (heredado de SLT-128). |
| 2026-11-11 | «De inmediato» con el plan partido (SLT-128 R16, P7) | Queda sin objeto al desaparecer la edición inmediata; spec_author retira o reemplaza R16 de SLT-128 explícitamente. |
| 2026-11-11 | Correos, reemplazo, cancelación y recepción no aplicada | Como en SLT-128 (P1, P2, P4–P6, P8, P10, m2, m3), sin cambios. |
| 2026-11-17 | ¿Cómo valida el paso `vigencia` del borrador de SLT-129? | Con la validación de editar que deje esta ficha (≥ hoy, sin inmediato); SLT-129 ya la reutiliza. |
| 2026-11-17 | ¿Quién edita? | Solo el superadmin (heredado de SL-24). |
| 2026-11-17 | ¿E2E? | Sí: se ajustan los E2E de planes que hoy editan «De inmediato». |
| 2026-11-17 | ¿Ruta? | Completa: dinero y cambio de comportamiento del servicio de planes. |
