# 419 — Design: la bodega central cierra la devolución con su comprobante

> Arreglo mínimo: una acción por lote más en `/ordenes`, un servicio, un método de repositorio
> set-based y dos/tres tablas de enlace. No se toca el modelo de estados, ni el enum de familias,
> ni la vía del escáner, ni el dinero.
>
> Búsqueda de código: MCP `codebase-memory` (proyecto `R-job-singularis-projects-ordenex`);
> cada símbolo citado se confirmó en el archivo real el 2026-10-21 sobre `dev` (`8e6458a2`).

## 0. Lo que hay hoy (medido en el código)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Arista #28 | `lib/types/order-status-transiciones.ts:355` | `devolviendo_a_tienda → devuelta_a_tienda`, `via: "ajuste_estado"`, `rol: "adminTienda"` |
| Guardia central (140) | `assertTransicionValida` (`:559`), llamada desde `appendCambioEstado` (`lib/repositories/registrar-cambio-estado.ts:177`) | Decide SOLO por el par `(origen, destino)`. `via`/`rol` son **metadatos** (comentario `:82-86`). Valida el LOTE entero antes de escribir: una entrada ilegal revierte todo. |
| Vía del escáner | `EscanerRecepcionOrigen.tsx` → `recibirEnOrigenPorQr` (`lib/actions/recepcion-origen.ts`) → `RecepcionOrigenService.recibirEnOrigen` → `OrdenRepository.recibirEnOrigen` (`:4308`) | Rol `adminTienda` exclusivo; `updateMany` guardado por estado + tienda + no borrada; append de historial con `origen_tipo = ajuste_estado` si `count === 1`. Ningún efecto más. |
| Paso anterior del flujo | `DevolucionOrigenService.devolverATienda` + acción «Enviar a la tienda» (`OrdenesListado.tsx:823-833`) | `por_devolver_a_tienda → devolviendo_a_tienda`, maestro/admin, la UI lo hace en loop por orden. |
| Webhooks | `appendCambioEstado` → `emisorWebhookEstadoReal` (`lib/services/jobs/webhook-estado-encolado.ts`) | Outbox en la MISMA tx. `devuelta_a_tienda` está en `EVENTOS_PUBLICOS` (`lib/types/webhook-eventos.ts:101`) → se emite para dueños con suscripción activa y rol `apiKey`. |
| Notificaciones | `emisorNotificacionReal` (`lib/notificaciones/emitir.ts:235`) | Hoy es **no-op** (`async () => {}`). Bienvenida: solo `recoleccion → en_reparto`. |
| Dinero | — | **Ningún** archivo de wallet/pago/flete/tarifa/liquidación menciona `devuelta_a_tienda` ni `devolviendo_a_tienda` (grep en `lib/**/*{allet,ago,lete,obro,arifa,iquidac,otific}*` y en `db/migrations`: sin triggers). El flete de devolución se decide al rechazar/aprobar cierre (337/301/247/239: `rechazo_tienda_cobro`, `derivarIngresoOrden`), nunca al recibir la tienda. `ajuste_estado` no está en `ORIGEN_TIPOS_VISITA_REAL` (`lib/types/orden-historial.ts:325`), así que no cuenta intentos. **Conclusión: `devuelta_a_tienda` NO mueve dinero**, y R15 lo fija con un test. |
| Pantalla | `app/(app)/ordenes/page.tsx:101` (`accionesLote = esAccesoTotal(rol)`; la página descarta `adminSatelite`/mensajero antes) y `accionesDe` en `OrdenesListado.tsx:678` | Hoy `devolviendo_a_tienda` cae en el `default` → sin acción por lote. Filtro por tienda ya existe (`incluirFiltroTienda`). |
| Evidencias (119/158) | `lib/config/gestion.ts`, `evidenciasSchema` (`lib/types/gestion-orden.ts:69`), `components/shared/EvidenciasField.tsx`, `compensarEvidencias` (`lib/services/evidencias-compensadas.ts:107`) | Bucket privado `gestion-evidencias`, imagen jpeg/png/webp, 5 MB/archivo, 1..3 archivos. **Precedente directo**: el incidente del admin (158) reusa el mismo bucket con prefijo propio (`lib/actions/incidentes.ts:90-93`) y su propia tabla de evidencias con `indice`. |

## 1. Decisiones

### D1 — Catálogo: se actualiza el metadato de #28; no se añade arista ni familia (R24)

La guardia ya acepta `devolviendo_a_tienda → devuelta_a_tienda` para cualquier actor: la
autorización por rol vive en el servicio, nunca en el mapa. Por tanto **la central no está
bloqueada por la guardia**; estaba bloqueada por `RecepcionOrigenService` (rol exclusivo) y por
no tener pantalla.

Cambio: `rol: "adminTienda (escaner) / maestro/admin (central, con comprobante — 419)"`, con un
comentario `// #28 (419)`. El fixture `tests/fixtures/inventario-transiciones-140.ts:107` cambia
SOLO su campo `callSite` para nombrar los dos productores. Cifras de aristas y pares: sin cambio.

Se mantiene `origen_tipo = ajuste_estado` (lo mismo que el escáner y que #42). Quién lo hizo se
lee del `actor_usuario_id` del historial (su rol distingue tienda de central) y del enlace al
comprobante (R10).

### D2 — El comprobante vive en `gestion-evidencias`, carpeta `devolucion-tienda/` (R3, R4, R23)

Mismo patrón que el incidente (158): `new SupabaseFileStorage(undefined,
gestionConfig.EVIDENCIA_BUCKET)` y `SupabaseSignedUrlProvider` sobre el mismo bucket. Límites
reusados, no reescritos: `evidenciasSchema` en el borde y `validarEvidencia` en el servicio
(tipos, 5 MB, 1..`MAX_EVIDENCIAS_POR_GESTION`). Nombre del objeto:
`devolucion-tienda/<uuid aleatorio>.<ext>` (sin ids de tienda/orden/usuario, R23). En cliente se
reusa `EvidenciasField` (compresión ya incluida, cabe en `bodySizeLimit: "5mb"`).

Operaciones: el bucket **ya existe** en local, preview y prod (lo usan 36/119/158). Ninguna
creación manual.

### D3 — Modelo de datos: tres tablas nuevas, inmutables (R10, R11, R22) — **lleva migración**

```prisma
/// Un LOTE de confirmación central de entrega a la tienda (419). Inmutable.
model DevolucionTiendaComprobante {
  id        String   @id @default(uuid())
  tiendaId  String   @map("tienda_id")   // FK usuario (la tienda del lote)
  subidoPor String   @map("subido_por")  // FK usuario (maestro/admin)
  createdAt DateTime @default(now()) @map("created_at")
  evidencias DevolucionTiendaEvidencia[]
  ordenes    DevolucionTiendaOrden[]
  @@index([tiendaId])
  @@map("devolucion_tienda_comprobante")
}

/// Archivos del comprobante (1..MAX_EVIDENCIAS_POR_GESTION). Molde: evidencias del incidente (158).
model DevolucionTiendaEvidencia {
  id            String @id @default(uuid())
  comprobanteId String @map("comprobante_id")
  storagePath   String @map("storage_path")  // nunca sale al cliente (R23)
  contentType   String @map("content_type")
  indice        Int
  @@unique([comprobanteId, indice])
  @@map("devolucion_tienda_evidencia")
}

/// Enlace orden <-> comprobante. Una orden se devuelve a la tienda UNA vez (estado terminal).
model DevolucionTiendaOrden {
  ordenId       String   @id @map("orden_id")  // PK = UNIQUE: segunda prueba de R8
  comprobanteId String   @map("comprobante_id")
  createdAt     DateTime @default(now()) @map("created_at")
  @@index([comprobanteId])
  @@map("devolucion_tienda_orden")
}
```

- FKs `ON DELETE RESTRICT` (molde `wallet_comprobante`). Sin `updated_at` ni `deleted_at`.
- `CHECK (content_type IN ('image/jpeg','image/png','image/webp'))` e `indice >= 0` a mano en
  el SQL.
- RLS habilitada **sin policies** (solo service role), como `wallet_comprobante`/`abono_tienda`.
- Migración `db/migrations/<ts>_devolucion_tienda_comprobante_419/` con `migration.sql` y
  `down.sql` (`DROP TABLE` de las tres, en orden inverso). **No toca ningún enum**, así que el
  aviso de los `down.sql` que recrean enums no aplica.
- Relaciones inversas en `Usuario` y `Orden` (nombres `DevolucionTiendaComprobanteTienda`,
  `DevolucionTiendaComprobanteSubidoPor`).

### D4 — Lote set-based con `UPDATE ... RETURNING` y reporte por orden (R6–R11, R14)

Patrón calcado de `GestionOrdenRepository.recogerLote` (`:676`): una sentencia guardada, el
append del historial SOLO con lo devuelto por `RETURNING`, todo en una `$transaction`.

`DevolucionTiendaRepository.confirmarEntregaLote(input, tx-runner)`:

```
$transaction(tx):
  1. INSERT devolucion_tienda_comprobante (tienda_id, subido_por) RETURNING id
  2. INSERT devolucion_tienda_evidencia (n filas)
  3. rows = UPDATE "orden" SET "estatus_id" = :devuelta, "updated_at" = NOW()
            WHERE "id" IN (:ids) AND "tienda_id" = :tienda
              AND "estatus_id" = :devolviendo AND "deleted_at" IS NULL
            RETURNING "id"
  4. SI rows vacío -> throw SinTransiciones (revierte 1 y 2: R11)
  5. appendCambioEstado(tx, rows.map(id => {origen: :devolviendo, destino: :devuelta,
       actor: subido_por, origenTipo: "ajuste_estado"}))      -- historial + webhook (R9, R14)
  6. INSERT devolucion_tienda_orden (orden_id, comprobante_id) por cada row (R10)
return { comprobanteId, transicionadas: rows.ids }
```

Por qué set-based y no una tx por orden: el lote real son ~250 órdenes; 250 transacciones
interactivas multiplican viajes y, como el escáner, cada una pasaría por la guardia por separado
sin ganar nada. Con `RETURNING` la carrera la decide Postgres (R8): la orden que el escáner ganó
no aparece en `rows` y no deja rastro. El `PRIMARY KEY (orden_id)` del enlace es la segunda red.

Clasificación del resto (después de la tx, solo lectura): `findMany` de los ids pedidos que no
están en `rows` (incluye borradas) → `no_encontrada` (no existe o `deleted_at` no nulo),
`tienda_distinta` (otra `tienda_id`), `ya_devuelta` (`devuelta_a_tienda`), si no
`estado_invalido` con su `value`. La clasificación es informativa: la decisión de transicionar
ya la tomó el `WHERE`.

### D5 — Servicio y orden de operaciones (R1–R5, R11–R13)

`DevolucionTiendaService.confirmarEntrega(input, actor)`:

1. `esAccesoTotal(actor.rol)` o `forbidden` **antes de leer o subir** (R2). No se usa ningún
   predicado nuevo de rol: D-H3 coincide exactamente con `ROLES_ACCESO_TOTAL`.
2. Revalidar archivos con `validarEvidencia` y número máximo (R3/R4); tienda del lote existe y es
   `adminTienda` (si no, `validation_error` en `tiendaId`).
3. Resolver ids de `devolviendo_a_tienda`/`devuelta_a_tienda` del catálogo (si falta: 
   `validation_error`, patrón `RecepcionOrigenService` paso 6).
4. Subir los archivos (antes de escribir, patrón 458-B R76). Si uno falla: `compensarEvidencias`
   de los ya subidos y `comprobante_no_guardado` (R12).
5. Repo `confirmarEntregaLote`. Si lanza `SinTransiciones` → `compensarEvidencias` y devolver el
   reporte (R11). Si lanza otra cosa → `compensarEvidencias` y propagar (R13; el borde lo
   normaliza con `withErrorHandler`).
6. Clasificar el resto (D4) y devolver.

Contrato:

```ts
// lib/types/devolucion-tienda.ts
export const confirmarEntregaTiendaSchema = z.object({
  tiendaId: z.string().uuid(),
  ordenIds: z.array(z.string().uuid()).min(1).max(TOPE_ORDENES_POR_LOTE), // 300, Pregunta 4
  evidencias: evidenciasSchema,                                           // 119, reusado
});
export type DesenlaceOrden =
  | { ordenId: string; numGuia: number | null; desenlace: "devuelta" | "ya_devuelta" | "tienda_distinta" | "no_encontrada" }
  | { ordenId: string; numGuia: number | null; desenlace: "estado_invalido"; estado: string };
export type ConfirmarEntregaTiendaResult =
  | { status: "ok"; devueltas: number; desenlaces: DesenlaceOrden[] }          // >=1 transicionó
  | { status: "ninguna_devuelta"; desenlaces: DesenlaceOrden[] }               // R11
  | { status: "forbidden" } | { status: "comprobante_no_guardado" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "unauthenticated" };
```

`numGuia` de una `no_encontrada` es `null` (no se revela nada de una orden inexistente/borrada).

### D6 — Borde: Server Action `lib/actions/devolucion-tienda.ts`

`confirmarEntregaTienda(formData)` (`'use server'`), espejo de `recepcion-origen.ts`: actor por
sesión, zod en el borde, `withErrorHandler`, deps inyectables. Mutación interna → Server Action,
no ruta API. Lee los `File` del `FormData` (mismo mecanismo que la gestión/incidente).

`verComprobanteDevolucionTienda({ ordenId })` (R22): `esAccesoTotal` o `no_encontrado`; busca el
enlace de la orden y devuelve URLs firmadas (`gestionConfig.SIGNED_URL_TTL_SECONDS`) de sus
evidencias, nunca el `storage_path`. Sin enlace → `no_encontrado` (mismo resultado que el rol
ajeno: no revela existencia).

### D7 — Pantalla

- `accionesDe` (`OrdenesListado.tsx`) gana `case "devolviendo_a_tienda"` → acción
  `confirmar-entrega-tienda`, label «Confirmar entrega a la tienda». Hereda la puerta
  `accionesLote` (solo maestro/admin, R21) y el conteo de selección mixta de `accionesPara` (R17).
- Modal nuevo `ConfirmarEntregaTiendaModal.tsx` en `app/(app)/ordenes/_components/`: deriva la
  tienda de las órdenes recibidas; si hay más de una, lista los nombres (`tiendaNombre` del DTO)
  y deshabilita confirmar (R18, precedente: el modal de traspaso de la 427). `EvidenciasField`
  obligatorio (R19). Tras la respuesta, pinta el resumen (R20) con textos en lenguaje claro y
  llama a `handleSuccess` para refrescar.
- `HistorialOrdenSheet`: para maestro/admin, si la orden está en `devuelta_a_tienda`, botón «Ver
  comprobante de entrega» que llama a `verComprobanteDevolucionTienda` (R22).
- Es un modal dentro de `/ordenes`, no una pantalla ni un módulo nuevo: no pasa por `/design`.

### D8 — Lo que NO se toca

- `RecepcionOrigenService`, `recibirEnOrigenPorQr`, `OrdenRepository.recibirEnOrigen`,
  `EscanerRecepcionOrigen.tsx`: intactos (R16). Sus tests existentes son la red.
- Registro de acciones (362): no se añade tipo. La transición ya tiene actor e instante en
  `orden_historial_estado` y la 362 registra lo que mueve dinero, borra o cambia permisos
  (Pregunta 5).
- Webhooks/notificaciones: sin código nuevo; los da el choke point (R14).
- Efecto conocido y buscado: al vaciar `devolviendo_a_tienda`, la efectividad histórica de la
  cohorte de carga (411) sube sola (status_note de la ficha).

## 2. Alternativas descartadas

### A1 — Añadir una familia nueva `recepcion_tienda_central` al enum `orden_historial_origen_tipo` y una arista duplicada #28b (descartada)

Daría un `origen_tipo` propio para distinguir la vía central en el historial, con el precedente
de pares duplicados #19/#23. Se descarta porque: (1) un valor de enum nativo en Postgres no
admite `DROP VALUE`, así que el `down.sql` no sería reversible de verdad —el propio
`RecepcionOrigenService` lo evitó por esa razón—; (2) cada familia nueva obliga a decidir su
pertenencia en `ORIGEN_TIPOS_VISITA_REAL`, `ORIGENES_SIN_EVENTO_PUBLICO` y las guardias que
mapean familias a dinero (riesgo de «fallo mudo»); (3) la distinción ya existe por el rol del
actor y por el enlace al comprobante. Coste sin beneficio.

### A2 — Bucket propio `devolucion-comprobantes` (descartada)

Aislaría los comprobantes, pero exige crearlo a mano en tres entornos antes del despliegue (sin
él la feature falla en producción, como avisa `lib/config/wallet-comprobante.ts`), y no aporta
nada: `gestion-evidencias` ya es privado, ya se comparte con prefijo propio (158) y ya tiene los
límites que el humano pidió («como en la 119»). El bucket de la caja (`wallet-comprobantes`) se
descarta también: es del dominio de dinero y sus límites (PDF, 4 MB) no son los de la 119.

### A3 — Reusar `recibirEnOrigen` en loop desde la UI, como «Enviar a la tienda» (descartada)

Cambiaría solo el rol del servicio y la UI iteraría por orden. Se descarta: el comprobante es
UNO por lote y tendría que subirse antes y enlazarse después fuera de la transacción de cada
orden (rastro sin transición o transición sin rastro); un fallo a mitad del loop deja el lote
partido sin reporte servidor; y ensancharía la vía del escáner, que se quiere intacta.

### A4 — Abortar el lote entero si alguna orden no es elegible (descartada)

Es lo que hace hoy `appendCambioEstado` con una entrada ilegal y lo que la ficha señala como
problema ya vivido en el repo. Con 247 órdenes y el escáner activo en paralelo, una sola orden
recibida por la tienda bloquearía el cierre de todas. El `WHERE` con estado + reporte por orden
resuelve lo mismo sin el bloqueo.

## 3. Mapa R → test

| R | Test (archivo) | Tipo |
|---|---|---|
| R1, R2 | `tests/unit/services/devolucion-tienda-service.test.ts` (5 roles; espía de storage y repo: 0 llamadas en `forbidden`) | unit |
| R3, R4, R5 | `tests/unit/types/devolucion-tienda-schema.test.ts` + casos en el service test (sin subida) | unit |
| R6, R7, R9, R10 | `tests/integration/db/419/confirmar-entrega-lote-sql-real.test.ts` (lote con 1 elegible + 1 `ya_devuelta` + 1 `estado_invalido` + 1 `tienda_distinta` + 1 borrada; asserts sobre `orden`, `orden_historial_estado`, `devolucion_tienda_orden`) | integración (WHERE real) |
| R8 | mismo archivo: dos `confirmarEntregaLote` concurrentes sobre la misma orden + `recibirEnOrigen` vs lote → 1 fila de historial, 1 enlace | integración |
| R11, R13 | mismo archivo: lote sin elegibles → 0 filas en las 3 tablas; `Proxy` que hace fallar el paso 6 → 0 transiciones (patrón 362) | integración |
| R11, R12, R13 (compensación de archivos) | service test con `IFileStorage` doble: `remove` con exactamente los paths subidos | unit |
| R14 | `tests/integration/db/419/confirmar-entrega-webhook-sql-real.test.ts`: dueño `apiKey` con suscripción activa → 1 job `webhook_estado` por transicionada, 0 por no transicionada | integración |
| R15 | `tests/integration/db/419/confirmar-entrega-sin-dinero-sql-real.test.ts`: conteos de las 5 tablas de dinero idénticos antes/después | integración |
| R16 | existentes `tests/unit/services/recepcion-origen-service.test.ts`, `tests/unit/actions/recepcion-origen-action.test.ts`, `tests/components/EscanerRecepcionOrigen.test.tsx`, `tests/integration/db/devolucion-rechazadas-flow.test.ts`: verdes sin modificar | regresión |
| R17, R21 | `tests/components/OrdenesListado.confirmar-entrega-419.test.tsx` (acción presente con `accionesLote`, ausente sin él; conteo en selección mixta) | componente |
| R18, R19, R20 | `tests/components/ConfirmarEntregaTiendaModal.test.tsx` | componente |
| R22 | `tests/unit/actions/ver-comprobante-devolucion-tienda.test.ts` (rol ajeno y orden sin enlace → mismo `no_encontrado`) | unit |
| R23 | service test: ruta con regex `^devolucion-tienda/[0-9a-f-]{36}\.(jpg|png|webp)$` y ausencia de `storagePath` en todo resultado serializado | unit |
| R24 | `tests/unit/domain/order-status-transiciones.guardia.test.ts` (existente, verde) + aserción nueva: `rol` de #28 contiene `adminTienda` y `maestro/admin` | unit |

Cada test nuevo se mata con una mutación antes de darlo por bueno (quitar `"estatus_id" =
:devolviendo` del `WHERE`, quitar el `throw SinTransiciones`, cambiar `esAccesoTotal` por
`true`): memoria del repo, los tests de servicio con dobles no ven el SQL.
