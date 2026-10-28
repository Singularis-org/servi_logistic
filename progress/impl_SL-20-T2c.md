# SL-20 — tanda 4, parte backend (T2.4 + resto de T2.5 + `error` en retiro y conteo)

Estado: **T2.4 `[x]`**, **T2.5 `[x]`** (el resto de T2.5 ya estaba en T2b/T4b: disponibilidad, R45, R47).
Grafo de código: no usado (cambios acotados a archivos conocidos por las bitácoras previas; Grep/Read).

## Archivos

Creados:
- `scripts/generar-paises-iso-3166-1.mjs` — generador de un solo uso (decisión 10). Lleva escritos los
  249 códigos alfa-2 asignados de ISO 3166-1; aborta si no son 249, si hay repetidos o si el ICU no da
  nombre para alguno (con `fallback: "code"` un código desconocido volvería igual). Solo `node:` + `Intl`.
- `lib/constants/paises-iso-3166-1.ts` — GENERADO (Node v22.13.1, ICU 76.1, CLDR 46.0; anotado en su
  cabecera). `PAISES_ISO_3166_1` (249 filas, orden por código) y `paisDelCatalogo(id)`. Sin `Intl` en runtime.
- `tests/unit/constants/paises-iso-3166-1.test.ts` — R40.

Modificados:
- `lib/types/pais.ts` — `crearPaisSchema` sin `nombre`; `id` con `refine(paisDelCatalogo)` (R41);
  `PAIS_FUERA_DEL_CATALOGO` (mensaje); nuevo tipo `DatosDeAltaDePais = CrearPaisInput & { nombre }`.
- `lib/services/PaisService.ts` — `crear` toma el nombre del catálogo (R23) y compara ese nombre normalizado.
- `lib/interfaces/repositories/IPaisRepository.ts`, `lib/repositories/PaisRepository.ts` — `crear` recibe
  `DatosDeAltaDePais` (el cuerpo del repo no cambia).
- `lib/actions/geografia-plataforma.ts` — cabecera (se quita el «pendiente» del catálogo, se documenta la
  política de `error`); `cambiarActivacionNodoAction` y `contarOrdenesSinEntregarAction` con `try/catch`
  → `{ status: "error" }` + log; sus tipos de resultado ganan `ErrorInterno`. **La firma de
  `crearPaisAction` no cambia.**
- `tests/unit/services/pais-service.test.ts` — R23 (nombre del catálogo, `nombre` en la entrada rechazado)
  y bloque R41.
- `tests/unit/actions/geografia-plataforma-action.test.ts` — `error` en retiro/reactivación/conteo (sustituye
  el test «el retiro NO lleva catch»), R23/R41 por el borde con el servicio real.
- `tests/integration/db/pais-repositorio.test.ts` — el alta por servicio usa `PE` (catálogo) y comprueba
  nombre «Perú» en fila e historial.
- `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` — el país de la suite pasa de `XS` a `BV`
  (Isla Bouvet): `XS` ya no se puede dar de alta por la action (R41). Comprueba el nombre del catálogo.
- `specs/SL-20-pais-geografia-configurable/tasks.md` — solo los checkboxes de T2.4 y T2.5.

## Mapa R<n> -> test

| R | Test |
|---|---|
| R23 | `tests/unit/services/pais-service.test.ts` › «R23 — alta de un país del catálogo» (nombre del catálogo, conflictos por código y por nombre normalizado, carrera); `tests/unit/actions/geografia-plataforma-action.test.ts` › «SL-20/R23, R41 … R23: el país se crea con el nombre del catálogo»; `tests/integration/db/pais-repositorio.test.ts` › «R23/R33/R41: crea el país del catálogo…»; `geografia-superadmin-sin-empresa.test.ts` (nombre «Isla Bouvet») |
| R36 (retiro, conteo) | `geografia-plataforma-action.test.ts` › «R36 (decisión de la tanda 4): un fallo de la base en el retiro/reactivación…», «…en el conteo…», «el retiro y el conteo que salen bien no escriben en el log» |
| R40 | `tests/unit/constants/paises-iso-3166-1.test.ts` (249, `^[A-Z]{2}$`, sin códigos ni nombres normalizados repetidos, CR = «Costa Rica», sin XA–XZ/AA/QM–QZ/ZZ, sin `Intl` en el código) |
| R41 | `pais-service.test.ts` › «R41 — un código fuera del catálogo…» (minúsculas, 3 letras, dígitos, vacío, XA, ZZ, AN retirado, QQ, no-texto); `geografia-plataforma-action.test.ts` › «R41: un código fuera del catálogo…» |
| R42 | UI (T5.7, frontend_dev). Lo de servidor: la action no tiene campo `nombre` |
| R43 | sin cambio: `pais-tabla.test.ts`, `migracion-sl20-ida-y-vuelta.test.ts` (el catálogo no entra en la base) |
| R44–R47 | ya cubiertos en `impl_SL-20-T2b.md` / `impl_SL-20-T4b.md`; sin cambio |

## Salida real

- `node scripts/generar-paises-iso-3166-1.mjs` → `escrito lib\constants\paises-iso-3166-1.ts: 249 países`
- `pnpm exec vitest run tests/unit/constants/paises-iso-3166-1.test.ts tests/unit/services/pais-service.test.ts`
  → `Test Files 2 passed (2) · Tests 54 passed (54)`
- `pnpm exec vitest run tests/unit/actions/geografia-plataforma-action.test.ts tests/unit/actions/geografia-plataforma.composition-root.test.ts`
  → `Test Files 2 passed (2) · Tests 72 passed (72)` (antes de añadir el bloque R23/R41 del borde);
  tras añadirlo, `geografia-plataforma-action.test.ts` → `Tests 68 passed (68)`
- Integración (base `servi_logistic_sl20`, un archivo por comando):
  - `tests/integration/db/pais-repositorio.test.ts` → `Tests 7 passed (7)`
  - `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` → `Tests 4 passed (4)`
- Lint (`eslint` sobre los 12 archivos tocados) → exit 0, sin avisos.
- Guardias (por archivo): `guard-dependencias-aprobadas`, `geografia-renombrado-punto-unico`,
  `geografia-sin-borrado-fisico`, `historial-accion-escrituras-cubiertas`, `plataforma-solo-en-lista`,
  `superadmin-fuera-de-empresa`, `superficie-de-uso`, `quitador-comentarios` → verdes.
  Rojos AJENOS a este cambio: `dependencias-declaradas-presentes.guardia` (4: `init.sh` ya no tiene el
  marcador «FIN PASO 2» ni llama a `scripts/verificar-dependencias.mjs`) y `dominio-ordenex-fuera.guardia`
  («ninguna entrada sobra», 32 s). No toco `init.sh` ni esa lista.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 2, **ninguno en archivos de esta
  tanda**. 13 archivos con error, todos del frontend_dev en curso (T5.1/T5.2: `etiquetas` nueva en
  columnas/filtros): `tests/unit/components/{ordenes-columns,recibidas-columns,detalle-columnas,
  salida-a-reparto-filtro,ordenes-filtros-def,satelite-filtro-estado,ordenes-buscador-declaracion,
  filtros-acotados-por-rol}`, `tests/unit/descarga/cobertura-descarga-columnas.test.ts`,
  `tests/unit/tablero-dia/recorte-por-alcance.guardia.test.ts`, `tests/components/{DetalleMensajeroPanel,
  FiltrosEntregas}.test.tsx` y uno en `app/(app)/` que ya no aparece en una tercera pasada (lo arregló el
  frontend_dev entretanto). (Corrí `tsc --noEmit` dos veces más solo para agrupar
  por archivo.)

## Contrato para la UI (T5.7)

- Catálogo, import directo (dato estático, sin action; design §2.1/§5):
  `import { PAISES_ISO_3166_1, paisDelCatalogo, type PaisDelCatalogo } from "@/lib/constants/paises-iso-3166-1"`
  - `PAISES_ISO_3166_1: readonly { id: string; nombre: string }[]` — 249 filas, **ordenadas por código**
    (si la lista se muestra por nombre, que la ordene la UI con `localeCompare("es")`). `id` = alfa-2, `nombre` en español.
  - `paisDelCatalogo(id): PaisDelCatalogo | null`.
  - Para no ofrecer los ya dados de alta: cruzar con `listarPaisesAction()` (`paises[].id`).
- Alta: `crearPaisAction(input)` con
  `{ id, nivel1Singular, nivel1Plural, nivel2Singular, nivel2Plural, nivel3Singular, nivel3Plural }`
  (strings; **sin `nombre`**: un `nombre` en la entrada es `validation_error` con clave `entrada`). Respuestas:
  `ok { pais: PaisDTO }` (nombre del catálogo) · `validation_error { fieldErrors }` (un código fuera del
  catálogo → `fieldErrors.id = [PAIS_FUERA_DEL_CATALOGO]`) · `conflict { campo: "id" | "nombre" }` ·
  `forbidden` · `unauthenticated` · `error`.
- `cambiarActivacionNodoAction` y `contarOrdenesSinEntregarAction` pueden devolver ahora `{ status: "error" }`.

## Decisión de `error` (para el reviewer)

Decisión del humano vía el leader (tanda 4): el `error` de R36 se extiende al **retiro/reactivación** y al
**conteo**. Ambas actions envuelven la llamada en `try/catch` → `registrarFallo(operacion, "nivel=…")`, que
loguea solo el nombre del error (sin datos de la fila) y responde `{ status: "error" }`. Operaciones en el
log: `retiro de nodo` / `reactivacion de nodo` / `conteo de ordenes`. No hay único que violar en ellas, así
que no hay rama `conflict`. Cambia el comportamiento previo (T4b), que dejaba subir el fallo del retiro y del
conteo; el test «el retiro NO lleva catch» se sustituyó. `arbolDePaisAction` y `listarPaisesAction` siguen
sin `catch` (no estaban en la decisión).

## Preguntas abiertas

1. **Nombres del CLDR que quizá no son los que se quieren mostrar** (no los parcheé, decisión 10):
   - `CI` → «Côte d’Ivoire» (en francés, con apóstrofo tipográfico U+2019; en español suele ser «Costa de Marfil»).
   - `HK` → «RAE de Hong Kong (China)», `MO` → «RAE de Macao (China)».
   - `UM` → «Islas menores alejadas de EE. UU.», `VI` → «Islas Vírgenes de EE. UU.» (abreviaturas).
   - `PS` → «Territorios Palestinos»; `MM` → «Myanmar (Birmania)»; `AX` → «Islas Aland» (sin «Å»);
     `GS` → «Islas Georgia del Sur y Sandwich del Sur» (sin tilde en «Sándwich»).
   Ninguno vuelve igual al código. Si el humano quiere otro nombre, la vía limpia es una tabla de
   sustituciones en el script (y regenerar), no editar el archivo generado.
2. **Longitud del nombre**: `PAIS_NOMBRE_MAX = 40` ya no se aplica al nombre del país (viene del catálogo).
   El más largo del catálogo tiene 40 («Islas Georgia del Sur y Sandwich del Sur»); la columna es `TEXT`.
3. **R43 / limpieza de suites**: `geografia-superadmin-sin-empresa` escribe y borra de verdad el país `BV`. Es
   un código real del catálogo (Isla Bouvet, deshabitada); si algún entorno de pruebas lo diera de alta, la
   suite lo borraría. Alternativa si se prefiere: crear el país por la fábrica y probar el alta solo en
   `pais-repositorio` (revertida).

Veredicto: T2.4 y T2.5 cerradas; unit, integración, lint y guardias tocadas en verde; typecheck rojo solo por archivos del frontend_dev en curso.
