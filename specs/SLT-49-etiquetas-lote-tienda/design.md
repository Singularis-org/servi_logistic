# SLT-49 — etiquetas-lote-tienda · design.md

> Requisitos: `requirements.md` (R1–R15). Sin tablas, sin migraciones, sin dependencias nuevas.

## Lo que ya existe

Buscado `etiqueta`, `Imprimir etiquetas`, `adminTienda` + `imprim`, `alcance` + `tienda` en
`feature_list.json` (raíz del repo), `specs/` y el código (Grep: el grafo `codebase-memory-mcp` no
tiene indexado este worktree; `list_projects` solo lista el de `dev` y el de SL-36).

| Qué apareció | Qué es | Qué se hace con ello |
|---|---|---|
| `SLT-50` «Etiquetas: limitar por dueño a mensajero y demás roles» (pending) | La otra mitad del hueco, ya acotada en «Lo que NO entra» | Nada aquí. R12 fija el comportamiento actual de esos roles para que SLT-50 lo cambie a propósito. |
| `specs/32-etiqueta-guia-qr` | Origen de `generarEtiquetas` / `EtiquetasGuiaModal`: «READ derivado abierto a cualquier rol» | Se reutiliza entero (action, service, modal, PDF en el navegador). Esta feature estrecha su autorización para `adminTienda`. |
| `specs/136-etiquetas-pdf-carga-api` | Filtro por dueño del rol `apiKey` en `EtiquetaGuiaService` (`esVisiblePara`, `EtiquetaGuiaService.ts:39-42`) | Es la regla que se extiende a `adminTienda`; su contrato «ajena = `no_encontrada`» se conserva (R7, R13). |
| FICHA 358 / 424 — `resolverAlcanceBorradoOrden` (`lib/services/alcance-borrado-orden.ts:90-99`) | Una función pura que decide el alcance «todas / propias» y que leen la página (`app/(app)/ordenes/page.tsx:161-163`) y los services | Se copia el patrón (no la función: es la regla del borrado, otra pregunta). |
| FICHA 358 en `OrdenesListado.tsx`: `haySeleccion = accionesLote \|\| puedeEliminar` (:1192), guarda `if (!accionesLote) return []` en `accionesDe` (:717), «Eliminar» fuera de `accionesDe` (:1309-1325), su modal fuera del bloque `accionesLote` (:1650-1665) | El camino ya probado para darle a la tienda UNA acción de lote | Se repite para «Imprimir etiquetas» (decisión cerrada). |
| `EtiquetaOrdenAccion` (`app/(app)/ordenes/_components/EtiquetaOrdenAccion.tsx:27-55`), montada por fila con `mostrarHistorial` (`OrdenesModule.tsx:479-488`) | La impresión individual: llama a la misma action `generarEtiquetas` con un lote de uno | No cambia de código: queda cubierta por el filtro del servidor (R8). |

Nada de lo encontrado resuelve ya la impresión por lote de la tienda.

## 1. El hueco, medido

- `EtiquetaGuiaService.esVisiblePara` (`lib/services/EtiquetaGuiaService.ts:39-42`) devuelve `true`
  para todo rol que no sea `apiKey`. `generarEtiquetas` (:47-88) y `obtenerEtiquetaPorGuia`
  (:90-102) lo usan. Para el `adminTienda` no hay frontera de tienda.
- El repositorio lee sin dueño: `findEtiquetasByIds` filtra `id in` + `deletedAt: null`
  (`lib/repositories/OrdenRepository.ts:3995-4002`) y `findEtiquetaByNumGuia` `numGuia` +
  `deletedAt: null` (:4009-4015). La frontera de EMPRESA sí existe (extensión `organizacion_id` +
  RLS, `docs/architecture.md > Multi-empresa`); la de TIENDA dentro de la empresa, no.
- La action `generarEtiquetas` (`lib/actions/etiquetas-guia.ts:58-70`) solo exige sesión.
- Hoy el `adminTienda` ya alcanza este camino sin esta feature: «Ver etiqueta» por fila
  (`OrdenesModule.tsx:488`) y `/paquete/[numGuia]` (`app/paquete/[numGuia]/page.tsx:49`). Un id o
  una guía ajenos devuelven destinatario, teléfono, dirección y monto de otra tienda.

## 2. La regla única: `resolverAlcanceEtiquetasOrden` (R14)

Archivo nuevo `lib/services/alcance-etiquetas-orden.ts`. Pura: sin Prisma, sin `next/`, sin
entorno (como `alcance-borrado-orden.ts`), para que la importen la página y el service.

```ts
export type AlcanceEtiquetasOrden =
  | { alcance: "todas" }
  | { alcance: "propias"; ownerId: string };

export function resolverAlcanceEtiquetasOrden(actor: Actor): AlcanceEtiquetasOrden
```

| Rol | Alcance | Por qué |
|---|---|---|
| `adminTienda` | `propias`, `ownerId = actor.usuarioId` | Esta feature (R7–R10). `actor.usuarioId` es el `tienda_id` de sus órdenes, el mismo hecho que usan `OrdenService.construirWhere` y `resolverAlcanceBorradoOrden` (:86-88). |
| `apiKey` | `propias`, `ownerId = actor.usuarioId` | Feature 136, sin cambio (R13). Pasa a salir de aquí en vez de `esVisiblePara`. |
| `maestro`, `admin` | `todas` | Sin cambio (R11). |
| `mensajero`, `adminSatelite`, cualquier otro | `todas` | **Comportamiento actual, a propósito** (R12). Lo cambia SLT-50 en esta misma función. |

Diferencia deliberada con el borrado: aquí el valor por defecto es `todas`, no `denegado`, porque
hoy la etiqueta es legible para todo rol con sesión (feature 32) y estrechar a los demás roles es
SLT-50. El JSDoc de la función lo dice, para que SLT-50 cambie la dirección a sabiendas.

**Quién la lee:**

- **Servidor** — `EtiquetaGuiaService` (§3): `propias` → `tiendaId` en el `where`.
- **Pantalla** — `app/(app)/ordenes/page.tsx`:
  `const puedeImprimirEtiquetasPropias = actor ? resolverAlcanceEtiquetasOrden(actor).alcance === "propias" : false;`
  Para los roles que llegan a `/ordenes` (maestro, admin, adminTienda; `page.tsx:86` hace
  `notFound` a mensajero y adminSatelite) esto es `true` solo para `adminTienda`. No hay una segunda
  lista de roles en la página (mismo argumento que `puedeEliminar`, `page.tsx:150-163`). Si SLT-50
  pusiera a otro rol en `propias`, ese rol no llega a `/ordenes`, así que la página no cambia.

## 3. Servidor: la frontera en el `where` (R7, R8, R9, R10)

### 3.1 Repositorio

`IOrdenRepository` (`lib/interfaces/repositories/IOrdenRepository.ts:1896` y :1904) y
`OrdenRepository` cambian de firma, con el dueño **obligatorio**:

```ts
findEtiquetasByIds(ids: string[], tiendaId: string | null): Promise<EtiquetaRow[]>;
findEtiquetaByNumGuia(numGuia: number, tiendaId: string | null): Promise<EtiquetaRow | null>;
```

- `tiendaId` string → `where: { ..., tiendaId }`; `null` → sin frontera de tienda (como hoy).
- Obligatorio y no opcional a propósito: un parámetro opcional que alguien olvida falla ABIERTO.
  Con `string | null` cada llamador tiene que escribir `null` y decidirlo. Hoy los dos métodos solo
  los llama `EtiquetaGuiaService` (Grep: `findEtiquetasByIds|findEtiquetaByNumGuia` en `lib/`).
- El repositorio no decide nada: recibe el valor ya resuelto (capas, `docs/architecture.md`).
- `findEtiquetaByNumGuia` usa `findFirst`, así que añadir `tiendaId` al `where` no choca con el
  único de `num_guia`.

### 3.2 Service

`EtiquetaGuiaService`:

1. `const alcance = resolverAlcanceEtiquetasOrden(actor)`;
   `const tiendaId = alcance.alcance === "propias" ? alcance.ownerId : null`.
2. Pasa `tiendaId` a los dos métodos del repo.
3. **Segunda capa:** `esVisiblePara(row, actor)` se reescribe sobre el mismo `alcance`
   (`propias` → `row.tiendaId === ownerId`). Una fila ajena que llegara (repo mal mutado, doble
   que ignora el filtro) sigue saliendo como `no_encontrada`. Es el mismo doble cinturón del
   borrado: la frontera vive en el `where`; el `if` es la red.
4. El contrato de salida no cambia: la orden ajena va a `omitidas` con `motivo: "no_encontrada"`,
   igual que una inexistente o borrada, y el resto del lote se devuelve (R7). No se usa
   `forbidden`: revelaría que la orden existe y abortaría el lote (feature 32/R3, feature 136).
5. Se actualizan los comentarios que hoy afirman lo contrario («los roles de sesión mantienen el
   comportamiento previo», :35-37 y :51-57) y el JSDoc de la action
   (`lib/actions/etiquetas-guia.ts:49-57` y :72-78). Sin cambio de código en la action.

`EtiquetasLotePdfService` y `ApiPdfEtiquetaService` llaman a `generarEtiquetas` con un actor
`apiKey`: su resultado no cambia (R13), solo el lugar donde se filtra.

### 3.3 `/paquete/[numGuia]` (R9)

Sin cambio de código en la página: `obtenerEtiquetaPorGuia` devuelve `no_encontrada` para la guía
ajena y la página ya hace `notFound()` en todo lo que no es `ok` (`page.tsx:54`). Queda sujeto a P2.

### 3.4 Autorización y módulo

- La autorización vive en el service (como la 136 y la 358); la action solo exige sesión.
- Módulo: `etiquetas-guia` es núcleo (`lib/modulos/reparto.ts:165`); no hay puerta de módulo.
- Multi-empresa: no hay query nueva. Las dos consultas tocadas siguen bajo la extensión de empresa
  y la RLS; el `tiendaId` es una frontera más estrecha, dentro de la empresa.
- País: nada depende del país.

## 4. Pantalla: `/ordenes` (R1–R6, R15)

### 4.1 `page.tsx`

Una prop nueva, `puedeImprimirEtiquetasPropias` (§2), pasada a `OrdenesListado`. `accionesLote`
no cambia (`page.tsx:101`): la tienda sigue sin acciones de flujo (R4).

### 4.2 Estados de la acción de la tienda

Módulo puro nuevo `app/(app)/ordenes/estados-etiquetas-tienda.ts` (junto a `exclude-por-rol.ts`, por
la misma razón: blindarlo con test sin arrastrar la página):

```ts
export const ESTADOS_ETIQUETAS_TIENDA: ReadonlySet<string> =
  new Set(["por_recolectar_en_tienda", "recolectando", "mensajero_recogiendo_en_bodega"]);
export const MOTIVO_SIN_GUIA = "Sin guía todavía";
```

Los tres ya son opciones del filtro de la tienda (`exclude-por-rol.ts:22-33` no los excluye). El
estado solo restringe la **acción de lote**: el servidor no filtra por estado (la impresión por fila
existe hoy en todos los estados).

### 4.3 `OrdenesListado.tsx` — patrón FICHA 358

Prop nueva `puedeImprimirEtiquetasPropias?: boolean` (por defecto `false`).

- **`haySeleccion`** (:1192) → `accionesLote || puedeEliminar || puedeImprimirEtiquetasPropias`.
- **`elegibleEtiquetasTienda(row)`**: `puedeImprimirEtiquetasPropias && !accionesLote &&
  ESTADOS_ETIQUETAS_TIENDA.has(row.estatusValue) && row.numGuia !== null`. El `!accionesLote` evita
  ofrecer la acción dos veces a un rol con las dos props (hoy ninguno).
- **`accionesDe`** no se toca: su guarda `if (!accionesLote) return []` (:717) sigue garantizando R4.
- **`accionesPara`** (:1263-1326): tras `porEstado` y antes de «Eliminar», si hay elegibles añade
  `{ key: "etiquetas", label: "Imprimir etiquetas", onRun: () => abrirEtiquetas(elegibles) }`, con
  `(N)` si `elegibles.length < seleccionadas.length` (R2). Sin elegibles no se añade (R6).
- **`haySeleccionables`** (:1199-1209): `true` también si alguna fila es elegible.
- **`bloqueoSeleccion`** (:1223-1246): con `puedeImprimirEtiquetasPropias`, una fila en
  `ESTADOS_ETIQUETAS_TIENDA` con `numGuia === null` devuelve `MOTIVO_SIN_GUIA` (motivo visible, no
  `BLOQUEO_SIN_AVISO`) (R5). Si P1 se resuelve por la otra opción, esta regla solo aplica cuando la
  fila no es `eliminable`. La regla «sin acciones y no eliminable» se amplía con «y no elegible».
- **Modal**: `EtiquetasGuiaModal` SALE del bloque `{accionesLote ? (...)}` (:1558-1562) y se monta
  una vez con `haySeleccion`, junto a `EliminarOrdenModal` (:1658-1665). Dentro del bloque se habría
  pintado el botón sin que se abra nada (el fallo mudo que describe :1654-1657). Para maestro/admin
  sigue montado (su `haySeleccion` es `true`), así que `abrirEtiquetas` y `encadenarEtiquetas`
  (:613-616) funcionan igual (R15).
- El listado de la tienda ya viene acotado a su tienda por `OrdenService.construirWhere`, así que la
  pantalla no puede marcar órdenes ajenas; la frontera real es §3.

### 4.4 Sin pantalla nueva

No hay pantalla nueva: una acción más en una barra existente y un modal existente. No pasa por
`/design`.

## 5. Tests: qué cambia de contrato y dónde se prueba cada cosa

### 5.1 Contrato que cambia (explícito)

`tests/unit/services/etiqueta-guia-service.test.ts:73-85` afirma «cualquier rol
(admin/adminTienda/mensajero/maestro) genera etiqueta, sin forbidden», con `ADMIN_TIENDA` y una
orden de `tienda-1` mientras el actor es `u-tienda`. **Con esta feature ese test deja de ser
cierto para `ADMIN_TIENDA`**: se saca `ADMIN_TIENDA` del bucle (queda maestro/admin/mensajero, R11 y
R12) y se añade un `describe` propio de la tienda. El `fakeRepo` (:37-71) pasa a simular el
`tiendaId` del `where` y a registrar con qué `tiendaId` se le llamó.

`tests/integration/actions/etiquetas-guia-action.test.ts:110-122` simula con un doble un
`forbidden` que el service real nunca devuelve (ni antes ni después de esta feature). Se deja como
está: prueba el pase sin transformar del borde, no la autorización. La autorización real de la
tienda se prueba contra Postgres (5.2), no con ese doble.

### 5.2 Mapa requisito → test

| R | Test | Nivel |
|---|---|---|
| R1, R2, R4, R5, R6 | `tests/components/OrdenesListado.etiquetas-tienda.test.tsx` (nuevo): con `puedeImprimirEtiquetasPropias` y sin `accionesLote` — casilla en los 3 estados con guía; barra con solo «Imprimir etiquetas» (+ «Eliminar» si `eliminable`); conteo `(N)`; «Sin guía todavía»; fila `en_preparacion` sin la acción | componente (jsdom) |
| R3 | `e2e/etiquetas-lote-tienda.spec.ts` (nuevo): escenario de reparto (`e2e/_escenarios/reparto.ts`), 2 órdenes de la tienda llevadas a `mensajero_recogiendo_en_bodega` con `llevarA`; la tienda (`paginaDe(browser, r.tienda)`) marca las 2, pulsa «Imprimir etiquetas», ve 2 etiquetas en la vista previa y «Descargar etiquetas» dispara una descarga `.pdf` | E2E |
| R7, R8, R10 | `tests/integration/db/etiquetas-frontera-tienda.test.ts` (nuevo), patrón `eliminar-orden-pantalla-frontera-tienda.test.ts` (`_postgres-real`, `describe.skip` sin base, nunca `return` silencioso): dos tiendas de la misma empresa, una orden con guía cada una. (a) `repo.findEtiquetasByIds([A,B], tiendaA)` → solo A, **saltándose el service**; (b) `findEtiquetaByNumGuia(guiaB, tiendaA)` → `null`; (c) service real + repo real, actor `adminTienda` A: `etiquetas` = [A], `omitidas` = [{B, no_encontrada}]; (d) lote de uno con B → vacío + `no_encontrada` | integración Postgres |
| R9 | mismo archivo, (e) `obtenerEtiquetaPorGuia(guiaB, adminTienda A)` → `no_encontrada`; la página ya mapea eso a 404 | integración Postgres |
| R11 | mismo archivo, (f) actor `maestro` → A y B; y `etiqueta-guia-service.test.ts` (maestro/admin, `tiendaId` = `null`) | integración + unit |
| R12 | `etiqueta-guia-service.test.ts`: `mensajero` y `adminSatelite` reciben la etiqueta de cualquier tienda y el repo se llama con `null` | unit |
| R13 | `etiqueta-guia-service.test.ts` (los casos `apiKey` existentes, :91-…) + caso de repo con `tiendaId` de la key | unit |
| R14 | `tests/unit/services/alcance-etiquetas-orden.test.ts` (nuevo): tabla rol → alcance; y `tests/components/OrdenesPage.test.tsx`: `adminTienda` → `puedeImprimirEtiquetasPropias` `true`, maestro/admin → `false`, con un caso que mockea `resolverAlcanceEtiquetasOrden` a `todas` para la tienda y ve la prop en `false` (prueba que la página DERIVA, no repite la lista) | unit + componente |
| R15 | `tests/components/OrdenesListadoEtiquetasChain.test.tsx` (existente, verde sin cambios) + un caso en el test nuevo: maestro con `accionesLote` ve «Imprimir etiquetas» en `en_bodega_central` y el modal abre | componente |

### 5.3 Contrapruebas obligatorias (memoria del repo: «probar el WHERE donde vive»)

El implementer las aplica, ve el ROJO y revierte; anota el resultado en `progress/impl_SLT-49.md`:

1. Quitar `tiendaId` del `where` de `findEtiquetasByIds` → ROJO en 5.2 (a). (c) sigue verde por la
   segunda capa, y es lo esperado: por eso (a) llama al repo saltándose el service. Si (a) no se
   pone rojo, el test no prueba el `where`.
2. Quitar `tiendaId` del `where` de `findEtiquetaByNumGuia` → ROJO en (b).
3. Devolver `todas` para `adminTienda` en `resolverAlcanceEtiquetasOrden` → ROJO en (c), (d), (e)
   y en el test de la página.
4. Quitar la segunda capa (`esVisiblePara`) → ROJO en el unit con un doble que ignora `tiendaId`.

### 5.4 Flujos críticos

No toca ninguno de la lista de `docs/checkpoints-proyecto.md > Flujos críticos` salvo el
aislamiento: la feature cambia una lectura de datos de negocio, así que se corre
`e2e/dos-empresas-humo.spec.ts` además del E2E nuevo.

## 6. Alternativas descartadas

1. **Darle `accionesLote` a la tienda y filtrar por rol dentro de `accionesDe`.** `accionesLote`
   también monta todos los modales de flujo, carga la lista de mensajeros (`OrdenesListado.tsx:427-430`)
   y decide cada acción de cada estado. Habría que poner un `if (rol)` en cada `case` y cualquier
   acción nueva le llegaría a la tienda por defecto. La FICHA 358 ya separó «hay casillas» de «hay
   acciones de flujo» por este motivo, y la decisión cerrada pide seguirla.
2. **Filtrar solo en el service, en memoria, como hoy hace `apiKey`.** Es la forma de menos código,
   pero la frontera quedaría en un `if` que un test con dobles no distingue de un `where` ausente
   (medido 4 veces en este repo) y el servidor seguiría leyendo de la base los datos personales de
   la otra tienda. Se queda como segunda capa, no como frontera.
3. **Responder `forbidden` al lote entero si incluye una orden ajena.** Revela que la orden existe y
   rompe «una orden inválida no aborta el lote» (feature 32/R3). El precedente (136) es
   `no_encontrada`.
4. **Restringir también por estado en el servidor para la tienda.** La impresión por fila
   («Ver etiqueta») ya existe hoy en cualquier estado para la tienda; limitarla por estado sería
   quitarle algo que nadie pidió. El estado restringe solo la oferta del lote (decisión cerrada).
5. **Parámetro `tiendaId?` opcional en el repositorio.** Se olvida en silencio y falla abierto; por
   eso es `string | null` obligatorio (§3.1).

## 7. Riesgos

- **El E2E y la descarga.** El PDF se arma en el navegador (`EtiquetasGuiaModal.tsx:288`,
  `handleDescargar`). Si la descarga no emite el evento `download` de Playwright, el E2E afirma la
  vista previa con 2 etiquetas y el botón habilitado, y lo deja anotado en `progress/impl_SLT-49.md`.
  No se sabe hasta correrlo.
- **Estado de partida del E2E.** `llevarA` no ofrece `por_recolectar_en_tienda` ni `recolectando`
  como destino (`tests/fabricas/escenarios/reparto.ts:160-165`), por eso el E2E usa
  `mensajero_recogiendo_en_bodega`. Los otros dos estados quedan cubiertos en el test de componente.
- **Stubs de `IOrdenRepository` en otros tests.** Varios tests construyen el repo con
  `as unknown as IOrdenRepository`; el cambio de firma no los rompe en tipos, pero un doble que
  ignore el segundo argumento puede ocultar el filtro. Solo cuenta `etiqueta-guia-service.test.ts`,
  que sí lo simula.
