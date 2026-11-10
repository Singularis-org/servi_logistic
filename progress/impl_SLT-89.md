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
