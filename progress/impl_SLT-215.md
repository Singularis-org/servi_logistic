# impl SLT-215 — Planes: niveles de beneficio por volumen de órdenes

## Tanda 1 (backend_dev): T1 y T2 — 2026-11-19

### Archivos

Nuevos:
- `lib/planes/niveles.ts` — `MAX_NIVELES`, `Nivel`, `DescuentoNivel`, textos de error, `descuentoNivelSchema`,
  `nivelSchema`, `nivelesSchema`, `descuentosDelNivel`, `textoDelNivel`, `textoDeLosNiveles`, `SIN_NIVELES`.
- `lib/planes/importes.ts` — hoja con `porcentajeSchema`, `SOLO_UNA_FORMA` e `importeCanonico` (ver Desviaciones).
- `db/migrations/20261121120000_plan_nivel_job_enum/{migration,down}.sql`
- `db/migrations/20261121120100_plan_nivel/{migration,down}.sql`
- `tests/unit/planes/niveles.test.ts`
- `tests/integration/db/plan-nivel.test.ts`
- `tests/integration/db/migracion-plan-nivel-ida-y-vuelta.test.ts`

Modificados:
- `lib/types/planes.ts` — `niveles` opcional en `crearPlanSchema` y `edicionDelPlan` (lo hereda
  `versionPlanSchema`), en `VersionPlan`, `PlanDTO` y `PlanVista`; reexporta `porcentajeSchema` y `SOLO_UNA_FORMA`.
- `lib/planes/rastro.ts` — reexporta `importeCanonico` desde `importes.ts` (sin cambio de comportamiento).
- `db/schema.prisma` — `PlanNivel`, `PlanNivelEmpresa`, `PlanNivelHistorial` y sus relaciones.
- `lib/db/modelos-de-negocio.ts` — `PlanNivel` de plataforma; `PlanNivelEmpresa` y `PlanNivelHistorial` de negocio.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` y `tests/unit/scripts/verificar-rls-despliegue.test.ts` —
  92 → 94 tablas de negocio (precedente: SLT-60).
- `tests/integration/db/orden-traspaso-migration.test.ts` — las dos migraciones nuevas en la lista del árbol.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R1 | `tests/unit/planes/niveles.test.ts` («la lista de niveles», «los niveles en los esquemas del plan»); `tests/integration/db/plan-nivel.test.ts` («R1: guarda los niveles…») |
| R2 | `niveles.test.ts` («R2 — los descuentos de un nivel»: 10 % + 10 %, nivel 0) |
| R3 | `niveles.test.ts` («R3 — la meta»: 0, negativa, decimal, NaN, no creciente) |
| R4 | `niveles.test.ts` («R4 — el descuento»: % 0, 100,01, 100, 0,01; monto 0, 0,01; las dos formas) |
| R5 | `niveles.test.ts` («R5 — hasta 10 niveles»: 11) |
| R6 | `plan-nivel.test.ts` (cada CHECK; `servi_app` sin SELECT/INSERT/UPDATE/DELETE en `plan_nivel`); `migracion-plan-nivel-ida-y-vuelta.test.ts` (RLS y privilegios tras subir) |
| R7 (base) | `migracion-plan-nivel-ida-y-vuelta.test.ts` (CHECK de pasos admite `niveles`; al bajar, vuelve a 7). El paso del formulario es de T5/T8 |
| R18 | `niveles.test.ts` (versión sin `niveles` valida y no trae la clave) |
| R20, R21 (textos) | `niveles.test.ts` («R21, R20 — los textos») |
| R29 (red de la base) | `plan-nivel.test.ts` (único parcial `plan_nivel_historial_un_cierre_por_mes`) |
| R35 | `plan-nivel.test.ts` (CHECK de motivo, niveles, órdenes, mes y órdenes) |
| R36 | `plan-nivel.test.ts` (A no ve nivel ni historial de B; nadie inserta, cambia ni borra; `servi_app` no ejecuta las cinco funciones; sin cambio de empresa SL017) |
| R37 | `migracion-plan-nivel-ida-y-vuelta.test.ts` (relleno: nivel 0, cuenta 0, entrada = ancla, mes de la migración, sin historial; C sin plan sin fila) |

R22–R28, R30–R34 viven en las funciones de la migración pero sus tests son de T3 y T6.

### Salida real

- `pnpm run typecheck`: sin errores (`tsc --noEmit`, salida vacía).
- `pnpm exec eslint` sobre los 11 archivos tocados: sin errores (exit 0).
- `pnpm run test:guardias`: 360 archivos pasan, 5412 tests pasan, 1 saltado.
- `vitest run` unit (niveles, verificar-rls-despliegue, rastro, beneficios, planes-schema-costo-porcentual,
  mensajes-periodo): 6 archivos, 110 tests pasan.
- `vitest run --no-file-parallelism` integración (plan-nivel, migracion-plan-nivel-ida-y-vuelta,
  orden-traspaso-migration, plan-beneficio): 4 archivos, 36 tests pasan (con base, ninguno saltado).

### Base de datos

`servi_logistic_slt215` en el Postgres local del `.env` del checkout principal: misma URL con solo el nombre de la
base cambiado (`DATABASE_URL` y `DIRECT_URL` exportadas en la sesión; el worktree no tiene `.env`). Recreada con
`DROP/CREATE`, `pnpm exec prisma migrate deploy` y `pnpm run db:seed`. `node_modules` del worktree es una junction al
del checkout principal.

### Desviaciones del design

1. **`lib/planes/importes.ts` (archivo nuevo).** `lib/types/planes.ts` importa `nivelesSchema` y `niveles.ts`
   necesitaba `porcentajeSchema`, `SOLO_UNA_FORMA` (de `planes.ts`) e `importeCanonico` (de `rastro.ts`, que a su
   vez importa valores de `planes.ts` en el nivel del módulo): un ciclo que deja un módulo a medio evaluar. Las tres
   piezas pasan a una hoja y `planes.ts`/`rastro.ts` las reexportan con su nombre: ningún importador cambia.
2. **`job_tipo` en Prisma, a T7.** La migración añade `plan_niveles_cerrar` en la base, pero el valor NO entra
   todavía en `enum JobTipo` de `db/schema.prisma`: con él, `MODULO_POR_JOB` (Record exhaustivo) rompe el typecheck y
   la guardia `jobs-handler-por-tipo` pide su handler, que son de T7. T7 lo añade junto con el handler.
3. **`@@index([organizacionId])` en `PlanNivelEmpresa`** (y su índice SQL) aunque la clave ya es `organizacion_id`:
   la guardia `organizacion-en-modelos` lo exige a toda tabla de negocio (mismo caso que `tarifa_activacion`).
4. **Triggers `<tabla>_sin_cambio_de_empresa`** en las dos tablas de negocio: los exige la guardia
   `fk-misma-empresa` (el design solo descartaba los `sme_*`, que siguen sin hacer falta).
5. **`plan_nivel_recalcular` sin fila de la empresa** devuelve NULL sin tocar nada, y rechaza (22023) un motivo que
   no sea `cambio_niveles` o `cambio_plan`. El design no decía qué hacer sin fila; T6 puede revisarlo.
6. **Textos de R21:** el monto y el porcentaje van con `importeCanonico` (dos decimales: «−10.00 %», «−1500.00»),
   como el costo por orden y los descuentos del período; la meta va sin separador de miles.

### Veredicto

T1 y T2 hechas; typecheck, lint, guardias y los tests de la tanda en verde.

## Tanda 2 (backend_dev): T3, T4 y T5 — 2026-11-19

### Archivos

Nuevos:
- `tests/integration/db/plan-nivel-cierre.test.ts` — T3: órdenes efectivas y cierre mensual contra Postgres real.

Modificados (producción):
- `lib/repositories/PlanesRepository.ts` — `INCLUIR.niveles`, `nivelDe`/`filaDelNivel`, `aDTO`, `crearEnTx` (R15),
  `aplicarVersion` (R17, R18), `versionDelPlan`, y `niveles` en la vigente de `planDeEmpresa` (ver Desviaciones).
- `lib/planes/rastro.ts` — `"niveles"` en `CampoDelPlan` y `CAMPOS` tras `"beneficios"`; `nivelesCanonicos` en
  `planCanonico`; un alta sin niveles omite la clave (R19).
- `lib/planes/mensajes.ts` — `CambioDelPlanParaCorreo.niveles` y la línea «Niveles por volumen: … → …» (R20, P5).
- `lib/planes/consumo.ts` — `cambioPendienteDelPlan` no compara niveles si la vigente no los trae (ver Desviaciones).
- `lib/types/plan-borrador.ts` — paso `niveles` en `PASOS_DE_CREAR`/`PASOS_DE_EDITAR`, `nivelesDelPasoSchema` en
  `ESQUEMAS_DE_*`, `ValoresDeNiveles`, `PasosDeCrear` y las uniones de `guardarPasoBorradorSchema` (R7, R10, R12).
- `lib/planes/borrador.ts` — `peticionDeCrear`/`peticionDeEditar` llevan `niveles` (R15, R16).

Modificados (tests):
- `tests/integration/db/plan-nivel.test.ts` — bloque T4 (R15, R17, R18, R19 en el rastro real).
- `tests/unit/planes/rastro.test.ts` — bloque SLT-215 (R19, R20); los casos de antes, sin cambios.
- `tests/unit/types/plan-borrador-schema.test.ts` — bloque del paso «Niveles» (R7, R10, R3–R5); la aserción de
  tuplas de SLT-214 sigue a la tupla nueva.
- `tests/integration/db/plan-borrador-confirmar.test.ts` — el paso en los helpers y R12, R15, R16.
- `tests/unit/planes/plan-borrador.test.ts` — las tuplas y los pasos con `niveles` (fuera de la lista de
  `tasks.md`: sin él no compila, porque `PasosDeCrear` exige el paso nuevo).

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R7 (servidor) | `plan-borrador-schema.test.ts` («R7: va justo después de «Beneficios»…»); `plan-borrador.test.ts` (tuplas) |
| R10 | `plan-borrador-schema.test.ts` (R9/R10 por modo, R3, R4, R5 con sus claves; `valores.niveles.<i>.<campo>`) |
| R12 | `plan-borrador-confirmar.test.ts` («SLT-215 R12: … pasos_pendientes con niveles»); `plan-borrador.test.ts` (`pasosQueFaltan`) |
| R15 | `plan-nivel.test.ts` («R15: crear con 3 niveles…», «R15: … no crecen se rechaza»); `plan-borrador-confirmar.test.ts` («SLT-215 R15») |
| R16 | `plan-borrador-confirmar.test.ts` («SLT-215 R16»); `plan-nivel.test.ts` (R17: programar no toca la lista). La mitad «cada empresa corre la de su versión» es T6 |
| R17 | `plan-nivel.test.ts` («R17: promover…», «R17: … lista vacía») |
| R18 | `plan-nivel.test.ts` («R18: … sin `niveles`…»); `rastro.test.ts` (versión sin clave = sin cambio) |
| R19 | `rastro.test.ts` (alta sin/con niveles, ediciones, normalización); `plan-nivel.test.ts` (rastro real `creado`/`cambio_programado`/`cambio_aplicado`) |
| R20 | `rastro.test.ts` («R20: la línea «Niveles por volumen…»», «R20: el cambio pendiente de «Mi plan»…») |
| R22 | `plan-nivel-cierre.test.ts` (6 casos de una orden, dos cargos = una, 152 − 3 = 149 contra 150 con control 150, guardia del enum) |
| R23 | `plan-nivel-cierre.test.ts` («R23: … 05:59 UTC del día 1…») |
| R24 | `plan-nivel-cierre.test.ts` («R24: entrada el día 15…») |
| R25 | `plan-nivel-cierre.test.ts` («R25: del nivel 0 al 2 directo…») |
| R26, R27 | `plan-nivel-cierre.test.ts` («R26, R27: …», seis meses seguidos) |
| R28 | `plan-nivel-cierre.test.ts` («R28: en el nivel 0 no se baja…», «R28: … sin fila…») |
| R29 | `plan-nivel-cierre.test.ts` (tres meses en orden y repetir; día 5 = día 1 con anulación y cancelación tardías; dos cierres a la vez con concurrencia forzada) |
| R33 (la entrada) | `plan-nivel-cierre.test.ts` (R24: `plan_nivel_tomar_plan` deja nivel 0, cuenta 0 y el mes de la entrada como primero). El resto de R33 es T6 |

R30 (seguir con las demás empresas) vive en el trabajo diario: es de T7.

Otros tests adaptados al paso nuevo y a la fila de `INCLUIR` (sin cambiar lo que miden):
`tests/unit/services/plan-borrador-service.test.ts` (los pasos del borrador llevan `niveles`),
`tests/unit/repositories/planes-repository-tipo-cobro.test.ts` y `tests/unit/actions/planes.composition-root.test.ts`
(la fila doble lleva `niveles: []`, como `beneficios: []` de SLT-214), y
`tests/integration/db/migracion-plan-nivel-ida-y-vuelta.test.ts:309` (de T2: la consulta a `pg_enum` acota el esquema
con `pg_namespace`; la guardia `catalogo-postgres-acota-esquema` lo pedía).

### Salida real

Con el cliente de Prisma generado con el esquema de la rama (hasta las 18:09):
- `pnpm run typecheck` tras T4: sin errores. Tras T5: 4 errores, todos en el cliente del formulario, que es de T8:
  `PlanForm.tsx:251` y `plan-form/usar-borrador.ts:134,140,156` (`"niveles"` no está en `IdPasoGuardable`, que sale
  de `IdPaso` de `plan-form/estado.ts`).
- `vitest run --no-file-parallelism` integración: `plan-nivel-cierre.test.ts` 18/18; `plan-nivel.test.ts` 12/12;
  `plan-borrador-confirmar.test.ts` 16/16.
- `vitest run` unit: `rastro.test.ts` 29/29; `plan-borrador.test.ts` + `plan-borrador-schema.test.ts` 73/74 (el rojo
  es ambiental, abajo); `plan-borrador-service`, `planes-repository-tipo-cobro`, `planes.composition-root`,
  `planes-previsualizar-cambio` 63/64 (el mismo rojo ambiental).
- `eslint` sobre los 17 archivos tocados: 0 errores, 0 avisos.
- `pnpm run test:guardias`: 356 archivos pasan, 1 rojo (`catalogo-postgres-acota-esquema`, por el test de T2), que
  ya pasa tras el arreglo (7/7). 5384 tests pasan.
- `vitest related --run` sobre los 6 archivos de producción (sin base: la integración se salta): 395 archivos, 4957
  pasan, 77 fallan en 16 archivos. 66 son de componentes de planes (11 archivos: `PlanForm*`, `PlanDetalle`,
  `PlanesModule`): fallan porque el servidor ya pide el paso «niveles» y el formulario aún no lo tiene. **Los mismos 11
  archivos pasan 192/192 sobre HEAD** (worktree temporal ya borrado). Los arreglan T8 y T10. Los otros 11 eran los
  dobles y pasos de arriba (ya adaptados) y los rojos ambientales.

Rojos ambientales, no de esta tanda:
1. **zod.** El `node_modules` (junction al checkout principal) trae zod 4.6.7 y el lockfile de la rama fija 4.4.3.
   Cambia la ruta del error de un `record` con clave de enum (`topes.porRol` en vez de `topes.porRol.superadmin`):
   `plan-borrador-schema.test.ts` («topes: rol sin tope») y `planes-previsualizar-cambio.test.ts` (R22).
2. **Cliente de Prisma.** A las 18:09 se regeneró el cliente compartido desde el checkout principal, con un esquema sin
   `PlanNivel*`. Desde entonces `tsc` da errores de tipo en todo lo que usa esos modelos (también los tests de T2) y la
   integración falla con `PrismaClientValidationError` o `planNivel undefined`. No lo regeneré: pisaría el del
   checkout principal. Hay que hacer `pnpm exec prisma generate` con el esquema de la rama antes de repetir la
   integración y el typecheck.

### Desviaciones

1. **`lib/planes/consumo.ts` (fuera de la lista de `tasks.md`).** `cambioPendienteDelPlan` compara la versión vigente
   con la programada. «Mi plan» la lee de `plan_de_la_empresa`, que no trae niveles (son de SLT-216). Sin el ajuste,
   cada cambio programado con niveles saldría como «Niveles por volumen: Sin niveles → …» aunque no los cambie. Si la
   vigente no trae `niveles`, no se comparan. `planDeEmpresa` (detalle de empresa del superadmin) sí los pasa en su
   `vigente`, así que ahí la línea sale bien. Test: `rastro.test.ts` («R20: el cambio pendiente de «Mi plan»…»).
2. **T5 deja rojo el cliente hasta T8/T10.** Añadir `niveles` a `PASOS_DE_*` es lo que pide T5, pero el formulario
   (de T8) no conoce el paso: 4 errores de tipo y 66 tests de componentes rojos hasta que lleguen T8 y T10. No toqué
   `app/`. T5 no puede ir sola a un commit con el gate en verde: va junto con T8 y T10.
3. **`plan_nivel_recalcular` sin fila** (anotado en la tanda 1): T3 no lo toca; sigue para T6.

### Veredicto

T3, T4 y T5 hechas con sus tests en verde cuando el cliente de Prisma corresponde a la rama; quedan dos bloqueos
ambientales (cliente de Prisma y zod compartidos) y el rojo esperado del formulario hasta T8/T10.
