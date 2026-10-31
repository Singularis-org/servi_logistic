# SLT-66 — planes-sin-tope-maestro-y-costeo · requirements.md

> **Zona** fullstack · **Complejidad** high · **depends_on** SL-24, SLT-58, SL-40 · **Rama** feature/SLT-66-planes-sin-tope-maestro-y-costeo
>
> **Alcance.** Ajusta el modelo de planes de SL-24 y su UI de SLT-58.
> - El rol maestro deja de tener tope y de contar en los topes. Los demás roles siguen con tope por rol.
> - El plan tiene costo base mensual y costo por orden.
> - El cobro por orden de SL-40 pasa a usar el costo del plan.
> - El formulario del plan, el modal de asignación y «Mi plan» reflejan los cambios.
>
> **Lo que NO entra.**
> - Cobrar de verdad el costo base: sin cargo en la wallet ni pasarela.
> - El formato de los montos de los campos (SLT-67).
> - Migrar otros formularios de monto (deuda D33).
>
> Sembrado por `/afinar-feature` el 2026-10-31. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
Ninguna.

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-30 | ¿Tope por rol o tope total de usuarios? | Por rol. El maestro no tiene tope ni cuenta en ninguno (se crea por base de datos): el formulario no deja fijarlo, «Mi plan» no lo muestra y la base no lo cuenta. Admin y los demás roles siguen con tope. Si un plan ya tiene tope de maestro, la migración lo borra. |
| 2026-10-30 | ¿Y el tope de API keys? | Sigue igual (SL-24). |
| 2026-10-30 | ¿Cómo se costea el plan? | El precio mensual pasa a ser el costo base (ej. 50.000/mes). Se añade un costo por orden ingresada (ej. 100). |
| 2026-10-30 | ¿El plan anual y su descuento? | Se mantienen. El descuento solo rebaja el costo base, nunca el costo por orden. |
| 2026-10-30 | ¿Cómo encaja con SL-40? | El costo por orden del plan reemplaza al valor global de SL-40. Prioridad: excepción por empresa > plan > global. Plan sin costo por orden: aplica el global; sin ninguno, 0,00 (SL-40 D11). |
| 2026-10-30 | ¿Qué órdenes se cobran? | Heredado de SL-40 D3/D6/D7: las creadas menos las anuladas, con su reverso al anular. |
| 2026-10-31 | ¿El costo base se anota en la wallet? | No. Solo se muestra: en el plan y en «Mi plan» como base + órdenes × costo = total estimado del ciclo. |
| 2026-10-31 | Cambio de plan a mitad de ciclo con otro costo por orden | Las órdenes ya creadas conservan su importe (se fija al crearlas, como en SL-40). Las nuevas usan el costo nuevo. |
| 2026-10-31 | ¿Un plan negociable puede tener costo por orden? | Sí, es opcional. El costo base puede ser «negociable» y el costo por orden se fija igual. Si se deja vacío, aplica el global. |
| 2026-10-31 | ¿E2E? | Sí, uno. El superadmin pone 100 por orden en el plan, la empresa crea una orden, la wallet muestra el cargo de 100 y «Mi plan» muestra el total estimado. |
| 2026-10-31 | ¿Quién edita y dónde se autoriza? | Heredado de SL-24/SLT-58: el superadmin edita en /plataforma/planes y la autorización se valida en el servicio. |
