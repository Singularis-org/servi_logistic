# SLT-183 «Usuarios propios en tests de geografía, avisos y migraciones» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1100–R1119** (usados R1100–R1112).

Este archivo es el spec entero: no hay `design.md` ni `tasks.md`. Es la rebanada F6 del corte de
SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31»
(`specs/SLT-177-remedir-baseline-sl31/requirements.md > ## Corte`) y repite su patrón R736-R741.

**Sin código de producción.** El diff solo toca `tests/`. Incluye tests de migraciones y de API keys,
pero no toca `db/migrations/` ni cambia ningún comportamiento: por eso la ruta ligera es válida. Si
sembrar demuestra un fallo real del código, se para y se pregunta (R1110); no se arregla aquí.

## Origen

- Medición de SLT-177, run **43973243440** de `gate.yml` (2026-11-16, Postgres 17, `migrate deploy` +
  `db:seed`): `progress/medicion_SLT-177.md > Tabla por archivo` y `> Reparto propuesto por destino > F6`.
- Decisiones de Carlos en SLT-177 (`progress/features/SLT-177.md > Decisiones`, 2026-11-16) que
  aplican aquí: un archivo que, sembrado, siga rojo por otra causa se queda en el baseline con motivo
  medido; la base desechable lleva `db:seed`, como la de CI.

## Lo que ya existe

Buscado `crearUsuarioDePrueba`, `usuario.findFirst`, `La retira SLT-183`, `datos propios` en
`feature_list.json`, `specs/`, `progress/` y `tests/` (Grep/Read).

| Dónde | Qué | Qué se hace |
|---|---|---|
| `tests/integration/db/_fixtures/orden-minima.ts:32,71` | `crearUsuarioDePrueba(tx, rol)` (rol y `cedula` por clave; email y cédula únicos) y `crearFksDeOrden(tx)`. Ya lo importa `cobertura-repository`. | **Se reutiliza** para sembrar cada usuario. |
| `tests/integration/db/_fixtures/superadmin-32.ts:39,58,142` | `idDeRol`, `insertarUsuario`, `tomarLockDeSuperadmin` (un solo superadmin por base). Lo importa `geografia-registro-accion` y otros archivos fuera del alcance. | Se reutiliza si el actor ha de ser superadmin. **No se prevé editarlo.** |
| `tests/integration/db/_exclusion-demo-qa.ts:45` | `tomarExclusionDemoQa`. Lo importan los 4 `notificacion-evento-*-migration` del alcance y 3 más fuera. | **No se prevé editarlo.** |
| `tests/integration/db/_whatsapp-envios-474.ts` | Ya sembrado en SLT-177 (usuario modelo con `crearUsuarioDePrueba`). `whatsapp-envio-idempotencia-programado` falla en su PROPIA línea (`:31`, «hacen falta dos usuarios»). | Se siembra en el archivo; el helper no se toca. |
| `tests/integration/db/_postgres-real.ts:249` | `enTransaccionRevertida`. | Se usa. **No se edita.** |
| `tests/integration/db/454/_escenario.ts:760-775` | `comoApp` (no exportado): corre el caso como `servi_app` con la empresa de la tx. | Patrón de referencia (R1101). **No se edita.** |
| Board | SLT-180 «Siembra propia en tests de API keys, historial y borrado de órdenes» tiene otros tres `api-key-*` (causa «orden»); SLT-185 «aporte-capital sin empresa en contexto», SLT-187 «Tests de migración desfasados tras SL-17», SLT-188 «Tests que dejan filas fuera de su transacción», SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)». | Destino de lo que siga rojo por otra causa (R1108). No es duplicado. |

## Alcance

**Dentro: 15 archivos, 15 entradas de `tests/baseline-rojos.json`** (comprobado el 2026-11-17 en este
worktree: las 15 siguen en el baseline citando SLT-183 y los 15 archivos existen; la causa sigue: p. ej.
`geografia-renombrado.test.ts:76` hace `prisma.usuario.findFirst`). Todos son **base vacía, G8**.

| archivo (`tests/integration/db/…`) | p/f/s | primer error nace en |
|---|---|---|
| `api-key-eliminar.test.ts` | 0/0/10 | `:54` (ningún usuario `maestro`) |
| `asistente-uso-diario.int.test.ts` | 0/0/11 | `:55` |
| `cobertura-repository.test.ts` | 3/0/2 | `:76` (ningún `adminTienda`) |
| `geografia-cascada-reversible.test.ts` | 0/0/10 | `:59` (sin actor) |
| `geografia-registro-accion.test.ts` | 2/0/12 | `:80` (sin actor) |
| `geografia-renombrado.test.ts` | 0/0/17 | `:80` (sin actor) |
| `notificacion-evento-cierre-rechazado-migration.test.ts` | 25/1/0 | `:478` |
| `notificacion-evento-geocodificacion-caida-migration.test.ts` | 25/2/0 | `:427` |
| `notificacion-evento-reparto-manana-migration.test.ts` | 26/1/0 | `:510` |
| `notificacion-evento-traspaso-migration.test.ts` | 27/1/0 | `:475` |
| `reparto-manana-aviso-dedupe.test.ts` | 0/0/8 | `:59` (dos usuarios) |
| `usuario-contar-adminsatelites.test.ts` | 0/2/0 | `:65` |
| `vista-filtro.test.ts` | 0/0/8 | `:93` |
| `webhook-suscripcion-circuito-migracion.test.ts` | 14/3/0 | `:220` |
| `whatsapp-envio-idempotencia-programado.test.ts` | 0/0/4 | `:31` (dos usuarios) |

Las 15 claves de `tests/baseline-rojos.json > archivos` que retira son esas rutas, con el prefijo
`tests/integration/db/`. Ninguna otra entrada cambia (`vista-filtro-migration.test.ts` es de SLT-187).

**Fuera:** código de producción, `db/migrations/`, `scripts/`, `.github/`, `package.json`,
`arnes.manifest`; `_postgres-real.ts` y `454/_escenario.ts`; arreglar una causa que no sea la falta de
datos (R1108); buscar qué test deja filas ajenas en la base de CI (SLT-188).

**Riesgo conocido.** `usuario-contar-adminsatelites` cuenta usuarios: con datos de otra empresa (R1101)
el conteo solo es estable si el caso cuenta en su empresa o compara antes/después. Si el código cuenta
toda la base sin acotar, es una lectura global (posible fallo real, R1110), no se esconde en el test.

**Helpers compartidos.** `_fixtures/superadmin-32.ts`, `_exclusion-demo-qa.ts` y `_whatsapp-envios-474.ts`
no se prevé tocarlos; si se tocan, R1109 (todos sus usuarios verdes). Si hiciera falta una función
nueva de siembra, va a `_fixtures/orden-minima.ts`. **Choque entre fichas propias:** SLT-178…SLT-182 y
SLT-184 pueden tocar ese mismo archivo, y las siete tocan `tests/baseline-rojos.json` (claves distintas;
conflicto solo textual). La que mergee después rebasa.

## Requisitos (EARS)

- **R1100** — CUANDO un archivo del alcance corre contra una base desechable migrada con catálogos
  (`prisma migrate deploy` + `pnpm run db:seed`) y sin ninguna fila de `orden`, `usuario`, `zona`,
  `tarifa`, `cierre_dia` ni gestión, DEBE ejecutar todos sus casos y pasarlos: ninguno fallido,
  saltado ni `todo`.
- **R1101** — CUANDO esa misma base tiene además filas confirmadas de **otra** empresa (zona central,
  zona satélite, un usuario de cada rol que el archivo use, incluido `adminSatelite`, y órdenes), cada
  archivo del alcance DEBE dar el mismo resultado que en R1100.
- **R1102** — Cada caso DEBE crear dentro de su propia transacción revertida cada usuario y todo otro
  dato de negocio que lea, con el rol que el caso exige. De la base solo DEBE leer catálogos y
  geografía por su clave. NO DEBE leer un `usuario` (ni una `orden`, `zona`, `tarifa` o `cierre_dia`)
  que no haya creado el propio test: un `findFirst` sin filtrar por un id sembrado o un
  `SELECT … LIMIT 1` cuentan como tal.
- **R1103** — SI un caso necesita filas confirmadas (una migración aplicada fuera de la tx del caso, el
  candado de superadmin o un código que abre su propia transacción), ENTONCES DEBE sembrarlas con
  claves únicas propias y borrarlas en un `finally` o `afterAll` del mismo archivo, y al terminar el
  archivo NO DEBE quedar ninguna fila suya (comprobado contando por esas claves).
- **R1104** — Cada archivo DEBE tener un control positivo que afirme el número exacto de filas
  sembradas que usa (p. ej. `usuario.count({ where: { id } }) === 1`). SI la siembra de un caso no llega
  a la base, ENTONCES ese control DEBE fallar con un mensaje que nombre la fila. Ningún caso DEBE
  terminar con un `return` antes de su primera aserción, y SI falta un catálogo, ENTONCES el archivo
  DEBE fallar con un mensaje que lo nombre.
- **R1105** — Al sembrar NO DEBE quitarse ni debilitarse ninguna aserción, NO DEBE cambiarse un
  literal esperado por la función que lo genera, y el número de casos (`it`/`test`) de cada archivo NO
  DEBE bajar.
- **R1106** — Para cada archivo, quitar la siembra de uno de sus usuarios DEBE poner en rojo al menos
  un caso de ese archivo; cada mutación DEBE quedar anotada (archivo, fila quitada, caso rojo, mensaje)
  en `progress/impl_SLT-183.md`, con el árbol restaurado después.
- **R1107** — `tests/baseline-rojos.json > archivos` NO DEBE contener ninguna de las 15 entradas del
  alcance, salvo las que caigan en R1108. Las entradas que no son del alcance NO DEBEN cambiar.
- **R1108** — SI un archivo, ya sembrado según R1102, sigue rojo por una causa que no es la falta de
  datos, ENTONCES su entrada DEBE quedarse con el `motivo` reescrito (clase, primera línea del error,
  `archivo:línea`, fecha de la medición local y ficha que la retira) y el `desde` intacto. La ficha
  citada DEBE ser una del board que cubra esa causa (SLT-185, SLT-187, SLT-188 o SLT-195); SI ninguna la
  cubre, ENTONCES la implementación DEBE parar y avisar al leader antes de escribir el motivo.
- **R1109** — SI la ficha cambia un helper compartido (`_fixtures/orden-minima.ts`,
  `_fixtures/superadmin-32.ts`, `_exclusion-demo-qa.ts` o `_whatsapp-envios-474.ts`), ENTONCES todos
  los usuarios de ese helper DEBEN seguir verdes en las bases de R1100 y R1101 y en el CI del PR, y el
  helper NO DEBE dejar filas confirmadas fuera de la transacción del test. `_postgres-real.ts` y
  `454/_escenario.ts` NO DEBEN cambiar.
- **R1110** — El diff NO DEBE tocar `lib/`, `app/`, `components/`, `hooks/`, `db/`, `scripts/`,
  `.github/`, `package.json` ni ningún archivo de `arnes.manifest`. SI la siembra demuestra un fallo
  real del código de producción, ENTONCES la implementación DEBE parar, anotar la evidencia en
  `progress/impl_SLT-183.md` y preguntar al leader; el archivo se queda en el baseline mientras.
- **R1111** — CUANDO corre `gate-completo` en el PR de esta ficha, DEBE salir «sin rojos nuevos» y con
  0 archivos «por limpiar», y los archivos retirados del baseline DEBEN aparecer ejecutados y verdes.
- **R1112** — El diff DEBE quedar por debajo de `gate.tamano_pr` (40 archivos, 1000 líneas de
  producción, 3000 de tests) sin línea `tamano-pr-aceptado`.

## Cómo se verifica

- **Base desechable nueva**, nunca la del `.env` y nunca `prisma migrate reset`: crearla con el
  wrapper `con-desechable.cjs` del scratchpad del leader (no está en el repo: pedírselo; no lee el
  `.env` ni imprime la URL), p. ej. `servi_slt183_desechable`; después `pnpm exec prisma migrate deploy`
  y `pnpm run db:seed` por el mismo wrapper, igual que `gate.yml`. Exportar su `DATABASE_URL`
  **antes** de cualquier `vitest`, incluido `vitest related`. Anotar la versión de Postgres (CI usa 17).
- **R1100:** `pnpm exec vitest run <archivo> --reporter=json` en esa base; contar passed/failed/skipped
  por archivo desde el JSON (0 saltados).
- **R1101:** en una segunda desechable (o la misma, tras R1100), sembrar CONFIRMADA una empresa ajena
  con un script **fuera del repo** (como `slt177-otra-empresa.tmp.ts` de SLT-177) y repetir.
- **R1106:** mutaciones una a una, nunca a la vez que el gate; restaurar con `git checkout -- <archivo>`.
- **R1111:** el CI del PR (`gate-completo`).
- No imprimir URLs ni secretos: el `.env` se comprueba con booleanos.

## Tamaño

Archivos: 15 de siembra + `tests/baseline-rojos.json` (+ `_fixtures/orden-minima.ts` si hace falta) =
**16-17/40** (≤ 43%). Producción: 0/1000. Tests: siembra ~70 líneas por archivo ≈ 1050 + baseline
15 × 4 ≈ 60 → **~1110/3000** (37%); cambiar un usuario suele costar menos que una orden, así que es
techo. Tope de la ficha heredado de SLT-177 (`## Corte`): 20 archivos y 1300 líneas de siembra. Si la
siembra pasa de 1300 sin llegar a 3000, se anota el desglose en `progress/impl_SLT-183.md` y se avisa
al leader; no se parte sin su OK.

## Tasks

- [ ] **T1 — Punto de partida** (R1100, R1107). Worktree al día con `origin/dev`; `.env` copiado al
  worktree (sin leerlo); base desechable de `## Cómo se verifica`. Correr los 15 archivos tal cual y
  anotar p/f/s en `progress/impl_SLT-183.md`. Si alguno ya pasa, o ya no está en el baseline, se anota y
  sale del alcance. *Hecho:* tabla «antes» con 15 filas.
- [ ] **T2 — Geografía** (R1100-R1105, R1103): `geografia-cascada-reversible`,
  `geografia-registro-accion`, `geografia-renombrado`, `cobertura-repository`. Cambiar la lectura del
  actor por `crearUsuarioDePrueba` (o el camino de `superadmin-32` si el actor es superadmin) dentro de
  la tx; control positivo. *Hecho:* los 4 verdes en la base de R1100, 0 saltados.
- [ ] **T3 [P con T2] — Avisos y migraciones de eventos** (R1100-R1105, R1103):
  `notificacion-evento-cierre-rechazado-migration`, `notificacion-evento-geocodificacion-caida-migration`,
  `notificacion-evento-reparto-manana-migration`, `notificacion-evento-traspaso-migration`,
  `reparto-manana-aviso-dedupe`, `whatsapp-envio-idempotencia-programado`,
  `webhook-suscripcion-circuito-migracion`. *Hecho:* ídem, 7 archivos.
- [ ] **T4 [P con T2] — Usuarios, API keys y vistas** (R1100-R1105): `api-key-eliminar`,
  `asistente-uso-diario.int`, `usuario-contar-adminsatelites`, `vista-filtro`. *Hecho:* ídem, 4 archivos.
- [ ] **T5 — Base con datos ajenos** (R1101, R1103, R1109). Depende de T2-T4. Repetir los 15 con la
  empresa ajena confirmada; si el código hace una lectura global, sembrar lo que lee en la empresa del
  caso y correr como `servi_app` (patrón `comoApp`). *Hecho:* 15/15 iguales que en R1100; 0 filas
  propias tras cada archivo con siembra confirmada.
- [ ] **T6 — Mutaciones** (R1106). Depende de T5. Una por archivo. *Hecho:* tabla mutación → caso
  rojo → restaurado en `progress/impl_SLT-183.md`; árbol limpio de mutaciones.
- [ ] **T7 — Baseline** (R1107, R1108). Borrar las entradas de los verdes; reescribir el motivo de los
  que sigan rojos por otra causa (o parar, R1108). *Hecho:* `git diff tests/baseline-rojos.json` solo
  quita claves del alcance o reescribe sus motivos.
- [ ] **T8 — Cierre** (R1109-R1112). `pnpm run typecheck`, `pnpm run lint`, `./init.sh` en verde;
  `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json`
  vacío; `node scripts/tamano-pr.mjs` bajo el tope. En `progress/impl_SLT-183.md`: mapa R → test, salidas
  y, tras el PR, el run de CI con «sin rojos nuevos» y 0 «por limpiar». *Hecho:* todo lo anterior escrito.

**Trazabilidad prevista:**

| R | Test / evidencia |
|---|---|
| R1100, R1102, R1104, R1105 | cada archivo del alcance (JSON de vitest en la base vacía) + diff revisado |
| R1101, R1103 | los mismos archivos en la base con empresa ajena (T5) |
| R1106 | tabla de mutaciones de T6 |
| R1107, R1111 | `scripts/comparar-baseline-rojos.mjs` en `gate-completo` del PR |
| R1108 | motivos reescritos ↔ medición local (reviewer) |
| R1109 | usuarios del helper (si se tocó) en las dos bases y en CI |
| R1110, R1112 | `git diff --name-only` y `scripts/tamano-pr.mjs` de T8 |

## Archivos esperados

- `tests/baseline-rojos.json`
- `tests/integration/db/api-key-eliminar.test.ts`
- `tests/integration/db/asistente-uso-diario.int.test.ts`
- `tests/integration/db/cobertura-repository.test.ts`
- `tests/integration/db/geografia-cascada-reversible.test.ts`
- `tests/integration/db/geografia-registro-accion.test.ts`
- `tests/integration/db/geografia-renombrado.test.ts`
- `tests/integration/db/notificacion-evento-cierre-rechazado-migration.test.ts`
- `tests/integration/db/notificacion-evento-geocodificacion-caida-migration.test.ts`
- `tests/integration/db/notificacion-evento-reparto-manana-migration.test.ts`
- `tests/integration/db/notificacion-evento-traspaso-migration.test.ts`
- `tests/integration/db/reparto-manana-aviso-dedupe.test.ts`
- `tests/integration/db/usuario-contar-adminsatelites.test.ts`
- `tests/integration/db/vista-filtro.test.ts`
- `tests/integration/db/webhook-suscripcion-circuito-migracion.test.ts`
- `tests/integration/db/whatsapp-envio-idempotencia-programado.test.ts`
- `tests/integration/db/_fixtures/orden-minima.ts` (solo si hace falta una función nueva; choque con SLT-178…SLT-182, SLT-184)

Estado fuera del cómputo: `progress/impl_SLT-183.md`, `progress/features/SLT-183.md`.

## Preguntas abiertas

Ninguna que dependa del humano.
