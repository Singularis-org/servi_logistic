# SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» — design

> Fuente: `requirements.md` de esta carpeta y el madre `specs/SLT-95-detalle-cierre-rediseno/`
> (`design.md > Autorización`, `> 2. Cola de cierres`, `> Props → quién las usa` «Detalle · bodega ·
> satélite · solo lectura · modal» y «Cola · bodega · satélite»). El MCP del grafo no tenía indexado
> este worktree: se exploró con Grep/Read.

## Lo que ya existe

Buscado en `feature_list.json` («satélite», «bodega», «Solicitados»), en `specs/` («Por llegar a la
central», «Recibido por la central», «Solicitados», «verCierreBodegaDetalle») y en el código
(`verCierreBodegaDetalle`, `findCierreBodegaConDetalle`, `ocultarFulfillmentSiNoCentral`,
`CierresBodegaSolicitadosLista`, `columnasCola`, `DetalleCierre`). Nada lo resuelve ya; esto se
reutiliza:

| Qué | Dónde | Cómo se usa aquí |
|---|---|---|
| Lectura del detalle de bodega | `CierresBodegaAdminService.verCierreBodegaDetalle` + `CierresBodegaAdminRepository.findCierreBodegaConDetalle` | Mismo método para la satélite; solo cambia la guardia de rol y el `where` de la cabecera (R280-R284). |
| Anulación del fulfillment | `ocultarFulfillmentSiNoCentral` en `CierresAdminService.ts` (ya anula `fulfillmentCargadoAt`, SLT-101/SLT-110) | Se exporta y se aplica a cada gestión del detalle de bodega (R283, D-H110). Precedente: `toDetalleDTO` ya se importa de `CierreDiaService`. |
| Zona del usuario | `OrdenRepository.findUsuarioZonaId` (la usan `CierreBodegaService` y `CierresAdminService.resolveAlcance`) | Se inyecta en `CierresBodegaAdminService` (R280). |
| Lista de «Solicitados» con filtros | `CierreBodegaService.listarCierresBodegaSolicitadosPaginado` → `cierresBodegaDeZonaWhere` (zona + `solicitadoAt` + recorte) | El servidor ya filtra; falta que la pantalla le pase los filtros (R52, R290). |
| Conjunto de cierres de bodega de la zona | `listarConsolidacion` ya lee `findCierresBodegaByZona(zonaId)` (`cierresBodegaPasados`) en cada render | De ese mismo array salen las tres cifras de R68 (R287): cero consultas nuevas a la tabla. |
| Suma de importes | `sumarMontos` (`lib/utils/kpis-financieros.ts`, `Prisma.Decimal`) | Las tres sumas de R287. |
| Corte de «30 días» | `inicioDeUltimosNDiasEnUtc(30, now, zona)` (`lib/utils/calendario-zona.ts`) + `zonaDeLaEmpresa` | R287. |
| Cola única | `ColaCierres` (variante `bodega`·`satelite`, SLT-106) | Gana el panel de «Solicitados» (R286-R289). |
| Columnas y celdas de bodega | `COLUMNAS_BODEGA`, `TablaColaBodega`, `recibidoCola`, `faltaResaltada`, `estadoConciliacionDe` (SLT-127) | La tabla de «Solicitados» usa las mismas celdas, sin Bodega ni Solicitó (R288). |
| Tarjetas | `CifrasCierre` + `Cifra` (SLT-106 añadió `aviso`) | Tres tarjetas nuevas (R286). |
| Detalle único de bodega | `DetalleCierre` tipo bodega + `vistaBodegaDesdeAdmin`, `GestionesCierre`, `MensajerosCierreBodega`, `ConciliacionCierreBodega` (SLT-104); `detalle-cierre-vista.ts` ya tiene los textos de audiencia satélite (`CENTRAL_AUN_NO_MARCA`, `PIE_BODEGA_SATELITE_PENDIENTE`) y `accionesDe` ya deja solo «Cerrar» a quien no es central | Se extrae su montaje de `CierresBodegaAdminModule` a un componente común (R295). |
| Barra y descarga | `FiltrosCierresBarra` (`BuscadorFiltros`), `DescargarDatasetButton` con `descargaBodegaSolicitados(filtros)` | Sin cambios (D17). |
| Reparto en % | SLT-111 (PR #139): `porcentajesReparto` dentro de `verCierreBodegaDetalle` y `vistaBodegaDesdeAdmin` | Llega solo, por el mismo método (D-H111, R284). |

## Modelo de datos, RLS y migraciones

**Ninguno.** Sin tablas, columnas, índices, políticas RLS ni migraciones; por tanto sin `down.sql`.
Todo lo que se lee es de `cierre_bodega`, `cierre_dia`, `gestion_orden`, `cierre_detail` y
`usuario`, que ya tienen `organizacion_id` y RLS `<t>_por_empresa`. El filtro de empresa lo siguen
poniendo la extensión del cliente (`lib/db/extension-empresa.ts`) y la RLS; esta ficha **añade** el de
zona en el `where`, no quita ninguno.

## Autorización (dónde se valida)

Todo en el servidor; la pantalla no decide permisos (solo pinta lo que llega y monta o no nodos).

### `CierresBodegaAdminService.verCierreBodegaDetalle` (R280-R284)

```ts
/** El alcance con el que se LEE la cabecera de un cierre de bodega. */
type AlcanceLecturaBodega = { lectura: "toda_la_empresa" } | { lectura: "zona"; zonaId: string };

constructor(
  repo: ICierresBodegaAdminRepository,
  signedUrls: ISignedUrlProvider,
  reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
  // SLT-107 (R280): la zona del adminSatelite, de SU usuario en la base. Ausente = la satélite no
  // tiene alcance (falla cerrado: `forbidden`).
  zonaDelUsuario?: Pick<OrdenRepo, "findUsuarioZonaId">,
)
```

1. `esAccesoTotal(actor.rol)` → `{ lectura: "toda_la_empresa" }`.
2. `actor.rol === "adminSatelite"` → `zonaId = await this.zonaDelUsuario?.findUsuarioZonaId(actor.usuarioId) ?? null`;
   `null` → `forbidden` (R281). Si no, `{ lectura: "zona", zonaId }`.
3. Cualquier otro rol → `forbidden` antes de leer (R282).
4. `found = repo.findCierreBodegaConDetalle(id, zona, alcance)`. `null` → `no_encontrada` si el
   alcance es de toda la empresa (como hoy), **`forbidden`** si es de zona (R281: «no es de tu zona» y
   «no existe» no se distinguen, como `CierresAdminService` hace con `no_encontrada`; así no se filtra
   la existencia de cierres de otra zona y se cumple R50).
5. Al construir `grupos`, cada `toDetalleDTO(g, urlByPath)` pasa por `ocultarFulfillmentSiNoCentral(…,
   actor)` (R283). Para acceso total devuelve la fila tal cual: la central no cambia.
6. La cabecera: `cierre: esAccesoTotal ? resumen : { ...resumen, desmarcable: false }` (R283).
7. Nada más cambia: mismos derivados, mismo orden, misma firma de evidencias. Con SLT-111 en `dev`,
   `porcentajesReparto` se calcula en este mismo método para las dos audiencias (R284, D-H111).

La zona se resuelve con `findUsuarioZonaId` y no con `actor.zonaId`, por la misma razón que
`CierreBodegaService` y `CierresAdminService.resolveAlcance`: sale del usuario en la base, y los tres
caminos de la satélite deben usar la misma fuente.

### `CierresBodegaAdminRepository.findCierreBodegaConDetalle` (R280, R281)

```ts
findCierreBodegaConDetalle(id: string, zona: string, alcance: AlcanceLecturaBodega): Promise<… | null>
```

- La cabecera pasa de `findUnique({ where: { id } })` a
  `findFirst({ where: { id, ...(alcance.lectura === "zona" ? { zonaId: alcance.zonaId } : {}) } })`.
  El filtro de zona va **en el `where`** (D-S9): no se lee y se descarta.
- Si la cabecera es `null`, se devuelve `null` **antes** de leer `cierre_dia`, gestiones y
  `cierre_detail` y antes de los cargos de fulfillment (R281: ninguna lectura más).
- `alcance` es **obligatorio**: cada llamada declara su alcance y el compilador no deja olvidarlo.
- `AlcanceLecturaBodega` vive en `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`.

### Composition root (R280)

`buildCierresBodegaAdminService()` en `lib/actions/cierre-bodega.ts` pasa
`new OrdenRepository(prisma)` como cuarto argumento. Es la única construcción de producción (la
otra, `buildCierreBodegaService`, ya lo hace). La prueba de que **se inyecta** —no solo que se
importa— es la integración de T1.5, que llama a la Server Action **sin** `cierresBodegaAdminService`
en `deps` (memoria «el composition root que no inyecta»).

### Lo que no cambia (R285)

`aprobarCierreBodega` y `rechazarCierreBodega` conservan `if (!esAccesoTotal) forbidden`. Las
acciones de la conciliación (`ConciliacionService`, `components/shared/conciliacion/*`) no se tocan.
`/cierres-admin/page.tsx` sigue con `notFound` para quien no sea acceso total ni `adminSatelite`.

Módulo: el de cierres sigue colgando de `nucleo` (`lib/modulos/reparto.ts`); no cambia.

## Cifras de «Solicitados» (R68, R287)

En `CierreBodegaService.listarConsolidacion`, después de leer `cierresBodegaPasados` (que ya es el
conjunto completo de la zona, sin filtros):

```ts
// lib/interfaces/services/ICierreBodegaService.ts
export interface CifraConConteo { monto: string; cierres: number }   // monto: escala 2
export interface ResumenSolicitados {
  porLlegar: CifraConConteo;          // conciliadoAt === null → Σ paraLaCentral
  recibido30Dias: CifraConConteo;     // conciliadoAt ≥ inicioDeUltimosNDiasEnUtc(30, ahora, zona) → Σ montoRecibido
  faltaPorRecibir: CifraConConteo;    // conciliadoAt !== null && faltaPorRecibir > 0 → Σ faltaPorRecibir
}
// ListarConsolidacionServiceResult (ok) gana: solicitadosResumen: ResumenSolicitados  (aditivo)
```

- Función pura `resumenSolicitados(cierres, desde: Date)` en `CierreBodegaService.ts` (exportada para
  probarla con literales), que filtra y llama a `sumarMontos`. El «> 0» de `faltaPorRecibir` se
  compara con `Prisma.Decimal` (`gt(0)`), la misma regla que `hayFaltantePorRecibir` de la pantalla
  («cero o negativo —llegó de más— no falta»).
- `desde` = `inicioDeUltimosNDiasEnUtc(30, this.ahora(), zonaHoraria)`, con `zonaHoraria` de
  `zonaDeLaEmpresa(this.reglasPais, "CierreBodegaService.listarConsolidacion")`. El reloj entra por
  constructor (`private readonly ahora: () => Date = () => new Date()`, patrón de
  `AbonoTiendaService`), como cuarto parámetro (tras `reglasPais`), para que el test fije «hoy».
- Sin zona: `{ monto: "0.00", cierres: 0 }` en los tres, sin leer la zona horaria.
- Coste: una lectura de la zona horaria de la empresa por render de la satélite (las reglas del país);
  ninguna consulta nueva a `cierre_bodega`.
- **PA3**: el ancla es el `conciliadoAt` vigente.

La pantalla recibe `solicitadosResumen` por props desde `page.tsx` (Server Component) y no recalcula
nada (R71).

## Pantalla

### `ColaCierres` — variante `bodega`·`satelite` (R286-R291)

`ColaCierresConsolidarProps` cambia `solicitados: ReactNode` por los datos del panel:

```ts
solicitados: {
  tarjetas: readonly Cifra[];                 // tarjetasSolicitados(resumen)
  filas: readonly CierreBodegaResumen[];
  acciones: { ver: (cierreBodegaId: string) => void };
  cargando: boolean; error: string | null;
  paginacion: ReactNode;                      // la <Pagination> de hoy, con su nombre
};
```

- `PanelSolicitados`: `CifrasCierre` (sin `totales`: ver abajo) + `<section aria-label="Cierres de
  bodega solicitados">` con `TablaColaSolicitados`.
- `TablaColaSolicitados` reutiliza la función de celdas de `TablaColaBodega` (se extrae a
  `celdaBodega(id, c, onVer)`), añade el caso `recaudado` (`money(c.totales.general)`) y su acción es
  un único «Ver» (`L.nombreVerCierreBodega(folio)`), no `accionBodegaDe` (esa elige conciliar/corregir,
  que la satélite no tiene).
- `columnasCola("bodega", "satelite", pestana)`: `aConsolidar` → `COLUMNAS_A_CONSOLIDAR` (hoy);
  `solicitados` → `COLUMNAS_SOLICITADOS_SATELITE` = Folio · Solicitado · Cierres · Recaudado · Debe
  llegar · Recibido · Falta · Estado · acciones (canvas, líneas 185-186).
- `PieConsolidar`: en «Solicitados» pinta `L.PIE_SOLICITADOS` y la paginación de solicitados, sin
  botón (R289). Sigue igual en «A consolidar».
- Las dos `TabsContent` se quedan montadas (`keepMounted`) como hoy en «Solicitados»: cambiar de
  pestaña no pierde la página (R291).
- `CifrasCierre`: `totales` pasa a opcional; solo lo lee una caja con `conMetodos`. Las tarjetas de
  «Solicitados» no tienen métodos (D4).

### `cola-cierres-vista.ts` y `cola-cierres-labels.ts`

- `tarjetasSolicitados(r: ResumenSolicitados): Cifra[]` — tres `tarjeta()` con ids nuevos de `CifraId`
  (`porLlegar`, `recibido30Dias`, `faltaPorRecibir`, en `detalle-cierre-vista.ts`), «Por llegar»
  `destacada`, «Falta» con `aviso` solo si `cierres > 0` (R286).
- Labels nuevos en «tú»: `TARJETA_POR_LLEGAR`, `TARJETA_RECIBIDO_30_DIAS`, `TARJETA_FALTA_POR_RECIBIR`,
  `notaPendientesConciliar(n)`, `notaCierresDeBodega(n)`, `notaLlegaronIncompletos(n)`,
  `PIE_SOLICITADOS`, `REGION_SOLICITADOS`, `VACIO_SOLICITADOS`, `ERROR_SOLICITADOS`,
  `nombreVerCierreBodega(folio)`. Los tres de región/vacío/error son los textos de hoy de
  `CierresBodegaSolicitadosLista`, movidos (no cambian).

### `ConsolidacionBodegaModule` (R52, R290-R294)

- Estado nuevo: `pageSolicitados`, `pageSizeSolicitados`; SWR con clave
  `["cierres-bodega:solicitados", page, pageSize, filtros]` (el prefijo de hoy: el `mutate` tras
  solicitar sigue casando) y `leerSolicitados(page, pageSize, filtros)` exportada desde
  `CierresBodegaSolicitadosLista.tsx` (su `leerPagina` de hoy, con filtros). `fallbackData` solo con
  página 1, tamaño inicial y `sinFiltrosBodega(filtros)` (R290), igual que «A consolidar».
- `aplicarFiltros(next)`: `setFiltros(next); setPage(1); setPageSolicitados(1)` (R291).
- Conteo de la pestaña: `paginaSolicitados.total` (R290).
- «Ver»: `abrirDetalle(cierreBodegaId)` llama a la Server Action `verCierreBodegaDetalle`; `ok` →
  guarda el resultado; otro → toast de R293 y no abre. El detalle se monta con
  `DetalleCierreBodegaAbierto` audiencia `satelite`, sin `conciliacion`; `onVerSuCierre(href)` →
  cerrar + `router.push(href)` (R294); evidencia con el `VisorEvidencia` de hoy.
- Props nuevas: `solicitadosResumen: ResumenSolicitados`. `page.tsx` la pasa desde
  `consolidacion.solicitadosResumen`.
- Sin zona (R202): sigue como hoy (aviso + `CierresBodegaSolicitadosLista`).

### `DetalleCierreBodegaAbierto` — un solo montaje del detalle de bodega (R292, R295)

`components/private/cierres/detalle/DetalleCierreBodegaAbierto.tsx` (nuevo). Recibe datos por props,
no fetchea (`components/private/`). Es el bloque que hoy vive en `CierresBodegaAdminModule.tsx`
(líneas 556-623), movido sin cambiar su JSX:

```ts
interface DetalleCierreBodegaAbiertoProps {
  detalle: CierreBodegaDetalleOk;            // el `ok` de verCierreBodegaDetalle, tal cual
  audiencia: "central" | "satelite";
  conciliacion?: ReactNode;                  // ConciliacionAcciones; ausente = solo «Cerrar» (R51)
  onCerrar: () => void;
  onVerSuCierre: (href: string) => void;     // R294 / R115
  onVerEvidencia: (e: EvidenciaAbierta) => void;
}
```

- `DetalleCierre tipo="bodega" marco="modal" audiencia={audiencia} modo={modoBodegaDe(detalle.cierre)}`
  (PA1); `GestionesCierre audiencia="solo lectura" quienMiraEsCentral={audiencia === "central"}`, con
  la descarga de hoy (`COLUMNAS_DESCARGA_DETALLE_BODEGA`, sin columnas de fulfillment); pestañas
  Mensajeros y Conciliación como hoy; `acciones={{ conciliacion }}`.
- La vista sigue saliendo de `vistaBodegaDesdeAdmin(detalle)`: con SLT-111, el reparto en % llega sin
  código aquí (D-H111).
- `CierresBodegaAdminModule` pasa a montarlo con `audiencia="central"` y su `ConciliacionAcciones`
  cuando `puedeConciliar`. Su suite (`CierresBodegaAdminDetalleUnico`, `CierresBodegaAdminDeepLink`,
  `CierresBodegaAdminRefresco`) no se edita: verde sin tocarla es la prueba de R295.

## Contratos I/O

| Superficie | Antes | Después |
|---|---|---|
| `verCierreBodegaDetalle({ cierreBodegaId })` (Server Action) | `adminSatelite` → `forbidden` | `adminSatelite` → `ok` (su zona, sin fulfillment, `desmarcable: false`) o `forbidden` |
| `ICierresBodegaAdminRepository.findCierreBodegaConDetalle` | `(id, zona)` | `(id, zona, alcance)` |
| `ListarConsolidacionServiceResult` (`ok`) | — | `+ solicitadosResumen` (aditivo) |
| `ColaCierresConsolidarProps.solicitados` | `ReactNode` (la lista de hoy) | objeto con tarjetas, filas, acciones, carga, error y paginación |
| `CifrasCierre.totales` | obligatorio | opcional (solo para `conMetodos`) |
| `listarCierresBodegaSolicitadosPaginado` | sin cambios (ya admitía `filtros`) | la pantalla ahora los envía |

Integraciones externas: ninguna nueva (la firma de evidencias ya existía en este método).

## Datos que dependen del país

- **Moneda:** solo `money()`; ningún símbolo en componentes.
- **Fechas:** «30 días» se corta en la zona horaria de la empresa (`zonaDeLaEmpresa` +
  `inicioDeUltimosNDiasEnUtc`), nunca con un literal de zona; «Solicitado» se pinta con `fechaCola`
  de hoy.
- **Impuestos y métodos de pago:** no aparecen en lo nuevo (las tarjetas no llevan métodos; el IVA del
  detalle es el de SLT-104/SLT-110, sin cambios).

## Verificación (memoria «probar el WHERE donde vive»)

Integración contra Postgres real (`tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts`,
`HAY_BASE_DE_DATOS`), con datos que el test **exige** antes de afirmar (cuenta las filas sembradas y
falla si faltan):

- Empresa A con zonas Z1 (la de la satélite S1) y Z2 (satélite S2); empresa B con su zona ZB y su
  satélite.
- Z1: CB1 sin marca (pendiente), CB2 recibido completo hace 3 días, CB3 recibido incompleto hace 10
  días, CB4 recibido completo hace 45 días, todos con importes escritos a mano; un cierre del día por
  cierre de bodega con gestiones de los dos modelos y fulfillment cargado.
- Z2: CB5 pendiente y CB6 recibido. ZB: CB7 pendiente.

Casos: S1 lee CB1 (`ok`, fulfillment `null`, `desmarcable` false, igual a la central en lo demás);
S1 lee CB5 → `forbidden`; S1 sin zona → `forbidden`; maestro de A lee CB7 → `no_encontrada`; cifras
de R287 de S1 con literales; lista de S1 con rango de `solicitadoAt` que deja fuera CB4.

Mutaciones (cada una pone rojo al menos un caso; se anotan en `progress/impl_SLT-107.md`): quitar
`zonaId` del `where` de la cabecera; quitar `zonaId` de `cierresBodegaDeZonaWhere`; correr la lectura
de CB7 con el cliente sin la extensión de empresa (empresa); invertir «sin marca» en `porLlegar`
(estado); `faltaPorRecibir ≥ 0` en vez de `> 0` (estado); corte de 31 días en vez de 30.

## Alternativas descartadas

1. **Un método nuevo `verMiCierreBodega` en `CierreBodegaService`** (el lado satélite), con su propia
   lectura. Descartada: duplicaría la lectura del detalle (cierre_dia, gestiones, snapshots, cargos de
   fulfillment) y todos sus derivados, y D-H111 pide que, si hay un método nuevo, repita
   `porcentajesReparto` con las mismas partes; dos copias de la misma cifra divergen. Con el mismo
   método, R284 se cumple por construcción.
2. **Leer el cierre y comprobar la zona en el servicio** (`if (found.cierre.zonaId !== zonaId)
   forbidden`). Descartada por D-S9 y por la memoria «probar el WHERE donde vive»: lee primero (y
   firmaría evidencias de otra zona si el orden cambiara) y la comprobación no la ve ningún test de
   integración del `WHERE`.
3. **Cifras de R68 con `SUM` en SQL** (`aggregate` de Prisma o SQL a mano). Descartada: «Debe llegar a
   la central» y «Falta por recibir» no son columnas, son derivaciones de `paraLaCentral` en TS; en SQL
   habría que reescribir la resta (como `idsRecibidosIncompletos`), una segunda fórmula de la misma
   cifra. El conjunto ya se lee entero en `listarConsolidacion`, así que sumar en el servidor sobre él
   no cuesta consultas.
4. **Copiar el montaje del detalle en `ConsolidacionBodegaModule`.** Descartada por D15: mismo flujo,
   dos roles = un componente con props.

## Dependencias de terceros

Ninguna nueva.
