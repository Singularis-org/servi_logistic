# SL-12 — Tareas: fuera los backfills de Ordenex

> Un commit por tarea (`docs/conventions.md > Commits`). Toda la ficha la hace `backend_dev`.
> Precondición: SL-10 integrada en `dev` y la rama nace de ese `dev` (`design.md > Trampas`).

- [x] **T0 — Rebase sobre SL-10.** La rama parte del `dev` que ya incluye SL-10.
  **Hecho:** `git merge-base --is-ancestor <commit de SL-10> HEAD` responde 0, y `./init.sh` en el
  worktree termina con código 0 antes de tocar nada.

- [x] **T1 — Guardia de retirada, en rojo primero** (R1, R2, R3, R4, R11; D5). Depende de T0.
  Escribir `tests/unit/guards/backfills-retirados.guardia.test.ts` con sus tres casos y su
  autocomprobación.
  **Hecho:** sobre el árbol todavía sin borrar, la guardia sale en rojo y nombra los tres scripts,
  los cinco tests y las citas de D2, D3 y D4. Su autocomprobación sintética pasa. El rojo se anota
  en el informe. La guardia se commitea junto con T2, para que ningún commit de la rama la deje en
  rojo.

- [x] **T2 — Borrar los scripts y sus tests** (R1, R3; D1). Depende de T1.
  Borrar los tres `scripts/backfill-*.ts` y los cinco tests de D1.
  **Hecho:** `git status` muestra exactamente ocho borrados y `pnpm run typecheck` está en verde.

- [x] **T3 [P] — Acotar `backfill-guards`** (R6, R7; D2). Depende de T2.
  **Hecho:**
  - `pnpm exec vitest run tests/unit/analytics/backfill-guards.test.ts` está en verde;
  - mutación: añadir `import { AnaliticaBackfillService } from "@/lib/services/AnaliticaBackfillService"`
    a `lib/services/AnaliticaOperativaService.ts` pone en rojo el caso «un consumidor externo solo
    puede importar el planificador puro» (R7). Se revierte y se anota en el informe.

- [x] **T4 [P] — Acotar `caja-173-alcance`** (R5; D3). Depende de T2.
  **Hecho:**
  - `pnpm exec vitest run tests/unit/guards/caja-173-alcance.guardia.test.ts` está en verde;
  - mutación: nombrar `ingreso_cod_recaudado` en código de un archivo nuevo de `scripts/` pone en rojo
    el caso «CIERRE de la lista». Se revierte y se anota.

- [x] **T5 [P] — Comentarios sin ruta** (R4, R8; D4). Depende de T2.
  Reescribir el comentario de `lib/geo/fallo-config-geocode.ts:42` y el de
  `tests/unit/analytics/cache-invalidacion-backfill.test.ts:128`.
  **Hecho:**
  - el diff de esos dos archivos solo cambia líneas de comentario;
  - `pnpm exec vitest run tests/unit/geo/fallo-config-geocode.test.ts tests/unit/analytics/cache-invalidacion-backfill.test.ts`
    está en verde.

- [x] **T6 — Guardia de retirada en verde** (R1–R4, R11). Depende de T3, T4 y T5.
  **Hecho:**
  - `pnpm exec vitest run tests/unit/guards/backfills-retirados.guardia.test.ts` está en verde;
  - mutación: restaurar `scripts/backfill-marcador-config-geocode.ts` con
    `git checkout HEAD~<n> -- <ruta>` la pone en rojo nombrando el archivo. Se revierte y se anota.

- [x] **T7 — `docs/limpieza-ordenex.md`** (R13; D7). Depende de T2.
  **Hecho:** la fila «Backfills de Ordenex» dice «Hecho (SL-12)» y nombra la comprobación de
  migraciones. Ninguna otra línea del documento cambia.

- [x] **T8 — Gate de cierre** (R8, R9, R10, R12, R14). Depende de T1 a T7, todos commiteados.
  **Hecho:**
  - `./init.sh` en el worktree termina con código 0, con log a archivo e `INIT_EXIT=$?` dentro;
  - `pnpm exec vitest run tests/unit/guards/test-citado-desaparecido.guardia.test.ts` está en verde
    con el borrado ya commiteado, y `git diff dev...HEAD` no añade ningún `@test-desaparecido` (R12);
  - `git diff --name-only dev...HEAD`:
    - no contiene ninguna ruta de `specs/` fuera de `specs/SL-12-fuera-backfills-ordenex/`, ni
      ninguna de `arnes.manifest` (R10);
    - no contiene ninguno de los seis scripts hermanos (R9);
    - de los módulos de `lib/` de «Lo que NO entra», solo contiene `lib/geo/fallo-config-geocode.ts`,
      y con cambios únicamente en comentarios (R8);
  - informe en `progress/impl_SL-12.md` con el mapa `R<n> → test` y las tres mutaciones.

## Trazabilidad

| Req | Test o comprobación |
|---|---|
| R1 | `tests/unit/guards/backfills-retirados.guardia.test.ts` › caso 1 |
| R2 | `tests/unit/guards/backfills-retirados.guardia.test.ts` › caso 3 |
| R3 | `tests/unit/guards/backfills-retirados.guardia.test.ts` › caso 2 |
| R4 | `tests/unit/guards/backfills-retirados.guardia.test.ts` › caso 2 |
| R5 | `tests/unit/guards/caja-173-alcance.guardia.test.ts` › «ningun modulo de la 173 nombra un insumo» y «CIERRE de la lista» |
| R6 | `tests/unit/analytics/backfill-guards.test.ts` › «las tres rutas censadas existen» y los casos R2–R33 |
| R7 | `tests/unit/analytics/backfill-guards.test.ts` › «un consumidor externo solo puede importar el planificador puro», más la mutación de T3 |
| R8 | corrida T8: el diff contra la rama de integración; los tests de `lib/` de «Lo que NO entra» siguen en verde |
| R9 | corrida T8: el diff contra la rama de integración |
| R10 | corrida T8: el diff contra la rama de integración, cruzado con `arnes.manifest` |
| R11 | `tests/unit/guards/backfills-retirados.guardia.test.ts` › casos 1 y 2, más la mutación de T6 |
| R12 | `tests/unit/guards/test-citado-desaparecido.guardia.test.ts`, corrida en T8 con el borrado commiteado |
| R13 | corrida T7: el diff de `docs/limpieza-ordenex.md` |
| R14 | corrida T8: el log del worktree termina con código 0 |

## Archivos esperados

- `scripts/backfill-analitica.ts`
- `scripts/backfill-caja-tesoreria.ts`
- `scripts/backfill-marcador-config-geocode.ts`
- `tests/unit/scripts/backfill-analitica-cli.test.ts`
- `tests/unit/scripts/backfill-analitica-invalidacion.test.ts`
- `tests/unit/scripts/backfill-caja-tesoreria-cli.test.ts`
- `tests/unit/scripts/backfill-marcador-config-geocode-cli.test.ts`
- `tests/integration/db/backfill-marcador-config-geocode.test.ts`
- `tests/unit/guards/backfills-retirados.guardia.test.ts`
- `tests/unit/analytics/backfill-guards.test.ts`
- `tests/unit/guards/caja-173-alcance.guardia.test.ts`
- `tests/unit/analytics/cache-invalidacion-backfill.test.ts`
- `lib/geo/fallo-config-geocode.ts`
- `docs/limpieza-ordenex.md`
- `progress/impl_SL-12.md`
- `specs/SL-12-fuera-backfills-ordenex/requirements.md`
- `specs/SL-12-fuera-backfills-ordenex/design.md`
- `specs/SL-12-fuera-backfills-ordenex/tasks.md`
