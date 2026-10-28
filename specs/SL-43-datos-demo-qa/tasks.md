# SL-43 «Datos de demostración para QA» — tasks

> **Aprobado por Carlos Restrepo el 2026-10-25**, con P1–P6 cerradas (`requirements.md > D15–D26`).
> La demo es un paso del build de QA (`design.md > D10`); `pnpm demo:qa` queda para local y tests.
> `[P]` = paralelizable con las otras `[P]` de su tanda. Cada task cierra con
> `pnpm exec vitest related --run <archivos tocados>` en verde, salvo donde se dice otra cosa.
> Un commit por task (`docs/conventions.md`).

## Tanda 0 — Punto de partida

- [x] **T0. Traer `dev` con SL-19 mergeado.**
  - Espera al merge del PR #16 (SL-19) en `dev` y trae `dev` a la rama
    (`git fetch && git merge origin/dev`). Sin ese merge no se empieza ninguna otra task.
  - Anota en `progress/impl_SL-43.md`:
    - la última migración de `dev` y el timestamp de la de D3.1, posterior a todas;
    - la firma final de `RUTAS_GUARDADAS` y de su `leer`, y de `SupabaseAlmacenDescargas.purgarAnterioresA`;
    - si `JobRepository.complete`/`fail` piden la empresa en contexto tras
      `20261025150000_jobs_por_empresa`;
    - el nombre de la guardia de Storage de SL-19, y que `scripts/demo-qa/` no necesita entrar en ella;
    - **con el leader (MCP de Vercel o panel):**
      - que en Preview para la rama `dev` existen `MIGRATE_ON_PREVIEW=true`, `DIRECT_URL`,
        `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Solo nombres y ámbito, nunca
        valores;
      - el límite de duración del build del plan;
      - la duración del último build de QA.
  - _Hecho:_ la rama contiene el merge de SL-19, `./init.sh` en verde y los datos anotados. Si falta
    una variable de Preview, **para y avisa**: el design la da por existente.

- [x] **T1. Inventario de la receta** (depende de T0).
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

- [x] **T2. Migración `es_demo`** (R6; depende de T0).
  - `db/migrations/<ts>_organizacion_es_demo/{migration,down}.sql` y `db/schema.prisma`
    (`design.md > D3.1`).
  - _Hecho:_
    - `pnpm run db:migrate` aplica limpio;
    - `pnpm run db:rollback` la revierte y se vuelve a aplicar;
    - `tests/integration/db/schema-drift-saneamiento.test.ts` en verde;
    - `pnpm run test:guardias` en verde.

- [ ] **T2b. La marca de QA en Supabase, con su prueba** — **PUERTA HUMANA TRAS EL MERGE** (parte técnica hecha: opción 3, `comprobarMarcaDeQa` y su test; queda la fila en QA. Pasos en `progress/features/SL-43.md > Cierre`) _(2026-10-25: ALTER DATABASE y ALTER ROLE rechazadas con 42501 → opción 3 implementada, migración `20261025160100_entorno_marca`; falta que Carlos inserte la fila en QA tras el primer despliegue con la migración)_ (R3, D21; depende de T0; **puerta humana**:
  se hace con Carlos sobre la base de QA).
  - Prueba en el Supabase de QA, en este orden y con el rol `postgres` (`design.md > D2.2`):
    1. `ALTER DATABASE postgres SET servi.entorno = 'qa';`
    2. `ALTER ROLE postgres SET servi.entorno = 'qa';`
  - **La prueba de que funciona:** una conexión NUEVA por `DIRECT_URL` y otra por `DATABASE_URL`
    devuelven `qa` en `SELECT current_setting('servi.entorno', true)`. Las dos, porque el pooler
    transaccional puede no heredar el ajuste igual que el de sesión.
  - Si ninguna de las dos pasa la prueba: opción 3 de D2.2 (migración
    `<ts>_entorno_marca/{migration,down}.sql` con la tabla, y `comprobarMarcaDeQa` la lee). La fila
    `('entorno', 'qa')` la inserta Carlos solo en QA.
  - _Hecho:_ la sentencia que funcionó, la salida de la prueba (solo el valor `qa`, sin URLs) en
    `progress/impl_SL-43.md`, y `comprobarMarcaDeQa` escrita para esa opción. Comprueba también que
    producción **no** tiene la marca (lectura, con Carlos).

- [x] **T3. La guardia y la decisión del build** `[P]` (R2, R4, R5, R25, R29, R30; depende de T0).
  - `scripts/demo-qa/guardia-entorno.ts` (`validarEntornoDemo`, `comprobarMarcaDeQa`) y
    `scripts/demo-qa/decision-build.ts` (`decidirDemo`), según `design.md > D2` y `D10.1`.
  - `tests/unit/scripts/demo-qa-guardia.test.ts` con los casos de D2.3, y los casos de `decidirDemo`
    (todas las filas de la tabla de D10.1) en `tests/unit/scripts/demo-qa-build.test.ts`.
  - _Hecho:_ verde, y las mutaciones 1–3, 5 y 10 de D9.3 dan rojo (anotadas en
    `progress/impl_SL-43.md`).

## Tanda B — Fábricas compartidas (sin cambiar el E2E)

- [x] **T4. Empresa y usuarios genéricos** `[P]` (R11, R12; depende de T0).
  - `tests/fabricas/empresa-y-usuarios.ts`. `tests/fabricas/e2e.ts` pasa a delegar en él y conserva su
    API y su guarda de host (`design.md > D1.2`). Sin importaciones de Playwright en tiempo de
    ejecución.
  - _Hecho:_ `pnpm exec vitest related --run tests/fabricas/e2e.ts tests/fabricas/empresa-y-usuarios.ts`
    en verde y `pnpm run test:guardias` en verde.

- [x] **T5. Núcleo de los escenarios** (R11, R15–R17; depende de T4).
  - `tests/fabricas/escenarios/reparto.ts` y `cierres.ts`, con el lector, la evidencia y
    `prepararAsignacion` inyectados, sin tocar `process.env` y sin importar Playwright en tiempo de
    ejecución.
  - `e2e/_escenarios/reparto.ts` y `cierres.ts` montan el núcleo con lo del E2E. Ningún `*.spec.ts`
    cambia.
  - _Hecho:_
    - `pnpm exec playwright test --project=reparto` y `--project=dinero` en verde en local, dos
      corridas seguidas (`docs/verification.md > El E2E`);
    - `e2e-sin-saltos` en verde.

## Tanda C — La demo

- [x] **T6. Borrado** (R7, R8, R9, R10; depende de T2 y T3).
  - `scripts/demo-qa/borrar.ts` (`design.md > D4`).
  - `tests/integration/db/demo-qa-borrado.test.ts`:
    - el caso de R8, con una FK sintética creada y quitada por el test;
    - un caso que borra una empresa demo con datos en todas las familias (orden, cargo de SL-40,
      caja, sesión del usuario) y deja intacta una real.
  - _Hecho:_ verde contra Postgres real. Un `skip` por falta de base no cuenta. La mutación 9 de D9.3
    da rojo.

- [x] **T7. Ubicar y cerrar jobs** `[P]` (R20–R23; depende de T0).
  - `scripts/demo-qa/ubicar-y-cerrar-jobs.ts` y `scripts/demo-qa/geografia.ts`, con los distritos y
    puntos fijos (`design.md > D6`, D22).
  - Su caso unitario en `tests/unit/scripts/demo-qa-jobs.test.ts`: tipos esperados, tipo nuevo → 1, y
    `fail` con `runAfter = null`.
  - _Hecho:_ verde.

- [x] **T8. La receta** (R11–R19, R24; depende de T1, T5 y T7).
  - `scripts/demo-qa/receta.ts`, sobre las fábricas de T4/T5 y los servicios de T1. A y B con la misma
    receta, y el recorte de B (`design.md > D5.2`) detrás de una constante, apagado.
  - Solo las escrituras directas de `design.md > D5.3`.
  - _Hecho:_ la receta corre entera contra una base local desechable con la marca de QA y el doble de
    Storage. La comprobación final de D6.3 sale limpia.

- [x] **T9. Entrypoint, candado, tope, salida y build** (R1, R5, R25, R26, R29–R33; depende de T3, T6,
  T7 y T8).
  - `scripts/demo-qa.ts` (`ejecutarDemo` con efectos inyectables, los modos `--build` y a mano, el
    tope de 15 min), `scripts/demo-qa/candado.ts` y `scripts/demo-qa/salida.ts`.
  - `package.json`:
    - `build` con `tsx scripts/demo-qa.ts --build` entre `migrate-deploy.ts` y `next build`;
    - `"demo:qa"`.
  - `.env.example`: `DEMO_ON_PREVIEW` y `DEMO_QA_CONTRASENA` vacías, con su comentario.
  - `scripts/demo-qa.ts` en `EXCEPCIONES_DE_PLATAFORMA` (ficha SL-43, con su motivo).
  - Orquestación `--build` en `tests/unit/scripts/demo-qa-build.test.ts`, con los casos de D9.1:
    omitida sin conectar, fallo → `salir(1)`, tope → `salir(1)` y el orden de `build` en `package.json`.
  - Un build local con `VERCEL_ENV` sin definir: el paso dice OMITIDA y `next build` sigue.
  - _Hecho:_
    - `pnpm run typecheck`, `pnpm run lint` y `pnpm run test:guardias` en verde;
    - las mutaciones 11 y 12 de D9.3 dan rojo.

## Tanda D — Verificación

- [x] **T10. Test de integración de dos corridas** (R1–R33; depende de T9).
  - `tests/integration/db/demo-qa.test.ts` según `design.md > D9.2`, con su control de no vacuidad y el
    caso de R32 (dos ejecuciones a la vez).
  - _Hecho:_
    - verde contra Postgres real, con la salida y la duración de cada corrida pegadas en
      `progress/impl_SL-43.md`;
    - las mutaciones 1–8 de D9.3 dan rojo, una a una, anotadas con su salida;
    - el mapa `R<n> → test` completo en `progress/impl_SL-43.md`.

- [x] **T11. Documentación** `[P]` (depende de T9).
  - README, sección «Datos de demostración en QA»:
    - que corre en cada despliegue de `dev` a QA y que nunca en producción;
    - las variables de `design.md > D10.5`;
    - la marca de QA (la sentencia de T2b);
    - que lo creado a mano en una empresa demo se pierde en el siguiente despliegue;
    - cómo entrar (código en los logs de Vercel);
    - cómo desbloquear `dev` si la demo falla (quitar `DEMO_ON_PREVIEW`).
  - `docs/verification.md`:
    - en «El OTP», que `AUTH_OTP_DEBUG_LOG=1` también está encendida en Preview para `dev`, por
      decisión de Carlos del 2026-10-25;
    - en «Base de datos de test», una línea sobre la marca de QA del test de la demo.
  - _Hecho:_ `./init.sh` en verde.

## Tanda E — QA (puerta humana)

- [ ] **T12. Primer despliegue de QA con la demo** — **PUERTA HUMANA TRAS EL MERGE** (pasos en `progress/features/SL-43.md > Cierre`) (depende de T2b, T10 y de las variables de
  `design.md > D10.5`, que crea Carlos antes del merge).
  - Los pasos de `design.md > D9.4`. Se pegan en `progress/impl_SL-43.md` las líneas `[demo-qa]` del
    log del build (sin secretos) y la duración de la demo y del build entero.
  - Si la demo pasa de 5 minutos, se enciende el recorte de B (D19), se dice en el PR y se repite.
  - _Hecho:_ dos despliegues verdes seguidos, la entrada con dos perfiles con el código de los logs y
    una orden asignada a mano desde la pantalla.

## Archivos esperados

Migración y esquema:
- `db/schema.prisma`
- `db/migrations/20261025160000_organizacion_es_demo/migration.sql`
- `db/migrations/20261025160000_organizacion_es_demo/down.sql`
- `db/migrations/20261025160100_entorno_marca/migration.sql` (solo si T2b cae en la opción 3)
- `db/migrations/20261025160100_entorno_marca/down.sql` (solo si T2b cae en la opción 3)

La demo:
- `scripts/demo-qa.ts`
- `scripts/demo-qa/decision-build.ts`
- `scripts/demo-qa/guardia-entorno.ts`
- `scripts/demo-qa/candado.ts`
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
- `tests/unit/scripts/demo-qa-build.test.ts`
- `tests/unit/scripts/demo-qa-jobs.test.ts`
- `tests/integration/db/demo-qa-borrado.test.ts`
- `tests/integration/db/demo-qa.test.ts`

Documentación y estado:
- `README.md`
- `docs/verification.md`
- `progress/impl_SL-43.md`
- `progress/features/SL-43.md`

> Los timestamps de las migraciones (`20261025160000`, `20261025160100`) son provisionales: los fija
> T0. Si cambian, se actualizan aquí en el mismo commit.
