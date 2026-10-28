# SL-20 · tanda 2, rama B (T3.4 → T4.1 → T4.2 → T4.5) · backend_dev

Fecha: 2026-10-26. Base: `servi_logistic_sl20` (local), con `DATABASE_URL` puesta por comando. Sin commit.
No usé el MCP del grafo: el worktree no está indexado (lo mismo que en T3). Trabajé con Grep/Read.

## Tasks cerradas (`[x]` en `tasks.md`)
- T3.4 `GeoRepository.importarDivision` + `leerDivisionDePais`, y `CargaDivisionService` + interfaz.
- T4.1 `GeoRepository`: `listArbolDePais`, `findHermanos` por país, `crear` con país, código y actor,
  y las tres escrituras hacia `historial_plataforma`.
- T4.2 `GeografiaService.listarArbolDePais` y la validación del código en el alta (R17).
- T4.5 guardia `historial-accion-escrituras-cubiertas`: los `nodo_geografico_*` pasan a estar sin escritor
  desde SL-20, con contraprueba.

## Archivos
Código:
- `lib/repositories/GeoRepository.ts`:
  - `listArbolDePais`, `findHermanos(nivel, contenedorId)` (devuelve `ContextoDeAlta`) y
    `crear(nivel, nombre, padreId, {paisId, codigo}, actor)`, que va en una transacción y escribe
    `nodo_geografico_creado`;
  - `leerDivisionDePais` e `importarDivision`;
  - `cambiarActivacion` y `renombrar` usan `appendAccionPlataforma`;
  - `findHermanosDeNodo` busca las provincias hermanas dentro del país.
- `lib/interfaces/repositories/IGeoRepository.ts`: tipos `ContextoDeAlta`, `DivisionDePais` y
  `OpcionesDeAlta`, más los métodos nuevos.
- `lib/services/GeografiaService.ts` y `lib/interfaces/services/IGeografiaService.ts`.
- `lib/services/CargaDivisionService.ts` y `lib/interfaces/services/ICargaDivisionService.ts` (nuevos).
- `lib/types/geografia-nodo.ts`:
  - el alta de provincia lleva `paisId` (ISO alfa-2) y las tres llevan `codigo?`;
  - nuevo `contenedorDeAlta`;
  - nuevos DTO `NodoPlataformaDTO`, `CantonPlataformaDTO` y `ProvinciaPlataformaDTO`.
- `lib/types/division-csv.ts`: `DIVISION_MAX_BYTES`, `DIVISION_TOPE_DE_FILAS_CSV` y `DIVISION_MAX_ERRORES`.

Tests:
- Nuevos: `tests/unit/services/carga-division-service.test.ts` y `tests/integration/db/carga-division.test.ts`.
- Adaptados: `tests/unit/repositories/geo-repository.escrituras.test.ts`,
  `tests/unit/services/geografia-service.test.ts` y `tests/integration/db/geografia-{alta,renombrado,cascada-reversible,registro-accion}.test.ts`.
  `geografia-registro-accion` está reescrito para el historial de plataforma.
- Ajustes mínimos para que sigan compilando y en verde con el schema nuevo:
  - `tests/unit/types/geografia-nodo.test.ts`, con dos casos nuevos para R29;
  - `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts`;
  - `tests/unit/actions/geografia-action.test.ts`: una línea, añade `paisId` al caso `forbidden`. El
    archivo es de T4.3.
- `tests/integration/db/_postgres-real.ts`: `clienteConSavepoint(tx, "plataforma")` rompe
  `historialPlataforma`. Es un cambio aditivo: `true` sigue rompiendo `historialAccion`.
- Guardias:
  - `historial-accion-escrituras-cubiertas` (T4.5);
  - `historial-accion-sin-datos-cliente`: `GeoRepository` sale de `PUNTOS_DE_ESCRITURA` porque ya no llama
    a `appendAccion`;
  - `superadmin-fuera-de-empresa`: excepción para `CargaDivisionService.GESTION_ROLES`.
- `specs/SL-20-pais-geografia-configurable/tasks.md`: solo los cuatro checkboxes.

## Decisiones dentro del design (para que las revise el leader)
1. **`findHermanos(nivel, contenedorId)`**. En la provincia, el contenedor es el país. Devuelve
   `{paisId, regla, codigoPadre, hermanos}` en una sola consulta, porque el service necesita la regla R17 del
   país y no hay `PaisRepository` (T2.1 va en paralelo). La regla se lee de la fila del país con
   `ReglaDeCodigoDePais`, el tipo mínimo de `lib/utils/codigo-geografico.ts`. No adelanté T2.1.
2. **`crear` lee el padre dentro de la tx** para armar la etiqueta y lanza un error si su país no es
   `opciones.paisId`. Así el historial nunca registra un país equivocado.
3. **R16 (código repetido dentro del país)**: lo frena el UNIQUE de la base. El error se propaga y la
   action (T4.3) lo traduce a `conflict`, igual que la carrera por nombre. El service no lo comprueba
   antes.
4. **Contrato de la carga**: `ok` (resumen y `avisos`), `invalido` (`errores` con un máximo de 200,
   `total` y `avisos`), `archivo_rechazado` (`motivo`), `not_found` (el país no existe) y `forbidden`. Un
   fallo de la base al escribir se propaga para que la action responda `error` (§6, R36).
5. **Decisión 4 aplicada.**
   - Las columnas de más generan un aviso «La columna «x» no es del formato y se ignoró.».
   - Si hay homónimos normalizados, gana el primero. «Primero» queda fijo porque `leerDivisionDePais` ordena
     por `id`.
   - Se permiten altas bajo un padre retirado.
   - Las tres van probadas contra la base.
6. **`codigosCompletados`** cuenta lo que de verdad completó el `updateMany ... WHERE codigo_dta IS NULL`,
   no lo que planificó la carga. Si alguien puso un código a mano entre medias, gana el suyo.
7. **Helpers del repositorio encima de la clase.** La guardia `geografia-renombrado-punto-unico` lee
   desde `async renombrar(` hasta el final del archivo y exige que ahí no aparezca `codigoDta`. No
   debilité la guardia: lo dejé anotado en el código.

## Mapa R<n> → test
| R | Test |
|---|---|
| R15 | `geografia-service.test.ts` › «SL-20/R15, R29 — la provincia cuelga de un pais…» (4 casos) y «374/R17 — conflict por forma normalizada»; `geografia-alta.test.ts` › «el mismo nombre de provincia en OTRO pais entra; en el mismo pais es conflict»; `geografia-renombrado.test.ts` › «SL-20/R15: para una provincia devuelve las de SU pais»; `geo-repository.escrituras.test.ts` › «SL-20/R15: las hermanas de una provincia son las de SU pais» |
| R16 | `geografia-alta.test.ts` › «R16: el mismo codigo en el mismo nivel y pais lo rechaza la base; en otro pais entra» |
| R17 | `geografia-service.test.ts` › «SL-20/R17 — el codigo del alta a mano» (7 casos); `geografia-alta.test.ts` › «CR: un codigo que cumple la regla…» y «CR: un codigo que no cumple la regla es validation_error…»; `carga-division-service.test.ts` › «R17 en la carga: la regla sale del pais…» |
| R24 | `carga-division.test.ts` › «crea, cuelga cada nodo de su padre en XA…», «la geografia de OTRO pais no cuenta como existente»; `carga-division-service.test.ts` › «R24: un CSV valido se escribe UNA vez…» |
| R25 | `carga-division.test.ts` › «una fila mala entre buenas: invalido con su linea, cero nodos y cero historial», «⭑ un fallo de la base a MITAD de la escritura deshace tambien lo ya escrito» (+ contraprueba); `carga-division-service.test.ts` › «R25: con UNA fila invalida…», «R25: devuelve como mucho 200 errores…» |
| R26 | `carga-division.test.ts` › «la segunda carga del mismo CSV no crea nada…», «a un nodo sin codigo se le pone el de la fila; su nombre, su estado y sus hijos no cambian» |
| R28 | `carga-division-service.test.ts` › «SL-20/R28 — el archivo se rechaza entero…» (extensión, 5 MB y contraprueba, UTF-8 inválido y BOM, 4 columnas que faltan, archivo vacío, 10 000 filas y contraprueba) |
| R29 | `geografia-alta.test.ts` › «SL-20/R15, R29…» (3 casos); `geo-repository.escrituras.test.ts` › «374/R12 + SL-20 — crear…»; `geografia-nodo.test.ts` › «SL-20/R29: la provincia exige su pais…», «…el codigo es opcional…» |
| R30 | `geografia-renombrado.test.ts` y `geografia-cascada-reversible.test.ts` (adaptados, en verde) |
| R33 | `carga-division.test.ts` › «R33: deja EXACTAMENTE una fila division_cargada…»; `geografia-registro-accion.test.ts` › R51/R52/R54 (ahora en `historial_plataforma`, con `pais_id`), «SL-20/R33: un alta escribe UNA fila nodo_geografico_creado…», «SL-20/R33: si el registro falla, el alta tampoco persiste», R55; `geografia-renombrado.test.ts` › las tres de «el renombrado deja EXACTAMENTE UNA fila» |
| R35 | `geografia-registro-accion.test.ts` › «SL-20/R35: retirar NO escribe en historial_accion»; `geografia-renombrado.test.ts` › «SL-20/R35: el renombrado NO escribe…»; `carga-division.test.ts` › «R35: la carga no escribe NADA en historial_accion»; guardia `historial-accion-escrituras-cubiertas` › «SL-20/R35 — los nodo_geografico_* quedan SIN escritor…» (4 casos, 2 contrapruebas) |
| R37 | `geografia-service.test.ts` › «SL-20 listarArbolDePais con rol $rol» (5) y el bloque «374/R24 + SL-32»; `carga-division-service.test.ts` › «SL-20/R37 — un rol de empresa recibe forbidden…» (5); el maestro sigue leyendo: «SL-32 (R25): el maestro sigue leyendo el arbol» |
| T4.1 `listArbolDePais` | `carga-division.test.ts` › «T4.1 listArbolDePais: el arbol de XA tras la carga, con codigo, sin CR y sin zonas» |

## Salida real
Tests, por archivo (`pnpm exec vitest run <archivo>`). La integración corrió contra `servi_logistic_sl20`:
- `tests/integration/db/carga-division.test.ts` → `Tests 12 passed (12)`
- `tests/integration/db/geografia-alta.test.ts` → `Tests 15 passed (15)`
- `tests/integration/db/geografia-registro-accion.test.ts` → `Tests 14 passed (14)`
- `tests/integration/db/geografia-renombrado.test.ts` → `Tests 17 passed (17)`
- `tests/integration/db/geografia-cascada-reversible.test.ts` → `Tests 10 passed (10)`. Antes de esta tanda
  caían 7, 7 y 7 con SL017 en `registro-accion`, `renombrado` y `cascada`.
- `tests/unit/services/carga-division-service.test.ts` → `Tests 27 passed (27)`
- `tests/unit/services/geografia-service.test.ts` → `Tests 76 passed (76)`
- `tests/unit/actions/geografia-action.test.ts` → `Tests 35 passed (35)`
- `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts` → `Tests 18 passed (18)`
- `tests/unit/types/geografia-nodo.test.ts` → `Tests 18 passed (18)`
- 6 guardias más `geo-repository.escrituras.test.ts` → `Test Files 7 passed (7) · Tests 170 passed (170)`.
  Las guardias son `historial-accion-escrituras-cubiertas`, `historial-accion-sin-datos-cliente`,
  `geografia-renombrado-punto-unico`, `geografia-sin-borrado-fisico`, `superadmin-fuera-de-empresa` e
  `historial-accion-punto-unico`.
- 12 guardias que barren `lib/` → `Test Files 12 passed (12) · Tests 155 passed (155)`. Son
  `consultas-concurrentes-en-transaccion`, `geografia-predicado-unico`, `p2003-detector-unico`,
  `etiqueta-fuente-diferida`, `zona-especial-punto-unico`, `fuera-datos-ordenex`, `superficie-de-uso`,
  `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `catalogo-postgres-acota-esquema`,
  `use-server-exports-async` y `use-server-sin-reexport-de-tipos`.
- Otras que usan `GeoRepository`:
  - `geografia-catalogo-activo` → 17 passed;
  - `zona-especial-dos-empresas` → 12 passed;
  - `historial-plataforma-rls` → 4 passed;
  - `geografia-historico-intacto` → 6 skipped. Su `beforeAll` exige una orden en la base y
    `servi_logistic_sl20` no tiene ninguna. Es un tema del entorno y no lo provoca este cambio.
- **Rojo conocido:** `tests/unit/components/geografia-admin.ui.test.tsx` › «la de PROVINCIA no exige padre y no
  manda ninguna clave de más» → 1 failed (154 de 155 pasan en esa tanda). La pantalla vieja
  `/configuracion/geografia` manda `{nivel:"provincia", nombre}` sin `paisId`, y el schema del design §5 ahora
  lo exige. Ese módulo lo mueve o borra T5.2/T5.3, que es de frontend y está fuera de mi alcance. No lo toqué.

`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 2. Lo corrí dos veces: la primera me
señaló tipos de mis tests, que corregí. En la última pasada no queda ningún error mío. Quedan 8, todos de
T2.2 (el otro agente):
- `app/(app)/plataforma/empresas/_components/EmpresasModule.tsx` (1): falta `paisId` en el alta;
- `tests/components/empresas-module.test.tsx` (2), `tests/components/EmpresasModuleCobro.test.tsx` (3) y
  `tests/integration/empresas-page.test.tsx` (2): falta `pais` en `EmpresaListada`.

No los toqué.

`pnpm run lint` → `✖ 231 problems (0 errors, 231 warnings)`, la misma cifra que en T3. `eslint` sobre mis
archivos solo marca un aviso que ya existía: `geografia-alta.test.ts:101`, con `s` sin usar.

## Preguntas abiertas
1. **Rojo de `geografia-admin.ui.test.tsx`** hasta que T5 mueva la pantalla. ¿Lo acepta el leader como rojo
   temporal de la rama, o prefiere que el `paisId` de la provincia entre en otro schema hasta T4.3/T5? Si es
   lo segundo, hay que tocar el design §5.
2. **Estado `not_found` de la carga** (país inexistente). El §6 no lo nombra; lo añadí para no escribir
   contra un país que no existe. La action de T4.3 tiene que mapearlo.
3. **Texto de los avisos y de los motivos de rechazo de R28.** Son propuesta mía (español, sin datos del
   archivo salvo el nombre de la columna o el mensaje del lector CSV). Si la pantalla (T5) necesita códigos
   en vez de textos, hay que decidirlo.

Veredicto: T3.4, T4.1, T4.2 y T4.5 están hechas y sus tests pasan contra Postgres real. Quedan dos rojos que
no son de esta rama B: el test de UI de la pantalla vieja (lo resuelve T5) y el typecheck de T2.2.
