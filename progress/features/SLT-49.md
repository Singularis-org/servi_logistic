# SLT-49 «Impresión de etiquetas por lote para la tienda»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-49 | etiquetas-lote-tienda | fullstack | medium | feature/SLT-49-etiquetas-lote-tienda | Carlos Restrepo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho (2026-10-28): tomada en Trello (member + En curso), worktree desde origin/dev.
Afinada con /afinar-feature (2026-10-28). Spec aprobado por Carlos (2026-10-28; P1 y P2 por defecto).
F2 hecha (2026-10-28): T1–T9 [x], gate local INIT_EXIT=0, E2E local verde. Bitácora: progress/impl_SLT-49.md.
Siguiente: reviewer.

## Evaluación
zone fullstack / complexity medium. Cupo fullstack: 1/3. Sin choque de archivos con lo en vuelo de Camilo (SL-20, SLT-32) a primera vista: toca `/ordenes` (listado, page) y `EtiquetaGuiaService`.

## Decisiones
- Alcance y decisiones cerradas: `specs/SLT-49-etiquetas-lote-tienda/requirements.md`.

## Preguntas abiertas
Ninguna.
