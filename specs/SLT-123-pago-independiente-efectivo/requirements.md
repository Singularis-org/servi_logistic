# SLT-123 «Pago al mensajero independiente del efectivo» — requirements

> Ruta: completa (toca dinero, esquema y migración; `complexity: high`). Zona: **fullstack**.
> Escrito por spec_author el 2026-11-12. Requisitos nuevos en el rango **R310-R339** (se usan
> R310-R335). Investigación previa: `progress/investigacion_SLT-122.md`.
> **Ver `## Preguntas abiertas > PA4`: tal como está, la ficha no cabe en un PR.** El spec está
> completo y el corte propuesto no parte ningún requisito.

## Alcance

**El problema (medido en el código, 2026-11-12).** Desde la feature 44 el pago al mensajero de un
cierre se da por pagado, en parte, con el efectivo que él mismo recaudó: `pagado = min(P, E)`
(`lib/utils/cuenta-por-pagar.ts > calcularSplitPago`), donde `P` = `cierre_dia.total_pago_mensajero` y
`E` = `cierre_dia.total_efectivo`. Esa regla se usa en dos sitios:

1. **El libro del mensajero** (`WalletMensajeroFeedService.construirMovimientosDePago`): al aprobar un
   cierre de la central —y al conciliar uno de satélite (SLT-73)— escribe `pago_devengado = P` y
   `pago_efectivo = min(P, E)`.
2. **Lo pendiente de un cierre** (`lib/utils/pendiente-cierre.ts > derivarPendienteCierre`):
   `(P − min(P, E)) + premios vivos − pagos vigentes`. Lo leen la cola y el detalle de
   `/cierres-admin` («Pago entregado», «Pendiente de liquidar»), la celda «Pago» de `/cierre-dia`
   (SLT-137 R164), el tope de «Registrar pago», el reparto «Pagar» de `/wallet/mensajeros`, la
   anulación de un pago y la respuesta de aprobar.

Además, la consolidación de la satélite reparte el efectivo entre los pagos de los mensajeros y
muestra «La central debe» lo que no alcanzó (`CierreBodegaService.repartirEfectivo`), aunque la deuda
de la satélite (SLT-73 D4) ya le descuenta el pago completo `P`.

**Lo que entra.**
- Una **marca propia del cierre** que dice qué regla aplica, fijada en la misma transacción que lo
  aprueba. Los cierres aprobados antes del despliegue no la tienen y se quedan como están.
- **Regla nueva (cierres con la marca):** el mensajero devenga `P` completo como deuda y nada se da
  por pagado con su efectivo.
  - Central: la deuda se salda con «Registrar pago» (o el reparto «Pagar»), como ya existe.
  - Satélite: al conciliar, el libro registra el pago completo como «Pagado por la satélite».
- Las cifras que leen esa regla: lo pendiente de cada cierre (y con ello «Pago entregado», la celda
  «Pago» del mensajero y los topes de pago), la cuenta por pagar de `/wallet/mensajeros` y
  «La central debe» de la consolidación.

**Lo que NO entra.**
- Recalcular, completar o compensar cierres ya aprobados (D5).
- La caja (`wallet_movimiento`): el egreso `egreso_pago_mensajero = P` al aprobar no cambia (PA3).
- La deuda de la satélite y «Debe llegar a la central» (`paraLaCentral`): ya descuentan `P`.
- Quién puede pagar (SLT-122: la central solo paga cierres `bodega_central`; el `adminSatelite` no
  paga, 172 P3).
- Las tarjetas «Ganancia pendiente de pago» y «Ganancia pagada este mes» (SLT-112, pendiente): no
  existen aún. SLT-112 debe leer lo pendiente con `derivarPendienteCierre` y decidir si lo «pagado
  por la satélite» cuenta como pagado (PA5).
- Premios del ranking e incentivos: siguen igual (se suman aparte, 293 R25).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién, cuándo | Cubierta por |
|---|---|---|---|
| D1 | El mensajero devenga su pago completo como deuda y nunca se da por pagado con su efectivo (hoy `min(P,E)`, feature 44). | Carlos, ficha SLT-123 | R313, R315, R317 |
| D2 | Central: la deuda se paga con «Registrar pago». | Carlos, ficha SLT-123 | R316, R321 |
| D3 | Satélite: la conciliación lo registra como pagado por la satélite. | Carlos, ficha SLT-123 | R317, R318, R319, R329, R330 |
| D4 | Se corrigen «Central debe» de la consolidación y «Pago entregado» de la cola. | Carlos, ficha SLT-123 | R320, R322, R323 |
| D5 | Opción (a): los cierres **ya aprobados** se quedan como están (pago dado por el efectivo, `min(P,E)`). La regla nueva aplica solo a los cierres aprobados desde el despliegue. Sin recálculo ni deuda retroactiva. | Carlos, 2026-11-12 | R311, R312, R325, R326 |
| D6 | Cómo se distingue un cierre del modelo viejo de uno del nuevo: con un **campo propio del cierre** (`cierre_dia.pago_independiente_efectivo`, booleano, `false` por defecto), que pone a `true` **el mismo `UPDATE` que lo aprueba**. No se usa ninguna fecha de corte ni ningún dato de otra tabla: una fecha mutable de otra tabla no sirve de ancla, y una fecha de despliegue escrita en el código no coincide con el instante en que el código nuevo empieza a aprobar. | spec_author por encargo del leader, 2026-11-12 (detalle en `design.md > 2`) | R310, R311, R327 |
| D7 | La central no paga cierres de satélite (SLT-122 D1, PA1 = A sin excepciones). Esta ficha no lo reabre. | Carlos, 2026-11-10 | R321 |

## Requisitos (EARS)

Vocabulario: **P** = `cierre_dia.total_pago_mensajero` (snapshot de la 39). **E** =
`cierre_dia.total_efectivo` (snapshot de la 37). **La marca** = `cierre_dia.pago_independiente_efectivo`.
**Cierre nuevo** = cierre con la marca en `true`; **cierre viejo** = con la marca en `false`. Todos los
importes son strings de escala 2, calculados con `Prisma.Decimal`.

### La marca

- **R310** — CUANDO un cierre del día pasa a `aprobado` (desde `solicitado` o `vencido`, con
  cualquier destino), el sistema DEBE poner la marca de ese cierre en `true`, en la misma escritura y
  la misma transacción que lo aprueba. Si la transacción revierte, la marca DEBE quedar como estaba.
- **R311** — El sistema NO DEBE cambiar la marca en ningún otro caso:
  - un cierre `solicitado`, `vencido` o `rechazado` la tiene en `false`;
  - rechazar un cierre no la toca;
  - conciliar, consolidar, pagar, anular un pago, registrar un premio o un incentivo no la tocan;
  - un cierre aprobado antes del despliegue la conserva en `false`.
- **R312** — La migración de esta ficha DEBE ser aditiva: añade la columna de la marca con
  `DEFAULT false`, el valor de categoría `pago_satelite` y sus `CHECK`, y NO DEBE insertar, actualizar
  ni borrar ninguna fila de `cierre_dia`, `pago_mensajero_movimiento`, `wallet_movimiento`,
  `liquidacion_pago` ni `cierre_bodega`. Su `down.sql` DEBE dejar la base como estaba antes, y DEBE
  abortar sin tocar nada si alguna fila usa `pago_satelite`.

### Central, regla nueva

- **R313** — CUANDO se aprueba un cierre con destino `bodega_central` y P > 0, el sistema DEBE
  escribir en el libro del mensajero el devengo `pago_devengado = P` y NINGÚN movimiento de pago
  tomado del efectivo (`pago_efectivo`), aunque E ≥ P. SI P = 0, ENTONCES no DEBE escribir ningún
  movimiento en el libro del mensajero.
- **R314** — CUANDO se aprueba un cierre con destino `bodega_central`, la caja DEBE recibir los
  mismos asientos que antes de esta ficha, incluido `egreso_pago_mensajero = P` (si P > 0).
- **R315** — MIENTRAS un cierre `aprobado` sea nuevo, lo pendiente de pago al mensajero de ese cierre
  DEBE ser `P + premios vivos − pagos vigentes − pagado por la satélite`, sin el término `min(P, E)`,
  y nunca negativo (un resultado ≤ 0 es `"0.00"`). «Pagado por la satélite» es la suma de los
  movimientos `pago_satelite` del libro con origen en ese cierre.
- **R316** — CUANDO la central registra un pago contra un cierre nuevo de la central (directo o por
  el reparto de `/wallet/mensajeros`), el tope DEBE ser lo pendiente de R315. CUANDO los pagos
  vigentes suman P (sin premios), lo pendiente DEBE quedar en `"0.00"` y la cuenta por pagar del
  mensajero DEBE bajar exactamente lo pagado.

### Satélite, regla nueva

- **R317** — CUANDO se concilia una consolidación de satélite, por cada cierre nuevo que incluye y
  con P > 0, el sistema DEBE escribir en el libro del mensajero `pago_devengado = P` y un pago
  `pago_satelite = P`, los dos con la fecha de la marca de conciliación, y NINGÚN `pago_efectivo`.
- **R318** — SI la escritura de R317 se repite para el mismo cierre (reintento o segunda llamada),
  ENTONCES el sistema NO DEBE duplicar ninguna fila.
- **R319** — MIENTRAS un cierre nuevo de satélite no esté conciliado, lo pendiente DEBE ser P (más
  premios vivos, menos pagos vigentes). CUANDO se concilia, lo pendiente DEBE pasar a `"0.00"` y su
  aporte a la cuenta por pagar del mensajero DEBE ser 0.

### Las pantallas que lo leen

- **R320** — Los listados que emiten `pendientePagoMensajero` DEBEN calcularlo con la regla de cada
  cierre (R315 para el nuevo, R325 para el viejo) y con una sola función:
  - la cola y el histórico de `/cierres-admin` («Pago entregado», «Pendiente de liquidar»), para la
    central y para la satélite;
  - la cola «Cierres solicitados» de `/cierre-dia` (celda «Pago»).
  En un cierre nuevo de la central con E ≥ P y sin pagos, «Pago entregado» DEBE decir
  «Pendiente <P>» y la celda «Pago» del mensajero, «Pendiente de pago».
- **R321** — El tope del pago directo, la ventana del reparto «Pagar», lo que queda tras anular un
  pago y lo pendiente tras aprobar DEBEN usar la misma regla de R320. El alcance de pago de SLT-122
  (solo cierres `bodega_central`) NO DEBE cambiar.
- **R322** — «La central debe» de la consolidación de la satélite DEBE calcularse solo con los cierres
  viejos del conjunto: el efectivo de esos cierres se reparte entre sus pagos como hoy (de menor a
  mayor, sin pagos parciales). Un cierre nuevo DEBE aportar 0. SI todos los cierres del conjunto son
  nuevos, ENTONCES «La central debe» DEBE valer `"0.00"` y la tarjeta NO DEBE pintarse.
- **R323** — `totalNetoAgregado` de la consolidación DEBE ser `recaudado − pagado del efectivo a los
  cierres viejos (R322) − Σ P de los cierres nuevos`. SI todos los cierres del conjunto son viejos,
  ENTONCES DEBE ser el mismo número que antes de esta ficha.
- **R324** — *(Según PA1.)* La nota de la tarjeta «Pago a mensajeros» de «A consolidar» DEBE ser
  «1 mensajero» o «<n> mensajeros», sin «· se paga del efectivo».

### Los cierres viejos no cambian

- **R325** — MIENTRAS un cierre `aprobado` sea viejo, el sistema DEBE aplicarle la regla de la
  feature 44 en todo:
  - libro: `pago_devengado = P` y `pago_efectivo = min(P, E)`, al aprobar (central) o al conciliar
    (satélite);
  - pendiente: `(P − min(P, E)) + premios vivos − pagos vigentes`;
  - «La central debe»: el reparto del efectivo de hoy.
- **R326** — El sistema NO DEBE reescribir, completar ni compensar nada de un cierre viejo: ni sus
  snapshots, ni sus filas de libro, de caja o de pagos. Con un cierre viejo y uno nuevo en la misma
  base, las filas del viejo DEBEN ser idénticas antes y después de aprobar, pagar y conciliar el nuevo.
- **R327** — La elección entre la regla nueva y la vieja DEBE depender solo de la marca del propio
  cierre. NO DEBE depender de una fecha (`resuelto_at`, `solicitado_at`, `conciliado_at`), del destino
  ni del contenido del libro.

### Wallet, rótulos y analítica

- **R328** — La cuenta por pagar de `/wallet/mensajeros` (lista, estado de cuenta y su descarga) DEBE
  seguir derivándose del libro (Σ devengo − Σ pago). Con la regla nueva, DEBE subir P por cada cierre
  nuevo de la central aprobado hasta que se registre su pago, y no subir por un cierre nuevo de
  satélite conciliado.
- **R329** — Un movimiento `pago_satelite` DEBE mostrarse como «Pagado por la satélite» en el estado
  de cuenta del mensajero y en su descarga. Su detalle por guía DEBE salir del pago al mensajero de
  cada gestión (como `pago_devengado`). La analítica de cuentas por pagar DEBE contarlo como pago, y
  el catálogo de métricas DEBE nombrarlo.
- **R330** — La base DEBE rechazar un movimiento `pago_satelite` cuyo `tipo` no sea `pago` o cuyo
  origen no sea un `cierre_dia` con `origen_id` no nulo.
- **R331** — Esta ficha NO DEBE cambiar:
  - la caja (`wallet_movimiento`);
  - la deuda de la satélite ni «Debe llegar a la central»;
  - los premios y los incentivos;
  - la «Ganancia» (P) que ve el mensajero;
  - la conciliación analítica de cierres.
  Con un cierre nuevo y uno viejo, esas cifras DEBEN ser las mismas que con dos cierres viejos de
  iguales snapshots.

### Calidad del dinero y de la lectura

- **R332** — Ningún cálculo nuevo o modificado de esta ficha DEBE convertir un importe a número de
  coma flotante (`Number`, `parseFloat`, `+x`, `toNumber`): `Prisma.Decimal` y strings de escala 2.
- **R333** — La lectura de «pagado por la satélite» por cierre DEBE quedarse dentro de la empresa
  activa: con dos empresas en la base, la de una nunca suma movimientos de la otra.
- **R334** — Los listados DEBEN obtener «pagado por la satélite» con una sola lectura por página, sin
  que el número de consultas crezca con el tamaño de página.
- **R335** — Las acciones de producción que construyen `CierreDiaService` y `CierresAdminService`
  DEBEN inyectarles la lectura de «pagado por la satélite». Un servicio sin ella NO DEBE emitir un
  pendiente inventado.

## Relación con requisitos ya en `dev`

- **SLT-137 R164** («`min(P, E)` …») sigue valiendo para los cierres viejos. Para los nuevos lo
  sustituye R315. El texto de R164 no se edita (su spec está cerrado): esta tabla es la referencia.
- **SLT-106 R196** («La central debe»: nota «el efectivo no alcanzó…»; «Pago a mensajeros»: nota
  «· se paga del efectivo»): R322 cambia de qué cierres sale la cifra y R324, la nota.
- **SLT-73 Q4** («si el cierre es todo SINPE, el mensajero queda con cuenta por pagar»): se cierra
  para los cierres nuevos (R317-R319). Los viejos siguen igual (D5).
- **Feature 44 R9/R10** (`min(P, E)`): solo para cierres viejos.

## Trazabilidad

La tabla completa, con el test y el caso, está en `tasks.md > Trazabilidad`. Resumen:

| R | Test principal |
|---|---|
| R310, R311, R326, R327 | `tests/integration/db/slt123-pago-independiente.int.test.ts` |
| R312, R330 | `tests/integration/db/migracion-slt123-ida-y-vuelta.test.ts` |
| R313, R317, R325 | `tests/unit/services/wallet-mensajero-feed-service.test.ts` + integración |
| R314, R316, R318, R319, R328, R331, R333 | `tests/integration/db/slt123-pago-independiente.int.test.ts` |
| R315, R332 | `tests/unit/utils/pendiente-cierre.test.ts` |
| R320 | `tests/unit/services/cierres-admin-pendiente.test.ts`, `tests/unit/services/cierre-dia-pendiente-pago.test.ts`, `tests/integration/db/cierre-dia-pendiente-pago.test.ts` |
| R321 | `tests/unit/services/liquidacion-service.test.ts` + integración |
| R322, R323 | `tests/unit/services/cierre-bodega-service.test.ts` + integración |
| R324 | `tests/unit/utils/cola-cierres-vista.test.ts` |
| R329 | `tests/unit/utils/slt123-categoria-pago-satelite.test.ts` |
| R334, R335 | `tests/unit/services/cierre-dia-pendiente-pago.test.ts`, `tests/unit/services/cierres-admin-pendiente.test.ts`, `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`, `tests/integration/actions/cierres-admin-action.test.ts` |

## Preguntas abiertas

- **PA1 — La nota de «Pago a mensajeros» en «A consolidar».** Hoy dice «<n> mensajeros · se paga del
  efectivo» (SLT-106 R196). Con la regla nueva es falso. Opciones:
  (a) **quitar «· se paga del efectivo»** siempre (R324 tal como está): un archivo de rótulos, sin
  cambio en el servidor. Durante la transición, un conjunto con solo cierres viejos también pierde
  la frase;
  (b) cambiarla por «· lo paga tu bodega» solo si algún cierre del conjunto es nuevo: el servidor
  tiene que emitir un agregado más (como `incluyeModeloNuevoAgregado`), y son unos 4 archivos más.
  **Recomendación: (a).** Es texto, no dinero; los conjuntos solo de cierres viejos desaparecen con
  la primera consolidación tras el despliegue.
- **PA2 — Lo pendiente de un cierre nuevo de satélite antes de conciliar.** Con R319, hasta que la
  central concilia, el mensajero ve «Pendiente de pago» en `/cierre-dia` y la satélite ve el
  pendiente en su cola, aunque la satélite ya le haya pagado fuera del sistema. Es lo que el sistema
  sabe: la ficha dice que lo registra la conciliación. **Recomendación:** aceptarlo y mirarlo en
  Preview. Si molesta, la alternativa es no mostrar pendiente en cierres de satélite (otra ficha).
- **PA3 — La caja sigue contando P al aprobar.** El egreso `egreso_pago_mensajero = P` se escribe al
  aprobar (feature 44, Qa: devengo) y «Registrar pago» no toca la caja (172). Con la regla nueva, el
  día de la aprobación la caja dice que salieron P aunque el mensajero entregó todo el efectivo; el
  dinero sale de verdad al registrar el pago. Ya pasaba con la parte no cubierta por el efectivo.
  **Recomendación:** no cambiar la caja aquí (R314, R331). Si Carlos quiere la salida en la fecha del
  pago, es otra ficha: toca la 44, la 172 y la tesorería (173).
- **PA4 — Tamaño: no cabe en un PR.** `gate.tamano_pr` no tiene valor en `arnes.config.json`, así que
  rige el de por defecto: 40 archivos y 1 000 líneas. Estimación (desglose en `tasks.md > Tamaño`):
  - producción: 30 archivos, unas 515 líneas (de ellas ~240 de esquema y SQL, sobre todo el
    `down.sql` del valor de enum, que copia la función dinámica de SLT-68);
  - tests: 19 archivos, unas 980 líneas (6 de ellos, tests existentes que caen al aprobar con la
    marca);
  - E2E que leen `pago_efectivo` o «Liquidado» tras aprobar por la interfaz: hasta 6 archivos más,
    según lo que mida T0.3.
  Total: unos 49-55 archivos y ~1 500-1 560 líneas. **Corte natural, sin partir requisitos:**
  1. **SLT-123 «Central»**: la marca (solo la columna), fijada al aprobar cierres `bodega_central`;
     feed de la central; regla nueva en `derivarPendienteCierre`; «Pago entregado», celda «Pago»,
     topes de pago y wallet. R310 (central), R311, R312 (solo la columna), R313-R316, R320, R321,
     R325-R328, R331, R332. Unos 30 archivos, ~780 líneas.
  2. **SLT-1xx «Satélite»** (`depends_on` 1): el valor `pago_satelite` y sus CHECK; la marca también
     en satélite; feed de la conciliación; el término «pagado por la satélite» y su lectura; «La
     central debe» y la nota; rótulos. R317-R319, R322-R324, R329, R330, R333-R335. Unos 24
     archivos, ~780 líneas.
  Cada una se mergea sola: tras la primera, los cierres de satélite se siguen aprobando sin la marca
  (regla vieja), así que la satélite no empeora. Los aprobados entre los dos despliegues se quedan
  viejos, igual que D5. **Recomendación:** cortar así. La otra salida es que Carlos acepte el tamaño
  por escrito (`docs/gate.md > Tamaño del PR`).
- **PA5 — «Ganancia pagada este mes» (SLT-112).** El diseño de SLT-95 la define como Σ de pagos
  vigentes (`liquidacion_pago`). Lo «pagado por la satélite» no es un pago de liquidación.
  **Recomendación:** que lo decida el spec de SLT-112; aquí no se toca.
