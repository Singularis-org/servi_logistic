# SLT-73 — Tareas

> HOTFIX. Rama `hotfix/SLT-73-dinero-satelite-al-conciliar`, desde `origin/prod`. El PR va a `prod`
> y después se sincroniza a `dev`.
> **No se implementa hasta resolver Q1 y Q2** (`requirements.md > Preguntas abiertas`). Si las
> respuestas son las recomendadas, este plan vale tal cual.

## Tareas

- [ ] **T1 — Migraciones A y B (enums, tabla de ajuste y CHECKs).** `backend_dev`.
  Entrega `20261031140000_slt73_diferencia_satelite_enums` y
  `20261031140100_slt73_ajuste_conciliacion`, cada una con su `down.sql`. El modelo va en
  `db/schema.prisma` y la clasificación en `lib/db/modelos-de-negocio.ts`. Se verifica si hay CHECK
  de origen por categoría y se actualiza. Se actualiza `NATURALEZA_POR_CATEGORIA`.
  *Hecho:* `pnpm prisma migrate deploy` y `pnpm run db:rollback`×2 funcionan sobre la base de test;
  la guardia `organizacion-en-modelos` está verde; el int de RLS de la tabla está verde.
- [ ] **T2 — Extraer `asentarCierreDia`** (`lib/repositories/_shared/asientos-cierre-dia.ts`). Se
  mueve el bloque de `CierresAdminRepository.ts:1891-1953` sin cambiar su lógica. Depende de: —.
  *Hecho:* la suite de aprobación existente (`cierres-admin-caja-cod.test.ts`,
  `wallet-idempotencia.test.ts`, `cierres-admin-indemnizacion.test.ts`) está verde sin tocarla.
- [ ] **T3 — Aprobación de satélite sin asientos (R1–R3).** Lleva el `if (destinoTipo ===
  "bodega_central")` dentro de la tx. Se censan con grep los tests que aprueban un satélite y
  esperan filas en los libros, y se ajustan. Depende de T2.
  *Hecho:* `slt73-aprobar-satelite-sin-asientos` y `slt73-aprobar-central-igual` están verdes, y
  las mutaciones de la tabla mueren.
- [ ] **T4 — Marca y corrección asientan (R10–R13, R15, R22).** Toca `marcarConciliado`,
  `corregirConciliacion`, el constructor con default y `paraLaCentral` como esperado. Depende de
  T1 y T2.
  *Hecho:* `slt73-marcar-asienta` y `slt73-corregir-diferencia` están verdes y sus mutaciones
  mueren. Se ajustan `marca-conciliacion.int.test.ts`, `corregir-conciliacion.int.test.ts` y
  `cierres-bodega-admin-marca.test.ts`.
- [ ] **T5 — Reversión bloqueada con asientos (R14, sujeta a Q2).** Toca el repo, el servicio, el
  tipo de resultado y la acción `lib/actions/conciliacion-satelites.ts`. Depende de T4.
  *Hecho:* el caso nuevo de `marca-conciliacion.int.test.ts` y los unit de servicio y de acción
  están verdes.
- [ ] **T6 [P] — Deuda en `SaldosSatelitesRepository` y `CierreBodegaRepository` (R4–R8).** Toca
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
- [ ] **T8 — Migración C de datos (R16–R20).** Entrega
  `20261031140200_slt73_retirar_asientos_satelite`: up con guarda `liquidacion_pago`, esquema
  `respaldo` y `DELETE` por id del respaldo; down con `jsonb_populate_record` y
  `ON CONFLICT DO NOTHING`. Depende de T1.
  *Hecho:* `slt73-migracion-retira-asientos.int.test.ts` está verde. `prisma migrate diff` no
  reporta drift por el esquema `respaldo`. El up, el down y el up otra vez dejan el blob igual.
- [ ] **T9 — Medición en prod antes del deploy (Q5).** La hace el **leader**, solo lectura: cuántas
  filas de tienda y de mensajero tiene el conjunto `S`, si hay `liquidacion_pago` contra él y si la
  tienda afectada ya cobró. No va al repo ningún dato de prod. Depende de T8.
  *Hecho:* el resultado está anotado en `progress/features/SLT-73.md` y se ha decidido si se
  despliega.
- [ ] **T10 — Gate y cierre.** Entrega `./init.sh` verde, el mapa R→test en
  `progress/impl_SLT-73.md` y los supervivientes de mutación a 0, con autocomprobación de que cada
  mutación se ejecutó. Depende de T3–T8.

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
- `progress/features/SLT-73.md`
- `progress/impl_SLT-73.md`
