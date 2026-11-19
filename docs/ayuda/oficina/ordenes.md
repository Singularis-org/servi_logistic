---
titulo: Órdenes
modulo: ordenes
pantalla: /ordenes
roles: [maestro, admin]
actualizado: 2026-11-19
fuentes:
  - app/(app)/ordenes/page.tsx
  - app/(app)/ordenes/_components/OrdenesListado.tsx
  - app/(app)/ordenes/_components/RetirarACentralModal.tsx
  - app/(app)/ordenes/_components/NotaGestionPendiente.tsx
  - app/(app)/ordenes/_components/HistorialOrdenTimeline.tsx
  - components/shared/EstadoInfo.tsx
  - lib/types/order-status.ts
  - app/(app)/ordenes/_components/ordenes-filtros-def.ts
  - app/(app)/ordenes/exclude-por-rol.ts
  - lib/services/alcance-borrado-orden.ts
---

# Órdenes

**Todas las órdenes del sistema**, de todas las tiendas y todas las zonas. Es la pantalla de despacho:
desde acá se asigna, se rutea y se resuelve lo que se traba.

La tienda ve esta misma pantalla acotada a lo suyo. Vos la ves entera.

## El estado de cada orden, y su botón de información

Junto al estado de cada orden hay un botón **(i)** que explica qué significa. Se abre al pasar el
puntero o al tocarlo —en el teléfono, al tocar—, y se cierra al tocar fuera o con Escape. El texto es
el mismo para todos los roles y para el rastreo del cliente. También lo llevan las opciones del filtro
de estado.

**Dos notas que pueden ir al lado de «En reparto».** No son estados: la orden sigue En reparto.

- **«Entregado · pendiente de confirmación»** (o el resultado que sea): el mensajero ya registró la
  gestión y falta que se apruebe su cierre del día. **El estado real se aplica al aprobar el cierre.**
  Mientras tanto, esa orden **no se puede traspasar ni cambiarle el día**: la fila lo avisa con un «!».
- **La nota de ayuda**: el mensajero pidió ayuda a la tienda con esa entrega. La orden sigue en reparto
  hasta que la tienda responda, el mensajero la recupere o se registre su gestión. Sí se puede traspasar.

En la **línea de tiempo** de la orden quedan además los pasos de la gestión: **Gestión registrada**,
**Gestión anulada**, **Gestión corregida**, la solicitud de ayuda y su cierre.

## Buscar y filtrar

El buscador cubre **cinco datos a la vez**: guía, remisión, teléfono, destinatario o producto.

Con **Filtros** agregás lo que necesités. Los más útiles para despachar:

- **Reasignables** — las que están en bodega central esperando mensajero. Es la cola de despacho.
- **Salida a reparto** — separa las que ya salieron alguna vez con alguien de las que solo tienen la
  guía generada. Sirve para distinguir «nunca salió» de «volvió».
- **Mensajero**, encadenado a la zona: elegida una zona, solo ofrece sus mensajeros.
- **Estado**, **zona**, **provincia**, **cantón**, **distrito**, **tienda**, **fecha de creación**.

Los filtros se combinan y se quedan puestos mientras trabajás. **Limpiar todo** los quita junto con la
búsqueda.

## Acciones por lote

Seleccionando varias órdenes se pueden **asignar a un mensajero** o **rutear a una bodega satélite** de
una vez. Al asignar se elige el día de reparto — hoy o mañana.

> **Si elegís mañana, el mensajero no va a poder recogerla ni gestionarla hasta ese día.** La va a ver
> marcada en su lista, pero el sistema no lo deja adelantarse. Es a propósito: se puso después de que
> un paquete reservado se entregara antes de tiempo.

### Retirar a bodega central

Cuando una bodega satélite deja de operar y en su zona no hay quien entregue, seleccioná las órdenes
que siguen en su estante (filtrá por estado **En bodega satélite** y por la zona) y usá **Retirar a
bodega central**. Pasan a **En ruta a bodega central**, sin mensajero, y podés descargar el manifiesto
del lote para que viaje con la carga. El traslado no cobra ni paga nada.

Cuando llegan, recibilas con el **escáner de recepción** de la central: quedan **En bodega central**
y, al recibirlas, toman la zona de su distrito. Si mientras estaban en el estante de la satélite su
distrito se pasó a otra zona, llegan ya con la nueva; si no, conservan la de la satélite. Una orden que
ya tiene un cierre o una gestión que decidió el cobro (entregada, rechazada o con incidente) conserva
su zona. Cuando la zona vuelva a tener cobertura, salen otra vez con **Rutear a bodega satélite**. Si
las querés repartir desde la central, primero pasá su distrito a la zona central en la configuración
de zonas.

Si alguna orden del lote ya no está en el estante (por ejemplo, la satélite la acaba de asignar), no se
retira ninguna: el diálogo te dice cuál y podés actualizar la lista y volver a intentarlo.

## Actualizar zonas

Junto a **Recibir paquete** está el botón **Actualizar zonas**. No depende de las órdenes que tengas
seleccionadas: busca en toda tu empresa las órdenes cuya zona no es la de su distrito y, antes de
cambiar nada, te muestra cuántas se actualizarían (agrupadas por zona actual y zona nueva) y cuáles se
saltan y por qué. Al confirmar, les pone la zona de su distrito y te dice cuántas se actualizaron.

Se saltan, con su guía y el motivo:

- las que están **en el estante de una bodega satélite**: esa bodega tiene el paquete y es la que lo
  tiene que despachar o retirar a la central;
- las que están **en devolución**, camino de la central o de vuelta a la tienda: cambiarles la zona
  no las desbloquea y puede dejarlas sin quien las envíe;
- las que **ya tienen un cierre o una gestión que decidió el cobro** (entregada, rechazada o con
  incidente): su cobro ya está decidido y no se recalcula.

Una orden saltada no impide que se actualicen las demás. Cada orden actualizada deja una fila en el
**histórico de acciones** con quien confirmó. Lo que se actualiza es solo la zona: el cobro de lo ya
cerrado no cambia, y el próximo cierre de esa orden usa la tarifa de la zona nueva.

## Acciones por orden

**Ver el historial completo**, **reportar un incidente**, **corregir los datos del cliente**, **generar
la guía y la etiqueta**, **cambiar el día de reparto**, **devolver a tienda** y **deshacer una
asignación**.

## Eliminar y recuperar

**Eliminar** retira la orden de los listados de la tienda dueña y del mensajero asignado.

**Ver las eliminadas y recuperarlas es solo del maestro.** El interruptor «Eliminadas» no acota el
listado: lo **sustituye** — pasás a ver exclusivamente las borradas. Por eso está al final de la lista
de filtros, lejos de un clic distraído.

## Lo que esta pantalla NO hace

- **No se aprueban cierres.** Eso es **Cierres**.
- **No se ve el estado del día por mensajero.** Eso es **Monitoreo**.
