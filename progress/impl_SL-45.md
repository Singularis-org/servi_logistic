# SL-45 «Pago a la plataforma desde la wallet» — bitácora de implementación

- Worktree: `.worktrees/SL-45-pago-a-la-plataforma`, rama `feature/SL-45-pago-a-la-plataforma`.
- Base: contenedor propio `sl45-pg` (postgres:17, `localhost:5445`), base `sl45_t`, migrada y sembrada. El
  `.env` del worktree apunta ahí. Ninguna base compartida.
- `node_modules`: junction al checkout principal (no se instala nada).
- Exploración del código con Grep/Read: el MCP `codebase-memory-mcp` no estaba entre las herramientas
  de este agente.

## Tanda 0 — T0. Estado de `dev` (2026-10-24)

1. **Última migración.** `origin/dev` = `87269af` (merge de SL-40). La última es
   `20261024120000_cobro_plataforma_blindaje_orden`. SL-41 y SL-44 no traen migraciones posteriores. Los
   timestamps de `design.md > 8` se quedan: `20261024130000` y `20261024130100`.
2. **`wallet_movimiento_tipo_categoria_check` vigente.** Lo reescriben cinco `migration.sql`
   (`20260803120000`, `20260925120200`, `20260926120100`, `20260927120100`, `20260928120100`). La última es
   `20260928120100_wallet_458_tablas/migration.sql`, l. 110-126. T2 parte de esa definición.
3. **«A quién» obligatorio.** Lo exigen dos sitios:
   - el **servidor**: `registrarEgresoConLateralesSchema` (`lib/types/wallet-laterales.ts`, l. 51-57), con
     un `superRefine` que pide `contraparteNombre` para **todo** `tipoEgreso`, con el mensaje
     `CONTRAPARTE_OBLIGATORIA`;
   - el **diálogo**: `aQuienDelConcepto` (`app/(app)/wallet/_components/wallet-conceptos-manuales.ts`, l. 533).
   El servicio (`WalletEgresoService`) no lo mira. T5 lo deja opcional para `pago_plataforma` en el schema.
   El diálogo es de T7.
4. **El lector `egresos` no filtra por categorías.** `EgresoCajaDocumentosRepository.estadoDeDocumentos(ids)`
   solo filtra por los ids que recibe. Los ids los elige `tipoDeDocumentoOriginal`
   (`lib/services/WalletService.ts`, l. 108): `m.tipo === "egreso" && m.origenTipo === "gasto"` →
   `egreso_caja`. Un pago con origen `gasto` entra solo. **T6 no toca código.**
5. **`WalletMovimientoRepository.crearMovimientoRegistrado`** (l. 205): firma
   `(mov, registro, laterales = {})`, y abre él mismo `this.prisma.$transaction(async (tx) => …)`. Su
   primera sentencia es `crearMovimientos(tx, [mov])`, un `createMany` con `skipDuplicates`. Si la clave de
   idempotencia ya existe, devuelve `0` y el servicio relee el original.
   **Aviso para T5.** El `antes` va justo antes de `crearMovimientos`. Si el tope corre ahí sin mirar la
   clave, el reenvío de un pago ya registrado choca con el tope antes que con la idempotencia. Pasa, por
   ejemplo, al reenviar 1.000 con una deuda de 500 (bajó por ese mismo pago): respondería
   `validation_error` y no `ya_registrado`. `design.md > 6` exige lo contrario. T1 lo cubre con ese caso
   exacto.
6. **Tests que fijan listas.**
   - `TIPO_EGRESO_MANUAL_SEED`:
     - `tests/unit/guards/egreso-indemnizacion-emisores.test.ts`, l. 139, con la regex
       `TIPO_EGRESO_MANUAL_SEED = \["gasto_variable", "sueldo"\]`. **No estaba en `## Archivos esperados`**:
       se añade antes de T1;
     - `tests/unit/services/wallet-egreso-service.test.ts`, l. 462: `toEqual` literal de
       `TIPO_EGRESO_MANUAL_A_CATEGORIA`.
   - Los diez conceptos: `tests/unit/components/wallet-conceptos-manuales.test.ts` (l. 79, 97, 116, 194,
     229, 281, 401, 535). Es de T7.
   - Las categorías propias: no hay ninguna lista literal en `caja-clasificacion-459`, `caja-composicion-exhaustiva`
     ni `caja-derivaciones`, porque recorren los `Record`. Sí la tiene
     `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts` (l. 174), que ya estaba previsto. El resto
     de los diecinueve tests que importan `NATURALEZA_POR_CATEGORIA`, `LIQUIDEZ_POR_CATEGORIA` o
     `WALLET_EGRESO_NOMBRADO_SEED` se comprueba en T3 con `vitest related`.

## Tanda A

### T1. El test que hoy falla

`tests/integration/db/pago-plataforma-sl45.test.ts` recorre la tabla de `design.md > 3` paso a paso. Después
de cada paso mira:
- la deuda de A y de B, completa: con signo, estado e importe;
- el Δ de siete cifras de la caja de A y de la de B;
- la huella de `cobro_plataforma_movimiento`: filas, suma y md5 por empresa.

Los pasos rechazados comprueban que no se escribe nada en `wallet_movimiento`, `historial_accion` ni
`ajuste_caja_anulacion`. El control de no vacuidad comprueba tres cosas: la categoría está en `pg_enum`,
los cuatro cargos están en la base (leídos con el cliente base) y las dos cajas tienen dinero.

**Desviación de `design.md > 12.1` (a propósito).** El test no construye los servicios: llama a las
server actions **sin servicio inyectado**, el molde de `deuda-plataforma-wallet.test.ts`. Son tres:
`registrarEgresoAdministrativoAction`, `anularMovimientoAction` y `verDeudaPlataformaAction`, más
`verResumenCajaAction`. Solo se inyecta el actor, y la empresa sale de `conEmpresa`. Así el test cubre
también los composition roots: si `buildService` no pasa el `TopePagoPlataformaService` de T5, los pasos R9
se ponen en rojo. Además el typecheck sigue verde sin las clases de T4/T5. El valor global y la excepción
de B se fijan con `CobroPlataformaTarifaRepository` real, bajo el lock de SL-40, y las órdenes nacen por
`OrdenRepository.createManyOrdenes`, como pide el design.

**Pasos que el design no tabula, pero que sus afirmaciones piden:**
- R11 se prueba reenviando la clave del pago de 1.000 **cuando la deuda ya es 500**: la idempotencia tiene
  que ganarle al tope (aviso del dato 5 de T0);
- R19, con el mensajero de A;
- R9 también con saldo a favor;
- R18: con saldo a favor, A anula el pago de 1.500, y la deuda pasa a 1.000.

**Rojo** contra `sl45_t`, sin las migraciones de SL-45
(`pnpm exec vitest run tests/integration/db/pago-plataforma-sl45.test.ts`, salida resumida):

```
 × control: la categoría existe en la base, los cargos están escritos y las cajas tienen dinero
 × R13/R14: antes de pagar, A debe 1.500,00 y B 300,00
 × R7/R8/R13/R20/R22: A paga 1.000,00 con fecha de ayer → …
 … (15 de 15 en rojo)
AssertionError: expected [ 'ingreso_flete', …(26) ] to include 'egreso_pago_plataforma'
AssertionError: expected { status: 'ok', …(1) } to deeply equal { status: 'ok', …(1) }     ← la deuda sin estado ni importe
AssertionError: {"status":"validation_error","fieldErrors":{"tipoEgreso":["Elige una opción válida"]}}: expected 'validation_error' to be 'ok'
 Test Files  1 failed (1)
      Tests  15 failed (15)
T1_EXIT=1
```

Es rojo por la razón correcta: la categoría no está en la base, `tipoEgreso` no admite `pago_plataforma` y la
deuda no trae ni estado ni importe. Ningún `skip`: el `beforeAll` sembró las dos empresas, las cuatro
órdenes y las dos cajas, y el `afterAll` dejó la base limpia (`organizacion` = 0 filas).

### T2. Migraciones y esquema

- `db/migrations/20261024130000_pago_plataforma_categoria/migration.sql`: `ADD VALUE IF NOT EXISTS
  'egreso_pago_plataforma'`, sola en su archivo (55P04).
- `…/down.sql`: la función `quitar_valores_de_enum` de la 457, copiada con `sed` del original. Solo cambian
  el sufijo (`_457` → `_sl45`) y el prefijo de los mensajes (`rollback 457` → `rollback SL-45`).
- `db/migrations/20261024130100_pago_plataforma_check/{migration,down}.sql`: el CHECK de la 458
  (`20260928120100`, l. 110-126) con `'egreso_pago_plataforma'` al final del lado `egreso`. El `down`
  restaura la definición de la 458 tal cual.
- `db/schema.prisma`: `egreso_pago_plataforma` al final de `WalletMovimientoCategoria`, con su comentario.
- `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts`, en una base propia `sl45_iv_*` construida
  aplicando las migraciones anteriores y borrada en el `afterAll`. Tiene cinco casos:
  1. las dos migraciones en disco, con su `down.sql` y en orden detrás de la última de `dev`;
  2. con las dos, un pago entra como egreso, y como ingreso lo rechaza el CHECK con 23514;
  3. **con un pago registrado, los dos `down` abortan sin tocar nada**: el del CHECK con 23514 y el del
     enum con P0001 («se aborta sin borrar nada»). La foto queda igual a la de después de migrar;
  4. borrado el pago, los dos `down` en orden inverso dejan la foto igual a la de antes de SL-45. El valor
     sale de `pg_enum` y el CHECK queda igual, byte a byte, al de la 458;
  5. reaplicadas, la foto es la de la primera vez.

**Salida** (con `migrate deploy` ya aplicado sobre `sl45_t` y `prisma generate` dentro del lock):

```
$ pnpm exec prisma migrate deploy
  └─ 20261024130000_pago_plataforma_categoria/migration.sql
  └─ 20261024130100_pago_plataforma_check/migration.sql
All migrations have been successfully applied.

$ pnpm exec vitest run tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts tests/integration/db/schema-drift-saneamiento.test.ts
 Test Files  2 passed (2)
      Tests  21 passed (21)
T2_EXIT=0

$ pnpm run test:guardias
 Test Files  1 failed | 302 passed (303)
      Tests  4 failed | 4145 passed | 1 skipped (4150)
```

- El único rojo de las guardias es `dependencias-declaradas-presentes`, un rojo heredado que ya está en
  `tests/baseline-rojos.json`.
- **`pnpm run db:migrate` no sirve en este repo.** Es `prisma migrate dev`, y falla al montar la base
  sombra (`relation "_prisma_migrations" does not exist`): es la misma P3006 que ya impide
  `db:migrate:create`. La aplicación limpia se comprobó con `prisma migrate deploy`, que es la que usa el
  despliegue (`scripts/migrate-deploy.ts`).
- **Typecheck.** Tras el `generate`, el union de Prisma tiene un valor que todavía no está en
  `WALLET_MOVIMIENTO_CATEGORIA_SEED`, así que el typecheck queda en rojo hasta T3, que es la siguiente task.

**Mutaciones** (una cada vez, medida y revertida; la restauración se comprobó con `cmp` contra la copia):

| # | Mutación | Resultado |
|---|---|---|
| T2-M1 | `down.sql` del enum con `RAISE NOTICE` en vez de `RAISE EXCEPTION` en la precondición | **rojo**, 1 caso: el caso 3 recibe `22P02` (el `USING` choca con la fila) y espera `P0001` |
| T2-M2 | `down.sql` del CHECK que deja `'egreso_pago_plataforma'` en la lista | **rojo**, 2 casos: el 3 («el down del CHECK no abortó») y el 4 (el down del enum cae con 22P02 al restaurar el CHECK) |

Revertidas las dos: `Tests 5 passed (5)`.

**Aviso de entorno.** `prisma generate` escribe en el `node_modules` compartido. Antes había un cliente con
el esquema de SL-41 (`contrasenaDefinidaAt`); ahora queda el de SL-45. Quien typechequee otra rama tiene
que regenerar el suyo dentro del lock.
