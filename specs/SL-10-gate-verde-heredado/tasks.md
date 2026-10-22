# SL-10 — Tareas

Todo se hace y se verifica en el worktree `.worktrees/SL-10-gate-verde-heredado` (finales LF), salvo
T13, que es del leader en el checkout principal tras integrar. Cada `./init.sh` va a un archivo de log
con `INIT_EXIT=$?` dentro (`docs/gate.md > Trampas conocidas`).

## Tareas

- [x] **T0 — Fichas que retiran las excepciones** (R21). Ya existen; cada excepción cita la suya:
  - entrada 420 del baseline → SL-29;
  - comentario del caso R14 de `catalogo-produccion` → SL-30;
  - las dos altas de `no-embalaje` → SL-27;
  - entrada 459 del baseline → SL-13;
  - entradas de zona → SL-11;
  - mención al dominio de Ordenex en `.env.example` → SL-14.

  **Hecho:** cada excepción del diff cita su `SL-<n>` (se comprueba en T12).
- [x] **T1 — Línea base en el worktree.** Correr `./init.sh` en el worktree y guardar el log en
  `_trabajo/gate-worktree-antes.log`. Anotar en `progress/impl_SL-10.md` qué archivos salen rojos en
  LF.
  **Hecho:** confirmado o refutado que las dos guardias de `tests/guards/` pasan en LF (R2). Si no
  pasan, PARA y reporta: la causa no era el CRLF y el diseño de D1 no basta.
- [x] **T2 [P] — Cableado de `package.json` y `.gitignore`** (D2). `test:rapido` →
  `node scripts/test-rapido.mjs`; `test:json` → `.vitest-rojos.json`; `.gitignore` añade
  `.vitest-rojos.json` y `.vitest-codigo`.
  **Hecho:** `pnpm run test:rapido` imprime líneas `[test:rapido]` y `git check-ignore .vitest-rojos.json`
  lo reconoce.
- [x] **T3 [P] — Sembrar `tests/baseline-rojos.json`** (D3). Las cuatro entradas, cada una con
  `motivo` (causa + ficha o condición que la poda) y `desde: "2026-10-21"`. Clave `_comentario` con
  el enlace a `docs/gate.md > Rojos heredados`.
  **Hecho:** `node scripts/comparar-baseline-rojos.mjs` sobre un informe de prueba no se queja de
  entradas sin motivo.
- [x] **T4 — Guardia `gate-cableado-arnes-v2`** (R3, R4, R5). Depende de T2 y T3. Afirma los dos
  scripts de `package.json` y la forma de cada entrada del baseline (motivo ≥ 40 caracteres, `desde`
  con formato de fecha, ruta existente). No fija la lista de entradas.
  **Hecho:** verde, y rojo comprobado con un baseline de fixture con una entrada sin `motivo`.
- [x] **T5 [P] — Guardia `finales-de-linea-lf`** (R1, D1). Función pura de detección con su caso que
  muerde (texto sintético CRLF marcado, LF no) más el barrido de `init.sh`, `scripts/*.sh` y
  `scripts/*.mjs`. El mensaje nombra los archivos y la orden de re-materializar.
  **Hecho:** verde en el worktree. Rojo comprobado con una copia temporal de un `.mjs` convertida a
  CRLF, restaurada después desde copia.
- [x] **T6 [P] — Retirar las tres guardias de bitácoras de Ordenex** (R7, D4). Borrar los tres
  archivos de `tests/` que leen `progress/impl_127.md`, `impl_180.md` e `impl_186.md`.
  **Hecho:** borrados y commiteados; `test-citado-desaparecido` sigue verde **después del commit**,
  porque la historia ya ve el borrado.
- [x] **T7 [P] — `catalogo-produccion`, caso R14** (R8, D5). Quitar las tres aserciones de
  suficiencia sobre `progress/` real y comentar por qué el bucle hoy no tiene sujetos.
  **Hecho:** verde. Rojo comprobado rompiendo `cambiosDeclaradosEnTexto` y revertido.
- [x] **T8 [P] — Raíz `perfiles/`** (R9, D6). Entrada en `INVENTARIO_DE_RAICES`; censo de
  `push-intencion-de-baja` a diez raíces.
  **Hecho:** `push-alta-punto-unico` y `push-intencion-de-baja` verdes. El caso que inyecta una raíz
  sin clasificar sigue rojo, como antes.
- [x] **T9 [P] — Manifiesto** (R10, D7). Literales al valor actual de `public/manifest.json`.
  **Hecho:** verde. Rojo comprobado cambiando el `name` del manifiesto en una copia temporal.
- [x] **T10 [P] — `no-embalaje`** (R11, R12, D8). Lista blanca (`docs/limpieza-ordenex.md` por archivo,
  `specs/SL-10-gate-verde-heredado/` por prefijo); ignorar `.worktrees` y `.vitest-rojos.json`.
  **Hecho:** verde, y verde también tras una corrida de `pnpm run test:json`. Rojo comprobado con la
  palabra en un archivo temporal fuera de la lista, borrado después.
- [x] **T11 [P] — `test-citado-desaparecido`** (R13, D9). Conocido-positivo con un mapa de borrados
  sintético; anti-vacuidad por `--is-shallow-repository`.
  **Hecho:** verde. Rojo comprobado con la función de «clon superficial» alimentada con `true`.
- [x] **T11b [P] — `.env.example` versionado** (R18, R19, R20, R21, D10).
  - Copiar `.env.example` desde el checkout principal y anteponerle el comentario con sus
    excepciones y fichas.
  - `.gitignore`: `!.env.example` tras `.env*`.
  - Guardia `env-example-sin-valores` con su función pura y su caso que muerde.

  **Hecho:**
  - `git ls-files .env.example` lo devuelve y `git check-ignore .env.local` sigue ignorándolo.
  - Las tres guardias en verde en el worktree: la nueva, `push-config.test.ts` y
    `sinpe-sin-variables-de-entorno.guardia.test.ts`.
  - Rojo comprobado con una línea `CLAVE=algo` en una copia temporal, con un mensaje que no imprime
    el valor.
- [x] **T11c — `down.sql` de las tres migraciones heredadas** (R22). Ampliación del leader
  (2026-10-21). Crear `down.sql` en `20260814120000_ruta_optimizada_trazado`,
  `20260814140000_ruta_parada_tramo` y `20260814160000_ruta_tramo_vivo_at`. Cada uno hace
  `DROP COLUMN` de lo que su migración añade, en orden inverso. No se toca ningún `migration.sql`.
  **Hecho:** el paso 7 de `init.sh` dice «todas las migraciones tienen down.sql». Verificado en una
  base temporal (crear, aplicar, revertir, comparar el esquema, borrarla), nunca en la del `.env`; o
  anotado como no verificado en la bitácora.
- [x] **T12 — Gate de cierre** (R6, R14, R16, R17, R21, R22). Depende de T0 a T11c.
  - `./init.sh` en el worktree: `INIT_EXIT=0`, log en `_trabajo/gate-worktree-despues.log`.
  - Prueba de que muerde (R6): rojo forzado en una guardia fuera del baseline, `INIT_EXIT=1`
    nombrándola, y restauración desde copia.
  - Diff: `git diff --name-only dev...HEAD` no toca `specs/` fuera de `specs/SL-10-gate-verde-heredado/`
    (R16) ni ninguna ruta de `arnes.manifest` (R17), y el diff no añade literales de Costa Rica,
    SINPE ni colones.
  - Excepciones (R21): cada alta nueva de `no-embalaje` y la cabecera de `.env.example` citan su
    `SL-<n>`; las del baseline las vigila `gate-cableado-arnes-v2`.
  - Mapa `R<n> → test` en `progress/impl_SL-10.md`.

  **Hecho:** las tres pruebas, con sus logs citados.
- [ ] **T13 — Checkout principal (leader, tras integrar en `dev`)** (R15, D1). Re-materializar los
  archivos `i/lf w/crlf` que estén sin cambios locales y correr `./init.sh` en el checkout principal.
  **Hecho:** `INIT_EXIT=0` y la guardia de R1 verde allí.

## Trazabilidad prevista

| Req | Test o corrida |
|---|---|
| R1 | `tests/unit/guards/finales-de-linea-lf.guardia.test.ts` |
| R2 | `tests/guards/guard-test-rapido-rojos-heredados.test.ts` y `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts`, en la corrida de T1/T12 |
| R3 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` |
| R4 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` + corrida T2 (comprobación de que el informe se ignora) |
| R5 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` |
| R6 | `tests/guards/guard-test-rapido-rojos-heredados.test.ts` + corrida de rojo forzado de T12 |
| R7 | corrida T6/T12: los tres archivos fuera del árbol y gate verde |
| R8 | `tests/unit/analytics/catalogo-produccion.guardia.test.ts` |
| R9 | `tests/unit/guards/push-intencion-de-baja.guardia.test.ts` y `tests/unit/guards/push-alta-punto-unico.guardia.test.ts` |
| R10 | `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` |
| R11 | `tests/unit/guards/no-embalaje.test.ts` |
| R12 | `tests/unit/guards/no-embalaje.test.ts` + corrida tras ejecutar el JSON de la suite (T10) |
| R13 | `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` |
| R14 | corrida T12: el log del worktree termina con código 0 |
| R15 | corrida T13 en el checkout principal |
| R16 | corrida T12: el diff contra la rama de integración |
| R17 | corrida T12: el diff cruzado con el manifiesto del arnés |
| R18 | `tests/unit/guards/env-example-sin-valores.guardia.test.ts` + corrida T11b de las dos comprobaciones de git |
| R19 | `tests/unit/guards/env-example-sin-valores.guardia.test.ts` |
| R20 | `tests/unit/config/push-config.test.ts` y `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts`, en el worktree |
| R21 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` (baseline) + revisión T12 (lista blanca y `.env.example`) |
| R22 | corrida T12: paso 7 de `init.sh` verde + verificación T11c en base temporal |

## Archivos esperados

- `package.json`
- `.gitignore`
- `tests/baseline-rojos.json`
- `tests/unit/guards/finales-de-linea-lf.guardia.test.ts`
- `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts`
- `tests/unit/analytics/catalogo-produccion.guardia.test.ts`
- `tests/unit/analytics/financiera-trazabilidad.guardia.test.ts`
- `tests/unit/analytics/financiera-180-trazabilidad.guardia.test.ts`
- `tests/unit/guards/tablero-lineas-trazabilidad.guardia.test.ts`
- `tests/fixtures/raices-de-codigo.ts`
- `tests/unit/guards/push-intencion-de-baja.guardia.test.ts`
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
- `tests/unit/guards/no-embalaje.test.ts`
- `tests/unit/guards/test-citado-desaparecido.guardia.test.ts`
- `.env.example`
- `tests/unit/guards/env-example-sin-valores.guardia.test.ts`
- `progress/impl_SL-10.md`
- `db/migrations/20260814120000_ruta_optimizada_trazado/down.sql`
- `db/migrations/20260814140000_ruta_parada_tramo/down.sql`
- `db/migrations/20260814160000_ruta_tramo_vivo_at/down.sql`
- `specs/SL-10-gate-verde-heredado/requirements.md`
- `specs/SL-10-gate-verde-heredado/design.md`
- `specs/SL-10-gate-verde-heredado/tasks.md`
