# SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31» — requirements

Ruta: **ligera** (zona fullstack, complejidad medium). Este archivo es el spec entero: no hay
`design.md` ni `tasks.md`. Requisitos: **R730-R749** (el último rango en uso es el R670-R689 de
SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos»).

**Sin código de producción.** El diff solo toca `tests/` (pruebas de integración, una guardia y
`tests/baseline-rojos.json`). Si al implementar hiciera falta tocar `lib/`, `app/`, `components/`,
`hooks/`, `db/` o `scripts/`, se para: esa entrada no entra en el lote de esta ficha.

## Origen

- SLT-175, decisión D3 (2026-11-16, Carlos): las 239 entradas de `tests/baseline-rojos.json` con el
  motivo «La app nace vacia (SL-11 …) La retira SL-31 (tests con datos propios y CI migrada)» van a
  esta ficha (`specs/SLT-175-pruebas-r621-r623-guardia-r631/requirements.md:130`).
- SL-31 «Tests de integración con datos propios y base migrada en CI» está `done`, pero su objetivo de
  cierre (R25: baseline sin entradas de SL-31) no se cumplió. `tests/fabricas/` no existe. Lo que sí
  dejó: los shards de CI migran y siembran catálogos (`.github/workflows/gate.yml:178-187`).
- Deuda D8 de `progress/deudas.md:41-44` (dueño: «quien tome SL-31») y D37 (`:230-233`: dos `WHERE` de
  dinero ciegos también en CI por este baseline).

## Lo que ya existe

Buscado `baseline`, `La retira SL-31`, `fksDeOrden`, `crearFksDeOrden`, `datos propios`, `por limpiar`
en `feature_list.json`, `specs/`, `progress/`, `tests/`, `scripts/` y `.github/`, con Grep/Read. No usé
el grafo (lo que se busca son datos y tests, no símbolos de producto).

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SL-31 `done`; SLT-175 `in_progress` (sacó 2 de las 241, `tests/baseline-rojos.json` ya está en 239). Ninguna otra ficha cubre estas entradas. SL-28 «Consolidar las migraciones en una línea base limpia» cubre las entradas cuyo motivo ya cita SL-28: no se tocan. | Se sigue. No es duplicado. |
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`: crean dentro de la tx del test; solo leen catálogos por clave y lanzan si faltan. | **Se reutiliza** para sembrar (patrón de SL-31 y SLT-175). |
| `tests/integration/db/_postgres-real.ts:495` | `fksDeOrden(prisma)` lee la primera orden y devuelve `null` si no hay. 104 llamadas en 66 archivos de `tests/`. | Es el punto de fallo más probable; T1 lo confirma o no. No se edita sin cumplir R738. |
| `scripts/comparar-baseline-rojos.mjs:91-139` | Marca «ya pasa» un archivo del baseline que la corrida ejecutó y no salió `failed`. Mira el `status` del archivo, no si sus casos se saltaron o salieron por un `return`. | Se usa tal cual. La clasificación de T1 mira caso a caso (R731). |
| `.github/workflows/gate.yml:270-280` | El job `gate-completo` imprime en el resumen «N por limpiar» y sube el informe unido `gate-completo-informe` (`.vitest-rojos.json`). | **Fuente de la medición** (R730). |
| `progress/impl_SL-31.md:73-95` | Última medición en CI con base migrada: 248 archivos rojos, todos en el baseline de 249, «1 por limpiar»; 281 casos rojos en esos 248 archivos. | Indica que casi todas siguen rojas y que muchas caen una sola vez por archivo (p. ej. en el `beforeAll`). Es de 2026-10-22: no sustituye a T1. |
| `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts:24-49` | Exige que cada `motivo` cite una ficha con `FICHA = /SL-\d+/`. **`SLT-177` no casa** (`SLT-` no es `SL-`). | Se amplía a `SL-<n>` o `SLT-<n>` (R742); sin eso, ningún motivo nuevo podría citar una ficha del board actual. El archivo no está en `arnes.manifest`. |

## Alcance

**Dentro:**
- **Medir** las 239 entradas en condiciones de CI y clasificar cada una (T1).
- **Podar** las que ya pasan, incluidas las que pasan sin comprobar nada (con constancia aparte).
- **Sembrar un primer lote acotado** de las que fallan por base vacía, con datos propios dentro de la
  transacción y control positivo, y sacarlas del baseline.
- **Reescribir el motivo** de todas las que se quedan, con la causa medida y la ficha que las retira.
- **Dejar escritas las fichas siguientes** para el resto, con un criterio fijo (`## Corte`).
- Ampliar la guardia de forma del baseline para que acepte `SLT-<n>` y prohíba citar SL-31.

**Fuera (lo que NO entra):**
- Código de producción, `scripts/`, `.github/`, archivos de `arnes.manifest`, dependencias.
- Las entradas cuyo motivo no cita SL-31 (SL-28, SL-29): no cambian.
- Sembrar más allá del tope del lote (`## Corte`): va a las fichas siguientes.
- Arreglar las de «otra causa» (versión de Postgres, ICU, UI, lógica): solo se mide y se reescribe
  su motivo.
- Crear `tests/fabricas/` como capa nueva. Se siembra con `_fixtures/orden-minima.ts`; si el lote
  necesita algo más, se añade ahí o en el fixture propio del archivo.

**Decisiones técnicas tomadas aquí (no son del humano):**
- **Fuente de verdad, CI.** Postgres 17 y el Node de CI dieron rojos que el local no daba
  (`tests/baseline-rojos.json:1012`, `progress/impl_SL-31.md:67-68`). Si local y CI discrepan, manda CI.
- **Un archivo «verde sin datos» sale del baseline.** Dentro o fuera da lo mismo hoy (es verde), pero
  fuera el gate verá el rojo el día que alguien le dé datos. Queda en la lista de las fichas
  siguientes como siembra pendiente: no cuenta como retirado con prueba.
- **`desde` no cambia** al reescribir un motivo: es la fecha en que el rojo entró, no la de la medición.

## Requisitos (EARS)

### Medición

- **R730** — Cada una de las 239 entradas con motivo SL-31 DEBE quedar clasificada en exactamente una
  de cuatro clases, en una tabla de `progress/impl_SLT-177.md`:
  - **pasa**;
  - **verde sin datos**;
  - **base vacía**;
  - **otra causa**.

  La clasificación DEBE salir de una corrida de CI con base migrada y catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`, Postgres de `gate.yml`) sobre un árbol sin cambios de
  producto respecto de `dev`, y cada fila DEBE llevar: id del run, casos pasados/fallidos/saltados del
  archivo y, si falló, la primera línea del primer error y el `archivo:línea` donde nace. La suma de
  las cuatro clases DEBE ser 239.
- **R731** — Un archivo DEBE clasificarse como **pasa** solo si la corrida lo ejecutó con al menos un
  caso pasado, ninguno fallido y ninguno saltado o `todo`, y si ningún caso termina con un retorno
  temprano ante un dato de negocio ausente (regla de SL-31 P2: `if (!x) return` o un `skip`
  condicionado a datos, con `x` leído de la base). SI pasa pero incumple alguna de esas condiciones,
  ENTONCES DEBE clasificarse como **verde sin datos**.
- **R732** — Un archivo DEBE clasificarse como **base vacía** solo si su primer error nace en la lectura
  de una fila de negocio (orden, usuario, zona, tienda, tarifa, cierre…) que una base migrada con
  catálogos no trae, y el `archivo:línea` de la fila apunta a esa lectura. Cualquier otro primer error
  DEBE clasificarse como **otra causa**, con su mensaje.
- **R733** — SI un archivo de las 239 no aparece en el informe de la corrida, ENTONCES NO DEBE
  clasificarse ni tocarse su entrada, y la implementación DEBE parar y avisar al leader.

### Poda

- **R734** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna entrada clasificada como
  **pasa** o **verde sin datos**.
- **R735** — Cada archivo **verde sin datos** DEBE figurar, con su `archivo:línea` del retorno o del
  `skip`, en la lista de fichas siguientes de `## Corte`, como siembra pendiente.

### Siembra del primer lote

- **R736** — CUANDO un archivo del lote corre contra una base migrada con catálogos y sin ninguna fila
  de `orden`, `usuario`, `zona` ni `tarifa`, DEBE ejecutar todos sus casos y pasarlos: ninguno saltado
  y ninguno fallido.
- **R737** — Cada archivo del lote DEBE crear dentro de la transacción revertida de cada caso todo
  dato de negocio que lea, y de la base solo DEBE leer catálogos y geografía por su clave. NO DEBE
  llamar a `fksDeOrden` ni leer una fila de `orden`, `usuario` o `zona` que no haya creado el propio
  test.
- **R738** — SI un archivo del lote se apoya en un helper compartido que esta ficha cambia, ENTONCES
  todos los usuarios de ese helper DEBEN seguir verdes en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test.
- **R739** — Cada archivo del lote DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa. SI la siembra de un caso no llega a la base, ENTONCES ese control DEBE fallar.
  Ningún caso DEBE terminar con un `return` antes de su primera aserción, y SI falta un catálogo,
  ENTONCES el archivo DEBE fallar con un mensaje que lo nombre, sin saltarse ni dar `passed`.
- **R740** — Al sembrar un archivo NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse
  un literal esperado por la función que lo genera, y el número de casos (`it`/`test`) NO DEBE bajar.
- **R741** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna entrada de un archivo del
  lote.

### Motivos de las que se quedan

- **R742** — La guardia de forma del baseline DEBE aceptar como ficha que retira la entrada tanto
  `SL-<n>` como `SLT-<n>`, y DEBE seguir dando rojo con un motivo que no cite ninguna. DEBE probarlo
  con casos en memoria: uno con `SLT-<n>` verde y uno sin ficha rojo.
- **R743** — Ningún `motivo` de `tests/baseline-rojos.json` DEBE citar SL-31. La guardia de R742 DEBE
  dar rojo si alguno lo hace, con un caso en memoria que lo pruebe.
- **R744** — Cada entrada que se queda DEBE tener un `motivo` que diga:
  - la clase medida (**base vacía** u **otra causa**) y, en otra causa, la causa en una frase con el
    mensaje del error;
  - la fecha de la medición y el id del run de R730;
  - la key de la ficha del board que la retira.

  Su `desde` NO DEBE cambiar.
- **R745** — SI una entrada que se queda es **base vacía**, ENTONCES su motivo DEBE citar la ficha
  siguiente de siembra que la contiene. SI es **otra causa**, ENTONCES DEBE citar una ficha que cubra
  esa causa: una que ya exista en el board o una nueva de `## Corte`. Ningún motivo DEBE afirmar una
  causa que no esté en la fila de R730 de esa entrada.

### Cierre y límites

- **R746** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar».
- **R747** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, ningún archivo de `arnes.manifest` ni `package.json`. Las entradas del baseline cuyo
  motivo no cita SL-31 NO DEBEN cambiar.
- **R748** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.
- **R749** — `progress/deudas.md` DEBE dejar D8 apuntando a las fichas siguientes en vez de a SL-31, y
  D37 cerrada o apuntando a la ficha que la retira, según caigan sus dos archivos en el lote.

## Corte

Sembrar las que fallan por base vacía no cabe en un PR (`progress/impl_SL-31.md` midió 248 archivos
rojos; SLT-175 tardó ~70 líneas por archivo). Esta ficha es la **rebanada 1**: medir todo, podar todo
lo que ya pasa, reescribir todos los motivos y sembrar **un lote acotado**. El resto va a fichas
siguientes, cada una una rebanada que se mergea sola y saca sus entradas del baseline.

**Tope del lote de esta ficha:** como mucho **20 archivos de test** tocados para sembrar (helpers
compartidos incluidos) y **1300 líneas** de diff de siembra. Se llena por este orden de prioridad y se
para al tocar cualquiera de los dos topes:
1. Los que vigilan dinero sin cobertura en CI: D37 (`detalle-movimiento-cierre-postgres`,
   `detalle-en-lote-464`) y `premio-ranking-idempotencia` (deuda de SLT-124, `progress/deudas.md:373`).
   Solo si T1 los clasifica **base vacía**.
2. Los grupos que comparten punto de fallo (mismo `archivo:línea` del primer error en un helper o
   escenario compartido): primero el grupo que retira más entradas por archivo tocado, si cumple R738.
3. El resto, de menos a más líneas estimadas.

**Fichas siguientes (las crea el leader en T2, con borrador y OK de Carlos):**
- **Siembra:** las **base vacía** que no entren en el lote, más las **verde sin datos**, en fichas de
  como mucho 20 archivos y 1300 líneas cada una, agrupadas por punto de fallo y después por dominio
  (`tests/integration/db/`, `…/actions/`, `…/repositories/`…). Ruta ligera, mismo patrón y mismos
  requisitos R736-R741 y su tope. `depends_on` encadenado solo si comparten helper.
- **Otra causa:** una ficha por causa medida, salvo que una ficha del board ya la cubra (entonces se
  cita esa; p. ej. SL-28 para lo que lee `db/migrations/`). La ruta la propone el leader con lo medido.
- Cada ficha lleva en su descripción la lista exacta de archivos, sacada de la tabla de R730.

## Tasks

- [x] **T1 — Medir** (R730-R733). La hace el implementer antes de tocar nada.
  - Fuente: el artefacto `gate-completo-informe` (`.vitest-rojos.json` unido) de la última corrida de
    `gate` del PR #184 «SLT-175 pruebas R621/R623 y guardia R631», cuyo árbol es el de `dev` en
    `825ba66d`. Si el artefacto expiró, `workflow_dispatch` de `gate.yml` sobre la rama de esta ficha
    sin cambios de producto (corre también el e2e: avisar del coste al leader antes).
  - Para la regla del retorno temprano de R731, leer el código de cada archivo que salga «pasa»; para
    el `archivo:línea` de R732, el stack del primer error.
  - Base local solo para diagnosticar: base desechable nueva, `prisma migrate deploy` + `db:seed`,
    exportar su `DATABASE_URL` **antes** de cualquier `vitest`; nunca la de desarrollo; anotar la
    versión de Postgres. No imprimir la URL.
  - *Hecho:* tabla de 239 filas en `progress/impl_SLT-177.md`, con el recuento por clase (suma 239), el
    id del run y los grupos por punto de fallo. Si hay algún archivo sin ejecutar (R733), se para.
- [x] **T2 — Puerta: lote y fichas siguientes** (leader + Carlos). Depende de T1.
  - El leader elige el lote con la prioridad de `## Corte`, lo añade a `## Archivos esperados` de este
    archivo y corre `node scripts/archivos-en-vuelo.mjs --candidata SLT-177`.
  - Redacta en borrador las fichas siguientes con la lista de archivos de cada una; con el OK de Carlos
    las crea en el board y anota las keys en `progress/features/SLT-177.md`.
  - *Hecho:* lote cerrado en el spec, sin choque (o choque aceptado por escrito), y una key de ficha
    para cada entrada que se queda.
- [x] **T3 [P con T1] — Guardia de forma del baseline: `SLT-<n>`** (R742), en
  `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts`.
  - `FICHA` acepta `SL-<n>` y `SLT-<n>` (y sigue sin aceptar otra cosa); casos en memoria.
  - La regla de R743 (ningún motivo cita SL-31) NO va aquí: daría rojo sobre el archivo real en cada
    tanda hasta T7. Va en T7.
  - *Hecho:* caso `SLT-<n>` verde, caso sin ficha rojo, guardia verde sobre el archivo real.
- [x] **T4 — Podar** (R734, R735). Depende de T1. Borrar las entradas **pasa** y **verde sin datos**;
  añadir un párrafo «PODA DEL <fecha> (SLT-177)» en `_lee_esto` con el recuento y el id del run.
  - *Hecho:* `git diff tests/baseline-rojos.json` solo quita esas claves y añade el párrafo.
- [x] **T5 — Sembrar el lote** (R736-R740). Depende de T2. Un archivo (o un grupo de helper) cada vez.
  - Quitar `fksDeOrden` y las lecturas de «la primera fila»; sembrar con `crearFksDeOrden` y
    `crearUsuarioDePrueba` dentro de la tx; añadir el control positivo que cuente lo sembrado.
  - Ningún `it`, `expect` ni literal cambia.
  - *Hecho:* cada archivo, en la base desechable de T1, todos sus casos pasados, 0 saltados, 0
    fallidos; anotado en la bitácora.
- [x] **T6 — Mutaciones** (R739, R738). Depende de T5. Una a una, nunca a la vez que el gate.
  - Por archivo (o por helper, si el grupo lo comparte): quitar la siembra de una fila → el control
    positivo cae. Por helper cambiado: correr todos sus usuarios.
  - *Hecho:* tabla mutación → caso rojo → restaurado en `progress/impl_SLT-177.md`; árbol restaurado.
- [ ] **T7 — Baseline: lote fuera y motivos nuevos** (R741, R744, R745). Depende de T2, T4 y T5.
  - Borrar las entradas del lote. Reescribir el motivo de cada entrada que queda con su fila de T1 y la
    key de T2; `desde` intacto. Un motivo sin fila de T1 que lo respalde no se escribe.
  - Añadir a la guardia la regla de R743 con su caso en memoria (rojo con un motivo que cita SL-31).
  - *Hecho:* ningún motivo cita SL-31; la guardia verde sobre el archivo real y roja si se devuelve
    «La retira SL-31» a una entrada (contraprueba restaurada desde copia).
- [ ] **T8 — Cierre** (R746-R749).
  - `progress/deudas.md`: D8 y D37 como dice R749.
  - `./init.sh` en verde, con `.env` copiado al worktree para que la integración no se salte.
  - `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
    vacío; `node scripts/tamano-pr.mjs` por debajo del tope.
  - En el CI del PR: «sin rojos nuevos» y 0 «por limpiar»; los archivos del lote aparecen ejecutados
    y verdes. Anotar run y líneas del log en `progress/impl_SLT-177.md`.

**Trazabilidad prevista:**

| R | Test |
|---|---|
| R730-R733 | Tabla de T1 en `progress/impl_SLT-177.md` + `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR (una clasificación «pasa» errónea sale como rojo nuevo) |
| R734 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo`: 0 «por limpiar» |
| R735 | Lista de `## Corte` / fichas de T2 contrastada con la tabla de T1 (reviewer) |
| R736, R737 | cada archivo del lote, en la base de T1 y en su shard de CI |
| R738 | usuarios del helper en el CI del PR + mutación de T6 |
| R739 | el control positivo de cada archivo del lote + mutación de siembra de T6 |
| R740 | diff de cada archivo del lote (casos y literales) — reviewer |
| R741 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` (los del lote, ejecutados y verdes fuera del baseline) |
| R742, R743 | `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` (casos en memoria + archivo real) |
| R744, R745 | la misma guardia (forma y ficha) + cotejo motivo ↔ fila de T1 (reviewer) |
| R746 | `gate-completo` del PR |
| R747, R748 | `scripts/tamano-pr.mjs` + `git diff --name-only` de T8 |
| R749 | `progress/deudas.md` (reviewer) |

## Archivos esperados

Fijos:
- `tests/baseline-rojos.json`
- `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts`

Candidatos del lote (prioridad 1 de `## Corte`; entran solo si T1 los clasifica **base vacía**):
- `tests/integration/db/detalle-movimiento-cierre-postgres.test.ts`
- `tests/integration/db/detalle-en-lote-464.test.ts`
- `tests/integration/db/premio-ranking-idempotencia.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si el lote necesita una fila que hoy no crea)

Resto del lote: lo añade el leader en T2, como mucho hasta 20 archivos de siembra en total. Estado
fuera del cómputo: `progress/impl_SLT-177.md`, `progress/deudas.md`, `progress/features/SLT-177.md`.

**Lote cerrado en T2** (2026-11-16, OK de Carlos; medición en `progress/medicion_SLT-177.md`). T1 midió
`detalle-movimiento-cierre-postgres` y `premio-ranking-idempotencia` como **otra causa / dato ajeno**
(leen una fila de otra empresa); Carlos los admite en el lote por excepción, con el mismo remedio
(R737). `detalle-en-lote-464` sale **base vacía** (G2).
- G2 (29 entradas): `tests/integration/db/_fixtures/caja-459.ts`, `…/detalle-en-lote-464.test.ts`,
  `…/estado-cuenta-cierre-pagos-172r52.test.ts`, `…/estado-cuenta-servidor-458d.test.ts`
- Excepción D37/premio (2): `…/detalle-movimiento-cierre-postgres.test.ts`, `…/premio-ranking-idempotencia.test.ts`
- G1 (76): `tests/integration/db/454/_escenario.ts`, `…/454/caracterizacion/notificacion-n1.test.ts`,
  `…/462/reprogramadas-retenidas-sql-real.test.ts`, `…/477-ordenes-en-correccion-sql-real.test.ts`
- G3-G6 (17): `…/_whatsapp-envios-474.ts`, `…/_informe-transito-475.ts`, `…/419/_escenario-419.ts`,
  `…/_picking-476.ts`
- `…/_fixtures/orden-minima.ts` si hace falta.

Un usuario de G1/G2 que, arreglado su helper, siga rojo por otra causa se queda en el baseline con
motivo nuevo medido (decisión de Carlos). Fichas siguientes: SLT-178…SLT-187 (= F1…F10 de
`progress/impl_SLT-177.md > T2`) y SLT-188 «Tests que dejan filas fuera de su transacción».

## Tamaño

Archivos: **6/40** hoy; techo tras T2: **22/40** (55%) = 20 de siembra + baseline + guardia.

| Montón | Estimación | Tope | % |
|---|---|---|---|
| Producción | 0 líneas | 1000 | 0% |
| Tests | techo ~2300: baseline ≤ ~960 (4 líneas por entrada podada o del lote, 2 por motivo reescrito, + párrafo de poda), guardia ~40, siembra ≤ 1300 (tope del lote) | 3000 | ≤ ~77% |

Lo que puede moverlo es T1: si casi todo resulta **base vacía**, el baseline aporta ~480 líneas (solo
motivos) y sobra holgura; el tope del lote no se sube por eso.

## Preguntas abiertas

- **P1 — Puerta a mitad de la ficha.** Los motivos que se quedan tienen que citar la ficha que los
  retira (R744, R745), y esas fichas no existen hasta medir. La propuesta es la puerta T2: tras T1, el
  leader trae el lote y el borrador de fichas siguientes, y Carlos da el OK antes de sembrar. ¿Se
  acepta esa parada? Alternativa: una sola ficha paraguas «resto del baseline SL-31» creada ya, que
  todos los motivos citen, y que se parta después con la tabla de T1 (más rápido, pero la ficha nace
  sin caber en un PR).
- **P2 — Coste de la medición.** Si el artefacto del PR #184 «SLT-175 pruebas R621/R623 y guardia
  R631» ya no está, el `workflow_dispatch` corre también el job `e2e` (minutos del plan). ¿Vale, o se
  prefiere medir en el primer PR (borrador no corre: `gate.yml:19-21`) con solo T3 commiteado, que
  dispara el gate sin e2e? T3 no toca producto, así que esa corrida sirve igual para R730.
