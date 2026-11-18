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

## T2 — Servidor: escrituras, lectores y tarifas (backend_dev, 2026-11-17)

Base: `servi_logistic_slt48` (local, la de T1). Nada remoto, ni producción ni su copia ni Ordenex. Ninguna
dependencia nueva. El MCP del grafo no se usó (Grep/Read). **T2.8 no aplica** (camino A).

### Commits

| Task | Commit |
|---|---|
| T2.1 | `5bdfba94` feat: regla de hoja en geo-ubicacion (esHoja, msgUbicacionIncompleta) |
| T2.2 | `f2569b9b` feat: vías de entrada con la regla de hoja; la orden se crea solo con su nodo |
| T2.3 | `b3ae2be9` feat: corrección de ubicación a nodoId con la regla de hoja |
| T2.4 | `3ba50fd8` feat: distritoDeTarifa: el grupo de tarifas desde el nodo (P3) |
| T2.5 (+ T2.2, T2.3, T2.7 dentro de `OrdenRepository`) | `5380c4e2` feat: lectores al nodo: lugar, ruta, filtros, tránsito, D = P |
| T2.6 | `d3ab088a` feat: cierre con nombres, marca y snapshot desde la ruta del nodo |
| desvío (scripts) | `10a34cf7` chore: scripts geo-equivalencia/explain compilan con las FK nullable |
| T2.9 | `3aad3c79` test: guardia orden-fk-geo-sin-uso (R29) sustituye a geografia-lecturas-sin-nodo-fk |
| T2.4–T2.7 | `b99d3eae` test: integración contra Postgres (tarifas, filtro, tránsito, cierre, v1) |
| T2.2, T2.3 | `67a18b48` test: regla de hoja en la carga y en v1; entradas de corrección a nodoId |
| T2.9 | `7db299b0` test: constancia del guardia retirado; nombre del nivel 3 por nombresDeLaRuta |
| cierre de la tanda | `test(SLT-48): T2 fixtures de DTO sin las 3 FK; tasks.md y bitácora` (el último de la rama) |

`OrdenRepository.ts` e `IOrdenRepository.ts` llevan cambios de T2.2, T2.3, T2.4, T2.5 y T2.7 en un solo commit
(`5380c4e2`): sin `git add -p` no se podían partir por hunks. Los commits intermedios no compilan solos; el último sí.

### Archivos

Producción modificados:
- `lib/services/{geo-ubicacion,geo-resolucion,geografia-dominio,BulkOrdenService,CotizacionOrdenService,CorregirDatosClienteService}.ts`
- `lib/types/{api-v2,orden,correccion-datos-cliente}.ts`, `lib/actions/corregir-datos-cliente.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`, `lib/interfaces/services/ICorregirDatosClienteService.ts`
- `lib/repositories/{OrdenRepository,CierreDiaRepository,CierresAdminRepository,ZonaRepository,InformeTransitoRepository}.ts`
- `lib/repositories/{GestionOrdenRepository,OrdenEnvioReader,OrdenGeocodeRepository}.ts` (desvío, ver abajo)
- `lib/repositories/_shared/{lugar-orden,ruta-del-lugar}.ts`, `lib/utils/ubicacion-presentacion.ts`
- `scripts/geo-equivalencia-{analitica,consultas,filtros,presentacion}.ts`, `scripts/geo-equivalencia/{consultas-de-hoy,lecturas-de-hoy}.ts`, `scripts/geo-explain-consultas.ts` (desvío)

Tests nuevos:
- `tests/unit/guards/orden-fk-geo-sin-uso.guardia.test.ts`
- `tests/unit/services/geografia-dominio.distrito-de-tarifa.test.ts`
- `tests/integration/db/{slt48-tarifas-equivalencia,slt48-filtro-orden-nueva,informe-transito-nodo,cierre-dia-snapshot-nodo}.test.ts`
- `tests/integration/api/v1-ordenes-lugar.route.test.ts`

Test borrado: `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` (T2.9: «sustituye»). Sus citas
`R → test` en los `design.md` de SLT-44 (R12), SLT-65 (R19) y SLT-71 (R14) llevan `@test-desaparecido` con el motivo
(lo exige la guardia `test-citado-desaparecido`).

Tests existentes con bloques NUEVOS de SLT-48, sin tocar los viejos: `geo-ubicacion`, `lugar-orden`,
`ubicacion-presentacion`, `bulk-orden-service.n-niveles`, `geo-resolucion-v1-mensajes`, `orden-nodo-escritura`.

Tests existentes con solo ENTRADAS cambiadas (firmas, dobles, fixtures; ningún `expect`):
- `ruta-del-lugar`, `lugar-orden` (dos llamadas), `ubicacion-presentacion` (una `rutaDelLugar`);
- los 5 `corregir-*` de servicio (dobles `findLugarParaCorreccion`/`LugarResueltoRow`, filas y entradas con `nodoId`);
- `orden-lugar-owner` (copia local de `fksDeNodo` solo para armar el fixture), `geo-consultas-cierre` (R5: el
  `select` de hoy), `geografia-vieja-sin-escritor` (cabecera y texto del mensaje, pedido por T2.9);
- `bulk-orden-service`, `bulk-orden-service.carga-api`, `orden-service`, `rol-admin-satelite-authz`: el nombre del
  método del doble;
- los fixtures de `OrdenDTO`/`OrdenListItemDTO`/`CreateOrdenData` que llevaban `provinciaId`/`cantonId`/`distritoId`
  (unos 60 archivos de `tests/components`, `tests/unit`, `tests/fixtures` y `tests/integration`): se quitaron esas
  líneas del objeto y nada más. La única que caía dentro de un `expect` (`orden-repository.bulk.test.ts`,
  `distritoId: true` del `select` de `zonaDistrito`) se repuso, y `rechazo-tienda-service.test.ts` se restauró entero
  (su `distritoId` es el lugar de tarifa de `OrdenBaseCobroDevolucionRow`, que sigue).

### Mapa R → test (lo cubierto en T2)

| R | Test |
|---|---|
| R15 | `orden-nodo-escritura.test.ts` › «SLT-48 — la orden guarda solo su nodo» (v1, v2, repositorio con y sin guía); `bulk-orden-service.n-niveles.test.ts` › «SLT-48 R15/R17/R18» |
| R16 | `orden-nodo-escritura.test.ts` › «R16 — corregir la ubicación de una orden vieja…» (nodo nuevo, 3 FK en NULL) |
| R17 | `geo-ubicacion.test.ts` › «SLT-48 R17/R18» (CR con y sin distritos, raíz, hijos retirados = hoja); `bulk-orden-service.n-niveles.test.ts` (R17) |
| R18 | `geo-ubicacion.test.ts` (2, 4 y 10 niveles; «no habilitado» no sale); `bulk-orden-service.n-niveles.test.ts` (2 y 4 niveles) |
| R19 | `geo-resolucion-v1-mensajes.test.ts` › «SLT-48 R19» |
| R22 | `lugar-orden.test.ts` › «SLT-48 R22/R23»; `ruta-del-lugar.test.ts`; `orden-lugar-owner.test.ts` |
| R23 | `lugar-orden.test.ts`; `slt48-filtro-orden-nueva.test.ts` (listado y analítica, niveles 3 y 4) |
| R24 | `slt48-filtro-orden-nueva.test.ts` (conteo sin entregar con una orden nueva) |
| R25 | `ubicacion-presentacion.test.ts` › «SLT-48 R25/R26»; `informe-transito-nodo.test.ts` |
| R26 (servidor) | `ubicacion-presentacion.test.ts` (ruta de nivel 4). El E2E es T6.1 |
| R27 | `cierre-dia-snapshot-nodo.test.ts`; `geo-consultas-cierre.test.ts` › R5 (vieja = hoy) |
| R28 | `v1-ordenes-lugar.route.test.ts` |
| R29 | `orden-fk-geo-sin-uso.guardia.test.ts` (con contraprueba) |
| R31, R32 | `geografia-dominio.distrito-de-tarifa.test.ts`; `slt48-tarifas-equivalencia.test.ts`; `tarifas-flexibles-resolver.test.ts` y `slt89-equivalencia-cr.test.ts` verdes sin cambios |

### Salida real (resumida)

```
unit: geo-ubicacion, lugar-orden, ruta-del-lugar, ubicacion-presentacion, geografia-dominio.distrito-de-tarifa
  → bloques SLT-48 verdes; 25 rojos, todos aserciones viejas (lista abajo)
orden-fk-geo-sin-uso.guardia                                          18 passed (18)
test-citado-desaparecido + presentacion-lugar-del-catalogo + orden-fk-geo-sin-uso   38 passed (38)
bulk-orden-service.n-niveles -t SLT-48                                3 passed
geo-resolucion-v1-mensajes                                            23 passed | 1 failed (control viejo)
corregir-* (5 de servicio) + corregir-datos-cliente.action            111 passed | 10 failed (aserciones viejas)
integración (Postgres 16 local):
  orden-nodo-escritura           4 passed (SLT-48) | 5 failed (SLT-45, aserciones viejas)
  slt48-tarifas-equivalencia 1/1 · slt48-filtro-orden-nueva 2/2 · informe-transito-nodo 1/1
  cierre-dia-snapshot-nodo 2/2 · v1-ordenes-lugar.route 1/1 (una vez rojo en paralelo con otro archivo; solo y repetido, verde)
  orden-lugar-owner + slt89-equivalencia-cr + tarifas-flexibles-resolver   37 passed (37)
  geo-filtros-lugar, geo-analitica-lugar, geo-transito-nombres, geo-125-cierre-snapshot   verdes
  geo-consultas-cierre 4/5 (R6: nombre de la tabla en el mensaje) · geo-consultas-ordenes 1 rojo (forma de la fila)
  geografia-ordenes-sin-entregar, zona-reconciliacion-ordenes: `tx.distrito.create` → T5
pnpm run test:guardias, rojos: corregir-datos-sin-rastro (2, aserciones), dependencias-declaradas-presentes
  (baseline), zona-central-guarda-y-rastro, zona-guardado-conserva-costos, zona-guardado-conserva-inactivos (T5)
eslint sobre lo tocado: 0 errores (avisos previos en IOrdenRepository, ZonaRepository y geo-equivalencia-analitica)
```

Los 59 archivos de test con fixtures editados (solo entradas): 57 verdes; los 2 rojos son las 4 aserciones de FK de
`bulk-orden-service(.carga-api)` listadas abajo.

### Typecheck que queda (`pnpm run typecheck`)

**Producción: 0 errores** (al empezar T2 eran 36). Tests: 183 errores.
- T5/T6 (lista de `design §9`/`tasks.md > Tests existentes` o del mismo tipo: `tx.distrito.create` y FK nullable en
  fixtures): `tests/integration/db/*` (43 archivos) y `e2e/geo-presentacion-4-niveles.spec.ts`. Entre ellos, fuera de
  la lista de T5 (ya los nombró T1): `_fixtures/caja-459.ts`, `_fixtures/geo-65.ts`, `_postgres-real.ts`,
  `emisor-relaciones-anidadas`, `geo-125-cierre-snapshot`, `geo-125-geocode-cache`, `geo-125-nombres-catalogo`,
  `geo-equivalencia-presentacion`; y nuevos de T2: `corregir-ubicacion-geocode`, `cobro-plataforma-plan`,
  `pago-plataforma-sl45-concurrencia`, `orden-remision-borrada-libera-numero` (FK `string | null` o `create` con la terna).
- Aserciones viejas (lista de autorización): `geo-ubicacion.test.ts` (6, importa lo que salió),
  `corregir-datos-cliente-service.test.ts` (6), `ordenes-descarga-columnas.test.ts` (3),
  `bulk-orden-service.n-niveles`, `bulk-orden-service.forma-pais`, `api-v2-servicios` y los 3 `v2-*.route` (1 cada uno:
  importan `MSG_PAIS_NO_HABILITADO`).
- UI (T4.2): `tests/components/CorregirDatosCliente.novedades.test.tsx` (2: la precarga trae `nodoId` y `ruta`).


### Desvíos y decisiones

1. **Archivos fuera de la lista**: `GestionOrdenRepository`, `OrdenEnvioReader`, `OrdenGeocodeRepository` (el
   `select` pasa a `nodoGeograficoId`), `CierresAdminRepository` (el pago de un rechazo corregido lee
   `orden.distrito_id` → `distritoDeTarifa`), `ZonaRepository` (el aviso de impacto de tarifa leía
   `orden.distrito_id`; la guardia R29 lo encontró) y los scripts `geo-equivalencia*`/`geo-explain-consultas`.
   Los scripts miden lo mismo sobre órdenes viejas: la lectura de hoy pide las FK aparte
   (`SNAPSHOT_SELECT_DE_HOY` = el de `lib/` + las FK) y la fila nueva de corrección se proyecta a la terna
   (niveles 1–3 de la ruta) para compararla. No se ejecutaron.
2. **`ResolvedGeo`** pasa de la terna a `{ nodoId, distritoId, zonaId, esCentral, esZonaEspecial }`. `distritoId`
   conserva el nombre interno de `ParTarifa` (design §6) y es el lugar del grupo (`distritoDeTarifa`), no una FK.
3. **v1 y la orden de cantón sin distritos**: v1 (`resolveGeo`) sigue exigiendo distrito («distrito requerido»),
   como su contrato de hoy; la regla de hoja se aplica al distrito nombrado (R19). En CR, un cantón sin distritos
   entra por v2 o por la corrección, no por v1. Si R17 debe valer también por v1, es un cambio de contrato
   público: **decisión humana**.
4. **`DistritoRow.tipoHijosActivos`** (para R19) solo viaja cuando el distrito no es hoja: en un país de 3 niveles la
   fila queda igual que la de hoy (`slt89-equivalencia-cr` la compara entera).
5. **Mensaje de R17**: `msgUbicacionIncompleta(nombre, tipoPlural)` →
   `ubicacion incompleta: '<nombre>' tiene <plural en minúsculas> debajo; indica el ultimo nivel`. El tipo es el de
   los hijos activos. En la corrección se usa el mismo; los demás textos de la corrección (`El distrito indicado no
   existe`, `Ese distrito fue retirado…`, `…no tiene una zona unica…`) y la clave `fieldErrors.distritoId` se
   conservan para el modal de hoy; T4.2 decide si cambian.
6. **Corrección**: desaparece la comprobación de la cadena provincia → cantón → distrito (327/R6): con un solo nodo
   la da el árbol. El repositorio pone las 3 FK en NULL solo cuando cambia el nodo (`FK_GEO_VIEJAS_EN_NULL`, la
   única escritura de las FK que queda; la guardia R29 permite `: null`). `obtenerUbicacion` añade `nodoId` y `ruta`
   y conserva `provinciaId`/`cantonId`/`distritoId` sacados de la ruta (no de las FK) para que el modal de hoy
   compile hasta T4.2. **El modal de hoy manda la terna y el schema ahora es `.strict()` con `nodoId`: la corrección
   desde la pantalla queda rota hasta T4.2.**
7. **`ApiOrdenLecturaService` y `RechazoTiendaService`** no cambian: el repositorio ya les entrega el lugar de
   tarifa calculado con `distritoDeTarifa` en `costeo.distritoId` y `OrdenBaseCobroDevolucionRow.distritoId`.
8. **`OrdenDTO`** pierde la terna y gana `nodoGeograficoId?` (opcional, mismo patrón aditivo que
   `mensajeroAsignadoId?`); ninguna pantalla leía la terna del DTO.
9. **Tránsito (R25)**: `canton`/`distrito` de cada fila son `dosMasHondos(ruta, P)` con D = P; en CR, cantón y
   distrito como hoy. Una orden sin nodo o con el nodo fuera del catálogo sigue fallando con el log de R12.
10. **Cierre**: los descriptivos se leen ANTES de la tarifa (traen el catálogo del que sale el lugar del grupo); la
    marca congelada es la del nodo (`descriptivos.lugares`). Un nodo fuera del catálogo revierte el cierre con
    «falta la fila de `nodo_geografico`».
11. **API v1 y R28**: el contrato público de v1 no publica provincia, cantón ni distrito (`ApiZonaDTO`: «ni la
    geografía»). R28 se prueba como «misma respuesta con y sin FK». Si R28 pedía añadir esos campos, es
    **decisión humana** (cambio de contrato).

### Aserciones que piden autorización (no se tocaron)

Todas afirman lo que SLT-48 cambia a propósito (regla de SLT-45, «país no habilitado», FK escritas, forma vieja de
la corrección o de `whereLugarEn`/`sqlLugarEn`, D = min(P, 3)):

- `tests/unit/services/geo-ubicacion.test.ts`: los 6 de «R15/R33 — forma del país y regla de guardado»
  (`esPaisDeTresNiveles`, `admiteGuardado`, `MSG_PAIS_NO_HABILITADO`), «un cantón con zona propia resuelve en
  profundidad 2» (`u.fks`) y los 4 de «R25 — las tres FK se derivan de la ruta del nodo» (`fksDeNodo`). Las funciones
  salen por T2.1.
- `tests/unit/repositories/lugar-orden.test.ts`: «no mira … tampoco nodoGeograficoId (R19)», los 4 de
  «SLT-65 — whereLugarEn» (forma `OR` de dos FK) y los 4 de «SLT-71 — sqlLugarEn».
- `tests/unit/utils/ubicacion-presentacion.test.ts`: «país de 4 niveles: los niveles 2·3…», «país de 10 niveles:
  también los niveles 2·3…», «país de 4 niveles: los tipos de los niveles 2 y 3», «no depende del orden…» (espera
  Comuna·Barrio), «país de 10 niveles: los niveles 2 y 3» (D = min(P,3); design §5 pide D = P).
- `tests/unit/repositories/lugares-del-filtro.test.ts` › «R11: un parámetro de array por rama» (dos ramas → una).
- `tests/unit/repositories/orden-repository-filtros.test.ts` › «un lugar de distrito no puede seleccionar una fila
  con distrito NULL» (espera el `OR` de FK).
- `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` › «con todo bien, resuelve (control positivo)» y
  `geo-resolucion-retirados.test.ts` › «la terna resuelve igual que siempre» (`geo.distritoId`… ahora es el lugar de
  tarifa; el primero espera `provinciaId`/`cantonId` en `geo`).
- `tests/unit/services/bulk-orden-service.n-niveles.test.ts` (7), `bulk-orden-service.forma-pais.test.ts` (8),
  `api-v2-servicios.test.ts` (4), `bulk-orden-service.test.ts` (3: `arg[0].provinciaId`…),
  `bulk-orden-service.carga-api.test.ts` (1: `provinciaId: "p1"` en `createManyOrdenesConGuia`): esperan las 3 FK en
  la orden creada o «país no habilitado».
- `tests/integration/api/v2-paises-de-prueba.route.test.ts`, `v2-ordenes.route.test.ts`, `v2-cotizacion.route.test.ts`:
  esperan `MSG_PAIS_NO_HABILITADO` (R18 dice que no sale nunca). No se corrieron (rojos seguros).
- `tests/integration/db/orden-nodo-escritura.test.ts`: los 5 de «SLT-45 T3.3» (FK escritas; `fksDeNodo`; el cuerpo del
  trigger de SLT-43, que T1 ya reescribió).
- Corrección (contrato `nodoId`): `corregir-datos-cliente-service.test.ts` (7: cadena provincia/cantón, `cambios`
  y `data` con la terna, los «NUEVE valores» de la precarga), `corregir-datos-cliente-bodega-satelite.test.ts` (1:
  `data.distritoId`), `corregir-datos-cliente.action.test.ts` (2: la terna llega al servicio),
  `correccion-datos-cliente-schema.test.ts` (3: la terna en el schema, «los tres juntos»),
  `corregir-datos-sin-rastro.guardia.test.ts` (2: `CorregirDatosClienteData` y el `.pick()` deben nombrar la terna).
- `tests/unit/components/ordenes-descarga-columnas.test.ts`: lee `orden.provinciaId/cantonId/distritoId` en la lista de
  ids que no deben salir (el DTO ya no los tiene; no compila).
- `tests/integration/db/geo-consultas-cierre.test.ts` › R6 (espera «falta la fila de `canton|distrito`», ahora
  `nodo_geografico`) y `geo-consultas-ordenes.test.ts` › «cobro de la devolución y corrección: la fila entera es la de
  hoy» (la fila de corrección cambió de forma).
- Sigue pendiente la de T1: `orden-nodo-mas-profundo.test.ts` › R28 (SLT-89). No se tocó.

### Decisiones humanas abiertas

1. v1 y el cantón sin distritos (desvío 3).
2. R28: ¿v1 debe publicar provincia/cantón/distrito? Hoy no los publica (desvío 11).
3. Las aserciones de arriba: reescribir al requisito nuevo o retirar.

**Veredicto T2:** servidor en el nodo, con regla de hoja y tarifa por `distritoDeTarifa`; producción compila, la
guardia R29 está verde y los tests nuevos de R15–R19, R22–R25, R27–R29 y R31–R32 pasan contra Postgres; quedan rojas
las aserciones viejas listadas (piden autorización) y los tests de T5/T6.

## Decisiones del humano tras T2 (2026-11-17, `progress/features/SLT-48.md` commit ff1c7c8a)

- **Postgres de producción (Supabase):** el humano confirma que es 15 o más, así que `security_invoker` vale. Ya no queda abierto.
- **R2:** se acepta el `42501` para `servi_app`, que no recibe permisos de escritura sobre las vistas. `SL048` queda para el dueño de la base y los scripts. Se corrigió el texto de R2 en `requirements.md`; su test se ajusta en T3+.
- **API v1:** queda igual y sigue exigiendo el distrito. Un cantón sin distritos solo entra por v2 o por la pantalla. Está anotado en las Decisiones cerradas y lo fijará un test.
- **R28:** la v1 responde exactamente lo mismo que hoy, sin campos nuevos. Se corrigió el texto.
- **Aserciones:** hay autorización para cambiar las ~70 que contradicen una decisión cerrada de SLT-48, incluida `orden-nodo-mas-profundo` › R28 de SLT-89, que contradice R9. Cada cambio cita su R de SLT-48 en un comentario y en esta bitácora.
- **Archivos fuera de la lista:** están añadidos a `tasks.md > Archivos esperados > Añadidos tras T2`.

## Aserciones autorizadas (backend_dev, 2026-11-17)

Autorización del humano del 2026-11-17 («Decisiones del humano tras T2»). Cada aserción cambiada lleva en el test un
comentario `// SLT-48 R<n>: …`. Base: `servi_logistic_slt48` local. Las de `tests/components/CorregirDatosCliente.*`
son del frontend_dev (T4.2) y no se tocaron.

| Archivo › test | Antes → después | R |
|---|---|---|
| `tests/unit/services/geo-ubicacion.test.ts` › «es de 3 niveles solo si…» (renombrado «la forma del pais ya no decide…») | `esPaisDeTresNiveles(DOS/TRES/CUATRO/[])` → `esHoja` de la hoja de 2, 3 y 4 niveles `true`, nivel 3 de 4 `false` | R18 |
| idem › «en un pais de 3 niveles admite las profundidades 2 y 3, no la 1» (renombrado) | `admiteGuardado` R1/C1/D1 = `false/true/true` → `esHoja` R1/C1/C4/D1 = `false/false/true/true` | R17 |
| idem › «en paises de 2 y 4 niveles no admite ninguna…» (renombrado) | todo `false` → `[false,true]` y `[false,false,false,true]` | R18 |
| idem › «una raiz de un pais de 3 niveles da «pais no habilitado»…» (renombrado) | `MSG_PAIS_NO_HABILITADO` → `msgUbicacionIncompleta("Montaña","Niveles 2")` | R17, R18 |
| idem › «R33: en un pais de 2 niveles…» | todo «pais no habilitado» → la raíz «incompleta», `A1` resuelve | R18 |
| idem › «R33: en un pais de 4 niveles…» | X2/X3 «pais no habilitado» → X3 resuelve, X2 «incompleta … niveles 4» | R18 |
| idem › «un canton con zona propia resuelve en profundidad 2» | `u.fks` = terna → `u.ruta` = `[R2, C5]` y sin `fks` | R15 |
| idem › describe «R25 — las tres FK…» (4 tests) | `fksDeNodo(...)` → `rutaPublica(...)`, `esHoja`, `u.ruta`, y `u` sin `fks` | R15, R17, R18 |
| `tests/unit/repositories/lugar-orden.test.ts` › «no mira ninguna otra columna…» | `"c-1"` (FK) → `"otro"` (el nodo) | R22 |
| idem › 4 de «SLT-65 — whereLugarEn» | `{ OR: [distrito, canton] }` → `{ nodoGeograficoId: { in } }` | R23 |
| idem › 4 de «SLT-71 — sqlLugarEn» | SQL `(o.distrito_id … OR … canton_id …)` con dos parámetros → `o."nodo_geografico_id" = ANY($1)` con uno | R23 |
| `tests/unit/repositories/lugares-del-filtro.test.ts` › «R11: un parametro de array por rama…» | 2 arrays → 1 | R23 |
| `tests/unit/repositories/orden-repository-filtros.test.ts` › «un lugar de distrito no puede seleccionar…» | `AND: [{ OR: … }]` → `AND: [{ nodoGeograficoId: { in: ["d1"] } }]` | R23 |
| `tests/unit/utils/ubicacion-presentacion.test.ts` › «pais de 4 niveles: los niveles 2·3…» | `{Providencia, Bellavista}` → `{Bellavista, null}` (D = P) | R25 |
| idem › «pais de 10 niveles: tambien los niveles 2·3…» | `{B, C}` → `{null, null}` | R25 |
| idem › «pais de 4 niveles: los tipos de los niveles 2 y 3» | `[Comuna, Barrio]` → `[Barrio, Sector]` | R25 |
| idem › «no depende del orden…» | `[Comuna, Barrio]` → `[Barrio, Sector]` | R25 |
| idem › «pais de 10 niveles: los niveles 2 y 3» | `[Tramo 2, Tramo 3]` → `[Tramo 9, Tramo 10]` | R25 |
| `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` › «con todo bien, resuelve (control positivo)» | `geo` con `provinciaId/cantonId` → `{ nodoId, distritoId, … }` | R15 |
| `tests/unit/services/bulk-orden-service.n-niveles.test.ts` › «ruta completa → … sus 3 FK», «… (distrito vacio)», «con catalogo de forma CR…», «sin catalogo inyectado…» | terna en `CreateOrdenData` → solo `nodoGeograficoId`, las 3 FK `undefined` | R15 |
| idem › «R15 antes que R16: la profundidad 1 no se guarda…» | «pais no habilitado» → `msgUbicacionIncompleta("Alfa","Niveles 2")` | R17 |
| idem › «pais de 2 niveles» / «pais de 4 niveles» (it.each) | error «pais no habilitado», nada creado → la hoja se crea con su nodo, sin errores | R18 |
| `tests/unit/services/bulk-orden-service.forma-pais.test.ts` › carga v1, 2 y 4 niveles (it.each) | 3 errores «pais no habilitado», nada creado ni leído → 2 creadas, 1 error de `num_remision`, sin «no habilitado»; se crea, se tarifa y se lee la geografía de v1 | R18 |
| idem › «pais de 3 niveles: la comprobacion pasa…» | terna → `nodoGeograficoId` y FK `undefined` | R15 |
| idem › cotización v1, 2 y 4 niveles (it.each) | 2 errores «pais no habilitado» → 2 cotizadas, sin «no habilitado» | R18 |
| idem › «profundidad 3 por ruta…», «profundidad 2 por codigo…» | terna en `createData` → solo nodo, FK `undefined` | R15 |
| idem › «un fallo del motor deja la fila en error…» | entrada `["Alfa","Uno"]` + «pais no habilitado» → entrada `["Alfa"]` + «incompleta» (la hoja de 2 niveles ya entra) | R17, R18 |
| `tests/unit/services/api-v2-servicios.test.ts` › «R17/R21 — misma respuesta que v1…» | terna en la orden creada → nodo y FK `undefined` | R15 |
| idem › «R12–R16 — cada fila mala…» (fila R-8) | «pais no habilitado» → «incompleta: 'Alta' … niveles 2» | R17 |
| idem › «R15 — pais de 2 niveles: «pais no habilitado»…» (renombrado) | 2 errores, nada creado → 0 errores, 2 creadas en `A1` | R18 |
| idem › cotización «R12–R16» (fila 4) | «pais no habilitado» → «incompleta» | R17 |
| `tests/unit/services/bulk-orden-service.test.ts` › «deriva zonaId…», «R14: … la fila se CREA», «R27/R33: acentos…» | `provinciaId/cantonId/distritoId` → `nodoGeograficoId: "d1"` y FK `undefined` | R15 |
| `tests/unit/services/bulk-orden-service.carga-api.test.ts` › «R28: fila con provincia/canton/distrito separados…» | terna en `createManyOrdenesConGuia` → nodo y FK `undefined` | R15 |
| `tests/unit/services/corregir-datos-cliente-service.test.ts` › «327/P2: el adminTienda SI puede mover…», «R15/R5 — CON la confirmacion…», «NO bloquea: con la confirmacion…» | `cambios: ["distritoId"]` → `["nodoId"]`; `data` `{distritoId, zonaId, nodo}` → `{zonaId, nodoGeograficoId}` | R16 |
| idem › «mover los TRES ids…» (renombrado) | `cambios` con la terna → `["nodoId"]` | R16 |
| idem › «el distrito no pertenece al CANTON…» y «el canton no pertenece a la PROVINCIA…» (reescritos) | `validation_error` por la cadena → (1) con un nodo no hay cadena: se busca el lugar por el nodo y sigue al gate; (2) un nodo que no es hoja da `validation_error` «incompleta» sin escribir. Sus entradas (`cantonId`/`provinciaId` en `LugarResueltoRow`) ya no existen | R16, R17 |
| idem › «con permiso devuelve los NUEVE valores…» | precarga sin `nodoId`/`ruta` → con `nodoId` y `ruta` | R16 (R43) |
| idem › «los NUEVE valores identicos…» | solo la entrada: terna → `nodoId` (no compilaba) | R16 |
| `tests/unit/services/corregir-datos-cliente-bodega-satelite.test.ts` › «⭑ corregir el distrito DENTRO de la misma zona…» | `distritoId: "d-2"` → `nodoGeograficoId: "d-2"` | R16 |
| `tests/unit/actions/corregir-datos-cliente.action.test.ts` › «327/R1: los NUEVE campos…» (renombrado), «el aviso del servidor llega…» | terna en la entrada y en la llamada → `nodoId` | R16 |
| `tests/unit/types/correccion-datos-cliente-schema.test.ts` › «327/R1: acepta los NUEVE juntos» (renombrado), «327/R2: `zonaId` no cuela…», «con un campo de verdad al lado…» | entrada con la terna → con `nodoId` | R16 |
| idem › «los tres juntos son validos» (renombrado) | `true` → `false` (la terna ya no es válida), y `nodoId` solo es válido | R16 |
| `tests/unit/guards/corregir-datos-sin-rastro.guardia.test.ts` › «el tipo de escritura … SIETE prohibidos» | `CorregirDatosClienteData` contiene la terna → contiene `nodoGeograficoId` y no la terna | R16, R29 |
| idem › «327/R5 — `zonaId` esta en el tipo…» | el `.pick()` contiene `distritoId` → contiene `nodoId` y no `distritoId` | R16 |
| `tests/unit/components/ordenes-descarga-columnas.test.ts` › ids que no deben salir | `orden.provinciaId/cantonId/distritoId` (ya no están en el DTO) → `orden.nodoGeograficoId` | R15, R22 |
| `tests/integration/api/v2-paises-de-prueba.route.test.ts` › «R33/R15 … por nombre y por codigo…» (renombrado) | cada nodo activo «pais no habilitado» → hoja «sin zona», no hoja «incompleta» (calculado del fixture); contrapruebas iguales | R17, R18 |
| idem › «R15/R33 … crear, lote y cotizacion de v2…» (renombrado) | 7 × «pais no habilitado» → la hoja «sin zona», la raíz «incompleta» | R17, R18 |
| idem › «R5 … la carga y la cotizacion de v1…» (renombrado) | «pais no habilitado» bajo `ubicacion` → 4 niveles: «incompleta» (R19) bajo `ubicacion`; 2 niveles: «distrito no encontrado en el canton»; la otra fila «provincia no encontrada» | R18, R19 |
| `tests/integration/api/v2-ordenes.route.test.ts` › «R15: una ubicacion que no cumple la regla de guardado…» (renombrado) | «pais no habilitado» → «incompleta: 'Cartago' … cantones» | R17 |
| idem › «R16: un canton de CR…» (renombrado). **No estaba en la lista de T2; contradice R17** | Paraíso «sin zona» → «incompleta: 'Paraíso' tiene distritos debajo» | R17 |
| idem › «R17: la orden creada por v2 guarda su nodo y las FK…» (renombrado). **No estaba en la lista de T2; contradice R15** | FK = ruta → FK `null` | R15 |
| `tests/integration/api/v2-cotizacion.route.test.ts` › «R19 (+R12, R15, R16): una fila mala…» | fila 3 «pais no habilitado» → «incompleta»; fila 4 (Paraíso) «sin zona» → «incompleta» | R17 |
| `tests/integration/db/orden-nodo-escritura.test.ts` › los 4 de «SLT-45 T3.3» (renombrados) | FK = ruta del nodo y nodo = `COALESCE` → FK `NULL`, la ruta se lee del árbol (`padre_id`), `COALESCE` es `NULL`; `u.fks` → `u.ruta`; la corrección manda solo `nodoGeograficoId` | R15, R16, R22 |
| idem › «R28 — el trigger `orden_nodo_geografico`…» (renombrado) | cuerpo `NEW.nodo := COALESCE(...)` → el cuerpo de R9 (deriva solo si falta) | R9 |
| `tests/integration/db/orden-nodo-mas-profundo.test.ts` › «R28: un nodo fuera de la rama del lugar se pisa…» (SLT-89; renombrado) | `[distrito, distrito, distrito]` → `[sectorDelOtro, otroDistrito, provincia]` (el nodo se conserva) | R9 |
| `tests/integration/db/geo-consultas-cierre.test.ts` › «R6: si el canton…» | mensaje con `canton` o `distrito` → con `nodo_geografico` | R27 |
| `tests/integration/db/geo-consultas-ordenes.test.ts` › «cobro de la devolucion y correccion…» | `correccionNueva == correccionHoy` → igual salvo la terna, que pasa a `nodoId` (= distrito ?? cantón), `distritoTarifaId` (= distrito) y `ruta` (= las FK de hoy, sin nulos) | R16, R22 |

No se cambiaron (no contradicen una decisión cerrada y pasan tal cual):
- `tests/unit/services/geo-resolucion-retirados.test.ts` › «la terna resuelve igual que siempre»: estaba en la lista de T2,
  pero pasa sin cambios (`geo.distritoId` es el lugar de tarifa y coincide con el distrito).
- `tests/unit/actions/corregir-datos-cliente.action.test.ts` › «delega…» y «los campos ausentes viajan como `undefined`»:
  nombran `provinciaId: undefined` en el objeto esperado y pasan porque `toHaveBeenCalledWith` iguala `undefined` con
  ausente. No contradicen nada.

### R2 (punto 2)

`tests/integration/db/slt48-vistas-geografia.test.ts` › R2: el nombre y el comentario citan el texto corregido de R2.
Se añade que `servi_app` tiene `SELECT` y ningún `INSERT/UPDATE/DELETE` sobre las tres vistas (`has_table_privilege`).
Las aserciones de antes se quedan: `SL048` que nombra `nodo_geografico` para el dueño, `42501` para `servi_app` y la
huella intacta.

### API v1 y el cantón sin distritos (punto 3)

`tests/unit/services/geo-resolucion-v1-mensajes.test.ts` › describe «SLT-48 — v1 sigue exigiendo el distrito; un canton
sin distritos solo entra por v2» (3 tests):
- por v1, el cantón sin distritos con el distrito vacío da «distrito requerido: la zona de la orden se deriva del
  distrito» bajo `distrito`;
- nombrándolo también como distrito, da «distrito no encontrado en el canton»;
- por v2 (`resolverUbicacion`, por ruta y por código) el mismo cantón es hoja y resuelve con su zona.

### Test intermitente `v1-ordenes-lugar.route.test.ts` (punto 4)

**Causa: no es una colisión de datos entre archivos.** El listado de v1 ordena solo por `createdAt desc`. El fixture
`geo-65` inserta todas las órdenes con `now()` dentro de una misma transacción, y en Postgres `now()` es la hora de
inicio de la transacción: todas empatan y el orden entre ellas no está definido. El `UPDATE` que pone las 3 FK en NULL
reescribe las filas y puede cambiar ese orden entre la primera y la segunda lectura. Se reprodujo **solo**, sin otro
archivo en paralelo: la diferencia era la misma orden en otra posición del listado («Zona sur» antes o después de
«Zona central»), con los mismos datos.

**Arreglo (solo en el test):** `conEmpatesOrdenados` ordena los empates por `numRemision` y comprueba antes que el orden
por `createdAt` es el que devolvió el servicio. El contrato de v1 (R28: misma respuesta) no cambia; el orden entre
órdenes con la misma hora nunca estuvo definido. No se tocó el `orderBy` de producción (fuera del alcance de SLT-48).

Evidencia:
```
solo, 3 veces:                                   Tests  1 passed (1)  ×3
en paralelo con geo-consultas-ordenes y cierre-dia-snapshot-nodo (--maxWorkers=3), 3 veces:
                                                 Test Files  3 passed (3) · Tests  9 passed (9)  ×3
```

## T4 (sin T4.1) — Pantallas (frontend_dev, 2026-11-17)

T4.1 (modal Mover) queda fuera: espera al servidor de T3. Base para T4.5: `servi_logistic_slt48` local
(`DATABASE_URL` exportado a ella solo para ese test). Nada remoto, ni producción ni Ordenex. Ninguna dependencia nueva.

### Commits

| Task | Commit | Qué |
|---|---|---|
| T4.2 | eb76740a | Corregir ubicación: un selector por nivel del país hasta una hoja; manda `nodoId`; aviso con el tipo del último nivel |
| T4.3 | 98ceaefd | Etiquetas de lugar del historial: `rutaDeHojaARaiz` y `valorDeRuta` (ruta entera, separador de hoy) |
| T4.4 | 30a97bd3 | Tarifas (grupos por el nivel 3 del país, 2 niveles sin grupos) y zonas (cuenta del último nivel) |
| T4.5 | 80a38ada | `carga-masiva-4-niveles.test.ts` contra Postgres (sin cambio de producción) |
| T4.6 | 369cccc2 | Guardia `etiquetas-geograficas-sin-literal` ampliada a las pantallas de N niveles |

### Archivos

Producción:
- `app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx` — lee `niveles` y `lugares` del catálogo (no las listas
  planas), un `Select` por nivel en un `fieldset`, `nodoId` en vez de la terna, error de ubicación (`nodoId` o
  `distritoId`) junto al selector del lugar.
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx` — fila del lugar rotulada con el tipo del último nivel;
  celda «Barrio: Las Acacias» si la hoja está más arriba; «Sin <nivel>» solo a medias.
- `app/(app)/ordenes/_components/corregir-ubicacion-arbol.ts` (nuevo) — regla de hoja (P2) y estado de cada selector, puro.
- `lib/types/historial-accion-etiquetas.ts` — `SEPARADOR_DE_RUTA`, `rutaDeHojaARaiz`, `valorDeRuta` (para el
  `valor_anterior`/`valor_nuevo` de «nodo movido», R38; lo usa T3).
- `app/(app)/configuracion/_shared/nivel-del-grupo.ts` (nuevo) — `PROFUNDIDAD_DEL_GRUPO = 3` (P3), `nivelDelGrupo`,
  `nombresDeNiveles`. En `_shared/` y no en `tarifas/_components/` porque `TarifasDisposicion.test.tsx` fija los 10
  archivos de esa carpeta.
- `app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx`, `TarifasZonas.tsx`, `tarifas-textos.ts`.
- `app/(app)/configuracion/zonas/_components/GeografiaSelector.tsx`, `CrearZonaForm.tsx`, `seleccion-de-zona.ts`
  (`distritosBajo` → `lugaresDelNivelBajo` + `profundidadDelUltimoNivel`).
- `filtrar-arbol-geografico.ts` y `lib/utils/plantilla-geo.ts`: sin cambio (el selector ya usaba `filtrarArbolDeNodos`; la
  plantilla ya traía una columna por nivel).

Tests nuevos: `tests/components/CorregirUbicacionNNiveles.test.tsx`, `tests/unit/types/historial-accion-etiquetas-ruta.test.ts`,
`tests/components/TarifasGruposNNiveles.test.tsx`, `tests/components/ZonasNNiveles.test.tsx`,
`tests/integration/db/carga-masiva-4-niveles.test.ts`, `tests/fixtures/archivos-slt48.ts`.

Tests tocados (solo entradas: fixtures con `nodoId`, `ruta`, `niveles` y `lugares`; ninguna aserción):
`tests/components/CorregirDatosCliente.ordenes.test.tsx`, `tests/components/CorregirDatosCliente.novedades.test.tsx`,
`tests/unit/components/corregir-ubicacion-inactivos.test.tsx`. Ampliado: `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts`.

### Mapa R → test

| R | Test |
|---|---|
| R43 | `tests/components/CorregirUbicacionNNiveles.test.tsx` (CR, 2, 4 y 10 niveles; hoja alta; a medias; aviso) + `CorregirDatosCliente.*` y `corregir-ubicacion-inactivos` en CR |
| R44 (y R38, la ruta como valor) | `tests/unit/types/historial-accion-etiquetas-ruta.test.ts` |
| R45 | `tests/components/TarifasGruposNNiveles.test.tsx`, `tests/components/ZonasNNiveles.test.tsx` + `TarifasGrupos.test.tsx`, `geografia-arbol-n-niveles.test.tsx` sin cambios |
| R46 | `tests/integration/db/carga-masiva-4-niveles.test.ts` |
| R47 | `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` › «SLT-48 / R47» |

### Desvíos respecto de la maqueta (y textos de CR que cambian)

El tipo de nivel del país no trae género ni artículo, y la guardia R47 prohíbe la palabra de Costa Rica también en
minúscula en estas pantallas. Por eso algunos textos de CR que llevaban artículo pasan a la forma neutra que la maqueta
usa para los otros países. Ningún test los afirmaba; **son cambios visibles en CR, para que el humano los confirme**:

1. Selector vacío: «Elige un distrito» → «Elige distrito» (la maqueta: CR «Elige un distrito», 4 niveles «Elige barrio»).
2. «Falta completar: el distrito.» → «Falta completar: distrito.» (la maqueta: CR con artículo, 4 niveles «barrio.»).
3. «La zona se calcula a partir del distrito.» → «…a partir del lugar.» (la maqueta lo propone para 2 niveles).
4. Aviso: «Al cambiar el distrito, la orden…» → «Al cambiar el lugar, la orden…» (la maqueta lo propone para 4 niveles).
5. Aviso, flete especial sin pacto: «el distrito está marcado como especial…» → «el lugar está marcado…» (fuera de la
   maqueta; en un país de 4 niveles la marca es del nodo).
6. «No se pudo cargar el catálogo de provincias, cantones y distritos.» → «No se pudo cargar el catálogo de lugares.»

Otros:
7. **«Ubicación incompleta: «Viña» tiene barrios debajo…» no se pinta en la pantalla.** La maqueta lo enseña en el caso
   de 4 niveles y no en el de CR, con «Guardar» apagado en los dos. Se dejó como en CR («Falta completar: <nivel>»); el
   texto del servidor sigue saliendo junto al selector si llega un rechazo.
8. En la orden a medias, «Sin <nivel>» nombra el nivel que FALTA (el siguiente a la hoja guardada); en CR sale
   «Sin distrito» como hoy. Sin lugar (orden de SQL a mano), el del nivel 1.
9. Grupos en un país de 2 niveles: título «<zona>: grupos» (la maqueta no lo fija) y la explicación de la maqueta
   («Este país no tiene nivel 3: sus órdenes usan el valor de la zona.»).
10. `TEXTOS.gruposUnicidad` sigue con «Un <nivel>»: en un país cuyo nivel 3 es femenino sale «Un comuna» (la maqueta:
    «Una comuna»). No se cambió porque cambiaría CR. Pendiente de decisión.
11. Buscador de zonas: ya nombraba los 3 primeros tipos y «…» (regla 5): sin cambio. El resumen y el modal de guardado
    cuentan ahora los lugares del ÚLTIMO nivel del país («Viña (comuna, 2 barrios)»); en CR, los distritos como hoy.

### Aserciones que piden autorización (no se tocaron)

Afirman la carga útil vieja de la corrección (la terna), que el servidor de T2 ya no acepta (`.strict()` con `nodoId`,
R16). No son visibles. Con el modal nuevo están en rojo:

- `tests/components/CorregirDatosCliente.ordenes.test.tsx` › «y sólo el botón del panel reenvía CONFIRMANDO, con el
  distrito nuevo»: `segunda.distritoId` = `"dis-patarra"`, `segunda.cantonId` = `"can-desamp"`, `segunda.provinciaId` =
  `"prov-sj"`. Propuesta: `expect(segunda.nodoId).toBe("dis-patarra")` y `not.toHaveProperty("distritoId")`.
- `tests/components/CorregirDatosCliente.novedades.test.tsx` › «enseña la comparación, no escribe, y sólo el botón del
  panel confirma»: `entradaDeLlamada(1).distritoId` = `"dis-patarra"`. Propuesta: `.nodoId`.

Las de «precarga caída» (`entrada.provinciaId|cantonId|distritoId` `toBeUndefined()`) siguen verdes.

**Cambiadas (autorizadas por el humano el 2026-11-17; contradicen R16), frontend_dev:**

| Archivo | Test | Antes → después | R |
|---|---|---|---|
| `tests/components/CorregirDatosCliente.ordenes.test.tsx` | «y sólo el botón del panel reenvía CONFIRMANDO, con el distrito nuevo» | `segunda.distritoId`/`cantonId`/`provinciaId` = `dis-patarra`/`can-desamp`/`prov-sj` → `segunda.nodoId` = `"dis-patarra"` y `not.toHaveProperty("distritoId")` | R16 |
| `tests/components/CorregirDatosCliente.novedades.test.tsx` | «enseña la comparación, no escribe, y sólo el botón del panel confirma» | `entradaDeLlamada(1).distritoId` = `"dis-patarra"` → `entradaDeLlamada(1).nodoId` = `"dis-patarra"` | R16 |

Cada una lleva su `// SLT-48 R16: ...`. Con eso: `CorregirDatosCliente.{ordenes,novedades}` + `CorregirUbicacionNNiveles`
→ `Test Files 3 passed (3) · Tests 65 passed (65)`. T4.2 cerrada.

### Lo que T4 deja para otros

- T3 (backend): `valorDeRuta` está listo para el `valor_anterior`/`valor_nuevo` de «nodo movido» (R38).
- El servidor de la corrección sigue colgando sus rechazos de `fieldErrors.distritoId`; el modal lee `nodoId` y
  `distritoId`. Si el backend los pasa a `nodoId`, la pantalla ya lo pinta.

### Salida real (resumida, `NODE_OPTIONS=--max-old-space-size=8192`)

```
$ pnpm exec vitest run <13 archivos de T4: CorregirUbicacionNNiveles, CorregirDatosCliente.{ordenes,novedades},
    corregir-ubicacion-inactivos, historial-accion-etiquetas-ruta, historial-accion-entidades, TarifasGruposNNiveles,
    ZonasNNiveles, TarifasGrupos, TarifasDisposicion, geografia-arbol-n-niveles, etiquetas-geograficas-sin-literal,
    corregir-datos-sin-rastro>
 Test Files  2 failed | 11 passed (13)
      Tests  2 failed | 204 passed (206)      ← las 2 de carga útil que piden autorización (arriba)

$ DATABASE_URL=…/servi_logistic_slt48 pnpm exec vitest run tests/integration/db/carga-masiva-4-niveles.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ pnpm run typecheck        → exit 2: 156 errores, todos en tests/integration/db/* y e2e/geo-presentacion-4-niveles
                              (T5/T6 y fixtures del backend). 0 en producción, 0 en archivos de T4.
$ pnpm run lint             → exit 0: 0 errors, 246 warnings (ninguno nuevo en archivos de T4)
$ pnpm run test:guardias    → Test Files 2 failed | 334 passed | 3 skipped · Tests 5 failed | 4734 passed
    - descargas-por-registro: timeout de 20 s con la máquina cargada; solo, verde.
    - dependencias-declaradas-presentes (4): init.sh no tiene el marcador «>>> FIN PASO 2: DEPENDENCIAS (ficha
      420) <<<» ni llama a scripts/verificar-dependencias.mjs. Ajeno a T4 (init.sh no se tocó en esta rama);
      es del arnés.
```

**Veredicto T4 (sin T4.1):** T4.3–T4.6 hechas y verdes; T4.2 hecha, con 2 aserciones de carga útil (terna → `nodoId`)
pendientes de autorización y 6 textos de CR sin artículo para confirmar.

## T3 — Mover nodo, servidor (backend_dev, 2026-11-17)

Base `servi_logistic_slt48` local. Ninguna dependencia ni migración nueva (el valor de enum es de T1.2). El MCP del
grafo no se usó (Grep/Read).

### Archivos

Producción:
- `lib/types/geografia-nodo.ts`: `vistaPreviaMoverNodoSchema`, `moverNodoSchema`, `MotivoDeNoMover`,
  `MENSAJE_DE_MOTIVO_DE_MOVER` y los DTO de la vista previa (descendientes por nivel, bloqueo).
- `lib/services/geografia-dominio.ts`: `catalogoConPadre`, `grupoYMarcaDeOrden`, `ordenesQueCambiarianAlMover` (puras).
- `lib/interfaces/repositories/IGeoRepository.ts` y `lib/repositories/GeoRepository.ts`: `vistaPreviaMover`, `mover`.
- `lib/interfaces/services/IGeografiaService.ts` y `lib/services/GeografiaService.ts`: `vistaPreviaMoverNodo`, `moverNodo`.
- `lib/actions/geografia-plataforma.ts`: `vistaPreviaMoverNodoAction`, `moverNodoAction`.

Tests:
- nuevos: `tests/unit/actions/geografia-plataforma.mover.test.ts`, `tests/integration/db/geografia-mover-nodo.test.ts`,
  `tests/integration/db/geografia-mover-nodo-ordenes.test.ts`;
- `tests/unit/actions/geografia-plataforma-action.test.ts`: el doble gana los dos métodos (entrada) y **una aserción
  autorizada** › «son exactamente estas actions…»: la lista de exports gana `moverNodoAction` y
  `vistaPreviaMoverNodoAction`, y `mover` sale de la regex prohibida (`padre` y el resto se quedan). La de SLT-46 R22
  decía «ninguna mueve un nodo de padre»; contradice SLT-48 R34 (decisión heredada «Mover nodos: va en SLT-48»). Lleva
  su comentario `// SLT-48 R34`.

### Firmas para el frontend (T4.1)

```ts
// lib/actions/geografia-plataforma.ts  ("use server")
export async function vistaPreviaMoverNodoAction(input: unknown, deps?: GeografiaPlataformaDeps): Promise<VistaPreviaMoverNodoActionResult>;
//   input: { id: string; padreIdNuevo: string }                         (vistaPreviaMoverNodoSchema, .strict())
export async function moverNodoAction(input: unknown, deps?: GeografiaPlataformaDeps): Promise<MoverNodoActionResult>;
//   input: { id: string; padreIdNuevo: string; padreIdAnterior: string } (moverNodoSchema, .strict())
//   padreIdAnterior = `vista.padreIdAnterior` de la vista previa (R37)

export type VistaPreviaMoverNodoActionResult = VistaPreviaMoverNodoServiceResult | ErrorDeValidacion | SinPermiso | ErrorInterno;
export type MoverNodoActionResult = MoverNodoServiceResult | ErrorDeValidacion | SinPermiso | ErrorInterno;
//   SinPermiso = { status: "unauthenticated" } | { status: "forbidden" }; ErrorInterno = { status: "error" }
//   ErrorDeValidacion = { status: "validation_error"; fieldErrors: Record<string, string[]> }

// lib/interfaces/services/IGeografiaService.ts
export type VistaPreviaMoverNodoServiceResult =
  | { status: "ok"; vista: VistaPreviaMoverNodoDTO }                 // vista.bloqueo !== null → no dejar confirmar (P1)
  | { status: "validation_error"; fieldErrors: Record<string, string[]> } // R35: en `id` (raíz) o `padreIdNuevo`
  | { status: "conflict" }                                           // el destino ya tiene un hijo con ese nombre
  | { status: "not_found" }
  | { status: "forbidden" };
export type MoverNodoServiceResult =
  | { status: "ok"; id: string; padreId: string }
  | { status: "validation_error"; fieldErrors: Record<string, string[]>; bloqueo?: BloqueoDeMoverDTO } // R35, o P1 en `id`
  | { status: "conflict" }                                           // hermano con el mismo nombre (también en carrera)
  | { status: "conflict"; motivo: "cambio_concurrente" }             // R37
  | { status: "not_found" }
  | { status: "forbidden" };

// lib/types/geografia-nodo.ts
export interface VistaPreviaMoverNodoDTO {
  nodo: { id: string; nombre: string; profundidad: number; tipoSingular: string };
  padreIdAnterior: string;
  rutaActual: PasoDeRuta[];   // de la raíz al nodo: { id, nombre }[]
  rutaNueva: PasoDeRuta[];
  descendientes: { total: number; porNivel: DescendientesDeNivelDTO[] };
  ordenesQueCambianDeNombre: number;
  bloqueo: BloqueoDeMoverDTO | null;
}
export interface DescendientesDeNivelDTO { profundidad: number; tipoSingular: string; tipoPlural: string; cantidad: number }
export interface BloqueoDeMoverDTO { ordenes: number; empresas: EmpresaConOrdenesAfectadasDTO[] }
export interface EmpresaConOrdenesAfectadasDTO { id: string; nombre: string; ordenes: number }
export type MotivoDeNoMover = "es_raiz" | "destino_no_existe" | "destino_de_otro_pais"
  | "destino_de_otra_profundidad" | "destino_es_el_padre_actual" | "destino_retirado";
export const MENSAJE_DE_MOTIVO_DE_MOVER: Record<MotivoDeNoMover, string>;
```

Los descendientes por nivel vienen ordenados de arriba abajo, con el tipo del país: «2 comunas y 2 sectores» se arma
con `cantidad` + `tipoSingular`/`tipoPlural`. El bloqueo trae las empresas ordenadas por órdenes (más primero).

### Mapa R → test (T3)

| R | Test |
|---|---|
| R34 | `geografia-plataforma.mover.test.ts` › «SLT-48 R34 — solo el superadmin mueve…» (sin sesión, 4 roles de empresa en el borde y en el servicio, sin escribir; el superadmin corre en `comoPlataforma`) |
| R35 | `geografia-mover-nodo.test.ts` › «R35, P4: cada motivo…» (6 motivos + no existe, en la vista previa y al mover, huella intacta), «P4: … en cascada», «R35: un hermano con el mismo nombre…» (`conflict`); `geografia-plataforma.mover.test.ts` (traducción de cada desenlace, `conflict` del único en carrera) |
| R36 | `geografia-mover-nodo.test.ts` › «R36: la vista previa da las rutas, los descendientes por nivel…»; `geografia-mover-nodo-ordenes.test.ts` (órdenes que cambian de nombre, bloqueo en la vista previa) |
| R37 | `geografia-mover-nodo.test.ts` › «R37: si el padre ya no es el que mostró el modal…» |
| R38 | `geografia-mover-nodo.test.ts` › «R34, R38: mover escribe solo `padre_id` y su fila…» y «R38: si la fila de historial no se puede escribir, el movimiento no persiste» |
| R39 | `geografia-mover-nodo-ordenes.test.ts` › «R39, R40: sin grupo ni marca heredados…» (huella de `orden` idéntica, ruta nueva, zona igual, dos empresas) |
| R40 | idem (precio y marca iguales) y › «P1: un grupo y una marca heredados del padre viejo bloquean…» (3 abiertas de 2 empresas; la cerrada no cuenta) y › «R40: un grupo y una marca PROPIOS…»; `geografia-plataforma.mover.test.ts` › «SLT-48 P1 — …» (regla pura) |
| R41 | `geografia-mover-nodo-ordenes.test.ts` › «… R41: una orden nueva usa la zona, el grupo y la marca de la posición nueva» |

### Desvíos y decisiones

1. **Nombres de las actions:** `moverNodoAction` y `vistaPreviaMoverNodoAction`, como el resto del archivo
   (`renombrarNodoAction`…). Design §7.1 decía `moverNodoGeografico`/`vistaPreviaMoverNodoGeografico`.
2. **Descendientes sin CTE recursiva:** design §7.1 hablaba de una CTE sobre `padre_id`; la guardia
   `geografia-sin-cte-recursiva` la prohíbe en `lib/`. Salen del catálogo del país en memoria (`nodosBajo`).
3. **«Retirado» (P4) es en cascada:** un destino activo bajo un antepasado retirado también se rechaza. Es la
   disponibilidad efectiva de todo el catálogo (SLT-44 R5).
4. **Orden abierta** = sin fila en `cierre_detail` y sin borrar. **Órdenes que cambian de nombre** = todas las no
   borradas del subárbol (también las cerradas), de todas las empresas.
5. **P1 compara el grupo con la misma regla que la tarifa:** `grupo_distritos_distrito` solo cuenta para el lugar exacto
   (no cambia nunca al mover) y `grupo_distritos_nodo` se hereda; la marca (`distrito_zona_especial`) se hereda. Lugar de
   tarifa con `distritoDeTarifa` (P3). La zona está guardada en la orden y no entra.
6. **Carrera de P1:** el bloqueo se calcula dentro de la transacción de `mover`, pero una orden creada por otra
   transacción entre esa lectura y el `COMMIT` no se ve. El `padre_id` sí está protegido (R37, `updateMany` con el padre
   de antes). No se añadió un candado sobre `orden` (ningún requisito lo pide y costaría bloquear las altas).
7. **Etiqueta del historial:** design §7.1 pedía «la etiqueta en `lib/types/historial-accion.ts`». Ese catálogo es el del
   historial de EMPRESA (`HistorialAccionTipo`); `nodo_geografico_movido` es de `HistorialPlataformaAccion`, que no tiene
   catálogo de etiquetas en `lib/` ni pantalla que lo liste (ningún valor de plataforma está allí). No se tocó.
8. **`valorAnterior`/`valorNuevo`** = rutas de los padres de la hoja a la raíz («Marga Marga · Valparaíso»), recortadas a
   `GEO_NOMBRE_MAX` (80, el ancho de la columna). La etiqueta es la cadena del nodo ya movido.
9. **Bloqueo al mover** = `validation_error` en `id` con el mensaje y el `bloqueo` (design §7.1: «`mover` la rechaza con
   `validation_error`»).
10. **Marcas por empresa en el punto único:** la guardia `zona-especial-punto-unico` no deja leer
    `distritoZonaEspecial` fuera de `_shared/zona-especial.ts`. Se añadió allí `leerNodosConMarcaPorEmpresa(tx, ids)`
    (filtro explícito por empresa, porque la plataforma corre sin empresa en el contexto). Archivo fuera de la lista
    de `tasks.md`: `lib/repositories/_shared/zona-especial.ts`.
11. **`@sin-superficie` provisional:** `superficie-de-uso` exige que toda Server Action la importe una pantalla. Hasta
    que T4.1 monte `MoverNodoDialog`, las dos actions llevan `@sin-superficie SLT-48 T4.1 … quitar esta anotación al
    montarla`. La misma guardia se pondrá roja si la anotación sobrevive a la pantalla: **el frontend_dev la quita en
    T4.1**.

### Salida real (resumida)

```
$ vitest run tests/unit/actions/geografia-plataforma.mover.test.ts tests/unit/actions/geografia-plataforma-action.test.ts
      Tests  154 passed (154)          (el nuevo: 27)
$ vitest run tests/integration/db/geografia-mover-nodo.test.ts tests/integration/db/geografia-mover-nodo-ordenes.test.ts
      Tests  10 passed (10)
$ pnpm run test:guardias
      Test Files 9 failed | 328 passed — de los 9:
        superficie-de-uso, zona-especial-punto-unico: míos, arreglados (desvíos 10 y 11) → 54 passed (54) junto al test nuevo
        catalogo-postgres-acota-esquema, descargas-por-registro, sin-estados-retirados: timeout de 20 s con la máquina
          cargada; solos → 78 passed (78) con geografia-sin-cte-recursiva, nodo-geografico-escritor-unico y geografia-dominio-puro
        dependencias-declaradas-presentes: baseline (init.sh sin el marcador; ajeno)
        zona-central-guarda-y-rastro, zona-guardado-conserva-costos, zona-guardado-conserva-inactivos: T5
$ eslint (archivos de T3)   → 0 errores, 0 avisos
$ pnpm run typecheck        → 0 errores fuera de tests/integration/db y e2e (T5/T6)
```

**Veredicto T3:** mover un nodo en el servidor hecho (R34–R41, P1, P4), con vista previa desglosada por nivel y
bloqueo por empresa; verde contra Postgres. La pantalla es T4.1.

## T5 — Tests que escriben las tablas viejas (backend_dev, 2026-11-17)

Base `servi_logistic_slt48` local. Ninguna dependencia, ningún archivo de producción. Las tablas viejas son vistas:
cada test que escribía `provincia`/`canton`/`distrito` escribe ahora el nodo (`crearNodoDeNivel`, o
`tx.nodoGeografico.update` para renombres y retiros), y los que leían las 3 FK de una orden leen su nodo o su ruta.

### Cómo

- **`tests/fabricas/paises.ts` › `crearNodoDeNivel`:** si `provincia` es todavía una TABLA (una base sin SLT-48: las
  idas y vueltas de migraciones anteriores, o tras el `down.sql` con `sin-slt48.ts`), escribe en la tabla vieja como
  antes; si es vista, escribe el nodo. Así `geo-43.ts` siembra también en la base previa a SLT-43.
- **Conversión mecánica** (`X.create` → `crearNodoDeNivel`, `X.update` → `nodoGeografico.update`, sin tocar ningún
  `expect`): `aislamiento-mecanismo` (el clon del esquema desechable pasa a ser de `nodo_geografico`), `carga-division`
  (y su `ctid` se mide en el nodo), `cobertura-repository`, `geo-backfill`, `geo-catalogo-repository`,
  `geografia-alta`, `geografia-cascada-reversible`, `geografia-catalogo-activo`, `geografia-historico-intacto`,
  `geografia-ordenes-sin-entregar`, `geografia-registro-accion`, `geografia-renombrado`, `salida-a-reparto-sql-real`,
  `zona-central-guarda-y-rastro`, `zona-distrito-rastro`, `zona-distrito-unica`, `zona-guardado-conserva-costos`,
  `zona-guardado-conserva-inactivos`, `zona-pago-mensajero-rastro`, `zona-reconciliacion-ordenes`,
  `geo-sincronia-orden-zonas` (fixture), `geografia-por-pais` (altas).
- **Idas y vueltas de migraciones anteriores:** `migracion-slt43` y `migracion-slt46` construyen su base SIN las
  migraciones de SLT-48 (se apoyan en objetos de SLT-43/46: 42703 y 42704), como ya hacían con las de SLT-46/89;
  en esa base el `UPDATE` de R35 va por SQL (el cliente de Prisma modela vistas). `migracion-sl20`, `-sl38`,
  `geografia-dta-2026-migration`, `tarifas-flexibles-migration` y `caja-459-migration` pasan sin cambios: el
  helper `sin-slt48.ts` no hizo falta en ninguno.
- **Tipos** (FK de la orden `string | null`, R4): `_fixtures/geo-65.ts`, `geo-125-geocode-cache`,
  `geo-125-nombres-catalogo`, `geo-125-cierre-snapshot`, `geo-equivalencia-presentacion` (`!` sobre órdenes viejas
  con FK); `_postgres-real.ts › fksDeOrden` y `_fixtures/caja-459.ts` toman una orden con FK.
- **Entradas** (`CreateOrdenData`/`CorregirDatosClienteData` sin la terna, `findLugarParaCorreccion`):
  `cobro-plataforma-plan`, `pago-plataforma-sl45-concurrencia`, `orden-remision-borrada-libera-numero`,
  `corregir-ubicacion-geocode`, `geografia-dos-paises`, `zona-especial-dos-empresas`, `emisor-relaciones-anidadas`
  (los niveles salen de `rutaDelLugar` sobre el catálogo de `leerDescriptivosDeOrdenes`).

### Aserciones cambiadas en T5 (autorizadas: contradicen una decisión cerrada; cada una con su `// SLT-48 R<n>`)

| Archivo › test | Antes → después | R |
|---|---|---|
| `corregir-datos-cliente.repo` › «327 caso 1+2» | `fila.distritoId` = nuevo → `nodoGeograficoId` = nuevo y las 3 FK `null` | R16 |
| idem › «327 caso 3+4» | cambian `direccion, distritoId, peso, updatedAt, zonaId` → además `cantonId, nodoGeograficoId, provinciaId` | R16 |
| idem › «327 caso 7» | `una.cantonId`/`una.provinciaId` → `una.id`, `tipoHijosActivos: null`, `distritoTarifaId` | R16, R17 |
| idem › «327 (R30)» | `fila.distritoId` → `fila.nodoId` | R16, R22 |
| `geo-lecturas-catalogo` › «R19 — el distrito propuesto…» | fila nueva = fila de hoy → igual salvo la cadena (sin `cantonId`/`provinciaId`, con `tipoHijosActivos`/`distritoTarifaId`); un cantón o una provincia `null` → fila con `tipoHijosActivos` (no hoja) | R16, R17 |
| `geografia-catalogo-activo` › «`findLugarParaCorreccion` devuelve el retirado…» | `cantonId`/`provinciaId` → `id` y `tipoHijosActivos: null` | R16 |
| `geografia-historico-intacto` › «la orden conserva su terna…» | `item.distritoId` → `item.nodoGeograficoId` | R15, R22 |
| `zona-nodo-herencia` › «v2: el distrito … y la provincia…» (renombrado) | cantón con distritos «sin zona» → «incompleta»; `u.fks` → `u.ruta`; provincia «país no habilitado» → «incompleta» | R15, R17, R18 |
| idem › «carga masiva v1: la orden del distrito heredado…» | `distritoId` = distrito → `nodoGeograficoId` = distrito y `distritoId` `null` | R15 |
| `geo-sincronia-orden-zonas` › «R20: un nodo puesto a mano…» (renombrado) | se pisa con las FK → se conserva | R9 |
| idem › «orden sin cantón…» (renombrado) | 23502 y `NOT NULL` → entra, `nullable = YES`, nodo `null` | R4 |
| idem › «los triggers que los casos apagan…» | lista con `distrito_sincroniza_nodo_geografico` → sin él | R5 |
| `geografia-por-pais` › «R11: un nodo en otro país…» | sobre `canton`/`distrito`/`provincia` → sobre `nodo_geografico`; `padreInexistente` 23503 → `SLT43` (lo para antes el trigger de invariantes del nodo) | R1 |
| `slt46-nodo-copia-vieja` › «R44» | cuerpo de `orden_nodo_geografico` de SLT-89 → el de SLT-48; FK de las zonas a `distrito` → solo al nodo | R9, R4 |

### Sin objeto: PARADOS, sin tocar (piden decisión humana)

Prueban objetos que SLT-48 quita a propósito (la sincronía vieja ↔ nodo, la copia nodo → tabla vieja, el `DEFAULT`
de país de `provincia`, el borrado físico por las tablas viejas). No se reescribieron ni se borraron:

| Archivo › test | Por qué no tiene objeto |
|---|---|
| `slt46-nodo-copia-vieja` › R4, R5, R6 | la copia nodo → tabla vieja (`nodo_geografico_copia_a_geografia_vieja`) ya no existe (R5) |
| `geo-sincronia-geografia` › «R16: cambio de padre…», «R16: un UPDATE que no cambia nada…», «R17: el borrado físico…», «R18: `canton.pais_id`…», «lo que la sincronía tumba…» | la sincronía tabla vieja → nodo ya no existe (R5); escriben `provincia`/`canton`/`distrito` (4 errores de typecheck) |
| `geo-sincronia-orden-zonas` › «borrar un distrito con orden no falla…», «la FK nueva solo rechaza un distrito SIN nodo…» | `DELETE FROM distrito` es `SL048` (R2); la FK y la sincronía que se apagaba no existen (R4, R5) |
| `geografia-por-pais` › «R10: una provincia creada sin país queda en CR», «R11: el cantón y el distrito heredan el país del padre aunque se pida otro» | el `DEFAULT 'CR'` de `provincia` y el trigger `geografia_pais_del_padre` ya no existen; el nodo exige su país y la FK `(padre_id, pais_id)` rechaza el otro (1 error de typecheck) |
| `geo-equivalencia-geografia` › los 4 «R13» que descuadran la tabla vieja | la tabla vieja es una vista del nodo: no puede diferir de él |
| `geo-equivalencia` › «R32: un distrito sin nodo…» | ídem: no puede haber distrito sin nodo (1 error de typecheck) |

Opciones para cada uno: retirarlo (con su `@test-desaparecido` si un `design.md` lo cita) o reescribirlo contra las
vistas (R1–R3, R5 ya los cubre `slt48-vistas-geografia.test.ts`).

### Salida real (resumida)

```
$ vitest run --maxWorkers=3 <los 43 archivos tocados + migracion-sl20/-sl38, geografia-dta-2026, tarifas-flexibles-migration,
    caja-459-migration, geo-65-fixture, geo-125-fixture, aislamiento-rls, distrito-zona-especial-por-empresa,
    satelite-conjunto-sql-real, tarifas-flexibles-resolver, slt89-equivalencia-cr, geo-equivalencia*, slt46-nodo-copia-vieja>
 Test Files  11 failed | 43 passed (54)
      Tests  19 failed | 467 passed | 48 skipped (534)
  - los 17 casos «sin objeto» de arriba (después, `slt46-nodo-copia-vieja` › R44 quedó verde: 6/9, los 3 rojos son R4–R6);
  - 5 suites que piden la base sembrada (sin órdenes o sin `adminTienda` en la local): `corregir-datos-cliente.repo`,
    `corregir-ubicacion-geocode`, `emisor-relaciones-anidadas`, `orden-remision-borrada-libera-numero` y el describe
    «465» de `cobertura-repository`, más «SLT-54 R30 … la marca sigue en el Excel» del mismo archivo
    (`EmpresaNoResuelta` al leer la empresa). Los cinco archivos están en `tests/baseline-rojos.json` («La app nace
    vacia», SL-31). Compilan; no se pudieron correr aquí.
$ pnpm run test:guardias   → Test Files 1 failed | 338 passed · solo `dependencias-declaradas-presentes` (baseline)
$ eslint (archivos de T5)  → 0 errores, 2 avisos previos (variables sin usar que no son de T5)
$ pnpm run typecheck       → 9 errores, todos fuera de mi alcance o parados:
    e2e/geo-presentacion-4-niveles.spec.ts (3)            T6.1 (frontend_dev)
    geo-sincronia-geografia (4), geografia-por-pais (1), geo-equivalencia (1)   casos «sin objeto» parados
```

**Veredicto T5:** 43 archivos de integración pasados a nodos o a las vistas, sin borrar tests; quedan 17 casos sin
objeto parados y pendientes de decisión humana, y 5 suites que solo corren con la base sembrada (baseline).

## T4.1 — Mover un nodo, pantalla (frontend_dev, 2026-11-17)

Sin base de datos (tests de componente con las actions dobladas). Ninguna dependencia nueva. El MCP del grafo no se
usó (Grep/Read).

### Archivos

Producción:
- `app/(app)/plataforma/geografia/_components/MoverNodoDialog.tsx` (nuevo) — un solo diálogo en dos pasos: 1) elegir
  el padre nuevo entre los nodos de la profundidad del padre actual, de todo el país (buscador sin acentos, insignias
  «Padre actual» y «Retirado»); 2) la vista previa del servidor: tabla «Dato · Antes · Después» con «Ubicación»
  (regla 6) y el tipo del padre, «Lugares que cuelgan de él: N (desglose por nivel)» (regla 1), las órdenes que cambian
  de nombre y, si hay bloqueo P1, cuántas órdenes abiertas y de qué empresas con «Sí, mover» apagado. Los rechazos de
  R35 (retirado, padre actual, no existe, `conflict`) salen en el paso 2 con «No se puede mover aquí.». R37: viaja
  `padreIdAnterior` de la vista; `cambio_concurrente` cierra, deja el aviso de siempre y refresca. Un bloqueo P1 que
  aparece entre la vista y el «Sí» se pinta en el modal. Textos en `TEXTOS_MOVER_NODO` (sobreescribibles, i18n).
- `app/(app)/plataforma/geografia/_components/GeografiaAdminModule.tsx` — la fila del árbol gana «Mover» (solo fuera de
  la raíz) y monta `MoverNodoDialog`. **Fuera de la lista de archivos esperados:** las filas del árbol viven aquí, no en
  `GeografiaPlataformaModule.tsx`.
- `app/(app)/plataforma/geografia/_components/GeografiaPlataformaModule.tsx` — se quita el aviso «país aún no
  habilitado» del alta de país (R21) y su `aria-describedby`.
- `lib/actions/geografia-plataforma.ts` — solo se quitan las 2 anotaciones `@sin-superficie` provisionales de
  `vistaPreviaMoverNodoAction` y `moverNodoAction`: ya las importa una pantalla.

Tests: nuevos `tests/components/MoverNodoDialog.test.tsx` (19) y `tests/components/GeografiaPlataformaSinAviso.test.tsx`
(3). `tests/fixtures/archivos-slt48.ts` suma `MoverNodoDialog.tsx` a la guardia `etiquetas-geograficas-sin-literal` (R47).

### Aserciones cambiadas (autorización del humano del 2026-11-17: contradicen una decisión cerrada de SLT-48)

Con la pantalla de T4.1 estaban en rojo. Cada una lleva su comentario `// SLT-48 R<n>: …`. **El leader debe confirmar
que la autorización general las cubre** (la orden de T4.1 no las nombraba).

| Archivo › test | Antes → después | R |
|---|---|---|
| `tests/components/geografia-arbol-n-niveles.test.tsx` › «R22 — no hay mover» (renombrado «… (SLT-48 R34: «Mover» solo fuera de la raíz)») | ningún botón `/mover\|cambiar de padre/i` en el árbol → ninguno `/cambiar de padre/i`; las raíces sin «Mover»; «Mover» en Arica, Centro, Manzana Uno y Putre; sigue sin `draggable` | R34 (decisión heredada «Mover nodos: va en SLT-48»; contradice SLT-46 R22) |
| `tests/components/GeografiaPlataformaAltaPais.test.tsx` › «R63: con 3 niveles no hay aviso; con 2 o 4, avisa…» (renombrado «R63: con 2, 3 o 4 niveles no hay aviso…») | con 2 y 4 niveles el aviso sale y describe la casilla → no sale nunca y la casilla no lo tiene como descripción | R21 |

### Mapa R → test

| R | Test |
|---|---|
| R21 | `GeografiaPlataformaSinAviso.test.tsx` › «SLT-48 R21 — …» (alta con 2 a 10 niveles; la pantalla entera) + `GeografiaPlataformaAltaPais.test.tsx` › «R63: con 2, 3 o 4 niveles no hay aviso…» |
| R34 (pantalla) | `GeografiaPlataformaSinAviso.test.tsx` › «SLT-48 R34 — la acción «Mover» del árbol»; `geografia-arbol-n-niveles.test.tsx` › «R22 — … SLT-48 R34»; `MoverNodoDialog.test.tsx` › «sin permiso (R34)» |
| R35 (pantalla) | `MoverNodoDialog.test.tsx` › «R35, P4 — el destino rechazado…» (retirado, `conflict`, `not_found`, padre actual, otra profundidad) y «paso 1» (solo la profundidad del padre; «Ver el cambio» apagado con el padre actual) |
| R36 | `MoverNodoDialog.test.tsx` › «R36 — paso 2: antes → después» (Ubicación, tipo del padre, descendientes, órdenes; regla 1 del desglose; «Volver»; confirmar una vez) + «funciones puras» |
| R37 | `MoverNodoDialog.test.tsx` › «R36 … «Sí, mover» llama una vez con el padre que mostró el modal (R37)…» y «R37 — cambio concurrente» |
| R40 / P1 (pantalla) | `MoverNodoDialog.test.tsx` › «R40, P1 — bloqueado por órdenes abiertas» (37 órdenes de 2 empresas, apagado; y el bloqueo en carrera) |
| R47 | `etiquetas-geograficas-sin-literal.guardia.test.ts` › «SLT-48 / R47» con `MoverNodoDialog.tsx` en la lista |

### Desvíos respecto de la maqueta

Los tipos del país no traen género, y R47 prohíbe la palabra de Costa Rica en estas pantallas; por eso:
1. Paso 1: «Elige el cantón al que pasa.» → «Elige el lugar al que pasa.»; la etiqueta «Cantón nuevo» → «<Tipo> de
   destino» («Cantón de destino», «Comuna de destino»).
2. Retirado: «Tibás está retirado. Reactívalo o elige otro cantón.» → «… o elige otro destino.».
3. Conflicto: «"Santa Ana" ya tiene un distrito "San Rafael".» → «"Santa Ana" ya tiene un lugar llamado "San Rafael".».
4. El padre actual sale en la lista con su insignia (como la maqueta) y elegido deja «Ver el cambio» apagado, en vez de
   pintarse gris: el `RadioGroup` de `components/ui` no apaga una opción suelta.
5. Los números van sin separador de miles («1284», la maqueta «1.284»): no hay un formateador de conteos en el repo y
   no se inventó uno.
6. Éxito: un toast «Se movió «San Rafael» a Santa Ana.» (la maqueta no lo fija).
7. Un motivo de R35 sin texto propio en la maqueta (otro país, otra profundidad, raíz) sale con el mensaje del servidor
   (`MENSAJE_DE_MOTIVO_DE_MOVER`).

### Salida real (`NODE_OPTIONS=--max-old-space-size=8192`)

```
$ pnpm exec vitest run tests/components/MoverNodoDialog.test.tsx tests/components/GeografiaPlataformaSinAviso.test.tsx \
    tests/components/geografia-arbol-n-niveles.test.tsx tests/components/GeografiaPlataformaAltaPais.test.tsx
 Test Files  4 passed (4)
      Tests  60 passed (60)
$ pnpm exec eslint <archivos de T4.1>   → sin salida (0 errores, 0 avisos)
$ pnpm run typecheck   → exit 2: 9 errores, 0 en T4.1: e2e/geo-presentacion-4-niveles.spec.ts (3, T6.1),
                         geo-sincronia-geografia (4), geografia-por-pais (1), geo-equivalencia (1) (T5, parados)
$ pnpm run test:guardias → Test Files 3 failed | 333 passed | 3 skipped · Tests 6 failed | 4733 passed | 25 skipped
    - dependencias-declaradas-presentes (4): baseline, no es de esta rama.
    - descargas-por-registro (1): «Test timed out in 20000ms»; con --testTimeout=120000, 9/9 verdes. Tiempo, no aserción.
    - sin-estados-retirados (1): rojo en la corrida completa y verde solo (junto con superficie-de-uso y
      etiquetas-geograficas-sin-literal: Test Files 3 passed). Carga de la máquina.
    superficie-de-uso y etiquetas-geograficas-sin-literal: verdes.
```

**Veredicto T4.1:** modal «Mover» y aviso quitado, verdes como la maqueta; 2 aserciones de SLT-46 cambiadas bajo la
autorización general, pendientes de que el leader lo confirme.

## T6 — E2E (frontend_dev, 2026-11-17)

Base: SOLO `servi_logistic_slt48` en el Postgres local (`localhost:5432`), ya migrada (`prisma migrate status`: «Database
schema is up to date!») y sembrada desde T1. `DATABASE_URL`/`DIRECT_URL` exportados a ella en cada corrida (la URL se armó
con las credenciales locales del `.env` del repo cambiando solo el nombre de la base, y el script aborta si no es
`localhost:5432/servi_logistic_slt48`). El worktree no tiene `.env`, así que ni `next build` ni `next start` leyeron otra
cosa. Nada remoto, ni producción ni Ordenex. `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3044` (exit 0) y
Playwright con `E2E_PUERTO=3044`, Storage falso en 54329. La base NO se recreó (la orden era usar esa base y no otra):
los specs crean sus propios datos.

### Commits

| Task | Commit | Qué |
|---|---|---|
| T6.1 | e1924880 | `geo-presentacion-4-niveles` a nodos con la orden en el nivel 4; `_planes-fixture` y `_zona-especial-fixture` leen y escriben el nodo |

### Archivos

- `e2e/geo-presentacion-4-niveles.spec.ts` — la geografía de `XB` se crea en `nodo_geografico` (región, comuna, dos
  barrios y un sector bajo el barrio central); las dos órdenes van al SECTOR (nivel 4) con `nodo_geografico_id` y las 3
  FK en NULL (R15). Las zonas siguen sobre los barrios.
- `e2e/_planes-fixture.ts` — `crearOrdenesDirectas` guarda el nodo (el cantón, lo que antes ponía el trigger desde la
  FK) sin las 3 FK; `enlazarDistritoDeLaPlantilla` busca el lugar en el árbol.
- `e2e/_zona-especial-fixture.ts` — `elegirDistritos` lee `nodo_geografico` (niveles 1 a 3) en vez de las vistas.

### Expectativas que cambian en `geo-presentacion-4-niveles` (decisión «Nivel 4 de la orden», R26)

La decisión dice que la expectativa de este spec cambia. Con la orden en el nivel 4, la ruta llega al sector en las
tres superficies del spec, no solo en la descarga. Cada cambio lleva `// SLT-48 R26…` en el spec. **Para confirmar por
el leader**, porque la orden de T6.1 nombraba solo la cuarta columna:

| Test | Antes → después | R |
|---|---|---|
| «1. la descarga…» | `[[...ruta de 3, ""]]` («Sector» vacía) → `[[...ruta de 4]]` («Sector» llena) | R26 |
| «2. la etiqueta de guía…» | «zona / región / comuna / barrio» → «… / barrio / sector» (misma expresión, `ruta` de 4) | R26 |
| «3. el cierre…» | «zona · región · comuna · barrio» → «… · sector»; `ubicacion_snapshot` de 3 niveles → 4 (gana `{ profundidad: 4, tipo: "Sector", … }`) | R26, R27 |

### Mapa R → test

| R | Test |
|---|---|
| R26 | `e2e/geo-presentacion-4-niveles.spec.ts` › «1. … con «Sector» llena» (y 2 y 3) |
| R49 | los 14 specs de abajo, sin cambiar aserciones |

### Salida real (resumida)

```
$ pnpm run typecheck  → 6 errores, 0 en e2e/ (antes 3 en geo-presentacion-4-niveles): geo-sincronia-geografia (4),
                        geografia-por-pais (1), geo-equivalencia (1), los casos «sin objeto» parados de T5
$ pnpm exec eslint e2e/geo-presentacion-4-niveles.spec.ts e2e/_planes-fixture.ts e2e/_zona-especial-fixture.ts → sin salida

T6.1 — pnpm exec playwright test e2e/geo-presentacion-4-niveles.spec.ts --reporter=list
  corrida 1:  ✓ 1. la descarga … «Sector» llena (21.9s) · ✓ 2. la etiqueta … (7.7s) · ✓ 3. el cierre … (7.8s)
              3 passed (2.0m)
  corrida 2 (misma base, seguida):  3 passed (58.9s)

T6.2 — un spec por corrida (R49; la lista de flujos críticos de docs/checkpoints-proyecto.md que nombra R49)
  mis-asignaciones            3 failed | 1 passed (2.8m)   ← ver abajo
  asignacion-satelite         1 passed (46.8s)
  recepcion-satelite          1 passed (39.2s)
  cierre-dia                  2 passed (54.7s)
  cierres-admin               3 passed (1.2m)
  cierres-admin-rechazos-sla  1 passed (49.1s)
  cierre-bodega-satelite      3 passed (57.9s)
  reglas-bloqueos-cierre      5 passed (1.1m)
  wallet                      4 passed (1.1m)
  wallet-mensajeros           3 passed (1.0m)
  mi-wallet                   3 passed (56.7s)
  wallet-iva-aparte-sl39     14 passed (2.3m)
  devolucion-origen           2 passed (1.5m)
  dos-empresas-humo           plataforma-vacia 10/10 ✓, «A recorre su menú» ✓ (41.9s), «B recorre su menú» ✘ (30.0s),
                              5 sin correr: la corrida se cortó (abajo)
```

### Lo que queda abierto en T6.2

- **`mis-asignaciones`** (a), (b) y (c): «Test timeout of 30000ms exceeded» esperando un control del formulario de
  gestión (`combobox «Método de pago línea 1»`, `«Foto de evidencia del rechazo»`, `«Nueva fecha de reprogramación»`)
  después de recoger y verificar la guía; (d), que usa el mismo formulario, pasó en 13.6 s. Ninguno es un `expect` de
  lugar ni de geografía, y ninguna aserción se tocó. No pude repetirlo para separar lentitud de regresión (abajo).
- **`dos-empresas-humo`**: la corrida murió a medias. Mis bucles de espera en la shell agotaron los procesos de la
  máquina (`fork: Resource temporarily unavailable`) y desde ahí la shell no volvió a arrancar (`Exit code 107` incluso
  en `echo`). El ✘ de «B recorre su menú» es un timeout de 30 s en esa misma ventana.
- Los dos quedan para CI (`e2e` en el PR) o para otra corrida local. Ninguna aserción E2E pide autorización.

**Veredicto T6:** T6.1 verde dos veces en local; T6.2 con 12 de 14 specs verdes y 2 sin cerrar por tiempo y recursos
de la máquina, sin cambiar aserciones.

## T5.1 retiros (backend_dev, 2026-11-18)

Decisión del humano del 2026-11-18 (`progress/features/SLT-48.md`, punto a): se retiran los 17 casos sin objeto de
T5. Se borraron solo esos casos; ningún archivo quedó vacío y ningún otro caso se tocó. Salieron también los imports
y helpers que solo usaban ellos, y la cabecera de cada archivo dice qué se retiró y por qué. Base
`servi_logistic_slt48` local. Ninguna dependencia. El MCP del grafo no se usó (Grep/Read).

| Archivo › test retirado | Qué cubre hoy la regla, o por qué se retira |
|---|---|
| `slt46-nodo-copia-vieja` › «R4: escribir el nodo termina sin bucle…» | regla retirada por SLT-48 R5: sin copia ni sincronía no puede haber bucle. Que no queda ningún trigger de sincronía: `slt48-vistas-geografia.test.ts` › «R5: no queda ningún trigger ni función de sincronía…» |
| idem › «R5: si la copia choca con un único de la tabla vieja…» | regla retirada por SLT-48 R1/R5: la tabla vieja es una vista y no tiene únicos. El único del nodo: `geo-nodo-invariantes.test.ts` › «R9: hermanos o raíces con el mismo nombre normalizado…» |
| idem › «R6: cambiar la profundidad de una hoja de 1–3…» | regla retirada por SLT-48 R5 (era un freno de la copia, `SLT46`). La profundidad la sigue protegiendo el trigger de SLT-43: `geo-nodo-invariantes.test.ts` › los «R7: …» (profundidad mala al crear o al mover → `SLT43`) |
| `geo-sincronia-geografia` › «R16: cambio de padre…, de código y de país se reflejan en el nodo» | regla retirada por SLT-48 R2/R5: la tabla vieja ya no se escribe (`SL048`). Mover un nodo: `geografia-mover-nodo.test.ts` (R34–R38); el nodo en su vista: `slt48-vistas-geografia.test.ts` › «R5: crear, renombrar, retirar y mover un nodo se ve en su vista…» |
| idem › «R16: un UPDATE que no cambia nada del nodo no lo reescribe» | regla retirada por SLT-48 R5 (no hay sincronía que reescriba) |
| idem › «R17: el borrado físico borra el nodo…» | regla retirada por SLT-48 R2: `DELETE` sobre la vista es `SL048` (`slt48-vistas-geografia.test.ts` › «R2: INSERT, UPDATE y DELETE sobre las vistas…») |
| idem › «R18: `canton.pais_id` sigue saliendo del padre y la sincronía no escribe historial» | el país del padre lo garantiza la FK compuesta del nodo: `geografia-por-pais.test.ts` › «R11: un nodo en otro país que su padre lo rechaza la base (23503)…» y `geo-nodo-invariantes.test.ts` › «R5: un padre de otro país…». Lo del historial de la sincronía: regla retirada por SLT-48 R5 |
| idem › «lo que la sincronía tumba: un homónimo normalizado…» | `geo-nodo-invariantes.test.ts` › «R9: hermanos o raíces con el mismo nombre normalizado… → 23505»; en la app, `geografia-admin-n-niveles.test.ts` › «R16: un hermano… con el mismo nombre normalizado → `conflict`» |
| `geo-sincronia-orden-zonas` › «borrar un distrito con orden no falla…» | regla retirada por SLT-48 R2: `DELETE FROM distrito` es `SL048` (`slt48-vistas-geografia.test.ts` › «R2: …») |
| idem › «la FK nueva solo rechaza un distrito SIN nodo…» | regla retirada por SLT-48 R4/R5: esa FK y la sincronía que se apagaba ya no existen. Que se quitaron las 5 FK: `migracion-slt48-ida-y-vuelta.test.ts` › «R4/R20/R1: la ida quita las 5 FK y dos NOT NULL…» |
| `geografia-por-pais` › «R10: una provincia creada sin país queda en CR» | regla retirada por SLT-48 R1: `provincia` es una vista sin `DEFAULT`, y el nodo exige su país |
| idem › «R11: el cantón y el distrito heredan el país del padre aunque se pida otro» | regla retirada por SLT-48 R5 (se quitó el trigger `geografia_pais_del_padre`). Lo que sigue vivo, un hijo en el país de su padre: `geografia-por-pais.test.ts` › «R11: un nodo en otro país que su padre lo rechaza…» y «R11: mover un cantón a una provincia de otro país…» |
| `geo-equivalencia-geografia` › «R13: una provincia con otro nombre…» | regla retirada por SLT-48 R1: la tabla vieja es una vista del nodo y no puede diferir de él (`slt48-vistas-geografia.test.ts` › «R1: una fila por nodo de su profundidad, con los datos del nodo…»). El modo sigue probado por los 3 casos que quedan (reconoce el modo, «iguales → 0», código de salida) |
| idem › «R13: código, activo y padre distintos también cuentan…» | ídem |
| idem › «R13: un nodo sin su fila vieja…» | ídem |
| idem › «R13: una fila vieja sin su nodo…» | ídem |
| `geo-equivalencia` › «R32: un distrito sin nodo descuadra el conteo…» | ídem (SLT-48 R1). El resto de R32 sigue en el mismo archivo (iguales → 0, zona desviada, orden sin nodo) |

**`@test-desaparecido`: no se puso, a propósito.** La guardia `test-citado-desaparecido` se pone ROJA si una
anotación `@test-desaparecido` nombra un archivo que sigue en el árbol («la excepción caducó»), y los 6 archivos
siguen vivos con sus otros casos. En su lugar, cada design que los cita lleva bajo su mapa R → test un comentario HTML
con la razón (SLT-48 retira la sincronía y la copia vieja):
- `specs/SL-20-pais-geografia-configurable/design.md` (R11, R16);
- `specs/SLT-43-geo-jerarquica-modelo/design.md` (R15–R18, R20, R21, R32);
- `specs/SLT-46-geo-jerarquica-admin/design.md` (R4–R6, R13);
- y una nota en `specs/SLT-48-geo-jerarquica-contract/design.md` §9.

Las filas de esos mapas no se reescribieron: son specs de features cerradas.

## Design §7.1 — `nodo_geografico_movido` (backend_dev, 2026-11-18)

Decisión del humano (punto e): sigue el criterio actual del historial de plataforma, sin catálogo nuevo. El código ya
lo seguía (desvío 7 de T3). `GeoRepository.mover` llama a `appendAccionPlataforma` igual que `crear`
(`nodo_geografico_creado`, SLT-46): `entidadTipo: "nodo_geografico"`, `entidadEtiqueta: etiquetaDeNodo(...)`, `paisId`
y el actor. Además lleva `valorAnterior`/`valorNuevo` con las rutas, como `renombrar`. Ningún valor de
`HistorialPlataformaAccion` tiene etiqueta en `lib/types/historial-accion.ts`, que es el catálogo del historial de
empresa. **El código no cambió**; se corrigió el texto de design §7.1 › «Historial». Test que lo fija:
`geografia-mover-nodo.test.ts` › «R34, R38: mover escribe solo `padre_id` y su fila `nodo_geografico_movido`…».

## T7.2 — `docs/architecture.md` (backend_dev, 2026-11-18)

Corregido lo que el deploy 1 deja falso:
- el país del padre: ya no lo pone un trigger de las tablas viejas, sino la FK compuesta del nodo;
- la RLS por país: `nodo_geografico_del_pais`, que las vistas heredan;
- la sincronía de SLT-43/46: ya no existe en ningún sentido;
- «el lugar de una orden se lee de las FK viejas»: ahora es el nodo (guardia `orden-fk-geo-sin-uso`);
- el trigger de `orden` (R9): conserva el nodo y, sin nodo, pone el de sus FK;
- «hasta SLT-48 la ruta llega al nivel 3»;
- «una orden sin distrito sigue sin grupo (hasta SLT-48)»: ahora rige P3.

Añadido el bloque «Modelo viejo retirado (SLT-48, deploy 1)»:
- las vistas: `security_invoker`, `INSTEAD OF` con `SL048` para el dueño y `42501` para `servi_app`;
- las FK quitadas y el `down.sql` (P5);
- la regla de hoja (P2, sin hijos activos);
- mover nodos (R34–R41, bloqueo P1, P4).

Comprobado contra `db/migrations/20261117120100_slt48_geografia_vieja_a_vistas/migration.sql`,
`lib/services/geo-ubicacion.ts › esHoja`, `lib/services/geografia-dominio.ts › distritoDeTarifa` y
`GeoRepository.mover`.

## Checklist para la persona (T7.1 y T7.4)

**Ningún agente corre esto.** Lo hace una persona: T7.1 sobre la **copia de producción** y T7.4 sobre producción, solo
para el backup. La salida de cada comando se pega en el PR.

### T7.1 — Equivalencia, rendimiento y vuelta del `down.sql` (R30, R33, R11, R12)

Base: la **copia de producción** con las dos migraciones de SLT-48 aplicadas
(`20261117120000_slt48_historial_nodo_movido` y `20261117120100_slt48_geografia_vieja_a_vistas`). `DATABASE_URL` y
`DIRECT_URL` apuntan a esa copia, nunca a producción. Antes, `pnpm exec prisma migrate status` debe decir que la base
está al día. Si la migración aborta con «faltan nodos; corre antes pnpm geo:backfill» (R6), se corre el backfill en
la copia y se repite.

1. Equivalencia (R33). Cada uno **debe salir con código 0**, es decir, 0 diferencias:
   ```
   pnpm run geo:equivalencia-dinero
   pnpm run geo:equivalencia-consultas
   pnpm run geo:equivalencia-analitica
   pnpm run geo:equivalencia-filtros
   pnpm run geo:equivalencia-presentacion
   ```
   `geo:equivalencia-dinero` sale con 1 si algo difiere y con 2 si una empresa no se pudo leer. Las dos son rojo.
2. Rendimiento (R30). Se corre cada uno y se compara con su corrida en la misma copia SIN SLT-48 (antes de aplicar
   las migraciones, o tras la vuelta del paso 3). Ninguna consulta debe **empeorar más de un 20 %** (mediana de 5) ni
   sumar un `Seq Scan` nuevo sobre `orden`:
   ```
   pnpm run geo:explain-consultas
   pnpm run geo:explain-analitica
   pnpm run geo:explain-filtros
   ```
   Si el listado empeora, la primera mitigación es llevar los nombres al catálogo (R30). No se mergea sin decidirlo.
3. Ida y vuelta del `down.sql` (R11, R12), en la copia:
   ```
   pnpm run db:rollback               # down.sql de 20261117120100 (la última) y la saca de _prisma_migrations
   pnpm run db:rollback               # ídem con 20261117120000 (su down.sql no hace nada a propósito: SELECT 1)
   pnpm exec prisma migrate status    # las dos, pendientes
   pnpm exec prisma migrate deploy    # la ida otra vez
   pnpm exec prisma migrate status    # al día
   ```
   Esperado: la vuelta deja `provincia`, `canton` y `distrito` como tablas con sus filas, las FK y la sincronía. Si
   aborta con «SLT-48 down: N ordenes estan en un nodo que la geografia vieja no sabe guardar» (P5), la base no
   cambia: hay que decidir antes qué hacer con esas órdenes. Tras la ida otra vez, repetir el paso 1: todo en 0.

**Hecho:** pasos 1 y 3 con 0 diferencias y el paso 2 dentro del 20 %, con la salida en el PR.

### T7.4 — Backup verificado antes de la release

1. Justo antes de la release, un backup de producción.
2. **Restaurarlo** en una base aparte, nunca sobre producción, y comprobarlo: `prisma migrate status` responde, y los
   conteos de `orden`, `nodo_geografico`, `zona_distrito`, `distrito_zona_especial` y `cierre_detail` son iguales a
   los de producción en ese momento.
3. Anotar en `progress/features/SLT-48.md` quién lo hizo, cuándo, dónde quedó el backup y los conteos.
4. Las migraciones las aplica el build de `prod`; no las aplica una persona ni un agente.

### Salida real (`NODE_OPTIONS=--max-old-space-size=8192`)

```
$ pnpm run typecheck   → exit 0 (los 6 errores que dejaba T5 eran de los casos retirados)
$ pnpm exec eslint <los 6 archivos de test>   → sin salida (0 errores, 0 avisos)
$ pnpm exec vitest run --maxWorkers=3 <slt46-nodo-copia-vieja, geo-sincronia-geografia, geo-sincronia-orden-zonas,
    geografia-por-pais, geo-equivalencia-geografia, geo-equivalencia>   (base servi_logistic_slt48 local)
 Test Files  6 passed (6)
      Tests  32 passed (32)
$ pnpm run test:guardias → Test Files 2 failed | 334 passed | 3 skipped · Tests 5 failed | 4734 passed | 25 skipped
    - dependencias-declaradas-presentes (4): baseline, ajeno a esta rama.
    - sin-estados-retirados (1): rojo en la corrida completa y verde sola (carga de la máquina, como en T3 y T4.1).
$ pnpm exec vitest run sin-estados-retirados.guardia test-citado-desaparecido.guardia → 2 passed, 21 tests
```

**Veredicto:** T5.1 cerrada (17 casos retirados, cada regla viva con su test). Design §7.1 corregido sin tocar código.
T7.2 hecha y el checklist de T7.1/T7.4 listo para la persona.

## Ajustes tras T6 (2026-11-18, frontend_dev)

Decisiones del humano del 2026-11-18 (d) y (f) de `progress/features/SLT-48.md`, y T6.2 repetida. Ninguna dependencia nueva.

### Commits

| Punto | Commit | Qué |
|---|---|---|
| (d) | 761b6e67 | `gruposUnicidad(lugar, femenino)`: «Una comuna» / «Un distrito», con `esFemenino` de SLT-47 (`lib/utils/filtro-ubicacion.ts`, sin tocarlo) |
| (f) | bc247c47 | «Ubicación incompleta: «<lugar>» tiene <plural de debajo> debajo; elige el último nivel.» antes de guardar, junto al selector que falta |
| T6.2 | (este commit de docs) | `mis-asignaciones` y `dos-empresas-humo` verdes; T6.2 `[x]` |

### Archivos

- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts` — `gruposUnicidad` recibe el género.
- `app/(app)/configuracion/tarifas/_components/TarifasGrupos.tsx` — pasa `esFemenino(singular del nivel 3)`.
- `app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx` — `corregirUbicacionIncompleta(lugar, plural)`; el texto
  sale en el selector del nivel que falta (con `aria-invalid` y `aria-describedby`) solo si ya se eligió un lugar con
  hijos. Sin `role="alert"` (no es la respuesta a una acción; no se anuncia en cada cambio). Si el servidor rechaza,
  su texto manda en ese selector y el previo no se duplica. «Guardar cambios» ya estaba apagado mientras faltara un nivel
  (`nivelQueFalta`); el rechazo del servidor (R17) sigue de red de seguridad.
- `tests/components/TarifasGruposNNiveles.test.tsx`, `tests/components/CorregirUbicacionNNiveles.test.tsx` — tests nuevos.
- `specs/SLT-48-geo-jerarquica-contract/tasks.md` — T6.2 `[x]`.

Desvíos: ninguno. `esFemenino` vive en `lib/` y se reutiliza sin cambiarlo. En CR el aviso nuevo sale también
(«Escazú» tiene distritos debajo), como pide la decisión; la maqueta solo lo dibuja en el caso de 4 niveles. Ninguna
aserción existente cambió (CR incluida).

### Mapa R → test

| R | Test |
|---|---|
| R45 (decisión d) | `TarifasGruposNNiveles.test.tsx` › «Un <tipo>» concuerda con el género del tipo (Comuna → «Una», Distrito → «Un») |
| R43, R17 (decisión f) | `CorregirUbicacionNNiveles.test.tsx` › «Ubicación incompleta» antes de guardar: 4 niveles (precargada en la comuna, y elegida desde una hoja), CR con cantón con distritos, CR con cantón sin distritos |
| R49 | `e2e/mis-asignaciones.spec.ts`, `e2e/dos-empresas-humo.spec.ts` (abajo) |

### Salida real (`NODE_OPTIONS=--max-old-space-size=8192`)

```
$ pnpm exec vitest run tests/components/TarifasGruposNNiveles.test.tsx tests/components/TarifasGrupos.test.tsx
 Test Files  2 passed (2) · Tests  41 passed (41)
$ pnpm exec vitest run CorregirUbicacionNNiveles CorregirDatosCliente.{ordenes,novedades} corregir-ubicacion-inactivos
    etiquetas-geograficas-sin-literal.guardia corregir-datos-sin-rastro.guardia
 Test Files  6 passed (6) · Tests  108 passed (108)
$ pnpm run typecheck       → exit 0, 0 errores
$ pnpm run lint            → exit 0: 0 errors, 246 warnings (los mismos de T4; ninguno en archivos tocados)
$ pnpm run test:guardias   → Test Files 1 failed | 335 passed | 3 skipped · Tests 4 failed | 4735 passed
    - dependencias-declaradas-presentes (4): el mismo rojo del arnés de T4 (init.sh sin el paso 2 de la ficha 420);
      ajeno a SLT-48.
```

E2E, una vez cada uno, contra SOLO `localhost:5432/servi_logistic_slt48` (`DATABASE_URL`/`DIRECT_URL` armadas desde el
`.env` del repo cambiando solo el nombre de la base; el script aborta si no es esa). `E2E_PUERTO=3044`; servidores
levantados por la `webServer` de Playwright con el `next build` de T6 (18:13 del 2026-11-17, posterior a todo el código
de producción salvo los dos commits de UI de arriba, que no tocan estos flujos). Sin bucles ni esperas en la shell.
Al terminar, ningún proceso node del worktree vivo y los puertos 3044/54329 libres.

```
$ pnpm exec playwright test e2e/mis-asignaciones.spec.ts --reporter=list
  ✓ (a) recoger por guía → Entregar con un método y foto (11.0s)
  ✓ (b) recoger por guía → Rechazar con foto y motivo (6.2s)
  ✓ (c) recoger por guía → Reprogramar para mañana con motivo (5.8s)
  ✓ (d) entrega MIXTA 8.000 = 5.000 efectivo + 3.000 transferencia → totales del cierre (5.9s)
  4 passed (43.4s)
$ pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --reporter=list
  18 passed (2.2m)   (plataforma-vacia + aislamiento; «B recorre su menú» ✓ 23.4s)
```

Los timeouts de T6 eran de la máquina cargada, no regresiones.

**Veredicto:** decisiones (d) y (f) hechas con sus tests; T6.2 cerrada en local (14 de 14 specs de R49 verdes, sin
cambiar aserciones).

## T7.3 — Mapa R → test final (implementer, 2026-11-18)

Parte del mapa de design §13; aquí se anotan solo los cambios respecto de él. Todas las rutas existen en la rama.

| R | Test |
|---|---|
| R1, R3 | `tests/integration/db/slt48-vistas-geografia.test.ts` |
| R2 | `slt48-vistas-geografia.test.ts` › «R2: …el dueño recibe SL048…, servi_app 42501 (solo SELECT)» (texto de R2 corregido el 2026-11-17) |
| R4, R6, R11, R12, R20 | `tests/integration/db/migracion-slt48-ida-y-vuelta.test.ts` |
| R5 | `slt48-vistas-geografia.test.ts` (los casos de sincronía de `geo-sincronia-*` se retiraron en T5.1, ver «T5.1 retiros») |
| R7, R8, R9 | `tests/integration/db/slt48-triggers-orden-pais.test.ts`; R9 también `orden-nodo-mas-profundo.test.ts` (aserción de SLT-89 cambiada, autorizada) |
| R10 | `tests/integration/db/slt48-trigger-orden-rendimiento.test.ts` |
| R13, R14, R48 | `tests/unit/db/slt48-migraciones-declaradas.test.ts` (+ diff para el reviewer en R48) |
| R15 | `tests/integration/db/orden-nodo-escritura.test.ts` |
| R16 | `tests/integration/db/corregir-datos-cliente.repo.test.ts` (en el baseline: lo corre CI), `tests/unit/services/corregir-datos-cliente-service.test.ts`, `tests/components/CorregirDatosCliente.ordenes.test.tsx` y `.novedades.test.tsx` |
| R17, R18 | `tests/unit/services/geo-ubicacion.test.ts`, `bulk-orden-service.n-niveles.test.ts`, `bulk-orden-service.forma-pais.test.ts`, `tests/integration/api/v2-paises-de-prueba.route.test.ts` |
| R19 + decisión «v1 y el cantón sin distritos» | `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` (3 tests nuevos: por v1 se rechaza, por v2 entra) |
| R21 | `tests/components/GeografiaPlataformaSinAviso.test.tsx`, `GeografiaPlataformaAltaPais.test.tsx` |
| R22 | `tests/unit/repositories/lugar-orden.test.ts`, `tests/unit/services/ruta-del-lugar.test.ts`, `tests/integration/db/orden-lugar-owner.test.ts` |
| R23 | `tests/unit/repositories/lugares-del-filtro.test.ts`, `orden-repository-filtros.test.ts`, `tests/integration/db/slt48-filtro-orden-nueva.test.ts` |
| R24 | `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`, `zona-reconciliacion-ordenes.test.ts` |
| R25 | `tests/unit/utils/ubicacion-presentacion.test.ts`, `tests/integration/db/informe-transito-nodo.test.ts` |
| R26 | `e2e/geo-presentacion-4-niveles.spec.ts` |
| R27 | `tests/integration/db/cierre-dia-snapshot-nodo.test.ts`, `e2e/geo-presentacion-4-niveles.spec.ts` (cierre de 4 niveles) |
| R28 | `tests/integration/api/v1-ordenes-lugar.route.test.ts` (misma respuesta con y sin las 3 FK; texto de R28 corregido) |
| R29 | `tests/unit/guards/orden-fk-geo-sin-uso.guardia.test.ts` |
| R30, R33 | **Persona, T7.1:** salida de `geo:explain-*` y `geo:equivalencia-*` pegada en el PR (checklist en esta bitácora) |
| R31, R32 | `tests/unit/services/geografia-dominio.distrito-de-tarifa.test.ts`, `tests/integration/db/tarifas-flexibles-resolver.test.ts`, `slt89-equivalencia-cr.test.ts`, `slt48-tarifas-equivalencia.test.ts` |
| R34, R35, R37, R38 | `tests/integration/db/geografia-mover-nodo.test.ts`, `tests/unit/actions/geografia-plataforma.mover.test.ts`, `geografia-plataforma-action.test.ts` |
| R36 | `geografia-mover-nodo.test.ts` (vista previa con desglose por nivel), `tests/components/MoverNodoDialog.test.tsx` |
| R39, R40, R41 | `tests/integration/db/geografia-mover-nodo-ordenes.test.ts` |
| R42 | Esta bitácora, sección T0 (maqueta aprobada el 2026-11-17): la revisa el reviewer |
| R43 + «Ubicación incompleta» antes de guardar | `tests/components/CorregirUbicacionNNiveles.test.tsx` |
| R44 | `tests/unit/types/historial-accion-etiquetas-ruta.test.ts` |
| R45 + «Un/Una <tipo>» | `tests/components/TarifasGruposNNiveles.test.tsx`, `tests/components/ZonasNNiveles.test.tsx`, `geografia-arbol-n-niveles.test.tsx` |
| R46 | `tests/integration/db/carga-masiva-4-niveles.test.ts` |
| R47 | `tests/unit/guards/etiquetas-geograficas-sin-literal.guardia.test.ts` |
| R49 | 14 specs E2E de flujos críticos, 14/14 en verde en local (sección «Ajustes tras T6»); además CI del PR a `prod` |

R sin test automatizado: **ninguna**. R30 y R33 dependen por diseño de la corrida de una persona (T7.1), y R42 de la aprobación anotada.

### T7.3 — Gate local (2026-11-18)

- `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`: **ROJO en el paso del validador de features**, antes de llegar al typecheck:
  `✗ feature_list.json invalido: zona fullstack: SLT-46, SLT-47, SLT-48, SLT-81, SLT-89, SLT-125, SLT-136, SLT-144 (8 in_progress, max 3)`.
  Es el cupo del board, no el código de esta rama; lo resuelve el leader. Además, `feature_list.json` no existe en el worktree.
- Lo sustituí por lo que permite el encargo, con `NODE_OPTIONS=--max-old-space-size=8192`:
  - `pnpm run typecheck`: **0 errores**.
  - `pnpm run lint`: **0 errores** (246 avisos).
  - `pnpm run test:guardias`: 338/339 archivos y 4759/4764 tests en verde. El único rojo es `dependencias-declaradas-presentes` (4 tests), que está en el baseline y viene del arnés (`init.sh` no tiene el paso 2 de la ficha 420).
  - `vitest run` de los 158 archivos de test que toca la rama, en 6 tandas de 30 contra `servi_logistic_slt48`: 2.193 verdes. Rojos:
    - 5 del baseline (`cobertura-repository`, `corregir-datos-cliente.repo`, `corregir-ubicacion-geocode`, `emisor-relaciones-anidadas`, `orden-remision-borrada-libera-numero`): necesitan una base sembrada y los ve CI.
    - 6 fuera del baseline (`carga-division`, `geografia-alta`, `geografia-catalogo-activo`, `geografia-dos-paises`, `geografia-mover-nodo`, `geografia-mover-nodo-ordenes`). Fallaban por datos que dejaron el seed y el E2E en `servi_logistic_slt48` (`23505 usuario_un_solo_superadmin` y únicos repetidos). En una base limpia nueva, `servi_logistic_slt48_gate` (`prisma migrate deploy`), salen **59/59 en verde** (15+15+16+5+7+3).
- T7.3 queda sin `[x]`: falta `./init.sh` en verde, que depende del cupo, y el check `gate-completo` de CI.

- 2026-11-18 (frontend_dev) 57c6309c: un solo mensaje en corregir ubicación; «Ubicación incompleta» reemplaza a «Falta completar: <nivel>.» en todos los países (decisión del humano). 4 aserciones de `CorregirUbicacionNNiveles.test.tsx` cambiadas con la cita; 6 archivos de tests, 108 passed; typecheck y eslint de los tocados, 0 errores.

## Review vuelta 1 (backend_dev, 2026-11-18)

Arreglados los hallazgos 5 (carrera P1) y 6 (`down.sql` sin el mensaje de P5) de `progress/review_SLT-48.md`. Base: `servi_logistic_slt48_gate`, local y limpia. No se usó el grafo: los cambios son de esta tanda y bastaron Grep y Read.

### 1. Carrera P1 en `mover`
- `lib/repositories/GeoRepository.ts`: `bloquearNodos` hace `SELECT … ORDER BY id FOR UPDATE` de los nodos del subárbol. `evaluarMovimiento` recibe un `bloquearSubarbol` opcional, que solo pasa `mover`, y lo llama antes de contar. La vista previa no bloquea.
- Por qué basta: la FK `orden_nodo_geografico_id_fkey` ya toma `FOR KEY SHARE` del nodo en cada escritura de `orden` que pone nodo (alta, carga masiva y corrección), y eso choca con `FOR UPDATE`. Una orden en vuelo hace esperar a `mover` y entra en el conteo, que es otra sentencia con otra foto en READ COMMITTED. Una orden que llega después espera a que `mover` termine. **Ni el trigger ni la escritura de `orden` cambian, y no hay migración nueva.** La carga masiva (R10) no paga nada nuevo: solo espera si coincide con un `mover` en ese subárbol.
- Medido: en el nodo movido no había hueco. El `UPDATE` de `padre_id` toca el único `(padre_id, nombre_normalizado)` y ya tomaba `FOR UPDATE`. La carrera estaba en los descendientes, y el test va por ahí.
- Riesgo que queda: si una transacción larga de carga masiva tiene ya un nodo del subárbol y pide otro que `mover` bloqueó, Postgres ve un deadlock. Aborta al que esperó primero, que es `mover` (40P01, 500 al superadmin, que reintenta). La carga no se ve afectada.
- Test nuevo: `tests/integration/db/geografia-mover-nodo-carrera.test.ts`, con dos conexiones y el país `XM` commiteado bajo el lock de escrituras reales y borrado en el `finally`. La transacción A escribe una orden abierta en Centro, que hereda la marca de Norte, y no confirma. `mover` intenta llevar Alto, el padre de Centro, de Norte a Sur, con `lock_timeout` 1500 ms en su conexión.
  - **Rojo sin el arreglo** (lib revertido): `expected { estado: 'movido' } to deeply equal { error: '55P03' }`. Se movía con la orden en vuelo, que quedaba fuera de P1.
  - **Verde con el arreglo**: el primer `mover` espera y acaba en 55P03 sin mover. Al confirmar A, el segundo devuelve `bloqueado` con 1 orden y su empresa.

### 2. `down.sql` de `20261117120100` y P5
- La precondición cuenta también las órdenes que quedarían sin provincia o sin cantón tras el paso 3: sin nodo ni FK, o con las FK a medias. El mensaje da el total y el desglose: `SLT-48 down: N ordenes no caben en la geografia vieja: X estan en un nodo que no sabe guardar … y Y no tienen nodo ni provincia y canton`. El test R12 de antes (`/SLT-48 down: 1 ordenes/`) sigue igual y en verde.
- Guardia: ningún guard ni test de `tests/unit` fija el contenido o el hash de este `down.sql`. `slt48-migraciones-declaradas` sigue verde.
- Caso nuevo en `migracion-slt48-ida-y-vuelta.test.ts`: «R12 (P5): una orden sin nodo ni FK…».
  - **Rojo sin el arreglo** (`down.sql` revertido): `la columna «provincia_id» de la relación «orden» contiene valores null — en «ALTER TABLE "orden" ALTER COLUMN "provincia_id" SET NOT NULL»` (23502). Los dos R11 siguientes caen en cascada.
  - **Verde con el arreglo**: 7/7.

### Salida
- `pnpm run typecheck`: 0 errores. `eslint` de los 3 archivos tocados: 0.
- `vitest run tests/integration/db/geografia-mover-nodo` (con `-carrera` y `-ordenes`): 3 archivos, 11 tests en verde.
- `vitest run migracion-slt48-ida-y-vuelta` + `tests/unit/db/slt48-migraciones-declaradas`: 2 archivos, 16 tests en verde.
- `pnpm run test:guardias`: 338/339 archivos. El único rojo es `dependencias-declaradas-presentes` (4 tests), que está en el baseline, como en la review.
- No toqué el trigger de `orden`, así que no corrí `slt48-triggers-orden-pais` ni `slt48-trigger-orden-rendimiento`.

Mapa R → test: P1/R40 suma `geografia-mover-nodo-carrera.test.ts`; R12 suma «R12 (P5): una orden sin nodo ni FK…».

Veredicto: hallazgos 5 y 6 arreglados, los dos con evidencia de rojo a verde.

## Review vuelta 2 — tope de mover (backend_dev, 2026-11-18)

Decisión del humano (`progress/features/SLT-48.md`, «tope corto a mover»): el que cede siempre es el superadmin. Base: `servi_logistic_slt48_gate`, local y limpia (`prisma migrate status`: al día). No se usó el grafo: bastaron Grep y Read sobre lo de esta feature.

### Diseño elegido: (a), P1 sin bloqueos y luego una transacción corta con tope
- `GeoRepository.mover` calcula P1 (la parte cara) **fuera de toda transacción y sin bloqueos**, con `evaluarMovimiento` sobre el cliente, igual que la vista previa.
- Después abre una transacción corta:
  1. `SET LOCAL lock_timeout = TOPE_MOVER_MS`;
  2. `bloquearNodos`: el subárbol `FOR UPDATE`, como en la vuelta 1;
  3. `SET LOCAL statement_timeout = TOPE_MOVER_MS`. Va después de bloquear: antes cortaba la espera del bloqueo como 57014 en vez de 55P03 (medido, el test de carrera lo vio);
  4. `confirmarP1`: si un nodo se colgó del subárbol desde la lectura, `cambio_concurrente`. Si no, P1 solo para las órdenes abiertas que no estaban en la primera pasada (`bloqueoDeMover` con `yaVistas`). Las de la primera pasada ya dieron `null`, así que el bloqueo de las nuevas es el bloqueo entero;
  5. el `updateMany` y el historial, como antes.
- La transacción lleva `timeout: TIMEOUT_TRANSACCION_MOVER_MS` (2 × tope = 4 s), en lugar de los 30 s de antes.
- `TOPE_MOVER_MS = 2_000`, con el porqué en el comentario. Con los bloqueos quedan unas 10 sentencias pequeñas (milisegundos en local), y 4 s queda por debajo de los 5 s por defecto de cada chunk de la carga masiva.
- Error tipado: `lib/repositories/_shared/prisma-ocupado.ts > esMoverOcupado` reconoce 55P03, 57014, 40P01, P2028 y P2034, en `code`, en `originalCode` de algún `cause` o en el mensaje.
  - `moverNodoAction` lo devuelve como `{ status: "conflict", motivo: "ocupado" }` (`MoverOcupadoResult`), igual que `cambio_concurrente`, y sin `console.error`.
  - El repositorio deja subir el error de Postgres o Prisma tal cual. Así el test de carrera sigue esperando `{ error: "55P03" }` sin cambiar su aserción.
- UI: `MoverNodoDialog` recibe un texto nuevo, `avisoOcupado`: «Se están guardando órdenes en ese lugar. Intenta de nuevo en unos segundos.».
  - Ante `ocupado` muestra un `toast.error` y se queda en el paso 2, para que «Sí, mover» se pueda pulsar otra vez.
  - Va antes de `motivoDeRechazo`, que pintaría el otro `conflict` (el hermano con el mismo nombre).
  - No hay literales de país.
- `docs/architecture.md`, en el bloque de mover un nodo: quién cede, el tope y el error.

### Archivos
- `lib/repositories/GeoRepository.ts`: `TOPE_MOVER_MS` y `TIMEOUT_TRANSACCION_MOVER_MS` (exportadas para el test), `confirmarP1`, `bloqueoDeMover` con `yaVistas`, y `mover` en dos tiempos. `evaluarMovimiento` ya no recibe `bloquearSubarbol`.
- `lib/repositories/_shared/prisma-ocupado.ts` (nuevo).
- `lib/actions/geografia-plataforma.ts`: `MoverOcupadoResult` y la traducción en `moverNodoAction`.
- `app/(app)/plataforma/geografia/_components/MoverNodoDialog.tsx`: `avisoOcupado` y la rama `ocupado`.
- `docs/architecture.md`.
- Tests:
  - `tests/integration/db/geografia-mover-nodo-cede.test.ts` (nuevo, 3 casos);
  - casos nuevos en `tests/unit/actions/geografia-plataforma.mover.test.ts` (6) y en `tests/components/MoverNodoDialog.test.tsx` (1);
  - `geografia-mover-nodo-carrera.test.ts`: solo el comentario de cabecera. Ninguna aserción existente cambió.

### Evidencia: `geografia-mover-nodo-cede.test.ts`, dos conexiones y país `XK`
Medido con un log temporal, que se quitó después:

| Caso | Espera medida | Resultado |
|---|---|---|
| 1. `mover` tiene los bloqueos y una sentencia se alarga (`pg_sleep(10)` inyectado tras tomarlos) | la orden esperó **2037 ms** y se guardó | `mover` → `{ conflict, ocupado }` (57014), `padre_id` igual, 0 filas de historial. Un `mover` posterior cuenta esa orden y se bloquea (P1). |
| 2. `mover` tiene los bloqueos y se para fuera de la base (promesa sin resolver) | la orden esperó **4016 ms** (`timeout` de Prisma) | `mover` → `{ conflict, ocupado }` (P2028), sin escribir. |
| 3. Al revés: una orden en vuelo en el subárbol | `mover` esperó **2108 ms** (su `lock_timeout`) | `mover` → `{ conflict, ocupado }` (55P03), sin escribir. |

- Las cotas del test: la espera de la orden está entre `tope/2` (prueba que esperó de verdad) y `tope + 1,5 s` (en el caso 2, el `timeout` de la transacción + 1,5 s). En el caso 3, `mover` está entre `tope − 100 ms` y `tope + 1,5 s`. Sin sleeps en Node: se usan transacciones abiertas, promesas y un `pg_sleep` dentro de la base, que corta el `statement_timeout`. Cada caso desconecta sus dos clientes en un `finally`, y el `afterAll` exige que `XK` no deje residuos.
- **Rojo con el `mover` de antes**: `lib` en `HEAD` más las dos constantes, para que compile. Los 3 casos fallan.
  - En el caso 3, `mover` esperó **30 525 ms**, su `timeout` de 30 s.
  - En los casos 1 y 2, `mover` devolvió `ok`: no había tope que lo hiciera ceder.
- `DeprecationWarning: client.query() when the client is already executing` sale de `geografia-mover-nodo-ordenes` y ya salía en `HEAD` (comprobado). No es de este cambio.

### Salida
- `pnpm run typecheck`: 0 errores.
- `eslint` de los 8 archivos tocados: 0 problemas.
- `vitest run tests/integration/db/geografia-mover-nodo tests/unit/actions/geografia-plataforma.mover tests/components/MoverNodoDialog`: **6 archivos, 67 tests, todos verdes**. Incluye `geografia-mover-nodo-carrera` (P1 sigue cerrado, con `{ error: "55P03" }` y luego `bloqueado` con 1 orden), `geografia-mover-nodo`, `geografia-mover-nodo-ordenes` y `geografia-mover-nodo-cede`.
- `pnpm run test:guardias`: 338/339 archivos. El único rojo es `dependencias-declaradas-presentes` (4 tests), que está en el baseline, como en las vueltas anteriores.

Mapa: P1/R40 (el tope de mover) suma `geografia-mover-nodo-cede.test.ts` (3 casos), «SLT-48 P1, review vuelta 2 — `mover` cede…» en `geografia-plataforma.mover.test.ts` y «P1, review vuelta 2 — mover cedió…» en `MoverNodoDialog.test.tsx`.

Veredicto: `mover` cede siempre ante las escrituras de una empresa, con un tope de 2 s (4 s por transacción), y falla limpio con `ocupado`. P1 sigue cerrado.

## Review vuelta 3 (backend_dev, 2026-11-18)

Los dos menores de `progress/review_SLT-48.md > Vuelta 3`, que hacen cumplir decisiones del humano (tope corto, P4 y P1). Base: `servi_logistic_slt48_gate`, local y limpia (`prisma migrate deploy`: sin pendientes). No se usó el grafo: bastaron Grep y Read sobre lo de esta feature.

### 1. Tope: 1 s y 2 s (hallazgo 2)
- `TOPE_MOVER_MS` = 1 000 ms y `TIMEOUT_TRANSACCION_MOVER_MS` = 2 × tope = 2 000 ms (`lib/repositories/GeoRepository.ts`).
- Justificación en el comentario de las constantes. El peor caso teórico de una escritura de empresa es el `timeout` de la transacción (2 s) más una sentencia en vuelo cortada por el `statement_timeout` (1 s): **~3 s**. Queda lejos de los 5 s de cada chunk de la carga masiva. Con el tope de la vuelta 2 eran ~6 s.
- Tests: `geografia-mover-nodo-cede` ya leía las constantes exportadas, así que no cambió. Ninguna otra prueba de mover usa cifras del tope. `-carrera` pone su propio `lock_timeout` de 1,5 s, pero `mover` lo pisa con su `SET LOCAL` de 1 s, y sigue esperando `{ error: "55P03" }`. **Ninguna aserción numérica cambió.**
- `docs/architecture.md`, bloque de mover un nodo: tope de 1 s, transacción de 2 s, peor caso de ~3 s y las cifras medidas nuevas.

Medido en `geografia-mover-nodo-cede`, con una escritura temporal a un archivo del scratchpad que se quitó después:

| Caso | Vuelta 2 (tope 2 s) | Vuelta 3 (tope 1 s) |
|---|---|---|
| 1. Una sentencia lenta con los bloqueos tomados: lo que espera la orden | 2 037 ms | **1 056 ms** |
| 2. `mover` parado con los bloqueos: lo que espera la orden (`timeout` de Prisma) | 4 016 ms | **2 023 ms** |
| 3. Una orden en vuelo: lo que espera `mover` (`lock_timeout`) | 2 108 ms | **1 101 ms** |

### 2. El destino en la segunda fase (hallazgo 1)
- **Bloqueo.** `bloquearNodos` recibe el subárbol más el destino y sus antepasados (`cadenaDelDestino`, nueva en `MovimientoEvaluado`), y los bloquea en **una sola sentencia** `FOR UPDATE` con `ORDER BY id`. El orden es el mismo para todos, así no hay interbloqueos con otro `mover`. El destino nunca está en el subárbol: R35 exige que tenga la profundidad del padre.
  - El coste: mientras dura la fase 2, una orden o un hijo nuevo que apunte al destino o a un antepasado suyo también espera, con el mismo tope. Está anotado en el comentario de `bloquearNodos` y en `docs/architecture.md`.
- **Comprobación.** `confirmarP1` empieza con `destinoSigueIgual`: cada nodo de la cadena existe, sigue activo (P4) y tiene el mismo `padre_id` que en la fase 1. Si no, devuelve `cambio_concurrente` antes de escribir nada.
  - Usa `SELECT_FLAG_PROPIO` por la guardia `geografia-predicado-unico`. La primera versión llevaba un `activo: true` literal y la guardia la puso en rojo.
- **Órdenes ya vistas que cambian.** `abiertasVistas` pasa de `Set<id>` a `Map<id, firma>`, con firma = `organizacionId|zonaId|nodoId` (`firmaDeOrden`). En la segunda pasada, `bloqueoDeMover` salta solo las órdenes con la misma firma; una orden a la que una corrección le cambió el nodo o la zona vuelve a pasar por P1.
  - **Es gratis**: la consulta de la segunda pasada ya traía todas las órdenes abiertas del subárbol con `organizacionId`, `zonaId` y `nodoGeograficoId`. La comparación se hace en memoria, O(n) sobre esas filas. No hay consulta ni columna nueva, y no hace falta `updatedAt`.
  - Una orden que se fue del subárbol deja de aparecer, y está bien: con el árbol nuevo ya no cuelga del nodo movido. Una que entró ya se miraba antes (no estaba en `yaVistas`).
  - **Límite:** los cambios de tarifas (grupos o marcas de la empresa) entre fases no se vuelven a mirar. No estaban en el alcance del hallazgo.

### Tests nuevos: `tests/integration/db/geografia-mover-nodo-entre-fases.test.ts` (país `XJ`, 4 casos)
- El gancho entre fases usa el mismo proxy de `-cede`. Justo antes del `SET LOCAL lock_timeout` con el que empieza la fase 2, con la transacción abierta y sin bloqueos, otra conexión (`base`) escribe y confirma el cambio. El código de `mover` es el real. Sin sleeps; un cliente propio para `mover`, desconectado en `finally`, y el `afterAll` exige 0 residuos de `XJ`.
- Árbol: Norte › Alto › {Centro, Oeste}; Sur › Bajo; Este. Marca de zona especial en Norte (Centro la hereda) y en Oeste (propia).

| Caso | Cambio entre fases | Esperado |
|---|---|---|
| destino retirado | Alto → Sur; Sur pasa a `activo = false` | `cambio_concurrente`, `padre_id` igual, 0 filas de historial |
| antepasado del destino retirado | Centro → Bajo; Sur (padre de Bajo) pasa a `activo = false` | ídem |
| destino cambia de padre | Centro → Bajo; Bajo pasa de Sur a Este | ídem |
| orden ya vista cambia de nodo | Alto → Sur con una orden en Oeste (no afectada; la vista previa da `bloqueo: null`). La corrección la pasa a Centro, que perdería la marca | `bloqueado` con 1 orden de la empresa, sin escribir |

- **Rojo sin el arreglo**: con `lib` sin las tres piezas (sin la cadena en `bloquearNodos`, sin `destinoSigueIgual`, y saltando por id como antes), los 4 casos fallan con `{ estado: "movido" }`. Es decir: se colgaba el nodo de un padre retirado o de una cadena distinta, y la orden corregida quedaba fuera de P1.
- El caso de zona no tiene test propio: la firma la incluye igual que el nodo, por el mismo camino de código.

### Archivos
- `lib/repositories/GeoRepository.ts`: constantes y su comentario, `firmaDeOrden`, `bloqueoDeMover` con `Map`, `cadenaDelDestino`, `destinoSigueIgual`, `confirmarP1` y `bloquearNodos` con la cadena del destino.
- `docs/architecture.md`, bloque «Mover un nodo».
- `tests/integration/db/geografia-mover-nodo-entre-fases.test.ts` (nuevo).

### Salida (`NODE_OPTIONS=--max-old-space-size=8192`)
- `pnpm run typecheck`: 0 errores.
- `eslint` de `GeoRepository.ts` y del test nuevo: 0 problemas.
- `vitest run tests/integration/db/geografia-mover-nodo* tests/unit/actions/geografia-plataforma.mover.test.ts tests/components/MoverNodoDialog.test.tsx` (más la guardia `geografia-predicado-unico`): **8 archivos, 82 tests, todos verdes**. Incluye `-carrera` (1), `-cede` (3), `-entre-fases` (4), `geografia-mover-nodo` y `-ordenes`.
- `pnpm run test:guardias`: el único rojo que queda es `dependencias-declaradas-presentes` (4 tests), que está en el baseline como en vueltas anteriores. `geografia-predicado-unico` salió en rojo con la primera versión y quedó verde tras usar `SELECT_FLAG_PROPIO`.

Mapa: P4/R35 y P1/R40 suman `geografia-mover-nodo-entre-fases.test.ts` (4 casos). P1, el tope, sigue en `geografia-mover-nodo-cede.test.ts`.

Veredicto: tope de 1 s / 2 s (peor caso ~3 s; medido ~1 s y ~2 s). La fase 2 bloquea y vuelve a comprobar el destino y su cadena, y vuelve a pasar por P1 las órdenes corregidas entre fases, sin coste extra.

## CI PR #225 — zonas-nodo-canton (frontend_dev, 2026-11-18)

Rojo de `e2e (aislamiento)` en `e2e/zonas-nodo-canton.spec.ts` (de SLT-89). Archivo tocado: solo ese spec.

**(2) :261 — rojo de verdad, por R15.** La orden nueva ya no escribe las FK viejas.
- Antes: `select { zonaId, distritoId, organizacionId }` y `toEqual({ zonaId, distritoId: distrito.id, organizacionId })`.
- Después: `select { zonaId, nodoGeograficoId, organizacionId }` y `toEqual({ zonaId, nodoGeograficoId: distrito.id, organizacionId })`,
  con `// SLT-48 R15: la orden guarda solo su nodo; las FK viejas quedan en NULL`.
- `distrito.id` sale de la vista `distrito`, que es `SELECT n.id ... FROM nodo_geografico n WHERE n.profundidad = 3`
  (migración `20261117120100_slt48_geografia_vieja_a_vistas`): su id es el del nodo.

**(1) :227 — no idempotente (anterior a SLT-48).** El describe es `serial`: al fallar (2), Playwright reintenta el
bloque entero; el `beforeAll` siembra empresas nuevas, pero la fila de `zona_nodo` que (1) creó para la zona de A
del intento anterior sigue ahí, y la lectura de :258 ve una fila de más. Arreglo, sin tocar aserciones: al empezar,
(1) borra las filas de `zona_nodo` de ese cantón de empresas de E2E (`slug` `humo-…`) que no son las A y B de este intento.

**Resto de `e2e/`:** sin más aserciones sobre `provinciaId`/`cantonId`/`distritoId` de una orden nueva. Los usos que
quedan son siembras de órdenes por fixture (`_dos-empresas-fixture`, `_wallet-iva-sl39-siembra`, `cobro-plataforma-sl40`,
`pago-plataforma-sl45`), lecturas de vistas o de `zona_distrito`, no aserciones.

**Salida local** (`servi_logistic_slt48`, `E2E_PUERTO=3048`, `E2E_SERVIDOR=dev`,
`pnpm exec playwright test e2e/zonas-nodo-canton.spec.ts --project aislamiento --no-deps --retries=0`):
```
[1/3] (1) A asigna el cantón entero ... queda en `zona_nodo`
[2/3] (2) una orden nueva en un distrito del cantón sale con la zona de A y el precio de su tarifa
[3/3] (3) B no ve la zona de A ni tiene cobertura en el cantón
  3 passed (23.0s)
```
Nota: sin `--project aislamiento --no-deps`, el comando corre antes su dependencia `plataforma-vacia`, que en local
falla en `superadmin-empresas.spec.ts:224` (el `.env` local trae correo a medias: «El correo no está configurado» no
aparece) y deja los 3 sin correr. Es del entorno local, no de este cambio.

`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, exit 0. `eslint` del spec: limpio.

Veredicto: (2) afirma el nodo (R15) y (1) es idempotente ante el reintento del describe serial; verde en local.
