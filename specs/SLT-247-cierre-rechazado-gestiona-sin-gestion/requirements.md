# SLT-247 — Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de reenviarlo — Requisitos

> Ruta completa, zona `fullstack`, complejidad `medium`. Rango de requisitos: **R1770–R1800**
> (el más alto usado en `specs/` era R1769, reservado por SLT-225).

## Alcance

Caso real (producción, 2026-11-20): el cierre `f11ceb85` del mensajero Bryan Moreira Caldera nació
`vencido` del corte diario con 11 órdenes en `cierre_sin_gestion` (barridas a `novedad_interna`) y 0
en `cierre_detail`; hoy está `solicitado`. Si la oficina lo rechaza, esas 11 órdenes quedan
inalcanzables: la gestión exige `en_reparto` y `novedad_interna` solo se libera al **aprobar**.

**Entra:**
- Al **rechazar** un cierre, sus órdenes barridas que sigan en `novedad_interna` vuelven a
  `en_reparto` del mismo mensajero.
- El mensajero las ve en Entregas y las gestiona aunque esté bloqueado (la exención de la ficha 477).
- El reenvío del rechazado se bloquea mientras quede alguna sin gestionar, con un mensaje que dice
  cuáles.
- Al reenviar, esas gestiones se vinculan al cierre rechazado y sus totales se recalculan.
- «Cierre del día» le muestra al mensajero cuáles tiene que gestionar.
- Carreras con el corte diario, con la aprobación (confirmación física) y con la válvula del admin.

**No entra:**
- Lo ya gestionado de un cierre rechazado. Ya se puede devolver a gestión y volver a gestionar
  (ficha 477, verificado en código). No se rehace; solo se comprueba que sigue igual.
- Los cierres `vencido` reenviados sin rechazo: siguen exactamente como hoy.
- Una opción nueva de resultado de gestión (ver Pregunta abierta b).
- Migración de datos sobre cierres ya rechazados antes del despliegue (ver R1800 y la Pregunta
  abierta c).
- La corrección del admin (ficha 398) y la válvula `forzarSolicitudVencido` (se documenta su
  efecto, no se cambia).

## Decisiones cerradas (no reabrir)

| # | Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|---|
| D1 | 2026-11-20 | Carlos | «un cierre rechazado permita al mensajero regestionar de nuevo sus ordenes si es que el decide devolver la gestion (de lo que ya fue gestionado)…» → lo ya gestionado sigue con la ficha 477, sin cambios. | R1786 |
| D2 | 2026-11-20 | Carlos | «…pero en lo que se quedó sin gestion esas si las tiene que gestionar antes de reenviar el cierre» → las barridas vuelven al mensajero al rechazar y el reenvío se bloquea hasta gestionarlas. | R1770, R1778, R1782, R1783 |
| D3 | 2026-11-20 | Carlos | «dale implementala y saquemosla a producción rápido» → arreglo MÍNIMO sobre lo que ya existe: sin tablas ni columnas nuevas y sin migración de datos. | R1772, R1786, R1787, R1800 |
| D4 | 2026-11-20 | Carlos (descripción de la ficha) | «Cierre del día» le muestra al mensajero qué órdenes pasaron a Novedad interna. | R1795, R1798 |

## Glosario

- **Cierre rechazado propio**: fila de `cierre_dia` con `estado = rechazado` y `mensajero_id` = el
  mensajero.
- **Barrida de un cierre X**: orden con fila en `cierre_sin_gestion` para X (la escribe el corte
  diario al crear X, feature 264).
- **Orden obligatoria de X**: barrida de X, con X cierre rechazado propio, que está `en_reparto`,
  no borrada, asignada al mensajero de X, y sin ninguna gestión vigente (no anulada) vinculada a X.
  Es la ampliación del concepto «orden en corrección» de la ficha 477 a la segunda fuente
  (`cierre_sin_gestion` además de `cierre_detail`).
- **Obligatoria pendiente**: orden obligatoria de X para la que el mensajero no tiene ninguna
  gestión vigente sin cierre (la que la re-solicitud vincularía, 477/R15).

## Requisitos (EARS)

### A. El rechazo devuelve las barridas al mensajero

- **R1770** — CUANDO un maestro o admin rechaza un cierre, el sistema DEBE, en la misma transacción
  que lo pasa a `rechazado`, mover de `novedad_interna` a `en_reparto` cada barrida de ese cierre
  que siga en `novedad_interna`, no esté borrada y esté asignada al mensajero del cierre,
  conservando su `mensajero_asignado_id`.
- **R1771** — CUANDO se mueve una orden según R1770, el sistema DEBE registrar en su historial una
  sola transición `novedad_interna -> en_reparto` con el origen `retorno_por_rechazo_cierre`, el
  actor que rechazó y sin gestión enlazada; esa transición NO DEBE contar como intento de entrega.
- **R1772** — El movimiento de R1770 NO DEBE cambiar ningún total del cierre, ninguna gestión,
  ninguna fila de `cierre_detail` ni de `cierre_sin_gestion`, ni emitir movimientos de wallet.
- **R1773** — SI una barrida del cierre rechazado ya no está en `novedad_interna`, está borrada o
  tiene otro mensajero asignado, ENTONCES el sistema NO DEBE tocarla.
- **R1774** — SI el cierre rechazado no tiene barridas (o es anterior al registro de la 264,
  `sin_gestion_registrado = false`), ENTONCES el rechazo DEBE comportarse exactamente como hoy y
  no mover ninguna orden.
- **R1775** — SI el catálogo de estados no resuelve `novedad_interna` o `en_reparto`, ENTONCES el
  sistema NO DEBE rechazar el cierre y DEBE responder un error de validación, sin ningún efecto.
- **R1776** — SI el rechazo no se aplica (el cierre ya no está en un estado resoluble, o está fuera
  del alcance de quien rechaza), ENTONCES el sistema NO DEBE mover ninguna orden.
- **R1777** — El movimiento de R1770 DEBE limitarse a órdenes de la empresa del cierre; un intento
  de rechazar un cierre de otra empresa DEBE responder `no_encontrada` sin mover ninguna orden.

### B. Gestionar las órdenes obligatorias

- **R1778** — MIENTRAS el mensajero esté bloqueado por la regla de cierres, el sistema DEBE
  permitirle escoger y gestionar una orden obligatoria de un cierre rechazado propio, aplicando
  todas las demás guardas de hoy (orden suya, `en_reparto`, sin gestión pendiente, reserva de día,
  tope de intentos, una orden activa a la vez, cuadre del monto).
- **R1779** — MIENTRAS el mensajero esté bloqueado, la pantalla de Entregas DEBE listar sus órdenes
  obligatorias con la tarjeta habilitada, y el aviso de bloqueo DEBE contarlas entre las que «solo
  puedes volver a gestionar» (ficha 479).
- **R1780** — CUANDO el mensajero registra la gestión de una orden obligatoria, el sistema DEBE
  dejarla sin cierre y pendiente de confirmar, sin mover la orden (igual que 477/R14).
- **R1781** — MIENTRAS el cierre siga `rechazado`, el sistema DEBE permitir al mensajero deshacer
  la gestión de R1780 como hoy se deshace una gestión sin cierre (477/R4); tras deshacerla, la orden
  DEBE volver a ser obligatoria pendiente.

### C. Reenviar el cierre rechazado

- **R1782** — SI el mensajero reenvía un cierre rechazado que tiene al menos una obligatoria
  pendiente, ENTONCES el sistema NO DEBE reenviarlo, NO DEBE escribir nada y DEBE responder un
  conflicto cuyo motivo diga cuántas faltan y sus números de guía.
- **R1783** — La comprobación de R1782 DEBE hacerse dentro de la misma transacción que reenvía,
  después de tomar el candado del cierre.
- **R1784** — CUANDO se reenvía un cierre rechazado sin obligatorias pendientes, el sistema DEBE, en
  la misma transacción, vincular al cierre las gestiones de sus órdenes obligatorias (477/R15) y
  crear para cada orden vinculada que no tenga fila en `cierre_detail` de ese cierre su fila de
  detalle con el cobro congelado, con el mismo cálculo que al solicitar un cierre.
- **R1785** — CUANDO se reenvía según R1784, el sistema DEBE congelar el pago al mensajero de las
  gestiones recién vinculadas (477/R17) y recalcular los seis totales del cierre sobre todas sus
  gestiones vigentes (477/R19).
- **R1786** — Para lo ya gestionado de un cierre rechazado, el sistema DEBE conservar el
  comportamiento de la ficha 477 (deshacer opcional; una orden deshecha y no vuelta a gestionar sale
  del cierre al reenviar), y un rechazado sin obligatorias DEBE reenviarse con totales, snapshots y
  filas de `cierre_detail` idénticos a los de hoy.
- **R1787** — La re-solicitud de un cierre `vencido` DEBE seguir cambiando solo su estado, sin
  bloqueo por barridas, y su aprobación DEBE liberar sus barridas como hoy (109/R16).

### D. El corte diario no las vuelve a barrer

- **R1788** — MIENTRAS un cierre esté `rechazado`, el corte diario NO DEBE seleccionar al mensajero
  por sus barridas `en_reparto` de ese cierre, NO DEBE barrerlas a `novedad_interna` y NO DEBE crear
  un cierre `vencido` por ellas.
- **R1789** — CUANDO el cierre deja de estar `rechazado`, el corte DEBE volver a tratar esas órdenes
  como cualquier otra: una que siga `en_reparto` sin gestión la barre el corte siguiente.
- **R1790** — SI el mensajero gestionó una orden obligatoria y el corte corre antes de que reenvíe el
  rechazado, ENTONCES la gestión DEBE ir al cierre que cree el corte (comportamiento aceptado en la
  ficha 477, pregunta abierta 1), la orden DEBE dejar de ser obligatoria pendiente y el dinero de
  esa gestión DEBE contarse una sola vez.

### E. Aprobación del cierre reenviado

- **R1791** — CUANDO se aprueba un cierre, las barridas que bodega debe confirmar físicamente
  DEBEN ser solo aquellas cuya orden sigue en `novedad_interna`, y la pantalla de aprobación DEBE
  pedir exactamente el mismo conjunto que exige el servidor.
- **R1792** — CUANDO se aprueba el cierre reenviado, las gestiones vinculadas según R1784 DEBEN
  aplicar estado de orden y dinero como cualquier gestión del cierre (454) y contar un intento
  (477/R24), y ninguna orden devuelta según R1770 que esté `en_reparto` DEBE pasar por la liberación
  de `novedad_interna`.
- **R1793** — Las filas de `cierre_sin_gestion` NO DEBEN borrarse ni editarse al rechazar, reenviar
  ni aprobar (siguen siendo el registro de lo que barrió el corte).
- **R1794** — SI un admin pasa a `solicitado` con la válvula `forzarSolicitudVencido` un rechazado
  con obligatorias pendientes, ENTONCES el sistema DEBE permitirlo como hoy; esas órdenes DEBEN
  quedar `en_reparto` con su mensajero, la aprobación de ese cierre NO DEBE exigirlas en la
  confirmación física ni liberarlas, y el corte siguiente DEBE barrerlas según R1789.

### F. Pantallas del mensajero

- **R1795** — MIENTRAS un cierre rechazado propio tenga órdenes obligatorias, la pestaña «Corregir»
  de «Cierre del día» DEBE listarlas (guía, remisión, destinatario) indicando que tiene que
  gestionarlas antes de reenviar, distinguidas de las órdenes deshechas de la 477, con el estado
  «ya la gestionaste» o «falta gestionarla» y el enlace a Entregas.
- **R1796** — MIENTRAS el cierre rechazado de la página tenga obligatorias pendientes, la acción de
  reenviarlo DEBE aparecer deshabilitada con un motivo que diga cuántas faltan.
- **R1797** — La confirmación de reenvío del rechazado (477/R28) DEBE contar solo las órdenes
  deshechas sin volver a gestionar, nunca las obligatorias.
- **R1798** — MIENTRAS el cierre de la página sea `vencido` o `rechazado`, «Cierre del día» DEBE
  seguir mostrando la lista de las órdenes que el corte pasó a «Novedad interna» (264, R151 de la
  pantalla actual).

### G. Producción

- **R1799** — CUANDO, tras el despliegue, se rechaza un cierre creado antes del despliegue
  (incluido `f11ceb85`, hoy `solicitado`), el sistema DEBE aplicar R1770–R1777 igual que a uno nuevo.
- **R1800** — Un cierre que ya estaba `rechazado` antes del despliegue NO DEBE cambiar por el
  despliegue: sus barridas en `novedad_interna` no se mueven, no son obligatorias, no bloquean su
  reenvío y se liberan al aprobarlo como hoy.

## Preguntas abiertas

Cada una trae la recomendación del spec; si Carlos no dice otra cosa, se implementa esa.

- **(a) Fecha de la gestión nueva.** Hoy la 477 registra la gestión rehecha con la fecha y hora
  reales en que el mensajero la hace (`gestion_orden.created_at = now`) y solo la vincula al cierre
  al reenviarlo; no la retro-fecha. **Recomendación: lo mismo** (fecha real del registro). Efecto
  visible: la «jornada» que se muestra del cierre se calcula con los días de sus gestiones
  (`lib/utils/jornada-cierre.ts`); un cierre como `f11ceb85`, que hoy no tiene gestiones y se fecha
  como «día de creación menos uno», pasará a fecharse con el día de las gestiones, o a no mostrar
  fecha si caen en días distintos. Los KPI de Entregas de ese día también las cuentan.
- **(b) ¿Opción «no la tengo»?** **Recomendación: no.** Los resultados que ya existen cubren los
  casos: `novedad` (devuelta), `reprogramado`, `devolucion_a_origen_por_rechazo` e `incidente`
  (pérdida o daño, con su indemnización al aprobar). En el tope de intentos siguen disponibles los
  resultados permitidos (`permitidoEnElTope`). Añadir un resultado es tocar el dinero de la
  aprobación, los intentos y el webhook: no es el arreglo mínimo.
- **(c) Cierres que ya estén `rechazado` antes del despliegue con barridas en `novedad_interna`.**
  R1800 los deja como hoy (sin migración de datos). **Recomendación: así**, salvo que la T0 de
  `tasks.md` encuentre alguno; en ese caso el leader trae el número y Carlos decide si se escribe un
  script de un solo uso que les aplique R1770.
- **(d) Un valor nuevo de enum (`retorno_por_rechazo_cierre`).** Es el único cambio de esquema: una
  migración `ALTER TYPE … ADD VALUE` con su `down.sql`. Sin tablas ni columnas nuevas.
  **Recomendación: aceptarlo.** La alternativa barata (reusar `deshacer_gestion`) deja un historial
  que dice que el mensajero deshizo una gestión que nunca existió (ver `design.md`, A2).
