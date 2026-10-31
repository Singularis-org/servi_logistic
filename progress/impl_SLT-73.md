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
