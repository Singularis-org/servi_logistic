# SLT-76 · tasks — deuda de los hotfix SLT-73 y SLT-75 (HOTFIX)

Rama `hotfix/SLT-76-deuda-hotfix-73-75` desde `origin/prod`, worktree `.worktrees/SLT-76-hotfix`.
Cada task cierra con su test, y el test con la mutación que lo pone rojo. Las mutaciones se anotan
en `progress/impl_SLT-76.md` (con grep = 1, línea `Tests` de vitest, `git checkout --` y grep = 0).
Nada entra en `tests/baseline-rojos.json`.

**Dependencias:**
- T2 depende de T3, porque comparten el predicado.
- T6 está bloqueada por Q1.
- T9 depende de T0.
- T10 depende de todas las demás.

Las marcadas `[P]` tocan archivos disjuntos y van en paralelo. Ojo: dos tests de integración
contra la misma base no se corren a la vez si uno hace DDL (memoria «Gate y mutaciones no en
paralelo»).

## T0 · Verificación en prod antes de borrar respaldos (leader, SOLO LECTURA) — R17
- [ ] Con conexión de solo lectura, anotar en el PR:
  - el número de filas de `respaldo.slt73_asientos` y de `respaldo.slt75_zona_distrito_duplicado`;
  - la lista de objetos del esquema `respaldo`.

  Sin nombres ni datos de producción.
- [ ] Hacer con Carlos la verificación «SLT-73 y SLT-75 quedaron bien» que él pidió. El criterio lo
  fija él (`design.md §9.4`).
- **Hecho:** los conteos y el OK de Carlos están escritos en el PR.

## T1 · [P] Fecha en el calendario del negocio — R1, R2 (`design.md §1`)
- [x] `cierre-factura.tsx > fecha()`: devuelve `"—"` si es `null` o no es un instante válido, y si no
  `fechaCalendarioCR(new Date(iso))`.
- [x] `CierreDiaModule.tsx:935` y `:1026`: lo mismo.
- [x] `tests/components/CierreFacturaFechaCR.test.tsx`, con el instante `2026-11-01T05:03:00.000Z`
  → `2026-10-31`, escrito a mano, en las superficies de §1.
- [x] `tests/unit/guards/cierres-fecha-cr.guardia.test.ts`, con contraprueba y suelo de archivos.
- [x] Mutaciones: `fecha()` vuelve a `slice` → rojo el componente; recorte en `CierreDiaModule` →
  rojo la guardia.
- **Hecho:** los dos tests en verde, las dos mutaciones en rojo y la guardia
  `factura-contraste`/`impresion-flujo` sin cambios.

## T3 · Revertir con ajustes y predicado compartido — R5 (`design.md §2.1, §3`)
- [ ] `lib/repositories/_shared/conciliacion-con-dinero.ts > consolidacionesConDinero(cliente, ids)`:
  Prisma, dos lecturas en lote, devuelve un `Set`.
- [ ] `CierresBodegaAdminRepository.revertirConciliacion`: el conteo en línea (`:709-718`) pasa al
  predicado, dentro de la transacción y antes de escribir.
- [ ] `tests/integration/db/slt76-revertir-con-ajuste.int.test.ts`.
- [ ] Mutación: quitar los ajustes del predicado → rojo.
- **Hecho:** el test en verde y la mutación en rojo. `slt73-revertir-con-asientos` sigue en verde.

## T2 · «Desmarcar» solo cuando se puede — R3, R4 (`design.md §2`) — depende de T3
- [ ] `desmarcable` en `CierreBodegaResumenRow`, en la marca de `ICierreBodegaService` y en el tipo
  del desglose (`lib/types/conciliacion-satelites.ts`). Se deriva en `CierreBodegaRepository` y en
  `SaldosSatelitesRepository` con UNA llamada al predicado por página.
- [ ] `CierresBodegaAdminService` lo propaga.
- [ ] `ConciliacionAcciones`: `marca.desmarcable` es obligatorio. Con `false` no se pinta
  «Desmarcar».
- [ ] `ConciliacionSatelite.tsx` y `CierresBodegaAdminModule.tsx` pasan el campo. Se ajustan los
  dobles (`tests/fixtures/marca-conciliacion.ts` y los que falle el typecheck).
- [ ] `tests/components/ConciliacionAccionesConAsientos.test.tsx`: casos de R3.
- [ ] `tests/integration/db/slt76-desmarcable.int.test.ts`: los tres escenarios × las dos
  superficies, y la equivalencia con `revertirConciliacion` (R4).
- [ ] Mutaciones: el componente ignora el campo → rojo; el predicado devuelve vacío → rojo.
- **Hecho:** typecheck verde, los dos tests verdes, las mutaciones rojas. Los E2E
  `cierre-bodega-satelite` y `wallet` en verde: su paso 3 de «Desmarcar» probablemente tenga que
  pasar a «el botón no está», y se ajusta según lo medido.

## T4 · [P] Una sola fórmula del esperado — R6 (`design.md §4`)
- [ ] `asentarDiferenciaSatelite` usa `esperadoDe(consolidacion)`.
- [ ] `tests/unit/guards/conciliacion-esperado-unico.guardia.test.ts`, con contraprueba.
- [ ] Confirmar o añadir en `slt73-marcar-asienta.int.test.ts` el caso literal 9.000 / 1.500 / 500,
  recibido 6.900 → esperado `7000.00` y diferencia `100.00`.
- [ ] Mutaciones: la llamada a mano vuelve → rojo la guardia; `esperadoDe` sin restar rechazos →
  rojo en la marca y en `saldo-satelites`.
- **Hecho:** los tests en verde y las dos mutaciones en rojo.

## T5 · [P] Estado de cuenta de la bodega con dos empresas — R7 (`design.md §5`)
- [ ] `tests/integration/db/slt76-estado-cuenta-bodega-dos-empresas.int.test.ts`: la siembra en A y
  B, la lectura cruzada como `servi_app`, la lectura propia con cifras a mano y el CONTROL como
  dueño.
- [ ] Mutación del reviewer: `DISABLE ROW LEVEL SECURITY` sobre `cierre_bodega` en la transacción →
  rojo.
- **Hecho:** el test en verde, con el CONTROL que ve la fuga, y la mutación en rojo. No cambia código
  de la app.

## T6 · Rastro de distritos — R8-R11 (`design.md §6`) — BLOQUEADA por Q1
- [ ] Carlos confirma Q1 (a)-(f) o las cambia. Si cambia alguna, `spec_author` reescribe R8-R11 y
  §6 antes de seguir.
- [ ] Migración `20261102090000_slt76_historial_zona_distrito` (`migration.sql` con el `ADD VALUE`
  solo; `down.sql` con el patrón de SL-23) y el valor en `schema.prisma`.
- [ ] `lib/types/historial-accion.ts`: los tres mapas.
- [ ] `ZonaRepository.update`: diff, lectura de nombres, `appendAccion(tx, …)` con un lote, recorte
  a 60.
- [ ] `tests/integration/db/zona-distrito-rastro.test.ts` y
  `tests/integration/db/historial-accion-zona-distrito-migration.test.ts`.
- [ ] Conteos de `catalogo-y-choke-point`, el punto de escritura en
  `historial-accion-escrituras-cubiertas` y los tests de migración del historial que fallen
  (medidos corriéndolos, sin suponer cuáles).
- [ ] R11: la fila en `historial-acciones-descarga-columnas.test.ts`.
- [ ] Mutaciones de §6.5 → rojo.
- **Hecho:** la migración sube y baja en una base limpia; los tests en verde; las mutaciones en
  rojo; `zona-reconciliacion-ordenes`, `zona-distrito-unica` y `zona-pago-mensajero-rastro` en
  verde.

## T7 · [P] Tests deterministas — R12-R15 (`design.md §7`)
- [x] **T7.1 D32.** En `medir`: `serializarEscriturasReales(tx)` y después `LOCK TABLE public.usuario
  IN ACCESS EXCLUSIVE MODE`, antes de `CREATE SCHEMA`. Se registra `pg_locks` en `Medicion` con su
  `it`. Mutaciones: sin `LOCK` → rojo; sin `serializar` → rojo.
- [x] **T7.2 geografía.** Correr el archivo en PG18 local y anotar qué casos dan `23001`. Helper
  `rechazoPorRestrict` solo en esos casos; los demás siguen exigiendo `23503`. Aserción de estado
  en el caso de `:146`. Mutación: FK a `ON UPDATE CASCADE` en la transacción → rojo.
- [x] **T7.3 índices.** Corpus decisivo para el rollup y `SET LOCAL default_statistics_target =
  10000` antes de `ANALYZE`. Cinco corridas verdes en la base local acumulada y una en base limpia.
  Mutación: `DROP INDEX` del compuesto en la transacción → rojo.
- [x] **T7.4 salida a reparto.** Cantón del país de la empresa con `orderBy: { id: "asc" }`, y el
  caso nuevo con un cantón de otro país que ordena primero. Mutación: sin `where` → rojo.
- **Hecho:** los cuatro archivos en verde en local (PG18). En CI (PG17), `gate-completo` sin
  relanzar. En D32 queda anotado el número de corridas del shard en verde.

## T8 · [P] Textos definitivos — R16 (`design.md §8`)
- [x] Specs de SLT-73: Q10 cerrada, rótulos definitivos, y fuera la palabra «provisional» de las
  líneas citadas.
- [x] Specs de SLT-75: Q1 → «SLT-76», Q3 → «cerrada en SLT-76».
- [x] Los cuatro tests: nombres y comentarios sin «provisional». Las aserciones literales no se
  tocan.
- [x] Mutación: una letra de `CONCILIACION_ASIENTA_NOTA` → rojo.
- **Hecho:** grep de «provisional» en `specs/SLT-73-*` y en esos tests da 0 líneas que se refieran
  a SLT-73, los cuatro tests siguen verdes y la mutación sale roja.

## T9 · Retirar los respaldos — R17-R20 (`design.md §9`) — depende de T0
- [ ] Migración `20261102090100_slt76_retirar_respaldos`: `migration.sql` en un bloque `DO`;
  `down.sql` documentado que no recrea nada.
- [ ] `down.sql` de SLT-73 (`20261031140200`): `RAISE EXCEPTION` al principio si falta el respaldo.
- [ ] `down.sql` de datos de SLT-75 (`20261101090000`): `DO` con `IF to_regclass(...) IS NOT NULL`
  y `NOTICE` si falta.
- [ ] Borrar `respaldo-convivencia-slt73-slt75.test.ts` y crear
  `slt76-retirar-respaldos-migration.test.ts`.
- [ ] Ajustar `slt73-migracion-retira-asientos.int.test.ts` (comentario y lo que se mida roto) y
  `zona-distrito-unica-migration.test.ts`.
- [ ] Mutaciones de §9.3 → rojo.
- [ ] `prisma migrate status` sin drift tras aplicar en la base local.
- **Hecho:** la migración aplica en la base local y el esquema `respaldo` desaparece; los tres
  archivos en verde; las tres mutaciones en rojo; `migrate status` limpio.

## T10 · Gate y cierre
- [ ] `progress/impl_SLT-76.md` con el mapa `R<n> -> test` (R1-R20) y la tabla de mutaciones.
- [ ] `./init.sh` en verde, con `INIT_EXIT=$?` escrito dentro del log.
- [ ] PR a `prod`: `gate-completo` y E2E en verde sin relanzar (`cierre-bodega-satelite`, `wallet`,
  `cierres-admin` y `dos-empresas-humo`).
- [ ] D32 anotada como resuelta en `progress/deudas.md` de `dev` al sincronizar.
- [ ] Nota en el PR para Carlos:
  - tras el deploy, SLT-73 y SLT-75 ya no se pueden revertir con sus datos;
  - «Desmarcar» desaparece de las consolidaciones con dinero asentado.
- **Hecho:** el reviewer da OK y el gate local y el de CI están en verde.

## Archivos esperados

Bloque 1:
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `tests/components/CierreFacturaFechaCR.test.tsx`
- `tests/unit/guards/cierres-fecha-cr.guardia.test.ts`

Bloques 2, 3 y 4:
- `lib/repositories/_shared/conciliacion-con-dinero.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/repositories/SaldosSatelitesRepository.ts`
- `lib/interfaces/repositories/ICierreBodegaRepository.ts`
- `lib/interfaces/repositories/ISaldosSatelitesRepository.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/types/conciliacion-satelites.ts`
- `components/shared/conciliacion/ConciliacionAcciones.tsx`
- `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `tests/fixtures/marca-conciliacion.ts`
- `tests/components/ConciliacionAccionesConAsientos.test.tsx`
- `tests/integration/db/slt76-desmarcable.int.test.ts`
- `tests/integration/db/slt76-revertir-con-ajuste.int.test.ts`
- `tests/unit/guards/conciliacion-esperado-unico.guardia.test.ts`
- `tests/integration/db/slt73-marcar-asienta.int.test.ts`
- `e2e/cierre-bodega-satelite.spec.ts`

Bloque 5:
- `tests/integration/db/slt76-estado-cuenta-bodega-dos-empresas.int.test.ts`

Bloque 6:
- `db/migrations/20261102090000_slt76_historial_zona_distrito/migration.sql`
- `db/migrations/20261102090000_slt76_historial_zona_distrito/down.sql`
- `db/schema.prisma`
- `lib/types/historial-accion.ts`
- `lib/repositories/ZonaRepository.ts`
- `tests/integration/db/zona-distrito-rastro.test.ts`
- `tests/integration/db/historial-accion-zona-distrito-migration.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/components/historial-acciones-descarga-columnas.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`

Bloque 7:
- `tests/integration/db/liquidacion-reparto-migration.test.ts`
- `tests/integration/db/geografia-por-pais.test.ts`
- `tests/integration/db/indices-rutas-calientes.test.ts`
- `tests/integration/db/salida-a-reparto-sql-real.test.ts`

Bloque 8:
- `specs/SLT-73-dinero-satelite-al-conciliar/requirements.md`
- `specs/SLT-73-dinero-satelite-al-conciliar/design.md`
- `specs/SLT-73-dinero-satelite-al-conciliar/tasks.md`
- `specs/SLT-75-distrito-zona-unica/requirements.md`
- `tests/integration/wallet-satelites.test.tsx`
- `tests/unit/guards/slt73-nota-conciliacion.guardia.test.ts`
- `tests/components/CajaComposicionBarra.test.tsx`
- `tests/unit/descarga/libro-kardex-468.test.ts`

Bloque 9:
- `db/migrations/20261102090100_slt76_retirar_respaldos/migration.sql`
- `db/migrations/20261102090100_slt76_retirar_respaldos/down.sql`
- `db/migrations/20261031140200_slt73_retirar_asientos_satelite/down.sql`
- `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/down.sql`
- `tests/integration/db/respaldo-convivencia-slt73-slt75.test.ts`
- `tests/integration/db/slt76-retirar-respaldos-migration.test.ts`
- `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts`
- `tests/integration/db/zona-distrito-unica-migration.test.ts`

Estado:
- `progress/impl_SLT-76.md`
- `progress/features/SLT-76.md`
