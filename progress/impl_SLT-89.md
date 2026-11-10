# impl SLT-89 — geo-jerarquica-zonas

> Bitácora del implementer. Base de pruebas: `logistic_slt89` en localhost (desechable, creada para esta
> feature con `prisma migrate deploy`; sin siembra de catálogos ni usuarios). Memoria baja:
> `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`. Sin push (lo hace el leader).

## Tanda 1 (2026-11-10): T0.1, T1, T2

Sha de partida: `0d4d7d99` (docs(SLT-89): F2.0, aprobado y choque con Tarifas aceptado), apilada sobre
`origin/feature/SLT-46-geo-jerarquica-admin` @ `51c0345e` (PR #107). T0.2 (maqueta) y T7 (UI) fuera de
esta tanda.

### T0.1 — la rama arranca en verde

Sin `./init.sh` (pila de horas en esta máquina, por instrucción del leader); en su lugar, sobre el sha
de partida:
- `pnpm install --frozen-lockfile` + `prisma generate`: limpios.
- `prisma migrate deploy` sobre `logistic_slt89` recién creada: «All migrations have been successfully
  applied» (última: `20261106120200_slt46_pais_tipos_de_nivel_opcional`).
- `pnpm run typecheck`: exit 0, sin errores.
- Contrato v1 congelado: `tests/integration/api/contrato-v1.route.test.ts` (modo comparar) →
  `Test Files 1 passed (1) · Tests 22 passed (22)`.
- CI: el PR #107 de SLT-46 «Geografía jerárquica: administración de países» (mismo sha `51c0345e` que
  la base de esta rama) no tiene corrida de `gate-completo` en `gh pr checks` (solo Vercel, verde). El
  verde de CI de la base queda pendiente de esa corrida.

Decisión del implementer (a revisar): `origin/dev` ya tiene `20261109120000_cobro_plataforma_traza`,
mismo timestamp que la migración del spec. Las migraciones de SLT-89 pasan a
`20261110130000_slt89_zona_nodo` y `20261110130100_slt89_historial_zona_nodo` (revisado contra `dev` y
todas las ramas remotas: SLT-81 usa `20261109130000`, `dev` `20261110120000`, SLT-97 `20261111120000`).


### T1.1 — migración `20261110130000_slt89_zona_nodo` (= `20261109120000_slt89_zona_nodo` del spec)

Archivos: `db/migrations/20261110130000_slt89_zona_nodo/{migration.sql,down.sql}`.

- Tablas `zona_nodo` y `grupo_distritos_nodo` (design §2.1, §2.2) con `organizacion_id` + DEFAULT de
  empresa, FK, índices, RLS `<t>_por_empresa` y GRANT a `servi_app` (molde `20261103120100`). Nombres de
  índices y FK sacados de `prisma migrate diff` contra el schema (el único de `grupo_distritos_nodo`
  va recortado a 63 como lo recorta Prisma: `…_nodo_geografic_key`).
- Triggers de validación, `SECURITY DEFINER` + `search_path` fijo (precedente
  `geografia_del_pais_de_la_empresa`): `zona_nodo_valido` (SL021; profundidad 3 → 23514),
  `grupo_distritos_nodo_valido` (SL021; distrito con fila en `zona_distrito` de esa zona → 23514) y,
  en la tabla existente, `grupo_distritos_distrito_sin_duplicado` (23505).
- Triggers de misma empresa: pegados tal cual de `pnpm exec tsx scripts/generar-misma-empresa.ts
  --faltantes` (2 FK `sme_*` + 2 `*_sin_cambio_de_empresa`).
- `CREATE OR REPLACE FUNCTION orden_nodo_geografico()` (§2.3). El `down.sql` lo devuelve al cuerpo de
  SLT-43 copiado carácter por carácter de `20261104120400` (líneas 46-51).

Decisiones a revisar (reviewer):
1. **Rama extra en el trigger de `orden`, no escrita en el pseudocódigo de §2.3.** En un UPDATE que
   mueve el lugar (`COALESCE(distrito_id, canton_id)` cambia) sin tocar `nodo_geografico_id`, el nodo
   que trae NEW es el VIEJO: se pone el lugar, como SLT-43. Sin esa rama, pasar `distrito_id` a NULL
   (lo que hace la FK de `orden.distrito_id` al borrar un distrito, cabecera de 20261104120400) dejaría
   el distrito viejo como nodo —cuelga del cantón, «se conserva» según el pseudocódigo— y la FK
   RESTRICT `orden_nodo_geografico_id_fkey` impediría el borrado: rompería R29. Lo cubre T1.5.
2. `grupo_distritos_distrito_sin_duplicado` se dispara en `INSERT OR UPDATE OF zona_id, distrito_id`
   (el design dice `BEFORE INSERT`); `grupo_distritos_nodo_valido` en `INSERT OR UPDATE OF
   nodo_geografico_id, zona_id`. Solo cierra el hueco de un UPDATE por SQL a mano; la app no actualiza
   esas filas.
3. `scripts/db-rollback.ts` revierte la ÚLTIMA carpeta en disco, no la última aplicada: dos
   `db:rollback` seguidos corren dos veces el down de `20261110130100` (no-op) y nunca el de
   `20261110130000`. El down de `20261110130000` se corrió con `prisma db execute --file` + borrado de
   su fila en `_prisma_migrations` (lo mismo que hace el script). Es del script, no de SLT-89.

Comprobación en `logistic_slt89` (local, desechable):
- `prisma migrate deploy` → «All migrations have been successfully applied» (las dos de SLT-89).
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` → «This is an
  empty migration.» (sin drift, con el schema de T1.3).
- Vuelta: down de `20261110130100` (no-op) + down de `20261110130000` → «Script executed
  successfully»; comprobación por SQL: sin `zona_nodo`/`grupo_distritos_nodo`, sin las tres funciones,
  `orden_nodo_geografico` sin el cuerpo nuevo. `migrate status`: las dos pendientes.
- Reaplicadas con `migrate deploy` → aplicadas; `migrate diff` otra vez vacío.

### T1.2 — migración `20261110130100_slt89_historial_zona_nodo` (= `20261109120100_…` del spec)

Archivos: `db/migrations/20261110130100_slt89_historial_zona_nodo/{migration.sql,down.sql}`;
`specs/SLT-89-geo-jerarquica-zonas/tasks.md` (T1.1 y T1.2 marcadas, con la nota del timestamp).

- Sola en su migración (55P04): `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS
  'zona_nodo_cambiado';`.
- `down.sql` = `SELECT 1;` con el comentario de por qué el valor se queda (molde SLT-46
  `20261106120000`). Aplicada, revertida (no-op) y reaplicada en `logistic_slt89` junto con T1.1.

### Revisión del diff sin commitear del backend_dev anterior (2026-11-10)

El backend_dev anterior terminó sin informe y dejó T1.3/T1.4 en el árbol. Revisado línea a línea antes
de commitear. Todos los cambios en tests/guardias existentes son censos o la lista `SOBRE_SLT43`;
cada número se comprobó contra `db/migrations/20261110130000_slt89_zona_nodo/migration.sql`
(2 `CREATE TABLE`, 2 `CREATE POLICY … _por_empresa`, 2 `sme_*` —`zona_id` de cada tabla—, 2
`*_sin_cambio_de_empresa`) y `20261110130100` (1 valor de enum). Ninguna aserción cambiada sin respaldo.

| Archivo | Qué cambió | Por qué (respaldo) |
|---|---|---|
| `scripts/verificar-rls-despliegue.ts` | `TRIGGERS_MISMA_EMPRESA` 169 → 171 | 2 `sme_*` nuevos (`sme_zona_nodo_zona_id_…`, `sme_grupo_distritos_nodo_zona_id_…`); las FK a `nodo_geografico` van a plataforma y la compuesta al grupo comparte columna |
| `tests/unit/scripts/verificar-rls-despliegue.test.ts` | modelos 87 → 89; contrato `{88,169,87}` → `{90,171,89}`; `sme` 169 → 171 en los casos inventados | +2 tablas de negocio → +2 políticas, +2 sin-cambio; +2 `sme_*` (el número es global, no depende de la lista inventada) |
| `tests/unit/guards/rls-por-empresa.guardia.test.ts` | tablas 87 → 89 | `zona_nodo`, `grupo_distritos_nodo` |
| `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` | tipos 82 → 83 (largo y `Set`); `mueve_dinero` 50 → 51 | `zona_nodo_cambiado` (design §2.4: categoría `mueve_dinero`); entidades siguen en 31 |
| `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` | tipos 82 → 83; `ESCRITOR_PENDIENTE_EN_CURSO` gana `{ zona_nodo_cambiado, SLT-89, T3.2 }` | el valor entra con la base (T1.2) y su productor (`ZonaRepository.update`) llega en T3.2. Anotarlo como pendiente es el uso previsto de esa lista (molde SLT-52 T6.2); T3.2 debe vaciarla y sumar el censo |
| `tests/integration/db/migracion-slt43-ida-y-vuelta.test.ts` | `SOBRE_SLT43` gana las dos de SLT-89 + comentario | patrón de SLT-46: FK a `nodo_geografico` (42P01 antes de la ida) y `CREATE OR REPLACE orden_nodo_geografico` (42723 contra el `CREATE FUNCTION` de la ida). Sin cambio de aserciones |
| `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `lib/types/historial-accion.ts` | modelos `ZonaNodo`/`GrupoDistritosNodo`, inversas, valor de enum; 2 modelos de negocio; tipo + categoría + etiqueta «Cambió los lugares de una zona» | T1.3 y design §2.1, §2.2, §2.4 |

Verificación (logistic_slt89, `--maxWorkers=1`): los 4 archivos nuevos + los 4 de censo →
`Test Files 8 passed (8) · Tests 197 passed (197)`; `migracion-slt43-ida-y-vuelta` →
`Test Files 1 passed (1) · Tests 8 passed (8)`. `prisma migrate status`: «Database schema is up to date!».

Spec: `tasks.md` y `design.md` (§2.6) con los nombres de migración nuevos (`20261110130000_…`,
`20261110130100_…`).

### T1.3 — schema y modelos de negocio

Archivos: `db/schema.prisma` (modelos `ZonaNodo`, `GrupoDistritosNodo`, inversas en `Zona`,
`GrupoDistritos`, `Organizacion`, `NodoGeografico`; valor `zona_nodo_cambiado`),
`lib/db/modelos-de-negocio.ts`, `lib/types/historial-accion.ts`, `scripts/verificar-rls-despliegue.ts`
y los censos de la tabla de arriba (salvo `migracion-slt43-ida-y-vuelta`, que va con T1.4).
- Guardias `organizacion-en-modelos`, `fk-misma-empresa`, `unicos-por-empresa`, `rls-por-empresa` →
  `Test Files 4 passed (4) · Tests 58 passed (58)`.
- `prisma migrate diff` contra la base: vacío (anotado en T1.1). `pnpm run typecheck`: exit 0.

### T1.4 — migraciones aditivas e ida y vuelta (R32, R33)

`tests/unit/db/slt89-migraciones-aditivas.test.ts` (helper `_migraciones-aditivas.ts`: solo las dos
carpetas de SLT-89, con down; nada sobre `orden`; contrapruebas con texto inventado) y
`tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts` (base propia: ida, los dos down en orden
inverso, reaplicadas). Más `SOBRE_SLT43` en `migracion-slt43-ida-y-vuelta.test.ts` (tabla de arriba).
Salida en `logistic_slt89`: incluida en las 8/8 (197 tests) de arriba; SLT-43 ida y vuelta 8/8.

### T1.5 — el nodo de la orden (R28, R29)

`tests/integration/db/orden-nodo-mas-profundo.test.ts`: sin nodo → el lugar (distrito o cantón); nodo
= lugar; profundidad 4 bajo el distrito se conserva (insert y update); bajo el cantón a dos saltos se
conserva; nodo ajeno se pisa; cambiar el distrito deja el sector fuera → distrito nuevo; mover el lugar
sin tocar el nodo (incluido vaciar el distrito) → el lugar nuevo (la rama extra de T1.1, decisión 1).
7 casos, verdes (dentro de las 8/8 de arriba).

### T1.6 — zona_nodo y grupo_distritos_nodo en la base (R34)

`tests/integration/db/zona-nodo-dos-empresas.test.ts`: RLS en las dos tablas (lectura y 42501 al
escribir en otra empresa), misma empresa (SL017), país (SL021 en las dos), `zona_nodo` acepta
provincia/cantón/profundidad 4 y rechaza distrito (23514), único por empresa (23505 en la misma, nada
en otra), miembro duplicado entre tablas (23514 / 23505). 6 casos, verdes.

### T2.1 — dominio puro (R14, R19)

`lib/services/geografia-dominio.ts`: `conAsignacionesDeZona(asig, zona, nodoIds)` (la zona sale de
todo nodo y entra en los pedidos; resto y marcas intactos; entrada sin mutar), `grupoDelLugar(cat,
miembros, lugarId)` (miembro más cercano: el lugar y sus ancestros; `null` sin lugar, R20) y
`mismoConjunto(a, b)` (sin orden ni repetidos). Casos en `tests/unit/services/geografia-dominio.test.ts`
(11 nuevos). `geografia-dominio.test.ts` + guardia `geografia-dominio-puro` → `Test Files 2 passed (2)
· Tests 47 passed (47)`.

### T2.2 — el cargador del catálogo lee `zona_nodo` (R6, R9)

`CatalogoGeograficoRepository.leerDeLaEmpresa`: una consulta más en la misma foto y en serie
(`tx.zonaNodo.findMany`, `orderBy id`), concatenada DESPUÉS de las de `zona_distrito` (§4.1).
`TxDeCarga` gana `"zonaNodo"`; `GeoRepository`, `OrdenRepository`, `CoberturaRepository` y
`ZonaRepository` ganan el delegado en su `Pick` (el resto usa `CatalogoPrismaClient` y lo hereda).

Dobles de Prisma que simulan la carga del catálogo: ganan `zonaNodo: { findMany → [] }` junto a su
`zonaDistrito` (cambio de ENTRADA, ninguna aserción tocada; sin él la carga lanza `TypeError` sobre
`undefined.findMany`). Archivos: `tests/fixtures/doble-catalogo-geografico.ts`,
`tests/unit/analytics/_catalogo-facetas.ts`, `tests/unit/whatsapp-envios/informe-transito-composicion.test.ts`,
`tests/unit/actions/{corregir-datos-cliente,cobertura,geografia}.composition-root.test.ts`,
`tests/unit/repositories/{orden-repository.bulk,catalogo-filtros-ordenes,geo-repository-arbol-zonas}.test.ts`.
Comprobado: sin el cambio del cargador esos 18 archivos daban 319/319; con el cargador y sin el
delegado, 50 rojos (todos `zonaNodo` undefined); con los dos, los 42 archivos que usan dobles del
catálogo → `Test Files 42 passed (42) · Tests 865 passed (865)`.

Integración en `logistic_slt89` sin cambiar aserciones:
- `geo-lecturas-catalogo`, `geo-catalogo-repository`, `geo-consultas-{zona,ordenes,cierre,conteo}`,
  `geo-equivalencia{,-consultas,-dinero,-analitica,-geografia}`, `geo-lecturas-sin-backfill`,
  `geo-65-fixture`, `geo-71-fixture`, `slt46-equivalencia-geografia`, `geo-sincronia-orden-zonas`,
  `zona-reconciliacion-ordenes`, `contrato-v1.route` (modo comparar), `cobertura-repository`.
- Resultado: todo verde salvo `cobertura-repository` › «la marca sigue en el Excel tras activar»: está
  en `tests/baseline-rojos.json` y da el MISMO rojo con el cargador de `HEAD` (comprobado volviendo el
  archivo a `HEAD`): deuda heredada, no de SLT-89.

### T2.3 — herencia en las lecturas (R6, R7, R8, R9)

`tests/integration/db/zona-nodo-herencia.test.ts` (8 casos, escenario `geo-44`, lectura como
`servi_app`, todo revertido): v1 (`findDistritosByCantonIds` + `resolveGeo`, el camino de carga y
cotización v1) con cantón asignado y con provincia asignada (dos saltos; el cantón más cercano gana);
excepciones de distrito conservan su zona; v2 `resolverUbicacion` con distrito y con cantón como lugar
(fks), error «sin zona» de siempre antes de asignar, provincia cubierta sigue con
`MSG_PAIS_NO_HABILITADO` (regla de guardado de SLT-45); `BulkOrdenService.cargarMasiva` crea la orden
del distrito heredado con la zona del cantón; `CotizacionOrdenService.cotizar` y `cotizarV2` cotizan el
distrito heredado (antes, 0 cotizadas); Excel de cobertura (`CoberturaRepository.listDistritos`) y
`listArbol` (zona heredada, sin marca; `zonas` directas vacías); `listGeografiaLitePorZona`; R8 con un
nodo de profundidad 4 bajo el distrito marcado (marca heredada) y bajo «sin zona» (sin marca, zona del
cantón), sin escribir marcas.

**Cambio de código hallado por el test (R6):** `GeoRepository.listGeografiaLitePorZona` metía en la
zona TODO lo que cuelga del nodo asignado, también los distritos que son excepción de otra zona. Ahora
lo que cuelga entra solo si `zonasCandidatas` (la asignación más cercana, sin colapso, como antes) es
de esta zona. Con asignaciones solo a distritos no cambia nada (lo que cuelga de un distrito no tiene
asignación propia): las 6 suites que usan `listGeografiaLitePorZona` → `Test Files 6 passed (6) ·
Tests 169 passed (169)`, sin tocar aserciones.

Salida: `zona-nodo-herencia` + `geo-lecturas-catalogo` + `geo-consultas-zona` +
`slt46-equivalencia-geografia` → `Test Files 4 passed (4) · Tests 24 passed (24)`.

### T2.4 — árbol de zonas de N niveles (R24, R36)

- `lib/types/geografia-nodo.ts`: `ArbolDeZonasDTO`, `NodoDeZonasDTO`, `TipoDeArbolDeZonasDTO` (§4.2).
- `GeoRepository.arbolDeZonas()` (+ `IGeoRepository`): una carga del catálogo, en memoria; `asignadaA`
  = asignación directa con el colapso 1/0/>1; `heredaDe` = `zonasCandidatas` sobre el padre con el
  colapso de `zonaQueCubre`, más el nodo del que hereda; tipos ordenados por profundidad.
- `GeografiaService.listarArbolDeZonas` (+ `IGeografiaService`, `ListarArbolDeZonasServiceResult`):
  solo `maestro`, rol antes de leer. Action `listarArbolDeZonas` en `lib/actions/geografia.ts`
  (`unauthenticated` sin sesión, como `listarArbolGeografico`).
- Tests: `tests/unit/services/geografia-service.test.ts` (admin, adminTienda, adminSatelite,
  mensajero y superadmin → `forbidden` con repositorios que LANZAN si se tocan; maestro → el árbol en
  una lectura) y un caso de integración en `zona-nodo-herencia.test.ts` (cantón asignado, distrito
  que hereda con su nodo, excepción con `asignadaA` y `heredaDe`, cantón retirado sin herencia).
- Adaptación de doble: `tests/unit/actions/geografia-plataforma-action.test.ts` gana
  `listarArbolDeZonas` en su doble exhaustivo (`satisfies Record<keyof IGeografiaService, …>`); sin
  él no compila. Ninguna aserción tocada.
- Salida: `geografia-service` + `zona-nodo-herencia` + tests de acciones de geografía + guardias
  `geografia-sin-cte-recursiva`/`etiquetas-geograficas-sin-literal` → `Test Files 8 passed (8) · Tests
  277 passed (277)`; `geografia-plataforma-action` 127/127; `pnpm run typecheck` exit 0.

### T2.5 — resolver: miembro más cercano (R19, R20) — BLOQUEADA por una contradicción del spec

Hecho en código (commit `wip`, T2.5 sin marcar):
- `gruposDeDistritos` (`lib/repositories/_shared/resolver-tarifas.ts`, §4.3): misma firma de salida;
  tras la consulta de hoy, una consulta a `grupo_distritos_nodo` por las zonas pedidas; sin filas
  devuelve el mapa de hoy sin cargar el catálogo; con filas carga `CatalogoGeograficoRepository` sobre
  el mismo cliente (la transacción del llamador si la hay) y, para cada par sin grupo en la tabla
  vieja, `grupoDelLugar` sobre sus miembros de esa zona. Pares sin distrito: sin consulta y sin grupo
  (R20).
- `ClienteCobros`/`ClientePagos` (= `TarifaTxClient`, `PagoTarifaTxClient`) ganan
  `grupoDistritosNodo`, `zonaDistrito`, `zonaNodo`, `organizacion`, `tipoNivelGeografico`,
  `nodoGeografico`, `distritoZonaEspecial`; `OrdenRepository` gana `grupoDistritosNodo` en su `Pick`.
- Doble: `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts` gana
  `grupoDistritosNodo: { findMany → [] }` (cambio de entrada; sin aserciones tocadas).
- Verde: los 65 archivos unitarios que tocan el resolver → `Test Files 65 passed (65) · Tests 1497
  passed (1497)`; `pnpm run typecheck` exit 0; guardias `catalogo-geografico-sin-instancia-de-modulo`,
  `tarifas-resolver-inyectado`, `geografia-dominio-puro` verdes.

**El bloqueo.** Integración del resolver y de cierres (12 archivos, `logistic_slt89`): `Tests 2 failed |
140 passed (142)`. Los dos rojos son `tests/integration/db/tarifas-flexibles-resolver.test.ts` ›
«numero fijo de consultas por lote (R39)», cobro y pago: `expected 4 to be 3`. Es la consulta que
design §4.3 («+1 siempre») y §9 («+1 por lote en el resolver») piden a propósito; sigue siendo un
número fijo por lote (1 y 50 dan lo mismo: 4). Pero R38 y el *Hecho* de T2.5 exigen que las suites
existentes del resolver pasen **sin cambiar aserciones**, y la excepción de R38 solo cubre el «antes».
Sin `relationJoins` no hay forma de leer las dos tablas de miembros en una consulta Prisma. No he
tocado la aserción. Decisión del humano: (a) autorizar `3 → 4` en esos dos casos (cambio de aserción
respaldado por design §4.3/§9), o (b) otra forma de leer los miembros nuevos sin consulta extra.

### Arreglo de T1.4 hallado al correr las guardias

`tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts:228` leía `pg_enum`/`pg_type` sin acotar el
esquema: lo cazó la guardia `catalogo-postgres-acota-esquema` (ficha 421). Gana `JOIN pg_namespace …
WHERE n.nspname = 'public'`, como `454/orden-evento-migration.test.ts`. Guardia + ida y vuelta →
`Test Files 2 passed (2) · Tests 11 passed (11)`.

### Arreglos hallados por las guardias (sin tocar ninguna guardia)

| Guardia | Qué cazó | Arreglo | Task |
|---|---|---|---|
| `geografia-lecturas-sin-nodo-fk` (SLT-44 R12) | `CatalogoGeograficoRepository` nombraba `nodoGeograficoId` al leer `zona_nodo` | la lectura pasa a `lib/repositories/_shared/zona-nodo.ts` (`leerAsignacionesANodos`). La guardia protege las tablas viejas (lugar desde `distrito_id`, sin depender del backfill); `zona_nodo` solo tiene `nodo_geografico_id` y R9 de SLT-89 manda leerla de ahí. El cargador sigue sin nombrar la columna | T2.2 |
| `superficie-de-uso` (R-A) | `listarArbolDeZonas` sin llamador | `@sin-superficie` con su salida: la llama el selector de T7.1/T7.2 (bloqueado por la maqueta, T0.2) y se borra en ese commit | T2.4 |
| `zona-especial-punto-unico` (SL-38 R22) | `ITarifaVigenteRepository`/`ITarifaZonaMensajeroRepository` nombraban `distritoZonaEspecial` | los dos tipos de cliente usan `ClienteDeMarcas` de `_shared/zona-especial.ts` (como `CatalogoGeograficoRepository`) | T2.5 |

Las tres guardias + `catalogo-geografico-sin-instancia-de-modulo` + `zona-nodo-herencia` +
`geo-lecturas-catalogo` → `Test Files 6 passed (6) · Tests 67 passed (67)`.

### T2.5 — cerrada tras la decisión humana del 2026-11-10 («Aceptar 4»)

Decisión en `requirements.md > Decisiones cerradas` (commit `2caf5ee9`). Único cambio de aserción:
`tests/integration/db/tarifas-flexibles-resolver.test.ts`, los dos casos «numero fijo de consultas por
lote (R39)» (cobro y pago): `3 → 4` en `uno` y `cincuenta`, con un comentario que cita la decisión, y el
«(3)» de sus dos títulos pasa a «(4)» para que el nombre no contradiga lo que afirma. Nada más del
archivo.

Verificación en `logistic_slt89`, `--maxWorkers=1`:
- Resolver y cierres (12 archivos de integración, `tarifas-flexibles-resolver` incluido) →
  `Test Files 12 passed (12) · Tests 142 passed (142)`.
- Unitarios del resolver (65 archivos) → `Test Files 65 passed (65) · Tests 1497 passed (1497)`.
- Contrato v1 (modo comparar) → `Test Files 1 passed (1) · Tests 22 passed (22)`.
- Guardias, lote 02 (79 archivos) → `Test Files 79 passed (79) · Tests 1335 passed (1335)`.
- Guardias, lote 03 (80 archivos) → `Test Files 80 passed (80) · Tests 1115 passed | 1 skipped (1116)`.
  Con los lotes 00 (84/84) y 01 (solo `dependencias-declaradas-presentes`, rojo aceptado) de la pasada
  anterior, las 320 guardias quedan verdes salvo esa.

## Tanda 2 (2026-11-10): T3, T4, T5, T6 (solo servidor)

Sha de partida: `5246ef5a`. Sin sub-agentes (instrucción del leader). T7 (pantallas) y T8 (E2E) fuera: la
maqueta (T0.2) no está aprobada. Base: `logistic_slt89`, `--maxWorkers=1`, heap de 8 GB.

Commits: `aeb8ecbf` (T3.1–T3.3 + T3.7), `1b307a7a` (T3.4), `859114cf` (T3.5), `f7889926` (T3.6),
`e1a37752` (T4.1 + T4.2), `aeeb4778` (T5.1, T5.2, T5.2b, T5.5 de grupos, T5.6), `1a14cd9e` (T5.3 + T5.5
de pantalla), `7e2dd736` (T5.4), `2cfc2002` (T6.1 + T6.2), y el de docs (T6.3, tasks y bitácora).

### T3 — guardado de zona (R1–R5, R10, R11, R16, R21, R30, R36)

- `lib/types/zona.ts`: `nodoIds`; «al menos un lugar» (`superRefine`, error en `distritoIds`, R5);
  `antes` obligatorio solo en `actualizarZonaSchema` (`antesDeZonaSchema`, `.strict()`);
  `ActualizarZonaResult` + `conflict/cambio_concurrente`; `ZonaDTO.nodosCount`.
- `ZonaRepository.update` (design §5.1): `FOR UPDATE` de la zona; distritos y nodos previos comparados con
  `antes` (`mismoConjunto`) → `cambio_concurrente`; conflictos de distritos y de nodos; existencia en el
  catálogo (`nodo_invalido`: `no_existe` / `es_distrito`; el catálogo solo se carga si la zona tiene o pide
  nodos); foto de miembros en riesgo; `zona_nodo` por diferencia; normalización de miembros (a, b, c) con
  un lote propio de `grupo_distritos_cambiado`; plan con distritos y nodos; quinto lote
  `zona_nodo_cambiado` («nombre (padre)»); `esViolacionNodoUnico`. `create`: conflictos, existencia y alta
  en `zona_nodo`, sin historial de nodos.
- `_shared/zona-nodo.ts`: lecturas y escrituras de `zona_nodo` y `grupo_distritos_nodo` (la guardia
  `geografia-lecturas-sin-nodo-fk` barre `ZonaRepository` entero: ahí no se nombra la columna del nodo).
- `ZonaService`: `safeParse` del `antes` tras el rol; `nodo_invalido` → `nodoIds`; conflictos de nodos →
  `nodoIds` (mismo mensaje de SLT-75); `cambio_concurrente` → `conflict`.
- Guardia de historial: `zona_nodo_cambiado` sale de `ESCRITOR_PENDIENTE_EN_CURSO` (queda vacía) y entra al
  censo (`ZonaRepository.update`, mutación `reemplazarNodosDeZona(tx,`). Es el uso previsto de la lista
  (T1.3); ninguna regla de la guardia cambió.

Decisiones a revisar (reviewer):
1. `nodoIds` de zona es `.optional()` (design §6 dice `.default([])`) y `ZonaDTO.nodosCount` es opcional en
   el tipo: así inputs y DTO que ya construyen pantallas, fábricas y dobles siguen valiendo sin tocarlos
   (R38). El service solo reenvía `nodoIds` si hay alguno; el repositorio pone `nodosCount` siempre.
2. La normalización (paso 7c) deja historial solo por las filas de `grupo_distritos_nodo` que saca. Un
   distrito de la tabla vieja que sale de la zona y no queda cubierto sale por la cascada, sin fila, como
   hoy (design §5.1: «con asignaciones solo a distritos, cero escrituras nuevas»). R21 en sentido estricto
   pediría también esa fila, pero cambiaría el historial de Costa Rica (R38). **Resuelto: ver «Decisión
   del 2026-11-10: historial al sacar del grupo» al final.**
3. La foto de miembros se pide solo si la zona queda con nodos; la normalización, solo si cambia alguna
   asignación. Con solo distritos, `update` suma el `FOR UPDATE` y una lectura de `zona_nodo` de la zona.

T3.7 (entrada autorizada): los 14 archivos de la lista y dos que el typecheck encontró fuera de ella
(`geo-consultas-zona.test.ts`, `geo-lecturas-sin-backfill.test.ts`). Los de integración usan
`ZonaRepositoryConAntes` (`tests/integration/db/_fixtures/antes-de-zona.ts`): subclase que, si la llamada no
trae «antes», lo lee de la base justo antes del `update` (lo sembrado). `zona-guardado-conserva-costos` y
`zona-distrito-unica` (por action o service) ganan `antes: await antesDeZona(…)`. Dobles unitarios:
`$queryRaw` y delegados de grupos vacíos en `zona-repository.test.ts`; el `antes` de lo que cada caso
siembra. Ninguna aserción sobre el resultado cambió.

### T4 — aviso de impacto (R13–R15, R36)

- `ZonaRepository.impactoDeAsignacion`: transacción con `SET TRANSACTION READ ONLY` que **se revierte
  siempre** (el resultado sale en una excepción propia), así el modo de solo lectura tampoco sobrevive si el
  cliente es una transacción ya abierta. Propuestas con `conAsignacionesDeZona`; afectados = nodos de la
  zona antes ∪ pedidos; el plan es **`planificarReconciliacion` con las propuestas** (parámetro opcional
  `foto`): las mismas consultas que el guardado (R15). `enCierre` y `conGestionFinal` sobre
  `whereCambiariaDeZona` (la mitad común de `whereBaseElegible`). «Cambian de tarifa»: sin activar =
  «cambian de zona»; activada, pendientes de los lugares con zona o grupo (`grupoDelLugar`) distintos antes
  y después de la normalización simulada.
- Desvío del design: §5.3 pide extraer `contarPlan`. Extraerla sacaba las consultas de
  `planificarReconciliacion` y rompía `zona-reconciliacion-no-retarifa.guardia` (mide ese cuerpo). En vez de
  tocar la guardia, la función común es `planificarReconciliacion`, con la foto opcional.
- `ZonaService.impactoAsignacion` (solo `maestro`), action `impactoAsignacionZona` (zod, tope 5 000 ids,
  `@sin-superficie` hasta T7.2). Los dobles exhaustivos de `IZonaRepository`/`IZonaService` (8 archivos,
  uno en `379-maestro-sin-bloqueo.guardia`, solo su doble) ganan el método.

### T5 — grupos sobre el nodo (R17–R21, R23, R31, R37, R43–R46)

- Esquemas (`tarifa-flexible.ts`): `nodoIds` (default `[]`); `nombreAnterior` obligatorio al renombrar;
  `antes` obligatorio al cambiar miembros y al borrar (`nombre`, miembros, `valores`).
  `GrupoDistritosDTO.nodos` opcional (solo viaja si hay alguno: con solo distritos, el DTO de hoy).
- `GrupoDistritosRepository`: reparto por tabla (distrito con `zona_distrito` en la zona → vieja; resto →
  `grupo_distritos_nodo`); `distritosDeLaZona` mira primero `zona_distrito` y solo carga el catálogo si
  queda algún id sin asignación propia; `distritosEnOtroGrupo` en las dos tablas; nombres de nodos en los
  errores; historial con el recuento de las dos tablas; `FOR UPDATE` del grupo y comparación del «antes» en
  renombrar, fijar y borrar.
- Desvío de nombre: design §4.4 renombra `distritosDeLaZona` → `nodosCubiertos`. Se conservó el nombre (la
  semántica nueva está en la interfaz) para no tocar los dobles más allá del «antes».
- Service: `fijarDistritos(id, miembroIds, antes, actor)` con distritos y demás nodos juntos (la action los
  concatena); `renombrarGrupo(id, nombre, nombreAnterior, actor)`; `borrarGrupo(id, antes, actor)`.
- T5.3: `distritosDeZona` desde el catálogo solo si la zona tiene `zona_nodo`; `nodosDeZona` → `null` si la
  zona solo tiene distritos sin nada debajo (sin cargar el catálogo); `cargarZona` incluye `nodos` solo si
  no es `null`. Sin esto, `tarifas-referencia.test.ts` caía (17 casos, `EmpresaNoResuelta` al cargar el
  catálogo sin empresa en contexto). La respuesta de Costa Rica queda idéntica.
- T5.6 (entrada y aserciones de llamada autorizadas): `grupo-distritos-service.test.ts` (además, su doble de
  Prisma gana `$queryRaw`, `grupoDistritosNodo`, `zonaDistrito` en la tx y `_count.nodos: 0`),
  `tarifas-action.test.ts` (llamadas y las aserciones de las líneas ~273-277), `tarifa-activacion.test.ts`,
  `tarifas-flexibles-escritura.test.ts` (con `_fixtures/antes-de-grupo.ts`). `TarifasGrupos.test.tsx` no se
  tocó (T7.3): mockea las actions y sigue verde.

### T6 — aislamiento y equivalencia (R35, R38, R39)

- T6.1: caso nuevo en `zona-nodo-dos-empresas.test.ts`: el mismo cantón en zonas de A y B (mismo país) se
  guarda en las dos; cobertura, aviso de impacto y grupo de cada una sin ver a la otra. El precio por
  empresa queda para el E2E (T8.1); la zona y el grupo que lo deciden se prueban aquí.
- T6.2: `slt89-equivalencia-cr.test.ts` contra `scripts/geo-equivalencia/` (zona por distrito, cobertura,
  árbol, plan del guardado), grupo por par contra la tabla vieja, y un guardado con solo distritos que no
  escribe en las tablas nuevas ni deja `zona_nodo_cambiado`.

### T6.3 — guion de R39 para la persona que corre los scripts (ningún agente lo ejecuta)

Sobre una **copia de producción** (nunca producción ni la base compartida), con SLT-89 aplicada:

1. `pnpm run db:migrate` en la copia (aplica `20261110130000_slt89_zona_nodo` y
   `20261110130100_slt89_historial_zona_nodo`); comprobar que `zona_nodo` y `grupo_distritos_nodo` están vacías.
2. `pnpm geo:equivalencia-dinero` → sin diferencias.
3. `pnpm geo:equivalencia-consultas` → sin diferencias. Esperado: +1 consulta en la carga del catálogo
   (`zona_nodo`) y +1 por lote en el resolver (`grupo_distritos_nodo`), las dos sobre tablas vacías.
4. `pnpm geo:explain-consultas` → sin regresión (regla de SLT-65: más de 20 % o un Seq Scan nuevo sobre `orden`).
5. Pegar la salida de los tres en el PR antes del merge.

### Verificación (logistic_slt89, `--maxWorkers=1`)

- `pnpm run typecheck` con heap de 8 GB: exit 0 (sin el heap, `tsc` muere por memoria a 4 GB).
- eslint en lo tocado: 0 errores; 1 aviso previo (`normalizeName` sin usar en `ZonaRepository`, ya en `5246ef5a`).
- Unitarios y actions (16 archivos) → `Test Files 16 passed (16) · Tests 442 passed (442)`.
- Integración (25 archivos: los nuevos de SLT-89 y las suites de zonas, grupos, resolver, referencia y
  equivalencia de SLT-44/65) → `Test Files 25 passed (25) · Tests 246 passed (246)`.
- Grupos y tarifas existentes (10 archivos) → `Test Files 10 passed (10) · Tests 114 passed (114)`.
- Contrato v1 (modo comparar) → `Test Files 1 passed (1) · Tests 22 passed (22)`.
- Guardias (337 archivos con «guard», en 4 lotes):
  - lote 00 → `Test Files 88 passed (88) · Tests 1092 passed (1092)`;
  - lote 01 → `Test Files 1 failed | 81 passed (82)`: solo `dependencias-declaradas-presentes` (4 casos), el
    rojo ya aceptado en la tanda 1 y listado en `tests/baseline-rojos.json`;
  - lote 02 → `Test Files 83 passed (83) · Tests 1375 passed (1375)`;
  - lote 03 → primero `sql-a-mano-por-empresa` en rojo: el `FOR UPDATE` de `grupo_distritos` (T5.2b) no
    filtraba por empresa. Arreglado en el código (filtra por `current_setting('app.organizacion_id', true)`
    además de la RLS), sin tocar la lista de excepciones; la guardia y las suites de grupos →
    `Test Files 7 passed (7) · Tests 189 passed (189)`. El resto del lote, verde (83/84 antes del arreglo).
- Tras el arreglo: `pnpm run typecheck` exit 0; eslint de `GrupoDistritosRepository.ts` limpio.
- `costo-y-zona-api-415.test.ts`: rojo por `orden` vacía en la base de la feature (sin `db:seed`); está en
  `tests/baseline-rojos.json`. No es de SLT-89.

### Rojos conocidos: el formulario de zona hasta T7.2

Con `antes` obligatorio en `actualizarZonaSchema`, `CrearZonaForm` (valida en cliente con ese esquema y no
manda `antes`) no puede guardar una zona existente hasta T7.2. Tests de componente rojos por eso (no se
tocaron: son de T7.2, que espera la maqueta): `CrearZonaFormReconciliacion` (9), `ZonaCentralConfirmacion`
(14), `ZonaDistritoEnOtraZona` (3), `ZonaFormSinCostos` (1), `ZonaNombreNoImprimible` (1): 28 casos en 5
archivos. Lo mismo en producción con renombrar, cambiar miembros y borrar grupos desde `TarifasGrupos` (las
actions piden el «antes» que la pantalla aún no manda); sus tests mockean las actions y siguen verdes. La
rama no debe mergearse sin T7 (el spec ya lo dice: una tarjeta, un PR).

### Mapa R → test (T3–T6)

| R | Test |
|---|---|
| R1, R3, R4 | `tests/integration/db/zona-nodo-asignacion.test.ts` |
| R2 | `zona-nodo-asignacion.test.ts` (conflicto con nombre y carrera por el índice); `tests/unit/services/zona-service.test.ts` (mensajes en `nodoIds`) |
| R5 | `tests/unit/types/zona-schemas.test.ts`; `zona-nodo-asignacion.test.ts` (por la action, sin escribir) |
| R10, R11 | `tests/integration/db/zona-nodo-reconciliacion.test.ts` |
| R13, R14, R15 | `tests/integration/db/zona-nodo-impacto.test.ts`; borde en `tests/integration/actions/zonas-action.test.ts` |
| R16 | `zona-nodo-asignacion.test.ts`; `tests/unit/types/zona-schema.test.ts`; `zona-service.test.ts`; `zonas-action.test.ts` |
| R17, R18, R19, R20, R21, R31 | `tests/integration/db/grupo-nodo.test.ts` (R21 con solo distritos: caso «decisión del 2026-11-10»); `tests/unit/services/grupo-distritos-service.test.ts` |
| R23 (servidor) | `grupo-nodo.test.ts` (distritos heredados y sub-árbol); `tests/unit/services/tarifas-pantalla-service.test.ts` |
| R30 | `tests/integration/db/zona-nodo-rastro.test.ts` |
| R35 | `tests/integration/db/zona-nodo-dos-empresas.test.ts` (caso T6.1) |
| R36 | `zona-service.test.ts` (guardar e impacto con repositorio que falla) |
| R37 | `grupo-distritos-service.test.ts`, `tarifas-pantalla-service.test.ts` |
| R38 | `tests/integration/db/slt89-equivalencia-cr.test.ts` y las suites existentes de arriba |
| R39 | Guion de arriba (persona) |
| R43, R44, R45, R46 | `tests/integration/db/grupo-cambio-concurrente.test.ts`; `grupo-distritos-service.test.ts`; `tests/integration/actions/tarifas-action.test.ts` |

### Decisión del 2026-11-10: historial al sacar del grupo (R21 frente a R38)

Decisión humana en `requirements.md > Decisiones cerradas` (commit `8b59c5b7`): un distrito que sale de
una zona, queda sin cobertura y por eso sale de su grupo de tarifas deja la fila de «salió del grupo»,
también con distritos de la tabla vieja (empresas que solo usan distritos).

- `ZonaRepository.update`: la foto de los miembros en riesgo (las filas de `grupo_distritos_distrito` de
  los distritos que salen) se pide siempre que salgan distritos, con el número de miembros de cada grupo
  ANTES de la cascada. En `normalizarMiembrosDeGrupo`, los de la foto que la zona sigue cubriendo vuelven
  a su grupo (como antes); los demás cuentan como salidos y, junto con los de `grupo_distritos_nodo` que
  pierden la cobertura, dejan una fila `grupo_distritos_cambiado` por grupo («había N, quedan M», el lote
  propio de la normalización). Sin nodos en la zona no se carga el catálogo: el distrito no puede seguir
  cubierto. Coste en Costa Rica: al quitar distritos, una lectura de sus filas de grupo y, si había alguna,
  una del conteo de esos grupos.
- Test nuevo: `tests/integration/db/grupo-nodo.test.ts` › «R21 (decisión del 2026-11-10): con solo
  distritos, el que sale de la zona sale de su grupo y deja su fila de historial» (2 distritos → 1).
- Tests existentes ajustados: **ninguno**. Ninguna suite existente cuenta ni lista `grupo_distritos_cambiado`
  tras un guardado de zona (las de zonas y grupos pasan sin tocarse).
- Verde (`logistic_slt89`, `--maxWorkers=1`, heap de 8 GB): suites de zona, grupos, equivalencia y tarifas
  (`zona-*`, `grupo-*`, `slt89-equivalencia-cr`, `geo-consultas-zona`, `geo-lecturas-sin-backfill`,
  `tarifa-activacion`, `tarifas-flexibles-escritura`, `tarifas-referencia`) → todas verdes;
  `zona-repository` + `zona-service` 112/112; tarifas, actions, contrato v1 (modo comparar) y guardias de
  historial, `zona-reconciliacion-no-retarifa`, `sql-a-mano-por-empresa` y `geografia-lecturas-sin-nodo-fk`
  → `Test Files 23 passed (23) · Tests 562 passed (562)`; `pnpm run typecheck` exit 0; eslint sin errores.
- Rojos del barrido con filtro `zona-` que NO son de este cambio: `costo-y-zona-api-415`,
  `deshacer-asignacion-zona-satelite`, `historial-accion-atomicidad`, `tarifa-zona-borrado-fk-real` (en
  `tests/baseline-rojos.json`) y tres que **no** están en el baseline:
  `historial-accion-orden-zona-reconciliada-migration`, `historial-accion-zona-pago-mensajero-migration`,
  `historial-accion-zona-sinpe-migration`. Comparan el catálogo de `historial_accion_tipo` con su lista
  de «valores posteriores», que no tiene `zona_nodo_cambiado` (entró en T1.2, tanda 1). No los toqué:
  añadirles el valor es un cambio de aserción no autorizado; queda para el leader.

### Censos del enum de historial (autorizado por el leader el 2026-11-10)

Son censos del enum `historial_accion_tipo` (como el 82 → 83 de la tanda 1), no flujos de R38. Cada uno
gana `zona_nodo_cambiado` en su lista de «posteriores», con el comentario «censo: tipo nuevo de SLT-89
T1.2», y nada más:
- los tres autorizados por nombre: `historial-accion-orden-zona-reconciliada-migration`,
  `historial-accion-zona-pago-mensajero-migration`, `historial-accion-zona-sinpe-migration`;
- cinco más que el grep de `grupo_distritos_cambiado` encontró y que fallaban exactamente por lo mismo:
  `correccion-resultado-gestion-migration`, `historial-accion-cobro-tienda-migration`,
  `historial-accion-conciliacion-bodega-migration`, `historial-accion-pago-mensajero-ajustado-migration`
  (lista de posteriores) y `caja-459-migration` (el último tipo del enum pasa a ser `zona_nodo_cambiado`,
  `tarifas_activadas` el penúltimo, y los cortes se miden sin los dos).
- Salida: los 8 → `Test Files 8 passed (8) · Tests 102 passed (102)`. Los demás tests que nombran tipos
  recientes del enum (`migracion-d16-…`, `planes-cambiar-tipo-cobro`, `tarifa-activacion-migration`,
  `historial-accion-zona-distrito-migration`, `historial-accion-zona-central-migration`,
  `catalogo-y-choke-point`, guardia `historial-accion-escrituras-cubiertas`) → `Test Files 7 passed (7) ·
  Tests 191 passed (191)`, sin tocarlos.

## Tanda 3 (2026-11-10): T7, T8.1, T9.1 (pantallas, E2E y docs)

### T0.2 — maqueta (R48)

Lienzo: https://claude.ai/artifact/9QG7NyNkFdDcxu5zvWu1xD (copia de solo lectura en el scratchpad del
leader, `maqueta89/project/`: `Main.dc.html` editar zona con árbol de N niveles, herencia y excepciones;
`Impacto.dc.html` modal de guardado con entran/salen y órdenes; `Grupos.dc.html` grupos de Tarifas con
cualquier lugar y su modal de confirmación). Registro del leader en `progress/features/SLT-89.md`.

Maqueta aprobada por el humano el 2026-11-10.

Commits de la tanda: `cf715317` (T0.2 en la bitácora, antes del primer commit de T7), `3534e676` (T7.1),
`f53bd750` (T7.2), `ec27fc72` (T7.3), `0b1a7c1d` (T8.1), `bf96765e` (T9.1) y el de esta bitácora. Sin
sub-agentes. `3534e676` solo no compila `CrearZonaForm` (cambia la entrada del selector); compila con
`f53bd750`.

### T7.1 — selector de N niveles (R24–R27)

- `GeografiaSelector` recibe `ArbolDeZonasDTO` y emite `{ distritoIds, nodoIds }` (profundidad 3 al
  primero). Lógica pura en `zonas/_components/seleccion-de-zona.ts` (índice, reparto, `alternarNodo`
  con R25, estado de cada nodo con la selección EN CURSO). Búsqueda con `filtrarArbolDeNodos` (ya
  existía de SLT-46 en `_shared/filtrar-arbol-geografico.ts`: no hizo falta una función nueva).
  Etiquetas de nivel desde `tipos`; insignia de retirado a N niveles («Inactivo por su <nivel>»).
  Sin `permitirEspecial` (design §8.1, R8).
- Textos de la maqueta: «hereda de <zona> por <nodo>», «Excepción · va a <zona>», «En <zona>».

### T7.2 — modal único de guardado de zona (R12, R13, R16)

- `CrearZonaForm`: maqueta en dos columnas (datos / lugares), «Guardar zona…» → valida con el esquema
  → modal con nombre, marca, «Entran»/«Salen» (nivel y padre; «Incluye sus N distritos» sin contar
  excepciones; excepciones que siguen en otra zona), bloque de la marca central (texto e impacto de la
  376 sin cambios) y las cifras de `impactoAsignacionZona`. «Sí, guardar» bloqueado mientras se
  cuentan; si el aviso falla, sigue bloqueado y se ofrece «Reintentar» (R13; la marca central conserva
  su desbloqueo de la 376). `antes` siempre al actualizar; `nodoIds` solo si hay alguno.
  `cambio_concurrente` → cierra, aviso `aria-live` y `ZonasModule` reabre la zona leída de nuevo.
- `ZonasModule`/`page.tsx` con `listarArbolDeZonas`; preselección = `asignadaA` de la zona a todas las
  profundidades. Se borran los `@sin-superficie` de `listarArbolDeZonas` e `impactoAsignacionZona`.
  `listarArbolGeografico` se queda sin llamador: gana su `@sin-superficie` (deuda) en vez de borrarla,
  porque la cubren dos suites de actions y retirarla quitaría aserciones.

### T7.3 — grupos en Tarifas (R22, R23, R47)

- `TarifasGrupos`: un solo `Modal` con dos fases (edición → antes → después). Validación con
  `crearGrupoSchema`/`renombrarGrupoSchema`/`fijarDistritosSchema`; confirmación con «Sí, guardar» o
  «Sí, borrar» (destructivo); «Volver» regresa a la edición (en borrar, cierra). Miembros en árbol
  (`CargarZonaResult.nodos`) o, si la zona solo cubre sus distritos, la lista de siempre; un lugar de
  otro grupo sale bloqueado con su nombre. `TarifasModule` pasa `nodos`. Textos en `tarifas-textos.ts`
  (`borrarGrupoTitulo` pasa a «¿Borrar el grupo X?», de la maqueta).

### T8.1 — E2E (R41, R35)

- `e2e/zonas-nodo-canton.spec.ts` en el proyecto «aislamiento» (A asigna un cantón entero por la
  pantalla, ve las cifras y confirma; la orden de su tienda en un distrito del cantón sale con su zona
  y la cotización da el flete de su tarifa; B no ve la zona ni tiene cobertura).
- Adaptados en cómo llegan al botón (modal nuevo): `zonas-crear-sin-costos`,
  `zona-especial-dos-empresas`, `tarifas-activacion`.
- **No se corrió en local.** No hay `psql` en la máquina para crear `logistic_slt89_e2e`, y el E2E pide
  `next build` (o `next dev`) más los proyectos de dependencia (`plataforma-vacia`); con `tsc` ya
  necesitando 8 GB, el build pone en riesgo la máquina. Lo corre CI en el PR a producción (con
  `dos-empresas-humo`). Verificado: `typecheck` exit 0, eslint limpio y las 14 guardias que leen `e2e/`
  (`e2e-sin-saltos` incluida) → `Test Files 14 passed (14) · Tests 220 passed (220)`.

### T9.1 — docs

`docs/architecture.md`: tabla hermana `zona_nodo`, herencia, guardado con «antes», trigger de `orden`
y la regla de miembros de grupo. El tipo de historial y su censo ya estaban (T1.3).

### Cambios de aserción de esta tanda (para el reviewer, R38)

Autorizados («antes» y «cómo se llega al botón», tasks T5.6/T7.2/T7.3, design §8.2):
- `TarifasGrupos.test.tsx`: `toHaveBeenCalledWith` de renombrar (gana `nombreAnterior`), cambiar
  miembros (gana `antes`) y borrar (gana `antes`).
- Los 9 archivos de componente de zonas y `ZonasPage.test.tsx`: solo entrada (`arbolDeZonas(...)`,
  mock de `impactoAsignacionZona` / `listarArbolDeZonas`) y botones de la maqueta («Guardar zona…»,
  «Sí, guardar», «Volver»). Ninguna aserción sobre toasts, payloads de crear ni textos de la 376.
- `zona-guardado-conserva-inactivos.test.ts`: solo la forma del árbol y del callback del selector.

**Fuera de la lista del leader, mandados por el spec (a ratificar por el humano):**
1. `geografia-selector-zona-ocupada.test.tsx`: los casos de la cascada de SLT-75 R16/R17 («marcar el
   cantón marca sus distritos seleccionables», tri-estado del grupo) se reescriben a la semántica de
   design §8.1/§11.3 (marcar el cantón asigna el cantón; el bloqueado queda como excepción). El texto
   visible «(zona: X)» pasa a «En X» (maqueta); el `aria-label` conserva «(zona: X)».
2. `geografia-selector-inactivos.test.tsx`: la lista de `aria-label` pasa de «Seleccionar todos los
   distritos de X» a «Seleccionar <nivel> X» (ya no hay cascada), y el callback a `{ distritoIds, nodoIds }`.
3. `ZonaDistritoEspecial.test.tsx`: los dos casos de `permitirEspecial` (capacidad que design §8.1 y R8
   retiran) se sustituyen por uno que afirma que el selector no ofrece la marca.

### Maqueta frente al spec (design §8.4) — para el humano

- **Grupos, «[9] órdenes pendientes cambian de tarifa» en el modal de borrar:** el spec no da ese
  cálculo para escrituras de grupos (R22 pide el aviso de valores de SLT-54 R43; no hay action de
  impacto de grupos). No se pinta. Si se quiere, es una action nueva y un requisito nuevo.
- **Grupos, insignia «Precio de pacto especial» en un grupo llamado «Zona especial»:** contradice SLT-54
  R44 (un grupo llamado así se pinta como cualquier otro; hay test). No se pinta.
- **Zona, «[24] cambian a Zona Oeste»:** se rotula «cambian de zona» (R13): `cambianDeZona` incluye las
  que salen hacia otra zona, así que «a Zona Oeste» sería falso en ese caso.
- **R22 «cada miembro con su nivel y el nombre de su padre»:** cuando la zona solo cubre sus distritos
  asignados, `cargarZona` no manda el árbol (`nodos` ausente, decisión de T5.3 por R38) y la pantalla no
  conoce el padre de esos distritos: se pinta su nivel («Alfa · barrio») sin padre. Con árbol, nivel y
  padre. Cerrarlo pide que `cargarZona` mande siempre el padre de cada distrito.

### Verificación (logistic_slt89, `--maxWorkers=1`, heap de 8 GB)

- `pnpm run typecheck`: exit 0. eslint en lo tocado (zonas, tarifas, tests, e2e, `playwright.config.ts`):
  sin errores ni avisos.
- Componentes y unitarios de T7 (20 archivos: los 9 de zonas, `ZonaGuardadoConfirmacion`,
  `TarifasGrupos`, `TarifasModulo`, `TarifasDisposicion`, `ZonasPage`, los 3 del selector,
  `filtrar-arbol-geografico`, `geografia-action`, `geografia.composition-root`) →
  `Test Files 20 passed (20) · Tests 206 passed (206)`. Incluye los 28 casos rojos desde T3.7.
- Integración: contrato v1 (modo comparar), `zona-guardado-conserva-inactivos`, `zonas-action`,
  `tarifas-action` → `Test Files 4 passed (4) · Tests 106 passed (106)`.
- Guardias (320 archivos con «guard», en 4 lotes): 00 → `84 passed (84) · 1050 passed`; 01 →
  `1 failed | 76 passed (77)`: solo `dependencias-declaradas-presentes` (4 casos), en
  `tests/baseline-rojos.json`; 02 → `79 passed (79) · 1336 passed`; 03 → `80 passed (80) · 1115 passed |
  1 skipped`.

## Mapa R → test (R1–R48)

| R | Test |
|---|---|
| R1, R3, R4 | `tests/integration/db/zona-nodo-asignacion.test.ts` |
| R2 | `zona-nodo-asignacion.test.ts` (conflicto y carrera); `tests/unit/services/zona-service.test.ts` (mensajes) |
| R5 | `tests/unit/types/zona-schemas.test.ts`; `zona-nodo-asignacion.test.ts` |
| R6, R7, R9 | `tests/integration/db/zona-nodo-herencia.test.ts` |
| R8 | `zona-nodo-herencia.test.ts` (marca heredada a profundidad 4); guardia `tarifas-sin-escritura-vieja`; `tests/components/ZonaDistritoEspecial.test.tsx` (el selector no ofrece la marca) |
| R10, R11 | `tests/integration/db/zona-nodo-reconciliacion.test.ts` |
| R12 | `tests/components/ZonaGuardadoConfirmacion.test.tsx` (inválido sin modal; entran/salen con nivel y padre; «Volver» no escribe); `ZonaCentralConfirmacion.test.tsx` (bloque de la 376) |
| R13 | `ZonaGuardadoConfirmacion.test.tsx` (cifras; bloqueado hasta tenerlas; un fallo no desbloquea); `tests/integration/db/zona-nodo-impacto.test.ts` |
| R14, R15 | `zona-nodo-impacto.test.ts` |
| R16 | `ZonaGuardadoConfirmacion.test.tsx` («antes» enviado; crear sin él; `cambio_concurrente` avisa y recarga); `zona-nodo-asignacion.test.ts`; `tests/unit/types/zona-schema.test.ts`; `zona-service.test.ts`; `tests/integration/actions/zonas-action.test.ts` |
| R17, R18, R19, R20, R21 | `tests/integration/db/grupo-nodo.test.ts`; `tests/unit/services/grupo-distritos-service.test.ts` |
| R22 | `tests/components/TarifasGrupos.test.tsx` (validación previa y antes → después de las cuatro escrituras; «Volver» no llama; «antes» en la llamada) |
| R23 | `TarifasGrupos.test.tsx` (árbol a todas las profundidades con su nivel; bloqueado en otro grupo; marca de solo lectura); `grupo-nodo.test.ts`; `tests/unit/services/tarifas-pantalla-service.test.ts` |
| R24, R25, R26, R27 | `tests/unit/components/geografia-selector-n-niveles.test.tsx`; `geografia-selector-zona-ocupada.test.tsx`; `geografia-selector-inactivos.test.tsx` |
| R28, R29 | `tests/integration/db/orden-nodo-mas-profundo.test.ts` |
| R30 | `tests/integration/db/zona-nodo-rastro.test.ts` |
| R31 | `zona-nodo-rastro.test.ts`; `grupo-nodo.test.ts` |
| R32 | `tests/unit/db/slt89-migraciones-aditivas.test.ts` |
| R33 | `tests/integration/db/migracion-slt89-ida-y-vuelta.test.ts` |
| R34 | `tests/integration/db/zona-nodo-dos-empresas.test.ts` (RLS, misma empresa, SL021) |
| R35 | `zona-nodo-dos-empresas.test.ts` (caso T6.1); `e2e/zonas-nodo-canton.spec.ts` (caso 3) |
| R36 | `zona-service.test.ts`; `tests/unit/services/geografia-service.test.ts` |
| R37 | `grupo-distritos-service.test.ts`; `tarifas-pantalla-service.test.ts` |
| R38 | `tests/integration/db/slt89-equivalencia-cr.test.ts` + suites existentes (excepciones anotadas arriba y en las tandas 1–2) |
| R39 | Guion de T6.3 (persona, sobre una copia) |
| R40 | `tests/integration/api/contrato-v1.route.test.ts` (modo comparar) |
| R41 | `e2e/zonas-nodo-canton.spec.ts`; `e2e/dos-empresas-humo.spec.ts` (CI) |
| R42 | Revisión del diff (T9.2) |
| R43, R44, R45, R46 | `tests/integration/db/grupo-cambio-concurrente.test.ts`; `grupo-distritos-service.test.ts`; `tests/integration/actions/tarifas-action.test.ts`; `TarifasGrupos.test.tsx` («antes» enviado) |
| R47 | `TarifasGrupos.test.tsx` (cierra, aviso `aria-live` y recarga al renombrar, cambiar lugares y borrar) |
| R48 | Revisión: «Maqueta aprobada por el humano el 2026-11-10» en esta bitácora (`cf715317`), anterior al primer commit de T7 (`3534e676`) |

## Decisión del 2026-11-10: el padre de cada miembro (R22)

Decisión humana en `requirements.md > Decisiones cerradas` (commit `2d942b5d`): el padre se muestra
siempre, también en una zona de solo distritos.

- Servidor: `DistritoDeZona` gana `padre` (opcional en el tipo, para que los dobles de hoy sigan
  valiendo). `TarifasPantallaRepository.distritosDeZona` lo pone en los tres caminos: catálogo (zona con
  nodos), y `zona_distrito` con y sin marca (el cantón por la FK vieja `distrito.canton`, sin cargar el
  catálogo: R38). `cargarZona` lo reenvía en `distritos` (spread de siempre). El nivel lo pinta la
  pantalla con la etiqueta de distrito del país.
- Pantalla: `TarifasGrupos` usa ese `padre` cuando no hay árbol («Gama · barrio de Cerro»).
- Tests nuevos: `tarifas-referencia.test.ts` (zona de solo distritos, con y sin marca),
  `grupo-nodo.test.ts` (camino del catálogo, cantón asignado) y 3 casos en `TarifasGrupos.test.tsx`
  (crear, cambiar lugares y borrar sin árbol). Ninguna aserción existente cambió.
- El modal de borrar grupo sigue sin conteo de órdenes (decisión 2 del mismo día).

Verificación (`logistic_slt89`, `--maxWorkers=1`, heap de 8 GB): `typecheck` exit 0; eslint limpio en lo
tocado. Integración de tarifas y grupos (19 archivos: `tarifa*`, `grupo-*`, `tarifas-action`,
`slt89-equivalencia-cr`, `zona-nodo-dos-empresas`) + contrato v1 (modo comparar) →
`Test Files 1 failed | 19 passed (20) · Tests 266 passed | 9 skipped`: el rojo es
`tarifa-zona-borrado-fk-real`, en `tests/baseline-rojos.json`. Unitarios y componentes de tarifas
(7 archivos) → `162 passed`. Guardias de tarifas, zonas, grupos, geografía, SQL, etiquetas, superficie y
catálogo (25 archivos) → `275 passed`.

Mapa: R22 → `TarifasGrupos.test.tsx` (también sin árbol), `tarifas-referencia.test.ts` y `grupo-nodo.test.ts`
(el padre que manda el servidor).

## Review vuelta 1: m1–m4 (2026-11-10)

`progress/review_SLT-89.md`; decisiones del humano D1–D3 en `requirements.md` (commit `b5daf355`). T9.2 sin
marcar: la cierra el gate de CI.

- **m1** (`d0c7cb63`): en el selector, la casilla lleva `aria-describedby` hacia el texto de estado de su
  fila: «hereda de…», «Excepción · va a…» o «En <zona>». Lo elegido y lo libre no llevan descripción.
  Caso nuevo en `geografia-selector-n-niveles.test.tsx`.
- **m2** (`e11c3728`): `GrupoDistritosRepository.crear` y `fijarDistritos` toman la fila de la zona en
  `FOR SHARE` (antes del `FOR UPDATE` del grupo: el mismo orden zona → grupo que el guardado de zona, para
  que no se esperen en cruz). Después vuelven a mirar, con el catálogo leído en la transacción, los
  miembros que van a `grupo_distritos_nodo`. Si alguno ya no está cubierto, no escriben nada
  (`{ status: "no_cubierto", ids }` / `{ noCubiertos }`), y el service responde el `validation_error` de
  hoy («X no pertenece a la zona.»). Sin miembros heredados no se carga el catálogo (R38). Test nuevo en
  `grupo-nodo.test.ts`: un repositorio que «vio» la cobertura antes de que otro guardado la quitara; crear
  y fijar dan el error, sin grupo nuevo, sin cambio de miembros y sin historial.
- **m3** (`e1269be9`): el `FOR UPDATE` de `ZonaRepository.update` filtra por
  `organizacion_id = current_setting('app.organizacion_id', true)`. Con eso la guardia
  `sql-a-mano-por-empresa` pidió quitar `ZonaRepository.ts` de `EXCEPCIONES_SQL_A_MANO` («la lista solo
  baja»): se quitó la entrada y la guardia no se tocó.
- **m4** (`1d669894`): deuda D47 en `progress/deudas.md`; el `@sin-superficie` la cita.
- Aserciones existentes cambiadas: ninguna.

Verificación (`logistic_slt89`, `--maxWorkers=1`, heap de 8 GB): `typecheck` exit 0; eslint en lo tocado
sin errores (1 aviso previo: `normalizeName` sin usar en `ZonaRepository`). Integración `zona-*`,
`grupo-*`, `tarifa*`, `slt89-equivalencia-cr`, `zonas-action`, `tarifas-action` y contrato v1 (modo
comparar), 40 archivos → `Test Files 1 failed | 39 passed (40) · Tests 504 passed | 9 skipped`; el rojo es
`tarifa-zona-borrado-fk-real`, de `tests/baseline-rojos.json`. Selector (3 archivos) → `30 passed`.
`grupo-nodo` + `grupo-distritos-service` + `zona-repository` → `111 passed`. Guardias de SQL, superficie,
zonas, grupos, geografía, historial, catálogo, tarifas y etiquetas, más `zona-service`, `TarifasGrupos` y
`ZonaGuardadoConfirmacion` (36 archivos): `581 passed`; el único rojo fue `sql-a-mano-por-empresa`, que
pedía retirar la excepción de m3. Tras retirarla, las guardias de SQL, RLS y aislamiento → `3 passed (3) ·
64 passed`. No hay guardia de `progress/deudas.md` en el repo.

Mapa: R18 suma `grupo-nodo.test.ts` (m2); R24 suma el caso de m1.
