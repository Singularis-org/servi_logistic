# SLT-178 «Siembra propia en los tests de cierres» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1000–R1019** (usados R1000–R1012).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F1 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Toca tests de cierres (dinero), pero no
cambia ningún comportamiento: por eso la ruta ligera es válida. Si sembrar demuestra un fallo real del
código, se para y se pregunta (R1010); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F1`.
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `fksDeOrden`, `crearFksDeOrden`, `crearUsuarioDePrueba`, `La retira SLT-178`, `datos propios`
en `feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read; lo buscado son tests y datos, no
símbolos de producto).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`: crean tienda, zona (no central) y usuario dentro de la tx; leen catálogos por clave y lanzan si faltan. | **Se reutiliza** para sembrar. |
| `tests/integration/db/_postgres-real.ts:249,495` | `enTransaccionRevertida` y `fksDeOrden(prisma)` (lee «la primera orden»). | Se usa el primero; el segundo deja de llamarse en el alcance. **No se edita** el archivo. |
| `tests/integration/db/454/_escenario.ts:760-775` | `conEscenario` corre el caso como `servi_app` con la empresa de la tx (`comoApp`, no exportado): así una lectura global del código (p. ej. `findCentralZonaId`) ve solo la empresa del caso. | Patrón de referencia si un caso lo necesita (R1001). **No se edita** el archivo. |
| `progress/impl_SLT-177.md > T5`, `> Tanda «base con datos»` | Cómo se sembró el lote de SLT-177 y por qué un test verde en base vacía cayó en una base con datos de otra empresa. | Mismo patrón; R1001 lo convierte en requisito. |
| Board | SLT-185 «aporte-capital sin empresa en contexto», SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». | Destino de lo que siga rojo por otra causa (R1008). No es duplicado. |

## Alcance

**Dentro: 17 archivos, 17 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 17 siguen en el baseline citando SLT-178 y los 17 archivos existen; la causa sigue: p. ej.
`cierre-aprobacion-libera-solo-lo-suyo.test.ts:63` llama a `fksDeOrden(prisma)` en el `beforeAll`).

| archivo (`tests/integration/db/…`) | clase (run 43973243440) | p/f/s | primer error nace en |
|---|---|---|---|
| `cierre-aprobacion-libera-solo-lo-suyo.test.ts` | base vacía (G7) | 0/0/2 | `:65` |
| `cierre-aprobar-el-mas-viejo-desbloquea.test.ts` | otra causa: **dato ajeno** | 0/1/0 | `fksDeOrden` (`:122`) devolvió una orden de otra empresa; trigger SL017 |
| `cierre-bloqueo-nv-sql-real.test.ts` | base vacía (G7) | 0/0/18 | `:62` |
| `cierre-descarga-fechas-sql-real.test.ts` | otra causa: **dato ajeno** | 0/3/0 | `fksDeOrden` (`:77`), ídem |
| `cierre-descarga-intentos-entrega-sql-real.test.ts` | base vacía (G7) | 0/0/4 | `:150` |
| `cierre-excluye-gestiones-de-escritorio.test.ts` | base vacía (G7) | 0/0/6 | `:91` |
| `cierre-rechazado-aviso-dedupe.test.ts` | base vacía (G7) | 0/0/6 | `:65` |
| `cierre-rechazado-jornada-sql-real.test.ts` | base vacía (G7) | 0/0/6 | `:65` |
| `cierre-rechazo-tienda-aprobacion.test.ts` | base vacía (G7) | 0/0/16 | `:762` |
| `cierre-rechazo-tienda-sql-real.test.ts` | base vacía (G7) | 0/0/8 | `:78` |
| `cierre-rechazo-tienda-totales.test.ts` | base vacía (G7) | 0/0/6 | `:336` |
| `cierre-segundo-vincula-solo-lo-suyo.test.ts` | base vacía (G7) | 0/0/1 | `:60` |
| `cierre-sin-gestion-sql-real.test.ts` | base vacía (G7) | 0/0/9 | `:97` |
| `cierre-sin-gestion-tope-sql-real.test.ts` | base vacía (G7) | 0/0/9 | `:166` |
| `cierres-admin-retornables-sql-real.test.ts` | base vacía (G7) | 0/0/5 | `:88` |
| `cierres-filtro-estado-sql-real.test.ts` | base vacía (G7) | 0/0/7 | `:84` |
| `corte-diario-segundo-cierre-sql-real.test.ts` | base vacía (G7) | 0/0/4 | `:102` |

Las 17 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/db/`. Ninguna otra entrada cambia.

**Fuera:** código de producción, `scripts/`, `.github/`, `package.json`, `arnes.manifest`;
`_postgres-real.ts` y `454/_escenario.ts`; arreglar una causa que no sea la falta de datos (R1008);
buscar qué test deja filas ajenas en la base de CI (es SLT-188).

**Helpers compartidos.** Ninguno de los 17 importa un helper con guion bajo salvo `_postgres-real.ts`.
Si hiciera falta una función nueva de siembra (p. ej. zona central de la empresa del caso, o correr como
`servi_app`), va a `_fixtures/orden-minima.ts`. **Choque entre fichas propias:** SLT-179, SLT-180,
SLT-181, SLT-182, SLT-183 y SLT-184 pueden tocar ese mismo archivo, y las siete tocan
`tests/baseline-rojos.json` (claves distintas; conflicto solo textual). La que mergee después rebasa.

## Requisitos (EARS)

- **R1000** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa` ni `cierre_dia`, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido, saltado ni `todo`.
- **R1001** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite, tarifas, un usuario de cada rol que el archivo use y órdenes), cada archivo del alcance
  DEBE dar el mismo resultado que en R1000.
- **R1002** — Cada caso DEBE crear dentro de su propia transacción revertida todo dato de negocio que
  lea. De la base solo DEBE leer catálogos y geografía por su clave. NO DEBE llamar a `fksDeOrden` ni
  leer una fila de `orden`, `usuario`, `zona`, `tarifa`, `cierre_dia` o gestión que no haya creado el
  propio test (un `findFirst` sin filtrar por un id sembrado o un `SELECT … LIMIT 1` cuentan como tal).
- **R1003** — SI un caso necesita filas confirmadas (dos conexiones concurrentes o un código que abre
  su propia transacción fuera de la del test y no admite el proxy de `$transaction`), ENTONCES DEBE
  sembrarlas con claves únicas propias y borrarlas en un `finally` o `afterAll` del mismo archivo, y
  al terminar el archivo NO DEBE quedar ninguna fila suya (comprobado contando por esas claves).
- **R1004** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa. SI la siembra de un caso no llega a la base, ENTONCES ese control DEBE fallar con
  un mensaje que nombre la fila. Ningún caso DEBE terminar con un `return` antes de su primera
  aserción, y SI falta un catálogo, ENTONCES el archivo DEBE fallar con un mensaje que lo nombre, sin
  saltarse ni dar `passed`.
- **R1005** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse un
  literal esperado por la función que lo genera, y el número de casos (`it`/`test`) de cada archivo NO
  DEBE bajar.
- **R1006** — Para cada archivo, quitar la siembra de una de sus filas DEBE poner en rojo al menos un
  caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje) en
  `progress/impl_SLT-178.md`, con el árbol restaurado después.
- **R1007** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 17 entradas del
  alcance, salvo las que caigan en R1008. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1008** — SI un archivo, ya sembrado según R1002, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1009** — SI la ficha cambia un helper compartido, ENTONCES todos los usuarios de ese helper DEBEN
  seguir verdes en las bases de R1000 y R1001 y en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test. `_postgres-real.ts` y `454/_escenario.ts` NO DEBEN cambiar.
- **R1010** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-178.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1011** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1012** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt178_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1000:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1001:** en una segunda desechable (o la misma, tras R1000), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir.
- **R1006:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1011:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 17 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**18-19/40** (≤ 48%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo (SLT-177: 952 líneas para
13 archivos con baseline y guardia) ≈ 1190 + baseline 17 × 4 ≈ 70 → **~1260/3000** (42%). Tope de la
ficha heredado de SLT-177 (`## Corte`): 20 archivos y 1300 líneas de siembra. Si la siembra pasa de
1300 sin llegar a 3000, se anota el desglose en `progress/impl_SLT-178.md` y se avisa al leader; no se
parte sin su OK.

## Tasks

- [ ] **T1 — Punto de partida** (R1000, R1007). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 17 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-178.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 17 filas.
- [ ] **T2 — Aprobación y segundo cierre** (R1000-R1005): `cierre-aprobacion-libera-solo-lo-suyo`,
  `cierre-aprobar-el-mas-viejo-desbloquea`, `cierre-segundo-vincula-solo-lo-suyo`,
  `corte-diario-segundo-cierre-sql-real`, `cierre-bloqueo-nv-sql-real`. Quitar `fksDeOrden` del
  `beforeAll`; sembrar con `crearFksDeOrden`/`crearUsuarioDePrueba` dentro de la tx de cada caso;
  control positivo. *Hecho:* los 5 verdes en la base de R1000, 0 saltados.
- [ ] **T3 [P con T2] — Rechazos** (R1000-R1005): `cierre-rechazado-aviso-dedupe`,
  `cierre-rechazado-jornada-sql-real`, `cierre-rechazo-tienda-aprobacion`,
  `cierre-rechazo-tienda-sql-real`, `cierre-rechazo-tienda-totales`. *Hecho:* ídem, 5 archivos.
- [ ] **T4 [P con T2] — Descargas, gestiones y listados** (R1000-R1005):
  `cierre-descarga-fechas-sql-real`, `cierre-descarga-intentos-entrega-sql-real`,
  `cierre-excluye-gestiones-de-escritorio`, `cierre-sin-gestion-sql-real`,
  `cierre-sin-gestion-tope-sql-real`, `cierres-admin-retornables-sql-real`,
  `cierres-filtro-estado-sql-real`. *Hecho:* ídem, 7 archivos.
- [ ] **T5 — Base con datos ajenos** (R1001, R1003, R1009). Depende de T2-T4. Repetir los 17 con la
  empresa ajena confirmada; si el código hace una lectura global (zona central), sembrar la central en
  la empresa del caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 17/17 iguales que en R1000;
  0 filas propias tras cada archivo con siembra confirmada.
- [ ] **T6 — Mutaciones** (R1006). Depende de T5. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-178.md`; `git status` limpio de mutaciones.
- [ ] **T7 — Baseline** (R1007, R1008). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1008). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [ ] **T8 — Cierre** (R1009-R1012). `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-178.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1000, R1002, R1004, R1005 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1001, R1003 | los mismos archivos en la base con empresa ajena (T5) |
| R1006 | tabla de mutaciones de T6 |
| R1007, R1011 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1008 | motivos reescritos ↔ medición local (reviewer) |
| R1009 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1010, R1012 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T8 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/db/cierre-aprobacion-libera-solo-lo-suyo.test.ts`
- `tests/integration/db/cierre-aprobar-el-mas-viejo-desbloquea.test.ts`
- `tests/integration/db/cierre-bloqueo-nv-sql-real.test.ts`
- `tests/integration/db/cierre-descarga-fechas-sql-real.test.ts`
- `tests/integration/db/cierre-descarga-intentos-entrega-sql-real.test.ts`
- `tests/integration/db/cierre-excluye-gestiones-de-escritorio.test.ts`
- `tests/integration/db/cierre-rechazado-aviso-dedupe.test.ts`
- `tests/integration/db/cierre-rechazado-jornada-sql-real.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-aprobacion.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-rechazo-tienda-totales.test.ts`
- `tests/integration/db/cierre-segundo-vincula-solo-lo-suyo.test.ts`
- `tests/integration/db/cierre-sin-gestion-sql-real.test.ts`
- `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts`
- `tests/integration/db/cierres-admin-retornables-sql-real.test.ts`
- `tests/integration/db/cierres-filtro-estado-sql-real.test.ts`
- `tests/integration/db/corte-diario-segundo-cierre-sql-real.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-179…SLT-184)

Estado fuera del cómputo: `progress/impl_SLT-178.md`, `progress/features/SLT-178.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
