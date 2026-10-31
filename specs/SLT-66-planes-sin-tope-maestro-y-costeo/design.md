# SLT-66 — planes-sin-tope-maestro-y-costeo · design.md

> Requisitos: `requirements.md` (R1–R27, P1–P3 abiertas con propuesta). Hereda el diseño de
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
```

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

**Orden de bajada:** M3 → M2 → M1, el inverso de la subida. M3 baja primero porque su cuerpo nombra
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
  base: { tipo: "monto"; mensual: string } | { tipo: "sin_precio" } | { tipo: "negociable" };
  costoPorOrden: string;          // el vigente (R12, P1)
  fuente: FuenteDelCosto;
  ordenes: number;                // órdenes del ciclo (= uso.ordenes)
  subtotalOrdenes: string;        // ordenes × costoPorOrden
  total: string | null;           // base + subtotal; null si la base es negociable (R20, P2)
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
| Base con monto | «Costo base: 50000.00 al mes» · «Costo por orden: 100.00» + nota de fuente (P1) · «Órdenes del ciclo: 3 × 100.00 = 300.00» · **«Total estimado del ciclo: 50300.00»** |
| Sin precio (P2) | «Costo base: sin costo base» · igual · **«Total estimado del ciclo: 300.00»** |
| Negociable (P2) | «Costo base: negociable» · igual · «El total depende del costo base acordado.» (sin total) |
| Anual fijo o descuento | Más «El pago anual no cambia el costo por orden.» |

- **Nota de fuente** (P1):
  - `empresa` → «acordado para tu empresa» (en el detalle del superadmin, «excepción de la empresa»);
  - `plan` → ninguna;
  - `global` y `sin_configurar` → «valor general de la plataforma».
- **Debajo**, en `text-xs text-muted-foreground`: «Estimado: el costo base no se cobra todavía; cada
  orden se cobra al crearla y se descuenta si se anula.» (R21).
- **Los importes** se pintan como `textoDelPrecio` (texto de la base, sin símbolo ni `Number`). Su
  formato es de SLT-67 y de D33.
- **Sin plan** sigue igual: «Tu empresa no tiene plan asignado: sin límites».

### 6.4 «Empresas» (solo si se aprueba P3) — T15

- **`EmpresasPlataformaRepository`** lee, por fila, `cobro_plataforma_tarifa_de(o.id)` en el mismo
  `comoPlataforma`.
- **`EmpresaListada`** gana `cobroVigente: { monto, fuente }`.
- **`EmpresasModule`** pinta la etiqueta «del plan» para la fuente `plan`. Deja de derivar la tarifa en
  la pantalla.

Si P3 no se aprueba, nada de esto se toca.

## 7. Contratos de entrada y salida

- **Entrada del superadmin.** `crearPlanAction`, `editarPlanAction` (inmediata o programada) y
  `asignarPlanAction`/`previsualizarAsignacionPlanAction` mantienen su firma (`input: unknown`). Las
  dos primeras exigen `costoPorOrden: string | null`.
- **`PlanResult` sin variantes nuevas.** El error del campo va en `validation_error.fieldErrors.costoPorOrden`
  (R8). Un tope de maestro sale en `fieldErrors["topes.porRol"]`, con la clave que zod produzca: el
  test afirma `validation_error` y que no se escribe (R1).
- **`PlanDTO`, `PlanDelCatalogo` y `DetallePlan`** llevan `costoPorOrden`.
- **`PlanConConsumo`** lleva `costeo` (§4.3).

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
| `tests/unit/planes/costeo.test.ts` | unit | R19, R20: monto, sin precio, negociable, cero órdenes, decimales (`0.10 × 3`), importes grandes (`DECIMAL(12,2)`); con descuento, el total es el mismo que sin él (R10). Ningún `Number(` ni `parseFloat` sobre importes |
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
   Lo asigna desde el detalle de A.
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

**SL-40.** `cobro-plataforma-cargos.test.ts` y `migracion-sl40-ida-y-vuelta.test.ts` no cambian. Sus
empresas no tienen plan, así que la regla es la de antes (R12, pasos 1, 3 y 4). El segundo usa una base
propia hasta SL-40.

### 9.4 Mutaciones que deben matar los tests (medidas en `progress/impl_SLT-66.md`)

1. `cobro_plataforma_tarifa_de` mira el plan antes que la excepción.
2. Ignora el plan (vuelve a `excepción ?? global`).
3. Lee `costo_por_orden` del plan sin `LEFT JOIN` (una empresa sin plan pierde el global).
4. El `CHECK` de `plan_tope_rol` vuelve a admitir `maestro`.
5. `costeoDelCiclo` aplica el descuento anual al total.
6. `plan_de_la_empresa` calcula su costo con una regla propia en vez de llamar a la función (el test
   de §3.2 lo detecta cuando hay excepción).

## 10. Choques con ramas en vuelo

| Archivo | Rama | Cómo se resuelve |
|---|---|---|
| `app/(app)/plataforma/planes/_components/PlanForm.tsx`, `tests/components/PlanForm.test.tsx` | SLT-67 (PR #51, de la misma persona) | La tanda D empieza con un merge de `dev` si #51 ya entró. Si no, quien mergee segundo rebasa. `MontoInput` se usa si existe |
| `db/schema.prisma`, orden de migraciones | cualquiera con migración | T0 lo comprueba contra `dev` |
| `lib/repositories/EmpresasPlataformaRepository.ts`, `EmpresasModule.tsx` | — | Solo si se aprueba P3 |

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
- **P1–P3 abiertas.** Si el humano cierra P1 de otra forma (el costo del plan y no el vigente), solo
  cambian la lectura de `costo_vigente` en `costeoDelCiclo` y la nota de fuente: la base ya devuelve
  los dos valores.
