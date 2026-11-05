# SLT-86 — Planes: período de facturación · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-83 ·
> **Rama** `feature/SLT-86-planes-periodo-facturacion`
>
> **Alcance.** Cada plan tiene un período de facturación: quincenal, mensual, bimestral o anual. El
> período es el ciclo completo del plan: costo base por período, tope de órdenes por período, y «Mi plan»
> con el período en curso y su reinicio. Cualquier período admite un descuento opcional sobre el costo
> base, en porcentaje o en monto fijo. Entra el formulario del plan, el catálogo, el detalle, el modal de
> asignación, «Mi plan» y el detalle de empresa, más la migración de los planes existentes.
>
> **Lo que NO entra.** El cobro real del costo base en la wallet: sigue informativo (SLT-66 R21). No tiene
> ficha; se crea cuando se pida.
>
> Sembrado por `/afinar-feature` el 2026-11-05. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Qué mueve el período? | Todo el ciclo: costo base por período, tope de órdenes por período, «Mi plan» y detalle de empresa con el período en curso y su reinicio. Reemplaza la regla de SL-24 (ciclo siempre mensual, anual solo como precio). |
| 2026-11-05 | ¿Qué períodos? | Quincenal, mensual, bimestral y anual. Un plan tiene exactamente uno. |
| 2026-11-05 | ¿Cómo se cuenta el quincenal? | Cada 15 días exactos desde el ancla: asignado el 5, del 5 al 19, del 20 al 4, y así. Se corre respecto del mes. |
| 2026-11-05 | ¿Bimestral y anual? | 2 y 12 meses anclados en el día del ancla, con la regla de SL-24 R20 para días que no existen (ancla 31 → 28/feb). |
| 2026-11-05 | ¿Qué es el anual? | Un período de 12 meses: se muestra como un pago al inicio y otro al año. El precio anual fijo y el descuento anual sobre el mensual de hoy se retiran. |
| 2026-11-05 | Descuento | Opcional en cualquier período, sobre el costo base del período. El plan elige UNO: porcentaje (> 0 y ≤ 100) o monto fijo (≥ 0). El costo base con descuento nunca es negativo. Nunca toca el costo por orden (hereda SLT-66). |
| 2026-11-05 | ¿El costo base se cobra? | No. Sigue informativo, sin cargo en la wallet (SLT-66 R21). |
| 2026-11-05 | Cambio de período (editar el plan o cambiar la empresa de plan) | El ciclo en curso termina como estaba; el siguiente ya usa el período nuevo, anclado en esa fecha. Encaja con el cambio programado (`vigente_desde`) de SLT-58. |
| 2026-11-05 | Migración | Todos los planes pasan a período mensual con su costo base mensual. El precio anual y el descuento anual se retiran y quedan en el historial del plan (`plan_rastro`). Las empresas conservan su ancla y su ciclo en curso. |
| 2026-11-05 | Ciclo corto | Heredado de SLT-58 R34: con fecha futura, el primer ciclo va de la asignación a esa fecha; desde ahí sigue el período del plan. |
| 2026-11-05 | Quién configura | Heredado de SL-24 R5: solo el superadmin, validado en el service. |
| 2026-11-05 | Cálculo | Heredado de SLT-66 R19: decimal exacto, dos decimales, sin coma flotante. Base y TS calculan igual el inicio y el siguiente ciclo (SLT-58 R35). |
| 2026-11-05 | ¿Librería nueva? | No. |
