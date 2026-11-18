# SLT-181 «Siembra propia en tests de búsqueda, push y liberación» — bitácora (backend_dev)

## Entorno
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), migradas
  (`migrate deploy`) + `pnpm run db:seed`, igual que `gate.yml`. Postgres local **18.2** (CI usa 17).
  - **A** `servi_slt181_desechable`: vacía (solo catálogos). R1060.
  - **B** `servi_slt181b_desechable`: + empresa AJENA confirmada con `scratchpad/slt181-otra-empresa.tmp.ts`
    (fuera del repo; copia del de SLT-179): 1 organización, zona central y satélite, 2 tarifas, 5 usuarios
    (mensajero, adminTienda, maestro, adminSatelite, admin), 40 órdenes, 40 gestiones, 1 `cierre_dia`. R1061.
  - **C** `servi_slt181c_desechable`: recién creada, solo para medir `busqueda-usa-indice` en base nueva.
- `prisma generate` no se ejecutó. Ningún archivo de `lib/ app/ components/ hooks/ db/ scripts/ .github/
  package.json` tocado. `_postgres-real.ts`, `454/_escenario.ts`, `_fixtures/escrituras-459.ts` y
  `_fixtures/orden-minima.ts` sin cambios (R1069 no aplica: ningún helper compartido tocado).

## T1 — antes (base A)
Los 14 dieron exactamente los p/f/s de la tabla del spec (p. ej. `busqueda-comportamiento` 11/27/0,
`costo-y-zona-api-415` 0/0/11, `wallet-anulacion-concurrencia` 0/0/2). Los 14 estaban en el baseline citando SLT-181.

## T2-T4 — qué se sembró
Patrón: sale `fksDeOrden(prisma)` (y todo `usuario.findFirst/findMany` o `zona.findMany` global); dentro de la
tx revertida de CADA caso, `crearFksDeOrden(tx)` (+ `crearUsuarioDePrueba` donde hacía falta otro usuario) y
control positivo con mensaje «SLT-181: la … sembrada no esta en la base». Se quitaron los `if (!fks) return;`.

| archivo | además | control positivo |
|---|---|---|
| `busqueda-comportamiento` | el caso «hay ordenes…» cuenta el corpus | tienda 1, zona 1, corpus = `SEMILLAS.length` |
| `busqueda-normalizacion-paridad` | siembra en la tx del `beforeAll` | tienda 1, zona 1, órdenes = `CORPUS.length` |
| `busqueda-sincronizacion-columna` | R28 lee una orden sembrada (antes `orden.findMany take 1` global + `return` si vacía) | tienda 1, zona 1 (helper `sembrarFks`) |
| `busqueda-usa-indice` | `fks` viaja en el contexto de `conCorpus` | tienda 1, zona 1, órdenes = `FILAS` |
| `aviso-agregado-repository`, `push-canal-restricciones`, `push-destinatarios-equivalencia`, `usuario-preferencia` | `fksDeOrden` + su `expect` se mueven DENTRO de la tx (helper `sembrarFks`) | tienda 1, zona 1 |
| `liberacion-al-aprobar-cierre-real`, `liberacion-reprogramada-cierre-real` | mensajero `crearUsuarioDePrueba` (antes «el primer usuario») | usuarios 2, zona 1 |
| `rechazo-tienda-cobro.int` | `sembrarRechazo` siembra en su tx; el bloque de concurrencia siembra COMMITEADO con `sembrarPersonas459` + zona propia de esa empresa, borrado en `finally` | usuarios 2, zona 1 / zona commiteada 1 |
| `wallet-anulacion-concurrencia` | catálogo por clave; zona COMMITEADA propia en la empresa 459, borrada en `finally` antes de `limpiar459` | zona commiteada 1 |
| `costo-y-zona-api-415` | dos tiendas y dos zonas sembradas (A central, B no: la aritmética esperada es la de `esCentral: true`) | tiendas 2, zonas 2 |
| `webhook-evidencias-url-resuelve-sql-real` | la tienda plantilla es la sembrada | zona 1 (+ `findUniqueOrThrow` de la tienda) |

R1065: `it`/`test` por archivo iguales a `origin/dev` (contados), `expect` solo suben (+1 a +4 por archivo);
ningún literal esperado cambió; ninguna aserción quitada (los `expect(fks).not.toBeNull()` siguen, dentro de la tx).

## Resultado (JSON de vitest, los 14 juntos)
| archivo | A (vacía) | B (empresa ajena) |
|---|---|---|
| `aviso-agregado-repository` | 11/0/0 | 11/0/0 |
| `busqueda-comportamiento` | 38/0/0 | 38/0/0 |
| `busqueda-normalizacion-paridad` | 17/0/0 | 17/0/0 |
| `busqueda-sincronizacion-columna` | 7/0/0 | 7/0/0 |
| `liberacion-al-aprobar-cierre-real` | 5/0/0 | 5/0/0 |
| `liberacion-reprogramada-cierre-real` | 4/0/0 | 4/0/0 |
| `push-destinatarios-equivalencia` | 4/0/0 | 4/0/0 |
| `webhook-evidencias-url-resuelve-sql-real` | 4/0/0 | 4/0/0 |
| `push-canal-restricciones` | 6/1/0 (policies, SLT-187) | ídem |
| `usuario-preferencia` | 10/4/0 (empresa en contexto, SLT-185) | ídem |
| `rechazo-tienda-cobro.int` | 9/1/0 (empresa en contexto, SLT-185) | ídem |
| `wallet-anulacion-concurrencia` | 0/2/0 (empresa en contexto, SLT-185) | ídem |
| `busqueda-usa-indice` | 13/1/0 en base nueva (PARADA) | 13/1/0 |
| `costo-y-zona-api-415` | 3/8/0 (PARADA) | 3/8/0 |

R1063: tras la suite, en A `organizacion/zona/usuario/orden/gestion_orden/cierre_dia/tarifa_zona_mensajero` = 0, y
0 zonas `Zona 337%`/`Zona 458C%`, 0 usuarios `%459e-%`, 0 `rechazo_tienda_cobro`, 0 `wallet_movimiento`. En B, el
conteo antes y después de la suite es idéntico.

## Los que siguen rojos por otra causa — baseline reescrito (R1068)
- `push-canal-restricciones` :353 «y no tienen policies» espera 0 y hay 2 (`push_suscripcion_por_empresa`,
  `push_envio_dia_por_empresa`, migración SL-17 `20261022130100_organizacion_id_en_negocio`) → **SLT-187**.
- `usuario-preferencia` :299/:314/:399/:425 — las carreras sobre esquemas clonados escriben sin empresa en
  contexto: `organizacion_id` NULL (Null constraint en `fijarAvisosPush`; 23502 en `push_suscripcion`) → **SLT-185**.
- `rechazo-tienda-cobro.int` :394 — `crearPendiente` commiteado sin empresa en contexto: «referencia a otra
  empresa: rechazo_tienda_cobro.gestion_id -> gestion_orden» → **SLT-185**.
- `wallet-anulacion-concurrencia` :69 y :145 — «referencia a otra empresa: wallet_movimiento.registrado_por ->
  usuario» / ídem `rechazo_tienda_cobro` → **SLT-185**.
Ninguno apunta a un fallo de producción: el código de producción espera la empresa en contexto y el test no la pone.

## PARADA (R1068): dos archivos sin ficha que cubra su causa — baseline NO tocado
1. **`busqueda-usa-indice`** — sembrado, el plan de `el findMany se resuelve por orden_busqueda_texto_trgm_idx`
   (:211) en una base RECIÉN creada usa `Bitmap Index Scan on orden_organizacion_id_created_at_vivas_idx`
   (índice parcial `WHERE deleted_at IS NULL` de SL-24, `db/migrations/20261028130000_plan/migration.sql:129`)
   en vez del trigram, aun con `enable_seqscan = off` y la pending list vaciada. Medido: base C nueva → 12/2 la
   1ª corrida y 14/0 la 2ª; base A → 13/1 la 1ª, 14/0 en las tres siguientes; B → 13/1. Es la elección POR
   COSTE que la cabecera del archivo dice no poder medir (la misma historia que la feature 294 con el único
   parcial): depende de las tuplas muertas que dejaron corridas previas. En CI (base nueva) es rojo o flaky.
   No es falta de datos ni fallo de producción; no se forzó el plan. Ninguna de SLT-185/186/187/188/195 lo cubre.
2. **`costo-y-zona-api-415`** — sembrado, 3/8: el contrato del test está desfasado: `costoReal`/`costoEstimado`
   traen además `ivaFulfillment: "0.00"` (fulfillment monto+IVA), el detalle emite 15 consultas
   (`cierre_detail_concepto` de más) frente a las 14 del literal (:601) y el listado 11 (`cierre_detail_concepto`
   y `tarifa_activacion`) frente a 9 (:609). Los importes sí coinciden (2500.00/325.00/906.50/117.85/692.00).
   Es como `gestiones-detalle-api-405` de SLT-179 (15 vs 14), que el leader mandó a SLT-186, pero aquí la causa
   no es un estado retirado por la 454. Falta que el leader asigne ficha (¿ampliar SLT-186?).
Sus entradas del baseline siguen con el motivo «base vacía» de SLT-181 hasta que el leader decida; la siembra sí
queda hecha y commiteada.

### Decisión del leader (2026-11-17) sobre la parada
- `busqueda-usa-indice` → SLT-187 «Tests de migración desfasados tras SL-17», que amplía su alcance a «tests
  desfasados por migraciones posteriores». Motivo reescrito: `:211`, índice de SL-24, inestable 12/2 → 14/0, plan
  sin forzar.
- `costo-y-zona-api-415` → SLT-186 «Tests con estados retirados del catálogo», cuyo alcance ya es «tests
  desfasados»; es gemelo de `gestiones-detalle-api-405`. Motivo reescrito: `ivaFulfillment` (`:495`), 15 frente a
  14 consultas (`:605`) y 11 frente a 9 (`:613`).
En los dos, `desde` queda intacto.

## T6 — mutaciones (base A, una a una, `git checkout --` tras cada una; árbol limpio al final)
La fila sembrada se sustituye por un uuid que nadie sembró (`…0000aa`), salvo en paridad (se deja de sembrar una orden).

| archivo | fila quitada | p/f/s | caso rojo | mensaje |
|---|---|---|---|---|
| `busqueda-comportamiento` | zona | 0/38/0 | «hay ordenes de las que tomar las FKs» | «SLT-181: la zona sembrada no esta en la base» |
| `busqueda-normalizacion-paridad` | una orden del corpus | 15/2/0 | «la base tiene ordenes…» | «SLT-181: las ordenes del corpus no se sembraron: expected 11 to be 12» |
| `busqueda-sincronizacion-columna` | zona | 0/7/0 | «hay ordenes…» | «SLT-181: la zona sembrada no esta en la base» |
| `busqueda-usa-indice` | zona | 5/9/0 | «hay ordenes…» | ídem |
| `aviso-agregado-repository` | tienda modelo | 0/11/0 | ⭑ (a) | «SLT-181: la tienda sembrada no esta en la base» |
| `push-canal-restricciones` | tienda modelo | 1/6/0 | ⭑ R17 | ídem |
| `push-destinatarios-equivalencia` | zona | 0/4/0 | «los cuatro alcances…» | «SLT-181: la zona sembrada no esta en la base» |
| `usuario-preferencia` | tienda modelo | 2/12/0 | «sin fila, `avisosPushDe`…» | «SLT-181: la tienda sembrada no esta en la base» |
| `liberacion-al-aprobar-cierre-real` | mensajero | 0/5/0 | 💰 «libera las VENCIDAS…» | «SLT-181: la tienda y el mensajero sembrados no estan en la base» |
| `liberacion-reprogramada-cierre-real` | mensajero | 0/4/0 | R11 | ídem |
| `rechazo-tienda-cobro.int` | zona | 3/7/0 | «dos altas del MISMO rechazo…» | «SLT-181: la zona sembrada no esta en la base» |
| `costo-y-zona-api-415` | tienda ajena | 0/11/0 | R25 | «SLT-181: las dos tiendas sembradas no estan en la base» |
| `webhook-evidencias-url-resuelve-sql-real` | zona | 0/4/0 | «orden CON guia…» | «SLT-181: la zona sembrada no esta en la base» |
| `wallet-anulacion-concurrencia` | — | — | sin mutación útil: 0 verdes (cae antes por empresa en contexto) | — |

Nota: una primera mutación de paridad (zona falsa) hacía lanzar el `beforeAll` (FK) y vitest marcaba los 17 casos
como saltados con el archivo en rojo; se sustituyó por la de la orden, que pone rojo un caso con nombre.

## T7 — baseline
`tests/baseline-rojos.json`: 128 → 120 claves; se borran las 8 de los verdes y se reescribe el `motivo` de 4
(`desde` intacto). Las 2 de la parada, intactas.

## Mapa R → evidencia
| R | evidencia |
|---|---|
| R1060, R1062, R1064, R1065 | los 8 verdes en A (tabla), diff revisado, controles positivos, `it` iguales |
| R1061 | los mismos en B, conteo de B igual antes/después |
| R1063 | `rechazo-tienda-cobro.int` y `wallet-anulacion-concurrencia`: 0 filas propias tras el archivo (A) |
| R1066 | tabla T6 |
| R1067 | diff del baseline: −8 claves del alcance, 4 motivos reescritos, nada más |
| R1068 | 4 motivos reescritos (SLT-185 ×3, SLT-187 ×1); 2 en PARADA |
| R1069 | no se tocó ningún helper compartido |
| R1070, R1072 | `git diff --name-only origin/dev` solo `tests/`, `specs/`, `progress/`; tamaño abajo |
| R1071 | pendiente del CI del PR |

## Salidas
- `pnpm run typecheck`: exit 0. `pnpm exec eslint` sobre los 14 archivos tocados: exit 0.
- `node scripts/tamano-pr.mjs`: 15/40 archivos, 0/1000 producción, 851/3000 tests.
- `./init.sh` (base A): ver «Gate» abajo.

## Veredicto
8 de 14 verdes en base vacía y con empresa ajena y fuera del baseline; 6 rojos por otra causa con motivo medido
(SLT-185 ×3, SLT-187 ×2, SLT-186 ×1; los 2 de la parada, asignados por el leader).
