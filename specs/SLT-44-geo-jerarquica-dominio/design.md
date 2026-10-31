# SLT-44 — geo-jerarquica-dominio · design.md

> Requisitos: `requirements.md` (R1–R26). El alcance y la tabla «Decisiones cerradas» de
> `requirements.md` no se reabren aquí. La pregunta abierta sobre la caché se responde en §4 y se
> cierra con la aprobación del spec. Las dos preguntas nuevas (dependencia de SLT-46 y totales de
> cierres) tienen su recomendación en §7 y §6.

## Lo que ya existe

Buscado el 2026-10-30 con los términos `nodo_geografico`, `catálogo`/`catalogo`, `zonaQueCubre`,
`ancestros`, `descendientes`, `herencia`, `zona especial` y `cobertura`, en los tres sitios de
`docs/specs.md`:

- **Board** (`feature_list.json`):
  - SLT-43 es el modelo; esta tarjeta es su primer lector.
  - SLT-65 es la otra mitad de la tarjeta original, según la decisión «¿Una tarjeta o dos?».
  - SLT-45 a SLT-48 son el resto de la épica GEO (API y CSV, escrituras, presentación y contract).
  - Ninguna otra ficha crea un dominio geográfico en memoria ni una resolución de zona por ancestros.
- **Specs**:
  - `specs/SLT-43-geo-jerarquica-modelo` (tablas, RLS por país, `MODELOS_DE_PLATAFORMA`, sin `ruta`).
  - `specs/374-catalogo-geografico-admin`: cascada de `activo` al leer y colapso de zona.
  - `specs/SL-38-zona-especial-por-empresa`: la marca es de la empresa y se lee por un punto único.
  - `specs/465-tarifas-excel-cobertura`: la regla de cobertura y su equivalencia con `resolveGeo`.
  - `specs/327-editor-ubicacion` y `specs/366-zona-orden-desactualizada`: colapso compartido.
- **Código** (Grep/Read). El MCP `codebase-memory-mcp` responde, pero no tiene indexado este
  worktree: ningún proyecto de `list_projects` tiene `root_path` en
  `.worktrees/SLT-44-geo-jerarquica-dominio`.
  - No existe `geografia-dominio.ts` ni ninguna función de ancestros, descendientes o herencia de
    zona.
  - Se **reutiliza**:
  - `lib/repositories/_shared/zona-colapso.ts` (`zonaUnicaDeDistrito`): el colapso 1/0/>1, sin
    copiarlo (decisión «más de una zona»).
  - `lib/repositories/_shared/geografia-activa.ts` (`estaDisponible`, `SELECT_FLAG_PROPIO`): la
    cascada de `activo`. Gana una primitiva que comparten el dominio y `estaDisponible` (§2.3).
  - `lib/repositories/_shared/zona-especial.ts`: el único sitio que puede nombrar la tabla de
    marcas (guardia `zona-especial-punto-unico`). Gana la lectura de las marcas de la empresa (§3).
  - `lib/services/geo-resolucion.ts` (`resolveGeo`, `indexBy`) y `lib/utils/cobertura-distrito.ts`
    (`clasificarCobertura`) **no cambian**: siguen recibiendo las mismas filas, que ahora se
    construyen desde el catálogo.
  - Los modelos Prisma `NodoGeografico` y `TipoNivelGeografico` de SLT-43, con su RLS por país y sus
    índices en `pais_id` y `padre_id`.
  - `lib/db/para-cada-empresa.ts` (`paraCadaEmpresa`, con la opción `cliente`) para recorrer
    empresas en el script; `scripts/geo-backfill-nodo.ts` como molde de script testeable.
  - `tests/integration/db/_fixtures/geo-43.ts` (país `XA`) y `_fixtures/base-propia-43.ts`.

No aparece nada que ya resuelva SLT-44: no hay bloqueo.

## 1. Resumen

Un módulo puro, `lib/services/geografia-dominio.ts`, responde las preguntas de la geografía:
ancestros, descendientes, activo en cascada, tipos del país, zona que cubre un nodo y marca
especial. Trabaja sobre dos datos que le pasan:
- el **catálogo** del país (nodos y tipos de `nodo_geografico` y `tipo_nivel_geografico`);
- las **asignaciones** de la empresa (`zona_distrito` y `distrito_zona_especial`, leídas por su
  `distrito_id`).

Los carga un repositorio nuevo, `CatalogoGeograficoRepository`, una vez por repositorio y por
empresa (§4). Las siete lecturas de §5 dejan las tablas `provincia`, `canton` y `distrito` y pasan
por el catálogo y el dominio. Sus firmas y sus DTO no cambian. Las escrituras siguen donde están.
Mientras las asignaciones solo pueden ser a distritos (las escrituras siguen en las tablas viejas,
cuya FK es `distrito_id`), la herencia da por construcción lo mismo que hoy. Lo confirman un test de
equivalencia en CI (§6.1) y un script que una persona corre sobre una copia de producción (§6.2).

## 2. El dominio: `lib/services/geografia-dominio.ts` (R1–R8, R13)

### 2.1 Tipos

```ts
export interface TipoDeNivel {
  id: string; clave: string; nombreSingular: string; nombrePlural: string;
  digitosCodigo: number | null; codigoHeredaPrefijo: boolean;
}
export interface NodoDelCatalogo {
  id: string; padreId: string | null; profundidad: number; tipoId: string;
  nombre: string; nombreNormalizado: string; codigoOficial: string | null; activo: boolean;
}
export interface CatalogoGeografico {
  readonly paisId: string;
  readonly tipos: readonly TipoDeNivel[];
  readonly nodos: readonly NodoDelCatalogo[];          // en el orden en que llegaron (§3: por nombre, id)
  readonly porId: ReadonlyMap<string, NodoDelCatalogo>;
  readonly hijos: ReadonlyMap<string | null, readonly NodoDelCatalogo[]>; // null = raíces
}
export interface ZonaAsignada { id: string; nombre: string; esCentral: boolean }
export interface AsignacionesDeLaEmpresa {
  readonly zonasPorNodo: ReadonlyMap<string, readonly ZonaAsignada[]>;
  readonly nodosConMarca: ReadonlySet<string>;
}
```

### 2.2 Funciones

| Función | Devuelve | R |
|---|---|---|
| `crearCatalogo(paisId, tipos, nodos)` | el catálogo con `porId` e `hijos`; los hijos de cada padre conservan el orden de `nodos` | R1 |
| `crearAsignaciones(filasDeZona, nodosConMarca)` | `AsignacionesDeLaEmpresa`; `filasDeZona: { nodoId, zona }[]` | R1 |
| `nodo(cat, id)` | el nodo o `null` («no existe») | R3 |
| `ancestros(cat, id)` | del padre a la raíz; `[]` si es raíz o no existe | R2, R3 |
| `nodosBajo(cat, id)` | todos los descendientes, en preorden y en el orden del catálogo; `[]` si es hoja o no existe | R2, R3, R13 |
| `nodosDeProfundidad(cat, p)` | los nodos de esa profundidad, en el orden del catálogo | R14 |
| `tiposDelPais(cat)` | `cat.tipos` | R4 |
| `estaActivo(cat, id)` | `boolean`, o `null` si no existe | R3, R5 |
| `zonasCandidatas(cat, asig, id)` | `{ nodoId, zonas }` del nodo más cercano con asignación (él, luego sus ancestros), o `null` si ninguno tiene | R3, R6 |
| `zonaQueCubre(cat, asig, id)` | `zonaUnicaDeDistrito(zonasCandidatas(...)?.zonas ?? [])` | R6 |
| `esZonaEspecial(cat, asig, id)` | `true` si él o un ancestro está en `nodosConMarca` | R3, R7 |

- **Puro (R1).** Solo importa `zonaUnicaDeDistrito` (`_shared/zona-colapso.ts`) y
  `activoEnCascada` (`_shared/geografia-activa.ts`). Los dos son funciones sin Prisma, y ya los
  importa lógica pura: `cobertura-distrito.ts` y `geo-resolucion.ts`. No importa `@prisma/client`,
  `@/lib/db/*` ni ningún repositorio. Lo vigila una guardia (§10).
- **Más de una zona no sube (R6).** Si el nodo más cercano con asignación tiene dos zonas, el
  resultado es `null` y no se mira el abuelo. Inventar la zona del abuelo sería elegir tarifa por
  descarte, que es lo que el colapso de la 374 prohíbe.
- **`nodosBajo` es lo que reciben las consultas (R13).** Un consumidor que necesite filtrar en SQL
  «todo lo que cuelga de X» le pasa `nodosBajo(cat, x).map((n) => n.id)` (más `x`) como
  `= ANY($ids)`. En SLT-44 ninguna lectura lo necesita todavía: el primero es SLT-65.
- **Defensa ante un catálogo roto.** `ancestros` sube como mucho `profundidad - 1` veces. Si un
  `padreId` no está en el catálogo, lanza `CatalogoGeograficoInconsistente` con el id. No puede
  ocurrir con la FK compuesta de SLT-43 y la RLS por país, pero un bucle sin tope no es una
  respuesta.

### 2.3 Activo en cascada: una sola definición (R5)

`_shared/geografia-activa.ts` gana `activoEnCascada(flags: readonly boolean[]): boolean` (todos
`true`). `estaDisponible` pasa a ser `activoEnCascada` sobre los niveles presentes (`undefined` no
resta, como hoy). `estaActivo` del dominio es `activoEnCascada` sobre `[...ancestros, nodo]`. Así
hay una sola regla, en el sitio que ya vigila `geografia-predicado-unico`. Ni el dominio ni el
módulo compartido escriben el literal `activo: true`.

### 2.4 Mapeo a los tres niveles de hoy

Los DTO de hoy tienen tres niveles con nombre (`provincias`, `cantones`, `distritos`). En SLT-44 se
arman con profundidad 1, 2 y 3. El nodo de profundidad 3 es el «distrito» de la resolución por
nombres y de la corrección. Un nodo de profundidad > 3 no puede existir hasta SLT-46. Los
adaptadores no lo listan. Los DTO de N niveles son de SLT-45 y SLT-47.

## 3. Carga del catálogo: `lib/repositories/CatalogoGeograficoRepository.ts` (R9–R12)

Interfaz en `lib/interfaces/repositories/ICatalogoGeograficoRepository.ts`:

```ts
interface CatalogoYAsignaciones { catalogo: CatalogoGeografico; asignaciones: AsignacionesDeLaEmpresa }
interface ICatalogoGeograficoRepository {
  deLaEmpresa(): Promise<CatalogoYAsignaciones>;     // contexto de empresa (sesión o conEmpresa)
  dePais(paisId: string): Promise<CatalogoGeografico>; // superadmin, con país explícito
}
```

**`deLaEmpresa()`**:
1. Si `contextoActual()?.tipo === "plataforma"`, lanza `EmpresaNoResuelta` sin consultar (R10). En
   plataforma los modelos de negocio van «tal cual» (tabla §6.1 de `extension-empresa.ts`): sin
   este corte, `zona_distrito` traería las filas de todas las empresas.
2. Una sola `$transaction` interactiva. Con empresa, la extensión fija la empresa una vez y todo
   corre con la RLS de `servi_app` y en una misma foto. Lee en este orden:
   - `zonaDistrito.findMany({ select: { distritoId, zona: { select: { id, nombre, esCentral } } } })`.
     Es la primera, a propósito: es un modelo de negocio, y sin empresa la extensión la rechaza con
     `EmpresaNoResuelta` antes de ejecutar nada (R10). El nodo es `distritoId` (R12).
   - `organizacion.findFirst({ select: { paisId } })`. La política `organizacion_propia` deja ver
     solo la empresa del contexto.
   - `tipoNivelGeografico.findMany({ where: { paisId } })` y `nodoGeografico.findMany({ where: {
     paisId }, select: { id, padreId, profundidad, tipoId, nombre, nombreNormalizado,
     codigoOficial, ...SELECT_FLAG_PROPIO }, orderBy: [{ nombre: "asc" }, { id: "asc" }] })`. El
     `where` por país es explícito además de la RLS (R9).
   - las marcas: `leerNodosConMarcaDeLaEmpresa(tx)` (nueva en `_shared/zona-especial.ts`), que
     devuelve los `distritoId` de `distrito_zona_especial` (R12). Vive allí porque es el único
     archivo, además del repositorio de escritura, que puede nombrar el modelo. Desde allí se
     exporta también su tipo de cliente (`ClienteDeMarcas = Pick<PrismaClient,
     "distritoZonaEspecial">`), así el repositorio nuevo no escribe el nombre.
3. Arma `crearCatalogo` y `crearAsignaciones`.

**`dePais(paisId)`**: tipos y nodos con `where: { paisId }` y el mismo `select` y orden. No lee
asignaciones: son de cada empresa. Es la lectura del superadmin (`listArbolDePais`, en
`comoPlataforma` desde `geografia-plataforma.ts`, como hoy).

- **Orden (R14).** `ORDER BY nombre, id` en la base, con la collation de la base, la misma que
  ordena hoy `orderBy: { nombre: "asc" }`. Los filtros en memoria conservan el orden. Hoy, entre dos
  nombres iguales (hay muchos «San Rafael»), el orden no está definido. El `id` lo fija ahora, y los
  tests de equivalencia comparan los empates sin orden (§10).
- **Sin `nodo_geografico_id` (R12).** Ninguna lectura de esta feature lo selecciona, ni en `orden`,
  ni en `zona_distrito`, ni en `distrito_zona_especial`. Lo vigila una guardia sobre los archivos de
  §5, y un test en base propia lo deja en NULL y compara (§10).
- **Coste.** Una consulta por tabla, por índice (`pais_id` en `nodo_geografico` y
  `tipo_nivel_geografico`; `organizacion_id` en las dos de asignaciones), con unos 585 nodos en CR.
  Hoy la resolución por nombres ya lee las tres tablas viejas enteras en cada lote.

## 4. Caché del catálogo — respuesta a la pregunta abierta (R11)

**Propuesta: por petición y por empresa, sin TTL y sin invalidación.**

- El repositorio de catálogo memoriza, **en su instancia**, la *promesa* de `deLaEmpresa()`. La
  clave es la empresa:
  - `contextoActual().organizacionId` si hay `conEmpresa`;
  - la marca fija `"sesion"` si la empresa sale de la cookie, que en una petición es una sola.
  
  Memoriza la promesa y no el resultado: así las tres listas de los filtros, que van en `Promise.all`,
  comparten una sola carga. Si la promesa falla, se borra de la memoria y el siguiente intento
  vuelve a leer.
- `GeoRepository`, `OrdenRepository` y `CoberturaRepository` crean su `CatalogoGeograficoRepository`
  perezosamente, uno por instancia. Las composiciones crean esos repositorios en cada llamada.
  Grep del 2026-10-30: no hay ninguna instancia a nivel de módulo de los tres en `lib/` ni en
  `app/`. Así que la vida de la caché es la de la petición.
- Un cron que recorre empresas con la misma instancia (`paraCadaEmpresa`) no mezcla: la clave es la
  empresa.
- **Por qué no hace falta invalidar.** Una escritura de geografía, de zona o de marca termina en su
  propia petición. La siguiente petición crea instancias nuevas y lee lo nuevo, también lo que
  escriben los triggers de sincronía de SLT-43 o una persona por SQL.

Alternativas (§11, 1 a 3): por proceso con TTL, invalidación al escribir y la caché de datos de
Next (`'use cache'` con etiquetas). Se descartan por lo mismo: o sirven un nodo retirado durante el
TTL, o necesitan un canal entre instancias de Vercel, o corren fuera del contexto de empresa. Y la
ganancia es pequeña: una consulta por índice de unas 600 filas.

## 5. Lecturas que se reescriben (R14–R20)

Las firmas de las interfaces (`IGeoRepository`, `IOrdenRepository`, `ICoberturaRepository`) y los
DTO **no cambian**. Los servicios que las consumen tampoco: `FiltrosOrdenesService`,
`GeografiaService`, `CotizacionOrdenService`, `BulkOrdenService`, `CorregirDatosClienteService` y
`CoberturaService`.

| Repositorio · método | Hoy lee | Después | R |
|---|---|---|---|
| `GeoRepository.listProvinciasLite` | `provincia` | `nodosDeProfundidad(cat, 1)`, `disponible = estaActivo` | R14 |
| `GeoRepository.listCantonesLite` | `canton` + cadena | profundidad 2, `padreId`, `estaActivo` | R14 |
| `GeoRepository.listDistritosLite` | `distrito` + cadena | profundidad 3, `padreId`, `estaActivo` | R14 |
| `GeoRepository.listGeografiaLitePorZona(zonaId)` | distritos con fila en `zona_distrito` para la zona | ver abajo | R15 |
| `GeoRepository.listArbol` | árbol de 3 tablas + `zonas` + marca | árbol por `hijos` del catálogo; para el distrito: `activo` propio, `zonaQueCubre` y `esZonaEspecial` | R16 |
| `GeoRepository.listArbolDePais(paisId)` | árbol de 3 tablas por `paisId` | `dePais(paisId)`; `codigoDta` ← `codigoOficial` | R17 |
| `OrdenRepository.findAllProvincias` | `provincia` | profundidad 1, `disponible = activo` | R18 |
| `OrdenRepository.findCantonesByProvinciaIds(ids)` | `canton` por `provinciaId` | profundidad 2 con `padreId ∈ ids`, `estaActivo` | R18 |
| `OrdenRepository.findDistritosByCantonIds(ids)` | `distrito` + `zonas` + marca + cadena | profundidad 3 con `padreId ∈ ids`; `zonaId`/`esCentral` de `zonaQueCubre`; `esZonaEspecial`; `estaActivo` | R18 |
| `OrdenRepository.findDistritoParaCorreccion(id)` | `distrito` por id | `nodo(cat, id)` con profundidad 3, o `null`; `provinciaId` = abuelo; zona, `zonaNombre`, `esCentral`, marca y disponibilidad del dominio | R19 |
| `CoberturaRepository.listDistritos` | `distrito` + cadena + `zonas` + marca | profundidad 3; flags propios del distrito, su cantón y su provincia; `zonas` = `zonasCandidatas(...)?.zonas ?? []`; marca y `disponible` del dominio | R20 |

- **`listGeografiaLitePorZona` (R15).**
  - Nodos «de la zona»: los que tienen una asignación de la empresa a `zonaId`, más todo lo que
    cuelga de ellos (`nodosBajo`).
  - Provincias y cantones: los nodos de profundidad 1 y 2 de esa unión y de sus ancestros.
  - Distritos: los de profundidad 3 de la unión.
  - El orden final se fija como hoy, con `localeCompare(..., "es", { sensitivity: "base" })`.
  - Hoy cuenta un distrito que está en dos zonas en las dos listas, sin colapso. Se conserva:
    estos son filtros, no tarifa.
  - Un descendiente con una asignación propia a otra zona sigue saliendo bajo la zona de su
    ancestro. No pasa hasta SLT-46, y afinarlo es de SLT-47 (filtros).
- **`findDistritoParaCorreccion` (R19).** Hoy, un id que no es de un distrito, o que es de un
  distrito de otro país (oculto por la RLS), da `null`. Con el catálogo, `nodo()` da `null` fuera del
  país, y el filtro `profundidad === 3` da `null` para un id de cantón o de provincia.
- **Los tipos de cliente.** Los `Pick<PrismaClient, …>` de los tres repositorios ganan
  `nodoGeografico`, `tipoNivelGeografico`, `zonaDistrito` y `organizacion` donde falten. Las
  composiciones (`new GeoRepository(prisma)`, etc.) no cambian. Los tests de composición que
  construyen dobles con un `Pick` pueden necesitar los delegados nuevos.
- **`_shared/geografia-activa.ts`.** Sus fragmentos `SELECT_CADENA_*`, `disponibleDesdeCadena*` y
  `WHERE_*_DISPONIBLE` se quedan: los usan lecturas que no son de esta feature (§7) y su test
  existente. Los retira SLT-48 con las tablas.

## 6. Equivalencia de dinero (R21–R23)

### 6.1 La lectura de hoy, congelada: `scripts/geo-equivalencia/lecturas-de-hoy.ts`

Es copia literal de los cuerpos de hoy de `findAllProvincias`, `findCantonesByProvinciaIds`,
`findDistritosByCantonIds` y `CoberturaRepository.listDistritos`, más las listas y los árboles de
`GeoRepository` (para R14–R17). Implementa los mismos tipos de fila. Se copia **antes** de tocar los
repositorios (T1.1), desde `dev`, y no se edita después.
- Vive en `scripts/` porque las guardias `zona-especial-punto-unico` y `geografia-predicado-unico`
  barren `lib/` (y `app/`), y la copia nombra `zonasEspeciales` y escribe `activo: true`.
- Es «el antes» del test de CI y del script.
- Se borra con SLT-48.

### 6.2 Script: `scripts/geo-equivalencia-dinero.ts` (`pnpm geo:equivalencia-dinero`)

`pnpm geo:equivalencia-dinero [--muestra 200] [--empresa <id>]`

1. Abre su propio cliente con `default_transaction_read_only = on` en las opciones de conexión: toda
   transacción es de solo lectura y cualquier escritura falla con `25006` (R23).
2. Recorre las empresas con `paraCadaEmpresa(fn, { cliente })` (o solo `--empresa`). Dentro de
   cada una (`conEmpresa`), compara la lectura de hoy con la nueva:
   - **Distritos:** con todos los cantones del país, `findDistritosByCantonIds` de hoy frente al
     nuevo, por id. Compara `zonaId`, `esCentral`, `esZonaEspecial` y `disponible`, más la
     disponibilidad de provincias y cantones.
   - **Cobertura de cada zona:** `CoberturaService.listar(actor)` con el repositorio de hoy y con el
     nuevo, fila a fila. El actor es un `maestro` de la empresa. **A verificar en T5.1:** qué roles
     acepta `listar`. Por zona, el número de distritos con cobertura.
   - **Cotizaciones:** las `--muestra` órdenes más recientes de la empresa, sin borrar y con
     distrito. De cada una salen los nombres de su provincia, cantón y distrito, su tienda y su
     `monto_cobrar`. Se agrupan por tienda y se pasan a `CotizacionOrdenService.cotizar` dos veces:
     con un repositorio geográfico que delega en la lectura de hoy y con el `OrdenRepository` nuevo.
     El repositorio de tarifas es el real en las dos. El actor es el `apiKey` de la tienda. **A
     verificar en T5.1:** cómo arma ese actor `ApiKeyAuthService`, para replicarlo sin una key
     real. Compara el resultado entero: cobertura, zona, importes y errores por fila.
3. Imprime por empresa: comparados y distintos de cada bloque. Por cada diferencia imprime el id de
   empresa, nodo, zona u orden y los dos valores, y los importes si los hay. Nunca nombres de
   destinatarios, direcciones ni teléfonos (R23).
4. Código de salida: 0 si todo coincide, 1 si algo difiere, 2 si una empresa falló al leer. El
   script cuenta los `fallidas` de `paraCadaEmpresa` como fallo.
5. Exporta `compararEmpresa(cliente, organizacionId, opciones)`, que lo prueba §10; el `main` solo
   parsea argumentos (molde de `geo-backfill-nodo.ts`).

**Quién y cuándo (decisión «¿Quién corre la equivalencia…?»).** Una persona lo corre sobre una
**copia** de producción con las migraciones de SLT-43 ya aplicadas, antes del merge, y pega la
salida en el PR. Si algo difiere, el PR no entra. Ningún agente lo corre contra producción ni
contra la copia. No exige `--base`/`--destino` como el backfill de SLT-43, porque no escribe: la
barrera es la conexión de solo lectura.

**Totales de cierres.** La tarjeta los pide en «Mitigaciones», pero SLT-44 no toca ninguna lectura
de cierres (`CierreDiaRepository` es de SLT-65, §7): sus totales no pueden moverse por esta
feature. Se proponen para el script de SLT-65. Queda como pregunta abierta.

## 7. Frontera con SLT-45, SLT-46 y SLT-65

| Lectura | Por qué está en la frontera | Va a |
|---|---|---|
| `GeoRepository.findHermanos`, `findHermanosDeNodo`, `leerNodoParaActivacion` y la lectura del padre en `crearFila` | Preparan una escritura en las tablas viejas, dentro de su transacción y sobre la fila que se va a escribir. Las escrituras siguen allí (R24) | SLT-46, con las escrituras |
| `GeoRepository.leerDivisionDePais` | Es la carga CSV de división de SL-20 | SLT-45 («CSV») |
| La marca de zona especial de una orden ya creada: `OrdenRepository` (listado de API, l. 351 y 1104; `findParaCorreccion`; `findBaseCobroDevolucion`) | Es una lectura de órdenes; lee la marca del `distrito` de la orden por el punto único | SLT-65 |
| La marca en `CierreDiaRepository` (l. 353) | Lectura de cierres | SLT-65 |
| `ZonaRepository.update`: re-derivación de la zona de las órdenes al guardar una zona | Es un repositorio de zonas y una escritura; aplica el colapso sobre `zona_distrito` por distrito | SLT-65 |
| `GeografiaService.contarOrdenesSinEntregar` (cuenta por FK de la orden) | Lectura de órdenes; no usa el árbol | SLT-65 |
| `TarifaZonaMensajeroRepository.resolvePagoTarifa` | Recibe `zonaId`; no lee geografía | Ninguna: no cambia |
| `DistritoZonaEspecialRepository.aplicarCambios` | Solo escribe | SLT-46 |

**Riesgo de la frontera, y recomendación.** Las lecturas que van a SLT-65 resuelven la zona y la
marca del distrito sin subir a los ancestros. Hoy da lo mismo: las tablas de asignaciones solo
admiten distritos. Si SLT-46 permite asignar a un cantón antes de que SLT-65 las migre, la
cotización (heredada) y el cobro de una orden creada (no heredado) divergen. **Recomendación:** que
SLT-46 dependa de SLT-65. Queda como pregunta abierta en `requirements.md`.

## 8. Modelo de datos, migraciones y país

- **Sin tablas, columnas ni migraciones nuevas (R25).** Los índices que usan las lecturas ya
  existen: `nodo_geografico(pais_id)` y `tipo_nivel_geografico(pais_id)` de SLT-43, y
  `zona_distrito(organizacion_id)` y `distrito_zona_especial(organizacion_id)` de SL-17. Si al medir
  hiciera falta un índice, va en una migración solo con `CREATE INDEX` y su `down.sql`, y se avisa
  antes.
- **Multi-empresa.** No hay tabla nueva. `nodo_geografico` y `tipo_nivel_geografico` son de
  plataforma (RLS por país, solo lectura para `servi_app`). Las asignaciones son de negocio:
  `organizacion_id` lo ponen la extensión y la RLS, como hoy.
- **Qué depende del país** (`docs/perfil-agentes.md > spec_author`):

| Dato | De dónde sale |
|---|---|
| Nodos y tipos del catálogo | `organizacion.pais_id` de la empresa del contexto, más la RLS `nodo_geografico_del_pais` |
| Árbol del superadmin | El `paisId` que elige en la pantalla |
| Zonas y marcas | La empresa del contexto (extensión y RLS) |
| Moneda, impuestos, etc. | No aplica: los importes los sigue calculando `derivarIngresoOrden` |

Ningún literal de país, nivel ni moneda en código nuevo.

## 9. Autorización y contexto

No hay action, ruta ni pantalla nueva, y no aplica ningún módulo apagable. Cada lectura corre en el
contexto que ya tiene su entrada: la sesión para filtros, árbol, corrección y Excel; la API key para
la carga y la cotización (`conEmpresaDeLaKey`); `comoPlataforma` para el árbol del superadmin.
`deLaEmpresa()` en plataforma lanza (§3). El script corre con `paraCadaEmpresa`, que ya está en
`EXCEPCIONES_DE_PLATAFORMA` (ficha SL-17): no hace falta una excepción nueva. **A verificar en
T5.1** con la guardia `plataforma-solo-en-lista`.

## 10. Pruebas y trazabilidad

Unit e integración contra Postgres real (`HAY_BASE_DE_DATOS`). Sin E2E nuevo (decisión «¿E2E?»).
Fixture nuevo `tests/integration/db/_fixtures/geo-44.ts`, sobre `geo-43.ts`:
- dos empresas: una en CR y otra en el país `XA`;
- zonas con distritos, una central;
- un distrito en dos zonas y uno sin zona;
- un cantón retirado con un distrito activo, y un distrito retirado;
- marcas especiales de una empresa;
- una tienda con tarifa y órdenes con y sin distrito.

Reutiliza las fábricas de `tests/integration/cotizacion-api-key.test.ts` si las exporta; si no,
arma lo mínimo.

Comparación con empates: cuando dos filas tienen el mismo nombre, los tests de equivalencia comparan
el grupo como conjunto (por id), porque hoy su orden no está definido (§3).

| R | Test |
|---|---|
| R1 | `tests/unit/guards/geografia-dominio-puro.guardia.test.ts`: `geografia-dominio.ts` no importa `@prisma/client`, `@/lib/db/*` ni repositorios salvo `_shared/zona-colapso` y `_shared/geografia-activa`. Contraprueba con un texto que importa `@prisma/client`. Además, todo `geografia-dominio.test.ts` corre sin base. |
| R2, R3, R4 | `tests/unit/services/geografia-dominio.test.ts`: catálogo de 4 niveles a mano; ancestros de padre a raíz; `nodosBajo` en preorden y en el orden del catálogo; raíz y hoja; id ajeno → `null`/`[]`/sin zona/sin marca; `tiposDelPais`; `padreId` ausente → `CatalogoGeograficoInconsistente`. |
| R5 | `geografia-dominio.test.ts`: tabla de las 8 + 4 combinaciones, `estaActivo` = `estaDisponible`; nodo de profundidad 4 con el bisabuelo retirado → inactivo. `tests/unit/repositories/geografia-activa.test.ts` (existente) sin cambiar aserciones. |
| R6 | `geografia-dominio.test.ts`: asignación en el propio nodo, en el padre, en el abuelo; una zona → esa; dos en el nodo más cercano con una sola en el abuelo → `null` (no sube); ninguna → `null`; la más específica gana a la del ancestro. |
| R7 | `geografia-dominio.test.ts`: marca propia, heredada del cantón, de la provincia, ninguna. |
| R8 | `geografia-dominio.test.ts` y `tests/integration/db/geo-equivalencia-dinero.test.ts`. Con las asignaciones del fixture (solo distritos), zonas candidatas, zona y marca de cada distrito = las de `lecturas-de-hoy`; provincias y cantones sin zona ni marca. |
| R9, R10 | `tests/integration/db/geo-catalogo-repository.test.ts`: empresa de CR y empresa de `XA`, cada una ve solo su país, sus zonas y sus marcas. `deLaEmpresa()` en `comoPlataforma` o sin contexto → `EmpresaNoResuelta` con 0 consultas (contador de consultas de la extensión o doble). `dePais("XA")` solo trae `XA`. |
| R11 | `geo-catalogo-repository.test.ts`: tres lecturas, también en `Promise.all`, sobre la misma instancia → 1 consulta de nodos. Dos empresas con la misma instancia → 2 cargas, cada una con lo suyo. Una instancia nueva tras renombrar un distrito ve el nombre nuevo. Si la carga falla, el siguiente intento vuelve a leer. |
| R12 | `tests/unit/guards/geografia-lecturas-sin-nodo-fk.guardia.test.ts`: `nodoGeograficoId`/`nodo_geografico_id` no aparece en `CatalogoGeograficoRepository.ts`, `GeoRepository.ts`, `CoberturaRepository.ts`, `_shared/zona-especial.ts` ni en el bloque de `OrdenRepository.ts` entre `findAllProvincias` y `findDistritoParaCorreccion`; contraprueba. Más `tests/integration/db/geo-lecturas-sin-backfill.test.ts` (base propia, `_fixtures/base-propia-43.ts`): con los triggers de columna desactivados y `nodo_geografico_id` en NULL en `zona_distrito` y `distrito_zona_especial`, las lecturas de R18 y R20 dan lo mismo que con la columna llena. |
| R13 | `tests/unit/guards/geografia-sin-cte-recursiva.guardia.test.ts`: ningún `WITH RECURSIVE` (sin distinguir mayúsculas) en `lib/` ni en `scripts/`; contraprueba. `nodosBajo` en `geografia-dominio.test.ts`. |
| R14, R15, R16, R17 | `tests/integration/db/geo-lecturas-catalogo.test.ts`: con el fixture, cada método nuevo frente a su copia en `lecturas-de-hoy.ts`; mismos ids, nombres, padres, `disponible`, zona y marca, mismo orden salvo empates. R15 además con una zona sin distritos (listas vacías) y con una zona de otra empresa (vacías). Las suites existentes `filtros-ordenes-service.test.ts`, `geografia-service.test.ts`, `geografia-dos-paises.test.ts`, `geografia-catalogo-activo.test.ts`, `geografia-superadmin-sin-empresa.test.ts` y `zona-especial-dos-empresas.test.ts` pasan sin cambiar aserciones. |
| R18 | `geo-lecturas-catalogo.test.ts` (las tres lecturas frente a la copia) y `tests/integration/cotizacion-api-key.test.ts`, `ordenes-carga-masiva-chunk.route.test.ts`, `carga-masiva-errores-roundtrip.test.ts` y `tests/unit/services/geo-resolucion-retirados.test.ts` (existentes) sin cambiar aserciones. |
| R19 | `geo-lecturas-catalogo.test.ts`: distrito, distrito retirado, distrito en dos zonas, id de cantón → `null`, id de otro país → `null`. `corregir-datos-cliente.repo.test.ts` existente sin cambiar aserciones. |
| R20 | `geo-lecturas-catalogo.test.ts` (filas frente a la copia) y `cobertura-repository.test.ts` y `tests/unit/utils/cobertura-vs-resolve-geo.test.ts` existentes sin cambiar aserciones. |
| R21 | `tests/integration/db/geo-equivalencia-dinero.test.ts`: `compararEmpresa` sobre el fixture → 0 diferencias en distritos, cobertura y cotizaciones de las dos empresas. Contraprueba: con un «nuevo» al que se le añade una asignación en un cantón (inyectada en el dominio) → diferencias > 0 y nombradas. |
| R22 | `geo-equivalencia-dinero.test.ts`: salida 0 si coincide y 1 si difiere; la muestra respeta `--muestra`; las cifras por bloque aparecen en la salida. |
| R23 | `geo-equivalencia-dinero.test.ts`: con el cliente del script, un `INSERT` falla con `25006`. Las filas de `orden`, `zona_distrito` y `distrito_zona_especial` quedan iguales antes y después de correrlo. La salida no contiene ningún `destinatario`, `direccion` ni `telefono_dest` del fixture. |
| R24 | `tests/unit/guards/nodo-geografico-sin-escritor.guardia.test.ts` (existente, SLT-43 R37) sin cambios, y las suites de escrituras (`geo-repository.escrituras.test.ts`, `geografia-alta.test.ts`, `geografia-renombrado.test.ts`, `distrito-zona-especial-por-empresa.test.ts`, `zona-repository.test.ts`) sin cambiar aserciones. |
| R25 | Comprobación del diff, no un test de vitest: `git diff --name-only origin/dev...HEAD -- db/` vacío. Un test que fijara la lista de migraciones se rompería con la siguiente feature de cualquiera. La salida va en `progress/impl_SLT-44.md` y la mira el reviewer. Si hiciera falta un índice, `slt43-migraciones-aditivas.test.ts` se amplía a esa carpeta. |
| R26 | Gate completo de CI: suites de integración existentes de geografía, zonas, cobertura, órdenes, cierres y carga sin cambiar aserciones, y los E2E existentes de dinero y reparto (`cierre-dia`, `cierres-admin*`, `wallet*`, `mis-asignaciones`). |

**Tests unitarios con dobles que cambian de entrada, no de salida.**
`tests/unit/repositories/catalogo-filtros-ordenes.test.ts` y `orden-repository.bulk.test.ts`
simulan `provincia/canton/distrito.findMany`, que dejan de llamarse. Se reescribe **el doble**:
devuelve nodos, asignaciones y marcas equivalentes a lo que simulaba. **Las salidas esperadas no
cambian**, y el reviewer lo comprueba con el diff. Si un caso solo comprobaba qué modelo de Prisma
se llamaba, se sustituye por el mismo caso sobre el modelo nuevo. Ningún otro test existente se
toca (R26).

## 11. Alternativas descartadas

1. **Caché por proceso con TTL** (módulo con `Map` y caducidad). En Vercel cada instancia tiene la
   suya. Tras retirar un distrito, una instancia lo seguiría dando por activo hasta el TTL, y la
   cotización lo aceptaría. Además, un `Map` de módulo con asignaciones de empresa es una fuente de
   fugas entre empresas, justo lo que `docs/architecture.md` prohíbe cachear (R28 de SL-36, por
   analogía).
2. **Invalidación al escribir.** Las escrituras de geografía llegan por la action del superadmin,
   por la carga CSV, por los triggers de sincronía y a mano. No hay un punto único en la app que vea
   todas. Y no hay canal entre instancias para avisar a las demás.
3. **Caché de datos de Next (`'use cache'` + `revalidateTag`).** Comparte entre instancias, pero la
   función cacheada corre fuera de la petición: sin cookie de sesión ni `AsyncLocalStorage`, la
   extensión no fija empresa. Habría que leer como plataforma y pasar el país a mano, con una
   excepción nueva en `EXCEPCIONES_DE_PLATAFORMA` para ahorrar una consulta por índice.
4. **CTE recursiva en cada lectura.** La descarta la decisión «¿Cómo se resuelven ancestros y
   descendientes sin `ruta`?»: SQL en cada repositorio con la misma regla escrita N veces. En
   memoria, la regla vive una vez en el dominio.
5. **Cambiar las firmas: los servicios piden el catálogo y llaman al dominio**, y se borran los
   cuatro métodos de `OrdenRepository`. Es más limpio a la larga, pero cambia
   `ICotizacionOrdenService`, `BulkOrdenService` y `CorregirDatosClienteService` y todos sus tests
   con dobles. Se pierde la prueba más fuerte de que nada cambió: que esas suites pasen sin tocar.
   Se puede hacer cuando SLT-45 traiga la v2 por id de nodo.
6. **Un cargador de catálogo inyectado en cada composición**, compartido entre repositorios de la
   misma petición. Ahorra una carga cuando una petición usa dos repositorios, pero toca unas 60
   composiciones de `OrdenRepository`. Hoy ninguna petición de §5 usa dos de los tres repositorios
   para leer el catálogo.
7. **Leer el nodo de `zona_distrito.nodo_geografico_id`.** Lo prohíbe la decisión «¿De dónde se lee
   el lugar…?»: el deploy dependería del backfill.
8. **Que «más de una zona» suba al ancestro** buscando una zona única. Elige tarifa por descarte; el
   colapso de la 374 dice `null`.
9. **El antes del script reconstruido en SQL** en vez de copiar el código de hoy. Una traducción a
   SQL es otra implementación que puede equivocarse igual que la nueva. La copia literal es el
   comportamiento real de `dev`.

## 12. Riesgos

- **Orden con empates y collation.** El orden por nombre lo sigue dando Postgres, no `localeCompare`.
  Hoy, entre dos nombres iguales, el orden no está definido. La copia y lo nuevo pueden diferir solo
  en eso, y los tests lo toleran a propósito (§10).
- **Contexto sin empresa con modelos de plataforma.** Sin el corte de §3, paso 1, un `deLaEmpresa()`
  en plataforma leería las asignaciones de todas. Lo cubre R10 con test.
- **La frontera de §7** (pregunta abierta sobre la dependencia de SLT-46).
- **Tamaño.** Se escribe para unos 600 nodos por país. Un país con decenas de miles de nodos
  necesitaría revisar §4. Ninguno está en el alcance de la épica.
