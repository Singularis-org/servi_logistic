# Review SLT-187 «Tests de migración desfasados tras SL-17»

Ruta ligera, ampliada a la pieza compartida (`tests/integration/db/_postgres-real.ts`). PR #220.
Revisado: `origin/dev...36d7ef4f`, en el worktree de la rama. MCP del grafo no usado (Grep/Read bastaron).

## Checklist

- [x] **Ruta.** Solo tests y docs de progreso: no toca dinero, permisos, auth, integraciones ni webhooks
  de producción. La ligera vale.
- [x] **Nada de producción ni migraciones.** `git diff --name-only origin/dev...HEAD -- lib app components
  hooks db scripts prisma` vacío.
- [x] **Tasks.** T1-T8 marcadas `[x]` en `requirements.md > ## Tasks`.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 16/40 archivos, 0/1000 producción, 698/3000 tests.
- [x] **Typecheck** `pnpm run typecheck`: exit 0.
- [x] **Lint** en los 14 `.ts` del diff: 0 errores, 1 warning previo (`wallet-461…:30 'cat'`, no tocado).
- [x] **Los 14 archivos** en `servi_slt187_desechable` (vía `con-desechable.cjs`): `Tests 1 failed | 266 passed
  (267)`. El fallido es `wallet-458-migration` (c), que se queda en el baseline: `escenario 459: el paso
  «repartoMensajero» respondio {"status":"sin_saldo"}` (`_fixtures/caja-459.ts:773`). Coincide con la bitácora.
- [x] **Guardias** (`test:guardias`, en la desechable): 5 rojos en 2 archivos, ninguno del diff.
  `dependencias-declaradas-presentes` está en `tests/baseline-rojos.json`. `otp-debug-solo-en-pruebas`
  dio timeout de 20 s con la carga de toda la corrida y pasa 11/11 solo.
- [x] **GRANT de retiro-estados revertido de verdad.** `conEscenario` → `enTransaccionRevertida`, que
  siempre revierte, y en Postgres el GRANT es transaccional. Medido tras la corrida:
  `has_table_privilege('servi_app','order_status','DELETE'|'INSERT')` = `false`/`false`. No quedan
  esquemas temporales sueltos.
- [x] **`_postgres-real.ts` retrocompatible.** Si `organizacionId === undefined`, la expresión
  `...empresa` esparce `{}` y la config de `PrismaPg` queda idéntica. Las 10 llamadas existentes
  (aislamiento-mecanismo, empresas-plataforma, push-cupo-carrera, tarifa-zona-is-default-migration,
  usuario-preferencia) pasan un solo argumento. Solo ranking-snapshot usa el nuevo parámetro.
- [x] **Trazabilidad R1160-R1169** (detalle abajo).
- [x] **CHECKPOINTS / checkpoints-proyecto / perfil reviewer.** Sin tablas, queries de negocio,
  migraciones, dependencias ni literales de país en código nuevo. El diff no toca `db/` (solo
  `tests/integration/db/`), pantallas ni dinero de producción, así que no exige E2E. Los comentarios
  explican el porqué.

## Trazabilidad

| R | test | ¿lo verifica? |
|---|---|---|
| R1160 | los 14 archivos (A: 266/267; el rojo es wallet-458 (c), por otra causa y documentado) | sí, medido |
| R1161 | literales de policy, `indexdef`, columnas y FK en historial-accion, postulacion-recurso, vista-filtro, push-canal, wallet-461 y orden-evento | sí: ninguno sale de `pg_policies` ni del `.sql` |
| R1162 | historial-accion «R8: su UNICA policy…» (`toEqual` de una sola fila: nombre, `ALL`, `{servi_app}`, qual y with_check literales); postulacion-recurso «R22…» | sí |
| R1163 | vista-filtro «⭑ ningun `down.sql` ANTERIOR…»: filtro `< CARPETA`, autocomprobación `> 150` y control de la posterior conocida | sí (M5/M5c) |
| R1164 | wallet-458 (a): `slice(25,27)/(16,18)/(63,65)`, origen y entidad sin los seis, SEED ordenado | sí; los `>=` de tamaño son la sustitución explícita de R1164 |
| R1165 | wallet-461 `indexdef` literal + caso nuevo «MISMA clave en OTRA empresa»; orden-evento `organizacion_id` en la lista y en el bucle NOT NULL | sí |
| R1166 | retiro-estados 13/13 (A, y B según la bitácora; M16 rojo sin el rol) | sí, con el matiz del menor 2 |
| R1167 | tabla de mutaciones M1-M24; casos no bajan (wallet-461 pasa de 5 a 6) | sí |
| R1168 | T1 de la bitácora (sin parada) | sí |
| R1169 | baseline −13; queda wallet-458 con motivo medido | sí, con el menor 1 |

## Las tres decisiones que pidió validar el leader

1. **retiro-estados como `servi_app` + GRANT.** El aislamiento funciona y el GRANT no se filtra (medido
   arriba). (a), (b), (d), (e), (f) y (g) miden lo mismo: las filas del escenario son de la empresa de la
   tx y la RLS se las deja ver. La excepción está en el menor 2.
2. **busqueda-usa-indice sobre `pg_temp.orden`.** No es tautológico. El SQL es el que captura la app;
   solo cambia `"public"."orden"` por `pg_temp."orden"`, y si no aparece, el test lanza error. El índice
   sale de `pg_get_indexdef` del real, con el mismo nombre, opclass y expresión. Con
   `enable_seqscan = off` el plan solo cae en el trigram si el predicado de la app casa con la expresión
   del índice; si no, queda `Seq Scan on orden` y el caso se pone rojo. El caso del `BitmapOr`, además,
   exige dos scans sobre ese índice. La pregunta («¿PUEDE servir?») ya era la del test con
   `forzarIndice`, así que no cambia. Lo que se pierde es la elección por coste sobre la tabla real, que
   ya estaba fuera del alcance del test. El control de filas exactas (`FILAS`) evita una copia vacía.
3. **ranking-snapshot.**
   - **Sentencias de SL-17 sin triggers ni FK a `organizacion`.** Solo se aplican en el bloque C, que
     ejercita el repo. Los bloques que fijan la forma de la 196 (columnas, down R37) siguen sobre la 196
     sola. Ninguna aserción mira esa FK ni los triggers. El filtro `REFERENCES "organizacion"` solo quita
     las dos `ADD CONSTRAINT` (`migration.sql:663,672`): la `ADD COLUMN` va aparte (`:662,671`). El
     recuento literal `=== 10` cortaría si cambiara.
   - **El reintento del DROP no tapa nada.** Está en `afterAll` (limpieza), solo ante `40P01`, con tope de
     3 intentos, y si no, relanza. La víctima de un deadlock ya fue revertida por Postgres.

## Hallazgos

- **menor 1. El motivo de `wallet-458-migration` en el baseline es inexacto.** Dice «La retira SLT-195»,
  pero el PR #219 de SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)» ni la quita
  de `tests/baseline-rojos.json` ni la nombra en su spec ni en su bitácora (comprobado sobre
  `origin/feature/SLT-195-cierre-satelite-dinero-tests`).
  - La causa medida sí es la de SLT-195: la misma `caja-459.ts:773 repartoMensajero sin_saldo` (D64), que
    #219 arregla en el fixture. Al mergear #219 lo probable es que wallet-458 salga en verde y su entrada
    quede huérfana, con el aviso «ya pasa».
  - Arreglo, una de dos:
    - SLT-195 incorpora `wallet-458-migration` a su alcance y retira la entrada en #219;
    - o el motivo nombra la ficha que de verdad la va a retirar.
- **menor 2. retiro-estados (c) ya no puede detectar una regresión del paso 5 de M3** (el `DELETE` del
  catálogo).
  - Como `servi_app`, `order_status` solo tiene la policy `order_status_lectura` (SELECT), así que el
    `DELETE` nunca ve filas.
  - Antes, como dueño, quitar las guardas `NOT EXISTS` daba error por la FK RESTRICT y el caso se ponía
    rojo. Ahora quedaría verde.
  - Además, esas subconsultas `NOT EXISTS` solo ven filas de la empresa, que no es la semántica de
    producción (dueño, todo).
  - En esta base el retiro ya era no-op y el JSDoc de `m3SoloDeLaEmpresa` lo dice. La pérdida es
    pequeña, porque es una migración histórica ya aplicada, pero conviene decirlo también en el caso (c).
- **menor 3. `requirements.md` no recoge el alcance ampliado.** R1160 y R1169 hablan de 7 archivos y
  «Archivos esperados» lista 10. Las 7 entradas añadidas (habilitacion, orden-traspaso, premio-ranking,
  push-canal, ranking-snapshot, webhook, busqueda-usa-indice) solo quedan trazadas en
  `progress/features/SLT-187.md` y en la bitácora. Cada una tiene su mutación roja (M17-M24), así que la
  verificación existe; falta que el spec lo diga.
- **menor 4. El `organizacionId` se interpola sin escapar en `-c app.organizacion_id=…`**
  (`_postgres-real.ts`). Es un helper de test que recibe un id de cuid/uuid, sin riesgo real. Lo apunto
  por si algún día se le pasa texto libre.

## Veredicto

**OK.** No hay bloqueantes. El menor 1 conviene resolverlo antes de mergear #219 o #220 (una línea en el
baseline, o ampliar SLT-195).
