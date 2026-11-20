# SLT-132 — correos-pago-plataforma · requirements.md

> **Zona:** fullstack · **Complejidad:** medium · **depends_on:** SLT-60 · **Rama:** `feature/SLT-132-correos-pago-plataforma`
>
> **Alcance:** avisos del flujo de pago a la plataforma.
> - Al **superadmin**, un correo por pago apenas una empresa registra un pago por confirmar:
>   empresa, monto, fecha, referencia y enlace a la empresa en Plataforma.
> - Al **maestro** de la empresa, por correo y en la campanita:
>   - cuando el superadmin confirma su pago, con las facturas a las que se aplicó (SLT-60);
>   - cuando la plataforma registra un pago hecho por fuera, con las facturas a las que se aplicó
>     (SLT-143);
>   - cuando la plataforma anula un pago confirmado, con el motivo (SLT-143).
>
> **Lo que NO entra:**
> - El correo y el aviso de rechazo → SLT-142 «Rechazo del pago a la plataforma y su estado en la
>   wallet», que reutiliza la plantilla de esta ficha.
> - Resumen diario al superadmin: no se hace.
>
> Sembrado por `/afinar-feature` el 2026-11-20. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-20 | Correo de rechazo | Pasa a SLT-142, que reutiliza la plantilla de esta ficha (humano). |
| 2026-11-20 | Pago por fuera y anulación (pendiente de SLT-143, P7) | Entran los dos (humano). |
| 2026-11-20 | Aviso al superadmin | Un correo por pago, sin resumen diario (humano). |
| 2026-11-20 | Canal del maestro | Correo y campanita; el superadmin, solo correo (humano). |
| 2026-11-20 | Destinatarios, envío y fallos | Heredado de SLT-136: los maestros de la empresa; el envío va por la cola de trabajos y un fallo del correo no afecta al pago. |
| 2026-11-20 | Remitente, plantilla y moneda | Heredado: `SMTP_FROM`, la plantilla con la marca (`plantilla-marca.ts`) y la moneda de los planes (SL-21, `MONEDA_DE_LOS_PLANES`). |
