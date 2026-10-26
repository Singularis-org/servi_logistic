# SL-23 — catalogo-modulos · requirements.md

> **Zona:** fullstack · **Complejidad:** high · **depends_on:** SL-17 · **Rama:** `feature/SL-23-catalogo-modulos`
>
> **Alcance:** catálogo fijo de módulos apagables y tabla de módulos activos por empresa. El
> superadmin los enciende y apaga desde el detalle de la empresa en `/plataforma/empresas`, con
> rastro en `historial_accion`. Un módulo apagado se oculta en el menú, da 404 por URL directa,
> se rechaza en la server action y en la API (403 `modulo_inactivo`), y sus jobs y crons se saltan.
>
> **Lo que NO entra:**
> - Planes y límites → SL-24.
> - Registro de empresas en autoservicio → SL-25.
> - El resto del panel de superadmin → SL-26.
> - Que el maestro apague módulos de su propia empresa → sin ficha; hoy no se quiere.
>
> Sembrado por `/afinar-feature` el 2026-10-26. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Reparto exacto de cada ruta, action, job y cron entre los 9 módulos. Por ejemplo, dónde cae
  `corte-diario` o `procesar-devueltas-sla`. `spec_author` propone una tabla en `design.md` y el
  humano la aprueba al revisar el spec.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-26 | ¿Qué se puede apagar? | 9 módulos apagables: Analítica; Monitoreo; Recolección; Bodegas satélite (`/recepcion-satelite`, `/mi-bodega`); Wallet y cierres (`/wallet`, `/mi-wallet`, `/cierre-dia`, `/cierres-admin`); Ranking; Incidentes y novedades; WhatsApp (chat, plantillas, envíos automáticos, histórico de conversaciones); API e integraciones (API keys, webhooks, carga por API). El núcleo nunca se apaga: Inicio, Órdenes, Entregas, Usuarios, Tarifas y Ayuda. |
| 2026-10-26 | ¿El catálogo crece sin desarrollo? | No. Un módulo nuevo exige código, así que el catálogo es cerrado y vive en el código. Solo la activación por empresa va a la base. |
| 2026-10-26 | ¿Quién enciende y apaga? | Solo el superadmin, validado en el service con test. El maestro no puede. Se hereda de SL-40: la excepción por empresa la escribe solo el superadmin. |
| 2026-10-26 | ¿Con qué módulos nace una empresa? | Las empresas que existen al desplegar quedan con todo encendido (lo hace la migración). Las que se creen después nacen solo con el núcleo. |
| 2026-10-26 | ¿Cómo se guarda «activo»? | Una fila por empresa y módulo; sin fila, el módulo está apagado. Se hereda de SL-38 y SL-36. |
| 2026-10-26 | ¿Qué pasa al apagar un módulo? | Los datos no se borran y vuelven al reencender. Los jobs pendientes del módulo se descartan sin error, pero queda registro. |
| 2026-10-26 | ¿Qué ve quien entra por URL a un módulo apagado? | Un 404. |
| 2026-10-26 | ¿Y la API con el módulo «API e integraciones» apagado? | Responde 403 con código `modulo_inactivo` y no se envían webhooks salientes. |
| 2026-10-26 | ¿Queda rastro de los cambios? | Sí: cada encendido o apagado va a `historial_accion` (quién, cuándo, qué módulo). Se hereda de SL-36. |
| 2026-10-26 | Identificadores de la base | En español. Se hereda de SL-19 D5 y SL-36. |
| 2026-10-26 | ¿Seeds? | No. Los tests crean su organización. Se hereda de SL-17 D10. |
| 2026-10-26 | ¿Hace falta E2E? | Sí, porque es un flujo crítico de permisos. Se amplía el humo de dos empresas: una con un módulo apagado, que no lo ve en el menú y recibe 404. Se hereda de SL-17 D18/D19. |
| 2026-10-26 | ¿Librería? | Ninguna dependencia nueva. |
