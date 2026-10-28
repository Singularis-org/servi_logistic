# impl_SL-33 — paleta-secundaria

> Bitácora del implementer. Spec: `specs/SL-33-paleta-secundaria/`. Worktree
> `.worktrees/SL-33-paleta-secundaria/`, rama `feature/SL-33-paleta-secundaria`.

## T0 — Traer `dev` (SL-9)

- `git merge origin/dev` sin conflictos (commit de merge `94969c2`).
- Presentes: `scripts/capturas-pwa.mjs`, `specs/SL-9-marca-pwa-capturas-iconos/` y la guardia.
- Nombre real de la guardia: `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`
  (coincide con «Archivos esperados»; no hace falta corregir la lista).
- Umbral actual: `UMBRAL_MARCA_ANTERIOR = 0.018` (< 1.8 %), con `UMBRAL_MARCA_NUEVA = 0.01`.
- Capturas en `public/screenshots/`: `ingreso-narrow.png`, `inicio-narrow.png`, `inicio-wide.png`
  (mismos nombres que la lista).
