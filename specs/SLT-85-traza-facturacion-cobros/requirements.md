# SLT-85 — traza-facturacion-cobros · requirements.md

> **Zona** backend · **Complejidad** medium · **depends_on** SLT-83, SL-40 ·
> **Rama** `feature/SLT-85-traza-facturacion-cobros`
>
> **Alcance.** Una tabla de traza de facturación con una fila por cada cargo y por cada reverso de los
> cobros de la plataforma por orden (SL-40, SLT-66, SLT-83), venga el cobro de donde venga: plan fijo o
> porcentual, excepción de la empresa o valor global. Cada fila es una copia del momento del cobro: datos
> de la orden, regla aplicada, valor cobrado y período de cobro de la empresa. Solo se escribe. La
> migración rellena los cobros ya registrados.
>
> **Lo que NO entra.** Pantalla y exportación de la traza: irán en una ficha aparte cuando se pidan.
> Cobrar el costo base del plan (sigue informativo, SLT-66 R21 y SLT-86 R14). IVA. Moneda (SL-21).
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | ¿Qué cobros cubre? | Todos los cobros de la plataforma por orden: plan (fijo o porcentual), excepción de la empresa y valor global. Una fila por cargo y otra por reverso. |
| 2026-11-05 | ¿Se edita o se borra? | Solo se escribe; nunca se edita ni se borra. Un reverso es una fila nueva con valor negativo que apunta al cargo que anula (`reverso_de`). |
| 2026-11-05 | Campos de cada fila | `id`, `organizacion_id`, `orden_id` (relación), `num_guia`, `monto_cobrar` de la orden en ese momento, tipo de cobro (fijo \| porcentual), `fuente` (empresa \| plan \| global \| sin_configurar), `plan_id` y `plan_nombre`, porcentaje y mínimo (si es porcentual), `valor_fijo` (si es fijo), valor cobrado, fecha de cobro, `estado_orden` al cobrar, `tipo_movimiento` (cargo \| reverso), `reverso_de`, `movimiento_id` (1 a 1 con `cobro_plataforma_movimiento`), `reconstruido`, `created_at`. |
| 2026-11-05 | Número de guía | El de la orden en el momento del cobro; vacío si la orden aún no tiene guía. No se actualiza después. |
| 2026-11-05 | Históricos | La migración rellena desde `cobro_plataforma_movimiento`. Lo que no se guardó entonces queda vacío y la fila sale con `reconstruido = true`. |
| 2026-11-05 | Quién la lee | Solo datos. La empresa lee solo las suyas (RLS); el superadmin, todas. Sin pantalla ni exportación. |
| 2026-11-05 | IVA y moneda | Sin IVA (SLT-66 R14). Moneda abierta hasta SL-21. |
| 2026-11-09 | ¿Guarda el período de cobro? | Sí. Cada fila guarda el tipo de período de la empresa al cobrar (quincenal \| mensual \| bimestral \| anual) y el inicio y fin del período de calendario en que cae el cobro (SLT-86). En los históricos se calcula con la regla de SLT-86 y la fila sale como `reconstruido`. Una empresa sin plan al cobrar deja el período vacío. |
| 2026-11-09 | Importes | Decimal con 2 decimales, igual que `cobro_plataforma_movimiento` (heredado de SL-40). Nunca float. |
| 2026-11-09 | Nombres en la base | `snake_case` en español, como el resto de la base (`docs/conventions.md`). |
| 2026-11-09 | Cuándo se escribe | En la misma transacción que el movimiento de `cobro_plataforma_movimiento`: no puede haber movimiento sin su fila de traza ni al revés. |
| 2026-11-09 | Ruta | Completa: toca dinero y hace migración (`docs/specs.md > Tres rutas`). |
