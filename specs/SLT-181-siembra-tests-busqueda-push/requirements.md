# SLT-181 «Siembra propia en tests de búsqueda, push y liberación» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1060–R1079** (usados R1060–R1072).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F4 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Incluye tests de cobro y anulación de wallet
(dinero), pero no cambia ningún comportamiento: por eso la ruta ligera es válida. Si sembrar demuestra
un fallo real del código, se para y se pregunta (R1070); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F4`.
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `fksDeOrden`, `crearFksDeOrden`, `crearUsuarioDePrueba`, `La retira SLT-181`, `datos propios`
en `feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`: crean tienda, zona (no central) y usuario dentro de la tx; leen catálogos por clave y lanzan si faltan. | **Se reutiliza** para sembrar. |
| `tests/integration/db/_postgres-real.ts:249,495` | `enTransaccionRevertida` y `fksDeOrden(prisma)` (lee «la primera orden»). | Se usa el primero; el segundo deja de llamarse en el alcance. **No se edita** el archivo. |
| `tests/integration/db/_fixtures/escrituras-459.ts:39,79,183` | `conCandado459`, `sembrarPersonas459` (siembra CONFIRMADA) y `limpiar459`. Lo usa `wallet-anulacion-concurrencia` y otros **29 archivos** de `tests/`. | Se reutiliza tal cual para el caso concurrente (R1063). **No se edita.** |
| `tests/integration/db/454/_escenario.ts:760-775` | `conEscenario` corre el caso como `servi_app` con la empresa de la tx (`comoApp`, no exportado). | Patrón de referencia si un caso lo necesita (R1061). **No se edita**. |
| `progress/impl_SLT-177.md > T5`, `> Tanda «base con datos»` | Cómo se sembró el lote de SLT-177 y por qué un test verde en base vacía cayó en una base con datos de otra empresa. | Mismo patrón; R1061 lo convierte en requisito. |
| Board | SLT-185 «aporte-capital sin empresa en contexto», SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». | Destino de lo que siga rojo por otra causa (R1068). No es duplicado. |

## Alcance

**Dentro: 14 archivos, 14 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 14 siguen en el baseline citando SLT-181 y los 14 archivos existen; la causa sigue: p. ej.
`busqueda-comportamiento.test.ts:144` y `wallet-anulacion-concurrencia.test.ts:39` llaman a
`fksDeOrden(prisma)`). Todos son **base vacía, G7**.

| archivo (`tests/integration/db/…`) | p/f/s | primer error nace en |
|---|---|---|
| `aviso-agregado-repository.test.ts` | 0/11/0 | `:153` («el caso no se puede medir») |
| `busqueda-comportamiento.test.ts` | 11/27/0 | `:207` |
| `busqueda-normalizacion-paridad.test.ts` | 16/1/0 | `:233` |
| `busqueda-sincronizacion-columna.test.ts` | 6/1/0 | `:47` |
| `busqueda-usa-indice.test.ts` | 13/1/0 | `:186` |
| `costo-y-zona-api-415.test.ts` | 0/0/11 | `:135` |
| `liberacion-al-aprobar-cierre-real.test.ts` | 0/0/5 | `:115` |
| `liberacion-reprogramada-cierre-real.test.ts` | 0/0/4 | `:107` |
| `push-canal-restricciones.test.ts` | 1/6/0 | `:77` («el caso no se puede medir») |
| `push-destinatarios-equivalencia.test.ts` | 0/4/0 | `:166` (ídem) |
| `rechazo-tienda-cobro.int.test.ts` | 0/0/10 | `:62` |
| `usuario-preferencia.test.ts` | 2/12/0 | `:72` («el caso no se puede medir») |
| `wallet-anulacion-concurrencia.test.ts` | 0/0/2 | `:40` (filas CONFIRMADAS: dos anulaciones en paralelo) |
| `webhook-evidencias-url-resuelve-sql-real.test.ts` | 0/0/4 | `:94` |

Las 14 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/db/`. Ninguna otra entrada cambia.

**Fuera:** código de producción, `scripts/`, `.github/`, `package.json`, `arnes.manifest`;
`_postgres-real.ts`, `454/_escenario.ts` y `_fixtures/escrituras-459.ts`; arreglar una causa que no sea
la falta de datos (R1068); buscar qué test deja filas ajenas en la base de CI (SLT-188).

**Riesgo conocido.** `busqueda-usa-indice` comprueba el plan de consulta; con pocas filas sembradas el
planificador puede elegir otro plan. Si, sembrado, falla por el plan y no por falta de datos, es otra
causa (R1068), no se fuerza.

**Helpers compartidos.** Solo `_postgres-real.ts` y `_fixtures/escrituras-459.ts` (no se tocan). Si
hiciera falta una función nueva de siembra, va a `_fixtures/orden-minima.ts`. **Choque entre fichas
propias:** SLT-178, SLT-179, SLT-180, SLT-182, SLT-183 y SLT-184 pueden tocar ese mismo archivo, y las
siete tocan `tests/baseline-rojos.json` (claves distintas; conflicto solo textual). La que mergee
después rebasa.

## Requisitos (EARS)

- **R1060** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa`, `cierre_dia` ni gestión, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido,
  saltado ni `todo`.
- **R1061** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite, tarifas, un usuario de cada rol que el archivo use y órdenes), cada archivo del alcance
  DEBE dar el mismo resultado que en R1060.
- **R1062** — Cada caso DEBE crear dentro de su propia transacción revertida todo dato de negocio que
  lea. De la base solo DEBE leer catálogos y geografía por su clave. NO DEBE llamar a `fksDeOrden` ni
  leer una fila de `orden`, `usuario`, `zona`, `tarifa`, `cierre_dia` o gestión que no haya creado el
  propio test.
- **R1063** — SI un caso necesita filas confirmadas (como las dos anulaciones concurrentes de
  `wallet-anulacion-concurrencia`), ENTONCES DEBE sembrarlas con claves únicas propias y borrarlas en
  un `finally` o `afterAll` del mismo archivo, y al terminar el archivo NO DEBE quedar ninguna fila
  suya (comprobado contando por esas claves).
- **R1064** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa. SI la siembra de un caso no llega a la base, ENTONCES ese control DEBE fallar con
  un mensaje que nombre la fila. Ningún caso DEBE terminar con un `return` antes de su primera
  aserción, y SI falta un catálogo, ENTONCES el archivo DEBE fallar con un mensaje que lo nombre.
- **R1065** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse un
  literal esperado por la función que lo genera, y el número de casos (`it`/`test`) de cada archivo NO
  DEBE bajar.
- **R1066** — Para cada archivo, quitar la siembra de una de sus filas DEBE poner en rojo al menos un
  caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje) en
  `progress/impl_SLT-181.md`, con el árbol restaurado después.
- **R1067** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 14 entradas del
  alcance, salvo las que caigan en R1068. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1068** — SI un archivo, ya sembrado según R1062, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1069** — SI la ficha cambia un helper compartido, ENTONCES todos los usuarios de ese helper DEBEN
  seguir verdes en las bases de R1060 y R1061 y en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test. `_postgres-real.ts`, `454/_escenario.ts` y
  `_fixtures/escrituras-459.ts` NO DEBEN cambiar.
- **R1070** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-181.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1071** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1072** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt181_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1060:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1061:** en una segunda desechable (o la misma, tras R1060), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir.
- **R1063:** tras `wallet-anulacion-concurrencia`, contar en la base las filas de sus claves: 0.
- **R1066:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1071:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 14 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**15-16/40** (≤ 40%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo ≈ 980 + baseline
14 × 4 ≈ 56 → **~1040/3000** (35%). Tope de la ficha heredado de SLT-177 (`## Corte`): 20 archivos y 1300
líneas de siembra. Si la siembra pasa de 1300 sin llegar a 3000, se anota el desglose en
`progress/impl_SLT-181.md` y se avisa al leader; no se parte sin su OK.

## Tasks

- [x] **T1 — Punto de partida** (R1060, R1067). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 14 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-181.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 14 filas.
- [x] **T2 — Búsqueda** (R1060-R1065): `busqueda-comportamiento`, `busqueda-normalizacion-paridad`,
  `busqueda-sincronizacion-columna`, `busqueda-usa-indice`. Quitar `fksDeOrden`; sembrar con
  `crearFksDeOrden`/`crearUsuarioDePrueba` dentro de la tx de cada caso; control positivo. *Hecho:* los
  4 verdes en la base de R1060, 0 saltados (o `busqueda-usa-indice` medido como otra causa, R1068).
- [x] **T3 [P con T2] — Push y avisos** (R1060-R1065): `aviso-agregado-repository`,
  `push-canal-restricciones`, `push-destinatarios-equivalencia`, `usuario-preferencia`. *Hecho:* ídem,
  4 archivos.
- [x] **T4 [P con T2] — Liberación, cobro y API** (R1060-R1065, R1063):
  `liberacion-al-aprobar-cierre-real`, `liberacion-reprogramada-cierre-real`,
  `rechazo-tienda-cobro.int`, `wallet-anulacion-concurrencia` (siembra confirmada con limpieza),
  `costo-y-zona-api-415`, `webhook-evidencias-url-resuelve-sql-real`. *Hecho:* ídem, 6 archivos.
- [x] **T5 — Base con datos ajenos** (R1061, R1063, R1069). Depende de T2-T4. Repetir los 14 con la
  empresa ajena confirmada; si el código hace una lectura global, sembrar lo que lee en la empresa del
  caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 14/14 iguales que en R1060; 0 filas
  propias tras cada archivo con siembra confirmada.
- [x] **T6 — Mutaciones** (R1066). Depende de T5. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-181.md`; árbol limpio de mutaciones.
- [x] **T7 — Baseline** (R1067, R1068). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1068). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [x] **T8 — Cierre** (R1069-R1072). *(CI del PR pendiente.)* `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-181.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1060, R1062, R1064, R1065 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1061 | los mismos archivos en la base con empresa ajena (T5) |
| R1063 | `wallet-anulacion-concurrencia` + conteo de filas tras el archivo |
| R1066 | tabla de mutaciones de T6 |
| R1067, R1071 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1068 | motivos reescritos ↔ medición local (reviewer) |
| R1069 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1070, R1072 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T8 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/db/aviso-agregado-repository.test.ts`
- `tests/integration/db/busqueda-comportamiento.test.ts`
- `tests/integration/db/busqueda-normalizacion-paridad.test.ts`
- `tests/integration/db/busqueda-sincronizacion-columna.test.ts`
- `tests/integration/db/busqueda-usa-indice.test.ts`
- `tests/integration/db/costo-y-zona-api-415.test.ts`
- `tests/integration/db/liberacion-al-aprobar-cierre-real.test.ts`
- `tests/integration/db/liberacion-reprogramada-cierre-real.test.ts`
- `tests/integration/db/push-canal-restricciones.test.ts`
- `tests/integration/db/push-destinatarios-equivalencia.test.ts`
- `tests/integration/db/rechazo-tienda-cobro.int.test.ts`
- `tests/integration/db/usuario-preferencia.test.ts`
- `tests/integration/db/wallet-anulacion-concurrencia.test.ts`
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-178…SLT-180, SLT-182…SLT-184)

Estado fuera del cómputo: `progress/impl_SLT-181.md`, `progress/features/SLT-181.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
