# SLT-129 — planes-borrador-servidor · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** — · **Rama:** `feature/SLT-129-planes-borrador-servidor`
>
> **Alcance.** El servidor guarda el avance del formulario de planes paso a paso (General, Precio y
> descuentos, Cobro por orden, Topes, Módulos y, al editar, Cuándo rige). Crear: el plan nace como
> borrador; no aparece entre los asignables ni en el catálogo público y no afecta a ninguna empresa hasta
> «Crear plan». Editar: el cambio se guarda como borrador del cambio; no se programa, no se aplica y no
> sale ningún correo hasta «Programar cambios». El borrador se retoma desde cualquier dispositivo y otro
> superadmin lo ve. Crear o programar solo se admite con todos los pasos anteriores guardados. Los
> descuentos van como lista: cada línea tiene período (quincenal, mensual, bimestral o anual, sin
> repetir), monto y tipo fijo o porcentual.
>
> **Lo que NO entra.** La pantalla («Guardar y continuar», ✓ por paso, la marca «Borrador» en la lista de
> planes, el botón «Descartar borrador», la fecha de cada empresa) → SLT-144. Quitar «De inmediato» al
> editar → SLT-135.
>
> Sembrado por `/afinar-feature` el 2026-11-17. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-17 | ¿Se descarta o caduca un borrador abandonado? | No caduca. Queda hasta que alguien lo termina o lo descarta; descartar lo borra. Sin vencimiento automático. |
| 2026-11-17 | ¿Puede haber varios borradores de cambio por plan? | No: uno por plan, compartido entre superadmins; se ve quién lo empezó y cuándo, y cualquiera lo sigue o lo descarta. Misma regla que el cambio programado (SL-24 R39). |
| 2026-11-17 | ¿Qué queda en `plan_rastro`? | Solo lo definitivo: «Crear plan» y «Programar cambios» dejan su fila de siempre. Guardar un paso y descartar un borrador no dejan fila. |
| 2026-11-17 | ¿Quién opera los borradores? | Solo el superadmin (heredado de SL-24). |
| 2026-11-17 | ¿Descuentos? | Un descuento por período, sin repetir (heredado de SLT-86 R23; `plan_descuento_periodo` ya tiene esa clave). |
| 2026-11-17 | ¿Cómo se programa el cambio al confirmar? | Con el mecanismo por empresa de SLT-128. |
| 2026-11-17 | ¿E2E? | No en esta ficha: no tiene pantalla. El E2E va en SLT-144. |
| 2026-11-17 | ¿Ruta? | Completa: esquema y migración nuevos. |
