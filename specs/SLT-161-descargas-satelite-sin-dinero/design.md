# SLT-161 «Descargas de la satélite sin el dinero de la empresa» — design

> Alcance: R480–R489 de `requirements.md`. Fuente: Grep/Read sobre este worktree (`origin/dev`
> 14e38c28, con SLT-154 «Vista de la bodega satélite: solo lo suyo» y SLT-169 «Se le paga hoy a la
> tienda con todos los cobros restados»). El grafo (`codebase-memory-mcp`) no tiene indexado este
> worktree (`index_status`: «project not found»); no se consultó el índice de otro árbol.

## Lo que ya existe

Búsqueda (`docs/specs.md > Antes de especificar`), términos «satélite / satelite», «descarga»,
«dinero de la empresa», «Por tienda», «cifrasModeloNuevo», «ingresoEmpresa»:

- **Board** (`feature_list.json`): solo SLT-154 (`done`, la rebanada 1) y esta ficha tratan esto. SLT-169
  (`done`) cambió columnas del Excel pero no le añade nada a la satélite (su R634). Nada duplicado.
- **Specs**: `specs/SLT-154-vista-satelite-solo-lo-suyo/` reservó R480–R489 para esta ficha y dejó el
  esbozo que aquí se afina (no es duplicado: es el origen, P13). `specs/SLT-169-pago-tienda-neto/` fija
  las columnas de hoy (R628–R630).
- **Código** que se reutiliza:

| Pieza | Dónde | Qué hace hoy | Qué hace esta ficha |
|---|---|---|---|
| `anularEmpresaSiNoCentral`, `anularEmpresa`, `ClasificacionDinero<T>` | `lib/services/CierresAdminService.ts:192-216` (SLT-154 D2/D3) | Recorte de los detalles: pone en `null` cada campo clasificado `"empresa"` si el actor no es acceso total; la clasificación exhaustiva rompe el typecheck ante un campo nuevo. | Se reusa tal cual para las cifras de F3 y F4, con dos clasificaciones nuevas. |
| `ocultarDineroEmpresaSiNoCentral` | `CierresAdminService.ts:181` (SLT-154 D1) | Gestión de los detalles: `ingresoEmpresa: null` y `tarifaModelo` aparte. | Su gemela para la gestión de descarga (F5), que además saca aparte `montoCobrar` (P2). |
| `ocultarFulfillmentSiNoCentral` | `CierresAdminService.ts:144` (F481) | Hoy es el único recorte de F5. | Deja de usarse en F5 (el `null` del bloque lo incluye). Sigue exportada; nada más la usa hoy en producción. |
| `pagoEntregado: null` para la satélite | `CierresAdminService.ts:906` (SLT-140 R382), `CierreBodegaService.ts:546` (SLT-141 R386) | Precedente del corte en las cifras de descarga. | Sin cambio. |
| `columnas…Para(audiencia)` + `CLAVES_SOLO_CENTRAL` | los cuatro `*-descarga-columnas.ts` del modelo nuevo y la fundida | La satélite pierde solo fulfillment y «Pago entregado». | Se amplía el conjunto de claves de la central. |
| Proyección «sin la clave» para la satélite | `filaCierreModeloNuevo` (`cierres-resumen-modelo-nuevo-descarga-columnas.ts:109`), `filaCierreBodegaModeloNuevo` (`:133`), `filaGestionModeloNuevo` (`:183`) | `pagoEntregado` / fulfillment solo entran si `audiencia === "admin"`. | Mismo patrón para las claves EMP (R489). |
| `esAccesoTotal` | `lib/auth/acceso-total.ts` | Único criterio de la central. | Único criterio del corte (R488). |
| Guardia de datos sensibles | `tests/unit/descarga/columnas-sensibles.guardia.test.ts` | Barre todo `*-descarga-columnas.ts` y ejecuta sus `fila*()` con una sonda (credenciales, ids, URL). | No vigila dinero EMP; sigue verde sin tocarla. Los módulos cambiados conservan el sufijo y la firma de UN argumento de entrada (más la audiencia), que es lo que la sonda necesita. |
| Guardia de ámbitos | `tests/unit/descarga/ambito-columnas.guardia.test.ts` | Unicidad de `ambitoColumnas`. | Sin efecto: los libros del modelo nuevo y la fundida no tienen selector con ámbito (`DescargarGestionesDialog.tsx:498`); los dos ámbitos de S9 son de las columnas del modelo anterior, que no cambian. |

## Modelo de datos

- **Sin migración ni cambio de esquema; sin `down.sql`.** El corte es de lectura: se calcula todo como
  hoy y se anula el resultado antes de devolverlo.
- Multi-empresa y RLS sin cambio: las tres lecturas siguen con su alcance de hoy (zona del actor en
  `findCierresBodegaByZona`, `resolveAlcance` en `CierresAdminService`, el `WHERE` de
  `findGestionesDeCierresEnAlcance`/`findGestionesPorAlcanceCompleto`). Esta ficha recorta QUÉ campos
  salen, no QUÉ filas.
- País: ningún dato nuevo depende del país. Importes STRING escala 2 del servidor, como hoy.

## Autorización

- Dónde: en el servicio, en la rama `ok` de cada lectura, después de calcular y antes de devolver. Las
  Server Actions (`lib/actions/cierres-admin.ts`, `lib/actions/cierre-bodega.ts`) no cambian: ya pasan
  el `actor`.
- Criterio: **`!esAccesoTotal(actor.rol)`** (R488, F481). F3 vive en `CierreBodegaService`, que solo
  admite `adminSatelite` (`ROL_AUTORIZADO`, `:41`): allí el corte se aplica igual con
  `anularEmpresaSiNoCentral(…, actor)` para no tener dos criterios.
- Módulo: el de cierres, ya exigido por la página y las acciones; sin cambio.
- La audiencia del libro (`"admin" | "satelite"`) sigue saliendo de `esAccesoTotal` en `page.tsx`, con
  `"satelite"` por defecto en los componentes (falla cerrado). El servidor no confía en ella: corta por
  el actor.

## Contratos (I/O)

### `CifrasCierreDescargaDTO` — `lib/interfaces/services/ICierresAdminService.ts:225` (F4)

- Pasan a `string | null` (`null` = quien lee no tiene acceso total, R481): `pagoTienda`, `ganaLaTienda`,
  `totalFacturado`, `ivaFacturado`, `netoEmpresa`. `partesPorTienda` pasa a
  `ParteDeTiendaDescargaDTO[] | null`. `pagoEntregado` ya era `string | null`.
- Sin cambio: `cierreId`, `gestiones`.
- Siguen siendo **obligatorios** (lección de SLT-123): nullables, nunca opcionales.

### `CifrasCierreBodegaDescargaDTO` — `lib/interfaces/services/ICierreBodegaService.ts:333` (F3)

- Pasan a `string | null`: `totalFacturado`, `ivaFacturado`, `netoEmpresa`, `ganaLaTienda`;
  `partesPorTienda` a `ParteDeTienda[] | null`. Sin cambio: `cierreBodegaId`, `gestiones`,
  `pagosAjustados`.
- `CifrasCierreBodegaCentralDescargaDTO` (la de la central, `:354`) hereda los tipos; la central los
  recibe siempre poblados (R487).

### `CierreGestionDescargaDTO` — `ICierresAdminService.ts:284` (F5)

- Nuevos, aditivos y opcionales (como los de SLT-113, para no romper los dobles de hoy):
  `montoCobrar?: string | null` y `tarifaModelo?: "viejo" | "nuevo" | null`. Solo los pone el recorte
  (D1): sin acceso total, `ingresoEmpresa` va en `null` y estos dos viajan aquí con el valor que tenían
  dentro del bloque.
- `ingresoEmpresa` ya admite `null`; su tipo no cambia. `CierreGestionDescargaRow` (la del repositorio)
  no cambia: el repositorio sigue emitiendo el bloque entero.

## El corte en el servidor

En `lib/services/CierresAdminService.ts`, junto a sus precedentes:

```ts
/** SLT-161 (R482): el cobro a la tienda de la gestión de descarga es dato de la central. */
export function ocultarDineroEmpresaDescargaSiNoCentral<T extends CierreGestionDescargaDTO>(fila: T, actor: Actor): T {
  if (esAccesoTotal(actor.rol)) return fila;
  const ingreso = fila.ingresoEmpresa;
  return {
    ...fila,
    ingresoEmpresa: null,
    montoCobrar: ingreso?.montoCobrar ?? null,
    tarifaModelo: ingreso?.tarifaModelo ?? null,
    ...(fila.fulfillmentCargadoDia !== undefined ? { fulfillmentCargadoDia: null } : {}),
  };
}

/** SLT-161 (R481, R488): de quién es cada campo de las cifras del «Resumen» de cierres. */
export const CLASE_CIFRAS_DESCARGA_CIERRE = {
  cierreId: "propio", gestiones: "propio",
  pagoTienda: "empresa", ganaLaTienda: "empresa", totalFacturado: "empresa",
  ivaFacturado: "empresa", netoEmpresa: "empresa", partesPorTienda: "empresa",
  pagoEntregado: "empresa",
} as const satisfies ClasificacionDinero<CifrasCierreDescargaDTO>;
```

- **F5** (`listarGestionesCierresAdminCompleto`, `:978`): el `map` actual (fulfillment + día del cargo)
  se sustituye por `ocultarDineroEmpresaDescargaSiNoCentral`. Los rechazos de tienda no cambian (sin
  importes).
- **F4** (`completoConCifras`, `:902`): cada `toCifrasDescarga(...)` pasa por
  `anularEmpresaSiNoCentral(c, CLASE_CIFRAS_DESCARGA_CIERRE, actor)`. El cálculo no cambia; la
  `pagoEntregado` de la central sigue saliendo de `entregado`.
- **F3** (`listarCierresBodegaSolicitadosCompleto`, `CierreBodegaService.ts:551`): cada entrada de
  `cifrasBodegaDescarga(nuevos, filas)` pasa por `anularEmpresaSiNoCentral(c,
  CLASE_CIFRAS_BODEGA_DESCARGA, actor)`. La clasificación vive en `lib/services/cifras-bodega-descarga.ts`,
  junto al DTO que construye:

  ```ts
  export const CLASE_CIFRAS_BODEGA_DESCARGA = {
    cierreBodegaId: "propio", gestiones: "propio", pagosAjustados: "propio",
    totalFacturado: "empresa", ivaFacturado: "empresa", netoEmpresa: "empresa",
    ganaLaTienda: "empresa", partesPorTienda: "empresa",
  } as const satisfies ClasificacionDinero<CifrasCierreBodegaDescargaDTO>;
  ```

  `anularEmpresa` / `ClasificacionDinero` se importan desde `CierresAdminService.ts` (ya exportados). Si
  el import crea un ciclo, se mueven las dos piezas a `lib/services/anular-empresa.ts` y
  `CierresAdminService.ts` las reexporta (sin cambio de comportamiento); ese archivo está en
  `## Archivos esperados` como condicional.
- `CierresBodegaAdminService.completoConCifras` (central) no cambia.

## El libro (cliente)

Todo en `app/(app)/cierres-admin/_components/`, módulos puros:

- **Columnas** — cada `CLAVES_SOLO_CENTRAL` (o el `CLAVE_PAGO_ENTREGADO` suelto) pasa a ser el conjunto
  de claves EMP de esa hoja, y `columnas…Para("satelite")` filtra por él:
  - fundida (`cierres-gestiones-fundida-descarga-columnas.ts:313`): `fulfillment`, `fleteConIva`,
    `comisionConIva`, `fleteDevolucionConIva`, `ingresoTotal` → 26 (R483).
  - «Gestiones» (`cierres-gestiones-modelo-nuevo-descarga-columnas.ts:36`): las tres de fulfillment +
    `flete`, `tarifaFlete`, `ivaFlete`, `comisionCod`, `tarifaComision`, `ivaComisionCod`,
    `fleteDevolucion`, `tarifaFleteDevolucion`, `ivaFleteDevolucion`, `cobroTienda`, `ivaIncluido` → 21
    (R484).
  - «Cierres» de mensajeros (`cierres-resumen-modelo-nuevo-descarga-columnas.ts:32`): `pagoEntregado`,
    `pagoTienda`, `totalFacturado`, `ivaFacturado`, `netoEmpresa` → 14 (R485).
  - «Cierres» de bodega (`cierres-bodega-modelo-nuevo-descarga-columnas.ts:34`): `pagoEntregado`,
    `ganaLaTienda`, `totalFacturado`, `ivaFacturado`, `netoEmpresa` → 21 (R485).
  - La central sigue recibiendo el array entero, mismo objeto (R487).
- **Proyecciones** (R489) — `filaCierreModeloNuevo`, `filaCierreBodegaModeloNuevo` y
  `filaGestionModeloNuevo` emiten las claves EMP solo con `audiencia === "admin"`, como ya hacen con
  `pagoEntregado` y el fulfillment. `filaDescargaGestionFundida` no recibe audiencia (firma de UN
  argumento que la guardia de la sonda ejecuta) y no cambia de firma: con `ingresoEmpresa` en `null`
  sus cuatro celdas EMP salen `null` (R489) y la columna no existe en el libro de la satélite (R483).
  Ponerle audiencia para quitar también la clave obligaría a tocar todos sus llamadores y no le cambia
  nada al usuario: el archivo se escribe por columnas declaradas.
- **Monto a cobrar y modelo** (R483) — la fundida lee `gestion.ingresoEmpresa?.montoCobrar ??
  gestion.montoCobrar ?? null` (`:494`) y `gestion.ingresoEmpresa?.tarifaModelo ?? gestion.tarifaModelo`
  (`:542`). Sin esto, una gestión del modelo nuevo de la satélite perdería «Pago al mensajero» y «Gana la
  bodega» en `incidente` y `reprogramado` (`ESPECIFICAS_EXTRA_MODELO_NUEVO`, `:413`). Mismo trato que
  SLT-154 dio a `hayGestionEnModeloNuevo`.
- **Hoja «Por tienda»** (R486) — `libroResumenCierres` (`cierres-resumen-modelo-nuevo-descarga.ts:82`) y
  `libroCierresBodega` (`cierres-bodega-modelo-nuevo-descarga.ts:90`) solo la añaden con
  `audiencia === "admin"`; con la satélite no recorren `partesPorTienda` (que llega en `null`).
- Los `.tsx` no cambian: ya pasan la audiencia (`ConsolidacionBodegaModule.tsx:272`,
  `CierresAdminModule.tsx:328`, `:389`, `DescargarCierresButton.tsx:141`, `:260`).

## ¿Toca dinero?

Solo lectura y presentación. Ningún servicio que escribe dinero cambia; ningún movimiento de wallet,
caja ni aprobación. Lo que cambia es qué cifras ya calculadas viajan a la satélite y qué columnas lleva
su archivo.

## Decisiones técnicas

- **D1 — En F5, `ingresoEmpresa` entero en `null` y aparte `montoCobrar` + `tarifaModelo`.** Mismo
  criterio que SLT-154 D1 (falla cerrado: un concepto de la tienda que se añada mañana tampoco llega). El
  monto a cobrar es SAT por P2 y vive dentro del bloque (`ICierreDiaService.ts:266`); el modelo hace
  falta para poblar celdas SAT del modelo nuevo.
- **D2 — `null`, no omitido, en el servidor; clave ausente en la fila.** En el DTO, como SLT-154 D2 y
  R382: el tipo dice que el dato existe y que a este lector no le llega. En la fila del libro, como
  `pagoEntregado`: la satélite no recibe ni el encabezado ni la clave (R489).
- **D3 — Clasificación exhaustiva tipada** de los dos DTO de cifras, con la `ClasificacionDinero` que ya
  existe. `pagoEntregado` se clasifica `"empresa"`: para la satélite ya era `null` y así lo dice el tipo.
- **D4 — Los recuentos son contrato.** Los tests afirman 26/21/14/21 (satélite) y 31/35/19/26 (central)
  con literales; el literal es el contrato, no se compara contra el array que lo produce.
- **D5 — Sin E2E nuevo.** Ningún E2E descarga hoy un Excel de cierres de la satélite, y montar la
  lectura del `.xlsx` en Playwright es más que la ficha. La cadena servidor → libro queda cubierta por
  integración (Postgres real, F3–F5) + unidad (columnas, filas, hojas). Antes del PR corren en local
  `e2e/cierre-bodega-satelite.spec.ts` y `--project=dinero` (`docs/perfil-agentes.md`), y Carlos lo
  aprueba descargando en Preview con el usuario demo de satélite.

## Alternativas descartadas

- **Solo quitar las columnas en el cliente.** Es lo mínimo en archivos, pero deja las cinco cifras, el
  reparto por tienda y el cobro por gestión a un clic de las herramientas del navegador; P7 lo descarta
  explícitamente («en el servidor»).
- **Un DTO distinto por audiencia (las claves EMP ausentes en el de la satélite)**, como se hizo con
  `pagoEntregado` en SLT-141. F4 es UNA lectura que sirve a las dos audiencias con un solo tipo de
  resultado; dos formas exigirían un genérico por audiencia en `ConCifrasModeloNuevoEnOk`, en los dos
  `listar…Completo` y en los dos libros, y se perdería la clasificación exhaustiva que ya usa SLT-154. El
  `null` del servidor + la clave ausente en la fila da el mismo resultado al usuario con menos tipos.
- **Anular campo a campo dentro de `ingresoEmpresa`** (como `ocultarFulfillmentSiNoCentral`) para no
  tocar la lectura de `montoCobrar`/`tarifaModelo`. Falla abierto: un concepto nuevo de la tienda viajaría
  hasta que alguien se acordara de añadirlo. SLT-154 D1 ya eligió el bloque entero para los detalles; dos
  criterios distintos para la misma gestión serían peores.
- **Sustituir las columnas EMP por columnas SAT** («Debe llegar a la central» en la hoja de mensajeros,
  como «Gana bodega» en el detalle): SLT-169 R634 y L1 piden que la satélite no gane columnas; esto sería
  diseño nuevo, no el corte.

## Verificación

- Integración (Postgres real, base desechable): los dos `*-sql-real.test.ts` existentes ya siembran la
  satélite con cierres nuevos (S1 en zona Centro; BN/BV de bodega); se cambian sus aserciones de la
  satélite y se añade el caso de F5 sobre el mismo corpus. Mutación de control: quitar la llamada al
  recorte en cada lectura debe poner rojo su caso.
- Unidad: servicios (dobles) para R480–R482/R488; columnas, filas y hojas para R483–R487/R489.
- Gate: `./init.sh` (con `.env` copiado al worktree antes del primer gate), `pnpm run test:guardias`.
- Antes del PR: `e2e/cierre-bodega-satelite.spec.ts` y `pnpm exec playwright test --project=dinero` en
  local; Preview con Carlos.
