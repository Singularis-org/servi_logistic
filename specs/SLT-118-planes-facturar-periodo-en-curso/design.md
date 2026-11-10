# SLT-118 — planes-facturar-periodo-en-curso · design.md

> Requisitos: `requirements.md` (R1–R38; P1–P11 cerradas por el humano el 2026-11-10; **P12–P16 abiertas**).
>
> **Cambio de fondo del humano (2026-11-10, tras aprobar el spec).** Las órdenes ya no se facturan con el
> período de cobro de la cuota: cada plan define su **periodicidad de órdenes** (quincenal o mensual), la
> empresa sin plan factura quincenal, hay una factura por **corte** y la cuota se suma en la factura cuyo
> `desde` es el inicio de su período de cobro. Este design lo aplica y dice qué se conserva y qué se rehace del
> código de la tanda 1 (§0). Lo pendiente de P12–P15 está escrito con la propuesta de cada una y marcado.
>
> Antes: sin corte ni prorrateo (P3); la cuota es la del período completo, salvo la primera factura con plan
> más corta, que prorratea (P6, R29); la primera asignación corta la factura sin plan en su día (P8, R28); el
> servidor del superadmin lleva la fecha de efecto al inicio del período del **tipo de referencia** (P7, P9,
> R30–R34, §3.1), lo que modifica SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de
> órdenes» R16–R18. Hereda el diseño de `specs/SL-40-cobro-plataforma-por-orden/`, SL-45 «pago a la plataforma»
> (`20261024140000`), `specs/SLT-85-traza-facturacion-cobros/` y `specs/SLT-86-planes-periodo-facturacion/`
> («SLT-86 Rn»). Escrito por `spec_author` el 2026-11-10. Sin dependencias nuevas: todo es Postgres, Prisma, zod
> y React, ya aprobados en `docs/dependencias.md`.

## Lo que ya existe

Busqué el 2026-11-10 con `factura`, `factura_plataforma`, `estado de cuenta`, `cuota`, `costo base`,
`cerrar período`, `deuda con la plataforma` y, tras el cambio de fondo, `periodicidad`, `periodicidad_ordenes`
y `corte`, en tres sitios:

- **el board** (`feature_list.json`): solo esta ficha y sus dos hijas, SLT-119 «Planes: pantallas de facturas
  para el superadmin y el maestro» y SLT-120 «Planes: facturar el período en curso (1–15) tras asignar los
  primeros planes». Ninguna ficha define una periodicidad de órdenes por plan. «Estado de cuenta» sale en la
  ficha «Estado de cuenta de la satélite: conciliación en pestaña», sin relación;
- **`specs/`**: ninguna factura de la plataforma ni periodicidad de órdenes. «Estado de cuenta» aparece en los
  specs de la wallet de tiendas, mensajeros y satélites (458, 464, SLT-73, SLT-95…), que son otra cosa;
- **el código**: el grafo `codebase-memory-mcp` no tiene proyecto para este worktree, así que busqué con Grep y
  Read en `db/`, `lib/`, `app/` y `tests/`. Lo único de facturas es lo que dejó la tanda 1 de esta misma ficha
  (§0). `Plan` no tiene ninguna columna de periodicidad; el «ciclo de órdenes» de SLT-58 es el ancla de los
  topes, no una periodicidad de facturación.

Lo que existe y se reutiliza:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| **El código de la tanda 1 de esta ficha** | `d237afe7` (T1: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`), `0e58af60` (T2: `db/migrations/20261111130000_factura_plataforma_job_enum/`, `db/migrations/20261111130100_factura_plataforma/`) | Se conserva casi todo y se rehace lo atado al período de la cuota (§0). Las migraciones no están en `dev`: se editan en su sitio, sin migración nueva |
| El libro de cargos y reversos, con su índice `(organizacion_id, ocurrido_at)` | `cobro_plataforma_movimiento`, `20261023130100`, `20261104150200` | **No se toca.** Se suma por `ocurrido_at` (R5, R6) |
| La traza por movimiento, con `cobrado_at = ocurrido_at` e índice `(organizacion_id, cobrado_at)` | `cobro_plataforma_traza`, `20261109120000` | Es el detalle por orden (R7). No se copia ni se toca |
| El período de calendario en SQL: `plan_inicio_periodo_calendario`, `plan_fin_periodo_calendario` (admiten `quincenal` y `mensual`) | `20261106120000` | Dan el fin natural de una factura **con su periodicidad** (R2), el inicio del período de cobro (R8) y su fin y sus días (R29) |
| El precio por fecha: `plan_precio_historial` | `20261106120000` | El precio de la cuota (R8; SLT-86 R15) |
| El costo del período en TS: `montoDelPeriodo`; el del tramo: `costoDelTramo`, juntos en `costoDelPeriodoEnCurso` | `lib/planes/cobro.ts` | Gemelas de las funciones SQL (§2.1); un test las ata (R10). No se tocan |
| Los casos de calendario | `tests/integration/db/_fixtures/periodo-calendario.ts` | Para los tests de cortes y períodos |
| El único punto que aplica un cambio de empresa: `PlanesRepository.aplicarEnTx` | `lib/repositories/PlanesRepository.ts` | Llama a la toma del cambio (R15, R16, R28) |
| La edición del plan, inmediata o programada, con su versión validada otra vez al aplicarse (`versionPlanSchema`, `aplicarVersion`, `aplicarCambioProgramado`) y su rastro (`diferenciasDelPlan`) | `lib/types/planes.ts`, `lib/repositories/PlanesRepository.ts`, `lib/planes/rastro.ts` | La periodicidad viaja en la versión como un campo más (§3.2, R35); la regla de R37 se mira donde ya se miran los topes al editar |
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
| Prefijo de las migraciones | `20261110130000`, `20261110130100` | `20261111130000`, `20261111130100` | **Aceptado.** Van después de la mayor migración de `dev` al empezar (`20261111120000_bug_report_status`); con `20261110` quedarían antes de una ya aplicada. Las rutas de «Archivos esperados» pasan a `20261111` |
| Función `factura_plataforma_abrir(p_org, p_desde)` | «abrir» era un paso dentro de `avanzar` | Función interna aparte, sin `GRANT` | **Aceptado.** La usan `avanzar` y los dos pasos de `tomar_cambio`; con el cambio de fondo copia además la periodicidad (§2.2), en un solo sitio |
| CHECK `factura_plataforma_cerrada` | número y cifras solo en la cerrada | además: una no cerrada no lleva **ninguna** cifra, precio, cuota ni días | **Aceptado.** Más estricto y coherente con R18 (una en curso no suma a la deuda). No choca con el diseño nuevo: la cuota sigue escribiéndose solo al cerrar |

### 0.2 Qué se conserva tal cual

- La tabla y sus columnas de hoy; los únicos `(organizacion_id, desde_at)`, `(organizacion_id, numero)` y el
  parcial de la en curso; el índice `(organizacion_id, estado)`; la FK `CASCADE`.
- La RLS, la política `factura_plataforma_por_empresa`, el `REVOKE` y el trigger de sin cambio de empresa (R21, R22).
- La inmutabilidad `SL118` de la cerrada (R13).
- `plan_costo_del_periodo`, `plan_costo_del_tramo` y `plan_dias_de_calendario` (la cuota y su prorrateo, R8, R10, R29).
- `factura_plataforma_cerrar` (cerrojo, avance, margen de 5 minutos, número correlativo, R3, R4, R11, R14):
  solo cambia la llamada a `cifras` por su firma nueva.
- El tope del pago con la cuota (R18, R19) y el `down.sql` con su negativa (R27).
- La migración del valor de `job_tipo` (`20261111130000`), entera.
- En Prisma, el modelo `FacturaPlataforma` y su entrada en `MODELOS_DE_NEGOCIO`.

### 0.3 Qué se rehace (todo en los mismos archivos)

| Pieza | Hoy (tanda 1) | Con el cambio de fondo |
|---|---|---|
| Columna `plan.periodicidad_ordenes` | no existe | Nueva, `NOT NULL DEFAULT 'quincenal'`, `CHECK IN ('quincenal', 'mensual')` (§1.2, R35, P14) |
| Columna `factura_plataforma.periodicidad` | no existe | Nueva, `NOT NULL`, `CHECK IN ('quincenal', 'mensual')`: la periodicidad de órdenes de la factura (§1.1) |
| `factura_plataforma_abrir` | copia plan, nombre y tipo | copia además `periodicidad` (la del plan, o `quincenal` sin plan) |
| `factura_plataforma_avanzar` | fin natural con `COALESCE(tipo_cobro, 'mensual')` | fin natural con la `periodicidad` de la factura (R2) |
| `factura_plataforma_tomar_cambio` | la factura toma plan, nombre y tipo | toma también la periodicidad del plan nuevo; la que abre en R28, igual (R16, R28) |
| `factura_plataforma_cifras` | cuota en toda factura con plan; días hasta el `hasta` de la factura | cuota solo si el `desde` es inicio de su período de cobro, o R29 con el tramo hasta el **fin del período de cobro**; sin `p_hasta` (§2.4) |
| `factura_plataforma_en_curso` | fin previsto con el tipo | fin previsto con la periodicidad; devuelve la periodicidad (R24) |
| Trigger de inmutabilidad | una por cerrar no cambia plan, tipo ni fechas | tampoco su periodicidad |
| Siembra | `desde` = inicio del período de cobro (o del mes sin plan) | `desde` = inicio del corte en curso de su periodicidad (R26) |
| `down.sql` | deja la base como estaba | además quita `plan.periodicidad_ordenes` |
| `db/schema.prisma` | — | `Plan.periodicidadOrdenes` y `FacturaPlataforma.periodicidad` |

## 1. Modelo de datos

### 1.1 Tabla `factura_plataforma` (de NEGOCIO)

Una fila por factura de una empresa, **una por corte de órdenes**. Columnas (`TIMESTAMP(3)` sin zona, en UTC):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | `gen_random_uuid()::text` |
| `organizacion_id` | `TEXT NOT NULL` | `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`; FK a `organizacion` |
| `estado` | `TEXT NOT NULL` | `CHECK IN ('en_curso', 'por_cerrar', 'cerrada')` |
| `numero` | `INTEGER` | Solo en `cerrada` (R14) |
| `desde_at` | `TIMESTAMP(3) NOT NULL` | Inicio, incluido: un corte, salvo el alta (R26) y la primera asignación (R28) |
| `hasta_at` | `TIMESTAMP(3)` | Fin, excluido. `NULL` solo en `en_curso` |
| `periodicidad` | `TEXT NOT NULL` | **Nueva.** `CHECK IN ('quincenal', 'mensual')`. La periodicidad de órdenes de la factura: la del plan al abrirla, o `quincenal` sin plan. Da su fin natural (R2) |
| `plan_id`, `plan_nombre`, `tipo_cobro` | `TEXT`, `VARCHAR(80)`, `TEXT` | El plan de la factura: copia del plan de la empresa **al abrirla**, que solo cambia R16/R28 mientras está `en_curso`. Las tres o ninguna. `plan_id` sin FK, como en la traza |
| `cargos`, `reversos`, `total_ordenes` | `DECIMAL(14,2)` | Al cerrar (R5) |
| `movimientos` | `INTEGER` | Al cerrar |
| `precio_mensual`, `cuota` | `DECIMAL(12,2)` | Al cerrar, **solo si la factura lleva cuota** (R8, R29). Una factura con plan puede cerrarse sin cuota (la del 16 de un plan mensual) |
| `dias_cobrados`, `dias_periodo` | `INTEGER` | Con la cuota: los días del **período de cobro** cobrados y los del período. Iguales salvo en R29, donde `dias_cobrados` cuenta del `desde` al fin del período de cobro (puede pasar del `hasta` de la factura) |
| `total` | `DECIMAL(14,2)` | `total_ordenes + COALESCE(cuota, 0)` |
| `cerrada_at`, `created_at` | `TIMESTAMP(3)` | |

CHECK (los de T2, más el de la periodicidad):
- `factura_plataforma_estado_fin`: `(estado = 'en_curso') = (hasta_at IS NULL)` y `hasta_at > desde_at`;
- `factura_plataforma_cerrada`: el de T2 (desvío aceptado, §0.1);
- `factura_plataforma_plan`: `num_nulls(plan_id, plan_nombre, tipo_cobro) IN (0, 3)`; `tipo_cobro IN` los cuatro;
- `factura_plataforma_cuota`: `num_nulls(precio_mensual, cuota, dias_cobrados, dias_periodo) IN (0, 4)`,
  `cuota >= 0`, `0 < dias_cobrados <= dias_periodo`, y sin plan, sin cuota;
- `factura_plataforma_periodicidad_check`: `periodicidad IN ('quincenal', 'mensual')`.

Únicos e índice: los de T2 (§0.2). FK `ON DELETE CASCADE`: la app nunca borra una empresa; el dueño sí, en las
limpiezas de los tests y en el borrado de la demo.

### 1.2 Columna `plan.periodicidad_ordenes` (de PLATAFORMA) — R35

`TEXT NOT NULL DEFAULT 'quincenal'` con `CHECK (periodicidad_ordenes IN ('quincenal', 'mensual'))`, en la
migración `20261111130100`. El `DEFAULT` deja **todos los planes que ya existen en quincenal** (propuesta P14) y
sirve a los `INSERT` de los tests y de la demo, que no la mandan. `plan` ya tiene RLS sin políticas y `REVOKE
ALL … FROM servi_app` (SL-24): no hace falta nada más. En Prisma, `periodicidadOrdenes String @default("quincenal")
@map("periodicidad_ordenes")` con el comentario del CHECK.

**Por qué en el plan y no en la empresa.** Lo dice el humano: «cada plan define la periodicidad». Un custom es
de una sola empresa, así que una empresa que necesite otra periodicidad tiene su custom.

### 1.3 RLS, permisos e inmutabilidad

Los de T2 (§0.2). El trigger `factura_plataforma_inmutable` congela en una `por_cerrar` también `periodicidad`
(R16: una factura fijada no se mueve).

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
`organizacion.plan_id`, `plan.nombre`, `organizacion.plan_tipo_cobro` y **`plan.periodicidad_ordenes`**, o los
tres primeros nulos y `periodicidad = 'quincenal'` sin plan.

**Avanzar** deja la factura en curso alineada con el calendario hasta `p_hasta`:
1. sin factura en curso, la abre desde las 00:00 de la plataforma del día de `organizacion.created_at` (R26);
2. mientras su fin natural (R2: `plan_fin_periodo_calendario(periodicidad de la factura, desde)`) sea `≤
   p_hasta`: la **fija** (`por_cerrar`, `hasta_at`) y **abre** la siguiente desde ahí.

El fin sale de la periodicidad **de la factura**, no de la empresa ni del plan de hoy: un cambio de plan o de su
periodicidad no mueve el fin de la factura en curso (R15, R36). La siguiente se abre con lo que la empresa y su
plan tengan en ese instante, así que una periodicidad editada rige desde el siguiente corte (R36, P13).

### 2.3 `factura_plataforma_tomar_cambio(p_org, p_efecto, p_plan_id, p_tipo)` — R15–R17, R28, R33, R38

Firma sin cambios. La llama `PlanesRepository.aplicarEnTx` **antes** de su `UPDATE "organizacion"`, con la
empresa ya en `FOR UPDATE`. Lee del plan nuevo su nombre **y su periodicidad**. Sea `F` la factura en curso
tras el paso 1, con `desde` D:
1. `factura_plataforma_avanzar(p_org, p_efecto)`: con el plan de antes, las facturas cuyo fin natural llega al
   efecto se fijan y la siguiente se abre con el plan de antes.
2. Según el caso:
   - **efecto ≤ D** (R16, y el caso normal de R38: un efecto de R30 es un corte, así que el paso 1 deja D =
     efecto): `F` toma `p_plan_id`, su nombre, `p_tipo` y la periodicidad del plan nuevo. Su fin natural se
     recalcula solo, porque sale de su periodicidad;
   - **efecto > D y `F` con plan** (R15; un pendiente de antes de esta ficha con efecto a mitad de factura): nada;
   - **efecto > D y `F` sin plan** (R28, P8): fija `F` en el efecto y abre la siguiente desde el efecto con el
     plan, el tipo y la periodicidad nuevos; su cuota la prorratea R29 (§2.4).

Solo toca facturas `en_curso`. No cierra: solo fija. Un cambio pendiente, cancelado, una edición de precio o de
periodicidad del plan no llaman a `aplicarEnTx`: no tocan facturas (R17, R36).

**Por qué el efecto de R30 es siempre un corte (R38).** El efecto es el inicio de un período del tipo de
referencia. Si ese tipo es mensual o más largo, es un 1 de mes: corte de las dos periodicidades. Si es
quincenal, los dos tipos son quincenales, y con R37 los dos planes tienen órdenes quincenales: el 1 y el 16 son
cortes. Así el corte de la factura y el cambio del costo por orden coinciden, y R30 no necesita mirar la
periodicidad. Sin R37 (si P12 elige otra salida) esto deja de valer y §3.1 tendría que tomar también la
periodicidad en el tipo de referencia.

### 2.4 `factura_plataforma_cifras(p_org, p_desde, p_hasta_ordenes, p_plan_id, p_tipo)` (interna) — R5–R9, R29

`STABLE`. **Firma nueva: sin `p_hasta`** (los días de la cuota ya no dependen del fin de la factura). La única
definición de las cifras, para el cierre y la lectura en curso:
- `cargos`, `reversos`, `movimientos` con `ocurrido_at` en `[p_desde, p_hasta_ordenes)`; `total_ordenes`;
- cuota, si hay plan con costo (precio y descuentos de `plan_precio_historial` con el mayor `desde_at ≤ p_desde`,
  `costo = plan_costo_del_periodo(…, p_tipo)`). Sean `S = plan_inicio_periodo_calendario(p_tipo, p_desde)` y `E =
  plan_fin_periodo_calendario(p_tipo, p_desde)` el período de cobro que contiene el `desde`, y `dias_periodo =
  plan_dias_de_calendario(S, E)`:
  - `S = p_desde` (R8): `cuota = costo`, `dias_cobrados = dias_periodo`;
  - si no, y es la **primera factura con plan** (`NOT EXISTS` una factura de `p_org` con `desde_at < p_desde` y
    `plan_id IS NOT NULL`) (R29): `dias_cobrados = plan_dias_de_calendario(p_desde, E)` y `cuota =
    plan_costo_del_tramo(costo, dias_cobrados, dias_periodo)`;
  - si no (R8, segundo caso): **sin cuota**: precio, cuota y días nulos;
- `total = total_ordenes + COALESCE(cuota, 0)`.

Cada período de cobro se cobra una sola vez (R8): su inicio es el `desde` de una sola factura (el único
`(organizacion_id, desde_at)`), y con R37 ese inicio siempre es un corte. El tramo de R29 empieza en el `desde`
de una sola factura y las siguientes del mismo período no son la primera con plan ni empiezan en `S`.

### 2.5 `factura_plataforma_cerrar(p_org, p_ahora)` — R3, R4, R11, R14

El de T2: cerrojo de la empresa, `avanzar(p_org, p_ahora)`, y cada `por_cerrar` con `hasta_at ≤ p_ahora − 5
minutos`, en orden de `desde_at`, se cierra con sus cifras (`cifras(p_org, desde, hasta, plan, tipo)`), su
número y `cerrada_at`. Idempotente por el cerrojo y el estado.

### 2.6 `factura_plataforma_en_curso(p_org)` — R24

La de T2, con el fin previsto `plan_fin_periodo_calendario(periodicidad, desde)` y la `periodicidad` en el JSON.
La cuota prevista sale de `cifras`: nula cuando la factura no la lleva.

### 2.7 El tope del pago (SL-45) — R18, R19

El de T2, sin cambios.

## 3. Capa de la app

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tipos | `lib/types/factura-plataforma.ts` | `FacturaPlataformaDTO` (cerrada o en curso, importes como texto, con `periodicidad`), `EstadoFactura` |
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

### 3.1 La fecha de efecto de un cambio del superadmin — R30–R34 (sin cambios de fondo)

En `PlanesRepository.cambiarEmpresaEnTx`, bajo el cerrojo de la empresa y antes de decidir entre pendiente y
aplicar, solo si `efecto.clase === "cambio"` (una primera asignación no se toca: R33). Con el **tipo de
referencia** `tipo` = el de mayor índice en `TIPOS_COBRO` entre el vigente (`empresa.plan_tipo_cobro`) y el
nuevo (P9):
- si `F` ya es inicio de un período de `tipo` (`inicioDelPeriodoCalendario`), se respeta (R31);
- si no, `F' = fechaDeEfectoPorDefecto(tipo, inicioDelDiaPlataforma(F))` (R30).

Los períodos están anidados: `F'` es fin de la factura en curso y, con R37, también corte de órdenes de los dos
planes (R38, §2.3). El rango (`fueraDeRango`, SLT-86 R16) sigue sobre la fecha elegida (R34, P10). El `ok` de
`asignar`, `crearYAsignar` y `cambiarTipoCobro` gana `vigenteDesde?: string` con la fecha real cuando queda
pendiente; `CambiarTipoCobroResult` gana `vigenteDesde: string | null` (R32). Las dos confirmaciones
(`PlanEmpresa.tsx` al cambiar el tipo y `PlanesModule.tsx` al crear el custom) pintan esa fecha (P11).

### 3.2 La periodicidad de órdenes del plan — R35–R37

**Esquemas (`lib/types/planes.ts`).**
- `PERIODICIDADES_ORDENES = ["quincenal", "mensual"] as const`, su tipo y `periodicidadOrdenesSchema = z.enum(…)`.
- `crearPlanSchema` y `edicionDelPlan` ganan `periodicidadOrdenes: periodicidadOrdenesSchema.optional()`. Al
  crear, ausente = `quincenal` (el `DEFAULT` de la columna); al editar, ausente = sin cambio. Opcional y no
  obligatoria (a diferencia de `costoPorOrden`) para no tocar las ~60 peticiones de los tests de planes que no la
  conocen; el formulario la manda siempre.
- `versionPlanSchema` la hereda: viaja en la versión programada y una versión guardada antes, sin ella, sigue
  validando.
- `crearPlanSchema` gana un refine de R37: `tipoCobro === "quincenal"` con `periodicidadOrdenes === "mensual"` →
  `validation_error` en `tipoCobro` (el custom de una empresa).
- `PlanDTO` gana `periodicidadOrdenes?: PeriodicidadOrdenes`: las lecturas (`leerPlan`) la llenan siempre;
  opcional en el tipo para no tocar los dobles de `PlanDTO` de 39 archivos de test (como `vigenteDesde?` en §3.1).
  `VersionPlan` la incluye.

**Repositorio (`PlanesRepository.ts`).**
- `crear` la escribe; `leerPlan` la lee; `aplicarVersion` la escribe si viene (inmediata y programada: la misma
  función, SL-24).
- **R37 al editar.** Donde la edición ya mira los topes que una empresa pasaría (con el plan bloqueado,
  `bloquearPlanParaEscribir`), si la versión pone `mensual` y el plan tenía `quincenal`: cuenta las empresas con
  `plan_id` = el plan y `plan_tipo_cobro = 'quincenal'`, y las que lo tienen como cambio pendiente con tipo
  quincenal. Si hay alguna, devuelve `{ estado: "periodicidad_incompatible", empresas: n }` sin escribir. Vale al
  guardar (en el acto o programada) y al aplicar la programada: en `aplicarCambioProgramado` lanza, el trabajo
  falla y se reintenta sin escribir, como hoy con una versión que no valida.
- **R37 al asignar.** En `cambiarEmpresaEnTx`, con el plan ya leído bajo el cerrojo: tipo `quincenal` con plan
  `mensual` → `{ estado: "periodicidad_incompatible" }` sin escribir. Cubre asignar, `crearYAsignar` (para un
  plan público; el custom ya lo frena el esquema) y `cambiarTipoCobro`.
- `IPlanesRepository`: los resultados de editar, asignar, crear y cambiar el tipo ganan esa variante.

**Servicio (`PlanesService.ts`).** Mapea `periodicidad_incompatible` a `validation_error`: en `tipoCobro` al
asignar, crear y cambiar el tipo; en `periodicidadOrdenes` al editar, con el número de empresas. Mensajes en
`lib/planes/mensajes.ts`.

**Rastro (`lib/planes/rastro.ts`).** `periodicidadOrdenes` entra en las claves de `CambiosDelPlan`, en la forma
canónica y en `diferenciasDelPlan`: una edición que solo cambia la periodicidad es un cambio (si no,
`hayCambios` la descartaría al aplicarla programada) y deja su fila de rastro (R35).

**Pantalla (`PlanForm.tsx`).** Un selector «Facturación de órdenes»: «Quincenal (cortes el 1 y el 16)» o
«Mensual (del 1 a fin de mes)», con `quincenal` al crear y el valor del plan al editar; se manda siempre. El error
de campo `periodicidadOrdenes` se pinta como los demás. Es el mínimo: el detalle del plan, «Mi plan» y el detalle
de empresa no la muestran (las facturas, con su periodicidad, las pinta SLT-119).

## 4. El proceso de cierre (sin cambios)

### 4.1 Tipo de trabajo
`factura_plataforma_cerrar`: valor de `job_tipo` en su propia migración (`20261111130000`, hecha en T2). Núcleo
en `MODULO_POR_JOB`.

### 4.2 Recurrente de plataforma
En `RECURRENTES_DE_PLATAFORMA`: una vez, en plataforma. `empresasACerrar()`, y para cada una `cerrar(id, now())`
en su transacción; un fallo se anota y sigue (R12); al final lanza con los ids. Cada hora a los :10
(`dedupe_key = factura_plataforma_cerrar:<AAAA-MM-DDTHH>`); la primera fila la siembra `SIEMBRAS_RECURRENTES`.
Sin correos (R25).

### 4.3 Margen de cierre: 5 minutos
Un cargo se registra con `ocurrido_at = now()` (inicio de su transacción). La transacción más larga de la app
dura 30 s; 5 minutos dejan holgura y la corrida de las :10 ya cae fuera. Por eso la toma del cambio fija y no
cierra. Residuo: un movimiento con `ocurrido_at` atrasado más de 5 minutos caería en una cerrada; hoy ninguno.

### 4.4 Lo que la cola pierda
Si el cambio se aplica tarde y el cierre ya abrió la factura del corte con el plan de antes, la toma del cambio
ve efecto = D y le pone el plan nuevo (R16). Si la cola estuvo caída más de un corte, la factura del efecto pudo
cerrarse ya con el plan de antes y no cambia (R16).

## 5. La deuda con la plataforma — R18–R20 (sin cambios)

Σ cargos − Σ reversos + Σ `cuota` de facturas `cerrada` − pagos vigentes. Base: el tope del pago (§2.7). App:
`SumaCobroPlataformaPorTipo.tipo` con `"cuota"`; `CobroPlataformaMovimientoRepository.sumasPorTipo` añade la
cuota por `facturaPlataforma.aggregate`; `derivarDeudaPlataforma` resta solo `reverso`;
`EmpresasPlataformaRepository.cuentasConLaPlataforma` añade el `groupBy` de cuotas. El cierre no escribe en
`cobro_plataforma_movimiento`, `cobro_plataforma_traza` ni `wallet_movimiento` (R20). Con el cambio de fondo,
una factura sin cuota simplemente no suma nada.

## 6. Migraciones

`A mano: db:migrate:create falla con P3006 en este repo (ver 20261022130000).` Las dos están en la rama y no en
`dev`: se editan en su sitio.

### 6.1 `20261111130000_factura_plataforma_job_enum` (hecha en T2, sin cambios)

### 6.2 `20261111130100_factura_plataforma` (se rehace en parte, §0.3)
Con `BEGIN`/`COMMIT`. Pasos:
1. **`ALTER TABLE "plan" ADD COLUMN "periodicidad_ordenes" TEXT NOT NULL DEFAULT 'quincenal'`** con su CHECK (R35);
2. tabla con `periodicidad` y su CHECK, únicos, índice, FK, RLS, política, `REVOKE`, sin cambio de empresa e
   inmutabilidad (congela también `periodicidad`);
3. funciones de §2 (abrir y avanzar con la periodicidad; `tomar_cambio` con la del plan; `cifras` con la firma
   nueva y la regla de §2.4; `cerrar` y `en_curso` con esa firma);
4. tope del pago (sin cambios);
5. **siembra (R26):** una `en_curso` por empresa con `desde = plan_inicio_periodo_calendario(periodicidad, now()
   AT TIME ZONE 'UTC')`, donde `periodicidad` es la del plan de la empresa o `quincenal` sin plan, y el plan, el
   tipo y la periodicidad copiados.

`down.sql` (R27): la negativa de T2; después el tope de origen, los `DROP` (con la firma nueva de `cifras`) y
**`ALTER TABLE "plan" DROP COLUMN "periodicidad_ordenes"`**. Orden de bajada: la 6.2 y después la 6.1.

## 7. Datos que dependen del país

- **Moneda:** ninguna (SL-21).
- **Hora:** el −06:00 fijo de la plataforma hasta SLT-90 «Planes: ciclo y cobro en la zona de cada empresa». Solo
  en SQL: ningún literal de zona en TS.
- **Impuestos y métodos de pago:** fuera (SL-21; el pago sigue siendo el de la wallet, SL-45).

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/factura-plataforma-cierre.test.ts` | R1–R9, R11, R14, R26, R27 | Base real, reloj por `p_ahora`; empresas: sin plan (quincenal), mensual con órdenes quincenales (cuota en la del 1, ninguna en la del 16), anual con órdenes mensuales (cuota solo en la del 1 de enero), quincenal; bordes de `ocurrido_at`; precio editado; dos cierres a la vez; siembra (mensual completa, anual de 61 de 365, P15); ida y vuelta con y sin cuota cerrada (la columna del plan se va) |
| `tests/integration/db/factura-plataforma-cambio-plan.test.ts` | R8 (pendiente por SQL a mitad de período: sin cuota), R15–R17, R28, R29, R30 (P9), R33, R36, R38 | `PlanesRepository` real: mensual → quincenal con efecto el 1 de diciembre; el mismo por SQL el 10; inicio el 1 aplicado el 10 (15 500.00); alta el 10 con inicio el 10 (6 200.00); inicio el 5 (11 366.67) y el 18 futuro (13 433.33, sin plan del 16 al 17); anual desde el 18 con órdenes quincenales (44 de 365 en la del 18; ninguna en diciembre; la anual en la del 1 de enero); quincenal → anual guardado por `PlanesService` el 10 de noviembre; cambio a un plan con órdenes mensuales (R38: efecto el 1 de diciembre, las dos de noviembre con el plan de antes, diciembre entera con el nuevo); periodicidad del plan editada de quincenal a mensual y al revés (R36); aplicado tarde, antes y después de un cierre; `UPDATE` de la periodicidad de una `por_cerrar` → `SL118` |
| `tests/integration/db/planes-periodicidad-ordenes.test.ts` (**nuevo**) | R35, R37 | `PlanesService` con el repositorio real: crear con y sin periodicidad; editar en el acto y programada (con su rastro, y aplicada por `aplicarCambioProgramado`); un plan creado sin ella queda quincenal; valor inválido; R37 al asignar, crear custom (esquema) y crear público, cambiar tipo, editar a mensual con una empresa quincenal y con un pendiente quincenal, y una programada que deja de pasar al aplicarse (lanza, sin escribir) |
| `tests/components/PlanFormPeriodicidad.test.tsx` (**nuevo**) | R35 | El selector con `quincenal` al crear y el del plan al editar; lo manda en la petición; pinta el error de campo |
| `tests/integration/db/planes-cambio-empresa.test.ts` (se amplía) | R30, R31, R33, R34 | Como antes |
| `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` (se amplía) | R30, R31 | Como antes |
| `tests/integration/db/planes-crear-custom-asigna.test.ts` (se amplía) | R30 | Como antes |
| `tests/integration/db/planes-asignacion.test.ts`, `plan-de-la-empresa-periodo.test.ts`, `planes-cancelar-cambio-historial.test.ts` | — | Solo se ajustan (fechas a mitad de período o «hoy») |
| `tests/unit/services/planes-service-periodo.test.ts`, `planes-service-tipo-cobro.test.ts` (se amplían) | R30, R32, R34 | Como antes |
| `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanesModule.test.tsx` (se amplían) | R32 | Como antes |
| `tests/integration/db/factura-plataforma-deuda.test.ts` | R18–R20 | Como antes |
| `tests/integration/db/factura-plataforma-aislamiento.test.ts` | R13, R21–R24 | Como antes; R24 con una en curso con cuota prevista y otra sin cuota (la del 16 de un plan mensual), y la periodicidad en el JSON |
| `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` | R10, R29 | Como antes |
| `tests/unit/planes/jobs-factura-plataforma.test.ts` | R3, R12, R25 | Como antes |
| `tests/unit/utils/deuda-plataforma.test.ts` | R18 | Como antes |
| `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | R22 | Como antes |

E2E: diferido a SLT-119 (decisión «¿E2E?»). Antes del PR se corren en local el grupo `dinero` y
`e2e/dos-empresas-humo.spec.ts` (`docs/perfil-agentes.md`).

## 9. Alternativas descartadas

- **La factura atada al período de cobro de la cuota** (el design aprobado antes del cambio de fondo: una factura
  por período de cobro, con la cuota y las órdenes de ese período; un plan anual daba una factura al año). La
  descartó el humano el 2026-11-10: las órdenes se facturan por corte, con la periodicidad del plan.
- **Dos tipos de factura (una de cuota y una de órdenes), con plazos distintos.** El humano pidió un solo tipo y
  un solo plazo de pago; además duplicaría la tabla o su estado y el tope del pago.
- **La periodicidad en la empresa (`organizacion`) y no en el plan.** El humano la puso en el plan; con la
  empresa habría que tocar asignar, el pendiente de cambio y su historial, y un plan público no diría nada de ella.
- **La cuota en la factura cuyo intervalo contiene el inicio del período** (y no en la que empieza en él). Igual
  con R37, pero sin R37 metería dos cuotas en una factura mensual con tipo quincenal; atar la cuota al `desde`
  hace que cada período de cobro tenga una sola factura posible (único `(organizacion_id, desde_at)`).
- **Cuota quincenal con órdenes mensuales permitida** (dos cuotas por factura, o la periodicidad efectiva
  quincenal). Son las otras salidas de P12; la propuesta es rechazar la combinación (R37).
- **Mirar la periodicidad en el tipo de referencia de R30.** Innecesario con R37 (§2.3); haría falta sin ella.
- **`periodicidadOrdenes` obligatoria en los esquemas y en `PlanDTO`.** Coherente con `costoPorOrden`, pero
  obliga a tocar ~60 tests de planes (peticiones y dobles de `PlanDTO`) sin ganar nada: el formulario la manda
  siempre y la columna tiene `DEFAULT`.
- **Una acción aparte «Cambiar periodicidad de órdenes» en el detalle del plan.** Más archivos (action, servicio,
  botón, modal) y otra forma de editar el plan; el humano pidió el formulario de planes.
- **Movimiento sin orden en el libro de cargos** y **tabla-libro de cuotas aparte**: §1.4.
- **Cortar la factura en el efecto de un cambio y prorratear** (propuesta original de P3): rechazada por el humano.
- **Copiar el plan de la factura al fijarla, no al abrirla**: sin corte, un cambio a mitad de período dejaría la
  factura entera con el plan nuevo.
- **Prorratear toda factura más corta que su período**: el humano lo limitó a la primera con plan (P6).
- **P7, P9, P10 y P11**: las alternativas de su momento (validar y rechazar; llevar la fecha en `PlanesService`;
  una función `proximoCorte`; ficha aparte; rango sobre la fecha real; sin la confirmación del custom) siguen
  descartadas por las decisiones del humano.
- **Calcular la cuota en TS y pasarla al cierre**: la base escribiría en la deuda un importe que no puede
  comprobar.
- **Calcular las facturas al vuelo, sin guardarlas**: contradice «una factura cerrada no cambia».
- **Cerrar sin margen o al tomar un cambio**: pierde los cargos en vuelo en el borde (§4.3).
- **Recurrente por empresa (`paraCadaEmpresa`)**: corre como `servi_app`, que no puede cerrar.
- **Crear la factura en curso con un trigger en el alta de empresa**: `avanzar` lo cubre la primera vez.

## 10. Residuos y riesgos

- Un plan con efecto anterior a una factura ya fijada o cerrada no cambia esa factura (R16, P4; §4.4).
- Los pendientes guardados antes de esta ficha con efecto a mitad de período: la factura en curso cierra entera
  con el plan de antes, pero el costo por orden nuevo rige desde ese día (SL-40). Y si dejan una factura con plan
  que empieza a mitad de su período de cobro sin ser la primera con plan, esa factura **no lleva cuota** (R8): la
  cuota del plan nuevo empieza en el siguiente inicio de su período. Desde R30 no se pueden guardar nuevos.
- Con P13 tal como se propone, pasar un plan de quincenal a mensual a mitad de mes deja una factura del 16 al fin
  de mes antes de la primera mensual entera.
- Con P15 tal como se propone, las empresas anuales y bimestrales (en mes par) pagan al desplegar la cuota
  proporcional de lo que queda de su período; las mensuales y quincenales, la completa del corte del 1.
- Una edición programada de la periodicidad que deja de pasar R37 entre que se guarda y se aplica (porque entre
  medias se asignó el plan con tipo quincenal) falla el trabajo y el plan sigue como estaba; el superadmin lo ve
  en la cola, como hoy con una versión que no valida.
- El cambio del maestro de SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de
  plan» no pasa por §3.1 ni por R37. Si permite un tipo más largo o un plan con órdenes mensuales con tipo
  quincenal, la regla de P9 y la de R37 tendrían que aplicarse allí; es de SLT-99 y el reviewer de la que mergee
  segunda lo mira.
- Choque al mergear con SLT-99 (PR #115): `PlanesRepository.ts`, `IPlanesRepository.ts`, `lib/types/planes.ts`,
  `excepciones-aislamiento.ts`. Sin lógica duplicada.
- Movimientos con instante atrasado más de 5 minutos (§4.3): ninguno hoy.
- Si la cola se cae, las facturas se cierran tarde pero con las mismas cifras.
- Tamaño: 49 archivos y ~2 400 líneas (pendiente P16; aceptados 44).
