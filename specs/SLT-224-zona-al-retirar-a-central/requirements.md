# SLT-224 — Retiro a central: recalcular la zona de la orden (quedan con la zona vieja tras mover distritos)

> Ruta completa (toca la zona, de la que sale la tarifa, y lleva migración de datos), zona backend,
> complejidad medium. Rango reservado: **R1700–R1729** (se usan R1700–R1712).

## Alcance

**El defecto, con evidencia (prod, solo lectura, 2026-11-19).** Orden con guía 64482571, distrito San
Rafael (Alajuela):

1. desde el 13-nov está en `en_bodega_satelite`, en la satélite «GAM Kevin (Alajuéla)»;
2. el 17-nov un maestro pasa San Rafael (Alajuela) de «GAM Kevin (Alajuéla)» a «GAM» (historial
   `zona_distrito_cambiado`). La reconciliación al guardar la zona (fichas 366/377) la **retiene a
   propósito** porque está en el estante (`ESTADOS_PAQUETE_EN_ESTANTE`);
3. el 19-nov se retira a la central (SLT-197, acción `ordenes_retiradas_a_central`): pasa a
   `en_ruta_bodega_central` y la central la recibe (`en_bodega_central`, `recepcion_bodega_central`).

Ni el retiro ni la recepción vuelven a derivar `orden.zona_id`, y la reconciliación solo corre al
guardar una zona. La orden sigue en la central con la zona de la satélite: la central no la puede
asignar a su mensajero (zona no central) y solo la puede devolver a la satélite que se cerró. En la
misma empresa hay ese día órdenes con `zona_id` distinta de la zona de su distrito en
`en_bodega_central` (56) y `en_ruta_bodega_central` (35).

La 377 aceptó la zona vieja en el estante porque «la deuda se cierra sola»: no había salida del
estante hacia otra bodega. SLT-197 la añadió, y con ella el hueco que esta ficha cierra.

**Lo que entra:**

1. Cuando la central **recibe** una orden que venía `en_ruta_bodega_central`, su zona se vuelve a
   derivar desde `zona_distrito` con la misma regla, el mismo corte y el mismo historial que la
   reconciliación al guardar una zona, en la misma transacción de la recepción. El momento elegido
   (recepción y no retiro) está en `design.md §1` y se confirma en P1.
2. Una corrección única de las órdenes vivas ya desalineadas en `en_bodega_central` y
   `en_ruta_bodega_central`, con regla genérica, en todas las empresas, y con un conteo T0 contra
   producción (solo lectura) antes del PR que para si los números no cuadran.
3. La tarifa: se trata igual que en la 366. Solo cambia `orden.zona_id`, y lo ya cerrado o con dinero
   decidido no se toca.

### Lo que NO entra

- **El estante de la satélite** (`en_bodega_satelite`): sigue retenido como decidió la 377.
- **Las entregadas** ni ninguna orden con cierre o con gestión que ya decidió dinero.
- **Las devoluciones** (`por_devolver_a_bodega_central`, `devolviendo_a_bodega_central`,
  `por_devolver_a_tienda` y siguientes): ver `design.md §5.2` y P3.
- **Cambiar el corte de elegibilidad de la 366** (por ejemplo, para órdenes con un cierre de un intento
  anterior): ver P2.
- **El retiro en sí** (SLT-197): no cambia. El manifiesto del retiro sigue diciendo la satélite de
  origen.
- **Rediseñar el modelo de zona**, mover la regla de la 366 o añadir pantallas.

**Enmienda a SLT-197.** R977 de SLT-197 «Retirar paquetes de una bodega satélite a la central» dice
que la recepción en la central no cambia la zona. Esta ficha lo enmienda **solo** para la orden cuya
zona no es la de su distrito (R1700). R972 (el retiro conserva la zona) se mantiene (R1705).

## Decisiones cerradas (no reabrir)

| # | Decisión | Fecha | Quién | Cubre |
|---|---|---|---|---|
| D1 | La zona se vuelve a derivar desde `zona_distrito` con la **misma regla** que la reconciliación al guardar una zona (366/377), tarifa e historial incluidos, sin duplicar la lógica. | 2026-11-19 | Carlos (descripción de la ficha) | R1700, R1701, R1702, R1703, R1706, R1707 |
| D2 | Corrección única de las vivas que ya están en la central o en ruta a la central, con un T0 medido contra producción antes del PR. | 2026-11-19 | Carlos (descripción de la ficha) | R1708, R1709, R1710, R1711, R1712 |
| D3 | No se tocan las órdenes en `en_bodega_satelite` ni las entregadas. | 2026-11-19 | Carlos (encargo del leader) | R1709 |
| D4 | Arreglo mínimo: no se rediseña el modelo de zona. | 2026-11-19 | Carlos (encargo del leader) | R1706 |

## Requisitos (EARS)

### La recepción en la central

- **R1700** — CUANDO la bodega central recibe una orden que estaba en `en_ruta_bodega_central` (y pasa a
  `en_bodega_central`) y la zona de la orden no es la única zona de su distrito en su empresa, el
  sistema DEBE cambiar la zona de la orden a la zona de su distrito en la misma operación atómica que
  la recepción.
- **R1701** — SI la orden recibida tiene algún detalle de cierre, o tiene una gestión vigente (no
  anulada) con resultado entregado, devolución a origen por rechazo o incidente, ENTONCES el sistema
  NO DEBE cambiar su zona y DEBE completar la recepción igual.
- **R1702** — SI la orden recibida no tiene distrito, o su distrito no tiene zona en su empresa,
  ENTONCES el sistema DEBE conservar su zona y DEBE completar la recepción igual.
- **R1703** — CUANDO la recepción cambia la zona de una orden, el sistema DEBE registrar en el
  histórico de acciones una acción `orden_zona_reconciliada` de esa orden, con quien escaneó como
  actor, en la misma transacción; y SI la recepción no transiciona (otra recepción ganó la carrera, ya
  estaba recibida o el estado no es válido), ENTONCES el sistema NO DEBE cambiar la zona ni registrar
  la acción.
- **R1704** — CUANDO la bodega central recibe una orden que estaba en `devolviendo_a_bodega_central`,
  el sistema NO DEBE cambiar su zona, aunque no sea la de su distrito.
- **R1705** — CUANDO un maestro o un admin retira órdenes de una satélite a la central (SLT-197), el
  sistema NO DEBE cambiar su zona, aunque no sea la de su distrito, y el manifiesto del retiro DEBE
  seguir mostrando como origen la zona satélite de la que salió.

### Una sola regla

- **R1706** — El sistema DEBE aplicar una única implementación de la regla «qué orden cambia de zona y
  a cuál» tanto al guardar una zona como al recibir en la central, y el guardado de una zona DEBE
  seguir reconciliando, reteniendo y contando exactamente lo mismo que antes de esta ficha.

### El dinero

- **R1707** — CUANDO el sistema cambia la zona de una orden por esta ficha (recepción o corrección
  única), NO DEBE modificar ninguna otra columna de la orden salvo su fecha de actualización, ni
  escribir en detalles de cierre, conceptos de cierre, pagos congelados de gestión, gestiones,
  wallets ni tarifas.

### La corrección única

- **R1708** — CUANDO se aplica la corrección única, el sistema DEBE cambiar a la zona de su distrito
  toda orden no borrada en `en_bodega_central` o `en_ruta_bodega_central` cuya zona no sea la única
  zona de su distrito en su empresa, en todas las empresas, con el mismo corte de R1701.
- **R1709** — La corrección única NO DEBE cambiar la zona de ninguna orden en otro estado (en
  particular `en_bodega_satelite`, `entregado`, `por_devolver_a_bodega_central`,
  `devolviendo_a_bodega_central` y `por_devolver_a_tienda`), ni de una orden borrada, ni de una orden
  cuyo distrito no tenga zona, ni de una orden excluida por el corte de R1701.
- **R1710** — CUANDO la corrección única cambia la zona de una orden, el sistema DEBE registrar una
  acción `orden_zona_reconciliada` de esa orden, con actor «sistema» (sin usuario), con la guía como
  etiqueta (o la remisión si no hay guía) y con un mismo lote para todas las órdenes corregidas de una
  misma empresa.
- **R1711** — CUANDO se revierte la corrección única, el sistema DEBE devolver a cada orden corregida
  la zona que tenía antes, solo si su zona sigue siendo la que puso la corrección, y DEBE borrar las
  acciones que la corrección registró, sin tocar ninguna otra orden ni acción.
- **R1712** — SI al aplicar la corrección única no hay ninguna orden que cumpla R1708, ENTONCES el
  sistema NO DEBE cambiar ninguna orden ni registrar ninguna acción.

## Trazabilidad prevista

| R | Test | Tipo |
|---|---|---|
| R1700 | `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts` | integración (Postgres) |
| R1701 | ídem (orden con `cierre_detail`; con gestión `entregado`, `devolucion_a_origen_por_rechazo`, `incidente`; con gestión anulada sí cambia; con `reprogramado` sí cambia) | integración |
| R1702 | ídem (orden sin distrito; distrito sin `zona_distrito`) | integración |
| R1703 | ídem (fila de `historial_accion` con actor; recepción repetida y estado inválido sin fila) + `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` | integración + guardia |
| R1704 | ídem (`devolviendo_a_bodega_central` desalineada conserva zona) + `tests/unit/services/recepcion-bodega-central-service.test.ts` | integración + unit |
| R1705 | `tests/integration/db/retiro-satelite-central.int.test.ts` (orden desalineada retirada conserva zona) | integración |
| R1706 | `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts` (los dos llamadores usan el helper; ningún repositorio repite el corte) + `tests/integration/db/zona-reconciliacion-ordenes.test.ts` verde sin cambiar expectativas | guardia + integración |
| R1707 | `zona-reconciliacion-no-retarifa.guardia.test.ts` (sobre el helper) + `recepcion-central-reconcilia-zona.int.test.ts` y `zona-desalineada-central-migration.test.ts` (fila de la orden y tablas de dinero intactas salvo `zona_id`/`updated_at`) | guardia + integración |
| R1708 | `tests/integration/db/zona-desalineada-central-migration.test.ts` | integración (Postgres, aplica el SQL) |
| R1709 | ídem (matriz de estados y cortes) | integración |
| R1710 | ídem (filas, actor nulo, lote por empresa, etiqueta) | integración |
| R1711 | ídem (`down.sql`: restaura; no pisa una zona cambiada después; borra solo sus acciones) | integración |
| R1712 | ídem (base sin desalineadas) | integración |

## Preguntas abiertas

- **P1 — ¿La zona se corrige al recibir en la central (propuesto) o al retirar (lo que decía la
  ficha)?** El spec la corrige al **recibir**. Si se corrigiera al retirar, el manifiesto que se
  descarga justo después del retiro diría como origen la zona nueva («GAM») y no la satélite de la que
  salió el paquete. Ese manifiesto lee la zona viva de la orden (`ManifiestoService`, flujo
  `retiro_satelite`), y lo firma quien transporta: rompería R982 de SLT-197. Mientras la orden va en
  ruta, la zona vieja no bloquea nada: la satélite ya no la ve y la central no la puede asignar hasta
  recibirla. Al recibirla ya tiene la zona correcta. Recomendación: recepción. Si Carlos prefiere el
  retiro, hay que cambiar también de dónde saca el manifiesto el origen del retiro (más alcance).
- **P2 — Órdenes desalineadas que el corte de la 366 deja fuera.** El corte excluye toda orden con
  algún `cierre_detail`, también el de un intento anterior (por ejemplo, una reprogramada que se cerró,
  se liberó al estante de la satélite y luego se retiró). Esas órdenes seguirían con la zona vieja en
  la central. El T0 las cuenta aparte. Si salen más de 0 (o si la guía 64482571 está entre ellas),
  Carlos decide si se amplía el corte (es otra regla de dinero: cambia la tarifa del siguiente cierre de
  una orden que ya se facturó una vez) o se corrigen a mano.
- **P3 — Devoluciones fuera (unas 38 desalineadas).** Recomendación: no tocarlas. Motivos en el
  código: `por_devolver_a_bodega_central` solo la puede enviar el `adminSatelite` **de la zona de la
  orden** (`EnvioDevolucionCentralService`, autorización por `orden.zonaId`), así que cambiarle la
  zona la dejaría sin nadie que la pueda enviar. Las demás van de vuelta a la tienda: su resultado ya
  está decidido y la recepción en la central no mira la zona. ¿Confirma Carlos?
