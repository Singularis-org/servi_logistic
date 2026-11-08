# SLT-94 — fulfillment-cobro-por-paquete · tasks.md

> Orden: T0 → base (T1) → backend (T2, T3, T4 en paralelo tras T1) → pantalla (T5) → guardias y E2E
> (T6) → cierre (T7). `[P]` = paralelizable con sus hermanas del mismo bloque. Antes del primer gate:
> copiar `.env` al worktree y exportar la base desechable (memoria «worktree sin .env», «vitest
> related toca la base local»).

## T0 — Medición (la hace el humano)

- [ ] **T0.1** Correr las consultas de `design.md > §9` en producción (solo lectura) justo antes del
  merge y anotar el resultado en `progress/features/SLT-94.md`.
  *Hecho:* T0.1 = 0 y T0.5 = 0 filas, o Carlos confirma por escrito los cobros que T0.5 anuncia.

## T1 — Base de datos (backend_dev)

- [x] **T1.1** M1 `20261108120000_slt94_fulfillment_enums` + `down.sql` (función dinámica copiada de
  SLT-73, renombrada `_slt94`). *Hecho:* `db:migrate` y `db:rollback` de M1 en la base desechable sin
  error; `pg_enum` tiene y luego no tiene los 10 valores.
- [x] **T1.2** M2 `20261108120100_slt94_se_recoge_en_tienda` + `down.sql` (copia a la vieja antes del
  DROP). *Hecho:* test de integración R2/R35 verde (backfill = NOT fulfillment; ida y vuelta conserva un
  cambio hecho a la nueva).
- [x] **T1.3** M3 `20261108120200_slt94_fulfillment_movimiento` + `down.sql`: enum, tabla, índices, RLS,
  REVOKE, misma empresa (`scripts/generar-misma-empresa.ts --faltantes`), los dos CHECK tipo↔categoría
  desde su definición vigente, CHECK `NOT VALID` de `tarifa_valor`. Modelo Prisma
  `OrdenFulfillmentMovimiento`, campo `seRecogeEnTienda` y rename `fulfillmentRetirado`
  (`@map("fulfillment")`). *Hecho:* `prisma migrate diff` vacío contra la base migrada; test de
  integración del CHECK (R12) rojo si se quita el CHECK.
- [x] **T1.4** M4 `20261108120300_slt94_fulfillment_triggers` + `down.sql` (design §1 M4). Dep: T1.3.
  *Hecho:* `tests/integration/db/slt94-fulfillment-cobro.test.ts` verde, con un caso por R15, R16,
  R17, R18, R19, R21, R22, R23 (carga parcial con `skipDuplicates`), R24 (rollback), R26, R27, R28,
  R29, R31, R34 y R38 (dos empresas); y `tests/integration/db/slt94-fulfillment-cancelacion-api.test.ts`
  verde llamando a `OrdenRepository.cancelarViaApi` real: R30 (cancelar devuelve una vez, en la misma
  tx: si la tx revierte no queda reverso), R39 (cancelar → eliminar: una sola devolución; cancelar →
  eliminar → restaurar: sin re-cobro; eliminar → restaurar → cancelar: cargo, reverso, cargo, reverso),
  y que una devolución real a `devolviendo_a_tienda` por `ajuste_estado` (#42) NO devuelve; y
  `slt94-iva-equivalencia.test.ts` (SQL vs `ivaDe` en bordes
  …,005) verde. Cada test se mata con una mutación del trigger antes de darlo por bueno (memoria «test
  verde sin datos»).
- [x] **T1.5** Prueba de ida y vuelta de las cuatro migraciones
  (`tests/integration/db/migracion-slt94-ida-y-vuelta.test.ts`, molde `migracion-sl40-ida-y-vuelta`).
  Dep: T1.4. *Hecho:* verde, y el `down` de M3 solo borra filas con origen `orden_fulfillment`.

## T2 — Marca «se recoge en tienda» (backend_dev) [P]

- [x] **T2.1** `OrdenRepository.findUsuarioSeRecogeEnTienda` (+ interfaz) en lugar de
  `findUsuarioFulfillment`. *Hecho:* test unitario del repo actualizado.
- [x] **T2.2** `BulkOrdenService`: `cargarMasiva` y `cargarViaApi` deciden con
  `resolverDestinoCreacion(!seRecogeEnTienda)` de la tienda dueña; se retira `tieneFulfillment` (y sus
  casos de test) y el reparto por destino según tarifa. *Hecho:* R5/R6 cubiertos en
  `bulk-orden-service.test.ts` y `bulk-orden-service.carga-api.test.ts` (tienda con valor > 0 y marca
  «sí» nace en `por_recolectar_en_tienda`; marca «no» sin valor nace en `en_preparacion`).
- [x] **T2.3** `UsuarioService.resolverSeRecogeEnTienda` + `UserRepository` + `lib/types/usuario.ts` +
  `IUserRepository`; historial `usuario_se_recoge_en_tienda_cambiado` en `lib/types/historial-accion.ts`.
  *Hecho:* R3, R4, R8 en `usuario-service.test.ts` y `user-repository.crud.test.ts`;
  `historial-accion-escrituras-cubiertas.guardia` verde.
- [x] **T2.4** `PickingRepository` (+ interfaz) con `se_recoge_en_tienda = false`. *Hecho:* R7 en
  `tests/integration/db/picking-ordenes-en-preparacion.test.ts` y `picking-resumen-tiendas.test.ts`.
- [x] **T2.5** `scripts/demo-qa/receta.ts` y `tests/fabricas/empresa-y-usuarios.ts` con la marca nueva.
  *Hecho:* typecheck verde.

## T3 — Valor de fulfillment solo propio y en monto (backend_dev) [P]

- [x] **T3.1** `lib/tarifas/niveles.ts` (R10) y `TarifaValorService` / `escrituraValorSchema` (R11).
  *Hecho:* casos nuevos en `tests/unit/tarifas/niveles.test.ts` y `tarifa-valor-service.test.ts`.
- [x] **T3.2** `lib/tarifas/precedencia.ts` y `lib/repositories/_shared/resolver-tarifas.ts` ignoran el
  fulfillment de otro nivel o en % (R14, R33). *Hecho:* `tests/unit/tarifas/precedencia.test.ts` y
  `tests/integration/db/tarifas-flexibles-resolver.test.ts` con una fila de zona y una en % que no
  resuelven; `cotizacion-orden-service.test.ts` sigue verde.

## T4 — Libros, rótulos y analítica (backend_dev) [P]

- [x] **T4.1** Registros de `design.md > §4` en `lib/` (`wallet.ts`, `wallet-tienda.ts`,
  `invariante-tiendas.ts`, `caja-tesoreria.ts`, `aporte-por-orden.ts`, `wallet-rotulos.ts`,
  `estado-cuenta*.ts`, `desglose-tienda.ts`, `efecto-movimiento.ts`, `OrigenLegibleService.ts`,
  `metrics.ts`). *Hecho:* typecheck verde; `caja-clasificacion-459.guardia`, guardias de métricas y
  `fulfillment-fuera-de-la-formula.guardia` verdes; test de R20/R37 en
  `tests/unit/utils/slt94-fulfillment-caja.test.ts` (ganancia sube monto, IVA sube IVA, «Entró» no
  cambia, «De las tiendas» = suma de saldos).
- [x] **T4.2** `OrigenLegibleService`: `orden_fulfillment` → «Orden» + guía/remisión (R36). *Hecho:*
  test unitario del servicio.

## T5 — Pantallas (frontend_dev). Dep: T2.3, T3.1, T4.1

- [x] **T5.1** `UsuarioForm.tsx`: switch «Se recoge en tienda», solo `adminTienda` (R9). *Hecho:*
  `tests/unit/components/usuario-form.test.tsx` actualizado.
- [x] **T5.2** Tarifas: fulfillment solo en el precio propio de la tienda, sin selector de modo, con
  IVA; fuera de zona y grupo (R13). *Hecho:* test de componente
  `tests/components/TarifasFulfillmentSoloTienda.test.tsx`.
- [x] **T5.3** Rótulos de wallet en `app/` (`mi-wallet-labels.ts`, `desglose-tienda-labels.ts`,
  `ComposicionGananciaCard.tsx`) (R36, R37). *Hecho:* typecheck verde y test de componente de la fila
  «Fulfillment» en la composición.

## T6 — Guardias y E2E. Dep: T1–T5

- [x] **T6.1** `tests/unit/guards/fulfillment-solo-al-crear.guardia.test.ts` (design §5, con
  autocomprobación), más R40: `TRANSICIONES.devolviendo_a_tienda` es exactamente
  `[devuelta_a_tienda]` y `"cancelacion_api"` como `origenTipo` solo aparece en
  `OrdenRepository.cancelarViaApi`. *Hecho:* verde, y rojo con cada material sintético que infringe.
- [x] **T6.2** `e2e/fulfillment-cobro-por-paquete.spec.ts`: empresa activada, tienda con fulfillment
  1 000 + 13 % (escritos a mano), carga una orden → Mi wallet y estado de cuenta muestran «Fulfillment»
  1 000,00 e «IVA del fulfillment» 130,00 y el disponible baja 1 130,00; elimina la orden → aparecen las
  dos devoluciones y el disponible vuelve. Correr también `e2e/dos-empresas-humo.spec.ts`. *Hecho:*
  los dos verdes en local.

## T7 — Cierre

- [x] **T7.1** `./init.sh` verde en el worktree, mapa `R<n> → test` en `progress/impl_SLT-94.md` (R1–R40,
  sin huecos). *Hecho:* reviewer OK.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261108120000_slt94_fulfillment_enums/migration.sql`
- `db/migrations/20261108120000_slt94_fulfillment_enums/down.sql`
- `db/migrations/20261108120100_slt94_se_recoge_en_tienda/migration.sql`
- `db/migrations/20261108120100_slt94_se_recoge_en_tienda/down.sql`
- `db/migrations/20261108120200_slt94_fulfillment_movimiento/migration.sql`
- `db/migrations/20261108120200_slt94_fulfillment_movimiento/down.sql`
- `db/migrations/20261108120300_slt94_fulfillment_triggers/migration.sql`
- `db/migrations/20261108120300_slt94_fulfillment_triggers/down.sql`
- `lib/services/destino-creacion.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/UsuarioService.ts`
- `lib/services/TarifaValorService.ts`
- `lib/services/OrigenLegibleService.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/UserRepository.ts`
- `lib/repositories/PickingRepository.ts`
- `lib/repositories/_shared/resolver-tarifas.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/interfaces/repositories/IUserRepository.ts`
- `lib/interfaces/repositories/IPickingRepository.ts`
- `lib/tarifas/niveles.ts`
- `lib/tarifas/precedencia.ts`
- `lib/types/usuario.ts`
- `lib/types/tarifa-flexible.ts`
- `lib/types/historial-accion.ts`
- `lib/types/wallet.ts`
- `lib/types/wallet-tienda.ts`
- `lib/utils/ingreso-empresa.ts`
- `lib/utils/invariante-tiendas.ts`
- `lib/utils/caja-tesoreria.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/estado-cuenta-chips.ts`
- `lib/utils/estado-cuenta.ts`
- `lib/utils/desglose-tienda.ts`
- `lib/utils/efecto-movimiento.ts`
- `lib/constants/wallet-rotulos.ts`
- `lib/analytics/metrics.ts`
- `app/(app)/configuracion/_components/UsuarioForm.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasValores.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasTiendas.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts`
- `app/(app)/mi-wallet/_components/mi-wallet-labels.ts`
- `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts`
- `app/(app)/wallet/_components/ComposicionGananciaCard.tsx`
- `scripts/demo-qa/receta.ts`
- `tests/fabricas/empresa-y-usuarios.ts`
- `tests/integration/db/slt94-fulfillment-cobro.test.ts`
- `tests/integration/db/slt94-fulfillment-cancelacion-api.test.ts`
- `tests/integration/db/slt94-iva-equivalencia.test.ts`
- `tests/integration/db/migracion-slt94-ida-y-vuelta.test.ts`
- `tests/integration/db/picking-ordenes-en-preparacion.test.ts`
- `tests/integration/db/picking-resumen-tiendas.test.ts`
- `tests/integration/db/tarifas-flexibles-resolver.test.ts`
- `tests/unit/guards/fulfillment-solo-al-crear.guardia.test.ts`
- `tests/unit/utils/slt94-fulfillment-caja.test.ts`
- `tests/unit/utils/ingreso-ordenex.test.ts`
- `tests/unit/utils/ingreso-empresa-modelo-nuevo.test.ts`
- `tests/unit/services/destino-creacion.test.ts`
- `tests/unit/services/bulk-orden-service.test.ts`
- `tests/unit/services/bulk-orden-service.carga-api.test.ts`
- `tests/unit/services/usuario-service.test.ts`
- `tests/unit/repositories/user-repository.crud.test.ts`
- `tests/unit/repositories/orden-repository.test.ts`
- `tests/unit/tarifas/niveles.test.ts`
- `tests/unit/services/tarifa-valor-service.test.ts`
- `tests/unit/services/origen-legible-service.test.ts`
- `tests/unit/tarifas/precedencia.test.ts`
- `tests/unit/components/usuario-form.test.tsx`
- `tests/components/TarifasFulfillmentSoloTienda.test.tsx`
- `e2e/fulfillment-cobro-por-paquete.spec.ts`
