# SLT-143 «El superadmin registra un pago hecho por fuera y anula un pago confirmado» — design

> Requisitos: `requirements.md` (R1–R36; R36 se añadió el 2026-11-19 por una decisión del humano, §5.1). Escrito por `spec_author` el 2026-11-19, con P0–P7 respondidas por el
> humano ese mismo día. Hay un solo PR, por encima del tope, aceptado por el humano.
> - Hay una migración nueva, con su `down.sql`, y una tabla nueva de negocio.
> - No hay dependencias nuevas: Prisma, zod, React y `components/ui/`.
> - Los importes del cliente van en céntimos `bigint` con `lib/planes/centimos.ts`, sin `Prisma.Decimal`
>   (decisión del humano del 2026-10-31, como en SLT-60).

## Lo que ya existe

Busqué el 2026-11-19 con los términos `por fuera`, `pago confirmado`, `anular confirmado`,
`egreso_pago_plataforma`, `pago_plataforma_confirmar` y `pago_plataforma_no_anular_confirmado`, en los tres
sitios. El grafo **no** tenía indexado este worktree (`index_status`: project not found), así que exploré con
Grep y Read.

- **El board** (`feature_list.json`):
  - solo aparecen SLT-143 y la description de SLT-60 «Confirmación del pago a la plataforma por el superadmin»
    (done), que la anuncia;
  - SLT-142 «Rechazo del pago a la plataforma y su estado en la wallet» y SLT-132 «Correos del pago a la
    plataforma» están pending y no se pisan;
  - SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora» está pending y leerá el saldo de
    SLT-60.
- **`specs/`:** solo SLT-60, que la deja fuera y avisa (design §3.5 y §11) de que hay que levantar el bloqueo de
  la anulación para el superadmin.
- **El código:**

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| `factura_plataforma_saldos`, `pago_plataforma_por_confirmar`, `pago_plataforma_disponible_de`, `pago_plataforma_confirmar`, el tope `wallet_movimiento_tope_pago_plataforma` y el trigger `pago_plataforma_no_anular_confirmado` | `db/migrations/20261116120000_pago_plataforma_confirmacion/migration.sql` | **Se reutilizan.** Cambian tres cuerpos (§3.2, §3.5): el saldo sin los anulados, el reparto sacado a una función interna y el trigger con la excepción de la plataforma. El tope y `pago_plataforma_por_confirmar` no cambian |
| `PagoPlataformaConfirmacionRepository` (`comoPlataforma`, `leer`, `confirmar`, `pagoDeLaEmpresa`), su servicio, sus tipos, sus errores (`SL060`) y su action | `lib/repositories/`, `lib/services/`, `lib/types/pago-plataforma.ts`, `lib/db/errores-pago-plataforma.ts`, `lib/actions/pagos-plataforma.ts` | **Se amplían** con dos operaciones y una lectura. Su entrada en `EXCEPCIONES_DE_PLATAFORMA` cambia de motivo |
| `proponerReparto` y `resumenDelReparto` | `lib/utils/reparto-pago-plataforma.ts` | **Se reutilizan sin cambios** (R4, R5) |
| `PagosPorConfirmar.tsx`, con el diálogo del reparto (`DialogoConfirmar` y `FilaDeFactura`) | `app/(app)/plataforma/empresas/[organizacionId]/_components/` | La tabla del reparto **se saca** a `RepartoEntreFacturas.tsx` y la usan los dos diálogos (§6.1) |
| `registrarConComprobante`, `buildComprobantes` y `leerComprobanteOpcional` (molde 458-B) | `lib/services/registro-con-comprobante.ts`, `lib/actions/_shared/comprobante-lateral.ts` | **Se reutilizan** para el comprobante opcional (R8, R9) |
| `construirReglasPaisEmpresa` y `instanteDelMovimientoManual` (la fecha de un egreso manual en la zona del país) | `lib/services/ReglasPaisEmpresaService.ts`, `WalletEgresoService` | **Se reutilizan** para la fecha (R7) |
| `EgresoCajaAnulacionService`: constancia en `ajuste_caja_anulacion` y contra-asiento `ingreso_ajuste` con `origen_tipo = gasto` | `lib/services/EgresoCajaAnulacionService.ts` | **Es el molde** de la anulación de la plataforma, escrita en SQL (§3.4). Para la empresa no cambia (R15) |
| `LibroCajaAutoriaService.registro` y `textoRegistro`, que dan «Registró» en la tabla, el detalle y la descarga | `lib/services/LibroCajaAutoriaService.ts`, `components/shared/wallet/detalle-movimiento-panel-labels.ts` | **Se amplían** con la marca (§5) |
| `PagoPlataformaRepository.sumaPagosConfirmados` y `EmpresasPlataformaRepository.cuentasConLaPlataforma` | `lib/repositories/` | Un filtro más: sin los anulados (R26) |
| `verComprobantePagoPlataformaAction` | `lib/actions/pagos-plataforma.ts` | **Se reutiliza** para los pagos confirmados (R20) |

No se re-crea nada de lo anterior.

## 1. Modelo de datos

### 1.1 Tabla nueva: `pago_plataforma_anulacion` (de negocio)

```
pago_plataforma_anulacion
  id               text PK (uuid)
  organizacion_id  text NOT NULL FK organizacion ON DELETE CASCADE
  confirmacion_id  text NOT NULL FK pago_plataforma_confirmacion (sin acción)
  anulado_por      text NOT NULL FK usuario ON DELETE RESTRICT
  anulado_at       timestamp(3) NOT NULL
  UNIQUE (organizacion_id, confirmacion_id)
  INDEX (organizacion_id)
```

**Por qué una tabla, y no solo la constancia de SL-45.** El trigger `pago_plataforma_no_anular_confirmado` tiene que
distinguir al superadmin de la empresa **en la base** (R29), con cualquier rol. La constancia
`ajuste_caja_anulacion` la escribe `servi_app` (la anulación de la empresa), así que no prueba nada. Esta tabla solo
la escribe una función del dueño. Si existe su fila para la confirmación, el contra-asiento es de la plataforma.

- **El motivo** vive en la constancia `ajuste_caja_anulacion`, que se escribe en la misma operación: el libro de la
  wallet ya lo lee de ahí (R28). No se duplica.
- **Estados del pago**, todos derivados:
  - **por confirmar**, **confirmado** y **anulado** quedan como en SLT-60 §1;
  - un confirmado anulado tiene las dos cosas, su contra-asiento y su fila aquí;
  - **confirmado vigente** = tiene confirmación y no tiene fila aquí.
- **RLS:** la política `pago_plataforma_anulacion_por_empresa`, molde de las de SLT-60, y
  `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` (R32).
- **Triggers:**
  - `…_sin_cambio_de_empresa`;
  - `pago_plataforma_anulacion_inmutable`, con la función `pago_plataforma_inmutable()` de SLT-60, que ya es
    genérica (R32);
  - los dos de misma empresa, de `confirmacion_id` y `anulado_por`. Se generan con
    `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`. `anulado_por` es el superadmin
    (`organizacion_id` nulo): SLT-60 comprobó en su T0.1 que el trigger lo deja pasar.
  - `TRIGGERS_MISMA_EMPRESA` pasa de 179 a **181**, y la guardia `rls-por-empresa` pasa de 92 a **93** tablas.
- **Prisma:**
  - el modelo `PagoPlataformaAnulacion`, en `MODELOS_DE_NEGOCIO`;
  - en `PagoPlataformaConfirmacion`, la relación `anulacion PagoPlataformaAnulacion?`;
  - las relaciones inversas en `Organizacion` y `Usuario`.

### 1.2 Columna nueva: `pago_plataforma_confirmacion.por_fuera`

`boolean NOT NULL DEFAULT false`. Es `true` solo en la confirmación que nace del registro por fuera (§3.3), y es
de donde sale la marca (R13, R14).
- `ADD COLUMN` con `DEFAULT` no dispara el trigger `…_inmutable`, y las filas que ya existen quedan en `false` (R33).
- En Prisma es `porFuera Boolean @default(false) @map("por_fuera")`.

### 1.3 El pago por fuera en el libro

Es un `wallet_movimiento` igual que el de SL-45:
- `tipo = egreso`, `categoria = egreso_pago_plataforma`, `origen_tipo = gasto` y `origen_id = NULL`;
- `descripcion` = la referencia, como en SL-45, donde el campo se llama «Referencia del pago»;
- `registrado_por` = el superadmin, y la `clave_idempotencia` del formulario.

Así caen solas las derivaciones de la caja (SL-45 §4), las métricas de egresos, la composición y la anulación de
SLT-60. **El libro sigue append-only:** ninguna columna nueva en `wallet_movimiento`.

**Módulo:** ninguno. Plataforma > Empresas es núcleo, y las actions nuevas van en `lib/actions/pagos-plataforma.ts`,
que ya es `nucleo` en `lib/modulos/reparto.ts`.

## 2. País

- **Moneda:** la de la app (`money()`), sin conversión.
- **Fecha del pago:** el día elegido empieza en la zona del país **de la empresa** (`construirReglasPaisEmpresa`
  dentro de `conEmpresa(organizacionId)`), con `instanteDelMovimientoManual`, igual que el egreso manual (SLT-42).
  Sin fecha, la del servidor (el `DEFAULT` de la columna).
- **Períodos de las facturas:** `ZONA_CR`, como en SLT-60.
- **Impuestos y métodos de pago:** ninguno.

## 3. La base (migración `20261120130000_pago_plataforma_por_fuera`)

`BEGIN/COMMIT`, a mano (`db:migrate:create` falla con P3006). El timestamp va después de la última de `dev`
(`20261119120100_cobro_plataforma_ocurrido_utc`); T0 lo vuelve a comprobar. Todas las funciones son del dueño
(`SECURITY DEFINER`, `search_path = public, pg_temp`, `REVOKE EXECUTE … FROM PUBLIC`), sin `GRANT` a `servi_app`.

### 3.1 La tabla y la columna (§1.1, §1.2)

### 3.2 El saldo sin los anulados (R21, R26, R30)

`CREATE OR REPLACE FUNCTION factura_plataforma_saldos(p_org text)`: el cuerpo de SLT-60, con una condición más en
el sub-`SELECT` de lo aplicado:

```sql
WHERE ap."organizacion_id" = p_org
  AND NOT EXISTS (SELECT 1 FROM "pago_plataforma_anulacion" n
                   WHERE n."organizacion_id" = p_org AND n."confirmacion_id" = ap."confirmacion_id")
```

Con eso cuadran solos:
- lo disponible para registrar, porque `pago_plataforma_disponible_de` suma estos saldos: sube en el monto;
- la confirmación de SLT-60;
- lo que leerá SLT-121 (R30).

`pago_plataforma_por_confirmar` no cambia: el anulado tiene contra-asiento y ya queda fuera, así que no vuelve a
estar por confirmar.

### 3.3 Registrar por fuera (R1–R3, R5–R12)

Primero, el reparto de `pago_plataforma_confirmar` (los pasos 3 y 4 de SLT-60 §3.4) se saca a una función interna:

`_pago_plataforma_aplicar(p_org, p_pago_id, p_monto, p_aplicaciones jsonb, p_por, p_ahora, p_por_fuera boolean)`
- valida cada factura, cada monto, las repetidas y la suma, con los mismos códigos `SL060`;
- inserta la confirmación (con `por_fuera`) y las aplicaciones.

`pago_plataforma_confirmar` queda con el candado, la lectura del pago, `ya_confirmado` y la llamada con `false`. Su
comportamiento es idéntico, y los tests de SLT-60 tienen que seguir en verde.

`pago_plataforma_registrar_por_fuera(p_org, p_pago_id, p_monto numeric, p_fecha timestamp, p_referencia text, p_clave text, p_aplicaciones jsonb, p_por text, p_ahora timestamp, p_comprobante_ruta text, p_comprobante_tipo text) RETURNS text`
devuelve `'ok'` o `'ya_registrado'`, en una sola sentencia:
1. `pg_advisory_xact_lock(hashtext('pago_plataforma:' || p_org))`, el mismo candado de siempre (R11);
2. si ya existe un movimiento de `p_org` con `clave_idempotencia = p_clave`, devuelve `'ya_registrado'` (R10);
3. `INSERT` del pago (§1.3):
   - `fecha_movimiento = COALESCE(p_fecha, p_ahora)`;
   - el trigger del tope corre aquí. Si el pago supera lo disponible, sale `check_violation` con
     `CONSTRAINT = wallet_movimiento_tope_pago_plataforma` (R6), y lo traduce §3.6;
   - no hay comprobación de caja suficiente: la caja puede quedar negativa (R3). T0 confirma que ningún trigger
     de `wallet_movimiento` mira el saldo;
4. si `p_comprobante_ruta` no es nulo, `INSERT` en `wallet_comprobante` (`caja_movimiento_id = p_pago_id`,
   `subido_por = p_por`) (R8);
5. `PERFORM _pago_plataforma_aplicar(…, true)`. Cualquier `SL060` revierte también los pasos 3 y 4 (R5);
6. **no** escribe historial (decisión P6), ni anotación de «a quién»: para este concepto es `null`, como en SL-45.

### 3.4 Anular un confirmado (R21–R27, R29)

`pago_plataforma_anular_confirmado(p_org, p_pago_id, p_motivo text, p_por text, p_ahora timestamp) RETURNS text`
devuelve `'ok'` o `'ya_anulado'`:
1. el mismo candado (R24);
2. lee el pago (`egreso_pago_plataforma` de `p_org`). Si no existe: `SL060 pago_no_encontrado` (R25);
3. si tiene contra-asiento: `'ya_anulado'` (R24, R27);
4. lee su confirmación. Si no la tiene: `SL060 pago_no_confirmado` (R25);
5. si `btrim(p_motivo) = ''`: `SL060 motivo_vacio` (R23). El servicio ya lo filtra antes; esto es la red;
6. `INSERT` en `pago_plataforma_anulacion`, luego en `ajuste_caja_anulacion`
   (`movimiento_id = p_pago_id`, el motivo y `anulado_por = p_por`), y luego el contra-asiento:
   - `ingreso`, `ingreso_ajuste`, el monto del pago, `origen_tipo = gasto` y `origen_id = p_pago_id`;
   - `descripcion = 'Anulación de: ' || COALESCE(descripcion, 'Pago a la plataforma')`, como
     `EgresoCajaAnulacionService`;
   - `registrado_por = p_por` y `fecha_movimiento = p_ahora`.

   T0 confirma las columnas exactas que escribe hoy esa anulación (incluido el único que hace `escritas === 0`) y
   la función las copia.

No toca `factura_plataforma` ni `pago_plataforma_aplicacion` (R30). El saldo vuelve por §3.2.

### 3.5 El bloqueo de la empresa con la excepción de la plataforma (R15, R29)

`CREATE OR REPLACE FUNCTION pago_plataforma_no_anular_confirmado()`: el cuerpo de SLT-60, con la condición

```sql
IF EXISTS (SELECT 1 FROM "pago_plataforma_confirmacion" c
            WHERE c."organizacion_id" = NEW."organizacion_id" AND c."pago_id" = NEW."origen_id"
              AND NOT EXISTS (SELECT 1 FROM "pago_plataforma_anulacion" n
                               WHERE n."organizacion_id" = c."organizacion_id" AND n."confirmacion_id" = c."id"))
THEN RAISE … 'pago_confirmado'
```

`servi_app` no puede escribir en `pago_plataforma_anulacion` (`REVOKE`), así que la empresa sigue rechazada (R15,
R29). La función de §3.4 escribe la anulación **antes** del contra-asiento, en la misma transacción, y pasa.

### 3.6 Errores

`lib/db/errores-pago-plataforma.ts` gana:
- los códigos `pago_no_confirmado` y `motivo_vacio` en `traducirErrorDeConfirmacion`;
- `esTopeDelPagoSuperado(e)`: el `check_violation` con constraint `wallet_movimiento_tope_pago_plataforma`. Lo
  traduce a `validation_error` en `monto` con `MENSAJE_TOPE_PAGO_PLATAFORMA` (R6).

### 3.7 `down.sql` (R33)

En este orden:
1. `CREATE OR REPLACE` de `pago_plataforma_no_anular_confirmado`, `factura_plataforma_saldos` y
   `pago_plataforma_confirmar`, con los cuerpos **literales** de `20261116120000`;
2. `DROP` de `pago_plataforma_registrar_por_fuera`, `pago_plataforma_anular_confirmado` y `_pago_plataforma_aplicar`;
3. `DROP TABLE pago_plataforma_anulacion`, con sus triggers;
4. `ALTER TABLE pago_plataforma_confirmacion DROP COLUMN por_fuera`.

Si ya hay anulaciones de la plataforma, el `down` deja esos pagos como «confirmados con contra-asiento», un estado
que SLT-60 no conoce. Por eso **aborta** si `pago_plataforma_anulacion` tiene filas: es el molde de
`quitar_valores_de_enum` de SL-45.

## 4. Backend

### 4.1 Tipos (`lib/types/pago-plataforma.ts`)

```ts
export interface AplicacionDeFacturaDTO { facturaId: string; numero: number; monto: string }
export interface PagoConfirmadoDTO {
  id: string; monto: string; fecha: Date; referencia: string | null;
  registradoPor: string | null;   // nombre; null si porFuera o sin dato
  porFuera: boolean;
  confirmadoPor: string | null; confirmadoEl: Date;
  aplicaciones: AplicacionDeFacturaDTO[]; tieneComprobante: boolean;
}
// PagosDeEmpresa gana: confirmados: PagoConfirmadoDTO[]   (por confirmado_at desc, id)

export const registrarPagoPorFueraSchema = z.object({
  organizacionId: z.uuid(), claveIdempotencia: z.uuid(),
  monto: montoPagoPorFueraSchema,        // > 0, 2 decimales, tope 9 999 999 999,99 = DECIMAL(12,2) de wallet_movimiento.monto (decisión del leader, T0)
  fecha: fechaMovimientoSchema.optional(),// la del egreso manual (SL-45 R12)
  referencia: z.string().trim().min(1),   // sin tope, como la descripcion de SL-45 (decisión del leader, T0)
  aplicaciones: z.array(z.object({ facturaId: z.uuid(), monto: importeSchema })).min(1),
});
export const anularPagoConfirmadoSchema = z.object({
  organizacionId: z.uuid(), pagoId: z.uuid(), motivo: z.string().trim().min(1),   // sin tope, como 458-B (decisión del leader, T0)
});
export type RegistrarPagoPorFueraResult = { estado: "ok" } | { estado: "ya_registrado" } | { estado: "forbidden" }
  | { estado: "comprobante_no_guardado" } | { estado: "validation_error"; errores: Record<string, string> };
export type AnularPagoConfirmadoResult = { estado: "ok" } | { estado: "ya_anulado" } | { estado: "not_found" }
  | { estado: "no_confirmado" } | { estado: "forbidden" } | { estado: "validation_error"; errores: Record<string, string> };
```

- El esquema de la fecha **se importa** de donde lo define SL-45 (`lib/types/wallet.ts`, T0.4); no se copia: así R7
  es la misma regla. El del monto es nuevo en `lib/types/pago-plataforma.ts` (`montoPagoPorFueraSchema`, con test):
  `montoPositivoSchema` no limita las cifras enteras y un monto mayor que 9 999 999 999,99 desbordaría
  `DECIMAL(12,2)` con un 22003 sin traducir (decisión del leader tras T0).
- La referencia no tiene tope, como la `descripcion` de SL-45 (decisión del leader tras T0).
- El motivo no tiene tope, como en la anulación de 458-B (decisión del leader tras T0).
- `TEXTOS_CONFIRMACION` gana `pago_no_confirmado` y `motivo_vacio`.

### 4.2 Repositorio (`PagoPlataformaConfirmacionRepository` y su interfaz)

Todos los métodos corren en `comoPlataforma("SL-45", …)`. El motivo de `EXCEPCIONES_DE_PLATAFORMA` se amplía con
las dos funciones nuevas.

| Método | Qué hace |
|---|---|
| `leer(org)` (cambia) | La misma sentencia gana un tercer `jsonb_agg`, `confirmados`. Lo arma desde `pago_plataforma_confirmacion c` `JOIN wallet_movimiento p` (sin contra-asiento) y `WHERE NOT EXISTS` de la anulación. Lleva el nombre de quien registró (solo si `u.organizacion_id = org`), `c.por_fuera`, el nombre de quien confirmó (`usuario` sin filtro de empresa: es el superadmin), las aplicaciones con el `numero` de la factura y `tiene_comprobante` (R16) |
| `registrarPorFuera(input)` (nuevo) | `SELECT pago_plataforma_registrar_por_fuera(…)`. Traduce `SL060` y el tope (§3.6) a `{ estado: "rechazado", error }` |
| `anularConfirmado(input)` (nuevo) | `SELECT pago_plataforma_anular_confirmado(…)`, y la misma traducción |

### 4.3 Servicio (`PagoPlataformaConfirmacionService` y su interfaz)

Gana por constructor:
- `IWalletComprobanteService`, construido con `buildComprobantes(prisma)`;
- `Pick<IReglasPaisEmpresa, "zonaHoraria">`.

El reloj ya se inyecta.

| Método | Orden |
|---|---|
| `registrarPorFuera(actor, input, comprobante \| null)` | `esPlataforma`, si no `forbidden` (R31) → zod → quitar los montos 0 → si no queda ninguno, `validation_error` → dentro de `conEmpresa(org)`: la zona, `instanteDelMovimientoManual` si hay fecha, y `registrarConComprobante(comprobantes, "wallet_movimiento", comprobante, escribir)`. `escribir` llama a `repo.registrarPorFuera({ …, por: actor.usuarioId, ahora })` y devuelve `quedo: estado === "ok"` (R8, R9) → traducir |
| `anularConfirmado(actor, input)` | `esPlataforma`, si no `forbidden` → zod (`motivo` vacío → `validation_error`, R23) → `repo.anularConfirmado({ …, por, ahora })` → traducir |

Traducción:
- `ok`, `ya_registrado` y `ya_anulado` pasan tal cual;
- `pago_no_encontrado` → `not_found`;
- `pago_no_confirmado` → `no_confirmado`;
- los códigos del reparto → `validation_error` en `aplicaciones.<id>` o `aplicaciones`, como en SLT-60;
- el tope → `validation_error` en `monto`;
- `motivo_vacio` → `validation_error` en `motivo`.

**Por qué el comprobante va dentro de `conEmpresa`:** el adaptador de almacenamiento guarda en la carpeta de la
empresa del contexto (SL-19). El superadmin no tiene empresa, así que se fija la de la URL, como hace
`verComprobante` (SLT-60 §4.8).

### 4.4 Las actions (`lib/actions/pagos-plataforma.ts`)

- `registrarPagoPorFueraAction(organizacionId, formData)`: la página la liga con `.bind`. Usa
  `leerComprobanteOpcional`, el molde de `wallet-egresos.ts`.
- `anularPagoConfirmadoAction(organizacionId, input)`, también ligada.
- El composition root pasa el repositorio, `buildComprobantes(prisma)` y `construirReglasPaisEmpresa(prisma)`
  reales, y su test lo comprueba.

### 4.5 La deuda y el listado sin los anulados (R26)

- `PagoPlataformaRepository.sumaPagosConfirmados`:
  `where: { organizacionId, confirmacion: { anulacion: null } }`.
- `EmpresasPlataformaRepository.cuentasConLaPlataforma`: el mismo filtro en el `groupBy` de
  `pagoPlataformaAplicacion`. El contador de «por confirmar» no cambia.

`DeudaPlataformaService` y los tipos no cambian.

## 5. La marca en la wallet (R13, R14)

- `lib/types/estado-cuenta.ts`: `RegistroDTO.automatico.accion` gana `"plataforma"`.
- `ILibroCajaAutoriaRepository` y `LibroCajaAutoriaRepository` ganan `marcasDeLaPlataforma(ids)` (§5.1). Su
  conjunto `registrados` es
  `pagoPlataformaConfirmacion.findMany({ where: { pagoId: { in }, porFuera: true }, select: { pagoId } })`. Corre
  con la empresa de la sesión, y la RLS le deja leer sus confirmaciones (SLT-60 R25). Los ids que recibe son los
  de las filas y, para los contra-asientos, su `origen_id`.
- `LibroCajaAutoriaService.registro(m)`: **antes** de mirar `registradoPor`, si `registrados.has(m.id)` devuelve
  `{ nombre: null, automatico: { accion: "plataforma", por: null } }`. Ni el nombre ni el id del superadmin salen
  (R13).
- `detalle-movimiento-panel-labels.ts`:
  - `ACCION_AUTOMATICA_LABEL.plataforma = "Registrado por la plataforma"`;
  - `textoRegistro` devuelve ese texto **sin** el prefijo «Automático · », porque la decisión fija el literal.
  - La tabla (`WalletLedger`), el panel de detalle y la descarga (`filaBaseCaja`) ya usan `textoRegistro`, así que
    la marca llega a los tres sin tocarlos.
- **La referencia** es la `descripcion` del pago, que el libro ya pinta en «Detalle» en los tres sitios (SL-45). T0
  lo confirma en `libro-caja-kardex.ts`.
### 5.1 «Anulado por la plataforma» (R28, R36; decisión del humano del 2026-11-19)

La constancia y el contra-asiento llevan como actor al superadmin, cuyo nombre la RLS no deja leer a la empresa.
La marca sale de la misma fuente que la del registro: la fila de `pago_plataforma_anulacion`.

- `pagosRegistradosPorLaPlataforma` pasa a ser
  `marcasDeLaPlataforma(ids): Promise<{ registrados: Set<string>; anulados: Set<string> }>`, en una sola lectura:
  - `registrados`: los pagos con confirmación `por_fuera`;
  - `anulados`: los pagos cuya confirmación tiene anulación (`confirmacion: { anulacion: { isNot: null } }`).

  La RLS deja leer a la empresa sus anulaciones (R32).
- **El contra-asiento.** Es la fila `ingreso_ajuste` cuyo `origen_id` es un pago de `anulados`. En
  `LibroCajaAutoriaService.registro` se le da `{ nombre: null, automatico: { accion: "plataforma_anulacion", por: null } }`,
  **antes** de mirar `registradoPor`. `RegistroDTO.automatico.accion` gana `"plataforma_anulacion"`.
  - `ACCION_AUTOMATICA_LABEL.plataforma_anulacion = "Anulado por la plataforma"`.
  - `textoRegistro` lo devuelve sin «Automático · », como `plataforma`.
  - Así llega a la tabla, al detalle y a la descarga, por el mismo camino que la marca del registro (R36).
- **La línea de anulación del pago original.** En `LibroCajaAutoriaService.anulacion(m)`, si `m.id` está en
  `anulados`, se devuelve `por: PLATAFORMA_ANULO`. Es la constante `"la plataforma"`, en
  `detalle-movimiento-panel-labels.ts`. `PANEL_TEXTO.anuladoDetalle` ya compone «Anulado el {día} a las {hora} por
  la plataforma · {motivo}», y el id o el nombre del superadmin nunca salen.
- **Una anulación de la empresa** no está en `anulados`, así que conserva el nombre de la persona (R36).
- **Archivos.** Los textos (`detalle-movimiento-panel-labels.ts`), el servicio, el repositorio, su interfaz y
  `estado-cuenta.ts` ya estaban en la lista. Lo único nuevo es el test de los textos,
  `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts`, con los dos literales escritos a
  mano.

## 6. Pantallas

### 6.1 `RepartoEntreFacturas.tsx` (nuevo)

Es la tabla del reparto que hoy vive dentro de `DialogoConfirmar` y `FilaDeFactura` de `PagosPorConfirmar.tsx`:
- una fila por factura con el número, el período, el total, el saldo y el `Input` «Aplicar»;
- el pie con «Repartido {suma} de {monto}» y «Falta {falta}»;
- los errores bajo cada fila.

Las props son `monto`, `facturas`, `montos`, `onCambio` y `errores`. `PagosPorConfirmar.tsx` la usa sin cambiar lo
que se ve, y su test sigue igual (SLT-60 R14, R17).

### 6.2 `PagosConfirmados.tsx` (nuevo, `"use client"`)

Props:
- `datos: PagosDeEmpresa | null`;
- `registrarPorFuera(formData)`, `anular(input)` y `verComprobante(pagoId)`, ya ligadas a la empresa.

Contenido:
- **Cabecera:** el título «Pagos confirmados», la ayuda «Pagos ya aplicados a las facturas cerradas de la empresa.
  Anularlos devuelve el dinero a su caja y sube su deuda.» y el botón «Registrar pago hecho por fuera…» (R17).
- **Tabla (R16):**
  - las columnas son fecha, monto, referencia, «Registrado por», «Confirmado», «Facturas», el comprobante y
    «Anular…»;
  - «Registrado por» dice el nombre o «Registrado por la plataforma»;
  - «Confirmado» dice «{nombre} · {fecha}»;
  - «Facturas» dice «N.º {numero}: {monto}», una por línea;
  - el comprobante funciona como en SLT-60 §6.1.
- **Mensajes:** vacía, «No hay pagos confirmados»; con `null`, «No se pudieron cargar los pagos confirmados» (R18).
- **Diálogo «Anular pago de {monto}»:**
  - el campo «Motivo», obligatorio;
  - el aviso «El dinero vuelve a la caja de la empresa, la deuda sube y las facturas recuperan su saldo.»;
  - el botón «Anular pago».
- **Resultados de la anulación:**
  - `ok`: cierra y llama a `router.refresh()` (R19);
  - `ya_anulado`: «Este pago ya estaba anulado» y `refresh`;
  - `not_found` y `no_confirmado`: «El pago ya no está confirmado» y `refresh`;
  - `validation_error`: el error bajo «Motivo»;
  - `forbidden` o un throw: «No se pudo anular ahora».

### 6.3 `RegistrarPagoPorFuera.tsx` (nuevo, `"use client"`)

Es el diálogo que abre el botón de la cabecera. Recibe `facturas: FacturaConSaldoDTO[]` y `registrar`.
- **Campos:**
  - Monto;
  - Fecha, con el `<Input type="date">` del diálogo de la wallet (`RegistrarMovimientoDialog.tsx`), pero la ventana
    de días se calcula en la zona del país **de la empresa**, igual que el servidor, no en la de Costa Rica (decisión del leader tras T0);
  - «Referencia del pago», con el placeholder de SL-45;
  - Comprobante opcional, con el mismo `accept` y el mismo tope que la wallet;
  - `<RepartoEntreFacturas>`, precargado con `proponerReparto(monto, facturas)` cada vez que cambia el monto (R4).
- **La clave de idempotencia** es un `crypto.randomUUID()` por apertura del diálogo (R10).
- **Sin facturas:** «La empresa no tiene facturas cerradas con saldo», sin botón para registrar (R17).
- **El botón «Registrar pago»** se deshabilita mientras el reparto no es válido.
- **Resultados:**
  - `ok` y `ya_registrado`: cierra y llama a `refresh` (R19);
  - `validation_error`: cada error bajo su campo (`monto`, `fecha`, `referencia`, `aplicaciones.*`);
  - `comprobante_no_guardado`: «No se pudo guardar el comprobante. El pago no se registró.»;
  - `forbidden` o un throw: «No se pudo registrar ahora».
- **Importes y textos:** con `money()`, sin `Number(` ni `parseFloat`. Los textos van en un `TEXTOS` del archivo,
  en forma impersonal.

### 6.4 `page.tsx`

- `<PagosConfirmados>` va justo debajo de `<PagosPorConfirmar>`, fuera de las pestañas (P4).
- Usa la misma lectura, `pagos`: si falla, las dos secciones dicen su error (R18).
- Le pasa las tres actions ligadas con `organizacionId` en el servidor.

### 6.5 La ayuda (R35)

`docs/ayuda/oficina/wallet-caja.md`, sección «Lo que la empresa debe a la plataforma». Gana dos párrafos:
- «Pagos registrados por la plataforma»;
- «La plataforma puede anular un pago confirmado».

También se actualiza `actualizado:`. Ninguna frase existente cambia, así que `contexto-sl45` sigue igual. Lo
dispara `gate.disparadores` (`docs/ayuda/**`).

## 7. Autorización

| Operación | Quién | Dónde se decide | R |
|---|---|---|---|
| Registrar por fuera | superadmin | `PagoPlataformaConfirmacionService.registrarPorFuera`, antes de leer; la función es del dueño y `servi_app` no la ejecuta | R31 |
| Anular un confirmado | superadmin | `anularConfirmado`, antes de leer; en la base, el trigger §3.5 | R29, R31 |
| Anular un confirmado desde la empresa | nadie | el trigger §3.5 y `forbidden` de `EgresoCajaAnulacionService` (SLT-60) | R15 |
| Leer los confirmados | superadmin | `verDeEmpresa`, que ya existe; la página da `notFound()` a otro rol | R31 |
| Escribir anulaciones | solo la función del dueño | `REVOKE` a `servi_app` | R32 |

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/pago-plataforma-por-fuera.test.ts` (**nuevo**) | R1–R3, R5, R6, R8–R12, R14, R15, R21–R30, R32 | Base real, empresas A y B, facturas cerradas con `cerrarFacturaEnCurso` (fixture de SLT-60). Pasos en la tabla de abajo |
| `tests/integration/db/migracion-slt143-ida-y-vuelta.test.ts` (**nuevo**) | R33 | Con un pago confirmado previo: tras la migración sigue confirmado y `por_fuera = false`. El `down` aborta con una anulación; sin ella, revierte. Las tres definiciones vuelven a ser las de `20261116120000` (`pg_get_functiondef`) |
| `tests/integration/db/migracion-slt60-ida-y-vuelta.test.ts` (se ajusta si T0 lo pide) | — | Si aplica el `down` de SLT-60 sobre una base que ya tiene esta migración, primero aplica el `down` de esta |
| `tests/unit/services/pago-plataforma-confirmacion-service.test.ts` (se amplía) | R5–R7, R9, R23–R25, R31 | Repositorio doble: `forbidden` sin llamadas; zod (monto, referencia, fecha, motivo) sin llamadas; montos 0 quitados; la traducción de cada código; el comprobante va dentro de `conEmpresa` de la empresa pedida (se espía); con `quedo: false` el puerto recibe el aviso de no guardado |
| `tests/unit/actions/pagos-plataforma.test.ts` (se amplía) | R31 | Las dos actions: el actor de la sesión; el composition root pasa el comprobante y las reglas del país reales |
| `tests/components/RegistrarPagoPorFuera.test.tsx` (**nuevo**) | R4, R5, R7, R17, R19 | La propuesta se recalcula al cambiar el monto; el botón se deshabilita si no cuadra; los errores bajo cada campo; sin facturas, el texto y sin botón; `refresh` tras `ok`; la misma clave en dos envíos del mismo diálogo |
| `tests/components/PagosConfirmados.test.tsx` (**nuevo**) | R16–R20 | Vacía, `null`, una fila de la empresa y otra por fuera («Registrado por la plataforma»), las facturas aplicadas, el motivo obligatorio, cada resultado de anular, «Ver comprobante» |
| `tests/components/PagosPorConfirmar.test.tsx` (sin cambios de afirmaciones) | SLT-60 R14, R17 | Debe seguir en verde tras sacar `RepartoEntreFacturas` |
| `tests/integration/plataforma-empresa-detalle-page.test.tsx` (se amplía) | R16, R18 | La sección aparece; si la lectura falla, las dos secciones dicen su error y el plan se pinta |
| `tests/unit/services/libro-caja-autoria-plataforma.test.ts` (**nuevo**) | R13, R14, R36 | Repositorio doble: un pago por fuera da `accion: "plataforma"`, sin nombre ni id; uno de la empresa confirmado da el nombre; el contra-asiento de una anulación de la plataforma da `plataforma_anulacion`, y su pago original, `anulacion.por = "la plataforma"`; una anulación de la empresa conserva el nombre |
| `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts` (se amplía) | R13, R36 | `filaBaseCaja` con esa autoría pone «Registrado por la plataforma» en «Registró»; con la del contra-asiento, «Anulado por la plataforma» |
| `tests/unit/components/detalle-movimiento-panel-labels-plataforma.test.ts` (**nuevo**) | R13, R36 | Los literales escritos a mano: `textoRegistro` de `plataforma` y de `plataforma_anulacion`, sin «Automático»; `anuladoDetalle(fecha, PLATAFORMA_ANULO, motivo, hora)` = «Anulado el … a las … por la plataforma · motivo» |
| `tests/integration/db/empresas-plataforma-deuda-sl45.test.ts` (se amplía) | R26 | Tras una anulación de la plataforma, «Pagado» y la deuda bajan en el monto |
| `tests/unit/guards/rls-por-empresa.guardia.test.ts` | R32 | 93 tablas |
| `e2e/pago-plataforma-por-fuera.spec.ts` (**nuevo**, proyecto `dinero`) | R34 | §9 |

La ayuda (R35) la cubre un `grep` en T6.2 y el `contexto-sl45` sin cambios. La marca en la tabla y en el detalle la
cubre el E2E.

**Pasos del test de integración** (montos en colones; deuda = cargos + cuotas − confirmados vigentes):

| Paso | Caja A | Deuda A | Disponible A | Resultado |
|---|---|---|---|---|
| A con órdenes y la factura cerrada por 300 000; caja inicial 500 000 (aporte) | 500 000 | 300 000 | 300 000 | — |
| El superadmin registra por fuera 100 000 contra la factura | 400 000 | 200 000 | 200 000 | `ok`; 1 movimiento, 1 confirmación `por_fuera`, 1 aplicación; 0 filas de historial nuevas (P6); la factura sin cambios (R1, R2, R12) |
| Lo mismo con la misma clave | 400 000 | 200 000 | 200 000 | `ya_registrado`, sin filas (R10) |
| 200 000,01 | — | — | 200 000 | `validation_error` en `monto`, sin filas (R6) |
| Reparto que suma 99 999 / factura en curso / factura de B | — | — | — | `validation_error`, sin movimiento ni comprobante (R5) |
| Con comprobante (fila, sin subir a Storage) | — | — | — | `wallet_comprobante` del pago (R8); si el reparto falla, 0 filas (R9) |
| Caja de C en 0, pago de 50 000 | −50 000 | — | — | `ok` (R3) |
| A registra 100 000 desde la wallet y el superadmin uno por fuera a la vez, con 150 000 disponibles | — | — | — | Uno `ok` y otro rechazado (R11) |
| `pago_plataforma_por_confirmar(A)` | — | — | — | No trae el pago por fuera (R12) |
| La autoría del libro de A | — | — | — | El pago por fuera lleva `plataforma`; uno de la wallet confirmado lleva el nombre (R13, R14) |
| A anula el pago por fuera (`EgresoCajaAnulacionService`) | 400 000 | 200 000 | — | `forbidden`, 0 filas (R15); el contra-asiento a mano como `servi_app` y como dueño → `SL060` (R29) |
| El superadmin anula con motivo «Pago duplicado» | 500 000 | 300 000 | 300 000 | `ok`: 1 anulación, 1 constancia con el motivo y 1 contra-asiento; la factura y las aplicaciones sin cambios (R21, R22, R26, R30) |
| Anular otra vez, o dos a la vez | — | — | — | `ya_anulado`, y exactamente una escribe (R24) |
| Confirmar el anulado | — | — | — | `not_found` (R27) |
| Anular uno por confirmar / de otra empresa / con motivo «   » | — | — | — | `no_confirmado` / `not_found` / `validation_error`, 0 filas (R23, R25) |
| Anular un pago de la empresa ya confirmado (SLT-60) | +monto | +monto | +monto | Mismo efecto (R21, P5) |
| B lee `pago_plataforma_anulacion` | — | — | — | Solo lo suyo; `INSERT`/`UPDATE`/`DELETE` → `42501`; `UPDATE` como dueño → `SL060` (R32) |

**Control de no vacuidad:** antes de afirmar, la factura está cerrada y las funciones nuevas existen en `pg_proc`.
Un `skip` por falta de base no cuenta como verde.

**Mutaciones que deben matarlo**, una a la vez:
1. `factura_plataforma_saldos` sin el `NOT EXISTS` de la anulación;
2. el trigger de §3.5 sin la excepción (la anulación de la plataforma cae);
3. el trigger de §3.5 que deja pasar siempre (la empresa anula);
4. `sumaPagosConfirmados` sin el filtro;
5. `_pago_plataforma_aplicar` sin la comprobación de la suma.

## 9. E2E (`e2e/pago-plataforma-por-fuera.spec.ts`, R34)

Serial, en el proyecto `dinero` de `playwright.config.ts`. Usa `_dos-empresas-fixture.ts`,
`_superadmin-fixture.ts` y `_planes-fixture.ts` solo importándolos, como el E2E de SLT-60.

1. **Datos (dueño):** empresa con `maestro`, dos órdenes con cargo y `factura_plataforma_cerrar`. El total sale de
   la fila de la base.
2. **Maestro:** anota la cifra de la caja y la de la deuda.
3. **Superadmin:** en el detalle de la empresa, «Registrar pago hecho por fuera…». Monto = total − 100,
   referencia «Transferencia del día», sin tocar el reparto propuesto, «Registrar pago». El pago aparece en «Pagos
   confirmados» con «Registrado por la plataforma».
4. **Maestro:** la deuda y la caja bajan en el monto. En el libro, la fila «Pago a la plataforma» dice «Registrado
   por la plataforma» y la referencia. «Anular…» responde «No tenés permiso para anular este registro.».
5. **Superadmin:** «Anular…» con el motivo «Registrado por error». El pago sale de «Pagos confirmados».
6. **Maestro:** la deuda y la caja vuelven a las cifras del paso 2. El contra-asiento dice «Anulado por la
   plataforma» en «Registró», y el detalle del pago anulado dice «por la plataforma» y el motivo (R36).

Se corren además `e2e/pago-plataforma-confirmacion.spec.ts`, `e2e/pago-plataforma-sl45.spec.ts`,
`e2e/wallet.spec.ts` y el grupo `dinero` entero (`docs/perfil-agentes.md`).

## 10. Alternativas descartadas

1. **Registrar por fuera con `WalletEgresoService` dentro de `conEmpresa`, y confirmar después.**
   - Pide `esAccesoTotal`, y el superadmin no lo tiene.
   - La confirmación tiene que ir en la **misma** transacción que el `INSERT`, y `servi_app` no puede escribir
     confirmaciones (SLT-60 R25). Darle `EXECUTE` sobre una función de confirmar dejaría a cualquier código de
     empresa confirmar sus propios pagos.

   Una función del dueño, de una sola sentencia, es el molde de SLT-60.
2. **Distinguir al superadmin en el trigger con una variable de sesión** (`set_config('app.anulacion_plataforma', …)`).
   Cualquier rol puede fijarla, `servi_app` incluido, y R29 pide que la base rechace con cualquier rol.
3. **La marca derivada de `registrado_por = confirmado_por`, sin columna.** Funciona, porque un usuario de empresa
   nunca confirma, pero deja la regla implícita en una comparación. Una columna escrita solo por la función del
   registro es explícita y no cuesta archivos: `schema.prisma` ya cambia por la tabla nueva.
4. **Anular con aplicaciones negativas** (contra-aplicaciones), sin tabla de anulación. Rompe el `CHECK (monto > 0)`
   y el único `(organizacion_id, confirmacion_id, factura_id)` de SLT-60, y no resuelve el trigger (alternativa 2).
5. ~~Dejar la anulación de la plataforma sin marca en el libro~~ (lo que proponía la primera versión). **El humano
   la descartó el 2026-11-19:** la wallet dice «Anulado por la plataforma», igual que la marca del registro (§5.1,
   R36).

## 11. Riesgos

- **Tamaño:** 45 rutas en `## Archivos esperados`, unas 1 200 líneas de producción. El humano aceptó un solo PR el
  2026-11-19 (P0). El gate avisará por tamaño; no se parte.
- **`migracion-slt60-ida-y-vuelta`:** si aplica el `down` de SLT-60 sobre una base que ya tiene esta migración,
  chocará con la FK de `pago_plataforma_anulacion`. T0 lo mira, y T1.5 lo ajusta.
- **El reparto sacado de `pago_plataforma_confirmar`:** puede cambiar algún detalle de SLT-60. Lo vigilan
  `tests/integration/db/pago-plataforma-confirmacion.test.ts` y sus cuatro mutaciones, que deben seguir en verde
  sin tocarse.
- **La demo** (`scripts/demo-qa/receta.ts`) no registra pagos por fuera. No cambia.
