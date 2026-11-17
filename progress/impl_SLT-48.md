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
