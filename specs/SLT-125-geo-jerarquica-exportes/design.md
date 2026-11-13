# SLT-125 — geo-jerarquica-exportes · design.md

> Requisitos: `requirements.md` (R1–R44). P1–P6 las respondió el humano el 2026-11-12 y están en
> «Decisiones cerradas»; este diseño ya las aplica. Escrito por `spec_author` el 2026-11-12 sobre
> `dfdd78de`. El MCP del grafo no tenía indexado este worktree: la exploración se hizo con Grep y Read.
> El inventario previo del leader (`inventario125.md`) no estaba en el scratchpad y se rehízo.

## Lo que ya existe

Buscado `ubicacion_snapshot`, `geografiaLegible`, `construirQueryDireccion`, `rutaDelLugar`,
`columnasDescarga*`, `CANTÓN · DISTRITO` y `{provincia}` en `feature_list.json`, `specs/` y el código.

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| SLT-47 «Geografía jerárquica: presentación (filtros)» partió esta ficha y le dejó explícitamente descargas, etiqueta, PDF, tarjetas, chat, detalle de gestión, nombres del listado, `ubicacion_snapshot` y geocodificación (su R40) | `specs/SLT-47-geo-jerarquica-presentacion/requirements.md` | No se re-crea nada de SLT-47. Se reutilizan `rutaDelLugar` y `PasoDeRuta` (`lib/repositories/_shared/ruta-del-lugar.ts`), `lugarRuta` en `NovedadDTO` y `MiAsignacionDTO`, y `useNivelesGeograficos` / `NivelDeFiltroDTO` (los tipos del país en el cliente) |
| SLT-48 «Geografía jerárquica: retirar modelo viejo» | `feature_list.json` | Fuera de alcance (R44): no se borran columnas ni tablas, y `cierre_detail` conserva sus 3 columnas de nombre también allí |
| Forma de `ubicacion_snapshot` (SLT-43 §2.6) y su escritor por lotes, `geo:backfill` | `specs/SLT-43-geo-jerarquica-modelo/design.md §2.6`; `scripts/geo-backfill-nodo.ts:138` | Se usa la misma forma (R21) y el mismo resultado en Costa Rica (R22). El script no cambia |
| Columna `cierre_detail.ubicacion_snapshot` (JSONB NULL) | `db/schema.prisma:3512`, migración `20261104120400` | Ya existe: esta feature no añade migraciones (R39) |
| Cabeceras de nivel por país y `nivel_<n>` cuando chocan | `lib/utils/plantilla-geo.ts` (`cabeceraDeNivel`, `cabeceraDeTipo`), SLT-45 R30 | Se reutiliza la regla. La normalización de `cabeceraDeTipo` sirve para *comparar* (R2); el texto que se escribe es el `nombre_singular` sin normalizar, como hoy hacen las etiquetas |
| Catálogo en memoria (`ancestros`, `nodo`, `nodosDeProfundidad`) | `lib/services/geografia-dominio.ts` | Única fuente de la ruta (R16, R19) |
| Lugar de una orden (`lugarDeLaOrden`) | `lib/repositories/_shared/lugar-orden.ts` | Se usa tal cual, sin leer `orden.nodo_geografico_id` (P1 = B). La ruta llega como mucho al nivel 3 hasta SLT-48 |
| Etiquetas de nivel de 3 valores (`EtiquetasGeograficas`, `etiquetasDePais`, `ETIQUETAS_NEUTRAS`) | `lib/types/pais.ts` | Siguen para lo que ya las usa. Las superficies de N niveles toman los tipos de `NivelDeFiltroDTO` o de `catalogo.tipos` |
| Nombres de la ruta ya sacados del catálogo | `InformeTransitoRepository` (SLT-71) y `CierreDiaRepository.leerDescriptivosDeOrdenes` (SLT-65) | Se amplían a la ruta completa; no se duplica la lectura |

## 1. Resumen

Una sola pieza nueva, pura y sin I/O: **`lib/utils/ubicacion-presentacion.ts`**. Recibe una ruta (los
nombres del nivel 1 al lugar) y los niveles del país, y devuelve lo que cada superficie pinta:

- las celdas y cabeceras por nivel;
- la línea de ubicación con su separador;
- los dos niveles más hondos;
- la ruta invertida para el destino y la geocodificación.

Cada superficie conserva su separador y su orden de hoy. Lo único que cambia es de dónde salen los
nombres (la ruta del catálogo) y cuántos son (P).

En el servidor, cada lectura que hoy nombra lugares con las relaciones de Prisma `provincia`, `canton`
y `distrito` pasa a nombrarlos con la ruta del catálogo:

- el listado de órdenes, satélite y etiqueta (`OrdenRepository`);
- el detalle de gestión (`GestionOrdenRepository`);
- el cierre de día (`CierreDiaRepository`);
- el envío de WhatsApp (`OrdenEnvioReader`);
- la geocodificación (`OrdenGeocodeRepository`).

Los DTO ganan `lugarRuta` y sus campos de nombre de hoy se llenan desde la misma ruta, así que no
cambian de forma (R37).

Los cierres nuevos escriben `ubicacion_snapshot` en la misma transacción. Los cierres admin lo leen y,
si falta, usan las 3 columnas.

No hay migraciones, ni dependencias nuevas, ni escrituras nuevas de datos de negocio fuera del
snapshot.

## 2. Modelo de datos, empresa y país

- **Sin cambios de esquema (R39).** `cierre_detail.ubicacion_snapshot` ya existe. No hay `down.sql`
  porque no hay migración.
- **Multi-empresa.** Todas las lecturas corren en el contexto de la empresa (`conEmpresa`). El catálogo
  es el del país de la empresa (`CatalogoGeograficoRepository.deLaEmpresa()`, RLS por país), y en
  plataforma lanza `EmpresaNoResuelta` (R40). `cierre_detail` ya tiene RLS por `organizacion_id`; el
  snapshot se escribe en la fila de la empresa que cierra.
- **Qué depende del país (`docs/perfil-agentes.md > spec_author`):**

  | Dato | De dónde sale |
  |---|---|
  | P y el tipo del nivel k | `catalogo.tipos` (clave `nivel_k`), en el servidor; `useNivelesGeograficos()` (`NivelDeFiltroDTO`), en el cliente |
  | Nombres de lugar | La ruta del catálogo (`rutaDelLugar`) |
  | Nombre del país en la geocodificación | `pais.nombre` del país de la empresa (R32). En Costa Rica es `'Costa Rica'` (migración `20261026130000_pais`), la misma cadena que hoy está fija en `direccion-query.ts` |
  | Tipo congelado en el snapshot | `nombre_singular` del tipo `nivel_k` en el instante del cierre |

  Moneda, impuestos y métodos de pago no se tocan.
- **Autorización.** No hay entradas nuevas: cada superficie conserva su action o su route, y su
  resolución de alcance (R41). Ningún módulo nuevo debe estar encendido.
- **Sin datos personales nuevos (R41).** `lugarRuta` lleva ids y nombres de lugar que las superficies
  ya pintan.

### 2.1 La forma de `ubicacion_snapshot` (heredada, R21)

```json
{ "v": 1, "niveles": [ { "profundidad": 1, "tipo": "Provincia", "nombre": "San José", "id": "…" }, … ] }
```

- Un nivel por paso de la ruta, de la raíz a la hoja.
- `nombre` es el mismo que va a `provincia_nombre`, `canton_nombre` y `distrito_nombre` en los
  niveles 1 a 3: los dos salen del mismo `congeladoDeLaFila`.
- `id` es el del nodo, que coincide con el FK de la orden, igual que en el backfill (§2.6 de SLT-43).
  Como la ruta sale de `lugarDeLaOrden` (P1 = B), el snapshot tiene como mucho 3 niveles hasta
  SLT-48, también en un país de 4.
- `tipo` es el `nombre_singular` de `nivel_k` en ese instante.
- Lo valida `ubicacionSnapshotV1Schema` (zod, `lib/types/ubicacion-snapshot.ts`). Sirve para leer
  (R24, R25) y, en los tests, para escribir.

## 3. Núcleo puro: `lib/utils/ubicacion-presentacion.ts` (nuevo)

Sin Prisma ni React. Lo importan el cliente y el servidor (como `filtro-ubicacion.ts`). Contrato:

```ts
export interface NivelDelPais { profundidad: number; singular: string }   // = NivelDeFiltroDTO sin plural
export type Ruta = readonly { id: string | null; nombre: string }[];      // nivel 1 → lugar

// R1–R3: cabeceras y claves de las columnas de nivel.
export function columnasDeNivel(
  niveles: readonly NivelDelPais[],
  otrasCabeceras: readonly string[],
): { clave: string; encabezado: string }[];
// clave: provincia | canton | distrito | nivel_<k>; encabezado: singular o nivel_<k> si choca.

// R1: celdas por nivel; '' → null (celda vacía) donde la ruta no llega.
export function celdasDeNivel(ruta: Ruta, niveles: readonly NivelDelPais[]): Record<string, string | null>;

// R7–R9: zona + ruta, sin tramos vacíos; null si no queda nada.
export function lineaDeUbicacion(zona: string | null, ruta: Ruta, separador: string): string | null;

// R11, R13: los 2 niveles más hondos de la ruta DE LA ORDEN (decisión del 2026-11-12).
// D = min(P, 3) mientras la ruta llegue como mucho al nivel 3 (hasta SLT-48).
export function dosMasHondos(ruta: Ruta, P: number): { arriba: string | null; abajo: string | null };

// R13: los tipos de los niveles D−1 y D, para el título del PDF de tránsito.
export function tiposDeDosMasHondos(niveles: readonly NivelDelPais[]): [string, string];

// R14, R32: del más hondo al nivel 1.
export function rutaInvertida(ruta: Ruta): string[];
```

- **Los 2 más hondos son los de la ruta de la orden, no los del país (decisión del 2026-11-12).**
  Las tarjetas, el chat y el PDF muestran siempre dos lugares.
  - En un país de 4 niveles, los niveles 2·3 (comuna · barrio) hasta SLT-48.
  - En CR, cantón · distrito, como hoy.
  - En un país de 2 niveles, los niveles 1·2.
  - Con la propuesta de P7 (opción a), `dosMasHondos` toma los pasos de la ruta en los niveles D−1 y
    D, con D = min(P, 3), y omite el que falta. Una orden de CR sin distrito da
    `{ arriba: cantón, abajo: null }`, igual que hoy.
  - Si P7 se responde con la opción b, toma los dos últimos pasos de la ruta, sean cuales sean, y la
    orden de CR sin distrito pasa a «provincia · cantón».

  Es una sola función: la respuesta a P7 cambia solo su cuerpo y sus tests.
- **Comparación para el choque (R2):** `normalizeName(x).replace(/ /g, "_")`, la misma de
  `plantilla-geo.ts`. Para no duplicarla, se exporta de ahí como `cabeceraNormalizada`.
- **Por qué existe el módulo.** Hoy hay 9 copias de «zona, provincia, cantón, distrito filtrados y
  unidos» (novedades, ayuda, cierre de día ×2, cierres admin ×2, satélite, etiqueta y `/paquete`).
  Reescribirlas para N niveles una por una daría 9 versiones que divergen. Cada superficie pasa a
  llamar al núcleo con su separador de hoy.

## 4. Servidor

### 4.1 La ruta de una orden

`lib/repositories/_shared/ruta-del-lugar.ts` gana:

- `rutaConTipos(cat, ruta)`: añade a cada paso su profundidad y su tipo. Lo usan el snapshot y el
  PDF de tránsito.
- `nivelesDelCatalogo(cat): NivelDelPais[]`: los tipos `nivel_1..P`, ordenados.
- `rutaDelLugar` no cambia: sigue saliendo de `lugarDeLaOrden` (P1 = B). Ningún archivo de esta
  feature lee `nodo_geografico_id` de `orden`, y la guardia `geografia-lecturas-sin-nodo-fk` se amplía
  sin excepciones (R19).
- En un país de P > 3 niveles, la ruta llega como mucho al nivel 3. Las columnas y campos de los
  niveles 4 a P existen (cabecera y rótulo), pero salen vacíos o con «—» hasta SLT-48. Las
  superficies de «dos más hondos» (R11) muestran los niveles 2·3 de la ruta de la orden, y el título
  del PDF de tránsito usa los tipos de esos dos niveles («COMUNA · BARRIO»).

### 4.2 Lecturas que cambian (R16, R20, R37)

En todas, el catálogo se carga una vez por repositorio y petición (`deLaEmpresa` ya memoriza), y se
nombra en memoria. Desaparecen las relaciones de Prisma `provincia`, `canton` y `distrito` de cada
`select` o `include` de abajo, y se seleccionan los FK.

| Lectura | Archivo | Qué gana el DTO | Campos de hoy |
|---|---|---|---|
| Listado de `/ordenes` (`WITH_ESTATUS_Y_TIENDA`, `toListItemDTO`) | `OrdenRepository.ts:1131` | `lugarRuta` en `OrdenListItemDTO` | `relaciones.provincia/canton/distrito` = `{ id, nombre }` del nodo de nivel 1, 2 y 3 de la ruta (null si no llega) |
| Recepción satélite (`toBodegaSateliteRow`) | `OrdenRepository.ts:1828` | `lugarRuta` en `RecepcionSateliteDTO` | `provinciaNombre`, `cantonNombre` y `distritoNombre` de la ruta |
| Etiqueta (`WITH_ETIQUETA`, fila de etiqueta) | `OrdenRepository.ts:1400–1445` | `lugarRuta` en `EtiquetaRow` y `EtiquetaGuiaDTO` | ídem |
| Mis-asignaciones | `OrdenRepository.ts:5928–5988` | ya tiene `lugarRuta` | ídem |
| Detalle de gestión y novedades | `GestionOrdenRepository.ts:308–362` | ya tiene `lugarRuta` | ídem |
| Cierre de día en vivo (`WITH_DETALLE`, `toPendienteRow`) | `CierreDiaRepository.ts:576–625` | `lugarRuta` en `CierreGestionPendienteRow` / `CierreDetalleGestion` | ídem |
| Envío de WhatsApp | `OrdenEnvioReader.ts:62` | `lugarRuta` en `OrdenPlantillaDatos` | ídem |
| Geocodificación | `OrdenGeocodeRepository.ts:16` | `ruta: string[]` y `paisNombre` en `OrdenGeocodeRow` | Se retiran `provinciaNombre`, `cantonNombre` y `distritoNombre`: es interno, no es API |
| PDF de tránsito | `InformeTransitoRepository.ts:156` | `ruta` y `niveles` en `PaqueteTransito` | `canton` y `distrito` se mantienen y salen de la ruta |
| Cobertura | `CoberturaRepository.ts:48` | `ruta` en `CoberturaDistritoDTO` | `provincia`, `canton` y `distrito` de la ruta. Las filas (P5): `nodosDeProfundidad(cat, P)` en vez de `3`, activos e inactivos como hoy. En un país de 4 niveles son los sectores; su zona y su marca salen de la herencia del catálogo (SLT-44), igual que hoy para un distrito |

**No entran (P6, deuda en «Lo que NO entra»):**
- `OrdenRepository.ts:2899` (corrección de datos del cliente);
- `CorregirUbicacionAviso.tsx` y `CorregirDatosClienteModal.tsx`;
- `lib/types/historial-accion-etiquetas.ts`;
- las pantallas de tarifas y zonas;
- la plantilla de carga masiva.

**Lugar fuera del catálogo (R18).** La ruta sale `[]` y los nombres salen null. Hoy, con las relaciones
de Prisma, eso no podía pasar. Una superficie de presentación no debe caerse por un nodo inconsistente.
El cierre sí revierte, como hoy (`descriptivoDe` lanza).

**Equivalencia en Costa Rica (R17).** Hoy los nombres de las tablas viejas y los del nodo los mantiene
iguales la sincronía de SLT-43 y SLT-46. `geo-125-nombres-catalogo.test.ts` lo comprueba sobre el
fixture, y el script de R34 sobre la copia de producción.

### 4.3 El snapshot al cerrar (R21–R23, R27)

- `leerDescriptivosDeOrdenes` ya carga el catálogo dentro de la transacción. `congeladoDeLaFila`
  gana `ubicacionSnapshot`, armado con `rutaConTipos(catalogo, rutaDelLugar(catalogo, f.orden))`.
- Si la ruta sale vacía, lanza el mismo error que `descriptivoDe` y la transacción se revierte (R23).
- `crearCierre` (`CierreDiaRepository.ts:1609` y `1613`) lo manda en `createMany` y en
  `createManyAndReturn`.
- No hay trigger y no se toca ninguna fila existente (R27).
- **Equivalencia con el backfill (R22).** El test crea un cierre por el repositorio, guarda el
  snapshot, lo pone a NULL con SQL, corre la sentencia `cierre_detail` de `geo-backfill-nodo.ts` sobre
  esa fila y compara. Como la ruta sale de los FK (P1 = B), la igualdad es exacta en cualquier país.

### 4.4 Lectura del snapshot (R24–R26)

`lib/types/ubicacion-snapshot.ts`:

- `leerUbicacionCongelada(fila): Ruta`. Si `ubicacionSnapshot` cumple el esquema v1, devuelve
  `niveles.map(n => ({ id: n.id, nombre: n.nombre }))`. Si no, devuelve
  `[provinciaNombre, cantonNombre, distritoNombre]` sin los vacíos, con `id: null`.
- Nunca resuelve un nombre desde un id.

`CierresAdminRepository` (`:250` selecciona además `ubicacionSnapshot`; `:514` y `:900` mapean) pone
`lugarRuta` en `CierreDetalleGestion` y en `CierreGestionDescargaDTO`. Los campos de nombre de hoy
siguen saliendo de las 3 columnas, sin tocar (R37).

### 4.5 Geocodificación (R32, R33)

```ts
export interface ComponentesDireccion {
  direccion: string | null | undefined;
  /** Del nivel 1 al lugar. */
  ruta: readonly (string | null | undefined)[];
  paisNombre: string | null | undefined;
}
```

- `construirQueryDireccion` = `[direccion, ...ruta invertida, paisNombre]`, normalizados, sin vacíos y
  unidos por `", "`. En Costa Rica, con `ruta = [prov, cantón, distrito?]` y `'Costa Rica'`, da la
  misma cadena que hoy, y por tanto la misma huella.
- Se borra la constante `PAIS`.
- `encolarGeocodificacion` y `scripts/demo-qa/ubicar-y-cerrar-jobs.ts` solo miran si la dirección está
  vacía: pasan `ruta: []` y `paisNombre: null`, sin cambio de comportamiento.
- `paisNombre` lo lee `OrdenGeocodeRepository` con un `select` anidado
  `organizacion: { select: { pais: { select: { nombre: true } } } }`. Se verifica en T1.1 que la
  relación existe en `orden`.
- **Riesgo controlado.** Si el `pais.nombre` de CR en producción no es exactamente `Costa Rica`, todas
  las huellas cambian. El script de R34 lo cuenta antes del merge.

### 4.6 WhatsApp (R28–R31)

En `lib/types/plantilla-datos.ts`:

- `OrdenPlantillaDatos` gana `lugarRuta: { nombre: string }[] | null`.
- `provincia`, `canton` y `distrito` pasan a leer `lugarRuta[0..2]`. Si `lugarRuta` es null (vista
  previa sin ruta), caen a `provinciaNombre`, `cantonNombre` y `distritoNombre`: así ninguna vista
  previa ni envío de hoy cambia (R31).
- Se definen `nivel_1`…`nivel_10` (`leer: d => d.orden.lugarRuta?.[k-1]?.nombre ?? null`).
- Se define `ubicacion` (P3): `rutaInvertida(lugarRuta)` unida por `", "`, sin zona y sin vacíos. Su
  `ejemplo` es «Carmen, San José, San José», que sale de `DATOS_PLANTILLA_EJEMPLO`.
- **El selector (P2).**
  - `ubicacion` es un campo propio ofrecido: entra en `CAMPOS_PLANTILLA_OFRECIDOS`.
  - Los `nivel_k` llevan un atributo nuevo, `nivel: k`, y **no** entran en
    `CAMPOS_PLANTILLA_OFRECIDOS`, porque cuántos se ofrecen depende del país. Tampoco entran en
    `CLAVES_OCULTAS_EN_SELECTOR`, que es la lista de ocultos por pedido humano y sigue con 27.
  - `CampoVariablePicker` añade `nivel_1..P` con `useNivelesGeograficos()`, rotulados con el
    `singular` del nivel. Los pone justo después de `ubicacion`, el orden que fije la maqueta.
  - Sin proveedor de niveles (P = 0, como en los tests de hoy), el selector ofrece exactamente
    `CAMPOS_PLANTILLA_OFRECIDOS`.
  - El `nombre` de catálogo de `nivel_k` es neutro («Nivel k»): es el que ve quien mira el catálogo
    sin país.
  - `provincia`, `canton` y `distrito` siguen ocultas y siguen resolviendo.
- `catalogoDeVariables(null)` (informes, ficha 474) sigue siendo `CAMPOS_PLANTILLA_OFRECIDOS`: gana
  `ubicacion` por derivación.
- **`DATOS_PLANTILLA_EJEMPLO` gana `lugarRuta` con 3 niveles** (decisión A3b, 2026-11-12): «San
  José», «San José» y «Carmen».
  - `provincia`, `canton` y `distrito` resuelven igual que hoy.
  - `ubicacion` resuelve a «Carmen, San José, San José», que es su `ejemplo`.
  - `nivel_1`…`nivel_3` tienen de `ejemplo` «San José», «San José» y «Carmen».
  - `nivel_4`…`nivel_10` tienen `ejemplo: ""` y resuelven a vacío.

  Los dos tests de ejemplo de `plantilla-datos.test.ts` (`:40`, ejemplo no vacío; `:248`, resuelve
  exactamente a su ejemplo) dejan fuera esas 7 claves. Es la excepción autorizada A3b (§13.1).
- La vista previa del mensajero (`whatsapp-envio-valores.ts:104`) pasa `orden.lugarRuta` de
  `MiAsignacionDTO`, que ya lo trae.

## 5. Superficies del cliente

Todas toman P y los tipos de `useNivelesGeograficos()`. La ruta, del DTO.

| Superficie | Archivo | Cambio | Separador y orden de hoy |
|---|---|---|---|
| Descarga de órdenes | `ordenes-descarga-columnas.ts`, `OrdenesModule.tsx` | `columnasDescargaOrdenes(niveles)` sustituye las 3 por `columnasDeNivel` en su sitio; `filaDescargaOrden` usa `celdasDeNivel(lugarRuta)`. `COLUMNAS_DESCARGA_ORDENES` no cambia de nombre ni de archivo (canario de `columnas-asercion-de-orden.guardia`) | Columnas |
| Descarga de satélite | `satelite-descarga-columnas.ts`, `SateliteOrdenesListado.tsx` | ídem | Columnas |
| Descarga de cobertura | `cobertura-descarga-columnas.ts`, `DescargarCoberturaButton.tsx` | ídem; `motivoSinCoberturaLabel` por nivel: un motivo «<tipo> retirado/a del catálogo» por cada nivel de 1 a P (P5) | Columnas |
| Tabla de `/ordenes` y de satélite (P4) | `ordenes-columns.tsx` | Una columna por nivel, ids `provincia/canton/distrito/nivel_<k>` | — |
| Descargas de novedades y ayuda | `novedades-descarga-columnas.ts`, `ayuda-descarga-columnas.ts` | `lineaDeUbicacion(zona, lugarRuta, " · ")` | « · », zona primero |
| Cierre de día (descarga y pantalla) | `cierre-dia-descarga-columnas.ts`, `CierreDiaModule.tsx:485` | ídem | « · » |
| Cierres admin (fundida y detalle) | `cierres-gestiones-fundida-descarga-columnas.ts`, `cierre-detalle-shared.tsx:611` | ídem, con la ruta de §4.4 | « · » |
| Detalle de satélite | `RecepcionDetalle.tsx:30` | ídem | « · » |
| Etiqueta de guía (PDF y vista previa) | `lib/pdf/etiquetas-dibujo.ts:144`, `EtiquetaGuia.tsx` | `lineaDeUbicacion(zona, lugarRuta, " / ")` | « / » |
| `/paquete` | `app/paquete/[numGuia]/page.tsx:13` | ídem, «—» si null | « / » |
| Tarjeta de satélite | `SateliteOrderCard.tsx:94` | `dosMasHondos` | «arriba · abajo» |
| POS mosaico y bloque de navegación | `PosOrderCardMosaico.tsx:185`, `PosNavBlock.tsx:45` | ídem; el `ariaLabel` usa `arriba` donde hoy usa el cantón | «arriba · abajo» |
| POS detalle | `PosOrderCardDetalle.tsx:62` | ídem | « · » |
| Chat | `chat-format.ts:76` | ídem | «abajo · arriba» |
| Detalle de asignación | `AsignacionDetalle.tsx:116–126` | Línea «abajo, arriba»; rejilla de P campos rotulados (la maqueta fija columnas y salto de línea) | «, », más hondo primero |
| Destino de navegación | `pos-format.ts:60` | `[direccion, ...rutaInvertida]` | «, », más hondo primero |
| Tarjeta de novedad | `novedad-a-orden-card.ts` | Pasa `lugarRuta` a la tarjeta POS | — |
| Editor de plantillas | `CampoVariablePicker.tsx` | Ofrece `ubicacion` y `nivel_1..P`, rotulados por tipo (P2, §4.6) | — |

**Etiqueta con 10 niveles.** La línea de geografía pasa por el mismo recorte y filtro de caracteres
imprimibles que hoy (`nombre-imprimible-etiqueta`). Los tests de capacidad de la etiqueta
(`etiquetas-capacidad.test.ts`) deben seguir en verde con una ruta de 10 niveles. Si no cabe, se para
y se pregunta: no se cambia la maqueta de la etiqueta (`etiquetas-maqueta-unica.guardia`).

## 6. Contratos que cambian

| Contrato | Cambio | ¿Rompe? |
|---|---|---|
| `OrdenListItemDTO`, `RecepcionSateliteDTO`, `EtiquetaGuiaDTO`, `CierreDetalleGestion`, `CierreGestionPendienteRow`, `CierreGestionDescargaDTO`, `OrdenPlantillaDatos` | + `lugarRuta` | No: es aditivo |
| API v1 y v2 que exponen nombres de lugar | Mismos campos y, en CR, mismos valores (R37) | No |
| `OrdenGeocodeRow`, `ComponentesDireccion` | Nombres de 3 niveles → `ruta` + `paisNombre` | Interno; se ajustan los 4 llamadores |
| `PaqueteTransito` | + `ruta`; el título del PDF sale de `niveles` | Interno |
| `CoberturaDistritoDTO` | + `ruta` (P5) | Interno |
| Catálogo de variables de plantilla | + 11 claves; ninguna sale | No |
| Claves de columnas de descarga | `nivel_<k>` desde k = 4 | No: CR conserva las 3 de hoy |

## 7. Equivalencia de las descargas en Costa Rica (R4, R10, R26)

- **T1.2, antes de tocar código.** `tests/fixtures/descargas-cr/entrada.ts` declara un conjunto de DTO
  de Costa Rica con todas las variantes:
  - con y sin distrito;
  - con nombres con tilde;
  - con zona vacía;
  - cierres con snapshot y sin él.

  Un script de un solo uso (`scripts/capturar-referencia-descargas.ts`) pasa ese conjunto por las
  funciones de fila y columnas de hoy, y por `buildCsvRows` y `buildXlsxRows`. Guarda el CSV como texto
  y la matriz de celdas del XLSX en `tests/fixtures/descargas-cr/referencia.json`. Esa referencia se
  commitea antes del primer cambio de código y no se regenera nunca.
- **`equivalencia-descargas-cr.test.ts`** pasa el mismo conjunto, ya con `lugarRuta`, por el código
  nuevo, y compara:
  - el CSV, byte a byte;
  - del XLSX, cabeceras y celdas.

  El XLSX no se compara en bytes porque el libro lleva la fecha de creación en sus metadatos.
- **Con datos reales (R35).** `scripts/comparar-descargas.ts <a> <b>` compara dos archivos (CSV o
  XLSX) celda a celda. Solo imprime el recuento de celdas distintas y sus coordenadas, nunca el
  contenido. Una persona baja las 7 descargas de una empresa CR sobre la copia de producción con `dev`
  y con esta rama, y anota el resultado.

## 8. Script de equivalencia de nombres y geocodificación (R34)

`scripts/geo-equivalencia-presentacion.ts`, con el mismo arnés de solo lectura que
`geo-equivalencia-filtros.ts` (SLT-47):

- transacción `READ ONLY`;
- se niega a correr si la URL no es local, salvo `--destino` explícito para la copia, igual que
  `geo-backfill`.

Por cada empresa:

1. Carga el catálogo y lee las órdenes por lotes.
2. Cuenta en cuántas difiere algún nombre de la ruta del catálogo frente a las tablas viejas.
3. Cuenta en cuántas la consulta de geocodificación nueva difiere de la de hoy (calculada con la
   función de hoy, copiada en `scripts/geo-equivalencia/geocode-de-hoy.ts`).

Imprime solo cifras e ids de orden. Entrada en `package.json`: `geo:equivalencia-presentacion`.

## 9. Pantallas: maqueta (R36)

T0 arma una maqueta para un país de 2, 3 (CR), 4 y 10 niveles con:

- la tabla de `/ordenes` (P4);
- el detalle de asignación (rejilla de P campos en el ancho de un teléfono);
- las tarjetas POS y de satélite;
- el detalle de satélite y de cierres;
- `/paquete`;
- el selector de variables (P2).

Ningún commit de pantalla antes de su aprobación.

## 10. E2E nuevo (R43)

`e2e/geo-presentacion-4-niveles.spec.ts`. La empresa se siembra con SQL de test (no por la UI: la regla
de guardado de SLT-45 no deja crear órdenes en un país de 4 niveles):

- un país `XB` de 4 niveles («Región», «Comuna», «Barrio», «Sector»);
- una empresa, una zona, una tienda, un mensajero;
- dos órdenes en un barrio (nivel 3), con su `provincia_id`, `canton_id` y `distrito_id` (P1 = B: no
  hay órdenes de nivel 4 hasta SLT-48).

Pasos:

1. `/ordenes` → descarga XLSX → cabeceras «Región», «Comuna», «Barrio», «Sector» en el sitio de las 3
   de hoy. En cada orden, las 3 primeras celdas con la ruta y «Sector» vacía.
2. Etiqueta de guía de cada orden → la línea «zona / región / comuna / barrio».
3. El mensajero gestiona las dos órdenes y pide el cierre de día. El admin abre el cierre en
   cierres-admin → «Ubicación» = «zona · región · comuna · barrio». Por SQL de test se comprueba el
   `ubicacion_snapshot` de las dos filas: 3 niveles con tipos «Región», «Comuna» y «Barrio» y sus
   nombres.

Los E2E de CR no se tocan (R38): `cierre-dia`, `cierres-admin`, `etiquetas-lote-tienda`,
`mis-asignaciones`, `recepcion-satelite`, `asignacion-satelite`, `rastreo-publico`,
`dos-empresas-humo` y `geo-filtro-lugar`.

## 11. Alternativas descartadas

1. **Trigger en `cierre_detail` que llene el snapshot.** Necesita los tipos del país y la cadena de
   padres en SQL (una CTE recursiva o un bucle en PL/pgSQL). Es una migración nueva. Y los triggers son
   «el único punto que podría tumbar un flujo» de la épica (regla 6 de producción). Además, rompe la
   aserción de SLT-43 R40 «sin trigger en `cierre_detail`». La escritura desde la app usa el catálogo
   que el cierre ya carga, y no añade consultas.
2. **Una columna «Ruta» extra en lugar de una por nivel.** Más simple, pero contradice la decisión
   cerrada «una columna por nivel en el lugar de las 3 de hoy».
3. **Seguir con las relaciones de Prisma para los niveles 1–3 y usar el catálogo solo para el 4 en
   adelante.** Habría dos fuentes de nombres en la misma fila, y SLT-48 tendría que tocar cada lectura
   otra vez. La decisión pide «leídos del catálogo».
4. **Llevar el tipo en cada paso de `lugarRuta`.** Repite el mismo texto en cada fila de cada listado.
   El cliente ya tiene los tipos (`useNivelesGeograficos`, SLT-47). Solo el snapshot y el PDF de
   tránsito, que se arman en el servidor, los añaden (`rutaConTipos`).
5. **Calcular la consulta de geocodificación con los tipos («Distrito Carmen, …»).** Cambiaría la
   cadena de Costa Rica y vaciaría `GeocodeCache`. Lo prohíbe la decisión cerrada.
6. **Comparar el XLSX byte a byte.** El libro lleva la fecha de creación: daría un falso rojo en cada
   corrida. Se compara el CSV en bytes y el XLSX en celdas (§7).

Sin librerías nuevas.

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un nombre del nodo distinto del de su tabla vieja en producción (sincronía rota) cambiaría lo que se ve en CR | Script de R34 sobre la copia antes del merge; 0 esperado |
| `pais.nombre` de CR distinto de `Costa Rica` en producción invalidaría `GeocodeCache` | El script de R34 cuenta las consultas que cambian; 0 esperado. Si sale distinto, se para y se pregunta |
| Etiqueta con muchos niveles no cabe | §5: tests de capacidad con 10 niveles; si no cabe, se pregunta |
| Rendimiento del listado al nombrar con el catálogo | El catálogo ya se carga en esas lecturas (marcas de SLT-65). R20 lo vigila con un doble que cuenta |
| En un país de más de 3 niveles las columnas hondas salen vacías hasta SLT-48 (P1 = B) | Aceptado por el humano. La maqueta de T0 lo muestra; SLT-48 llena la ruta sin tocar estas superficies, porque todas leen `rutaDelLugar` |
| `nivel_4`…`nivel_10` sin ejemplo en el selector de un país de 4 o más niveles | Decisión A3b: aceptado por el humano |
| Tests que fijan la forma del `include` de Prisma | T1.1 los lista. Solo cambian con autorización (§13.1) |

## 13. Pruebas y trazabilidad

Fixture de integración: `tests/integration/db/_fixtures/geo-125.ts`, sobre `crearEscenarioGeo47` (CR y
`XA` con su nivel 4 «Sector»). Añade órdenes con y sin distrito, gestiones y un cierre.

| R | Test |
|---|---|
| R1–R3 | `tests/unit/descarga/geo-columnas-n-niveles.test.ts` |
| R4, R10, R26 | `tests/unit/descarga/equivalencia-descargas-cr.test.ts` + `tests/fixtures/descargas-cr/` |
| R5 | `tests/unit/components/ordenes-columns-niveles.test.tsx` |
| R6 | `tests/unit/descarga/cobertura-n-niveles.test.ts` |
| R7, R8 | `tests/unit/utils/ubicacion-presentacion.test.ts`, `tests/unit/descarga/ubicacion-n-niveles.test.ts`, `tests/components/ubicacion-pantallas-n-niveles.test.tsx` |
| R9 | `tests/unit/pdf/etiqueta-geografia-n-niveles.test.ts`, `tests/components/paquete-ubicacion.test.tsx` |
| R11, R15 | `tests/components/pos-satelite-chat-niveles.test.tsx` |
| R12 | `tests/components/AsignacionDetalle-niveles.test.tsx` |
| R13 | `tests/unit/whatsapp-envios/transito-pdf-niveles.test.ts` |
| R14 | `tests/unit/mis-asignaciones/pos-format-destino.test.ts` |
| R16–R18, R40, R41 | `tests/integration/db/geo-125-nombres-catalogo.test.ts`; `tests/unit/guards/presentacion-lugar-del-catalogo.guardia.test.ts` (los archivos de §4.2 no seleccionan las relaciones `provincia`, `canton` ni `distrito` para nombrar) |
| R19 | Guardias `geografia-sin-cte-recursiva` y `geografia-lecturas-sin-nodo-fk`, ampliadas |
| R20 | `tests/unit/repositories/ruta-sin-consulta-por-fila.test.ts` |
| R21–R23 | `tests/integration/db/geo-125-cierre-snapshot.test.ts` |
| R24, R25 | `tests/unit/types/ubicacion-snapshot.test.ts`, `tests/unit/descarga/cierres-snapshot-lectura.test.ts` |
| R27 | `geo-backfill.test.ts` R40, sin cambios; diff de `db/` |
| R28, R29, R31 | `tests/unit/whatsapp/plantilla-niveles.test.ts`; `plantilla-datos.test.ts` |
| R30 | `tests/unit/plantillas/CampoVariablePicker-niveles.test.tsx`; `CampoVariablePicker.test.tsx` (A4) |
| R32 | `tests/unit/geo/direccion-query.test.ts` (ampliado) |
| R33 | `direccion-query.test.ts` (cadena y huella literales de CR); `tests/integration/db/geo-125-geocode-cache.test.ts` (entrada de caché sembrada con la huella de hoy → el doble del proveedor no recibe llamadas) |
| R34 | `tests/integration/db/geo-equivalencia-presentacion.test.ts` |
| R35, R36 | Anotaciones en `progress/impl_SLT-125.md` |
| R37 | Suites de la API sin cambios |
| R38 | Gate completo de CI; diff de `tests/` contra §13.1 |
| R39, R44 | Diff revisado por el reviewer |
| R42 | `etiquetas-geograficas-sin-literal.guardia.test.ts` ampliada |
| R43 | `e2e/geo-presentacion-4-niveles.spec.ts` |

### 13.1 Aserciones existentes que cambian: necesitan autorización del humano (R38)

A3 y A3b están autorizadas (2026-11-12). Se espera que A1 y A2 no cambien: si el implementer
encuentra que deben cambiar, para y pregunta. Cualquier otra aserción que aparezca durante la
implementación también para y se pregunta.

| # | Test | Línea | Cambio | Por qué |
|---|---|---|---|---|
Líneas medidas sobre `3772e7a8`.

| # | Test | Línea | Antes → después | Por qué |
|---|---|---|---|---|
| A1 | `tests/integration/db/geo-backfill.test.ts` | 487 (título), 513 (`expect(r.recienCreada).toBeNull()`) | **Se espera sin cambio.** `cierreDetailNuevo` (`:131`) crea la fila con `tx.cierreDetail.create` directo, sin pasar por `crearCierre`, así que sigue naciendo NULL; y `:512` (`triggers` = 0) sigue cierto porque el snapshot lo escribe la app. Si hiciera falta cambiarlo, el implementer para y pregunta | Decisión `ubicacion_snapshot` |
| A2 | `tests/integration/db/geo-sincronia-orden-zonas.test.ts` | 240 (título), 259 (`toEqual([{ ubicacionSnapshot: null }, { ubicacionSnapshot: null }])`) | **Se espera sin cambio**, por lo mismo que A1: las filas son del escenario y no pasan por `crearCierre`. Si hiciera falta cambiarlo, el implementer para y pregunta: no está autorizado de antemano | Ídem |
| A3 | `tests/unit/types/plantilla-datos.test.ts` | 235–237 | **AUTORIZADO (2026-11-12).** Solo cambian:<br>· `:235`, título: «42 entradas, 37 propias y 5 alias» → «53 entradas, 48 propias y 5 alias»;<br>· `:236`: `toHaveLength(42)` → `toHaveLength(53)`;<br>· `:237`: `toHaveLength(37)` → `toHaveLength(48)`.<br>`:238` y el comentario de `:225–234` no se tocan | R29: `nivel_1`…`nivel_10` y `ubicacion` |
| A3b | `tests/unit/types/plantilla-datos.test.ts` | 40 y 248 | **AUTORIZADO (2026-11-12).** Los dos tests de ejemplo dejan fuera `nivel_4`…`nivel_10` (7 claves), que no tienen ejemplo:<br>· `:40`: `expect(campo.ejemplo.trim()).not.toBe("")` pasa a no aplicarse a esas 7 claves;<br>· `:248`: `it.each(CAMPOS_PLANTILLA)` pasa a recorrer `CAMPOS_PLANTILLA` sin esas 7.<br>Nada más cambia en esos dos tests | P3; decisión A3b |
| A4 | `tests/unit/plantillas/CampoVariablePicker.test.tsx` y `tests/unit/whatsapp-envios/catalogo-de-variables.test.ts` | Picker `:87–94` (R4: opciones = `CAMPOS_OFRECIDOS`, en su orden), `:133–141` (cada ofrecido se encuentra por nombre), `:109` (`CLAVES_OCULTAS_EN_SELECTOR.size` = 27); catálogo `:13` (`catalogoDeVariables(null)` = `CAMPOS_PLANTILLA_OFRECIDOS`) | **Sin cambio de texto.** Cambia el conjunto que afirman: `CAMPOS_PLANTILLA_OFRECIDOS` gana `ubicacion` y la lista ofrecida pasa de N a N+1. Como esas aserciones derivan de la constante, siguen en verde sin editarlas. `:109` sigue en 27, porque los `nivel_k` no entran en `CLAVES_OCULTAS_EN_SELECTOR` (§4.6). Los `nivel_1..P` no aparecen en estos tests porque se montan sin proveedor de niveles (P = 0). Se autoriza el cambio de lo que significan | P2 |

**Retiradas tras las respuestas del 2026-11-12:**
- **A5** (excepción en `geografia-lecturas-sin-nodo-fk.guardia.test.ts`): P1 = B. La guardia solo se
  amplía a los archivos nuevos, sin excepciones.
- **A6** (forma del `select` de Prisma): medido en `3772e7a8`, ninguno de los candidatos afirma la
  forma del `select` de lugar. `orden-envio-reader.test.ts:157` afirma solo `select.zona.select`.
  `:53–55` de ese test, `orden-repository.recepcion-satelite.test.ts:103–105` y `:195–197`, y
  `gestion-desde-ayuda-cierre.test.ts:104–106` son filas simuladas de entrada, y pasan a ir
  acompañadas de un catálogo con esos nombres. Las salidas esperadas no cambian: `:169–171` y `:203`
  del de satélite, y `:567–569` del de ayuda.
- **A7** (`geocodificacion-service.test.ts`): la consulta esperada es `QUERY =
  construirQueryDireccion(ORDEN)` (`:48`), derivada. Solo cambia la entrada `ORDEN` (`:40–46`), a
  `{ direccion, ruta: ["San José", "San José", "Carmen"], paisNombre: "Costa Rica" }`. La cadena literal
  de CR la fija `direccion-query.test.ts`, sin cambio de lo que espera.

**No cambian de aserción, solo de entrada** (los DTO de prueba ganan `lugarRuta`):

- `ordenes-descarga-columnas.test.ts`, `satelite-descarga-columnas.test.ts`, `cobertura-descarga-columnas.test.ts`;
- `novedades-descarga-columnas.test.ts`, `ayuda-descarga-columnas.test.ts`, `cierre-dia-descarga-columnas.test.ts`, `cierres-gestiones-fundida-descarga-columnas.test.ts`;
- `DescargarCoberturaButton.test.tsx`, `direccion-query.test.ts`;
- `tests/fixtures/plantilla-datos.ts` y los tests de etiquetas.

Si alguno necesitara cambiar lo que espera, es un hallazgo: se para.
