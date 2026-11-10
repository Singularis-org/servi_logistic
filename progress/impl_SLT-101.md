# SLT-101 «Fila de gestión única y lista con filtros» — bitácora de implementación

## T0 (parte de servidor/datos) y T1 «Servidor» — backend_dev, 2026-11-09

Base desechable `slt101_t1` (mismo servidor que `.env`, solo cambia el nombre de la base), con
`prisma migrate deploy` + `pnpm run db:seed` (lo mismo que hace `gate.yml`). Sin migraciones ni
cambios de esquema: `git diff db/` vacío. No se corrió `prisma generate`.

### T0.1 — consumidores (servidor)

- `IngresoEmpresaDTO`: `ICierreDiaService.ts`, `ICierreDiaRepository.ts`, `ICierresAdminService.ts`,
  `CierresAdminRepository.ts` (`toIngresoEmpresa`, único que construye el objeto entero en
  producción), `CierresAdminService.ts` (`ocultarFulfillmentSiNoCentral`), `lib/utils/ingreso-empresa.ts`,
  y en pantalla `cierre-detalle-shared.tsx`, `cierre-labels.ts` (solo leen).
- `CierreDetalleGestion` / `toDetalleDTO`: lo construye solo `toDetalleDTO`
  (`CierreDiaService.ts`), llamado desde `CierreDiaService.ts:358/440/503` (vista del mensajero, sin
  cambios: su repo no trae `pagoPorTarifa` ni `tarifaFaltante`), `CierresAdminService.ts:885` y
  `CierresBodegaAdminService.ts:327`.
- Ningún consumidor deja de compilar: todos los campos nuevos son opcionales (typecheck verde).
- Ningún código itera las claves de `ingresoEmpresa` (`Object.keys/entries/values`): las claves
  nuevas no crean columnas en ningún Excel.
- **Archivos de más respecto a `## Archivos esperados`** (los dobles de los tests de repositorio no
  traían la relación ni la consulta nueva; se añade una línea a cada uno, sin quitar nada):
  - `tests/unit/repositories/cierres-admin-repository.test.ts` (`pagosCongelados: []` y el doble
    de `ordenFulfillmentMovimiento.findMany`);
  - `tests/unit/repositories/cierre-pagos-lectura.test.ts` (ídem);
  - `tests/unit/repositories/cierre-detalle-causa-monto.test.ts` (`pagosCongelados: []`);
  - `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (`pagosCongelados: []`);
  - `tests/unit/services/gestion-desde-ayuda-rotulo-cierre.test.ts` (`pagosCongelados: []`);
  - `tests/unit/repositories/cierres-admin-gestiones-where.test.ts`: el literal «la descarga es el
    detalle menos …» gana `"pagosCongelados"` (decisión: la hoja fundida no lo necesita; la
    «Señales» de R91 sale del DTO del detalle).

  Son 6 archivos más (8 con los dos de «Otros dos tests», abajo): el total previsto pasa de 42 a **50** (> 44). Aviso al leader.
- `factura-contraste.guardia` y los `tests/components` / `e2e/` de T0.1: son de frontend_dev, no
  se tocaron.

### T0.2 — servidor (archivo:línea)

- Nombres reales: `Zona.nombre` (`db/schema.prisma:596`), `GrupoDistritos.nombre` (`:1975`),
  `Vehiculo.name` (`:2150`).
- `tienda_fulfillment` congela `iva_pct` en `cierre_detail_concepto` (`Decimal(5,2)`) y se serializa
  con `toFixed(2)` → `"13.00"` (`lib/utils/cierre-detalle.ts:164`; el mapper nuevo hace lo mismo).
- Concepto de cobro por resultado: `tienda_flete_<resultado>` del catálogo (`lib/tarifas/catalogo.ts:36-40`;
  `devolucion_a_origen_por_rechazo` → `tienda_flete_rechazo`); se busca con `conceptoPorResultado`.
- `ajustarPagoMensajeroEnCierre` (`CierresAdminRepository.ts:2233`) solo escribe
  `gestion_pago_mensajero_ajuste` (`:2280`) y la gestión; no toca `gestion_pago_congelado`.
- `corregirResultadoGestionEnCierre` (`:1941`) **re-congela** el pago (`deleteMany` + `createMany`,
  `:2094`) con el importe nuevo y **no borra los ajustes**: tras corregir, `pagoPorTarifa.importe` =
  `pagoMensajero`, así que `ajuste` sale `null` aunque `ajustesPago` siga con filas (la marca
  «Ajustado» sigue; la línea «− Ajuste» no). Coherente con R95 («si no difieren, nula»).
- `orden_fulfillment_movimiento.secuencia`: crece por orden, impar = cargo, par = reverso
  (`db/migrations/20261108120200_slt94_fulfillment_movimiento/migration.sql:51`). Último evento =
  mayor secuencia.

### T0.3

No hecho aquí: los literales del E2E dependen de la siembra de `e2e/_escenarios/` y van con T6
(frontend_dev).

### T1 — archivos

- `lib/interfaces/services/ICierreDiaService.ts`: `IngresoEmpresaDTO` + `ivaIncluido?`,
  `fulfillmentConIva?`, `ivaPctFulfillment?`, `fulfillmentCargadoAt?`, `conceptosTarifa?`;
  `CierreDetalleGestion` + `pagoPorTarifa?`; tipos `OrigenTarifaDTO`, `ConceptoTarifaDTO`,
  `PagoPorTarifaDTO`.
- `lib/interfaces/repositories/ICierreDiaRepository.ts`: `pagoPorTarifa?`, `tarifaFaltante?` en
  `CierreGestionPendienteRow`.
- `lib/repositories/CierresAdminRepository.ts`: `DETALLE_ADMIN_SELECT.conceptos` con los nombres de
  zona y grupo de su `tarifa_valor` (sin tocar `CONCEPTO_CONGELADO_SELECT`);
  `GESTION_ADMIN_SELECT.pagosCongelados` con `where: { actor: "mensajero" }`; quinta consulta del
  `Promise.all` de `findCierreByIdEnAlcance` (`ordenFulfillmentMovimiento`, `where` por las órdenes
  de `cierre_detail` de ese cierre, `orderBy secuencia desc`, `distinct ordenId`); derivaciones con
  `Prisma.Decimal` en `toIngresoEmpresa` y `toPendienteRowDesdeSnapshot` (parámetro opcional
  `LecturaDetalleMensajero`).
- `lib/services/CierreDiaService.ts`: `toDetalleDTO` pasa `pagoPorTarifa` (solo si la fila lo trae)
  y usa `tarifaFaltante ?? g.tarifaFaltante ?? false`.
- `lib/services/CierresAdminService.ts`: `ocultarFulfillmentSiNoCentral` anula también
  `fulfillmentConIva`, `ivaPctFulfillment` y `fulfillmentCargadoAt` (solo si vienen).
- Tests: `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` (nuevo),
  `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` (ampliado) y los 6 dobles de
  arriba.

**Decisión técnica (anotada):** `tarifaFaltante` solo se emite cuando el mapper recibe
`LecturaDetalleMensajero`, o sea en el detalle de mensajero de `/cierres-admin`. El detalle de
bodega usa el mismo mapper y su pantalla pinta ya el badge «Sin tarifa» con `tarifaFaltante`
(`cierre-detalle-shared.tsx:877`); emitirlo allí cambiaría esa pantalla, y R90 dice que no cambia.
Allí sigue el `false` de siempre hasta SLT-104 «Detalle de cierre de bodega en el detalle único
(central)». `pagoPorTarifa` y las cifras del ingreso sí llegan a bodega (nadie las pinta aún);
`fulfillmentCargadoAt` llega `null` en bodega y en la hoja fundida (no leen movimientos).

### Mapa R → test (T1)

| R | Test |
|---|---|
| R64 | `cierre-detalle-cifras-fila-sql-real` «R64/R97: tarifa congelada de cada concepto COBRADO» |
| R65 | ídem «R65/R93/R92: IVA incluido» y «R65/R94: «Se cobró», % de IVA y fecha» |
| R66 | ídem «R66/R95: pago por tarifa … resta 700,00» y «R66/R96: «Sin tarifa de pago»» |
| R92 | ídem (todos los importes como string escala 2) |
| R93 | ídem «R65/R93/R92» (520.00, 390.00, 299.00) |
| R94 | ídem «R94: reverso → null», «R94: el viejo …», «R94: la orden D no se cuela»; `cierres-admin-fulfillment-solo-central` bloque «SLT-101 R94» (satélite `null`, central intacto, también en el Excel) |
| R95 | ídem «R66/R95» y «R95: sin fila del mensajero (B) y en el viejo (C) → null» |
| R96 | ídem «R66/R96» (A false, B true, C viejo false) |

### Mutaciones (ejecutadas una a una sobre `CierresAdminRepository.ts` y restauradas; sha256 igual al de antes)

| Mutación | Resultado | Salida roja |
|---|---|---|
| M1 quitar `where: { actor: "mensajero" }` | ROJO (2) | `expected { importe: '950.00', …(8) } to be null`; `expected false to be true` (tarifaFaltante de B) |
| M2 quitar el `where` de `ordenFulfillmentMovimiento` | ROJO (1) | `expected Set{ …(3) } to deeply equal Set{ …(2) }` (la orden D se cuela) |
| M3a quitar el `orderBy` | ROJO (1) | `expected '2026-11-05T15:00:00.000Z' to be null` |
| M3c `secuencia: "asc"` | ROJO (1) | `expected '2026-11-05T15:00:00.000Z' to be null` |
| M3b quitar `distinct` | ROJO (1) | `expected '2026-11-05T15:00:00.000Z' to be null` |
| Servicio: no anular `fulfillmentCargadoAt` para la satélite | ROJO (2) | `expected { tarifaModelo: 'nuevo', …(24) } to deeply equal …` |

Medido en la primera versión: con el reverso insertado antes que el cargo, M3a sobrevivía en verde
(el orden físico daba por casualidad el último evento). Se invirtió el orden de inserción y se
anotó en la siembra.

**Los tests de servicio no ven el SQL:** con M1, M2 y M3b aplicadas, los 210 tests de
`cierres-admin-fulfillment-solo-central`, `cierres-admin-repository`, `cierre-pagos-lectura`,
`cierre-detalle-causa-monto` y `cierres-admin-service` siguen en verde (210/210 las tres veces).
Solo el test de integración las mata.

### Otros dos tests que el cambio tocaba

- `tests/integration/db/tarifas-flexibles-snapshot.test.ts` (rojo en `vitest related`): afirmaba que
  tras BORRAR un valor de tarifa el detalle solo cambia en `tarifaValorId`. Ahora también pasan a
  `null` los nombres del origen en `conceptosTarifa` (es la misma traza, R97). `sinTraza` quita esos
  nombres solo dentro de `conceptosTarifa`/`pagoPorTarifa` (el `zonaNombre` congelado de la fila se
  sigue comparando) y se añade la aserción «G1 antes, `null` después, nivel `grupo` en los dos».
- `tests/unit/guards/tarifa-valor-lectores.guardia.test.ts`: `CierresAdminRepository.ts` entra en la
  lista de lectores de `tarifa_valor` con su motivo (solo nombres del origen de lo congelado; ningún
  importe sale de esa tabla).

Con estos dos, el diff de T1 son 17 archivos (5 de servidor, 1 test nuevo, 9 tests adaptados,
`tasks.md` y esta bitácora). El total previsto de la ficha pasa de 42 a **50** (> 44): aviso al leader.

### Salidas (base desechable `slt101_t1`)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0 (sin la opción, OOM: deuda
  D27 conocida; CI usa 8192).
- `pnpm run lint` → exit 0, `0 errors, 243 warnings` (las 3 de `cierres-admin-gestiones-where` ya
  estaban en HEAD).
- `vitest run tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` → 10 passed (0 skipped).
- `vitest run` de `tarifas-flexibles-snapshot`, `cierre-detalle-cifras-fila-sql-real`,
  `cierre-resuelto-por-sql-real`, `ajuste-pago-mensajero-lectura.int`, `ajuste-pago-mensajero-cierre.int`,
  `cierre-incluye-modelo-nuevo`, `tarifas-valor-propio-caminos` → 7 files, 91 passed.
- `vitest run tests/unit/repositories tests/unit/services` → 517 files, 9941 passed (incluye
  `cierres-admin-repository`, `cierre-pagos-lectura`, `cierres-admin-service`,
  `cierres-admin-fulfillment-solo-central` 13/13).
- `pnpm run test:guardias` → 340/342 files; `tarifa-valor-lectores` arreglado (ver arriba) y
  `liquidacion-money-safe`, `pagos-proyeccion` verdes. Queda rojo
  `dependencias-declaradas-presentes.guardia` (4): «init.sh ya no tiene el marcador ">>> FIN PASO 2:
  DEPENDENCIAS (ficha 420) <<<"»; `init.sh` no está en el diff: ajeno a este cambio.
- `vitest related --run` de los 5 archivos de servidor (426 files): 90 rojos, todos de **datos que
  la base desechable recién migrada no trae** («tabla `orden` vacia», «falta la zona central»,
  «`usuario` esta vacia», y los `reading 'prisma'` de sus `afterAll`) salvo el de
  `tarifas-flexibles-snapshot` (arreglado arriba) y cinco ajenos al detalle (`referencia a otra
  empresa` al sembrar en `cierre-rechazo-tienda-aprobacion` / `caja-caracterizacion-459` /
  `premio-ranking-idempotencia`, `unauthenticated` en `premio-ranking-idempotencia`, catálogos de
  `wallet-458-migration`). Ninguno nombra un campo de esta ficha.

### Veredicto

T1 hecho: las cifras de la fila salen del servidor con `Prisma.Decimal`, aditivas y sin migración;
el `WHERE` de cada una lo mata su mutación contra Postgres real.
