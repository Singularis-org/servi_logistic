# SL-12 — Bitácora de backend_dev: fuera los backfills de Ordenex

Rama `feature/SL-12-fuera-backfills-ordenex`, base `803e287`. Tareas T1 a T7. T8 (gate de cierre)
la corre el leader.

## Commits

- `c9b03a7` chore(SL-12): retirar los tres backfills de Ordenex y su guardia (T1+T2)
- `988d112` test(SL-12): acotar el censo de la 125 en backfill-guards (T3)
- `2599820` test(SL-12): acotar la lista de modulos de la 173 en caja-173-alcance (T4)
- `d91ba76` chore(SL-12): quitar de dos comentarios la ruta de los scripts retirados (T5)
- `b88be32` docs(SL-12): dar por hecha la fila de backfills de Ordenex (T7)
- T6 no dejó cambios: la guardia ya estaba verde tras T5.
- Último commit: tasks.md (T0..T7 marcadas) y esta bitácora.

## Archivos

- Borrados (8): los tres `scripts/backfill-*.ts` de R1 y los cinco tests de D1.
- Nuevo: `tests/unit/guards/backfills-retirados.guardia.test.ts`.
- Modificados: `tests/unit/analytics/backfill-guards.test.ts`,
  `tests/unit/guards/caja-173-alcance.guardia.test.ts`, `lib/geo/fallo-config-geocode.ts` (solo
  comentario), `tests/unit/analytics/cache-invalidacion-backfill.test.ts` (solo comentario),
  `docs/limpieza-ordenex.md` (una fila), `specs/SL-12-fuera-backfills-ordenex/tasks.md`.

## Mapa de requisitos a tests

- R1, R11: `backfills-retirados.guardia.test.ts` › caso 1, más la mutación de T6.
- R2: `backfills-retirados.guardia.test.ts` › caso 3.
- R3, R4: `backfills-retirados.guardia.test.ts` › caso 2.
- R5: `caja-173-alcance.guardia.test.ts` › «ningun modulo de la 173 nombra un insumo» y «CIERRE de
  la lista», más la mutación de T4.
- R6: `backfill-guards.test.ts` › «las tres rutas censadas existen» y los casos R2–R33.
- R7: `backfill-guards.test.ts` › «un consumidor externo solo puede importar el planificador puro»,
  más la mutación de T3.
- R8, R9, R10, R14: diff contra `dev` y gate de T8 (ver «T8 — Gate de cierre»).
- R12: `test-citado-desaparecido.guardia.test.ts`, corrida con el borrado ya commiteado: verde.
- R13: diff de `docs/limpieza-ordenex.md` (T7).

## Rojo de T1 (árbol sin borrar)

`Tests 2 failed | 3 passed (5)`. La autocomprobación sintética y el control de no vacuidad pasan.

- Caso 1: «Volvieron: scripts/backfill-analitica.ts, scripts/backfill-caja-tesoreria.ts,
  scripts/backfill-marcador-config-geocode.ts».
- Caso 2: 12 archivos. Los tres scripts, los cinco tests de D1, `backfill-guards.test.ts` (D2),
  `caja-173-alcance.guardia.test.ts` (D3), `lib/geo/fallo-config-geocode.ts` y
  `cache-invalidacion-backfill.test.ts` (D4).
- Caso 3 (migraciones): verde, como esperaba la comprobación del design.

## Mutaciones (una a una, revertidas, `git status` limpio tras cada una)

- T3: import de `AnaliticaBackfillService` en `lib/services/AnaliticaOperativaService.ts` → rojo
  «un consumidor externo solo puede importar el planificador puro, nunca el servicio» (1 failed | 20
  passed). Revertida con `git checkout`.
- T4: `scripts/mutacion-sl12.ts` con `export const CATEGORIA = "ingreso_cod_recaudado";` → rojo
  «CIERRE de la lista: toda fuente que nombre las categorias nuevas esta declarada» (1 failed | 36
  passed). Archivo borrado.
- T6: `git checkout 803e287 -- scripts/backfill-marcador-config-geocode.ts` → rojo en caso 1
  («Volvieron: scripts/backfill-marcador-config-geocode.ts») y caso 2 (el archivo restaurado) (2
  failed | 3 passed). Deshecha con `git rm --cached` y borrado.

## Salidas

- `pnpm run typecheck` (tras T2): exit 0.
- `vitest run backfill-guards.test.ts`: Test Files 1 passed, Tests 21 passed.
- `vitest run caja-173-alcance.guardia.test.ts`: Test Files 1 passed, Tests 37 passed.
- `vitest run fallo-config-geocode.test.ts cache-invalidacion-backfill.test.ts`: Test Files 2
  passed, Tests 15 passed.
- `vitest run backfills-retirados.guardia.test.ts` (T6): Test Files 1 passed, Tests 5 passed.
- `vitest run catalogo-produccion.guardia, no-embalaje, test-citado-desaparecido.guardia,
  finales-de-linea-lf.guardia`: Test Files 4 passed, Tests 23 passed.
- eslint sobre los archivos tocados: 0 errores; un warning previo (`_opts` sin usar, línea 64 de
  `cache-invalidacion-backfill.test.ts`), no introducido por esta ficha.

## Notas

- El commit T1+T2 deja en rojo, en ese commit, `backfill-guards`, `caja-173-alcance` y el caso 2
  de la guardia nueva (las citas de D2–D4 se arreglan en T3–T5). Así lo pide el orden de tareas.
- Dos frases de prosa ajustadas además de lo pedido: en `backfill-guards` «quinto archivo» pasa a
  «cuarto» (el censo tiene tres) y en `caja-173-alcance` el comentario de `MODULOS_DE_LA_173` ya no
  promete «su ejecutable».
- MCP del grafo no usado: todo se resolvió con Grep/Read sobre rutas conocidas.

Veredicto: T1–T7 hechas y commiteadas, guardia nueva verde y probada con mutación; falta el gate de T8.

## T8 — Gate de cierre (implementer)

- T0: `git merge dev` limpio (`803e287`); `git merge-base --is-ancestor 50e0930 HEAD` = 0;
  `./init.sh` antes de tocar nada: `Test Files 282 passed`, `Tests 3792 passed`, `INIT_EXIT=0`.
- `./init.sh` tras T1..T7 commiteadas (log con `INIT_EXIT=$?` dentro):
  - `✓ lint paso` (solo warnings ajenos a la ficha);
  - `Test Files 283 passed (283)`, `Tests 3797 passed (3797)`;
  - `[test:rapido] 4 rojo(s) heredado(s) del baseline no cuentan en esta seleccion`;
  - `== init OK ==`, `INIT_EXIT=0` (R14).
  - Ni «Instalando dependencias» ni «will be removed» en el log.
- `git diff --name-status dev...HEAD` (R8, R9, R10):
  - de `specs/`, solo `specs/SL-12-fuera-backfills-ordenex/`; ninguna ruta del diff está en
    `arnes.manifest` (cruce línea a línea: 0 coincidencias);
  - ninguno de los seis scripts hermanos aparece;
  - de los módulos de `lib/` de «Lo que NO entra», solo `lib/geo/fallo-config-geocode.ts`, y su
    diff son tres líneas de comentario por dos.
- R12: las dos apariciones de `@test-desaparecido` añadidas en el diff son prosa del spec
  (`requirements.md`, `tasks.md`); ninguna anotación en código ni tests.
- Commit `c9b03a7` (T1+T2) deja en rojo `backfill-guards`, `caja-173-alcance` y el caso 2 de la
  guardia nueva hasta T5: consecuencia del orden de tareas; el reviewer decide.
