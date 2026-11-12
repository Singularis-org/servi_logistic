# impl — SLT-124 «Ranking de la central sin mensajeros de satélite»

> backend_dev, 2026-11-11. Worktree `.worktrees/SLT-124-ranking-sin-satelite`, rama
> `feature/SLT-124-ranking-sin-satelite` (desde a3ec42eb). Spec: `specs/SLT-124-ranking-central-sin-satelite/`
> (ruta completa, PA1 = B). Base desechable `slt124_u1` exportada antes de cada vitest; `slt124_e1` y
> `slt124_e2` para los E2E (una por corrida); `slt124_g1` para el gate. `DATABASE_URL` nunca impreso.
> MCP del grafo no usado: el spec trae cada cita archivo:línea; Grep/Read.

## T1 — Citas del spec, contra la rama (a3ec42eb)

| Cita | Sigue igual |
|---|---|
| `PremioRankingDevengoService.ts:149-152` (listar) y `:186-189` (registrar) llaman `resolverCierreDelDia` sin destino | sí |
| `PremioRankingDevengoService.ts:83-85` (acceso total) y `:284-293` (`anularPremio` usa el `cierreId` del premio) | sí |
| `CierreDelDiaRepository.ts:40-52` (`findFirst`, `where`, `orderBy`, `select`) | sí |
| `ICierreDelDiaRepository.ts:5-8` («no depende de ningún alcance») | sí — reescrita |
| `IncentivoMensajeroService.ts:57` (acceso total), `:62` (elección), `:80` (relectura) | sí |
| `UserRepository.ts:324-341` `listMensajeros`; consumidores solo `RankingService.ts:102` y `RankingSnapshotService.ts:113` | sí (Grep en `app/`, `lib/`, `components/`: ningún otro) |
| `RankingService.ts:60-62` (lectores), `:112-117` (agregados solo sobre la lista) | sí |
| `RankingSnapshotService.ts:150-156` (cabecera con 0 filas) | sí |
| `RankingRepository.ts:47-97` (entregadas/asignadas sin zona) | sí |
| `CierreDiaService.ts:703-715`, `bodega-responsable.ts:16-23` (`resolverDestinoCierre`) | sí |
| `alcance-cierre-where.ts:12-19`, `alcance-cierres.ts:11-14` | sí |
| `ILiquidacionPagoRepository.ts:265-269` (`obtenerCierreParaPagoEnAlcance`), `:306-310` (`listarCierresImputablesEnAlcance`) | sí |
| `db/schema.prisma:1648-1649` (destino), `:1690` (índice), `:599` (`es_central`), `:121` (`zona_id`) | sí |
| `ranking-labels.ts:107`, `RankingPodio.tsx:291-293`, `RankingModule.tsx:108` (estado vacío) | sí |
| `criterio-unico.guardia.test.ts:516-536` (consumidores de `alcanceWhere`) | sí |
| Composition root: `lib/actions/incentivo-mensajero.ts:39-40` PASA `new LiquidacionPagoRepository(prisma)`; `lib/actions/premio-ranking-devengo.ts:100` PASA `new CierreDelDiaRepository(prisma)` | sí — sin cambios |

## Qué se hizo

- **T2.** `resolverCierreDelDia(mensajeroId, ventana, alcance: Alcance)` — parámetro obligatorio, sin
  valor por defecto; `...alcanceWhere(alcance)` en el `where`. `orderBy`/`select`/`findFirst` igual.
  Cabecera de `ICierreDelDiaRepository` reescrita.
- **T3.** `PremioRankingDevengoService` pasa `ALCANCE_ACCESO_TOTAL` al listar y al registrar.
  `anularPremio` no se toca (R7).
- **T4.** `IncentivoMensajeroService.registrar`: `listarCierresImputablesEnAlcance` y
  `obtenerCierreParaPagoEnAlcance(…, ALCANCE_ACCESO_TOTAL, tx)`; `Pick` ajustado. `anular` no se toca (R11).
  Composition root sin cambios (ya pasa la instancia).
- **T5.** `UserRepository.listMensajeros` añade `zona: { esCentral: true }`; cabecera de
  `IUserRepository.listMensajeros` actualizada. `RankingService` y `RankingSnapshotService` sin tocar.
- **T6.** Guardia `criterio-unico`: `CierreDelDiaRepository` entra en la lista de consumidores de
  `alcanceWhere` (import exacto, 0 redeclaraciones) y con exactamente 1 llamada.
- **T7.** `premio-ranking-idempotencia.test.ts`: las tres llamadas pasan `ALCANCE_ACCESO_TOTAL`; sus
  fixtures ya eran `bodega_central`; no cambia lo que afirma.
- **T8.** Test nuevo `tests/integration/db/central-sin-satelite-premio-incentivo.test.ts` (10 casos, a-j).

### Decisiones

1. **Dobles del incentivo renombrados.** `incentivo-mensajero-service.test.ts` cambia el NOMBRE de los
   dos métodos del doble (`listarCierresImputables` → `…EnAlcance`, `obtenerCierreParaPago` → `…EnAlcance`)
   porque el doble se pasa `as never` y el servicio ya no llama a los viejos. Las aserciones de los casos
   existentes no cambian.
2. **Fixture `caja-459` corregido (riesgo previsto en design §Verificación).** El cierre del premio de
   `sembrarEscenario459` era `bodega_satelite`; con R1 el premio daría `sin_cierre`. Pasa a
   `bodega_central` con `destinoZonaId = cat.centralZonaId` (P = 0, sin asientos propios). Los tests que
   lo usan (`caja-caracterizacion-459`, `efecto-movimiento-predice`, …) están en `tests/baseline-rojos.json`
   (app vacía, SL-11) y no corren en la base de catálogos; no pude medirlos aquí. Se anota como riesgo
   para cuando SL-31 los saque del baseline.
3. **Mutación 2 en dos pasos.** Con solo la ELECCIÓN sin alcance (2a), (f) sigue verde: la relectura
   bajo el candado, ya filtrada (R10), devuelve `null` para un cierre de satélite y el servicio responde
   `sin_cierre_aprobado`. Es defensa en profundidad, no un hueco del test. Con las DOS lecturas como
   antes de la ficha (2b) caen (e) y (f).
4. **Integración por las server actions** (composition root real, RLS y extensión de empresa), como
   `pago-mensajero-bodega-duena.test.ts`. El congelado se arma con las mismas piezas que
   `app/api/cron/snapshot-ranking/route.ts`. Siembra commiteada bajo el candado 459, empresas nuevas por
   caso y limpieza en `finally` (la organización se borra al final: si queda algo, el borrado falla).
5. **(h)** también cubre «sin zona»: el mensajero de `sembrarPersonas459` no tiene zona, tiene actividad
   ese día y no aparece.

## Mutaciones (aplicadas a mano, revertidas con copia de respaldo; `git diff --stat` verificado tras cada una)

| # | Mutación | Test que salió ROJO (por aserción) | Resultado |
|---|---|---|---|
| 1 | quitar `...alcanceWhere(alcance)` de `CierreDelDiaRepository.resolverCierreDelDia` | integración (a), (b), (c), (d); además `premio-ranking-lecturas` «SLT-124 (R1, R5): el destino `bodega_central` va en el WHERE…» y la guardia «`alcanceWhere` de los cierres del dia tambien es unica…» (`expected +0 to be 1`) | 4/4 integración + 2 unit en ROJO |
| 2a | elección del incentivo con `listarCierresImputables` sin alcance | (e) R8 (`sin_cierre_aprobado` en vez de `ok` con el central) | ROJO |
| 2b | las dos lecturas del incentivo como antes (elección + relectura sin alcance) | (e) R8 y (f) R9 (`ok` en vez de `sin_cierre_aprobado`) | 2/2 ROJO |
| 3 | quitar `zona: { esCentral: true }` de `UserRepository.listMensajeros` | integración (h) R12 (3 filas en vez de 1) y (j) R14 (2 filas en vez de `[]`); unit `user-repository.mensajeros` «SLT-124 (R12, R14): …el `where` exacto» | 2/2 integración + 1 unit en ROJO |

Total exigido por `tasks.md`: a, b, c, d, e, f, h, j = **8 de 8 en ROJO**, todos por aserción.

Nota honesta (2c): revertir SOLO la relectura (R10) pone rojo `incentivo-mensajero-service.test.ts`, pero
por `TypeError` (el doble ya no tiene el método viejo), no por aserción. La relectura fuera de alcance
la afirma el caso unit «R10: la relectura no lo encuentra en el alcance (`null`)…»; en integración no es
observable sin una carrera.

Una corrida limpia de la integración murió una vez con `Worker exited unexpectedly` (vitest-pool, sin
ningún test en rojo); la repetición salió 10/10. Anotado por si reaparece.

## Mapa R → test

| R | Test |
|---|---|
| R1 | integración (b) + mutación 1; unit `premio-ranking-devengo-service` «SLT-124 … R1/R5: registrar pide el cierre del dia con el alcance de la central» |
| R2 | integración (a); unit «R2: si la central no tiene cierre ese dia (solo satelite), `sin_cierre` sin escribir nada» |
| R3 | integración (b), (c) |
| R4 | integración (d); unit «R4/R5: listar deriva el estado con el mismo alcance de la central» |
| R5 | `premio-ranking-lecturas` «SLT-124 (R1, R5): el destino `bodega_central` va en el WHERE…» (literal a mano) + guardia `criterio-unico` + mutación 1 |
| R6 | `premio-ranking-devengo-service.test.ts` y `premio-ranking-idempotencia.test.ts` sin cambiar lo que afirman (el segundo en baseline: app vacía) |
| R7 | integración (g) |
| R8 | unit `incentivo-mensajero-service` «R8: la eleccion y la relectura … con el alcance de la central» + integración (e) + mutación 2 |
| R9 | unit «R9: sin ningun cierre aprobado de la central…» + integración (f) + mutación 2b |
| R10 | unit «R10: la relectura no lo encuentra en el alcance (`null`) → `sin_cierre_aprobado` sin escribir» |
| R11 | integración (g) |
| R12 | unit `user-repository.mensajeros` «SLT-124 (R12, R14): … el `where` exacto» + integración (h) + mutación 3 |
| R13 | integración (i) |
| R14 | integración (j) + mutación 3; **[Preview] con Carlos** |

## Deudas

- `ILiquidacionPagoRepository.listarCierresImputables` (sin alcance) queda sin consumidores en `lib/`;
  la usan 7 archivos de tests. No se borra aquí (design §2).
- R14 (empresa sin zona central): lo mínimo, sin texto nuevo. Se enseña a Carlos en Preview.
- Los tests de `caja-459` en baseline no validan aún el cambio de su fixture (decisión 2).

## Evidencia

Todas con `DATABASE_URL` exportada a una base desechable `slt124_*` (migrate deploy + db:seed), nunca
la local por defecto. Logs en el scratchpad de la sesión; aquí, sus líneas finales literales.

- **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `TC=0`.
- **Lint** (`pnpm run lint`): `LINT=0`, `0 errors, 243 warnings` (ningún warning nuevo: los de
  `premio-ranking-lecturas` y `premio-ranking-devengo-service` son los `_args`/`_tx` previos).
- **Unit tocados** (8 archivos, `slt124_u1`): `Test Files  8 passed (8)`, `Tests  192 passed (192)`
  (antes de añadir el caso nuevo de `user-repository.mensajeros`; ese archivo pasó en la corrida aparte
  de relacionados, abajo, y su caso nuevo se puso rojo con la mutación 3).
- **Integración nueva** (`slt124_u1`): `Test Files  1 passed (1)`, `Tests  10 passed (10)`, `VITEST_EXIT=0`.
- **E2E** (`next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `BUILD_EXIT=0`; Playwright con
  `next start`; una base nueva por corrida):
  - `pnpm exec playwright test --project=dinero` (incluye `incentivo-mensajero-slt68`), base `slt124_e1`:
    `95 passed (4.5m)`, `E2E_EXIT=0`, 0 flaky.
  - `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento` (arrastra
    `plataforma-vacia`), base `slt124_e2`: `18 passed (1.3m)`, `E2E_EXIT=0`.
  - No hay otro spec E2E de ranking o premio (`ls e2e | grep -iE "ranking|incentiv|premio|podio"`).
  - Ningún fixture E2E necesitó cambio.
- **Gate** (`./init.sh`, base `slt124_g1`):
  - `./init.sh` tal cual: **`INIT_EXIT=1`** en el paso 3+4, antes de typecheck:
    `✗ feature_list.json invalido: specs/SLT-124-ranking-central-sin-satelite/ no cuadra con …/feature_list.json:
    SLT-124 se llama "ranking-central-sin-satelite".` La copia local del board (fuera del worktree,
    del leader) tiene `name`/`branch` `ranking-central-sin-satelite` y `status: pending`; la rama y el
    spec son `ranking-sin-satelite`. No es del código; lo corrige el leader en el board / `feature_list.json`.
  - Para tener el veredicto del resto, el mismo `init.sh` copiado al scratchpad con SOLO ese `fail`
    cambiado a `warn` (diff de una línea): **`INIT_EXIT=0`** — `✓ typecheck paso`, `✓ lint paso`,
    `✓ test:rapido paso` (guardias: `100 passed`, `1212 passed`; `100 passed`, `1605 passed`;
    `100 passed`, `1456 passed | 1 skipped`; `42 passed`), `✓ todas las migraciones tienen down.sql`.
    Avisos: tamaño `14/40 archivos, 872/1000 lineas` (sin contar `specs/` ni `progress/`).
  - **Relacionados fuera de presupuesto** (`428 -> FUERA (presupuesto 150)`), corridos aparte con
    `pnpm exec vitest related --run <14 archivos del diff>`, base `slt124_r1`:
    `Test Files  42 failed | 386 passed (428)`, `Tests  32 failed | 5211 passed | 316 skipped`.
    Los 42 archivos en rojo están TODOS en `tests/baseline-rojos.json` (comparado por script:
    `fuera de baseline: 0`), con el motivo «La app nace vacía (SL-11)».

**Veredicto:** hecho T1-T10; código, tests y E2E en verde; el único rojo del gate es el nombre de
SLT-124 en la copia local del board, que corrige el leader.
- Gate leader 2026-11-11 (base slt124_g1, tras renombrar la carpeta del spec al nombre de la ficha): INIT_EXIT=0
