# SLT-71 — geo-jerarquica-transito-analitica · design.md

> Requisitos: `requirements.md` (R1–R25). El Alcance, «Lo que NO entra» y la tabla «Decisiones
> cerradas» no se reabren aquí. Las tres preguntas del spec las cerró el humano el 2026-11-04
> (tabla de decisiones): las lecturas que comparten el recorte entran (§3.4, §9.2); tránsito falla y
> deja log con un nodo ausente (§4); SLT-64 mergea primero y la copia de «antes» sale de `dev` con
> SLT-64 dentro (§7, §13).
>
> Las líneas citadas son de `fe16f5d1`, la base montada sobre SLT-65.

## Lo que ya existe

Buscado el 2026-11-04 en los tres sitios de `docs/specs.md`. Términos: `InformeTransito`,
`CicloVida`, `ConteoPorStatus`, `condicionesDeConsulta`, `condicionesSinFecha`, `provincia_id`,
`nodo_geografico`, `ciclo de vida`, `tránsito`.

- **Board** (`feature_list.json`):
  - **SLT-65** es la otra mitad de la tarjeta (decisión de SLT-65 «¿Un PR o se parte?»). Deja
    tránsito, analítica y ciclo de vida para SLT-71 (su design §2.2) y no toca esos archivos (su R28).
  - **SLT-47** se lleva la barra de filtros de analítica (`FiltroUbicacion`), la presentación del PDF
    de tránsito y `GestionOrdenRepository` (R25).
  - **SLT-64** «Ciclo de vida dice 0 cerradas» (`in_progress`, otra persona) toca la semántica del
    ciclo de vida, no su filtro por lugar. No es la misma feature, pero es probable que comparta
    `CicloVidaRepository.ts`. Choque aceptado: SLT-64 mergea primero y SLT-71 lo integra en F2.3
    (decisión «¿Choque de archivos con SLT-64?»).
  - Ninguna otra ficha migra estas lecturas al nodo.
- **Specs**:
  - `specs/SLT-65-geo-jerarquica-consultas`: el molde de este spec. Copia congelada, scripts de
    equivalencia y de `EXPLAIN`, guardias.
  - `specs/SLT-44-geo-jerarquica-dominio`: el dominio en memoria (R13: sin CTE).
  - `specs/475-informe-transito-whatsapp`: el contrato del informe (R22: fallos que se propagan; R40:
    3 consultas fijas).
  - `specs/345-analitica-productos`, `347-dinero-por-producto` y `411-analitica-cohorte-de-carga`:
    por qué cuatro lecturas más importan el `where` de las del alcance (entran: decisión «¿Lecturas que comparten el recorte?»).
- **Código**. El MCP `codebase-memory-mcp` no se consultó: el índice de este worktree no está
  garantizado (lo mantiene el leader). Todo lo de abajo sale de Grep/Read. Se **reutiliza** sin
  copiar:
  - `lib/services/geografia-dominio.ts`: `nodo` y `nodosBajo`.
  - `lib/repositories/CatalogoGeograficoRepository.ts`: `deLaEmpresa()`. Una carga por instancia, y
    `EmpresaNoResuelta` en plataforma.
  - `lib/repositories/_shared/lugar-orden.ts` (SLT-65): la regla del lugar. Gana su versión en SQL
    (§3).
  - `PROFUNDIDAD_DEL_NIVEL` (`OrdenRepository.ts:892`, SLT-65): se **mueve** a `lugar-orden.ts` para
    que la correspondencia entre nivel y profundidad siga escrita una sola vez (SLT-65 §13).
  - `scripts/geo-equivalencia-dinero.ts` (`crearClienteDeSoloLectura`) y
    `scripts/geo-equivalencia/comparacion.ts` (`compararPorId`, `Cifras`, `Diferencia`).
  - `scripts/geo-equivalencia/captura-consultas.ts` y la medición de `scripts/geo-explain-consultas.ts`
    (`mediana`, `variacion`, `hayRegresion` y `medirLectura`), que se extrae a un módulo compartido
    (§8).
  - `lib/db/para-cada-empresa.ts` (`paraCadaEmpresa`).
  - `tests/integration/db/_fixtures/geo-65.ts` y `geo-44.ts`, y la técnica de SLT-44/65 de inyectar
    filas cambiando la entrada del cliente.

No aparece nada que ya resuelva SLT-71: no hay bloqueo.

## 1. Resumen

Las cinco lecturas de analítica y las cuatro que comparten su recorte dejan de filtrar por las
columnas `provincia_id`, `canton_id` y `distrito_id`. En su lugar filtran por el lugar de la orden:
`= ANY($ids)` con los ids que calcula el dominio. Si no hay faceta geográfica, no cambia nada: ni
siquiera se carga el catálogo.

El informe de tránsito deja de unir con `canton` y `distrito`: los nombres los pone el catálogo.

Las interfaces, los DTO, la entrada y la clave de caché no cambian.

Dos scripts que corre una persona dan la evidencia del merge:
- uno de equivalencia;
- uno de `EXPLAIN ANALYZE`.

Los dos reutilizan los de SLT-65.

## 2. Inventario del SQL crudo (R1–R12)

En los archivos del alcance hay **5 sitios** de SQL crudo que filtran o nombran por geografía. Los
cinco son `Prisma.sql` dentro de un `$queryRaw`:

| # | Archivo:función (líneas) | Qué hace hoy | Lo usan | Después | R |
|---|---|---|---|---|---|
| 1 | `InformeTransitoRepository.ts:filasEnAlerta` (`:103`, `:107–108`) | `JOIN "canton" k` y `LEFT JOIN "distrito" d` para `k.nombre` y `d.nombre` | `seleccionarTransito` (generar y vista previa) | Devuelve `canton_id` y `distrito_id`. Los nombres salen del catálogo (§4) | R8–R12 |
| 2 | `ConteoPorStatusRepository.ts:condicionesDeConsulta` (`:136–138`) | `o."provincia_id" IN (...)`, `o."canton_id" IN (...)` y `o."distrito_id" IN (...)` | `contarPorStatus`, y a través de él `ConteoEntregasRepository.contar`. También `ConteoProductosRepository` y `DineroProductosRepository` | Las tres facetas → `condicionesDeLugar(lugares)` (§3) | R1–R7 |
| 3 | `ConteoCargadasPorDiaRepository.ts:condicionesSinFecha` (`:151–153`) | Igual que 2 | `condicionesDeCargadas` → `contarCargadasPorDia`. También `CohorteCargaRepository` y `ConteoHoyGestionRepository` | Igual que 2 | R1–R7 |
| 4 | `ConteoDevolucionesRepository.ts:condicionesDeDevoluciones` (`:92–94`) | Igual que 2, sobre la orden unida a la gestión | `contarDevolucionesPorCausa` | Igual que 2 | R1–R6 |
| 5 | `CicloVidaRepository.ts:condicionesDeCiclo` (`:96–98`) | Igual que 2 | `acumularCiclos` | Igual que 2 | R1–R6 |

**El conteo de entregas no tiene SQL propio.** `ConteoEntregasRepository.contar` delega en
`contarPorStatus` y pliega sus buckets (ficha 441). Queda migrado con el sitio 2 y su archivo no
cambia.

**Lo que no es un sitio.**
- `InformeTransitoRepository.ts:candidatas` (`:58`) proyecta `canton_id` y `distrito_id` de `orden`.
  Son FK de la orden, no una unión con la geografía, y se quedan.
- `lib/analytics/entregas-conteo.ts`: el esquema del filtro y la clave de caché nombran las facetas,
  pero no tienen SQL. No cambian (R6).

**Fuera de alcance, con su dueño.**

| Archivo:función | Qué es | Va a |
|---|---|---|
| `OrdenRepository.ts:condicionesSatelite` (`:1690`, `:1703`, `:1709`) | Filtro por lugar de recepción satélite, en SQL crudo | SLT-47 (SLT-65 §2.2) |
| `GestionOrdenRepository` | Nombres de lugar en el detalle de gestión | SLT-47 |
| `lib/whatsapp-envios/informes/transito/pdf.ts:cantonDistrito` | Cómo se pintan los nombres en el PDF | SLT-47 |

## 3. El filtro por lugar (R1–R7)

### 3.1 La regla del lugar en SQL: `lib/repositories/_shared/lugar-orden.ts`

Gana dos exportaciones, junto a `lugarDeLaOrden` y `whereLugarEn`:

```ts
/** Movido de OrdenRepository (SLT-65 §5): la única correspondencia entre nivel y profundidad. */
export const PROFUNDIDAD_DEL_NIVEL: Record<NivelGeografico, number> = { provincia: 1, canton: 2, distrito: 3 };

/** `lugar(o) = ANY($ids)` en SQL crudo, sobre el alias `o` de `orden`. Mismo OR que `whereLugarEn`. */
export function sqlLugarEn(ids: readonly string[]): Prisma.Sql;
//  → (o."distrito_id" = ANY(${ids}::text[]) OR (o."distrito_id" IS NULL AND o."canton_id" = ANY(${ids}::text[])))
```

- Sin `COALESCE`, por lo mismo que `whereLugarEn`: el `OR` puede usar los índices de `distrito_id` y
  `canton_id` (`schema.prisma:1057–1058`).
- `ids` es **un solo parámetro**, un array. Aparece dos veces en el texto, así que viaja dos veces.
- El alias `o` es fijo: es el alias de `orden` en los cinco sitios, y el que ya usa
  `condicionDeAlcance`.
- `OrdenRepository` importa `PROFUNDIDAD_DEL_NIVEL` de aquí en vez de declararla. Es el único cambio
  en ese archivo.

### 3.2 Facetas resueltas: `lib/repositories/_shared/lugares-del-filtro.ts` (nuevo)

```ts
/** Por faceta pedida, los ids de su lugar: los válidos de su nivel más los nodos bajo ellos. */
export interface LugaresDelFiltro {
  readonly provincia?: readonly string[];
  readonly canton?: readonly string[];
  readonly distrito?: readonly string[];
}
export const SIN_FACETAS_GEOGRAFICAS: LugaresDelFiltro = {};

/** Puro. Recibe el catálogo ya cargado. */
export function resolverLugaresDelFiltro(cat: CatalogoGeografico, filtro: FacetasGeograficas): LugaresDelFiltro;

/** Puro. Una condición por faceta pedida, en el orden provincia, cantón, distrito. */
export function condicionesDeLugar(lugares: LugaresDelFiltro): Prisma.Sql[];

/** Carga el catálogo SOLO si el filtro trae una faceta geográfica (R5). */
export async function lugaresDelFiltro(
  catalogo: () => Pick<CatalogoGeograficoRepository, "deLaEmpresa">,
  filtro: FacetasGeograficas,
): Promise<LugaresDelFiltro>;
```

`FacetasGeograficas` es `Pick<FiltroConteoEntregas, "provincia_id" | "canton_id" | "distrito_id">`.
Se importa como tipo de `lib/analytics/entregas-conteo.ts`, que no cambia.

**`resolverLugaresDelFiltro`**, por cada faceta presente:
1. Se queda con los ids que están en el catálogo (`nodo(cat, id)`) **y** cuya profundidad es
   `PROFUNDIDAD_DEL_NIVEL` de la faceta (R3).
2. A cada válido le suma `nodosBajo(cat, id)`. Une los resultados sin duplicados y los ordena por id,
   para que el parámetro sea estable.
3. Si no queda ninguno, la faceta queda como `[]`. Nunca se omite (R3).

**`condicionesDeLugar`**:
- una faceta con ids → `sqlLugarEn(ids)`;
- una faceta con `[]` → `Prisma.sql\`FALSE\``. Hoy, un `IN ('x')` con un id que no casa da cero
  filas; `FALSE` da lo mismo sin mandar un array vacío;
- una faceta ausente → nada.

**Por qué R4 se cumple por construcción** (cadena coherente, catálogo de 3 niveles):
- Provincia P: la condición «lugar ∈ {P} ∪ cantones de P ∪ distritos de P» cuenta:
  - la orden con distrito D bajo P, por D;
  - la orden sin distrito, con un cantón C bajo P, por C.

  Es el mismo conjunto que `provincia_id = P`.
- Cantón C: «lugar ∈ {C} ∪ distritos de C». Es el mismo conjunto que `canton_id = C`, con y sin
  distrito.
- Distrito D: «lugar ∈ {D}». Es `distrito_id = D`, porque una orden sin distrito tiene un cantón como
  lugar, y un cantón no es nunca D.
- Un id de otro nivel: hoy no casa con la columna del nivel y da cero. Después, R3 lo descarta y
  también da cero.
- Un id de otro país: no está en el catálogo de la empresa, así que da cero. Hoy también da cero,
  porque el trigger `orden_geografia_del_pais_de_la_empresa` impide esa orden.

### 3.3 Los constructores de condiciones (sitios 2–5)

Los cuatro ganan un segundo parámetro, y su cuerpo cambia solo en la lista de facetas:

```ts
export function condicionesDeConsulta(consulta: RecorteDeOrdenes, lugares: LugaresDelFiltro): Prisma.Sql[];
export function condicionesSinFecha(consulta: ConsultaConteoEntregas, lugares: LugaresDelFiltro): Prisma.Sql[];
export function condicionesDeCargadas(consulta: ConsultaConteoEntregas, lugares: LugaresDelFiltro): Prisma.Sql[];
export function condicionesDeDevoluciones(consulta: ConsultaConteoEntregas, lugares: LugaresDelFiltro): Prisma.Sql[];
export function condicionesDeCiclo(consulta: ConsultaConteoEntregas, lugares: LugaresDelFiltro): Prisma.Sql[];
```

- Se quitan las tres entradas geográficas de `facetas`. En su sitio, entre `zona_id` y `tienda_id`,
  van `...condicionesDeLugar(lugares)`. El orden del `where` es el de hoy, con el alcance primero
  (R2).
- `lugares` es **obligatorio**: un llamador que lo olvide no compila. Así no puede quedar ninguna
  lectura que filtre por columna en silencio (R7).
- Siguen siendo **puras y síncronas**. La carga asíncrona vive en el repositorio.

### 3.4 Los repositorios

Cada repositorio de los sitios 2–5, y los cuatro que comparten el recorte (`ConteoProductosRepository`,
`DineroProductosRepository`, `CohorteCargaRepository` y `ConteoHoyGestionRepository`), hace
lo mismo:

```ts
type XPrismaClient = Pick<PrismaClient, "$queryRaw"> & CatalogoPrismaClient;

private catalogoRepo: CatalogoGeograficoRepository | null = null;     // por instancia (R13, R16)
private catalogoGeografico() { return (this.catalogoRepo ??= new CatalogoGeograficoRepository(this.prisma)); }

async contarX(consulta) {
  const lugares = await lugaresDelFiltro(() => this.catalogoGeografico(), consulta.filtro);
  const where = Prisma.join(condicionesDeX(consulta, lugares), " AND ");
  ...   // el $queryRaw de hoy, sin tocar
}
```

- **Composiciones** (`lib/actions/*.ts`): no cambian. Pasan `getPrismaClient()`, que ya tiene los
  modelos del catálogo, y crean el repositorio dentro de la función (R16).
- **`ConteoEntregasRepository`** no cambia: recibe un `IConteoPorStatusRepository` ya construido.
- **Interfaces** (`IConteoPorStatusRepository` y demás): no cambian, porque el cambio está en el
  constructor del repositorio y en una función interna (R24).

### 3.5 Contexto y caché (R6, R13)

- Las lecturas de analítica corren con la sesión (`getPrismaClient` resuelve la empresa de la cookie)
  o dentro de `unstable_cache(() => conEmpresa(organizacionId, …))`
  (`lib/cache/next-analitica-cache.ts:95`). En los dos casos `deLaEmpresa()` da el catálogo del país
  de la empresa.
- El superadmin no llega a ninguna: `resolverAlcanceConteoEntregas` lo deniega
  (`rol_sin_analitica`). Si una lectura corriera en `comoPlataforma`, `deLaEmpresa` lanzaría
  `EmpresaNoResuelta` (R13).
- La clave de caché sigue siendo la del filtro de entrada (`claveConPrefijo`): los ids que pidió el
  cliente, no los resueltos. No cambia (R6).
- El TTL de 15 minutos ya cubre que el catálogo cambie, igual que cubre que cambien las órdenes.

## 4. Tránsito: nombres desde el catálogo (R8–R12)

`InformeTransitoRepository`:

```ts
export type InformeTransitoPrismaClient = Pick<PrismaClient, "$queryRaw"> & CatalogoPrismaClient;
```

1. **`filasEnAlerta`**:
   - el `SELECT` final cambia `k."nombre" AS "canton", d."nombre" AS "distrito"` por
     `c."canton_id", c."distrito_id"`;
   - se borran las dos líneas de `JOIN` (`:107–108`);
   - el resto de la consulta (cortes, hito y última transición) no cambia.
2. Si no vuelve ninguna fila, devuelve `[]` sin cargar el catálogo (R11).
3. Si vuelven filas, carga `const { catalogo } = await this.catalogoGeografico().deLaEmpresa()`, una
   vez por instancia. Mapea:
   - `canton` = `nodo(catalogo, canton_id)?.nombre`;
   - `distrito` = `distrito_id === null ? null : nodo(catalogo, distrito_id)?.nombre`.
4. **Nodo ausente** (R12; decisión «¿Tránsito con un cantón o distrito ausente del catálogo?»). Se
   recorren **todas** las filas antes de fallar, y se juntan los ids de nodo ausentes y los ids de
   las órdenes que los usan, sin duplicados y ordenados. Si hay alguno:
   - **Log.** Se escribe una línea con el logger de errores que ya existe: `ErrorLogger` y
     `defaultLogger` de `lib/errors/logger.ts`, el que usan las actions con `withErrorHandler`. El
     texto es `analitica - informe transito - error: nodos ausentes del catalogo=[<ids>]
     ordenes=[<ids>]`.
     - Solo lleva ids: ni nombres de lugar, ni destinatario, ni monto (misma regla que R18).
     - El repositorio recibe el logger como segundo argumento opcional del constructor
       (`logger: ErrorLogger = defaultLogger`), así que las composiciones no cambian y el test
       inyecta un doble.
     - Se descartó `registrarFallo` de `lib/clients/probadores/comun.ts`. Es propio de las pruebas
       de integraciones: usa `logger.warn` con el prefijo `[integraciones]` y un tipo de logger
       distinto. Tampoco se crea un logger nuevo.
   - **Fallo.** Después lanza
     `CatalogoGeograficoInconsistente(primerNodoAusente, "nodo de una orden en tránsito ausente del catálogo")`
     (la clase de `geografia-dominio.ts`; no se crea otra). `seleccionarTransito` la envuelve como
     `informe transito: filasEnAlerta falló (...)` (R22 de la 475), y el motor deja la ejecución en
     error sin mandar nada.
5. `zonas` y `contarSinHito` no cambian.

- **R10.** Siguen siendo las 3 llamadas al repositorio de `seleccionarTransito`. El catálogo son 5
  consultas fijas, sea cual sea el número de órdenes.
- **Contexto.** El job de envíos corre en el `conEmpresa` de su empresa
  (`lib/services/jobs/whatsapp-envio-deps.ts:9–10`), y la vista previa con la sesión del `maestro`.
  - **A verificar en T0.1:** que ningún camino genere el informe en `comoPlataforma` ni sin
    contexto. Sin contexto, `deLaEmpresa` usa la empresa de la sesión.
- `FilaTransito`, `calculo.ts` y `pdf.ts` no cambian (R9, R25).

## 5. Datos, país y autorización

- **Sin tablas, columnas, RLS ni únicos nuevos.** Salvo §10, sin migraciones.
  - `zona_distrito` y `distrito_zona_especial` siguen siendo de negocio, con `organizacion_id`.
  - `nodo_geografico` y `tipo_nivel_geografico` siguen siendo de plataforma, de solo lectura, con
    RLS por país.
  - El SQL crudo de las lecturas sigue corriendo con la envoltura de la extensión de SL-17 (tabla de
    `extension-empresa.ts:15–20`).
- **Qué depende del país** (`docs/perfil-agentes.md > spec_author`):

| Dato | De dónde sale |
|---|---|
| Catálogo para las facetas y los nombres de tránsito | `organizacion.pais_id` de la empresa del contexto (`deLaEmpresa`) y RLS `nodo_geografico_del_pais` |
| Nivel de cada faceta | `PROFUNDIDAD_DEL_NIVEL`, que ya existía (SLT-65). Se retira con SLT-47 y SLT-48, cuando la faceta sea un nodo de cualquier nivel |
| Moneda, impuestos, métodos de pago | No aplica: ninguna lectura del alcance calcula importes nuevos. «Por cobrar» de tránsito sigue siendo `monto_cobrar` |

  Ningún literal de país, de nivel ni de nombre de tipo en código nuevo.
- **Autorización.** Sin action, ruta, pantalla ni módulo nuevos. Las puertas siguen donde están:
  - analítica: `exigirModuloActivo("analitica")` y `prepararConteoEntregas` (rol y alcance), o
    `prepararConsultaProductos`;
  - vista previa de tránsito: solo `maestro`;
  - envío: el motor de la 474, con `aptoParaAdminTienda: false`.

## 6. Guardias (R14–R16)

- **R14.** `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts` se amplía a los archivos
  tocados:
  - `InformeTransitoRepository.ts`;
  - los cuatro `Conteo*`/`CicloVida` del alcance y los cuatro que comparten el recorte;
  - `_shared/lugares-del-filtro.ts`.

  Cada uno con su ancla antivacío (`deLaEmpresa()` o `lugaresDelFiltro(`), y con contraprueba.
- **R15.** `geografia-sin-cte-recursiva.guardia.test.ts` ya barre `lib/` y `scripts/`. No cambia.
- **R16.** `catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` calcula sus clases por la
  importación de `CatalogoGeograficoRepository`, así que recoge solas las clases nuevas. Su
  antivacío se amplía con `InformeTransitoRepository` y `ConteoPorStatusRepository`, para que un
  cambio en el cálculo no las pierda sin aviso.
- `tests/unit/analytics/alcance-obligatorio.guardia.test.ts` y `modulo-puro.guardia.test.ts` deben
  seguir en verde sin cambios:
  - `lugares-del-filtro.ts` no lanza `$queryRaw` ni forja tipos opacos;
  - `entregas-conteo.ts` no se toca.

## 7. La lectura de hoy, congelada: `scripts/geo-equivalencia/analitica-de-hoy.ts`

Es una copia **literal**, tomada de `origin/dev` **después** del merge de SLT-64, que entra primero
(decisión «¿Choque de archivos con SLT-64?»). Se integra `dev` en la rama, y el commit de la copia
cita el SHA de `dev` del que sale. Se toma **antes** de tocar ningún repositorio (T1.2) y no se edita
después. Las líneas de la tabla son de `fe16f5d1` y se reajustan a esa base.

| Función de la copia | Copia de |
|---|---|
| `condicionDeAlcance`, `condicionesDeConsultaDeHoy` y `contarPorStatusDeHoy(cliente, consulta)` | `ConteoPorStatusRepository.ts:83–212` |
| `plegarEnDesenlaces` | No se copia: se importa, porque no lee geografía |
| `condicionesSinFechaDeHoy`, `condicionesDeCargadasDeHoy` y `contarCargadasPorDiaDeHoy` | `ConteoCargadasPorDiaRepository.ts:113–230` |
| `condicionesDeDevolucionesDeHoy` y `contarDevolucionesPorCausaDeHoy` | `ConteoDevolucionesRepository.ts:56–147` |
| `condicionesDeCicloDeHoy`, `condicionDeVentanaTerminal` y `acumularCiclosDeHoy` | `CicloVidaRepository.ts:63–164` |
| `filasEnAlertaDeHoy(cliente, consulta)` | `InformeTransitoRepository.ts:37–132` |
| `contarProductosDeHoy`, `dineroProductosDeHoy`, `cohorteCargaDeHoy` y `conteoHoyGestionDeHoy` | El método de lectura de `ConteoProductosRepository`, `DineroProductosRepository`, `CohorteCargaRepository` y `ConteoHoyGestionRepository`, sobre los constructores de hoy de esta misma copia |

- Vive en `scripts/` por lo mismo que `consultas-de-hoy.ts`: nombra `canton`, `distrito` y las
  columnas viejas, que las guardias de `lib/` vigilan.
- Recibe la consulta ya preparada por `prepararConteoEntregas` con un actor `maestro` sintético. Es
  la misma puerta que usa la app; no se forja el tipo opaco.
- Se borra con SLT-48.

## 8. Script de equivalencia: `scripts/geo-equivalencia-analitica.ts` (R17, R18)

`pnpm geo:equivalencia-analitica [--muestra 20] [--empresa <id>]`

Es hermano de los de SLT-44 y SLT-65, no una ampliación: cada PR pega su propia salida. Reutiliza
`crearClienteDeSoloLectura` (`default_transaction_read_only = on`), `paraCadaEmpresa`, `compararPorId`
y `Cifras`. Se niega a correr si `DATABASE_URL` no es local, con el mismo `esBaseLocal` de
`geo-explain-consultas.ts` (se importa, no se copia).

Por empresa, dentro de `conEmpresa`, con un actor `maestro` (alcance `global` dentro de la empresa):

| Bloque | Qué compara (hoy = copia §7; nuevo = repositorio) |
|---|---|
| `analitica` | Para cada lectura (desglose por estado, entregas, cargadas por día, devoluciones y ciclo de vida) y para cada filtro de la lista de abajo, el resultado entero de hoy frente al nuevo. Una diferencia se imprime con la lectura, el filtro (tipo e id del nodo) y las dos cifras |
| `comparten-recorte` | Productos, cohorte de carga y contador de hoy, con los mismos filtros. Dinero por producto se compara por importe total |
| `transito` | `filasEnAlertaDeHoy` frente a `filasEnAlerta` con `PARAMETROS_POR_DEFECTO`, por `ordenId`: los mismos ids y, por orden, «distinto» en cantón o distrito, sin imprimir el nombre |
| `cadena-incoherente` | Informativo: las órdenes vivas cuyo distrito no cuelga de su cantón o cuyo cantón no cuelga de su provincia, con su número y sus ids. Un filtro cuya única diferencia son esas órdenes no cuenta como diferencia |

**Filtros de `analitica`:**
- sin filtro;
- cada provincia del país;
- `--muestra` cantones y `--muestra` distritos, los de más órdenes vivas;
- provincia y cantón a la vez;
- un id de cantón pedido como `distrito_id`, que debe dar cero en los dos lados (R3).

Cada filtro se corre sin rango y con el rango `mes`.

- **Salidas:** 0 si todo coincide (o solo difieren órdenes incoherentes), 1 si algo difiere y 2 si
  una empresa falló al leer.
- **Exporta** `compararEmpresaAnalitica(cliente, organizacionId, opciones)`. El `main` solo parsea
  los argumentos.
- **Quién y cuándo** (decisión heredada): una persona, sobre la copia de producción, antes del merge.
  Ningún agente lo corre fuera de la base de tests local.

## 9. Script de rendimiento: `scripts/geo-explain-analitica.ts` (R19–R22)

`pnpm geo:explain-analitica [--empresa <id>]`. Sin `--empresa`, toma la empresa con más órdenes
vivas.

### 9.1 Lo que se reutiliza

La medición de `geo-explain-consultas.ts` se **extrae** a `scripts/geo-equivalencia/medicion.ts`:
- `mediana` y `variacion`;
- `capturar` y `medirLectura`, que ganan `bloqueaPorPorcentaje` en la definición de la lectura en
  vez de leerlo de un `Set` fijo;
- `medirOFallar`;
- `consultasQueCompletanAntes` y `leeGeografia`.

`geo-explain-consultas.ts` los importa y los **re-exporta**: su test
(`tests/integration/db/geo-explain-consultas.test.ts`) pasa sin cambios. Es el mismo movimiento que
SLT-65 T1.1 hizo con `comparacion.ts`.

### 9.2 Lecturas

| Lectura | Antes / después | Faceta | Bloquea por 20 % | Bloquea por Seq Scan |
|---|---|---|---|---|
| `transito-filas` | `filasEnAlertaDeHoy` / `filasEnAlerta` + catálogo | Parámetros por defecto, todas las zonas | Sí | Sí |
| `conteo-entregas` | `contarPorStatusDeHoy` + pliegue / `ConteoEntregasRepository.contar` | `provincia_id` = la provincia con más órdenes | Sí | Sí |
| `conteo-por-status` | `contarPorStatusDeHoy` / `contarPorStatus` | Igual | Sí | Sí |
| `conteo-cargadas-por-dia` | Copia / repositorio | Igual | Sí | Sí |
| `conteo-devoluciones` | Copia / repositorio | Igual | Sí | Sí |
| `ciclo-vida` | Copia / repositorio | Igual | No: se imprime | Sí |

- Se mide con la faceta de provincia porque es la que más ids manda al `= ANY`: es donde el plan del
  `OR` puede cambiar.
- Sin faceta, «después» es idéntico a «antes» (R5), y se comprueba en un test, no en el script.

**Por qué el constructor no tiene dos modos** (decisión «¿Lecturas que comparten el recorte?»). Para
no tocar las cuatro lecturas que comparten el recorte, `lugares` podría ser opcional: sin él, las
facetas seguirían por columna. Se descarta, porque en la misma pantalla habría dos filtros por lugar
distintos y SLT-48 heredaría el modo viejo. Las cuatro pasan los ids resueltos.

### 9.3 La regla (R20, R21)

Para cada lado se calculan dos sumas por corrida:
- **total**: todas las consultas de la lectura, catálogo incluido;
- **sin catálogo**: las consultas que no leen `nodo_geografico`, `tipo_nivel_geografico`,
  `zona_distrito`, `distrito_zona_especial` ni `organizacion`.

En «antes» las dos sumas son iguales: la unión con `canton` y `distrito` va dentro de la consulta
sobre `orden`.

```ts
export type Veredicto = "ok" | "costo-fijo-del-catalogo" | "regresion";
export function veredicto(m): Veredicto
//  seqScanNuevoSobreOrden                                  → "regresion"   (las seis)
//  bloquea && total > antes·1,2 && sinCatalogo > antes·1,2 → "regresion"
//  bloquea && total > antes·1,2                             → "costo-fijo-del-catalogo"
//  en otro caso                                             → "ok"
```

- **Salida:** 1 si alguna lectura da `regresion`, 2 si alguna falló y 0 en otro caso (R22).
- `costo-fijo-del-catalogo` se imprime con las dos medianas sin catálogo, para pegarlo en el PR
  (decisión «¿Costo fijo del catálogo?»).
- Como en SLT-65, no imprime SQL ni parámetros. Solo corre contra localhost.

## 10. Índices y migraciones (R23)

**Por defecto, ninguna migración.** `orden` ya tiene índice en `provincia_id`, `canton_id` y
`distrito_id`, y la carga del catálogo usa los de SLT-43 y SL-17.

Si §9 marca `regresion`, se sigue el procedimiento de SLT-65 §11.2:
- una migración que solo contenga `CREATE INDEX` y su `DROP INDEX` en `down.sql`;
- nombre `db/migrations/<timestamp>_<qué>_slt71/`. El timestamp se comprueba contra `origin/dev` y
  las ramas en vuelo (`node scripts/archivos-en-vuelo.mjs`);
- `@@index` en `db/schema.prisma`, para que `migrate diff` salga vacío;
- `tests/unit/db/slt43-migraciones-aditivas.test.ts` ampliado a la carpeta.

Si el plan pide un índice de expresión (`COALESCE`), se para y se pregunta.

## 11. Pruebas y trazabilidad

Unit e integración contra Postgres real (`HAY_BASE_DE_DATOS`). Sin E2E nuevo (decisión «¿E2E
nuevo?»).

**Fixture nuevo** `tests/integration/db/_fixtures/geo-71.ts`, sobre `geo-65.ts`. Reutiliza sus dos
empresas (CR y `XA`) y añade:
- órdenes con y sin distrito en dos provincias, con gestiones `entregada` y `devuelta` y
  transiciones terminales, para que cada lectura tenga filas;
- órdenes en tránsito vencidas, con y sin distrito;
- la orden incoherente de `sembrarOrdenIncoherente`.

**Profundidad 4.** No se puede escribir en la base: las FK de `orden` son a `distrito`. Se prueba de
dos formas:
- en unidad, con un catálogo en memoria de 4 niveles (`crearCatalogo`);
- en integración, **cambiando la entrada**, con un cliente que añade un nodo hijo al resultado de
  `nodoGeografico.findMany` (técnica de SLT-44/65).

| R | Test |
|---|---|
| R1, R3 | `tests/unit/repositories/lugares-del-filtro.test.ts`: con un catálogo de 4 niveles, provincia → ella + sus 3 niveles; un id de otro nivel o ausente → descartado; todos inválidos → `[]` → `FALSE`; ids sin duplicados y ordenados. `tests/unit/repositories/lugar-orden.test.ts` ampliado: la forma de `sqlLugarEn` (un parámetro, dos `ANY`, sin `COALESCE`) |
| R1, R2, R4 | `tests/integration/db/geo-analitica-lugar.test.ts`: en el fixture, para cada lectura de analítica y cada provincia, cantón, distrito y combinación, el resultado nuevo es igual a la copia (§7). Alcance primero: `condicionesDeX(...)[0]` es el alcance |
| R3 | Mismo archivo: un id de cantón como `distrito_id` → 0 en las cinco lecturas; un id de otro país → 0 |
| R5 | Mismo archivo: sin faceta, con un cliente que cuenta las consultas, ninguna toca `nodo_geografico`, y el SQL capturado es idéntico al de la copia. Además, los tests unitarios existentes sin facetas (`conteo-por-status-sql`, `conteo-devoluciones`, `ciclo-vida`, `conteo-cargadas-servicio`, `cohorte-carga-sql`, `conteo-productos-sql`, `dinero-productos-sql`) pasan con su doble de solo `$queryRaw` |
| R6 | `tests/unit/analytics/conteo-entregas-contrato.test.ts` y `entregas-filtro-analitica.test.ts` existentes sin cambios. `git diff origin/dev...HEAD -- lib/analytics/` vacío, anotado en `progress/impl_SLT-71.md` |
| R7 | `conteo-productos-sql.test.ts` y `dinero-productos-sql.test.ts` (R56 de la 345, «el `where` es idéntico fragmento a fragmento») siguen verdes con el `lugares` resuelto. Con un caso más: con faceta, los fragmentos de productos son los de `condicionesDeConsulta(consulta, lugares)` |
| R8, R9 | `tests/integration/db/geo-transito-nombres.test.ts`: `filasEnAlerta` = `filasEnAlertaDeHoy` en el fixture, fila a fila, y el modelo de `seleccionarTransito` es igual con las dos. Las suites `informe-transito-seleccion`, `-zonas`, `-parados`, `-hitos` y `-catalogo-real` existentes pasan sin cambiar aserciones |
| R10 | `informe-transito-repo-consultas.test.ts` existente (3 llamadas) sin cambios. En `geo-transito-nombres.test.ts`: con 1 y con 40 órdenes en alerta, el número de consultas capturadas es el mismo, y el SQL de `filasEnAlerta` no contiene `"canton"` ni `"distrito"` como tabla |
| R11 | `geo-transito-nombres.test.ts`: sin órdenes en alerta, ninguna consulta toca `nodo_geografico` |
| R12 | `geo-transito-nombres.test.ts`: con un catálogo inyectado sin el cantón de una orden en alerta y sin el distrito de otra, `generar` rechaza con `informe transito: filasEnAlerta falló` y no produce contenido. El logger doble recibe exactamente una línea, que empieza por `analitica - informe transito - error: ` y contiene los dos ids de nodo y los dos ids de orden. No contiene ningún dato de `DATOS_PERSONALES_GEO65` ni ningún nombre de nodo del fixture. Contraprueba: con el catálogo completo, el logger no recibe nada |
| R13 | `geo-analitica-lugar.test.ts` y `geo-transito-nombres.test.ts`: la empresa `XA` carga solo nodos de `XA`; una instancia lee el catálogo una vez aunque se llame dos veces; en `comoPlataforma` con faceta → `EmpresaNoResuelta` |
| R14 | `geografia-lecturas-sin-nodo-fk.guardia.test.ts` ampliada (§6), con contraprueba. `geo-lecturas-sin-backfill.test.ts` ampliado: con `nodo_geografico_id` en NULL, las lecturas de analítica con faceta y tránsito dan lo mismo |
| R15 | `geografia-sin-cte-recursiva.guardia.test.ts` existente, sin cambios |
| R16 | `catalogo-geografico-sin-instancia-de-modulo.guardia.test.ts` con el antivacío ampliado (§6) |
| R17 | `tests/integration/db/geo-equivalencia-analitica.test.ts`: `compararEmpresaAnalitica` sobre el fixture → 0 diferencias, y la orden incoherente sale solo en `cadena-incoherente` con salida 0. Contraprueba: con un nodo de cantón inyectado bajo otra provincia en el cliente nuevo → diferencias > 0 en `analitica` y salida 1. Respeta `--muestra` |
| R18 | Mismo archivo y `tests/integration/db/geo-explain-analitica.test.ts`: con el cliente de los scripts, un `INSERT` falla con `25006`; la salida no contiene ningún dato de `DATOS_PERSONALES_GEO65`, ningún nombre de nodo ni SQL; con una URL que no es local, sale 2 sin conectar |
| R19, R22 | `geo-explain-analitica.test.ts`, en la base local: las seis lecturas se miden con 5 corridas por lado; código 2 si una lectura falla |
| R20, R21 | `geo-explain-analitica.test.ts`, unidad de `veredicto`: +21 % total y +21 % sin catálogo → `regresion`; +21 % total y +5 % sin catálogo → `costo-fijo-del-catalogo`; +19 % → `ok`; ciclo de vida con +50 % → `ok`; Seq Scan sobre `orden` solo en después → `regresion` en las seis. `geo-explain-consultas.test.ts` existente sin cambios (§9.1) |
| R23 | Comprobación del diff: `git diff --name-only origin/dev...HEAD -- db/` vacío, anotado en `progress/impl_SLT-71.md`. Si §10 aplica, `slt43-migraciones-aditivas.test.ts` ampliado |
| R24 | Gate completo de CI: las suites citadas sin cambiar aserciones, salvo las líneas de §11.1, y los E2E existentes (`analitica-roles` y los de dinero y reparto) |
| R25 | Comprobación del diff, revisada por el reviewer: `GestionOrdenRepository.ts`, `lib/whatsapp-envios/informes/transito/{pdf,calculo,tipos}.ts`, `components/` y, de `OrdenRepository.ts`, todo salvo la importación de `PROFUNDIDAD_DEL_NIVEL`, fuera del diff |

### 11.1 Aserciones que cambian, y por qué

R24 permite cambiar **solo** las aserciones unitarias que fijan el texto del SQL o los valores de
los parámetros de las facetas geográficas, porque eso es justo lo que esta feature cambia. Las líneas
son las de la base después de integrar `dev`.

**Texto del SQL:**
- `conteo-por-status-sql.test.ts:105–107` y `:121–123`;
- `conteo-devoluciones.test.ts:139–141`;
- `ciclo-vida.test.ts:94–96`;
- `conteo-cargadas-servicio.test.ts:202`;
- `cohorte-carga-sql.test.ts:143–145`.

`o."provincia_id" IN (` pasa a ser «una condición de lugar con `= ANY` por faceta».

**Valores de los parámetros** (decisión «¿Aserciones de parámetros de las facetas?»). R1 manda los
ids de cada faceta como **un solo parámetro array** (`= ANY($ids)`), así que cambian los valores, no
solo el texto. Lo esperado pasa a ser, por faceta, el array de ids resueltos:
- `conteo-por-status-sql.test.ts:111–115`: hoy `["z1","z2","c1"]`. Pasa a `"z1"`, `"z2"` y, por la
  faceta de cantón, el array resuelto de `c1`.
- `conteo-cargadas-servicio.test.ts:205–207`: hoy `arrayContaining(["z1","p1","c1","d1","t1"])`.
  Pasa a `"z1"`, `"t1"` y un array resuelto por cada faceta (`p1`, `c1`, `d1`).
- `cohorte-carga-sql.test.ts:152`: hoy `toContain("x1")` por faceta. Pasa a contener el array
  resuelto de `x1`. Si `x1` no está en el catálogo del doble, la faceta pasa a ser `FALSE` y no manda
  ningún parámetro (R3), y la aserción lo refleja.

Las aserciones de zona, tienda, mensajero, alcance y orden de los parámetros no geográficos no se
tocan.

**Cambios de entrada, no de aserción:**
- en `conteo-productos-sql.test.ts` y `dinero-productos-sql.test.ts`, los helpers (`sqlDe`,
  `parametrosDe`) y las llamadas a `condicionesDeConsulta(consulta)` ganan el argumento obligatorio
  `lugares`.

Los dobles de esos tests cambian **de entrada**: cuando el caso trae faceta, ganan los delegados del
catálogo (`zonaDistrito`, `organizacion`, `tipoNivelGeografico`, `nodoGeografico` y
`distritoZonaEspecial`) con nodos `p1`, `c1` y `d1`. Es la regla de SLT-44 §10. El reviewer lo
comprueba con el diff.

## 12. Alternativas descartadas

1. **Resolver los ids en el servicio o en `prepararConteoEntregas`** y meterlos en la consulta
   preparada.
   - `entregas-conteo.ts` es un módulo puro: lo vigila `modulo-puro.guardia`, y no puede cargar el
     catálogo.
   - Ampliar la consulta opaca después de prepararla es forjarla, y eso lo caza
     `alcance-obligatorio.guardia`.
   - El repositorio ya es donde vive la carga del catálogo (SLT-44 §4).
2. **Constructor con dos modos** (`lugares` opcional, por columna sin él): §9.2.
3. **Filtrar con `COALESCE(o.distrito_id, o.canton_id) = ANY($ids)`.** Es más corto, pero no puede
   usar los índices de las dos columnas y obligaría a un índice de expresión que Prisma no declara
   (SLT-65, alternativa 3).
4. **Seguir filtrando por la columna del nivel** (`o."provincia_id" = ANY(...)`). No requiere
   catálogo, pero queda fijado a tres niveles con nombre. No sirve cuando una faceta sea un nodo de
   profundidad 4, que es el objetivo de la épica.
5. **Nombres de tránsito con un `JOIN "nodo_geografico"` en el mismo SQL.** Ahorra la carga del
   catálogo, pero es una segunda vía de lectura de nombres fuera del dominio, y la decisión cerrada
   dice «se leen del catálogo». Además lee `nodo_geografico` desde SQL a mano, y la RLS por país lo
   sostiene, pero el filtro de la extensión no.
6. **Ampliar `geo-equivalencia-consultas.ts` y `geo-explain-consultas.ts`** en vez de scripts
   hermanos. Mezcla la evidencia de dos PR y obliga a tocar sus tests. Lo común se comparte por
   `comparacion.ts` y `medicion.ts`.
7. **Cargar siempre el catálogo** en analítica, con o sin faceta. Es más simple, pero añade unos 5
   costos fijos a cada carga de la pantalla, cuando la mayoría no filtra por lugar. Con R5, «sin
   faceta» queda byte a byte igual.

## 13. Riesgos

- **Plan del `OR` con `= ANY`** en provincias grandes: Postgres puede elegir un Seq Scan sobre
  `orden`. §9 lo mide y bloquea, y §10 lo corrige.
- **Carga del catálogo con caché fría.** Unas 5 consultas cuando hay faceta y la caché de analítica
  no tiene la entrada. La decisión «¿Costo fijo del catálogo?» lo acepta si `orden` no empeora (R21).
- **Las cuatro lecturas que comparten el recorte**: más archivos en el diff, y más dobles unitarios
  que cambian de entrada.
- **Choque con SLT-64** en `CicloVidaRepository.ts`, aceptado. SLT-64 mergea primero. SLT-71 integra
  `dev` con SLT-64 dentro antes de T1.2, para la copia de §7, y otra vez en F2.3. Si SLT-64 no ha
  mergeado cuando toque T1.2, T1.2 y T3.2 esperan.
- **Choque con SLT-47** en `OrdenRepository.ts`: aquí solo se cambia la importación de
  `PROFUNDIDAD_DEL_NIVEL`. Lo detecta `archivos-en-vuelo.mjs`.
- **Tránsito sin contexto de empresa.** Lo verifica T0.1.
