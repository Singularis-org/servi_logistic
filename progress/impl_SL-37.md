# impl SL-37 — Rastreo público: fecha UTC con «GMT+00:00»

Implementado por el implementer directamente (cambio de una línea, permitido por el leader).

## Archivos

- `lib/services/RastreoPublicoService.ts` — nueva `export function normalizarDesfase`; `formatearEnZona` la usa.
- `tests/unit/services/rastreo-publico-service.test.ts` — dos `describe` SL-37 (R1, R2).
- `specs/SL-37-rastreo-fecha-utc/{requirements,design,tasks}.md`.

## Mapa R -> test

- R1 -> `rastreo-publico-service.test.ts > SL-37 R1 — las tres formas de UTC que da Intl salen como Z` («», «GMT», «GMT+00:00»).
- R2 -> `rastreo-publico-service.test.ts > SL-37 R2 — un desfase distinto de cero sale como ±HH:MM`.

## Salida de tests

```
npx vitest run tests/unit/services/rastreo-publico-service.test.ts
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

## Mutación

Se cambió la normalización a `desfase === "" ? "Z" : desfase` (el código anterior):

```
 FAIL  ... > SL-37 R1 — las tres formas de UTC que da Intl salen como Z > «GMT+00:00» -> Z
      Tests  1 failed | 28 passed (29)
```

Restaurada: `Tests 29 passed (29)`.

El test no depende de la versión de Node: prueba la función con las cadenas literales de `Intl`.
Baseline: al integrar `origin/dev` (que trae SL-31), `tests/baseline-rojos.json` traía la entrada
de `rastreo-publico-service` marcada «lo arregla SL-37». SL-37 la quita en el merge: el archivo ya
está verde.
