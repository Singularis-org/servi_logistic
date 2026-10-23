# impl SL-37 — Rastreo público: fecha UTC con «GMT+00:00»

Lo implementó el implementer directamente, con permiso del leader. El código extrae y exporta
`normalizarDesfase` en el servicio de rastreo: el desfase cero sale `Z` en las cuatro formas de UTC
(«», «GMT», «GMT+00:00», «GMT-00:00»). Se añaden dos `describe` de test (R1, R2). El diff
contra `dev` además quita la entrada de `rastreo-publico-service` de `tests/baseline-rojos.json`,
añade el spec (3 archivos) y las bitácoras de implementación y review.

## Archivos

- `lib/services/RastreoPublicoService.ts` — nueva `export function normalizarDesfase`; `formatearEnZona` la usa.
- `tests/unit/services/rastreo-publico-service.test.ts` — dos `describe` SL-37 (R1, R2).
- `tests/baseline-rojos.json` — quitada la entrada de `rastreo-publico-service` (ya verde).
- `specs/SL-37-rastreo-fecha-utc/{requirements,design,tasks}.md`.
- `progress/impl_SL-37.md`, `progress/review_SL-37.md`.

## Mapa R -> test

- R1 -> `rastreo-publico-service.test.ts > SL-37 R1 — las formas de UTC que da Intl salen como Z`
  («», «GMT», «GMT+00:00», «GMT-00:00»).
- R2 -> `rastreo-publico-service.test.ts > SL-37 R2 — un desfase distinto de cero sale como ±HH:MM`.

## Salida de tests

```
npx vitest run tests/unit/services/rastreo-publico-service.test.ts
 Test Files  1 passed (1)
      Tests  30 passed (30)
```

## Mutaciones

1. Normalización al código anterior (`desfase === "" ? "Z" : desfase`):
   ```
    FAIL  ... > SL-37 R1 — las tres formas de UTC que da Intl salen como Z > «GMT+00:00» -> Z
         Tests  1 failed | 28 passed (29)
   ```
2. Quitar `|| desfase === "-00:00"` de `normalizarDesfase` (ronda del review, 2026-10-23):
   ```
    FAIL  tests/unit/services/rastreo-publico-service.test.ts > SL-37 R1 — las formas de UTC que da Intl salen como Z > «GMT-00:00» -> Z
   Expected: "Z"
   Received: "-00:00"
    Test Files  1 failed (1)
         Tests  1 failed | 29 passed (30)
   ```
   Restaurada con `git checkout lib/services/RastreoPublicoService.ts`:
   ```
    Test Files  1 passed (1)
         Tests  30 passed (30)
   ```

El test no depende de la versión de Node: prueba la función con las cadenas literales de `Intl`.

## E2E local — `e2e/rastreo-publico.spec.ts` (flujo crítico «Rastreo público»)

No había otro dev server: `:3000` estaba libre y no había ningún proceso `next`. El servidor lo
levantó el `webServer` de `playwright.config.ts`, desde este worktree.

Primera corrida, contra la base local `servi-logistic` sin resetearla. Esa base no tiene la guía
1001 que pide la PRECONDITION del spec, así que el caso feliz no encuentra la orden:

```
Running 2 tests using 2 workers

  ok 2 e2e\rastreo-publico.spec.ts:103:7 › Feature 229 — rastreo público sin sesión › los dos casos malos muestran el mismo texto (3.6s)
  x  1 e2e\rastreo-publico.spec.ts:74:7 › Feature 229 — rastreo público sin sesión › un visitante sin sesión consulta su envío desde la landing (7.9s)

    Error: expect(locator).toBeVisible() failed
    Locator: getByRole('dialog').getByText(/Guía 1001/)
    Expected: visible
    Error: element(s) not found

  1 failed
  1 passed (33.3s)
E2E_EXIT=1
```

Segunda corrida, contra una base desechable `sl37_e2e`: creada, `prisma migrate deploy`,
`db:seed` de catálogos, y una orden sintética con guía 1001, teléfono ficticio terminado en 8899 y
una fila de historial `en_preparacion`. Es la PRECONDITION del spec. Al terminar se borró la base.

```
Running 2 tests using 2 workers

  ok 1 e2e\rastreo-publico.spec.ts:74:7 › Feature 229 — rastreo público sin sesión › un visitante sin sesión consulta su envío desde la landing (2.2s)
  ok 2 e2e\rastreo-publico.spec.ts:103:7 › Feature 229 — rastreo público sin sesión › los dos casos malos muestran el mismo texto (2.8s)

  2 passed (8.1s)
E2E_EXIT=0
```

(Se omiten los avisos `[WebServer]` de Next: la raíz del workspace inferida y `middleware` deprecado.)

## Gate local

`TEST_RAPIDO_BASE=dev ./init.sh`, con `prisma generate` propio antes, dentro del lock compartido:

```
✓ typecheck paso
✖ 232 problems (0 errors, 232 warnings)
✓ lint paso
 Test Files  291 passed | 2 skipped (293)
      Tests  3993 passed | 20 skipped (4013)
[test:rapido] 248 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
✓ test:rapido paso
! no hay .env. Crea uno a partir de .env.example
== init OK ==
INIT_EXIT=0
```

Baseline: al integrar `origin/dev` (que trae SL-31), `tests/baseline-rojos.json` traía la entrada
de `rastreo-publico-service` marcada «lo arregla SL-37». SL-37 la quita en el merge: el archivo ya
está verde.

**Veredicto:** R1 (con «-00:00») y R2 tienen test, y la mutación de «-00:00» muere. El E2E del
rastreo pasa 2/2 con su seed y el gate local da INIT_EXIT=0.
