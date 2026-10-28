# SL-9 «Capturas e iconos de la PWA con la marca nueva»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SL-9 | marca-pwa-capturas-iconos | frontend | low | feature/SL-9-marca-pwa-capturas-iconos | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.1 desde el 2026-10-28. Spec `specs/SL-9-marca-pwa-capturas-iconos/` (R1–R17, commit `eab96b1`)
aprobado por escrito por Camilo («aprobado», 2026-10-28). La tarjeta sigue en «En revisión»:
`trello.mjs mover` no mueve de spec_ready a in_progress; la mueve el humano.
F2.0 (`archivos-en-vuelo.mjs --candidata SL-9`, 2026-10-28): sin conflicto con 4 features en vuelo.

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
- 2026-10-28: acotada con `/afinar-feature`; decisiones en
  `specs/SL-9-marca-pwa-capturas-iconos/requirements.md > Decisiones cerradas`. Descripción de la
  tarjeta actualizada en Trello.

## Preguntas abiertas
Ninguna.

## Tandas

## Modelos (overrides)

## Cierre
