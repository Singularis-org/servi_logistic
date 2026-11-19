# SLT-215 — planes-niveles-beneficio · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-215-planes-niveles-beneficio
>
> **Alcance:** niveles de beneficio por volumen de órdenes en cada plan: modelo y migración,
> paso «Niveles» en el formulario del plan (crear y editar, por cambio programado) y columna en
> la tabla de planes del superadmin; cierre mensual que calcula el nivel de cada empresa,
> con historial de subidas y bajadas.
>
> **Lo que NO entra:** el descuento en el cobro de cada orden, la factura y «Mi plan»
> (SLT-216), incluido el ajuste de órdenes ya cobradas cuando un cierre corre tarde; zona horaria
> por empresa (SLT-90); fijar un nivel a mano (no se hace).
>
> Sembrado por `/afinar-feature` el 2026-11-19. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no
> los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)
_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas
- Hora exacta del cron diario.
- Límite de niveles por plan, si hay alguno práctico (la ficha dice 0..N).

## Decisiones cerradas (no reabrir)
| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-19 | Niveles | 0..N por plan; cada uno con meta mensual de órdenes efectivas y descuento en % o monto fijo, nunca los dos; acumulables sobre el cobro base (200 → nivel 2 con 10 %+10 % = 160). Empresas sin plan, sin niveles. |
| 2026-11-19 | Órdenes efectivas | Del mes, con cargo de plataforma vigente (sin canceladas, anuladas ni reversadas). |
| 2026-11-19 | Subir | Al cerrar el mes, directo al nivel más alto cumplido; rige desde el día 1 del mes siguiente. |
| 2026-11-19 | Bajar | 1 nivel tras 2 meses seguidos sin cumplir la meta del nivel actual; un mes que cumple reinicia la cuenta. |
| 2026-11-19 | Historial | Se registra cada inicio de nivel con fecha y motivo. |
| 2026-11-19 | Editar niveles / cambiar de plan | Por cambio programado (SLT-135); al recibirlo, el nivel se recalcula con el último mes cerrado y las metas nuevas. |
| 2026-11-19 | Zona del cierre | La misma que usa hoy el período de facturación; se mueve con SLT-90. |
| 2026-11-19 | Entrada a mitad de mes | Cuenta normal: órdenes desde su entrada contra la meta completa. |
| 2026-11-19 | Nivel manual | No; solo automático. |
| 2026-11-19 | Cierre fallido | Cron diario idempotente: cierra en orden los meses pendientes y nunca repite uno. Aunque se calcule tarde, el nivel rige desde el día 1; ajustar lo ya cobrado es de SLT-216. |
| 2026-11-19 | Pantalla | En esta ficha: paso «Niveles» en el formulario del plan (como «Beneficios» de SLT-214) y columna en la tabla. |
| 2026-11-19 | Tamaño | ~50 archivos; un PR sobre el tope (humano). |
| 2026-11-19 | Ruta | Completa: dinero, migración y cron. |
