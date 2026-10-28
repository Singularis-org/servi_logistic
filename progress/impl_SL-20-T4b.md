# SL-20 · tanda 3 (T4.3, T4.4, T4.6) · backend_dev

Fecha: 2026-10-26. Base `servi_logistic_sl20` (`DATABASE_URL` puesta por comando). Sin commit. No usé el
MCP del grafo, porque el worktree no está indexado (igual que en T3 y T4). Trabajé con Grep/Read.

## Tasks cerradas (`[x]` en `tasks.md`)
- **T4.3** `lib/actions/geografia-plataforma.ts`. Tiene las 9 actions de §5 (con la de T4.6), su entrada en
  `EXCEPCIONES_DE_PLATAFORMA` y la limpieza de `lib/actions/geografia.ts`, que ahora solo tiene
  `listarArbolGeografico` y `actualizarDistritosEspeciales`.
- **T4.4** `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` (R31, R32).
- **T4.6** Hecha entera. Lleva `cambiarDisponible` (R47) en repositorio, servicio y action, con su fila en
  `historial_plataforma`. No tiene ninguna parte que dependa del catálogo.
- **T2.5 sigue `[ ]`.** Esta tanda cierra su parte de `cambiarDisponible`
  (`cambiarDisponibilidadPaisSchema`, `PaisRepository.cambiarDisponible` y `PaisService.cambiarDisponible`).
  Falta solo lo del catálogo: `crearPaisSchema` sin `nombre`, R23 con el nombre del catálogo y R41.

## Alta de país (catálogo) — el hueco
`crearPaisAction` existe, pero solo pasa la entrada tal cual a `PaisService.crear(input: unknown)`, que la
valida por dentro. No hay schema en la action. Hoy el servicio valida el alta de T2.1, con código y nombre
tecleados. Cuando T2.4/T2.5 metan el catálogo, el cambio es en `crearPaisSchema` y en el servicio, y la
action no cambia. No inventé nada del catálogo. Queda anotado en la cabecera de la action.

## Archivos
Código:
- `lib/actions/geografia-plataforma.ts` (nuevo, `"use server"`):
  - actions: `listarPaisesAction`, `crearPaisAction`, `cambiarDisponibilidadPaisAction`,
    `arbolDePaisAction`, `crearNodoAction`, `renombrarNodoAction`, `cambiarActivacionNodoAction`,
    `contarOrdenesSinEntregarAction` y `cargarDivisionAction(formData)`;
  - orden en todas: sesión → `exigirSuperadmin` → zod → servicio dentro de
    `comoPlataforma("SL-20", motivo)`;
  - cada export lleva `@sin-superficie` porque la pantalla es de T5.3/T5.7. La guardia
    `superficie-de-uso` obliga a quitarlo cuando se cablee.
- `lib/actions/geografia.ts`: pierde las 4 escrituras, el helper zod y los imports. Cabecera actualizada.
- `lib/db/excepciones-aislamiento.ts`: entrada SL-20, con el motivo literal del design §4.
- `lib/repositories/_shared/prisma-unique.ts`: `esViolacionDeUnico(error)`. Es `true` con un P2002 o con
  el SQLSTATE `23505` en el grafo `cause`/`meta`/`driverAdapterError`, incluido el P2010 con
  `Code: \`23505\``.
- `lib/types/pais.ts`: `cambiarDisponibilidadPaisSchema` (`{id, disponible}`, `.strict()`) y su tipo.
- `lib/interfaces/repositories/IPaisRepository.ts` y `lib/repositories/PaisRepository.ts`:
  `cambiarDisponible(id, disponible, actor)` devuelve `"no_existe" | "sin_cambio" | "cambiado"`.
  - Hace un `updateMany WHERE id AND disponible <> $2`, que es el «IS DISTINCT FROM» de §5 porque la
    columna es NOT NULL.
  - Si la fila cambió, escribe `pais_disponibilidad_*` por `appendAccionPlataforma` en la misma
    transacción.
- `lib/interfaces/services/IPaisService.ts` y `lib/services/PaisService.ts`: `cambiarDisponible(input,
  actor)`. Devuelve `forbidden` (R37), `not_found`, u `ok` con `{id, disponible}`, también cuando no cambió.

Tests:
- Nuevos:
  - `tests/unit/actions/geografia-plataforma-action.test.ts` (60);
  - `tests/unit/actions/geografia-plataforma.composition-root.test.ts` (6);
  - `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` (4).
- Adaptados:
  - `tests/unit/actions/geografia-action.test.ts`: queda la lectura, más la comprobación de que las
    escrituras ya no se exportan;
  - `tests/unit/actions/geografia.composition-root.test.ts`: queda la lectura; el conteo pasa al root nuevo;
  - `tests/unit/services/pais-service.test.ts`: `repoDoble` con `cambiarDisponible` y el bloque R47;
  - `tests/integration/db/pais-repositorio.test.ts`: dos casos R47.
- Guardias:
  - `geografia-renombrado-punto-unico`: la tabla de puntos apunta a
    `geografia-plataforma.ts > renombrarNodoAction`, y hay un caso nuevo: `geografia.ts` ya no renombra;
  - `plataforma-solo-en-lista`: control positivo de que el barrido ve la action nueva, con la ficha SL-20.
- `specs/SL-20-pais-geografia-configurable/tasks.md`: solo los checkboxes de T4.3, T4.4 y T4.6.

## Decisiones dentro del design (para que las revise el leader)
1. **Qué lleva `catch`.** §4 dice «alta y renombre; mismo cambio en país y carga». Por eso
   `crearNodo`, `renombrarNodo`, `crearPais`, `cambiarDisponibilidadPais` y `cargarDivision` traducen así:
   - el único violado da `conflict` (solo en nodo, R16/R52; en país el repositorio ya devuelve
     `duplicado`);
   - cualquier otro fallo da `{status:"error"}`, con un `console.error` que lleva la operación, el nivel o
     el país y `error.name`. Ni el mensaje ni los datos de la fila.

   El retiro, el conteo y las lecturas **no** llevan `catch`: dejan subir el error, como antes, y hay un
   test que lo fija para el retiro. Si se quiere `error` también ahí, hay que decirlo.
2. **Validación de la disponibilidad en la action** (§4: zod antes del servicio). El servicio recibe la
   entrada tipada. El alta de país mantiene la validación dentro del servicio, como ya hacía T2.1.
3. **`not_found` de la carga** (pregunta 2 de T4): no hay que mapearlo. Pasa tal cual porque está en el
   contrato de §6, que ya lo nombra tras la enmienda.
4. **Validación de la carga en el borde:** `paisId` alfa-2 y `archivo` tiene que ser un `File`. Si no, da
   `validation_error` (`paisId` / `archivo`). Tamaño, extensión y UTF-8 los decide el servicio (R28).
   `bodySizeLimit` ya está en `5mb` en `next.config.ts`.
5. **T4.4, cómo prueba R32 sin mentir.** Las actions abren sus propias transacciones, así que la parte R32
   **escribe de verdad**:
   - usa el país `XS` y un superadmin sin empresa, bajo `bajoLockDeEscrituraReal`, y lo borra antes y
     después;
   - los servicios van sobre `conAislamientoPorEmpresa(cliente, async () => null)`, que es el cliente de
     producción sin sesión de empresa;
   - la contraprueba llama al mismo conteo fuera de `comoPlataforma` y cae en `EmpresaNoResuelta`. El
     contexto es lo que lo salva.

   R31 (dos empresas) va en una transacción del dueño que se revierte (el dueño equivale al contexto de
   plataforma, sin RLS). Su contraprueba con la RLS de la empresa A solo ve 2 de 3.

## Mapa R<n> → test
| R | Test |
|---|---|
| R30 | `geografia-superadmin-sin-empresa.test.ts` › «crea el país, carga un CSV, da de alta, renombra, cuenta, retira, reactiva…» (retiro y reactivación por la action); `geografia-plataforma-action.test.ts` › «el retiro NO lleva `catch`…» |
| R31 | `geografia-superadmin-sin-empresa.test.ts` › «dos empresas en XA: el superadmin ve 2 + 1 = 3 en el distrito y en la provincia; una empresa sola ve las suyas»; `geografia-plataforma.composition-root.test.ts` › «R31: el conteo usa el repositorio de órdenes» |
| R32 | `geografia-superadmin-sin-empresa.test.ts` › «crea el país, carga un CSV, da de alta, renombra, cuenta, retira, reactiva y apaga, sin EmpresaNoResuelta» + «CONTRAPRUEBA: el mismo conteo FUERA de `comoPlataforma` cae en EmpresaNoResuelta»; `geografia-plataforma-action.test.ts` › «SL-20/R32 — … corre en plataforma» (9 casos) |
| R33 | `geografia-superadmin-sin-empresa.test.ts` (las 7 filas del historial con el superadmin como actor) |
| R36 | `geografia-plataforma-action.test.ts` › «⭑ R36: alta que falla por otra causa → `error`, NO `conflict`…», «R36: renombrado — único → conflict; otra causa → error», «CONTRAPRUEBA: un Error con el texto «Unique constraint failed» pero sin código ya no es conflict», «alta de país y disponibilidad: un fallo del servicio es `error` con log» |
| R37 | `geografia-plataforma-action.test.ts` › «SL-20/R37 — un rol de empresa recibe `forbidden` antes de validar…» (9 + control positivo); `pais-service.test.ts` › «R47 (T4.6) › R37: el rol de empresa %s recibe `forbidden`…»; `geografia-action.test.ts` › «el `maestro` sigue leyendo el arbol» |
| R47 | `pais-repositorio.test.ts` › «R47 (T4.6): apagar y encender un país deja UNA fila `pais_disponibilidad_*` por cambio; pedir el mismo estado no escribe nada», «R47: si el registro en el historial falla, la disponibilidad tampoco cambia»; `pais-service.test.ts` › bloque «R47 (T4.6)»; `geografia-plataforma-action.test.ts` › «R47 — disponibilidad…» (4 de validación) y «SL-20/R47 — disponibilidad de un país por el borde, con el servicio REAL» (3); `geografia-plataforma.composition-root.test.ts` › «R47 (T4.6): …UNA transacción…» y «R47: pedir el estado que el país ya tiene es `ok` y NO escribe historial»; `geografia-superadmin-sin-empresa.test.ts` (apagado por la action) |
| R51 | `geografia-plataforma-action.test.ts` › «R51: un fallo de la base al escribir es `error`, con el país en el log» y «la carga CSV pasa tal cual el contrato» (`not_found` incluido); `geografia-plataforma.composition-root.test.ts` › «la carga CSV llega al repositorio de geografía: un país que no está es `not_found`» |
| R52 | `geografia-plataforma-action.test.ts` › «alta con P2002 (único de un modelo) → conflict (R16, R52)» y «…23505 dentro del `cause` del driver…» |
| R24, R48 (borde) | `geografia-plataforma-action.test.ts` › «SL-20/R24–R28, R48, R51 — la carga CSV pasa tal cual el contrato del servicio» (5) y «el servicio recibe el país, el nombre del archivo y sus bytes»; `geografia-superadmin-sin-empresa.test.ts` (la carga real en XS) |
| R22 (lado servidor) | `geografia-action.test.ts` › «SL-20 (design §4) — las escrituras ya no salen de este modulo» (4 + control positivo) |

## Salida real
Tests, un comando por archivo o grupo (los de integración contra `servi_logistic_sl20`):
- `tests/unit/actions/geografia-plataforma-action.test.ts`, `geografia-plataforma.composition-root.test.ts`,
  `geografia-action.test.ts` y `geografia.composition-root.test.ts` → `Test Files 4 passed (4) · Tests 79 passed (79)`.
  Tras las anotaciones y el ajuste de lint, los dos primeros → `Tests 69 passed (69)`.
- `tests/unit/services/pais-service.test.ts` → `Tests 39 passed (39)`.
- `tests/integration/db/pais-repositorio.test.ts` → `Tests 7 passed (7)`.
- `tests/integration/db/geografia-superadmin-sin-empresa.test.ts` → `Tests 4 passed (4)`.
- Guardias, una por comando, todas verdes:
  - `plataforma-solo-en-lista` 7;
  - `geografia-renombrado-punto-unico` 13;
  - `use-server-exports-async` 3;
  - `use-server-sin-reexport-de-tipos` 3;
  - `superadmin-fuera-de-empresa` 14;
  - `historial-accion-escrituras-cubiertas` 79;
  - `historial-accion-sin-datos-cliente` 28;
  - `historial-accion-punto-unico` 7;
  - `consultas-concurrentes-en-transaccion` 23;
  - `geografia-sin-borrado-fisico` 8;
  - `p2003-detector-unico` 8;
  - `fuera-datos-ordenex` 33;
  - `sql-a-mano-por-empresa` 19;
  - `geografia-predicado-unico` 10;
  - `superficie-de-uso` 18. En la primera pasada dio rojo: las 9 actions no tenían superficie. Se resolvió
    con `@sin-superficie`.

`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, exit 0, **0 errores** (una
sola corrida).

`pnpm run lint` → `✖ 230 problems (0 errors, 230 warnings)`. Antes eran 231: el test viejo del composition
root tenía `_args` sin usar. Los archivos tocados quedan sin avisos.

## Preguntas abiertas
1. **Retiro y conteo sin `catch`.** Hoy un fallo de la base en `cambiarActivacionNodoAction` o en
   `contarOrdenesSinEntregarAction` sale como excepción de la Server Action, como antes. La pantalla de
   T5.3 tiene que capturarla: R31 dice «la pantalla dice que el conteo falló y no bloquea». ¿Prefiere el
   leader `{status:"error"}` también ahí? El §4 solo lo pide para el alta, el renombre, el país y la carga.
2. **Alta de país con catálogo** (T2.4/T2.5): sigue bloqueada por la fuente de la lista ISO.
   `crearPaisAction` ya está en su sitio y no cambiará.
3. **Datos reales en la base de pruebas.** T4.4 escribe y borra el país `XS` y un superadmin `sl32-…`. Si
   la suite se corta a mitad, el `beforeAll` limpia `XS` en la siguiente corrida. Si quedara un usuario
   suelto, no molesta a nadie (email aleatorio).

Veredicto: T4.3, T4.4 y T4.6 cerradas. Los tests de las tres y las guardias están verdes, typecheck da 0
errores y lint 0 errores. Solo queda pendiente lo del catálogo ISO (T2.4/T2.5), que no es de esta tanda.
