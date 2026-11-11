# SLT-60 «Confirmación del pago a la plataforma por el superadmin»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-60 | confirmar-pago-plataforma | fullstack | high | feature/SLT-60-confirmar-pago-plataforma | Camilo (6ace53aa94bfd46ee6a600a5) | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 cerrado (2026-11-11): tarjeta asignada, rama publicada, worktree creado.
`/afinar-feature` cerrado (2026-11-11): `requirements.md` sembrado. Siguiente: F1.2 (`spec_author`), **cuando SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» esté en `done`** (depende de sus facturas).

## Evaluación
- zone `fullstack`: estado del pago y reparto entre facturas (base y servicio) + pantallas del superadmin en Empresas y de la wallet de la empresa.
- complexity `high`; ruta completa: toca dinero (deuda, caja, facturas) y exige E2E de «Dinero: wallet».
- Tamaño: los correos se separan a SLT-132 «Correos del pago a la plataforma».

## Decisiones
- 2026-11-11 (/afinar-feature): ver tabla en `specs/SLT-60-confirmar-pago-plataforma/requirements.md`. Board: SLT-60 con descripción nueva, `complexity:high` y dependencia de SLT-118; SLT-131 «Planes: el superadmin marca pagada la factura de un ciclo» cancelada (absorbida); ficha nueva SLT-132 «Correos del pago a la plataforma» (depende de SLT-60); SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora» cita SLT-60 en lugar de SLT-131.

## Preguntas abiertas
Ver `specs/SLT-60-confirmar-pago-plataforma/requirements.md > Preguntas abiertas` (reenviar tras un rechazo; pagos anteriores y saldo de las facturas).

## Tandas

## Modelos (overrides)

## Cierre
