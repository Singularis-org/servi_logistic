# SLT-180 «Siembra propia en tests de API keys, historial y borrado de órdenes» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1040–R1059** (usados R1040–R1052).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F3 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Toca tests de API keys (autenticación de
integraciones) y de borrado, pero no cambia ningún comportamiento: por eso la ruta ligera es válida.
Si sembrar demuestra un fallo real del código, se para y se pregunta (R1050); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F3`.
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `fksDeOrden`, `crearFksDeOrden`, `crearUsuarioDePrueba`, `La retira SLT-180`, `datos propios`
en `feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`: crean tienda, zona (no central) y usuario dentro de la tx; leen catálogos por clave y lanzan si faltan. | **Se reutiliza** para sembrar. |
| `tests/integration/db/_postgres-real.ts:249,495` | `enTransaccionRevertida` y `fksDeOrden(prisma)` (lee «la primera orden»). | Se usa el primero; el segundo deja de llamarse en el alcance. **No se edita** el archivo. |
| `tests/integration/db/454/_escenario.ts:760-775` | `conEscenario` corre el caso como `servi_app` con la empresa de la tx (`comoApp`, no exportado). | Patrón de referencia si un caso lo necesita (R1041). **No se edita**. |
| `tests/integration/db/_consultas-en-vuelo.ts` | Lo importa `emisor-relaciones-anidadas` (y `aprobacion-consultas-en-serie`, fuera del alcance). No lee filas de negocio según la medición (el error nace en `emisor-relaciones-anidadas.test.ts:116`). | No se prevé tocarlo; si se toca, R1049. |
| `progress/impl_SLT-177.md > T5`, `> Tanda «base con datos»` | Cómo se sembró el lote de SLT-177 y por qué un test verde en base vacía cayó en una base con datos de otra empresa. | Mismo patrón; R1041 lo convierte en requisito. |
| Board | SLT-185 «aporte-capital sin empresa en contexto», SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». SLT-183 «Usuarios propios en tests de geografía, avisos y migraciones» tiene `api-key-eliminar.test.ts` (otro archivo, causa «usuario»). | Destino de lo que siga rojo por otra causa (R1048). No es duplicado. |

## Alcance

**Dentro: 15 archivos, 15 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 15 siguen en el baseline citando SLT-180 y los 15 archivos existen; la causa sigue: p. ej.
`api-key-eliminabilidad.test.ts:47` llama a `fksDeOrden(prisma)`). Todos son **base vacía, G7**.

| archivo (`tests/integration/db/…`) | p/f/s | primer error nace en |
|---|---|---|
| `486-evidencias-cierres-sql-real.test.ts` | 0/0/6 | `:84` |
| `api-key-eliminabilidad.test.ts` | 0/0/10 | `:51` |
| `api-key-eliminar-fk-inesperada.test.ts` | 0/0/3 | `:54` |
| `api-key-eliminar-tienda-destino.test.ts` | 0/0/2 | `:48` |
| `eliminar-orden-api-frontera-tienda.test.ts` | 0/0/1 | `:54` |
| `eliminar-orden-pantalla-frontera-tienda.test.ts` | 0/0/5 | `:75` |
| `emisor-relaciones-anidadas.test.ts` | 0/0/4 | `:116` |
| `historial-accion-atomicidad.test.ts` | 0/0/22 | `:107` |
| `historial-accion-lectura.test.ts` | 0/16/2 | `:495` |
| `historial-accion-q1-ubicacion.test.ts` | 0/0/5 | `:79` |
| `notificacion-bloqueo-otro-cierre-avisa.test.ts` | 0/0/1 | `:62` |
| `orden-eliminada-actor-admin.test.ts` | 0/0/5 | `:64` |
| `orden-remision-borrada-libera-numero.test.ts` | 0/0/9 | `:72` |
| `orden-traspaso-migration.test.ts` | 4/1/10 | `:211` (fila con la que se miden el CHECK y los R) |
| `tarifa-zona-borrado-fk-real.test.ts` | 0/0/9 | `:83` |

Las 15 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/db/`. Ninguna otra entrada cambia.

**Fuera:** código de producción, `scripts/`, `.github/`, `package.json`, `arnes.manifest`;
`_postgres-real.ts` y `454/_escenario.ts`; arreglar una causa que no sea la falta de datos (R1048);
buscar qué test deja filas ajenas en la base de CI (SLT-188).

**Helpers compartidos.** Solo `_postgres-real.ts` y, en un archivo, `_consultas-en-vuelo.ts` (no se
prevé tocarlo). Si hiciera falta una función nueva de siembra, va a `_fixtures/orden-minima.ts`.
**Choque entre fichas propias:** SLT-178, SLT-179, SLT-181, SLT-182, SLT-183 y SLT-184 pueden tocar
ese mismo archivo, y las siete tocan `tests/baseline-rojos.json` (claves distintas; conflicto solo
textual). La que mergee después rebasa.

## Requisitos (EARS)

- **R1040** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa`, `cierre_dia` ni gestión, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido,
  saltado ni `todo`.
- **R1041** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite, tarifas, un usuario de cada rol que el archivo use, órdenes y API keys), cada archivo
  del alcance DEBE dar el mismo resultado que en R1040.
- **R1042** — Cada caso DEBE crear dentro de su propia transacción revertida todo dato de negocio que
  lea. De la base solo DEBE leer catálogos y geografía por su clave. NO DEBE llamar a `fksDeOrden` ni
  leer una fila de `orden`, `usuario`, `zona`, `tarifa`, `cierre_dia`, gestión o API key que no haya
  creado el propio test.
- **R1043** — SI un caso necesita filas confirmadas (dos conexiones concurrentes, una migración o un
  código que abre su propia transacción fuera de la del test), ENTONCES DEBE sembrarlas con claves
  únicas propias y borrarlas en un `finally` o `afterAll` del mismo archivo, y al terminar el archivo
  NO DEBE quedar ninguna fila suya (comprobado contando por esas claves).
- **R1044** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa. SI la siembra de un caso no llega a la base, ENTONCES ese control DEBE fallar con
  un mensaje que nombre la fila. Ningún caso DEBE terminar con un `return` antes de su primera
  aserción, y SI falta un catálogo, ENTONCES el archivo DEBE fallar con un mensaje que lo nombre.
- **R1045** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse un
  literal esperado por la función que lo genera, y el número de casos (`it`/`test`) de cada archivo NO
  DEBE bajar.
- **R1046** — Para cada archivo, quitar la siembra de una de sus filas DEBE poner en rojo al menos un
  caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje) en
  `progress/impl_SLT-180.md`, con el árbol restaurado después.
- **R1047** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 15 entradas del
  alcance, salvo las que caigan en R1048. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1048** — SI un archivo, ya sembrado según R1042, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1049** — SI la ficha cambia un helper compartido, ENTONCES todos los usuarios de ese helper DEBEN
  seguir verdes en las bases de R1040 y R1041 y en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test. `_postgres-real.ts` y `454/_escenario.ts` NO DEBEN cambiar.
- **R1050** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-180.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1051** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1052** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt180_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1040:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1041:** en una segunda desechable (o la misma, tras R1040), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir.
- **R1046:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1051:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 15 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**16-17/40** (≤ 43%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo ≈ 1050 + baseline
15 × 4 ≈ 60 → **~1110/3000** (37%). Tope de la ficha heredado de SLT-177 (`## Corte`): 20 archivos y 1300
líneas de siembra. Si la siembra pasa de 1300 sin llegar a 3000, se anota el desglose en
`progress/impl_SLT-180.md` y se avisa al leader; no se parte sin su OK.

## Tasks

- [x] **T1 — Punto de partida** (R1040, R1047). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 15 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-180.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 15 filas.
- [x] **T2 — API keys y tarifas** (R1040-R1045): `api-key-eliminabilidad`,
  `api-key-eliminar-fk-inesperada`, `api-key-eliminar-tienda-destino`, `tarifa-zona-borrado-fk-real`.
  Quitar `fksDeOrden`; sembrar con `crearFksDeOrden`/`crearUsuarioDePrueba` dentro de la tx de cada
  caso; control positivo. *Hecho:* los 4 verdes en la base de R1040, 0 saltados.
- [x] **T3 [P con T2] — Historial y evidencias** (R1040-R1045): `historial-accion-atomicidad`,
  `historial-accion-lectura`, `historial-accion-q1-ubicacion`, `emisor-relaciones-anidadas`,
  `486-evidencias-cierres-sql-real`. *Hecho:* ídem, 5 archivos.
- [x] **T4 [P con T2] — Borrado, remisión y traspaso de órdenes** (R1040-R1045, R1043):
  `eliminar-orden-api-frontera-tienda`, `eliminar-orden-pantalla-frontera-tienda`,
  `orden-eliminada-actor-admin`, `orden-remision-borrada-libera-numero`, `orden-traspaso-migration`,
  `notificacion-bloqueo-otro-cierre-avisa`. *Hecho:* ídem, 6 archivos.
- [x] **T5 — Base con datos ajenos** (R1041, R1043, R1049). Depende de T2-T4. Repetir los 15 con la
  empresa ajena confirmada; si el código hace una lectura global, sembrar lo que lee en la empresa del
  caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 15/15 iguales que en R1040; 0 filas
  propias tras cada archivo con siembra confirmada.
- [x] **T6 — Mutaciones** (R1046). Depende de T5. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-180.md`; árbol limpio de mutaciones.
- [x] **T7 — Baseline** (R1047, R1048). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1048). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [x] **T8 — Cierre** (R1049-R1052). `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-180.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito. CI del PR pendiente.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1040, R1042, R1044, R1045 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1041, R1043 | los mismos archivos en la base con empresa ajena (T5) |
| R1046 | tabla de mutaciones de T6 |
| R1047, R1051 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1048 | motivos reescritos ↔ medición local (reviewer) |
| R1049 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1050, R1052 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T8 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/db/486-evidencias-cierres-sql-real.test.ts`
- `tests/integration/db/api-key-eliminabilidad.test.ts`
- `tests/integration/db/api-key-eliminar-fk-inesperada.test.ts`
- `tests/integration/db/api-key-eliminar-tienda-destino.test.ts`
- `tests/integration/db/eliminar-orden-api-frontera-tienda.test.ts`
- `tests/integration/db/eliminar-orden-pantalla-frontera-tienda.test.ts`
- `tests/integration/db/emisor-relaciones-anidadas.test.ts`
- `tests/integration/db/historial-accion-atomicidad.test.ts`
- `tests/integration/db/historial-accion-lectura.test.ts`
- `tests/integration/db/historial-accion-q1-ubicacion.test.ts`
- `tests/integration/db/notificacion-bloqueo-otro-cierre-avisa.test.ts`
- `tests/integration/db/orden-eliminada-actor-admin.test.ts`
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `tests/integration/db/tarifa-zona-borrado-fk-real.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-178, SLT-179, SLT-181…SLT-184)

Estado fuera del cómputo: `progress/impl_SLT-180.md`, `progress/features/SLT-180.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
