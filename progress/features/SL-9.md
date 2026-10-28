# SL-9 «Capturas e iconos de la PWA con la marca nueva»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SL-9 | marca-pwa-capturas-iconos | frontend | low | feature/SL-9-marca-pwa-capturas-iconos | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 hecho el 2026-10-28: tarjeta asignada (`trello.mjs tomar`), rama publicada y worktree en
`.worktrees/SL-9-marca-pwa-capturas-iconos/`. Siguiente: F1.2 (spec), con `/afinar-feature` ofrecido
antes por las preguntas abiertas.

## Evaluación
- zone `frontend`: solo toca `public/` (capturas, iconos) y su uso en UI; sin DB ni API.
- complexity `low`: pocos archivos, sin lógica condicional.
- Cupo: frontend 1/2 tras tomarla. Dependencia SL-8 en `done`.
- Superficie vista en F1.0:
  - `public/screenshots/{inicio-narrow,ingreso-narrow,inicio-wide}.png`, citadas en
    `public/manifest.json` (líneas 44-58) y en `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`.
  - `public/icons/icono_{envios,entregadas,wallet,transacciones}.png`, usados en
    `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`.
  - Fuente de los iconos de la app: `public/icons/fuente/icon-{any,maskable}.svg`.
- Cruce de archivos: pendiente de `archivos-en-vuelo.mjs` cuando exista `tasks.md`.

## Decisiones

## Preguntas abiertas
- Qué pantallas y con qué datos se capturan para `public/screenshots/` (humano).
- Los `icono_*.png` de UI: ¿se redibujan con la marca nueva, se cambian por iconos de la librería
  de iconos ya aprobada, o se entregan como assets de diseño? (humano).

## Tandas

## Modelos (overrides)

## Cierre
