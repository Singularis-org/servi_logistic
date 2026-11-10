# SLT-101 «Fila de gestión única y lista con filtros» — design

> 2026-11-09. Baja a ejecutable el plan S3 del spec madre (`specs/SLT-95-detalle-cierre-rediseno/
> design.md > 3. Fila de una gestión`, `tasks.md > Plan de las demás rebanadas > S3`). Hereda de él,
> sin repetirlo, la arquitectura de los cuatro componentes, «De dónde sale cada cifra» y las
> alternativas descartadas 1-6. Aquí está solo lo que S3 decide.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`): «fila», «gestiones», «filtro», «señales», «Ver cómo se calculó»;
- `specs/`: «Con señales», «Filtrar por resultado», «fila desplegada», «Ver cómo se calculó»,
  «Señales»;
- código (Grep/Read; el grafo no tiene índice de este worktree, ver la nota final):
  `GestionesPorResultado`, `FilaGestion`, `DesgloseIngresoEmpresa`, `DesgloseModeloNuevo`,
  `renderPagoMensajero`, `MarcaAjustado`, `BotonesEvidencia`, `BuscadorFiltros`,
  `SegmentedToggle`, `EstadoConInfo`, `vuelveABodega`, `fulfillmentDeIngreso`,
  `fleteDevConIvaDeGestion`, `Cuenta`, `COLUMNAS_DESCARGA_DETALLE_CIERRE`.

**Resultado:**
- **Board:** ninguna ficha hace esto. Las hermanas tocan otras superficies: SLT-102 «Cola de cierres
  única: mensajeros (central y satélite)» (la cola), SLT-103 «Diálogos del módulo de cierres y trato
  tú» (visor de evidencia), SLT-104 «Detalle de cierre de bodega en el detalle único (central)» y
  SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (montan las audiencias solo lectura
  y mensajero), SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» (cifras
  nuevas de la fila).
- **Specs que fijaron lo que la fila pinta y S3 respeta:** 213 (desglose de métodos), 263 (rejilla
  y guía sin recorte), 337/338 (desglose de la tarifa congelada), 398 (corregir el resultado), 414
  (origen del rechazo y marca «La tienda»), 456 (nombre de estado con su botón de información), 478
  (fila en pestañas; incidente), 481 (fulfillment solo central), 486 (evidencias), SLT-54 R62-R71
  (modelo nuevo en la fila), SLT-56 (ajuste del pago).
- **Código que se reutiliza tal cual:**
  - `components/private/cierres/detalle/Cuenta.tsx` (formato cascada de D16), con tres props
    aditivas (abajo);
  - `components/shared/SegmentedToggle.tsx`: el conmutador de cierres (grupo con nombre,
    `aria-pressed`, conteo entre paréntesis). Es el control que D17 ya aprobó para cierres;
  - `EstadoConInfo` (resultado con su botón, ficha 456), `MarcaAjustado` (popover de los ajustes),
    `BotonesEvidencia` (un botón por foto, hasta SLT-103), `DescargarDatasetButton`;
  - reglas y textos: `vuelveABodega` (`lib/types/gestion-retorno.ts`), `fulfillmentDeIngreso`,
    `fleteDevConIvaDeGestion`, `fleteNoEntregaLabel`, `motivoGestionLegible`, `CAUSA_INCIDENTE_LABEL`,
    `RESULTADO_LABEL`, `METODO_LABEL`, `esMontoCero`, `money()`, los `*_LABEL` del desglose de
    `cierre-detalle-shared.tsx` y los de la cuenta «Lo que se le factura a la tienda» de
    `detalle-cierre-labels.ts`.
- **Lo que existe y no sirve tal cual:**
  - `GestionesPorResultado` + su `FilaGestion` privada: pestañas por resultado (no filtros), sin
    señales, sin tarjetas y con `esMensajero` en lugar de `audiencia`. Lo comparten el detalle de
    bodega y `/cierre-dia`, así que no se toca (alternativa 1).
  - `BuscadorFiltros`: es un buscador con un selector de filtros en popover que no enseña conteos;
    el canvas pide los conteos a la vista y no dibuja búsqueda (PA4).
  - `DesgloseIngresoEmpresa`: dos columnas de auditoría (fórmulas + los nueve cobros posibles). El
    canvas aprobado (D2) pide una tarjeta por concepto cobrado; se reescribe la presentación en
    `CalculoCobro`, con las mismas reglas de origen del flete.

## Arquitectura

```
components/private/cierres/fila/
  GestionesCierre.tsx     lista: filtros + barra + cabecera de columnas + filas + estado vacío
  FilaGestion.tsx         una gestión: fila cerrada y desplegada (datos, tarjetas, acciones)
  CalculoCobro.tsx        «Ver cómo se calculó»: una Cuenta por concepto cobrado
  fila-gestion-vista.ts   PURO: qué se ve por audiencia, señales, filtros, tarjetas, cálculo
  fila-gestion-labels.ts  textos nuevos (trato «tú»)
```

Mismo patrón que `detalle/` (S1): el `.ts` puro **elige y cuenta**; los importes son referencias a
los strings del servidor; los `.tsx` solo pintan. Se prueba la vista sin montar nada.

### `GestionesCierre`

```ts
type AudienciaFila = "central" | "satelite" | "mensajero" | "solo lectura";

interface GestionesCierreProps {
  /** En el orden de ORDEN_RESULTADOS y, dentro, el del servidor (PA5). */
  gestiones: readonly { gestion: CierreDetalleGestion; mensajeroNombre?: string }[];
  audiencia: AudienciaFila;
  quienMiraEsCentral: boolean;          // fulfillment en «solo lectura» (R25, R30)
  /** `solicitadoAt` del cierre: la nota de R28. `null` = no se pinta la fecha. */
  congeladoAt: string | null;
  acciones: AccionesFila;
  onVerEvidencia?: (url: string) => void;  // el visor de hoy; SLT-103 cambia la firma
  barra?: ReactNode;                     // el `DescargarDatasetButton`, a la derecha de los filtros
  columnaMensajero?: boolean;            // R23 bodega (la monta SLT-104)
}
```

- Estado local: el filtro activo (`"todas"` al montar, R84). Filtrar es elegir filas, no tocar
  importes (R71).
- Filtros: `SegmentedToggle` con `ariaLabel="Filtrar por resultado"` y `options = filtrosDe(...)`.
- Tabla: región «Órdenes del cierre» (R89), cabecera de `columnasDe(audiencia, columnaMensajero)` y
  una `FilaGestion` por gestión filtrada. Sin gestiones: `estadoVacioDe(filtro)` con `role="status"`.

### `FilaGestion`

```ts
type AccionesFila = Partial<{
  corregirMetodos: (g: CierreDetalleGestion) => void;
  ajustarPago: (g: CierreDetalleGestion) => void;
  corregirResultado: (g: CierreDetalleGestion) => void;
  devolver: (g: CierreDetalleGestion) => void;
}>;
interface FilaGestionProps {
  gestion: CierreDetalleGestion; mensajeroNombre?: string;
  audiencia: AudienciaFila; quienMiraEsCentral: boolean; congeladoAt: string | null;
  acciones: AccionesFila; onVerEvidencia?: (url: string) => void;
}
```

**Cerrada** (rejilla del canvas, `Fila2`/`Main`): guía (piso de `FILA_GUIA_CELDA`, sin recorte, 263);
destinatario · tienda (truncable); mensajero (si la columna va); resultado con `EstadoConInfo`; los
importes de `columnasDe` («—» si nulos, R86); señales (`senalesDe`, texto ámbar); «Devolver a
gestión» si hay callback (mensajero); botón de desplegar con el nombre accesible de hoy (R89).

**Desplegada:**
1. Cabecera `dl`: Orden (`numRemision`), Producto, Dirección y, con valor, los datos de R87 y R88.
2. Tarjetas en rejilla de 2 columnas (2x2, D2), cada una una `Cuenta` (D16), en este orden:

   | Tarjeta | Líneas (todas strings del servidor) | Total | Accesorios |
   |---|---|---|---|
   | Recibió el mensajero | un `pagos[i]` por método, sin los de 0 (`esMontoCero`); el primero sin operador y los siguientes con «+» | «Recibió» = `montoRecibido` | «Corregir métodos de pago» (R26) |
   | Se le cobra a la tienda | `fleteConIva` «Flete por entregado + IVA»; `comisionConIva` «+ Comisión COD + IVA»; `fleteDevolucionConIva` «+ <rótulo por modelo> + IVA» (`fleteDevConIvaDeGestion`); solo los no nulos | «Se le cobra» = `ingresoEmpresa.total` | botón «Ver cómo se calculó» / «Ocultar cómo se calculó» (`aria-expanded`) |
   | Se le paga al mensajero / Tu ganancia | — | «Se le paga» = `pagoMensajero` | `MarcaAjustado` en la cabecera; notas «Motivo: «…»» y «Ajustó <actorNombre> · <fecha hora>» del último ajuste; marca «Sin tarifa» de hoy si `tarifaFaltante`; «Ajustar pago» (R26) |
   | Fulfillment · se cobró al crear la orden | «Fulfillment» = `fulfillmentDeIngreso(ing)`; «+ IVA» = `ivaFulfillment` si no es nulo | — (lo trae SLT-110) | nota «Se cargó al saldo de la tienda una vez por paquete. No depende de esta gestión ni de este cierre.» (la fecha la trae SLT-110) |

   SI la fuente de una tarjeta es nula (`montoRecibido`, `ingresoEmpresa`, `pagoMensajero`), la
   tarjeta pinta su título y «Sin dato» (R27). El rótulo de cada concepto es **el mismo** que en la
   cuenta «Lo que se le factura a la tienda» de «Dinero» (D20).
3. «Ver cómo se calculó» abierto → `CalculoCobro` (R28, R29).
4. Pie: «Ver evidencia» (`BotonesEvidencia` de hoy, un botón por foto) a la izquierda y «Corregir el
   resultado» a la derecha (canvas).

Estado local: `abierta` y `calculoAbierto`, los dos en `false` al montar.

### `CalculoCobro` (R28, R29)

Una `Cuenta` por concepto **cobrado** (`!== null`), en rejilla de 2 columnas, y la nota «Tarifas tal
como estaban al crear el cierre (<fecha de `congeladoAt`>). Si después cambian, aquí no cambia nada.»

- **Modelo viejo** (`tarifaModelo !== "nuevo"`, `tarifa` presente). Rótulos de hoy del desglose
  (`FLETE_LABEL`, `IVA_FLETE_LABEL`, `FLETE_RECHAZO_LABEL`, `COMISION_COD_LABEL`…), y la tarifa
  aplicada con la regla de hoy de `DesgloseIngresoEmpresa` (pacto si `*Origen === "especial"` y el
  pacto existe; si no, columna GAM o no GAM por `esCentral`):
  - Flete: «Tarifa: <tarifa GAM | tarifa no GAM | tarifa especial pactada> <monto>»; «Flete» = `flete`;
    «+ IVA flete (<ivaFlete %> de <monto aplicado>)» = `ivaFlete`; total = `fleteConIva`;
  - Flete por devolución a origen: igual con `fleteDevolucion`, `ivaFleteDevolucion`,
    `fleteDevolucionConIva`;
  - Comisión COD: «Comisión COD (<comisionCod %> de <montoCobrar>)» = `comisionCod`; «+ IVA comisión
    (<ivaComisionCod %> de <comisionCod>)» = `ivaComisionCod`; total = `comisionConIva`.
  - Notas de hoy: la marca «especial» / «especial sin pacto» en la tarjeta del flete
    (`renderFleteOrigen`, `especialSinPactoBadgeNota`), `SIN_COMISION_NOTA` si `!cobraComision`.
  - `tarifa === null`: solo la nota `SIN_TARIFA_CONGELADA_NOTA` (69/R9).
- **Modelo nuevo**: por concepto, `fleteNoEntregaLabel`/«Flete por entregado»/«Comisión COD»: base
  e «+ IVA» tal como llegan, y total del concepto. **Sin** línea de tarifa ni % de IVA hasta R64
  (SLT-110, PA1).

Los porcentajes son los strings de la tarifa congelada con « %» pegado (como `pct()` de hoy); los
montos de los rótulos pasan por `money()`. Es formato, no aritmética (R71).

### `fila-gestion-vista.ts` (puro)

| Función | Qué decide | R |
|---|---|---|
| `gestionesEnOrden(grupos)` | lista plana en el orden de `ORDEN_RESULTADOS` | R84, PA5 |
| `senalesDe(g, audiencia)` | lista de `{ id, texto }` en el orden de R85 | R24, R85 |
| `textoSenales(g, audiencia)` | `senalesDe(...).map(texto).join(" · ")`, `""` sin señales | R85, R91 |
| `filtrosDe(gestiones, audiencia)` | 7 opciones con conteo («Todas», 5 resultados, «Con señales») | R84 |
| `filtrar(gestiones, filtro, audiencia)` | subconjunto, sin reordenar | R84 |
| `columnasDe(audiencia, conMensajero)` | rótulos y fuente de cada columna | R23, R86 |
| `tarjetasDe(g, audiencia, quienMiraEsCentral)` | qué tarjetas y con qué `LineaCuenta[]` (o «Sin dato») | R25, R27, R30 |
| `calculoDe(g)` | tarjetas de `CalculoCobro` | R28, R29 |
| `accionesDe(g, audiencia, acciones)` | qué botón se ofrece (regla de hoy, movida de `cierre-factura.tsx` sin cambios) | R26 |
| `datosOrdenDe(g, audiencia)` | pares `dl` de R25, R87 y R88 | R87, R88 |

Regla de acciones (inventario-central §A, `cierre-factura.tsx:1983-2026`), además de la tabla de R26:
corregir métodos solo `entregado` con `pagos.length > 0`; corregir el resultado solo `entregado`;
ajustar pago con `pagoMensajero !== null`; evidencia con `evidenciaUrls.length > 0`. El estado del
cierre y el permiso llegan como **presencia del callback** (los `ofrecer*` del módulo no cambian).

Columnas (R23), cabeceras de una sola fuente con la descarga (D20, R21):

| Audiencia | Columnas |
|---|---|
| central, satélite | Guía · Destinatario · tienda · Resultado · Recibido · Cobro a la tienda · Pago al mensajero · Señales |
| solo lectura | igual, con «Mensajero» tras «Destinatario · tienda» si `columnaMensajero` |
| mensajero | Guía · Destinatario · tienda · Resultado · Recibido · Ganancia · Señales |

«Cobro a la tienda» y «Pago al mensajero» son `COBRO_A_LA_TIENDA_COL` y `PAGO_AL_MENSAJERO_COL` de
SLT-100 (los mismos de «Descargar»); «Ganancia» es el rótulo de hoy del mensajero.

### `Cuenta.tsx`: tres props aditivas

`insignia?: ReactNode` (junto al título: «Ajustado»), `pie?: ReactNode` (botones dentro de la
tarjeta, canvas) y `vacio?: string` (con `lineas` vacías pinta ese texto: «Sin dato»). Sin las props,
el DOM es el de hoy: «Dinero» y `DineroIdentidadesEnPantalla.test.tsx` no cambian.

### Montaje en `/cierres-admin` (R90)

En `CierresAdminModule.tsx`, el slot `gestiones` del `DetalleCierre` pasa de
`<DescargarDatasetButton>` + `<GestionesPorResultado>` a:

```tsx
<GestionesCierre
  gestiones={gestionesEnOrden(detalle.grupos).map((gestion) => ({ gestion }))}
  audiencia={audiencia === "admin" ? "central" : "satelite"}
  quienMiraEsCentral={audiencia === "admin"}
  congeladoAt={cierreAbierto.solicitadoAt}
  acciones={{ corregirMetodos: ofrecerCorreccionPagos ? setCorrigiendo : undefined,
              corregirResultado: ofrecerCorreccionResultado ? setCorrigiendoResultado : undefined,
              ajustarPago: ofrecerAjustePago ? setAjustandoPago : undefined }}
  onVerEvidencia={setEvidencia}
  barra={<DescargarDatasetButton … />}
/>
<SeccionSinGestion … />   // R19, sin cambios
```

El módulo deja de importar `GestionesPorResultado` (sigue exportado: lo usan bodega y `/cierre-dia`).
`CierresBodegaAdminModule.tsx` y `CierreDiaModule.tsx` no se tocan.

### «Descargar» (R91)

`detalle-cierre-descarga-columnas.ts` añade `{ clave: "senales", encabezado: SENALES_COL }` al final
y `filaDescargaDetalleCierre(g, audiencia)` rellena `senales: textoSenales(g, audiencia) || null`
(celda vacía sin señales). La central y la satélite pasan su audiencia; con las reglas de R85 el
texto coincide para las dos. `columnas-sensibles.guardia` lo sigue descubriendo por el sufijo.

## Modelo de datos, RLS, migraciones y autorización

**Nada.** Ni tablas, ni columnas, ni RLS, ni migraciones (sin `down.sql`), ni Server Actions, ni
servicios. Todo dato ya llega en `CierreDetalleAdminServiceResult`. La autorización no cambia: la
`audiencia` la decide `/cierres-admin/page.tsx` como hoy (central = `esAccesoTotal`; satélite =
adminSatelite); `fulfillment` ya llega `null` para la satélite desde el servidor (ficha 481), y la
fila además no lo pinta fuera de la central (doble cierre, R30). Módulo: cierres sigue en `nucleo`.

## Datos que dependen del país

- Moneda: solo `money()`. Ningún símbolo escrito.
- Métodos de pago: `METODO_LABEL`.
- IVA: el rótulo de impuesto sale de `IMPUESTO_ROTULO` (como los rótulos de «Dinero»); el % del
  modelo viejo, del string congelado en la tarifa; el del modelo nuevo llega con SLT-110. Nunca
  «13 %» escrito.
- Fechas: `fechaCalendarioCR`/`horaCostaRica`, como el resto de cierres (SLT-92 «Pantallas: fechas y
  teléfonos en la zona y el prefijo del país de la empresa» las generalizará).
- Ubicación (R87): los nombres que manda el servidor; el rótulo del nivel, con
  `useEtiquetasGeograficas` si hace falta, como hoy.

## Cifras que faltan (D10): qué rebanada las trae

| Cifra del canvas en la fila | Campo que falta | Rebanada |
|---|---|---|
| «de eso, IVA (no es de la empresa)» | IVA incluido en el cobro (R65) | SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» |
| «Se cobró» del fulfillment y «Se cargó … el <fecha>» | total con IVA y fecha del cargo (R65) | SLT-110 |
| «Por tarifa · <modo>» y «− Ajuste» | pago congelado y diferencia con signo (R66) | SLT-110 |
| «Tarifa: grupo … de la zona …» y «+ IVA 13 %» del modelo nuevo | `cierre_detail_concepto` + `tarifa_valor` (R64) | SLT-110 |
| «Sin tarifa de pago» en el admin | `tarifaFaltante` real (R66) | SLT-110 |

Hasta entonces esas líneas **no se pintan**: ni ₡0 ni un rótulo sin cifra. Si Carlos decide en PA1
traerlas aquí, S3 pasa a fullstack y este design se amplía con las lecturas de `design.md >
Cifras nuevas` del madre.

## Tests y guardias que cambian

Ninguno pierde lo que vigila: si una aserción leía una región que desaparece, pasa a leer la nueva
**con el mismo literal**.

| Archivo | Qué vigilaba | Cómo queda |
|---|---|---|
| `tests/components/CierresAdminModule.test.tsx` | región «Entregado»/«Devolución…» de las pestañas | pulsa el filtro «Entregado (n)» y lee la región «Órdenes del cierre»; mismos literales |
| `tests/components/cierre-detalle-ajuste-badge.test.tsx` | marca «Ajustado» en la fila | la marca en la tarjeta «Se le paga al mensajero» y la señal «Pago ajustado» |
| `tests/components/CorregirResultadoCierre.test.tsx` | botón de la fila | mismo nombre accesible (R89), ahora al pie de la fila desplegada |
| `tests/components/CierresAdminDetalleUnico.test.tsx` | «Descargar» y novedad interna en «Gestiones» | mismo, con el botón en la barra de filtros |
| `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` | 7 cabeceras | 8, con «Señales» (literal) |
| `tests/unit/guards/estado-con-info.guardia.test.ts` | nombres de estado con su botón | `USOS_PERMITIDOS` gana `fila-gestion-vista.ts` con clase `recuento` (las opciones «<resultado> (n)» del filtro, como las pestañas de hoy); la celda de la fila usa `EstadoConInfo` y no necesita excepción |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | ningún `Number()`/`parseFloat` en dinero | el censo suma los 5 archivos de `fila/` |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | anclas `CierresAdminModule.tsx:<línea>` | se mueven las anclas que cambien de línea; ningún par cambia (si T0.1 lo confirma) |

Los tests que montan `GestionesPorResultado` directamente (`CierreTarifaEspecial`,
`CierreDesgloseModeloNuevo`, `CierreDetalleIncidente`, `CierreMotivoRechazoAutomatico`,
`CierreIngresoBodegaModeloNuevo`, `CierreEvidenciasVarias486`, `paginacion-transversal`) **no
cambian**: el componente sigue vivo para bodega y `/cierre-dia`. Lo que vigilan de la fila se
re-afirma sobre `FilaGestion` en `FilaGestion.test.tsx` (paridad: pacto especial, sin pacto, sin
comisión, sin tarifa congelada, causa e indemnización, origen del rechazo, ingreso de bodega del
modelo nuevo, varias evidencias).

## Verificación de lo que ve el usuario (R77)

**Componentes** con dobles y literales escritos a mano (nunca la función que los produce):

| Gestión doble | Literales |
|---|---|
| Vieja, entrega central: efectivo 15 000,00 + SINPE 10 000,00 + transferencia 0,00; `montoCobrar` 25 000,00; tarifa GAM 4 000,00, IVA 13, comisión 4, IVA comisión 13 | Recibió: «Efectivo ₡15.000,00», «+ SINPE ₡10.000,00», sin Transferencia, «Recibió ₡25.000,00». Se le cobra: «Flete por entregado + IVA ₡4.520,00», «+ Comisión COD + IVA ₡1.130,00», «Se le cobra ₡5.650,00». Cálculo: «tarifa GAM ₡4.000,00», «Flete ₡4.000,00», «IVA flete (13 % de ₡4.000,00) ₡520,00», «Comisión COD (4 % de ₡25.000,00) ₡1.000,00», «IVA comisión (13 % de ₡1.000,00) ₡130,00» |
| La misma con un ajuste 2 500,00 → 1 800,00, motivo «Entrega compartida», por «Carla Ajustadora» | «Se le paga ₡1.800,00», «Ajustado», «Motivo: «Entrega compartida»», «Ajustó Carla Ajustadora · …»; señal «Pago ajustado» |
| Nueva, entrega: flete 3 500,00 + IVA 455,00 = 3 955,00; comisión 500,00 + 65,00 = 565,00; total 4 520,00; fulfillment 600,00 + IVA 78,00 | «Se le cobra ₡4.520,00»; cálculo sin línea «Tarifa:»; Fulfillment «₡600,00» y «+ … ₡78,00» solo en central y solo lectura con `quienMiraEsCentral` |
| Incidente «Dañado», `indemnizacion` nula | señal central «Dañado · sin indemnizar», mensajero «Dañado» |
| Devolución a origen `esRechazoSla` | señal «Vuelve a bodega · Rechazo automático» (central), «Vuelve a bodega» (mensajero) |
| Pre-snapshot (`ingresoEmpresa: null`, `pagoMensajero: null`) | celdas «—»; tarjetas «Sin dato» |

**E2E** (`e2e/cierres-rediseno.spec.ts`, un `describe` nuevo, grupo `dinero`), sobre los
escenarios que ya siembra SLT-100. Literales **propuestos** derivados a mano, que T0.3 confirma
contra la siembra antes de escribir el test:
- **Central A (modelo viejo, solicitado).** Filtros «Todas (3)», «Entregado (2)», «Devolución a
  origen por rechazo (1)», «Con señales (1)». Gestión de 70 000 en efectivo: «Efectivo ₡70.000,00»,
  «Recibió ₡70.000,00»; «Flete por entregado + IVA ₡2.260,00» (2 000 + 260), «+ Comisión COD + IVA
  ₡791,00» (1 % de 70 000 = 700 + 91), «Se le cobra ₡3.051,00»; «Se le paga ₡1.500,00». «Ver cómo se
  calculó»: «tarifa GAM ₡2.000,00», «Flete ₡2.000,00», IVA ₡260,00; comisión ₡700,00, IVA ₡91,00.
  La devolución: señal «Vuelve a bodega», «Se le cobra ₡2.260,00». «Corregir métodos de pago»,
  «Ajustar pago» y «Corregir el resultado» presentes. «Descargar»: 8 cabeceras con «Señales» y la
  devolución con «Vuelve a bodega».
- **Satélite A:** las mismas cifras al céntimo; sin tarjeta «Fulfillment»; «Ajustar pago» sí,
  «Corregir métodos de pago» y «Corregir el resultado» no.
- **Central B (modelo nuevo):** «Flete por entregado + IVA ₡3.503,00», «Se le cobra ₡3.503,00», «Se
  le paga ₡2.200,00»; cálculo «₡3.100,00» y «+ … ₡403,00», sin línea «Tarifa:».
- **Ajuste** (`e2e/ajuste-pago-mensajero-cierre.spec.ts`, adaptado): tras ajustar 1 500 → 2 200, la
  fila dice «Se le paga ₡2.200,00», «Ajustado», el motivo escrito y la señal «Pago ajustado».

**Mutaciones antes de creer el verde:** quitar el filtro de `esMontoCero` en «Recibió» (aparece
Transferencia); mostrar Fulfillment también a la satélite; devolver «Ver cómo se calculó» sin la
columna aplicada (pacto ↔ GAM); «Con señales» contando todas.

## Alternativas descartadas

1. **Reescribir `GestionesPorResultado` en su sitio con `audiencia`.** Lo montan también el detalle
   de bodega y `/cierre-dia`: cambiaría esas pantallas antes de sus rebanadas (SLT-104, SLT-108) y
   movería ~10 tests que hoy las protegen. El componente nuevo se monta solo en el admin; el viejo
   se retira en SLT-115 «Retirar los componentes de cierre sustituidos».
2. **Pastillas de filtro nuevas, como dibuja la maqueta.** Sería un control nuevo para algo que ya
   resuelve el conmutador de cierres (`SegmentedToggle`, con conteo y `aria-pressed`): D17 pide
   reutilizar y no inventar. Diferencia visual: botones agrupados en vez de pastillas sueltas (PA4).
3. **`BuscadorFiltros` con el resultado como filtro del selector.** Esconde los conteos en un
   popover y añade una búsqueda que el canvas no dibuja. Además lee y escribe parámetros de la URL
   de la página, que en `/cierres-admin` ya son de la cola.
4. **Calcular en el cliente el IVA incluido, el «Se cobró» o el «− Ajuste».** Rompe R71 y la guardia
   money-safe; se derivan en el servidor (SLT-110).
5. **Un componente de tarjeta nuevo para la fila.** `Cuenta` ya es la cascada aprobada (D16); con
   tres props aditivas cubre título con insignia, botones y «Sin dato» sin duplicar el formato.

## Dependencias de terceros

Ninguna nueva.

*Grafo:* `index_status` del proyecto
`R-job-singularis-projects-servi_logistic-.worktrees-SLT-101-fila-gestion-unica` responde «project
not found». Se exploró con Grep/Read sobre el worktree.
