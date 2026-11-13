# SLT-128 — planes-cambios-por-periodo · design.md

> Ficha: SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período» (rebanada 1
> del corte P3). Requisitos: `requirements.md` (R1–R29; R28 y R29 de la review, en §14). Tareas: `tasks.md`. Apilada sobre SLT-118 «Planes: factura
> por empresa y período con la cuota y las órdenes»: su código y su `design.md` son la base vigente.

## Lo que ya existe

- **Ninguna ficha ni spec aplica una edición del plan por empresa.** Revisados `feature_list.json`, `specs/` y el
  código (Grep: el grafo no tenía índice de este worktree).
- **Una sola versión por plan.** Nombre, topes (`plan_tope_rol`, `plan.tope_api_keys`), cobro por orden
  (`plan.costo_por_orden`, `_pct`, `_minimo`) y periodicidad (`plan.periodicidad_ordenes`) viven en la fila del
  plan. Los leen por `organizacion.plan_id`:
  - los triggers `plan_tope_usuario` y `plan_tope_api_key` (`20261028130200`);
  - `cobro_plataforma_tarifa_de` (`20261113120000`);
  - `plan_de_la_empresa` (`20261106130000`, «Mi plan»);
  - `factura_plataforma_abrir`, `_tomar_cambio`, `_cuota` y `_cerrar` (`20261111130100`);
  - `PlanesRepository.planDeEmpresa` (detalle de empresa del superadmin).
- **Los módulos ya son estado por empresa.** `sincronizarModulos` y `cambiarModulos` escriben los módulos de una
  empresa; la versión solo dice cuáles debería tener.
- **El precio ya va por período de cada empresa.** `plan_precio_historial` (SLT-86 R15): la cuota de un período que
  empieza en S usa la fila con el mayor `desde_at ≤ S`. Una fila con `desde_at = F` rige exactamente desde la
  recepción de cada empresa (R3): basta con escribirla antes de la primera cuota que la usa.
- **El cambio programado** (`plan_cambio_programado`, `plan_id` único; SL-24 §16) se aplica entero en `vigente_desde`
  con `plan_aplicar_cambio` y el barrido `plan_cambios_vencidos`; los recordatorios (`plan_recordatorio_cambio`) son
  por plan, 7 y 1 días antes, y reparten un `plan_aviso_correo` por empresa.
- **La fecha por tipo** ya existe en TS: `inicioDelPeriodoCalendario` y `fechaDeEfectoPorDefecto` (`lib/planes/ciclo.ts`),
  y en SQL `plan_inicio_periodo_calendario` y `plan_fin_periodo_calendario`.
- **El punto común para entrar o salir de un plan**: `PlanesRepository.aplicarEnTx` (asignar, crear custom, cambiar
  tipo, aplicar el pendiente de empresa y el cambio del maestro de SLT-99).

Lo nuevo de fondo: durante un cambio a medias, empresas del mismo plan corren versiones distintas (hasta tres con un
reemplazo, R13). Eso pide una versión **por empresa** y que cada lector la consulte.

## 1. Modelo de datos

Dos tablas de **plataforma** (como `plan_*`): RLS habilitada sin ninguna política y `REVOKE ALL … FROM servi_app`
(R26). Llevan la empresa como dato y FK en `empresa_id` (campo Prisma `empresaId`), pero no son de negocio: la
empresa no las lee ni las escribe. Se clasifican en `MODELOS_DE_PLATAFORMA` (`lib/db/modelos-de-negocio.ts`), con el
resto de planes.

> **Cambio 2026-11-12 — decisión del humano: la guardia organizacion-en-modelos prohíbe `organizacion_id` en tablas
> de plataforma.** La columna de la empresa en las dos tablas pasa de `organizacion_id` a `empresa_id` (Prisma
> `empresaId`). La guardia no se toca.

### 1.1 `plan_cambio_recepcion` — una fila por empresa y pendiente (R1, R5, R9, R11, R17–R19)

| Columna | Tipo | Nota |
|---|---|---|
| `cambio_id` | `text` FK → `plan_cambio_programado(id)` `ON DELETE CASCADE` | reemplazar o cancelar el pendiente borra sus filas |
| `empresa_id` | `text` FK → `organizacion(id)` `ON DELETE CASCADE` | la empresa (2026-11-12: no `organizacion_id`) |
| `recibe_at` | `timestamp(3)` | 00:00 de la plataforma de su recepción, en UTC |
| `recibido_at` | `timestamp(3) NULL` | cuándo la cola la aplicó; nula = pendiente |

PK `(cambio_id, empresa_id)`, índice `(empresa_id)`. Índice parcial `(recibe_at) WHERE recibido_at IS NULL` para el barrido y para
la espera del cierre.

### 1.2 `plan_version_empresa` — la versión propia de una empresa (R2, R10, R13, R16, R17)

| Columna | Tipo | Nota |
|---|---|---|
| `empresa_id` | `text` PK, FK → `organizacion(id)` `ON DELETE CASCADE` | una como mucho por empresa (2026-11-12: no `organizacion_id`) |
| `plan_id` | `text` FK → `plan(id)` `ON DELETE CASCADE` | el plan del que es versión |
| `cambio_id` | `text` | el pendiente que la trajo; opaco y **sin FK**, para que sobreviva al reemplazo (R13) |
| `version` | `jsonb` | completa, con la forma de `versionPlanSchema` y `periodicidadOrdenes` siempre presente |
| `desde_at` | `timestamp(3)` | su recepción o su entrada |

Índice `(plan_id)`. **Sin fila, la empresa corre la versión del plan.** Hay fila solo durante un cambio a medias:
se escribe al recibir (o al entrar con la versión nueva, R17) y se borran todas las del plan al promoverlo (R10) o
al salir la empresa del plan (R18). Así «plan partido» = existe alguna fila con ese `plan_id`.

### 1.3 Prisma

`db/schema.prisma`: los modelos `PlanCambioRecepcion` y `PlanVersionEmpresa`, con sus relaciones inversas en
`PlanCambioProgramado` (`recepciones`), `Organizacion` (`planRecepciones`, `planVersion`) y `Plan`
(`versionesDeEmpresa`). Los `CHECK`, el índice parcial, la RLS y el `REVOKE` viven solo en el SQL, comentados en el
modelo como en los demás `plan_*`.

## 2. La base

### 2.1 Lectores de la versión de la empresa (R2, R12)

Dos funciones internas nuevas, `STABLE SECURITY DEFINER`, `search_path` fijo y `EXECUTE` revocado a `PUBLIC`:
- `plan_version_de(p_org text, p_plan_id text)` → `(nombre, periodicidad_ordenes, tope_api_keys, costo_por_orden,
  costo_por_orden_pct, costo_por_orden_minimo)`: la de `plan_version_empresa` si la empresa tiene una con ese
  `plan_id`, y si no la de la fila del plan. Los importes salen del JSON como texto → `numeric`.
- `plan_tope_rol_de(p_org text, p_plan_id text, p_rol rol_value)` → `integer`: `version->'topes'->'porRol'->>clave`,
  con `clave = CASE p_rol WHEN 'Admin Tienda' THEN 'adminTienda' ELSE p_rol::text END` (la misma traducción del
  mensaje del trigger); sin versión propia, la fila de `plan_tope_rol`. `NULL` = sin tope.

Se reescriben con `CREATE OR REPLACE`, sin cambiar firma ni comportamiento salvo la fuente de la versión:

| Función | Lee ahora |
|---|---|
| `plan_tope_usuario()` | `plan_tope_rol_de(org, plan, rol)` (sigue con `organizacion` y `plan` `FOR SHARE`) |
| `plan_tope_api_key()` | `plan_version_de(org, plan).tope_api_keys` |
| `cobro_plataforma_tarifa_de(org)` | los tres costos de `plan_version_de` |
| `plan_de_la_empresa(org)` | nombre, topes, módulos, costos y periodicidad de la versión de la empresa; `cambio` = su recepción pendiente (`recibe_at` como `vigente_desde`, `version` del pendiente), o `NULL` si ya la recibió o no tiene (R12) |
| `factura_plataforma_abrir` | nombre y periodicidad de `plan_version_de` |
| `factura_plataforma_tomar_cambio` | nombre y periodicidad del plan nuevo con `plan_version_de(p_org, p_plan_id)` (R17: la versión propia se escribe antes de llamarla) |
| `factura_plataforma_cuota` | `cuota_plan_nombre` con `plan_version_de` |
| `factura_plataforma_cerrar` | la espera de §2.2 |

Los módulos no tienen lector en SQL: se escriben por empresa (§3.3).

### 2.2 La espera del cierre (R9)

En `factura_plataforma_cerrar`, el bloque de SLT-118 que buscaba un `plan_cambio_programado` que cambiara la
periodicidad se sustituye por `v_recepcion := min(recibe_at)` de `plan_cambio_recepcion` de la empresa con
`recibido_at IS NULL`. Igual que antes:
- `avanzar(p_org, LEAST(p_ahora, v_recepcion − 1 µs))`: la factura cuyo fin llega a la recepción sigue en curso y la
  siguiente no se abre con la versión vieja;
- `v_espera := LEAST(plan_cambio_desde_at, v_recepcion)` y el bucle sale en la primera `por_cerrar` con
  `v_espera ≤ hasta_at`.

Vale para toda edición, no solo la periodicidad (decisión «Cierre de la factura»). La recepción cae siempre en un
inicio de período de cobro de la empresa: un 1 o un 16, y con SLT-118 R37 un corte de su periodicidad. Por eso la
factura emitida ahí se cierra con la versión nueva (nombre de la cuota, precio por R3) y R7 sale solo.

## 3. Repositorio (`PlanesRepository`, `IPlanesRepository`)

### 3.1 Programar (`programarCambio`; R1, R13, R20, R21)

Orden nuevo, para que el tipo de cobro leído no cambie por debajo (§6):
1. `SELECT … FROM organizacion WHERE plan_id = P ORDER BY id FOR SHARE`, **antes** del plan;
2. `bloquearPlanParaEscribir(P)` y lo de hoy: archivado, R37, `excedidosDe`, rastro, reemplazo (borrar el pendiente
   viejo borra sus recepciones en cascada; las versiones propias se quedan, R13), crear el pendiente;
3. por cada empresa: `recibe_at = fechaDeRecepcion(tipo, F)` (§5), una fila de `plan_cambio_recepcion`, su trabajo
   de recepción (§4) y sus recordatorios (`recordatoriosDe(ahora, recibe_at)`, §5);
4. un `plan_aviso_correo` `guardado` por empresa con **su** `recibe_at`, las diferencias contra **su** versión (la
   propia si la tiene, si no la del plan) y, si reemplaza, `reemplazaA` = su `recibe_at` anterior (R20);
5. el `plan_aplicar_cambio` sin empresa en F, como hoy: solo promueve (§3.2).

En esta rebanada F siempre es posterior a hoy al programar: un precio con fecha de hoy sigue yendo por la edición
inmediata (R23, SLT-86 R22). Por eso ninguna recepción nace vencida. Cuando SLT-135 «Planes: sin «De inmediato» al
editar un plan» lleve «hoy» por aquí, la recepción con `recibe_at ≤ ahora` se recibirá en la misma transacción.

### 3.2 Promover (`aplicarCambioProgramado`; R10)

Lo llama el `plan_aplicar_cambio` **sin empresa** y el barrido. Bajo el cerrojo del plan, con ESTE `cambioId`:
- antes de F → `aun_no_rige`; con alguna recepción sin recibir → `espera` (no hace nada);
- si no, **promueve**: `aplicarVersion` con `sincronizarModulos: false` (los módulos ya los recibió cada empresa,
  y repetirlos borraría las excepciones de R4); `plan_precio_historial` con `desde_at = F` si cambia el precio y
  aún no está (`ON CONFLICT DO NOTHING`); borrar las `plan_version_empresa` del plan; fila `cambio_aplicado`; borrar
  el pendiente. Devuelve `aplicado`.

Un plan sin empresas no tiene recepciones: promueve en F, como hoy.

### 3.3 Recibir (`recibirCambio(cambio, organizacionId, ahora)`, nuevo; R2, R4–R8, R10)

En una transacción, **empresa antes que plan** (§6):
1. `organizacion FOR UPDATE`; la fila de recepción de ESE `cambioId` y empresa con `recibido_at IS NULL`; si no está
   o `recibe_at > ahora` → `sin_pendiente` o `aun_no_rige`;
2. plan `FOR UPDATE`; la versión del pendiente (`versionPlanSchema`, completada con los campos ausentes desde la
   fila del plan);
3. R8: tipo `quincenal` con versión `mensual` → lanza (el trabajo falla sin escribir);
4. módulos: `cambiarModulos(tx, org, añadidos, quitados)` contra la versión que la empresa tenía, con las filas de
   historial de SL-23 firmadas por el sistema (R4);
5. precio: la fila `desde_at = F` del historial si cambia y aún no está (R3);
6. `plan_version_empresa` ← la versión, `cambio_id`, `desde_at = recibe_at` (upsert); `recibido_at = ahora`;
7. si no queda ninguna recepción sin recibir y `ahora ≥ F` → promueve en la misma transacción (§3.2, R10).

No toca `plan_ciclo_ancla_at` (R5) ni escribe en las facturas: la abre `avanzar` con la versión nueva (R7, R9).

### 3.4 Cancelar, archivar y editar en el acto (R14–R16)

- `cancelarCambio`: si existe alguna `plan_version_empresa` del plan → `{ estado: "cambio_a_medias" }` sin escribir
  (R14, P8). Si no, como hoy.
- `archivar`: si el pendiente tiene alguna recepción sin recibir → `cambio_a_medias` sin escribir (R15). Sin
  recepciones (plan sin empresas), como hoy: cancela el pendiente (SL-24 R40).
- `editar` (inmediata): si el plan está partido → `cambio_a_medias` sin escribir (R16, P7). Si no, como hoy.

`ResultadoCancelarCambio`, `ResultadoArchivar` y `ResultadoEdicion` ganan esa variante.

### 3.5 Entrar, salir y cambiar de tipo (`aplicarEnTx`; R17–R19)

Con la empresa ya en `FOR UPDATE` y el plan leído. Si el plan nuevo tiene un pendiente C con fecha F:
- **entra** (`empresa.plan_id ≠ plan.id`):
  - entrada `desde ≥ F` → antes de `tomar_cambio`, `plan_version_empresa` con la versión de C; los módulos y el
    rechazo por topes (`excedidosDe` en `cambiarEmpresaEnTx`) usan la versión de C;
  - entrada `< F` → una recepción con `fechaDeRecepcion(tipoNuevo, F)`, su trabajo y sus recordatorios contados
    desde `ahora`; sin correo `guardado` (P10 b);
- **sale** (antes del `UPDATE`): borra su recepción del pendiente del plan de antes y su `plan_version_empresa`; si
  ya no quedan recepciones sin recibir y F pasó, promueve el plan de antes en esta transacción (R18);
- **mismo plan, otro tipo**: si tiene una recepción sin recibir, `recibe_at = fechaDeRecepcion(tipoNuevo,
  max(F, desde))`, con su trabajo y sus recordatorios nuevos (R19).

El orden empresa → plan de `aplicarEnTx` no cambia: el plan de antes y el nuevo se bloquean después de la empresa.

### 3.6 Lecturas

- `planDeEmpresa`: el `dto` y `vigente` con la versión propia si la hay; `cambio` = su recepción pendiente (fecha
  `recibe_at`) o `null` (R12).
- `detalle`: `pendiente` gana `recibidas` y `total` (count de recepciones con y sin `recibido_at`) (R11).
- `recepcionesVencidas(ahora)`: las filas con `recibido_at IS NULL AND recibe_at ≤ ahora`.
- `repartirRecordatorioDeEmpresa(cambio, organizacionId, dias, recibeAt)`: si la fila sigue sin recibir con ese
  `recibe_at` y la empresa sigue en el plan, un `plan_aviso_correo` a esa empresa con sus topes pasados de ahora
  (R22). El `repartirRecordatorio` de hoy queda para los trabajos sin empresa encolados antes del despliegue (R24),
  filtrado a las empresas con recepción sin recibir.

## 4. Cola

Sin tipos nuevos de trabajo ni cambios en `MODULO_POR_JOB` ni en `procesar-jobs/route.ts`: los dos tipos ya son de
núcleo (R27).

| Trabajo | Con empresa (nuevo uso) | Sin empresa (como hoy) |
|---|---|---|
| `plan_aplicar_cambio` | `recibirCambio`. Payload `{ planId, cambioId, recibeAt }`, `run_after = recibe_at`, `dedupe_key = plan_cambio:<cambioId>:<org>:<recibeAt>` | `aplicarCambioProgramado` (promover, §3.2) |
| `plan_recordatorio_cambio` | `repartirRecordatorioDeEmpresa`. Payload `{ planId, cambioId, dias: 7 \| 3 \| 1, recibeAt }`, `dedupe_key = plan_recordatorio:<cambioId>:<org>:<recibeAt>:<dias>` | `repartirRecordatorio` (legado, R24) |
| `plan_aviso_correo` | igual; tipo nuevo `recordatorio_3`; la `dedupe_key` de un recordatorio lleva `recibeAt` (R19: una fecha nueva sí avisa) | — |

La empresa del trabajo sale de `empresaDelJob(job)` y se encola con `encolarEnEmpresas`, como los avisos.
`recibeAt` en el payload hace que un trabajo de una fecha vieja (R19) no haga nada.

**Barrido `plan_cambios_vencidos`:** primero `recepcionesVencidas` → `recibirCambio`; después los planes (`cambiosVencidos`
→ `aplicarCambioProgramado`, que promueve); después los cambios de empresa, como hoy. Así un cambio de empresa que
rige a la vez entra con el plan ya promovido.

## 5. Fechas puras (`lib/planes/recepcion.ts`, nuevo)

- `fechaDeRecepcion(tipo: TipoCobro, desde: Date): Date`: `desde` si es `inicioDelPeriodoCalendario(tipo, desde)`;
  si no, `inicioDelDiaPlataforma(fechaDeEfectoPorDefecto(tipo, desde))` (R1).
- `recordatoriosDe(ahora: Date, recibeAt: Date): { dias: 7 | 3 | 1; runAfter: Date }[]`: `d = días de calendario de la
  plataforma entre ahora y recibeAt` (`diasDeCalendario`); `d > 7` → [7, 1]; `4 ≤ d ≤ 7` → [3, 1]; si no → [1];
  `runAfter = recibeAt − dias × 24 h`; se quitan los que no caen después de `ahora` (R21).

Puras, sin reloj propio: las prueba `tests/unit/planes/recepcion.test.ts`.

## 6. Cerrojos

Se mantiene la regla de `docs/architecture.md`: nadie pide una empresa después del plan en exclusiva.
- Programar: empresas del plan `FOR SHARE` → plan `FOR UPDATE` (como `archivar`, que ya bloquea las empresas
  antes). Así un cambio de tipo en vuelo (empresa `FOR UPDATE`) termina antes y la recepción se calcula con su
  tipo; una asignación en vuelo (empresa `FOR UPDATE`, plan `FOR SHARE`) también.
- Recibir: empresa `FOR UPDATE` → plan `FOR UPDATE`. Un alta (empresa y plan `FOR SHARE`) espera: no se cruza con el
  cambio de topes (SL-24 R24).
- Promover sin empresa: solo el plan.

## 7. Servicio, tipos, mensajes y pantallas

- `lib/types/planes.ts`: `PlanResult` gana `{ estado: "cambio_a_medias" }`; la vista del pendiente del detalle gana
  `recibidas: number` y `total: number`.
- `PlanesService`: `archivar`, `cancelarCambio` y `editar` devuelven `cambio_a_medias` tal cual; sin reglas nuevas
  (las decide el repositorio bajo el cerrojo). La autorización no cambia: solo el superadmin (SL-24 R5); ningún
  módulo de empresa interviene (planes es núcleo).
- `lib/planes/mensajes.ts`: `TipoCorreoCambioPlan` con `recordatorio_3`, su asunto y su intro (R22); los textos de
  R14, R15 y R16 y `textoRecepcionesDelCambio(recibidas, total)` = «N de M empresas ya lo recibieron» (R11).
- `lib/planes/consumo.ts`: la vista del pendiente pasa `recibidas` y `total`.
- `lib/services/email/plantillas/cambio-plan.ts`: el tipo nuevo pasa por `asuntoCambioPlan` e `introCambioPlan`.
- `PlanForm.tsx`: `RECHAZOS` con `cambio_a_medias` (el texto genérico de R14/R16 para el formulario de edición).
- `PlanDetalle.tsx`: bajo «Cambio programado desde F», la línea de R11; el rechazo de archivar y cancelar pinta el
  mensaje de R14 o R15 según la acción.

## 8. Migración `20261114120000_plan_cambio_por_empresa`

`migration.sql`:
1. las dos tablas, FK, PK, índices, RLS sin políticas y `REVOKE ALL … FROM servi_app` (§1);
2. `plan_version_de`, `plan_tope_rol_de` y los ocho `CREATE OR REPLACE` de §2.1–§2.2;
3. **pendientes previos (R24, P10 a):** por cada `plan_cambio_programado` y cada empresa con ese `plan_id`, una
   recepción con `recibe_at = vigente_desde`. No encola trabajos: los recoge el barrido horario en su fecha, y el
   `plan_aplicar_cambio` sin empresa ya encolado solo promueve.

`down.sql` (R25): si existe alguna fila en `plan_version_empresa`, `RAISE EXCEPTION` sin tocar nada. Si no:
restaura las definiciones de las ocho funciones de su última migración (`20261028130200`, `20261113120000`,
`20261106130000` y `20261111130100`), borra las dos funciones nuevas y las dos tablas. Los pendientes siguen en
`plan_cambio_programado` y el código de antes los aplica a todas en su fecha.

## 9. Datos que dependen del país

Ninguno nuevo. Las fechas son las de la plataforma (−06:00) hasta SLT-90 «Planes: ciclo y cobro en la zona de cada
empresa», como en SLT-86 y SLT-118; los correos pintan la fecha en la zona del país de la empresa, como hoy
(`zonaDeLaEmpresa`). Sin moneda, impuestos ni geografía.

## 10. Dependencias

Ninguna librería nueva.

## 11. Tests

| Archivo | Qué prueba |
|---|---|
| `tests/unit/planes/recepcion.test.ts` (nuevo) | R1 y R21: la tabla de fechas por tipo y la de recordatorios |
| `tests/integration/db/planes-cambio-por-empresa.test.ts` (nuevo) | R1, R4–R6, R10, R11 (lectura), R13–R19, con la cola a mano y el reloj inyectado |
| `tests/integration/db/planes-version-por-empresa.test.ts` (nuevo) | R2, R12, R26: triggers con SQL a mano, tarifa, `plan_de_la_empresa`, `planDeEmpresa`, `servi_app` → `42501` |
| `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts` (nuevo) | R24, R25 |
| `tests/integration/db/planes-cambio-correos.test.ts` | R20–R22; sus casos de R42 por plan pasan a por empresa |
| `tests/integration/db/planes-cambio-programado.test.ts` | R13, R15; sus casos de R38 (aplicar entero) y R40 se ajustan |
| `tests/integration/db/factura-plataforma-cambio-plan.test.ts` | R7, R9 (sustituye el caso m4 de la periodicidad) |
| `tests/integration/db/planes-periodicidad-ordenes.test.ts` | R8; su caso «programada que ya no pasa» pasa a por empresa |
| `tests/integration/db/plan-precio-historial.test.ts` | R3 (el caso «fecha futura aplicada por el trabajo») |
| `tests/integration/db/planes-historial.test.ts` | R10: `cambio_aplicado` al promover |
| `tests/unit/cron/procesar-jobs-plan-cambio.test.ts` | R5, R27: los dos usos de cada trabajo, el orden del barrido |
| `tests/unit/services/email/plantilla-cambio-plan.test.ts` | R22: el recordatorio de 3 días |
| `tests/unit/services/planes-service.test.ts` | R14: `cambio_a_medias` pasa tal cual; el rol de empresa no llega al repositorio |
| `tests/components/PlanDetalle.test.tsx` | R11, R15: la línea de recepciones y el mensaje de archivar |

Sin E2E propio (decisión «E2E»). Antes del PR corren en local los E2E de planes (`grep -rl` en `e2e/` por
`plataforma/planes`) y el grupo `dinero`, porque la migración toca la tarifa y el cierre (`docs/perfil-agentes.md`).

## 12. Alternativas descartadas

- **A. «Plan sombra»: cada edición crea una fila oculta de `plan` con la versión nueva y cada empresa «cambia de plan»
  a ella con el pendiente de empresa de SLT-86.** Reutiliza `organizacion.plan_cambio_*`, la toma de facturas y no
  toca ningún lector. Se descarta porque la identidad del plan se rompe por todas partes: el catálogo y el conteo de
  empresas, «mismo plan» al asignar, los custom (`organizacion_exclusiva_id`), el `plan_id` de las facturas, el
  historial de asignación («plan_asignado» falso), SLT-99 (el plan actual entre los públicos). Además choca con el
  pendiente propio de la empresa: SLT-86 R19 deja uno solo por empresa, y un cambio de plan del superadmin
  borraría la recepción.
- **B. Tabla `plan_version` normalizada e inmutable, con `organizacion.plan_version_id` siempre lleno.** Es el modelo
  más limpio a largo plazo, pero mueve topes, módulos y costos fuera de la fila del plan para todos los lectores y
  escritores (catálogo, `crear`, `editar`, `aplicarVersion`, vistas previas, SLT-99) y migra todos los planes. No
  cabe en esta rebanada (P3) y casi todo ese trabajo serviría solo para la ventana del cambio a medias.
- **C. Versión propia en columnas de `organizacion`.** `organizacion` es de negocio y `servi_app` la lee: expondría
  la versión pendiente y rompería SL-24 R8 sin `GRANT` por columna. La tabla de plataforma lo evita.
- **D. Guardar en la recepción solo un «ya la recibió» y leer el pendiente.** Sirve con un solo cambio, pero con un
  reemplazo (R13, P6) una empresa que recibió el primero quedaría sin versión: el pendiente ya es el segundo y la
  fila del plan sigue en la vieja. Por eso `plan_version_empresa` guarda la versión entera.

## 13. Residuos y riesgos

- **Vistas previas de asignar con un pendiente** (`vistaPreviaAsignacion`, `asignables`) siguen mostrando la versión
  del plan, aunque la empresa entre con la nueva (R17). Afecta solo a la ventana del cambio; va con SLT-130.
- **Sin fila de rastro por recepción.** El rastro del plan registra programar, reemplazar, cancelar y promover
  (`cambio_aplicado`); cada recepción deja solo las filas de módulos de SL-23 en la empresa. «N de M» sale de las
  recepciones.
- **Pendientes previos a mitad de período (R24).** Se reciben en su F aunque no sea inicio del período de la empresa:
  es lo que se anunció. El cierre espera igual (R9), así que no hay factura con dos versiones.
- **JSON en los triggers de topes.** `plan_tope_rol_de` lee un `jsonb` solo durante un cambio a medias; fuera de él
  sigue leyendo `plan_tope_rol`. La forma la fija `versionPlanSchema`, que se valida al escribir.

## 14. Tras la review: recepción no aplicable (R28) y trabajos viejos (R29) — 2026-11-12

### 14.1 Datos (se edita `20261114120000`, decisión P14)

`plan_cambio_recepcion` gana:

| Columna | Tipo | Nota |
|---|---|---|
| `no_aplicada_at` | `timestamp(3) NULL` | cuándo se intentó y no se pudo |
| `no_aplicada_motivo` | `text NULL` | código del motivo; hoy solo `cobro_quincenal_ordenes_mensuales` (R8) |

`CHECK ((no_aplicada_at IS NULL) = (no_aplicada_motivo IS NULL))`, `CHECK (recibido_at IS NULL OR no_aplicada_at IS
NULL)` y `CHECK` del motivo contra la lista de códigos. **Pendiente** pasa a ser `recibido_at IS NULL AND
no_aplicada_at IS NULL`; el índice parcial de §1.1 usa esa condición.

`plan_version_empresa` gana las mismas dos columnas (mismos `CHECK`): marcan la versión que una empresa **conserva**
por una recepción no aplicada después de promover el plan, cuando la fila de recepción ya se fue en cascada con el
pendiente. En esa fila `cambio_id` es el pendiente que no se aplicó.

### 14.2 Base

- `factura_plataforma_cerrar` (§2.2): `v_recepcion` solo mira recepciones pendientes (R9).
- `plan_de_la_empresa` (§2.1): `cambio` solo con una recepción pendiente (R12).
- `down.sql`: sin cambios; una `plan_version_empresa` conservada lo hace negarse (R25).

### 14.3 Repositorio

- `recibirCambio` (§3.3), paso 3: en lugar de lanzar, si la regla de R8 falla → `no_aplicada_at = ahora`,
  `no_aplicada_motivo`, el aviso a la lista (§14.4) y, en la misma transacción, el paso 7 (promover si ya no queda
  ninguna pendiente y `ahora ≥ F`). Devuelve `{ estado: "no_aplicada", motivo }`; el trabajo termina `done`. No
  escribe módulos, precio ni versión. Un error de base o de red sigue lanzando y la cola reintenta con su backoff (`JobRepository`): solo
  una regla del plan marca.
- `recepcionesVencidas`, `recepcionesSinRecibir`, `archivar` (§3.4), la salida de `aplicarEnTx` (§3.5) y
  `repartirRecordatorioDeEmpresa` cuentan solo pendientes. `detalle` (§3.6): `total` las incluye, `recibidas` no.
- **Promover** (§3.2): antes de borrar las `plan_version_empresa` del plan, por cada recepción no aplicada del
  pendiente se escribe (upsert) la versión que la empresa tenía —su fila propia si la había; si no, la del plan
  antes de promover— con `no_aplicada_*` copiadas. Se borran las demás filas del plan, no esas. El plan queda partido
  (R16 rechaza «De inmediato»; ver §14.6).
- `recibirCambio` de un cambio posterior hace upsert de la versión con `no_aplicada_* = NULL`; salir del plan (R18) la
  borra. Así el aviso se va solo.
- `detalle` gana `noAplicadas: { empresaId, empresa, motivo, desde }[]`: las recepciones no aplicadas del pendiente
  más las `plan_version_empresa` marcadas del plan.
- El repositorio no lee destinatarios: no hay lectura nueva de `usuario` ni cambio en `lib/db/excepciones-aislamiento.ts`.

### 14.4 Correo a la lista de alertas (P13)

- **Destinatarios:** `PLAN_CHANGE_ALERT_EMAILS`, lista separada por «,», documentada en `.env.example` junto a
  `BUG_REPORT_EMAILS` (mismo formato y mismo comportamiento si está vacía). El nombre sigue el precedente: inglés,
  sufijo `_EMAILS`.
- **Parseo compartido:** el cuerpo de `destinatariosReporteBug` (`lib/config/reporte-bug.ts`: recorta, descarta lo
  vacío y lo inválido, quita duplicados sin mayúsculas, avisa en el log con la cifra) pasa a
  `destinatariosDeLista(valor, variable)` en el mismo archivo; `destinatariosReporteBug` la llama y conserva su
  firma (su test no cambia), y la línea del log nombra la variable que corresponde. Se añade
  `destinatariosAlertaPlan(valor = process.env.PLAN_CHANGE_ALERT_EMAILS)`. El archivo no importa nada del servidor,
  así que sigue sirviendo al navegador.
- **Vacía, ausente o sin válidas** (SLT-87 R16): el trabajo termina `done` sin enviar; la marca, el aviso del
  detalle y la promoción ocurren igual. Un fallo de SMTP con destinatarios sí falla el trabajo y se reintenta, como
  los demás `plan_aviso_correo` (R41).
- La lista la lee el **manejador** de la cola (`lib/planes/jobs-cambio-plan.ts`) al enviar, no el repositorio al
  encolar: un cambio de la variable vale para los avisos aún en cola.

- Va por la cola, como todos los de planes (outbox, R41): un `plan_aviso_correo` con el tipo nuevo `no_aplicada` en
  `tipoAvisoSchema` y un tipo aparte `AvisoNoAplicadaPlan` (implementado así en lugar de ampliar `AvisoCorreoPlan`;
  su esquema es el único que admite ir sin empresa), payload `{ tipo, planId, cambioId, empresaId, empresa, plan, recibeAt,
  motivo }`, `dedupe_key = dedupeAviso(cambioId, "no_aplicada", empresaId)` (uno por recepción).
- Nace **sin empresa** (`organizacion_id` NULL, como `encolarAplicacion`). Hoy un `plan_aviso_correo` sin empresa
  falla («no tiene empresa destino»); ese caso pasa a ser el de la lista: el manejador solo acepta `no_aplicada`
  sin empresa y los demás tipos siguen exigiendo empresa.
- Plantilla: **la existente** `lib/services/email/plantillas/cambio-plan.ts` gana `plantillaCambioPlanNoAplicado`
  sobre `componerCorreo` (marca). Asunto «El cambio del plan <plan> no se aplicó a <empresa>»; cuerpo con la fecha
  (zona de la plataforma: la lista no es de ninguna empresa ni país), el motivo de `mensajes.ts` y «Sigue con su versión
  anterior.». No se crea archivo de plantilla nuevo.
- `lib/planes/mensajes.ts`: el texto de cada código de motivo y la línea del detalle de R28.

### 14.5 Cancelar trabajos (R29)

Precedente: el estado `descartado` de la cola (SL-23 R20: no se ejecuta ni se reintenta, motivo en `last_error`).
Un helper del repositorio, en la transacción que mueve o reemplaza:

```
UPDATE jobs SET estado = 'descartado', last_error = 'plan_cambio_obsoleto:<cambioId>', dedupe_key = NULL,
       updated_at = now()
WHERE dedupe_key IN (<claves>) AND estado = 'pending'
```

- **Mover (R19):** claves de la fecha vieja: `dedupeRecepcion(c, org, viejo)` y `dedupeRecordatorio(c, org, viejo,
  7|3|1)`, calculadas **antes** de encolar las nuevas; las que coinciden con una nueva no se tocan.
- **Reemplazar (R13) y cancelar (R14):** antes de borrar el pendiente (la cascada se lleva sus recepciones y con
  ellas las fechas): `dedupeAplicarCambio(c)`, y por cada recepción `dedupeRecepcion` y `dedupeRecordatorio` de 7, 3
  y 1, más las claves de los recordatorios legados sin empresa (R24). Cancelar va en `cancelarCambio` y en el
  `archivar` de un plan sin empresas, que cancela el pendiente (SL-24 R40).
- **Salir (R18):** antes de borrar su recepción en `aplicarEnTx`: `dedupeRecepcion` y `dedupeRecordatorio` de esa
  empresa y su `recibe_at`. Si su salida promueve el plan, el `plan_aplicar_cambio` sin empresa también se descarta.
- Por clave y no por `payload`: va por el índice único de `dedupe_key`.
- `dedupe_key = NULL` al descartar: si la fecha vuelve a una ya cancelada (R19 de ida y vuelta), la clave queda
  libre y se encola de nuevo. El motivo guarda el `cambioId` para el rastro.
- `processing` no se toca: termina sin hacer nada, como hoy.
- Vale en los cuatro casos (decisión P15): mover, reemplazar, cancelar y salir.

### 14.6 Alternativas descartadas (§14)

- **E. Estado en una sola columna `estado` (`pendiente | recibida | no_aplicada`) en la recepción.** Más limpio,
  pero cambia `recibido_at` (ya usada por el código de T5 y por los nueve tests de integración) y el índice
  parcial; dos columnas nulas suman sin tocar lo hecho.
- **F. Dejar el pendiente sin borrar al promover mientras haya una no aplicada.** Mantendría el aviso en la fila de
  recepción, pero el plan no sería «el plan» nuevo (choca con P5 y con «cuenta como resuelta») y bloquearía programar
  otro.
- **G. Plantilla nueva en un archivo propio.** Un archivo más contra el tamaño; el correo es del mismo dominio que
  `cambio-plan.ts`.
- **H. Descartar por `payload->>'cambioId'`.** Sin índice en `jobs.payload`; las claves ya identifican cada trabajo.
- **I. Llamar a `destinatariosReporteBug(process.env.PLAN_CHANGE_ALERT_EMAILS)` tal cual.** Ahorra tocar
  `lib/config/reporte-bug.ts` (39 archivos en vez de 40), pero el log de direcciones inválidas diría
  `BUG_REPORT_EMAILS` para la lista de planes. Copiar el parseo en `jobs-cambio-plan.ts` lo duplicaría.

Residuo: tras promover con una no aplicada, el plan queda partido y R16 rechaza «De inmediato» con el texto de
«Alguna empresa ya recibió el cambio programado»; el superadmin programa con fecha (R13 le da recepción a todas).
