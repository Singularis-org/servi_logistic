# SLT-86 — Planes: período de facturación · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-83 ·
> **Rama** `feature/SLT-86-planes-periodo-facturacion`
>
> **Alcance.** Amplía el «tipo de cobro» de la empresa (PR #72, hoy `mensual` | `anual`) a cuatro
> períodos: quincenal, mensual, bimestral y anual. El período es el ciclo completo de la empresa: costo base
> del período, tope de órdenes por período, y «Mi plan» con el período en curso y su reinicio. El plan
> guarda su costo base mensual y un descuento opcional por cada período, en porcentaje o en monto fijo.
> Entra el formulario del plan, el catálogo, el detalle, el modal de asignación, «Cambiar tipo de cobro»,
> «Mi plan», el detalle de empresa y la migración de planes y empresas existentes.
>
> **Lo que NO entra.** El cobro real del costo base en la wallet: sigue informativo (SLT-66 R21). No tiene
> ficha; se crea cuando se pida.
>
> Sembrado por `/afinar-feature` el 2026-11-05 y enmendado el mismo día tras el bloqueo de `spec_author`
> (ya existía el tipo de cobro por empresa). El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo
> aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Dónde vive el período? | **En la empresa**: se amplía `organizacion.plan_tipo_cobro` (PR #72, `progress/features/ajuste-planes-custom-asigna-y-cobro.md` D6–D10, D14, D16) de `mensual` \| `anual` a `quincenal` \| `mensual` \| `bimestral` \| `anual`. Se elige al asignar (modal y formulario del custom) y se cambia con «Cambiar tipo de cobro», como hoy. Un mismo plan sirve a empresas con distinto período. |
| 2026-11-05 | ¿Qué mueve el período? | Todo el ciclo de la empresa: costo base del período, tope de órdenes por período, «Mi plan» y detalle de empresa con el período en curso, su reinicio y el siguiente cobro. Reemplaza la regla de SL-24 (ciclo de órdenes siempre mensual). |
| 2026-11-05 | Costo base de cada período | El plan guarda el costo base **mensual**. El del período sale de él: quincenal = mensual ÷ 2; mensual = mensual; bimestral = mensual × 2; anual = mensual × 12. Después se aplica el descuento del período. |
| 2026-11-05 | ¿Cómo se cuenta el quincenal? | Cada 15 días exactos desde el ancla: asignado el 5, del 5 al 19, del 20 al 4, y así. Se corre respecto del mes. |
| 2026-11-05 | ¿Bimestral y anual? | 2 y 12 meses anclados en el día del ancla, con la regla de SL-24 R20 para días que no existen (ancla 31 → 28/feb). |
| 2026-11-05 | ¿Qué es el anual? | Un período de 12 meses: se muestra como un pago al inicio y otro al año. |
| 2026-11-05 | Descuento | Opcional y **definido en el plan, uno por período** (ej. «Pro»: 10 % en anual, 5.000 en bimestral, nada en quincenal). Cada período elige UNO: porcentaje (> 0 y ≤ 100) o monto fijo (≥ 0). Toda empresa con ese período lo recibe. El costo base con descuento nunca es negativo. Nunca toca el costo por orden (hereda SLT-66). Reemplaza el precio anual fijo y el descuento anual de hoy. |
| 2026-11-05 | ¿El costo base se cobra? | No. Sigue informativo, sin cargo en la wallet (SLT-66 R21). |
| 2026-11-05 | Cambio de período (cambiar tipo de cobro, cambiar de plan o editar el descuento) | El ciclo en curso termina como estaba; el siguiente ya usa el período nuevo, anclado en esa fecha. Encaja con el cambio programado (`vigente_desde`) de SLT-58. |
| 2026-11-05 | Migración | Sin perder nada. Plan con % de descuento anual → descuento % del período anual. Plan con precio anual fijo → descuento fijo del anual = mensual × 12 − anual (50.000/mes y 540.000/año → 60.000). Las empresas conservan su tipo de cobro, su ancla y su ciclo en curso. |
| 2026-11-05 | Historial | Las filas que ya existen (`plan_asignado` con el tipo, `plan_tipo_cobro_cambiado`) se siguen mostrando tal cual. |
| 2026-11-05 | Ciclo corto | Heredado de SLT-58 R34: con fecha futura, el primer ciclo va de la asignación a esa fecha; desde ahí sigue el período de la empresa. |
| 2026-11-05 | Quién configura | Heredado de SL-24 R5: solo el superadmin, validado en el service. |
| 2026-11-05 | Cálculo | Heredado de SLT-66 R19: decimal exacto, dos decimales, sin coma flotante. Base y TS calculan igual el inicio y el siguiente ciclo (SLT-58 R35). |
| 2026-11-05 | ¿Librería nueva? | No. |
