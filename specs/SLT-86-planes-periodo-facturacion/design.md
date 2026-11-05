# SLT-86 — Planes: período de facturación · design.md

> Parte de `dev` **después del merge de SLT-83** (`tasks.md > T0`, hecha el 2026-11-05: merge `229ddce1`,
> con SLT-83 en `8eb66b88`). Los nombres de función y los archivos que SLT-83 cambió (`plan_de_la_empresa`,
> `costeo.ts`, `cobro_plataforma_tarifa_de`, `plan_cobro_del_ciclo`) ya están contrastados con `dev` en §9 y
> §12. Las propuestas de este diseño (rangos,
> textos, actor de la migración, cancelación) y P4 = (a) las aprobó el humano el 2026-11-05: están en
> «Decisiones cerradas» de `requirements.md`.

## Lo que ya existe

Buscado (feature_list.json, `specs/` y código con Grep/Read; **el grafo MCP no se consultó**): `periodo`,
`quincenal`, `bimestral`, `tipo_cobro`/`tipoCobro`, `ciclo`, `ancla`, `periodicidad`, `descuento_anual`,
`vigente_desde`, `tope_ordenes`, `cupo`.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| Tipo de cobro de la empresa, `mensual` \| `anual` (ajuste planes-custom D6, PR #72) | `organizacion.plan_tipo_cobro` + CHECK (migración `20261104130000_plan_sin_negociable_y_tipo_cobro`); `lib/types/planes.ts` (`TIPOS_COBRO`, `tipoCobroSchema`, `cambiarTipoCobroSchema`, `asignarPlanSchema`) | **Se amplía** a cuatro valores. Se reutilizan la columna, los esquemas y su paso por `plan_de_la_empresa`. |
| Monto del período y siguiente cobro (D7, D8, D9) | `lib/planes/cobro.ts`: `montoDelPeriodo`, `siguienteCobro`, `cobroDelPlan`, `valorDelHistorialDeAsignacion`, `tipoCobroDelHistorial` | **Se reescriben por dentro**: factor + descuento del período, tramo proporcional y siguiente cobro de calendario. |
| «Cambiar tipo de cobro» (D10) y su acción de historial `plan_tipo_cobro_cambiado` (D16) | `PlanesRepository.cambiarTipoCobro`, `cambiarTipoCobroAction`, `PlanEmpresa.tsx` | Se reutilizan. **Cambia su efecto**: lleva fecha de efecto (R16–R20). Sin acción de historial nueva. |
| Cambio de plan inmediato que conserva el ancla (SL-24 R9–R13, SLT-58, D4) | `PlanesRepository.asignar`, `crearYAsignar` | **Cambia**: lleva fecha de efecto. Con hoy se aplica; con fecha futura queda pendiente (R16–R18). |
| Cambio programado del plan, `vigente_desde` (SLT-58) | `plan_cambio_programado`, `programarCambio`/`aplicarCambioProgramado`/`cambiosVencidos`, trabajos `plan_aplicar_cambio` y `plan_cambios_vencidos` (`lib/planes/jobs-cambio-plan.ts`, `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`) | **Se reutiliza** para las ediciones de precio con fecha futura (R22). El pendiente de empresa copia su forma: id comparado, trabajo a la hora y barrido (R20). |
| Ciclo de órdenes anclado (SL-24 R20) y ciclo corto (SLT-58 R34) | SQL `plan_inicio_ciclo`, `plan_inicio_ciclo_en_curso`, columna `plan_ciclo_corto_desde_at`; TS `lib/planes/ciclo.ts` | **Se sustituyen** por el período de calendario con tramo (§3). Las funciones viejas se conservan para los `down.sql`, sin uso. El ciclo corto **se retira** (P4 = a, §3.4). |
| Tope de órdenes por ciclo (SL-24) | `plan.tope_ordenes_ciclo`, `TopesPlan.ordenesPorCiclo`, trigger `plan_tope_ordenes`, `plan_cupo_ordenes`, `CupoPlanRepository`/`ICupoPlanRepository`, el chequeo previo de `BulkOrdenService` y de las rutas `app/api/ordenes/carga-masiva/chunk` y `app/api/ordenes/api-key/carga`, `lib/planes/tope-error.ts` (variante `ordenes`), `AvisosDeTopes.tsx` y las filas de `ConsumoDelPlan.tsx` | **Se retira** entero (R8, R34). `plan_uso_ordenes` se queda: sirve para contar las órdenes del período (R7). |
| Precio anual fijo y descuento anual | `plan.precio_anual`, `plan.descuento_anual_pct`, CHECK `plan_precio_forma`; `PrecioPlan.anual` | **Se retiran**: pasan a descuentos del período anual (R33). |
| Costeo del ciclo (SLT-66 R19) y aviso `anualNoAplicaAlCosto` | `lib/planes/costeo.ts`, `ConsumoDelPlan.tsx` | La base pasa a ser el costo del período o del tramo (R28). El aviso se va. |
| «Lo cobrado en el ciclo» y las órdenes sin estado final (SLT-83 R23, R24, por fecha del cargo) | SQL `plan_cobro_del_ciclo(org, p_desde)` (migración `20261104150200_cobro_plataforma_porcentual_funciones`), llamada desde `plan_de_la_empresa` y desde `PlanesRepository.planDeEmpresa` | Pasa a contar dentro del período en curso de calendario (decisión del 2026-11-05) cambiando solo el `p_desde` que recibe. Ver §12. |
| Periodicidad de gastos fijos (feature 84) | `GastoFijoPlantilla`, `lib/utils/periodicidad.ts` | **No se reutiliza** (A3, §10). |

Ficha relacionada en el board: SLT-85 (traza de cobros por orden), que no se solapa.

## 1. Modelo de datos

### 1.1 `plan_descuento_periodo` (tabla nueva, de PLATAFORMA)

```
plan_descuento_periodo
  plan_id     TEXT  NOT NULL  FK plan(id) ON DELETE CASCADE ON UPDATE CASCADE
  periodo     TEXT  NOT NULL  CHECK (periodo IN ('quincenal','mensual','bimestral','anual'))
  porcentaje  DECIMAL(5,2)  NULL  CHECK (porcentaje > 0 AND porcentaje <= 100)
  monto       DECIMAL(12,2) NULL  CHECK (monto >= 0)
  CHECK ((porcentaje IS NULL) <> (monto IS NULL))
  PRIMARY KEY (plan_id, periodo)
```

- Sin fila = sin descuento.
- Es de plataforma, como `plan_tope_rol`: RLS sin políticas y `REVOKE ALL … FROM servi_app`, y se clasifica en
  `lib/db/modelos-de-negocio.ts`.
- El PK es un único anclado: no cuenta para `unicos-por-empresa`.
- R11 (sin precio, sin descuentos) lo validan zod y el repositorio, que borra los descuentos al guardar «sin
  precio».
- Guarda el precio **vigente hoy**: el que leen el catálogo, el formulario y el costo concreto de SLT-66 R28.

### 1.2 `plan_precio_historial` (tabla nueva, de PLATAFORMA, solo se añade) — R15

```
plan_precio_historial
  plan_id         TEXT          NOT NULL  FK plan(id) ON DELETE CASCADE ON UPDATE CASCADE
  desde_at        TIMESTAMP(3)  NOT NULL   -- 00:00 de la fecha de efecto en UTC; '-infinity' = desde siempre
  precio_mensual  DECIMAL(12,2) NULL
  descuentos      JSONB         NOT NULL DEFAULT '{}'
  PRIMARY KEY (plan_id, desde_at)
```

- **Lectura:** el costo de un período o tramo que empieza en `S` usa la fila con el mayor `desde_at ≤ S`. Es
  una consulta por PK; no hay trabajo nuevo ni datos congelados por empresa (A4).
- **Siembra:** la migración pone una fila por plan con `'-infinity'`, y `crear` hace lo mismo.
- **Escritura:** en la misma transacción que hace vigente un precio, solo si cambió el mensual o algún
  descuento:
  - `editar` con fecha de hoy → `desde_at` = 00:00 de hoy;
  - `aplicarCambioProgramado` → `desde_at` = 00:00 de `vigente_desde`.

  Con `ON CONFLICT … DO UPDATE`, dos ediciones del mismo día dejan la última.
- **Coherencia:** la última fila con `desde_at ≤ now()` es igual a `plan.precio_mensual` +
  `plan_descuento_periodo`. Lo comprueba el test.
- Es de plataforma, como la anterior. La empresa lo ve solo por `plan_de_la_empresa`.
- **Residuo** (el de SLT-58 §16.3): mientras el trabajo no corre (como mucho la hora del barrido), un período
  que empiece en ese intervalo lee la fila anterior. Al aplicarse, la fila nueva rige desde las 00:00 y la
  lectura queda bien.

### 1.3 `organizacion`

| Columna | Cambio | Para qué |
|---|---|---|
| `plan_tipo_cobro` | CHECK ampliado a cuatro valores | R1 |
| `plan_ciclo_ancla_at` | **cambia de sentido**: es la *entrada*, siempre las 00:00 de un día, nunca futura | R2, R5, R17, R35 |
| `plan_ciclo_corto_desde_at` | **se borra** (P4 = a; §3.4) | — |
| `plan_cambio_id`, `plan_cambio_plan_id` (FK `plan` NO ACTION), `plan_cambio_tipo_cobro`, `plan_cambio_desde_at`, `plan_cambio_actor_id` | **nuevas**: el pendiente de la empresa | R16–R21 |

- CHECK: las cinco columnas del pendiente son todas NULL o todas no NULL.
- Por P4 = a, el pendiente puede existir con `plan_id IS NULL`: una primera asignación con fecha futura.
- `organizacion` sigue siendo de solo lectura para `servi_app`. Escribe solo `PlanesRepository`, bajo el
  cerrojo `FOR UPDATE` de la empresa. El pendiente va en columnas y no en una tabla por la razón de A6 (§10).

### 1.4 `plan`

- Se van `precio_anual`, `descuento_anual_pct`, `plan_precio_forma` y **`tope_ordenes_ciclo`** (R34).
- `precio_mensual` sigue siendo el costo base mensual vigente.
- `plan_tope_rol` y `tope_api_keys` no cambian.

### 1.5 País y moneda

Los importes del plan no tienen moneda: está abierto desde SLT-66 (SL-21). La hora de Costa Rica es la de la
plataforma: −06:00 fijo, sin horario de verano. El desfase vive en una sola fuente, `inicioDelDiaCREnUtc`
(SLT-58 P8). En SQL se usa la misma constante: `interval '6 hours'`.

## 2. Tipos y contratos

- `lib/types/planes.ts`:
  - `TIPOS_COBRO` ×4; `DescuentoPeriodo = {tipo:"porcentaje", porcentaje} | {tipo:"monto", monto}`;
  - `PrecioPlan = {tipo:"sin_precio"} | {tipo:"monto", mensual, descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>>}`;
  - `TopesPlan` pierde `ordenesPorCiclo`. Como el esquema es `.strict()`, si llega da `validation_error` (R8);
  - `TopeExcedido.tope` pierde `"ordenes"`.
- `asignarPlanSchema`:
  - sin plan previo, `inicioCiclo` (R2);
  - con plan previo, `vigenteDesde` obligatorio (R16).

  Lo decide el servicio y lo revalida el repositorio bajo el cerrojo, como SLT-58 R31. `crearPlanSchema`
  (custom con empresa) sigue la misma regla.
- `cambiarTipoCobroSchema` gana `vigenteDesde`, y entra un `cancelarCambioEmpresaSchema` nuevo,
  `{ organizacionId }`.
- `editarPlanSchema`: `vigenteDesde` es obligatorio y `≥ hoy` si cambian `precio.mensual` o `precio.descuentos`
  (R22). Si no, sigue la regla de SLT-58.
- **Rangos (decisión del 2026-11-05):**
  - cambio de empresa: `hoy ≤ fecha ≤ fechaMasMeses(hoy, 12)`;
  - edición de precio: `fecha ≥ hoy`;
  - primera asignación: SLT-58 R30.
- `lib/types/consumo-plan.ts`:
  - `CobroDelPlan = { tipo, periodo: {desde, hasta, esTramo}, costo: string|null, siguienteCobro, pendiente: {planNombre, tipo, desde}|null }`;
  - `CosteoDelCiclo.base` = `{ tipo:"monto", periodo }`;
  - sin `anualNoAplicaAlCosto`;
  - `PlanConConsumo` pierde el tope y el estado «cerca/lleno» de órdenes, y se queda con `ordenesDelPeriodo`.
- **Actions** (`lib/actions/planes.ts`): entra `cancelarCambioEmpresaAction`. Las de asignar, crear, editar,
  cambiar tipo y las dos vistas previas amplían su entrada. Las vistas previas solo avisan de usuarios y API
  keys.

## 3. El período de calendario (base y TS)

### 3.1 SQL (migración nueva)

```sql
-- R4: inicio del período de calendario que contiene p_ahora (UTC sin zona), con bordes a las 00:00 −06:00.
plan_inicio_periodo_calendario(p_tipo text, p_ahora timestamp) RETURNS timestamp  IMMUTABLE
  -- l := p_ahora - interval '6 hours'                                  (hora local de la plataforma)
  -- quincenal: date_trunc('month', l) + (CASE WHEN extract(day from l) >= 16 THEN 15 ELSE 0 END) * interval '1 day'
  -- mensual:   date_trunc('month', l)
  -- bimestral: date_trunc('year', l) + ((extract(month from l)::int - 1) / 2 * 2) * interval '1 month'
  -- anual:     date_trunc('year', l)
  -- … + interval '6 hours'                                             (de vuelta a UTC)
plan_fin_periodo_calendario(p_tipo text, p_ahora timestamp) RETURNS timestamp     IMMUTABLE
  -- el inicio del siguiente: inicio + (15 días o fin de mes | 1 | 2 | 12 meses), calculado en local

-- R5, R6: el período en curso de una empresa.
plan_inicio_ciclo_de(p_entrada timestamp, p_tipo text, p_ahora timestamp) RETURNS timestamp  IMMUTABLE
  -- GREATEST(p_entrada, plan_inicio_periodo_calendario(p_tipo, p_ahora))
```

- Las tres son puras y llevan `REVOKE EXECUTE … FROM PUBLIC`.
- El fin del período en curso es siempre el fin del período de calendario: el tramo solo recorta el inicio.
- La entrada nunca es futura: por P4 = a, lo futuro es un pendiente.

### 3.2 TS (`lib/planes/ciclo.ts`)

Funciones gemelas: `inicioDelPeriodoCalendario(tipo, ahora)`, `finDelPeriodoCalendario(tipo, ahora)` y
`periodoEnCurso(entrada, tipo, ahora) → { desde, hasta, esTramo }`. Usan los componentes UTC desplazados
−6 h, la misma aritmética que `inicioDelDiaCREnUtc`. Además:
- `diasDelPeriodo` y `diasDelTramo` cuentan días de calendario de la plataforma.
- `fechaDeEfectoPorDefecto(tipo, ahora) = fechaCalendarioCR(finDelPeriodoCalendario(tipo, ahora))` (R25). Cae
  siempre dentro del rango de R16: el más lejano es el 1 de enero siguiente, a menos de 12 meses.
- `inicioDelCiclo`, `inicioDelSiguienteCiclo`, `inicioDelCicloEnCurso` y `rangoDelInicioDelCiclo`: las tres
  primeras se borran, porque ya no las usa nadie, y `rangoDelInicioDelCiclo` se queda (R2). T3 borró
  `inicioDelCiclo` e `inicioDelCicloEnCurso`; `inicioDelSiguienteCiclo` sigue hasta que `consumo.ts` (T6) y la
  vista previa de `PlanesRepository` (T9) dejen de usarla, y se borra con ellas.
- La tabla de fechas que comparten la gemela TS y la base vive en
  `tests/integration/db/_fixtures/periodo-calendario.ts`.

### 3.3 Quién usa `plan_inicio_ciclo_de`

- `plan_de_la_empresa`, recreada con `CREATE OR REPLACE` desde el cuerpo vigente tras SLT-83:
  - `ciclo_inicio` = `plan_inicio_ciclo_de(ancla, tipo, ahora)` y `ciclo_fin` = `plan_fin_periodo_calendario`;
  - `uso.ordenes` = `plan_uso_ordenes(org, ciclo_inicio)` (R7);
  - gana `descuentos`, `precio_del_periodo` (la fila del historial `≤ ciclo_inicio`, R15) y `cambio_empresa`
    (`{plan_nombre, tipo_cobro, desde}`, **sin actor**, R32);
  - pierde `precio_anual`, `descuento_anual_pct`, `tope_ordenes_ciclo`, `ciclo_corto_desde`.

  «Lo cobrado en el ciclo» de SLT-83 (`cobro_ciclo`) pasa a ser
  `plan_cobro_del_ciclo(org, plan_inicio_ciclo_de(ancla, tipo, ahora))`: por período de calendario sin tocar
  `plan_cobro_del_ciclo` (R28, §12).
- `PlanesRepository` (detalle de empresa y lista) usa la misma función: en `usoDe` y en la consulta de
  `cobroCiclo` de `planDeEmpresa`, que hoy pasan `plan_inicio_ciclo_en_curso(...)`. `usoDe` ya no cuenta
  órdenes contra un tope: solo usuarios y API keys.
- `plan_tope_ordenes` (trigger) y `plan_cupo_ordenes` **se borran** (R8, R34).

**R26 sin plan (decisión del 2026-11-05, elegida en T3).** Una empresa sin plan con una primera asignación
pendiente (P4 = a) ve «Sin límites» y «{Plan} empieza a regir el {fecha}» en «Mi plan» y en el detalle de
empresa. Había dos formas: que `plan_de_la_empresa` devuelva el pendiente aunque no haya plan, o una lectura
aparte en el repositorio. **Se elige `plan_de_la_empresa`**, porque R32 dice que la empresa lee su pendiente
*solo* por su lectura acotada: una lectura aparte para «Mi plan» sería otra función `SECURITY DEFINER` con el
mismo control de contexto, o una consulta de `organizacion` desde la app, que es justo lo que R32 cierra.
- Va en una migración nueva, `20261106130000_plan_de_la_empresa_pendiente_sin_plan`, porque la de §8 ya estaba
  aplicada. Su `down.sql` repone literalmente el cuerpo de §8.
- Forma de la respuesta:
  - con plan, la de siempre (con su `cambio_empresa`);
  - sin plan y con pendiente, `{"sin_plan": true, "cambio_empresa": {plan_nombre, tipo_cobro, desde}}`, sin el
    actor;
  - sin plan y sin pendiente, `NULL` (SLT-58 R6).
- El detalle de empresa del superadmin no pasa por la lectura acotada: `PlanesRepository.planDeEmpresa` lee las
  columnas del pendiente de `organizacion` directamente, como el resto del detalle.
- `MiPlanResult` gana el pendiente en el caso sin plan; lo hace T9 (`MiPlanRepository`, `MiPlanService`), y la
  pantalla, T12.

### 3.4 Se retira el ciclo corto (P4 = a, decisión del 2026-11-05)

Una primera asignación con fecha futura es un pendiente con `plan_id` NULL. Hasta la fecha, la empresa sigue
sin plan, sin límites y con sus módulos de antes. Desde sus 00:00 se aplica como cualquier cambio (§5.2):
plan, tipo, topes de usuarios y API keys, módulos y tramo. Como la entrada nunca es futura:
- `plan_ciclo_corto_desde_at` y su CHECK se borran (§8.1), con la escritura que hace `asignar` y la lectura de
  `plan_de_la_empresa`;
- `plan_inicio_ciclo_en_curso` deja de usarse y se conserva solo para el `down.sql`;
- `tests/integration/db/_fixtures/ciclo-corto.ts` y `plan-ciclo-corto.test.ts` se retiran (§9);
- SLT-58 R34 y R40 dejan de aplicar, y el texto de R38 cambia (§7.1).

## 4. Costo base (`lib/planes/cobro.ts`), en céntimos `bigint` (patrón SLT-66 R19)

```
montoDelPeriodo(precio, tipo):           (R9, R10)
  sin_precio → null
  f = {quincenal: 1/2, mensual: 1, bimestral: 2, anual: 12}[tipo]
  sin descuento → r(mensual × f) ; porcentaje p → r(mensual × f × (100 − p) / 100) ; monto m → max(0, r(mensual × f) − m)
costoDelTramo(costoPeriodo, diasTramo, diasPeriodo) = r(costoPeriodo × diasTramo / diasPeriodo)   (R12)
r = redondeo a 2 decimales, mitad hacia arriba, con enteros: (num + den/2) / den
```

- El tramo aplica su proporción sobre el costo del período ya redondeado, que es lo que dice la decisión
  («costo del período × días ÷ días»). Son dos redondeos, cada uno explícito.
- **Comprobación de la migración (R33):** con anual fijo `A ≤ 12·mensual` y `m = 12·mensual − A`, sale
  `max(0, 12·mensual − m) = A`.
- **El costo del período en curso** sale de la fila de precio vigente al empezar el período (R15) y de
  `periodoEnCurso`: si `esTramo`, se aplica `costoDelTramo`.
- **Cambio con fecha a mitad de período:** el período anterior queda cortado en la fecha de efecto. No se
  muestra en ningún sitio: «Mi plan» solo enseña el período en curso y el cobro sigue siendo informativo.
- **`siguienteCobro` (R27):** la fecha del pendiente si lo hay, y si no
  `fechaCalendarioCR(finDelPeriodoCalendario(tipo, ahora))`. Para el anual, «pago al inicio y otro al año» =
  `fechaCalendarioCR(desde)` y el siguiente 1 de enero.
- **Historial (R30):**
  - `valor_nuevo` = `fecha · tipo`, la forma de `valorDelHistorialDeAsignacion`;
  - `tipoCobroDelHistorial` lee el último segmento también en `plan_tipo_cobro_cambiado`;
  - las filas viejas se leen igual.

## 5. Cambios con fecha de efecto

### 5.1 De una empresa: asignar con plan previo, custom para empresa con plan, cambiar tipo y primera asignación con fecha futura

El servicio valida el rol (R3), el esquema y el rango (R16) y calcula `desde = inicioDelDiaPlataforma(fecha)`.
El repositorio trabaja en una transacción y bajo el cerrojo:

1. Revalida la empresa, que el plan no esté archivado y que sea asignable.
2. Si el resultado es igual a lo vigente (mismo plan y tipo), cancela el pendiente si lo hay; si no lo hay,
   devuelve `ok` sin cambio. En ningún caso escribe historial (R19).
3. **Fecha de hoy:** llama a `aplicarCambioDeEmpresa` en la misma transacción. Con un tope de usuarios o de API
   keys ya pasado, devuelve `tope_excedido` y no escribe (SL-24 R12; R18). En una primera asignación con fecha
   pasada o de hoy, el camino es el de SLT-58: entrada = 00:00 de la fecha y avisos de R36.
4. **Fecha futura:**
   - escribe el pendiente con un `plan_cambio_id` nuevo;
   - encola `plan_aplicar_cambio_empresa`, con la empresa en el trabajo, `run_after = desde` y
     `dedupe_key = plan_cambio_empresa:<cambioId>`;
   - devuelve los `avisos` de usuarios y API keys sin rechazar (R18).

`crearYAsignar` crea el plan y sigue por este camino en la misma transacción (D2).

### 5.2 Aplicar (R17, R20)

`aplicarCambioDeEmpresa(org, cambioId | "inmediato", ahora)`:

1. Si el `cambioId` no coincide o `desde > ahora`, termina sin escribir.
2. Actualiza `plan_id`, `plan_tipo_cobro` y `plan_ciclo_ancla_at = desde`, y limpia el pendiente.
3. Sincroniza los módulos, con el código de `asignar`.
4. Escribe la fila de historial con el actor del pendiente:
   - `plan_asignado` si cambió el plan;
   - si no, `plan_tipo_cobro_cambiado` (antes → `fecha · tipo`).
5. Un tope ya pasado no rechaza: rige SLT-58 R36.

**Trabajos** (`lib/planes/jobs-cambio-plan.ts`):
- `plan_aplicar_cambio_empresa` es puntual y va con empresa. Se registra en `procesar-jobs/route.ts` y en
  `lib/modulos/reparto.ts` como núcleo.
- `plan_cambios_vencidos` gana una pasada `cambiosDeEmpresaVencidos(ahora)`. Es idempotente.
- **Residuo** (el de SLT-58): entre las 00:00 y la corrida, como mucho una hora, la empresa sigue con lo de
  antes. Al aplicar, la entrada es las 00:00, así que el conteo de órdenes y el tramo quedan bien hacia atrás.

### 5.3 Cancelar (R19, R21, R26)

- `cancelarCambioEmpresa(org)` limpia el pendiente; si no hay ninguno, devuelve `sin_cambio_programado`.
- `archivar(planId)` también limpia los pendientes que apuntan a ese plan, incluidas las primeras asignaciones
  pendientes (R21).

### 5.4 Ediciones del plan (R15, R22, R31)

- **El servicio:**
  - si cambia el precio, aplica la regla de `vigenteDesde`;
  - con fecha de hoy, `editar` inmediato;
  - con fecha futura, `programarCambio` de SLT-58 tal cual.
- **`editar` y `aplicarCambioProgramado`:**
  - guardan los descuentos;
  - si el precio cambió, añaden la fila del historial (§1.2);
  - **no tocan a ninguna empresa**.
- **Rastro:**
  - claves nuevas `descuento_<periodo>`;
  - las viejas (`precio_anual`, `descuento_anual_pct`, `tope_ordenes_ciclo`) se siguen pintando;
  - las líneas de «qué cambia» y el correo de SL-24 R41 suman los descuentos y dejan de hablar de órdenes.

## 6. Lectura acotada y servicios

- `MiPlanRepository` y `MiPlanService` arman `cobro` con `periodoEnCurso`, `montoDelPeriodo` +
  `costoDelTramo` sobre `precio_del_periodo`, `siguienteCobro` y el pendiente.
- `PlanesService` hace lo mismo en el detalle de empresa, con `forbidden` antes del repositorio.
- `EmpresasPlataformaRepository` devuelve el tipo (R29).
- La autorización no cambia (SL-24 R5; SLT-58 R8). «Mi plan» y los trabajos son núcleo.

## 7. Pantallas

### 7.1 Textos (aprobados con el spec el 2026-11-05)

- **Tipos:** «Quincenal», «Mensual», «Bimestral», «Anual».
- **Costo base:** «{mensual} / mes».
- **Descuento:** «Descuento {tipo}: {p} %» o «Descuento {tipo}: {monto}». En el formulario: «Ninguno»,
  «Porcentaje» y «Monto fijo».
- **Período:** «Período: {desde} – {hasta}». Si es tramo, «(tramo de {d} de {D} días)».
- **Costo:** «Costo base {tipo}: {monto}».
- **Órdenes:** «Órdenes en el período: {n}» (R7, R8), sin tope ni barra.
- **Fecha de efecto:**
  - el campo: «Rige desde»;
  - ayuda en un cambio de empresa: «Hasta esa fecha la empresa sigue con su plan y su período actuales.»;
  - ayuda al editar el precio: «Cada empresa paga el precio nuevo desde su primer período que empiece en esa
    fecha o después.».
- **Pendiente:** «Desde el {AAAA-MM-DD}: {plan} · {Tipo}», con el botón «Cancelar cambio».
- **Pendiente sin plan (R26, decisión del 2026-11-05):** «Sin límites» y debajo «{Plan} empieza a regir el
  {fecha}», en «Mi plan» y en el detalle de empresa (aquí, con «Cancelar cambio»).
- **Modal de primera asignación con fecha futura:** «El plan empieza a regir el {fecha}.», que sustituye a
  «El ciclo de órdenes empieza el {fecha}.» de SLT-58 R38.
- **Anual:** «Pago anual: {desde}» y «Siguiente pago: {1 de enero}».
- **Reinicio:** «Se reinicia en N días ({fecha})».

### 7.2 Componentes

- `PlanForm.tsx` (R23, R25):
  - sin anual y sin «Tope de órdenes por ciclo»;
  - cuatro descuentos;
  - «Rige desde» al editar el precio;
  - el custom para una empresa con plan muestra el tipo y «Rige desde».
- `PlanesModule.tsx` y `PlanDetalle.tsx`: el precio con descuentos y sin tope de órdenes (R24).
- `PlanEmpresa.tsx` (R25, R26):
  - el modal de cambio de plan y «Cambiar tipo de cobro» con cuatro tipos, «Rige desde» y el costo del primer
    período o tramo;
  - el pendiente con «Cancelar cambio».
- `ConsumoDelPlan.tsx` y `AvisosDeTopes.tsx`:
  - sin la fila de órdenes con tope;
  - el período, el costo, las órdenes, el siguiente cobro, el pendiente y el total (R27, R28).
- `EmpresasModule.tsx`: la etiqueta del tipo (R29).
- Ningún componente nuevo de `ui/`.

## 8. Migración `db/migrations/<ts>_plan_periodo_facturacion/`

El timestamp va detrás de la última de `dev` tras SLT-83 (T0).

### 8.1 `migration.sql`

1. **P3:** si algún plan o versión pendiente tiene un anual fijo mayor que mensual × 12, `RAISE EXCEPTION`
   con `id` y `nombre`, sin aplicar nada (R33).
2. Crea `plan_descuento_periodo` y `plan_precio_historial`, con RLS y REVOKE.
3. Pasa los anuales a descuentos del período anual y reescribe `version->'precio'` de los pendientes.
4. Siembra `plan_precio_historial` con `'-infinity'` y el precio ya convertido.
5. **Tope de órdenes (R34):** por cada plan con `tope_ordenes_ciclo` no NULL, inserta en `plan_rastro` una fila
   `editado` con `cambios = {"tope_ordenes_ciclo": {"antes": "<n>", "despues": null}}`. El actor de sistema es
   `actor_usuario_id = 'sistema'` y `actor_nombre = 'Sistema (migración SLT-86)'`: las columnas son
   opacas y sin FK (SL-24 §2.8). Después:
   - quita `topes.ordenesPorCiclo` de las versiones pendientes;
   - `DROP TRIGGER`, y borra `plan_tope_ordenes()`, `plan_cupo_ordenes()` y la columna.
6. Suelta `plan_precio_forma`, `precio_anual` y `descuento_anual_pct`.
7. `organizacion`:
   - amplía el CHECK del tipo y añade el pendiente;
   - pone `plan_ciclo_ancla_at` = 00:00 de hoy en la plataforma
     (`date_trunc('day', now() AT TIME ZONE 'UTC' - interval '6 hours') + interval '6 hours'`) a **toda**
     empresa con plan, conservando plan y tipo (R35);
   - suelta el CHECK y la columna `plan_ciclo_corto_desde_at` (P4 = a).

   Las órdenes del día creadas antes cuentan, porque la entrada es las 00:00.
8. Crea las funciones de §3.1 y recrea `plan_de_la_empresa` (§3.3).

### 8.2 `down.sql` (R36)

1. Se niega si hay:
   - una empresa con `quincenal`/`bimestral` o con pendiente;
   - un plan o versión con descuento en `quincenal`/`mensual`/`bimestral`;
   - un descuento anual en monto con `12·mensual − monto < 0`.
2. Repone las columnas de `plan`: `tope_ordenes_ciclo` NULL (sin límite) y el anual reconstruido.
3. Repone `plan_ciclo_corto_desde_at` en NULL, el CHECK y las versiones con `anual`.
4. Repone el trigger y las funciones con el **cuerpo literal** de la migración anterior (tras T0), verificado
   con `diff`.
5. Suelta las tablas, las columnas y las funciones nuevas.
6. **Pérdidas declaradas en la cabecera:**
   - los topes de órdenes;
   - las anclas de antes de la migración;
   - las filas con fecha del historial de precio.

## 9. Tests que se retiran o adaptan (R37)

**Se retiran** (prueban lo que esta ficha quita):
- `tests/integration/db/plan-topes-ordenes.test.ts` y `plan-topes-concurrencia.test.ts` (trigger SL024 de
  órdenes; si el segundo también cubre la concurrencia de usuarios o API keys, se adapta en vez de retirarse);
- `tests/unit/api/carga-composition-root-cupo.test.ts`, `tests/unit/api/api-key-carga-tope-plan.test.ts` y
  `tests/unit/services/bulk-orden-service.tope-plan.test.ts` (chequeo previo del cupo);
- `tests/integration/db/plan-ciclo.test.ts` y `tests/unit/utils/ciclo-plan.test.ts` (ciclo anclado de SL-24
  R20; los sustituyen `plan-ciclo-periodo` y `ciclo-periodo`);
- `tests/integration/db/plan-ciclo-corto.test.ts` y `tests/integration/db/_fixtures/ciclo-corto.ts` (P4 = a).

**Se adaptan** (rehecha en T0 contra `dev` con SLT-83, buscando en `tests/` y `e2e/` `ordenesPorCiclo`,
`tope_ordenes_ciclo`, `tope: "ordenes"`, `CupoPlan`, `anual:`, `precio_anual`, `descuento_anual_pct`,
`anualNoAplicaAlCosto`, `plan_ciclo_corto_desde_at`, `cortoDesde`, `inicioDelCiclo*`, `plan_inicio_ciclo*` y
`reinicio`). Un mismo archivo puede caer en más de un motivo; se lista en el primero. Los marcados (SLT-83) los
trajo esa ficha.
- **Por quitar el tope de órdenes** (`TopesPlan.ordenesPorCiclo`, `TopeExcedido.tope = "ordenes"`, la columna):
  - de integración: `planes-catalogo`, `plan-de-la-empresa`, `mi-plan-repository`, `planes-acceso-servi-app`,
    `plan-maestro-sin-tope`, `planes-cambio-programado`, `planes-cambio-correos`, `planes-edicion-en-uso`,
    `planes-historial`, `planes-lecturas-plataforma`, `planes-costeo-escritura`, `cobro-plataforma-plan`,
    `plan-costo-porcentual-escritura` (SLT-83) y `_fixtures/planes.ts`;
  - `tests/integration/plataforma-planes-page.test.tsx`;
  - unitarios: `tests/unit/planes/tope-error.test.ts` (la variante `ordenes`), `rastro.test.ts`,
    `rastro-costeo.test.ts`, `rastro-costo-porcentual.test.ts` (SLT-83), `tests/unit/services/planes-service.test.ts`,
    `planes-service-costeo.test.ts`, `planes-service-costo-porcentual.test.ts` (SLT-83),
    `planes-service-lecturas.test.ts`, `mi-plan-service.test.ts`, `tests/unit/types/planes-schema-costeo.test.ts`,
    `planes-schema-costo-porcentual.test.ts` (SLT-83) y `tests/unit/services/email/plantilla-cambio-plan.test.ts`;
  - de componentes: `PlanForm`, `PlanDetalle`, `PlanDetalleAsignar` (SLT-83), `PlanDetalleDesasignado`,
    `PlanesModule`, `PlanEmpresa`, `PlanEmpresaCostoPorcentual` (SLT-83), `PlanFormCostoPorcentual` (SLT-83),
    `MiPlanModule`, `ConsumoDelPlan`, `ConsumoDelPlanCosteo`, `ConsumoDelPlanPorcentual` (SLT-83) y
    `PlanFormVistaPreviaCustom`;
  - `e2e/_planes-fixture.ts`, `e2e/planes-superadmin.spec.ts`, `e2e/planes-costeo.spec.ts` y
    `e2e/dos-empresas-humo.spec.ts` (espera el mensaje del tope de órdenes de la carga).
- **Por el tipo `PrecioPlan`** (sin `anual`, con `descuentos`) **y `CosteoDelCiclo`** (sin `anualNoAplicaAlCosto`):
  - `tests/unit/planes/cobro.test.ts` (D7, con los mismos números), `costeo.test.ts`, `consumo.test.ts`,
    `costeo-porcentual.test.ts` (SLT-83), `costo-concreto-porcentual.test.ts` (SLT-83),
    `mensajes-costo-porcentual.test.ts` (SLT-83) y `planes-schema.test.ts`;
  - `tests/integration/db/plan-de-la-empresa-porcentual.test.ts` (SLT-83: solo el tipo; el conteo por período
    sigue dando lo mismo, §12);
  - `tests/integration/db/cobro-plataforma-porcentual.test.ts` (SLT-83 R10: escribe `descuento_anual_pct`;
    pasa a un descuento en `plan_descuento_periodo`, que es lo que R13 dice que no toca el cargo);
  - `migracion-planes-custom-ida-y-vuelta` (su `M_ANTERIOR`).
- **Por la fecha de efecto, la primera asignación y el ciclo corto (P1, P4):**
  - de integración: `planes-cambiar-tipo-cobro`, `planes-asignacion*`, `planes-asignacion-inicio-ciclo` y
    `planes-crear-custom-asigna`;
  - de servicios: `planes-service-tipo-cobro`, `planes-service-inicio-ciclo`, `planes-service-crear-custom` y
    `planes-service-asignar-costo`;
  - `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` (su doble de `organizacion` trae
    `planCicloCortoDesdeAt`);
  - de componentes: `PlanEmpresaTipoCobro`, `PlanEmpresaSinCosto`, `PlanFormCustomAsigna`, `PlanVistaCosteo`
    y `PlanFormCosteo`;
  - `tests/integration/plataforma-empresa-detalle-page.test.tsx` y `tests/unit/actions/planes.composition-root.test.ts`.
- **Migraciones anteriores:**
  - `migracion-sl24-ida-y-vuelta`, `migracion-ciclo-elegido-ida-y-vuelta`, `migracion-slt66-ida-y-vuelta`,
    `migracion-slt66-desasignar` y `migracion-slt83-ida-y-vuelta` (SLT-83) siguen probando su propia ida y
    vuelta, aplicadas hasta su punto en una base propia: no leen el estado final y **no se adaptan**;
  - se adaptan solo si leen el estado final de la base (columnas que esta migración quita).

No leen el tope ni el ciclo, y quedan igual: `cobro-plataforma-porcentual-aislamiento`,
`cobro-plataforma-porcentual-importe`, `cobro-porcentual-estados-finales`, `empresas-plataforma-cobro-porcentual`,
`plan-de-la-empresa-costeo`, `_fixtures/cobro-porcentual.ts`, `EmpresasModuleCobroPorcentual.test.tsx` y
`e2e/planes-costo-porcentual.spec.ts` (SLT-83).

## 10. Alternativas descartadas

- **A1 — Ocho columnas de descuento en `plan`:** CHECKs gemelos, ocho campos en cada lectura y versión. La
  tabla hija repite `plan_tope_rol`.
- **A2 — Resolver el pendiente de la empresa al leer, sin trabajo:** los módulos son filas que hay que
  escribir en la fecha. Quedaría un estado mixto y dos mecanismos.
- **A3 — `lib/utils/periodicidad.ts` / `GastoFijoPlantilla`:** trabaja con `DATE` y «¿aplica hoy?», su quincenal
  son 14 días desde un ancla y no tiene gemela SQL. Los períodos de calendario se reducen a `date_trunc`, sin
  esa maquinaria.
- **A4 — Congelar por empresa el costo del período en curso** al editar un precio: obliga a recorrer todas las
  empresas en cada edición, y con dos ediciones dentro de un mismo período anual se pierde cuál rige. El
  historial por plan (§1.2) responde con una consulta.
- **A5 — Período en el plan:** lo descartó el humano (PR #72).
- **A6 — Tabla `plan_cambio_empresa` para el pendiente:** sería de negocio (con `organizacion_id`, RLS y
  triggers) para guardar una fila por empresa que solo escribe el superadmin. Columnas junto a `plan_id`.
- **A7 — Reanclar a las empresas al editar el precio:** descartado por el humano.
- **A8 — Guardar el período en curso (inicio y fin) en `organizacion` y renovarlo con un cron:** con períodos
  de calendario, el período es una función pura de (entrada, tipo, ahora). Un cron solo añadiría desfase y otro
  punto de fallo.

## 11. Dependencias

Ninguna librería nueva. Fechas con `Date` UTC desplazado y céntimos `bigint`, como hoy.

## 12. Dependencia con SLT-83

Contrastado en T0 contra `dev` con SLT-83 integrada (merge `8eb66b88`), leyendo el código:

- **Dónde se cuenta (SLT-83 R23, R24).** Una sola definición en SQL, `plan_cobro_del_ciclo(p_organizacion_id,
  p_desde)` (`db/migrations/20261104150200_cobro_plataforma_porcentual_funciones/migration.sql`, pieza 8):
  - `cobrado` = Σ cargos − Σ reversos de la empresa con `ocurrido_at >= p_desde` (R24);
  - `pendientes` = órdenes porcentuales vivas con `created_at >= p_desde` que no están en un estado final (R23).

  La función no conoce el ciclo: lo recibe en `p_desde`. Hay **dos** llamadas, y las dos le pasan hoy
  `plan_inicio_ciclo_en_curso(o."plan_ciclo_corto_desde_at", o."plan_ciclo_ancla_at", now() AT TIME ZONE 'UTC')`:
  - `plan_de_la_empresa` (misma migración, pieza 9), clave `cobro_ciclo` → `MiPlanRepository` (`cobro_ciclo`) →
    `lib/planes/consumo.ts > planConConsumo` → `costeoDelCiclo` («Mi plan»);
  - `PlanesRepository.planDeEmpresa` (`lib/repositories/PlanesRepository.ts`, consulta `cobroCiclo` con
    `CROSS JOIN LATERAL plan_cobro_del_ciclo(...)`) → el mismo `costeoDelCiclo` (detalle de empresa del
    superadmin).

  `lib/planes/costeo.ts > costeoDelCiclo` solo suma `cobroCiclo.cobrado` a la base: no calcula fechas.
- **Cómo pasa a período de calendario.** Tal como decía este diseño: en las dos llamadas, `p_desde` pasa a ser
  `plan_inicio_ciclo_de(o."plan_ciclo_ancla_at", o."plan_tipo_cobro", now() AT TIME ZONE 'UTC')`, el mismo
  `ciclo_inicio` de §3.3. `plan_cobro_del_ciclo` no se toca. Lo hacen T3 (`plan_de_la_empresa`, en la migración
  de §8) y T9 (`PlanesRepository.planDeEmpresa`). No cambia ningún requisito: R28 ya lo dice así.
- **SLT-83 R23** («órdenes del ciclo sin estado final») pasa a ser las del período en curso, con el mismo cambio.
- **SLT-83 R10** («sin descuento anual») pasa a «ningún descuento de período» (R13). Su test,
  `cobro-plataforma-porcentual.test.ts`, escribe `descuento_anual_pct = 20` por SQL: se adapta (§9).
- Las condiciones congeladas de las órdenes porcentuales (SLT-83 R11) no se tocan.
- `tests/integration/db/plan-de-la-empresa-porcentual.test.ts` (R24) pone el ancla a 10 días y lleva lo de
  «antes» a −12 y −15 días. Con `GREATEST(entrada, inicio de calendario)` el inicio queda en `[−10 días, ahora]`
  y el caso sigue dando lo mismo: solo se adapta por el tipo (`anualNoAplicaAlCosto`, §9).
- Los tests de SLT-83 que leen el tope de órdenes o el precio anual están en §9.
