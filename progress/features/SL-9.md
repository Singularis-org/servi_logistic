# SL-9 «Capturas e iconos de la PWA con la marca nueva»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SL-9 | marca-pwa-capturas-iconos | frontend | low | feature/SL-9-marca-pwa-capturas-iconos | Camilo | done |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
Cerrada el 2026-10-28 (F2.6). Ver «Cierre».

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
- **Resumen:**
  - Las tres capturas de la PWA están regeneradas con la marca nueva por `scripts/capturas-pwa.mjs`, que se puede volver a correr.
  - Los cuatro `icono_*.png` de `KpisMensajero` se sustituyeron por iconos de `lucide-react` sobre `bg-accent`, y se borraron.
  - El brillo morado de esas tarjetas pasó a `brand-soft`.
  - La guardia `marca-pwa-capturas-iconos` vigila las capturas y que esos iconos no vuelvan.
  - Revisión: vuelta 1 rechazada (R8 y R10 sin test) y vuelta 2 aprobada.
- **PR:** https://github.com/Singularis-org/servi_logistic/pull/31, mergeado en `dev` el 2026-10-28 con merge normal (`05e0bd6`). `gate-completo` en verde en el run 40765387464, tras corregir el rojo de la guardia SL-34 (`0bfcc01`).
- **Tarjeta:** movida a «Finalizado», con el enlace al PR comentado.
- **Baseline de rojos:** el run final dio 246 rojos, todos en el baseline de 246. No había nada que podar.
- **Worktree y grafo:** `wt.sh done` no pudo desmontar el worktree (archivo en uso en Windows). Se borró a mano, con `git worktree prune` y la rama local borrada. El proyecto se borró del grafo.
- **Deudas que deja:**
  - Volver a correr las capturas y bajar el umbral tras SL-33 (en curso: SL-33, T8).
  - D24: el `.env` local apunta al Supabase de origen.
  - D25: un id de recurso de origen quedó en el historial de `dev`.
