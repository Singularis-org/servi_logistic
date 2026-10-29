# SLT-56 — ajuste-pago-mensajero-cierre · requirements.md

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: feature/SLT-56-ajuste-pago-mensajero-cierre
> Épica: EP-8 Tarifas flexibles
>
> **Alcance.** Al revisar un cierre del mensajero, antes de aprobarlo, maestro y admin (y el
> adminSatelite en los cierres de su bodega) pueden cambiar lo que el mensajero gana por cualquier
> gestión del cierre, incluidas rechazos y devoluciones que hoy pagan 0. El motivo es obligatorio;
> el historial guarda quién, cuándo, valor anterior y nuevo. Los totales del cierre (y del cierre
> de bodega) reflejan el ajuste y la gestión queda marcada como «ajustada».
>
> **Lo que NO entra.** Ajustar un cierre ya aprobado (después se usa premio o descuento en la
> wallet, como hoy). Valor propio del mensajero → SLT-55. Tarifas nuevas → SLT-52.
>
> Sembrado por `/afinar-feature` el 2026-10-29. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Vocabulario:

- **Cierre abierto**: cierre del día en estado `solicitado` o `vencido` (aún sin aprobar y en manos
  de quien lo revisa). Un cierre `aprobado` o `rechazado` no está abierto.
- **Pago de la gestión**: lo que el mensajero gana por esa gestión, congelado al solicitar el cierre.
- **Ajuste**: cambio del pago de una gestión hecho al revisar el cierre.
- **Alcance del actor**: `maestro` y `admin`, los cierres con destino bodega central;
  `adminSatelite`, los cierres con destino la bodega satélite de su zona.

### Quién puede ajustar

- **R1.** CUANDO un `maestro` o un `admin` pide ajustar el pago de una gestión de un cierre abierto
  con destino bodega central, el sistema DEBE dejar el pago de esa gestión en el valor nuevo.
- **R2.** CUANDO un `adminSatelite` pide ajustar el pago de una gestión de un cierre abierto cuyo
  destino es la bodega satélite de su zona, el sistema DEBE aplicar el ajuste en ese momento, sin
  aprobación de la central.
- **R3.** SI un `adminSatelite` pide ajustar una gestión de un cierre que no está en su alcance (otra
  satélite o la central), o no tiene zona, ENTONCES el sistema DEBE responder «no encontrada», sin
  escribir nada y sin distinguirlo de una gestión inexistente.
- **R4.** SI quien pide el ajuste no es `maestro`, `admin` ni `adminSatelite` (incluido el
  mensajero), o no tiene sesión, ENTONCES el sistema DEBE rechazarlo sin escribir nada.

### Cuándo y qué

- **R5.** SI el cierre de la gestión no está abierto (`aprobado` o `rechazado`), también cuando
  cambia de estado entre que se abre el detalle y se guarda el ajuste, ENTONCES el sistema DEBE
  responder «conflicto» sin escribir nada.
- **R6.** El sistema DEBE admitir el ajuste en una gestión de cualquier resultado (entregada,
  rechazada, devuelta, reprogramada, incidente), incluidas las que hoy pagan 0.
- **R7.** SI el motivo llega vacío o solo con espacios, ENTONCES el sistema DEBE rechazar el ajuste
  con un error en el campo motivo, sin escribir nada.
- **R8.** SI el valor nuevo no es un importe mayor o igual que 0, con hasta 2 decimales y dentro del
  máximo que admite un importe del sistema, o es igual al pago vigente de la gestión, ENTONCES el
  sistema DEBE rechazar el ajuste con un error en el campo del valor, sin escribir nada.
- **R9.** SI el pago vigente de la gestión ya no es el que la pantalla mostraba al pedir el ajuste
  (otro ajuste o una corrección entre medias), ENTONCES el sistema DEBE responder «conflicto» sin
  escribir nada.

### Efecto en los totales

- **R10.** CUANDO se aplica un ajuste, el sistema DEBE dejar el total de pago al mensajero del
  cierre igual a la suma de los pagos vigentes de sus gestiones, en el mismo acto, sin recalcular
  con la tarifa el pago de ninguna otra gestión y sin cambiar el recaudo ni el ingreso de bodega por
  rechazos.
- **R11.** CUANDO se aplica un ajuste, el sistema DEBE mostrar en el detalle del cierre el pago
  nuevo de la gestión, el total de pago al mensajero nuevo y «para la central» recalculado (total
  general − pago al mensajero − ingreso de bodega por rechazos), sin recargar la página.
- **R12.** El ajuste NO DEBE cambiar la tarifa de la zona ni el pago de ninguna otra gestión.
- **R13.** CUANDO se aprueba un cierre con gestiones ajustadas, el sistema DEBE calcular el devengo
  del mensajero, lo pagado del efectivo (mínimo entre devengo y efectivo) y el egreso de caja sobre
  el total de pago ajustado.
- **R14.** CUANDO se consolida un cierre de bodega que incluye cierres con gestiones ajustadas, el
  sistema DEBE calcular su total de pago a mensajeros y su «para la central» sobre los totales
  ajustados de esos cierres.
- **R15.** CUANDO un cierre `rechazado` con gestiones ajustadas se vuelve a solicitar, el sistema
  DEBE conservar el pago ajustado de esas gestiones.
- **R16.** El sistema DEBE validar, comparar y sumar los importes del ajuste en decimal exacto, sin
  pasar por coma flotante en ningún punto.

### Historial y marca

- **R17.** CUANDO se aplica un ajuste, el sistema DEBE guardar, en el mismo acto y sin posibilidad de
  editarlo ni borrarlo después, quién lo hizo (con su rol de ese momento), cuándo, la gestión, el
  cierre, el valor anterior, el valor nuevo y el motivo. SI cualquier parte del ajuste falla,
  ENTONCES el sistema NO DEBE dejar ninguna de las demás.
- **R18.** CUANDO se aplica un ajuste, el sistema DEBE añadir una fila al historial de acciones, en
  la categoría «mueve dinero», con quién, cuándo, la gestión (por su guía) y el valor nuevo, sin el
  motivo.
- **R19.** MIENTRAS una gestión tenga al menos un ajuste, el detalle del cierre (en la revisión de
  cierres) DEBE mostrarla marcada «Ajustado» y, al consultarla, sus ajustes en orden cronológico con
  quién, cuándo, valor anterior, valor nuevo y motivo.
- **R20.** MIENTRAS un cierre incluido en un cierre de bodega tenga gestiones ajustadas, el detalle
  del cierre de bodega DEBE marcar ese cierre y esas gestiones como ajustadas, con el mismo
  historial de R19.

### Pantalla

- **R21.** DONDE el actor puede ajustar (R1/R2) y el cierre está abierto, el detalle del cierre DEBE
  ofrecer «Ajustar pago» en cada gestión, con el pago vigente, el campo del valor nuevo y el motivo
  obligatorio. En un cierre no abierto, o a cualquier otro rol, NO DEBE ofrecerlo.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| ¿Quién ajusta? | R1, R2, R3, R4, R21 |
| ¿Cómo? (por gestión, motivo, historial) | R7, R17, R18, R19 |
| ¿Hasta cuándo? | R5, R15, R21 |
| ¿Qué gestiones? | R6 |
| Satélite sin aprobación de la central | R2, R14, R20 |
| Congelado | R10, R12 |
| Libro de pagos | R13 |
| E2E | R11, R13, R19, R20 (recorridos en E2E, `tasks.md > T9`) |

## Preguntas abiertas

- **Q1.** Si una gestión `entregada` ya ajustada se corrige después a `rechazada` (la corrección de
  resultado de la ficha 398), hoy esa corrección reescribe el pago por la regla del rechazo. ¿Debe
  seguir así (el ajuste se pierde y queda solo en el historial) o conservar el valor ajustado?
  Propuesta del spec: seguir así —la corrección cambia el hecho que el ajuste valoraba— y que la
  gestión siga marcada «Ajustado» con su historial, para que se pueda volver a ajustar. Mientras no
  se responda, `design.md` no toca la 398.
- **Q2.** ¿El mensajero ve en su propio cierre la marca «Ajustado» y el motivo? Hoy ya vería el
  valor nuevo (sale del mismo pago congelado). Propuesta del spec: ve el valor nuevo, sin marca ni
  motivo en esta feature; si se quiere, va en otra ficha.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Quién ajusta? | `maestro` y `admin`; `adminSatelite` solo en cierres de su bodega. |
| 2026-10-28 | ¿Cómo? | Por gestión, con motivo obligatorio; historial con valor anterior y nuevo. |
| 2026-10-29 | ¿Hasta cuándo? | Solo antes de aprobar el cierre. Aprobado, queda fijo. |
| 2026-10-29 | ¿Qué gestiones? | Cualquiera, también rechazo o devolución (hoy pagan 0). |
| 2026-10-29 | ¿La central aprueba el ajuste de la satélite? | No: entra directo, queda visible en historial y en el cierre de bodega, marcado como ajustado. |
| heredado | Congelado | El pago se congela al solicitar el cierre (39); el ajuste cambia esa copia, no la tarifa. |
| heredado | Libro de pagos | `PagoMensajeroMovimiento` es de solo-agregar; el devengo refleja el valor ajustado. |
| heredado | E2E | Obligatorio: toca importes (`docs/checkpoints-proyecto.md > Flujos criticos`). |
