# SLT-43 — geo-jerarquica-modelo · tasks.md

> Requisitos: `requirements.md` (R1–R40). Diseño: `design.md`. Todo es de `backend_dev` (`db/`,
> `lib/`, `scripts/`, `tests/`). `[P]` = puede ir en paralelo con las otras `[P]` de su bloque. Una
> task está hecha cuando su criterio se cumple **y** `pnpm exec vitest related --run <archivos>` pasa
> con `DATABASE_URL` exportada (un verde con los tests de base saltados no cuenta).
>
> **No empieza nada sin:** el spec aprobado y el PR #29 (guardia de migraciones destructivas)
> mergeado o descartado por el humano. Las preguntas abiertas quedaron respondidas el 2026-10-29
> (`requirements.md > Decisiones cerradas`): snapshot con `id`, sin trigger en `cierre_detail`,
> código único por `(pais_id, tipo_id, codigo_oficial)` y `ruta text[]`.

## T0 — Precondiciones

- [x] **T0.1** Comprobar que el PR #29 (guardia de migraciones destructivas) está mergeado en `dev` o
  descartado por el humano. *Hecho:* así consta; si no, se para y se avisa al leader.
- [x] **T0.2** Comprobar que esta rama sale de `dev` y está al día con `origin/dev`. *Hecho:* `git merge-base`
  coincide con `origin/dev` o la rama está rebasada/mergeada sobre ella.

## T1 — Enums y tipos de nivel (depende de T0)

- [x] **T1.1** Migración `20261029120000_geo_enums_nodo_geografico` + `down.sql` que no hace nada y
  lo explica (design §2.5, §3). Añadir `nodo_geografico` a los dos enums de `schema.prisma`. Revisar
  cómo trata los `down.sql` la guardia del PR #29. *Hecho:* `prisma migrate diff` vacío.
- [x] **T1.2** TypeScript del enum (design §2.5): `HISTORIAL_ACCION_ENTIDADES`, `ENTIDAD_LABELS`,
  `FuentesEtiqueta` y su constructor, y excluir `nodo_geografico` del filtro de `/historico/acciones`.
  Ajustar cualquier otro mapa exhaustivo que el typecheck señale sobre `HistorialPlataformaEntidad`.
  *Hecho:* `pnpm run typecheck` verde y `tests/unit/types/historial-accion-entidades.test.ts` (R23)
  verde.
- [x] **T1.3** Migración `20261029120100_tipo_nivel_geografico` + `down.sql` (design §2.1): tabla,
  únicos, FK, RLS, política, `REVOKE`, llenado de todos los países y trigger `pais_tipos_de_nivel`.
  Modelo `TipoNivelGeografico` en `schema.prisma` y en `MODELOS_DE_PLATAFORMA`. *Hecho:* diff vacío,
  guardia `organizacion-en-modelos` verde y `geo-tipo-nivel.test.ts` (R1–R3) verde.

## T2 — Nodo geográfico (depende de T1.3)

- [x] **T2.1** Función `geo_normalizar_nombre` y su test `geo-normalizar-nombre.test.ts` (R10)
  **primero**, antes que la tabla. *Hecho:* idéntico a `normalizeName` en todos los nombres de la base
  de test y en la lista de casos; si no lo es, se para y se avisa (afecta a R9 y R14).
- [x] **T2.2** Migración `20261029120200_nodo_geografico` + `down.sql` (design §2.2, §3): las
  comprobaciones previas que abortan (R14), la tabla con `ruta text[]`, los únicos (incluido el
  parcial de raíces y el del código por `(pais_id, tipo_id, codigo_oficial)`), los
  índices (GIN incluido), las FK compuestas, los triggers de invariantes y de descendientes, la RLS y
  la copia de la geografía. Modelo `NodoGeografico` en `schema.prisma` y en `MODELOS_DE_PLATAFORMA`.
  Comprobar primero que la relación compuesta con `padreId` opcional deja el diff vacío (plan B en
  design §2.2). *Hecho:* diff vacío; `geo-nodo-invariantes.test.ts` (R4–R9, R11) y
  `geo-nodo-rls.test.ts` (R12) verdes.
- [ ] **T2.3** [P] Fixture `tests/integration/db/_fixtures/geo-43.ts` (país `XA` con códigos libres,
  órdenes con y sin distrito, zonas, filas de `cierre_detail`). *Hecho:* lo usan T3–T6 sin duplicarlo.
  _(2026-10-29: creado y en uso por `geo-nodo-rls.test.ts`, `geo-nodo-invariantes.test.ts` y
  `geo-tipo-nivel.test.ts`; se marca cuando T3–T6 lo usen.)_

## T3 — Sincronía desde la geografía vieja (depende de T2.2)

- [x] **T3.1** Migración `20261029120300_nodo_geografico_sincronia` + `down.sql` (design §2.3).
  *Hecho:* `geo-sincronia-geografia.test.ts` (R15–R18) verde, recorriendo `GeoRepository.crear`,
  `renombrar`, `cambiarActivacion` e `importarDivision` de SL-20.
- [x] **T3.2** Correr las suites de geografía de SL-20 y de 374 sin tocarlas: `geografia-*.test.ts`,
  `carga-division.test.ts`, `migracion-sl20-ida-y-vuelta.test.ts`. *Hecho:* verdes sin cambiar
  aserciones (R36). Si un test que limpia con `DELETE` choca con la sincronía, se arregla la
  sincronía, no el test.
  _(Excepción autorizada por Camilo el 2026-10-29, design R36: el caso «decision 4: dos homónimos» de
  `carga-division.test.ts` siembra con la sincronía apagada; aserciones sin cambios.)_

## T4 — Columnas nuevas y triggers de negocio (depende de T3.1)

- [x] **T4.1** Migración `20261029120400_columnas_nodo_geografico` + `down.sql` (design §2.4): cuatro
  columnas, tres FK `NOT VALID`, tres triggers. Relaciones en `schema.prisma` (`Orden`,
  `ZonaDistrito`, `DistritoZonaEspecial`, `CierreDetail`). Confirmar que `fk-misma-empresa.guardia` no
  exige trigger para una FK de negocio → plataforma. *Hecho:* diff vacío y
  `geo-sincronia-orden-zonas.test.ts` (R20, R21) verde.
- [x] **T4.2** Migración `20261029120500_indices_nodo_geografico` + `down.sql`. *Hecho:* diff vacío.
- [ ] **T4.3** [P] `geo-trigger-orden-rendimiento.test.ts` (R22) en base propia. *Hecho:* mediana
  ≤ 1 ms por fila; la cifra va a `progress/impl_SLT-43.md`. Si se pasa, el PR no entra: se para y se
  avisa.
- [x] **T4.4** [P] `slt43-migraciones-aditivas.test.ts` (R19) con contraprueba. *Hecho:* verde sobre
  las seis carpetas y rojo sobre un texto inventado con `DROP COLUMN`.
- [ ] **T4.5** Correr las suites de órdenes, zonas, cobertura y cierres que tocan las tablas con
  columna nueva (`vitest related` sobre `db/schema.prisma` y los repositorios de esas tablas).
  *Hecho:* verdes sin cambiar aserciones (R36).

## T5 — Script de datos (depende de T4.1)

- [ ] **T5.1** Ampliar `FichaJira` a `SLT-<n>` (`lib/db/contexto-empresa.ts`) y añadir el script a
  `EXCEPCIONES_DE_PLATAFORMA` con ficha `SLT-43` y motivo. *Hecho:* typecheck y guardia
  `plataforma-solo-en-lista` verdes.
- [ ] **T5.2** `scripts/geo-backfill-nodo.ts` con los cuatro modos de design §4, exportando
  `comprobar`, `aplicarLote`, `validar` y `equivalencia`, y la entrada `geo:backfill` en
  `package.json`. *Hecho:* `geo-backfill.test.ts` (R24–R31, R33, R40) verde. El snapshot lleva el `id` de cada nivel
  desde las FK de la orden (design §2.6), y no se crea ningún trigger en `cierre_detail`.
- [ ] **T5.3** `geo-equivalencia.test.ts` (R32). *Hecho:* verde con el caso igual y los dos casos
  desviados.

## T6 — Vuelta atrás y guardias (depende de T4.2 y T5.2)

- [ ] **T6.1** `migracion-slt43-ida-y-vuelta.test.ts` (R13, R14, R23, R34, R35) en base propia,
  con el molde de `ida-y-vuelta-32.ts`. *Hecho:* verde; incluye script entre la ida y la vuelta y la
  escritura de geografía, orden y zona después de la vuelta.
- [ ] **T6.2** [P] `nodo-geografico-sin-escritor.guardia.test.ts` (R37) con contraprueba. *Hecho:*
  verde y rojo sobre un archivo inventado que hace `prisma.nodoGeografico.create`.
- [ ] **T6.3** [P] `docs/architecture.md > Multi-empresa > País por empresa`: un párrafo sobre el
  modelo nuevo, la sincronía, el script y que la app aún no lo lee. *Hecho:* `check-perfil` verde.

## T7 — Cierre (depende de todo lo anterior)

- [ ] **T7.1** `./init.sh` verde en el worktree; mapa `R<n> → test` y cifras de R22 en
  `progress/impl_SLT-43.md`. *Hecho:* las 40 filas con test que pasa.
- [ ] **T7.2** **Puerta humana, fuera del agente** (design §6): comprobaciones de solo lectura en
  producción, ensayo completo sobre una copia de producción (migraciones, script, equivalencia,
  `VALIDATE`, `down.sql` y otra ida) con tiempos, y backup restaurado. *Hecho:* el humano anota el
  resultado en `progress/features/SLT-43.md`. Ningún agente lo ejecuta.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261029120000_geo_enums_nodo_geografico/migration.sql`
- `db/migrations/20261029120000_geo_enums_nodo_geografico/down.sql`
- `db/migrations/20261029120100_tipo_nivel_geografico/migration.sql`
- `db/migrations/20261029120100_tipo_nivel_geografico/down.sql`
- `db/migrations/20261029120200_nodo_geografico/migration.sql`
- `db/migrations/20261029120200_nodo_geografico/down.sql`
- `db/migrations/20261029120300_nodo_geografico_sincronia/migration.sql`
- `db/migrations/20261029120300_nodo_geografico_sincronia/down.sql`
- `db/migrations/20261029120400_columnas_nodo_geografico/migration.sql`
- `db/migrations/20261029120400_columnas_nodo_geografico/down.sql`
- `db/migrations/20261029120500_indices_nodo_geografico/migration.sql`
- `db/migrations/20261029120500_indices_nodo_geografico/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/contexto-empresa.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/types/historial-accion.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `app/(app)/historico/acciones/_components/historial-acciones-filtros-def.ts`
- `scripts/geo-backfill-nodo.ts`
- `package.json`
- `docs/architecture.md`
- `tests/integration/db/_fixtures/geo-43.ts`
- `tests/integration/db/geo-tipo-nivel.test.ts`
- `tests/integration/db/geo-normalizar-nombre.test.ts`
- `tests/integration/db/geo-nodo-invariantes.test.ts`
- `tests/integration/db/geo-nodo-rls.test.ts`
- `tests/integration/db/geo-sincronia-geografia.test.ts`
- `tests/integration/db/geo-sincronia-orden-zonas.test.ts`
- `tests/integration/db/geo-trigger-orden-rendimiento.test.ts`
- `tests/integration/db/geo-backfill.test.ts`
- `tests/integration/db/geo-equivalencia.test.ts`
- `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts`
- `tests/unit/db/slt43-migraciones-aditivas.test.ts`
- `tests/unit/types/historial-accion-entidades.test.ts`
- `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts`
- `progress/impl_SLT-43.md`
