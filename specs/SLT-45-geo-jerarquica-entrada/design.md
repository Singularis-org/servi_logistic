# SLT-45 — geo-jerarquica-entrada · design.md

> Escrito por `spec_author` el 2026-11-05 sobre la rama apilada en SLT-71 (contiene SLT-43, SLT-44 y
> SLT-65). Los requisitos están en `requirements.md`; aquí va el cómo.
>
> El MCP del grafo no tiene indexado este worktree (`list_projects` no lo lista): la exploración se
> hizo con Grep/Read.

## Lo que ya existe

Buscado en el board (`feature_list.json`, todos los estados), en `specs/` y en el código con los
términos `api/v2`, `ubicacion_codigo`, `v2/geografia`, `resolveGeo`, `canton_distrito`,
`nodo_geografico_id` y «API v2».

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| Nada de v2: ninguna ruta, schema, test ni ficha con `api/v2` o `ubicacion_codigo` | código, `specs/`, board | Se crea aquí |
| SLT-80 «Guía de integración por API en la ayuda» (pending) | board | Es la guía HTML/PDF; aquí no se toca (decisión del 2026-11-05) |
| v1 entera: `app/api/ordenes/api-key/**` (carga, cotización, consulta, etc.) | código | Se reutiliza: v2 llama a los mismos handlers y servicios (§4) |
| `resolveGeo`, `indexBy`, `normalize`, mensajes de retirado | `lib/services/geo-resolucion.ts` | v1 lo sigue usando tal cual (§2.1); v2 reutiliza `normalize` |
| El dominio de N niveles: `ancestros`, `nodosDeProfundidad`, `estaActivo`, `zonaQueCubre`, `esZonaEspecial`, `tiposDelPais` | `lib/services/geografia-dominio.ts` (SLT-44) | Base del motor de v2 (§2.2); no se cambia |
| El catálogo de la empresa, por petición: `CatalogoGeograficoRepository.deLaEmpresa()` | `lib/repositories/CatalogoGeograficoRepository.ts` (SLT-44) | Se inyecta en los servicios (§3) |
| `disponibleEnCatalogo`, `hijosDeProfundidad` (las lecturas de v1 por profundidad 1/2/3) | `OrdenRepository` (SLT-44 R18) | Ya son el adaptador de v1 a profundidades: no se tocan |
| `lugarDeLaOrden` (`COALESCE(distrito, canton)`) | `lib/repositories/_shared/lugar-orden.ts` (SLT-65) | Lugar de una orden en la consulta v2 y valor del nodo al crear (§3) |
| Trigger `orden_nodo_geografico` | `db/migrations/20261104120400_columnas_nodo_geografico` (SLT-43) | No se toca (§3.3) |
| Doble de catálogo para tests | `tests/fixtures/doble-catalogo-geografico.ts` | Se reutiliza en los unit tests del motor |
| Scripts de copia de producción con `--base`/`--destino` y solo lectura | `scripts/geo-backfill-nodo.ts`, `scripts/geo-equivalencia-dinero.ts` | Patrón del script de payloads (§7.1) |
| Guardias del canal: `openapi-canal-rutas-reales`, censo `openapi-177-paths…`, `rastreo-sin-ruta-nueva` (listas del middleware) | `tests/unit/guards/`, `tests/unit/api/` | Se amplían a `/api/v2` (§9) |
| `GeoRepository.leerDivisionDePais` (CSV de división de SL-20), asignado a SLT-45 por SLT-44 §7 | `lib/repositories/GeoRepository.ts` | No se toca; pregunta abierta 2 (propuesta: SLT-46) |

Nada de lo encontrado resuelve v2 ni la resolución por N niveles: se sigue.

## 1. Mapa

| Pieza | Requisitos |
|---|---|
| §2 Resolución: v1 sin tocar, motor de N niveles para v2 y la carga de otros países | R3, R5, R12–R16, R31, R33 |
| §3 Escritura del nodo y las 3 FK; convivencia con el trigger | R25–R28 |
| §4 Rutas de v2 y reutilización de v1 | R10, R11, R17–R21, R24 |
| §5 Mensajes exactos | R5, R12–R16, R31 |
| §6 Catálogo `GET /api/v2/geografia` | R22, R23, R33 |
| §7 Contrato congelado de v1, payloads reales y su script | R1, R2, R6–R9 |
| §8 Plantilla de la carga masiva | R29–R32 |
| §9 OpenAPI, Postman, CHANGELOG y guardias | R34, R35 |
| §10 Datos, multi-empresa, autorización, migraciones y país | R11, R24, R28 |
| §12 Trazabilidad | todos |

## 2. Resolución de la ubicación

### 2.1 v1: `resolveGeo` no cambia

v1 ya resuelve por profundidades desde SLT-44: `findAllProvincias` = profundidad 1,
`findCantonesByProvinciaIds` = 2, `findDistritosByCantonIds` = 3, todas del catálogo de la empresa. Esa
es la traducción provincia/cantón/distrito → nodo que pide la tarjeta: el id del distrito resuelto **es**
el id del nodo (SLT-43 R13). `resolveGeo` y sus mensajes no se tocan (R3). Lo único que v1 gana:

- **La comprobación de forma del país (R5)**, antes de resolver las filas: si el país de la empresa no
  es de 3 niveles, cada fila sale con el error de país no habilitado bajo `ubicacion`. Para Costa Rica
  la comprobación pasa siempre y nada cambia (R2).
- **El nodo al crear (R25)**: `nodoGeograficoId = lugarDeLaOrden(geo)` = `distritoId ?? cantonId`. Se
  calcula en `BulkOrdenService` al armar `CreateOrdenData`, no en `ResolvedGeo`, para que las aserciones
  `toEqual` de los tests existentes de `resolveGeo` no cambien (R32).

### 2.2 Motor de N niveles: `lib/services/geo-ubicacion.ts` (nuevo, puro)

Sin Prisma ni I/O, como `geografia-dominio.ts` (misma guardia de pureza, se añade a su lista). Funciones:

```ts
type EntradaUbicacion = { tipo: "ruta"; nombres: string[] } | { tipo: "codigo"; codigo: string };

type UbicacionResuelta = {
  nodo: NodoDelCatalogo;
  ruta: NodoDelCatalogo[];          // de la raíz al nodo
  zona: ZonaAsignada;               // zonaQueCubre (SLT-44 R6)
  esZonaEspecial: boolean;          // SLT-44 R7
  fks: { provinciaId: string; cantonId: string; distritoId: string | null };
};

type ResultadoUbicacion = { ok: true; u: UbicacionResuelta } | { ok: false; fieldErrors: Record<string, string[]> };

resolverUbicacion(entrada, catalogo, asignaciones): ResultadoUbicacion
esPaisDeTresNiveles(catalogo): boolean            // max(profundidad) === 3
admiteGuardado(catalogo, nodo): boolean           // esPaisDeTresNiveles && profundidad ∈ {2,3}
fksDeNodo(catalogo, nodo): {...} | null           // §3.1; null si no admite guardado
rutaPublica(catalogo, nodoId): UbicacionDTO[]     // R21
```

Orden de comprobación, que fija la precedencia de los errores (§5):

1. **Por ruta (R13).** Para cada nivel `n` (1-based): nombre vacío → error; buscar
   `normalize(nombre)` entre los hijos del nodo anterior (raíces del país en `n = 1`) con
   `nombreNormalizado`; 0 → no encontrado; >1 → ambiguo; no activo en cascada (`estaActivo`) → retirado.
   Para en el primer fallo, igual que `resolveGeo`. Se normaliza con `normalize` de
   `geo-resolucion.ts`, que es el mismo `normalizeName` de SLT-43 R10.
2. **Por código (R14).** Coincidencia exacta tras `trim()` sobre `codigoOficial` de los nodos del país.
   El único de SLT-43 es por `(pais, tipo, código)`, así que dos nodos de tipos distintos pueden
   compartir código: eso es «ambiguo», no se elige uno. Luego, retirado.
3. **Regla de guardado (R15)** con `admiteGuardado`. Va **antes** de la zona: decir «sin zona» de algo
   que nunca se podrá guardar manda al integrador a pedir una zona inútil.
4. **Zona (R16)** con `zonaQueCubre`. `null` (0 o >1 zonas) → «sin zona».

Para v1 (Costa Rica) el paso 3 nunca falla en profundidad 3. Para v2 en Costa Rica, un cantón
(profundidad 2) pasa el paso 3 y hoy cae en el 4: `zona_distrito` solo admite distritos, así que ningún
cantón tiene zona hasta SLT-46. Es el comportamiento esperado y tiene su test.

### 2.3 Dónde se llama

| Vía | Extractor | Resolución |
|---|---|---|
| v1 carga y cotización | `geoInputDesdeColumnasSeparadas` (sin cambios) | `resolveGeo` (§2.1) |
| Sesión, país de forma CR | `geoInputDesdePlantillaV3` (sin cambios) | `resolveGeo` |
| Sesión, otro país | nuevo `geoInputDesdeColumnasDeNivel(columnas)` (§8) | motor §2.2 |
| v2 crear, lote y cotización | la fila trae `ubicacion` o `ubicacion_codigo` (§4.2) | motor §2.2 |

`BulkOrdenService.resolveFila` gana una segunda rama: si el extractor devuelve una
`EntradaUbicacion`, resuelve con el motor; si devuelve la terna de hoy, con `resolveGeo`. El resto de
`resolveFila` (validación de campos, tarifa, especial, dedupe) no cambia.

**De dónde sale el catálogo.** `BulkOrdenService` y `CotizacionOrdenService` reciben
`ICatalogoGeograficoRepository` como **último parámetro del constructor**, opcional para que los dobles
de los tests existentes sigan compilando sin cambios (R32). Con él calculan la forma del país (R5, §8) y
resuelven con el motor. Si falta, la vía v1 corre como hoy sin la comprobación de R5 (es el
caso de los dobles de los tests existentes), y la v2 lanza un error de configuración: nunca se degrada
en silencio a v1. Los composition roots (`carga`, `cotizacion`,
`carga-masiva/chunk` y las cinco rutas v2) lo pasan siempre, y un test de composición lo comprueba
(mismo patrón que `tests/unit/api/ordenes-api-key-composicion-415.test.ts`): este repo ya midió un
composition root que importaba una dependencia sin inyectarla.

## 3. Escritura del nodo y las 3 FK

### 3.1 Derivación (R25)

`fksDeNodo` sale de la ruta del nodo en el catálogo:

| Profundidad del nodo | `provincia_id` | `canton_id` | `distrito_id` | `nodo_geografico_id` |
|---|---|---|---|---|
| 3 | abuelo | padre | nodo | nodo |
| 2 | padre | nodo | `NULL` | nodo |

Funciona porque, hasta SLT-46, todo nodo de un país real viene de `provincia`/`canton`/`distrito` con el
mismo id (SLT-43 R13, R15, R37): las FK viejas existen. Los países de prueba de 2 y 4 niveles, que solo
viven en `nodo_geografico`, nunca llegan aquí: la regla de guardado los para antes (R33).

### 3.2 Dónde se escribe

- `CreateOrdenData` (`lib/interfaces/repositories/IOrdenRepository.ts`) gana `nodoGeograficoId: string`,
  y `OrdenRepository.toCreateManyInput` lo manda en el INSERT. Es el único camino que crea órdenes
  (`createMany` en las dos variantes de carga); el alta manual se borró en 2026-08-07.
- `CorregirDatosClienteData` gana `nodoGeograficoId`; `CorregirDatosClienteService` lo pone igual al
  `distritoId` cuando cambia la ubicación (R26), y `OrdenRepository.corregirDatosCliente` lo incluye en
  el mismo `updateMany`.

### 3.3 Convivencia con el trigger de SLT-43 (R27, R28)

El trigger `orden_nodo_geografico` es `BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id,
nodo_geografico_id` y hace `NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id)`: pisa
siempre lo que mande la app. **No se cambia.** Con la derivación de §3.1 el valor que escribe la app
coincide siempre con el del trigger:

- profundidad 3: app = nodo = `distrito_id` = `COALESCE(...)`;
- profundidad 2: app = nodo = `canton_id`, `distrito_id` NULL → `COALESCE(...)` = `canton_id`.

Así «escribir `nodo_geografico_id` y las 3 FK» no necesita tocar la base: la app escribe el valor
correcto y el trigger lo garantiza. El test de integración de R27 crea y corrige órdenes de profundidad
3 y 2 (la de profundidad 2, por el repositorio: hasta SLT-46 ningún cantón tiene zona) y comprueba `nodo_geografico_id = COALESCE(distrito_id, canton_id)` y que es el nodo resuelto; el
de R28 lee `pg_get_functiondef('orden_nodo_geografico')` y comprueba que sigue derivando de las FK.

Cuando SLT-46 cambie el trigger para respetar el nodo que llega, la app ya lo manda: no hay que tocar
SLT-45.

## 4. Rutas de v2

### 4.1 Operaciones (R10)

| Operación | Ruta | Archivo | Reutiliza |
|---|---|---|---|
| Crear una orden | `POST /api/v2/ordenes` | `app/api/v2/ordenes/route.ts` | pipeline de carga v1 con una fila |
| Carga por lote | `POST /api/v2/ordenes/carga` | `app/api/v2/ordenes/carga/route.ts` | `handleCargaApi` |
| Cotización | `POST /api/v2/ordenes/cotizacion` | `app/api/v2/ordenes/cotizacion/route.ts` | `handleCotizacionApi` |
| Consulta de una orden | `GET /api/v2/ordenes/{id}` | `app/api/v2/ordenes/[id]/route.ts` | `handleConsultaOrdenApi` |
| Catálogo | `GET /api/v2/geografia?pais=` | `app/api/v2/geografia/route.ts` | nuevo `GeografiaApiService` |

`carga` y `cotizacion` son segmentos estáticos y ganan a `[id]` en el App Router (mismo precedente que
v1). `{id}` acepta guía o remisión, con la precedencia de la 177 (`idOrdenApiSchema`).

**Reutilización sin tocar el contrato de v1.** `handleCargaApi` y `handleCotizacionApi` ganan un tercer
parámetro opcional `version: "v1" | "v2"` (por defecto `"v1"`). Con `"v1"` el código que corre es el de
hoy línea por línea; con `"v2"` cambia solo el schema del cuerpo, el extractor de ubicación y el
añadido de `ubicacion` en la salida. El contrato congelado (§7) prueba que la rama `"v1"` no cambió.

### 4.2 Cuerpos (zod en el borde, `lib/types/api-v2.ts`)

- **Fila v2** (`FilaV2`): las mismas claves de texto que `CargaRow` de v1 **sin** `provincia`, `canton`
  ni `distrito`, más:
  - `ubicacion?: string[]` — 1 a 10 nombres, cada uno de 1 a 200 caracteres, de la raíz hacia abajo;
  - `ubicacion_codigo?: string` — 1 a 64 caracteres.

  El tope de 10 niveles es defensivo (el máximo de hoy es 3; la épica no fija uno). Un tipo incorrecto
  (`ubicacion` que no es lista de textos) es 422 del lote, como un valor no texto en v1. «Las dos o
  ninguna» es error **de fila** (R12), para que una fila mala no tumbe el lote, como en v1.
- **Lote v2**: `{ ordenes: FilaV2[1..MAX_CHUNK_ROWS], name?, download_type? }` (igual que v1).
- **Crear una orden**: `{ orden: FilaV2, name?, download_type? }`. Se pasa al pipeline como lote de una
  fila (R18): crea su `carga` de una orden, emite etiquetas y manifiesto igual que el lote.
- **Cotización v2**: `{ ordenes: FilaV2[] }` con el tope de v1.

Internamente la fila v2 viaja como `{ campos: RawRow; ubicacion: EntradaUbicacion | ErrorDeEntrada }`.
`IBulkOrdenService` gana `cargarViaApiV2(filas, actor, { name })` e `ICotizacionOrdenService` gana
`cotizarV2(filas, actor)`; los métodos de v1 no cambian de firma.

### 4.3 Respuestas

- **Lote y crear** (R17, R18): `CargaResponseV2` = `CargaResponse` de v1 + `ordenes[].ubicacion`. Los
  errores de ubicación van en `errores[].errores.ubicacion` (no en `provincia`/`canton`/`distrito`).
- **Cotización** (R19): `CotizacionResponseV2` = `CotizacionResponse` de v1 + `filas[].ubicacion`. Los
  importes salen del mismo `CotizacionOrdenService` con la misma tarifa (`resolveTarifa(tienda, zona,
  distritoId)`).
- **Consulta** (R20): `OrdenDetalleV2` = `OrdenDetalle` de v1 + `ubicacion`. El lugar de la orden se lee
  con `lugarDeLaOrden` (las FK viejas, como SLT-44 R12) por un método nuevo
  `OrdenRepository.findLugarDeOrdenForOwner(actor, ordenId)`, con el dueño forzado igual que
  `findDetalleByOrdenIdForOwner`; la ruta, con `rutaPublica` sobre el catálogo de la empresa.
- **`UbicacionDTO`** (R21):

```json
{ "profundidad": 3, "id": "…", "nombre": "Occidental", "codigoOficial": "30101",
  "tipo": { "clave": "nivel_3", "nombre": "Distrito" } }
```

El nombre es el **actual** del nodo (no una foto); el código puede ser `null`.

### 4.4 Autenticación y middleware (R11)

Cada ruta v2 sigue el orden de v1: `extraerBearer` → `buildAutenticar` (incluye el módulo de API
apagado) → 401/403 → `conEmpresaDeLaKey`. `middleware.ts` gana `/api/v2` en `SELF_AUTH_ROUTES`: todo
v2 es por API key. La guardia de la 229 (`rastreo-sin-ruta-nueva`) tiene esa lista firmada como
literal: se actualiza en el mismo commit, que es lo que esa guardia pide.

## 5. Mensajes exactos

Sin tildes, como los mensajes de v1. `{n}` es el nivel 1-based; `{padre}` es el nombre del nodo del
nivel anterior tal como está en el catálogo.

| Caso | Clave | Mensaje |
|---|---|---|
| Ni `ubicacion` ni `ubicacion_codigo`, o las dos (R12) | `ubicacion` | `indica ubicacion o ubicacion_codigo, uno de los dos` |
| Nombre vacío en la ruta | `ubicacion` | `nivel {n}: el nombre esta vacio` |
| No encontrado (raíz) | `ubicacion` | `nivel 1: '{nombre}' no encontrado` |
| No encontrado (n > 1) | `ubicacion` | `nivel {n}: '{nombre}' no encontrado en '{padre}'` |
| Ambiguo (raíz / n > 1) | `ubicacion` | `nivel {n}: '{nombre}' es ambiguo` / `nivel {n}: '{nombre}' es ambiguo en '{padre}'` |
| Retirado | `ubicacion` | `nivel {n}: '{nombre}' esta retirado del catalogo` |
| Código no encontrado | `ubicacion` | `ubicacion_codigo '{codigo}' no encontrado` |
| Código ambiguo | `ubicacion` | `ubicacion_codigo '{codigo}' es ambiguo: lo comparten varios niveles` |
| Código retirado | `ubicacion` | `ubicacion_codigo '{codigo}' esta retirado del catalogo` |
| Regla de guardado (R5, R15) | `ubicacion` | `pais aun no habilitado: solo se aceptan ubicaciones de nivel 2 o 3 en paises de 3 niveles` |
| Sin zona (R16) | `ubicacion` | `la ubicacion '{nombre}' no tiene zona asignada` |
| Sesión: valor tras columna vacía (R31) | la columna vacía | `{columna} es obligatoria si se indica {columna_siguiente}` |
| Sesión: todas las columnas de nivel vacías (R31) | la primera columna de nivel | `{columna} es obligatoria` (añadido en T6.2; humano 2026-11-06) |

En la cotización las claves y mensajes son los mismos, dentro de `errores[]` como en v1. Los mensajes
de v1 (R3) son los de `geo-resolucion.ts` y no cambian.

## 6. Catálogo `GET /api/v2/geografia?pais=` (R22, R23)

- **Query** (zod): `pais` obligatorio, `^[A-Z]{2,3}$` (los ids de `pais` son códigos como `CR`). Falta o
  no encaja → 422 con `fieldErrors.pais`.
- **Servicio** `GeografiaApiService.catalogo(actor, paisId)` (`lib/services/GeografiaApiService.ts`,
  interfaz en `lib/interfaces/services/IGeografiaApiService.ts`): exige `actor.rol === "apiKey"` (como
  `CotizacionOrdenService`); lee `CatalogoGeograficoRepository.deLaEmpresa()`; si `catalogo.paisId !==
  paisId` → `not_found`, que el borde traduce al 404 uniforme (`NotFoundError`). Un país inexistente da el
  mismo 404 (pregunta abierta 1). El nombre del país sale de `PaisRepository.porId` (ya existe).
- **Respuesta 200**:

```json
{ "pais": { "id": "CR", "nombre": "Costa Rica" },
  "tipos": [ { "clave": "nivel_1", "nombreSingular": "Provincia", "nombrePlural": "Provincias" } ],
  "nodos": [ { "id": "…", "padreId": null, "profundidad": 1, "tipo": "nivel_1",
               "nombre": "Cartago", "codigoOficial": "3", "activo": true } ] }
```

  `activo` es el activo en cascada (SLT-44 R5); los retirados se listan con `activo: false`, igual que la
  ficha 374 «proyecta, no recorta». Orden: el del catálogo (por nombre e id). Sin paginación: un país son
  unos 600 nodos.

## 7. Contrato congelado de v1 y payloads reales

### 7.1 Script `scripts/geo-payloads-contrato-v1.ts` (R6–R8)

`pnpm geo:payloads-contrato --copia <host> [--muestra 200] [--salida tests/fixtures/contrato-v1/payloads-reales.json]`

- Lo ejecuta **una persona** sobre la copia de producción del ensayo, nunca sobre producción (decisión
  del 2026-11-05; épica, punto 5). `--copia` debe ser igual al host de `DATABASE_URL`; si falta o no
  coincide, se niega antes de abrir ninguna lectura de órdenes (R8). Es la misma idea que `--destino` de
  `geo-backfill-nodo.ts`.
- Todas sus lecturas van en transacciones `READ ONLY` (patrón de `geo-equivalencia-dinero.ts`); no
  escribe en la base. Solo escribe el archivo de salida.
- Toma una muestra de órdenes vivas (de varias empresas de Costa Rica), y por cada una arma la fila v1
  de carga y la de cotización con los nombres de su provincia, cantón y distrito.
- **Anonimización (R7)**: destinatario → `Destinatario {k}`, teléfono → `8000{kkkk}`, dirección →
  `Direccion {k}`, notas → `Nota {k}` (o ausente si no había), producto → `Producto {k}`, remisión →
  `R-{k}`. Las zonas se exportan como `zona_{j}` con su `esCentral` y la marca especial de cada distrito
  citado, sin nombre ni id. Ningún id de empresa, tienda u orden sale de la base. Se conservan peso,
  monto a cobrar y los nombres de la geografía (no son datos personales).
- Por consola imprime solo cifras (órdenes leídas, filas escritas, distritos y zonas distintas).

### 7.2 Fixtures y siembra

`tests/fixtures/contrato-v1/`:

- `payloads-sinteticos.json` — los escribe el implementer: todos los caminos de `resolveGeo` (los 11
  mensajes y su precedencia), acentos, mayúsculas, dobles espacios, retirados, distrito sin zona, zona
  especial, tarifa ausente (409 de cotización), lote vacío y cuerpo inválido (422), duplicados, tope.
- `payloads-reales.json` — lo deja el script (§7.1). Hasta que una persona lo genere y lo suba, el
  archivo existe con `[]` y la suite lo reporta como «0 payloads reales» sin fallar; la task T9 lo exige
  antes del merge (es puerta de release, no de código).
- `respuestas/<payload>.json` — las respuestas grabadas.
- `BASE` — el sha del commit con el que se grabaron (la base de esta rama antes de la feature).

La suite siembra con las fábricas de test: una empresa de Costa Rica (la geografía de CR viene de la
migración `20260713005000_seed_geografia_cr`), una tienda con su key, y las zonas y marcas del fixture
con tarifas fijas.

### 7.3 Suite `tests/integration/api/contrato-v1.route.test.ts` (R2, R9)

- Por cada payload llama a `handleCargaApi` y `handleCotizacionApi` reales contra Postgres y compara
  status + cuerpo serializado con `respuestas/<payload>.json`, **byte a byte** tras normalizar.
- **Campos volátiles (lista cerrada):** todo valor con forma de UUID, `numGuia`, `cargaId`, los valores
  de `url` y `downloadUrl`, y toda fecha ISO. Cada valor distinto se sustituye por `<tipo#k>` según su
  orden de aparición, así que se sigue comprobando qué valores son iguales entre sí. Nada más se
  normaliza: mensajes, claves, orden de claves e importes van tal cual.
- **Grabación:** con `CONTRATO_V1_GRABAR=1` la suite escribe las respuestas en vez de comparar. Se graba
  **una vez**, en la task T1, sobre el commit `BASE` y antes de tocar código. Para los payloads reales
  que lleguen después, la persona graba en un `git worktree` de `BASE` (instrucciones en la cabecera de
  la suite) y sube las respuestas con el fixture.
- Un payload sin respuesta grabada es un fallo (R9).

### 7.4 OpenAPI de v1 congelado (R1)

En T1 se graba `tests/fixtures/contrato-v1/openapi-v1.json`: los paths `/api/ordenes/api-key/**` del
objeto TS y la clausura de los schemas que referencian. `tests/unit/api/openapi-v1-congelado.test.ts`
lo compara con el objeto actual y con el bloque equivalente del `.yaml`.

## 8. Plantilla de la carga masiva (R29–R31)

- **Función pura** `columnasGeoDePlantilla(catalogo)` en `lib/utils/plantilla-geo.ts`:
  - **Forma CR** (3 niveles y tipos de profundidad 1, 2 y 3 cuyo `nombreSingular` normalizado es
    `provincia`, `canton`, `distrito`) → `null`: se usa la plantilla de hoy (`ORDENES_BULK_FIELDS`,
    `provincia` + `canton_distrito`), sin tocar nada.
  - **Otro país** → una columna por profundidad 1..max. El tipo de una profundidad es el de sus nodos; la
    cabecera es su `nombreSingular` con `normalizeName` y espacios a `_` (`departamento`, `municipio`).
    Si los nodos de esa profundidad tienen más de un tipo, o la cabecera choca con otra columna de la
    plantilla, se usa `nivel_{n}`. El ejemplo de cada columna es el nombre del primer nodo activo de esa
    profundidad en el catálogo.
- **Pantalla**: `app/(app)/ordenes/page.tsx` (Server Component) calcula las columnas con el catálogo de
  la empresa y las pasa por props a `OrdenesListado`/`OrdenesModule` → `OrdenesCargaMasivaButton` →
  `OrdenesCargaUpload` y al exportador de errores. Sin la prop, los componentes usan los campos de hoy:
  sus tests no cambian. No hay pantalla nueva.
- **Servidor**: `app/api/ordenes/carga-masiva/chunk/route.ts` ya acepta `Record<string,string>`; el
  servicio elige el extractor según la forma del país (§2.3). `geoInputDesdeColumnasDeNivel` arma la ruta
  hasta la primera columna vacía y aplica la regla de huecos de R31.

## 9. Documentación del canal (R34, R35)

- `lib/api/openapi-spec.ts`: los 5 paths de v2 y los schemas `FilaV2`, `CargaRequestV2`,
  `CrearOrdenRequestV2`, `CargaResponseV2`, `CargaOrdenV2`, `CotizacionRequestV2`,
  `CotizacionResponseV2`, `CotizacionRowResultV2`, `OrdenDetalleV2`, `Ubicacion`, `GeografiaResponse`.
  Los v2 que extienden uno de v1 lo hacen con `allOf` + `$ref` al de v1, que así no se toca (R1).
  Espejo textual en `docs/api/api-key-openapi.yaml`.
- Guardias: `openapi-canal-rutas-reales` escanea también `app/api/v2/**`; el censo firmado
  `PATHS_ESPERADOS` de `openapi-177-paths-pdf-y-carga-id.test.ts` sube de 9 a 14 paths (alta escrita a
  mano, como pide esa suite; los dos `toHaveLength(9)` pasan a 14); test nuevo `openapi-v2.test.ts` con el contenido de cada operación.
- Postman: una carpeta «v2» con una petición por operación; test `postman-changelog-v2.test.ts`
  comprueba las 5 peticiones y la entrada del CHANGELOG.
- `docs/api/CHANGELOG.md`: entrada «2026-11-xx — API v2 (aditiva): ubicación por nodo», con la tabla de
  operaciones y la frase «v1 no cambia». La fecha es la de la release.
- La guía HTML/PDF no se toca (SLT-80).

## 10. Datos, empresa, autorización, migraciones y país

- **Modelo de datos.** Sin tablas ni columnas nuevas. Se escribe `orden.nodo_geografico_id` (columna de
  SLT-43, nullable, FK NOT VALID a `nodo_geografico`). `orden` ya tiene `organizacion_id` y RLS; las
  escrituras van por el pipeline de carga, dentro de `conEmpresaDeLaKey`.
- **Lecturas.** `nodo_geografico` y `tipo_nivel_geografico` son de plataforma con RLS por país de la
  empresa (SLT-43 R12): v2 solo ve el país de su empresa. Las zonas y marcas, por empresa (SLT-44 R9). El
  método nuevo `findLugarDeOrdenForOwner` filtra por dueño y corre bajo la RLS de `orden`.
- **Aislamiento (R24).** Test de integración con dos empresas: la key de A no ve zonas de B al resolver,
  no consulta órdenes de B (404) y su catálogo es el de su país.
- **Autorización.** En el service: `actor.rol === "apiKey"` en `cargarViaApiV2`, `cotizarV2` y
  `GeografiaApiService.catalogo`, como hoy en v1. El módulo de API apagado lo rechaza `buildAutenticar`.
- **Migraciones.** Ninguna (R28). Si el implementer encontrara que hace falta un índice, sería solo
  `CREATE INDEX` con `down.sql`, y se para a preguntar.
- **Qué depende del país.** La geografía (catálogo, tipos, forma de 3 niveles, plantilla) sale del país
  de la empresa (`organizacion.pais_id`). Moneda, impuestos y métodos de pago no cambian aquí: los
  importes salen de las tarifas como hoy.
- **Dependencias.** Ninguna librería nueva.

## 11. Alternativas descartadas

1. **Reescribir `resolveGeo` encima del motor de N niveles** (un solo motor también para v1). Es lo
   más limpio, pero pone los 11 mensajes de v1 detrás de una traducción, cambia la firma que usan
   `BulkOrdenService` y `CotizacionOrdenService` y los dobles de unos ocho archivos de test. Con un
   contrato congelado byte a byte para integradores en producción, el camino de v1 que menos se mueve
   es el más seguro. Las piezas comunes (`normalize`, activo en cascada, `zonaQueCubre`,
   `esZonaEspecial`) son las mismas funciones en los dos caminos, así que las reglas no se duplican;
   solo se duplica la secuencia de comprobaciones de tres niveles. Retirar `resolveGeo` le toca a la
   ficha que retire v1.
2. **Cambiar el trigger `orden_nodo_geografico` para respetar el nodo que manda la app.** Sería un
   `CREATE OR REPLACE FUNCTION` que cambia el comportamiento de un trigger ya desplegado: no es una
   migración aditiva y SLT-43 lo dejó para SLT-46. Con §3.1 el valor de la app y el del trigger
   coinciden siempre, así que no hace falta.
3. **«Crear una orden» con semántica REST propia** (201 creada, 409 duplicada, 422 con los errores de
   la fila). Es más idiomática, pero publica una segunda forma de reportar el mismo error en el mismo
   canal y obliga a un camino propio sin etiquetas ni manifiesto. Se elige la forma del lote (pregunta
   abierta 3).
4. **v2 en el mismo prefijo** (`/api/ordenes/api-key/v2/...`). No toca el middleware, pero mezcla las
   dos versiones en el árbol que el censo de v1 da por cerrado, y la tarjeta nombra `/api/v2/ordenes`.
5. **Catálogo de cualquier país leyendo como plataforma.** Exigiría salir del contexto de la empresa
   dentro de una petición de API key y saltar la RLS de SLT-43 R12 (pregunta abierta 1).
6. **Golden files generados por la propia suite en cada corrida.** Quedarían verdes siempre
   (aserción contra su propia fuente). Se graban una vez sobre `BASE` y no se regeneran.

## 12. Trazabilidad prevista

| Requisito | Test |
|---|---|
| R1 | `tests/unit/api/openapi-v1-congelado.test.ts` |
| R2, R9 | `tests/integration/api/contrato-v1.route.test.ts` |
| R3 | `tests/unit/services/geo-resolucion-v1-mensajes.test.ts` (los 11 mensajes y la precedencia) + R2 |
| R4 | tests de integración existentes de v1 (`tests/integration/api/ordenes-api-key-*.route.test.ts`), sin cambios |
| R5 | `tests/integration/api/v2-paises-de-prueba.route.test.ts` (bloque v1) |
| R6, R7, R8 | `tests/unit/scripts/geo-payloads-contrato-v1.test.ts` |
| R10, R11, R12, R17, R18 | `tests/integration/api/v2-ordenes.route.test.ts` |
| R13, R14, R15, R16 | `tests/unit/services/geo-ubicacion.test.ts` + `v2-ordenes.route.test.ts` |
| R19 | `tests/integration/api/v2-cotizacion.route.test.ts` |
| R20, R21 | `tests/integration/api/v2-consulta.route.test.ts` + `geo-ubicacion.test.ts` (`rutaPublica`) |
| R22, R23 | `tests/integration/api/v2-geografia.route.test.ts` |
| R24 | `tests/integration/api/v2-aislamiento.route.test.ts` |
| R25, R26, R27, R28 | `tests/integration/db/orden-nodo-escritura.test.ts` |
| R29, R30 | `tests/unit/utils/plantilla-geo.test.ts` |
| R31 | `tests/unit/services/bulk-orden-service.n-niveles.test.ts` |
| R32 | tests existentes de carga masiva (`carga-masiva-plantilla-roundtrip`, `carga-masiva-errores-roundtrip`, `bulk-orden-service*.test.ts`), sin cambiar aserciones |
| R33 | `tests/integration/api/v2-paises-de-prueba.route.test.ts` + `geo-ubicacion.test.ts` |
| R34 | `tests/unit/api/openapi-v2.test.ts` + `openapi-canal-rutas-reales.guardia.test.ts` + censo `openapi-177-paths-pdf-y-carga-id.test.ts` |
| R35 | `tests/unit/api/postman-changelog-v2.test.ts` |
| R36 | gate completo de CI (E2E existentes), sin E2E nuevo |

Los países de prueba de 2 y 4 niveles se siembran con `tests/fixtures/paises-de-prueba-geo.ts`: inserta
el `pais` (el trigger de SLT-43 le crea tres tipos), los tipos que falten y los nodos directamente en
`nodo_geografico` con el rol de migraciones (la app no puede escribir ahí, SLT-43 R12), y una empresa con
su key en ese país. No se activan fuera de los tests.
