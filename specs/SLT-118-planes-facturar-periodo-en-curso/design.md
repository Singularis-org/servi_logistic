# SLT-118 — planes-facturar-periodo-en-curso · design.md

> Requisitos: `requirements.md` (R1–R40; P1–P19 cerradas por el humano el 2026-11-10; sin preguntas abiertas).
>
> **Dos cambios de fondo del humano (2026-11-10, tras aprobar el spec).**
> 1. *Periodicidad de órdenes:* cada plan define si sus órdenes se facturan quincenal o mensual; sin plan,
>    quincenal; una factura por **corte**.
> 2. *Cuota por adelantado:* la factura se **emite** en su `hasta` (el inicio del corte siguiente) con las
>    órdenes de su intervalo y la cuota del período de cobro que **empieza** en ese instante. La primera cuota
>    de un plan sale al empezar el plan. Sin devoluciones. Al desplegar, el período en curso cuenta como pagado.
>
> Este design los aplica y dice qué se conserva y qué se rehace del código de la tanda 1 (§0). Con P17 (una sola
> factura con las órdenes sin plan y la primera cuota) y P18 (sin corte al aplicar: la primera cuota de un inicio
> pasado cuya factura ya salió espera al próximo corte) la primera cuota se guarda en su propio grupo de columnas,
> porque una factura puede llevar dos cuotas (§1.1, §2.4). P19 (alta con plan desde ese día: sin excepción ni corte
> al aplicar; la primera factura sale en el próximo corte con las órdenes y las dos cuotas) cae en el caso
> «inexistente» de §2.3, sin código propio.
>
> Antes: sin corte ni prorrateo (P3); la cuota es la del período completo, salvo la primera cuota de un plan,
> que prorratea (P6, R29); la primera asignación corta la factura sin plan en su día (P8, R28); el servidor del
> superadmin lleva la fecha de efecto al inicio del período del **tipo de referencia** (P7, P9, R30–R34, §3.1),
> lo que modifica SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes»
> R16–R18. Hereda el diseño de `specs/SL-40-cobro-plataforma-por-orden/`, SL-45 «pago a la plataforma»
> (`20261024140000`), `specs/SLT-85-traza-facturacion-cobros/` y `specs/SLT-86-planes-periodo-facturacion/`
> («SLT-86 Rn»). Escrito por `spec_author` el 2026-11-10. Sin dependencias nuevas: todo es Postgres, Prisma, zod
> y React, ya aprobados en `docs/dependencias.md`. El plazo de pago y el bloqueo por mora son de SLT-121
> «Planes: plazo de pago de la factura y operación congelada por mora».

## Lo que ya existe

Busqué el 2026-11-10 con `factura`, `factura_plataforma`, `estado de cuenta`, `cuota`, `costo base`,
`cerrar período`, `deuda con la plataforma`, `periodicidad`, `periodicidad_ordenes`, `corte` y, tras la cuota
por adelantado, `adelantado`, `anticipado`, `emision` y `plan_cambio_desde_at`, en tres sitios:

- **el board** (`feature_list.json`): solo esta ficha, sus dos hijas, SLT-119 «Planes: pantallas de facturas
  para el superadmin y el maestro» y SLT-120 «Planes: facturar el período en curso (1–15) tras asignar los
  primeros planes», y SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora», que
  depende de esta. Ninguna cobra por adelantado ni define una periodicidad de órdenes;
- **`specs/`**: ninguna factura de la plataforma, periodicidad de órdenes ni cobro adelantado. «Estado de
  cuenta» aparece en los specs de la wallet de tiendas, mensajeros y satélites (458, 464, SLT-73, SLT-95…), que
  son otra cosa;
- **el código**: el grafo `codebase-memory-mcp` no tiene proyecto para este worktree, así que busqué con Grep y
  Read en `db/`, `lib/`, `app/` y `tests/`. Lo único de facturas es lo que dejó la tanda 1 de esta misma ficha
  (§0). El cambio pendiente de la empresa vive en `organizacion.plan_cambio_*` (SLT-86, `20261106120000`): es lo
  que mira la espera de R39.

Lo que existe y se reutiliza:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| **El código de la tanda 1 de esta ficha** | `d237afe7` (T1: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`), `0e58af60` (T2: `db/migrations/20261111130000_factura_plataforma_job_enum/`, `db/migrations/20261111130100_factura_plataforma/`) | Se conserva la base y se rehace lo atado a la cuota a período vencido (§0). Las migraciones no están en `dev`: se editan en su sitio, sin migración nueva |
| El libro de cargos y reversos, con su índice `(organizacion_id, ocurrido_at)` | `cobro_plataforma_movimiento`, `20261023130100`, `20261104150200` | **No se toca.** Se suma por `ocurrido_at` (R5, R6) |
| La traza por movimiento, con `cobrado_at = ocurrido_at` e índice `(organizacion_id, cobrado_at)` | `cobro_plataforma_traza`, `20261109120000` | Es el detalle por orden (R7). No se copia ni se toca |
| El período de calendario en SQL: `plan_inicio_periodo_calendario`, `plan_fin_periodo_calendario` | `20261106120000` | Dan el fin natural de una factura con su periodicidad (R2), si una emisión es inicio de período de cobro (R8) y el fin y los días del tramo (R29) |
| El cambio pendiente de la empresa: `organizacion.plan_cambio_plan_id`, `plan_cambio_tipo_cobro`, `plan_cambio_desde_at` | `20261106120000` | La espera del cierre (R39) y la cuota prevista (R24). Solo se lee |
| El precio por fecha: `plan_precio_historial` | `20261106120000` | El precio de la cuota (R8; SLT-86 R15) |
| El costo del período en TS: `montoDelPeriodo`; el del tramo: `costoDelTramo`, juntos en `costoDelPeriodoEnCurso` | `lib/planes/cobro.ts` | Gemelas de las funciones SQL (§2.1); un test las ata (R10). No se tocan |
| Los casos de calendario | `tests/integration/db/_fixtures/periodo-calendario.ts` | Para los tests de cortes y períodos |
| El único punto que aplica un cambio de empresa: `PlanesRepository.aplicarEnTx` | `lib/repositories/PlanesRepository.ts` | Llama a la toma del cambio (R15, R16, R28) |
| La edición del plan, inmediata o programada (`versionPlanSchema`, `aplicarVersion`, `aplicarCambioProgramado`) y su rastro (`diferenciasDelPlan`) | `lib/types/planes.ts`, `lib/repositories/PlanesRepository.ts`, `lib/planes/rastro.ts` | La periodicidad viaja en la versión como un campo más (§3.2, R35); la regla de R37 se mira donde ya se miran los topes al editar |
| `fechaDeEfectoPorDefecto` e `inicioDelPeriodoCalendario` | `lib/planes/ciclo.ts` | Se reutilizan sin cambios para R30–R31 (§3.1) |
| El corte del cambio del maestro en SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan» (PR #115, sin mergear) | worktree de SLT-99 | Misma `fechaDeEfectoPorDefecto`; sin función duplicada. Choque al mergear en `PlanesRepository.ts`, `IPlanesRepository.ts`, `lib/types/planes.ts` y `excepciones-aislamiento.ts` (§10) |
| Las pantallas que mandan la fecha y el formulario del plan (`PlanForm.tsx`) | `app/(app)/plataforma/…` | Confirmaciones con la fecha real (R32) y el campo de periodicidad (R35) |
| El tope del pago en la base: `wallet_movimiento_tope_pago_plataforma` | `20261024140000` | Ya con la cuota en T2 (R18, R19). No cambia |
| Las lecturas de la deuda | `lib/utils/`, `lib/repositories/` | Suman la cuota (R18) |
| La guardia de escritura solo por la base | `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | Se amplía (R22) |
| El recurrente de plataforma con siembra (`plan_cambios_vencidos`) | `lib/planes/jobs-cambio-plan.ts`, `app/api/cron/procesar-jobs/route.ts` | Mismo molde para el cierre (§4) |

## 0. El código de la tanda 1: qué se conserva y qué se rehace

### 0.1 Desvíos que dejó la tanda 1 (aceptados)

| Desvío | Qué decía el design | Qué hizo | Veredicto |
|---|---|---|---|
| Prefijo de las migraciones | `20261110130000`, `20261110130100` | `20261111130000`, `20261111130100` | **Aceptado.** Van después de la mayor migración de `dev` al empezar (`20261111120000_bug_report_status`) |
| Función `factura_plataforma_abrir(p_org, p_desde)` | «abrir» era un paso dentro de `avanzar` | Función interna aparte, sin `GRANT` | **Aceptado.** La usan `avanzar` y `tomar_cambio`; copia además la periodicidad (§2.2) |
| CHECK `factura_plataforma_cerrada` | número y cifras solo en la cerrada | además: una no cerrada no lleva **ninguna** cifra, precio, cuota ni días | **Aceptado.** Coherente con R18. Las columnas nuevas de la cuota entran en él; la marca `primera_cuota_desde_at` no (§1.1) |

### 0.2 Qué se conserva tal cual

- La tabla y sus columnas de hoy; los únicos `(organizacion_id, desde_at)`, `(organizacion_id, numero)` y el
  parcial de la en curso; el índice `(organizacion_id, estado)`; la FK `CASCADE`.
- La RLS, la política `factura_plataforma_por_empresa`, el `REVOKE` y el trigger de sin cambio de empresa (R21, R22).
- La inmutabilidad `SL118` de la cerrada (R13).
- `plan_costo_del_periodo`, `plan_costo_del_tramo` y `plan_dias_de_calendario` (la cuota y su prorrateo, R8, R10, R29).
- De `factura_plataforma_cerrar`: el cerrojo de la empresa, el margen de 5 minutos, el número correlativo y la
  idempotencia (R3, R4, R11, R14).
- La negativa del `down.sql` (R27), que además mira la primera cuota. El tope del pago con la cuota (R18, R19)
  se conserva salvo la suma, que pasa a incluir la primera cuota (§0.3, §2.7).
- La migración del valor de `job_tipo` (`20261111130000`), entera.
- En Prisma, el modelo `FacturaPlataforma` y su entrada en `MODELOS_DE_NEGOCIO`.

### 0.3 Qué se rehace (todo en los mismos archivos)

| Pieza | Hoy (tanda 1) | Con los dos cambios de fondo |
|---|---|---|
| Columna `plan.periodicidad_ordenes` | no existe | Nueva, `NOT NULL DEFAULT 'quincenal'`, `CHECK IN ('quincenal', 'mensual')` (§1.2, R35, P14) |
| Columna `factura_plataforma.periodicidad` | no existe | Nueva, `NOT NULL`, la periodicidad de órdenes de la factura (§1.1) |
| Columnas de la cuota | `precio_mensual`, `cuota`, `dias_cobrados`, `dias_periodo` | además `cuota_plan_id`, `cuota_plan_nombre`, `cuota_tipo_cobro`, `cuota_desde_at`, `cuota_hasta_at`: la cuota es de **otro** plan que el de las órdenes cuando la emisión es el efecto de un cambio (§1.1, R5) |
| Marca y grupo de la primera cuota | no existe | la marca `primera_cuota_desde_at` la pone la toma de una primera asignación (R16, R28); al cerrar se llena el grupo `primera_cuota_*` (plan, tramo, precio, importe y días), aparte de la cuota de R8 (P18: una factura puede llevar las dos) |
| CHECK `factura_plataforma_cuota` | «sin plan, sin cuota» | **se quita esa parte**: una factura sin plan puede llevar la primera cuota del plan siguiente (R28); cada grupo de cuota va entero o no va, y hay uno nuevo para la primera cuota (§1.1) |
| `factura_plataforma_abrir` | copia plan, nombre y tipo | copia además `periodicidad` (la del plan, o `quincenal` sin plan) |
| `factura_plataforma_avanzar` | fin natural con `COALESCE(tipo_cobro, 'mensual')` | fin natural con la `periodicidad` de la factura (R2) |
| `factura_plataforma_tomar_cambio` | toma plan, nombre y tipo; R28 corta la sin plan | toma también la periodicidad; en una primera asignación pone la marca de la primera cuota (§2.3, R16, R28). Sin corte al aplicar (P18): la firma sigue sin `p_ahora` |
| `factura_plataforma_cifras` | órdenes + cuota del período que **contiene** el `desde` | se parte en dos: `factura_plataforma_ordenes` (las sumas) y `factura_plataforma_cuota` (la cuota de un tramo con un plan), y la regla de qué cuota lleva cada factura va en `cerrar` y `en_curso` (§2.4) |
| `factura_plataforma_cerrar` | cierra todas las vencidas | además **espera** al cambio pendiente (R39), saca la cuota de la emisión con el plan de la factura siguiente y la primera cuota de la marca (§2.5) |
| `factura_plataforma_en_curso` | cuota prevista del período del `desde` | las cuotas previstas (la primera y la de la emisión), con el cambio pendiente (R24); fin y `periodicidad` en el JSON |
| Tope del pago | suma `cuota` de las cerradas | suma `cuota + primera_cuota` de las cerradas (§2.7, R18) |
| Trigger de inmutabilidad | una por cerrar no cambia plan, tipo ni fechas | tampoco su periodicidad; la marca solo pasa de nula a un valor |
| Siembra | `desde` = inicio del período de cobro (o del mes sin plan) | `desde` = 00:00 de la plataforma del día del alta de la empresa (factura histórica, 2026-11-11), emitida en el primer corte tras la migración; sin marca: el período en curso cuenta como pagado (R26, P15). El fin se guarda en `fin_natural_at` (P20, §2.8) |
| Columna `fin_natural_at` | no existe | Nueva, `NOT NULL`: el fin natural de cada factura, fijado al abrirla; `avanzar`, `tomar_cambio`, `cerrar` y `en_curso` la leen en vez de calcularlo desde `desde` (P20, §1.1, §2.2) |
| `down.sql` | deja la base como estaba | `DROP` con las firmas nuevas y quita `plan.periodicidad_ordenes` |
| `db/schema.prisma` | — | `Plan.periodicidadOrdenes`, `FacturaPlataforma.periodicidad`, `FacturaPlataforma.finNaturalAt` (P20), las cinco columnas de la cuota, la marca y las ocho de la primera cuota |

## 1. Modelo de datos

### 1.1 Tabla `factura_plataforma` (de NEGOCIO)

Una fila por factura de una empresa: el intervalo de órdenes `[desde, hasta)`, que se **emite** en `hasta`.
Columnas (`TIMESTAMP(3)` sin zona, en UTC):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | `gen_random_uuid()::text` |
| `organizacion_id` | `TEXT NOT NULL` | `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`; FK a `organizacion` |
| `estado` | `TEXT NOT NULL` | `CHECK IN ('en_curso', 'por_cerrar', 'cerrada')` |
| `numero` | `INTEGER` | Solo en `cerrada` (R14) |
| `desde_at` | `TIMESTAMP(3) NOT NULL` | Inicio, incluido: un corte, salvo el alta y la sembrada histórica (R26, §2.8) y la primera asignación (R28) |
| `hasta_at` | `TIMESTAMP(3)` | Fin, excluido, y emisión. `NULL` solo en `en_curso` |
| `fin_natural_at` | `TIMESTAMP(3) NOT NULL` | **P20.** Fin natural (R2), fijado al abrir: `plan_fin_periodo_calendario(periodicidad, desde_at)`, salvo la sembrada histórica (el primer corte tras la migración, R26, §2.8). Solo lo recalcula `tomar_cambio` en R16 al cambiar la periodicidad. `hasta_at` lo iguala al fijar, salvo R28 (fijada antes, en E) |
| `periodicidad` | `TEXT NOT NULL` | `CHECK IN ('quincenal', 'mensual')`. La de órdenes de la factura: la del plan al abrirla, o `quincenal` sin plan (R2) |
| `plan_id`, `plan_nombre`, `tipo_cobro` | `TEXT`, `VARCHAR(80)`, `TEXT` | El plan de las **órdenes**: copia del plan de la empresa al abrirla, que solo cambia R16 mientras está `en_curso`. Las tres o ninguna. `plan_id` sin FK, como en la traza |
| `primera_cuota_desde_at` | `TIMESTAMP(3)` | **Marca.** Inicio del tramo de la primera cuota de un plan que esta factura emitirá (R16, R28). Solo la escribe `tomar_cambio`, de nula a un valor, en una `en_curso` o `por_cerrar`. Vale su `hasta_at` (por adelantado: R28, y R16 con la emitida en D abierta) o su `desde_at` (a período vencido: R16 con la emitida en D cerrada o inexistente, P18) |
| `primera_cuota_hasta_at`, `primera_cuota_plan_id`, `primera_cuota_plan_nombre`, `primera_cuota_tipo_cobro` | `TIMESTAMP(3)`, `TEXT`, `VARCHAR(80)`, `TEXT` | Al cerrar, solo con marca y si el plan tiene costo base: fin del tramo y el plan de la primera cuota (el de la factura con `desde_at` = la marca) |
| `primera_cuota_precio_mensual`, `primera_cuota` | `DECIMAL(12,2)` | Al cerrar, igual que arriba |
| `primera_cuota_dias_cobrados`, `primera_cuota_dias_periodo` | `INTEGER` | Al cerrar, igual que arriba (R29) |
| `cargos`, `reversos`, `total_ordenes` | `DECIMAL(14,2)` | Al cerrar (R5) |
| `movimientos` | `INTEGER` | Al cerrar |
| `cuota_plan_id`, `cuota_plan_nombre`, `cuota_tipo_cobro` | `TEXT`, `VARCHAR(80)`, `TEXT` | Al cerrar, solo con cuota: el plan de la cuota (el de la factura siguiente) |
| `cuota_desde_at`, `cuota_hasta_at` | `TIMESTAMP(3)` | Al cerrar, solo con cuota: el período de cobro completo que empieza en la emisión (R8). `cuota_desde_at` = la emisión |
| `precio_mensual`, `cuota` | `DECIMAL(12,2)` | Al cerrar, solo con cuota |
| `dias_cobrados`, `dias_periodo` | `INTEGER` | Con la cuota: días del período (iguales: la cuota de R8 no prorratea) |
| `total` | `DECIMAL(14,2)` | `total_ordenes + COALESCE(cuota, 0) + COALESCE(primera_cuota, 0)` |
| `cerrada_at`, `created_at` | `TIMESTAMP(3)` | |

CHECK:
- `factura_plataforma_estado_fin`: `(estado = 'en_curso') = (hasta_at IS NULL)` y `hasta_at > desde_at`;
- `factura_plataforma_fin_natural` (P20): `fin_natural_at > desde_at` y `hasta_at IS NULL OR hasta_at <=
  fin_natural_at`. No limita el largo (la sembrada histórica pasa);
- `factura_plataforma_cerrada`: el de T2, con las cinco columnas nuevas de la cuota y las ocho de la primera cuota
  (no la marca) dentro del grupo «solo en la cerrada»;
- `factura_plataforma_plan`: `num_nulls(plan_id, plan_nombre, tipo_cobro) IN (0, 3)`; `tipo_cobro IN` los cuatro;
- `factura_plataforma_cuota`: `num_nulls` de las nueve columnas de la cuota `IN (0, 9)`, `cuota >= 0`,
  `0 < dias_cobrados <= dias_periodo`, `cuota_hasta_at > cuota_desde_at`, `cuota_tipo_cobro IN` los cuatro.
  **Sin** «sin plan, sin cuota» (R28);
- `factura_plataforma_primera_cuota`: `num_nulls` de las ocho columnas de la primera cuota `IN (0, 8)`; si están,
  la marca no es nula; `primera_cuota >= 0`, `0 < primera_cuota_dias_cobrados <= primera_cuota_dias_periodo`,
  `primera_cuota_hasta_at > primera_cuota_desde_at`, `primera_cuota_tipo_cobro IN` los cuatro; la marca, si
  está, es `desde_at` o `hasta_at` de la fila (cuando hay `hasta_at`);
- `factura_plataforma_periodicidad_check`: `periodicidad IN ('quincenal', 'mensual')`.

Únicos e índice: los de T2 (§0.2). FK `ON DELETE CASCADE`: la app nunca borra una empresa; el dueño sí, en las
limpiezas de los tests y en el borrado de la demo.

### 1.2 Columna `plan.periodicidad_ordenes` (de PLATAFORMA) — R35

`TEXT NOT NULL DEFAULT 'quincenal'` con `CHECK (periodicidad_ordenes IN ('quincenal', 'mensual'))`, en la
migración `20261111130100`. El `DEFAULT` deja **todos los planes que ya existen en quincenal** (P14) y sirve a los
`INSERT` de los tests y de la demo, que no la mandan. `plan` ya tiene RLS sin políticas y `REVOKE ALL … FROM
servi_app` (SL-24). En Prisma, `periodicidadOrdenes String @default("quincenal") @map("periodicidad_ordenes")` con
el comentario del CHECK.

**Por qué en el plan y no en la empresa.** Lo dice el humano: «cada plan define la periodicidad». Un custom es
de una sola empresa, así que una empresa que necesite otra periodicidad tiene su custom.

### 1.3 RLS, permisos e inmutabilidad

Los de T2 (§0.2). El trigger `factura_plataforma_inmutable` congela en una `por_cerrar` también `periodicidad` y
`fin_natural_at` (P20; en una `en_curso` solo lo cambia `tomar_cambio`, que es del dueño), y
deja escribir `primera_cuota_desde_at` solo de `NULL` a un valor (R16: la marca puede llegar a la factura ya fijada
que se emite en D).

### 1.4 Por qué una tabla nueva y no un movimiento sin orden (P2, cerrada)

- **Descartada: `orden_id` nulable en `cobro_plataforma_movimiento` y un tipo `cuota`.** Rompe el único
  `(organizacion_id, orden_id, secuencia)`, la alternancia cargo/reverso por orden de SL-40 y la traza de SLT-85.
- **Descartada: una tabla-libro aparte `cobro_plataforma_cuota`.** Duplica la relación con la factura, con su
  propia RLS, `REVOKE`, inmutabilidad y guardia.
- **Elegida:** la cuota es una columna de la factura cerrada, y la deuda la suma (§5).

## 2. Funciones en la base (todas del dueño)

Todas `SECURITY DEFINER` con `SET search_path = public, pg_temp` y `REVOKE EXECUTE … FROM PUBLIC`. Solo
`factura_plataforma_en_curso` tiene `GRANT EXECUTE … TO servi_app`. Las que dependen del reloj reciben el
«ahora» como parámetro (`p_ahora timestamp`, UTC sin zona).

### 2.1 La cuota: `plan_costo_del_periodo`, `plan_costo_del_tramo`, `plan_dias_de_calendario` (sin cambios)

Las de T2: el costo de un período completo (gemela de `montoDelPeriodo`), el de un tramo (`costoDelTramo`, dos
redondeos) y los días de calendario de la plataforma (`diasDeCalendario`, −06:00 fijo). R8, R10, R29.

### 2.2 `factura_plataforma_abrir(p_org, p_desde)` y `factura_plataforma_avanzar(p_org, p_hasta)` (internas)

**Abrir** = insertar `en_curso` con el plan de la factura copiado de la empresa en ese momento:
`organizacion.plan_id`, `plan.nombre`, `organizacion.plan_tipo_cobro` y `plan.periodicidad_ordenes`, o los tres
primeros nulos y `periodicidad = 'quincenal'` sin plan; y `fin_natural_at = plan_fin_periodo_calendario(periodicidad,
p_desde)` (R2, P20). La siembra histórica es la única que no usa `abrir`: escribe su propio fin (§2.8).

**Avanzar** deja la factura en curso alineada con el calendario hasta `p_hasta`:
1. sin factura en curso, la abre desde las 00:00 de la plataforma del día de `organizacion.created_at` (R26);
2. mientras su `fin_natural_at` sea `≤ p_hasta`: la **fija** (`por_cerrar`, `hasta_at = fin_natural_at`) y
   **abre** la siguiente desde ahí.

El fin es el **guardado** en la factura (P20), no uno calculado desde `desde`: un cambio de plan o de la
periodicidad del plan no mueve el fin de la factura en curso (R15, R36). La siguiente se abre con lo que la
empresa y su plan tengan en ese instante (R36).

### 2.3 `factura_plataforma_tomar_cambio(p_org, p_efecto, p_plan_id, p_tipo)` — R15–R17, R28, R33, R38

**Firma de T2, sin `p_ahora`**: con P18 no hay corte al aplicar, así que no depende del reloj. La llama
`PlanesRepository.aplicarEnTx` **antes** de
su `UPDATE "organizacion"`, con la empresa ya en `FOR UPDATE`, así que sabe si es una primera asignación
(`organizacion.plan_id IS NULL`). Lee del plan nuevo su nombre y su periodicidad.
1. `factura_plataforma_avanzar(p_org, p_efecto)`: con el plan de antes, las facturas cuyo fin natural llega al
   efecto se fijan y la siguiente se abre con el plan de antes. Sea `F` la factura en curso tras este paso, con
   `desde` D.
2. Según el caso:
   - **efecto ≤ D** (R16; el caso normal de R38 y de un cambio de la cola: el paso 1 deja D = efecto): `F` toma
     `p_plan_id`, su nombre, `p_tipo` y la periodicidad del plan nuevo; si la periodicidad cambia, su
     `fin_natural_at` se recalcula: `plan_fin_periodo_calendario(periodicidad nueva, D)` (P20; el único
     recálculo del fin guardado); si no cambia, se conserva el fin guardado (decisión del humano, 2026-11-11;
     alinea con T16.1). Si es
     una **primera asignación**, la marca `primera_cuota_desde_at = D` va en la factura con `hasta_at = D` si
     existe y no está cerrada (por adelantado); si no (cerrada o inexistente, como el alta del mismo día, P19), la
     marca D va en `F`, que la emitirá en su fin natural con sus órdenes (a período vencido, P18). No se fija ni se
     abre ninguna factura;
   - **efecto > D y `F` con plan** (R15; un pendiente de antes de esta ficha con efecto a mitad de factura): nada;
   - **efecto > D y `F` sin plan** (R28, P8): fija `F` en el efecto con la marca `primera_cuota_desde_at =
     efecto` (P17: una sola factura con sus órdenes sin plan y la primera cuota) y abre la siguiente desde el
     efecto con el plan, el tipo y la periodicidad nuevos (vía `abrir`, con su `fin_natural_at`).

Con la sembrada histórica en curso (D = alta, antes del corte en curso; §2.8) los casos se leen igual, sin regla
nueva: una primera asignación con inicio después de D cae en R28 y la fija en E con sus órdenes y la primera cuota;
un cambio de una empresa con plan cae en R15 (nada). Es lo que ya dicen R15 y R28 para toda factura en curso.

Solo toca facturas no cerradas. No cierra: solo fija y marca. **P19 (cerrada: sin excepción):** el alta con plan
desde ese mismo día es el caso «inexistente»: la factura en curso empieza a las 00:00 del alta (= D = efecto), no
hay factura con `hasta_at = D`, la marca D va en `F` y `tomar_cambio` no recibe el «ahora» ni fija nada. En su fin
natural (quincenal, el 16) `F` se emite con las órdenes desde D, la primera cuota del tramo `[D, 16)` y, por R8, la
cuota del período que empieza el 16, en sus dos grupos de columnas (§1.1). Un cambio pendiente, cancelado, una edición de
precio o de periodicidad del plan no llaman a `aplicarEnTx`: no tocan facturas (R17, R36).

**Por qué el efecto de R30 es siempre un corte (R38).** El efecto es el inicio de un período del tipo de
referencia. Si ese tipo es mensual o más largo, es un 1 de mes: corte de las dos periodicidades. Si es
quincenal, los dos tipos son quincenales, y con R37 los dos planes tienen órdenes quincenales: el 1 y el 16 son
cortes. Así la emisión, la cuota del plan nuevo y el cambio del costo por orden coinciden.

### 2.4 Las cifras: `factura_plataforma_ordenes` y `factura_plataforma_cuota` (internas, `STABLE`) — R5–R9, R29

Sustituyen a `factura_plataforma_cifras`.
- **`factura_plataforma_ordenes(p_org, p_desde, p_hasta)`** → `cargos`, `reversos`, `movimientos` con
  `ocurrido_at` en `[p_desde, p_hasta)` y `total_ordenes`.
- **`factura_plataforma_cuota(p_org, p_tramo_desde, p_plan_id, p_tipo, p_primera boolean)`** → la cuota de un
  tramo, o nada. Sin plan o sin costo base: nada. Si no, precio y descuentos de `plan_precio_historial` con el
  mayor `desde_at ≤ p_tramo_desde`, `costo = plan_costo_del_periodo(…, p_tipo)`, `S =
  plan_inicio_periodo_calendario(p_tipo, p_tramo_desde)`, `E = plan_fin_periodo_calendario(p_tipo,
  p_tramo_desde)`, `dias_periodo = plan_dias_de_calendario(S, E)`:
  - `S = p_tramo_desde` (R8): `cuota = costo`, `dias_cobrados = dias_periodo`;
  - si no y `p_primera` (R29): `dias_cobrados = plan_dias_de_calendario(p_tramo_desde, E)`, `cuota =
    plan_costo_del_tramo(costo, dias_cobrados, dias_periodo)`;
  - si no: nada (R8, segundo caso);
  - y además **nada si el período `[S, E)` ya tiene cuota** en una factura de la empresa (cerrada con
    `cuota_desde_at` o `primera_cuota_desde_at` en `[S, E)`, o no cerrada con marca en `[S, E)`, salvo la marca
    que se está calculando): cada período se cobra una sola vez (R8, R29).
  Devuelve también el plan (id, nombre, tipo) y el tramo `[p_tramo_desde, E)`.

**Qué cuotas lleva una factura que se emite en X** (la regla, en `cerrar` y en `en_curso`). Sea `N` la factura con
`desde_at = X` (la siguiente). En este orden:
1. **primera cuota**, solo con marca M: `cuota(p_org, M, P.plan_id, P.tipo_cobro, true)`, donde `P` es la factura
   con `desde_at = M`: `N` si M = X (por adelantado: R28, R16 con la emitida en D abierta) o la propia factura si
   M = su `desde_at` (a período vencido: R16, P18). Va al grupo `primera_cuota_*` (R16, R28, R29);
2. **cuota de la emisión**: `cuota(p_org, X, N.plan_id, N.tipo_cobro, false)`, que ya ve la marca del paso 1 en la
   comprobación de «una sola vez» (con M = X y X inicio de período, no se cobra dos veces). Va al grupo `cuota_*`
   (R8, R9).

Así una factura de R16 con P18 cuya emisión es inicio de un período lleva las dos (quincenal desde el 1 aplicado el
12: la primera del 1 al 16 y la de la quincena del 16). Con un plan mensual desde el 1, la emitida el 16 solo lleva
la primera (el 16 no es inicio de un mes).

La factura sembrada no tiene marca (R26): el período en curso al desplegar no empieza en ninguna emisión, así
que nunca se cobra (P15).

### 2.5 `factura_plataforma_cerrar(p_org, p_ahora)` — R3, R4, R11, R14, R39

Cerrojo de la empresa, `avanzar(p_org, p_ahora)` (con el fin guardado, P20), y cada `por_cerrar` con `hasta_at ≤ p_ahora − 5 minutos`, en
orden de `desde_at`:
- **espera (R39):** si la empresa tiene `plan_cambio_desde_at ≤ hasta_at` (un cambio o una primera asignación que
  la cola aún no aplicó), se detiene ahí y no cierra esa ni las siguientes; las cierra la primera corrida tras
  aplicarse el cambio. Igual con una edición programada de la periodicidad de órdenes del plan de la empresa
  (`plan_cambio_programado` que cambia `periodicidadOrdenes`) sin aplicar: `avanzar` llega solo hasta justo antes
  de su efecto, así la factura cuyo fin la alcanza sigue en curso y la siguiente no se abre con la periodicidad
  vieja (R36, R39; humano 2026-11-11, review m4);
- si no, se cierra con `ordenes(desde, hasta)`, las cuotas de §2.4 (con `N`, que siempre existe porque `avanzar`
  ya la abrió), su número y `cerrada_at`.
Idempotente por el cerrojo y el estado.

### 2.6 `factura_plataforma_en_curso(p_org)` — R24

La de T2, con el fin previsto = `fin_natural_at` de la factura (P20; antes se calculaba desde `desde`), la `periodicidad` en el JSON, las
órdenes con `ordenes(desde, LEAST(now(), fin))` y las dos cuotas previstas, cada una nula cuando no la llevará:
con marca M ya escrita, la primera cuota `cuota(p_org, M, plan, tipo, true)` con el plan de la factura con `desde`
= M, como `cerrar` (en la en curso, una marca escrita solo puede ser su `desde`, P18); y la de la emisión en ese
fin, `cuota(p_org, fin, plan, tipo, false)` con el plan del cambio pendiente si `plan_cambio_desde_at ≤ fin`, y si
no con el mismo plan que usará `cerrar` (el de la factura siguiente; humano, 2026-11-11: `en_curso` se iguala a
`cerrar`).

**Una primera asignación pendiente** (la empresa sin plan, con `plan_cambio_*`; humano 2026-11-11, review m3 y m7)
se muestra desde que se guarda como la dejará la toma de §2.3, sin escribir nada. Sea E su efecto y D el `desde`
de la en curso:
- **E > D y E < su fin natural, con la en curso sin plan (R28):** la en curso se muestra fijada en E (`hasta` = E,
  órdenes hasta `LEAST(now(), E)`) con la marca prevista en E: la primera cuota es `cuota(p_org, E, plan nuevo,
  tipo nuevo, true)`;
- **E = su fin natural:** lo mismo, con la marca prevista en E en la en curso (es lo que deja §2.3 vía `avanzar`);
  su fin no cambia;
- **E ≤ D (la cola va tarde):** la marca prevista va en D, en la por cerrar que acaba en D o, si no la hay, en la
  en curso; la primera cuota es `cuota(p_org, D, plan nuevo, tipo nuevo, true)`. Además la en curso se muestra ya
  con la **periodicidad de órdenes del plan nuevo** y su fin natural recalculado con ella
  (`plan_fin_periodo_calendario(periodicidad nueva, D)`, la misma que usa la toma), y su cuota prevista se calcula
  en ese fin. Ejemplo: plan de órdenes mensuales con inicio el 1 y la en curso del 1 sin plan (quincenal): se ve
  mensual, hasta el 1 del mes siguiente y con la cuota de ese mes, no hasta el 16;
- **E más allá del fin natural, o E > D y antes del fin con la en curso con plan (R15):** nada previsto (la toma
  lo resolverá tras `avanzar`, o no hace nada).

En los tres primeros casos, la marca prevista descarta, como la real, la cuota de la emisión cuyo período la
contiene (§2.4): el período que empieza en la marca se cobra una sola vez, con la primera cuota. El plan de la
factura (`plan_id`, `plan_nombre`, `tipo_cobro`) no se adelanta: sigue sin plan hasta que la cola aplica la toma.

**Un cambio de plan pendiente con la cola tarde** (la empresa ya con plan, `plan_cambio_desde_at` = E ≤ D; humano
2026-11-11, gemelo de m7): la en curso se muestra ya con la **periodicidad de órdenes del plan nuevo** y su fin
natural recalculado con ella (`plan_fin_periodo_calendario(periodicidad nueva, D)`, como la deja §2.3 paso 2), y su
cuota prevista se calcula en ese fin con el plan del cambio pendiente (E ≤ fin). No hay marca (no es primera
asignación) y el plan de la factura no se adelanta: sigue el de antes hasta que la cola aplica la toma. Ejemplo: plan
de órdenes quincenales y cambio al 1 a uno de órdenes mensuales que la cola aún no aplicó a las 00:10: la en curso
del 1 se ve mensual, hasta el 1 del mes siguiente y con la cuota de ese mes del plan nuevo, no hasta el 16. Con E > D
no se recalcula nada (§2.3 paso 3: la toma no toca la en curso con plan).

### 2.7 El tope del pago (SL-45) — R18, R19

El de T2, con una sola diferencia: suma `COALESCE(cuota, 0) + COALESCE(primera_cuota, 0)` de las cerradas.

### 2.8 La factura sembrada histórica (R26; humano 2026-11-11; P20 cerrada con la opción (a))

**Inicio.** `desde` = las 00:00 de la plataforma (−06:00) del día de `organizacion.created_at`, no el
`created_at` exacto: es la misma regla que §2.2 paso 1 usa para una empresa dada de alta después («desde las 00:00
del día de su alta», R26), así las dos siembras dan el mismo `desde`. No cambia las cifras: ningún movimiento
de la empresa es anterior a su alta.

**Fin y emisión.** El primer corte de su periodicidad posterior a `now()` de la migración (desplegado el 10 de
noviembre con órdenes quincenales: el 16 de noviembre; mensuales: el 1 de diciembre). La siembra lo escribe en
`fin_natural_at` = `plan_fin_periodo_calendario(periodicidad, now() AT TIME ZONE 'UTC')` (P20). Hasta el 16 se lee
como la factura en curso del 3 de septiembre al 15 de noviembre; se emite una sola, el 16.

Revisado contra lo ya escrito, con una sembrada más larga que un corte (la columna «¿Choca?» es la de antes de
P20; la última columna dice cómo queda):

| Pieza | ¿Choca? | Por qué y cómo queda con P20 |
|---|---|---|
| Número correlativo (R14, P1) | No | Se asigna al cerrar, por empresa desde 1: la sembrada es la primera que cierra, número 1 |
| CHECK `factura_plataforma_estado_fin` (`hasta_at > desde_at`) | No | No limita el largo |
| CHECK de la cuota y de la primera cuota | No | La cuota de la emisión es la del período que empieza en el `hasta` (`cuota_desde_at` = emisión); la sembrada no lleva marca |
| `factura_plataforma_ordenes` (R5–R7) | No | Suma `[desde, hasta)` sin tope de largo: lleva todo el histórico, cargos y reversos |
| `factura_plataforma_cuota`, «un período una sola vez» (§2.4) | No | Solo cobra en la emisión y con marca; los períodos anteriores a la emisión no se cobran (P15) |
| **`avanzar` (§2.2) y el job** (`cerrar` llama a `avanzar`) | **Sí** | El fin natural sale de `desde`: `plan_fin_periodo_calendario(quincenal, 3 sep)` = 16 sep ≤ ahora. La primera corrida fijaría la sembrada el 16 de septiembre, abriría y fijaría una por corte hasta el 1 de noviembre y las cerraría todas de golpe (cinco facturas, números 1–5), no una emitida el 16 de noviembre. **Con P20:** lee `fin_natural_at` (16 nov): nada se fija antes |
| **`tomar_cambio` (§2.3)** | **Sí** | Paso 1 es `avanzar`: resuelto igual. El reparto de casos compara con D = 3 sep: una primera asignación con inicio después de D cae en R28 (fija la sembrada en E y la emite con sus órdenes y la primera cuota); un cambio con plan, en R15 (nada). **Con P20:** se queda así, que es R15 y R28 tal como están escritos; en R16 recalcula `fin_natural_at` (§2.3) |
| **`en_curso` (§2.6, R24)** | **Sí** | Mostraría fin el 16 de septiembre. **Con P20:** el fin previsto es `fin_natural_at`; los casos de la primera asignación y del cambio pendiente con la cola tarde (E ≤ D) siguen comparando con D y su vista previa sigue calculando el fin con la periodicidad nueva, como la toma |
| Cambio de periodicidad del plan (R36) | Sí, el mismo | **Con P20:** el fin guardado no se mueve al editar el plan; la siguiente se abre en ese fin con la periodicidad nueva |

El choque era uno: la base suponía que el fin natural de una factura en curso es el fin del corte que contiene su
`desde`, y la sembrada histórica no lo cumple. Con P20 cada factura guarda su fin al abrirse y nadie lo vuelve a
calcular desde `desde`.

## 3. Capa de la app

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tipos | `lib/types/factura-plataforma.ts` | `FacturaPlataformaDTO` (cerrada o en curso, importes como texto, con `periodicidad`, la cuota y la primera cuota, cada una con su plan y su tramo, o `null`), `EstadoFactura` |
| Contrato | `lib/interfaces/repositories/IFacturaPlataformaRepository.ts` | `empresasACerrar`, `cerrar`, `deLaEmpresa`, `deEmpresaParaPlataforma` |
| Repositorio | `lib/repositories/FacturaPlataformaRepository.ts` | Los cuatro métodos; ninguno escribe la tabla |
| Excepción | `lib/db/excepciones-aislamiento.ts` | Entrada en `EXCEPCIONES_DE_PLATAFORMA`, ficha `"SL-24"` (deuda D29) |
| Trabajo | `lib/planes/jobs-factura-plataforma.ts` | Handler, recurrencia, siembra y composition root (§4) |
| Toma del cambio | `lib/repositories/PlanesRepository.ts` | `SELECT factura_plataforma_tomar_cambio(…)` en `aplicarEnTx`, antes del `UPDATE` |
| Deuda | ver §5 | |
| Fecha de efecto del superadmin | `PlanesRepository`, `IPlanesRepository`, `PlanesService`, `lib/types/planes.ts`, `PlanEmpresa.tsx`, `PlanesModule.tsx` | §3.1 (R30–R34) |
| Periodicidad del plan | `lib/types/planes.ts`, `PlanesRepository`, `IPlanesRepository`, `PlanesService`, `lib/planes/rastro.ts`, `lib/planes/mensajes.ts`, `PlanForm.tsx` | §3.2 (R35–R37) |

Las facturas no tienen action, servicio ni pantalla (SLT-119). El acceso lo garantizan la RLS, el `REVOKE` y el
control de contexto (R21–R24).

### 3.1 La fecha de efecto de un cambio del superadmin — R30–R34 (sin cambios)

En `PlanesRepository.cambiarEmpresaEnTx`, bajo el cerrojo de la empresa y antes de decidir entre pendiente y
aplicar, solo si `efecto.clase === "cambio"` (una primera asignación no se toca: R33). Con el **tipo de
referencia** `tipo` = el de mayor índice en `TIPOS_COBRO` entre el vigente (`empresa.plan_tipo_cobro`) y el
nuevo (P9):
- si `F` ya es inicio de un período de `tipo` (`inicioDelPeriodoCalendario`), se respeta (R31);
- si no, `F' = fechaDeEfectoPorDefecto(tipo, inicioDelDiaPlataforma(F))` (R30).

Los períodos están anidados: `F'` es emisión de la factura en curso y, con R37, también corte de órdenes de los
dos planes (R38, §2.3). El rango (`fueraDeRango`, SLT-86 R16) sigue sobre la fecha elegida (R34, P10). El `ok` de
`asignar`, `crearYAsignar` y `cambiarTipoCobro` gana `vigenteDesde?: string` con la fecha real cuando queda
pendiente; `CambiarTipoCobroResult` gana `vigenteDesde: string | null` (R32). Las dos confirmaciones
(`PlanEmpresa.tsx` al cambiar el tipo y `PlanesModule.tsx` al crear el custom) pintan esa fecha (P11).

### 3.2 La periodicidad de órdenes del plan — R35–R37 (sin cambios; P12–P14 cerradas como se propusieron)

**Esquemas (`lib/types/planes.ts`).**
- `PERIODICIDADES_ORDENES = ["quincenal", "mensual"] as const`, su tipo y `periodicidadOrdenesSchema = z.enum(…)`.
- `crearPlanSchema` y `edicionDelPlan` ganan `periodicidadOrdenes: periodicidadOrdenesSchema.optional()`. Al
  crear, ausente = `quincenal` (el `DEFAULT` de la columna); al editar, ausente = sin cambio. Opcional para no
  tocar las ~60 peticiones de los tests de planes que no la conocen; el formulario la manda siempre.
- `versionPlanSchema` la hereda: viaja en la versión programada y una versión guardada antes, sin ella, sigue
  validando.
- `crearPlanSchema` gana un refine de R37: `tipoCobro === "quincenal"` con `periodicidadOrdenes === "mensual"` →
  `validation_error` en `tipoCobro` (el custom de una empresa).
- `PlanDTO` gana `periodicidadOrdenes?: PeriodicidadOrdenes`: las lecturas (`leerPlan`) la llenan siempre;
  opcional en el tipo para no tocar los dobles de `PlanDTO` de 39 archivos de test. `VersionPlan` la incluye.

**Repositorio (`PlanesRepository.ts`).**
- `crear` la escribe; `leerPlan` la lee; `aplicarVersion` la escribe si viene (inmediata y programada).
- **R37 al editar.** Donde la edición ya mira los topes (con el plan bloqueado, `bloquearPlanParaEscribir`), si la
  versión pone `mensual` y el plan tenía `quincenal`: cuenta las empresas con `plan_id` = el plan y
  `plan_tipo_cobro = 'quincenal'`, y las que lo tienen como cambio pendiente con tipo quincenal. Si hay alguna,
  devuelve `{ estado: "periodicidad_incompatible", empresas: n }` sin escribir. Vale al guardar y al aplicar la
  programada (en `aplicarCambioProgramado` lanza, el trabajo falla sin escribir).
- **R37 al asignar.** En `cambiarEmpresaEnTx`, con el plan ya leído bajo el cerrojo: tipo `quincenal` con plan
  `mensual` → `{ estado: "periodicidad_incompatible" }` sin escribir. Cubre asignar, `crearYAsignar` y
  `cambiarTipoCobro`.
- `IPlanesRepository`: los resultados de editar, asignar, crear y cambiar el tipo ganan esa variante.

**Servicio (`PlanesService.ts`).** Mapea `periodicidad_incompatible` a `validation_error`: en `tipoCobro` al
asignar, crear y cambiar el tipo; en `periodicidadOrdenes` al editar, con el número de empresas. Mensajes en
`lib/planes/mensajes.ts`.

**Rastro (`lib/planes/rastro.ts`).** `periodicidadOrdenes` entra en las claves de `CambiosDelPlan`, en la forma
canónica y en `diferenciasDelPlan` (R35).

**Pantalla (`PlanForm.tsx`).** Un selector «Facturación de órdenes»: «Quincenal (cortes el 1 y el 16)» o
«Mensual (del 1 a fin de mes)», con `quincenal` al crear y el valor del plan al editar; se manda siempre. El error
de campo `periodicidadOrdenes` se pinta como los demás.

## 4. El proceso de cierre

### 4.1 Tipo de trabajo
`factura_plataforma_cerrar`: valor de `job_tipo` en su propia migración (`20261111130000`, hecha en T2). Núcleo
en `MODULO_POR_JOB`.

### 4.2 Recurrente de plataforma
En `RECURRENTES_DE_PLATAFORMA`: una vez, en plataforma. `empresasACerrar()`, y para cada una `cerrar(id, now())`
en su transacción; un fallo se anota y sigue (R12); al final lanza con los ids. Cada hora a los :10
(`dedupe_key = factura_plataforma_cerrar:<AAAA-MM-DDTHH>`); la primera fila la siembra `SIEMBRAS_RECURRENTES`.
Sin correos (R25). Una factura en espera (R39) no es un fallo: no lanza.

### 4.3 Margen de cierre: 5 minutos
Un cargo se registra con `ocurrido_at = now()` (inicio de su transacción). La transacción más larga de la app
dura 30 s; 5 minutos dejan holgura y la corrida de las :10 ya cae fuera. Por eso la toma del cambio fija y no
cierra. Residuo: un movimiento con `ocurrido_at` atrasado más de 5 minutos caería en una cerrada; hoy ninguno.

### 4.4 La cola y la cuota adelantada
El cambio pendiente se aplica a las 00:00 de su efecto (SLT-86); el cierre corre a las :10. Con la cuota por
adelantado, si el cierre se adelantara al cambio, la factura emitida en el efecto saldría con la cuota del plan de
antes. La espera de R39 lo evita: mientras `plan_cambio_desde_at ≤ hasta_at`, esa factura no se cierra. Si la cola
estuvo caída, la emisión se retrasa pero sale con la cuota correcta.

## 5. La deuda con la plataforma — R18–R20, R40

Σ cargos − Σ reversos + Σ (`cuota` + `primera_cuota`) de facturas `cerrada` − pagos vigentes (P18: una factura
puede llevar las dos). Base: el tope del pago (§2.7). App: `SumaCobroPlataformaPorTipo.tipo` con `"cuota"`;
`CobroPlataformaMovimientoRepository.sumasPorTipo` añade las dos columnas por `facturaPlataforma.aggregate` (`_sum`
de las dos, sumadas en decimal); `derivarDeudaPlataforma` resta solo `reverso`;
`EmpresasPlataformaRepository.cuentasConLaPlataforma` añade el `groupBy` de las dos columnas de cuota. El cierre no escribe en
`cobro_plataforma_movimiento`, `cobro_plataforma_traza` ni `wallet_movimiento` (R20). Sin devoluciones (R40):
ninguna función resta cuotas; la cerrada no cambia (R13).

## 6. Migraciones

`A mano: db:migrate:create falla con P3006 en este repo (ver 20261022130000).` Las dos están en la rama y no en
`dev`: se editan en su sitio.

### 6.1 `20261111130000_factura_plataforma_job_enum` (hecha en T2, sin cambios)

### 6.2 `20261111130100_factura_plataforma` (se rehace en parte, §0.3)
Con `BEGIN`/`COMMIT`. Pasos:
1. `ALTER TABLE "plan" ADD COLUMN "periodicidad_ordenes" TEXT NOT NULL DEFAULT 'quincenal'` con su CHECK (R35);
2. tabla con `periodicidad`, `fin_natural_at` (P20), las columnas de la cuota, la marca y el grupo de la primera cuota, y los CHECK de
   §1.1; únicos, índice, FK, RLS, política, `REVOKE`, sin cambio de empresa e inmutabilidad (§1.3);
3. funciones de §2 (`abrir`, `avanzar`, `tomar_cambio` con la firma de T2, `ordenes`, `cuota`, `cerrar` con la
   espera, `en_curso`);
4. tope del pago, sumando también `primera_cuota` (§2.7);
5. **siembra (R26, P15; factura histórica 2026-11-11):** una `en_curso` por cada empresa que existe al migrar,
   con `desde` = las 00:00 de la plataforma del día de su `created_at` (§2.8), la periodicidad del plan de la
   empresa o `quincenal` sin plan, el plan y el tipo copiados, **sin marca**, y `fin_natural_at` = el primer
   corte tras `now()` de la migración (P20, §2.8). Antes (T2.5): `desde =
   plan_inicio_periodo_calendario(periodicidad, now() AT TIME ZONE 'UTC')`; lo rehace T16.

`down.sql` (R27): la negativa de T2, que mira `cuota` o `primera_cuota` no nulas; después el tope de origen, los `DROP` (con las firmas nuevas) y `ALTER TABLE
"plan" DROP COLUMN "periodicidad_ordenes"`. Orden de bajada: la 6.2 y después la 6.1.

## 7. Datos que dependen del país

- **Moneda:** ninguna (SL-21).
- **Hora:** el −06:00 fijo de la plataforma hasta SLT-90 «Planes: ciclo y cobro en la zona de cada empresa». Solo
  en SQL: ningún literal de zona en TS.
- **Impuestos y métodos de pago:** fuera (SL-21; el pago sigue siendo el de la wallet, SL-45).

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/factura-plataforma-cierre.test.ts` | R1–R9, R11, R14, R26, R27 | Base real, reloj por `p_ahora`; empresas: sin plan (quincenal), mensual con órdenes quincenales (cuota de diciembre en la emitida el 1 de diciembre, ninguna en la emitida el 16), anual con órdenes mensuales (cuota solo en la emitida el 1 de enero), quincenal (cuota de la quincena que empieza en cada una); bordes de `ocurrido_at`; precio editado; dos cierres a la vez; siembra (P15: quincenal → primera cuota el 16 de noviembre, mensual → el 1 de diciembre, anual → el 1 de enero; ninguna cuota del período en curso); factura histórica (R26, P20, T16: alta el 3 de septiembre migrada el 10 de noviembre → una sola factura `[3 sep, 16 nov)`, ninguna cerrada antes, la emitida el 16 con los cargos y reversos de septiembre a noviembre y número 1; `en_curso` con ese `desde` y fin el 16; una empresa creada tras la migración, desde las 00:00 de su alta); ida y vuelta con y sin cuota cerrada |
| `tests/integration/db/factura-plataforma-cambio-plan.test.ts` | R5 (las dos cuotas), R8 (pendiente por SQL a mitad de período), R15–R17, R28, R29, R30 (P9), R33, R36, R38, R39 | `PlanesRepository` real: mensual → quincenal con efecto el 1 de diciembre (la emitida el 1 de diciembre con la cuota quincenal del plan nuevo); el mismo por SQL el 10; inicio el 1 aplicado el 12 en el acto (P18: ninguna factura nueva al aplicar; la emitida el 16 con las órdenes del 1 al 15, la primera cuota del 1 al 15 y la de la quincena del 16, 15 500.00 cada una; con mensual, solo la de noviembre, 31 000.00, y la de diciembre en la emitida el 1 de diciembre); inicio el 1 aplicado el 20 (las dos quincenas en la emitida el 1 de diciembre; la cerrada del 1 al 15 igual); alta el 10 con inicio el 10 (P19: ninguna factura con `hasta` el 10; la emitida el 16 con órdenes del 10 al 15, la primera cuota del 10 al 15, 6 200.00, y la del 16 al 30, 15 500.00; la emitida el 1 de diciembre con 15 500.00); inicio el 16 aplicado por la cola (marca en la emitida el 16, sin corte); inicio el 5 (11 366.67 en la del 1 al 4) y el 18 futuro (13 433.33 en la del 16 al 17; P17: una sola factura emitida en E); anual desde el 18 con órdenes quincenales (44 de 365; ninguna en diciembre; la anual en la emitida el 1 de enero); quincenal → anual guardado por `PlanesService` el 10 de noviembre; cambio a un plan con órdenes mensuales (R38); periodicidad editada en los dos sentidos (R36; con P20, el `fin_natural_at` de la en curso no se mueve, T16.3); espera del cierre con un cambio pendiente sin aplicar a las 00:10 y cierre tras aplicarlo (R39); aplicado tarde, antes y después de un cierre; `UPDATE` de la periodicidad de una `por_cerrar` o de una marca ya puesta → `SL118` |
| `tests/integration/db/planes-periodicidad-ordenes.test.ts` (**nuevo**) | R35, R37 | `PlanesService` con el repositorio real: crear con y sin periodicidad; editar en el acto y programada (rastro, `aplicarCambioProgramado`); un plan creado sin ella queda quincenal; valor inválido; R37 al asignar, crear custom y público, cambiar tipo, editar a mensual con una empresa quincenal y con un pendiente quincenal, y una programada que deja de pasar |
| `tests/components/PlanFormPeriodicidad.test.tsx` (**nuevo**) | R35 | El selector con `quincenal` al crear y el del plan al editar; lo manda; pinta el error de campo |
| `tests/integration/db/planes-cambio-empresa.test.ts` (se amplía) | R30, R31, R33, R34 | Como antes |
| `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` (se amplía) | R30, R31 | Como antes |
| `tests/integration/db/planes-crear-custom-asigna.test.ts` (se amplía) | R30 | Como antes |
| `tests/integration/db/planes-asignacion.test.ts`, `plan-de-la-empresa-periodo.test.ts`, `planes-cancelar-cambio-historial.test.ts` | — | Solo se ajustan (fechas a mitad de período o «hoy») |
| `tests/unit/services/planes-service-periodo.test.ts`, `planes-service-tipo-cobro.test.ts` (se amplían) | R30, R32, R34 | Como antes |
| `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanesModule.test.tsx` (se amplían) | R32 | Como antes |
| `tests/integration/db/factura-plataforma-deuda.test.ts` | R18–R20, R40 | Como antes; R18 con una factura de dos cuotas (la deuda y el tope suben en las dos); R40: un cambio aplicado tras emitir una cuota no la devuelve ni baja la deuda |
| `tests/integration/db/factura-plataforma-aislamiento.test.ts` | R13, R21–R24 | Como antes; R24 con la cuota prevista de la emisión (plan mensual: la del 16 al 30 con la de diciembre, la del 1 al 15 sin), con el plan de un cambio pendiente y con las dos previstas (quincenal desde el 1 aplicado el 12) |
| `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` | R10, R29 | Como antes |
| `tests/unit/planes/jobs-factura-plataforma.test.ts` | R3, R12, R25 | Como antes |
| `tests/unit/utils/deuda-plataforma.test.ts` | R18 | Como antes |
| `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | R22 | Como antes |

E2E: diferido a SLT-119 (decisión «¿E2E?»). Antes del PR se corren en local el grupo `dinero` y
`e2e/dos-empresas-humo.spec.ts` (`docs/perfil-agentes.md`).

## 9. Alternativas descartadas

- **La sembrada histórica ya fijada como `por_cerrar`** (P20 (b)): sin columna nueva, pero no se lee como en
  curso hasta su emisión (R24) y una primera asignación o un cambio antes de esa fecha la ven como `por_cerrar`.
  Tampoco una `fin_natural_at` nula salvo en la sembrada: dos caminos para el fin. Elegida (humano, 2026-11-11):
  `fin_natural_at NOT NULL` en todas (§1.1, §2.8).

- **La cuota a período vencido** (el design anterior: la cuota en la factura cuyo `desde` es el inicio de su
  período, emitida al final del corte). La descartó el humano el 2026-11-10: la cuota se cobra por adelantado.
- **La fila de la factura = la emisión, con la cuota de su propio `desde`** (una fila abierta en el corte que lleva
  la cuota que empieza ahí y las órdenes del corte anterior). La factura en curso dejaría de ser el intervalo de
  sus órdenes: R1, R6, R7 y la lectura en curso (R24) se complican, y la tanda 1 se rehace entera. Elegida: la
  fila sigue siendo el intervalo de órdenes y la cuota es la de su emisión, con el plan de la factura siguiente.
- **Una factura aparte solo de cuota en cada inicio de período.** Dos facturas en el mismo instante en cada
  inicio, contra «un solo tipo de factura» y «una factura por corte». Descartada también para la primera cuota de
  una empresa que ya operaba sin plan (P17: una sola factura).
- **Calcular la cuota al fijar la factura, no al cerrarla.** Un cambio aplicado por la cola segundos después del
  corte quedaría fuera. Elegido: se calcula al cerrar, con la espera de R39.
- **Cerrar igual sin esperar al cambio pendiente** y que el plan nuevo empiece a cobrar en el período siguiente.
  Con la cola en hora casi nunca pasa, pero cuando pasa la empresa paga un período con el plan equivocado y sin
  devoluciones (R40) no hay arreglo. La espera cuesta una columna ya existente y un `if`.
- **Cortar la factura en curso al aplicar un inicio pasado y emitirla ya con la cuota** (propuesta de P18):
  cobraba por adelantado, pero dejaba una factura que no termina en un corte. La descartó el humano (P18): la
  cuota espera al próximo corte.
- **Las dos cuotas de P18 en una sola columna `cuota`** (sumadas, con un solo tramo `[D, fin del período
  siguiente)`). Se pierde qué período cubre cada una, su precio y sus días, y la comprobación de «una sola vez»
  por período (§2.4) deja de poder mirar los tramos. Elegido: un grupo de columnas aparte para la primera cuota.
- **Una tabla hija de cuotas (`factura_plataforma_cuota`, N por factura).** Más general, pero suma una tabla con
  su RLS, `REVOKE`, inmutabilidad, guardia y su entrada en la deuda, para un máximo de dos cuotas por factura.
- **La factura atada al período de cobro de la cuota** (una factura por período de cobro; un plan anual daba una
  factura al año): descartada con la periodicidad de órdenes.
- **Dos tipos de factura (una de cuota y una de órdenes), con plazos distintos.** El humano pidió un solo tipo y
  un solo plazo.
- **La periodicidad en la empresa y no en el plan**: el humano la puso en el plan.
- **Cuota quincenal con órdenes mensuales permitida**: rechazada con P12.
- **Mirar la periodicidad en el tipo de referencia de R30.** Innecesario con R37 (§2.3).
- **`periodicidadOrdenes` obligatoria en los esquemas y en `PlanDTO`.** Obliga a tocar ~60 tests sin ganar nada.
- **Una acción aparte «Cambiar periodicidad de órdenes».** Más archivos; el humano pidió el formulario de planes.
- **Movimiento sin orden en el libro de cargos** y **tabla-libro de cuotas aparte**: §1.4.
- **Cortar la factura en el efecto de un cambio y prorratear** (propuesta original de P3): rechazada por el humano.
- **Prorratear toda factura más corta que su período**: el humano lo limitó a la primera cuota (P6).
- **P7, P9, P10 y P11**: las alternativas de su momento siguen descartadas por las decisiones del humano.
- **Calcular la cuota en TS y pasarla al cierre**: la base escribiría en la deuda un importe que no puede
  comprobar.
- **Calcular las facturas al vuelo, sin guardarlas**: contradice «una factura cerrada no cambia».
- **Recurrente por empresa (`paraCadaEmpresa`)**: corre como `servi_app`, que no puede cerrar.

## 10. Residuos y riesgos

- **P19 cerrada** (alta con plan desde ese mismo día): sin excepción. La primera factura de la empresa sale en el
  próximo corte con sus órdenes y dos cuotas (quincenal 15 500 con alta el 10: 6 200.00 + 15 500.00 el 16). Se
  descartó cortar la factura al aplicar y emitirla con órdenes en 0 y la cuota: era la factura extra que P18 ya
  descarta, y una excepción solo para el alta en `tomar_cambio`.
- **A período vencido en P18.** La primera cuota de un inicio pasado cuya factura ya salió se cobra al final del
  corte, junto con la del período siguiente si ese corte es inicio de período: esa factura puede llevar dos
  cuotas (quincenal: 31 000.00 en una sola emisión). Es la decisión del humano.
- Un plan con efecto anterior a una factura ya cerrada no cambia esa factura (R16, P4). En un **cambio** aplicado
  así (solo por SQL o un pendiente de antes de esta ficha; la cola espera, R39), la cuota del plan nuevo de ese
  período no se cobra.
- Los pendientes guardados antes de esta ficha con efecto a mitad de período: las órdenes de la factura en curso
  van enteras con el plan de antes, pero el costo por orden nuevo rige desde ese día (SL-40). La emisión siguiente
  lleva la cuota del plan nuevo si es inicio de su período; si no, sin cuota hasta su próximo inicio. Puede pagar
  dos planes por días que se solapan, sin devolución (R40). Desde R30 no se pueden guardar nuevos.
- Una cuota adelantada de un período largo (anual) queda en la deuda el 1 de enero; el plazo de pago y la mora
  son de SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora».
- Con la espera de R39, una cola caída retrasa la emisión de la empresa con un cambio pendiente hasta que se
  aplica.
- Una edición programada de la periodicidad que deja de pasar R37 entre que se guarda y se aplica falla el
  trabajo y el plan sigue como estaba; el superadmin lo ve en la cola.
- El cambio del maestro de SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de
  plan» no pasa por §3.1 ni por R37. Si permite un tipo más largo o un plan con órdenes mensuales con tipo
  quincenal, las reglas de P9 y R37 tendrían que aplicarse allí; el reviewer de la que mergee segunda lo mira.
- Choque al mergear con SLT-99 (PR #115): `PlanesRepository.ts`, `IPlanesRepository.ts`, `lib/types/planes.ts`,
  `excepciones-aislamiento.ts`. Sin lógica duplicada.
- Movimientos con instante atrasado más de 5 minutos (§4.3): ninguno hoy.
- Tamaño: 49 archivos y ~2 600 líneas (aceptados con P16).
