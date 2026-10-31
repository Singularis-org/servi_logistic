# SLT-63 — recoleccion-recibida-libera-mensajero · tasks.md

> Orden: T1 → (T2 ∥ T3) → T4 → T5 → T6 (solo si Q1 = a) → T7. `[P]` marca lo que se puede hacer en
> paralelo con su hermana. Cada task cierra con `pnpm run typecheck` y los tests que nombra en verde.
> Q1 cerrada = (a): T6 entra.

## T1. Recepción que libera la asignación (R1, R2, R3, R4)
- [x] `lib/interfaces/repositories/IOrdenRepository.ts`: `recibirEnBodegaCentral` gana el parámetro
      obligatorio `opciones: { liberaAsignacion: boolean }`.
- [x] `lib/repositories/OrdenRepository.ts`: si `liberaAsignacion`, el `data` del **mismo**
      `updateMany` añade `mensajeroAsignadoId: null, asignadoAt: null, fechaReparto: null`. El `where`
      y el historial no cambian. Hay que reescribir el comentario «NO toca `mensajeroAsignadoId`
      (R18)» citando SLT-63 (`design.md §3.1`).
- [x] `lib/services/RecepcionBodegaCentralService.ts`: `liberaAsignacion` en `TRANSICIONES`
      (`true` para `en_ruta_bodega_central` y `false` para `devolviendo_a_bodega_central`), pasado
      al repo.
- **Hecho:**
  - `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts` actualizado: el caso
    138 espera `data = { estatusId, mensajeroAsignadoId: null, asignadoAt: null, fechaReparto: null }`
    y el 139 solo `{ estatusId }`.
  - `tests/unit/services/recepcion-bodega-central-service.test.ts` comprueba la opción que recibe el
    repo en cada caso.
  - La guardia `fecha-reparto-acompana-asignado-at` está en verde.

## T2. [P] «Recolectadas hoy» conserva la recibida (R8, R9)
Depende de T1, porque sin T1 la guarda nueva no se nota.
- [x] `lib/repositories/GestionOrdenRepository.ts` → `findMisAsignacionesByIds`: la guarda pasa a ser
      `asignada a mí` **o** `sin mensajero y con una recolección en tienda mía en el historial`
      (`design.md §3.3`). Hay que verificar los nombres de la relación y de los campos en
      `db/schema.prisma`.
- [x] Actualizar el comentario del método en `lib/interfaces/repositories/IGestionOrdenRepository.ts`.
- **Hecho:** los casos R8 y R9 de T4 en verde.

## T3. [P] Test de integración con Postgres real: el escenario (R1–R10)
Depende de T1.
- [x] Crear `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts` con
      `tests/integration/db/_postgres-real.ts` (`enTransaccionRevertida`, `describe.skip` si no hay
      base). La siembra recorre el camino real: `asignarRecoleccionLote` → `recolectarEnTienda` →
      `RecepcionBodegaCentralService.recibirEnBodegaCentral`. Se siembran también las hermanas de
      `design.md §6`.
- **Hecho:** el archivo existe, compila y siembra. Sus aserciones se cierran en T4.

## T4. Aserciones por requisito
Depende de T2 y T3. Todas en el archivo de T3, un `it` por requisito con el `R<n>` en el nombre:
- [x] R1: la orden recibida tiene mensajero, `asignado_at` y `fecha_reparto` en NULL.
- [x] R2: una recepción repetida (`ya_recibida`) y una orden que está en otro estado no cambian su
      asignación (se siembra con mensajero a mano).
- [x] R3: la devolución recibida (`devolviendo_a_bodega_central → por_devolver_a_tienda`) conserva el
      mensajero.
- [x] R4: `num_guia` no cambia y hay exactamente 1 fila nueva de historial `recepcion_bodega_central`.
- [x] R5: `OrdenRepository.list` con `reasignables` trae la recibida y no trae la hermana con
      mensajero a mano.
- [x] R6: `TableroDiaRepository.contarPorMensajero` del día no la cuenta en ninguna tarjeta.
- [x] R7: la hermana en `en_ruta_bodega_central` sigue contando 1 en la tarjeta de su mensajero.
- [x] R8: `findMisAsignacionesByIds(recolector, [recibida])` la devuelve.
- [x] R9: no devuelve la recolectada por otro mensajero, ni la recolectada por mí y asignada después
      a otro (`asignarBodegaLote`).
- [x] R10: los conteos de `gestion_orden`, `wallet_movimiento` y `cierre_dia` son iguales antes y
      después de la recepción.
- **Hecho:** `pnpm exec vitest run tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`
  sale verde con base (no `skipped`).

## T5. Mutaciones: el test tiene que poder fallar
Depende de T4. Cada mutación se aplica, se ejecuta el archivo, se anota el test que se pone rojo y se
revierte. **No se ejecuta en paralelo con el gate** (memoria: gate y mutaciones no van en paralelo).
- [x] Quitar la limpieza del `data` en `recibirEnBodegaCentral`: rojo en R1, R5, R6 y R8.
- [x] Forzar `liberaAsignacion: true` en el caso 139: rojo en R3.
- [x] Quitar la rama `OR` nueva de `findMisAsignacionesByIds`: rojo en R8.
- [x] Quitar `mensajeroAsignadoId: null` de esa rama: rojo en R9.
- [x] Comprobar que el test se ejecutó de verdad: el reporte dice `passed`/`failed`, no `skipped`.
- **Hecho:** tabla mutación → test rojo en `progress/impl_SLT-63.md`, y el árbol limpio después
  (`git diff` vacío fuera de lo de T1–T4).

## T6. Corrección de los datos existentes (solo si Q1 = a)
Desbloqueada: Q1 = (a) (D2, 2026-10-30 y reconfirmada por Carlos el 2026-10-31: «no lo podemos dejar como deuda»).
- [x] `db/migrations/20261031120000_liberar_recolecciones_recibidas/migration.sql` y `down.sql`
      según `design.md §5`. Antes hay que verificar los nombres de columnas y que el timestamp sea
      posterior a la última migración de `dev`.
- [x] `tests/integration/db/liberar-recolecciones-recibidas-migration.test.ts`: libera la recibida y
      no toca a las hermanas (con una fila posterior, devolución, borrada, sin recolección). El
      `down` repone el mensajero desde la `recoleccion_tienda`.
- **Hecho:** `pnpm run db:migrate` y `pnpm run db:rollback` limpios, y el test en verde. Si Q1 = b,
  la task se marca como no aplica en `progress/impl_SLT-63.md`.

## T7. Cierre
- [ ] `./init.sh` en verde.
- [ ] Mapa `R<n> → test` completo en `progress/impl_SLT-63.md`.
- [ ] Nota en la sección de la ficha de `progress/features/SLT-63.md`: «138/R18 acotado, 259/R10
      acotado».

## Archivos esperados

- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/services/RecepcionBodegaCentralService.ts`
- `lib/repositories/GestionOrdenRepository.ts`
- `lib/interfaces/repositories/IGestionOrdenRepository.ts`
- `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts`
- `tests/unit/services/recepcion-bodega-central-service.test.ts`
- `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`
- `db/migrations/20261031120000_liberar_recolecciones_recibidas/migration.sql`
- `db/migrations/20261031120000_liberar_recolecciones_recibidas/down.sql`
- `tests/integration/db/liberar-recolecciones-recibidas-migration.test.ts`
- `progress/impl_SLT-63.md`
- `progress/features/SLT-63.md`
- `specs/SLT-63-recoleccion-recibida-libera-mensajero/requirements.md`
- `specs/SLT-63-recoleccion-recibida-libera-mensajero/design.md`
- `specs/SLT-63-recoleccion-recibida-libera-mensajero/tasks.md`
