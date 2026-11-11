# impl SLT-126 — Cobro por orden: retirar el valor propio de la empresa

> Bitácora del implementer (2026-11-11). Consolida las de cada tanda (más abajo, tal como las dejó cada
> subagente). Bases de la feature: `servi_logistic_slt126` (integración) y `servi_logistic_slt126_e2e` (E2E).

## Commits
| Tarea | Commit |
|---|---|
| T1 migración + Prisma | `2c17c1a1` |
| T2 tests de migración y regla | `08e0a079` |
| T3 servidor sin escritura | `d5d8d7df` |
| T4 lecturas sin fuente `empresa` | `b13bc808` |
| T5 tests de integración | `73406445` |
| T6+T7 pantallas | `c31d7e46` |
| T8 demo de QA | `40282bca` |

## Mapa R → test
| R | Test |
|---|---|
| R1 | `tests/components/EmpresasModuleCobro.test.tsx`; `e2e/cobro-plataforma-sl40.spec.ts` |
| R2 | `tests/unit/actions/cobro-plataforma.composition-root.test.ts`; `tests/unit/services/cobro-plataforma-service.test.ts` (además `tests/unit/types/cobro-plataforma-schema.test.ts`) |
| R3 | `tests/components/EmpresasModuleCobro.test.tsx`; `e2e/cobro-plataforma-sl40.spec.ts` |
| R4 | `tests/components/EmpresasModuleCobro.test.tsx`; `e2e/cobro-plataforma-sl40.spec.ts` |
| R5 | `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts` |
| R6 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R7 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R8 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R9 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R10 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R11 | `tests/integration/db/cobro-plataforma-sin-valor-empresa.test.ts`; `tests/integration/db/plan-de-la-empresa-costeo.test.ts`; `tests/components/ConsumoDelPlanCosteo.test.tsx`; `tests/components/PlanEmpresaSinCosto.test.tsx`; `tests/unit/actions/empresas-plataforma.composition-root.test.ts` |
| R12 | `tests/integration/db/migracion-slt126-ida-y-vuelta.test.ts` |
| R13 | `tests/integration/db/demo-qa.test.ts` |

## T1 / T2 — migración, tests nuevos y mutaciones
- `prisma validate` y `prisma generate` en verde; `prisma migrate deploy` aplicó 20261113120000 en la base de la feature.
  Es posterior a la última de `origin/dev` (20261112120000_bug_report_image).
- `down.sql`: cuerpo de `cobro_plataforma_tarifa_de` idéntico byte a byte al de 20261104150200 desde `RETURNS TABLE`
  hasta `END $$;` (1471 bytes, comprobado por el implementer); solo cambia la cabecera (`CREATE OR REPLACE`).
- `pnpm exec vitest run` de los dos archivos nuevos: `Test Files 2 passed (2) · Tests 16 passed (16)`.
- Mutación 1 (en disco, `migration.sql` con la rama de la excepción repuesta y sin los DROP): caen 7 de 9 en
  `migracion-slt126-ida-y-vuelta`; R6/R7 caen con `expected ['cargo 80.00 empresa'] to deeply equal ['cargo 100.00 plan']`
  (y con `cargo 50.00 global`, `[]`), R6 «ninguna fuente empresa» con `expected 3 to be 0`; también R10, R12 y el caso de disco.
- Mutación 2 (rama repuesta con los DROP): caen R10 y los tres R6/R7 (`no existe la columna o.cobro_plataforma_por_orden`).
- Mutación 3 (función vieja repuesta en la base de la feature): caen los 7 casos de `cobro-plataforma-sin-valor-empresa`.
- Repetida de forma independiente en T4 con el mismo resultado. Restaurado: `migration.sql` idéntico (md5), base sin
  la columna, 16/16 en verde.

---

<!-- de impl_SLT-126-T3.md -->
## SLT-126 «Cobro por orden: retirar el valor propio de la empresa» — T3 (backend_dev)

2026-11-11. Quitar la escritura del valor propio en el servidor (design §2).

## Archivos modificados
- `lib/actions/cobro-plataforma.ts` — fuera `fijarCobroEmpresaAction`; quedan `verCobroGlobalAction` y `fijarCobroGlobalAction`.
- `lib/interfaces/services/ICobroPlataformaService.ts` — fuera `fijarDeEmpresa`.
- `lib/services/CobroPlataformaService.ts` — fuera `fijarDeEmpresa` y el import de `fijarCobroEmpresaSchema`; cabecera sin «si la empresa existe (R7)».
- `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts` — fuera `existeEmpresa` y `fijarDeEmpresa`.
- `lib/repositories/CobroPlataformaTarifaRepository.ts` — fuera los dos métodos; cliente `Pick<PrismaClient, "cobroPlataformaTarifa">`.
- `lib/types/cobro-plataforma.ts` — fuera `fijarCobroEmpresaSchema`, `FijarCobroEmpresaInput` y la variante `not_found` de `FijarCobroResult`.
- `tests/unit/services/cobro-plataforma-service.test.ts` — doble sin los métodos de empresa; fuera los casos de la excepción; caso nuevo SLT-126 R2.
- `tests/unit/types/cobro-plataforma-schema.test.ts` — fuera los casos de `fijarCobroEmpresaSchema`; caso nuevo SLT-126 R2.
- `tests/unit/actions/cobro-plataforma.composition-root.test.ts` — fuera el caso de `fijarCobroEmpresaAction`; describe nuevo SLT-126 R2.

## R → test
- R2 (sin operación de empresa) → `tests/unit/actions/cobro-plataforma.composition-root.test.ts` > «SLT-126 R2 — el módulo exporta solo las dos actions del valor global»; `tests/unit/services/cobro-plataforma-service.test.ts` > «SLT-126 R2 — no hay operación que fije o quite…»; `tests/unit/types/cobro-plataforma-schema.test.ts` > «SLT-126 R2: no queda schema…».
- R2 (las dos siguen dando `forbidden`) → `cobro-plataforma-service.test.ts` > «SL-40 R6 / SLT-126 R2 — solo el superadmin…» y `cobro-plataforma.composition-root.test.ts` > «un maestro recibe forbidden…».

## Salida
- `pnpm exec vitest run` de los 3 tests: `Test Files 3 passed (3) · Tests 48 passed (48)`.
- `pnpm exec eslint` sobre los 9 archivos tocados: sin salida (limpio).
- `pnpm run typecheck`: 0 errores en los 9 archivos tocados. Quedan errores ajenos a T3, todos por usos de lo borrado:
  - `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx` (`FijarCobroEmpresaInput`), `page.tsx` (`fijarCobroEmpresaAction`) → T6.
  - `scripts/demo-qa/receta.ts` (`fijarCobroEmpresaSchema`, `fijarDeEmpresa`) → R13 (demo).
  - `tests/integration/db/`: `cobro-plataforma-cargos` (2), `cobro-plataforma-plan` (3), `empresas-plataforma-cobro` (8), `empresas-plataforma-deuda-sl45` (1), `pago-plataforma-sl45` (1), `pago-plataforma-sl45-blindaje` (1) → T5.
- `grep -rn "fijarDeEmpresa\|fijarCobroEmpresa\|existeEmpresa" lib`: sin resultados.

## Veredicto
T3 hecho en `lib/`; quedan usos en `app/` (T6) y `scripts/demo-qa/receta.ts` (R13).

<!-- de impl_SLT-126-T4.md -->
## SLT-126 «Cobro por orden: retirar el valor propio de la empresa» — T4 y mutación de T2

backend_dev, 2026-11-11. Grafo no usado (worktree sin indexar); Grep/Read.

## Archivos modificados (T4)
- `lib/types/empresas-plataforma.ts` — fuera `cobroPorOrden` de `EmpresaListada`.
- `lib/repositories/EmpresasPlataformaRepository.ts` — fuera `cobroPlataformaPorOrden` del `select` y del mapeo; comentario de `planYCobroVigente` sin «excepción».
- `lib/types/consumo-plan.ts` — `FuenteDelCosto = "plan" | "global" | "sin_configurar"`; comentarios sin la excepción.
- `lib/repositories/MiPlanRepository.ts` — `z.enum` de `costo_vigente.fuente` sin `"empresa"`.
- `lib/planes/costeo.ts` — solo comentarios.
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts` — fixture sin la columna, fuente `global`; nuevo assert: el `select` no pide `cobroPlataformaPorOrden` (R11).
- `tests/unit/services/empresas-plataforma-service.test.ts` — fuera `cobroPorOrden` de los fixtures.
- `tests/unit/planes/costeo.test.ts` — borrados los dos casos que solo probaban la excepción; el caso «plan 0.00 → sin aviso» pasa a fuente `plan`; el de importes grandes, a `plan`.
- `tests/unit/planes/costeo-porcentual.test.ts` — borrado «la excepción gana al porcentual»; `it.each` sin `empresa`; forma imposible con `global`.
- `tests/unit/planes/mensajes-costo-porcentual.test.ts` — `it.each` sin `empresa` (fuera de la lista de T4: lo rompía el tipo de `FuenteDelCosto`).

## R → test (lo que toca T4)
- R11 (servidor) → `tests/unit/actions/empresas-plataforma.composition-root.test.ts` (sin la columna en el `select`; fuente `global`); tipo `FuenteDelCosto` sin `empresa` (typecheck).
- R3 (datos) → mismo test (fila con `cobroVigente` y sin `cobroPorOrden`).

## Salidas
- `pnpm exec vitest run` de los 5 unit: 5 archivos, 72 tests, verdes.
- `pnpm exec eslint` de los 10 archivos: sin problemas.
- `grep -rn "cobroPorOrden\b\|cobroPlataformaPorOrden" lib`: vacío.
- `pnpm run typecheck`: 0 errores en `lib/` y en los tests unit tocados; quedan los de `app/`, `components/`, `scripts/`, `e2e/`, `tests/components/` y `tests/integration/` (otras tareas).

## Mutación de T2
El test de ida y vuelta crea su base desechable y aplica `migration.sql` leído del disco, así que mutar la base de desarrollo no surtía efecto. Se mutó el archivo `db/migrations/20261113120000_cobro_plataforma_sin_valor_empresa/migration.sql`: se repuso `v_excepcion` y su rama `IF … 'empresa'` (literal de 20261104150200) y se comentaron los dos `ALTER TABLE … DROP`.
Resultado: 7 rojos, 2 verdes. Los cuatro de R6/R7 cayeron por `cargo 80.00 empresa` (esperaban `100.00 plan`, `50.00 global`, ningún cargo y ninguna fuente `empresa`). También cayeron R10, R12 y «la migración en disco». Siguieron verdes R9 y R8.
Restaurada con `git checkout --` de ese archivo (el md5 coincide). Test de nuevo verde (9/9). No quedan bases `slt126_iv_*`.

Veredicto: T4 hecha, sus tests en verde; la mutación de T2 confirma que R6/R7 detectan la regla vieja.

<!-- de impl_SLT-126-T5.md -->
## SLT-126 «Cobro por orden: retirar el valor propio de la empresa» · T5 — tests de integración

Fecha: 2026-11-11 · backend_dev · worktree `.worktrees/SLT-126-cobro-retirar-valor-empresa`
Grafo de código: no usado (los archivos tocados son tests nombrados en el design; bastó Grep/Read).

## Archivos

Borrado (con `git rm`, queda staged): `tests/integration/db/empresas-plataforma-cobro.test.ts`.

Modificados (`tests/integration/db/`):
- `_fixtures/cobro-porcentual.ts` — fuera `fijarExcepcion`.
- `cobro-plataforma-porcentual.test.ts` — §3.5: B (p1) pasa a un plan fijo de 80,00 → `cargo 80.00 plan`;
  fuera «R7: con excepción…»; R11 sin los pasos de excepción.
- `cobro-plataforma-traza.test.ts` — R9 sin la fila `empresa`; R10 sin el caso con excepción; R11 con plan
  fijo de 80,55 en lugar de la excepción.
- `empresas-plataforma-cobro-porcentual.test.ts` — fuera la empresa C (la excepción gana al porcentual).
- `empresas-plataforma-plan.test.ts` — B con plan de 80,00 anual (fuente `plan`); fuera `cobroPorOrden` y
  el caso «R31: la excepción sigue saliendo aparte».
- `empresas-plataforma.test.ts` — fuera `cobroPorOrden` de filas y de las claves.
- `cobro-plataforma-plan.test.ts` — B con P sin excepción (p1 → 100,00 `plan`); fuera el chequeo de la
  columna en la partida, el `fijarDeEmpresa(B, null)` de R14 y el caso d2 (excepción sin plan).
- `cobro-plataforma-cargos.test.ts` — B con plan custom fijo 300,00 (p1 → `plan`); R3/R5 pasa a «el plan
  de B deja de fijar costo → global 600»; R8 sin `actualizarExcepcion`.
- `plan-de-la-empresa-costeo.test.ts` — `leerYCargar` sin excepción; fuera la fila `empresa` del
  `it.each`; **nuevo caso «SLT-126 R11»**.
- `deuda-plataforma-wallet.test.ts` — B con plan custom fijo 300,00.
- `deuda-plataforma-plan.test.ts` — fuera la lectura de `cobroPlataformaPorOrden`.
- `empresas-plataforma-deuda-sl45.test.ts`, `pago-plataforma-sl45.test.ts` — B con plan custom fijo 300,00.
- `pago-plataforma-sl45-blindaje.test.ts` — A y B con plan custom fijo **500,00** (ver desvíos).
- `tope-intentos-escritura.test.ts` — fuera la fila `cobro_plataforma_por_orden` del `it.each`.

Los planes sembrados en tests que commitean son custom de la empresa (`crearPlan(base, { custom })`): se
van con ella por el CASCADE de `plan_organizacion_exclusiva_id_fkey`; no hace falta limpieza nueva.

## R<n> → test

- R11 → `plan-de-la-empresa-costeo.test.ts > «SLT-126 R11: plan_de_la_empresa nunca devuelve la fuente
  empresa (plan fijo, plan sin costo, sin global)»` (empresa, `MiPlanRepository` y superadmin; control
  de no vacuidad: fuente de cada lectura = fuente del cargo).
- Sin otro `R<n>` nuevo en T5; mantienen en verde SL-40, SL-45, SLT-66, SLT-83 y SLT-85 sin la excepción.

## Verificación (salida real)

- `vitest run` tanda 1 (empresas-plataforma, -plan, -cobro-porcentual, cobro-plataforma-porcentual,
  -traza, plan-de-la-empresa-costeo, tope-intentos-escritura): `Test Files 7 passed (7) · Tests 105 passed`.
- Tanda 2 (cobro-plataforma-plan, -cargos, deuda-plataforma-wallet, -plan, empresas-plataforma-deuda-sl45,
  pago-plataforma-sl45, -blindaje): `Test Files 8 passed (8) · Tests 81 passed` (un filtro casó un
  archivo más).
- «No se tocan»: migracion-sl40-ida-y-vuelta, tope-intentos-migration, migracion-slt66-ida-y-vuelta:
  `Test Files 3 passed (3) · Tests 27 passed`. Sin cambios.
- `pnpm exec eslint <archivos tocados>`: sin salida (limpio).
- `pnpm run typecheck`: rojo solo fuera de T5 — `e2e/cobro-plataforma-sl40.spec.ts` (4 errores,
  `cobroPlataformaPorOrden`) y `scripts/demo-qa/receta.ts` (2: `fijarCobroEmpresaSchema`,
  `fijarDeEmpresa`). Son de T7/T8. Ningún error en `tests/`.
- Grep de «Hecho»: `demo-qa.test.ts` (T8), `migracion-sl40-ida-y-vuelta`, `migracion-slt126-ida-y-vuelta`,
  `tope-intentos-migration` (migraciones anteriores) y dos unit tests de T3/T4 con aserciones negativas
  (`expect("fijarDeEmpresa" in s).toBe(false)`, `not.objectContaining({ cobroPlataformaPorOrden })`).

## Desvíos del design

1. `pago-plataforma-sl45-blindaje.test.ts`: el design/tasks dicen plan fijo de 300,00, pero ese archivo
   sembraba una excepción de **500,00** en A y B. Se siembra 500,00 para que las expectativas de deuda no
   cambien (que es la intención del design: «mismo importe»).
2. `tope-intentos-migration.test.ts` y `migracion-sl40-ida-y-vuelta.test.ts`: corridos sin tocar, verdes.
3. `cobro-plataforma-plan.test.ts`: se conserva p1 (B, rama `sinGuia`) como 100,00 `plan` en vez de
   borrarlo, para no perder la orden de B que usan los pasos siguientes.

Veredicto: T5 hecha; los 15 archivos de la lista y los 3 de «No se tocan» en verde.

<!-- de impl_SLT-126-T6T7.md -->
## SLT-126 «Cobro por orden: retirar el valor propio de la empresa» — T6 y T7 (frontend_dev)

Fecha: 2026-11-11. Worktree `.worktrees/SLT-126-cobro-retirar-valor-empresa`. Sin commit (lo hace el leader).
Grafo: no consultado (el índice del worktree no estaba al día con T3/T4); Grep/Read.

## Archivos modificados

T6 — Plataforma > Empresas
- `app/(app)/plataforma/empresas/_components/CobroPorOrden.tsx`: `CeldaCobroEmpresa` solo lectura (prop
  `cobroVigente`); fuera `FijarCobroEmpresa`, editor, `propio`, `cambiar`, `cancelar`, `usarGlobal`,
  `errorNoExiste`; `ORIGEN` sin `empresa`; `ayudaGlobal` = texto de R4; `guardarCobro` sin `monto: null`,
  `falloDe` sin `not_found`.
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx`: fuera la prop `fijarCobroEmpresa` (raíz y
  `ListadoEmpresas`); la celda recibe solo `cobroVigente`.
- `app/(app)/plataforma/empresas/page.tsx`: fuera el import y la prop de `fijarCobroEmpresaAction`;
  comentario de SL-40 en singular.
- Tests: `tests/components/EmpresasModuleCobro.test.tsx` (fuera los casos del editor; nuevos R1, R3, R4),
  `EmpresasModuleCobroPorcentual.test.tsx`, `EmpresasModulePlan.test.tsx`, `EmpresasModulePeriodo.test.tsx`,
  `empresas-module.test.tsx`, `tests/integration/empresas-page.test.tsx`.

T7 — «Mi plan» y detalle de empresa
- `components/shared/ConsumoDelPlan.tsx`: fuera `TEXTOS.excepcion`, la prop `textoExcepcion` y la nota;
  la línea «Costo por orden» es un `<li>` sin hijos.
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`: fuera `TEXTOS.excepcion` y
  la prop `textoExcepcion`.
- Tests: `tests/components/ConsumoDelPlanCosteo.test.tsx`, `tests/components/PlanEmpresaSinCosto.test.tsx`.

## Mapa R<n> → test

| Req | Test |
|---|---|
| R1 | `EmpresasModuleCobro.test.tsx` > «R1: sin «Cambiar», sin «Usar el global» y sin campo de importe en ninguna fila»; también `EmpresasModulePlan.test.tsx` > «SLT-126 (R1): la fila «del plan» no ofrece «Cambiar» ni un campo» |
| R3 | `EmpresasModuleCobro.test.tsx` > «R3: la empresa con plan pinta su importe y «del plan»…», «R3: sin valor global, la empresa sin plan pinta 0,00 y «global»», «R3: ninguna fila dice «propio»…»; `EmpresasModulePlan.test.tsx` (it.each SLT-66 R31) y `EmpresasModuleCobroPorcentual.test.tsx` (R22 fijo global) |
| R4 | `EmpresasModuleCobro.test.tsx` > «R4: el campo del global lleva como ayuda exactamente el texto aprobado» |
| R11 (pantallas) | `ConsumoDelPlanCosteo.test.tsx` > «R11: fuente plan/global/sin_configurar → el importe sin …» (Mi plan); `PlanEmpresaSinCosto.test.tsx` > «R11: fuente plan / fuente global → … sin «excepción de la empresa» ni «precio acordado para tu empresa»» (detalle superadmin) |

## Salida de los comandos

`pnpm exec vitest run` de los 8 archivos tocados:
```
 Test Files  8 passed (8)
      Tests  128 passed (128)
```

`pnpm exec eslint <13 archivos tocados>`: `ESLint: No issues found` (exit 0).

`NODE_OPTIONS=--max-old-space-size=12288 pnpm run typecheck` (exit 2; no murió por memoria): 6 errores, ninguno en
`app/`, `components/` ni `tests/`:
```
e2e/cobro-plataforma-sl40.spec.ts(309,15): error TS2561: ... 'cobroPlataformaPorOrden' does not exist in type 'OrganizacionSelect<DefaultArgs>' (x4 en ese archivo)
scripts/demo-qa/receta.ts(77,10): error TS2305: Module '"@/lib/types/cobro-plataforma"' has no exported member 'fijarCobroEmpresaSchema'.
scripts/demo-qa/receta.ts(461,76): error TS2339: Property 'fijarDeEmpresa' does not exist on type 'CobroPlataformaService'.
```
Son de T8/T9 (otros agentes), no tocados.

`pnpm run test:guardias` (exit 1): `Test Files 1 failed | 339 passed | 3 skipped (343)`, `Tests 4 failed | 4799 passed`.
Los 4 rojos están en `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (guardia 420) y miran
`init.sh`, que esta rama no toca:
- R2/R6 y R4: `Error: init.sh ya no tiene el marcador ">>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<": la guardia no puede ejecutar el paso 2. Si moviste el bloque, muevete los marcadores con el.`
- R6: `AssertionError: expected '#!/usr/bin/env bash\n# init.sh — Veri…' to contain 'scripts/verificar-dependencias.mjs'`
- R2: `AssertionError: expected '#!/usr/bin/env bash\n# init.sh — Veri…' not to contain 'ok "dependencias presentes"'`

Grep de hecho de T7: `grep -rn "textoExcepcion\|precio acordado para tu empresa\|excepción de la empresa" app components` → vacío.

## Desvíos del design

- `ConsumoDelPlan.CostoDelCiclo`: además de quitar la nota, la línea del costo por orden pasa de
  `<li><span/></li>` a `<li>` con el texto (sin la nota ya no hacía falta el envoltorio). El test que medía
  «ningún texto colgando» se ajustó a `tagName === "LI"` y sin hijos.
- `CeldaCobroEmpresa` deja de envolver en `flex-col gap-2` (sin editor ni aviso, es un solo bloque).

Veredicto: T6 y T7 hechos; tests tocados, eslint y grep en verde; typecheck solo rojo en e2e/ y scripts/ (ajenos);
guardias con 4 rojos de la guardia 420 sobre `init.sh`, ajenos a esta rama.

<!-- de impl_SLT-126-T8.md -->
## SLT-126 «Cobro por orden: retirar el valor propio de la empresa» — T8 (demo de QA con plan custom)

## Archivos modificados
- `scripts/demo-qa/receta.ts` — fuera `fijarCobroEmpresaSchema`, `CobroPlataformaService` y
  `CobroPlataformaTarifaRepository` (nada más los usaba). Nuevo paso `asignarPlanDemo(org)`: crea y asigna
  con `PlanesService.crear` un plan custom `Demo QA <clave>` (custom de la empresa, sin topes,
  `ORDEN_MODULOS`, `sin_precio`, `costoPorOrden: "100.00"`, sin porcentual, `tipoCobro: "mensual"`),
  en el mismo `enParalelo` de antes y antes de la primera orden. Un `estado !== "ok"` lanza con el mismo
  formato que `exigir`. `COBRO_PLATAFORMA_POR_ORDEN` pasa de `"100"` a `"100.00"`.
- `tests/integration/db/demo-qa.test.ts` — un espía sobre `PlanesService.prototype.crear` (sigue llamando al
  real) que guarda los módulos de la empresa justo antes de asignar; caso nuevo de R13; el bloque de SL-43 R19
  ya no lee `organizacion.cobro_plataforma_por_orden` ni cuenta cargos `fuente = 'empresa'`; la huella de la
  empresa real usa `plan_id` en lugar de la columna borrada.

## R → test
- R13 → `tests/integration/db/demo-qa.test.ts` › «SLT-126 R13: cada empresa demo con su plan custom de 100.00
  por orden, un cargo `plan` de 100 por orden y los mismos módulos». Comprueba: plan asignado custom, exclusivo
  de la empresa, `costo_por_orden = 100.00` y sin porcentual; los cargos agrupados por fuente y monto son
  exactamente `[plan, 100.00, n = órdenes]` (todas las órdenes desde la primera); módulos antes = después.
  El pago a la plataforma ya lo comprueba el caso de la primera ejecución (`egreso_pago_plataforma`).

## Verificación (base de la feature)
- `pnpm exec vitest run tests/integration/db/demo-qa.test.ts` → **13 passed (13)**, 225 s.
  - corrida 1: código 0 en 33.2 s; corrida 2 (borra la primera, SL-43 R28/R27): código 0 en 30.8 s;
    tras el corte: código 0 en 29.8 s. El archivo ya cubre las dos corridas seguidas.
- `pnpm exec eslint scripts/demo-qa/receta.ts tests/integration/db/demo-qa.test.ts` → sin salida (ok).
- `pnpm run typecheck` → 4 errores, todos en `e2e/cobro-plataforma-sl40.spec.ts` (297, 299, 309, 311:
  `cobroPlataformaPorOrden`); es T9, fuera de este alcance. `scripts/` y `tests/integration/` sin errores.

## Desvíos del design §4
- `PlanesService` se construye con el reloj por defecto, no con `ahora` de la receta. Con `ahora` el caso de
  R28 («cortada a mitad de la receta») caía: su reloj que lanza se tocaba al crear el plan, antes de nacer
  ninguna orden. Además el plan rige desde hoy del reloj real, que es el del trigger del cargo.
- Residuo aceptado por el design: `plan_rastro` sin FK a `plan` deja una fila `creado` por corrida y empresa.

Veredicto: T8 hecha; R13 cubierta y en verde, demo dos veces seguidas sin errores.

<!-- de impl_SLT-126-T9.md -->
## SLT-126 «Cobro por orden: retirar el valor propio de la empresa» — T9 (E2E del cobro)

## Archivos modificados
- `e2e/cobro-plataforma-sl40.spec.ts`: fuera el paso de la excepción (Cambiar / Guardar 750 / «propio» /
  «Usar el global» y las lecturas de `cobroPlataformaPorOrden`). T8 ahora comprueba R1 (ni «Cambiar», ni
  «Usar el global», ni `textbox`, ni formulario «Cobro por orden · …» en la tabla), R3 (fuente «global»,
  nunca «propio») y R4 (ayuda exacta, visible y como descripción accesible del campo del global), antes y
  después de guardar el global. Nuevo caso final «SLT-126 R3»: con un plan custom de 300,00 por orden
  (asignado con `PlanesRepository` real), la fila de A dice «₡300» y «del plan», sin «global» ni «propio»,
  y sigue sin editor (R1). Va detrás de T7 para no cambiar los cargos de 500,00 que T7 mide.
- `e2e/_planes-fixture.ts`: `asignarPlanCustom` acepta `costoPorOrden` opcional (por defecto `null`, igual
  que antes para los demás llamadores).

## Mapa R → test (E2E)
| R | Test |
|---|---|
| R1 | `e2e/cobro-plataforma-sl40.spec.ts` > «T8 … (SLT-126 R1, R3, R4)» y «SLT-126 R3 …» (`sinEditorPorFila`) |
| R3 | `e2e/cobro-plataforma-sl40.spec.ts` > «T8 …» («global», sin «propio») y «SLT-126 R3 …» («del plan») |
| R4 | `e2e/cobro-plataforma-sl40.spec.ts` > «T8 …» (texto exacto + `toHaveAccessibleDescription`) |

## Comandos
- `NODE_OPTIONS=--max-old-space-size=12288 pnpm run typecheck` → `tsc --noEmit` sin errores.
- `pnpm exec eslint e2e/cobro-plataforma-sl40.spec.ts e2e/_planes-fixture.ts` → sin salida, exit 0.
- Base desechable `servi_logistic_slt126_e2e`: `prisma migrate deploy` («All migrations have been successfully
  applied», última 20261113120000_cobro_plataforma_sin_valor_empresa) y `db:seed` («Seed de catalogos completado»).
- `NEXT_PUBLIC_APP_URL=http://localhost:3044 NODE_OPTIONS=--max-old-space-size=8192 pnpm exec next build` → exit 0.
- Cada corrida (`E2E_PUERTO=3044`, misma base, sin recrearla):
  `--project=plataforma-vacia` (superadmin-arranque, superadmin-empresas); `--project=aislamiento --no-deps`
  con dos-empresas-humo, cobro-plataforma-sl40, pago-plataforma-sl45, planes-superadmin, planes-costeo,
  reporte-de-bugs; `--project=dinero` entero (incluye planes-costo-porcentual).

| Corrida | plataforma-vacia | aislamiento (6 specs) | dinero |
|---|---|---|---|
| 1 | 10 passed | 42 passed | 94 passed |
| 2 | 10 passed | 42 passed | 86 passed, 1 failed, 7 did not run |
| 3 | 10 passed | 42 passed | 94 passed |
| 4 | 10 passed | 42 passed | 94 passed |

0 skipped y 0 flaky en las cuatro (en local `retries: 0`). Las corridas 3 y 4 son las dos seguidas en verde
(0 failed, 0 skipped, 0 flaky) sobre la misma base, sin recrearla.

Rojo de la corrida 2 (ajeno a SLT-126):
`[dinero] › e2e\tope-intentos-por-empresa.spec.ts:493:7 › Tope de intentos por empresa (SLT-77) › aprobar por
la app relee el tope: la barrida de A se rechaza y la de B va a su bodega (R21, R35, R36)` —
`Error: Test timeout of 30000ms exceeded` en `e2e/_escenarios/pulsar.ts:30` (`pulsarHasta` → `abrirCon` →
`aprobarEnPantalla`, al abrir «Ver / decidir» en `/cierres-admin`). Los 7 «did not run» son los pasos
siguientes del mismo `describe` serial. No está en `tests/baseline-rojos.json`; el spec no toca el cobro por
orden ni importa `_planes-fixture`. Pasó en la corrida 1 y, solo y sobre la misma base, 12 passed (1.5m). La
corrida 2 tardó 13.3m en `dinero` frente a 8.2m de la 1: inestabilidad por tiempo, la misma que tumbó #97
(`docs/perfil-agentes.md > Por qué (E2E en local e inestables)`).

## Desvíos del design
- §5.2 no listaba `e2e/_planes-fixture.ts`: se le añadió un parámetro opcional para tener una fila «del plan»
  (R3) con el repositorio real, sin datos sembrados a mano.

## Veredicto
T9 hecha: R1, R3 y R4 comprobados en el navegador; las corridas 3 y 4 seguidas en verde. El rojo de la corrida 2 (tope-intentos-por-empresa, por tiempo) no tiene que ver con SLT-126.

---

## T10 — verificación local (implementer, 2026-11-11)
- `pnpm run typecheck` (NODE_OPTIONS=--max-old-space-size=12288): exit 0, sin errores.
- `pnpm run lint`: `✖ 243 problems (0 errors, 243 warnings)`.
- `./init.sh` (NODE_OPTIONS=--max-old-space-size=8192): exit 1 en el paso del validador del board, antes de los tests:
  `✗ feature_list.json invalido: zona backend: SLT-43, SLT-44, SLT-45, SLT-65, SLT-71, SLT-118 (6 in_progress, max 5)`.
  Es el estado del board (cupo), no el código de esta rama: le toca al leader.
- `pnpm run test:guardias`: `Test Files 1 failed | 342 passed (343)`, `Tests 4 failed | 4823 passed | 1 skipped (4828)`.
  Los 4 rojos son de `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (guardia 420, sobre `init.sh`,
  que esta rama no toca); el archivo está en `tests/baseline-rojos.json`: rojo heredado.
- Tests de cada tanda: ver arriba (T2 16/16, T3 48/48, T4 72/72, T5 105/105 + 81/81 + 27/27 de «No se tocan»,
  T6+T7 128/128, T8 13/13, T9 dos corridas seguidas en verde).
- E2E: rojo en la corrida 2 de `dinero`, ajeno a SLT-126 (`tope-intentos-por-empresa.spec.ts:493`, `Test timeout of 30000ms exceeded`
  en `e2e/_escenarios/pulsar.ts:30`); pasó en las corridas 1, 3 y 4 y corrido solo. Es inestable: según el perfil, se arregla en una rama `chore/`.
