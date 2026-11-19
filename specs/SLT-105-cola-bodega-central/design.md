# SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» — design (C1)

> 2026-11-11. Baja a ejecutable la parte de **servidor** de la S7 del madre
> (`specs/SLT-95-detalle-cierre-rediseno/design.md > Zona por rebanada`, S7: «cambia el `WHERE` de
> las listas de bodega de la central (`CierresBodegaAdminRepository`)»). La parte de pantalla
> (`ColaCierres` con `tipo` bodega) es la ficha C2 (`requirements.md > Fuera de alcance`).

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «por conciliar», «conciliados», «cola de bodega», «recibido
  incompleto», «cierre de bodega»;
- `specs/`: «Por conciliar», «Recibido incompleto», «colaBodegaWhere», «historicoBodegaWhere»,
  «ESTADOS_COLA_SOLICITADO», «paraLaCentral», «faltaPorRecibir», «montajesPrevistos»;
- código (Grep/Read; el índice del grafo de este worktree no existe — `index_status` responde «project
  not found» —): `CierresBodegaAdminRepository`, `colaBodegaWhere`, `historicoBodegaWhere`,
  `filtrosBodegaWhere`, `ESTADOS_COLA_SOLICITADO`, `toBodegaResumenRow`, `paraLaCentral`, `saldoDe`,
  `APORTE_SATELITE_SQL`, `estadoConciliacionDe`, `hayFaltantePorRecibir`, `CierreBodegaFacturaResumen`,
  `ConciliacionBadge`, `ColumnaConciliacion`, `refrescarListas`, `contarSenalesPorCierreCon`,
  `cierre_bodega_conciliacion_coherente`.

**Resultado:**
- **Board:** ninguna ficha hace esto. SLT-106 «Bodega satélite: A consolidar con la cola única» y
  SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» son de la satélite y leen
  otro repositorio (`CierreBodegaRepository`). SLT-65 «Geografía jerárquica: consultas de órdenes,
  cierres y zonas sobre el nodo» (`in_progress`) no toca `CierresBodegaAdminRepository.ts` (candado
  confirmado por el leader, 2026-11-11).
- **Specs que fijaron lo que esta lectura hace hoy y C1 respeta:** 170 (paginación en servidor, `total`
  del conjunto, R44 «ninguna fila en las dos listas ni en ninguna»), 184 (conjunto completo de la
  descarga con el mismo criterio que la página, `criterio-unico`), 393 (`paraLaCentral` derivado una
  vez en `toBodegaResumenRow`), 431 (la marca de conciliación, el `CHECK` que ata `conciliado_at` a
  `estado = 'aprobado'`, los tres estados de presentación), SLT-73 «Dinero de la satélite al
  conciliar» (`faltaPorRecibir = saldoDe(paraLaCentral, montoRecibido)`), SLT-96 «Consolidación de ₡0
  no se puede marcar recibida» (consolidación de cero).
- **Código que se reutiliza tal cual:**
  - `filtrosBodegaWhere` (fecha de solicitud y bodega) y `ORDEN_CIERRES_BODEGA_ADMIN`;
  - `BODEGA_RESUMEN_SELECT` + `toBodegaResumenRow` (vía `aResumenRows`): la tarjeta sigue recibiendo
    `paraLaCentral`, `conciliado`, `montoRecibido` y `faltaPorRecibir` derivados en un solo sitio;
  - el patrón de SQL a mano por empresa de `lib/repositories/_shared/senales-cola-cierre.ts`
    (`organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')`);
  - toda la pantalla: `CierresBodegaAdminModule`, `CierresBodegaResueltosLista`,
    `CierreBodegaFacturaResumen` (pinta la pastilla y la columna de conciliación), `refrescarListas`
    (ya revalida las claves `cierres-bodega:pendientes` y `cierres-bodega:resueltos`).
- **Lo que existe y no sirve tal cual:** `colaBodegaWhere` / `historicoBodegaWhere` parten por
  `estado` con `ESTADOS_COLA_SOLICITADO` (`in` / `notIn`). Un `aprobado` con dinero por llegar cae en
  el histórico. Es lo que cambia.

## Zona y capas

Solo **repositorio** (`lib/repositories/CierresBodegaAdminRepository.ts`). Ni la interfaz
(`ICierresBodegaAdminRepository`), ni el servicio (`CierresBodegaAdminService`), ni las actions, ni la
pantalla cambian: los cuatro métodos conservan nombre, firma y contrato (`PaginaRepositorio<…>` /
`CierreBodegaResumenRow[]`). El servicio sigue comprobando `esAccesoTotal` **antes** de llamar al
repositorio.

## Modelo de datos, RLS y migraciones

**Ninguno** (PA2: sin migración). No hay tablas, columnas, índices ni políticas nuevas, y por tanto no
hay `down.sql`. `cierre_bodega` ya tiene `organizacion_id`, RLS `cierre_bodega_por_empresa` y el índice
`cierre_bodega_conciliado_at_idx`, que sirve a la lectura nueva.

Hechos de la base en los que se apoya el criterio (migración `20260919120100_cierre_bodega_conciliacion`):
- `cierre_bodega_conciliacion_coherente`: `conciliado_at IS NOT NULL` ⇔ `estado = 'aprobado'`, y
  entonces `monto_recibido IS NOT NULL`.
- `cierre_bodega_monto_recibido_no_negativo`.

## Autorización

Sin cambios. `listarPendientesCierresBodegaPaginado`, `listarHistoricoCierresBodegaPaginado` y los dos
`…Completo` siguen respondiendo `forbidden` a quien no es `esAccesoTotal` antes de tocar el
repositorio. Módulo: cierres sigue colgando de `nucleo`. La empresa sale de la sesión (extensión del
cliente + RLS); la consulta nueva la filtra además por escrito (R125, guardia
`sql-a-mano-por-empresa`).

## Datos que dependen del país

Ninguno nuevo. Los importes siguen siendo strings del servidor y la pantalla los formatea con
`money()`, como hoy. La resta es de `numeric(12,2)` en Postgres: exacta, sin coma flotante.

## Cómo se lee «lo que falta» (PA2)

«Debe llegar a la central» no es una columna: es `total_general − total_pago_mensajero −
total_ingreso_bodega_rechazos` (`paraLaCentral` de `lib/utils/ingreso-empresa.ts`, la misma resta que
`APORTE_SATELITE_SQL` hace sobre `cierre_dia`). Prisma compara una columna con otra
(`fields`), pero no con una resta de tres. Por eso cada lectura hace **dos pasos**:

1. **Los ids de los recibidos incompletos de la empresa**, con SQL a mano (método privado
   `idsRecibidosIncompletos()`):

   ```sql
   SELECT cb."id"
     FROM "cierre_bodega" cb
    WHERE cb."organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), '')
      AND cb."conciliado_at" IS NOT NULL
      AND cb."monto_recibido" < (cb."total_general" - cb."total_pago_mensajero"
                                 - cb."total_ingreso_bodega_rechazos")
   ```

   `<` estricto = `hayFaltantePorRecibir`: cero o negativo (llegó de más) **no** falta. Es el
   conjunto de la deuda abierta con marca: pequeño (la medición de T0 lo confirma). Sin filtros de
   pantalla: los recortes van en el paso 2.

2. **El `where` de Prisma de siempre**, con ese conjunto:

   ```ts
   // «Conciliados» en positivo (PA1): con marca y sin nada que falte.
   function historicoBodegaWhere(filtros, incompletos: readonly string[]): Prisma.CierreBodegaWhereInput {
     return {
       conciliadoAt: { not: null },
       id: { notIn: [...incompletos] },
       ...(recortes.length > 0 ? { AND: recortes } : {}),
     };
   }
   // «Por conciliar» = el complemento exacto: sin marca (solicitado, rechazado heredado o cualquier
   // estado futuro) o con marca y algo por llegar.
   function colaBodegaWhere(filtros, incompletos: readonly string[]): Prisma.CierreBodegaWhereInput {
     return {
       OR: [{ conciliadoAt: null }, { id: { in: [...incompletos] } }],
       ...(recortes.length > 0 ? { AND: recortes } : {}),
     };
   }
   ```

   Las dos funciones conservan el nombre (la guardia `criterio-unico` las busca por nombre) y siguen
   siendo la **única** declaración que comparten la página, su `count` y el conjunto completo de la
   descarga (R123). Son complemento exacto por construcción: para un mismo `incompletos`, una fila
   cumple una y solo una (`conciliadoAt` nulo ⇒ cola; no nulo ⇒ cola si está en `incompletos`,
   histórico si no). `ESTADOS_COLA_SOLICITADO` deja de usarse en este archivo; lo siguen usando
   incidentes y `esColaSolicitado` del listado sin paginar.

Los cuatro métodos (`findColaPaginada`, `findHistoricoPaginado`, `findColaCompleta`,
`findHistoricoCompleto`) llaman una vez a `idsRecibidosIncompletos()` y construyen el `where` con el
resultado. En los paginados, `findMany` y `count` siguen yendo en `Promise.all` con **el mismo**
objeto `where`. `CierresBodegaAdminPrismaClient` añade `"$queryRaw"` a su `Pick`.

**Carrera aceptada.** Los dos pasos son dos sentencias. Si alguien marca o corrige un cierre justo
entre las dos, esa fila puede pintarse un instante en la lista de antes. No se pierde: aparece en una
lista, no en dos ni en ninguna, porque la partición del paso 2 es complemento exacto para cualquier
`incompletos`. Lo corrige la siguiente lectura (`refrescarListas` tras toda marca). Es una lectura:
no escribe nada.

## Pantalla en C1

Sin cambios de código (R136). La coherencia para el usuario está argumentada en
`requirements.md > Por qué la pantalla intermedia es coherente`. Lo que se mueve:

| Cierre de bodega | Hoy | Con C1 |
|---|---|---|
| `solicitado` (sin marca) | Pendientes | Pendientes |
| `aprobado`, recibido < Debe llegar | Resueltos | **Pendientes** |
| `aprobado`, recibido = Debe llegar | Resueltos | Resueltos |
| `aprobado`, recibido > Debe llegar (llegó de más) | Resueltos | Resueltos |
| `aprobado`, Debe llegar = 0 y recibido = 0 (SLT-96) | Resueltos | Resueltos |
| `rechazado` heredado (sin marca) | Resueltos | **Pendientes** (PA1: medir en T0) |

## Alternativas descartadas

1. **Filtrar en memoria** (leer los `aprobado` y separar con `estadoConciliacionDe`). Rompe la
   paginación en el servidor y el `total` del conjunto (ficha 170): la página N dejaría de ser el
   segmento N y el contador mentiría.
2. **Columna generada o vista con «falta por recibir»**. Pide migración; PA2 la descarta y R72 la
   prohíbe en todas las rebanadas.
3. **Las cuatro lecturas enteras en SQL a mano.** Duplicaría `BODEGA_RESUMEN_SELECT` y el mapper
   `toBodegaResumenRow`, que es donde se derivan `paraLaCentral` y `faltaPorRecibir` una sola vez
   para las ocho lecturas de la cabecera (ficha 393), y saldría de la guardia `criterio-unico`.
4. **Comparar columnas con `fields` de Prisma** (`montoRecibido: { lt: … }`). No admite la resta de
   tres columnas; con `totalGeneral` a secas daría otro número que el de la tarjeta.
5. **Partir por `estado` y añadir los incompletos solo a la cola** (sin tocar el histórico). Dejaría
   los incompletos en las dos listas. Viola R122.
6. **Renombrar ya las pestañas en C1.** ~14 archivos más de tests y E2E; ver `requirements.md`.

## Dependencias de terceros

Ninguna nueva. El script de medición de T0 usa el `pg` que ya trae `@prisma/adapter-pg`.

## Riesgos

- **Mocks del cliente.** Los tests unitarios que construyen el repositorio con
  `{ cierreBodega } as unknown as PrismaClient` y llaman a los cuatro métodos necesitan un
  `$queryRaw` doble que devuelva `[]` (o los ids del caso). Se adaptan en T3.
- **Tests de integración que esperaban un incompleto en el histórico:**
  `tests/integration/db/slt76-desmarcable.int.test.ts` siembra uno (`5000.00` esperado / `4600.00`
  recibido) y lo busca en `findHistorico*`. Se adapta para leer la lista que le toca (T3).
- **Una consolidación con marca y `monto_recibido` nulo** no puede existir (`CHECK`). Si existiera,
  `<` con `NULL` da desconocido: no sería «incompleto» y caería en el histórico. El `CHECK` lo
  impide; no se añade defensa.
