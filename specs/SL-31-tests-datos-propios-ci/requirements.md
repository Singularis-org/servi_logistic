# SL-31 — Tests de integración con datos propios y base migrada en CI

> Zona: backend · Complejidad: high · depends_on: — · Rama: `feature/SL-31-tests-datos-propios-ci`
> · Assignee: Carlos Restrepo
>
> **Alcance.** La app nace vacía (SL-11, `docs/plan-saas.md` punto 5): una base recién migrada solo
> trae los catálogos del sistema y la geografía del país. Hay 245 archivos de `tests/integration/`
> en `tests/baseline-rojos.json` con motivo SL-31, porque leen «la primera orden», «el primer
> usuario» o «una zona cualquiera» de la base (deuda D8 de `progress/deudas.md`).
>
> Esta ficha:
> - crea **fábricas de datos compartidas** en `tests/fabricas/`, que crean usuario, tienda, zona y
>   orden dentro del cliente del test;
> - pasa a esas fábricas los tests de integración del baseline, empezando por los escenarios
>   compartidos (`454/_escenario.ts`, `419/_escenario-419.ts`, `_fixtures/caja-459.ts`, `_*-47x.ts`);
> - hace que **cada E2E** que declara una «PRECONDITION (seed)» cree su usuario y sus datos dentro
>   de la prueba;
> - migra la base de los shards de vitest en CI (`prisma migrate deploy` + `pnpm run db:seed`).
>
> Objetivo de cierre: `./init.sh --completo` verde sobre una base vacía con catálogos, y
> `tests/baseline-rojos.json` sin ninguna entrada con motivo SL-31.
>
> **Lo que NO entra.**
> - **Los tests que leen archivos de `db/migrations/`** → SL-28 (Christian, en paralelo), que
>   consolida las migraciones y los adapta. SL-31 no los edita (lista medida en
>   `design.md > Exclusión SL-28`).
> - `tests/integration/db/_postgres-real.ts`: SL-31 no lo edita (choque con SL-28, `design.md`).
> - Código de producción (`app/`, `lib/`, `components/`, `hooks/`, `db/`, `scripts/`): nada.
> - Seeds de datos en la app: ninguno. Los datos viven solo en los tests.
> - `organizacion_id` en las fábricas: llega con SL-17 (fase 2); las fábricas son el único sitio
>   que tendrá que cambiar.
> - La geografía por país: sigue siendo la de Costa Rica que siembran las migraciones (SL-20).
> - El usuario superadmin de arranque → SL-32.

## Requisitos (EARS)

### Fábricas de datos compartidas

- **R1.** El repositorio DEBE ofrecer en `tests/fabricas/` funciones que crean, con el cliente que
  reciben (la transacción del test o un cliente que confirma):
  - un usuario de cualquier rol del catálogo;
  - una tienda (usuario `adminTienda`);
  - una zona y la zona central;
  - las FK obligatorias de una orden;
  - una orden.

  Cada función DEBE devolver los ids de lo que creó.
- **R2.** Las fábricas NO DEBEN leer de la base ninguna fila de `orden`, `usuario` ni `zona` que no
  hayan creado ellas o el propio test. Lo único que DEBEN leer son los catálogos del sistema (roles,
  estados de orden, tipos de identificación, vehículos) y la geografía que siembran las
  migraciones.
- **R3.** SI falta en la base un catálogo o la geografía que una fábrica necesita, ENTONCES la
  fábrica DEBE lanzar un error que nombre lo que falta y pida aplicar `prisma migrate deploy` y
  `pnpm run db:seed`. NO DEBE devolver `null`, un objeto vacío ni un id inexistente.
- **R4.** CUANDO dos archivos de test que usan las fábricas corren en paralelo contra la misma
  base, ninguno DEBE fallar por un valor único repetido (email, cédula, nombre de zona, número de
  guía).
- **R5.** Todo email que creen las fábricas DEBE terminar en `@example.com`. Ningún literal de
  `tests/fabricas/` ni de los tests que esta ficha toca DEBE contener el nombre de la app de origen
  ni datos de personas reales.
- **R6.** CUANDO una fábrica crea la zona central, DEBE hacerlo después de tomar el lock de
  escrituras reales del test (`serializarEscriturasReales`), de modo que dos suites que crean su
  zona central no fallen por el índice único de `zona.es_central` ni se bloqueen entre sí.

### Tests de integración con datos propios

- **R7.** Cada archivo del alcance de esta ficha DEBE crear con las fábricas, dentro de su
  transacción revertida, todo dato de negocio que use. El alcance son los archivos de
  `tests/baseline-rojos.json` con motivo SL-31, salvo los excluidos por R14.
- **R8.** CUANDO se corre sobre una base recién migrada (`prisma migrate deploy` +
  `pnpm run db:seed`), sin ningún usuario, zona ni orden, cada archivo del alcance DEBE pasar.
- **R9.** Al pasar un test a las fábricas:
  - NO DEBE quitarse ni debilitarse ninguna aserción de comportamiento;
  - NO DEBE cambiarse un valor esperado literal por la función que lo genera;
  - el número de casos (`it`/`test`) del archivo NO DEBE bajar.
- **R10.** SI la fábrica de un test no crea el dato que el test usa, ENTONCES ese test DEBE
  terminar en rojo. NO DEBE pasar ni saltarse por:
  - un retorno temprano (`if (!x) return`);
  - un `skip` condicionado a que haya datos.
- **R11.** MIENTRAS el proceso no tenga `DATABASE_URL`, los tests de integración DEBEN seguir
  saltándose de forma visible (`describe.skip`), como hoy.
- **R12.** Ningún archivo de `tests/` DEBE hacer nada de esto, salvo los excluidos por R14:
  - llamar a `fksDeOrden`;
  - leer una fila de `orden`, `usuario` o `zona` sin filtrar por algo que creó el propio test:
    `findFirst()` sin `where`, `findFirst({ select … })` sin `where`, `findFirst` de la zona
    central, o `SELECT … FROM` esas tablas con `LIMIT 1` sin `WHERE`.

  Una guardia lo comprueba, con una lista de permitidos que solo contiene los excluidos de R14 y
  con una contraprueba que da rojo.
- **R13.** Los tests de integración que hoy pasan en verde sin comprobar nada porque la base no
  trae datos (retorno temprano ante un dato ausente, medidos en T1) DEBEN quedar cubiertos por
  R7–R10 igual que los del baseline. SI T1 mide más de 30, ENTONCES los que pasen de ese número
  salen a una ficha propia, creada en el board con la lista medida.

### Exclusión de SL-28

- **R14.** El cambio NO DEBE modificar:
  - ningún test que lea archivos de `db/migrations/` (la lista medida está en
    `design.md > Exclusión SL-28`);
  - `tests/integration/db/_postgres-real.ts`.
- **R15.** Para los tests excluidos por R14:
  - SI uno vuelve a verde por los cambios en un helper compartido, ENTONCES su entrada DEBE
    salir de `tests/baseline-rojos.json` en el mismo PR;
  - SI sigue en rojo al cerrar, ENTONCES su entrada DEBE quedarse con un `motivo` que nombre
    SL-28 y no SL-31, y la causa doble (datos + migraciones).

### CI

- **R16.** CUANDO corre un shard de vitest en CI, el job DEBE aplicar `prisma migrate deploy` y
  después `pnpm run db:seed` sobre su Postgres de servicio, antes del gate. SI cualquiera de los dos
  falla, ENTONCES el shard DEBE terminar en rojo sin correr la suite.
- **R17.** CUANDO corre el job `e2e`, DEBE aplicar `prisma migrate deploy` y `pnpm run db:seed`
  antes de Playwright. NO DEBE sembrar usuarios, zonas ni órdenes.
- **R18.** `.github/workflows/gate.yml`:
  - NO DEBE declarar credenciales de seed que ningún archivo lee (`SEED_ADMIN_*`, `SEED_MAESTRO_*`);
  - NO DEBE citar archivos que no existen (hoy cita `tests/helpers/test-database.ts`);
  - NO DEBE decir que los tests crean una base efímera desde una plantilla, si no la crean.

### E2E con datos propios

- **R19.** Cada spec de `e2e/` que hoy declara una «PRECONDITION (seed)» (lista en
  `design.md > E2E`) DEBE crear antes de sus casos los usuarios —con credencial y dispositivo de
  confianza para entrar sin OTP— y los datos que usa. DEBE borrarlos al terminar, pase o falle.
  NO DEBE depender de ningún dato preexistente en la base.
- **R20.** Los specs de R19 NO DEBEN contener:
  - credenciales literales de usuarios sembrados a mano (`correct-password`,
    `maestro@example.com`…);
  - valores esperados que dependan de una semilla externa (saldo, guía, factor de teléfono, ni
    las variables `E2E_*` que los sustituyen).

  Cada valor esperado DEBE corresponder a datos que el propio spec creó.
- **R21.** SI la base del E2E no es alcanzable, o le falta un catálogo, ENTONCES el spec DEBE
  fallar con un mensaje que lo diga. NO DEBE saltarse.
- **R22.** SI `DATABASE_URL` apunta a un host distinto de `localhost` o `127.0.0.1`, ENTONCES la
  fábrica de datos del E2E DEBE abortar antes de escribir una sola fila.
- **R23.** CUANDO se corre `pnpm run test:e2e` contra una base recién migrada con catálogos y sin
  usuarios, cada spec de R19 DEBE pasar. SI un caso falla por una causa ajena a los datos (la UI
  cambió desde que se escribió), ENTONCES DEBE quedar como `test.fixme` con un comentario que cite
  la ficha nueva creada en el board con lo medido. NO DEBE borrarse ni saltarse sin esa ficha.

### Límites y cierre

- **R24.** El cambio NO DEBE modificar:
  - código de producción: `app/`, `lib/`, `components/`, `hooks/`, `db/`, `scripts/`;
  - ningún archivo listado en `arnes.manifest`;
  - ningún archivo de `specs/` salvo `specs/SL-31-tests-datos-propios-ci/`.

  NO DEBE añadir dependencias a `package.json`.
- **R25.** CUANDO se corre `./init.sh --completo` sobre una base recién migrada con `db:seed` y sin
  usuarios, el gate DEBE terminar con código 0, y `tests/baseline-rojos.json` NO DEBE contener
  ninguna entrada cuyo `motivo` nombre SL-31.
- **R26.** `docs/verification.md > Base de datos de test` DEBE decir que:
  - los tests crean sus datos con `tests/fabricas/`;
  - la base de CI se migra y siembra catálogos antes de la suite;
  - la guardia de R12 vigila que nadie vuelva a leer «la primera fila».

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Cómo consiguen datos los tests? | Cada test, y cada E2E, que necesita datos o un usuario los crea dentro de la prueba. Ninguno depende de una semilla (humano, SL-11). → R1–R4, R7, R8, R19 |
| 2026-10-21 | ¿Hay seeds de datos en la app? | No. La app nace vacía; solo catálogos del sistema y geografía del país (humano, `docs/plan-saas.md` punto 5). Los datos viven solo en los tests. → R2, R17, R24 |
| 2026-10-21 | ¿Los catálogos de `db:seed` son «seed de datos»? | No: son parte del producto (humano, SL-11). → R3, R16, R17 |
| 2026-10-22 | ¿Qué hace CI con la base de los shards? | `prisma migrate deploy` + `db:seed` de catálogos antes de correr (ficha SL-31). → R16, R17 |
| 2026-10-22 | ¿Entran los tests que leen migraciones? | No: los adapta SL-28 (Christian), que consolida las migraciones en paralelo (humano, vía leader). Se declara como choque de archivos. → R14, R15 |
| 2026-10-22 | ¿Entran los E2E con precondición sembrada? | Sí: cada E2E crea su usuario y sus datos dentro de la prueba (ficha SL-31; cierra la pregunta abierta 1 de SL-11). → R19–R23 |
| 2026-10-22 | ¿Qué nombres y datos llevan las fábricas? | Inventados, emails `@example.com`, nada de la app de origen (humano, vía leader; SL-11 R16). → R5, R22 |
| 2026-10-22 | ¿Puede un test pasar sin su dato? | No. Cada test falla si su dato no existe; nada de `if (!x) return` (humano, vía leader; `docs/verification.md > Qué NO cuenta`). → R3, R10, R12, R21 |
| 2026-10-22 | ¿Cuándo se cierra? | Cuando el gate completo sale verde con base vacía + catálogos y el baseline no tiene entradas de SL-31 (ficha SL-31, deuda D8). → R8, R25 |
| 2026-10-22 | ¿Fábricas compartidas o arreglo por archivo? | Fábricas compartidas en `tests/fabricas/`, que crean usuario, orden y zona dentro de la transacción del test (humano, vía leader). → R1, R6, R7 |
| 2026-10-22 | P1 — ¿Qué pasa con los excluidos de SL-28 que sigan rojos al cerrar? | Su `motivo` pasa a SL-28, con la causa doble (datos + migraciones). El baseline queda con la entrada de SL-29 y las de SL-28; SL-28 las retira usando las fábricas (Carlos, aprobación del spec). → R15, R25 |
| 2026-10-22 | P2 — ¿Entran los tests que pasan en verde sin datos y no están en el baseline (p. ej. `caja-backfill.test.ts`)? | Sí. T1 los mide con una regla fija: retorno temprano ante un dato de negocio ausente. Si salen más de 30, el exceso va a una ficha propia (Carlos, aprobación del spec). → R13 |
| 2026-10-22 | P3 — ¿Qué se hace con un E2E que falla por algo que no son los datos? | `test.fixme` con un comentario que cite una ficha nueva, creada en el board con lo medido. SL-31 no toca código de producción (Carlos, aprobación del spec). → R23, R24 |
| 2026-10-22 | P4 — ¿Cómo se verifica CI de verdad? | Con el CI del propio PR. El repo `singularis-co/servi_logistic` es público a propósito (Actions gratis) y ya está en origin (`dev`/`prod` = `86d70bf`); `gate.yml` corre en cada PR a `dev` y a `prod` (Carlos; corrige un dato del spec, que lo daba por no empujable). → R16, R17, R25 |
| 2026-10-22 | P4b — ¿En qué orden va la tanda de CI? | **Primero**, en su propio PR, independiente de las fábricas, para que el PR de SL-28 de Christian no salga rojo por una base sin migrar (Carlos). → R16–R18 |
| 2026-10-22 | P5 — ¿Quién es dueño de qué frente a SL-28? | SL-31: el paso de migración de `gate.yml` y `tests/fabricas/`. SL-28: los 23 tests excluidos y `tests/integration/db/_postgres-real.ts`. Si los dos tocan `gate.yml`, rebasa quien mergee segundo (Carlos, aprobación del spec). → R14, R16 |
| 2026-10-22 | P6 — ¿Se acepta que el gate rápido se alargue al tocar `tests/fabricas/`? | Sí, durante SL-31: es el coste de que la evidencia corra. El tiempo se mide en T1 y en cada tanda, y se anota en `progress/impl_SL-31.md` (Carlos, aprobación del spec). → R8 |

## Preguntas abiertas

Ninguna: las seis quedaron decididas el 2026-10-22 (tabla de arriba, P1–P6).
