# Review SLT-75 «Un distrito no puede quedar en dos zonas» (HOTFIX)

Revisado: rama `hotfix/SLT-75-distrito-zona-unica`, HEAD `3042b275`, que ya incluye el merge de
`origin/prod` con SLT-73. Diff revisado: `origin/prod...HEAD`. Base local: `servi_slt75b`, con las 3
migraciones de SLT-73 aplicadas por `migrate deploy` antes de correr nada; `migrate status` dice
«up to date». Antes de cada corrida se hizo `prisma generate` desde este worktree.

## Checklist

- [x] **Trazabilidad R1-R22 → test.** El mapa está en `progress/impl_SLT-75.md` y en
  `impl_SLT-75-T8.md`. Cada R tiene un test que no está vacío. Las mutaciones que repetí abajo
  confirman R1, R2, R3, R4, R5, R6, R7, R8, R9 y R10.
- [~] **Tasks.** Quedan 5 sin marcar: T0, T11 y tres de T10 (gate, nota del PR, nota a SLT-43).
  Todas son del leader o del deploy (ver m3).
- [x] **`design.md > Lo que ya existe`.** Existe y tiene contenido (specs/24 R20, el colapso, el
  patrón `sin_zona_central` y la traducción de P2002). El diff no vuelve a crear nada de esa lista.
- [x] **Servidor.**
  - `leerDistritosEnOtraZona` corre con la `tx`. En `create` va antes de la primera escritura
    (`ZonaRepository.ts:277-282`) y en `update` después de `not_found` y `sin_zona_central`, que
    son lecturas, y antes de escribir nada (`:440-445`).
  - Excluye la propia zona con `zonaId: { not: id }` (R4).
  - La empresa la acotan la extensión y la RLS (R5, probado con `comoApp` / `servi_app`).
  - El P2002 del índice se traduce a `distrito_en_otra_zona` con `conflictos: null`, y de ahí a
    `validation_error` (R8), no a INTERNAL.
- [x] **Árbol, selector y formulario (R14-R22).**
  - `estaBloqueado` mira `d.zonas`.
  - La cascada y el triestado solo cuentan los seleccionables, y un grupo sin seleccionables queda
    `disabled`.
  - `abrirCrear` y `abrirEditar` leen el árbol al abrir; si la lectura falla, no abren y sale un
    toast.
  - Se usa `primeroYCuantosMas` y el texto de `conflict` ya no habla de distritos.
- [x] **T9.** Revisé el diff de `zona-reconciliacion-ordenes`:
  - los 3 casos «377» siguen midiendo el corte del estante (`retenidas === 1`, la hermana en
    tránsito o central se mueve, y `zonaId` no cambia en la bodega que tiene el paquete);
  - `:383` pasa a medir el rechazo;
  - `:590` sigue cubriendo el `lote_id` único con 2 filas.

  Sobre la unión antes ∪ después, ver m2.
- [x] **Typecheck en HEAD:** `TC_EXIT=0`.
- [x] **Lint de los 33 .ts/.tsx del diff:** 0 errores.
- [x] **Tests relacionados en HEAD:** 20 archivos, 343/343 en verde. Incluye `zona-distrito-unica`,
  `zona-reconciliacion-ordenes`, los unit de repositorio y servicio y los 8 de componentes.
- [ ] **Test de migración en HEAD:** `zona-distrito-unica-migration.test.ts` sale **ROJO** (B1).
- [x] **Guardias:** 1 archivo rojo, `dependencias-declaradas-presentes.guardia.test.ts`. Está en
  `tests/baseline-rojos.json:51` y el diff no toca `init.sh` ni `scripts/`: no es un hallazgo.
- [x] **Migraciones, forma:**
  - el `GROUP BY` es por `(organizacion_id, distrito_id)`;
  - el respaldo vive en el esquema `respaldo`, y en la base `servi_app` no tiene ni `USAGE` ni
    `CREATE` sobre él (comprobado con `has_schema_privilege`);
  - no se toca `orden`;
  - con R13 sin duplicados no falla;
  - `CREATE SCHEMA IF NOT EXISTS` es idempotente con `respaldo.slt73_asientos`: la subida convive
    con él;
  - las dos carpetas traen `down.sql`.
- [ ] **El `down.sql` convive con SLT-73: NO** (B1).
- [ ] **Datos: sin nombres reales de prod: NO** (B2).
- [x] **Reglas del perfil.** No hay tabla sin `organizacion_id`, no hay literal de país en el código
  nuevo (los mensajes sacan los nombres de la base) y no hay dependencias nuevas. Los comentarios
  explican el porqué.

## Mutaciones repetidas por el reviewer

Harness: `<scratchpad>/rvmut/run.sh`. Cada una se comprobó así: grep del texto mutado = 1, vitest
imprime la línea `Tests`, `git checkout --`, grep = 0 y diff vacío. Para las de migración, la tabla
`respaldo.slt73_asientos` se apartó un momento a otro esquema de la base LOCAL, porque si no el
archivo está rojo por B1. Después se devolvió a `respaldo`.

| Id | Mutación | Resultado |
|---|---|---|
| M1 | WHERE del conflicto: `distritoId: { in: [] }` | 6 fallan (R1, R2, R3, R5 en PG; R4 y R6 en unit) |
| M2 | índice solo en `("distrito_id")` | 2 fallan (R7: forma, y la de otra empresa se acepta) |
| M3 | migración de datos agrupada solo por `distrito_id` | 2 fallan (R9, R10) |
| M4 | detector R8 con otro nombre de índice | 4 fallan (R8 en unit y en PG, también la carrera) |

Sin mutar, con slt73 apartado: el test de migración da 14/14.

## Hallazgos

### B1 — BLOQUEANTE. El `down.sql` de datos falla en cualquier base que tenga SLT-73, prod incluida, y el test de migración está rojo en HEAD

- **Dónde:** `db/migrations/20261101090000_zona_distrito_duplicados_sin_zona/down.sql:22`,
  `DROP SCHEMA IF EXISTS respaldo;`.
- **Qué pasa:** el esquema `respaldo` ya contiene `respaldo.slt73_asientos`, que está en prod. Sin
  CASCADE, el DROP falla con `2BP01` («no se puede eliminar esquema respaldo porque otros objetos
  dependen de él»).
- **Cómo lo comprobé:**
  - Corrí los dos `down.sql` en una transacción revertida sobre `servi_slt75b`. Pasan `DROP INDEX`,
    `INSERT` y `DROP TABLE`, y falla `DROP SCHEMA`.
  - `pnpm exec vitest run tests/integration/db/zona-distrito-unica-migration.test.ts` en HEAD da
    `Test Files 1 failed`. Los 3 `describe` contra Postgres caen en el `beforeAll` con ese `2BP01`
    (R7, R9-R12 y R13).
  - Si se aparta la tabla de SLT-73, pasa 14/14. El rojo lo causa solo la convivencia.
  - El archivo no está en `tests/baseline-rojos.json`. El CI aplica todas las migraciones, así que
    `gate-completo` saldrá rojo.
- **Por qué importa:** R12 pide que el `down.sql` funcione y lo pide también el encargo. En prod,
  un rollback deja el índice quitado y las filas reinsertadas, y aborta en el último paso. Según
  cómo se ejecute el script, puede no confirmar nada o quedar a medias.
- **El comentario del archivo dice lo contrario:** «DROP SCHEMA sin CASCADE: no se lleva por
  delante el respaldo de otra ficha». La intención es correcta, pero la sentencia no se salta: falla.
- **Qué falta:**
  1. Borrar el esquema solo si queda vacío. Por ejemplo, un `DO` que haga `DROP SCHEMA respaldo`
     solo si `NOT EXISTS` ningún objeto en `pg_class` / `pg_namespace` con `nspname = 'respaldo'`.
     También vale no borrar el esquema.
  2. Adaptar el test de migración a esa convivencia:
     - que el rollback deje intacto un objeto ajeno en `respaldo`, como `slt73_asientos` u otro
       que siembre el test;
     - que la comprobación de «esquema respaldo» después de la bajada (`:97`, `existeEsquema`) no
       exija que el esquema desaparezca cuando hay otros objetos.
  3. Volver a correr el archivo en verde contra una base con SLT-73 aplicada.
- **Riesgo hermano, fuera del diff:** el `down.sql` de SLT-73
  (`20261031140200_slt73_retirar_asientos_satelite/down.sql:36`) hace
  `DROP SCHEMA IF EXISTS respaldo CASCADE`. Si se revierte SLT-73 con SLT-75 ya desplegada, se borra
  en silencio `respaldo.slt75_zona_distrito_duplicado`. No bloquea esta ficha; lo anoto en m1.

### B2 — BLOQUEANTE. Nombres reales de prod en un repo público

El nombre del distrito duplicado de prod y los de las zonas del cliente están en archivos
versionados del diff:

- `progress/features/SLT-75.md:20-21`: el distrito duplicado (nombre literal), su cantón y los dos
  nombres de zona del cliente.
- `progress/features/SLT-75.md:24` y `:49`: el distrito sin zona, con nombre y cantón.
- `progress/features/SLT-75.md:46`: otra vez el nombre literal del distrito duplicado, en la
  decisión de Carlos.
- `specs/SLT-75-distrito-zona-unica/tasks.md:22-23`: los dos nombres de zona del cliente.

Hay precedente: SLT-73 los quitó antes de mergear (`2452906b docs(SLT-73): quita nombre de zona de
prod`).

**Qué falta:** sustituirlos por descripciones neutras, por ejemplo «1 distrito en 2 zonas de la
misma empresa, 1 orden» o «zona X / zona Y».

Ojo: el historial del repo los conserva igualmente. Si importa, lo decide el humano.

### m1 — menor. Rollback de SLT-73 y respaldo de SLT-75

El `down.sql` de SLT-73 borra el esquema `respaldo` con CASCADE y se llevaría el respaldo de
SLT-75. Hay que avisar al dueño de SLT-73, o corregirlo junto con B1 para no quitar un objeto ajeno.

### m2 — menor. `zona-reconciliacion-ordenes` `:597`, la unión antes ∪ después

El comentario dice «Se sigue leyendo la UNION antes ∪ despues», pero el caso ya no la distingue de
«solo la lista final». El distrito quitado pasa a cero zonas y su orden se queda igual con o sin
unión.

Con el índice no hay estado alcanzable donde la unión cambie el resultado, así que no se pierde
protección real. Aun así, el comentario promete algo que el test no mide: conviene corregirlo.

### m3 — menor. `tasks.md`: casillas sin marcar

Quedan sin marcar T0, T10 (gate, nota del PR, nota a SLT-43) y T11. Son tareas del leader o del
deploy. Hay que marcarlas cuando se hagan.

Además, el texto de T0 (`tasks.md:12-14`) pide anotar «los nombres de distrito y de zona» de prod.
Choca con B2: debería pedir solo conteos.

### m4 — menor. `requirements.md:8`, `:23` y `:154`: cantones de prod

Nombran por su nombre los dos cantones de prod. Solos no identifican el distrito,
pero junto con B2 sí. Conviene neutralizarlos en la misma pasada.

### m5 — menor. El gate se corrió antes del merge con prod

El `gate_SLT-75_v3.log` (`INIT_EXIT=0`) es anterior al merge de prod. En HEAD lo he repetido así:

- typecheck en verde;
- tests relacionados en verde, salvo B1;
- guardias en verde, salvo el rojo que ya está en el baseline.

Cuando se corrija B1, hay que volver a correr `./init.sh` sobre HEAD.

## Veredicto

**RECHAZADO.**

- **B1:** el `down.sql` falla con SLT-73 presente, y por eso el test de migración está rojo en HEAD
  y el CI lo estará.
- **B2:** hay nombres reales de prod en `progress/features/SLT-75.md` y en `tasks.md`.

El resto (servidor, índice, migración de subida, árbol, selector, formulario y T9) está bien y las
mutaciones lo confirman.

## Vuelta 2 (acotada a ec895883..1b6f0572)

Commits revisados: `1db8da6f` (docs B2), `d92eca24` (B1, m1, m2) y `1b6f0572` (bitácora). Base
`servi_slt75b` con SLT-73 y SLT-75 aplicadas. Antes de cada corrida se hizo `prisma generate`
desde este worktree.

### Checklist

- [x] **B1, cerrado.** En `20261101090000…/down.sql`, el `DROP SCHEMA IF EXISTS respaldo` va dentro
  de un `DO $slt75$` sin CASCADE que atrapa solo `dependent_objects_still_exist` (2BP01). Con
  `respaldo.slt73_asientos` presente, el down quita su tabla y deja el esquema.
  - El test de migración siembra una tabla ajena en `respaldo` y comprueba que sobrevive con su
    fila.
  - Otro caso vacía `respaldo` dentro de una transacción revertida y comprueba que entonces el
    esquema sí desaparece.
  - `sentenciasSql` corta por `;` respetando los cuerpos `$tag$`. Revisado: no confunde `$1` con
    una etiqueta.
- [x] **m1, cerrado.** En `20261031140200_slt73…/down.sql`, `DROP SCHEMA … CASCADE` pasa a
  `DROP TABLE IF EXISTS respaldo.slt73_asientos` y un sub-bloque que borra el esquema solo si
  queda vacío.
  - El nuevo `respaldo-convivencia-slt73-slt75.test.ts` mide los dos sentidos y los dos downs
    juntos, con precondición explícita de que existen los dos respaldos.
  - R19 de `slt73-migracion-retira-asientos` ahora mide la tabla y no el esquema. El ajuste es
    correcto: el esquema ya es compartido.
- [x] **Tocar el `down.sql` de SLT-73, ya aplicado en prod, no causa drift.**
  - El diff contra `origin/prod` en esa carpeta solo toca `down.sql`, y Prisma solo calcula el
    checksum de `migration.sql`.
  - `prisma migrate status` dice «Database schema is up to date!».
  - `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --exit-code` da
    `DIFF_EXIT=0` («No difference detected.»).
- [x] **B2, cerrado.** En las líneas añadidas por todo el diff `origin/prod...HEAD` no queda ningún
  nombre de distrito ni de zona de prod (grep del distrito, del distrito sin zona, de los
  cantones y de las zonas).
  - Lo único que aparece es `Cartago/Cartago` en `zona-distrito-unica.test.ts:95-98`. Es el
    catálogo público que siembra la migración de geografía y se usa para colgar distritos
    sintéticos: no es un dato de prod.
  - `progress/features/SLT-75.md`, `tasks.md` y `requirements.md` quedan limpios.
- [x] **m2, cerrado.** El comentario de `zona-reconciliacion-ordenes.test.ts:597` dice ahora lo que
  mide.
- [x] **Tests afectados en HEAD:** `zona-distrito-unica-migration`,
  `respaldo-convivencia-slt73-slt75`, `slt73-migracion-retira-asientos`,
  `zona-reconciliacion-ordenes` y `zona-distrito-unica` dan 5 archivos y 63/63, sin skips.

### Mutaciones repetidas por el reviewer (vuelta 2)

Mismo harness que en la vuelta 1: grep = 1, vitest imprime la línea `Tests`, `git checkout --`,
grep = 0 y diff vacío.

| Id | Mutación | Rojo |
|---|---|---|
| V1 | down SLT-75: el `DO` vuelve a ser un `DROP SCHEMA IF EXISTS respaldo;` a secas | «B1 — el down de SLT-75…» y «los dos down…»; los `beforeAll` de migración caen con 2BP01 |
| V2 | down SLT-75: `DROP SCHEMA … CASCADE` dentro del `DO` | «B1 — el down de SLT-75…» y «R12/B1 — con un objeto ajeno…» |
| V3 | down SLT-73: `DROP SCHEMA … CASCADE` | «m1 — el down de SLT-73 deja intacto el respaldo de SLT-75» |
| V4 | down SLT-73: el handler atrapa otra excepción (`division_by_zero`) | «m1…» y R19, R16/D15 y R20 de `slt73-migracion-retira-asientos` |

### Gate v4

`gate_SLT-75_v4.log` termina en `INIT_EXIT=1`. El único rojo es
`tests/integration/db/geografia-por-pais.test.ts` (2 tests, «expected '23001' to be '23503'»).

- Ni ese archivo ni sus FK están en el diff.
- Según la bitácora, falla igual sobre `origin/prod` contra el Postgres local 18.2, y en el CI
  de #64 pasó.

No es un hallazgo de esta ficha. Antes del merge manda el check `gate-completo` del CI.

### Hallazgos de la vuelta 2

- **m6 — menor.** `geografia-por-pais` no está en `tests/baseline-rojos.json` y sale rojo en
  local con PG 18 (23001 en vez de 23503). Es ajeno a la ficha. Conviene una ficha aparte o una
  entrada en el baseline para que el gate local deje de salir rojo por esto.
- **m3, sigue abierto.** Las casillas del leader y del deploy en `tasks.md` (T0, T10 y T11) quedan
  sin marcar hasta que se hagan.

### Veredicto de la vuelta 2

**OK.** B1, B2, m1 y m2 están cerrados. No veo regresiones en el rango revisado.

## Vuelta 3 (acotada a 8e9e7bfd..834471e8)

Commits revisados:
- `4ded2b02`: enmienda de R9 y R9b en `requirements.md`, por la decisión de Carlos del
  2026-11-01.
- `434e3e85`: SQL y tests.
- `834471e8`: bitácora.

Base `servi_slt75b`. `migrate status`: «up to date». Antes de cada corrida se hizo
`prisma generate` desde este worktree.

### Checklist

- [x] **SQL de `20261101090000…/migration.sql`.**
  - La ventana va por `(organizacion_id, distrito_id)`.
  - `n` cuenta las filas del grupo y `centrales` las de una zona central, con
    `count(*) FILTER … OVER w`.
  - Se respalda toda fila con `n > 1`, salvo la no central cuando `n = 2 AND centrales = 1`. Es
    exactamente R9: se conserva la no central, y solo con 2 zonas y 1 central. Cualquier otra
    combinación cae en R9b y salen todas sus filas.
  - El `DELETE` sigue borrando por `id` lo respaldado, así que respaldo y borrado coinciden (R10).
  - `zona.es_central` es `NOT NULL` (`schema.prisma:567`), así que el `NOT g.es_central` no se
    vuelve NULL.
  - El `JOIN zona` solo lee.
- [x] **No toca `orden` (R11).** El SQL ejecutable no la menciona. Siguen en verde el test
  estático «R11 — la migracion de datos no menciona `orden`» y el de `orden.zona_id` /
  `updated_at` del bloque principal.
- [x] **Bloque «R9/R9b con zona central».** Siembra 11 filas en dos empresas:
  - d1 en C+N1 → R9;
  - d2 en N1+N2 → R9b;
  - d3 en C+N1+N2 → R9b, aunque una sea central;
  - d4 solo en N3 → intacto;
  - en B, d1 en central+no central y d2 solo en una no central.

  Afirma:
  - lo que queda y lo que sale, y que el respaldo trae exactamente las 7 filas borradas;
  - que el índice se crea sin 23505;
  - que el down devuelve las 11.

  Tiene anti-vacuidad (11 filas sembradas). Los datos son sintéticos: no hay nombres de prod.
- [x] **Tests en HEAD:** `zona-distrito-unica-migration` y `respaldo-convivencia-slt73-slt75` dan
  2 archivos y 28/28.
- [x] **requirements.md.** La decisión del 2026-10-31 queda marcada como SUSTITUIDA y la nueva
  queda registrada con su fecha. R9 y R9b están en EARS.

### Mutaciones repetidas por el reviewer (vuelta 3)

Mismo harness que en las vueltas anteriores: grep = 1, vitest imprime la línea `Tests`,
`git checkout --`, grep = 0 y diff vacío.

| Id | Mutación | Rojo |
|---|---|---|
| W1 | invertir el lado conservado (`AND g.es_central`) | 3 fallan: R9 central+no central, R9/R9b en B y R10 |
| W2 | R9 también con 3 o más zonas (`g.n >= 2`) | 4 fallan: R9b tres zonas, R9/R9b en B, R10 y R7 (el índice no se crea) |

### Gate v5: los 3 rojos

`gate_SLT-75_v5.log` termina en `INIT_EXIT=1`. Ninguno de los tres archivos rojos está en el
diff ni en `tests/baseline-rojos.json`.

- **`geografia-por-pais`** (23001 en vez de 23503). Ya visto en la vuelta 2: ajeno, ver m6.
- **`salida-a-reparto-sql-real`.** Aislado sobre HEAD da 6/6 en verde. En el gate el error es
  «geografía de otro país: orden.provincia_id no es del país CR de la empresa»: depende de lo que
  otros archivos dejan en la base compartida. Ajeno; confirmado.
- **`indices-rutas-calientes`.** Aislado sobre HEAD sale ROJO de forma reproducible: el plan de
  `AnaliticaOperativaRollupRepository.agregarCubos` no usa `analytics_daily_organizacion_id_fecha_idx`.
  No es tanto «inestable» como dependiente de las estadísticas de la base local. Aun así es ajeno:
  - ese repositorio no lee `zona_distrito` (grep = 0);
  - el diff no toca `analytics_daily`;
  - el archivo no salió rojo en el gate v4, y entre v4 y v5 solo cambió el SQL de limpieza de
    `zona_distrito`.

  Ver m7.

### Hallazgos de la vuelta 3

- **m7 — menor.** `indices-rutas-calientes` sale rojo en local por el plan del optimizador
  (estadísticas de la base local) y no está en el baseline. Es ajeno a la ficha. Igual que m6, que
  lo vigile el CI (`gate-completo`) o que vaya a una ficha aparte.
- **m8 — menor, nota para el PR.** Con R9, los 17 distritos pasan a resolver la zona no central. Sus
  órdenes ya creadas conservan la `zona_id` que tenían (R11, decisión de Carlos). La primera vez
  que se guarde la zona no central, la reconciliación de la 366 podrá moverlas, salvo las retenidas
  en estante por la 377. Conviene decírselo a Carlos en el PR: sustituye la nota anterior de que
  «el distrito queda sin zona».
- m3, m6: siguen abiertos (son del leader o ajenos).

### Veredicto de la vuelta 3

**OK.** El SQL cumple R9, R9b, R10, R11 y R13. Las dos mutaciones pedidas salen en rojo, y los
rojos del gate v5 son ajenos al diff.
