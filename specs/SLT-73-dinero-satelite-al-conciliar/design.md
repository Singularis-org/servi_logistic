# SLT-73 — Diseño

## Lo que ya existe

**Términos buscados.** «al conciliar», «conciliar … wallet/caja», «ganancia … satélite»,
«satélite … comisión/tarifa», `paraLaCentral`, `saldoDe`, `marcarConciliado`.

**Dónde.**
- `feature_list.json`, por `name` y `description`. No hay otra ficha que difiera el dinero de la
  satélite.
- `specs/`.
- El código, con Grep/Read: el MCP no tiene indexado este worktree; `list_projects` no lo lista.

**Qué apareció y qué se reutiliza.**

| Qué | Dónde | Uso aquí |
|---|---|---|
| Ficha 431: conciliación por consolidación. Su R14 dice «no escribe en ningún libro de dinero» | `lib/repositories/CierresBodegaAdminRepository.ts:518-717`, `specs/431-cierres-satelite-autonomos/` | Se **reabre** (D9). Se reutiliza la marca, la corrección y la reversión con sus guardas y su historial |
| `paraLaCentral` = general − pago a mensajeros − ganancia de la satélite por rechazos (393) | `lib/utils/ingreso-empresa.ts:681-690` | Es **la** fórmula del aporte (R4) y del esperado (R8). No se escribe otra |
| `saldoDe(efectivo, recibido)`, la fórmula única de 431 | `lib/utils/conciliacion-satelite.ts:39-44` | Cambia el minuendo: `paraLaCentral` en vez de `total_efectivo` (D3). Sigue siendo una sola función con dos lectores |
| Los cinco escritores de dinero de la aprobación (42, 43, 173, 44, 158) | `lib/repositories/CierresAdminRepository.ts:1891-1953` | Se **extraen** tal cual a una función compartida y se llaman desde la aprobación (central) y desde la marca (satélite) |
| Idempotencia por `(origen_tipo, origen_id, categoria)` | migración `20260712160000_wallet_movimiento` | Sostiene R12: re-intentar no duplica |
| Snapshot `total_ingreso_bodega_rechazos` (56) | `db/schema.prisma:1598,1657`, `lib/utils/ingreso-bodega.ts:18` | Es la ganancia de la satélite (D7) |
| Precedente de una migración de datos que borra filas de caja con respaldo | `db/migrations/20260926120200_cobro_tienda_461_completar_caja/down.sql:34` | Se usa el mismo molde para retirar filas (R16/R19) |

No hay duplicado: esta ficha cambia de forma explícita una decisión de la 431, y la cambia el humano.

## 1. Modelo de datos

### 1.1 Enums (migración A, `20261031140000_slt73_diferencia_satelite_enums`)

Va aparte porque `ALTER TYPE … ADD VALUE` no se puede usar en la misma transacción que lo usa.

- `WalletOrigenTipo` + `conciliacion_bodega_ajuste`.
- `WalletMovimientoCategoria` + `egreso_diferencia_satelite` y `ingreso_diferencia_satelite`.
- `down.sql`: Postgres no hace `DROP VALUE`. El down recrea los dos tipos sin los valores, con el
  molde de las migraciones de enums anteriores (`20261024130000_pago_plataforma_categoria/down.sql`).
  Antes, borra cualquier fila que los use.

### 1.2 Tabla `conciliacion_bodega_ajuste` (migración B, `20261031140100_slt73_ajuste_conciliacion`)

Es una fila por **evento** que movió la diferencia (marca o corrección). Es append-only y sirve de
`origen_id` del movimiento de diferencia. Hace falta porque el único de la caja no admite dos
diferencias para la misma consolidación con el mismo origen.

| columna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `organizacion_id` | uuid NOT NULL FK `organizacion` | SL-17, RLS `conciliacion_bodega_ajuste_por_empresa` y trigger de misma empresa (R21) |
| `cierre_bodega_id` | uuid NOT NULL FK `cierre_bodega` RESTRICT | |
| `evento` | text CHECK IN (`marca`,`correccion`) | |
| `monto_esperado` | Decimal(12,2) NOT NULL | `paraLaCentral` de la consolidación, con signo |
| `monto_recibido` | Decimal(12,2) NOT NULL | |
| `diferencia` | Decimal(12,2) NOT NULL, CHECK ≠ 0 | lo que se asienta en ESTE evento (delta), con signo |
| `creado_por` | uuid NOT NULL FK `usuario` | |
| `created_at` | timestamptz default now() | |

- Índices: `(cierre_bodega_id)` y `(organizacion_id)`.
- Se clasifica en `lib/db/modelos-de-negocio.ts`; si no, la guardia `organizacion-en-modelos` se
  pone en rojo.
- Se actualiza `wallet_movimiento_tipo_categoria_check`: egreso ↔ `egreso_diferencia_satelite` e
  ingreso ↔ `ingreso_diferencia_satelite`.
- Se añade al CHECK de origen, si existe para la categoría (verificar en T1), que las dos solo van
  con origen `conciliacion_bodega_ajuste`.
- `NATURALEZA_POR_CATEGORIA` (`lib/utils/caja-tesoreria.ts`) clasifica las dos como **tesorería**,
  como `ingreso_cod_recaudado`: es dinero de terceros que no llegó, no ganancia ni gasto.
- `down.sql`: borra las filas de caja con ese origen, y después hace `DROP TABLE` y quita las
  ramas del CHECK.

### 1.3 Migración de datos (migración C, `20261031140200_slt73_retirar_asientos_satelite`)

Todas las migraciones son > `20261031130000`, la última de `origin/prod` y `origin/dev`.

1. Se define el conjunto `S`: los cierres con `destino_tipo='bodega_satelite'` y
   `estado='aprobado'`, y además `cierre_bodega_id IS NULL` o una consolidación con
   `conciliado_at IS NULL`.
2. **Guarda R18.** Si existe `liquidacion_pago` con `cierre_id ∈ S`, se lanza `RAISE EXCEPTION`
   con el conteo y no se cambia nada.
3. Se crea el esquema `respaldo`, que no es el de Prisma: Prisma solo mira `public`, así que no
   genera drift. `servi_app` no tiene `USAGE` sobre él. Ahí va la tabla
   `respaldo.slt73_asientos(tabla text, fila jsonb, PRIMARY KEY (tabla, (fila->>'id')))`.
4. Se copian a ese respaldo las filas con `origen_tipo='cierre_dia' AND origen_id ∈ S` de
   `wallet_movimiento`, `wallet_tienda_movimiento` y `pago_mensajero_movimiento`, como
   `to_jsonb(t)`. Después se hace `DELETE` de esas mismas filas, filtrando por **el mismo** `id`
   del respaldo.
5. `down.sql`: `INSERT INTO <tabla> SELECT * FROM jsonb_populate_record(NULL::<tabla>, fila)` por
   tabla, con `ON CONFLICT DO NOTHING`. Si el asiento ya se re-escribió al conciliar, no se
   duplica. Después, `DROP SCHEMA respaldo CASCADE`.

En prod, `S` = 1 cierre y salen 6 filas de caja, más sus filas de tienda y de mensajero. **El
repo no lleva ningún id ni nombre de prod**: la migración filtra por predicado.

**El `DELETE` en un libro append-only.** Se acepta solo en esta migración y con respaldo, por la
alternativa 2 de abajo. El código de la app sigue sin `delete` ni `update` sobre los libros.

## 2. Código

### 2.1 Escritor compartido: `lib/repositories/_shared/asientos-cierre-dia.ts`

```ts
asentarCierreDia(tx, cierreId, deps?: AsientosCierreDiaDeps): Promise<void>
```

- Es el bloque de `CierresAdminRepository.ts:1891-1953` **movido sin cambios**, en el mismo
  orden. El orden importa: la 173 lee el libro por tienda y la 158 lee la indemnización ya escrita.
- `deps` lleva por defecto las implementaciones reales: los feeds sin estado y los repos
  construidos sobre `tx`. Sigue el molde de `CAJA_COD_FEED` (`CierresAdminRepository.ts:173`).
  Así, un llamador que no inyecta no deja un camino mudo (memoria: el composition root que no
  inyecta).

### 2.2 Aprobación (`CierresAdminRepository.resolverCierre`)

- Dentro de `res.count === 1 && aprobado`, la persistencia de indemnizaciones (no es dinero, R2)
  sigue igual.
- Después se lee `destinoTipo` del cierre **dentro de la tx**, y solo
  `if (destinoTipo === "bodega_central")` se llama a `asentarCierreDia` (R1/R3).
- Lo demás (liberación, devoluciones, aplicación de gestiones) no cambia.
- Los repos y feeds que ya se inyectan por constructor se pasan como `deps`, para no romper los
  dobles de test existentes.

### 2.3 Marca (`CierresBodegaAdminRepository.marcarConciliado`)

Después del `updateMany` guardado, con `count === 1` y en la misma tx:

1. `cierres = tx.cierreDia.findMany({ where: { cierreBodegaId: id, estado: "aprobado",
   destinoTipo: "bodega_satelite" }, select: { id } , orderBy: { solicitadoAt: "asc" } })`.
2. Por cada uno, `asentarCierreDia(tx, c.id, this.asientos)`, que es idempotente por el único (R10, R12).
3. Se lee el snapshot de la consolidación y se calcula
   `esperado = paraLaCentral(totalGeneral, totalPagoMensajero, totalIngresoBodegaRechazos)`.
4. `objetivo = esperado − recibido`. `yaAsentado = Σ conciliacion_bodega_ajuste.diferencia` de esa
   consolidación. `delta = objetivo − yaAsentado`.
5. Si `delta ≠ 0`, se crea la fila de ajuste (`evento='marca'`) y **un** movimiento de caja: si
   `delta > 0`, `egreso_diferencia_satelite` por `delta`; si es negativo, `ingreso_diferencia_satelite`
   por `|delta|`. Origen `conciliacion_bodega_ajuste` y la fila del ajuste (R11, R15).
6. Lo sigue el `appendAccion` de siempre.

### 2.4 Corrección (`corregirConciliacion`)

Mismo paso 3-5 con `evento='correccion'` y el nuevo recibido. No vuelve a llamar a
`asentarCierreDia`: los asientos ya están (R13).

### 2.5 Reversión (`revertirConciliacion`), sujeta a Q2

- Antes del `updateMany` se cuenta si hay asientos: filas de caja con `origen_tipo='cierre_dia'` y
  `origen_id ∈` los cierres de la consolidación.
- Si hay, devuelve `"con_asientos"`. Es un desenlace nuevo de `MarcaConciliacionResult`.
- `ConciliacionSatelitesService.revertirConciliacion` lo traduce a `{ status: "con_asientos" }`, y
  la acción y la UI muestran «Ya entró a la caja: corrige el monto en vez de revertir» (R14).

### 2.6 Constructor de `CierresBodegaAdminRepository`

`constructor(prisma, asientos: AsientosCierreDiaDeps = ASIENTOS_POR_DEFECTO)`. Las dos
construcciones de producción (`lib/actions/conciliacion-satelites.ts:60` y
`lib/actions/cierre-bodega.ts:81`) caen en el default real. Un test lo comprueba mirando las
filas, no el import.

### 2.7 Saldos (`SaldosSatelitesRepository`)

- `ClienteSaldosSatelites` añade `cierreDia`.
- En `componerSaldos` entran dos agregaciones nuevas sobre `cierre_dia`, ambas con
  `{ estado: "aprobado", destinoTipo: "bodega_satelite", destinoZonaId: { in: zonaIds } }`, más
  `organizacion` por la extensión:
  - **(d) los aportes**: `groupBy destinoZonaId`, `_sum` de `totalGeneral`, `totalPagoMensajero` y
    `totalIngresoBodegaRechazos`;
  - **(e) los aportes sin consolidar**: lo mismo con `cierreBodegaId: null`, más `_count`.
- `deuda = paraLaCentral(Σd) − Σ monto_recibido` (el recibido sale de la agregación (a) que ya
  existe) (R5).
- El DTO `SaldoSateliteDTO` gana `aporteSinConsolidar` y `cierresSinConsolidar`;
  `saldoSinConciliar` pasa a ser la deuda (R6).
- `findResumen` recorre las mismas dos fuentes y suma la deuda por zona, así que
  `bodegasConPendiente` cuenta las zonas con deuda ≠ 0. `pendienteTotal` = Σ deudas (R7).
- `toConsolidacionDTO` y `CierreBodegaRepository.toBodegaResumenRow:136` calculan
  `faltaPorRecibir = saldoDe(paraLaCentral(...), montoRecibido)` (R8).
- `ConsolidacionSateliteDTO` gana `pagoMensajero`, `gananciaSatelite` y `paraLaCentral` (R9).
- `saldoDe` cambia de firma de parámetro (`esperado` en vez de `efectivo`) y su docstring dice que
  D3 reabrió la Q2 de la 431.

### 2.8 UI

- `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`: añade la cascada por
  consolidación (R9) con los rótulos de la 393, «Pago a mensajeros», «Gana la satélite» y «Para
  la central», y el desenlace `con_asientos` (R14).
- `SaldosSatelitesTable.tsx`: añade la columna «Sin consolidar» (R6).
- `saldos-satelites-descarga-columnas.ts`: añade las columnas nuevas.
- Toda resta viene hecha del servidor.

## 3. Autorización, multi-empresa y país

- El guard `esAccesoTotal` va primero, sin cambio (R23).
- Las lecturas y escrituras pasan por la extensión de empresa. La tabla nueva tiene RLS
  (R21).
- Moneda: los importes son `Decimal(12,2)` sin moneda fija. Los métodos de pago (efectivo, SINPE,
  transferencia) son los snapshots que ya existen; esta ficha no añade ninguno.

## 4. Alternativas descartadas

1. **Asientos por consolidación con origen `cierre_bodega`**, agregados por categoría en vez de por
   `cierre_dia`. Descartada: duplicaría las fórmulas de los cinco feeds y cambiaría los orígenes que
   leen la analítica, la descarga del libro y el estado de cuenta. Con el origen `cierre_dia`, un
   cierre satélite conciliado queda **igual** que uno de la central.
2. **Revertir lo de prod con contra-asientos en vez de `DELETE`.** Descartada: dejaría ocupada la
   clave `(cierre_dia, id, categoria)`, y al conciliar `skipDuplicates` tiraría el asiento nuevo
   en silencio (es la trampa que documenta `WalletOrigenTipo.ranking_snapshot_fila`). El dinero no
   entraría nunca.
3. **Prorratear lo recibido entre los conceptos (Q1-B).** Descartada como recomendación: rompe la
   identidad de la 173 (COD de la caja = COD acreditado a tiendas) y obliga a decidir qué tienda
   cobra menos.
4. **Escribir los asientos al consolidar** (`crearCierreBodega`). Descartada: consolidar no dice
   que el dinero llegó, y D2 lo ata a la conciliación.

## 5. Dependencias de terceros

Ninguna nueva.

## 6. Trazabilidad R → test

Todo SQL o `WHERE` de dinero se prueba con integración contra Postgres real (memoria «probar el
WHERE donde vive»). Cada test debe crear sus propios datos y fallar si no los encuentra (sin
`if (!x) return`).

| R | Test | Mutaciones que debe matar |
|---|---|---|
| R1 | `tests/integration/db/slt73-aprobar-satelite-sin-asientos.int.test.ts`: aprobar un satélite deja 0 filas nuevas en los 3 libros | quitar el `if destinoTipo`; invertirlo; leer `destinoTipo` fuera de la tx |
| R2 | mismo archivo: estado, `gestion_orden.indemnizacion`, liberación y devolución iguales que en central | mover la persistencia de indemnización dentro del `if` |
| R3 | `tests/integration/db/slt73-aprobar-central-igual.int.test.ts`: las filas de un central coinciden con un literal (no contra el feed) | cambiar `bodega_central` por `!== bodega_satelite` con otro valor; saltarse un feed |
| R4 | `tests/unit/utils/cascadas-cierre-bodega.test.ts` (ampliado) + R5 | |
| R5 | `tests/integration/db/slt73-deuda-satelite.int.test.ts`: casos sin consolidar, consolidado sin conciliar, conciliado parcial, rechazado, SINPE puro, aporte negativo y otra zona | quitar `estado: aprobado`, `destinoTipo`, `destinoZonaId`; usar `totalEfectivo`; omitir el recibido; incluir las rechazadas en el recibido |
| R6 | mismo archivo + `tests/components/SaldosSatelitesTable.test.tsx` (nuevo): la fila prod-like (todo SINPE, sin consolidar) no sale «al día» | `cierreBodegaId: null` → quitado |
| R7 | mismo int: Σ filas = cabecera; `bodegasConPendiente` | sumar con otra fórmula |
| R8 | `tests/integration/db/saldo-satelites.int.test.ts` (actualizado) + `tests/unit/repositories/cierre-bodega-repository.test.ts` | volver a `totalEfectivo` en uno de los dos lectores |
| R9 | `tests/components/ConciliacionSateliteCascada.test.tsx`: lee lo pintado (molde 359) | quitar una línea; restar en cliente |
| R10 | `tests/integration/db/slt73-marcar-asienta.int.test.ts`: tras marcar, las filas de los 3 libros = literal esperado; incluye un cierre satélite **no** incluido en la consolidación, que no se asienta | quitar `cierreBodegaId: id`; quitar `destinoTipo`; omitir un feed |
| R11 | mismo archivo: recibido < esperado → una fila egreso por la diferencia; recibido > esperado → ingreso; igual → ninguna | invertir el signo; usar `totalEfectivo` como esperado; omitir `ingresoBodegaRechazos` |
| R12 | mismo archivo: re-marcar tras fallo simulado y doble llamada sin duplicados; un fallo de un feed hace rollback de la marca | quitar `skipDuplicates`; sacar la escritura de la tx |
| R13 | `tests/integration/db/slt73-corregir-diferencia.int.test.ts`: corregir 485 → 500 → 490 deja 3 filas de ajuste cuyo neto = esperado − 490 | recalcular sin `yaAsentado`; actualizar la fila previa |
| R14 | `tests/integration/db/marca-conciliacion.int.test.ts`: **se reemplaza** el caso «R14 de la 431: no escribe libros» por «revertir con asientos → `con_asientos`, nada cambia», más el unit de servicio y de acción | quitar el conteo previo |
| R15 | slt73-corregir: cada ajuste tiene `creado_por`, `evento`, `monto_esperado` y `monto_recibido` | |
| R16–R19 | `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts`: siembra central, satélite sin consolidar, satélite consolidado sin conciliar y satélite conciliado. Aplica up y verifica; aplica down y compara el blob de filas con lo de antes. Caso `liquidacion_pago` → aborta | quitar `conciliado_at IS NULL`; quitar `destino_tipo`; borrar por `origen_id` en vez de por `id` del respaldo; quitar el `RAISE` |
| R20 | slt73-marcar-asienta: tras la migración, marcar re-escribe las filas | |
| R21 | guardia `organizacion-en-modelos` + int de RLS de la tabla nueva | |
| R22 | slt73-marcar-asienta: `fecha_movimiento` ≥ instante de la marca | pasar `fechaMovimiento` de la aprobación |
| R23 | `tests/unit/services/conciliacion-satelites-service.test.ts` (existente) | |

Los tests existentes que afirman que aprobar un **satélite** escribe en la caja se ajustan; los de
central no se tocan. El implementer los censa en T3.
