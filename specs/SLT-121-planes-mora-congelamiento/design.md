# SLT-121 — planes-mora-congelamiento · design.md

> Requisitos: `requirements.md` (R1–R35). Escrito por `spec_author` el 2026-11-20, sobre `dev` con SLT-60, SLT-118,
> SLT-136, SLT-143 y SLT-199 ya mergeadas.
>
> - **Dos migraciones**, cada una con su `down.sql`: la de enums va aparte porque un valor nuevo de enum no se puede
>   usar en la misma transacción que lo crea (`55P04`).
> - **Sin dependencias nuevas.**
> - **Enmiendas explícitas:** el correo de cierre de SLT-136 suma la fecha límite (R25), y
>   `PagoPlataformaConfirmacionRepository` (SLT-60 y SLT-143) envuelve sus tres operaciones en una transacción que
>   recalcula el congelamiento (R19, R21, R34). Ninguna función SQL de SLT-60 ni de SLT-143 se reescribe.
> - **Tamaño:** muy por encima de `gate.tamano_pr`, aceptado por el humano el 2026-11-13 (§12).

## Lo que ya existe

Buscado el 2026-11-20 con `congel`, `congelamiento`, `mora`, `vencid`, `gracia`, `DIAS_GRACIA`, `falta de pago`,
`suspendida`, `fecha_limite`, `exigirModuloActivo`, `historial_accion`, `pago_plataforma_*` y `factura_plataforma_*`,
en el board (`feature_list.json`), en `specs/` y en el código. El grafo `codebase-memory-mcp` no tiene índice de
este worktree (`index_status`: «project not found»), así que busqué con Grep y Read.

- **Board.**
  - SLT-131 «Planes: el superadmin marca pagada la factura de un ciclo» pedía descongelar al marcar pagada. Está
    **cancelled**: la absorbieron SLT-60 y SLT-143, y aquí entra por R19.
  - SLT-230 «Cobro automático: enlace de pago por factura» (pending) **consume** la fecha límite: su enlace vence
    con el plazo de pago. Lee la gemela TS de §3.2.
  - SLT-226 «Cobro automático: modelo del cobro e idempotencia» (in_progress, otra rama) y SLT-231 «Cobro automático:
    botón «Pagar» y estado de la factura» (pending) son la frontera de §9.
  - Ninguna otra ficha congela empresas ni calcula plazos de pago.
- **`specs/`.**
  - SLT-118 (R19 y la decisión del 2026-11-10), SLT-60 y SLT-119 dejan la mora fuera de su alcance y apuntan aquí.
  - SLT-143 R30 deja el saldo con anulaciones en `factura_plataforma_saldos` «que leerá SLT-121», y su decisión del
    2026-11-19 deja para aquí la mora al anular.
  - SLT-136 ya envía el correo de cierre (§7 de su design): **se reutiliza**, no se duplica.
- **Código que se reutiliza:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| `factura_plataforma_saldos(org)`: la única definición del saldo, sin pagos anulados | migración `20261121130000_pago_plataforma_por_fuera` §3 | Es la fuente del saldo de toda la mora (R6, R19). No se copia: la función nueva la llama |
| Candado `pg_advisory_xact_lock(hashtext('pago_plataforma:' \|\| org))` | SLT-60, SLT-143 | Congelar lo toma para no cruzarse con una confirmación (§4.3) |
| `PagoPlataformaConfirmacionRepository.confirmar` / `registrarPorFuera` / `anularConfirmado` | `lib/repositories/` | Pasan a `$transaction` + recalcular (§5.2) |
| Outbox: `encolarEnEmpresas(tx, …)` + `JobRepository.enqueue(…, { dedupeKey }, tx)` | `lib/repositories/_shared/encolar-en-empresas.ts` | Los avisos de la mora se encolan en la misma transacción (R29) |
| `crearFacturaAvisoHandler` y `plantillaFacturaEmitida` | `lib/planes/jobs-factura-aviso.ts`, `lib/services/email/plantillas/factura-emitida.ts` | El correo de cierre suma la fecha límite (R25) |
| `PlanesRepository.destinatariosDelAviso(org, null)` | `lib/repositories/PlanesRepository.ts` | Destinatarios de los correos nuevos (R26–R28) |
| `componerCorreo`, `baseUrlDeLaApp`, `emailContacto` | `lib/services/email/plantillas/plantilla-marca.ts`, `lib/config/` | Plantilla de los correos nuevos |
| Recurrente diario de plataforma: `recurrenciaCierreNiveles`, `sembrarCierreNiveles`, `RECURRENTES_DE_PLATAFORMA` | `lib/planes/jobs-niveles.ts`, `app/api/cron/procesar-jobs/route.ts`, `scripts/siembra-jobs-recurrentes.ts` | Molde de la corrida de madrugada (§4) |
| `conSuEmpresa` y `paraCadaEmpresa`: los dos únicos sitios donde la cola y los crons entran en una empresa | `app/api/cron/procesar-jobs/route.ts`, `lib/db/para-cada-empresa.ts` | Llevan el permiso «sistema» (R17) |
| La envoltura `set_config('app.organizacion_id', …), set_config('role', 'servi_app', …)` | `lib/db/extension-empresa.ts` (dos sitios) | Suma `app.mora_permitida` (§6.1) |
| Puerta de módulo: `exigirModuloActivo` → `ModuloInactivoError` (403, `details.codigo`) | `lib/modulos/` | Molde de `exigirEmpresaOperativa` y de `EmpresaCongelada` (§6.2) |
| `traducirErrorDeTope` (`SL024` → `ConflictError` con `details.codigo`) | `lib/planes/tope-error.ts` | Molde de la traducción de `SL121` (§6.1) |
| `appendAccion`, `resolverActorCongelado`, entidad `organizacion` (SLT-77) | `lib/repositories/registrar-accion.ts`, `lib/types/historial-accion.ts` | Las filas de la mora (R30) |
| `lib/config/*.ts` con entero y valor por defecto | p. ej. `AUTH_BIENVENIDA_TTL_HORAS` | `FACTURA_DIAS_GRACIA` (R2) |
| Offset fijo de la plataforma en SQL (`interval '6 hours'`) y `fechaCalendarioCR` en TS | migración `20261106120000`, `lib/utils/fecha-cr.ts` | El día de emisión y la fecha límite (R1), como en SLT-86 y SLT-118 |

No apareció nada que choque con el alcance.

## 1. Modelo de datos

### 1.1 Columnas nuevas en `organizacion` (plataforma; `servi_app` solo lee)

| Columna | Tipo | Regla |
|---|---|---|
| `factura_dias_gracia` | `INTEGER NULL` | `CHECK (factura_dias_gracia BETWEEN 1 AND 60)`. `NULL` = rige la global (R2, R3) |
| `congelada_at` | `TIMESTAMP(3) NULL` | UTC. No nula = congelada desde ese instante |
| `descongelada_hasta` | `DATE NULL` | Último día (calendario de la plataforma) de un descongelamiento manual (R22, R23) |

- **Sin tabla nueva.** El estado es uno por empresa y el rastro va a `historial_accion` (decisión «Historial»). Una
  tabla de eventos sería una segunda fuente del mismo rastro.
- **Quién escribe.** Solo el dueño: las funciones de §2 (`SECURITY DEFINER`) y `MoraEmpresaRepository` en
  `comoPlataforma`. `servi_app` no tiene `UPDATE` sobre estas columnas: el `GRANT UPDATE` por columna de SLT-77 cubre
  solo `tope_intentos_entrega` y `updated_at`. Así la empresa no puede descongelarse a sí misma.
- **La empresa lee** sus tres columnas: `organizacion` ya es legible para `servi_app` en su propia fila. Eso basta
  para el banner (R24) y para la puerta (§6.2).
- **Índice:** `organizacion_congelada_idx ON organizacion (id) WHERE congelada_at IS NOT NULL`. La corrida diaria
  recorre las congeladas sin barrer todas.

### 1.2 Enums (migración aparte, §8.1)

- `historial_accion_tipo`:
  - `empresa_congelada`;
  - `empresa_descongelada_por_pago`;
  - `empresa_descongelada_a_mano`;
  - `empresa_descongelada_por_gracia`;
  - `factura_dias_gracia_cambiada`.
- `job_tipo`: `mora_diaria` (recurrente, de plataforma) y `mora_aviso_correo` (por evento, con empresa).

**Nota:** `empresa_descongelada_por_gracia` no está en la lista de la decisión «Historial». Hace falta para R5: un
cambio de gracia puede descongelar, y esa fila no es «por pago» ni «a mano». Se avisa en §13.

### 1.3 Datos que dependen del país

- **Hora:** la de la plataforma, CR, como SLT-86, SLT-118 y SLT-136 hasta SLT-90. En SQL se usa el desfase fijo
  `interval '6 hours'`, como `plan_inicio_periodo_calendario`. En TS, `fechaCalendarioCR` e `inicioDelDiaCREnUtc`.
  `lib/planes/mora.ts` entra en `_pais-sin-literales-excepciones.ts`, igual que `lib/planes/ciclo.ts`.
- **Moneda:** la de la app (`money()`, SL-21), sin conversión.
- **Impuestos y métodos de pago:** ninguno.

## 2. Funciones de la base (migración principal, §8.2)

Todas las del dueño son `SECURITY DEFINER`, con `SET search_path = public, pg_temp` y `EXECUTE` revocado a `PUBLIC`.
La gracia global llega siempre por parámetro (`p_gracia_global int`): la variable de entorno se lee en TS y la base
no la conoce.

**La fila de la empresa se toma con `FOR NO KEY UPDATE`, nunca con `FOR UPDATE`** (decisión del 2026-11-20, humano),
en las tres `organizacion_mora_*` (§2.2–§2.4).
- **Por qué:** la anulación de un pago de la empresa (SLT-60, y la de un pago por confirmar, decisión P3) escribe
  primero; la FK de esa escritura toma `FOR KEY SHARE` sobre `organizacion`, y después espera el candado
  `pago_plataforma:`. La confirmación ya tiene ese candado y, con la empresa congelada, llama a
  `organizacion_mora_descongelar_si_pagada`. Con `FOR UPDATE` esa fila esperaba a la anulación y la anulación al
  candado: `40P01` (deadlock).
- `FOR NO KEY UPDATE` no choca con `FOR KEY SHARE` y sigue serializando a las tres funciones entre sí. El `UPDATE`
  de `congelada_at` / `descongelada_hasta` tampoco pide más: ninguna de las dos columnas está en un índice único.
- Lo vigila `tests/integration/repositories/pago-plataforma-recalcula-mora.test.ts` > «decisión §2: 5 cruces
  forzados…»; con `FOR UPDATE` da `40P01`.

### 2.1 La única definición del plazo: `factura_plataforma_mora(p_org, p_ahora, p_gracia_global)`

Devuelve una fila por factura **cerrada con saldo > 0**:

```
factura_id, numero, hasta_at, saldo,
fecha_limite date,           -- (hasta_at - 6 h)::date + gracia   (R1)
vence_at     timestamp,      -- (fecha_limite + 1) a las 00:00 de la plataforma, en UTC (+6 h)
vencida      boolean         -- p_ahora >= vence_at                 (R6)
```

- La gracia es `COALESCE(o.factura_dias_gracia, p_gracia_global)`.
- El saldo sale de `factura_plataforma_saldos(p_org)` y no se recalcula aquí.
- La en curso y la por cerrar no aparecen: `factura_plataforma_saldos` solo trae las cerradas.
- **Es la lectura de la empresa:** `GRANT EXECUTE … TO servi_app`, con la guarda de `plan_de_la_empresa`. Si `p_org`
  no es `current_setting('app.organizacion_id')` y quien llama es `servi_app`, lanza `42501` (R33). El dueño la
  llama para cualquier empresa.
- La lee SLT-231 para pintar «vencida» (R6). La fecha límite de una factura pagada no se devuelve: deja de importar.

### 2.2 `organizacion_mora_congelar(p_org, p_ahora, p_gracia_global) → jsonb`

Corre en la transacción de la corrida de madrugada (§4) y hace, en este orden:

1. Toma `pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org))` (§4.3) y después la empresa en `FOR NO KEY UPDATE`.
2. Con `p_ahora` fuera de la franja de 00:00 a 05:59 de la plataforma, responde `{"resultado":"fuera_de_franja"}` y
   no escribe (R8).
3. Ya congelada: `{"resultado":"ya_congelada"}` (R9).
4. Con `descongelada_hasta >= hoy` de la plataforma: `{"resultado":"descongelada_a_mano"}` (R23).
5. Sin facturas vencidas: `{"resultado":"al_dia"}`.
6. Si no, fija `congelada_at = p_ahora` y responde
   `{"resultado":"congelada","facturas":[{"id","numero","saldo"}…],"saldo_vencido":"…"}` (R7).

No escribe historial ni encola: lo hace el repositorio en la misma transacción (§5.1), con `appendAccion`, para no
saltarse la guardia `historial-accion-escrituras-cubiertas`.

### 2.3 `organizacion_mora_descongelar_si_pagada(p_org, p_ahora, p_gracia_global) → text`

La pieza SQL de «recalcular» (R34):

- toma la empresa en `FOR NO KEY UPDATE`;
- si no está congelada, responde `sin_cambio`;
- si está congelada y `factura_plataforma_mora(…)` no tiene ninguna `vencida`, fija `congelada_at = NULL` y responde
  `descongelada`;
- si no, responde `sin_cambio`.

**Nunca congela** (R21). No toca `descongelada_hasta`.

### 2.4 `organizacion_mora_descongelar_a_mano(p_org, p_hasta date, p_ahora) → text`

- Toma la empresa en `FOR NO KEY UPDATE`. Si no está congelada, responde `no_congelada`.
- Si no, fija `congelada_at = NULL` y `descongelada_hasta = p_hasta`, y responde `ok`.
- El motivo y el rango de la fecha (R22) los valida el servicio. La base no guarda el motivo: va solo al historial
  (decisión P5).

### 2.5 El bloqueo en la base: `bloqueo_por_mora()` (R16)

Es una función de trigger **sin** `SECURITY DEFINER`, porque necesita el `current_user` real:

```sql
CREATE FUNCTION bloqueo_por_mora() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'servi_app'
     AND COALESCE(current_setting('app.mora_permitida', true), '') = ''
     AND EXISTS (SELECT 1 FROM organizacion o
                  WHERE o.id = current_setting('app.organizacion_id', true)
                    AND o.congelada_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'empresa_congelada' USING ERRCODE = 'SL121';
  END IF;
  RETURN NULL;
END $$;
```

- **Trigger `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH STATEMENT`** (`<tabla>_bloqueo_por_mora`). Se instala:
  - en cada tabla que tiene la política `<tabla>_por_empresa` (las de negocio y `jobs`). La migración las recorre en
    `pg_policy`, igual que `rls-por-empresa`;
  - en `organizacion`, por la columna que el maestro sí puede escribir (`tope_intentos_entrega`).
- **Coste:** una lectura por clave primaria por **sentencia** de escritura, no por fila. Las lecturas no lo
  disparan (R10).
- **Quién pasa:**
  - el dueño, porque `current_user` no es `servi_app`: el superadmin, los cierres de factura y las funciones
    `SECURITY DEFINER`;
  - cualquier camino con `app.mora_permitida` fijado (§6.1).
- **Una empresa no congela a otra (R18):** la lectura es por la empresa de la transacción.

## 3. Configuración y piezas puras

### 3.1 `lib/config/factura-gracia.ts`

`diasDeGraciaGlobal(env = process.env): number` lee `FACTURA_DIAS_GRACIA` y devuelve 7 si falta o si no es un entero
de 1 a 60 (R2). Mismo patrón que los demás `lib/config/*.ts`. Va también a `.env.example`.

> El rango 1–60 para la variable no estaba escrito en la decisión «Variable de entorno», que dice «entero válido».
> Se toma el rango de la gracia propia para que las dos no puedan divergir (§13).

### 3.2 `lib/planes/mora.ts` (puro, sin E/S)

```ts
export const GRACIA_MIN = 1, GRACIA_MAX = 60, MOTIVO_MAX = 200, HASTA_MAX_DIAS = 60;
export const FRANJA_MADRUGADA = { desde: 0, hasta: 6 } as const;            // [00:00, 06:00) plataforma
export function fechaLimiteDePago(hasta: Date, gracia: number): string;     // 'AAAA-MM-DD' (R1)
export function venceEn(fechaLimite: string): Date;                         // 00:00 del día siguiente, en UTC
export function estaVencida(f: { saldo: string; fechaLimite: string }, ahora: Date): boolean; // R6
export function enFranjaDeMadrugada(ahora: Date): boolean;                  // R8
export type EstadoMora =
  | { estado: "al_dia" }
  | { estado: "en_plazo"; fechaLimite: string }
  | { estado: "vencida"; facturas: FacturaVencida[]; saldoVencido: string }
  | { estado: "congelada"; desde: Date; facturas: FacturaVencida[]; saldoVencido: string }
  | { estado: "descongelada_a_mano"; hasta: string };
export function estadoDeMora(o: OrganizacionMora, facturas: FilaMora[], ahora: Date): EstadoMora; // R24, R32
export const MORA_TEXTOS = { … };  // banner, sección del superadmin, mensaje del error
export const MENSAJE_EMPRESA_CONGELADA = "Empresa suspendida por falta de pago.";
```

- `fechaLimiteDePago` y `factura_plataforma_mora` se prueban con **la misma tabla de casos**
  (`tests/integration/db/_fixtures/fecha-limite-pago.ts`), como `periodo-calendario.ts` en SLT-86. Casos:
  - `hasta` a las 00:00 de la plataforma;
  - fin de mes;
  - 29 de febrero;
  - gracia de 1 y de 60.
- SLT-230 y SLT-231 leen de aquí la fecha límite y el estado vencida (§9).

## 4. La corrida de madrugada (`lib/planes/jobs-mora.ts`)

### 4.1 `mora_diaria`

- **Cuándo:** recurrente, una vez al día a las **06:30 UTC** (00:30 de la plataforma). Es después de
  `plan_niveles_cerrar` (00:20) y del cierre horario de facturas (:10).
- **Cómo:** de plataforma, sin empresa, como `factura_plataforma_cerrar`. Va en `RECURRENTES_DE_PLATAFORMA`, en
  `MODULO_POR_JOB = "nucleo"` y en `SIEMBRAS_RECURRENTES`.
- **Dedupe:** `mora_diaria:<AAAA-MM-DD>`.

El manejador:

1. Lista, como plataforma, las empresas con alguna factura cerrada con saldo > 0 o con `congelada_at` no nula. Usa
   `MoraEmpresaRepository.empresasConMora()`, en `comoPlataforma`.
2. Por cada empresa, en **su** transacción (una que falla no frena a las demás), llama a
   `MoraEmpresaRepository.congelarSiVencida(org, ahora, gracia)` (§5.1).
3. Por cada empresa, encola los recordatorios del día (R26): las facturas de `factura_plataforma_mora` con
   `fecha_limite = mañana` de la plataforma. Cada una va con:
   - `run_after` = las 08:00 de hoy de la plataforma, para que el correo no salga a las 00:30;
   - dedupe `mora_aviso:recordatorio:<facturaId>:<fechaLimite>`.

   Si la gracia cambia, la fecha límite cambia, y el recordatorio vuelve a salir con la fecha nueva.
4. Si alguna empresa falló, el trabajo falla nombrándolas, para que la cola reintente. El reintento vuelve a pasar
   por la franja de R8: fuera de ella, ya no congela.

### 4.2 `mora_aviso_correo`

- Es por evento, con empresa y de núcleo. El payload, validado con zod, es una de tres formas:
  - `{ tipo: "recordatorio", facturaId }`;
  - `{ tipo: "congelada", congeladaAt }`;
  - `{ tipo: "descongelada", motivo: "pago" | "a_mano" | "gracia", hasta? }`.
- Calcado de `crearFacturaAvisoHandler`:
  - un correo por maestro activo (`destinatariosDelAviso`);
  - si un envío falla, sigue con los demás y después lanza un error sin correos en el mensaje (R29).
- **Al ejecutarse vuelve a leer el estado:**
  - un recordatorio de una factura ya pagada no sale;
  - un «congelada» de una empresa que ya se descongeló tampoco.

  Un correo que llega tarde no dice algo falso.
- Plantillas en `lib/services/email/plantillas/mora-aviso.ts`, sobre `componerCorreo`, con el botón «Ver facturas» →
  `${urlApp}/mi-plan`. Eso enmienda la guardia de SLT-91 R10 igual que SLT-136: el archivo se suma a `permitidos`
  en `mi-plan-solo-maestro.guardia`.
  - **recordatorio:** «Tu factura N.º n vence mañana», con el saldo y la fecha límite;
  - **congelada:** «La operación de <empresa> está congelada por falta de pago», con las facturas vencidas, el saldo
    y qué se puede hacer;
  - **descongelada:** «La operación de <empresa> está activa de nuevo» (R28).

### 4.3 Concurrencia

| Choque | Cómo se evita |
|---|---|
| Congelar mientras el superadmin confirma un pago | Las dos toman `pago_plataforma:<org>`. Si congelar entra primero, la confirmación descongela al terminar (R19). Si entra después, ve el saldo ya bajado y no congela |
| Dos corridas de la misma madrugada | `FOR NO KEY UPDATE` sobre la empresa y la respuesta `ya_congelada` (R9) |
| Descongelar a mano mientras corre la madrugada | `FOR NO KEY UPDATE` sobre la empresa. Gana el orden de llegada y los dos resultados son coherentes |
| Una escritura de la empresa a la vez que se congela | El trigger lee `congelada_at` confirmado. Una escritura que empezó antes de que congelar confirmara pasa: se acepta, porque es de madrugada (decisión «¿Cuándo cae?») |

## 5. Repositorio, servicio y actions

### 5.1 `MoraEmpresaRepository` (`lib/repositories/`, entrada en `EXCEPCIONES_DE_PLATAFORMA` con ficha `"SL-24"`, deuda D29)

```ts
interface IMoraEmpresaRepository {
  // Lectura de la empresa del contexto (servi_app): banner (R24) y puerta (§6.2)
  moraDeLaEmpresa(ahora: Date, gracia: number): Promise<MoraLeida>;          // organizacion + factura_plataforma_mora
  estaCongelada(): Promise<boolean>;                                           // una lectura por petición, sin caché
  // Superadmin (comoPlataforma)
  moraParaPlataforma(org: string, ahora: Date, gracia: number): Promise<MoraLeida & { graciaPropia: number | null; historial: FilaHistorialMora[] }>;
  fijarGracia(org: string, dias: number | null, actor: string, ahora: Date, gracia: number): Promise<"ok" | "sin_cambio">;
  descongelarAMano(org: string, hasta: string, motivo: string, actor: string, ahora: Date): Promise<"ok" | "no_congelada">;
  // Corrida (comoPlataforma)
  empresasConMora(): Promise<string[]>;
  congelarSiVencida(org: string, ahora: Date, gracia: number): Promise<ResultadoCongelar>;
  encolarRecordatorios(org: string, ahora: Date, gracia: number): Promise<number>;
}
```

- **`congelarSiVencida`** abre un `$transaction` y llama a `organizacion_mora_congelar`. Si el resultado es
  `congelada`, en la misma transacción:
  - escribe `appendAccion` con `empresa_congelada`. `entidad = organizacion`, `valorNuevo` = «N.º 3, N.º 5»
    (recortado a 254), `monto` = saldo vencido y actor sistema (R30);
  - encola `mora_aviso_correo { tipo: "congelada" }` con dedupe `mora_aviso:congelada:<org>:<congeladaAt ISO>`
    (R27, R29).
- **`fijarGracia`**, en una transacción:
  1. lee la gracia anterior con `FOR UPDATE`;
  2. si no cambia, devuelve `sin_cambio` sin escribir;
  3. si cambia, actualiza la columna y escribe `appendAccion` con `factura_dias_gracia_cambiada`. `valorAnterior` y
     `valorNuevo` son «15» o «7 (global)»; el actor es el superadmin (`resolverActorCongelado`);
  4. después llama a `recalcularCongelamiento(tx, org, ahora, { causa: "gracia", actor })` (R5).
- **`descongelarAMano`** llama a `organizacion_mora_descongelar_a_mano`. Con `ok`, en la misma transacción:
  - `appendAccion` con `empresa_descongelada_a_mano`, `valorNuevo` = `hasta AAAA-MM-DD — <motivo>` (decisión P5);
  - encola `mora_aviso_correo { tipo: "descongelada", motivo: "a_mano", hasta }` (R28).
- **`moraParaPlataforma`** lee con `conEmpresa(org)`, como `deEmpresaParaPlataforma` de SLT-119, y no pasa por
  `comoPlataforma`. El historial son las filas de `historial_accion` de los cinco tipos de §1.2, las 50 más recientes
  (R31).

### 5.2 El punto de enganche: `recalcularCongelamiento` (`lib/planes/mora-recalcular.ts`, R34)

```ts
export type CausaRecalculo = { causa: "pago" | "gracia"; actor: string | null };
/** Dentro de una transacción del dueño que ya cambió el saldo o la gracia. Nunca congela. */
export async function recalcularCongelamiento(
  tx: Prisma.TransactionClient, org: string, ahora: Date, causa: CausaRecalculo,
): Promise<"descongelada" | "sin_cambio">;
```

1. Llama a `organizacion_mora_descongelar_si_pagada(org, ahora, diasDeGraciaGlobal())`.
2. Con `descongelada`:
   - escribe `appendAccion`: `empresa_descongelada_por_pago` si la causa es un pago, o
     `empresa_descongelada_por_gracia` si es la gracia. El actor es quien pagó o confirmó; `null` es el sistema;
   - encola `mora_aviso_correo { tipo: "descongelada", motivo }` con dedupe
     `mora_aviso:descongelada:<org>:<ahora ISO>`.

**Quién la llama:**

| Llamador | Cuándo | Efecto |
|---|---|---|
| `PagoPlataformaConfirmacionRepository.confirmar` | Pasa a `$transaction`: `SELECT pago_plataforma_confirmar(…)` y después, si el resultado es `ok`, `recalcularCongelamiento(tx, …, { causa: "pago", actor: por })` | R19 |
| `PagoPlataformaConfirmacionRepository.registrarPorFuera` | Igual, si el resultado es `ok` | R19 |
| `PagoPlataformaConfirmacionRepository.anularConfirmado` | Igual. Como nunca congela, aquí casi siempre da `sin_cambio`, y la madrugada siguiente congela si hace falta | R21 |
| `MoraEmpresaRepository.fijarGracia` | §5.1 | R5 |
| SLT-226 / SLT-231 | Su registro del pago aprobado en línea, dentro de la transacción con el candado | Frontera, §9 |

- `ya_confirmado`, `ya_registrado`, `ya_anulado` y los rechazos no recalculan: no cambió el saldo.
- El contrato de los tres métodos (sus resultados) **no cambia**.
- Las funciones `pago_plataforma_*` ya toman el candado `pago_plataforma:`, y el recálculo corre después, en la misma
  transacción. Lo ve todo confirmado dentro de ella.
- Un pago de la empresa por confirmar no pasa por aquí (R20): `factura_plataforma_saldos` solo resta lo confirmado.

### 5.3 `MoraEmpresaService` (`lib/services/`; la autorización vive aquí)

| Método | Quién | Valida (zod) | Resultado |
|---|---|---|---|
| `avisoDeMiEmpresa(actor)` | `maestro` y `admin` de la empresa; otro rol → `null` sin leer (R24) | — | `EstadoMora \| null` |
| `moraDeEmpresa(actor, { organizacionId })` | `esPlataforma` (R4) | `z.uuid()` | `ok` / `forbidden` / `not_found` |
| `fijarGracia(actor, { organizacionId, dias })` | `esPlataforma` | `dias: z.int().min(1).max(60).nullable()` | `ok` / `sin_cambio` / `forbidden` / `validation_error` (R3, R4) |
| `descongelar(actor, { organizacionId, motivo, hasta })` | `esPlataforma` | motivo recortado, de 1 a 200 caracteres; `hasta` entre hoy y hoy + 60 de la plataforma (decisión P4) | `ok` / `no_congelada` / `forbidden` / `validation_error` (R22) |

Con un actor que no es superadmin, el servicio devuelve `forbidden` antes de leer nada.

### 5.4 Actions (`lib/actions/mora-empresa.ts`, `nucleo` en `MODULO_POR_ACTION`)

- `verMoraDeEmpresaAction(organizacionId)` (la lectura de la página).
- `fijarGraciaEmpresaAction(organizacionId, input)` y `descongelarEmpresaAction(organizacionId, input)`. La empresa
  va ligada con `.bind` en la página; un `organizacionId` en `input` no cuenta.
- `avisoMoraDelLayout()`: la lectura del banner. Se llama desde `app/(app)/layout.tsx` en el servidor.

## 6. El bloqueo (R10–R18)

Hay **dos capas**, cada una con su papel:

1. **La base, que falla cerrado (R16).** El trigger de §2.5 cubre todo lo que escribe `servi_app`: Prisma, SQL a
   mano, escrituras anidadas, las PWA, los jobs sin permiso y las actions que todavía no existen.
2. **El borde, con un error claro (R13, R14).** En la API y la carga masiva se rechaza antes de empezar. Si no, un
   lote de 100 filas devolvería 200 con 100 errores de fila, porque la carga marca cada fila como fallida y responde
   200 («200 aunque todas las filas fallen»).

### 6.1 Permisos y traducción (`lib/db/`)

**`lib/db/permiso-en-mora.ts`** guarda el permiso en un `AsyncLocalStorage` propio, en `globalThis` con
`Symbol.for`, como el contexto de empresa. Es independiente de `ContextoDatos`, para que sirva también cuando la
empresa sale de la sesión:

```ts
export const MOTIVOS_EN_MORA = ["pago_plataforma", "cuenta_propia", "whatsapp_entrante", "sistema"] as const;
export function permitidoEnMora<T>(motivo: MotivoEnMora, fn: () => Promise<T>): Promise<T>;
export function permisoEnMoraActual(): MotivoEnMora | null;
```

**`lib/db/extension-empresa.ts`:** las dos envolturas, `fijarEmpresa` y la de la transacción interactiva (línea
289), suman `set_config('app.mora_permitida', ${permisoEnMoraActual() ?? ''}, true)` **en la misma sentencia**.
No hay ningún viaje más a la base.

**Traducción:**
- `traducirErrorDeMora(e)` (`lib/planes/empresa-congelada.ts`) convierte `SQLSTATE SL121` en `EmpresaCongelada`.
- `EmpresaCongelada` es un `ForbiddenError`, con `message = MENSAJE_EMPRESA_CONGELADA` y
  `details = { codigo: "empresa_congelada" }`.
- Se encadena en los dos `traducir` de la extensión, después de `traducirErrorDeEmpresa`.
- Con eso, `withErrorHandler` lo da como `FORBIDDEN` con su mensaje, y `toActionError`, como `{ status: "forbidden" }`.
- **No se amplía** el `AppErrorCode` cerrado ni su `switch` (mismo criterio que SL-23 §5.5 y SL-24).

**Dónde se concede el permiso** (lista cerrada; la vigila la guardia `mora-permiso-solo-en-lista`):

| Archivo | Motivo | Alcance |
|---|---|---|
| `lib/actions/wallet-egresos.ts` | `pago_plataforma` | Solo si `data.categoria === "egreso_pago_plataforma"`, después del parse (R11) |
| `lib/actions/wallet-anulacion.ts` | `pago_plataforma` | (decisión P3) Solo la anulación de un egreso de pago a la plataforma por confirmar |
| `lib/actions/confirmar-correo.ts` | `cuenta_propia` | El canje del enlace de la propia persona (R11) |
| `lib/actions/password-reset.ts` | — | No hace falta: ya corre como plataforma (dueño) |
| `lib/actions/push.ts`, `lib/actions/notificaciones.ts`, `lib/actions/vistas-filtro.ts` | `cuenta_propia` | (decisión P2) Solo las mutaciones sobre filas del propio usuario |
| `lib/services/WebhookWhatsappService.ts` | `whatsapp_entrante` | Los dos `conEmpresa` de la ingesta (R15) |
| `app/api/cron/procesar-jobs/route.ts` (`conSuEmpresa`) | `sistema` | (decisión P1) Todo trabajo con empresa (R17) |
| `lib/db/para-cada-empresa.ts` | `sistema` | (decisión P1) Todo cron y recurrente por empresa (R17) |

**Propio perfil.** Hoy no hay una pantalla de «mi perfil»: un usuario cambia su contraseña por «¿Olvidaste tu
contraseña?» (como plataforma, no le afecta), y su correo con el enlace de SLT-221. `actualizarUsuario` es la
edición de usuarios del maestro y queda **bloqueada**, también sobre uno mismo. Si un día existe «mi perfil», su
action suma la fila `cuenta_propia`.

### 6.2 La puerta del borde: `exigirEmpresaOperativa()` (`lib/planes/empresa-congelada.ts`)

```ts
/** Para la API y la carga masiva: con la empresa del contexto congelada, lanza EmpresaCongelada (403). */
export async function exigirEmpresaOperativa(): Promise<void>;
```

- Lee `MoraEmpresaRepository.estaCongelada()` en la empresa del contexto: una consulta por petición, sin caché entre
  peticiones. Así un descongelamiento vale desde la siguiente petición.
- Sin empresa no aplica: el caso no existe en estos bordes, porque la API ya resolvió la key.
- **Rutas** (justo después de `conEmpresaDeLaKey`, antes de leer el cuerpo):
  - `POST /api/ordenes/api-key/carga`;
  - `POST /api/ordenes/api-key/carga/{cargaId}/generate`;
  - `POST /api/ordenes/api-key/habilitar`;
  - `PUT /api/ordenes/api-key/{numGuia}/cancelar`;
  - `POST /api/ordenes/api-key/orden/{id}/generate`;
  - `DELETE /api/ordenes/api-key/orden/{id}`.
- **Carga masiva por pantalla:** `POST /api/ordenes/carga-masiva/chunk` (R14).
- **No llevan puerta:**
  - `POST /api/ordenes/api-key/cotizacion`, que solo calcula;
  - los `GET` (R13).
- Las dos `generate` escriben (la etiqueta y el objeto en Storage): cuentan como escritura (§13).

### 6.3 La respuesta de la API (pregunta abierta resuelta)

```http
HTTP/1.1 403 Forbidden
{ "status": "error", "code": "FORBIDDEN", "message": "Empresa suspendida por falta de pago.",
  "details": { "codigo": "empresa_congelada" } }
```

- **Por qué 403 y `details.codigo`:** es la convención vigente de la API v1/v2 para «la key es válida pero esta
  empresa no puede hacer esto».
  - `modulo_inactivo` (SL-23) ya es un 403 con `details.codigo`.
  - `tope_plan` (SL-24) usa el mismo `details.codigo` sobre su propio status.
  - El integrador ya distingue por `details.codigo`, y `withErrorHandler` produce esta forma sin código nuevo.
- Se documenta en:
  - `lib/api/openapi-spec.ts` y `docs/api/api-key-openapi.yaml`: respuesta 403 en las seis rutas de §6.2;
  - `docs/api/CHANGELOG.md`;
  - `docs/ayuda/oficina/guia-integracion-api.md`.
- Va antes del 422: una key válida de una empresa congelada no debe recibir la validación del cuerpo. Es el orden
  «auth → puerta → cuerpo» de la analítica.

### 6.4 Pantallas (R12)

- No se esconde ningún botón: la decisión pide que los roles sin banner vean «solo el error al intentar operar».
- La action que llega a la base recibe `EmpresaCongelada`:
  - con `withErrorHandler` (88 archivos de `lib/actions/`), responde `{ status: "forbidden" }` y la pantalla muestra
    su error de permiso;
  - sin él, la excepción sube al límite de error de la página.

  En los dos casos no hay efectos y se ve un error. Es lo que pide R12.
- El texto exacto «Empresa suspendida por falta de pago.» solo se garantiza en la API, la carga masiva y el banner.
  Ponerlo en cada pantalla obliga a tocar los cientos de sitios que pintan un `forbidden`, y queda fuera (§11).

## 7. Interfaz

### 7.1 Banner (R24): `app/(app)/_components/AvisoMora.tsx`

- `app/(app)/layout.tsx` llama a `avisoMoraDelLayout()` solo si el actor es `maestro` o `admin` de una empresa. Para
  los demás roles no consulta nada.
- El resultado (`EstadoMora`) baja al componente por props. Su lectura es aislada: si falla, no hay banner y la
  página se pinta igual.
- Sin `"use client"`: es solo texto y un enlace.

| Estado | Texto (en `MORA_TEXTOS`) | Estilo |
|---|---|---|
| `en_plazo` | «Tienes una factura de la plataforma por pagar. Fecha límite: dd/mm/aaaa.» + «Ver facturas» (solo el maestro: `/mi-plan`) | aviso |
| `vencida` | «Tienes facturas vencidas. Si no se pagan, la operación se congela esta madrugada.» | alerta |
| `congelada` | «Empresa congelada por falta de pago. Puedes ver tus datos, cambiar tu cuenta y pagar a la plataforma desde la wallet.» | alerta |
| `descongelada_a_mano` | «La operación está habilitada hasta el dd/mm/aaaa.» | aviso |
| `al_dia` | sin banner | — |

- `role="status"` (aviso) o `role="alert"` (alerta).
- El enlace a `/mi-plan` lo lleva solo el maestro. Eso respeta la guardia de SLT-91: el componente queda en su lista
  de `permitidos` con el `href` condicionado al rol.

### 7.2 Superadmin (R32): `app/(app)/plataforma/empresas/[organizacionId]/_components/MoraEmpresa.tsx`

- Es una sección «Plazo de pago y mora» en la pestaña «Empresa», antes del plan. La lectura va en el `Promise.all`
  de la página y es aislada: un `null` muestra «No se pudo cargar la mora».
- Muestra:
  - la gracia vigente, «15 días (propia)» o «7 días (global)»;
  - un campo numérico de 1 a 60 con «Guardar» y «Usar la global»;
  - el estado, con las facturas vencidas (número, fecha límite y saldo);
  - el historial de la mora (R31).
- «Descongelar» aparece solo si está congelada. Abre un diálogo con el motivo (textarea, máximo 200) y la fecha hasta
  (por defecto, hoy + 7), y lo confirma.
- Las actions van ligadas a la empresa de la URL. Un resultado distinto de `ok` muestra su mensaje en el diálogo.

### 7.3 El maestro ve el historial (R31)

Las filas entran en «Histórico de acciones» con una categoría nueva, `mora` («Mora y congelamiento»):
`CATEGORIAS_ACCION`, `CATEGORIA_POR_ACCION`, `ACCION_LABELS`, `CATEGORIA_LABELS` y las etiquetas de
`historial-accion-etiquetas.ts`. Ninguna pantalla nueva.

## 8. Migraciones

### 8.1 `db/migrations/20261124120000_mora_enums/`

- **UP:** `ALTER TYPE … ADD VALUE IF NOT EXISTS` de los siete valores de §1.2.
- **`down.sql`:** la función `pg_temp.quitar_valores_de_enum_*` copiada de SLT-136 (sufijo `_121`). Aborta con `RAISE`
  si alguna fila usa uno de esos valores.

### 8.2 `db/migrations/20261124120100_mora_congelamiento/`

- **UP:**
  1. las columnas de §1.1, con el `CHECK` y el índice;
  2. las funciones de §2, con sus `REVOKE` y el `GRANT EXECUTE` de `factura_plataforma_mora` a `servi_app`;
  3. `bloqueo_por_mora()`;
  4. un bloque `DO` que crea `<t>_bloqueo_por_mora` en cada tabla con la política `<t>_por_empresa`, y en
     `organizacion`.

  No toca filas: ninguna empresa nace congelada.
- **`down.sql`:**
  1. borra los triggers, recorriendo `pg_trigger` por nombre;
  2. borra las funciones;
  3. borra el índice y las tres columnas.

  Si hay empresas congeladas, el `down` las deja operativas: se pierde el estado, y está aceptado porque es una
  reversión.
- **Timestamps** posteriores a `20261123120100_zona_activa`. Si `dev` avanzó al abrir el PR, se renumeran antes de
  aplicar, nunca después.

### 8.3 Guardias y estado de la base

- **Nueva** `tests/integration/db/bloqueo-por-mora-cobertura.test.ts`: toda tabla con la política `_por_empresa` tiene
  su trigger `bloqueo_por_mora`. Así una tabla de negocio nueva sin el trigger pone el gate en rojo, igual que
  `fk-misma-empresa`.
- **Nueva** `tests/unit/guards/mora-permiso-solo-en-lista.guardia.test.ts`: `permitidoEnMora(` solo aparece en los
  archivos de §6.1, cada uno con su motivo.
- `db/schema.prisma`: las tres columnas en `Organizacion` y los siete valores de enum, con comentario.

## 9. Fronteras

- **SLT-226 «Cobro automático: modelo del cobro e idempotencia» (en curso, otra rama).** Su pago aprobado en línea
  baja el saldo. Para descongelar, dentro de la **misma** transacción en la que registra el pago y con el candado
  `pago_plataforma:<org>`, llama a `recalcularCongelamiento(tx, org, ahora, { causa: "pago", actor: null })`.
  - Esta ficha no toca sus archivos ni su tabla `cobro_intento`.
  - Si SLT-226 mergea antes, quien llegue segundo añade la llamada al resolver el conflicto.
  - Queda escrito en `docs/architecture.md`.
- **SLT-231 «Cobro automático: botón «Pagar» y estado de la factura».** El estado «vencida» de cada factura sale de
  `factura_plataforma_mora` (`vencida`, `fecha_limite`) o de `estaVencida` en TS (R6). Esta ficha no lo pinta en la
  lista de facturas: eso lo hace SLT-231.
- **SLT-230 «Cobro automático: enlace de pago por factura».** La caducidad del enlace es `venceEn(fechaLimiteDePago(…))`.
- **SLT-132 «Correos del pago a la plataforma».** Sus correos de confirmación del pago son otros. El «descongelada» de
  aquí puede llegar junto al de SLT-132: son dos hechos distintos.
- **SLT-90 «Planes: ciclo y cobro en la zona de cada empresa».** Cuando llegue, cambia `interval '6 hours'` y
  `fechaCalendarioCR` por la zona de la empresa en las piezas de §2.1 y §3.2.

## 10. Tests (trazabilidad R → test)

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/unit/config/factura-gracia.test.ts` (nuevo) | R2 | Ausente, «abc», «0», «61», «7.5» → 7; «15» → 15 |
| `tests/unit/planes/mora.test.ts` (nuevo) | R1, R6, R8, R24 | Tabla compartida; `estaVencida` con saldo 0 y negativo; franja 05:59 sí y 06:00 no; `estadoDeMora` en los cinco estados |
| `tests/integration/db/factura-plataforma-mora.test.ts` (nuevo) | R1, R6, R33 | La misma tabla contra la función; en curso fuera; saldo con un pago anulado (SLT-143); `42501` con otra empresa como `servi_app` |
| `tests/integration/db/mora-congelar.test.ts` (nuevo) | R7, R8, R9, R18, R21, R23 | Base real: congela a las 00:30 y no a las 06:00 ni a las 14:00; `ya_congelada`; descongelada a mano hasta hoy → no; hasta ayer → sí; dos empresas, solo una congela; anular un confirmado no congela en el acto y la corrida siguiente sí |
| `tests/integration/db/bloqueo-por-mora.test.ts` (nuevo) | R10, R12, R16, R18 | Como `servi_app`: `SELECT` pasa; `INSERT` en `orden`, `UPDATE` en `tarifa_valor`, `DELETE` en `zona` y SQL a mano → `SL121`; con `app.mora_permitida` pasa; como dueño pasa; la otra empresa escribe |
| `tests/integration/db/bloqueo-por-mora-cobertura.test.ts` (nuevo) | R16 | §8.3 |
| `tests/integration/db/mora-migration.test.ts` (nuevo) | R16 (migración) | Columnas y `CHECK` 0/61 → `23514`; `down` reversible e idempotente; el enum `down` aborta si hay uso |
| `tests/unit/db/extension-empresa-mora.test.ts` (nuevo) | R16, R11 | La envoltura fija `app.mora_permitida` con y sin permiso, fuera y dentro de una transacción; `SL121` → `EmpresaCongelada` |
| `tests/unit/guards/mora-permiso-solo-en-lista.guardia.test.ts` (nuevo) | R11, R15, R17 | §8.3 |
| `tests/integration/repositories/mora-empresa-repository.test.ts` (nuevo) | R5, R19, R22, R30, R31, R32 | Fijar gracia: historial «7 (global)» → «15», `sin_cambio` no escribe; bajar la gracia no congela y subirla con la empresa congelada la descongela con su fila y su trabajo; descongelar a mano con motivo y hasta; `no_congelada`; historial del superadmin con `conEmpresa` |
| `tests/integration/repositories/pago-plataforma-recalcula-mora.test.ts` (nuevo) | R19, R20, R21, R34 | Congelada → confirmar el pago que salda → descongelada en la misma transacción, con historial y trabajo; un pago parcial no descongela; por fuera igual; un pago por confirmar no descongela; anular no congela; si el recálculo falla, la confirmación se deshace |
| `tests/unit/services/mora-empresa-service.test.ts` (nuevo) | R3, R4, R22, R24 | `forbidden` sin llamadas (maestro, admin, sin sesión); validación de días, motivo y hasta (decisión P4); el banner solo para maestro y admin |
| `tests/unit/actions/mora-empresa.test.ts` (nuevo) | R4, R32 | Manda la empresa ligada, no la del `input` |
| `tests/unit/planes/jobs-mora.test.ts` (nuevo) | R7, R9, R26, R27, R28, R29 | Dobles: la corrida por empresa sigue si una falla y después lanza; los recordatorios con `run_after` a las 08:00 y su dedupe; el manejador de avisos relee el estado (factura pagada → no envía); un envío fallido sigue y lanza; registro en `buildHandlers`, `MODULO_POR_JOB`, `RECURRENTES_DE_PLATAFORMA` y `SIEMBRAS_RECURRENTES` |
| `tests/unit/services/email/plantilla-mora-aviso.test.ts` (nuevo) | R26, R27, R28 | Asunto y cuerpo de los tres tipos; botón a `/mi-plan`; sin URL, la nota; escape |
| `tests/unit/services/email/plantilla-factura-emitida.test.ts` (se amplía) | R25 | Con total > 0 lleva «Paga hasta el dd/mm/aaaa»; con 0 no |
| `tests/unit/planes/jobs-factura-aviso.test.ts` (se amplía) | R25 | Pasa la gracia de la empresa a la plantilla |
| `tests/integration/api/api-key-empresa-congelada.route.test.ts` (nuevo) | R13 | Las seis rutas de escritura → 403 con el cuerpo exacto y sin filas nuevas; `GET` listado y orden → 200; cotización → 200 |
| `tests/integration/api/carga-masiva-empresa-congelada.route.test.ts` (nuevo) | R14 | Chunk → 403 con el mensaje; cero órdenes |
| `tests/unit/services/webhook-whatsapp-mora.test.ts` (nuevo) | R15 | La ingesta corre dentro de `permitidoEnMora("whatsapp_entrante")` |
| `tests/unit/cron/procesar-jobs-mora.test.ts` (nuevo) | R17 | `conSuEmpresa` y `paraCadaEmpresa` corren con permiso `sistema` |
| `tests/unit/actions/wallet-egresos-mora.test.ts` (nuevo) | R11 | El permiso solo para `egreso_pago_plataforma`; un gasto con la empresa congelada → `forbidden` |
| `tests/components/AvisoMora.test.tsx` (nuevo) | R24 | Cinco estados; enlace solo para el maestro; `role` |
| `tests/components/MoraEmpresa.test.tsx` (nuevo) | R32 | Gracia propia o global; «Descongelar» solo si está congelada; errores de validación |
| `tests/unit/guards/historial-accion-*.guardia.test.ts` (se enmiendan) | R30 | Los cinco tipos nuevos en el censo; la excepción declarada de la decisión P5 |
| `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` (se enmienda) | R24, R26 | `mora-aviso.ts` y `AvisoMora.tsx` en `permitidos` |
| Inventarios de enums existentes (se amplían) | §8.1 | Los de `job_tipo` y `historial_accion_tipo` que se pongan en rojo |
| `e2e/mora-congelamiento.spec.ts` (nuevo, proyecto `dinero`) | R35, R10, R12, R13, R24 | §11 |
| `e2e/dos-empresas-humo.spec.ts` (sin cambios, se corre) | R18, R35 | Obligatorio por `docs/checkpoints-proyecto.md` |

## 11. E2E (`e2e/mora-congelamiento.spec.ts`)

**Siembra:** una empresa con plan y una factura cerrada con saldo, con el mismo atajo SQL que `facturas-plataforma.spec`.
Su `hasta` se fija 8 días atrás y la gracia propia en 1, así que vence sin esperar. La empresa se congela llamando
a `organizacion_mora_congelar` con un `ahora` dentro de la franja.

**Pasos:**
1. El maestro entra y ve «Empresa congelada por falta de pago».
2. El `admin` entra y ve el banner. La tienda (`adminTienda`) intenta crear una orden por la carga masiva: ve
   «Empresa suspendida por falta de pago.» y la orden no existe.
3. Con una key de la empresa, `POST /api/ordenes/api-key/carga` → 403 y `details.codigo`, y `GET /api/ordenes/api-key`
   → 200.
4. El maestro registra el pago a la plataforma desde la wallet.
5. El superadmin lo confirma en el detalle de la empresa. La sección «Plazo de pago y mora» pasa a «Al día» y muestra
   la fila «descongelada por pago».
6. El maestro y el `admin` ya no ven el banner, y la tienda crea la orden.

**Enmienda del 2026-11-21 (humano: «Enmendar R35 a tienda»):** el `admin` no tiene pantalla para crear órdenes (la
carga masiva es solo de `adminTienda`: `app/(app)/ordenes/page.tsx` y `app/api/ordenes/carga-masiva/chunk/route.ts`),
así que la escritura la intenta y la hace la tienda.

**Desvío de la siembra (T5.1):** el `hasta` de la factura no se puede adelantar porque el trigger
`factura_plataforma_inmutable` no deja cambiar una factura cerrada. El spec llama a `organizacion_mora_congelar` con
un `ahora` de la madrugada en que la factura ya vence, y no fija la gracia propia.

La PWA del mensajero no se recorre: R12 en entregas lo cubre `bloqueo-por-mora.test.ts`, porque el trigger es el
mismo para todos los caminos. Correr en local, antes del PR, `--project=dinero` y `dos-empresas-humo` (perfil de
agentes).

## 12. Tamaño estimado

| | Archivos | Líneas |
|---|---|---|
| Producción (incluye migraciones, docs de la API y `docs/architecture.md`) | 53 | ~2 300 (SQL ~550, TS ~1 450, UI ~300) |
| Tests | 30 (+ inventarios de enums) | ~2 800 |
| **Total** | **83** | — |

Tope de `gate.tamano_pr`: 40 archivos, 1 000 líneas de producción y 3 000 de tests. Pasa de los archivos y de las
líneas de producción. El humano aceptó un solo PR grande el 2026-11-13 (label `tamano-pr-aceptado`, decisión
«Tamaño»).

## 13. Decisiones de diseño que el humano debe ver

1. **El bloqueo vive en la base** (trigger por sentencia sobre `current_user = 'servi_app'`), con una lista cerrada
   de permisos y una puerta explícita en la API y la carga masiva. Hay más de 120 archivos de actions: una puerta por
   action no escala y dejaría abierta cualquier action nueva.
2. **Franja de madrugada: de 00:00 a 05:59** de la plataforma, con la corrida a las 00:30. Una corrida reintentada
   después de las 06:00 ya no congela (R8). Es como se lee «nunca a mitad de jornada».
3. **El recordatorio sale a las 08:00** del día anterior a la fecha límite, no a las 00:30.
4. **`empresa_descongelada_por_gracia`** es un quinto tipo de historial, no listado en la decisión, para R5.
5. **`FACTURA_DIAS_GRACIA` inválida** si no es un entero de 1 a 60: el mismo rango que la gracia propia.
6. **Las dos rutas `generate` de la API** (etiqueta PDF) cuentan como escritura y se rechazan con la empresa congelada.
7. **El texto «Empresa suspendida por falta de pago.»** sale exacto en la API, la carga masiva y el banner. En las
   demás pantallas se ve el error de permiso que cada una ya pinta (§6.4).
8. **`actualizarUsuario` queda bloqueada también sobre uno mismo**: hoy no hay una pantalla de «mi perfil» (§6.1).
9. **Sin aviso en la campanita:** los avisos son el banner y los correos, como dice la decisión.

## 14. Alternativas descartadas

- **Una puerta `exigirEmpresaOperativa()` en cada action de escritura**, como `exigirModuloActivo`. Son más de 120
  archivos y unas 300 llamadas a `withErrorHandler`. Cada action nueva tendría que acordarse, y fallaría abierto. La
  base falla cerrado y cubre también el SQL a mano y la PWA.
- **El chequeo en la extensión de Prisma** (rechazar `create`/`update`/`delete` con la empresa congelada). No ve lo que
  `$queryRaw` escribe a través de funciones, ni las escrituras anidadas que no pasan por el modelo, y obliga a una
  lectura extra por operación fuera de una transacción. El trigger cubre todo con la misma lectura.
- **Un segundo rol de base, `servi_app_lectura`**, al que la envoltura cambia con la empresa congelada. Habría que
  duplicar los `GRANT`, las políticas RLS y los `EXECUTE` de unas 90 tablas y funciones, y mantenerlos en paralelo
  en cada migración nueva. El riesgo de deriva es mayor que el de un trigger con su guardia de cobertura.
- **Una tabla `organizacion_mora_evento`** con el estado y el rastro. Duplica `historial_accion`, que la decisión
  fija como rastro. El estado es uno por empresa: tres columnas bastan.
- **Guardar la fecha límite en cada factura.** Un cambio de gracia obliga a reescribirla en las cerradas, y
  `factura_plataforma_inmutable` (`SL118`) lo impide, también al dueño. Derivarla cumple la decisión «Cambio de
  gracia» sin tocar facturas.
- **Recalcular dentro de `pago_plataforma_confirmar`, `_registrar_por_fuera` y `_anular_confirmado`.** Habría que
  reescribir tres funciones del dueño ya en `dev`, con otra migración y otro `down.sql`. Envolverlas en una
  transacción desde el repositorio da la misma atomicidad (es el criterio de SLT-136 §10).
- **Congelar en el acto al vencer, o al anular un pago.** Contradice la decisión «¿Cuándo cae?»: nunca a mitad de
  jornada.
- **HTTP 402 Payment Required o 423 Locked para la API.** El 402 está reservado y los clientes HTTP lo tratan de forma
  dispar; el 423 es de WebDAV. Ninguno es la convención del repo, que es 403 con `details.codigo`.
