# SLT-224 — Retiro a central: recalcular la zona de la orden (quedan con la zona vieja tras mover distritos)

> Ruta completa (toca la zona, de la que sale la tarifa, y lleva migración de datos), zona backend,
> complejidad medium. Rango reservado: **R1700–R1729** (se usan R1700–R1727).
>
> **Dos PR en la misma ficha.** PR 1 (#253, mergeado en dev y en prod): R1700–R1719 con el corte de
> la 366. **PR 2** (este bloque): el corte nuevo de P2 (R1720–R1725) en el helper compartido, que
> cambia a la vez el guardado de zona, la recepción en la central y el botón, y la pantalla del
> botón (R1713, R1715, R1716, R1718, con los motivos de R1726–R1727). R1701 y la frase «exactamente lo
> mismo que antes» de R1706 quedan sustituidas por R1720–R1725 desde el PR 2.
>
> **P4 resuelta** (Carlos, 2026-11-20: «No moverlas hasta liberar»): las órdenes `reprogramado` y
> `novedad` que esperan liberación en una bodega **no se mueven**. No hay pregunta de dinero abierta: el análisis está en `design.md §4b`.

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
   producción (solo lectura) antes del PR que para si los números no cuadran. **En producción ya se
   aplicó a mano el 2026-11-19** (el leader, a pedido de Carlos): 73 órdenes (68 + 5) de una empresa,
   «GAM Kevin (Alajuéla)» → «GAM», con el mismo corte, historial con actor sistema y respaldo en
   `progress/respaldo-zonas-prod-2026-11-19.json`. La migración sigue siendo necesaria para Preview, las
   demás bases y lo que aparezca hasta el despliegue (`design.md §6`).
3. La tarifa: se trata igual que en la 366. Solo cambia `orden.zona_id`, y lo ya cerrado o con dinero
   decidido no se toca.
4. Un botón **«Actualizar zonas»** en `/ordenes`, junto a «Recibir paquete», para maestro y admin. No
   depende de la selección: busca en la empresa todas las órdenes vivas cuya zona no es la de su
   distrito, enseña cuántas se corregirían y cuáles se saltan y por qué, y al confirmar las corrige
   con la misma regla (pedido de Carlos, 2026-11-19, para errores sueltos).

### Lo que NO entra

- **El estante de la satélite** (`en_bodega_satelite`): sigue retenido como decidió la 377.
- **Las entregadas** ni ninguna orden con cierre o con gestión que ya decidió dinero. *(Desde el PR 2:
  las finalizadas y las que tienen un cobro en curso, R1721–R1722. Un cierre ya aprobado no se toca
  nunca; solo deja de impedir que la orden viva cambie de zona.)*
- **Las devoluciones** (`por_devolver_a_bodega_central`, `devolviendo_a_bodega_central`,
  `por_devolver_a_tienda` y siguientes): ver `design.md §5.2` y P3.
- ~~**Cambiar el corte de elegibilidad de la 366**~~: **entra en el PR 2** por la decisión de Carlos
  sobre P2 (D6, R1720–R1725).
- **El retiro en sí** (SLT-197): no cambia. El manifiesto del retiro sigue diciendo la satélite de
  origen.
- **Rediseñar el modelo de zona**, mover la regla de la 366 o añadir pantallas. El botón de R1713
  reutiliza la cabecera de `/ordenes` y el `Modal` compartido, sin pantalla nueva.
- **Actualizar zonas sobre una selección**: el botón trabaja sobre toda la empresa (Carlos, 2026-11-19).

**Enmienda a SLT-197.** R977 de SLT-197 «Retirar paquetes de una bodega satélite a la central» dice
que la recepción en la central no cambia la zona. Esta ficha lo enmienda **solo** para la orden cuya
zona no es la de su distrito (R1700). R972 (el retiro conserva la zona) se mantiene (R1705).
Por lo mismo cambia el camino de SLT-198/R1228: la orden retirada de una satélite vaciada ya llega a la
central con la zona de su distrito, y re-guardar esa zona no tiene nada que mover
(`tests/integration/db/zona-sin-distritos.test.ts`).

## Decisiones cerradas (no reabrir)

| # | Decisión | Fecha | Quién | Cubre |
|---|---|---|---|---|
| D1 | La zona se vuelve a derivar desde `zona_distrito` con la **misma regla** que la reconciliación al guardar una zona (366/377), tarifa e historial incluidos, sin duplicar la lógica. | 2026-11-19 | Carlos (descripción de la ficha) | R1700, R1701, R1702, R1703, R1706, R1707 |
| D2 | Corrección única de las vivas que ya están en la central o en ruta a la central, con un T0 medido contra producción antes del PR. | 2026-11-19 | Carlos (descripción de la ficha) | R1708, R1709, R1710, R1711, R1712 |
| D3 | No se tocan las órdenes en `en_bodega_satelite` ni las entregadas. | 2026-11-19 | Carlos (encargo del leader) | R1709 |
| D4 | Arreglo mínimo: no se rediseña el modelo de zona. | 2026-11-19 | Carlos (encargo del leader) | R1706 |
| D5 | Botón junto a «Recibir paquete» que corrige zonas erradas sueltas. No depende de la selección: el sistema busca en la empresa las órdenes con zona errada, muestra cuántas se corrigen y cuáles se saltan y por qué, y corrige al confirmar, con el mismo helper y el mismo corte. | 2026-11-19 | Carlos | R1713–R1719, R1726, R1727 |
| D6 | (P2) Las órdenes **vivas** se mueven a la zona nueva aunque tengan un cierre anterior o una gestión previa; las **finalizadas** no. Cambia el corte compartido (guardado de zona, recepción y botón) y va en el PR 2. | 2026-11-19 | Carlos | R1720–R1725 |

## Requisitos (EARS)

### La recepción en la central

- **R1700** — CUANDO la bodega central recibe una orden que estaba en `en_ruta_bodega_central` (y pasa a
  `en_bodega_central`) y la zona de la orden no es la única zona de su distrito en su empresa, el
  sistema DEBE cambiar la zona de la orden a la zona de su distrito en la misma operación atómica que
  la recepción.
- **R1701** — SI la orden recibida tiene algún detalle de cierre, o tiene una gestión vigente (no
  anulada) con resultado entregado, devolución a origen por rechazo o incidente, ENTONCES el sistema
  NO DEBE cambiar su zona y DEBE completar la recepción igual.
  *(PR 1. Sustituido desde el PR 2 por R1720–R1725: la recepción excluye solo lo que excluye el corte
  nuevo, y sigue completando la recepción igual.)*
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
  a cuál» al guardar una zona, al recibir en la central y al corregir desde el botón de R1713, y el guardado de una zona DEBE
  seguir reconciliando, reteniendo y contando exactamente lo mismo que antes de esta ficha.
  *(Desde el PR 2, «exactamente lo mismo» se lee «lo mismo salvo lo que cambian R1720–R1725», que
  aplican por igual a los tres llamadores.)*

### El dinero

- **R1707** — CUANDO el sistema cambia la zona de una orden por esta ficha (recepción, corrección
  única o botón «Actualizar zonas»), NO DEBE modificar ninguna otra columna de la orden salvo su fecha de actualización, ni
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

### El botón «Actualizar zonas» (D5)

En este bloque, una orden «con zona errada» es una orden no borrada de la empresa de quien actúa cuya
zona no es la única zona de su distrito en esa empresa. «Saltada» es una orden con zona errada que no
se corrige, por uno de tres motivos, en este orden de precedencia: **en el estante de una satélite**
(`en_bodega_satelite`), **devolución** (`por_devolver_a_bodega_central`,
`devolviendo_a_bodega_central`, `novedad`, `por_devolver_a_tienda`, `devolviendo_a_tienda`,
`devuelta_a_tienda`) y **ya cerrada o con dinero decidido** (el corte de R1701).
*(PR 1. Desde el PR 2 los motivos y su precedencia son los de R1726.)*

- **R1713** — La pantalla `/ordenes` DEBE mostrar el botón «Actualizar zonas» junto a «Recibir paquete»
  al maestro y al admin, sin depender de las órdenes seleccionadas, y NO DEBE mostrarlo a ningún otro rol.
- **R1714** — SI quien pide la vista previa o la actualización no tiene sesión, o no es maestro ni
  admin, ENTONCES el sistema DEBE rechazarlo en el servidor sin leer ni escribir órdenes.
- **R1715** — CUANDO el maestro o el admin pulsa «Actualizar zonas», el sistema DEBE mostrar, sin
  escribir nada, cuántas órdenes con zona errada de su empresa se actualizarían, agrupadas por zona
  actual → zona nueva, y la lista de las saltadas con su guía y su motivo.
- **R1716** — SI la vista previa no encuentra ninguna orden que actualizar, ENTONCES el modal DEBE
  decirlo y NO DEBE ofrecer confirmar.
- **R1717** — CUANDO quien actúa confirma, el sistema DEBE cambiar, en una sola transacción, a la zona
  de su distrito toda orden con zona errada de su empresa que **en ese momento** no esté saltada (la
  regla se vuelve a evaluar al escribir, sin fiarse de la vista previa), y DEBE registrar una acción
  `orden_zona_reconciliada` por orden actualizada, con quien confirmó como actor y un mismo lote.
- **R1718** — CUANDO termina la actualización, el sistema DEBE mostrar cuántas órdenes se actualizaron
  y la lista de las saltadas con su guía y su motivo, y DEBE refrescar el listado al cerrar; una orden
  saltada NO DEBE impedir que se actualicen las demás.
- **R1719** — La vista previa y la actualización NO DEBEN leer ni cambiar órdenes de otra empresa, ni
  cambiar órdenes cuya zona ya es la de su distrito ni órdenes cuyo distrito no tiene zona.

### PR 2 — El corte nuevo: vivas sí, finalizadas no (D6)

Se aplica en los tres sitios que re-derivan la zona: el guardado de una zona, la recepción en la
central (arista `en_ruta_bodega_central → en_bodega_central`) y la confirmación de «Actualizar zonas».
Términos de este bloque:

- **Cierre aprobado**: un `cierre_dia` en estado `aprobado`. Los estados `solicitado`, `rechazado` y
  `vencido` son **cierre sin aprobar**.
- **Finalizada**: una orden en `entregado`, `devuelta_a_tienda` o `incidente` (los estados terminales
  del flujo, `ESTADOS_TERMINALES` de `lib/types/order-status-transiciones.ts`).
- **Cobro en curso**: la orden tiene un detalle de cierre que pertenece a un cierre sin aprobar, o una
  gestión no anulada con resultado entregado, devolución a origen por rechazo o incidente que no
  pertenece a ningún cierre o pertenece a un cierre sin aprobar.

- **R1720** — CUANDO el sistema re-deriva la zona de una orden (al guardar una zona, al recibir en la
  central o al confirmar «Actualizar zonas»), el sistema DEBE cambiarla a la zona de su distrito aunque
  la orden tenga detalles de cierre o gestiones, siempre que todos ellos pertenezcan a cierres
  aprobados y la orden no esté excluida por R1721, R1722 o R1723.
- **R1721** — SI la orden está finalizada, ENTONCES el sistema NO DEBE cambiar su zona.
- **R1722** — SI la orden tiene un cobro en curso, ENTONCES el sistema NO DEBE cambiar su zona.
- **R1723** — SI la orden está en `en_bodega_satelite`, en `por_devolver_a_bodega_central`,
  `devolviendo_a_bodega_central`, `devolucion_a_origen_por_rechazo`, `novedad`,
  `por_devolver_a_tienda`, `devolviendo_a_tienda` o `reprogramado`, ENTONCES el sistema NO DEBE cambiar
  su zona.
- **R1724** — CUANDO se guarda una zona, el sistema DEBE seguir contando como retenidas en el estante
  solo las órdenes en `en_bodega_satelite` que habrían cambiado de zona, con el corte de R1720–R1722.
- **R1725** — El sistema DEBE clasificar cada estado del catálogo de estados de orden como «se mueve»
  o con un motivo para no moverse, sin dejar ninguno sin clasificar, de modo que añadir un estado al
  catálogo sin clasificarlo haga fallar la compilación.

### PR 2 — Los motivos del botón (D5 con D6)

- **R1726** — CUANDO la vista previa o el resultado de «Actualizar zonas» lista una orden saltada, el
  sistema DEBE darle uno de estos motivos, en este orden de precedencia: «en el estante de una
  satélite» (`en_bodega_satelite`), «finalizada» (R1721), «en devolución» (los estados de devolución de
  R1723), «esperando liberación en bodega» (`reprogramado`) y «cobro en curso» (R1722).
- **R1727** — CUANDO quien actúa confirma sin que la base haya cambiado desde la vista previa, el
  sistema DEBE actualizar exactamente las órdenes que la vista previa contó en sus grupos y DEBE
  devolver como saltadas exactamente las mismas guías con los mismos motivos.

## Trazabilidad prevista

| R | Test | Tipo |
|---|---|---|
| R1700 | `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts` | integración (Postgres) |
| R1701 | ídem (orden con `cierre_detail`; con gestión `entregado`, `devolucion_a_origen_por_rechazo`, `incidente`; con gestión anulada sí cambia; con `reprogramado` sí cambia) | integración |
| R1702 | ídem (orden sin distrito; distrito sin `zona_distrito`) | integración |
| R1703 | ídem (fila de `historial_accion` con actor; recepción repetida y estado inválido sin fila) + `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` | integración + guardia |
| R1704 | ídem (`devolviendo_a_bodega_central` desalineada conserva zona) + `tests/unit/services/recepcion-bodega-central-service.test.ts` | integración + unit |
| R1705 | `tests/integration/db/retiro-satelite-central.int.test.ts` (orden desalineada retirada conserva zona) | integración |
| R1706 | `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts` (los tres llamadores usan el helper; ningún repositorio repite el corte) + `tests/integration/db/zona-reconciliacion-ordenes.test.ts` verde sin cambiar expectativas | guardia + integración |
| R1707 | `zona-reconciliacion-no-retarifa.guardia.test.ts` (sobre el helper) + `recepcion-central-reconcilia-zona.int.test.ts` y `zona-desalineada-central-migration.test.ts` (fila de la orden y tablas de dinero intactas salvo `zona_id`/`updated_at`) | guardia + integración |
| R1708 | `tests/integration/db/zona-desalineada-central-migration.test.ts` | integración (Postgres, aplica el SQL) |
| R1709 | ídem (matriz de estados y cortes) | integración |
| R1710 | ídem (filas, actor nulo, lote por empresa, etiqueta) | integración |
| R1711 | ídem (`down.sql`: restaura; no pisa una zona cambiada después; borra solo sus acciones) | integración |
| R1712 | ídem (base sin desalineadas) | integración |
| R1713 | `tests/components/ActualizarZonasButton.test.tsx` (visible a maestro/admin, oculto a otros roles; sin selección) | componente |
| R1714 | `tests/unit/services/actualizacion-zonas-action.test.ts` (sin sesión, `adminSatelite`, `adminTienda`, `mensajero`: rechazo sin llamar al servicio) | unit |
| R1715 | `tests/integration/db/actualizacion-zonas.int.test.ts` (vista previa: grupos zona actual → nueva y saltadas con motivo; cero escrituras) + `ActualizarZonasButton.test.tsx` (pinta grupos y saltadas) | integración + componente |
| R1716 | `ActualizarZonasButton.test.tsx` (sin candidatas: mensaje y sin «Confirmar») | componente |
| R1717 | `actualizacion-zonas.int.test.ts` (una orden que cambia entre vista previa y confirmación se re-evalúa; una acción por orden con actor y lote único) | integración |
| R1718 | `actualizacion-zonas.int.test.ts` (resultado con saltadas y las demás actualizadas) + `ActualizarZonasButton.test.tsx` (resultado y `onSuccess`) | integración + componente |
| R1719 | `actualizacion-zonas.int.test.ts` (dos empresas; alineada; distrito sin zona) | integración |
| R1720 | `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts` (nuevo: orden viva con `cierre_detail` y gestión `entregado` de un cierre `aprobado` se mueve, por los TRES llamadores: `ZonaRepository.update`, recepción y `ActualizacionZonasRepository.actualizar`) + `recepcion-central-reconcilia-zona.int.test.ts` (caso nuevo: cierre aprobado anterior se mueve al recibir) | integración (Postgres) |
| R1721 | `reconciliar-zona-corte-vivas.int.test.ts` (`entregado`, `devuelta_a_tienda`, `incidente` sin ningún cierre ni gestión: no se mueven) | integración |
| R1722 | ídem (`cierre_detail` de cierre `solicitado`, `rechazado` y `vencido`; gestión `entregado`/`devolucion_a_origen_por_rechazo`/`incidente` sin cierre y con cierre sin aprobar: no se mueven; la misma gestión ANULADA y la de cierre aprobado: sí) + `recepcion-central-reconcilia-zona.int.test.ts` y `tests/integration/db/zona-reconciliacion-ordenes.test.ts` verdes sin cambiar expectativas | integración |
| R1723 | `reconciliar-zona-corte-vivas.int.test.ts` (cada estado de R1723 con solo cierre aprobado: no se mueve) | integración |
| R1724 | ídem (guardado de zona: `ordenesRetenidasEnBodegaSatelite` cuenta la del estante con cierre aprobado y no cuenta la del estante con cobro en curso) | integración |
| R1725 | `tests/unit/utils/clase-reconciliacion-zona.test.ts` (claves del mapa = `ORDER_STATUS_SEED`; conjunto «se mueve» escrito literal) + typecheck (el `Record` exhaustivo) | unit + typecheck |
| R1726 | `tests/unit/services/actualizacion-zonas-action.test.ts` (donde ya se prueba `motivoDeSaltada`: cada motivo y la precedencia: `devuelta_a_tienda` es «finalizada», no «devolución»; estante con cobro en curso es «estante») + `actualizacion-zonas.int.test.ts` (motivos literales) + `tests/components/ActualizarZonasButton.test.tsx` (texto de cada motivo) | unit + integración + componente |
| R1727 | `actualizacion-zonas.int.test.ts` (vista previa y confirmación seguidas sobre la matriz completa: `actualizadas === total` y mismas saltadas) | integración |

## Preguntas abiertas

> **Estado a 2026-11-19:** P1 y P3 **resueltas** según la recomendación (Carlos: «aprobado […] con
> P1-P3 según recomendación»). P2 **resuelta** por Carlos (D6): va en el PR 2. P4 **resuelta** por Carlos (2026-11-20): no se mueven.

- **P4 — ¿Se mueven las `reprogramado` y las `novedad` que esperan liberación en una bodega?**
  (Resuelta 2026-11-20: no se mueven.) Son órdenes vivas, pero su paquete ya volvió a la bodega que recibió el cierre (la
  del mensajero) y espera a que el cron lo libere (`LiberacionReprogramadaService`,
  `DevolucionSlaService`). La liberación decide `en_bodega_central` o `en_bodega_satelite` con
  `orden.zonaId` (`resolverDestinoCierre`). Si se les cambia la zona de una satélite a la central, la
  liberación las marcará `en_bodega_central` con el paquete en el estante de la satélite: el mismo
  atasco que la 377 evita con `en_bodega_satelite`. Si no se les cambia, se liberan al estante de la
  satélite y salen por el retiro a la central (SLT-197), que al recibirlas ya les corrige la zona
  (R1700). **El spec las deja sin mover** (R1723: es lo que pasa hoy, porque siempre tienen el
  `cierre_detail` de su cierre aprobado) y el botón las lista como saltadas. Si Carlos prefiere
  moverlas, sale `reprogramado` de R1723 y `novedad` de las devoluciones, y hay que decidir qué pasa con
  el paquete que está físicamente en la satélite.

- **P1 — ¿La zona se corrige al recibir en la central (propuesto) o al retirar (lo que decía la
  ficha)?** El spec la corrige al **recibir**. Si se corrigiera al retirar, el manifiesto que se
  descarga justo después del retiro diría como origen la zona nueva («GAM») y no la satélite de la que
  salió el paquete. Ese manifiesto lee la zona viva de la orden (`ManifiestoService`, flujo
  `retiro_satelite`), y lo firma quien transporta: rompería R982 de SLT-197. Mientras la orden va en
  ruta, la zona vieja no bloquea nada: la satélite ya no la ve y la central no la puede asignar hasta
  recibirla. Al recibirla ya tiene la zona correcta. Recomendación: recepción. Si Carlos prefiere el
  retiro, hay que cambiar también de dónde saca el manifiesto el origen del retiro (más alcance).
- **P2 — Órdenes desalineadas que el corte de la 366 deja fuera.** *(Resuelta, D6: «si son ordenes
  que aún se pueden gestionar si se deben mover a la nueva […] pero las ordenes que ya llegaron a un fin
  no es necesario». Las 18 se corrigieron a mano el 2026-11-19; la regla entra en R1720–R1725.)* El corte excluye toda orden con
  algún `cierre_detail`, también el de un intento anterior (por ejemplo, una reprogramada que se cerró,
  se liberó al estante de la satélite y luego se retiró). Esas órdenes seguirían con la zona vieja en
  la central. **En prod son 18 a 2026-11-19** (excluidas en la corrección a mano): 11071399, 15592443,
  34206612, 35992882, 38122514, 49906911, 54072526, 63655976, 72343554, 76276763, 91136377, 99400587,
  14752394, 34981963, 37788390, 47541001, 52502452, 75076250. Este spec no las toca: el T0 las informa y
  el botón las lista como saltadas. Carlos decide si se amplía el corte (es otra regla de dinero: cambia
  la tarifa del siguiente cierre de una orden que ya se facturó una vez) o se corrigen a mano.
- **P3 — Devoluciones fuera (unas 38 desalineadas).** Recomendación: no tocarlas. Motivos en el
  código: `por_devolver_a_bodega_central` solo la puede enviar el `adminSatelite` **de la zona de la
  orden** (`EnvioDevolucionCentralService`, autorización por `orden.zonaId`), así que cambiarle la
  zona la dejaría sin nadie que la pueda enviar. Las demás van de vuelta a la tienda: su resultado ya
  está decidido y la recepción en la central no mira la zona. ¿Confirma Carlos? El botón «Actualizar
  zonas» aplica la misma exclusión y las lista como saltadas con motivo «devolución».
