# SLT-63 «Recolección recibida en central sigue a nombre del mensajero»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-63 | recoleccion-recibida-libera-mensajero | backend | medium | feature/SLT-63-recoleccion-recibida-libera-mensajero | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4: spec APROBADO 2026-10-30 (comentario en la tarjeta). En espera: Carlos pide terminar EP-8 primero.

## Evaluación
zone backend / complexity medium. Nace de las dudas del cliente del 2026-10-30 sobre Analítica y Monitoreo.
Evidencia con datos de prod: progress/verificacion-analitica-monitoreo-2026-10-29.md (en dev local, sin commitear).
Cupo: fichas propias en vuelo SLT-62/63/64; sin cruce declarado con fichas de otra persona.

## Decisiones
- 2026-10-30 (Carlos): spec aprobado con las decisiones por defecto. Q1 = (a) migración de datos con down.sql.
- 2026-10-30 (Carlos): «arreglemos todo eso». Arreglo mínimo de lo evidenciado: que la recolección recibida en central aparezca en «Reasignables» y no cuente en Monitoreo del mensajero.

## Preguntas abiertas
Mecanismo (liberar asignación al recibir vs ajustar predicados): lo propone el spec con alternativa descartada.

## Tandas

## Modelos (overrides)
Subagentes en Opus (memoria: Fable agotado).

## Cierre

## 2026-10-31 — hotfix urgente a prod
- Carlos: «necesito que solucionemos urgentemente la 63 y el efecto de monitoreo, y necesito que
  arregles las ordenes que están así, no lo podemos dejar como deuda». Sale como HOTFIX.
- Rama `hotfix/SLT-63-recoleccion-recibida-libera-mensajero` desde `origin/prod` (603aad68),
  worktree `.worktrees/SLT-63-hotfix`. La rama vieja `feature/SLT-63-…` (base dev) queda sin uso.
- Spec: Q1 cerrada = (a) (D2); añadidos R11/R12 (migración y su down). Timestamp de la migración
  movido a `20261031120000` (el `20261030120000` ya lo usa `incentivo_mensajero_enums` de SLT-68).
- Tarjeta movida a En curso con la cita como aprobación escrita.

## 2026-10-31 — implementación (hotfix)
- T1–T6 commiteadas en `hotfix/SLT-63-…`. Bitácora: `progress/impl_SLT-63.md`.
- 138/R18 acotado (solo devolución), 259/R10 acotado (cuenta hasta la recepción central).
- Gate local INIT_EXIT=1 por entorno: a la base del .env le falta la migración de SLT-68. Los 3 rojos pasan contra `servi_slt63`. Detalle en la bitácora.
- Pendiente de decidir: entrada nueva en la lista blanca de `asignado-at-solo-lectura.guardia` para la migración de SLT-63 (escribe solo NULL).
