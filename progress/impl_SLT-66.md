# impl SLT-66 — planes-sin-tope-maestro-y-costeo

## Tanda A — T1 y T2 (backend_dev, 2026-10-31)

### T0 — comprobaciones previas (implementer, 2026-10-31)
1. La última migración de `origin/dev` sigue siendo `20261030120100_incentivo_mensajero_checks`: las migraciones de la ficha van detrás sin renombrar.
2. Últimas versiones en `origin/dev`: `cobro_plataforma_al_crear_orden` en `20261024120000_cobro_plataforma_blindaje_orden` y `plan_de_la_empresa` en `20261029150000_plan_ciclo_inicio_elegido`. Coinciden con design §13.
3. El PR #51 (SLT-67) entró en `dev` el 2026-10-31 a las 13:11 UTC. La rama todavía no lo tiene: T10 aplica.
4. Empresas con plan asignado (`organizacion.plan_id IS NOT NULL`, solo lectura):
   - `logistic_slt66`: 0
   - `logistic` (base local principal, que va por `20261029150000`): 0
   - QA y producción: sin acceso desde aquí; el leader lo resuelve con el humano antes de M4.

Base de la feature: `logistic_slt66`, creada con `prisma migrate deploy` y `db:seed`.

### Archivos
- Creados:
  - `db/migrations/20261031120000_plan_costeo_y_maestro_sin_tope/migration.sql` (con la cabecera de borrado definitivo)
  - `db/migrations/20261031120000_plan_costeo_y_maestro_sin_tope/down.sql`
  - `tests/integration/db/migracion-slt66-ida-y-vuelta.test.ts` (solo los casos R4 de M1; los R25 son de T6)
  - `tests/unit/types/planes-schema-costeo.test.ts`
  - `tests/unit/planes/rastro-costeo.test.ts`
  - `tests/unit/services/planes-service-costeo.test.ts`
  - `tests/integration/db/planes-costeo-escritura.test.ts`
- Modificados:
  - `db/schema.prisma` (`Plan.costoPorOrden`, comentario de `PlanTopeRol`)
  - `lib/types/planes.ts` (`ROLES_CON_TOPE` sin maestro, `costoPorOrden` en esquemas, `VersionPlan`, `PlanDTO`)
  - `lib/planes/rastro.ts` (campo `costoPorOrden`, canónico)
  - `lib/planes/mensajes.ts` (`textoDelCostoPorOrden`, `Costo base:`, `Costo por orden:`)
  - `lib/repositories/PlanesRepository.ts` (`crear`, `aplicarVersion`, `aDTO`, `usoDe`, `COLUMNA_DEL_ROL`, `vigente` de `planDeEmpresa`)
  - `lib/repositories/MiPlanRepository.ts` (solo lo que exige el typecheck; ver «Decisiones provisionales»)

### Mapa R → test (de esta tanda)
| R | Test |
|---|---|
| R1 | `planes-schema-costeo.test.ts` («El maestro no admite tope»), `planes-service-costeo.test.ts` («un tope de maestro»), `migracion-slt66-ida-y-vuelta.test.ts` (CHECK `23514`) |
| R4 | `migracion-slt66-ida-y-vuelta.test.ts` (siembra, borrado, versión pendiente, rastro/asignación/base intactos, down) |
| R7 | `planes-schema-costeo.test.ts` (tres formas de base × con/sin costo) |
| R8 | `planes-schema-costeo.test.ts`, `planes-service-costeo.test.ts`, `migracion-slt66-ida-y-vuelta.test.ts` (CHECK de la columna) |
| R9 | `rastro-costeo.test.ts` (línea «Costo base:») |
| R11 | `rastro-costeo.test.ts`, `planes-service-costeo.test.ts`, `planes-costeo-escritura.test.ts` |

### Decisiones provisionales (a cerrar en T9)
- `MiPlanRepository`: `plan_de_la_empresa` aún no devuelve `costo_por_orden` (lo hace M3). El zod lo lee como
  `optional()` y `vigente.costoPorOrden` cae a `null`; `uso.maestro` sigue en el zod (la función lo devuelve) pero ya
  no entra en `porRol`. T9 vuelve obligatorio `costo_por_orden` y quita `uso.maestro`.

### Hallazgo para T4 (no resuelto aquí)
`costoPorOrden` es obligatorio en la entrada (design §4.1). Los tests existentes que mandan entradas sin tipar no los
marca el typecheck, pero caen en ejecución con `validation_error`:
- `tests/integration/db/_fixtures/planes.ts:204` (`entradaDePlan`), que usan `planes-asignacion`, `planes-asignacion-inicio-ciclo`,
  `planes-cambio-correos`, `planes-cambio-programado`, `planes-edicion-en-uso` y `planes-historial`;
- los literales `CREAR`/`VERSION` de `tests/unit/services/planes-service.test.ts`.
Ninguno está en la tabla de design §9.3 salvo por la fila genérica «Fixtures … suman `costoPorOrden: null`».

`vitest related --run` sobre los 5 archivos de `lib/` (sin base: los de integración se saltan): 3893 pasados, 106
fallados, 264 saltados. Fallan:
- en la tabla de §9.3 o en la fila de fixtures: MiPlanModule (3), PlanDetalle (3), PlanEmpresa (45), PlanForm (13),
  consumo (1), rastro (8: el `PlanDTO` del fixture sin `costoPorOrden`), planes-schema (6), mi-plan-service (3),
  planes-service-lecturas (3), planes-service (16), plantilla-cambio-plan (1);
- FUERA de §9.3: `tests/unit/actions/planes.composition-root.test.ts` (3, entrada sin `costoPorOrden`) y
  `tests/components/PlanesModule.test.tsx` (1, «Nuevo plan» crea con el `PlanForm` que aún no manda el campo: lo
  arregla T11).

### Evidencia
- `prisma migrate deploy` (base `logistic_slt66`): aplica `20261031120000_plan_costeo_y_maestro_sin_tope`.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script`: `-- This is an empty migration.`
- `prisma generate`: OK.
- vitest (con `DATABASE_URL` de la feature):
  - `migracion-slt66-ida-y-vuelta.test.ts`: 7/7
  - `planes-costeo-escritura.test.ts`: 4/4
  - `rastro-costeo.test.ts`: 9/9
  - `planes-schema-costeo.test.ts`: 12/12
  - `planes-service-costeo.test.ts`: 39/39
- `pnpm run typecheck`: 0 errores en `lib/`, `app/` y `components/`; 31 en tests existentes (T4): ConsumoDelPlan.test.tsx:26;
  MiPlanModule.test.tsx:18,36; PlanDetalle.test.tsx:25; PlanEmpresa.test.tsx:35,42,45,71; PlanesModule.test.tsx:20,34;
  PlanForm.test.tsx:23; integration/db/_fixtures/planes.ts:204; mi-plan-repository.test.ts:25;
  planes-lecturas-plataforma.test.ts:27; plataforma-empresa-detalle-page.test.tsx:169,176,188;
  plataforma-planes-page.test.tsx:67,72; unit/planes/consumo.test.ts:69; unit/planes/rastro.test.ts:9;
  mi-plan-service.test.ts:29,43,98,105; planes-service-inicio-ciclo.test.ts:29; planes-service-lecturas.test.ts:33,46,96,99;
  planes-service.test.ts:24.
- `eslint` sobre los archivos tocados: sin avisos.

### Veredicto
T1 y T2 hechas: tests nuevos en verde, drift vacío y typecheck limpio en el código de producción. Quedan 31 errores de
tipos en tests existentes, que son de T4.

## Tanda A — T3 y T4 (backend_dev, 2026-10-31)

### T3 — `tests/integration/db/plan-maestro-sin-tope.test.ts` (d0ef208): 7/7
- R1: `INSERT` de un tope de `maestro` → `23514`, también al crear un plan con `porRol.maestro`.
- R2: un `it.each` sobre los cuatro roles; con tope 1, el segundo alta da `TopeDelPlanAlcanzado`.
- R3: empresa con todos los topes llenos.
  - Crear, activar, aprobar un pendiente y pasar un admin a maestro: entran los cuatro.
  - El uso no cambia, salvo admin −1 por el cambio de rol.
  - Desviación: la aprobación de un maestro usa la misma sentencia `UPDATE` que `actualizarEstadoSiPendiente`, sin el filtro de rol, porque el repositorio solo aprueba mensajeros. Queda comentado en el test.
- R6: el tope de órdenes y el de keys siguen rechazando.
- Control de no vacuidad: los triggers están en `pg_trigger`.
- **Mutación 4** (el CHECK vuelve a admitir `maestro`, medida en `logistic_slt66`):
  - cae el caso R1: 1 fallado, 6 pasados;
  - CHECK de M1 restaurado: 7/7.

### T4 — tests existentes (b42329b), SIN CERRAR
| Archivo | Pasados / fallados |
|---|---|
| planes-catalogo | 14 / 0 |
| plan-topes-usuarios | 10 / 0 |
| planes-schema | 28 / 0 |
| consumo | 34 / **1** |
| mi-plan-service | 13 / 0 |
| planes-service-lecturas | 30 / 0 |
| plantilla-cambio-plan | 14 / 0 |
| mi-plan-repository | 3 / **1** |
| plan-de-la-empresa | 7 / 0 (`:123` y `:178` no se tocan, dependen de M3) |
| planes-lecturas-plataforma | 3 / 0 |
| rastro | 8 / **1** |
| planes-service | 80 / 0 |
| planes-service-inicio-ciclo | 28 / 0 |

Fixture tocado: `_fixtures/planes.ts:211`.

`costoPorOrden: null` también se añadió en líneas que la tabla no cita una a una (fila genérica «Fixtures»):
- mi-plan-service `:34`, `:113`;
- planes-service-lecturas `:41`, `:52`, `:98`;
- mi-plan-repository `:30`;
- planes-lecturas-plataforma `:32`;
- planes-schema `:24`, `:37`;
- planes-service `:43`, `:53`.

**Bloqueos (pendientes del humano, por R27 y T4).** Estos tres casos rojos exigen tocar líneas que §9.3 no cita:
1. `tests/unit/planes/consumo.test.ts:72-81`: la lista esperada todavía incluye `"maestro"` (`:75`).
2. `tests/unit/planes/rastro.test.ts:22-31`: el diff al crear trae `costoPorOrden: {antes: null, despues: null}`.
3. `tests/integration/db/mi-plan-repository.test.ts:83-88`: el `toEqual` de `vigente` necesita `costoPorOrden: null`.

Tests fuera de la tabla que rompe `costoPorOrden` obligatorio (aviso de T2, sin corroborar con base):
- `tests/unit/actions/planes.composition-root.test.ts` (3 fallos);
- `tests/components/PlanesModule.test.tsx` (T11);
- los seis de integración que usan `entradaDePlan`: planes-asignacion, planes-asignacion-inicio-ciclo, planes-cambio-correos, planes-cambio-programado, planes-edicion-en-uso, planes-historial. Con el arreglo de `_fixtures/planes.ts:211` pueden pasar; no se han corrido.

### Mapa R → test (añadido)
| R | Test |
|---|---|
| R1 | + `plan-maestro-sin-tope.test.ts` (R1), `planes-catalogo.test.ts` («R25 — tope por rol») |
| R2 | `plan-maestro-sin-tope.test.ts` (R2, `it.each`), `plan-topes-usuarios.test.ts:255` |
| R3 | `plan-maestro-sin-tope.test.ts` (R3) |
| R5 | `consumo.test.ts:69`, `mi-plan-service.test.ts`, `planes-service-lecturas.test.ts` (backend; las pantallas van en la tanda D) |
| R6 | `plan-maestro-sin-tope.test.ts` (R6) |

Typecheck: limpio en `lib/`, `app/`, `components/`, `tests/unit` y `tests/integration/db`. Quedan errores solo en tests de componentes y páginas (tanda D).

### T4 — ajustes autorizados por el humano (2026-10-31, «Sí, autoriza»), commit 29edc98
Filas añadidas a design §9.3 con fecha y la marca «autorizado por el humano». Líneas tocadas:
- `consumo.test.ts:73-77`: sin `"maestro"`, y el título dice «cuatro roles».
- `rastro.test.ts:31`: el diff de creación lleva `costoPorOrden` nulo.
- `mi-plan-repository.test.ts:88`.
- `planes.composition-root.test.ts`: cuatro entradas con `costoPorOrden: null`.

| Archivo (contra `logistic_slt66`) | Pasados / fallados |
|---|---|
| consumo | 35 / 0 |
| rastro | 9 / 0 |
| planes.composition-root | 4 / 0 |
| mi-plan-repository | 4 / 0 |
| planes-asignacion-inicio-ciclo | 11 / 0 |
| planes-asignacion | 11 / **1** |
| planes-cambio-correos | 0 / **9** |
| planes-cambio-programado | 2 / **8** |
| planes-edicion-en-uso | 1 / **6** |
| planes-historial | 5 / **2** |

**Bloqueo vigente.** Cinco archivos de integración de SL-24 arman a mano entradas de `crear` o `editar` sin `costoPorOrden`. La causa es la misma en todos: `validation_error` en `costoPorOrden`, y lo demás sale en cascada. Dónde:
- `planes-edicion-en-uso:38-47` (ayudante `editar`);
- `planes-cambio-correos:124-135` (ayudante `editar`);
- `planes-cambio-programado`: el ayudante `programar` (desde `:55`) y los literales de `~144-155` y `~181`;
- `planes-asignacion:198-205`;
- `planes-historial:87-94` y la edición que sigue; el caso R43 (`:329`) sale probablemente por lo mismo.

Arreglo mecánico propuesto: `costoPorOrden: entrada.costoPorOrden` en los ayudantes y `costoPorOrden: null` en los literales. No entra en la autorización: pendiente del humano. T4 sigue sin marcar.

### T4 — cierre (autorización del humano del 2026-10-31, «Sí»): commits 711de3b y d919805
En los cinco tests de integración de SL-24:
- `costoPorOrden: entrada.costoPorOrden` en los ayudantes y `null` en los literales:
  - `planes-edicion-en-uso:45`
  - `planes-cambio-correos:132`
  - `planes-cambio-programado:64, :146, :157, :185` (`:185` es el `pendiente.version` esperado)
  - `planes-asignacion:204`
  - `planes-historial:94, :104, :313`
- `planes-historial:125`: el diff esperado de alta de R29 suma `costoPorOrden: {antes: null, despues: null}`. Es el mismo trato que `rastro.test.ts:31`, bajo la autorización general («cae solo por costoPorOrden»). El test sigue comprobando el diff exacto.

Filas añadidas a design §9.3.

| Archivo (contra `logistic_slt66`) | Pasados / fallados |
|---|---|
| consumo | 35 / 0 |
| rastro | 9 / 0 |
| planes.composition-root | 4 / 0 |
| mi-plan-repository | 4 / 0 |
| planes-asignacion-inicio-ciclo | 11 / 0 |
| planes-edicion-en-uso | 7 / 0 |
| planes-cambio-correos | 9 / 0 |
| planes-cambio-programado | 10 / 0 |
| planes-asignacion | 12 / 0 |
| planes-historial | 7 / 0 |

- eslint: limpio en los archivos tocados.
- typecheck: sin errores fuera de `tests/components/` y `tests/integration/plataforma-*-page.test.tsx`, que son de la tanda D.

## Veredicto de la tanda A
T0–T4 hechas, con los tests de la tanda en verde contra `logistic_slt66`. Pendiente de otras tandas: los tests de componentes y de páginas (D) y `MiPlanRepository` provisional hasta T9.

## Tanda B — T5, T6, T7 (backend_dev, 2026-10-31)

### Commits
- `27a7dd5` T5: M2 `20261031120100_cobro_plataforma_fuente_plan`.
  - Añade `plan` a `CobroPlataformaFuente` y `desasignado` a `PlanRastroAccion`, en la migración y en Prisma (design §2.2).
  - El `down.sql` se niega a bajar si quedan movimientos de fuente `plan` o filas `desasignado`.
- `5e7cdeb` T6: M3 `20261031120200_plan_costeo_funciones`.
  - Funciones: `cobro_plataforma_tarifa_de`, el trigger de SL-40 y `plan_de_la_empresa`.
  - Los cuerpos se diffearon contra los de origen: solo cambia lo que dice el design.
  - El `down.sql` lleva los cuerpos de origen literales. El test de ida y vuelta compara el md5 de `pg_get_functiondef`.
- `93bab1f` T7: `deuda-plataforma-plan.test.ts`. Un caso en ROJO: el de R21, que depende de T9 (abajo).

Drift: vacío después de M2 y después de M3.

### Tests (`logistic_slt66`)
| Archivo | Pasados / fallados |
|---|---|
| cobro-plataforma-plan (nuevo) | 16 / 0 |
| migracion-slt66-ida-y-vuelta (7 de R4 y 4 de R25) | 11 / 0 |
| cobro-plataforma-cargos (SL-40, sin tocar) | 20 / 0 |
| migracion-sl40-ida-y-vuelta (SL-40, sin tocar) | 4 / 0 |
| deuda-plataforma-plan | 3 / **1** (R21) |

`cobro-plataforma-plan` lleva un caso añadido: «D sin plan y con excepción de 70». Sin él, la mutación 3 no caía en este archivo.

### Mutaciones de §9.4
1. Mirar el plan antes que la excepción: `cobro-plataforma-plan` da 13 fallados / 3 pasados; el primero es «B crea p1 → 80.00 empresa».
2. Ignorar el plan: `cobro-plataforma-plan` da 14 / 2; el primero es «A crea o1 → 100.00 plan».
3. `JOIN` en vez de `LEFT JOIN`:
   - `cobro-plataforma-plan`: cae 1, el de D con excepción;
   - `cobro-plataforma-cargos`: caen 4.

Las tres restauradas, y todo vuelve a verde.

### Carga de 500 filas (design §13)
- **SQL puro, `INSERT` de 500 órdenes:** mediana 856 ms antes de M3 y 928 ms después. Unos +8 %, ≈ 0,14 ms por orden.
- **`OrdenRepository` real, rondas intercaladas:**
  - con guía: ≈ 3933 → 3460 ms;
  - sin guía: ≈ 1149 → 1099 ms;
  - el ruido es mayor que la diferencia.
- **Aviso:** la carga de 500 con guía ya tarda entre 3 y 4,9 s ANTES de M3, rozando el timeout de 5 s de las transacciones interactivas de Prisma. En una serie sin intercalar hubo llamadas que pasaron los 5 s.

### Tests de T9 que M3 rompe (sin editar, son de la tanda C)
- `plan-de-la-empresa.test.ts`: 2 fallados.
  - El `uso` sin `maestro`.
  - Las claves: ahora son 14, con `costo_por_orden` y `costo_vigente`.
- `mi-plan-repository.test.ts`: 1 fallado. El zod pide `uso.maestro` y `plan_de_la_empresa` ya no lo devuelve.
- **Fuera de §9.3:** `planes-asignacion-inicio-ciclo.test.ts` (SLT-58) tiene 2 fallados, R33 y R34, por la misma causa de zod en `MiPlanRepository`.

### Bloqueos
1. **R21 de T7 y los tres archivos de arriba** necesitan que `MiPlanRepository` deje de exigir `uso.maestro`, que es T9.
   - Probado con un cambio temporal, revertido y sin commit: con `maestro: conteo.optional()`, T7 da 4/0 y `planes-asignacion-inicio-ciclo` 11/0.
   - T7 queda sin marcar.
2. **`app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx:96` no compila** (TS2741): falta `desasignado` en `Record<PlanRastroAccion, string>`. Es la traducción de T22 (frontend), y el typecheck de la rama está en rojo hasta entonces.

## Tanda B (2) — T9 adelantada por el leader, más T8 (que T9 necesita) y la traducción `desasignado` de T22

### Commits
- `0b12f0f` (frontend_dev): `PlanDetalle.tsx` suma `desasignado: "Desasignado"` en `ACCIONES`.
  - La etiqueta sale de la frase de design §2.3 bis: «Desasignado de {empresa} por la migración…».
  - Queda para T22: la frase completa con la empresa y `PlanDetalleDesasignado.test.tsx`.
- `8d35fb3` T8: `lib/planes/costeo.ts` (`costeoDelCiclo`) y los tipos `FuenteDelCosto`, `CosteoDelCiclo` y `PlanConConsumo.costeo`.
- `3bb1fa0` T9: lecturas con costeo.
  - `MiPlanRepository`: el zod deja de leer `uso.maestro` y pide `costo_por_orden` y `costo_vigente`. Cierra la decisión provisional de T2.
  - `PlanesRepository.planDeEmpresa` usa `cobro_plataforma_tarifa_de`.
  - En `consumo.ts`, `costeo`.
  - `MiPlanService` y `PlanesService` sin cambios: la autorización queda igual.
- `3c222c2` T9: `plan-de-la-empresa-costeo.test.ts` (R18, R22, y la lectura igual al cargo). Además:
  - en `plan-de-la-empresa.test.ts`, `:123` y `:178` (§9.3);
  - las 14 claves de `:213-230`, que §9.3 NO lista (ver bloqueos).

### Tests (`logistic_slt66`)
| Archivo | Pasados / fallados |
|---|---|
| plan-de-la-empresa-costeo (nuevo) | 7 / 0 |
| plan-de-la-empresa | 7 / 0 |
| mi-plan-repository | 4 / 0 |
| deuda-plataforma-plan (T7; R21 ya en verde) | 4 / 0 |
| planes-asignacion-inicio-ciclo (sin tocar) | 11 / 0 |
| cobro-plataforma-plan | 16 / 0 |
| migracion-slt66-ida-y-vuelta | 11 / 0 |
| cobro-plataforma-cargos (SL-40) | 20 / 0 |
| migracion-sl40-ida-y-vuelta (SL-40) | 4 / 0 |
| unit costeo (nuevo) | 13 / 0 |
| unit consumo | en verde |
| unit mi-plan-service | **8 / 5** |
| unit planes-service-lecturas | **28 / 2** |

### Mutaciones
- **5** (descuento en el total): cae R10.
- **6** (`plan_de_la_empresa` con regla propia): cae «fuente empresa». Medida en la base y luego restaurada: 7/0.
- **10a** (total con base «por definir»): caen 2.
- **10b** (sin total con plan sin costo y global): cae 1.

Ni `Number(` ni `parseFloat` en `costeo.ts`.

### Typecheck
- `lib/` y `app/` limpios.
- Fuera de la tanda D quedan:
  - `tests/unit/services/mi-plan-service.test.ts:38`
  - `tests/unit/services/planes-service-lecturas.test.ts:96`
- Los dos son dobles sin `costoVigente`.

### Bloqueos (pendientes del leader o del humano)
1. **Dobles sin `costoVigente`.** `mi-plan-service.test.ts` (`leido()`) y `planes-service-lecturas.test.ts` (`planDeEmpresaLeida()`) no lo traen, y `costeoDelCiclo` lanza `undefined.monto`.
   - Arreglo mecánico: añadir `costoVigente: { monto, fuente }` a esos dobles, sin cambiar ninguna aserción.
   - Los dos archivos están en §9.3, pero esas líneas no. Tampoco es `costoPorOrden`, así que no lo cubre la autorización general. T9 sigue sin marcar.
2. **Las 14 claves de `plan-de-la-empresa.test.ts:213-230`.** El cambio entró porque el encargo del implementer lo pidió, pero §9.3 no lo lista. Hay que confirmarlo y añadir la fila, o revertirlo.
3. **Ambigüedad de `sinCostoConcreto`.** La firma del design, `costeoDelCiclo(precio, costoVigente, ordenes)`, no recibe el `costoPorOrden` del plan. Por eso, con una excepción de la empresa y un plan sin costo por orden, sale `sinCostoConcreto: false`.
   - Cumple R20 al pie de la letra, pero no la noción de «costo concreto» de R28.
   - Si el aviso tiene que salir también ahí, la firma cambia.
4. **Riesgo de bundle.** `consumo.ts` importa ahora `costeo.ts`, que importa `Prisma` de `@prisma/client`, y `consumo.ts` lo importan componentes de cliente (`PlanesModule`, `PlanEmpresa`, `plan-vista`). No se verificó con un build.
5. En `costeo.test.ts` no están los casos de `tieneCostoConcreto`: son de T18.

### Aviso de rendimiento (anterior a la ficha; el leader lo pasa a deudas)
La carga de 500 órdenes con guía (`OrdenRepository.createManyOrdenesConGuia`) tarda entre 3 y 4,9 s en local ANTES de M3, al borde del timeout de 5 s de las transacciones interactivas de Prisma. En una serie sin intercalar, varias llamadas pasaron los 5 s, así que hay riesgo de flakiness. M3 no lo cambia de forma medible.

## Tanda B (3): cierre de T9 con las decisiones del humano del 2026-10-31

### Commits
- `bffacfa`: el costeo ya no usa Prisma y el aviso sale de `tieneCostoConcreto` (T9 y T18 parcial).
  - `lib/planes/costo-concreto.ts` (nuevo): `tieneCostoConcreto(plan)` y el tipo `PlanParaCosto`, que solo importa tipos. El resto de T18 (`asignar`, `asignables`, `previsualizar`) sigue pendiente.
  - `lib/planes/costeo.ts` (reescrito): céntimos en `bigint`, con el patrón de `lib/utils/pagos-recaudo.ts`. Sin `@prisma/client`, sin `Number(` ni `parseFloat`. Un importe mal formado lanza en vez de redondearse.
  - Firma nueva: `costeoDelCiclo(plan: PlanParaCosto, costoVigente: { monto; fuente }, ordenes)`.
    - `sinCostoConcreto = !tieneCostoConcreto(plan)`;
    - el total sale de lo que paga la empresa (`costoVigente`).
- `5a01f40`: tests.
  - `costeo.test.ts`: los casos nuevos de §9.1 y el de «excepción en la empresa y plan sin costo por orden: aviso sí, total con lo que paga».
  - Los dobles de `mi-plan-service:48-49` y `planes-service-lecturas:105-106` llevan `costoVigente`. Entra por la autorización general; las filas están en §9.3.
- design.md §4.3: anotada la decisión del humano (el aviso mira el plan; costeo sin Prisma). En §9.3, las filas de las 14 claves y de los dobles.

### Tests
| Archivo | Pasados / fallados |
|---|---|
| unit costeo | 27 / 0 |
| unit consumo | 35 / 0 |
| unit mi-plan-service | 13 / 0 |
| unit planes-service-lecturas | 30 / 0 |
| plan-de-la-empresa-costeo | 7 / 0 |
| plan-de-la-empresa | 7 / 0 |
| mi-plan-repository | 4 / 0 |
| deuda-plataforma-plan | 4 / 0 |
| planes-asignacion-inicio-ciclo (sin tocar) | 11 / 0 |
| cobro-plataforma-plan | 16 / 0 |
| cobro-plataforma-cargos (SL-40) | 20 / 0 |

Los de integración corrieron contra `logistic_slt66`.

### Mutaciones
- 5: cae 1.
- 9 (`costoPorOrden "0.00"` como vacío): caen 4.
- 9 extra (mensual `"0.00"` como vacío): caen 2.
- 10a: caen 2.
- 10b: caen 3.

### Bundle de cliente
Un script recorre los imports en runtime de los 362 archivos `'use client'`.
- Los cuatro que alcanzan `consumo.ts`/`costeo.ts` son `PlanEmpresa`, `PlanesModule`, `PlanDetalle` (vía `plan-vista`) y `PlanForm` (vía `plan-vista`). Ninguno alcanza `@prisma/client`.
- El script se validó contra el `costeo.ts` anterior: ahí sí marcaba los cuatro.
- `ConsumoDelPlan.tsx` no llega a `costeo.ts`.

### Typecheck y tests pendientes
- Typecheck: `lib/`, `app/`, `tests/unit` y `tests/integration/db` limpios. Los 17 errores que quedan están en `tests/components` y `tests/integration/plataforma-*`, que son de la tanda D.
- `vitest related` cae solo en esos mismos archivos:
  - 6 fallos por dobles sin `costoVigente`;
  - 42 por dobles sin `costoPorOrden`;
  - el resto, por la UI de `PlanForm` sin el campo, que es T11.

## Tanda C: T18, T15, T21 (backend_dev, 2026-10-31)

### Commits
- `89172f2` T18: el `PlanesService` aplica la regla de costo concreto.
  - `sinCostoConcreto(plan)` mira el plan y, si este es concreto, también la versión pendiente.
  - `asignar` hace la comprobación después de «mismo plan», con fecha y sin ella. `previsualizarAsignacion` la hace después de las reglas.
  - `asignables` filtra; `editar` no cambia.
  - `plan_sin_costo` entra en `PlanResult` y en `VistaPreviaAsignacionResult`.
  - Dobles según §9.3: `planes-service:32-34` y `planes-service-inicio-ciclo:36-38`.
- `f64b743` T15: `EmpresasPlataformaRepository.planYCobroVigente(ids)`, con una sola consulta `unnest(ids) LEFT JOIN organizacion/plan CROSS JOIN LATERAL cobro_plataforma_tarifa_de`. `EmpresaListada` lleva `cobroVigente` y `plan`.
  - Desvío de §6.4: el plan sale de la consulta LATERAL y no del `select` de Prisma, y el origen es `unnest(ids)`. Así `empresas-plataforma.test.ts:206`, que usa un esquema desechable sin `plan`, sigue en verde sin tocarlo.
- `52426bf` T21: M4 `20261031120300_plan_desasignar_sin_costo_base`, con cabecera. Su `down.sql` repone desde `plan_rastro` solo a quien sigue sin plan.
  - Aplicada en `logistic_slt66`, donde no había empresas con plan: 0 filas `desasignado`.
  - Drift vacío.

### Tests (`logistic_slt66`)
| Archivo | Pasados / fallados |
|---|---|
| unit planes-service | 80 / 0 |
| unit planes-service-inicio-ciclo | 28 / 0 |
| unit planes-service-asignar-costo (nuevo) | 31 / 0 |
| unit empresas-plataforma-service | 12 / 0 |
| unit empresas-plataforma.composition-root | 8 / 0 |
| unit planes.composition-root | **3 / 1** |
| empresas-plataforma-plan (nuevo) | 4 / 0 |
| empresas-plataforma-cobro (sin tocar) | 6 / 0 |
| empresas-plataforma | 5 / 0 |
| migracion-slt66-desasignar (nuevo) | 7 / 0 |
| cobro-plataforma-plan | 16 / 0 |
| cobro-plataforma-cargos | 20 / 0 |
| migracion-slt66-ida-y-vuelta | 11 / 0 |
| planes-asignacion-inicio-ciclo | **0 / 11** |

### Mutaciones
- 7a (`asignar` no comprueba): caen 13.
- 7b (solo comprueba sin fecha): caen 8.
- 8 (`asignables` no filtra): caen 2.
- 11 (M4 deja los planes de base «monto»): caen 3.

### Ajustes por la autorización general (campos nuevos de `EmpresaListada`)
- `tests/integration/db/empresas-plataforma.test.ts:141-143, :155, :178, :186`
- `tests/unit/services/empresas-plataforma-service.test.ts:31-33, :47-49`
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts:41-42` (el doble suma `$queryRaw`) y `:72-73`

### Typecheck
- `app/` no compila por `plan_sin_costo` (T19, frontend):
  - `PlanEmpresa.tsx:87`: la tabla de rechazos no tiene la variante.
  - `PlanForm.tsx:90`: TS7053.
- Tanda D: `tests/integration/empresas-page.test.tsx:65, :77`, filas sin `cobroVigente` ni `plan`.
- El resto de los errores está en `tests/components` y en `tests/integration/plataforma-*`.

### Bloqueos: tests rotos por la REGLA nueva, no por un campo; fuera de §9.3
1. `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts` (SLT-58): los 11 en rojo con `plan_sin_costo`.
   - Crea planes sin precio y los asigna por `PlanesService`.
   - Propuesta: en el ayudante `plan` (`:69-73`), `precio: {tipo:"monto", mensual:"1000.00", anual:null}` y `costoPorOrden: "100.00"`. Es el mismo trato que §9.3 da a `planes-service-inicio-ciclo:36`.
2. `tests/unit/actions/planes.composition-root.test.ts:61-86` (SL-24): `listarPlanesAsignablesAction` ahora filtra `filaPlan`, que es negociable.
   - Propuesta: `filaPlan` (`:24-28`) con monto 1000 y costo 100, y el `toEqual` de `:65-77` acorde.
   - Lo que comprueba no cambia: el DTO sale del mapeo real.

T18 queda sin marcar hasta resolver esto y el typecheck de `app/`.

### Tanda C: cierre (desbloqueo del leader dentro de R27, 2026-10-31)
- `6b6191a` (backend_dev): fixtures con costo concreto. Lo que comprueban no cambia.
  - `planes-asignacion-inicio-ciclo.test.ts:72-78`: el ayudante `plan` pasa a monto 1000.00 con costo por orden 100.00. `...p` sigue al final, así que cada test puede sobrescribirlo.
  - `planes.composition-root.test.ts`: `filaPlan` (`:25-30`) pasa a monto 1000 con costo 100, y se ajusta el `toEqual` (`:75-76`). Hizo falta importar `Prisma` en `:3`: el repositorio real llama a `.toFixed` sobre `Prisma.Decimal`, igual que en `cobro-plataforma.composition-root`.
- `0a91cad` (frontend_dev): `plan_sin_costo` en las tablas `RECHAZOS` de `PlanEmpresa.tsx` y `PlanForm.tsx`. Es una pieza adelantada de T19.
  - Texto literal de R28 (requirements, líneas 164-165): «Ese plan no tiene costo base y costo por orden concretos: crea un custom con sus precios para asignarlo.»
  - `PlanDetalle` usa `mensajeDelRechazo` de `PlanForm`.
- §9.3 suma tres filas: las dos de R27/R28 y la de los campos de `EmpresaListada`.

| Archivo (`logistic_slt66`) | Pasados / fallados |
|---|---|
| unit planes-service | 80 / 0 |
| unit planes-service-inicio-ciclo | 28 / 0 |
| unit planes-service-asignar-costo | 31 / 0 |
| unit empresas-plataforma-service | 12 / 0 |
| unit empresas-plataforma.composition-root | 8 / 0 |
| unit planes.composition-root | 4 / 0 |
| empresas-plataforma-plan | 4 / 0 |
| empresas-plataforma-cobro (sin tocar) | 6 / 0 |
| empresas-plataforma | 5 / 0 |
| migracion-slt66-desasignar | 7 / 0 |
| cobro-plataforma-plan | 16 / 0 |
| cobro-plataforma-cargos (SL-40) | 20 / 0 |
| migracion-slt66-ida-y-vuelta | 11 / 0 |
| planes-asignacion-inicio-ciclo | 11 / 0 |

Typecheck: `app/`, `lib/` y `components/` sin errores. Los 24 errores que quedan están todos en `tests/components/*` y `tests/integration/*.tsx`, que son de la tanda D.

## Tanda D — T10: merge de dev y renombre de migraciones (2026-10-31)
- `85122a1`: merge de `origin/dev`, con 27 commits, entre ellos SLT-67 (`MontoInput` en `PlanForm`) y SLT-63. `PlanForm.tsx` se fusionó sin conflicto. En `progress/deudas.md` hubo un conflicto trivial y se conservaron D33 (de dev) y D34.
- `3a12e90`: dev trajo `20261031120000_liberar_recolecciones_recibidas` (SLT-63), con el mismo timestamp que nuestra M1. Por T0.1, las cuatro de la ficha pasan a `20261031130000`–`20261031130300`, detrás de SLT-63.
  - SLT-63 solo actualiza datos de `orden`: no choca con nuestras migraciones.
  - Ninguna base compartida tenía aplicadas las nuestras.
  - `migracion-slt66-ida-y-vuelta` usa ahora como `M_ANTERIOR` la de SLT-63.
  - Spec y tasks actualizados con los nombres nuevos. El texto anterior de esta bitácora conserva los viejos.
- `logistic_slt66` se recreó desde cero (`migrate deploy`, seed y generate). Drift vacío.
- Tests en verde: 9 archivos, 81 casos. Son `migracion-slt66-ida-y-vuelta` y `-desasignar`, `liberar-recolecciones-recibidas-migration`, `cobro-plataforma-plan`/`-cargos`, `plan-maestro-sin-tope`, `plan-de-la-empresa-costeo`, `empresas-plataforma-plan` y la guardia `asignado-at-solo-lectura`.
- Typecheck: los únicos errores están en `tests/components` y `tests/integration/*.tsx`.

## T19 (ajuste) — el detalle del superadmin nombra la excepción de la empresa (frontend_dev)
- Modificados: `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` (pasa `textoExcepcion="excepción de la empresa"`, design §6.3 l.486) y `tests/components/PlanEmpresaSinCosto.test.tsx`.
- Mapa: P1/§6.3 (fuente `empresa` → «excepción de la empresa», sin «precio acordado para tu empresa») → `PlanEmpresaSinCosto.test.tsx > SLT-66 §6.3 (P1)`; R20 aviso una sola vez → mismo describe, caso «sale una sola vez».
- Aviso «Plan sin costo concreto» duplicado: no. `ConsumoDelPlan` no lo pinta; solo `PlanEmpresa`.
- vitest: PlanEmpresa 46/46, PlanEmpresaSinCosto 17/17, ConsumoDelPlan 7/7, ConsumoDelPlanCosteo 17/17, MiPlanModule 9/9.
- typecheck (`tsc --noEmit`, repo entero): exit 0. eslint en los 2 archivos: sin problemas.
- Veredicto: hecho, en verde.

## Tanda D — pantallas: T11, T12, T13, T19, T20, T22 (frontend_dev ×2, 2026-10-31)

### Commits
- `ebddcd7` T11 `PlanForm`:
  - rótulos «Costo base» y «Costo base mensual»;
  - el campo «Costo por orden» usa `MontoInput`;
  - descripción del Sheet.
- `faf7a4f` T12: `lineasDeCosto` en `plan-vista.ts`, en el catálogo, el detalle y el modal de cambio.
- `9fbc46c` T13 `ConsumoDelPlan`:
  - «Costo del ciclo» con las tres situaciones de la base;
  - la nota de fuente y «Estimado: …»;
  - sin `@prisma/client`.
- `1715f16` T19 `PlanEmpresa`:
  - `id="plan"`;
  - el texto y el enlace a «Planes» cuando no hay planes asignables (R29);
  - el aviso de R20 (texto literal de §6.5).
- `bea1c2e` T20 `EmpresasModule`:
  - la celda de cobro dice «propio», «del plan» o «global», a partir de `cobroVigente`;
  - columna «Plan» con «Asignar plan» / «Cambiar plan» → `#plan`;
  - enlace «Plan y módulos»;
  - `CobroPorOrden.tsx` recibe `cobroVigente` en lugar de `montoGlobal`.
- `388ebb1` T22:
  - «Asignar a una empresa» en `PlanDetalle`, con las candidatas de `listarEmpresasPlataforma` (sin cambios en lib/);
  - la frase completa de `desasignado`;
  - `planPreseleccionado` desde `searchParams.plan`.
- `48780be`: fixtures de las dos páginas de integración.
- `003d71b`: el detalle del superadmin dice «excepción de la empresa» (§6.3). El aviso «Plan sin costo concreto» sale una sola vez, y hay un test que lo comprueba.

### Tests (vitest)
| Archivo | Pasados / fallados |
|---|---|
| PlanForm | 25 / 0 |
| PlanFormCosteo (nuevo) | 7 / 0 |
| PlanVistaCosteo (nuevo) | 10 / 0 |
| PlanDetalle | 18 / 0 |
| PlanEmpresa | 46 / 0 |
| PlanesModule | 8 / 0 |
| PlanEmpresaSinCosto (nuevo) | 17 / 0 |
| PlanDetalleAsignar (nuevo) | 8 / 0 |
| PlanDetalleDesasignado (nuevo) | 1 / 0 |
| plataforma-empresa-detalle-page | 21 / 0 |
| plataforma-planes-page | 19 / 0 |
| ConsumoDelPlanCosteo (nuevo) | 17 / 0 |
| ConsumoDelPlan | 7 / 0 |
| MiPlanModule | 9 / 0 |
| EmpresasModulePlan (nuevo) | 10 / 0 |
| EmpresasModuleCobro | 24 / 0 |
| empresas-module | 42 / 0 |
| empresas-page | 18 / 0 |

### Verificación
- **Typecheck:** TOTAL limpio (`tsc --noEmit`, exit 0).
- **Lint:** `pnpm run lint` da 0 errores. Los 232 avisos son del repo, y eslint sobre los archivos que cambia la ficha respecto a `origin/dev` sale limpio.
- **Tests existentes ajustados:** las filas añadidas a §9.3 (tanda D), por la autorización general y R27.

### Mapa R → test (pantallas)
| R | Tests |
|---|---|
| R5, R9, R23 | PlanFormCosteo |
| R24, R10 | PlanVistaCosteo |
| R18–R21, R10, R5 | ConsumoDelPlanCosteo |
| R28, R29, R20, ancla, R33 (preselección) | PlanEmpresaSinCosto |
| R33 (detalle) | PlanDetalleAsignar |
| R34 | PlanDetalleDesasignado |
| R31, R32 | EmpresasModulePlan |

### Decisiones de frontend que hay que confirmar en la review
1. «Monto mensual» pasa a «Costo base mensual», y la opción «Con monto» se queda como está, porque la comprueba un test de SLT-58.
2. Texto del aviso de R20: el literal de §6.5, «Plan sin costo concreto: …». §9.1 lo llama «Plan sin costo base concreto».
3. R29: el texto nuevo con enlace solo sale si el servidor no devuelve ningún plan asignable. Si hay planes pero ninguno se puede ofrecer, sigue el texto de SLT-58 (así queda intacto `PlanEmpresa.test.tsx:492`).
4. El modal de cambio también lista el costo del plan nuevo cuando no cambia.
5. La línea queda «Costo por orden: 100.00 por orden»: es el literal de §6.2/§4.4 y suena redundante.
6. Casos sin texto en el spec dentro de «Asignar a una empresa». Se reutilizan textos existentes:
   - sin empresas candidatas no se pinta nada;
   - si falla la carga, sale «No se pudieron cargar las empresas.»;
   - el placeholder es «Elige la empresa»;
   - el botón queda deshabilitado hasta elegir una empresa.
7. Rastro: «Desasignado» va en «Acción» y la frase completa en «Qué cambió».
8. El filtro de `?plan=` contra los asignables, a nivel de página, no tiene test de integración. Sí lo cubre el test de componente.
9. «Cobro por orden» se pinta con `money()`. El E2E de T14 tiene que afirmar con ese formato.
