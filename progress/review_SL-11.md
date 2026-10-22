# Review SL-11 «Fuera zonas y seeds de Ordenex»

- Rama `feature/SL-11-fuera-zonas-y-seeds-ordenex`, HEAD revisado `740d2e1`. Diff `dev...HEAD`: 55 rutas.
- Fecha: 2026-10-22. Revisor: reviewer (vuelta 1).
- Se revisó contra el spec (R1-R19), la bitácora y `CHECKPOINTS.md` + `docs/checkpoints-proyecto.md`.
  También contra las decisiones del humano de `docs/plan-saas.md` (puntos 4 a 6).
- El MCP del grafo no estaba entre mis herramientas: exploré con Grep/Read.

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | `TC_EXIT=0` |
| `pnpm run lint` | 0 errores, 235 avisos (los mismos que la línea base) |
| `vitest run` de `fuera-datos-ordenex`, `carga-masiva-ejemplos-geo`, `jobs-recurrentes-con-siembra`, `sinpe-sin-variables-de-entorno`, `prisma-client-sin-adaptador`, `test-citado-desaparecido` y `migrate-deploy-guardas` | 7 archivos, 94 tests en verde |
| `pnpm run test:guardias` | 2 archivos rojos: `dependencias-declaradas-presentes` y `reclasificacion-459-lista`. Los dos están en `tests/baseline-rojos.json`, así que no son hallazgo. 283 en verde |
| `git merge-tree dev HEAD` | Sin conflictos. La rama no tiene SL-12 (`94fde5f`) |
| Tests de integración contra Postgres | **No reproducidos.** `servi_logistic_sl11` no existe (el implementer la borró en T12) y el límite del leader solo autorizaba usarla si existía. Para R5, R7, R8, R11, R13, R14 y R17 me apoyo en la bitácora y en la lectura del código (m3) |

## Checklist

### Especificación
- [x] `requirements.md` en EARS, R1-R19.
- [x] `design.md` con 8 alternativas descartadas (A-H) y su porqué.
- [x] `tasks.md`: T0-T12 en `[x]`. T13 queda en `[ ]`: es del leader, tras integrar. No es hallazgo.
- [x] `design.md` abre con `## Lo que ya existe`, con búsqueda y medición. El diff no re-crea nada de
  esa lista. `orden-minima.ts` es nuevo y está justificado en D6 (ver m6).
- [ ] La búsqueda no encontró la excepción de `.env.example` que SL-10 dejó a nombre de SL-11 (B1).

### Trazabilidad
- [x] El mapa `R<n> → test` está en `progress/impl_SL-11.md` y coincide con la «Trazabilidad
  prevista» de `tasks.md`.
- [x] R1, R2, R3, R6 y R16: `fuera-datos-ordenex.guardia.test.ts`. Cada barrido afirma que no está
  vacío y cada detector tiene una contraprueba sintética. Las mutaciones en el árbol están
  documentadas. Verde en mi corrida.
- [x] R4: los cinco archivos de D7 ya no están en el árbol, y `test-citado-desaparecido` da verde.
- [x] R8 y R13: `zona-sinpe-migration.test.ts`. Comprueba el mensaje literal nuevo y que no nombra
  ningún script ni ninguna variable. Hace abortar la migración con tres bodegas sin SINPE y la aplica
  tras el `UPDATE`. La contraprueba sin el `DO` está en la bitácora.
- [x] R9: `jobs-recurrentes-con-siembra` comprueba que si la migración falla los pasos son solo
  `["migrar"]`, sin reintento, y la salida es 1. `fuera-datos-ordenex` impide que vuelvan
  `migrate resolve`, `sembrarSinpe` y `AUTO_RESOLUBLES`.
- [x] R10: `sinpe-sin-variables-de-entorno` con `PERMITIDOS` vacía. Su contraprueba de inyección se
  queda.
- [x] R11: en los seis `zona-*` solo cambia el montaje. Ninguna aserción cambia: lo comprobé en el
  diff, línea a línea.
- [x] R12: las dos entradas salen de `tests/baseline-rojos.json`.
- [x] R14: `geografia-dta-2026-migration` ya no aplica `20260713010000` y crea sus dos zonas fixture.
- [x] R15: `carga-masiva-ejemplos-geo` toma las ternas de las migraciones de geografía.
  - Tiene anti-vacuidad (494 ternas), un parser probado sobre una línea literal y una contraprueba
    con una terna inventada.
  - Ya no comprueba si hay zona.
- [~] R5, R7, R17, R18 y R19 se verifican con corridas, como prevé la trazabilidad aprobada.
  - R18: lo comprobé yo. Ninguna ruta de `specs/` fuera de la de SL-11, ninguna de `arnes.manifest`,
    y la geografía de CR sigue en sus tres migraciones.
  - R5, R7 y R17: no los pude reproducir (m3).

### Calidad de código
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: no aplica todavía, no hay push (regla del humano). Ver m2 sobre lo que
  saldrá cuando la suite corra sobre una base migrada.
- [x] Flujos críticos: SL-11 no toca código de login ni de ningún flujo de la lista. Sí deja la app
  sin ningún usuario hasta SL-32, por decisión del humano. Los E2E que asumen usuarios sembrados están
  en la pregunta abierta 1 del spec.
- [x] Sin dependencias nuevas; `exceljs` sigue en uso.

### Seguridad y configuración (punto 3 del leader)
- [x] Recorrí todas las líneas añadidas del diff buscando URLs de base, `DATABASE_URL=`/`DIRECT_URL=`,
  hashes bcrypt, contraseñas, tokens, llaves y dominios de email. No hay ninguna credencial ni ninguna
  URL de base.
  - Solo aparecen `@example.com` y los dos identificadores de Supabase de Ordenex, como lista de lo
    que no se debe usar, igual que en `docs/perfil-agentes.md`.
  - El diff **quita** el hash bcrypt y `admin@ordenex.test` de la migración `20260709120000`.
- [x] La bitácora reconoce que una `DATABASE_URL` local salió una vez en la salida de una herramienta,
  pero en ningún archivo versionado; lo confirmé.

### Datos y seguridad (perfil)
- [x] Sin tablas nuevas ni queries de negocio nuevas: `organizacion_id` y RLS no aplican.
- [x] Migraciones editadas en sitio y dos carpetas borradas. Va contra «no edita una migración ya
  aplicada», pero es una **excepción decidida por el humano** (2026-10-21; no hay ninguna base
  desplegada). El `down.sql` de `20260709120000` sigue existiendo.
- [x] Ningún recurso de Ordenex en el diff.
- [x] Los literales de Costa Rica (Cartago/Cartago, SINPE `80000000`) solo están en fixtures de
  tests, sobre la geografía que siembran las migraciones. No hay código de app nuevo.

### Decisiones del humano
- [x] La app nace vacía: no queda ningún seed de datos y `db:seed` (catálogos) se queda.
- [x] Superadmin ≠ `maestro`. SL-11 no crea ningún usuario: ni migración, ni script, ni comando. El
  README remite a SL-32.
- [x] Las zonas nacen vacías y solo queda la geografía.
- [ ] «Ordenex» desaparece de todo lo que se toca: cumplido en las migraciones editadas, que es lo que
  exige R6. Quedan menciones en líneas no tocadas de archivos tocados (m5).

## Los tres puntos del leader

**1. La mutación de D6 que sobrevive.** La orden del fixture **sobra**. No falta ningún test.
- Ningún requisito necesita una orden viva en `crearFksDeOrden`:
  - R11 pide que cada test cree «lo que usa», y los `zona-*` crean sus propias órdenes;
  - del fixture solo leen las FK.
- No falta un test porque no hay ningún comportamiento que probar: nadie consume esa fila.
- La predicción de la trampa del design era errónea. Su intención («los fixtures no dan verde sin
  datos») sí está cubierta por las mutaciones (a) y (b) de la bitácora:
  - (a) tienda inexistente: 32 rojos;
  - (b) cantón inexistente: 64 rojos.
- Dejarla tiene un coste: es estado oculto (una orden viva en `en_preparacion`) que puede contaminar
  cualquier conteo global de órdenes cuando SL-31 reutilice el fixture en los otros 68 tests. → m1.

**2. Los 42 rojos de integración.** Ninguno es un test de SL-11, pero la frase «ninguno es de SL-11»
solo vale dentro de la selección `related`.
- Crucé los 42 archivos (`_trabajo/related-fail-files.txt`) con el diff.
  - Ninguno es un `zona-*`, `zona-sinpe-migration`, `geografia-dta-2026`, la carga masiva ni una
    guardia.
  - 9 están en el diff. En los 9 solo cambió el texto del `throw` (T9), y lo comprobé línea a línea.
- Clasifiqué los mensajes de error del log. Todos son por usuarios, órdenes o zona central
  inexistentes, y ninguna migración los creaba tampoco antes de SL-11:
  - el usuario maestro ya lo borraba `20260720150000`;
  - ninguna migración inserta órdenes;
  - ninguna marca una zona como central.
- Ninguno de los 42 es un rojo causado por SL-11.
- **Pero** hay tests fuera de esa selección que leen `zona.findFirst()` de la base. Las 7 zonas que
  SL-11 retira les bastaban, así que tras el `migrate reset` de T13 pasan a rojo, o a un verde vacío,
  por SL-11. → m2.

**3. Credenciales y URLs.** Ningún archivo versionado del diff lleva credenciales ni URLs de base
(ver «Seguridad y configuración»).

## Hallazgos

- **B1 — BLOQUEANTE. `.env.example` conserva la excepción que SL-10 dejó a nombre de SL-11.**
  - **Qué dejó comprometido SL-10:**
    - `specs/SL-10-gate-verde-heredado/requirements.md:33`: «El que cita
      `scripts/seed-sinpe-inicial.ts` se va con SL-11»;
    - y `design.md:223`.
  - **Qué queda hoy:**
    - la cabecera de `.env.example:6` lista «el comentario que cita `scripts/seed-sinpe-inicial.ts`
      -> SL-11»;
    - `.env.example:40-44` sigue diciendo que ese script es la SEMILLA, y que es «el unico archivo del
      arbol al que se le permite nombrarlas».
  - **Por qué bloquea:**
    - tras SL-11 el script no existe;
    - la lista de permitidos está vacía por R10;
    - la excepción queda huérfana: la ficha que la retira se cierra sin retirarla, y ninguna otra la
      tiene.
  - La búsqueda de `## Lo que ya existe` (término `sinpe`) no la encontró.
  - **Qué falta:**
    - quitar de `.env.example` la línea 6 de la cabecera;
    - reescribir el párrafo de las líneas 40-44 sin nombrar el script ni la lista de permitidos;
    - el resto de comentarios de SINPE y Costa Rica se quedan (fase 3);
    - correr `env-example-sin-valores.guardia.test.ts` y `sinpe-sin-variables-de-entorno`.
  - Como el spec no lo recoge, el leader decide si lo añade como requisito (por ejemplo, a R1/R10) o
    como tarea de ajuste. En cualquier caso, lo hace el implementer.

- **m1 — menor. La orden de `crearFksDeOrden` sobra** (punto 1).
  - Recomendación: quitar el `tx.orden.create` del fixture, sin cambiar la forma `FksDeOrden`.
  - Corregir en D6 la trampa «quitar la orden debe poner en rojo `zona-central`» y dejar como
    contraprueba las mutaciones (a) y (b).
  - Si se mantiene, al menos documentar en el fixture que la orden no la consume nadie.

- **m2 — menor (para SL-31). Tests fuera de la selección `related` que dependían de las 7 zonas
  retiradas.**
  - Leen una zona cualquiera de la base sin crearla:
    - `tests/integration/repositories/conteo-productos.int.test.ts:259`: crea su usuario y su orden,
      pero toma la zona de la base;
    - `tests/integration/actions/analitica-financiera-action.test.ts:257`;
    - `tests/integration/db/wallet-origen-legible.test.ts:32`;
    - `tests/integration/db/caja-backfill.test.ts:70`, con `if (resultado === null) return;`, un verde
      sin datos que ya existía antes.
  - Hay más en el mismo grep: `chat-media-*`, `dinero-productos`, `historico-conversaciones`,
    `orden-nota`.
  - Caben en la decisión del humano («los demás tests que leen datos preexistentes → SL-31»).
  - Pero el inventario de SL-31 no puede limitarse a los 68 consumidores de `fksDeOrden`: también
    tienen que entrar los lectores de `zona.findFirst()`.
  - Lo anota el leader en SL-31.

- **m3 — menor. R5, R7 y R17 solo tienen evidencia de corrida, y no la pude reproducir.**
  - La trazabilidad aprobada lo prevé así y la bitácora trae salidas concretas:
    - conteos 0/0/0 y 7/84/494;
    - `DEPLOY_EXIT=0`, 229 migraciones aplicadas, `migrate status` limpio;
    - `GET /login` 200 y `usuario` vacía.
  - Pero ningún test automático impedirá que una migración futura vuelva a sembrar zonas o usuarios
    por otra vía. La guardia de R6 solo mira `INSERT INTO`, y no ve un `COPY` ni un `INSERT ...
    SELECT` dentro de un `DO`.
  - Sugerencia para SL-31, que migra la base en CI: un test que cuente `zona`, `zona_distrito` y
    `usuario` = 0, y 7/84/494, sobre la base recién migrada.

- **m4 — menor. `docs/limpieza-ordenex.md` no da por hechas las filas de SL-11.**
  - Las filas 31 («Geografía y zonas de CR de Ordenex») y 32 («Seeds con personas reales») siguen
    como pendientes.
  - La 32 todavía dice «Sustituir por un seed de desarrollo con datos inventados», que contradice la
    decisión del humano del 2026-10-21.
  - SL-12 marcó la suya (`b88be32`). Las listas de las líneas 683 y 706 siguen citando
    `scripts/seed-maestro.ts`.

- **m5 — menor (para SL-15). «Ordenex» en líneas no tocadas de archivos tocados.**
  - `tests/integration/db/_fixtures/caja-459.ts:319,344` y
    `tests/integration/db/premio-ranking-devengo-migration.test.ts:97-98`.
  - Hay además comentarios rancios que citan `scripts/seed-zonas.ts` en `lib/` y `app/`. La bitácora
    T9 los lista y el design los deja fuera a propósito.
  - R6 solo lo exige en las migraciones editadas, así que el spec se cumple. Se registra para SL-15.

- **m6 — menor. `crearUsuarioDePrueba` se solapa en parte con `_fixtures/personas-461.ts`.**
  - `personas-461.ts` está en «Lo que ya existe», y el design decidió un fixture nuevo y mínimo
    (devuelve nombre, apellido y rol del actor congelado).
  - Está justificado y no es una re-creación. Conviene que SL-31 elija uno de los dos para los 68
    tests restantes.

- **m7 — menor. La rama no tiene SL-12** (`dev` = `94fde5f`, merge-base `de68dfb`).
  - `merge-tree` no da conflictos, y SL-12 no toca nada de lo que retira SL-11.
  - El leader hace `merge dev` antes de integrar.

- **m8 — menor (para SL-31). Tres mensajes «tabla `orden` vacia: corre `pnpm run db:seed`»** en la
  selección `related` mandan a un script declarado que no crea órdenes.
  - R3 se cumple al pie de la letra, pero el mensaje engaña.

## Veredicto

**RECHAZADO** — 1 hallazgo bloqueante (B1) y 8 menores.

Para pasar a OK basta con B1. El implementer:
- retira la excepción `seed-sinpe-inicial` de `.env.example`, en la cabecera y en el párrafo de las
  líneas 40-44;
- corre las dos guardias de `.env.example` y de SINPE.

Los menores no bloquean. m1 y m4 conviene resolverlos en la misma vuelta; m2, m3, m5, m6 y m8 los
anota el leader en SL-31 y SL-15, y m7 lo resuelve él al integrar.

## Vuelta 2 (acotada a 76ba761..1f5044e)

Commits revisados:
- `56aeb5d`: merge de `dev`, que trae SL-12;
- `7ccc9bf`: spec R20/T14 y D6 corregido;
- `f7ad67e`: B1/R20;
- `739bcc9`: m1;
- `6127c2b`: m4;
- `8714b58` y `1f5044e`: bitácora.

El contenido propio de SL-11 en el rango sale de `git diff 56aeb5d 1f5044e`, que deja fuera lo que
trae SL-12: 7 archivos más la bitácora.

### Verificación ejecutada por el reviewer
- `vitest run` de `fuera-datos-ordenex`, `env-example-sin-valores`, `sinpe-sin-variables-de-entorno`,
  `test-citado-desaparecido` y `backfills-retirados` (SL-12, tras el merge): 5 archivos, 58 tests en
  verde.
- `pnpm run typecheck`: `TC_EXIT=0`.
- `_trabajo/gate-sl11-v2.log`: 286 archivos y 3845 tests en verde, `INIT_EXIT=0`. Solo quedan
  excluidos los dos archivos del baseline.
- Tests de integración: no los reproduje, porque no hay base `servi_logistic_sl11` (sigue en pie m3).
  Uso la corrida de T14: `zona-*` con 108 en verde, las mutaciones (a) con 32 rojos y (b) con 64, y
  los conteos 0/0/0.

### Contraste con la vuelta 1
- [x] **B1, resuelto.**
  - `.env.example` ya no tiene la línea de la cabecera «-> SL-11».
  - El párrafo de las líneas 38-41 ya no nombra el script, ni un archivo autorizado, ni la tarea T28.
  - Los comentarios de SINPE/CR (fase 3) y la excepción de SL-14 se quedan.
  - R20 entra en el spec y tiene su test en `fuera-datos-ordenex`.
    - No-vacuidad: el archivo existe y habla de SINPE.
    - Contraprueba sintética con las dos líneas viejas literales y un negativo: es real.
    - En la bitácora, las mutaciones en el árbol dan 1 rojo cada una.
  - `env-example-sin-valores` sigue en verde.
- [x] **m1, resuelto.**
  - `crearFksDeOrden` ya no crea ninguna orden y la forma `FksDeOrden` no cambia.
  - D6 y la trampa de la mutación están corregidas en el design y coinciden con lo medido.
  - Los 6 `zona-*` son los únicos consumidores (Grep), y siguen en verde según T14.
- [x] **m4, resuelto.**
  - Las filas 31 y 32 de `docs/limpieza-ordenex.md` pasan a «Hecho (SL-11)».
  - La 32 ya no propone un seed de desarrollo y cita la decisión del 2026-10-21 y SL-32.
- [x] **m7, resuelto.** El merge de `dev` queda sin conflictos, y SL-12 está en la rama.
- m2, m3, m5, m6 y m8: siguen anotados para SL-31/SL-15, como se decidió. Están fuera del rango.

### Lo que el implementer marcó por su cuenta: `seed-usuarios-qa.ts` «ya salió con SL-11»
- **Correcto.**
  - La lista de la línea 684 está en la sección 3 («Nombre «Ordenex» en scripts, docs…»), y su
    entrada es el archivo.
  - SL-11 borró `scripts/seed-usuarios-qa.ts` (R1, comprobado: no existe).
  - Dejarlo como pendiente mandaría a SL-15 a buscar un archivo que ya no está.
- Las marcas de `seed-maestro.ts` en las líneas 683 y 706 (sección 4, dominio) son igual de
  factuales.
- No cambia ninguna decisión ni el alcance de otra ficha. No es hallazgo.

### Regresiones
Ninguna.
- El diff propio no toca código de app, migraciones ni `package.json`.
- Sigue sin tocar `specs/` fuera de SL-11 ni ninguna ruta de `arnes.manifest`
  (`docs/limpieza-ordenex.md` y `.env.example` no están en él).
- No añade credenciales ni URLs: las líneas añadidas son comentarios y regex.

### Hallazgos nuevos
- **m9 — menor.** R20 se añadió al spec después de la aprobación, a raíz de B1.
  - Es aditivo y lo encargó el leader.
  - Conviene que el leader deje constancia de que el humano lo conoce, en
    `progress/features/SL-11.md` o en el PR.

### Veredicto de la vuelta 2

**OK**: 0 bloqueantes.
