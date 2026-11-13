# SLT-139 «Pago al mensajero independiente del efectivo: satélite» — design

> Escrito por spec_author el 2026-11-12. Requisitos: `requirements.md` (R317-R319, R322-R324, R329,
> R330, R333-R338 heredados de SLT-123; R340-R345 nuevos). Diseño de referencia: las partes
> **[SLT-139]** de `specs/SLT-123-pago-independiente-efectivo/design.md`; donde este diseño se aparta,
> lo dice §15. El grafo de código no tiene indexado este worktree (`index_status`: proyecto no
> encontrado); la exploración se hizo con Grep/Read sobre el worktree, al día con `dev` (0df9f7b0).

## Lo que ya existe

Buscado en `feature_list.json`, `specs/` y el código: `pago_satelite`, `pagoIndependienteEfectivo`,
`pagadoPorSatelite`, `sumarPagadoSatelitePorCierre`, `repartirEfectivo`, `totalCentralDebeAgregado`,
`totalNetoAgregado`, «se paga del efectivo», `asentarCierreDia`, `derivarPendienteCierre`.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| La marca, su columna y su migración (SLT-123) | `db/schema.prisma` (`CierreDia.pagoIndependienteEfectivo`), `db/migrations/20261114120000_pago_independiente_efectivo/` | Se usa tal cual. Ninguna migración la toca. |
| La marca al aprobar, **solo** central | `CierresAdminRepository.resolverCierre:2452-2463` (un `updateMany` aparte antes de `asentarCierreDia`) | Se sustituye por la marca dentro del `updateMany` que aprueba (§2). |
| El feed con la rama de la marca | `WalletMensajeroFeedService.construirMovimientosDePago` (lee la marca; con `true`, solo devengo) | Gana `destinoTipo` en el mismo `select` y la rama `pago_satelite` (§4). |
| `derivarPendienteCierre` con la marca obligatoria | `lib/utils/pendiente-cierre.ts` (R315/R325) | Gana el término de satélite (§5.1). Sigue siendo la única función. |
| Los seis consumidores de lo pendiente, todos con la marca | `CierresAdminService.conPendiente`/`pendienteTrasAprobar`, `CierreDiaService.conPendientePago`, `LiquidacionService.imputablesDe`/`restanteTrasAnular`/`pendienteDelCierre` | Pasan además lo pagado por la satélite (§5.3). |
| Las filas de repositorio con la marca **obligatoria** (B1 de la review de SLT-123) | `CierreAdminResumenRow`, `CierreParaPagoDTO` | Ya la traen; esta ficha no las toca. |
| Lectura en lote por cierre, molde a copiar | `PagoMensajeroMovimientoRepository.sumarPremiosVivosPorCierre:362` | Mismo molde para `sumarPagadoSatelitePorCierre` (§5.2). |
| La conciliación que asienta cada cierre de satélite | `CierresBodegaAdminRepository.marcarConciliado:736-743` → `asentarCierreDia(tx, id, deps, ahora)` | No cambia: ya pasa el instante de la marca (SLT-73 R22) y es idempotente por el único parcial. |
| Corregir y desmarcar una conciliación | `corregirConciliacion:880` (no re-asienta), `revertirConciliacion:800` (`con_asientos` si hay caja `cierre_dia`) | No cambian. Garantizan R345 (§9). |
| El reparto del efectivo y el neto | `CierreBodegaService.repartirEfectivo:138`, `netoDe:167`, `listarConsolidacion:304-310` | Se reutilizan, alimentados solo con los cierres viejos (§6). |
| La fila consolidable | `CierreDiaConsolidableRow` (`ICierreBodegaRepository.ts:14`), `toConsolidableRow` (`CierreBodegaRepository.ts:302`) | Gana la marca, **obligatoria** (§6). |
| Molde enum + CHECK + `down.sql` dinámico | `20261030120000_incentivo_mensajero_enums` y `…120100_incentivo_mensajero_checks` (SLT-68) | Se copia (§3). |
| La nota «· se paga del efectivo» | `components/private/cierres/cola/cola-cierres-labels.ts:145-146` (`notaPagoMensajeros`) | Se quita (§8). |
| Las tarjetas de ganancia del mensajero | SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (pending, en spec en paralelo) | No existen. Esta ficha solo le deja el dato (§9). |

Ningún spec ni ficha resuelve ya lo que pide esta: SLT-123 dejó la parte de satélite escrita como
referencia y fuera de su PR.

## 1. La solución en una tabla

| | Cierre viejo (marca `false`) | Cierre nuevo central | Cierre nuevo satélite |
|---|---|---|---|
| Cuándo se pone la marca | nunca (aprobado antes del código que la pone) | al aprobar (SLT-123; desde aquí, en la misma escritura) | al aprobar (R336) |
| Libro al asentar | `pago_devengado = P`, `pago_efectivo = min(P,E)` | `pago_devengado = P` | `pago_devengado = P`, `pago_satelite = P` (R317) |
| Cuándo se asienta | aprobar (central) / conciliar (satélite) | al aprobar | al conciliar |
| Caja | `egreso_pago_mensajero = P` | igual | igual |
| Pendiente del cierre | `(P − min(P,E)) + premios − vigentes` | `P + premios − vigentes − pagadoSatélite` (siempre 0) | ídem: `P` antes de conciliar, `0.00` después (R319) |
| «La central debe» | reparto del efectivo de los viejos | — | aporta 0 (R322) |
| Neto de la consolidación | `recaudado − pagado del efectivo` | — | resta `P` (R323) |

## 2. La marca para todos los destinos (R336)

`CierresAdminRepository.resolverCierre`. Se quita el `updateMany` aparte de SLT-123 (`:2458-2461`) y la
marca va en el `updateMany` que aprueba (`:2397-2405`):

```ts
const res = await tx.cierreDia.updateMany({
  where: { id: cierreId, estado: { in: ESTADOS_RESOLUBLES }, ...alcanceGuard },
  data: {
    estado: nuevoEstado,
    resueltoPor,
    resueltoAt: new Date(),
    motivoRechazo,
    // SLT-139 (R336): la marca viaja en la MISMA escritura que aprueba, para todo destino.
    ...(nuevoEstado === "aprobado" ? { pagoIndependienteEfectivo: true } : {}),
  },
});
```

La rama `destino?.destinoTipo === "bodega_central"` se queda solo con `asentarCierreDia` (la satélite
sigue sin asentar al aprobar, SLT-73 R1). Consecuencias:
- No puede haber un cierre aprobado por este código sin la marca, ni una marca sin aprobación: son la
  misma fila en la misma sentencia. Si algo lanza después (indemnizaciones, asientos, liberación de
  `sin_gestionar`), revierten juntas.
- Rechazar no la toca (la rama condicional). Conciliar, consolidar, pagar, anular, premios e
  incentivos tampoco (SLT-123 R311 sigue valiendo).
- Un cierre de satélite aprobado con el código de SLT-123 (marca `false`) queda viejo para siempre,
  aunque se concilie con el código de esta ficha (R340, D5).

**Autorización.** No cambia: la marca solo se escribe si el `updateMany` con la guarda de alcance
(`alcanceWhere`) aplicó. Aprobar sigue gobernado por `resolveAlcance`; conciliar sigue siendo de
acceso total. No hay acción, ruta ni módulo nuevo.

## 3. Migraciones

Escritas a mano (`db:migrate:create` falla con P3006 en este repo, nota de SLT-68). Nombres con fecha
posterior a la última migración de `dev` en el momento de implementar; hoy la última es
`20261114120000_pago_independiente_efectivo`, así que se proponen `20261115120000` y `20261115120100`
(T1.2 lo confirma).

### 3.1 `db/migrations/20261115120000_pago_satelite_enum/`

`migration.sql` — sola, porque Postgres no deja usar un valor de enum en la transacción que lo añade
(55P04):

```sql
ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'pago_satelite';
```

`down.sql` — la función de reversión dinámica de `20261030120000_incentivo_mensajero_enums/down.sql`
copiada y renombrada con sufijo `_slt139`: lee la lista vigente de `pg_enum`, **aborta con `RAISE
EXCEPTION` si alguna fila usa `pago_satelite`**, guarda/suelta/recrea los `CHECK` e índices que nombran
el tipo por texto y quita solo ese valor. Se ejecuta **después** del `down.sql` de §3.2.

### 3.2 `db/migrations/20261115120100_pago_satelite_checks/`

`migration.sql`:

```sql
-- 1) CHECK tipo<->categoria desde su definicion vigente (SLT-68, 20261030120100; T0.1 lo confirma
--    contra pg_constraint) + 'pago_satelite' en la rama `pago`.
ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check";
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking','incentivo'))
  OR
  ("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo','pago_satelite'))
);

-- 2) `pago_satelite` solo cuelga de un cierre del dia (R330).
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_pago_satelite_origen_check"
CHECK ("categoria" <> 'pago_satelite' OR ("origen_tipo" = 'cierre_dia' AND "origen_id" IS NOT NULL));
```

`pago_mensajero_movimiento_origen_uq` (SLT-68: `(origen_tipo, origen_id, mensajero_id, categoria)
WHERE origen_id IS NOT NULL AND categoria NOT IN ('premio_ranking','ajuste_pago','incentivo')`) **no
cambia**: `pago_satelite` cae dentro del predicado, así que la base admite uno por (cierre, mensajero)
y conciliar dos veces no duplica (R318), igual que `pago_efectivo`.

`down.sql`, en una transacción y en este orden (R337):
1. **Precondición ruidosa:** `DO $$ … IF EXISTS (SELECT 1 FROM pago_mensajero_movimiento WHERE
   categoria = 'pago_satelite') THEN RAISE EXCEPTION … $$`. Es dinero: bajar el CHECK con filas
   `pago_satelite` las dejaría huérfanas de su regla.
2. `DROP CONSTRAINT pago_mensajero_movimiento_pago_satelite_origen_check`.
3. CHECK tipo<->categoría de vuelta a la definición de SLT-68 (la de `20261030120100`, sin
   `pago_satelite`).

**Aditivas** (R337): ningún `INSERT`, `UPDATE` ni `DELETE`. `ADD CONSTRAINT … CHECK` valida las filas
existentes (ninguna es `pago_satelite`), no las reescribe.

`schema.prisma`: `pago_satelite` en `PagoMensajeroMovimientoCategoria`, con comentario (SLT-139, «pagado
por la satélite»). `prisma generate` en un worktree con `node_modules` compartido cambia el cliente
de los demás: avisar antes (memoria del leader).

**Multi-empresa.** Ninguna tabla nueva. `pago_mensajero_movimiento` ya tiene `organizacion_id`, RLS por
empresa y la extensión de Prisma que inyecta la empresa. Los `CHECK` no dependen de la empresa.

**País.** Nada depende del país: ni moneda, ni impuesto, ni método de pago nuevo. Los importes son
los snapshots que ya existen.

## 4. Escritura: el feed (R317, R318, R340)

`WalletMensajeroFeedService.construirMovimientosDePago`. El `findUnique` del cierre lee además
`destinoTipo` (sigue siendo una sola lectura; `WalletMensajeroFeedTxClient` es `Pick<PrismaClient,
"cierreDia">`, así que el tipo no cambia):

```ts
if (P.gt(0)) libro.push(devengo(P));                          // pago_devengado = P, siempre
if (!cierre.pagoIndependienteEfectivo) {
  if (pagado.gt(0)) libro.push(pago("pago_efectivo", pagado)); // R325/R340: regla de la 44, intacta
} else if (cierre.destinoTipo === "bodega_satelite" && P.gt(0)) {
  libro.push(pago("pago_satelite", split.devengado));          // R317: P, no min(P,E)
}                                                              // nuevo central: nada mas (R313)
// egreso_pago_mensajero = P, sin cambio (R341)
```

- El feed no sabe si lo llama la aprobación o la conciliación: un cierre de satélite solo llega desde
  la conciliación (`resolverCierre` asienta solo `bodega_central`). La fecha la pone
  `asentarCierreDia` con el instante de la marca (`fechar`, SLT-73 R22): `pago_devengado` y
  `pago_satelite` del mismo cierre llevan la misma fecha (R317).
- **La regla la decide la marca** (SLT-123 R327); el destino solo elige, dentro de la regla nueva,
  si el pago lo puso la satélite. Un cierre viejo de satélite escribe `pago_efectivo` aunque se concilie
  hoy (R340).
- **Idempotente** (R318): `crearMovimientos` con `skipDuplicates` + `pago_mensajero_movimiento_origen_uq`.
- `PAGO_MENSAJERO_FEED_CATEGORIA_SEED` (`lib/types/wallet-mensajero.ts`) gana `pago_satelite`.

## 5. Lectura: lo pendiente de un cierre

### 5.1 `derivarPendienteCierre` (R338)

La entrada pasa a una **unión discriminada por la marca**:

```ts
interface PendienteCierreBase {
  pagoDebido: string | Prisma.Decimal;   // P
  efectivo: string | Prisma.Decimal;     // E (solo la regla vieja)
  premiosVivos: string | Prisma.Decimal;
  pagadoVigente: string | Prisma.Decimal;
}
export type PendienteCierreInput = PendienteCierreBase &
  (
    | { pagoIndependienteEfectivo: false; pagadoPorSatelite?: string | Prisma.Decimal }
    | { pagoIndependienteEfectivo: true; pagadoPorSatelite: string | Prisma.Decimal }
  );

const generado = pagoIndependienteEfectivo ? round2(P) : new Prisma.Decimal(calcularSplitPago(P, E).pendiente);
const satelite = pagoIndependienteEfectivo ? round2(pagadoPorSatelite) : CERO; // viejo: se ignora (R338)
const pendiente = generado.add(premio).sub(yaEntregado).sub(satelite);
return pendiente.gt(0) ? pendiente.toFixed(2) : "0.00";
```

Por qué la unión y no un campo obligatorio a secas:
- Los seis consumidores de producción pasan la marca como `boolean` (`r.pagoIndependienteEfectivo ===
  true`). Con la unión, TypeScript exige `pagadoPorSatelite` a cada uno: si falta, no compila. Es el
  mismo efecto que el campo obligatorio de SLT-123.
- Los cuatro tests que llaman a la función con `pagoIndependienteEfectivo: false` literal
  (`liquidacion-idempotencia`, `premio-ranking-idempotencia`, `caja-173-alcance.guardia`,
  `cierre-dia-service-totales-mixtos`) siguen compilando sin tocarlos: caracterizan la regla vieja,
  donde el término no existe.
- En un cierre viejo el término se ignora aunque venga distinto de cero: la fórmula vieja queda igual
  pase lo que pase en el libro (R342).

`pendiente-cierre.test.ts` fija el contrato del tipo con `// @ts-expect-error` (marca `boolean` sin el
campo) y con una lectura estática: toda llamada a `derivarPendienteCierre` en `lib/` nombra
`pagadoPorSatelite` (T4.1). Si el compilador de este repo no aplicara la unión a una marca `boolean`,
T4.1 lo detecta y el campo pasa a obligatorio (riesgo en §14).

En el mismo archivo se exporta `LecturaPagadoSateliteAusenteError` (§5.3).

### 5.2 La lectura (R333, R334)

Una interfaz aparte, en `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`:

```ts
/** SLT-139 (R333, R334): Σ `pago_satelite` del libro con origen en cada cierre. */
export interface IPagadoPorSateliteLectura {
  sumarPagadoSatelitePorCierre(cierreIds: string[]): Promise<Record<string, string>>;
}
```

`PagoMensajeroMovimientoRepository implements IPagoMensajeroMovimientoRepository,
IPagadoPorSateliteLectura`. La implementación copia el molde de `sumarPremiosVivosPorCierre`: una
entrada por cada id pedido (`"0.00"` si no hay filas); con la lista vacía devuelve sin consultar; un
`groupBy` por `origenId` con `origenTipo: "cierre_dia"`, `origenId: { in: cierreIds }`, `categoria:
"pago_satelite"`; suma con `Prisma.Decimal`, `toFixed(2)`.

**Empresa** (R333): el repositorio recibe el cliente con la extensión de empresa y la RLS de
`pago_mensajero_movimiento` lo acota. No hay SQL a mano.

**Por qué una interfaz aparte.** `IPagoMensajeroMovimientoRepository` lo implementan a mano seis
dobles de test (`: IPagoMensajeroMovimientoRepository = { … }`, en `cierres-admin-repository`,
`cierres-admin-confirmacion-fisica`, `cierres-admin-aplicacion-gestiones`,
`CierresAdminRepository.resolverCierre.devolucion`, `liquidacion-anulacion`, `liquidacion-service`).
Un método obligatorio más en esa interfaz rompe los seis sin que ninguno use la lectura.

### 5.3 Los consumidores (R319, R334, R335, R344)

**Regla común.** Cada consumidor lee lo pagado por la satélite **solo de los cierres nuevos y aprobados**
que tiene delante, **como mucho una vez** por llamada (lista, página o cierre), nunca una por fila. Si
no hay ninguno nuevo, no llama. En un cierre viejo pasa `pagoIndependienteEfectivo: false` sin el
término.

**La dependencia es opcional en el tipo y ruidosa si falta.** Las tres clases ya reciben, en producción,
el `PagoMensajeroMovimientoRepository` real (como lectura de premios o como `mensajeroRepo`), que
implementa la lectura. El tipo la declara opcional (`Partial<IPagadoPorSateliteLectura>`) para no
tocar los ~40 archivos de test que construyen estos servicios con un doble de premios de una sola
función (medido: `sumarPremiosVivosPorCierre` aparece en 46 archivos de `tests/`). Si falta y hay un
cierre nuevo, ningún consumidor inventa un número:

| Consumidor | Archivo | De dónde sale la lectura | Si falta y hay un cierre nuevo |
|---|---|---|---|
| `CierresAdminService.conPendiente` (cola, histórico y detalle; central y satélite) | `lib/services/CierresAdminService.ts:1326-1371` | `premiosRepo` (`PremiosLecturaRepo = Pick<…, "sumarPremiosVivosPorCierre"> & Partial<IPagadoPorSateliteLectura>`) | lanza `LecturaPagadoSateliteAusenteError` (el borde lo normaliza a error; la pantalla no pinta una cifra) |
| `CierresAdminService.pendienteTrasAprobar` | `:1387-1404` | ídem | `"0.00"`: no ofrece pagar (es la respuesta segura que ya documenta el método) |
| `CierreDiaService.conPendientePago` (`/cierre-dia`) | `lib/services/CierreDiaService.ts:628-649` | `pendientes.premios` (`LecturasPendienteCierre.premios` gana `sumarPagadoSatelitePorCierre?`) | esos cierres salen sin `pendientePagoMensajero` (`undefined` = «Sin dato», el contrato de SLT-137 R157) |
| `LiquidacionService.imputablesDe`, `restanteTrasAnular`, `pendienteDelCierre` | `lib/services/LiquidacionService.ts:1094-1131`, `:1241-1264`, `:1371-1383` | `mensajeroRepo` (tipo `IPagoMensajeroMovimientoRepository & Partial<IPagadoPorSateliteLectura>`) | lanza `LecturaPagadoSateliteAusenteError` dentro de la transacción, antes de escribir (R344) |

En `LiquidacionService` la lectura siempre devuelve `"0.00"` en producción: la central solo paga
cierres `bodega_central` (SLT-122) y `pago_satelite` solo nace en cierres de satélite. Se hace igual,
por el mismo motivo que la 293 lee los premios al aprobar: dos fórmulas para el mismo número acaban
diciendo cifras distintas.

**Cableado** (R335, R344). `lib/actions/cierres-admin.ts`, `lib/actions/cierre-dia.ts` y
`lib/actions/liquidacion.ts` **no cambian**: ya pasan `new PagoMensajeroMovimientoRepository(prisma)`
en la posición que los servicios leen. `cierre-dia-pendiente-cableado.test.ts` ejecuta las tres
acciones sin servicio inyectado y comprueba que el argumento recibido es el repositorio real y que
`sumarPagadoSatelitePorCierre` es una función (patrón SLT-137).

Las pantallas no cambian de código: `pagoEntregadoDe`, `PendienteLiquidarBadge` y la celda «Pago» de
`/cierre-dia` pintan el string del servidor (SLT-95 R71). Cambia el número que llega.

## 6. La consolidación (R322, R323)

`CierreDiaConsolidableRow` gana `pagoIndependienteEfectivo: boolean` **obligatorio** (B1 de la review
de SLT-123: una marca opcional en una fila de repositorio se pierde sin aviso si el mapper deja de
emitirla). `CONSOLIDABLE_SELECT` lee la columna y `toConsolidableRow` la emite. La fila del cliente
(`CierreConsolidableCola`) no cambia: la fila del repositorio es asignable a ella.

`CierreBodegaService.listarConsolidacion`:

```ts
const viejos = consolidables.filter((c) => !c.pagoIndependienteEfectivo);
const nuevos = consolidables.filter((c) => c.pagoIndependienteEfectivo);
const { pagado, centralDebe } = repartirEfectivo(
  sumTotales(viejos).efectivo,                       // R322: solo el efectivo de los viejos
  viejos.map((c) => c.totalPagoMensajero),           // R322: solo sus pagos
);
const pagadoTotal = new Prisma.Decimal(pagado).plus(sumPagoMensajero(nuevos)); // R323
const totalCentralDebeAgregado = centralDebe;
const totalNetoAgregado = netoDe(totalesAgregados.general, pagadoTotal.toFixed(2));
```

- Con solo cierres viejos, `sumTotales(viejos)` es el conjunto entero y el resultado es el de hoy
  (R323).
- Con solo nuevos, `repartirEfectivo("0.00", [])` da `"0.00"` y la tarjeta no se pinta: `tarjetasAConsolidar`
  ya la omite con `esMontoCero` (sin cambio de cliente).
- No cambian `totalesAgregados`, `totalPagoMensajeroAgregado`, `totalIngresoBodegaRechazosAgregado`,
  `paraLaCentralAgregado`, `incluyeModeloNuevoAgregado` ni el snapshot que escribe
  `solicitarCierreBodega` (que no guarda ni `centralDebe` ni el neto).
- `ConsolidacionBodegaModule` pinta el `totalCentralDebeAgregado` del servidor: se corrige sin tocarlo.

## 7. La categoría nueva en los catálogos (R329)

El enum gana un valor y el compilador señala cada `Record` total. Los encontrados:

| Archivo | Qué se añade |
|---|---|
| `lib/types/wallet-mensajero.ts` | `PAGO_MENSAJERO_MOVIMIENTO_CATEGORIA_SEED` y `PAGO_MENSAJERO_FEED_CATEGORIA_SEED` |
| `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts` | `CATEGORIA_PAGO_LABEL.pago_satelite = "Pagado por la satélite"` (estado de cuenta y su descarga) |
| `lib/utils/aporte-por-orden.ts` | `FUENTE_MENSAJERO.pago_satelite = { tipo: "snapshot_gestion", campo: "pago_mensajero" }`: es `P`, que sí se reparte por guía (ficha 468: 208 de 208 cuadran) |
| `lib/utils/estado-cuenta-chips.ts` | `pago_satelite: () => "cierres"` |
| `lib/analytics/metrics.ts` | `"pago_satelite"` en `cuenta_por_pagar_mensajero.definicion.categorias` (el cálculo agrega por `tipo` y no cambia) |

No necesitan cambio: `ConciliacionCierresAnaliticaRepository` (compara el libro de tienda),
`claveDeParMensajero` (`pago_satelite` no tiene contraasiento: cae en `null`, como `pago_efectivo`),
`CuentasPorPagarAnaliticaRepository` (agrega por `tipo`). Ningún filtro `categoria: { in: [...] }` de
`lib/` enumera las categorías de pago del mensajero (buscado). T0.3 confirma la lista con el
typecheck.

## 8. La nota de «Pago a mensajeros» (R324)

`components/private/cierres/cola/cola-cierres-labels.ts`:

```ts
export const notaPagoMensajeros = (n: number) => (n === 1 ? "1 mensajero" : `${n} mensajeros`);
```

`NOTA_CENTRAL_DEBE` («el efectivo no alcanzó para pagar a todos los mensajeros») no cambia: con R322
la cifra solo sale de cierres viejos, a los que se les sigue pagando del efectivo.

## 9. El dato para SLT-112 (D12, PA5, R345)

SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» decide si lo pagado por la
satélite cuenta en «Ganancia pagada este mes». Esta ficha expone, y nada más:

1. **Las filas del libro.** `pago_mensajero_movimiento` con `tipo = 'pago'`, `categoria =
   'pago_satelite'`, `origen_tipo = 'cierre_dia'`, `origen_id` = el cierre, `mensajero_id`, `monto` = P
   del cierre y `fecha_movimiento` = instante de la **primera** marca de conciliación de su
   consolidación (R317, R345). «Corregir recibido» reescribe `cierre_bodega.conciliado_at` pero no
   re-asienta (`corregirConciliacion` no llama al feed), así que la fecha de la fila no se mueve;
   «Desmarcar» se niega con `con_asientos` porque el cierre ya tiene `egreso_pago_mensajero` en caja
   (`consolidacionesConDinero`). Con eso, filtrar por `categoria` y por `fecha_movimiento` en un mes da
   lo pagado por la satélite en ese mes, por mensajero.
2. **La suma por cierre.** `IPagadoPorSateliteLectura.sumarPagadoSatelitePorCierre(cierreIds)` →
   `Record<cierreId, string>` (escala 2, `"0.00"` por defecto, acotada a la empresa).
3. **Lo pendiente.** `derivarPendienteCierre` ya resta lo pagado por la satélite en los cierres nuevos:
   SLT-112 lee lo pendiente con esa función (SLT-123 `## Fuera de alcance`).

Esta ficha **no** expone ninguna suma por mes, ninguna cifra de «ganancia» ni ningún campo nuevo en un
DTO de pantalla.

## 10. Superficies

| # | Superficie | Lee | ¿Cambia? |
|---|---|---|---|
| 1 | Aprobar un cierre de satélite (`/cierres-admin`, adminSatelite y maestro) | `resolverCierre` | **Sí**: la marca en `true` (R336). Nada visible en el acto |
| 2 | `/cierres-admin` satélite: cola, histórico y detalle («Pago entregado», `PendienteLiquidarBadge`) | `CierresAdminService.conPendiente` | **Sí**, en cierres nuevos: `P` antes de conciliar, `0.00` después (R319, D10) |
| 3 | `/cierres-admin` central: cola, histórico y detalle | ídem | **No** en la cifra (lo pagado por la satélite de un cierre central es 0); cambia la consulta (una lectura más si hay cierres nuevos) |
| 4 | `/cierre-dia` del mensajero de satélite, celda «Pago» | `CierreDiaService.conPendientePago` | **Sí**, en cierres nuevos (R319) |
| 5 | Conciliar una consolidación de satélite (`/cierres-admin` → Bodega, maestro) | `marcarConciliado` → feed | **Sí**: el libro del cierre nuevo lleva `pago_satelite = P` y no `pago_efectivo` (R317) |
| 6 | Consolidación: tarjeta «La central debe» (cola «A consolidar» y `ConsolidacionBodegaModule`) | `CierreBodegaService.listarConsolidacion` | **Sí** (R322) |
| 7 | Consolidación: `totalNetoAgregado` (en el contrato, no se pinta, SLT-106 R204) | ídem | **Sí** (R323) |
| 8 | Consolidación: nota de «Pago a mensajeros» | `cola-cierres-labels.ts` | **Sí**, texto (R324) |
| 9 | `/wallet/mensajeros` lista, estado de cuenta y su descarga (devengado, pagado, cuenta por pagar) | libro (`WalletMensajeroService`) | **Sí**: la fila «Pagado por la satélite»; la cuenta por pagar de un cierre nuevo conciliado es 0 (R319, R329) |
| 10 | Detalle de un movimiento / libro kardex / búsqueda por guía (469) | `FUENTE_MENSAJERO` | **Sí**: la fila nueva se abre por guía (R329) |
| 11 | Estado de cuenta: chips | `estado-cuenta-chips.ts` | Solo el chip de la categoría nueva |
| 12 | Analítica de cuentas por pagar | libro, por `tipo` | **Sí** la cifra (un cierre nuevo conciliado aporta 0, antes `P − min(P,E)`); el cálculo no cambia; el catálogo nombra la categoría (R329) |
| 13 | Tope de «Registrar pago», reparto «Pagar», anular un pago, pendiente tras aprobar | `LiquidacionService`, `pendienteTrasAprobar` | **No** en la cifra (solo cierres de la central); hacen una lectura más si el cierre es nuevo (R344) |
| 14 | Caja: «Salió», ganancia, tesorería, `/wallet` | `wallet_movimiento` | **No** (R341, D11) |
| 15 | Deuda de la satélite, «Debe llegar a la central», `/wallet/satelites`, estado de cuenta de la bodega, conciliación de satélites (esperado y diferencia) | `paraLaCentral`, `aporte-satelite-sql.ts`, `asentarDiferenciaSatelite` | **No** (R341) |
| 16 | Aviso «el efectivo no cubre los descuentos» (393 R37) | `efectivoCubreDescuentos` | **No**: habla del efectivo de la satélite, que sigue pagando `P` y la bodega |
| 17 | Conciliación analítica de cierres | libro de tienda | **No** (R341) |
| 18 | «Ganancia» del mensajero en `/cierre-dia` y columna Ganancia | `totalPagoMensajero` (P) | **No** (R341) |
| 19 | Premios del ranking e incentivos | `sumarPremiosVivosPorCierre` | **No** (R341) |
| 20 | «Corregir recibido» y «Desmarcar» de una conciliación | `corregirConciliacion`, `revertirConciliacion` | **No** (R345) |
| 21 | Descargas de `/cierres-admin` (cola, histórico) y de «A consolidar» | `cierres-admin-descarga-columnas.ts`, `filaDescargaConsolidable` | **No**: no llevan lo pendiente ni la marca |
| 22 | `CentralDebeTotal` (`cierre-detalle-shared.tsx`) | — | **No**: no se pinta en ninguna pantalla (buscado) |
| 23 | Cierres de la central (aprobar, libro, pendiente) | SLT-123 | **No**: la marca pasa al `updateMany` pero el resultado es el mismo |
| 24 | Tarjetas de ganancia (SLT-112), Excel del modelo nuevo (SLT-113) | — | No existen todavía |

## 11. Lo que cambia para la gente (no es código)

El mensajero de satélite ya no «se queda» su pago del efectivo de su cierre: la satélite le paga `P`
y se lo descuenta de lo que manda a la central (como ya hacía en la deuda). En `/cierres-admin` y en
`/cierre-dia` su cierre sale «Pendiente» hasta que la central concilia (D10, se revisa en Preview).
La consolidación ya no dice que la central debe el pago de un cierre nuevo.

## 12. Alternativas descartadas

1. **Un método obligatorio más en `IPagoMensajeroMovimientoRepository` y en `PremiosLecturaRepo`.** Es
   lo que proponía el diseño de referencia de SLT-123. Descartada: rompe el tipo de seis dobles que
   implementan la interfaz y de ~40 archivos que construyen `CierresAdminService`/`CierreDiaService`
   con un doble de premios de una función; el PR no cabe en 40 archivos. La interfaz aparte (§5.2) y la
   dependencia opcional con fallo ruidoso (§5.3) dan la misma garantía en producción, con la prueba de
   cableado (R335, R344).
2. **Un `pendientes.pagadoSatelite` nuevo en `CierreDiaService`, cableado en `lib/actions/cierre-dia.ts`**
   (diseño de referencia §5.3). Descartada: el objeto que ya se pasa como `premios` es el repositorio
   que tiene la lectura; un segundo cableado es una línea más que puede faltar.
3. **Derivar «pagado por la satélite» de la conciliación** (`cierre_bodega.conciliado_at` no nulo ⇒
   pagado `P`), sin leer el libro. Descartada: R338 lo define como la suma del libro, y una fecha
   mutable de otra tabla no sirve de ancla («Corregir recibido» la reescribe; memoria del leader).
4. **Llevar lo pagado por la satélite en la fila del repositorio** (`CierreAdminResumenRow`,
   `CierrePasadoDTO`). Descartada: obliga a una lectura asíncrona en cada listado del repositorio y a
   un campo obligatorio más en filas que construyen decenas de tests.
5. **Reutilizar `pago_efectivo` o `ajuste_pago`.** Descartada (SLT-123 §10.5): `pago_efectivo` diría
   «tomado del efectivo» cuando lo puso la satélite; `ajuste_pago` está fuera del único parcial (no
   sería idempotente) y la analítica lo trata como ajuste.
6. **Escribir `pago_satelite` al aprobar y no al conciliar.** Descartada: el dinero de la satélite entra a
   los libros al conciliar (SLT-73 R10, D2); el pago al mensajero va con su devengo, en la misma
   transacción y con la misma fecha.
7. **Partir la ficha (escritura y lectura por separado).** Descartada: ninguna mitad se mergea sola
   sin dejar dinero contradictorio (`requirements.md > PA1`).

## 13. Pruebas contra Postgres real

### 13.1 Integración: `tests/integration/db/slt139-pago-satelite.int.test.ts`

Base desechable con todas las migraciones aplicadas (memorias del leader: `.env` copiado al worktree,
base exportada antes de cualquier `vitest`, nunca `migrate reset`). Importes escritos a mano, nunca
derivados de la función que se prueba.

Empresa A, zona satélite Z1 y central:

| Cierre | Destino | Marca | P | E | General | Cómo llega |
|---|---|---|---|---|---|---|
| VC | satélite | `false` | 3 000.00 | 1 000.00 | 5 000.00 | aprobado, consolidado y conciliado con el feed viejo (fixture: `pago_devengado 3000.00`, `pago_efectivo 1000.00`, caja `egreso_pago_mensajero 3000.00`) — la foto |
| VS | satélite | `false` | 3 000.00 | 2 000.00 | 5 000.00 | aprobado sin marca (fixture: «aprobado entre los dos merges»), sin consolidar |
| NS | satélite | — | 2 500.00 | 1 000.00 | 4 000.00 (1 000 efectivo + 3 000 SINPE) | `solicitado` → aprobado con `resolverCierre` real |
| NS0 | satélite | — | 0.00 | 3 000.00 | 3 000.00 | `solicitado` → aprobado con `resolverCierre` real |
| NR | satélite | — | 1 000.00 | 1 000.00 | 1 000.00 | `solicitado` → rechazado |
| NC | central | — | 3 000.00 | 5 000.00 | 5 000.00 | `solicitado` → aprobado con `resolverCierre` real |

K1 = consolidación de Z1 con VS, NS y NS0 (servicio real), conciliada con `marcarConciliado` real.

Afirmaciones:
1. **Foto** (R342): antes de nada, todas las filas de VC en `cierre_dia`, `pago_mensajero_movimiento`,
   `wallet_movimiento`, `liquidacion_pago` y `cierre_bodega`. Al final, la misma foto, idéntica.
2. **Marca** (R336): NS, NS0 y NC en `true`; VS y VC en `false`; NR (rechazado) en `false`. Forzando
   un error después del `updateMany` de la aprobación de un cierre de satélite (T10.1 elige el punto:
   la persistencia de indemnizaciones o la liberación de `sin_gestionar`), el cierre sigue
   `solicitado` con la marca en `false`.
3. **Antes de conciliar** (R319): pendiente (`CierresAdminService` y `CierreDiaService` reales) NS
   `2500.00` (con la regla vieja sería `1500.00`), NS0 `0.00`, VS `1000.00` (3 000 − 2 000, regla
   vieja); ninguna fila de libro de NS ni NS0.
4. **Consolidación mixta** (R322, R323): «La central debe» de K1 = `3000.00` (solo VS: su efectivo 2 000
   no alcanza su pago 3 000); `totalNetoAgregado` = 12 000.00 − 0.00 − 2 500.00 = `9500.00`;
   `paraLaCentralAgregado` = 12 000.00 − 5 500.00 − 0.00 = `6500.00`, igual que antes de la ficha (R341).
   Con el código de antes, K1 daría «La central debe» `0.00` (efectivo 6 000 ≥ 0 + 2 500 + 3 000) y neto
   `6500.00`: los números se eligieron para que la regla vieja y la nueva no coincidan.
5. **Tras conciliar K1** (R317, R340): NS = `[pago_devengado 2500.00, pago_satelite 2500.00]` (no
   `1000.00` = `min(P, E)`), sin `pago_efectivo`, las dos con `fecha_movimiento` = `cierre_bodega.conciliado_at`; VS =
   `[pago_devengado 3000.00, pago_efectivo 2000.00]`, sin `pago_satelite`; NS0 sin filas de libro ni
   egreso de caja. Caja: `egreso_pago_mensajero` NS `2500.00`, VS `3000.00` (R341).
6. **Tras conciliar** (R319): pendiente NS `0.00`, VS `1000.00`; la cuenta por pagar del mensajero de
   NS sube 0 por NS (Σ devengo − Σ pago de sus filas = 0.00).
7. **Idempotencia** (R318): volver a llamar a `asentarCierreDia` sobre NS deja las mismas filas (mismo
   número, mismos importes).
8. **Corregir y desmarcar** (R345): `corregirConciliacion` de K1 con otro monto no cambia ni añade
   filas `pago_satelite` (monto y fecha iguales); `revertirConciliacion` devuelve `con_asientos` y no
   escribe nada.
9. **Lo que no cambia** (R341): `paraLaCentral` de NS = 4 000.00 − 2 500.00 − 0.00 = `1500.00`; premios
   `0.00`; conciliación analítica igual con NS que con un cierre viejo de iguales snapshots; registrar
   un pago de la central contra NS con `LiquidacionService` real sale fuera de alcance (SLT-122) y no
   escribe nada.
10. **Central** (regresión de SLT-123): NC con libro = `[pago_devengado 3000.00]` y pendiente
    `3000.00`.
11. **Empresa** (R333): en la empresa B, un `pago_satelite` de 999.00 con `origen_id` = id de NS (si la
    base rechaza esa fila, uno sobre un cierre de B, y la lectura desde A incluye ese id): la lectura
    desde A da NS `2500.00` (y `"0.00"` para el id de B); desde B, `999.00`.
12. **Categoría** (R329): con `WalletMensajeroService` real, el estado de cuenta del mensajero de NS
    lleva la fila «Pagado por la satélite» de 2 500.00 y su descarga la misma etiqueta; el detalle por
    guía (`FUENTE_MENSAJERO`) suma 2 500.00 con el `pago_mensajero` de sus gestiones; la analítica de
    cuentas por pagar cuenta la fila como pago; `cuenta_por_pagar_mensajero` nombra `pago_satelite`.
13. **Una sola lectura** (R334): con `sumarPagadoSatelitePorCierre` espiado sobre el repositorio real,
    el listado de `/cierres-admin` de Z1 lo llama una vez con NS y NS0, aunque la página tenga más
    filas.

### 13.2 Migración: `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts`

Mismo molde que `migracion-slt68-ida-y-vuelta` y `migracion-slt123-ida-y-vuelta`: **base propia**
(prefijo `slt139_`, fixture `tests/integration/db/_fixtures/ida-y-vuelta-32`), construida aplicando las
migraciones anteriores, porque el `down.sql` del enum recrea el tipo y en la base compartida chocaría
con los archivos que escriben en el libro a la vez. Fija también el orden: las dos carpetas van detrás
de `20261114120000_pago_independiente_efectivo` y de la última de `dev` medida en T1.2.
- Antes de subir: cuenta y suma de cada tabla de dinero; después: iguales (R337).
- Tras subir (R330): la base rechaza `pago_satelite` con `tipo = 'devengo'` (23514), con `origen_tipo
  = 'manual'` (23514) y con `origen_id` nulo (23514); acepta uno válido; un segundo con el mismo
  (cierre, mensajero) choca con `pago_mensajero_movimiento_origen_uq` (R318 en la base).
- `down.sql` de los CHECK con una fila `pago_satelite`: aborta y no cambia nada (el CHECK sigue
  admitiendo la categoría). `down.sql` del enum con la fila: aborta.
- Sin filas: los dos `down.sql` en orden dejan el CHECK con la definición de SLT-68 (texto de
  `pg_get_constraintdef`), sin el CHECK de origen y sin `pago_satelite` en `pg_enum`.

### 13.3 Mutaciones

En `tasks.md > T10.2`, con el test que debe caer.

## 14. Riesgos

- **La unión de §5.1 depende de cómo TypeScript compara una marca `boolean` contra una unión
  discriminada.** Si en este repo no obliga a `pagadoPorSatelite`, T4.1 lo detecta (`@ts-expect-error`
  sin error = rojo) y el campo pasa a obligatorio: +4 archivos de test (los que pasan `false` literal).
- **Tests de integración y E2E que aprueban un cierre de satélite por el camino real y esperan
  `pago_efectivo` al conciliar.** Con R336 su cierre pasa a nuevo. Previsto:
  `slt73-marcar-asienta.int.test.ts` (aprueba con `aprobar` real) y el caso 6 de
  `slt123-pago-independiente.int.test.ts` (afirma que S1 queda sin marca). T0.2 los mide; cada uno pasa
  a la regla nueva con sus importes a mano o se le da un cierre viejo (fixture con la marca en
  `false`), según lo que caracterice. Nunca se borra una aserción sin sustituirla.
- **Fallo ruidoso en producción si alguien cambia el cableado.** Un `CierresAdminService` sin la
  lectura rompe el listado con un cierre nuevo en vez de mostrar una cifra falsa. La prueba de
  cableado lo impide antes de mergear.
- **`node_modules` compartido y Prisma**: `prisma generate` con el enum nuevo cambia el cliente para
  otros worktrees (memoria del leader). Avisar antes.
- **SLT-112 en paralelo** toca la misma zona (`requirements.md > PA2`).

## 15. En qué se aparta del diseño de referencia de SLT-123

| Referencia (SLT-123 design) | Aquí | Por qué |
|---|---|---|
| §5.1: `pagadoPorSatelite` obligatorio | unión discriminada por la marca (§5.1) | mismo efecto en los consumidores de producción; no toca cuatro tests de la regla vieja |
| §5.2: método en `IPagoMensajeroMovimientoRepository` | interfaz aparte `IPagadoPorSateliteLectura` (§5.2) | seis dobles implementan la interfaz a mano |
| §5.3: `pendientes.pagadoSatelite` y cableado nuevo en las acciones; `CierresAdminService` «no compila sin el repositorio» | la lectura viaja en el repositorio que ya se inyecta; dependencia opcional con fallo ruidoso (§5.3) | ~40 archivos de test construyen los servicios con un doble de premios; las acciones no cambian |
| §11.1: casos N2, V3/N4 | casos VC, VS, NS, NS0, NR, NC (§13.1) | la consolidación mixta de la referencia (V3 con E = 0) no distingue la regla nueva de la vieja ni mata la mutación «efectivo de todo el conjunto» |
