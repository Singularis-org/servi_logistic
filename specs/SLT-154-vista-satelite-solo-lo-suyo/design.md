# SLT-154 «Vista de la bodega satélite: solo lo suyo» — design (rebanada 1: los detalles)

> Alcance de este diseño: R460–R478 de `requirements.md`. Las descargas de la lista (F3–F5) son de
> SLT-161 «Descargas de la satélite sin el dinero de la empresa». Fuente: Grep/Read sobre este worktree
> (desde `origin/dev`, con SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable»); el
> grafo no indexa este worktree.

## Lo que ya existe

Búsqueda hecha (`docs/specs.md > Antes de especificar`): en `feature_list.json` solo SLT-154 y SLT-161
tratan esto; ningún spec de `specs/` corta el dinero de la empresa a la satélite en el detalle. Lo que
sí existe y esta ficha reusa o extiende:

| Pieza | Dónde | Qué hace hoy | Qué hace esta ficha |
|---|---|---|---|
| `ocultarFulfillmentSiNoCentral` (F481) | `lib/services/CierresAdminService.ts:142` | Anula SOLO el fulfillment de cada gestión para quien no es acceso total. Criterio «no es acceso total», falla cerrado. | Es el precedente. En los dos detalles la sustituye `ocultarDineroEmpresaSiNoCentral` (lo incluye). En F5 no se toca (SLT-161). |
| `desmarcable: false` para la satélite | `CierresBodegaAdminService.ts:527` | Recorte de la cabecera por `esAccesoTotal`. | Mismo sitio, mismo criterio. |
| `pagoEntregado: null` para la satélite (R382) | `CierresAdminService.ts:818-828` | «Anulado, no omitido» en las cifras del Excel. | Mismo trato (`null`) para las cifras de la empresa. |
| `esAccesoTotal` | `lib/auth/acceso-total.ts:7` | Roles de acceso total. | Único criterio del corte. |
| `paraLaCentral`, `efectivoCubreDescuentos` | `lib/utils/ingreso-empresa.ts` | Ya se calculan por cierre del día en el detalle de bodega (`CierresBodegaAdminService.ts:500-509`). | Se calculan también en el detalle del cierre del mensajero (R467). |
| `porcentajesReparto` | usado en `CierresAdminService.ts:1076` y `CierresBodegaAdminService.ts:542` | Reparto en % ya derivado en el servidor. | Una llamada más con [central, pago, bodega] para el cierre del mensajero. |
| `repartirEfectivo` | `lib/services/CierreBodegaService.ts:144` (privada) | «La central debe» de «A consolidar». | Se exporta y el detalle de bodega la usa (R466). |
| `DETALLE_CIERRE_SELECT` / `toDetalleCierreRow` | `lib/repositories/CierresBodegaAdminRepository.ts:185-221` | No lee `pagoIndependienteEfectivo`. | Lo lee (hace falta para R466). |
| `tarjetasAConsolidar` | `components/private/cierres/cola/cola-cierres-vista.ts:337` | Tarjetas de «A consolidar». | Tarjetas de S4 para la satélite (P1). |
| `cuentaCentral` / `lineasCascadaCentral` | `detalle-cierre-vista.ts:722`, `cascadas-bodega.ts:46` | Cuenta «Lo que va a la central» del cierre de bodega. | Se generaliza al «nivel» para S6. |
| `veFulfillment(a, quienMiraEsCentral)` | `components/private/cierres/fila/fila-gestion-vista.ts:327` | Decide quién ve el fulfillment en la fila. | El mismo criterio decide la columna y la tarjeta del cobro (R474, R475). |
| `hayGestionEnModeloNuevo` | `app/(app)/cierres-admin/_components/cierre-labels.ts:221` | Lee `ingresoEmpresa.tarifaModelo`. | Lee también `tarifaModelo` de la gestión (D1). |
| Cabecera `<dl>` (`DatosCabecera`, `paresCabecera*`) | SLT-153, ya en esta rama | Pares sin dinero. | Sin cambio (RU4). |

## Modelo de datos

- **Sin migración ni cambio de esquema.** Nada se guarda: el corte es de lectura y «La central debe»
  se deriva al leer (D9). Sin `down.sql`.
- Multi-empresa y RLS sin cambio: las dos lecturas siguen con su alcance de hoy (`alcanceDeLectura`,
  `alcanceDeLecturaBodega`, filtro de zona en el `WHERE`); esta ficha recorta QUÉ campos salen, no qué
  filas.
- Lectura nueva de una columna existente: `cierre_dia.pago_independiente_efectivo` en
  `DETALLE_CIERRE_SELECT` (misma sentencia, sin consulta nueva).
- País: ningún dato nuevo depende del país. Los importes siguen siendo STRING escala 2 del servidor y
  la moneda la pone `money()` como hoy.

## Autorización

- Dónde: en el servicio, al final de `verCierreDetalle` y `verCierreBodegaDetalle`, después de
  calcular (el cálculo no cambia) y antes de devolver. Las Server Actions (`lib/actions/cierres-admin.ts`,
  `lib/actions/cierre-bodega.ts`) no cambian: siguen pasando el `actor`.
- Criterio: **`!esAccesoTotal(actor.rol)`**, nunca `rol === "adminSatelite"` (R464; F481).
- Módulo: el de cierres, ya exigido por la página y las acciones; sin cambio.

## Contratos (I/O)

### `CierreDetalleAdminServiceResult` (ok) — `lib/interfaces/services/ICierresAdminService.ts:506`

- Pasan a `T | null` (`null` = quien lee no tiene acceso total, SLT-154 R462): `totalesIngreso`,
  `ivaFacturado`, `ganancia`, `pagoTienda`, `cobradoSobreRecaudado`, `netoEmpresa`, `ganaLaTienda`,
  `fleteRechazoYaCobradoATienda`, `partesPorTienda`, `porcentajesReparto`.
- Nuevos, para todo lector (R467): `paraLaCentral: string`, `efectivoCubreDescuentos: boolean`,
  `porcentajesRepartoCentral: number[] | null` (orden [debe llegar a la central, pago al mensajero,
  gana la bodega], base `cierre.totales.general`).
- Sin cambio: `cierre`, `grupos` (cada gestión, ver abajo), `desgloseIngresoBodegaRechazos`,
  `ordenesSinGestion`, `sinGestionRegistrado`, `rechazosDeTienda`, `resueltoPorNombre`.

### `CierreBodegaDetalleServiceResult` (ok) — `lib/interfaces/services/ICierresBodegaAdminService.ts`

- Pasan a `T | null` en el agregado (R460): `totalesIngreso`, `ivaFacturado`, `ganancia`, `pagoTienda`,
  `cobradoSobreRecaudado`, `netoEmpresa`, `ganaLaTienda`, `partesPorTienda`.
- Lo mismo en cada `cierres[i]` (`CierreBodegaDetalleCierre`, R461).
- Nuevo (R466): `centralDebe: string` en el agregado, para todo lector.
- Sin cambio: `cierre` (con su `desmarcable`), `paraLaCentral`, `efectivoCubreDescuentos`,
  `porcentajesReparto` ([central, mensajeros, bodega]: ya es dato de la satélite).

### `CierreDetalleGestion` — `lib/interfaces/services/ICierreDiaService.ts`

- Nuevo, aditivo y opcional: `tarifaModelo?: "viejo" | "nuevo" | null`. Solo lo pone el recorte
  (D1): sin acceso total, `ingresoEmpresa` va en `null` y el modelo de tarifa viaja aquí.
- `ingresoEmpresa` ya admite `null`; su tipo **no cambia** (`total` sigue siendo `string`).

### `CierreBodegaDetalleCierreRow` — `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts:21`

- Nuevo: `pagoIndependienteEfectivo: boolean` (obligatorio: si el mapper lo perdiera, R466 contaría
  un cierre nuevo como viejo).

## El corte en el servidor

En `lib/services/CierresAdminService.ts`, junto a su precedente F481:

```ts
/** SLT-154 (R463): el cobro a la tienda de la gestión es dato de la central. */
export function ocultarDineroEmpresaSiNoCentral<T extends CierreDetalleGestion>(fila: T, actor: Actor): T {
  if (esAccesoTotal(actor.rol)) return fila;
  return { ...fila, ingresoEmpresa: null, tarifaModelo: fila.ingresoEmpresa?.tarifaModelo ?? null };
}
```

- Sustituye a `ocultarFulfillmentSiNoCentral` en `verCierreDetalle` (`:990`) y en
  `verCierreBodegaDetalle` (`CierresBodegaAdminService.ts:438`). Para la central devuelve la fila tal
  cual, así que el fulfillment de la central sigue entero; para la satélite el fulfillment ya va dentro
  del `null`. `listarGestionesCierresAdminCompleto` sigue con `ocultarFulfillmentSiNoCentral` (SLT-161).
- **Clasificación exhaustiva (falla cerrado ante un campo nuevo).** Dos constantes tipadas con
  `satisfies Record<keyof …, "propio" | "empresa">`, una por contrato, junto al servicio que las usa:
  `CLASE_DETALLE_MENSAJERO` (claves del ok de `verCierreDetalle` sin `status`) y
  `CLASE_DETALLE_BODEGA` + `CLASE_CIERRE_DEL_DIA_BODEGA`. Un campo que se añada mañana al contrato
  rompe el typecheck hasta que alguien lo clasifique. El recorte recorre las claves `"empresa"` y las
  pone en `null`:

  ```ts
  function anularEmpresa<T extends object>(r: T, clase: Record<keyof T, "propio" | "empresa">): T
  ```

  Se llama al final de cada lectura: `return esAccesoTotal(actor.rol) ? r : anularEmpresa(r, …)`, y en
  bodega también sobre cada `cierres[i]`.
- El cálculo no cambia: todas las cifras se siguen derivando como hoy y el recorte actúa sobre el
  resultado. Así R465 (la central, igual) se cumple por construcción.

### «La central debe» del cierre de bodega (R466)

1. `lib/repositories/CierresBodegaAdminRepository.ts`: `pagoIndependienteEfectivo: true` en
   `DETALLE_CIERRE_SELECT` y `pagoIndependienteEfectivo: r.pagoIndependienteEfectivo` en
   `toDetalleCierreRow`.
2. `lib/services/CierreBodegaService.ts`: `export function repartirEfectivo` (sin cambiar su cuerpo).
3. `verCierreBodegaDetalle`: `viejos = found.cierresDia.filter((cd) => !cd.resumen.pagoIndependienteEfectivo)`;
   `centralDebe = repartirEfectivo(Σ efectivo de viejos, viejos.map(pago)).centralDebe`, sumando con
   `Prisma.Decimal` (la misma suma de `listarConsolidacion`, `CierreBodegaService.ts:320-326`). Es el
   número que la satélite vio en «A consolidar» al solicitar: los snapshots de esos cierres no cambian.

### Lo que va a la central del cierre del mensajero (R467)

En `verCierreDetalle`, con los snapshots de `resumen` y las funciones de hoy:
`paraLaCentral(general, totalPagoMensajero, totalIngresoBodegaRechazos)`,
`efectivoCubreDescuentos(efectivo, totalPagoMensajero, totalIngresoBodegaRechazos)` y
`porcentajesReparto([paraLaCentral, totalPagoMensajero, totalIngresoBodegaRechazos], general)`. Se
emiten para todos los lectores (son datos de la satélite); la central no los pinta.

## La vista

Todo en funciones puras; los `.tsx` solo pasan un argumento más (ver `## Reuso`).

### `components/private/cierres/detalle/detalle-cierre-vista.ts`

- `DetalleBodegaVista`: los campos de la empresa pasan a `string | null` (`pagoTienda`,
  `cobradoSobreRecaudado`, `ivaFacturado`, `netoEmpresa`; `totalesIngreso` y `partesPorTienda` a
  `… | null`) y entra `centralDebe: string`. `vistaBodegaDesdeAdmin` copia tal cual.
- `DetalleMensajeroVista`: entra `haciaLaCentral: NivelCentral | null`, con
  `NivelCentral = { totales: CierreTotales; pago: string; ganaBodega: string; paraLaCentral: string;
  efectivoCubreDescuentos: boolean; porcentajes: readonly number[] | null; modeloNuevo: boolean }`.
  `vistaMensajeroDesdeAdmin` lo arma siempre; `empresa` solo si TODAS sus cifras llegan (si una es
  `null`, `empresa: null`). `vistaMensajeroDesdeCierreDia` y `vistaMensajeroEnCurso` ponen
  `haciaLaCentral: null` (el mensajero no lo ve).
- `cifrasDe`:
  - bodega + `"satelite"` → `tarjetasAConsolidar({ totales, pagoMensajeros, ganaBodega, paraLaCentral,
    centralDebe, mensajeros: conteos.mensajeros, incluyeModeloNuevo: modeloNuevo })` (R468, P1, P8).
  - bodega + `"central"` → `cifrasBodega` de hoy; la tarjeta «Le queda a la empresa» solo si
    `netoEmpresa !== null` (R478).
  - mensajero + `"satelite"` → [`recaudado` (con métodos), `pago` «Pago al mensajero»
    (`PAGO_MENSAJERO_LABEL`, `contextoPagoMensajero`), `ganaBodega` «Gana la bodega satélite»
    (`TARJETA_GANA_BODEGA`; contexto `NOTA_GANA_BODEGA_VIEJO` solo en el modelo anterior), `paraCentral`
    «Debe llegar a la central» (`NOTA_DEBE_LLEGAR`, resaltada)] (R471). Sin `haciaLaCentral`, solo
    `recaudado` y `pago` (falla cerrado). Ningún `CifraId` nuevo (RU3).
  - mensajero + `"central"` → como hoy; sin `empresa`, sin las dos tarjetas de la empresa (R478).
- `lineasDinero` decide por **los datos que llegan**, no por la audiencia (D4):
  - bodega: `cuentas = [cuentaCentral(nivel, L.PAGO_A_MENSAJEROS_LABEL)]` + `cuentaFactura` y
    `cuentaQueda` solo si sus cifras no son `null`; `porTienda` solo si `partesPorTienda` no es `null` y
    hay dos o más tiendas. La barra, como hoy (R469).
  - mensajero: con `empresa` → hoy. Sin `empresa` y con `haciaLaCentral` → barra [Debe llegar a la
    central, Pago al mensajero, Gana la bodega satélite] con `haciaLaCentral.porcentajes` y
    `cuentas = [cuentaCentral(nivel, PAGO_MENSAJERO_LABEL)]`, `porTienda: null` (R472). Sin ninguno →
    `null`.
- `cuentaCentral(nivel: NivelCentral, rotuloPago: string)`: la de hoy generalizada al nivel; el mapeo
  `ROTULO_UNICO_CENTRAL` usa `rotuloPago` para la línea del pago («Pago a mensajeros» en S4, «Pago al
  mensajero» en S6). Sigue llamando a `lineasCascadaCentral` (RU2).
- `pestanasDe`: con `audiencia === "satelite"`, la pestaña `dinero` se rotula `CASCADA_CENTRAL_TITULO`
  («Lo que va a la central») y va segunda: bodega [gestiones, dinero, mensajeros, conciliación]
  (R470); mensajero [gestiones, dinero, rechazos] (R473). El `PestanaId` sigue siendo `"dinero"`; la
  primera pestaña abierta es `pestanas[0]` (`DetalleCierre.tsx`), así que abre en Gestiones sin tocar
  el componente (RU5).
- Import nuevo `tarjetasAConsolidar` desde `cola-cierres-vista.ts`, que ya importa `fechaHora` y
  `folioDe` de este archivo: ciclo entre dos módulos de funciones, sin uso en la carga del módulo (D8).

### `components/private/cierres/fila/fila-gestion-vista.ts`

- `veDineroEmpresa(a, quienMiraEsCentral) = a === "central" || (a === "solo lectura" && quienMiraEsCentral)`;
  `veFulfillment` pasa a delegar en ella (misma regla, un solo sitio).
- `ColumnaId` gana `"ganaBodega"`. `columnasDe(a, conMensajero, quienMiraEsCentral)` — tercer
  parámetro **obligatorio** (olvidarlo no compila): sin `veDineroEmpresa`, la columna `cobro` se cambia
  por `{ id: "ganaBodega", label: COLUMNA_GANA_BODEGA, derecha: true }` en el mismo sitio (R474, P4).
  Guía y Señales, como hoy (P9).
- `montoDeColumna(g, "ganaBodega")` → `g.ingresoBodegaRechazo` (`null` → «—»).
- `tarjetasDe`: `tarjetaCobro` solo con `veDineroEmpresa` (R475). «Ver cómo se calculó» cuelga del pie
  de esa tarjeta (`FilaGestion.tsx:176`): desaparece con ella.

### `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`

- `columnasDescargaDetalle(tipo: "mensajero" | "bodega", veDineroEmpresa: boolean)`: con `true`, las
  de hoy (`COLUMNAS_DESCARGA_DETALLE_CIERRE` / `_BODEGA`, sin cambio); con `false`, las mismas con
  `{ clave: "ganaBodega", encabezado: COLUMNA_GANA_BODEGA }` en el sitio de `cobroTienda` (R476, D5).
- `filaDescargaDetalleCierre` añade `ganaBodega: g.ingresoBodegaRechazo`.
- Llamadores: `CierresAdminModule.tsx:1435` con `audiencia === "admin"`;
  `DetalleCierreBodegaAbierto.tsx:84` con `audiencia === "central"`.

### Cableado (`.tsx` existentes, una línea cada uno)

- `GestionesCierre.tsx:72` y `FilaGestion.tsx:126`: `columnasDe(audiencia, columnaMensajero,
  quienMiraEsCentral)` (la prop ya existe).
- `CierresAdminModule.tsx`: `DetalleAbierto` con los tipos nuevos y los tres campos de R467 copiados
  en `abrirDetalle`; las columnas de descarga, arriba.
- `DetalleCierreBodegaAbierto.tsx`: las columnas de descarga, arriba.
- `app/(app)/cierres-admin/_components/cierre-labels.ts > hayGestionEnModeloNuevo`: `g.tarifaModelo ??
  g.ingresoEmpresa?.tarifaModelo` (sin esto, la satélite perdería el modelo nuevo y las notas de «Gana
  la bodega» dirían algo falso).

## Reuso (requisito de diseño, P10)

De `reuso.md > Regla para el spec`; el reviewer lo verifica (`tasks.md > T6.3`):

- **RU1** La barra de S4 y S6 es la de `DineroCierre` con `ParteReparto[]` y % del servidor.
- **RU2** «Lo que va a la central» es una `Cuenta` hecha con `cuentaCentral` / `lineasCascadaCentral`
  generalizada al nivel; no hay segunda cascada.
- **RU3** Las tarjetas son `CifrasCierre`; S4 con `tarjetasAConsolidar`, S6 con `cifrasDe` y los
  `CifraId` existentes. Ningún `CifraId` nuevo.
- **RU4** La cabecera es `DatosCabecera` de SLT-153; esta ficha no escribe otro `<dl>`.
- **RU5** Pestañas de `@/components/ui/tabs` en `DetalleCierre`; orden y rótulo desde `pestanasDe`, con
  el mismo `PestanaId "dinero"`.
- **RU6** Lista de gestiones = `GestionesCierre` + `FilaGestion` sin props nuevas; el cambio sale de
  `columnasDe` / `montoDeColumna` / `tarjetasDe` con el `quienMiraEsCentral` existente.

Consecuencia: **ningún `.tsx` nuevo** y ninguna prop nueva en `DineroCierre`, `Cuenta`, `CifrasCierre`,
`DetalleCierre`, `GestionesCierre` ni `FilaGestion`. `DetalleCierre.tsx` no cambia.

## Decisiones técnicas

- **D1 — Anular `ingresoEmpresa` entero y sacar aparte solo `tarifaModelo`.** El hallazgo del
  dimensionado proponía anular campo a campo; se descarta (ver A2). En los detalles, del bloque solo
  hacen falta para la satélite `tarifaModelo` (decide el modelo nuevo de la vista) y nada más: el
  monto a cobrar por guía no se pinta en ninguna superficie de esta ficha (solo en el Excel S10, que
  es de SLT-161). Ventajas: falla cerrado ante un concepto nuevo de la tienda, y el tipo de `total` no
  cambia (no toca `cierre-detalle-shared.tsx` ni la aritmética del servidor).
- **D2 — `null`, no omitido.** Como F481 y R382: el tipo dice que el dato existe y que a este lector no
  le toca. Un campo omitido se confunde con «el contrato viejo no lo traía».
- **D3 — Clasificación exhaustiva tipada** de cada campo como `"propio"` o `"empresa"` (ver arriba).
- **D4 — Las cuentas y la barra salen de los datos; las tarjetas y las pestañas, de la audiencia.**
  Si el dato de la empresa no llega, no hay cuenta que pintar (R478), sea cual sea la audiencia. Las
  tarjetas y el orden de las pestañas sí dependen de quién mira (son otra información, no la misma
  sin datos).
- **D5 — La descarga del modal sigue a la tabla.** P4 cambia la columna de la tabla; la descarga de
  R82 de SLT-95 refleja la tabla, así que cambia igual (R476). Derivado de P4, no pedido aparte.
- **D6 — Satélite: Gestiones primero también en S6.** El canvas aprobado lo fija para S4
  (`reuso.md` pieza 5); S6 sigue la misma forma (P5: «misma forma que el modal de bodega»).
- **D7 — Las cifras propias del cierre del mensajero viajan a todos.** Son de la satélite; emitirlas
  siempre evita una rama por audiencia en el servidor.
- **D8 — Ciclo de imports `detalle-cierre-vista` ↔ `cola-cierres-vista`.** Solo funciones, ninguna
  usada al cargar el módulo: en ESM es seguro. El repo no tiene `import/no-cycle`. Si el typecheck o
  el build lo rechazan, `tarjetasAConsolidar` se mueve tal cual a `detalle-cierre-vista.ts` y
  `cola-cierres-vista.ts` la reexporta (una sola fuente).
- **D9 — «La central debe» se deriva al leer**, no se guarda: los snapshots de los cierres del día no
  cambian después de consolidar, así que el número es estable y no hace falta migración.

## Alternativas descartadas

- **A1 — Ocultar solo en pantalla** (que la vista no pinte el dato y el servidor lo siga enviando).
  Descartada por P7: las ocho cifras del agregado, las de cada cierre del día y el cobro de cada gestión
  quedarían a un clic de las herramientas del navegador (tabla de fugas F1/F2). Además, una pantalla
  nueva que reuse el contrato heredaría la fuga.
- **A2 — Anular campo a campo dentro de `ingresoEmpresa`.** Obliga a hacer `total` nullable en
  `IngresoEmpresaDTO`, que arrastra el panel antiguo (`cierre-detalle-shared.tsx:994`, `:1189`,
  `:1243`), la tarjeta de cobro y las descargas, y deja pasar cualquier concepto de la tienda que se
  añada mañana. D1 consigue lo mismo con un `null` y un campo.
- **A3 — Un contrato distinto por audiencia** (unión discriminada `vista: "central" | "satelite"`).
  Más limpio en tipos, pero obliga a reescribir los consumidores de la central y sus tests, y no cabe en
  el tamaño de la rebanada. La clasificación exhaustiva (D3) da la misma garantía ante campos nuevos.
- **A4 — Guardar «La central debe» en `cierre_bodega` al solicitar.** Necesita migración y backfill
  para un número que ya se deriva exacto de snapshots inmutables (D9).

## Verificación

- **Integración contra Postgres real** (`tests/integration/db/satelite-detalle-sin-dinero-empresa-sql-real.test.ts`),
  patrón de `satelite-cierre-bodega-lectura.int.test.ts` (`enTransaccionRevertida`,
  `crearUsuarioDePrueba`, `describe.skip` visible sin base). Corpus propuesto (si la siembra obliga a
  otros números, se recalculan a mano en `progress/impl_SLT-154.md > T1`):
  - Zona C; satélite S (`adminSatelite`, zona C); maestro M.
  - Cierre de bodega BX con tres cierres del día aprobados:
    A (anterior): efectivo 1 000.00, SINPE 2 000.00 → general 3 000.00; pago 700.00; bodega 100.00.
    B (anterior): efectivo 200.00 → general 200.00; pago 800.00; bodega 0.00.
    N (nuevo, `pago_independiente_efectivo = true`): SINPE 500.00 → general 500.00; pago 5 000.00.
  - «La central debe» de BX: efectivo de A+B = 1 200.00; pagos [700, 800]: 700 ≤ 1 200 se paga;
    700 + 800 = 1 500 > 1 200 → no; **«800.00»**. (Con N mal contado: [700, 800, 5 000] → 5 800.00.)
  - Detalle del mensajero de A: debe llegar a la central = 3 000 − 700 − 100 = **2 200.00**;
    efectivo 1 000 frente a 700 + 100 = 800 → cubre (`true`, según la regla de
    `efectivoCubreDescuentos`; comprobar su definición antes de escribir el literal).
  - El cálculo de los % se hace a mano con la regla documentada de `porcentajesReparto`.
- **Unidad** de la vista y de la fila, con fixtures y literales a mano (₡ y rótulos exactos).
- **E2E** `e2e/cierre-bodega-satelite.spec.ts`, con los datos ya sembrados de ese archivo (recaudado
  9 000, pago 1 500, gana la bodega 500, debe llegar 7 000; facturado 3 750, le queda 1 750).
- **Mutaciones obligatorias**: `tasks.md > T2.7` y `T3.6`.
