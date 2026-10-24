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
