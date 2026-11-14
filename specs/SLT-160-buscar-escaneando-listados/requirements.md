# SLT-160 «Buscar escaneando en los listados» — requirements

Ruta: **ligera** (zona frontend con un cambio de consulta en servidor, ver Preguntas abiertas).
Requisitos: **R600-R609**.
Sale de SLT-155 «Evaluar el lector de código de barras en toda la app»
(`specs/SLT-155-lector-codigo-barras/brief-diseno.md` §2.2 y §4.2 (a), `evaluacion.md` §4.3 ficha 4).
**Depende de SLT-157 «Guía única leída por cámara o pistola»** (`leerGuia`). Independiente de
SLT-158 «Entrada de escaneo para pistola» y SLT-159 «Escaneo continuo en recepciones y recogidas».

## Origen

Pedido de Carlos (2026-11-13): «todo lugar donde puedan usar la pistola, por ejemplo los buscadores
de la app para buscar órdenes, pero conviviendo con el escáner que ya tenemos, que es con cámara».
Diseño aprobado (canvas https://claude.ai/artifact/BKro9B2dap6jrmGejRq6M3): buscador con Enter y
botón de cámara (`EscanerModal`) al lado.

Hoy `BuscadorFiltros` (`components/shared/BuscadorFiltros.tsx:510-529`) no está en un `<form>` ni
escucha Enter: busca con debounce de 500 ms desde `minChars`. Una segunda lectura de pistola se
**añade** al término (`10241025`); la URL del QR no encuentra nada; ningún buscador tiene cámara.
En la satélite (B2) una guía se busca por contención en la columna de búsqueda
(`OrdenRepository.ts:1716-1726`): `1024` trae también `10245`. En `/ordenes` (B1) ya hay ruta exacta
por `num_guia` con vuelta a la contención si no casa nada (`OrdenService.ts:170-183`, `:297-301`).

## Lo que ya existe (evidencia)

Buscado `BuscadorFiltros`, `escribirBusqueda`, `terminoDeBusqueda`, `sinRutaRapida`, `num_guia` en
`specs/`, `feature_list.json` y el código (grafo no indexado para este worktree: Grep/Read).

- `BuscadorFiltros` es el buscador de todos los listados; se le añade una prop, no se crea otro.
- Ruta rápida exacta de `/ordenes` con su vuelta atrás (feature 169, R10): se **copia el criterio**
  a la satélite, no se inventa otro.
- `terminoDeBusqueda` (`lib/utils/filtros-listado-ordenes.ts:95`) ya lo comparten `/ordenes` y la
  satélite; `RecepcionSateliteService.filtroDeRepo` (`:130-`) alimenta los tres caminos del listado
  (página, conjunto de la descarga y vigencia de la selección): el cambio va ahí una vez.
- `EscanerModal` + `QrScanner`: el visor de hoy; no se crea otro.
- SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» convirtió el buscador de
  `/cierres-admin` (B9) en búsqueda **por folio** (`FiltrosCierresBarra.tsx`).

## Alcance

**Dentro** — los buscadores con guía de bodega y tienda (`brief-diseno.md` §2.2):
B1 `/ordenes`, B2 `/recepcion-satelite/en-bodega`, B3 `/novedades`, B4 `/historico/conversaciones`,
B5 `/historico/acciones`, B6 `/wallet` (caja), B7 estado de cuenta de tienda y de mensajero
(`EstadoCuenta`), B8 `/mi-wallet` (el mismo `EstadoCuenta`).
- Enter en el buscador busca **ya**; una lectura de guía (dígitos, URL del QR, «#») se deja como el
  número; la siguiente lectura **reemplaza** el término.
- Botón de cámara dentro del campo, junto a la «X».
- B2: guía exacta como en B1.

**Fuera:**
- **B9 `/cierres-admin`**: desde SLT-153 busca por folio de cierre, y el folio no se imprime en
  ningún código (`evaluacion.md` §1). Una pistola o la cámara no tienen nada que leer ahí; no lleva
  botón de cámara. (Es el noveno buscador del recuento de la evaluación.)
- El filtro de texto «Orden» de B4 (`FilterComponent`): no es el buscador.
- Ruta exacta por guía en B3-B8: se busca la guía como texto, igual que hoy (puede traer parecidos).
- Atajo de teclado para enfocar el buscador (el brief lo dejaba por decidir; el canvas no lo pide).
- Buscadores sin guía (usuarios, tiendas, mensajeros, monitoreo, entregas).

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo |
| --- | --- | --- |
| DC1 | Una guía escaneada que no está en el listado de la satélite cae a la búsqueda normal por contención (puede traer parecidas), como hoy en `/ordenes`. Se descarta buscar solo esa guía con lista vacía (exigía un filtro nuevo en la URL y en las descargas de los dos listados). Lo cubren D3, R606 y R608. | Carlos, 2026-11-14 |

## Decisiones (tomadas aquí)

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | El botón de cámara se enciende con una prop de `BuscadorFiltros` (`escaneo`), que pasan solo B1-B8. | Una prop opcional deja intactos los buscadores sin guía; la guardia R609 vigila la lista. |
| D2 | Enter = «buscar ya». Si lo escrito es una guía según `leerGuia`, el campo pasa a mostrar el número y se busca ese número; si no, se busca el texto tal cual. Tras el Enter el texto queda **seleccionado**, así la siguiente lectura lo sustituye. | No hace falta distinguir pistola de tecleo (D2 de SLT-158): seleccionar tras Enter evita la concatenación igual para los dos. |
| D3 | En B2 los dígitos siguen el mismo criterio que B1: si en el listado (zona, alcance y filtros puestos) hay una orden con esa guía, solo esa; si no, contención como hoy. Lo decide el servidor, no el cliente. | Un número de guía (8 dígitos, p. ej. `34991060` en SLT-69 «Escáner rechaza guías asignadas después de abrir la pantalla») tiene la misma forma que un trozo de teléfono: el cliente no puede saber cuál es. El servidor sí, y B1 ya lo hace así desde la feature 169. |
| D4 | La cámara del buscador abre `EscanerModal` con el visor ya encendido (el toque en el botón de cámara es el gesto); al leer se cierra (guía suelta). | Dos toques para leer una guía (abrir modal, «Escanear con cámara») no aportan nada; el modal sigue arrancando cerrado. |

## Requisitos (EARS)

- **R600** — Los buscadores B1-B8 DEBEN mostrar, dentro del campo, un botón con nombre accesible
  «Escanear con cámara». El buscador de `/cierres-admin` y los buscadores sin guía NO DEBEN mostrarlo.
- **R601** — CUANDO se pulsa Enter en un buscador B1-B8 y lo escrito es una guía (dígitos, URL
  `/paquete/<n>` o `#<n>`, con espacios o caracteres de control en los extremos), el campo DEBE pasar
  a contener solo el número y el listado DEBE buscar ese número en ese momento, sin esperar el
  debounce.
- **R602** — CUANDO se pulsa Enter y lo escrito no es una guía, el listado DEBE buscar el texto tal
  cual en ese momento, sin esperar el debounce; por debajo de `minChars` NO DEBE buscar (como hoy).
- **R603** — CUANDO termina la búsqueda lanzada con Enter, el texto del campo DEBE quedar
  seleccionado, de modo que lo siguiente que se escriba o se lea lo sustituya y no se le añada.
- **R604** — CUANDO se pulsa el botón de cámara, el sistema DEBE abrir el visor de cámara de hoy ya
  encendido; CUANDO lee una guía, DEBE cerrarlo, poner el número en el buscador y buscarlo en ese
  momento.
- **R605** — SI la cámara del buscador lee algo que no es una guía, ENTONCES el sistema DEBE mostrar
  «Código inválido.» y NO DEBE cambiar el término ni la búsqueda en curso.
- **R606** — CUANDO el término de `/recepcion-satelite/en-bodega` (B2) son solo dígitos y en el
  listado de esa bodega, con los filtros puestos, hay una orden con ese número de guía, el listado
  DEBE devolver solo esa orden (`1024` no trae `10245`). SI no la hay, ENTONCES DEBE buscar por
  contención como hoy.
- **R607** — El criterio de R606 DEBE ser el mismo en la página del listado, en el archivo de la
  descarga y en la comprobación de vigencia de la selección.
- **R608** — SI la orden con esa guía es de otra zona, de otra bodega o de otra empresa, ENTONCES
  NO DEBE aparecer en B2 ni activar la búsqueda exacta.
- **R609** — MIENTRAS no se pulse Enter ni la cámara, los buscadores DEBEN comportarse como hoy
  (debounce, `minChars`, «X» de limpiar); y solo B1-B8 DEBEN pasar `escaneo`.

## Trazabilidad (R → test)

Literales a mano. El SQL de B2 se prueba contra Postgres real (`HAY_BASE_DE_DATOS`): un `WHERE` sin
test de integración no está probado. En los negativos, guías imposibles por casualidad.

| R | Test |
| --- | --- |
| R600 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` (nuevo) — con `escaneo`: `getByRole("button", { name: "Escanear con cámara" })`; sin `escaneo`: `queryByRole` es `null`. |
| R601 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` — escribir `https://app.ejemplo.test/paquete/1024` + Enter: el campo vale `1024` y `onChange("1024")` se llama antes de avanzar los timers del debounce; ídem `" #1024\r"`. `tests/unit/components/ordenes-listado-buscador.test.tsx` — B1 recibe `1024`. |
| R602 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` — `Ana Pérez` + Enter: `onChange("Ana Pérez")` sin avanzar timers; con `minChars=3`, `ab` + Enter: `onChange` no recibe `ab`. |
| R603 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` — tras Enter, `selectionStart === 0` y `selectionEnd === "1024".length`; escribir `2048` + Enter deja `2048`, nunca `10242048`. |
| R604 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` — pulsar la cámara: el doble de `html5-qrcode` arranca sin otro clic; `decodedText = "1024"`: el diálogo se cierra y `onChange("1024")`. |
| R605 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` — `decodedText = "ZZ-NO-ES-GUIA"`: toast «Código inválido.»; `onChange` no se llama y el campo conserva su texto. |
| R606 | `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts` (nuevo) — con guías fijadas por el test (`91024` y `910245` en la misma bodega): `q="91024"` devuelve solo `91024`; `q="9102"` (no es guía de ninguna) devuelve las dos por contención. `tests/unit/services/recepcion-satelite-busqueda-guia.test.ts` (nuevo) — el filtro que llega al doble del repositorio lleva la guía exacta y no `busqueda` cuando existe, y `busqueda` cuando no. |
| R607 | `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts` — con `q="91024"`, la página, el conjunto completo de la descarga y la vigencia de la selección devuelven el mismo id. |
| R608 | `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts` — una orden `91024` de otra zona y otra de otra empresa: no salen; con solo esas, `q="91024"` cae a contención y no devuelve ninguna de las dos. Se mata con una mutación (quitar la condición de zona en la comprobación) antes de darlo por bueno. |
| R609 | `tests/unit/components/buscador-filtros-escaneo.test.tsx` — escribir sin Enter: `onChange` solo tras los 500 ms. `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts` (nuevo) — los ocho montajes de B1-B8 pasan `escaneo`; `FiltrosCierresBarra.tsx` no. Los tests existentes de `BuscadorFiltros` (`buscador-filtros-*.test.tsx`) sin tocar y en verde. |

## Tasks

- [ ] **T1 — Buscador.** `BuscadorFiltros` prop `escaneo`: Enter (D2) con `leerGuia`, búsqueda
  inmediata (cancela el debounce pendiente), selección del texto, botón de cámara junto a la «X» que
  cabe en el ancho mínimo de 250 px. *Hecho:* R600-R603, R609 (comportamiento) en verde.
- [ ] **T2 — Cámara (depende de T1).** `EscanerModal` acepta un disparador de solo icono (nombre
  accesible «Escanear con cámara»); `QrScanner` prop para arrancar encendido (D4). El
  `EscanerModal` con su texto de hoy no cambia. *Hecho:* R604-R605 en verde; `EscanerModal.test.tsx`
  y `QrScanner.test.tsx` existentes en verde.
- [ ] **T3 [P] — Montajes (depende de T1).** B1-B8 pasan `escaneo`. Guardia
  `buscadores-con-escaneo.guardia.test.ts`. *Hecho:* R609 (guardia) en verde.
- [ ] **T4 [P] — Satélite exacta (backend_dev).** `RecepcionSateliteService.filtroDeRepo` resuelve, una
  vez por petición, si el término de solo dígitos (entero positivo hasta el máximo de `num_guia`) es
  la guía de una orden del listado con sus filtros; si lo es, el filtro lleva la guía exacta y no
  `busqueda`. `condicionesSatelite` añade `o."num_guia" = $guia` dentro del `AND`, nunca en un `OR`.
  Interfaz del repositorio actualizada. *Hecho:* R606-R608 en verde contra Postgres real; los tests
  existentes de la satélite (`recepcion-satelite-*.test.ts`, `satelite-paginado-where.test.ts`,
  `satelite-*-real.test.ts`) sin tocar y en verde.
- [ ] **T5 — Dispositivo.** En Preview: en `/ordenes` y en la satélite, leer una etiqueta con la
  pistola (CODE128 y QR) en el buscador, y luego otra sin tocar; con la cámara del teléfono, una.
  Nota en `progress/features/SLT-160.md`. *Hecho:* nota escrita.
- [ ] **T6 — Cierre.** `./init.sh` en verde; E2E locales de los listados tocados que usan el
  buscador (`grep -rl` en `e2e/` por los placeholders de B1-B8).

## Tamaño

- Archivos: **20** (13 de producción, 7 de tests); tope 40, 80% = 32.
- Producción: ~330 líneas (buscador ~120, modal y cámara ~40, ocho montajes ~20, servicio ~70,
  repositorio e interfaz ~80).
- Tests: ~750 líneas (buscador ~350, integración ~250, servicio ~100, guardia ~50).

## Archivos esperados

- `components/shared/BuscadorFiltros.tsx`
- `components/shared/EscanerModal.tsx`
- `components/shared/QrScanner.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`
- `app/(app)/novedades/_components/NovedadesFiltrosBarra.tsx`
- `app/(app)/historico/conversaciones/_components/HistoricoFiltrosBar.tsx`
- `app/(app)/historico/acciones/_components/HistorialAccionesFiltrosBar.tsx`
- `app/(app)/wallet/_components/LibroCajaBarra.tsx`
- `components/shared/estado-cuenta/EstadoCuenta.tsx`
- `lib/services/RecepcionSateliteService.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `tests/unit/components/buscador-filtros-escaneo.test.tsx`
- `tests/unit/components/ordenes-listado-buscador.test.tsx`
- `tests/unit/guards/buscadores-con-escaneo.guardia.test.ts`
- `tests/unit/services/recepcion-satelite-busqueda-guia.test.ts`
- `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts`
- `tests/components/EscanerModal.test.tsx`
- `tests/components/QrScanner.test.tsx`

## Preguntas abiertas

- **Ruta (para el leader):** como SLT-153 «Cabecera del detalle del cierre con rótulos y folio
  buscable», toca un `WHERE` de servidor (B2). No toca esquema, migraciones, dinero ni permisos, así
  que el suelo de `docs/specs.md > Tres rutas` no obliga a la completa; el riesgo lo cubren R608 y el
  test contra Postgres real. Si se prefiere, se parte en dos rebanadas que se mergean solas:
  (a) R600-R605 y R609, solo frontend; (b) R606-R608, la satélite exacta.
- Conflicto de archivos: `EscanerModal.tsx` y `QrScanner.tsx` los tocan también SLT-157, SLT-158,
  SLT-159 y quizá SLT-156 «PWA de los mensajeros: tablas usables en el móvil»; lo mira
  `scripts/archivos-en-vuelo.mjs` al tomar la ficha.
