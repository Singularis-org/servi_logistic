# SLT-65 — geo-jerarquica-consultas · design.md

> Requisitos: `requirements.md` (R1–R28). El Alcance, «Lo que NO entra» y la tabla «Decisiones
> cerradas» no se reabren aquí. Las cuatro preguntas abiertas tienen su propuesta en §10 (1), §2.2
> (2), §5 (3) y §7 (4).
>
> Las líneas citadas son de `b2bade4`.

## Lo que ya existe

Buscado el 2026-10-31 en los tres sitios de `docs/specs.md`, con los términos `nodo_geografico`,
`zonaQueCubre`, `esZonaEspecial`, `contarSinEntregar`, `reconcili`, `EXPLAIN`,
`geo-equivalencia` y `ubicacion_snapshot`:

- **Board** (`feature_list.json`):
  - **SLT-71** es la otra mitad de esta tarjeta (decisión «¿Un PR o se parte?»): tránsito,
    analítica, ciclo de vida y gestión de orden.
  - **SLT-47** se lleva los filtros por ubicación de órdenes, novedades y recepción satélite, los
    nombres de la presentación y la escritura de `ubicacion_snapshot` en los cierres nuevos (R28).
  - **SLT-46** se lleva las escrituras en el nodo. Depende de SLT-65 (decisión de SLT-44).
  - Ninguna ficha migra las lecturas de este alcance ni deja un script de rendimiento.
- **Specs**:
  - `specs/SLT-44-geo-jerarquica-dominio`: §7 es la frontera que esta tarjeta recoge, §6.2 el
    script de dinero y §10 la regla de los dobles.
  - `specs/SLT-43-geo-jerarquica-modelo`: columnas `nodo_geografico_id` con FK `NOT VALID`,
    índices `20261031120500` y `ubicacion_snapshot` (§2.6, que queda para SLT-47).
  - `specs/366-zona-orden-desactualizada` y `377` (reconciliación al guardar zona),
    `SL-38-zona-especial-por-empresa` (marca por empresa, punto único), `374-catalogo-geografico-admin`
    (conteo sin entregar), `450` (lecturas en serie en la transacción del cierre) y
    `69` (snapshot de `cierre_detail`).
- **Código** (Grep/Read). El MCP `codebase-memory-mcp` responde, pero ningún proyecto de
  `list_projects` tiene `root_path` en `.worktrees/SLT-65-geo-jerarquica-consultas`.
  Se **reutiliza**, sin copiar:
  - `lib/services/geografia-dominio.ts`: `nodo`, `ancestros`, `nodosBajo`, `zonaQueCubre` y
    `esZonaEspecial`.
  - `lib/repositories/CatalogoGeograficoRepository.ts`: `deLaEmpresa()` y `dePais()`. Ya acepta
    el cliente de una transacción abierta (`enUnaFoto`) y lee en serie.
  - `lib/repositories/_shared/zona-colapso.ts`, a través de `zonaQueCubre`.
  - `scripts/geo-equivalencia-dinero.ts`: `crearClienteDeSoloLectura`, `leerArgumentos` y la
    comparación por id, que se extrae a un módulo compartido (§8).
  - `lib/db/consultas-en-serie.ts`, como molde del envoltorio del adaptador que captura las
    consultas (§10).
  - `tests/integration/db/_fixtures/geo-44.ts` y la técnica `conAsignacionEnCanton` de
    `geo-equivalencia-dinero.test.ts`, que inyecta una asignación en un cantón cambiando la entrada.

No aparece nada que ya resuelva SLT-65: no hay bloqueo.

## 1. Resumen

Las lecturas de órdenes, cierres y zonas del alcance dejan de leer la marca y los nombres por las
relaciones de `distrito`. También dejan de filtrar «lo que cuelga de un nodo» por columna. En su
lugar usan el catálogo y las asignaciones de SLT-44. El lugar de la orden sigue saliendo de sus FK
viejas.

Las firmas de las interfaces y los DTO no cambian. Las escrituras siguen donde están.

Dos scripts que corre una persona sobre la copia de producción dan la evidencia del merge:
- uno de equivalencia: cierres, cobro, corrección, listados, reconciliación y conteo;
- uno de rendimiento: `EXPLAIN ANALYZE` antes y después.

Una guardia nueva cierra el m5 de SLT-44.

## 2. Inventario (R1–R16, R28)

Ninguna lectura del alcance es `$queryRaw`. Todas son `select`/`include` de Prisma que el motor
convierte en consultas aparte sobre `distrito`, `canton`, `provincia` o `distrito_zona_especial`.
El SQL a mano con geografía (`Prisma.sql`) está en filtros de SLT-47 y en tránsito y ciclo de vida,
que son de SLT-71.

### 2.1 Lo que entra

| # | Archivo:línea | Qué hace hoy | Después | R |
|---|---|---|---|---|
| 1 | `OrdenRepository.ts:356` (`apiOrdenSelect`) → `toApiOrdenRow:675` | Marca de la orden por `distrito.zonasEspeciales` (`take: 1`), para el costeo de la API. La usan `listByOwner` (`:3443`) y `findDetalleByOrdenIdForOwner` (`:3498`) | Se quita la relación `distrito`. La marca se calcula con `marcasDeOrdenes` (§3) sobre `distritoId`/`cantonId` | R1–R4 |
| 2 | `OrdenRepository.ts:1115` (`WITH_ESTATUS_Y_TIENDA`, el `distrito`) → `toListItemDTO:1284` | Marca, más id y nombre del distrito, para los costos del listado. La usan `list` (`:2099`), `findListItemsByIds` (`:2193`) y recepción satélite (`:4119`, `:4270`), con un mismo mapeo | El `distrito` conserva `id` y `nombre` (presentación, SLT-47) y pierde `...SELECT_MARCA_ZONA_ESPECIAL`. La marca sale de `marcasDeOrdenes` | R1–R4 |
| 3 | `OrdenRepository.ts:2758–2783` (`findBaseCobroDevolucion`) | Marca por `distrito.zonasEspeciales` para el cobro del rechazo (`RechazoTiendaService:241`) | Pide `distritoId`/`cantonId`. Marca de `marcasDeOrdenes` | R1–R3 |
| 4 | `OrdenRepository.ts:2786–2837` (`findParaCorreccion`) | `distrito.nombre` y marca, para `CorregirDatosClienteService:203` | `distritoNombre` = `nodo(cat, distritoId)?.nombre ?? null`. Marca de `marcasDeOrdenes`. Una sola carga del catálogo para las dos | R1–R3 |
| 5 | `OrdenRepository.ts:2896–2910` (`contarSinEntregarPorNodoGeografico`) ← `GeografiaService.ts:214` | `count` por `provincia_id`, `canton_id` o `distrito_id` según el nivel | `count` por lugar ∈ {nodo} ∪ `nodosBajo` (§5) | R9–R12 |
| 6 | `CierreDiaRepository.ts:319–368` (`leerDescriptivosDeOrdenes`; `provincia`/`canton`/`distrito.findMany` en `:342–354`) → `crearCierre:1328–1370` | Lee las tres tablas por los ids de las órdenes del cierre, de una en una, y congela nombres y marca | Los nombres y la marca salen del catálogo, cargado en la transacción (§4). `zona` y `usuario` siguen igual | R5–R7, R17 |
| 7 | `ZonaRepository.ts:461–531` (reconciliación en `update`) y `whereBaseElegible:187–200` | Colapso de `zona_distrito` por distrito y `orden.distrito_id IN (...)` | Zona = `zonaQueCubre` del lugar. Las órdenes se eligen por lugar ∈ nodos afectados y nodos bajo ellos (§6) | R13–R17 |
| 8 | `lib/db/extension-empresa.ts` | Ninguna lectura geográfica. Trata la geografía como modelo de plataforma, y su cabecera (`:25–31`) cita `distrito.zonas` | Sin cambios de código (§7) | R17, R18 |

### 2.2 Lo que no entra, y a dónde va

| Archivo:línea | Qué es | Va a |
|---|---|---|
| `OrdenRepository.ts:1110–1111`, `:1115` (`id`, `nombre`) y `toRelaciones:1257–1259` | Nombres de provincia, cantón y distrito en el listado de `/ordenes` | SLT-47 (pregunta abierta 2) |
| `OrdenRepository.ts:2024–2027` (`list`) y `:1654–1686` (`condicionesSatelite`) | Filtros por provincia, cantón y distrito | SLT-47 |
| `OrdenRepository.ts:1383–1385` (`WITH_ETIQUETA`) y `:5738–5740` (`findNovedadesByTienda`) | Nombres para la etiqueta y las novedades | SLT-47 |
| `CierresAdminRepository.ts:225–227`, `:475–477` y `:859–861` | Nombres **congelados** de `cierre_detail`. No leen geografía viva | Nadie: no cambia (R8) |
| `ZonaRepository.ts:730` (`countExistingDistritos`) | Valida los distritos antes de escribir `zona_distrito` | SLT-46, con las escrituras (R16) |
| `ZonaRepository.ts:276`, `:291` (`_count.distritos`) | Cuenta filas de `zona_distrito`. No es geografía | Nadie: no cambia |
| `InformeTransitoRepository`, `CicloVidaRepository`, `Conteo*Repository` y `lib/analytics/entregas-conteo.ts` | Tránsito, ciclo de vida y analítica | SLT-71 |
| `cierre_detail.ubicacion_snapshot` | Escritura del snapshot en cierres nuevos | SLT-47 |

**Sobre «cierres-admin».** La tarjeta lo nombra, pero no tiene ninguna lectura que una con la
geografía: sus pantallas, sus descargas y sus totales leen lo congelado en `cierre_detail`. Lo que
congela ese detalle es la fila 6. La tarjeta pide que sus totales no se muevan: lo cubren R8 (sus
suites sin tocar) y el bloque de cierres del script (§9).

## 3. La marca y el lugar de una orden (R1–R4, R19)

Módulo nuevo `lib/repositories/_shared/lugar-orden.ts`. Es el único sitio que escribe la regla del
lugar:

```ts
/** Decisión «Lugar de una orden»: COALESCE(distrito_id, canton_id). */
export function lugarDeLaOrden(o: { distritoId: string | null; cantonId: string }): string;

/** `lugar ∈ ids` en Prisma, sin COALESCE: lo pueden servir los índices de las dos columnas. */
export function whereLugarEn(ids: readonly string[]): Prisma.OrdenWhereInput;
//  → { OR: [ { distritoId: { in: ids } }, { distritoId: null, cantonId: { in: ids } } ] }
```

`whereLugarEn` va siempre como una clave hermana del resto del `where` (AND), nunca dentro de otro
`OR`.

En `OrdenRepository`, un helper privado calcula la marca de varias órdenes:

```ts
private async marcasDeOrdenes(
  filas: readonly { distritoId: string | null; cantonId: string }[],
): Promise<(boolean)[]>   // vacío → [] sin cargar el catálogo
```

- Usa `this.catalogoGeografico().deLaEmpresa()`, el mismo de SLT-44, una carga por instancia (R11
  de SLT-44). Calcula `esZonaEspecial(cat, asig, lugarDeLaOrden(f))`.
- En plataforma o sin empresa, `deLaEmpresa()` lanza `EmpresaNoResuelta` (R4).
  - **A verificar en T1.1:** ningún llamador de las lecturas 1–4 corre en `comoPlataforma`. Grep
    del 2026-10-31: solo `rastreo-publico.ts` (con su propio repositorio) y
    `geografia-plataforma.ts` (que solo llama al conteo, fila 5) usan plataforma con órdenes.
- **R2 por construcción.** Con marcas solo en distritos, `esZonaEspecial` de un distrito es su marca.
  El de un cantón, que es el lugar de una orden sin distrito, es «sin marca», que es el `false` de
  hoy.
- `toApiOrdenRow` y `toListItemDTO` pasan a recibir la marca como argumento. Los DTO no cambian (R3).
- El `select` de las filas 1–4 gana `distritoId` y `cantonId` donde no los tuviera.
- `SELECT_MARCA_ZONA_ESPECIAL` y `esZonaEspecialDeLaEmpresa` se quedan en
  `_shared/zona-especial.ts`. Ya no los usa `lib/`, pero los usa la copia literal (§8), y la guardia
  `zona-especial-punto-unico` sigue igual. Los retira SLT-48.

### 3.1 Coste

Hoy, la marca es una consulta anidada más por lectura (`distrito_zona_especial` por los distritos
de la página). Después:
- esa consulta desaparece;
- entra la carga del catálogo: `zona_distrito`, `organizacion`, tipos, nodos y marcas, en una
  transacción.

En el listado y en la API es una petición caliente. Lo mide §10, y si hay regresión se aplica §11.

## 4. Cierres (R5–R7, R17)

`leerDescriptivosDeOrdenes(filas, tx)` conserva su nombre, su firma y el orden en serie (ficha 450),
porque `emisor-relaciones-anidadas.test.ts` la importa:

1. `zonas` y `tiendas`: como hoy.
2. `const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(tx).deLaEmpresa()`.
   Sobre el cliente de la transacción, `enUnaFoto` no abre otra: lee en la del cierre, en serie y con
   la empresa ya fijada por la extensión (R7, R17).
3. Los mapas `provincias`, `cantones` y `distritos` se arman **solo con los ids de las filas**, como
   hoy, desde `nodo(catalogo, id)`. Un id ausente no entra en el mapa, y `descriptivoDe` lanza como
   hoy: la transacción se revierte (R6).
4. `distritos[id].zonaEspecial = esZonaEspecial(cat, asig, id)`. `cantones[id]` gana
   `zonaEspecial` con la misma regla.
5. En `crearCierre`, `esZonaEspecial` del detalle pasa a ser la marca del lugar:
   - con distrito, `distritos[distritoId].zonaEspecial`;
   - sin distrito, `cantones[cantonId].zonaEspecial`.

   Con marcas solo en distritos, el segundo es `false`, como hoy.

- `DescriptivosTxClient` gana `nodoGeografico`, `tipoNivelGeografico`, `zonaDistrito`,
  `organizacion` y `distritoZonaEspecial` (el tipo de cliente de `CatalogoPrismaClient`), y pierde
  `provincia`, `canton` y `distrito`.
- Coste: unas cinco consultas por índice, una vez por cierre, en lugar de tres. No es una lectura
  caliente en cantidad, pero entra en §10 porque corre en el cron del corte.
- `ubicacion_snapshot` sigue en NULL (SLT-47; SLT-43 §2.6).

## 5. Conteo de órdenes sin entregar (R9–R12)

`contarSinEntregarPorNodoGeografico(nivel, id)` conserva la firma. `GeografiaService` no cambia.

1. `nodoGeografico.findUnique({ where: { id }, select: { paisId: true, profundidad: true } })`. Es un
   modelo de plataforma y corre tal cual en `comoPlataforma`. `null` → 0 (R10).
2. Si `profundidad` no es la del `nivel` (`provincia` 1, `canton` 2, `distrito` 3) → 0. Hoy, un id de
   cantón pedido como distrito no casa con `distrito_id` y da 0 (R10).
3. `cat = this.catalogoGeografico().dePais(paisId)` (R12): en plataforma no hay empresa, y
   `deLaEmpresa` lanzaría. `ids = [id, ...nodosBajo(cat, id).map((n) => n.id)]` (R9, R20).
4. `orden.count({ where: { ...whereLugarEn(ids), deletedAt: null, estatus: { value: { notIn:
   [...ESTADOS_TERMINALES] } } } })`. `ESTADOS_TERMINALES` se sigue importando de su fuente: lo
   vigila `geografia-terminales-una-sola-fuente`.

- **Equivalencia (R11).** Con la cadena coherente, «`provincia_id = P`» y «lugar bajo P» son el mismo
  conjunto:
  - una orden con distrito D bajo P cuenta por D;
  - una sin distrito, con un cantón C bajo P, cuenta por C.

  La de hoy contaba en `canton` las órdenes con y sin distrito, y en `distrito` solo las que tienen.
  Lo nuevo da lo mismo.
- **Cadena incoherente** (pregunta abierta 3). Ningún trigger de hoy la impide: solo
  `orden_geografia_del_pais_de_la_empresa` comprueba el país. El script la mide aparte (§9). La
  propuesta es que no bloquee si es la única causa de diferencia en el conteo, porque no mueve
  dinero.
- **Plan.** El `OR` de `whereLugarEn` puede resolverse con un `BitmapOr` sobre los índices de
  `distrito_id` y `canton_id`. Con una provincia (más de 100 ids) podría elegir un Seq Scan sobre
  `orden`: §10 lo mide y §11 lo corrige.

## 6. `ZonaRepository.update`: la zona de las órdenes (R13–R17)

### 6.1 Qué cambia

La reconciliación de `:461–531` se extrae a una función de lectura, exportada desde
`ZonaRepository.ts`:

```ts
export interface PlanDeReconciliacion {
  /** Por zona destino: las órdenes que se mueven (id, guía, remisión). */
  porZona: Map<string, { id: string; numGuia: number | null; numRemision: string | null }[]>;
  retenidasEnBodegaSatelite: number;
}
export async function planificarReconciliacion(
  tx: TxDeReconciliacion,
  nodosAfectados: readonly string[],
): Promise<PlanDeReconciliacion>;
```

1. `const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(tx).deLaEmpresa()`.
   Corre después del `deleteMany` y el `createMany` de `zona_distrito`, en la misma transacción, así
   que ve lo que el guardado acaba de escribir (R17).
2. `lugares = nodosAfectados ∪ nodosBajo(cat, n)` para cada `n` (R13). Hoy `nodosAfectados` es la
   unión de los distritos de antes y de después, la misma de `:453–455`.
3. Por cada lugar, `zonaQueCubre(cat, asig, lugar)?.id`. Si es `null` (0 o más de 1 zona) se salta,
   como el colapso de hoy. Los lugares se agrupan por zona resuelta.
4. Por zona: `whereBaseElegible(lugares, zonaId)`. Sustituye `distritoId: { in }` por
   `...whereLugarEn(lugares)`. Los otros cuatro cortes no cambian (R14). Luego vienen el `count` de
   retenidas y el `findMany` de elegibles: las mismas dos consultas de hoy (`:524–531`).

`update` llama a `planificarReconciliacion` y aplica el plan con el mismo `updateMany` (solo
`zonaId`), el mismo `appendAccion` por orden, un solo `loteId` y la misma respuesta (R14).

### 6.2 Qué no cambia

- La escritura de `zona_distrito` por `distrito_id`, la de tarifas y pagos, la marca de zona
  central y su historial (R16).
- `countExistingDistritos` (SLT-46).
- La regla «en el estante no se mueve» y su conteo en SQL (ficha 377).
- **R15 por construcción.** Con asignaciones solo en distritos:
  - `nodosBajo` de un distrito está vacío, así que los lugares son los mismos distritos de hoy;
  - `zonaQueCubre` de un distrito es su colapso de hoy;
  - una orden sin distrito tiene un cantón como lugar, y un cantón no está nunca entre los lugares,
    así que no se mueve.

### 6.3 Por qué se extrae el plan

El script de equivalencia (§9) lo necesita para comparar «qué movería un guardado» sin escribir: la
conexión es de solo lectura. La copia de hoy (§8) es el mismo bloque de `:461–531` con sus
consultas, sin las escrituras.

`TxDeReconciliacion` es el `Pick` del cliente de la transacción: `orden`, más los modelos de
`CatalogoPrismaClient`. `ZonaPrismaClient` gana esos modelos. Las composiciones no cambian.

## 7. Contexto de empresa y `extension-empresa` (R4, R17, R18)

- No se toca `lib/db/extension-empresa.ts` ni `lib/db/modelos-de-negocio.ts`. El único archivo de
  `lib/db/` que podría cambiar es `excepciones-aislamiento.ts`, y solo si T5.1 lo exige. La geografía vieja,
  `nodo_geografico` y `tipo_nivel_geografico` siguen en `MODELOS_DE_PLATAFORMA`. En una transacción
  de empresa corren «tal cual (RLS)» (tabla §6.1 de la extensión), con la política por país de
  SLT-43. Por eso el catálogo que se carga dentro del cierre o del guardado es el del país de la
  empresa (R17).
- La cabecera cita `distrito.zonas` como ejemplo del agujero que cerró la envoltura. Sigue siendo
  cierto mientras exista la relación (SLT-48), así que no se edita.
- Pregunta abierta 4: confirmar que no se esperaba otro cambio en ese archivo.

## 8. La lectura de hoy, congelada: `scripts/geo-equivalencia/consultas-de-hoy.ts`

Copia **literal**, desde `b2bade4` y **antes** de tocar los repositorios (T1.2). No se edita
después. Es «el antes» del test de CI, del script de equivalencia y del de rendimiento:

| Función de la copia | Copia de |
|---|---|
| `leerDescriptivosDeOrdenes(filas, tx)` y `congeladoDeHoy(fila, descriptivos)` | `CierreDiaRepository.ts:319–368` y las expresiones de nombres y marca de `:1339–1370` |
| `findBaseCobroDevolucion(cliente, ordenId)` | `OrdenRepository.ts:2755–2783` |
| `findParaCorreccion(cliente, ordenId)` | `OrdenRepository.ts:2785–2837` |
| `API_ORDEN_SELECT(ownerId)` y `paginaApiDeHoy(cliente, params)` | `apiOrdenSelect` (`:315–418`) y el `findMany` de `listByOwner` (`:3437–3446`) |
| `WITH_ESTATUS_Y_TIENDA` y `paginaListadoDeHoy(cliente, params)` | `:1097–1132` y el `findMany` de `list` (`:2094–2100`) con el `where` y el `orderBy` de la primera página sin filtros |
| `marcasDeHoy(cliente, ordenIds)` | La proyección `distrito: { select: { ...SELECT_MARCA_ZONA_ESPECIAL } }` con `esZonaEspecialDeLaEmpresa` |
| `whereBaseElegible` y `planDeHoy(tx, distritosAfectados)` | `ZonaRepository.ts:187–200` y `:461–531` sin las escrituras |
| `contarSinEntregarDeHoy(cliente, nivel, id)` | `OrdenRepository.ts:2896–2910` |

- Vive en `scripts/` por lo mismo que `lecturas-de-hoy.ts`: nombra `zonasEspeciales` y las tablas
  viejas, que las guardias de `lib/` vigilan.
- Se borra con SLT-48.

**Comparación compartida.** `compararPorId`, `Cifras` y `Diferencia` (con `bloque: string`) salen de
`geo-equivalencia-dinero.ts` a `scripts/geo-equivalencia/comparacion.ts`. El script de SLT-44 los
importa de allí. Su comportamiento y su test (`geo-equivalencia-dinero.test.ts`) no cambian.

## 9. Script de equivalencia: `scripts/geo-equivalencia-consultas.ts` (R22–R24)

`pnpm geo:equivalencia-consultas [--muestra 200] [--empresa <id>]`

Es un script hermano del de SLT-44, no una ampliación: así el de SLT-44 queda tal cual y cada uno se
puede pegar por separado en su PR. Reutiliza `crearClienteDeSoloLectura`
(`default_transaction_read_only = on`, R24), `leerArgumentos` y `paraCadaEmpresa`.

Por empresa, dentro de `conEmpresa`:

| Bloque | Qué compara (hoy = copia §8; nuevo = repositorio) |
|---|---|
| `cierres` | Dos conjuntos de órdenes: (a) las de las gestiones vigentes sin cierre y (b) las de los `--muestra` detalles más recientes de `cierre_detail`. Por orden, el `congelado` de hoy frente al nuevo: los tres nombres (solo «distinto», sin valor) y la marca. Por empresa, la suma de `derivarIngresoOrden` sobre (b), con la tarifa, el resultado y las entradas congeladas de cada detalle, y la marca de hoy frente a la nueva. Imprime los dos totales si difieren |
| `cobro-devolucion` | Muestra: las `--muestra` órdenes vivas más recientes, más todas las vivas cuyo distrito tiene marca. `findBaseCobroDevolucion` de hoy frente al nuevo, fila entera |
| `correccion` | La misma muestra. `findParaCorreccion`: se comparan todos los campos, y de los personales solo se imprime «distinto» |
| `listados` | La misma muestra, agrupada por tienda. La marca de `marcasDeHoy` frente a `costeo.esZonaEspecial` de `listByOwner` y frente al `esZonaEspecial` de `findListItemsByIds` |
| `reconciliacion` | Por cada zona de la empresa, un guardado sin cambios: `nodosAfectados` son sus distritos actuales. `planDeHoy` frente a `planificarReconciliacion`: por zona destino, el conjunto de órdenes, y el número de retenidas |

Una vez por país, en `comoPlataforma`:

| Bloque | Qué compara |
|---|---|
| `conteo-sin-entregar` | Por cada provincia, cantón y distrito del país con al menos una orden, `contarSinEntregarDeHoy` frente al nuevo |
| `cadena-incoherente` | Informativo: las órdenes vivas cuyo distrito no cuelga de su cantón o cuyo cantón no cuelga de su provincia. Se imprime el número y los ids de orden. Lo lee `SELECT` sobre `orden` con las FK viejas |

- La salida tiene el formato del script de SLT-44: cifras por bloque y una línea por diferencia,
  con ids e importes y sin datos personales (R24).
- Códigos de salida: 0 si todo coincide, 1 si algo difiere y 2 si una empresa o un país falló al
  leer.
- Exporta `compararEmpresaConsultas(cliente, organizacionId, opciones)` y
  `compararConteosDelPais(cliente, paisId)`. El `main` solo parsea argumentos.
- **A verificar en T5.1:**
  - que `comoPlataforma` en `scripts/` pase la guardia `plataforma-solo-en-lista`. Si exige
    añadirlo a `EXCEPCIONES_DE_PLATAFORMA`, se añade con motivo y se avisa al reviewer;
  - que `RechazoTiendaService` solo consume la fila de `findBaseCobroDevolucion` y la tarifa, de modo
    que la igualdad de la fila basta para el cobro. Si consume algo más de la orden, ese algo entra
    en el bloque.

**Quién y cuándo** (decisión heredada). Una persona lo corre sobre la **copia** de producción con
las migraciones de SLT-43 aplicadas, antes del merge, y pega la salida en el PR. Ningún agente lo
corre fuera de la base de tests local.

## 10. Script de rendimiento: `scripts/geo-explain-consultas.ts` (R25, R24) — pregunta abierta 1

`pnpm geo:explain-consultas [--empresa <id>]`. Sin `--empresa`, toma la empresa con más órdenes
vivas.

1. Mismo cliente de solo lectura. Las consultas se **capturan** con un envoltorio del adaptador:
   `scripts/geo-equivalencia/captura-consultas.ts`, con el molde de `conConsultasEnSeriePorTransaccion`.
   Guarda el SQL y los parámetros de cada consulta que emite Prisma.
   - **A verificar en T6.1:** que el adaptador de Prisma 7 exponga SQL y parámetros en ese punto. Si
     no, se usa el evento `query` del cliente.
2. Para cada lectura de la tabla, se ejecuta una vez «antes» (copia §8) y una vez «después»
   (repositorio), y se capturan sus consultas. `BEGIN`, `COMMIT` y `set_config` no cuentan.
3. Cada consulta capturada se repite como `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, dentro de
   `conEmpresa` y en una transacción con la empresa fijada, para que la RLS sea la de producción. Se
   hacen 5 corridas. En cada corrida se suma el `Execution Time` de todas las consultas de la
   lectura, y se toma la mediana de las 5.
4. Seq Scan nuevo: un nodo `"Node Type": "Seq Scan"` con `"Relation Name": "orden"` en algún plan de
   «después» que no aparece en ningún plan de «antes».
5. Imprime, por lectura: el número de consultas, las dos medianas, el porcentaje, los Seq Scan sobre
   `orden` y el tiempo de pared medio del método (informativo). No imprime el SQL ni los parámetros:
   solo etiquetas y números (R24).
6. Código de salida: 0 sin regresión, 1 con regresión y 2 si falla la lectura.

| Lectura | Antes / después | Bloquea por 20 % | Bloquea por Seq Scan |
|---|---|---|---|
| `listado-ordenes` | `paginaListadoDeHoy` / `list()`: primera página de 50, orden por defecto, sin filtros | Sí | Sí |
| `listado-api` | `paginaApiDeHoy` / `listByOwner`: primera página de la tienda con más órdenes | Sí | Sí |
| `cierre-descriptivos` | `leerDescriptivosDeOrdenes` de hoy / nuevo, sobre las filas del cierre más grande de los últimos 30 días | Sí | Sí |
| `conteo-sin-entregar` | Para la provincia con más órdenes, en plataforma | No | Sí |
| `reconciliacion` | `planDeHoy` / `planificarReconciliacion` de la zona con más distritos | No | Sí |

**Propuesta para la pregunta abierta 1.** La decisión mide «una consulta caliente», y aquí una
lectura cambia de forma: pierde una consulta anidada y gana las del catálogo. Por eso el umbral se
aplica a la suma por lectura, y la suma incluye las consultas nuevas del catálogo.

- El tiempo de pared incluye las idas y vueltas de la transacción del catálogo y depende de la red
  de quien lo corre: se informa, pero no bloquea.
- El 20 % se aplica a las lecturas calientes que nombra la tarjeta (listado y cierres).
- El Seq Scan se mira en todas, porque las dos que no son calientes son las que estrenan el `OR` de
  `whereLugarEn`.

Lo corre una persona sobre la copia de producción. Ningún agente lo corre fuera de la base de tests
local.

## 11. Índices y migraciones (R26)

**Por defecto, ninguna migración.** Los índices que usan las consultas nuevas ya existen: `orden`
tiene uno en `provincia_id`, uno en `canton_id` y uno en `distrito_id` (ficha 374). La carga del
catálogo usa los de SLT-43 y SL-17.

Si §10 marca regresión, las mitigaciones van en este orden y se miden otra vez:
1. **Listado de `/ordenes`:** sacar del catálogo ya cargado los tres nombres (pregunta abierta 2).
   Quita tres consultas sin migración, pero necesita el sí del humano, porque roza SLT-47.
2. **Un índice**, en una migración que solo contenga `CREATE INDEX` y su `DROP INDEX` en `down.sql`.
   - Nombre: `db/migrations/20261101120000_<qué>_slt65/`. SLT-43 ocupa `20261031120000`–`120500`.
   - Antes de crearla, se comprueba que el timestamp no existe en `origin/dev` ni en las ramas en
     vuelo (`node scripts/archivos-en-vuelo.mjs`).
   - Sin `CONCURRENTLY`, porque Prisma corre cada migración en una transacción (SLT-43 §2.4). Se
     anota el tiempo de bloqueo medido sobre la copia.
   - `db/schema.prisma` gana el `@@index` equivalente, para que `migrate diff` salga vacío.
   - `tests/unit/db/slt43-migraciones-aditivas.test.ts` se amplía a la carpeta nueva.
   - Si el plan pide un índice de expresión (`COALESCE(distrito_id, canton_id)`) que Prisma no
     declara, se para y se pregunta.

## 12. Guardia m5: `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` (R21)

1. **Clases vigiladas, calculadas y no escritas a mano.** Son `CatalogoGeograficoRepository` más
   cada clase exportada de un archivo de `lib/repositories/**` que importa
   `CatalogoGeograficoRepository`. Hoy y tras esta feature: `GeoRepository`, `OrdenRepository`,
   `CoberturaRepository` y `ZonaRepository`. `CierreDiaRepository` no lo importa en la clase, sino en
   la función `leerDescriptivosDeOrdenes`, pero entra igual porque su archivo lo importa.
   - Antivacío: la lista contiene al menos esas cinco más `CatalogoGeograficoRepository`.
2. **Recorrido.** Todo `.ts`/`.tsx` de `lib/` y `app/`, con `ts.createSourceFile` (como
   `sin-estados-retirados.guardia`). Cuenta una `NewExpression` de una clase vigilada si no tiene
   por encima ninguna función (`FunctionDeclaration`, `FunctionExpression`, `ArrowFunction`,
   `MethodDeclaration`, `Constructor` ni accesor) ni ninguna propiedad de clase **no** estática (su
   inicializador corre por instancia). Eso caza:
   - `const x = new OrdenRepository(prisma)` a nivel de módulo;
   - `new Servicio(new GeoRepository(prisma))` a nivel de módulo;
   - `static repo = new ZonaRepository(prisma)`.
3. **Contraprueba** con textos: los tres casos de arriba se detectan. No se detectan
   `const crear = () => new OrdenRepository(prisma)`, una `function` que la crea, un método que la
   crea ni una propiedad de instancia `private repo = new OrdenRepository(this.prisma)`.
4. El mensaje nombra archivo, línea y clase, y explica el porqué: una instancia de módulo sirve el
   catálogo de una petición a la siguiente.

## 13. Datos, país y autorización

- **Sin tablas, columnas, RLS ni únicos nuevos.** Salvo §11.2, sin migraciones.
  - `zona_distrito` y `distrito_zona_especial` siguen siendo de negocio, con `organizacion_id` que
    ponen la extensión y la RLS.
  - `nodo_geografico` y `tipo_nivel_geografico` siguen siendo de plataforma, con RLS por país.
- **Qué depende del país** (`docs/perfil-agentes.md > spec_author`):

| Dato | De dónde sale |
|---|---|
| Catálogo para marca, nombres y reconciliación | `organizacion.pais_id` de la empresa del contexto (`deLaEmpresa`), y RLS `nodo_geografico_del_pais` |
| Catálogo para el conteo del superadmin | `nodo_geografico.pais_id` del nodo pedido (`dePais`) |
| Zonas y marcas | La empresa del contexto (extensión y RLS) |
| Moneda e impuestos | No aplica: los importes los siguen calculando `derivarIngresoOrden` y `costosListadoOrden` |

  Ningún literal de país, de nivel ni de moneda en código nuevo. La única correspondencia entre
  nivel y profundidad es la de §5, paso 2, que ya existe como `NivelGeografico` de tres valores (SL-20) y
  se retira con SLT-47 y SLT-48.
- **Autorización.** Sin action, ruta, pantalla ni módulo nuevos. Cada lectura corre en el contexto
  y con la puerta de rol que ya tiene:
  - la sesión para `/ordenes`, la corrección y las zonas;
  - la API key para la API;
  - `conEmpresa` para el corte diario;
  - `comoPlataforma` y `GESTION_ROLES` para el conteo.

## 14. Pruebas y trazabilidad

Unit e integración contra Postgres real (`HAY_BASE_DE_DATOS`). Sin E2E nuevo (decisión «¿E2E
nuevo?»).

Fixture nuevo `tests/integration/db/_fixtures/geo-65.ts`, sobre `geo-44.ts`:
- dos empresas: CR y `XA`;
- órdenes con y sin distrito, en distritos con y sin marca;
- gestiones vigentes sin cierre y un cierre creado;
- una zona con distritos y órdenes desalineadas, una en el estante de una satélite y una ya en un
  cierre;
- una orden con cadena incoherente, insertada como dueño, solo para la contraprueba de R11.

La herencia (marca o zona en un cantón) no se puede escribir en la base: las FK son a `distrito`. Se
prueba **cambiando la entrada**, con la técnica `conAsignacionEnCanton` de SLT-44: un cliente que
añade una fila con el id de un cantón al resultado de `zonaDistrito.findMany` o
`distritoZonaEspecial.findMany`.

| R | Test |
|---|---|
| R1, R2, R3 | `tests/integration/db/geo-consultas-ordenes.test.ts`: `listByOwner`, `findDetalleByOrdenIdForOwner`, `list`, `findListItemsByIds`, `findBaseCobroDevolucion` y `findParaCorreccion` frente a la copia (§8). Misma marca, mismos campos y mismos importes del costeo. Herencia: una marca inyectada en un cantón da marca a la orden de su distrito y a la orden sin distrito de ese cantón, y no a la de otro cantón. `tests/unit/repositories/lugar-orden.test.ts`: `lugarDeLaOrden` y la forma de `whereLugarEn`. Las suites existentes `costo-y-zona-api-415.test.ts`, `ordenes-api-key-listado.route.test.ts`, `ordenes-api-key-orden-consulta.route.test.ts`, `corregir-datos-cliente.repo.test.ts`, `zona-especial-dos-empresas.test.ts` y `rechazo-tienda-service.test.ts` sin cambiar aserciones |
| R4 | `geo-consultas-ordenes.test.ts`: `listByOwner` y `findBaseCobroDevolucion` en `comoPlataforma` y sin contexto → `EmpresaNoResuelta` |
| R5, R6 | `tests/integration/db/geo-consultas-cierre.test.ts`: crear un cierre del fixture → los nombres y la marca de cada `cierre_detail` iguales a `congeladoDeHoy`. Con una marca inyectada en el cantón, la orden sin distrito congela `true`. Una orden con un cantón ausente del catálogo (catálogo inyectado sin ese nodo) → el cierre no se crea y no queda ninguna fila. `cierre-detail-congelado.test.ts` sin cambiar aserciones |
| R7 | `emisor-relaciones-anidadas.test.ts` (existente, importa la función real): 1 consulta en vuelo y ningún solape, sin cambiar aserciones. `consultas-concurrentes-en-transaccion.guardia.test.ts` sin cambios |
| R8 | Suites existentes de cierres-admin, cierre del día y wallet sin cambiar aserciones: `cierre-iva-aparte-sl39.test.ts`, `cierre-desglose-por-tienda-sql-real.test.ts`, `detalle-movimiento-cierre-postgres.test.ts` y `cierres-admin-service.test.ts`. Guardia de diff: `git diff origin/dev...HEAD -- lib/repositories/CierresAdminRepository.ts` vacío, anotado en `progress/impl_SLT-65.md` |
| R9, R10, R11 | `tests/integration/db/geo-consultas-conteo.test.ts`: para cada provincia, cantón y distrito del fixture, el nuevo = `contarSinEntregarDeHoy`. Nodo inexistente → 0; id de cantón con nivel `distrito` → 0. Con la orden incoherente del fixture, la diferencia aparece y es solo esa orden (contraprueba). `geografia-ordenes-sin-entregar.test.ts` existente sin cambiar aserciones. `tests/unit/guards/geografia-terminales-una-sola-fuente.guardia.test.ts` sin cambios |
| R12 | `geo-consultas-conteo.test.ts` en `comoPlataforma`: un nodo de `XA` cuenta con el catálogo de `XA` y suma órdenes de dos empresas. `geografia-superadmin-sin-empresa.test.ts` existente sin cambiar aserciones |
| R13, R14, R15 | `tests/integration/db/geo-consultas-zona.test.ts`: `planificarReconciliacion` = `planDeHoy` en el fixture (mismas órdenes, zonas y retenidas). `update` mueve las mismas, deja la del estante y la del cierre, y escribe una fila de historial por orden con un solo lote. Herencia: una asignación inyectada en un cantón mueve la orden sin distrito de ese cantón y la de un distrito suyo sin asignación propia, pero no la de un distrito con asignación propia (gana la más específica). `zona-reconciliacion-ordenes.test.ts`, `zona-central-guarda-y-rastro.test.ts` y `zona-pago-mensajero-rastro.test.ts` existentes sin cambiar aserciones |
| R16 | `zona-repository.test.ts` (unit) y `zonas-action.test.ts`: mismas escrituras. En el unit cambian los dobles de entrada (§14.1), no las salidas |
| R17 | `geo-consultas-cierre.test.ts` y `geo-consultas-zona.test.ts`: la empresa `XA` crea un cierre y guarda una zona, y el catálogo cargado dentro tiene solo nodos de `XA`. En el guardado, el plan ve la asignación recién escrita |
| R18 | `geo-nodo-rls.test.ts` y `geografia-dos-paises.test.ts` existentes sin cambiar aserciones, y `git diff --name-only origin/dev...HEAD -- lib/db/` vacío (salvo `excepciones-aislamiento.ts` si T5.1 lo exige), anotado en `progress/impl_SLT-65.md` |
| R19 | `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` ampliada a todo `OrdenRepository.ts`, `CierreDiaRepository.ts`, `ZonaRepository.ts` y `_shared/lugar-orden.ts`, con contraprueba. `geo-lecturas-sin-backfill.test.ts` ampliado: con `nodo_geografico_id` en NULL en `orden`, `zona_distrito` y `distrito_zona_especial`, las lecturas 1–7 dan lo mismo |
| R20 | `geografia-sin-cte-recursiva.guardia.test.ts` existente (barre `lib/` y `scripts/`) sin cambios |
| R21 | `tests/unit/guards/catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` (§12), con contraprueba |
| R22 | `tests/integration/db/geo-equivalencia-consultas.test.ts`: `compararEmpresaConsultas` y `compararConteosDelPais` sobre el fixture → 0 diferencias en todos los bloques, salvo la orden incoherente, que sale solo en `cadena-incoherente`. Contraprueba: con una marca inyectada en un cantón en el cliente nuevo → diferencias > 0 en `cierres`, `cobro-devolucion`, `listados` y en el total del ingreso, con sus ids |
| R23 | `geo-equivalencia-consultas.test.ts`: salida 0 si coincide y 1 si difiere; respeta `--muestra`; imprime las cifras por bloque y la línea de cadena incoherente |
| R24 | `geo-equivalencia-consultas.test.ts` y `tests/integration/db/geo-explain-consultas.test.ts`: con el cliente de los scripts, un `INSERT` falla con `25006`; `orden`, `zona_distrito`, `distrito_zona_especial` y `cierre_detail` quedan iguales; la salida no contiene ningún `destinatario`, `direccion` ni `telefono_dest` del fixture, ni SQL |
| R25 | `geo-explain-consultas.test.ts`, en la base local: las cinco lecturas se miden y salen 5 corridas por lado. La función `hayRegresion` (exportada) da `true` con +21 % o con un Seq Scan sobre `orden` solo en «después», y `false` con +19 % o con el Seq Scan en los dos lados. Código de salida 1 si hay regresión |
| R26 | Comprobación del diff: `git diff --name-only origin/dev...HEAD -- db/` vacío, anotado en `progress/impl_SLT-65.md`. Si §11.2 aplica, `slt43-migraciones-aditivas.test.ts` ampliado a la carpeta (solo `CREATE INDEX`; `down.sql` presente) |
| R27 | Gate completo de CI: las suites citadas arriba sin cambiar aserciones, y los E2E de dinero y reparto (`cierre-dia`, `cierres-admin*`, `wallet*`, `mis-asignaciones`) |
| R28 | Comprobación del diff: los bloques de §2.2 (`list` `:2024–2027`, `condicionesSatelite`, `WITH_ETIQUETA`, `findNovedadesByTienda`, `toRelaciones`) sin cambios, revisado por el reviewer. `InformeTransitoRepository.ts`, `CicloVidaRepository.ts`, `Conteo*Repository.ts` y `lib/analytics/` fuera del diff |

### 14.1 Dobles que cambian de entrada, no de salida

Es la regla de SLT-44 §10. Los tests unitarios que simulan Prisma pueden necesitar los delegados
del catálogo (`zonaDistrito`, `organizacion`, `tipoNivelGeografico`, `nodoGeografico` y
`distritoZonaEspecial`), o dejar de simular `distrito.zonasEspeciales`. Candidatos, a confirmar en
T2:
- `tests/unit/repositories/zona-repository.test.ts`;
- `cierre-dia-repository.test.ts`;
- `orden-repository.api-lectura.test.ts`;
- `orden-repository.listado-filtros-257.test.ts`;
- `orden-repository.no-regresion-106.test.ts`.

Se reescribe **el doble**: devuelve nodos, asignaciones y marcas equivalentes a lo que simulaba.
**Las salidas esperadas no cambian**, y el reviewer lo comprueba con el diff. Ningún otro test
existente se toca (R27).

Lo mismo vale para una suite de integración que llame a `leerDescriptivosDeOrdenes` fuera del
contexto de una empresa. Se le da contexto (`conEmpresa`), que es entrada, y no se toca la aserción.

## 15. Alternativas descartadas

1. **Leer la marca con SQL sobre las tres columnas de la orden:**
   `EXISTS (marca WHERE distrito_id IN (o.distrito_id, o.canton_id, o.provincia_id))`.
   - Ahorra la carga del catálogo, pero la herencia queda fijada a tres niveles con nombre.
   - Escribe la regla de R7 de SLT-44 por segunda vez, en SQL.
   - Y no sirve cuando SLT-46 permita que una orden apunte a un nodo de profundidad 4.
2. **Leer el lugar de `orden.nodo_geografico_id`**, que ya tiene índice (SLT-43). Lo prohíbe la
   decisión «Lugar de una orden»: el deploy dependería del backfill.
3. **Un índice de expresión `COALESCE(distrito_id, canton_id)` desde el principio.**
   - Prisma no lo declara en `schema.prisma`, así que `migrate diff` dejaría de salir vacío.
   - Exige escribir el conteo y la reconciliación con `$queryRaw`.
   - El `OR` de `whereLugarEn` puede usar los índices que ya hay. Se mide primero (§10), y solo si
     hace falta se pregunta (§11).
4. **Pasar el catálogo como parámetro a `crearCierre` y a `ZonaRepository.update`**, cargándolo el
   servicio fuera de la transacción. Rompe R17: el catálogo no vería la asignación que el guardado
   acaba de escribir, y en el cierre sería una foto distinta de la de la transacción.
5. **Ampliar el script de SLT-44 con los bloques nuevos** en vez de un script hermano. Mezcla la
   evidencia de dos PR y obliga a tocar su test. El script hermano comparte lo común por
   `comparacion.ts` sin duplicarlo.
6. **Guardia m5 con una lista de clases escrita a mano.** Se queda vieja con el siguiente
   repositorio que use el catálogo. Calcularla por la importación la mantiene sola.
7. **Mover también los filtros por ancestro de `/ordenes` y recepción satélite** a `whereLugarEn`.
   Son filtros, y van a SLT-47 con el `FiltroUbicacion` de N niveles. Hacerlo aquí cambiaría dos
   veces la misma consulta.

## 16. Riesgos

- **Latencia del listado y de la API.** Cada petición paga una carga del catálogo, que son cinco
  consultas en una transacción `RepeatableRead`, donde antes había una consulta anidada. El
  `Execution Time` puede no subir y el tiempo de pared sí. Ver pregunta abierta 1 y §11.
- **Plan del `OR` en el conteo y en la reconciliación.** Con más de 100 ids, Postgres puede elegir
  un Seq Scan sobre `orden`. Lo mide §10, y bloquea el merge.
- **Llamadores en plataforma.** Si alguno de las lecturas 1–4 corre en `comoPlataforma`, pasaría a
  fallar (R4). Se verifica en T1.1, antes de tocar código.
- **Cadena incoherente en producción.** Es de origen desconocido y cambia el conteo del superadmin.
  Pregunta abierta 3.
- **Dobles de Prisma.** Hay cinco suites unitarias candidatas a cambiar de entrada (§14.1). Es el
  punto donde un cambio de aserción podría colarse, y el reviewer lo mira en el diff.
- **`comoPlataforma` en el script.** Puede pedir una excepción en `EXCEPCIONES_DE_PLATAFORMA` (T5.1).
