# SLT-85 — traza-facturacion-cobros · design.md

> Requisitos: `requirements.md` (R1–R27; P1–P4 abiertas, escrito según su recomendación). Hereda el
> diseño de `specs/SL-40-cobro-plataforma-por-orden/` («SL-40 §N»), `specs/SLT-66-planes-sin-tope-maestro-y-costeo/`,
> `specs/SLT-83-planes-costo-por-orden-porcentual/` («SLT-83 §N») y `specs/SLT-86-planes-periodo-facturacion/`.
> Escrito por `spec_author` el 2026-11-09.

## Lo que ya existe

Busqué el 2026-11-09 con `traza`, `facturación`, `snapshot`, `cobro_plataforma_traza`, `traza del cobro`,
`cobro_plataforma_movimiento` y `plan_inicio_periodo_calendario`, en tres sitios:

- **el board**: `feature_list.json`, todas las fichas y todos los estados. Las únicas coincidencias de
  «traza de facturación» son de la propia SLT-85 «Traza de facturación de los cobros por orden». «Traza»
  sale además en SLT-59 «Reducir llamadas pagadas a Google en la optimización de ruta» y SLT-70 «Botón
  «Comenzar ruta» que dispara el primer trazado del mensajero», que hablan del trazado de rutas, sin
  relación;
- **`specs/`**, con Grep: ninguna tabla de traza de cobros; solo los specs de los que hereda esta ficha;
- **el código**: el grafo `codebase-memory-mcp` **no tiene proyecto para este worktree** (`list_projects`
  no lo lista), así que busqué con Grep y Read en `db/`, `lib/`, `scripts/` y `tests/`.

No existe ninguna traza de facturación. Lo que sí existe y se reutiliza:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| El libro de cargos y reversos, append-only, alterno, `(organizacion_id, orden_id, secuencia)` único | `cobro_plataforma_movimiento`, `20261023130100` | **No se toca**. Un trigger `AFTER INSERT` nuevo sobre ella escribe la traza (§2) |
| Los tres escritores de movimientos: `cobro_plataforma_al_crear_orden`, `cobro_plataforma_al_cambiar_borrado`, `cobro_plataforma_porcentual_conciliar` | último cuerpo en `20261104150200` | **No se tocan**. El trigger de §2 los cubre a los tres y a cualquiera futuro |
| Los enums `cobro_plataforma_tipo` (`cargo`, `reverso`) y `cobro_plataforma_fuente` (`empresa`, `global`, `sin_configurar`, `plan`) | `20261023130100`, `20261031140100` | Se reutilizan para `tipo_movimiento` y `fuente` |
| Las condiciones congeladas de la orden porcentual | `cobro_plataforma_porcentual_orden`, `20261104150100` | Dicen si la orden es porcentual y dan el porcentaje y el mínimo (R7) |
| El período de calendario en SQL: `plan_inicio_periodo_calendario` y `plan_fin_periodo_calendario` | `20261106120000` | Se llaman tal cual (R14, R18). Su tabla de casos ya está en `tests/integration/db/_fixtures/periodo-calendario.ts` |
| La empresa en vivo: `organizacion.plan_id`, `organizacion.plan_tipo_cobro`; `plan.nombre` | `db/schema.prisma` | Plan y período del instante (R10, R14) |
| El patrón de tabla de negocio solo-trigger: `organizacion_id` con DEFAULT de contexto, RLS `…_por_empresa`, `REVOKE INSERT, UPDATE, DELETE`, triggers de misma empresa generados | `20261023130100`, `20261104150100` | Se copia (§1.3) |
| `scripts/generar-misma-empresa.ts --faltantes` | `scripts/` | Genera los triggers `sme_*` de las tres FK nuevas (R26) |
| La guardia de escritura solo por trigger | `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | Se amplía a la tabla nueva (R25) |
| El precedente de `down.sql` que se niega si perdería libro de dinero | `20261031140100_cobro_plataforma_fuente_plan/down.sql` | Mismo criterio (R20, P4) |
| `aplicarMigracionesHasta`, `crearFksDeOrden`, `crearOrganizacion`, `comoApp`, `fijarEmpresa` | `tests/integration/db/_fixtures/`, `tests/fabricas/organizaciones` | Para los tests de integración (§6) |

## 1. Modelo de datos

### 1.1 Tabla `cobro_plataforma_traza` (de NEGOCIO)

Una fila por movimiento. Todos los importes `DECIMAL(12,2)`, como `cobro_plataforma_movimiento` (decisión
«Importes»); el porcentaje `DECIMAL(5,2)`, como `cobro_plataforma_porcentual_orden`. Sin IVA ni moneda.

| Columna | Tipo | Nulo | De dónde sale en vivo (§2) | Relleno (§3) |
|---|---|---|---|---|
| `id` | `TEXT` PK | no | `gen_random_uuid()::text` | ídem |
| `organizacion_id` | `TEXT` FK `organizacion` | no | `NEW.organizacion_id` del movimiento | del movimiento |
| `orden_id` | `TEXT` FK `orden` | no | `NEW.orden_id` | del movimiento |
| `movimiento_id` | `TEXT` FK `cobro_plataforma_movimiento` | no | `NEW.id` | del movimiento |
| `tipo_movimiento` | `cobro_plataforma_tipo` | no | `NEW.tipo` | del movimiento |
| `reverso_de` | `TEXT` FK `cobro_plataforma_traza` | sí | en un reverso, la traza del movimiento `secuencia − 1` (siempre un cargo: los movimientos alternan, SL-40) | ídem |
| `num_guia` | `INTEGER` | sí | `orden.num_guia` | vacío |
| `monto_cobrar` | `DECIMAL(12,2)` | sí | `orden.monto_cobrar` | vacío |
| `estado_orden` | `TEXT` | sí | `order_status.value` del `orden.estatus_id` | vacío |
| `tipo_cobro` | `TEXT` `CHECK IN ('fijo','porcentual')` | no | `porcentual` si hay fila en `cobro_plataforma_porcentual_orden`, si no `fijo` | ídem |
| `fuente` | `cobro_plataforma_fuente` | no | `NEW.fuente` | del movimiento |
| `plan_id` | `TEXT`, sin FK | sí | `organizacion.plan_id` del instante (P1) | vacío |
| `plan_nombre` | `VARCHAR(80)` | sí | `plan.nombre` de ese plan | vacío |
| `porcentaje` | `DECIMAL(5,2)` | sí | `cobro_plataforma_porcentual_orden.porcentaje` | ídem |
| `minimo` | `DECIMAL(12,2)` | sí | `cobro_plataforma_porcentual_orden.minimo` | ídem |
| `valor_fijo` | `DECIMAL(12,2)` | sí | `NEW.monto` si es fijo | ídem |
| `valor_cobrado` | `DECIMAL(12,2)` | no | `NEW.monto` en un cargo, `−NEW.monto` en un reverso | ídem |
| `cobrado_at` | `TIMESTAMP(3)` | no | `NEW.ocurrido_at` | del movimiento |
| `periodo_tipo` | `TEXT` `CHECK IN` los cuatro | sí | `organizacion.plan_tipo_cobro` si `plan_id` no es nulo | el de la empresa al migrar (P2) |
| `periodo_inicio_at` | `TIMESTAMP(3)` | sí | `plan_inicio_periodo_calendario(periodo_tipo, cobrado_at)` | ídem |
| `periodo_fin_at` | `TIMESTAMP(3)` | sí | `plan_fin_periodo_calendario(periodo_tipo, cobrado_at)` | ídem |
| `reconstruido` | `BOOLEAN` `DEFAULT false` | no | `false` | `true` |
| `created_at` | `TIMESTAMP(3)` `DEFAULT CURRENT_TIMESTAMP` | no | — | — |

**`CHECK` (viven solo en el SQL, Prisma no los expresa):**
- `cobro_plataforma_traza_regla`: `fijo` ⇒ `valor_fijo IS NOT NULL AND porcentaje IS NULL AND minimo IS NULL`;
  `porcentual` ⇒ `porcentaje IS NOT NULL AND valor_fijo IS NULL` (R7, R8);
- `cobro_plataforma_traza_signo`: `cargo` ⇒ `valor_cobrado >= 0`; `reverso` ⇒ `valor_cobrado <= 0` (R11);
- `cobro_plataforma_traza_reverso_de`: `(tipo_movimiento = 'reverso') = (reverso_de IS NOT NULL)` (R13);
- `cobro_plataforma_traza_periodo`: `num_nulls(periodo_tipo, periodo_inicio_at, periodo_fin_at) IN (0, 3)`
  (R14, R15);
- los dos `CHECK IN` de `tipo_cobro` y `periodo_tipo`.

**Índices y únicos** (los únicos empiezan por `organizacion_id`, `docs/architecture.md > Multi-empresa`):
- `UNIQUE (organizacion_id, movimiento_id)`: el 1 a 1 (R1). Como el `id` del movimiento ya es único y el
  trigger de misma empresa ata las dos empresas, equivale a uno por movimiento;
- `UNIQUE (organizacion_id, reverso_de)`: un cargo lo anula como mucho un reverso (los nulos no chocan);
- `INDEX (organizacion_id)`, `INDEX (orden_id)` y `INDEX (organizacion_id, cobrado_at)`: la última, para
  la pantalla futura que listará por período. No hay ninguna consulta hoy (sin pantalla ni exportación).

**FK:**
- `organizacion_id` → `organizacion(id)` `ON DELETE RESTRICT ON UPDATE CASCADE`, el estándar de SL-17;
- `orden_id` → `orden(id)` `ON DELETE CASCADE ON UPDATE RESTRICT`. CASCADE por la misma razón que SL-40 §3.3:
  la app nunca borra una orden de verdad y la anulación es `deleted_at`. `servi_app` no tiene `DELETE` sobre
  `orden` (`20261024120000`);
- `movimiento_id` → `cobro_plataforma_movimiento(id)` `ON DELETE CASCADE ON UPDATE RESTRICT`: si el dueño
  borra el movimiento (limpiezas, demo), la traza se va con él y el 1 a 1 se conserva;
- `reverso_de` → `cobro_plataforma_traza(id)` `ON DELETE NO ACTION ON UPDATE RESTRICT`. NO ACTION y no
  RESTRICT: al borrar en cascada todas las filas de una orden en la misma sentencia, la comprobación va al
  final de la sentencia y no choca;
- **`plan_id` sin FK**, como `plan_rastro.plan_id` (SL-24 §2.8): es una copia del momento y no debe atar
  la traza al ciclo de vida del plan.

`ON UPDATE RESTRICT` en las FK propias porque la fila no cambia nunca (R24): una cascada de actualización
chocaría igualmente con el trigger de §1.3.

### 1.2 Lo que depende del país

Nada nuevo. Los bordes del período salen de `plan_inicio_periodo_calendario` y `plan_fin_periodo_calendario`
de SLT-86, que hoy usan la hora fija de la plataforma (−06:00, SLT-86 design §1.5); esta ficha no la
cambia ni la duplica. Sin moneda (decisión «IVA y moneda», abierta hasta SL-21) ni impuestos (SLT-66 R14).

### 1.3 Acceso: RLS, `REVOKE` e inmutabilidad

- `ENABLE ROW LEVEL SECURITY` y la política `cobro_plataforma_traza_por_empresa` `FOR ALL TO servi_app`,
  con la forma exacta de `cobro_plataforma_movimiento_por_empresa` (la que reconoce la guardia
  `rls-por-empresa`). La app solo lee lo de su empresa, y sin contexto nada (R21).
- `REVOKE INSERT, UPDATE, DELETE ON "cobro_plataforma_traza" FROM servi_app` (R23). Sin él, el
  `ALTER DEFAULT PRIVILEGES` de `20261022130000` le daría escritura, y la RLS se la permitiría sobre sus
  propias filas.
- **El superadmin lee todas** (R22): `comoPlataforma` corre como dueño, que no pasa por la RLS. No se crea
  ningún repositorio de lectura: no hay pantalla ni exportación todavía, y la ficha que las traiga añadirá
  el suyo.
- **Nadie cambia una fila** (R24, P3): trigger `cobro_plataforma_traza_inmutable`
  `BEFORE UPDATE … FOR EACH ROW`, que lanza `SQLSTATE 'SL085'` para cualquier rol, el dueño incluido.
  Ningún camino legítimo actualiza esta tabla.
- **Borrar** (P3 a): cerrado para la app (el `REVOKE`) y para el código (guardia, §5). El dueño solo borra
  en cascada desde `orden` o `cobro_plataforma_movimiento` (las limpiezas de tests) o en el borrado de las
  empresas demo de QA (`scripts/demo-qa/borrar.ts`, que borra por catálogo todas las tablas con
  `organizacion_id` y salta las FK de una tabla a sí misma). Es la regla que ya tienen los movimientos.
- **Misma empresa** (R26): los tres triggers `sme_*` de `orden_id`, `movimiento_id` y `reverso_de`, y el
  de «sin cambio de empresa», generados con `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`
  después de añadir el modelo a `db/schema.prisma` y a `lib/db/modelos-de-negocio.ts`. El generador
  maneja la FK a la propia tabla igual que las demás (resuelve la tabla referida por nombre).

### 1.4 Prisma

Modelo `CobroPlataformaTraza` (`@@map("cobro_plataforma_traza")`), con `id String @id` sin default (lo
pone el trigger, como `CobroPlataformaMovimiento`), `organizacionId @default(dbgenerated())`, las
relaciones `orden`, `movimiento` (1 a 1: `CobroPlataformaMovimiento.traza CobroPlataformaTraza?`),
`reversoDe`/`reverso` (relación a sí misma con nombre) y las relaciones inversas en `Orden`,
`Organizacion` y `CobroPlataformaMovimiento`. `tipoCobro` y `periodoTipo` son `String` (los `CHECK` viven
en el SQL, como `planTipoCobro`). El comentario del modelo nombra lo que vive solo en el SQL: los `CHECK`,
la política, el `REVOKE`, el trigger de inmutabilidad y los de misma empresa.

## 2. Dónde se escribe: un trigger sobre `cobro_plataforma_movimiento`

```
AFTER INSERT ON "cobro_plataforma_movimiento" FOR EACH ROW
  EXECUTE FUNCTION cobro_plataforma_traza_al_registrar()
```

**Por qué aquí** (R2, R3): hoy escriben movimientos tres funciones (§ «Lo que ya existe»), llamadas desde
tres triggers sobre `orden` (`AFTER INSERT`, `AFTER UPDATE OF deleted_at`, `AFTER UPDATE OF estatus_id`).
Un trigger sobre la tabla de movimientos cubre a los tres **y a cualquier camino futuro** por construcción,
igual que SL-40 cubrió «por cualquier vía» con triggers sobre `orden`. Corre dentro de la sentencia que
inserta el movimiento: si la transacción se deshace, se deshacen los dos; si el `INSERT` de la traza falla
(un `CHECK`, un `SL017`), falla el `INSERT` del movimiento y con él la operación sobre la orden. No hay
movimiento sin traza ni traza sin movimiento.

**La función** (`SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC`,
como todas las de SL-40). La empresa sale siempre de `NEW.organizacion_id`, que ya pasó la RLS de `orden`
y el trigger de misma empresa del movimiento:

```sql
-- Esbozo; el implementer lo escribe completo.
SELECT o."num_guia", o."monto_cobrar", s."value"            -- R5: la orden tal como está en la sentencia
  FROM "orden" o JOIN "order_status" s ON s."id" = o."estatus_id" WHERE o."id" = NEW."orden_id";
SELECT c."porcentaje", c."minimo"                           -- R7/R8: ¿es porcentual?
  FROM "cobro_plataforma_porcentual_orden" c WHERE c."orden_id" = NEW."orden_id";
SELECT g."plan_id", p."nombre", g."plan_tipo_cobro"         -- R10, R14, R15: la empresa en este instante
  FROM "organizacion" g LEFT JOIN "plan" p ON p."id" = g."plan_id" WHERE g."id" = NEW."organizacion_id";
IF NEW."tipo" = 'reverso' THEN                              -- R13: la traza del cargo que anula
  SELECT t."id" FROM "cobro_plataforma_traza" t JOIN "cobro_plataforma_movimiento" m ON m."id" = t."movimiento_id"
   WHERE m."organizacion_id" = NEW."organizacion_id" AND m."orden_id" = NEW."orden_id"
     AND m."secuencia" = NEW."secuencia" - 1 AND m."tipo" = 'cargo';
END IF;
INSERT INTO "cobro_plataforma_traza" (…, "reconstruido") VALUES (…, false);   -- R16
```

**Cómo se obtiene cada campo, camino por camino.** La función lee la fila de la orden y no `NEW` de
`orden`: dentro del trigger `AFTER` sobre `orden` que inserta el movimiento, la sentencia ya está aplicada y
la lectura ve sus valores (la conciliación de SLT-83 §3.3 ya se apoya en esto).

| Camino (función que inserta el movimiento) | Movimiento | Orden (R5) | Regla (R7–R9) | Plan y período (R10, R14) |
|---|---|---|---|---|
| Alta fija (`al_crear_orden`) | cargo, sec. 1 | recién creada: guía normalmente vacía | `fijo`, `valor_fijo = monto`, fuente de `cobro_plataforma_tarifa_de` | empresa en el alta |
| Alta que nace anulada (`al_crear_orden`) | cargo 1 + reverso 2 | ídem | ídem | ídem |
| Anulación fija (`al_cambiar_borrado`) | reverso, `ocurrido_at = deleted_at` | en la anulación | copia la del cargo: mismo `monto` y `fuente` | empresa en la anulación, período de `deleted_at` |
| Recuperación fija (`al_cambiar_borrado`) | cargo con el mismo importe del revertido (SL-40 R16) | en la recuperación | `fijo`, `valor_fijo = monto` (el revertido, no la tarifa de hoy) | empresa en la recuperación |
| Porcentual al estado final (`porcentual_conciliar`) | cargo, fuente `plan` | estado final, `monto_cobrar` del instante | `porcentual`, `%` y mínimo congelados | empresa al llegar al estado final |
| Porcentual sale del final, se anula o se recupera (`porcentual_conciliar`) | reverso o cargo nuevo | en ese instante | `porcentual` | empresa en ese instante |

No hace falta leer la traza del cargo para la regla de un reverso: el reverso copia `monto` y `fuente`
del último cargo (SL-40 §2.2, SLT-83 §3.3), y el porcentaje y el mínimo salen de la misma fila congelada.
`fuente = 'sin_configurar'` tiene `monto = 0` (SL-40 D11), así que `valor_fijo = 0,00` y
`valor_cobrado = 0,00` salen solos (R9).

**El período es el de la fecha de cobro** (`cobrado_at` = `ocurrido_at`), la misma fecha por la que
`plan_cobro_del_ciclo` asigna el movimiento a un ciclo (SLT-83 R24). Es el período **de calendario** que
nombra la decisión del 2026-11-09, no el tramo recortado a la entrada de la empresa: si la empresa entró a
mitad de período, `periodo_inicio_at` es el inicio del calendario, anterior a su entrada. `ocurrido_at` es
UTC sin zona como el resto (decisión 2026-10-28 de SL-24), que es lo que esperan las dos funciones.

**Plan del instante** (P1 a): `organizacion.plan_id` es el plan aplicado. Un cambio pendiente
(`plan_cambio_*`) cuenta solo cuando el job `plan_aplicar_cambio_empresa` lo aplica, igual que para
`plan_de_la_empresa`. Con `fuente = 'empresa'` o `'global'` el plan se copia igual: dice qué plan tenía la
empresa, y la fuente dice de dónde salió el importe.

## 3. Migración `20261109120000_cobro_plataforma_traza`

A mano, como las de SL-40 (`db:migrate:create` falla con P3006 en este repo). En este orden:

1. Tabla, `CHECK`, índices, FK, RLS, política, `REVOKE` (§1.1, §1.3).
2. Triggers de misma empresa y de «sin cambio de empresa» (pegados de `generar-misma-empresa.ts --faltantes`).
3. Función y trigger de inmutabilidad (§1.3).
4. Función y trigger `cobro_plataforma_traza_al_registrar` (§2). **Antes** del relleno: un movimiento que
   entre mientras corre la migración tiene ya su traza en vivo, y el relleno lo salta (`NOT EXISTS`).
5. `LOCK TABLE "cobro_plataforma_movimiento" IN SHARE ROW EXCLUSIVE MODE`: el relleno ve un libro quieto.
6. **Relleno en dos sentencias** (R17, R18), las dos con `WHERE NOT EXISTS (traza de ese movimiento)`:
   - **cargos**: `INSERT … SELECT` de los movimientos `cargo`. `tipo_cobro` = `porcentual` si la orden tiene
     fila en `cobro_plataforma_porcentual_orden` (las órdenes porcentuales solo tienen movimientos de la
     conciliación, siempre con esas condiciones), con su `%` y mínimo; si no, `fijo` con
     `valor_fijo = monto`. `valor_cobrado = monto`. Período con `plan_tipo_cobro` de la empresa **de hoy**
     si hoy tiene plan (P2 a), calculado sobre `ocurrido_at`. Vacíos: `num_guia`, `monto_cobrar`,
     `estado_orden`, `plan_id`, `plan_nombre`. `reconstruido = true`;
   - **reversos**: igual, con `valor_cobrado = −monto` y `reverso_de` = la traza del movimiento
     `secuencia − 1` de la misma orden, que la sentencia anterior ya escribió.
   Los cargos primero porque un reverso apunta siempre a un cargo y un cargo nunca apunta a nada.
7. **Cierre** (R19): un bloque `DO` cuenta los movimientos sin traza y lanza una excepción si hay alguno.

**Atomicidad.** Hoy ninguna `migration.sql` del repo lleva `BEGIN`/`COMMIT` y las aplica el runner tal cual.
Para que R19 deshaga **todo** y el `LOCK` del paso 5 dure hasta el final, el implementer comprueba en
`scripts/` cómo aplica Prisma la migración (si la envuelve en una transacción). Si no la envuelve, el
archivo abre `BEGIN;` y cierra `COMMIT;`, como hacen los `down.sql` (p. ej. `20261031140100`).

**Por qué no se rellena lo que no se guardó.** `num_guia`, `monto_cobrar` y el estado de hoy no son los del
cobro: copiarlos haría pasar un dato de hoy por uno del momento. La decisión «Históricos» los deja vacíos.
El período sí se calcula porque lo pide la decisión del 2026-11-09; el tipo es el único conocido (P2).

### 3.1 `down.sql` (R20, P4)

1. **Precondición**: si existe alguna fila con `reconstruido = false`, `RAISE EXCEPTION` sin tocar nada.
   Esa copia del momento no se puede volver a sacar; mismo criterio que `20261031140100/down.sql`.
2. `DROP TRIGGER` de `cobro_plataforma_traza_al_registrar` sobre `cobro_plataforma_movimiento` y
   `DROP FUNCTION` de la función; ídem el de inmutabilidad.
3. `DROP TABLE "cobro_plataforma_traza"` (se lleva sus triggers `sme_*`, su política y sus índices).

No toca ningún movimiento ni ninguna función de SL-40, SLT-66, SLT-83 ni SLT-86.

## 4. Sin código de aplicación

No hay endpoint, Server Action, servicio ni repositorio: la ficha es «solo datos» (decisión «Quién la lee»).
En `lib/` solo cambia `lib/db/modelos-de-negocio.ts` (el modelo nuevo de negocio, que exige la guardia
`organizacion-en-modelos`). No hay módulo que encender: el cobro de la plataforma es de núcleo.

## 5. Guardias y contadores que se mueven

- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`: el detector gana
  `cobroPlataformaTraza.(create|update|upsert|delete)*` y `INSERT INTO|UPDATE|DELETE FROM cobro_plataforma_traza`,
  con sus casos en la contraprueba (R25).
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 88 → 89 tablas, con su línea en el comentario.
- `scripts/verificar-rls-despliegue.ts`: `TRIGGERS_MISMA_EMPRESA` 172 → 175 (tres FK de negocio), con su
  línea en el comentario. La cifra exacta la da `--faltantes`.
- `lib/db/modelos-de-negocio.ts`: la entrada del modelo.

## 6. Pruebas (R → test)

Todo el SQL se prueba contra Postgres real (`HAY_BASE_DE_DATOS`), como pide `docs/perfil-agentes.md >
backend_dev`.

| R | Test |
|---|---|
| R1 | `tests/integration/db/cobro-plataforma-traza.test.ts` › «cada movimiento tiene exactamente una traza y ninguna traza queda sin movimiento» (recorre todos los caminos y compara conteos y `movimiento_id`) |
| R2 | ídem › un `it` por camino: alta fija, alta que nace anulada, anulación, recuperación, porcentual al estado final, porcentual que sale del final, porcentual anulada y recuperada |
| R3 | ídem › «si la transacción se deshace no queda ni el movimiento ni la traza» y «si la traza no se puede escribir, el movimiento no se registra» (dentro de una transacción de test que se deshace al final, el dueño añade a la traza un `CHECK (false) NOT VALID`, crea una orden y comprueba el error y que no queda ningún movimiento) |
| R4 | ídem › «los movimientos y la deuda son los mismos con y sin traza»; y las suites de SL-40 y SLT-83 (`cobro-plataforma-cargos.test.ts`, `cobro-porcentual-estados-finales.test.ts`) siguen verdes |
| R5 | ídem › «copia guía, monto_cobrar y código de estado del instante; guía vacía si no tiene» |
| R6 | ídem › «cambiar guía, monto o estado después no cambia la traza ya escrita» |
| R7 | ídem › «orden porcentual: tipo porcentual, % y mínimo congelados, sin valor fijo» |
| R8 | ídem › «orden fija: tipo fijo, valor fijo = importe, sin % ni mínimo» |
| R9 | ídem › un caso por fuente (`empresa`, `plan`, `global`, `sin_configurar` con 0,00) |
| R10 | ídem › «copia el plan del instante; sin plan, vacío» y «tras cambiar de plan, la fila nueva lleva el nuevo y la vieja no cambia» |
| R11 | ídem › «cargo positivo, reverso negativo, mismo valor absoluto exacto que el movimiento» |
| R12 | ídem › «fecha de cobro = ocurrido_at, también en el reverso con deleted_at» |
| R13 | ídem › «el reverso apunta a la traza del cargo que anula; el cargo no apunta a nada» |
| R14 | ídem › tabla de casos de `tests/integration/db/_fixtures/periodo-calendario.ts` aplicada a la fecha de cobro, para los cuatro tipos, incluida una entrada a mitad de período |
| R15 | ídem › «empresa sin plan: período vacío» |
| R16 | ídem › «las filas en vivo salen con reconstruido = false» |
| R17 | `tests/integration/db/migracion-slt85-ida-y-vuelta.test.ts` › «el relleno escribe una traza por movimiento con lo guardado y vacíos lo demás» (orden fija, porcentual, anulada y recuperada, `sin_configurar`) |
| R18 | ídem › «el período de los históricos sale del tipo de la empresa al migrar; sin plan, vacío» |
| R19 | ídem › «la migración falla si queda un movimiento sin traza» (el bloque `DO` de cierre, con un movimiento cuya traza se impide) |
| R20 | ídem › «el down baja sin tocar movimientos» y «el down se niega si hay una fila en vivo» |
| R21 | `tests/integration/db/cobro-plataforma-traza-aislamiento.test.ts` › «la app en la empresa A solo lee las de A; sin contexto, ninguna» |
| R22 | ídem › «la plataforma lee las de las dos empresas» |
| R23 | ídem › «la app no inserta, no cambia y no borra: 42501 sin cambios» |
| R24 | ídem › «nadie cambia una fila, tampoco el dueño: SL085» |
| R25 | `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` › contraprueba con los patrones nuevos y «ningún archivo de lib/ ni de app/ escribe en cobro_plataforma_traza» |
| R26 | `cobro-plataforma-traza-aislamiento.test.ts` › «una traza no apunta a orden, movimiento ni traza de otra empresa ni cambia de empresa: SL017» |
| R27 | `cobro-plataforma-traza.test.ts` › «la tabla tiene exactamente las columnas esperadas, importes numeric(12,2), porcentaje numeric(5,2), sin impuesto ni moneda» (`information_schema.columns`) |

**E2E.** No hay pantalla y la ficha no añade un E2E. Como toca `db/` y dinero, antes del PR se corren en
local el grupo `dinero` y los E2E del cobro (`e2e/cobro-plataforma-sl40.spec.ts`,
`e2e/planes-costo-porcentual.spec.ts`, `e2e/planes-costeo.spec.ts`,
`e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`), y `e2e/dos-empresas-humo.spec.ts` porque toca datos de
negocio (`docs/perfil-agentes.md > Todos los agentes`, `docs/checkpoints-proyecto.md`).

## 7. Alternativas descartadas

1. **Escribir la traza dentro de las tres funciones que insertan movimientos** (`al_crear_orden`,
   `al_cambiar_borrado`, `porcentual_conciliar`). Descartada: son tres `CREATE OR REPLACE` que copian
   literalmente cuerpos de dinero ya revisados línea a línea (SLT-83 §2.3), con sus `down.sql`, y un
   camino nuevo que alguien añada mañana podría olvidar la traza. El trigger sobre la tabla de
   movimientos lo cumple por construcción, sin tocar ni una línea de lo que cobra.
2. **Columnas nuevas en `cobro_plataforma_movimiento`.** Descartada: el humano pidió una tabla aparte con
   relación 1 a 1 (`movimiento_id`); el libro de la deuda no cambia de forma; y el relleno tendría que
   hacer `UPDATE` sobre el libro, que hoy es append-only.
3. **Una vista que junte movimientos con los datos de hoy.** Descartada: no es una copia del momento. La
   guía, el `monto_cobrar`, el estado y el plan de hoy no son los del cobro (decisión «Número de guía»).
4. **Escribir la traza desde la app** (un servicio después de cada operación). Descartada: los movimientos
   los escribe la base dentro de la sentencia sobre `orden`, y desde la app no habría forma de cumplir la
   misma transacción por todas las vías (pantalla, carga masiva, API, jobs) ni de impedir el olvido. Va
   además contra la guardia de SL-40.
5. **`plan_id` con FK a `plan`.** Descartada: es un dato copiado; el plan es de plataforma y un custom se
   borra en cascada con su empresa. Se sigue `plan_rastro` (SL-24 §2.8).
6. **El tramo (`plan_inicio_ciclo_de`) en vez del período de calendario.** Descartada: la decisión del
   2026-11-09 nombra el período de calendario; el tramo se puede derivar después con la entrada de la
   empresa si una pantalla lo necesita.

## 8. Librerías

Ninguna nueva.
