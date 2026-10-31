# review SLT-66 «Planes: sin tope para el maestro y costeo base + por orden»

Reviewer, 2026-10-31. Diff `origin/dev...HEAD` (head `764a7c6`), 99 archivos.
Exploración con Grep/Read (no se consultó el grafo de código).

## Verificación ejecutada por el reviewer
Por memoria escasa, no se corrió `./init.sh`, ni la suite completa, ni el E2E.

| Qué | Resultado |
|---|---|
| `tsc --noEmit` (repo entero) | exit 0 |
| eslint sobre los `.ts/.tsx` añadidos o modificados | 0 problemas |
| vitest unit/componente: `costeo`, `rastro-costeo`, `planes-schema-costeo`, `planes-service-asignar-costo`, `planes-service-costeo`, `ConsumoDelPlanCosteo`, `PlanEmpresaSinCosto`, `EmpresasModulePlan`, `PlanVistaCosteo`, `PlanFormCosteo`, `PlanDetalleAsignar`, `PlanDetalleDesasignado`, `EmpresasModuleCobro` | 13 archivos, 212/212 |
| vitest DB (`logistic_slt66`): `cobro-plataforma-plan`, `migracion-slt66-desasignar`, `plan-de-la-empresa-costeo`, `plan-maestro-sin-tope`, `deuda-plataforma-plan`, `cobro-plataforma-cargos` (SL-40, sin tocar), `empresas-plataforma-plan`, `planes-costeo-escritura` | 8 archivos, 69/69 |
| vitest DB: `migracion-slt66-ida-y-vuelta`, `migracion-sl40-ida-y-vuelta` (SL-40, sin tocar) | 2 archivos, 15/15 |
| Recorrido de imports desde los 6 `'use client'` tocados y `ConsumoDelPlan` | ningún import de `@prisma/client` en runtime (solo `import type`) |
| `package.json`, `pnpm-lock.yaml`, `docs/dependencias.md` | sin cambios |

## Checklist
- [x] `requirements.md` con R1–R34 en EARS. `design.md` abre con `## Lo que ya existe` (l. 22) y trae alternativas descartadas. El diff no re-crea nada de esa lista: `MontoInput`, `money()`, `cobro_plataforma_*` y `plan_*` se reutilizan.
- [x] `tasks.md`: 72 `[x]`, 0 `[ ]`.
- [x] Trazabilidad: la bitácora (§T17) tiene el mapa R1–R34. Comprobé casos concretos:
  - R1, R2 (`it.each`), R3 y R6 están en `plan-maestro-sin-tope`.
  - R12–R16 en `cobro-plataforma-plan`, fila a fila: excepción > plan > global > 0, archivado, descuento, base negociable, edición, cambio programado, reverso y recuperación por 100.00 y no por 120.00.
  - R34 en `migracion-slt66-desasignar`.
  - R26 en `e2e/planes-costeo.spec.ts`. Cubre los 6 pasos y añade un control: un solo movimiento `orden:cargo:100.00:plan`. No lo corrí; la bitácora registra dos corridas en verde.
- [x] Migraciones `20261031130000`–`130300`:
  - Las 8 son archivos nuevos (`A`). Ninguna migración mergeada se edita.
  - Todas traen `down.sql`, y su orden inverso está documentado.
  - El down de M2 se niega con `RAISE` si existen filas `plan` o `desasignado` (R25).
  - M4 desasigna a **todas** las empresas con plan (decisión P6). Deja la fila `desasignado` con id, ancla y ciclo corto, y el actor «Sistema (migración SLT-66)».
  - El down de M4 solo repone empresas que siguen con `plan_id IS NULL` y cuyo plan existe. La cabecera lo dice.
  - El DELETE de los topes de maestro de M1 es definitivo y la cabecera lo declara.
- [x] Cobro:
  - `cobro_plataforma_tarifa_de` es SECURITY DEFINER con `LEFT JOIN` y la prioridad excepción > plan > global > `0.00`, y se le hace `REVOKE` de PUBLIC.
  - El trigger de SL-40 solo delega el cálculo de `v_monto`/`v_fuente`: los INSERT, `now()` y el reverso no cambian, y el importe queda congelado en el movimiento.
  - `plan_de_la_empresa` y el listado del superadmin usan la misma función.
  - Ningún test de cobro de SL-40 cambió (`cobro-plataforma-cargos`, `migracion-sl40-ida-y-vuelta`, `e2e/cobro-plataforma-sl40`). `EmpresasModuleCobro` (componente de SL-40) sí cambió: ver m4.
- [x] Importes sin float:
  - `costeo.ts` calcula en céntimos `bigint`, sin `Number(` ni `parseFloat`.
  - Los `toFixed` que hay se aplican a `Prisma.Decimal`, en repositorios y tests.
  - Zod valida con `montoCobroSchema`, sobre texto.
- [x] Autorización en el service (`PlanesService`). `asignar` y la vista previa comprueban `plan_sin_costo` después de «mismo plan», como pide SL-24 R13. `asignables` filtra con `tieneCostoConcreto`.
- [x] RLS: `plan_de_la_empresa` lanza `42501` si se pide otra empresa. `servi_app` no tiene GRANT sobre la tarifa ni sobre `plan*` (R22, test en `plan-de-la-empresa-costeo`). No hay tablas nuevas.
- [x] Tests existentes tocados: los 38 archivos modificados en `tests/` y `e2e/` aparecen en design §9.3, incluidas las filas añadidas con autorización del humano.
  - Repasé las líneas borradas: solo quitan el maestro (R1–R5), pasan de «Precio» a «Costo base» (R9), de «Módulos» a «Plan y módulos» (R32), de negociable/sin precio a monto con costo (R28), o añaden fixtures con campos nuevos.
  - No se debilitó ninguna aserción sin su causa en R27.
- [x] Sin dependencias nuevas.
- [x] Sin literales de país o moneda ni recursos de Ordenex en código nuevo, y sin `console.log`. El «₡» del E2E es la salida de `money()` según la configuración, no código de la app.
- [x] Comentarios: explican el porqué.
- [ ] `./init.sh` y `gate-completo`: no los corrí, por la instrucción del leader. Los corren el leader y CI antes del merge.

## Decisiones de frontend de la tanda D
1. «Costo base mensual», y «Con monto» se queda como está → **confirmada**. Así lo protege SLT-58 y R9 no pide más.
2. El aviso usa el literal de §6.5, «Plan sin costo concreto: …» → **confirmada**. Coincide con R20; §9.1 es una paráfrasis del design.
3. El texto nuevo de R29 solo sale con 0 asignables → **confirmada**. Mantiene intacto `PlanEmpresa.test.tsx:492`.
4. El modal lista el costo del plan nuevo aunque no cambie → **confirmada** (R24).
5. «Costo por orden: 100.00 por orden» → **confirmada como menor** (m1).
6. Textos reutilizados en «Asignar a una empresa» → **confirmada**. Son casos que el spec no cubre y se resuelven sin inventar textos.
7. Rastro: «Desasignado» en «Acción» y la frase en «Qué cambió» → **confirmada**.
8. El filtro `?plan=` no tiene test a nivel de página → **confirmada como menor** (m3).
9. «Cobro por orden» con `money()` → **confirmada**. Es el formato que ya usaba la columna en SL-40.

## Hallazgos
- **m1 (menor)**: la línea «Costo por orden: 100.00 por orden» de catálogo, detalle y modal.
  - **Qué pasa:** repite «por orden», porque el rótulo de `plan-vista.ts` (`Costo por orden: ${t}`) va seguido de `textoDelCostoPorOrden` («{c} por orden»).
  - **Inconsistencia:** «Mi plan» y el detalle de empresa dicen «Costo por orden: 100.00», sin sufijo.
  - **Por qué no bloquea:** los dos literales salen del design aprobado (§4.4 y §6.2), y no rompe ningún requisito.
  - **Sobre el «.00»:** es coherente con el resto de textos de pantalla del plan. `textoDelPrecio` ya pinta «50000.00 al mes» desde SL-24. SLT-67 solo cambió los **campos** (`MontoInput`), y el formato de montos está fuera del alcance de esta ficha.
  - **Propuesta:** como seguimiento, o en esta ficha si el humano lo pide, quitar el sufijo cuando hay rótulo, o anotarlo en `progress/deudas.md` junto a la homogeneización del formato de importes en pantalla. Habría que ajustar los tests que fijan el literal: `PlanVistaCosteo`, `PlanEmpresa:517-523` y `PlanesModule`.
- **m2 (menor)**: en `db/schema.prisma`, `archivadoAt` quedó mal alineado tras añadir `costoPorOrden` (l. ~5647). Es cosmético: lo arregla `prisma format`.
- **m3 (menor)**: ningún test de integración de página comprueba que `?plan=` se filtra contra los asignables. Solo lo cubre `PlanEmpresaSinCosto`, a nivel de componente. El riesgo es bajo: el servicio rechaza igual con `plan_sin_costo`.
- **m4 (menor, para transparencia)**: cambió `EmpresasModuleCobro.test.tsx`, que es de SL-40, en `:151` y `:208`. Está autorizado en §9.3.
  - El caso de R11 («valores nuevos tras refrescar») ahora recibe el `cobroVigente` de la fila por props.
  - Ya no prueba que la celda se deriva del global en el cliente, porque esa derivación pasó al servidor (R31).
  - Lo que comprueba en pantalla se mantiene.

## Veredicto
**OK**: no hay bloqueantes. Antes del merge siguen pendientes `./init.sh`, a cargo del leader, y `gate-completo` en CI.
