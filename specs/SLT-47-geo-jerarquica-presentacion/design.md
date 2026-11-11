# SLT-47 — geo-jerarquica-presentacion · design.md

> Requisitos: `requirements.md` (R1–R40). El Alcance y la tabla «Decisiones cerradas» no se reabren
> aquí. Las preguntas P1–P6 llevan una propuesta, y este diseño ya la aplica.
>
> Las líneas citadas son de `84230124`.

## Lo que ya existe

Buscado el 2026-11-11 en los tres sitios de `docs/specs.md`. Términos: `FiltroUbicacion`,
`filtro de lugar`, `canton_id`, `provincia_id`, `vista_filtro`, `filtro-canton-distrito`,
`dependsOn`.

- **Board** (`feature_list.json`):
  - **SLT-125** «Geografía jerárquica: presentación, exportes, cierres y geocodificación» es la otra
    mitad de la tarjeta y depende de esta. No toca filtros.
  - **SLT-48** «Geografía jerárquica: retirar modelo viejo» retira `NivelGeografico`,
    `PROFUNDIDAD_DEL_NIVEL` y las columnas viejas.
  - **SLT-101** «Fila de gestión única y lista con filtros» (`done`) es de gestiones, no de lugar.
  - Ninguna otra ficha hace filtros de lugar de N niveles.
- **Specs**:
  - `SLT-65` §3: `lugarDeLaOrden` y `whereLugarEn`. Su alternativa 7 manda aquí los filtros por
    ancestro de `/ordenes` y satélite.
  - `SLT-71` §3: `sqlLugarEn` y `lugares-del-filtro.ts`, que ya bajan las facetas de analítica a
    «nodo o nodos bajo él». Su §8 deja la medición (`scripts/geo-equivalencia/medicion.ts`).
  - `SLT-44` design:243: afinar la geografía de una zona con un descendiente asignado a otra zona.
    **Ya resuelto** por SLT-89 R6 (`GeoRepository.listGeografiaLitePorZona:319–347`). Aquí solo se
    extiende a cualquier profundidad (R36).
  - `SLT-46` P10: ocultar el nivel repetido en un país de 2 niveles. Sale solo, porque las listas
    se declaran por los tipos del país (R2).
  - Ficha 453: `VistaFiltro` y su v1. Ficha 339: el codec de URL. Feature 117: el filtro de
    mis-asignaciones.
- **Código**. El MCP `codebase-memory-mcp` no tiene índice de este worktree (`index_status`: «project
  not found»), así que todo sale de Grep/Read. Se **reutiliza** sin copiar:
  - `lib/services/geografia-dominio.ts`: `nodo`, `ancestros`, `nodosBajo` y `tiposDelPais`.
  - `lib/repositories/_shared/lugar-orden.ts`: `lugarDeLaOrden`, `whereLugarEn` y `sqlLugarEn`.
  - `lib/repositories/_shared/lugares-del-filtro.ts`: se generaliza (§3.1).
  - `components/shared/FilterComponent.tsx`: `dependsOn`/`parentValue` ya hacen el encadenado, la
    poda y la re-siembra tardía (R3, R17, R18). No se reescribe.
  - `lib/utils/filtros-url.ts` y `hooks/useFiltrosUrl.ts`: lectura al entrar y borrado.
  - `lib/types/vista-filtro.ts`: `leerPayloadGuardado` es el sitio previsto para leer una v2.
  - `scripts/geo-equivalencia/medicion.ts`, `comparacion.ts` y `crearClienteDeSoloLectura`.
  - Los fixtures `tests/integration/db/_fixtures/geo-65.ts` y `geo-44.ts`.

Nada de lo encontrado resuelve ya SLT-47: no hay bloqueo.

## 1. Resumen

Una sola pieza pura, `lib/utils/filtro-ubicacion.ts`, el **FiltroUbicacion**, sabe:
- declarar una lista por nivel del país (`FilterDef` con clave `nivel_<k>`, `dependsOn` a la anterior);
- pasar de la selección de la barra al lugar elegido (`lugar_id`);
- traducir la URL al entrar: `lugar_id`, los enlaces viejos por id y los de novedades por nombre;
- traducir una vista v1 a v2.

En el servidor, `lugar_id` se resuelve con el catálogo a «esos nodos y los de debajo» y se filtra con
`whereLugarEn` (Prisma) o `sqlLugarEn` (SQL crudo), como ya hacen SLT-65 y SLT-71.

Las pantallas de mis-asignaciones y novedades filtran en el cliente: sus DTO ganan la ruta de ids del
lugar.

Sin tablas, columnas ni migraciones, salvo el índice condicional de R31.

## 2. Modelo de datos, empresa y país

- **Sin tablas, columnas, RLS ni únicos nuevos.** `vista_filtro` ya tiene `organizacion_id`, RLS y la
  columna `version` (ficha 453). La v2 es un valor nuevo en esa columna, no una migración.
- **Migraciones:** ninguna por defecto. Si §9 marca regresión, un índice en
  `db/migrations/<ts>_<qué>_slt47/` con solo `CREATE INDEX` y su `DROP INDEX` en `down.sql`, sin
  `CONCURRENTLY` (Prisma corre cada migración en una transacción, SLT-43 §2.4). El timestamp se
  comprueba contra `origin/dev` y `node scripts/archivos-en-vuelo.mjs`. Si el plan pidiera un índice
  de expresión que Prisma no declara, se para y se pregunta (SLT-65 §11).
- **Qué depende del país** (`docs/perfil-agentes.md > spec_author`):

| Dato | De dónde sale |
|---|---|
| Número de listas y sus rótulos | Tipos `nivel_<k>` del país de la empresa: `tiposDelPais(catalogo)` en el servidor, y `NivelesGeograficosProvider` en el cliente (§5.4) |
| Opciones de `/ordenes` y analítica | Catálogo del país de la empresa (`deLaEmpresa`, RLS `nodo_geografico_del_pais`) |
| Opciones de satélite | El mismo catálogo, recortado a la zona del actor (§3.3) |
| Opciones de novedades y mis-asignaciones | La ruta del lugar de las órdenes cargadas (§3.4) |
| Ids que filtra el servidor | `nodosBajo` sobre el catálogo del país de la empresa (§3.1) |
| Moneda, impuestos, pagos | No aplica |

  Ningún literal de país ni de nivel en código nuevo. Las claves viejas (`provincia_id`…) solo
  aparecen en la tabla de traducción de §4.2, como entrada de enlaces viejos.

## 3. Servidor

### 3.1 `lib/repositories/_shared/lugares-del-filtro.ts` (se generaliza)

Hoy resuelve tres facetas por nivel con `PROFUNDIDAD_DEL_NIVEL`. Pasa a resolver una sola:

```ts
/** Los ids de `lugar_id` que están en el catálogo, más todos los nodos bajo ellos. Ordenados y sin repetir. */
export function resolverLugar(cat: CatalogoGeografico, ids: readonly string[]): readonly string[];

export type LugaresDelFiltro = { readonly lugar?: readonly string[] };   // ausente = sin filtro
export const SIN_LUGAR: LugaresDelFiltro = {};

/** Una condición: con ids → `sqlLugarEn(ids)`; con `[]` → `FALSE` (R12); ausente → nada. */
export function condicionesDeLugar(lugares: LugaresDelFiltro): Prisma.Sql[];

/** Carga el catálogo SOLO si el filtro trae `lugar_id` (R5 de SLT-71). */
export async function lugaresDelFiltro(
  catalogo: () => Pick<CatalogoGeograficoRepository, "deLaEmpresa">,
  filtro: { lugar_id?: readonly string[] },
): Promise<LugaresDelFiltro>;
```

- `condicionesDeLugar` y `lugaresDelFiltro` conservan su nombre, así que los cinco repositorios de
  analítica (SLT-71 §2, sitios 2–5) **no cambian**: llaman igual y reciben una condición en vez de
  hasta tres.
- `resolverLugar` acepta un nodo de **cualquier** profundidad, porque es el lugar elegido y no una
  faceta con nivel. Ya no usa `PROFUNDIDAD_DEL_NIVEL`. La constante se queda en `lugar-orden.ts`
  para el conteo de SLT-65 §5 hasta SLT-48 (R40).
- **Equivalencia (R27).** Con la cadena coherente, «columna del nivel k = X» y «lugar bajo X» son el
  mismo conjunto (SLT-65 §5, R11). Un enlace viejo con dos niveles coherentes, por ejemplo una
  provincia P y un cantón C bajo P, es hoy `provincia_id ∈ {P} AND canton_id ∈ {C}`, lo mismo que
  «lugar bajo C». La traducción de §4.2 descarta las combinaciones incoherentes igual que la poda de
  hoy (R18).

### 3.2 Entradas (`zod`, R10)

| Schema | Cambio |
|---|---|
| `lib/types/orden.ts > ordenFilterBase` y `ORDEN_FILTER_FIELDS` | Sale `provincia_id`, `canton_id` y `distrito_id`; entra `lugar_id: idList.optional()`. `.strict()` rechaza las viejas |
| `lib/types/recepcion-satelite.ts > FILTROS_COMPARTIDOS` | El `pick` pasa a `lugar_id` |
| `lib/analytics/entregas-conteo.ts > conteoEntregasFiltroSchema` | Igual. `claveConPrefijo` pasa de `p=`, `c=` y `s=` a `l=${idsNormalizados(lugar_id)}` |

Las tres entradas son Server Actions internas. Ninguna ruta de `app/api/` las usa (Grep del
2026-11-11), así que no cambia ningún contrato público.

### 3.3 Las tres lecturas

| Lectura | Hoy | Después |
|---|---|---|
| `OrdenService.construirWhere` → `OrdenRepository.list` (`:2047–2071`) | Tres claves de `FILTER_TO_COLUMN` → `criterioColumna(...)` | `where.lugarIds = lugar_id`. `list` resuelve con `resolverLugar(await this.catalogoGeografico().deLaEmpresa())` y añade `...whereLugarEn(ids)` como clave hermana, o `{ id: { in: [] } }` si queda `[]`. También `listarCompleto` (la descarga), que comparte `construirWhere` |
| `RecepcionSateliteService.filtroDeRepo` → `condicionesSatelite` (`:1680–1713`) | `o."provincia_id" IN`, `o."canton_id" IN` y `o."distrito_id" IN` | `RecepcionSateliteFiltro.lugarIds`. Lo resuelve el método del repositorio antes de armar el SQL, y `condicionesSatelite` emite `condicionesDeLugar(...)`. Llega a la página, al conjunto y a la vigencia sin escribirlo tres veces (R16 de la 184) |
| Analítica (5 lecturas + 4 que comparten el recorte) | Tres facetas | Una faceta, `lugar_id` (§3.1). Sus repositorios no cambian |

- La carga del catálogo usa la instancia del repositorio (`catalogoGeografico()`, una por instancia,
  R35). Solo se carga si hay `lugar_id`: un listado sin filtro de lugar hace las consultas de hoy.
- El catálogo de filtros (`FiltrosOrdenesService` → `GeoRepository`) gana dos campos en
  `CatalogoFiltrosOrdenesDTO` y en `GeografiaFiltrosDTO`:

```ts
export interface NivelDeFiltroDTO { profundidad: number; singular: string; plural: string }
export interface LugarDeFiltroDTO extends OpcionGeografica { padreId: string | null; profundidad: number }
// CatalogoFiltrosOrdenesDTO y GeografiaFiltrosDTO:
niveles: NivelDeFiltroDTO[];   // de tiposDelPais, ordenados por profundidad (clave nivel_<k>)
lugares: LugarDeFiltroDTO[];   // todo el catálogo; en el rol de zona, `conAncestros` a cualquier profundidad
```

  `provincias`, `cantones` y `distritos` se quedan: los lee el modal de corrección, fuera de alcance.
  Los retira SLT-48. Para Costa Rica el JSON crece unos 600 nodos más: se mide en T2.3.
  `listGeografiaLitePorZona` arma `lugares` con el mismo conjunto `conAncestros` que ya calcula
  (SLT-89 R6), sin cortar en profundidad 3 (R36).

### 3.4 Ruta del lugar en mis-asignaciones y novedades (R16)

```ts
// lib/repositories/_shared/ruta-del-lugar.ts (nuevo, puro)
export interface PasoDeRuta { id: string; nombre: string }
/** Del nivel 1 al lugar de la orden: `[...ancestros(cat, lugar).reverse(), nodo(cat, lugar)]`. Lugar ausente → []. */
export function rutaDelLugar(cat: CatalogoGeografico, o: { distritoId: string | null; cantonId: string }): PasoDeRuta[];
```

- `MiAsignacionRow`, `MiAsignacionDTO` y `NovedadDTO` (que la extiende) ganan `lugarRuta: PasoDeRuta[]`.
- `GestionOrdenRepository.findMisAsignaciones` y las dos proyecciones de `toMiAsignacionRow` (`:500`,
  `:536`), más `OrdenRepository.findNovedadesByTienda` (`:5940`), añaden `cantonId` y `distritoId`
  al `select` y calculan la ruta con un catálogo por instancia.
  - **A verificar en T1.1:** qué otras lecturas producen `NovedadDTO`. La ayuda y los rechazos SLA
    pueden tener su propia proyección; se listan antes de tocar código.
- `GestionOrdenRepository` pasa a importar `CatalogoGeograficoRepository`, así que entra solo en la
  guardia m5 (SLT-65 §12, R35).
- No es dato personal: son ids y nombres de lugar que la tarjeta ya pinta. Los campos
  `provinciaNombre`, `cantonNombre` y `distritoNombre` no cambian (presentación, SLT-125).

### 3.5 Autorización (R14, R36)

Sin action, ruta, pantalla, rol ni módulo nuevos. Cada lectura conserva su puerta:
- `/ordenes`: `listar` y el acotamiento por rol escrito al final de `construirWhere`;
- satélite: `ROL_AUTORIZADO` y la zona del actor;
- analítica: `resolverAlcanceConteoEntregas`;
- novedades: `adminTienda` en `page.tsx`;
- mis-asignaciones: el mensajero de la sesión;
- catálogo: `ROLES_CON_CATALOGO`.

El filtro de lugar solo **estrecha**. Un `lugar_id` de otra zona, otro país u otra empresa da cero
filas o no pasa la RLS (R12, R37).

## 4. FiltroUbicacion: `lib/utils/filtro-ubicacion.ts` (nuevo, puro)

Sin React, sin Prisma y sin `next/`. Es la única pieza que conoce las claves `nivel_<k>`, `lugar_id`
y las claves viejas.

### 4.1 Declaración (R1–R6)

```ts
export const PARAM_LUGAR = "lugar_id";
export const claveDeNivel = (k: number) => `nivel_${k}`;

export interface OpcionesDeLugar {
  niveles: readonly NivelDeFiltroDTO[];
  lugares: readonly { id: string; nombre: string; padreId: string | null; profundidad: number }[];
}

/** Una FilterDef `multi` por nivel; `dependsOn` a la anterior; `parentValue` = padreId. */
export function declararNiveles(op: OpcionesDeLugar, opts?: { desde?: number; etiquetaConPadre?: boolean }): FilterDef[];

/** Ids de la lista más profunda con elección (R4, R9). `[]` = sin filtro de lugar. */
export function lugarElegido(sel: FilterSelection): string[];
```

- Rótulo: `nivel.singular`. Búsqueda: `Buscar ${singular.toLowerCase()}…`. En Costa Rica son los de
  hoy, porque SLT-46 copia los nombres de los tipos a `pais.nivel_1..3_*` (R6).
- Sin elección en el nivel k, la lista k+1 ofrece todo su nivel (la «selección efectiva» de
  `FilterComponent`), como hoy (P4).
- `desde: 2` y `etiquetaConPadre: true` dan la forma de mis-asignaciones (R7, P2).
- Las listas se envuelven: `flex-wrap` en el contenedor de la barra (R5). T0 confirma si
  `FilterComponent` ya lo hace.

### 4.2 URL al entrar (R17–R21)

```ts
export interface TraductorDeUrl {
  /** Claves que «Limpiar todo» también borra: `lugar_id` y las viejas de la pantalla (R20). */
  claves: readonly string[];
  /** Vista de los params con las claves `nivel_<k>` ya puestas. Pura; recibe las FilterDef montadas. */
  traducir(params: LectorParams, filtros: readonly FilterDef[]): LectorParams;
}
export function traductorPorId(): TraductorDeUrl;     // /ordenes, satélite y analítica
export function traductorPorNombre(): TraductorDeUrl; // /novedades
```

`traducir` hace, en este orden:
1. Quita cualquier `nivel_<k>` que traiga la URL (R21).
2. **Enlaces viejos por id:** `provincia_id` → `nivel_1`, `canton_id` → `nivel_2` y `distrito_id` →
   `nivel_3`. Es un renombre: los valores, las comas y las repeticiones pasan tal cual, y
   `FilterComponent` los valida y poda como hoy. Por eso salen los mismos controles y elecciones
   (R18). En un país de 2 niveles, `nivel_3` no está declarado y se descarta, como hoy.
3. **Enlaces viejos por nombre** (novedades): cada `provincia` pasa a los `value` de `nivel_1` cuyo
   `label` es igual; cada `canton`, a los de `nivel_2` con ese `label`, y solo entre los hijos de las
   provincias traducidas si hay alguna (R19).
4. **`lugar_id`:** cada id se busca en las opciones de todas las listas. Desde su nivel se sube por
   `parentValue` y se pone cada antepasado en su `nivel_<j>`. Un id no ofrecido se descarta (R17).
   Si se combina con un enlace viejo, gana `lugar_id`.

**Dónde se engancha.** `FilterComponent` y `BuscadorFiltros` ganan una prop opcional,
`traductorUrl?: TraductorDeUrl`:
- `FilterComponent` aplica `traducir(paramsIniciales, montados)` donde hoy lee `paramsIniciales`
  (`:491`, `:549`, `:673` y `:714`). La foto de la URL sigue congelada al entrar (R7 de la 339). La
  re-siembra tardía ya existente cubre el catálogo que llega después.
- `BuscadorFiltros` usa la vista traducida en `activosDesdeUrl` y añade `claves` a `borrarParams` al
  «Limpiar todo».
  - Si el catálogo llega tarde, un `lugar_id` no sabe aún de qué nivel es. Las claves pendientes se
    activan cuando aparecen sus opciones, con el mismo criterio que la re-siembra de
    `FilterComponent` contra la foto congelada. Se prueba en `FiltroUbicacionBarra.test.tsx`.
- Sin la prop, los dos componentes se comportan como hoy.

### 4.3 Vistas guardadas v2 (R22–R25)

En `lib/types/vista-filtro.ts`:
- `VISTA_FILTRO_VERSION = 2` y `VERSIONES_LEGIBLES = [1, 2]`.
- `vistaFiltroPayloadSchema` (`v: z.literal(2)`) es el de guardar.
- Se conserva un `vistaFiltroPayloadV1Schema`, igual al de hoy, solo para leer.
- `leerPayloadGuardado`:
  - con `v: 1` → parsea con el de v1 y llama a `deV1(doc)`;
  - con `v: 2` → como hoy;
  - otra → `null` (R24).
- `deV1` es puro. Renombra `provincia_id` → `nivel_1`, `canton_id` → `nivel_2` y `distrito_id` →
  `nivel_3` en `seleccion` y en `activos`, y deja el resto. La selección de una vista la emitió
  `FilterComponent`, que nunca emite combinaciones incoherentes, así que el renombre es exacto. Al
  aplicarla, `siembra` y la poda hacen lo mismo que hoy (R23).
- No se reescribe ninguna fila: la v1 se traduce en cada lectura, y pasa a v2 cuando la persona la
  actualiza (R34). La columna `version` deja contar cuántas v1 quedan.
- `vista-filtro-aplicabilidad.ts` no cambia: evalúa por las claves de las `FilterDef`, que son las
  `nivel_<k>`.

## 5. Pantallas

Ninguna se implementa antes de la maqueta de T0 (R33).

### 5.1 `/ordenes` y recepción satélite

- `ordenes-filtros-def.ts:357–387`: las tres `FilterDef` pasan a `...declararNiveles(cat)`, en el
  mismo sitio de la barra. `seleccionAFilter` traduce las `nivel_<k>` a `lugar_id` con
  `lugarElegido`.
- Satélite hereda la barra (`construirFiltrosSatelite`), y su `FiltroBodegaSatelite` pasa a
  `lugar_id`.
- `OrdenesListado.tsx` y `SateliteOrdenesListado.tsx` pasan `traductorUrl={traductorPorId()}`.

### 5.2 Analítica

`entregas-filtros-def.ts` usa `declararNiveles`. `entregas-filtro-analitica.ts` emite `lugar_id`, y
`FiltrosEntregas.tsx` pasa el traductor. Las claves `CLAVE_PROVINCIA`, `CLAVE_CANTON` y
`CLAVE_DISTRITO` se retiran. Sus consumidores (por ejemplo `productos-swr.ts`) se listan en T4.2.

### 5.3 Novedades (R8, R19)

- `novedades-filtros.ts`: `provincia` y `canton` salen de `ClaveFiltroNovedad`. Las listas
  `nivel_<k>` se declaran con `declararNiveles` sobre las opciones que da la `lugarRuta` del
  conjunto.
- El predicado es «algún `lugarRuta[i].id` está entre los elegidos del nivel más profundo con
  elección». Con `conjunto === null`, se declaran deshabilitadas, como hoy.
- `NovedadesFiltrosBarra.tsx` pasa `traductorPorNombre()`.

### 5.4 Mis-asignaciones (R7)

- `FiltroCantonDistrito.tsx` y `useFiltroCantonDistrito.ts` pasan a `FiltroUbicacion.tsx` y
  `useFiltroUbicacion.ts`: N listas desde el nivel 2.
- La lógica pura de `lib/utils/filtro-canton-distrito.ts` pasa a filtrar por id sobre `lugarRuta` y
  se renombra `filtro-ubicacion-asignaciones.ts`.
- Sigue 100 % en cliente, sin URL y sin vistas.

**Niveles en el cliente.** Novedades y mis-asignaciones no reciben el catálogo de filtros. Sus
rótulos salen del layout:
- `PaisService.nivelesDeEmpresa(organizacionId)` lee `tipo_nivel_geografico` del país de la empresa,
  en la misma `Promise.all` de `app/(app)/layout.tsx:94`;
- `EtiquetasGeograficasProvider` gana `niveles`, con un hook `useNivelesGeograficos()`. Sin
  proveedor, devuelve `[]` y no lanza, como `useEtiquetasGeograficas`.

## 6. Contratos que cambian

| Contrato | Antes | Después |
|---|---|---|
| `filter` de `listarOrdenes`/`listarOrdenesCompleto` | `provincia_id?`, `canton_id?`, `distrito_id?` | `lugar_id?: string[]` (no vacía) |
| Input de `listarOrdenesBodega*` (página, conjunto y vigencia) | `provincia_id?`, `canton_id?`, `distrito_id?` | `lugar_id?: string[]` (no vacía) |
| Filtro de analítica (`FiltroConteoEntregas`) y su clave de caché | `p=`, `c=`, `s=` | `l=` |
| `ListOrdenesWhere`, `RecepcionSateliteFiltro` | `provinciaId`… / `provinciaIds`… | `lugarIds` |
| `CatalogoFiltrosOrdenesDTO`, `GeografiaFiltrosDTO` | 3 listas | + `niveles`, `lugares` |
| `MiAsignacionDTO`, `NovedadDTO` | nombres | + `lugarRuta` |
| `VistaFiltroPayload` | v1 | v2, y v1 legible |
| `FilterComponent`, `BuscadorFiltros` | — | + `traductorUrl?` (opcional) |

## 7. Scripts de evidencia (R28–R30)

Los dos los corre una persona, no un agente fuera de la base local:
- `scripts/geo-equivalencia-filtros.ts` (`pnpm geo:equivalencia-filtros`). «Hoy» es una copia
  congelada del `where` por columna, en `scripts/geo-equivalencia/filtros-de-hoy.ts`. «Nuevo» llama a
  `OrdenRepository.list`, a la lectura de satélite y a `contarPorStatus` con `lugar_id`.
- `scripts/geo-explain-filtros.ts` (`pnpm geo:explain-filtros`). Reusa `medirLectura`, `mediana`,
  `variacion` y `hayRegresion` de `scripts/geo-equivalencia/medicion.ts`.

Los dos usan `crearClienteDeSoloLectura` (R30).

Los scripts de SLT-71 (`geo-equivalencia-analitica.ts`, `geo-explain-analitica.ts` y
`analitica-de-hoy.ts`) leen hoy `provincia_id`… del tipo `FiltroConteoEntregas`:
- su lado «hoy» pasa a un tipo local congelado;
- su lado «nuevo», a `lugar_id`.

Si no compilan de otro modo, se ajustan solo en esas líneas (T2.4).

## 8. Rendimiento con 10 niveles (R32)

`tests/unit/utils/filtro-ubicacion-rendimiento.test.ts` construye un catálogo sintético en memoria,
de 10 niveles y unos 20.000 nodos (P3), y mide la mediana de 5 corridas de:
- `resolverLugar(cat, [raíz])`;
- `declararNiveles(op)`;
- `traducir(?lugar_id=<hoja de nivel 10>)`.

El umbral es el de P3. También comprueba que `sqlLugarEn` lleva un solo parámetro lista con todos
los ids.

**Riesgo:** en un país de 10 niveles, una lista honda sin elección arriba ofrece todo su nivel (P4).
La maqueta decide si se deshabilita.

## 9. `EXPLAIN` (R29, R31)

- **Antes:** el listado filtra por la columna de su nivel, con índice propio.
- **Después:** filtra por el `OR` de `whereLugarEn`. Para una provincia son unos 100 ids sobre
  `distrito_id` más los cantones con `distrito_id IS NULL`, y el plan puede elegir `BitmapOr` o un
  Seq Scan.

SLT-71 midió el mismo `OR` en analítica con la provincia de más órdenes. Aquí se mide en el listado y
en satélite.

Si hay regresión, las mitigaciones van en este orden, y se mide otra vez después de cada una:
1. Un índice que `db/schema.prisma` pueda declarar con `@@index`, para que `migrate diff` siga
   saliendo vacío, en una migración aditiva (R31).
2. Si el plan pide un índice parcial o de expresión, que Prisma no declara, se para y se pregunta.

## 10. Alternativas descartadas

1. **Mantener las tres claves (`provincia_id`, `canton_id`, `distrito_id`) y añadir `nivel_4_id`…**
   Daría compatibilidad gratis con los enlaces viejos y las vistas v1, pero:
   - contradice la decisión «un solo parámetro»;
   - deja la correspondencia entre nivel y columna escrita en cada pantalla;
   - con 10 niveles serían 10 claves de transporte que el servidor tendría que combinar.
2. **Un control nuevo de `FilterComponent` (`kind: "lugar"`) que pinte las N listas dentro.**
   - Cambiaría cómo se ve en Costa Rica: hoy son tres filtros que se añaden por separado desde el
     selector.
   - Rompería `activos` de las vistas v1.
   - Obligaría a reescribir la poda y la re-siembra, que ya funcionan con `dependsOn`.
3. **Ruta del lugar desde las FK viejas** (`[provinciaId, cantonId, distritoId]`) en vez del
   catálogo.
   - Ahorra cargar el catálogo en mis-asignaciones.
   - Pero no llega a N niveles: SLT-48 tendría que rehacerla, y escribiría la regla del lugar por
     segunda vez.
   - Con `lugarDeLaOrden` y el catálogo, SLT-48 cambia un solo sitio.
4. **Reescribir las vistas v1 en la base con un script.** Es una escritura de datos de negocio sobre
   filas de personas, que exigiría el modal antes → después y una persona sobre producción. Traducir
   al leer da lo mismo sin escribir (R34), y la columna `version` sigue diciendo cuántas quedan.
5. **Que el servidor siga aceptando las claves viejas junto a `lugar_id`.** Obliga a definir qué pasa
   cuando llegan las dos y deja dos caminos al mismo `where`. Son Server Actions internas: una
   pestaña abierta durante el despliegue recibe `validation_error` una vez y se recarga.

## 11. Riesgos

- **Plan del `OR` en el listado** (§9). Bloquea el merge si hay regresión.
- **Catálogo que llega tarde** en satélite y analítica: un `lugar_id` no sabe su nivel hasta que
  llegan las opciones (§4.2).
- **Una carga más del catálogo** en mis-asignaciones, que se usa en el teléfono: cinco consultas por
  índice por petición. Se anota la latencia en T5.1.
- **Payload del catálogo de filtros:** `lugares` duplica los nodos de 1 a 3 hasta SLT-48.
- **Tamaño del PR** (P6).

## 12. Pruebas y trazabilidad

Fixture nuevo `tests/integration/db/_fixtures/geo-47.ts`, sobre `geo-65.ts`:
- empresas de CR y de `XA` (4 niveles);
- dos distritos «San Rafael» en cantones distintos y dos cantones «Central»;
- una zona satélite con un descendiente asignado a otra zona;
- órdenes con y sin distrito.

| R | Test |
|---|---|
| R1, R2, R4, R6, R17, R21 | `tests/unit/utils/filtro-ubicacion.test.ts` |
| R3, R5, R18, R20 | `tests/components/FiltroUbicacionBarra.test.tsx` (sobre `BuscadorFiltros` + `FilterComponent` con el traductor) |
| R7, R13 | `tests/components/mis-asignaciones/FiltroUbicacion.test.tsx` |
| R8, R13, R19 | `tests/unit/novedades/novedades-filtros-lugar.test.ts` |
| R9 | `filtro-ubicacion.test.ts`; `tests/unit/ordenes/seleccion-a-filter-lugar.test.ts` |
| R10 | `tests/unit/types/filtro-lugar-schemas.test.ts` |
| R11, R12 | `tests/unit/repositories/lugares-del-filtro.test.ts`; `tests/integration/db/geo-filtros-lugar.test.ts` |
| R13, R14, R15, R27, R36, R37 | `geo-filtros-lugar.test.ts`; guardias `geografia-sin-cte-recursiva` y `geografia-lecturas-sin-nodo-fk` ampliadas |
| R16 | `tests/unit/services/ruta-del-lugar.test.ts`; `geo-filtros-lugar.test.ts` |
| R22, R23, R24 | `tests/unit/types/vista-filtro-v2.test.ts` |
| R25, R35 | Guardias existentes sin cambios |
| R26, R33 | Anotaciones en `progress/impl_SLT-47.md` |
| R28, R30 | `tests/integration/db/geo-equivalencia-filtros.test.ts` |
| R29 | `tests/integration/db/geo-explain-filtros.test.ts` |
| R31, R34, R40 | Diff revisado por el reviewer; `slt47-migraciones-aditivas.test.ts` solo si hay índice |
| R32 | `tests/unit/utils/filtro-ubicacion-rendimiento.test.ts` |
| R38 | Gate completo de CI |
| R18, R23, R39 | `e2e/geo-filtro-lugar.spec.ts` |

### 12.1 Tests existentes que cambian de entrada, no de salida

Es la regla de SLT-71 R24. Pueden cambiar solo las líneas que nombran la clave de transporte o el
SQL de la faceta. Candidatos, a confirmar en T1.1:
- `orden-repository.listado-filtros-257.test.ts`;
- los tests de `ordenes-filtros-def`, `seleccion-a-filter`, `satelite-ordenes-filtros`,
  `entregas-filtros-def` y `entregas-filtro-analitica`;
- los de `filtro-canton-distrito` y `novedades-filtros`;
- los de las facetas de analítica (`condicionesDeLugar`).

El reviewer comprueba en el diff que no cambia ninguna salida esperada.
