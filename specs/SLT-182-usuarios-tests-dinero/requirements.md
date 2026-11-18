# SLT-182 «Usuarios propios en tests de dinero y conciliación» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1080–R1099** (usados R1080–R1092).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F5 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Son tests de dinero (conciliación, gasto
fijo, wallet, ranking), pero esta ficha no cambia ningún comportamiento, solo de dónde sale el usuario
que los tests usan: por eso la ruta ligera es válida. Si sembrar demuestra un fallo real del código,
se para y se pregunta (R1090); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F5`.
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `crearUsuarioDePrueba`, `usuario.findFirst`, `La retira SLT-182`, `datos propios` en
`feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` (rol y `cedula` por clave; email y cédula únicos) y `crearFksDeOrden(tx)`. | **Se reutiliza** para sembrar cada usuario que el test necesita, con su rol. |
| `tests/integration/db/_postgres-real.ts:249` | `enTransaccionRevertida`. | Se usa. **No se edita** el archivo. |
| `tests/integration/db/454/_escenario.ts:760-775` | `conEscenario` corre el caso como `servi_app` con la empresa de la tx (`comoApp`, no exportado). | Patrón de referencia si un caso lo necesita (R1081). **No se edita**. |
| `progress/impl_SLT-177.md > T5` | `_informe-transito-475.ts` y `_whatsapp-envios-474.ts` pasaron de «primer usuario» a `crearUsuarioDePrueba` con control `usuario.count({id}) === 1`. | Mismo patrón. |
| Board | SLT-185 «aporte-capital sin empresa en contexto» (cubre «sin empresa en contexto» en actions), SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». | Destino de lo que siga rojo por otra causa (R1088). No es duplicado. |

## Alcance

**Dentro: 15 archivos, 15 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 15 siguen en el baseline citando SLT-182 y los 15 archivos existen; la causa sigue: p. ej.
`wallet-fecha-elegida.test.ts:62` hace `tx.usuario.findFirst` sin filtro). Todos son **base vacía, G8**
(leen «el primer usuario», o el primero de un rol, o dos).

| archivo (`tests/integration/…`) | p/f/s | primer error nace en |
|---|---|---|
| `actions/analitica-financiera-action.test.ts` | 1/14/0 | `:283` |
| `db/cierre-bodega-conciliacion.int.test.ts` | 6/8/0 | `:178` |
| `db/cierre-bodega-resumen-pendientes.test.ts` | 4/2/0 | `:137` |
| `db/consolidacion-concurrente.int.test.ts` | 0/5/0 | `:84` (concurrente: puede necesitar filas confirmadas, R1083) |
| `db/corregir-conciliacion.int.test.ts` | 0/10/0 | `:73` (dos usuarios: quien marcó y quien corrige) |
| `db/gasto-fijo-cobro-aprobacion.test.ts` | 1/11/0 | `:129` |
| `db/gasto-fijo-cobro-idempotencia.test.ts` | 7/2/0 | `:519` |
| `db/gasto-fijo-cobro-migration.test.ts` | 6/2/0 | `:71` |
| `db/marca-conciliacion.int.test.ts` | 0/8/0 | `:68` |
| `db/mi-wallet-cierres-alcance.test.ts` | 0/0/4 | `:49` |
| `db/premio-ranking-devengo-migration.test.ts` | 25/1/6 | `:447` (un `mensajero`) |
| `db/ranking-snapshot-migration.test.ts` | 43/0/6 | `:803` (dos usuarios) |
| `db/wallet-fecha-elegida.test.ts` | 0/4/0 | `:64` |
| `db/wallet-tienda-cobro.test.ts` | 0/0/13 | `:79` (maestro, `adminTienda`, `mensajero`) |
| `repositories/financiera-cubo-temporal.integration.test.ts` | 5/2/0 | `:309` |

Las 15 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/`. Ninguna otra entrada cambia.

**Fuera:** código de producción (incluido `lib/repositories/_shared/prisma-unique`, que importa
`ranking-snapshot-migration`), `scripts/`, `.github/`, `package.json`, `arnes.manifest`;
`_postgres-real.ts` y `454/_escenario.ts`; arreglar una causa que no sea la falta de datos (R1088), en
particular «sin empresa en contexto» de una action, que es de SLT-185; buscar qué test deja filas
ajenas en la base de CI (SLT-188).

**Helpers compartidos.** Ninguno de los 15 importa un helper de test con guion bajo salvo
`_postgres-real.ts`. Si hiciera falta una función nueva de siembra, va a `_fixtures/orden-minima.ts`.
**Choque entre fichas propias:** SLT-178…SLT-181, SLT-183 y SLT-184 pueden tocar ese mismo archivo, y
las siete tocan `tests/baseline-rojos.json` (claves distintas; conflicto solo textual). La que mergee
después rebasa.

## Requisitos (EARS)

- **R1080** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa`, `cierre_dia` ni gestión, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido,
  saltado ni `todo`.
- **R1081** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite, tarifas, un usuario de cada rol que el archivo use, órdenes y movimientos de wallet),
  cada archivo del alcance DEBE dar el mismo resultado que en R1080.
- **R1082** — Cada caso DEBE crear dentro de su propia transacción revertida cada usuario y todo otro
  dato de negocio que lea, con el rol que el caso exige. De la base solo DEBE leer catálogos y
  geografía por su clave. NO DEBE leer un `usuario` (ni una `orden`, `zona`, `tarifa` o `cierre_dia`)
  que no haya creado el propio test: un `findFirst` sin filtrar por un id sembrado o un
  `SELECT … LIMIT 1` cuentan como tal.
- **R1083** — SI un caso necesita filas confirmadas (dos conexiones concurrentes, una migración o un
  código que abre su propia transacción fuera de la del test), ENTONCES DEBE sembrarlas con claves
  únicas propias y borrarlas en un `finally` o `afterAll` del mismo archivo, y al terminar el archivo
  NO DEBE quedar ninguna fila suya (comprobado contando por esas claves).
- **R1084** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa (p. ej. `usuario.count({ where: { id } }) === 1`). SI la siembra de un caso no llega
  a la base, ENTONCES ese control DEBE fallar con un mensaje que nombre la fila. Ningún caso DEBE
  terminar con un `return` antes de su primera aserción, y SI falta un catálogo (un rol, `cedula`),
  ENTONCES el archivo DEBE fallar con un mensaje que lo nombre.
- **R1085** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción (en especial ningún monto
  esperado), NO DEBE cambiarse un literal esperado por la función que lo genera, y el número de casos
  (`it`/`test`) de cada archivo NO DEBE bajar.
- **R1086** — Para cada archivo, quitar la siembra de uno de sus usuarios DEBE poner en rojo al menos
  un caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje)
  en `progress/impl_SLT-182.md`, con el árbol restaurado después.
- **R1087** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 15 entradas del
  alcance, salvo las que caigan en R1088. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1088** — SI un archivo, ya sembrado según R1082, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1089** — SI la ficha cambia un helper compartido, ENTONCES todos los usuarios de ese helper DEBEN
  seguir verdes en las bases de R1080 y R1081 y en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test. `_postgres-real.ts` y `454/_escenario.ts` NO DEBEN cambiar.
- **R1090** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-182.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1091** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1092** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt182_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1080:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1081:** en una segunda desechable (o la misma, tras R1080), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir. Aquí
  importa: un test de dinero que sume «todo lo de la base» daría otra cifra con datos ajenos.
- **R1086:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1091:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 15 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**16-17/40** (≤ 43%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo ≈ 1050 + baseline
15 × 4 ≈ 60 → **~1110/3000** (37%); cambiar un usuario suele costar menos que una orden, así que es
techo. Tope de la ficha heredado de SLT-177 (`## Corte`): 20 archivos y 1300 líneas de siembra. Si la
siembra pasa de 1300 sin llegar a 3000, se anota el desglose en `progress/impl_SLT-182.md` y se avisa
al leader; no se parte sin su OK.

## Tasks

- [ ] **T1 — Punto de partida** (R1080, R1087). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 15 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-182.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 15 filas.
- [ ] **T2 — Conciliación y cierre de bodega** (R1080-R1085, R1083): `cierre-bodega-conciliacion.int`,
  `cierre-bodega-resumen-pendientes`, `consolidacion-concurrente.int`, `corregir-conciliacion.int`,
  `marca-conciliacion.int`. Cambiar la lectura del usuario por `crearUsuarioDePrueba` dentro de la tx
  (o siembra confirmada con limpieza en el concurrente); control positivo. *Hecho:* los 5 verdes en la
  base de R1080, 0 saltados.
- [ ] **T3 [P con T2] — Gasto fijo y wallet** (R1080-R1085): `gasto-fijo-cobro-aprobacion`,
  `gasto-fijo-cobro-idempotencia`, `gasto-fijo-cobro-migration`, `wallet-fecha-elegida`,
  `wallet-tienda-cobro`, `mi-wallet-cierres-alcance`. *Hecho:* ídem, 6 archivos.
- [ ] **T4 [P con T2] — Analítica y ranking** (R1080-R1085): `actions/analitica-financiera-action`,
  `repositories/financiera-cubo-temporal.integration`, `premio-ranking-devengo-migration`,
  `ranking-snapshot-migration`. *Hecho:* ídem, 4 archivos.
- [ ] **T5 — Base con datos ajenos** (R1081, R1083, R1089). Depende de T2-T4. Repetir los 15 con la
  empresa ajena confirmada; si el código hace una lectura global, sembrar lo que lee en la empresa del
  caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 15/15 iguales que en R1080; 0 filas
  propias tras cada archivo con siembra confirmada.
- [ ] **T6 — Mutaciones** (R1086). Depende de T5. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-182.md`; árbol limpio de mutaciones.
- [ ] **T7 — Baseline** (R1087, R1088). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1088). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [ ] **T8 — Cierre** (R1089-R1092). `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-182.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1080, R1082, R1084, R1085 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1081, R1083 | los mismos archivos en la base con empresa ajena (T5) |
| R1086 | tabla de mutaciones de T6 |
| R1087, R1091 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1088 | motivos reescritos ↔ medición local (reviewer) |
| R1089 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1090, R1092 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T8 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/actions/analitica-financiera-action.test.ts`
- `tests/integration/db/cierre-bodega-conciliacion.int.test.ts`
- `tests/integration/db/cierre-bodega-resumen-pendientes.test.ts`
- `tests/integration/db/consolidacion-concurrente.int.test.ts`
- `tests/integration/db/corregir-conciliacion.int.test.ts`
- `tests/integration/db/gasto-fijo-cobro-aprobacion.test.ts`
- `tests/integration/db/gasto-fijo-cobro-idempotencia.test.ts`
- `tests/integration/db/gasto-fijo-cobro-migration.test.ts`
- `tests/integration/db/marca-conciliacion.int.test.ts`
- `tests/integration/db/mi-wallet-cierres-alcance.test.ts`
- `tests/integration/db/premio-ranking-devengo-migration.test.ts`
- `tests/integration/db/ranking-snapshot-migration.test.ts`
- `tests/integration/db/wallet-fecha-elegida.test.ts`
- `tests/integration/db/wallet-tienda-cobro.test.ts`
- `tests/integration/repositories/financiera-cubo-temporal.integration.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-178…SLT-181, SLT-183, SLT-184)

Estado fuera del cómputo: `progress/impl_SLT-182.md`, `progress/features/SLT-182.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
