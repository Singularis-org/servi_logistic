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

## Tanda T2+T3+T4 — marca, valor de fulfillment y libros (backend_dev, 2026-11-08)

Tasks: T2.1–T2.5, T3.1–T3.2, T4.1–T4.2. Base desechable `slt94_t1` (DATABASE_URL exportada antes de
todo vitest). Sin cambios de schema (no hubo `prisma generate`).

### Decisiones del leader aplicadas
- R21 vs FK SET NULL: se queda. Monto, % IVA, IVA y tienda congelados intactos = R21 cumplido; solo la traza `tarifa_valor_id` pasa a NULL.
- R29: el re-cobro va a la tienda congelada del cobro original (confirmado).
- Hueco 4: añadidos `ApiKeyRepository` (cuenta dedicada con `seRecogeEnTienda: true`, D13), los 14 tests/fixtures y los repos/servicios de registros.
- Hueco 5: el test de R14 en `tarifas-flexibles-resolver` suelta el CHECK de R12 dentro de su tx revertida, siembra zona/grupo/tienda-zona/tienda-grupo/% y lo repone `NOT VALID`.
- Hueco 6: R15 por servicio en `slt94-marca-y-vias.test.ts` (pantalla por route handler, carga masiva y API key).

### Archivos
lib/app (backend): `BulkOrdenService` (las dos vías: `resolverDestinoCreacion(!seRecogeEnTienda)`, un destino por lote; API: dueño que no resuelve → «tienda no encontrada»; sin órdenes no llama al repo), `destino-creacion`, `OrdenRepository.findUsuarioSeRecogeEnTienda` (+ `IOrdenRepository`), `UsuarioService.resolverSeRecogeEnTienda`, `UserRepository` (+ historial `usuario_se_recoge_en_tienda_cambiado`), `IUserRepository`, `lib/types/usuario.ts`, `ApiKeyRepository`, `PickingRepository` (+ interfaz), `lib/types/historial-accion.ts`, `ingreso-empresa.ts` (retirado `tieneFulfillment`), `lib/tarifas/niveles.ts` (R10), `lib/types/tarifa-flexible.ts` (R11), `lib/tarifas/precedencia.ts` (`rangoFulfillment`, R14), `resolver-tarifas.ts` (comentario), `lib/types/wallet.ts`, `wallet-tienda.ts`, `invariante-tiendas.ts`, `caja-tesoreria.ts`, `aporte-por-orden.ts`, `desglose-tienda.ts`, `estado-cuenta-chips.ts`, `estado-cuenta.ts` (nota: sin pares), `wallet-rotulos.ts`, `metrics.ts`, `OrigenLegibleService` + `OrigenLegibleRepository` + interfaz (`movimientosFulfillment`), `libro-caja-a-quien-sql.ts` (rama FULFILLMENT con la tienda congelada), comentarios en `IBulkOrdenService`, `cotizacion.ts`, `app/api/ordenes/api-key/carga/route.ts`; `scripts/demo-qa/receta.ts`; fábricas (`empresa-y-usuarios`, `e2e`, `escenarios/reparto`) y `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`.

Tests nuevos: `tests/unit/tarifas/niveles.test.ts`, `tests/unit/utils/slt94-fulfillment-caja.test.ts`, `tests/integration/db/slt94-marca-y-vias.test.ts`. Actualizados: unitarios de bulk/usuario/user-repo/orden-repo/picking/usuario-schema/api-key/precedencia/tarifa-valor/origen-legible/wallet-labels/convergencia y de caja (composición, IVA, kardex, 457, desglose, wallet-service, financiera); guardias de caja (459, composición, métricas), historial (censo 85, `usuario_fulfillment_cambiado` a SIN_ESCRITOR desde SLT-94), catálogo de Postgres (dos consultas de T1 sin esquema); integración: tarifas-flexibles-{resolver,respaldo,snapshot}, caja-tesoreria-migration, historial-accion-atomicidad, listas «posteriores» de migraciones (cobro-tienda, conciliación, wallet-tienda-cobro) y (f) de 457/458; fixtures `fulfillment:` → `seRecogeEnTienda:`; ~16 tests de componentes solo en sus fixtures de DTO.

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R1 | `user-repository.crud` «SLT-94 R1…»; `usuario-schema` «SLT-94 R1…» |
| R3 | `user-repository.crud` «SLT-94 R3…»; `usuario-service` «SLT-94 R3…» |
| R4 | `usuario-service` «SLT-94 R4…» (5 casos, incl. D13 apiKey) |
| R5 | `bulk-orden-service` «SLT-94 R5…»; `bulk-orden-service.carga-api` «SLT-94 R5…»; `orden-repository` «SLT-94 R5…»; `slt94-marca-y-vias` (pantalla, masiva, API) |
| R6 | `bulk-orden-service.carga-api` «SLT-94 R6/R18…» y «lote con fulfillment en una zona y no en otra» |
| R7 | `slt94-marca-y-vias` «SLT-94 R7…»; `picking-repository` «SLT-94 R7…» |
| R8 | `slt94-marca-y-vias` «SLT-94 R8…»; `historial-accion-atomicidad` «SLT-94 R8…» (requiere base sembrada) |
| R10 | `niveles.test` «SLT-94 R10…»; `tarifa-valor-service` «SLT-94 R10…» |
| R11 | `tarifa-valor-service` «SLT-94 R11…» |
| R14 | `precedencia` «SLT-94 R14…»; `tarifas-flexibles-resolver` «SLT-94 R14…» (2); `convergencia-tarifa-listado-cierre` «SLT-94 R14…» |
| R15 (vías) | `slt94-marca-y-vias` (pantalla, masiva, API) |
| R18 | `slt94-marca-y-vias` pantalla/masiva; `carga-api` R6/R18 |
| R19, R20, R26 (caja) | `slt94-fulfillment-caja` «SLT-94 R19…», «SLT-94 R20…» (3), «SLT-94 R26…» |
| R23 (servicio) | `slt94-marca-y-vias` API (reintento) |
| R32 | `tarifas-flexibles-snapshot` (el cierre congela el fulfillment de la tienda y no lo liquida: wallet solo flete+IVA) |
| R33 | `slt94-marca-y-vias` API (publica 1000.00/130.00 = lo cobrado); `carga-api` R6/R18 |
| R36 | `wallet-origen-legible` «SLT-94 R36…» (3) + caso del catálogo; `wallet-labels` |
| R37 | `slt94-fulfillment-caja` «SLT-94 R37…» (2); guardia `metrics-caja-naturaleza` |

Fuera de esta tanda: R9, R13 (T5), R40 (T6.1).

### Mutaciones (19, todas ROJAS; restauradas con comparación de bytes)
R5 API sin negar la marca (10 rojos) · R5 masiva sin negar (12) · R7 SQL al revés (1) · R7 selector al revés (1) · R8 sin registrar (1) · R8 registra sin cambio (1) · R3 default repo false (1) · R3 default service false (1) · R4 sin invariante (4) · R10 sin restricción de nivel (8) · R11 sin restricción de modo (1) · R14 nivel ignorado (8) · R14 % no ignorado (3) · R20 fulfillment como efectivo (2) · R20 IVA como ganancia (3) · R19 cobro en «a favor» (1) · R37 ganancia sin fulfillment (1) · R36 origen sin leer la orden (4) · R36 sin guía (2).

### Verificación (salida real)
- `pnpm run typecheck` (8 GB) → 11 errores, TODOS en UI de T5 (no tocada por regla): `UsuarioForm.tsx`, `mi-wallet-labels.ts`, `desglose-tienda-labels.ts`, `ComposicionGananciaCard.tsx` (2), `composicion-detalle-labels.ts`, `DesgloseEgresosLista.tsx` y sus tests `usuario-form.test.tsx` (2), `mi-wallet-labels.test.ts`, `desglose-tienda-labels.test.ts`. lib/, tests de backend y scripts: 0.
- `eslint` de los archivos tocados → 0 errores, 2 warnings preexistentes.
- `vitest run` de 29 archivos (unit + integración SLT-94 + tarifas + caja) → «Test Files 29 passed · Tests 777 passed».
- `test:guardias` → 335/341 al principio; las 5 rojas de esta tanda arregladas y re-corridas verdes (175/175); queda `dependencias-declaradas-presentes` (PREEXISTENTE, ya en T1).
- `vitest related` de los 35 archivos de lib/app → rojos clasificados: (a) base `slt94_t1` sin datos sembrados (454/455/477/484, picking-476, historial-accion-atomicidad/lectura, caja-invariante, analítica, etc.: «la base no tiene zona», «hacen falta 2 usuarios»); (b) PREEXISTENTES por listas posicionales/conteos de enum que no actualizaron SL-45/SLT-73 (`abono-457 (a)`, `wallet-458 (a)`, `caja-459 (a)`, `cobro-461 (a)`, `wallet-461 (a)`); (c) UI de T5: tests de componentes de la wallet que renderizan `ComposicionGananciaCard`/labels de app y `usuarios-nombre-no-imprimible` (el form aún manda `fulfillment`).

### Huecos del spec
1. Typecheck verde exige T5: además de lo que lista T5.3 faltan `app/(app)/wallet/_components/composicion-detalle-labels.ts` y `DesgloseEgresosLista.tsx` (Records totales sobre egresos nombrados). Hasta T5, `UsuarioForm` manda `fulfillment` y el borde zod (strict) lo rechaza: el alta/edición de usuarios por pantalla queda rota hasta T5.1. T5 NO puede salir separada de esta tanda.
2. R37 «fulfillment neto»: en lib la composición da dos filas (`ingreso_fulfillment` y `egreso_reverso_fulfillment`, este como egreso nombrado); la fila neta la arma la tarjeta (T5.3).
3. Estado de cuenta: cobro y devolución de fulfillment no forman par anulable (`claveDeParTienda` → null): cada evento tiene su `origen_id`. Ambas filas se ven; la suma cuadra.
4. `efecto-movimiento.ts` (listado en design §4) no cambia: su Record es sobre conceptos manuales, y el fulfillment no se registra a mano.
5. `tarifas-flexibles-snapshot`: el fulfillment pasó de grupo a precio propio, así que ahora se congela en las 3 órdenes del escenario (literales actualizados; el caso json_agg quita el de A para seguir midiendo la fila ajena).

### Veredicto
T2–T4 hechas, 19 mutaciones muertas; el backend compila. El typecheck sigue rojo solo por la UI de T5 (11 errores).

## Tanda T5 — pantallas (frontend_dev, 2026-11-08)

Tasks: T5.1, T5.2, T5.3. Solo `app/` y `tests/`; `lib/` sin tocar. Sin dev server. Vitest con
DATABASE_URL hacia la desechable `slt94_t1` (construida desde .env sin imprimirla).

### Archivos
- `app/(app)/configuracion/_components/UsuarioForm.tsx` — switch «Se recoge en tienda» (solo `adminTienda`),
  manda `seRecogeEnTienda` (ya no `fulfillment`, que el zod estricto rechazaba); default «sí» (R3).
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts` — `conceptoEnNivel` (fulfillment solo en
  tienda/todas sus zonas), `modoFijo` (fulfillment siempre monto), texto `fulfillmentSoloTienda`.
- `app/(app)/configuracion/tarifas/_components/TarifasValores.tsx` — filtra el fulfillment fuera de zona,
  grupo, tienda-zona y tienda-grupo (con nota); sin selector de modo; el envío fuerza `modo: monto` aunque
  lo guardado fuera un % viejo (R14).
- `app/(app)/mi-wallet/_components/mi-wallet-labels.ts`, `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts` —
  4 rótulos de fulfillment (desde la tienda / desde la empresa = mismo texto que la caja).
- `app/(app)/wallet/_components/ComposicionGananciaCard.tsx` — icono `Package` de `ingreso_fulfillment`, tono
  del IVA del fulfillment y su devolución, descripción nombra «fulfillment».
- `app/(app)/wallet/_components/composicion-detalle-labels.ts`, `DesgloseEgresosLista.tsx` — fila
  «Devoluciones de fulfillment a una tienda» (+ icono `Undo2`).
- `app/(app)/wallet/_components/wallet-labels.ts` — pista del IVA: «sobre el flete, el fulfillment y la comisión».
- Tests: nuevo `tests/components/TarifasFulfillmentSoloTienda.test.tsx`; actualizados `usuario-form`,
  `mi-wallet-labels`, `desglose-tienda-labels`, `wallet-labels`, `ComposicionGananciaCard` (+ bloque SLT-94 R37),
  `WalletCajaIvaSL39`, `TarifasValores`, `DetalleFilaComposicion`, `tests/integration/wallet-page`.

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R3 (pantalla) | `usuario-form` «SLT-94 R3/R9: el switch inicia en «sí»…» |
| R9 | `usuario-form` bloque «se recoge en tienda (SLT-94 R9)» (6 casos: visible solo adminTienda, alta manda `seRecogeEnTienda` y no `fulfillment`, oculto y sin enviar en otro rol, prefill, edición) |
| R13 | `TarifasFulfillmentSoloTienda` (4 niveles sin fulfillment + nota; tienda/todas sin selector, monto + IVA; payload 1000 + 13 % monto con tiendaId y sin zona/grupo) |
| R11/R14 (pantalla) | `TarifasFulfillmentSoloTienda` «un % viejo guardado no se arrastra…» |
| R36 | `desglose-tienda-labels` «SLT-94 R36…» + literales; `mi-wallet-labels` (22 textos, origen `orden_fulfillment`) |
| R37 | `ComposicionGananciaCard` «SLT-94 R37…» (2) + pares fila a fila; `WalletCajaIvaSL39` (IVA del fulfillment); `DetalleFilaComposicion` (23 controles) |

### Mutaciones (10, todas ROJAS; restauradas con comparación de bytes)
M1 form manda `fulfillment` (1) · M2 switch para todos los roles (2) · M3 default «no» (2) · M4 fulfillment en
todo nivel (4) · M5 con selector de modo (2) · M6 editar no fuerza monto (1) · M7 fila de devolución con otro
nombre (2) · M8 fila de ingreso con importe del vecino (1) · M9 rótulo empresa distinto de la caja (3) ·
M10 mi-wallet lee desde la empresa (3).

### Verificación (salida real)
- `pnpm run typecheck` (8 GB) → exit 0, 0 errores (antes 11).
- `eslint` de los 17 archivos tocados → exit 0, sin salida.
- 8 archivos de componentes tocados → «Tests 172 passed» (tras arreglos).
- `vitest related --run` de los 9 archivos de `app/` → «Test Files 135 passed · 2 failed», los 2 de esta tanda
  (`DetalleFilaComposicion` 19→23 controles, `wallet-page` 5→6 ingresos / 4→6 IVA); arreglados y re-corridos:
  «Tests 44 passed».
- Guardias (`tests/unit/guards/`) → 238/239 archivos; solo `dependencias-declaradas-presentes` (PREEXISTENTE, ya en T1).

### Huecos
1. **R37 «neto»: decidido NO restar en la tarjeta.** La composición pinta «Fulfillment cobrado a la tienda» en
   Ingresos y «Devoluciones de fulfillment a una tienda» en Egresos (como el reverso del cobro a una tienda);
   el pie (ganancia del servidor) ya trae el neto. Una fila neta única exigiría (a) restar dinero en el
   navegador, prohibido por R12 de la 231 (la tarjeta no suma ni resta), y (b) que «Total de ingresos» y
   «Total de egresos» dejen de cuadrar con sus filas y con `ingresosPropios`/`egresosPropios` de la tarjeta
   de la caja. Si se quiere la fila neta, que la dé el servidor (lib, `fulfillmentNeto` + totales netos):
   requiere decisión del leader/Carlos.
2. Pistas de la cabecera del desglose (`cargosHint` de Mi wallet y de /wallet/tiendas) siguen sin nombrar el
   fulfillment («Fletes, comisión, IVA, …»); están fijadas con literales aprobados (HD3) y no las toqué.
3. En solo lectura, un % viejo de fulfillment guardado (R14, inerte) se sigue pintando con su modo «%».
   En producción hay 0 filas (T0).

### Veredicto
T5 hecha: typecheck verde, usuarios por pantalla reparados, 10 mutaciones muertas; R37 queda con dos filas
(ingreso y devolución) y el neto en el pie, pendiente de confirmar.

## Tanda T6 — guardia y E2E (backend_dev, 2026-11-08)
Tasks: T6.1, T6.2. Vitest con `DATABASE_URL` = `slt94_t1`; E2E con una base desechable NUEVA `slt94_e2e`
(mismo servidor local, DROP/CREATE + `prisma migrate deploy` + `db:seed`, solo catálogos, como un grupo de
CI). La base de desarrollo no se tocó.

### Archivos
- `tests/unit/guards/fulfillment-solo-al-crear.guardia.test.ts` (nuevo, 36 casos): (a) ningún `categoria:` con
  las 8 categorías nuevas, ni `origenTipo: "orden_fulfillment"`, ni su literal SQL, ni escritura Prisma/SQL en
  `orden_fulfillment_movimiento` en `lib/` y `app/`; (b) ni `fulfillmentRetirado` ni `"fulfillment" =`/`IS`/`<>`;
  (c) toda llamada a `resolverDestinoCreacion(` recibe `!…seRecogeEnTienda` (control: las 2 de
  `BulkOrdenService`); R40: `TRANSICIONES.devolviendo_a_tienda` → exactamente `[devuelta_a_tienda]`, y el
  literal `"cancelacion_api"` solo en el catálogo (`orden-historial.ts`), en los `via:` de
  `order-status-transiciones.ts` y UNA vez, como `origenTipo`, dentro de `OrdenRepository.cancelarViaApi`
  (perderlo también es rojo). Comentarios quitados con `quitarComentarios` (el quitador único del repo).
- `e2e/fulfillment-cobro-por-paquete.spec.ts` (nuevo, 3 pasos en serie): el maestro digita por la pantalla de
  Tarifas el fulfillment de la tienda (precio propio, todas sus zonas: 1000 + 13 %) y activa; la tienda carga
  una orden (`cargarMasiva`); `/mi-wallet` muestra «La empresa te cobró el fulfillment» 1.000 y «… el IVA del
  fulfillment» 130, «Cargos de la empresa» 1.130 y el saldo pasa de «En cero» 0 a «En contra» 1.130; el
  maestro ve «Fulfillment cobrado a la tienda» 1.000 e «IVA del fulfillment cobrado a la tienda» 130 en
  `/wallet/tiendas/[id]`; la tienda elimina la orden (`EliminarOrdenService` montado como su Server Action):
  aparecen «La empresa te hizo la devolución de fulfillment» 1.000 y «… del IVA del fulfillment» 130, «A tu
  favor» 1.130 y el saldo vuelve a «En cero»; la oficina ve las dos devoluciones. Por detrás, la bitácora de
  la orden: `1:cargo:creacion:1000.00:13.00:130.00` → `+ 2:reverso:eliminacion:…`. Rótulos y cifras escritos
  a mano (los de T5: `mi-wallet-labels.ts`, `desglose-tienda-labels.ts`).
- `playwright.config.ts`: el spec, en el grupo `dinero`.

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R25 | guardia (a) «ningún archivo de lib/ ni app/ escribe el cobro…» |
| R4/D4 (marca vieja) | guardia (b) |
| R5/R18 (destino por la marca) | guardia (c) |
| R40 | guardia «(R40) devolviendo_a_tienda solo sale…» y «(R40) "cancelacion_api" como origen…» |
| R15, R19, R26, R36 (E2E) | `fulfillment-cobro-por-paquete.spec.ts` pasos 2 y 3 |
| R13 (E2E) | idem paso 1 (fulfillment en precio propio, solo monto) |

### Autocomprobación / mutaciones (todas ROJAS, árbol restaurado y comprobado con `git status`)
- Sintéticas dentro de la guardia: 16 escrituras de (a), 4 de (b), 3 argumentos inválidos de (c), 4 casos de R40.
- Sobre el árbol real: archivo plantado en `lib/` con categoría nueva + origen + `fulfillmentRetirado` +
  `cancelacion_api` → rojos (a), (b), R40 · `BulkOrdenService` con `resolverDestinoCreacion(tieneFulfillment)`
  → rojo (c) · arista nueva `devolviendo_a_tienda → en_bodega_central` → rojo R40 · `cancelarViaApi` con
  `origenTipo: "ajuste_estado"` → rojo R40.
- E2E: `DISABLE TRIGGER fulfillment_al_crear_orden` en `slt94_e2e` → paso 2 ROJO en la bitácora de la base;
  quitando esa aserción, ROJO en la pantalla («La empresa te cobró el fulfillment», esperado 1). Trigger
  reactivado y spec restaurado (`cmp`).

### Verificación (salida real)
- `vitest run tests/unit/guards/fulfillment-solo-al-crear.guardia.test.ts` → «Tests 36 passed (36)».
- `pnpm run test:guardias` → «Test Files 1 failed | 341 passed (342)»; el rojo es `dependencias-declaradas-presentes` (PREEXISTENTE, ya en T1).
- `pnpm run typecheck` (8 GB) → `TC_EXIT=0`.
- `eslint` de los 3 archivos → `ESLINT_EXIT=0`, sin salida.
- E2E local (`E2E_SERVIDOR=dev`, puertos 3194/54394, base `slt94_e2e`):
  `playwright test e2e/dos-empresas-humo.spec.ts e2e/fulfillment-cobro-por-paquete.spec.ts --project=aislamiento --project=dinero`
  → «21 passed (4.5m)» (incluye `plataforma-vacia` por dependencia), `E2E_EXIT=0`. En el log del servidor hay
  2 avisos «Hydration failed» del navegador (modo dev, no hacen caer ningún test; no atribuidos a una pantalla).
  Servidores apagados y `.next/dev` borrado.

### Veredicto
T6 hecha: guardia verde y matada por 4 mutaciones reales y sus sintéticas; E2E y dos-empresas-humo verdes en local, y el E2E rojo con el trigger apagado.
