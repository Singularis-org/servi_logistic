# SL-40 «Cobro de la plataforma por orden» — bitácora de implementación

Worktree `.worktrees/SL-40-cobro-plataforma-por-orden`, rama `feature/SL-40-cobro-plataforma-por-orden`.
Base desechable local `sl40_tandaa` (migrada con `migrate deploy` + `db:seed`, y borrada al terminar).
`node_modules` montado por junction desde el repo principal. El MCP `codebase-memory-mcp` no estaba
entre las herramientas de este agente, así que el código se exploró con Grep/Read.

## Tanda 0 — T0. Estado de `dev` (2026-10-23)

1. `origin/dev` = `5ca59b9`. Última migración: `20261023100200_usuario_empresa_o_superadmin`.
   SL-38 **no** está en `dev`: no hay ni `20261023120000` ni `20261023120100`. Timestamps de SL-40,
   posteriores a todas (también a las de SL-38): `20261023130000`, `20261023130100`, `20261023130200`.
2. `scripts/verificar-rls-despliegue.ts` tiene los conteos **escritos**: `POLITICAS_POR_EMPRESA = 73`,
   `TRIGGERS_MISMA_EMPRESA = 150`, `TRIGGERS_SIN_CAMBIO = 73` (l. 24-26). No los deriva de
   `MODELOS_DE_NEGOCIO.length`. T2 los sube a mano.
3. `tests/unit/guards/rls-por-empresa.guardia.test.ts`: `expect(tablas.length).toBe(73)` (l. 105).
4. SL-39 **no** está en `dev` (ningún commit SL-39 en `origin/dev`). T7 sigue bloqueada.
5. `comoPlataforma` corre como dueño: en `lib/db/extension-empresa.ts > aplicar`, con
   `ctx.tipo === "plataforma"` se devuelve `query(args)` sin `fijarEmpresa`, es decir, sin
   `set_config('role', 'servi_app')` ni empresa. Corre con el usuario de la conexión, que es el dueño.

## Tanda A

### T1 — el test que hoy falla

`tests/integration/db/cobro-plataforma-cargos.test.ts`, con el fixture
`tests/integration/db/_fixtures/cobro-plataforma-40.ts`:
- lock de sesión del valor global, que guarda la fila y la restaura;
- `movimientosDe` y `deudaDe`, leídos como dueño.

**Las vías de creación son las del código.** Las tres terminan en `createManyOrdenes` o
`createManyOrdenesConGuia`:
- **Pantalla:** `handleCargaMasivaChunk` es el route handler al que la pantalla de carga masiva manda
  sus lotes. Con una tienda sin fulfillment numera la guía (`createManyOrdenesConGuia`). No hay otra
  creación por pantalla: la server action `crearOrden` se borró el 2026-08-07
  (`lib/actions/ordenes.ts`, l. 42).
- **Carga masiva:** `BulkOrdenService.cargarMasiva` con una tienda con fulfillment. Es la rama
  `createManyOrdenes`, sin guía, y el test comprueba `numGuia = null`.
- **API:** `BulkOrdenService.cargarViaApi`, el servicio que construye `app/api/ordenes/api-key/carga/route.ts`.

Las anulaciones también van por las vías del código: `EliminarOrdenService` para la pantalla,
`ApiOrdenEliminacionService` para la API y `RecuperarOrdenService` para recuperar, cableados como en
sus composition roots.

**Desviación de design §11.1.** El valor global y la excepción de B se fijan como dueño (SQL del
fixture), no con `CobroPlataformaTarifaRepository`: ese repositorio es de T5 (tanda B), y aquí es
preparación, no lo que se mide. T5 puede cambiarlo.

**Rojo** contra `sl40_tandaa` sin las migraciones de SL-40 (`pnpm exec vitest run tests/integration/db/cobro-plataforma-cargos.test.ts`):

```
 ❯ tests/integration/db/cobro-plataforma-cargos.test.ts (18 tests | 18 skipped) 511ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/integration/db/cobro-plataforma-cargos.test.ts > SL-40 — cargos y reversos del cobro de la plataforma por orden (Postgres)
error: no existe la relación «cobro_plataforma_tarifa»
 ❯ tomarTarifaGlobal tests/integration/db/_fixtures/cobro-plataforma-40.ts:48:22
 ❯ tests/integration/db/cobro-plataforma-cargos.test.ts:337:20

 Test Files  1 failed (1)
      Tests  18 skipped (18)
VITEST_EXIT=1
```

El «18 skipped» es lo que vitest informa cuando falla el `beforeAll`. **No es un skip por falta de
base**: la base existe, la suite sale FAIL con exit 1 y el error nombra la tabla que falta.

- lint de los dos archivos: limpio.
- typecheck: 48 errores, **todos** de `superadmin` en tests de SL-32. El cliente Prisma compartido de
  `node_modules` lo había generado otro worktree con un esquema sin `superadmin`. Ninguno sale de los
  archivos de SL-40. Se regenera en T2, dentro del lock.
