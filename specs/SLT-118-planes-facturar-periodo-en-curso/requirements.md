# SLT-118 — planes-facturar-periodo-en-curso · requirements.md

> **Título actual de la ficha:** «Planes: factura por empresa y período con la cuota y las órdenes»
> (el slug y la rama conservan el nombre original).
>
> **Zona:** backend · **Complejidad:** high · **Ruta:** completa (dinero, esquema y migración) · **depends_on:** — · **Rama:** feature/SLT-118-planes-facturar-periodo-en-curso
>
> **Alcance.** Una factura por empresa y período de cobro: estado de cuenta interno que junta la
> cuota del plan (uso de la plataforma) y los cargos y reversos de las órdenes del período (el
> detalle por orden ya existe en la traza de SLT-85). Un proceso automático la cierra al terminar
> cada período, registra la cuota y la suma a la deuda de la empresa con la plataforma.
>
> **Lo que NO entra.** Las pantallas de facturas del superadmin y del maestro → SLT-119 (después de
> SLT-99). La corrección única del 1–15 tras asignar los primeros planes → SLT-120, que depende de
> esta. Factura electrónica (Hacienda), impuestos y moneda → SL-21. Avisos por correo al cerrar.
> Zona horaria de cada empresa → SLT-90.
>
> Sembrado por `/afinar-feature` el 2026-11-10. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
- Numeración propia de la factura (formato y si es por empresa o global).
- Cómo se registra la cuota en la deuda sin `orden_id` (tabla o movimiento nuevo) respetando que los
  cargos solo los escriban triggers o funciones del dueño (guardia `cobro-plataforma-solo-por-trigger`).

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-10 | ¿Qué es la factura? | Estado de cuenta interno por empresa y período, sin impuestos ni envío a Hacienda (SL-21). |
| 2026-11-10 | ¿Cuándo se cierra y se cobra la cuota? | Automáticamente al terminar el período de cobro de la empresa (p. ej. el 16 a las 00:00 cierra el 1–15). Mientras está abierto, se lee como factura en curso con total parcial. |
| 2026-11-10 | ¿La cuota suma a la deuda? | Sí: al cerrar, la cuota entra a la deuda con la plataforma, que la empresa paga desde la wallet como hoy. |
| 2026-11-10 | Reversos | Cada cargo o reverso va en la factura del período en que ocurrió; una factura cerrada no cambia. |
| 2026-11-10 | Empresa sin plan | Tiene factura mensual con los cargos de sus órdenes y sin cuota. |
| 2026-11-10 | Quién ve | Superadmin todas, maestro las de su empresa; nadie edita. Las pantallas van a SLT-119. |
| 2026-11-10 | Aviso al cerrar | No por ahora. |
| 2026-11-10 | Detalle por orden | Se reutiliza la traza de SLT-85 (plan, tipo de cobro, período, valor cobrado, guía); no se duplica. |
| 2026-11-10 | Período, tramos y zona | Heredados de SLT-86 (período de calendario por tipo de cobro; costo del período por tramos) y hora de la plataforma (CR) hasta SLT-90. |
| 2026-11-10 | Partición | Datos y cierre aquí; pantallas (SLT-119) y corrección del 1–15 (SLT-120) en fichas nuevas. |
| 2026-11-10 | ¿E2E? | Diferido a SLT-119 (aquí no hay UI); aquí, tests de integración con base del cierre y la deuda. |
