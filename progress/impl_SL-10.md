# SL-10 — Bitácora de implementación

## Estado (implementer, 2026-10-21): T0–T12 hechas; R15/T13 pendiente del leader

### Gate de cierre en el worktree (`_trabajo/gate-worktree-despues.log`): INIT_EXIT=0
Salida real (extracto, sin colores):
```
[test:rapido] tests relacionados con 9 archivo(s) del diff vs dev
 Test Files  14 passed (14)
      Tests  145 passed (145)
[test:rapido] tests que corren siempre (gate.siempre: guard)
 Test Files  280 passed (280)
      Tests  3782 passed (3782)
[test:rapido] 4 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
✓ todas las migraciones tienen down.sql
== init OK ==
INIT_EXIT=0
```
No salió «Instalando dependencias» ni «will be removed».

### R6 — rojo forzado (`_trabajo/gate-worktree-rojo-forzado.log`): INIT_EXIT=1
- Se añadió a `tests/unit/guards/html-lang.guardia.test.ts`, que no está en el baseline, un caso `expect(1).toBe(2)`.
- Antes se copió el archivo al scratchpad. Después se restauró desde esa copia; `git status --porcelain` y `git diff --stat` quedaron vacíos.
```
 FAIL  tests/unit/guards/html-lang.guardia.test.ts > SL-10 R6 rojo forzado
 Test Files  1 failed | 279 passed (280)
[test:rapido] rojos NUEVOS (fuera del baseline): tests/unit/guards/html-lang.guardia.test.ts
✗ 'pnpm run test:rapido' fallo
INIT_EXIT=1
```

### Ampliación R22 / T11c (decisión del leader del 2026-10-21)
- La primera corrida de cierre dio tests verdes, pero cayó en el paso 7 con `✗ migraciones sin down.sql: 20260814120000_ruta_optimizada_trazado 20260814140000_ruta_parada_tramo 20260814160000_ruta_tramo_vivo_at`.
- Ese paso no aparecía en el log del diagnóstico, porque allí el gate moría antes. Las tres migraciones vienen del arranque desde Ordenex (`e1365d0`).
- El leader decidió añadir los tres `down.sql`.
  - Spec: commit `cae4a21`, con R22, T11c y la fila nueva en «Decisiones cerradas».
  - SQL: commit `b085952`, con `DROP COLUMN` en orden inverso. No se tocó ningún `migration.sql`.
- **Verificado en una base temporal** `sl10_down_tmp_<ts>`, creada en el servidor del `.env` y borrada después; la base del `.env` no se tocó.
  - Se crearon tablas mínimas `ruta_optimizada(id)` y `ruta_optimizada_parada(id)`.
  - Los tres `up` añaden las 8 columnas. Los tres `down`, en orden inverso, dejan `information_schema.columns` idéntico al de antes (`IDENTICAS: true`).
  - `DROP DATABASE` hecho y confirmado: 0 filas en `pg_database`.
  - **Límite:** la base temporal no reproduce el resto del esquema.

### Cómo se corrió el gate (instrucciones del leader)
- `touch -r node_modules pnpm-lock.yaml` antes de cada corrida, para no reinstalar el `node_modules` compartido. En la corrida de cierre no apareció «Instalando dependencias».
- `DATABASE_URL` sale del `.env` principal, cargado en una subshell (`set -a; . ../../.env`). No se migró la base.
- `TEST_RAPIDO_BASE=dev`, porque `origin/dev` no existe en local.
- Log: `_trabajo/gate-worktree-despues.log` (ignorado); `INIT_EXIT` va escrito dentro.

### T1 — línea base (`_trabajo/gate-worktree-antes.log`, INIT_EXIT=1)
- 14 archivos en rojo en LF: los 13 del diagnóstico que no son de `tests/guards/`, más `sinpe-sin-variables-de-entorno` (falta `.env.example`).
- **R2 confirmado.** `tests/guards/guard-test-rapido-rojos-heredados.test.ts` y `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts` pasan en LF sin tocarse: `Test Files 2 passed (2)`, `Tests 12 passed (12)`. `git ls-files --eol` da `i/lf w/lf` para `init.sh` y `scripts/test-rapido.mjs`.
- La primera corrida de T1, sin el `touch`, mostró el aviso de pnpm «will be removed and reinstalled». Se avisó al leader, que comprobó que el `node_modules` compartido está sano.

### T12 — comprobaciones de diff (hechas)
- **R16**: `git diff --name-only dev...HEAD` no toca ningún `specs/` fuera de `specs/SL-10-gate-verde-heredado/`. Fuera de `.env.example`, el diff no añade ni quita literales de SINPE, colones ni Costa Rica (grep vacío).
- **R17**: ninguna ruta de `arnes.manifest` aparece en el diff.
- **R21**:
  - las altas de `no-embalaje` citan SL-27;
  - la cabecera de `.env.example` cita SL-14, SL-11 y la fase 3;
  - las cuatro entradas del baseline citan SL-29, SL-13 y SL-11, y las vigila `gate-cableado-arnes-v2`.
- **R6, rojo forzado**: hecho (ver arriba). Tras añadir los `down.sql`, el diff contra `dev` sigue sin tocar `specs/` ajenos ni rutas de `arnes.manifest`.

### Mapa R → test (consolidado)

| Req | Test o corrida |
|---|---|
| R1 | `tests/unit/guards/finales-de-linea-lf.guardia.test.ts` |
| R2 | `tests/guards/guard-test-rapido-rojos-heredados.test.ts`, `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts` (T1 y gate de cierre) |
| R3 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` + `[test:rapido]` en el log de cierre |
| R4 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` |
| R5 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` |
| R6 | `tests/guards/guard-test-rapido-rojos-heredados.test.ts` + rojo forzado (`_trabajo/gate-worktree-rojo-forzado.log`, INIT_EXIT=1 nombrando el archivo) |
| R7 | corrida T6 + gate de cierre: los tres archivos ya no están en el árbol y los tests salen verdes |
| R8 | `tests/unit/analytics/catalogo-produccion.guardia.test.ts` |
| R9 | `tests/unit/guards/push-intencion-de-baja.guardia.test.ts`, `tests/unit/guards/push-alta-punto-unico.guardia.test.ts` |
| R10 | `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` |
| R11 | `tests/unit/guards/no-embalaje.test.ts` |
| R12 | `tests/unit/guards/no-embalaje.test.ts` (verde también con un `.vitest-rojos.json` falso) |
| R13 | `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` |
| R14 | gate de cierre en el worktree: `_trabajo/gate-worktree-despues.log`, INIT_EXIT=0 |
| R15 | PENDIENTE del leader (T13, en el checkout principal y tras integrar) |
| R16 | diff de T12 (arriba) |
| R17 | diff de T12 (arriba) |
| R18 | `tests/unit/guards/env-example-sin-valores.guardia.test.ts` + `git ls-files .env.example` / `git check-ignore .env.local` |
| R19 | `tests/unit/guards/env-example-sin-valores.guardia.test.ts` |
| R20 | `tests/unit/config/push-config.test.ts`, `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts` (verdes en el worktree) |
| R21 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` + revisión de T12 |
| R22 | paso 7 de `init.sh` verde («todas las migraciones tienen down.sql») + verificación en base temporal (T11c) |

### Commits
`b0ddc1c` T2 · `deea7f9` T3 · `8d01c0b` T4 · `db1572d` T5 · `f93396c` T11b · `1510a06` bitácora A ·
`484ac1b` T6 · `3160396` T7 · `8ee7611` T8 · `3299af0` T9 · `3b8afe0` T10 · `20b4107` T11 ·
`53aeb3b` bitácora B · `aafb26f` estado bloqueado · `cae4a21` spec R22/T11c · `b085952` T11c (down.sql) · más el commit de cierre de esta bitácora.

## Tanda T2, T3, T4, T5, T11b (backend_dev, 2026-10-21)

Worktree `.worktrees/SL-10-gate-verde-heredado`, rama `feature/SL-10-gate-verde-heredado`.

| Task | Commit | Archivos |
|---|---|---|
| T2 | `b0ddc1c` | `package.json`, `.gitignore` |
| T3 | `deea7f9` | `tests/baseline-rojos.json` |
| T4 | `8d01c0b` | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` |
| T5 | `db1572d` | `tests/unit/guards/finales-de-linea-lf.guardia.test.ts` |
| T11b | `f93396c` | `.env.example`, `.gitignore`, `tests/unit/guards/env-example-sin-valores.guardia.test.ts` |

Nota T3: `tests/baseline-rojos.json` ya existía (`archivos: {}` y un bloque `_lee_esto` de
documentación). Se conserva `_lee_esto` intacto y se añaden `_comentario` y las cuatro entradas.

### R → test (de esta tanda)

| Req | Test |
|---|---|
| R1 | `finales-de-linea-lf.guardia.test.ts` |
| R3, R4, R5, R21 (baseline) | `gate-cableado-arnes-v2.guardia.test.ts` |
| R18, R19 | `env-example-sin-valores.guardia.test.ts` |
| R20 | `tests/unit/config/push-config.test.ts`, `sinpe-sin-variables-de-entorno.guardia.test.ts` |

### Salidas

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errors, 235 warnings, ninguno en los archivos de esta tanda.
- `pnpm exec vitest run` de las 3 guardias nuevas + `push-config` + `sinpe-sin-variables-de-entorno`:
  `Test Files 5 passed (5)`, `Tests 30 passed (30)`.

### Pruebas de que muerden

- T4: `motivo` renombrado en la entrada 459 del baseline y `test:json` devuelto a
  `.vitest/rojos.json` → 2 failed | 3 passed; restaurado con `git checkout`, diff vacío.
- T5: copia temporal `scripts/zz-crlf-temporal.mjs` en CRLF → 1 failed, el mensaje nombra el
  archivo y `rm -- "…" && git checkout -- "…"`; copia borrada, `git status -- scripts/` vacío.
- T11b: sin `git add`, el caso R18 sale rojo; con `CLAVE=…` añadido al final → rojo «lineas 209»,
  el valor aparece 0 veces en la salida; restaurado con `git checkout`, diff vacío.
- `git ls-files .env.example` → `.env.example`; `git check-ignore .env.local` → `.env.local`.

Veredicto: T2, T3, T4, T5 y T11b hechas y commiteadas, con sus guardias en verde y cada una
comprobada en rojo.

## Tanda T6, T7, T8, T9, T10, T11 (backend_dev, 2026-10-21)

| Task | Commit | Archivos |
|---|---|---|
| T6 | `484ac1b` | borra las tres guardias de bitácoras de Ordenex (127, 180, 186) |
| T7 | `3160396` | `tests/unit/analytics/catalogo-produccion.guardia.test.ts` |
| T8 | `8ee7611` | `tests/fixtures/raices-de-codigo.ts`, `tests/unit/guards/push-intencion-de-baja.guardia.test.ts` |
| T9 | `3299af0` | `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` |
| T10 | `3b8afe0` | `tests/unit/guards/no-embalaje.test.ts` |
| T11 | `20b4107` | `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` |

`perfiles/` queda `censada: true`: sus únicas coincidencias de `push` son `Array.push` en
`perfiles/hexagonal/tests/guards/guard-arquitectura-modulos.test.ts`, y las dos guardias de push
salen verdes con la raíz censada.

### R → test (de esta tanda)

| Req | Test o corrida |
|---|---|
| R7 | corrida T6: borrado commiteado; R-1 de `test-citado-desaparecido` verde tras el commit |
| R8 | `catalogo-produccion.guardia.test.ts` |
| R9 | `push-intencion-de-baja.guardia.test.ts`, `push-alta-punto-unico.guardia.test.ts` |
| R10 | `pwa-manifiesto-atajos.guardia.test.ts` |
| R11, R12 | `no-embalaje.test.ts` |
| R13 | `test-citado-desaparecido.guardia.test.ts` |

### Salidas

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errors, 235 warnings, ninguno en los archivos de esta tanda.
- Los 6 archivos tocados juntos: `Test Files 6 passed (6)`, `Tests 93 passed (93)`.
- T6, tras el commit: `test-citado-desaparecido` 2 failed | 11 passed; los dos rojos eran los
  conocidos (conocido-positivo y anti-vacuidad), y los tres casos R-1 salieron verdes.

### Pruebas de que muerden (todas restauradas con `git checkout --`, diff vacío)

- T7: `cambiosDeclaradosEnTexto` devuelve `[]` → 1 failed | 4 passed
  (`expected [] to deeply equal [ { id: 'ordenes_creadas', … } ]`).
- T8: quitar la entrada `perfiles` del inventario → 2 failed | 61 passed, «la raiz de codigo
  `perfiles/` existe en el arbol y NO esta en INVENTARIO_DE_RAICES».
- T9: `name` del manifiesto a «Servi Logistic X» → 1 failed | 10 passed.
- T10: `tests/zz-mutacion-temporal.md` con la palabra → 1 failed, nombra el archivo; borrado.
  Con un `.vitest-rojos.json` falso en la raíz: verde; y quitando el ignore por nombre, rojo.
- T11: `quejaDeClonSuperficial("true")` en el caso real → 1 failed | 12 passed; el filtro de
  `desaparecidas` sin mapa → 1 failed (`expected [] to deeply equal [ 'R2' ]`).

Veredicto: T6 a T11 hechas y commiteadas, cada guardia en verde y comprobada en rojo.
