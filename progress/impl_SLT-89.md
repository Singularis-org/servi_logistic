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
