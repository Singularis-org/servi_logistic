# Review SLT-188 «Tests que dejan filas fuera de su transacción»

Alcance: la feature ENTERA, `git diff 0711fe33..HEAD` sin `tests/baseline-rojos.json` (parte 1 = PR #222,
d5f3a414, mergeada sin review; parte 2 = PR #223, HEAD 9b8e386b). Commits propios (`--first-parent`): a5159740,
da85b349, d5f3a414, 7c91a584, 9b8e386b; el resto entró por merges de dev. Ruta ligera ampliada (toca
`.github/workflows/gate.yml`, pieza compartida). Fecha: 2026-11-18.

## Checklist

- [x] Ruta: ligera. El diff no toca dinero, permisos, auth, integraciones ni webhooks; complejidad low. El
      suelo de `docs/specs.md` se respeta. (Toca CI compartido: se revisó como si fuera completa en lo que importa.)
- [x] Spec: `requirements.md` con EARS R1170-R1189, `## Lo que ya existe` hecho, `## Tasks` T1-T8 todas `[x]`,
      `## Archivos esperados`.
- [x] Tamaño: `node scripts/tamano-pr.mjs` -> `4/40 archivos, 96/1000 lineas de produccion, 87/3000 de tests`.
- [x] Producción intacta (R1186/R1187): `git diff --name-only origin/dev...HEAD -- lib app components hooks db init.sh`
      vacío; también desde 0711fe33.
- [x] Baseline (R1188): `git diff 0711fe33..HEAD -- tests/baseline-rojos.json` vacío.
- [x] Typecheck (`pnpm run typecheck`) EXIT 0; eslint de los 3 archivos tocados EXIT 0.
- [x] Tests en la desechable `servi_slt188_desechable` (por `con-desechable.cjs`):
      `filas-fuera-de-tx.guardia.test.ts` + `total-a-cobrar-sin-cerrado-sql-real.test.ts` -> **20 passed (20)**,
      0 saltados (los 3 casos de Postgres real corrieron), EXIT 0.
- [x] Mutación R1185 repetida por el reviewer: `para-cada-empresa-modulo.test.ts:37` sin el `deleteMany` ->
      foto, vitest del archivo (verde), `comparar` -> «SL-23 con monitoreo» / «SL-23 sin monitoreo» —
      `organizacion: 1, organizacion_modulo: 1` · `4 filas fuera de su transacción` · **COMPARAR_EXIT=1**.
      Restaurada con `git checkout --` (árbol limpio); las 2 orgs purgadas de la desechable (`borradas 2`,
      foto posterior con 0 organizaciones).
- [x] Anti-ceguera repetida: foto y `comparar` sin suite en medio -> «comprobacion ciega: la suite no inserto
      ninguna organizacion en esta base», **EXIT 1**.
- [x] R1189 repetida: `foto` con un `DATABASE_URL` inventado (host `.invalid`, credencial marcada) -> sale
      `PrismaClientKnownRequestError (P1001)`; 0 apariciones de la credencial ni del host en la salida.
- [x] Node a secas: `node --no-warnings scripts/filas-fuera-de-tx.ts unir <dir> 2 --modo rojo` con Node 24.15 sobre
      el script ACTUAL (con control) -> EXIT 0 con 2 informes en 0; con 3 shards y uno sin informe -> EXIT 1.
      El script solo importa `node:` en lo alto (`import type` de Prisma se borra) y `gate-completo` usa
      `node-version: 24` (`gate.yml:303`). En CI ya funcionó en el run 44359606182 (versión sin control).
- [x] Misma base / foto tras el seed: `DATABASE_URL`/`DIRECT_URL` en el `env:` del workflow, ningún paso del
      shard los cambia; orden de pasos Base del shard (migrate+seed) -> Foto -> `init.sh --completo` ->
      Filas fuera de tx (`if: always()`) -> artefacto. Postgres 17 en el servicio (estadísticas en memoria
      compartida: el contador `n_tup_ins` del control no pierde mensajes como en <=14).
- [x] Falla cerrado (R1174): foto con `continue-on-error` -> `comparar` sin foto da `error` -> rojo; informe que
      falta o no parsea -> rojo; comprobación ciega -> rojo.
- [x] T5 / R1180: `total-a-cobrar-sin-cerrado-sql-real.test.ts` ya no lee `findFirst({ esCentral: true })`; crea su
      central y controla `count === 1` en la empresa de la tx. Mutación del control (`!== 99`) en rojo según la
      bitácora; antes del arreglo, 4 failed con una central ajena (SL017).
- [x] Mapa R -> test en `progress/impl_SLT-188.md` (completo, R1170-R1189).
- [x] Datos y seguridad: sin tablas, migraciones ni queries de negocio nuevas; el script solo lee (tx
      `READ ONLY` + `REPEATABLE READ`, probado con 25006); no hay `console.log` de secretos. Las muestras son
      emails de usuarios de prueba.
- [x] Sin dependencias nuevas; sin referencias a Ordenex; sin literales de país nuevos (el `sinpeNumero` de T5 ya
      estaba).
- [ ] **Pendiente (leader): R1183** — `gate-completo` del PR #223 en modo rojo con «0 filas fuera de su
      transacción» en los 3 shards. Al revisar, el run de 9b8e386b seguía en curso (shards IN_PROGRESS).

## Trazabilidad

| R | Test / evidencia | Estado |
|---|---|---|
| R1170 | guardia: «R1176: una organizacion nueva…», «R1170: un `value` de order_status…», caso Postgres real (org+zona+orden+usuario con muestras) | OK |
| R1171 | foto de base nueva en la bitácora (0 orgs, 20 order_status, `jobs: 1`); paso «Foto» tras `db:seed` | OK (evidencia) |
| R1172 | `gate.yml` pasos del shard + artefacto; informe de los 3 shards del run 44359606182 | OK (evidencia CI) |
| R1173 | guardia «R1173: los tres en 0…», «R1173: un shard con filas -> rojo, nombrando shard, organizacion, tabla y conteo»; `MODO_FILAS: rojo` | OK |
| R1174 | guardia «R1174: falta el informe…/JSON roto», «un informe que no pudo comparar…», bloque «comprobacion CIEGA» (3 casos) | OK |
| R1175 | guardia «la lectura va en una transaccion READ ONLY… 25006», «MISMA instantanea… salida 0» | OK |
| R1176 | fixtures 1/0/0 + caso Postgres real | OK |
| R1177, R1181 | T3: 0 filas en los 3 shards; tabla vacía, sin arreglos inventados | OK (evidencia) |
| R1178, R1179 | no aplica: ningún escritor identificado | OK |
| R1180 | `total-a-cobrar-sin-cerrado-sql-real.test.ts` (4 casos con control `count === 1`) | OK, ver m1 |
| R1182 | inventario de la clase (b) en la bitácora -> D79 | OK |
| R1183 | CI del #223 | **pendiente** |
| R1184 | T7 intento 2: 0 y 0 sobre la misma desechable | OK (evidencia) |
| R1185 | T6 + repetida por el reviewer (EXIT 1, «SL-23 …») | OK |
| R1186, R1187 | diff de producción e `init.sh` vacío | OK |
| R1188 | baseline sin cambios | OK |
| R1189 | guardia «el motivo de un error no lleva la URL» + prueba del reviewer con URL inventada | OK |

## Hallazgos

Ningún BLOQUEANTE.

- **m1 (menor)** — R1180 pide pasar «en una base con datos de otra empresa»: eso se probó UNA vez a mano (bitácora
  T5), no queda en el test. Si mañana alguien vuelve a un `findFirst` sin acotar, el test solo lo detecta cuando
  haya datos ajenos en la base. El control `count === 1` tampoco compara `central.organizacionId` con la empresa
  de la tx (lo deja al trigger SL017). Aceptable para la ruta ligera; anotarlo si se quiere blindar.
- **m2 (menor)** — Mensaje engañoso con un worker muerto (D80): si un worker muere a medias, el resumen dirá
  «N filas fuera de su transacción» con una org `454…` y el autor del PR puede creer que la fuga es suya. Propuesta
  barata (ficha aparte o en D80): una línea en el resumen de `gate-completo` que, si el shard tiene
  «Worker exited unexpectedly» en su `init-shard.log`, lo diga junto a las filas.
- **m3 (menor)** — El control anti-ceguera exige `insercionesDuranteLaSuite > 0` POR SHARD. Hoy todas las porciones
  tienen tests de integración que crean empresas, pero si un día se sube el número de shards o una porción queda
  solo con unit, el gate saldría rojo «ciega» en falso. Verificar los valores del control de los 3 shards en el
  resumen del #223.
- **m4 (menor)** — `conBase` cae a `process.loadEnvFile()` si no hay `DATABASE_URL`: en local, sin la variable,
  mira la base del `.env` (de desarrollo), no una desechable. Es solo lectura y no imprime nada, pero R1175 habla
  de «base desechable»; mejor que en local exija la variable.
- **m5 (menor)** — `progress/features/SLT-188.md` desactualizado: tabla con assignee «—»; `## Estado` sigue en
  «F1.2 … Pendiente de aprobación»; `## Preguntas abiertas` mantiene «Activar el rojo de CI solo si el informe
  queda en 0 (OK de Carlos)» y la pregunta 2 del spec dice «Necesita OK de Carlos». El leader tiene que dejar
  escrito ese OK (o pedirlo) antes del merge: el rojo afecta a todo el equipo.

## Riesgo de equipo (rojo activo)

Un rojo ajeno puede tumbar `gate-completo` de cualquier PR solo si deja filas Y la suite no estaba ya en rojo por
eso mismo. Casos:
- **Worker que muere (D80):** hoy ya pone el gate en rojo (archivo en rojo o «contradiccion» de `init.sh:147`), salvo
  que otro rojo del baseline en el mismo informe tape el código. El rojo nuevo casi siempre coincide con uno que ya
  existía; cambia el mensaje (m2) y cuesta lo mismo: re-correr (la base de CI es efímera, no arrastra filas).
- **Test del baseline que cae a medias:** el baseline tolera su rojo pero no sus filas. Hoy las 4 entradas
  (`dependencias-declaradas-presentes` y 3 `*-migration`) no crean organizaciones: riesgo 0 hoy, latente si entra
  una nueva que commitee.
- **Reintentos:** vitest no tiene `retry` configurado; no hay «primer intento sucio, segundo verde».
- **Ceguera en falso:** m3, baja probabilidad.

Valoración: aceptable activar el rojo ya, sin mitigación previa, condicionado a R1183 (los 3 shards en 0 en el #223)
y al OK escrito de Carlos (m5). m2 conviene hacerlo pronto, no es condición.

## Veredicto

**OK** — sin bloqueantes. Condición del leader antes del aviso de merge: R1183 (`gate-completo` del #223 verde con
«0 filas fuera de su transacción» en los 3 shards y control con inserciones > 0 en cada uno) y m5.
