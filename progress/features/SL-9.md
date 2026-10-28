# SL-9 «Capturas e iconos de la PWA con la marca nueva»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SL-9 | marca-pwa-capturas-iconos | frontend | low | feature/SL-9-marca-pwa-capturas-iconos | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F2.2 (review) desde el 2026-10-28; F2.1 hecha (T1–T7). Spec `specs/SL-9-marca-pwa-capturas-iconos/` (R1–R17, commit `eab96b1`)
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
- 2026-10-28: el gate lo lleva GitHub CI (`gate-completo`); sin `./init.sh` local por tanda.
- 2026-10-28: capturas con `pnpm dev -p 3044` y solo la `DATABASE_URL` local; no se usa el `.env`
  del worktree principal (su proyecto Supabase está sin confirmar).
- 2026-10-28: umbral de la marca anterior < 1.8 % y navy `asfalto-9` a SL-33 (`design.md > D2`).
  Al cerrar SL-33, volver a correr `scripts/capturas-pwa.mjs`.

## Preguntas abiertas
Ninguna.

## Tandas
- 2026-10-28 · T1–T3 · `e11a698`, `624a1b0` · tests tocados en verde; sin `./init.sh` (gate en CI).
- 2026-10-28 · T4–T7 · `920b8e7`, `11a3bcc`, `17a634b`, `105033e` · 123/123 tests tocados + guardia
  nueva en verde; push hecho.

## Modelos (overrides)

## Cierre
