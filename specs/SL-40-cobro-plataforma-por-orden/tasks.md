# SL-40 «Cobro de la plataforma por orden» — tasks

> **Aprobado por Carlos Restrepo el 2026-10-23** (spec en `c882260`). Decisiones de las preguntas
> abiertas, las tres en línea con la recomendación del spec, así que T2–T4 no se rehacen:
> - **P1:** el importe se congela al crear la orden (R14).
> - **P2:** sin IVA por ahora: el cargo es exactamente la tarifa (R19).
> - **P3:** la cancelación por API **sí se cobra**: no es una anulación y no genera reverso (D6).

> Las tasks parten de la recomendación de P1 (importe congelado) y de P3 (la cancelación por API no
> anula). Si Carlos decide otra cosa, se rehacen T2–T4 antes de empezar.
> `[P]` = paralelizable con las otras `[P]` de su tanda. Cada task cierra con
> `pnpm exec vitest related --run <archivos tocados>` en verde, salvo donde se dice otra cosa.
> Un commit por task (`docs/conventions.md`).

## Tanda 0 — Punto de partida

- [x] **T0. Leer el estado de `dev`.**
  - Anota la última migración de `dev`. Si SL-38 ya está en `dev`, anota también sus migraciones.
    Fija los tres timestamps de §4, posteriores a todas.
  - Comprueba si `scripts/verificar-rls-despliegue.ts` ya deriva sus conteos de
    `MODELOS_DE_NEGOCIO.length` (SL-38) o los tiene escritos.
  - Anota el conteo actual de `rls-por-empresa.guardia.test.ts`.
  - Comprueba si SL-39 está en `dev`. T7 lo necesita.
  - Comprueba que `comoPlataforma` corre como dueño, sin `servi_app` (`lib/db/extension-empresa.ts`).
  - _Hecho:_ los cinco datos, en `progress/impl_SL-40.md`.

## Tanda A — La base

- [x] **T1. El test que hoy falla** (R3, R8, R12–R20; depende de T0).
  - Escribe `tests/integration/db/cobro-plataforma-cargos.test.ts` según `design.md > 11.1`, con el
    control de no vacuidad.
  - _Hecho:_ corre contra Postgres y sale **en rojo** porque la tabla no existe. La salida queda
    pegada en `progress/impl_SL-40.md`. Un `skip` por falta de base no cuenta como rojo.
- [ ] **T2. Migraciones 1 y 2, y el esquema** (R1, R2, R8, R20, R28; depende de T0).
  - `db/migrations/20261023130000_cobro_plataforma_tarifa/{migration,down}.sql` y
    `db/migrations/20261023130100_cobro_plataforma_movimiento/{migration,down}.sql` (`design.md > 3, 4`).
  - Los triggers de SL-17 de la tabla de cargos se generan con
    `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` y se pegan en la segunda migración.
  - `db/schema.prisma`: `CobroPlataformaTarifa`, `CobroPlataformaMovimiento`, los dos enums,
    `Organizacion.cobroPlataformaPorOrden` y las relaciones inversas. Llevan el comentario de lo que
    vive solo en el SQL.
  - `lib/db/modelos-de-negocio.ts`: cada modelo en su lista.
  - Guardias: `rls-por-empresa.guardia.test.ts` sube el conteo con su motivo, y
    `scripts/verificar-rls-despliegue.ts` sube los suyos si T0 dice que siguen escritos.
  - _Hecho:_
    - `pnpm run db:migrate` aplica limpio;
    - `tests/integration/db/schema-drift-saneamiento.test.ts` en verde;
    - `pnpm run test:guardias` en verde.
- [ ] **T3. Migración 3: los triggers sobre `orden`** (R12–R19; depende de T2).
  - `db/migrations/20261023130200_cobro_plataforma_triggers_orden/{migration,down}.sql` con las dos
    funciones `SECURITY DEFINER` de `design.md > 2.2`.
  - _Hecho:_
    - T1 en verde;
    - **cada una** de las cuatro mutaciones de `design.md > 11.1` lo pone en rojo (se prueba y se
      revierte);
    - la evidencia, con los números, en `progress/impl_SL-40.md`.
- [ ] **T4. Ida y vuelta, y no regresión de la carga** (R29; depende de T3).
  - `tests/integration/db/migracion-sl40-ida-y-vuelta.test.ts`.
  - Se mide una carga masiva de 500 órdenes antes y después de T3 (`design.md > 15`).
  - _Hecho:_
    - el test en verde;
    - los diez archivos con `DELETE FROM orden` en verde **sin tocarlos**;
    - los números de la carga en `progress/impl_SL-40.md`.

## Tanda B — Servidor

- [ ] **T5. [P] Configuración del superadmin** (R1–R7; depende de T2).
  - `lib/types/cobro-plataforma.ts`.
  - El repositorio `CobroPlataformaTarifaRepository` con su interfaz.
  - El servicio `CobroPlataformaService` con su interfaz.
  - `lib/actions/cobro-plataforma.ts`.
  - La fila nueva en `lib/db/excepciones-aislamiento.ts`.
  - `EmpresasPlataformaRepository` y `EmpresaListada` ganan `cobroPorOrden`.
  - Tests:
    - `tests/unit/types/cobro-plataforma-schema.test.ts`;
    - `tests/unit/services/cobro-plataforma-service.test.ts`;
    - `tests/unit/actions/cobro-plataforma.composition-root.test.ts`;
    - `tests/integration/db/empresas-plataforma-cobro.test.ts`.
  - _Hecho:_
    - los cuatro tests en verde;
    - `plataforma-solo-en-lista` y `superadmin-fuera-de-empresa` en verde;
    - quitar el `esPlataforma` del servicio pone en rojo el caso `forbidden`.
- [ ] **T6. [P] La deuda de la empresa** (R23–R27; depende de T2).
  - `lib/utils/deuda-plataforma.ts`.
  - El repositorio `CobroPlataformaMovimientoRepository` con su interfaz.
  - El servicio `DeudaPlataformaService` con su interfaz.
  - `lib/actions/deuda-plataforma.ts`.
  - La guardia nueva `cobro-plataforma-solo-por-trigger.guardia.test.ts`.
  - Tests:
    - `tests/unit/utils/deuda-plataforma.test.ts`;
    - `tests/unit/services/deuda-plataforma-service.test.ts`;
    - `tests/unit/actions/deuda-plataforma.composition-root.test.ts`;
    - `tests/integration/db/deuda-plataforma-wallet.test.ts` (`design.md > 11.2`).
  - _Hecho:_
    - todo en verde;
    - sumar la deuda a `deEmpresa` (mutación temporal) pone en rojo `deuda-plataforma-wallet`;
    - `git diff dev -- lib/services/WalletService.ts lib/actions/wallet.ts lib/utils/caja-tesoreria.ts`
      sale vacío.

## Tanda C — Pantallas (`frontend_dev`)

- [ ] **T7. La línea en la wallet** (R21, R23, R26; depende de T6 y **de SL-39 en `dev`**).
  - `app/(app)/wallet/page.tsx` y `WalletModule.tsx` pasan `deudaPlataforma`.
  - `wallet-labels.ts`: la entrada `deuda_plataforma` en `REGIONES_BOLSILLO_EMPRESA`, con su rótulo y
    su pista. El accesor pasa a recibir `{ resumen, deudaPlataforma }` (`design.md > 10`).
  - `CajaResumenCard.tsx` pinta la región sin insignia de signo.
  - Tests:
    - `tests/components/WalletDeudaPlataformaSL40.test.tsx` (nuevo);
    - se actualiza `tests/unit/components/wallet-labels.test.ts`.
  - _Hecho:_
    - los tests en verde;
    - los de SL-39 (`WalletCajaIvaSL39.test.tsx` y `ComposicionGananciaCard.test.tsx`) siguen en
      verde sin tocarlos;
    - quitar la entrada de la lista pone en rojo el test de la región;
    - en el navegador, con una empresa con dos órdenes creadas y una eliminada, la región dice
      500,00 y las cifras de la caja no cambian. Se anota en `progress/impl_SL-40.md` con los números
      medidos.
- [ ] **T8. [P] «Cobro por orden» en «Empresas»** (R9–R11; depende de T5).
  - `app/(app)/plataforma/empresas/page.tsx`: lee el valor global y pasa las actions.
  - `EmpresasModule.tsx`: el bloque y la columna de `design.md > 9.1`.
  - `tests/components/EmpresasModuleCobro.test.tsx` (nuevo).
  - _Hecho:_
    - el test en verde;
    - los tests de SL-32 de la pantalla siguen en verde;
    - en el navegador, el superadmin fija el global, fija y quita la excepción de una empresa, y ve
      los valores sin recargar a mano.

## Tanda D — Ayuda y cierre

- [ ] **T9. [P] Ayuda** (R21; depende de T7).
  - `docs/ayuda/oficina/wallet-caja.md`: la línea, qué cuenta, que todavía no se cobra y que no
    cambia la caja. Se actualiza `actualizado:`.
  - _Hecho:_ las guardias de ayuda en verde con `vitest related` sobre el archivo.
- [ ] **T10. Cierre** (todos; depende de T1–T9).
  - No regresión, en verde: `tests/integration/db/libro-kardex-468.test.ts`,
    `tests/components/descarga/WalletDescarga.test.tsx`,
    `tests/integration/db/aislamiento-ordenes.test.ts` y
    `tests/integration/db/aislamiento-wallet.test.ts` (R24, R27).
  - En verde `pnpm exec playwright test e2e/wallet.spec.ts`: la wallet es un flujo crítico
    (`docs/checkpoints-proyecto.md`).
  - El mapa `R<n> -> test`, de R1 a R29, en `progress/impl_SL-40.md`.
  - _Hecho:_ `./init.sh` en verde, con `INIT_EXIT=0` escrito dentro del log.

## Archivos esperados

Migraciones y esquema:
- `db/schema.prisma`
- `db/migrations/20261023130000_cobro_plataforma_tarifa/migration.sql`
- `db/migrations/20261023130000_cobro_plataforma_tarifa/down.sql`
- `db/migrations/20261023130100_cobro_plataforma_movimiento/migration.sql`
- `db/migrations/20261023130100_cobro_plataforma_movimiento/down.sql`
- `db/migrations/20261023130200_cobro_plataforma_triggers_orden/migration.sql`
- `db/migrations/20261023130200_cobro_plataforma_triggers_orden/down.sql`

Código de servidor:
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/types/cobro-plataforma.ts`
- `lib/types/empresas-plataforma.ts`
- `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts`
- `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts`
- `lib/interfaces/services/ICobroPlataformaService.ts`
- `lib/interfaces/services/IDeudaPlataformaService.ts`
- `lib/repositories/CobroPlataformaTarifaRepository.ts`
- `lib/repositories/CobroPlataformaMovimientoRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/services/CobroPlataformaService.ts`
- `lib/services/DeudaPlataformaService.ts`
- `lib/utils/deuda-plataforma.ts`
- `lib/actions/cobro-plataforma.ts`
- `lib/actions/deuda-plataforma.ts`
- `scripts/verificar-rls-despliegue.ts`

Pantallas:
- `app/(app)/plataforma/empresas/page.tsx`
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`
- `app/(app)/wallet/page.tsx`
- `app/(app)/wallet/_components/WalletModule.tsx`
- `app/(app)/wallet/_components/CajaResumenCard.tsx`
- `app/(app)/wallet/_components/wallet-labels.ts`

Ayuda:
- `docs/ayuda/oficina/wallet-caja.md`

Tests nuevos:
- `tests/integration/db/cobro-plataforma-cargos.test.ts`
- `tests/integration/db/deuda-plataforma-wallet.test.ts`
- `tests/integration/db/empresas-plataforma-cobro.test.ts`
- `tests/integration/db/migracion-sl40-ida-y-vuelta.test.ts`
- `tests/unit/types/cobro-plataforma-schema.test.ts`
- `tests/unit/utils/deuda-plataforma.test.ts`
- `tests/unit/services/cobro-plataforma-service.test.ts`
- `tests/unit/services/deuda-plataforma-service.test.ts`
- `tests/unit/actions/cobro-plataforma.composition-root.test.ts`
- `tests/unit/actions/deuda-plataforma.composition-root.test.ts`
- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`
- `tests/components/EmpresasModuleCobro.test.tsx`
- `tests/components/WalletDeudaPlataformaSL40.test.tsx`

Tests que cambian:
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/unit/components/wallet-labels.test.ts`

Estado:
- `progress/impl_SL-40.md`
