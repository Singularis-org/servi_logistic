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
>
> **Enmienda 2026-10-29 (Camilo):** sin columna `ruta`. Lo que T2.2 y T3.1 hicieron con ella lo
> deshace la tanda **T8**, al final. R8 y R11 quedan retirados y R7 cambia (design §2.2).

## T0 — Precondiciones

- [x] **T0.1** Comprobar que el PR #29 (guardia de migraciones destructivas) está mergeado en `dev` o
  descartado por el humano. *Hecho:* así consta; si no, se para y se avisa al leader.
- [x] **T0.2** Comprobar que esta rama sale de `dev` y está al día con `origin/dev`. *Hecho:* `git merge-base`
  coincide con `origin/dev` o la rama está rebasada/mergeada sobre ella.

## T1 — Enums y tipos de nivel (depende de T0)

- [x] **T1.1** Migración `20261030120000_geo_enums_nodo_geografico` + `down.sql` que no hace nada y
  lo explica (design §2.5, §3). Añadir `nodo_geografico` a los dos enums de `schema.prisma`. Revisar
  cómo trata los `down.sql` la guardia del PR #29. *Hecho:* `prisma migrate diff` vacío.
- [x] **T1.2** TypeScript del enum (design §2.5): `HISTORIAL_ACCION_ENTIDADES`, `ENTIDAD_LABELS`,
  `FuentesEtiqueta` y su constructor, y excluir `nodo_geografico` del filtro de `/historico/acciones`.
  Ajustar cualquier otro mapa exhaustivo que el typecheck señale sobre `HistorialPlataformaEntidad`.
  *Hecho:* `pnpm run typecheck` verde y `tests/unit/types/historial-accion-entidades.test.ts` (R23)
  verde.
- [x] **T1.3** Migración `20261030120100_tipo_nivel_geografico` + `down.sql` (design §2.1): tabla,
  únicos, FK, RLS, política, `REVOKE`, llenado de todos los países y trigger `pais_tipos_de_nivel`.
  Modelo `TipoNivelGeografico` en `schema.prisma` y en `MODELOS_DE_PLATAFORMA`. *Hecho:* diff vacío,
  guardia `organizacion-en-modelos` verde y `geo-tipo-nivel.test.ts` (R1–R3) verde.

## T2 — Nodo geográfico (depende de T1.3)

- [x] **T2.1** Función `geo_normalizar_nombre` y su test `geo-normalizar-nombre.test.ts` (R10)
  **primero**, antes que la tabla. *Hecho:* idéntico a `normalizeName` en todos los nombres de la base
  de test y en la lista de casos; si no lo es, se para y se avisa (afecta a R9 y R14).
- [x] **T2.2** Migración `20261030120200_nodo_geografico` + `down.sql` (design §2.2, §3): las
  comprobaciones previas que abortan (R14), la tabla con `ruta text[]`, los únicos (incluido el
  parcial de raíces y el del código por `(pais_id, tipo_id, codigo_oficial)`), los
  índices (GIN incluido), las FK compuestas, los triggers de invariantes y de descendientes, la RLS y
  la copia de la geografía. Modelo `NodoGeografico` en `schema.prisma` y en `MODELOS_DE_PLATAFORMA`.
  Comprobar primero que la relación compuesta con `padreId` opcional deja el diff vacío (plan B en
  design §2.2). *Hecho:* diff vacío; `geo-nodo-invariantes.test.ts` (R4–R9, R11) y
  `geo-nodo-rls.test.ts` (R12) verdes.
- [x] **T2.3** [P] Fixture `tests/integration/db/_fixtures/geo-43.ts` (país `XA` con códigos libres,
  órdenes con y sin distrito, zonas, filas de `cierre_detail`). *Hecho:* lo usan T3–T6 sin duplicarlo.
  _(2026-10-29: creado y en uso por `geo-nodo-rls.test.ts`, `geo-nodo-invariantes.test.ts` y
  `geo-tipo-nivel.test.ts`; se marca cuando T3–T6 lo usen.)_

## T3 — Sincronía desde la geografía vieja (depende de T2.2)

- [x] **T3.1** Migración `20261030120300_nodo_geografico_sincronia` + `down.sql` (design §2.3).
  *Hecho:* `geo-sincronia-geografia.test.ts` (R15–R18) verde, recorriendo `GeoRepository.crear`,
  `renombrar`, `cambiarActivacion` e `importarDivision` de SL-20.
- [x] **T3.2** Correr las suites de geografía de SL-20 y de 374 sin tocarlas: `geografia-*.test.ts`,
  `carga-division.test.ts`, `migracion-sl20-ida-y-vuelta.test.ts`. *Hecho:* verdes sin cambiar
  aserciones (R36). Si un test que limpia con `DELETE` choca con la sincronía, se arregla la
  sincronía, no el test.
  _(Excepción autorizada por Camilo el 2026-10-29, design R36: el caso «decision 4: dos homónimos» de
  `carga-division.test.ts` siembra con la sincronía apagada; aserciones sin cambios.)_

## T4 — Columnas nuevas y triggers de negocio (depende de T3.1)

- [x] **T4.1** Migración `20261030120400_columnas_nodo_geografico` + `down.sql` (design §2.4): cuatro
  columnas, tres FK `NOT VALID`, tres triggers. Relaciones en `schema.prisma` (`Orden`,
  `ZonaDistrito`, `DistritoZonaEspecial`, `CierreDetail`). Confirmar que `fk-misma-empresa.guardia` no
  exige trigger para una FK de negocio → plataforma. *Hecho:* diff vacío y
  `geo-sincronia-orden-zonas.test.ts` (R20, R21) verde.
- [x] **T4.2** Migración `20261030120500_indices_nodo_geografico` + `down.sql`. *Hecho:* diff vacío.
- [x] **T4.3** [P] `geo-trigger-orden-rendimiento.test.ts` (R22) en base propia. *Hecho:* mediana
  ≤ 1 ms por fila; la cifra va a `progress/impl_SLT-43.md`. Si se pasa, el PR no entra: se para y se
  avisa.
- [x] **T4.4** [P] `slt43-migraciones-aditivas.test.ts` (R19) con contraprueba. *Hecho:* verde sobre
  las seis carpetas y rojo sobre un texto inventado con `DROP COLUMN`.
- [x] **T4.5** Correr las suites de órdenes, zonas, cobertura y cierres que tocan las tablas con
  columna nueva (`vitest related` sobre `db/schema.prisma` y los repositorios de esas tablas).
  *Hecho:* verdes sin cambiar aserciones (R36).

## T5 — Script de datos (depende de T4.1)

- [x] **T5.1** Ampliar `FichaJira` a `SLT-<n>` (`lib/db/contexto-empresa.ts`) y añadir el script a
  `EXCEPCIONES_DE_PLATAFORMA` con ficha `SLT-43` y motivo. *Hecho:* typecheck y guardia
  `plataforma-solo-en-lista` verdes.
- [x] **T5.2** `scripts/geo-backfill-nodo.ts` con los cuatro modos de design §4, exportando
  `comprobar`, `aplicarLote`, `validar` y `equivalencia`, y la entrada `geo:backfill` en
  `package.json`. *Hecho:* `geo-backfill.test.ts` (R24–R31, R33, R40) verde. El snapshot lleva el `id` de cada nivel
  desde las FK de la orden (design §2.6), y no se crea ningún trigger en `cierre_detail`.
- [x] **T5.3** `geo-equivalencia.test.ts` (R32). *Hecho:* verde con el caso igual y los dos casos
  desviados.

## T6 — Vuelta atrás y guardias (depende de T4.2 y T5.2)

- [x] **T6.1** `migracion-slt43-ida-y-vuelta.test.ts` (R13, R14, R23, R34, R35) en base propia,
  con el molde de `ida-y-vuelta-32.ts`. *Hecho:* verde; incluye script entre la ida y la vuelta y la
  escritura de geografía, orden y zona después de la vuelta.
- [x] **T6.2** [P] `nodo-geografico-sin-escritor.guardia.test.ts` (R37) con contraprueba. *Hecho:*
  verde y rojo sobre un archivo inventado que hace `prisma.nodoGeografico.create`.
- [x] **T6.3** [P] `docs/architecture.md > Multi-empresa > País por empresa`: un párrafo sobre el
  modelo nuevo, la sincronía, el script y que la app aún no lo lee. *Hecho:* `check-perfil` verde.

## T7 — Cierre (depende de todo lo anterior)

- [x] **T7.1** `./init.sh` verde en el worktree; mapa `R<n> → test` y cifras de R22 en
  `progress/impl_SLT-43.md`. *Hecho:* las 40 filas con test que pasa.
  *Nota 2026-10-29:* `./init.sh` no termina en local por memoria; el gate local se sustituyó por typecheck + lint +
  todas las guardias + tests de SLT-43 (bitácora, tanda 7; verificado también por el reviewer). Gate completo en CI
  (`gate-completo` del PR).
- [ ] **T7.2** **Puerta humana, fuera del agente** (design §6): comprobaciones de solo lectura en
  producción, ensayo completo sobre una copia de producción (migraciones, script, equivalencia,
  `VALIDATE`, `down.sql` y otra ida) con tiempos, y backup restaurado. *Hecho:* el humano anota el
  resultado en `progress/features/SLT-43.md`. Ningún agente lo ejecuta.

## T8 — Enmienda «sin `ruta`» (decisión 2026-10-29; depende de que el humano apruebe esta enmienda)

Las migraciones de SLT-43 no están mergeadas (PR #44 abierto): se **editan en su sitio**, no se
crea una migración nueva. `scripts/geo-backfill-nodo.ts` y `20261030120500_indices_nodo_geografico`
no usan `ruta`: no se tocan. Grep de comprobación al final: `ruta` (como columna de
`nodo_geografico`), `GIN`/`Gin` sobre ella y `ruta_descendientes` no aparecen en `db/`, `tests/` ni
`docs/architecture.md`.

- [x] **T8.1** `db/migrations/20261030120200_nodo_geografico/migration.sql`:
  - quitar `"ruta" TEXT[] NOT NULL` de la tabla y el `CREATE INDEX "nodo_geografico_ruta_idx" … USING
    GIN ("ruta")` con su comentario de R11;
  - en `nodo_geografico_invariantes`: quitar `v_ruta`, las asignaciones a `NEW.ruta` y `n.ruta` del
    `SELECT`; leer el padre con `FOR SHARE`; añadir el paso 3 de design §2.2 (en `UPDATE`, si
    `NEW.profundidad IS DISTINCT FROM OLD.profundidad` y existe un nodo con `padre_id = NEW.id`,
    `RAISE … USING ERRCODE = 'SLT43'`); quitar `"ruta"` de la lista `UPDATE OF` del trigger;
  - borrar la función y el trigger `nodo_geografico_ruta_descendientes` con su bloque de comentario;
  - ajustar los comentarios que nombran la ruta o los descendientes (cabecera, tabla, invariantes,
    copia de R13) y el de ciclos, que pasa a explicar el paso 3.
  *Hecho:* `Grep` de `ruta` en el archivo sin resultados.
- [x] **T8.2** `db/migrations/20261030120200_nodo_geografico/down.sql`: quitar el `DROP TRIGGER
  "nodo_geografico_ruta_descendientes"` y el `DROP FUNCTION nodo_geografico_ruta_descendientes()`.
  *Hecho:* el `down.sql` solo borra lo que crea la migración de T8.1.
- [x] **T8.3** [P] `db/migrations/20261030120300_nodo_geografico_sincronia/migration.sql`: quitar `ruta`
  de la lista de columnas y su valor (`ARRAY[…]`) en los tres upserts (`geo_sincronizar_provincia`,
  `…_canton`, `…_distrito`) y del comentario de cabecera. El `down.sql` no cambia. *Hecho:* `Grep` de
  `ruta` en la carpeta sin resultados.
- [x] **T8.4** [P] `db/schema.prisma`, modelo `NodoGeografico`: quitar el campo `ruta String[]` con
  su comentario, el `@@index([ruta], type: Gin)` con su comentario de R11, y en el comentario de
  cabecera la mención a la ruta (R8) y a `nodo_geografico_ruta_descendientes`; nombrar la regla
  nueva de R7 (nodo con hijos no cambia de profundidad). *Hecho:* `prisma migrate diff
  --from-config-datasource --to-schema db/schema.prisma` vacío tras aplicar las migraciones de T8.1–T8.3
  en una base limpia, y `pnpm run typecheck` verde.
- [x] **T8.5** `tests/integration/db/_fixtures/geo-43.ts`: quitar `ruta` de `SQL_INSERTAR_NODO`
  (columna y `ARRAY['lo pisa el trigger']`) y del comentario de `NodoNuevo`. *Hecho:* los tests que
  usan el fixture compilan y pasan (T8.6, T8.7).
- [x] **T8.6** `tests/integration/db/geo-nodo-invariantes.test.ts` (design §7, filas R4–R11):
  - cabecera: quitar R8 y R11 de la lista, ajustar R4 y R7;
  - quitar `ruta` del tipo de fila y el helper `rutas()`;
  - R4: quitar `ruta` de las expectativas y comprobar que la columna `ruta` no existe
    (`information_schema.columns`);
  - R4/R10: el caso «nombre normalizado o ruta mandados a mano se pisan» queda solo con el nombre
    normalizado;
  - R7: añadir «cambiar la profundidad de un nodo con hijos → `SLT43`», «`SET padre_id = <nieto>,
    profundidad = <la del nieto + 1>` → `SLT43` y sin cambios» y «mover un nodo con hijos a otro padre
    del mismo nivel entra y sus hijos siguen con el mismo padre y profundidad»;
  - borrar el caso R8 (ruta del subárbol al cambiar de padre);
  - sustituir el caso R11 por uno que compruebe que no existen `nodo_geografico_ruta_idx`
    (`pg_indexes`) ni `nodo_geografico_ruta_descendientes` (`pg_trigger`).
  *Hecho:* verde con `DATABASE_URL` exportada; el caso nuevo del nieto **falla** si se quita el paso 3
  del trigger (comprobado a mano y anotado en `progress/impl_SLT-43.md`).
- [x] **T8.7** [P] `tests/integration/db/geo-sincronia-geografia.test.ts`: quitar `ruta` del `SELECT`
  y del tipo de fila; en R15 y R16 sustituir las expectativas sobre `ruta` por `padre_id` y
  `profundidad` (el cantón movido cuelga de la provincia nueva; su distrito sigue colgando del cantón
  con profundidad 3; el nodo con país cambiado sigue con profundidad 1 y sin padre). Renombrar el caso
  R16 («con la ruta de los descendientes» → «el distrito del cantón movido no cambia»). Sin cambiar
  qué comprueba cada caso más allá de la ruta. *Hecho:* verde.
- [x] **T8.8** [P] `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts`: el ejemplo de
  lectura `'SELECT * FROM "nodo_geografico" WHERE ruta @> ARRAY[$1]'` pasa a uno sobre `padre_id`
  (p. ej. `WHERE padre_id = $1`). *Hecho:* la guardia y su contraprueba verdes.
- [x] **T8.9** [P] `docs/architecture.md` (línea del modelo nuevo, hoy «`ruta text[]` con índice
  GIN»): describir el árbol solo con `padre_id` y `profundidad`, y que los descendientes se leen con
  CTE recursiva o el catálogo en memoria. *Hecho:* `check-perfil` verde.
- [x] **T8.10** Correr `migracion-slt43-ida-y-vuelta.test.ts`, `slt43-migraciones-aditivas.test.ts`,
  `geo-nodo-rls.test.ts`, `geo-sincronia-orden-zonas.test.ts`, `geo-backfill.test.ts`,
  `geo-equivalencia.test.ts` y `carga-division.test.ts` sin tocarlos. *Hecho:* verdes (R13, R14, R19,
  R34, R35, R36 siguen cumpliéndose sin la ruta).
  _(Excepción autorizada por Camilo el 2026-10-29: en `slt43-migraciones-aditivas.test.ts:119` el control
  `/UPDATE nodo_geografico/` pasa a `/ON CONFLICT \(id\) DO UPDATE/`, porque el único `UPDATE` vivía en el trigger
  de descendientes retirado. Además, en `geo-backfill.test.ts` (R33) los hosts de ejemplo de Supabase se arman con
  constantes interpoladas para la guardia `recursos-origen-fuera`; mismas cadenas y expectativas.)_
- [ ] **T8.11** Cierre de la tanda: typecheck, lint, todas las guardias y los tests de SLT-43 (como en
  T7.1); en `progress/impl_SLT-43.md`, una entrada de la enmienda con el mapa `R<n> → test`
  actualizado (R8 y R11 retirados, R7 con los casos nuevos). *Hecho:* todo verde y el `gate-completo`
  del PR #44 en verde.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261030120000_geo_enums_nodo_geografico/migration.sql`
- `db/migrations/20261030120000_geo_enums_nodo_geografico/down.sql`
- `db/migrations/20261030120100_tipo_nivel_geografico/migration.sql`
- `db/migrations/20261030120100_tipo_nivel_geografico/down.sql`
- `db/migrations/20261030120200_nodo_geografico/migration.sql`
- `db/migrations/20261030120200_nodo_geografico/down.sql`
- `db/migrations/20261030120300_nodo_geografico_sincronia/migration.sql`
- `db/migrations/20261030120300_nodo_geografico_sincronia/down.sql`
- `db/migrations/20261030120400_columnas_nodo_geografico/migration.sql`
- `db/migrations/20261030120400_columnas_nodo_geografico/down.sql`
- `db/migrations/20261030120500_indices_nodo_geografico/migration.sql`
- `db/migrations/20261030120500_indices_nodo_geografico/down.sql`
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
