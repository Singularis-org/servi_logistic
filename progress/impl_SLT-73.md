# impl SLT-73 — bitácora de implementación

## Tanda 1 — backend_dev: T1, T2 y T3 (2026-10-31)

Commits: `a0a35c13` (T1 + T2) y `1782766a` (T3) sobre `hotfix/SLT-73-dinero-satelite-al-conciliar`.
`prisma generate` corrido a las 16:52:08 (hora local) tras tocar `db/schema.prisma`.

### Archivos

**Creados**
- `db/migrations/20261031140000_slt73_diferencia_satelite_enums/{migration,down}.sql`
- `db/migrations/20261031140100_slt73_ajuste_conciliacion/{migration,down}.sql`
- `lib/repositories/_shared/asientos-cierre-dia.ts` (`asentarCierreDia`, `ASIENTOS_POR_DEFECTO`)
- `tests/integration/db/slt73-conciliacion-bodega-ajuste-rls.int.test.ts`
- `tests/integration/db/_fixtures/slt73-cierre-aprobable.ts`
- `tests/integration/db/slt73-aprobar-satelite-sin-asientos.int.test.ts`
- `tests/integration/db/slt73-aprobar-central-igual.int.test.ts`

**Modificados (código)**
- `db/schema.prisma`: 2 categorías, 1 origen, modelo `ConciliacionBodegaAjuste` y sus relaciones.
- `lib/db/modelos-de-negocio.ts`: la tabla nueva es de negocio (79).
- `lib/types/wallet.ts`: seeds de categoría y origen.
- `lib/utils/caja-tesoreria.ts`: naturaleza `terceros` (design §1.2) y liquidez `efectivo`.
- `lib/constants/wallet-rotulos.ts`, `lib/services/OrigenLegibleService.ts`,
  `lib/repositories/libro-caja-a-quien-sql.ts`, `lib/utils/aporte-por-orden.ts`,
  `lib/analytics/metrics.ts`: mapas totales que el typecheck o las guardias exigían.
- `lib/repositories/CierresAdminRepository.ts`: T2 (bloque movido) y T3 (`if bodega_central`).

**Modificados (tests)** — guardias de conteo y mapas: `aprobacion-escrituras-cubiertas`,
`rls-por-empresa`, `metrics-caja-naturaleza`, `api-key-dependencias-usuario` (fixture),
`wallet-labels`, `wallet-origen-legible`, `caja-tesoreria-migration`. Censo T3: ver abajo.

### Decisiones tomadas en T1

- **No hay CHECK de origen por categoría en `wallet_movimiento`** (solo lo tiene
  `pago_mensajero_movimiento`, SLT-68). El design dice «si existe»: no se crea.
- El `down.sql` de la migración A reutiliza la función dinámica de SLT-68 con un paso más (2b):
  guarda y recrea los triggers que dependen de la columna. Sin él, el rollback fallaba por
  `wallet_movimiento_tope_pago_plataforma` (SL-45). Medido con `db:rollback`.
- `id`/`created_at` siguen la convención del repo (`TEXT` y `TIMESTAMP(3)`), no `uuid`/`timestamptz`
  como dice la tabla del design: así no hay drift con `String @id` / `DateTime` de Prisma.
- Rótulos neutros, sin país ni moneda: «Diferencia de la satélite (entregó menos/más)» y el origen
  «Diferencia de la satélite». Son provisionales para el frontend.

### BLOQUEO DE DINERO (para el leader / humano)

`NATURALEZA_POR_CATEGORIA` = `terceros` (lo que pide design §1.2) **rompe la invariante R8 de la
459**: «De las tiendas» de la caja = Σ saldos de las tiendas. La guardia
`tests/unit/guards/caja-clasificacion-459.guardia.test.ts` queda ROJA:
`egreso_diferencia_satelite mueve «De las tiendas» y es pareja de 0 conceptos` (y la de ingreso).
Con Q1-A la tienda conserva su crédito completo, así que una diferencia `terceros` deja la caja con
«De las tiendas» por debajo de lo que se les debe; como `propio` bajaría la ganancia; no hay una
naturaleza «por cobrar a la satélite». El spec no resuelve esto: queda `terceros` y la guardia roja
hasta que se decida.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R1 | `slt73-aprobar-satelite-sin-asientos.int.test.ts` › «R1: tras aprobar, ninguno de los tres libros…» |
| R2 | mismo archivo › «R2: lo que no es dinero ocurre igual que en la central…»; contraparte central en `slt73-aprobar-central-igual` › «R3 (contra R2)» |
| R3 | `slt73-aprobar-central-igual.int.test.ts` › «R3: … exactamente las filas de siempre (literal)» |
| R21 (tabla nueva) | `slt73-conciliacion-bodega-ajuste-rls.int.test.ts` + guardias `rls-por-empresa`, `fk-misma-empresa`, `organizacion-en-modelos` |

### Mutaciones (design §6), harness con autocomprobación y reversión por `git checkout`

| Mutación | Archivo | Rojo |
|---|---|---|
| M1 quitar el `if destinoTipo` | CierresAdminRepository.ts | 1 (R1) |
| M2 invertirlo (`!==`) | CierresAdminRepository.ts | 2 (R1, R3) |
| M3 `bodega_satelite` en vez de `bodega_central` | CierresAdminRepository.ts | 2 (R1, R3) |
| M4 leer el destino con `this.prisma` (fuera de la tx) | CierresAdminRepository.ts | 0 — superviviente EQUIVALENTE |
| M5 persistencia de la indemnización dentro del `if` | CierresAdminRepository.ts | 1 (R2) |
| M6 saltarse el libro del mensajero | asientos-cierre-dia.ts | 1 (R3) |
| RLS desactivada en la tabla nueva | base local | 2 (RLS y WITH CHECK) |

M4 no se puede matar con un test determinista: `destino_tipo` solo se escribe al crear el cierre
(`CierreDiaRepository.crearCierre`) y el `updateMany` de la aprobación ya filtra por el destino del
alcance, así que dentro o fuera de la tx el valor es el mismo.

### Censo T3: tests que aprobaban un satélite y esperaban filas en los libros

- `tests/integration/db/nucleo-sin-modulos.test.ts` (afirma ahora 0 filas).
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts` y
  `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts` (0 al aprobar; luego
  `asentarCierreDia` y el literal de siempre).
- `tests/integration/db/cierre-rechazo-tienda-aprobacion.test.ts` (escenario 2, mismo arreglo).
- `tests/integration/db/_fixtures/caja-459.ts` (35 suites lo usan: asienta tras aprobar).
- `scripts/demo-qa/receta.ts` vía `tests/integration/db/demo-qa.test.ts`: NO se toca; la demo ya marca
  recibida la consolidación satélite antes del paso de dinero, así que vuelve a verde con T4.
- Dobles de las suites de aprobación de la CENTRAL (devuelven `destinoTipo: bodega_central`):
  9 archivos unit + `wallet-idempotencia` y `cierre-detail-congelado`.
- E2E: ninguno afirma dinero de un cierre satélite (el escenario de caja es central).

Los de `caja-459`, 454/455 y `cierre-rechazo-tienda-aprobacion` necesitan una base con órdenes y zona
central: aquí (y en CI) caen por entorno y están en `tests/baseline-rojos.json`. Compilan (typecheck).

Ajustes de conteo y listas (3.er commit): `scripts/verificar-rls-despliegue.ts` (contrato de despliegue:
153 triggers `sme_*`, medido en la base local), su test, `caja-459-migration`, `orden-incidente-migration`,
`mi-wallet-labels`, `caja-derivacion-457` (pool con las dos categorías), `caja-tesoreria` y
`caja-tesoreria-idempotencia` (el chequeo estructural mira ahora `asentarCierreDia`).

### Verificación (salida real)

- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin eso el proceso muere por memoria): exit 0.
- `pnpm run lint`: 0 errores, 232 avisos, ninguno en archivos de esta tanda.
- Migraciones: deploy → `db:rollback` ×2 (enums 0, tabla 0, trigger de SL-45 restaurado) → deploy;
  `prisma migrate diff` base↔schema: «This is an empty migration».
- Tests de la tanda: los 3 `slt73-*` 12/12; las 9 suites de aprobación con dobles 246/246.
- `pnpm run test:guardias`: 316/318 archivos verdes. Rojos: `caja-clasificacion-459` (el BLOQUEO de
  arriba) y `dependencias-declaradas-presentes` (ya estaba, en el baseline).
- `pnpm exec vitest related --run <lib cambiados>`: 253 archivos rojos; 242 están en el baseline (base
  sin órdenes/zona central). De los 11 de fuera: 8 eran listas/conteos (arreglados arriba), más
  `caja-clasificacion-459` (bloqueo), `demo-qa` (vuelve con T4) y `geografia-por-pais` /
  `indices-rutas-calientes` (datos de geografía y plan de consulta de la base local; no tocan nada de esta ficha).

**Veredicto:** T1–T3 hechos y probados contra Postgres; queda abierto un bloqueo de dinero en la
naturaleza de la diferencia (guardia 459 en rojo) que tiene que decidir el humano.

## Tanda 2 — backend_dev: T4 y T5 (2026-10-31)

Commits: `af05a58b` (feat T4+T5), `eb154edc` (tests y censo) y el de esta bitácora. Sin `prisma generate`
(no se tocó `db/schema.prisma`).

### Archivos

**Código**
- `lib/repositories/CierresBodegaAdminRepository.ts`: constructor `(prisma, asientos = ASIENTOS_POR_DEFECTO)`;
  `marcarConciliado` asienta cada cierre (`cierreBodegaId`, `aprobado`, `bodega_satelite`, `solicitadoAt asc`)
  y llama a `asentarDiferenciaSatelite` (evento `marca`); `corregirConciliacion` solo la diferencia (evento
  `correccion`); `revertirConciliacion` cuenta caja `cierre_dia` de sus cierres antes de escribir → `con_asientos`.
- `lib/repositories/_shared/asientos-cierre-dia.ts`: 4.º parámetro opcional `fechaMovimiento` (R22).
- `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`: `RevertirConciliacionResult`.
- `lib/interfaces/services/IConciliacionSatelitesService.ts`: `RevertirConciliacionServiceResult`.
- `lib/services/ConciliacionSatelitesService.ts`: `con_asientos` → `{ status: "con_asientos" }` (guard primero, sin cambio).
- `lib/types/conciliacion-satelites.ts`: `MENSAJE_REVERTIR_CON_ASIENTOS`.
- `lib/actions/conciliacion-satelites.ts`: `RevertirConciliacionActionResult`; `con_asientos` sale con `mensaje`.
- `components/shared/conciliacion/ConciliacionAcciones.tsx`: **solo la anotación de tipo** de `resultado` (ver Desviaciones).

**Tests**
- Nuevos: `tests/integration/db/slt73-marcar-asienta.int.test.ts` (9), `tests/integration/db/slt73-corregir-diferencia.int.test.ts` (4).
- Fixture `_fixtures/slt73-cierre-aprobable.ts`: `maestroId`, `adminSatelite`, `zonaId`, `consolidar` (servicio real
  `solicitarCierreBodega`) y `marcarRecibido` (repo real, default del constructor si no se inyecta).
- Ajustados: `marca-conciliacion.int.test.ts` (el R14 de la 431 → «revertir con asientos → con_asientos, nada cambia»),
  `corregir-conciliacion.int.test.ts` (el R12 de la 473 → «una diferencia por la variación, la de la marca intacta»),
  `tests/unit/repositories/cierres-bodega-admin-marca.test.ts`, `tests/unit/services/conciliacion-satelites-service.test.ts`,
  `tests/unit/actions/conciliacion-satelites-actions.test.ts`.
- Censo: comentarios en 454/455 `dinero-aprobacion`, `cierre-rechazo-tienda-aprobacion` y `_fixtures/caja-459.ts`.

### Decisiones

- **R22.** Hoy `asentarCierreDia` no fija fecha: los libros caen en `DEFAULT CURRENT_TIMESTAMP` (inicio de la tx que
  escribe). Para la marca se pasa `ahora` (el mismo instante que `conciliado_at`) a las filas de los tres libros y a la
  diferencia; la aprobación de la central no lo pasa, así que sus filas no cambian (R3). La fila de ajuste lleva
  `created_at = ahora` (R15, «cuándo»).
- **Diferencia.** `esperado = paraLaCentral(total_general, total_pago_mensajero, total_ingreso_bodega_rechazos)` del
  snapshot de la consolidación; `delta = (esperado − recibido) − Σ diferencia previas`. `delta > 0` → egreso, `< 0` →
  ingreso, por `|delta|`; `registrado_por` = quien marca/corrige. Se escribe con `asientos.walletMovimientoRepo`
  (skipDuplicates). La naturaleza de caja no se lee aquí (sigue pendiente, guardia 459 roja, sin tocar).
- **Tipos aparte para revertir** (`RevertirConciliacion*Result`) en vez de añadir `con_asientos` a
  `MarcaConciliacion*Result`: `MarcarRecibidoDialog.avisoDe` hace un `switch` exhaustivo sobre el de marcar/corregir y
  dejaría de compilar con un estado que esos caminos nunca devuelven.
- **Revertir sin asientos de cierre pero con ajustes** (consolidación sin cierres, o con cierres que no asientan nada): se
  deja revertir como dice el design §2.5 (cuenta solo `cierre_dia`). Los ajustes no se borran; una marca posterior
  descuenta lo ya asentado por `yaAsentado`, así que la caja sigue cuadrando. En la práctica toda consolidación real tiene
  cierres con asientos.
- **Censo.** De las cinco llamadas directas de T3: `nucleo-sin-modulos` no tenía (afirma 0 filas al aprobar). Las de
  454/455 `dinero-aprobacion`, `cierre-rechazo-tienda-aprobacion` y `caja-459` **se quedan**: ninguna de esas suites corre
  en la base local (faltan `orden` sembradas / zona central; están en el baseline), así que pasarlas a consolidar + marcar
  no se podría verificar, y la marca cambia la fecha de los asientos y añade una diferencia si lo recibido no cuadra (en
  `caja-459`, ~35 suites). Anotado en cada archivo. `demo-qa` vuelve a verde con T4 (medido).

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R10 | `slt73-marcar-asienta` › «R10: tras marcar, los tres libros… (literal), y el cierre NO incluido sigue sin ninguna» y «R10: un cierre de la CENTRAL enlazado… (centinela)»; unit `cierres-bodega-admin-marca` › «R10: busca los cierres…», «R10: asienta cada cierre…» |
| R11 | `slt73-marcar-asienta` › «R11/R15: recibido MENOS… 200,00», «R11: recibido MAS… 300,00», y el de R10 (igual → ninguna); unit › «R11/R22: recibido 485…», «R11: recibido igual…» |
| R12 | `slt73-marcar-asienta` › «R12: si un feed falla, la marca entera revierte…», «R12: un asiento YA escrito no se duplica…»; unit › «R12: … con el `tx` de la marca» |
| R13 | `slt73-corregir-diferencia` › «R13: 485 -> 500 -> 490…», «R13: … mismo monto NO escribe…», «R13: corregir NO vuelve a asentar…»; `corregir-conciliacion` › «SLT-73 R13…»; unit › «SLT-73 R13: corregir NO vuelve a asentar…» |
| R14 | `marca-conciliacion` › «SLT-73 R14: revertir una marca que YA asento…»; unit repo › «SLT-73 R14: con asientos… `con_asientos`» y «… SIN asientos, revierte»; servicio › «SLT-73 R14…»; acción › «SLT-73 R14: … mensaje» |
| R15 | `slt73-corregir-diferencia` › «R15/R22: cada ajuste lleva evento, quien, el esperado, el recibido y el instante…»; `slt73-marcar-asienta` › «R11/R15…» |
| R20 | `slt73-marcar-asienta` › «R20: un cierre cuyos asientos se retiraron (migracion C) los vuelve a recibir» |
| R22 | `slt73-marcar-asienta` › «R22: todas las filas de la marca van fechadas en el instante de la conciliacion»; `slt73-corregir-diferencia` › «R15/R22…» |
| R23 | servicio › «SLT-73 R23: sin acceso total, `forbidden` ANTES de mirar si hay asientos» + los R27 existentes |
| default del constructor | `slt73-marcar-asienta` › R10 (marca sin inyectar `asientos` → filas reales) |

### Mutaciones (harness con autocomprobación)

Harness en el scratchpad (`t73b/mut.py`): aplica, relee el archivo y exige el texto mutado, corre unit marca +
`slt73-marcar-asienta` + `slt73-corregir-diferencia` (A) y `marca-conciliacion -t "SLT-73 R14"` (B), revierte con
`git checkout --` y comprueba `git diff --quiet`. CONTROL antes de mutar: A 38/38, B 1 passed | 8 skipped; el harness
aborta si el control no sale verde o un run no tiene resumen. (Una primera pasada **mintió**: el `bash` que veía Python
era el de WSL y todo salía «SIN RESUMEN» con 0 rojos; se descartó y se arregló con la ruta de Git bash y esas
aserciones.)

| Mutación | Archivo | Rojos |
|---|---|---|
| M1 quitar `cierreBodegaId: id` | CierresBodegaAdminRepository | 2 (int R10 cierre no incluido; unit WHERE) |
| M2 quitar `destinoTipo` | idem | 2 (int centinela central; unit WHERE) |
| M3 omitir el feed de indemnización | asientos-cierre-dia | 8 |
| M4 invertir el signo de la diferencia | CierresBodegaAdminRepository | 7 |
| M5 esperado con `totalEfectivo` | idem | 15 (int: `slt73-corregir-diferencia`, que tiene SINPE) |
| M6 omitir `ingresoBodegaRechazos` | idem | 8 |
| M7 quitar `skipDuplicates` (caja) | WalletMovimientoRepository | 1 (int «asiento YA escrito no se duplica») |
| M8 asientos con `this.prisma` (fuera de la tx) | CierresBodegaAdminRepository | 1 (unit, identidad del `tx`) |
| M9 recalcular sin `yaAsentado` | idem | 4 |
| M10 quitar el conteo previo de revertir | idem | 2 (unit + int R14) |
| M11 sin el instante de la marca (fecha por defecto) | idem | 1 (int R22) |
| M12 corregir vuelve a asentar | idem | 2 |

Supervivientes: **0**. M8 solo lo caza el unit: en integración `this.prisma` y `tx` son la misma conexión (savepoint).

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: 0 errores, 239 avisos; en los archivos de esta tanda solo quedan 2 avisos que ya existían
  (`_args` del doble anterior en `cierres-bodega-admin-marca.test.ts`).
- Tests de la tanda (base `servi_slt73`): 9 archivos, **116/116** — los 3 unit tocados, `slt73-marcar-asienta`,
  `slt73-corregir-diferencia`, `slt73-aprobar-central-igual`, `slt73-aprobar-satelite-sin-asientos`, `demo-qa` y
  `nucleo-sin-modulos`.
- `marca-conciliacion` y `corregir-conciliacion` (baseline: base sin usuarios): en la base local solo pasa el caso nuevo de
  R14; con un parche TEMPORAL que siembra los usuarios con `crearUsuarioDePrueba` (revertido, no commiteado): 3 archivos,
  23/23 verdes (incluido `slt73-corregir-diferencia`).
- Relacionados + todas las guardias: 256 archivos, 247 verdes. Los 9 rojos: baseline por base vacía (454/455
  `dinero-aprobacion`, `454/cierre-bodega-sf001`, `486-evidencias`, `cierre-bodega-conciliacion`,
  `cierre-bodega-desglose-por-tienda`, `cierre-rechazo-tienda-aprobacion`), `dependencias-declaradas-presentes` (baseline)
  y `caja-clasificacion-459` (BLOQUEO de la tanda 1, sin tocar).

### Desviaciones

- `components/shared/conciliacion/ConciliacionAcciones.tsx`: se cambió **solo** la anotación `let resultado:` a
  `RevertirConciliacionActionResult` (y su import). Sin eso el typecheck queda rojo (TS2322): el resultado de revertir
  tiene un desenlace más. Hoy `con_asientos` cae en el `else` existente (aviso de fallo genérico); pintar
  `resultado.mensaje` es de T7 (frontend).

**Veredicto:** T4 y T5 hechos y probados contra Postgres, 12/12 mutaciones muertas; sigue abierto el bloqueo de la
naturaleza de caja de la diferencia (guardia 459) y T7 tiene que pintar `con_asientos`.

## Tanda 3 — backend_dev: T6 (R4-R8) (2026-10-31)

Commit de código y tests: `efe25822`. Base local `servi_slt73` por `conbase73.sh`. MCP no usado (worktree sin indexar);
Grep/Read.

### Archivos

- `lib/utils/conciliacion-satelite.ts`: `saldoDe(esperado, recibido)` (parámetro renombrado; el docstring dice que D3
  reabrió la Q2 de la 431) y nuevo `esperadoDe(snapshot)` = `paraLaCentral(general, pago, ganancia)` como `Decimal`.
  No reescribe la fórmula: llama a `lib/utils/ingreso-empresa.ts > paraLaCentral`.
- `lib/repositories/SaldosSatelitesRepository.ts`: el cliente gana `cierreDia`; `APORTE_WHERE` = `{ estado: "aprobado",
  destinoTipo: "bodega_satelite" }`; agregaciones (d) aportes y (e) sin consolidar (`cierreBodegaId: null`, `_count`)
  por `destinoZonaId in zonaIds`; `saldoSinConciliar = saldoDe(aporteDe(Σd), Σ recibido de (a))`;
  `findResumen` con la misma resta por zona (`pendienteTotal` = Σ deudas, `bodegasConPendiente` = deudas ≠ 0);
  `toConsolidacionDTO`, la última recibida y la «diferencia» de la cabecera con `esperadoDe`.
- `lib/repositories/CierreBodegaRepository.ts > toBodegaResumenRow`: `faltaPorRecibir = saldoDe(paraLaCentral, recibido)`.
- `lib/types/conciliacion-satelites.ts`, `lib/interfaces/repositories/ISaldosSatelitesRepository.ts`,
  `ICierreBodegaRepository.ts`: DTO y docstrings.
- Tests: nuevo `tests/integration/db/slt73-deuda-satelite.int.test.ts`; actualizados `saldo-satelites.int.test.ts`,
  `tests/unit/repositories/cierre-bodega-repository.test.ts`, `cierres-bodega-admin-repository.test.ts`,
  `tests/unit/utils/cascadas-cierre-bodega.test.ts`; fixtures de DTO con los campos nuevos (solo tipo) en
  `WalletListados464`, `wallet-satelites`, `saldos-satelites-descarga-columnas`, `wallet-sin-uuid.guardia`,
  `conciliacion-satelites-service`.

### Cambios de DTO (para frontend_dev, T7)

- `SaldoSateliteDTO`: **`aporteSinConsolidar: string`** y **`cierresSinConsolidar: number`** (nuevos);
  `saldoSinConciliar` pasa a ser la deuda (R5). `totalEfectivo` sigue, como contexto.
- `ConsolidacionSateliteDTO`: **`pagoMensajero`**, **`gananciaSatelite`**, **`paraLaCentral`** (string, nivel
  superior); `faltaPorRecibir` = `paraLaCentral − recibido`.
- `UltimaRecibidaDTO.declarado` ahora es lo esperado (`paraLaCentral`), no el efectivo; mismo nombre de campo.
- `CierreBodegaResumenRow.faltaPorRecibir` (`/cierres-admin`) = `paraLaCentral − recibido`.
- Ningún componente rompió el typecheck: no se tocó UI.

### Decisiones

- `esperadoDe` en `conciliacion-satelite.ts` para que los dos lectores (R8) y la cabecera usen la misma función.
- Sumar los snapshots y aplicar `paraLaCentral` una vez = sumar los aportes uno a uno (la cascada es lineal); así (d)
  y (e) son `groupBy` sin SQL a mano.
- La última recibida también pasa a `paraLaCentral` (R8: es el «falta por recibir» de una consolidación).
- `saldo-satelites.int.test.ts`: cada consolidación sembrada lleva un `cierre_dia` aprobado con su mismo snapshot
  (sin él la deuda no tiene minuendo); las rechazadas no (su recibido es siempre nulo por el CHECK). `algunUsuarioId`
  crea su usuario con `crearUsuarioDePrueba` (la base local no tiene usuarios). Esperados reescritos a mano: el SINPE
  ahora cuenta (D3).
- R7 «otra empresa»: el test baja a `servi_app` con `comoApp` (RLS, como la extensión en prod); la empresa A nace vacía
  en la transacción, así que la cabecera se compara contra un literal (`69274.70`, 6 bodegas con pendiente).

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R4 | `cascadas-cierre-bodega` › «SLT-73 R4 …» (3 casos: fórmula, signo negativo, `saldoDe`); `slt73-deuda-satelite` › zona NEG (−3400.15) |
| R5 | `slt73-deuda-satelite` › «R5/R6: la deuda por zona…» (sin consolidar, consolidado sin conciliar, parcial, rechazada, SINPE, negativo, cero, solicitado/rechazado/destino central excluidos); `saldo-satelites` › «R17/R18: las CUATRO…» y «SLT-73 D3/R5: el SINPE SI cuenta» |
| R6 | `slt73-deuda-satelite` › «R5/R6…» (`aporteSinConsolidar`, `cierresSinConsolidar`; SINPE prod-like = 70890.00, no al día) |
| R7 | `slt73-deuda-satelite` › «R7: Σ filas = cabecera, `bodegasConPendiente` y otra empresa…»; `saldo-satelites` › «R20/R23 — las TRES cifras…» |
| R8 | `slt73-deuda-satelite` › «R8/R9: el desglose…»; `saldo-satelites` › «R22/R24: el desglose…» y «la ULTIMA recibida…»; `cierre-bodega-repository` › «SLT-73 R8: las OCHO lecturas…»; `cierres-bodega-admin-repository` › «R15: todos…» |
| R9 (servidor) | `slt73-deuda-satelite` › «R8/R9…» (`pagoMensajero`, `gananciaSatelite`, `paraLaCentral`); la pantalla es T7 |

### Mutaciones (harness con autocomprobación)

Harness `scratchpad/t6/mut.py` (adaptado del de la tanda 2): CONTROL previo verde obligatorio (44/44, 0 skipped),
aplica la mutación, relee el archivo y exige el texto mutado, corre `slt73-deuda-satelite` + `saldo-satelites` +
`cierre-bodega-repository` + `cascadas-cierre-bodega`, aborta si un run no trae resumen, revierte con
`git checkout --` y comprueba `git diff --quiet`. 19/19 aplicadas y revertidas.

| Mutación | Archivo | Rojos |
|---|---|---|
| M1 quitar `estado: aprobado` | SaldosSatelitesRepository | 2 |
| M2 quitar `destinoTipo` | idem | 2 |
| M3a quitar `destinoZonaId in zonaIds` de (d) y (e) | idem | **0 — equivalente** |
| M3b quitar `destinoZona` satélite del resumen | idem | 1 (zona central con 777.00) |
| M4a fila con `totalEfectivo` (fórmula 431) | idem | 5 |
| M4b aporte sin restar el pago al mensajero | idem | 2 |
| M5 omitir el recibido en la fila | idem | 5 |
| M6 incluir rechazadas en (a) | idem | 1 |
| M7 quitar `cierreBodegaId: null` de (e) | idem | 2 |
| M8a cabecera suma \|deuda\| | idem | 1 |
| M8b cabecera solo con consolidados | idem | 1 |
| M8c `bodegasConPendiente` solo positivas | idem | 1 |
| M8d cabecera sin restar el recibido | idem | 3 |
| M9 `toConsolidacionDTO` con `totalEfectivo` | idem | 2 |
| M10 `toBodegaResumenRow` con `totalEfectivo` | CierreBodegaRepository | 2 |
| M11 última recibida con el general | SaldosSatelitesRepository | 1 |
| M12 «diferencia» de la cabecera con el general | idem | 1 |
| M13 `esperadoDe` sin la ganancia de la satélite | conciliacion-satelite | 5 |
| MT (control del test) sin `comoApp`: otra empresa se mezcla | slt73-deuda-satelite | 1 |

Supervivientes: **1, equivalente (M3a)**. Los dos `groupBy` agrupan por `destinoZonaId` y la fila busca su zona en
el `Map`; sin el `in`, los grupos de otras zonas se leen y se descartan. El filtro acota la consulta, no el resultado.
«Incluir rechazadas en el recibido» es equivalente para la deuda: el CHECK `cierre_bodega_conciliacion_coherente`
obliga a que una rechazada tenga `monto_recibido` nulo. M6 muere por el contexto (`totalEfectivo`), no por la deuda.

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, 0 errores, 232 avisos; ninguno en los archivos de esta tanda.
- Tests de la tanda (base `servi_slt73`): `slt73-deuda-satelite` 3/3, `saldo-satelites` 17/17, `cierre-bodega-repository`
  + `cascadas` 24/24, y `cierres-bodega-admin-repository`, `conciliacion-satelites-service`, `wallet-satelites`,
  `saldos-satelites-descarga-columnas`, `WalletListados464`, `wallet-sin-uuid.guardia` 108/108. Total 10 archivos,
  **152/152**.
- `vitest related --run` de los 6 archivos de `lib/`: 228 archivos, 208 verdes, 42 tests rojos en 20 archivos. 18
  archivos son baseline de base vacía («usuario esta vacia», «faltan la zona central, cedula u orden», «orden vacia»,
  «referencia a otra empresa» del fixture 172r52). `cierres-bodega-admin-repository` era mío y está arreglado.
  **`wallet-caracterizacion-458` (R84 y TB.6) es rojo real y queda abierto: ver BLOQUEO.**

### BLOQUEO DE DINERO (para el leader / humano): el estado de cuenta de la bodega

`EstadoCuentaRepository.paginaDeBodega` / `totalesDeBodega` (ficha 458, `/wallet/satelites/[zonaId]`) arma el libro de la
bodega con `cierre_bodega.total_efectivo` como «declarado», y su «Pendiente de llegar» se pinta en la misma página que la
conciliación (`ConciliacionSatelite.tsx`). `wallet-caracterizacion-458` › «TB.6 R20–R22» exige que ese pendiente sea igual
a `saldoSinConciliar`. Con SLT-73 ya no lo es: en su fixture la consolidación `b2` tiene SINPE 1500, así que la deuda da
7000.00 y el estado de cuenta 5500.00 (y sin `cierre_dia` sembrados, la fila da −4000.00). El spec (R5-R8, design §2.7)
no dice qué hace el estado de cuenta: si el libro de la bodega pasa a `paraLaCentral` por consolidación, sigue sin ver
los cierres sin consolidar; si pasa a filas por `cierre_dia` aprobado, es un rediseño del libro (fechas, orígenes,
descarga). No lo toqué, ni el fixture `wallet-458`: arreglar el fixture taparía la divergencia. Decide el humano.

### Desviaciones

- Ninguna en UI. El árbol tenía cambios de otra sesión en `specs/` (commiteados por ella en `c5f77de6`); no los toqué.

**Veredicto:** T6 hecho y probado contra Postgres; de 19 mutaciones sobrevive 1, equivalente (M3a). Queda abierto el
bloqueo del estado de cuenta de la bodega (458), con `wallet-caracterizacion-458` en rojo, y la UI (T7).

## Tanda 4 — backend_dev: T8 (R16-R20) (2026-10-31)

### Archivos
- `db/migrations/20261031140200_slt73_retirar_asientos_satelite/migration.sql` (nuevo). Timestamp mayor que la última
  de la rama (`20261031140100_slt73_ajuste_conciliacion`); no hay ninguna posterior.
- `db/migrations/20261031140200_slt73_retirar_asientos_satelite/down.sql` (nuevo).
- `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts` (nuevo, 5 tests).

### Decisiones
- **Un solo bloque `DO` en cada archivo.** Todo o nada sin depender de cómo envuelva Prisma el script, y el test puede
  ejecutar el SQL real del archivo con `$executeRawUnsafe` (una sentencia) dentro de su tx revertida.
- **PK del respaldo:** Postgres no admite expresiones en `PRIMARY KEY`. Va una columna generada
  `id text GENERATED ALWAYS AS (fila->>'id') STORED` y `PRIMARY KEY (tabla, id)`.
- **Esquema `respaldo`:** `REVOKE ALL ... FROM PUBLIC` en esquema y tabla; `servi_app` sin `USAGE` (lo comprueba el
  test con `has_schema_privilege`). El `ALTER DEFAULT PRIVILEGES` de 20261022130000 es solo `IN SCHEMA public`.
- **Sin triggers que desactivar.** Los libros no tienen trigger de `DELETE` (solo `sme_*` en INSERT/UPDATE,
  `*_sin_cambio_de_empresa` en UPDATE y el tope de pago a plataforma en INSERT de `egreso_pago_plataforma`). El
  append-only se aplica con `REVOKE UPDATE, DELETE ... FROM servi_app`, y la migración corre como propietario. RLS es
  `ENABLE` sin `FORCE`, así que el propietario ve todas las filas. Mismo mecanismo que la 461: `DELETE` directo.
- **Columnas de origen:** las tres tablas usan `origen_tipo` / `origen_id` (leído en `db/schema.prisma`).
- **`IF NOT EXISTS` + `ON CONFLICT DO NOTHING` en el respaldo**, para que up → down → up funcione y el test corra
  sobre una base que ya tiene la migración aplicada.
- **Down:** `jsonb_populate_record(NULL::<tabla>, fila)` por tabla, `ON CONFLICT DO NOTHING` (sin target: lo
  recogen `wallet_movimiento_origen_categoria_uq`, `wallet_tienda_movimiento_origen_uq` y
  `pago_mensajero_movimiento_origen_uq`). Después `DROP SCHEMA IF EXISTS respaldo CASCADE`. Si la tabla del respaldo
  no existe, solo se quita el esquema.

### DESVIACIÓN DEL SPEC (para que el leader la confirme): los devengos posteriores del mensajero se quedan
R16 dice «las filas con origen `cierre_dia`». En `pago_mensajero_movimiento` también cuelgan de `cierre_dia` filas
que **no** escribe la aprobación y que la conciliación **no** vuelve a escribir: el premio del ranking
(`PremioRankingDevengoService`: `premio_ranking` y su reverso `ajuste_pago` con `premio_dia`) y el `incentivo`
(`IncentivoMensajeroService`). Si se retiraran, desaparecerían del libro del mensajero y R20 no las devolvería. La
migración no retira esas filas: `categoria NOT IN ('premio_ranking','incentivo') AND premio_dia IS NULL`. Es el mismo
criterio que ya usa `PagoMensajeroMovimientoRepository.sumarPremiosVivosPorCierre`. En caja y tienda no hay otro
escritor con origen `cierre_dia` que no sean los feeds de la aprobación (grep en `lib/`). Si el humano quiere la
lectura literal, el cambio es borrar dos líneas del primer `INSERT` del mensajero y la mutación M7.

### Mapa R → test (`slt73-migracion-retira-asientos.int.test.ts`)
| R | Test |
|---|---|
| (control) | «CONTROL: antes del up, cada cierre del escenario tiene sus asientos» |
| R16 | «R16/R17: el up retira y respalda integras…»: el satélite sin consolidar y el consolidado sin conciliar quedan sin filas (salvo los posteriores) y el respaldo es igual, columna a columna, al `to_jsonb` de antes |
| R17 | mismo test: central, satélite conciliado y satélite `solicitado` (centinela de estado) con el blob intacto y sin respaldo |
| R18 | «R18: con un pago al mensajero contra un cierre de S, el up aborta con el conteo y nada cambia» |
| R19 | «R19: el down devuelve exactamente las filas retiradas y quita el respaldo; up → down → up deja el mismo blob» |
| R20 | «R20: tras el up, conciliar la consolidacion re-escribe…; el down no los duplica» (`CierresBodegaAdminRepository.marcarConciliado` real) |

Siembra por el camino real: `aprobar` (central), `aprobar` + `asentarCierreDia` (satélite de antes del hotfix),
`consolidar`, `marcarRecibido`. Todo en `enTransaccionRevertida`.

### Mutaciones (harness autocomprobado `scratchpad/t8/mut.py`: control verde, la mutación se relee y git la ve, aborta sin resumen, revierte con `git checkout --` y `git diff --quiet`)
| Mutación | Rojos |
|---|---|
| M1 quitar `conciliado_at IS NULL` | 3 (R16/R17, R18, R20) |
| M2 quitar `destino_tipo` | 1 (R16/R17) |
| M3 `DELETE` por `origen_id` en los tres libros | 3 (R16/R17, R19, R20) |
| M3m ídem solo en el mensajero | 3 |
| M3w ídem solo en la caja | **0, equivalente**: en caja el conjunto por origen y el respaldado son el mismo (no hay escritor con origen `cierre_dia` fuera de la aprobación); lo mismo en tienda |
| M4 quitar el `RAISE` | 1 (R18) |
| M5 quitar `estado = 'aprobado'` | 1 (R16/R17, centinela `solicitado`) |
| M6 down sin `ON CONFLICT DO NOTHING` | 1 (R20) |
| M7 retirar también los devengos posteriores | 1 (R16/R17) |
| M8 down sin `DROP SCHEMA` | 1 (R19) |
| M9 down no restaura la tienda | 2 (R19, R20) |
| M10 respaldo de caja sin `monto` | 3 (R16/R17, R19, R20) |

12 mutaciones, 1 superviviente equivalente (M3w).

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0, 0 `error TS`.
- `pnpm exec eslint tests/integration/db/slt73-migracion-retira-asientos.int.test.ts`: exit 0.
- `vitest run tests/integration/db/slt73-migracion-retira-asientos.int.test.ts` (base `servi_slt73`): **5 passed (5)**,
  antes y después del deploy de la migración.
- `pnpm run test:guardias`: 316/318 archivos, 4436 passed / 5 failed. Los mismos rojos de antes:
  `caja-clasificacion-459` (T11) y `dependencias-declaradas-presentes` (baseline).
- Base local: `prisma migrate deploy` → aplica `20261031140200_slt73_retirar_asientos_satelite` (272 migraciones);
  `pnpm run db:rollback` → «Rollback completado», `respaldo` ya no existe, 271; `prisma migrate deploy` → la aplica
  otra vez, 272, `respaldo` existe y `has_schema_privilege('servi_app','respaldo','USAGE') = false`.
  `prisma migrate status`: «Database schema is up to date!».
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an empty migration.`
  (sin drift por `respaldo`).
- La base local está vacía (0 `cierre_dia`): el deploy no ejercita datos; eso lo cubre el test con el SQL real.

**Veredicto:** T8 hecho y probado contra Postgres (5/5, 12 mutaciones con 1 superviviente equivalente). Queda para
confirmar la desviación de los devengos posteriores del mensajero.

## Tanda 5 — backend_dev: T11 (R24–R27, R30), enmienda D12–D14 (2026-10-31)

Commit de código y tests: `db271ed7` sobre `hotfix/SLT-73-dinero-satelite-al-conciliar`. Sin migración ni
`db/schema.prisma` (la naturaleza es solo de TypeScript, design §2.9). Sin `prisma generate`.

### Archivos

**Código (lib)**
- `lib/types/wallet.ts`: `NaturalezaMovimiento` + `"por_cobrar_satelite"`; `MODO_COMPOSICION_CAJA_SEED` +
  `"tres_tramos"`; `CajaResumenDTO` + `porCobrarSatelites`, `signoPorCobrarSatelites`,
  `porcentajePorCobrarSatelites`, `deEmpresaEnCaja` (todo STRING salvo el signo).
- `lib/utils/caja-tesoreria.ts`: las dos diferencias → `por_cobrar_satelite` (liquidez sigue `efectivo`);
  `acumular` con dos cubetas nuevas, las cuatro ramas por dueño explícitas y `naturalezaNoContemplada(never)`;
  `derivarCaja` con la sexta `derivarBalance(acc.egresosPorCobrarSatelite, acc.ingresosPorCobrarSatelite)` y la
  identidad R27 en el comentario; `derivarReparto` de tres tramos (la lógica de antes renombrada a
  `derivarRepartoDosBolsillos`, intacta).

**Stubs `// T12` (UI, solo para que compile; los cierra frontend_dev en T12)**
- `app/(app)/wallet/_components/BarraComposicionCaja.tsx`: `SEGMENTOS_POR_MODO.tres_tramos` = los dos segmentos
  de `dos_bolsillos` (tiendas con `porcentajeTiendas` + empresa resto). Falta el tramo `por_cobrar`.
- `app/(app)/wallet/_components/CajaResumenCard.tsx`: `BOLSILLO_EMPRESA.tres_tramos = EMPRESA_NEUTRO` (es el
  valor del design; queda marcado para que T12 lo confirme). Falta el bloque `data-bolsillo="satelites"`.
- `app/(app)/wallet/_components/wallet-labels.ts`: `CAJA_COMPOSICION_MENSAJE.tres_tramos = null`;
  `DUENO_LABEL.por_cobrar_satelite = "Satélite"` (el provisional del design). Faltan rótulo y pistas del bloque y
  `composicionCajaNombreAccesible` con tres tramos.
- `app/(app)/wallet/_components/WalletLedger.tsx`: `DUENO_PUNTO.por_cobrar_satelite = "bg-muted-foreground"`.
- `tests/components/CajaComposicionBarra.test.tsx`: el caso R20 excluye `tres_tramos`; «los CUATRO modos»
  espera `tres_tramos: 2` (el stub); R26 de los mensajes espera `tres_tramos: null`. Los tres, marcados `// T12`.

**Tests**
- Guardias: `caja-clasificacion-459` (caso «⭑ SLT-73 (D12, R24/R26)» + contraprueba «como TERCEROS → rojo»),
  `caja-derivaciones` (5 → 6; caso del orden `(egresos, ingresos)`; las dos únicas `.neg(` contadas),
  `metrics-caja-naturaleza` (fuera del literal de `terceros`), `caja-composicion-exhaustiva` (cuatro naturalezas).
- `tests/unit/utils/caja-tesoreria.test.ts`: bloques «SLT-73 R24/R25/R27/R30» (26 casos nuevos) + el vacío con
  los cuatro campos; la lista de `terceros` sin las diferencias.
- Identidad R27 (− P) en los conjuntos al azar: `caja-derivacion-457` (con anti-vacuidad: >100 con diferencia,
  >20 sin ella), `caja-derivacion-459`, `caja-derivacion-461`, `caja-iva-aparte-sl39`; y sobre el libro entero en
  `ajuste-caja-anulacion-461`, `caja-invariante-tiendas`, `wallet-anulacion-458` (integración).
- R26 sobre filas reales: `invarianteR8` en `tests/integration/db/_fixtures/slt73-cierre-aprobable.ts`, usada por
  casos nuevos en `slt73-marcar-asienta` (faltante 200, sobrante 300, cuadrado) y `slt73-corregir-diferencia`
  (marca 18.000 → corrige 18.800 → 18.400).
- Literales del dueño: `libro-kardex-468`, `wallet-movimiento-repository`, `wallet-service` (DTO completo).
- Fixtures de `CajaResumenDTO` que señaló el typecheck (19 archivos): los cuatro campos en cero/`cero` y
  `deEmpresaEnCaja` = su `deEmpresa`.

### Decisiones
- **`deEmpresaEnCaja` fuera de `tres_tramos` = `deEmpresa`.** El design solo lo define en `tres_tramos`
  (`max(E − P, 0)`); con P ≤ 0 el tramo de la empresa de la barra de antes es E, así que se manda E. No cambia
  ningún importe; es un campo de presentación.
- **`porcentajePorCobrarSatelites = "0.00"` con P ≤ 0** (design §2.9.6).
- **`E − P` y `100 − tiendas` como suma del opuesto (`.add(x.neg())`).** La guardia `caja-derivaciones` prohíbe
  `.sub(`/`.minus(` en el módulo; el design dice que esas dos diferencias no son restas con signo de un balance.
  Para que no sea una evasión muda, la guardia cuenta ahora exactamente dos `.neg(` y nombra las dos expresiones.
- **`S = t + p + e`** con `t = max(T, 0)`, `e = max(E − P, 0)`; tiendas = `round2(t/S·100)`, por cobrar =
  `min(round2(p/S·100), 100 − tiendas)`. Con P > 0 aplica en cualquier signo de E y T (caso E = −40, T = −10,
  P = 30 → 0 / 100).

### Mapa R → test (esta tanda)
| R | Test |
|---|---|
| R24 | guardia `caja-clasificacion-459` › «⭑ SLT-73 (D12, R24/R26)» + contraprueba «⭑ SLT-73 (D12): … como TERCEROS → rojo»; `caja-tesoreria.test` › «R24: solo las dos diferencias son `por_cobrar_satelite`, y en efectivo» |
| R25 | `caja-tesoreria.test` › «SLT-73 R25» (15 → "15.00"; + ingreso 5 → "10.00"; solo ingreso 20 → "-20.00"; ganancia/IVA/capital/«De las tiendas»/«De la empresa» sin cambio); guardia `caja-derivaciones` › «⭑ SLT-73 (R25/R27)» |
| R26 | guardia 459 (estática) + `slt73-marcar-asienta` › «R26 (T11): tras marcar con faltante, con sobrante o cuadrado…» + `slt73-corregir-diferencia` › «R26 (T11): tras marcar con faltante y tras cada correccion…» (`deTerceros` = Σ saldos = 16.384,00) |
| R27 | guardia `caja-derivaciones` (6 llamadas); `caja-tesoreria.test` › «SLT-73 R27» (5 conjuntos con y sin diferencias + literal); `caja-derivacion-457` (500 subconjuntos, con y sin diferencias) |
| R30 | `caja-tesoreria.test` › «SLT-73 R30»: E=100/T=50/P=150 (caja 0); E=300/T=100/P=100 → 25/25/200; tercios; redondeo 12,35 + 87,65 (el tope); E y T negativos; P = 0 y P < 0 en los cuatro modos; P = 0 por compensación idéntico campo a campo |

### Mutaciones (harness con autocomprobación: control verde, releer el texto mutado, abortar sin resumen, revertir con `git checkout --` + `git diff --quiet`)
`scratchpad/t11/mut.py`; corre 2 unit + 2 guardias + 2 integración (base `servi_slt73` vía envoltorio).
CONTROL: 109 passed (109).

| Mutación | Rojos |
|---|---|
| M1 las dos diferencias como `terceros` | 18 (incl. guardia 459 D12 y los dos R26 de integración) |
| M2 como `propio` | 19 |
| M3 solo el egreso como `terceros` | 16 |
| M4 quitar la rama `por_cobrar_satelite` de `acumular` (cae en capital) | 16 |
| M5 invertir el signo de la sexta cifra | 21 |
| M6 quitar el `min(…, 100 − tiendas)` | 2 |
| M7 `tres_tramos` con P ≤ 0 (`porCobrar.lt(0)`) | 5 |
| M8 base `E + T + P` (empresa sin restar P) | 5 |
| M9 sumar P a `deEmpresa` | 10 |
| M10 empresa en caja sin tope en 0 | 2 |
| M11 tiendas sin `max(T, 0)` | 1 |

11 mutaciones, 0 supervivientes; las 11 aplicadas, releídas y revertidas (`revertido=True`).

### Verificación (salida real)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0, 0 `error TS`.
- `pnpm run lint`: exit 0, 0 errores (232 warnings preexistentes). `eslint` de los 43 archivos tocados: 0 errores,
  1 warning preexistente (`DineroIdentidadesEnPantalla.test.tsx:541`, directiva sin uso).
- `pnpm run test:guardias`: 317/318 archivos, 4441 passed / 4 failed / 1 skipped. Único rojo:
  `dependencias-declaradas-presentes` (baseline). **`caja-clasificacion-459` VERDE.**
- Unit tocados (`caja-tesoreria`, `caja-derivacion-457/459/461`, `caja-iva-aparte-sl39`, `CajaComposicionBarra`,
  `libro-kardex-468`, `wallet-movimiento-repository`, `wallet-service`): 9 archivos, 214 passed (214).
- `vitest run slt73-marcar-asienta + slt73-corregir-diferencia` (base `servi_slt73`): 15 passed (15), 0 skipped.
- `vitest related --run` de los 6 fuentes, vía envoltorio: 461 archivos verdes; los 132 rojos son todos de
  integración por base local vacía o paralelismo («faltan la zona central, cedula u orden», «referencia a otra
  empresa», `Cannot read properties of undefined (reading 'prisma')` tras timeout de `beforeAll`, `Test timed out`).
  Ningún rojo unitario ni de componente. Los de dinero (`caja-invariante-tiendas`, `ajuste-caja-anulacion-461`,
  `wallet-anulacion-458`, `caja-caracterizacion-459`, `como-quedo`, `marca-conciliacion`, `corregir-conciliacion`,
  `cierre-bodega-conciliacion`, `libro-kardex-468` int), corridos en serie: mismos motivos de base vacía, todos en
  el baseline o ya anotados en las tandas 2-4.
- Incidente: la primera pasada de `vitest related` salió SIN el envoltorio y tomó la `DATABASE_URL` de `.env`
  (comprobado sin imprimirla: host local, no prod). Esa base no tiene las tablas (P2021); no escribió nada. Se
  repitió con el envoltorio.

### Desviaciones
- `CajaComposicionBarra.test.tsx` es de frontend (T12), pero tres de sus casos recorren el seed de modos y se
  rompían con `tres_tramos`; se ajustaron al stub con `// T12` en vez de dejarlos rojos.
- Además de las guardias pedidas, `caja-composicion-exhaustiva` (control de no-vacuidad de naturalezas) y siete
  tests de identidad R7 fuera de la lista se actualizaron a R27 (− P): sin eso quedaban rojos por diseño.

**Veredicto:** T11 hecho: 459 en verde, R24–R27 y R30 cubiertos, 11 mutaciones sin supervivientes; la UI de los
tres tramos y del bloque queda para T12 con los stubs listados arriba.

## Tanda 6 — frontend_dev: T7 (R6, R9, R14 en pantalla) (2026-10-31)

Commits: `5fc943db` (código y tests) y `test(SLT-73): T7, el canario…` (mata M2b). MCP no usado (worktree sin
indexar); Grep/Read. Sin dev server (lo levanta el implementer al final).

### Archivos

- `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`: columna «Para la central» (`paraLaCentral`) en
  lugar de «Declarado» (efectivo); columna «Falta por recibir»; cuenta desplegable por fila (`renderExpanded` de
  `DataTable` + `CascadaDinero` de la 393): Efectivo, SINPE, Transferencia, Total general, Pago al mensajero, Gana la
  bodega satélite, Para la central, Monto recibido (solo si hay marca), Falta por recibir. Aviso de diferencia y
  precarga del diálogo (`declarado`) con `paraLaCentral`.
- `SaldosSatelitesTable.tsx`: columna «Sin consolidar» (monto + «N cierres»); con `aporteSinConsolidar` ≠ 0 la
  antigüedad dice «sin consolidar» (warning) y no «al día», la fila entra en «Con pendiente» aunque el saldo sea ≤ 0,
  y no se marca «Recibido incompleto».
- `saldos-satelites-descarga-columnas.ts`: `sinConsolidar`, `cierresSinConsolidar` al final.
- `consolidaciones-satelite-descarga-columnas.ts`: `declarado` (efectivo) → `paraLaCentral` en el mismo sitio;
  `efectivo`, `pagoMensajero`, `gananciaSatelite` al final.
- `satelites-labels.ts`: `SALDOS_SATELITES_COLUMNAS.sinConsolidar`, `SIN_CONSOLIDAR`, `CASCADA_CONSOLIDACION_NOMBRE`.
- `components/shared/conciliacion/ConciliacionAcciones.tsx` + `conciliacion-labels.ts`: `con_asientos` pinta
  `role="alert"` dentro del diálogo («No se puede desmarcar.» + `mensaje` de la acción), deshabilita «Desmarcar», no
  refresca; docstring de `declarado` = lo esperado.
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`: precarga `declarado={detalle.cierre.paraLaCentral}`.
- Tests nuevos: `tests/components/ConciliacionSateliteCascada.test.tsx`, `SaldosSatelitesTable.test.tsx`,
  `ConciliacionAccionesConAsientos.test.tsx`. Ajustados: `tests/unit/descarga/saldos-satelites-descarga-columnas.test.ts`,
  `tests/integration/wallet-satelites.test.tsx` (fixtures con `paraLaCentral` coherente),
  `tests/components/descarga/WalletListados464.test.tsx` (cabecera), fixtures de `EstadoCuentaSatelite.test.tsx` y
  `wallet-sin-uuid.guardia.test.tsx` (campos del DTO que faltaban).

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R6 | `SaldosSatelitesTable.test.tsx` › «la satélite todo SINPE sin consolidar NO sale «al día»…», «…«1 cierre» en singular», «con saldo negativo pero aporte sin consolidar ≠ 0…», «la que está al día de verdad…»; `saldos-satelites-descarga-columnas` › orden y «SLT-73 R6 — lo sin consolidar sale con su signo…» |
| R8 (pantalla) | `ConciliacionSateliteCascada.test.tsx` › «R8 — la falta es la del SERVIDOR…» (canario en la celda y en la cuenta), «el diálogo de marcar precarga lo ESPERADO…» |
| R9 | `ConciliacionSateliteCascada.test.tsx` › «pinta recaudado por método…», «las tres identidades cierran con lo que se LEE», «la fila dice lo esperado…», «sin marcar no hay línea de recibido…» |
| R14 (pantalla) | `ConciliacionAccionesConAsientos.test.tsx` › «pinta el mensaje de la acción en el diálogo…» y «una reversión normal sigue cerrando…» |

### Mutaciones

Harness `scratchpad/t7mut/mut.py`: CONTROL 27/27 verde, 0 skipped; en cada una, diff no vacío, grep del texto mutado,
y después `git checkout --` + `git diff --quiet`.

| Mutación | Resultado |
|---|---|
| M1 quitar la línea SINPE de la cuenta | muerta (3 rojos) |
| M2 restar en cliente la falta de la cuenta | muerta |
| M2b restar en cliente la falta de la columna | sobrevivió en la 1.ª pasada (la cuenta, dentro de la misma tabla, tapaba la celda); test corregido → muerta |
| M3 quitar la columna «Sin consolidar» | muerta |
| M3b antigüedad vuelve a «al día» | muerta |
| M3c «Con pendiente» sin lo sin consolidar | muerta |
| M3d descarga sin la celda sin consolidar | muerta |
| M4 quitar la rama `con_asientos` | muerta |
| M5 precarga vuelve al efectivo | muerta |

Supervivientes: **0 de 9**.

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `EXIT=0`, 0 `error TS`.
- `pnpm run lint` → `✖ 232 problems (0 errors, 232 warnings)`, ninguno en archivos tocados; `eslint` de los 3 tests
  nuevos → `No issues found`.
- 1.ª pasada (3 tests nuevos + descarga + `wallet-satelites` + `DineroIdentidadesEnPantalla`): `Tests 6 failed | 97
  passed` (faltaba `ToastProvider` en mi test; fixtures de `wallet-satelites` sin `paraLaCentral` coherente). Tras
  arreglar: `SaldosSatelitesTable` + `wallet-satelites` → `Tests 43 passed`.
- `vitest related --run` de los 13 archivos del diff → `Test Files 3 failed | 22 passed`, `Tests 5 failed | 378 passed`:
  `EstadoCuentaSatelite` y `wallet-sin-uuid` (fixture sin `paraLaCentral`), `WalletListados464` (cabecera). Tras
  arreglar → `Test Files 3 passed`, `Tests 27 passed`.
- Guardias y descargas (`tests/unit/guards tests/unit/descarga tests/components/descarga` + cierres de bodega, roundtrip,
  columnas, acciones) → `Test Files 1 failed | 299 passed`, `Tests 4 failed | 3849 passed | 1 skipped`; el rojo es
  `dependencias-declaradas-presentes` (baseline, ver tandas 2-3).

### Qué mirar en el navegador (implementer, un solo servidor)

1. `/wallet/satelites` con una satélite todo SINPE sin consolidar: sale en «Con pendiente», columna «Sin consolidar»
   con monto y «N cierres», antigüedad «sin consolidar» (amarillo), NO «al día», sin badge «Recibido incompleto».
2. `/wallet/satelites/[zonaId]`: columnas «Para la central / Recibido / Falta por recibir»; el chevron de cada fila abre
   la cuenta (método → total → pago → gana → para la central → recibido → falta) y cuadra. En móvil la tabla desborda
   con scroll horizontal: mirar que la cuenta desplegada se lea.
3. «Marcar recibido» precarga `paraLaCentral` (no el efectivo); con `paraLaCentral` ≤ 0 el campo nace inválido y hay
   que teclear.
4. «Desmarcar» sobre una conciliada con asientos: aviso amarillo dentro del diálogo, botón deshabilitado, nada cambia.
5. `/cierres-admin` › detalle de cierre de bodega › «Marcar recibido»: precarga `paraLaCentral`.

### Desviaciones y abiertos

- Rótulos: se reutilizan las constantes de la 393 tal cual —«Pago al mensajero» y «Gana la bodega satélite»— y no
  los literales «Pago a mensajeros» / «Gana la satélite» del design §2.8, para que `/cierres-admin` y `/wallet/satelites`
  digan lo mismo de la misma cifra.
- La cuenta es **desplegable** por fila (patrón `renderExpanded` de `DataTable`), no siempre abierta; la fila sí enseña
  siempre lo esperado, lo recibido y la falta. Si el reviewer lee R9 como «siempre visible», es sacar la cascada del
  desplegable.
- Fuera de la lista del encargo, por D3/R8 (sin ellos la pantalla y el archivo no cuadran, o la marca «de un clic»
  escribe una diferencia que nadie quiso): `consolidaciones-satelite-descarga-columnas.ts` (columna «Declarado» →
  «Para la central»), la precarga en `CierresBodegaAdminModule.tsx` y fixtures de 3 tests ajenos.
- ABIERTO (texto, decide el humano): la nota «Desmarcar no mueve dinero. La marca es informativa…» (`conciliacion-labels`,
  D6 de la 431) ya no es cierta con SLT-73 (marcar asienta en los libros). No la toqué: es texto de producto.
- ABIERTO: la tarjeta de `/cierres-admin` (`cierre-factura`, región «Conciliación») y su identidad en
  `DineroIdentidadesEnPantalla` siguen comparando recibido + falta contra el **Efectivo**; con D3 la falta sale de
  `paraLaCentral`. El test sigue verde porque su fixture es anterior; no lo toqué (fuera de T7).
- Sigue abierto el BLOQUEO de la tanda 3 (estado de cuenta de la bodega con `total_efectivo`): el «Pendiente de llegar»
  de la cabecera de la conciliación viene de ahí.

**Veredicto:** T7 hecho: R6, R9 y R14 en pantalla con tests que leen el DOM, 0 supervivientes de 9 mutaciones;
quedan abiertos la nota «Desmarcar no mueve dinero» y la identidad de la tarjeta de `/cierres-admin`.

## Tanda 7 — frontend_dev: T12 (R28, R29, R30 en pantalla), enmienda D12–D14 (2026-10-31)

Commit de código y tests: `0455f4c4` sobre `hotfix/SLT-73-dinero-satelite-al-conciliar`. Sin tocar `lib/`, sin dev
server, sin `pnpm install`. Los stubs `// T12` de la tanda 5 quedan todos sustituidos.

### Archivos

**Código (UI)**
- `app/(app)/wallet/_components/CajaResumenCard.tsx`: tercer bloque hermano
  `<section data-bolsillo="satelites" aria-label="Por cobrar a satélites">`, fuera del de la empresa. Se pinta
  siempre, también con ₡0 y en «flujo» (D14). Lleva punto `bg-danger`, rótulo, insignia de signo (`SIGNO_BADGE`),
  el importe `porCobrarSatelites` tal cual y la pista que elige `signoPorCobrarSatelites`.
  `BOLSILLO_EMPRESA.tres_tramos = EMPRESA_NEUTRO` (confirmado). La rejilla pasa a `md:grid-cols-2 xl:grid-cols-3`.
- `app/(app)/wallet/_components/BarraComposicionCaja.tsx`: `SEGMENTOS_POR_MODO.tres_tramos` = tiendas
  (`porcentajeTiendas`), `por_cobrar` (`porcentajePorCobrarSatelites`, `bg-danger`) y la empresa como resto
  (`flex-1`). Cada segmento medido nombra su campo del DTO (`porcentaje?: CampoPorcentaje`); el ancho es el STRING tal
  cual.
- `app/(app)/wallet/_components/wallet-labels.ts`:
  - `CAJA_COMPOSICION_LABEL.porCobrarSatelites` y `empresaEnCajaDetalle`;
  - `CAJA_POR_COBRAR_SATELITES_LABEL` (rótulo y pistas) y `CAJA_POR_COBRAR_SATELITES_PISTA`
    (`Record<WalletBalanceSigno>`; en cero, la positiva);
  - `CAJA_COMPOSICION_MENSAJE.tres_tramos` (texto provisional);
  - `composicionCajaNombreAccesible` enuncia los tres tramos en `tres_tramos` (T, `porCobrarSatelites`,
    `deEmpresaEnCaja`);
  - `DUENO_LABEL.por_cobrar_satelite = "Satélite"` (provisional).
- `app/(app)/wallet/_components/WalletLedger.tsx`: `DUENO_PUNTO.por_cobrar_satelite = "bg-danger"`, el mismo token
  que el tramo de la barra.

**Tests**
- `tests/components/CajaPorCobrarSatelitesSLT73.test.tsx`: nuevo, 6 casos.
- `tests/components/CajaComposicionBarra.test.tsx`:
  - corregidos los tres casos que fijaban el stub: R20 dice por qué excluye `tres_tramos`, «los CUATRO modos» espera
    `tres_tramos: 3` y R26 lleva el mensaje literal;
  - bloque nuevo «SLT-73 — la barra con tres tramos (R30)», 4 casos.
- `tests/unit/components/wallet-ledger-dueno.test.tsx`: bloque «SLT-73 R29», 2 casos (tabla y descarga).
- `tests/unit/components/wallet-labels.test.ts`: bloque «SLT-73 R29», 1 caso.
- `tests/components/CajaResumenCard.test.tsx`: el caso R64 «once dígitos» afirma que ningún importe de la tarjeta se
  lee «₡0». Con D14 el bloque nuevo pinta ₡0, así que su fixture gana `porCobrarSatelites: "3.00"`, igual que ya hacía
  con el capital y el IVA. Es consecuencia de D14, no un rojo tapado.

### Mapa R → test

| R | Test |
|---|------|
| R28 | `CajaPorCobrarSatelitesSLT73.test.tsx`: rótulo, importe del DTO, insignia y pista positiva; negativo → «La central les debe a las satélites.»; contraprueba signo ≠ importe; fuera de `empresa` y de `tiendas`, como hermano; ₡0 en «saldo»; ₡0 en «flujo» |
| R29 | `wallet-ledger-dueno.test.tsx` «SLT-73 R29»: en la tabla, «Satélite» con punto distinto; en la descarga, `filaBaseCaja(...).esDineroDe === "Satélite"`. Además `wallet-labels.test.ts` «SLT-73 R29» |
| R30 (pantalla) | `CajaComposicionBarra.test.tsx` «SLT-73 — la barra con tres tramos»: 3 segmentos en orden, anchos STRING `25%`/`31.45%` y la empresa `flex-1`; nombre accesible literal con los tres importes; con P = 0, los dos tramos de antes; el mensaje va en el bloque de la empresa, neutro. Más «los CUATRO modos» (`tres_tramos: 3`) |

### Mutaciones (autocomprobadas)

- El script `mutar.py`, en el scratchpad de la sesión, aplica la mutación y comprueba que el texto mutado está (o que
  el tramo ya no está). Si no, sale con error.
- Tras cada mutación: `git checkout -- "app/(app)/wallet/_components/"` y `git diff --quiet`.
- Control previo: `CajaPorCobrarSatelitesSLT73` + `CajaComposicionBarra` verdes, 26/26.

| M | Mutación | Resultado | Lo mata |
|---|----------|-----------|---------|
| M1 | ocultar el bloque con signo cero | muerta (2 rojos) | R28 (D14) ₡0 en «saldo» y en «flujo» |
| M2 | meter el bloque dentro del de la empresa | muerta (5 rojos) | R28 «fuera… como hermano», más R16/R18 (el `note` de la empresa deja de ser único) |
| M3 | quitar el tramo `por_cobrar` | muerta (2 rojos) | R30 «tres segmentos», «los CUATRO modos» |
| M4 | `deEmpresa` en vez de `deEmpresaEnCaja` en el nombre accesible | muerta (1 rojo) | R30 «nombre accesible… tres tramos» |
| M5 | ignorar el signo (siempre la pista positiva) | muerta (2 rojos) | R28 negativo; contraprueba del signo |
| M5b | elegir la pista mirando el importe (`startsWith("-")`) | muerta (1 rojo) | R28 contraprueba del signo |

**Supervivientes: 0 de 6.**

Incidencia: en la primera pasada, M3 abortó porque la autocomprobación era demasiado amplia (el tipo `clave` también
contiene `"por_cobrar"`). El archivo quedó mutado durante la M4 de esa pasada. Descarté esos dos resultados y repetí M3
y M4 por separado, con `git diff --stat` antes de correr y diff limpio al revertir. Las cifras de la tabla son las de
esa repetición.

### Salida real

- Tests de la tanda (`CajaPorCobrarSatelitesSLT73`, `CajaComposicionBarra`, `wallet-ledger-dueno`, `wallet-labels`,
  `DineroIdentidadesEnPantalla`, `wallet-page`): `Test Files  6 passed (6)` · `Tests  115 passed (115)`.
- `CajaResumenCard.test.tsx` tras el ajuste: `Tests  33 passed (33)`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, `0 errors, 232 warnings`, ninguno en los archivos de la tanda.
- `vitest related --run` de los cuatro archivos de UI: `Test Files 1 failed | 106 passed (107)` · `Tests 1 failed |
  1741 passed | 17 skipped`. El rojo era `CajaResumenCard` R64 (ver arriba), ya verde tras el ajuste.
- `pnpm run test:guardias`: `Test Files 1 failed | 317 passed (318)` · `Tests 4 failed | 4441 passed | 1 skipped`. Los 4
  rojos son de `dependencias-declaradas-presentes` (baseline, igual que en las tandas 2–6).

### Qué mirar en el navegador (para el implementer)

- `/wallet` en estado «saldo» sin diferencias: tres bloques. El tercero, «Por cobrar a satélites», con ₡0, «En cero» y
  la pista positiva. La barra, con dos tramos, como antes.
- Tras conciliar una satélite con faltante:
  - el bloque muestra el faltante con «Positivo»;
  - la barra tiene tres tramos (amarillo tiendas, rojo por cobrar, gris empresa) sin hilo blanco al final;
  - «De las tiendas» no se mueve;
  - el mensaje de `tres_tramos` sale en el bloque de la empresa.
- En «flujo» (sin saldo inicial) no hay barra, pero el bloque sigue.
- En el libro, la fila de la diferencia lleva dueño «Satélite» y punto rojo; la descarga dice «Satélite».
- Maquetación: en `md` el tercer bloque cae a la segunda fila y en `xl` van los tres en fila. Revisar en móvil.

### Desviaciones y abiertos

- El design no da texto para el mensaje de `tres_tramos` (solo dice «un mensaje provisional»). Lo escribí yo y queda
  PROVISIONAL, como las dos pistas y «Satélite», hasta que Carlos lo confirme.
- El tramo y el punto van en `danger` (dinero que falta en la caja). Es el único token semántico libre, porque `info` ya
  es el del capital. Decisión técnica, revisable.
- En cero, la pista es la positiva, que explica qué es el bloque. El design solo fija la positiva y la negativa.

**Veredicto:** T12 hecho: R28, R29 y R30 en pantalla con tests que leen el DOM, 0 supervivientes de 6 mutaciones.
Faltan la verificación en el navegador (implementer) y la confirmación de los textos provisionales.

## Tanda 8 — E2E local: tres rojos (2026-10-31)

Corrida de partida: `e2e_SLT-73.log` (scratchpad), `3 failed · 16 did not run · 8 passed`. Base local `servi_slt73`
por el envoltorio, un solo servidor `next dev` en el 3073.

### Causa raíz de cada rojo

1. **`cierre-bodega-satelite.spec.ts:91` (paso 2) — spec desfasado por SLT-73, no defecto.** T7 cambió a propósito la
   precarga de «Monto recibido» a `paraLaCentral` (D3/D4, R8). Medido en la base de la corrida: `total_general`
   9000.00, `total_pago_mensajero` 1500.00, `total_ingreso_bodega_rechazos` 500.00 → 9.000 − 1.500 − 500 = **7.000**,
   justo lo que llegó. El paso 3 (desmarcar → pendientes) también quedaba viejo: desde R10 la marca asienta el cierre
   del día de la satélite, y desmarcar con asientos se rechaza con `con_asientos` (R14).
   Cambio (solo el spec):
   - paso 2: espera 7.000 en la precarga, en el aviso y en `monto_recibido`. Afirma además que antes de marcar no hay
     ninguna fila de caja con origen `cierre_dia` (R1) y que después sí la hay (R10);
   - paso 3: «Desmarcar» muestra el aviso «No se puede desmarcar. Ya entró a la caja…» dentro del diálogo y el botón
     queda deshabilitado. La consolidación sigue `aprobado` con 7000, `conciliado_at` intacto, la caja sin cambios, y
     sigue en «Resueltos».
2. **`wallet.spec.ts:65` — carrera de hidratación con `next dev`, no regresión.** Las cifras pasan. El clic en «Ver las
   órdenes que componen «Flete cobrado a la tienda»» caía en el HTML del servidor antes de que React montara: en el
   snapshot el botón nunca pasa a `[expanded]`. Con trazas de depuración (temporales, revertidas), las 4 lecturas
   (POST de server action) del montaje llegan DESPUÉS del clic y `aria-expanded` sigue en `false`. Esperando a la
   hidratación, el panel se abre y los dos destinatarios salen (`1 passed`). Ni el código implicado ni el spec cambian
   en SLT-73: `git diff origin/prod...HEAD` vacío para `components/shared/DataTable.tsx`,
   `wallet/_components/DetalleMovimientoCierre.tsx`, `e2e/wallet.spec.ts` y `e2e/_escenarios/caja.ts`. En
   `WalletLedger.tsx` el único cambio es el color del dueño `por_cobrar_satelite`. Los cuatro archivos SQL/utils de la
   sospecha solo añaden ramas para orígenes y categorías nuevos.
   Cambio (solo el spec): `desplegar()`, el patrón `abrirCon` + `toPass` que ya usan `incentivo-mensajero-slt68` y
   `pago-plataforma-sl45`, pero pulsando solo si sigue cerrado (un desplegable no es idempotente).
3. **`superadmin-empresas.spec.ts:214` — entorno, no SMTP ni SLT-73.** El log del servidor dice
   `[bienvenida] no se envio: falta NEXT_PUBLIC_APP_URL` (camino `no_enviada` del `catch`, no `sin_correo`).
   Comprobado con booleanos: `.env` tiene `SMTP_USER` y `SMTP_PASSWORD` con valor (y `playwright.config.ts` ya los
   vacía para el servidor); `NEXT_PUBLIC_APP_URL` y `NEXT_PUBLIC_SITE_URL` ausentes. CI la declara en `gate.yml`, y la
   cabecera del spec ya lo advierte (SL-41). SLT-73 no toca nada de correo ni de empresas (`--stat`). No es neutralizar
   una variable sino declararla: se corrió con `NEXT_PUBLIC_APP_URL=http://localhost:3073` en el entorno del comando,
   sin editar `.env`.

### Archivos modificados

- `e2e/cierre-bodega-satelite.spec.ts`: cabecera con la cuenta a mano, y pasos 2 y 3 según R8, R10 y R14.
- `e2e/wallet.spec.ts`: `desplegar()` contra la carrera de hidratación.
- Código de la app: ninguno.

### Salida real

- Corrida final (scratchpad `e2e_SLT-73_v2.log`): `cierres-admin`, `dos-empresas-humo` (con `plataforma-vacia`
  delante), `wallet`, `cierre-bodega-satelite` y `recepcion-satelite`, un solo servidor `next dev` en el 3073. Comando:
  `NEXT_PUBLIC_APP_URL=http://localhost:3073 E2E_PUERTO=3073 E2E_SERVIDOR=dev conbase73.sh pnpm exec playwright test …`.
  Resultado: **`27 passed (3.5m)` · `E2E_EXIT=0`**. Ninguno `failed` ni `did not run`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0, sin errores.
- `pnpm exec eslint e2e/wallet.spec.ts e2e/cierre-bodega-satelite.spec.ts`: sin problemas.
- Servidor del 3073 cerrado al terminar (puerto libre).

**Veredicto:** los tres rojos explicados. Uno era spec desfasado por SLT-73 (actualizado a R8/R10/R14), otro una
carrera de hidratación de `next dev` presente también en prod (spec endurecido) y el tercero el entorno
(`NEXT_PUBLIC_APP_URL`). E2E final en 27/27 verde, sin cambios en la app.

## Cierre T10 — implementer (2026-10-31)

### Gate local (`NODE_OPTIONS=--max-old-space-size=8192 ./init.sh`, base `servi_slt73` vía envoltorio)

- **Corrida 1, sobre `be31c35a`** (todo el código de producción; antes del E2E): typecheck y lint OK, guardias OK
  (`caja-clasificacion-459` verde tras T11). `test:rapido`: 1238/1240 archivos verdes, 3 tests rojos en 2
  archivos fuera del baseline, **INIT_EXIT=1**:
  - `tests/integration/db/geografia-por-pais.test.ts` (R11 de SL-20): la base local devuelve 23001 donde el
    test espera 23503 en dos casos. Es la definición de FK de la base local; el diff de SLT-73 no toca
    geografía ni sus migraciones.
  - `tests/integration/db/indices-rutas-calientes.test.ts` (plan de `AnaliticaOperativaRollupRepository`):
    sigue rojo con `lib/analytics/metrics.ts` devuelto a su versión de `origin/prod` (comprobado y
    revertido con `git checkout`): elección del planificador de la base local.
  - La tanda 1 ya los había anotado como rojos de entorno. 246 rojos heredados del baseline.
- **Corrida 2, sobre `6c88ab4a`** (solo añade dos specs E2E y la bitácora, que vitest no ejecuta):
  17 archivos rojos nuevos. **No vale como veredicto**: la corrida E2E de por medio dejó un superadmin y
  empresas en `servi_slt73` («la base ya tiene un superadmin que no es de este test», «referencia a otra
  empresa»). `prisma migrate reset` está bloqueado para agentes sin el consentimiento del usuario: no se
  saltó ni se borró a mano. Antes de un tercer gate hace falta resetear la base con el OK humano.

### E2E local (un único servidor `next dev`, puerto 3073)

`cierres-admin`, `dos-empresas-humo`, `wallet`, `cierre-bodega-satelite`, `recepcion-satelite` (+ el
proyecto `plataforma-vacia` del que dependen): **27 passed (3.5m), E2E_EXIT=0** (tanda 8; hace falta
`NEXT_PUBLIC_APP_URL` en el entorno del comando, que CI ya declara).

### Mapa R → test

Está por tandas en este archivo: R1–R3 y R21 (tanda 1), R10–R15, R20, R22 y R23 (tanda 2), R4–R8 (tanda 3),
R16–R20 (tanda 4), R24–R27 y R30 (tanda 5), R6, R9 y R14 en pantalla (tanda 6), R28–R30 en pantalla (tanda 7).

### Abierto para el leader / humano

1. **Estado de cuenta de la bodega (458)**: `EstadoCuentaRepository.paginaDeBodega/totalesDeBodega` sigue
   sobre `total_efectivo`; su «Pendiente de llegar» ya no cuadra con la deuda de SLT-73
   (`wallet-caracterizacion-458` TB.6, que está en el baseline por entorno). El spec no lo cubre (tanda 3).
2. **T8 retiene premios e incentivos del mensajero** (`premio_ranking`, `incentivo` y `premio_dia`) que
   cuelgan del cierre, porque conciliar no los vuelve a escribir. Es una lectura no literal de R16 (tanda 4).
3. **Textos de producto**: la nota «Desmarcar no mueve dinero…» ya no es cierta (tanda 6); los textos
   provisionales de T12 y el color `danger` (tanda 7); los rótulos de la 393 reutilizados en lugar de los
   del design §2.8 (tanda 6).
4. La tarjeta de `/cierres-admin` (región «Conciliación») sigue cuadrando contra el efectivo (tanda 6).
5. Falta verificar en el navegador lo que listan las tandas 6 y 7 (los E2E cubren marcar/desmarcar).

**T10 sin marcar**: el gate no está en verde (2 rojos de entorno en una base limpia).

## Tanda 9 — backend_dev: T13 (R31–R33, enmienda 2, D16) (2026-10-31)

Commits: `77172d54` (código y tests) y `473a5760` (caso defensivo que mata N18). Base local NUEVA
`servi_slt73c` por `conbase73c.sh`. MCP no usado (lo tocado vive en este worktree); Grep/Read. Esto cierra el
punto 1 de «Abierto para el leader / humano» del cierre T10.

### Q11 — ¿rechazar una consolidación suelta sus cierres? **No.**

- `lib/repositories/CierresBodegaAdminRepository.ts:537-553` (`resolverCierreBodega`, el camino de
  `CierresBodegaAdminService.rechazarCierreBodega`, `lib/services/CierresBodegaAdminService.ts:473-497`) hace un
  único `tx.cierreBodega.updateMany({ where: { id, estado: "solicitado" }, data: { estado, resueltoPor,
  resueltoAt, motivoRechazo } })`. No toca `cierre_dia`, y ningún trigger lo hace: en `db/migrations`, los únicos
  triggers sobre `cierre_bodega_id` son los `verificar_misma_empresa`. `onDelete: SetNull`
  (`db/schema.prisma:1622`) solo actúa si se BORRA la consolidación, y nadie la borra.
- Consecuencia: los cierres de una rechazada siguen apuntando a ella y no se pueden volver a consolidar
  (`CierreBodegaRepository.ts:206` y `:407` exigen `cierre_bodega_id IS NULL`).
- **No contradice R32**: R5 (`SaldosSatelitesRepository`, agregación (d)) cuenta esos cierres, y R32 pide una fila
  por cada cierre que cuenta en R5 y no está en una consolidación NO rechazada. Salen como «sin consolidar»
  (`slt73-estado-cuenta-bodega` › «R32: las filas sin consolidar son el cierre de la RECHAZADA…»; TB.6: los
  900,00 del cierre de b3). Mutación N6b (tratar «sin consolidar» como `cierre_bodega_id IS NULL`) → 10 rojos.
- Matiz para el leader: `aporteSinConsolidar`/`cierresSinConsolidar` de `/wallet/satelites` (R6, agregación (e))
  usan `cierre_bodega_id IS NULL`, así que NO incluyen los cierres de una rechazada, mientras que el estado de
  cuenta los rotula «sin consolidar». La deuda (R5) y el pendiente (R31) coinciden igual. En prod hay 0 rechazadas
  (431) y «Rechazar» está retirado de la pantalla (`lib/actions/cierre-bodega.ts:408`). No lo toqué.

### Archivos

- `lib/repositories/_shared/aporte-satelite-sql.ts` (nuevo): `APORTE_SATELITE_WHERE` (Prisma),
  `cuentaEnLaDeudaSql(zonaId)` (el mismo predicado en SQL, construido con los mismos valores) y
  `APORTE_SATELITE_SQL` (`general − pago − ganancia`, la resta de `paraLaCentral`/`esperadoDe`).
- `lib/repositories/SaldosSatelitesRepository.ts`: `APORTE_WHERE = APORTE_SATELITE_WHERE` (sin cambio de cifra).
- `lib/repositories/EstadoCuentaRepository.ts`: `movimientosDeBodegaSql(zonaId)`, UNA unión que leen
  `paginaDeBodega`, `totalesDeBodega` y `periodoDeBodega`:
  - `declarado` = Σ de los aportes de los cierres de la consolidación, no `total_efectivo`;
  - `recibido`, sin cambio;
  - rama nueva `sin_consolidar` (origen `cierre_dia`, fecha `COALESCE(resuelto_at, solicitado_at)`, registrado
    por `resuelto_por`).

  El corrido suma todo lo que no es `recibido`. `totalesDeBodega` devuelve `{ declarado, recibido }` (antes
  `efectivo`).
- `lib/interfaces/repositories/IEstadoCuentaRepository.ts`: tipo y docstring de `totalesDeBodega`.
- `lib/services/EstadoCuentaService.ts > leerBodega`:
  - `pendiente` se calcula con `declarado`;
  - `cargo` va en toda fila que no sea `recibido`;
  - `consolidacionId` solo si el origen es `cierre_bodega`.
- `lib/utils/estado-cuenta-chips.ts`: `CHIPS_BODEGA` gana `sin_consolidar`, y se añade `ORIGEN_POR_CHIP_BODEGA`
  (`Record<ChipBodega, …>` total). Lo usa `lib/utils/estado-cuenta.ts > paresDeChipBodega`.
- `components/shared/estado-cuenta/estado-cuenta-labels.ts`: **arreglo mínimo de tipo**. `CHIP_LABEL` es un
  `Record` total y gana `sin_consolidar: "Sin consolidar"` (texto provisional).
- Tests:
  - nuevo `tests/integration/db/slt73-estado-cuenta-bodega.int.test.ts`: crea todos sus datos y corre en una
    base vacía;
  - `_fixtures/wallet-458.ts`: cada consolidación de Z lleva su `cierre_dia` (con SINPE y descuentos), más el
    cierre de la rechazada y uno sin consolidar. Son de un mensajero propio de la zona, para no tocar el libro
    de M;
  - `wallet-caracterizacion-458`: R84 y TB.6 de la bodega, con literales a mano;
  - `estado-cuenta-saldo-corrido`: dos casos más de R33;
  - `estado-cuenta-busqueda-orden-463`: sus dos consolidaciones empatadas ganan su cierre (sin él valdrían 0,00
    y serían filas idénticas); conteos 8 y 6;
  - guardia `estado-cuenta-chips-total`: añade el libro de la bodega, con contraprueba;
  - literales de los chips en `tests/components/EstadoCuenta.test.tsx` y `EstadoCuentaBarra467.test.tsx`;
  - doble de `busqueda-por-guia-469-servicios`: `declarado`.
- Sin migración y sin tocar `schema.prisma`.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R31 | `slt73-estado-cuenta-bodega` › «⭑ R31: sin filtros, el corrido final y el pendiente = la deuda…» (1450.00 las dos, a mano); `wallet-caracterizacion-458` › «TB.6 … SLT-73 R31–R32» y «R84: pendiente de la bodega Z» (9150.00 las dos) |
| R32 | `slt73-estado-cuenta-bodega` › «⭑ R32: declarado = el neto…» (filas y `consolidacionId`) y «R32: las filas sin consolidar son el cierre de la RECHAZADA…»; TB.6 (declarado neto con SINPE; filas `sin_consolidar` fechadas en su aprobación); `estado-cuenta-saldo-corrido` › «SLT-73 R32/R33: el chip sin consolidar…» |
| R33 | `slt73-estado-cuenta-bodega` › «⭑ R33: los totales del repositorio y del periodo…» y «R33: la descarga…»; `estado-cuenta-saldo-corrido` › «SLT-73 R33: los totales del periodo de la bodega…» y la descarga; guardia `estado-cuenta-chips-total` › «SLT-73 — libro de la BODEGA» |

### Mutaciones (harness `scratchpad/t13/mut.py`, autocomprobado)

Sale del de T6:
- CONTROL previo verde (61/61, 0 skipped);
- aplica la mutación, relee el archivo y exige el texto mutado;
- corre `slt73-estado-cuenta-bodega`, `wallet-caracterizacion-458`, `estado-cuenta-saldo-corrido`, `-463`,
  `slt73-deuda-satelite`, `saldo-satelites` y la guardia de chips;
- aborta si un run no trae resumen;
- revierte con `git checkout --` y comprueba `git diff --quiet`.

19/19 aplicadas y revertidas.

| Mutación | Rojos |
|---|---|
| N1 declarado vuelve a `total_efectivo` | 7 |
| N2 quitar la rama `sin_consolidar` | 11 |
| N3 SQL sin `estado aprobado` | 5 |
| N4 SQL sin `destino_tipo` | 5 |
| N5 SQL sin la zona | 5 |
| N6a `sin_consolidar` con los cierres de consolidaciones no rechazadas (doble conteo) | 10 |
| N6b `sin_consolidar` solo con `cierre_bodega_id` nulo (pierde la rechazada, Q11) | 10 |
| N7 aporte SQL sin restar el pago al mensajero | 7 |
| N8 aporte SQL sin restar la ganancia | 7 |
| N9 totales: `declarado` solo de las consolidaciones | 35 (R22 lanza y la lectura entera cae) |
| N10 periodo sin `sin_consolidar` | 35 (ídem) |
| N11 corrido: solo `declarado` suma | 6 |
| N12 fecha de `sin_consolidar` = `solicitado_at` | 2 |
| N13 servicio: cargo solo si `declarado` | 5 |
| N14 servicio: `consolidacionId` siempre `origenId` | 2 |
| N15 servicio: pendiente sin lo declarado | 35 |
| N16 chip `sin_consolidar` con origen `cierre_bodega` | 1 |
| N17 fórmula duplicada: Saldos con su propio predicado (sin estado) | 3 |
| N18 declarado sin el predicado de la deuda | 0 en la 1.ª pasada; caso defensivo añadido (`473a5760`) → **4** |

Supervivientes: **0**.

### Lo que frontend_dev debe pintar (T14 no lo lista: va en T14 o en una tarea nueva)

- Una fila nueva en el estado de cuenta de la bodega: `chip = "sin_consolidar"`, `categoria = "sin_consolidar"`,
  `origenTipo = "cierre_dia"`, `consolidacionId = null`, importe en `cargo` (puede ser negativo).
  `app/(app)/wallet/satelites/_components/EstadoCuentaSatelite.tsx > CONCEPTO_BODEGA` no la conoce y le pone el
  rótulo de reserva «Consolidación declarada». Hace falta su concepto (p. ej. en
  `satelites-labels.ts > ESTADO_CUENTA_BODEGA_PAGINA`); la descarga toma el concepto de ahí.
- El chip «Sin consolidar» (`CHIP_LABEL`) lleva un texto provisional puesto por backend.
- «Declarado» ya no es el efectivo: es el neto para la central. Hay que revisar la descripción de la página
  (`ESTADO_CUENTA_BODEGA_PAGINA.descripcion`, «Lo que la bodega declaró al consolidar…») y la cabecera de
  `EstadoCuentaSatelite.tsx`.
- Nada de esto rompe el typecheck.

### Verificación (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0; 0 errores y 232 avisos, los mismos que antes y ninguno en los archivos de esta tanda.
- La base `servi_slt73c` está vacía (0 empresas y 0 usuarios). Las suites de la foto 458 exigen una zona central
  y una orden (`cargarCatalogo459`: es el rojo de entorno del baseline). Para correrlas sembré a mano esos
  requisitos en una empresa marcada (`scratchpad/t13/prereq.cjs up`: empresa, zona central, una tienda y una
  orden) y al terminar los borré (`down`: vuelve a 0 empresas, 0 usuarios, 0 cierres).
  - Con los requisitos sembrados:
    - `wallet-caracterizacion-458` + `estado-cuenta-saldo-corrido`: **19/19**;
    - `estado-cuenta-busqueda-orden-463`: **11/11**;
    - `kardex-cuentas-468`, `mi-wallet-resumen-458d` y `estado-cuenta-pago-tienda-172r53`: verdes;
    - `estado-cuenta-cierre-pagos-172r52` y `estado-cuenta-servidor-458d`: rojos de entorno del baseline. Siembran
      un cierre hacia `cat.centralZonaId`, que es de otra empresa: «referencia a otra empresa:
      cierre_dia.destino_zona_id -> zona». No es de esta tanda.
  - Con la base otra vez vacía: `slt73-estado-cuenta-bodega` + `slt73-deuda-satelite` + `saldo-satelites`
    **25/25**.
  - Unitarios y de componentes: `EstadoCuenta`, `EstadoCuentaBarra467`, `EstadoCuentaSatelite`,
    `busqueda-por-guia-469-servicios`, la guardia de chips y el test nuevo: **75/75**.
- `vitest related --run` de los 8 archivos de `lib/` y `components/` tocados (con los requisitos sembrados): 254
  archivos, 237 verdes, 17 rojos y 130 tests rojos. Los 17 están en `tests/baseline-rojos.json`, todos por
  entorno: «no tiene ni una tarifa», «`usuario` tiene menos de 2 filas», «referencia a otra empresa», y un
  composition root real sin datos en `ajuste-caja-anulacion-461`.
- `pnpm run test:guardias`: 318 archivos, 1 rojo (`dependencias-declaradas-presentes`, en el baseline desde el
  2026-10-21). 4443 verdes, 1 skipped.

**Veredicto:** T13 hecho y probado contra Postgres. El estado de cuenta de la bodega ya da la deuda de
`/wallet/satelites`, con una sola fórmula compartida. Q11 = rechazar no suelta los cierres, y es compatible con
R32. 0 supervivientes de 19 mutaciones. Queda para frontend_dev el rótulo de la fila «sin consolidar».
