# SLT-94 «Cobro de fulfillment por paquete y marca «se recoge en tienda»» — bitácora de implementación

## Tanda T1 — base de datos (backend_dev, 2026-11-08)

Tasks: T1.1, T1.2, T1.3, T1.4, T1.5.

Base desechable propia: `slt94_t1`, en el mismo servidor del `.env` del worktree (DROP/CREATE,
`prisma migrate deploy`, `db:seed`, `DATABASE_URL` exportada antes de todo vitest y prisma). La base de
desarrollo del `.env` no se tocó. `prisma generate` corrido UNA vez con el schema terminado
(node_modules compartido por junction: otros worktrees ven ya el cliente con `fulfillmentRetirado`,
`seRecogeEnTienda` y `OrdenFulfillmentMovimiento`).

### Archivos

Creados:
- `db/migrations/20261108120000_slt94_fulfillment_enums/{migration,down}.sql` — M1: 10 valores de enum; down con la función dinámica de SLT-73 renombrada `_slt94`.
- `db/migrations/20261108120100_slt94_se_recoge_en_tienda/{migration,down}.sql` — M2: columna `se_recoge_en_tienda` + backfill = NOT fulfillment; down copia a la vieja antes del DROP.
- `db/migrations/20261108120200_slt94_fulfillment_movimiento/{migration,down}.sql` — M3: enums, tabla, índices, FKs, RLS, REVOKE, misma empresa (generada con `--faltantes`), los dos CHECK tipo↔categoría desde la definición vigente (comprobada con `pg_get_constraintdef`), CHECK `NOT VALID` de `tarifa_valor`.
- `db/migrations/20261108120300_slt94_fulfillment_triggers/{migration,down}.sql` — M4: `fulfillment_registrar_movimiento` (helper) + los tres triggers.
- `tests/integration/db/_fixtures/fulfillment-94.ts` — siembra, creación por el repositorio real, lecturas y limpieza por catálogo.
- `tests/integration/db/slt94-fulfillment-cobro.test.ts` (21 casos).
- `tests/integration/db/slt94-fulfillment-cancelacion-api.test.ts` (5 casos).
- `tests/integration/db/slt94-iva-equivalencia.test.ts` (1 caso, 13 bordes).
- `tests/integration/db/migracion-slt94-ida-y-vuelta.test.ts` (5 casos).

Modificados:
- `db/schema.prisma` — `Usuario.fulfillmentRetirado @map("fulfillment")`, `Usuario.seRecogeEnTienda`, modelo `OrdenFulfillmentMovimiento` + 2 enums, valores nuevos en 4 enums, relaciones inversas.
- `lib/db/modelos-de-negocio.ts` — la tabla nueva como modelo de negocio (la usa el generador de misma empresa).
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` — 87 → 88 tablas con política.
- `scripts/verificar-rls-despliegue.ts` — 169 → 172 triggers de misma empresa.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R2 | `migracion-slt94-ida-y-vuelta` «R2: M2 deja la marca = NOT fulfillment…» |
| R12 | `slt94-fulfillment-cobro` «R12: la base rechaza (23514)…» |
| R15 | `slt94-fulfillment-cobro` «R15/R19…» y «R15: la ruta sin guía…»; `slt94-iva-equivalencia` |
| R16 | `slt94-fulfillment-cobro` «R16: B sin activar no cobra…» |
| R17 | `slt94-fulfillment-cobro` «R17: valor 0 (A2) o sin valor (A3)…» |
| R18 | `slt94-fulfillment-cobro` «R18: el cobro no depende de la marca…» |
| R19 | `slt94-fulfillment-cobro` «R15/R19…» |
| R21 | `slt94-fulfillment-cobro` «R21/R22…» |
| R22 | `slt94-fulfillment-cobro` «R21/R22…» |
| R23 | `slt94-fulfillment-cobro` «R23: carga parcial con skipDuplicates…» y «R23: la base rechaza un segundo cobro inicial…» |
| R24 | `slt94-fulfillment-cobro` «R24: si la transacción…se deshace…» |
| R25 | `slt94-fulfillment-cobro` «R25: servi_app no puede…(42501)» |
| R26 | `slt94-fulfillment-cobro` «R26/R31…» y «R26: la devolución lleva la fecha de la eliminación…» |
| R27 | `slt94-fulfillment-cobro` «R27: repetir la eliminación…» y «R27: dos eliminaciones a la vez…» |
| R28 | `slt94-fulfillment-cobro` «R28…»; `migracion-slt94-ida-y-vuelta` «R34/R28…» |
| R29 | `slt94-fulfillment-cobro` «R29: restaurar o1 re-cobra el MISMO…» |
| R30 | `slt94-fulfillment-cancelacion-api` «R30: cancelar por API devuelve…», «R30: …MISMA transacción…», «R30/D12: …ajuste_estado… NO devuelve» |
| R31 | `slt94-fulfillment-cobro` «R26/R31…» |
| R34 | `slt94-fulfillment-cobro` «R34…»; `migracion-slt94-ida-y-vuelta` «R34/R28…» |
| R35 | `migracion-slt94-ida-y-vuelta` «R35: los cuatro down.sql…» y «reaplicadas las cuatro…» |
| R38 | `slt94-fulfillment-cobro` «R38: activada B…» y «R38: como servi_app, A no ve…» |
| R39 | `slt94-fulfillment-cancelacion-api` «R39: cancelar → eliminar…», «R39: eliminar → restaurar → cancelar…» y la segunda fila `cancelacion_api` en «R30: cancelar por API devuelve…» |

Fuera de esta tanda: R1, R3–R11, R13, R14, R20, R32, R33, R36, R37, R40 (T2–T6).

### Mutaciones (cada test de dinero se mató antes de creerlo)

M4 (trigger mutado aplicado a `slt94_t1`, corridos los tres archivos de triggers; restaurado al final):

| Mutación | Rojo en |
|---|---|
| sin comprobar activación | R16, R38 |
| activación de cualquier empresa | R16, R38 |
| reverso a `NEW.tienda_id` (no la congelada) | R26/R31, R29 |
| restaurar sin mirar la causa del reverso | R39 (cancelar → eliminar → restaurar) |
| IVA con `trunc` en vez de `round` | IVA-equivalencia |
| trigger de cancelación también con `ajuste_estado` | R30/D12 (#42) |
| valor 0 cobra (`< 0` en vez de `<= 0`) | R17 |
| eliminar sin mirar el último movimiento | R27, R39 |
| reverso con fecha «ahora» en vez de `deleted_at` | R26 (fecha pasada) y R26/R31 — sobrevivió en la 1.ª ronda; se añadió el caso de fecha pasada |
| valor de cualquier tienda (sin filtro `tienda_id`) | R17, R18, R28 |
| restaurar con el valor vigente | R29 |
| cancelar sin mirar el último movimiento | R30 (segunda fila `cancelacion_api`) — sobrevivió en la 1.ª ronda; se añadió el caso |
| sin filas de IVA en el cobro | R15/R19, R29, R38 |

M3 / M2 (en la base o en el archivo, restaurados y comprobados con `cmp` / `migrate diff` vacío):

| Mutación | Rojo en |
|---|---|
| sin CHECK `tarifa_valor_fulfillment_solo_tienda_monto` | R12 |
| `GRANT INSERT, UPDATE, DELETE` a `servi_app` | R25 |
| sin único `(organizacion_id, orden_id, secuencia)` | R23 (segundo cobro inicial) |
| down de M3 borra toda la caja | R35 (ida y vuelta) |
| M2 sin backfill | R2, R35 |
| down de M2 sin copiar a la vieja | R35 |
| backfill que toca otra columna (`updated_at`) | R2 |

Hallazgo de los tests: el re-cobro de la restauración usaba `now()::timestamp(3)`, que depende del
TimeZone de la sesión (5 h de desfase en local). Corregido a `now() AT TIME ZONE 'UTC'`, como
`20261028130200_plan_topes_triggers`.

### Verificación (salida real, base `slt94_t1`)

- `prisma migrate deploy` (las 4) → «All migrations have been successfully applied.»
- `prisma migrate diff --from-config-datasource --to-schema=db/schema.prisma --script` → «-- This is an empty migration.» (también tras restaurar cada mutación).
- T1.1: los 4 `down.sql` en orden inverso (M4 con `db:rollback`; M3, M2, M1 con `prisma db execute` + borrar su fila de `_prisma_migrations`, que es lo que hace `db:rollback`, porque ese script solo sabe revertir la ÚLTIMA carpeta del disco) → `pg_enum` con los 10 valores: 10 → 0; reaplicadas → 10.
- `vitest run tests/integration/db/slt94-fulfillment-cobro.test.ts tests/integration/db/slt94-fulfillment-cancelacion-api.test.ts` → «Test Files 2 passed (2) · Tests 26 passed (26)».
- `vitest run tests/integration/db/slt94-iva-equivalencia.test.ts` → «Tests 1 passed (1)».
- `vitest run tests/integration/db/migracion-slt94-ida-y-vuelta.test.ts` → «Tests 5 passed (5)».
- `eslint` de los archivos TS tocados → «No issues found».
- `pnpm run test:guardias` → 339/341 archivos verdes. Rojos: `api-key-dependencias-usuario` (relación nueva `OrdenFulfillmentMovimiento.tienda`; clasificada en `tests/fixtures/api-key-dependencias-usuario.ts`, re-corrida verde 33/33 con `rls-por-empresa`) y `dependencias-declaradas-presentes` (PREEXISTENTE: `init.sh` de HEAD no llama a `scripts/verificar-dependencias.mjs`; no lo toca esta tanda).
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; con el heap por defecto muere por OOM) → ROJO, 54 errores, TODOS consecuencia buscada del schema y que cierran T2/T4:
  - rename `fulfillment` → `fulfillmentRetirado`: `UserRepository` (12), `PickingRepository` (4), `OrdenRepository` (2), `ApiKeyRepository` (1), y 14 tests/fixtures de integración que crean usuarios con `fulfillment:` (`_fixtures/{caja-459,libro-468,wallet-458}.ts`, `_picking-476.ts`, `cobro-plataforma-cargos`, `api-key-eliminabilidad`, `api-key-eliminar-tienda-destino`, `detalle-en-lote-464`, `estado-cuenta-cierre-pagos-172r52`, `estado-cuenta-servidor-458d`, `historial-accion-atomicidad`, `libro-caja-busqueda-orden-463`, `plan-sin-tope-ordenes`, `saldos-tiendas-busqueda-463`, `wallet-tienda-cobro`);
  - registros totales sobre las categorías/orígenes/acciones nuevas: `lib/types/{wallet,wallet-tienda,historial-accion}.ts` y sus derivados `WalletMovimientoRepository`, `WalletTiendaMovimientoRepository`, `PagoMensajeroMovimientoRepository`, `LibroCajaAutoriaRepository`, `EstadoCuentaRepository`, `HistorialAccionRepository`, `AnaliticaFinancieraService`, `abono-tienda-457.test`, `incentivo-mensajero-slt68.test`.
- Todo junto: `vitest run` de los 4 archivos de T1 + `api-key-dependencias-usuario` + `rls-por-empresa` → «Test Files 6 passed (6) · Tests 65 passed (65)».
- Barrido de los 85 tests de integración que nombran los enums/tablas tocados (`wallet_*`, `historial_accion_tipo`, `orden_historial_origen_tipo`, `tarifa_valor`), en `slt94_t1` → 35 archivos rojos, clasificados:
  - por base vacía (no es de esta tanda: piden una base con órdenes/usuarios sembrados — «tabla `orden` vacía», «0 usuarios», «sin zona»): `454/*`, `455/*`, `api-key-eliminabilidad`, `aviso-agregado-repository`, `confirmacion-fisica-migration`, `correccion-dia-reparto-historial`, `gasto-fijo-cobro-*`, `orden-traspaso-migration`, `premio-ranking-devengo-migration`, `wallet-458-migration`, `dinero-productos`; y desfasados de antes (`historial-accion-migration` espera «sin policies», `habilitacion-api-migration` sin `organizacion_id`);
  - catálogos TS vs `pg_enum` (`HISTORIAL_ACCION_TIPOS`, `WALLET_*_SEED`, `TIPO_POR_CATEGORIA_TIENDA`): los cierran T2.3 y T4.1 al registrar los valores nuevos — `abono-tienda-457-migration`, `api-key-eliminada-migration`, `caja-459-migration`, `cobro-tienda-461-migration`, `correccion-*-migration`, `geografia-*-migration`, `historial-accion-*-migration`, `wallet-461-migration`, `wallet-tienda-cobro-migration`;
  - literal del CHECK de caja: `caja-tesoreria-migration` 30 → 34 (actualizado aquí; re-corrido verde 31/31);
  - CHECK R12: `tarifas-flexibles-resolver`, `tarifas-flexibles-respaldo`, `tarifas-flexibles-snapshot` siembran `tienda_fulfillment` en zona/grupo y ahora la base lo rechaza (23514). Los rehace T3 (R14).

### Puntos donde el spec no alcanzó (decididos o abiertos)

1. **R21 vs FK `SET NULL`.** R21: «un cambio o borrado posterior de ese valor NO DEBE alterar ningún cobro». Design §1 M3: FK a `tarifa_valor` SET NULL. Implementado como dice el design: borrar el valor deja `tarifa_valor_id = NULL` en el cobro; monto, % IVA, IVA y tienda no cambian. Si R21 exige conservar también la referencia, la FK tendría que ser otra cosa (o sin FK). ABIERTO para Carlos/leader.
2. **Tienda del re-cobro al restaurar (R29).** El design dice «mismo monto/iva congelados» pero no qué tienda. Implementado: la tienda CONGELADA del movimiento anterior (coherente con R31 y con «el cobro original»), no la `tienda_id` actual de la orden. Confirmar.
3. **CHECK extra** `causa = 'creacion' ⇔ secuencia = 1` (además de los que pide el design): materializa «la secuencia 1 es el único cobro inicial» (R23). Y una cuarta función, `fulfillment_registrar_movimiento`, que escriben las tres del design (sin duplicar los 4 INSERT de libros tres veces); EXECUTE revocado a PUBLIC.
4. **T2 no lista todos los lectores de `fulfillment`.** Además de los de `tasks.md`: `lib/repositories/ApiKeyRepository.ts` (crea la cuenta dedicada con `fulfillment`) y 14 tests/fixtures de integración (lista arriba). Con el cliente regenerado, esos tests fallan en ejecución hasta T2. T4 tampoco lista los repositorios/servicios que heredan los registros (lista arriba).
5. **T3.2 choca con R12.** Pide en `tarifas-flexibles-resolver` «una fila de zona y una en % que no resuelven», pero el CHECK ya no deja insertarlas. El test tendrá que soltar el CHECK dentro de su transacción revertida (DROP → INSERT → ADD … NOT VALID) para simular filas anteriores al despliegue.
6. **R15 por servicio.** Las vías se ejercen por los dos escritores del repositorio (`createManyOrdenes` / `createManyOrdenesConGuia`); `BulkOrdenService` lee `fulfillment` (renombrado) y no corre hasta T2.
7. **`db:rollback`** solo revierte la última carpeta del disco: para T1.1 se usaron los `down.sql` con `prisma db execute` en orden inverso.

### Veredicto

T1 hecha: 4 migraciones con down, modelo Prisma, 32 casos de integración verdes y matados por mutación; typecheck rojo esperado hasta T2/T4.
