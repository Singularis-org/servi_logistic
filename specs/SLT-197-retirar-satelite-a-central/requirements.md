# SLT-197 «Retirar paquetes de una bodega satélite a la central» — requirements

> Estado: **spec aprobado** (2026-11-17, Carlos: «apruebo todo pero no es necesario lo de la api»).
> Ruta completa, zona fullstack, complejidad medium. Rango reservado: **R970–R999** (se usan
> R970–R986). Sin migración. El grafo de código no indexa este worktree: todo se leyó con Grep/Read
> sobre la rama `feature/SLT-197-retirar-satelite-a-central` (base `dev` en 83959345).

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
  pagarlo a alguien, es otra ficha (toca dinero) — D2.
- **Trabajo de API o de integradores** (D8): ni requisito, ni test, ni documentación de API, ni cambios
  en el código de webhooks. Lo que el mecanismo genérico ya haga al cambiar de estado se queda como está.
- **Entregar desde la central** una orden de zona satélite. «Asignar mensajero» de la central sigue
  admitiendo solo órdenes de la zona central (`GuiaAsignacionService.ts:430`). Para repartirla desde la
  central hay que pasar su distrito a la zona central en Configuración de zonas, y eso ya existe (R986).
- **Desactivar o borrar la bodega satélite**, ni tocar a su `adminSatelite` o sus mensajeros.
- **Un estado nuevo** en el catálogo ni un valor nuevo en el enum del historial (design §3).
- **Deshacer el retiro antes de recibirlo** (D6).
- **Traspaso directo satélite → satélite** (lo descartó la 377 como rediseño; aquí no se reabre).

## Decisiones cerradas (no reabrir)

Todas del 2026-11-17, de Carlos, al aprobar el spec («apruebo todo pero no es necesario lo de la api»).
Eran las preguntas P1–P9 de la versión anterior.

| # | Decisión | Fecha | Quién | Cubre |
|---|---|---|---|---|
| D1 | **Quién transporta:** fuera de la app, sin mensajero, igual que el ruteo central → satélite. El manifiesto lleva como responsable a quien retiró. | 2026-11-17 | Carlos | R972, R982 |
| D2 | **Costo o pago:** ninguno. Ni cobro a la tienda, ni pago al mensajero, ni a la satélite. | 2026-11-17 | Carlos | R983 |
| D3 | **Quién lo inicia:** solo maestro y admin; el `adminSatelite` no. | 2026-11-17 | Carlos | R975, R980 |
| D4 | **Confirmación física en la central:** sí, con el escáner de recepción que ya existe. | 2026-11-17 | Carlos | R977 |
| D5 | **Qué ve la satélite:** deja de verla en cuanto sale; lo ocurrido queda en la línea de tiempo de la orden. | 2026-11-17 | Carlos | R979 |
| D6 | **Deshacer antes de recibir:** no en esta ficha; se recibe en la central y se vuelve a rutear. | 2026-11-17 | Carlos | R970 |
| D7 | **Texto del (i) de «En ruta a bodega central»:** «El paquete va camino a la bodega central.» | 2026-11-17 | Carlos | R984 |
| D8 | **API e integradores:** sin trabajo de API. Sin requisito, test ni documentación de API; el código de webhooks no se toca. | 2026-11-17 | Carlos | (fuera de alcance) |
| D9 | **Lote de varias bodegas:** no se restringe; el filtro de zona de `/ordenes` permite trabajar bodega a bodega. | 2026-11-17 | Carlos | R985 |

## Requisitos (EARS)

### La transición

- **R970** — El sistema DEBE admitir, desde `en_bodega_satelite`, la transición a
  `en_ruta_bodega_central` y ninguna otra salida nueva (en particular, no `en_bodega_satelite ->
  en_bodega_central` directa), y NO DEBE admitir ninguna salida nueva desde `en_ruta_bodega_central`
  hacia `en_bodega_satelite`.
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
  prohibido sin efectos. (D3)
- **R976** — SI no hay sesión, ENTONCES el sistema DEBE responder «no autenticado» sin efectos; SI la
  lista de órdenes viene vacía o mal formada, ENTONCES DEBE responder error de validación sin efectos.
- **R985** — SI el lote mezcla órdenes de varias bodegas satélite, ENTONCES el sistema DEBE retirarlas
  todas (cada una conserva su zona). (D9)

### La recepción y lo que viene después

- **R977** — CUANDO se escanea en la bodega central una orden retirada (en `en_ruta_bodega_central`),
  el sistema DEBE pasarla a `en_bodega_central` con familia `recepcion_bodega_central`, sin cambiar su
  zona. (D4)
- **R978** — MIENTRAS una orden retirada está en `en_bodega_central` y su zona es satélite, el sistema
  DEBE admitirla en «Rutear a bodega satélite» (destino: la bodega de su zona) y DEBE seguir
  rechazándola en «Asignar mensajero» de la central con el motivo de zona no central.
- **R979** — MIENTRAS una orden retirada está en `en_ruta_bodega_central` o en `en_bodega_central`, el
  listado de la bodega satélite de su zona NO DEBE mostrarla, y la asignación de la satélite DEBE
  rechazarla. (D5)
- **R986** — MIENTRAS una orden retirada está en `en_ruta_bodega_central` o en `en_bodega_central`,
  CUANDO se guarda una zona que pasa su distrito a otra zona, el sistema DEBE actualizar su zona y NO
  DEBE contarla como «retenida en el estante de una satélite».

### Pantalla

- **R980** — La pantalla `/ordenes` DEBE ofrecer al maestro y al admin la acción por lote «Retirar a
  bodega central» para las órdenes seleccionadas en `en_bodega_satelite`, y NO DEBE ofrecerla para
  ningún otro estado ni a otro rol. (D3)
- **R981** — CUANDO el usuario abre «Retirar a bodega central», la pantalla DEBE pedir confirmación
  indicando cuántas órdenes se retiran; CUANDO el retiro sale bien, DEBE avisar del resultado, mostrar
  la descarga del manifiesto del lote y refrescar el listado al cerrar; SI el retiro se rechaza,
  ENTONCES DEBE mantener el diálogo abierto con el motivo y sin cambios en el listado.
- **R982** — CUANDO se descarga el manifiesto de un retiro, cada fila DEBE llevar como origen la zona
  satélite de la orden, como destino la bodega central y como responsable al usuario que retiró. (D1)
- **R984** — El texto de información del estado «En ruta a bodega central» DEBE ser «El paquete va
  camino a la bodega central.» (D7)

### Dinero

- **R983** — El retiro y su recepción en la central NO DEBEN crear ni modificar movimientos de wallet
  (de mensajero, de tienda o de la empresa), cierres de día, cierres de bodega, cobros a la tienda ni
  pagos al mensajero. (D2)

## Trazabilidad prevista (R -> test)

| R | Test | Tipo |
|---|---|---|
| R970 | `tests/unit/domain/order-status-transiciones.guardia.test.ts` (arista #73 en el inventario; `en_bodega_satelite -> en_bodega_central` y `en_ruta_bodega_central -> en_bodega_satelite` siguen ilegales) + `tests/unit/utils/estados-bodega-satelite.test.ts` (sin cambios: el cierre del grafo sigue igual) | unit |
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
| R984 | `tests/unit/types/order-status.test.ts` (literal a mano) | unit |
| R985 | `guia-asignacion-retiro-satelite.test.ts` + `retiro-satelite-central.int.test.ts` (lote de dos zonas) | unit + integración |
| R986 | `retiro-satelite-central.int.test.ts` (`ZonaRepository.update` mueve la zona de la retirada y no la cuenta como retenida; la que sigue en el estante sí se cuenta) | integración |

E2E: `e2e/retiro-satelite-central.spec.ts` recorre R980 → R971 → R977 → R978 en pantalla
(`docs/checkpoints-proyecto.md`: toca asignación y recepción).

## Preguntas abiertas

Ninguna. Las nueve de la versión anterior quedaron cerradas en `## Decisiones cerradas (no reabrir)`.
