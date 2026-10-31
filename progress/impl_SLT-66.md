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
