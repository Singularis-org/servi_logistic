# SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» — design

Requisitos: `requirements.md` (R620-R636). Sin migración, sin tabla nueva, sin dependencia nueva.

## Lo que ya existe

Buscado `pagoTienda`, `ganaLaTienda`, «Se le paga hoy», «Gana en total», `pago-tienda-neto`, «la tienda
debe» en `feature_list.json` (todos los estados), `specs/` y el código (el índice del grafo no tiene
este worktree: búsqueda con Grep/Read).

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| Ninguna ficha con el mismo objetivo | `feature_list.json` (títulos con «paga», «neto», «Gana en total») | Nada que cancelar. |
| La definición actual del pago a la tienda (ficha 301) | `lib/utils/ingreso-empresa.ts:469-489` `pagoTiendaEmpresa` | **No se toca**: la sigue usando la ficha 347 (R636). Los cierres dejan de llamarla. |
| «Gana la tienda en total» (395/396) | `lib/utils/ingreso-empresa.ts:491-523` `ganaLaTienda` | **Se reutiliza tal cual**: ya es recaudado − todo lo facturado, con su signo. Es la fórmula de D1. |
| Partición por tienda (396) | `lib/utils/ingreso-empresa.ts:684-737` `partesPorTienda` | Se reutiliza; su `pagoTienda` pasa a salir de `ganaLaTienda`. |
| Cifras de un cierre (SLT-140) | `lib/utils/cifras-cierre.ts:55-88` `cifrasDelCierre` | Mismo cambio. La usan el detalle, el Excel de mensajeros y, por `cifrasAgregadasBodega` (`lib/utils/cifras-cierre-bodega.ts:36`), el agregado de bodega y su Excel. |
| Nivel de cada cierre del día en bodega | `lib/services/CierresBodegaAdminService.ts:515-519` | Mismo cambio (este nivel no pasa por `cifrasDelCierre`). |
| Reparto en % (SLT-111) | `lib/utils/porcentajes-reparto.ts:18-44`; llamado en `CierresAdminService.ts:1164-1167` con `[pagoTienda, cobradoSobreRecaudado]` | La función no cambia; cambia la segunda parte (R624). Ya devuelve `null` si una parte es negativa. |
| Rojo para negativos | `components/private/cierres/detalle/CifrasCierre.tsx:40,59` (`esMontoNegativo`, `text-danger-strong`); `Cuenta.tsx:118` | Se reutiliza en la tarjeta y se aplica igual en la tabla «Por tienda». |
| Recorte de la satélite (SLT-154) | `CLASE_DETALLE_MENSAJERO` (`CierresAdminService.ts:224-245`), `CLASE_*` de `CierresBodegaAdminService.ts:91-120`, `anularEmpresaSiNoCentral` | No cambia: `pagoTienda`, `ganaLaTienda`, `partesPorTienda` y `cobradoSobreRecaudado` siguen clasificados `"empresa"` (R633). |
| Componentes sin superficie | `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx`, `DesglosePorTienda.tsx` | No se tocan (solo los monta `tests/fixtures/detalle-cierre-admin-anterior.tsx`). Su texto `DESGLOSE_POR_TIENDA_NOTA*` (`cierre-labels.ts:554-558`) queda obsoleto; se borra con P3. |

## ¿Toca dinero? No: solo presentación

Ninguna ruta que mueve dinero lee `pagoTienda`, `pagoTiendaEmpresa`, `ganaLaTienda`, `partesPorTienda`
ni `cifrasDelCierre`:

- **Libro de la tienda al aprobar** — `lib/services/WalletTiendaFeedService.ts:125-162`: un crédito
  `cod_recaudado` por el COD recibido (`:133-136`) y un débito por **cada** concepto de
  `derivarIngresoOrden` (`:141-161`), flete por devolución incluido salvo que el interruptor esté
  apagado (`:157`). Su único import de `ingreso-empresa` es `derivarIngresoOrden` (`:9`). O sea que el
  libro **ya** resta todo lo facturado: lo que cambia es que la pantalla deja de enseñar un número que
  no resta el flete por rechazo.
- **Pago a la tienda** — `lib/services/LiquidacionService.ts:659-713`: se paga contra el saldo derivado
  del libro (`derivarSaldoTienda(creditos, debitos)`, `:710`), nunca contra `pagoTienda`. La caja lo
  apunta con el monto del pago (`CajaPagoTiendaFeedService.ts:44-46`).
- **Cobro por rechazo desde novedades** — `RechazoTiendaCobroService.ts`: lee sus importes de la fila
  del cobro; no importa nada de `ingreso-empresa`.
- `RechazoTiendaService.ts:16` y `CierreBodegaService.ts:31` importan solo `derivarIngresoOrden` y
  `paraLaCentral`, que no cambian.

Por eso **no hay doble cobro**: el flete por rechazo ya se debita una vez al aprobar y esta ficha no
añade ningún débito. R631 lo fija con una guardia de imports y con las pruebas de los feeds sin
tocar; R632 prueba contra Postgres que la cifra nueva es igual al neto del libro.

**Riesgo que queda abierto (P1):** si `WALLET_TIENDA_DEBITA_FLETE_DEVOLUCION=false` en un entorno, el
libro no debita el flete por devolución y la cifra nueva (que lo resta) no coincidiría con el libro.
Por defecto está encendido (`lib/config/wallet-tienda.ts:69-71`). No se diseña una rama para el
interruptor apagado: se comprueba antes del PR y, si está apagado, decide Carlos.

## Modelo viejo y modelo nuevo: aplica a los dos (R635)

Los dos modelos dejan el flete no deducible en las mismas dos categorías (`ingreso_flete_devolucion` y
su IVA): el viejo solo para `devolucion_a_origen_por_rechazo` (`ingreso-empresa.ts:216-222`), el nuevo
para todo resultado que no es `entregado` (`:253-259`, SLT-52 R29). `totalesIngresoEmpresa().total`
los suma en los dos, y el libro de la tienda los debita en los dos (`WalletTiendaFeedService.ts:17-24`).
Aplicar la fórmula solo a uno dejaría la misma pantalla con dos definiciones según el cierre. El
fulfillment no entra en el cierre en ninguno de los dos (`ingreso-empresa.ts:242`, R31 de SLT-52), así
que «cualquier otro cobro a la tienda del cierre» de D1 es exactamente `total`.

Las descargas Excel de esta ficha solo existen para el modelo nuevo (SLT-140/141); con el viejo cambian
solo la pantalla.

## Modelo de datos

Sin cambios: ni tablas, ni columnas, ni RLS, ni migraciones (`organizacion_id` y el alcance por empresa
siguen como hoy en los repositorios que ya leen estas gestiones). Datos del país: el importe se formatea
con `money()` (`lib/config/moneda`), sin literal de moneda nuevo.

## Autorización

Sin cambios. Las cifras de la empresa siguen saliendo solo para la central; la satélite recibe `null`
por la clasificación de SLT-154 (R633). No depende de ningún módulo encendido nuevo.

## Contratos (servidor → pantalla)

**Mismos campos, nuevo valor.** No se añade ni se quita ningún campo:

| Campo | Antes | Desde SLT-169 |
|---|---|---|
| `pagoTienda` (detalle mensajero, detalle bodega, cada cierre del día de bodega, `CifrasCierreDescargaDTO`) | `general − fleteConIva − comisionConIva` | `ganaLaTienda(general, totalesIngreso.total)` |
| `ParteDeTienda.pagoTienda` | `pagoTiendaEmpresa(recaudado, f, c)` de la tienda | `ganaLaTienda(recaudado, total)` de la tienda |
| `ganaLaTienda`, `ParteDeTienda.ganaLaTienda` | recaudado − total | **igual a `pagoTienda`** (alias hasta P3) |
| `cobradoSobreRecaudado` | flete + comisión con IVA | sin cambio de valor; ya no se pinta |
| `porcentajesReparto` (detalle mensajero) | `porcentajesReparto([pagoTienda, cobradoSobreRecaudado], general)` | `porcentajesReparto([pagoTienda, totalesIngreso.total], general)` |

La cuarta identidad de la 396 (`pagoTienda − ganaLaTienda = fleteDevolucionConIva`) pasa a ser
`pagoTienda === ganaLaTienda`; los comentarios de `ingreso-empresa.ts`, `cifras-cierre.ts` y de las
interfaces se reescriben para decirlo (hoy afirman «NO descuenta el flete por rechazo»).

Las identidades que siguen ciertas, y que los tests fijan:
- `pagoTienda + totalesIngreso.total === general` (R624).
- `Σ partes.pagoTienda === pagoTienda` del conjunto (R621, R623).

## Pantalla

`components/private/cierres/detalle/`:
- `detalle-cierre-vista.ts`
  - `cifrasMensajero` (`:384`): contexto `L.contextoTiendas(n)` sin `ganaLaTienda`; la marca de deuda
    viaja en la `Cifra` (campo opcional `sufijo`).
  - `lineasDinero` (`:886-893`): reparto `[SE_LE_PAGA_HOY_LABEL, pagoTienda]` y
    `[TOTAL_FACTURADO_LABEL, totalesIngreso.total]`.
  - `cuentaFactura` (`:742-753`): sin la línea `subtotal` «Sale de lo recaudado» (R626).
- `detalle-cierre-labels.ts`: `contextoTiendas(tiendas)`; `POR_TIENDA_COLUMNAS` sin `gana`;
  `TIENDA_DEBE(tiendas)` → «(la tienda debe)» / «(las tiendas deben)».
- `CifrasCierre.tsx`: pinta el `sufijo` junto al importe. El rojo ya existe.
- `DineroCierre.tsx` (`:64-103`): tres columnas; la celda negativa con `esMontoNegativo` →
  `text-danger-strong` y «(la tienda debe)».

La pantalla no suma ni resta (R71 de SLT-95): elegir el sufijo es comparar el signo de un STRING que
ya llega del servidor, con la misma `esMontoNegativo` de hoy.

## Excel

`app/(app)/cierres-admin/_components/`:
- `cierres-resumen-modelo-nuevo-descarga-columnas.ts`: `COLUMNAS_CIERRES` sin `ganaLaTienda` (19 con
  la central, 18 con la satélite); `COLUMNAS_POR_TIENDA` y `filaPorTienda` sin `ganaLaTienda` (4).
- `cierres-bodega-modelo-nuevo-descarga-columnas.ts`: el encabezado de la columna `ganaLaTienda` pasa a
  «Se le paga a la tienda». La clave y el valor (`cifras.ganaLaTienda` de `cifrasBodegaDescarga`) no
  cambian: con el alias vale lo mismo que `pagoTienda` y no hay que ensanchar el DTO de bodega.

**Choque con SLT-161** «Descargas de la satélite sin el dinero de la empresa» (pending): tocará los
mismos dos archivos de columnas para la satélite. Quien entre segundo rebasa; esta ficha no cambia la
regla de audiencia.

## Alternativas descartadas

1. **Quitar ahora `ganaLaTienda` (y `cobradoSobreRecaudado`) del contrato.** Es lo limpio, pero
   `ganaLaTienda` aparece en 49 archivos de `tests/` (y `pagoTienda` en 65): con los de producción, el
   PR pasaría de 40 archivos. Se deja como alias con el mismo valor, documentado, y se retira en una
   ficha de limpieza (P3).
2. **Cambiar `pagoTiendaEmpresa` para que reste también el flete por devolución.** Arreglaría los
   cierres de un golpe, pero esa función también la usa la ficha 347 (`dinero-por-producto.ts:270`),
   cuya invariante `empresa + tienda === liquidadoRecaudado` se rompería, y queda fuera del alcance
   aprobado (R636).
3. **Restar en la pantalla** (`pagoTienda − fleteDevolucionConIva`). Viola R71 de SLT-95 («la
   pantalla no suma ni resta») y dejaría el Excel con otra cifra.
4. **Cifra nueva `pagoTiendaNeto` junto a las dos de hoy.** Serían tres cifras para la misma pregunta;
   D2 pide una sola.

## Pruebas

- Unit con dobles para la fórmula, el orden y la vista; integración en `tests/integration/db/`
  contra Postgres real para R621/R623/R624 (las que ya existen) y R632 (nueva: aprueba un cierre con
  una entrega y rechazos y compara cada `ParteDeTienda.pagoTienda` con `Σ créditos − Σ débitos` de
  `wallet_tienda_movimiento` de ese `origen_id`). El escenario registra los pagos de la entrega por el
  mismo importe que `monto_recibido`, que es de donde el libro saca el crédito.
- E2E afectado: `e2e/cierres-rediseno.spec.ts` (escenario A con un rechazo: «Se le paga hoy» pasa de
  ₡94.350 a ₡92.090 = 100.000 − 7.910, reparto [92 %, 8 %], sin «Sale de lo recaudado»; y la lista de lo
  que la satélite no ve). Además, por tocar dinero: `pnpm exec playwright test --project=dinero` y
  `e2e/cierre-bodega-satelite.spec.ts` (sigue sin «Se le paga hoy a la tienda»).
