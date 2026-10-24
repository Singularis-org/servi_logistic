# SL-40 «Cobro de la plataforma por orden» — design

## Lo que ya existe

Búsqueda hecha el 2026-10-23 con los términos `cobro`, `plataforma`, `por orden`, `tarifa`, `deuda`,
`factur`, `anulad` y `deleted_at`. El MCP `codebase-memory-mcp` no estaba entre las herramientas de
este agente, así que el código se exploró con Grep y Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board (`feature_list.json`) | Ninguna ficha cobra a la empresa por orden. Se le acercan **SL-24** «Planes con límites contados en el servidor» (pending), que trata de límites y no de un cobro por orden, y **SL-26** «Panel de superadmin» (pending), que gestionará empresas, planes y módulos. | No hay duplicado. SL-26 podrá mover después la configuración a su panel; las piezas de servidor de esta ficha le sirven tal cual. |
| Specs | **SL-39** `design.md > 8 Preparado para SL-40`: una entrada más en `REGIONES_BOLSILLO_EMPRESA` y un dato más para el resumen. **SL-32** `design.md > Pantalla «Empresas»`: la pantalla, su repositorio en `comoPlataforma` y `esPlataforma`. | Se encaja en los dos (§10, §9.1). |
| `lib/auth/plataforma.ts` | `ROLES_PLATAFORMA` y `esPlataforma` (SL-32). | Única pregunta de autorización del superadmin (R6). |
| `app/(app)/plataforma/empresas/` y `EmpresasPlataformaRepository` | Pantalla «Empresas»: el listado y «Crear empresa». | Se le añade el bloque del valor global y una columna con la tarifa de cada empresa (§9.1). |
| `lib/db/contexto-empresa.ts`, `extension-empresa.ts`, `excepciones-aislamiento.ts`, `modelos-de-negocio.ts` | Contexto de empresa o de plataforma, extensión, lista de excepciones y clasificación de modelos (SL-17). | La tabla de cargos se declara de negocio; la tabla global, de plataforma; el repositorio nuevo de configuración entra en `EXCEPCIONES_DE_PLATAFORMA`. |
| Migración `20261022130000_organizacion_y_rol_app` | `servi_app` con `GRANT` CRUD por defecto en toda tabla nueva y `REVOKE` de escritura en catálogos y `organizacion`. Política `organizacion_propia` (la empresa solo lee su fila). | La columna de excepción en `organizacion` hereda el «solo lectura». Las dos tablas nuevas necesitan su propio `REVOKE`, porque el `ALTER DEFAULT PRIVILEGES` les da CRUD (§3.4). |
| Migración `20261022130300_misma_empresa_en_fk` y `scripts/generar-misma-empresa.ts --faltantes` | Triggers de misma empresa y de «sin cambio de empresa». | Se generan los de la tabla de cargos (R20, R28). |
| Creación de órdenes | Todas pasan por `OrdenRepository.createManyOrdenes` y `createManyOrdenesConGuia`, llamadas desde `BulkOrdenService` (`:274`, `:284`, `:592`): la pantalla, la carga masiva y la API. | No se tocan: el cargo lo escribe un trigger de la base (§2.2). |
| Anulación de órdenes | Tres escritores de `orden.deleted_at`: `OrdenRepository.softDelete` (por pantalla, por lote), `softDeleteViaApi` (API key) y `restore` (lo recupera el `maestro`). Los dos primeros apuntan `orden_eliminada` en `historial_accion`, y el tercero `orden_recuperada`. | El reverso y la recarga también los escribe un trigger (§2.2). |
| `cancelacion_api` (`OrdenRepository.cancelarViaApi`) | La tienda cancela por API una orden que ya está en la bodega central o en camino, y la orden pasa a `devolviendo_a_tienda`. No la elimina. | No cuenta como anulación (D6, P3). |
| `WalletService.verResumenCaja` y `lib/actions/wallet.ts` | Resumen y composición de la caja, en una lectura de `wallet_movimiento`. | **No se tocan.** La deuda llega por un servicio y una action propios (§5, §10). |
| Código | Ningún símbolo con `cobro_plataforma`, `comision_plataforma`, `tarifa_plataforma` ni `deuda_plataforma`. La tabla `tarifas` existente es otra cosa: lo que la empresa cobra a sus tiendas. | Los nombres nuevos llevan `cobro_plataforma`, para no confundirlos con `tarifas`. |

## 1. Evidencia: cómo nace y cómo muere una orden hoy

### 1.1 Creación

Toda orden nace con un `INSERT` en `orden` desde `createManyOrdenes` o `createManyOrdenesConGuia`
(`lib/repositories/OrdenRepository.ts:2899` y `:3020`). Los dos usan `tx.orden.createMany`: una
sentencia con varias filas, dentro de la transacción de empresa (rol `servi_app`, empresa fijada).

### 1.2 Anulación y recuperación

- En el código no existe un estado «anulada» para una orden: `ORDER_STATUS_SEED` no lo tiene.
- Lo que saca a una orden de la operación sin haberla gestionado es **eliminarla**: `deleted_at`
  pasa a tener valor. Solo se puede eliminar en los siete estados de `ESTADOS_ELIMINABLES`, y sin
  intentos de entrega (`lib/types/order-status-eliminables.ts`).
- La eliminación es **reversible**: `restore` pone `deleted_at = NULL`.
- Los tres escritores usan `UPDATE … WHERE deleted_at IS [NOT] NULL`, así que repetir la operación
  no hace nada.

Por eso «anulada» es «eliminada» (D6). Un trigger sobre `UPDATE OF deleted_at` cubre los tres
caminos, y también el que alguien añada mañana.

## 2. El cálculo

### 2.1 Las dos opciones

| | **A. Registro por orden, importe congelado** (recomendada) | **B. Conteo al vuelo** |
|---|---|---|
| Qué guarda | Un cargo por orden con su importe; un reverso al anularla | Nada: solo la tarifa |
| Deuda | Σ cargos − Σ reversos | (órdenes creadas − anuladas) × tarifa de hoy |
| Cambio de tarifa | Afecta solo a las órdenes nuevas | Recalcula todas las órdenes, también las de antes |
| Excepción por empresa | Se congela con el cargo | Hay que decidir qué tarifa vale para cada orden pasada |
| Anulación en otro período | Reverso con su fecha: los períodos pasados no cambian | Cambia hacia atrás la cifra del período de creación |
| Cobro real futuro | Ya tiene el detalle por orden que se facturaría | Hay que reconstruirlo |

**Recomendación: A** (P1, cerrada por Carlos el 2026-10-23: se congela). El resultado solo difiere cuando la tarifa cambia y ya hay órdenes
creadas. Ejemplo: 100 órdenes a 500,00, y luego la tarifa sube a 600,00. Con A la deuda queda en
50.000,00; con B, en 60.000,00. Por eso la pregunta va a Carlos. El spec está escrito sobre A.

### 2.2 Quién escribe los cargos: un trigger en la base

Los cargos y los reversos los escribe la base, con triggers sobre `orden`, y no el código de la app:

- **«Por cualquier vía» (D3) se cumple por construcción.** Los tres caminos de creación y los tres de
  borrado acaban en el mismo `INSERT` o `UPDATE OF deleted_at`. Un camino nuevo que nadie se acuerde
  de enganchar también genera su cargo.
- **Misma transacción (R12, R13, R15).** El trigger corre dentro de la sentencia. Si la transacción
  se deshace, el cargo se deshace con ella.
- **La empresa no puede tocarlos (R8).** La tabla no tiene permiso de escritura para `servi_app`. Las
  funciones son `SECURITY DEFINER`, así que escriben como dueño de las tablas.

Las dos funciones, en `plpgsql`, con `SET search_path = public, pg_temp`:

1. **`cobro_plataforma_al_crear_orden()`**, un `AFTER INSERT ON "orden" FOR EACH ROW WHEN (NEW."deleted_at" IS NULL)`:
   - lee la excepción de `organizacion` (`NEW.organizacion_id`) y, si no la hay, el valor global;
   - decide la `fuente`: `empresa`, `global` o `sin_configurar` (0,00, D11);
   - inserta un `cargo` con `secuencia = 1`, `ocurrido_at = now()` y el `organizacion_id` de la orden.
2. **`cobro_plataforma_al_cambiar_borrado()`**, un `AFTER UPDATE OF "deleted_at" ON "orden" FOR EACH ROW WHEN (OLD."deleted_at" IS DISTINCT FROM NEW."deleted_at")`:
   - lee el **último** movimiento de la orden (`ORDER BY secuencia DESC LIMIT 1`). La fila de la
     orden ya está bloqueada por el `UPDATE`, así que dos operaciones sobre la misma orden se
     serializan;
   - de viva a borrada, si el último es un `cargo`: inserta un `reverso` por su `monto` y con su
     `fuente`, con `ocurrido_at = NEW.deleted_at` (R15);
   - de borrada a viva, si el último es un `reverso`: inserta un `cargo` por su `monto` y con su
     `fuente`, con `ocurrido_at = now()` (R16);
   - sin movimientos (orden anterior a la ficha, D8) o con un último movimiento que no toca: no hace
     nada (R17, R18).

Con eso los movimientos de una orden **alternan siempre** `cargo, reverso, cargo…`, empezando por
`cargo`. La deuda de la orden es 0 o el importe del cargo (R17). El único `(organizacion_id,
orden_id, secuencia)` es el cerrojo de último recurso.

### 2.3 Anulación: en el instante en que ocurre (D7)

- El reverso lleva la fecha de la anulación y el cargo original se queda como está.
- Un período ya pasado no cambia de cifra: es lo que necesitará un cobro real por períodos.
- La recuperación vuelve a cargar **el mismo importe** que el cargo revertido, y no la tarifa de hoy.
  Recuperar deshace un error; no es una orden nueva.
- En la wallet de hoy la deuda es el acumulado (R23), así que la cifra visible es la misma con
  cualquiera de las dos fechas. Por eso no se le pregunta a Carlos.

### 2.4 Sin tarifa configurada (D11)

- Sin valor global ni excepción, el cargo se registra con 0,00 y `fuente = sin_configurar`.
- Se registra igual por dos motivos: «sin precio» en el momento de crear la orden es un hecho que el
  registro congelado debe guardar, y así el reverso y la recuperación funcionan igual para todas las
  órdenes.
- No se siembra ningún valor global: la app nace vacía (`docs/plan-saas.md`, decisión 5), y el
  superadmin lo fija en «Empresas».

### 2.5 Ejemplo numérico (el del test de integración)

La empresa A no tiene excepción y el valor global es 500,00. La empresa B tiene una excepción de
300,00.

| Paso | Movimientos de A | Deuda de A | Deuda de B |
|---|---|---|---|
| A crea 3 órdenes (o1, o2, o3) | 3 cargos de 500,00 (global) | 1.500,00 | 0,00 |
| B crea 1 orden (p1) | — | 1.500,00 | 300,00 |
| El superadmin sube el global a 600,00 | — (R14) | 1.500,00 | 300,00 |
| A crea o4 | cargo de 600,00 | 2.100,00 | 300,00 |
| A elimina o1 por pantalla | reverso de 500,00 | 1.600,00 | 300,00 |
| A elimina o1 otra vez | — (R17) | 1.600,00 | 300,00 |
| El `maestro` recupera o1 | cargo de 500,00 (no de 600,00) | 2.100,00 | 300,00 |
| A elimina o2 por API | reverso de 500,00 | 1.600,00 | 300,00 |

## 3. Modelo de datos

### 3.1 Valor global: `cobro_plataforma_tarifa` (plataforma)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `BOOLEAN` PK, `DEFAULT true` | `CHECK ("id")`: fila única |
| `monto` | `DECIMAL(12,2) NOT NULL` | `CHECK ("monto" >= 0)` |
| `updated_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | |

- Prisma: `model CobroPlataformaTarifa` con `@@map("cobro_plataforma_tarifa")`. Entra en
  `MODELOS_DE_PLATAFORMA`.
- No tiene `organizacion_id`: es de la plataforma (D9).
- Que no haya fila quiere decir «sin configurar».
- No guarda quién la cambió. Solo hay un superadmin (índice `usuario_un_solo_superadmin` de SL-32), y
  `historial_accion` es de negocio y exige empresa, que el superadmin no tiene.
- **RLS activada y sin ninguna política para `servi_app`, más `REVOKE ALL … FROM servi_app`.** Una
  empresa no la lee ni la escribe (R8). La lee el trigger, que es `SECURITY DEFINER`, y el
  superadmin, en `comoPlataforma`, que corre como dueño.

### 3.2 Excepción: `organizacion.cobro_plataforma_por_orden` (plataforma)

- `DECIMAL(12,2) NULL`, con `CHECK (… IS NULL OR … >= 0)`. `NULL` quiere decir «usa el global».
- Prisma: `Organizacion.cobroPlataformaPorOrden Decimal? @map("cobro_plataforma_por_orden") @db.Decimal(12, 2)`.
- Va en `organizacion` y no en una tabla aparte porque es un dato 1 a 1 de la empresa. Además
  `organizacion` ya es de solo lectura para `servi_app` (`REVOKE` de SL-17), y la empresa solo ve su
  propia fila (`organizacion_propia`). R8 sale gratis, sin tabla ni política nuevas.

### 3.3 Cargos: `cobro_plataforma_movimiento` (negocio)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `TEXT` PK | `gen_random_uuid()::text` en el trigger |
| `organizacion_id` | `TEXT NOT NULL`, FK `organizacion` `ON DELETE RESTRICT` | `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`, como toda tabla de negocio. El trigger la escribe explícita con la de la orden |
| `orden_id` | `TEXT NOT NULL`, FK `orden` `ON DELETE CASCADE` | ver abajo |
| `secuencia` | `INTEGER NOT NULL` | `CHECK ("secuencia" >= 1)` |
| `tipo` | enum `cobro_plataforma_tipo` (`cargo`, `reverso`) | |
| `fuente` | enum `cobro_plataforma_fuente` (`empresa`, `global`, `sin_configurar`) | |
| `monto` | `DECIMAL(12,2) NOT NULL` | `CHECK ("monto" >= 0)` |
| `ocurrido_at` | `TIMESTAMP(3) NOT NULL` | instante del hecho (creación, anulación o recuperación) |
| `created_at` | `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP` | |

- Índices:
  - `UNIQUE ("organizacion_id", "orden_id", "secuencia")`: único por empresa, con la empresa
    primero (regla de `docs/architecture.md`);
  - `("organizacion_id")`, para la suma de la wallet;
  - `("orden_id")`.
- **`ON DELETE CASCADE` sobre `orden`:**
  - la app nunca borra una orden de verdad: solo la elimina con `deleted_at`;
  - el único `DELETE FROM orden` está en limpiezas de tests y scripts (diez archivos, p. ej.
    `tests/integration/db/aislamiento-ordenes.test.ts`), y `RESTRICT` los rompería sin proteger nada
    del producto;
  - las acciones referenciales corren como dueño, así que el `REVOKE` no las frena.
- **Solo lectura para la empresa:**
  - política `cobro_plataforma_movimiento_por_empresa` `FOR ALL TO servi_app`, con `USING` y
    `WITH CHECK` por `organizacion_id`. Es la misma forma que las 73 de SL-17, para que
    `rls-por-empresa` la reconozca;
  - además, `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` (R8). La política aísla la lectura (R24)
    y el `REVOKE` cierra la escritura.
- Triggers de SL-17, generados con `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`: el de
  misma empresa para la FK `orden_id` y el de «sin cambio de empresa» (R20, R28).
- Prisma: `model CobroPlataformaMovimiento` con `@@map`, sus enums con `@@map`, la relación inversa
  en `Orden` (`cobrosPlataforma`) y en `Organizacion`. Entra en `MODELOS_DE_NEGOCIO`.
- Los `CHECK`, las funciones y los triggers no los expresa Prisma. Viven en el SQL, con un comentario
  en el modelo como el de `orden_monto_cobrar_entero_check`, para que el diff de drift salga vacío.

### 3.4 Por qué hace falta el `REVOKE`

`20261022130000_organizacion_y_rol_app` deja `ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT,
UPDATE, DELETE ON TABLES TO servi_app`: toda tabla nueva nace escribible por la empresa. Sin el
`REVOKE`, una empresa podría borrar su deuda con un `DELETE` a mano: la RLS se lo permitiría, porque
la fila es suya. El test de R8 lo intenta y espera `42501`.

## 4. Migraciones

Van después de todas las de `dev` (la última es `20261023100200_usuario_empresa_o_superadmin`) y de las
de SL-38 (`20261023120000` y `20261023120100`). SL-39 no tiene migraciones.

| Carpeta | `migration.sql` | `down.sql` |
|---|---|---|
| `20261023130000_cobro_plataforma_tarifa` | Tabla `cobro_plataforma_tarifa` con RLS y sin políticas; `REVOKE ALL … FROM servi_app`. Columna `organizacion.cobro_plataforma_por_orden` con su `CHECK`. | `DROP COLUMN` y `DROP TABLE`. |
| `20261023130100_cobro_plataforma_movimiento` | Enums, tabla, índices, FK, RLS, política `…_por_empresa`, `REVOKE INSERT, UPDATE, DELETE` y los triggers de SL-17 generados. | Borra los triggers, la tabla y los enums. |
| `20261023130200_cobro_plataforma_triggers_orden` | Las dos funciones `SECURITY DEFINER` (`REVOKE EXECUTE … FROM PUBLIC`) y los dos triggers sobre `orden`. | `DROP TRIGGER` y `DROP FUNCTION`. |

- Los triggers sobre `orden` van en carpeta propia: así se pueden apagar sin borrar los cargos ya
  registrados.
- A mano: `db:migrate:create` falla con P3006 en este repo (comentario de la migración de SL-17).
- Si SL-38 o SL-39 añaden otra migración con un timestamp posterior antes del merge, estas se
  renombran **antes de aplicarse en ninguna base compartida**. Una migración ya aplicada no se
  renumera nunca (memoria «Migración editada en sitio = drift»).
- No hay backfill (D8).
- `tests/integration/db/migracion-sl40-ida-y-vuelta.test.ts` aplica las tres, crea y anula una orden,
  aplica los tres `down.sql` y vuelve a crear y anular otra (R29).

## 5. Capas

| Archivo | Papel |
|---|---|
| `lib/types/cobro-plataforma.ts` | `montoCobroSchema` (zod), un texto `^\d{1,10}(\.\d{1,2})?$` y nada más: el importe viaja como texto, sin `Number`. `fijarCobroGlobalSchema`, `fijarCobroEmpresaSchema` (`organizacionId` y `monto: string \| null`) y los DTO de §8. |
| `lib/interfaces/repositories/ICobroPlataformaTarifaRepository.ts` y `lib/repositories/CobroPlataformaTarifaRepository.ts` | `leerGlobal()`, `fijarGlobal(monto)` (upsert de la fila `true`), `existeEmpresa(id)` y `fijarDeEmpresa(id, monto \| null)`. Todo dentro de `comoPlataforma("SL-40", …)`. |
| `lib/interfaces/services/ICobroPlataformaService.ts` y `lib/services/CobroPlataformaService.ts` | `verGlobal(actor)`, `fijarGlobal(actor, input)` y `fijarDeEmpresa(actor, input)`. El orden es fijo: `esPlataforma` (R6), luego zod (R4), luego existencia (R7), y al final la escritura. |
| `lib/actions/cobro-plataforma.ts` | `'use server'`: `fijarCobroGlobalAction` y `fijarCobroEmpresaAction`. Resuelve el actor de la sesión y monta el servicio en su composition root. |
| `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts` y `lib/repositories/CobroPlataformaMovimientoRepository.ts` | `sumasPorTipo()`: un `groupBy` por `tipo` con `_sum.monto`, sin ningún filtro más. La extensión añade la empresa y la RLS la respalda (R24). **Ningún método escribe.** |
| `lib/utils/deuda-plataforma.ts` | `derivarDeudaPlataforma(sumas)`, puro y *money-safe* (`Prisma.Decimal` dentro, texto con dos decimales fuera): Σ cargo − Σ reverso. Si falta un tipo, aporta 0. |
| `lib/interfaces/services/IDeudaPlataformaService.ts` y `lib/services/DeudaPlataformaService.ts` | `verDeuda(actor)`: `esAccesoTotal` antes de la base (R25), luego el repositorio y la derivación. |
| `lib/actions/deuda-plataforma.ts` | `verDeudaPlataformaAction()`, con su composition root. |
| `lib/repositories/EmpresasPlataformaRepository.ts` y `lib/types/empresas-plataforma.ts` | El `select` añade `cobroPlataformaPorOrden`, y `EmpresaListada` gana `cobroPorOrden: string \| null`. |

- `lib/db/excepciones-aislamiento.ts` gana `{ archivo: "lib/repositories/CobroPlataformaTarifaRepository.ts", ficha: "SL-40", motivo: "valor global y excepción por empresa del cobro por orden: los edita el superadmin, que no tiene empresa (R1, R2)" }`.
- **El composition root que no inyecta** (memoria): los dos `composition-root` tienen test. El test
  comprueba que la action construye el servicio con el repositorio real y que lo **pasa**, no solo
  que lo importa.

## 6. Autorización

| Operación | Quién | Dónde se comprueba | R |
|---|---|---|---|
| Ver y guardar el valor global y las excepciones | superadmin (`esPlataforma`) | En el servicio, antes de la base. La página ya hace `notFound()` a cualquier otro rol | R6 |
| Escribir la tarifa, la excepción o un cargo | nadie desde una empresa | En la base: `REVOKE` y RLS | R8 |
| Ver la deuda | `maestro` y `admin` (`esAccesoTotal`), igual que la caja | En el servicio, antes de la base | R25 |
| Ver los cargos de otra empresa | nadie | Extensión y política `…_por_empresa` | R24 |

- No hay módulo que encender: el catálogo de módulos es SL-23.
- La guardia `superadmin-fuera-de-empresa` de SL-32 exige que `ROLES_PLATAFORMA` se lea por import.
  `CobroPlataformaService` llama a `esPlataforma` y no escribe el literal.

## 7. Qué depende del país

- **La moneda.** El importe se guarda sin moneda, como la caja, y se pinta con el mismo formateador
  de dinero que la wallet (`money`), que hoy usa la única moneda del sistema.
  - **Riesgo:** con SL-21, dos empresas de países con monedas distintas compartirían un mismo valor
    global sin conversión.
  - La excepción por empresa lo resuelve a mano. Que el valor global sea por moneda o por país lo
    decide SL-21; esta ficha no lo inventa.
- **Los impuestos:** P2, cerrada por Carlos el 2026-10-23: sin IVA por ahora. El cargo va sin impuestos (R19).
- No hay ningún literal de país ni de moneda en el código nuevo (bloqueante del reviewer).

## 8. Contratos I/O

Todos los importes son texto con dos decimales (R26).

```ts
// lib/types/cobro-plataforma.ts
export type CobroGlobalDTO = { monto: string | null };            // null = sin configurar (R9)
export type FijarCobroGlobalInput = { monto: string };
export type FijarCobroEmpresaInput = { organizacionId: string; monto: string | null }; // null = quitar la excepción (R5)
export type FijarCobroResult =
  | { status: "ok" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }  // R4
  | { status: "not_found" }                                               // R7
  | { status: "forbidden" };                                              // R6

export type DeudaPlataformaDTO = { deuda: string };              // R21, R23, R26
export type VerDeudaPlataformaResult =
  | { status: "ok"; deudaPlataforma: DeudaPlataformaDTO }
  | { status: "forbidden" };                                     // R25

// lib/types/empresas-plataforma.ts
export type EmpresaListada = { /* lo de SL-32 */ cobroPorOrden: string | null }; // null = usa el global (R10)
```

`EmpresasModule` deriva la tarifa vigente de cada fila (`cobroPorOrden ?? global ?? "0.00"`) solo
para **elegir** qué texto pintar, sin aritmética: es la misma regla de R3, aplicada a textos ya
derivados. La prueba de R3 está en la base (§11), no en la pantalla.

## 9. Pantallas (las dos existen: sin `/design`)

### 9.1 «Empresas» (`EmpresasModule.tsx`)

Sigue los patrones de la propuesta de T12 de SL-32 (`FormField`, `Input`, `Button`, `Alert` y `Table`
de `components/ui/`), sin piezas nuevas.

1. **Bloque nuevo «Cobro por orden»**, entre el aviso de alta y el formulario «Crear empresa»:
   - un `h2` «Cobro por orden»;
   - la línea «Valor global: 500,00», o «Valor global: sin configurar (0,00)»;
   - un `FormField` «Valor global», con su `Input` (`inputMode="decimal"`) y el botón «Guardar»;
   - la ayuda corta: «Se aplica a cada orden que creen las empresas sin valor propio. Las órdenes ya
     creadas conservan su importe.» (R9, R14).
2. **Columna nueva «Cobro por orden»** en la tabla, después de «Alta»:
   - el importe y, debajo, en `text-xs text-muted-foreground`, «propio» o «global» (R10);
   - el botón «Cambiar» abre en la misma fila un `Input` con «Guardar» y «Usar el global». Este
     último solo aparece si la empresa tiene valor propio y llama a la action con `monto: null`.
3. **Tras un éxito**: `router.refresh()` y un `Alert` `role="status"` con «Cobro guardado.» (R11).
4. **Errores**:
   - `validation_error`: bajo el campo, «Escribe un importe mayor o igual que cero, con dos decimales
     como máximo.»;
   - `not_found`: «Esa empresa ya no existe.»;
   - cualquier otra cosa: «No se pudo guardar el cobro. Inténtalo de nuevo.».

   En todos los casos se conserva lo escrito (R11).
5. La página lee `verGlobal` en el mismo `Promise.all` que el listado y le pasa al módulo
   `cobroGlobal` y las dos actions por props.

Es un cambio de una pantalla que ya existe (un bloque y una columna), no una pantalla nueva, así que
no pasa por `/design` (`docs/perfil-agentes.md > frontend_dev`). Si Carlos prefiere una pantalla de
ajustes de plataforma aparte, esa sí sería nueva y pasaría por `/design`.

### 9.2 La wallet (`CajaResumenCard.tsx`)

- **La región.** Va en el bolsillo de la empresa, como **última** entrada de
  `REGIONES_BOLSILLO_EMPRESA` (SL-39, R9 de SL-39), después de «Saldo inicial y aportes»:
  - `id: "deuda_plataforma"`;
  - rótulo «Lo que la empresa debe a la plataforma»;
  - pista «Lo que la plataforma cobra por cada orden creada, menos las anuladas. Todavía no se cobra:
    no sale de la caja.»;
  - el importe en `tabular-nums`, **sin insignia de signo y sin color de signo**: una deuda no es
    «positiva» ni «negativa» para la caja, y el color verde la confundiría con dinero a favor.
- **El dato.** `app/(app)/wallet/page.tsx` llama a `verDeudaPlataformaAction()` en el mismo
  `Promise.all` que `verResumenCajaAction`, y lo pasa por props:
  `WalletModule` → `CajaResumenCard` (`deudaPlataforma: DeudaPlataformaDTO | null`).
  - Con `forbidden` o con `null`, la región no se pinta.
  - `WalletModule` no la vuelve a pedir al cambiar filtros, porque no depende de ellos (R23).
- **El texto.** En `wallet-labels.ts`, con la palabra «plataforma» en minúscula. «La plataforma»
  está en `MARCAS_PLATAFORMA`, en minúscula (SL-32 `design.md > Gestionar la geografía`). No se
  escribe «Servi Logistic» (`docs/plan-saas.md`, decisión 4).
- **La ayuda.** `docs/ayuda/oficina/wallet-caja.md` explica la línea y que no cambia la caja, y se
  actualiza `actualizado:`.

## 10. Encaje con SL-39

SL-39 `design.md > 8` preparó tres sitios. Esta ficha usa dos y **descarta el tercero a propósito**:

| Sitio que preparó SL-39 | Uso en SL-40 |
|---|---|
| Una entrada más en `REGIONES_BOLSILLO_EMPRESA` | **Sí**, la última (§9.2). Como la deuda no sale de `CajaResumenDTO`, el accesor de la lista pasa de `valor(resumen)` a `valor({ resumen, deudaPlataforma })`. Es un cambio de tipo en las entradas que ya existen, y su valor no cambia. |
| Un campo más en `CajaResumenDTO` | **No.** La deuda no se deriva de las filas de `wallet_movimiento`, y `derivarCaja` es pura sobre esas filas. Ponerla ahí obligaría a `ComoQuedoService` y a `efecto-movimiento.ts` a inventarle un valor. Va como dato propio, con su servicio. `WalletService` y `lib/actions/wallet.ts` no se tocan, y los once tests que construyen `WalletService` tampoco. |
| Una cubeta más en `acumular` y un sumando más en `deEmpresa` | **No, y es deliberado (D10).** Sumarla a `deEmpresa` movería la barra y rompería la identidad de la 459 (`enCaja = deEmpresa + deTerceros`) con un dinero que no está en la caja. R22 lo comprueba. |

- **Orden:** la tanda de la wallet (tasks T7) espera a que SL-39 esté en `dev`. Sin él no existe
  `REGIONES_BOLSILLO_EMPRESA`.
- Si SL-39 cambia de forma antes del merge, T7 encaja sobre lo que haya en `dev`, con la misma regla:
  la región es una entrada más y no toca ninguna cifra.

## 11. Tests

### 11.1 El test que hoy falla: `tests/integration/db/cobro-plataforma-cargos.test.ts`

Contra Postgres (`HAY_BASE_DE_DATOS`), con el cliente extendido y `conEmpresa`, como
`tests/integration/db/aislamiento-ordenes.test.ts`.

- **Montaje**:
  - empresas A y B, con lo mínimo para crear órdenes (tienda, zona y geografía);
  - el valor global y la excepción de B, fijados con `CobroPlataformaTarifaRepository` real;
  - las órdenes, con `OrdenRepository.createManyOrdenes` real;
  - la anulación, con `softDelete`, `softDeleteViaApi` y `restore` reales.
- **Pasos**: los de §2.5, uno a uno.
- **Afirma**, leyendo `cobro_plataforma_movimiento` con el cliente base:
  - después de cada paso, las filas exactas (`tipo`, `monto`, `fuente`, `secuencia`) y la deuda de A
    y de B (R3, R12, R14–R17, R20);
  - las dos vías de anulación (R15);
  - `ocurrido_at` del reverso igual a `orden.deleted_at` (R15);
  - una transacción que crea una orden y lanza: cero filas (R13);
  - una orden insertada con los triggers apagados (simula la de antes de la ficha) y luego eliminada:
    cero filas (R18);
  - sin valor global: un cargo de `0.00` con fuente `sin_configurar` (R3, D11);
  - el importe es exactamente la tarifa, sin impuestos (R19).
- **R8**, con `servi_app` y la empresa fijada:
  - `INSERT`, `UPDATE` y `DELETE` sobre `cobro_plataforma_movimiento`, `INSERT` y `UPDATE` sobre
    `cobro_plataforma_tarifa`, y `UPDATE organizacion SET cobro_plataforma_por_orden`;
  - todos esperan `42501`.
- **R20**: un `INSERT` como dueño de un cargo de A con una orden de B espera `SL017`.
- **Control de no vacuidad**: antes de afirmar nada, comprueba que las órdenes existen y que el
  trigger está instalado (`pg_trigger`). Un `skip` por falta de base no cuenta como verde.
- **Mutaciones que lo deben matar**, una cada vez y medidas:
  1. el trigger ignora la excepción;
  2. el reverso usa la tarifa de hoy en vez del importe del cargo;
  3. no se comprueba el último movimiento (doble reverso);
  4. se quita el `REVOKE` de la tabla de cargos.

### 11.2 La wallet: `tests/integration/db/deuda-plataforma-wallet.test.ts`

- **Montaje**: el molde de `tests/integration/db/_fixtures/caja-459.ts`, con `WalletService` real y
  `DeudaPlataformaService` con `CobroPlataformaMovimientoRepository` real.
- **Pasos**:
  1. lee `verResumenCaja` y `verDeuda`;
  2. A crea dos órdenes con el global en 500,00 y elimina una;
  3. vuelve a leer.
- **Afirma**:
  - Δdeuda = `"500.00"`;
  - **todas** las cifras de `resumen` y de `composicion` iguales, campo a campo (R22);
  - ninguna fila nueva en `wallet_movimiento` (R27);
  - con filtros de período, la deuda es la misma (R23);
  - B no ve la deuda de A (R24).
- **Mutación**: sumar la deuda a `deEmpresa` pone el test en rojo.

### 11.3 Puros, servicios, pantalla y guardias

| Archivo | Qué cubre |
|---|---|
| `tests/unit/utils/deuda-plataforma.test.ts` | R26: Σ − Σ, un tipo ausente, decimales, sin `Number`. |
| `tests/unit/types/cobro-plataforma-schema.test.ts` | R4: negativos, tres decimales, texto, fuera de `DECIMAL(12,2)`, vacío. |
| `tests/unit/services/cobro-plataforma-service.test.ts` | R6: `forbidden` sin llamadas al repositorio para cada rol de empresa. R4, R5 y R7. |
| `tests/unit/services/deuda-plataforma-service.test.ts` | R25: `forbidden` antes del repositorio. |
| `tests/unit/actions/cobro-plataforma.composition-root.test.ts` y `deuda-plataforma.composition-root.test.ts` | Los composition roots **pasan** el repositorio real. |
| `tests/integration/db/empresas-plataforma-cobro.test.ts` | R2, R5 y R10 contra la base: el listado trae `cobroPorOrden`, y fijar y quitar la excepción la escriben. |
| `tests/components/EmpresasModuleCobro.test.tsx` | R9–R11: el bloque, la columna, «propio» o «global», «Usar el global», los errores y que se conserva lo escrito. |
| `tests/components/WalletDeudaPlataformaSL40.test.tsx` | R21 y R26: la región, el rótulo, la pista, el importe tal cual, sin insignia de signo y oculta con `null`. Ningún `Number(` ni `parseFloat` sobre el importe. |
| `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` (nueva) | Ningún archivo de `lib/` ni de `app/` llama a `cobroPlataformaMovimiento.create`, `createMany`, `update`, `updateMany`, `upsert`, `delete` ni `deleteMany`, ni escribe `INSERT INTO "cobro_plataforma_movimiento"`. Lleva contraprueba sintética. |
| Guardias de SL-17 que cambian | `organizacion-en-modelos` (clasificación), `rls-por-empresa` (73 → 74 tablas), `fk-misma-empresa` (sus triggers), `plataforma-solo-en-lista` (la excepción nueva). Cubren R28. |
| `tests/integration/db/migracion-sl40-ida-y-vuelta.test.ts` | R29. |

**No regresión (R27):** `tests/integration/db/libro-kardex-468.test.ts`,
`tests/components/descarga/WalletDescarga.test.tsx` y los diez archivos con `DELETE FROM orden`
siguen en verde sin tocarlos.

## 12. Alternativas descartadas

1. **Conteo al vuelo** (B de §2.1). Es lo más simple: sin tabla y sin trigger.
   - Reprecia hacia atrás cada vez que cambia la tarifa.
   - No sabe qué tarifa tenía cada orden cuando la empresa tenía una excepción que luego se quitó.
   - Mueve las cifras de períodos ya pasados cuando se anula una orden.

   Queda como la alternativa de P1, por si Carlos la elige.
2. **Escribir el cargo desde el código** (en `BulkOrdenService` y en los tres escritores de
   `deleted_at`).
   - Son cuatro puntos de enganche, más los que alguien añada.
   - Uno olvidado deja órdenes sin cargo y con la suite en verde (memoria «el composition root que no
     inyecta»).
   - Además, la tabla tendría que ser escribible por `servi_app`, y la empresa podría borrar su deuda.

   El trigger cubre todas las vías por construcción.
3. **Una tabla «una fila por orden» con `anulado_at` mutable.** Es más corta, pero:
   - recuperar una orden obliga a borrar `anulado_at`, y se pierde cuándo se anuló;
   - una anulación cambia una fila que ya contaba en un período pasado.

   El libro *append-only* con reverso es el patrón del repo (las anulaciones de 457, 459 y 461).
4. **Meter el cargo en `wallet_movimiento`**, con una categoría `egreso_cobro_plataforma`. La caja lo
   contaría como dinero que salió, y no salió nada (D10). Se movería la cifra principal, la ganancia y
   la barra, y cambiarían el libro y sus descargas (R22, R27).
5. **Una tabla única de tarifas con `organizacion_id` nulable** (`NULL` = global). Mezcla un dato de
   plataforma con uno por empresa en la misma tabla, y no encaja en ninguna de las tres listas de
   `modelos-de-negocio.ts`: ni es de negocio con `organizacion_id NOT NULL` ni es de plataforma sin
   columna. La columna en `organizacion` hereda el «solo lectura» que ya existe.
6. **Una pantalla nueva «Ajustes de plataforma».** Pasaría por `/design` y separaría la excepción de
   la empresa a la que pertenece. «Empresas» ya es la pantalla del superadmin, y SL-26 la ampliará.

## 13. Dependencias

Ninguna librería nueva. Se usan `zod`, `@prisma/client` (`Prisma.Decimal`) y los componentes de
`components/ui/` que ya están en el repo.

## 14. Choques con las ramas en vuelo

| Archivo | SL-38 | SL-39 | Cómo se resuelve |
|---|---|---|---|
| `db/schema.prisma` | sí | — | Modelos distintos. Quien mergea segundo rebasa. |
| Orden de migraciones | `20261023120000`, `20261023120100` | ninguna | Las de SL-40 van a partir de `20261023130000` (§4). |
| `lib/db/modelos-de-negocio.ts` | sí (su tabla nueva) | — | Una entrada cada una. El total pasa a 75 con las dos. |
| `tests/unit/guards/rls-por-empresa.guardia.test.ts` | sí | — | Conteo `73`: quien mergea segundo deja 75. |
| `scripts/verificar-rls-despliegue.ts` | sí (deriva los conteos de `MODELOS_DE_NEGOCIO.length`) | — | Si SL-38 está en `dev`, SL-40 no toca el archivo. Si no, sube los literales a mano (`POLITICAS_POR_EMPRESA`, `TRIGGERS_MISMA_EMPRESA` y `TRIGGERS_SIN_CAMBIO`). Se mira en T0. |
| `app/(app)/wallet/_components/wallet-labels.ts` | — | sí | T7 espera a SL-39 en `dev`. |
| `app/(app)/wallet/_components/CajaResumenCard.tsx` | — | sí | Ídem. |
| `tests/unit/components/wallet-labels.test.ts` | — | sí | Ídem. |
| `docs/ayuda/oficina/wallet-caja.md` | — | sí | Ídem. |
| `lib/repositories/OrdenRepository.ts`, `BulkOrdenService.ts` | sí | — | **SL-40 no los toca**: el trigger lo evita. |

## 15. Riesgos

- **SL-39 no mergea o cambia de forma.** T7 queda bloqueada, pero el resto de la ficha (tandas A–C)
  no depende de ella.
- **Funciones `SECURITY DEFINER`.**
  - Escriben como dueño, así que un error en ellas no lo frena la RLS.
  - Por eso: `search_path` fijo, `REVOKE EXECUTE … FROM PUBLIC`, la empresa tomada siempre de
    `NEW.organizacion_id` (que la RLS de `orden` ya validó) y el trigger de misma empresa de la tabla
    de cargos como segunda red.
- **Rendimiento de la carga masiva.** Por cada fila se hace un `INSERT` más y una lectura por clave
  primaria (`organizacion`) o de una fila única (`cobro_plataforma_tarifa`). T4 lo mide con una carga
  de 500 órdenes antes y después, y deja los números en `progress/impl_SL-40.md`.
- **Moneda con SL-21** (§7).
