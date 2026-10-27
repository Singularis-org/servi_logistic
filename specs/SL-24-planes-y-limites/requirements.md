# SL-24 — planes-y-limites · requirements.md

> **Zona:** backend · **Complejidad:** high · **depends_on:** SL-23 · **Rama:** `feature/SL-24-planes-y-limites`
>
> **Alcance:** catálogo de planes que crea y edita el superadmin (públicos o custom atados a una
> empresa, con precio mensual, anual u «negociable»), asignación de un plan a cada empresa y topes
> contados en el servidor, dentro de la misma transacción del alta: órdenes por ciclo, usuarios por
> rol y módulos incluidos. Al llegar al tope el alta se rechaza. Solo backend: servicio, repositorio,
> server actions de superadmin y la comprobación en cada alta, con tests.
>
> **Lo que NO entra:**
> - Pantallas para crear planes y asignarlos → SL-26 «Panel de superadmin».
> - Catálogo público y elección de plan al registrarse → SL-25 «Registro de empresas en autoservicio».
> - Cobro real, pasarela o facturación del plan → sin ficha (el precio es informativo).
> - Moneda por país del precio → SL-21 «Moneda e impuestos configurables por país».
>
> Sembrado por `/afinar-feature` el 2026-10-27. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

1. **Mensual o anual por empresa.** ¿La empresa queda suscrita en mensual o en anual? Si es anual,
   ¿el tope de órdenes sigue contándose por ciclo mensual desde la fecha de alta, o por ciclo anual?
   Del humano.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-27 | ¿Qué limita un plan? | Órdenes por ciclo, usuarios por rol y módulos incluidos. Las «tiendas» son el tope del rol Admin Tienda: no hay tope aparte. |
| 2026-10-27 | ¿Qué pasa al llegar al tope? | Bloqueo duro: el alta se rechaza con un mensaje claro y no se crea nada. Vale para todas las vías (pantalla, carga masiva, API). |
| 2026-10-27 | ¿Quién crea los planes? | El superadmin, uno por uno desde la app, sin desarrollo. Solo el superadmin, validado en el service con test. Se hereda de SL-23 y SL-40 D2. |
| 2026-10-27 | Plan público o custom | Público: lo pueden tener varias empresas y lo verá el autoservicio (SL-25). Custom: atado a UNA empresa, no visible al público, con sus propios topes. Los planes no se borran: se archivan (borrado lógico). |
| 2026-10-27 | Precio | Opcional. Monto mensual, con precio anual fijo o un % de descuento sobre el anual. También puede ser «negociable» (sin monto). Solo informativo: sin cobro real (se hereda de SL-40 D4). Sin moneda propia hasta SL-21 (se hereda de SL-40 `design.md`). |
| 2026-10-27 | Periodo de órdenes | Ciclo desde la fecha de alta del plan en la empresa (alta el 15, ciclo del 15 al 14). |
| 2026-10-27 | ¿Una anulada libera cupo? | Sí: cuentan las creadas menos las anuladas en el ciclo. Se hereda de SL-40 D3. |
| 2026-10-27 | Usuarios | Tope por rol, cada uno opcional: un rol sin tope no tiene límite. |
| 2026-10-27 | Módulos y plan | El plan trae módulos incluidos. Al asignar o cambiar plan, los módulos se sincronizan solos (se encienden los incluidos y se apagan los no incluidos). El superadmin puede encender por excepción un módulo no incluido con el interruptor de SL-23. |
| 2026-10-27 | Bajar de plan | No se permite si la empresa ya usa más que algún tope del plan nuevo: el cambio se rechaza diciendo qué tope se pasa. |
| 2026-10-27 | Editar topes de un plan en uso | Aplica al momento a todas sus empresas. Si alguna ya pasa el nuevo tope, la edición se rechaza (misma regla que bajar de plan). |
| 2026-10-27 | Empresa sin plan | Sin límites: las empresas de hoy y las que cree el superadmin siguen igual hasta que se les asigne un plan. |
| 2026-10-27 | Pantalla | Ninguna en esta ficha: solo backend. Las pantallas van en SL-26. |
| 2026-10-27 | ¿Queda rastro? | Sí: crear, editar o archivar un plan y asignarlo a una empresa van a `historial_accion`. Se hereda de SL-23 y SL-36. |
| 2026-10-27 | Aislamiento | Los planes son de plataforma; la asignación y los conteos, por empresa. Se hereda de SL-17. |
| 2026-10-27 | Identificadores de la base | En español. Se hereda de SL-23 y SL-19 D5. |
| 2026-10-27 | ¿Seeds? | No: la app nace sin planes. Los tests crean los suyos. Se hereda de SL-17 D10. |
| 2026-10-27 | ¿Hace falta E2E? | Sí: es un flujo crítico de permisos. Se amplía el humo de dos empresas: una al tope de órdenes no puede crear una más. Se hereda de SL-23. |
| 2026-10-27 | ¿Librería? | Ninguna dependencia nueva. |
