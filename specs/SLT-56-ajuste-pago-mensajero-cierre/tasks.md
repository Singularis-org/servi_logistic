# SLT-56 — ajuste-pago-mensajero-cierre · tasks.md

> Orden: T1 → T2 → (T3 ∥ T4) → T5 → T6 → T7 → T8 → T9 → T10. `[P]` = paralelizable con su
> hermana. Cada task cierra con `pnpm run typecheck` y los tests que nombra en verde.
> Q1/Q2 de `requirements.md` no bloquean: el diseño sigue la propuesta escrita.

## T1. Migración de la tabla de ajustes (R17)
- [x] `db/migrations/20261029120000_gestion_pago_mensajero_ajuste/migration.sql` + `down.sql`
      según `design.md §1.1/§1.3` (tabla, 3 CHECK, índices, FK, RLS + política, REVOKE UPDATE/DELETE,
      triggers misma-empresa con `scripts/generar-misma-empresa.ts --faltantes`).
- [x] Modelo `GestionPagoMensajeroAjuste` y relaciones en `db/schema.prisma`; clasificado en
      `lib/db/modelos-de-negocio.ts`.
- **Hecho:** `pnpm run db:migrate` y `pnpm run db:rollback` limpios; test de integración
  `tests/integration/db/gestion-pago-mensajero-ajuste-migration.test.ts` verde: rechaza
  `pago_nuevo < 0`, `pago_nuevo = pago_anterior`, motivo en blanco; `servi_app` no puede UPDATE ni
  DELETE; otra empresa no lee la fila; FK a otra empresa → `SL017`. Guardias
  `organizacion-en-modelos`, `fk-misma-empresa`, `rls-por-empresa` en verde.

## T2. Tipo de historial (R18)
- [x] `db/migrations/20261029120100_historial_accion_pago_mensajero_ajustado/` (`ADD VALUE` solo) +
      `down.sql` que recrea el enum sin el valor.
- [x] `lib/types/historial-accion.ts`: el tipo en «mueve dinero», etiqueta y comentario de su
      porqué; recuento de tipos actualizado.
- **Hecho:** `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` verde con el tipo nuevo;
  `tests/integration/db/historial-accion-pago-mensajero-ajustado-migration.test.ts` verifica up/down.

## T3. [P] Módulo puro de validación (R8, R9, R16)
- [x] `lib/utils/ajuste-pago-mensajero.ts`: `validarAjustePago(vigente, anterior, nuevo)` en
      `Prisma.Decimal`; devuelve `ok` | `sin_cambio` | `desfasado`.
- [x] Guardia `tests/unit/guards/ajuste-pago-mensajero-money-safe.guardia.test.ts` (patrón de
      `pago-mensajero-money-safe.guardia.test.ts`, con contraprueba) sobre ese módulo y sobre el
      método del repositorio de T5: ni `Number(`, ni `parseFloat(`, ni `.toNumber(`.
- **Hecho:** `tests/unit/utils/ajuste-pago-mensajero.test.ts` cubre `1500.00` vs `1500`, `0.01` de
  diferencia, vigente NULL → `desfasado`.

## T4. [P] Borde: schema y tipos (R7, R8)
- [x] `ajustarPagoMensajeroGestionSchema` en `lib/types/cierres-admin.ts` (reusar un schema de monto
      ≥ 0 existente si cuadra; `design.md §4.1`).
- [x] Tipos de resultado y `AjustePagoGestionDTO` en `lib/interfaces/services/ICierresAdminService.ts`;
      input/resultado del repo en `lib/interfaces/repositories/ICierresAdminRepository.ts`;
      `pagoMensajero` en `GestionEditableDelCierre`; `ajustesPago?` en `CierreDetalleGestion`
      (`lib/interfaces/services/ICierreDiaService.ts`).
- **Hecho:** `tests/unit/types/ajustar-pago-mensajero-schema.test.ts`: negativo, 3 decimales, 11
  dígitos, motivo en blanco y clave ajena (`.strict()`) → error.

## T5. Repositorio (R5, R9, R10, R12, R15, R17, R18)
Depende de T1–T4.
- [x] `findGestionEditableEnCierre` devuelve `pagoMensajero` (STRING).
- [x] `CierresAdminRepository.ajustarPagoMensajeroEnCierre` según `design.md §4.4`.
- **Hecho (integración con base real; los dobles no ven el WHERE):**
  `tests/integration/db/ajuste-pago-mensajero-cierre.int.test.ts`:
  - ajusta y deja `total_pago_mensajero` = suma; recaudo, `total_ingreso_bodega_rechazos` y el pago
    de las otras gestiones intactos; tarifa intacta (R10, R12);
  - cierre `aprobado` y `rechazado` → `conflict`, nada escrito (R5);
  - otro alcance (satélite ajena, central desde satélite) → `fuera_de_alcance` (R3);
  - `pagoAnterior` viejo → `conflict` (R9);
  - fallo forzado en el paso 3 → ni pago, ni rastro, ni historial (R17);
  - fila de rastro con actor, rol, anterior, nuevo, motivo, cierre; fila de `historial_accion` con
    el tipo nuevo, `monto = pagoNuevo` y sin motivo (R17, R18);
  - rechazar el cierre y re-solicitarlo conserva el pago ajustado (R15).
  Cada caso del sello se mata con una mutación del WHERE (quitar estado, alcance o `pagoAnterior`)
  antes de darlo por bueno.
- [x] La guardia del censo `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
      registra el método nuevo.

## T6. Service y action (R1–R9)
Depende de T5.
- [x] `CierresAdminService.ajustarPagoMensajeroGestion` (`design.md §4.3`) y la action
      `ajustarPagoMensajeroGestion` en `lib/actions/cierres-admin.ts`.
- [x] Registrar la action en `lib/modulos/reparto.ts` si la guardia `modulos-reparto` lo exige.
- **Hecho:** `tests/unit/services/cierres-admin-ajustar-pago.test.ts`: maestro y admin con destino
  central → ok (R1); adminSatelite en su zona → ok sin paso intermedio (R2); adminSatelite ajeno o
  sin zona → `no_encontrada` (R3); mensajero, tienda → `forbidden`, sin llamar al repo (R4); cierre
  no abierto → `conflict` (R5); resultados entregada/rechazada/devuelta/reprogramada/incidente → ok
  (R6); motivo en blanco → `validation_error.motivo` (R7); igual al vigente → `validation_error.pagoNuevo`
  (R8); desfasado → `conflict` (R9). `tests/unit/actions/cierres-admin-ajustar-pago.test.ts`: sin
  sesión → `unauthenticated` antes de parsear; forma inválida → `validation_error`.

## T7. Lectura con la marca (R19, R20)
Depende de T1, T4.
- [x] `GESTION_ADMIN_SELECT` + mapper con `ajustesPago`; `DETALLE_CIERRE_SELECT` de
      `CierresBodegaAdminRepository` con `gestionesAjustadas`.
- **Hecho:** `tests/integration/db/ajuste-pago-mensajero-lectura.int.test.ts`: el detalle de admin
  trae los ajustes en orden cronológico con nombre, rol, importes y motivo; el detalle del cierre de
  bodega trae `gestionesAjustadas` y los ajustes por gestión; la vista del mensajero no trae
  `ajustesPago` (Q2).

## T8. Pantalla (R11, R19, R20, R21)
Depende de T6, T7.
- [x] `AjustarPagoMensajeroDialog.tsx`; prop `puedeAjustarPagoMensajero` en `CierresAdminModule.tsx`
      calculada en `page.tsx`; badge «Ajustado» + lista en `cierre-detalle-shared.tsx`; badge «Con
      ajustes» en el detalle de bodega.
- **Hecho:** `tests/components/AjustarPagoMensajeroDialog.test.tsx` (envía `pagoAnterior`, bloquea
  sin motivo, pinta cada desenlace) y `tests/components/cierre-detalle-ajuste-badge.test.tsx`
  (badge solo con ajustes; lista con quién/cuándo/anterior/nuevo/motivo). Prop en falso o cierre
  `aprobado` → sin botón (R21).

## T9. E2E (R1, R2, R11, R13, R14, R19, R20)
Depende de T8.
- [ ] `e2e/ajuste-pago-mensajero-cierre.spec.ts`, con los helpers de `e2e/cierres-admin.spec.ts` y
      `e2e/cierre-bodega-satelite.spec.ts`:
  1. Central: un maestro abre un cierre `solicitado`, ajusta un rechazo de 0 a un valor con motivo,
     ve «Ajustado», el total de pago y «para la central» cambian sin recargar; aprueba; el estado de
     cuenta del mensajero muestra el devengo con el total ajustado (R1, R11, R13, R19).
  2. Satélite: un adminSatelite ajusta una gestión de su cierre y lo aprueba; se consolida el
     cierre de bodega; la central lo ve «Con ajustes», con la gestión marcada y el total de pago
     ajustado (R2, R14, R20).
- **Hecho:** `pnpm exec playwright test e2e/ajuste-pago-mensajero-cierre.spec.ts` verde; también
  `e2e/cierres-admin.spec.ts`, `e2e/cierre-bodega-satelite.spec.ts` y `e2e/dos-empresas-humo.spec.ts`.

## T10. Cierre
- [ ] `./init.sh` verde. Mapa `R<n> → test` en `progress/impl_SLT-56.md`. Fila de la tabla en
      `docs/architecture.md > Multi-empresa` solo si alguna guardia pide nombrar la tabla nueva.

## Archivos esperados

- `db/migrations/20261029120000_gestion_pago_mensajero_ajuste/migration.sql`
- `db/migrations/20261029120000_gestion_pago_mensajero_ajuste/down.sql`
- `db/migrations/20261029120100_historial_accion_pago_mensajero_ajustado/migration.sql`
- `db/migrations/20261029120100_historial_accion_pago_mensajero_ajustado/down.sql`
- `db/schema.prisma`
- `lib/db/modelos-de-negocio.ts`
- `lib/types/historial-accion.ts`
- `lib/types/cierres-admin.ts`
- `lib/utils/ajuste-pago-mensajero.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/services/CierresAdminService.ts`
- `lib/actions/cierres-admin.ts`
- `lib/modulos/reparto.ts`
- `app/(app)/cierres-admin/page.tsx`
- `app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `tests/integration/db/gestion-pago-mensajero-ajuste-migration.test.ts`
- `tests/integration/db/historial-accion-pago-mensajero-ajustado-migration.test.ts`
- `tests/integration/db/ajuste-pago-mensajero-cierre.int.test.ts`
- `tests/integration/db/ajuste-pago-mensajero-lectura.int.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/ajuste-pago-mensajero-money-safe.guardia.test.ts`
- `tests/unit/utils/ajuste-pago-mensajero.test.ts`
- `tests/unit/types/ajustar-pago-mensajero-schema.test.ts`
- `tests/unit/services/cierres-admin-ajustar-pago.test.ts`
- `tests/unit/actions/cierres-admin-ajustar-pago.test.ts`
- `tests/components/AjustarPagoMensajeroDialog.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `progress/impl_SLT-56.md`
