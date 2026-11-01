# impl SLT-76 «Deuda de los hotfix SLT-73 y SLT-75» (HOTFIX a prod)

Rama `hotfix/SLT-76-deuda-hotfix-73-75` (sale de `origin/prod`), worktree `.worktrees/SLT-76-hotfix`.
Alcance del implementer: T1-T9. T0 (verificación en prod) y T10 (PR, CI, deudas en dev) son del leader.

Bases locales (Postgres 18.2, nunca producción), con `migrate deploy` y `db:seed`:
- `servi_slt76`: base del bloque A, de los E2E y del gate (acumulada);
- `servi_slt76_mig`: base de migraciones del bloque B (ida, bajada e ida);
- `servi_slt76_t7`: base limpia del bloque 7.

Evidencia completa por subagente (logs y detalle), en el scratchpad de la sesión:
`impl_slt76_{A,B,C,D,E}.md`. Aquí va lo consolidado.

## Reparto y commits

| Subagente | Tareas | Commit |
|---|---|---|
| D frontend_dev | T1, T8 | `3546fcc6` |
| C backend_dev | T7 | `894e1b7e` |
| B backend_dev | T6, T9 | `0e399a41` |
| A backend_dev | T3, T2 (back), T4, T5 | `13fc3a90` |
| E frontend_dev | T2 (front) + paso 3 del E2E | `d803a85c` |

## Archivos

- **Bloque 1:** `app/(app)/cierres-admin/_components/cierre-factura.tsx`, `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`; nuevos `tests/components/CierreFacturaFechaCR.test.tsx`, `tests/unit/guards/cierres-fecha-cr.guardia.test.ts`.
- **Bloques 2, 3 y 4:** nuevo `lib/repositories/_shared/conciliacion-con-dinero.ts`; `lib/repositories/{CierresBodegaAdminRepository,CierreBodegaRepository,SaldosSatelitesRepository}.ts`, `lib/interfaces/repositories/ICierreBodegaRepository.ts`, `lib/interfaces/services/ICierreBodegaService.ts`, `lib/services/CierresBodegaAdminService.ts`, `lib/types/conciliacion-satelites.ts`, `components/shared/conciliacion/ConciliacionAcciones.tsx`, `e2e/cierre-bodega-satelite.spec.ts` (paso 3); tests nuevos `tests/integration/db/slt76-{desmarcable,revertir-con-ajuste}.int.test.ts`, `tests/unit/guards/conciliacion-esperado-unico.guardia.test.ts`; ajustados `tests/integration/db/slt73-marcar-asienta.int.test.ts`, `tests/fixtures/marca-conciliacion.ts`, `tests/components/{ConciliacionAccionesConAsientos,ConciliacionSateliteCascada}.test.tsx`, `tests/integration/wallet-satelites.test.tsx`, `tests/unit/descarga/saldos-satelites-descarga-columnas.test.ts`, `tests/unit/repositories/{cierre-bodega-repository,cierres-bodega-admin-marca,cierres-bodega-admin-repository}.test.ts`, `tests/unit/services/cierres-bodega-admin-service.test.ts`. `ConciliacionSatelite.tsx` y `CierresBodegaAdminModule.tsx` no cambian: pasan el objeto entero del servidor, que ya trae el campo, y el typecheck lo exige.
- **Bloque 5:** nuevo `tests/integration/db/slt76-estado-cuenta-bodega-dos-empresas.int.test.ts`.
- **Bloque 6:** nueva `db/migrations/20261102090000_slt76_historial_zona_distrito/{migration,down}.sql`; `db/schema.prisma`, `lib/types/historial-accion.ts`, `lib/repositories/ZonaRepository.ts`; tests nuevos `tests/integration/db/{zona-distrito-rastro,historial-accion-zona-distrito-migration}.test.ts`; ajustados `catalogo-y-choke-point`, `historial-accion-escrituras-cubiertas.guardia`, `historial-acciones-descarga-columnas`, `zona-repository` y, porque fallaron al correrlos, los tests de migración del historial `caja-459-migration`, `correccion-resultado-gestion-migration` y `historial-accion-{cobro-tienda,conciliacion-bodega,orden-zona-reconciliada,zona-pago-mensajero,zona-sinpe}-migration`.
- **Bloque 7:** `tests/integration/db/{liquidacion-reparto-migration,geografia-por-pais,indices-rutas-calientes,salida-a-reparto-sql-real}.test.ts`.
- **Bloque 8:** `specs/SLT-73-dinero-satelite-al-conciliar/{requirements,design,tasks}.md`, `specs/SLT-75-distrito-zona-unica/requirements.md`, `tests/integration/wallet-satelites.test.tsx`, `tests/unit/guards/slt73-nota-conciliacion.guardia.test.ts`, `tests/components/CajaComposicionBarra.test.tsx`, `tests/unit/descarga/libro-kardex-468.test.ts`.
- **Bloque 9:** nueva `db/migrations/20261102090100_slt76_retirar_respaldos/{migration,down}.sql`; editados los `down.sql` de `20261031140200_slt73_retirar_asientos_satelite` y `20261101090000_zona_distrito_duplicados_sin_zona` (ningún `migration.sql` existente cambia); borrado `tests/integration/db/respaldo-convivencia-slt73-slt75.test.ts`; nuevo `tests/integration/db/slt76-retirar-respaldos-migration.test.ts`; ajustados `slt73-migracion-retira-asientos.int.test.ts` y `zona-distrito-unica-migration.test.ts`.

## Mapa R -> test

| R | Test |
|---|---|
| R1 | `tests/components/CierreFacturaFechaCR.test.tsx`: `2026-11-01T05:03:00.000Z` → `2026-10-31` escrito a mano en la cabecera compacta, Solicitado/Resuelto, «Conciliado el» de bodega, comprobante propio y `CierreFacturaDetalle`; «—» con `null` e instante inválido |
| R2 | `tests/unit/guards/cierres-fecha-cr.guardia.test.ts` (contraprueba y suelo de archivos) |
| R21 | `tests/unit/descarga/{cierre-dia,cierres-admin,cierres-bodega,cierres-gestiones-fundida}-descarga-columnas.test.ts` › describe «R21» (`2026-11-01T05:03:00.000Z` → `2026-10-31` a mano en las 7 columnas; `resueltoAt` null sigue null); `cierres-fecha-cr.guardia.test.ts` con `DESCARGAS_PENDIENTES` vacía |
| R3 | `tests/components/ConciliacionAccionesConAsientos.test.tsx` › «SLT-76 R3» (4 casos); `tests/integration/db/slt76-desmarcable.int.test.ts` (el dato en las 5 lecturas de las dos superficies); E2E `cierre-bodega-satelite` paso 3 |
| R4 | `tests/integration/db/slt76-desmarcable.int.test.ts`: `revertirConciliacion` da `con_asientos`/`con_asientos`/`updated` y coincide con `desmarcable` en las superficies |
| R5 | `tests/integration/db/slt76-revertir-con-ajuste.int.test.ts` (y en unit `cierres-bodega-admin-marca.test.ts` › «SLT-76 R5») |
| R6 | `tests/unit/guards/conciliacion-esperado-unico.guardia.test.ts`; `tests/integration/db/slt73-marcar-asienta.int.test.ts` › «R6 (SLT-76): snapshot 9.000 / 1.500 / 500…» (esperado `7000.00`, diferencia `100.00`) |
| R7 | `tests/integration/db/slt76-estado-cuenta-bodega-dos-empresas.int.test.ts` (B lee A: vacío y 0,00; A lee A: cifras a mano; espejo; CONTROL del dueño que ve la fuga) |
| R8 | `tests/integration/db/zona-distrito-rastro.test.ts` › «R8/R9: {D1, D2} -> {D2, D3} deja DOS filas con el mismo lote» |
| R9 | idem, y «R9: … 70 caracteres queda recortado a 60» |
| R10 | `zona-distrito-rastro.test.ts` › «R10: guardar otra vez…» y «R10: un guardado rechazado…»; `tests/unit/repositories/zona-repository.test.ts` › «SLT-76 — update sin cambio de distritos» |
| R11 | `tests/unit/components/historial-acciones-descarga-columnas.test.ts` › «SLT-76 (R11)»; `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` › «SLT-76 (R11)» |
| R12 | `tests/integration/db/liquidacion-reparto-migration.test.ts` › «SLT-76 R12: antes del primer DDL tiene el aviso de la 227 Y `usuario` en ACCESS EXCLUSIVE» |
| R13 | `tests/integration/db/geografia-por-pais.test.ts` › «R11: un nodo en otro país…» y «R11: mover un cantón a una provincia de otro país con distritos…» |
| R14 | `tests/integration/db/indices-rutas-calientes.test.ts` › «AnaliticaOperativaRollupRepository.agregarCubos -> analytics_daily_organizacion_id_fecha_idx» |
| R15 | `tests/integration/db/salida-a-reparto-sql-real.test.ts` › «SLT-76 R15: un canton de OTRO pais que ordena primero no se cuela» |
| R16 | `tests/unit/guards/slt73-nota-conciliacion.guardia.test.ts`; `tests/integration/wallet-satelites.test.tsx` › «SLT-73 R35 … (Q10, definitiva)»; literales de `CajaComposicionBarra` y `libro-kardex-468` |
| R17 | `tests/integration/db/slt76-retirar-respaldos-migration.test.ts` › «R17: tras la migracion no queda…» y «R17: con un objeto ajeno…» |
| R18 | idem › «R18: sin respaldo, el down de SLT-73 falla nombrando SLT-76 y ningun libro cambia» |
| R19 | idem › «R19: la migracion no cambia `zona_distrito` ni `wallet_movimiento`», «R19: down de datos de SLT-75 no falla», «R19: deja un NOTICE que nombra SLT-76» |
| R20 | idem › «R20: el down de SLT-76 no recrea ninguna tabla» y «R20: el down dice por escrito que los datos no se recuperan» |

## Mutaciones (cada una: grep = 1 → rojo; revertida → grep = 0 → verde)

| # | Mutación | Rojo | Verde |
|---|---|---|---|
| T1-M1 | `fecha()` vuelve a `iso.slice(0, 10)` | `CierreFacturaFechaCR`: `Tests 6 failed (6)` | `6 passed (6)` |
| T1-M2 | `c.solicitadoAt.slice(0, 10)` en `CierreDiaModule` | guardia: `Tests 1 failed \| 1 passed (2)` | `2 passed (2)` |
| T3 | el predicado ignora los ajustes | `Tests 1 failed \| 1 passed (2)` (cae slt76, slt73-revertir sigue verde) | `55 passed (55)` |
| T2-back | el predicado devuelve `Set` vacío | `slt76-desmarcable`: `Tests 1 failed \| 1 passed (2)` | `2 passed (2)` |
| T2-front | el componente ignora `desmarcable` | `Tests 2 failed \| 4 passed (6)` | `6 passed (6)` |
| T4a | vuelve `paraLaCentral(...)` a mano | guardia: `Tests 1 failed \| 3 passed (4)` | `4 passed (4)` |
| T4b | `esperadoDe` sin restar rechazos | `slt73-marcar-asienta`+`saldo-satelites`: `Tests 7 failed \| 21 passed (28)`; `slt73-deuda-satelite`+`slt73-corregir-diferencia`: `3 failed \| 5 passed (8)` | `28 passed`, `8 passed` |
| T5 | `DISABLE ROW LEVEL SECURITY` sobre `cierre_bodega` en la tx | `Tests 1 failed (1)` (B ve `900.00` de A) | `1 passed (1)` |
| T6-M1 | intercambiar anterior y nuevo | `Tests 2 failed \| 2 passed (4)` | `4 passed (4)` |
| T6-M2a | quitar la condición «sin cambios» | integración: sobrevive (equivalente); unit nuevo: `1 failed \| 64 passed (65)` | `65 passed (65)` |
| T6-M2b | quitar el filtro del diff | `Tests 3 failed \| 1 passed (4)` | `4 passed (4)` |
| T6-M3 | escribir con `this.prisma` | `Tests 7 failed \| 79 passed (86)` | `86 passed (86)` |
| T6-M8/M9 | etiqueta y categoría de R11 | `2 failed \| 66 passed (68)`; `4 failed \| 64 passed (68)` | `68 passed` |
| T7.1a | sin `LOCK TABLE usuario` | `Tests 1 failed \| 24 passed (25)` | `25 passed (25)` |
| T7.1b | sin `serializarEscriturasReales` | `Tests 1 failed \| 24 passed (25)` | `25 passed (25)` |
| T7.2 | FK a `ON UPDATE CASCADE` en la tx | `Tests 1 failed \| 10 passed (11)` | `11 passed (11)` |
| T7.3 | `DROP INDEX` del compuesto en la tx | `Tests 1 failed \| 12 passed (13)` | `13 passed (13)` |
| T7.4 | sin el `where` del cantón | `Tests 1 failed \| 6 passed (7)` | `7 passed (7)` |
| T8 | una letra de `CONCILIACION_ASIENTA_NOTA` | `Tests 3 failed \| 40 passed (43)` | `43 passed (43)` |
| T9-M4 | `DROP SCHEMA … CASCADE` | `Tests 2 failed \| 7 passed (9)` | `9 passed (9)` |
| T9-M5 | sin el `RAISE` del down de SLT-73 | `Tests 1 failed \| 8 passed (9)` | `9 passed (9)` |
| T9-M6 | sin el `IF` del down de SLT-75 | `Tests 2 failed \| 7 passed (9)` | `9 passed (9)` |
| T9-M7 | `NOTICE` sin «SLT-76» | `Tests 1 failed \| 8 passed (9)` | `9 passed (9)` |

## Migraciones (base `servi_slt76_mig`)

- `20261102090000`: deploy EXIT=0 → `db:rollback` «Rollback completado» (enum 73→72) → deploy EXIT=0 → `migrate diff` «-- This is an empty migration.» → `migrate status` «275 migrations found… Database schema is up to date!».
- `20261102090100`: antes `{t73:true,t75:true,esquema:true}` → deploy `{false,false,false}` → `db:rollback` «Rollback completado» (sigue `{false,false,false}`: el down no recrea) → deploy EXIT=0 → `migrate diff` vacío → `migrate status` «276 migrations found… up to date».
- `servi_slt76`: las dos aplicadas con `migrate deploy`; `migrate status` «Database schema is up to date!».

## Salida real de los tests

- A: 9 archivos de integración `Test Files 9 passed (9)` · `Tests 55 passed (55)`; dobles unit `3 passed (3)` · `48 passed (48)`.
- B: corrida de 31 archivos `Test Files 6 failed | 25 passed (31)` · `Tests 7 failed | 502 passed | 12 skipped`. Los 7 rojos son los que ya fallaban antes de tocar nada (medido) y están todos en `tests/baseline-rojos.json`.
- C: los 4 del bloque 7 juntos: `Test Files 4 passed (4)` · `Tests 56 passed (56)`, en `servi_slt76_t7` y en `servi_slt76`. D32 en solitario 8/8; con otros 5 archivos que escriben en `usuario`, 5/5; con los 80 de `tests/integration/db` en paralelo, 3/3, sin 40P01. `indices-rutas-calientes` 5/5 en la acumulada y 1/1 en la limpia.
- D: T1 y guardias `4 passed (4)` · `116 passed (116)`; T8 `4 passed (4)` · `99 passed (99)`; grep de «provisional» en `specs/SLT-73-*` y los cuatro tests = 0.
- E: `vitest related` sin integración db `Test Files 31 passed (31)` · `Tests 463 passed (463)`; typecheck 0 errores; lint EXIT=0.

## R21 · Descargas de cierres en día de Costa Rica (enmienda)

frontend_dev (F), evidencia `impl_slt76_F.md`. Las 7 líneas `fechaDiaISO(<x>At)` de `cierre-dia-`, `cierres-admin-`,
`cierres-bodega-` y `cierres-gestiones-fundida-descarga-columnas.ts` pasan por un `diaCR(iso)` privado en cada archivo:
`fechaCalendarioCR(new Date(iso))` si el instante es válido; si no, el texto pasa tal cual por `fechaDiaISO`.
- **Desviación:** el fallback existe porque `columnas-sensibles.guardia` sondea cada columna con un objeto que no es fecha, y con la llamada directa la celda saldría «NaN-NaN-NaN». La función está repetida en los 4 archivos (4 líneas) porque un archivo de columnas no puede exportarla (esa guardia prueba toda función exportada). El sitio para centralizarla sería `lib/utils/fecha-dia-iso.ts`.
- `DESCARGAS_PENDIENTES = []`; la comparación exacta sigue viva y se comprueba que los 4 archivos están entre los revisados.
- Ningún test fijaba el día UTC (los datos usan horas como 10:00Z).
- Mutaciones (volver a `fechaDiaISO` en cada una de las 7 líneas): en todas, grep = 1 → `2 failed` (el `it` R21 del archivo y la guardia) → revertida, grep = 0 → verde (28/28, 6/6, 6/6, 20/20, 20/20, 20/20, 39/39).
- typecheck 0, lint 0; `vitest related` (con envoltorio, `servi_slt76_mig`): 44 archivos, 773 tests en verde.
- Sin efecto en E2E: `cierres-admin.spec.ts` no descarga ni mira fechas.

## E2E

Build de producción (`next build`, BUILD_EXIT=0) y un solo servidor (puerto 3076) sobre `servi_slt76`:
`playwright test e2e/cierres-admin.spec.ts e2e/cierre-bodega-satelite.spec.ts e2e/wallet.spec.ts e2e/dos-empresas-humo.spec.ts e2e/zona-especial-dos-empresas.spec.ts`
→ `30 passed (1.8m)`, `E2E_EXIT=0`. Entran también las dependencias `superadmin-arranque` y `superadmin-empresas`.
El paso 3 de `cierre-bodega-satelite` («Desmarcar» ya no está tras marcar con dinero asentado) pasa
tal como lo dejó frontend_dev. Ni `wallet` ni `cierres-admin` necesitaron cambios. Log: `e2e_SLT-76_r1.log` en el scratchpad.

## Gate

`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` (modo rápido), log `gate_SLT-76.log` en el scratchpad:
- typecheck ✓ y lint ✓ (solo avisos ya existentes);
- `Test Files 482 passed (482)` · `Tests 6863 passed | 26 skipped`;
- guardias: `Test Files 320 passed (320)` · `Tests 4443 passed | 1 skipped`;
- **`INIT_EXIT=0`**.

La primera corrida, sobre `servi_slt76`, dio `INIT_EXIT=1` (log `gate_SLT-76_r1_base76-con-superadmin-e2e.log`).
Fallaron dos archivos, `carga-division` y `geografia-superadmin-sin-empresa`, con «la base ya tiene un superadmin
que no es de este test (SL-32 R27)». Es el superadmin que crea el E2E `superadmin-arranque` en esa base.
No es del cambio: el gate se repitió sobre `servi_slt76_mig`, que está en la misma migración (276) y no tiene
superadmin, y quedó en verde.

## Desviaciones

1. **T3:** el predicado hace 3 lecturas en lote, no 2. Los asientos de `cierre_dia` necesitan dos, porque `origen_id` no tiene relación en Prisma. Sigue siendo un número fijo por llamada.
2. **T4b:** la mutación no pone rojo `saldo-satelites` (sus datos no tienen rechazos), contra lo que dice §4. La caza `slt73-deuda-satelite` por el lado del desglose.
3. **T7.2:** en PG18, `cantonAOtroPais` da 23001 (§7.2 lo daba como 23503), porque el cantón tiene un distrito que lo referencia con FK RESTRICT. Se ajustó a lo medido. No hay PG17 local; CI lo confirma.
4. **T7.1 y T7.3:** ni el 40P01 ni el rojo de índices se reproducían en local antes del cambio. Las mutaciones prueban que los tests muerden; que el 40P01 desaparece solo lo prueba CI.
5. **T6:** la mutación «quitar el if de sin cambios» es equivalente en integración (`appendAccion` con lista vacía no escribe) y la mata un caso unitario nuevo. «Escribir con `this.prisma`» no alcanza el caso del rechazo, que sale antes de escribir. La guardia de escrituras mide por método: `update` ya tiene 4 `appendAccion`, así que borrar solo el de distritos no la pone roja (lo cubre `zona-distrito-rastro`).
6. **T2-front:** `ConciliacionSatelite.tsx` y `CierresBodegaAdminModule.tsx` no se tocan (ver Archivos). También se tocó `tests/unit/services/cierres-bodega-admin-service.test.ts`, fuera de la lista de tasks.
7. **T6:** 7 tests de migración del historial ajustados (la lista `POSTERIORES` y los slices del enum), medidos rojos al correrlos.

## Hallazgos para el leader

- **R21 (enmienda de Carlos, 2026-11-01):** CERRADO en esta ficha (ver sección R21). La guardia de R2 queda sin excepciones.
- **Incidente de base (A), REVISADO:** en la base local del `.env` del worktree (local; no es una slt76) dan 0 las empresas `es_demo`, los slugs `demo-qa%`, los nombres `SL43`, la marca `entorno_marca.entorno`, los centinelas `jobs`/`geocode_cache` de SL-43 y los locks advisory. El `afterAll` de `demo-qa` limpió y no hubo que borrar nada. Script de solo conteos: `restosdemo.cjs`. Antes: corrió una vez `vitest related` sin el envoltorio, así que los tests de integración usaron la base local del `.env` del worktree (local, de nombre `servi*`; ni producción ni Supabase). Lo cortó a los ~3 min, con 14 archivos terminados. Entre ellos estaba `demo-qa.test.ts` (11/12 rojos), que commitea datos y los borra en su `afterAll`. Conviene revisar si dejó restos en esa base.
- El typecheck necesita `NODE_OPTIONS=--max-old-space-size=10240`: con menos, `tsc` se queda sin memoria.
