# impl SLT-48 «Geografía jerárquica: retirar modelo viejo»

## T0 — Maqueta

- [x] **T0.1** Maqueta armada por el leader: `specs/SLT-48-geo-jerarquica-contract/maqueta-SLT-48.html`
  (commit a1452d24).
- [x] **T0.2** Aprobada por el humano el 2026-11-17 («Aprobada»). Detalle en `progress/features/SLT-48.md`
  (commit d2f39ed9). R42.

Reglas del humano para T4 (respuestas a los 6 puntos abiertos de la maqueta):
1. El modal Mover desglosa los descendientes por nivel («6 manzanas y 32 lotes»).
2. Los selectores que sobran después de la hoja se ven apagados, no ocultos.
3. Si la hoja está más arriba que el último nivel, el aviso la muestra con su tipo («Barrio: Las Acacias»).
   «Sin <nivel>» queda solo para las órdenes que quedaron a medias.
4. En un país de 2 niveles, la sección de grupos de tarifas se ve vacía, con la explicación y sin el botón
   de crear.
5. El buscador de zonas nombra los 3 primeros tipos y luego «…».
6. En el modal Mover, la fila del camino se llama «Ubicación», no «Ruta».

Los textos provisionales se quedan como los propone la maqueta.

## T1 — Base y Prisma (backend_dev, 2026-11-17)

Base de trabajo: `servi_logistic_slt48` en el Postgres local (`localhost:5432`), creada para esta feature,
migrada con `pnpm exec prisma migrate deploy` y sembrada con `pnpm run db:seed`. El `.env` del repo
apunta a `localhost` (`servi_logistic_simprod`); no se usó. Ninguna base remota, de producción ni de
Ordenex. Las bases auxiliares (`…_proto`, `…_shadow`) se crearon para T1.1 y se borraron al terminar.

### T1.1 — Prisma 7.8 y las vistas: **camino A**

**Postgres.**
- Base de tests local: `PostgreSQL 16.1, compiled by Visual C++ build 1937, 64-bit` (≥ 15: `security_invoker` vale).
- CI: `postgres:17` (`docs/verification.md`).
- Supabase del proyecto: **ABIERTO**. No se puede saber sin tocar el proyecto remoto, y no se tocó. Una persona
  tiene que confirmarlo antes del deploy: si fuera < 15, `WITH (security_invoker = true)` falla y la migración
  no entra.

**`migrate diff --from-migrations` no sirve en este repo, con o sin vistas.** Probado sobre la rama sin cambios:
```
$ prisma migrate diff --from-migrations db/migrations --to-schema db/schema.prisma --script   (shadow = servi_logistic_slt48_shadow)
Error: P3006
Migration `20261022130000_organizacion_y_rol_app` failed to apply cleanly to the shadow database.
Database error code: 42P01
ERROR: no existe la relación «_prisma_migrations»
```
Es el mismo P3006 que citan las migraciones del repo («`db:migrate:create` falla con P3006»). Se usó el
equivalente que ya usa el repo (comentarios de la 169 y la 294 en `schema.prisma`): `--from-config-datasource`
contra una base con todas las migraciones aplicadas.
```
$ prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script   (rama sin cambios)
-- This is an empty migration.
```

**Camino A, prototipo** (copia del esquema con `previewFeatures = ["views"]` y `view Provincia/Canton/Distrito`):
1. `prisma validate` con `@id` y `@@index`: rechazado (`Views cannot have primary keys`, `Views cannot have
   indexes`, 7 errores). Con `@unique` en lugar de `@id`, sin `@@index` ni defaults y con las relaciones de
   `Orden`, `ZonaDistrito`, `DistritoZonaEspecial` y `Pais` intactas:
   `The schema at …\A\schema.prisma is valid 🚀`. **Criterio 1: cumple.**
2. Sobre una copia de la base con el prototipo de la migración aplicado (tablas → vistas, sin FK, `provincia_id`
   y `canton_id` nullable): `prisma migrate diff --from-config-datasource --to-schema A/schema.prisma --script` →
   `-- This is an empty migration.` No propone `CREATE TABLE` ni FK. **Criterio 2: cumple.**
3. `prisma generate` + `pnpm run typecheck`: el cliente conserva `prisma.provincia/canton/distrito` (`findMany`,
   `findFirst`, `findUnique`) y los `select`/`where` por relación (`canton.provincia`, `distrito.canton`,
   `orden.distrito`, `zonaDistrito.distrito`…). `geografia-activa.ts`, `GrupoDistritosRepository`,
   `TarifasPantallaRepository` y `ZonaRepository` compilan sin cambios. Solo desaparecen `create`/`update`/`delete`
   de las tres, que es lo que se busca (R2). **Criterio 3: cumple.**

**Decisión: camino A.** T2.8 (camino B) no aplica.

Con el esquema final (T1.4) y la base migrada con las dos migraciones de SLT-48:
```
$ pnpm exec prisma validate      → The schema at db\schema.prisma is valid 🚀
$ pnpm exec prisma generate      → ✔ Generated Prisma Client (v7.8.0)
$ prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script
-- This is an empty migration.
```
Las vistas conservan los `@@unique` de las tablas (`[paisId, nombre]`, `[provinciaId, nombre]`, `[cantonId, nombre]`,
`[paisId, codigoDta]`, `[id, paisId]`) para el cliente (`findUnique` de `scripts/demo-qa/receta.ts`). En la base los
garantizan los únicos de `nodo_geografico`.

### Commits

| Task | Commit |
|---|---|
| T1.2 | `9cc13e9d` feat(SLT-48): T1.2 valor nodo_geografico_movido del historial de plataforma |
| T1.3 | `72a4a6a2` feat(SLT-48): T1.3 migracion geografia vieja a vistas, con down.sql e ida y vuelta |
| T1.4 | `9540c83f` feat(SLT-48): T1.4 schema.prisma con provincia, canton y distrito como view (camino A) |
| T1.5 | `650010ed` test(SLT-48): T1.5 guardia de migraciones con lo destructivo declarado (R13, R14) |
| T1.8 | `c4abde41` test(SLT-48): T1.8 fabrica y fixtures base a nodos, helper sin-slt48 |
| T1.6 | `8c0410d9` test(SLT-48): T1.6 vistas de geografia y triggers de orden y pais contra Postgres |
| T1.7 | `4aaf12b5` test(SLT-48): T1.7 coste por fila de los triggers de orden sobre el arbol (R10) |
| guardias | `d08f5418` test(SLT-48): guardias de SL-17 y de catalogos con las vistas de geografia; T1 marcada |

T1.1 no tiene commit propio: su resultado es esta sección y el `schema.prisma` de T1.4.

### Archivos

Creados:
- `db/migrations/20261117120000_slt48_historial_nodo_movido/{migration.sql,down.sql}`
- `db/migrations/20261117120100_slt48_geografia_vieja_a_vistas/{migration.sql,down.sql}`
- `tests/integration/db/migracion-slt48-ida-y-vuelta.test.ts`
- `tests/integration/db/slt48-vistas-geografia.test.ts`
- `tests/integration/db/slt48-triggers-orden-pais.test.ts`
- `tests/integration/db/slt48-trigger-orden-rendimiento.test.ts`
- `tests/integration/db/_fixtures/sin-slt48.ts`
- `tests/unit/db/slt48-migraciones-declaradas.test.ts`

Modificados:
- `db/schema.prisma` (`previewFeatures = ["views"]`, tres `view`, 3 FK de `Orden` nullable, valor de enum)
- `tests/unit/db/_migraciones-aditivas.ts` (opción `destructivasDeclaradas`, apagada por defecto)
- `tests/fabricas/paises.ts` (`crearNodoDeNivel`; `crearGeografiaDePrueba` escribe nodos)
- `tests/integration/db/_fixtures/geo-43.ts`, `geo-44.ts`, `geo-47.ts`, `geo-71.ts` (nodos con `crearNodoDeNivel`)
- `tests/unit/guards/organizacion-en-modelos.guardia.test.ts` (el parser lee también los bloques `view`; sin cambiar
  aserciones)
- `specs/SLT-48-geo-jerarquica-contract/tasks.md` (T1.1–T1.8 marcadas)

### Mapa R → test (lo cubierto en T1)

| R | Test |
|---|---|
| R1 | `slt48-vistas-geografia.test.ts` («las tres son vistas con las columnas de antes», «una fila por nodo…»); `migracion-slt48-ida-y-vuelta.test.ts` (las vistas repiten fila a fila lo que tenían las tablas) |
| R2 | `slt48-vistas-geografia.test.ts` («INSERT, UPDATE y DELETE … se rechazan»). Ver el desvío 1 |
| R3 | `slt48-vistas-geografia.test.ts` («con la empresa de un país se ve solo ese país…») |
| R4 | `migracion-slt48-ida-y-vuelta.test.ts` («R4/R20/R1: la ida quita las 5 FK y dos NOT NULL…») |
| R5 | `slt48-vistas-geografia.test.ts` (sin triggers ni funciones de sincronía; crear, renombrar, retirar y mover se ven al instante) |
| R6 | `migracion-slt48-ida-y-vuelta.test.ts` («R6: con nodos en NULL (también en una orden borrada) la ida aborta…») |
| R7 | `slt48-triggers-orden-pais.test.ts` (tres casos R7) |
| R8 | `slt48-triggers-orden-pais.test.ts` («R8: zona_distrito y distrito_zona_especial rechazan…») |
| R9 | `slt48-triggers-orden-pais.test.ts` (dos casos R9) |
| R10 | `slt48-trigger-orden-rendimiento.test.ts` |
| R11 | `migracion-slt48-ida-y-vuelta.test.ts` (vuelta y reaplicación) |
| R12 | `migracion-slt48-ida-y-vuelta.test.ts` («R12: una orden en un nodo de profundidad 1 aborta la vuelta…») |
| R13 | `slt48-migraciones-declaradas.test.ts`; `migracion-slt48-ida-y-vuelta.test.ts` (down.sql en disco y orden) |
| R14 | `slt48-migraciones-declaradas.test.ts` (contraprueba R14) |
| R20 | `migracion-slt48-ida-y-vuelta.test.ts` (las filas viejas de `orden`, `zona_distrito` y `distrito_zona_especial` quedan idénticas tras la ida) |

### Salida real

```
$ pnpm exec vitest run tests/integration/db/migracion-slt48-ida-y-vuelta.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm exec vitest run tests/integration/db/slt48-vistas-geografia.test.ts tests/integration/db/slt48-triggers-orden-pais.test.ts
 Test Files  2 passed (2)
      Tests  12 passed (12)

$ pnpm exec vitest run tests/integration/db/slt48-trigger-orden-rendimiento.test.ts
[SLT-48 R10] PostgreSQL 16.1, compiled by Visual C++ build 1937, 64-bit
[SLT-48 R10] 5000 filas × 3 rondas por forma (INSERT … SELECT)
[SLT-48 R10] nodo ronda 1: con 7214.8 ms, sin 8483.1 ms, (con − sin) / filas = -0.25365 ms
[SLT-48 R10] nodo ronda 2: con 8152.8 ms, sin 8297.1 ms, (con − sin) / filas = -0.02885 ms
[SLT-48 R10] nodo ronda 3: con 12450.7 ms, sin 7280.2 ms, (con − sin) / filas = 1.03410 ms
[SLT-48 R10] nodo: mediana por fila = -0.02885 ms (tope 1 ms)
[SLT-48 R10] fk ronda 1: con 9227.2 ms, sin 7100.2 ms, (con − sin) / filas = 0.42541 ms
[SLT-48 R10] fk ronda 2: con 7265.5 ms, sin 7897.6 ms, (con − sin) / filas = -0.12643 ms
[SLT-48 R10] fk ronda 3: con 7711.4 ms, sin 6527.5 ms, (con − sin) / filas = 0.23678 ms
[SLT-48 R10] fk: mediana por fila = 0.23678 ms (tope 1 ms)
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
La máquina es ruidosa. Cada `INSERT` de 5 000 filas tarda ~7 s por los otros triggers de `orden` (cobro de
plataforma, tope del plan), y una ronda suelta llegó a 1,03 ms. La mediana queda dentro del tope en las dos
formas. Conviene mirarlo también en CI (`postgres:17`).

```
$ pnpm exec vitest run tests/unit/db/slt48-migraciones-declaradas.test.ts tests/unit/db/slt43-migraciones-aditivas.test.ts \
    tests/unit/db/slt46-migraciones-aditivas.test.ts tests/unit/db/slt89-migraciones-aditivas.test.ts
 Test Files  4 passed (4)
      Tests  40 passed (40)

$ (T1.8) vitest run --maxWorkers=3 geo-47-fixture geo-65-fixture geo-71-fixture geo-125-fixture geo-consultas-* \
    geo-filtros-lugar geo-analitica-lugar geo-lecturas-* geo-nodo-* geo-tipo-nivel geo-transito-nombres zona-nodo-* \
    orden-nodo-mas-profundo geografia-dos-paises geografia-superadmin-sin-empresa pais-tipos-edicion \
    slt46-pais-tipos-de-nivel organizacion-alta empresas-plataforma geo-equivalencia-{dinero,filtros,consultas,analitica} \
    slt89-equivalencia-cr
 Test Files  1 failed | 36 passed (37)
      Tests  1 failed | 227 passed (228)     ← orden-nodo-mas-profundo «R28: un nodo fuera de la rama…»: ver «Aserciones»
$ vitest run v2-geografia.route v2-aislamiento.route pais-repositorio pais-tabla pais-disponible organizacion-pais-inmutable
 Test Files  6 passed (6)
      Tests  29 passed (29)

$ pnpm run test:guardias
 Test Files  6 failed | 333 passed (339)
      Tests  31 failed | 4733 passed | 1 skipped (4765)
```
Los 6 archivos en rojo de esa corrida de guardias:
- `catalogo-postgres-acota-esquema.guardia` (culpa mía: una consulta sin `table_schema`) y
  `organizacion-en-modelos.guardia` (su parser no leía `view`): **arreglados** en `d08f5418`. Al volver a correrlos:
  `3 passed (3)`, `26 passed (26)`.
- `dependencias-declaradas-presentes.guardia`: está en `tests/baseline-rojos.json`; no es de esta feature.
- `zona-central-guarda-y-rastro`, `zona-guardado-conserva-costos` y `zona-guardado-conserva-inactivos` (el filtro `guard`
  los recoge por «guarda/guardado»): hacen `tx.distrito.create` directamente → `Operation 'createOne' for model
  'Distrito' does not match any query`. Están en la lista de design §9 / `tasks.md > Tests existentes`: **son T5**.

`pnpm exec eslint` sobre los archivos tocados: 0 errores y 0 avisos.

`pnpm run typecheck`: **161 errores**, todos esperados (ver abajo). Antes de T1.4 la rama compilaba limpia.

### Errores de typecheck esperados para T2 (producción)

Todos vienen de que `Orden.provinciaId`/`cantonId` pasan a `string | null` (R4) mientras los lectores aún leen las 3 FK:
- `lib/repositories/CierreDiaRepository.ts`: 484, 485, 516, 521, 522, 646 (T2.6)
- `lib/repositories/OrdenRepository.ts`: 1202, 1203, 1462, 2218, 2313, 2895, 2937, 2951, 2952, 3648, 3649, 3703, 3704,
  3717, 4340, 4495, 6030, 6044 (T2.2/T2.5)
- `lib/repositories/GestionOrdenRepository.ts`: 337
- `lib/repositories/OrdenEnvioReader.ts`: 103
- `lib/repositories/OrdenGeocodeRepository.ts`: 52
- `scripts/geo-equivalencia/consultas-de-hoy.ts`: 183, 186, 289, 290
- `scripts/geo-equivalencia-analitica.ts`: 222, 223
- `scripts/geo-equivalencia-consultas.ts`: 514
- `scripts/geo-equivalencia-filtros.ts`: 152
- `scripts/geo-equivalencia-presentacion.ts`: 110

`GestionOrdenRepository`, `OrdenEnvioReader`, `OrdenGeocodeRepository` y los 5 scripts `geo-equivalencia*` **no están**
en `tasks.md > Archivos esperados`. Los tres repositorios pasan la orden a `lugarDeLaOrden`/`ruta-del-lugar` y deberían
compilar en cuanto T2.5 cambie la firma a `{ nodoGeograficoId }`. Los scripts leen a propósito «la lectura congelada por
las FK» (design §5); T2 decide si se tipan con `string | null` o si entran en la lista.

Tests (125 errores en 39 archivos): `create`/`update` sobre las vistas y FK nullable. Son de T5 (design §9), salvo
`e2e/geo-presentacion-4-niveles.spec.ts` (T6.1) y estos, que **no están en la lista de T5**:
`tests/integration/db/_fixtures/caja-459.ts`, `_fixtures/geo-65.ts`, `_postgres-real.ts`, `emisor-relaciones-anidadas`,
`geo-125-cierre-snapshot`, `geo-125-geocode-cache`, `geo-125-nombres-catalogo` y `geo-equivalencia-presentacion`. En
todos el error es que la orden ahora tiene `provinciaId`/`cantonId` nullable; a primera vista ninguno obliga a cambiar
aserciones.

### Desvíos y decisiones

1. **R2 y `servi_app`.** R2 pide que también `servi_app` reciba un error que nombre `nodo_geografico`. Design §2.1 y §10
   piden «`GRANT SELECT` a `servi_app` y ningún otro permiso». Las dos cosas no caben juntas: Postgres comprueba el
   permiso sobre la vista **antes** de disparar el `INSTEAD OF`, así que `servi_app` recibe `42501` (permiso denegado)
   y no `SL048`. Se siguió el diseño (solo `SELECT`, el mínimo privilegio). El test afirma `42501` para `servi_app`,
   `SL048` con mensaje sobre `nodo_geografico` para el dueño, y que nada cambia en los dos casos. **Pide decisión
   humana**: o se acepta así y se ajusta el texto de R2, o se da `INSERT, UPDATE, DELETE` a `servi_app` sobre las
   vistas (el trigger lo seguiría rechazando).
2. **`orden_nodo_geografico` en UPDATE.** Design §2.1.4 dice «si NEW trae nodo, se conserva». En un UPDATE el nodo
   siempre viene (es el de antes). Se conserva salvo cuando el UPDATE cambia las FK y no el nodo: entonces el nodo
   pasa al lugar nuevo, como hoy. Sin esto, un `UPDATE orden SET distrito_id = …` a mano dejaría el nodo viejo. En un
   INSERT con nodo, el nodo se conserva siempre (R9).
3. **`geografia_del_pais_de_la_empresa`** mira el nodo **y** los ids de las FK que traiga la fila (en `nodo_geografico`),
   no `COALESCE(nodo, distrito)`. El trigger de país corre antes que el que copia o pone el nodo (van por orden
   alfabético). En un UPDATE de `distrito_id` el nodo todavía es el viejo, y con el `COALESCE` pasaría un distrito de
   otro país. Así además se mantiene el `SL021` de una orden de SQL a mano con solo la provincia de otro país (lo afirma
   `geografia-por-pais.test.ts`). Los tres triggers de país se recrean para saltar también con `UPDATE OF
   nodo_geografico_id` (R7: «o se cambia su nodo»).
4. **`geografia_pais_del_padre()`** también se borra: sus dos triggers vivían en las tablas viejas y quedaba huérfana.
   Está declarada en la guardia y el `down.sql` la repone.
5. **`down.sql` de la migración del enum**: no hace nada (`SELECT 1`), como los de SLT-46 y SLT-89. Design §2.1 pedía
   recrear el tipo sin el valor, pero eso necesita `RENAME`, que la guardia de SLT-48 prohíbe (R14) y que la épica GEO
   no usa. El valor sin usar es inocuo.
6. **Precondición del `down.sql` (R12)**: aborta si alguna orden está en un nodo de profundidad distinta de 2 y 3, que
   es lo que dice R12. No se añadió la condición extra de design §2.1 («o un país cuya profundidad máxima no es 3»):
   una orden en un distrito de un país de 4 niveles sí se puede expresar con las 3 FK.
7. **Guardia R13**: mira solo los `migration.sql`, como SLT-43, 46 y 89. El `down.sql` deshace a propósito y lo prueba
   la ida y vuelta.
8. **`sin-slt48.ts`**: design §9 dice «en la misma transacción de test», pero no puede ser: los dos archivos traen su
   propio `BEGIN`/`COMMIT`. El helper los aplica uno tras otro sobre la conexión de la base propia del test.
9. **`--from-migrations`** no funciona en este repo (P3006, ver T1.1). El criterio 2 se comprobó con
   `--from-config-datasource`.

### Aserciones que piden autorización (no se tocaron)

- `tests/integration/db/orden-nodo-mas-profundo.test.ts` › «R28: un nodo fuera de la rama del lugar se pisa con el
  lugar» (SLT-89): `expect(r.nodos).toEqual([distritoId, distritoId, distritoId])`. Inserta órdenes con FK **y** con un
  nodo de fuera de su rama, y espera que la base pise el nodo con el lugar. SLT-48 quita a propósito esa «búsqueda
  subiendo» (design §2.1.4), y R9 dice «SI la orden trae nodo, la base NO DEBE cambiarlo»: ahora el nodo se conserva.
  El test contradice el requisito nuevo, así que hay que reescribirlo (afirmando que el nodo se conserva) o retirarlo.
  No está en la lista de T5.

**Veredicto T1:** hecha con el camino A. Migraciones, guardia, triggers, vistas y rendimiento en verde contra
Postgres 16. Quedan 161 errores de typecheck esperados para T2/T5, una decisión humana sobre R2 y `servi_app`, y una
aserción de SLT-89 que pide autorización.
