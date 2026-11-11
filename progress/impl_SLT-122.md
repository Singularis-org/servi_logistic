# impl — SLT-122 «Pago al mensajero: solo la bodega dueña del cierre»

> backend_dev, 2026-11-10. Worktree `.worktrees/SLT-122-pago-bodega-duena`, rama
> `feature/SLT-122-pago-bodega-duena` (desde af51a5b9). Spec: `specs/SLT-122-pago-bodega-duena/requirements.md`
> (ruta ligera, PA1 = A, PA2 = cerrar aquí). Base desechable `slt122_t1` exportada antes de cada vitest.
> MCP del grafo no usado: el código a tocar estaba acotado por la investigación (archivo:línea); Grep/Read.

## T0.1 — Citas del spec, contra la rama (af51a5b9)

| Cita | Sigue igual |
|---|---|
| `LiquidacionService.ts:315-382` `registrarPagoMensajero`; `:319` guard de rol; `:333` lectura; `:335` estado | sí |
| `LiquidacionService.ts:401-481` `previsualizarRepartoMensajero` | sí |
| `LiquidacionService.ts:511-637` `registrarRepartoMensajero` | sí |
| `LiquidacionService.ts:1083-1114` `imputablesDe` | sí |
| `LiquidacionService.ts:1229` (anular: `restanteTrasAnular`) y `:1400` (relectura idempotente) usan `obtenerCierreParaPago` | sí — no se tocan |
| `LiquidacionPagoRepository.ts:273-296` `obtenerCierreParaPago`; `:311-339` `listarCierresImputables`; `:362` `contarCierresNoAprobadosPorEstado` | sí |
| `ILiquidacionPagoRepository.ts:250-283` | sí |
| `CierresAdminService.ts:527-540` `resolveAlcance` | sí |
| `CierresAdminRepository.ts:851-858` `alcanceWhere` (función en 853-858) | sí |
| `CierresAdminService.ts:1378` (`obtenerCierreParaPago`), `IncentivoMensajeroService.ts:62` y `:80` | sí — no se tocan |
| `CierresAdminService.ts:1574` / `:1600` (no encontrado fuera de alcance) | sí |

## Qué se hizo

- **T1.** `alcanceWhere` sale a `lib/repositories/alcance-cierre-where.ts`; el alcance del acceso total a
  `lib/services/alcance-cierres.ts` (`ALCANCE_ACCESO_TOTAL`). `CierresAdminRepository` y
  `CierresAdminService.resolveAlcance` los importan; cuerpo idéntico. El `alcanceWhere` de
  `IncidenteAdminRepository` es OTRO (alcance por zona de la orden) y no se toca.
- **T2/T4.** `ILiquidacionPagoRepository` / `LiquidacionPagoRepository`: `obtenerCierreParaPagoEnAlcance(cierreId,
  alcance, tx)` (alcance y tx obligatorios), `listarCierresImputablesEnAlcance(mensajeroId, alcance, tx?)` y
  `contarCierresNoAprobadosPorEstado(mensajeroId, alcance)` (solo lo usa `LiquidacionService`). Todos con
  `...alcanceWhere(alcance)` en el WHERE. `obtenerCierreParaPago` y `listarCierresImputables` no cambian
  (anular, idempotencia, `/cierres-admin`, incentivos).
- **T3.** `registrarPagoMensajero` lee el cierre con `obtenerCierreParaPagoEnAlcance(…, ALCANCE_ACCESO_TOTAL, tx)`
  dentro de la tx y después del candado; `null` → `no_encontrado` antes de estado y monto. Guard de rol intacto.
- **T4.** `imputablesDe` (previsualizar, registrar, relectura bajo bloqueo, respuesta idempotente del reparto) y
  el conteo de excluidos van con `ALCANCE_ACCESO_TOTAL`.
- **T5.** Dobles tipados con los métodos nuevos. La lectura sin alcance en los dobles del reparto escribe otra
  marca en el log (`leer:imputables:SIN-ALCANCE`), para que una llamada colada rompa las aserciones de orden.
- **Fuera de lo previsto (necesario):** `tests/integration/db/nucleo-sin-modulos.test.ts` afirmaba `ok` al
  pagar desde el maestro un cierre de **satélite** (era el hueco). Pasa a afirmar `no_encontrado` y 0 pagos; el
  caso sigue probando que la action corre con los módulos apagados.

## Archivos

Creados: `lib/repositories/alcance-cierre-where.ts`, `lib/services/alcance-cierres.ts`,
`tests/integration/db/pago-mensajero-bodega-duena.test.ts`, `progress/impl_SLT-122.md`.
Modificados: `lib/repositories/CierresAdminRepository.ts`, `lib/services/CierresAdminService.ts`,
`lib/interfaces/repositories/ILiquidacionPagoRepository.ts`, `lib/repositories/LiquidacionPagoRepository.ts`,
`lib/services/LiquidacionService.ts`, `tests/unit/repositories/liquidacion-pago-repository.test.ts`,
`tests/unit/services/liquidacion-service.test.ts`, `tests/unit/services/liquidacion-reparto-service.test.ts`,
`tests/unit/services/liquidacion-anulacion.test.ts`, `tests/unit/services/caja-cadena-pago-anulacion.test.ts`,
`tests/unit/guards/liquidacion-reparto-bloqueos.guardia.test.ts`, `tests/unit/repositories/criterio-unico.guardia.test.ts`,
`tests/integration/db/nucleo-sin-modulos.test.ts`,
`specs/SLT-122-pago-bodega-duena/requirements.md` (casillas).

## Mapa R → test

| R | Test |
|---|---|
| R1 | `liquidacion-service.test.ts` «SLT-122 … R1: admin/maestro contra un cierre de satelite» + integración «R1/R2: maestro y admin contra el cierre de SATELITE» (0 filas en `liquidacion_pago` y libro) + `nucleo-sin-modulos` |
| R2 | `liquidacion-service.test.ts` «R2: un cierre de satelite {solicitado,aprobado,rechazado,vencido} con monto mayor» + contraprueba central → `excede`; integración R1/R2 (monto 999 999) |
| R3 | `liquidacion-service.test.ts` «R3: contra un cierre aprobado de la central» + tests de pago/`ya_registrado` existentes en verde + integración «R3» (`restante` 29 000 / 28 500) |
| R4 | integración «R4: el maestro de A contra el cierre central de B» (maestro y admin; control: B sí paga) |
| R5 | `liquidacion-service.test.ts` «R5: el adminSatelite pidiendo un cierre de SU zona -> forbidden» + integración «R5» |
| R6 | `liquidacion-pago-repository.test.ts` «SLT-122 — obtenerCierreParaPagoEnAlcance» (where exacto `{ id, destinoTipo }`) + `liquidacion-service.test.ts` «R6: la guardia lee el cierre con el alcance…» + mutación del WHERE (abajo) |
| R7 | `tests/components/CierresAdminDeepLink.test.tsx` y los tests de `/cierres-admin` existentes, sin tocarlos, en verde (`vitest related`) |
| R8 | integración «R8: anular un pago YA registrado contra un cierre de satelite» + `liquidacion-anulacion.test.ts` «SLT-122 (R8)» |
| R9 | `liquidacion-reparto-service.test.ts` «SLT-122 … R9» (×2 roles + previsualización) + `liquidacion-pago-repository.test.ts` «listarCierresImputablesEnAlcance» y conteo con `destinoTipo` + integración «R9» |
| R10 | `liquidacion-reparto-service.test.ts` «R10» (`sin_saldo`, imputable `0.00`) + integración «R10» |

Autorización por rol × vía (unit + integración): maestro y admin × {pago directo, previsualizar reparto, registrar
reparto} contra satélite → `no_encontrado` / no imputa; contra central → `ok`; contra otra empresa → `no_encontrado`;
adminSatelite × pago directo → `forbidden` (las vías de reparto ya tenían su `forbidden` por rol, R1/R4 de la 205,
sin cambios).

## Mutación del filtro de destino (T6)

Quitado `...alcanceWhere(alcance)` del WHERE de `obtenerCierreParaPagoEnAlcance` y de
`listarCierresImputablesEnAlcance`, y corrido `pago-mensajero-bodega-duena.test.ts` contra `slt122_t1`:

```
     × R1/R2: maestro y admin contra el cierre de SATELITE de su empresa -> no_encontrado, cero filas nuevas
     × R9: el reparto de maestro y admin solo imputa al cierre central; el de satelite ni entra
     × R10: un mensajero con SOLO cierres de satelite -> previsualizacion 0.00 y registrar sin_saldo, sin filas
 Test Files  1 failed (1)
      Tests  3 failed | 4 passed (7)
AssertionError: expected { status: 'ok', pago: { …(10) }, …(1) } to deeply equal { status: 'no_encontrado' }
AssertionError: expected '50000.00' to be '30000.00'
AssertionError: expected '7000.00' to be '0.00'
```

Restaurado el archivo desde la copia previa (3 apariciones de `alcanceWhere(alcance)`) y vuelto a correr: verde.

## Salidas

Todo con `DATABASE_URL` de `slt122_t1` exportada antes (sin imprimirla).

- **typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`): `EXIT=0`. (Sin el flag, el
  typecheck de `./init.sh` muere por memoria, código 134; con él exportado, `✓ typecheck paso`.)
- **lint** (los 16 archivos tocados): `0 errors`; el aviso propio (`_t` sin usar) corregido. En `./init.sh`:
  `✖ 243 problems (0 errors, 243 warnings)` → `✓ lint paso` (avisos heredados).
- **Tests tocados** (unit + integración + `CierresAdminDeepLink`):
  `liquidacion-service`, `liquidacion-reparto-service`, `liquidacion-anulacion`, `caja-cadena-pago-anulacion`,
  `liquidacion-pago-repository`, `liquidacion-reparto-bloqueos.guardia`, `criterio-unico.guardia`,
  `CierresAdminDeepLink`, `pago-mensajero-bodega-duena`, `nucleo-sin-modulos`, `aislamiento-wallet`,
  `incentivo-mensajero-slt68`: **12/12 archivos verdes**. `premio-ranking-idempotencia` rojo, en el baseline
  (base vacía, «La retira SL-31»), mismo motivo que en `dev`.
  `Test Files 1 failed | 12 passed (13) · Tests 1 failed | 402 passed | 16 skipped (419)`.
- **T7, R7 — `vitest related --run`** sobre los 7 archivos de `lib/` tocados + `CierresAdminDeepLink.test.tsx`:
  `Test Files 125 failed | 314 passed (439) · Tests 39 failed | 4643 passed | 714 skipped`. Los 125 archivos
  rojos están TODOS en `tests/baseline-rojos.json` (comprobado archivo a archivo: 0 fuera del baseline). La
  `criterio-unico.guardia` no entra por imports; la cazó `./init.sh` (abajo).
- **Guardia ajustada:** `tests/unit/repositories/criterio-unico.guardia.test.ts` exigía `function alcanceWhere`
  dentro de `CierresAdminRepository.ts`. T1 la muda al módulo compartido: la guardia pasa a exigir UNA
  declaración y UNA huella en `alcance-cierre-where.ts`, CERO en `CierresAdminRepository` y
  `LiquidacionPagoRepository`, el import del módulo y sus consumidores (≥5 y 3). No se afloja: 22/22 verde.
- **`./init.sh`** (log con `INIT_EXIT` dentro): primera corrida `INIT_EXIT=1` (typecheck sin memoria);
  segunda `INIT_EXIT=1` (`rojos NUEVOS (fuera del baseline): tests/unit/repositories/criterio-unico.guardia.test.ts`,
  arreglada arriba); tercera:
  ```
  [test:rapido] relacionados por imports: 440 -> FUERA (presupuesto 150)
  Test Files  100 passed (100) … (342 archivos de guardias, todos verdes)
  == init OK ==
  INIT_EXIT=0
  ```

## ABIERTOS

1. **E2E `dinero` (T7) sin correr:** necesita levantar servidor y se pidió no hacerlo. Lectura estática:
   ningún spec de `e2e/` registra un pago ni un reparto contra un cierre de satélite (`cierres-rediseno`,
   `ajuste-pago-mensajero-cierre`, `incentivo-mensajero-slt68` y `wallet-mensajeros` pagan cierres
   centrales o no pagan). Lo corre el leader antes del PR.
2. **Escenario 459 (`tests/integration/db/_fixtures/caja-459.ts:729-765`):** su mensajero es de satélite y el
   escenario hace un reparto y un pago contra su cierre de satélite con `afirmarOk`. Con SLT-122 esos dos
   pasos responden `sin_saldo` / `no_encontrado`. Hoy las 15 suites que lo siembran ya están rojas en el
   baseline (falta la zona central y una orden: «La retira SL-31»), así que nada cambia de color; pero
   cuando SL-31 las reviva, el escenario necesitará un cierre CENTRAL para esos pasos. No se toca a ciegas
   (no se puede correr aquí), igual que decidió SLT-73.
3. **Premios e incentivos de un mensajero de satélite** quedan impagables en el sistema: es la decisión de
   Carlos (PA1 = A, sin excepción); el cruce del ranking va en SLT-124. `IncentivoMensajeroService` no cambia.
4. **El acto de reparto se escribe aunque el reparto salga `sin_saldo`** (comportamiento previo de la 205: el
   acto nace antes de leer la ventana y la tx confirma al devolver). No lo introduce SLT-122 y no es un pago
   ni un movimiento del libro (R10 se cumple); se anota por si se quiere revisar.

## E2E

Corrido el 2026-11-10 sobre HEAD 888e4071 (sin cambios de código), un solo servidor (`webServer` de
Playwright, `next start`, `E2E_PUERTO=3044`), bases desechables nuevas (`migrate deploy` + `db:seed`, sin
`migrate reset`). Build: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec next build` (con 4 GB por
defecto revienta por heap, exit 134).

- **`dinero` completo** (base `slt122_e2e`):
  `pnpm exec playwright test --project=dinero` → `94 passed (5.0m)`, `PW_EXIT=0`. Ningún spec tuvo que
  adaptarse: confirma la lectura estática del ABIERTO 1 (nadie pagaba un cierre de satélite).
- **`dos-empresas-humo`** (con su dependencia `plataforma-vacia`):
  `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento`.
  - 1.ª corrida (base `slt122_humo`): `1 failed, 4 passed, 13 did not run`. Cae
    `superadmin-empresas` caso 2 (falta «El correo no está configurado en este entorno.»): build hecho sin
    `NEXT_PUBLIC_APP_URL`, causa ya documentada en `progress/impl_SL-24.md:870`. Ajeno a SLT-122.
  - 2.ª corrida, build con `NEXT_PUBLIC_APP_URL=http://localhost:3044` (como `gate.yml`) y base nueva
    `slt122_humo2` (la anterior ya tenía superadmin): `18 passed (1.4m)`, `PW_EXIT=0`.
- `pnpm typecheck` después: `TC_EXIT=0` (no hizo falta borrar `.next/dev`).

Con esto el ABIERTO 1 queda cerrado.

## Veredicto

Hecho: ni el pago directo ni el reparto aceptan un cierre de satélite (WHERE con `alcanceWhere`, mutación roja
y restaurada), anular y lecturas intactas, `INIT_EXIT=0`; queda el E2E `dinero` para el leader.
