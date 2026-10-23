# SL-39 «Wallet: IVA aparte de las ganancias» — design

## Lo que ya existe

Búsqueda hecha el 2026-10-23 con los términos `IVA`, `ganancia`, `impuesto`, `wallet` y `tesorería`:

- **Board** (`feature_list.json`): ninguna ficha separa el IVA de la ganancia.
  - Sale **SL-21** «Moneda e impuestos configurables por país» (pending): hace la tasa y el impuesto
    configurables por país. No toca la clasificación de la ganancia. Esta ficha no se solapa con ella:
    no toca la tasa, ni el rótulo «IVA», ni `tarifas`.
  - Sale **SL-40** «Cobro de la plataforma por orden» (pending): añadirá una línea a la wallet. Va a
    «Lo que NO entra»; el sitio queda preparado (§8).
  - Sale **SL-38** (in_progress), que tiene en vuelo `lib/utils/ingreso-empresa.ts`. Esta ficha no lo
    toca, tampoco en la parte del cierre (§12).
- **Specs**: ninguno separa el IVA de la ganancia. Los que la definen y que esta ficha corrige son
  `specs/173-caja-tesoreria` (la caja en dos cifras), `specs/231-wallet-caja-dos-bolsillos` (la
  composición), `specs/459-la-caja-muestra-el-dinero-real` (capital y cargos) y
  `specs/458-rediseno-wallet` (reversos del cobro por rechazo). Todos tratan el IVA como «propio», y
  por tanto como ganancia.
- **Código**: no existe ningún conjunto «categorías de IVA» en la caja. Lo que más se le parece es la
  definición de la métrica `ingreso_iva` (`lib/analytics/metrics.ts:600-620`), que ya agrupa
  exactamente las cuatro categorías. **Se reutiliza** como referencia de cuadre (R13), no se copia.
- **Grafo de código**: en esta sesión no estaba expuesto el MCP `codebase-memory-mcp`. La exploración
  se hizo con Grep/Read.

## 1. Evidencia: cómo se calcula hoy

### De dónde sale el IVA

1. La tasa vive por tarifa: `tarifas.iva_flete` e `iva_comision_cod`, en porcentaje
   (`db/schema.prisma:1635-1636`). Al solicitar el cierre se congela en `cierre_detail.tarifa_iva_flete`
   y `tarifa_iva_comision_cod` (`db/schema.prisma:2963-2964`).
2. `derivarIngresoOrden` (`lib/utils/ingreso-empresa.ts:150-190`) calcula por gestión el flete y su
   IVA (`:156-163`), la comisión COD y su IVA (`:165-172`), y el flete por devolución a origen y su IVA
   (`:186`).
3. Al aprobar el cierre, `agregarIngresosPorConcepto` (`lib/utils/ingreso-empresa.ts:724-764`) escribe
   en `wallet_movimiento` **una fila por concepto**. Las tres de IVA llevan su propia categoría:
   `ingreso_iva_flete`, `ingreso_iva_flete_devolucion` e `ingreso_iva_comision_cod`.
4. La anulación de un cobro por devolución a origen escribe `egreso_reverso_iva_flete_devolucion`
   (`lib/types/wallet.ts:84-87`).

**El libro ya guarda el IVA separado.** El fallo no está en los datos: está en cómo se leen.

### Dónde se suma a la ganancia

| Dónde | Qué hace |
|---|---|
| `lib/utils/caja-tesoreria.ts:67-69` y `:104` | `NATURALEZA_POR_CATEGORIA` declara las cuatro categorías de IVA como `"propio"`. |
| `lib/utils/caja-tesoreria.ts:220` y `:227` | `acumular` suma toda fila `propio` a `ingresosPropios` / `egresosPropios`, IVA incluido. |
| `lib/utils/caja-tesoreria.ts:338` y `:358` | `ganancia = derivarBalance(ingresosPropios, egresosPropios)`. **Aquí está la causa.** |
| `lib/utils/caja-tesoreria.ts:483-512` | `derivarComposicionGanancia` mete el IVA en la columna «Ingresos» (vía `WALLET_INGRESO_PROPIO_SEED`, `lib/types/wallet.ts:146-153,171-175`) y el reverso de IVA en «Egresos» (`WALLET_EGRESO_NOMBRADO_SEED`, `lib/types/wallet.ts:209-215`). |
| `lib/services/WalletService.ts:419-441` | `verResumenCaja`: una lectura (`agregarPorCategoriaYTipo`), dos derivaciones. |
| `lib/repositories/WalletMovimientoRepository.ts:327-345` | Agrupa por `(categoria, tipo)`. **El SQL no decide qué es ganancia**: la regla vive en la derivación pura. Lo mismo dice `FinanzasDiarioRepository.ts:25-28`. |
| `app/(app)/wallet/_components/CajaResumenCard.tsx:293-322` | Pinta `resumen.ganancia`, `ingresosPropios` y `egresosPropios`. |
| `app/(app)/wallet/_components/ComposicionGananciaCard.tsx:99-105,188-199,231-245` | Tres filas de IVA (icono `Percent`) dentro de «Ingresos», y el pie con la ganancia. La descripción (`:82-86`) dice que la ganancia incluye «impuestos». |
| `lib/analytics/metrics.ts:743-781` | La métrica `ganancia_empresa` declara las cuatro categorías de IVA. `AnaliticaFinancieraService.ts:239` y `:402-440` publica `derivarCaja(...).ganancia` y el bruto sobre esa lista. |
| `lib/utils/finanzas-diarias.ts:84,93,101,120,125` | La ganancia del día suma todo lo `propio`, IVA incluido. |
| `lib/services/ComoQuedoService.ts:52-59` y `lib/utils/efecto-movimiento.ts:80-82` | «Cómo quedó» y «Así queda» usan `derivarCaja`: se corrigen solos. |

Las descargas del libro (`lib/services/LibroKardexService.ts:127-148`,
`app/(app)/wallet/_components/wallet-ledger-descarga-columnas.ts`) no tienen cifra de ganancia: solo
el saldo de caja (`enCaja`, que no cambia) y la columna «Es dinero de». No hay PDF de la caja. Por eso
D5: no se tocan, y R19 lo comprueba.

### Ejemplo numérico

Una sola entrega con contra-entrega de 20.000,00. La tarifa tiene un flete hipotético de 2.500,00,
comisión COD del 3,50 % e IVA del 13,00 % en los dos conceptos (los porcentajes son los del ejemplo real
de `lib/utils/ingreso-empresa.ts:226`). Se paga 1.500,00 al mensajero.

| Concepto (categoría) | Importe |
|---|---|
| Flete (`ingreso_flete`) | 2.500,00 |
| IVA del flete (`ingreso_iva_flete`) | 325,00 |
| Comisión COD (`ingreso_comision_cod`) | 700,00 |
| IVA de la comisión (`ingreso_iva_comision_cod`) | 91,00 |
| Pago al mensajero (`egreso_pago_mensajero`) | 1.500,00 |

- **Hoy:** ganancia = (2.500 + 325 + 700 + 91) − 1.500 = **2.116,00**. Esa cifra es falsa: el IVA no
  es de la empresa.
- **Con esta ficha:**
  - ganancia = (2.500 + 700) − 1.500 = **1.700,00**;
  - IVA cobrado = 325 + 91 = **416,00**, en su línea;
  - «De la empresa» en la barra = 1.700 + 416 = 2.116,00, igual que hoy (R5).

## 2. El cambio

### 2.1 Clasificación (`lib/types/wallet.ts`, `lib/utils/caja-tesoreria.ts`)

La naturaleza (`propio`/`terceros`/`capital`) **no cambia**. El IVA sigue siendo dinero que la empresa
tiene en la caja, y por eso «Es dinero de» y el filtro «A quién» siguen igual (R19). Se añade una
segunda clasificación, ortogonal a la naturaleza:

- `WALLET_IVA_SEED` (en `lib/types/wallet.ts`) con las cuatro categorías de IVA, y su tipo
  `WalletCategoriaIva`. También sus dos mitades: `WALLET_INGRESO_IVA_SEED` (las tres de ingreso) y
  `WALLET_EGRESO_IVA_SEED` (el reverso).
- `WALLET_INGRESO_GANANCIA_SEED`: los ingresos propios menos los de IVA. Quedan cinco: flete, flete
  por devolución, comisión COD, ajuste y cobro a tienda. `WALLET_INGRESO_PROPIO_SEED` **no cambia**:
  sigue siendo «todos los ingresos propios», y la guardia de composición lo exige.
- `WALLET_EGRESO_NOMBRADO_SEED` pierde `egreso_reverso_iva_flete_devolucion`. Para que el reverso no
  caiga en «Otros gastos», `WALLET_EGRESO_CON_FILA_SEED` pasa a ser
  `[...DESGLOSADO, ...NOMBRADO, ...WALLET_EGRESO_IVA_SEED]`. El complemento se sigue derivando del
  catálogo.
- `COMPOSICION_FILA_SEED` conserva **los mismos miembros**: toda categoría de IVA sigue siendo una fila
  que se abre. `categoriasDeFilaComposicion` y `listarMovimientosDeFila` no cambian.

### 2.2 `acumular` y `derivarCaja`

`Acumulado` gana `ingresosIva` y `egresosIva`. Una fila de una categoría de IVA suma a esas cubetas **en
lugar de** a `ingresosPropios` / `egresosPropios`. A «Entró», «Salió», los cargos y los reversos de cargos
sigue sumando igual que hoy, porque eso lo decide la liquidez, que no cambia.

En `derivarCaja`:

```
propio = derivarBalance(ingresosPropios, egresosPropios)   // ganancia SIN IVA (R1, R3)
iva    = derivarBalance(ingresosIva, egresosIva)           // R2
deEmpresa = propio.balance + iva.balance + capital.balance // R5: misma cifra que hoy
```

- Las llamadas a `derivarBalance` pasan de cuatro a **cinco**. La guardia
  `caja-derivaciones.guardia.test.ts:122-130` se actualiza a cinco, con su motivo.
- Identidad (R4): `G + I + T + C = (ingP − egP) + (ingI − egI) + (ingT + rev − egT − cargos) + (ingC − egC) = Entró − Salió`.
  `G + I` es exactamente la ganancia de hoy, así que la identidad de la 459 se conserva.
- `derivarReparto` recibe el mismo `deEmpresa` que hoy: la barra no se mueve (R5).

### 2.3 `derivarComposicionGanancia`

Una fila de IVA va a `iva[categoria]` y **no** suma a `totalIngresos` ni a `totalEgresos`. El resto
queda igual. Con eso, `totalIngresos === resumen.ingresosPropios` y
`totalEgresos === resumen.egresosPropios` (R8). Lo vigila la guardia de composición, que ya existe.

### 2.4 Serie diaria (`lib/utils/finanzas-diarias.ts`)

`esPropio` pasa a «propio y no IVA», con el mismo predicado exportado desde `caja-tesoreria.ts`
(`esCategoriaIva`), no con una lista copiada. `entradas` y `salidas` no cambian. No se añade una serie
de IVA al gráfico: no la pidieron.

### 2.5 Catálogo de métricas (`lib/analytics/metrics.ts`)

- `ganancia_empresa.definicion.categorias` pierde las cuatro de IVA: quedan catorce.
- La descripción añade: «Sin el IVA: el IVA cobrado se publica aparte en `ingreso_iva`».
- `metrics-caja-naturaleza.guardia.test.ts:463-500` pasa de «exactamente las de naturaleza propio» a
  «las propio menos las de IVA». El módulo es puro y no puede importar `caja-tesoreria.ts`, así que la
  lista sigue escrita, y la guardia la compara en tiempo de ejecución con `WALLET_IVA_SEED`.

## 3. Modelo de datos

- **Sin cambios.** Ni tablas, ni columnas, ni valores de enum. No hay migración, así que no hay
  `down.sql`.
- `wallet_movimiento` ya tiene `organizacion_id`, su política RLS `wallet_movimiento_por_empresa` y la
  extensión de SL-17. La lectura sigue entrando por `WalletMovimientoRepository.agregarPorCategoriaYTipo`.

### Datos históricos (D8)

- Los movimientos de IVA anteriores ya son filas con su propia categoría. La nueva clasificación los
  saca de la ganancia **al leerlos**: no hay nada que recalcular, migrar ni congelar.
- `cierre_detail` congela las **entradas** de la fórmula (tasas incluidas), no la ganancia
  (`db/schema.prisma:2922-2964`). Tampoco hay ahí una cifra mezclada que corregir.
- `analytics_daily` no guarda ganancia: `ganancia_empresa` es `live` y se lee del libro.

Por eso esto no es una pregunta para Carlos.

## 4. Autorización y módulo

- Sin cambios. `WalletService.verResumenCaja` comprueba `esAccesoTotal(actor.rol)` **antes** de
  consultar la base (`lib/services/WalletService.ts:423`, R17). El IVA viaja en el mismo DTO, así que
  no abre ningún camino nuevo.
- La analítica mantiene su alcance por métrica (`ALCANCE_FINANCIERA`).
- Ningún módulo nuevo que encender.

## 5. Qué depende del país

- **La tasa** sale de `tarifas` y de su copia en `cierre_detail` (D6). Configurarla es SL-21.
- **El rótulo «IVA»** está en los textos de hoy (`lib/constants/wallet-rotulos.ts:34-42`) y en los
  nuevos de esta ficha.
  - SL-21 decidirá cómo se nombra el impuesto por país.
  - Para que lo cambie en un solo sitio, los rótulos nuevos viven en `wallet-labels.ts` y componen la
    palabra desde una constante, `IMPUESTO_ROTULO = "IVA"`. No queda escrita suelta en el JSX.
- **La moneda**: sin cambios (`money` de siempre).

## 6. Contratos I/O

Todos los importes son texto con dos decimales (R20).

```ts
// lib/types/wallet.ts — CajaResumenDTO gana dos campos (los demás no cambian de valor salvo
// `ganancia`, `ingresosPropios` y `egresosPropios`, que pierden el IVA):
iva: string;               // R2 — IVA de la caja, con signo
signoIva: WalletBalanceSigno;

// ComposicionGananciaDTO:
ingresos: Record<WalletIngresoGanancia, string>;     // 5 (antes 8)
totalIngresos: string;                               // === CajaResumenDTO.ingresosPropios
egresos: Record<WalletEgresoNombrado, string>;       // 4 (antes 5)
otrosEgresos: string;
totalEgresos: string;                                // === CajaResumenDTO.egresosPropios
hayOtrosEgresos: boolean;
iva: Record<WalletCategoriaIva, string>;             // NUEVO — 4 filas; el reverso, en positivo como toda fila de egreso
totalIva: string;                                    // NUEVO — === CajaResumenDTO.iva
```

`tests/integration/wallet-page.test.tsx` comprueba que todo campo del resumen, salvo
`periodoFiltrado`, sea texto. `iva` y `signoIva` cumplen sin abrir excepciones.

## 7. La pantalla (existente: sin `/design`)

### 7.1 Resumen de la caja, bolsillo de la empresa (`CajaResumenCard.tsx`)

Orden dentro del bolsillo (`data-bolsillo="empresa"`):

1. Región de la ganancia, igual que hoy, con su cifra ya sin IVA. Debajo, los dos datos secundarios:
   «Ingresos de la empresa» y «Gastos de la empresa», sin IVA.
2. **Región nueva «IVA cobrado»**:
   - `<section aria-label="IVA cobrado">`, con `border-t pt-3` y la misma tipografía que «Saldo
     inicial y aportes»: rótulo `text-sm font-medium`, insignia de signo, importe
     `text-lg font-medium tabular-nums` con el color del signo, y la pista `text-xs text-muted-foreground`;
   - pista: «IVA que se les cobró a las tiendas sobre el flete y la comisión. No es ganancia.» (R6).
3. Región «Saldo inicial y aportes», igual que hoy.

Las regiones 2 y 3 se pintan recorriendo `REGIONES_BOLSILLO_EMPRESA`, una lista ordenada declarada en
`wallet-labels.ts` (R9). Cada entrada es `{ id, rotulo, pista, valor(resumen), signo(resumen) }`.

### 7.2 Tarjeta «Cómo se compone la ganancia de la empresa» (`ComposicionGananciaCard.tsx`)

- **«Ingresos»** recorre `WALLET_INGRESO_GANANCIA_SEED`: cinco filas, sin las tres de IVA.
- **«Egresos»** (`DesgloseEgresosLista`) queda sin el reverso de IVA.
- **Bloque nuevo**, entre las dos columnas y el pie, a todo el ancho y separado con `border-t`:
  - título visible «IVA cobrado (aparte de la ganancia)», con el mismo estilo que `TituloColumna`;
  - un `role="group"` con `aria-label="Desglose del IVA"` que envuelve una `<dl>`;
  - una `FilaComposicion` por categoría de `WALLET_IVA_SEED`, en el orden del seed: las tres de
    ingreso con `tono="ingreso"` y el reverso con `tono="egreso"`. Llevan el icono `Percent` y la
    etiqueta de `CATEGORIA_LABEL`, y cada una abre su detalle (R7);
  - una línea de total «Total del IVA» con `composicion.totalIva`, en `tabular-nums`.
- **El pie** sigue con «Ganancia de la empresa» y `resumen.ganancia`, ya sin IVA.
- **La descripción** cambia «fletes, comisiones, impuestos, gastos…» por «fletes, comisiones, gastos,
  sueldos, indemnizaciones, pagos a mensajeros y ajustes. El IVA cobrado a las tiendas no es ganancia:
  se muestra aparte.» (R10).

### 7.3 Textos (`wallet-labels.ts`)

- `gananciaPista`: «Lo que la empresa gana menos lo que gasta, sin el IVA».
- `CAJA_RESUMEN_NOTA_DIFERENCIA`: «… no incluye el dinero de las tiendas, el IVA cobrado ni el saldo
  inicial o los aportes.»
- `composicionCajaNombreAccesible`: «(ganancia, IVA cobrado y aportes)».
- Mensaje `solo_tiendas`: «Lo de la empresa (ganancia, IVA cobrado y aportes) está en negativo…».

## 8. Preparado para SL-40

SL-40 añadirá una línea propia a la wallet. La pantalla la recibe sin rehacerse:

- **En el resumen**: una entrada más en `REGIONES_BOLSILLO_EMPRESA` y un campo más en `CajaResumenDTO`.
- **En la composición**: si su concepto queda fuera de la ganancia, otro bloque con el mismo patrón
  que el del IVA (título, grupo y filas de un seed). Si queda dentro, una fila más del seed de su
  columna.
- **En la cifra**: una cubeta más en `acumular` y un sumando más en `deEmpresa`, con su identidad en la
  guardia.

Esta ficha **no** crea abstracciones genéricas para una línea que aún no existe: deja el patrón a la
vista en dos sitios y la lista de regiones.

## 9. Tests

### El test que hoy falla

`tests/integration/db/caja-iva-aparte-sl39.test.ts`, contra Postgres:

- **Montaje**: el molde de `tests/integration/db/_fixtures/caja-459.ts`, es decir,
  `enTransaccionRevertida459` y `montarServicios459(tx)`, con `WalletService` y
  `WalletMovimientoRepository` **reales**, sin dobles.
- **Pasos**:
  1. lee `verResumenCaja` antes;
  2. siembra las cinco filas del ejemplo de §1 en la empresa A;
  3. lee después;
  4. compara la diferencia.
- **Qué afirma**:
  - Δganancia = `"1700.00"`. Hoy da `"2116.00"`, así que el test falla antes del arreglo;
  - Δiva = `"416.00"`;
  - Δcifra principal y Δ«De la empresa» iguales a los de hoy;
  - `composicion.totalIva === resumen.iva`.
- **Control de no vacuidad**: comprueba que las cinco filas existen, leídas con el cliente base, antes
  de afirmar nada. Así no puede pasar en verde con la base vacía.
- **Segunda empresa (R16)**: la empresa B siembra IVA con importes pequeños y distintos. La diferencia
  de A no se mueve y la de B ve su propio IVA. Va con `conEmpresa`, como en
  `tests/integration/db/aislamiento-wallet.test.ts`.
- **Mutación que lo debe matar**: devolver `"propio"` como única clasificación (sin el seed de IVA).

### Pruebas puras, guardias, pantalla y no regresión

- `tests/unit/utils/caja-iva-aparte-sl39.test.ts` (puro):
  - R1–R5 con el ejemplo;
  - la identidad R4 sobre los escenarios de `caja-derivacion-459.test.ts`;
  - un reverso de IVA que deja el IVA negativo, con signo `negativo`.
- Guardias:
  - `caja-composicion-exhaustiva` gana R18 (todo `_iva_` está en `WALLET_IVA_SEED`, con su
    autocomprobación) y R8;
  - `caja-derivaciones` pasa a cinco llamadas;
  - `metrics-caja-naturaleza` cubre R11 en la lista.
- `tests/components/ComposicionGananciaCard.test.tsx` y `tests/components/WalletCajaIvaSL39.test.tsx`:
  R6, R7, R9, R10 y R20.
- `tests/unit/analytics/finanzas-diario.test.ts`: R12. `analitica-financiera-service.test.ts`: R11 y R13.
- No regresión de R19: `tests/integration/db/libro-kardex-468.test.ts` y
  `tests/components/descarga/WalletDescarga.test.tsx` siguen en verde sin tocarlos.

## 10. Alternativas descartadas

1. **Una naturaleza nueva `"impuesto"` en `NaturalezaMovimiento`.** Es el modelado «más puro»:
   - cambia `WalletMovimientoDTO.dueno`, `DUENO_LABEL`, el filtro «A quién» (458-E), la columna «Es
     dinero de» de las descargas, `invariante-tiendas.ts` y cada `Record<NaturalezaMovimiento, …>`;
   - abre un cambio visible en el libro y en los Excel que nadie pidió.

   Rompe D3 (arreglo mínimo) y R19.
2. **Restar el IVA en la pantalla.** Rompe la regla del repo de que el navegador no calcula dinero
   (R20). Además deja la analítica y la serie diaria con la cifra falsa, y rompe D4.
3. **Una migración que reclasifique filas o cambie el enum.** Innecesaria: el IVA ya está en filas
   propias. Tocaría un libro *append-only* con datos en producción (D3, D8).
4. **Un tercer segmento «IVA» en la barra de reparto.**
   - Cambia el contrato de `derivarReparto` (cuatro modos con dos bolsillos) y la proporción que se
     ve hoy.
   - El reparto responde «de quién es el dinero en caja», y el IVA no es de las tiendas: queda en el
     bolsillo de la empresa con su nombre dicho (R5, R10).
5. **Sacar el IVA de «De la empresa».** Rompería la identidad `enCaja = deEmpresa + deTerceros` de
   la 459, salvo que se añada otro bolsillo. Es la alternativa 4 con otro nombre.

## 11. Dependencias

Ninguna librería nueva.

## 12. El detalle de cierres de `cierres-admin` (P1 = sí, Carlos, 2026-10-23)

### 12.1 Evidencia: cómo se calcula hoy

| Dónde | Qué hace |
|---|---|
| `lib/repositories/CierresAdminRepository.ts:358-384` | `toIngresoEmpresa` re-deriva cada gestión con `derivarIngresoOrden` a partir de lo congelado en `cierre_detail`. Su `total` suma **todos** los conceptos, IVA incluido (`:381-384`). |
| `lib/utils/ingreso-empresa.ts:287-325` | `totalesIngresoEmpresa` suma esos `total`, y por separado `ivaFlete`, `ivaFleteDevolucion` e `ivaComisionCod`. Los tres IVA **ya llegan aparte** en `TotalesIngresoEmpresa`. |
| `lib/utils/ingreso-empresa.ts:339-341` | `gananciaEmpresa(ingresoTotal, pagoMensajero)` = total − pago. |
| `lib/utils/ingreso-empresa.ts:649-658` | `netoEmpresa(ingresoTotal, pago, bodega)` = total − pago − bodega. |
| `lib/services/CierresAdminService.ts:828`, `:835` y `:867-871` | El detalle del cierre de mensajero les pasa `totalesIngreso.total`, **con IVA**. **Causa en el cierre.** |
| `lib/services/CierresBodegaAdminService.ts:312`, `:327-331`, `:376` y `:394-398` | Lo mismo en cada cierre del día y en el agregado de bodega. |
| `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx:302-316` | Cascada «Lo que le queda a la empresa»: facturado − pago − bodega = neto. Sin línea de IVA. |
| `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx:343-351` | Las mismas tres líneas en la cascada de bodega. |
| `app/(app)/cierres-admin/_components/cierre-factura.tsx:2676-2686` y `cierre-detalle-shared.tsx:356-357` | La tarjeta «Debe», solo cuando la ganancia sale negativa, con la nota «Ingreso bruto menos el pago al mensajero». |

Las descargas de `cierres-admin` no llevan ni `ganancia` ni `netoEmpresa`: no hay exporte que corregir.

### 12.2 Lo congelado en `cierre_detail` (D11)

- `cierre_detail` congela las **entradas** de la fórmula: tarifa, tasas de IVA (`db/schema.prisma:2963-2964`),
  zona y monto (`db/schema.prisma:2922-2964`). No congela una ganancia ni un neto.
- `cierre_dia` y `cierre_bodega` congelan el pago al mensajero y el ingreso de bodega, que no llevan IVA.
- La ganancia y el neto se derivan **al leer**.

Por eso el IVA se separa al leer, también en los cierres anteriores a esta ficha, sin migración ni
recálculo (R25). No hace falta nada más.

### 12.3 El cambio, sin tocar `lib/utils/ingreso-empresa.ts`

`lib/utils/ingreso-empresa.ts` **no es imprescindible**. Sus dos funciones ya restan lo que se les da;
lo que cambia es el minuendo que les pasan los servicios.

1. **Archivo nuevo `lib/utils/iva-cierre.ts`**, puro y *money-safe* (`Prisma.Decimal` dentro, texto
   con dos decimales fuera). Solo importa el **tipo** `TotalesIngresoEmpresa`.
   - `ivaFacturado(totales)` = `ivaFlete + ivaFleteDevolucion + ivaComisionCod` (R21).
   - `facturadoSinIva(totales)` = `total − ivaFacturado(totales)`.
2. **Servicios**: `CierresAdminService.verCierreDetalle` y `CierresBodegaAdminService.verCierreBodegaDetalle`,
   este último en los dos niveles. Pasan a:
   - `gananciaEmpresa(facturadoSinIva(totalesIngreso), pago)` (R22);
   - `netoEmpresa(facturadoSinIva(totalesIngreso), pago, bodega)` (R23);
   - y emiten `ivaFacturado: ivaFacturado(totalesIngreso)` en el DTO.

   `pagoTienda`, `cobradoSobreRecaudado`, `ganaLaTienda`, `paraLaCentral`, `efectivoCubreDescuentos` y
   `partesPorTienda` no se tocan (R26).
3. **Contratos** (`lib/interfaces/services/ICierresAdminService.ts`, `ICierresBodegaAdminService.ts`):
   `ivaFacturado: string` en el detalle del mensajero, en el agregado de bodega y en cada
   `cierres[]` de bodega.
4. **Los docstrings de `gananciaEmpresa` y `netoEmpresa`** dirán «ingreso bruto»: quedan desfasados. Se
   corrigen **después** de que SL-38 mergee, como seguimiento anotado en `progress/impl_SL-39.md`. No
   cambian ni una línea de código.

### 12.4 Ejemplo numérico

**Cierre A.** Una entrega, con la misma tarifa que en §1:

| Línea de la cascada «Lo que le queda a la empresa» | Hoy | Con SL-39 |
|---|---|---|
| Lo que la empresa facturó | 3.616,00 | 3.616,00 (no cambia) |
| − IVA facturado | — | 416,00 |
| − Pago al mensajero | 1.500,00 | 1.500,00 |
| − Ingreso de bodega por rechazos | 0,00 | 0,00 |
| = Lo que le queda a la empresa | **2.116,00** | **1.700,00** |

La ganancia (facturado sin IVA − pago) pasa de 2.116,00 a 1.700,00.

**Cierre B.** Un solo rechazo: flete por devolución 2.000,00 + IVA 13 % = 260,00, y pago al mensajero
2.100,00.

- **Hoy:** ganancia = 2.260 − 2.100 = 160,00. La tarjeta «Debe» no aparece.
- **Con SL-39:** ganancia = 2.000 − 2.100 = **−100,00**, y aparece «Debe 100,00». La empresa
  perdió en ese cierre, y hoy la pantalla lo tapaba con el IVA.

### 12.5 Pantalla (existente: sin `/design`)

- **Cascada «Lo que le queda a la empresa»** del mensajero (`lineasNetoEmpresa`) y de bodega
  (`lineasCascadaDueno`, a partir de «Lo que la empresa facturó»):
  - nueva línea `{ label: IVA_FACTURADO_LABEL, monto: ivaFacturado, signo: "resta", notas: [IVA_FACTURADO_NOTA] }`,
    entre «Lo que la empresa facturó» y «Pago al mensajero»;
  - rótulo «IVA facturado»;
  - nota «El IVA que se le cobró a la tienda en este cierre. No es de la empresa.» (R24).
  - Va con el mismo componente `CascadaDinero`: no hay estilos nuevos.
- **`NETO_EMPRESA_NOTA`** (`cierre-labels.ts`) añade «sin el IVA».
- **`GANANCIA_NOTA` / `GANANCIA_NOTA_BODEGA`** (`cierre-detalle-shared.tsx:356-357`) pasan a «Ingreso sin
  IVA menos el pago al mensajero.» / «…a los mensajeros.» (R27).
- **La cascada de facturación** («Cobrado sobre lo recaudado + Flete por rechazo = Lo que la empresa
  facturó») y la de la partición no cambian: hablan de lo que se le factura a la tienda, que sí lleva
  IVA.

### 12.6 Coherencia con la caja

- El IVA del cierre (R21) suma por gestión importes ya redondeados a dos decimales (`toIngresoEmpresa`).
- El IVA que la aprobación escribe en la caja redondea una vez por concepto
  (`agregarIngresosPorConcepto`, `ingreso-empresa.ts:757-761`).
- Los dos pueden diferir en algún céntimo en un mismo cierre. Esa diferencia ya existe hoy entre el
  `total` del cierre y la caja, y esta ficha no la crea ni la arregla.

No se exige igualdad entre el IVA del cierre y el de la caja.

### 12.7 Tests del cierre

**El test que hoy falla**, `tests/integration/db/cierre-iva-aparte-sl39.test.ts`, contra Postgres:

- **Montaje**: el molde de `tests/integration/db/aislamiento-cierres.test.ts` (SL-17), con
  `CierresAdminService` + `CierresAdminRepository` y `CierresBodegaAdminService` + su repositorio
  **reales**.
- **Siembra**: el cierre A y el cierre B de §12.4, con su `cierre_detail` congelado (tasas 13,00).
- **Qué afirma**:
  - en A: `ganancia === "1700.00"`, `netoEmpresa === "1700.00"`, `ivaFacturado === "416.00"` y
    `totalesIngreso.total === "3616.00"`. Hoy da `"2116.00"`;
  - en B: `ganancia === "-100.00"`. Hoy da `"160.00"`;
  - en el detalle de bodega que agrupa los dos, en los dos niveles: el agregado y cada cierre del día;
  - R25: la huella de `cierre_detail` antes y después de leer es idéntica.
- **Control de no vacuidad**: las gestiones y los `cierre_detail` existen, leídos con el cliente base.
- **Mutación que lo debe matar**: pasar `totalesIngreso.total` en lugar de `facturadoSinIva`.

**El resto:**

- `tests/unit/utils/iva-cierre.test.ts`: R21 con conceptos `null`/ausentes, que no aportan.
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx` y `CierreBodegaDetalleCascadas.test.tsx`: la
  línea, su posición y su nota (R24).
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`: la identidad de la cascada con la línea de
  IVA (R24) y lo que no cambia (R26).
- `tests/unit/services/cierres-admin-service.test.ts` y `cierres-bodega-admin-service.test.ts`: R21–R23
  y R26.

### 12.8 Alternativa descartada para el cierre

**Cambiar `gananciaEmpresa` y `netoEmpresa` en `lib/utils/ingreso-empresa.ts`** para que resten el IVA
dentro.

- Es el sitio «natural», pero el archivo está en vuelo en SL-38 y chocaría.
- Además, `netoEmpresa` la usa también `cascadas-cierre-bodega.test.ts` con su contrato actual
  («resta lo que le den»).

Pasarles el minuendo correcto desde una función nueva consigue lo mismo sin tocar el archivo, y la
regla «qué parte de lo facturado es IVA» queda en un solo sitio (`iva-cierre.ts`).
