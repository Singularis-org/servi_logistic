# SLT-128 — planes-cambios-por-periodo · requirements.md

> **Zona** backend · **Complejidad** high · **depends_on** SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» (apilada sobre su rama) · **Rama** `feature/SLT-128-planes-cambios-por-periodo`
>
> **Alcance.** Al editar un plan desaparece la opción «De inmediato». El superadmin elige una fecha «A partir
> de» y cada empresa con ese plan recibe el cambio al inicio de su siguiente período de cobro que empiece en esa
> fecha o después. Vale para todo lo editable del plan: nombre, costo base, descuentos, cobro por orden, topes,
> módulos y periodicidad de órdenes. Los recordatorios por correo van a cada maestro, contados hasta la fecha de
> su empresa (sustituye SL-24 R42).
>
> **Lo que NO entra.**
> - El formulario por pasos dentro de un sheet: SLT-130 «Planes: formulario por pasos compartido en un sheet
>   (crear y editar)».
> - El borrador del plan guardado en el servidor por pasos: SLT-129 «Planes: borrador del plan guardado en el
>   servidor por pasos».
> - El cambio de plan de una empresa (de un plan a otro): ya lo resuelve SLT-118 R30.
>
> Sembrado por `/afinar-feature` el 2026-11-11. El bloque de Alcance y la tabla de «Decisiones cerradas» los
> fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- **Cancelar el cambio de un plan.** ¿«Cancelar cambio» cancela solo lo que falta (las empresas que aún no lo
  recibieron) y deja intacto lo ya aplicado? Propuesta: sí.
- **Tope que baja por debajo del uso actual.** Si el cambio baja un tope (p. ej. mensajeros) por debajo de lo
  que una empresa ya usa al recibirlo, ¿qué pasa? Revisar el precedente de SL-24 («aviso de topes pasados») y
  proponerlo.
- **Tamaño.** Si no cabe en el tope del PR, el spec propone el corte.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-11 | Base de trabajo | **Apilada sobre la rama de SLT-118** (humano). Se rebasa si SLT-118 cambia. |
| 2026-11-11 | ¿Cuándo rige un cambio del plan? | Sin «De inmediato». El superadmin elige «A partir de» y cada empresa lo recibe al inicio de su siguiente período de cobro que empiece en esa fecha o después. Ejemplo: fecha 16 nov → la mensual el 1 dic, la quincenal el 16 nov (humano, ficha). El período de cada empresa se calcula como en SLT-118 R30 (`fechaDeEfectoPorDefecto` por su tipo de cobro). |
| 2026-11-11 | ¿Qué campos? | Todo lo editable del plan: nombre, costo base, descuentos, cobro por orden, topes, módulos y periodicidad de órdenes (esta última hereda SLT-118 R36). Hoy solo el precio va por período (SLT-86 R22); topes, módulos y cobro por orden tienen edición inmediata o fecha única (SL-24 R15/R37) (humano, ficha). |
| 2026-11-11 | Fecha mínima | `≥ hoy`, heredado de SLT-86 R22. |
| 2026-11-11 | Varios cambios pendientes del mismo plan | **Un solo pendiente por plan.** El cambio nuevo reemplaza al anterior para las empresas que todavía no lo recibieron; las que ya lo recibieron se quedan con él. Ejemplo: «+10 000» desde el 16 nov y luego «+5 000 más» desde el 21 nov → la mensual recibe solo el plan final el 1 dic (humano; ajusta SL-24 R39). |
| 2026-11-11 | Archivar un plan con un cambio a medias | **No se puede archivar** mientras quede alguna empresa sin recibir el cambio (humano; sustituye SL-24 R40). |
| 2026-11-11 | Correos | Siempre sale uno al guardar. Recordatorios contados hasta la fecha de cada empresa: más de 7 días → a 7 y a 1 día; de 4 a 7 días (7 incluido) → a 3 y a 1 día (ejemplo: se guarda el 11 y rige el 16 → correos el 11, el 13 y el 15); 3 días o menos → solo el de 1 día, si cae después de guardar (humano, ficha; sustituye SL-24 R42). |
| 2026-11-11 | ¿Por empresa o por plan? | **Por empresa**: cada maestro recibe sus recordatorios contados hasta su fecha (humano). Destinatarios, heredados de SL-24 P7. |
| 2026-11-11 | Cierre de la factura | El cierre espera a los cambios pendientes de cada empresa con efecto ≤ su fin: extiende SLT-118 R39 a toda edición del plan. |
| 2026-11-11 | E2E | No toca un flujo crítico de `docs/checkpoints-proyecto.md`; sin E2E propio salvo que el spec encuentre uno (los de planes existentes se ajustan si rompen). |
