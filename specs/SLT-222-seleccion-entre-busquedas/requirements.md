# SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos»

> Ruta **ligera** (`docs/specs.md > Tres rutas`): este archivo es todo el spec. Requisitos desde
> **R1500** (los números bajos ya están en nombres de tests de otras fichas: `R38`, `R60`, `R27`).
> Origen: Carlos, 2026-11-19: «cuando en la tabla de ordenes de toda la app yo busco o escaneo una
> orden para buscarla, puedo seleccionarla para hacer algo con ella pero si hago otra busqueda ese
> checkbox que ya había marcado se pierde, la idea es que se mantenga seleccionado».
> Zona: frontend. Sin servidor, sin esquema, sin dinero, sin permisos nuevos.

## Alcance

La persona busca (o escanea) una orden, la marca, busca o escanea la siguiente, la marca… y al
final aplica UNA acción en lote a todas las marcadas. Hoy cada búsqueda nueva borra lo marcado.

### Inventario: tablas de órdenes con casilla de selección

Buscado en `app/` y `components/` por `CeldaSeleccion`, `SelectAllCheckbox`, `Checkbox` y
`type="checkbox"`. Solo **dos** tablas de órdenes tienen selección por casilla; las dos tienen el
buscador con escaneo (`BuscadorFiltros escaneo`):

| Pantalla | Componente | Dónde vive la selección | Dónde se pierde hoy |
|---|---|---|---|
| `/ordenes` (maestro, admin, admin de tienda) | `app/(app)/ordenes/_components/OrdenesListado.tsx` monta `OrdenesModule` (`:1464`) | `OrdenesModule.tsx:291` — `Map id -> fila` (ya por id, ya acumulada entre páginas) | `OrdenesModule.tsx:353-358`: al cambiar `filterKey` (la búsqueda `q` va dentro del `filter`) hace `setSeleccion(new Map())`. Reset EXPLÍCITO. |
| `/recepcion-satelite` «Órdenes de la bodega» (admin satélite) | `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx` | `SateliteOrdenesListado.tsx:297` — `Set` de ids | `:430` `emitir()` hace `setSeleccionados(new Set())` en cada cambio de término o filtro; `:472` también en «Limpiar todo». Además, aunque sobreviviera, NO entra en la acción: `:526-529` acota `seleccionadas` a la página visible (R47 de la 170) y la poda (`:567-601`) comprueba vigencia contra el conjunto FILTRADO (`RecepcionSateliteModule.tsx:327-336`, R19/R27 de la 188), así que la búsqueda siguiente podaría lo marcado en la anterior. |

**No tienen selección por casilla** (comprobado; quedan fuera): cierres-admin (su único `Checkbox`
es el «Todos» de `DescargarGestionesDialog`), cierre del día, novedades, recolección, monitoreo,
mis-asignaciones. `app/(app)/ordenes/page.tsx:258` monta `OrdenesModule` sin `selectable`.

No hay un componente compartido de selección: `DataTable` no la posee; `CeldaSeleccion` y
`SelectAllCheckbox` (`components/shared/`) son celdas sin estado. Cada listado guarda la suya. El
arreglo se hace en los dos dueños de la selección, con el MISMO modelo (el de `OrdenesModule`:
`Map id -> fila`, acumulada) para que las dos pantallas se comporten igual.

### Otros puntos del código que este spec toca

- `OrdenesModule.tsx:401-402` y `:544-545`: la barra de acciones exige `selectable(items)` sobre
  la página visible. Si la búsqueda nueva no trae ninguna fila accionable (o trae cero), la barra
  desaparece aunque haya órdenes marcadas de búsquedas anteriores.
- `OrdenesModule.tsx:432-434`: desmarcar el «seleccionar todo» del encabezado vacía la selección
  ENTERA (asimetría pedida por un humano). Cambia por D6.
- `OrdenesListado.tsx:1429` + `:628-631` + `:599-606`: la recepción por escaneo («Recibir paquete»)
  termina en `handleSuccess` → `revalidarTablas` → `resetSeleccion`, o sea que recibir un paquete
  también vacía lo marcado, aunque no es una acción sobre la selección.
- `OrdenesListado.tsx:1336`: con el interruptor «Eliminadas» puesto, `accionesPara` devuelve solo
  «Recuperar» para TODA la selección. Mezclar en una selección órdenes vivas y borradas ofrecería
  «Recuperar» sobre órdenes vivas.

### Estado y acciones de una orden marcada que ya no se ve (verificado)

- `/ordenes`: `seleccionadas` (`OrdenesModule.tsx:518-524`) toma de la página las filas visibles
  (dato fresco de SWR) y, para las de fuera, la fila tal como estaba al marcarla. `accionesPara`
  (`OrdenesListado.tsx:1328-1410`) acota cada acción al subconjunto cuyo `estatusValue` la admite
  y pone «(N)» si no es toda la selección; varias `abrir*` filtran además por zona o estado
  (`abrirAsignarBodega:474`, `abrirRutearSatelite:492`, `abrirRetirarCentral:498`,
  `abrirRecuperar:528`). El servidor revalida cada transición (comentarios en esas funciones).
  Si la fila guardada está desactualizada, el cliente puede ofrecer una acción que el servidor
  rechaza: ese riesgo YA existe hoy con la selección entre páginas; esta ficha lo reduce
  (R1509) pero no cambia cómo informan los modales un rechazo.
- `/recepcion-satelite`: los botones salen de `hayEstado` sobre lo seleccionado y se habilitan
  solo con estado común (`:603-627`, `:747-819`); la poda retira las órdenes que salieron del
  listado.

### Lo que ya existe (buscado antes de escribir)

Buscado en `feature_list.json` (`selección`, `seleccionad`, `checkbox`, `casilla`), en `specs/`
(`selección acumulada|se mantiene|sobrevive`, `entre búsquedas`, `al cambiar el filtro`) y en el
código: **no hay ficha ni spec que lo cubra.** Lo que aparece son las reglas CONTRARIAS que esta
ficha sustituye (no lo re-crea; las cambia por pedido de Carlos):

| Regla vigente | Dónde | Qué pasa con ella |
|---|---|---|
| R60 de la 144: cambiar el filtro limpia la selección | `specs/144-filtros-ordenes/requirements.md:85`; test `tests/unit/components/ordenes-module-filter-key.test.tsx:167` | sustituida por R1501/R1502 |
| R38 de la 169: cambiar el término limpia la selección | test `tests/unit/components/ordenes-module-busqueda.test.tsx:153` | sustituida por R1501 |
| R47 de la 170: en la satélite la selección que actúa es la de la página visible | `specs/170-export-todas-las-tablas/requirements.md:227` | sustituida por R1505 en la satélite (`/ordenes` ya actuaba sobre lo acumulado) |
| R27 de la 188: cambiar los filtros limpia la selección entera | `specs/188-deuda-170-listados-completos/requirements.md:179`; test `tests/components/paginacion/SateliteSeleccionOtrasPaginas.test.tsx:596` | sustituida por R1502 |
| R19/R25 de la 188: la poda comprueba contra el conjunto FILTRADO | `RecepcionSateliteModule.tsx:313-336` | cambia a «el listado de la bodega sin filtros» (R1514); R18, R20-R24, R26 y R28 siguen |

Se reutiliza: el modelo `Map id -> fila` de `OrdenesModule`, `SelectAllCheckbox`, `CeldaSeleccion`,
el botón «Limpiar» de la barra de `/ordenes`, la señal `resetSeleccion` (contador) para vaciar
desde fuera, `listarIdsVigentesBodega` (sin cambios de servidor: hoy acepta llamarse sin filtros).

### Lo que NO entra

- Guardar la selección al salir de la pantalla o recargar: vive en memoria de la pantalla.
- Una lista o panel para VER cuáles son las marcadas que no están a la vista (D7).
- Cambiar cómo informa cada modal una orden que el servidor rechaza.
- Tablas que no son de órdenes, y las pantallas sin casilla del inventario.
- Cambios de servidor, esquema o permisos.

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Requisitos |
|---|---|---|---|
| D1 | La selección sobrevive a búsqueda, escaneo, filtros, vistas, «Limpiar todo» de la barra, paginación y orden; y la acción en lote actúa sobre TODAS las marcadas | Carlos, 2026-11-19 (pedido) | R1500-R1505 |
| D2 | Mismo modelo en las dos pantallas (`Map id -> fila`, acumulada), no un arreglo distinto por pantalla | Leader, 2026-11-19 (un mismo flujo = un comportamiento) | R1500, R1505 |
| D3 | Se vacía con «Limpiar» y tras una acción en lote con éxito | Leader, 2026-11-19 | R1507, R1508 |
| D4 | «Recibir paquete» no es una acción sobre la selección: revalida sin vaciar | spec_author, 2026-11-19 (del código: `OrdenesListado.tsx:1429`) | R1510 |
| D5 | El interruptor «Eliminadas» SÍ vacía la selección: cambia el universo y la barra ofrecería «Recuperar» sobre órdenes vivas (`OrdenesListado.tsx:1336`) | spec_author, 2026-11-19 | R1511 |
| D6 (P1) | Desmarcar «seleccionar todo» del encabezado en `/ordenes` solo quita lo visible; el borrado total queda en «Limpiar». Sustituye la asimetría anterior (`OrdenesModule.tsx:426-434`; el test `ordenes-module.test.tsx:263` se reescribe) | Carlos, 2026-11-19 («si es solo aprobar pues aprueb», con la recomendación del spec) | R1507, R1513 |
| D7 (P2) | En esta ficha NO se muestra la lista de las marcadas fuera de la vista; solo su número | Carlos, 2026-11-19 | R1506 |
| D8 (P3) | Texto del contador: «N seleccionadas · M fuera de esta búsqueda» | Carlos, 2026-11-19 | R1506 |

## Requisitos (EARS)

Aplican a las dos pantallas del inventario salvo que digan otra cosa.

**R1500** — El sistema DEBE identificar cada orden marcada por su id y DEBE conservar los datos de
su fila, de modo que pueda mostrarse marcada y entrar en una acción aunque no esté en el resultado
visible.

**R1501** — CUANDO el usuario cambie el término del buscador, escribiéndolo o escaneándolo, el
sistema DEBE conservar todas las órdenes marcadas.

**R1502** — CUANDO el usuario cambie un filtro de la barra, ponga o retire un filtro, aplique una
vista guardada o pulse «Limpiar todo» de la barra de filtros, el sistema DEBE conservar todas las
órdenes marcadas.

**R1503** — CUANDO el usuario cambie de página, de tamaño de página o de orden, el sistema DEBE
conservar todas las órdenes marcadas.

**R1504** — CUANDO una orden marcada vuelva a aparecer en el resultado visible, su casilla DEBE
mostrarse marcada.

**R1505** — CUANDO el usuario ejecute una acción en lote, el sistema DEBE ofrecerla y aplicarla
sobre todas las órdenes marcadas que la admiten, estén o no en el resultado visible. En la
satélite, la regla de estado común (botón habilitado solo si todas las marcadas comparten estado)
DEBE evaluarse sobre todas las marcadas, y el aviso «…marcadas en otras páginas que no entran en
esta acción» DEBE dejar de mostrarse.

**R1506** — MIENTRAS haya al menos una orden marcada, el sistema DEBE mostrar la barra de selección
con el número TOTAL de marcadas, aunque el resultado visible esté vacío o no tenga ninguna fila
seleccionable. SI alguna de las marcadas no está en el resultado visible, ENTONCES el contador DEBE
decir además cuántas no se ven, con el texto «N seleccionadas · M fuera de esta búsqueda» (D8).

**R1507** — CUANDO el usuario pulse «Limpiar» en la barra de selección, el sistema DEBE desmarcar
todas las órdenes, visibles o no. La satélite DEBE ofrecer ese botón, como `/ordenes`.

**R1508** — CUANDO una acción en lote termine con éxito, el sistema DEBE desmarcar todas las
órdenes, sin romper el encadenado «Generar guía / Asignar → etiquetas» del mismo lote en
`/ordenes`.

**R1509** — CUANDO una orden marcada aparezca en un resultado recibido del servidor, el sistema DEBE
sustituir los datos guardados de esa orden por los recibidos, de modo que las acciones ofrecidas y
su conteo «(N)» se decidan con el último estado conocido de cada orden.

**R1510** — CUANDO termine una recepción por escaneo («Recibir paquete») en `/ordenes`, el sistema
DEBE revalidar el listado y NO DEBE desmarcar las órdenes.

**R1511** — CUANDO el usuario ponga o quite el interruptor «Eliminadas» en `/ordenes`, el sistema
DEBE desmarcar todas las órdenes.

**R1512** — CUANDO el usuario marque la casilla «seleccionar todo» del encabezado, el sistema DEBE
añadir a la selección solo las filas seleccionables del resultado visible y DEBE conservar las
marcadas fuera de él.

**R1513** — CUANDO el usuario desmarque la casilla «seleccionar todo» del encabezado, el sistema
DEBE desmarcar las filas del resultado visible y NO DEBE desmarcar las que estén fuera de él;
desmarcar todo, visible o no, es solo «Limpiar» (D6).

**R1514** — En la satélite, la comprobación de vigencia de las marcadas fuera de la vista DEBE
hacerse contra el listado de la bodega del actor SIN filtros ni búsqueda: una orden marcada en una
búsqueda anterior NO DEBE retirarse por no cumplir la búsqueda actual, y una orden que salió del
listado (p. ej. por un incidente o una transición) DEBE retirarse.

## Tasks

- [x] **T1 — `/ordenes`: la selección no se vacía por filtro.** En `OrdenesModule`: quitar
  `setSeleccion(new Map())` del reset por `filterKey` (`:353-358`; la vuelta a la página 1 se
  queda); la barra se muestra con `seleccion.size > 0` cuando la pantalla admite selección
  (`selectable !== false`), no con `selectable(items)`; contador total + «M fuera de esta
  búsqueda»; al recibir `items`, refrescar en el `Map` las filas marcadas presentes (R1509, patrón
  «ajustar estado durante el render» o derivado, sin efecto que encadene renders); encabezado según
  R1512/R1513 (D6). *Hecho:* R1500-R1506, R1509, R1512, R1513 con tests de componente en
  `tests/unit/components/ordenes-module-seleccion-entre-busquedas.test.tsx` (marcar con `q`
  «juan», cambiar a «pedro», la marca sigue, el contador dice total y fuera de vista, la barra
  sigue con resultado vacío, la acción recibe las dos filas). Los tests `R38` y `R60` existentes
  se reescriben al comportamiento nuevo (no se borran).
- [x] **T2 — `/ordenes`: quién vacía.** En `OrdenesListado`: `handleSuccess` de la recepción
  (`:1429`) revalida sin subir `resetSeleccion` (separar «revalidar» de «revalidar y vaciar»); el
  cambio de `verEliminadas` sube `resetSeleccion`. *Hecho:* R1507, R1508 (incluido que el
  encadenado guía → etiquetas recibe el lote), R1510, R1511 con tests de componente;
  `tests/unit/components/recuperar-orden.ui.test.tsx` sigue verde (su helper depende de que
  «Eliminadas» vacíe).
- [x] **T3 — Satélite: mismo modelo.** En `SateliteOrdenesListado`: `Set` → `Map id -> fila`;
  `emitir()` y `limpiarFiltros()` dejan de vaciar; `seleccionadas` = todas las marcadas (página
  fresca + guardadas, como `OrdenesModule`) para botones, `hayEstado` y estado común; contador
  total + fuera de vista; fuera el aviso Q-K7; botón «Limpiar»; prop `resetSeleccion` (contador)
  que `RecepcionSateliteModule` sube tras cada acción con éxito (asignar, deshacer, cambiar día,
  enviar a central, recuperar); refresco de filas marcadas al llegar la página (R1509). En
  `RecepcionSateliteModule.comprobarVigencia`: consultar sin el `filtro` vigente (solo `ids`), y
  mantener el corte de `filtroSinResultados` fuera de la poda. [P] con T1/T2. *Hecho:* R1500-R1509,
  R1512-R1514 con tests de componente en
  `tests/components/SateliteOrdenesListado.seleccion-entre-busquedas.test.tsx`; se reescriben al
  comportamiento nuevo los casos de `SateliteSeleccionOtrasPaginas.test.tsx` (R27 de la 188, aviso
  Q-K7) y los de `SatelitePaginacion.test.tsx` que dependan de que filtrar vacíe.
- [x] **T4 — E2E.** Un escenario por pantalla: buscar A, marcar, buscar B, marcar, la barra dice
  2 y la acción las recibe a las dos. *Hecho:* verde en local con base desechable
  (`docs/perfil-agentes.md > E2E en local antes del PR`), junto con los E2E existentes que cubren
  `/ordenes` y `e2e/recepcion-satelite.spec.ts`.
  *Estado (implementer, 2026-11-19):* `e2e/seleccion-entre-busquedas.spec.ts` escrito; NO corrido
  en local (pide build + base desechable). Pendiente de verde en local antes del PR.
- [x] **T5 — Specs anteriores.** Anotar en `specs/144-filtros-ordenes/requirements.md` (R60),
  `specs/170-export-todas-las-tablas/requirements.md` (R47) y
  `specs/188-deuda-170-listados-completos/requirements.md` (R19, R25, R27) «sustituido por SLT-222
  R15xx», sin borrar el texto. *Hecho:* las tres notas en el diff.

Orden: T1 ∥ T3 [P]; T2 tras T1 (mismo `resetSeleccion`); T4 y T5 al final.

## Archivos esperados

- `app/(app)/ordenes/_components/OrdenesModule.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx`
- `tests/unit/components/ordenes-module-seleccion-entre-busquedas.test.tsx`
- `tests/unit/components/ordenes-module-busqueda.test.tsx`
- `tests/unit/components/ordenes-module-filter-key.test.tsx`
- `tests/unit/components/ordenes-module.test.tsx`
- `tests/unit/components/recuperar-orden.ui.test.tsx`
- `tests/components/SateliteOrdenesListado.seleccion-entre-busquedas.test.tsx`
- `tests/components/paginacion/SateliteSeleccionOtrasPaginas.test.tsx`
- `tests/components/paginacion/SatelitePaginacion.test.tsx`
- `tests/components/RecepcionSateliteModule.test.tsx`
- `e2e/seleccion-entre-busquedas.spec.ts`
- `specs/144-filtros-ordenes/requirements.md`
- `specs/170-export-todas-las-tablas/requirements.md`
- `specs/188-deuda-170-listados-completos/requirements.md`
- `specs/SLT-222-seleccion-entre-busquedas/requirements.md`

## Tamaño

18 archivos (tope 40; 80% = 32). Producción estimada ~200 líneas (tope 1000); tests ~600 líneas
(tope 3000). Cabe en un PR. Ruta ligera confirmada: ni dinero, ni permisos, ni autenticación, ni
integraciones, ni esquema; la única llamada al servidor que cambia es `listarIdsVigentesBodega`
con menos parámetros (ya los admite opcionales).

## Preguntas abiertas

Ninguna. P1, P2 y P3 se cerraron el 2026-11-19 (D6, D7, D8).
