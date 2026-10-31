# SLT-63 — recoleccion-recibida-libera-mensajero · design.md

## Lo que ya existe

Busqué `recolec`, `reasignable`, `recepcion_bodega_central`, `libera… mensajero` y
`mensajero_asignado_id` en tres sitios: el board (`feature_list.json`, todos los estados), `specs/` y
el código. Para el código usé Grep/Read en el worktree, no el grafo MCP.

- **Board:** no hay otra ficha sobre esto. SLT-62 y SLT-64 nacen de la misma evidencia, pero tratan
  otros defectos (el % de efectividad y el ciclo de vida) y no tocan estos archivos.
- **Specs que tocan este comportamiento.** Ninguno lo resuelve. Algunos lo fijan en sentido
  contrario o dependen de él:
  - **138/R18** (`specs/138-recepcion-bodega-central`): «la recepción conserva `num_guia` y
    `mensajero_asignado_id`». Se escribió cuando a `en_ruta_bodega_central` solo se llegaba por la
    carga API, que no lleva mensajero. La 157 añadió después la recolección, que llega con el
    mensajero puesto, y R18 no se revisó. Esta ficha lo acota: sigue valiendo para la devolución
    (R3) y deja de valer para `en_ruta_bodega_central → en_bodega_central` (R1).
  - **157/R35**: la confirmación de la recolección conserva al mensajero. **No cambia**: mientras el
    paquete viaja, el mensajero lo lleva encima.
  - **157/R36**: una recolección no mueve dinero. **Se conserva** (R10).
  - **167/R25-R26**: «Recolectadas hoy» sale del historial y sigue mostrando la orden ya recibida
    en la central. **Se conserva** (R8, R9), y es lo que obliga a tocar
    `GestionOrdenRepository.findMisAsignacionesByIds` (§3.3).
  - **259/R10**: la rama de recolección de Monitoreo cuenta la orden el día en que se asignó la
    recolección. **Se acota** (R6, R7): la cuenta hasta que la central la recibe. El mecanismo de
    259 no cambia, porque el CTE `asignadas` ya excluye `mensajero_asignado_id IS NULL`.
- **Código que se reutiliza:**
  - `OrdenRepository.recibirEnBodegaCentral` y `RecepcionBodegaCentralService`, que son el punto de
    escritura.
  - El molde de limpieza de la asignación, que ya aplican `rutearBodegaSateliteLote`
    (`mensajeroAsignadoId: null, asignadoAt: null, fechaReparto: null`), `deshacerAsignacionLote`
    y la aprobación del cierre (`CierresAdminRepository`, «handoff limpio a la bodega»).
  - El arnés de Postgres real de `tests/integration/db/_postgres-real.ts`.

No se crea ningún modelo, tabla, endpoint ni pantalla.

## 1. Causa, medida

- `RecepcionBodegaCentralService` resuelve el caso `en_ruta_bodega_central → en_bodega_central` y
  llama a `OrdenRepository.recibirEnBodegaCentral`.
- Ese `updateMany` escribe solo `{ estatusId }`. El comentario «NO toca `mensajeroAsignadoId` (R18)»
  es literal, y el test unitario lo asegura
  (`orden-repository.recepcion-bodega-central.test.ts:66-67`).
- `asignarRecoleccionLote` fija el mensajero y `recolectarEnTienda` lo conserva (157/R35), así que el
  mensajero que recolectó sigue asignado cuando la orden ya está en la central.

| Lector | Predicado | Efecto |
|---|---|---|
| «Reasignables», `OrdenRepository.list` (~2007) | `mensajeroAsignadoId: null AND estatus = en_bodega_central` | No la muestra |
| Monitoreo, `TableroDiaRepository.contarPorMensajero` (y el detalle y el ritmo, que comparten `cteIdsDelDia`) | La rama (c) de recolección la mete en el universo, `asignadas` la atribuye a `mensajero_asignado_id`, y su estatus `en_bodega_central` cae en «otros» | +5 a Alfaro |

## 2. Quién más lee `mensajero_asignado_id` y qué le pasa con el arreglo

Revisé los lectores con dinero, cierre o comunicación detrás. Los recuentos son del grep en `lib/`.

| Lector | ¿Lo rompe liberar en la recepción? | Por qué |
|---|---|---|
| Pago al mensajero / cierre del día / wallet (`CierresAdminRepository`, `CierreDiaRepository`, `WalletMovimiento`) | No | Se pagan **gestiones** (`gestion_orden.mensajero_id`), no la asignación. Una recolección no crea gestión ni mueve dinero (157/R36). El cierre de Alfaro del 29 tiene 38 gestiones y ninguna de las 5. R10 lo asegura con un test. |
| Corte diario (`CorteDiarioRepository`) | No | Corta órdenes en reparto con mensajero; `en_bodega_central` no entra. |
| Traspaso (`TraspasoMensajeroService`) | No | Mira `recolectando` (recolección pendiente), no `en_bodega_central`. |
| «Recolectadas hoy» (`RecoleccionTiendaService.listarRecoleccion` → `findMisAsignacionesByIds`) | **Sí, si no se toca** | La lectura de datos exige `mensajeroAsignadoId = actor`. Si se libera en la recepción, la orden recibida desaparece de la lista y se rompe 167/R26. El test de servicio usa dobles y seguiría verde. Se arregla en §3.3. |
| Monitoreo (`TableroDiaRepository`, las tres consultas) | Es el efecto buscado | `asignadas` excluye `mensajero_asignado_id IS NULL`; R6. La recolección sin recibir sigue contando (R7). |
| Analítica operativa viva (`AnaliticaOperativaVivaRepository`, por `mensajero_asignado_id`) | Coherente | La orden deja de atribuirse al recolector, igual que en Monitoreo. |
| Chat de WhatsApp (`ChatConversacionRepository`, enruta al mensajero asignado) | Coherente | El cliente deja de escribirle al recolector, que ya no tiene el paquete. |
| Historial / quién recolectó | No | Queda en `orden_historial_estado` (`recoleccion_tienda`, actor = mensajero). La liberación no borra rastro. |
| Ranking (`asignado_at`) | No | La recolección nunca estampa `asignado_at` (157/R38), así que limpiarlo no cambia nada. |
| Webhooks / outbox (`registrar-cambio-estado.ts`) | No | El evento lo dispara el cambio de estado, que ya existía, y su carga no lleva el mensajero. |

### 2.3 La bodega satélite no tiene el defecto

- A `en_ruta_bodega_satelite` se llega por `ruteo_satelite`, y `rutearBodegaSateliteLote` ya limpia
  la asignación entera (`OrdenRepository.ts:3969`).
- La recolección siempre va a la central (arista #43, `recolectando → en_ruta_bodega_central`).
- `recibirEnSatelite` recibe, por tanto, órdenes sin mensajero. La evidencia lo confirma: 0 órdenes
  en `en_bodega_satelite` (§6).
- Queda un camino raro: revertir un incidente en tránsito hacia la satélite (#57). No está
  evidenciado y no entra.

## 3. Diseño

### 3.1 Mecanismo elegido: liberar en la misma escritura de la recepción

- `RecepcionBodegaCentralService.TRANSICIONES` gana un campo por caso:
  `liberaAsignacion: boolean`. Vale `true` para `en_ruta_bodega_central` y `false` para
  `devolviendo_a_bodega_central` (R3).
- El service lo pasa al repo.
- `IOrdenRepository.recibirEnBodegaCentral(ordenId, origenValue, destinoEstatusId, historial, opciones: { liberaAsignacion: boolean })`.
  El parámetro es obligatorio, sin valor por defecto: quien llama tiene que decidirlo.
- `OrdenRepository.recibirEnBodegaCentral` añade al `data` **del mismo `updateMany`**, solo si
  `liberaAsignacion`, `mensajeroAsignadoId: null, asignadoAt: null, fechaReparto: null`. El `where`
  no cambia (guarda por origen + no borrada), así que:
  - si no transiciona, no libera (R2);
  - libera dentro de la misma transacción que el cambio de estado y el historial (R1);
  - el historial sigue siendo una fila `recepcion_bodega_central` (R4); no hay familia nueva ni
    migración de enum.
- Los tres campos van juntos porque lo exige la guardia `fecha-reparto-acompana-asignado-at` y por
  la regla de la 246: una reserva sin mensajero es un dato huérfano. En una recolección `asignado_at`
  y `fecha_reparto` ya son NULL, así que en el caso evidenciado solo cambia el mensajero.
- Se actualiza el comentario del método y el de `RecepcionBodegaCentralService`, citando 138/R18 y
  esta ficha.

### 3.2 Lectores que NO se tocan

«Reasignables» (`OrdenRepository.list`) y `TableroDiaRepository` no cambian: con el dato corregido,
sus predicados actuales dan el resultado pedido (R5, R6, R7).

### 3.3 «Recolectadas hoy»: la guarda de propiedad

- `GestionOrdenRepository.findMisAsignacionesByIds(mensajeroId, ids)` cambia su `where` de
  `mensajeroAsignadoId: mensajeroId` a lo siguiente:

  ```
  OR: [
    { mensajeroAsignadoId: mensajeroId },
    { mensajeroAsignadoId: null,
      historialEstados: { some: { origenTipo: "recoleccion_tienda", actorUsuarioId: mensajeroId } } },
  ]
  ```

  `deletedAt: null` sigue igual. Al implementarlo hay que comprobar los nombres de la relación y de
  los campos en `db/schema.prisma`.
- **Por qué esa forma.** Reproduce lo que el mensajero ve hoy: la orden recibida sigue en su lista
  hasta que la central se la asigna a otro, y entonces se cae, como ahora (comentario de
  `RecoleccionTiendaService.ts:225-228`). Con la guarda nueva, la lista no muestra más órdenes que
  antes ni durante más tiempo (R8, R9).
- **Consumidores.** El único es `RecoleccionTiendaService` (grep). La interfaz
  `IGestionOrdenRepository` mantiene la firma; solo se actualiza su comentario.

### 3.4 Autorización, multi-empresa, país

- **Autorización.** No cambia: la recepción sigue siendo solo de `maestro`/`admin` (`esAccesoTotal`)
  y «Recolectadas hoy» solo del `mensajero`.
- **Multi-empresa.** No hay tablas ni SQL a mano nuevos. Las escrituras pasan por el cliente con la
  extensión de empresa y la RLS de `orden` y `orden_historial_estado`.
- **Módulo.** No hay módulo nuevo que encender.
- **País.** Ningún dato depende del país.

## 4. Alternativas descartadas

1. **Ajustar los predicados de los lectores y dejar el dato como está.** Consistiría en que
   «Reasignables» aceptara `en_bodega_central` con o sin mensajero y en que Monitoreo excluyera
   `en_bodega_central` del CTE `asignadas`. Se descarta por tres razones:
   - el dato sigue mintiendo, porque la orden figura asignada a quien ya no la tiene;
   - cada lector tendría que saberlo: Monitoreo en sus tres consultas, la Analítica operativa viva,
     el enrutado del chat, el filtro por mensajero del listado y cualquier lector futuro;
   - son más sitios tocados que el arreglo en origen, que es uno solo, y contradice «arreglar lo
     evidenciado, no rediseñar».
2. **Liberar en una segunda escritura, en el service, después de la recepción.** Si la segunda
   escritura falla, la orden queda en `en_bodega_central` con mensajero, que es justo el defecto.
   Además abre una carrera con una asignación concurrente desde la central, que el `where` del
   segundo `update` tendría que repetir. Se descarta por no ser atómica.
3. **Liberar al confirmar la recolección (`recolectando → en_ruta_bodega_central`).** El mensajero
   lleva el paquete encima en ese tramo: tiene que seguir siendo suyo para Monitoreo (R7), para el
   chat y para la guarda de propiedad de `recolectarEnTienda` (157/R34-R35). Se descarta.
4. **Quitar la guarda de propiedad de `findMisAsignacionesByIds`** con el argumento de que los ids
   ya salen del historial del actor. Se descarta: el comentario del método lo prohíbe con razón (un
   id de historial no autoriza a leer la orden), y la lista seguiría mostrando datos del cliente de
   una orden que ya reparte otro mensajero, cosa que hoy no pasa.

## 5. Órdenes que ya están en este estado (depende de Q1)

Solo si el humano elige Q1(a):

- `db/migrations/20261030120000_liberar_recolecciones_recibidas/migration.sql`:

  ```sql
  UPDATE "orden" o
  SET "mensajero_asignado_id" = NULL, "asignado_at" = NULL, "fecha_reparto" = NULL, "updated_at" = NOW()
  WHERE o."deleted_at" IS NULL
    AND o."mensajero_asignado_id" IS NOT NULL
    AND o."estatus_id" = (SELECT id FROM "order_status" WHERE value = 'en_bodega_central')
    AND EXISTS (
      -- la ÚLTIMA fila de historial es la recepción central desde en_ruta_bodega_central
      SELECT 1 FROM "orden_historial_estado" h
      JOIN "order_status" so ON so.id = h."estatus_origen_id"
      WHERE h."orden_id" = o.id
        AND h."origen_tipo" = 'recepcion_bodega_central'
        AND so.value = 'en_ruta_bodega_central'
        AND NOT EXISTS (SELECT 1 FROM "orden_historial_estado" h2
                        WHERE h2."orden_id" = o.id
                          AND (h2."created_at", h2."id") > (h."created_at", h."id")));
  ```

  - Al implementarlo hay que verificar los nombres reales de las columnas y si `order_status` es
    global o por empresa. La migración corre como dueño, sin RLS.
  - No escribe historial: el estado no cambia.
- **`down.sql`.** Repone `mensajero_asignado_id` desde el `actor_usuario_id` de la última
  `recoleccion_tienda` de cada orden que siga en `en_bodega_central` sin mensajero y cuya última
  fila sea esa recepción. No puede distinguir las que liberó la migración de las que liberó el
  código nuevo: es aceptable porque las dos tenían ese mensajero antes de la recepción.
- **Test:** `tests/integration/db/liberar-recolecciones-recibidas-migration.test.ts`. Comprueba que
  libera la recibida y no toca a sus hermanas: la que tiene una fila posterior a la recepción, la
  recibida por devolución, la borrada y la `en_bodega_central` sin recolección.

## 6. Pruebas: dónde vive cada criterio

Los criterios viven en SQL (`where`/`data` de Prisma y SQL crudo del tablero), y en este repo está
medido que los dobles no los ven (`docs/verification.md`). Por eso:

- **El test principal es de integración con Postgres real**
  (`tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`). Usa
  `_postgres-real.ts` y `enTransaccionRevertida`, y se salta (`skipped`, nunca `passed`) si no hay
  base.
  - **Siembra.** Una orden pasa por el camino real: `asignarRecoleccionLote` → `recolectarEnTienda`
    → `RecepcionBodegaCentralService.recibirEnBodegaCentral`.
  - **Hermanas en la misma corrida:**
    - una recolección del mismo mensajero que sigue en `en_ruta_bodega_central` (R7);
    - una recolección de otro mensajero (R9);
    - una devolución recibida (R3);
    - una `en_bodega_central` con mensajero sembrado a mano (R5, la hermana que no sale).
  - **Lecturas:** `OrdenRepository.list` con `reasignables`, `TableroDiaRepository.contarPorMensajero`
    con la ventana del día y `GestionOrdenRepository.findMisAsignacionesByIds`.
- **Mutaciones que deben poner rojo un test con nombre** (`tasks.md > T5`):
  - quitar la limpieza del `data` → R1, R5, R6 y R8 en rojo;
  - liberar también en el caso 139 → R3 en rojo;
  - quitar la rama `OR` nueva de `findMisAsignacionesByIds` → R8 en rojo;
  - quitar `mensajeroAsignadoId: null` de esa rama → R9 en rojo.
- El unitario existente del repo (`orden-repository.recepcion-bodega-central.test.ts`) se actualiza:
  el caso 138 espera el `data` con la asignación limpia y el 139, sin ella. Es un test de forma, no
  sustituye al de integración.

## 7. Riesgos

- **El número de Monitoreo cambia.** La tarjeta del recolector deja de contar una recolección en
  cuanto la central la recibe, aunque haya sido ese mismo día. Es lo que pide D1, pero el cliente lo
  notará: un mensajero que solo recolectó y cuyas órdenes ya se recibieron no aparece en el tablero
  de ese día.
- **Un día pasado consultado hoy** tampoco contará las recolecciones ya recibidas. Ya pasaba al
  reasignarlas, porque la atribución es por el mensajero actual (192/R60).
