# SLT-123 «Pago al mensajero independiente del efectivo» — design

> Escrito por spec_author el 2026-11-12. Requisitos: `requirements.md` (R310-R338). El grafo de código
> no tiene indexado este worktree (`index_status`: proyecto no encontrado); la exploración se hizo con
> Grep/Read sobre el worktree, al día con `dev` (790372a9).
>
> **Partido el 2026-11-12 (D8, D13).** SLT-123 es la rebanada «Central». Las partes marcadas
> **[SLT-139]** son de SLT-139 «Pago al mensajero independiente del efectivo: satélite»: se quedan
> aquí como diseño de referencia para su spec, no se implementan en esta ficha. Lo que cambia en
> SLT-123 por el corte está en §2 (la marca solo en la central), §3 (una sola migración, solo la
> columna), §4.1, §5.1 y la nueva §13 (cómo se comporta la satélite entre los dos merges).

## Lo que ya existe

Buscado en `feature_list.json`, `specs/` y el código: `min(P`, `calcularSplitPago`,
`derivarPendienteCierre`, `pagadoVigente`, `pago_efectivo`, `Central debe` / `centralDebe`,
`repartirEfectivo`, `pago_satelite`, `pago_independiente`, «del efectivo», «Pago entregado».

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| La regla `min(P, E)`, fuente única | `lib/utils/cuenta-por-pagar.ts > calcularSplitPago` (feature 44) | Se reutiliza tal cual para los cierres viejos. No se toca. |
| Lo pendiente de un cierre | `lib/utils/pendiente-cierre.ts > derivarPendienteCierre` (172, 293) | Se amplía su entrada (objeto obligatorio, como hizo la 293) con la marca y lo pagado por la satélite. Sigue siendo la única función. |
| El feed del libro del mensajero | `lib/services/WalletMensajeroFeedService.ts` | Se ramifica por la marca y el destino. |
| Los asientos de un cierre (aprobación central y conciliación satélite) | `lib/repositories/_shared/asientos-cierre-dia.ts > asentarCierreDia` (SLT-73) | No cambia: ya llama al feed en los dos momentos. |
| La aprobación | `CierresAdminRepository.resolverCierre` (`updateMany` de `:2393`) | Es el único camino a `aprobado` que se encontró; ahí se fija la marca (T0.1 lo confirma). |
| Patrón «marca en el cierre con DEFAULT, los viejos no se tocan» | `cierre_dia.sin_gestion_registrado` (feature 264) | Mismo tipo de columna. Aquí con `DEFAULT false` y sin backfill (ver §2). |
| Valor de enum nuevo + CHECK + `down.sql` dinámico | `db/migrations/20261030120000_incentivo_mensajero_enums` y `…120100_incentivo_mensajero_checks` (SLT-68) | Se copia el molde: enum sola en una migración, CHECK en la siguiente, función de reversión dinámica con precondición ruidosa. |
| Reparto del efectivo en la consolidación | `CierreBodegaService.repartirEfectivo` (feature 40) | Se reutiliza tal cual, alimentado solo con los cierres viejos. |
| Lecturas en lote por cierre para lo pendiente | `sumarVigentesPorCierre`, `sumarPremiosVivosPorCierre` (SLT-137 R165) | Se añade una tercera con el mismo molde: `sumarPagadoSatelitePorCierre`. |
| Alcance de pago (central solo `bodega_central`) | SLT-122 (done) | No se toca (D7). |
| Investigación de quién paga al mensajero de satélite | `progress/investigacion_SLT-122.md` (opción D) | Es la base de la parte de satélite. |
| Tarjetas de ganancia del mensajero | SLT-112 (pending) | No existen: no se tocan (PA5). |

Ninguna ficha ni spec resuelve ya lo que pide esta. SLT-73 Q4 lo dejó abierto («por defecto no
cambia»); SLT-122 cerró quién puede pagar, no cuánto se debe.

## 1. La solución en una tabla

| | Cierre viejo (marca `false`) | Cierre nuevo central (SLT-123) | Cierre nuevo satélite **[SLT-139]** |
|---|---|---|---|
| Libro al asentar | `pago_devengado = P`, `pago_efectivo = min(P,E)` | `pago_devengado = P` | `pago_devengado = P`, `pago_satelite = P` |
| Cuándo se asienta | aprobar (central) / conciliar (satélite) — igual que hoy | al aprobar | al conciliar |
| Caja | `egreso_pago_mensajero = P` (igual) | igual | igual |
| Pendiente del cierre | `(P − min(P,E)) + premios − vigentes` | `P + premios − vigentes` (SLT-139 resta además `pagadoSatélite`, que aquí siempre es 0) | `P + premios − vigentes − pagadoSatélite`; `P` antes de conciliar, `0.00` después |
| «La central debe» | reparto del efectivo, como hoy | — | aporta 0 |

Con SLT-123 sola, todo cierre de satélite es viejo (columna 1), también los que se aprueben después
del despliegue (§13).

## 2. La marca: `cierre_dia.pago_independiente_efectivo`

**Modelo.** `pagoIndependienteEfectivo Boolean @default(false) @map("pago_independiente_efectivo")` en
`CierreDia`. `NOT NULL DEFAULT false`. Sin índice: nunca se filtra por ella en una consulta; se lee
junto al resto de columnas del cierre.

**Quién la escribe (SLT-123, R310).** Solo `CierresAdminRepository.resolverCierre`, dentro de la misma
transacción que aprueba, en la rama `res.count === 1 && nuevoEstado === "aprobado"`, justo después de
leer el destino (el `findUnique` de `:2444`, que ya existe) y **antes** de `asentarCierreDia` (el feed
lee la marca):

```ts
if (destino?.destinoTipo === "bodega_central") {
  await tx.cierreDia.updateMany({
    where: { id: cierreId, estado: "aprobado" },
    data: { pagoIndependienteEfectivo: true },
  });
  await asentarCierreDia(tx, cierreId, this.asientos());
}
```

El `updateMany` actúa sobre la fila que el `updateMany` de la aprobación acaba de bloquear en la misma
transacción: nadie puede verla aprobada sin la marca, y si algo lanza después, revierten juntas. Un
cierre de satélite no entra en esa rama y queda en `false` (R310, §13).

*Alternativa descartada para SLT-123:* poner la marca en el `updateMany` de la aprobación con
`destinoTipo` en el `where` obligaría a partir la aprobación en dos sentencias según el destino (la de
satélite no debe llevar la marca), duplicando la guarda de alcance. La escritura aparte es una línea y
desaparece en SLT-139.

**[SLT-139] (R336).** SLT-139 quita esa escritura aparte y pasa la marca al mismo `updateMany` que
aprueba, para todos los destinos:

```ts
data: {
  estado: nuevoEstado,
  resueltoPor,
  resueltoAt: new Date(),
  motivoRechazo,
  ...(nuevoEstado === "aprobado" ? { pagoIndependienteEfectivo: true } : {}),
},
```

Así la marca y la aprobación son la misma fila escrita en la misma sentencia (R336): no puede haber un
cierre aprobado por el código nuevo sin la marca, ni una marca sin aprobación. Si la transacción
revierte, revierten juntas.

**Por qué `DEFAULT false` y sin backfill** (D5, D6, R311, R312):
- Los cierres ya aprobados quedan en `false` sin escribir una sola fila.
- Un cierre `solicitado` o `vencido` en el momento del despliegue queda en `false` y pasa a `true` si
  lo aprueba el código nuevo (en SLT-123, si es de la central): la regla nueva aplica a los aprobados
  **desde** el despliegue, que es lo que decidió Carlos.
- Si entre la migración y el código nuevo el código viejo aprueba un cierre, ese cierre queda en
  `false` y su libro tiene el `min(P,E)` que escribió el código viejo: marca y libro coinciden.
- Con `DEFAULT true` + backfill a `false` de los aprobados (el molde de la 264) ese último caso
  quedaría en `true` con un libro de la regla vieja.

**La regla se lee solo de la marca** (R327): ningún consumidor mira `resuelto_at`, la fecha de
despliegue, `conciliado_at`, el destino ni el libro para decidir qué regla aplica. En SLT-123 el
destino solo decide, al aprobar, si se pone la marca; en SLT-139, además, si la regla nueva escribe o
no `pago_satelite` en el feed.

**Autorización y alcance.** No cambian: aprobar sigue gobernado por `resolveAlcance` y
`alcanceWhere` (en SLT-123 la marca solo se escribe si el `updateMany` con la guarda de alcance aplicó,
`res.count === 1`; en SLT-139 viaja en ese mismo `updateMany`); conciliar sigue
siendo de acceso total. No hay acción, ruta ni módulo nuevo.

**Multi-empresa.** Columna nueva en una tabla que ya tiene `organizacion_id`, RLS
`cierre_dia_por_empresa` y trigger de misma empresa. Ninguna tabla nueva. T0.3 comprueba que
`servi_app` puede escribir la columna nueva (si los permisos de `cierre_dia` fueran por columna,
haría falta un `GRANT UPDATE (pago_independiente_efectivo)` en la migración).

**País.** Nada depende del país: no hay moneda, impuesto ni método de pago nuevo. Los importes son
los snapshots que ya existen.

## 3. Migraciones

Escritas a mano (`db:migrate:create` falla con P3006 en este repo, nota de SLT-68).

### 3.0 Qué migración va en cada ficha (D13)

**SLT-123 lleva una sola migración: la columna de la marca** (`20261114120000_pago_independiente_efectivo`,
§3.2-SLT-123). **El valor de enum `pago_satelite` y sus dos `CHECK` van en SLT-139** (§3.1 y §3.2-SLT-139).

Se valoró meterlo todo en SLT-123 («migración única») y se descartó:
- **No hay migración única posible.** `ALTER TYPE … ADD VALUE` tiene que ir sola en su migración
  (55P04: no se puede usar el valor en la transacción que lo añade), así que el enum son dos
  migraciones aunque vayan en la misma ficha. Partirlas entre fichas no añade ninguna migración.
- **El enum arrastra código que SLT-123 no usa.** Con `pago_satelite` en `schema.prisma`, el cliente
  generado gana el valor y el compilador exige cubrirlo en cada `Record` total (§7: SEED de
  `wallet-mensajero.ts`, rótulo, `FUENTE_MENSAJERO`, chips, catálogo de métricas): 5 archivos de
  producción, el test de R329 y el `down.sql` dinámico de ~160 líneas. Sería un rótulo «Pagado por la
  satélite» que ninguna fila puede producir hasta SLT-139.
- **Cada `down.sql` revierte lo suyo.** Con el enum en SLT-139, revertir SLT-139 no toca la marca y
  revertir SLT-123 no toca el enum.
- **SLT-139 depende de SLT-123, no al revés.** La columna la necesitan las dos; el enum, solo SLT-139.

### 3.1 [SLT-139] `db/migrations/<fecha SLT-139>_pago_satelite_enum/`

Nombre y fecha los fija SLT-139 al implementarse; deben ser posteriores a `20261114120000`.

`migration.sql` — va sola, porque Postgres no deja usar un valor de enum en la transacción que lo
añade (55P04):

```sql
ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'pago_satelite';
```

`down.sql` — la función de reversión dinámica de `20261030120000_incentivo_mensajero_enums/down.sql`
copiada tal cual y renombrada `_slt139`: lee la lista vigente de `pg_enum`, aborta con `RAISE` si
alguna fila usa `pago_satelite`, guarda/suelta/recrea los CHECK e índices que nombran el tipo por
texto y quita solo ese valor. Se revierte **después** de 3.2-SLT-139.

### 3.2-SLT-123 `db/migrations/20261114120000_pago_independiente_efectivo/` (la única de SLT-123)

`migration.sql`:

```sql
-- La marca. Postgres ≥ 11 añade una columna con DEFAULT constante sin reescribir filas:
-- ningún UPDATE, ningún backfill (R312).
ALTER TABLE "cierre_dia"
  ADD COLUMN "pago_independiente_efectivo" BOOLEAN NOT NULL DEFAULT false;
```

(Más el `GRANT` por columna si T0.3 lo pide.)

`down.sql`, en este orden:
1. **Precondición ruidosa:** `RAISE EXCEPTION` si algún `cierre_dia` tiene
   `pago_independiente_efectivo = true`. Es dinero: bajar la columna con cierres aprobados por la
   regla nueva los devolvería en silencio a `min(P,E)` (D5 al revés).
2. `ALTER TABLE cierre_dia DROP COLUMN pago_independiente_efectivo`.

`schema.prisma`: el campo en `CierreDia`, con el comentario de qué es y de la ficha.

### 3.2-SLT-139 [SLT-139] `db/migrations/<fecha SLT-139>_pago_satelite_checks/`

`migration.sql`:

```sql
-- 1) CHECK tipo<->categoria desde su definición vigente (SLT-68, 20261030120100) + 'pago_satelite'
--    en la rama `pago`. SLT-139 confirma que esa es la última definición.
ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check";
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking','incentivo'))
  OR
  ("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo','pago_satelite'))
);

-- 2) `pago_satelite` solo cuelga de un cierre del día (R330).
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_pago_satelite_origen_check"
CHECK ("categoria" <> 'pago_satelite' OR ("origen_tipo" = 'cierre_dia' AND "origen_id" IS NOT NULL));
```

`pago_mensajero_movimiento_origen_uq` **no cambia**: `pago_satelite` queda dentro de su predicado
(`categoria NOT IN ('premio_ranking','ajuste_pago','incentivo')`), así que la base admite uno por
`(cierre, mensajero)` y conciliar dos veces no duplica (R318), igual que `pago_efectivo`.

`down.sql`, en este orden (R337):
1. **Precondición ruidosa:** `RAISE EXCEPTION` si existe alguna fila con `categoria = 'pago_satelite'`.
2. `DROP CONSTRAINT pago_mensajero_movimiento_pago_satelite_origen_check`.
3. CHECK tipo<->categoría de vuelta a la definición de SLT-68.

`schema.prisma` (SLT-139): `pago_satelite` en `PagoMensajeroMovimientoCategoria`, con comentario.

## 4. Escritura

### 4.1 El feed (`WalletMensajeroFeedService.construirMovimientosDePago`)

**SLT-123.** El `findUnique` del cierre pasa a leer también `pagoIndependienteEfectivo` (sigue siendo
una sola lectura). `WalletMensajeroFeedTxClient` (`IWalletMensajeroFeedService.ts`) se amplía con ese
campo en el `select`.

```ts
const P = round2(totalPagoMensajero);
const libro: CrearPagoMensajeroInput[] = [];
if (P.gt(0)) libro.push(devengo(P));                 // pago_devengado = P, siempre
if (!cierre.pagoIndependienteEfectivo) {
  const { pagado } = calcularSplitPago(P, E);        // regla de la 44, intacta (R325)
  if (pagado > 0) libro.push(pago("pago_efectivo", pagado));
}                                                    // nuevo: nada más (R313)
const egresoCaja = P.gt(0) ? [egresoPagoMensajero(P)] : []; // sin cambio (R314)
```

Con SLT-123 sola un cierre marcado siempre es de la central (R310): la rama «nuevo» solo la recorre la
aprobación central. Un cierre de satélite llega al feed desde la conciliación con la marca en `false`
y escribe lo de hoy (R325, §13).

**[SLT-139] (R317).** SLT-139 añade `destinoTipo` al `select` y la rama de satélite:

```ts
const P = round2(totalPagoMensajero);
const libro: CrearPagoMensajeroInput[] = [];
if (P.gt(0)) libro.push(devengo(P));                 // pago_devengado = P, siempre
if (!cierre.pagoIndependienteEfectivo) {
  const { pagado } = calcularSplitPago(P, E);        // regla de la 44, intacta (R325)
  if (pagado > 0) libro.push(pago("pago_efectivo", pagado));
} else if (cierre.destinoTipo === "bodega_satelite" && P.gt(0)) {
  libro.push(pago("pago_satelite", P));              // R317
}                                                    // nuevo central: nada más (R313)
const egresoCaja = P.gt(0) ? [egresoPagoMensajero(P)] : []; // sin cambio (R314)
```

El feed no sabe si lo llama la aprobación o la conciliación, y no lo necesita: un cierre de satélite
solo llega al feed desde la conciliación (`resolverCierre` asienta solo `bodega_central`, SLT-73 R1), y
la fecha de las filas ya la pone `asentarCierreDia` con el instante de la marca de conciliación (R22 de
SLT-73).

[SLT-139] `PAGO_MENSAJERO_FEED_CATEGORIA_SEED` (`lib/types/wallet-mensajero.ts`) gana `pago_satelite`.

### 4.2 Lo que no se escribe

- Ni el rechazo ni el pago ni la anulación ni la conciliación tocan la marca (R311). En SLT-123 la
  aprobación de un cierre de satélite tampoco (R310).
- Ninguna migración de datos, ningún movimiento compensatorio sobre cierres viejos (R326).
- La liquidación (172) y el reparto (205) escriben exactamente lo de hoy (`liquidacion_pago` + `pago /
  liquidacion`). La anulación, su contraasiento de hoy.

## 5. Lectura: lo pendiente de un cierre

### 5.1 Contrato de `derivarPendienteCierre`

**SLT-123 (R315, R325, R327).** Un campo nuevo, obligatorio:

```ts
export interface PendienteCierreInput {
  pagoDebido: string | Prisma.Decimal;          // P
  efectivo: string | Prisma.Decimal;            // E (solo lo usa la regla vieja)
  premiosVivos: string | Prisma.Decimal;
  pagadoVigente: string | Prisma.Decimal;
  /** SLT-123 (R327): la marca del propio cierre. Única fuente de la regla. */
  pagoIndependienteEfectivo: boolean;
}

const generado = input.pagoIndependienteEfectivo
  ? round2(P)                                    // R315: P completo
  : new Prisma.Decimal(calcularSplitPago(P, E).pendiente); // R325: P − min(P,E), como hoy
const pendiente = generado.add(premio).sub(yaEntregado);
return pendiente.gt(0) ? pendiente.toFixed(2) : "0.00";
```

Obligatorio: cada consumidor deja de compilar hasta que decide de dónde saca la marca (mismo argumento
que la 293, §5.2).

**[SLT-139] (R338).** SLT-139 añade el término de satélite:

```ts
export interface PendienteCierreInput {
  pagoDebido: string | Prisma.Decimal;          // P
  efectivo: string | Prisma.Decimal;            // E (solo lo usa la regla vieja)
  premiosVivos: string | Prisma.Decimal;
  pagadoVigente: string | Prisma.Decimal;
  /** SLT-123 (R327): la marca del propio cierre. Única fuente de la regla. */
  pagoIndependienteEfectivo: boolean;
  /** SLT-139 (R338): Σ `pago_satelite` del libro con origen en este cierre. */
  pagadoPorSatelite: string | Prisma.Decimal;
}

const generado = input.pagoIndependienteEfectivo
  ? round2(P)                                    // R315: P completo
  : new Prisma.Decimal(calcularSplitPago(P, E).pendiente); // R325: P − min(P,E), como hoy
const satelite = input.pagoIndependienteEfectivo ? round2(pagadoPorSatelite) : CERO; // viejo: se ignora
const pendiente = generado.add(premio).sub(yaEntregado).sub(satelite);
return pendiente.gt(0) ? pendiente.toFixed(2) : "0.00";
```

`pagadoPorSatelite` también es **obligatorio**. En un cierre viejo se ignora aunque viniera distinto
de cero: la fórmula vieja queda exactamente como hoy pase lo que pase en el libro (R326).

### 5.2 [SLT-139] La lectura nueva

`IPagoMensajeroMovimientoRepository.sumarPagadoSatelitePorCierre(cierreIds: string[]):
Promise<Record<string, string>>`, en `PagoMensajeroMovimientoRepository`, con el mismo molde que
`sumarPremiosVivosPorCierre`: un `groupBy` por `origenId` con `origenTipo = 'cierre_dia'`,
`categoria = 'pago_satelite'`, `origenId in cierreIds`; una entrada por id pedido (`"0.00"` si no hay
filas); el mismo trato de la lista vacía que tiene `sumarPremiosVivosPorCierre`. Es un modelo de
negocio: la extensión de empresa inyecta `organizacion_id` y la RLS lo cubre (R333).

### 5.3 Los consumidores

En SLT-123 cada consumidor pasa la marca del cierre (columna derecha). La lectura de «pagado por la
satélite», su inyección y las acciones de producción (R333-R335) son **[SLT-139]**: con SLT-123 sola
siguen leyendo dos sumas (vigentes y premios), como hoy.

| Consumidor | Archivo | De dónde sale la marca |
|---|---|---|
| `CierresAdminService.conPendiente` (cola, histórico; central y satélite) | `lib/services/CierresAdminService.ts:1345-1371` | `CierreAdminResumen.pagoIndependienteEfectivo` (lo añade `toResumen` en `CierresAdminRepository`) |
| `CierresAdminService.pendienteTrasAprobar` | `:1385-1400` | `CierreParaPagoDTO.pagoIndependienteEfectivo` |
| `CierreDiaService.conPendientePago` (`/cierre-dia`) | `lib/services/CierreDiaService.ts:571-590` | `CierrePasadoDTO.pagoIndependienteEfectivo` (`findCierresByMensajeroPaginado`) |
| `LiquidacionService.imputablesDe` (reparto) | `lib/services/LiquidacionService.ts:1094-1131` | `listarCierresImputablesEnAlcance` |
| `LiquidacionService.restanteTrasAnular` | `:1240-1263` | `obtenerCierreParaPago` |
| `LiquidacionService.pendienteDelCierre` (tope del pago directo) | `:1371-1383` | `obtenerCierreParaPago` |

[SLT-139] En los tres de `LiquidacionService` la lectura de «pagado por la satélite» siempre dará `"0.00"` (la
central solo paga cierres de la central, SLT-122). Se hace igual, por la misma razón que la 293 lee
los premios al aprobar: dos fórmulas para el mismo número acaban diciendo cifras distintas.

[SLT-139] `CierreDiaService` recibe la lectura en su objeto `pendientes` (`{ liquidaciones, premios,
pagadoSatelite }`) y `CierresAdminService`, junto a `premiosRepo`. Las acciones de producción
(`lib/actions/cierre-dia.ts`, `lib/actions/cierres-admin.ts`) la inyectan (R335). Sin ella,
`CierreDiaService` sigue sin emitir pendiente (el `if (!this.pendientes)` de hoy) y
`CierresAdminService` no compila sin el repositorio.

Las pantallas no cambian de código: `pagoEntregadoDe`, `PendienteLiquidarBadge` y la celda «Pago» del
mensajero pintan el string del servidor (R71 de SLT-95). Cambia el número que llega.

## 6. [SLT-139] La consolidación de la satélite (`CierreBodegaService.listarConsolidacion`)

Con SLT-123 sola no cambia: todos los consolidables son viejos y `repartirEfectivo` recibe lo de hoy.

El DTO de cada consolidable (`findCierresDiaConsolidables`, `CierreBodegaRepository`) gana
`pagoIndependienteEfectivo`. En el servicio:

```ts
const viejos = consolidables.filter((c) => !c.pagoIndependienteEfectivo);
const nuevos = consolidables.filter((c) => c.pagoIndependienteEfectivo);
const { pagado, centralDebe } = repartirEfectivo(
  sumTotales(viejos).efectivo,              // solo el efectivo de los cierres viejos (R322)
  viejos.map((c) => c.totalPagoMensajero),
);
const pagadoTotal = Decimal(pagado).plus(sumPagoMensajero(nuevos)); // R323
const totalCentralDebeAgregado = centralDebe;
const totalNetoAgregado = netoDe(totalesAgregados.general, pagadoTotal.toFixed(2));
```

Con un conjunto solo de cierres viejos, `sumTotales(viejos).efectivo` es el efectivo de siempre y el
resultado es idéntico al de hoy (R323, R325). Los demás agregados (`paraLaCentralAgregado`,
`totalPagoMensajeroAgregado`, `totalesAgregados`) no cambian.

La tarjeta «La central debe» ya no se pinta cuando vale `"0.00"` (`tarjetasAConsolidar`, `esMontoCero`):
no hay cambio de cliente para eso. La nota de «Pago a mensajeros» (R324, PA1 = a) cambia en
`components/private/cierres/cola/cola-cierres-labels.ts > notaPagoMensajeros`.

`ConsolidacionBodegaModule` y `cierre-detalle-shared.tsx` pintan el mismo `totalCentralDebeAgregado`
del servidor: se corrigen sin tocarlos.

## 7. [SLT-139] La categoría nueva en los catálogos

El enum `PagoMensajeroMovimientoCategoria` gana un valor: el compilador señala cada `Record` total. Los
que se encontraron:

| Archivo | Qué se añade |
|---|---|
| `lib/types/wallet-mensajero.ts` | `PAGO_MENSAJERO_MOVIMIENTO_CATEGORIA_SEED` y `PAGO_MENSAJERO_FEED_CATEGORIA_SEED` |
| `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts` | `pago_satelite: "Pagado por la satélite"` |
| `lib/utils/aporte-por-orden.ts > FUENTE_MENSAJERO` | `pago_satelite: { tipo: "snapshot_gestion", campo: "pago_mensajero" }` (es `P`, que sí se reparte por guía: 208 de 208 cuadran, ficha 468) |
| `lib/utils/estado-cuenta-chips.ts` | `pago_satelite: () => "cierres"` |
| `lib/analytics/metrics.ts` | la categoría en el catálogo de cuentas por pagar (el cálculo agrega por `tipo` y no cambia) |

`ConciliacionCierresAnaliticaRepository` no necesita cambio: compara el crédito del libro de tienda
contra `total_general`, no el libro del mensajero. `claveDeParMensajero` (`lib/utils/estado-cuenta.ts`)
tampoco: `pago_satelite` no tiene contraasiento y cae en `null`, como `pago_efectivo`.

## 8. Superficies que leen el pago al mensajero

Las filas marcadas **[SLT-139]** solo cambian con SLT-139; con SLT-123 sola se quedan como hoy.

| # | Superficie | Lee | ¿Cambia? |
|---|---|---|---|
| 1 | `/cierres-admin` cola central, «Pago entregado» (Resueltos) y `PendienteLiquidarBadge` | `CierresAdminService.conPendiente` | **Sí**, en cierres nuevos (R320) |
| 2 | `/cierres-admin` histórico (`CierresAdminHistoricoLista`) | ídem | **Sí** (R320) |
| 3 | **[SLT-139]** `/cierres-admin` satélite: cola y detalle de solo lectura | ídem | En SLT-123 no (todos viejos). Con SLT-139: `P` antes de conciliar, `0.00` después (R319) |
| 4 | Respuesta de aprobar (oferta de pago tras aprobar) | `pendienteTrasAprobar` | **Sí** (R321) |
| 5 | «Registrar pago» en el detalle central (tope y `restante`) | `pendienteDelCierre` | **Sí** (R316, R321) |
| 6 | Anular un pago (`restante`) | `restanteTrasAnular` | **Sí** (R321) |
| 7 | `/wallet/mensajeros` «Pagar» (ventana del reparto, imputable, «deuda no imputable») | `imputablesDe` | **Sí** (R321) |
| 8 | `/wallet/mensajeros` lista y estado de cuenta (devengado, pagado, cuenta por pagar) y su descarga | libro (`WalletMensajeroService`) | **Sí**: por las filas que escribe el feed (R328; `pago_satelite`: R329 [SLT-139]) |
| 9 | `/cierre-dia` cola del mensajero, celda «Pago» | `CierreDiaService.conPendientePago` | **Sí** (R320) |
| 10 | **[SLT-139]** Consolidación satélite: «La central debe» (cola «A consolidar» y `ConsolidacionBodegaModule`) | `CierreBodegaService` | **Sí** (R322) |
| 11 | **[SLT-139]** Consolidación: `totalNetoAgregado` (en el contrato, no se pinta, SLT-106 R204) | ídem | **Sí** (R323) |
| 12 | **[SLT-139]** Consolidación: nota de «Pago a mensajeros» | `cola-cierres-labels.ts` | **Sí**, texto (R324) |
| 13 | Analítica de cuentas por pagar (`CuentasPorPagarAnaliticaRepository`, `AnaliticaFinancieraService`) | libro, por `tipo` | **Sí** la cifra, por las filas que ya no escribe el feed central; el cálculo no cambia. Catálogo de `pago_satelite`: R329 [SLT-139] |
| 14 | **[SLT-139]** Detalle de un movimiento / libro kardex / búsqueda por guía (469) | `FUENTE_MENSAJERO` | **Sí**: la fila nueva se abre por guía (R329) |
| 15 | **[SLT-139]** Estado de cuenta (chips, pares) | `estado-cuenta-chips.ts`, `estado-cuenta.ts` | Solo el chip de la categoría nueva |
| 16 | Caja: «Salió», ganancia, tesorería, `/wallet` | `wallet_movimiento` | **No** (R314, R331, PA3) |
| 17 | Deuda de la satélite, «Debe llegar a la central», `/wallet/satelites`, estado de cuenta de la bodega | snapshot (`paraLaCentral`, `aporte-satelite-sql.ts`) | **No** (R331) |
| 18 | Conciliación analítica de cierres | libro de tienda | **No** (R331) |
| 19 | «Ganancia» del mensajero en `/cierre-dia` y columna Ganancia | `totalPagoMensajero` (P) | **No** (R331) |
| 20 | Premios del ranking e incentivos | `sumarPremiosVivosPorCierre` | **No** (R331) |
| 21 | Descargas de `/cierres-admin` (cola, histórico) | `cierres-admin-descarga-columnas.ts` | **No**: no llevan lo pendiente |
| 22 | Tarjetas de ganancia del mensajero (SLT-112), Excel del modelo nuevo (SLT-113) | — | No existen todavía (PA5) |
| 23 | `/mi-wallet`, `/mis-pagos` | — | No aplican: `/mi-wallet` no es del mensajero y `/mis-pagos` se retiró (ficha 336) |

## 9. Lo que cambia para la gente (no es código)

Con la regla nueva el mensajero de la central ya no «se queda» con su pago del efectivo: el efectivo
que recauda es todo de la empresa y su pago se registra con «Registrar pago». En el código no hay
ninguna cifra de «efectivo a entregar» que cambie (buscado: `netoAEntregar`, `aEntregar`,
`efectivoAEntregar`; solo existe `totalNetoAgregado` de la consolidación, §6). Cómo se le comunica al
mensajero y a la oficina es operación, no sistema.

## 10. Alternativas descartadas

1. **Fecha de corte** (`resuelto_at >= <fecha de despliegue>` en código o en configuración).
   Descartada: la fecha del despliegue no es la del primer cierre aprobado por el código nuevo (la
   migración, el build y el cambio de tráfico no son el mismo instante), y un cierre aprobado por el
   código viejo después de esa fecha quedaría con un libro `min(P,E)` y un pendiente de la regla
   nueva. Además ata cada lectura a una constante que nadie puede auditar en la fila.
2. **Leer la regla del libro** («si hay `pago_efectivo`, es viejo»). Descartada: un cierre viejo con
   E = 0 no tiene `pago_efectivo` y parecería nuevo; un cierre viejo de satélite no tiene libro hasta
   conciliar. Daría la regla nueva a cierres ya aprobados (contra D5).
3. **`DEFAULT true` + backfill a `false` de los aprobados** (molde de la feature 264). Descartada: el
   backfill es una escritura sobre cierres aprobados (R312) y un cierre aprobado por el código viejo
   entre la migración y el código nuevo quedaría con la marca equivocada (§2).
4. **Enum `regla_pago_mensajero` en vez de booleano.** Descartada por ahora: hay dos reglas y ninguna
   tercera a la vista; un booleano no admite estados intermedios. Si aparece una tercera, la migración
   a enum es mecánica.
5. **Reutilizar `pago_efectivo` o `ajuste_pago` para lo pagado por la satélite.** Descartada:
   `pago_efectivo` diría «tomado del efectivo» cuando fue SINPE o dinero de la satélite (la
   investigación lo marca); `ajuste_pago` es una corrección manual, está fuera del único parcial (no
   sería idempotente) y la analítica lo trata como ajuste.
6. **No escribir nada en el libro para los cierres de satélite.** Descartada: el devengo es lo que
   dice cuánto ganó el mensajero en la wallet y en la analítica; la ficha pide registrarlo como
   pagado por la satélite (D3).
7. **Recalcular los cierres ya aprobados.** Descartada por D5.

## 11. Pruebas contra Postgres real

### 11.1 Integración: `tests/integration/db/slt123-pago-independiente.int.test.ts`

Base desechable con las migraciones aplicadas. Empresa A:

| Cierre | Destino | Marca | P | E | Cómo llega |
|---|---|---|---|---|---|
| V1 | central | `false` | 3 000.00 | 1 000.00 | aprobado con el feed viejo (fixture que escribe lo que escribía el código de `dev`: `pago_devengado 3000`, `pago_efectivo 1000`, egreso 3000) |
| N1 | central | — | 3 000.00 | 5 000.00 | `solicitado`, se aprueba con `resolverCierre` real |
| V2 | satélite | `false` | 6 000.00 | 0.00 | aprobado sin marca (fixture), consolidado; se concilia con la marca de conciliación real |
| S1 | satélite | — | 2 500.00 | 4 000.00 | `solicitado`, se aprueba con `resolverCierre` real, se consolida y se concilia (el caso «entre los dos merges», §13) |
| N3 | central | — | 0.00 | 1 000.00 | `solicitado`, se aprueba (P = 0) |

Afirmaciones (con importes literales escritos a mano, no derivados de la función que se prueba):
1. **Antes de nada**, foto de todas las filas de V1 y V2 en `cierre_dia`, `pago_mensajero_movimiento`,
   `wallet_movimiento`, `liquidacion_pago`. **Al final**, la misma foto, idéntica (R326).
2. N1 tras aprobar: marca `true`; libro = `[pago_devengado 3000.00]`; caja con `egreso_pago_mensajero
   3000.00` (R310, R313, R314). Forzando que la transacción lance después de escribir la marca
   (T6.1 elige el punto: los asientos o la liberación de `sin_gestionar` que va después): N1 sigue
   `solicitado` y con la marca `false` (R310).
3. Pendiente: V1 `2000.00`, N1 `3000.00`, N3 `0.00` y sin filas de libro (R313, R315, R325).
4. Registrar pago de 3 000 contra N1: pendiente `0.00`; cuenta por pagar del mensajero sube 3 000 al
   aprobar y baja 3 000 al pagar (R316, R328).
5. V2 conciliado: `pago_devengado 6000`, sin `pago_efectivo` (E = 0) → pendiente `6000.00`, como hoy (R325).
6. **S1 (satélite aprobada con SLT-123):** tras aprobar, marca `false` y ninguna fila de libro (la
   satélite no asienta al aprobar, SLT-73 R1). Antes de consolidar, «La central debe» de su
   consolidación = `0.00` (E 4 000 ≥ P 2 500, como en `dev`). Tras conciliar: `pago_devengado 2500.00`
   y `pago_efectivo 2500.00`, sin ninguna otra categoría; pendiente `0.00` (R310, R325, R327).
7. Rechazar un cierre `solicitado`: marca `false`. Conciliar V2/S1, pagar y anular sobre N1, registrar
   un incentivo sobre N1: la marca no cambia (R311).
8. Con un cierre nuevo y uno viejo de la central de snapshots iguales: caja, `paraLaCentral`, premios y
   conciliación analítica iguales a los de dos viejos (R331).

**[SLT-139]** Los casos de satélite nuevo (pago_satelite, idempotencia, consolidación mixta, dos
empresas) son de su propia integración. Diseño de referencia, tal como estaba antes del corte:
- N2 (satélite, P 2 500.00, E 4 000.00) aprobado y conciliado: antes de conciliar pendiente `2500.00`;
  después `pago_devengado 2500`, `pago_satelite 2500`, sin `pago_efectivo`, fecha = `conciliado_at`;
  pendiente `0.00` (R317, R319). Volver a llamar a `asentarCierreDia`: mismas filas (R318).
- Consolidación con V3 (viejo, P 6 000.00, E 0.00, general 10 000.00) y N4 (nuevo, P 2 500.00,
  E 4 000.00, general 4 000.00): «La central debe» `6000.00`; neto `14000.00 − 0.00 − 2500.00 =
  11500.00`. Solo N4: `0.00`. Solo V3: lo de `dev` (R322, R323).
- Empresa B con un `pago_satelite`: `sumarPagadoSatelitePorCierre` desde A no lo suma (R333).
- Un cierre de satélite aprobado con SLT-123 (como S1) y conciliado después de SLT-139: sigue con la
  regla vieja (R336, D5).

### 11.2 Migración: `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts`

- Antes de subir: cuenta y suma de cada tabla de dinero; después de subir: iguales, y todos los
  `cierre_dia` en `false` (R312).
- `down.sql` con un cierre con la marca: aborta y no cambia nada. Sin ninguno: la base queda como
  antes (columna fuera).

**[SLT-139]** Su propia ida y vuelta: la base rechaza `pago_satelite` con `tipo = 'devengo'` (23514) y
con `origen_tipo = 'manual'` (R330); el `down.sql` aborta con una fila `pago_satelite` y, sin ella,
saca CHECK y valor de enum (R337).

### 11.3 Mutaciones que deben poner algo en rojo

Están en `tasks.md > T6.2`, con el test que debe caer. Las que solo prueban satélite, en
`tasks.md > Fuera de alcance → SLT-139`.

## 12. Riesgos

- **Tests existentes que aprueban por el camino real un cierre de la central y esperan
  `pago_efectivo`** (caracterizaciones 454/455, SLT-73 aprobación central, tarifas, idempotencia del
  libro, E2E de wallet y cierres). Con la marca, sus cierres pasan a la regla nueva. T0.2 los mide;
  cada uno se actualiza a la regla nueva o se le fija un cierre viejo, según lo que caracterice. Nunca
  se borra una aserción sin sustituirla. Los de conciliación de satélite (`slt73-marcar-asienta`) no
  caen en SLT-123 (la satélite sigue vieja) y caerán en SLT-139.
- **`node_modules` compartido y Prisma** (memoria del leader): el `prisma generate` de esta rama cambia
  el cliente para otros worktrees. Avisar antes de generar.
- **Cierres de satélite aprobados entre los dos merges** se quedan viejos para siempre (§13). Cuantos
  más días pasen entre SLT-123 y SLT-139, más cierres de satélite con la regla de la 44.

## 13. La satélite entre los dos merges (SLT-123 en prod, SLT-139 todavía no)

**Comportamiento elegido: la regla vieja, entera y sin cambios.** Con SLT-123 sola:
- Un cierre de satélite aprobado no recibe la marca (R310). Es un cierre viejo a todos los efectos.
- Al conciliar, el feed escribe `pago_devengado = P` y `pago_efectivo = min(P,E)`, como hoy (R325).
- Lo pendiente en `/cierres-admin` satélite y en `/cierre-dia` es `(P − min(P,E)) + premios − vigentes`,
  como hoy.
- La consolidación reparte el efectivo como hoy, «La central debe» sale como hoy y la nota «· se paga
  del efectivo» sigue siendo cierta (por eso R324 va en SLT-139, D9).
- No existe `pago_satelite`, ni en el enum ni en el libro.

**Por qué así y no otra cosa.** Es la única opción en la que cada cifra de la satélite sale de la
misma regla que su libro: marca `false` → libro de la 44 → pendiente de la 44 → «La central debe» de
la 44. Ponerle la marca sin el feed de SLT-139 dejaría un cierre con pendiente `P` y un libro con
`pago_efectivo`, o (con el feed de SLT-123) un devengo sin pago que la consolidación seguiría
descontando del efectivo: cifras contradictorias en dinero. Y es el mismo trato que D5 da a los
aprobados antes del despliegue: la satélite no empeora respecto a hoy.

**Al mergear SLT-139.** Los cierres de satélite aprobados desde ese despliegue reciben la marca
(R336). Los aprobados entre los dos merges conservan `false` y la regla vieja aunque se concilien
después; una consolidación que los mezcle con nuevos usa R322 (los viejos se reparten su propio
efectivo). No se recalculan (D5).
