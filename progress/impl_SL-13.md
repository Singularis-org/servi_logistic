# Bitácora de implementación — SL-13 (fuera-nuform)

> En esta bitácora los nombres retirados solo aparecen dentro del slug `fuera-nuform`. Se escribe
> «el integrador» y «sus clientes» (`design.md > Trampas`).

Worktree `.worktrees/SL-13-fuera-nuform`, rama `feature/SL-13-fuera-nuform`. Base de datos propia
`servi_logistic_sl13` en el Postgres local del `.env` principal (host local, puerto 5432; no es
Supabase ni Ordenex), escrita en el `.env` del worktree (ignorado por git).

## T-sync

`git merge dev` sin conflictos (commit `3fcda88`). Trae SL-10: `tests/baseline-rojos.json` con la
entrada de la guardia 459 y la versión de `test-citado-desaparecido` que toca D4. `dev` contiene
`60befb1` (`git merge-base --is-ancestor`).

## T0 — Medida inicial

`git grep -I -l -i -E "<términos del integrador>|distribuidora|ecuador" -- . ':!specs'` tras el merge:
**73 archivos**. Por grupo: integrador 61, sus dos clientes 13, «distribuidora|ecuador» 10.

Contra el inventario de `design.md` (71) y la lista «Archivos esperados» de `tasks.md`:

| Diferencia | Explicación |
|---|---|
| `tests/baseline-rojos.json` (+1) | Llega con SL-10 en el merge: el motivo de la entrada de la guardia 459 nombra al integrador. T7 quita la entrada. Está en la lista de esperados. |
| `progress/deudas.md` (+1) | Llega con `dev` (`de68dfb`, del leader): la línea 6 cita el título de la ficha, que lleva el nombre. No está en la lista de esperados; la guardia de D1 la marcaría. Se corrige al slug en T5. |
| 6 esperados sin término | `459/down.sql`, `_fixtures/reclasificacion-459-sql.ts`, `caja-invariante-tiendas`, `cobro-tienda-461-completar-migration`, `orden-traspaso-migration` y `test-citado-desaparecido` se tocan por la 459 (D3, D4), no por llevar el nombre. |

71 + 2 = 73. Ninguna otra diferencia.

### Línea base de casos (R6)

`pnpm exec vitest run <los 55 tests existentes de la lista> --reporter=json`, sin `DATABASE_URL`
(los de integración salen `skipped`). Total 1389: 1328 passed, 61 skipped, 0 failed. El único archivo
rojo es `reclasificacion-459-lista.guardia.test.ts` (ENOENT del CSV), que está en
`tests/baseline-rojos.json` y se borra en T7.

| Archivo | Casos | Estado |
|---|---|---|
| `tests/components/AnaliticaPage.test.tsx` | 64 | passed 47, skipped 17 |
| `tests/components/CierreRechazosDeTienda.test.tsx` | 23 | passed 23 |
| `tests/components/ParamsPicking.test.tsx` | 19 | passed 19 |
| `tests/components/ProductosTabla.test.tsx` | 29 | passed 29 |
| `tests/components/ProductosTablaDinero.test.tsx` | 47 | passed 47 |
| `tests/components/WalletLedgerAcciones459.test.tsx` | 13 | passed 13 |
| `tests/components/WalletLedgerAcciones461.test.tsx` | 12 | passed 12 |
| `tests/integration/api/ordenes-api-key-tienda-destino-aislamiento.route.test.ts` | 8 | passed 8 |
| `tests/integration/api/ordenes-api-key-tienda-destino.route.test.ts` | 5 | passed 5 |
| `tests/integration/db/caja-invariante-tiendas.test.ts` | 9 | skipped 9 |
| `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` | 4 | skipped 4 |
| `tests/integration/db/cobro-tienda-461-completar-migration.test.ts` | 6 | skipped 6 |
| `tests/integration/db/orden-remision-borrada-libera-numero.test.ts` | 9 | skipped 9 |
| `tests/integration/db/orden-traspaso-migration.test.ts` | 15 | passed 5, skipped 10 |
| `tests/integration/db/reclasificacion-459-migration.test.ts` | 6 | skipped 6 (se borra) |
| `tests/integration/repositories/webhook-suscripcion-repository.test.ts` | 27 | passed 27 |
| `tests/unit/actions/abono-tienda-action.test.ts` | 13 | passed 13 |
| `tests/unit/actions/informe-picking-actions.test.ts` | 13 | passed 13 |
| `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts` | 0 | failed (baseline; se borra) |
| `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` | 13 | passed 13 |
| `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` | 47 | passed 47 |
| `tests/unit/repositories/api-key-repository.list.test.ts` | 12 | passed 12 |
| `tests/unit/repositories/api-key-repository.secreto.test.ts` | 12 | passed 12 |
| `tests/unit/repositories/api-key-repository.test.ts` | 24 | passed 24 |
| `tests/unit/repositories/cierre-dia-repository.test.ts` | 116 | passed 116 |
| `tests/unit/repositories/cierres-admin-repository.test.ts` | 54 | passed 54 |
| `tests/unit/repositories/picking-repository.test.ts` | 7 | passed 7 |
| `tests/unit/services/abono-tienda-anulacion.test.ts` | 8 | passed 8 |
| `tests/unit/services/abono-tienda-service.test.ts` | 27 | passed 27 |
| `tests/unit/services/api-key-auth-service.test.ts` | 42 | passed 42 |
| `tests/unit/services/api-key-service.eliminar.test.ts` | 13 | passed 13 |
| `tests/unit/services/api-key-service.listar.test.ts` | 17 | passed 17 |
| `tests/unit/services/api-key-service.tienda-destino.test.ts` | 14 | passed 14 |
| `tests/unit/services/bulk-orden-service.test.ts` | 66 | passed 66 |
| `tests/unit/services/caja-abono-tienda-feed.test.ts` | 5 | passed 5 |
| `tests/unit/services/cierre-dia-service.test.ts` | 139 | passed 139 |
| `tests/unit/services/cierres-admin-service.test.ts` | 102 | passed 102 |
| `tests/unit/services/ejecucion-envio-informe-error.test.ts` | 2 | passed 2 |
| `tests/unit/services/eliminar-orden-service.test.ts` | 49 | passed 49 |
| `tests/unit/services/pago-por-cuenta-tienda-service.test.ts` | 26 | passed 26 |
| `tests/unit/services/whatsapp-envio-service-picking.test.ts` | 5 | passed 5 |
| `tests/unit/types/abono-tienda-schema.test.ts` | 20 | passed 20 |
| `tests/unit/types/api-key-motivo-no-eliminable.test.ts` | 26 | passed 26 |
| `tests/unit/types/pago-por-cuenta-tienda-schema.test.ts` | 21 | passed 21 |
| `tests/unit/utils/api-key-owner.test.ts` | 5 | passed 5 |
| `tests/unit/utils/caja-derivacion-457.test.ts` | 10 | passed 10 |
| `tests/unit/utils/descripcion-abono.test.ts` | 6 | passed 6 |
| `tests/unit/utils/descripcion-cobro-tienda.test.ts` | 8 | passed 8 |
| `tests/unit/utils/descripcion-pago-por-cuenta.test.ts` | 6 | passed 6 |
| `tests/unit/utils/ingreso-ordenex.test.ts` | 61 | passed 61 |
| `tests/unit/utils/partes-por-tienda.test.ts` | 22 | passed 22 |
| `tests/unit/utils/vista-filtro-aplicabilidad.test.ts` | 18 | passed 18 |
| `tests/unit/whatsapp-envios/informe-picking.test.ts` | 21 | passed 21 |
| `tests/unit/whatsapp-envios/picking-modelo.test.ts` | 22 | passed 22 |
| `tests/unit/whatsapp-envios/picking-pdf.test.ts` | 21 | passed 21 |

## Reparto y commits

Un commit por task. Los subagentes no commitearon: cada commit lo hizo el implementer con
`git commit -- <rutas de esa task>`, verificado con `git log --stat`.

| Task | Subagente | Commit |
|---|---|---|
| T0 | implementer | `aa719f2` |
| T1 | backend_dev | `3552e26` |
| T1b | backend_dev (`lib/config/pais.ts`, `pais.test.ts`) + frontend_dev (los dos mapas) | `f27ab3d` |
| T2 | backend_dev (`lib/`) + frontend_dev (`app/`) | `85f3422` |
| T3 | frontend_dev (`tests/components/`) + dos backend_dev (el resto) | `44ffd19` |
| T4 | backend_dev | `f2464b1` |
| T5 | backend_dev; `progress/deudas.md` lo corrigió el implementer | `d478ba1` |
| T6 | backend_dev | `6b1161d` |
| T7 | backend_dev | `7fc0983` |
| tasks.md | implementer | `abf33ee` |

## Archivos creados, borrados y modificados

- **Nuevos:** `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`, `lib/config/pais.ts`,
  `tests/unit/config/pais.test.ts`.
- **Borrados (T7):** `db/migrations/20260925120300_reclasificar_cobros_459/{migration,down}.sql`,
  `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts`,
  `tests/integration/db/reclasificacion-459-migration.test.ts`,
  `tests/integration/db/_fixtures/reclasificacion-459-sql.ts`.
- **Modificados:** todos los de «Archivos esperados» de `tasks.md`, más estos siete, que no estaban en
  la lista:
  - `progress/deudas.md` (T5): la línea 6 citaba el título de la ficha. Ahora dice
    SL-13 (`fuera-nuform`).
  - **Seis fixtures fuera del inventario (T3).** La guardia de T1 los encontró: el grep de T0 no buscaba
    las dos cadenas de dirección que R1 veta (el barrio y la avenida de la dirección de D5). Son
    `tests/components/OrdenesCargaResumen.test.tsx`, `tests/integration/carga-api-key-sin-tarifa.test.ts`
    y `tests/unit/services/bulk-orden-service.{carga-api,carga-lote,filas-omitidas,texto-etiqueta}.test.ts`.
    Solo se sustituyeron esas dos cadenas, con el mapeo de D5 (`Barrio Uno`, `Avenida Principal`);
    `Quito`, `Pichincha` y `Cumbaya` se quedan, porque no están vetadas. Lo mismo se hizo en las otras
    líneas de `bulk-orden-service.test.ts` y de `ordenes-api-key-tienda-destino.route.test.ts`.
    En `bulk-orden-service.test.ts`, la variante con tilde y doble espacio del distrito (caso R27/R33)
    pasó a `"quito (bárrio  úno)"` y sigue probando lo mismo: tildes, minúsculas y doble espacio.

## Desviaciones del spec (para el reviewer)

1. **D4: dos excepciones temporales, no cuatro.** Las dos filas de
   `specs/459-la-caja-muestra-el-dinero-real/design.md:1100-1101` empiezan por `| R80, R88 |` y
   `| R81–R86 |`, y `test-citado-desaparecido` no las lee como citas. Una excepción sobre una cita que la
   guardia no ve pone en rojo su propio caso de caducidad («ese documento ya no lo cita»). Quedan las dos
   de `specs/461-cobro-a-tienda-y-nombres-claros/design.md:827` (`| R61 |`). R12 se cumple: las citas
   del 459 no rompen la guardia, y las del 461 se aceptan por la excepción. El motivo está escrito en un
   comentario sobre `EXCEPCIONES_TEMPORALES`.
2. **T8: no se pudo usar `prisma migrate reset`.** Prisma 7 ya no acepta `--skip-seed`. Sin ese flag,
   el CLI detecta que lo lanza un agente y se niega a correr si no recibe el consentimiento literal del
   humano en `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. No lo tengo, y una instrucción del leader no
   cuenta como ese consentimiento. Como la base `servi_logistic_sl13` no existía, se aplicó la cadena
   con `prisma migrate deploy` sobre una base vacía recién creada, que es lo que R10 mide.
3. **T6:** los dos tests que nombra la task viven en `tests/unit/db/`, no en `tests/integration/db/`:
   `orden-num-remision-parcial` y `orden-num-remision-por-tienda`, con 17 passed.

## Aserciones quitadas en T7

- **`caja-invariante-tiendas.test.ts`:** sale el caso entero «R61 (revisión m1 de la 459): la salida del
  cobro reclasificado la escribió el SQL REAL de la migración de la 459». Afirmaba `salidas: 1`,
  `mismoMonto`, `mismoInstante`, la categoría `egreso_pago_por_cuenta_tienda` y la descripción
  compuesta con ` · `. Con él se van el campo `reclasificada` de `Medida` y R61 de la lista de la
  cabecera. Ahora la fila reclasificada se siembra con `walletMovimiento.create`: egreso,
  `egreso_pago_por_cuenta_tienda`, origen `cobro_manual_reclasificado` → id del cobro, el mismo monto,
  el mismo `fechaMovimiento` y el mismo `registradoPor`. Sigue el paso «cobro reclasificado»: una fila
  nueva, R8 roto solo por el legado pendiente y `cambio(7)`.
- **`cobro-tienda-461-completar-migration.test.ts`:** no se quita ninguna. `delReclasificado` y
  `reclasificadoSigue` miden lo que hace la 461. Solo cambia la siembra, igual que en el anterior.

## T8: la cadena de migraciones contra una base de verdad (R10)

- **Base.** `DATABASE_URL` del worktree: host local, puerto 5432, base `servi_logistic_sl13`. Antes de
  escribirla se comprobó que no contenía `supabase` ni los ids de proyecto Supabase de la app de origen.
- **Primer `prisma migrate deploy`:** se para en `20260918120200_zona_sinpe_no_nulo` (FICHA 429: «hay
  bodegas sin SINPE»). Ese corte no viene de SL-13: esa migración exige a propósito sembrar antes.
- **Se siguió su procedimiento documentado:**
  - `scripts/seed-sinpe-inicial.ts` con valores sintéticos (`88880000`, «Bodega Ejemplo»): 7 bodegas;
  - `migrate resolve --rolled-back` de esa migración;
  - `migrate deploy` otra vez, que da **exit 0**.
- **Resultado:** `migrate status` dice «230 migrations found… Database schema is up to date!». La
  cadena entera, ya sin la 459, aplica sin error.
- **Siembra:** `pnpm run db:seed`, que llena catálogos. `db:seed:usuarios` falla porque le falta la
  zona `Quepos`. Ningún script del repo siembra órdenes.

Los cinco tests de R10, ejecutados contra esa base:

| Test | Casos | Resultado |
|---|---|---|
| `api-key-tienda-destino-migration` | 12 | **12 passed** |
| `cobro-tienda-461-completar-migration` | 6 | **6 passed** |
| `premio-ranking-devengo-migration` | 32 | **32 passed** (tras `db:seed`) |
| `orden-traspaso-migration` | 15 | 5 passed. Los 10 casos de Postgres no corren: el `beforeAll` aborta con «la tabla `orden` está vacía… Corre `pnpm run db:seed`» |
| `caja-invariante-tiendas` | 8 | 8 failed en la precondición (`cargarCatalogo459`): «faltan la zona central, el tipo `cedula` o una orden de la que tomar provincia y cantón» |

**R10 queda a medias.** La cadena aplica y tres de los cinco tests pasan ejecutados. Los otros dos
abortan antes de su lógica porque necesitan órdenes sembradas, y en servi_logistic ningún seed las crea:
los seeds que lo hacían eran de Ordenex, y sus fixtures propios son de SL-11 (el mismo motivo que ya
tienen en `tests/baseline-rojos.json` `zona-central-guarda-y-rastro` y
`zona-guardado-conserva-inactivos`). Quedan pendientes de una base con órdenes, de SL-11 o de la suite
completa de CI. **T8 se deja sin marcar.**

## T9: las guardias muerden

Cada prueba se restauró desde una copia, y `git status` quedó limpio después.

| Prueba | Resultado |
|---|---|
| Guardia `sin-integrador-de-ordenex`, tal cual | `Tests  6 passed (6)` |
| `zz-mordida.txt` sin versionar con «tienda <uno de sus clientes>» | **rojo**: `zz-mordida.txt:1 (<ese término>)` y la regla (`docs/limpieza-ordenex.md` regla 2; `docs/plan-saas.md` decisión 6) |
| `zz-mordida.txt` sin versionar con «Ecuador» y «Distribuidora mayorista» | **verde**: `Tests  6 passed (6)` |
| `// ejemplo medido: Distribuidora` en `ProductosTabla.tsx` | **rojo**: «ProductosTabla.tsx: comentarios que citan datos reales», `1 failed / 5 passed` |
| `[-0.1807, -78.4678]` devuelto a `RutaMapaInner.tsx` (frontend_dev) | **rojo**: «Coordenadas literales; el centro sale de lib/config/pais.ts: …RutaMapaInner.tsx:137» |
| Quitar de `EXCEPCIONES_TEMPORALES` la entrada de `reclasificacion-459-lista` | **rojo** en R-1: «specs/461-cobro-a-tienda-y-nombres-claros/design.md:827 — … mapea R61 a `reclasificacion-459-lista.guardia.test.ts` … lo borró 7fc0983», `1 failed / 14 passed` |
| `test-citado-desaparecido` restaurada | `Tests  15 passed (15)`, antes 13 |

Comprobaciones de diff (`dev...HEAD`):
- **`db/migrations` (R8, R9):** tres `M` (los dos archivos de `20260827160000` y el de
  `20260828120000`) y dos `D` (la 459).
- **R8, solo comentarios:** las líneas `+`/`-` de los tres SQL que no empiezan por `--` son 0.
- **R13, `specs/` ajenos:** el diff fuera de `specs/SL-13-fuera-nuform` sale vacío (0 archivos).
- **R13, literales de Costa Rica:** se contaron las apariciones de
  sinpe/colones/₡/San José/provincias/Quepos en las líneas `-` y en las `+`, sin contar los archivos
  nuevos ni `progress/`. Salen iguales archivo por archivo. La única diferencia está en la guardia nueva
  y es un falso positivo: el identificador `sinPermitidas`. Las líneas con «SINPE» que cambiaron solo
  cambiaron el nombre de la tienda.

## Gate (R14)

Se corrió tres veces, con el log a archivo y `INIT_EXIT=$?` escrito dentro.

1. **`./init.sh`, con el `.env` del worktree:** `INIT_EXIT=0`. Pero sin `origin/dev` en local,
   `test:rapido` se saltó la selección por diff y solo corrió las guardias. No vale como evidencia.
2. **`TEST_RAPIDO_BASE=dev ./init.sh`, con la base `servi_logistic_sl13`:** `INIT_EXIT=1`.
   - Resultado: `Test Files 7 failed | 495 passed (502)`, `Tests 9 failed | 7219 passed | 49 skipped`.
   - Los 7 son de entorno, no del cambio:
     - seis abortan en su precondición, con «la tabla `orden` está vacía» o «faltan la zona central…»:
       `analitica-anulacion-rechazo-458`, `cierre-desglose-por-tienda-sql-real`,
       `eliminar-orden-pantalla-frontera-tienda`, `orden-remision-borrada-libera-numero`,
       `orden-traspaso-migration` y `caja-invariante-tiendas`;
     - `cohorte-carga-indices.int` falla porque «el plan no nombra orden_created_at_idx»: con la tabla
       vacía, Postgres no usa el índice.
   - Las dos líneas «will be removed» del log son una `DeprecationWarning` de `pg@9`, no de pnpm.
3. **`TEST_RAPIDO_BASE=dev ./init.sh`, sin `.env` ni `DATABASE_URL`** (el estado local que asume el
   baseline: la integración se salta). Termina en `INIT_EXIT=0`:

```
✓ typecheck paso
✓ lint paso
[test:rapido] tests relacionados con 70 archivo(s) del diff vs dev
 Test Files  465 passed | 37 skipped (502)
      Tests  7030 passed | 247 skipped (7277)
[test:rapido] tests que corren siempre (gate.siempre: guard)
 Test Files  283 passed (283)
      Tests  3800 passed (3800)
[test:rapido] 3 rojo(s) heredado(s) del baseline no cuentan en esta seleccion; el CI los compara.
== init OK ==
INIT_EXIT=0
```

4. **Sobre `e0b7945` (con la bitácora), igual que la 3:** `INIT_EXIT=1`, por dos rojos transitorios
   ajenos a SL-13 (ninguno de los dos archivos está en el diff):
   - `cohorte-carga-reloj.int`: «Cannot find module '.prisma/client/default'», el cliente del
     `node_modules` compartido regenerándose desde otro worktree;
   - `CierresAdminFiltros.test.tsx`: no encontró la opción «Diana Mora» a tiempo.

   Corridos solos, pasan: `1 passed | 1 skipped`, `13 passed | 4 skipped`.
5. **Repetida sobre `e0b7945`:** `INIT_EXIT=0`. Related: `465 passed | 37 skipped` (7030 tests).
   Guardias: `283 passed` (3800 tests).

**Para el leader:**
- El `init.sh` de un worktree no ve `origin/dev` (no hay remoto) y se salta la selección por diff sin
  ponerse en rojo. Hay que lanzarlo con `TEST_RAPIDO_BASE=dev`.
- Con una base migrada pero sin órdenes, los tests de integración que dependen de ellas fallan en vez
  de saltarse.

## Mapa R → test

| R | Test / evidencia |
|---|---|
| R1, R2, R3, R4 | `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts` (barrido, excepciones y poda, autocomprobación, caso de `ProductosTabla.tsx`) y las mordidas de T9 |
| R15 | `sin-integrador-de-ordenex.guardia.test.ts` (caso de los mapas) y la mordida con la coordenada |
| R16 | `tests/unit/config/pais.test.ts` (3 casos: el literal como contrato, el ISO alfa-2, los rangos) |
| R5 | typecheck, `vitest related` de los archivos de `app/` y `lib/` (verde) y el diff: solo comentarios, el `ejemplo`, el centro del mapa y su import |
| R6 | conteo de casos de T0 contra T3, igual en todos los archivos (856 + 370 + 8 de componentes, sin cambios), `informe-picking.test.ts`, `ParamsPicking.test.tsx`, `ProductosTabla.test.tsx` |
| R7 | `sin-integrador-de-ordenex.guardia.test.ts` (`docs/plan-saas.md:14` ya no casa) |
| R8, R9 | las comprobaciones de diff de T9 y `orden-traspaso-migration.test.ts` (la lista sin la 459) |
| R10 | la cadena aplica (230 migraciones, `migrate deploy` exit 0). Ejecutados: `api-key-tienda-destino-migration` 12/12, `cobro-tienda-461-completar-migration` 6/6, `premio-ranking-devengo-migration` 32/32. **Pendientes de una base con órdenes:** `orden-traspaso-migration` y `caja-invariante-tiendas` |
| R11 | `gate-cableado-arnes-v2.guardia.test.ts` (5 passed) y el diff del baseline (−4 líneas) |
| R12 | `test-citado-desaparecido.guardia.test.ts` (R-1, caducidad sintética y caducidad real; mordida en rojo) |
| R13 | las comprobaciones de diff de T9 |
| R14 | `INIT_EXIT=0` (tercera corrida) |

## Vuelta tras el review (`progress/review_SL-13.md`, RECHAZADO)

- **B1:** `git merge dev` (`135037f`, con SL-10, SL-11, SL-12 y SL-14). Commit `46617c9`.
  - `docs/plan-saas.md`: la fase 1 queda con «los integradores;» y la línea del dominio de `dev`. La
    línea 14 sigue sin la cuenta de GitHub (R7).
  - `tests/baseline-rojos.json`: salen la entrada de la 459 (SL-13) y las dos de zona (las retiró SL-11).
    Queda solo `dependencias-declaradas-presentes`. El JSON es válido.
  - `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` (SL-11): la constante de la regex pasa a
    `INTEGRADOR`, y el mensaje, a «nombra al integrador de Ordenex». No se añade ninguna excepción (R2).
  - Guardias sobre el árbol fusionado: `sin-integrador-de-ordenex`, `fuera-datos-ordenex`,
    `test-citado-desaparecido` y `gate-cableado-arnes-v2` dan `Tests  57 passed (57)`.
  - El merge **borra** dos migraciones de SL-11 (`20260713010000_seed_zonas_pago_distrito` y
    `20260720150000_drop_default_maestro_user`). La base `servi_logistic_sl13` ya las tenía aplicadas,
    así que ahora tiene dos filas de más en `_prisma_migrations`. Para limpiarla hace falta un
    `migrate reset`, que necesita el consentimiento del humano (ver T8). Por eso el gate se corre sin base.
- **B2:** T8 queda marcada, con la decisión del leader: R10 se da por cumplido con los tres tests en
  verde, y `orden-traspaso-migration` y `caja-invariante-tiendas` pasan a SL-31.
- **m2:** D4, T7 y la alternativa D del spec dicen ahora «dos» entradas, con el porqué.
- **m3:** `design.md > Lo que ya existe` nombra `lib/config/moneda.ts`.
- **m1** (el E2E de `mis-asignaciones`) lo decide el leader. **m4** ya es la deuda D5 de `dev`.
- **Gate sobre `46a3622`:** `touch -r node_modules pnpm-lock.yaml` y `TEST_RAPIDO_BASE=dev ./init.sh`,
  sin `.env`. Termina en `INIT_EXIT=0`.
  - Related (71 archivos del diff vs `dev`): `466 passed | 37 skipped (503)`, 7061 tests.
  - Guardias: `286 passed | 2 skipped (288)`, 3843 tests.
