# SLT-224 — Design

> El MCP del grafo no tiene indexado este worktree («project not found»). Todo lo de abajo se
> confirmó leyendo el árbol con Grep/Read (rama `feature/SLT-224-zona-al-retirar-a-central`, base
> `8cc3c159`).

## Lo que ya existe

**Términos buscados:** «zona vieja», «recalcular zona», «retirar central», `orden_zona_reconciliada`,
`ordenes_retiradas_a_central`, `ESTADOS_PAQUETE_EN_ESTANTE`, `whereBaseElegible`,
`recibirEnBodegaCentral`, `retirarSateliteLote`, en `feature_list.json`, `specs/` y el código.

| Qué apareció | Qué es | Qué hace esta ficha con ello |
|---|---|---|
| Ficha 366 `specs/366-zona-orden-desactualizada/` + `ZonaRepository.update` (`:477-845`) | Reconciliación de `orden.zona_id` al guardar una zona: colapso `zonaUnicaDeDistrito`, corte `whereBaseElegible` (`:309-322`), `updateMany` de solo `zonaId`, una acción `orden_zona_reconciliada` por orden y un lote por guardado | **Se reutiliza**: el bloque `:617-719` se mueve a un helper compartido, sin cambiar su comportamiento (§2) |
| Ficha 377 `specs/377-bodega-satelite-sin-dueno/` | Retiene `en_bodega_satelite` y cuenta las retenidas | Se respeta: el helper conserva la retención y el conteo |
| SLT-197 `specs/SLT-197-retirar-satelite-a-central/` + `OrdenRepository.retirarSateliteLote` (`:4141`) | El retiro estante → `en_ruta_bodega_central`; R972 «conserva su zona», R977 «la recepción no cambia la zona», R982 «manifiesto con origen la zona satélite» | El retiro **no se toca** (R1705). R977 se enmienda para la orden desalineada (R1700) |
| SLT-211 | Acción `ordenes_retiradas_a_central` dentro del retiro | Sin cambios |
| `OrdenRepository.recibirEnBodegaCentral` (`:4643`) + `RecepcionBodegaCentralService` | Recepción en la central, una orden, transacción propia | **Aquí se engancha** el helper (§3) |
| `db/migrations/20261031120000_liberar_recolecciones_recibidas/` (SLT-63) | Precedente de migración de **datos** sobre `orden` con regla genérica y `down.sql` | Mismo vehículo para la corrección única (§5) |
| `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/` (SLT-75) | Precedente del esquema `respaldo` (fuera de `public`) para que el `down.sql` pueda restaurar, y del T0 que para | Se reutiliza el esquema `respaldo` y la forma del T0 (§5, §6) |
| Índice único `zona_distrito (organizacion_id, distrito_id)` (SLT-75) | Un distrito tiene como mucho una zona por empresa | Hace que en SQL un `JOIN` a `zona_distrito` sea equivalente a `zonaUnicaDeDistrito` (§5.1) |
| `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts` y `historial-accion-escrituras-cubiertas.guardia.test.ts` | Guardias que leen el cuerpo de `ZonaRepository.update` | Se reapuntan al helper (§2.3) |

En el board no hay otra ficha que corrija la zona al retirar o al recibir. Las dos que aparecen,
SLT-197 «Retirar paquetes de una bodega satélite a la central» y SLT-211 «Histórico de acciones:
registrar el retiro de paquetes de una satélite a la central», ya están hechas y son el origen del
hueco. No re-crean nada de esto.

## 1. Dónde se corrige: en la recepción, no en el retiro

`orden.zona_id` hace dos trabajos (377/design §1): dice a qué zona pertenece la dirección, y de ahí la
tarifa, y dice qué bodega tiene el paquete, y de ahí los permisos. Mientras la orden va
`en_ruta_bodega_central`, nada lee su zona para decidir algo:

- la satélite ya no la lista (`ESTADOS_FUERA_DEL_LISTADO_SATELITE`) ni la puede asignar (SLT-197/R979);
- la central no la puede asignar ni rutear hasta recibirla (`en_bodega_central` es el origen de los dos);
- no hay cierre: no hay gestión.

Lo único que lee la zona en ese tramo es el **manifiesto del retiro**. `ManifiestoService`
(`:132-136`, flujo `retiro_satelite`) pone como origen `row.zonaNombre`, la zona **viva** de la orden,
y el modal del retiro lo descarga justo después, ya con las órdenes en `en_ruta_bodega_central`
(SLT-197 design §6-§7). Si el retiro cambiara la zona, el papel que firma quien transporta diría
«origen: GAM» para un paquete que sale de «GAM Kevin (Alajuéla)», y rompería SLT-197/R982.

La recepción `en_ruta_bodega_central → en_bodega_central` es el primer momento en que la zona vuelve a
decidir algo (asignar desde la central o rutear a una satélite), y el paquete ya está físicamente en la
central. Es el punto mínimo y correcto. Además es genérico: corrige cualquier orden desalineada que
llegue a la central por esa arista (retiro, recolección en tienda o carga API), no solo las retiradas.

Lo que no cambia: el retiro (R1705) y la otra arista de la recepción,
`devolviendo_a_bodega_central → por_devolver_a_tienda` (R1704; §5.2).

Pendiente de confirmar por Carlos: P1 de `requirements.md`.

## 2. El helper compartido (R1706)

### 2.1 Qué se mueve

Archivo nuevo `lib/repositories/_shared/reconciliar-zona-ordenes.ts`. Se **mueven** sin cambio de
lógica desde `ZonaRepository.ts`:

- `whereBaseElegible(distritoIds, zonaResueltaId)` (`:309-322`), con su comentario;
- el bloque de reconciliación de `update` (`:617-719`): lectura de `zona_distrito` de los distritos
  afectados, colapso con `zonaUnicaDeDistrito`, por cada zona resuelta el `count` de retenidas en el
  estante, el `findMany` de elegibles, el `updateMany` de solo `zonaId` y el `appendAccion` de
  `orden_zona_reconciliada` con un `loteId` por llamada.

```ts
export interface AlcanceReconciliacion {
  /** Distritos a re-evaluar. Siempre presente: la regla parte del mapa `zona_distrito`. */
  distritoIds: string[];
  /** Si viene, acota además a estas órdenes (la recepción pasa la suya). Ausente = todas las del distrito. */
  ordenIds?: string[];
}

export interface ResultadoReconciliacion {
  ordenesReconciliadas: number;
  ordenesRetenidasEnBodegaSatelite: number;
}

export async function reconciliarZonaDeOrdenes(
  tx: Prisma.TransactionClient,
  alcance: AlcanceReconciliacion,
  actorUsuarioId: string | null,
): Promise<ResultadoReconciliacion>;
```

- **Recibe la `tx`** y nunca abre la suya: la atomicidad con el guardado o con la recepción la da el
  llamador (forma `recibe_tx` de la guardia del histórico).
- **`ordenIds`** se añade al `where` de las dos consultas (`count` y `findMany`) con `id: { in }`. Sin
  `ordenIds`, el `where` es byte a byte el de hoy.
- **Lote y actor.** Un `randomUUID()` por llamada (366/R11: un lote por guardado; aquí, uno por
  recepción). `resolverActorCongelado` una sola vez por llamada y solo si hay alguna zona resuelta,
  como hoy.

### 2.2 Los llamadores

- `ZonaRepository.update`: el bloque `:613-719` pasa a ser una llamada a
  `reconciliarZonaDeOrdenes(tx, { distritoIds: distritosAfectados }, actorUsuarioId)` cuando
  `distritosAfectados` no está vacío; si lo está, los dos contadores valen 0, como hoy.
  Mismo orden de consultas, mismo resultado (`tests/integration/db/zona-reconciliacion-ordenes.test.ts`
  y `tests/unit/repositories/zona-repository.test.ts` verdes sin tocar expectativas).
- `OrdenRepository.recibirEnBodegaCentral`: §3.

### 2.3 Las guardias que leen el cuerpo

- `historial-accion-escrituras-cubiertas.guardia.test.ts`: la entrada de `orden_zona_reconciliada` pasa
  de `ZonaRepository.ts`/`update`/`abre_tx` a `lib/repositories/_shared/reconciliar-zona-ordenes.ts`/
  `reconciliarZonaDeOrdenes`/`recibe_tx`, con la misma `mutacion: /tx\.orden\.updateMany\(/`. Su
  recortador `cuerpoDelMetodo` solo reconoce `async nombre(`, así que se amplía a
  `(?:export\s+)?async\s+(?:function\s+)?nombre\s*\(`, con una contraprueba que lo ejerza sobre una
  función exportada. El total de tipos (86) no cambia.
- `zona-reconciliacion-no-retarifa.guardia.test.ts`: el detector (`fallosDeLaReconciliacion`) se aplica
  al cuerpo del helper, no a `update`. Se añaden dos aserciones (R1706):
  - `ZonaRepository.update` y `OrdenRepository.recibirEnBodegaCentral` llaman a `reconciliarZonaDeOrdenes(`;
  - ni `ZonaRepository.ts` ni `OrdenRepository.ts` contienen `cierreDetalles: { none` ni el literal
    `"orden_zona_reconciliada"`, o sea, nadie repite el corte ni la acción fuera del helper.

## 3. La recepción en la central (R1700–R1704)

### 3.1 Servicio

`RecepcionBodegaCentralService.TRANSICIONES` gana una bandera por arista:

| Origen | Destino | `liberaAsignacion` | `reconciliaZona` (nueva) |
|---|---|---|---|
| `en_ruta_bodega_central` | `en_bodega_central` | `true` | `true` |
| `devolviendo_a_bodega_central` | `por_devolver_a_tienda` | `false` | `false` (R1704) |

Se pasa en `opciones` a `repo.recibirEnBodegaCentral(..., { liberaAsignacion, reconciliaZona })`. Es
una decisión de dominio, así que vive en el servicio y no en un `if (origenValue === ...)` del
repositorio. El resultado del servicio no cambia: la pantalla del escáner no muestra nada nuevo.

### 3.2 Repositorio

`IOrdenRepository.recibirEnBodegaCentral`: `opciones: { liberaAsignacion: boolean; reconciliaZona: boolean }`.

Dentro de la `$transaction` que ya existe:

1. la lectura `actual` añade `distritoId` a su `select`;
2. `updateMany` de la transición, igual que hoy;
3. si `result.count === 1 && actual !== null`: `appendCambioEstado` como hoy y, **después**, si
   `opciones.reconciliaZona && actual.distritoId !== null`:
   `await reconciliarZonaDeOrdenes(tx, { distritoIds: [actual.distritoId], ordenIds: [ordenId] }, historial.actorUsuarioId)`.

Va después de la transición a propósito: la orden ya está en `en_bodega_central`, que no es un estado
de estante, así que el corte de la 377 no la retiene, y una recepción que pierde la carrera no
reconcilia (R1703). El `count` de retenidas que devuelve el helper aquí es siempre 0 y se ignora.

Sin distrito, o con un distrito sin zona, el helper no encuentra zona resuelta y no escribe nada
(R1702). Con cierre o gestión que decidió dinero, `whereBaseElegible` la excluye (R1701).

### 3.3 Autorización, módulo, empresa, país

- Autorización: sin cambios. Recibe solo maestro/admin (`esAccesoTotal`, feature 138/R4).
- Módulo: ninguno nuevo.
- Multi-empresa: la `tx` es la del cliente con la empresa en contexto, así que RLS acota
  `zona_distrito`, `orden` y `historial_accion` a la empresa de la sesión, como en el guardado de
  zona. No hay tabla nueva de negocio.
- País: nada depende del país (ni moneda, ni impuestos, ni geografía nueva).

## 4. La tarifa y el cobro (R1707)

Igual que la 366, porque es su misma regla:

- **La orden no lleva tarifa estampada.** `orden` no tiene columna de flete ni de tarifa (solo
  `monto_cobrar`, el COD, que no depende de la zona). La tarifa se resuelve **al cerrar**, desde la
  `zona_id` viva, y se congela en `cierre_detail` (`zona_id`, `es_central`, `tarifa_*`,
  `tarifa_modelo`), `cierre_detail_concepto` y `gestion_pago_congelado`. Cambiar la zona solo hace que
  el **próximo** cierre de la orden cobre y pague con la tarifa de la zona nueva, que es la de la
  dirección y la de quien la va a entregar.
- **Lo ya cerrado no se toca.** `cierre_detail` es inmutable y el corte excluye cualquier orden con
  algún `cierre_detail` (366/R8).
- **Lo que ya decidió dinero sin cerrar tampoco.** El corte excluye la gestión vigente `entregado`,
  `devolucion_a_origen_por_rechazo` o `incidente` (366 design §1).
- **Wallet.** Los movimientos de wallet nacen de cierres aprobados y de pagos. Como no se toca ningún
  cierre, ningún saldo cambia.
- **El retiro** sigue sin cobrar ni pagar nada (SLT-197/D2).

Lo vigilan la guardia `zona-reconciliacion-no-retarifa` (el `updateMany` solo lleva `zonaId` y no hay
escrituras en tablas de dinero), ahora sobre el helper, y las pruebas de integración, que comparan la
fila completa de la orden y las tablas de dinero antes y después.

No queda nada de dinero sin decidir con el código. La única arista dudosa (la orden con un cierre de
un intento anterior) queda **excluida** por la regla existente y se lleva a P2.

## 5. La corrección única (R1708–R1712)

### 5.1 Vehículo: migración de datos SQL

`db/migrations/20261120120000_slt224_zona_de_ordenes_en_central/` con `migration.sql` y `down.sql`. Es
el vehículo del repo para corregir datos (SLT-63, SLT-75). La aplica el build de cada entorno
(`scripts/migrate-deploy.ts`) y ningún agente toca la base de producción.

La regla es la del helper, escrita en SQL (no puede importar TypeScript). Para que no diverjan, la
prueba de §7.2 ejerce la misma matriz de casos que la del helper y espera el mismo conjunto:

```sql
-- Candidatas: regla genérica, todas las empresas (corre como dueño, sin RLS).
-- El JOIN a zona_distrito por (organizacion_id, distrito_id) devuelve como mucho una fila por el
-- índice único de SLT-75: equivale a `zonaUnicaDeDistrito` (0 filas = distrito sin zona = fuera).
o.deleted_at IS NULL
AND s.value IN ('en_bodega_central', 'en_ruta_bodega_central')
AND zd.organizacion_id = o.organizacion_id AND zd.distrito_id = o.distrito_id
AND o.zona_id <> zd.zona_id
AND NOT EXISTS (SELECT 1 FROM cierre_detail cd WHERE cd.orden_id = o.id)
AND NOT EXISTS (SELECT 1 FROM gestion_orden g WHERE g.orden_id = o.id AND g.anulada_at IS NULL
                AND g.resultado IN ('entregado', 'devolucion_a_origen_por_rechazo', 'incidente'))
```

`migration.sql`, en orden y en la transacción de la migración:

1. `CREATE SCHEMA IF NOT EXISTS respaldo;` (ya existe por SLT-75; el `IF NOT EXISTS` lo hace inocuo).
2. `CREATE TABLE respaldo.slt224_orden_zona AS` con las candidatas: `orden_id`, `organizacion_id`,
   `zona_id_anterior`, `zona_id_nueva`, `lote_id` (un `gen_random_uuid()` por empresa, con un CTE de
   empresas distintas) y `respaldado_at`. Columnas con nombre, nunca `o.*`.
   `REVOKE ALL ON respaldo.slt224_orden_zona FROM PUBLIC;`
3. `UPDATE orden o SET zona_id = r.zona_id_nueva, updated_at = NOW() FROM respaldo.slt224_orden_zona r WHERE o.id = r.orden_id;`
   Solo esas dos columnas (R1707).
4. `INSERT INTO historial_accion (id, accion, entidad_tipo, entidad_id, entidad_etiqueta, actor_usuario_id, actor_nombre, actor_rol, lote_id, organizacion_id)`
   desde el respaldo unido a `orden`: `gen_random_uuid()`, `'orden_zona_reconciliada'`, `'orden'`,
   `o.id`, la etiqueta de `etiquetaDeEnvio` (`COALESCE(NULLIF(btrim(o.num_guia::text), ''), NULLIF(btrim(o.num_remision), ''), '(sin guía)')`,
   recortada a 120), actor y nombre y rol `NULL` (sistema, como el cron), `r.lote_id` y
   `r.organizacion_id` **explícito** (su `DEFAULT` lee el contexto de sesión, que en una migración no
   existe). `monto`, `valor_anterior` y `valor_nuevo` quedan en `NULL`, como en la 366/R10.

Si no hay candidatas, el respaldo queda vacío y los pasos 3 y 4 no escriben nada (R1712).

### 5.2 Por qué solo esos dos estados (R1709, P3)

- **`en_bodega_central`**: la central tiene el paquete y su zona decide asignar o rutear. Aquí está el
  caso evidenciado.
- **`en_ruta_bodega_central`**: en régimen normal se corregiría al recibir (§1). Se incluye en la
  corrección para no depender del orden entre el `migrate deploy` y la publicación del código nuevo:
  una orden recibida en ese intervalo por el código viejo quedaría desalineada en la central. El
  manifiesto de esos retiros ya se descargó.
- **Fuera, `por_devolver_a_bodega_central`**: solo el `adminSatelite` cuya zona es la de la orden la
  puede enviar a la central (`EnvioDevolucionCentralService.ts:15-19,60`, «`por_devolver` es SIEMPRE
  de una orden de zona satélite»). Pasarla a la zona central la dejaría sin nadie que la pueda enviar:
  el mismo atasco de la 377.
- **Fuera, `devolviendo_a_bodega_central`, `por_devolver_a_tienda` y siguientes**: van de vuelta a la
  tienda, su resultado ya está decidido (366: «se incluye el resultado cuya bodega de destino aún está
  por decidir») y la recepción central no acota por zona (`RecepcionBodegaCentralService`, R11).
  Cambiarles la zona no desbloquea nada.
- **Fuera, `en_bodega_satelite`**: 377 (D3).
- **Fuera, entregadas**: tienen gestión `entregado` y, casi siempre, cierre (D3).

### 5.3 `down.sql` (R1711)

1. `UPDATE orden o SET zona_id = r.zona_id_anterior, updated_at = NOW() FROM respaldo.slt224_orden_zona r WHERE o.id = r.orden_id AND o.zona_id = r.zona_id_nueva AND EXISTS (SELECT 1 FROM zona z WHERE z.id = r.zona_id_anterior);`
   No pisa una zona que alguien cambió después, ni apunta a una zona borrada.
2. `DELETE FROM historial_accion h USING (SELECT DISTINCT lote_id FROM respaldo.slt224_orden_zona) l WHERE h.lote_id = l.lote_id AND h.accion = 'orden_zona_reconciliada';`
3. `DROP TABLE respaldo.slt224_orden_zona;`. **No** se borra el esquema `respaldo`: ahí sigue el
   respaldo de SLT-75.

## 6. T0 y T11 contra producción (solo lectura, los hace el leader)

Con la URL de `.env.prod` y `SET default_transaction_read_only = on` tras conectar. No se imprimen
credenciales.

**T0, antes de abrir el PR.** Misma regla que §5.1, sin el corte, agrupada:

```sql
WITH d AS (
  SELECT o.id, o.organizacion_id, o.num_guia, s.value AS estado,
         EXISTS (SELECT 1 FROM cierre_detail cd WHERE cd.orden_id = o.id) AS con_cierre,
         EXISTS (SELECT 1 FROM gestion_orden g WHERE g.orden_id = o.id AND g.anulada_at IS NULL
                 AND g.resultado IN ('entregado','devolucion_a_origen_por_rechazo','incidente')) AS con_gestion
  FROM orden o
  JOIN order_status s ON s.id = o.estatus_id
  JOIN zona_distrito zd ON zd.organizacion_id = o.organizacion_id AND zd.distrito_id = o.distrito_id
  WHERE o.deleted_at IS NULL
    AND s.value IN ('en_bodega_central','en_ruta_bodega_central')
    AND o.zona_id <> zd.zona_id
)
SELECT organizacion_id, estado, count(*) AS desalineadas,
       count(*) FILTER (WHERE NOT con_cierre AND NOT con_gestion) AS a_corregir,
       count(*) FILTER (WHERE con_cierre) AS excluidas_por_cierre,
       count(*) FILTER (WHERE con_gestion) AS excluidas_por_gestion,
       bool_or(num_guia = 64482571) AS incluye_guia_evidenciada
FROM d GROUP BY 1, 2 ORDER BY 1, 2;
```

La guía 64482571 solo aparece en la columna de comprobación. La regla de la migración no lleva ningún
id fijo.

**Para, y decide Carlos, si:**

- `a_corregir` no es 56 en `en_bodega_central` y 35 en `en_ruta_bodega_central` en la empresa
  evidenciada (los números se mueven con cada retiro y cada recepción: se le pasa a Carlos el número
  nuevo para que lo confirme);
- aparece alguna otra empresa;
- `excluidas_por_cierre + excluidas_por_gestion > 0`, o la guía evidenciada queda excluida (P2).

Se re-mide el día del paso a producción, no solo el del PR.

**T11, después del deploy a producción.** La misma consulta da `a_corregir = 0`, el respaldo tiene
tantas filas como `a_corregir` daba el T0 del día, hay una acción `orden_zona_reconciliada` por fila
del respaldo, y la guía 64482571 tiene la zona de su distrito («GAM»).

## 7. Pruebas contra Postgres real

Los dobles de Prisma no ven el `WHERE`. Lo que decide quién cambia de zona se prueba en
`tests/integration/db/` con la base desechable, como `zona-reconciliacion-ordenes.test.ts`, y cada
prueba se mata con una mutación antes de darla por buena (en `progress/impl_SLT-224.md`, con su rojo).

### 7.1 `recepcion-central-reconcilia-zona.int.test.ts` (R1700–R1704, R1707)

Fixtures: zona satélite A, zona central C, distrito X mapeado a C, orden en `en_ruta_bodega_central` con
`zona_id = A` y distrito X. Por `RecepcionBodegaCentralService` + `OrdenRepository` reales:

- recibe → `en_bodega_central` y `zona_id = C`; una fila `orden_zona_reconciliada` con el actor (R1700, R1703);
- variantes que conservan A y se reciben igual: con `cierre_detail`; con gestión vigente `entregado`,
  `devolucion_a_origen_por_rechazo` o `incidente`; sin distrito; distrito sin `zona_distrito` (R1701, R1702);
- variantes que sí cambian: gestión `entregado` **anulada**; gestión vigente `reprogramado` (el corte
  es por resultado, no por existencia de gestión);
- segunda recepción (`ya_recibida`) y estado inválido: sin cambio de zona ni fila (R1703);
- `devolviendo_a_bodega_central` desalineada: `por_devolver_a_tienda` con zona A y sin fila (R1704);
- otra orden del mismo distrito, en `en_bodega_central` y desalineada, **no** cambia: el `ordenIds` acota;
- fila de la orden antes/después idéntica salvo `zona_id` y `updated_at`; conteo de `cierre_detail`,
  `gestion_orden`, `gestion_pago_congelado` y movimientos de wallet sin cambio (R1707).

Mutaciones que deben ponerla en rojo: quitar `ordenIds` del `where`; quitar `cierreDetalles: { none: {} }`;
llamar al helper antes del `updateMany`; poner `reconciliaZona: true` en la arista de devolución.

### 7.2 `zona-desalineada-central-migration.test.ts` (R1708–R1712, R1707)

Precedente: `liberar-recolecciones-recibidas-migration.test.ts`. Siembra una matriz en dos empresas y
ejecuta el texto de `migration.sql` y luego el de `down.sql`:

- se corrigen: `en_bodega_central` y `en_ruta_bodega_central` desalineadas, elegibles, en las dos
  empresas (R1708), con la lista de ids esperada **escrita literal** en el test, no derivada de la regla;
- no se corrigen: `en_bodega_satelite`, `entregado`, `por_devolver_a_bodega_central`,
  `devolviendo_a_bodega_central`, `por_devolver_a_tienda`, borrada, distrito sin zona, con
  `cierre_detail`, con gestión decidida y orden ya alineada (R1709);
- acciones: una por orden corregida, actor/nombre/rol nulos, etiqueta = guía (y remisión en una orden
  sin guía), un `lote_id` por empresa y distinto entre empresas, `organizacion_id` el de la orden (R1710);
- `down.sql`: restaura la zona anterior; una orden cuya zona se cambió a mano tras la migración no se
  pisa; borra solo las acciones de sus lotes y deja una `orden_zona_reconciliada` previa (R1711);
- base sin candidatas: cero filas cambiadas, cero acciones (R1712).

### 7.3 Retiro (R1705)

En `retiro-satelite-central.int.test.ts`, un caso nuevo: orden en `en_bodega_satelite` cuyo distrito ya
pertenece a otra zona; tras `retirarSateliteLote` conserva la zona satélite.

## 8. Alternativas descartadas

- **A. Re-derivar la zona en el retiro (lo que decía la ficha).** El manifiesto del retiro, descargado
  justo después, lee la zona viva y diría como origen la zona nueva: rompe SLT-197/R982 en el papel que
  firma el transportista. Arreglarlo exige guardar el origen del retiro por orden, que hoy no existe
  (la acción `ordenes_retiradas_a_central` es por zona, no por orden). Más alcance para ningún
  beneficio: en ruta, la zona no decide nada (§1). Queda como P1 por si Carlos lo prefiere.
- **B. Corregir la zona al leer** (en la asignación o el ruteo de la central). Duplica la regla en cada
  lector y deja `orden.zona_id` mintiendo para el cierre, que la lee para la tarifa. Es lo que la 366
  descartó.
- **C. Copiar la reconciliación dentro de `OrdenRepository`.** Dos copias del corte de dinero que un
  día divergen sin que falle nada (la lección de `zona-colapso.ts`). El encargo pide reutilizar.
- **D. Un script TypeScript que llame al helper contra producción.** Reutilizaría la regla tal cual,
  pero ningún agente toca la base de producción y el repo no tiene ese camino: las correcciones de
  datos van por migración (SLT-63, SLT-75), versionadas, con `down.sql` y probadas en CI.
- **E. Corrección sin historial** (como SLT-63). Ahí no cambiaba un dato de negocio; aquí cambia la
  zona de la que sale la tarifa, y la 366/R10 exige una fila por orden re-estampada.

## 9. Riesgos

- **Órdenes con cierre de un intento anterior** quedan con la zona vieja (P2). El T0 las cuenta.
- **Carrera recepción contra guardado de zona.** Las dos escriben `zona_id` en transacciones distintas.
  Las dos calculan la zona desde el mismo `zona_distrito`, así que el resultado final es el mismo
  gane quien gane.
- **Re-descargar el manifiesto de un retiro** después de recibir mostraría la zona nueva. Ya pasa hoy
  si se guarda una zona entre el retiro y la descarga (SLT-197/R986). No se arregla aquí.

## 10. Dependencias y tamaño

- Sin librerías nuevas.
- Archivos: 16 (`tasks.md > Archivos esperados`), el 40 % de 40.
- Producción: unas 170 líneas (helper ~110, movidas desde `ZonaRepository`, que baja otras tantas;
  recepción ~20; servicio e interfaz ~10; migración ~60; ayuda ~3).
- Tests: unas 650 líneas (dos integraciones nuevas ~550, guardias ~60, ajustes de unit ~40).
