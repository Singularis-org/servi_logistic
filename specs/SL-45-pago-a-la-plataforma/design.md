# SL-45 «Pago a la plataforma desde la wallet» — design

## Lo que ya existe

Búsqueda hecha el 2026-10-24 con los términos `pago a la plataforma`, `pago_plataforma`, `deuda`,
`saldar`, `pasarela` y `factur`. El MCP `codebase-memory-mcp` no estaba entre las herramientas de este
agente, así que el código se exploró con Grep y Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board (`feature_list.json`) | **SL-40** «Cobro de la plataforma por orden» (done): crea los cargos y la región de la deuda, y deja fuera a propósito «pagos de la empresa a la plataforma» y «saldar la deuda». **SL-26** «Panel de superadmin» (pending). **SL-22** «Métodos de pago configurables por país» (pending). | No hay duplicado: SL-45 es lo que SL-40 dejó fuera. La vista del superadmin queda para SL-26 salvo P2. El método de pago no se toca: es SL-22. |
| Specs | Ninguno registra pagos a la plataforma (`grep -ril "pago_plataforma\|pago a la plataforma" specs/`: nada). Los moldes son **458-B** (anulación uniforme de los egresos sin documento), **457** (pago contra un saldo, con tope) y **334/461** (catálogo de conceptos manuales, idempotencia). | Se reutilizan sus caminos (§5, §6). |
| `lib/services/WalletEgresoService.ts`, `lib/actions/wallet-egresos.ts` | Registro de un egreso manual (sueldo, gasto de la empresa): `origen_tipo = gasto`, idempotencia por clave, historial `egreso_administrativo_registrado`, referencia y comprobante opcionales. | **Se reutiliza.** El pago es un tipo más de egreso manual, con un tope (§6). |
| `EgresoCajaAnulacionService`, `WalletAnulacionService`, `anularMovimientoAction` | Todo egreso con `origen_tipo = gasto` se anula con motivo: constancia en `ajuste_caja_anulacion` y contra-asiento `ingreso_ajuste` con `origen_id` = el egreso. El libro ya le ofrece «Anular…» (`tipoDeDocumentoOriginal` → `egreso_caja`). | **Se reutiliza sin cambios** (D6, §5). |
| `app/(app)/wallet/_components/wallet-conceptos-manuales.ts` | El catálogo de los diez conceptos del diálogo, con sus `Record` totales (`FRASE_DEL_EFECTO`, `CONCEPTO_REGISTRO_DE`). | Entra el undécimo (§7.1). |
| `components/shared/wallet/RegistrarMovimientoDialog.tsx` | El diálogo único, con `conceptoInicial` y `etiquetaBoton` (458-D lo usa así en `EstadoCuentaAcciones.tsx`). | El botón de la región lo abre igual (§7.2). |
| `lib/utils/deuda-plataforma.ts`, `DeudaPlataformaService`, `CobroPlataformaMovimientoRepository` (SL-40) | La deuda como Σ cargo − Σ reverso. | Gana el tercer término y el estado (§3). |
| Categorías del libro (`WalletMovimientoCategoria`) | Ninguna es un pago a la plataforma. `egreso_gasto` está reservada y sin uso desde la 45. | Categoría nueva (D8, §2). Reutilizar `egreso_gasto` queda descartado (§11). |

## 1. Evidencia: lo que hay hoy

- La deuda (SL-40) se lee en `DeudaPlataformaService.verDeuda` con una sola suma por tipo sobre
  `cobro_plataforma_movimiento`. No toca `wallet_movimiento` (SL-40 D10).
- La región se pinta desde `REGIONES_BOLSILLO_EMPRESA` (`wallet-labels.ts`), con el rótulo y la pista
  fijos y sin acciones. `WalletModule` recibe `deudaPlataforma` por props desde la página y **no la
  vuelve a pedir** tras registrar o anular (`recargarTrasCambio` solo relee la caja y el libro).
- Los egresos manuales que se anulan sin documento propio son exactamente los de `origen_tipo = gasto`
  (`EgresoCajaAnulacionService.esEgresoAnulable`). Que una fila esté anulada lo dice su contra-asiento,
  `ingreso_ajuste` con `origen_tipo = gasto` y `origen_id` = el egreso. El índice único de
  `(origen_tipo, origen_id, categoria)` impide que haya dos.

## 2. La categoría (D8)

`egreso_pago_plataforma`, un valor nuevo de `wallet_movimiento_categoria`.

| Pieza | Valor | Por qué |
|---|---|---|
| `NATURALEZA_POR_CATEGORIA` | `propio` | Es dinero de la empresa que sale para pagar un servicio que ella usa. |
| `LIQUIDEZ_POR_CATEGORIA` | `efectivo` | El dinero sale de verdad: sube «Salió» y baja la cifra principal (R8). |
| `CATEGORIA_LABEL` (`lib/constants/wallet-rotulos.ts`) | «Pago a la plataforma» | Nombre en el libro, el diálogo y las descargas (R6, R23, R26). |
| Composición | `WALLET_EGRESO_NOMBRADO_SEED`, como `egreso_sueldo` | Fila propia en «Egresos» y no «Otros gastos» (R24). |
| `NOMBRE_EGRESO` (`lib/utils/egreso-anulable.ts`) | «Pago a la plataforma» | La descripción del contra-asiento («Anulación de: …»). |
| `metrics.ts > ganancia_empresa.definicion.categorias` | se añade | La guardia `metrics-caja-naturaleza` exige «propio menos IVA» (R25). |
| `aporte-por-orden.ts` | `sin_reparto`, `no_nace_de_un_cierre` | No nace de un cierre. |
| `wallet_movimiento_tipo_categoria_check` | en el lado `egreso` | La regla tipo-categoría de la base. |

El contra-asiento de la anulación es el `ingreso_ajuste` de siempre (§5): no hace falta categoría de
reverso.

`TIPO_EGRESO_MANUAL_SEED` gana `pago_plataforma`, y `TIPO_EGRESO_MANUAL_A_CATEGORIA.pago_plataforma =
"egreso_pago_plataforma"`. La regla «el gasto fijo no se registra a mano» sigue igual: `gasto_fijo`
sigue fuera del seed.

## 3. La deuda (R13, R14, D3, D4)

```
deuda = Σ cargos − Σ reversos − Σ pagos vigentes
pago vigente = fila de wallet_movimiento con categoria = egreso_pago_plataforma
               y SIN contra-asiento (ingreso_ajuste, origen_tipo = gasto, origen_id = la fila)
```

- **Lectura.** Un repositorio nuevo, `PagoPlataformaRepository.sumaPagosVigentes(cliente?)`. Hace dos
  consultas Prisma sobre `wallet_movimiento`, sin SQL a mano:
  1. `findMany` de los pagos (`id`, `monto`);
  2. los `origenId` de sus contra-asientos (`categoria = ingreso_ajuste`, `origenTipo = gasto`,
     `origenId in ids`).

  Devuelve Σ de los pagos sin contra-asiento, como texto. La extensión filtra por empresa y la RLS lo
  respalda (R20). Con los índices `(tipo, categoria)` y `(origen_tipo, origen_id)`, que ya existen, no
  hace falta índice nuevo.
- **Derivación.** `derivarDeudaPlataforma(sumas, pagosVigentes)` en `lib/utils/deuda-plataforma.ts`.
  Es pura, con `Prisma.Decimal` dentro, y devuelve:

  ```ts
  type DeudaPlataformaDTO = {
    deuda: string;                       // con signo: "500.00", "0.00", "-500.00"
    estado: "debe" | "al_dia" | "a_favor";
    importe: string;                     // |deuda|, lo que se pinta
  };
  ```

  Rompe el contrato de SL-40 (`{ deuda }`) solo para añadir campos: `deuda` conserva su significado
  cuando no hay pagos.
- **Servicio.** `DeudaPlataformaService.verDeuda` gana la dependencia `IPagoPlataformaRepository`. El
  orden sigue igual: `esAccesoTotal` antes de la base. El composition root
  (`lib/actions/deuda-plataforma.ts`) **pasa** el repositorio real, y su test lo comprueba (memoria «el
  composition root que no inyecta»).
- **¿Por qué rechazar el sobrepago (D4)?** Ya es la regla de los dos pagos contra un saldo del repo:
  457 R15 (una tienda le paga a la empresa, solo hasta lo que debe) y 172 R31 (la empresa le paga a una
  tienda, solo hasta lo que tiene a favor). El saldo a favor sigue siendo posible, pero solo por
  reversos, y la región lo dice (R3).

### Ejemplo numérico (el del test de integración)

El valor global está en 500,00. B tiene una excepción de 300,00.

| Paso | Deuda de A | Estado de A | Δ caja de A | Δ ganancia de A | Deuda de B |
|---|---|---|---|---|---|
| A crea 3 órdenes, B crea 1 | 1.500,00 | debe | 0 | 0 | 300,00 |
| A paga 1.000,00 | 500,00 | debe | −1.000,00 | −1.000,00 | 300,00 |
| A intenta pagar 600,00 | 500,00 (R9) | debe | 0 | 0 | 300,00 |
| A anula el pago de 1.000,00 | 1.500,00 | debe | +1.000,00 | +1.000,00 | 300,00 |
| A anula el mismo pago otra vez | 1.500,00 (`ya_anulado`) | debe | 0 | 0 | 300,00 |
| A paga 1.500,00 | 0,00 | al día | −1.500,00 | −1.500,00 | 300,00 |
| A intenta pagar 1,00 | 0,00 (R9) | al día | 0 | 0 | 300,00 |
| A elimina una orden (reverso de SL-40) | −500,00 | a favor (importe 500,00) | 0 | 0 | 300,00 |
| B paga 300,00 | −500,00 | a favor | 0 | 0 | 0,00 |

## 4. El efecto en la caja (R8, R15, D9)

- **Registrar M.** La cifra principal −M, «Salió» +M y la ganancia −M (egreso propio en efectivo).
  «De las tiendas», el capital y el IVA no cambian. «De la empresa» en la barra −M.
- **Anular M.** El contra-asiento `ingreso_ajuste` (propio, efectivo): la cifra principal +M, «Entró»
  +M y la ganancia +M. Es lo mismo que pasa hoy al anular un sueldo.
- **Por qué baja la ganancia (D9).** Desde SL-39 la ganancia de la caja es de caja: ingresos propios
  menos egresos propios cobrados y pagados. El cobro de la plataforma es un costo de la empresa, igual
  que un sueldo. Mientras solo era deuda no movía nada (SL-40 D10). Pagado, sale.
- `derivarCaja` no cambia: la categoría nueva cae en las cubetas que ya existen por su naturaleza y su
  liquidez. Las guardias `caja-derivaciones` y `caja-composicion-exhaustiva` siguen con el mismo número
  de llamadas.

## 5. La anulación (D6, R15–R18, R21, R23)

Sin código nuevo de anulación. Un pago es un egreso con `origen_tipo = gasto`, así que:

- `tipoDeDocumentoOriginal` lo marca `egreso_caja` y el libro le ofrece «Anular…» (R23);
- `WalletAnulacionService.rutaDeCaja` lo manda a `egreso_caja`;
- `EgresoCajaAnulacionService.anular` hace, en este orden: rol primero (R19); lectura por id, que con la
  extensión de SL-17 no ve filas de otra empresa (R21: `no_encontrado`); constancia con motivo; y
  contra-asiento por el monto **del pago** (R15). El segundo intento responde `ya_anulado` (R16);
- la anulación no mira la deuda (R18);
- el libro es *append-only*: no hay `update` ni `delete` del pago (R17, R3 de la 42).

T6 lo **comprueba**, no lo reescribe: el lector `egresos` de `LectoresDocumentosCaja`
(`EgresoCajaDocumentosRepository`) tiene que cubrir cualquier egreso con origen `gasto` y no una lista
de categorías. Si filtra por lista, gana `egreso_pago_plataforma` y nada más.

## 6. El registro y el tope (R7, R9–R12, R19, R20)

**Camino.** El concepto del diálogo es un `egreso_administrativo` con `tipoEgreso: "pago_plataforma"`.
Usa `registrarEgresoAdministrativoAction` y `WalletEgresoService.registrarEgreso`, que ya traen la
idempotencia por clave (R11), el historial (R7), la referencia y el comprobante opcional (R6) y el rol
primero (R19).

**Lo único nuevo es el tope.** Tiene que decidirse dentro de la misma transacción que el `INSERT`
(R10):

1. **`ITopePagoPlataforma`** (`lib/interfaces/services/ITopePagoPlataformaService.ts`) y su
   implementación `TopePagoPlataformaService`, con `comprobar(tx, monto)`:
   - toma un candado de transacción por empresa: `pg_advisory_xact_lock` con una clave derivada de
     `'pago_plataforma:' || organizacion_id`. El molde es `AporteCapitalRepository.bloquearSaldoInicial`,
     y el candado vive en `PagoPlataformaRepository.bloquear(tx)`;
   - lee la deuda vigente **con `tx`**: `CobroPlataformaMovimientoRepository.sumasPorTipo` y
     `PagoPlataformaRepository.sumaPagosVigentes`, los dos con un cliente opcional;
   - con `derivarDeudaPlataforma`, devuelve `"cabe"` o `"supera"` (`Prisma.Decimal`, nunca `Number`).
2. **`WalletMovimientoRepository.crearMovimientoRegistrado`** gana un último parámetro opcional,
   `antes?: (tx) => Promise<void>`. Corre dentro de su transacción y antes del `INSERT`. Sin él, la
   llamada es exactamente la de hoy.
3. **`WalletEgresoService`** recibe `ITopePagoPlataforma` por constructor. Solo cuando
   `tipoEgreso === "pago_plataforma"`:
   - pasa un `antes` que llama a `comprobar` y lanza `TopeSuperadoError` si no cabe;
   - el servicio traduce ese error a `validation_error` en `monto` (R9).

   Para los demás tipos no pasa nada nuevo.
4. **Composition root** (`lib/actions/wallet-egresos.ts > buildService`): construye y **pasa**
   `TopePagoPlataformaService` con los repositorios reales. Su test lo comprueba.
   - Sin tope inyectado, registrar `pago_plataforma` **lanza**: así falla de forma ruidosa, y nunca se
     acepta un pago sin tope.

**Orden de un registro**, con el tope ya comprobado dentro de la transacción:

1. sesión;
2. zod (R12);
3. `esAccesoTotal` (R19);
4. la transacción: candado, deuda, comparación, `INSERT`, historial y laterales.

Si la clave está repetida, la idempotencia responde `ya_registrado` sin pasar por el tope. Un reenvío
del mismo pago no es un pago de más.

**«A quién».** `aQuienDelConcepto` devuelve `null` para este concepto: la contraparte es la plataforma.
T0 localiza dónde se exige hoy «a quién» en los egresos administrativos (el diálogo, el schema
`registrarEgresoConLateralesSchema` o el servicio) y lo deja opcional para `pago_plataforma` en ese mismo
sitio.

**Fecha.** Las reglas de `fechaMovimientoSchema` del egreso manual, sin cambios (R12).

## 7. Pantallas (existentes: sin `/design`)

### 7.1 El diálogo (`wallet-conceptos-manuales.ts`)

| Campo | Valor |
|---|---|
| `id` | `pago_plataforma` (en `CONCEPTO_MANUAL_IDS`, justo después de `pago_a_mensajero`, en el tramo «sale») |
| `label` | «Pago a la plataforma» |
| `destino` | `{ clase: "egreso_administrativo", tipoEgreso: "pago_plataforma", categoria: "egreso_pago_plataforma" }` |
| `descripcionLabel` / `placeholder` | `DESCRIPCION_EGRESO_LABEL.pago_plataforma` = «Referencia del pago»; placeholder «Ej. Transferencia del cobro de octubre» |
| `FRASE_DEL_EFECTO` | «Sale dinero de ${EMPRESA.enFrase} hacia la plataforma y baja lo que ${EMPRESA.enFrase} le debe; baja la ganancia.» |
| `CONCEPTO_REGISTRO_DE` | `pago_plataforma` (nuevo en `CONCEPTO_REGISTRO_SEED`); `EFECTO_POR_TIPO.pago_plataforma = { cuenta: null, caja: [{ tipo: "egreso", categoria: "egreso_pago_plataforma" }], enCuenta: null }` |
| Cabecera | `CABECERA_CAJA`, la de siempre: el pago solo escribe en la caja |
| Libro | `fraseDelLibro`: «Se registra en el libro como «Pago a la plataforma».» |

El servidor responde el error del tope en `monto`. El diálogo ya pinta los `fieldErrors` bajo el campo.

### 7.2 La región (`wallet-labels.ts`, `CajaResumenCard.tsx`, `WalletModule.tsx`)

- **Textos** en `CAJA_RESUMEN_LABEL`, con «la empresa» desde `EMPRESA.enFrase` y «plataforma» en
  minúscula (SL-40 §9.2):

  | Estado | Rótulo | Pista | Botón |
  |---|---|---|---|
  | `debe` | «Lo que la empresa debe a la plataforma» | «Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.» | «Registrar pago a la plataforma» |
  | `al_dia` | «Lo que la empresa debe a la plataforma» | «La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí.» | — |
  | `a_favor` | «Saldo a favor de la empresa con la plataforma» | «La empresa pagó más de lo que hoy debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.» | — |

- **`RegionBolsilloEmpresa`.** `rotulo` y `pista` pasan de `string` a `string | ((datos) => string)`.
  Las de SL-39 siguen siendo texto. La de la deuda elige por `deudaPlataforma.estado` y su `valor` lee
  `importe`. Sigue sin insignia y sin color de signo (SL-40 §9.2).
- **Botón.** `CajaResumenCard` gana la prop `accionDeudaPlataforma?: ReactNode`, que pinta dentro de la
  región. `WalletModule` le pasa
  `<RegistrarMovimientoDialog conceptoInicial="pago_plataforma" etiquetaBoton="Registrar pago a la plataforma" onRegistrado={recargarTrasCambio} />`,
  y solo si `estado === "debe"` (R1–R4). La decisión la toma el `estado` que mandó el servidor, no una
  comparación en el cliente (R14).
- **Recarga (R5).** `deudaPlataforma` pasa a ser estado de `WalletModule`, inicializado con la prop.
  `recargarTrasCambio` llama también a `verDeudaPlataformaAction()` y lo actualiza, con `forbidden`
  como `null`. Al cambiar los filtros no se vuelve a pedir (SL-40 R23).

### 7.3 Composición

`ComposicionGananciaCard` y `DesgloseEgresosLista` recorren el seed: la fila sale sola al entrar en
`WALLET_EGRESO_NOMBRADO_SEED`. Si el icono o la etiqueta salen de un `Record` total
(`composicion-detalle-labels.ts`), se añade la entrada.

### 7.4 Ayuda

`docs/ayuda/oficina/wallet-caja.md`, sección «Lo que la empresa debe a la plataforma»:

- la pista nueva;
- cómo se registra el pago y qué le pasa a la caja y a la ganancia;
- por qué no se puede pagar de más;
- cuándo aparece el saldo a favor;
- cómo se anula un pago mal registrado.

Se actualiza `actualizado:`.

## 8. Modelo de datos y migraciones

- **Sin tablas nuevas.** El pago es una fila de `wallet_movimiento`, que ya tiene `organizacion_id`, la
  política `wallet_movimiento_por_empresa`, sus triggers de SL-17 y el único por empresa de
  `clave_idempotencia`. La constancia de anulación vive en `ajuste_caja_anulacion`, también de negocio.
  No cambian ni los conteos de `rls-por-empresa` ni `scripts/verificar-rls-despliegue.ts`.
- **Prisma.** `egreso_pago_plataforma` en `enum WalletMovimientoCategoria`, con su comentario.

| Carpeta | `migration.sql` | `down.sql` |
|---|---|---|
| `20261024130000_pago_plataforma_categoria` | `ALTER TYPE "wallet_movimiento_categoria" ADD VALUE 'egreso_pago_plataforma';` y nada más. Postgres no deja usar un valor nuevo en la misma transacción en que se añade (por eso la 457 lo partió en dos). | La función `quitar_valores_de_enum`, copiada de `20260927120000_abono_tienda_457_enums/down.sql` con el sufijo `_sl45`. Lee la lista vigente de `pg_enum` y aborta si alguna fila usa el valor (R27). |
| `20261024130100_pago_plataforma_check` | `DROP` y `ADD` de `wallet_movimiento_tipo_categoria_check`, partiendo de la definición **vigente**, la de `20260928120100_wallet_458_tablas`, con `egreso_pago_plataforma` en el lado `egreso`. | Restaura la definición de la 458 tal cual. |

- A mano: `db:migrate:create` falla con P3006 en este repo.
- Si otra rama mergea antes a `dev` una migración con un timestamp posterior, estas se renombran **antes
  de aplicarse en ninguna base compartida** (memoria «Migración editada en sitio = drift»).
- `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts` cubre R27:
  1. aplica las dos migraciones;
  2. registra un pago;
  3. comprueba que el `down` aborta;
  4. borra el pago como dueño;
  5. aplica los dos `down.sql`;
  6. comprueba que el valor ya no está en `pg_enum` y que el CHECK es igual al de la 458.

## 9. P2: la columna del superadmin (solo si Carlos dice que sí)

- `EmpresasPlataformaRepository` (ya en `comoPlataforma`) añade, por empresa:
  - un `groupBy` de `cobro_plataforma_movimiento` por `(organizacion_id, tipo)`;
  - y los pagos vigentes, con la misma regla que §3, agrupados por `organizacion_id`.
- `EmpresaListada` gana `deudaPlataforma: DeudaPlataformaDTO`, derivada con `derivarDeudaPlataforma`.
- `EmpresasModule` pinta la columna «Plataforma» con «Debe 500,00», «Al día» o «A favor 500,00» (R28).
- Choca con SL-41 en `app/(app)/plataforma/empresas/page.tsx` y `EmpresasModule.tsx` (§13). Si P2 es
  no, ninguno de los dos archivos se toca.

## 10. Autorización, módulo y país

| Operación | Quién | Dónde | R |
|---|---|---|---|
| Registrar un pago | `maestro`, `admin` | `WalletEgresoService.registrarEgreso`, antes de la base | R19 |
| Anular un pago | `maestro`, `admin` | `WalletAnulacionService.enrutar` y `EgresoCajaAnulacionService.anular`, antes de leer | R19 |
| Ver la deuda | `maestro`, `admin` | `DeudaPlataformaService.verDeuda` (SL-40 R25) | R14 |
| Pagos de otra empresa | nadie | extensión y RLS de `wallet_movimiento` | R20, R21 |
| Escribir cargos | nadie desde una empresa | `REVOKE` de SL-40; la guardia `cobro-plataforma-solo-por-trigger` | R22 |

- No hay módulo que encender: el catálogo de módulos es SL-23.
- **País.**
  - La moneda: el importe va sin moneda y se pinta con `money`, como la caja. El riesgo de SL-21 es el
    mismo de SL-40 §7.
  - La fecha: el «hoy» del egreso manual (`fechaCalendarioCR`) ya está fijado por país en el código
    heredado. Esta ficha no lo cambia; es de SL-21.
  - Los métodos de pago (SL-22): el pago no pide método.
  - Impuestos: sin IVA (SL-40 P2).
  - Ningún literal de país ni de moneda en el código nuevo.

## 11. Alternativas descartadas

1. **Un documento propio, `pago_plataforma` + `pago_plataforma_anulacion`, con un reverso propio
   `ingreso_reverso_pago_plataforma`** (el molde de 457/459).
   - Son dos tablas de negocio nuevas, con su RLS y sus triggers, y tres valores de enum.
   - Hay que añadir un camino de anulación y un lector de documentos en `LectoresDocumentosCaja`, que
     arrastra a `WalletService` y a sus once tests.
   - Hay que añadir una rama nueva en el diálogo.
   - Todo eso para guardar lo que el egreso manual ya guarda: monto, fecha, referencia, comprobante,
     autor y anulación con motivo.

   Rompe «arreglar lo evidenciado, no rediseñar».
2. **Reutilizar `egreso_gasto`** (reservada y sin uso desde la 45), renombrándola en pantalla.
   - Se ahorra la migración del enum, pero el nombre miente.
   - Cualquier fila antigua con esa categoría, en una base que la tenga, contaría como pago y bajaría la
     deuda en silencio.
3. **Reutilizar `egreso_gasto_variable`** («Gasto de la empresa»).
   - No se puede distinguir un pago de un gasto, así que la deuda no se puede calcular.
   - La composición y la analítica los mezclarían.
4. **Admitir el sobrepago como saldo a favor.** Va contra el precedente de 457 y 172 (D4, P1).
5. **Bajar la deuda sin tocar la caja** (un «pago» solo en `cobro_plataforma_movimiento`).
   - Contradice el pedido: «el pago sale de la caja».
   - Obligaría a dar permiso de escritura a `servi_app` sobre la tabla de cargos, que es justo lo que el
     `REVOKE` de SL-40 cierra (R22).
6. **Comprobar el tope fuera de la transacción.** Dos pagos simultáneos pasarían los dos (R10). El
   candado por empresa dentro de la transacción es el molde de `bloquearSaldoInicial`.

## 12. Tests

### 12.1 El test que hoy falla: `tests/integration/db/pago-plataforma-sl45.test.ts`

Contra Postgres (`HAY_BASE_DE_DATOS`), con el cliente extendido y `conEmpresa`.

- **Montaje.**
  - El molde de `tests/integration/db/cobro-plataforma-cargos.test.ts`: empresas A y B, el valor global
    y la excepción de B con `CobroPlataformaTarifaRepository` real, y las órdenes con
    `OrdenRepository.createManyOrdenes` real.
  - Los servicios reales: `WalletEgresoService` con `TopePagoPlataformaService`,
    `EgresoCajaAnulacionService`, `DeudaPlataformaService` y `WalletService.verResumenCaja`.
- **Pasos:** la tabla de §3, uno a uno.
- **Afirma**, después de cada paso:
  - la deuda, el estado y el importe de A y de B (R13, R14, R20);
  - Δ de la cifra principal, «Salió», «Entró», la ganancia, «De las tiendas», el capital y el IVA
    (R8, R15);
  - el pago rechazado deja cero filas nuevas en `wallet_movimiento` y en `historial_accion` (R9);
  - el reenvío con la misma clave responde `ya_registrado` y deja una sola fila (R11);
  - la huella de `cobro_plataforma_movimiento` (filas y sumas) es idéntica antes y después de cada pago
    y de cada anulación (R22);
  - B intenta anular el pago de A y recibe `no_encontrado` sin escribir (R21);
  - con la deuda en «a favor», anular un pago funciona (R18).
- **Control de no vacuidad.** Antes de afirmar nada: los cargos existen (leídos con el cliente base) y la
  categoría está en `pg_enum`. Un `skip` por falta de base no cuenta como verde.
- **Mutaciones que lo deben matar**, una cada vez, medidas y revertidas:
  1. el servicio no llama al tope;
  2. `sumaPagosVigentes` cuenta también los pagos anulados;
  3. `NATURALEZA_POR_CATEGORIA.egreso_pago_plataforma = "terceros"`;
  4. `sumaPagosVigentes` sin el filtro de la extensión, con el cliente base: B ve los pagos de A.

### 12.2 Concurrencia: `tests/integration/db/pago-plataforma-sl45-concurrencia.test.ts`

- **Molde:** `abono-tienda-457-concurrencia.test.ts`.
- **Caso:** con una deuda de 500,00, dos pagos de 400,00 a la vez. Exactamente uno da `ok`, el otro
  `validation_error`, y la deuda queda en 100,00 (R10).
- **Mutación:** quitar el candado lo pone en rojo.

### 12.3 Puros, servicios, pantalla y guardias

| Archivo | Qué cubre |
|---|---|
| `tests/unit/utils/deuda-plataforma.test.ts` (cambia) | R13, R14: con pagos, los tres estados, el importe en positivo, decimales y sin `Number`. |
| `tests/unit/services/tope-pago-plataforma-service.test.ts` (nuevo) | `cabe` y `supera` en el borde exacto (igual a la deuda cabe; un céntimo más no), con deuda 0 y con deuda negativa (R9). |
| `tests/unit/services/wallet-egreso-service.test.ts` (cambia) | R19: `forbidden` sin tocar el repositorio para cada rol sin acceso total. El tope solo corre con `pago_plataforma`; sin tope inyectado, lanza. El `TopeSuperadoError` sale como `validation_error` en `monto` (R9). |
| `tests/unit/services/deuda-plataforma-service.test.ts` (cambia) | R14 con pagos y `forbidden` antes del repositorio. |
| `tests/unit/actions/wallet-egresos.composition-root.test.ts` (nuevo) y `deuda-plataforma.composition-root.test.ts` (cambia) | Los composition roots **pasan** el tope y el repositorio de pagos reales. |
| `tests/unit/components/wallet-conceptos-manuales.test.ts` (cambia) | R6: once conceptos, el nuevo en «sale», sus frases literales, sin «a quién». |
| `tests/unit/utils/efecto-movimiento.test.ts` (cambia) | El «Así queda» del pago: la caja y la ganancia bajan M. |
| `tests/unit/components/wallet-labels.test.ts` (cambia) | R1–R3: los textos literales de los tres estados, escritos a mano y no leídos de la constante. |
| `tests/components/WalletDeudaPlataformaSL45.test.tsx` (nuevo) | R1–R4, R14: los tres estados, el botón solo en «debe», que el botón abre el diálogo con «Pago a la plataforma» elegido, y ningún `Number(` ni `parseFloat`. |
| `tests/components/WalletDeudaPlataformaSL40.test.tsx` (cambia) | La pista vieja pasa a la de R1; lo demás de SL-40 sigue igual. |
| `tests/integration/wallet-page.test.tsx` (cambia) | R5: tras `onRegistrado` se llama a `verDeudaPlataformaAction` y la región pinta el valor nuevo. |
| Guardias | `metrics-caja-naturaleza` (R25), `caja-composicion-exhaustiva` (R24) y `caja-clasificacion-459`, si fija la lista de categorías propias. `cobro-plataforma-solo-por-trigger` sigue en verde sin tocarla (R22). |
| `tests/unit/analytics/finanzas-diario.test.ts` (cambia) | R25: un pago baja la ganancia del día. |
| `tests/integration/db/migracion-sl45-ida-y-vuelta.test.ts` (nuevo) | R27. |

**No regresión (R26 y SL-40):**

- siguen en verde sin tocarlos `tests/integration/db/libro-kardex-468.test.ts`,
  `tests/components/descarga/WalletDescarga.test.tsx`, `tests/integration/db/cobro-plataforma-cargos.test.ts`
  (incluido su caso R8 de `42501`) y `tests/integration/db/aislamiento-wallet.test.ts`;
- el Excel incluye la fila con su nombre.

### 12.4 E2E

- **Nuevo: `e2e/pago-plataforma-sl45.spec.ts`.** Usa `_dos-empresas-fixture.ts` y la siembra de SL-39
  **sin modificarlas**, solo importándolas. Pasos:
  1. A crea dos órdenes con el global en 500, y la región dice «₡1.000»;
  2. pulsa «Registrar pago a la plataforma» y paga 600, y la región dice «₡400» sin recargar;
  3. la cifra principal baja ₡600;
  4. intenta pagar 500 y ve el error bajo el monto;
  5. anula el pago desde el libro, y la región vuelve a «₡1.000»;
  6. B no ve nada de A.
- **Cambia:** `e2e/cobro-plataforma-sl40.spec.ts`, el literal de la pista (línea 53).
- **Se corren:** `e2e/wallet.spec.ts` y `e2e/dos-empresas-humo.spec.ts` (`docs/checkpoints-proyecto.md`).

## 13. Choques con las ramas en vuelo

| Archivo | SL-41 | SL-44 | Cómo se resuelve |
|---|---|---|---|
| `e2e/cobro-plataforma-sl40.spec.ts` | — | **sí**: entra en su alcance (cabecera de su `tasks.md`), aunque no está en su lista de archivos esperados | SL-45 cambia solo la constante de la pista (línea 53). Quien mergea segundo rebasa. Hay que avisar a SL-44 de que su lista no lo declara. |
| `e2e/_dos-empresas-fixture.ts`, `e2e/_wallet-iva-sl39-siembra.ts` | — | sí | SL-45 **solo los importa**. Si SL-44 cambia su API antes, el E2E nuevo se ajusta al rebasar. |
| `app/(app)/plataforma/empresas/page.tsx`, `EmpresasModule.tsx` | **sí** | — | Solo si P2 = sí (tanda E). Si no, no se tocan. |
| `db/migrations` | — | — | SL-41 y SL-44 no tienen migraciones a la vista. T0 lo vuelve a mirar. |

## 14. Dependencias

Ninguna librería nueva. Se usan `zod`, `@prisma/client` (`Prisma.Decimal`) y los componentes que ya están.

## 15. Riesgos

- **El lector de documentos `egresos` filtra por lista de categorías.** El pago saldría sin «Anular…».
  Se mira en T0, se corrige en T6, y el E2E lo cubre.
- **«A quién» obligatorio en el servidor.** Rompería el registro sin contraparte. Se mira en T0.
- **Tests que fijan la lista de tipos de egreso manual o los diez conceptos.** Cambian con un motivo
  escrito, y nunca contra su propia fuente (memoria «Literal: contrato o polizón»).
- **Rendimiento de la deuda.** Lee dos consultas más por carga de `/wallet`. Con los índices que ya
  existen, la consulta de contra-asientos va por `(origen_tipo, origen_id)`.
