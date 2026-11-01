# SLT-73 — Tareas

> HOTFIX. Rama `hotfix/SLT-73-dinero-satelite-al-conciliar`, desde `origin/prod`. El PR va a `prod`
> y después se sincroniza a `dev`.
> **No se implementa hasta resolver Q1 y Q2** (`requirements.md > Preguntas abiertas`). Si las
> respuestas son las recomendadas, este plan vale tal cual.

## Tareas

- [x] **T1 — Migraciones A y B (enums, tabla de ajuste y CHECKs).** `backend_dev`.
  Entrega `20261031140000_slt73_diferencia_satelite_enums` y
  `20261031140100_slt73_ajuste_conciliacion`, cada una con su `down.sql`. El modelo va en
  `db/schema.prisma` y la clasificación en `lib/db/modelos-de-negocio.ts`. Se verifica si hay CHECK
  de origen por categoría y se actualiza. Se actualiza `NATURALEZA_POR_CATEGORIA`.
  *Hecho:* `pnpm prisma migrate deploy` y `pnpm run db:rollback`×2 funcionan sobre la base de test;
  la guardia `organizacion-en-modelos` está verde; el int de RLS de la tabla está verde.
- [x] **T2 — Extraer `asentarCierreDia`** (`lib/repositories/_shared/asientos-cierre-dia.ts`). Se
  mueve el bloque de `CierresAdminRepository.ts:1891-1953` sin cambiar su lógica. Depende de: —.
  *Hecho:* la suite de aprobación existente (`cierres-admin-caja-cod.test.ts`,
  `wallet-idempotencia.test.ts`, `cierres-admin-indemnizacion.test.ts`) está verde sin tocarla.
- [x] **T3 — Aprobación de satélite sin asientos (R1–R3).** Lleva el `if (destinoTipo ===
  "bodega_central")` dentro de la tx. Se censan con grep los tests que aprueban un satélite y
  esperan filas en los libros, y se ajustan. Depende de T2.
  *Hecho:* `slt73-aprobar-satelite-sin-asientos` y `slt73-aprobar-central-igual` están verdes, y
  las mutaciones de la tabla mueren.
- [x] **T4 — Marca y corrección asientan (R10–R13, R15, R22).** Toca `marcarConciliado`,
  `corregirConciliacion`, el constructor con default y `paraLaCentral` como esperado. Depende de
  T1 y T2.
  *Hecho:* `slt73-marcar-asienta` y `slt73-corregir-diferencia` están verdes y sus mutaciones
  mueren. Se ajustan `marca-conciliacion.int.test.ts`, `corregir-conciliacion.int.test.ts` y
  `cierres-bodega-admin-marca.test.ts`.
- [x] **T5 — Reversión bloqueada con asientos (R14, sujeta a Q2).** Toca el repo, el servicio, el
  tipo de resultado y la acción `lib/actions/conciliacion-satelites.ts`. Depende de T4.
  *Hecho:* el caso nuevo de `marca-conciliacion.int.test.ts` y los unit de servicio y de acción
  están verdes.
- [x] **T6 [P] — Deuda en `SaldosSatelitesRepository` y `CierreBodegaRepository` (R4–R8).** Toca
  `saldoDe` (firma y docstring), los DTO y `findResumen`. Depende de T2 solo para el árbol; puede
  ir en paralelo a T3–T5.
  *Hecho:* `slt73-deuda-satelite.int.test.ts` y el `saldo-satelites.int.test.ts` actualizado están
  verdes contra Postgres real, y las mutaciones de `WHERE` mueren.
- [ ] **T7 — UI de `/wallet/satelites` y `/cierres-admin` (R6, R9, R14).** `frontend_dev`. Toca
  `ConciliacionSatelite.tsx`, `SaldosSatelitesTable.tsx`, las columnas de descarga y el aviso
  `con_asientos`. Depende de T5 y T6.
  *Hecho:* `ConciliacionSateliteCascada.test.tsx` y `SaldosSatelitesTable.test.tsx` están verdes, y
  `DineroIdentidadesEnPantalla.test.tsx` sigue verde. Se verifica en el navegador con una satélite
  todo SINPE sin consolidar: no sale al día.
- [x] **T8 — Migración C de datos (R16–R20).** Entrega
  `20261031140200_slt73_retirar_asientos_satelite`: up con guarda `liquidacion_pago`, esquema
  `respaldo` y `DELETE` por id del respaldo; down con `jsonb_populate_record` y
  `ON CONFLICT DO NOTHING`. Depende de T1.
  *Hecho:* `slt73-migracion-retira-asientos.int.test.ts` está verde. `prisma migrate diff` no
  reporta drift por el esquema `respaldo`. El up, el down y el up otra vez dejan el blob igual.
- [x] **T9 — Medición en prod antes del deploy (Q5).** La hace el **leader**, solo lectura: cuántas
  filas de tienda y de mensajero tiene el conjunto `S`, si hay `liquidacion_pago` contra él y si la
  tienda afectada ya cobró. No va al repo ningún dato de prod. Depende de T8.
  *Hecho:* el resultado está anotado en `progress/features/SLT-73.md` y se ha decidido si se
  despliega.
- [ ] **T11 — Enmienda D12: dueño «por cobrar a satélites» y sexta cifra de la caja (R24–R27,
  R30).** `backend_dev`. Aprobada por Carlos 2026-10-31 (D12–D14). Sin migración: la naturaleza es
  solo de TypeScript (design §2.9).
  Toca:
  - `NaturalezaMovimiento`;
  - `NATURALEZA_POR_CATEGORIA` de las dos diferencias;
  - `acumular`, con ramas explícitas y un `never`;
  - `derivarCaja`: sexta `derivarBalance(egresos, ingresos)` y la identidad;
  - `derivarReparto`: tres tramos (design §2.9.6). Con P ≤ 0, lógica de hoy intacta; con P > 0,
    modo `tres_tramos` sobre `E + T`, con `min(…, 100 − tiendas)` y la empresa como resto;
  - `MODO_COMPOSICION_CAJA_SEED` + `tres_tramos`;
  - `CajaResumenDTO`, con `porCobrarSatelites`, `signoPorCobrarSatelites`,
    `porcentajePorCobrarSatelites` y `deEmpresaEnCaja`.

  Ajusta las guardias `caja-clasificacion-459` (caso nuevo y su contraprueba),
  `caja-derivaciones` (de 5 a 6) y `metrics-caja-naturaleza` (fuera del literal de `terceros`), más
  los fixtures de `CajaResumenDTO` que el typecheck señale. Amplía `slt73-marcar-asienta` y
  `slt73-corregir-diferencia` con la comprobación R8 de la 459 sobre las filas reales (R26).
  Depende de T1. Puede ir en paralelo a T4–T6, pero **R26 se cierra después de T4**.
  *Hecho:* `pnpm run test:guardias` sin `caja-clasificacion-459` en rojo. Los casos R24–R27 y R30 de
  `design.md > Trazabilidad` están verdes y sus mutaciones mueren, con autocomprobación.
- [ ] **T12 — Enmienda D12: bloque, tercer tramo de la barra y dueño en la pantalla de caja (R28,
  R29, R30 en pantalla).** `frontend_dev`. Aprobada por Carlos 2026-10-31 (D13: tercer tramo; D14:
  el bloque siempre, también con ₡0). Las pistas y «Satélite» siguen provisionales.
  Toca:
  - `CajaResumenCard.tsx`: tercer bloque hermano `data-bolsillo="satelites"`, fuera del de la
    empresa, que se pinta siempre. También `BOLSILLO_EMPRESA.tres_tramos`;
  - `BarraComposicionCaja.tsx`: `SEGMENTOS_POR_MODO.tres_tramos` (tiendas, `por_cobrar`, empresa
    como resto), con color por token;
  - `wallet-labels.ts`: rótulo, pistas positiva y negativa, `DUENO_LABEL.por_cobrar_satelite`,
    `CAJA_COMPOSICION_MENSAJE.tres_tramos` y `composicionCajaNombreAccesible` con los tres tramos;
  - `WalletLedger.tsx`: `DUENO_PUNTO`.

  Depende de T11.
  *Hecho:*
  - `CajaPorCobrarSatelitesSLT73.test.tsx` (nuevo, incluye el caso ₡0),
    `CajaComposicionBarra.test.tsx` (ampliado, tres segmentos), `wallet-ledger-dueno.test.tsx` y
    `wallet-labels.test.ts` están verdes;
  - `DineroIdentidadesEnPantalla.test.tsx` y `wallet-page.test.tsx` siguen verdes;
  - verificado en el navegador: tras conciliar con faltante, el bloque muestra el faltante y «De
    las tiendas» no se mueve.
- [ ] **T10 — Gate y cierre.** Entrega `./init.sh` verde, el mapa R→test en
  `progress/impl_SLT-73.md` y los supervivientes de mutación a 0, con autocomprobación de que cada
  mutación se ejecutó. Depende de T3–T8, T11 y T12.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261031140000_slt73_diferencia_satelite_enums/migration.sql`
- `db/migrations/20261031140000_slt73_diferencia_satelite_enums/down.sql`
- `db/migrations/20261031140100_slt73_ajuste_conciliacion/migration.sql`
- `db/migrations/20261031140100_slt73_ajuste_conciliacion/down.sql`
- `db/migrations/20261031140200_slt73_retirar_asientos_satelite/migration.sql`
- `db/migrations/20261031140200_slt73_retirar_asientos_satelite/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/utils/caja-tesoreria.ts`
- `lib/utils/conciliacion-satelite.ts`
- `lib/repositories/_shared/asientos-cierre-dia.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/repositories/SaldosSatelitesRepository.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`
- `lib/interfaces/repositories/ISaldosSatelitesRepository.ts`
- `lib/interfaces/services/IConciliacionSatelitesService.ts`
- `lib/services/ConciliacionSatelitesService.ts`
- `lib/types/conciliacion-satelites.ts`
- `lib/actions/conciliacion-satelites.ts`
- `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`
- `app/(app)/wallet/satelites/_components/SaldosSatelitesTable.tsx`
- `app/(app)/wallet/satelites/_components/saldos-satelites-descarga-columnas.ts`
- `components/shared/conciliacion/ConciliacionAcciones.tsx`
- `components/shared/conciliacion/conciliacion-labels.ts`
- `tests/integration/db/slt73-aprobar-satelite-sin-asientos.int.test.ts`
- `tests/integration/db/slt73-aprobar-central-igual.int.test.ts`
- `tests/integration/db/slt73-deuda-satelite.int.test.ts`
- `tests/integration/db/slt73-marcar-asienta.int.test.ts`
- `tests/integration/db/slt73-corregir-diferencia.int.test.ts`
- `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts`
- `tests/integration/db/marca-conciliacion.int.test.ts`
- `tests/integration/db/corregir-conciliacion.int.test.ts`
- `tests/integration/db/saldo-satelites.int.test.ts`
- `tests/unit/repositories/cierres-bodega-admin-marca.test.ts`
- `tests/unit/repositories/cierre-bodega-repository.test.ts`
- `tests/unit/services/conciliacion-satelites-service.test.ts`
- `tests/unit/actions/conciliacion-satelites-actions.test.ts`
- `tests/unit/utils/cascadas-cierre-bodega.test.ts`
- `tests/unit/descarga/saldos-satelites-descarga-columnas.test.ts`
- `tests/components/ConciliacionSateliteCascada.test.tsx`
- `tests/components/SaldosSatelitesTable.test.tsx`
- `lib/types/wallet.ts`
- `app/(app)/wallet/_components/CajaResumenCard.tsx`
- `app/(app)/wallet/_components/BarraComposicionCaja.tsx`
- `tests/components/CajaComposicionBarra.test.tsx`
- `app/(app)/wallet/_components/wallet-labels.ts`
- `app/(app)/wallet/_components/WalletLedger.tsx`
- `tests/unit/guards/caja-clasificacion-459.guardia.test.ts`
- `tests/unit/guards/caja-derivaciones.guardia.test.ts`
- `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts`
- `tests/unit/utils/caja-tesoreria.test.ts`
- `tests/unit/components/wallet-ledger-dueno.test.tsx`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/components/CajaPorCobrarSatelitesSLT73.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/integration/wallet-page.test.tsx`
- `progress/features/SLT-73.md`
- `progress/impl_SLT-73.md`
