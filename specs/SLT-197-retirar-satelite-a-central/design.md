# SLT-197 «Retirar paquetes de una bodega satélite a la central» — design

> Requisitos R970–R986 (`requirements.md`). Aprobado por Carlos el 2026-11-17 con las decisiones
> D1–D9 de `requirements.md` (D8: sin trabajo de API). Sin migración, sin tabla nueva, sin dependencia nueva.
> Todo se leyó con Grep/Read en este worktree: el grafo (`codebase-memory-mcp`) no tiene indexado el
> proyecto `R-job-singularis-projects-servi_logistic-.worktrees-SLT-197-retirar-satelite-a-central`.

## Lo que ya existe

Buscado en `feature_list.json` («retir… satélite», «satélite … central / deja de operar / devolver»,
«traslad», «zona sin cobertura»), en `specs/` (`en_bodega_satelite` junto a `en_ruta_bodega_central` /
`en_bodega_central`, «deja de operar», «otra bodega») y en el código (`en_ruta_bodega_central`,
`devolviendo_a_bodega_central`, `rutearABodegaSatelite`, `recibirEnBodegaCentral`).

- **Ninguna ficha ni spec hace esto.** La única coincidencia es la propia SLT-197. La más cercana es la
  **377** «bodega satélite sin dueño» (`specs/377-bodega-satelite-sin-dueno/design.md:92-118`), que
  describió esta misma arista como alternativa (b) y la dejó para «la ficha siguiente» si el paquete
  tenía que moverse de verdad. Esta es esa ficha, en su versión mínima: sin traspaso entre satélites y
  sin autorización por custodia (la decide la central).
- **Se reutiliza:**
  - `en_ruta_bodega_central` y `en_bodega_central`, que ya existen (catálogo, rastreo, webhook, informe
    de tránsito). No hace falta estado nuevo.
  - La recepción en la central, `RecepcionBodegaCentralService` (138/139) con su escáner
    `EscanerRecepcionBodegaCentral`: ya resuelve `en_ruta_bodega_central -> en_bodega_central` (#37,
    `recepcion_bodega_central`, con `liberaAsignacion: true`) **por el estado de origen, sin mirar de
    dónde vino**. No se toca.
  - «Rutear a bodega satélite» (`GuiaAsignacionService.rutearABodegaSatelite`): admite exactamente
    `en_bodega_central` con zona no central, que es como queda la orden retirada. No se toca.
  - El patrón de lote todo-o-nada con la guarda de estado en el `UPDATE`
    (`desasignarRecoleccionLote`, `rutearBodegaSateliteLote`) y el choke point del historial
    `appendCambioEstado` (que además encola el webhook).
  - La acción por lote de `/ordenes` (`accionesDe` en `OrdenesListado.tsx`) y el molde de
    `RutearSateliteModal` (confirmación + fase «resultado» con `ManifiestoResultado`).
  - El manifiesto (`ManifiestoService`), que ya tiene un flujo con el mismo movimiento físico
    (`devolucion_central`: zona → central).
- **Lo que se parece y NO sirve:** el retorno de devoluciones de la 139
  (`por_devolver_a_bodega_central -> devolviendo_a_bodega_central -> por_devolver_a_tienda`,
  `EnvioDevolucionCentralService`). Termina en la tienda, no en el estante de la central, y su origen
  es una orden rechazada, no una orden por entregar.

## 1. Estados y transición

```
en_bodega_satelite --(#73, ajuste_estado, maestro/admin)--> en_ruta_bodega_central
en_ruta_bodega_central --(#37 existente, recepcion_bodega_central, maestro/admin)--> en_bodega_central
en_bodega_central --(#7 existente, ruteo_satelite, maestro/admin)--> en_ruta_bodega_satelite
```

- Una sola arista nueva, **#73** (la última del inventario es #72), en
  `TRANSICIONES.en_bodega_satelite`:
  `{ to: "en_ruta_bodega_central", via: "ajuste_estado", rol: "maestro/admin" }`. Se declara **en el
  mismo commit que su productor** (`OrdenRepository.retirarSateliteLote`), regla de la 154.
- El inventario `tests/fixtures/inventario-transiciones-140.ts` suma la fila #73 y
  `RECUENTO_INVENTARIO` pasa de 59 → 60 aristas y 54 → 55 pares (el par es nuevo).
- **El alcance de la satélite no cambia.** `alcanceDerivadoDelGrafo()` poda `en_ruta_bodega_central`
  como nodo (`ESTADOS_FUERA_DEL_LISTADO_SATELITE`), así que el cierre del grafo desde la custodia
  satélite sigue dando los mismos 16 estados y `ESTADOS_BODEGA_SATELITE` no se toca. Es la misma
  conclusión que la 377 dejó escrita (`design.md:100-102`).
- **Nada más se vuelve alcanzable.** Las salidas de `en_ruta_bodega_central` ya existen: #37 (recibir),
  #30 (cancelación por API de la tienda) y #50 (incidente en tránsito, con su inversa #56).

## 2. La zona de la orden (decisión central del diseño)

`orden.zona_id` hace dos trabajos (377/design §1): la zona geográfica de la dirección (tarifa) y qué
bodega tiene el paquete (permiso). La pregunta del encargo es cómo distinguir «está en la central pero
su zona es Cartago».

**Respuesta: el estado ya lo distingue, y la zona no se toca.** «`en_bodega_central` con zona
satélite» no es un caso nuevo: es exactamente como queda toda orden de zona satélite al generar su
guía (#5), antes de rutearla. El sistema ya lo trata bien:

- «Rutear a bodega satélite» la admite (origen `en_bodega_central`, zona ≠ central) y la manda a la
  bodega de su zona (R978).
- «Asignar mensajero» de la central la rechaza (`orden de zona no-GAM`), que es lo correcto: nadie de la
  central reparte en Cartago (R978).
- El listado de la satélite no la ve: su estado está fuera de `ESTADOS_BODEGA_SATELITE` (R979).
- La reconciliación de zonas (366/377) deja de retenerla: ya no está en `ESTADOS_PAQUETE_EN_ESTANTE`,
  así que si Carlos pasa los distritos de Cartago a otra zona, la orden se mueve con ellos (R986). Es
  justo lo que la 377 no podía hacer con el paquete en el estante.

Conservar la zona también conserva la tarifa: el cobro de la entrega, cuando ocurra, sale de la zona de
la dirección, como siempre.

## 3. Familia del historial: `ajuste_estado` (sin migración)

El retiro escribe `origen_tipo = ajuste_estado`.

**Por qué basta.**

- El par `en_bodega_satelite -> en_ruta_bodega_central` es **nuevo y único**: no hay otra arista con ese
  par ni otro productor. La fila del historial dice qué pasó sin ambigüedad, y `actor_usuario_id` dice
  quién. El argumento de la 235 («el sentido habría que deducirlo del par de estatus») aplica cuando el
  par se comparte; aquí no.
- `ajuste_estado` es la familia de los traslados manuales entre bodegas decididos por una persona:
  #40 (satélite envía una devolución a la central, `EnvioDevolucionCentralService`), #42 (central envía
  a la tienda), #28 (entrega a la tienda). Tiene cuatro productores vivos
  (`DevolucionOrigenService`, `EnvioDevolucionCentralService`, `RecepcionOrigenService`,
  `DevolucionTiendaRepository`), así que el reparo de la 398 («familia sin dueño») ya no se sostiene.
- No mueve dinero, no es visita real y no cuenta intentos: `ajuste_estado` no está en
  `ORIGEN_TIPOS_VISITA_REAL` ni en `ORIGEN_TIPOS_CON_GESTION`, que es lo que queremos.
- Precedente escrito: `orden-historial-cobertura.test.ts:631` («el enum NO gana `devolucion_origen`; el
  retorno reutiliza `ajuste_estado`», feature 48).

**Alternativa descartada — A1: familia propia `retiro_satelite`.** Es lo que la 377 suponía. Cuesta una
migración de enum (`ALTER TYPE … ADD VALUE` arriba y, abajo, recrear el tipo con la lista completa,
porque Postgres no tiene `DROP VALUE`) y, sobre todo, tocar los ~15 tests de migración que fijan la lista
de valores «posteriores» del enum (`tests/integration/db/*-migration.test.ts`, p. ej.
`rechazo-tienda-migration.test.ts:142`), más `ORDEN_HISTORIAL_ORIGEN_TIPO_SEED` y su test. Son unos 20
archivos para una información que el par de estados ya da: la feature no cabría en un PR (§9). Si Carlos
la quiere igual (por ejemplo, para un informe por familia), se hace como ficha propia sin tocar el
comportamiento de esta.

## 4. Backend: capas y contratos

### 4.1 Repositorio — `OrdenRepository.retirarSateliteLote` (nuevo)

```ts
retirarSateliteLote(
  ordenIds: string[],
  destinoEstatusId: string,          // id de en_ruta_bodega_central
  historial: HistorialContexto,      // { actorUsuarioId, origenTipo: "ajuste_estado" }
): Promise<"ok" | "conflicto">
```

En **una** transacción (la extensión de empresa ya fija `organizacion_id` y el rol `servi_app`, con RLS):

1. Lee `id, estatus_id` con `where: { id: { in: ordenIds }, deletedAt: null, estatus: { value:
   "en_bodega_satelite" } }`.
2. `updateMany` con **el mismo `where`** y `data: { estatusId: destino, mensajeroAsignadoId: null,
   asignadoAt: null, fechaReparto: null }` (R972, mismo trío que `rutearBodegaSateliteLote`). No toca
   `zonaId`, `tiendaId`, `numGuia`, `numRemision` ni `montoCobrar`.
3. Si la lectura o el `count` no son exactamente `ordenIds.length`, lanza un error interno que revierte
   la transacción; el método lo captura fuera y devuelve `"conflicto"` (R974). Ninguna fila cambia y
   ningún historial se escribe.
4. Con el `count` completo, `appendCambioEstado(tx, …)` con una entrada por orden (origen leído en el
   paso 1). Ese choke point valida la arista #73 contra `TRANSICIONES` (fallo cerrado).

La guarda de estado vive en el `WHERE`, no en JS: se prueba contra Postgres real
(`retiro-satelite-central.int.test.ts`), con una mutación de control que quite la condición de estado y
ponga el test en rojo.

Se añade a `IOrdenRepository` y al mapa cerrado de puntos de escritura de
`tests/unit/repositories/orden-historial-cobertura.test.ts` (34 → 35, familia `ajuste_estado`).

### 4.2 Servicio — `GuiaAsignacionService.retirarABodegaCentral` (método nuevo)

Vive junto a `rutearABodegaSatelite`, que es su inverso, y usa los mismos repos inyectados (sin cambio
en `buildGuiaService` ni en ningún composition root).

```ts
retirarABodegaCentral(input: { ordenIds: string[] }, actor: Actor): Promise<RetirarSateliteServiceResult>
```

1. `esAccesoTotal(actor.rol)` o `{ status: "forbidden" }` (R975), antes de leer nada.
2. `distinct(ordenIds)`; lote vacío → `ok` con `resultados: []` (defensa; la action ya exige `min(1)`).
3. `findByIdsForTransicion(ordenIds)` y, por orden: `orden no existe`, `orden borrada`, `estado de origen
   no permitido: <value>` si no es `en_bodega_satelite` (R973). Con algún motivo → `{ status:
   "conflict", detalle }` sin escribir. **No se filtra por zona** (R985).
4. `findEstatusIdByValue("en_ruta_bodega_central")`; si falta → `validation_error` (catálogo).
5. `retirarSateliteLote(...)`; `"conflicto"` → `{ status: "conflict", detalle: [{ ordenId, motivo:
   "la orden cambió de estado; recarga" }] }` para todo el lote (R974).
6. `ok` con `resultados: [{ ordenId, estado: "en_ruta_bodega_central" }]`.

### 4.3 Action — `retirarABodegaCentral` en `lib/actions/ordenes-guia.ts`

Calco de `rutearABodegaSatelite` (`ordenes-guia.ts:253`): actor de sesión o `UnauthenticatedError`
(R976), `retirarSateliteSchema.parse` (zod, `ordenIds: z.array(z.string().min(1)).min(1)`), servicio,
`toGuiaActionError`.

### 4.4 Tipos — `lib/types/orden-guia.ts`

```ts
export const retirarSateliteSchema = z.object({ ordenIds: z.array(z.string().min(1)).min(1) });
export interface RetirarSateliteResultadoItem { ordenId: string; estado: string } // "en_ruta_bodega_central"
export type RetirarSateliteResult =
  | { status: "ok"; resultados: RetirarSateliteResultadoItem[] }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "conflict"; detalle: DetalleConflicto[] };
```

`RetirarSateliteServiceResult` es el mismo sin `unauthenticated` (patrón de `RutearSateliteServiceResult`
en `IGuiaAsignacionService`).

### 4.5 Recepción en la central

Sin cambios de código. `RecepcionBodegaCentralService` ya hace `en_ruta_bodega_central ->
en_bodega_central` con `recepcion_bodega_central` y libera la asignación (que ya viene vacía). R977 se
prueba sobre una orden retirada para dejar fijado que el caso nuevo pasa por el mismo camino.

## 5. Autorización

- **Quién:** maestro y admin (`esAccesoTotal`), en el servicio, antes de leer órdenes (R975). Igual que
  «Rutear a bodega satélite». El `adminSatelite` no puede (D3); si algún día se pide, la rama es la de
  `EnvioDevolucionCentralService:58-60` (rol + `findUsuarioZonaId === orden.zonaId`).
- **Empresa:** la de la sesión, por la extensión de empresa y la RLS de `orden` y
  `orden_historial_estado`. No hay SQL a mano nuevo.
- **Módulo:** ninguno. La recepción satélite y el ruteo son núcleo (`lib/modulos/reparto.ts`).
- **UI:** la acción cuelga de `accionesDe`, que ya devuelve `[]` si `accionesLote` es falso (solo
  maestro/admin lo tienen). La satélite no ve `/ordenes` con acciones.

## 6. Pantalla (sin pantalla nueva: no necesita /design)

- **`/ordenes`, `accionesDe`:** nuevo `case "en_bodega_satelite"` con una acción
  `{ key: "retirar-central", label: "Retirar a bodega central", onRun: abrirRetirarCentral }` (R980).
  Hoy ese estado cae en el `default` y no ofrece ninguna. Es la única acción del estado, así que va
  primaria. La selección mixta la resuelve `accionesPara` como con las demás acciones; `abrirRetirarCentral`
  pasa al modal solo las seleccionadas en `en_bodega_satelite` (el servicio revalida).
- **`RetirarACentralModal.tsx`** (nuevo, en `app/(app)/ordenes/_components/`): calco de
  `RutearSateliteModal` — `Modal` de confirmación con el número de órdenes, una sola llamada a
  `retirarABodegaCentral`, toast «N orden(es) en ruta a bodega central.», fase «resultado» con
  `ManifiestoResultado` (`flujo="retiro_satelite"`, selección por ids) y `onSuccess` al cerrar; un
  resultado no-`ok` se lanza al canal de error del `Modal` y el texto sale de `guiaDecisionErrorMessage`
  (R981). No se generaliza `RutearSateliteModal`: son dos acciones distintas con textos y action
  distintos, y la regla «sin sobre-ingeniería» no pide fundirlos.
- **Recibir:** el escáner único de la central (`EscanerRecepcionBodegaCentral`), sin cambios.
- **Buscar/filtrar:** `BuscadorFiltros` de `/ordenes` con los filtros de estado y zona que ya existen.
- **Texto del (i):** `DESCRIPCION_ESTADO.en_ruta_bodega_central` en `lib/types/order-status.ts` pasa a «El
  paquete va camino a la bodega central.» (R984, D7). Es el mismo texto del rastreo público, y el
  literal viejo está copiado en `docs/ayuda/publico/rastreo-de-paquete.md`: se cambian los dos a la
  vez. La copia de `docs/api/guia-integracion/guia-integracion.html` **no se toca** (D8: sin trabajo de
  API); queda con el texto viejo.
- **Ayuda:** `docs/ayuda/oficina/ordenes.md` (la acción y cuándo usarla) y
  `docs/ayuda/satelite/en-bodega.md` (la central puede retirar órdenes del estante; desaparecen del
  listado).

## 7. Manifiesto — flujo `retiro_satelite`

Se añade `"retiro_satelite"` a `MANIFIESTO_FLUJOS` (`lib/types/manifiesto.ts`) y su `case` en
`ManifiestoService`: `{ origen: zona, destino: ctx.central, responsable: ctx.actor }` (R982). Es el
mismo mapeo que `devolucion_central`, pero el flujo es la etiqueta de la operación y sale en el papel
(`ManifiestoService.ts:106-107`: «debe decir la verdad sobre la operación»): llamar «devolución» a un
retiro sería mentir en lo que alguien firma. La orden ya no tiene mensajero, así que el responsable es
el usuario que retiró.

## 8. Dinero, cierres e integraciones

- **Dinero (R983):** el retiro no escribe en `wallet_*`, `cierre_*`, `cierre_bodega*`, cobros a la
  tienda ni pagos. Una orden en el estante no tiene gestión vigente ni cierre abierto: las que llegaron
  al estante por liberación (#18, #20/#24, #26) lo hicieron con su cierre ya aprobado. El cierre de
  bodega de la satélite consolida efectivo de cierres de mensajeros, no paquetes. La tarifa no cambia
  porque la zona no cambia. Cobrar el traslado quedó descartado (D2).
- **API e integradores (D8: sin trabajo de API):** el mecanismo genérico (`appendCambioEstado` con la
  política de `webhook-eventos.ts`) ya encola un evento de estado al pasar a `en_ruta_bodega_central` y a
  `en_bodega_central`; se deja como está, sin requisito, test ni documentación propios.
- **Cancelación por API:** la tienda ya puede cancelar desde `en_ruta_bodega_central` y
  `en_bodega_central` (#30/#29). Sigue igual.
- **Rastreo público e informe de tránsito por WhatsApp:** leen el estado, que ya existe; solo cambia el
  texto del (i) (R984).
- **Datos de país:** ninguno (sin moneda, geografía nueva, impuestos ni métodos de pago).

## 9. Modelo de datos y migraciones

- **Sin migración.** Ni estado nuevo (se reutilizan dos), ni valor de enum (§3), ni tabla, ni columna.
- Tablas tocadas en escritura: `orden` (`estatus_id`, `mensajero_asignado_id`, `asignado_at`,
  `fecha_reparto`) y `orden_historial_estado` (append), más el outbox de webhook que ya escribe
  `appendCambioEstado`. Todas con `organizacion_id` y RLS desde SL-17.

## 10. Alternativas descartadas

- **A1 — Familia de historial propia** (`retiro_satelite` en el enum): ver §3. Unos 20 archivos más
  para información que el par de estados ya da.
- **A2 — Estado nuevo** (p. ej. «retirando de satélite»): `en_ruta_bodega_central` ya describe el
  paquete en camino a la central y ya tiene recepción, incidente, cancelación por API, rastreo y webhook.
  Un estado nuevo exigiría migración de catálogo, entradas en rastreo, webhook, tablero e informe de
  tránsito, y una segunda rama en la recepción central.
- **A3 — Saltar el tránsito** (`en_bodega_satelite -> en_bodega_central` en un paso): ahorra el
  escaneo pero la central daría por recibido un paquete que nadie vio llegar (D4). Además, mientras
  viaja, el listado de la central lo mostraría como disponible.
- **A4 — Cambiar la zona de la orden a la central al retirar:** perdería la zona de la dirección (y con
  ella la tarifa) y la orden ya no podría volver a rutearse a la satélite de su zona sin corregir datos
  del cliente. La zona es geográfica; quién tiene el paquete lo dice el estado (§2).
- **A5 — Reutilizar el retorno de la 139** (`por_devolver_a_bodega_central` …): termina en
  `por_devolver_a_tienda` y la orden ya no sería repartible.

## 11. Riesgos

- **Carrera con la satélite:** si la satélite asigna una orden mientras la central la retira, gana la
  primera escritura; la otra recibe conflicto sin efectos (R974; la asignación satélite ya guarda por
  estado). Se prueba en integración.
- **El texto del (i) lo ve el destinatario** (rastreo público). Por eso es neutro (D7).

## 12. Tamaño

| | Archivos | Líneas (estimación) |
|---|---|---|
| Producción y docs (`lib/`, `app/`, `docs/ayuda/`) | 15 | ~350 (repo ~70, servicio ~60, modal ~110, listado ~25, tipos/action ~40, manifiesto ~10, transiciones/texto ~15, ayuda ~20) |
| Tests (`tests/`, `e2e/`) | 11 | ~900 |
| **Total que cuenta** | **26 de 40 (65 %)** | ~350/1000 prod · ~900/3000 tests |

`specs/` y `progress/` no cuentan (`docs/gate.md > Tamaño del PR`). Por debajo del aviso del 80 %.
