# SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» — requirements

Ruta: **ligera** (con una pregunta abierta sobre la ruta: la búsqueda toca servidor, ver abajo).
Requisitos: **R450-R459** (SLT-152 «Tablas de cierres legibles» usa R440-R449).

## Origen

Carlos, tras probar en Preview (2026-11-13): la cabecera del detalle del cierre se lee como
«Bodega central · Central Demo QA A · 693C96D7 · Solicitado 2026-11-13 17:41 · Aprobado 2026-11-13
17:41 por Maestro Demo QA A». Quien no conoce la app no sabe que «693C96D7» es el folio. Pide:
1. repartir la cabecera con rótulos, en todas las variantes del detalle único;
2. que el folio se quede y que el buscador de las colas de cierres encuentre un cierre por su folio.

## Lo que ya existe (evidencia)

- **De dónde sale el folio.** `folioCierre(id)` en `lib/utils/folio-cierre.ts`: los últimos 8
  caracteres del id del cierre, en mayúsculas (R156, SLT-113 R375). El «módulo del libro» que citan
  SLT-140 y SLT-141 usa esa misma función (`specs/SLT-140-excel-hojas-cierre-mensajeros/design.md:40`,
  `specs/SLT-141-excel-hojas-cierre-bodega/design.md:40`). El detalle la llama por `folioDe`
  (`components/private/cierres/detalle/detalle-cierre-vista.ts:161`); la cola la pinta con «#» delante
  (`folioCola`, `folioBodegaCola`, `folioConsolidable` en `components/private/cierres/cola/cola-cierres-vista.ts`).
  Para un cierre de mensajero el id es el de `cierre_dia`; para un cierre de bodega, el de `cierre_bodega`.
- **La cabecera hoy.** `LineaCabecera` en `components/private/cierres/detalle/DetalleCierre.tsx:254`
  junta `sub · folio · fechas` en un solo `<p>`. `sub` es el destino ya unido («Bodega central ·
  zona», `destinoLegible`) o, en bodega, `subtituloCierreBodega`; `fechas` sale de `fechasMensajero`
  / `fechasBodega` (`detalle-cierre-vista.ts:178-191`). Solo esos tres archivos la usan.
- **Búsqueda por folio ya hecha en `/cierre-dia`** (SLT-138 «buscador y filtros», R171):
  `normalizarFolio` (`lib/utils/folio-cierre.ts`), `idsDeCierresPorFolio` con `$queryRaw` y `strpos`
  sobre `right(id, 8)` (`lib/repositories/CierreDiaRepository.ts:829`), y la barra
  `FiltrosColaPropiaBarra` con `BuscadorFiltros` y el placeholder `BUSCA_POR_FOLIO` («Busca por folio»,
  `components/private/cierres/cola/cola-propia-vista.ts:180`). Esta ficha **no** la rehace: la reusa.
- **Las colas de `/cierres-admin` no buscan por texto, y filtran en SERVIDOR.**
  `FiltrosCierresBarra.tsx:69-72` y `:435` montan el campo de `BuscadorFiltros` con
  `onChange={SIN_BUSQUEDA}` (no hace nada). Las listas son paginadas en servidor: la clave de `useSWR`
  lleva `filtros` y llama a una Server Action (`CierresAdminModule.tsx:675-707`,
  `CierresBodegaAdminModule.tsx:342-373`, `ConsolidacionBodegaModule.tsx:342-366`). Filtrar en el
  cliente solo buscaría en la página visible. Por eso **buscar por folio exige tocar la consulta del
  servidor**: el esquema zod de los filtros (`lib/types/filtros-cierres.ts`), los tres servicios y los
  `where` de tres repositorios (`CierresAdminRepository.filtrosWhere`, `CierresBodegaAdminRepository.filtrosBodegaWhere`,
  `CierreBodegaRepository` `consolidablesWhere` / `cierresBodegaDeZonaWhere`). Sin migración ni
  cambio de esquema Prisma.
- Prisma no sabe expresar «contiene, solo en los últimos 8 del id» (lo dice `CierreDiaRepository.ts:818-820`);
  hace falta SQL a mano para leer los ids. `lib/db/excepciones-aislamiento.ts` solo puede bajar:
  `CierresAdminRepository.ts` ya está en `EXCEPCIONES_SQL_A_MANO`; `CierresBodegaAdminRepository.ts`
  y `CierreBodegaRepository.ts` no.

## Alcance

**Dentro:**
- La cabecera del detalle único (`DetalleCierre`) en todas sus variantes: cierre de mensajero visto
  por la central o la satélite, cierre de bodega visto por la central o la satélite, y `/cierre-dia`
  (cierre pasado, vencido, rechazado y el de hoy sin solicitar).
- La búsqueda por folio en las colas de `/cierres-admin`: cierres de mensajeros («Pendientes» y
  «Resueltos»), cierres de bodega de la central (cola y resueltos) y la consolidación de la satélite
  («A consolidar» y «Solicitados»). Las descargas de esas colas heredan el filtro.

**Fuera:**
- El título del detalle («Cierre de …», «Tu cierre del día», «Cierre de bodega · …»), la insignia
  de estado, la franja de avisos, las cifras, las pestañas y el pie: no cambian.
- `/cierre-dia` «Cierres solicitados»: ya busca por folio (SLT-138); no se toca.
- Las columnas y el aspecto de las tablas de las colas (es SLT-152 «Tablas de cierres legibles»).
- Cualquier cambio de modelo de datos, migración o dinero.

## Decisiones (tomadas aquí)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | La cabecera pasa a una lista de pares rótulo → valor (`<dl>`, un `<dt>` y un `<dd>` por par) que se reparte en varias columnas y salta de línea en el teléfono. | Un rótulo por dato es lo que pidió Carlos; `<dl>` da el par a los lectores de pantalla sin `aria-*` extra. |
| D2 | El folio va **primero** y con «#» delante (`#693C96D7`), igual que la columna «Folio» de las colas. | Es el dato que se busca: tiene que verse igual en la cola, en el detalle y en lo que se escribe en el buscador. |
| D3 | Un par sin dato **no se pinta** (ni rótulo vacío ni «—»). | Hoy ya se omiten las partes vacías (SLT-109 R241); un «Zona: —» en `/cierre-dia` sería ruido, porque ese DTO no trae la zona. |
| D4 | La búsqueda en `/cierres-admin` es **la misma de `/cierre-dia` (R171)**: quita espacios y un «#» inicial, pasa a mayúsculas y busca el texto **contenido** en los 8 caracteres del folio. Mayúsculas y minúsculas dan igual; vale un trozo del folio, no hace falta entero. | El placeholder «Busca por folio» ya existe con ese significado en `/cierre-dia`; que la misma frase busque distinto en otra pantalla confunde. Se reusa `normalizarFolio`, no se reescribe. |
| D5 | Se filtra en el servidor, con el folio dentro del `AND` de los demás recortes y del alcance. | Las colas paginan en servidor (ver evidencia): filtrar en cliente solo vería la página actual. |
| D6 | El SQL a mano que lee los ids por folio filtra `organizacion_id` en el texto, o vive en un archivo que ya está en `EXCEPCIONES_SQL_A_MANO`. La lista de excepciones **no crece**. | `lib/db/excepciones-aislamiento.ts`: «solo pueden BAJAR». |

## Requisitos (EARS)

### Cabecera del detalle

- **R450** — CUANDO la central o la satélite abren el detalle de un cierre de mensajero, la cabecera
  DEBE mostrar, en este orden, los pares: «Folio» → `#` + folio; «Destino» → «Bodega central» o
  «Bodega satélite»; «Zona» → el nombre de la zona de destino; «Solicitado» → fecha y hora de la
  solicitud. Y además:
  - DONDE el cierre está aprobado, DEBE seguir «Aprobado» → fecha y hora y «Aprobado por» → el nombre
    de quien lo aprobó;
  - DONDE está rechazado, DEBE seguir «Rechazado» → fecha y hora y «Rechazado por» → el nombre.
- **R451** — SI un par no tiene valor (zona vacía, sin fecha de resolución, sin nombre de quien
  resolvió o de quien marcó lo recibido), ENTONCES el sistema NO DEBE pintar ese par: ni su rótulo
  ni un valor de relleno.
- **R452** — CUANDO el mensajero abre en `/cierre-dia` uno de sus cierres ya solicitados, la cabecera
  DEBE mostrar los pares de R450 que su vista trae: «Folio», «Destino», «Solicitado» y, si está
  resuelto, «Aprobado» o «Rechazado» con su fecha y hora. DONDE el cierre está vencido, en lugar de
  «Solicitado» DEBE mostrar «Del día» → la fecha y hora del día que venció.
- **R453** — CUANDO `/cierre-dia` muestra el cierre de hoy aún sin solicitar, la cabecera DEBE mostrar
  «Folio» → «Solicitud nueva» y «Día» → «Hoy», sin «Destino» ni «Zona».
- **R454** — CUANDO la central o la satélite abren el detalle de un cierre de bodega, la cabecera
  DEBE mostrar, en este orden: «Folio» → `#` + folio; «Origen» → «Bodega satélite»; «Zona» → el
  nombre de la zona; «Solicitado por» → quien lo solicitó; «Mensajeros» → el número de mensajeros
  distintos; «Solicitado» → fecha y hora. DONDE ya tiene la marca de recibido, DEBE seguir
  «Recibido» → fecha y hora y «Recibido por» → el nombre.
- **R455** — La cabecera DEBE exponer cada par como término y definición (un `term` y un
  `definition` accesibles por par), y NO DEBE volver a pintar la línea única con « · » entre los
  datos.

### Buscar un cierre por su folio

- **R456** — CUANDO el usuario escribe en el buscador de la barra de filtros de `/cierres-admin`
  (cierres de mensajeros, cierres de bodega de la central o consolidación de la satélite), el campo
  DEBE decir «Busca por folio» y las dos listas de esa pantalla DEBEN mostrar solo los cierres cuyo
  folio contenga el texto normalizado como en R171 (sin espacios en los extremos, sin un «#» inicial,
  en mayúsculas), y volver a su página 1.
- **R457** — DONDE el texto del folio queda vacío tras normalizarlo, el filtro DEBE ignorarse.
  - SI tiene un carácter fuera de `0-9` y `A-F`, o más de 8 caracteres tras normalizar, ENTONCES el
    listado DEBE devolver cero cierres y `total` 0, sin consultar la base.
  - SI pasa de 20 caracteres antes de normalizar, ENTONCES el servidor DEBE responder `validation_error`.
- **R458** — El filtro por folio DEBE aplicarse dentro del alcance del actor y junto a los demás
  filtros (fecha, bodega, mensajero, estado): NO DEBE devolver ni contar un cierre de otra zona, de
  otra lista ni de otra empresa, y un texto que aparece en el id **fuera** de sus últimos 8
  caracteres NO DEBE hacer coincidir el cierre. El `total` DEBE ser el número de cierres que cumplen
  todo a la vez.
- **R459** — CUANDO el usuario descarga una de esas listas con un folio puesto, el archivo DEBE llevar
  los mismos cierres que la lista filtrada (todos, no solo la página). MIENTRAS no haya folio puesto,
  los listados y sus archivos DEBEN devolver los mismos cierres que hoy y en el mismo orden.

## Trazabilidad (R → test)

Los literales de los rótulos se escriben a mano en el test; nunca se comparan contra la constante que
los genera. En los negativos, un valor imposible de encontrar por casualidad.

| R | Test |
| --- | --- |
| R450 | `tests/components/DetalleCierre.test.tsx` — aprobado y rechazado: pares exactos y en orden, p. ej. `["Folio","#693C96D7"]`, `["Destino","Bodega central"]`, `["Zona","Central Demo"]`, `["Solicitado","2026-11-13 17:41"]`, `["Aprobado","2026-11-13 17:41"]`, `["Aprobado por","Maestro Demo"]`. |
| R451 | `tests/components/DetalleCierre.test.tsx` — sin zona y sin `resueltoPorNombre`: no existe término «Zona» ni «Aprobado por»; el texto de la cabecera no contiene «—». |
| R452 | `tests/components/CierreDiaPagina.test.tsx` — cierre pasado aprobado (sin «Zona» ni «Aprobado por») y vencido («Del día», sin «Solicitado»). |
| R453 | `tests/components/CierreDiaPagina.test.tsx` (sustituye la aserción de «Solicitud nueva · Hoy · sin solicitar») y `tests/components/DetalleCierre.test.tsx:403` — `["Folio","Solicitud nueva"]`, `["Día","Hoy"]`, sin «Destino». |
| R454 | `tests/components/DetalleCierre.test.tsx` — bodega sin marca y con marca: «Origen», «Zona», «Solicitado por», «Mensajeros» `"3"`, «Recibido», «Recibido por». |
| R455 | `tests/components/DetalleCierre.test.tsx` — `getAllByRole("term")` y `getAllByRole("definition")` tienen la misma cuenta; la cabecera no contiene « · Solicitado ». `e2e/cierres-rediseno.spec.ts:250` pasa a buscar el par «Aprobado por» → nombre del maestro. |
| R456 | `tests/components/FiltrosCierresBarraFolio.test.tsx` (nuevo) — placeholder «Busca por folio»; escribir `  #3f2a ` emite `filtros.folio` y la pantalla vuelve a página 1. Positivo de punta a punta en `tests/integration/db/cierres-filtro-folio-sql-real.test.ts`. |
| R457 | `tests/unit/services/cierres-filtro-folio.test.ts` (nuevo) — en los tres servicios: `"ZZ"` y `"123456789"` dan `items: []`, `total: 0` y el doble del repositorio no se llama; `""` y `"  "` no recortan; 21 caracteres dan `validation_error` en el schema. |
| R458 | `tests/integration/db/cierres-filtro-folio-sql-real.test.ts` (nuevo, Postgres real, `HAY_BASE_DE_DATOS`) — en los tres repositorios, con ids fijados por el test: el prefijo y el folio entero en minúsculas encuentran su cierre (positivo); un folio inexistente (`"FEDCBA98"`, ningún id sembrado lo lleva) da 0 (negativo); un texto que solo está en el primer bloque del uuid da 0; un cierre con el mismo folio en otra zona/otra empresa no sale; `total` cuadra con los filtros combinados. |
| R459 | `tests/integration/db/cierres-filtro-folio-sql-real.test.ts` — el conjunto completo (`find*Completo` / `findColaCompleta`) con folio devuelve los mismos ids que la paginación. `tests/unit/guards/filtros-cierres-alcance.guardia.test.ts` — la lista blanca suma `folio` y los `where` sin folio no cambian. |

## Tasks

- [x] **T1 — Cabecera con rótulos.** `detalle-cierre-labels.ts` gana los rótulos (Folio, Destino, Zona,
  Solicitado, Aprobado, Aprobado por, Rechazado, Rechazado por, Del día, Día, Origen, Solicitado por,
  Mensajeros, Recibido, Recibido por) y pierde los textos de la línea única que queden sin uso.
  `detalle-cierre-vista.ts`: `DetalleMensajeroVista` separa destino (tipo) y zona, y una función pura
  arma la lista de pares de cada variante (sustituye a `fechasMensajero`/`fechasBodega`/`destinoLegible`
  en la cabecera). `DetalleCierre.tsx`: `LineaCabecera` pinta un `<dl>` con los pares.
  *Hecho:* R450-R455 en verde; `cierres-trato-tu.guardia.test.ts` en verde.
- [x] **T2 [P] — Tests de la cabecera.** Actualiza `DetalleCierre.test.tsx`, `CierreDiaPagina.test.tsx`,
  `detalle-cierre-vista.test.ts` y `e2e/cierres-rediseno.spec.ts:250`. *Hecho:* cada R450-R455 con su
  test y los literales a mano.
- [x] **T3 — Folio en el contrato de filtros.** (servidor hecho; usar `sinFiltrosBodega` en los dos módulos queda para T5, frontend) `filtrosCierresSchema` y `filtrosCierresBodegaSchema`
  aceptan `folio: z.string().max(MAX_FOLIO_FILTRO).optional()`; `sinFiltros` lo cuenta; un
  `sinFiltrosBodega` compartido sustituye a las dos copias locales de los módulos (si no, la página 1
  pre-cargada sin filtrar se serviría con un folio puesto). Revisa que ningún consumidor reenvíe
  `FiltrosCierres` a otro schema `.strict()` que lo rechace. *Hecho:* guardia de filtros actualizada y en verde.
- [x] **T4 — Servidor (depende de T3).** Los tres servicios normalizan con `normalizarFolio`: imposible
  → página y archivo vacíos sin leer la base. Los `where` de los tres repositorios añaden
  `{ id: { in: idsPorFolio } }` dentro del `AND` solo si hay folio, con los ids leídos por SQL a mano
  parametrizado (`strpos(upper(right(id, 8)), $texto) > 0`) sobre `cierre_dia` o `cierre_bodega`
  según la lista (D6). *Hecho:* R457-R459 en verde contra Postgres real; los `*-where.test.ts`
  existentes, sin tocar, en verde.
- [x] **T5 — Barra (depende de T3).** `FiltrosCierresBarra` cambia `SIN_BUSQUEDA` por un `onChange`
  que pone `folio` en los filtros, con el placeholder `BUSCA_POR_FOLIO` importado (no copiado); la
  nota de cabecera «NO HAY BUSCADOR DE TEXTO» se actualiza. *Hecho:* R456 en verde.
- [x] **T6 — Cierre.** `./init.sh` en verde; E2E locales de `/cierres-admin` y `/cierre-dia` que
  tocan la cabecera o la barra (`docs/perfil-agentes.md > E2E en local antes del PR`).

## Tamaño

- Archivos: **22** (14 de producción, 8 de tests con el E2E); tope 40, 80% = 32.
- Producción: ~380 líneas (cabecera ~150, contrato y servicios ~110, repositorios ~90, barra ~30).
- Tests: ~750 líneas (integración ~350, componentes ~280, servicios ~120).

## Archivos esperados

- `components/private/cierres/detalle/DetalleCierre.tsx`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `lib/types/filtros-cierres.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `tests/components/DetalleCierre.test.tsx`
- `tests/components/CierreDiaPagina.test.tsx`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/components/FiltrosCierresBarraFolio.test.tsx`
- `tests/unit/services/cierres-filtro-folio.test.ts`
- `tests/unit/guards/filtros-cierres-alcance.guardia.test.ts`
- `tests/integration/db/cierres-filtro-folio-sql-real.test.ts`
- `e2e/cierres-rediseno.spec.ts`

## Preguntas abiertas

- **¿Sigue en ruta ligera?** (para el leader / Carlos) La búsqueda por folio no es solo pantalla: toca
  el contrato zod de los filtros, tres servicios y el `where` de tres repositorios, con SQL a mano
  nuevo sobre `cierre_dia` y `cierre_bodega` (evidencia arriba). No toca esquema, migraciones,
  dinero ni permisos, así que el suelo de `docs/specs.md > Tres rutas` no obliga a la completa; pero
  un `WHERE` dentro del alcance es justo lo que pide test de integración y revisión cuidadosa. Si se
  prefiere, se parte en dos rebanadas que se mergean solas: (a) cabecera R450-R455, solo frontend;
  (b) folio buscable R456-R459.
