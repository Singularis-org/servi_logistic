# SLT-66 — planes-sin-tope-maestro-y-costeo · design.md

> Requisitos: `requirements.md` (R1–R34).
>
> **Enmienda del 2026-10-31.** El humano cerró P1–P3 y pidió que asignar un plan se encuentre desde el
> listado. Cambian R18, R20, R24, R26 y R27, y entran R28–R33. Lo nuevo está en §6.3–§6.6, §7 y §9.
>
> **Segunda enmienda del 2026-10-31.** P4 cerrada: la migración desasigna los planes sin costo base
> concreto (R34, §2.3 bis). Una base 0 es concreta. R33 entra. R20 y R30 se reescriben.
>
> **Tercera enmienda del 2026-10-31.** Se cierran P5 y P6:
> - P6: M4 desasigna a **todas** las empresas con plan;
> - P5: editar un plan asignado puede dejarlo sin costo concreto. Se guarda, y las pantallas lo muestran
>   como «por definir» con aviso.
>
> No queda ninguna pregunta abierta.
>
> Hereda el diseño de
> `specs/SL-24-planes-y-limites/` («SL-24 §N»), `specs/SL-40-cobro-plataforma-por-orden/` («SL-40 §N») y
> `specs/SLT-58-planes-superadmin-ui/` («SLT-58 §N»).

## Lo que ya existe

Busqué el 2026-10-31 con los términos `costo por orden`, `costo base`, `cobro por orden`, `tope maestro`,
`plan_tope_rol`, `precio_mensual` y `tarifa vigente`. Miré en tres sitios:

- el board: `feature_list.json`, por `key` (los términos los pasé por `specs/`);
- `specs/`, con Grep;
- el código, con el grafo `codebase-memory-mcp` del proyecto de este worktree más Grep y Read sobre `db/`,
  `lib/`, `app/`, `tests/` y `e2e/`.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| El plan y su tope por rol, con `maestro` entre los roles con tope | `db/migrations/20261028130000_plan` (`plan_tope_rol_rol_check`), `lib/types/planes.ts > ROLES_CON_TOPE`, SL-24 §2.2 | Se quita `maestro` del `CHECK` y de `ROLES_CON_TOPE`, en una migración nueva (§2.1). El trigger `plan_tope_usuario` **no se toca**: sin fila de tope del rol, ya sale sin contar (SL-24 §4.3) |
| El precio del plan: `precio_mensual`, `precio_anual`, `descuento_anual_pct`, `precio_negociable` y el `CHECK plan_precio_forma` | SL-24 §2.1 | Se reutilizan tal cual como «costo base». No se renombra ninguna columna (§11, alternativa 2) |
| La tarifa vigente de SL-40 (`excepción ?? global ?? 0`), calculada **dentro** del trigger `cobro_plataforma_al_crear_orden()` | `20261024120000_cobro_plataforma_blindaje_orden` (última versión del cuerpo) | Se saca a una función `cobro_plataforma_tarifa_de(org)` con el escalón del plan. La usan el trigger y las dos lecturas del costeo (§3) |
| El enum `cobro_plataforma_fuente` (`empresa`, `global`, `sin_configurar`) | `20261023130100_cobro_plataforma_movimiento`, `db/schema.prisma > CobroPlataformaFuente` | Gana `plan` (§2.2). Ningún código TS hace `switch` sobre él (Grep) |
| La deuda de la wallet: Σ cargos − Σ reversos (− pagos, SL-45) | `lib/utils/deuda-plataforma.ts`, `DeudaPlataformaService` | **No se toca**: suma todos los movimientos sin mirar la fuente, así que R17 sale por construcción |
| `plan_de_la_empresa(text)` (la lectura de «Mi plan»), con `uso.maestro` | `20261029150000_plan_ciclo_inicio_elegido` (última versión del cuerpo) | Se reemplaza con `CREATE OR REPLACE`: quita `maestro` y añade el costeo (§3.2) |
| Uso de una empresa para el superadmin (`usoDe`, con la columna `maestro`) y `planDeEmpresa` | `lib/repositories/PlanesRepository.ts:192`, `:1040` | Se quita la columna `maestro` y se lee el costeo con la misma función SQL (§4.3) |
| `planConConsumo`, `filasDeConsumo`, `ConsumoDelPlan` | `lib/planes/consumo.ts`, `components/shared/ConsumoDelPlan.tsx` (SLT-58 §6.1–§6.2) | Se amplían con el bloque de costeo, que comparten «Mi plan» y el detalle de empresa (R18) |
| `diferenciasDelPlan`, `lineasDeCambioDelPlan`, `textoDelPrecio` | `lib/planes/rastro.ts`, `lib/planes/mensajes.ts` | Ganan el campo `costoPorOrden` y el rótulo «Costo base» (R9, R11) |
| Validación de importes como texto: `montoCobroSchema` | `lib/types/cobro-plataforma.ts` | Se reutiliza para `costoPorOrden` (R8) |
| `PlanForm`, con el campo `MontoInput` de SLT-67 | PR #51 (SLT-67, sin merge), `components/shared/MontoInput.tsx` en su worktree | La tanda D empieza con un merge de `dev` si #51 ya entró. Si entró, el costo por orden usa `MontoInput`; si no, usa el mismo `Input` que hoy usa el mensual (§6.1) |
| `aplicarMigracionesHasta` para las pruebas de ida y vuelta | `tests/integration/db/_fixtures/ida-y-vuelta-32.ts` | Se reutiliza (§9) |
| E2E del cobro y de planes: `cobro-plataforma-sl40.spec.ts` (deuda en la wallet, guardar y restaurar el global) y `planes-superadmin.spec.ts` (OTP, `PlanForm`, asignación) | `e2e/` | Se copian sus patrones en un spec propio (§9.2) |

En el board no hay otra ficha de costeo del plan ni de quitar el tope del maestro. Esta ficha es la única.

## 0. Decisiones cerradas → requisitos

| Decisión (tabla de `requirements.md`) | R |
|---|---|
| Tope por rol; el maestro sin tope, sin contar, sin campo, sin fila; la migración borra el que haya | R1–R5 |
| Tope de API keys igual | R6 |
| Costo base mensual + costo por orden | R7–R9, R11 |
| Anual y descuento: el descuento solo rebaja la base | R10, R14, R19 |
| Prioridad excepción > plan > global > 0 | R12, R13 |
| Órdenes cobradas: creadas − anuladas, con reverso | R16, R17 |
| El costo base no se anota en la wallet; base + órdenes × costo | R18, R19, R21 |
| Cambio a mitad de ciclo: cada orden conserva su importe | R15, R16 |
| Plan negociable con costo por orden | R7, R20 |
| E2E | R26 |
| Quién edita y dónde se autoriza | R11, R22 |
| P1: el costo que se cobra, con la nota de la excepción | R18 |
| P2: solo se asignan planes con costo concreto | R28–R30, R20 |
| P4: la migración desasigna los planes sin costo concreto | R34 |
| Una base 0 es concreta | R20, R28 (definición) |
| P3: el listado de «Empresas» muestra el cobro vigente y su fuente | R31 |
| Asignar un plan se encuentra desde el listado | R32, R33, R26 |

## 1. Resumen

- **Maestro sin tope.** Sale del `CHECK` de `plan_tope_rol` y de `ROLES_CON_TOPE`. La migración borra sus
  filas y lo quita de las versiones pendientes. Las pantallas lo pierden solas, porque recorren
  `ROLES_CON_TOPE`.
- **Costeo.** Hay una columna nueva, `plan.costo_por_orden` (`DECIMAL(12,2) NULL`). El costo base es
  el `precio_mensual` de siempre, solo con otro rótulo.
- **Cobro.** Una función nueva, `cobro_plataforma_tarifa_de(org)`, es la **única** definición de la
  tarifa vigente (R12). La usan el trigger de alta de SL-40 y las dos lecturas del costeo. La fuente
  `plan` queda en el cargo.
- **Total estimado.** Es una función pura TS en decimal exacto (`lib/planes/costeo.ts`). La pinta
  `ConsumoDelPlan` en «Mi plan» y en el detalle de empresa. No escribe nada.

## 2. Modelo de datos y migraciones

Van después de la última migración de `dev` (`20261030120100_incentivo_mensajero_checks`). Se escriben a
mano, como las de SL-24 y SL-40 (`db:migrate:create` falla con P3006). T0 comprueba que siguen siendo las
últimas antes de aplicarlas en una base compartida. Ninguna migración ya mergeada se edita.

### 2.1 M1 — `20261031120000_plan_costeo_y_maestro_sin_tope`

```sql
-- SLT-66. CABECERA: el DELETE de los topes de maestro es DEFINITIVO. down.sql repone el CHECK que los
-- admitía, pero NO las filas borradas (decisión del humano del 2026-10-30: «la migración lo borra»).

-- R7, R8: costo por orden del plan. NULL = el plan no lo fija (se aplica el global, R12).
ALTER TABLE "plan" ADD COLUMN "costo_por_orden" DECIMAL(12,2);
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_check"
  CHECK ("costo_por_orden" IS NULL OR "costo_por_orden" >= 0);

-- R1, R4: el maestro deja de tener tope.
DELETE FROM "plan_tope_rol" WHERE "rol" = 'maestro';
ALTER TABLE "plan_tope_rol" DROP CONSTRAINT "plan_tope_rol_rol_check";
ALTER TABLE "plan_tope_rol" ADD CONSTRAINT "plan_tope_rol_rol_check"
  CHECK ("rol" IN ('admin', 'mensajero', 'Admin Tienda', 'adminSatelite'));

-- R4, R11: las versiones pendientes pierden el tope de maestro y ganan la clave nueva, que nace vacía
-- (la columna también nace NULL). Así `versionPlanSchema`, que ya no admite `maestro` y exige
-- `costoPorOrden`, las sigue leyendo (lo hacen el aplicador, «Mi plan» y el detalle).
UPDATE "plan_cambio_programado"
   SET "version" = jsonb_set("version" #- '{topes,porRol,maestro}', '{costoPorOrden}', 'null'::jsonb);
```

`down.sql`:

- `UPDATE "plan_cambio_programado" SET "version" = "version" - 'costoPorOrden';`
- repone `plan_tope_rol_rol_check` con los cinco roles de `20261028130000`;
- `DROP CONSTRAINT "plan_costo_por_orden_check"` y `DROP COLUMN "costo_por_orden"`.

La cabecera lo dice: los topes de maestro borrados no vuelven.

- **`plan_rastro` no se toca** (R4). Las filas viejas que mencionan un tope de maestro se siguen
  leyendo con su forma, sin validar (`PlanesRepository.detalle`, `cambios as CambiosDelPlan`). Las
  líneas de cambio recorren `ROLES_CON_TOPE`, así que ese tope ya no se pinta. Es el comportamiento
  deseado (R5): el rastro conserva el dato y la pantalla no lo muestra.
- **Los trabajos de correo ya encolados** (`plan_aviso_correo`) llevan sus `cambios` ya calculados. Pasa
  lo mismo que con el rastro.
- **Multi-empresa.** No hay tabla nueva. `plan`, `plan_tope_rol` y `plan_cambio_programado` siguen
  siendo de plataforma, con RLS sin políticas y `REVOKE ALL … FROM servi_app` (SL-24 §2.5). La columna
  nueva hereda ese trato. No cambia `MODELOS_DE_PLATAFORMA`.

### 2.2 M2 — `20261031120100_cobro_plataforma_fuente_plan`

```sql
ALTER TYPE "cobro_plataforma_fuente" ADD VALUE 'plan';
ALTER TYPE "plan_rastro_accion" ADD VALUE 'desasignado';   -- R34, lo usa M4
```

- **`desasignado` es un valor nuevo de un enum que ya existe, no una columna nueva.** Ninguna de las
  acciones que hay (`creado`, `editado`, `archivado`, `cambio_*`) describe quitar un plan a una empresa,
  y usar `editado` falsearía el rastro. Prisma: `PlanRastroAccion` gana `desasignado`. Las pantallas que
  traducen la acción (`PlanDetalle`) lo añaden a su tabla, y el typecheck las señala.
- **El `down.sql` de este valor** se niega a bajar si quedan filas `desasignado` en `plan_rastro`. Las
  quita el `down.sql` de M4, que va antes. Si no quedan filas, recrea el tipo sin el valor con el mismo
  patrón.

- **Va en su propia carpeta.** Un valor de enum añadido no se puede usar en la misma transacción
  (precedente SL-24 §16.6).
- **El `down.sql` se niega a borrar dinero** (R25):
  - si hay filas con `fuente = 'plan'` en `cobro_plataforma_movimiento`, hace
    `RAISE EXCEPTION 'SLT-66 down: hay cargos o reversos de fuente plan; bajar los borraría o los
    falsearía'`;
  - si no las hay, recrea el tipo sin `plan`, con el patrón de
    `20261026120200_job_estado_descartado/down.sql`: crea el tipo nuevo, hace `ALTER COLUMN … TYPE …
    USING fuente::text::…` y borra el viejo.
- **Por qué negarse y no borrar** (como hacía el `down.sql` de SL-24 con sus filas de enum): los
  movimientos son el libro de la deuda. Borrarlos baja la deuda y convertirlos a `global` falsea su
  origen.

### 2.3 M3 — `20261031120200_plan_costeo_funciones`

1. **`cobro_plataforma_tarifa_de(p_organizacion_id text) RETURNS TABLE ("monto" numeric(12,2), "fuente" cobro_plataforma_fuente)`**:
   - `plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp` y `REVOKE EXECUTE … FROM PUBLIC`;
   - **sin `GRANT` a `servi_app`**. La llaman el trigger y `plan_de_la_empresa`, que son
     `SECURITY DEFINER`, y el superadmin en `comoPlataforma`, que corre como dueño.

   Su regla es la de R12, con una sola lectura de cada tabla:

   ```sql
   SELECT o."cobro_plataforma_por_orden", p."costo_por_orden"
     INTO v_excepcion, v_plan
     FROM "organizacion" o LEFT JOIN "plan" p ON p."id" = o."plan_id"
    WHERE o."id" = p_organizacion_id;
   IF v_excepcion IS NOT NULL THEN RETURN QUERY SELECT v_excepcion, 'empresa'::cobro_plataforma_fuente; RETURN; END IF;
   IF v_plan      IS NOT NULL THEN RETURN QUERY SELECT v_plan, 'plan'::cobro_plataforma_fuente;         RETURN; END IF;
   SELECT t."monto" INTO v_global FROM "cobro_plataforma_tarifa" t WHERE t."id";
   IF v_global    IS NOT NULL THEN RETURN QUERY SELECT v_global, 'global'::cobro_plataforma_fuente;     RETURN; END IF;
   RETURN QUERY SELECT 0::numeric(12,2), 'sin_configurar'::cobro_plataforma_fuente;
   ```

   - **No mira `archivado_at`.** Un plan archivado que la empresa conserva sigue cobrando (R13).
   - **No mira el descuento ni la forma del costo base** (R10, R14).
2. **`CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden()`**. Copia **literal** del cuerpo de
   `20261024120000`, salvo el bloque que elegía `v_monto` y `v_fuente`, que pasa a ser
   `SELECT t."monto", t."fuente" INTO v_monto, v_fuente FROM cobro_plataforma_tarifa_de(NEW."organizacion_id") t;`.
   - Los dos `INSERT` (cargo y, si nace borrada, reverso), el `now()` y el `RETURN NULL` no cambian.
   - El trigger no se toca: sigue siendo el `AFTER INSERT … FOR EACH ROW` de `20261024120000`.
   - El trigger de borrado (`cobro_plataforma_al_cambiar_borrado`) **no se toca**. Ya copia monto y
     fuente del último movimiento, así que R16 sale solo.
3. **`CREATE OR REPLACE FUNCTION plan_de_la_empresa(text)`**. Copia literal del cuerpo de
   `20261029150000` con tres cambios:
   - quita `'maestro', plan_uso_rol(o."id", 'maestro'::rol_value)` de `uso` (R5);
   - añade `'costo_por_orden', p."costo_por_orden"::text`, el del plan, que solo usa la lectura del
     superadmin y P1;
   - añade `'costo_vigente', (SELECT jsonb_build_object('monto', t."monto"::text, 'fuente', t."fuente") FROM cobro_plataforma_tarifa_de(o."id") t)`
     (R18, P1).

   La comprobación del contexto (`42501`), el `search_path`, `REVOKE` y `GRANT` no cambian (R22).

`down.sql`:

- `CREATE OR REPLACE` de las dos funciones con su cuerpo de `20261024120000` y de `20261029150000`,
  copiado literalmente;
- `DROP FUNCTION cobro_plataforma_tarifa_de(text)`.

El reviewer compara los cuerpos línea a línea con los de origen (precedente SLT-58 §11.2).

### 2.3 bis M4 — `20261031120300_plan_desasignar_sin_costo_base` (R34, P4 cerrada)

Va después de M1 y de M2, que crea el valor `desasignado`. Criterio (P6, cerrada): **toda** empresa
con plan. `costo_por_orden` nace vacío en todos los planes, así que ninguna asignación previa tiene costo
concreto.

```sql
-- SLT-66 R34. Desasigna el plan a TODA empresa que tenga uno (P6). Quedan sin plan (sin límites), sin
-- ciclo y con sus módulos como estaban, hasta que el superadmin les asigne un plan con costo concreto.
-- CABECERA: el down.sql repone plan, ancla y ciclo corto desde plan_rastro SOLO a las empresas que sigan
-- sin plan. A una que ya recibió otro plan no la toca.
CREATE TEMP TABLE "slt66_desasignadas" ON COMMIT DROP AS
  SELECT o."id", o."nombre", o."plan_id", p."nombre" AS "plan_nombre",
         o."plan_ciclo_ancla_at" AS "ancla", o."plan_ciclo_corto_desde_at" AS "corto"
    FROM "organizacion" o JOIN "plan" p ON p."id" = o."plan_id";

INSERT INTO "plan_rastro" ("id", "plan_id", "plan_nombre", "accion", "cambios", "actor_usuario_id", "actor_nombre")
SELECT gen_random_uuid()::text, d."plan_id", d."plan_nombre", 'desasignado',
       jsonb_build_object('empresa', jsonb_build_object(
         'antes', jsonb_build_object('id', d."id", 'nombre', d."nombre", 'ancla', d."ancla", 'cortoDesde', d."corto"),
         'despues', NULL)),
       'sistema:SLT-66', 'Sistema (migración SLT-66)'
  FROM "slt66_desasignadas" d;

UPDATE "organizacion" o
   SET "plan_id" = NULL, "plan_ciclo_ancla_at" = NULL, "plan_ciclo_corto_desde_at" = NULL
  FROM "slt66_desasignadas" d WHERE o."id" = d."id";
```

- **Las columnas de `plan_rastro` ya existen** (SL-24 §2.8):
  - `plan_id` y `actor_usuario_id` son opacos y sin FK, así que `'sistema:SLT-66'` cabe sin un usuario
    real. Es el mismo trato que da el aplicador de cambios al «Sistema» (SL-24 §16.3);
  - `cambios` es `JSONB` libre. La clave `empresa` es nueva, pero no rompe nada: `lineasDeCambioDelPlan`
    solo lee las claves que conoce.

  `PlanDetalle` traduce la fila así: «Desasignado de {empresa} por la migración: el plan no tenía costo
  base concreto».
- **Por qué se ponen a `NULL` el ancla y el ciclo corto.** Una empresa sin plan y con ancla tendría,
  al reasignarla, el ciclo viejo (`COALESCE` de `PlanesRepository.asignar`), y no podría elegir fecha.
  El `CHECK organizacion_plan_ciclo_corto_check` obliga a poner las dos a `NULL`. Sin ancla, la próxima
  asignación es una «primera asignación» (SLT-58 R29–R31).
- **Los módulos no cambian.** Es SL-24 R14: el plan no toca los módulos de una empresa sin plan. La
  empresa conserva los que tenía encendidos.
- **Sin fila en `historial_accion` de la empresa.** Exige actor y se escribe con `appendAccion` desde TS;
  una migración no tiene actor. El rastro queda solo en `plan_rastro`, que es lo que pidió el humano. Su
  consecuencia: el «Historial de asignaciones» del detalle de empresa no muestra la desasignación.
- **`down.sql`.** Para cada fila `desasignado` con `actor_usuario_id = 'sistema:SLT-66'`, y solo si la
  empresa sigue con `plan_id IS NULL` y el plan sigue existiendo, repone:
  - `plan_id` (el `plan_id` de la fila);
  - `plan_ciclo_ancla_at` (`cambios->'empresa'->'antes'->>'ancla'`);
  - `plan_ciclo_corto_desde_at` (`cambios->'empresa'->'antes'->>'cortoDesde'`).

  Después borra esas filas. Lo que no puede reponer, lo dice la cabecera.
- **Multi-empresa.** La migración corre como dueño. `organizacion` y `plan_rastro` siguen igual de
  cerradas para `servi_app`.

**Orden de bajada:** M4 → M3 → M2 → M1, el inverso de la subida. M3 baja primero porque su cuerpo nombra
`'plan'::cobro_plataforma_fuente`.

### 2.4 Prisma (`db/schema.prisma`)

- `Plan.costoPorOrden Decimal? @map("costo_por_orden") @db.Decimal(12, 2)`, con el comentario del `CHECK`.
- `enum CobroPlataformaFuente` gana `plan`.
- El comentario de `PlanTopeRol` pasa a nombrar los cuatro roles.
- El diff de drift tiene que salir vacío.

### 2.5 Datos que dependen del país

- **Moneda.** Igual que SL-24 §2.9 y SL-40 §7: los importes se guardan sin moneda.
  - Las pantallas de plan pintan los importes sin símbolo, como `textoDelPrecio`.
  - La wallet pinta la deuda con `money`, como ya lo hace.
  - El formato de los importes en los campos es de SLT-67 y queda fuera de esta ficha.
- **Impuestos.** No hay (SL-40 P2).
- **Geografía y métodos de pago.** No aplican.

## 3. El cobro (R12–R17)

### 3.1 Por qué en la base

Es el mismo argumento de SL-40 §2.2: toda vía de alta acaba en el `INSERT` del trigger. Si el escalón
del plan estuviera en TS, habría que enchufarlo en cada vía, y la empresa podría crear órdenes por SQL a
mano con la tarifa vieja.

### 3.2 Una sola definición de la tarifa vigente

El trigger, «Mi plan» y el detalle del superadmin leen la misma `cobro_plataforma_tarifa_de`. Así el
costo que la pantalla dice es el que el próximo cargo usará (R18 con P1). Lo afirma un test que, para
cada fuente, compara el `costo_vigente` de la lectura con el cargo de una orden creada justo después
(§9.1).

### 3.3 Concurrencia

- La función lee `organizacion` y `plan` sin cerrojo. Bajo `READ COMMITTED`, una orden concurrente
  con una edición del plan se carga con la versión confirmada en el instante de la sentencia, vieja o
  nueva.
- El cargo queda congelado igual (R15). Ninguna decisión pide más precisión que «el costo al crearla».
- No se añade cerrojo, para no alargar los de SL-24 §4.4.

### 3.4 Ejemplo numérico (el del test de integración)

Partida: global 500,00. A tiene el plan P con costo por orden 100,00. B tiene P y una excepción de 80,00.
C tiene el plan Q, sin costo por orden. D no tiene plan.

| Paso | Cargo nuevo | Fuente |
|---|---|---|
| A crea o1 | 100,00 | `plan` |
| B crea p1 | 80,00 | `empresa` |
| C crea q1 | 500,00 | `global` |
| D crea d1 | 500,00 | `global` |
| P pasa a 120,00 (edición inmediata); A crea o2 | 120,00; o1 sigue en 100,00 | `plan` |
| A elimina o1 | reverso de 100,00 | `plan` |
| A recupera o1 | cargo de 100,00 (no 120,00) | `plan` |
| Se asigna Q a A; A crea o3 | 500,00 | `global` |
| Se borra el global; C crea q2 | 0,00 | `sin_configurar` |
| P con descuento anual del 20 % y base negociable; B quita la excepción y crea p2 | 120,00 | `plan` |

## 4. Capas

### 4.1 Tipos (`lib/types/planes.ts`)

```ts
export const ROLES_CON_TOPE = ["admin", "mensajero", "adminTienda", "adminSatelite"] as const; // R1
// crearPlanSchema y editarPlanSchema (y con ello versionPlanSchema) ganan:
costoPorOrden: montoCobroSchema.nullable(),                 // R7, R8; null = vacío
export type VersionPlan = Pick<EditarPlanInput, "nombre" | "topes" | "modulos" | "precio" | "costoPorOrden">;
export type PlanDTO = { /* … */ costoPorOrden: string | null };
```

- **`porRol.maestro` es `validation_error`.** Lo hace el `partialRecord` con las claves cerradas
  (R1, como `apiKey` en SL-24 R25).
- **`costoPorOrden` es obligatorio en la entrada** (`null` para vacío): un formulario viejo que no lo
  mande da `validation_error`, no un borrado silencioso. Las versiones pendientes lo traen gracias a M1.
- **`TopeExcedido.tope` y `UsoDelPlan.porRol`** pierden `maestro` por tipo, sin tocarlos.

### 4.2 Escritura del plan (`PlanesRepository`, `PlanesService`)

- `crear` y `aplicarVersion` escriben `costoPorOrden` (texto, como los demás importes). `aDTO` lo lee con
  `toFixed(2)`.
- `filasDeTopes` ya recorre `ROLES_CON_TOPE`: no escribe ningún tope de maestro.
- `diferenciasDelPlan` (`lib/planes/rastro.ts`) gana el campo `costoPorOrden`, con importe canónico
  (`"100"` y `"100.00"` son el mismo). Con eso:
  - la edición inmediata y la programada escriben su diff;
  - una edición sin cambios no escribe nada;
  - el correo de SL-24 R41 lleva la línea (R11).
- `PlanesService` no cambia de orden: quién → zod → existe → reglas → repositorio. La autorización
  sigue en el servicio (R11).

### 4.2.1 Solo planes con costo concreto (R28–R30)

- **Predicado.** `tieneCostoConcreto(plan: PlanDTO | VersionPlan)` en `lib/planes/costo-concreto.ts`
  (nuevo, puro, sin base ni `Prisma`, para que lo importen los componentes cliente; `costeo.ts` sí usa
  `Prisma.Decimal`). Es `precio.tipo === "monto" && costoPorOrden !== null`. El mensual `"0.00"` y el costo
  `"0.00"` son concretos: el predicado no mira el importe, solo la forma. Lo leen el servicio, la pantalla
  (para el aviso de R20) y los tests.
- **Pendiente.** `asignar` y la vista previa también rechazan si `repo.detalle(planId).pendiente` tiene
  una versión sin costo concreto (R28). Así no hace falta mirar nada al aplicar un cambio programado.
- **`asignar`.** Después de `reglasDeAsignar` y de la comprobación «mismo plan → `ok` sin cambio»
  (SL-24 R13, que sigue primero): si `!tieneCostoConcreto(plan)` → `{ estado: "plan_sin_costo" }`, sin
  llamar a `repo.asignar`. Para eso, `reglasDeAsignar` devuelve también el `plan` que ya lee.
- **`previsualizarAsignacion`.** La misma regla, después de `reglasDeAsignar`. La pantalla no deja
  confirmar lo que `asignar` rechazaría (SLT-58 §11.4).
- **`asignables`.** Filtra en el servicio el resultado de `repo.asignables` con el predicado (R29).
- **`editar`, `programarCambio` y `archivar` no cambian** (R30, P5 cerrada). Un plan asignado puede
  quedar sin costo concreto. Las pantallas lo pintan como dice R20.
- **Por qué en el servicio y no en `PlanesRepository` ni en la base:**
  - es una regla de la asignación, no un invariante del dato. R30 permite que un plan asignado quede sin
    costo concreto, así que un `CHECK` o un trigger lo contradirían;
  - los ayudantes de test de SL-24 y el E2E (`tests/integration/db/_fixtures/planes.ts`,
    `e2e/_planes-fixture.ts`) asignan planes sin precio con el repositorio real. Con la regla en el
    servicio siguen sirviendo sin tocarlos (R27).
- **Carrera aceptada.** Entre la comprobación del servicio y el cerrojo del repositorio puede colarse una
  edición. El resultado es el mismo que editar justo después de asignar, que R30 permite.

### 4.3 Lecturas

| Pieza | Cambio |
|---|---|
| `usoDe` (`PlanesRepository`) | Quita la columna `maestro` y su entrada en `COLUMNA_DEL_ROL` |
| `PlanesRepository.planDeEmpresa` | Lee además `SELECT "monto"::text, "fuente" FROM cobro_plataforma_tarifa_de(${organizacionId})` en la misma `comoPlataforma` y lo pasa como `costoVigente` |
| `MiPlanRepository` | El esquema zod quita `uso.maestro` y suma `costo_por_orden: importe` y `costo_vigente: { monto: z.string(), fuente: z.enum(["empresa","plan","global","sin_configurar"]) }` |
| `lib/planes/consumo.ts > PlanConUsoLeido` | Suma `costoVigente: { monto: string; fuente: FuenteDelCosto }`. `planConConsumo` añade `costeo: costeoDelCiclo(vigente.precio, costoVigente, uso.ordenes)` |
| `lib/planes/costeo.ts` (nuevo, solo servidor) | `costeoDelCiclo(precio, costoVigente, ordenes): CosteoDelCiclo`, puro, con `Prisma.Decimal` dentro y texto con dos decimales fuera (patrón de `lib/utils/deuda-plataforma.ts`) |

```ts
// lib/types/consumo-plan.ts
export type FuenteDelCosto = "empresa" | "plan" | "global" | "sin_configurar";
export type CosteoDelCiclo = {
  base: { tipo: "monto"; mensual: string } | { tipo: "por_definir" }; // "0.00" es monto (R20)
  costoPorOrden: string;          // siempre el vigente (R12, P1): excepción > plan > global > 0
  fuente: FuenteDelCosto;
  ordenes: number;                // órdenes del ciclo (= uso.ordenes)
  subtotalOrdenes: string;        // ordenes × costoPorOrden
  total: string | null;           // base + subtotal; null solo si la base está por definir (R19, R20)
  sinCostoConcreto: boolean;      // base no «monto» o plan sin costo por orden: aviso del superadmin (R20)
  anualNoAplicaAlCosto: boolean;  // R10: el plan tiene anual fijo o descuento
};
export type PlanConConsumo = { /* lo de SLT-58 */ costeo: CosteoDelCiclo };
```

- **`ordenes` sale del mismo `uso.ordenes`** que la fila de consumo: misma cuenta que el tope (glosario,
  D3, D6).
- **El descuento no entra** en `total` (R19). Solo enciende `anualNoAplicaAlCosto` (R10).
- **`MiPlanService.ver`** no cambia de autorización: `ROLES_MI_PLAN` antes del repositorio (SLT-58 R8).

### 4.4 Textos (`lib/planes/mensajes.ts`)

| Clave o función | Texto |
|---|---|
| `textoDelPrecio` | Sin cambios (`50000.00 al mes`, `negociable`, `sin precio`) |
| `textoDelCostoPorOrden(c: string \| null)` | `«{c} por orden»`; `null` → `«se aplica el valor global»` |
| `lineasDeCambioDelPlan` | La línea `Precio: A → B` pasa a `Costo base: A → B` (R9). Línea nueva `Costo por orden: A → B`, con `textoDelCostoPorOrden` |

## 5. Autorización

| Operación | Quién | Dónde | R |
|---|---|---|---|
| Crear, editar o programar el costo por orden | superadmin (`esPlataforma`) | `PlanesService`, antes del repositorio | R11 |
| Leer su costeo | `maestro` y `admin` de la empresa | `MiPlanService` (`ROLES_MI_PLAN`) y la base (`plan_de_la_empresa`, `42501`) | R22 |
| Leer el costeo de una empresa | superadmin | `PlanesService.planDeEmpresa` | R18 |
| Escribir un cargo | nadie desde la app | trigger, `REVOKE` (SL-40 R8) | R12 |

No hay módulo que encender: planes y cobro son núcleo.

## 6. Pantallas

### 6.1 `PlanForm.tsx` (R5, R9, R10, R23)

- **El primer paso de la tanda D es el merge de `dev`** si el PR #51 (SLT-67) ya entró: los dos
  tocan este archivo.
- **Los topes por rol** recorren `ROLES_CON_TOPE`, así que el campo del maestro desaparece solo.
- **El grupo «Precio informativo»** pasa a «Costo base». Las opciones no cambian, salvo el rótulo
  «Mensual», que pasa a «Costo base mensual».
- **Campo nuevo «Costo por orden»**, después del grupo de costo base y fuera de él, porque es
  independiente de su forma (R7):
  - es el mismo control de importe que el mensual (`MontoInput` si #51 entró);
  - lleva la ayuda «Vacío: se aplica el valor global de la plataforma.»;
  - va bajo `idDe("costoPorOrden")`, para que `fieldErrors.costoPorOrden` salga junto al campo (R23).
- **La descripción del `Sheet`** pasa a «Los topes vacíos no tienen límite. El costo base es
  informativo; el costo por orden se cobra en cada orden nueva.».

### 6.2 Catálogo, detalle y modal (R24)

- **`plan-vista.ts`** gana `lineasDeCosto(plan)`. Devuelve:
  - `«Costo base: {textoDelPrecio}»`;
  - `«Costo por orden: {textoDelCostoPorOrden}»`;
  - con anual fijo o descuento, `«El pago anual no cambia el costo por orden.»` (R10).
- **`PlanesModule.tsx`** (catálogo): la columna «Precio» pasa a «Costo» y pinta las dos primeras líneas.
- **`PlanDetalle.tsx`**:
  - el `Dato` «Precio informativo» pasa a «Costo base»;
  - un `Dato` nuevo, «Costo por orden»;
  - las líneas de alta y de edición del rastro suman el costo.
- **`PlanEmpresa.tsx`** (modal de primera asignación y de cambio de plan): `[...lineasDeTopes, ...lineasDeCosto, módulos]`.

### 6.3 `ConsumoDelPlan.tsx` («Mi plan» y detalle de empresa; R18–R20)

Bajo el nombre, en lugar de «Precio informativo: …», un bloque «Costo del ciclo». Las líneas dependen de
la fuente y de la base:

| Situación | Líneas |
|---|---|
| Base con monto (el caso normal: R28 lo garantiza en toda asignación nueva) | «Costo base: 50000.00 al mes» · «Costo por orden: 100.00» + nota de fuente (P1) · «Órdenes del ciclo: 3 × 100.00 = 300.00» · **«Total estimado del ciclo: 50300.00»** |
| Base 0 | «Costo base: 0.00 al mes» · igual · **«Total estimado del ciclo: 300.00»** |
| Plan asignado sin costo por orden y empresa sin excepción (R20) | Igual que «base con monto», con el global como costo por orden y **sin nota**; hay total. En el detalle del superadmin, además el aviso «Plan sin costo concreto» |
| Plan asignado cuya base dejó de ser «monto» (R20, R30) | «Costo base: por definir» · costo por orden vigente · órdenes con subtotal · sin total. En el detalle del superadmin, además el aviso «Plan sin costo concreto» |
| Anual fijo o descuento | Más «El pago anual no cambia el costo por orden.» |

- **Nota de fuente** (P1, cerrada):
  - `empresa` → «precio acordado para tu empresa» (en el detalle del superadmin, «excepción de la
    empresa»);
  - `plan` → ninguna;
  - `global` y `sin_configurar` → el importe vigente, sin nota (decisión del 2026-10-31).
- **Debajo**, en `text-xs text-muted-foreground`: «Estimado: el costo base no se cobra todavía; cada
  orden se cobra al crearla y se descuenta si se anula.» (R21).
- **Los importes** se pintan como `textoDelPrecio` (texto de la base, sin símbolo ni `Number`). Su
  formato es de SLT-67 y de D33.
- **Sin plan** sigue igual: «Tu empresa no tiene plan asignado: sin límites».

### 6.4 Listado de «Empresas»: cobro vigente (R31, P3 cerrada) y columna «Plan» (R32)

**Lectura** (la del listado de `EmpresasPlataformaRepository`, la que hoy selecciona
`cobroPlataformaPorOrden` y completa `cuentasConLaPlataforma`, en el mismo `comoPlataforma`):

- el `select` de `organizacion` suma `plan: { select: { id: true, nombre: true } }`;
- una sola consulta más para todas las filas:
  `SELECT o."id", t."monto"::text AS "monto", t."fuente" FROM "organizacion" o CROSS JOIN LATERAL cobro_plataforma_tarifa_de(o."id") t WHERE o."id" = ANY(${ids})`.

  No se hace una por fila, y se usa la misma definición de la tarifa que el trigger (§3.2).

**Tipo** (`lib/types/empresas-plataforma.ts`). `EmpresaListada` gana:

- `cobroVigente: { monto: string; fuente: FuenteDelCosto }`;
- `plan: { id: string; nombre: string } | null`.

`cobroPorOrden`, la excepción, se queda: lo sigue usando la edición de la celda.

**Pantalla** (`EmpresasModule.tsx`):

- **`CeldaCobroEmpresa`** pinta `cobroVigente.monto` con su etiqueta:
  - `empresa` → «propio»;
  - `plan` → «del plan»;
  - `global` y `sin_configurar` → «global».

  Deja de derivar `cobroPorOrden ?? global ?? "0.00"` en la pantalla. «Cambiar» y «Usar el global» no
  cambian: siguen editando la excepción. «Usar el global» conserva su rótulo de SL-40. Si la empresa
  tiene plan con costo, quitar la excepción la deja en «del plan»: el `router.refresh()` lo pinta.
- **Columna «Plan»** nueva, entre «Nombre» y la del enlace. Pinta el nombre del plan, o «Sin plan» en
  `text-muted-foreground`. Debajo, un `Link` con el rótulo «Asignar plan» (sin plan) o «Cambiar plan»
  (con plan), con nombre accesible «Asignar plan a {empresa}» o «Cambiar el plan de {empresa}», y
  `href={`/plataforma/empresas/${id}#plan`}`.
- **Enlace del detalle:** la columna «Módulos» pasa a «Plan y módulos». El enlace dice «Plan y módulos» y
  su nombre accesible es «Plan y módulos de {empresa}».

**Destino** (`PlanEmpresa.tsx`): la `<section>` gana `id="plan"`, para que el ancla lleve al bloque y el
navegador haga el scroll. El flujo de asignación es el de SLT-58, sin cambios: `Select`, «Asignar plan»
o «Cambiar plan», modal, fecha en la primera asignación y avisos.

**Por qué un enlace al bloque y no el modal dentro del listado:**

- el modal de SLT-58 necesita datos que solo carga la página de detalle: la lista de planes asignables,
  `rangoInicioCiclo` calculado en el servidor, la vista previa y el plan actual con su consumo;
- montarlo en el listado cargaría esos datos para cada fila, o duplicaría el componente;
- el enlace lleva al mismo flujo con un clic (alternativa 8 de §11).

### 6.5 Rechazo `plan_sin_costo` en el modal (R28, R29)

- **`PlanEmpresa`** suma el texto de rechazo `plan_sin_costo` a su tabla `RECHAZOS`. Es el texto de
  R28.
- **El `Select`** ya solo trae los asignables (R29), así que el rechazo llega en la práctica solo si se
  pierde una carrera. Si la lista está vacía, pinta «No hay planes con costo concreto para esta
  empresa. Crea un custom con sus precios en «Planes».», con enlace a `/plataforma/planes`.
- **Aviso R20.** Si el plan actual de la empresa no tiene costo concreto, el bloque muestra «Plan sin costo
  concreto: complétalo en «Planes» o asígnale otro con costo base y costo por orden.».

### 6.6 «Asignar a una empresa» desde el detalle del plan (R33, aprobado)

- **Datos.** La página `[planId]/page.tsx` ya lee `detallePlan`. Le suma
  `listarEmpresasPlataforma` (ya existe, SLT-58 §6.3), filtrada así:
  - un público: las empresas cuyo `plan?.id !== planId`;
  - un custom: solo `organizacionId`, si no lo tiene ya.
- **`PlanDetalle.tsx`.** Pinta un `Select` «Empresa» y un `Link` «Asignar a una empresa» hacia
  `/plataforma/empresas/{id}?plan={planId}#plan`. Solo aparecen si el plan no está archivado y
  `tieneCostoConcreto`. Si no tiene costo concreto, en su lugar pinta «Para asignarlo, dale costo base
  mensual y costo por orden.».
- **`PlanEmpresa.tsx`.** Lee la prop `planPreseleccionado`, que la página saca de `searchParams.plan` y
  valida contra la lista de asignables; si no está en la lista, se ignora. Con ella, el `Select` arranca
  con ese plan. Confirmar es el flujo de siempre: nada se asigna sin el clic y el modal.
- **Va en T22**, obligatoria desde la aprobación del 2026-10-31.
- **`PlanDetalle`** también traduce la acción `desasignado` del rastro (§2.3 bis).

## 7. Contratos de entrada y salida

- **Entrada del superadmin.** `crearPlanAction`, `editarPlanAction` (inmediata o programada) y
  `asignarPlanAction`/`previsualizarAsignacionPlanAction` mantienen su firma (`input: unknown`). Las
  dos primeras exigen `costoPorOrden: string | null`.
- **`PlanResult` y `VistaPreviaAsignacionResult`** ganan una sola variante, `{ estado: "plan_sin_costo" }`
  (R28). Las pantallas que hacen `switch` sobre `PlanResult` (`PlanEmpresa`, `PlanForm` y
  `PlanDetalle`) la añaden a su tabla de rechazos. El typecheck las señala si el `switch` es exhaustivo.
- **El error del campo** va en `validation_error.fieldErrors.costoPorOrden` (R8). Un tope de maestro sale
  en `fieldErrors["topes.porRol"]`, con la clave que zod produzca: el test afirma `validation_error` y que
  no se escribe (R1).
- **`PlanDTO`, `PlanDelCatalogo` y `DetallePlan`** llevan `costoPorOrden`.
- **`PlanConConsumo`** lleva `costeo` (§4.3).
- **`EmpresaListada`** lleva `cobroVigente` y `plan` (§6.4).

## 8. Lo que NO cambia

- Los triggers de tope de SL-24: `plan_tope_ordenes`, `plan_tope_usuario`, `plan_tope_api_key`, sus
  `WHEN` y sus cerrojos (R2, R3, R6). R3 sale por construcción: sin fila de tope de `maestro`, el
  trigger de usuario no cuenta, y el `CHECK` impide que vuelva a haber una.
- El trigger de borrado de SL-40, la deuda (`derivarDeudaPlataforma`), la wallet y `CajaResumenCard`
  (R17).
- `plan_cupo_ordenes`, `plan_inicio_ciclo*` y la asignación con fecha de SLT-58.

## 9. Tests

### 9.1 Nuevos

| Archivo | Tipo | Cubre |
|---|---|---|
| `tests/integration/db/plan-maestro-sin-tope.test.ts` | integración | R1 (`INSERT` de tope `maestro` → `23514`), R2 (tope de `admin` sigue rechazando), R3 (empresa con todos los roles en su tope: crear, activar, aprobar postulación y cambiar a `maestro` entran; ningún uso cambia), R6 (tope de órdenes y de keys siguen rechazando). Control de no vacuidad: el trigger de usuario está en `pg_trigger` |
| `tests/integration/db/migracion-slt66-ida-y-vuelta.test.ts` | integración (base propia, `aplicarMigracionesHasta`) | R4: siembra antes de M1 un plan con topes de `maestro` y `admin` y un pendiente con `porRol.maestro`. Tras M1: sin fila de maestro, `admin` intacto, versión sin `maestro` y con `costoPorOrden: null`, rastro y asignación iguales. R25: con M1–M3, una orden con plan de 100 → cargo `plan`; el `down.sql` de M2 con ese cargo → error y nada cambia; borrado el cargo de prueba (como dueño), bajar M3–M1 → la orden nueva carga el global y fuente `global` |
| `tests/integration/db/cobro-plataforma-plan.test.ts` | integración (Postgres real, `OrdenRepository` real) | R12–R16 con los pasos de §3.4, fila a fila (`tipo`, `monto`, `fuente`, `secuencia`); creación por `createManyOrdenes` y `createManyOrdenesConGuia`; plan archivado (R13); plan con descuento y base negociable (R14); cambio programado aplicado con `aplicarCambioProgramado` (R15). Control de no vacuidad: la función y el trigger existen |
| `tests/integration/db/plan-de-la-empresa-costeo.test.ts` | integración | R18, R22: `costo_vigente` por fuente, comparado con el cargo de una orden creada justo después (§3.2); `uso` sin `maestro`; con el contexto de B pedir A → `42501`; `servi_app` sobre `cobro_plataforma_tarifa_de` → `42501` (sin `GRANT`); `SELECT` de `plan` y `cobro_plataforma_tarifa` → `42501` |
| `tests/integration/db/deuda-plataforma-plan.test.ts` | integración (molde `caja-459`) | R17, R21: dos órdenes con plan de 100 y una anulada → Δdeuda `"100.00"`; caja igual campo a campo; leer `MiPlanService.ver` no crea filas en `cobro_plataforma_movimiento` ni en `wallet_movimiento` |
| `tests/unit/planes/costeo.test.ts` | unit | R19, R20: monto → total; sin precio y negociable → `por_definir` sin total, con subtotal; cero órdenes; decimales (`0.10 × 3`); importes grandes (`DECIMAL(12,2)`); con descuento, el total es el mismo que sin él (R10). Ningún `Number(` ni `parseFloat` sobre importes. También `tieneCostoConcreto` con las cinco formas × costo nulo o no |
| `tests/unit/services/planes-service-asignar-costo.test.ts` | unit (doble del repositorio) | R28: con plan sin precio, negociable, o monto sin costo → `plan_sin_costo` y `repo.asignar` no se llama, también con fecha; base `"0.00"` y costo `"0.00"` → `ok`; plan concreto con pendiente negociable → `plan_sin_costo`; mismo plan ya asignado → `ok` sin cambio; `previsualizarAsignacion` → `plan_sin_costo` sin `repo.vistaPreviaAsignacion`. R29: `asignables` filtra. R30: editar y programar a negociable, o vaciar el costo, de un plan con empresas → `ok` y se llama al repositorio |
| `tests/integration/db/migracion-slt66-desasignar.test.ts` | integración (base propia, `aplicarMigracionesHasta` hasta M3) | R34: siembra empresas con un plan sin precio (con ciclo corto), negociable, de base «monto» y de base `0.00`, y una empresa sin plan. Tras M4: las cuatro con plan quedan sin plan, con ancla y ciclo corto `NULL` y los módulos iguales; una fila `desasignado` por cada una, con `cambios.empresa.antes` exacto y el actor de sistema; la empresa sin plan, intacta. El `down.sql` de M4 repone las dos y borra sus filas; si una ya recibió otro plan, no la toca. El `down.sql` del valor `desasignado` se niega si quedan filas |
| `tests/components/PlanDetalleDesasignado.test.tsx` | componente | R34: la fila `desasignado` del rastro se traduce con la empresa |
| `tests/integration/db/empresas-plataforma-plan.test.ts` | integración | R31, R32: el listado trae `plan` (o `null`) y `cobroVigente` con las cuatro fuentes; `cobroVigente` coincide con el cargo de una orden creada después (misma función) |
| `tests/components/EmpresasModulePlan.test.tsx` | componente | R31: «propio», «del plan» y «global» con su importe. R32: columna «Plan» con nombre o «Sin plan»; «Asignar plan a {empresa}» / «Cambiar el plan de {empresa}» con `href` `…/{id}#plan`; enlace «Plan y módulos de {empresa}» |
| `tests/components/PlanEmpresaSinCosto.test.tsx` | componente | R28: rechazo `plan_sin_costo` con su texto. R29: lista vacía → texto y enlace a «Planes». R20: aviso «Plan sin costo base concreto». La `section` lleva `id="plan"`. R33: `planPreseleccionado` válido arranca elegido; uno ajeno se ignora |
| `tests/components/PlanDetalleAsignar.test.tsx` | componente | R33: «Asignar a una empresa» con las empresas candidatas (público y custom) y su `href`; ausente si está archivado; texto de «dale costo…» sin costo concreto |
| `tests/unit/types/planes-schema-costeo.test.ts` | unit | R1 (`porRol.maestro` → error), R7 (con las tres formas de base), R8 (negativo, tres decimales, número, vacío = `null`, clave ausente → error) |
| `tests/unit/planes/rastro-costeo.test.ts` | unit | R11: diff de `costoPorOrden` (`"100"` = `"100.00"` sin cambio), línea `Costo por orden: …`, `Costo base: …` |
| `tests/unit/services/planes-service-costeo.test.ts` | unit | R11: cada rol de empresa → `forbidden` con cero llamadas al repositorio; `validation_error` de R1 y R8 sin llamadas |
| `tests/integration/db/planes-costeo-escritura.test.ts` | integración | R11: crear, editar de inmediato y programar con costo; `plan_rastro` con antes y después en texto; edición sin cambio → sin fila; aplicar el programado deja la columna |
| `tests/components/ConsumoDelPlanCosteo.test.tsx` | componente | R18–R21, R10, R5 (ninguna fila «Maestro») |
| `tests/components/PlanFormCosteo.test.tsx` | componente | R5, R9, R23: sin campo de maestro, «Costo base», «Costo por orden», error junto al campo, conserva lo escrito |
| `tests/components/PlanVistaCosteo.test.tsx` | componente | R24: catálogo, detalle y modal (primera asignación y cambio) con las líneas de costo y «se aplica el valor global» |
| `e2e/planes-costeo.spec.ts` | E2E | R26 (§9.2) |

### 9.2 E2E (R26)

`e2e/planes-costeo.spec.ts`, en serie, con `_superadmin-fixture.ts` y `_dos-empresas-fixture.ts`, en el
proyecto `aislamiento`, como `cobro-plataforma-sl40.spec.ts`:

1. **`beforeAll`:**
   - guarda el valor global y lo fija en 500,00 con `clienteDueno`. Así el caso prueba que el plan gana
     al global;
   - da de alta la empresa A (`altaDeEmpresa`) con su caja (`sembrarCaja`, para que se pinte la región).
2. **El superadmin entra con OTP** (`conCandadoDelSuperadmin`) y, en `/plataforma/planes`, crea por
   `PlanForm` el custom «Plan E2E costeo» de A. Lleva costo base mensual 50000 y costo por orden 100.
   Para asignarlo (R32), en `/plataforma/empresas`:
   - la fila de A dice «Sin plan»;
   - pulsa «Asignar plan a {A}» y llega al bloque «Plan» del detalle (la URL acaba en `#plan`);
   - completa el modal de SLT-58 con la fecha de hoy;
   - de vuelta al listado, la fila de A dice «Plan E2E costeo», «Cambiar plan», y en «Cobro por orden»,
     «100.00 del plan» (R31).
3. **El maestro de A abre `/wallet`:** la región `deuda_plataforma` dice «₡0».
4. **A crea una orden** con su sesión por `page.request.post("/api/ordenes/carga-masiva/chunk")` (precedente
   SL-24 §11.1).
5. **`/wallet` dice «₡100»**: es lo que pinta `money`, escrito a mano y no derivado.
6. **`/mi-plan`** muestra «Costo por orden: 100.00», «Órdenes del ciclo: 1 × 100.00 = 100.00» y «Total
   estimado del ciclo: 50100.00». Los literales son los que pinte la implementación con el formato
   vigente; si SLT-67 ya cambió el formato, se escriben con él.
7. **Por detrás** (`clienteDueno`): un único movimiento de la orden, `cargo 100.00 plan`.
8. **`afterAll`:** devuelve el global a lo que había.

### 9.3 Tests existentes que cambian

Cada cambio lleva un comentario que cita SLT-66 y el R que lo obliga. Fuera de esta lista, ningún test de
SL-24, SL-40 ni SLT-58 se toca (R27). Si al implementar aparece otro, se para y se pregunta.

| Archivo | Caso | Por qué |
|---|---|---|
| `tests/integration/db/planes-catalogo.test.ts:279-313` | «R25 — el tope por rol admite los cinco roles…» | `maestro` pasa a `23514`; el `UPDATE … rol = 'maestro'` usa `admin`; `guardados` sin `maestro` (R1) |
| `tests/integration/db/plan-topes-usuarios.test.ts:251-` | «R25: crear una API key no mueve ningún uso de rol…» | El plan ya no puede llevar tope de `maestro`: el rechazo se prueba con `admin`. El caso «crear maestro al tope» se mueve a `plan-maestro-sin-tope` como aceptación (R3) |
| `tests/unit/types/planes-schema.test.ts:132` | topes con los cinco roles | Sin `maestro` (R1) y con `costoPorOrden: null` |
| `tests/unit/planes/consumo.test.ts:69` | `porRol` con `maestro` | R5 |
| `tests/components/ConsumoDelPlan.test.tsx:26` | fila `maestro` | R5 |
| `tests/components/MiPlanModule.test.tsx:36, :55, :72, :117` | `porRol.maestro`; «Precio informativo»; tres «sin límite» | R5 (dos «sin límite»), R9 («Costo base») |
| `tests/components/PlanEmpresa.test.tsx:42, :364` | `porRol.maestro`; línea `Precio:` | R5, R9 |
| `tests/components/PlanForm.test.tsx:325` | radiogroup «Precio informativo» | R9 |
| `tests/components/PlanDetalle.test.tsx:140` | «Precio: 10.00 al mes» | R9 |
| `tests/unit/services/mi-plan-service.test.ts:43, :98, :129` | `porRol.maestro`; fila maestro `sin_limite`; `Precio:` | R5, R9 |
| `tests/unit/services/planes-service-lecturas.test.ts:99, :246` | `porRol.maestro`; claves de filas | R5 |
| `tests/unit/services/email/plantilla-cambio-plan.test.ts:58` | «Precio: …» | R9 |
| `tests/integration/db/mi-plan-repository.test.ts:38, :84, :92` | plan con tope `maestro: 2`; `uso.maestro` | R1, R5 |
| `tests/integration/db/plan-de-la-empresa.test.ts:60, :123, :178, :194` | tope y uso de `maestro` | R1, R5 |
| `tests/integration/db/planes-lecturas-plataforma.test.ts:193` | `porRol.maestro` | R5 |
| `e2e/planes-superadmin.spec.ts:262-263` | «1 Maestro · sin límite» | R5: la aserción pasa a que «Maestro» **no** aparece |
| Fixtures de tests que construyen `PlanDTO`/`VersionPlan`/`CrearPlanInput` a mano | — | Suman `costoPorOrden: null`. Solo por tipo: el typecheck los señala |
| `tests/unit/services/planes-service.test.ts:31, :50` (y los casos de `asignar` de :284–:330) | el plan doble que se asigna es `sin_precio` | R28: el doble que se asigna pasa a `{ tipo: "monto", mensual: "1000.00", anual: null }` con `costoPorOrden: "100.00"`. Lo que afirman esos casos no cambia |
| `tests/unit/services/planes-service-inicio-ciclo.test.ts:36` | ídem | R28, el mismo cambio del doble |
| `tests/components/EmpresasModuleCobro.test.tsx:135-149` | «propio» y «global» derivados en la pantalla | R31: las filas de prueba llevan `cobroVigente`; las etiquetas «propio» y «global» se conservan |
| `tests/integration/empresas-page.test.tsx:211, :215` | enlace «Módulos de {empresa}» | R32: «Plan y módulos de {empresa}», mismo `href` |
| `e2e/_superadmin-fixture.ts:301` | el ayudante abre «Módulos de {empresa}» | R32: el nombre del enlace. El ayudante lo usan los E2E de SL-23 |
| `e2e/planes-superadmin.spec.ts:169` | el plan E2E se crea «Sin precio» y luego se asigna | R28: se crea «Con monto» y con costo por orden. El resto del recorrido no cambia |

**SL-40.** `cobro-plataforma-cargos.test.ts` y `migracion-sl40-ida-y-vuelta.test.ts` no cambian. Sus
empresas no tienen plan, así que la regla es la de antes (R12, pasos 1, 3 y 4). El segundo usa una base
propia hasta SL-40. `e2e/cobro-plataforma-sl40.spec.ts:294` («propio») no cambia: la etiqueta se
conserva.

**SL-24.** Los ayudantes que asignan con el repositorio real (`tests/integration/db/_fixtures/planes.ts`,
`e2e/_planes-fixture.ts`) no cambian: R28 vive en el servicio (§4.2.1).

### 9.4 Mutaciones que deben matar los tests (medidas en `progress/impl_SLT-66.md`)

1. `cobro_plataforma_tarifa_de` mira el plan antes que la excepción.
2. Ignora el plan (vuelve a `excepción ?? global`).
3. Lee `costo_por_orden` del plan sin `LEFT JOIN` (una empresa sin plan pierde el global).
4. El `CHECK` de `plan_tope_rol` vuelve a admitir `maestro`.
5. `costeoDelCiclo` aplica el descuento anual al total.
6. `plan_de_la_empresa` calcula su costo con una regla propia en vez de llamar a la función (el test
   de §3.2 lo detecta cuando hay excepción).
7. `asignar` deja de comprobar `tieneCostoConcreto`, o solo lo comprueba sin fecha.
8. `asignables` no filtra.
9. `tieneCostoConcreto` trata `"0.00"` como vacío.
10. `costeoDelCiclo` da un total con la base «por definir», o no lo da con plan sin costo por orden y
    el global vigente.
11. M4 deja sin desasignar a las empresas cuyo plan es de base «monto».

## 10. Choques con ramas en vuelo

| Archivo | Rama | Cómo se resuelve |
|---|---|---|
| `app/(app)/plataforma/planes/_components/PlanForm.tsx`, `tests/components/PlanForm.test.tsx` | SLT-67 (PR #51, de la misma persona) | La tanda D empieza con un merge de `dev` si #51 ya entró. Si no, quien mergee segundo rebasa. `MontoInput` se usa si existe |
| `db/schema.prisma`, orden de migraciones | cualquiera con migración | T0 lo comprueba contra `dev` |
| `lib/repositories/EmpresasPlataformaRepository.ts`, `EmpresasModule.tsx`, `e2e/_superadmin-fixture.ts` | ninguna conocida | Entran por R31 y R32. `archivos-en-vuelo.mjs` lo confirma al publicar el `tasks.md` |
| `db/schema.prisma` | SLT-56, SLT-64 | Choque aceptado por el humano el 2026-10-31. Quien mergea segundo rebasa |

## 11. Alternativas descartadas

1. **Resolver el costo del plan en TS** (en `BulkOrdenService` o en un servicio de cobro). Haría falta
   enganchar cada vía de alta, y la orden por SQL a mano escaparía. Además, «Mi plan» y el trigger
   tendrían dos definiciones de la tarifa que pueden separarse. Es el mismo argumento de SL-40 §12.2.
2. **Renombrar `precio_mensual` a `costo_base_mensual`.** Toca el `CHECK plan_precio_forma`, el rastro
   histórico (cuya clave es `precio`), las versiones pendientes, los correos y una treintena de tests,
   sin cambiar el comportamiento. La decisión es de vocabulario, y basta con cambiar el rótulo.
3. **Meter el costo por orden dentro de `PrecioPlan`** (`{ tipo: "monto"; mensual; anual; porOrden }`).
   El costo por orden es independiente de la forma de la base (decisión «negociable con costo por
   orden»). Dentro del tipo `monto` no cabría con «negociable» ni con «sin precio», y habría que tocar
   las cinco formas del `CHECK`.
4. **Dejar el tope de maestro en la base y solo ocultarlo en la UI.** La decisión dice «la base no lo
   cuenta». Una fila vieja seguiría frenando altas de maestros sin que nadie la vea en pantalla.
5. **Cambiar el trigger `plan_tope_usuario` para que ignore `maestro`** en vez de quitar la fila y
   cerrar el `CHECK`. Habría dos sitios que dicen lo mismo, y además habría que reescribir un trigger
   probado y con mutaciones medidas. El `CHECK` hace imposible la fila, y el trigger ya trata «sin
   fila» como «sin tope».
6. **Total estimado con la suma real de cargos del ciclo** (Σ cargos − Σ reversos de las órdenes del
   ciclo). Sería exacto aunque el costo haya cambiado a mitad de ciclo. Pero la decisión dice
   literalmente «órdenes × costo». Se anota por si el humano lo prefiere al cerrar P1.
7. **Que `servi_app` lea `cobro_plataforma_tarifa` o ejecute `cobro_plataforma_tarifa_de`.** Expondría
   el global y la regla a cualquier SQL de la empresa. La lectura acotada (`plan_de_la_empresa`) le da
   solo su número (R22).
8. **El modal de asignación dentro del listado de «Empresas»** (R32). Habría que cargar, por fila, los
   planes asignables, el rango de fechas y el plan actual, o duplicar `PlanEmpresa`. El enlace al
   bloque `#plan` lleva al mismo flujo con un clic.
9. **R28 como `CHECK` o trigger en la base**, para que ninguna empresa pueda tener un plan sin costo
   concreto. Contradice R30: editar un plan asignado sigue permitido, y las asignaciones viejas se
   conservan. Además rompería los ayudantes de test de SL-24, que asignan planes sin precio.
10. **Dejar asignados los planes sin costo concreto y mostrar «por definir»** (la propuesta inicial de
    P4). El humano eligió desasignar (R34).
11. **Registrar la desasignación como `editado` en `plan_rastro`**, para no tocar el enum. Mentiría: el
    plan no cambió. Se añade el valor `desasignado` al enum que ya existe (§2.2), sin columnas nuevas.
12. **Conservar el ancla de las empresas desasignadas.** Al reasignarlas, heredarían el ciclo viejo y
    no podrían elegir fecha (SLT-58 R31). Su valor queda en el rastro, y el `down.sql` lo repone.

## 12. Dependencias

Ninguna nueva (R27). Se usan Prisma (`Prisma.Decimal`), zod, `plpgsql` y los componentes de
`components/ui/`, más `MontoInput` de SLT-67 si ya está en `dev`.

## 13. Riesgos

- **Rendimiento de la carga masiva.** El trigger por fila hace un `LEFT JOIN organizacion–plan` por
  clave primaria en vez de leer solo `organizacion`. T6 mide 500 filas antes y después (molde de SL-40
  §15) y anota los números.
- **Copias literales de cuerpos de funciones.** Si una ficha en vuelo reemplaza
  `cobro_plataforma_al_crear_orden` o `plan_de_la_empresa` antes de mergear, el `down.sql` restauraría
  un cuerpo viejo. T0 busca con Grep `CREATE OR REPLACE FUNCTION (cobro_plataforma_al_crear_orden|plan_de_la_empresa)`
  en `dev` y lo vuelve a buscar antes de F2.3.
- **M4 quita los límites a todas las empresas con plan** (P6). Quedan sin topes hasta que el superadmin
  les asigne un plan con costo concreto. T0 cuenta en QA, y en producción si hay acceso, cuántas son. El
  leader avisa al humano con ese número antes de aplicar M4 en una base compartida, para que tenga
  preparados los planes custom.
- **Riesgo resuelto: lo que se cobra contra lo que se muestra** (R12 con P5). Cuando un plan asignado se
  queda sin costo por orden, «Mi plan» muestra el mismo global que cobra el trigger, así que pantalla y
  wallet cuadran siempre. Lo garantiza la fuente única `cobro_plataforma_tarifa_de` (§3.2).
