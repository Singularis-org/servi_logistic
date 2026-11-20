# impl SLT-215 — Planes: niveles de beneficio por volumen de órdenes

## Tanda 1 (backend_dev): T1 y T2 — 2026-11-19

### Archivos

Nuevos:
- `lib/planes/niveles.ts` — `MAX_NIVELES`, `Nivel`, `DescuentoNivel`, textos de error, `descuentoNivelSchema`,
  `nivelSchema`, `nivelesSchema`, `descuentosDelNivel`, `textoDelNivel`, `textoDeLosNiveles`, `SIN_NIVELES`.
- `lib/planes/importes.ts` — hoja con `porcentajeSchema`, `SOLO_UNA_FORMA` e `importeCanonico` (ver Desviaciones).
- `db/migrations/20261121140000_plan_nivel_job_enum/{migration,down}.sql`
- `db/migrations/20261121140100_plan_nivel/{migration,down}.sql`
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

## Tanda 3 (front): T8, T9 y T10 — 2026-11-19

### Archivos

Nuevos:
- `app/(app)/plataforma/planes/_components/plan-form/PasoNiveles.tsx` — lista editable (R8, R9): «Nivel n», meta,
  `RadioGroup` porcentaje/monto fijo, valor (sufijo «%» o `MontoInput`), «Quitar nivel n», «Agregar nivel»
  deshabilitado con `MAX_NIVELES`; foco a la meta nueva; errores con `FieldError` bajo su campo.
- `tests/components/PlanFormNiveles.test.tsx`

Modificados (producción):
- `plan-form/estado.ts` — `NivelEnPantalla`, `nuevaClaveDeNivel`, `nivelesEnPantalla`, `nivelesDe` (meta no entera →
  `NaN`), `Formulario.niveles`, `inicial` (R13), `versionDe`, `camposEnOrden` (`niveles`, `niveles.<i>.meta`,
  `niveles.<i>.descuento.<tipo>`), `IdPaso`/`pasosDe` con «Niveles» tras «Beneficios», `pasoDeLaClave`.
- `plan-form/borrador.ts` — `valoresDelPaso` y `formDelBorrador` del paso `niveles` (R11).
- `plan-form/textos.ts` — textos de design §7 y `nivelEscrito` (ver Desviaciones).
- `plan-form/PasoRevisar.tsx` — fila «Niveles» tras «Beneficios» (R14); al editar, solo si cambian, «antes → después».
- `PlanForm.tsx` — `case "niveles"`.
- `PlanesModule.tsx`, `plan-vista.ts` (`lineasDeNiveles`) — columna «Niveles» tras «Beneficios», `SOLO_DESDE_MD` (R21).
- `[planId]/_components/PlanDetalle.tsx` — alta «Niveles: …» (R19) y la edición pasa `niveles` a
  `lineasDeCambioDelPlan` («Niveles por volumen: …», R20).

Modificados (tests, T10 y ampliaciones):
- `tests/components/plan-form-pasos.ts` (comentario; `MAX_PASOS` = 10 ya cubre 9 pasos),
  `PlanFormBorrador.test.tsx` (contadores 7/8; «5 de 7» en el de `pasos_pendientes`), `PlanFormPasos.test.tsx` (R7),
  `PlanForm.test.tsx` (`niveles: []` en las tres cargas útiles, como hizo SLT-214 con `beneficios`),
  `PlanFormBeneficios.test.tsx` (tras «Beneficios» viene «Niveles»), `PlanFormRevisar.test.tsx` (fila «Niveles»),
  `PlanesModule.test.tsx` (R21 + celda «Sin niveles» y clases móviles), `PlanDetalle.test.tsx` (R19, R7),
  `tests/unit/planes/plan-form-borrador.test.ts` (R11, R3, R13, R7).
- E2E (no corridos, los verifica el CI): `planes-borrador` (Niveles en crear y editar; contadores 7 y 8),
  `planes-superadmin`, `planes-costeo`, `planes-costo-porcentual`, `planes-beneficios`.

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R7 | `PlanFormPasos.test.tsx` («R7: pasos al crear / al editar»); `plan-form-borrador.test.ts` («R7: los pasos que se guardan…»); `PlanesModule.test.tsx` y `PlanDetalle.test.tsx` («R6: el panel abre el formulario por pasos») |
| R8 | `PlanFormNiveles.test.tsx` («R8: agregar al final en porcentaje…», «R8: con 10 niveles…») |
| R9 | `PlanFormNiveles.test.tsx` («R9: la lista vacía…», «R9: quitar el último…») |
| R10 | `PlanFormNiveles.test.tsx` (tres «R10: …»: meta 0, meta que no crece, % 150, monto 0, meta 1.5, error del servidor) |
| R11 | `plan-form-borrador.test.ts` («SLT-215 — el paso «Niveles»»: ida y vuelta, vacía, borrador sobre el plan) |
| R13 | `PlanFormNiveles.test.tsx` («R13: el paso abre con los niveles vigentes…», «R13: sin tocarlos…»); `plan-form-borrador.test.ts` («R13: …») |
| R14 | `PlanFormNiveles.test.tsx` («R14: al crear lista…», «sin niveles», «al editar antes → después», «se queda sin niveles»); `PlanFormRevisar.test.tsx` («R22: al crear lista los valores finales») |
| R19 | `PlanDetalle.test.tsx` («SLT-215 R19 — los niveles en el rastro del plan») |
| R21 | `PlanesModule.test.tsx` («SLT-215 R21 — la columna «Niveles»»: orden, % y monto, «Sin niveles»; y «R13: una fila por plan…») |

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin salida, exit 0.
- `pnpm exec eslint` sobre los 9 de producción, los 10 de tests y los 5 E2E: «ESLint: No issues found», exit 0.
- `vitest run` de `tests/components/PlanDetalle*`, `PlanEmpresaCostoPorcentual`, `PlanesModule`, `PlanForm*`,
  `PlanVistaCosteo`, `tests/unit/planes/plan-form-borrador` y `plan-form-revision`: **21 archivos, 300 tests pasan, 0
  fallan**.
- E2E: no corridos (por instrucción; los verifica el CI).

### Desviaciones

1. **Texto `nivelEscrito` en `textos.ts`.** «Revisar» no valida; un nivel que aún no pasa el esquema se pinta con lo
   escrito («Nivel n: desde <meta> órdenes, −<valor>») en vez de «NaN» o «abc.00», como ya hacen los descuentos y los
   topes (`revision.ts`). Es el mismo formato aprobado de R21, sin canonizar; no es un texto nuevo de producto.
2. **`PlanDetalle` también pinta la edición** («Niveles por volumen: antes → después» vía `lineasDeCambioDelPlan`),
   además del alta de R19: el rastro ya guarda las dos listas y sin esto una edición de niveles no dejaba línea.
3. **Tests fuera de la lista de T10** adaptados por el paso nuevo: `PlanForm.test.tsx`, `PlanFormBeneficios.test.tsx`,
   `PlanFormRevisar.test.tsx` (cambio mínimo, igual que SLT-214).

### Veredicto

T8, T9 y T10 hechas: typecheck y lint en verde, 300/300 tests de planes en verde; E2E adaptados sin correr.

## Tanda 4 (E2E) — T11

### Archivos

- `e2e/planes-niveles.spec.ts` (nuevo).
- `playwright.config.ts`: `planes-niveles` registrado en el proyecto `aislamiento`, tras `planes-beneficios`
  (sin esto la guardia `e2e-sin-saltos` lo marca: cada spec cae en exactamente un proyecto).

### Mapa R → test

| R | Test |
|---|---|
| R38.1, R38.2 | `e2e/planes-niveles.spec.ts` «R38: crear un plan con 2 niveles, uno en porcentaje y otro en monto, y verlos en orden en el listado» (paso «Niveles» vacío, nivel 1 en «Porcentaje» y 2 en «Monto fijo», «Revisar y crear» en orden, `plan_nivel` en la base, columna «Niveles» en orden) |
| R38.3 | `e2e/planes-niveles.spec.ts` «R38: editar los niveles programa el cambio con su fecha sin cambiar todavía la columna «Niveles»» (empresa mensual asignada por detrás; nivel 2 a 800 y nivel 3 nuevo; «Cambio programado desde F» con la línea «Niveles por volumen: antes → después»; columna «Niveles» igual, «Cambio» = «Desde F», base igual) |

Los textos esperados de las líneas salen de `textoDelNivel` / `textoDeLosNiveles` (`lib/planes/niveles.ts`), no
escritos a mano; los rótulos del paso, de `plan-form/textos.ts`.

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: `tsc --noEmit` sin salida, exit 0.
- `pnpm exec eslint e2e/planes-niveles.spec.ts playwright.config.ts`: «ESLint: No issues found», exit 0.
- `pnpm exec playwright test --list e2e/planes-niveles.spec.ts`: carga sin levantar la app; lista
  `[aislamiento] › planes-niveles.spec.ts` con los 2 casos (191:5 y 242:5), más los 10 de `plataforma-vacia` que
  arrastra por dependencia. «Total: 12 tests in 3 files», exit 0.
- E2E: **no corrido en local, por orden del leader**; lo verifica el CI.

### Veredicto

T11 hecha: spec de R38 escrito y registrado, typecheck/eslint/--list en verde; falta la corrida en CI.

## Tanda 3 (backend_dev): T6 y T7 — 2026-11-19

### Archivos

Nuevos:
- `lib/interfaces/repositories/INivelesEmpresaRepository.ts` — `empresasConMesPendiente(ahora)` y `cerrarMeses(org, ahora)`.
- `lib/repositories/NivelesEmpresaRepository.ts` — en `comoPlataforma("SL-24", …)`; la lista usa
  `plan_inicio_periodo_calendario('mensual', ahora)` (una sola definición de «mes», R23); `cerrarMeses` llama a
  `plan_nivel_cerrar_meses` en su transacción (sin `$transaction`, en la de quien llama).
- `lib/planes/jobs-niveles.ts` — `proximaCorridaCierreNiveles` (06:20 UTC), `dedupeKeyCierreNiveles`
  (`plan_niveles_cerrar:<AAAA-MM-DD>`), `recurrenciaCierreNiveles`, `sembrarCierreNiveles`, `crearCierreNivelesHandler`.
- `tests/integration/db/plan-nivel-recalculo.test.ts` — T6.
- `tests/unit/planes/jobs-niveles.test.ts` — T7.

Modificados (producción):
- `lib/repositories/PlanesRepository.ts` — `mismosNiveles`; `recibirCambio` (cierra con los de antes antes del upsert
  de la versión y recalcula con `recibeAt` después); `aplicarEnTx` (cierra antes de salir del plan de antes y llama a
  `plan_nivel_tomar_plan` tras el `UPDATE "organizacion"`; solo si `entra`).
- `db/schema.prisma` — `plan_niveles_cerrar` en `enum JobTipo` (la base ya lo tenía desde T2). `prisma generate` hecho
  en el `node_modules` propio del worktree.
- `lib/modulos/reparto.ts` — `MODULO_POR_JOB.plan_niveles_cerrar = "nucleo"`.
- `app/api/cron/procesar-jobs/route.ts` — handler, recurrencia y `RECURRENTES_DE_PLATAFORMA`.
- `scripts/siembra-jobs-recurrentes.ts` — entrada en `SIEMBRAS_RECURRENTES`.
- `lib/db/excepciones-aislamiento.ts` — `NivelesEmpresaRepository.ts` en `EXCEPCIONES_DE_PLATAFORMA` (ficha `SL-24`, D29).

Modificados (tests):
- `tests/integration/db/plan-nivel-cierre.test.ts` — bloque T7: el repositorio (lista, cierre, repetir, lista vacía)
  y la idempotencia de la siembra con `contarJobs`.
- `tests/unit/api/procesar-jobs-registro.test.ts` — el tipo en los dos censos exactos y un caso propio.
- `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts` y `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`
  — el tipo en los censos de recurrentes y la prueba de idempotencia de la siembra en la lista del frente 4 (fuera de
  la lista de `tasks.md`; precedente SLT-118, commit aefeef8c).

### Mapa R → test (de esta tanda)

| R | Test |
|---|---|
| R16 (mitad «cada empresa corre la de su versión») | `plan-nivel-recalculo.test.ts` («R16: con el cambio a medias, A … y B …»: A sube al 2 con 10/14; B se queda en 0 con 20; al recibir, B recalcula) |
| R29 | `jobs-niveles.test.ts` (06:20 UTC en 4 bordes, `dedupe_key` por día, siembra con la misma clave, registro recurrente de plataforma y de núcleo, handler cableado en plataforma); `plan-nivel-cierre.test.ts` (bloque T7: lista de pendientes, `cerrarMeses` 2 y 1, repetir 0, ya no se lista, lista vacía; siembra + re-agendado = 1 fila); `procesar-jobs-registro.test.ts` |
| R30 | `jobs-niveles.test.ts` («si una empresa falla, cierra las demás y DESPUÉS falla con sus ids y causas», «un fallo al listar…») |
| R31 | `plan-nivel-recalculo.test.ts` («R31: primero cierra el mes pendiente con las metas de antes…»: cerrado hasta noviembre sin «subida»; historial `cambio_niveles 0→1` desde la recepción, mes de octubre, 12 órdenes) |
| R32 | `plan-nivel-recalculo.test.ts` («R32: cambio de plan → …»: octubre cerrado con el de antes, recálculo con octubre entero, entrada = efecto, historial con el plan nuevo; en diciembre solo cuentan las 11 de después de la entrada) y («R32: … con la versión de un cambio a medias del plan nuevo») |
| R33 | `plan-nivel-recalculo.test.ts` («R33: la primera asignación…»: nivel 0, cuenta 0, entrada = efecto, `cerrado_hasta` = mes de la entrada, sin historial aunque octubre cumpla) |
| R34 | `plan-nivel-recalculo.test.ts` (cambio de solo tipo; recepción con los mismos niveles escritos de otra forma; recepción sin `niveles`: nivel, cuenta, entrada y `cerrado_hasta` intactos, sin historial) |

### Salida real

- `pnpm exec prisma generate` y `pnpm run typecheck`: `tsc --noEmit` sin errores (exit 0, 0 `error TS`; el formulario de
  T8 ya compila).
- `pnpm exec eslint` sobre los 15 archivos tocados: «No issues found», exit 0.
- `vitest run` unit: `jobs-niveles`, `procesar-jobs-registro`, `jobs-factura-plataforma` 39/39; `planes-repository-tipo-cobro`,
  `planes.composition-root`, `procesar-jobs-plan-cambio`, `jobs-cambio-empresa` 73/73; guardias `jobs-handler-por-tipo`,
  `jobs-recurrentes-con-siembra`, `plataforma-solo-en-lista` 41/41.
- `vitest run --no-file-parallelism` integración (base `servi_logistic_slt215`): `plan-nivel-recalculo` 8/8,
  `plan-nivel-cierre` 21/21, `plan-nivel` 12/12 (en la corrida conjunta, 40/40 antes del caso de siembra). Los que pasan
  por `aplicarEnTx`/`recibirCambio`: `planes-version-por-empresa`, `factura-plataforma-cambio-plan`,
  `planes-cambio-empresa`, `planes-asignacion`, `planes-cambio-por-empresa`, `mi-plan-cambiar-plan`,
  `plan-borrador-confirmar`, `planes-edicion-en-uso`: 8 archivos, 123/123.
- `pnpm run test:guardias`: 359 archivos pasan, 1 rojo; 5413 tests pasan, 1 falla, 1 saltado. El rojo es
  `lectura-guia-unica.guardia.test.ts` (R567, regla de dígitos `/^\d+$/` suelta) en
  `app/(app)/plataforma/planes/_components/plan-form/estado.ts`: archivo de T8 (frontend), no de esta tanda.

### Desviaciones

1. **`aplicarEnTx`: el cierre va antes de `salirDelCambioEnTx`**, no justo antes de `factura_plataforma_tomar_cambio`
   (sigue siendo «antes»). `salirDelCambioEnTx` borra la versión propia de la empresa en el plan de antes, que puede
   traer los niveles que corría (R16); cerrar después cerraría con los del plan y no con los suyos.
2. **`recibirCambio` compara contra `version.niveles ?? plan.niveles`**, no contra `version.niveles` a secas: una versión
   sin `niveles` corre los del plan (R18), y si la empresa venía de una versión propia con otros niveles, eso sí es un
   cambio. Con `version.niveles` ausente y la empresa en los del plan, no hay cambio (R34, probado).
3. **`plan_nivel_recalcular` sin fila sigue devolviendo NULL** (revisado contra R32/R33): toda empresa con plan tiene fila
   (relleno de R37 y `plan_nivel_tomar_plan` en cada `aplicarEnTx` que entra), y `tomar_plan` resuelve la primera
   asignación por la ausencia de fila. Solo una empresa con `plan_id` puesto a mano (fixtures de tests viejos) llega sin
   fila; ahí no hacer nada deja verdes esos tests, y su siguiente cambio de plan la trata como primera asignación.
4. **Riesgo de §10 también en `recibirCambio`:** el cierre usa `ahora` (como dice el design) y el recálculo el mes de
   antes de `recibeAt`. Una recepción que llega con más de un borde de mes de retraso cierra ese mes con los niveles de
   antes y el recálculo lo pisa. Hoy el barrido es horario; no lo cambié.

### Veredicto

T6 y T7 hechas: typecheck, lint, tests de la tanda y los afectados en verde; guardias en verde salvo
`lectura-guia-unica` por `estado.ts` de T8.
