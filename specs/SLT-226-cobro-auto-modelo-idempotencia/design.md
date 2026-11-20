# SLT-226 «Cobro automático: modelo del cobro e idempotencia» — design

> Requisitos: `requirements.md` (R1–R39). Escrito por `spec_author` el 2026-11-20.
> **Enmienda del 2026-11-20** (humano; R30–R39): varios proveedores, el método del cobro y marcar pagado a mano.
> Todo lo que cambia está en §12; las secciones de antes llevan una nota donde §12 las corrige.
> - Hay dos migraciones nuevas, cada una con su `down.sql`: una para los valores del enum del historial y otra
>   para el modelo.
> - Hay una tabla nueva de negocio, `cobro_intento`, y una de plataforma, `cobro_webhook_evento`.
> - **No hay dependencias nuevas:** Prisma, zod y SQL.
> - Los importes van en `numeric`/`Prisma.Decimal` y viajan como `string` en los tipos, como en SLT-60. Nunca van
>   en `Number`.
> - P1–P5 las respondió el humano el 2026-11-20 y están en `requirements.md > Decisiones cerradas`. El diseño
>   las cita como «decisión P<n>».

## Lo que ya existe

Busqué el 2026-11-20 en los tres sitios, con los términos `cobro_intento`, `rebill`, `pasarela`, `pago en línea`,
`webhook_evento`, `idempotencia`, `ProveedorCobro`, `historial_plataforma` y `factura_plataforma_saldos`. El grafo
**no** tenía indexado este worktree (`index_status`: project not found), así que exploré con Grep y Read.

- **El board** (`feature_list.json`): solo aparecen las fichas de la épica EP-9 «Cobro automático del plan con
  Rebill», SLT-226 a SLT-234. Ninguna se solapa con esta. Las fronteras son:
  - SLT-227 «Cobro automático: proveedor de cobro y adaptador de Rebill» define `ProveedorCobro` con `crearEnlace`,
    `consultarPago`, `verificarFirma` y `devolver`. Aquí solo nace `consultarPago`, y SLT-227 amplía la interfaz;
  - SLT-228 «Cobro automático: webhook de Rebill» llama a `procesarEvento` (§4.3) desde su job;
  - SLT-229 «Cobro automático: cobro en USD para países sin cobertura» rellena la foto de la conversión, cuyas
    columnas nacen aquí;
  - SLT-230 «Cobro automático: enlace de pago por factura» llama a `obtenerOCrearIntento` y a `registrarEnlace`;
  - SLT-233 «Cobro automático: conciliación, devoluciones y contracargos» se ocupa del efecto en la caja de
    `devuelto` y `contracargo`, y de lo que quede como «requiere revisión».
- **`specs/`:** ningún spec nombra `cobro_intento`, Rebill ni el pago en línea. Los precedentes que se heredan son
  SL-45, SLT-60, SLT-118 y SLT-143.
- **El código:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| `factura_plataforma_saldos(p_org)`: la única definición del saldo | `20261116120000`, cambiada en `20261121130000` | **Se reutiliza** sin cambios (R1, R5, R21) |
| `_pago_plataforma_aplicar(…, p_por_fuera)`: valida y escribe la confirmación y las aplicaciones | `20261121130000` §4 | **Se reutiliza** con un parámetro más (§3.6) |
| `wallet_movimiento_tope_pago_plataforma()`: el tope del «Pago a la plataforma» | `20261116120000` §8 | **Cambia su cuerpo:** gana la excepción del pago en línea (§3.7; R22, decisión P1) |
| El candado `pg_advisory_xact_lock(hashtext('pago_plataforma:' \|\| org))` | Las funciones de SLT-60 y SLT-143 | **Se reutiliza:** todas las funciones nuevas lo toman primero |
| `pago_plataforma_registrar_por_fuera`: el molde del pago que nace confirmado | `20261121130000` §5 | **Es el molde** de `cobro_registrar_pago_aprobado` (§3.5) |
| `historial_plataforma` y `appendAccionPlataforma` | `20261026130400`, `lib/repositories/registrar-accion-plataforma.ts` | **Se reutiliza la tabla** con dos valores nuevos en sus enums (§1.3). Las filas las escriben las funciones del dueño de §3, en su misma sentencia |
| `quitar_valores_de_enum_slt215` | `20261121140000_plan_nivel_job_enum/down.sql` | **Se copia tal cual**, renombrada `_slt226`, en el `down.sql` del enum |
| `verificar_misma_empresa`, `impedir_cambio_de_empresa`, `scripts/generar-misma-empresa.ts` | SL-17 | **Se reutilizan** para las FK de `cobro_intento` |
| `esAccesoTotal` y `esPlataforma` | `lib/auth/` | **Se reutilizan** para R27 |
| `monedaConfig.currency` | `lib/config/moneda.ts` | **Es la moneda local** del intento (§2) |
| `PagoPlataformaConfirmacionRepository`, entrada en `EXCEPCIONES_DE_PLATAFORMA` con la ficha `SL-45` | `lib/repositories/`, `lib/db/excepciones-aislamiento.ts` | **Es el molde** del repositorio nuevo (§4.2) |

No se re-crea nada de lo anterior.

## 1. Modelo de datos

### 1.1 `cobro_intento` (de negocio)

```
cobro_intento
  id                 text PK (gen_random_uuid())
  organizacion_id    text NOT NULL FK organizacion ON DELETE CASCADE   (DEFAULT de la empresa de la tx)
  factura_id         text NOT NULL FK factura_plataforma (sin acción)
  proveedor          text NOT NULL  CHECK IN ('rebill')    -- enmienda §12.1: + 'wompi', 'global66'
  metodo             text NOT NULL  CHECK IN ('tarjeta','recurrente','transferencia')   -- enmienda §12.1
  clave              text NOT NULL                       -- factura|monto_local|moneda_cobro|tasa (§12.2: +|proveedor|metodo)
  monto_local        numeric(14,2) NOT NULL CHECK > 0    -- el saldo de la factura al crearlo (R1)
  moneda_local       char(3) NOT NULL                    -- ISO 4217
  moneda_cobro       char(3) NOT NULL
  monto_cobrado      numeric(14,2) NOT NULL CHECK > 0
  tasa               numeric(18,8) NULL CHECK > 0        -- la foto de la conversión (SLT-229)
  tasa_fuente        text NULL
  tasa_at            timestamp(3) NULL
  estado             text NOT NULL CHECK IN (creado, pendiente, aprobado, rechazado, expirado, anulado,
                                             devuelto, contracargo)
  motivo_anulacion   text NULL CHECK IN ('saldo_cambiado', 'clave_distinta'); solo con estado anulado
  id_externo         text NULL                           -- el cobro del proveedor (enlace); al pasar a pendiente
  pago_proveedor_id  text NULL                           -- el payment_id; al aprobarse
  pago_id            text NULL FK wallet_movimiento DEFERRABLE INITIALLY DEFERRED (sin acción)
  creado_por         text NULL FK usuario ON DELETE RESTRICT
  created_at         timestamp(3) NOT NULL
  estado_at          timestamp(3) NOT NULL               -- el último cambio de estado
  aprobado_at        timestamp(3) NULL
```

**Restricciones:**
- `cobro_intento_conversion`, de R6. O se cobra en moneda local, o en otra moneda:
  - **moneda local:** `moneda_cobro = moneda_local`, `monto_cobrado = monto_local` y los tres campos de la tasa
    nulos;
  - **otra moneda:** `moneda_cobro <> moneda_local` y los tres campos de la tasa no nulos.
- `cobro_intento_pago_completo`, de R9: si el estado es `aprobado`, `devuelto` o `contracargo`, entonces
  `pago_proveedor_id` y `pago_id` no son nulos.
- `cobro_intento_motivo`: `motivo_anulacion` no es nulo si y solo si el estado es `anulado`.

**Índices:**

| Nombre | Definición | Para qué |
|---|---|---|
| `cobro_intento_un_vivo_por_factura` | `UNIQUE (organizacion_id, factura_id) WHERE estado IN ('creado','pendiente')` | Capa 1 (R4) |
| `cobro_intento_proveedor_id_externo_key` | `UNIQUE (proveedor, id_externo)`, **global** | R10. El webhook encuentra el intento sin saber la empresa |
| `cobro_intento_proveedor_pago_key` | `UNIQUE (proveedor, pago_proveedor_id)`, **global** | Capa 3 (R20) |
| `cobro_intento_org_pago_key` | `UNIQUE (organizacion_id, pago_id)` | Un pago del libro, un intento |
| `cobro_intento_org_factura_idx` | `(organizacion_id, factura_id, created_at DESC)` | R27 |
| `cobro_intento_organizacion_id_idx` | `(organizacion_id)` | La guardia `organizacion-en-modelos` |

- **Los dos únicos globales** van a `UNICOS_SIN_EMPRESA` con tipo `global`, y a la lista de globales de
  `docs/architecture.md > Multi-empresa`. Es el caso de `integracion.whatsapp_numero_id`: un id del proveedor
  lleva a una sola empresa.
- **El estado es `text` con CHECK**, como `factura_plataforma.estado`, y no un enum (alternativa 5).
- **RLS (R26):**
  - la política `cobro_intento_por_empresa` (`FOR ALL TO servi_app`, con el molde de SLT-143);
  - `REVOKE INSERT, UPDATE, DELETE ON cobro_intento FROM servi_app`.

  Solo escriben las funciones del dueño de §3.
- **Triggers:**
  - `cobro_intento_solo_avanza` (BEFORE INSERT OR UPDATE, R7 y R8), de la función `cobro_intento_solo_avanza()`:
    - en el INSERT, exige `estado = 'creado'`;
    - en el UPDATE, exige que `(OLD.estado, NEW.estado)` sea igual o esté en la tabla de R7, y que no cambien las
      columnas fijas de R8;
    - `id_externo`, `pago_proveedor_id` y `pago_id` solo pasan de `NULL` a un valor;
    - si algo falla, `RAISE … ERRCODE = 'SL226'` con `{codigo: 'transicion_invalida' | 'columna_fija'}`;
    - corre para todos los roles, el dueño incluido, como `pago_plataforma_inmutable`.
  - **Sin trigger de borrado (T0.3, decisión del humano del 2026-11-20, opción a).** El borrado lo cierra solo el
    `REVOKE DELETE` a `servi_app` (R8, R26), como en `pago_plataforma_confirmacion` (SLT-60). El dueño de la base
    sí puede borrar: es lo que necesitan las limpiezas de los tests y la de la demo, que borran empresas.
    - **Por qué no el trigger `cobro_intento_sin_borrar`:** medido en una base desechable, en el `CASCADE` desde
      `organizacion` corre con `pg_trigger_depth() = 2` y la empresa ya no existe, así que las dos señales
      distinguían el cascade. Pero ninguna dejaba limpiar una empresa con un intento cuyo `creado_por` es un
      usuario suyo: `usuario` no se borra (la FK `RESTRICT` de `creado_por`), `organizacion` tampoco (la FK
      `RESTRICT` de `usuario.organizacion_id`) y el intento tampoco (el trigger). Y el borrado de la demo
      (`scripts/demo-qa/borrar.ts`) va tabla por tabla antes que la empresa.
    - **Las limpiezas:** borran `cobro_intento` (y sus filas de historial) antes que los usuarios de la empresa,
      por la FK `RESTRICT` de `creado_por`. `cobro_webhook_evento` no tiene FK a nada de la empresa.
  - Los de SL-17, generados con `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`:
    - misma empresa en `factura_id`, `pago_id` y `creado_por`;
    - `cobro_intento_sin_cambio_de_empresa`.
    - `TRIGGERS_MISMA_EMPRESA` sube de 183 a **186**, y la guardia `rls-por-empresa` de 96 a **97** tablas.
    - `pago_id` se escribe antes que su fila del libro (§3.5): en ese momento el trigger no encuentra la fila y
      la deja pasar, y la FK diferida la comprueba al final. La función escribe las dos con la misma empresa, y el
      test lo afirma.
- **Prisma:**
  - el modelo `CobroIntento` va en `MODELOS_DE_NEGOCIO`, con las relaciones inversas en `Organizacion`,
    `FacturaPlataforma`, `WalletMovimiento` y `Usuario`;
  - los CHECK, el único parcial, la FK diferida y los triggers viven solo en el SQL, como en SLT-60.

### 1.2 `cobro_webhook_evento` (de plataforma)

```
cobro_webhook_evento
  id                 text PK (gen_random_uuid())
  proveedor          text NOT NULL CHECK IN ('rebill')    -- enmienda §12.1: + 'wompi', 'global66'
  log_id             text NOT NULL
  tipo               text NOT NULL            -- el tipo del evento, p. ej. payment.updated (sin interpretar)
  pago_proveedor_id  text NULL                -- el payment_id al que se refiere
  intento_id         text NULL                -- opaco, sin FK: la fila sobrevive al intento
  recibido_at        timestamp(3) NOT NULL
  procesado_at       timestamp(3) NULL
  resultado          text NULL CHECK IN ('aplicado','sin_cambio','sin_intento','requiere_revision')
  UNIQUE (proveedor, log_id)                  -- capa 2 (R12, R13)
```

- **Es de plataforma, sin `organizacion_id`.** El evento llega sin empresa, y uno que no encuentra intento no
  es de ninguna. Va en `MODELOS_DE_PLATAFORMA`.
- **Acceso:**
  - la RLS está encendida y sin políticas;
  - `REVOKE ALL … FROM servi_app` (R26), con el patrón de `historial_plataforma`.
- **Sin cuerpo del evento (R12):** SLT-228 pide que los logs no guarden datos sensibles.
- **El trigger `cobro_webhook_evento_inmutable`:** solo `procesado_at`, `resultado` e `intento_id` pasan de
  `NULL` a un valor, y una sola vez.

### 1.3 `historial_plataforma`: dos valores nuevos

| Enum | Valor nuevo |
|---|---|
| `historial_plataforma_accion` | `cobro_intento_transicion` |
| `historial_plataforma_entidad` | `cobro_intento` |

Cada cambio de estado deja una fila (R25):
- `entidad_id` = el id del intento;
- `entidad_etiqueta` = `'Factura N.º ' || numero || ' · ' || organizacion.nombre`, recortada a 120;
- `pais_id` = `organizacion.pais_id`, que es NOT NULL e inmutable (SL-20);
- `actor_usuario_id` y `actor_nombre` = quien creó el intento, solo en el nacimiento. En los demás cambios son
  `NULL`, es decir, el sistema;
- `valor_anterior` y `valor_nuevo` = los estados (`NULL` al nacer);
- `detalle` = `{organizacion_id, factura_id, monto_local, moneda_cobro, motivo?, pago_proveedor_id?}`.

El comentario de `HistorialPlataforma.detalle` en `schema.prisma` se amplía.

Postgres no deja usar un valor de enum en la misma transacción que lo añade (55P04). Por eso los dos valores van
en su propia migración, antes, como `20261121140000_plan_nivel_job_enum`.

### 1.4 `pago_plataforma_confirmacion`: la confirmación sin persona

| Columna | Cambio | Para qué |
|---|---|---|
| `confirmado_por` | Pasa a admitir `NULL` | El pago en línea nadie lo confirma |
| `en_linea boolean NOT NULL DEFAULT false` | Nueva, como `por_fuera` de SLT-143 | La marca del pago en línea |

- **El CHECK `pago_plataforma_confirmacion_quien`:** `confirmado_por IS NOT NULL OR en_linea`. Así una
  confirmación de SLT-60 o de SLT-143 sigue necesitando persona.
- **Lo que ya existe:** `ADD COLUMN … DEFAULT false` no dispara el trigger `…_inmutable`, y las confirmaciones que
  ya existen quedan con `en_linea = false` (R28).
- **Lectura:** `PagoPlataformaConfirmacionRepository.leer` ya usa `LEFT JOIN usuario` y `confirmado_por` ya es
  nulable en su zod (lo confirma T0.4), así que no cambia.
  - **T0.4 (2026-11-20):** confirmado. `leer` hace `LEFT JOIN "usuario" cu` y un `CASE WHEN cu."id" IS NULL THEN
    NULL`, su zod tiene `confirmado_por: z.string().nullable()`, y `PagosConfirmados.tsx` pinta `?? SIN_DATO`. La
    relación `confirmador` no se usa en TypeScript (`lib/`, `app/`, `components/`, `scripts/`).
- **Prisma:** `confirmadoPor String?`, `confirmador Usuario?` y `enLinea Boolean @default(false)`.

## 2. País

- **Moneda local:** `monedaConfig.currency` (`lib/config/moneda.ts`), la de la app, que hoy es la única. El
  servicio la pasa a la función, así que no hay ninguna moneda escrita en el SQL. Cuando SLT-235 «Moneda e
  impuesto del país en las pantallas de la empresa» la lleve al país, cambia solo el punto donde el servicio la
  lee.
- **Moneda de cobro:** en esta ficha, siempre la local. La foto de la conversión nace vacía, y la rellena SLT-229.
- **País del historial:** el de la empresa.
- **Impuestos, geografía y métodos de pago:** no aplican.
- **Fechas:** UTC. `p_ahora` llega del reloj del servicio, y los `created_at` se escriben con
  `now() AT TIME ZONE 'UTC'`, como en `20261119120100`.

## 3. La base

Hay dos migraciones, con `BEGIN`/`COMMIT` escritos a mano (`db:migrate:create` falla con P3006). Su prefijo va
después de la mayor de `dev`, hoy `20261124120000_sl21_pais_moneda_impuesto`; T0.1 lo vuelve a comprobar.

| Migración | Qué trae |
|---|---|
| `20261124130000_cobro_historial_enum` | Los dos `ALTER TYPE … ADD VALUE IF NOT EXISTS` (§1.3) |
| `20261124130100_cobro_intento` | Todo lo demás |

Todas las funciones nuevas son del dueño:
- `SECURITY DEFINER`, con `search_path = public, pg_temp`;
- `REVOKE EXECUTE … FROM PUBLIC`, sin `GRANT` a `servi_app`;
- reciben la empresa o la resuelven del intento, y escriben `organizacion_id` explícito (molde de SLT-143, T0.2).

Una función interna, `_cobro_historial(p_intento record, p_anterior text, p_actor text)`, escribe la fila de §1.3.
La llaman todas las funciones y los triggers que cambian un estado (R25).

### 3.1 Crear o reutilizar el intento (R1–R5)

> **Enmienda (§12.3):** gana `p_metodo` después de `p_proveedor`, y la clave del paso 4 suma el proveedor y el método.

`cobro_intento_obtener_o_crear(p_org, p_factura, p_proveedor, p_moneda_local, p_por, p_ahora)` devuelve
`(resultado text, intento_id text)`. El resultado es `'creado'`, `'existente'`, `'factura_no_valida'` o
`'sin_saldo'`. Los pasos:

1. Toma el candado `pago_plataforma:<org>`.
2. `SELECT … FROM factura_plataforma WHERE id = p_factura AND organizacion_id = p_org FOR UPDATE`. Si no existe
   o no está `cerrada`: `factura_no_valida` (R5).
3. Lee el saldo de `factura_plataforma_saldos(p_org)`. Si es ≤ 0: `sin_saldo` (R5).
4. Arma la clave: `p_factura || '|' || saldo || '|' || p_moneda_local || '|'` (la tasa vacía).
5. Busca el vivo de la factura:
   - **con la misma clave:** devuelve `existente` (R2);
   - **con otra clave:** lo pasa a `anulado` con `motivo_anulacion = 'clave_distinta'`, escribe su historial y
     sigue (R3).
6. `INSERT` en estado `creado` y escribe su historial (actor = `p_por`). Devuelve `creado`.

**Concurrencia (R4):** el candado y el `FOR UPDATE` serializan dos pedidos de la misma factura, y el segundo ve el
vivo del primero. El único parcial es la red: si alguien inserta como dueño sin pasar por aquí, la base da 23505.

### 3.2 El proveedor creó el cobro (R10)

`cobro_intento_registrar_enlace(p_org, p_intento, p_id_externo, p_ahora)` devuelve `'ok'`, `'ya_pendiente'` (la
misma `id_externo`) o `'no_vivo'`.
- Lo que hace: candado, `FOR UPDATE` del intento, `creado → pendiente` con `id_externo`, y el historial.
- Con otro `id_externo` ya guardado, el trigger da `SL226 columna_fija`.

### 3.3 Avanzar al estado del proveedor (R14, R15, R23, R24)

`cobro_intento_avanzar(p_proveedor, p_id_externo, p_destino, p_ahora)` devuelve `'ok'`, `'sin_cambio'`,
`'no_alcanzable'` o `'sin_intento'`. `p_destino` puede ser `pendiente`, `rechazado`, `expirado`, `devuelto` o
`contracargo`; **`aprobado` no**, porque solo se llega por §3.5, que registra el pago (R9).
1. Encuentra el intento por `(proveedor, id_externo)`. Si no hay ninguno: `sin_intento`.
2. Toma el candado de su empresa y el `FOR UPDATE` del intento.
3. Calcula el camino con la tabla de R7:
   - si el destino ya se alcanzó o queda detrás: `sin_cambio` (R15);
   - si no se puede alcanzar (por ejemplo, `rechazado` → `devuelto`): `no_alcanzable` (R15);
   - si no, aplica cada paso. De `creado` a `rechazado`, por ejemplo, pasa por `pendiente`, y escribe una fila de
     historial por paso (R25).
4. `devuelto` y `contracargo` no tocan el libro (R23).

### 3.4 Anular los vivos cuando cambia el saldo (R11)

La función de trigger `cobro_intento_anular_por_saldo()`, `SECURITY DEFINER`, va en dos triggers `AFTER INSERT`:

| Trigger | Tabla | Facturas afectadas |
|---|---|---|
| `cobro_intento_saldo_aplicacion` | `pago_plataforma_aplicacion` | `NEW.factura_id` |
| `cobro_intento_saldo_anulacion` | `pago_plataforma_anulacion` | Las facturas de las aplicaciones de `NEW.confirmacion_id` |

Para cada factura, pasa su intento vivo (si lo hay) a `anulado` con `motivo_anulacion = 'saldo_cambiado'`, y
escribe el historial con actor `NULL`.
- **Cubre los tres caminos de R11 sin tocar sus funciones:** la confirmación de SLT-60, el registro por fuera y
  la anulación de SLT-143. Las tres escriben esas filas.
- **El propio pago en línea no anula su intento:** §3.5 pasa el intento a `aprobado` **antes** de escribir la
  aplicación, así que ya no está vivo cuando el trigger corre.

### 3.5 Registrar el pago aprobado (R17–R22)

`cobro_registrar_pago_aprobado(p_proveedor, p_pago_proveedor_id, p_id_externo, p_monto numeric, p_moneda text, p_ahora)`
devuelve `'ok'`, `'ya_registrado'`, `'sin_intento'` o `'requiere_revision'`. Todo ocurre en una sola sentencia.

> **Enmienda (§12.4):** antes del paso 1 busca el pago por `(proveedor, pago_proveedor_id)` y, si ya está, devuelve
> `ya_registrado` (R37: el intento marcado a mano puede no tener `id_externo`). Los pasos 5–7 pasan a la función
> interna `_cobro_aprobar`, que comparte con la marca a mano (§12.4).

1. Encuentra el intento por `(proveedor, id_externo)`. Si no hay ninguno: `sin_intento`.
2. Toma el candado `pago_plataforma:<org>` y luego `SELECT … FROM factura_plataforma … FOR UPDATE` (capa 3). El
   orden es siempre el mismo: primero el candado de la empresa y después la fila, para no cruzarse con SLT-60.
3. Si ya hay un intento con `(proveedor, pago_proveedor_id)`: `ya_registrado` (R20).
4. `FOR UPDATE` del intento. Devuelve `requiere_revision` (R21, decisión P2) en tres casos:
   - el intento no está vivo;
   - `p_monto <> monto_cobrado` o `p_moneda <> moneda_cobro`;
   - el saldo de la factura es menor que `monto_local`.
5. Genera el id del movimiento. Si el intento está en `creado`, lo pasa primero a `pendiente`. Después lo pasa a
   `aprobado`, con `pago_proveedor_id`, `pago_id` y `aprobado_at`, y escribe el historial de cada paso (R14, R25).
   La FK de `pago_id` es diferida (§1.1).
6. `INSERT` en `wallet_movimiento`, el molde de SLT-143 §5:
   - `egreso`, `egreso_pago_plataforma`, `monto = monto_local`, `origen_tipo = 'gasto'` y `origen_id = NULL`;
   - `descripcion = 'Pagado en línea · ' || p_pago_proveedor_id` (la marca y el id, R17);
   - `registrado_por = NULL`, porque es automático;
   - `clave_idempotencia = 'cobro:' || p_proveedor || ':' || p_pago_proveedor_id`, una red más por empresa;
   - `fecha_movimiento = p_ahora`.

   El tope corre aquí y deja pasar este pago (§3.7). No mira la caja: puede quedar negativa (R18).

   **T0.2 (2026-11-20):** las columnas que escribe `pago_plataforma_registrar_por_fuera` son `id`,
   `organizacion_id`, `tipo`, `categoria`, `monto`, `origen_tipo`, `origen_id`, `descripcion`, `registrado_por`,
   `fecha_movimiento`, `created_at` (con `now() AT TIME ZONE 'UTC'`) y `clave_idempotencia`. Son todas las de
   `wallet_movimiento`; §3.5 escribe las mismas.
7. `PERFORM _pago_plataforma_aplicar(org, pago, monto_local, [{factura_id, monto_local}], NULL, p_ahora, false, true)`.
   Escribe la confirmación `en_linea` sin persona y la aplicación entera. El saldo y la deuda bajan solos (R17).
   No es «por confirmar», porque tiene confirmación (R19).
8. Devuelve `ok`.

**Concurrencia (R20):** el webhook y la conciliación pueden traer el mismo pago a la vez. El candado los
serializa, y el segundo ve en el paso 3 el `pago_proveedor_id` del primero. Si alguien se saltara el paso 3, lo
pararía el único `(proveedor, pago_proveedor_id)` con 23505, que revierte todo.

### 3.6 `_pago_plataforma_aplicar` con `en_linea`

- **La nueva sobrecarga:** `CREATE FUNCTION _pago_plataforma_aplicar(…, p_por_fuera boolean, p_en_linea boolean)`.
  Su cuerpo es el de `20261121130000` §4 **literal**, salvo una cosa: el `INSERT` de la confirmación escribe
  `en_linea`.
- **La de 7 argumentos:** queda como `PERFORM` de la nueva con `p_en_linea = false`. Así
  `pago_plataforma_confirmar` y `pago_plataforma_registrar_por_fuera` no cambian.
- **Vigilancia:** los tests de SLT-60 y SLT-143 tienen que seguir en verde sin tocarse (R28).

### 3.7 El tope deja pasar el pago en línea (R22, decisión P1)

`CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma()`: el cuerpo de `20261116120000` §8, con una
salida más, después del candado:

```sql
IF EXISTS (SELECT 1 FROM "cobro_intento" i
            WHERE i."organizacion_id" = NEW."organizacion_id" AND i."pago_id" = NEW."id"
              AND i."estado" = 'aprobado') THEN
  RETURN NEW;
END IF;
```

- **Nadie más puede usar la salida:** `servi_app` no escribe en `cobro_intento` (el `REVOKE`), así que la empresa
  no puede fabricarla. Es el molde de la fila de `pago_plataforma_anulacion` de SLT-143.
### 3.8 Los eventos (R12, R13, R16)

- **`cobro_evento_registrar(p_proveedor, p_log_id, p_tipo, p_pago_proveedor_id, p_ahora)`** devuelve `'nuevo'`,
  `'repetido'` (ya procesado) o `'pendiente'` (llegó y no terminó).
  - Hace `INSERT … ON CONFLICT (proveedor, log_id) DO NOTHING` y después lee `procesado_at`.
  - Dos llegadas a la vez del mismo evento pueden acabar procesándose las dos. No pasa nada: §3.3 y §3.5 son
    idempotentes.
- **`cobro_evento_cerrar(p_proveedor, p_log_id, p_resultado, p_intento, p_ahora)`** fija `procesado_at`,
  `resultado` e `intento_id`, una sola vez.

### 3.9 Errores

`SL226` lleva un JSON con `codigo`: `transicion_invalida` o `columna_fija`. El repositorio los traduce
a un error del dominio (`CobroIntentoInvalido`). Solo salen si alguien salta las funciones, así que la app no los
muestra.

**Notas de implementación (T2, 2026-11-20).** Lo que el código fija y este diseño no decía:
- `_cobro_intento_pasar(p_id, p_estado, p_motivo, p_ahora)`, interna como `_cobro_historial`: cambia el estado de
  un intento ya bloqueado y escribe su fila de historial con actor `NULL`. La usan §3.1, §3.2, §3.3, §3.4 y §3.5.
  `_cobro_historial` recibe la fila de `cobro_intento` (no un `record`) y lanza si no escribe la fila.
- `cobro_evento_cerrar` devuelve `'ok'`, `'ya_cerrado'` o `'sin_evento'`, y un CHECK
  `cobro_webhook_evento_cierre` exige `procesado_at` y `resultado` juntos.
- `cobro_intento_avanzar` con un destino fuera de los cinco admitidos lanza `22023` (`invalid_parameter_value`):
  es un error de programación, no un resultado.
- El trigger `cobro_intento_solo_avanza` también trata `motivo_anulacion` y `aprobado_at` como «de vacío a un
  valor, una vez», y en el INSERT exige vacíos el motivo, los ids externos, el pago y `aprobado_at`.
- **Un intento `creado` con `id_externo`** solo existe si alguien lo pone sin pasar por §3.2, que lo guarda y pasa
  a `pendiente` a la vez. §3.3 y §3.5 lo encuentran por `(proveedor, id_externo)`, así que el caso «`creado` y
  aprobado» de R14 solo se alcanza así; el test lo prepara a mano como dueño, y SLT-230 decide si su flujo lo
  produce.

### 3.10 `down.sql`

**`20261124130100_cobro_intento/down.sql`** va en este orden:
1. Aborta si `cobro_intento` tiene filas, con el molde de SLT-143 §3.7 (R28).
2. Repone **literal** el cuerpo de `20261116120000` §8 en `wallet_movimiento_tope_pago_plataforma` y el de
   `20261121130000` §4 en `_pago_plataforma_aplicar` de 7 argumentos. Después hace `DROP` de la sobrecarga de 8.
3. `DROP` de las funciones y los triggers nuevos, de `cobro_webhook_evento` y de `cobro_intento`.
4. `ALTER TABLE pago_plataforma_confirmacion`:
   - `DROP CONSTRAINT` del CHECK;
   - `DROP COLUMN en_linea`;
   - `ALTER COLUMN confirmado_por SET NOT NULL`. Sin intentos no puede haber confirmaciones sin persona.

**`20261124130000_cobro_historial_enum/down.sql`** va **después** del anterior:
1. `DELETE FROM historial_plataforma` de las filas con los valores nuevos (solo pueden existir si hubo intentos);
2. `pg_temp.quitar_valores_de_enum_slt226`, copiada de SLT-215, sobre los dos tipos.

## 4. Backend

### 4.1 Tipos (`lib/types/cobro.ts`)

> **Enmienda (§12.6):** `PROVEEDORES_COBRO` pasa a los tres proveedores, nace `METODOS_COBRO`, el DTO gana
> `metodo` y nace `MarcarPagadoManualResult`. El bloque de abajo es el de la primera versión.

```ts
export const ESTADOS_COBRO = ["creado","pendiente","aprobado","rechazado","expirado","anulado","devuelto","contracargo"] as const;
export type EstadoCobro = (typeof ESTADOS_COBRO)[number];
export type ProveedorCobroId = "rebill";
export interface CobroIntentoDTO {
  id: string; facturaId: string; proveedor: ProveedorCobroId; estado: EstadoCobro;
  montoLocal: string; monedaLocal: string; montoCobrado: string; monedaCobro: string;
  tasa: string | null; tasaFuente: string | null; tasaAt: Date | null;
  idExterno: string | null; pagoProveedorId: string | null;
  createdAt: Date; estadoAt: Date; aprobadoAt: Date | null;
}
export const eventoProveedorSchema = z.object({
  proveedor: z.literal("rebill"), logId: z.string().min(1), tipo: z.string().min(1),
  pagoProveedorId: z.string().min(1),
});
export type ObtenerIntentoResult =
  | { estado: "ok"; intento: CobroIntentoDTO; nuevo: boolean }
  | { estado: "factura_no_valida" } | { estado: "sin_saldo" };
export type ProcesarEventoResult =
  | { estado: "ignorado" }                                   // R13
  | { estado: "procesado"; resultado: "aplicado" | "sin_cambio" | "sin_intento" | "requiere_revision" };
export type IntentosDeFacturaResult = { estado: "ok"; intentos: CobroIntentoDTO[] } | { estado: "forbidden" };
```

### 4.2 El puerto del proveedor (`lib/interfaces/external/IProveedorCobro.ts`)

```ts
export type EstadoPagoProveedor = "pendiente" | "aprobado" | "rechazado" | "expirado" | "devuelto" | "contracargo";
export interface PagoDelProveedor {
  pagoProveedorId: string; idExterno: string; estado: EstadoPagoProveedor; monto: string; moneda: string;
}
export interface IProveedorCobro {
  readonly proveedor: ProveedorCobroId;
  /** El estado REAL del pago (R14). `null` si el proveedor no lo conoce. Lanza si la consulta falla (R16). */
  consultarPago(pagoProveedorId: string): Promise<PagoDelProveedor | null>;
}
```

- Es la interfaz mínima. SLT-227 añade `crearEnlace`, `verificarFirma` y `devolver`, y escribe el adaptador de
  Rebill.
- Aquí no hay adaptador: los tests usan un doble en memoria.

### 4.3 Repositorio (`CobroIntentoRepository` e `ICobroIntentoRepository`)

Cada método llama a una función de §3 en `comoPlataforma("SL-45", …)`. `FichaJira` no admite `SLT` (deuda D29),
como en SLT-60. La entrada nueva de `EXCEPCIONES_DE_PLATAFORMA` lleva el motivo «SLT-226: el cobro en línea; llama
a las funciones del dueño de 20261124130100, que `servi_app` no puede ejecutar».

| Método | Función |
|---|---|
| `obtenerOCrear(input)` | §3.1, y después la lectura del intento |
| `registrarEnlace(input)` | §3.2 |
| `avanzar(input)` | §3.3 |
| `registrarPagoAprobado(input)` | §3.5 |
| `registrarEvento(input)` / `cerrarEvento(input)` | §3.8 |
| `intentosDeFactura(org, facturaId)` | `prisma.cobroIntento.findMany`, por `createdAt desc, id`. Con un `maestro` o un `admin` corre en `conEmpresa(org)` y la RLS filtra; con el superadmin, en `comoPlataforma` |

Traduce `SL226` a `CobroIntentoInvalido`. No traduce la `check_violation` del tope, que no puede salir por §3.7.

### 4.4 Servicio (`CobroIntentoService` e `ICobroIntentoService`)

Recibe por constructor el repositorio, un `Map<ProveedorCobroId, IProveedorCobro>`, el reloj y la moneda local
(`monedaConfig.currency` en el composition root).

| Método | Orden |
|---|---|
| `obtenerOCrearIntento({ organizacionId, facturaId, actorUsuarioId })` | Llama a `repo.obtenerOCrear` con la moneda local y `ahora`, y traduce. **No autoriza:** la empresa y el actor los resuelve quien llama (SLT-230 y SLT-231), y la función los valida contra la base (R5) |
| `registrarEnlace({ organizacionId, intentoId, idExterno })` | Llama a `repo.registrarEnlace` |
| `procesarEvento(evento)` | Ver abajo |
| `intentosDeFactura(actor, facturaId)` | Ver abajo |

**`procesarEvento(evento)`** (R12–R24):
1. Valida el evento con zod.
2. Llama a `registrarEvento`. Si responde `repetido`, devuelve `ignorado` (R13).
3. Llama a `proveedor.consultarPago(pagoProveedorId)`:
   - **si lanza,** propaga el error con contexto (operación y `logId`, sin datos del pago). El evento queda
     pendiente (R16), y SLT-228 decide el reintento;
   - **si devuelve `null`,** cierra con `sin_intento`.
4. Según el estado que dio el proveedor, **no el del evento** (R14):
   - `aprobado` → `registrarPagoAprobado`. `ok` y `ya_registrado` cuentan como `aplicado` (R20);
   - los demás → `avanzar`.
5. Cierra el evento con el resultado y el intento.

**`intentosDeFactura(actor, facturaId)`** (R27):
- con un rol de `esAccesoTotal` (`maestro` o `admin`), lee con la empresa de la sesión;
- con uno de `esPlataforma`, lee la factura de cualquier empresa;
- con cualquier otro, devuelve `forbidden` sin llamar al repositorio.

No hay actions ni rutas: el borde lo ponen SLT-228, SLT-230 y SLT-231.

## 5. La marca en el libro

El pago en línea queda en el libro como un «Pago a la plataforma» con `descripcion = «Pagado en línea · <id del
pago>»`.
- **Dónde se ve:** la tabla, el detalle y la descarga ya pintan la `descripcion` en «Detalle», como la
  referencia del pago por fuera de SLT-143. Así la marca y el id salen en los tres sin tocar la wallet (R17).
- **«Registró» (R29, decisión del humano del 2026-11-20):** muestra «Pagado en línea», sin el prefijo
  «Automático · », como la marca de la plataforma de SLT-143. Antes de la decisión, con `registrado_por` nulo,
  decía lo de un movimiento automático (T0.4, abajo).
  - **T0.4 (2026-11-20):** `LibroCajaAutoriaService.registro` mira primero la marca `por_fuera` (no aplica) y,
    con `registrado_por` nulo, decide por `origen_tipo`. Para `gasto` devuelve la acción `plantilla_gasto_fijo`,
    así que «Registró» diría «Automático · Plantilla de gasto fijo». Es engañoso, y el humano pidió corregirlo
    en este PR (§5.1).

### 5.1 «Pagado en línea» en «Registró» (R29)

Es el camino de la marca `por_fuera` de SLT-143, con una marca más:
- **`ILibroCajaAutoriaRepository.MarcasDeLaPlataforma`** gana `enLinea: Set<string>`.
  `LibroCajaAutoriaRepository.marcasDeLaPlataforma` añade `{ enLinea: true }` a su `OR` y lee `enLinea` en la
  misma consulta (los ids de los pagos con la confirmación `en_linea`). Sigue sin leer quién confirmó.
- **`LibroCajaAutoriaService.registro`:** antes de mirar `registradoPor` y `origen_tipo`, un
  `egreso_pago_plataforma` con la marca `enLinea` devuelve `{ nombre: null, automatico: { accion:
  "pago_en_linea", por: null } }`.
- **`RegistroDTO.automatico.accion`** (`lib/types/estado-cuenta.ts`) gana `"pago_en_linea"`.
- **El texto** (`components/shared/wallet/detalle-movimiento-panel-labels.ts`): `ACCION_AUTOMATICA_LABEL` gana
  `pago_en_linea: "Pagado en línea"`, y `textoRegistro` lo pinta sin el prefijo, como `plataforma`. La tabla, el
  detalle y la descarga usan `textoRegistro`, así que salen los tres. Es el único archivo de `components/` del PR:
  una línea de texto en un `Record` total que el typecheck exige.
- **La anulación** de un pago en línea por «Anular…» (§11) sigue mostrando «Anulado por la plataforma» en su
  contra-asiento: no cambia.

## 6. Autorización

| Operación | Quién | Dónde se decide | R |
|---|---|---|---|
| Leer intentos de su empresa | `maestro`, `admin` | `intentosDeFactura` (`esAccesoTotal`) y la RLS | R26, R27 |
| Leer intentos de cualquier empresa | superadmin | `intentosDeFactura` (`esPlataforma`) | R27 |
| Crear un intento y registrar el enlace | Quien llame desde SLT-230 o SLT-231, que pone la regla de rol de su pantalla | Esa ficha. Aquí, la función valida la empresa y la factura | R5 |
| Procesar eventos y registrar pagos | El job del webhook (SLT-228) o la conciliación (SLT-233), sin sesión | Las funciones del dueño. `servi_app` no las ejecuta | R26 |
| Escribir intentos o eventos | Solo las funciones del dueño | `REVOKE` a `servi_app` | R26 |
| Marcar pagado a mano (enmienda, §12.4) | Solo el superadmin | `marcarPagadoManual` (`esPlataforma`, antes de leer nada); la función del dueño no la ejecuta `servi_app` | R39 |

**Módulo:** ninguno. El cobro de la plataforma es núcleo, como el pago a la plataforma.

## 7. Integraciones

Ninguna llamada real. El puerto `IProveedorCobro` (§4.2) es el único contacto, y en los tests es un doble.

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/cobro-intento.test.ts` (**nuevo**) | R1–R11, R25, R26 | Base real, empresas A y B, facturas con `cerrarFacturaEnCurso` (`_fixtures/factura-cerrada.ts`). Tabla de abajo |
| `tests/integration/db/cobro-pago-en-linea.test.ts` (**nuevo**) | R14 (cadena), R17–R24, R28 (SLT-60 y SLT-143 intactos) | Base real. Tabla de abajo. La concurrencia, con dos conexiones y `Promise.all` |
| `tests/integration/db/cobro-webhook-evento.test.ts` (**nuevo**) | R12, R13, R26 (eventos) | Base real: único, `repetido` y `pendiente`, inmutable; como `servi_app`, `42501` al leer y al escribir |
| `tests/integration/db/migracion-slt226-ida-y-vuelta.test.ts` (**nuevo**) | R28 | Con una confirmación previa: después de la migración sigue igual y `en_linea = false`. El `down` aborta con un intento; sin él, revierte las dos migraciones, y `pg_get_functiondef` del tope y de `_pago_plataforma_aplicar` vuelve a ser el de antes |
| `tests/unit/services/cobro-intento-service.test.ts` (**nuevo**) | R13–R16, R20 (traducción), R27 | Repositorio y proveedor dobles. Tabla de abajo |
| `tests/integration/db/pago-plataforma-confirmacion.test.ts`, `pago-plataforma-por-fuera.test.ts`, `migracion-slt143-ida-y-vuelta.test.ts` | R28 | Sin cambios de afirmaciones: tienen que seguir en verde. Si `migracion-slt143` aplica el `down` de SLT-143 sobre esta, primero aplica el de esta (T0.5) |
| `tests/unit/guards/rls-por-empresa.guardia.test.ts`, `_unicos-sin-empresa.ts`, `scripts/verificar-rls-despliegue.ts` | R26 | 97 tablas, los dos globales y 186 triggers |
| `tests/unit/services/libro-caja-autoria-plataforma.test.ts` (**se amplía**) | R29 | Repositorio doble con la marca `enLinea`: el pago dice `pago_en_linea` con `por: null`; un `egreso_pago_plataforma` sin la marca y con `origen_tipo = 'gasto'` sigue en `plantilla_gasto_fijo`; la marca `por_fuera` sigue en `plataforma` |
| `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts` (**se amplía**) | R29 | `textoRegistro` de `pago_en_linea` es «Pagado en línea», sin «Automático · » |
| `tests/integration/db/cobro-pago-en-linea.test.ts` (paso de R17) | R29 | `LibroCajaAutoriaRepository.marcasDeLaPlataforma` devuelve el pago aprobado en `enLinea` (la columna real, con la RLS de la empresa) |

**`cobro-intento.test.ts`, paso a paso** (montos en colones):

| Paso | Resultado esperado |
|---|---|
| Factura de A cerrada por 30 000 con 10 000 confirmados; se pide un intento | `creado`, `monto_local = monto_cobrado = 20 000`, `moneda_cobro = moneda_local`, la tasa nula y 1 fila de historial con `valor_nuevo = creado` y el país de A (R1, R25) |
| Se pide otra vez | `existente`, con el mismo id y 1 solo intento vivo (R2) |
| Dos pedidos a la vez sobre otra factura | Los dos devuelven el mismo id, y queda 1 fila (R4) |
| Un `INSERT` del dueño de un segundo vivo para la misma factura | 23505 (R4) |
| Factura en curso, de B, inexistente o con saldo 0 | `factura_no_valida` o `sin_saldo`, y 0 filas (R5) |
| `INSERT` del dueño con monto 0, con la tasa sin fuente, o con tasa en moneda local | `check_violation` (R6) |
| `UPDATE` del dueño de `creado` a `aprobado`, de `rechazado` a `pendiente` o de `monto_local` | `SL226` (R7, R8) |
| `UPDATE` del dueño de `pendiente` a `aprobado` con `pago_id` nulo | `check_violation` (R9) |
| `DELETE` como `servi_app` (permiso denegado), y `UPDATE`/`INSERT` como `servi_app` | `42501` (R8, R26) |
| `registrarEnlace` y después otra vez con otro id externo; el mismo id externo en un intento de B | `ok`, luego `SL226`; 23505 (R10) |
| Intento vivo de 20 000; el superadmin confirma 5 000 a esa factura (`pago_plataforma_confirmar`) | El intento queda `anulado/saldo_cambiado` y su historial con actor nulo. El siguiente pedido da 15 000 (R11) |
| Lo mismo con un registro por fuera y con la anulación de un confirmado (SLT-143) | `anulado` en los dos (R11) |
| Un vivo con otra clave (se fuerza a mano) y luego un pedido | El viejo queda `anulado/clave_distinta` y nace uno nuevo, en la misma transacción (R3) |
| B lee `cobro_intento` como `servi_app` | Solo lo suyo (R26) |
| Una transacción que cambia un estado y luego falla | Ni el cambio ni la fila de historial quedan (R25) |

**`cobro-pago-en-linea.test.ts`, paso a paso:**

| Paso | Caja A | Deuda A | Resultado esperado |
|---|---|---|---|
| Caja de 50 000 (aporte); factura de 30 000; intento `pendiente` | 50 000 | 30 000 | — |
| `cobro_registrar_pago_aprobado` con 30 000 CRC | 20 000 | 0 | `ok`. El intento queda `aprobado` con su `pago_proveedor_id`. 1 movimiento con «Pagado en línea · <id>», 1 confirmación `en_linea` con `confirmado_por` nulo, 1 aplicación de 30 000, saldo 0 y 1 fila de historial (R17) |
| `pago_plataforma_por_confirmar(A)` y lo disponible | — | — | No trae el pago, y lo disponible no lo resta (R19) |
| El mismo pago otra vez, y dos a la vez sobre otra factura | — | — | `ya_registrado`, sin filas nuevas; a la vez, exactamente 1 movimiento, 1 confirmación y 1 aplicación (R20) |
| Caja de C en 0; pago en línea de 10 000 | −10 000 | — | `ok` (R18) |
| Un pago por confirmar de la wallet de 10 000 y la factura de 30 000 aprobada en línea | — | — | `ok`: lo deja pasar el tope (R22). Un egreso de la wallet de 1 por encima de lo disponible sigue rechazado (R22) |
| Intento `anulado`; monto 29 999; moneda USD | — | — | `requiere_revision`, sin filas en el libro y el intento igual (R21) |
| Intento `creado` y aprobado | — | — | `aprobado`, con 2 filas de historial: `creado→pendiente` y `pendiente→aprobado` (R14, R25) |
| `avanzar` a `devuelto` sobre el aprobado | 20 000 | 0 | `devuelto`, con la caja y la deuda iguales (R23) |
| `avanzar` a `rechazado` sobre un vivo; a `pendiente` sobre un aprobado; a `devuelto` sobre un rechazado | — | — | `rechazado`, sin libro (R24); `sin_cambio`; `no_alcanzable` (R15) |
| Confirmación y registro por fuera de SLT-60 y SLT-143 después de la migración | — | — | Se comportan igual: lo vigilan sus suites (R28) |

**`cobro-intento-service.test.ts`:**
- **`procesarEvento`:**
  - con `repetido`, ni consulta ni escribe (R13);
  - con `pendiente`, procesa (R13);
  - el evento dice «pendiente» y el proveedor «aprobado»: llama a `registrarPagoAprobado` (R14);
  - el proveedor lanza: no llama a `cerrarEvento` y propaga con el `logId` en el mensaje (R16);
  - `ya_registrado` cierra como `aplicado` (R20);
  - `null` del proveedor cierra como `sin_intento`.
- **`intentosDeFactura`:**
  - `maestro`, `admin` y superadmin leen;
  - `mensajero` y `tienda` reciben `forbidden` sin llamadas (R27).

**Control de no vacuidad:** antes de afirmar, la factura está cerrada y las funciones nuevas existen en `pg_proc`.
Un `skip` por falta de base no cuenta como verde.

**Mutaciones que deben matar los tests**, una a la vez:
1. el único parcial sin `WHERE` o sin él (R2, R4);
2. el trigger `cobro_intento_solo_avanza` que deja pasar todo (R7);
3. `cobro_registrar_pago_aprobado` sin el paso 3 y sin el candado (R20, en concurrencia);
4. §3.5 con la aplicación antes de `aprobado` (el trigger de §3.4 anula el propio intento);
5. el tope sin la salida de §3.7 (R22);
6. el trigger de §3.4 quitado (R11).

## 9. Alternativas descartadas

1. **Una tabla propia de transiciones** (`cobro_intento_transicion`, de negocio) en vez del historial de
   plataforma. Ahorraría la migración del enum. SLT-97 y SL-42 la eligieron porque sus entidades no tienen país,
   pero aquí la empresa sí lo tiene, y el Alcance fija «el historial de plataforma registra cada transición».
2. **Registrar el pago con Prisma en TypeScript**, con `$transaction` y `SELECT … FOR UPDATE` a mano. `servi_app`
   no puede escribir confirmaciones (SLT-60 R25), y el dueño en TS repartiría la regla entre dos capas. Una
   función del dueño de una sola sentencia es el molde de SLT-60 y SLT-143.
3. **Anular el intento vivo solo al pedir el siguiente.** Entre un cambio de saldo y el siguiente pedido, el vivo
   viejo podría cobrarse por el monto viejo. Los triggers de §3.4 lo anulan en la misma transacción que cambia el
   saldo. §3.1 sigue comparando la clave como red.
4. **Saltar el tope con una variable de sesión** (`set_config('app.cobro_en_linea', …)`). Cualquier rol puede
   fijarla, `servi_app` incluido: es la alternativa 2 que descartó SLT-143. La fila de `cobro_intento` aprobada
   solo la escribe el dueño.
5. **El estado como enum de Postgres.** Pediría otra migración solo para el enum y la función de reversión en el
   `down`. `text` con CHECK es el molde de `factura_plataforma.estado`.
6. ~~**La marca «Pagado en línea» en «Registró»** fuera de esta ficha.~~ **Ya no está descartada:** el humano
   pidió el 2026-11-20 que se haga en este PR (R29, §5.1).
7. **Que el único `(proveedor, payment_id)` fuera por empresa.** Pasaría la guardia sin tocar la lista de
   globales, pero un id del proveedor lleva a un solo pago en toda la plataforma. Un único global además frena un
   error de enrutado que asignara el mismo pago a dos empresas.

## 10. Tamaño

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 20 | ~1 350–1 550: SQL ~900 (las dos migraciones y sus `down`), `schema.prisma` ~90, TypeScript ~550 (R29 suma ~40), docs ~10 |
| Tests | 14 | ~1 700: R29 suma ~60 en dos tests que se amplían; el censo de `api-key-dependencias-usuario` suma una entrada |
| **Total** | **34** de 40 (85 %) | |

- **Archivos:** caben.
- **Líneas de producción:** pasan del tope de 1 000. El humano aceptó un solo PR (decisión P5 del 2026-11-20).
- **Líneas de tests:** caben.

## 11. Riesgos

- **El pago en línea en «Pagos confirmados» de SLT-143.** Aparece con «Registrado por» vacío, y el superadmin
  podría anularlo con «Anular…». La anulación funciona (contra-asiento, el saldo vuelve), pero el intento sigue
  `aprobado`. Es terreno de las devoluciones de SLT-233, y se anota para su spec.
- **El orden del `down`:** el de la migración del enum va después del de la principal. Lo comprueba
  `migracion-slt226-ida-y-vuelta`.
- **Las limpiezas y el `creado_por`:** sin trigger de borrado (T0.3), una limpieza que borre los usuarios de una
  empresa antes que sus intentos choca con la FK `RESTRICT` de `creado_por`. Las limpiezas que lo necesiten borran
  primero `cobro_intento`.
- **La FK diferida y Prisma:** Prisma no expresa `DEFERRABLE`, y T0.6 comprueba que `prisma migrate diff` no la
  marque como deriva. Si la marca, se cambia el orden de §3.5: el pago primero, y el tope busca el intento por
  `pago_proveedor_id` y `clave_idempotencia`.
- **`migracion-slt143-ida-y-vuelta`:** puede chocar con la sobrecarga de `_pago_plataforma_aplicar` (T0.5).
- **T0.1 (2026-11-20):** la mayor de `origin/dev` es `20261123120100_zona_activa`; los prefijos de §3 valen.
- **Renombre al sincronizar con `dev` (2026-11-20):** SL-21 entró en `dev` con
  `20261124120000_sl21_pais_moneda_impuesto`, el mismo prefijo que la del enum. Las dos de esta ficha pasan a
  `20261124130000_cobro_historial_enum` y `20261124130100_cobro_intento`; el contenido no cambia. Sin `125` en el nombre: `backfill-guards` (SLT-125)
  rechaza toda carpeta de migración que lo contenga, y `20261125…` lo contenía.
- **T0.5 (2026-11-20):** no choca. El test crea su propia base y aplica con `aplicarMigracionesHasta(db, M)`, que
  para ANTES de SLT-143: nunca ve las migraciones de esta ficha. T7.5 no hace falta.
- **T0.6 (2026-11-20):** sin deriva. Con una FK existente pasada a `DEFERRABLE INITIALLY DEFERRED` a mano,
  `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma` da «empty migration»: Prisma no
  compara la diferibilidad. §3.5 se queda con su orden.

## 12. Enmienda del 2026-11-20: proveedores, método y marcar pagado a mano (R30–R39)

El humano cambió el alcance con la ficha ya implementada (PR #263, CI en verde). La migración
`20261124130100_cobro_intento` todavía no está en `dev`, así que **la enmienda la edita directamente**: no hay
migración nueva. Las bases ya migradas (la de la feature y las desechables) se rehacen con su `down` y su ida.

### 12.0 Lo que ya existe

- **El board:** SLT-227 «Cobro automático: interfaz de proveedores y adaptador de Rebill», SLT-251 «Cobro
  automático: medios y proveedor por país», SLT-252 «Cobro automático: adaptador de Wompi» y SLT-253 «Cobro
  automático: transferencia y enlace con Global66» se llevan los adaptadores y la configuración por país; SLT-232
  «Cobro automático: medios de pago guardados y cobro recurrente», lo que se guarda de la tarjeta; SLT-234 «Cobro
  automático: panel del superadmin para cobros y proveedor», la pantalla de la marca a mano. Ninguna trae la función
  de dominio de la marca ni el método en el intento.
- **El código:** la capa 3 ya existe (§3.5): el único `(proveedor, pago_proveedor_id)`, el candado de la empresa y
  el `FOR UPDATE` de la factura. La marca a mano **la reutiliza** con una función interna común, no la copia. El
  puerto `IProveedorCobro` y el `Map` de proveedores del servicio ya van por proveedor, no cambian.

### 12.1 El modelo

| Dónde | Cambio | R |
|---|---|---|
| `cobro_intento_proveedor` y `cobro_webhook_evento_proveedor` | `CHECK ("proveedor" IN ('rebill', 'wompi', 'global66'))` | R30 |
| `cobro_intento.metodo` | Columna nueva `TEXT NOT NULL`, con `CONSTRAINT "cobro_intento_metodo" CHECK ("metodo" IN ('tarjeta', 'recurrente', 'transferencia'))`. Sin `DEFAULT`: siempre la escribe la función | R31 |
| `cobro_intento_solo_avanza` | `metodo` se suma a las columnas fijas de R8 (`columna_fija`) | R33 |
| `_cobro_historial` | El `detalle` suma `proveedor` y `metodo`. Gana un cuarto parámetro `p_manual boolean DEFAULT false`: con `true` el `detalle` lleva `"manual": true` | R31, R36 |
| `db/schema.prisma` | `metodo String` en `CobroIntento` | R31 |

- **El estado y el método van en `text` con CHECK** y no en enum, por la alternativa 5 de §9.
- **Sin matriz proveedor × método en la base.** La base acepta cualquier par de los dos conjuntos. Qué pares usa
  cada país es de SLT-251, y qué pares soporta cada proveedor lo saben sus adaptadores (SLT-227, SLT-252, SLT-253).
  Un CHECK aquí habría que cambiarlo con cada adaptador.
- **R34, nada más de la tarjeta.** Las columnas de `cobro_intento` siguen siendo las de §1.1 más `metodo`. Ninguna
  guarda número, CVV, vencimiento, marca, últimos 4, titular ni ids de cliente o de tarjeta. El único dato del
  medio es `pago_proveedor_id`. `cobro_webhook_evento` ya no guarda el cuerpo (R12). Un test afirma la lista exacta
  de columnas, así que una columna nueva del medio de pago lo pone en rojo.
- **El índice `cobro_intento_un_vivo_por_factura` no cambia:** sigue siendo un vivo por factura, sin el método
  ni el proveedor (R4, R32).

### 12.2 ¿El método va en la clave? Sí, y el proveedor también

**Decisión técnica (no del humano):** la clave pasa a ser
`factura | monto_local | moneda_cobro | tasa | proveedor | metodo`. Pedir un intento con otro método o con otro
proveedor que el vivo anula el vivo con `clave_distinta` y crea uno nuevo, en la misma sentencia, igual que cuando
cambia el saldo (R3, R32).

**Por qué:**
- **Hay un solo intento vivo por factura (R4).** Si el método no estuviera en la clave, pedir `transferencia` con
  un vivo de `tarjeta` devolvería el de tarjeta (R2). La empresa no podría cambiar de método hasta que el vivo
  venciera.
- **Dos vivos, uno por método, rompen R4** y abren justo lo que la capa 1 cierra: dos cobros abiertos de la misma
  factura que se pueden pagar los dos.
- **Es el mismo caso que el saldo.** El intento describe un cobro concreto: cuánto, en qué moneda, con quién y por
  qué medio. Si cambia cualquiera de esas cosas, el intento viejo ya no sirve. La regla de R3 ya lo resuelve y está
  probada.
- **El proveedor, por la misma razón.** Con SLT-251, un país puede cambiar de proveedor. Devolver un vivo de Rebill a
  una empresa cuyo país ya cobra con Wompi la mandaría a un enlace que ya no corresponde.

**El riesgo, y por qué se acepta.** La empresa abre el enlace de tarjeta, pide transferencia y luego paga el enlace
viejo. El aviso encuentra el intento `anulado` y queda «requiere revisión» (R21, decisión P2), que resuelve SLT-233
«Cobro automático: conciliación, devoluciones y contracargos». Es el mismo riesgo que ya aceptó P2 para el saldo, y
no cuenta doble. Expirar en el proveedor el enlace del intento anulado es del adaptador (SLT-230 «Cobro automático:
enlace de pago por factura» y SLT-253), y se anota para sus specs.

**Alternativas descartadas:**
- **El método fuera de la clave y el vivo se reutiliza:** la empresa queda atada al primer método que eligió.
- **Un vivo por (factura, método):** rompe R4 y permite pagar dos veces la misma factura.
- **Una columna aparte y comparar `(clave, metodo, proveedor)`:** da lo mismo con más código. La clave ya es el
  sitio donde vive «¿es el mismo cobro?», y la función solo compara una cadena.

### 12.3 Crear el intento (§3.1)

`cobro_intento_obtener_o_crear(p_org, p_factura, p_proveedor, p_metodo, p_moneda_local, p_por, p_ahora)`:
- la firma pasa de 6 a 7 argumentos y cambian el `REVOKE` y el `DROP` del `down.sql`;
- paso 4: `v_clave := p_factura || '|' || v_saldo || '|' || p_moneda_local || '||' || p_proveedor || '|' || p_metodo`
  (la tasa sigue vacía);
- el `INSERT` escribe `metodo`;
- un proveedor o un método fuera de su conjunto lo rechaza el CHECK con `23514`, que revierte todo (R30, R31).

### 12.4 Marcar pagado a mano (R35–R39)

**`_cobro_aprobar(p_intento "cobro_intento", p_pago_proveedor_id text, p_por text, p_ahora timestamp)`**, interna
(sin `EXECUTE` para nadie salvo el dueño). Son los pasos 5 a 7 de §3.5 sin el `creado → pendiente`, sacados tal cual:
1. `UPDATE` a `aprobado` con `pago_proveedor_id`, `pago_id` y `aprobado_at`, y `_cobro_historial(…, 'pendiente',
   p_por, p_por IS NOT NULL)`: con la marca a mano, la fila lleva al superadmin como actor y `"manual": true` (R36);
2. el `INSERT` en `wallet_movimiento` de §3.5 paso 6, sin cambios: «Pagado en línea · <referencia>»,
   `registrado_por = NULL` y `clave_idempotencia = 'cobro:' || proveedor || ':' || referencia`. Es la misma clave
   para el aviso y para la marca: una red más contra el doble conteo, por empresa;
3. `_pago_plataforma_aplicar(org, pago, monto_local, [{factura_id, monto_local}], p_por, p_ahora, false, true)`. La
   confirmación queda `en_linea` con `confirmado_por = p_por` (R36). Con el aviso, `p_por` es `NULL`, como hoy.

`cobro_registrar_pago_aprobado` (§3.5) llama a `_cobro_aprobar(v_intento, p_pago_proveedor_id, NULL, p_ahora)`.

**`cobro_marcar_pagado_manual(p_intento text, p_referencia text, p_por text, p_ahora timestamp)`**, del dueño,
`SECURITY DEFINER`, `REVOKE EXECUTE … FROM PUBLIC`, sin `GRANT` a `servi_app` (R39). Devuelve una de estas
respuestas, sin escribir nada salvo con `ok`:

| Paso | Si… | Devuelve |
|---|---|---|
| 1 | `p_referencia` es nula o vacía tras `btrim` | `referencia_vacia` (R38) |
| 2 | No hay intento con ese id | `sin_intento` (R38) |
| 3 | — | Toma el candado `pago_plataforma:<org>`, luego `FOR UPDATE` de la factura y del intento, en el orden de §3.5 |
| 4 | Ya hay un intento con `(proveedor del intento, referencia)`: es este | `ya_registrado` (R37) |
| 4 | … es otro | `referencia_en_otro_intento` (R38) |
| 5 | El intento no está vivo (`creado` ni `pendiente`) | `no_vivo` (R38) |
| 6 | El saldo de la factura es menor que `monto_local` | `requiere_revision` (R38) |
| 7 | El intento está en `creado` | Lo pasa a `pendiente` con un `UPDATE` y `_cobro_historial(…, 'creado', p_por, true)`: la fila lleva al superadmin y `"manual": true` (R35, R36) |
| 8 | — | `_cobro_aprobar(intento, btrim(referencia), p_por, p_ahora)` y `ok` (R35, R36) |

- **El monto y la moneda son los del intento.** El superadmin no escribe un monto. Si la transferencia llegó por
  otro monto, no se marca: se registra por fuera con SLT-143 «El superadmin registra un pago hecho por fuera y anula
  un pago confirmado», o lo resuelve SLT-233.
- **`creado` o `pendiente`** (decisión del humano del 2026-11-20). La transferencia por datos de cuenta de Global66
  no crea cobro en el proveedor, así que su intento se queda en `creado` y sin `id_externo`. El paso 7 lo lleva por
  `pendiente` como §3.5, pero con el actor: no usa `_cobro_intento_pasar`, que escribe el historial sin actor.
- **La autorización** está en el servicio, como en SLT-60 y SLT-143: la función recibe `p_por` y confía en quien
  la llama, que solo puede ser el dueño.

**`cobro_registrar_pago_aprobado` con un paso 0 (R37):**

```sql
IF EXISTS (SELECT 1 FROM "cobro_intento" i
            WHERE i."proveedor" = p_proveedor AND i."pago_proveedor_id" = p_pago_proveedor_id) THEN
  RETURN 'ya_registrado';
END IF;
```

- **Va antes de buscar por `id_externo`.** Un intento de transferencia marcado a mano puede no tener `id_externo`,
  y sin este paso el aviso respondería `sin_intento` en vez de «ya registrado».
- **Se puede leer sin el candado** porque `pago_proveedor_id` solo pasa de vacío a un valor, una vez (R8): si la
  fila ya está confirmada, no cambia. El paso 3 de dentro del candado se queda como estaba.
- **A la vez (R37):** con `id_externo`, la marca y el aviso toman el mismo candado y el segundo ve el pago del
  primero. Sin `id_externo`, un aviso que corre antes de que la marca confirme no encuentra intento y responde
  `sin_intento` sin escribir. No cuenta doble, y un reintento posterior responde `ya_registrado`.

### 12.5 El `down.sql`

- `DROP FUNCTION cobro_intento_obtener_o_crear(text, text, text, text, text, text, timestamp)`, con la firma de 7;
- `DROP FUNCTION cobro_marcar_pagado_manual(text, text, text, timestamp)` y
  `DROP FUNCTION _cobro_aprobar("cobro_intento", text, text, timestamp)`, antes del `DROP TABLE`;
- `_cobro_historial` con su firma de 4.

La guarda que aborta si hay intentos no cambia (R28).

### 12.6 Backend

**Tipos (`lib/types/cobro.ts`):**

```ts
export const PROVEEDORES_COBRO = ["rebill", "wompi", "global66"] as const;
export const METODOS_COBRO = ["tarjeta", "recurrente", "transferencia"] as const;
export type MetodoCobro = (typeof METODOS_COBRO)[number];
// CobroIntentoDTO gana `metodo: MetodoCobro`.
export const marcarPagadoManualSchema = z.object({
  intentoId: z.string().min(1),
  referencia: z.string().trim().min(1).max(200),
});
export type MarcarPagadoManualResult = {
  estado: "ok" | "ya_registrado" | "forbidden" | "sin_intento" | "no_vivo" | "referencia_vacia"
        | "referencia_en_otro_intento" | "requiere_revision";
};
```

- `eventoProveedorSchema` ya usa `z.enum(PROVEEDORES_COBRO)`: admite los tres y rechaza el resto (R30).
- El tope de 200 caracteres de la referencia es una red contra basura. No sale de ningún proveedor, y si un
  adaptador lo necesita más largo lo sube.

**Repositorio:** `ObtenerOCrearRepoInput` gana `metodo`. Nace `marcarPagadoManual({ intentoId, referencia, por,
ahora })`, que llama a la función de §12.4 en `comoPlataforma("SL-45", …)`. El motivo de su entrada en
`EXCEPCIONES_DE_PLATAFORMA` suma `cobro_marcar_pagado_manual` y R35–R39.

**Servicio:**
- **`obtenerOCrearIntento`:** `ObtenerOCrearIntentoInput` gana `proveedor: ProveedorCobroId` y `metodo:
  MetodoCobro`, y los pasa al repositorio. Se quita el literal `"rebill"` (R31). Quien llama los elige: SLT-230 y
  SLT-231 con lo que diga SLT-251.
- **`marcarPagadoManual(actor, entrada)`** (R35–R39):
  1. si `!esPlataforma(actor.rol)`, devuelve `forbidden` sin llamar al repositorio (R39);
  2. valida con `marcarPagadoManualSchema`; si la referencia queda vacía, devuelve `referencia_vacia` sin llamar
     (R38). Otro fallo de forma lanza, porque es un error de programación;
  3. llama a `repo.marcarPagadoManual` con `por = actor.usuarioId` y `ahora`, y devuelve su respuesta.
- `procesarEvento` no cambia: el paso 0 vive en la base.

No hay action ni pantalla: el borde lo pone SLT-234.

### 12.7 Tests y mapa `R<n> → test`

Los tests van en los archivos que ya existen; no nace ninguno. Abreviaturas de `progress/impl_SLT-226.md`: `CI`
(`cobro-intento.test.ts`), `WE` (`cobro-webhook-evento.test.ts`), `PL` (`cobro-pago-en-linea.test.ts`), `MI`
(`migracion-slt226-ida-y-vuelta.test.ts`) y `SV` (`cobro-intento-service.test.ts`).

| R | Test | Qué afirma |
|---|---|---|
| R30 | CI «R30: el proveedor del intento admite rebill, wompi y global66, y la base rechaza otro» | `INSERT` del dueño con `stripe` da `23514`; con `wompi` y `global66`, nace |
| R30 | WE «R30: un evento de global66 se guarda; uno de otro proveedor da 23514» | El CHECK del evento |
| R30 | SV «R30: un evento con un proveedor desconocido lanza sin registrar ni consultar» | Ni `registrarEvento` ni `consultarPago` |
| R31 | CI «R31: pedido con wompi y tarjeta → el intento y su historial llevan los dos» | `proveedor`, `metodo` y el `detalle` del historial |
| R31 | CI «R31: un método fuera del conjunto da 23514 y no deja filas» | Ni intento ni historial |
| R31 | SV «R31: obtenerOCrearIntento pasa al repositorio el proveedor y el método que recibe» | Con `global66` y `transferencia`; sin literal |
| R32 | CI «R32: con un vivo de tarjeta, pedir transferencia lo anula `clave_distinta` y crea otro» | 1 vivo, el viejo `anulado`, 2 filas de historial |
| R32 | CI «R32: lo mismo con otro proveedor; con el mismo proveedor y método, `existente` (R2)» | Ajusta el test de R2 a la clave nueva |
| R33 | CI, el test de R8 ampliado: «… ni el método» | `UPDATE` de `metodo` como dueño da `SL226 columna_fija` |
| R34 | CI «R34: las columnas de cobro_intento son exactamente las del design y ninguna del medio de pago» | `information_schema.columns` contra la lista cerrada |
| R35 | PL «R35: marcar a mano un pendiente de global66 sin id externo → ok» | Caja y deuda bajan; saldo 0; movimiento «Pagado en línea · G66-123»; confirmación `en_linea`; 1 aplicación; `marcasDeLaPlataforma` lo trae en `enLinea` (R29) |
| R35 | PL «R35: marcar a mano un `creado` de global66 por transferencia, sin enlace → pasa por `pendiente` y queda `aprobado`» | Lo mismo que el anterior, desde `creado` |
| R36 | PL «R36: la marca a mano deja `pendiente → aprobado` con el superadmin como actor y `manual: true`, y la confirmación con el superadmin» | `historial_plataforma` y `confirmado_por` |
| R36 | PL «R36: desde `creado`, dos filas (`creado → pendiente` y `pendiente → aprobado`), las dos con el superadmin y `manual: true`» | — |
| R37 | PL «R37: marcar otra vez la misma referencia → `ya_registrado` sin filas» | Conteos iguales |
| R37 | PL «R37: el aviso de un pago marcado a mano responde `ya_registrado`, con y sin id externo» | `cobro_registrar_pago_aprobado` sin filas nuevas |
| R37 | PL «R37: la marca y el aviso a la vez, en dos conexiones, cuentan una vez» | 1 movimiento, 1 confirmación y 1 aplicación |
| R38 | PL «R38: inexistente, `aprobado`, `rechazado`, `expirado`, `anulado`, referencia en blanco, referencia de otro intento y saldo menor se rechazan con su respuesta» | Cada respuesta de §12.4 (`no_vivo` para los cuatro estados no vivos) y 0 filas |
| R38 | SV «R38: una referencia en blanco devuelve `referencia_vacia` sin llamar al repositorio» | — |
| R39 | SV «R39: maestro, admin, mensajero y tienda reciben `forbidden` sin llamadas» | El repositorio doble no recibe nada |
| R39 | SV «R39: el superadmin marca con su usuarioId como actor» | `por = actor.usuarioId` |
| R39 | PL «R39: como `servi_app`, ejecutar `cobro_marcar_pagado_manual` da 42501» | — |
| R28 | MI, sin cambios de afirmaciones | El `down` quita también las dos funciones nuevas y la huella vuelve a la de antes |

Además se ajustan, sin cambiar lo que afirman, los tests y el fixture `_fixtures/cobro.ts` que crean intentos
(pasan proveedor y método) o comparan la clave (`…|rebill|tarjeta`).

**Mutaciones que deben matar los tests nuevos**, una a la vez:
7. la clave sin el método (R32);
8. `cobro_registrar_pago_aprobado` sin el paso 0 (R37: el aviso sin `id_externo` da `sin_intento`);
9. `cobro_marcar_pagado_manual` sin el candado ni los `FOR UPDATE` (R37 a la vez);
10. `marcarPagadoManual` sin la comprobación de `esPlataforma` (R39).

### 12.8 Tamaño de la enmienda

Medido antes de la enmienda (T7.4, `scripts/tamano-pr.mjs`): **31/40 archivos, 1 752/1 000 líneas de producción y
2 534/3 000 de tests.**

| | Archivos nuevos | Archivos tocados (ya en el PR) | Líneas (añadidas + borradas) |
|---|---|---|---|
| Producción | 0 | `migration.sql`, `down.sql`, `schema.prisma`, `lib/types/cobro.ts`, las dos interfaces y las dos clases del cobro, `excepciones-aislamiento.ts` (9) | ~+260–320: SQL ~150, TypeScript ~110, Prisma ~3 |
| Tests | 0 | `cobro-intento`, `cobro-webhook-evento`, `cobro-pago-en-linea`, `migracion-slt226-ida-y-vuelta`, `cobro-intento-service` y `_fixtures/cobro.ts` (6) | ~+380–480 |
| **Total del PR** | **31/40** | | Producción ~2 010–2 070/1 000; tests ~2 910–3 010/3 000 |

- **Archivos:** no cambian.
- **Producción:** sigue por encima del tope, aceptado por P5.
- **Tests:** quedan en el borde del tope. Si pasan de 3 000 al medir, se acepta (decisión del humano del
  2026-11-20): se anota en el marcador `tamano-pr-aceptado` y se sigue. La marca desde `creado` suma ~40 líneas de
  tests y ~10 de SQL a la estimación de arriba.

### 12.9 Riesgos de la enmienda

- **Una referencia mal copiada.** Si el superadmin escribe otra referencia que la del proveedor, el aviso posterior
  no la encuentra por el paso 0. Si el intento tiene `id_externo`, el aviso lo encuentra `aprobado` y responde
  `requiere_revision` (R21), sin contar doble. Si no tiene, responde `sin_intento`. Nunca cuenta doble, pero la
  pantalla de SLT-234 debe pedir la referencia tal cual la da el proveedor. Se anota para su spec.
- **Las bases ya migradas.** Editar `20261124130100` cambia su contenido, y Prisma marca la diferencia en una base
  que ya la aplicó. La de la feature se rehace (`down` y la ida); `dev` todavía no la tiene.
