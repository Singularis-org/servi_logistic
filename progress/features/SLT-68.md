# SLT-68 «Incentivo manual a un mensajero en la wallet»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-68 | incentivo-manual-mensajero | fullstack | medium | feature/SLT-68-incentivo-manual-mensajero | Carlos Restrepo | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2: aprobado 2026-10-30 («dale aprobado»), implementación en curso. Hotfix: rama base prod, PR a prod.

## Evaluación
zone fullstack / complexity medium. Hoy no hay forma de registrar un incentivo libre:
- `premio_ranking` (feature 293) solo para el podio, monto fijado por el ranking;
- `pago_a_mensajero` (categoría `liquidacion`) liquida deuda: usarlo como incentivo deja la cuenta por pagar en negativo y no baja la ganancia;
- `ajuste_devengo` existe en el enum pero solo lo emiten las anulaciones.

## Decisiones
- 2026-10-30 (Carlos): «dale aprobado» — Q1 último cierre aprobado; Q2 sí se anula aunque esté pagado; Q3 sin historial_accion en el hotfix.
- 2026-10-30 (Carlos): prioritaria y urgente, antes que EP-8 («lo necesitan urgente», salida a producción).
- 2026-10-30 (Carlos, por el borrador aprobado): maestro y admin; monto y motivo obligatorios, fecha; suma a la cuenta por pagar del mensajero y baja la ganancia; categoría propia «Incentivo»; anulable con contraasiento.

## Preguntas abiertas

## Tandas
- 2026-10-30 · A (T0–T9, datos y servidor) · 3a2d5567 · typecheck rojo solo en 3 rótulos de UI (tanda B); tests de la tanda 205/205; `vitest related` con rojos de entorno clasificados en `progress/impl_SLT-68.md`.
- 2026-10-30 · B (T10–T14, pantalla, catálogo y E2E) · 83e5ba1e · `./init.sh` INIT_EXIT=1 solo por entorno/preexistentes (caja-backfill, indices-rutas-calientes, `.prisma/client` transitorio; guardia 420 igual que en prod); typecheck y lint verdes; E2E R22 4/4.

## Modelos (overrides)
Subagentes en Opus.

## Cierre
