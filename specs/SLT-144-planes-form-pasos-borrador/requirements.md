# SLT-144 — planes-form-pasos-borrador · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SLT-128, SLT-129, SLT-130 (todas done) · **Rama:** `feature/SLT-144-planes-form-pasos-borrador`
>
> **Alcance.** Conecta el formulario por pasos de SLT-130 «Planes: formulario por pasos compartido en un sheet
> (crear y editar)» con el backend de SLT-128 «Planes: el cambio programado del plan llega a cada empresa al
> inicio de su período» y SLT-129 «Planes: borrador del plan guardado en el servidor por pasos»:
> - «Guardar y continuar» guarda cada paso en el borrador del servidor; ✓ por paso guardado; no se salta a un
>   paso sin guardar el anterior; se muestran el estado del borrador y la hora del último guardado.
> - Lista de planes: los borradores de creación (nombre, quién lo empezó, cuándo) y la marca «Cambio en
>   borrador» en los planes con borrador de cambio; desde ahí se retoma o se descarta con confirmación.
> - «Editar» en un plan con borrador de cambio retoma ese borrador directo, con el aviso «Borrador de
>   <quién>, guardado el <fecha hora>» y el botón «Descartar y empezar de nuevo».
> - «Cuándo rige» y «Revisar y programar»: la fecha en que recibe el cambio cada empresa y el aviso de topes
>   que alguna empresa ya pasa.
> - «N de M empresas ya lo recibieron» del detalle del plan cuenta también las que entran al plan en la fecha
>   elegida o después (review m1 de SLT-128).
>
> **Lo que NO entra.** Quitar «De inmediato» del servicio, la action y el paso «Cuándo rige» → SLT-135
> «Planes: sin «De inmediato» al editar un plan» (dejó de ser dependencia, humano 2026-11-17).
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
| 2026-11-17 | ¿La marca «Borrador» en la lista y «Descartar borrador» entran aquí? | Sí (venían de SLT-129 «Lo que NO entra»). Descartar pide confirmación. |
| 2026-11-17 | «Editar» con un borrador de cambio de otro superadmin | Retoma directo, sin diálogo previo: pasos con ✓, aviso con quién y cuándo, y «Descartar y empezar de nuevo». |
| 2026-11-17 | ¿Depende de SLT-135? | No (humano). Quitar «De inmediato» es de SLT-135; esta ficha no lo toca. |
| 2026-11-17 | Contrato del borrador | Heredado de SLT-129: uno de cambio por plan y compartido; varios de creación sin límite; no caduca; gana el último guardado sin aviso; confirmar sin cambios lo borra; guardar y descartar no dejan `plan_rastro`. Un guardado que llega justo después de confirmar abre un borrador nuevo (review m4 de SLT-129): la pantalla debe evitarlo o tolerarlo. |
| 2026-11-13 | Pasos, maqueta y descuentos como lista | Heredados de SLT-130 (`specs/SLT-130-planes-form-pasos/maqueta/`). |
| 2026-11-11 | Fecha de cada empresa, topes pasados y correos | Heredados de SLT-128 (P2, P4, P5). |
| 2026-11-17 | ¿Quién opera? | Solo el superadmin (SL-24). |
| 2026-11-17 | ¿E2E? | Sí: crear y editar un plan por pasos con borrador. |
| 2026-11-17 | ¿Ruta? | Completa. |
