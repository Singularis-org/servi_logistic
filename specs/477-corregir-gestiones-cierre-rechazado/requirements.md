# 477 — Corregir las gestiones de un cierre rechazado — Requisitos

> Zona `fullstack` · `sdd: true` · complejidad media. Pedida por el humano el 2026-10-14 tras
> corregir por SQL dos gestiones en producción (`progress/correccion_gestion_2026-10-14.md`).
> **Decisión del humano:** corrige SOLO el mensajero, arreglo MÍNIMO (sin modelo nuevo):
> mientras su cierre esté `rechazado` puede deshacer una gestión de ese cierre y volver a
> gestionar la orden; al re-solicitar, el cierre queda coherente.
> **Fuera de alcance:** la corrección de admin (`CierresAdminService.corregirResultadoGestion`,
> ficha 398), los cierres `vencido`, las gestiones LEGADAS (sin evento `gestion_registrada`) y
> cualquier cambio de esquema.

## Glosario (los términos que usan los requisitos)

- **Cierre rechazado propio**: fila de `cierre_dia` con `mensajero_id` = el mensajero actor y
  `estado = rechazado`.
- **Orden en corrección de un cierre X**: orden que tiene fila en `cierre_detail` para X, siendo X
  un cierre rechazado propio, y que NO tiene ninguna gestión vigente (no anulada) vinculada a X.
- **Gestión corregible**: gestión vigente del mensajero actor, registrada con el modelo de la
  ficha 454 (tiene evento `gestion_registrada`), que cumple una de dos:
  (a) está vinculada a un cierre rechazado propio; o
  (b) no tiene cierre y su orden está en corrección de un cierre rechazado propio (es la gestión
  «vuelta a hacer»).
- **Los seis totales del cierre**: `total_efectivo`, `total_simpe`, `total_transferencia`,
  `total_general`, `total_pago_mensajero`, `total_ingreso_bodega_rechazos`.

## A. Deshacer una gestión del cierre rechazado

- **R1** — CUANDO el mensajero pide deshacer una gestión corregible del caso (a), el sistema DEBE,
  en una sola transacción y sin cambiar el estado de la orden: marcarla anulada (`anulada_at`,
  `anulada_por` = el actor), desvincularla del cierre (`cierre_id` NULL) y dejar en NULL sus
  snapshots `pago_mensajero` e `ingreso_bodega_rechazo`.
- **R2** — CUANDO se deshace una gestión según R1, el sistema DEBE registrar el evento
  `gestion_anulada` de esa gestión y encolar su webhook, igual que el deshacer de una gestión sin
  cierre (ficha 454).
- **R3** — CUANDO se deshace una gestión según R1, el sistema DEBE recalcular en la misma
  transacción los seis totales del cierre sobre las gestiones vigentes que le quedan vinculadas,
  sumando los snapshots por gestión ya congelados (sin re-derivar con la tarifa de hoy las
  gestiones que no se tocaron).
- **R4** — CUANDO el mensajero pide deshacer una gestión corregible del caso (b), el sistema DEBE
  deshacerla como hoy se deshace una gestión sin cierre (anulación sin transición, ficha 454),
  aunque el mensajero esté bloqueado por la regla de cierres.
- **R5** — SI el mensajero está bloqueado por la regla de cierres y la gestión pedida NO es
  corregible (inexistente, ajena, sin cierre y fuera de corrección, o de un cierre que no es
  rechazado propio), ENTONCES el sistema DEBE responder el mismo `conflict` con el mismo motivo de
  bloqueo que hoy, sin efectos y sin revelar si la gestión existe.
- **R6** — SI la gestión pedida está vinculada a un cierre en estado `solicitado` o `aprobado`,
  ENTONCES el sistema DEBE rechazar el deshacer sin efectos, con el motivo de hoy («ya está
  incluida en un cierre solicitado»).
- **R7** — SI la gestión corregible la registró la tienda (237/240), ENTONCES el sistema DEBE
  rechazar el deshacer sin efectos con el motivo de hoy («la resolvió la tienda»).
- **R8** — SI la gestión corregible no es la gestión no anulada más reciente de su orden,
  ENTONCES el sistema DEBE rechazar el deshacer sin efectos con el motivo de hoy.
- **R9** — SI la orden de la gestión corregible ya no está `en_reparto` o está borrada,
  ENTONCES el sistema DEBE rechazar el deshacer sin efectos con el motivo de hoy.
- **R10** — SI la gestión vinculada al cierre rechazado es LEGADA (sin evento
  `gestion_registrada`), ENTONCES el sistema DEBE rechazar el deshacer sin efectos con el motivo
  «ya está incluida en un cierre solicitado».
- **R11** — SI entre la lectura y la escritura del deshacer el cierre deja de estar `rechazado`
  (por ejemplo, porque se re-solicitó), ENTONCES el sistema NO DEBE escribir nada y DEBE responder
  `conflict`.

## B. Volver a gestionar la orden

- **R12** — MIENTRAS el mensajero esté bloqueado por la regla de cierres, el sistema DEBE
  permitirle escoger y gestionar una orden en corrección de un cierre rechazado propio, aplicando
  todas las demás guardas de hoy (orden suya, `en_reparto`, sin gestión pendiente ni ayuda
  abierta, reserva de día, tope de intentos, una orden activa a la vez, cuadre del monto).
- **R13** — MIENTRAS el mensajero esté bloqueado por la regla de cierres, el sistema DEBE seguir
  rechazando escoger y gestionar toda orden que NO esté en corrección de un cierre rechazado
  propio, con el motivo de bloqueo de hoy.
- **R14** — CUANDO se registra la gestión de R12, el sistema DEBE dejarla sin cierre
  (`cierre_id` NULL) y pendiente de confirmar, sin mover la orden, igual que cualquier gestión
  nueva (ficha 454).

## C. Re-solicitar el cierre rechazado

- **R15** — CUANDO el mensajero re-solicita un cierre rechazado, el sistema DEBE, en la misma
  transacción que lo pasa a `solicitado`, vincular al cierre las gestiones vigentes sin cierre del
  mensajero cuyas órdenes están en corrección de ESE cierre.
- **R16** — La re-solicitud NO DEBE vincular ninguna otra gestión sin cierre del mensajero
  (gestiones de órdenes que no están en corrección de ese cierre, incluidas las de otro cierre
  rechazado, los rechazos de tienda y las gestiones sintéticas del tope de intentos).
- **R17** — CUANDO la re-solicitud vincula gestiones según R15, el sistema DEBE congelar su
  `pago_mensajero` y su `ingreso_bodega_rechazo` con la tarifa de pago resuelta para la zona
  destino del cierre y el vehículo del mensajero.
- **R18** — CUANDO se re-solicita un cierre rechazado, el sistema DEBE borrar las filas de
  `cierre_detail` de ese cierre cuyas órdenes no tengan ninguna gestión vigente vinculada a él
  tras R15, y DEBE dejar intactas las demás filas.
- **R19** — CUANDO se re-solicita un cierre rechazado, el sistema DEBE recalcular los seis
  totales del cierre sobre las gestiones vigentes vinculadas tras R15, sumando los snapshots por
  gestión.
- **R20** — SI un cierre rechazado se re-solicita sin que se haya deshecho ninguna de sus
  gestiones, ENTONCES los seis totales, los snapshots por gestión y las filas de `cierre_detail`
  DEBEN quedar idénticos a los de antes de re-solicitar.
- **R21** — La re-solicitud de un cierre `vencido` DEBE seguir comportándose como hoy: solo
  cambia el estado, sin vincular gestiones, sin recalcular y sin tocar `cierre_detail`.
- **R22** — SI la re-solicitud pierde la carrera (el cierre ya no está en el estado leído),
  ENTONCES el sistema NO DEBE escribir nada y DEBE responder el `conflict` de hoy.

## D. Aprobación del cierre corregido

- **R23** — CUANDO se aprueba un cierre re-solicitado tras una corrección, el sistema DEBE emitir
  los movimientos de dinero y aplicar el estado de las órdenes según las gestiones vigentes
  vinculadas, y ninguna gestión anulada según R1 DEBE producir movimiento de dinero ni transición
  de orden.
- **R24** — La gestión anulada según R1 NO DEBE contar como intento de entrega; la gestión que la
  sustituye DEBE contar un intento cuando se apruebe el cierre al que quedó vinculada.

## E. Pantallas del mensajero

- **R25** — MIENTRAS el mensajero tenga un cierre rechazado propio, la pantalla de cierre del día
  DEBE mostrar, por cada cierre rechazado, el motivo del rechazo y sus gestiones vigentes, cada una
  con una acción «Deshacer»; para las gestiones que registró la tienda la acción DEBE aparecer
  deshabilitada y decir por qué.
- **R26** — MIENTRAS existan órdenes en corrección de un cierre rechazado propio, la pantalla de
  cierre del día DEBE listarlas indicando si ya se volvieron a gestionar o no, con un enlace a la
  pantalla de Entregas.
- **R27** — MIENTRAS el mensajero esté bloqueado por la regla de cierres, la pantalla de Entregas
  DEBE dejar habilitadas las tarjetas de las órdenes en corrección de un cierre rechazado propio y
  deshabilitadas las demás.
- **R28** — La confirmación de re-solicitud de un cierre rechazado NO DEBE afirmar que los montos
  no se recalculan; y SI hay órdenes en corrección de ese cierre sin volver a gestionar, ENTONCES
  DEBE decir cuántas son y que saldrán del cierre al re-enviarlo.

## Preguntas abiertas (decisiones que dependen del humano)

Cada una trae la opción que el spec adopta por defecto; si el humano no dice otra cosa, se
implementa esa.

1. **El corte nocturno puede adelantarse a la re-solicitud.** Si el mensajero deshace (o deshace
   y vuelve a gestionar) pero no re-solicita antes del corte, el corte se lleva esa orden a un
   cierre `vencido` NUEVO: la barre a `sin_gestionar` si no tiene gestión, o vincula la gestión
   nueva si la tiene (`CorteDiarioRepository.ts:101-152` + `gestionesDelCierreWhere`). El dinero
   sigue cobrándose una sola vez y en ese caso la orden sale del cierre rechazado (R18).
   **Por defecto: se acepta y se avisa en pantalla.** Evitarlo obliga a tocar el predicado
   compartido que decide qué factura cada cierre (ver `design.md`, alternativa A4).
2. **R18 borra filas de `cierre_detail`, que la ficha 69 (R10) declaró inmutable.** Solo afecta a
   cierres que nunca se aprobaron y a órdenes que ya no tienen gestión en ellos; ninguna tabla
   referencia `cierre_detail`. El humano lo pidió («cierre_detail sin filas de gestiones
   anuladas»). **Por defecto: se borra.** Alternativa: conservarlas (los movimientos de dinero
   salen de las gestiones y no las leerían) a cambio de que el comprobante muestre una orden sin
   gestión.
3. **Re-solicitar con órdenes en corrección sin volver a gestionar.** **Por defecto: se permite**
   (salen del cierre, R18 + R28) para no encerrar al mensajero si la orden ya no se puede gestionar
   (tope de intentos, reserva de día). Alternativa: bloquear la re-solicitud hasta que todas estén
   gestionadas de nuevo.
4. **Tarifa de las gestiones nuevas (R17).** Es la tarifa de HOY de la zona destino del cierre,
   igual que acepta la ficha 398 (puerta H2): `cierre_dia` no congela qué fila de
   `tarifa_zona_mensajero` se usó. **Por defecto: se acepta.**
5. **Alcance solo `rechazado`.** Un `vencido` (cierre que creó el corte) no se puede corregir así.
   **Por defecto: fuera de alcance.**
6. **La válvula de escape del admin también saca un cierre de `rechazado`**
   (`forzarSolicitudVencido`, `CierresAdminRepository.ts:137, 2474-2483`), cambiando solo el
   estado. Si el admin la usa sobre un rechazado a medio corregir, el dinero cuadra (R3 ya
   recalculó al deshacer), pero las gestiones rehechas no se vinculan a ese cierre (van al
   siguiente del mensajero) y las filas de `cierre_detail` sin gestión se quedan. **Por defecto:
   no se toca la válvula** (la ficha corrige solo el lado del mensajero). Alternativa: que la
   válvula, sobre un `rechazado`, aplique el mismo tratamiento que R15-R19.
