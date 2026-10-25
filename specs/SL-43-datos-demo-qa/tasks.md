# SL-43 «Datos de demostración para QA» — tasks

> `[P]` = paralelizable con las otras `[P]` de su tanda. Cada task cierra con
> `pnpm exec vitest related --run <archivos tocados>` en verde, salvo donde se dice otra cosa.
> Un commit por task (`docs/conventions.md`).
> Las respuestas a P1–P6 pueden retirar R27 (P1) o cambiar `geografia.ts` y las cifras (P3, P6). El
> resto de las tasks no depende de ellas.

## Tanda 0 — Punto de partida

- [ ] **T0. Traer `dev` con SL-19 mergeado.**
  - Espera al merge del PR #16 (SL-19) en `dev` y trae `dev` a la rama
    (`git fetch && git merge origin/dev`). Sin ese merge no se empieza ninguna otra task.
  - Anota en `progress/impl_SL-43.md`:
    - la última migración de `dev` y el timestamp de la de D3.1, posterior a todas;
    - la firma final de `RUTAS_GUARDADAS` y de su `leer`, y de `SupabaseAlmacenDescargas.purgarAnterioresA`;
    - si `JobRepository.complete`/`fail` piden la empresa en contexto tras `20261025150000_jobs_por_empresa`;
    - el nombre de la guardia de Storage de SL-19 y que `scripts/demo-qa/` no necesita entrar en ella.
  - _Hecho:_ la rama contiene el merge de SL-19, `./init.sh` en verde y los cuatro datos anotados.

- [ ] **T1. Inventario de la receta** (depende de T0).
  - Para cada fila de `design.md > D5.1`, la action o el route que monta el servicio, con sus
    dependencias exactas. Completa los nombres que el design deja abiertos: crear orden por pantalla,
    pago a mensajeros, pago a la plataforma (SL-45), recolección en tienda (157), corte diario e
    incidente (158).
  - El camino de cada uno de los 20 estados (`design.md > D5.2`). Si alguno no se alcanza por
    servicio, **para y pregunta** a Carlos antes de seguir.
  - Si un comprobante admite imagen o solo PDF; cómo pinta la UI `geocode_precision`; si algún
    módulo por empresa apaga una pantalla de la receta.
  - Qué guardias barren `scripts/` además de `plataforma-solo-en-lista`, en especial
    `sql-a-mano-por-empresa`.
  - _Hecho:_ el mapa en `progress/impl_SL-43.md`, sin huecos.

## Tanda A — La base y la guardia

- [ ] **T2. Migración `es_demo`** (R6; depende de T0).
  - `db/migrations/<ts>_organizacion_es_demo/{migration,down}.sql` y `db/schema.prisma` (`design.md > D3.1`).
  - _Hecho:_
    - `pnpm run db:migrate` aplica limpio;
    - `pnpm run db:rollback` la revierte y se vuelve a aplicar;
    - `tests/integration/db/schema-drift-saneamiento.test.ts` en verde;
    - `pnpm run test:guardias` en verde.

- [ ] **T3. La guardia** `[P]` (R2, R4, R5, R25; depende de T0).
  - `scripts/demo-qa/guardia-entorno.ts`: `validarEntornoDemo` y `comprobarMarcaDeQa` (`design.md > D2`).
  - `tests/unit/scripts/demo-qa-guardia.test.ts` con los casos de D2.3.
  - _Hecho:_ verde, y las mutaciones 1–3 de D2.3 dan rojo (anotadas en `progress/impl_SL-43.md`).

## Tanda B — Fábricas compartidas (sin cambiar el E2E)

- [ ] **T4. Empresa y usuarios genéricos** `[P]` (R11, R12; depende de T0).
  - `tests/fabricas/empresa-y-usuarios.ts`. `tests/fabricas/e2e.ts` pasa a delegar en él y conserva su
    API y su guarda de host (`design.md > D1.2`).
  - _Hecho:_ `pnpm exec vitest related --run tests/fabricas/e2e.ts tests/fabricas/empresa-y-usuarios.ts`
    en verde y `pnpm run test:guardias` en verde.

- [ ] **T5. Núcleo de los escenarios** (R11, R15–R17; depende de T4).
  - `tests/fabricas/escenarios/reparto.ts` y `cierres.ts`, con el lector, la evidencia y
    `prepararAsignacion` inyectados y sin tocar `process.env`.
  - `e2e/_escenarios/reparto.ts` y `cierres.ts` montan el núcleo con lo del E2E. Ningún `*.spec.ts`
    cambia.
  - _Hecho:_
    - `pnpm exec playwright test --project=reparto` y `--project=dinero` en verde en local, dos
      corridas seguidas (`docs/verification.md > El E2E`);
    - `e2e-sin-saltos` en verde.

## Tanda C — El comando

- [ ] **T6. Borrado** (R7, R8, R9, R10; depende de T2 y T3).
  - `scripts/demo-qa/borrar.ts` (`design.md > D4`).
  - `tests/integration/db/demo-qa-borrado.test.ts`:
    - el caso de R8, con una FK sintética creada y quitada por el test;
    - un caso que borra una empresa demo con datos en todas las familias (orden, cargo de SL-40,
      caja, sesión del usuario) y deja intacta una real.
  - _Hecho:_ verde contra Postgres real. Un `skip` por falta de base no cuenta. La mutación 9 de
    D9.3 da rojo.

- [ ] **T7. Ubicar y cerrar jobs** `[P]` (R20–R23; depende de T0).
  - `scripts/demo-qa/ubicar-y-cerrar-jobs.ts` y `scripts/demo-qa/geografia.ts` (`design.md > D6`, P3).
  - Su caso unitario en `tests/unit/scripts/demo-qa-jobs.test.ts`: tipos esperados, tipo nuevo → 1, y
    `fail` con `runAfter = null`.
  - _Hecho:_ verde.

- [ ] **T8. La receta** (R11–R19, R24; depende de T1, T5 y T7).
  - `scripts/demo-qa/receta.ts`, sobre las fábricas de T4/T5 y los servicios de T1.
  - Solo las escrituras directas de `design.md > D5.3`.
  - _Hecho:_ la receta corre entera contra una base local desechable con la marca de QA y el doble de
    Storage. La comprobación final de D6.3 sale limpia.

- [ ] **T9. Entrypoint, salida y credenciales** (R1, R5, R25–R27; depende de T3, T6, T7 y T8).
  - `scripts/demo-qa.ts` (`ejecutarDemo`, `main`), `scripts/demo-qa/salida.ts`.
  - `"demo:qa"` en `package.json`. `DEMO_QA_CONTRASENA` vacía en `.env.example`, con su comentario.
  - `scripts/demo-qa.ts` en `EXCEPCIONES_DE_PLATAFORMA` (ficha SL-43, con su motivo).
  - R27 solo si P1 queda en la opción (a).
  - _Hecho:_ `pnpm run typecheck`, `pnpm run lint` y `pnpm run test:guardias` en verde.

## Tanda D — Verificación

- [ ] **T10. Test de integración de dos corridas** (R1–R29; depende de T9).
  - `tests/integration/db/demo-qa.test.ts` según `design.md > D9.2`, con su control de no vacuidad.
  - _Hecho:_
    - verde contra Postgres real, con la salida pegada en `progress/impl_SL-43.md`;
    - las mutaciones 1–8 de D9.3 dan rojo, una a una, anotadas con su salida;
    - el mapa `R<n> → test` completo en `progress/impl_SL-43.md`.

- [ ] **T11. Documentación** `[P]` (depende de T9).
  - README: sección «Datos de demostración en QA». Explica qué hace el comando, las variables, cómo se
    pone la marca de QA (P2) y que nunca se corre en producción.
  - `docs/verification.md`: una línea en «Base de datos de test» sobre la marca `servi.entorno` del
    test de la demo.
  - _Hecho:_ `./init.sh` en verde.

## Tanda E — QA (puerta humana)

- [ ] **T12. Primera corrida en QA** (depende de T10, de P2 y de P5; **la ejecuta Carlos o la autoriza**).
  - Pasos de `design.md > D9.4`. Se pega la salida, sin secretos, y la duración en
    `progress/impl_SL-43.md`.
  - _Hecho:_ dos corridas con código 0 y una orden asignada a mano desde la pantalla.

## Archivos esperados

Migración y esquema:
- `db/schema.prisma`
- `db/migrations/20261025160000_organizacion_es_demo/migration.sql`
- `db/migrations/20261025160000_organizacion_es_demo/down.sql`

El comando:
- `scripts/demo-qa.ts`
- `scripts/demo-qa/guardia-entorno.ts`
- `scripts/demo-qa/borrar.ts`
- `scripts/demo-qa/receta.ts`
- `scripts/demo-qa/ubicar-y-cerrar-jobs.ts`
- `scripts/demo-qa/geografia.ts`
- `scripts/demo-qa/salida.ts`
- `package.json`
- `.env.example`
- `lib/db/excepciones-aislamiento.ts`

Fábricas y escenarios compartidos:
- `tests/fabricas/empresa-y-usuarios.ts`
- `tests/fabricas/e2e.ts`
- `tests/fabricas/escenarios/reparto.ts`
- `tests/fabricas/escenarios/cierres.ts`
- `e2e/_escenarios/reparto.ts`
- `e2e/_escenarios/cierres.ts`

Tests:
- `tests/unit/scripts/demo-qa-guardia.test.ts`
- `tests/unit/scripts/demo-qa-jobs.test.ts`
- `tests/integration/db/demo-qa-borrado.test.ts`
- `tests/integration/db/demo-qa.test.ts`

Documentación y estado:
- `README.md`
- `docs/verification.md`
- `progress/impl_SL-43.md`
- `progress/features/SL-43.md`

> El timestamp de la migración (`20261025160000`) es provisional: lo fija T0. Si cambia, se
> actualiza aquí en el mismo commit.
