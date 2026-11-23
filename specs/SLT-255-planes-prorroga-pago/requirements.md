# SLT-255 — planes-prorroga-pago · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** SLT-121 «Planes: plazo de pago de la factura y
> operación congelada por mora» (mergeada, #264) · **Rama** `feature/SLT-255-planes-prorroga-pago`
>
> **Alcance.** El superadmin da a una empresa un plazo de pago hasta una fecha, con motivo, desde Plataforma >
> Empresas. Si la empresa no está congelada, es una prórroga: la corrida de madrugada no la congela hasta pasada
> esa fecha, sin mover la fecha límite de sus facturas ni pausar su operación. Si ya está congelada, es el
> descongelamiento a mano de SLT-121 (R22, R23). La prórroga se puede alargar, acortar o quitar. El maestro y el
> admin ven «prórroga hasta X» en el banner, y el maestro recibe dos correos: uno al darla y otro un día antes de
> que venza.
>
> **Lo que NO entra.**
> - Prórroga por factura: la prórroga vale para toda la empresa.
> - Que la empresa pida la prórroga desde la app: la empresa la pide por fuera y el superadmin la registra.
> - Cambiar la gracia o la fecha límite de las facturas: sigue en SLT-121 (R3, R5).
> - Zona horaria por empresa: SLT-90 (rige la hora de la plataforma, CR).
>
> Sembrado por `/afinar-feature` el 2026-11-23. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó
> el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-23 | ¿Prórroga por empresa o por factura? | **Toda la empresa**: mientras dura, ninguna factura vencida la congela (humano). |
| 2026-11-23 | ¿Quién la inicia? | **Solo el superadmin**, en Plataforma > Empresas. La empresa la pide por fuera. Rol: heredado de SLT-121 R4 (humano). |
| 2026-11-23 | Tope de la fecha hasta | **De hoy a hoy + 60 días**, hora de la plataforma. Heredado de SLT-121 P4 (humano). |
| 2026-11-23 | Motivo | De 1 a 200 caracteres, guardado en `historial_accion` con la excepción a la regla de texto libre ya aceptada en SLT-121 P5, extendida a la prórroga. |
| 2026-11-23 | ¿Prórroga y descongelar a mano son la misma acción? | **La misma acción, «dar plazo hasta»**: si la empresa está congelada, la descongela (SLT-121 R22); si no, le da prórroga. En el historial son dos acciones distintas (humano). |
| 2026-11-23 | ¿Se puede cambiar o quitar? | **Sí**: alargar, acortar o quitar, con motivo. Quitada o vencida, si sigue el saldo vencido, la empresa se congela en la madrugada siguiente (SLT-121 R7, R8). Cada cambio queda en el historial (humano). |
| 2026-11-23 | Banner | Maestro y admin ven **«prórroga hasta X»** y que la operación se congela la madrugada siguiente a esa fecha si no paga. Reemplaza el aviso «se congela mañana» (humano). |
| 2026-11-23 | Correos | Al maestro: **al darla y un día antes de que venza** si sigue el saldo vencido. Salen por la cola y se reintentan, como SLT-121 R29 (humano). |
| 2026-11-23 | E2E | **Sí, uno corto**: factura vencida, luego prórroga, la madrugada no congela y se ve el banner; al vencer, se congela en la madrugada siguiente (humano). |
| 2026-11-23 | Ruta | Completa: permisos, cron de congelamiento, historial y correos. |
