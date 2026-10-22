# 419 — La bodega central cierra la devolución con su comprobante

> Ficha 419 (`feature_list.json`), zona `fullstack`, `sdd: true`.
> Problema medido en producción (2026-09-11): `devuelta_a_tienda` tiene **cero** transiciones en
> toda la historia; 247 órdenes paradas en `devolviendo_a_tienda`. El único camino hoy es el
> escáner de la tienda (`EscanerRecepcionOrigen` → `RecepcionOrigenService.recibirEnOrigen`,
> solo `adminTienda`), y ninguna tienda lo usa.
>
> Decisiones del humano (fijas):
> - D-H1 (2026-09-11): el paso lo puede dar la **bodega central**: sube un comprobante de que la
>   tienda recibió los paquetes, selecciona las órdenes y con **un botón** las pasa en lote.
> - D-H2 (2026-10-21): el comprobante es **obligatorio**.
> - D-H3 (2026-10-21): marcan **solo `admin` y `maestro`**; la `adminSatelite` **no**.
>
> Respuestas a las preguntas (a)–(d) de la ficha (el porqué, con evidencia, en `design.md`):
> - (a) Obligatorio (D-H2). Vive en el bucket privado `gestion-evidencias` ya existente (el de la
>   119), en una carpeta propia, enlazado a las órdenes por tablas nuevas → **sí lleva migración**.
> - (b) La arista #28 ya es legal para la guardia central (que decide solo por el par
>   origen→destino); se actualiza su metadato `rol` para declarar el segundo actor. No se añade
>   arista ni valor de enum.
> - (c) La vía del escáner de la tienda **se conserva** sin cambios (R16).
> - (d) El lote **no aborta** por una orden no elegible: reporte por orden (R6–R8).

Glosario: **lote** = una confirmación (un comprobante + N órdenes seleccionadas).
**Tienda del lote** = la tienda de origen a la que se entregaron los paquetes.
**Orden elegible** = en el instante de escribir: estado `devolviendo_a_tienda`, no borrada y
cuya tienda es la tienda del lote.

## Autorización

- **R1.** CUANDO un usuario con rol `maestro` o `admin` confirma un lote válido, el sistema DEBE
  ejecutarlo según R6–R15.
- **R2.** SI quien confirma un lote no tiene rol `maestro` ni `admin` (incluidos `adminSatelite`,
  `adminTienda` y `mensajero`), ENTONCES el sistema DEBE responder `forbidden` sin leer las
  órdenes, sin subir ningún archivo y sin escribir nada.

## Comprobante

- **R3.** SI un lote llega sin ningún archivo de comprobante, ENTONCES el sistema DEBE rechazarlo
  con error de validación sobre el campo del comprobante, sin subir nada ni cambiar ninguna orden.
- **R4.** SI algún archivo del comprobante está vacío, no es de un tipo admitido, supera el tamaño
  máximo por archivo, o el lote trae más archivos que el máximo admitido (los mismos tipos, tope
  por archivo y número máximo que la evidencia de gestión de la feature 119), ENTONCES el sistema
  DEBE rechazar el lote entero con un error de validación que nombre el motivo, sin subir ningún
  archivo ni cambiar ninguna orden.
- **R5.** SI el lote no trae ninguna orden, trae identificadores mal formados, supera el tope de
  órdenes por lote o no indica la tienda del lote, ENTONCES el sistema DEBE rechazarlo con error
  de validación sin subir nada ni cambiar ninguna orden.

## Transición por lote

- **R6.** CUANDO se confirma un lote válido, el sistema DEBE pasar a `devuelta_a_tienda`
  exactamente las órdenes seleccionadas que sean elegibles en el instante de escribir, y ninguna
  otra.
- **R7.** CUANDO se confirma un lote, el sistema DEBE devolver un desenlace por CADA orden pedida,
  uno de: `devuelta` (transicionó en este lote), `ya_devuelta` (ya estaba en `devuelta_a_tienda`),
  `estado_invalido` (con el estado actual de la orden), `tienda_distinta` (pertenece a otra tienda
  que la del lote) o `no_encontrada` (no existe o está borrada). Una orden no elegible NO DEBE
  impedir que transicionen las elegibles del mismo lote.
- **R8.** SI el estado de una orden seleccionada cambia entre la lectura y la escritura (otro lote
  concurrente o el escáner de la tienda), ENTONCES el sistema NO DEBE transicionarla dos veces y
  DEBE reportarla como `ya_devuelta` o `estado_invalido`; en `orden_historial_estado` DEBE quedar
  exactamente una fila `devolviendo_a_tienda → devuelta_a_tienda` para esa orden.
- **R9.** CUANDO una orden transiciona en un lote, el sistema DEBE registrar en la misma
  transacción exactamente una fila de historial de estado con origen `devolviendo_a_tienda`,
  destino `devuelta_a_tienda`, actor = el usuario que confirmó y familia `ajuste_estado`; y NO DEBE
  registrar ninguna fila para las órdenes que no transicionaron.
- **R10.** CUANDO una orden transiciona en un lote, el sistema DEBE dejarla enlazada, en la misma
  transacción, al comprobante de ese lote (con quién lo subió, la tienda del lote y el instante);
  las órdenes que no transicionaron NO DEBEN quedar enlazadas.
- **R11.** SI ninguna orden del lote transiciona, ENTONCES el sistema NO DEBE persistir el
  comprobante (ni sus filas ni sus archivos) y DEBE devolver el reporte por orden de R7.
- **R12.** SI falla la subida de algún archivo del comprobante, ENTONCES el sistema NO DEBE
  cambiar ninguna orden, DEBE retirar los archivos que sí se subieran y DEBE responder
  `comprobante_no_guardado`.
- **R13.** SI la escritura en base de datos falla después de subir los archivos, ENTONCES el
  sistema NO DEBE dejar ninguna orden transicionada ni ninguna fila de comprobante, y DEBE retirar
  los archivos subidos.

## Efectos colaterales

- **R14.** CUANDO una orden transiciona en un lote y su dueño tiene suscripción de webhook activa
  con rol `apiKey`, el sistema DEBE encolar, en la misma transacción, exactamente un job
  `webhook_estado` con destino `devuelta_a_tienda` para esa orden — igual que la vía del escáner —
  y ninguno para las órdenes que no transicionaron.
- **R15.** El sistema NO DEBE crear, modificar ni anular, al confirmar un lote, ningún movimiento
  de dinero: filas de `wallet_tienda_movimiento`, `wallet_movimiento`, `pago_mensajero_movimiento`,
  `rechazo_tienda_cobro` ni ningún apunte de flete.
- **R16.** MIENTRAS exista esta feature, la recepción por escáner del `adminTienda`
  (`recibirEnOrigenPorQr`) DEBE seguir transicionando `devolviendo_a_tienda → devuelta_a_tienda`
  sin pedir comprobante y con sus mismos desenlaces (`ok`, `ya_recibida`, `tienda_ajena`,
  `estado_invalido`, `no_encontrada`, `forbidden`).

## Pantalla (`/ordenes`)

- **R17.** MIENTRAS un `maestro` o `admin` tiene seleccionadas en `/ordenes` órdenes en
  `devolviendo_a_tienda`, el sistema DEBE ofrecer en la barra de acciones por lote la acción
  «Confirmar entrega a la tienda», aplicada solo a esas órdenes (con el conteo cuando la selección
  mezcla estados, como el resto de acciones por lote).
- **R18.** SI las órdenes a las que aplica la acción pertenecen a más de una tienda, ENTONCES el
  diálogo DEBE decirlo nombrando las tiendas y NO DEBE permitir confirmar.
- **R19.** MIENTRAS el diálogo no tenga al menos un archivo de comprobante válido, el botón de
  confirmar DEBE estar deshabilitado y el diálogo DEBE decir que el comprobante es obligatorio.
- **R20.** CUANDO termina la confirmación, el diálogo DEBE mostrar cuántas órdenes pasaron a
  `devuelta_a_tienda` y, por cada orden que no pasó, su número de guía y el motivo en lenguaje
  claro; y el listado DEBE refrescarse.
- **R21.** El sistema NO DEBE ofrecer la acción de R17 a `adminSatelite`, `adminTienda` ni
  `mensajero`.

## Consulta del comprobante

- **R22.** CUANDO un `maestro` o `admin` abre el historial de una orden enlazada a un comprobante
  de entrega, el sistema DEBE ofrecer verlo mediante un enlace temporal firmado; SI lo pide
  cualquier otro rol, ENTONCES DEBE responder sin revelar si el comprobante existe.
- **R23.** El sistema NO DEBE devolver al cliente la ruta interna del archivo en el almacenamiento,
  y esa ruta NO DEBE contener identificadores de tienda, orden ni usuario.

## Catálogo de transiciones

- **R24.** El catálogo de transiciones DEBE declarar en la arista `devolviendo_a_tienda →
  devuelta_a_tienda` (#28) ambos actores (`adminTienda` por escáner y `maestro/admin` central con
  comprobante) sin cambiar el conjunto de pares legales: el inventario de la feature 140 conserva
  sus cifras de aristas y pares.

## Preguntas abiertas

1. **¿Se admite PDF como comprobante?** Con «como en la 119» el spec admite solo imagen
   JPEG/PNG/WebP (5 MB, hasta 3 archivos). Si el comprobante habitual es un acta escaneada en PDF,
   habría que admitirlo (la caja de la 459 ya lo admite, 4 MB) — cambia R4 y una constante.
2. **¿La tienda ve el comprobante?** R22 lo deja solo para `maestro`/`admin`. Si la tienda debe
   poder verlo (prueba ante una disputa), es un R más y otro punto de entrada.
3. **Un lote = una tienda (R18).** El spec asume que un comprobante prueba la entrega a UNA
   tienda. Confirmar que no se quiere un comprobante único para un recorrido por varias tiendas.
4. **Tope de órdenes por lote (R5).** Propuesto 300 (cubre las 247 paradas hoy en un solo
   lote). Confirmar o dar otro número.
5. **«Historial de acciones» (362).** El spec NO añade un tipo al registro de acciones: la
   transición ya queda con actor e instante en `orden_historial_estado` y no mueve dinero, no
   borra ni cambia permisos (el criterio de la 362). Confirmar que no se quiere verla también en
   «Acciones».
