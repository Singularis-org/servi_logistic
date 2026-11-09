# SLT-97 — reporte-bugs-modulo-superadmin · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** SLT-87 ·
> **Rama** `feature/SLT-97-reporte-bugs-modulo-superadmin`
>
> **Alcance.** Entrega 2 de 3 del reporte de bugs. En `/plataforma`, un módulo solo para el
> superadmin: listado de los reportes que guarda SLT-87, con filtros por empresa, estado y fecha;
> detalle con descripción y contexto; y estado del reporte (nuevo → en revisión → resuelto /
> descartado), con una nota interna en cada cambio y el historial de cambios. El E2E de SLT-87 se
> amplía: el reporte enviado aparece en el módulo.
>
> **Lo que NO entra.** Imágenes, que van en SLT-98 «Reporte de bugs: imágenes». Responder al usuario,
> avisar a la empresa o al usuario. Que la empresa vea sus reportes.
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
| 2026-11-05 | Módulo del superadmin | En `/plataforma`: listado con filtros (empresa, estado, fecha), detalle con descripción y contexto, y estado nuevo → en revisión → resuelto / descartado con nota interna. (Heredado del alcance original de SLT-87.) |
| 2026-11-05 | Visibilidad | Solo el superadmin ve los reportes. La empresa (maestro, admin) no ve ninguno, ni los de su gente. Nunca se notifica a la empresa ni al usuario. (Heredado de SLT-87.) |
| 2026-11-09 | ¿Cómo se mueve el estado? | Solo hacia adelante: nuevo → en revisión → resuelto o descartado. Un reporte resuelto o descartado no se reabre; si el bug vuelve, entra como reporte nuevo. |
| 2026-11-09 | Nota interna | Una nota opcional por cada cambio de estado, que queda en el historial con quién, cuándo, el estado de antes y el de después. Las notas no se editan ni se borran. |
| 2026-11-09 | Dónde se guarda | Sobre la tabla de plataforma `bug_report` de SLT-87, que no tiene políticas y tiene REVOKE para `servi_app`; solo se lee y se escribe en `comoPlataforma`. El estado y el historial siguen la misma regla. (Heredado de SLT-87.) |
| 2026-11-09 | Vistas de referencia | Listado y detalle en https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms (sin las imágenes, que son de SLT-98). Si la vista choca con el spec, manda el spec. |
| 2026-11-09 | ¿Hace falta E2E? | Sí: amplía el de SLT-87 (enviar → aparece en el módulo → cambiar estado con nota → historial). |
| 2026-11-09 | ¿Librería nueva? | No. |
| 2026-11-09 | Ruta | Completa: cambia el esquema y toca permisos de plataforma. |
