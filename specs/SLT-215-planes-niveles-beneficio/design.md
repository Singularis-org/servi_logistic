# SLT-215 — planes-niveles-beneficio · design.md

## Lo que ya existe

Busqué «nivel», «volumen», «meta de órdenes» y «órdenes efectivas» en `feature_list.json`, en `specs/` y en el código.
El grafo no tiene índice de este worktree (`index_status`: proyecto no indexado), así que el código lo revisé con Grep y
Read.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| SLT-216 «Planes: descuento por nivel en el cobro, la factura y «Mi plan»» | La ficha hermana, `pending`, que depende de esta | Fuera (decisión cerrada). Esta ficha le deja el nivel vigente por fecha (§1.3) y `descuentosDelNivel` (R2). |
| SLT-214 «Planes: beneficios de texto con ícono» (`specs/SLT-214-planes-beneficios-texto/`, mergeada) | Una lista hija del plan, con su tabla, su clave en las versiones, su paso del formulario y su columna | **Es el molde** de §1.1, §3 y §4: `plan_beneficio`, `beneficiosSchema`, `PASOS_DE_*`, el CHECK `plan_borrador_pasos_conocidos`, `aplicarVersion`, `planCanonico`. |
| `DescuentoPeriodo` y `descuentoPeriodoSchema` (`lib/types/planes.ts`, SLT-86) | Un descuento en porcentaje o en monto, nunca los dos, con el error en su campo | Se copia la forma para el descuento del nivel. No se reutiliza el esquema tal cual: su monto admite 0 (§3.1). |
| `porcentajeSchema` (`lib/types/planes.ts`) y `montoCobroSchema` (`lib/types/cobro-plataforma.ts`) | Porcentaje `(0, 100]` y monto de dos decimales como texto | Se reutilizan. |
| `cobro_plataforma_movimiento` (SL-40) con su índice `(organizacion_id, ocurrido_at)` | Cargos y reversos por orden, append-only; anular = reverso, recuperar = cargo nuevo, cancelar por API = sin reverso | Es la fuente de las órdenes efectivas (§2.1). No se toca. |
| `plan_cobro_del_ciclo` (SLT-83) | Cobrado = Σ cargos − Σ reversos con `ocurrido_at >= desde` | No sirve tal cual: cuenta importes, no órdenes, y no mira un fin. Se escribe una función hermana (§2.1). |
| `plan_inicio_periodo_calendario` y `plan_fin_periodo_calendario` (`20261106120000_plan_periodo_facturacion`, SLT-86) | Los bordes del período de calendario a las 00:00 −06:00 | Son **la** zona del cierre (R23). Se llaman con `'mensual'`; no se copia el `interval '6 hours'`. |
| `factura_plataforma_cerrar` y `jobs-factura-plataforma.ts` (SLT-118) | Un cierre de plataforma idempotente: función del dueño por empresa y trabajo recurrente de la cola que recorre las empresas | **Es el molde** del cierre mensual (§2, §5). |
| `recibirCambio` y `aplicarEnTx` (`PlanesRepository`, SLT-128 y SLT-86) | Donde una empresa recibe un cambio programado y donde cambia de plan, con la empresa en `FOR UPDATE` | Son los dos puntos del recálculo (§3.4). |
| `app/api/cron/*` y `vercel.json` | Los crons de Vercel, cada uno con su ruta y `CRON_SECRET` | No se añade otro (alternativa B, §8). |

Nada de lo encontrado calcula ya un nivel por volumen.

## 1. Modelo de datos

### 1.1 `plan_nivel` (de PLATAFORMA)

```prisma
// SLT-215 (design §1.1; R1, R6) — un nivel de beneficio por volumen de un plan. De PLATAFORMA, como
// `plan_beneficio`. Viven solo en el SQL de 20261121120100: los CHECK, la RLS sin políticas y el
// `REVOKE ALL … FROM servi_app`. Que las metas crezcan con el nivel vive en zod (`nivelesSchema`).
model PlanNivel {
  planId         String   @map("plan_id")
  plan           Plan     @relation(fields: [planId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  nivel          Int
  meta           Int
  descuentoPct   Decimal? @map("descuento_pct") @db.Decimal(5, 2)
  descuentoMonto Decimal? @map("descuento_monto") @db.Decimal(12, 2)

  @@id([planId, nivel])
  @@map("plan_nivel")
}
```

En `Plan` se añade `niveles PlanNivel[]`.

- **CHECK:**
  - `plan_nivel_nivel_check`: `"nivel" BETWEEN 1 AND 10` (R1, P2);
  - `plan_nivel_meta_check`: `"meta" >= 1`;
  - `plan_nivel_una_forma`: `("descuento_pct" IS NULL) <> ("descuento_monto" IS NULL)`;
  - `plan_nivel_pct_check`: `"descuento_pct" IS NULL OR ("descuento_pct" > 0 AND "descuento_pct" <= 100)`;
  - `plan_nivel_monto_check`: `"descuento_monto" IS NULL OR "descuento_monto" > 0`.
- **Sin CHECK de metas crecientes.** Compara filas entre sí: pide un trigger de restricción. Todo lo que escribe pasa
  por `nivelesSchema` (crear, programar, aplicar la versión), como la regla de duplicados de SLT-214.
- **RLS habilitada sin políticas y `REVOKE ALL … FROM servi_app`** (R6).

En `plan_cambio_programado.version`, `plan_version_empresa.version` y `plan_borrador.pasos`, los niveles viajan como
`niveles: [{ meta, descuento: { tipo: "porcentaje", porcentaje } | { tipo: "monto", monto } }]`. El número es el
índice + 1. No hay columna nueva.

### 1.2 `plan_nivel_empresa` (de NEGOCIO): el estado de cada empresa

```prisma
// SLT-215 (design §1.2; R24–R37) — el nivel vigente de una empresa con plan y lo que el cierre necesita.
// Una fila por empresa con plan. De NEGOCIO. La escriben SOLO las funciones del dueño de 20261121120100;
// `servi_app` solo la lee (política `plan_nivel_empresa_por_empresa`, `REVOKE INSERT, UPDATE, DELETE`).
model PlanNivelEmpresa {
  nivel            Int      @default(0)
  mesesSinCumplir  Int      @default(0) @map("meses_sin_cumplir")
  cerradoHastaAt   DateTime @map("cerrado_hasta_at") @db.Timestamp(3)
  entradaAt        DateTime @map("entrada_at") @db.Timestamp(3)
  updatedAt        DateTime @default(now()) @updatedAt @map("updated_at")

  organizacionId String       @id @map("organizacion_id")
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@map("plan_nivel_empresa")
}
```

- `cerrado_hasta_at`: el fin (excluido, UTC) del último mes cerrado, que es el inicio del primer mes pendiente. Un mes
  `m` está pendiente si `m.fin <= inicio del mes de ahora` y `m.inicio >= cerrado_hasta_at`.
- `entrada_at`: la entrada de la empresa a su plan actual (R24). **No es `plan_ciclo_ancla_at`**: esa columna
  también se mueve al cambiar el tipo de cobro, y R34 dice que eso no toca el nivel.
- **CHECK:** `nivel BETWEEN 0 AND 10` y `meses_sin_cumplir IN (0, 1)`: el 2 no se guarda, porque al llegar a 2 baja
  y vuelve a 0 (R26).
- La FK a `organizacion` es CASCADE, como la de `factura_plataforma`: las limpiezas de los tests y la demo borran
  empresas.

### 1.3 `plan_nivel_historial` (de NEGOCIO)

```prisma
// SLT-215 (design §1.3; R35) — cada inicio de nivel de una empresa: subida, bajada o recálculo. Solo se añade.
// De NEGOCIO, como `plan_nivel_empresa`. `planId` es una copia sin FK, como en `cobro_plataforma_traza`.
model PlanNivelHistorial {
  id               String   @id @default(dbgenerated("(gen_random_uuid())::text"))
  planId           String   @map("plan_id")
  nivel            Int
  nivelAnterior    Int      @map("nivel_anterior")
  motivo           String   // CHECK: subida | bajada | cambio_niveles | cambio_plan
  desdeAt          DateTime @map("desde_at") @db.Timestamp(3)
  mesInicioAt      DateTime? @map("mes_inicio_at") @db.Timestamp(3)
  ordenesEfectivas Int?     @map("ordenes_efectivas")
  createdAt        DateTime @default(now()) @map("created_at")

  organizacionId String       @map("organizacion_id")
  organizacion   Organizacion @relation(fields: [organizacionId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([organizacionId, desdeAt])
  @@map("plan_nivel_historial")
}
```

- **CHECK:** el motivo en su lista; `nivel` y `nivel_anterior` entre 0 y 10; `ordenes_efectivas >= 0`; mes y órdenes
  los dos o ninguno.
- **Único parcial** `plan_nivel_historial_un_cierre_por_mes` en `(organizacion_id, mes_inicio_at) WHERE motivo IN
  ('subida','bajada')`: la segunda red de «nunca repite un mes» (R29). Empieza por `organizacion_id`, como pide la
  guardia `unicos-por-empresa`.
- **El nivel vigente en un instante `t`** es el `nivel` de la fila con el mayor `desde_at <= t`; sin fila, 0. Es lo
  que leerá SLT-216 en el cargo. Por eso el índice `(organizacion_id, desde_at)`.

### 1.4 Clasificación y aislamiento

- `lib/db/modelos-de-negocio.ts`: `PlanNivel` de plataforma; `PlanNivelEmpresa` y `PlanNivelHistorial` de negocio.
  La guardia `organizacion-en-modelos` lo exige.
- Las dos de negocio llevan la política `<tabla>_por_empresa` de SL-17 (`organizacion_id =
  current_setting('app.organizacion_id')`), `GRANT SELECT` y `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` (R36),
  como `factura_plataforma`. No tienen FK a otra tabla de negocio: no hacen falta triggers de misma empresa.

## 2. Funciones del dueño (migración `20261121120100_plan_nivel`)

Todas `SECURITY DEFINER` con `SET search_path = public` y `REVOKE EXECUTE … FROM PUBLIC`. Las llama solo código que
corre como plataforma (§3.4, §5), igual que `factura_plataforma_cerrar`.

### 2.1 Órdenes efectivas (R22)

```sql
-- R22: órdenes distintas con un cargo en [p_desde, p_hasta) que sigue vigente en p_hasta y que no se
-- cancelaron antes de p_hasta.
CREATE FUNCTION plan_nivel_ordenes_efectivas(p_org text, p_desde timestamp, p_hasta timestamp)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT c."orden_id")::int
    FROM "cobro_plataforma_movimiento" c
   WHERE c."organizacion_id" = p_org AND c."tipo" = 'cargo'
     AND c."ocurrido_at" >= p_desde AND c."ocurrido_at" < p_hasta
     AND NOT EXISTS (SELECT 1 FROM "cobro_plataforma_movimiento" r
                      WHERE r."organizacion_id" = p_org AND r."orden_id" = c."orden_id" AND r."tipo" = 'reverso'
                        AND r."secuencia" > c."secuencia" AND r."ocurrido_at" < p_hasta)
     AND NOT EXISTS (SELECT 1 FROM "orden_historial_estado" h
                      WHERE h."organizacion_id" = p_org AND h."orden_id" = c."orden_id"
                        AND h."origen_tipo" = 'cancelacion_api' AND h."created_at" < p_hasta) $$;
```

- **Anuladas.** «Con cargo vigente» es lo que dice la decisión. Anular deja un reverso y recuperar deja un cargo nuevo
  (SL-40 R15, R16). Una orden creada, anulada y recuperada en el mes cuenta una vez, por su último cargo. Una anulada y
  no recuperada antes del fin no cuenta.
- **Canceladas (decisión P3).** No cuentan, aunque conserven su cargo. En el modelo real, la única cancelación que
  existe es la de la tienda por la API: `OrdenRepository.cancelarViaApi`, por `app/api/ordenes/api-key/[numGuia]/cancelar`.
  - No borra la orden ni deja reverso (SL-40 P3). Mueve la orden de `en_bodega_central` o `en_ruta_bodega_central` a
    `devolviendo_a_tienda` y escribe, en la misma transacción, una fila de `orden_historial_estado` con `origen_tipo =
    'cancelacion_api'` y `motivo = 'cancelada por tienda'` (`OrdenHistorialOrigenTipo`, `db/schema.prisma`;
    `lib/types/orden-historial.ts`).
  - Esa fila es la marca. El estado `devolviendo_a_tienda` no sirve: también se llega a él sin cancelar.
  - El historial es inmutable (feature 49), así que la marca no se pierde. Ninguna transición deshace una
    cancelación (`lib/types/order-status-transiciones.ts`).
  - En el `orden_historial_estado`, `created_at` es el instante de la transición. Una orden cancelada antes de
    `p_hasta` no cuenta, aunque su cargo sea de ese mes.
- **Ejemplo de la decisión:** 15 200 órdenes con cargo vigente, de las que 300 tienen fila `cancelacion_api`, dan
  14 900.
- **El fin cuenta y el reloj no.** Solo mira lo registrado antes de `p_hasta`, así que cerrar un mes el día 1 o el 5
  da el mismo número (R29). Una anulación o una cancelación del día 2 de una orden de enero no cambian enero. La
  orden tampoco cuenta en febrero, porque su cargo no es de febrero.
- **Índices.** El cargo usa `(organizacion_id, ocurrido_at)`. El primer `NOT EXISTS` va por el único
  `(organizacion_id, orden_id, secuencia)` y el segundo por `orden_historial_estado (orden_id, created_at)`.
- **Permisos.** `orden_historial_estado` tiene RLS sin políticas (feature 49). La función es `SECURITY DEFINER` del
  dueño, así que la lee igual que `cobro_plataforma_movimiento`.
- **Si un día aparece otra forma de cancelar** (otro `origen_tipo` o un estado propio), se añade aquí. La guardia de
  T3 lo vigila: el test lista los `origen_tipo` del enum y falla si aparece uno nuevo cuyo nombre contenga
  `cancel` y no esté en la función.

### 2.2 Los niveles que corre una empresa

`plan_nivel_metas_de_la_empresa(p_org text) RETURNS integer[]`, `STABLE`: las metas en orden de nivel.
- Si la empresa tiene `plan_version_empresa` y su `version ? 'niveles'`, salen de ahí.
- Si no, salen de `plan_nivel` de su `plan_id`.
- Sin plan, `'{}'`.

La forma «versión propia si trae la clave; si no, el plan» es la de `beneficios` en `plan_de_la_empresa` (SLT-214
§3.4).

### 2.3 Cerrar los meses pendientes (R25–R30)

`plan_nivel_cerrar_meses(p_org text, p_ahora timestamp) RETURNS integer` (meses cerrados):

1. `SELECT … FROM organizacion WHERE id = p_org FOR UPDATE`, y después la fila de `plan_nivel_empresa` `FOR UPDATE`.
   Sin fila → 0. Es el mismo cerrojo que toman `factura_plataforma_cerrar` y el cambio de plan: dos cierres, o un
   cierre y un recálculo, de la misma empresa se serializan (R29).
2. `v_hoy := plan_inicio_periodo_calendario('mensual', p_ahora)`; `v_metas := plan_nivel_metas_de_la_empresa(p_org)`.
3. Mientras `cerrado_hasta_at < v_hoy`, con `m_ini := cerrado_hasta_at` y `m_fin :=
   plan_fin_periodo_calendario('mensual', m_ini)`:
   - `n := plan_nivel_ordenes_efectivas(p_org, GREATEST(m_ini, entrada_at), m_fin)` (R24);
   - `alto :=` el mayor `k` con `v_metas[k] <= n`, o 0;
   - `nivel := LEAST(nivel, cardinality(v_metas))` (defensa: un recálculo ya lo deja en rango);
   - si `alto > nivel` → **sube** a `alto`, cuenta 0, historial `subida` con `desde_at = m_fin` (R25);
   - si `nivel = 0` → nada (R28);
   - si `n >= v_metas[nivel]` → cuenta 0 (R27);
   - si no, cuenta + 1; con 2 → **baja** a `nivel − 1`, cuenta 0, historial `bajada` con `desde_at = m_fin` (R26);
   - `cerrado_hasta_at := m_fin`.
4. Devuelve los meses cerrados.

Las metas son las que la empresa corre **al cerrar**. Un cambio de niveles que llega entre el fin del mes y el
cierre cierra antes los pendientes con las de antes (§2.4), así que nunca se cierra un mes con unas metas que la
empresa no tenía cuando terminó, salvo por el caso raro de §10.

### 2.4 Recalcular y tomar un plan (R31–R33)

- `plan_nivel_recalcular(p_org text, p_desde timestamp, p_motivo text) RETURNS integer` (el nivel nuevo). Supone que
  quien llama ya cerró los pendientes (§3.4):
  - `m_fin := plan_inicio_periodo_calendario('mensual', p_desde)` y `m_ini :=` el inicio del mes anterior;
  - `n := plan_nivel_ordenes_efectivas(p_org, m_ini, m_fin)`, **sin** recortar por la entrada: la decisión dice «el
    último mes cerrado» y, en un cambio de plan, ese mes es entero del plan de antes;
  - `nivel :=` el más alto cumplido con `plan_nivel_metas_de_la_empresa(p_org)`, cuenta 0;
  - una fila de historial con `p_motivo`, `desde_at = p_desde`, `mes_inicio_at = m_ini` y `n`. Se escribe aunque el
    nivel no cambie: el recálculo reinicia la cuenta y su motivo es dato (R35).

  El único parcial de §1.3 no la alcanza: su motivo no es `subida` ni `bajada`.
- `plan_nivel_tomar_plan(p_org text, p_desde timestamp) RETURNS void`, después del `UPDATE` del plan de la empresa:
  - **sin fila** (primera asignación, P4) → inserta nivel 0, cuenta 0, `entrada_at = p_desde` y `cerrado_hasta_at =
    plan_inicio_periodo_calendario('mensual', p_desde)`. Sin historial (R33);
  - **con fila** (cambio de plan) → `entrada_at = p_desde` y `plan_nivel_recalcular(p_org, p_desde, 'cambio_plan')`
    (R32).

### 2.5 El resto de la migración

1. Las tres tablas de §1, con sus CHECK, su RLS, sus políticas y sus `REVOKE`.
2. El CHECK `plan_borrador_pasos_conocidos` se borra y se crea otra vez con
   `ARRAY['general','precio','orden','topes','modulos','beneficios','niveles','vigencia']`.
3. Las cinco funciones de §2.1–§2.4.
4. **Relleno (R37):** una fila de `plan_nivel_empresa` por empresa con `plan_id`, con nivel 0, cuenta 0, `entrada_at
   = plan_ciclo_ancla_at` y `cerrado_hasta_at = plan_inicio_periodo_calendario('mensual', now() AT TIME ZONE
   'UTC')`. Ningún plan tiene niveles todavía, así que no hay nada que calcular hacia atrás.

`BEGIN`/`COMMIT`, como 20261120120000.

**`down.sql`:**
1. `UPDATE "plan_borrador" SET "pasos" = "pasos" - 'niveles'` y el CHECK vuelve a sus siete pasos.
2. `version - 'niveles'` en `plan_cambio_programado` y `plan_version_empresa`: el esquema de antes es `.strict()`.
3. `DROP FUNCTION` de las cinco y `DROP TABLE` de las tres.

Bajar la migración pierde los niveles, el estado y el historial a sabiendas: el esquema de antes no tiene dónde
guardarlos. Lo dice la cabecera del `down.sql`.

### 2.6 Migración `20261121120000_plan_nivel_job_enum`

`ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_niveles_cerrar'`. Va aparte porque un valor nuevo de enum no se
puede usar en la misma transacción, como hizo SLT-118 con `20261111130000_factura_plataforma_job_enum`. Su `down.sql`
borra los trabajos de ese tipo y quita el valor con el mismo procedimiento que el `down.sql` de esa migración.

## 3. Servidor

### 3.1 Esquemas y textos (`lib/planes/niveles.ts`, NUEVO, sin React)

```ts
export const MAX_NIVELES = 10;                                               // P2
export type DescuentoNivel = { tipo: "porcentaje"; porcentaje: string } | { tipo: "monto"; monto: string };
export type Nivel = { meta: number; descuento: DescuentoNivel };
export const META_INVALIDA = "Escribe una meta de al menos 1 orden.";
export const META_NO_CRECE = "La meta debe ser mayor que la del nivel anterior.";
export const DEMASIADOS_NIVELES = "Un plan admite hasta 10 niveles.";
export const descuentoNivelSchema;  // la forma de descuentoPeriodoSchema; monto = montoCobroSchema con refine > 0
export const nivelSchema = z.object({ meta: z.int(META_INVALIDA).min(1, META_INVALIDA), descuento: descuentoNivelSchema }).strict();
export const nivelesSchema = z.array(nivelSchema).max(MAX_NIVELES, DEMASIADOS_NIVELES).superRefine(metasCrecientes); // issue en [i, "meta"]
export function descuentosDelNivel(niveles: readonly Nivel[], nivel: number): DescuentoNivel[]; // R2: niveles.slice(0, nivel)
export function textoDelNivel(n: number, nivel: Nivel): string;   // R21: «Nivel n: desde M órdenes, −p %» | «… −monto»
export function textoDeLosNiveles(niveles: readonly Nivel[]): string; // R20: textoDelNivel unidos por «; » o «Sin niveles»
```

El mensaje «Un descuento es porcentaje o monto fijo, no los dos.» es el `SOLO_UNA_FORMA` de `lib/types/planes.ts`:
se exporta de allí en vez de copiarlo.

### 3.2 Tipos (`lib/types/planes.ts`)

Lo mismo que hizo SLT-214 con `beneficios`:
- `crearPlanSchema` y `edicionDelPlan`: `niveles: nivelesSchema.optional()`. Al crear, ausente es «sin niveles»; en una
  versión, «sin cambio» (R18). `versionPlanSchema` lo hereda.
- `VersionPlan` añade `"niveles"` al `Pick`; `PlanDTO.niveles?: Nivel[]` (ausente = `[]`); `PlanVista` añade
  `"niveles"`.

### 3.3 Repositorio de planes, lista del plan (`PlanesRepository.ts`)

- `INCLUIR`: `niveles: { orderBy: { nivel: "asc" } }`; `aDTO` arma `Nivel` desde las dos columnas del descuento.
- `crearEnTx`: `niveles: { create: (input.niveles ?? []).map((n, i) => filaDelNivel(i + 1, n)) }` (R15).
- `aplicarVersion`: si `version.niveles !== undefined`, `deleteMany` y `createMany` (R17); si no, nada (R18).
- `versionDelPlan(plan)`: `niveles: plan.niveles ?? []`.

### 3.4 El recálculo en los dos puntos de entrada (R31–R34)

Los dos corren ya con la empresa en `FOR UPDATE` y como plataforma, así que el orden de cerrojos (empresa → plan) no
cambia.

- **`recibirCambio`**, después del paso 5 (precio) y antes del 6 (versión propia):
  - `cambian = !mismosNiveles(tenia.niveles, version.niveles)`, con `tenia` el `comoLaCorre` que ya calcula el paso 4;
  - si cambian: `SELECT plan_nivel_cerrar_meses(org, ahora)` (con la versión de antes todavía escrita), el upsert del
    paso 6 y `SELECT plan_nivel_recalcular(org, recibeAt, 'cambio_niveles')` (R31);
  - si no cambian, nada (R34).

  Una recepción «no aplicada» (SLT-128 R28) sale antes del paso 4 y no recalcula.
- **`aplicarEnTx`**, solo cuando `entra`:
  - antes de `factura_plataforma_tomar_cambio`, si `empresa.plan_id !== null`: `plan_nivel_cerrar_meses(org, ahora)`
    con el plan de antes;
  - después del `UPDATE "organizacion"` (y de `entrarAlCambioEnTx`, que ya escribió la versión de C si la hay):
    `plan_nivel_tomar_plan(org, desde)` (R32, R33).

  Un cambio de solo tipo (`!entra`) no llama a nada (R34).

`mismosNiveles` compara `planCanonico`-style: meta y descuento normalizado (`"10"` y `"10.00"` son iguales, con la
misma normalización de importes que ya usa `rastro.ts`).

### 3.5 Repositorio del cierre (`lib/repositories/NivelesEmpresaRepository.ts`, NUEVO)

```ts
export interface INivelesEmpresaRepository {
  /** Las empresas con fila de nivel y algún mes terminado sin cerrar (`cerrado_hasta_at < inicio del mes de ahora`). */
  empresasConMesPendiente(ahora: Date): Promise<string[]>;
  /** `plan_nivel_cerrar_meses(empresa, ahora)` en su transacción. Devuelve los meses cerrados. */
  cerrarMeses(organizacionId: string, ahora: Date): Promise<number>;
}
```

Corre como plataforma (`comoPlataforma("SL-24", …)`; `FichaJira` no admite `SLT`, deuda D29), como
`FacturaPlataformaRepository`. Se añade a `EXCEPCIONES_DE_PLATAFORMA` con el motivo «cerrar los meses de los niveles
por volumen de todas las empresas (SLT-215)». No hay lectura para la empresa en esta ficha: «Mi plan» es de SLT-216.

### 3.6 Rastro y líneas de cambio (R19, R20)

- `lib/planes/rastro.ts`: `"niveles"` en `CampoDelPlan` y `CAMPOS`, después de `"beneficios"`; `planCanonico` añade
  los niveles con los importes normalizados; en un alta, `diferenciasDelPlan` omite `niveles` si la lista está vacía.
  Mismo motivo que SLT-214: deja intactas las aserciones exactas de las filas `creado` que ya existen.
- `lib/planes/mensajes.ts`: `CambioDelPlanParaCorreo.niveles?: { antes; despues }` y `lineasDeCambioDelPlan` añade
  «Niveles por volumen: <antes> → <después>» con `textoDeLosNiveles` (P5).
- `PlanDetalle > lineasDelRastro`: un alta pinta «Niveles: <textoDeLosNiveles>».

### 3.7 Borrador del servidor (`lib/types/plan-borrador.ts`, `lib/planes/borrador.ts`)

- `PASOS_DE_CREAR = [..., "beneficios", "niveles"]` y `PASOS_DE_EDITAR = [..., "beneficios", "niveles", "vigencia"]`.
- `nivelesDelPasoSchema = z.object({ niveles: nivelesSchema }).strict()` en `ESQUEMAS_DE_CREAR`, `ESQUEMAS_DE_EDITAR`,
  las uniones de `guardarPasoBorradorSchema` y `ValoresDelPaso`.
- `peticionDeCrear` y `peticionDeEditar` añaden `niveles: pasos.niveles.niveles`.
- `pasosQueFaltan` sale de las tuplas: R12 sin código nuevo.

## 4. Cliente

### 4.1 Archivos

```
app/(app)/plataforma/planes/_components/
  plan-form/PasoNiveles.tsx    NUEVO: lista editable (R8, R9)
  plan-form/estado.ts          Formulario.niveles, versionDe, pasosDe, camposEnOrden, pasoDeLaClave (R7, R10)
  plan-form/borrador.ts        valoresDelPaso / formDelBorrador del paso nuevo (R11)
  plan-form/textos.ts          textos (§7)
  plan-form/PasoRevisar.tsx    fila «Niveles» (R14)
  PlanForm.tsx                 monta PasoNiveles en `case "niveles"`
  PlanesModule.tsx             columna «Niveles» (R21)
  plan-vista.ts                lineasDeNiveles (R21)
[planId]/_components/PlanDetalle.tsx  línea «Niveles: …» del alta en el rastro (R19)
```

### 4.2 Paso «Niveles» (`PasoNiveles.tsx`)

- **Estado:** `Formulario.niveles: { clave: string; meta: string; tipo: "porcentaje" | "monto"; valor: string }[]`.
  `clave` es local, para el `key` de React. `versionDe` manda `meta` como número si es `/^\d+$/` y como `NaN` si no,
  para que el esquema dé el error de R3 en su campo.
- **Cada fila**, rotulada «Nivel n»:
  - `Input` numérico «Meta de órdenes al mes del nivel n» (`inputMode="numeric"`);
  - un `RadioGroup` de `components/ui/radio-group`, como en `PasoPrecio`, «Tipo de descuento del nivel n» con
    «Porcentaje» y «Monto fijo»;
  - `Input` «Descuento del nivel n», con el sufijo «%» en porcentaje;
  - el botón de ícono «Quitar nivel n».
- **«Agregar nivel»:** añade `{ meta: "", tipo: "porcentaje", valor: "" }` al final y pone el foco en su meta. Con 10
  filas queda `disabled` (R8).
- **Sin subir ni bajar.** El orden lo fijan las metas, que deben crecer (R3); mover filas solo produciría errores.
- **Vacío:** «Este plan no tiene niveles.» (R9).
- **Errores:** `camposEnOrden` añade `niveles`, y por fila `niveles.<i>.meta` y `niveles.<i>.descuento.<campo>`;
  `pasoDeLaClave` lleva lo que empieza por `niveles` a su paso. Se pintan con `FieldError`, como en los demás pasos.
- Valida en el cliente con `ESQUEMAS_DE_*["niveles"]`, como hoy cada paso.

### 4.3 Columna (`PlanesModule.tsx`, `plan-vista.ts`)

`lineasDeNiveles(niveles) = niveles.length === 0 ? ["Sin niveles"] : niveles.map((n, i) => textoDelNivel(i + 1, n))`.
Se pinta como `lineasDeTopes`, una línea por nivel, en una celda con `SOLO_DESDE_MD` después de «Beneficios».
**Decisión del spec:** sin «Mostrar más». Son 10 como mucho y cada línea es corta; el plegado de SLT-214 vive dentro de
`ListaDeBeneficios`, y sacarlo a un componente común tocaba dos archivos y un test más.

## 5. El trabajo diario (`lib/planes/jobs-niveles.ts`, NUEVO)

Calcado de `jobs-factura-plataforma.ts`:
- `plan_niveles_cerrar`: recurrente, **una vez al día a las 06:20 UTC** (P1), sin empresa (`RECURRENTES_DE_PLATAFORMA`),
  de núcleo (`MODULO_POR_JOB`).
- `proximaCorridaCierreNiveles(now)`: el siguiente 06:20 UTC estrictamente posterior; `dedupeKey =
  plan_niveles_cerrar:<AAAA-MM-DD>`: una corrida por día aunque se siembre dos veces.
- `sembrarCierreNiveles(repo, now)`, registrada en `scripts/siembra-jobs-recurrentes.ts > SIEMBRAS_RECURRENTES` (la
  guardia `jobs-recurrentes-con-siembra` lo exige).
- `crearCierreNivelesHandler(repo, now)`: un solo `ahora`; para cada `empresasConMesPendiente(ahora)`,
  `cerrarMeses`; los fallos se juntan con su causa y el trabajo lanza al final con los ids (R30).
- Se cablea en `app/api/cron/procesar-jobs/route.ts` (`buildHandlers`, `buildRecurrencias`, `RECURRENTES_DE_PLATAFORMA`).

Corre todos los días aunque solo el día 1 haya meses que cerrar: así un día 1 caído lo recoge el día 2 (R29, «Cierre
fallido»), y los días sin pendientes la consulta de §3.5 devuelve vacío.

## 6. Autorización, módulo y país

- **Quién:** configura los niveles solo el superadmin, por las actions del borrador (SLT-129), que ya responden
  `forbidden`. El cierre y los recálculos corren como plataforma, desde la cola y desde el repositorio de planes. No
  hay action nueva ni lectura nueva para la empresa.
- **Módulo:** ninguno. Planes es núcleo.
- **País:**
  - el monto fijo del descuento es un importe sin moneda, como el costo por orden: el texto no nombra moneda;
  - la zona del mes es la de `plan_inicio_periodo_calendario` (−06:00 hoy). Cuando SLT-90 traiga la zona por empresa,
    cambia allí y el cierre la sigue (decisión «Zona del cierre», R23).

## 7. Textos nuevos

- **Paso:** «Niveles»; «Agregar nivel»; «Este plan no tiene niveles.»; «Nivel n»; «Meta de órdenes al mes del nivel
  n»; «Tipo de descuento del nivel n»; «Porcentaje»; «Monto fijo»; «Descuento del nivel n»; «Quitar nivel n».
- **Validación:** «Escribe una meta de al menos 1 orden.»; «La meta debe ser mayor que la del nivel anterior.»; «Un
  plan admite hasta 10 niveles.»; «Un descuento es porcentaje o monto fijo, no los dos.» (ya existe).
- **Vistas:** columna y fila «Niveles»; «Sin niveles»; «Nivel n: desde M órdenes, −p %»; «Nivel n: desde M órdenes,
  −monto».
- **Rastro y líneas de cambio:** «Niveles: …»; «Niveles por volumen: <antes> → <después>».

Se aprueban con el spec.

## 8. Alternativas descartadas

- **A. Calcular el nivel en TypeScript** (un servicio con Prisma que lee las órdenes, decide y escribe). Daba tests
  unitarios puros de la regla. Se descarta:
  1. SLT-216 tendrá que leer el nivel vigente dentro del trigger del cargo, en SQL. Con la regla en SQL hay una sola
     definición de «órdenes efectivas» y de «mes».
  2. El cierre tiene que ser atómico con su cerrojo y su marca `cerrado_hasta_at`; en una función del dueño lo es por
     construcción, como `factura_plataforma_cerrar`.
  3. La empresa no puede escribir estas tablas; desde TS habría que escribir como plataforma fila a fila.
- **B. Un cron nuevo de Vercel** (`app/api/cron/cerrar-niveles` y una línea en `vercel.json`). Es lo que pide
  literalmente «cron diario». Se descarta porque un cron de Vercel no reintenta: si falla, espera al día siguiente.
  Además suma otra ruta con `CRON_SECRET`. Los cierres de planes ya van por la cola recurrente (`plan_cambios_vencidos`,
  `factura_plataforma_cerrar`), que reintenta con backoff y deja `last_error`. Sigue siendo diario.
- **C. Guardar solo el historial y derivar el estado** (nivel y cuenta) de él. Ahorraba `plan_nivel_empresa`. Se
  descarta: la cuenta de meses sin cumplir y el último mes cerrado no salen del historial (un mes que cumple no deja
  fila), y la idempotencia necesita una marca que se lea bajo cerrojo.
- **D. Usar `plan_ciclo_ancla_at` como entrada al plan.** Ahorraba `entrada_at`. Se descarta: esa columna se mueve al
  cambiar el tipo de cobro (SLT-86), y R34 dice que eso no toca el nivel.
- **E. Los niveles en una columna `plan.niveles jsonb`.** Mismo motivo que la alternativa A de SLT-214: los CHECK por
  elemento y la simetría con `plan_beneficio` y `plan_modulo`.

## 9. Tests

| Archivo | Cubre |
|---|---|
| `tests/unit/planes/niveles.test.ts` (nuevo) | R2–R5, `textoDelNivel`, `textoDeLosNiveles` |
| `tests/unit/types/plan-borrador-schema.test.ts` (se amplía) | R7 en las tuplas; R10 en el esquema del paso |
| `tests/unit/planes/plan-form-borrador.test.ts` (se amplía) | R11 |
| `tests/unit/planes/rastro.test.ts` (se amplía) | R19, R20 |
| `tests/unit/planes/jobs-niveles.test.ts` (nuevo) | R29 (hora, `dedupe_key`, siembra), R30 |
| `tests/unit/api/procesar-jobs-registro.test.ts` (se adapta) | El tipo nuevo registrado y de plataforma |
| `tests/integration/db/plan-nivel.test.ts` (nuevo) | R1, R6 (CHECK, `servi_app` sin acceso), R15–R18, R36 (aislamiento y sin escritura) |
| `tests/integration/db/plan-nivel-cierre.test.ts` (nuevo) | R22–R30: órdenes efectivas (anulada, recuperada, cancelada por API dentro y después del mes, el ejemplo 152 − 3 = 149 contra 150, guardia de nuevas cancelaciones), entrada a mitad de mes, subir, bajar, reiniciar, nivel 0, plan sin niveles, varios meses pendientes, repetir y en paralelo |
| `tests/integration/db/plan-nivel-recalculo.test.ts` (nuevo) | R31–R34 por `recibirCambio` y por el cambio de plan |
| `tests/integration/db/migracion-plan-nivel-ida-y-vuelta.test.ts` (nuevo) | R37 y el `down.sql` de §2.5 |
| `tests/integration/db/plan-borrador-confirmar.test.ts` (se amplía) | R12, R15, R16 |
| `tests/components/PlanFormNiveles.test.tsx` (nuevo) | R8–R10, R13, R14 |
| `tests/components/PlanFormPasos.test.tsx` (se amplía) | R7 |
| `tests/components/PlanFormBorrador.test.tsx` y `tests/components/plan-form-pasos.ts` (se adaptan) | Contador «n de 7/8»; el paso nuevo en `avanzarHasta` |
| `tests/components/PlanesModule.test.tsx` (se amplía) | R21 |
| `tests/components/PlanDetalle.test.tsx` (se amplía) | R19 en el rastro |
| `e2e/planes-niveles.spec.ts` (nuevo) | R38 |
| `e2e/planes-borrador.spec.ts`, `planes-superadmin`, `planes-costeo`, `planes-costo-porcentual`, `planes-beneficios` (se adaptan) | Pasan por «Niveles» después de «Beneficios»; el contador de `planes-borrador` sube en 1 |

Las fechas de los tests de integración se fijan con `p_ahora` y `ocurrido_at` explícitos, con meses que cruzan el
borde de las 06:00 UTC: una orden a las 05:59 UTC del día 1 es del mes anterior.

**Antes del PR** se corren en local los seis E2E de planes (`docs/perfil-agentes.md > E2E en local antes del PR`). El
diff toca `db/` y pantallas, y no cambia ningún cobro, así que no hace falta el grupo `dinero`.

## 10. Riesgos

- **Recálculo con la fecha de efecto en un mes ya pasado.** Si el barrido aplica un cambio de plan con varios días de
  retraso y cruza un borde de mes, los meses entre la fecha de efecto y `ahora` se cierran con los niveles de antes y
  el recálculo usa el mes anterior a la fecha de efecto. Hoy el barrido es horario: el caso pide más de un día caído.
- **Carga del cierre.** El día 1, una consulta por empresa sobre `cobro_plataforma_movimiento` del mes. Va por índice;
  no se ha medido con volumen real.
- **SLT-216 depende de la forma de §1.3** (nivel vigente por `desde_at`). Si cambia, cambia esa ficha.
- **Tamaño** (P6): 52 archivos y unas 1 100 líneas de producción.

## 11. Dependencias

Ninguna nueva.

## 12. Tamaño

Lo cuenta `tasks.md > Archivos esperados`: **52 archivos** (29 de producción y 23 de tests), por encima del tope de
40. El humano aceptó un PR sobre el tope (~50) el 2026-11-19.
- **Producción: ~1 100 líneas** (tope 1000; P6). Migraciones ~450, `lib/` ~350, formulario y vistas ~300.
- **Tests: ~2 600 líneas** (tope 3000).
