# SLT-60 «Confirmación del pago a la plataforma por el superadmin» — design

> Requisitos: `requirements.md` (R1–R38). Escrito por `spec_author` el 2026-11-13, tras el corte en tres
> (SLT-142 y SLT-143 salen) y con el PR por encima del tope aceptado por el humano. Ajustado el mismo día
> con sus respuestas: la factura con total negativo (§3.1), el comprobante (§4.8) y los textos de la wallet
> (§6.4).
> - Hay una migración nueva, con su `down.sql`.
> - No hay dependencias nuevas: Prisma, zod, React y `components/ui/`.
> - Los importes del cliente van en céntimos `bigint` con `lib/planes/centimos.ts`, sin `Prisma.Decimal`
>   (decisión del humano del 2026-10-31).

## Lo que ya existe

Busqué el 2026-11-13 con los términos `confirmar pago`, `pago_plataforma`, `saldo de la factura`,
`aplicación`, `por confirmar`, `factura_plataforma` y `tope`, en los tres sitios. El grafo del worktree
respondió (`index_status`: ready).

- **El board** (`feature_list.json`):
  - SLT-131 «Planes: el superadmin marca pagada la factura de un ciclo»: cancelada, la absorbe esta ficha.
  - Las que salen de esta ficha: SLT-142 «Rechazo del pago a la plataforma y su estado en la wallet», SLT-143
    «El superadmin registra un pago hecho por fuera y anula un pago confirmado» y SLT-132 «Correos del pago a
    la plataforma».
  - SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro», en vuelo y de la misma persona:
    lee facturas, no saldos ni pagos.
  - SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora»: no pinta pagos.
  - Ninguna otra ficha confirma pagos ni guarda el saldo de una factura.
- **`specs/`:** SL-45 (el pago y su tope), SLT-118 (las facturas y la deuda con cuotas) y SLT-119 (su
  design, leído en su worktree). Ningún spec guarda aplicaciones de pagos a facturas.
- **El código:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| El pago es un `egreso_pago_plataforma` con `origen_tipo = gasto` en `wallet_movimiento`. Es append-only: `REVOKE UPDATE, DELETE` a `servi_app` (migración `20261024140000`) | `lib/services/WalletEgresoService.ts`, la guardia `pago-plataforma-inmutable-sl45` | **Se reutiliza sin cambios.** El estado del pago no puede ser una columna del libro (§1) |
| El trigger del tope `wallet_movimiento_tope_pago_plataforma`, con el candado `pg_advisory_xact_lock(hashtext('pago_plataforma:' \|\| org))`. Su cuerpo vigente es el de SLT-118 | `db/migrations/20261111130100_factura_plataforma/migration.sql` §9 | **Se reescribe** con lo disponible para registrar (§3.3). El candado y la clave de idempotencia no cambian |
| `TopePagoPlataformaService.comprobar`, con el candado, el reenvío, la deuda y la comparación | `lib/services/TopePagoPlataformaService.ts` | Cambia la lectura: lo disponible, de la función de la base (§4.2) |
| `PagoPlataformaRepository`: `sumaPagosVigentes`, `claveYaRegistrada` y `bloquear` | `lib/repositories/PagoPlataformaRepository.ts` | `sumaPagosVigentes` pasa a `sumaPagosConfirmados`, y se suma `disponibleParaRegistrar` (§4.1) |
| `derivarDeudaPlataforma(sumas, pagos)` y `DeudaPlataformaService` | `lib/utils/deuda-plataforma.ts`, `lib/services/DeudaPlataformaService.ts` | La fórmula no cambia; cambia qué pagos le llegan (R7) |
| `EmpresasPlataformaRepository.cuentasConLaPlataforma` (cargos, cuotas y pagos por empresa) | `lib/repositories/EmpresasPlataformaRepository.ts` | Los pagos pasan a ser los confirmados, y se suma el contador (R8, R27) |
| `EgresoCajaAnulacionService.anular`, que anula todo egreso con origen `gasto` | `lib/services/EgresoCajaAnulacionService.ts` | Traduce el rechazo de la base a `forbidden` (R10) |
| `factura_plataforma`, con `total`, `numero`, `desde_at` y `hasta_at`, y la cerrada inmutable (`SL118`) | migración `20261111130100` | **Se lee, no se escribe** (R16). El saldo vive aparte (§2, §3.1) |
| `FacturaPlataformaRepository.cerrar` llama a una función del dueño en `comoPlataforma` y está en `EXCEPCIONES_DE_PLATAFORMA` | `lib/repositories/FacturaPlataformaRepository.ts`, `lib/db/excepciones-aislamiento.ts` | **Es el molde** del repositorio nuevo (§4.3) |
| `traducirErrorDeTope`: un SQLSTATE propio con JSON en `MESSAGE` | `lib/planes/tope-error.ts` | **Es el molde** de los errores `SL060` (§3.6) |
| `aCentimos`, `aCentimosConSigno` y `aTexto` | `lib/planes/centimos.ts` | **Se reutilizan** en la propuesta del reparto, que corre en el cliente (§5) |
| El comprobante lateral de la caja (458-B): `WalletComprobanteRepository.lateralDe({ caja })`, `SupabaseSignedUrlProvider`, `walletComprobanteConfig`; y la firma desde la plataforma con `conEmpresa` en `ReportesBugPlataformaService` | `lib/repositories/WalletComprobanteRepository.ts`, `lib/storage/`, `lib/config/wallet-comprobante.ts`, `lib/services/ReportesBugPlataformaService.ts` | **Se reutilizan** para que el superadmin abra el comprobante (§4.8, R32–R34) |
| `money()`, `fechaCortaEnZona` y `ZONA_CR`; `Dialog`, `Table` e `Input` | `lib/config/moneda.ts`, `lib/utils/fecha-corta.ts`, `lib/utils/fecha-cr.ts`, `components/ui/` | El formato y el diálogo del reparto |
| El detalle de empresa, con lecturas aisladas (`leerPlan`) | `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` | Mismo molde para la sección nueva (R13) |

No se re-crea nada de lo anterior.

### Cruce con SLT-119

SLT-119 «Planes: pantallas de facturas para el superadmin y el maestro» toca dos archivos que esta ficha
también toca:
- `app/(app)/plataforma/empresas/[organizacionId]/page.tsx`: la envuelve en las pestañas «Empresa» y
  «Facturación»;
- `lib/modulos/reparto.ts`: una entrada más en `MODULO_POR_ACTION`.

**Rebasa quien mergee segundo.** Para que el rebase sea trivial:
- la sección «Pagos por confirmar» va **fuera de las pestañas**, justo después de «Volver a Empresas» (§6.2);
- en `reparto.ts` es una línea independiente.

Esta ficha **no** toca los archivos de SLT-119: `FacturaPlataformaRepository`, su interfaz,
`lib/types/factura-plataforma.ts` y `components/shared/facturas/`. Por eso el saldo vive en un repositorio
y unos tipos propios (§2).

## 1. Modelo de datos

El libro es append-only (`REVOKE UPDATE` de SL-45) y la factura cerrada es inmutable (`SL118`). Por eso ni
el estado del pago ni el saldo de la factura pueden ser columnas de esas tablas. Van en dos tablas nuevas, las
dos **de negocio**:

```
pago_plataforma_confirmacion                         pago_plataforma_aplicacion
  id               text PK (uuid)                      id               text PK (uuid)
  organizacion_id  text NOT NULL FK organizacion       organizacion_id  text NOT NULL FK organizacion
  pago_id          text NOT NULL FK wallet_movimiento  confirmacion_id  text NOT NULL FK pago_plataforma_confirmacion
  confirmado_por   text NOT NULL FK usuario            factura_id       text NOT NULL FK factura_plataforma
  confirmado_at    timestamp(3) NOT NULL               monto            numeric(14,2) NOT NULL CHECK (monto > 0)
  UNIQUE (organizacion_id, pago_id)                    UNIQUE (organizacion_id, confirmacion_id, factura_id)
                                                       INDEX (organizacion_id, factura_id)
```

- **Estados del pago.** Todos se derivan, no se guardan:
  - **confirmado**: tiene una fila en `pago_plataforma_confirmacion`;
  - **anulado**: tiene su contra-asiento (`ingreso_ajuste`, `origen_tipo = gasto`, `origen_id` = el pago);
  - **por confirmar**: ni lo uno ni lo otro.

  Las dos condiciones se excluyen (§3.4, §3.5).
- **Únicos por empresa**, con `organizacion_id` primero. La guardia `unicos-por-empresa` no pide tocar
  `_unicos-sin-empresa.ts`.
- **RLS:** las políticas `pago_plataforma_confirmacion_por_empresa` y `pago_plataforma_aplicacion_por_empresa`
  (molde `factura_plataforma_por_empresa`), y `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` (R25). La
  empresa solo lee lo suyo; SLT-142 lo pintará en la wallet.
- **Triggers:**
  - `*_sin_cambio_de_empresa` de SL-17, en las dos tablas;
  - `*_inmutable`, `BEFORE UPDATE`, que rechaza con `SL060` para cualquier rol, el dueño incluido (R26). El
    `DELETE` lo cierra el `REVOKE` para la app; el dueño solo borra en las limpiezas de los tests y en
    cascada desde `organizacion`.
- **Las cuatro FK entre tablas de negocio** llevan su trigger de misma empresa: `pago_id`, `confirmado_por`,
  `confirmacion_id` y `factura_id`. Se generan con
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`, y `TRIGGERS_MISMA_EMPRESA` pasa de 175 a
  179 en `scripts/verificar-rls-despliegue.ts`.
  - `confirmado_por` apunta al **superadmin**, cuyo `usuario.organizacion_id` es `NULL`. Según SLT-143, el
    trigger de `20261022130300` deja pasar un usuario sin empresa. **T0 lo comprueba.** Si no lo deja,
    `confirmado_por` va sin FK y con un `CHECK` de no vacío, y se anota en `progress/impl_SLT-60.md`.
- **Cómo se borran:** las FK van `ON DELETE CASCADE` desde `organizacion`, como `factura_plataforma`. Las FK
  a `wallet_movimiento` y a `factura_plataforma` van sin acción, así que en el borrado en cascada de una
  empresa se comprueban al final de la sentencia. T0 confirma que las limpiezas de los tests que borran la
  empresa siguen pasando.
- **Prisma:** los modelos `PagoPlataformaConfirmacion` y `PagoPlataformaAplicacion`, con sus relaciones
  inversas en `Organizacion`, `WalletMovimiento`, `Usuario` y `FacturaPlataforma`. Los dos entran en
  `MODELOS_DE_NEGOCIO` (`lib/db/modelos-de-negocio.ts`). La guardia `rls-por-empresa` pasa de 90 a 92 tablas.
- **Módulo:** ninguno. Wallet y Plataforma > Empresas son núcleo; la action nueva es `nucleo` en
  `lib/modulos/reparto.ts`.

## 2. Dónde vive el saldo (cierra la pregunta abierta)

**En la base, con una sola definición.** La usan los tres que la necesitan:

| Quién | Para qué | Cómo |
|---|---|---|
| El trigger del tope | R2–R5 | `pago_plataforma_disponible_de(org)` |
| La función de confirmar | R15, R17 | `factura_plataforma_saldos(org)` |
| La lectura del superadmin | R14 | `PagoPlataformaConfirmacionRepository.leer(org)` llama a `factura_plataforma_saldos(org)` |
| `TopePagoPlataformaService` | R2, R3 | `pago_plataforma_disponible(org)`, con control de empresa (§3.2) |

El repositorio y los tipos son nuevos y de esta ficha (`lib/repositories/PagoPlataformaConfirmacionRepository.ts`,
`lib/types/pago-plataforma.ts`). `FacturaPlataformaRepository` no se toca: es de SLT-119. Si SLT-119 o
SLT-121 quieren pintar el saldo, llaman a la misma función.

## 3. La base (migración `20261116120000_pago_plataforma_confirmacion`)

Todas las funciones son del dueño (`SECURITY DEFINER`), con `search_path = public, pg_temp` y `EXECUTE`
revocado a `PUBLIC`. Solo `pago_plataforma_disponible` tiene `GRANT EXECUTE … TO servi_app`.

### 3.1 `factura_plataforma_saldos(p_org text)`

`STABLE`. Devuelve `TABLE(factura_id, numero, desde_at, hasta_at, total, aplicado, saldo)`:
- una fila por factura de `p_org` con `estado = 'cerrada'`, en orden de `desde_at` ascendente;
- `aplicado` = Σ `pago_plataforma_aplicacion.monto` de esa factura (0 sin aplicaciones);
- `saldo` = `total − aplicado`, **con signo**.

Una cerrada con total negativo sale con saldo negativo (decisión del humano del 2026-11-13, R31):
- en lo disponible cuenta con su signo, como saldo a favor, igual que en la deuda, que ya suma los reversos
  con su signo. Con cerradas de 200 000 y −30 000, lo disponible es 170 000;
- nunca recibe aplicaciones (§3.4).

### 3.2 Lo disponible para registrar

- `pago_plataforma_por_confirmar(p_org text)`, `STABLE`, devuelve
  `TABLE(id, monto, fecha_movimiento, descripcion, registrado_por, created_at)`. Son los
  `egreso_pago_plataforma` de `p_org` **sin** contra-asiento y **sin** confirmación. Es la única definición
  de «por confirmar»: la usan lo disponible, la lectura y el contador.
- `pago_plataforma_disponible_de(p_org text) RETURNS numeric(14,2)` =
  Σ `saldo` de `factura_plataforma_saldos(p_org)` − Σ `monto` de `pago_plataforma_por_confirmar(p_org)`.
  Sin facturas cerradas da `0 − Σ por confirmar`, que es ≤ 0 (R3).
- `pago_plataforma_disponible(p_org text)` es la envoltura para `servi_app`. Si `p_org` no es
  `current_setting('app.organizacion_id', true)`, lanza `42501`, como `plan_de_la_empresa`. Si lo es, llama
  a `_de`.

### 3.3 El tope del registro (R2–R5)

`CREATE OR REPLACE FUNCTION wallet_movimiento_tope_pago_plataforma()`. El cuerpo es literal salvo el cálculo:
1. el candado por empresa y la salida por clave repetida, tal cual (SL-45 R10, R11);
2. `v_disponible := pago_plataforma_disponible_de(NEW.organizacion_id)`. La fila nueva aún no está insertada,
   así que no se cuenta a sí misma;
3. `IF v_disponible <= 0 OR NEW.monto > v_disponible THEN RAISE … CONSTRAINT = 'wallet_movimiento_tope_pago_plataforma'`,
   con el mismo `ERRCODE` (`check_violation`), para que el mapeo de errores de hoy no cambie.

El trigger corre para todos los roles: el `INSERT` a mano también choca (R4). Dos registros a la vez se
serializan en el candado y el segundo lee lo disponible con el primero ya contado (R5).

### 3.4 `pago_plataforma_confirmar(p_org text, p_pago_id text, p_aplicaciones jsonb, p_por text, p_ahora timestamp) RETURNS text`

Devuelve `'ok'` o `'ya_confirmado'`. En una sola transacción:
1. `pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org))`, el **mismo** candado del tope y del
   bloqueo de la anulación (§3.5). Serializa la confirmación contra el registro, contra la anulación y contra
   otra confirmación (R19, R21).
2. Lee el pago: `id = p_pago_id`, `organizacion_id = p_org`, `tipo = 'egreso'` y
   `categoria = 'egreso_pago_plataforma'`.
   - Si no existe, o tiene contra-asiento: `SL060 {"codigo":"pago_no_encontrado"}` (R20).
   - Si ya tiene confirmación: devuelve `'ya_confirmado'` sin escribir (R19).
3. Valida `p_aplicaciones`, un arreglo de `{factura_id, monto}`:
   - **cada factura**: es de `p_org`, aparece en `factura_plataforma_saldos(p_org)` (o sea, cerrada) y tiene
     saldo > 0. Si no: `factura_no_valida` con su `factura_id` (R15);
   - **cada monto**: es mayor que 0, sin repetir factura (`factura_repetida`) y no mayor que el saldo de su
     factura (`supera_saldo`, con su `factura_id`) (R17);
   - **la suma**: es exactamente el monto del pago (`suma_distinta`) (R17).
4. Inserta la confirmación (`confirmado_por = p_por`, `confirmado_at = p_ahora`) y una aplicación por
   elemento.

Los montos 0 los quita el servicio antes de llamar, y la función los rechaza como `monto_no_positivo`. La
función no toca `factura_plataforma`, `wallet_movimiento`, `cobro_plataforma_movimiento` ni sus trazas (R16).

### 3.5 La empresa no anula un pago confirmado (R10, R11, R21)

El trigger `pago_plataforma_no_anular_confirmado` es `BEFORE INSERT ON wallet_movimiento FOR EACH ROW`, con
`WHEN (NEW.categoria = 'ingreso_ajuste' AND NEW.origen_tipo = 'gasto')`. La función:
- toma el mismo candado de la empresa de la fila;
- si `NEW.origen_id` tiene confirmación, lanza `SL060 {"codigo":"pago_confirmado"}`.

Cubre la anulación de la pantalla (`EgresoCajaAnulacionService`), el `reversarEgreso` heredado y el SQL a
mano. Dentro de `anular`, la constancia de `ajuste_caja_anulacion` va antes del contra-asiento, en la misma
transacción, así que se revierte con él: no queda nada escrito (R10).

**Para SLT-143:** cuando el superadmin anule un confirmado, tendrá que retirar o condicionar este trigger.

### 3.6 Errores

`SQLSTATE 'SL060'` con un JSON en `MESSAGE` (`codigo` y, si aplica, `factura_id`), molde de
`SL024`/`traducirErrorDeTope`. El nuevo `lib/db/errores-pago-plataforma.ts` trae dos funciones:
- `traducirErrorDeConfirmacion(e)` devuelve `{ codigo, facturaId? } | null`;
- `esPagoConfirmadoError(e)` devuelve `boolean`.

### 3.7 Lo que no hace la migración (R28)

No inserta confirmaciones ni aplicaciones: los pagos que existan quedan por confirmar. En prod no hay pagos
(decisión del 2026-11-13), y la comprobación previa al deploy es la task T9.2. En `dev` y en las bases
desechables los pagos de prueba pasan a «por confirmar»: la deuda que ven sube en esos montos, y se acepta.

### 3.8 `down.sql`

En este orden:
1. `DROP` de los dos triggers nuevos de `wallet_movimiento`;
2. `DROP` de las tablas (con sus triggers de misma empresa, sin cambio de empresa e inmutable);
3. `DROP` de las funciones nuevas;
4. `CREATE OR REPLACE` de `wallet_movimiento_tope_pago_plataforma` con el cuerpo **literal** de
   `20261111130100` §9 (R29).

## 4. Backend

### 4.1 `PagoPlataformaRepository` (cambia) e `IPagoPlataformaRepository`

- `sumaPagosVigentes` **sale**: ya no la usa nadie.
- Entra `sumaPagosConfirmados(org, cliente?)`: `pagoPlataformaAplicacion.aggregate({ where: { organizacionId }, _sum: { monto } })`.
  Σ de las aplicaciones de una confirmación = monto del pago (§3.4), así que es la Σ de los pagos
  confirmados. Lleva el filtro escrito por empresa, como el método de hoy.
- Entra `disponibleParaRegistrar(org, tx)`: `` tx.$queryRaw`SELECT pago_plataforma_disponible(${org})::text AS d` ``.
- `bloquear` y `claveYaRegistrada` no cambian.
- `PagoPlataformaCliente` suma `"pagoPlataformaAplicacion" | "$queryRaw"`.
- La guardia `pago-plataforma-inmutable-sl45` cambia su control de no vacuidad de `sumaPagosVigentes` a
  `sumaPagosConfirmados`. El contrato sigue sin mutaciones.

### 4.2 `TopePagoPlataformaService` (cambia)

El constructor queda en `(pagos: IPagoPlataformaRepository)`, sin el repositorio de cargos. `comprobar`:
1. candado;
2. reenvío;
3. `disponible = await pagos.disponibleParaRegistrar(org, tx)`;
4. `"supera"` si `disponible <= 0` o `monto > disponible`, y si no `"cabe"`, con `Prisma.Decimal` (servidor).

Cambian con él `lib/actions/wallet-egresos.ts > buildService`, su test de composition root,
`scripts/demo-qa/receta.ts` y los dos tests de integración que construyen el tope. El mensaje del error cambia
(R36, §6.4).

### 4.3 `PagoPlataformaConfirmacionRepository` (nuevo) e `IPagoPlataformaConfirmacionRepository`

Corre en `comoPlataforma("SL-45", …)`: `FichaJira` no admite `SLT` (deuda D29) y SL-45 es la ficha del pago.
Tiene su entrada en `EXCEPCIONES_DE_PLATAFORMA`. Recibe el cliente por constructor.

```ts
leer(organizacionId: string): Promise<PagosDeEmpresa>;
  // pagos: pago_plataforma_por_confirmar(org) JOIN usuario (nombre de quien registró)
  //        + EXISTS en wallet_comprobante (caja_movimiento_id = el pago) → tieneComprobante; por created_at, id
  // facturas: factura_plataforma_saldos(org) WHERE saldo > 0, por desde_at
confirmar(input: ConfirmarPagoRepoInput): Promise<ConfirmarPagoRepoResult>;
  // SELECT pago_plataforma_confirmar(org, pago, jsonb, por, ahora); SL060 → resultado con traducirErrorDeConfirmacion
```

Ningún método escribe en `factura_plataforma` (la guardia `cobro-plataforma-solo-por-trigger` sigue en verde).

### 4.4 Tipos (`lib/types/pago-plataforma.ts`, nuevo)

```ts
export interface PagoPorConfirmarDTO { id: string; monto: string; fecha: Date; referencia: string | null; registradoPor: string | null; tieneComprobante: boolean }
export interface FacturaConSaldoDTO { id: string; numero: number; desde: Date; hasta: Date; total: string; saldo: string }
export interface PagosDeEmpresa { pagos: PagoPorConfirmarDTO[]; facturas: FacturaConSaldoDTO[] }

export const verPagosDeEmpresaSchema = z.object({ organizacionId: z.uuid() });
export const confirmarPagoSchema = z.object({
  organizacionId: z.uuid(),
  pagoId: z.uuid(),
  aplicaciones: z.array(z.object({ facturaId: z.uuid(), monto: importeSchema })).min(1), // importe: ^\d+(\.\d{1,2})?$
});

export type VerPagosDeEmpresaResult = { estado: "ok"; datos: PagosDeEmpresa } | { estado: "forbidden" }
  | { estado: "validation_error"; errores: Record<string, string> };
export type ConfirmarPagoResult = { estado: "ok" } | { estado: "ya_confirmado" } | { estado: "not_found" }
  | { estado: "forbidden" } | { estado: "validation_error"; errores: Record<string, string> };
export const TEXTOS_CONFIRMACION = { /* mensajes de cada código SL060, en un solo sitio */ };

export const verComprobantePagoSchema = z.object({ organizacionId: z.uuid(), pagoId: z.uuid() });
export type VerComprobantePagoResult = { estado: "ok"; url: string; contentType: string }
  | { estado: "sin_comprobante" } | { estado: "not_found" } | { estado: "forbidden" }
  | { estado: "validation_error"; errores: Record<string, string> };
```

`monto`, `total` y `saldo` van en texto con dos decimales (los `saldo` > 0 garantizan que no son negativos).

### 4.5 `PagoPlataformaConfirmacionService` (nuevo) e `IPagoPlataformaConfirmacionService`

| Método | Orden |
|---|---|
| `verDeEmpresa(actor, input)` | `esPlataforma(actor.rol)`, si no `forbidden` (R24) → zod → `repo.leer` |
| `confirmar(actor, input)` | `esPlataforma`, si no `forbidden` → zod → quitar los montos 0 → si no queda ninguno, `validation_error` → `repo.confirmar({ …, por: actor.usuarioId, ahora: this.ahora() })` → traducir |

Traducción de `confirmar`:
- `ok` → `ok`;
- `ya_confirmado` → `ya_confirmado`;
- `pago_no_encontrado` → `not_found`;
- `factura_no_valida`, `supera_saldo`, `factura_repetida`, `suma_distinta` y `monto_no_positivo` →
  `validation_error`. La clave de `errores` es `aplicaciones.<facturaId>` o `aplicaciones`, con el texto de
  `TEXTOS_CONFIRMACION`.

La regla de la suma y de los saldos la decide **la base**, no el servicio: entre la lectura y la confirmación
otra confirmación pudo cambiar los saldos. El reloj se inyecta por constructor.

### 4.6 La action (`lib/actions/pagos-plataforma.ts`, nueva, `"use server"`)

- `verPagosDeEmpresaAction(input)` y `confirmarPagoPlataformaAction(input)`, con `deps` para los tests.
  Molde: `lib/actions/planes.ts`.
- El actor sale de la sesión; sin sesión, `forbidden`.
- `construirPagoPlataformaConfirmacionService(prisma = getPrismaClient())` es el composition root, y
  `tests/unit/actions/pagos-plataforma.test.ts` comprueba que pasa el repositorio real.
- En `lib/modulos/reparto.ts`: `"pagos-plataforma": "nucleo"`.

### 4.7 Deuda, listado y anulación

- **`DeudaPlataformaService.verDeuda`:** llama a `sumaPagosConfirmados` en vez de `sumaPagosVigentes` (R7).
- **`EmpresasPlataformaRepository.cuentasConLaPlataforma`:**
  - los pagos pasan a un `pagoPlataformaAplicacion.groupBy({ by: ["organizacionId"], _sum: { monto } })`.
    Desaparecen el `findMany` de pagos y el de contra-asientos (R7, R8);
  - el contador sale de una consulta para todas las empresas:
    `` $queryRaw`SELECT i.id, (SELECT count(*) FROM pago_plataforma_por_confirmar(i.id))::int AS n FROM unnest(${ids}::text[]) AS i(id)` `` (R27);
  - `EmpresasPlataformaPrismaClient` suma `"pagoPlataformaAplicacion"` y quita `"walletMovimiento"` si deja
    de usarse;
  - `EmpresaListada` gana `pagosPorConfirmar: number`, y el comentario de `pagadoPlataforma` pasa a «pagos
    confirmados».
- **`EgresoCajaAnulacionService.anular`:** en el `catch`, `esPagoConfirmadoError(e)` → `{ status: "forbidden" }`
  (R10). Su interfaz no cambia: `forbidden` ya es un resultado del servicio, y la pantalla ya lo pinta («No
  tenés permiso para anular este registro.»).

### 4.8 El comprobante del pago para el superadmin (R32–R34)

**Qué se reutiliza de SL-45.** El comprobante del pago es el lateral de la caja de la ficha 458-B: una fila
de `wallet_comprobante` con `caja_movimiento_id` = el pago, en el bucket privado
`walletComprobanteConfig.BUCKET`, guardado en `<organizacion_id>/<ruta>` (SL-19). Se reutiliza:
- `WalletComprobanteRepository.duenoDeLateral({ caja })` y `.lateralDe({ caja })`, para saber si el
  movimiento existe y leer `storagePath` y `contentType`;
- `SupabaseSignedUrlProvider` con ese bucket, que firma dentro de la carpeta de la empresa del contexto;
- `walletComprobanteConfig.SIGNED_URL_TTL_SECONDS`, la misma duración que en la wallet (R33).

**Qué no se reutiliza.** `WalletComprobanteService.ver` y `verComprobanteAction` no sirven tal cual:
- piden `esAccesoTotal`, que el superadmin no tiene;
- corren con la empresa de la sesión, y el superadmin no tiene empresa.

Abrirles la puerta al superadmin cambiaría la autorización de todos los comprobantes de la wallet. En su
lugar, el servicio de esta ficha gana un método con la autorización del superadmin y la empresa fijada en el
servidor. El molde es `ReportesBugPlataformaService`, que firma con `conEmpresa(organizacionId, …)` las
imágenes de un reporte.

```ts
// PagoPlataformaConfirmacionService
verComprobante(actor, input): Promise<VerComprobantePagoResult>
  // 1. esPlataforma(actor.rol), si no forbidden (R34), antes de leer
  // 2. zod (verComprobantePagoSchema)
  // 3. conEmpresa(input.organizacionId, async () => {
  //      pago = repo.pagoDeLaEmpresa(input.pagoId)   // egreso_pago_plataforma de esa empresa; si no, not_found
  //      objeto = comprobantes.lateralDe({ caja: pago.id }); si es null, sin_comprobante
  //      url = urls.createSignedUrl(objeto.storagePath, TTL)
  //    })
  // 4. { estado: "ok", url, contentType }. La ruta nunca sale (R33)
```

- **Dependencias por constructor:**
  - `Pick<IWalletComprobanteRepository, "lateralDe">`, construido con el cliente extendido: dentro de
    `conEmpresa` la extensión y la RLS acotan a esa empresa;
  - `ISignedUrlProvider`;
  - el TTL.

  El composition root de `lib/actions/pagos-plataforma.ts` los pasa reales, y su test lo comprueba.
- **Lectura del pago:** `pagoDeLaEmpresa(pagoId)` es un método nuevo de
  `IPagoPlataformaConfirmacionRepository`. Corre dentro de `conEmpresa`, **no** en `comoPlataforma`:
  `walletMovimiento.findFirst({ where: { id, tipo: "egreso", categoria: "egreso_pago_plataforma" } })`. Un
  pago de otra empresa no se ve: responde «no encontrado» (R34).
- **Se ofrece para todo pago listado.** El enlace se ofrece para todo pago por confirmar con
  `tieneComprobante`. También vale para un pago ya confirmado o anulado entre la lectura y el clic: el
  comprobante sigue siendo suyo.
- **La action** `verComprobantePagoPlataformaAction(input)` va en `lib/actions/pagos-plataforma.ts` y la
  página la liga con `organizacionId` en el servidor (`.bind`).
- **El cliente** abre la `url` en una pestaña nueva, como «Ver comprobante» de la wallet.
- **Guardias:** `storage-solo-por-adaptador` sigue en verde (se usa el adaptador) y `plataforma-solo-en-lista`
  no cambia (`conEmpresa` no es plataforma).

## 5. La propuesta del reparto (`lib/utils/reparto-pago-plataforma.ts`, nuevo, puro)

Sin `@prisma/client`: llega al cliente. Va en céntimos `bigint` con `lib/planes/centimos.ts`.

```ts
proponerReparto(monto: string, facturas: FacturaConSaldoDTO[]): Record<string, string>
  // de la más vieja a la más nueva: min(saldo, resto); las que no reciben nada, "0.00" (R14)
resumenDelReparto(monto: string, facturas: FacturaConSaldoDTO[], montos: Record<string, string>):
  { suma: string; falta: string; errores: Record<string, string>; valido: boolean }
  // formato, ≤ saldo y suma = monto: solo para la ayuda en pantalla (R17); quien decide es la base
```

Ejemplo de la decisión del 2026-11-11 (también es el caso del test):
- pago de 300 000;
- facturas 1–15 nov (saldo 200 000) y 16–30 nov (saldo 180 000);
- propuesta: 200 000 y 100 000. Tras confirmar, los saldos quedan en 0 (pagada) y 80 000.

## 6. Pantallas

### 6.1 `PagosPorConfirmar.tsx` (nuevo, `"use client"`)

Va en `app/(app)/plataforma/empresas/[organizacionId]/_components/`. Se usa en un solo sitio, así que no
va a `shared/`. Props:
- `datos: PagosDeEmpresa | null`, donde `null` significa que la lectura falló (R13);
- `organizacionId`;
- `confirmar: (input) => Promise<ConfirmarPagoResult>`.

- **Título** «Pagos por confirmar» y ayuda: «Pagos que la empresa registró en su wallet. Al confirmarlos se
  aplican a sus facturas cerradas y baja su deuda.»
- **Tabla:** fecha, monto, referencia, «Registrado por», comprobante y el botón «Confirmar…».
  - La columna del comprobante es un botón-enlace «Ver comprobante» si `tieneComprobante`, o «Sin
    comprobante» si no (R32).
  - El botón llama a la prop `verComprobante(pagoId)` y abre la `url` en una pestaña nueva.
  - Con `sin_comprobante`, `not_found` o un fallo, dice «No se pudo abrir el comprobante» en la fila (R33,
    R34).
  - El diálogo de confirmar repite el enlace junto al monto. Si está vacía: «No hay pagos
  por confirmar» (R12). Si `null`: «No se pudieron cargar los pagos por confirmar».
- **Diálogo «Confirmar pago de {monto}»:**
  - una fila por factura con saldo: «N.º {numero}», período (`fechaCortaEnZona`, con el último día =
    `hasta` − 1 ms), total, saldo y un `Input` «Aplicar», precargado con `proponerReparto` (R14);
  - pie: «Repartido {suma} de {monto}» y «Falta {falta}»;
  - los errores de `resumenDelReparto` van bajo cada fila;
  - «Confirmar pago» se deshabilita mientras `valido` es falso.
  - Sin facturas con saldo, el diálogo dice «La empresa no tiene facturas cerradas con saldo» y no ofrece
    confirmar.
- **Resultados:**
  - `ok`: cierra y llama a `router.refresh()` (R23);
  - `ya_confirmado`: «Este pago ya estaba confirmado» y `refresh`;
  - `not_found`: «El pago ya no está por confirmar» y `refresh`;
  - `validation_error`: los errores bajo las filas, sin cerrar;
  - `forbidden` o un throw: «No se pudo confirmar ahora».
- **Importes** con `money()`. Ni `Number(` ni `parseFloat`.
- **Textos** en un `TEXTOS` del archivo, en forma impersonal: sin voseo ni tuteo.

### 6.2 El detalle de empresa (`page.tsx`)

- Se suma `leerPagos(actor, organizacionId)` al `Promise.all`, aislada como `leerPlan`: un throw o un estado
  distinto de `ok` da `null`.
- `<PagosPorConfirmar …>` va justo debajo del enlace «Volver a Empresas» y **antes** de `PlanEmpresa`.
- Con las pestañas de SLT-119 queda fuera de ellas, encima, como el enlace (§ Cruce con SLT-119).

### 6.3 Empresas (`EmpresasModule.tsx`)

`CeldaPlataforma` suma una tercera línea cuando `pagosPorConfirmar > 0`: «1 pago por confirmar» o «N pagos
por confirmar», con `data-pagos-por-confirmar` (R27). Los textos van en `TEXTOS_PLATAFORMA`.

### 6.4 Los textos de la wallet (R35–R38; decisión del 2026-11-13)

| Texto | Dónde vive | Tests que fijan el literal |
|---|---|---|
| La pista de «debe» (R35) | `app/(app)/wallet/_components/wallet-labels.ts > deudaPlataformaPista` | `tests/unit/components/wallet-labels.test.ts`, `tests/components/WalletDeudaPlataformaSL45.test.tsx`, `tests/components/WalletDeudaPlataformaSL40.test.tsx`, `tests/unit/asistente/contexto-sl45.test.ts`, `e2e/cobro-plataforma-sl40.spec.ts`, `e2e/pago-plataforma-sl45.spec.ts` |
| El mensaje del tope (R36) | `lib/types/cobro-plataforma.ts > MENSAJE_TOPE_PAGO_PLATAFORMA` | `tests/unit/services/wallet-egreso-service.test.ts`, `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`, `tests/unit/asistente/contexto-sl45.test.ts`, y los que ya cambian: `wallet-egresos.composition-root`, `pago-plataforma-sl45`, `-concurrencia` y el E2E de SL-45 |
| La frase del efecto (R37) | `app/(app)/wallet/_components/wallet-conceptos-manuales.ts` (la entrada `pago_plataforma` de `FRASE_DEL_EFECTO`) | `tests/unit/components/wallet-conceptos-manuales.test.ts`, `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`, `tests/components/WalletDeudaPlataformaSL45.test.tsx`, `e2e/pago-plataforma-sl45.spec.ts` |
| La ayuda (R38) | `docs/ayuda/oficina/wallet-caja.md`, sección «Lo que la empresa debe a la plataforma» (fila «Debe» de la tabla y los párrafos de «La deuda baja» y «No se puede pagar de más») | `tests/unit/asistente/contexto-sl45.test.ts`. Se actualiza `actualizado:` |

- **Cómo se ajustan los tests.** Cada uno pasa al literal nuevo **escrito a mano**, nunca leído de la
  constante: es la regla de SL-45 §12.3, «Literal: contrato o polizón».
- **La pista de «al día» y «a favor»** no habla de pagos, así que no cambia.
- **La ayuda** suma un párrafo «El pago queda por confirmar» con lo de R38. Cambia «No se puede pagar de
  más» por «Solo se pagan facturas cerradas», con el ejemplo de 380 000 cerradas y 200 000 por confirmar
  (180 000 disponibles) y el mensaje nuevo entre comillas, que es el que lee `contexto-sl45`.

## 7. Autorización, módulo y país

| Operación | Quién | Dónde se decide | R |
|---|---|---|---|
| Registrar un pago | `maestro`, `admin` | `WalletEgresoService` (SL-45, sin cambios) | R1 |
| Anular un pago por confirmar | `maestro`, `admin` | `EgresoCajaAnulacionService` (SL-45) | R9 |
| Anular un confirmado | nadie desde la empresa | trigger §3.5 y `forbidden` en el servicio | R10, R11 |
| Ver y confirmar | superadmin | `PagoPlataformaConfirmacionService` antes del repositorio; la página ya da `notFound()` a otro rol | R24 |
| Ver el comprobante desde Plataforma | superadmin | `PagoPlataformaConfirmacionService.verComprobante`, antes de leer; firma con `conEmpresa` de la empresa del detalle | R34 |
| Escribir confirmaciones | solo la función del dueño | `REVOKE` a `servi_app` | R25 |

- **Moneda:** la de la app (`money()`), sin conversión (SL-21).
- **Fechas:** `ZONA_CR` para pintar los períodos, como SLT-119, hasta SLT-90. Ningún literal nuevo de zona.
- **Impuestos y métodos de pago:** ninguno.

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/pago-plataforma-confirmacion.test.ts` (**nuevo**) | R1–R7, R9–R11, R15–R22, R25, R26 | Base real, empresas A y B, facturas cerradas con el fixture nuevo. Pasos en la tabla de abajo |
| `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` (**nuevo**) | R28, R29 | Aplica la migración con un pago previo: 0 confirmaciones, el pago queda por confirmar. El `down` borra tablas y funciones, y la definición del tope vuelve a ser la de SLT-118 (`pg_get_functiondef`) |
| `tests/integration/db/_fixtures/factura-cerrada.ts` (**nuevo**) | — | `cerrarFacturaEnCurso(base, org)`: como dueño, `factura_plataforma_cerrar(org, fin_natural_at + 6 min)`, el artificio de SLT-119 §9. Lo usan el test nuevo y los que se ponen al día |
| `tests/unit/utils/reparto-pago-plataforma.test.ts` (**nuevo**) | R14, R17 | Ejemplo de §5; un saldo exacto; montos con 1 y 2 decimales; ni `Number` ni `parseFloat` (lectura del fuente) |
| `tests/unit/services/pago-plataforma-confirmacion-service.test.ts` (**nuevo**) | R17, R19, R20, R24, R33, R34 | Repositorio doble: `forbidden` sin llamadas (maestro, admin, sin sesión); `validation_error` del zod sin llamadas; montos 0 quitados; traducción de cada código. **Comprobante:** `forbidden` sin llamadas; `not_found` sin firmar si el pago no es de la empresa; `sin_comprobante` sin firmar; `ok` firma con el TTL de la wallet dentro de `conEmpresa` de la empresa pedida (se espía el contexto), y la respuesta no lleva `storagePath` |
| `tests/unit/actions/pagos-plataforma.test.ts` (**nuevo**) | R24 | Actor de la sesión; el composition root pasa el repositorio real |
| `tests/components/PagosPorConfirmar.test.tsx` (**nuevo**) | R12–R14, R17, R23, R32, R33 | Vacío, `null`, la propuesta precargada, el botón deshabilitado si la suma no cuadra, `refresh` tras `ok`, errores bajo la fila; «Ver comprobante» con `tieneComprobante` y «Sin comprobante» sin él; un fallo de `verComprobante` dice «No se pudo abrir el comprobante» |
| Los tests de los textos de la wallet (§6.4) (se ajustan) | R35–R38 | El literal nuevo escrito a mano en cada uno |
| `tests/integration/plataforma-empresa-detalle-page.test.tsx` (se amplía) | R12, R13 | La sección aparece; si su lectura falla, plan y módulos se pintan |
| `tests/components/empresas-module.test.tsx` (se amplía) | R27 | 0, 1 y 3 |
| `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts` (se ajusta) | R7, R8, R27 | Factura cerrada sembrada; «Pagado» y la deuda cuentan solo los confirmados; el contador |
| `tests/unit/services/wallet-anulacion-service.test.ts` (se amplía) | R10 | Si el repositorio lanza el error `SL060 pago_confirmado`, el resultado es `forbidden` |
| `tests/unit/services/tope-pago-plataforma-service.test.ts` (se reescribe) | R2, R3 | Con `disponibleParaRegistrar`: borde exacto, 0, negativo y el reenvío sin leer |
| `tests/unit/services/deuda-plataforma-service.test.ts` (se ajusta) | R7 | Llama a `sumaPagosConfirmados` |
| `e2e/pago-plataforma-confirmacion.spec.ts` (**nuevo**, proyecto `dinero`) | R30 | §9 |
| Guardias | R25 | `rls-por-empresa` (92), `pago-plataforma-inmutable-sl45` (nombre del método); `fk-misma-empresa`, `unicos-por-empresa`, `organizacion-en-modelos` y `cobro-plataforma-solo-por-trigger` deben seguir en verde sin tocarse |

**Pasos del test de integración** (montos en colones; deuda = cargos + cuotas − confirmados):

| Paso | Disponible de A | Deuda de A | Resultado |
|---|---|---|---|
| A con órdenes por 380 000, sin cerrar | 0 | 380 000 | Pagar 1 → `validation_error` en `monto`; 0 filas nuevas (R3) |
| Se cierra la factura (380 000) | 380 000 | 380 000 | — |
| A paga 200 000 | 180 000 | 380 000 | `ok`; la caja −200 000 (R1, R6) |
| A intenta 180 000,01 | 180 000 | 380 000 | `validation_error` (R2); como `servi_app` a mano → `check_violation` (R4) |
| Dos pagos simultáneos de 100 000 | 180 000 → 80 000 | 380 000 | Uno `ok` y otro `validation_error` (R5) |
| Superadmin confirma los 200 000 contra la factura | 80 000 | 180 000 | `ok`; saldo 180 000; caja igual; factura sin cambios (R16, R22) |
| Confirmar otra vez | — | — | `ya_confirmado`, sin filas (R19) |
| A anula el pago confirmado | 80 000 | 180 000 | `forbidden`; 0 constancias y 0 contra-asientos (R10); el `INSERT` a mano del contra-asiento → `SL060` (R11) |
| A anula el de 100 000 (por confirmar) | 180 000 | 180 000 | `ok`; la caja +100 000 (R9) |
| Confirmar el anulado | — | — | `not_found` (R20) |
| Reparto inválido: suma corta, sobre saldo, factura en curso, factura de B, repetida | — | — | `validation_error` con su clave, 0 filas (R15, R17) |
| Anular y confirmar a la vez el mismo pago | — | — | Gana exactamente uno (R21) |
| B lee las tablas nuevas | — | — | Solo lo suyo; `INSERT`/`UPDATE`/`DELETE` → `42501` (R25); `UPDATE` como dueño → `SL060` (R26) |
| Pago que deja el saldo en 0 | — | — | La factura sale de `leer` (R18) |
| Empresa C con dos cerradas: 200 000 y −30 000 (la segunda con solo un reverso, sin cuota) | 170 000 | — | Pagar 170 000,01 → `validation_error`; 170 000 → `ok`; `leer` ofrece solo la de 200 000, y confirmar contra la de −30 000 → `factura_no_valida` (R31) |
| `leer` de un pago con comprobante (fila en `wallet_comprobante`, sin subir a Storage) y de uno sin él | — | — | `tieneComprobante` verdadero y falso; `pagoDeLaEmpresa` dentro de `conEmpresa(B)` no ve el pago de A (R32, R34) |

**Control de no vacuidad:** antes de afirmar, la factura está cerrada (leída con el cliente base) y las
funciones existen en `pg_proc`. Un `skip` por falta de base no cuenta como verde.

**Mutaciones que deben matarlo**, una a la vez:
1. el trigger del tope sin restar los por confirmar;
2. `sumaPagosConfirmados` que suma todos los pagos vigentes;
3. la función de confirmar sin el candado;
4. sin el trigger de §3.5.

### 8.1 Puesta al día de los tests que pagan sin factura cerrada

Hoy registran un pago con deuda solo de cargos. Con R3 todos fallan. Cada uno siembra una factura cerrada con
el fixture (los E2E, con la misma llamada SQL en línea) y, donde afirma que la deuda baja al pagar, pasa a
afirmar que baja **al confirmar**. Lo hace con `pago_plataforma_confirmar` como dueño o con el servicio.

| Archivo | Qué cambia |
|---|---|
| `tests/integration/db/pago-plataforma-sl45.test.ts` | Siembra y confirma antes de afirmar la deuda; la tabla de §3 de SL-45 se reescribe con el paso «confirmar» |
| `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts` | Siembra; el tope compara con lo disponible; el constructor del tope |
| `tests/integration/db/pago-plataforma-sl45-blindaje.test.ts` | Siembra; el caso m3 pasa a `sumaPagosConfirmados` |
| `tests/integration/db/factura-plataforma-deuda.test.ts` | El tope ya no es la deuda: pasa a lo disponible; el constructor del tope |
| `tests/integration/db/descarga-pago-plataforma-sl45.test.ts` | Siembra |
| `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts` | Siembra antes del `INSERT` del pago |
| `tests/unit/actions/wallet-egresos.composition-root.test.ts` | El tope con un solo repositorio |
| `tests/unit/actions/empresas-plataforma.composition-root.test.ts` | El doble del cliente suma `pagoPlataformaAplicacion` y `$queryRaw` |
| `e2e/pago-plataforma-sl45.spec.ts` | Siembra; tras pagar, la región **no** baja; el resto de pasos con lo disponible |
| `scripts/demo-qa/receta.ts` | Cierra la factura de la demo antes de pagar (si la demo no la tiene ya: T0) |

## 9. E2E (`e2e/pago-plataforma-confirmacion.spec.ts`, R30)

Serial, en el proyecto `dinero` de `playwright.config.ts`. Usa `_dos-empresas-fixture.ts`,
`_superadmin-fixture.ts` y `_planes-fixture.ts` solo importándolos.

1. **Datos (dueño):** empresa con `maestro`, dos órdenes con cargo y `factura_plataforma_cerrar` de su
   factura en curso. El total sale de la fila de la base, no se escribe a mano.
2. **Maestro:** paga el total menos 100 desde la wallet, **con un comprobante** (PNG pequeño); la región de
   la deuda **no** cambia y su pista es la de R35. Intenta pagar 101 y ve bajo el monto el mensaje de R36.
3. **Superadmin:** en Empresas, la fila dice «1 pago por confirmar». En el detalle, el pago trae «Ver
   comprobante»; al pulsarlo se abre una pestaña cuya URL responde 200 con el tipo del archivo (R33).
   «Confirmar…» trae la propuesta con todo el pago en la factura; confirma y el pago desaparece de la
   sección.
4. **Maestro:** la región baja en el monto pagado. «Anular…» del pago responde «No tenés permiso para anular
   este registro.».

Se corren además `e2e/pago-plataforma-sl45.spec.ts`, `e2e/wallet.spec.ts`, `e2e/dos-empresas-humo.spec.ts` y
el grupo `dinero` entero (`docs/perfil-agentes.md`).

## 10. Alternativas descartadas

1. **El saldo como columna de `factura_plataforma`, actualizada al confirmar.**
   - Obliga a abrir la factura cerrada al `UPDATE`, que es justo lo que el trigger `SL118` prohíbe.
   - Es una cifra derivada guardada dos veces: aplicaciones y saldo pueden divergir.
   - Toca la tabla de SLT-118 y choca con SLT-119.

   La función §3.1 calcula el saldo de las aplicaciones, que son la única verdad.
2. **El estado del pago como columna de `wallet_movimiento`** (`estado_pago_plataforma`). Rompe el libro
   append-only de SL-45 (`REVOKE UPDATE`, R17 de SL-45) y obliga a dar `UPDATE` a alguien sobre la tabla de
   la caja.
3. **Calcular el saldo y lo disponible en TS**, en `FacturaPlataformaRepository` y en el servicio del tope.
   - Serían dos definiciones (la del trigger y la de la app) que pueden divergir.
   - Toca los archivos de SLT-119.
4. **Una sola tabla de aplicaciones**, con `confirmado_por` y `confirmado_at` repetidos en cada fila y «confirmado = tiene
   aplicaciones».
   - Ahorra un modelo, pero repite el actor y el instante en cada fila.
   - SLT-142 y SLT-143 necesitan una fila por pago donde colgar el rechazo y la anulación del confirmado.
5. **Un motivo nuevo `pago_confirmado` en `MotivoNoAnulable`**, con su texto propio.
   - Toca `lib/types/wallet-tienda.ts`, `lib/types/wallet-anulacion.ts`, el normalizador de
     `lib/actions/wallet-anulacion.ts`, dos `Record` de textos y sus tests: unos 6 archivos.
   - Todo para un texto que `forbidden` ya dice bien: «una vez confirmado, solo lo toca el superadmin».

   Si SLT-142 rehace los textos del pago en la wallet, puede retomarlo.
6. **Abrir `WalletComprobanteService.ver` al superadmin** (§4.8), con `esPlataforma` en su puerta y una
   empresa pasada desde fuera.
   - Toca la autorización de todos los comprobantes de la wallet, de todos sus caminos, y su clasificador
     (`WalletAnulacionService`), que corre con la empresa de la sesión.
   - Su `ver` además pide la zona del país para el rótulo, que la plataforma no necesita.

   Un método propio, que reutiliza el repositorio y el adaptador de firma, deja intacto lo de la empresa.
7. **Validar el reparto solo en el servicio.** Entre la lectura y la confirmación otra confirmación puede
   bajar el saldo. Solo la función, bajo el candado de la empresa, ve el saldo de verdad.

## 11. Riesgos

- **Tamaño:** 67 rutas en `## Archivos esperados`. El humano aceptó un solo PR con todas («~61»; decisión
  del 2026-11-13). Son 55 del spec inicial y 12 de los textos de la wallet (§6.4: 4 de producción y docs, y
  8 tests). El comprobante no suma archivos: cabe en el servicio, el repositorio, la action, los tipos y el
  componente que ya estaban. El gate avisará por tamaño; no se parte.
- **El trigger de misma empresa con el superadmin** (`confirmado_por`): T0 lo comprueba (§1).
- **La demo:** si la receta no cierra ninguna factura antes de pagar, `demo-qa.test.ts` cae. T0 lo mira y
  T9.3 lo arregla.
- **Rebase con SLT-119** en `page.tsx` y `reparto.ts` (§ Cruce).
- **SLT-143** tendrá que levantar el bloqueo §3.5 para el superadmin.
