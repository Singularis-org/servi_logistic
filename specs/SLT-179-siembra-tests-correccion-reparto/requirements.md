# SLT-179 «Siembra propia en tests de corrección, gestión y reparto» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1020–R1039** (usados R1020–R1032).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F2 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Si sembrar demuestra un fallo real del
código, se para y se pregunta (R1030); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F2`.
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `fksDeOrden`, `crearFksDeOrden`, `crearUsuarioDePrueba`, `La retira SLT-179`, `datos propios`
en `feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`: crean tienda, zona (no central) y usuario dentro de la tx; leen catálogos por clave y lanzan si faltan. | **Se reutiliza** para sembrar. |
| `tests/integration/db/_postgres-real.ts:249,495` | `enTransaccionRevertida` y `fksDeOrden(prisma)` (lee «la primera orden»). | Se usa el primero; el segundo deja de llamarse en el alcance. **No se edita** el archivo. |
| `tests/integration/db/454/_escenario.ts:760-775` | `conEscenario` corre el caso como `servi_app` con la empresa de la tx (`comoApp`, no exportado). | Patrón de referencia si un caso lo necesita (R1021). **No se edita**. |
| `progress/impl_SLT-177.md > T5`, `> Tanda «base con datos»` | Cómo se sembró el lote de SLT-177 y por qué un test verde en base vacía cayó en una base con datos de otra empresa. | Mismo patrón; R1021 lo convierte en requisito. |
| Board | SLT-185 «aporte-capital sin empresa en contexto», SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». | Destino de lo que siga rojo por otra causa (R1028). No es duplicado. |

## Alcance

**Dentro: 15 archivos, 15 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 15 siguen en el baseline citando SLT-179 y los 15 archivos existen; la causa sigue: p. ej.
`traspaso-mensajero.int.test.ts:70` llama a `fksDeOrden(prisma)`). Todos son **base vacía, G7**
(`fksDeOrden` en el propio archivo).

| archivo (`tests/integration/db/…`) | p/f/s | primer error nace en |
|---|---|---|
| `correccion-dia-reparto-efectos.int.test.ts` | 0/0/11 | `:89` |
| `correccion-dia-reparto-historial.int.test.ts` | 0/0/9 | `:67` |
| `correccion-dia-reparto.int.test.ts` | 0/0/18 | `:69` |
| `correccion-fecha-reprogramacion.int.test.ts` | 0/0/23 | `:111` |
| `correccion-resultado-gestion.int.test.ts` | 0/0/14 | `:74` |
| `corregir-datos-cliente.repo.test.ts` | 0/0/22 | `:90` |
| `corregir-ubicacion-geocode.test.ts` | 0/0/11 | `:116` |
| `deshacer-asignacion-zona-satelite.int.test.ts` | 0/0/6 | `:92` |
| `deshacer-gestion-conserva-reserva.int.test.ts` | 0/0/8 | `:83` |
| `gestion-desde-ayuda-dia-reserva.int.test.ts` | 0/0/5 | `:93` |
| `gestiones-detalle-api-405.test.ts` | 0/0/12 | `:136` |
| `novedades-sin-gestionar-aviso-dedupe.test.ts` | 0/5/0 | `:111` («la tabla 'orden' está vacía: el caso no se puede medir») |
| `recoger-lote-dia-reserva.int.test.ts` | 0/0/7 | `:88` |
| `reparto-manana-repository.test.ts` | 0/10/0 | `:147` (ídem) |
| `traspaso-mensajero.int.test.ts` | 0/0/24 | `:72`; además lee `tipoIdentificacion.findFirst` sin clave (`:103`) |

Las 15 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/db/`. Ninguna otra entrada cambia.

**Fuera:** código de producción, `scripts/`, `.github/`, `package.json`, `arnes.manifest`;
`_postgres-real.ts` y `454/_escenario.ts`; arreglar una causa que no sea la falta de datos (R1028);
buscar qué test deja filas ajenas en la base de CI (SLT-188). `corregir-datos-cliente.chat.test.ts` y
`reparto-manana-aviso-dedupe.test.ts` son de SLT-184 y SLT-183, no de esta ficha.

**Helpers compartidos.** Ninguno de los 15 importa un helper con guion bajo salvo `_postgres-real.ts`.
Si hiciera falta una función nueva de siembra, va a `_fixtures/orden-minima.ts`. **Choque entre fichas
propias:** SLT-178, SLT-180, SLT-181, SLT-182, SLT-183 y SLT-184 pueden tocar ese mismo archivo, y las
siete tocan `tests/baseline-rojos.json` (claves distintas; conflicto solo textual). La que mergee
después rebasa.

## Requisitos (EARS)

- **R1020** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa`, `cierre_dia` ni gestión, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido,
  saltado ni `todo`.
- **R1021** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite, tarifas, un usuario de cada rol que el archivo use, órdenes y gestiones), cada archivo
  del alcance DEBE dar el mismo resultado que en R1020.
- **R1022** — Cada caso DEBE crear dentro de su propia transacción revertida todo dato de negocio que
  lea. De la base solo DEBE leer catálogos y geografía por su clave (p. ej. `tipoIdentificacion` por
  `value`, no con `findFirst` sin filtro). NO DEBE llamar a `fksDeOrden` ni leer una fila de `orden`,
  `usuario`, `zona`, `tarifa`, `cierre_dia` o gestión que no haya creado el propio test.
- **R1023** — SI un caso necesita filas confirmadas (dos conexiones concurrentes o un código que abre
  su propia transacción fuera de la del test), ENTONCES DEBE sembrarlas con claves únicas propias y
  borrarlas en un `finally` o `afterAll` del mismo archivo, y al terminar el archivo NO DEBE quedar
  ninguna fila suya (comprobado contando por esas claves).
- **R1024** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa. SI la siembra de un caso no llega a la base, ENTONCES ese control DEBE fallar con
  un mensaje que nombre la fila. Ningún caso DEBE terminar con un `return` antes de su primera
  aserción, y SI falta un catálogo, ENTONCES el archivo DEBE fallar con un mensaje que lo nombre.
- **R1025** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse un
  literal esperado por la función que lo genera, y el número de casos (`it`/`test`) de cada archivo NO
  DEBE bajar.
- **R1026** — Para cada archivo, quitar la siembra de una de sus filas DEBE poner en rojo al menos un
  caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje) en
  `progress/impl_SLT-179.md`, con el árbol restaurado después.
- **R1027** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 15 entradas del
  alcance, salvo las que caigan en R1028. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1028** — SI un archivo, ya sembrado según R1022, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1029** — SI la ficha cambia un helper compartido, ENTONCES todos los usuarios de ese helper DEBEN
  seguir verdes en las bases de R1020 y R1021 y en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test. `_postgres-real.ts` y `454/_escenario.ts` NO DEBEN cambiar.
- **R1030** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-179.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1031** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1032** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt179_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1020:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1021:** en una segunda desechable (o la misma, tras R1020), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir.
- **R1026:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1031:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 15 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**16-17/40** (≤ 43%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo ≈ 1050 + baseline
15 × 4 ≈ 60 → **~1110/3000** (37%). Tope de la ficha heredado de SLT-177 (`## Corte`): 20 archivos y 1300
líneas de siembra; `traspaso-mensajero` (1234 líneas, 24 casos) es el que más puede moverlo. Si la
siembra pasa de 1300 sin llegar a 3000, se anota el desglose en `progress/impl_SLT-179.md` y se avisa
al leader; no se parte sin su OK.

## Tasks

- [ ] **T1 — Punto de partida** (R1020, R1027). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 15 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-179.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 15 filas.
- [ ] **T2 — Correcciones** (R1020-R1025): `correccion-dia-reparto-efectos.int`,
  `correccion-dia-reparto-historial.int`, `correccion-dia-reparto.int`,
  `correccion-fecha-reprogramacion.int`, `correccion-resultado-gestion.int`, `corregir-datos-cliente.repo`,
  `corregir-ubicacion-geocode`. Quitar `fksDeOrden`; sembrar con `crearFksDeOrden`/`crearUsuarioDePrueba`
  dentro de la tx de cada caso; control positivo. *Hecho:* los 7 verdes en la base de R1020, 0 saltados.
- [ ] **T3 [P con T2] — Gestiones y reservas** (R1020-R1025): `deshacer-asignacion-zona-satelite.int`,
  `deshacer-gestion-conserva-reserva.int`, `gestion-desde-ayuda-dia-reserva.int`,
  `recoger-lote-dia-reserva.int`, `gestiones-detalle-api-405`, `novedades-sin-gestionar-aviso-dedupe`.
  *Hecho:* ídem, 6 archivos.
- [ ] **T4 [P con T2] — Reparto y traspaso** (R1020-R1025): `reparto-manana-repository`,
  `traspaso-mensajero.int` (incluye leer `cedula` por clave en vez de `findFirst`). *Hecho:* ídem, 2 archivos.
- [ ] **T5 — Base con datos ajenos** (R1021, R1023, R1029). Depende de T2-T4. Repetir los 15 con la
  empresa ajena confirmada; si el código hace una lectura global, sembrar lo que lee en la empresa del
  caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 15/15 iguales que en R1020; 0 filas
  propias tras cada archivo con siembra confirmada.
- [ ] **T6 — Mutaciones** (R1026). Depende de T5. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-179.md`; árbol limpio de mutaciones.
- [ ] **T7 — Baseline** (R1027, R1028). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1028). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [ ] **T8 — Cierre** (R1029-R1032). `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-179.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1020, R1022, R1024, R1025 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1021, R1023 | los mismos archivos en la base con empresa ajena (T5) |
| R1026 | tabla de mutaciones de T6 |
| R1027, R1031 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1028 | motivos reescritos ↔ medición local (reviewer) |
| R1029 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1030, R1032 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T8 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/db/correccion-dia-reparto-efectos.int.test.ts`
- `tests/integration/db/correccion-dia-reparto-historial.int.test.ts`
- `tests/integration/db/correccion-dia-reparto.int.test.ts`
- `tests/integration/db/correccion-fecha-reprogramacion.int.test.ts`
- `tests/integration/db/correccion-resultado-gestion.int.test.ts`
- `tests/integration/db/corregir-datos-cliente.repo.test.ts`
- `tests/integration/db/corregir-ubicacion-geocode.test.ts`
- `tests/integration/db/deshacer-asignacion-zona-satelite.int.test.ts`
- `tests/integration/db/deshacer-gestion-conserva-reserva.int.test.ts`
- `tests/integration/db/gestion-desde-ayuda-dia-reserva.int.test.ts`
- `tests/integration/db/gestiones-detalle-api-405.test.ts`
- `tests/integration/db/novedades-sin-gestionar-aviso-dedupe.test.ts`
- `tests/integration/db/recoger-lote-dia-reserva.int.test.ts`
- `tests/integration/db/reparto-manana-repository.test.ts`
- `tests/integration/db/traspaso-mensajero.int.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-178, SLT-180…SLT-184)

Estado fuera del cómputo: `progress/impl_SLT-179.md`, `progress/features/SLT-179.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
