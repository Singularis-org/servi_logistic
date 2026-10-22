# 484 — Puntero `orden_en_gestion` colgado · design

> Arreglo mínimo. Sin migración, sin columnas nuevas, sin cambios de interfaz de usuario. Todos los
> símbolos citados se confirmaron en el árbol de `origin/dev` @ `ade121a2` (búsqueda con el MCP
> `codebase-memory`, proyecto `R-job-singularis-projects-ordenex`, y lectura del archivo real).

## 1. El modelo que ya existe

- `usuario.orden_en_gestion_id` (`db/schema.prisma`, `Usuario.ordenEnGestionId`), FK a `orden` con
  `onDelete: SetNull` e índice `@@index([ordenEnGestionId])`. El índice hace barata la limpieza
  «todo puntero que apunte a estas órdenes».
- Escritores de hoy (`lib/repositories/GestionOrdenRepository.ts`):
  - `setOrdenEnGestion` (l.613): `updateMany` con `OR [puntero NULL, puntero = ordenId]`.
  - `liberarOrdenEnGestion` (l.634): `updateMany` con `id = mensajero AND puntero = ordenId`.
  - `registrarGestionPendiente` (l.787): `usuario.update` a NULL, dentro de su transacción.
- Lectores: `getOrdenEnGestion` (l.599), usado por `MisAsignacionesService.listarMisAsignaciones`
  (l.263), por la guarda R21 de `gestionar` (l.655) y por la relectura de `setOrdenEnGestion`.
- La pantalla (`app/(app)/mis-asignaciones/_components/RepartoModule.tsx`) entra en modo foco cuando
  `ordenEnGestionId !== null` (l.424-426) y, si la orden no está en la lista, cae a
  `porGestionarFiltrado[0]` (l.405-408). No se toca: el arreglo hace que el servidor no le mande un
  puntero colgado.

## 2. Inventario de caminos que sacan una orden `en_reparto` de la mano del mensajero

Se listaron los llamadores de `appendCambioEstado` (`trace_path`, 28) y los escritores de
`orden.mensajero_asignado_id`, y se leyó en cada uno el estado de origen. Un puntero sólo puede
nacer apuntando a una orden `en_reparto` del propio mensajero (`escogerParaGestion` →
`cargarOrdenGestionable`), así que la pregunta es: ¿qué caminos hacen que esa orden deje de estar
en su lista «por gestionar»/«con ayuda» sin pasar por `registrarGestionPendiente` ni por
`liberarOrdenEnGestion`?

| # | Camino (archivo · método) | Qué hace a una orden del mensajero | ¿Entra? | Por qué |
|---|---|---|---|---|
| 1 | `CierreDiaRepository.crearCierre` (bloque `corteSinGestionar`, l.1026-1134) | `en_reparto → sin_gestionar` (`corte_sin_gestionar`) | **SÍ (R1/R2)** | Origen del incidente. Es la única transición automática que saca una orden `en_reparto` sin gestión. |
| 2 | `CierresAdminRepository.resolverCierre`, rama `aBodega` (l.2102-2140) | `sin_gestionar → en_bodega_*`, mensajero NULL (`liberacion_sin_gestionar`) | **SÍ (R3)** | Segundo paso del incidente. Con #1 arreglado ya no le llegarán punteros, pero cubre los que quedaron de antes del despliegue y lo pidió el humano expresamente. |
| 3 | `CierresAdminRepository.resolverCierre`, rama `enElTope` (l.2038-2100) | `sin_gestionar → rechazada` (`rechazo_tope_intentos`) | **SÍ (R4)** | Mismo bloque y mismos ids que #2; dejarla fuera sería una asimetría sin motivo (la orden tampoco vuelve a la lista). Coste: la misma sentencia. |
| 4 | `OrdenRepository.traspasarMensajeroLote` (l.4829) | `en_reparto` cambia de mensajero (ficha 427) | **SÍ (R6/R7)** | Es el único escritor de `mensajero_asignado_id` que parte de `en_reparto` y no toca el puntero (comprobado: ni el repo ni `TraspasoMensajeroService` lo mencionan). El origen quedaría bloqueado exactamente como en el incidente. |
| 5 | `GestionOrdenRepository.registrarGestionPendiente` | queda `en_reparto` con gestión pendiente | No | Ya limpia el puntero en su transacción (l.787). |
| 6 | `SolicitudAyudaService.solicitar` → `OrdenRepository.registrarAyudaSolicitada` | sigue `en_reparto`, ayuda abierta | No | Ya libera (`liberarOrdenEnGestion`, l.136), fuera de la tx — deuda escrita en su comentario; la orden sigue en «con ayuda», que R9 trata como vigente. |
| 7 | `CierresAdminRepository.resolverCierre`, `aplicacionGestiones` (l.2162) | `en_reparto → destino del resultado` | No | Sólo aplica órdenes con gestión registrada; su puntero ya se limpió en #5. La gestión registrada por la tienda (`crearGestionDesdeAyuda`) sale de una orden con ayuda abierta, cuyo puntero ya se soltó en #6. Restos de carrera: los cubre la defensa (§4). |
| 8 | `CierreDiaRepository.anularGestionYDevolverAGestion` | vuelve a `en_reparto` | No | Devuelve la orden a la lista; no puede dejar un puntero colgado (y R29 de esa feature prohíbe tocarlo). |
| 9 | `GestionOrdenRepository.recogerLote` | `por_recoger → en_reparto` | No | Entrada, no salida. |
| 10 | `LiberacionReprogramadaRepository.liberarOrden` | `reprogramada → bodega` | No | El origen no es `en_reparto`; el puntero se limpió al registrar la gestión. |
| 11 | `DevolucionSlaRepository.escalarDevueltaSla` / `liberarDevueltaSla`, `RecuperacionBodegaRepository.recuperarABodega`, `transicionarDesdeDevuelta` | desde `devuelta` | No | Origen no `en_reparto`. |
| 12 | `IncidenteAdminRepository.reportar` / `resolver` | desde bodega/tránsitos (`ORIGENES_INCIDENTE_ADMIN`) | No | Nunca en manos de un mensajero en reparto. |
| 13 | `OrdenRepository.cancelarViaApi` | desde `en_bodega_central` / `en_ruta_bodega_central` (`ESTADOS_CANCELABLES_API`) | No | Origen no `en_reparto`. |
| 14 | `OrdenRepository.softDelete` / `softDeleteViaApi` | `deleted_at` | No | `en_reparto` no está en `ESTADOS_ELIMINABLES` («eso está en gestión»). Un borrado físico ya lo cubre la FK `SetNull`. |
| 15 | `OrdenRepository.update` (`ajuste_estado`) | genérico | No | Sus dos consumidores (`DevolucionOrigenService`, `EnvioDevolucionCentralService`) parten de `por_devolver_*`. |
| 16 | `CierresAdminRepository.corregirResultadoGestionEnCierre` | corrige el resultado de una gestión ya registrada | No | La orden ya pasó por #5. |
| 17 | `OrdenRepository.deshacerAsignacionLote`, `desasignarRecoleccionLote`, asignaciones | antes de la recogida | No | Origen no `en_reparto`. |

El índice del grafo estaba parcialmente indexado en `OrdenRepository.ts` (líneas sin parsear
anotadas por la herramienta); por eso la tabla se completó con búsquedas de texto sobre
`en_reparto`/`mensajeroAsignadoId` en `lib/repositories`. Si aparece un camino nuevo después de este
spec, la defensa (§4) lo neutraliza igualmente: el inventario reduce los punteros colgados, pero el
bloqueo deja de depender de él.

## 3. Raíz: limpiar en la misma transacción

Regla común: **se limpia el puntero que apunta a una orden que ESTA transacción acaba de sacar de la
mano del mensajero, y ningún otro.** La sentencia es una sola por bloque, sobre `usuario`, dentro del
`tx` que ya existe:

```ts
await tx.usuario.updateMany({
  where: { ordenEnGestionId: { in: idsMovidas } },
  data: { ordenEnGestionId: null },
});
```

- **Sin filtrar por `id = mensajero`** en #1-#3: cualquier puntero que apunte a una orden que deja
  `en_reparto`/la bodega es colgado por definición, sea de quien sea (p. ej. un origen de traspaso
  anterior al despliegue). La guarda que protege a los demás es `ordenEnGestionId IN idsMovidas`.
- **Con `id = mensajeroOrigenId`** en #4: tras el traspaso la orden SIGUE gestionable, ahora por el
  destino; sólo el puntero del origen queda colgado (R6). El destino no puede apuntarla (no era
  suya), pero la guarda lo hace explícito.
- **`idsMovidas`, no los pedidos.**
  - #1 (corte): los ids del bloque son `pendientes` (re-leídos bajo el candado de la sentencia
    `UPDATE … SET estatus_id = estatus_id`). El `updateMany` de la transición devuelve `count`, no
    ids; para no limpiar el puntero de una orden que la guarda dejó fuera, el `where` de la limpieza
    añade la condición de destino: `ordenEnGestion: { estatusId: sinGestionarEstatusId }`. Va dentro
    del `if (movidas.count > 0)`.
  - #2/#3 (aprobación): igual, con `ordenEnGestion: { estatusId: destinoEstatusId }` /
    `{ estatusId: rechazadaEstatusId }` y dentro de cada `if (movidas.count > 0)`.
  - #4 (traspaso): todas las del lote, porque cualquier perdedora lanza y revierte (R23 de la 427).
    Va después del bucle de `UPDATE` y antes de las conversaciones.
- **Atomicidad (R1, R3-R5, R7).** Va dentro del callback de `$transaction`. Si el corte acaba en
  `SinGestionesVinculadas` (rollback) o la aprobación/traspaso lanzan, la limpieza se revierte con
  todo lo demás.
- **Neutralidad (R8).** `data` con una sola clave (`ordenEnGestionId`). Ninguna fila de historial,
  ningún importe. Los bloques tienen comentarios «money-neutral: el `data` toca únicamente
  `estatusId`»: siguen siendo ciertos respecto de `orden`; la sentencia nueva es sobre `usuario`.

## 4. Defensa: el puntero colgado deja de bloquear

Hacen falta **tres** puntos, no uno. Medido leyendo el código, el mensajero del incidente estaba
bloqueado por tres guardas distintas; ocultar el puntero sólo en la lectura lo habría sacado del
modo foco para chocar al momento con «ya tienes otra orden en gestión».

### 4.1 Un único predicado de vigencia, en el repositorio

En `GestionOrdenRepository` (o en un helper junto a `gestion-pendiente.ts`) se define una vez:

> **vigente(mensajeroId)** ⇔ la orden apuntada existe, `estatus.value = 'en_reparto'`,
> `mensajero_asignado_id = mensajeroId`, `deleted_at IS NULL` y **sin** gestión pendiente
> (`whereOrdenSinGestionPendiente()`, el predicado único de la 454).

Es la misma condición que hace que `listarMisAsignaciones` meta la orden en `porGestionar` o
`conAyuda` (l.348-357): `findMisAsignaciones` filtra por mensajero y estado, y sólo descarta
`conGestionPendiente`.

- **`getOrdenEnGestion(mensajeroId)`** pasa a devolver el puntero SÓLO si es vigente
  (`findUnique` de `usuario` con `select: { ordenEnGestionId, ordenEnGestion: { select: vigencia } }`
  o un `findFirst` sobre `usuario` con filtro de relación `ordenEnGestion: { is: vigente }`). Sigue
  siendo una lectura. Alimenta a la vez R9 (listar), R13/R14 (guarda de `gestionar`, l.655) y la
  relectura de `setOrdenEnGestion`.
- **`setOrdenEnGestion(mensajeroId, ordenId)`**: el `OR` del `where` gana una tercera rama,
  «el puntero actual NO es vigente» (`ordenEnGestion: { isNot: vigente }` o el `NOT EXISTS` equivalente
  en SQL). Así un puntero colgado se sustituye en la misma sentencia condicional que ya existe (R11),
  y uno vigente sigue rechazando (R12). Es una escritura, pero en el camino de ESCRITURA que el
  mensajero dispara a propósito, no en una lectura.

### 4.2 El invariante en el servicio (R9, R10)

`listarMisAsignaciones` publica `ordenEnGestionId` sólo si pertenece a `porGestionar ∪ conAyuda` de
la misma respuesta; si no, `null`. En memoria, sin consulta extra. Con 4.1 ya debería ser siempre
cierto; se añade porque es el contrato del que depende la pantalla (l.405-426) y lo garantiza por
construcción aunque las dos lecturas del `Promise.all` vean instantes distintos. Sin escrituras.

### 4.3 «Cancelar gestión» no cambia

`liberarOrdenEnGestion` mantiene su `where` guardado. Con un puntero colgado la pantalla ya no
muestra modo foco ni el botón, así que no hay nada que cancelar; y el siguiente «Gestionar pedido»
lo sustituye (4.1).

## 5. Contratos

Sin cambios de firma pública:

| Símbolo | Antes | Después |
|---|---|---|
| `IGestionOrdenRepository.getOrdenEnGestion` | puntero crudo | puntero si vigente, si no `null` (doc de la interfaz actualizada) |
| `IGestionOrdenRepository.setOrdenEnGestion` | `true` si NULL o igual | `true` si NULL, igual o colgado |
| `ListarMisAsignacionesServiceResult.ordenEnGestionId` | puntero crudo | ∈ `porGestionar ∪ conAyuda` o `null` |
| `crearCierre`, `resolverCierre`, `traspasarMensajeroLote` | — | mismas firmas y retornos; una sentencia más en su tx |

Sin rutas nuevas, sin migraciones, sin RLS, sin integraciones.

## 6. Datos existentes: sin backfill

Medido por el humano el 2026-10-19 (tras el `UPDATE` manual): **0 punteros colgados en producción**.
Con la defensa, un puntero colgado que apareciera antes del despliegue deja de bloquear y se
sustituye en el siguiente «Gestionar pedido», así que tampoco hace falta un backfill preventivo.

Consulta de verificación (solo lectura) para la release, contra producción por el MCP de Supabase:

```sql
SELECT u.id, u.orden_en_gestion_id, s.value AS estatus, o.mensajero_asignado_id, o.deleted_at
  FROM usuario u
  JOIN orden o        ON o.id = u.orden_en_gestion_id
  JOIN order_status s ON s.id = o.estatus_id
 WHERE s.value <> 'en_reparto'
    OR o.mensajero_asignado_id IS DISTINCT FROM u.id
    OR o.deleted_at IS NOT NULL;
```

Resultado esperado: 0 filas. Si salieran filas, NO se corrigen dentro de la release: se anotan y la
defensa las neutraliza. (No incluye el caso «con gestión pendiente», que `registrarGestionPendiente`
limpia en su propia tx; si el humano lo quiere medir, se añade el `EXISTS` de `sqlExisteGestionPendiente`.)

## 7. Alternativas descartadas

1. **Sólo la defensa en la lectura del servicio** (enmascarar el puntero en `listarMisAsignaciones`).
   Descartada: deja el modo foco arreglado pero el mensajero sigue sin poder escoger
   (`setOrdenEnGestion` exige NULL o igual) ni gestionar (guarda R21, l.655). El incidente se repite
   con otro síntoma.
2. **Limpiar el puntero al leer** (escritura dentro de `listarMisAsignaciones`). Descartada: una
   lectura de la pantalla más caliente del portal que escribe, sin actor ni transacción con la causa,
   y que el humano pidió evitar. La sustitución en `setOrdenEnGestion` consigue lo mismo en un camino
   que ya es de escritura.
3. **Trigger en Postgres** que anule el puntero cuando la orden cambia de estado o de mensajero.
   Descartada: lógica de dominio escondida fuera del código, inaudible para las guardias que leen
   `lib/`, y rompe el patrón del repo (los efectos van en el repositorio, dentro del `tx`).
4. **Derivar el puntero en vez de guardarlo** (quitar la columna). Rediseño; fuera del alcance
   mínimo pactado.
5. **Backfill / cron de limpieza.** Innecesario con 0 casos medidos y la defensa activa.

## 8. Riesgos y verificación

- **Guardias estructurales.** `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
  hace un censo de escrituras sobre `usuario` que exigen `appendAccion`. Hoy `registrarGestionPendiente`
  escribe el puntero sin `appendAccion`, así que el puntero parece fuera del censo, pero NO está
  medido para `crearCierre`/`resolverCierre`/`traspasarMensajeroLote`. Hay que correrla a mano junto
  con las demás guardias que leen esos archivos (lista en `tasks.md` T8): el `--rapido` no las
  relaciona por el grafo.
- **Concurrencia.** La limpieza va después del candado de fila que cada camino ya toma (corte:
  `UPDATE … RETURNING` de candado; aprobación: guarda por estado; traspaso: `FOR UPDATE`). Un
  `escogerParaGestion` concurrente sobre la misma orden falla en `cargarOrdenGestionable` (ya no está
  `en_reparto` o ya no es suya) o, si gana antes, su puntero se limpia en la sentencia nueva.
- **Dinero.** Ninguna columna de dinero ni total de cierre cambia (R8). Aun así el diff toca
  `CierreDiaRepository` y `CierresAdminRepository`: se corren completos los `tests/integration/db`
  de cierre (`cierre-sin-gestion-*`, `cierre-sin-gestion-tope-sql-real`) además de los nuevos.
