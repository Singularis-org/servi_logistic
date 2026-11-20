# SLT-148 «Detalle del cierre de bodega sin N+1» — design

> Escrito con Grep/Read sobre este worktree (rama desde `origin/dev` con la épica de cierres). El
> grafo no se consultó: el proyecto de este worktree es nuevo y el índice lo mantiene el leader.

## Lo que ya existe

Buscado en `feature_list.json`, `specs/` y el código: «findCierreBodegaConDetalle», «lote»,
«N+1», «cierreId: { in», «crearPrismaDeTestConEspia». Nada de esta ficha está hecho ni en vuelo.
Lo que se reusa:

- **El método a cambiar:** `CierresBodegaAdminRepository.findCierreBodegaConDetalle`
  (`lib/repositories/CierresBodegaAdminRepository.ts`). Hoy: cabecera con el alcance en el `where`
  (`findFirst`, SLT-107 R280) → `cierreDia.findMany` por `cierreBodegaId` → **por cada cierre del
  día** `gestionOrden.findMany({ cierreId: cd.id })` + `cierreDetail.findMany({ cierreId: cd.id })`
  (más las relaciones de `GESTION_ADMIN_SELECT`, que Prisma carga por consulta) → en paralelo
  `cargosFulfillmentVigentes` (ya en lote, una consulta) → `aResumenRows` de la cabecera. Es el N+1
  de la ficha: 2·N consultas de primer nivel más las de relaciones de cada una.
- **El precedente que resuelve lo mismo:** `CifrasBodegaLoteRepository.leerCierresDiaDeBodegas`
  (SLT-141, R389): tres consultas fijas (`cierreDia` → `gestionOrden` con `cierreId: { in }` y
  `select: { ...GESTION_ADMIN_SELECT, cierreId: true }` → `cierreDetail` con `cierreId: { in }` y
  `select: { ...DETALLE_ADMIN_SELECT, cierreId: true }`), agrupado en memoria por `cierreId` y con la
  fila congelada buscada por la clave `${cierreId}:${ordenId}`. Este diseño copia esa forma, no la
  clase (ver alternativas).
- **Piezas compartidas que no cambian:** `DETALLE_CIERRE_SELECT` / `toDetalleCierreRow` (este mismo
  archivo), `GESTION_ADMIN_SELECT` / `DETALLE_ADMIN_SELECT` / `toPendienteRowDesdeSnapshot` /
  `cargosFulfillmentVigentes` (`CierresAdminRepository.ts`), `CierreDetalleFaltanteError`
  (`lib/utils/cierre-detalle.ts`), `aResumenRows` (`CierreBodegaRepository.ts`).
- **Contador de consultas:** `crearPrismaDeTestConEspia` (`tests/integration/db/_postgres-real.ts`)
  y el patrón `medir()` de `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts`
  («mismas consultas con 1 y con 3»), con `enTransaccionRevertida` y `serializarEscriturasReales`.
- **Tests que ya llaman al método y deben seguir verdes sin tocar sus aserciones** (paridad de
  regresión): `cierres-bodega-cifras-lote-sql-real.test.ts` (paridad lote ↔ detalle de SLT-141),
  `cierre-bodega-desglose-por-tienda-sql-real.test.ts`, `cierre-bodega-cifras-fila-sql-real.test.ts`,
  `cierre-reparto-porcentajes-sql-real.test.ts`, `ajuste-pago-mensajero-lectura.int.test.ts`,
  `486-evidencias-cierres-sql-real.test.ts`, `slt76-desmarcable.int.test.ts`.
- **Tests de unidad con dobles de Prisma que dependen de la forma del bucle** (cambian, ver tasks):
  `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (afirma «una llamada por cierre
  del día» y encadena `mockResolvedValueOnce` por cierre) y `tests/unit/repositories/cierre-pagos-lectura.test.ts`
  (afirma `select` **idéntico** por referencia a `GESTION_ADMIN_SELECT`; sus filas no traen `cierreId`).
- **Librerías:** ninguna nueva.

## Decisión técnica

### El método, en lote

Misma firma, mismo valor de retorno. Pasos:

1. **Cabecera** — sin cambios: `cierreBodega.findFirst({ where: { id, ...zonaSiSatelite } })`.
   `null` → `return null` antes de cualquier otra lectura (R425).
2. **Cierres del día** — sin cambios: `cierreDia.findMany({ where: { cierreBodegaId: id }, orderBy:
   { solicitadoAt: "desc" }, select: DETALLE_CIERRE_SELECT })`.
3. **Si no hay cierres del día** → `cierresDia: []` sin leer gestiones, filas congeladas ni cargos
   (R428; `cargosFulfillmentVigentes([])` ya no consulta).
4. **En paralelo, tres lecturas fijas** con `idsDia` = los ids del paso 2 (el acotamiento va en el
   `WHERE`, R426):
   - `gestionOrden.findMany({ where: { cierreId: { in: idsDia } }, orderBy: { createdAt: "desc" },
     select: { ...GESTION_ADMIN_SELECT, cierreId: true } })`;
   - `cierreDetail.findMany({ where: { cierreId: { in: idsDia } }, select: { ...DETALLE_ADMIN_SELECT,
     cierreId: true } })`;
   - `cargosFulfillmentVigentes(this.prisma, idsDia)` (igual que hoy).
5. **Composición en memoria**, en el orden del paso 2:
   - gestiones agrupadas por `cierreId` conservando el orden de la consulta (`createdAt desc`
     global, que restringido a un cierre del día es el mismo orden que la consulta por cierre de hoy:
     R423);
   - fila congelada por clave `${cierreId}:${ordenId}` (no solo `ordenId`: una orden puede tener
     gestiones en dos cierres del día del mismo cierre de bodega, R424). El grano real es
     `@@unique([cierreId, ordenId])` de `cierre_detail`;
   - por cada gestión, `toPendienteRowDesdeSnapshot(g, d, zona, { cargoFulfillmentAt:
     cargoPorOrden.get(g.ordenId) ?? null })`; fila congelada ausente → `CierreDetalleFaltanteError(cd.id,
     g.ordenId)` recorriendo en el mismo orden que hoy (R427), de modo que el primer faltante que se
     nombra es el mismo.
   - La clave `cierreId` añadida al `select` **no** llega al DTO: `toPendienteRowDesdeSnapshot` no la
     copia (R422 lo fija con `toEqual` sobre la respuesta entera).
6. **Cabecera con `desmarcable`** — sin cambios: `aResumenRows(this.prisma, [cierre])`.

Resultado: el número de sentencias deja de depender de N (R420): cabecera + cierres del día + las
tres lecturas (más las relaciones de `GESTION_ADMIN_SELECT`, una por relación y no por gestión) +
`aResumenRows`. El número exacto se mide en T0 y se escribe como constante en el test; no se
supone aquí.

### Empates de orden

Ni hoy ni después hay desempate explícito en `createdAt` de gestiones ni en `solicitadoAt` de
cierres del día. No se añade (cambiaría la forma de la respuesta respecto a hoy en los empates y
desalinearía el orden con `CifrasBodegaLoteRepository`, del que depende `partesPorTienda`). El corpus
usa fechas distintas para que el orden sea determinista y medible.

### Contrato I/O

Sin cambios: `ICierresBodegaAdminRepository.findCierreBodegaConDetalle(id, zona, alcance)` →
`{ cierre: CierreBodegaResumenRow; cierresDia: { resumen: CierreBodegaDetalleCierreRow; gestiones:
CierreGestionPendienteRow[] }[] } | null`. Ningún servicio, acción ni pantalla cambia.

## Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migración, ni `down.sql` (E3). Índices que usan las lecturas
nuevas, ya presentes en `db/schema.prisma`: `gestion_orden @@index([cierreId])`,
`cierre_detail @@unique([cierreId, ordenId])` (su prefijo sirve a `cierre_id IN (…)`),
`cierre_dia @@index([cierreBodegaId])`. No hace falta índice nuevo, así que no hay pregunta aparte.

Multi-empresa: las tablas leídas (`cierre_bodega`, `cierre_dia`, `gestion_orden`, `cierre_detail`,
`orden_fulfillment_movimiento` y las relaciones de `GESTION_ADMIN_SELECT`) llevan `organizacion_id`
y RLS; las lecturas usan el mismo cliente de Prisma con la empresa de la sesión, como hoy.

## Autorización y módulo

Las puertas de hoy, ninguna nueva. El servicio (`verCierreBodegaDetalle`) resuelve el alcance
(`toda_la_empresa` para acceso total, `{ lectura: "zona", zonaId }` para la satélite) antes del
repositorio; el repositorio lo aplica en el `WHERE` de la cabecera, y las lecturas siguientes solo
ven los cierres del día de esa cabecera (R425, R426). Módulo: el de cierres, sin cambios.

## Datos que dependen del país

Ninguno nuevo. La zona horaria (`zona`) llega del servicio y solo la usa el mapper para fechar, como
hoy. Moneda, impuestos y métodos de pago salen de lo congelado.

## Verificación

Un archivo nuevo de integración contra Postgres real,
`tests/integration/db/cierre-bodega-detalle-lote-sql-real.test.ts`, con su corpus sembrado entero
(la base solo trae catálogos) dentro de `enTransaccionRevertida`:

- zona C (alcance de la satélite S) y zona N;
- **BX** (C) con tres cierres del día D1, D2, D3 de `solicitadoAt` distintos, en un orden de
  inserción distinto del de lectura; gestiones con `createdAt` **intercalados** entre cierres del
  día; la orden O1 con gestión en D1 y en D2 y una fila congelada distinta en cada uno (p. ej.
  `direccion`); al menos una gestión del modelo nuevo con tarifa congelada y una del viejo; una
  gestión con ajuste de pago y desglose de pagos; una orden con cargo de fulfillment vigente y otra
  con reverso;
- **B1** (C) con un solo cierre del día y una gestión (caso N = 1);
- **BZ** (N) con su cierre del día y gestiones: señuelo de alcance y de R426;
- **B0** (C) sin cierres del día (R428);
- **BF** (C) con una gestión sin fila congelada (R427), en un caso aparte para no romper los demás.

La respuesta esperada de BX se escribe **a mano** (importes, descriptivos, fechas ISO y orden) y se
compara con `toEqual` contra la respuesta entera (R422); nunca se copia de la salida. El test se
escribe y se pone verde **contra el código de hoy** (T1) antes de cambiar el método: así la paridad
antes/después es la misma aserción en los dos lados.

## Alternativas descartadas

1. **Que `findCierreBodegaConDetalle` llame a `CifrasBodegaLoteRepository.leerCierresDiaDeBodegas`.**
   Ya está en lote y se probó. Descartada: no lee el cargo de fulfillment (`cargoFulfillmentAt: null`
   a propósito, SLT-141) y el detalle sí lo muestra (SLT-110 R210); su fila no trae el
   `CierreBodegaDetalleCierreRow` entero; y metería una dependencia repositorio → repositorio. Para
   usarla habría que cambiar su contrato, que tiene sus propios tests de SLT-141 verdes.
2. **Extraer a `lib/repositories/_shared/` un compositor común de «gestiones congeladas en lote»** y
   que lo usen los dos repositorios. Quitaría unas 20 líneas duplicadas. Descartada en esta ficha:
   toca código de SLT-141 que no tiene el problema y amplía el radio del cambio (arreglar lo
   evidenciado, no rediseñar). Se anota como mejora posible, no como deuda.
3. **Relaciones anidadas en una sola consulta** (`cierreDia.findMany({ select: { ...,
   gestiones: { select: GESTION_ADMIN_SELECT } } })`). Descartada: cambia `DETALLE_CIERRE_SELECT`,
   que comparten el detalle y el lote de SLT-141 (y ya usa la relación `gestiones` en su `_count`), y
   la fila congelada no cuelga de la gestión sino de `(cierreId, ordenId)`, así que igual haría falta
   una lectura aparte de `cierre_detail`.
4. **SQL a mano (`$queryRaw`) con un solo `JOIN`.** Descartada: duplicaría la proyección y el mapeo de
   `GESTION_ADMIN_SELECT` (pagos, ajustes, evidencias, historial), que hoy salen de una sola
   declaración compartida por tres caminos.
