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

## T1 — Guardia nueva, en rojo

Archivo creado: `tests/unit/guards/paleta-secundaria.guardia.test.ts` (54 casos). Lee con
`token()`, `paleta()`, `tokenAlImprimir()` y `reglasDe()` de los fixtures; mide con `contraste()` y
`componer()` de `tests/fixtures/contraste.ts`.

El worktree no tiene `node_modules` enlazado: `pnpm exec vitest` no encuentra el binario. Se corrió
el `vitest`, `tsc` y `eslint` del checkout principal (`node ../../node_modules/...`) con el
worktree como cwd.

Salida (`vitest run tests/unit/guards/paleta-secundaria.guardia.test.ts`):

```
Test Files  1 failed (1)
     Tests  23 failed | 31 passed (54)
```

Rojos, todos por valor:
- R1 (claro, papel, impresión) y R2 (`.dark`, `.tema-sistema`): los 20 `--chart-N` son los viejos.
- R3 claro: 9 pares bajo 3:1 (p. ej. `#84cc16` 1.84). `.dark` y `.tema-sistema`: `#1a56db` 2.76 s/ tarjeta.
- R4 chart-5/7/11/12: no hay `--color-chart-{5,7}-soft` ni `-strong` de esos índices; los de 11/12 no son `componer()`.
- R5: `COLOR_SEGMENTO`/`VARIANTE_CONTADOR` siguen en 6/11/12/13 y `badge.tsx` no tiene `chart5`/`chart7`.
- R7: 23 tokens grises fuera de `stone`. R9: 33 declaraciones con azulados.
- R8: solo las dos filas de la excepción de `asfalto-2` (1.31 y 1.22 frente a 1.26 y 1.17 fijas).
- R11: `asfalto-9` es `#0d2444`. R13: faltan las dos tablas en `docs/marca.md`.
- R17: 17 fallos en `offline.html`. R18: cuerpo y botón (3.18). R19: pin y tramo `#f26419` (2.77 s/ tierra, 1.63 vs ruta).
- R20: 25 archivos con HEX de SL-8 D5.

Verdes reales, legítimos: R6 (los segmentos actuales ya pasan 3:1 sobre la pista), R8 salvo la
excepción (los valores aún no cambian, así que «después ≥ antes» se cumple), R10, R12, R16 y el
suelo del recorrido de R20 (2.866 archivos de texto).

Typecheck (`tsc --noEmit`): exit 0, 0 errores. ESLint sobre el archivo: exit 0.

### Diferencias de cifras, spec frente a fixture

| Dónde | Par | Spec | Fixture |
|---|---|---|---|
| D2 | `--chart-12` oscuro `#facc15` s/ tarjeta `#1C1C1A` | 11.14 | 11.15 |
| D4 | `chart-12` `-strong` oscuro s/ tarjeta | 11.14 | 11.15 |

El resto de cifras de D2, D3, D4, D5 (incluidos los vecinos descartados y las separaciones), D13,
D14, D15 y la alternativa 6 coincide a dos decimales. Ninguna diferencia rompe un requisito.

### Hallazgo para D12

`docs/marca.md:106` (nota «Hecho en SL-9») lleva `#0d2444` y no está en el inventario de D12. T6
edita ese archivo. `KpisMensajero.tsx` ya no lleva `#10203a`: D12 lo listaba, pero tras T0 no aparece.
