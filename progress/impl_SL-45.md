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

**Arreglo posterior de T2 (`0fd1c46`).** Con el test ya commiteado, la guardia
`catalogo-postgres-acota-esquema` lo marcó: la lectura del CHECK en `pg_constraint` no acotaba el esquema.
Antes de commitear no lo veía, porque el archivo no estaba en el árbol. Se arregló con `JOIN pg_namespace`
y `nspname = 'public'`. Vuelve a verde: `Tests 12 passed (12)`, con la guardia y la ida y vuelta.

### T3. La clasificación de la categoría

**Código** (`design.md > 2`):
- `lib/types/wallet.ts`:
  - `WALLET_MOVIMIENTO_CATEGORIA_SEED` gana `egreso_pago_plataforma`. Lo exige `_EnsureCategoriaExhaustive`
    en cuanto el cliente de Prisma la trae;
  - `TIPO_EGRESO_MANUAL_SEED` y `TIPO_EGRESO_MANUAL_A_CATEGORIA` ganan `pago_plataforma` →
    `egreso_pago_plataforma`;
  - `WALLET_EGRESO_NOMBRADO_SEED` gana `egreso_pago_plataforma` (R24).
- `lib/utils/caja-tesoreria.ts`: `propio` y `efectivo`.
- `lib/constants/wallet-rotulos.ts` y `lib/utils/egreso-anulable.ts`: «Pago a la plataforma».
- `lib/utils/aporte-por-orden.ts`: `sin_reparto` / `no_nace_de_un_cierre`.
- `lib/analytics/metrics.ts`: `dinero_en_caja` (la caja entera, 28) y `ganancia_empresa` (15).

**Los `Record` totales que pidió el typecheck** (fuera de `lib/`, porque el seed los obliga a compilar):
- `app/(app)/wallet/_components/composicion-detalle-labels.ts`, `EGRESO_NOMBRADO_LABEL`: «Pago a la
  plataforma», en singular. Es el nombre que R24 le da a la fila; las demás filas de la columna van en
  plural.
- `app/(app)/wallet/_components/DesgloseEgresosLista.tsx`, `NOMBRADO_ICONO`: `Receipt`, el icono de
  «Gastos de la empresa», que ya estaba importado. **No estaba en `## Archivos esperados`.**
- `app/(app)/wallet/_components/wallet-labels.ts`: `TIPO_EGRESO_MANUAL_LABEL`, `DESCRIPCION_EGRESO_LABEL` y
  `DESCRIPCION_EGRESO_PLACEHOLDER` de `pago_plataforma`, con los textos de `design.md > 7.1`. T7 ya los
  encuentra puestos.
- Catorce fixtures de tests con `ComposicionGananciaDTO.egresos` ganan `egreso_pago_plataforma: "0.00"`,
  con el comentario «la exige el `Record` total», el mismo que dejó la 458-B. **Fuera de la lista
  esperada:** `BusquedaPorGuia469`, `ComposicionGananciaCard`, `DetalleFilaComposicion`, `WalletCaja463`,
  `WalletCaja468`, `WalletCajaBarra467`, `WalletCajaIvaSL39`, `WalletDeudaPlataformaSL40`,
  `WalletFiltroAQuien458E`, `WalletLibroCaja458E`, `descarga/WalletDescarga`, `wallet-page`,
  `wallet-actions` y `wallet-page-cobros-pendientes`.
- `tests/integration/db/caja-tesoreria-migration.test.ts`, `TIPO_LEGITIMO_POR_CATEGORIA`:
  `egreso_pago_plataforma: "egreso"`.

**Tests que cambian, cada literal escrito a mano y con su motivo:**

| Archivo | Cambio | Motivo |
|---|---|---|
| `metrics-caja-naturaleza.guardia` | `dinero_en_caja` 27 → 28, `ganancia_empresa` 14 → 15, más `toContain("egreso_pago_plataforma")` | R25. Con la lista derivada del `Record`, la mutación a `terceros` la pone en rojo |
| `financiera-ingresos-repo` | el `WHERE` de `ganancia_empresa` 14 → 15, más `toContain` | R25, medido en el `WHERE` |
| `caja-composicion-exhaustiva.guardia` | `WALLET_EGRESO_NOMBRADO_SEED` + `egreso_pago_plataforma` | R24: fila propia, no «Otros» |
| `egreso-indemnizacion-emisores` (T0) | la regex con `"pago_plataforma"` | el enum del formulario sigue cerrado; la indemnización sigue fuera |
| `wallet-egreso-service` | el `toEqual` del mapa + `pago_plataforma` | es el contrato: el literal sigue cerrado y un cuarto concepto vuelve a ponerlo en rojo |
| `wallet-labels` | `CONCEPTOS_ESPERADOS` + «Pago a la plataforma» (R23), 27 → 28, `TIPO_EGRESO_MANUAL_LABEL` y `EGRESO_NOMBRADO_LABEL` | R6, R23, R24 |
| `caja-tesoreria-migration` (integración) | + `AGREGADAS_459`, 27 → 28 en el CHECK de hoy | el patrón de la 457 y la 458-B |
| `caja-459-migration` (integración) | los tramos de `pg_enum` se leen uno más atrás, más `slice(-1)` = `["egreso_pago_plataforma"]` | el orden real del enum |
| `caja-derivacion-457` | el `POOL` gana `egreso_pago_plataforma` (27 → 28) | anti-vacuidad del pool |
| `ComposicionGananciaCard`, `DetalleFilaComposicion` | la fila «Pago a la plataforma» antes de «Otros»; 18 → 19 controles, más el nombre «Ver los movimientos de Pago a la plataforma» | R24: la fila sale sola del seed y abre su detalle |

**Tests nuevos:**
- `tests/unit/utils/caja-tesoreria.test.ts`, dos casos:
  - «R8: un pago de 1.000,00 es un egreso propio en efectivo». Con `derivarCaja`, la cifra principal pasa
    de 5.000 a 4.000, «Salió» de 0 a 1.000 y la ganancia de 5.000 a 4.000; terceros, capital e IVA quedan
    en 0,00;
  - «D9: se clasifica como el sueldo».
- `tests/unit/analytics/finanzas-diario.test.ts`, «un pago a la plataforma suma a los egresos del día y baja
  su ganancia» (R25): con un ingreso de 1.000 y un pago de 300 el día queda en ganancia 700, egresos 300.

**Mutaciones** (cada una medida y revertida; la restauración se comprobó con `cmp`):

| # | Mutación | Resultado |
|---|---|---|
| T3-M1 | `NATURALEZA_POR_CATEGORIA.egreso_pago_plataforma = "terceros"` | **rojo**: 8 casos en 5 archivos puros (`caja-tesoreria` ×3, `finanzas-diario`, `metrics-caja-naturaleza` ×2, `caja-clasificacion-459`, `caja-composicion-exhaustiva`) |
| T3-M2 | `LIQUIDEZ_POR_CATEGORIA.egreso_pago_plataforma = "cargo_a_tienda"` | **rojo**: 5 casos (`caja-tesoreria` ×2, `finanzas-diario`, `caja-clasificacion-459` ×2) |

**Salida:**

```
$ pnpm run typecheck
TC_EXIT=0   (0 errores)

$ pnpm exec eslint <los .ts/.tsx tocados>
LINT_EXIT=0

$ pnpm exec vitest run <los 13 archivos que cambiaron o se pusieron en rojo>
 Test Files  13 passed (13)
      Tests  271 passed (271)

$ pnpm exec vitest related --run <los 34 archivos del diff>
 Test Files  128 failed | 601 passed (729)
      Tests  85 failed | 8626 passed | 729 skipped (9440)
```

- De esos 128 archivos en rojo, 127 están en `tests/baseline-rojos.json`.
- El único que no está es `pago-plataforma-sl45.test.ts`, el rojo de T1, que se cierra en T6. Ahora va en
  rojo 14 de 15, por las razones que esperan T4 y T5:
  - la deuda todavía no trae `estado` ni `importe` (T4);
  - el schema todavía exige «a quién» (`contraparteNombre`, T5);
  - todavía no hay tope (T5).
  El control de no vacuidad ya pasa.

```
$ pnpm run test:guardias
 Test Files  1 failed | 302 passed (303)
      Tests  4 failed | 4145 passed | 1 skipped (4150)
```

El único rojo es `dependencias-declaradas-presentes`, que está en el baseline.

**Para el leader:**
- **Contradicción del spec.** `tasks.md > T8` y `design.md > 12.3` dicen que `ComposicionGananciaCard.test.tsx`
  y `WalletCajaIvaSL39.test.tsx` siguen en verde «sin tocarlos». No es posible: el `Record` total de
  `ComposicionGananciaDTO.egresos` obliga a tocar sus fixtures, y la fila nueva sale en la tarjeta (R24).
  En `WalletCajaIvaSL39` el cambio es solo la clave del fixture. En `ComposicionGananciaCard`, además, la
  fila en las tres listas literales.
- **Abierto: la métrica `egresos`.** Es «Salidas de la caja principal», y `design.md > 2` no la nombra. Se
  dejó igual: diez categorías, sin el pago, como fija `metrics-caja-naturaleza`. Si el pago tiene que
  contar en `egresos`, como cuenta en «Salió», es una decisión del spec.
- **Estado intermedio.** Desde T3, `registrarEgresoAdministrativoSchema` acepta `tipoEgreso:
  "pago_plataforma"`. Hasta T5, con «a quién» relleno, se podría registrar un pago **sin tope**. La rama no
  debe mergearse antes de T5.

## Mapa parcial R → test (T1–T3)

| R | Test |
|---|---|
| R7, R8, R9, R11, R13, R14, R15, R16, R18, R19, R20, R21, R22 | `tests/integration/db/pago-plataforma-sl45.test.ts` (rojo hasta T6) |
| R8 | `tests/unit/utils/caja-tesoreria.test.ts` («R8: un pago de 1.000,00…», «D9…») |
| R23 | `tests/unit/components/wallet-labels.test.ts` (`CONCEPTOS_ESPERADOS`) |
| R24 | `caja-composicion-exhaustiva.guardia`, `ComposicionGananciaCard`, `DetalleFilaComposicion` (19 controles) |
| R25 | `metrics-caja-naturaleza.guardia`, `financiera-ingresos-repo`, `finanzas-diario` |
| R27 | `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts` |

**Veredicto T0–T3:** la categoría, sus migraciones de ida y vuelta y su clasificación están hechas y
probadas, con typecheck y guardias en verde (salvo el baseline). T1 sigue en rojo, como se espera hasta
T4–T6.

## Tanda B (segundo backend_dev, 2026-10-24)

Exploración con Grep/Read: el MCP `codebase-memory-mcp` no estaba entre las herramientas de este agente.

### T4. La deuda con pagos

**Código:**
- `lib/types/cobro-plataforma.ts`: `EstadoDeudaPlataforma` y `DeudaPlataformaDTO` (`deuda`, `estado`,
  `importe`). `IDeudaPlataformaService` lo reexporta: los importadores de SL-40 no cambian.
- `lib/utils/deuda-plataforma.ts`: `derivarDeudaPlataforma(sumas, pagosVigentes)` → DTO, en
  `Prisma.Decimal`. Un cero que nace de restas sale «0.00» sin signo.
- `lib/interfaces/repositories/IPagoPlataformaRepository.ts` y `lib/repositories/PagoPlataformaRepository.ts`:
  `sumaPagosVigentes(organizacionId, cliente?)` (dos `findMany`, como §3) y `bloquear(tx)`
  (`pg_advisory_xact_lock(hashtext('pago_plataforma:' || current_setting('app.organizacion_id')))`).
- `CobroPlataformaMovimientoRepository.sumasPorTipo(organizacionId, cliente?)` y su interfaz.
- `DeudaPlataformaService(movimientos, pagos)`; `lib/actions/deuda-plataforma.ts` pasa los dos.

**Desviación menor de §3:** `sumaPagosVigentes` recibe `organizacionId` y lo escribe en el `where`
(§3 dice `sumaPagosVigentes(cliente?)` y deja el filtro a la extensión). Es el molde de
`sumasPorTipo` de SL-40 y la regla de `docs/perfil-agentes.md` («toda query de negocio filtra por
`organizacion_id`»). Consecuencia para la mutación 4 de §12.1: ver T6.

**Tests que cambian** (fuera de `## Archivos esperados`, por el `Record`/tipo nuevo):
- `tests/integration/db/deuda-plataforma-wallet.test.ts` (SL-40), l. 262-263: `derivarDeudaPlataforma(…, "0.00").deuda`.
  El caso y sus cifras no cambian.
- Fixtures con la forma vieja `{ deuda }`, ganan `estado` e `importe`: `tests/unit/components/wallet-labels.test.ts`
  (l. 302), `tests/components/WalletDeudaPlataformaSL40.test.tsx` (l. 190, 193) y
  `tests/integration/wallet-page.test.tsx` (l. 86). Solo el tipo; nada de lo que afirman.

**Evidencia** (con `prisma generate` dentro del lock: el cliente compartido no traía `egreso_pago_plataforma`):

```
$ pnpm run typecheck                                   TC_EXIT=0 (0 errores)
$ pnpm exec eslint <archivos de T4>                    LINT_EXIT=0
$ pnpm exec vitest run deuda-plataforma.test.ts deuda-plataforma-service.test.ts deuda-plataforma.composition-root.test.ts \
    deuda-plataforma-wallet.test.ts wallet-labels.test.ts WalletDeudaPlataformaSL40.test.tsx wallet-page.test.tsx
 Test Files  7 passed (7)
      Tests  90 passed (90)                            (deuda-plataforma-wallet de SL-40, contra Postgres, sin skip)
$ pnpm exec vitest related --run <archivos de T4>
 Test Files  1 failed | 14 passed (15)
      Tests  13 failed | 209 passed (222)              ← el único rojo es T1 (13/15): falta T5
```

**Mutación** (medida y revertida, `cmp` contra la copia):

| # | Mutación | Resultado |
|---|---|---|
| T4-M1 | `sumaPagosVigentes` cuenta también los pagos anulados (sin `!anulados.has(p.id)`) | **rojo**, 1 caso: `deuda-plataforma.composition-root` («…y deriva la deuda»: 350,00 en vez de 600,00) |

### T5. El registro con tope

**Código:**
- `lib/interfaces/services/ITopePagoPlataformaService.ts` (`ITopePagoPlataforma`, `comprobar(tx, { organizacionId,
  monto, claveIdempotencia })` → `"cabe" | "supera" | "reenvio"`) y `lib/services/TopePagoPlataformaService.ts`:
  candado → clave → cargos → pagos vigentes, todo con el `tx`; `Prisma.Decimal`, nunca `Number`.
- `PagoPlataformaRepository.claveYaRegistrada(organizacionId, clave, cliente?)` (y su interfaz).
- `WalletMovimientoRepository.crearMovimientoRegistrado(mov, registro, laterales?, antes?)` y su interfaz
  (`AntesDelRegistro`): `antes(tx)` corre dentro de su transacción, antes del `INSERT`.
- `WalletEgresoService`: 4.º parámetro `tope?`. Solo con `tipoEgreso === "pago_plataforma"` pasa un `antes` que
  llama al tope y lanza `TopeSuperadoError` (privada del servicio) si no cabe; el servicio la traduce a
  `validation_error` en `monto` con `MENSAJE_TOPE_PAGO_PLATAFORMA` (`lib/types/cobro-plataforma.ts`, el texto de
  R9). **Sin tope inyectado, registrar un pago lanza** antes de subir el comprobante o tocar la base. Un actor
  sin empresa también lanza. Para sueldo y gasto, la llamada al repositorio es la de antes (2 o 3 argumentos).
- `lib/types/wallet-laterales.ts`: «a quién» opcional SOLO para `pago_plataforma` (el sitio que dijo T0).
- `lib/actions/wallet-egresos.ts > buildService`: construye y pasa `TopePagoPlataformaService` con los repositorios reales.

**Reenvío contra tope (aviso 5 de T0).** El tope mira la clave **dentro de la transacción y después del
candado** (`claveYaRegistrada`). Si la clave ya tiene su fila, responde `reenvio` sin comparar; el `createMany`
con `skipDuplicates` devuelve 0 y el servicio responde `ya_registrado` con el original, como siempre. Se
mira después del candado y no antes a propósito: dos envíos simultáneos con la misma clave hacen esperar al
segundo en el candado; al entrar, ya ve la fila commiteada del primero. Si la mirara antes del candado, el
segundo pasaría la mirada (aún no hay fila), esperaría y chocaría con el tope (`validation_error`). Lo cubren
T1 («R11: el reenvío…», deuda ya en 500 y reenvío de 1.000) y el caso R11 de la concurrencia.

**R12 y `DECIMAL(12,2)`.** `montoPositivoSchema` (compartido por toda la caja) no acota las cifras enteras, y
no se ha tocado: cambiaría los demás formularios. En el pago, un monto que no cabe lo para el tope antes del
`INSERT` (`validation_error` en `monto`, con el texto de R9), porque ninguna deuda llega a 10^11. Test:
`wallet-egresos.composition-root` («R12: un monto que no cabe en DECIMAL(12,2)…»).

**Tests:**
- `tests/unit/services/tope-pago-plataforma-service.test.ts` (nuevo, 9): el borde exacto (500,00 cabe, 500,01
  no), deuda 0, sin movimientos, a favor, importes de 16 cifras; el orden candado → clave → sumas → pagos con el
  mismo `tx`; el reenvío sin comparar.
- `tests/unit/services/wallet-egreso-service.test.ts` (+12): R19 `forbidden` para los cinco roles sin acceso
  total sin tocar repo ni tope; `cabe` con los argumentos del tope; `supera` → `validation_error`; reenvío →
  `ya_registrado`; sin tope lanza; sin empresa lanza; sueldo y gasto no pasan por el tope; un error de base se
  propaga.
- `tests/unit/actions/wallet-egresos.composition-root.test.ts` (nuevo, 12): la action **sin servicio
  inyectado** sobre un cliente falso toma el candado (SQL con `pg_advisory_xact_lock`, `'pago_plataforma:'`,
  `current_setting('app.organizacion_id')`), lee con `org-a` y rechaza o llega al `INSERT`; el borde: «a quién»
  opcional solo en el pago, referencia vacía y montos inválidos → `validation_error`.
- `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts` (nuevo, 4, Postgres): control; R10 con pausa
  dentro de la transacción del primero (el segundo no termina durante la pausa, luego `validation_error`, deuda
  100,00); R10 sin pausa (exactamente uno entra); R11 con la misma clave a la vez (`ya_registrado`, mismo id).

**Evidencia** (dentro del lock, con `prisma generate`):

```
$ pnpm run typecheck                                    TC_EXIT=0
$ pnpm exec eslint <archivos de T5>                     0 errores, 0 avisos
$ pnpm exec vitest run tope-pago-plataforma-service wallet-egreso-service wallet-egresos.composition-root \
    wallet-egresos-actions deuda-plataforma-service       Tests  todos en verde (tras dos arreglos de dobles del propio test)
$ pnpm exec vitest run tests/integration/db/pago-plataforma-sl45.test.ts tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts
 Test Files  2 passed (2)
      Tests  19 passed (19)                             ← T1 en 15/15 ya con T5; la concurrencia 4/4
$ pnpm exec vitest related --run <archivos de T5>
 Test Files  118 failed | 269 passed (387)
      Tests  58 failed | 4066 passed | 667 skipped (4791)
                                                         ← los 118 archivos en rojo están TODOS en tests/baseline-rojos.json
$ pnpm run test:guardias
 Test Files  1 failed | 302 passed (303)                 ← dependencias-declaradas-presentes, del baseline
```

**Mutaciones** (una cada vez con `scratchpad/sl45be-mut.py`, que restaura y compara byte a byte):

| # | Mutación | Resultado |
|---|---|---|
| T5-M1 | `TopePagoPlataformaService` sin `bloquear(tx)` | **rojo**, 3 de 4 en `pago-plataforma-sl45-concurrencia` (el primero: «el segundo pago NO debe poder evaluarse mientras el primero tiene el candado»; los otros dos caen por la deuda que deja) |
| T5-M2 | el servicio no llama al tope (`antesDelPago` devuelve siempre `undefined`) | **rojo**, 10 de 15 en T1 (los cuatro R9 y todo lo que viene detrás de la deuda que deja) |
| T5-M3 | `buildService` no pasa el tope | **rojo**, 5 de 12 en `wallet-egresos.composition-root` (el servicio lanza «sin el tope inyectado») |

### T6. La anulación y el cierre del rojo

**Sin código.** El lector `egresos` (`EgresoCajaDocumentosRepository.estadoDeDocumentos`) no filtra por
categoría (dato 4 de T0): el pago, con origen `gasto`, entra solo en «Anular…». Lo confirma T1: R15, R16, R18 y
R21 van por `anularMovimientoAction` sin servicio inyectado.

**Evidencia** (dentro del lock):

```
$ pnpm exec vitest run tests/integration/db/pago-plataforma-sl45.test.ts tests/integration/db/cobro-plataforma-cargos.test.ts \
    tests/integration/db/aislamiento-wallet.test.ts tests/integration/db/deuda-plataforma-wallet.test.ts
 Test Files  4 passed (4)
      Tests  49 passed (49)          ← T1 15/15; cobro-plataforma-cargos y aislamiento-wallet sin tocarlos; 0 skipped
T6_EXIT=0
```

**Las cuatro mutaciones de `design.md > 12.1`**, sobre T1, una cada vez (`scratchpad/sl45be-mut.py`, restauración
comprobada byte a byte):

| # | Mutación | Resultado en T1 |
|---|---|---|
| 1 (= T5-M2) | el servicio no llama al tope | **rojo**, 10 de 15 |
| 2 (T6-M2) | `sumaPagosVigentes` cuenta también los pagos anulados | **rojo**, 8 de 15 (el primero, R15: la deuda no vuelve a 1.500,00) |
| 3 (T6-M3) | `NATURALEZA_POR_CATEGORIA.egreso_pago_plataforma = "terceros"` | **rojo**, 12 de 15 (desde el primer pago: la caja de A no se mueve como R8) |
| 4 (T6-M4) | `sumaPagosVigentes` sin el filtro de empresa: sin `organizacionId` en los dos `where` y leyendo como dueño (`comoPlataforma`, sin extensión ni RLS) | **rojo**, 12 de 15: «deuda de B: esperado 300.00, recibido -700.00» (B ve el pago de A) |
| 4a (T6-M4a) | solo quitar el `organizacionId` escrito, con la extensión puesta | **verde**, 15 de 15: lo para la extensión + RLS. Es la defensa en capas que se buscaba (molde SL-40 R24); la 4 completa es la que pide el design |

## Tanda E — E1, solo la parte de servidor

**Desviación aprobada (Carlos, 2026-10-24, P2 = sí):** además de la `DeudaPlataformaDTO` de `design.md > 9`, cada
empresa trae lo que ha pagado a la plataforma. El contrato que lee la pantalla:

```ts
// lib/types/empresas-plataforma.ts
export type EmpresaListada = {
  id: string; nombre: string; slug: string; creadaEn: Date;
  maestros: { nombre: string; email: string }[];
  cobroPorOrden: string | null;
  deudaPlataforma: DeudaPlataformaDTO;   // { deuda: "700.00" | "0.00" | "-300.00", estado: "debe" | "al_dia" | "a_favor", importe: "700.00" }
  pagadoPlataforma: string;              // Σ pagos vigentes, "0.00" si no ha pagado; un pago anulado no cuenta
};
```

La página ya la recibe sin cambios de cableado: `app/(app)/plataforma/empresas/page.tsx` → `listarEmpresasPlataforma(actor)`
(`lib/actions/_shared/empresas-plataforma.ts`) → `EmpresasPlataformaService.listarEmpresas` → `EmpresasPlataformaRepository.listar()`.
`EmpresasModule` recibe `empresas: EmpresaListada[]` por props; pinta «Debe {importe}», «Al día» o «A favor {importe}» según
`deudaPlataforma.estado`, y `pagadoPlataforma` tal cual (texto, sin aritmética). La pantalla es de frontend_dev (SL-41 tiene en
vuelo esos dos archivos).

**Código:**
- `lib/repositories/EmpresasPlataformaRepository.ts`: dentro del mismo `comoPlataforma` de SL-32, tres consultas para
  todas las empresas del listado (`organizacion_id in ids`): `groupBy` de los cargos por `(organizacion_id, tipo)`, los pagos y sus
  contra-asientos (la regla de «vigente» de `PagoPlataformaRepository`). Sin empresas no consulta nada. La deuda sale de
  `derivarDeudaPlataforma`.
- `lib/types/empresas-plataforma.ts`: los dos campos.
- `lib/actions/_shared/empresas-plataforma.ts` (fuera de `## Archivos esperados`): el tipo del cliente del composition
  root pasa a `EmpresasPlataformaPrismaClient` (lee también `cobroPlataformaMovimiento` y `walletMovimiento`).
- `lib/interfaces/repositories/IEmpresasPlataformaRepository.ts` (fuera de la lista): solo el comentario del contrato.

**Tests que cambian (fuera de la lista, por el tipo):** las fixtures de `EmpresaListada` ganan los dos campos («al día»,
"0.00") en `tests/unit/services/empresas-plataforma-service.test.ts`, `tests/integration/empresas-page.test.tsx`,
`tests/components/empresas-module.test.tsx` y `tests/components/EmpresasModuleCobro.test.tsx` (este último sí está en la
lista; T7/E1 de frontend lo seguirá cambiando). `tests/unit/actions/empresas-plataforma.composition-root.test.ts`: el doble
del cliente gana las dos tablas y la fila esperada, `debe 300,00` y `pagado 200,00`. `tests/integration/db/empresas-plataforma.test.ts`
(SL-32): la forma esperada y la lista de claves ganan los dos campos, y el esquema desechable de «sin organizaciones»
gana las dos tablas (`LIKE` sin restricciones) y los dos enums que filtra la lectura de pagos, con el molde de `rol_value`.

**Test nuevo:** `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts` (5, Postgres). Dos empresas reales; los pagos y la
anulación por las server actions; el listado por `listarEmpresasPlataforma` (la puerta de la página):
- control: los cargos en la base (1.000 de A, 300 de B) y nadie ha pagado;
- A paga 300 y 200, anula el de 200; B paga 300 → A debe 700,00 con 300,00 pagado, B al día con 300,00;
- B elimina su orden → a favor 300,00, lo pagado no cambia, A igual;
- el repositorio con el cliente dueño reparte igual (el dinero de A no sale en la fila de B);
- un `maestro` recibe `forbidden`.

**Evidencia** (dentro del lock):

```
$ pnpm run typecheck                                    TC_EXIT=0
$ pnpm exec eslint <archivos de E1>                     LINT_EXIT=0
$ pnpm exec vitest run empresas-plataforma-deuda-sl45 empresas-plataforma empresas-plataforma-cobro \
    empresas-plataforma.composition-root empresas-plataforma-service empresas-page empresas-module EmpresasModuleCobro
 Test Files  8 passed (8)
      Tests  89 passed (89)                              (0 skipped)
$ pnpm exec vitest related --run <archivos de E1>
 Test Files  8 passed (8)
      Tests  89 passed (89)
$ pnpm run test:guardias
 Test Files  1 failed | 302 passed (303)                 ← dependencias-declaradas-presentes, del baseline
```

**Mutaciones** (medidas y revertidas, byte a byte):

| # | Mutación | Resultado |
|---|---|---|
| E1-M1 | el listado cuenta los pagos anulados | **rojo**, 3 de 5 en `empresas-plataforma-deuda-sl45` (A: pagado 500,00 en vez de 300,00) |
| E1-M2 | `pagadoPlataforma` suma los pagos de todas las empresas (sin repartir por `organizacion_id`) | **rojo**, 3 de 5 («600.00» en vez de «300.00») |
| E1-M3 | la deuda del listado no resta los pagos | **rojo**, 3 de 5 y el composition root (1.000,00 en vez de 700,00) |

## Mapa R → test de esta tanda (T4–T6, E1-servidor)

| R | Test |
|---|---|
| R6 (servidor: sin «a quién») | `wallet-egresos.composition-root` («R6: el pago sin «a quién» pasa el borde») |
| R7, R8, R13, R15, R16, R18, R21, R22 | `pago-plataforma-sl45.test.ts` (T1, 15/15) |
| R9 | T1 (los cuatro R9), `tope-pago-plataforma-service` (bordes), `wallet-egreso-service` («R9: supera…»), `wallet-egresos.composition-root` |
| R10 | `pago-plataforma-sl45-concurrencia.test.ts` (los dos R10) |
| R11 | T1 («R11: el reenvío…»), concurrencia («R11: la misma clave…»), `tope-pago-plataforma-service` («reenvío sin comparar») |
| R12 | `wallet-egresos.composition-root` (referencia vacía, montos inválidos, monto que no cabe) |
| R13, R14 | `deuda-plataforma.test.ts`, `deuda-plataforma-service.test.ts`, `deuda-plataforma.composition-root.test.ts`, T1 |
| R19 | T1 (mensajero), `wallet-egreso-service` (cinco roles, registrar). Anular: T1 R21 y los de 458-B (`EgresoCajaAnulacionService`, sin cambios) |
| R20 | T1 («R20: B paga…» y la caja de B en cada paso), T6-M4 |
| R28 (servidor) | `empresas-plataforma-deuda-sl45.test.ts` |

**Veredicto (T4–T6 y E1-servidor):** la deuda resta los pagos vigentes, el pago tiene tope con candado dentro de la
transacción y nunca se acepta sin tope, T1 está en 15/15 y cada mutación pedida lo pone en rojo; el listado del
superadmin ya trae deuda y pagado por empresa, a falta de la pantalla.

## Tanda C (frontend_dev, 2026-10-24)

Exploración con Grep/Read: el MCP `codebase-memory-mcp` no estaba entre las herramientas de este agente.

### T7. El concepto en el diálogo (R6)

**Código:**
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts`: el undécimo concepto `pago_plataforma` justo después de
  `pago_a_mensajero` (tramo «sale»), con destino `egreso_administrativo` / `pago_plataforma` / `egreso_pago_plataforma`, sus
  etiquetas de `DESCRIPCION_EGRESO_*` (ya puestas por T3), su frase en `FRASE_DEL_EFECTO` y `CONCEPTO_REGISTRO_DE.pago_plataforma`.
  `aQuienDelConcepto` devuelve `null` para él (el resto de egresos administrativos siguen en «obligatorio»).
- `lib/types/efecto-movimiento.ts`: `CONCEPTO_REGISTRO_SEED` gana `pago_plataforma`.
- `lib/utils/efecto-movimiento.ts`: `EFECTO_POR_TIPO.pago_plataforma` = solo caja, `egreso`/`egreso_pago_plataforma`.
- `components/shared/wallet/RegistrarMovimientoDialog.tsx` (lo pide «a quién»): la referencia opcional y el mensaje de
  descripción vacía se decidían por `aQuienPide !== null`; ahora por la clase (`egreso_administrativo` | `ajuste_manual`).
  Sin esto, quitar «a quién» al pago le quitaba también la referencia opcional del sueldo y cambiaba su error a «El motivo es
  obligatorio.». Para los otros diez conceptos el resultado es el mismo que antes.

**Tests** (literales a mano):
- `tests/unit/components/wallet-conceptos-manuales.test.ts`: las listas de «diez» pasan a once con `pago_plataforma` /
  «Pago a la plataforma» escritos a mano (ids, nombres, libros, categorías de caja, grupos, frases, cuentas, «a quién», claves
  de «Así queda»). `conceptosDeCaja()` (los cuatro de la 334) excluye el pago, que no es de la 334. Bloque nuevo «SL-45»: grupo y
  posición, destino literal, «Referencia del pago» y su ejemplo, sin «a quién», la frase del efecto y la del libro, la cabecera de
  la caja.
- `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`: once radios con el nuevo en «Sale dinero de la empresa»;
  su frase; bloque nuevo «SL-45 R6/R9»: libro y campos (sin «A quién», con «Referencia del pago» y «Referencia (opcional)»),
  `FormData` con exactamente `claveIdempotencia, descripcion, monto, referencia, tipoEgreso` (sin `contraparteNombre`), sin
  referencia no llama al servidor, el `validation_error` del tope bajo `#movimiento-monto-error` con el literal de R9, y
  `conceptoInicial="pago_plataforma"` abre con él elegido (R4).
- `tests/unit/utils/efecto-movimiento.test.ts`: «SL-45 (R8)»: con 600 sobre la caja de 7.500,00 la cifra pasa a 6.900,00 y la
  ganancia de 1.000,00 a 400,00; tiendas y capital no cambian; la fila de `EFECTO_POR_TIPO`, literal.

**Mutaciones** (medidas y revertidas, `cmp` byte a byte):

| # | Mutación | Resultado |
|---|---|---|
| T7-M1 | `aQuienDelConcepto` devuelve «obligatorio» también para el pago | **rojo**, 5 casos en 2 archivos (`wallet-conceptos-manuales` ×2, diálogo ×3) |
| T7-M2 | el diálogo vuelve a `referenciaOpcional = aQuienPide !== null` | **rojo**, 2 casos del diálogo (no aparece «Referencia (opcional)») |
| T7-M3 | `EFECTO_POR_TIPO.pago_plataforma` con `egreso_pago_por_cuenta_tienda` | **rojo**, 1 caso (`efecto-movimiento`, la ganancia no baja) |

**Salida:**

```
$ pnpm exec prisma generate --schema db/schema.prisma   (dentro del lock: el cliente compartido no traía egreso_pago_plataforma)
$ pnpm run typecheck                                     TC_EXIT=0
$ pnpm exec eslint <7 archivos de T7>                    LINT_EXIT=0
$ pnpm exec vitest run <los 3 tests de T7>
 Test Files  3 passed (3)
      Tests  113 passed (113)
$ pnpm exec vitest related --run <7 archivos de T7>      (dentro del lock)
 Test Files  1 failed | 34 passed (35)
      Tests  601 passed | 5 skipped (606)
```

El único rojo es `tests/integration/db/efecto-movimiento-predice.test.ts`, en `tests/baseline-rojos.json` (falta el catálogo
sembrado de la 459 en `sl45_t`: «faltan la zona central, el tipo `cedula` o una orden…»). No es de T7.

### T8. La región de la deuda (R1–R5, R14, R24)

**Código:**
- `app/(app)/wallet/_components/wallet-labels.ts`: en `CAJA_RESUMEN_LABEL`, la pista de «debe» (R1) sustituye a la de
  SL-40, y entran `deudaPlataformaAlDiaPista` (R2), `deudaPlataformaAFavor` y `deudaPlataformaAFavorPista` (R3) y
  `registrarPagoPlataforma` (el botón). «La empresa», siempre de `EMPRESA`. `RegionBolsilloEmpresa.rotulo` y `.pista` pasan
  a `TextoDeRegion = string | ((datos) => string)`, con `textoDeRegion()` para resolverlos. Las de SL-39 siguen siendo texto.
  La de la deuda elige el rótulo y la pista por `estado` (un `Record` total por estado para la pista), y su `valor` lee
  `importe`, no `deuda`.
- `app/(app)/wallet/_components/CajaResumenCard.tsx`: la prop `accionDeudaPlataforma?: ReactNode`, pintada dentro de la
  región de la deuda, y los textos de región por `textoDeRegion`. Sin la prop, la tarjeta sigue sin controles.
- `app/(app)/wallet/_components/WalletModule.tsx`: la deuda pasa a estado (inicializado con la prop). `recargarTrasCambio`
  relee en paralelo la caja y la deuda (`verDeudaPlataformaAction()`; `forbidden` → `null`; si lanza, se queda la última y
  sale el toast `LECTURA_CAJA_FALLO`). El botón es un `RegistrarMovimientoDialog` con
  `conceptoInicial="pago_plataforma"` y la etiqueta «Registrar pago a la plataforma», solo si `estado === "debe"`. Los filtros
  siguen sin pedir la deuda (SL-40 R23 sigue verde).
- `composicion-detalle-labels.ts`: no se toca, porque T3 ya puso «Pago a la plataforma» (R24). `ComposicionGananciaCard` y
  `WalletCajaIvaSL39` siguen en verde sin tocarlos en esta task.
- `app/(app)/wallet/page.tsx`: no se toca. Ya pasaba `deudaPlataforma`.

**Tests** (literales a mano):
- `tests/components/WalletDeudaPlataformaSL45.test.tsx` (nuevo, 7): monta la página real. R1: rótulo, pista, «1.000» y el
  botón dentro de la región. R2: pista de «al día», «0», ningún botón en la región ni en la pantalla, con contraprueba del
  botón de la cabecera. R3/R14: rótulo «Saldo a favor de la empresa con la plataforma», pista e importe «500» sin signo. R4:
  el botón abre el diálogo con «Pago a la plataforma» marcado y su frase; la contraprueba es que la cabecera abre con el
  gasto. R14: barrido de `Number(`/`parseFloat(`/`parseInt(`/`.toFixed(` en tarjeta, rótulos y módulo; con «debe» e importe
  0,00, el botón sale igual (decide el estado, no el importe).
- `tests/components/WalletDeudaPlataformaSL40.test.tsx`: `PISTA` pasa a la de R1. Lo demás de SL-40, igual.
- `tests/unit/components/wallet-labels.test.ts`: la región de la deuda del caso SL-39/SL-40 con la pista de R1 (por
  `textoDeRegion`), más un bloque «SL-45 R1–R3» con los tres estados (rótulo, pista, valor = `importe`, sin signo) y la
  etiqueta del botón.
- `tests/integration/wallet-page.test.tsx` (jsdom, sin base): un doble nuevo de `@/lib/actions/efecto-movimiento`, porque el
  diálogo pide «Así queda». Bloque «SL-45 R5»:
  - tras registrar el pago desde el botón, `verDeudaPlataformaAction` se llama otra vez sin argumentos, y la región pasa de
    «1.000» a «400»;
  - si la relectura da `forbidden`, la región desaparece;
  - con deuda, los botones «Registrar…» son exactamente «Registrar un movimiento» y «Registrar pago a la plataforma». Es la
    excepción a la 334 que aprueba el design, y queda escrita en el test.

**Mutaciones** (script con `cmp` byte a byte tras cada una):

| # | Mutación | Resultado |
|---|---|---|
| T8-M1 | `recargarTrasCambio` sin `recargarDeuda()` | **rojo**, 2 casos R5 de `wallet-page.test.tsx` |
| T8-M2 | botón con `deudaPlataforma !== null` (en todo estado) | **rojo**, 3: SL45 R2 y R3, y el «un solo botón» de la 334 en `wallet-page` |
| T8-M3 | `valor` lee `deuda` (con signo) en vez de `importe` | **rojo**, 2: `wallet-labels` R3 y SL45 R3 |
| T8-M4 | rótulo fijo (nunca el de «a favor») | **rojo**, 2: `wallet-labels` R3 y SL45 R3 |

**Salida** (dentro del lock, con `prisma generate` antes):

```
$ pnpm run typecheck                                     TC_EXIT=0
$ pnpm exec eslint <7 archivos de T8>                    LINT_EXIT=0
$ pnpm exec vitest run <T8 + WalletCajaIvaSL39 + ComposicionGananciaCard>
 Test Files  6 passed (6)
      Tests  107 passed (107)
$ pnpm exec vitest related --run <7 archivos de T8>
 Test Files  104 passed (104)
      Tests  1694 passed | 17 skipped (1711)
```

**Pendiente de T8 (otra vuelta):** la comprobación en el navegador de `tasks.md > T8` (pagar 600 sobre 1.000,00 → 400,00;
anular → 1.000,00). Por eso T8 sigue sin `[x]`.

### E1. La pantalla: la columna «Plataforma» en «Empresas» (R28)

**Choque con SL-41.** Miré su diff contra `dev` en `EmpresasModule.tsx`. SL-41 añade «Bienvenida» **después** de «Maestros»,
`columnaBienvenida` después de `columnaMaestros` y su celda después de la de maestros. Por eso esta columna va **justo después
de «Cobro por orden»**: la cabecera y la celda se insertan entre «Cobro» y «Maestros», con una línea sin tocar entre su cambio
y el mío. Los textos y el componente de la celda van en un bloque nuevo al **final** del archivo (`TEXTOS_PLATAFORMA`,
`ESTADO_PLATAFORMA`, `CeldaPlataforma`), no en `TEXTOS`, que SL-41 toca. Fuera de eso solo hay un import (`money` de
`@/lib/config/moneda`, el de `CobroPorOrden`). Sin refactor ni reordenar. `page.tsx` no se toca: ya pasaba `empresas` con los
dos campos.

**Textos que pinta la columna** (cabecera «Plataforma», dos líneas por fila):
- `debe`: «Debe ₡500»; `al_dia`: «Al día»; `a_favor`: «A favor ₡250». El importe es `money(importe)` (siempre en positivo,
  del servidor).
- Debajo: «Pagado ₡300», `money(pagadoPlataforma)`. Con «0.00» sale «Pagado ₡0» (no se compara con cero en el cliente).
- `money()` pinta los enteros sin «,00» («₡500»), como el resto de la pantalla, así que «Debe 500,00» del spec sale como
  «Debe ₡500».

**Tests** (`tests/components/EmpresasModuleCobro.test.tsx`, bloque «SL-45 (R28)», 6 casos). Las palabras «Debe », «Al día»,
«A favor » y «Pagado » van a mano. El importe va con `money()`, el mismo formato que ya usa el archivo. Tres empresas con
importes distintos entre sí y del pagado (500/300, 0/1.200, −250/250/750). Los casos:
- la posición de la columna;
- el `textContent` exacto de «debe» y de «al día»;
- «a favor» sin «-»;
- «Pagado» con cero;
- el barrido sin `Number(`/`parseFloat`/`parseInt`/`toFixed` en `EmpresasModule.tsx`.

**Mutaciones** (script con `cmp` byte a byte):

| # | Mutación | Resultado |
|---|---|---|
| E1-M4 | `a_favor` se pinta con el texto de `debe` | **rojo**, 1 («a favor») |
| E1-M5 | «Pagado» pinta el `importe` de la deuda en vez de `pagadoPlataforma` | **rojo**, 4 |
| E1-M6 | se pinta `deuda` (con signo) en vez de `importe` | **rojo**, 1 («a favor») |

**Salida** (dentro del lock, con `prisma generate` antes):

```
$ pnpm run typecheck                                     TC_EXIT=0
$ pnpm exec eslint <EmpresasModule.tsx, EmpresasModuleCobro.test.tsx>   LINT_EXIT=0
$ pnpm exec vitest related --run <los dos>
 Test Files  3 passed (3)
      Tests  60 passed (60)
```

### T9. Ayuda (apoya R1–R3, R9, R15)

**`docs/ayuda/oficina/wallet-caja.md`** (`actualizado: 2026-10-24`; en `fuentes` entran `lib/utils/deuda-plataforma.ts`,
`lib/services/TopePagoPlataformaService.ts` y `lib/actions/wallet-egresos.ts`):
- «Lo que la empresa debe a la plataforma». La pista de SL-40 («Todavía no se cobra…») sale. Entra una tabla con los tres
  estados: rótulo, pista literal de R1–R3 y botón. «La deuda sola no cambia la caja» se mantiene, y «Lo ya pagado se
  descuenta» es nuevo.
- Sección nueva «Pagarle a la plataforma» (`design.md > 7.4`):
  - cómo se registra: el botón, o el concepto en «Sale dinero de la empresa»;
  - qué pide;
  - qué le pasa a la caja y a la ganancia;
  - que la deuda baja sin recargar;
  - el nombre en el libro y en la composición;
  - por qué no se puede pagar de más, con el literal de R9;
  - cuándo aparece el saldo a favor;
  - cómo se anula un pago mal registrado (R15, R18).
- «Lo que sí se registra a mano»: «once conceptos», «Pago a la plataforma» al final de «Sale dinero de la empresa» y lo que
  pide.
- La tabla de nombres del libro gana la fila «Pago a la plataforma».
- «Anular»: el pago entra en la lista, con su efecto (una «Corrección de caja (suma)» que sube la caja, la ganancia y la
  deuda).
- «Lo que esta pantalla NO hace»: el pago se anula con motivo, y «No cobra la plataforma».

**Primer rojo, corregido.** `docs-marca-heredada.guardia` fija la frase «tienda, un pago de una tienda a la empresa, una
corrección, un cobro por» del apartado «NO hace». Yo había metido «un pago a la plataforma» en medio. Ahora va detrás, en
una frase propia.

**Tests** (fuera de `## Archivos esperados`, porque leen la ayuda):
- `tests/unit/asistente/contexto-457.test.ts` y `contexto-458.test.ts`: «diez conceptos» pasa a «once conceptos», y la fila
  «Sale dinero de la empresa» se fija entera con «· Pago a la plataforma |». En 458 se añade `not.toContain` de «diez
  conceptos». Es el contrato nuevo, escrito a mano.
- `tests/unit/asistente/contexto-sl45.test.ts` (nuevo, 11; molde `contexto-457`):
  - maestro y admin reciben las tres pistas literales de R1–R3 y ya no reciben «Todavía no se cobra»;
  - también reciben cómo se registra, R9 con su mensaje y R15;
  - mensajero, adminTienda y adminSatelite no reciben nada de esto.

**Mutación:**

| # | Mutación | Resultado |
|---|---|---|
| T9-M1 | en la ayuda, «**No se puede pagar de más.** El pago no puede…» → «**Se puede pagar de más.** El pago puede…» | **rojo**, 2 (`contexto-sl45`, R9 en maestro y admin); restaurado con `cmp` |

**Salida** (dentro del lock):

```
$ pnpm run test:guardias
 Test Files  1 failed | 302 passed (303)
      Tests  4 failed | 4145 passed | 1 skipped (4150)      ← dependencias-declaradas-presentes, del baseline
$ pnpm exec vitest related --run docs/ayuda/oficina/wallet-caja.md <los 3 tests de asistente>
 Test Files  3 passed (3)
      Tests  75 passed (75)
$ pnpm exec vitest run <los 34 archivos de tests/ que leen docs/ayuda>
 Test Files  34 passed (34)
      Tests  583 passed (583)
$ pnpm run typecheck                                      TC_EXIT=0
$ pnpm exec eslint <los 3 tests de asistente>             LINT_EXIT=0
```

`vitest related` sobre el `.md` no encuentra tests, porque nadie lo importa: lo leen con `fs`. Por eso se corren a mano los
34 archivos que lo leen, y las guardias completas.

## Mapa R → test de esta tanda (T7, T8, E1-pantalla, T9)

| R | Test |
|---|---|
| R1 | `WalletDeudaPlataformaSL45` (R1), `wallet-labels` (SL-45 R1), `WalletDeudaPlataformaSL40` (pista), `wallet-page` (R1, los dos «Registrar…»), `contexto-sl45` |
| R2 | `WalletDeudaPlataformaSL45` (R2), `wallet-labels` (SL-45 R2), `contexto-sl45` |
| R3 | `WalletDeudaPlataformaSL45` (R3/R14), `wallet-labels` (SL-45 R3/R14), `contexto-sl45` |
| R4 | `WalletDeudaPlataformaSL45` (R4), `wallet-registrar-movimiento-dialog` (SL-45 R4) |
| R5 | `wallet-page.test.tsx` (SL-45 R5, ×2). La anulación usa el mismo `recargarTrasCambio` (el `onCambio` del libro), y la recorre el E2E de T10 |
| R6 | `wallet-conceptos-manuales` (bloque SL-45 y listas de once), `wallet-registrar-movimiento-dialog` (SL-45 R6 ×3), `efecto-movimiento` (SL-45 R8) |
| R9 (pantalla) | `wallet-registrar-movimiento-dialog` (SL-45 R9: bajo el monto), `contexto-sl45` |
| R14 (pantalla) | `WalletDeudaPlataformaSL45` (barrido y «debe» con 0,00), `EmpresasModuleCobro` (barrido) |
| R15 (ayuda) | `contexto-sl45` |
| R24 | `ComposicionGananciaCard` y `DetalleFilaComposicion` (de T3), en verde |
| R28 (pantalla) | `EmpresasModuleCobro.test.tsx` (SL-45 R28, 6) |

**Abierto para el leader:** `tests/integration/db/efecto-movimiento-predice.test.ts` (458-B, en el baseline por falta de datos)
registra los diez conceptos uno a uno y no el pago a la plataforma. Para incluirlo hacen falta cargos de la plataforma en su
escenario, porque el pago tiene tope. Es de backend y no lo toqué. El «Así queda» del pago está cubierto en puro por
`efecto-movimiento.test.ts` (SL-45 R8).

**Veredicto (T7, T8, E1-pantalla, T9):** el concepto, la región por estado con su botón y su relectura, la columna
«Plataforma» y la ayuda están hechos. Cada mutación medida los pone en rojo. Faltan, en otra vuelta, la comprobación de T8 en
el navegador y T10.

## T10 y el navegador de T8 (frontend_dev, 2026-10-24)

Sobre `6a6dba0`. `gate.lock` («frontend-SL-45-e2e») tomado a las 14:10 y soltado al final, con `prisma generate` dentro.
Base desechable `sl45_e2e` en `sl45-pg` (`migrate deploy` + `db:seed`). Al acabar se borró con `DROP … WITH (FORCE)`, y también
`sl45_e2e_k`, la base limpia del kardex. El `.env` del worktree no se tocó: `DATABASE_URL` va por entorno.

Hubo un solo dev server a la vez, desde este worktree, con el puerto 3000 libre antes y `rm -rf .next`:
- uno sin `SMTP_*` y con `AUTH_OTP_DEBUG_LOG=1` (PID 10060), para SL-45, SL-40 y wallet;
- después otro con las `SMTP_*` del `.env` principal, exportadas sin imprimirlas, para el humo (PID 27308).

Los dos se pararon por PID. El 3000 quedó libre, `.next/dev` borrado y los logs del servidor también, porque registran
contraseñas. El MCP del grafo no estaba entre las herramientas: usé Grep/Read.
Logs y capturas en `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl45-e2e/`.

**Archivos**
- Nuevo `e2e/pago-plataforma-sl45.spec.ts`: 6 casos en serie, solo con `SL45_UI=1`, como los de SL-39 y SL-40.
  - Importa `_dos-empresas-fixture.ts`, `_superadmin-fixture.ts` y `_wallet-iva-sl39-siembra.ts` sin modificarlos.
  - Las órdenes se crean y se eliminan con el cliente dueño: los triggers de SL-40 escriben cargos y reversos.
  - Los pagos y la anulación van solo por la pantalla.
- `e2e/cobro-plataforma-sl40.spec.ts`: solo el literal de la pista (línea 53), cambiado a la de R1.

### 1. E2E nuevo

```
SL45_UI=1 pnpm exec playwright test e2e/pago-plataforma-sl45.spec.ts --workers=1 --reporter=list
MEDIDO A antes: principal=₡28.500 entro=₡30.000 salio=₡1.500 ganancia=₡1.700 deuda=₡1.000
MEDIDO A tras pagar 600: principal=₡27.900 entro=₡30.000 salio=₡2.100 ganancia=₡1.100 deuda=₡400
  ok 1 › 1. A debe ₡1.000, el botón abre el pago elegido, paga 600 y la región dice ₡400 sin recargar; 500 no pasa (R1, R4, R5, R8, R9) (3.7s)
MEDIDO Empresas (1): A=«Debe ₡400 / Pagado ₡600» B=«Al día / Pagado ₡0»
  ok 2 › 2. el superadmin ve «Debe ₡400 · Pagado ₡600» en A y «Al día · Pagado ₡0» en B (R28) (626ms)
MEDIDO A tras anular: principal=₡28.500 entro=₡30.600 salio=₡2.100 ganancia=₡1.700 deuda=₡1.000
  ok 3 › 3. A anula el pago desde el libro y la región vuelve a ₡1.000 sin recargar (R5, R15, R23) (4.6s)
MEDIDO A tras pagar 1000: principal=₡27.500 entro=₡30.600 salio=₡3.100 ganancia=₡700 deuda=₡0
MEDIDO A a favor: deuda=₡500
  ok 4 › 4. A paga los ₡1.000 y queda al día sin botón; se elimina una orden y queda ₡500 a favor (R2, R3) (3.0s)
MEDIDO Empresas (2): A=«A favor ₡500 / Pagado ₡1.000»
  ok 5 › 5. el superadmin ve «A favor ₡500 · Pagado ₡1.000» en A (R28) (691ms)
MEDIDO B: principal=₡500 entro=₡500 salio=₡0 ganancia=₡40 deuda=₡0
  ok 6 › 6. B no ve nada de A: al día, sin pagos en su libro y su caja igual (R20) (979ms)
  6 passed (20.5s)
PW_EXIT=0
```

Qué comprueba, además de los números:
- **R1, R2 y R3, con sus literales:**
  - R1: el rótulo, la pista y el botón, dentro de la región.
  - R2: la pista, y ningún botón «Registrar pago…» en toda la pantalla.
  - R3: «Saldo a favor…» como nombre de la región, la pista, y sin botón.
- **El diálogo (R4, R6):** abre con el radio «Pago a la plataforma» marcado y «Gasto de la empresa» sin marcar, con la frase de R6.
- **R9:** pagar 500 deja `aria-invalid` en «Monto», con el mensaje de R9 como descripción accesible. La base sigue con un solo pago.
- **La anulación:** la constancia guarda el motivo y el contra-asiento es `ingreso:ingreso_ajuste:600.00`. El pago no se borra.
- **Sin recarga:** una marca en `window` sigue ahí después de pagar y después de anular.
- **B:** sus cuatro cifras son iguales a las que tenía antes del primer pago de A, y su libro no tiene ningún pago.

Hice dos ajustes durante la medición. Los dos son del test, no de la app:
- **(a) Hidratación.** Recién cargada, la página de `pnpm dev` puede no estar hidratada, y el primer clic en «Ver» caía en el
  HTML del servidor. `abrirCon` repite el clic hasta que se abre lo esperado; abrir es idempotente.
- **(b) El contra-asiento** no lleva la categoría del pago, sino `ingreso_ajuste`, como ya mide T1.

**Navegador de T8.** La salida de arriba más las capturas, que miré una a una:
- `sl45-dialogo.png`: el diálogo con «Pago a la plataforma» elegido, su frase y «Se registra en el libro como «Pago a la
  plataforma».».
- `sl45-region-400.png`:
  - la región en ₡400, con la pista de R1 y el botón;
  - «Pago a la plataforma ₡600» en la composición;
  - el libro con «Pago a la plataforma · Sale ₡600 · La empresa».
- Las demás: `sl45-region-anulado.png`, `sl45-region-a-favor.png`, `sl45-empresas-debe.png`, `sl45-empresas-a-favor.png` y
  `sl45-wallet-b.png`.

| | Dinero en caja | Entró | Salió | Ganancia | Deuda |
|---|---|---|---|---|---|
| dos órdenes a 500 | ₡28.500 | ₡30.000 | ₡1.500 | ₡1.700 | ₡1.000 |
| paga 600 | ₡27.900 | ₡30.000 | ₡2.100 | ₡1.100 | ₡400 |
| anula el pago | ₡28.500 | ₡30.600 | ₡2.100 | ₡1.700 | ₡1.000 |
| paga 1.000 | ₡27.500 | ₡30.600 | ₡3.100 | ₡700 | ₡0 (al día) |
| se elimina una orden | — | — | — | — | ₡500 a favor |

Observación (no es de esta task): en el libro, la segunda línea del pago dice «Gasto o sueldo registrado a mano». Es el
origen genérico `gasto` de los egresos manuales.

**Mutación:** `recargarTrasCambio` sin `recargarDeuda()` (`WalletModule.tsx:639`). Copia en el scratchpad y restauración
comprobada con `cmp` (`RESTAURADO_OK`).

```
  x  1 › 1. A debe ₡1.000, … (R1, R4, R5, R8, R9) (33.8s)
    Error: expect(locator).toHaveText(expected) failed
    Locator:  … [data-region="deuda_plataforma"] … .tabular-nums first()
    Expected: "₡400"
    Received: "₡1.000"
  1 failed
  5 did not run
PW_EXIT=1
```

Con el archivo restaurado, la corrida final de arriba sale `6 passed`.

### 2. `e2e/cobro-plataforma-sl40.spec.ts`: en ROJO con solo el literal (bloqueo para el leader)

```
SL40_UI=1 pnpm exec playwright test e2e/cobro-plataforma-sl40.spec.ts --workers=1 --reporter=list
  ok 1 › T8: el superadmin fija el global, … (R9–R11) (1.9s)
  x  2 › T7: A crea dos órdenes y elimina una; la deuda dice ₡500 y la caja no cambia (R21, R22) (5.9s)
    Error: expect(locator).toContainText(expected) failed
    Expected substring: "Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, …"
    Received string:    "Lo que la empresa debe a la plataforma₡0La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí."
    > 376 |   await expect(region).toContainText(TEXTO.pistaDeuda);
  1 failed
  1 passed (13.7s)
PW_EXIT=1
```

- **La causa es R2, no el literal.** `leerDeuda` exige la pista de «debe» también en la lectura «antes», con deuda ₡0. Con
  SL-45, una deuda cero pinta la pista de «al día». Cambiar solo el literal no basta.
- **El arreglo mínimo está medido y revertido.** Lo revertí porque el encargo limita este archivo al literal, que choca con
  SL-44.
  - Qué cambia: en `leerDeuda`, leer el importe primero y pedir la pista de «al día» si es `₡0`, y la de R1 si no (3 líneas).
  - Con él: `2 passed (10.6s)`, `PW_EXIT=0`.
  - El diff está en `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl45-e2e/sl40-propuesta.diff`.
  - Decide el leader, y hay que avisar a SL-44.
- **Con dos workers, los specs de SL-40 y SL-45 se pisan.** Los dos tocan la tarifa global, que es una fila única. Por eso se
  corren con `--workers=1`.

### 3. `e2e/wallet.spec.ts`: rojo heredado

```
pnpm exec playwright test e2e/wallet.spec.ts --workers=1 --reporter=list
  x  1 › Wallet — acceso del maestro (libro + balance + manual) › … (5.5s)
  x  2 › Wallet — bloqueo de rol NO autorizado › un mensajero es rechazado en /wallet … (R19) (5.5s)
    TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
  2 failed
PW_EXIT=1
```

El spec entra con `maestro@example.com` y `mensajero@example.com`, que una base vacía no tiene. Es el mismo rojo que midió
SL-40, y no es de SL-45:
- el archivo es idéntico al de `origin/dev`: `git diff --stat origin/dev -- e2e/wallet.spec.ts` sale vacío;
- SL-44 lo reescribe en su rama (173 líneas de diff contra `origin/dev`);
- `requirements.md:66` de SL-44 nombra la causa: «credenciales de usuarios sembrados a mano».

### 4. `e2e/dos-empresas-humo.spec.ts`

```
pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --workers=1 --reporter=list
  ok 1 › alta de A y B por el servicio, repetición idempotente y correo de recuperación aceptado por el SMTP (9ms)
  ok 2 › el maestro de A recorre todas las rutas de su menú sin error ni datos de B (1.2m)
  ok 3 › el maestro de B recorre todas las rutas de su menú sin error ni datos de A (26.3s)
  ok 4 › cada maestro abre el webhook de su API key y ve su URL, no la de la otra empresa (3.1s)
  ok 5 › B abriendo los detalles de A ve «no encontrado», y A los ve con su marcador (15.0s)
  ok 6 › vehículos carga y escribir desde la pantalla falla cerrado (R40); geografía le da 404 al maestro (SL-32 R26) (5.1s)
  6 passed (2.2m)
PW_EXIT=0
EmpresaNoResuelta en el log del server: 0
```

### 5. No regresión (R26)

```
pnpm exec vitest run tests/integration/db/libro-kardex-468.test.ts tests/components/descarga/WalletDescarga.test.tsx
# base limpia (sl45_e2e_k: migrate deploy + db:seed)
 ❯ tests/integration/db/libro-kardex-468.test.ts (6 tests | 6 skipped)
Error: hay DATABASE_URL pero faltan la zona central, el tipo `cedula` o una orden … (SL-31).
 Test Files  1 failed | 1 passed (2)
      Tests  12 passed | 6 skipped (18)
VITEST_EXIT=1
# base con los datos del E2E (sl45_e2e)
 ❯ tests/integration/db/libro-kardex-468.test.ts (6 tests | 6 failed)
DriverAdapterError: referencia a otra empresa: cierre_dia.destino_zona_id -> zona
```

- `WalletDescarga`: verde (12).
- `libro-kardex-468` está en `tests/baseline-rojos.json`, y su rojo no es de SL-45:
  - con la base limpia cae en el `beforeAll` por falta de datos, lo mismo que midió SL-40;
  - con la base del E2E cae porque toma una zona de otra empresa;
  - desde `origin/dev` (`d7a6309`) y contra la misma base sale el mismo `DriverAdapterError … cierre_dia.destino_zona_id ->
    zona`, con 6 failed. Lo corrí en un worktree temporal con junction de `node_modules`, ya borrado.

### 6. Verificación propia

- `pnpm run typecheck`: `TC_EXIT=0`, con `.next/dev` borrado.
- `pnpm exec eslint e2e/pago-plataforma-sl45.spec.ts e2e/cobro-plataforma-sl40.spec.ts`: `LINT_EXIT=0`.
- El archivo nuevo va en LF y no nombra a Ordenex.

## Mapa R → test completo (R1–R28)

| R | Test |
|---|---|
| R1 | `WalletDeudaPlataformaSL45` (R1), `wallet-labels` (SL-45 R1), `wallet-page` (R1, los dos «Registrar…»), `contexto-sl45`, **E2E paso 1** |
| R2 | `WalletDeudaPlataformaSL45` (R2), `wallet-labels` (SL-45 R2), **E2E pasos 4 y 6** |
| R3 | `WalletDeudaPlataformaSL45` (R3/R14), `wallet-labels` (SL-45 R3/R14), **E2E paso 4** |
| R4 | `WalletDeudaPlataformaSL45` (R4), `wallet-registrar-movimiento-dialog` (SL-45 R4), **E2E paso 1** |
| R5 | `wallet-page.test.tsx` (SL-45 R5, ×2), **E2E pasos 1 (registrar) y 3 (anular)**; mutación medida en los dos niveles |
| R6 | `wallet-conceptos-manuales` (SL-45), `wallet-registrar-movimiento-dialog` (SL-45 R6 ×3), `wallet-egresos.composition-root` (sin «a quién»), E2E paso 1 (frase) |
| R7 | `pago-plataforma-sl45.test.ts` («R7/R8/R13/R20/R22…») |
| R8 | `pago-plataforma-sl45.test.ts`, `caja-tesoreria.test.ts` (R8, D9), `efecto-movimiento.test.ts` (SL-45 R8), **E2E paso 1** (−600 en caja y ganancia, +600 en «Salió») |
| R9 | `pago-plataforma-sl45.test.ts` (cuatro R9), `tope-pago-plataforma-service`, `wallet-egreso-service`, `wallet-registrar-movimiento-dialog` (bajo el monto), **E2E paso 1** |
| R10 | `pago-plataforma-sl45-concurrencia.test.ts` (los dos R10) |
| R11 | `pago-plataforma-sl45.test.ts` (R11), `pago-plataforma-sl45-concurrencia.test.ts` (R11), `tope-pago-plataforma-service` |
| R12 | `wallet-egresos.composition-root.test.ts` (referencia vacía, montos inválidos, monto que no cabe) |
| R13 | `pago-plataforma-sl45.test.ts`, `deuda-plataforma-wallet.test.ts`, `deuda-plataforma.composition-root.test.ts` |
| R14 | los de R13, `WalletDeudaPlataformaSL45` (barrido), `EmpresasModuleCobro` (barrido) |
| R15 | `pago-plataforma-sl45.test.ts` («R15/R22…»), `contexto-sl45` (ayuda), **E2E paso 3** (constancia con motivo, contra-asiento 600, caja y ganancia vuelven) |
| R16 | `pago-plataforma-sl45.test.ts` («R16…») |
| R17 | **`pago-plataforma-inmutable-sl45.guardia.test.ts`** (ningún delegado Prisma ni SQL crudo actualiza o borra `wallet_movimiento` en `lib/`, `app/`, `scripts/`; los contratos del libro y del pago no ofrecen editar ni borrar), **`descarga-pago-plataforma-sl45.test.ts`** (tras «Anular…», la fila del pago tiene el mismo md5 en Postgres), E2E paso 3, `wallet-migration.test.ts` |
| R18 | `pago-plataforma-sl45.test.ts` («R18…») |
| R19 | `pago-plataforma-sl45.test.ts` (mensajero), `wallet-egreso-service` (cinco roles); anular: los de 458-B |
| R20 | `pago-plataforma-sl45.test.ts` («R20…»), **E2E paso 6** |
| R21 | `pago-plataforma-sl45.test.ts` («R21…») |
| R22 | `pago-plataforma-sl45.test.ts` («R7/R8/R13/R20/R22», «R15/R22») |
| R23 | `wallet-labels.test.ts` (`CONCEPTOS_ESPERADOS`), **E2E paso 3** («Ver «Pago a la plataforma»…» y «Anular…») |
| R24 | `ComposicionGananciaCard`, `DetalleFilaComposicion`, `caja-composicion-exhaustiva.guardia` |
| R25 | `metrics-caja-naturaleza.guardia`, `financiera-ingresos-repo`, `finanzas-diario` |
| R26 | **`descarga-pago-plataforma-sl45.test.ts`** (Postgres: `libroCajaKardexAction` + `filasKardex`/`filaBaseCaja`, como `descargaLibroCaja`; una fila «Pago a la plataforma» escrita a mano en «Sale» 600,00, columnas de antes a mano, saldos fila a fila y final = «Dinero en caja»; tras anular, pago y contra-asiento siguen y cuadran) |
| R27 | `migracion-sl45-ida-y-vuelta.test.ts` |
| R28 | `empresas-plataforma-deuda-sl45.test.ts`, `EmpresasModuleCobro.test.tsx` (SL-45 R28), **E2E pasos 2 y 5** («Debe», «Al día», «A favor» y «Pagado») |

**Veredicto (T10 y navegador de T8):** el E2E nuevo pasa 6/6 y lo tumba quitar la recarga de la deuda; el humo pasa 6/6, y en
el navegador la deuda va de 1.000 a 400 y vuelve a 1.000. Quedan abiertos para el leader:
- `cobro-plataforma-sl40.spec.ts` sigue en rojo con solo el literal; el arreglo de 3 líneas, medido y revertido, está en la
  sección 2;
- R17 tiene cobertura débil y R26 no tiene test.

## Huecos de T10: R26, R17 y el E2E de SL-40 (backend_dev, 2026-10-24)

Sobre `951b311`. `gate.lock` («backend-SL-45») tomado tras esperar a SL-44-T6b y soltado al final. MCP del grafo no
disponible entre las herramientas: Grep/Read.

**Archivos**
- Nuevo `tests/integration/db/descarga-pago-plataforma-sl45.test.ts` (R26, R17; Postgres, `sl45_t`). Recorre la descarga
  «Solo los movimientos» como `descargaLibroCaja`: `libroCajaKardexAction` real + `filasKardex`/`filaBaseCaja`. Empresa
  propia: ajuste 5.000, dos órdenes (trigger de SL-40, deuda 1.000) y un pago de 600 por la action del diálogo.
- Nuevo `tests/unit/guards/pago-plataforma-inmutable-sl45.guardia.test.ts` (R17). El libro es append-only por código, no
  por la base (`servi_app` tiene UPDATE/DELETE desde `20261022130000`): reutiliza el censo de escritores de
  `premio-ranking-alcance.guardia` y cierra lo que nadie medía, que el escritor solo inserta. Detectores con control.
- `e2e/cobro-plataforma-sl40.spec.ts`: el segundo hunk del diff propuesto (el primero ya estaba); el literal de «al día»
  va en `TEXTO.pistaAlDia`.

**Mutaciones (medidas y restauradas con `cmp`, `RESTAURADO_OK` en todas)**

| Mutación | Cae | Fallos |
|---|---|---|
| `CATEGORIA_LABEL.egreso_pago_plataforma` → «Pago de la plataforma» | descarga R26 (×2): «una sola fila del pago… got +0» | 2 de 3 |
| `listar` (camino Prisma, sin filtros) con `NOT: { categoria: "egreso_pago_plataforma" }` | descarga R26 (×2): `KardexDescuadradoError` del servidor | 2 de 3 |
| `whereLibroCajaConTerminoSql` excluyendo la categoría | **sobrevive**: ese WHERE solo corre con término, «A quién» o guía; la descarga sin filtros va por `buildWhere` (la fila de arriba) | 0 |
| `borrarPago` con `walletMovimiento.delete` en el repositorio + su firma en `IWalletMovimientoRepository` | guardia R17 (Prisma y contratos) | 2 de 4 |
| `DELETE FROM "wallet_movimiento"` crudo en `PagoPlataformaRepository.ts` | guardia R17 (SQL crudo) | 1 de 4 |

La comprobación md5 de la fila del pago tras anular no tiene mutación de app que la tumbe: no existe ningún camino que
actualice el libro (lo que mide la guardia).

**Salida**
```
pnpm run typecheck            -> tsc --noEmit, TC=0
pnpm exec eslint <3 archivos> -> ESLint: No issues found
pnpm exec vitest related --run tests/integration/db/descarga-pago-plataforma-sl45.test.ts tests/unit/guards/pago-plataforma-inmutable-sl45.guardia.test.ts
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

**E2E.** Base desechable `sl45_e2e` en `sl45-pg` (`CREATE DATABASE`, `migrate deploy` 244 migraciones, `db:seed`),
`DATABASE_URL` por entorno (el `.env` no se tocó). Un dev server (puerto 3000 libre antes, `rm -rf .next`) con
`AUTH_OTP_DEBUG_LOG=1` y sin `SMTP_*`, PID 28732, parado por PID; 3000 libre, `.next/dev` y el log borrados,
`DROP DATABASE sl45_e2e WITH (FORCE)`.
```
DATABASE_URL=…/sl45_e2e SL40_UI=1 SL45_UI=1 SL17_HUMO_LOG_SERVIDOR=<log> pnpm exec playwright test e2e/cobro-plataforma-sl40.spec.ts e2e/pago-plataforma-sl45.spec.ts --workers=1 --reporter=list
  ok 1 cobro-plataforma-sl40.spec.ts:241:5 › T8: el superadmin fija el global, fija y quita la excepción de A, y ve cada valor sin recargar (R9–R11) (3.4s)
  ok 2 cobro-plataforma-sl40.spec.ts:387:5 › T7: A crea dos órdenes y elimina una; la deuda dice ₡500 y la caja no cambia (R21, R22) (9.2s)
  ok 3 pago-plataforma-sl45.spec.ts:358:5 › 1. A debe ₡1.000, … paga 600 y la región dice ₡400 sin recargar; 500 no pasa (R1, R4, R5, R8, R9) (3.5s)
  ok 4 pago-plataforma-sl45.spec.ts:427:5 › 2. el superadmin ve «Debe ₡400 · Pagado ₡600» en A y «Al día · Pagado ₡0» en B (R28) (552ms)
  ok 5 pago-plataforma-sl45.spec.ts:443:5 › 3. A anula el pago desde el libro y la región vuelve a ₡1.000 sin recargar (R5, R15, R23) (4.3s)
  ok 6 pago-plataforma-sl45.spec.ts:494:5 › 4. A paga los ₡1.000 y queda al día sin botón; … ₡500 a favor (R2, R3) (3.4s)
  ok 7 pago-plataforma-sl45.spec.ts:521:5 › 5. el superadmin ve «A favor ₡500 · Pagado ₡1.000» en A (R28) (607ms)
  ok 8 pago-plataforma-sl45.spec.ts:534:5 › 6. B no ve nada de A: al día, sin pagos en su libro y su caja igual (R20) (977ms)
  8 passed (40.4s)
PW_EXIT=0
```

**Veredicto:** R26 y R17 con test propio que cae con su mutación; los E2E de SL-40 y SL-45 pasan 8/8, 0 skipped. Aviso
para SL-44: `e2e/cobro-plataforma-sl40.spec.ts` cambia en `TEXTO` (+`pistaAlDia`) y en `leerDeuda`.

## Gates del implementer (`TEST_RAPIDO_BASE=origin/dev ./init.sh`, lock tomado)

| Gate | HEAD | Resultado |
|---|---|---|
| 1 (tandas A+B) | `c93ce4d` | `INIT_EXIT=1`: 3 timeouts de 20 s por carga (`cache-tags`, `modulo-puro`, `caja-173-alcance`); en aislado 70/70 en 4 s |
| 2 (tandas A+B, repetido) | `c93ce4d` | 620/620 archivos, 8778 passed / 17 skipped; guardias 302/302; `INIT_EXIT=0` |
| 3 (tanda C + T9) | `6a6dba0` | 624/624, 8883 passed / 17 skipped; guardias 302/302; `INIT_EXIT=0` |
| 4 (cierre) | `0f470aa` | 626/626, 8890 passed / 17 skipped; guardias 303/303; `INIT_EXIT=0` |

Logs: `C:/Users/ArqDev/AppData/Local/Temp/claude/R--job-singularis-projects-servi-logistic/c68afbf4-2e7b-4cf8-895a-a06ecd3a8118/scratchpad/sl45-gate-{1..4}.log`.

Mutación que sobrevive (anotada, fuera del alcance de SL-45): excluir la categoría en
`whereLibroCajaConTerminoSql` no tumba el test de R26, porque ese WHERE solo corre con término, «A quién»
o guía; la descarga sin filtros va por `listar`, que sí está cubierto.

Entorno: base en un contenedor Docker propio `sl45-pg` (:5445), borrado al cerrar junto con sus bases
`sl45_*`. El `.env` local del worktree (no versionado) apunta a esa base; para revisar, recrear el
contenedor y aplicar `prisma migrate deploy` + `db:seed`.
