# review SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment»

Vuelta 1 · 2026-11-12 · reviewer · diff `origin/dev...c4f3cd1e` (ruta completa).

## Veredicto: **RECHAZADO** (1 bloqueante, 3 menores)

El código y los tests están bien: el bloqueante es de proceso (tamaño del PR sin la aceptación
escrita) y no pide cambiar código. Se cierra con la línea `tamano-pr-aceptado` (decisión de Carlos)
o partiendo la feature.

## Checklist

- [x] **Ruta.** Completa, con requirements, design y tasks. Toca la lectura de dinero (pantalla de
  cierres), así que la completa es la que corresponde.
- [x] **`design.md > ## Lo que ya existe`** presente y no vacía; el diff no re-crea nada de la
  lista. Reusa el mapper `toPendienteRowDesdeSnapshot` y extrae la consulta existente a
  `cargosFulfillmentVigentes`, como dice el design.
- [ ] **Tasks.** T0-T5, T6.2 y T6.3 `[x]`; **T6.1 `[ ]`** (menor m1).
- [ ] **Tamaño.** `node scripts/tamano-pr.mjs`: **7/40 archivos, 1137/1000 líneas**, sin la línea
  `<!-- tamano-pr-aceptado: … -->` en `progress/features/SLT-110.md` (BLOQUEANTE B1).
- [x] **Trazabilidad.** Cada R tiene un test que lo comprueba (tabla abajo). El mapa `R → test`
  está en `progress/impl_SLT-110.md` y coincide con `tasks.md > Trazabilidad`.
- [x] **Typecheck** (`pnpm run typecheck`, 8 GB): exit 0, 0 `error TS`.
- [x] **Lint** (eslint de los 7 archivos de código y tests del diff): exit 0.
- [x] **Tests relacionados**, corridos por mí contra `slt110_cifras`:
  - integración bodega + integración SLT-101, unit de los dos repos, componentes de bodega y servicio
    de bodega: **7 archivos, 109 passed, 0 skipped**.
  - `tests/unit/repositories` + `tests/unit/services/cierres*` + 4 integraciones de cierres-admin:
    160 archivos verdes y 1 rojo, `cierres-admin-retornables-sql-real` («referencia a otra empresa»
    en la fixture), que **está en `tests/baseline-rojos.json`** y no toca nada del diff
    (`findGestionesRetornablesDelCierre`). No es un hallazgo.
- [x] **Integración siembra y falla si falta.** `cierre-bodega-cifras-fila-sql-real.test.ts`:
  `describe.skip` solo sin base; con base y sin catálogos, `throw` (l. 85-91); corpus sembrado en
  una transacción revertida y una autocomprobación que cuenta lo sembrado (l. 514). Ningún
  `if (!x) return;`.
- [x] **Mutaciones creíbles.** Reproduje dos, cada una revertida con `git checkout --` y
  `git status` limpio después:
  - `in: [...cierreIds]` → `some: {}` en el helper: cae «R216/R210: UNA consulta … (D no se cuela)»
    (1 failed / 7). Coincide con la mutación 1 de impl.
  - `cargosFulfillmentVigentes(this.prisma, [cierreId])` → `[]` en `findCierreByIdEnAlcance`: caen
    3 tests (R65/R94 y R94 de SLT-101; R212 de SLT-110). El helper queda vigilado desde
    `/cierres-admin`.
- [x] **Sin aserciones contra su propia fuente.** Integración y componente con literales calculados
  a mano (`"520.00"`, `"678.00"`, `"2026-11-06T15:00:00.000Z"`, «Se cargó al saldo de la tienda el
  03/11/2026, …»). R212 compara bodega contra `/cierres-admin`, pero A, B y C ya tienen sus
  literales, así que no queda verde por construcción. Los negativos son `04/11/2026` (día UTC del
  doble, que no sale en ningún otro dato del fixture), `«Se cargó al saldo»` y la orden D sembrada
  como señuelo. Ningún valor puede salir por casualidad.
- [x] **Dinero sin floats.** El diff no hace aritmética. Los importes viajan como `Decimal` →
  string por el mapper que ya existía.
- [x] **Sin N+1 (R216).** Hay una consulta de movimientos por detalle abierto
  (`CierresBodegaAdminRepository.ts:506`) en paralelo con el bucle. La comprueban el espía de SQL
  de la integración (`toHaveLength(1)`) y el unit T2.2 (`toHaveBeenCalledTimes(1)` con
  `in: ["cd1","cd2"]`). El bucle de gestiones y detalle por cierre del día ya existía y se queda
  como estaba.
- [x] **`/cierres-admin` no cambia (SLT-101).** `where { cierreId }` pasa a
  `{ cierreId: { in: [cierreId] } }`, que es la misma semántica. El mapa
  `ordenId → cargo ? ocurridoAt : null` se movió sin cambios y sigue dentro del mismo
  `Promise.all` (`CierresAdminRepository.ts:1703`). La integración de SLT-101 queda verde (10/10)
  y cae con la mutación de arriba. El renombre `LecturaDetalleMensajero` → `LecturaDetalleFila`
  no deja usos fuera de `specs/` y `progress/`.
- [x] **R215.** El único llamador de `findCierreBodegaConDetalle` es
  `CierresBodegaAdminService.ts:302`, detrás de acceso total. El test existente del servicio lo
  cubre y está verde.
- [x] **Perfil (reviewer).** El diff no añade tablas, migraciones ni dependencias, y no trae
  referencias a Ordenex. No hay literales de país o moneda en código de app: los `₡` están solo en
  el E2E, como en el resto de `e2e/`. La consulta va acotada a los cierres del día de un cierre de
  bodega ya filtrado por empresa. Los comentarios explican el porqué.
- [ ] **E2E en local.** Solo consta el escenario B6 (2/2, `E2E_EXIT=0`). Faltan
  `cierres-rediseno` entero y `--project=dinero` (menor m1, condición del PR).
- [ ] **`./init.sh`.** Ni el implementer ni yo lo corrimos (T6.1).

## Trazabilidad verificada

| R | Test | Comprueba de verdad |
|---|---|---|
| R64 | integración «gestion A» (`conceptosTarifa` literal, 2 conceptos) y «gestion C» (`[]`) · E2E B6 (tarjeta «Flete por entregado» ₡3.100 / ₡403 / ₡3.503) | sí |
| R65 | integración A (`ivaIncluido` 520.00, `fulfillmentConIva` 678.00, `ivaPctFulfillment` 13.00, fecha) y C (299.00) · componente (nota con y sin fecha) · E2E («de eso, IVA» ₡403) | sí |
| R66 | integración A (`pagoPorTarifa` + ajuste resta 700.00, `pagoMensajero` 1800.00) y B (`null`, `tarifaFaltante` true) · E2E («Por tarifa» / «Se le paga» ₡2.200) | sí |
| R210 | integración A (cargo), B (reverso → null), C (sin movimientos → null), D (no entra) · unit T2.2 | sí |
| R211 | integración A false, B true, C (viejo) false | sí |
| R212 | integración `toEqual` fila a fila contra `findCierreByIdEnAlcance` (M1 1 gestión, M2 2) | sí |
| R213 | integración «no escribe» (espía, 0 INSERT/UPDATE/DELETE con lecturas > 0) · tests de bodega existentes sin cambiar aserciones | sí |
| R214 | componente: nota, celda «Sin tarifa de pago», «Con señales 1» / «Todas 2», columna «Señales» de la descarga por guía | sí |
| R215 | `tests/unit/services/cierres-bodega-admin-service.test.ts` (forbidden sin acceso total, existente) | sí |
| R216 | integración (una consulta en el espía y su SQL re-ejecutado) · unit T2.2 | sí |

## Hallazgos

### B1 — BLOQUEANTE · Tamaño del PR por encima del máximo sin aceptación escrita

`node scripts/tamano-pr.mjs`: **1137/1000 líneas** (7/40 archivos). `progress/features/SLT-110.md`
no tiene la línea `<!-- tamano-pr-aceptado: … -->` (`docs/gate.md > Tamaño del PR`;
`CHECKPOINTS.md > Tamano del PR`), y el gate lo marca en rojo. El reparto es este:
`tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts` 660,
`tests/components/CierresBodegaAdminCifrasFila.test.tsx` 272, código de app 128 (+79/−49), E2E 39.
La estimación del spec se quedó corta: `specs/SLT-110-cifras-servidor-fila-bodega/tasks.md:105`
dice «~600 líneas».

Para cerrarlo hay dos salidas:
- Carlos acepta el tamaño y el leader escribe la línea con fecha y su frase. El motivo plausible
  es que casi todo es corpus de test, que no se parte sin perder la mutación del `where`.
- Partir la feature: el componente y el E2E van en otra rebanada.

El código no necesita cambios.

### m1 — menor · T6.1 sin hacer: `./init.sh`, E2E de `cierres-rediseno` entero y `--project=dinero`

`specs/SLT-110-cifras-servidor-fila-bodega/tasks.md:80` sigue `[ ]`. `progress/impl_SLT-110.md:156`
lo deja para el leader. Solo consta el E2E del escenario B6. `docs/perfil-agentes.md > reviewer`
lo hace **bloqueante para abrir el PR** (el diff toca una pantalla de dinero), así que es una
condición previa al PR y no un cambio de código. Lo trato como menor, con el mismo criterio que
SLT-101 y SLT-104 (T de cierre `[ ]`).

### m2 — menor · Uso de `git stash` en la verificación

`progress/impl_SLT-110.md:79`: el implementer comparó los rojos ajenos con `git stash`, que la
instrucción del leader prohíbe porque comparte la pila con otros worktrees. El resultado no afecta
al diff (los dos rojos son ajenos). Es un aviso de proceso para la próxima tanda: comparar en un
worktree limpio o con `git worktree add` sobre `origin/dev`.

### m3 — menor · Los dos rojos de guardias quedan sin cerrar en la bitácora

`progress/impl_SLT-110.md:83-85`: hay 6 rojos en `test:guardias`. 4 son de
`dependencias-declaradas-presentes` (falta el marcador «FIN PASO 2» en `init.sh`) y la bitácora
dice que caen igual sin el cambio. Los otros 2 pasan solos. Hay que confirmar en la corrida de
`./init.sh` (T6.1) que el primero está en la baseline o es ajeno; no lo toca este diff.

## Nota del reviewer

Al preparar `DATABASE_URL`, una validación con `new URL` falló por las comillas simples del `.env`
y su error imprimió la URL local de Postgres (credencial de la base de desarrollo local) en **mi
salida de herramienta**. No llegó a ningún archivo ni a este informe. El leader decide si rota esa
contraseña local.
