# SL-45 «Pago a la plataforma desde la wallet» — tasks

> **Aprobado por Carlos Restrepo el 2026-10-24.**
> - P1/D4: el sobrepago se rechaza (R9, R10 como están).
> - **P2 = SÍ:** R28 entra. En «Empresas», el superadmin ve una columna con lo que debe cada empresa y
>   lo que ha pagado. La tanda E se hace.
> - El resto, como está en el spec.
>
> Orden: T0 → T1 → T2 → T3 → (T4 ∥ T5) → T6 → E1 → (T7 ∥ T8) → T9 → T10.
> `[P]` = paralelizable con las otras `[P]` de su tanda.
> Cada task cierra con `pnpm exec vitest related --run <archivos tocados>` en verde, salvo donde se dice
> que debe estar en rojo. Un commit por task (`docs/conventions.md`).

## Tanda 0 — Punto de partida

- [x] **T0. Leer el estado de `dev`** (sin código).
  - La última migración de `dev`. Si hay alguna posterior a `20261024120000`, se mueven los dos
    timestamps de `design.md > 8`.
  - La definición vigente de `wallet_movimiento_tipo_categoria_check`: la última migración que la
    reescribe (hoy `20260928120100_wallet_458_tablas`).
  - Dónde se exige hoy «a quién» en los egresos administrativos: el diálogo, `registrarEgresoConLateralesSchema`
    o el servicio.
  - Si el lector `egresos` de `LectoresDocumentosCaja` (`EgresoCajaDocumentosRepository`) cubre todo
    egreso con origen `gasto` o filtra por lista de categorías.
  - La forma de `WalletMovimientoRepository.crearMovimientoRegistrado`: dónde abre la transacción.
  - Los tests que fijan `TIPO_EGRESO_MANUAL_SEED`, los diez conceptos del catálogo o la lista de
    categorías propias.
  - _Hecho:_ los seis datos en `progress/impl_SL-45.md`. Si un archivo nuevo sale de ahí, se añade a
    `## Archivos esperados` antes de T1.

## Tanda A — El rojo primero y la base

- [x] **T1. El test que hoy falla** (R7–R9, R11, R13–R16, R18, R20–R22; depende de T0).
  - `tests/integration/db/pago-plataforma-sl45.test.ts` según `design.md > 12.1`, con el control de no
    vacuidad.
  - _Hecho:_ corre contra Postgres y sale **en rojo** porque la categoría no existe. La salida va pegada
    en `progress/impl_SL-45.md`. Un `skip` por falta de base no cuenta como rojo.
- [x] **T2. Migraciones y esquema** (R27; depende de T0).
  - `db/migrations/20261024130000_pago_plataforma_categoria/{migration,down}.sql` y
    `db/migrations/20261024130100_pago_plataforma_check/{migration,down}.sql` (`design.md > 8`).
  - `db/schema.prisma`: el valor `egreso_pago_plataforma`, con su comentario.
  - `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts`.
  - _Hecho:_
    - `pnpm run db:migrate` aplica limpio;
    - `tests/integration/db/schema-drift-saneamiento.test.ts` en verde;
    - el test de ida y vuelta en verde, con el caso «el `down` aborta con una fila»;
    - `pnpm run test:guardias` en verde.
- [x] **T3. La clasificación de la categoría** (R8, R23–R26; depende de T2).
  - `lib/types/wallet.ts`: `TIPO_EGRESO_MANUAL_SEED` y `TIPO_EGRESO_MANUAL_A_CATEGORIA` ganan
    `pago_plataforma`; `WALLET_EGRESO_NOMBRADO_SEED` gana `egreso_pago_plataforma`.
  - `lib/utils/caja-tesoreria.ts`: `propio` y `efectivo`.
  - `lib/constants/wallet-rotulos.ts`, `lib/utils/egreso-anulable.ts`, `lib/utils/aporte-por-orden.ts` y
    `lib/analytics/metrics.ts` (`design.md > 2`).
  - El resto de `Record` totales que pida el typecheck, anotados en `progress/impl_SL-45.md`.
  - Tests que se actualizan: `metrics-caja-naturaleza.guardia.test.ts`, `finanzas-diario.test.ts` y
    los que T0 encontró. Cada literal nuevo va escrito a mano y con su motivo.
  - _Hecho:_
    - `pnpm run typecheck` y las guardias en verde;
    - la mutación «`egreso_pago_plataforma` como `terceros`» pone en rojo al menos un test puro.

## Tanda B — Servidor (dependen de T3)

- [x] **T4. [P] La deuda con pagos** (R13, R14, R20).
  - `lib/interfaces/repositories/IPagoPlataformaRepository.ts` y `lib/repositories/PagoPlataformaRepository.ts`:
    `sumaPagosVigentes(cliente?)` y `bloquear(tx)`.
  - `CobroPlataformaMovimientoRepository.sumasPorTipo` y su interfaz aceptan un cliente opcional.
  - `lib/utils/deuda-plataforma.ts`: `derivarDeudaPlataforma(sumas, pagosVigentes)` y el
    `DeudaPlataformaDTO` nuevo, en `lib/types/cobro-plataforma.ts`.
  - `DeudaPlataformaService`, `IDeudaPlataformaService` y `lib/actions/deuda-plataforma.ts` (el
    composition root pasa el repositorio de pagos).
  - Tests: `tests/unit/utils/deuda-plataforma.test.ts`, `tests/unit/services/deuda-plataforma-service.test.ts`
    y `tests/unit/actions/deuda-plataforma.composition-root.test.ts`.
  - _Hecho:_
    - los tests en verde;
    - `tests/integration/db/deuda-plataforma-wallet.test.ts` (SL-40) sigue en verde;
    - la mutación «contar los pagos anulados» pone en rojo un test.
- [x] **T5. [P] El registro con tope** (R6, R7, R9–R12, R19).
  - `ITopePagoPlataformaService.ts` y `TopePagoPlataformaService.ts` (`design.md > 6`).
  - `WalletMovimientoRepository.crearMovimientoRegistrado` y su interfaz: el parámetro `antes`.
  - `WalletEgresoService` e `IWalletEgresoService`: el tope solo para `pago_plataforma`,
    `TopeSuperadoError` → `validation_error` en `monto`, y sin tope inyectado lanza.
  - «A quién» opcional para `pago_plataforma`, en el sitio que dijo T0.
  - `lib/actions/wallet-egresos.ts`: `buildService` pasa el tope.
  - Tests:
    - `tests/unit/services/tope-pago-plataforma-service.test.ts` (nuevo);
    - `tests/unit/services/wallet-egreso-service.test.ts`;
    - `tests/unit/actions/wallet-egresos.composition-root.test.ts` (nuevo);
    - `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts` (nuevo).
  - _Hecho:_
    - los tests en verde;
    - quitar el candado pone en rojo el de concurrencia;
    - no llamar al tope pone en rojo T1;
    - `tests/unit/actions/wallet-egresos-actions.test.ts` sigue en verde.
- [x] **T6. La anulación y el cierre del rojo** (R15–R18, R21–R23; depende de T4 y T5).
  - Si T0 dijo que el lector `egresos` filtra por lista, se le añade la categoría. Si no, no se toca
    código.
  - _Hecho:_
    - **T1 en verde**;
    - cada una de las cuatro mutaciones de `design.md > 12.1` lo pone en rojo (se prueba y se
      revierte);
    - `tests/integration/db/cobro-plataforma-cargos.test.ts` y `aislamiento-wallet.test.ts` en verde sin
      tocarlos;
    - la evidencia, con los números, en `progress/impl_SL-45.md`.

## Tanda C — Pantallas (`frontend_dev`; dependen de T6)

- [x] **T7. [P] El concepto en el diálogo** (R6).
  - `wallet-conceptos-manuales.ts`: el undécimo concepto, su frase y su clave de «Así queda».
  - `lib/types/efecto-movimiento.ts` y `lib/utils/efecto-movimiento.ts`: `pago_plataforma`.
  - `wallet-labels.ts`: `DESCRIPCION_EGRESO_LABEL` y `DESCRIPCION_EGRESO_PLACEHOLDER` de `pago_plataforma`.
  - `RegistrarMovimientoDialog.tsx`: solo si «a quién» o el `FormData` lo piden.
  - Tests: `tests/unit/components/wallet-conceptos-manuales.test.ts`, `tests/unit/utils/efecto-movimiento.test.ts`
    y `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`.
  - _Hecho:_ los tests en verde, con las frases literales escritas a mano.
- [ ] **T8. [P] La región de la deuda** (R1–R5, R14, R24).
  - `wallet-labels.ts`: los textos de los tres estados, y `rotulo` y `pista` como función.
  - `CajaResumenCard.tsx`: `accionDeudaPlataforma` y el `importe`.
  - `WalletModule.tsx`: la deuda como estado, el botón solo en «debe» y la recarga en `recargarTrasCambio`.
  - La fila de composición, si la pide un `Record` (`composicion-detalle-labels.ts`).
  - Tests:
    - `tests/components/WalletDeudaPlataformaSL45.test.tsx` (nuevo);
    - `tests/components/WalletDeudaPlataformaSL40.test.tsx` (pista nueva);
    - `tests/unit/components/wallet-labels.test.ts`;
    - `tests/integration/wallet-page.test.tsx`.
  - _Hecho:_
    - los tests en verde;
    - los de SL-39 (`WalletCajaIvaSL39.test.tsx`, `ComposicionGananciaCard.test.tsx`) siguen en verde
      sin tocarlos;
    - quitar la recarga de la deuda pone en rojo el caso R5;
    - **en el navegador**, con un solo dev server: A con dos órdenes a 500 paga 600, y la región pasa de
      1.000,00 a 400,00 sin recargar; luego lo anula y vuelve a 1.000,00. Los números medidos van en
      `progress/impl_SL-45.md`.
  - **Código y tests hechos (frontend_dev, 2026-10-24):** falta solo la comprobación en el navegador, que va en otra
    vuelta; por eso sigue sin `[x]`.

## Tanda D — Ayuda, E2E y cierre

- [ ] **T9. [P] Ayuda** (apoya R1–R3, R9, R15; depende de T8).
  - `docs/ayuda/oficina/wallet-caja.md` (`design.md > 7.4`) y `actualizado:`.
  - _Hecho:_ las guardias de ayuda en verde con `vitest related` sobre el archivo.
- [ ] **T10. E2E y cierre** (todos; depende de T1–T9).
  - `e2e/pago-plataforma-sl45.spec.ts` (`design.md > 12.4`) y la pista de `e2e/cobro-plataforma-sl40.spec.ts`.
  - En verde: `e2e/pago-plataforma-sl45.spec.ts`, `e2e/cobro-plataforma-sl40.spec.ts`, `e2e/wallet.spec.ts`
    y `e2e/dos-empresas-humo.spec.ts`, con `--reporter=list`, 0 skipped y una mutación que tumbe el
    nuevo.
  - No regresión: `tests/integration/db/libro-kardex-468.test.ts` y
    `tests/components/descarga/WalletDescarga.test.tsx` (R26).
  - El mapa `R<n> -> test`, de R1 a R27 (y R28 si P2 = sí), en `progress/impl_SL-45.md`.
  - _Hecho:_ `./init.sh` en verde, con `INIT_EXIT=0` escrito dentro del log.

## Tanda E — Solo si P2 = sí

- [x] **E1. La columna «Plataforma» en «Empresas»** (R28; depende de T4).
  - `EmpresasPlataformaRepository`, `lib/types/empresas-plataforma.ts`, `app/(app)/plataforma/empresas/page.tsx`
    y `EmpresasModule.tsx` (`design.md > 9`).
  - Tests: `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`, con dos empresas, y
    `tests/components/EmpresasModuleCobro.test.tsx`.
  - Antes de empezar, coordinar con SL-41: tiene en vuelo los dos archivos de la pantalla.
  - _Hecho:_ los tests en verde y el superadmin ve «Debe», «Al día» o «A favor» por empresa.
  - **Servidor hecho (backend_dev, 2026-10-24):** `EmpresaListada` gana `deudaPlataforma` y `pagadoPlataforma`
    (ampliación de Carlos: lo que ha pagado) y `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts` está
    en verde. Falta la pantalla (`page.tsx`, `EmpresasModule.tsx`, `EmpresasModuleCobro.test.tsx`): frontend_dev.
  - **Pantalla hecha (frontend_dev, 2026-10-24):** la columna «Plataforma» en `EmpresasModule.tsx`, justo después de «Cobro
    por orden» («Debe …», «Al día», «A favor …» y «Pagado …»). `page.tsx` no cambia.

## Archivos esperados

Migraciones y esquema:
- `db/schema.prisma`
- `db/migrations/20261024130000_pago_plataforma_categoria/migration.sql`
- `db/migrations/20261024130000_pago_plataforma_categoria/down.sql`
- `db/migrations/20261024130100_pago_plataforma_check/migration.sql`
- `db/migrations/20261024130100_pago_plataforma_check/down.sql`

Código de servidor:
- `lib/types/wallet.ts`
- `lib/types/wallet-laterales.ts`
- `lib/types/cobro-plataforma.ts`
- `lib/types/efecto-movimiento.ts`
- `lib/utils/caja-tesoreria.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/egreso-anulable.ts`
- `lib/utils/efecto-movimiento.ts`
- `lib/utils/deuda-plataforma.ts`
- `lib/constants/wallet-rotulos.ts`
- `lib/analytics/metrics.ts`
- `lib/interfaces/repositories/IPagoPlataformaRepository.ts`
- `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts`
- `lib/interfaces/repositories/IWalletMovimientoRepository.ts`
- `lib/interfaces/services/IDeudaPlataformaService.ts`
- `lib/interfaces/services/ITopePagoPlataformaService.ts`
- `lib/interfaces/services/IWalletEgresoService.ts`
- `lib/repositories/PagoPlataformaRepository.ts`
- `lib/repositories/CobroPlataformaMovimientoRepository.ts`
- `lib/repositories/WalletMovimientoRepository.ts`
- `lib/repositories/EgresoCajaDocumentosRepository.ts`
- `lib/services/DeudaPlataformaService.ts`
- `lib/services/TopePagoPlataformaService.ts`
- `lib/services/WalletEgresoService.ts`
- `lib/actions/deuda-plataforma.ts`
- `lib/actions/wallet-egresos.ts`

Pantallas:
- `app/(app)/wallet/page.tsx`
- `app/(app)/wallet/_components/WalletModule.tsx`
- `app/(app)/wallet/_components/CajaResumenCard.tsx`
- `app/(app)/wallet/_components/wallet-labels.ts`
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts`
- `app/(app)/wallet/_components/composicion-detalle-labels.ts`
- `components/shared/wallet/RegistrarMovimientoDialog.tsx`

Solo si P2 = sí (tanda E):
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/types/empresas-plataforma.ts`
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts`
- `tests/components/EmpresasModuleCobro.test.tsx`

Ayuda:
- `docs/ayuda/oficina/wallet-caja.md`

Tests nuevos:
- `tests/integration/db/pago-plataforma-sl45.test.ts`
- `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts`
- `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts`
- `tests/unit/services/tope-pago-plataforma-service.test.ts`
- `tests/unit/actions/wallet-egresos.composition-root.test.ts`
- `tests/components/WalletDeudaPlataformaSL45.test.tsx`
- `e2e/pago-plataforma-sl45.spec.ts`

Tests que cambian:
- `tests/unit/utils/deuda-plataforma.test.ts`
- `tests/unit/services/deuda-plataforma-service.test.ts`
- `tests/unit/actions/deuda-plataforma.composition-root.test.ts`
- `tests/unit/services/wallet-egreso-service.test.ts`
- `tests/unit/components/wallet-conceptos-manuales.test.ts`
- `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/unit/utils/efecto-movimiento.test.ts`
- `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts`
- `tests/unit/analytics/finanzas-diario.test.ts`
- `tests/unit/guards/egreso-indemnizacion-emisores.test.ts` (T0: fija `TIPO_EGRESO_MANUAL_SEED` con una regex)
- `tests/components/WalletDeudaPlataformaSL40.test.tsx`
- `tests/integration/wallet-page.test.tsx`
- `e2e/cobro-plataforma-sl40.spec.ts`

Tocados por T3 porque un `Record` total los obliga a compilar (detalle en `progress/impl_SL-45.md > T3`):
- `app/(app)/wallet/_components/DesgloseEgresosLista.tsx`
- `tests/integration/db/caja-459-migration.test.ts`
- `tests/integration/db/caja-tesoreria-migration.test.ts`
- `tests/unit/analytics/financiera-ingresos-repo.test.ts`
- `tests/unit/guards/caja-composicion-exhaustiva.guardia.test.ts`
- `tests/unit/services/wallet-egreso-service.test.ts` (ya listado)
- `tests/unit/utils/caja-derivacion-457.test.ts`
- `tests/unit/utils/caja-tesoreria.test.ts`
- `tests/unit/actions/wallet-actions.test.ts`
- `tests/unit/components/wallet-page-cobros-pendientes.test.tsx`
- `tests/components/{BusquedaPorGuia469,ComposicionGananciaCard,DetalleFilaComposicion,WalletCaja463,WalletCaja468,WalletCajaBarra467,WalletCajaIvaSL39,WalletFiltroAQuien458E,WalletLibroCaja458E}.test.tsx`
- `tests/components/descarga/WalletDescarga.test.tsx`

Estado:
- `progress/impl_SL-45.md`
