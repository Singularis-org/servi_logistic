# SLT-197 «Retirar paquetes de una bodega satélite a la central» — requirements

> Estado: **spec completo** (2026-11-17, spec_author), pendiente de aprobación. Ruta completa, zona
> fullstack, complejidad medium. Rango reservado: **R970–R999** (se usan R970–R987). Sin migración.
> El grafo de código no indexa este worktree: todo se leyó con Grep/Read sobre la rama
> `feature/SLT-197-retirar-satelite-a-central` (base `dev` en 83959345).

## Alcance

Cuando una bodega satélite deja de operar (no hay quien entregue en su zona), la central necesita
traerse los paquetes que siguen en el estante de esa satélite (`en_bodega_satelite`) y guardarlos en
la bodega central hasta que la zona vuelva a tener cobertura.

El maestro o el admin seleccionan en `/ordenes` una o varias órdenes en «En bodega satélite» y las
**retiran a la bodega central**:

1. la orden pasa a «En ruta a bodega central» (`en_ruta_bodega_central`), sin mensajero;
2. la central la recibe con el **escáner de recepción que ya existe** y la orden queda «En bodega
   central» (`en_bodega_central`), **con su zona de siempre**;
3. desde ahí sale por «Rutear a bodega satélite» cuando la zona tenga cobertura, como cualquier orden
   de zona satélite recién numerada.

Hoy no existe ninguna transición de salida desde el estante de la satélite hacia otra bodega
(`lib/types/order-status-transiciones.ts:170`, y lo dice `ZonaRepository.ts:665`): esta ficha la
añade, una sola.

### Lo que NO entra

- **Cobrar o pagar el traslado.** El retiro no mueve dinero (R983). Si se quiere cobrarlo a la tienda o
  pagarlo a alguien, es otra ficha (toca dinero) — ver P2.
- **Entregar desde la central** una orden de zona satélite. «Asignar mensajero» de la central sigue
  admitiendo solo órdenes de la zona central (`GuiaAsignacionService.ts:430`). Para repartirla desde la
  central hay que pasar su distrito a la zona central en Configuración de zonas, y eso ya existe (R987).
- **Desactivar o borrar la bodega satélite**, ni tocar a su `adminSatelite` o sus mensajeros.
- **Un estado nuevo** en el catálogo ni un valor nuevo en el enum del historial (design §3).
- **Deshacer el retiro antes de recibirlo** (P6).
- **Traspaso directo satélite → satélite** (lo descartó la 377 como rediseño; aquí no se reabre).

## Requisitos (EARS)

### La transición

- **R970** — El sistema DEBE admitir, desde `en_bodega_satelite`, la transición a
  `en_ruta_bodega_central` y ninguna otra salida nueva (en particular, no `en_bodega_satelite ->
  en_bodega_central` directa).
- **R971** — CUANDO un maestro o un admin confirma «Retirar a bodega central» sobre un lote de órdenes
  en `en_bodega_satelite`, el sistema DEBE pasar todas las del lote a `en_ruta_bodega_central` en una
  sola operación y registrar, por cada orden, una entrada de historial con origen
  `en_bodega_satelite`, destino `en_ruta_bodega_central`, actor = quien confirmó y familia
  `ajuste_estado`.
- **R972** — CUANDO el sistema retira una orden a la central, DEBE dejarla sin mensajero asignado, sin
  fecha de asignación y sin día de reparto, y DEBE conservar sin cambio su zona, su tienda, su número
  de guía, su remisión y su monto a cobrar.
- **R973** — SI alguna orden del lote no existe, está borrada o no está en `en_bodega_satelite`,
  ENTONCES el sistema DEBE rechazar el lote entero, sin modificar ninguna orden ni escribir historial,
  e informar el motivo de cada orden rechazada.
- **R974** — SI el estado de alguna orden del lote cambia entre la validación y la escritura (por
  ejemplo, la satélite la asigna a un mensajero en ese instante), ENTONCES el sistema DEBE dejar todas
  las órdenes del lote como estaban, sin historial, y devolver un conflicto.
- **R975** — SI quien pide el retiro no es maestro ni admin, ENTONCES el sistema DEBE rechazarlo como
  prohibido sin efectos. (P3)
- **R976** — SI no hay sesión, ENTONCES el sistema DEBE responder «no autenticado» sin efectos; SI la
  lista de órdenes viene vacía o mal formada, ENTONCES DEBE responder error de validación sin efectos.
- **R986** — SI el lote mezcla órdenes de varias bodegas satélite, ENTONCES el sistema DEBE retirarlas
  todas (cada una conserva su zona). (P9)

### La recepción y lo que viene después

- **R977** — CUANDO se escanea en la bodega central una orden retirada (en `en_ruta_bodega_central`),
  el sistema DEBE pasarla a `en_bodega_central` con familia `recepcion_bodega_central`, sin cambiar su
  zona. (P4)
- **R978** — MIENTRAS una orden retirada está en `en_bodega_central` y su zona es satélite, el sistema
  DEBE admitirla en «Rutear a bodega satélite» (destino: la bodega de su zona) y DEBE seguir
  rechazándola en «Asignar mensajero» de la central con el motivo de zona no central.
- **R979** — MIENTRAS una orden retirada está en `en_ruta_bodega_central` o en `en_bodega_central`, el
  listado de la bodega satélite de su zona NO DEBE mostrarla, y la asignación de la satélite DEBE
  rechazarla. (P5)
- **R987** — MIENTRAS una orden retirada está en `en_ruta_bodega_central` o en `en_bodega_central`,
  CUANDO se guarda una zona que pasa su distrito a otra zona, el sistema DEBE actualizar su zona y NO
  DEBE contarla como «retenida en el estante de una satélite».

### Pantalla

- **R980** — La pantalla `/ordenes` DEBE ofrecer al maestro y al admin la acción por lote «Retirar a
  bodega central» para las órdenes seleccionadas en `en_bodega_satelite`, y NO DEBE ofrecerla para
  ningún otro estado ni a otro rol.
- **R981** — CUANDO el usuario abre «Retirar a bodega central», la pantalla DEBE pedir confirmación
  indicando cuántas órdenes se retiran; CUANDO el retiro sale bien, DEBE avisar del resultado, mostrar
  la descarga del manifiesto del lote y refrescar el listado al cerrar; SI el retiro se rechaza,
  ENTONCES DEBE mantener el diálogo abierto con el motivo y sin cambios en el listado.
- **R982** — CUANDO se descarga el manifiesto de un retiro, cada fila DEBE llevar como origen la zona
  satélite de la orden, como destino la bodega central y como responsable al usuario que retiró. (P1)
- **R985** — El texto de información del estado «En ruta a bodega central» DEBE describir también el
  paquete que vuelve desde una bodega satélite. (P7)

### Dinero e integraciones

- **R983** — El retiro y su recepción en la central NO DEBEN crear ni modificar movimientos de wallet
  (de mensajero, de tienda o de la empresa), cierres de día, cierres de bodega, cobros a la tienda ni
  pagos al mensajero. (P2)
- **R984** — CUANDO una orden se retira y CUANDO se recibe en la central, el sistema DEBE encolar el
  evento de webhook de estado (`en_ruta_bodega_central` y `en_bodega_central`) según la política
  vigente, sin excepción nueva. (P8)

## Trazabilidad prevista (R -> test)

| R | Test | Tipo |
|---|---|---|
| R970 | `tests/unit/domain/order-status-transiciones.guardia.test.ts` (arista #73 en el inventario y la satélite sigue sin salida a `en_bodega_central`) + `tests/unit/utils/estados-bodega-satelite.test.ts` (sin cambios: el cierre del grafo sigue igual) | unit |
| R971 | `tests/integration/db/retiro-satelite-central.int.test.ts` (estado + filas de historial con actor y familia) y `tests/unit/services/guia-asignacion-retiro-satelite.test.ts` | integración + unit |
| R972 | `retiro-satelite-central.int.test.ts` (columnas leídas tras el retiro) | integración |
| R973 | `guia-asignacion-retiro-satelite.test.ts` (detalle por motivo) + `retiro-satelite-central.int.test.ts` (lote con una orden en otro estado: cero cambios, cero historial) | unit + integración |
| R974 | `retiro-satelite-central.int.test.ts` (la orden cambia de estado entre la lectura del service y la escritura: el repositorio no escribe nada) | integración |
| R975 | `guia-asignacion-retiro-satelite.test.ts` (adminSatelite, adminTienda, mensajero) | unit |
| R976 | `tests/integration/actions/ordenes-guia-action.test.ts` | integración (action) |
| R977 | `retiro-satelite-central.int.test.ts` (recepción con `RecepcionBodegaCentralService` sobre el repo real) | integración |
| R978 | `retiro-satelite-central.int.test.ts` (rutear de nuevo: ok; asignar desde la central: conflicto) | integración |
| R979 | `retiro-satelite-central.int.test.ts` (`findRecepcionSatelitePaginada` de la zona no la devuelve) | integración |
| R980 | `tests/components/OrdenesRetirarACentral.test.tsx` | componente |
| R981 | `tests/components/RetirarACentralModal.test.tsx` | componente |
| R982 | `tests/unit/services/manifiesto-service.test.ts` (flujo `retiro_satelite`) | unit |
| R983 | `retiro-satelite-central.int.test.ts` (conteo de filas de wallet, cierres y cobros antes/después) | integración |
| R984 | `retiro-satelite-central.int.test.ts` (filas del outbox de webhook de las dos transiciones) | integración |
| R985 | `tests/unit/types/order-status.test.ts` | unit |
| R986 | `guia-asignacion-retiro-satelite.test.ts` + `retiro-satelite-central.int.test.ts` (lote de dos zonas) | unit + integración |
| R987 | `retiro-satelite-central.int.test.ts` (`ZonaRepository.update` mueve la zona de la retirada y no la cuenta como retenida; la que sigue en el estante sí se cuenta) | integración |

E2E: `e2e/retiro-satelite-central.spec.ts` recorre R980 → R971 → R977 → R978 en pantalla
(`docs/checkpoints-proyecto.md`: toca asignación y recepción).

## Preguntas abiertas

Cada una con la propuesta por defecto que el spec ya implementa. Si Carlos responde otra cosa, cambia
el requisito que se indica.

- **P1 — ¿Quién transporta los paquetes de la satélite a la central?** Propuesta: **fuera de la app**,
  igual que el ruteo central → satélite, que tampoco asigna mensajero (`rutearBodegaSateliteLote` deja
  `mensajero_asignado_id` en NULL). La orden viaja sin mensajero y el manifiesto lleva como responsable
  a quien retiró (R972, R982). Si debe ir un mensajero concreto, es un paso de asignación más y
  probablemente una arista o un estado nuevo: otra ficha.
- **P2 — ¿El traslado tiene costo para la tienda o pago para alguien?** Propuesta: **no**. Ni cobro a la
  tienda, ni pago al mensajero, ni a la satélite (R983). El paquete en el estante no tiene gestión ni
  cierre abierto, así que hoy nada lo cobra. Si se quiere cobrar, es una ficha de dinero aparte.
- **P3 — ¿Puede iniciarlo el `adminSatelite` de esa bodega?** Propuesta: **no, solo maestro y admin**
  (R975), como «Rutear a bodega satélite». La bodega deja de operar por decisión de la central; además
  la satélite que cierra puede no tener ya a nadie. Si se quiere, se añade la rama «adminSatelite de la
  zona de la orden» con el molde de `EnvioDevolucionCentralService`.
- **P4 — ¿Hace falta confirmación física al llegar a la central?** Propuesta: **sí**, con el escáner de
  recepción de la central que ya existe (R977). Sin él la orden quedaría «en bodega central» sin que
  nadie haya visto el paquete. Pasar directo a `en_bodega_central` ahorra un paso pero pierde esa
  evidencia.
- **P5 — ¿Qué ve la satélite mientras el paquete vuelve?** Propuesta: **deja de verla en cuanto sale**
  (R979). `en_ruta_bodega_central` ya está fuera de su listado a propósito
  (`ESTADOS_FUERA_DEL_LISTADO_SATELITE`: «la custodia volvió a la central»). Lo que pasó queda en la línea
  de tiempo de la orden, que ve la central.
- **P6 — ¿Se puede deshacer un retiro antes de que llegue a la central?** Propuesta: **no en esta
  ficha**. Si fue un error, se recibe en la central y se vuelve a rutear a la satélite. Si se quiere el
  deshacer directo, es una arista más (`en_ruta_bodega_central -> en_bodega_satelite`, familia
  `deshacer_asignacion`) con su acción en `/ordenes`.
- **P7 — Texto del (i) de «En ruta a bodega central».** Hoy dice «El mensajero recogió el paquete en la
  tienda y lo lleva a la bodega central.» y el cliente lo ve en el rastreo público. Propuesta: «El
  paquete va camino a la bodega central.» (R985), que vale para los dos casos sin contarle al
  destinatario que su bodega cerró.
- **P8 — ¿El integrador por API recibe el webhook de la vuelta?** Propuesta: **sí, como hoy**: los dos
  estados ya son eventos públicos y la política no exceptúa ninguna familia (R984). El integrador verá
  su orden pasar de nuevo por «en ruta a bodega central» y «en bodega central».
- **P9 — El borrador dice «por bodega»: ¿el lote debe ser de una sola bodega?** Propuesta: **no se
  restringe** (R986): retirar mezcla de bodegas no tiene efecto raro (cada orden vuelve a la central con
  su zona) y el filtro de zona de `/ordenes` ya permite trabajar bodega a bodega.
