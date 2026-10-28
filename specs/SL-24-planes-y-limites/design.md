# SL-24 — planes-y-limites · design.md

> Requisitos en `requirements.md` (R1–R36). El humano cerró P1–P5 el 2026-10-27 y añadió el tope
> de API keys y el rastro de plataforma de los planes. Las filas fechadas están en `requirements.md`.

## Lo que ya existe

Busqué el 2026-10-27 con los términos `plan`, `planes`, `tope`, `límite`, `suscripción`,
`plan_id` y `SL-24`. Miré en `feature_list.json` (por `title` y `description`), en `specs/` y en el
código. El grafo no tiene proyecto para este worktree (`list_projects` no lo lista), así que el
código se buscó con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| Solo esta ficha trata de planes. SL-25 («nace con su plan») y SL-26 («gestionar sus planes») los consumen | `feature_list.json` | Ya están en «Lo que NO entra». Esta ficha les deja la lectura de planes públicos (R7) y el servicio |
| SL-23 y SL-40 citan SL-24 solo para excluirla | `specs/SL-23-catalogo-modulos/requirements.md:11`, `specs/SL-40-…/design.md:11` | Nada que acotar |
| Ningún símbolo, tabla ni columna de plan o de tope de plan. Los `tope*` del código son otra cosa (intentos de entrega, indemnización, asistente) | Grep en `lib/`, `app/` y `db/schema.prisma` | Se crea. Los nombres nuevos llevan `plan` para no confundirse con esos topes |
| Activación de módulos por empresa: `organizacion_modulo`, `ModulosEmpresaRepository.encender/apagar` (cada uno en su transacción, con historial) | `lib/repositories/ModulosEmpresaRepository.ts` | Se extrae el cambio de una fila a un ayudante que trabaja dentro de una transacción ajena, para sincronizar módulos en la transacción de la asignación (§7). El comportamiento de SL-23 no cambia |
| Autorización del superadmin: `esPlataforma`; patrón «quién → zod → existe → repositorio» | `lib/services/ModulosEmpresaService.ts`, `lib/auth/plataforma.ts` | Se copia el patrón (R5) |
| Precedente de dato de plataforma más excepción por empresa en `organizacion` | SL-40 `design.md > §3.1, §3.2` (`cobro_plataforma_tarifa`, `organizacion.cobro_plataforma_por_orden`) | La asignación va como columnas de `organizacion`, igual que la excepción de SL-40 (§2.4) |
| Trigger de base sobre `orden` que cubre todas las vías de alta | SL-40, `20261023130200_cobro_plataforma_triggers_orden` | Mismo enfoque para el tope (§4). Los triggers conviven: el de SL-40 es `AFTER INSERT … FOR EACH ROW`; el de aquí es `FOR EACH STATEMENT` |
| «Anulada» = eliminada (`deleted_at`); la cancelación por API no anula | SL-40 `design.md > §1.2`, D6 | Se hereda tal cual (R19) |
| Vías de alta de órdenes: `BulkOrdenService.cargarMasiva` (sesión, `app/api/ordenes/carga-masiva/chunk`) y `cargarViaApi` (`app/api/ordenes/api-key/carga`). Las dos terminan en `OrdenRepository.createManyOrdenes` o `createManyOrdenesConGuia`, en lotes de `BATCH_SIZE` (500), cada lote en su transacción | `lib/services/BulkOrdenService.ts:159, :349`; `lib/repositories/OrdenRepository.ts:2907, :3028` | El trigger cubre las dos rutas. El servicio hace una comprobación previa para rechazar la petición entera (§6.1) |
| Vías de alta de usuarios: `UserRepository.create`, `UserRepository.update` (rol), `UserRepository.setEstado`, `AprobacionPostulacionRepository.actualizarEstadoSiPendiente`, `PostulacionRepository` (nace `pendiente`), `ApiKeyRepository` (rol `apiKey`), `OrganizacionRepository.altaEmpresa` (maestro de una empresa sin plan) | `lib/repositories/*` | El trigger sobre `usuario` las cubre todas. **No se toca `UserRepository`** (choque con SLT-32): la traducción del error va en los servicios (§6.3) |
| Cerrojo consultivo por transacción | `OrganizacionRepository.altaEnTransaccion` (`pg_advisory_xact_lock(hashtext(slug))`) | Mismo mecanismo, con un espacio de claves propio (§4.4) |
| Traducción de un SQLSTATE propio a error de dominio | `lib/db/contexto-empresa.ts > traducirErrorDeEmpresa` (`SL017`) | Se extrae su recorrido de la cadena `cause`/`meta` a `lib/db/sqlstate.ts` y se reutiliza para `SL024` (§4.5) |
| API keys: `api_key.estado` (`activa`/`inactiva`, la «palanca de revocación» de la feature 88/R7); `ApiKeyRepository.createConUsuario` (nace `activa`), `setEstado` (activar o desactivar) y `eliminar` (borrado físico). `ApiKeyService.crear` y `activar` | `db/schema.prisma > ApiKey`, `lib/repositories/ApiKeyRepository.ts:175, :364, :458`, `lib/services/ApiKeyService.ts` | Tope de keys con un trigger sobre `api_key` (§4.3). `ApiKeyRepository` no se toca: la traducción va en `ApiKeyService` (§6.5) |
| Rastro de cambios de un dato de plataforma | Ninguno: `historial_accion` es de negocio y exige empresa (SL-40 §3.1) | Tabla nueva `plan_rastro`, de plataforma (§2.8) |
| Fábricas de empresa y escenario de reparto que construye `BulkOrdenService` | `tests/fabricas/empresa-y-usuarios.ts`, `tests/fabricas/escenarios/reparto.ts` (SL-43 en vuelo) | **No se tocan.** El parámetro nuevo de `BulkOrdenService` es opcional (§6.1) y los tests crean sus planes con ayudantes propios fuera de `tests/fabricas/` |

## 1. Resumen

- **Catálogo (plataforma):** tablas `plan`, `plan_tope_rol` y `plan_modulo`, sin acceso para
  `servi_app`. Las escribe solo el superadmin, en `comoPlataforma("SL-24", …)`, con
  `PlanesService` → `PlanesRepository`.
- **Asignación (por empresa):** dos columnas en `organizacion`: `plan_id` y
  `plan_ciclo_ancla_at`. `organizacion` ya es de solo lectura para `servi_app`.
- **El tope lo hace cumplir la base**, con triggers `SECURITY DEFINER`:
  - sobre `orden`, `AFTER INSERT … FOR EACH STATEMENT`;
  - sobre `usuario`, `AFTER INSERT OR UPDATE OF rol_id, estado … FOR EACH ROW`;
  - sobre `api_key`, `AFTER INSERT OR UPDATE OF estado … FOR EACH ROW`.

  Cuentan dentro de la transacción del alta. Si el uso pasa el tope, lanzan el SQLSTATE `SL024` y
  la transacción entera se deshace (R18, R21, R24, R27, R35).
- **Rastro:** crear, editar o archivar un plan escribe en `plan_rastro` (plataforma), en la misma
  transacción. Asignarlo escribe en `historial_accion` de la empresa (R29).
- **Sin carrera:** el alta bloquea en modo compartido la fila de la empresa y la del plan, y
  después toma un cerrojo consultivo por empresa para contar. Asignar o editar bloquean esas
  filas en modo exclusivo (§4.4).
- **Los servicios traducen** `SL024` a `TopeDelPlanAlcanzado`, un `CONFLICT` con
  `details.codigo = "tope_plan"`, y lo convierten en el mensaje de cada vía (§6).
- **Comprobación previa en la carga de órdenes:** se lee el cupo antes de insertar, para rechazar
  la petición entera aunque se parta en varios lotes. También avisa en la vista previa (R21, R22).

## 2. Modelo de datos

### 2.1 `plan` (plataforma)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | `@default(uuid())` |
| `nombre` | `VARCHAR(80) NOT NULL` | `CHECK (btrim("nombre") <> '')` |
| `visibilidad` | enum `plan_visibilidad` (`publico`, `custom`) `NOT NULL` | Inmutable tras crear (R2) |
| `organizacion_exclusiva_id` | `TEXT NULL`, FK `organizacion` `ON DELETE CASCADE` | La empresa de un custom. `CHECK` `plan_custom_con_empresa`: `("visibilidad" = 'custom') = ("organizacion_exclusiva_id" IS NOT NULL)`. Inmutable (R2) |
| `tope_ordenes_ciclo` | `INTEGER NULL` | `CHECK (… IS NULL OR … >= 0)`. `NULL` = sin tope |
| `tope_api_keys` | `INTEGER NULL` | `CHECK (… IS NULL OR … >= 0)`. `NULL` = sin tope (R35) |
| `precio_negociable` | `BOOLEAN NOT NULL DEFAULT false` | |
| `precio_mensual` | `DECIMAL(12,2) NULL` | `CHECK (… IS NULL OR … >= 0)` |
| `precio_anual` | `DECIMAL(12,2) NULL` | `CHECK (… IS NULL OR … >= 0)` |
| `descuento_anual_pct` | `DECIMAL(5,2) NULL` | `CHECK (… IS NULL OR (… > 0 AND … <= 100))` |
| `archivado_at` | `TIMESTAMP(3) NULL` | `NULL` = vigente (R6) |
| `created_at`, `updated_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | El rastro completo va en `plan_rastro` (§2.8) |

**`CHECK` `plan_precio_forma` (R3).** Fija las cinco formas válidas del precio:

```sql
CHECK (
  NOT ("precio_negociable" AND ("precio_mensual" IS NOT NULL OR "precio_anual" IS NOT NULL OR "descuento_anual_pct" IS NOT NULL))
  AND NOT ("precio_anual" IS NOT NULL AND "descuento_anual_pct" IS NOT NULL)
  AND ("precio_mensual" IS NOT NULL OR ("precio_anual" IS NULL AND "descuento_anual_pct" IS NULL))
)
```

- Las cinco formas son: sin precio (todo `NULL`, `false`); negociable (`true`, todo `NULL`);
  mensual; mensual y anual fijo; mensual y porcentaje.
- **Por qué `CASCADE` hacia la empresa del custom.** Un custom no tiene sentido sin su empresa, y
  las limpiezas de tests borran organizaciones. El producto no borra empresas. Precedente: SL-23
  §4.1.
- No hay único por nombre: no lo pide ninguna decisión. SL-26 lo puede añadir si su pantalla lo
  necesita.

### 2.2 `plan_tope_rol` (plataforma)

| Columna | Tipo | Regla |
|---|---|---|
| `plan_id` | `TEXT NOT NULL`, FK `plan` `ON DELETE CASCADE` | |
| `rol` | `rol_value NOT NULL` | `CHECK ("rol" IN ('maestro', 'admin', 'mensajero', 'Admin Tienda', 'adminSatelite'))`: los roles con tope (R25). `apiKey` queda fuera: las keys tienen su tope en `plan.tope_api_keys`. `adminTienda` se guarda como `'Admin Tienda'` por el `@map` del enum |
| `maximo` | `INTEGER NOT NULL` | `CHECK ("maximo" >= 0)` |

- PK `("plan_id", "rol")`. Sin fila = ese rol no tiene tope (decisión «Usuarios»).
- No hay columna de «tiendas»: una tienda es un `adminTienda` (R25).

### 2.3 `plan_modulo` (plataforma)

- Columnas `plan_id` (FK `plan` `CASCADE`) y `modulo` (`modulo_apagable`), con PK `("plan_id", "modulo")`.
- Una fila es un módulo incluido. Reusa el enum de SL-23, así que no puede nombrar un módulo
  inexistente ni del núcleo.

### 2.4 Asignación: columnas en `organizacion`

| Columna | Tipo | Regla |
|---|---|---|
| `plan_id` | `TEXT NULL`, FK `plan` `ON DELETE NO ACTION` | `NULL` = sin plan, sin límites (R14) |
| `plan_ciclo_ancla_at` | `TIMESTAMP(3) NULL` | Fecha de alta del plan: ancla los ciclos (R9, R20). `CHECK ("plan_id" IS NULL OR "plan_ciclo_ancla_at" IS NOT NULL)` |

- **`NO ACTION` y no `RESTRICT`.** Si se borra una empresa que tiene asignado su propio custom,
  el `CASCADE` de §2.1 borra el plan en la misma sentencia. `NO ACTION` comprueba al final de la
  sentencia, cuando la empresa ya no está; `RESTRICT` fallaría. En el producto los planes no se
  borran (R6).
- **Por qué en `organizacion`.** Es un dato 1 a 1 de la empresa, como la excepción de SL-40 §3.2.
  `organizacion` ya es de solo lectura para `servi_app` (`REVOKE` de SL-17) y cada empresa solo
  lee su fila (`organizacion_propia`). R8 sale sin tabla ni política nuevas: la empresa ve su
  `plan_id`, pero no puede leer el plan ni cambiarlo.
- La migración no rellena nada: todas las empresas previas quedan sin plan (R14).

### 2.5 Acceso (R8)

- **`plan`, `plan_tope_rol`, `plan_modulo` y `plan_rastro`:**
  - RLS activada y sin ninguna política para `servi_app`, más `REVOKE ALL … FROM servi_app`;
  - entran en `MODELOS_DE_PLATAFORMA`;
  - se leen y escriben como dueño: el superadmin en `comoPlataforma`, y los triggers y las
    funciones, que son `SECURITY DEFINER`.

  Es el mismo trato que `cobro_plataforma_tarifa` (SL-40 §3.1).
- **El cupo de la propia empresa** se lee con la función `plan_cupo_ordenes(p_organizacion_id)`
  (§4.3):
  - es la única pieza nueva que `servi_app` puede ejecutar;
  - compara el argumento con `current_setting('app.organizacion_id')` y, si no coinciden, lanza
    `42501` (R8).

### 2.6 Índice para el conteo de órdenes

`CREATE INDEX "orden_organizacion_id_created_at_vivas_idx" ON "orden" ("organizacion_id", "created_at") WHERE "deleted_at" IS NULL;`

- Sirve exactamente la consulta del conteo (§4.2).
- En Prisma va como `@@index([organizacionId, createdAt], map: …)`, con el comentario de que el
  predicado parcial vive en el SQL. Es el patrón de `orden_prioridad_clave_remision_idx`.

### 2.7 Prisma

- `model Plan`, `model PlanTopeRol`, `model PlanModulo` y `model PlanRastro`, con `@@map`, y los
  enums `PlanVisibilidad` (`@@map("plan_visibilidad")`) y `PlanRastroAccion`
  (`@@map("plan_rastro_accion")`).
- Relaciones nuevas:
  - `Organizacion.plan` (por `planId`);
  - `Organizacion.planesExclusivos` (por `organizacionExclusivaId`);
  - `Plan.topesPorRol`, `Plan.modulos` y `Plan.empresas`.
- Los `CHECK`, el índice parcial, las funciones y los triggers no los expresa Prisma. Llevan un
  comentario en el modelo para que el diff de drift salga vacío.

### 2.8 `plan_rastro` (plataforma; R29, decisión P5)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | `@default(uuid())` |
| `plan_id` | `TEXT NOT NULL` | **Opaco y sin FK**, como `historial_accion.entidad_id`: el rastro sobrevive aunque el `CASCADE` de §2.1 borre un custom al borrar su empresa (solo pasa en limpiezas de tests) |
| `plan_nombre` | `VARCHAR(80) NOT NULL` | Congelado al escribir |
| `accion` | enum `plan_rastro_accion` (`creado`, `editado`, `archivado`) `NOT NULL` | |
| `cambios` | `JSONB NOT NULL` | `{ "<campo>": { "antes": …, "despues": … } }`, solo con los campos que cambiaron. Al crear, `antes` es `null` en todos; al archivar, solo `archivado`. Los campos son los de `PlanDTO` (§5.1): `nombre`, `topes`, `modulos`, `precio` y `archivado`. Los importes van como texto con dos decimales, nunca como número |
| `actor_usuario_id` | `TEXT NOT NULL` | El superadmin. Opaco, sin FK, por la misma razón que `plan_id` |
| `actor_nombre` | `VARCHAR(120) NOT NULL` | Congelado, como en `historial_accion` |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | Cuándo |

- Índice `("plan_id", "created_at")`, para el rastro de un plan (SL-26 lo pintará).
- **Plataforma:**
  - sin `organizacion_id`;
  - entra en `MODELOS_DE_PLATAFORMA`;
  - RLS sin políticas y `REVOKE ALL … FROM servi_app` (R8).
- **Solo se añade.** Ningún código hace `update` ni `delete` sobre ella; la guardia
  `planes-sin-borrado` lo vigila (§11).
- **La escribe solo `PlanesRepository`**, en la misma transacción que el cambio del plan, con un
  `planRastro.create`. Si falla, el cambio se deshace (R29).
- **Una edición sin cambios reales** (mismo contenido) no escribe fila ni toca `updated_at`.

### 2.9 Datos que dependen del país

- **Moneda del precio.** Se guarda sin moneda, como el cobro de SL-40 (§7 allí). Que el precio sea
  por moneda o por país lo decide SL-21; esta ficha no lo inventa.
- Ni impuestos, ni geografía, ni métodos de pago.
- Los ciclos no dependen de la zona horaria (§3).

## 3. El ciclo (R20)

- **Ancla.** `plan_ciclo_ancla_at` guarda el instante de la asignación (`CURRENT_TIMESTAMP`, en
  la misma escala que `orden.created_at`).
- **Inicio del ciclo en curso.** Es `ancla + n meses`, con el mayor `n ≥ 0` que no pase de ahora.
  - Se calcula siempre **desde el ancla**, nunca encadenando ciclos: así, un alta el 31 da 28 o 29
    de febrero, 31 de marzo y 30 de abril.
  - La suma de `interval '1 month'` de Postgres ya recorta al último día del mes.
- **Fin del ciclo.** Es el inicio del siguiente, sin incluirlo. Un alta el día 15 da un ciclo del
  15 al 14.
- **Sin zona horaria.** La frontera es la misma hora del alta, no la medianoche local. Eso evita
  depender de una zona horaria que SL-21 todavía no configura por país, y respeta la regla del repo
  de no meter `AT TIME ZONE` en el SQL (`lib/repositories/FinanzasDiarioRepository.ts:17`). Si el
  humano prefiere la medianoche local, eso espera a SL-21 (§12, alternativa 4).
- **Siempre mensual (P1, cerrada el 2026-10-27).** El anual es solo una forma de precio
  (informativa, R4). No se guarda ninguna periodicidad de suscripción.
- **Al cambiar de plan, el ancla se conserva (P2a, cerrada)** (§5.2). Así el ciclo es continuo, y
  la regla «bajar de plan» compara las órdenes del ciclo en curso.
- **Una anulada de un ciclo pasado no libera cupo (P2b, cerrada).** Sale por construcción: el
  conteo solo mira las creadas desde el inicio del ciclo en curso (§4.2).
- **Recuperar no se bloquea (P2c, cerrada).** `restore` es un `UPDATE OF deleted_at`, y el
  trigger de órdenes solo mira `INSERT`. El uso puede quedar por encima del tope; la siguiente
  alta se rechaza hasta que vuelva a haber cupo.
- **Dónde se calcula.** En la función SQL `plan_inicio_ciclo(ancla, ahora)` (`IMMUTABLE`), que
  usan los triggers y el superadmin. Su gemela en TS, `lib/planes/ciclo.ts > inicioDelCiclo`, es
  pura; solo la usan los textos y el test que compara las dos con la misma tabla de fechas
  (`tests/unit/utils/ciclo-plan.test.ts` y `tests/integration/db/plan-ciclo.test.ts`).

## 4. La comprobación en la base

### 4.1 SQLSTATE y forma del error

- Los triggers lanzan `RAISE EXCEPTION USING ERRCODE = 'SL024', MESSAGE = 'tope_plan ' || <json>`.
- El JSON es `{"tope":"ordenes","maximo":100,"usados":99,"pedidas":2}`,
  `{"tope":"rol","rol":"adminTienda","maximo":3,"usados":3,"pedidas":1}` o
  `{"tope":"api_keys","maximo":2,"usados":2,"pedidas":1}`:
  - `usados` es el uso **antes** del alta;
  - `pedidas` es lo que el alta añadía.
- **El JSON va en `MESSAGE`, no en `DETAIL`.** El mensaje está verificado en las dos formas de
  error de Prisma 7.8 con `@prisma/adapter-pg` (comentario de `lib/db/contexto-empresa.ts:106`).
  Que `DETAIL` llegue no está verificado. T3 lo comprueba contra la base.

### 4.2 Funciones (todas `plpgsql`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC`)

| Función | Qué hace |
|---|---|
| `plan_inicio_ciclo(p_ancla timestamp, p_ahora timestamp) RETURNS timestamp` | §3. `IMMUTABLE`, sin `SECURITY DEFINER` (no lee tablas) |
| `plan_uso_ordenes(p_organizacion_id text, p_desde timestamp) RETURNS integer` | `count(*)` de `orden` con `organizacion_id = p_organizacion_id AND created_at >= p_desde AND deleted_at IS NULL` (R19). Usa el índice de §2.6 |
| `plan_uso_rol(p_organizacion_id text, p_rol rol_value) RETURNS integer` | `count(*)` de `usuario` de esa empresa con ese rol y `estado = 'activo'` (R26) |
| `plan_uso_api_keys(p_organizacion_id text) RETURNS integer` | `count(*)` de `api_key` de esa empresa con `estado = 'activa'` (R35). Las eliminadas no existen: `eliminar` borra la fila |
| `plan_cupo_ordenes(p_organizacion_id text) RETURNS TABLE (maximo integer, usados integer)` | Lectura previa de §6.1, **sin cerrojos**. Lanza `42501` si el argumento no es `app.organizacion_id`. Sin plan o sin tope de órdenes no devuelve filas. `GRANT EXECUTE … TO servi_app` |

### 4.3 Los triggers

**`plan_tope_ordenes`**, en `AFTER INSERT ON "orden" REFERENCING NEW TABLE AS "nuevas" FOR EACH STATEMENT`:

1. Para cada `organizacion_id` distinto de `nuevas` (en la práctica, uno):
   1. `SELECT plan_id, plan_ciclo_ancla_at FROM organizacion WHERE id = … FOR SHARE`. Sin plan,
      pasa a la siguiente empresa sin más cerrojos.
   2. `SELECT tope_ordenes_ciclo FROM plan WHERE id = … FOR SHARE`. Sin tope, pasa a la siguiente.
   3. `PERFORM pg_advisory_xact_lock(24, hashtext(<organizacion_id>))`.
   4. `usados_total := plan_uso_ordenes(org, plan_inicio_ciclo(ancla, now()::timestamp))`.
   5. `pedidas := count(*)` de `nuevas` de esa empresa con `deleted_at IS NULL`.
   6. Si `usados_total > maximo`, lanza `SL024` con `usados = usados_total − pedidas`.
2. **Una sentencia, un conteo.** Un `createMany` de 500 filas hace un conteo, no 500. Por eso el
   trigger es de sentencia y no de fila.

**`plan_tope_usuario_alta`**, en `AFTER INSERT ON "usuario" FOR EACH ROW WHEN (NEW.organizacion_id IS NOT NULL AND NEW.estado = 'activo')`.

**`plan_tope_usuario_cambio`**, en `AFTER UPDATE OF "rol_id", "estado" ON "usuario" FOR EACH ROW`, con este `WHEN`:

```sql
WHEN (
  NEW.organizacion_id IS NOT NULL
  AND NEW.estado = 'activo'
  AND (OLD.rol_id IS DISTINCT FROM NEW.rol_id OR OLD.estado <> 'activo')
)
```

- Los dos llaman a la misma función, con los mismos pasos de arriba. El tope es la fila de
  `plan_tope_rol` para el `rol.value` de `NEW.rol_id`; sin fila, no hay nada que comprobar. Un
  usuario `apiKey` nunca tiene fila de tope: sale sin contar (R25).
- **El `WHEN` es la definición de «alta de usuario»** (R27, decisión P4): crear uno activo,
  activarlo desde `inactivo` o `bloqueado`, aprobar su postulación (`pendiente` → `activo`) o
  cambiarle el rol. Bloquear o inactivar no es alta.

**`plan_tope_api_key_alta`**, en `AFTER INSERT ON "api_key" FOR EACH ROW WHEN (NEW.estado = 'activa')`, y
**`plan_tope_api_key_cambio`**, en `AFTER UPDATE OF "estado" ON "api_key" FOR EACH ROW WHEN (NEW.estado = 'activa' AND OLD.estado <> 'activa')`:

- Los mismos pasos, con `plan.tope_api_keys` y `plan_uso_api_keys` (R35).
- **«Viva, no revocada» = `estado = 'activa'`.** La feature 88/R7 llama a `estado` la palanca de
  revocación: una key `inactiva` no autentica. `eliminar` borra la fila, así que la key deja de
  existir y de contar. Por tanto activar una key `inactiva` es un alta, igual que reactivar un
  usuario.
- Crear una key inserta antes su cuenta dedicada en `usuario` (rol `apiKey`). El trigger de
  usuario sale sin contar, porque `apiKey` no tiene tope de rol.
- **Por qué fila y no sentencia.** Hoy no hay altas de usuarios en lote. Además, Postgres no
  permite tablas de transición en un trigger con lista de columnas (`UPDATE OF`).

### 4.4 Sin carrera (R24)

| Quién | Cerrojos, en este orden |
|---|---|
| Alta (los triggers) | `organizacion` `FOR SHARE` → `plan` `FOR SHARE` → cerrojo consultivo `(24, hashtext(org))`. Los tres duran hasta el fin de la transacción |
| Asignar o cambiar plan (§5) | `organizacion` `FOR UPDATE` → plan nuevo `FOR SHARE` → contar → escribir |
| Editar topes o módulos de un plan (§5) | `plan` `FOR UPDATE` → contar cada empresa del plan → escribir |

- **Dos altas de la misma empresa** comparten los cerrojos de fila y se ponen en fila en el
  consultivo. La segunda cuenta después de que la primera confirme: en `READ COMMITTED`, cada
  consulta de la función toma una foto nueva, así que ve las órdenes de la primera. Si con ellas
  pasa el tope, falla (R24). En la base, las transacciones de la app usan el nivel por defecto de
  Prisma, `READ COMMITTED`; T3 lo afirma en el test.
- **Alta contra asignación.**
  - El `FOR UPDATE` de la asignación espera a las altas en vuelo, que tienen la fila en
    `FOR SHARE`, y después cuenta con ellas ya confirmadas.
  - Un alta que llega después espera a la asignación y vuelve a leer la fila con el plan nuevo:
    `READ COMMITTED` relee la versión confirmada al conseguir el cerrojo.
- **Alta contra edición.** Lo mismo con la fila del plan: la edición cuenta con las altas en vuelo
  ya confirmadas, y las siguientes leen los topes nuevos.
- **Asignación contra edición del mismo plan.** La asignación toma el plan en `FOR SHARE` después
  de bloquear la empresa: espera a la edición y lee sus topes nuevos.
- **Sin interbloqueo.** Ninguna operación pide la fila de la empresa después de tener la del plan
  en exclusiva. Las altas piden empresa → plan; la asignación pide empresa → plan; la edición
  solo pide el plan.
- **Empresas sin plan.** Solo toman `FOR SHARE` sobre su fila de `organizacion`, que no bloquea a
  otras altas. No toman el consultivo, así que sus cargas concurrentes no se ponen en fila (R14).
- **El `FOR SHARE` no estorba a las FK.** Las FK hacia `organizacion` toman `FOR KEY SHARE`, que
  es compatible con él. El `UPDATE` de `plan_id` toma `FOR NO KEY UPDATE`, que choca con
  `FOR SHARE`: ese choque es justo lo que se busca.

### 4.5 Traducción en la app

- **`lib/db/sqlstate.ts` (nuevo):** `llevaSqlstate(e, codigo)`. Es el recorrido de
  `cause`/`meta`/`driverAdapterError` que hoy vive dentro de `contexto-empresa.ts`, que pasa a
  usarlo. `traducirErrorDeEmpresa` no cambia de comportamiento.
- **`lib/planes/tope-error.ts` (nuevo):**
  - `class TopeDelPlanAlcanzado extends ConflictError`. Lleva
    `details: { codigo: "tope_plan", tope: "ordenes" | "rol" | "api_keys", rol?, maximo, usados, pedidas }` y un
    `message` ya redactado (§6.4).
  - `traducirErrorDeTope(e)` lee el JSON del mensaje. Cualquier otro error lo devuelve tal cual.
- **Por qué `details.codigo` y no un `AppErrorCode` nuevo.** Es lo mismo que decidió SL-23 §5.5:
  `code` es el conjunto cerrado de la feature 10, y ampliarlo cambia el `switch` exhaustivo de
  `toActionError` en todo el repo.

## 5. Gestión por el superadmin

| Archivo | Papel |
|---|---|
| `lib/types/planes.ts` | Esquemas zod en el borde y DTO (§5.1). El monto reutiliza `montoCobroSchema` de `lib/types/cobro-plataforma.ts`: texto `^\d{1,10}(\.\d{1,2})?$`, sin `Number` |
| `lib/interfaces/repositories/IPlanesRepository.ts`, `lib/repositories/PlanesRepository.ts` | `crear`, `editar`, `archivar`, `asignar`, `asignables(organizacionId)`, `publicos()`, `plan(id)` y `empresa(id)`. Todo en `comoPlataforma("SL-24", …)`. Las escrituras abren un `$transaction` con los cerrojos de §4.4 (SQL a mano: `SELECT … FOR UPDATE` / `FOR SHARE` sobre `organizacion` y `plan`) |
| `lib/interfaces/services/IPlanesService.ts`, `lib/services/PlanesService.ts` | `crear(actor, input)`, `editar(actor, input)`, `archivar(actor, input)`, `asignar(actor, input)` y `asignables(actor, input)`. Orden fijo: `esPlataforma` (R5), zod (R2, R3), existencia, reglas (archivado, custom de otra empresa) y repositorio. Además `planesPublicos()` sin actor, para SL-25 (R7): no se expone en ninguna action |
| `lib/actions/planes.ts` | `'use server'`: `crearPlanAction`, `editarPlanAction`, `archivarPlanAction`, `asignarPlanAction` y `listarPlanesAsignablesAction`. Cada una resuelve el actor y monta el servicio en su composition root, con test de que lo **pasa** |
| `lib/modulos/reparto.ts` | `planes: "nucleo"` en `MODULO_POR_ACTION`: es de plataforma, como `modulos-empresa` |
| `lib/db/excepciones-aislamiento.ts` | `EXCEPCIONES_DE_PLATAFORMA` gana `{ archivo: "lib/repositories/PlanesRepository.ts", ficha: "SL-24", motivo: "catálogo de planes y su asignación: los escribe el superadmin, que no tiene empresa (R5)" }` |
| `lib/db/modelos-de-negocio.ts` | `Plan`, `PlanTopeRol`, `PlanModulo` y `PlanRastro` en `MODELOS_DE_PLATAFORMA` |
| `lib/planes/rastro.ts` | `diferenciasDelPlan(antes: PlanDTO \| null, despues: PlanDTO)`: pura, produce el JSON de `cambios` de §2.8. Una diferencia vacía significa edición sin cambios (no se escribe nada) |

### 5.1 Contratos

```ts
// lib/types/planes.ts
export type RolConTope = "maestro" | "admin" | "mensajero" | "adminTienda" | "adminSatelite";
export type PrecioPlan =
  | { tipo: "sin_precio" }
  | { tipo: "negociable" }
  | { tipo: "monto"; mensual: string;
      anual: null | { tipo: "fijo"; monto: string } | { tipo: "descuento"; porcentaje: string } };
export type TopesPlan = {
  ordenesPorCiclo: number | null;
  porRol: Partial<Record<RolConTope, number>>;
  apiKeys: number | null; // R35
};

export type CrearPlanInput = {
  nombre: string; visibilidad: "publico" | "custom"; organizacionId: string | null;
  topes: TopesPlan; modulos: ModuloApagable[]; precio: PrecioPlan;
};
// `.strict()`: traer `visibilidad` u `organizacionId` es validation_error (R2)
export type EditarPlanInput = { planId: string; nombre: string; topes: TopesPlan; modulos: ModuloApagable[]; precio: PrecioPlan };
export type ArchivarPlanInput = { planId: string };
export type AsignarPlanInput = { organizacionId: string; planId: string };

export type TopeExcedido = {
  organizacionId: string; empresa: string;
  tope: "ordenes" | "api_keys" | RolConTope; usados: number; maximo: number;
};
export type PlanResult =
  | { estado: "ok"; planId: string; cambio: boolean }
  | { estado: "forbidden" }                                              // R5
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> } // R2, R3
  | { estado: "not_found" }                                              // R13
  | { estado: "archivado" }                                              // R6
  | { estado: "custom_de_otra_empresa" }                                 // R13
  | { estado: "tope_excedido"; excedidos: TopeExcedido[]; mensaje: string }; // R12, R16

export type PlanDTO = {
  id: string; nombre: string; visibilidad: "publico" | "custom"; organizacionId: string | null;
  topes: TopesPlan; modulos: ModuloApagable[]; precio: PrecioPlan; archivado: boolean;
};
```

- **El porcentaje** es texto con hasta dos decimales, `> 0` y `≤ 100`.
- **`porRol`** solo admite las claves de `RolConTope`; una clave como `apiKey` es
  `validation_error` (R25).
- **`modulos`** son claves del catálogo de SL-23, sin repetir.

### 5.2 Asignar (R9–R14) — una transacción en `comoPlataforma`

1. Bloquea la empresa (`FOR UPDATE`) y el plan nuevo (`FOR SHARE`).
2. Valida:
   - la empresa o el plan no existen → `not_found`;
   - el plan está archivado → `archivado`;
   - el plan es custom de otra empresa → `custom_de_otra_empresa`;
   - el plan es el mismo que ya tiene → `ok` con `cambio: false`, sin escribir (R13).
3. Calcula el ancla: la que tiene la empresa o, si no tiene plan, `CURRENT_TIMESTAMP`.
   **Al cambiar de plan se conserva** (P2a, cerrada).
4. Cuenta el uso:
   - órdenes: `plan_uso_ordenes(org, plan_inicio_ciclo(ancla, now()))`;
   - cada rol con tope en el plan nuevo: `plan_uso_rol`;
   - API keys, si el plan nuevo las topa: `plan_uso_api_keys`.

   Si alguno pasa su tope → `tope_excedido` con la lista, sin escribir nada (R12).
5. `UPDATE organizacion SET plan_id, plan_ciclo_ancla_at`.
6. Sincroniza los módulos (§7.1).
7. Escribe el historial (§9) con una sola llamada a `appendAccion`: el `plan_asignado` y las filas
   de módulos comparten `lote_id`.

### 5.3 Editar (R15–R17) y archivar (R6)

- **Editar.** Una transacción:
  1. Bloquea el plan (`FOR UPDATE`). Si no existe → `not_found`; si está archivado →
     `archivado`.
  2. Para cada empresa con `plan_id = plan`, ordenadas por id, cuenta su uso contra los topes
     nuevos. Si alguna los pasa → `tope_excedido` con todas las que se pasan (R16).
  3. Calcula `diferenciasDelPlan(antes, despues)`. Si está vacía, responde `ok` con
     `cambio: false` sin escribir.
  4. Reemplaza las filas de `plan_tope_rol` y de `plan_modulo`, y actualiza las columnas.
  5. Aplica la diferencia de módulos a cada empresa (§7.2).
  6. Escribe la fila `editado` de `plan_rastro` con las diferencias (§9).
- **Crear.** Inserta el plan, sus topes y sus módulos, y la fila `creado` de `plan_rastro`, en una
  transacción.
- **Topes.** No hay que propagar nada: los triggers leen los topes del plan en cada alta (R15).
- **Archivar.** Pone `archivado_at` si no lo tiene y escribe la fila `archivado` de
  `plan_rastro`. Si ya estaba archivado, responde `ok` con `cambio: false` sin escribir. Las
  empresas lo conservan y los triggers no miran `archivado_at` (R6).

## 6. Las vías de alta

### 6.1 Órdenes: `BulkOrdenService` (R21, R22, R23)

- **Dependencia nueva, opcional.** El constructor gana un 4º parámetro,
  `cupoPlan: ICupoPlanRepository = SIN_CUPO`. `SIN_CUPO` devuelve `null`: no hace comprobación
  previa, y el trigger sigue siendo la autoridad.
  - Es opcional para no tocar los 18 archivos que construyen el servicio, entre ellos
    `tests/fabricas/escenarios/reparto.ts` (SL-43).
  - Los dos composition roots (`app/api/ordenes/carga-masiva/chunk/route.ts` y
    `app/api/ordenes/api-key/carga/route.ts`) inyectan el real. Un test lo exige (memoria «el
    composition root que no inyecta»).
- **`lib/repositories/CupoPlanRepository.ts`:** `cupoOrdenes(): Promise<{ maximo; usados } | null>`.
  Lee `SELECT * FROM plan_cupo_ordenes(${organizacionId})` con la empresa del contexto
  (`contextoActual`).
- **`cargarMasiva`** (sesión), después de clasificar las filas y **antes** del `dryRun`:
  - si `toCreate.length > 0` y `cupo.usados + toCreate.length > cupo.maximo`, cada fila
    `creada` pasa a `error` con `errores: { plan: [mensaje] }`;
  - y retorna sin persistir, con `cargaId: null`. Las filas `duplicada` y `error` no cambian (R22).
  - Vale igual en vista previa y en carga real.
- **`cargarViaApi`**, con la misma comprobación: lanza `TopeDelPlanAlcanzado`. El
  `withErrorHandler` del route lo saca por `appErrorToResponse` (R23):

```json
HTTP 409
{ "status": "error", "code": "CONFLICT",
  "message": "Tu plan permite 100 órdenes por ciclo. Llevas 99 y esta carga trae 2.",
  "details": { "codigo": "tope_plan", "tope": "ordenes", "maximo": 100, "usados": 99, "pedidas": 2 } }
```

- **Si salta el trigger** (otra alta se coló entre la lectura previa y el `INSERT`):
  1. el servicio captura `traducirErrorDeTope(e)`;
  2. consulta `findExistingRemisiones` sobre las remisiones de `toCreate`. Es el mismo patrón que
     `reclasificarOmitidas` (feature 294);
  3. las que existen siguen `creada`, porque entraron en un lote anterior ya confirmado; el resto
     pasa a `error` con el mensaje.

  En la API, si no entró ninguna, responde el 409; si entró alguna, el resumen lo dice fila a fila.
- **Residuo aceptado por el humano el 2026-10-27.** Una petición de más de `BATCH_SIZE` (500) filas que pierde la carrera a
  mitad puede quedar creada en parte. El tope nunca se pasa (R24), y el resumen dice qué entró. El
  caso normal, sin carrera, rechaza la petición entera (R21). La alternativa de una transacción
  por petición está descartada (§12, alternativa 3).

### 6.2 Por qué no basta el servicio

Las órdenes y los usuarios se crean por al menos ocho caminos de código (§«Lo que ya existe»). Un
camino nuevo que nadie enganche dejaría crear por encima del tope con la suite en verde. El trigger
lo cubre por construcción, también con SQL a mano (R18). Es el argumento de SL-40 §2.2. La
comprobación del servicio solo sirve para rechazar la petición entera y para la vista previa.

### 6.3 Usuarios (R27, R28)

En cada caso, el servicio envuelve la llamada al repositorio con `traducirErrorDeTope`:

| Servicio | Vía | Resultado ante el tope |
|---|---|---|
| `UsuarioService.crear` | crear desde «Usuarios» | `{ status: "validation_error", fieldErrors: { rolId: [mensaje] } }`. El formulario ya pinta los `fieldErrors` bajo el campo, sin cambios de UI (T7 confirma la clave del campo) |
| `UsuarioService.actualizar` | cambiar el rol | Igual que crear |
| `UsuarioService.cambiarEstado` | activar desde `inactivo` o `bloqueado` | `{ status: "tope_plan", mensaje }`, variante nueva de `CambiarEstadoUsuarioServiceResult` |
| `AprobacionPostulacionService` (aprobar) | aprobar postulación | `{ status: "tope_plan", mensaje }`, variante nueva de su resultado |

- **`UserRepository` y `AprobacionPostulacionRepository` no cambian:** el error sale del trigger
  y atraviesa `mapDuplicadoError`, que devuelve tal cual lo que no es un duplicado (T7 lo
  comprueba).
- **`apiKey` y `superadmin`.** La cuenta dedicada que crea `ApiKeyRepository` (rol `apiKey`) y
  `ArranqueSuperadminRepository` (sin empresa) nunca disparan el trigger de usuario con efecto. El
  tope de las keys es el de §6.5.
- **`OrganizacionRepository.altaEmpresa`.** Crea el maestro de una empresa sin plan: el trigger
  sale en el paso 1.

### 6.4 Textos (`lib/planes/mensajes.ts`)

| Caso | Texto |
|---|---|
| Órdenes | «Tu plan permite {maximo} órdenes por ciclo. Llevas {usados} y esta carga trae {pedidas}. Anula órdenes que no vayas a enviar o pide un cambio de plan.» |
| Rol | «Tu plan permite {maximo} usuarios activos con el rol {rol}. Ya tienes {usados}. Inactiva alguno o pide un cambio de plan.» |
| API keys | «Tu plan permite {maximo} API keys activas. Ya tienes {usados}. Desactiva o elimina alguna, o pide un cambio de plan.» |
| Superadmin (`tope_excedido`) | «{empresa} ya tiene {usados} {cosa} y el plan permite {maximo}.», una línea por tope excedido |

### 6.5 API keys (R35, R36)

| Servicio | Vía | Resultado ante el tope |
|---|---|---|
| `ApiKeyService.crear` | crear desde «Configuración › API» | `{ status: "tope_plan", mensaje }`, variante nueva de su resultado |
| `ApiKeyService.activar` | activar una key `inactiva` | `{ status: "tope_plan", mensaje }` |

- **`ApiKeyRepository` no cambia.** El error sale del trigger de `api_key`, dentro de la
  transacción de `createConUsuario` o de `setEstado`, y deshace también la cuenta dedicada
  creada en esa transacción. `ApiKeyService` lo traduce con `traducirErrorDeTope`. T7a comprueba
  que el `catch` de `crear` (hoy solo traduce duplicados a `conflict`) deja pasar el error para
  traducirlo.
- **Desactivar y eliminar** no son altas: nunca se rechazan por tope.
- **La API por key no crea keys**, así que no hay otra vía que cubrir.

### 6.6 Nombres de rol en los textos

- `{rol}` sale de la etiqueta de rol que ya usa la pantalla de usuarios (fuente única que vigila
  `historial-acciones-roles-una-sola-fuente`).
- Ningún texto nombra la marca ni el país.

## 7. Módulos y plan

### 7.1 Al asignar o cambiar de plan (R10, R11)

- **Ayudante.** Se extrae de `ModulosEmpresaRepository` a
  `lib/repositories/_shared/modulos-en-tx.ts`:
  - `encenderEnTx(tx, org, modulo)` y `apagarEnTx(tx, org, modulo)` devuelven
    `{ cambio: boolean; filaId }`;
  - `entradaDelCambio` se exporta desde el mismo archivo.
- **`ModulosEmpresaRepository`** pasa a llamarlos dentro de su propia transacción, con el mismo
  resultado y las mismas filas de historial: los tests de SL-23 no cambian.
- **La asignación** calcula `objetivo = plan_modulo del plan nuevo`:
  - enciende los de `objetivo` que no están;
  - apaga los encendidos que no están en `objetivo`;
  - junta sus entradas de historial con la del `plan_asignado`.
- **Convivencia con la excepción de SL-23.** El interruptor de SL-23 sigue igual, en las dos
  direcciones, y no sabe nada de planes. Una excepción es simplemente un estado distinto del
  plan, y dura hasta la siguiente sincronización (R11):
  - asignar o cambiar de plan la borra;
  - editar los topes no la toca;
  - editar los módulos del plan solo la toca si ese módulo entra o sale del plan (§7.2).
- **No se guarda qué módulo es excepción.** No hace falta para ninguna decisión, y guardarlo
  obligaría a cambiar la tabla de SL-23 (§12, alternativa 5).
- **Empresa sin plan:** SL-24 no toca sus módulos (R14).

### 7.2 Al editar los módulos de un plan en uso (R17, P3 cerrada el 2026-10-27)

- Se calculan `añadidos = nuevos − viejos` y `quitados = viejos − nuevos`.
- En cada empresa del plan se encienden los `añadidos` y se apagan los `quitados`, en la misma
  transacción y con historial en cada empresa.
- Los demás módulos, incluidas sus excepciones, no se tocan.
- La alternativa, resincronizar todo, borraría las excepciones de todas las empresas del plan con
  un cambio que quizá solo tocaba otro módulo.

## 8. Pantallas que ya existen (R28, R36)

No hay pantalla nueva: crear y asignar planes es SL-26. Dos pantallas existentes necesitan un
cambio mínimo para que el mensaje del servidor llegue a quien lo provocó:

- **`app/(app)/configuracion/_components/UsuariosModule.tsx`.** Al activar, si
  `res.status === "tope_plan"`, el aviso muestra `res.mensaje` en vez del genérico de
  `mensajeError`.
- **`app/(app)/_components/PostulacionesPendientesPanel.tsx`.** Con el mismo `status`, el aviso
  de error del modal muestra `mensaje`.
- **Lo que no cambia:** el formulario de usuario (`UsuarioForm`) y la carga masiva ya pintan
  `fieldErrors` y errores por fila.

### 8.1 API keys (R36)

- **`app/(app)/configuracion/api/_components/ApiKeysModule.tsx`.** Al crear, si
  `res.status === "tope_plan"`, el aviso muestra `res.mensaje`. Hoy su `mensajeError` cae en
  «Revisa los datos e inténtalo de nuevo.».
- **`app/(app)/configuracion/api/_components/ApiKeyAccionCell.tsx`.** Lo mismo al activar.

Sin estos cambios, la pantalla diría «Algo falló» ante un rechazo que la decisión pide explicar.
Son cuatro ramas de un `if` en pantallas que ya existen, sin componentes nuevos, así que no pasa
por `/design`. El humano aceptó el cambio de usuarios y postulaciones el 2026-10-27; el de API
keys sigue el mismo criterio para su tope nuevo.

## 9. Rastro (R29, P5 cerrada el 2026-10-27)

| Qué | Dónde | Cómo |
|---|---|---|
| Crear, editar o archivar un plan | `plan_rastro` (plataforma, §2.8) | Una fila por cambio real, con quién, cuándo y el diff de `diferenciasDelPlan`, aunque ninguna empresa use el plan |
| Asignar o cambiar el plan de una empresa | `historial_accion` de esa empresa | Una fila `plan_asignado` |
| Módulos que enciende o apaga la sincronización (§7) | `historial_accion` de cada empresa | Las filas `modulo_activado` y `modulo_desactivado` de SL-23 |

- **`historial_accion`:**
  - `HistorialAccionTipo` gana `plan_asignado` y `HistorialAccionEntidad` gana `plan`;
  - `entidad_id` es el id del plan nuevo y `entidad_etiqueta`, `Plan «<nombre>»`, recortada
    a 120;
  - `valor_anterior` y `valor_nuevo` van a `NULL`: el nombre de un plan es texto libre, y esas
    columnas son de vocabulario cerrado (comentario del modelo `HistorialAccion`);
  - categoría nueva `cambia_plan` («Cambia el plan») en `lib/types/historial-accion.ts`, y
    `etiquetaDeEntidad("plan", { nombre })` en `lib/types/historial-accion-etiquetas.ts`;
  - el actor es el superadmin, con `resolverActorCongelado` y `organizacionId` explícito en
    `appendAccion` (SL-23 §5.2);
  - `plan_asignado` y las filas de módulos de la misma asignación van en una sola llamada, así
    que comparten `lote_id`.
- **Editar los módulos de un plan en uso** (§7.2) deja, en cada empresa afectada, las filas de
  módulos de SL-23, en el mismo `appendAccion` de esa empresa.
- **Nada que registrar.** No escriben nada una asignación repetida, un archivado repetido ni una
  edición sin cambios (R13).

## 10. Migraciones

Van después de la última de `dev` (`20261026120200_job_estado_descartado`). Se escriben a mano
porque `db:migrate:create` falla con P3006 (SL-40 §4). T0 comprueba que siguen siendo las
últimas antes de aplicarlas en una base compartida. Una migración ya aplicada no se renumera.

| Carpeta | `migration.sql` | `down.sql` |
|---|---|---|
| `20261027130000_plan` | Enums `plan_visibilidad` y `plan_rastro_accion`; tablas `plan` (con `tope_api_keys`), `plan_tope_rol`, `plan_modulo` y `plan_rastro`, con sus `CHECK`, FK, índices y RLS sin políticas; `REVOKE ALL … FROM servi_app` en las cuatro; columnas `organizacion.plan_id` y `organizacion.plan_ciclo_ancla_at`, con FK y `CHECK`; índice parcial de §2.6 | `DROP INDEX`, `DROP COLUMN` ×2, `DROP TABLE` ×4 y `DROP TYPE` ×2 |
| `20261027130100_historial_accion_planes` | `ALTER TYPE historial_accion_tipo ADD VALUE 'plan_asignado'` y `ALTER TYPE historial_accion_entidad ADD VALUE 'plan'` | Borra las filas con esos valores y recrea los dos tipos sin ellos, con el patrón de `20261026120100_historial_accion_modulos/down.sql` |
| `20261027130200_plan_topes_triggers` | Las funciones de §4.2 y §4.3 (`SECURITY DEFINER`, `REVOKE EXECUTE … FROM PUBLIC`; `GRANT EXECUTE ON FUNCTION plan_cupo_ordenes TO servi_app`) y los cinco triggers: uno sobre `orden`, dos sobre `usuario` y dos sobre `api_key` | `DROP TRIGGER` ×5 y `DROP FUNCTION` ×8 |

- **Los triggers van en carpeta propia** (precedente SL-40 §4): se pueden quitar sin borrar el
  catálogo.
- **`tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts`** sigue estos pasos:
  1. aplica las tres;
  2. comprueba que ninguna empresa previa tiene plan (R14) y que los nombres van en español
     (R31);
  3. crea un plan con tope 1, crea una orden y espera `SL024` en la segunda;
  4. aplica los tres `down.sql`;
  5. crea dos órdenes sin error.

## 11. Tests

| Archivo | Qué cubre |
|---|---|
| `tests/integration/db/plan-topes-ordenes.test.ts` | R14, R18, R19, R21, R30. Montaje: empresas A y B como `aislamiento-ordenes.test.ts`, con órdenes por `createManyOrdenes` y `createManyOrdenesConGuia` reales. Casos: al tope rechaza y no crea ninguna; igual al tope acepta; anular por pantalla y por API libera cupo; una orden con `created_at` del ciclo anterior (escrita como dueño) no cuenta; A al tope y B con el mismo plan crea; empresa sin plan sin límite; `INSERT` a mano con `servi_app` también rechaza. **Control de no vacuidad:** el trigger está en `pg_trigger` y la fila existe antes de afirmar |
| `tests/integration/db/plan-topes-concurrencia.test.ts` | R24. Dos clientes con transacciones abiertas a la vez y cupo 1: exactamente una confirma. Un alta y una bajada de plan en paralelo: el estado final nunca pasa el tope. Afirma `READ COMMITTED` |
| `tests/integration/db/plan-topes-usuarios.test.ts` | R14, R25, R26, R27. Las vías con los repositorios reales: crear, activar desde `inactivo`, activar desde `bloqueado`, aprobar postulación y cambiar de rol. Más el `UPDATE` a mano. `pendiente`, `inactivo` y `bloqueado` no cuentan; un rol sin tope no tiene límite; crear una API key no mueve ningún uso de rol |
| `tests/integration/db/plan-topes-api-keys.test.ts` | R35. `createConUsuario` y `setEstado` reales y el SQL a mano. Al tope, crear y activar se rechazan y no queda ni la key ni su cuenta dedicada. Desactivar y eliminar liberan cupo. Sin tope no hay límite |
| `tests/unit/services/api-key-service-tope-plan.test.ts` | R35: `crear` y `activar` traducen a `tope_plan` |
| `tests/components/ApiKeysTopePlan.test.tsx` | R36 |
| `tests/unit/planes/rastro.test.ts` | `diferenciasDelPlan`: alta, cada campo, sin cambios = vacío, importes como texto |
| `tests/integration/db/plan-ciclo.test.ts` y `tests/unit/utils/ciclo-plan.test.ts` | R20 con la misma tabla: alta el 15; alta el 31 de enero en año normal y bisiesto; el instante exacto de la frontera; un ahora anterior al ancla |
| `tests/integration/db/planes-catalogo.test.ts` | R1, R3 (los `CHECK`), R6, R7, R25 (el `CHECK` de rol) |
| `tests/integration/db/planes-asignacion.test.ts` | R4, R9–R13 |
| `tests/integration/db/planes-edicion-en-uso.test.ts` | R15–R17 |
| `tests/integration/db/planes-historial.test.ts` | R29: `plan_rastro` de un público sin empresas (crear, editar y archivar, con el diff exacto); `plan_asignado` en `historial_accion`, con actor y `lote_id` compartido con los módulos; reversión si falla el registro |
| `tests/integration/db/planes-acceso-servi-app.test.ts` | R8, R30 |
| `tests/integration/db/migracion-sl24-ida-y-vuelta.test.ts` | R14, R31 |
| `tests/unit/types/planes-schema.test.ts` | R2, R3, R25 |
| `tests/unit/services/planes-service.test.ts` | R5 (cada rol de empresa, cero llamadas al repositorio), R2, R6, R12, R13, R16 |
| `tests/unit/services/bulk-orden-service.tope-plan.test.ts` | R21, R22: comprobación previa en vista previa y en carga real; reclasificación tras el trigger |
| `tests/unit/api/api-key-carga-tope-plan.test.ts` | R23: 409 y forma del cuerpo |
| `tests/unit/api/carga-composition-root-cupo.test.ts` | Los dos routes construyen `BulkOrdenService` con `CupoPlanRepository` real |
| `tests/unit/actions/planes.composition-root.test.ts` | La action pasa el repositorio real al servicio |
| `tests/unit/db/sqlstate.test.ts` y `tests/unit/planes/tope-error.test.ts` | El recorrido de `cause` para `SL017` (sin regresión) y `SL024`; el JSON del mensaje |
| `tests/unit/services/usuario-service-tope-plan.test.ts`, `tests/unit/services/aprobacion-postulacion-tope-plan.test.ts` | R27: traducción a `validation_error` o `tope_plan` |
| `tests/components/UsuariosTopePlan.test.tsx`, `tests/components/PostulacionesTopePlan.test.tsx` | R28 |
| `tests/unit/guards/planes-sin-seed.guardia.test.ts` | R32: `scripts/seed-catalogos.ts` no nombra `plan`, `planTopeRol`, `planModulo` ni `plan_id` |
| `tests/unit/guards/planes-sin-borrado.guardia.test.ts` | R6, R29: ningún archivo de `lib/` ni de `app/` llama a `plan.delete`, `plan.deleteMany`, `planRastro.update*` ni `planRastro.delete*`, ni escribe `DELETE FROM "plan"` o `"plan_rastro"`. Con contraprueba sintética |
| `e2e/dos-empresas-humo.spec.ts` y `e2e/_planes-fixture.ts` | R33 (§11.1) |

- **Ayudantes de test.** `tests/integration/db/_fixtures/planes.ts` crea planes y asignaciones con
  `PlanesRepository` real y el cliente dueño. No va en `tests/fabricas/`, por el choque con SL-43
  (§14).
- **Mutaciones que deben matar los tests** (una cada vez, medidas en `progress/impl_SL-24.md`):
  1. el trigger compara con `>=` en vez de `>`;
  2. el conteo olvida `deleted_at IS NULL`;
  3. se quita el cerrojo consultivo (el test de concurrencia debe ponerse en rojo);
  4. la asignación no cuenta usuarios;
  5. el `WHEN` del trigger de usuario omite el cambio de rol;
  6. el `WHEN` del trigger de usuario vuelve a aceptar `bloqueado` como estado que cuenta;
  7. se quita el trigger de cambio de `api_key` (activar una inactiva al tope pasaría).

### 11.1 E2E (R33)

`e2e/_planes-fixture.ts` tiene dos funciones:

- `asignarPlanConTope(organizacionId, n)`, que crea un plan custom de A con tope de órdenes `n`
  (y los 8 módulos, para no cambiar lo que el humo ya recorre) y lo asigna con `PlanesRepository`
  real como dueño;
- `crearOrdenesDirectas(empresa, n)`, que crea las órdenes con el cliente dueño.

El caso nuevo del humo:

1. A tiene un plan con tope 2 y dos órdenes.
2. La tienda de A sube por la carga masiva de `/ordenes` un archivo de una fila.
3. Ve en el resumen la fila con «Tu plan permite 2 órdenes por ciclo…».
4. La base no tiene esa remisión.
5. La tienda de B, sin plan, sube la suya y la ve creada.

- **Si el humo no puede generar el archivo** sin una dependencia nueva, el paso 2 usa
  `page.request.post("/api/ordenes/carga-masiva/chunk")` con la sesión de la tienda y afirma el
  texto del error de la fila. Se anota en `progress/impl_SL-24.md`.
- **Los módulos de A no cambian.** Asignar un plan con los 8 módulos no apaga ninguno, así que el
  caso de SL-23 (B sin «Ranking») sigue igual: B no tiene plan.

## 12. Alternativas descartadas

1. **Solo comprobación en los servicios**, sin trigger: contar en `BulkOrdenService` y en los
   servicios de usuarios antes de escribir.
   - Hay ocho caminos de alta, y uno olvidado no se nota (§6.2).
   - Contar fuera de la transacción del `INSERT` deja la carrera entre dos altas, y el alcance
     exige «dentro de la misma transacción del alta».
   - Meter el conteo en cada transacción de cada repositorio es repetirlo en ocho sitios.
2. **Un contador materializado** (`organizacion_uso(organizacion_id, ciclo, ordenes)`) con
   `UPDATE … SET ordenes = ordenes + n WHERE ordenes + n <= tope`.
   - Es atómico y barato por alta, pero tiene que seguir cada anulación y cada recuperación.
   - Habría que reiniciarlo en cada frontera de ciclo, con un cron que no existe.
   - Puede divergir de la tabla `orden`, que es la verdad.
   - El conteo con el índice parcial de §2.6 cuenta como mucho el tope de filas, por empresa y por
     sentencia.
3. **Una transacción por petición de carga**, para que una petición de 2.000 filas sea todo o
   nada incluso en la carrera. Obliga a reescribir `createManyOrdenes` y `createManyOrdenesConGuia`
   (lotes de 500 con cada transacción, ficha 49), y a alargar los cerrojos durante toda la carga
   masiva. La comprobación previa cubre el caso normal, y el trigger garantiza el tope.
4. **Ciclo con frontera a medianoche en la zona de la empresa.** Necesita una zona por empresa que
   no existe hasta SL-21, y meter `AT TIME ZONE` en el SQL, que el repo evita. La hora del alta da
   el mismo «del 15 al 14» sin ese dato.
5. **Marcar en `organizacion_modulo` qué fila es excepción** (columna `por_excepcion`). Permitiría
   resincronizar sin borrar excepciones, pero cambia la tabla y el repositorio de SL-23 y su
   `REVOKE`. Ninguna decisión necesita distinguirla: la regla es «al cambiar de plan se
   sincroniza».
6. **Registrar los cambios de un plan solo en `historial_accion` de cada empresa afectada.** Era
   la propuesta inicial para P5. Un plan público sin empresas no dejaba rastro, y el humano pidió
   que lo dejara. Por eso se usa `plan_rastro`.
7. **Contar como API keys también las `inactivas`.** Desactivar una key no liberaría cupo, y la
   empresa tendría que eliminarla —perdiendo su rastro operativo— para crear otra. La feature 88
   trata `inactiva` como revocada: no autentica.
8. **La asignación en una tabla de negocio `organizacion_plan`.** Habría que añadir RLS, política,
   `REVOKE`, trigger de «sin cambio de empresa» y su lugar en `MODELOS_DE_NEGOCIO`, para un dato 1
   a 1. La columna en `organizacion` hereda todo eso de SL-17 y SL-40 (§2.4).

## 13. Dependencias

Ninguna nueva (R34). Se usan Prisma, zod, `Prisma.Decimal` y Postgres (`plpgsql`, cerrojos de fila
y consultivos, tablas de transición).

## 14. Choques con las ramas en vuelo

| Archivo o zona | Rama | ¿Lo toca SL-24? | Cómo se resuelve |
|---|---|---|---|
| `tests/fabricas/*` (incluido `tests/fabricas/escenarios/reparto.ts`) | SL-43 (Carlos Restrepo) | **No** | Parámetro opcional en `BulkOrdenService` (§6.1); ayudantes en `tests/integration/db/_fixtures/planes.ts` y `e2e/_planes-fixture.ts` |
| `scripts/demo-qa*` | SL-43 | **No** | `scripts/demo-qa/borrar.ts` borra por `organizacion_id` vía `information_schema`. Las tablas de plan no tienen esa columna, pero la demo no crea planes (R32), y un custom de una empresa demo se va por `CASCADE` (§2.1) |
| `lib/auth/*` | SLT-32 (Camilo) | **No** | — |
| `lib/services/AuthService.ts` | SLT-32 | **No** | — |
| `lib/repositories/UserRepository.ts` | SLT-32 | **No** | La traducción va en `UsuarioService` (§6.3). El trigger sobre `usuario` no dispara en lo que toca SLT-32 (login), que no cambia rol ni estado |
| `lib/repositories/ApiKeyRepository.ts` | — | **No** | El tope de keys lo pone el trigger sobre `api_key` (§4.3) |
| `lib/services/ApiKeyService.ts`, `lib/interfaces/services/IApiKeyService.ts`, `lib/types/api-key.ts`, `lib/actions/api-keys.ts`, `app/(app)/configuracion/api/_components/ApiKeysModule.tsx`, `app/(app)/configuracion/api/_components/ApiKeyAccionCell.tsx` | ninguna en vuelo conocida | Sí (§6.5, §8.1) | Ni SL-43 ni SLT-32 declaran estos archivos. `archivos-en-vuelo.mjs` lo confirma al publicar el `tasks.md` |
| `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `lib/db/excepciones-aislamiento.ts`, `lib/modulos/reparto.ts`, `lib/types/historial-accion*.ts` | cualquier ficha con migración o action nueva | Sí | Entradas distintas; quien mergea segundo rebasa |
| Orden de migraciones | — | — | T0 lo comprueba contra `dev` |

SLT-32 es de la misma persona que SL-24 (Camilo, según `progress/features/SL-24.md`). El choque
entre personas es solo con SL-43, y queda evitado si se respeta la tabla.

## 15. Riesgos

- **Contención en empresas con plan.** Las altas de una misma empresa con tope se ponen en fila al
  final de cada sentencia, hasta su `COMMIT`. El lote de carga encola la geocodificación después
  del `INSERT`, dentro de la misma transacción. T4 mide una carga de 500 filas con plan y sin
  plan, y deja los números en `progress/impl_SL-24.md`. Las empresas sin plan no toman el
  cerrojo consultivo.
- **Funciones `SECURITY DEFINER`.** Usan `search_path` fijo y `REVOKE EXECUTE … FROM PUBLIC`.
  Toman la empresa de `NEW` o de la tabla de transición, que la RLS de `orden` y de `usuario` ya
  validó. `plan_cupo_ordenes` exige que su argumento sea la empresa del contexto.
- **Si `MESSAGE` no llegara entero** por el adaptador, la traducción no encontraría el JSON. T3 lo
  prueba contra la base antes de montar los servicios encima.
- **Activar un usuario `bloqueado` ahora es un alta** (decisión P4). Si hoy algún flujo
  desbloquea cuentas automáticamente (por ejemplo, tras los fallos de login), al tope ese
  desbloqueo fallaría. T7a busca los escritores de `estado = 'activo'` y lo anota. Si hay uno
  automático, se para y se pregunta.
