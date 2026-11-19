# SLT-210 «Satélite: Vistas y ordenamiento en Órdenes de la bodega, como en Órdenes»

> Ruta **ligera** (`docs/specs.md > Tres rutas`): este archivo es todo el spec. Requisitos desde **R1400**.
> Origen: Carlos, 2026-11-19 (ronda de Preview). No es una regresión: prod tampoco lo tiene.

## Alcance

«Órdenes de la bodega» (`/recepcion-satelite/en-bodega`, `SateliteOrdenesListado`) gana los dos
controles que la barra de `/ordenes` ya tiene y la satélite no:

1. el selector **«Vistas»** (vistas de filtros guardadas, ficha 453), y
2. los dos **conmutadores de orden** (campo: fecha de creación / número de remisión; dirección:
   ascendente / descendente; fichas 356, 423 y 428).

Se reusan los componentes, tipos y persistencia de `/ordenes`; no hay diseño nuevo ni pantalla
nueva. El ordenamiento lo resuelve el servidor, sobre el mismo conjunto acotado a la zona/bodega
del `adminSatelite` que ya se lista hoy.

### Lo que ya existe (buscado antes de escribir)

Buscado en `feature_list.json` («Vistas», «ordenar», «ordenamiento»), en `specs/`
(`superficie … satelite`, `sortBy … satelite`) y en el código: **no hay ficha ni spec que lo
cubra.** Sí existe, y se reutiliza tal cual:

| Pieza | Dónde | Cómo se reutiliza |
|---|---|---|
| Control «Vistas» | `components/shared/VistasFiltro.tsx`, montado por `BuscadorFiltros` vía la prop `vistas` | se le pasa la prop `vistas` desde la satélite, como hace `OrdenesListado` |
| Persistencia de vistas | tabla `vista_filtro` (`usuario_id`, `superficie` TEXT), `lib/actions/vistas-filtro.ts`, `VistaFiltroService` | **sin migración**: encender una superficie es añadir una cadena a `SUPERFICIES_VISTA` (`lib/types/vista-filtro.ts`, R32 de la 453) |
| Formato y aplicabilidad de la vista | `VistaFiltroPayload`, `catalogoCargado`/`catalogoNoDisponible` (`lib/utils/vista-filtro-aplicabilidad.ts`) | el mismo; la satélite ya tiene los tres estados que guarda una vista (término, filtros puestos, selección) |
| Siembra de la barra al aplicar | prop `siembra` de `BuscadorFiltros` y de `FilterComponent` | la misma costura que `/ordenes` |
| Conmutadores | `components/shared/SegmentedToggle.tsx` con `soloIcono` | el mismo componente |
| Opciones, etiquetas y valores iniciales del orden | `app/(app)/ordenes/_components/ordenamiento-ordenes.ts` (`OPCIONES_CAMPO_ORDEN`, `OPCIONES_DIRECCION`, `ETIQUETA_*`, `CAMPO_ORDEN_INICIAL`, `DIRECCION_ORDEN_INICIAL`, `ordenamientoDe`) | se IMPORTAN; la satélite ya importa `ordenes-filtros-def.ts` de esa carpeta (mismo precedente) |
| Contrato del orden | `lib/types/ordenamiento-listado.ts` (`DireccionOrden`, `esquemaOrdenamiento`, `claveDeOrden`) | `esquemaOrdenamiento` en el borde de la satélite; `claveDeOrden` en la clave de SWR |
| Clave de orden por remisión | columna generada `orden.clave_remision` (`COLLATE "C"`, ficha 423) | la misma columna en el `ORDER BY` de la satélite |
| Orden del servidor de la satélite | `ordenBodegaSatelite()` en `lib/repositories/OrdenRepository.ts` (grupo de estado → `prioridad DESC` → `created_at DESC` → `id ASC`), compartido por la página y la descarga | hoy es FIJO: no acepta campo ni dirección. Es lo único de servidor que cambia |

**Alcance comprobado en el código.** El `WHERE` de la satélite (`condicionesSatelite`) empieza por
`o."zona_id" = ${filtro.zonaId}` + `deleted_at IS NULL` + paso por bodega satélite + estados del
listado, y `zonaId` sale del usuario (`findUsuarioZonaId`), nunca de la entrada (el schema es
`.strict()`). El orden solo cambia el `ORDER BY`, que se aplica DESPUÉS de ese `WHERE`: no puede
traer órdenes de otra zona. R1404 lo deja probado contra la base real.

### Lo que NO entra

- La nota «Las órdenes prioritarias se muestran primero…» y el aviso de agrupación por serie que
  pinta `/ordenes` (`notaPrioridad`, `NOTA_AGRUPACION_SERIE`): la satélite no los tiene hoy y no
  se piden. P2 se cerró manteniendo el agrupado por estado, así que siguen fuera.
- Guardar el ORDEN dentro de una vista (decisión P1 de la 453: el orden no entra en la vista).
- Publicar o compartir vistas entre personas (decisión 7 de la 453); P1 lo confirmó: son de cada
  usuario.
- Ordenar por otros campos (guía, estado…): solo los dos que ofrece `/ordenes`.
- «Por recibir» y las demás secciones de `/recepcion-satelite`: solo «Órdenes de la bodega».

## Decisiones cerradas (no reabrir)

| # | Decisión | Quién / cuándo | Requisitos |
|---|---|---|---|
| D1 | Se REUSAN los componentes, tipos y persistencia de `/ordenes`; mismo flujo en dos roles = un componente con props, sin diseño nuevo | Leader, pedido de Carlos 2026-11-19 | R1400, R1401, R1409 |
| D2 | Tamaño de los controles: el MISMO que tienen hoy «Vistas» y los conmutadores en `/ordenes` (32 px, `h-8`/`size-8`), sin cambiar los componentes compartidos (P3) | Leader 2026-11-19 (P3) | R1413 |
| D3 | Orden y vistas actúan SOLO sobre las órdenes de la satélite (alcance por zona/bodega del actor) | Leader 2026-11-19 | R1404, R1405 |
| D4 | No es regresión; va en esta release | Carlos 2026-11-19 | (alcance) |
| D5 | Las vistas son de cada usuario, como en `/ordenes` (P1) | Carlos 2026-11-19 | R1412 |
| D6 | Se mantiene el agrupado por estado; el orden elegido manda dentro de cada grupo y el orden por defecto queda igual que hoy (P2) | Carlos 2026-11-19 | R1401, R1403 |

## Requisitos (EARS)

### Orden

**R1400** (Ubicuo). La barra de «Órdenes de la bodega» DEBE mostrar, al inicio de la fila y en
este orden, el control «Vistas», el conmutador de campo de orden y el conmutador de dirección, con
los mismos nombres accesibles, tooltips, iconos y opciones que la barra de `/ordenes`.

**R1401** (Ubicuo). Al entrar a la pantalla, los conmutadores DEBEN mostrar «Fecha de creación» y
«Más recientes», y el listado DEBE llegar en el mismo orden que llega hoy (sin regresión del orden
por defecto).

**R1402** (Por evento). CUANDO la persona cambia el campo o la dirección del orden, el sistema DEBE
pedir al servidor la página 1 con ese orden y pintar las filas en ese orden; cambiar el campo NO
DEBE cambiar la dirección puesta, y la página pre-cargada con el orden por defecto NO DEBE pintarse
como si respondiera al orden nuevo.

**R1403** (Ubicuo). El servidor DEBE ordenar el listado por: rango de grupo de estado
(`ESTADOS_BODEGA_SATELITE`), `prioridad` descendente, el campo elegido en la dirección elegida
(fecha de creación, o la clave de remisión `clave_remision` para «número de remisión») y el `id`
ascendente como desempate; sin campo ni dirección en la entrada, DEBE aplicar fecha de creación
descendente. El agrupado por estado se mantiene delante: el orden elegido manda DENTRO de cada
grupo (P2 / D6, Carlos 2026-11-19).

**R1404** (Ubicuo). Para cualquier combinación de campo y dirección, el conjunto de órdenes y el
total que devuelve el servidor DEBEN ser los mismos que sin orden explícito: solo órdenes de la
zona del actor que pasaron por su bodega satélite; una orden de otra zona NO DEBE aparecer en
ninguna página ni en la descarga.

**R1405** (Condicional). SI la entrada trae un campo de orden fuera de la lista blanca
(`created_at`, `num_remision`) o una dirección distinta de `asc`/`desc`, ENTONCES el sistema DEBE
responder `validation_error` sin consultar la base.

**R1406** (Por evento). CUANDO la persona descarga el listado, el archivo DEBE salir en el mismo
orden vigente en pantalla (la fila N del archivo es la fila N al pasar páginas).

**R1407** (Por evento). CUANDO la persona pulsa «Limpiar todo», el sistema DEBE vaciar búsqueda y
filtros y NO DEBE cambiar el orden puesto.

### Vistas

**R1408** (Por evento). CUANDO la persona guarda una vista en «Órdenes de la bodega», el sistema
DEBE guardar el término de búsqueda, los filtros puestos y sus valores, y NO DEBE guardar el orden.

**R1409** (Por evento). CUANDO la persona aplica una vista, el sistema DEBE reponer a la vez el
término, los filtros puestos y sus valores, volver a la página 1, marcar esa vista como puesta y
NO DEBE cambiar el orden.

**R1410** (Por evento). CUANDO, con una vista puesta, la persona cambia la búsqueda, un filtro o
pulsa «Limpiar todo», el sistema DEBE dejar de marcar esa vista como puesta.

**R1411** (Ubicuo). Las vistas de «Órdenes de la bodega» DEBEN guardarse en una superficie propia:
las vistas guardadas en `/ordenes` NO DEBEN aparecer en la satélite, ni al revés.

**R1412** (Ubicuo). Las vistas DEBEN ser **de cada usuario**: un `adminSatelite` NO DEBE ver,
aplicar, renombrar ni borrar las vistas de otro usuario, igual que en `/ordenes` (P1 / D5, Carlos
2026-11-19).

**R1413** (Ubicuo). En «Órdenes de la bodega», «Vistas» y los cuatro botones de los conmutadores
DEBEN tener el MISMO tamaño que tienen hoy en `/ordenes` (32 px en todas las anchuras: `h-8` y
`size-8`), y el sistema NO DEBE cambiar los componentes compartidos (`VistasFiltro`,
`SegmentedToggle`) para ello (P3 / D2, 2026-11-19).

**R1414** (De estado). MIENTRAS el catálogo geográfico o el de estados no haya cargado, el control
«Vistas» NO DEBE presentar ninguna vista como incompleta (mismo criterio que R29 de la 453).

## Tasks

- [x] **T1 — Orden en el servidor.** `sortBy`/`sortDir` en el borde de la satélite con
  `esquemaOrdenamiento(["created_at","num_remision"], "created_at", "desc")` sobre la base de
  `listarOrdenesBodegaPaginadoSchema` (la descarga lo hereda; la vigencia lo omite: el orden no
  cambia la pertenencia). `RecepcionSateliteFiltro` lleva el orden; `ordenBodegaSatelite(orden)`
  sustituye solo el término `created_at DESC` por la columna de la lista blanca
  (`created_at` | `clave_remision`) y la dirección, con `Prisma.sql` sin interpolar texto del
  cliente. *Hecho:* R1401 (por defecto idéntico), R1403, R1405 y R1406 con tests unitarios del
  borde y del servicio, y R1404 con un test de integración contra la base real que siembra órdenes
  de dos zonas y comprueba ids, orden y total por cada combinación.
- [x] **T2 — Superficie de vistas.** Añadir la superficie de la satélite (`"ordenes-bodega-satelite"`)
  a `SUPERFICIES_VISTA`. *Hecho:* la guardia `vistas-superficies-declaradas` en verde (la
  superficie está montada) y R1411/R1412 probados en el servicio o la acción con la superficie
  nueva. Depende de T3 para que la guardia pase (van en el mismo commit).
- [x] **T3 — Barra de la satélite.** En `SateliteOrdenesListado`: los dos `SegmentedToggle`
  (opciones importadas de `ordenamiento-ordenes.ts`) y la prop `vistas` + `siembra` de
  `BuscadorFiltros`/`FilterComponent`, con `aplicarVista`, `vistaPuestaId` y `catalogoVistas` como
  en `OrdenesListado`. El listado emite el orden al módulo; `RecepcionSateliteModule` lo mete en la
  clave de SWR (`claveDeOrden`), vuelve a la página 1, no usa la página pre-cargada con otro orden y
  pasa el orden a la descarga. *Hecho:* R1400, R1402, R1407-R1410 y R1414 con tests de componente.
- [x] **T4 — Tamaño en móvil.** «Vistas» y los conmutadores de la barra a `h-8 max-md:h-11`
  (32/44), sin tocar los otros usos de `SegmentedToggle` (portal del mensajero, cierres, histórico).
  *Hecho:* R1413 con test de componente sobre las clases en las dos barras. Espera a P3.
  **Resuelta por P3 (2026-11-19):** mismo tamaño que hoy en `/ordenes` (`h-8`/`size-8`), sin tocar
  los componentes compartidos; no hay cambio de código y R1413 se prueba como «mismo alto que
  `/ordenes`, sin el alto táctil».
- [x] **T5 — E2E.** Ampliar `e2e/recepcion-satelite.spec.ts`: invertir el orden, guardar y
  aplicar una vista en la satélite. *Hecho:* verde en local con base desechable
  (`docs/perfil-agentes.md > E2E en local antes del PR`).

Orden: T1 ∥ (T2+T3) [P]; T4 tras P3; T5 al final.

## Archivos esperados

- `lib/types/recepcion-satelite.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/interfaces/services/IRecepcionSateliteService.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/services/RecepcionSateliteService.ts`
- `lib/types/vista-filtro.ts`
- `app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx`
- `app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx`
- `app/(app)/recepcion-satelite/_components/satelite-ordenes-filtros.ts`
- `components/shared/VistasFiltro.tsx`
- `components/shared/SegmentedToggle.tsx`
- `tests/unit/services/recepcion-satelite-paginado.test.ts`
- `tests/unit/services/recepcion-satelite-completo.test.ts`
- `tests/unit/repositories/satelite-paginado-where.test.ts`
- `tests/integration/db/satelite-orden-sql-real.test.ts`
- `tests/components/SateliteOrdenesListado.vistas-orden.test.tsx`
- `tests/unit/guards/vistas-superficies-declaradas.guardia.test.tsx`
- `tests/unit/utils/vista-filtro-payload.test.ts`
- `e2e/recepcion-satelite.spec.ts`

## Tamaño

19 archivos (tope 40; 80% = 32). Producción estimada ~250 líneas (tope 1000); tests ~700 líneas
(tope 3000). Cabe en un PR.

## Preguntas (cerradas el 2026-11-19)

- **P1** → por usuario, como `/ordenes` (Carlos). D5, R1412.
- **P2** → opción (a): se mantiene el agrupado por estado y el orden manda dentro de cada grupo; el
  orden por defecto no cambia (Carlos). D6, R1403.
- **P3** → mismo tamaño que hoy en `/ordenes`, sin tocar los componentes compartidos (leader: es
  pantalla de oficina; los 44 px son de la PWA del mensajero). D2, R1413.

El planteamiento original de cada pregunta, por registro:

**P1 — ¿Las vistas de la satélite son de cada usuario o compartidas por la empresa?** (Carlos)
Hoy en `/ordenes` son **de cada usuario**: la tabla `vista_filtro` cuelga de `usuario_id` (sin
`organizacion_id`), el dueño sale de la sesión y nunca de la entrada, y «publicar una vista para la
oficina» quedó fuera a propósito en la 453 (decisión 7), con el modelo preparado para añadirlo
después sin migrar claves. **Recomendación: por usuario, igual que `/ordenes`.** Compartirlas
exigiría permisos de quién edita/borra una vista común y una migración (ruta completa), y no hay
un motivo propio de la satélite para hacerlo distinto. R1412 está escrito con esta opción.

**P2 — ¿El orden respeta la agrupación por estado de hoy?** (Carlos)
Hoy la satélite ordena primero por grupo de estado (por recoger, en bodega, por devolver…) y
`/ordenes` no agrupa. Dos opciones:
- (a) **Recomendada:** mantener el grupo de estado y la prioridad delante; el conmutador decide el
  orden DENTRO de cada grupo. Por defecto el listado queda idéntico al de hoy y no se toca el
  contrato vigente (R51 de la 170, R7 de la 101). Coste: sin filtro de estado, «Más antiguas» no
  pone arriba la orden más antigua de toda la bodega, sino la más antigua del primer grupo.
- (b) Igual que `/ordenes`: prioridad y luego el campo elegido, sin grupo. Cambia el orden por
  defecto de la satélite y obliga a revisar qué hace `prioridad` en estados distintos de «en
  bodega satélite» (hoy solo se resalta ahí).
R1403 está escrito con (a).

**P3 — Tamaño en móvil de «Vistas» y los conmutadores.** (Carlos)
En el código, tras SLT-202 el campo de búsqueda, la cámara, «Filtros» y «Limpiar todo» miden 44 px
en móvil, pero «Vistas» y los conmutadores de `/ordenes` siguen en 32 px en todas las anchuras
(`VistasFiltro` usa `h-8`; `SegmentedToggle` con `soloIcono` usa `size="icon"`, 32 px). Para que
midan 44 px en móvil como se pide, el cambio va en los componentes compartidos y **también cambia
`/ordenes` en móvil** (escritorio queda igual que prod). **Recomendación: sí, en las dos pantallas**,
para que la satélite y `/ordenes` sigan siendo iguales; si Carlos prefiere no tocar `/ordenes`, T4
sale de esta ficha y la satélite queda igual que `/ordenes` hoy (32 px también en móvil).
