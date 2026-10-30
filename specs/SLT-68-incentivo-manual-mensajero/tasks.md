# SLT-68 — Tareas

Hay dos tandas:

- **Tanda A:** datos y servidor, con sus tests PG.
- **Tanda B:** pantalla, catálogo y E2E.

La B depende de la A. Dentro de cada tanda, `[P]` marca lo que puede ir en paralelo.

Reglas de toda la ficha:

- La rama nace de `origin/prod`; no se lee ni se cita código de `dev`.
- Dinero como STRING / `Prisma.Decimal`, nunca `Number`.
- Cada test clave lleva su mutación de `design.md §10`, aplicada y revertida, con el resultado
  anotado en `progress/impl_SLT-68.md`.

## Tanda A — datos y servidor

- [x] **T0 — Medir antes de escribir.**
  - Última migración en `origin/prod` y en `origin/dev` (`git ls-tree -r --name-only origin/dev --
    db/migrations`). Fijar los dos timestamps por encima de ambas.
  - Inventario, en una base con prod aplicado (`pg_depend`/`pg_constraint`/`pg_indexes`), de todo
    objeto que nombre un valor de `pago_mensajero_movimiento_categoria` o de `wallet_origen_tipo`.
  - Confirmar que `origin/dev` no redefine `pago_mensajero_movimiento_tipo_categoria_check` ni
    `pago_mensajero_movimiento_origen_uq`.

  *Hecho:* timestamps y lista anotados en `progress/impl_SLT-68.md`.
- [x] **T1 — Migración de enums** (`20261030120000_incentivo_mensajero_enums`, `migration.sql` +
  `down.sql`), según `design.md §3.1`. El `down` recrea los tipos y suelta/recrea **en su forma
  vigente** todo lo del inventario de T0. Depende de T0.

  *Hecho:* `prisma migrate deploy` limpio en local; el `down` aplicado devuelve el esquema previo.
- [x] **T2 — Migración de checks** (`20261030120100_incentivo_mensajero_checks`, `migration.sql` +
  `down.sql`), según `design.md §3.2`: CHECK tipo↔categoría, CHECK de origen y `origen_uq` con
  `'incentivo'` fuera. Depende de T1.

  *Hecho:* igual que T1.
- [x] **T3 — `db/schema.prisma`.** Los tres valores nuevos con su comentario (el CHECK y el índice
  viven solo en la migración). Después, `prisma generate`. Depende de T1.

  *Hecho:* typecheck rojo **solo** en los `Record`/tuplas que §5 enumera.
- [x] **T4 [P] — Exhaustividad de tipos y rótulos de servidor.** Depende de T3.
  - `lib/types/wallet-mensajero.ts` y `lib/types/wallet.ts` (tuplas);
  - `lib/constants/wallet-rotulos.ts` (tres `Record` de origen);
  - `lib/utils/aporte-por-orden.ts` (`FUENTE_MENSAJERO`);
  - `lib/analytics/metrics.ts` (categorías de `cuenta_por_pagar_mensajero`);
  - `lib/utils/estado-cuenta-chips.ts` (chip `incentivos`);
  - `lib/utils/estado-cuenta.ts` (`claveDeParMensajero`);
  - `lib/services/OrigenLegibleService.ts`, `lib/repositories/libro-caja-a-quien-sql.ts`,
    `lib/services/LibroCajaAutoriaService.ts` y `lib/repositories/LibroCajaAutoriaRepository.ts`
    (lo que `tsc` señale).

  *Hecho:* typecheck verde salvo la UI.
- [x] **T5 [P] — Repositorio del libro.** Depende de T3.
  - `crearMovimientos` acepta `id?`;
  - `obtenerIncentivo(id, tx?)`;
  - `sumarPremiosVivosPorCierre` ampliado según `design.md §4`, con su TSDoc;
  - interfaz `IPagoMensajeroMovimientoRepository`.

  *Hecho:* compila; los tests PG de T9 lo cubren.
- [x] **T6 [P] — Conciliación.** `ConciliacionCierresAnaliticaRepository` excluye `incentivo` y
  `reverso_incentivo`. Depende de T3.

  *Hecho:* compila; R17 en T9.
- [x] **T7 — Puerto de caja + servicio + action.** Depende de T4 y T5.
  - `ICajaIncentivoMensajeroFeedService` y `CajaIncentivoMensajeroFeedService` (literales de tipo,
    categoría y origen);
  - `IIncentivoMensajeroService` e `IncentivoMensajeroService`, según `design.md §6.1/§6.2`;
  - `lib/types/incentivo-mensajero.ts` (schemas zod reutilizando los existentes, resultados);
  - `lib/actions/incentivo-mensajero.ts` (registrar y anular, composition root que **inyecta** todo).

  *Hecho:* tests unitarios de R1, R2, R3 y R11 verdes, cada uno con su mutación.
- [x] **T8 — Anulación uniforme.** Depende de T7.
  - `CaminoAnulacion` + `ACCION_DEL_CAMINO` (`lib/types/wallet-anulacion.ts`,
    `lib/actions/wallet-anulacion.ts`);
  - enrutado en `WalletAnulacionService`, con la rama del incentivo antes de `nace_de_un_cierre`;
  - documento de la fila de caja (`WalletService`, `DocumentoCajaDTO`,
    `EgresoCajaDocumentosRepository`).

  *Hecho:* R16 verde en `tests/unit/services/wallet-anulacion-service.test.ts`, con la mutación del
  orden.
- [x] **T9 — Tests PG de la tanda.** Depende de T2, T6 y T8.
  - `tests/integration/db/incentivo-mensajero-slt68.test.ts`: R4–R10, R12–R15 y R17, con dos empresas
    para R4 y concurrencia para R10 y R15;
  - `tests/integration/db/migracion-slt68-ida-y-vuelta.test.ts`: R21.

  *Hecho:* verdes; cada mutación de §10 lo pone rojo y se revierte; `./init.sh` verde.

## Tanda B — pantalla, catálogo y E2E

- [ ] **T10 [P] — Rótulos de los libros.**
  - `CATEGORIA_PAGO_LABEL` («Incentivo», «Anulación de incentivo»);
  - rótulo del chip en `components/shared/estado-cuenta/estado-cuenta-labels.ts`;
  - `tests/unit/components/incentivo-rotulos-slt68.test.ts` (R18).

  *Hecho:* verde.
- [ ] **T11 — Catálogo y «Así queda».**
  - Concepto `incentivo_a_mensajero` en `wallet-conceptos-manuales.ts`, con la clase, `LibroDestino`
    `caja_y_mensajero`, frase, cabecera y `CONCEPTO_REGISTRO_DE`;
  - `lib/types/efecto-movimiento.ts` y `lib/utils/efecto-movimiento.ts` (`enCuenta: "devengo"`);
  - tests de R19 (`wallet-conceptos-manuales.test.ts`, `efecto-movimiento.test.ts`,
    `efecto-movimiento-predice.test.ts`).

  *Hecho:* verdes.
- [ ] **T12 — Diálogo.** `RegistrarMovimientoDialog.tsx`, rama `incentivo_mensajero`: `FormData`,
  llamada a la action y respuestas, incluido `sin_cierre_aprobado` en el campo del mensajero. Depende
  de T11.

  *Hecho:* typecheck y lint verdes; se prueba a mano en el dev server (un solo dev server).
- [ ] **T13 — E2E** `e2e/incentivo-mensajero-slt68.spec.ts` (R22): registrar, ver «Incentivo» y la
  cuenta +M, anular, la cuenta vuelve. Depende de T12.

  *Hecho:* `pnpm exec playwright test e2e/incentivo-mensajero-slt68.spec.ts` verde.
- [ ] **T14 — Cierre.**
  - Mapa `R<n> → test` completo en `progress/impl_SLT-68.md`;
  - ayuda de la caja (`docs/ayuda/oficina/wallet-caja.md`), con una línea del concepto nuevo;
  - `./init.sh` verde.

## Archivos esperados

Migraciones y esquema:
- `db/schema.prisma`
- `db/migrations/20261030120000_incentivo_mensajero_enums/migration.sql`
- `db/migrations/20261030120000_incentivo_mensajero_enums/down.sql`
- `db/migrations/20261030120100_incentivo_mensajero_checks/migration.sql`
- `db/migrations/20261030120100_incentivo_mensajero_checks/down.sql`

Servidor:
- `lib/types/incentivo-mensajero.ts`
- `lib/types/wallet-mensajero.ts`
- `lib/types/wallet.ts`
- `lib/types/wallet-anulacion.ts`
- `lib/types/efecto-movimiento.ts`
- `lib/constants/wallet-rotulos.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/estado-cuenta.ts`
- `lib/utils/estado-cuenta-chips.ts`
- `lib/utils/efecto-movimiento.ts`
- `lib/analytics/metrics.ts`
- `lib/interfaces/repositories/IPagoMensajeroMovimientoRepository.ts`
- `lib/interfaces/services/IIncentivoMensajeroService.ts`
- `lib/interfaces/services/ICajaIncentivoMensajeroFeedService.ts`
- `lib/repositories/PagoMensajeroMovimientoRepository.ts`
- `lib/repositories/ConciliacionCierresAnaliticaRepository.ts`
- `lib/repositories/EgresoCajaDocumentosRepository.ts`
- `lib/repositories/LibroCajaAutoriaRepository.ts`
- `lib/repositories/libro-caja-a-quien-sql.ts`
- `lib/services/IncentivoMensajeroService.ts`
- `lib/services/CajaIncentivoMensajeroFeedService.ts`
- `lib/services/WalletAnulacionService.ts`
- `lib/services/WalletService.ts`
- `lib/services/OrigenLegibleService.ts`
- `lib/services/LibroCajaAutoriaService.ts`
- `lib/actions/incentivo-mensajero.ts`
- `lib/actions/wallet-anulacion.ts`

Pantalla:
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts`
- `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`
- `components/shared/wallet/RegistrarMovimientoDialog.tsx`
- `components/shared/estado-cuenta/estado-cuenta-labels.ts`

Ayuda:
- `docs/ayuda/oficina/wallet-caja.md`

Tests:
- `tests/unit/services/incentivo-mensajero-service.test.ts`
- `tests/unit/actions/incentivo-mensajero-action.test.ts`
- `tests/unit/services/wallet-anulacion-service.test.ts`
- `tests/unit/components/incentivo-rotulos-slt68.test.ts`
- `tests/unit/components/wallet-conceptos-manuales.test.ts`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/unit/services/wallet-origen-legible.test.ts`
- `tests/unit/utils/efecto-movimiento.test.ts`
- `tests/unit/utils/incentivo-analitica-slt68.test.ts`
- `tests/integration/db/incentivo-mensajero-slt68.test.ts`
- `tests/integration/db/migracion-slt68-ida-y-vuelta.test.ts`
- `tests/integration/db/efecto-movimiento-predice.test.ts`
- `e2e/incentivo-mensajero-slt68.spec.ts`

Estado:
- `progress/impl_SLT-68.md`
