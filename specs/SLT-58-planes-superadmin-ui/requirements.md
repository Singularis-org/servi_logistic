# SLT-58 — planes-superadmin-ui · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-24 · **Rama:** feature/SLT-58-planes-superadmin-ui
>
> **Alcance:**
> - Superadmin: pantalla del catálogo de planes (crear, editar, archivar, programar o cancelar un cambio) y, en el detalle de cada empresa, su plan, su consumo y asignar o cambiar el plan, con el historial (`plan_rastro`). Usa las actions de SL-24 (`@sin-superficie`).
> - Empresa (maestro y admin): vista «Mi plan» con nombre, precio y módulos, consumo frente a cada tope, días hasta el reinicio del ciclo, aviso al 80 % y al 100 %, y el cambio programado con su fecha.
> - Backend: solo las lecturas que faltan (plan y consumo de la empresa; catálogo y detalle para el superadmin), sin cambiar reglas de SL-24.
>
> **Lo que NO entra:**
> - Pedir o elegir un cambio de plan desde la empresa → SL-25 (autoservicio).
> - Cobro real o moneda del precio → D26 / SL-21.
> - Un tipo de plan nuevo: «enterprise» es un custom.
> - Cambios de reglas de topes o de correos → ya cerrados en SL-24.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Ruta y lugar en el menú de «Mi plan» (¿dentro de Configuración o propia?): lo propone spec_author y lo aprueba el humano con el spec.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-29 | ¿SL-26 sigue? | No: cancelada. Empresas y módulos ya tienen pantalla; los planes pasan aquí, sin depender de SL-25. |
| 2026-10-29 | ¿Qué es «enterprise»? | Un plan custom con nombre comercial. Sin tipo nuevo. |
| 2026-10-29 | ¿Quién ve «Mi plan»? | Maestro y admin de la empresa. Validado en el service, con test. |
| 2026-10-29 | ¿Qué muestra «Mi plan»? | Nombre, precio (informativo), módulos incluidos y consumo por tope: órdenes del ciclo («1.000 de 3.000»), días hasta el reinicio, usuarios por rol («10 de 10 mensajeros») y API keys. Un tope sin límite se muestra como «sin límite»; una empresa sin plan, como «sin límites». |
| 2026-10-29 | Aviso de tope | Al 80 % se marca «cerca del tope»; al 100 %, «lleno». |
| 2026-10-29 | Cambio programado | «Mi plan» muestra el cambio pendiente con su fecha y qué cambia. |
| 2026-10-29 | ¿Pedir cambio de plan desde la empresa? | No. Solo información. Va a SL-25. |
| 2026-10-29 | ¿E2E? | Sí: el superadmin crea un custom y lo asigna a la empresa demo; el maestro ve sus topes y su consumo en «Mi plan». Cubre el permiso y el aislamiento. |
| 2026-10-29 | Heredado de SL-24 | Solo el superadmin gestiona planes (validado en el service); archivar en vez de borrar; precio sin moneda (D26); ciclo en UTC desde el alta; identificadores en español; sin dependencias nuevas. |
