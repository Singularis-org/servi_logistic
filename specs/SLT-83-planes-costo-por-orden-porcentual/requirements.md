# SLT-83 — Planes: costo por orden porcentual sobre el valor del paquete

> **Zona** fullstack · **Complejidad** high · **depends_on** SLT-66, SL-40 ·
> **Rama** `feature/SLT-83-planes-costo-por-orden-porcentual`
>
> **Alcance.** El costo por orden de un plan tiene dos modos: **fijo** (el de SLT-66, cobrado al crear la
> orden) o **porcentual**: un % sobre `orden.monto_cobrar`, con un mínimo opcional que hace de piso
> (se cobra el mayor de los dos). En modo porcentual el cargo sale cuando la orden llega a un estado final, con el `monto_cobrar`
> de ese momento y las condiciones del plan congeladas al crearla. Se revierte si la orden sale del estado
> final o se anula. Entra el formulario del plan, el catálogo, el modal de asignación, «Mi plan», el
> detalle de empresa y la columna «Cobro por orden» del listado de Empresas.
>
> **Lo que NO entra.** Un valor global porcentual (el global sigue siendo solo fijo). Una excepción por
> empresa porcentual (sigue siendo solo fija). Un campo nuevo de «valor declarado» en la orden. El cobro
> real del costo base (sigue fuera, como en SLT-66). Ninguna de estas tiene ficha: no se pidieron.
>
> Sembrado por `/afinar-feature` el 2026-11-04. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-04 | ¿Sobre qué valor se calcula el %? | Sobre `orden.monto_cobrar` (el contra entrega). No se crea un campo de valor declarado. |
| 2026-11-04 | ¿Qué hace el mínimo? | Es opcional y es un **piso**: se cobra el mayor entre el % y el mínimo. Ejemplo con 2 % y mínimo 500: `monto_cobrar` 10.000 cobra 500; 100.000 cobra 2.000; 0 o vacío cobra 500. Sin mínimo, el piso es 0. Nunca cae al valor global. (Primero se decidió «solo cuando el monto es 0»; el humano lo cambió el mismo día.) |
| 2026-11-04 | ¿El global o la excepción pueden ser porcentuales? | No. Solo el plan. Prioridad sin cambios: excepción > plan > global > 0 (SLT-66 R12). Con excepción, el modo % del plan no aplica y se cobra al crear, como hoy. |
| 2026-11-04 | ¿Cuándo sale el cargo en modo %? | Cuando la orden entra a un estado final (`ESTADOS_TERMINALES`: `entregado`, `devuelta_a_tienda`, `incidente`), no al crearla. Se cobra igual si no se entregó (devuelta o incidente). El modo fijo sigue cobrando al crear (SLT-66 R12). |
| 2026-11-04 | ¿Qué plan define el cargo? | El vigente al **crear** la orden: modo, % y mínimo se congelan en la orden. Al estado final se aplican sobre el `monto_cobrar` de ese momento. Un cambio de plan posterior no la afecta (hereda el espíritu de SLT-66 R15). |
| 2026-11-04 | ¿Una orden anulada (`deleted_at`) se cobra en modo %? | No. Si se anula sin cargo, no se registra nada. Si ya tenía cargo, se revierte, como SL-40 R15. Si se recupera, espera su estado final (o se recobra si ya está en uno). |
| 2026-11-04 | ¿Y si la orden sale del estado final (corrección, reversión de incidente)? | Reverso del cargo. Al volver a entrar a un estado final se cobra de nuevo con el `monto_cobrar` de ese momento. |
| 2026-11-04 | Rango y redondeo | % mayor que 0 y como mucho 100, con 2 decimales. Cargo en decimal exacto, redondeado a 2 decimales, mitad hacia arriba (2,35 % de 12.345 = 290,11). Mínimo ≥ 0, `DECIMAL(12,2)`. |
| 2026-11-04 | Impuestos | Heredado de SLT-66 R14: el cargo de fuente `plan` no lleva impuestos ni descuento anual. |
| 2026-11-04 | ¿Qué muestra «Mi plan» con plan porcentual? | Costo base, el % y el mínimo, y lo cobrado de verdad en el ciclo. Total = base + cargos registrados hasta hoy. Las órdenes del ciclo aún sin estado final se muestran como conteo aparte, sin estimar. El detalle de empresa del superadmin muestra lo mismo (SLT-66 R18). |
| 2026-11-04 | ¿Cuándo tiene «costo concreto» un plan porcentual? | Heredado de SLT-66 R28: costo base de forma «monto» y un % definido. El mínimo no es obligatorio. |
| 2026-11-04 | Quién configura | Heredado de SL-24 R5: solo el superadmin. Validado en el service. |
| 2026-11-04 | Wallet y caja | Heredado de SLT-66 R17: cargos y reversos de fuente `plan` entran a la deuda de la wallet; ninguna cifra de la caja cambia. |
| 2026-11-04 | ¿Hace falta E2E? | Sí: mueve importes (`docs/checkpoints-proyecto.md > Flujos criticos`). |
| 2026-11-04 | ¿Librería nueva? | No. |
