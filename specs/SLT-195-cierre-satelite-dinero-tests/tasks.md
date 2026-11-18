# SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)» — tasks

> Agente: `backend_dev` (solo `tests/`, el baseline y `progress/`). No toca producción (R1209).
> Bitácora: `progress/impl_SLT-195.md`.

## T0 — Entorno (bloquea todo)
- [x] T0.1 Junction de `node_modules` a la raíz y `.env` copiado al worktree (sin leerlo ni
  imprimirlo; solo comprobar que existe).
- [x] T0.2 Base desechable nueva `servi_slt195_desechable` por un wrapper en el scratchpad (molde:
  `con-desechable.cjs` de SLT-177), con `prisma migrate deploy` + `pnpm run db:seed`. Nunca la del
  `.env` ni `migrate reset` (R1206).
- **Hecho:** `prisma migrate status` contra la desechable dice «up to date», y la bitácora anota el
  nombre de la base (sin la URL).

## T1 — Medir antes de tocar (depende de T0)
- [x] T1.1 Correr los 21 archivos con `--reporter=json` y anotar por archivo el primer error. Debe
  coincidir con `design.md > Diagnóstico`; si no coincide, se para y se avisa al leader.
- **Hecho:** tabla en la bitácora con 21 filas y su primer error.

## T2 — Grupo A: aprobar y asentar (depende de T1) [P con T3, T4]
- [x] T2.1 `477-aprobacion-tras-correccion-sql-real`: dinero al aprobar = 0 y asentar antes de leer
  (R1190, R1192).
- [x] T2.2 `454/caracterizacion/cierre-rechazado` (R1190, R1191).
- [x] T2.3 `454/caracterizacion/deshacer` (R1190, R1192).
- [x] T2.4 `454/caracterizacion/multi-dia-271` (R1190, R1193).
- **Hecho:** los 4 en verde en la desechable, con 0 saltados. Los literales de dinero de hoy no se
  cambian.

## T3 — Grupo B: `pago_satelite` (depende de T1) [P con T2, T4]
- [x] T3.1 `454/caracterizacion/dinero-aprobacion`: un literal, con su comentario de regla (R1194,
  R1195, R1202).
- [x] T3.2 `455/caracterizacion/dinero-aprobacion`: ídem.
- **Hecho:** los 2 en verde. El diff de cada archivo cambia solo esa fila y su comentario.

## T4 — Grupo C: reoptimización (depende de T1) [P con T2, T3]
- [x] T4.1 `454/registro-gestion-sin-transicion-sql-real`: sembrar coordenadas y una
  `ruta_optimizada` de hoy, con la `organizacion_id` del escenario, para el caso de 1 job (R1196).
- [x] T4.2 Caso nuevo sin ruta calculada hoy → 0 jobs (R1197).
- **Hecho:** verde, con los dos casos.

## T5 — Grupo 1: escenario 459 (depende de T1)
- [x] T5.1 `_fixtures/caja-459.ts`: el mensajero y su tarifa pasan a la central, aprueba el
  `maestro` y se quita el `asentarCierreDia` manual (R1198). El escenario debe terminar con todos
  los pasos en `ok` (R1199).
- [x] T5.2 Volver a medir los 14 archivos y listar cada aserción que cae, con su cifra de antes y la
  de ahora.
- [x] T5.3 Por cada cifra: si cabe en `design.md > D` (SLT-123 R313/R314, quién aprobó, fecha del
  asiento), se actualiza el literal con el cálculo a mano en un comentario (R1200, R1202). Si no
  cabe, R1203: el archivo se queda en el baseline y la pregunta va a la bitácora.
- [x] T5.4 Comprobar R1201: en el diff no cambia ninguna cifra de caja ni de tienda.
- **Hecho:** los 14 en verde (o los que R1203 deje fuera, con su causa medida). La tabla de
  literales cambiados (archivo, antes, ahora, regla) está en la bitácora.

## T6 — Control positivo (depende de T2-T5; NO en paralelo con ningún gate)
- [x] T6.1 Por cada archivo recuperado, una mutación de producción de `design.md > Control positivo`
  (o una equivalente) que lo pone rojo. Se anotan la aserción que cayó y el JSON de vitest de esa
  corrida. Se restaura con `git checkout --` (R1205).
- [x] T6.2 Tras cada restauración, `git diff --name-only -- lib/` vacío. Se vuelve a correr el
  archivo: verde.
- **Hecho:** tabla con 21 filas (o las recuperadas): mutación, aserción caída y verde tras
  restaurar.

## T7 — Baseline y deuda (depende de T6)
- [x] T7.1 Quitar de `tests/baseline-rojos.json` las entradas de los archivos verdes y añadir la
  línea de poda en `_lee_esto` (R1207, R1208).
- [x] T7.2 `progress/deudas.md`: D64 cerrada con la referencia a SLT-195 y a lo medido (R1210).
- **Hecho:** `grep -c SLT-195 tests/baseline-rojos.json` da 0, o solo las que deja R1203.
  `pnpm run test:guardias` en verde.

## T8 — Cierre (depende de T7)
- [x] T8.1 `./init.sh` en verde. No en paralelo con T6.
- [x] T8.2 `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ package.json`
  vacío (R1209).
- [x] T8.3 `node scripts/tamano-pr.mjs`: archivos y líneas de tests por debajo del tope (ver
  `## Tamaño`).
- [x] T8.4 La bitácora tiene el mapa `R1190`-`R1210` → prueba (`design.md > Trazabilidad`).
- **Hecho:** los cuatro puntos con su salida en la bitácora. **Commitear** y comprobar la rama
  antes de devolver.

## Tamaño

Tope en `arnes.config.json > gate.tamano_pr`: 40 archivos, 1000 líneas de producción y 3000 de
tests. El 80% de 40 son 32.
- **Archivos:** 24 como máximo (los 21 de prueba, el escenario 459, el `_escenario.ts` de 454 si hace
  falta y el baseline). `progress/` y `specs/` no cuentan. **Cabe.**
- **Producción:** 0 líneas.
- **Tests:** entre 300 y 700 líneas estimadas. El baseline resta unas 84 (21 entradas × 4 líneas),
  más los literales y los asientos. **Cabe**, lejos del tope.

## Archivos esperados

- `tests/integration/db/_fixtures/caja-459.ts`
- `tests/integration/db/454/_escenario.ts`
- `tests/integration/db/477-aprobacion-tras-correccion-sql-real.test.ts`
- `tests/integration/db/454/registro-gestion-sin-transicion-sql-real.test.ts`
- `tests/integration/db/454/caracterizacion/cierre-rechazado.test.ts`
- `tests/integration/db/454/caracterizacion/deshacer.test.ts`
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts`
- `tests/integration/db/454/caracterizacion/multi-dia-271.test.ts`
- `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts`
- `tests/integration/db/analitica-anulacion-rechazo-458.test.ts`
- `tests/integration/db/caja-caracterizacion-459.test.ts`
- `tests/integration/db/caja-invariante-tiendas.test.ts`
- `tests/integration/db/como-quedo.test.ts`
- `tests/integration/db/efecto-movimiento-predice.test.ts`
- `tests/integration/db/libro-caja-a-quien.test.ts`
- `tests/integration/db/libro-caja-filtro-a-quien.test.ts`
- `tests/integration/db/libro-caja-revision-458c.test.ts`
- `tests/integration/db/libro-caja-revision-458e.test.ts`
- `tests/integration/db/liquidacion-fechas-cr-461.test.ts`
- `tests/integration/db/wallet-anulacion-458.test.ts`
- `tests/integration/db/wallet-comprobante-alcance.test.ts`
- `tests/integration/db/wallet-documento-comprobante-458.test.ts`
- `tests/integration/db/wallet-registro-comprobante-458.test.ts`
- `tests/baseline-rojos.json`
- `progress/deudas.md`
- `progress/impl_SLT-195.md`
- `progress/features/SLT-195.md`
