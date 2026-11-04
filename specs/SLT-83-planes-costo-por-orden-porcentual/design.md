# SLT-83 — planes-costo-por-orden-porcentual · design.md

> Requisitos: `requirements.md` (R1–R29, P1 abierta). Hereda el diseño de
> `specs/SL-40-cobro-plataforma-por-orden/` («SL-40 §N») y `specs/SLT-66-planes-sin-tope-maestro-y-costeo/`
> («SLT-66 §N»). Escrito por `spec_author` el 2026-11-04.

## Lo que ya existe

Busqué el 2026-11-04 con `porcentual`, `valor del paquete`, `valor declarado`, `% sobre monto_cobrar`,
`costo por orden`, `cobro_plataforma_tarifa_de` y `ESTADOS_TERMINALES`, en tres sitios:

- **el board**: `feature_list.json` (todas las fichas, todos los estados). Las únicas coincidencias de
  `porcentual` y `valor del paquete` son de la propia SLT-83;
- **`specs/`**, con Grep: solo SLT-83 y una mención sin relación en `specs/158-incidente-indemnizacion`
  (la indemnización de un incidente, no el cobro de la plataforma);
- **el código**: el grafo `codebase-memory-mcp` **no tiene proyecto para este worktree** (`list_projects`
  no lo lista), así que busqué con Grep y Read sobre `db/`, `lib/`, `app/`, `components/`, `tests/` y
  `e2e/`.

No existe ningún cobro porcentual. Lo que sí existe y se reutiliza:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| La regla vigente en una sola función, `cobro_plataforma_tarifa_de(org) → (monto, fuente)` | `db/migrations/20261031140200_plan_costeo_funciones` | Se recrea con dos columnas más (`porcentaje`, `minimo`). Sigue siendo la única definición de la regla (SLT-66 §3.2) (§2.3) |
| El trigger de alta `cobro_plataforma_al_crear_orden()` | `20261031140200` (último cuerpo) | `CREATE OR REPLACE`: en modo porcentual congela y no carga (§3.2) |
| El trigger de anulación `cobro_plataforma_al_cambiar_borrado()` | `20261023130200` (único cuerpo) | `CREATE OR REPLACE`: una orden porcentual pasa por la conciliación (§3.3). Las órdenes fijas, igual que hoy |
| La tabla de movimientos, append-only, `cargo`/`reverso` alternos y la fuente `plan` | `cobro_plataforma_movimiento`, SL-40 §3.3, SLT-66 §2.2 | Se reutilizan tal cual. **No** hay valor nuevo de enum ni de tipo (§11, alternativa 4) |
| La deuda de la wallet (Σ cargos − Σ reversos − pagos) | `lib/utils/deuda-plataforma.ts`, `DeudaPlataformaService` | **No se toca**: R18 sale por construcción |
| `ESTADOS_TERMINALES` | `lib/types/order-status-transiciones.ts:471` | Fuente única de «estado final». La base lleva su copia y un test la ata (R19, §3.4) |
| `porcentajeSchema` (texto, 2 decimales, `> 0` y `≤ 100`, en centésimas enteras) | `lib/types/planes.ts:45` (privado) | Se exporta y se reutiliza para el porcentaje (R2) |
| `montoCobroSchema` | `lib/types/cobro-plataforma.ts` | Para el mínimo (R2) |
| `tieneCostoConcreto`, `costeoDelCiclo`, `CosteoDelCiclo`, `FuenteDelCosto` | `lib/planes/costo-concreto.ts`, `lib/planes/costeo.ts`, `lib/types/consumo-plan.ts` | Ganan el modo porcentual (§4) |
| `textoDelCostoPorOrden`, `lineasDeCambioDelPlan`, `diferenciasDelPlan` | `lib/planes/mensajes.ts`, `lib/planes/rastro.ts` | Ganan el modo porcentual (R4, R21) |
| `plan-vista.ts`, que comparten catálogo, formulario, detalle y modal | `app/(app)/plataforma/planes/_components/plan-vista.ts` | El texto nuevo entra en un solo sitio (R21) |
| `plan_de_la_empresa` («Mi plan») | `20261104130000_plan_sin_negociable_y_tipo_cobro` (último cuerpo) | `CREATE OR REPLACE` con el costeo porcentual (§2.3) |
| `planYCobroVigente` del listado de «Empresas» | `lib/repositories/EmpresasPlataformaRepository.ts:125` | Lee las columnas nuevas de la misma función (R22) |
| Escenarios de reparto para el E2E (`crearOrden`, `llevarA`, `gestionar`) | `e2e/_escenarios/reparto.ts` | Llevan la orden a `entregado` en el E2E (R28) |
| E2E de costeo y de cobro | `e2e/planes-costeo.spec.ts`, `e2e/cobro-plataforma-sl40.spec.ts`, `e2e/_planes-fixture.ts` | Se copian sus patrones (§9.2) |
| `aplicarMigracionesHasta` | `tests/integration/db/_fixtures/ida-y-vuelta-32.ts` | Para la ida y vuelta (R27) |

## 0. Decisiones cerradas → requisitos

El mapa está en `requirements.md > Mapa decisiones → requisitos`. Toda fila de la tabla del humano tiene
al menos un `R`.

## 1. Resumen

- **Plan.** Dos columnas nuevas en `plan`: `costo_por_orden_pct` y `costo_por_orden_minimo`. El modo se
  **deriva**: porcentual si hay porcentaje, fijo si hay `costo_por_orden`, vacío si no hay ninguno. Un
  `CHECK` impide los dos a la vez (R1).
- **Orden.** Una tabla de negocio nueva, `cobro_plataforma_porcentual_orden`, guarda las condiciones
  congeladas de cada orden porcentual. Una fila por orden, que escribe solo el trigger de alta (R6).
- **Cobro.** Una función de conciliación, `cobro_plataforma_porcentual_conciliar(orden)`, decide si la
  orden debe tener un cargo vigente y registra el cargo o el reverso que falte. La llaman tres triggers
  (alta, cambio de estado y anulación), así que el invariante de R15 tiene **una** sola implementación.
- **Pantallas.** El modo porcentual entra en `PlanForm`, en `plan-vista.ts` (catálogo, detalle, modal), en
  la columna «Cobro por orden» y en `ConsumoDelPlan` («Mi plan» y detalle de empresa).

## 2. Modelo de datos y migraciones

Van después de la última migración de `dev` (`20261104130100_historial_accion_plan_tipo_cobro_cambiado`).
Se escriben a mano (`db:migrate:create` falla con P3006). T0 comprueba que siguen siendo las últimas antes
de aplicarlas en una base compartida; si otra rama mergea antes una con timestamp posterior, se renombran
**antes** de aplicarse en ninguna base compartida (memoria «Migración editada en sitio = drift»).

### 2.1 M1 — `20261104150000_plan_costo_por_orden_porcentual`

```sql
-- SLT-83 R1, R2. NULL/NULL = el plan no es porcentual. El modo se deriva (§11, alternativa 2).
ALTER TABLE "plan" ADD COLUMN "costo_por_orden_pct"    DECIMAL(5,2);
ALTER TABLE "plan" ADD COLUMN "costo_por_orden_minimo" DECIMAL(12,2);
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_pct_check"
  CHECK ("costo_por_orden_pct" IS NULL OR ("costo_por_orden_pct" > 0 AND "costo_por_orden_pct" <= 100));
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_minimo_check"
  CHECK ("costo_por_orden_minimo" IS NULL OR ("costo_por_orden_minimo" >= 0 AND "costo_por_orden_pct" IS NOT NULL));
ALTER TABLE "plan" ADD CONSTRAINT "plan_costo_por_orden_un_modo"
  CHECK ("costo_por_orden" IS NULL OR "costo_por_orden_pct" IS NULL);

-- R27: las versiones pendientes ganan la clave nueva, vacía, para que `versionPlanSchema` las siga leyendo.
UPDATE "plan_cambio_programado"
   SET "version" = jsonb_set("version", '{costoPorOrdenPorcentual}', 'null'::jsonb);
```

- Los planes que ya existen no cambian de modo (R27): sus columnas nuevas nacen `NULL`.
- **Multi-empresa.** `plan` y `plan_cambio_programado` siguen siendo de plataforma, con RLS sin políticas y
  `REVOKE ALL … FROM servi_app` (SL-24 §2.5). Las columnas nuevas heredan ese trato.
- **`down.sql`:**
  - `RAISE EXCEPTION 'SLT-83 down: hay planes porcentuales; bajar los dejaría sin costo por orden'` si
    algún plan tiene `costo_por_orden_pct` o alguna versión pendiente tiene `costoPorOrdenPorcentual` no
    nulo (R27);
  - si no, quita la clave de las versiones, los tres `CHECK` y las dos columnas.

### 2.2 M2 — `20261104150100_cobro_plataforma_porcentual_orden`

Tabla de **negocio** `cobro_plataforma_porcentual_orden`:

| Columna | Tipo | Regla |
|---|---|---|
| `orden_id` | `TEXT` PK, FK `orden` `ON DELETE CASCADE` | una fila por orden (la misma razón de `CASCADE` que SL-40 §3.3) |
| `organizacion_id` | `TEXT NOT NULL`, FK `organizacion` `ON DELETE RESTRICT` | `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`; el trigger la escribe explícita con la de la orden |
| `porcentaje` | `DECIMAL(5,2) NOT NULL` | `CHECK ("porcentaje" > 0 AND "porcentaje" <= 100)` |
| `minimo` | `DECIMAL(12,2) NULL` | `CHECK ("minimo" IS NULL OR "minimo" >= 0)` |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | |

- **Índices:** `UNIQUE ("organizacion_id", "orden_id")` (único por empresa, regla de
  `docs/architecture.md`) y `("organizacion_id")` para el conteo de pendientes (R24).
- **Índice nuevo en `cobro_plataforma_movimiento`:** `("organizacion_id", "ocurrido_at")`, para la suma
  del ciclo (R24). No cambia ninguna fila.
- **Solo lectura para la empresa (R17):** política `cobro_plataforma_porcentual_orden_por_empresa`
  `FOR ALL TO servi_app` con `USING` y `WITH CHECK` por `organizacion_id` (la forma que reconoce
  `rls-por-empresa`) y `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` (SL-40 §3.4: sin él, el
  `ALTER DEFAULT PRIVILEGES` la deja escribible).
- **Triggers de SL-17:** se generan con `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` (misma
  empresa para la FK `orden_id` y «sin cambio de empresa»).
- **Prisma** (`db/schema.prisma`): `model CobroPlataformaPorcentualOrden` con `@@map`, relación inversa
  `cobroPorcentual CobroPlataformaPorcentualOrden?` en `Orden` y la lista en `Organizacion`. Los `CHECK`, la
  política y el `REVOKE` van en un comentario, como en `CobroPlataformaMovimiento`. Entra en
  `MODELOS_DE_NEGOCIO` (`lib/db/modelos-de-negocio.ts`). El diff de drift sale vacío.
- **`down.sql`:** se niega si la tabla tiene filas (R27: perderían su cobro); si no, borra triggers,
  política, índices y tabla, y el índice de `cobro_plataforma_movimiento`.

### 2.3 M3 — `20261104150200_cobro_plataforma_porcentual_funciones`

Todas `plpgsql`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC` y
**sin `GRANT` a `servi_app`**, salvo `plan_de_la_empresa`, que conserva el suyo.

1. **`orden_estado_es_final(p_estatus_id text) RETURNS boolean`** (`STABLE`): `EXISTS (SELECT 1 FROM
   "order_status" WHERE "id" = p_estatus_id AND "value" IN ('entregado', 'devuelta_a_tienda',
   'incidente'))`. Es la copia en SQL de `ESTADOS_TERMINALES`, con el test de R19 (§3.4).
2. **`cobro_plataforma_importe_porcentual(p_monto numeric, p_pct numeric, p_minimo numeric) RETURNS
   numeric(12,2)`** (`IMMUTABLE`): `GREATEST(round(COALESCE(p_monto, 0) * p_pct / 100, 2),
   COALESCE(p_minimo, 0))::numeric(12,2)`. `round(numeric, 2)` de Postgres redondea la mitad alejándose de
   cero; con importes `≥ 0` es «mitad hacia arriba» (R9). El máximo (`monto_cobrar` de `DECIMAL(12,2)` ×
   100 %) cabe en `DECIMAL(12,2)`.
3. **`cobro_plataforma_tarifa_de(text)`**: `DROP` y `CREATE`, porque cambia el `RETURNS TABLE` (un
   `CREATE OR REPLACE` no puede). Devuelve `("monto" numeric(12,2), "fuente" cobro_plataforma_fuente,
   "porcentaje" numeric(5,2), "minimo" numeric(12,2))`:
   - excepción → `(excepción, 'empresa', NULL, NULL)` (R7: gana sobre el plan porcentual);
   - plan porcentual → `(NULL, 'plan', pct, mínimo)`;
   - plan fijo → `(costo, 'plan', NULL, NULL)`;
   - global → `(global, 'global', NULL, NULL)`; nada → `(0, 'sin_configurar', NULL, NULL)`.

   «Porcentual» quiere decir `porcentaje IS NOT NULL`. No mira `archivado_at` ni el descuento (SLT-66 R13,
   R14). `plan_de_la_empresa` y el trigger la llaman por nombre, así que el `DROP` no rompe ninguna
   dependencia (plpgsql no las registra); la migración las recrea igual.
4. **`cobro_plataforma_porcentual_conciliar(p_orden_id text)`**, el corazón del cobro (§3.3).
5. **`CREATE OR REPLACE FUNCTION cobro_plataforma_al_crear_orden()`**. Copia literal de `20261031140200`
   salvo la rama nueva (§3.2).
6. **`CREATE OR REPLACE FUNCTION cobro_plataforma_al_cambiar_borrado()`**. Copia literal de
   `20261023130200` con una sola entrada nueva al principio: si la orden tiene condiciones congeladas, llama
   a la conciliación y sale (§3.3).
7. **`cobro_plataforma_al_cambiar_estado()`** y su trigger `AFTER UPDATE OF "estatus_id" ON "orden" FOR
   EACH ROW WHEN (OLD."estatus_id" IS DISTINCT FROM NEW."estatus_id")`: si la orden tiene condiciones
   congeladas, concilia. Si no, no hace nada (las órdenes fijas no dependen del estado).
8. **`plan_cobro_del_ciclo(p_organizacion_id text, p_desde timestamp) RETURNS TABLE ("cobrado" numeric(12,2),
   "pendientes" integer)`** (`STABLE`), una sola definición de las dos cifras de R24:
   - `cobrado` = Σ `monto` de los `cargo` − Σ `monto` de los `reverso` de la empresa con
     `ocurrido_at >= p_desde` (P1, opción A; con la B, el filtro sería por `orden.created_at`);
   - `pendientes` = órdenes con fila en `cobro_plataforma_porcentual_orden`, `created_at >= p_desde`,
     `deleted_at IS NULL` y `NOT orden_estado_es_final(estatus_id)`.
9. **`CREATE OR REPLACE FUNCTION plan_de_la_empresa(text)`**. Copia literal de `20261104130000` con dos
   cambios:
   - `costo_vigente` gana `'porcentaje', t."porcentaje"::text, 'minimo', t."minimo"::text` (y `monto` puede
     ser `null`);
   - clave nueva `'cobro_ciclo', (SELECT jsonb_build_object('cobrado', c."cobrado"::text, 'pendientes',
     c."pendientes") FROM plan_cobro_del_ciclo(o."id", plan_inicio_ciclo_en_curso(…)) c)`;
   - y `'costo_por_orden_pct'`, `'costo_por_orden_minimo'` del plan, para el aviso de costo concreto.

   El contexto (`42501`), el `search_path`, el `REVOKE` y el `GRANT` no cambian (R25).

**`down.sql`** (en orden inverso): `DROP TRIGGER` del cambio de estado y sus funciones; `CREATE OR
REPLACE` de `plan_de_la_empresa`, `cobro_plataforma_al_cambiar_borrado` y `cobro_plataforma_al_crear_orden`
con sus cuerpos de origen, copiados literalmente; `DROP` y `CREATE` de `cobro_plataforma_tarifa_de` con
su firma de `20261031140200`; `DROP` de las funciones nuevas. El reviewer compara los cuerpos línea a
línea con los de origen (precedente SLT-66 §2.3).

**Orden de bajada:** M3 → M2 → M1. M2 y M1 se niegan si hay datos porcentuales (R27).

### 2.4 Datos que dependen del país

- **Moneda.** Igual que SLT-66 §2.5: importes sin moneda en las pantallas de plan; la wallet pinta la
  deuda con `money`, como ya lo hace.
- **Impuestos.** No hay (R10, SL-40 P2).
- **`monto_cobrar`.** Es el contra entrega de la orden, en la moneda de la empresa. La regla de enteros de
  la ficha 305 (`orden_monto_cobrar_entero_check`) no cambia nada aquí: el cargo sí puede llevar céntimos
  (290,11 en R9), y `cobro_plataforma_movimiento.monto` es `DECIMAL(12,2)`.
- **Geografía y métodos de pago.** No aplican.

## 3. El cobro (R6–R19)

### 3.1 Por qué en la base

Es el argumento de SL-40 §2.2 y SLT-66 §3.1, con más fuerza: el estado de una orden se cambia desde muchos
repositorios (`estatus_id` aparece en 17 archivos de `lib/repositories/`, entre lecturas y escrituras:
`OrdenRepository`, `CierreDiaRepository`, `CierresAdminRepository`, `GestionOrdenRepository`,
`IncidenteAdminRepository`, `DevolucionTiendaRepository`, `RecuperacionBodegaRepository` y otros; Grep). Enganchar el cobro en TS obligaría a tocar cada vía y a
recordarlo en cada vía futura. Un trigger sobre `UPDATE OF estatus_id` las cubre todas, también la
corrección #31/#69 y las reversiones de incidente #53–#58.

### 3.2 Alta (R6, R7, R8)

El nuevo cuerpo de `cobro_plataforma_al_crear_orden()`:

```sql
SELECT t."monto", t."fuente", t."porcentaje", t."minimo"
  INTO v_monto, v_fuente, v_pct, v_minimo
  FROM cobro_plataforma_tarifa_de(NEW."organizacion_id") t;

IF v_pct IS NOT NULL THEN                                   -- R6: plan porcentual
  INSERT INTO "cobro_plataforma_porcentual_orden" ("orden_id", "organizacion_id", "porcentaje", "minimo")
  VALUES (NEW."id", NEW."organizacion_id", v_pct, v_minimo);
  PERFORM cobro_plataforma_porcentual_conciliar(NEW."id");  -- R8: si nace en un estado final
  RETURN NULL;
END IF;
-- el resto, literal de 20261031140200: cargo (y reverso si nace borrada)
```

- La excepción gana porque la función ya la devuelve primero, con `porcentaje` `NULL` (R7).
- El trigger es `AFTER INSERT … FOR EACH ROW`: una carga masiva (`createMany`) congela fila a fila, en la
  misma transacción (R6, R16).

### 3.3 Conciliación (R8, R12–R15)

```
cobro_plataforma_porcentual_conciliar(orden):
  c       := condiciones congeladas de la orden          -- si no hay, no hace nada
  o       := la fila de la orden (estatus_id, deleted_at, monto_cobrar, organizacion_id)
  debe    := o.deleted_at IS NULL AND orden_estado_es_final(o.estatus_id)
  ultimo  := último movimiento (ORDER BY secuencia DESC LIMIT 1), o ninguno
  tiene   := ultimo.tipo = 'cargo'
  si debe y no tiene → cargo:   secuencia = (ultimo.secuencia ?? 0) + 1, fuente 'plan',
                                monto = cobro_plataforma_importe_porcentual(o.monto_cobrar, c.porcentaje, c.minimo),
                                ocurrido_at = now()
  si no debe y tiene → reverso: mismo monto y fuente que el último cargo,
                                ocurrido_at = COALESCE(o.deleted_at, now())
  en otro caso       → nada
```

- **Un solo invariante (R15).** Cargo vigente ⇔ no anulada y en estado final. Las tres entradas (alta,
  estado y anulación) llaman a la misma función, así que no pueden divergir.
- **Idempotente.** Llamarla dos veces deja lo mismo. Por eso una sentencia que cambia `estatus_id` y
  `deleted_at` a la vez (dispara los dos triggers) acaba igual que dos sentencias separadas (R15).
- **Lee la fila, no `NEW`.** Dentro de un `AFTER` trigger la fila ya tiene los valores de la sentencia, y la
  función sirve igual para las tres entradas.
- **Entre dos estados finales** `debe` sigue siendo verdadero y ya `tiene`: nada (R12).
- **`monto_cobrar` que cambia en estado final**: no hay trigger sobre esa columna, así que nada (R13). Hoy,
  además, la corrección de datos está bloqueada en estados finales (`ESTADOS_SIN_CORRECCION`).
- **Recuperar una orden porcentual** recalcula con el `monto_cobrar` del instante (R14), a diferencia de
  SL-40 R16, que repite el importe revertido. Es la regla de la decisión cerrada («se cobra de nuevo con el
  `monto_cobrar` de ese momento»). Hoy no se llega a eso desde la app: una orden en estado final no es
  eliminable (`ESTADOS_ELIMINABLES`). Queda cubierto por SQL de dueño en el test.
- **Concurrencia.** El `UPDATE` de la orden ya bloquea su fila, así que dos operaciones sobre la misma
  orden se serializan y la segunda ve el movimiento de la primera (SL-40 §2.2). El `UNIQUE (organizacion_id,
  orden_id, secuencia)` es el cerrojo de último recurso.
- **Órdenes fijas y anteriores a la ficha.** No tienen condiciones: `cobro_plataforma_al_cambiar_borrado`
  sigue por su camino de siempre y el trigger de estado no hace nada (R11, R29).

### 3.4 Una sola fuente de «estado final» (R19)

La base no puede importar `ESTADOS_TERMINALES`. La copia vive en `orden_estado_es_final`, y
`tests/integration/db/cobro-porcentual-estados-finales.test.ts`:

- recorre **todos** los `value` de `order_status` y afirma que la función devuelve `true` exactamente para
  `["entregado", "devuelta_a_tienda", "incidente"]`, escrito a mano como contrato (patrón de
  `cohorte-carga-desenlaces.int.test.ts`);
- afirma además que ese literal es igual a `[...ESTADOS_TERMINALES]`. Si el dominio gana un cuarto
  terminal, el test cae y obliga a una migración.

### 3.5 Ejemplo numérico (el del test de integración)

Partida: global 500,00. A tiene el plan P porcentual, 2 % con mínimo 500. B tiene P y una excepción de
80,00.

| Paso | Movimiento | Deuda de A |
|---|---|---|
| A crea o1 (`monto_cobrar` 100.000) y o2 (10.000) | condiciones (2 %, 500); ningún cargo | 0,00 |
| B crea p1 | cargo 80,00 `empresa` (R7) | 0,00 |
| o1 → `entregado` | cargo 2.000,00 `plan` | 2.000,00 |
| o2 → `devuelta_a_tienda` | cargo 500,00 `plan` | 2.500,00 |
| P pasa a 5 % sin mínimo; A crea o3 (`monto_cobrar` vacío) | condiciones (5 %, —) | 2.500,00 |
| o1 sale de `entregado` (corrección) | reverso 2.000,00 | 500,00 |
| se corrige o1 a `monto_cobrar` 120.000 y vuelve a `entregado` | cargo 2.400,00 (2 % congelado) | 2.900,00 |
| o3 → `incidente` | cargo 0,00 (5 % de 0, sin mínimo) | 2.900,00 |
| se cambia `monto_cobrar` de o1 estando entregada | — (R13) | 2.900,00 |

## 4. Capas

### 4.1 Tipos (`lib/types/planes.ts`)

```ts
export const porcentajeSchema = /* el de hoy, ahora exportado */;
export const costoPorOrdenPorcentualSchema = z
  .object({ porcentaje: porcentajeSchema, minimo: montoCobroSchema.nullable() })
  .strict();
// crearPlanSchema y editarPlanSchema (y con ello versionPlanSchema) ganan, obligatorio y `null` para vacío:
costoPorOrdenPorcentual: costoPorOrdenPorcentualSchema.nullable(),
// y un refine: no los dos a la vez (R1), con `path: ["costoPorOrdenPorcentual"]`.
export type CostoPorOrdenPorcentual = z.infer<typeof costoPorOrdenPorcentualSchema>;
export type VersionPlan = Pick<EditarPlanInput, "nombre" | "topes" | "modulos" | "precio" | "costoPorOrden" | "costoPorOrdenPorcentual">;
export type PlanDTO = { /* … */ costoPorOrdenPorcentual: CostoPorOrdenPorcentual | null };
```

- **Por qué un campo hermano y no cambiar `costoPorOrden` a una unión.** `costoPorOrden: string | null` lo
  leen el rastro ya escrito, las versiones pendientes, el correo y más de diez archivos de `lib/` y `app/`
  (Grep). Un campo nuevo deja
  todo eso igual y añade lo suyo (§11, alternativa 3).
- `editarPlanSchema` es un `ZodObject` con `.omit()` para `versionPlanSchema`: el refine va en un
  `superRefine` aplicado a los tres esquemas finales, para no romper el `.omit()`.

### 4.2 Escritura y rastro

- `PlanesRepository.crear` y `aplicarVersion` escriben `costoPorOrdenPct` y `costoPorOrdenMinimo`. `aDTO`
  arma `costoPorOrdenPorcentual` (`toFixed(2)` en los dos).
- `diferenciasDelPlan` (`lib/planes/rastro.ts`) gana el campo `costoPorOrdenPorcentual`, con importes
  canónicos (`"2"` y `"2.00"` son el mismo). Antes y después se guardan como `{ porcentaje, minimo } | null`.
- `lineasDeCambioDelPlan` (`lib/planes/mensajes.ts`): línea `Costo por orden porcentual: A → B` con
  `textoDelCostoPorOrdenPorcentual` (R4). Así el correo de SL-24 R41 la lleva sin tocar el envío.
- `PlanesService` no cambia de orden: quién (R3) → zod (R1, R2) → existe → reglas → repositorio.
- `tieneCostoConcreto` pasa a `precio.tipo === "monto" && (costoPorOrden !== null ||
  costoPorOrdenPorcentual !== null)` (R5). `PlanParaCosto` gana el campo.

### 4.3 Lecturas

| Pieza | Cambio |
|---|---|
| `lib/types/consumo-plan.ts` | `CostoVigente = { modo: "fijo"; monto: string; fuente: FuenteDelCosto } \| { modo: "porcentual"; porcentaje: string; minimo: string \| null; fuente: "plan" }` |
| `CosteoDelCiclo` | Unión discriminada por `modo`. `"fijo"`: lo de hoy más `modo`. `"porcentual"`: `base`, `porcentaje`, `minimo`, `cobrado`, `pendientes`, `total` (`base + cobrado`, `null` si la base está por definir), `sinCostoConcreto`, `anualNoAplicaAlCosto` |
| `lib/planes/costeo.ts` | `costeoDelCiclo(plan, costoVigente, ordenes, cobroCiclo)`. En porcentual el total es `base + cobrado`, en céntimos exactos (`lib/planes/centimos.ts`), sin `@prisma/client` (SLT-66 §4.3) |
| `MiPlanRepository` | El zod de `costo_vigente` admite `monto: string \| null`, `porcentaje`, `minimo`; suma `cobro_ciclo: { cobrado: importe, pendientes: z.int() }` y `costo_por_orden_pct`, `costo_por_orden_minimo`. Mapea a `CostoVigente` |
| `PlanesRepository.planDeEmpresa` (superadmin) | Lee las columnas nuevas de `cobro_plataforma_tarifa_de` y `plan_cobro_del_ciclo(org, inicio)` en la misma `comoPlataforma` |
| `EmpresasPlataformaRepository.planYCobroVigente` | Selecciona `porcentaje` y `minimo`. `EmpresaListada.cobroVigente` pasa a `CostoVigente` |
| `lib/planes/consumo.ts` | `PlanConUsoLeido` suma `cobroCiclo`; pasa todo a `costeoDelCiclo` |

### 4.4 Textos (`lib/planes/mensajes.ts`)

| Función | Texto |
|---|---|
| `textoDelCostoPorOrdenPorcentual({ porcentaje, minimo })` | `«{p} % del valor del paquete, mínimo {m}»`; sin mínimo `«{p} % del valor del paquete»` (R21) |
| `textoDelCobroVigente(c: CostoVigente)` (columna «Cobro por orden») | fijo: el importe de hoy; porcentual: `«{p} % (mín. {m})»` o `«{p} %»` (R22) |
| «Mi plan» porcentual (`ConsumoDelPlan`) | `Costo por orden: {texto porcentual}`, con la nota «se cobra cuando la orden llega a un estado final»; `Cobrado en el ciclo: {c}`; `Órdenes del ciclo sin estado final: {n}`; `Total del ciclo hasta hoy: {base} + {c} = {t}` (R23) |

`{p}` y `{m}` van con dos decimales, sin moneda, como el resto de importes del plan (SLT-66 §2.5).

## 5. Autorización

| Operación | Quién | Dónde | R |
|---|---|---|---|
| Crear, editar o programar el modo porcentual | superadmin (`esPlataforma`) | `PlanesService`, antes del repositorio | R3 |
| Leer su costeo | `maestro` y `admin` de la empresa | `MiPlanService` (`ROLES_MI_PLAN`) y la base (`plan_de_la_empresa`, `42501`) | R25 |
| Leer el costeo de una empresa y el listado | superadmin | `PlanesService.planDeEmpresa`, `EmpresasPlataformaService` | R22, R23 |
| Escribir condiciones, cargos o reversos | nadie desde la app | triggers `SECURITY DEFINER`, `REVOKE` | R17 |

No hay módulo que encender: planes y cobro son núcleo.

## 6. Pantallas

No hay pantalla nueva: se amplían las de SLT-58 y SLT-66, así que no pasa por `/design` (precedente SL-40
D5).

### 6.1 `PlanForm.tsx` (R20)

- Un `RadioGroup` «Cobro por orden»: «Fijo» o «Porcentual». Al abrir un plan, el modo sale de
  `costoPorOrdenPorcentual !== null`.
- «Fijo»: el campo «Costo por orden» de SLT-66. «Porcentual»: «Porcentaje» (sufijo `%`) y «Mínimo»
  (opcional, con el mismo componente de importe que usa hoy el costo por orden).
- Al enviar, el modo no elegido viaja como `null`. Cambiar de modo no borra lo escrito en el otro mientras
  no se envía, para no perder datos por un clic.
- Los errores llegan con `path` `costoPorOrdenPorcentual.porcentaje` / `.minimo` y se pintan junto al
  campo, como el resto (SLT-58 R18).

### 6.2 Catálogo, detalle y modal (R21)

Los cuatro leen `plan-vista.ts`: la línea `Costo por orden` usa `textoDelCostoPorOrdenPorcentual` si el
plan es porcentual. No hay cambio de componente.

### 6.3 «Empresas» (R22)

`CobroPorOrden.tsx` pinta `textoDelCobroVigente(empresa.cobroVigente)` con la fuente de hoy («propio»,
«del plan», «global»). La edición de la excepción no cambia (sigue siendo un importe fijo, R7).

### 6.4 `ConsumoDelPlan.tsx` («Mi plan» y detalle de empresa; R23, R26)

Rama por `costeo.modo`. La rama `"fijo"` es la de hoy, sin cambio de texto. La rama `"porcentual"` pinta
las líneas de §4.4, y el aviso «Plan sin costo concreto» del superadmin igual que hoy.

## 7. Contratos de entrada y salida

| Acción | Entrada nueva | Salida |
|---|---|---|
| `crearPlanAction`, `editarPlanAction` | `costoPorOrdenPorcentual: { porcentaje: string; minimo: string \| null } \| null` (obligatorio) | la de hoy; `validation_error` con `path` nuevo |
| `miPlanAction` / página «Mi plan» | — | `PlanConConsumo.costeo: CosteoDelCiclo` (unión) |
| Listado de «Empresas» | — | `EmpresaListada.cobroVigente: CostoVigente` |

Todos los importes y porcentajes viajan como texto con dos decimales; la pantalla no hace aritmética
(SL-40 R26).

## 8. Lo que NO cambia

- El valor global, la excepción y su edición (R7).
- El cobro de las órdenes fijas y anteriores a la ficha (R11, R29).
- La deuda de la wallet, el libro y la caja (R18).
- Los topes y el conteo de órdenes del ciclo (`plan_uso_ordenes`).

## 9. Tests

### 9.1 Nuevos

| Archivo | R |
|---|---|
| `tests/unit/types/planes-schema-costo-porcentual.test.ts` | R1, R2 |
| `tests/unit/services/planes-service-costo-porcentual.test.ts` | R3, R5 |
| `tests/unit/planes/rastro-costo-porcentual.test.ts` | R4 |
| `tests/unit/planes/costo-concreto-porcentual.test.ts` | R5 |
| `tests/unit/planes/mensajes-costo-porcentual.test.ts` | R21, R22 (textos) |
| `tests/unit/planes/costeo-porcentual.test.ts` | R23 |
| `tests/integration/db/plan-costo-porcentual-escritura.test.ts` | R1, R2, R4 |
| `tests/integration/db/cobro-plataforma-porcentual.test.ts` | R6–R8, R10–R16, R18 (§3.5 entero) |
| `tests/integration/db/cobro-plataforma-porcentual-importe.test.ts` | R9 |
| `tests/integration/db/cobro-plataforma-porcentual-aislamiento.test.ts` | R17 |
| `tests/integration/db/cobro-porcentual-estados-finales.test.ts` | R19 |
| `tests/integration/db/plan-de-la-empresa-porcentual.test.ts` | R24, R25 |
| `tests/integration/db/empresas-plataforma-cobro-porcentual.test.ts` | R22 |
| `tests/integration/db/migracion-slt83-ida-y-vuelta.test.ts` | R27 |
| `tests/components/PlanFormCostoPorcentual.test.tsx` | R20 |
| `tests/components/PlanEmpresaCostoPorcentual.test.tsx` | R21 (modal) |
| `tests/components/EmpresasModuleCobroPorcentual.test.tsx` | R22 |
| `tests/components/ConsumoDelPlanPorcentual.test.tsx` | R23 |

### 9.2 E2E (R28)

`e2e/planes-costo-porcentual.spec.ts`, con el OTP y el plan de `e2e/_planes-fixture.ts` y la orden de
`e2e/_escenarios/reparto.ts`. El paso 5 lleva la orden a `entregado` con `llevarA`/`gestionar` (el mismo
camino que los E2E de cierre), no con SQL de dueño: así el trigger de estado se prueba por la vía real.
Cada paso afirma la cifra en pantalla (deuda de la wallet, columna del listado, «Mi plan»).

### 9.3 Tests existentes que cambian

Solo por el tipo (R29), sin cambiar ninguna aserción de comportamiento:

- los que construyen `PlanDTO`, `VersionPlan` o entradas de `crear`/`editar` ganan
  `costoPorOrdenPorcentual: null` (`tests/unit/services/planes-service*.test.ts`,
  `tests/unit/types/planes-schema-costeo.test.ts`, `tests/unit/planes/rastro-costeo.test.ts`, los fixtures
  `tests/integration/db/_fixtures/planes.ts` y `e2e/_planes-fixture.ts`);
- los que construyen `costoVigente` o `CosteoDelCiclo` ganan `modo: "fijo"`
  (`tests/unit/planes/costeo.test.ts`, `tests/components/ConsumoDelPlan*.test.tsx`,
  `tests/components/EmpresasModule*.test.tsx`);
- `tests/integration/db/plan-de-la-empresa-costeo.test.ts`: la forma de `costo_vigente` gana dos claves.

El implementer lista en `progress/impl_SLT-83.md` cada test tocado y la causa. Un cambio de aserción que no
sea de tipo es un BLOQUEANTE del reviewer.

### 9.4 Mutaciones que deben matar los tests

- quitar `devuelta_a_tienda` o `incidente` de `orden_estado_es_final` (R8, R19);
- `GREATEST` → `LEAST`, o `COALESCE(p_minimo, 0)` → el global (R9);
- reverso con el importe recalculado en vez del del último cargo (R12);
- quitar la entrada de la conciliación de `cobro_plataforma_al_cambiar_borrado` (R14);
- invertir el orden excepción/plan en `cobro_plataforma_tarifa_de` (R7);
- `round` → `trunc` (R9: 290,11 pasaría a 290,10).

## 10. Choques con ramas en vuelo

`db/schema.prisma` lo tocan también SLT-43, SLT-44, SLT-65 (geografía) y SLT-52 (tarifas flexibles). Esta
ficha solo añade un modelo, dos campos en `Plan` y una relación inversa en `Orden` y en `Organizacion`: el
merge es de líneas distintas. **No toca** `lib/repositories/OrdenRepository.ts`: el cobro vive en
triggers. Las migraciones van con timestamp propio (§2) y se renombran si otra rama mergea antes una
posterior. `scripts/archivos-en-vuelo.mjs` lo confirma al tomar la ficha; el humano acepta o no el choque
en `schema.prisma`.

## 11. Alternativas descartadas

1. **Congelar las condiciones en columnas de `orden`.** Descartada. `servi_app` tiene `UPDATE` sobre
   `orden`: la empresa podría bajarse el porcentaje con SQL a mano, y cerrarlo exige un `REVOKE` por
   columna que nadie más usa. Además `orden` es la tabla más disputada (SLT-43/44/65/52 y muchos repositorios),
   y su modelo Prisma ya pasa de 250 líneas. Una tabla aparte, de solo lectura para la empresa, cierra R17
   con el patrón de SL-40.
2. **Una columna `costo_por_orden_modo` (enum `fijo`/`porcentual`).** Descartada. Crea estados imposibles
   (modo `porcentual` sin porcentaje, `fijo` con porcentaje) que habría que cerrar con más `CHECK`. Derivar
   el modo de qué columna tiene valor deja un solo `CHECK` (`plan_costo_por_orden_un_modo`).
3. **Cambiar `costoPorOrden` a una unión `{ modo: "fijo" … } | { modo: "porcentual" … }`.** Descartada:
   obligaría a reescribir las versiones pendientes, a migrar el formato del rastro ya escrito y a tocar todos
   los archivos que leen el campo. El campo hermano es aditivo (§4.1).
4. **Un valor nuevo `plan_porcentual` en `cobro_plataforma_fuente`.** Descartada. La fuente dice de qué
   escalón de la regla sale el importe, y sigue siendo el plan (la columna «Cobro por orden» dice «del
   plan»). Un valor de enum nuevo exige carpeta propia y un `down.sql` que se niegue a bajar, sin que
   ningún requisito lo lea. Si un día hace falta distinguirlo, la tabla de condiciones ya lo dice.
5. **Calcular el cargo en TS, en el servicio que cambia el estado.** Descartada por §3.1: muchos repositorios
   cambian el estado. Es el mismo motivo por el que SL-40 cobra en un trigger.
6. **Un movimiento `cargo` de 0,00 al crear y otro «ajuste» al estado final.** Descartada: rompe la
   alternancia `cargo, reverso, cargo…` de SL-40 §2.2 (el trigger de anulación lee el último movimiento) y
   necesitaría un tipo nuevo.
7. **Leer `ESTADOS_TERMINALES` desde una tabla de configuración.** Descartada: el catálogo de estados es
   código (`order-status-transiciones.ts`) y una tabla sería una segunda fuente editable. Se queda la copia
   SQL atada por test (§3.4).

## 12. Dependencias

Ninguna nueva (decisión cerrada). El decimal exacto sale de `numeric` en la base y de
`lib/planes/centimos.ts` en TS.

## 13. Riesgos

- **P1 sin cerrar.** Solo cambia el filtro de `plan_cobro_del_ciclo` (§2.3 punto 8) y el test de R24. El
  resto se implementa igual.
- **`DROP` de `cobro_plataforma_tarifa_de`.** Si alguna función no listada la usa, fallaría al llamarse, no
  al migrar. Grep: la usan el trigger de alta, `plan_de_la_empresa`, `PlanesRepository.planDeEmpresa` y
  `EmpresasPlataformaRepository`. T1 lo vuelve a comprobar con
  `SELECT proname FROM pg_proc WHERE prosrc LIKE '%cobro_plataforma_tarifa_de%'`.
- **Volumen.** La carga masiva hace un `INSERT` más por orden en modo porcentual. Es una fila pequeña con
  PK; no cambia el orden de magnitud del alta.
- **El invariante «toda orden tiene su cargo» de SL-40** (comentario de `20261024120000`) deja de ser
  cierto para las órdenes porcentuales sin estado final. T5 busca tests o guardias que lo afirmen y los
  acota a las órdenes sin condiciones, con la causa en `progress/impl_SLT-83.md`.
