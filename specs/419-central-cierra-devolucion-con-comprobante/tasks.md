# 419 — Tasks

Zona `fullstack`: se secuencia **backend → frontend** (bloque B antes que F). Gate de cada bloque:
`./init.sh --rapido`; como hay migración y `db/schema.prisma`, se amplía solo con
`tests/integration/db`. Tras migrar en local: `prisma migrate deploy` + `prisma generate`.
Las guardias estructurales de `tests/unit/guards` que leen `lib/` con `fs` se corren a mano.

Leyenda: `[P]` = paralelizable con las demás `[P]` del mismo bloque. `dep:` = dependencias.

## Bloque B — backend

- [ ] **B1. Migración + schema** (dep: —)
  `db/migrations/<ts>_devolucion_tienda_comprobante_419/{migration.sql,down.sql}` y los tres
  modelos de design §D3 en `db/schema.prisma` (FKs RESTRICT, CHECK de `content_type` e `indice`,
  RLS sin policies).
  *Hecho:* `prisma migrate deploy` aplica en local; `down.sql` revierte y re-aplica limpio;
  `prisma migrate status` sin drift; `prisma generate` sin errores.

- [ ] **B2. [P] Catálogo #28** (dep: —)
  Metadato `rol` de #28 en `order-status-transiciones.ts` y `callSite` del fixture 140 (design D1).
  Aserción nueva de R24 en `tests/unit/domain/order-status-transiciones.guardia.test.ts`.
  *Hecho:* el test de inventario sigue verde con las mismas cifras; la aserción nueva falla si se
  revierte el `rol`.

- [ ] **B3. [P] Tipos y schema del borde** (dep: —)
  `lib/types/devolucion-tienda.ts`: `confirmarEntregaTiendaSchema` (reusa `evidenciasSchema`),
  `TOPE_ORDENES_POR_LOTE`, `DesenlaceOrden`, `ConfirmarEntregaTiendaResult`; prefijo
  `devolucion-tienda/` y función de ruta del objeto.
  *Hecho:* `tests/unit/types/devolucion-tienda-schema.test.ts` cubre R3/R4/R5 (0 archivos, tipo,
  vacío, >5 MB, >3 archivos, 0 órdenes, uuid mal formado, > tope, sin tienda).

- [ ] **B4. Interfaces** (dep: B3)
  `lib/interfaces/repositories/IDevolucionTiendaRepository.ts` y
  `lib/interfaces/services/IDevolucionTiendaService.ts`.
  *Hecho:* typecheck verde.

- [ ] **B5. Repositorio** (dep: B1, B4)
  `lib/repositories/DevolucionTiendaRepository.ts`: `confirmarEntregaLote` (design D4,
  `UPDATE ... RETURNING` + `appendCambioEstado` + enlaces, `SinTransiciones` revierte),
  `clasificarNoTransicionadas`, `evidenciasDeOrden` (para R22), `tiendaExiste`.
  *Hecho:* `tests/integration/db/419/confirmar-entrega-lote-sql-real.test.ts` verde contra
  Postgres (R6–R11, R13) y ROJO con cada mutación: sin guarda de estado, sin guarda de tienda, sin
  `deleted_at IS NULL`, sin `throw SinTransiciones`. Registrar la mutación y el rojo en la
  bitácora.

- [ ] **B6. [P] Webhook y dinero, contra Postgres** (dep: B5)
  `tests/integration/db/419/confirmar-entrega-webhook-sql-real.test.ts` (R14) y
  `.../confirmar-entrega-sin-dinero-sql-real.test.ts` (R15).
  *Hecho:* verdes; el de R14 se pone rojo si se pasa `emitir` no-op a `appendCambioEstado`; el de
  R15 verifica que la semilla SÍ tiene filas de dinero previas (no verde por tabla vacía).

- [ ] **B7. [P] Concurrencia** (dep: B5)
  Casos de R8 en el test de B5: dos lotes concurrentes y lote vs `OrdenRepository.recibirEnOrigen`.
  *Hecho:* exactamente 1 fila de historial y 1 enlace por orden en todas las intercalaciones; rojo
  si se quita la guarda de estado del `UPDATE`.

- [ ] **B8. Servicio** (dep: B4, B5)
  `lib/services/DevolucionTiendaService.ts` (design D5): rol → validación → catálogo → subida →
  repo → compensación → clasificación.
  *Hecho:* `tests/unit/services/devolucion-tienda-service.test.ts` verde: R1/R2 (5 roles; 0
  llamadas a storage/repo en `forbidden`), R11/R12/R13 (`remove` con exactamente los paths
  subidos), R23 (regex de ruta; ningún resultado serializado contiene `storage_path`).

- [ ] **B9. Server Actions** (dep: B8)
  `lib/actions/devolucion-tienda.ts`: `confirmarEntregaTienda(formData)` y
  `verComprobanteDevolucionTienda({ ordenId })` (design D6), composition root con
  `SupabaseFileStorage`/`SupabaseSignedUrlProvider` sobre `gestionConfig.EVIDENCIA_BUCKET`.
  *Hecho:* `tests/unit/actions/devolucion-tienda-action.test.ts` (sin sesión → `unauthenticated`;
  zod → `validation_error`) y `tests/unit/actions/ver-comprobante-devolucion-tienda.test.ts` (R22:
  rol ajeno y orden sin enlace devuelven el MISMO resultado). Test que comprueba que el composition
  root PASA el bucket de gestión (no solo que lo importa).

- [ ] **B10. Regresión del escáner** (dep: B2, B5)
  Correr aislados, sin modificarlos: `recepcion-origen-service.test.ts`,
  `recepcion-origen-action.test.ts`, `EscanerRecepcionOrigen.test.tsx`,
  `tests/integration/db/devolucion-rechazadas-flow.test.ts` (R16).
  *Hecho:* verdes; `git diff --stat` no toca `RecepcionOrigenService.ts`, `recepcion-origen.ts`,
  `OrdenRepository.recibirEnOrigen` ni `EscanerRecepcionOrigen.tsx`.

- [ ] **B11. Gate backend** (dep: B1–B10)
  `./init.sh --rapido` (ampliado con `tests/integration/db`) + guardias de `tests/unit/guards`
  relacionadas con transiciones/historial a mano. Bitácora `progress/impl_419_backend.md` con el
  mapa R→test y las mutaciones. COMMITEAR la bitácora.
  *Hecho:* verde, `INIT_EXIT=0` escrito dentro del log, `skipped` de `integration/db` = 0.

## Bloque F — frontend (dep: B11)

- [ ] **F1. Acción por lote** (dep: B11)
  `case "devolviendo_a_tienda"` en `accionesDe` (`OrdenesListado.tsx`), `abrirConfirmarEntrega`,
  nuevo valor de `modalAbierto`.
  *Hecho:* `tests/components/OrdenesListado.confirmar-entrega-419.test.tsx` verde: R17 (presente,
  conteo en selección mixta), R21 (ausente con `accionesLote=false`).

- [ ] **F2. Modal** (dep: F1)
  `app/(app)/ordenes/_components/ConfirmarEntregaTiendaModal.tsx`: tienda derivada, bloqueo por
  tiendas mezcladas (R18), `EvidenciasField` obligatorio (R19), resumen por desenlace con textos
  en lenguaje claro y refresco (R20).
  *Hecho:* `tests/components/ConfirmarEntregaTiendaModal.test.tsx` verde; los textos del resumen
  se afirman como LITERALES (no contra la función que los genera).

- [ ] **F3. [P] Ver comprobante en el historial** (dep: B9)
  Botón «Ver comprobante de entrega» en `HistorialOrdenSheet` para maestro/admin en
  `devuelta_a_tienda` (R22).
  *Hecho:* test de componente: botón visible solo con el rol y el estado; abre la URL firmada
  recibida.

- [ ] **F4. Verificación en la app** (dep: F1–F3)
  Con el dev server (uno solo): login admin, `/ordenes` filtrado a `devolviendo_a_tienda` y por
  tienda, subir foto, confirmar un lote con una orden ya devuelta mezclada; mirar el resumen, el
  historial y el comprobante. Login `adminSatelite`: la acción no aparece. Capturar la respuesta de
  la action, no el toast.
  *Hecho:* capturas/notas en `progress/impl_419_frontend.md`, commiteado.

- [ ] **F5. Gate frontend** (dep: F1–F4)
  `./init.sh --rapido`.
  *Hecho:* verde, `INIT_EXIT=0` en el log.

## Despliegue (fuera de esta ficha, recordatorio para la release)

- La migración B1 sale con la release `dev → prod` normal; el bucket `gestion-evidencias` ya
  existe en prod (no hay paso manual).
- Tras desplegar, medir en prod: `count(*)` de `devolviendo_a_tienda` antes/después del primer
  lote real y `devolucion_tienda_orden` = transiciones `devolviendo_a_tienda → devuelta_a_tienda`
  con actor maestro/admin.
