# SLT-184 «Orden y zona propias en tests de chat, notas y wallet» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1120–R1139** (usados R1120–R1132).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F7 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Incluye tests de migraciones y de wallet,
pero no toca `db/migrations/` ni cambia ningún comportamiento: por eso la ruta ligera es válida. Si
sembrar demuestra un fallo real del código, se para y se pregunta (R1130); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F7`.
- **Una entrada más que la F7 original:** `tests/integration/db/455/caracterizacion/api-lectura.test.ts`.
  SLT-177 sembró su helper (`454/_escenario.ts`), la volvió a medir en base desechable y el primer error
  pasó a nacer en el propio archivo (`:124`, «la base no tiene un distrito activo con zona»); su motivo
  en el baseline ya cita SLT-184 (`progress/impl_SLT-177.md > Los 32 del lote que siguen rojos`).
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `crearFksDeOrden`, `zona.findFirst`, `orden.findFirst`, `La retira SLT-184`, `datos propios` en
`feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` y `crearFksDeOrden(tx)`: crean tienda, zona (no central) y usuario dentro de la tx; leen catálogos y Cartago/Cartago por clave. No crea órdenes ni gestiones (cada test las suyas). | **Se reutiliza** para sembrar orden y zona. |
| `tests/integration/db/_fixtures/personas-461.ts:25` | `sembrarPersonas461(tx)`: personas creadas en la tx (sin `usuario.findFirst`). Lo importan `wallet-cierres-selector`, `wallet-etiqueta-historial-458`, `wallet-origen-legible` y otros archivos `wallet-*` fuera del alcance. | Se reutiliza; **no se prevé editarlo**. |
| `tests/integration/db/454/_escenario.ts:760-775` | `conEscenario`/`crearEscenario` (lo usa `455/caracterizacion/api-lectura`); `comoApp` corre como `servi_app` con la empresa de la tx. | Se usa tal cual: lo que falta se siembra en el propio archivo con `e.tx`. **No se edita.** |
| `tests/integration/db/_postgres-real.ts:249` | `enTransaccionRevertida`. | Se usa. **No se edita.** |
| `progress/impl_SLT-177.md > T5` | `_picking-476.ts` pasó de «primera zona» a zona sembrada con control `zona.count({id}) === 1`. | Mismo patrón. |
| Board | SLT-179 «Siembra propia en tests de corrección, gestión y reparto» tiene `corregir-datos-cliente.repo.test.ts` (otro archivo); SLT-185 «aporte-capital sin empresa en contexto», SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». | Destino de lo que siga rojo por otra causa (R1128). No es duplicado. |

## Alcance

**Dentro: 18 archivos, 18 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 18 siguen en el baseline citando SLT-184 y los 18 archivos existen; la causa sigue: p. ej.
`wallet-origen-legible.test.ts:48-52` hace `zona.findFirst` y `orden.findFirst` sin filtro, y
`455/caracterizacion/api-lectura.test.ts:120-124` toma «un distrito activo con zona» de la base).

| archivo (`tests/integration/…`) | clase / grupo | p/f/s | primer error nace en |
|---|---|---|---|
| `db/chat-entrante-telefono-cr.test.ts` | base vacía, G7b | 2/18/0 | `:154` |
| `db/confirmacion-fisica-migration.test.ts` | base vacía, G10 | 17/2/0 | `:289` («no tiene gestiones que comprobar») |
| `db/corregir-datos-cliente.chat.test.ts` | base vacía, G7b | 0/0/2 | `:88` |
| `db/geografia-historico-intacto.test.ts` | base vacía, G7b | 0/0/6 | `:54` |
| `db/geografia-ordenes-sin-entregar.test.ts` | base vacía, G7b | 0/0/10 | `:59` |
| `db/habilitacion-api-migration.test.ts` | base vacía, G7b | 8/1/12 | `:588` |
| `db/orden-mensajero-meta-drop-nota-migration.test.ts` | base vacía, G7b | 6/0/7 | `:407` |
| `db/orden-nota-migration.test.ts` | base vacía, G7b | 3/0/13 | `:406` |
| `db/wallet-cierres-selector.test.ts` | base vacía, G9 | 0/8/0 | `:81` |
| `db/wallet-etiqueta-historial-458.test.ts` | base vacía, G9 | 1/1/0 | `:103` («falta una zona») |
| `db/wallet-origen-legible.test.ts` | base vacía, G9 | 0/1/0 | `:52` («faltan zona u orden») |
| `repositories/chat-media-autorizada.int.test.ts` | base vacía, G7b | 0/0/3 | `:159` |
| `repositories/chat-media-historico.int.test.ts` | base vacía, G7b | 0/0/4 | `:168` |
| `repositories/conteo-productos.int.test.ts` | base vacía, G7b | 0/0/8 | `:263` |
| `repositories/dinero-productos.int.test.ts` | base vacía, G9 | 0/0/22 | `:790` |
| `repositories/historico-conversaciones.int.test.ts` | otra causa: **dato ajeno** | 0/0/27 | `tx.zona.findFirst` (`:636`) devolvió una zona de otra empresa; trigger SL017 |
| `repositories/orden-nota.int.test.ts` | base vacía, G7b | 0/0/5 | `:202` |
| `db/455/caracterizacion/api-lectura.test.ts` | base vacía (re-medida en SLT-177) | — | `:124` |

En G7b varios mensajes dicen «no tiene catálogos de geografía/estatus sembrados», pero la base de CI sí
los trae: el test busca una orden o una zona existente de la que tomar las FK. Se trata como base vacía.

Las 18 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/`. Ninguna otra entrada cambia.

**Fuera:** código de producción, `db/migrations/`, `scripts/`, `.github/`, `package.json`,
`arnes.manifest`; `_postgres-real.ts`, `454/_escenario.ts` y `_fixtures/personas-461.ts`; arreglar una
causa que no sea la falta de datos (R1128); buscar qué test deja filas ajenas en la base de CI (SLT-188).

**Helpers compartidos.** `_fixtures/personas-461.ts` y `454/_escenario.ts` no se tocan. Si hiciera falta
una función nueva de siembra (p. ej. distrito asociado a una zona sembrada, o gestiones), va a
`_fixtures/orden-minima.ts`. **Choque entre fichas propias:** SLT-178…SLT-183 pueden tocar ese mismo
archivo, y las siete tocan `tests/baseline-rojos.json` (claves distintas; conflicto solo textual). La
que mergee después rebasa.

## Requisitos (EARS)

- **R1120** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa`, `cierre_dia` ni gestión, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido,
  saltado ni `todo`.
- **R1121** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite con distritos asociados, un usuario de cada rol que el archivo use, órdenes, gestiones
  y conversaciones), cada archivo del alcance DEBE dar el mismo resultado que en R1120.
- **R1122** — Cada caso DEBE crear dentro de su propia transacción revertida toda orden, zona,
  asociación zona-distrito, gestión y demás dato de negocio que lea. De la base solo DEBE leer
  catálogos y geografía por su clave. NO DEBE leer una fila de `orden`, `zona`, `usuario`, `tarifa`,
  `cierre_dia` o gestión que no haya creado el propio test: un `findFirst` sin filtrar por un id
  sembrado, un `SELECT … LIMIT 1` o un producto cartesiano sobre esas tablas cuentan como tal.
- **R1123** — SI un caso necesita filas confirmadas (una migración aplicada fuera de la tx del caso o
  un código que abre su propia transacción), ENTONCES DEBE sembrarlas con claves únicas propias y
  borrarlas en un `finally` o `afterAll` del mismo archivo, y al terminar el archivo NO DEBE quedar
  ninguna fila suya (comprobado contando por esas claves).
- **R1124** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa (p. ej. `zona.count({ where: { id } }) === 1`; en `confirmacion-fisica-migration`,
  el número de gestiones sembradas). SI la siembra de un caso no llega a la base, ENTONCES ese control
  DEBE fallar con un mensaje que nombre la fila. Ningún caso DEBE terminar con un `return` antes de su
  primera aserción, y SI falta un catálogo, ENTONCES el archivo DEBE fallar con un mensaje que lo nombre.
- **R1125** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse un
  literal esperado por la función que lo genera, y el número de casos (`it`/`test`) de cada archivo NO
  DEBE bajar.
- **R1126** — Para cada archivo, quitar la siembra de una de sus filas DEBE poner en rojo al menos un
  caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje) en
  `progress/impl_SLT-184.md`, con el árbol restaurado después.
- **R1127** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 18 entradas del
  alcance, salvo las que caigan en R1128. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1128** — SI un archivo, ya sembrado según R1122, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1129** — SI la ficha cambia un helper compartido, ENTONCES todos los usuarios de ese helper DEBEN
  seguir verdes en las bases de R1120 y R1121 y en el CI del PR, y el helper NO DEBE dejar filas
  confirmadas fuera de la transacción del test. `_postgres-real.ts`, `454/_escenario.ts` y
  `_fixtures/personas-461.ts` NO DEBEN cambiar.
- **R1130** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-184.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1131** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1132** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt184_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1120:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1121:** en una segunda desechable (o la misma, tras R1120), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir. Es la
  condición que tumbó `historico-conversaciones` en CI.
- **R1126:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1131:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 18 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**19-20/40** (≤ 50%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo ≈ 1260 + baseline
18 × 4 ≈ 72 → **~1330/3000** (44%). Tope de la ficha heredado de SLT-177 (`## Corte`): 20 archivos y
1300 líneas de siembra: esta es la ficha más cerca del tope por la entrada añadida (`api-lectura`). Si
la siembra pasa de 1300 sin llegar a 3000, se anota el desglose en `progress/impl_SLT-184.md` y se avisa
al leader; no se parte sin su OK.

## Tasks

- [x] **T1 — Punto de partida** (R1120, R1127). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 18 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-184.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 18 filas.
- [x] **T2 — Chat** (R1120-R1125): `chat-entrante-telefono-cr`, `corregir-datos-cliente.chat`,
  `repositories/chat-media-autorizada.int`, `repositories/chat-media-historico.int`,
  `repositories/historico-conversaciones.int`. Sembrar orden y zona con `crearFksDeOrden` dentro de la
  tx; control positivo. *Hecho:* los 5 verdes en la base de R1120, 0 saltados.
- [x] **T3 [P con T2] — Notas y migraciones** (R1120-R1125, R1123): `orden-nota-migration`,
  `orden-mensajero-meta-drop-nota-migration`, `repositories/orden-nota.int`,
  `habilitacion-api-migration`, `confirmacion-fisica-migration` (sembrar las gestiones que comprueba).
  *Hecho:* ídem, 5 archivos.
- [x] **T4 [P con T2] — Geografía y productos** (R1120-R1125): `geografia-historico-intacto`,
  `geografia-ordenes-sin-entregar`, `repositories/conteo-productos.int`,
  `repositories/dinero-productos.int`, `455/caracterizacion/api-lectura` (distrito asociado a una zona
  sembrada en `e.tx`, sin tocar `454/_escenario.ts`). *Hecho:* ídem, 5 archivos.
- [x] **T5 [P con T2] — Wallet** (R1120-R1125): `wallet-cierres-selector`,
  `wallet-etiqueta-historial-458`, `wallet-origen-legible`. *Hecho:* ídem, 3 archivos.
- [x] **T6 — Base con datos ajenos** (R1121, R1123, R1129). Depende de T2-T5. Repetir los 18 con la
  empresa ajena confirmada; si el código hace una lectura global, sembrar lo que lee en la empresa del
  caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 18/18 iguales que en R1120; 0 filas
  propias tras cada archivo con siembra confirmada.
- [x] **T7 — Mutaciones** (R1126). Depende de T6. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-184.md`; árbol limpio de mutaciones.
- [x] **T8 — Baseline** (R1127, R1128). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1128). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [x] **T9 — Cierre** (R1129-R1132). CI del PR pendiente. `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-184.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1120, R1122, R1124, R1125 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1121, R1123 | los mismos archivos en la base con empresa ajena (T6) |
| R1126 | tabla de mutaciones de T7 |
| R1127, R1131 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1128 | motivos reescritos ↔ medición local (reviewer) |
| R1129 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1130, R1132 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T9 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/db/chat-entrante-telefono-cr.test.ts`
- `tests/integration/db/confirmacion-fisica-migration.test.ts`
- `tests/integration/db/corregir-datos-cliente.chat.test.ts`
- `tests/integration/db/geografia-historico-intacto.test.ts`
- `tests/integration/db/geografia-ordenes-sin-entregar.test.ts`
- `tests/integration/db/habilitacion-api-migration.test.ts`
- `tests/integration/db/orden-mensajero-meta-drop-nota-migration.test.ts`
- `tests/integration/db/orden-nota-migration.test.ts`
- `tests/integration/db/wallet-cierres-selector.test.ts`
- `tests/integration/db/wallet-etiqueta-historial-458.test.ts`
- `tests/integration/db/wallet-origen-legible.test.ts`
- `tests/integration/db/455/caracterizacion/api-lectura.test.ts`
- `tests/integration/repositories/chat-media-autorizada.int.test.ts`
- `tests/integration/repositories/chat-media-historico.int.test.ts`
- `tests/integration/repositories/conteo-productos.int.test.ts`
- `tests/integration/repositories/dinero-productos.int.test.ts`
- `tests/integration/repositories/historico-conversaciones.int.test.ts`
- `tests/integration/repositories/orden-nota.int.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-178…SLT-183)

Estado fuera del cómputo: `progress/impl_SLT-184.md`, `progress/features/SLT-184.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
