# Review SLT-207 «D79: tests que confirman filas de negocio sin el motivo escrito»

Ruta directa, solo tests. Revisión acotada a `origin/dev...9e16908e` (PR #230).
Base: desechable `servi_slt207_desechable`, vía `con-desechable.cjs` (no se leyó `.env`).

## Checklist

- [x] **Alcance D79:** los 4 archivos que cita D79 (`integracion-migracion`, `para-cada-empresa-modulo`,
  `premio-ranking-idempotencia`, `419/_escenario-419.ts`) quedan tratados: 1 pasa a tx revertida y 3
  llevan escrito el motivo. D79 queda marcada RESUELTA en `progress/deudas.md`.
- [x] **`integracion-migracion` siembra de verdad dentro de la tx revertida:** `revertida()` crea A y B con
  `crearOrganizacion(tx, …)` tras el `pg_advisory_xact_lock` y, antes de `fn`, comprueba
  `tx.organizacion.count(...) === 2`. Ningún uso de `base.` toca A/B fuera de la tx (solo el caso de RLS,
  que lee `pg_class`/`pg_policies` y no usa empresas). Los errores que no son `Revertir` se relanzan.
- [x] **Control positivo no vacuo:** el `afterAll` exige `empresasDelArchivo.length > 0` y `count === 0`
  de esas ids. Medido por mí: la corrida de `integracion-migracion` + `para-cada-empresa-modulo` da
  **18 inserciones en `organizacion`** (8 casos × 2 en tx + 2 confirmadas) y `0 filas fuera de su
  transacción`: la siembra ocurre y el rollback se la lleva. M1 del implementer (revertida que confirma)
  pone 8 casos en rojo.
- [x] **Los que siguen confirmando necesitan otra conexión (comprobado en código):**
  - `paraCadaEmpresa` usa `opciones.cliente ?? getPrismaClient()` (`lib/db/para-cada-empresa.ts:62`); el
    test no pasa `cliente`, así que lista por el pool de la app.
  - `listarCierresAdmin` → `buildService()` → `getPrismaClient()` (`lib/actions/cierres-admin.ts:109`); el
    caso existe precisamente para no inyectar.
  - 419 R8: `c1`/`c2` son `crearPrismaDeTest()` nuevos y compiten por la misma orden con
    `Promise.all`; necesitan ver datos confirmados.
- [x] **Limpieza en `finally`:** `para-cada-empresa-modulo` (`try` deleteMany / `finally` lock + disconnect,
  ya existía); `premio-ranking` ahora desconecta aunque falle el `delete`; 419 cierra `c1`/`c2` aunque
  `limpiar419` o sus aserciones fallen. Ninguna limpieza se quitó.
- [x] **Ningún test debilitado:** `it` por archivo igual en `dev` y HEAD (9, 3, 17, 11).
  `integracion-migracion` pasa de 46 a 48 `expect`: sale el `count === 2` del `beforeAll` y entran el
  control por caso (más fuerte: en cada tx) y los dos del `afterAll`. Las aserciones SLT-185 del 419 se
  conservan intactas dentro del `try`.
- [x] **Mutación repetida por mí (M2):** `para-cada-empresa-modulo` con el `deleteMany` anulado
  (`if (false)`): vitest **3 passed** (verde, clase (b)), `filas-fuera-de-tx.ts comparar` → `4 filas fuera
  de su transacción` («SL-23 con monitoreo» / «SL-23 sin monitoreo», `organizacion` + `organizacion_modulo`),
  **salida 1**. Restaurado con `git checkout --`, filas borradas a mano en la desechable y `comparar`
  volvió a `0`, salida 0.
- [x] **Tamaño del PR:** `node scripts/tamano-pr.mjs` → 5/40 archivos, 0/1000 de producción, 100/3000 de tests.
- [x] **Lint** de los 5 archivos tocados: sin errores. Typecheck/gate completo: los corrió el implementer
  (`INIT_EXIT=0`); el diff solo mueve código de test ya tipado y quita un import sin uso.
- [x] **Ruta:** solo tests, sin dinero/permisos/auth/integraciones en código de producción: la ruta directa vale.
- [x] Baseline de rojos: sin cambios ni rojos nuevos en lo corrido.

## Hallazgos

1. **menor** — `integracion-migracion.test.ts`, `afterAll`: `expect(empresasDelArchivo.length).toBeGreaterThan(0)`
   pone el archivo en rojo si alguien corre solo el caso de RLS con `-t` (no siembra nada). Es el precio
   de que el control no sea vacuo; aceptable, pero conviene saberlo al depurar.
2. **menor (preexistente, fuera del diff)** — 419 R8: si `crearPersonas419` falla a mitad, `usuarios` queda
   sin asignar y `limpiar419` no puede borrar la empresa (RESTRICT). Falla ruidosa, no silenciosa, y la
   comprobación de SLT-188 la cazaría. Igual en `premio-ranking`: si `crearOrganizacion` lanza, el
   cliente no se desconecta (no deja filas). No se pide arreglo en esta ficha.

## Veredicto

**OK** — sin bloqueantes.
