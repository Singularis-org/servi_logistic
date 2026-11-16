# SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos» — requirements

Ruta: **ligera** (zona fullstack, complejidad low). Este archivo es el spec entero: no hay
`design.md` ni `tasks.md`. Requisitos: **R670-R679**, con el rango **R670-R689** reservado (el último
rango en uso es el R650-R669 de SLT-174 «Quitar el alias ganaLaTienda y los restos de la cascada del
mensajero»).

**Sin código de producción.** El diff solo toca `tests/` y `tests/baseline-rojos.json`. Si al
implementar hiciera falta tocar `lib/`, `app/` o `components/`, se para: la ficha pasaría a la ruta
completa (ver la pregunta abierta P1).

## Origen

Es la rebanada C del corte de SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres
sin uso» (`specs/SLT-172-limpieza-pago-neto/requirements.md:9-11,85,91`). Viene de dos hallazgos
menores del review de SLT-169 «Se le paga hoy a la tienda con todos los cobros restados»:

- **H2** (`progress/review_SLT-169.md:48`): las pruebas «real» que la trazabilidad da para R621 y R623
  están en el baseline y nunca han corrido en verde, porque les falta el corpus.
- **H3** (`progress/review_SLT-169.md:49`): la guardia R631 solo ve imports directos; un import
  transitivo (A → B → `cifras-cierre`) se le escapa.

Los requisitos de origen son SLT-169 R621, R623 y R631
(`specs/SLT-169-pago-tienda-neto/requirements.md:64-67,70-72,106-109`).

## Lo que ya existe

Buscado `R621`, `R623`, `R631`, `baseline`, `datos propios`, `fksDeOrden`, `crearFksDeOrden`,
`transitiv`, `cifras-cierre` en `feature_list.json`, `specs/`, `tests/` y `lib/`, con Grep/Read. No usé
el grafo.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | Solo esta ficha. SL-31 «Tests de integración con datos propios y base migrada en CI» está `done`, pero no tocó estos dos archivos. | Se sigue. No es duplicado. |
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` (SL-11, reutilizado por SL-31) | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`. Crean el usuario, la tienda y la zona dentro de la tx del test. Solo leen catálogos por clave y lanzan si falta alguno. | **Se reutiliza.** Es el patrón de SL-31 D3 (`specs/SL-31-tests-datos-propios-ci/design.md:140-149`). |
| `tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts:32,106-111` | Una prueba sql-real de SLT-169 que ya siembra con ese fixture y no está en el baseline. | El modelo a copiar. |
| `tests/unit/guards/superficie-de-uso.guardia.test.ts:133-166,181-186,277-332` | Resuelve `@/…` y rutas relativas a módulos del repo (extensión implícita, `index`, `.js`→`.ts`), separa externo de no resuelto, cuenta `export … from` como import y recorre el cierre transitivo con una pila. | **Se reutiliza el método, copiado** en la guardia R631. No se importa: es un archivo de test con sus propios `describe`, y extraer un helper común tocaría una guardia de más de 800 líneas que no es de esta ficha. |
| `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts:30-42,54-70` | La guardia R631 de hoy: 5 servicios por nombre, más los `Wallet*FeedService` y `Caja*FeedService`. Mira solo los especificadores del propio archivo. | **Se amplía.** No se crea otra. |

## Medición

### El baseline: qué sale y qué no

`tests/baseline-rojos.json > archivos` tiene **241** entradas con el motivo «La app nace vacia
(SL-11 …) La retira SL-31». **Salen exactamente dos:**

| Clave | Línea | Por qué está roja |
|---|---|---|
| `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` | `:235-238` | `beforeAll` lee la primera orden (`fksDeOrden`, `:109`), el primer usuario como plantilla (`:122`) y como mensajero (`:134`). Con la base recién migrada no hay ninguno y lanza (`:112-117`, `:125-130`, `:135`). |
| `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts` | `:219-222` | Lo mismo: `fksDeOrden` (`:125`), plantilla (`:135`) y solicitante (`:147`). |

Son las dos únicas pruebas «real» que la trazabilidad de SLT-169 da para R621 y R623
(`specs/SLT-169-pago-tienda-neto/tasks.md:96,98`).

**Las otras 239 entradas con el mismo motivo no son de esta ficha:**
- La ficha se limita a R621/R623 (D1 y la descripción del board).
- De las cinco pruebas sql-real que citan R621 o R623, las otras tres no están en el baseline: ya
  corren en verde y siembran sus datos (`pago-tienda-neto-ledger`, `satelite-detalle-sin-dinero-empresa`
  y `cierres-bodega-cifras-lote`).
- El resto del baseline no prueba ningún requisito de SLT-169. Que su motivo siga diciendo «la retira
  SL-31» con SL-31 ya `done` es otra deuda (pregunta abierta P2).

### Lo que ya protege del verde sin datos

Los dos archivos ya traen lo que exige el aviso «test de integración verde sin datos»:
- **Sin base,** saltan con `describe.skip` (`cierre-desglose…:52`, `cierre-bodega-desglose…:58`).
- **Sin datos,** lanzan en vez de devolver.
- **Tienen un control positivo** que cuenta filas:
  - `cierre-desglose…:373-389`: 3 gestiones y 2 tiendas congeladas distintas;
  - `cierre-bodega-desglose…:440-461`: 2 `cierre_dia`, 4 gestiones, el total agregado y 2 tiendas.

Esto se mantiene: R672 lo fija y R673 lo comprueba con una mutación.

### La guardia R631 y los imports indirectos: hoy ya hay caminos

Para medirlo leí a mano las cadenas desde los servicios de dinero. Hay al menos **dos caminos de
valor** que ya llegan a los módulos prohibidos, y la guardia de hoy no los ve:

1. `lib/services/CierreBodegaService.ts:33-38` importa `cifrasBodegaDescarga` de
   `lib/services/cifras-bodega-descarga.ts`, y lo llama en `:556`.
   - `cifras-bodega-descarga.ts:13` importa `cifrasAgregadasBodega` de `cifras-cierre-bodega`, y la
     llama en `:90`.
   - `cifras-cierre-bodega.ts:2` importa `cifrasDelCierre` de `cifras-cierre`.
   - Es un camino de **símbolo**, no solo de módulo: llega a las cifras de presentación. Lo usa el
     listado y la descarga de cierres de bodega, no el asiento de dinero. Eso no lo he verificado
     ejecutando nada.
2. `lib/services/CierreBodegaService.ts:40` importa `anularEmpresaSiNoCentral` de
   `lib/services/CierresAdminService.ts:188`, y ese módulo importa `cifrasDelCierre` (`:87`).
   - A nivel de módulo, el camino existe.
   - A nivel de símbolo, `anularEmpresaSiNoCentral` no llama a `cifrasDelCierre` (`:188-…`; las
     llamadas están en `:1083` y `:2055`).

**Consecuencia:** una guardia transitiva que se limite a afirmar «ningún camino» sale **roja en el
árbol de hoy**, y quitar esos caminos es código de producción. Esta ficha no lo hace:
- R678 fija esos caminos como **excepciones con nombre**, que solo pueden encoger;
- la pregunta abierta P1 deja al humano decidir si se aceptan o si se abre una ficha de ruta completa
  que los quite.

T1 mide el conjunto entero, porque puede haber más caminos que estos dos.

## Alcance

**Dentro:**
- Los dos archivos sql-real de la tabla de arriba siembran todo lo que leen dentro de la transacción
  revertida de cada caso, con `crearFksDeOrden` y `crearUsuarioDePrueba`. De la base solo leen
  catálogos por su clave.
- Las dos claves salen de `tests/baseline-rojos.json`.
- Se amplía `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`:
  - recorre los imports de valor de forma transitiva, re-exports incluidos;
  - resuelve los re-exports renombrados hasta su nombre de origen;
  - lleva excepciones con nombre y contraprueba en memoria.

**Fuera (lo que NO entra):**
- **Cualquier cambio en `lib/`, `app/` o `components/`.** Ni siquiera para quitar los dos caminos de
  la medición (P1).
- **Las otras 239 entradas del baseline con el motivo SL-31** (P2).
- **Cambiar aserciones o literales esperados** de los dos archivos sql-real. Solo cambia de dónde
  salen los datos (R672).
- **Editar `specs/SLT-169-pago-tienda-neto/tasks.md`**, aunque H2 pedía corregir su mapa: es el spec
  de una ficha `done`. La trazabilidad buena queda en la de esta ficha.
- **`NOMBRES_PROHIBIDOS` y la lista de servicios de dinero:** no cambian. Sigue nombrando
  `ganaLaTienda`, aunque SLT-174 quitó el alias: prohibirlo sigue siendo correcto.

## Decisiones cerradas (no reabrir)

| Id | Fecha · quién | Decisión |
|---|---|---|
| D1 | 2026-11-16 · Carlos | (Heredada de SLT-172, `specs/SLT-172-limpieza-pago-neto/requirements.md:91`.) Corte en tres. R621/R623 en el baseline y la guardia R631 van a SLT-175. |
| D2 | 2026-11-16 · Carlos | (Era P1.) Los dos caminos de `CierreBodegaService` (`:556` → `cifras-bodega-descarga.ts:90`; `:40` → `CierresAdminService.ts:87`) quedan como excepciones con nombre y `archivo:línea` en la guardia R631. La lista solo puede encoger. La vacía SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre»; esta ficha sale con las excepciones. |
| D3 | 2026-11-16 · Carlos | (Era P2.) Las otras 239 entradas del baseline con el motivo SL-31 van a una ficha aparte, SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31». Fuera de alcance aquí. |

Cobertura: D1 → R670-R675 (R621/R623 con datos propios y fuera del baseline) y R676-R679 (R631 con
imports indirectos). D2 → R678. D3 → R675 (solo salen dos claves).

## Requisitos (EARS)

### Pruebas R621/R623 con datos propios

- **R670** — CUANDO `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` corre contra una
  base que solo tiene lo que dejan las migraciones, sin `db:seed` y sin ninguna fila de `orden`,
  `usuario`, `zona` ni `tarifa`, el archivo DEBE ejecutar sus 4 casos y pasarlos los 4: ninguno
  saltado y ninguno fallido.
- **R671** — CUANDO `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts` corre en
  esas mismas condiciones, el archivo DEBE ejecutar sus 4 casos y pasarlos los 4: ninguno saltado y
  ninguno fallido.
- **R672** — Los dos archivos DEBEN conservar sus casos y sus literales esperados:
  - mensajero: `A_PAGO` 92655.00, `B_PAGO` 36384.00, Σ pago 129039.00, Σ recaudado 140000.00, `difA`
    −7345.00 y `difB` −3616.00 (`cierre-desglose…:84-87,489-495`);
  - bodega: Ana 92655.00, Beto 58276.50, agregado 150931.50, Σ días = agregado, `difA` −10452.50 y
    `difB` −3616.00 (`cierre-bodega-desglose…:590-614`).

  Y su control positivo DEBE seguir afirmando el número exacto de gestiones, de `cierre_dia` y de
  tiendas congeladas distintas.
- **R673** — SI el corpus de un caso no llega a la base (falta una gestión sembrada, el cierre no se
  encuentra o las dos tiendas resultan ser una), ENTONCES el control positivo de ese archivo DEBE
  fallar. Ningún caso DEBE terminar con un `return` antes de su primera aserción. Y SI falta en la base
  un catálogo que el archivo necesita, ENTONCES el archivo DEBE fallar con un mensaje que lo nombre,
  sin saltarse ni dar `passed`.
- **R674** — SI se rompe lo que prueban, ENTONCES al menos un caso de cada archivo DEBE fallar. Se
  comprueba con dos mutaciones:
  - (a) el desglose agrupa por la tienda viva de la orden en vez de la congelada en `cierre_detail`;
  - (b) «Se le paga hoy» por tienda deja de restar el flete por rechazo con IVA (SLT-169 R621).
- **R675** — `tests/baseline-rojos.json > archivos` NO DEBE contener las claves
  `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` ni
  `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`. Ninguna otra entrada del
  baseline DEBE cambiar en este PR.

### Guardia R631 con imports indirectos

- **R676** — La guardia R631 DEBE recorrer, desde cada servicio que escribe dinero, sus imports de valor
  de forma transitiva, por alias `@/` y por ruta relativa. Cuentan como import: `import … from`,
  `import "x"`, `import()`, `require()`, `export { … } from` y `export * from`. SI algún camino llega a
  `lib/utils/cifras-cierre.ts` o a `lib/utils/cifras-cierre-bodega.ts` y no es una excepción de R678,
  ENTONCES la guardia DEBE dar rojo nombrando la cadena entera (servicio → … → módulo prohibido).
  - Los `import type` y los especificadores con todos sus nombres `type` NO DEBEN contar como
    camino.
  - SI un especificador `@/` o relativo no resuelve a un archivo, ENTONCES la guardia DEBE dar rojo
    nombrándolo, en vez de perder la arista.
- **R677** — SI un servicio que escribe dinero obtiene un símbolo cuyo nombre de ORIGEN está en
  `NOMBRES_PROHIBIDOS` (`pagoTiendaEmpresa`, `ganaLaTienda`, `partesPorTienda`), ENTONCES la guardia
  DEBE dar rojo, aunque el nombre local sea otro. Vale para cualquier cadena de re-exports, incluido
  `export { partesPorTienda as x } from "…"`.
- **R678** — La guardia DEBE aceptar solo los caminos de una lista de excepciones con nombre. Cada
  entrada es el par (servicio de dinero, primer módulo que importa) y lleva su `archivo:línea` y su
  porqué. Hoy son las dos de `## Medición`:
  - (`CierreBodegaService.ts`, `cifras-bodega-descarga.ts`);
  - (`CierreBodegaService.ts`, `CierresAdminService.ts`).

  Hay dos reglas más:
  - SI una entrada ya no corresponde a ningún camino del árbol, ENTONCES la guardia DEBE dar rojo
    (entrada muerta);
  - SI un camino nuevo sale por una entrada que no está en la lista, ENTONCES la guardia DEBE dar rojo.
- **R679** — Las funciones de la guardia DEBEN poder correr sobre un árbol en memoria (ruta → texto), y
  la guardia DEBE probar sobre él que:
  - (a) A → B → `cifras-cierre`, todo por import estático, da rojo;
  - (b) un B con `export * from "@/lib/utils/cifras-cierre"` o con
    `export { cifrasDelCierre } from "../utils/cifras-cierre"` da rojo;
  - (c) un B con `export { partesPorTienda as reparto } from "@/lib/utils/ingreso-empresa"`, más un A
    que importa `reparto` de B, da rojo;
  - (d) un `import type` de `cifras-cierre` en la cadena no da rojo;
  - (e) un ciclo A → B → A termina;
  - (f) un especificador `@/` sin archivo da rojo;
  - (g) una excepción sin camino da rojo.

  Y sobre el árbol real, el barrido DEBE:
  - haber leído más módulos que servicios de dinero, es decir, haber seguido al menos una arista;
  - incluir `lib/utils/ingreso-empresa.ts`, al que llega `WalletTiendaFeedService.ts:9`.

## Tasks

- [ ] **T1 — Medir antes de tocar nada.**
  - Antes de cualquier `vitest`, base desechable: crear una base nueva, `prisma migrate deploy`, sin
    `db:seed`, y exportar su `DATABASE_URL`. Nunca la de desarrollo.
  - Correr los dos archivos sql-real y anotar en `progress/impl_SLT-175.md` el primer rojo de cada uno.
    Tiene que ser el de falta de datos. Si es otro, se para y se avisa al leader: entonces la causa no
    es la del baseline.
  - Medir los caminos de valor desde los servicios de dinero con el recorrido de R676, escrito primero
    como script de un solo uso en el scratchpad. Anotar cada (servicio, primer módulo, cadena) con
    `archivo:línea`.
  - *Hecho:* la tabla está en la bitácora. Si aparecen caminos aparte de los dos de `## Medición`, se
    para y el leader los lleva a P1 antes de seguir.
- [ ] **T2 [P con T4] — Sembrar `cierre-desglose-por-tienda-sql-real.test.ts`** (R670, R672, R673).
  - Quitar `fksDeOrden` y los `usuario.findFirst` del `beforeAll`.
  - Dentro de `conCorpus`, después de `serializarEscriturasReales`, crear con `crearFksDeOrden(tx)` y
    `crearUsuarioDePrueba(tx, rol)`:
    - la zona y la geografía;
    - las dos tiendas, rol `adminTienda`, con `NOMBRE_COMPARTIDO` (crearla con el fixture y renombrarla
      en la tx, o crearla con `rolId` y `tipoIdentificacionId` leídos del catálogo por clave);
    - el mensajero, rol `mensajero`.
  - `en_reparto` se sigue leyendo del catálogo con su `where`.
  - Ningún `it`, `expect` ni literal cambia.
  - *Hecho:* en la base de T1, 4 passed / 0 skipped / 0 failed.
- [ ] **T3 [P con T2] — Sembrar `cierre-bodega-desglose-por-tienda-sql-real.test.ts`** (R671-R673).
  - Lo mismo que T2.
  - Ana y Beto con rol `mensajero`, y el solicitante con el rol que pida `cierre_bodega`. Si ninguno
    lo exige, `adminSatelite`.
  - *Hecho:* 4 passed / 0 skipped / 0 failed en la base de T1.
- [ ] **T4 — Mutaciones de R673 y R674**, una a una, sobre la base de T1 y nunca a la vez que el gate.
  - Quitar la siembra de una gestión: el control positivo cae.
  - Mutación (a): en el mapper del detalle, leer `orden.tiendaId` en vez del `tienda_id` congelado.
    Caen los casos R6 de los dos archivos.
  - Mutación (b): en `partesPorTienda`, no restar el flete por rechazo. Caen los casos de identidades.
  - Tras cada mutación, `git diff --stat -- lib/` vacío y el árbol restaurado.
  - *Hecho:* tabla mutación → caso rojo → restaurado en `progress/impl_SLT-175.md`.
  - Depende de T2 y T3.
- [ ] **T5 — Baseline** (R675). Borrar las dos claves de `tests/baseline-rojos.json` y nada más.
  - *Hecho:* `git diff tests/baseline-rojos.json` muestra solo esas 8 líneas, y
    `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` sigue verde.
  - Depende de T2 y T3.
- [ ] **T6 [P con T2] — Guardia R631 transitiva** (R676-R679), en
  `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`.
  - Copiar el método de `superficie-de-uso.guardia.test.ts:133-166,181-186` a funciones que reciban un
    lector (ruta → texto) para poder pasarles el árbol en memoria:
    - resolver el especificador;
    - sacar los especificadores de valor, sin los de tipo;
    - sacar las aristas de símbolo con su nombre de origen;
    - recorrer con una pila y un conjunto de visitados.
  - Añadir `EXCEPCIONES` con las entradas que salgan de T1.
  - Los casos de hoy (`:79-135`) se quedan; se añaden los de R679.
  - *Hecho:*
    - verde en el árbol;
    - rojo con la M6 de SLT-169 (`specs/SLT-169-pago-tienda-neto/tasks.md:122`) y con una M7
      transitiva: un `lib/utils/_m7.ts` temporal que re-exporta `cifrasDelCierre`, importado desde
      `WalletTiendaFeedService.ts`; se deshace después;
    - rojo si se borra una entrada de `EXCEPCIONES` o si se añade una que no existe.
- [ ] **T7 — Cierre.**
  - `./init.sh` en verde, con `.env` copiado al worktree para que la integración no se salte.
  - `git diff --name-only origin/dev -- lib/ app/ components/ db/` vacío.
  - En el CI del PR (`gate-completo`), los dos archivos aparecen como **ejecutados y verdes**, no
    saltados. Se anota la línea del log.
  - *Hecho:* anotado en `progress/impl_SLT-175.md`.

**Trazabilidad prevista:**

| R | Test |
|---|---|
| R670 | `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` (base de T1 y shard de CI) |
| R671 | `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts` (ídem) |
| R672 | los dos archivos, casos «identidades» y «CONTROL POSITIVO» (literales sin cambios) |
| R673 | los dos «CONTROL POSITIVO», más la mutación de siembra de T4 |
| R674 | los casos «R6» e «identidades» de los dos archivos, más las mutaciones (a) y (b) de T4 |
| R675 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` y `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` |
| R676 | `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts` (barrido real y casos a, b, d, e, f) |
| R677 | la misma guardia, caso (c) |
| R678 | la misma guardia, caso (g) y la entrada borrada de T6 |
| R679 | la misma guardia: contraprueba en memoria y no-vacuidad del barrido real |

## Tamaño

Archivos: **8/40** (20%), holgado.

| Montón | Estimación | Tope | % |
|---|---|---|---|
| Producción | 0 líneas | 1000 | 0% |
| Tests | ~450 líneas: ~250 de la guardia (resolvedor, recorrido, excepciones y casos en memoria), ~70 por cada archivo sql-real (−40 del `beforeAll` y +30 de siembra dentro de la tx), 8 del baseline | 3000 | ~15% |

Lo que puede moverlo es T1: si aparecen más caminos que los dos medidos, crece la lista de excepciones,
no el código.

## Archivos esperados

- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
- `tests/baseline-rojos.json`
- `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`
- `specs/SLT-175-pruebas-r621-r623-guardia-r631/requirements.md`
- `progress/features/SLT-175.md`
- `progress/impl_SLT-175.md`
- `progress/review_SLT-175.md`

`tests/integration/db/_fixtures/orden-minima.ts` **no se toca**: se usa tal cual. Si T2 necesitara una
opción de nombre en `crearUsuarioDePrueba`, se renombra en la tx en vez de cambiar el fixture, que usan
91 archivos.

## Alternativas descartadas

- **Guardia transitiva sin excepciones.** Sale roja hoy (`## Medición`), y ponerla verde exige mover
  `cifrasBodegaDescarga` fuera de `CierreBodegaService`, que es código de producción y ruta completa.
- **Transitividad a nivel de símbolo**, siguiendo qué usa el cuerpo de cada función exportada. Quitaría
  el camino 2, pero necesita un análisis de flujo dentro de cada función que el método de
  `superficie-de-uso` no tiene. Además el camino 1 seguiría ahí. Se queda la transitividad por módulo
  y las excepciones por par; R677 sí sigue el símbolo, pero solo a través de re-exports.
- **Importar las funciones de `superficie-de-uso.guardia.test.ts`.** Es un test: importarlo ejecutaría
  sus `describe`. Extraer un módulo común toca un archivo que no es de esta ficha.

## Preguntas abiertas

Ninguna. P1 y P2 se cerraron al aprobar el spec: ver D2 y D3 en `## Decisiones cerradas`.
