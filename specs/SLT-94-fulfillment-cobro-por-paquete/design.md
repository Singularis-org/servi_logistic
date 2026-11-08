# SLT-94 — fulfillment-cobro-por-paquete · design.md

## Lo que ya existe

Buscado `fulfillment`, `cobro por orden`, `se recoge en tienda`, `recoger en tienda`, `empacado`,
`por paquete` en `feature_list.json` (todas las fichas), `specs/` y el código (Grep: el MCP
`codebase-memory-mcp` no tiene indexado este worktree; se usó el árbol del worktree).

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-52 (`specs/SLT-52-tarifas-flexibles-modelo`, R31) | Concepto `tienda_fulfillment` del modelo nuevo; lo deja **fuera** del cierre y las wallets a propósito. Solo se muestra (cotización, costo API, `cierre_detail_concepto`). | Se reutiliza el concepto y su valor. El cierre sigue sin sumarlo (R32). No hay cobro hoy: no es duplicado. |
| Ficha 27 (`specs/27-fulfillment-tienda`) y 155 (`specs/155-creacion-bifurcada-fulfillment`) | La marca `usuario.fulfillment` y `resolverDestinoCreacion(fulfillment)`, el punto único de nacimiento. | Se reutiliza `resolverDestinoCreacion`; solo cambia de dónde sale su booleano. |
| Fulfillment del 2026-08-25 (`BulkOrdenService.cargarViaApi`, `tieneFulfillment`) | Por API el nacimiento lo decide la TARIFA (`fulfillment > 0`), no la marca. | Se retira: contradice D4 (la marca es el único predicado). |
| SL-40 (`db/migrations/20261023130200_cobro_plataforma_triggers_orden`) | Cobro de la PLATAFORMA a la empresa por orden: triggers sobre `orden` (cargo al crear, reverso al eliminar, cargo al restaurar), con ledger por secuencia. En producción. | Se copia el **molde** (triggers, alternancia por último movimiento, sin backfill). No se toca SL-40. |
| Fichas 42/43/459/461/458-B | Libros de caja (`wallet_movimiento`) y de tienda (`wallet_tienda_movimiento`), invariante R8 tienda↔caja, categorías de cargo y sus reversos (`flete_devolucion_anulado` / `egreso_reverso_flete_devolucion`). | Se añaden cuatro pares de categorías siguiendo exactamente ese patrón. |
| SLT-54 (`TarifaActivacion`) | El interruptor del modelo nuevo por empresa. | Es la condición D8. |
| `tests/unit/analytics/fulfillment-fuera-de-la-formula.guardia.test.ts` | Vigila que el fulfillment no entre en `derivarIngresoOrden` ni en la liquidación del cierre. | Sigue verde **sin cambios**: el cobro nuevo no pasa por el cierre. |

Feature 69/R13 (orden re-apuntada a otra tienda) y RechazoTiendaCobro (337) dan el precedente de
**congelar la tienda** en el cobro (R31).

## Resumen de la solución

1. **Marca:** columna nueva `usuario.se_recoge_en_tienda` (default `true`), backfill `= NOT fulfillment`
   en la misma migración. La columna vieja se queda y nadie la lee ni la escribe (su campo Prisma se
   renombra a `fulfillmentRetirado` para que todo lector olvidado rompa el typecheck).
2. **Nacimiento:** las dos vías de `BulkOrdenService` llaman a `resolverDestinoCreacion(!seRecogeEnTienda)`
   con la marca de la tienda dueña. Por API se retira el predicado por tarifa.
3. **Cobro:** dos triggers sobre `orden` (molde SL-40) y uno sobre `orden_historial_estado` (la
   cancelación por API, D12) escriben un registro inmutable por evento (`orden_fulfillment_movimiento`:
   cargo / reverso, con secuencia y causa) y, en la misma sentencia, sus filas en el libro de la tienda
   y en la caja. Cubre por construcción las tres vías de creación, los tres escritores de `deleted_at`
   y la cancelación por API.
4. **Configuración:** `tienda_fulfillment` solo en nivel `tienda_general` y modo `monto`: service,
   CHECK `NOT VALID` en la base, pantalla de Tarifas y resolución (lo inválido ya guardado se ignora).

## 1. Modelo de datos y migraciones

Cuatro migraciones, escritas a mano (`db:migrate:create` falla con P3006 en este repo), cada una con
`down.sql`. Ninguna mueve ni borra filas existentes salvo el backfill de la columna nueva (R35).

### M1 `20261108120000_slt94_fulfillment_enums` (sola: 55P04)

```sql
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'fulfillment';            -- débito
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'iva_fulfillment';        -- débito
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'fulfillment_anulado';    -- crédito
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'iva_fulfillment_anulado';-- crédito
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'ingreso_fulfillment';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'ingreso_iva_fulfillment';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'egreso_reverso_fulfillment';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'egreso_reverso_iva_fulfillment';
ALTER TYPE "wallet_origen_tipo" ADD VALUE IF NOT EXISTS 'orden_fulfillment';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'usuario_se_recoge_en_tienda_cambiado';
```

`down.sql`: la función dinámica `pg_temp.quitar_valores_de_enum_*` de
`20261031140000_slt73_diferencia_satelite_enums/down.sql` (lee `pg_enum`, precondición ruidosa si
alguna fila usa un valor, guarda y recrea CHECK/índices/triggers), copiada y renombrada `_slt94`.

### M2 `20261108120100_slt94_se_recoge_en_tienda`

```sql
ALTER TABLE "usuario" ADD COLUMN "se_recoge_en_tienda" BOOLEAN NOT NULL DEFAULT true;
UPDATE "usuario" SET "se_recoge_en_tienda" = false WHERE "fulfillment" = true;  -- R2 (prod: 0 filas)
```

`down.sql`: `UPDATE "usuario" SET "fulfillment" = NOT "se_recoge_en_tienda";` y después
`DROP COLUMN "se_recoge_en_tienda"` (R35: los cambios hechos a la nueva no se pierden). La columna
`fulfillment` NO se borra (D4). Es de `usuario`, que ya tiene `organizacion_id`, RLS y el trigger de
empresa: la columna no necesita nada propio.

### M3 `20261108120200_slt94_fulfillment_movimiento`

Enums `orden_fulfillment_movimiento_tipo` (`cargo`, `reverso`) y `orden_fulfillment_movimiento_causa`
(`creacion`, `restauracion` para los cargos; `eliminacion`, `cancelacion_api` para los reversos; CHECK
que casa causa con tipo) y la tabla de NEGOCIO:

```sql
CREATE TABLE "orden_fulfillment_movimiento" (
  "id"              TEXT NOT NULL,
  "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "orden_id"        TEXT NOT NULL,          -- FK orden RESTRICT (el dinero es evidencia)
  "tienda_id"       TEXT NOT NULL,          -- FK usuario RESTRICT, CONGELADA (R21/R31)
  "secuencia"       INTEGER NOT NULL,       -- 1 = cobro inicial; alterna cargo/reverso
  "tipo"            "orden_fulfillment_movimiento_tipo" NOT NULL,
  "causa"           "orden_fulfillment_movimiento_causa" NOT NULL, -- D11/D12: qué evento lo produjo
  "monto"           DECIMAL(12,2) NOT NULL, -- CHECK > 0
  "iva_pct"         DECIMAL(5,2)  NOT NULL, -- CHECK >= 0
  "iva"             DECIMAL(12,2) NOT NULL, -- CHECK >= 0
  "tarifa_valor_id" TEXT,                   -- FK tarifa_valor SET NULL (traza, nunca bloqueo)
  "ocurrido_at"     TIMESTAMP(3) NOT NULL,  -- cargo inicial: orden.created_at; reverso: deleted_at o instante de la cancelación; re-cargo: now()
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orden_fulfillment_movimiento_pkey" PRIMARY KEY ("id")
);
-- R23/R27: un evento por secuencia y orden, por empresa; la secuencia 1 es el ÚNICO cobro inicial.
CREATE UNIQUE INDEX "orden_fulfillment_movimiento_orden_secuencia_key"
  ON "orden_fulfillment_movimiento" ("organizacion_id", "orden_id", "secuencia");
-- CHECK: secuencia impar <=> cargo (la alternancia empieza por cargo).
```

- Índices: `organizacion_id`, `orden_id`, `tienda_id`, `tarifa_valor_id`.
- RLS con la política por empresa para `servi_app` (patrón SLT-73); `REVOKE INSERT, UPDATE, DELETE …
  FROM servi_app` (R25): la app solo lee, escribe solo el trigger (SECURITY DEFINER), como
  `cobro_plataforma_porcentual_orden` (SLT-83).
- Triggers de misma empresa por cada FK de negocio (`tsx scripts/generar-misma-empresa.ts
  --faltantes`) e `impedir_cambio_de_empresa`.
- Prisma: modelo `OrdenFulfillmentMovimiento` (`@@map`), relaciones a `Orden`, `Usuario` (tienda),
  `TarifaValor` (SetNull) y `Organizacion`. Los CHECK viven solo en el SQL (comentado en el modelo).

En la misma migración (los enums de M1 ya existen):

- Reescribir `wallet_tienda_movimiento_tipo_categoria_check` partiendo de la definición VIGENTE
  (`20260928120100_wallet_458_tablas`): `fulfillment_anulado`, `iva_fulfillment_anulado` al lado
  `credito`; `fulfillment`, `iva_fulfillment` al lado `debito`.
- Reescribir `wallet_movimiento_tipo_categoria_check` desde la VIGENTE
  (`20261031140100_slt73_ajuste_conciliacion`): `ingreso_fulfillment`, `ingreso_iva_fulfillment` al
  lado `ingreso`; `egreso_reverso_fulfillment`, `egreso_reverso_iva_fulfillment` al lado `egreso`.
- R12: `ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_fulfillment_solo_tienda_monto" CHECK
  ("concepto" <> 'tienda_fulfillment' OR ("tienda_id" IS NOT NULL AND "zona_id" IS NULL AND
  "grupo_id" IS NULL AND "modo" = 'monto')) NOT VALID;` — `NOT VALID` porque en dev puede haber filas
  viejas que no cumplen y la regla del brief prohíbe borrarlas; Postgres la aplica igual a todo INSERT
  y UPDATE nuevo. En producción hay 0 filas (T0).

`down.sql`: borra las filas de los dos libros con `origen_tipo = 'orden_fulfillment'` (solo las suyas),
suelta la tabla y el enum, devuelve los dos CHECK a su definición anterior y suelta el CHECK de
`tarifa_valor`.

### M4 `20261108120300_slt94_fulfillment_triggers` (carpeta propia: se puede apagar sin borrar cobros)

Dos funciones `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`, `REVOKE EXECUTE
… FROM PUBLIC`, la empresa siempre de `NEW.organizacion_id` (que la RLS de `orden` ya validó):

**`fulfillment_al_crear_orden()`** — `AFTER INSERT ON "orden" FOR EACH ROW WHEN (NEW."deleted_at" IS NULL)`

```
si NO existe tarifa_activacion de NEW.organizacion_id → RETURN               -- R16
leer de tarifa_valor (organizacion_id = NEW.organizacion_id, concepto = 'tienda_fulfillment',
  tienda_id = NEW.tienda_id, zona_id/grupo_id/mensajero_id/vehiculo_id IS NULL, modo = 'monto')
si no hay fila o valor <= 0 → RETURN                                           -- R17, R14
monto := round(valor, 2); iva := round(monto * iva_pct / 100, 2)              -- = ivaDe (HALF_UP)
INSERT orden_fulfillment_movimiento (secuencia 1, 'cargo', monto, iva_pct, iva, tienda_id = NEW.tienda_id,
  tarifa_valor_id, ocurrido_at = NEW.created_at)  → m.id
INSERT wallet_tienda_movimiento (debito 'fulfillment', monto, origen 'orden_fulfillment', m.id,
  fecha_movimiento = NEW.created_at, organizacion_id = NEW.organizacion_id)
si iva > 0: INSERT wallet_tienda_movimiento (debito 'iva_fulfillment', iva, …)
INSERT wallet_movimiento (ingreso 'ingreso_fulfillment', monto, origen 'orden_fulfillment', m.id, …)
si iva > 0: INSERT wallet_movimiento (ingreso 'ingreso_iva_fulfillment', iva, …)
```

**`fulfillment_al_cambiar_borrado()`** — `AFTER UPDATE OF "deleted_at" ON "orden" FOR EACH ROW WHEN
(OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at")`. Decide el ÚLTIMO movimiento de la orden, no
`OLD.deleted_at` (R27); la fila de la orden ya está bloqueada por el UPDATE, así que dos operaciones
sobre la misma orden se serializan:

```
ultimo := el de mayor secuencia de (NEW.organizacion_id, NEW.id); si no hay → RETURN   -- R28
eliminada y ultimo = cargo   → reverso causa 'eliminacion' (secuencia+1, mismo monto/iva/iva_pct/tienda/
                                tarifa_valor_id, ocurrido_at = NEW.deleted_at) + créditos 'fulfillment_anulado'
                                (+ 'iva_fulfillment_anulado' si iva > 0) a ultimo.tienda_id
                                + egresos 'egreso_reverso_fulfillment' (+ '_iva_'), fecha = NEW.deleted_at   -- R26, R31
viva y ultimo = reverso con causa 'eliminacion'
                             → cargo causa 'restauracion' (secuencia+1, MISMO monto/iva congelados,
                                ocurrido_at = now()) + débitos e ingresos como al crear                  -- R29
cualquier otro caso          → nada (incluye: eliminar una cancelada, cuyo último ya es reverso; y
                                restaurar una cancelada y eliminada, cuyo reverso es 'cancelacion_api')    -- R39
```

**`fulfillment_al_cancelar_por_api()`** — `AFTER INSERT ON "orden_historial_estado" FOR EACH ROW WHEN
(NEW."origen_tipo" = 'cancelacion_api')`. Detecta la cancelación por la fila de la bitácora y no por el
estado: la cancelación lleva la orden a `devolviendo_a_tienda`, un estado que también alcanza la
devolución real (#42), así que el estado no la distingue; la fila con `origen_tipo = 'cancelacion_api'`
sí, y su único productor es `OrdenRepository.cancelarViaApi` (verificado con Grep), que la escribe en
la MISMA transacción que el cambio de estado (`appendCambioEstado`). Bloquea la fila de la orden
(`SELECT … FOR UPDATE` sobre `orden` de `NEW.orden_id`) para serializarse con una eliminación
concurrente, y luego:

```
ultimo := el de mayor secuencia de (NEW.organizacion_id, NEW.orden_id); si no hay → RETURN   -- R28
ultimo = cargo → reverso causa 'cancelacion_api', ocurrido_at = NEW.created_at, mismas filas y categorías
                 que el reverso por eliminación, a ultimo.tienda_id                                  -- R30
otro caso      → nada (una segunda cancelación no es posible —`conflict`—, y si lo fuera no duplica) -- R39
```

**Des-cancelar (R40):** no existe. En `lib/types/order-status-transiciones.ts`, `devolviendo_a_tienda`
solo sale a `devuelta_a_tienda`, que es terminal. No se escribe ningún re-cobro por esa vía; la guardia
de T6.1 afirma que `TRANSICIONES.devolviendo_a_tienda` sigue siendo exactamente `[devuelta_a_tienda]`,
para que una arista nueva obligue a decidir su cobro.

Las filas de los libros llevan `origen_id` = id del movimiento: cada evento tiene su propia clave, así
que los únicos parciales existentes `(origen_tipo, origen_id, [tienda_id,] categoria)` de los dos libros
son la segunda barrera de idempotencia, y el único `(organizacion_id, orden_id, secuencia)` la primera.

`down.sql`: `DROP TRIGGER` × 3 y `DROP FUNCTION` × 3. No borra cobros (eso es M3).

### Por qué el trigger cumple cada requisito sin código de aplicación

- R15/D7: las tres vías acaban en `OrdenRepository.createManyOrdenes` / `createManyOrdenesConGuia`
  (`tx.orden.createMany`, verificado: no hay otro `INSERT INTO orden` en `lib/` ni `app/`); un camino
  nuevo también dispara el trigger.
- R23: `createMany … skipDuplicates` es `ON CONFLICT DO NOTHING`; un `AFTER INSERT FOR EACH ROW` solo
  corre por las filas insertadas. Duplicadas y omitidas no se cobran.
- R24: el trigger corre dentro de la sentencia; si la transacción se deshace, el cobro también.
- R26/R27/R29: los tres escritores de `deleted_at` (`softDelete`, `softDeleteViaApi`, `restore` en
  `OrdenRepository`) son `UPDATE … SET deleted_at`.
- R30/R39: la cancelación por API no toca `deleted_at`; la detecta el tercer trigger por su fila de
  bitácora, en la misma transacción. Cada reverso guarda su causa, y la restauración solo re-cobra tras
  un reverso por eliminación.
- R34: sin backfill; una orden anterior no tiene movimientos.

## 2. La marca «se recoge en tienda» (R1–R9)

Prisma `Usuario`: `seRecogeEnTienda Boolean @default(true) @map("se_recoge_en_tienda")` y el campo viejo
pasa a `fulfillmentRetirado Boolean @default(false) @map("fulfillment") /// SLT-94: no se lee ni se
escribe`. Renombrar solo el campo Prisma no toca la base (sin migración) y convierte cada lector olvidado
en un error de typecheck.

Inventario de lectores y escritores de la marca (verificado con Grep en el worktree) y su cambio:

| Archivo | Uso hoy | Cambio |
|---|---|---|
| `lib/repositories/OrdenRepository.ts` (`findUsuarioFulfillment`) | Lee la marca para `cargarMasiva`. | Pasa a `findUsuarioSeRecogeEnTienda` (`boolean \| null`); interfaz en `IOrdenRepository.ts`. |
| `lib/services/BulkOrdenService.ts` | `cargarMasiva`: `resolverDestinoCreacion(fulfillment)`. `cargarViaApi`: `tieneFulfillment(tarifa)` por orden. | Las dos: `resolverDestinoCreacion(!seRecoge)` con la marca de la tienda dueña (R5/R6). Por API todo el lote es de una tienda, así que hay un solo destino por lote; se retira el reparto en dos grupos por tarifa. |
| `lib/services/destino-creacion.ts` | Parámetro `fulfillmentDeLaTienda`. | Firma igual (`true` = nace en bodega); solo el comentario y el nombre del parámetro (`naceEnBodega`). |
| `lib/utils/ingreso-empresa.ts` (`tieneFulfillment`) | Predicado de nacimiento por API. | Se retira (sin llamadores tras el cambio); sus casos en `tests/unit/utils/ingreso-ordenex.test.ts` y `ingreso-empresa-modelo-nuevo.test.ts` se quitan. Corrige el comentario de cabecera (§FULFILLMENT) que dice que el monto decide dónde nace. |
| `lib/services/UsuarioService.ts` (`resolverFulfillment`) | Solo `adminTienda` puede tener `true`. | `resolverSeRecogeEnTienda`: solo `adminTienda` puede tener `false`; el resto, `true` (R4). |
| `lib/repositories/UserRepository.ts` | Select público, create, update + historial `usuario_fulfillment_cambiado`. | `seRecogeEnTienda`; el historial escribe `usuario_se_recoge_en_tienda_cambiado` (R8). La acción vieja queda en el enum para las filas históricas. |
| `lib/interfaces/repositories/IUserRepository.ts`, `lib/types/usuario.ts` (zod) | Campo `fulfillment`. | `seRecogeEnTienda` (borde validado con zod). |
| `app/(app)/configuracion/_components/UsuarioForm.tsx` | Switch «Esta tienda tiene fulfillment». | Switch «Se recoge en tienda» (R9). |
| `lib/repositories/PickingRepository.ts` + `IPickingRepository.ts` | SQL `t."fulfillment" = true`, selects. | `t."se_recoge_en_tienda" = false` (R7). El DTO conserva su campo booleano «con paquetes en bodega». |
| `lib/whatsapp-envios/informes/picking/{tipos,informe}.ts`, `lib/actions/informe-picking.ts` | Consumen ese booleano. | Sin cambio de lógica; textos fuera de alcance. |
| `lib/types/historial-accion.ts` | Catálogo, efecto y rótulo de `usuario_fulfillment_cambiado`. | + `usuario_se_recoge_en_tienda_cambiado` («Cambió si se recoge en tienda», `mueve_dinero`: decide dónde nace la orden). |
| `scripts/demo-qa/receta.ts`, `tests/fabricas/empresa-y-usuarios.ts` | Alta con `fulfillment: false`. | `seRecogeEnTienda: true`. |

Los demás `fulfillment` del árbol son el VALOR de la tarifa (cotización, costo API, `cierre_detail`,
analítica de productos, columna «Fulfillment» del listado) y no cambian.

## 3. Restricción del valor de fulfillment (R10–R14)

- `lib/tarifas/niveles.ts` (`nivelDeValor`): para `tienda_fulfillment`, solo `tienda_general`; otro
  nivel → rechazo sobre `zonaId` (o `grupoId`) «El fulfillment solo se configura como precio propio de
  la tienda» (R10).
- `lib/services/TarifaValorService.ts` (o `escrituraValorSchema` en `lib/types/tarifa-flexible.ts`):
  `tienda_fulfillment` con `modo = porcentaje` → `validation_error` sobre `modo` (R11).
- Base: CHECK `NOT VALID` de M3 (R12).
- Resolución única (R14, R33): `lib/tarifas/precedencia.ts` (`rangoCobro`) devuelve `null` para una
  fila `tienda_fulfillment` que no sea rango 3, y `lib/repositories/_shared/resolver-tarifas.ts`
  descarta las de modo `porcentaje` para ese concepto. Así cotización, costo API, listado, snapshot del
  cierre y el trigger leen el mismo valor. En producción no cambia nada (0 filas).
- Pantalla (`app/(app)/configuracion/tarifas/_components/`): `TarifasValores.tsx` no pinta la fila
  `tienda_fulfillment` en zona ni grupo; en el precio propio de la tienda (`TarifasTiendas.tsx`) la pinta
  sin selector de modo (siempre monto) y con su % de IVA; `tarifas-textos.ts` (`conceptosDeActor` /
  `modoPorDefecto`) es donde vive la regla de qué conceptos y modos se ofrecen por nivel (R13).
- Autorización: igual que hoy (`maestro` escribe, `maestro`/`admin` leen, en el service).

## 4. Registros de TypeScript que cambian por las categorías nuevas

Los `Record` totales sobre las categorías hacen que no compile hasta decidirlas. Valores:

| Registro | `fulfillment` / `iva_fulfillment` | `fulfillment_anulado` / `iva_fulfillment_anulado` | caja |
|---|---|---|---|
| `lib/types/wallet-tienda.ts` (`WALLET_TIENDA_MOVIMIENTO_CATEGORIA_SEED`) | + | + | — |
| `lib/types/wallet.ts` (`WALLET_MOVIMIENTO_CATEGORIA_SEED`, `WALLET_ORIGEN_TIPO_SEED`, `WALLET_INGRESO_IVA_SEED`, `WALLET_EGRESO_IVA_SEED`, `WALLET_IVA_SEED`, `WALLET_INGRESO_GANANCIA_SEED`, composición) | — | — | + las 4 y `orden_fulfillment` |
| `lib/utils/invariante-tiendas.ts` | débito → `ingreso_fulfillment` / `ingreso_iva_fulfillment` | crédito → `egreso_reverso_fulfillment` / `egreso_reverso_iva_fulfillment` | — |
| `lib/utils/caja-tesoreria.ts` | — | — | las 4 `propio`, liquidez `cargo_a_tienda` (como `ingreso_flete` y `egreso_reverso_flete_devolucion`) |
| `lib/utils/aporte-por-orden.ts` | `sin_reparto` / `no_nace_de_un_cierre` | ídem | ídem |
| `lib/constants/wallet-rotulos.ts`, `lib/utils/estado-cuenta-chips.ts`, `lib/utils/desglose-tienda.ts`, `lib/utils/estado-cuenta.ts`, `lib/utils/efecto-movimiento.ts` | «Fulfillment», «IVA del fulfillment» | «Devolución de fulfillment», «Devolución del IVA del fulfillment» | rótulos de caja |
| `lib/services/OrigenLegibleService.ts` | — | — | `orden_fulfillment` → «Orden» + guía (o remisión si no tiene) vía `orden_fulfillment_movimiento.orden_id` |
| `lib/analytics/metrics.ts` | `cuenta_por_pagar_tienda` + 4 | | `ingreso_iva` + 2 IVA; `ganancia_empresa` + `ingreso_fulfillment`, `egreso_reverso_fulfillment`; `dinero_en_caja` + 4 (R37) |
| `app/(app)/mi-wallet/_components/mi-wallet-labels.ts`, `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts`, `app/(app)/wallet/_components/ComposicionGananciaCard.tsx` | rótulos | rótulos | fila «Fulfillment» neto en la composición |

`lib/utils/mapeo-concepto-tienda.ts` NO cambia: es el espejo de los 6 conceptos del cierre y el
fulfillment no sale del cierre (R32). `WalletTiendaFeedService` / `WalletFeedService` / `asentarCierreDia`
no cambian.

## 5. Lo que no cambia y las guardias

- `fulfillment-fuera-de-la-formula.guardia.test.ts`: sin cambios y en verde (R32).
- Guardia nueva `tests/unit/guards/fulfillment-solo-al-crear.guardia.test.ts`: (a) ningún archivo de
  `lib/` nombra las categorías nuevas en un `crearMovimientos` (el único escritor es el trigger); (b) el
  campo Prisma `fulfillmentRetirado` y el SQL `"fulfillment" = ` sobre `usuario` no aparecen en `lib/`
  ni `app/`; (c) `resolverDestinoCreacion(` solo recibe la marca (no `tieneFulfillment`); con
  autocomprobación sobre material sintético que infringe.
- `caja-clasificacion-459.guardia` y `metrics-caja-naturaleza` deben quedar verdes con los pares nuevos.
- Cotización (`CotizacionOrdenService`) y costo API (`api-orden-costo.ts`, `ApiOrdenLecturaService`,
  `desgloseCargaApi`) no cambian de código (R33).

## 6. Multi-empresa, autorización y país

- `orden_fulfillment_movimiento` con `organizacion_id`, RLS, único por empresa y triggers de misma
  empresa. El trigger lee activación y valor filtrando por `NEW.organizacion_id` explícitamente (es
  SECURITY DEFINER: la RLS no lo frena) (R38). Test de integración con dos empresas.
- El cobro no tiene actor ni módulo propio: lo hereda de quien crea o elimina la orden, que ya pasa
  por su autorización (carga: `adminTienda`/API key; eliminar: `EliminarOrdenService` /
  `ApiOrdenEliminacionService`; restaurar: `RecuperarOrdenService`, solo `maestro`; cancelar:
  `ApiOrdenCancelacionService`, dueño de la key).
- País: el monto está en la moneda de la empresa y el IVA sale de `tarifa_valor.iva_pct`, que fija la
  empresa. Ningún literal de impuesto ni moneda.

## 7. Desviación consciente de la arquitectura

`docs/checkpoints-proyecto.md` pide la lógica en `lib/services/`. Aquí vive en la base, con el mismo
argumento y precedente que SL-40 (en producción desde el 2026-10-23): «por cualquier vía» por
construcción, misma transacción y cero escritura posible desde la app. La aritmética duplicada
(`round` de Postgres = HALF_UP de `ivaDe` para positivos) se fija con un test que compara las dos para
valores de borde (…,005).

## 8. Alternativas descartadas

1. **Cobrar desde código en cada camino** (`OrdenRepository.createManyOrdenes*` y los tres escritores
   de `deleted_at`, llamando a un `FulfillmentCobroService` dentro de su transacción). Es el patrón de
   las fichas 461/458-B y deja la lógica en TypeScript, pero son seis puntos que mantener sincronizados
   y el brief exige encontrar TODOS los caminos: un camino futuro que olvide la llamada crea órdenes sin
   cobro y en silencio. SL-40 descartó lo mismo por la misma razón.
2. **Renombrar la columna `fulfillment` invirtiendo su significado** (o solo cambiar el rótulo de la
   UI). Cero migración de datos, pero el nombre seguiría diciendo lo contrario de lo que guarda, y la
   contradicción «fulfillment = marca / fulfillment = cobro» es justo lo que esta ficha resuelve.
   Recomendación del leader y decisión D4.
3. **Filas de los libros con `origen_id` = id de la orden, sin registro propio.** Más simple, pero el
   único `(origen_tipo, origen_id, categoria)` impide un segundo cobro tras restaurar (R29) y una
   segunda devolución tras otra eliminación, y no deja dónde congelar `iva_pct` y `tarifa_valor_id`.
4. **Cobrar al aprobar el cierre** (meterlo en `derivarIngresoOrden`). Rechazado por D2 (al crear, sin
   depender de la gestión) y rompería la frontera que vigila la guardia de la ficha 449.
5. **Detectar la cancelación por el cambio de estado** (`AFTER UPDATE OF estatus_id` hacia
   `devolviendo_a_tienda`). Ese destino también lo alcanza la devolución real (#42), que no devuelve el
   cobro; el estado no distingue la causa y la bitácora sí (`origen_tipo = 'cancelacion_api'`).
6. **Borrar en la migración los valores de fulfillment inválidos de dev** (zona, grupo o %) para que el
   CHECK sea `VALID`. Prohibido por el brief (no borrar filas); se dejan inertes (R14) y el CHECK
   `NOT VALID` protege todo lo nuevo.

## 9. T0 — consultas de SOLO LECTURA para re-medir en producción antes del merge

Las corre el humano (resultado del 2026-11-08 en `requirements.md > T0`). Ninguna escribe.

```sql
-- T0.1 migraciones sin terminar (debe ser 0)
SELECT count(*) FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL;

-- T0.2 marca vieja por rol (define el backfill: cuántos quedarán «no se recoge»)
SELECT r."value" AS rol, u."fulfillment", count(*)
  FROM "usuario" u JOIN "rol" r ON r."id" = u."rol_id"
 GROUP BY 1, 2 ORDER BY 1, 2;

-- T0.3 empresas con el modelo nuevo activado
SELECT count(*) AS empresas_activadas FROM "tarifa_activacion";

-- T0.4 valores de fulfillment del modelo nuevo por nivel y modo (inválidos = los que R14 ignora)
SELECT (tv."tienda_id" IS NOT NULL) AS tienda, (tv."zona_id" IS NOT NULL) AS zona,
       (tv."grupo_id" IS NOT NULL) AS grupo, tv."modo",
       count(*) AS filas, count(*) FILTER (WHERE tv."valor" > 0) AS con_valor,
       count(*) FILTER (WHERE ta."id" IS NOT NULL) AS en_empresa_activada
  FROM "tarifa_valor" tv
  LEFT JOIN "tarifa_activacion" ta ON ta."organizacion_id" = tv."organizacion_id"
 WHERE tv."concepto" = 'tienda_fulfillment'
 GROUP BY 1, 2, 3, 4;

-- T0.5 cruce marca × cobro: tiendas que se COBRARÁN desde el despliegue
SELECT u."fulfillment" AS marca_vieja, count(*) AS tiendas_que_se_cobraran
  FROM "tarifa_valor" tv
  JOIN "tarifa_activacion" ta ON ta."organizacion_id" = tv."organizacion_id"
  JOIN "usuario" u ON u."id" = tv."tienda_id"
 WHERE tv."concepto" = 'tienda_fulfillment' AND tv."zona_id" IS NULL AND tv."grupo_id" IS NULL
   AND tv."modo" = 'monto' AND tv."valor" > 0
 GROUP BY 1;

-- T0.6 modelo viejo con fulfillment > 0 (no se cobra, D8; solo para saberlo)
SELECT count(*) FROM "tarifas" WHERE "fulfillment" > 0;

-- T0.7 órdenes vivas por marca de su tienda y estado actual
SELECT u."fulfillment" AS marca_vieja, os."value" AS estado, count(*)
  FROM "orden" o JOIN "usuario" u ON u."id" = o."tienda_id"
  JOIN "order_status" os ON os."id" = o."estatus_id"
 WHERE o."deleted_at" IS NULL
 GROUP BY 1, 2 ORDER BY 1, 2;

-- T0.8 órdenes creadas en las últimas 24 h (ventana de despliegue)
SELECT count(*) FROM "orden" WHERE "created_at" > now() - interval '24 hours';

-- T0.9 cierres por modelo (deben seguir intactos)
SELECT "tarifa_modelo", count(*) FROM "cierre_detail" GROUP BY 1;
```

Criterio para seguir: T0.1 = 0 y T0.5 = 0 filas (nadie se cobra al desplegar) o, si T0.5 > 0, que
Carlos lo confirme antes del merge. Tras desplegar, la misma T0.9 y un conteo de
`orden_fulfillment_movimiento` (debe ser 0 hasta que una empresa activada tenga valor).

## 10. Dependencias

Ninguna librería nueva.

## 11. Riesgos

- **Cobro en masa por error de configuración:** el cobro empieza en cuanto una empresa activada guarda
  un valor > 0. Mitigación: T0.5 antes del merge; el valor solo lo escribe `maestro` y queda en el
  historial.
- **Choque con #97 en `schema.prisma` y migraciones del mismo día:** timestamps `20261108…` posteriores
  a la última migración de `dev` (`20261107130100`); rebase sobre `dev` antes del PR.
- **`node_modules` compartido / `prisma generate`:** regenerar el cliente en el worktree tras M1–M3.
