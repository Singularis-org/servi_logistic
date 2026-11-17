# SLT-197 «Retirar paquetes de una bodega satélite a la central» — tasks

> Requisitos: R970–R986 (`requirements.md`), aprobados por Carlos el 2026-11-17 con D1–D9 (D8: sin
> trabajo de API). Diseño: `design.md`. **Sin migración.** Antes del primer
> gate, copiar `.env` al worktree (sin él el gate sale verde saltándose la integración). Exportar la
> base desechable antes de cualquier `vitest`. Literales de los tests escritos a mano (nunca comparados
> contra su propia fuente). Nada de webhooks, API ni documentación de API (D8).

## T1 — Dominio: la arista #73 (backend_dev)

- [x] **T1.1** Arista `en_bodega_satelite -> en_ruta_bodega_central` (`via: "ajuste_estado"`, `rol:
  "maestro/admin"`, comentario `// #73 (SLT-197)`) en `TRANSICIONES`. Fila #73 en
  `tests/fixtures/inventario-transiciones-140.ts` con su call-site (`OrdenRepository.retirarSateliteLote`)
  y `RECUENTO_INVENTARIO` a 60 aristas / 55 pares, con la línea de historia.
  **Hecho:** `order-status-transiciones.guardia.test.ts` y `.connectividad.test.ts` verdes; caso nuevo
  R970 que afirma que `en_bodega_satelite -> en_bodega_central` y `en_ruta_bodega_central ->
  en_bodega_satelite` siguen ilegales;
  `tests/unit/utils/estados-bodega-satelite.test.ts` verde **sin tocarlo** (el alcance no cambia).
  Va en el mismo commit que T2.1 (una arista no entra sin su productor).

## T2 — Repositorio (backend_dev; con T1)

- [x] **T2.1** `retirarSateliteLote(ordenIds, destinoEstatusId, historial): Promise<"ok" | "conflicto">`
  en `OrdenRepository` e `IOrdenRepository` (design §4.1): lectura y `updateMany` con el mismo `where`
  (ids ∧ no borrada ∧ `en_bodega_satelite`), conteo exacto o rollback, `mensajeroAsignadoId`/`asignadoAt`/
  `fechaReparto` a null, `appendCambioEstado` por orden. Punto #35 en el mapa de
  `tests/unit/repositories/orden-historial-cobertura.test.ts` (34 → 35).
  **Hecho:** typecheck verde; `orden-historial-cobertura.test.ts` verde.
- [x] **T2.2** `tests/integration/db/retiro-satelite-central.int.test.ts`, contra Postgres real, con
  órdenes de dos zonas satélite y una de la central:
  - R971/R972/R985: lote de dos zonas → `en_ruta_bodega_central`, historial (origen, destino, actor,
    `ajuste_estado`), mensajero/asignado/día en null, zona/tienda/guía/remisión/monto intactos.
  - R973/R974: lote con una orden en `mensajero_recogiendo_en_bodega` → `"conflicto"`, cero filas
    cambiadas, cero historial.
  - R977: `RecepcionBodegaCentralService` sobre el repo real → `en_bodega_central`,
    `recepcion_bodega_central`, misma zona.
  - R978: `rutearABodegaSatelite` la acepta; `asignarBodega` la rechaza con «orden de zona no-GAM».
  - R979: `findRecepcionSatelitePaginada` de su zona no la devuelve, ni en tránsito ni recibida.
  - R983: conteos de `wallet_*`, `cierre_*`, cobros y pagos iguales antes y después.
  - R986: `ZonaRepository.update` que pasa su distrito a otra zona le cambia la zona y no la cuenta en
    `ordenesRetenidasEnBodegaSatelite`; una vecina que sigue en el estante sí se cuenta.
  **Hecho:** verde contra Postgres real; mutación de control (quitar `estatus` del `where` del
  `updateMany`) pone rojo el caso R973/R974, anotada en `progress/impl_SLT-197.md`.

## T3 — Servicio (backend_dev; depende de T2.1)

- [x] **T3.1** `retirarABodegaCentral` en `GuiaAsignacionService` + firma en `IGuiaAsignacionService`;
  tipos `retirarSateliteSchema`, `RetirarSateliteResult`, `RetirarSateliteResultadoItem` en
  `lib/types/orden-guia.ts` (design §4.2/§4.4).
  **Hecho:** `tests/unit/services/guia-asignacion-retiro-satelite.test.ts` verde con dobles: R975
  (adminSatelite, adminTienda, mensajero → `forbidden` sin llamar al repo), R973 (detalle por motivo,
  sin escribir), R974 (`"conflicto"` del repo → `conflict`), R985 (dos zonas → `ok`), R971 (llama al repo
  con `ajuste_estado` y el actor).

## T4 — Action (backend_dev; depende de T3)

- [x] **T4.1** `retirarABodegaCentral` en `lib/actions/ordenes-guia.ts`, calco de
  `rutearABodegaSatelite`.
  **Hecho:** casos R976 (sin sesión, `ordenIds: []`, `ordenIds` no string) y un `ok` en
  `tests/integration/actions/ordenes-guia-action.test.ts`.

## T5 — Manifiesto (backend_dev; [P] con T3)

- [x] **T5.1** `"retiro_satelite"` en `MANIFIESTO_FLUJOS` y su `case` en `ManifiestoService`
  (`origen: zona`, `destino: ctx.central`, `responsable: ctx.actor`).
  **Hecho:** R982 verde en `tests/unit/services/manifiesto-service.test.ts` con literales.

## T6 — Pantalla (frontend_dev; depende de T4 y T5)

- [x] **T6.1** `RetirarACentralModal.tsx` (calco de `RutearSateliteModal`: confirmación con el número,
  una llamada, toast, fase resultado con `ManifiestoResultado flujo="retiro_satelite"`, error al canal
  del `Modal` con `guiaDecisionErrorMessage`).
  **Hecho:** R981 verde en `tests/components/RetirarACentralModal.test.tsx` (ok, conflict, forbidden;
  una sola llamada a la action; `onSuccess` solo al cerrar).
- [x] **T6.2** `case "en_bodega_satelite"` en `accionesDe` con «Retirar a bodega central»,
  `abrirRetirarCentral` (pasa solo las seleccionadas en `en_bodega_satelite`) y el montaje del modal en
  `OrdenesListado.tsx`.
  **Hecho:** R980 verde en `tests/components/OrdenesRetirarACentral.test.tsx` (la acción sale en
  `en_bodega_satelite`, no sale en `en_bodega_central` ni en `en_ruta_bodega_central`, no sale sin
  `accionesLote`); `superficie-de-uso.guardia` verde (la action tiene consumidor).

## T7 — Textos y ayuda ([P] con T6)

- [x] **T7.1** `DESCRIPCION_ESTADO.en_ruta_bodega_central` = «El paquete va camino a la bodega
  central.» y el mismo literal en `docs/ayuda/publico/rastreo-de-paquete.md`. La guía de integración
  de la API no se toca (D8).
  **Hecho:** R984 verde en `tests/unit/types/order-status.test.ts` (literal a mano);
  `rastreo-hitos-exhaustivo.guardia` verde.
- [x] **T7.2** Ayuda: `docs/ayuda/oficina/ordenes.md` (la acción, cuándo usarla, que se recibe con el
  escáner y se vuelve a rutear) y `docs/ayuda/satelite/en-bodega.md` (la central puede retirar lo del
  estante y entonces desaparece del listado); fecha `actualizado` y `fuentes` al día.
  **Hecho:** `ayuda-pantalla-ruta-existe`, `ayuda-md-viajan-a-produccion` y `docs-marca-heredada`
  verdes.

## T8 — E2E (depende de T6)

- [x] **T8.1** `e2e/retiro-satelite-central.spec.ts`: maestro en `/ordenes` filtra «En bodega
  satélite», retira dos órdenes, ve «En ruta a bodega central», las recibe con el escáner de la central,
  quedan «En bodega central» y «Rutear a bodega satélite» las acepta. Espera condiciones, nunca
  `waitForTimeout`.
  **Hecho:** verde en local contra base desechable nueva + build (`docs/perfil-agentes.md > E2E en
  local`), junto con `e2e/recepcion-satelite.spec.ts` y `e2e/asignacion-satelite.spec.ts`.

## T9 — Cierre (depende de todo)

- [ ] **T9.1** `./init.sh` verde; `pnpm run test:guardias` verde; mapa `R<n> -> test` completo en
  `progress/impl_SLT-197.md` (R970–R986, ninguno sin test).

## Archivos esperados

- `lib/types/order-status-transiciones.ts`
- `lib/types/order-status.ts`
- `lib/types/orden-guia.ts`
- `lib/types/manifiesto.ts`
- `lib/interfaces/services/IGuiaAsignacionService.ts`
- `lib/services/GuiaAsignacionService.ts`
- `lib/services/ManifiestoService.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/actions/ordenes-guia.ts`
- `app/(app)/ordenes/_components/RetirarACentralModal.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `docs/ayuda/oficina/ordenes.md`
- `docs/ayuda/satelite/en-bodega.md`
- `docs/ayuda/publico/rastreo-de-paquete.md`
- `tests/fixtures/inventario-transiciones-140.ts`
- `tests/unit/domain/order-status-transiciones.guardia.test.ts`
- `tests/unit/repositories/orden-historial-cobertura.test.ts`
- `tests/unit/services/guia-asignacion-retiro-satelite.test.ts`
- `tests/unit/services/manifiesto-service.test.ts`
- `tests/unit/types/order-status.test.ts`
- `tests/integration/db/retiro-satelite-central.int.test.ts`
- `tests/integration/actions/ordenes-guia-action.test.ts`
- `tests/components/RetirarACentralModal.test.tsx`
- `tests/components/OrdenesRetirarACentral.test.tsx`
- `e2e/retiro-satelite-central.spec.ts`
- `progress/impl_SLT-197.md`

## Tamaño

26 archivos que cuentan (15 de producción y docs, 11 de tests) de 40: 65 %, por debajo del aviso del
80 %. Líneas estimadas: ~350 de producción (tope 1000) y ~900 de tests (tope 3000). `progress/` y
`specs/` no cuentan.
