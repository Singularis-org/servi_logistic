# SLT-118 — planes-facturar-periodo-en-curso · design.md

> Requisitos: `requirements.md` (R1–R28; P1–P5 cerradas por el humano el 2026-11-10; P6–P8 abiertas).
> Ajustado el 2026-11-10 tras esas respuestas: sin corte ni prorrateo (P3), el plan de la factura se toma al
> abrirla y la cuota es siempre la del período completo. Hereda el diseño de
> `specs/SL-40-cobro-plataforma-por-orden/`, SL-45 «pago a la plataforma» (`20261024140000`),
> `specs/SLT-85-traza-facturacion-cobros/` y `specs/SLT-86-planes-periodo-facturacion/` («SLT-86 Rn»).
> Escrito por `spec_author` el 2026-11-10. Sin dependencias nuevas: todo es Postgres, Prisma y zod, ya
> aprobados en `docs/dependencias.md`.

## Lo que ya existe

Busqué el 2026-11-10 con `factura`, `factura_plataforma`, `estado de cuenta`, `cuota`, `costo base`,
`cerrar período` y `deuda con la plataforma`, en tres sitios:

- **el board** (`feature_list.json`, todas las fichas y estados): solo aparecen esta ficha y sus dos hijas,
  SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro» y SLT-120 «Planes: facturar el
  período en curso (1–15) tras asignar los primeros planes». «Estado de cuenta» sale en la ficha «Estado de
  cuenta de la satélite: conciliación en pestaña», que es la caja de las satélites, sin relación;
- **`specs/`**: ninguna factura de la plataforma. «Estado de cuenta» aparece en los specs de la wallet de
  tiendas, mensajeros y satélites (458, 464, SLT-73, SLT-95…), que son otra cosa;
- **el código**: el grafo `codebase-memory-mcp` **no tiene proyecto para este worktree** (`index_status`:
  «project not found»), así que busqué con Grep y Read en `db/`, `lib/`, `app/`, `scripts/` y `tests/`.
  Ninguna tabla, función ni repositorio de facturas de la plataforma. `lib/utils/estado-cuenta*.ts` y
  `EstadoCuentaService` son la cuenta de tiendas y mensajeros.

No existe ninguna factura. Lo que sí existe y se reutiliza:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| El libro de cargos y reversos, con su índice `(organizacion_id, ocurrido_at)` | `cobro_plataforma_movimiento`, `20261023130100`, `20261104150200` | **No se toca.** Se suma por `ocurrido_at` (R5, R6) |
| La traza por movimiento, con `cobrado_at = ocurrido_at` e índice `(organizacion_id, cobrado_at)` | `cobro_plataforma_traza`, `20261109120000` | Es el detalle por orden (R7). No se copia ni se toca |
| El período de calendario en SQL: `plan_inicio_periodo_calendario`, `plan_fin_periodo_calendario` | `20261106120000` | Dan el fin natural (R2) y el inicio P de R28 |
| El precio por fecha: `plan_precio_historial` (fila con el mayor `desde_at ≤` el `desde` de la factura) | `20261106120000` | El precio de la cuota (R8; SLT-86 R15) |
| El costo del período en TS: `montoDelPeriodo` | `lib/planes/cobro.ts` | Gemela de la función SQL nueva; un test las ata (R10). `costoDelTramo` no se usa: la factura no prorratea (P3) |
| Los casos de calendario | `tests/integration/db/_fixtures/periodo-calendario.ts` | Para los tests de períodos |
| El único punto que aplica un cambio de empresa: `PlanesRepository.aplicarEnTx` (asignar, `crearYAsignar`, `cambiarTipoCobro`, `aplicarCambioDeEmpresa`) | `lib/repositories/PlanesRepository.ts` | Llama a la toma del cambio en su transacción (R15, R16, R28) |
| La fecha de efecto que propone la pantalla del superadmin: `fechaDeEfectoPorDefecto` (inicio del próximo período del tipo vigente) | `lib/planes/ciclo.ts` | No se toca aquí: validarla en el servidor es P7 (ficha aparte) |
| El tope del pago en la base: `wallet_movimiento_tope_pago_plataforma` | `20261024140000` | `CREATE OR REPLACE` con la cuota (R18, R19) |
| Las lecturas de la deuda: `derivarDeudaPlataforma`, `CobroPlataformaMovimientoRepository.sumasPorTipo`, `EmpresasPlataformaRepository.cuentasConLaPlataforma` | `lib/utils/`, `lib/repositories/` | Suman la cuota (R18) |
| El patrón de tabla de negocio que solo escribe la base (RLS `…_por_empresa`, `REVOKE`, inmutable con SQLSTATE propio) | `20261023130100`, `20261109120000` | Se copia (§1) |
| La guardia de escritura solo por la base | `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | Se amplía a la tabla nueva (R22) |
| El recurrente de plataforma con siembra: `plan_cambios_vencidos` (`RECURRENTES_DE_PLATAFORMA`, `SIEMBRAS_RECURRENTES`, `MODULO_POR_JOB`) | `lib/planes/jobs-cambio-plan.ts`, `app/api/cron/procesar-jobs/route.ts` | Mismo molde para el cierre (§4) |
| El `down.sql` de un valor de `job_tipo` | `20261106140000_plan_aplicar_cambio_empresa_enum` | Se copia con su sufijo (§6) |
| El `down.sql` que se niega si perdería dinero | `20261031140100`, SLT-85 P4 | Mismo criterio (R27) |

## 1. Modelo de datos

### 1.1 Tabla `factura_plataforma` (de NEGOCIO)

Una fila por factura de una empresa. Columnas (`TIMESTAMP(3)` sin zona, en UTC, como las de planes):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `TEXT` PK | `gen_random_uuid()::text` |
| `organizacion_id` | `TEXT NOT NULL` | `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`; FK a `organizacion` |
| `estado` | `TEXT NOT NULL` | `CHECK IN ('en_curso', 'por_cerrar', 'cerrada')` |
| `numero` | `INTEGER` | Solo en `cerrada` (R14) |
| `desde_at` | `TIMESTAMP(3) NOT NULL` | Inicio, incluido |
| `hasta_at` | `TIMESTAMP(3)` | Fin, excluido. `NULL` solo en `en_curso` |
| `plan_id`, `plan_nombre`, `tipo_cobro` | `TEXT`, `VARCHAR(80)`, `TEXT` | El plan de la factura: copia del plan de la empresa **al abrirla** (§2.2), que solo cambia R16/R28 mientras está `en_curso`. Las tres o ninguna («sin plan»), en cualquier estado. `plan_id` sin FK, como en la traza (el plan es de plataforma y la copia es del momento) |
| `cargos`, `reversos`, `total_ordenes` | `DECIMAL(14,2)` | Al cerrar (R5). `reversos` en positivo; `total_ordenes` puede ser negativo |
| `movimientos` | `INTEGER` | Al cerrar |
| `precio_mensual`, `cuota` | `DECIMAL(12,2)`, `DECIMAL(12,2)` | Al cerrar, solo con plan con costo base (R8, R9). El precio deja ver de dónde sale la cuota sin recalcularla; con el tipo y el descuento del historial basta (sin días: no hay prorrateo) |
| `total` | `DECIMAL(14,2)` | `total_ordenes + COALESCE(cuota, 0)` |
| `cerrada_at`, `created_at` | `TIMESTAMP(3)` | |

CHECK:
- `factura_plataforma_estado_fin`: `(estado = 'en_curso') = (hasta_at IS NULL)` y `hasta_at > desde_at`;
- `factura_plataforma_cerrada`: `(estado = 'cerrada') = (numero IS NOT NULL)`, y cerrada ⇒ `cargos`, `reversos`,
  `total_ordenes`, `movimientos`, `total`, `cerrada_at` no nulos;
- `factura_plataforma_plan`: `num_nulls(plan_id, plan_nombre, tipo_cobro) IN (0, 3)`; `tipo_cobro IN` los cuatro
  de SLT-86;
- `factura_plataforma_cuota`: `num_nulls(precio_mensual, cuota) IN (0, 2)`, `cuota >= 0`, y sin plan, sin cuota.

Únicos (todos empiezan por `organizacion_id`, guardia `unicos-por-empresa`):
- `(organizacion_id, desde_at)`: un intervalo no se factura dos veces (R11);
- `(organizacion_id, numero)`: sin repetidos (R14);
- parcial `(organizacion_id) WHERE estado = 'en_curso'`: una sola en curso (R1).

Índice `(organizacion_id, estado)` para la suma de cuotas de la deuda.

**FK a `organizacion` `ON DELETE CASCADE`.** La app nunca borra una empresa (solo el borrado de empresas demo,
como dueño, `scripts/demo-qa/borrar.ts`), y las limpiezas de los tests borran empresas que, desde esta ficha,
tienen factura en curso en cuanto pasan por `aplicarEnTx`. Con `RESTRICT` habría que tocar la limpieza de
cada test de planes (decenas de archivos) y la demo. `servi_app` no puede borrar `organizacion`. Es el mismo
criterio que `cobro_plataforma_movimiento → orden` (SL-40).

### 1.2 RLS, permisos e inmutabilidad

- `ENABLE ROW LEVEL SECURITY` y política `factura_plataforma_por_empresa FOR ALL TO servi_app` con la forma que
  reconoce `rls-por-empresa` (R21).
- `REVOKE INSERT, UPDATE, DELETE ON factura_plataforma FROM servi_app` (R22). Sin él, el `ALTER DEFAULT
  PRIVILEGES` de `20261022130000` le daría escritura y la RLS se la permitiría sobre sus filas.
- Trigger `factura_plataforma_sin_cambio_de_empresa` (`impedir_cambio_de_empresa()`), el de toda tabla de
  negocio. No hay FK a otra tabla de negocio: ningún `sme_*`.
- Trigger `factura_plataforma_inmutable` `BEFORE UPDATE`: si `OLD.estado = 'cerrada'`, `RAISE … USING ERRCODE =
  'SL118'`, para cualquier rol, el dueño incluido (R13). Si `OLD.estado = 'por_cerrar'` y cambian `plan_id`,
  `plan_nombre`, `tipo_cobro`, `desde_at` o `hasta_at`, también `SL118`: el plan de una factura fijada ya no se
  mueve (R16). Deja pasar un cambio de `organizacion_id` al trigger
  de «sin cambio de empresa» (que corre después por orden de nombre y da `SL017`), como hace la traza. No
  cubre `DELETE`: el borrado ya está cerrado a la app por el `REVOKE`, y el dueño solo borra en cascada
  (limpiezas, demo).

### 1.3 Por qué una tabla nueva y no un movimiento sin orden (P2, cerrada)

La cuota no tiene orden. Las alternativas eran:

- **Descartada: `orden_id` nulable en `cobro_plataforma_movimiento` y un tipo `cuota`.** Rompe el único
  `(organizacion_id, orden_id, secuencia)` y la alternancia cargo/reverso por orden de SL-40; rompe la traza
  de SLT-85, cuyo trigger escribe `orden_id NOT NULL` y busca el cargo de `secuencia − 1`; y obliga a tocar las
  tres funciones que escriben el libro. SLT-85 fijó que el libro no cambia.
- **Descartada: una tabla-libro aparte `cobro_plataforma_cuota`** (un cargo por factura). Duplica la relación
  1 a 1 con la factura, con su propia RLS, su `REVOKE`, su inmutabilidad y su entrada en la guardia, y abre la
  pregunta de qué pasa si la factura y su cargo divergen. Con la cuota en la fila cerrada, «la factura cerrada
  no cambia» (R13) y «la cuota no cambia» son la misma regla.
- **Elegida:** la cuota es una columna de la factura cerrada, y la deuda la suma (§5). La escriben solo las
  funciones del dueño (§2), igual que los cargos los escribe solo la base (SL-40 D3).

### 1.4 Prisma

Modelo `FacturaPlataforma` (`@@map("factura_plataforma")`) con relación inversa en `Organizacion`, y el
comentario de lo que vive solo en el SQL (CHECK, único parcial, triggers). Entra en `MODELOS_DE_NEGOCIO`
(`lib/db/modelos-de-negocio.ts`) y suma 1 a la cuenta de `rls-por-empresa.guardia` (89 → 90). `JobTipo` gana
`factura_plataforma_cerrar`.

## 2. Funciones en la base (todas del dueño)

Todas `SECURITY DEFINER` con `SET search_path = public, pg_temp` y `REVOKE EXECUTE … FROM PUBLIC`. Solo
`factura_plataforma_en_curso` tiene `GRANT EXECUTE … TO servi_app`. Las que dependen del reloj reciben el
«ahora» como parámetro (`p_ahora timestamp`, UTC sin zona, como `plan_inicio_ciclo_de`): el trabajo pasa su
`now()` inyectable y los tests fijan el instante. Solo las llama el dueño, así que un «ahora» falso exige ya
ser dueño de la base.

### 2.1 `plan_costo_del_periodo(p_precio_mensual numeric, p_descuentos jsonb, p_tipo text) RETURNS numeric(12,2)`

`IMMUTABLE`. La gemela SQL de `montoDelPeriodo` (`lib/planes/cobro.ts`), con la misma aritmética (R10):
- `NULL` si el precio es `NULL` («sin precio», R9);
- costo del período: `mensual × num ÷ den` (½, 1, 2, 12). Con descuento en porcentaje, un solo redondeo de
  `mensual × num × (100 − pct) ÷ (den × 100)`; con monto, `round(mensual × num ÷ den, 2) − monto`, nunca bajo
  0; sin descuento, `round(…, 2)`. `round(numeric, 2)` es la mitad hacia arriba con importes `≥ 0`.

Sin días ni tramo: la factura no prorratea (R8; decisiones P3 y P4). No depende de la zona horaria.

### 2.2 `factura_plataforma_avanzar(p_org text, p_hasta timestamp)` (interna)

Deja la factura en curso de la empresa alineada con el calendario hasta `p_hasta`:
1. Si la empresa no tiene factura en curso, la **abre** con `desde` = las 00:00 de la plataforma del día de
   `organizacion.created_at` (R26, empresa nueva).
2. Mientras el fin natural de la factura en curso (R2: `plan_fin_periodo_calendario(COALESCE(tipo_cobro de la
   factura, 'mensual'), desde)`) sea `≤ p_hasta`: la **fija** en ese fin y **abre** la siguiente desde ahí.

**Abrir** = insertar `en_curso` con el plan de la factura copiado de la empresa en ese momento:
`organizacion.plan_id`, `plan.nombre` y `organizacion.plan_tipo_cobro` (o las tres nulas sin plan).
**Fijar** = `estado = 'por_cerrar'` y `hasta_at`; el plan no se toca. El fin natural sale del tipo **de la
factura**, no del de la empresa: así un cambio de tipo aplicado a mitad de período no mueve el fin (R15).

La fecha de calendario se toma con el mismo −06:00 fijo que las funciones de SLT-86 (`interval '6 hours'`);
SLT-90 «Planes: ciclo y cobro en la zona de cada empresa» lo cambia junto con ellas.

### 2.3 `factura_plataforma_tomar_cambio(p_org text, p_efecto timestamp, p_plan_id text, p_tipo text)` — R15–R17, R28

La llama `PlanesRepository.aplicarEnTx` **antes** de su `UPDATE "organizacion"`, en la misma transacción y con
la empresa ya en `FOR UPDATE` (`bloquearEmpresa`), con el efecto del cambio y el plan y el tipo nuevos. Sea
`F` la factura en curso después del paso 1, con `desde` D:
1. `factura_plataforma_avanzar(p_org, p_efecto)`: con la empresa aún en el plan de antes, las facturas cuyo
   fin natural llega al efecto se fijan y la siguiente se abre con el plan de antes. Con el efecto en el
   inicio del próximo período (el caso normal, P3) esto fija la factura vieja entera y abre `F` con D =
   efecto.
2. Según el caso:
   - **efecto ≤ D** (R16; el caso normal, una primera asignación con inicio pasado o un cambio aplicado
     tarde): `F` toma `p_plan_id`, su nombre y `p_tipo`. Su fin natural se recalcula solo, porque sale de su
     tipo (§2.2);
   - **efecto > D y `F` con plan** (R15; un pendiente de antes de esta ficha con efecto a mitad de período):
     nada. `F` se cobra entera con el plan de antes; la siguiente se abre en su fin natural con el plan que la
     empresa tenga entonces, que ya es el nuevo;
   - **efecto > D y `F` sin plan** (R28, primera asignación): P = `plan_inicio_periodo_calendario(p_tipo,
     p_efecto)`. Si P ≤ D, `F` toma el plan nuevo como en R16. Si P > D, fija `F` en P (sin plan) y abre la
     siguiente desde P con `p_plan_id`, su nombre y `p_tipo`.

Solo toca facturas `en_curso`: una `por_cerrar` o `cerrada` nunca cambia (R13, R16; el trigger de §1.2 lo
asegura). No cierra: solo fija. El cierre, con sus cifras, lo hace el proceso pasado el margen (§4.3).

Un cambio pendiente o cancelado no llama a `aplicarEnTx`, y una edición de precio del plan
(`aplicarCambioProgramado`) tampoco: no tocan facturas (R17). El precio nuevo entra por §2.4.

### 2.4 `factura_plataforma_cifras(p_org, p_desde, p_hasta_ordenes, p_plan_id, p_tipo) RETURNS TABLE (...)` (interna)

`STABLE`. La única definición de las cifras de una factura, para el cierre y para la lectura en curso:
- `cargos`, `reversos`, `movimientos`: de `cobro_plataforma_movimiento` con `organizacion_id = p_org` y
  `ocurrido_at` en `[p_desde, p_hasta_ordenes)` (R5, R6);
- `total_ordenes = cargos − reversos`;
- cuota (R8, R9): si hay plan, el `precio_mensual` y los `descuentos` de `plan_precio_historial` con el mayor
  `desde_at ≤ p_desde`, y `plan_costo_del_periodo(precio, descuentos, p_tipo)`; devuelve también el precio;
- `total = total_ordenes + COALESCE(cuota, 0)`.

### 2.5 `factura_plataforma_cerrar(p_org text, p_ahora timestamp) RETURNS integer` — R3, R4, R11, R14

1. `SELECT … FROM organizacion WHERE id = p_org FOR UPDATE`: el mismo cerrojo y en el mismo orden que
   `aplicarEnTx`, así un cierre y un cambio de plan de la misma empresa se serializan sin interbloqueo
   (`docs/architecture.md > Cerrojos`: la empresa primero).
2. `factura_plataforma_avanzar(p_org, p_ahora)`.
3. Para cada factura `por_cerrar` de la empresa con `hasta_at ≤ p_ahora − interval '5 minutes'`, en orden de
   `desde_at`: calcula `factura_plataforma_cifras`, asigna `numero = COALESCE(max(numero), 0) + 1` de la
   empresa, guarda las cifras y `cerrada_at = p_ahora`, y pasa a `cerrada`.
4. Devuelve cuántas cerró.

Idempotencia (R11): el cerrojo de la empresa serializa dos cierres a la vez; el segundo ve las facturas ya
cerradas y no hace nada. Solo pasa a `cerrada` una `por_cerrar`, y el único `(organizacion_id, desde_at)` impide
abrir dos veces el mismo intervalo. Un reintento tras un fallo vuelve a empezar desde el estado guardado: la
transacción fallida no dejó nada.

### 2.6 `factura_plataforma_en_curso(p_org text) RETURNS jsonb` — R24

`STABLE`, `GRANT EXECUTE TO servi_app`, con el control de contexto de `plan_de_la_empresa`: si
`app.organizacion_id` está vacío o es otra empresa, `42501`. No escribe (no llama a `avanzar`): devuelve las
facturas `en_curso` y `por_cerrar` con `desde`, `hasta` (el fijado o el fin natural previsto), su plan y su
tipo, y las cifras de `factura_plataforma_cifras` con las órdenes hasta `LEAST(now() AT TIME ZONE 'UTC', hasta)`
y la cuota completa de su período (R8), marcada como prevista. El superadmin lee lo mismo por `FacturaPlataformaRepository`, en plataforma,
llamando a `factura_plataforma_cifras` como dueño (§3).

### 2.7 El tope del pago (SL-45) — R18, R19

`CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma()` copiando LITERALMENTE el cuerpo de
`20261024140000` y añadiendo a `v_cargos` la Σ de `cuota` de las facturas `cerrada` de la empresa. El candado,
la clave de idempotencia y el rechazo no cambian. `down.sql` repone el cuerpo de origen.

## 3. Capa de la app

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tipos | `lib/types/factura-plataforma.ts` | `FacturaPlataformaDTO` (cerrada o en curso, importes como texto), `EstadoFactura` |
| Contrato | `lib/interfaces/repositories/IFacturaPlataformaRepository.ts` | Los cuatro métodos de abajo |
| Repositorio | `lib/repositories/FacturaPlataformaRepository.ts` | `empresasACerrar()` (ids de todas, en plataforma); `cerrar(organizacionId, ahora)` (una transacción por empresa, `SELECT factura_plataforma_cerrar(…)`, en plataforma); `deLaEmpresa(organizacionId)` (en la empresa del contexto: cerradas con `findMany` filtrado por `organizacionId` + `factura_plataforma_en_curso`); `deEmpresaParaPlataforma(organizacionId)` (en plataforma: lo mismo con `factura_plataforma_cifras`). Ningún método escribe la tabla |
| Excepción | `lib/db/excepciones-aislamiento.ts` | Entrada en `EXCEPCIONES_DE_PLATAFORMA` para el repositorio, ficha `"SL-24"` (deuda D29: `FichaJira` no admite `SLT`) |
| Trabajo | `lib/planes/jobs-factura-plataforma.ts` | Handler, recurrencia, siembra y composition root (§4) |
| Toma del cambio | `lib/repositories/PlanesRepository.ts` | Una llamada en `aplicarEnTx`: `SELECT factura_plataforma_tomar_cambio(${empresa.id}, ${comoTimestamp(desde)}::timestamp, ${planId}, ${tipoCobro})` antes del `UPDATE`. La sirven igual los cambios del superadmin y los del maestro de SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan», que pasan por el mismo `aplicarEnTx` |
| Deuda | ver §5 | |

No hay action, servicio ni pantalla: la autorización por rol (maestro y superadmin) y la pantalla son de
SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro», que consumirá `deLaEmpresa` y
`deEmpresaParaPlataforma`. Aquí el acceso lo garantizan la RLS, el `REVOKE` y el control de contexto de la
función (R21–R24). Sin módulo: facturas y deuda son núcleo.

## 4. El proceso de cierre

### 4.1 Tipo de trabajo

`factura_plataforma_cerrar`: valor nuevo de `job_tipo`, en su propia migración (Postgres no deja usar un valor
de enum en la transacción que lo añade, 55P04; molde `20261106140000`). Núcleo en `MODULO_POR_JOB`
(`lib/modulos/reparto.ts`).

### 4.2 Recurrente de plataforma

Va en `RECURRENTES_DE_PLATAFORMA` (`app/api/cron/procesar-jobs/route.ts`): corre **una vez**, en plataforma, y no
una por empresa. `paraCadaEmpresa` corre como `servi_app`, que no puede ejecutar el cierre (R22). El handler:
1. `empresasACerrar()`;
2. para cada una, `cerrar(id, now())` en su propia transacción; un fallo se anota y sigue (R12);
3. si alguna falló, lanza después con los ids, para el backoff. Repetir las que fueron bien no hace nada (R11).

Recurrencia cada hora a los :10 (`dedupe_key = factura_plataforma_cerrar:<AAAA-MM-DDTHH>`), molde de
`recurrenciaPlanCambiosVencidos`; la primera fila la siembra `SIEMBRAS_RECURRENTES`
(`scripts/siembra-jobs-recurrentes.ts`). Sin correos (R25).

### 4.3 Margen de cierre: 5 minutos

Un cargo se registra con `ocurrido_at = now()`, que en Postgres es el inicio de su transacción. Una transacción
de órdenes que empezó a las 23:59:59 y confirma a las 00:00:02 deja un cargo del período anterior que no se
ve hasta que confirma. Si el cierre leyera a las 00:00:01, la factura cerrada no lo tendría y la traza sí (R7
roto). La transacción más larga de la app dura 30 s (`DevolucionTiendaRepository`, `timeout: 30_000`); 5
minutos dejan holgura, y la corrida de las :10 ya cae fuera. Por eso la toma del cambio (§2.3) fija y no
cierra.

Residuo anotado: un movimiento con `ocurrido_at` que la app escriba con una fecha más de 5 minutos atrasada
caería en una factura ya cerrada y no contaría en sus cifras. Hoy ningún escritor lo hace: los cargos usan
`now()` y los reversos `deleted_at`, que la app fija con `new Date()`.

### 4.4 Lo que la cola pierda

El cambio que rige el 16 a las 00:00 lo aplica su trabajo a esa hora, y el cierre corre a las 00:10. Si el
cambio se aplica tarde (el barrido de `plan_cambios_vencidos` es horario) y el cierre ya abrió la factura del
16 con el plan de antes, la toma del cambio ve efecto = D y le pone el plan nuevo (R16): la factura del 16
sale entera con el nuevo, que es lo que P3 pide. Si la cola estuvo caída más de un período, la factura del
efecto pudo cerrarse ya con el plan de antes: no cambia (R16) y el plan nuevo entra en la factura en curso.
Se anota como residuo. Las órdenes de entre medias se cobraron con el costo por orden que tenía la empresa en
su instante (SL-40, R6); esta ficha no los recalcula.

## 5. La deuda con la plataforma — R18–R20

La deuda se **deriva**, no se copia: Σ cargos − Σ reversos + Σ `cuota` de facturas `cerrada` − pagos vigentes.

- **Base:** el tope del pago (§2.7).
- **App:** el tipo `SumaCobroPlataformaPorTipo.tipo` pasa a `CobroPlataformaTipo | "cuota"`.
  `CobroPlataformaMovimientoRepository.sumasPorTipo` añade la entrada `{ tipo: "cuota", monto }` con un
  `facturaPlataforma.aggregate` filtrado por `organizacionId` y `estado: "cerrada"` (`CobroPlataformaPrismaClient`
  gana `facturaPlataforma`). `derivarDeudaPlataforma` resta solo `reverso` y suma lo demás.
  `EmpresasPlataformaRepository.cuentasConLaPlataforma` añade un `groupBy` de cuotas por empresa (y su
  `Pick` gana `facturaPlataforma`). `DeudaPlataformaService` y `TopePagoPlataformaService` no cambian: ya pasan
  por `sumasPorTipo` y `derivarDeudaPlataforma`, y sus composition roots tampoco.
- **Pagos existentes:** no se tocan. Una empresa que no deba nada pasa a deber la cuota al cerrar; una con saldo
  a favor lo ve bajar.
- **Sin doble cuenta:** el cierre no escribe en `cobro_plataforma_movimiento`, `cobro_plataforma_traza` ni
  `wallet_movimiento` (R20); los cargos de las órdenes siguen en la deuda por su libro.

Que la deuda se derive y no se copie hace que la base y la app no puedan divergir: las dos suman las mismas
filas cerradas.

## 6. Migraciones

`A mano: db:migrate:create falla con P3006 en este repo (ver 20261022130000).`

### 6.1 `20261110130000_factura_plataforma_job_enum`
- `migration.sql`: `ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'factura_plataforma_cerrar';` (sola).
- `down.sql`: `DELETE FROM "jobs" WHERE "tipo"::text = 'factura_plataforma_cerrar'` y la función de reversión
  de `20261106140000/down.sql` tal cual, renombrada `_slt118`.

### 6.2 `20261110130100_factura_plataforma`
Con `BEGIN`/`COMMIT` (atómica también en el runner de los tests, como SLT-85). Pasos:
1. tabla, CHECK, únicos, índices, FK; RLS, política, `REVOKE`; trigger de sin cambio de empresa;
   inmutabilidad `SL118` (§1);
2. las funciones de §2.1–§2.6, con sus `REVOKE` y el `GRANT` de `factura_plataforma_en_curso`;
3. `CREATE OR REPLACE` del tope del pago (§2.7);
4. **siembra (R26):** una factura `en_curso` por empresa, con `desde` = `plan_inicio_periodo_calendario(
   COALESCE(plan_tipo_cobro si tiene plan, 'mensual'), now() AT TIME ZONE 'UTC')` y el plan de la factura
   copiado de la empresa (plan, nombre y tipo, o nulos sin plan).

`down.sql` (R27): bloque `DO` que lanza si existe alguna factura `cerrada` con `cuota > 0`, sin tocar nada;
después repone el cuerpo de origen del tope, y `DROP` de triggers, funciones y tabla. Orden de bajada: primero
la 6.2, después la 6.1.

## 7. Datos que dependen del país

- **Moneda:** ninguna; los importes son los del plan y de las órdenes, sin moneda (SL-21 «factura electrónica»
  trae moneda, impuestos y Hacienda).
- **Hora:** el −06:00 fijo de la plataforma, el de las funciones de SLT-86, hasta SLT-90 «Planes: ciclo y cobro
  en la zona de cada empresa». Solo en SQL: ningún literal de zona en TS (`pais-sin-literales.guardia`).
- **Impuestos y métodos de pago:** fuera (SL-21; el pago sigue siendo el de la wallet, SL-45).

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/factura-plataforma-cierre.test.ts` | R1–R9, R11, R14, R26, R27 | Base real (`HAY_BASE_DE_DATOS`), reloj fijado por `p_ahora`; dos empresas (quincenal con plan y sin plan); órdenes y anulaciones con `ocurrido_at` a ambos lados de los bordes; cuota completa con entrada el 10 (R8) y precio editado con efecto dentro y fuera del `desde`; dos cierres a la vez desde dos conexiones; migración de ida y vuelta con y sin cuota cerrada |
| `tests/integration/db/factura-plataforma-cambio-plan.test.ts` | R15–R17, R28 | `PlanesRepository` real: mensual → quincenal con efecto el 1 de diciembre (noviembre entera con mensual, del 1 al 15 de diciembre con quincenal); el mismo con efecto el 10 de noviembre por SQL de pendiente (noviembre sigue entera con mensual y su fin no se mueve); primera asignación con inicio el 1 aplicada el 10; cambio aplicado después de la corrida de las :10 y después de un cierre; primera asignación con inicio el 5 y el 18 (quincenal) y el 18 (mensual); pendiente cancelado y reemplazado; edición de precio; `UPDATE` del plan de una `por_cerrar` → `SL118` |
| `tests/integration/db/factura-plataforma-deuda.test.ts` | R18–R20 | `DeudaPlataformaService`, `TopePagoPlataformaService`, `EmpresasPlataformaRepository` y el trigger del tope con la cuota; pago igual y mayor que la deuda; `count` de los tres libros antes y después del cierre |
| `tests/integration/db/factura-plataforma-aislamiento.test.ts` | R13, R21–R24 | Dos empresas: lectura cruzada (Prisma y SQL a mano), `INSERT`/`UPDATE`/`DELETE` y `EXECUTE` como `servi_app` → `42501`; `UPDATE` de una cerrada como dueño → `SL118`; superadmin lee las dos; en curso con total parcial |
| `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` | R10 | La misma tabla de casos por `plan_costo_del_periodo` y por `montoDelPeriodo` |
| `tests/unit/planes/jobs-factura-plataforma.test.ts` | R3, R12, R25 | Handler con un doble del repositorio (una empresa falla); recurrencia y `dedupe_key`; registro en `buildHandlers`, `buildRecurrencias`, `RECURRENTES_DE_PLATAFORMA`, `MODULO_POR_JOB` y `SIEMBRAS_RECURRENTES` |
| `tests/unit/utils/deuda-plataforma.test.ts` | R18 | `derivarDeudaPlataforma` con la entrada `cuota` |
| `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | R22 | Detectores y contraprueba para `factura_plataforma` / `facturaPlataforma` |

E2E: diferido a SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro» (decisión «¿E2E?»).
Antes del PR, por `docs/perfil-agentes.md`, se corren en local el grupo `dinero` y `e2e/dos-empresas-humo.spec.ts`
(la ficha toca dinero, `db/` y un job).

## 9. Alternativas descartadas

- **Movimiento sin orden en el libro de cargos** y **tabla-libro de cuotas aparte**: §1.3.
- **Cortar la factura en el efecto de un cambio y cobrar cada parte en proporción a sus días** (la propuesta
  original de P3). La rechazó el humano el 2026-11-10: sin prorrateo ni corte; el período en curso se cobra
  entero con el plan viejo y el cambio rige al inicio del próximo período, como SLT-99.
- **Copiar el plan de la factura al fijarla, no al abrirla.** Solo era correcto si cada cambio cortaba antes
  de escribirse; sin corte, un cambio a mitad de período dejaría la factura entera con el plan nuevo. Al
  abrir, el plan de la factura es el que regía en su `desde`, y solo R16 y R28 lo cambian.
- **Validar en el servidor del superadmin que la fecha de efecto sea el inicio del próximo período**, dentro
  de esta ficha. Es lo que pide P3, pero suma unos 12 archivos y la ficha pasaría de 40: va a ficha aparte
  (P7). La base de esta ficha no depende de ello: cobra la cuota sin corte pase lo que pase.
- **Calcular la cuota en TS y pasarla a la función de cierre.** Ahorraba la gemela SQL, pero la base escribiría
  en la deuda un importe que no puede comprobar, y habría dos sitios que deciden el dinero al escribir. Con la
  función SQL como autoridad y `cobro.ts` solo para mostrar, el test de gemelas (R10) las mantiene iguales,
  como ya pasa con el período (SLT-86 R6).
- **Calcular las facturas al vuelo, sin guardarlas.** Contradice «una factura cerrada no cambia»: un precio
  editado, un plan archivado o un reverso con fecha atrasada cambiarían lo ya facturado, y la deuda no tendría
  de dónde sacar la cuota.
- **Cerrar en el mismo instante del fin (sin margen) o cerrar al tomar un cambio.** Pierde los cargos de las
  transacciones en vuelo en el borde (§4.3).
- **Recurrente por empresa (`paraCadaEmpresa`).** Corre como `servi_app`; habría que darle `EXECUTE` del cierre a
  la empresa, que podría cerrar a mano con un «ahora» falso.
- **Crear la factura en curso con un trigger en el alta de empresa.** Toca `organizacion`, que tiene ya sus
  propios triggers de país y planes, para algo que `avanzar` cubre la primera vez que se necesita.

## 10. Residuos y riesgos

- Un plan con efecto anterior a una factura ya fijada o cerrada no cambia esa factura (R16, P4; §4.4).
- Hasta que entre la ficha de P7, el superadmin puede guardar un cambio con efecto a mitad de período: la
  cuota se cobra igual sin corte (R15), pero el costo por orden nuevo rige desde ese día (los cargos son de
  SL-40, por orden y en su instante).
- Una factura con plan más corta que su período (alta a mitad de período, R28 con P ≤ D) lleva la cuota
  completa: P6.
- Movimientos con instante atrasado más de 5 minutos (§4.3): ninguno hoy.
- Si la cola de trabajos se cae, las facturas se cierran tarde pero con las mismas cifras: el cierre depende de
  `hasta`, no de cuándo corre.
- Tamaño (P5, aceptado): 29 archivos, ~1 700 líneas.
