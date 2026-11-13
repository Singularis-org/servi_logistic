# SLT-139 «Pago al mensajero independiente del efectivo: satélite» — requirements

> Ruta: completa (toca dinero, esquema, enum y migraciones). Zona: **fullstack**. Depende de SLT-123
> «Pago al mensajero independiente del efectivo» (en `dev` desde el PR #145).
> Escrito por spec_author el 2026-11-12. Requisitos heredados de SLT-123 con su número y su texto
> (`specs/SLT-123-pago-independiente-efectivo/requirements.md > Fuera de alcance → SLT-139`): R317-R319,
> R322-R324, R329, R330, R333-R338. Requisitos nuevos de esta ficha: **R340-R345**.

## Alcance

**El problema (medido en el código de `dev`, 2026-11-12).** SLT-123 dejó la regla nueva solo para la
central: `CierresAdminRepository.resolverCierre` pone `cierre_dia.pago_independiente_efectivo = true`
solo si el destino es `bodega_central` (`:2452-2461`). Un cierre de satélite se sigue aprobando con la
marca en `false` y, al conciliar su consolidación, el feed escribe `pago_efectivo = min(P, E)`
(`WalletMensajeroFeedService:74`). Encima, la consolidación reparte el efectivo de **todos** sus
cierres entre los pagos y muestra «La central debe» lo que no alcanzó
(`CierreBodegaService.listarConsolidacion:304-310`), aunque la deuda de la satélite ya le descuenta
el pago completo `P` (`paraLaCentral`, SLT-73 D4).

**Lo que entra.**
- La marca para **todo** cierre que pasa a `aprobado`, también de satélite, en la misma escritura que
  lo aprueba (R336).
- La categoría de libro `pago_satelite` (enum y sus `CHECK`, en migraciones propias) y su escritura al
  conciliar: el mensajero de un cierre nuevo de satélite devenga `P` y queda pagado por la satélite
  (R317, R318, R330, R337, R340).
- Lo pendiente de un cierre nuevo resta lo pagado por la satélite (R319, R338), con una lectura por
  página, dentro de la empresa y cableada en producción (R333-R335, R344).
- «La central debe», el neto de la consolidación y la nota de «Pago a mensajeros» (R322-R324).
- Los catálogos de la categoría nueva: estado de cuenta, descarga, detalle por guía, analítica (R329).
- El dato que SLT-112 consume sobre lo «pagado por la satélite» (R345, `design.md > 9`).

**Lo que NO entra.**
- Recalcular, completar o compensar cierres ya aprobados con la marca en `false`, de la central o de
  satélite, también los aprobados entre el merge de SLT-123 y el de esta ficha (D5).
- La caja (`wallet_movimiento`): `egreso_pago_mensajero = P` no cambia (D11).
- La deuda de la satélite, «Debe llegar a la central» (`paraLaCentral`) y el aviso «el efectivo no
  cubre los descuentos» (393 R37): no cambian.
- Quién puede pagar (SLT-122: la central solo paga cierres `bodega_central`) (D7).
- Las tarjetas «Ganancia pendiente de pago» y «Ganancia pagada este mes» y si lo pagado por la
  satélite cuenta como pagado: lo decide SLT-112 (D12).
- Premios del ranking e incentivos: siguen igual.

## Decisiones cerradas (no reabrir)

Heredadas de SLT-123 (`specs/SLT-123-pago-independiente-efectivo/requirements.md`), con la parte que
aplica a esta ficha.

| # | Decisión | Quién, cuándo | Cubierta por |
|---|---|---|---|
| D1 | El mensajero devenga su pago completo como deuda y nunca se da por pagado con su efectivo (hoy `min(P,E)`, feature 44). | Carlos, ficha SLT-123 | R317, R338 |
| D3 | Satélite: la conciliación lo registra como pagado por la satélite. | Carlos, ficha SLT-123 | R317, R318, R319, R329, R330, R345 |
| D4 | Se corrige «Central debe» de la consolidación. | Carlos, ficha SLT-123 | R322, R323 |
| D5 | Opción (a): los cierres ya aprobados se quedan como están (`min(P,E)`). La regla nueva aplica solo a los aprobados desde el despliegue. Sin recálculo ni deuda retroactiva. | Carlos, 2026-11-12 | R336, R340, R342 |
| D6 | Viejo y nuevo se distinguen con la marca propia del cierre (`cierre_dia.pago_independiente_efectivo`), puesta por la misma transacción que lo aprueba. Ninguna fecha de corte. | spec_author por encargo del leader, 2026-11-12 | R336, R338, R340 |
| D7 | La central no paga cierres de satélite (SLT-122). No se reabre. | Carlos, 2026-11-10 | R341 |
| D9 | (PA1) Se quita «· se paga del efectivo» de la nota de «Pago a mensajeros» de «A consolidar». | Carlos, 2026-11-12 | R324 |
| D10 | (PA2) Un cierre nuevo de satélite sale «Pendiente» hasta que la central concilia. Se acepta y se revisa en Preview. | Carlos, 2026-11-12 | R319 (+ `tasks.md > T12.3`) |
| D11 | (PA3) La caja no se toca: `egreso_pago_mensajero = P`. | Carlos, 2026-11-12 | R341 |
| D12 | (PA5) Si lo «pagado por la satélite» cuenta en «Ganancia pagada este mes» lo decide SLT-112. Aquí no se toca ninguna cifra de ganancia. | Carlos, 2026-11-12 | R341, R345 |
| D13 | El valor de enum `pago_satelite` y sus `CHECK` van en las migraciones de SLT-139, no en la de SLT-123. | spec_author, 2026-11-12 | R330, R337 |

## Requisitos (EARS)

Vocabulario (el de SLT-123): **P** = `cierre_dia.total_pago_mensajero`. **E** =
`cierre_dia.total_efectivo`. **La marca** = `cierre_dia.pago_independiente_efectivo`. **Cierre nuevo**
= marca en `true`; **cierre viejo** = marca en `false`. **Lo pagado por la satélite** de un cierre = Σ
de los movimientos `pago_satelite` del libro con origen en ese cierre. Todos los importes son strings
de escala 2, calculados con `Prisma.Decimal`.

### La marca

- **R336** — CUANDO un cierre del día pasa a `aprobado` (desde `solicitado` o `vencido`), con
  cualquier destino, el sistema DEBE poner la marca de ese cierre en `true`, en la misma escritura y
  la misma transacción que lo aprueba. Si la transacción revierte, la marca DEBE quedar como estaba.
  Un cierre de satélite aprobado antes de SLT-139 conserva la marca en `false` (como D5).

### La escritura al conciliar

- **R317** — CUANDO se concilia una consolidación de satélite, por cada cierre nuevo que incluye y
  con P > 0, el sistema DEBE escribir en el libro del mensajero `pago_devengado = P` y un pago
  `pago_satelite = P`, los dos con la fecha de la marca de conciliación, y NINGÚN `pago_efectivo`.
- **R318** — SI la escritura de R317 se repite para el mismo cierre (reintento o segunda llamada),
  ENTONCES el sistema NO DEBE duplicar ninguna fila.
- **R340** — CUANDO se concilia una consolidación que incluye cierres viejos y nuevos, el sistema
  DEBE asentar cada cierre con la regla de su propia marca: un cierre viejo, `pago_devengado = P` y
  `pago_efectivo = min(P, E)` (si es > 0) y ningún `pago_satelite`; un cierre nuevo, lo de R317. Un
  cierre de satélite aprobado antes de SLT-139 y conciliado después DEBE asentarse como viejo.

### Lo pendiente

- **R338** — MIENTRAS un cierre `aprobado` sea nuevo, lo pendiente de R315 DEBE restar además lo
  «pagado por la satélite»: la suma de los movimientos `pago_satelite` del libro con origen en ese
  cierre. En un cierre viejo ese término DEBE ignorarse.
- **R319** — MIENTRAS un cierre nuevo de satélite no esté conciliado, lo pendiente DEBE ser P (más
  premios vivos, menos pagos vigentes). CUANDO se concilia, lo pendiente DEBE pasar a `"0.00"` y su
  aporte a la cuenta por pagar del mensajero DEBE ser 0.
- **R333** — La lectura de «pagado por la satélite» por cierre DEBE quedarse dentro de la empresa
  activa: con dos empresas en la base, la de una nunca suma movimientos de la otra.
- **R334** — Los listados DEBEN obtener «pagado por la satélite» con una sola lectura por página, sin
  que el número de consultas crezca con el tamaño de página.
- **R335** — Las acciones de producción que construyen `CierreDiaService` y `CierresAdminService`
  DEBEN inyectarles la lectura de «pagado por la satélite». Un servicio sin ella NO DEBE emitir un
  pendiente inventado.
- **R344** — La acción de producción que construye `LiquidacionService` DEBE inyectarle la lectura de
  «pagado por la satélite». SI el servicio no la tiene y la operación toca un cierre nuevo, ENTONCES
  NO DEBE calcular un tope, una ventana de reparto ni un restante, y NO DEBE escribir ningún pago ni
  anulación.

### La consolidación

- **R322** — «La central debe» de la consolidación de la satélite DEBE calcularse solo con los cierres
  viejos del conjunto: el efectivo de esos cierres se reparte entre sus pagos como hoy (de menor a
  mayor, sin pagos parciales). Un cierre nuevo DEBE aportar 0. SI todos los cierres del conjunto son
  nuevos, ENTONCES «La central debe» DEBE valer `"0.00"` y la tarjeta NO DEBE pintarse.
- **R323** — `totalNetoAgregado` de la consolidación DEBE ser `recaudado − pagado del efectivo a los
  cierres viejos (R322) − Σ P de los cierres nuevos`. SI todos los cierres del conjunto son viejos,
  ENTONCES DEBE ser el mismo número que antes de esta ficha.
- **R324** — *(Según PA1.)* La nota de la tarjeta «Pago a mensajeros» de «A consolidar» DEBE ser
  «1 mensajero» o «<n> mensajeros», sin «· se paga del efectivo».

### La categoría nueva

- **R329** — Un movimiento `pago_satelite` DEBE mostrarse como «Pagado por la satélite» en el estado
  de cuenta del mensajero y en su descarga. Su detalle por guía DEBE salir del pago al mensajero de
  cada gestión (como `pago_devengado`). La analítica de cuentas por pagar DEBE contarlo como pago, y
  el catálogo de métricas DEBE nombrarlo.
- **R330** — La base DEBE rechazar un movimiento `pago_satelite` cuyo `tipo` no sea `pago` o cuyo
  origen no sea un `cierre_dia` con `origen_id` no nulo.
- **R345** — Cada movimiento `pago_satelite` DEBE llevar el mensajero, el cierre de origen, el monto P
  y la fecha de la primera marca de conciliación de su consolidación. CUANDO se corrige el monto
  recibido de esa consolidación, o se intenta desmarcarla, el sistema NO DEBE cambiar, borrar ni
  duplicar esas filas.

### Migraciones

- **R337** — Las migraciones de SLT-139 DEBEN ser aditivas: añaden el valor de categoría
  `pago_satelite` y sus `CHECK`, y NO DEBEN insertar, actualizar ni borrar ninguna fila de
  `cierre_dia`, `pago_mensajero_movimiento`, `wallet_movimiento`, `liquidacion_pago` ni
  `cierre_bodega`. Sus `down.sql` DEBEN dejar la base como estaba antes, y DEBEN abortar sin tocar
  nada si alguna fila usa `pago_satelite`.

### Lo que no cambia

- **R341** — Esta ficha NO DEBE cambiar:
  - la caja (`wallet_movimiento`): `egreso_pago_mensajero = P` al asentar;
  - la deuda de la satélite ni «Debe llegar a la central» (`paraLaCentral`);
  - los premios y los incentivos;
  - la «Ganancia» (P) que ve el mensajero;
  - la conciliación analítica de cierres;
  - quién puede pagar un cierre (la central solo paga cierres `bodega_central`).
  Con un cierre nuevo de satélite y uno viejo de iguales snapshots, esas cifras DEBEN ser las mismas.
- **R342** — El sistema NO DEBE reescribir, completar ni compensar nada de un cierre viejo, de la
  central o de satélite. Con un cierre viejo ya conciliado y uno nuevo de satélite en la misma base,
  las filas del viejo en `cierre_dia`, `pago_mensajero_movimiento`, `wallet_movimiento`,
  `liquidacion_pago` y `cierre_bodega` DEBEN ser idénticas antes y después de aprobar, consolidar y
  conciliar el nuevo.
- **R343** — Ningún cálculo nuevo o modificado de esta ficha DEBE convertir un importe a número de
  coma flotante (`Number`, `parseFloat`, `+x`, `toNumber`): `Prisma.Decimal` y strings de escala 2.

## Relación con requisitos ya en `dev`

- **SLT-123 R310** («la marca solo en `bodega_central`; otro destino, `false` hasta SLT-139»): lo
  sustituye R336. El texto de R310 no se edita (su spec está cerrado): esta tabla es la referencia.
- **SLT-123 R315, R320, R321, R325-R328, R331** siguen valiendo. R315 gana el término de R338; R325
  es la regla del cierre viejo que R340 aplica en la conciliación.
- **SLT-106 R196** (nota «· se paga del efectivo»; «La central debe», «el efectivo no alcanzó…»): la
  nota la cambia R324; «La central debe» la recalcula R322 y su nota no cambia (sigue siendo cierta:
  la cifra solo sale de cierres viejos).
- **SLT-73 Q4** («si el cierre es todo SINPE, el mensajero queda con cuenta por pagar»): lo cierran
  R317-R319 para los cierres nuevos.
- **SLT-73 R10/R22** (la conciliación asienta con el instante de la marca): sin cambio; R317 se apoya
  en ellos.

## Trazabilidad

La tabla completa (test y caso) está en `tasks.md > Trazabilidad`. Resumen:

| R | Test principal |
|---|---|
| R317, R318, R319, R333, R336, R340, R341, R342, R345 | `tests/integration/db/slt139-pago-satelite.int.test.ts` |
| R329 | `tests/integration/db/slt139-pago-satelite.int.test.ts` (estado de cuenta, detalle por guía, analítica, catálogo) |
| R330, R337 | `tests/integration/db/migracion-slt139-ida-y-vuelta.test.ts` |
| R338, R343 | `tests/unit/utils/pendiente-cierre.test.ts` |
| R322, R323 | `tests/unit/services/cierre-bodega-service.test.ts` + integración (consolidación mixta) |
| R324 | `tests/unit/utils/cola-cierres-vista.test.ts`, `tests/components/ColaCierresConsolidar.test.tsx` |
| R334 | `tests/unit/services/cierres-admin-pendiente.test.ts`, `tests/unit/services/cierre-dia-pendiente-pago.test.ts` |
| R335, R344 | `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` + unit de cada servicio (sin la lectura) |

## Preguntas abiertas

- **PA1 — Tamaño.** Estimado en ~39 archivos (por encima del 80% de 40) y ~2 700 líneas con los tests
  al doble de lo estimado (límite 1 000). No hay un corte vertical que se mergee solo sin dejar dinero
  contradictorio: si la escritura (`pago_satelite`) entra sin la lectura (R338), lo pendiente de un
  cierre conciliado dice `P` con la cuenta por pagar en 0; si entra la marca sin la escritura, el
  feed de SLT-123 deja un devengo sin pago que la consolidación sigue descontando del efectivo (es
  lo que `SLT-123 design.md > 13` evitó). **Recomendación:** un solo PR, con la línea
  `tamano-pr-aceptado` que pide `docs/gate.md > Tamaño del PR` firmada por Carlos. Si T0.2 encuentra
  más archivos que caen de los previstos y el total pasa de 40, el leader decide antes de seguir.
- **PA2 — SLT-112 en paralelo.** SLT-112 «Cifras del servidor: ganancia pendiente y pagada del
  mensajero» se especifica a la vez y puede tocar
  `lib/repositories/PagoMensajeroMovimientoRepository.ts` y su interfaz (choque de archivos).
  **Recomendación:** SLT-112 consume el contrato de `design.md > 9` (filas del libro + la lectura por
  cierre) sin redefinirlo; si necesita una suma por mes, la añade como método propio, y el segundo
  en mergear rebasa.
- **PA3 — Cierres de satélite que quedarán viejos.** Los aprobados entre el merge de SLT-123 y el de
  esta ficha se quedan con `min(P, E)` para siempre (D5). No se sabe cuántos son. **Recomendación:**
  Carlos cuenta en prod (transacción READ ONLY, `tasks.md > T0.4`) los `cierre_dia` de satélite
  `aprobado` con la marca en `false` y sin consolidación conciliada el día del merge; es informativo y
  no cambia el código.
