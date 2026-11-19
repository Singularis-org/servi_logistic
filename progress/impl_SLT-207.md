# impl SLT-207 «D79: tests que confirman filas de negocio sin el motivo escrito»

Ruta directa, solo tests. Base: desechable local `servi_slt207_desechable` (migrate deploy + `db:seed`,
0 organizaciones). Origen: deuda D79 (`progress/deudas.md`) y `progress/impl_SLT-188.md > T3`.

## Archivos

| Archivo | Cambio |
|---|---|
| `tests/integration/db/integracion-migracion.test.ts` | **A tx revertida.** Las empresas A y B ya no se confirman en `beforeAll`: nacen dentro de `revertida` (tras el lock 227) en cada caso, con control positivo (`count === 2`, «SLT-207: A y B sembradas»). El `afterAll` ya no borra: comprueba que se sembró algo y que ninguna empresa del archivo queda confirmada (`count === 0`). Fuera el import de `bajoLockDeEscrituraReal`. |
| `tests/integration/db/para-cada-empresa-modulo.test.ts` | **Motivo escrito.** `paraCadaEmpresa` lista con `getPrismaClient()` (otra conexión); pasarle la tx como `cliente` dejaría de medir el camino del cron. Limpieza ya robusta (`try` + `finally` con lock y desconexión; `organizacion_modulo` cae por `ON DELETE CASCADE`, comprobado en `db/schema.prisma`). |
| `tests/integration/db/premio-ranking-idempotencia.test.ts` | **Motivo escrito** (T2.5): la action arma su repositorio sobre `getPrismaClient()` (`lib/actions/cierres-admin.ts:109`); inyectar la tx es justo lo que el caso no debe hacer. El `finally` ahora desconecta aunque falle el borrado. |
| `tests/integration/db/419/_escenario-419.ts` | **Motivo escrito** en la cabecera: la concurrencia R8 necesita dos conexiones reales que vean los datos. La cabecera citaba `sembrarComprometido419`, que no existe: ahora apunta al `describe` «R8 — concurrencia real». |
| `tests/integration/db/419/confirmar-entrega-lote-sql-real.test.ts` | Motivo junto a la escritura confirmada (`crearOrganizacion(mundo.prisma)` del `beforeAll` R8), y el `afterAll` cierra `c1`/`c2` en `finally` aunque `limpiar419` falle. |
| `progress/deudas.md` | D79 RESUELTA. |

## Comprobación de filas fuera de tx (SLT-188), local

Cada corrida: `filas-fuera-de-tx.ts foto` → `vitest run <archivos>` → `filas-fuera-de-tx.ts comparar`,
todo vía `con-desechable.cjs`.

| Corrida | vitest | comparar |
|---|---|---|
| ANTES (4 archivos, código de `dev`) | 40 passed (40) | `0 filas fuera de su transacción`, 45 inserciones en `organizacion`, EXIT=0 |
| DESPUÉS (4 archivos) | 40 passed (40) | `0 filas fuera de su transacción`, 59 inserciones, EXIT=0 |

59 − 45 = 14: `integracion-migracion` crea ahora 2 empresas en cada uno de sus 8 casos con `revertida`
(16) en vez de 2 confirmadas. Es la evidencia de que la siembra corre dentro de las tx.

Nota: la primera corrida ANTES dio `Worker exited unexpectedly` (31/40 ejecutados) sin dejar filas
(`comparar` 0); repetida, 40/40. Mismo síntoma que D80; no se tocó.

## Mutaciones (una por archivo; restauradas con `git checkout --`; la desechable se limpió y `comparar` volvió a 0)

| # | Archivo | Mutación | vitest | comparar |
|---|---|---|---|---|
| M1 | `integracion-migracion` | `revertida` confirma (`await fn(tx); return;` en vez de `throw new Revertir`) | 8 failed / 1 passed | `20 filas fuera de su transacción` («Empresa A SL36» / «Empresa B SL36» con `integracion` e `integracion_prueba_minuto`), EXIT=1 |
| M2 | `para-cada-empresa-modulo` | sin el `deleteMany` del `afterAll` | 3 passed | `4 filas` («SL-23 con monitoreo» / «SL-23 sin monitoreo», `organizacion` + `organizacion_modulo`), EXIT=1 |
| M3 | `premio-ranking-idempotencia` | sin el `organizacion.delete` del `finally` | 17 passed | `1 filas` (`organizacion`), EXIT=1 |
| M4 | `419` (`_escenario-419.ts`) | `limpiar419` sin el borrado de la empresa | 11 passed, archivo FAIL en `afterAll` («SLT-185: empresa borrada: expected 1 to be +0») | `1 filas` (`organizacion`), EXIT=1 |

M2 y M3 dejan el vitest verde: es la clase (b) de SLT-188 y la razón de la comprobación; la cazó en los dos.

## Mapa D79 → test

| Requisito (ficha) | Evidencia |
|---|---|
| Sembrar en tx revertida si cabe, con control positivo | `integracion-migracion.test.ts` (`revertida` + «SLT-207: A y B sembradas» + `afterAll` «ninguna empresa del archivo queda confirmada»); M1 |
| Motivo escrito si necesita confirmar + limpieza robusta | `para-cada-empresa-modulo.test.ts`, `premio-ranking-idempotencia.test.ts` (T2.5), `419/_escenario-419.ts` + `419/confirmar-entrega-lote-sql-real.test.ts`; M2-M4 |
| La comprobación sigue en 0 | corrida DESPUÉS |

## Gate rápido

`bash ./init.sh` (rápido) vía `con-desechable.cjs` en `servi_slt207_desechable`, log completo:

- typecheck ✓; lint ✓ (`0 errors, 248 warnings`, todos ajenos);
- test:rapido en 4 lotes: 1246/1246, 1629/1629, 1674 passed + 1 skipped, 872/872 (los 4 archivos tocados, dentro);
  «4 rojo(s) heredado(s) del baseline no cuentan»; tamaño del PR 5/40 archivos, 0 líneas de producción;
- migraciones con down ✓, `== init OK ==`, **INIT_EXIT=0**.
- `tests/baseline-rojos.json`: ninguna entrada cita SLT-207; sin cambios.

Veredicto: D79 cerrada: 1 archivo pasa a tx revertida y 3 escriben su motivo de confirmar; la comprobación de SLT-188 da 0 y caza la falta de limpieza en los 4.
