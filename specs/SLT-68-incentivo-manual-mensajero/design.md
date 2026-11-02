# SLT-68 — Diseño técnico

> Hotfix sobre `prod`. Lo citado está medido en este worktree (`origin/prod`) el 2026-10-30. El grafo
> de código no tiene proyecto indexado para este worktree. Por eso la exploración se hizo con
> Grep/Read.

## Lo que ya existe

**Términos buscados.** «incentivo», «bono» y «bonificación»:

- en `feature_list.json` (todos los estados);
- en `specs/`;
- en el código del worktree.

**Qué apareció.**

- **Board:** solo SLT-68.
- **`specs/`:** solo usos retóricos de «incentivo perverso» en las fichas 240 y 276. No hay ninguna
  feature equivalente.
- **Código:** ningún símbolo de incentivo.

**Qué se reutiliza.**

| Pieza | Dónde | Para qué |
|---|---|---|
| Premio del ranking como devengo (293) | `lib/services/PremioRankingDevengoService.ts`, `lib/services/CajaPremioRankingFeedService.ts`, migración `20260827120000_premio_ranking_devengo` | **Molde completo**: categoría propia en la rama `devengo` del CHECK, imputación a un cierre (`origen_tipo = cierre_dia`) para que sea pagable, egreso de caja `egreso_pago_mensajero` (propio → baja la ganancia) con un origen propio, anulación con contraasiento en los dos libros en la misma transacción, puerto estrecho de caja. |
| `pago_mensajero_movimiento` | `db/schema.prisma:2163` | El libro del mensajero; la cuenta por pagar se deriva (Σ devengo − Σ pago). |
| CHECK `pago_mensajero_movimiento_tipo_categoria_check` | definición vigente en `20260827120000_premio_ranking_devengo/migration.sql:70-75` | Lista cerrada tipo↔categoría que **falla cerrado**: hay que tocarla o ningún incentivo se podrá escribir (23514). |
| Único `pago_mensajero_movimiento_origen_uq` | vigente en `20260827120000…/migration.sql:93-95` | `(origen_tipo, origen_id, mensajero_id, categoria) WHERE origen_id IS NOT NULL AND categoria NOT IN ('premio_ranking','ajuste_pago')`. |
| `sumarPremiosVivosPorCierre` | `lib/repositories/PagoMensajeroMovimientoRepository.ts:354` | Lo que se suma a lo pagable de un cierre por encima de su snapshot. Lo consumen `LiquidacionService` (3 sitios) y `CierresAdminService` (2) vía `derivarPendienteCierre`. |
| Conciliación de cierres | `lib/repositories/ConciliacionCierresAnaliticaRepository.ts:259-274` | Ya excluye el mundo del premio; hay que excluir también el del incentivo. |
| Catálogo del registro manual | `app/(app)/wallet/_components/wallet-conceptos-manuales.ts` | `CONCEPTO_MANUAL_IDS`, grupos, `FRASE_DEL_EFECTO`, `CONCEPTO_REGISTRO_DE` (todos `Record` totales). |
| «Así queda» | `lib/utils/efecto-movimiento.ts` (`EFECTO_POR_TIPO`) | Predice el efecto de un concepto. |
| Diálogo único | `components/shared/wallet/RegistrarMovimientoDialog.tsx` | Enruta por `destino.clase`. |
| Anulación uniforme | `lib/services/WalletAnulacionService.ts`, `lib/actions/wallet-anulacion.ts` (`ACCION_DEL_CAMINO`) | Enrutador por fila. `Record` total de caminos. |
| Pago a mensajero (reparto 205) | `lib/services/LiquidacionService.ts` | **No se toca**: cobra el incentivo porque lo ve como pagable de su cierre. |
| Candado y lectura de cierres | `ILiquidacionPagoRepository.bloquearBeneficiario` / `obtenerCierreParaPago` / `listarCierresImputables` | Resolver y bloquear el cierre al que se imputa. |
| Fecha de un movimiento manual | `lib/utils/fecha-movimiento-manual.ts` (`instanteDelMovimientoManual`) | La misma convención de fecha que el resto de conceptos manuales. |
| Idempotencia del cliente en la caja | `wallet_movimiento.clave_idempotencia`, único `(organizacion_id, clave_idempotencia)` (`20261023090000_unicos_por_empresa:43-45`) | La barrera del doble envío, sin columna nueva. |
| `esAccesoTotal` | `lib/auth/acceso-total.ts` | maestro **o** admin, como el resto de Wallet. |

Wallet es módulo del núcleo desde `20261028120000_modulo_wallet_nucleo`, así que no hay módulo
apagable que comprobar.

---

## 1. La decisión y su consecuencia

Un incentivo es **un premio sin podio**: el mismo par de asientos que la 293, con tres diferencias.

1. Monto, motivo y fecha los pone una persona. En el premio salen de la fila congelada del podio.
2. Se imputa al cierre aprobado **más reciente** del mensajero, no al cierre «del día» (Q1).
3. Su identidad es **el id de su propio devengo**. No hay una fila del podio que lo nombre.

Lo que obliga a cambiar fuera de su propio código cabe en una frase: lo pagable de un cierre pasa a
incluir sus incentivos vivos. Ya incluía los premios vivos, así que es **ampliar una consulta** y no
una firma nueva. Los cinco consumidores de `derivarPendienteCierre` no se tocan.

---

## 2. Modelo de datos

Ninguna tabla nueva ni columna nueva: no hay superficie RLS nueva. `pago_mensajero_movimiento` y
`wallet_movimiento` ya tienen `organizacion_id` con su DEFAULT de la transacción y su política por
empresa (SL-17).

### 2.1 Valores de enum nuevos

| Enum | Valor | Rama | Uso |
|---|---|---|---|
| `pago_mensajero_movimiento_categoria` | `incentivo` | `devengo` | El incentivo (R6). |
| `pago_mensajero_movimiento_categoria` | `reverso_incentivo` | `pago` | Su contraasiento (R13). Categoría propia y **no** `ajuste_pago`: la 293 tuvo que distinguir el reverso del premio de los demás `ajuste_pago` con `premio_dia`; aquí no hay columna que lo haga, y una categoría propia lo distingue sin ambigüedad en la suma (§4), en la conciliación (§5) y en el enrutado (§6). |
| `wallet_origen_tipo` | `incentivo_mensajero` | — | Origen de las dos filas de la caja (egreso y reverso) y del `reverso_incentivo`. `origen_id` = id del devengo `incentivo`. |

### 2.2 Las cuatro filas

| Libro | tipo | categoría | monto | origen_tipo | origen_id | fecha_movimiento | otros |
|---|---|---|---|---|---|---|---|
| mensajero | `devengo` | `incentivo` | M | `cierre_dia` | cierre imputado | `instanteDelMovimientoManual(fecha)` | `id` = X (lo genera el servicio), descripción `Incentivo · <motivo>`, `registrado_por` |
| caja | `egreso` | `egreso_pago_mensajero` | M | `incentivo_mensajero` | X | igual que la anterior | `clave_idempotencia` = la del cliente, misma descripción |
| mensajero (anular) | `pago` | `reverso_incentivo` | M | `incentivo_mensajero` | X | default (instante de la anulación) | `Anulación del incentivo · <motivo>` |
| caja (anular) | `ingreso` | `ingreso_ajuste` | M | `incentivo_mensajero` | X | default | misma descripción |

**Por qué cada origen:**

- **El devengo cuelga del cierre** para ser pagable (Q1). Es lo que lo hace entrar en lo imputable
  del reparto y en el desglose del cierre (`PagoMensajeroMovimientoDTO.cierreId` se deriva de
  `origen_tipo = cierre_dia`).
- **Las otras tres cuelgan del incentivo (X).**
  - La caja no puede colgar del cierre. Su único `(organizacion_id, origen_tipo, origen_id,
    categoria)` no lleva mensajero, y el feed ya escribió `(cierre_dia, C, egreso_pago_mensajero)`
    al aprobar: el egreso del incentivo caería en `DO NOTHING`, que es dinero que sale de la caja sin
    registro y sin error. Es el mismo motivo de la 293 §3.4.
  - El `reverso_incentivo` con origen X hereda del único de origen del libro la garantía «**una**
    anulación por incentivo», en la base y sin check-then-insert.

**Por qué `egreso_pago_mensajero` en la caja.** Es naturaleza `propio`
(`lib/utils/caja-tesoreria.ts:74`): baja la ganancia (D5) y es lo mismo que la caja ya carga por el
costo del mensajero al aprobar un cierre y al registrar un premio. El pago posterior al mensajero no
toca la caja ([P2] de la 173), así que no hay doble salida. El reverso con `ingreso_ajuste` (propio)
deja la ganancia exactamente como estaba (precedente 293 §7.1).

**Ganancia: lo verifiqué con el patrón existente.** El premio baja la ganancia por su egreso
`egreso_pago_mensajero`, y `derivarCaja` lo cuenta como propio. El incentivo usa la misma categoría,
así que baja la ganancia sin tocar `NATURALEZA_POR_CATEGORIA` ni `LIQUIDEZ_POR_CATEGORIA`. No hace
falta pregunta abierta.

---

## 3. Migraciones

Dos carpetas, como SL-45, porque Postgres no deja usar un valor de enum en la misma transacción que
lo añade (55P04, `20261024130100_pago_plataforma_check/migration.sql:8-9`).

**Timestamps.** `20261030120000` y `20261030120100`. En prod, la última es
`20261028120000_modulo_wallet_nucleo`; en el `dev` local, `20261029120100_historial_accion_pago_mensajero_ajustado`.

- **T0 lo vuelve a medir** contra `git ls-tree origin/dev -- db/migrations` y contra `origin/prod`.
- Si `origin/dev` ya tiene algo igual o posterior, se suben los dos timestamps por encima.

### 3.1 `20261030120000_incentivo_mensajero_enums`

```sql
ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'incentivo';
ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'reverso_incentivo';
ALTER TYPE "wallet_origen_tipo" ADD VALUE IF NOT EXISTS 'incentivo_mensajero';
```

Su `down.sql` sigue la coreografía de `20260827120000_premio_ranking_devengo/down.sql`, porque no hay
`DROP VALUE`:

- se recrean los dos tipos sin los valores nuevos;
- antes se sueltan, y después se recrean **en su forma vigente**, todos los objetos que los
  referencian.

**Inventario a medir en T0, no a suponer.** Hay que mirar `pg_depend`/`pg_constraint`/`pg_indexes`
en una base con prod aplicado:

- los índices sobre `origen_tipo` de los **tres** libros que comparten `wallet_origen_tipo`. El de la
  caja **ya no es** el de la 293: `20261023090000_unicos_por_empresa:52-55` le añadió
  `organizacion_id`;
- `..._tipo_categoria_check`, `..._premio_dia_check`, `..._premio_dia_uq`,
  `..._premio_reverso_uq` y `..._origen_uq` (los cinco nombran valores de categoría);
- cualquier CHECK de `wallet_movimiento`/`wallet_tienda_movimiento` que nombre un `origen_tipo`.

**Precondición escrita en el `down`.** Ninguna fila puede usar los valores que se retiran; si la
hay, el cast falla y el rollback aborta entero.

### 3.2 `20261030120100_incentivo_mensajero_checks`

1. El CHECK tipo↔categoría, desde su definición vigente y con un valor más en cada rama:

```sql
("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking','incentivo'))
OR
("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo'))
```

2. El CHECK nuevo `pago_mensajero_movimiento_incentivo_origen_check` (R12), que falla cerrado:

```sql
("categoria" <> 'incentivo'         OR ("origen_tipo" = 'cierre_dia'          AND "origen_id" IS NOT NULL))
AND
("categoria" <> 'reverso_incentivo' OR ("origen_tipo" = 'incentivo_mensajero' AND "origen_id" IS NOT NULL))
```

   Sin él, un incentivo escrito con otro origen no entraría en lo pagable de su cierre (§4): sería
   una deuda muda.

3. `pago_mensajero_movimiento_origen_uq` recreado con `'incentivo'` **fuera** del predicado:

```sql
WHERE "origen_id" IS NOT NULL AND "categoria" NOT IN ('premio_ranking','ajuste_pago','incentivo')
```

   Sin esto, el segundo incentivo al mismo mensajero sobre el mismo cierre chocaría con el primero y
   volvería como «ya registrado»: un fallo mudo sobre dinero (R9). El `reverso_incentivo` se queda
   **dentro**, y eso es lo que impone una anulación por incentivo (R15). El feed del cierre
   (`pago_devengado`, `pago_efectivo`) sigue dentro, con su protección intacta.

El `down.sql`:

- deja el CHECK tipo↔categoría y el único de origen exactamente como estaban (texto de la 293);
- suelta el CHECK nuevo.

**Aditiva:** no hay `INSERT`/`UPDATE`/`DELETE` ni backfill, porque hoy no existe ningún incentivo.
`schema.prisma` gana los tres valores, con un comentario que avisa de que el CHECK y el único parcial
viven solo en la migración, como hace el de la 293.

---

## 4. Lo pagable del cierre: ampliar una consulta

`sumarPremiosVivosPorCierre(cierreIds)` mantiene **su nombre, su firma y sus cinco consumidores**. Se
cambia solo su contenido, y su TSDoc pasa a decir «devengos posteriores al cierre: premios e
incentivos vivos».

```
vivo(C) = Σ premio_ranking(C) − Σ ajuste_pago con premio_dia(C)                              [igual que hoy]
        + Σ incentivo con origen (cierre_dia, C)
        − Σ reverso_incentivo cuyo origen_id ∈ { ids de los incentivos de C }
```

Son dos consultas por llamada, nunca una por cierre:

- la de hoy, más la rama `incentivo` en el `OR`;
- una segunda sobre `reverso_incentivo` con `origenId IN (ids de los incentivos leídos)`.

**Alternativa considerada: renombrar el método.** Tocaría cinco sitios y sus tests en un hotfix, sin
cambiar ningún comportamiento. Se anota como deuda menor.

`derivarPendienteCierre` no se toca y sigue fijando el resultado en ≥ 0 (Q2).

---

## 5. Barrido de consumidores

| Consumidor | Decisión | Por qué / test |
|---|---|---|
| `LiquidacionService` (`imputablesDe`, `pendienteDelCierre`, previsualización) y `CierresAdminService` (`conPendiente`, `pendienteTrasAprobar`) | **No cambian** (heredan de §4) | R8. |
| `ConciliacionCierresAnaliticaRepository` (`agregadoDelMensajero`) | **Cambia**: el `NOT OR` también excluye `incentivo` y `reverso_incentivo` | El snapshot del cierre no los contiene; sin el filtro, cada incentivo es un descuadre falso (R17). La caja no necesita filtro: su origen `incentivo_mensajero` ya queda fuera del `where` por cierre. |
| `cierre_dia.total_pago_mensajero`, factura, descargas de cierres | **No cambian** | Es la foto del cierre (R6, aserción de no-modificación). |
| `WalletMensajeroService` (cuentas por pagar, `/mis-pagos`) | **No cambia** | Se deriva del libro por `tipo` (R7). |
| `lib/utils/finanzas-diarias.ts` | **No cambia** | El egreso usa `egreso_pago_mensajero`: cuenta como pago a mensajeros ese día, igual que el premio. |
| `CATEGORIA_PAGO_LABEL` (`wallet-mensajeros-labels.ts:124`) | `incentivo: "Incentivo"`, `reverso_incentivo: "Anulación de incentivo"` | `Record` total: el compilador lo exige (R18). Las descargas y `/mis-pagos` derivan de él. |
| `CHIPS_MENSAJERO` / `CHIP_POR_CATEGORIA_MENSAJERO` (`lib/utils/estado-cuenta-chips.ts`) + `components/shared/estado-cuenta/estado-cuenta-labels.ts` | Chip nuevo `"incentivos"` («Incentivos») para los dos | Categoría propia (D6): meterlo en «Premios» lo mezclaría (R18). |
| `claveDeParMensajero` (`lib/utils/estado-cuenta.ts:98`) | `incentivo` → `incentivo:<id>`; `reverso_incentivo` → `incentivo:<origenId>`, `esContra` | Empareja original y contraasiento (R18). |
| `FUENTE_MENSAJERO` (`lib/utils/aporte-por-orden.ts:159`) | `{ tipo: "sin_reparto", motivo: "no_nace_de_un_cierre" }` para los dos | Como `premio_ranking` (R20). |
| Métrica `cuenta_por_pagar_mensajero` (`lib/analytics/metrics.ts:857`) | + `incentivo`, `reverso_incentivo` | El cálculo no cambia (va por `tipo`); el catálogo debe nombrarlas (R20). |
| `lib/types/wallet-mensajero.ts:51` (tupla de categorías) y `lib/types/wallet.ts` (tupla de orígenes) | + los valores nuevos | Exhaustividad (los `_Ensure…` del repo). |
| `Record<WalletOrigenTipo,…>` | `incentivo_mensajero`: «Incentivo a un mensajero» | Los marca `tsc`: `ORIGEN_LABEL`, `ORIGEN_TIENDA_LABEL`, `ORIGEN_PAGO_LABEL` (`lib/constants/wallet-rotulos.ts`), `DICCIONARIO_ORIGEN`/`LECTURA_POR_ORIGEN` (`OrigenLegibleService`), `A_QUIEN_POR_ORIGEN` (`libro-caja-a-quien-sql.ts`: a quién = el mensajero del devengo X), `LibroCajaAutoriaService`/`Repository`. |
| Documento de la fila de caja (`WalletService` ~l.124, `DocumentoCajaDTO` en `lib/types/wallet.ts`, `EgresoCajaDocumentosRepository`) | El egreso con origen `incentivo_mensajero` es documento `incentivo_mensajero` (id = `origenId`); su reverso no | El panel «Ver» de la caja ofrece «Anular…» y sabe si ya está anulado (R16), como el premio. |

**Completitud.** Cada `Record` total sobre los tres enums deja de compilar hasta que decide; las
filas «no cambia» llevan su aserción en el test PG de R7/R8/R17.

---

## 6. Capas, contratos y flujos

```
components/shared/wallet/RegistrarMovimientoDialog.tsx      clase nueva "incentivo_mensajero"
app/(app)/wallet/_components/wallet-conceptos-manuales.ts   concepto "incentivo_a_mensajero"
lib/actions/incentivo-mensajero.ts                          NUEVO ('use server')
  └─ lib/services/IncentivoMensajeroService.ts               NUEVO: rol, resolución del cierre, escrituras
       ├─ Pick<ILiquidacionPagoRepository, "listarCierresImputables" | "bloquearBeneficiario" | "obtenerCierreParaPago">
       ├─ Pick<IPagoMensajeroMovimientoRepository, "obtenerNombreMensajero" | "crearMovimientos" | "obtenerIncentivo">
       ├─ ICajaIncentivoMensajeroFeedService                  NUEVO puerto estrecho (2 métodos)
       └─ IncentivoTxRunner                                   transacción inyectada
lib/actions/wallet-anulacion.ts                             + camino "incentivo_mensajero"
lib/services/WalletAnulacionService.ts                      + enrutado (§6.3)
```

- **Puerto estrecho de caja.** `ICajaIncentivoMensajeroFeedService` expone `emitirEgreso(tx, {
  incentivoId, monto, descripcion, registradoPor, fechaMovimiento, claveIdempotencia })` y
  `reversarEgreso(tx, {…})`. **No acepta tipo, categoría ni origen**: los fija su implementación con
  literales. Es el patrón de `CajaPremioRankingFeedService`: el servicio del incentivo no puede
  *expresar* otra escritura en la caja.
- **Escritura del libro.** Sigue siendo `PagoMensajeroMovimientoRepository.crearMovimientos` (censo
  de la guardia `caja-173-alcance`). Su entrada gana un `id?` opcional para fijar X.
- **Lectura nueva.** `obtenerIncentivo(id, tx?)` devuelve:

  ```ts
  { id, mensajeroId, monto, cierreId, anulado: boolean } | null
  ```

  Solo la categoría `incentivo`. `anulado` = existe `reverso_incentivo` con `origen_id = id`.

### 6.1 Registrar

```ts
registrarIncentivoMensajeroAction(fd: FormData)
  // mensajeroId, monto, motivo, fecha?, claveIdempotencia — zod .strict() en el borde
  -> { status: "ok"; incentivo: { id; monto; cierreId; mensajeroNombre }; cuentaPorPagar: string }
   | { status: "ya_registrado" } | { status: "sin_cierre_aprobado" } | { status: "no_encontrado" }
   | { status: "forbidden" } | { status: "unauthenticated" }
   | { status: "validation_error"; fieldErrors }
```

1. Rol (R1) **antes** de leer nada.
2. Validación (R3): las mismas piezas que los demás conceptos manuales (monto STRING escala ≤ 2 y > 0;
   motivo recortado; fecha `YYYY-MM-DD` válida y no futura con `fechaCalendarioCR`). El implementer
   reutiliza los schemas que ya existen; no escribe otros.
3. `obtenerNombreMensajero` → `null` ⇒ `no_encontrado` (R4; RLS por empresa).
4. Cierre: el `aprobado` más reciente de `listarCierresImputables(mensajeroId)`, por `solicitadoAt`
   descendente y desempate por `id`. Ninguno ⇒ `sin_cierre_aprobado` (R5).
5. Transacción:
   1. `bloquearBeneficiario({tipo:"cierre", cierreId})`: el mismo candado que el pago, así que
      serializa contra un reparto simultáneo;
   2. `obtenerCierreParaPago(cierreId, tx)` sigue `aprobado` (si no, `sin_cierre_aprobado`);
   3. **caja primero**: `emitirEgreso` con la clave. Si escribe 0 filas ⇒ `ya_registrado` (R10) y no
      se escribe nada más;
   4. devengo X. Si escribe 0 filas ⇒ `throw`: se revierte todo (R11), nunca `ok`.
6. `ok` con la cuenta por pagar resultante, derivada en el servidor.

### 6.2 Anular

```ts
anularIncentivoMensajeroAction({ incentivoId, motivo })
  -> { status: "ok" } | { status: "ya_anulado" } | { status: "no_encontrado" }
   | { status: "forbidden" } | { status: "unauthenticated" } | { status: "validation_error"; … }
```

1. Rol (R1).
2. `obtenerIncentivo`: `null` ⇒ `no_encontrado` (R4); `anulado` ⇒ `ya_anulado` (R15).
3. Transacción:
   1. candado del cierre del incentivo;
   2. `reverso_incentivo` con origen `(incentivo_mensajero, X)`. Si escribe 0 filas (lo rechazó el
      único de origen) ⇒ `ya_anulado`;
   3. `reversarEgreso`. Si escribe 0 filas ⇒ `throw` (R11).

No hay guarda de «ya pagado» (Q2, por defecto).

### 6.3 Enrutado de la anulación (R16)

`WalletAnulacionService`:

- **`rutaDeMensajero`.** `categoria === "incentivo"` ⇒ `ruta("incentivo_mensajero", f.id)`;
  `reverso_incentivo` ⇒ `contra_asiento`.
  - **Va ANTES** de la línea `if (f.origenTipo === "cierre_dia") return noAnulable("nace_de_un_cierre")`:
    el incentivo tiene origen `cierre_dia`, y en otro orden saldría como «nace de un cierre». Hay un
    test que mata esa mutación.
- **`rutaDeCaja`.** `egreso_pago_mensajero` con origen `incentivo_mensajero` ⇒
  `ruta("incentivo_mensajero", f.origenId)`. El `ingreso_ajuste` de ese origen cae en el
  `contra_asiento` final, como hoy.
- **`CaminoAnulacion`** gana `incentivo_mensajero`, y `ACCION_DEL_CAMINO` gana su línea (es un
  `Record` total).

### 6.4 Pantalla (Tanda B)

- **Concepto nuevo `incentivo_a_mensajero`.**
  - Va en el grupo `sale`, justo después de `pago_a_mensajero`.
  - `destino: { clase: "incentivo_mensajero", categoria: "egreso_pago_mensajero", categoriaMensajero: "incentivo" }`.
  - La cuenta es `mensajero`, con el selector que ya usa el pago.
  - La descripción es el motivo; tiene fecha.
  - Libro: `"caja_y_mensajero"`. Es una variante nueva de `LibroDestino`, con su frase: «Se registra
    en la caja como «…» y en el libro del mensajero como «Incentivo».».
- **Textos propuestos** (el humano los puede cambiar al aprobar):
  - Rótulo: «La empresa le da un incentivo a un mensajero», con `EMPRESA.alInicio`.
  - Frase del efecto: «La empresa le reconoce un incentivo al mensajero: sube lo que le debe y baja su
    ganancia.»
  - Cabecera: «Elegí el mensajero, el monto, el motivo y la fecha. El incentivo se suma a lo que la
    empresa le debe y se paga con «La empresa le paga a un mensajero». No se edita: si hay un error,
    se anula con un motivo.»
- **«Así queda»:**
  - `ConceptoRegistro` gana `incentivo_a_mensajero`.
  - Su fila en `EFECTO_POR_TIPO`: `{ cuenta: "mensajero", caja: [{ tipo: "egreso", categoria:
    "egreso_pago_mensajero" }], enCuenta: "devengo" }`.
  - `enCuenta` gana `"devengo"`: la cuenta por pagar se recalcula con `devengado + M` en lugar de
    `pagado + M`.
- **Respuestas del diálogo:**
  - `ok`/`ya_registrado` ⇒ toast.
  - `sin_cierre_aprobado` ⇒ error en el campo del mensajero: «Este mensajero no tiene ningún cierre
    aprobado; el incentivo no se puede imputar todavía.»
  - El resto ⇒ `comun(res)`.
- **Dinero seguro:** montos STRING del servidor, pintados con el helper de moneda que ya existe. En
  el cliente no hay `Number(`, `parseFloat` ni restas.

---

## 7. Permisos

- **En el servidor**, `esAccesoTotal(actor.rol)` (maestro o admin) **antes de leer o escribir**, en
  `registrar` y en `anular`.
- **En la action**, sin sesión ⇒ `unauthenticated` antes del schema.
- **El enrutador** de anulación ya aplica el mismo predicado antes de leer (`WalletAnulacionService:39`).
- **La pantalla** (`/wallet`) ya restringe la entrada, pero no se confía en ella.

## 8. Multi-empresa y país

- **Sin tabla nueva.** Las filas toman `organizacion_id` del DEFAULT de la transacción de la empresa.
- **La RLS por empresa** de los dos libros y de `cierre_dia`/`usuario` hace que:
  - un mensajero de otra empresa no exista (`no_encontrado`);
  - un cierre de otra empresa no aparezca en `listarCierresImputables`;
  - un incentivo de otra empresa no aparezca en `obtenerIncentivo`.

  El test PG de R4 lo prueba con dos empresas.
- **País.** El monto es de la moneda de la empresa, con el formato del helper que ya existe; no hay
  literal de moneda. No toca impuestos ni métodos de pago. Las fechas usan la convención CR que ya usa
  todo el registro manual (`fecha-cr.ts`); esta ficha no la generaliza.

---

## 9. Alternativas descartadas

**A. Usar `pago_a_mensajero` o `ajuste_devengo`.**

- `pago_a_mensajero` es un **pago** (`liquidacion`): baja la cuenta por pagar en vez de subirla y no
  toca la ganancia (`progress/features/SLT-68.md > Evaluación`).
- `ajuste_devengo` se rotula «Ajuste (devengo)» y ya lo usan los contraasientos de la anulación de
  liquidaciones; el humano pidió categoría propia (D6).
- Reusar `premio_ranking` mentiría sobre el origen y lo mezclaría con el podio.

**B. No imputar el incentivo a ningún cierre** (origen `incentivo_mensajero` también en el devengo).
Sería más simple: sin tocar el único de origen ni la suma de lo pagable. Se descarta por medición: el
reparto de la 205 solo paga entre cierres, y lo demás es «deuda no imputable», que la pantalla de
pago no sabe saldar. El incentivo quedaría debido para siempre, o habría que construir un camino de
pago nuevo dentro de un hotfix.

**C. Tabla documento `incentivo_mensajero`** (como `liquidacion_pago` o `abono_tienda`), con el cierre
y la clave en el documento. Sería el modelo más «limpio» para un concepto con identidad propia. Se
descarta por tamaño:

- una tabla nueva con `organizacion_id`, política RLS, triggers de misma empresa y REVOKE;
- su alta en `modelos-de-negocio` y en las guardias de multi-empresa;
- y aun así el devengo tendría que colgar del cierre para ser pagable.

El id del devengo cumple el papel de documento sin nada de eso.

**D. Contraasiento como `ajuste_pago` colgado del cierre** (patrón literal de la 293). Se descarta
por dos motivos:

- sin `premio_dia` no hay forma de separar ese `ajuste_pago` de cualquier otro, ni en la suma de lo
  pagable ni en la conciliación;
- colgado del cierre, nada en la base impide dos anulaciones del mismo incentivo.

`reverso_incentivo` con origen X resuelve las dos cosas con el único de origen que ya existe.

**E. El egreso de caja con origen `(cierre_dia, C)`.** Choca con el `egreso_pago_mensajero` que el
feed ya escribió al aprobar ese cierre. `DO NOTHING` ⇒ dinero fuera de la caja sin registro (293
§11-C).

**F. Una sola migración.** Falla con 55P04 al usar en el CHECK los valores recién añadidos (SL-45 lo
documenta). Son dos carpetas.

**G. Tipos propios en `historial_accion` ya.** Ver Q3: el `down.sql` de esta rama recrearía
`historial_accion_tipo` sin los dos valores que `dev` ya añadió. Se deja para una ficha de
seguimiento.

---

## 10. Verificación

**Tests contra Postgres real** donde viven el CHECK, el único y las sumas. Las mutaciones de la tabla
se aplican una a una; cada una debe poner rojo su test y se revierte.

| Mutación | Test que debe ponerse rojo |
|---|---|
| Quitar `'incentivo'` del CHECK tipo↔categoría | R6 (23514 al registrar) |
| Dejar `'incentivo'` dentro del predicado de `origen_uq` | R9 (el segundo incentivo vuelve como `ya_registrado`) |
| Quitar la rama `incentivo` de `sumarPremiosVivosPorCierre` | R8 |
| Quitar la resta de `reverso_incentivo` en esa suma | R14 |
| Quitar `incentivo`/`reverso_incentivo` del filtro de la conciliación | R17 |
| No emitir el egreso de caja | R7 (la ganancia no baja) |
| Invertir el orden de las ramas en `rutaDeMensajero` | R16 (`nace_de_un_cierre`) |
| Quitar el gate de rol | R1 |
| Quitar el CHECK de origen | R12 |

Los tests de servicio usan dobles, así que no ven el SQL. El `WHERE` se prueba donde vive.

**E2E (R22) — no se aplaza.** «Dinero: wallet y liquidación de mensajeros» es flujo crítico
(`docs/checkpoints-proyecto.md`). El archivo es `e2e/incentivo-mensajero-slt68.spec.ts`:

- siembra un mensajero con un cierre aprobado, con la siembra que ya usan los E2E de wallet;
- el maestro registra un incentivo desde el diálogo de `/wallet`;
- en `/wallet/mensajeros` ve la fila «Incentivo» y la cuenta por pagar +M;
- lo anula desde «Ver»;
- la cuenta vuelve.

En la PR a `prod`, CI corre el E2E.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| `dev` llega a `prod` después con migraciones de timestamp anterior a las de esta rama | Las de esta rama solo añaden valores y retocan un CHECK y un índice que `dev` no toca (medido en el `dev` local; T0 lo vuelve a medir contra `origin/dev`). Al mergear `prod` → `dev`, el implementer comprueba que no hay conflicto en `schema.prisma` ni en las tuplas/`Record` tocados. |
| `down.sql` incompleto (un objeto dependiente olvidado aborta el rollback a mitad) | Inventario de dependencias en T0 + test de ida y vuelta (R21). |
| Base local compartida entre worktrees | Aplicar con `prisma migrate deploy` y avisar; `prisma generate` rompe el typecheck de otros worktrees (memoria del proyecto). |
| Primer incentivo en producción | El leader lo verifica tras desplegar, con importes anotados: cuenta por pagar, ganancia y pagable del cierre. |
