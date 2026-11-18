# SLT-184 «Orden y zona propias en tests de chat, notas y wallet» — bitácora (backend_dev)

## Entorno
- Bases desechables vía `scratchpad/con-desechable.cjs` (sin leer `.env` ni ver URLs), migradas
  (`migrate deploy`) + `pnpm run db:seed`, igual que `gate.yml`. Postgres local **18.2** (CI usa 17).
  - **A** `servi_slt184_desechable`: vacía (solo catálogos). R1120.
  - **B** `servi_slt184b_desechable`: + empresa AJENA confirmada con `scratchpad/slt184-otra-empresa.tmp.ts`
    (fuera del repo; variante de la de SLT-182 que además asocia 5 distritos de Cartago a la satélite
    ajena y siembra 1 hilo de chat, 1 mensaje y 1 nota): 1 organización, zona central y satélite,
    2 tarifas, 5 usuarios (uno por rol), 40 órdenes, 40 gestiones, 2 `cierre_dia`, 1 `cierre_bodega`,
    1 movimiento en cada libro, 5 `zona_distrito`, 1 `chat_conversacion`, 1 `chat_mensaje`, 1 `orden_nota`. R1121.
- `prisma generate` no se ejecutó. Nada de `lib/ app/ components/ hooks/ db/ scripts/ .github/
  package.json` tocado (`git diff --name-only origin/dev...HEAD -- …` vacío). `_postgres-real.ts`,
  `454/_escenario.ts` y todo `_fixtures/` sin cambios (R1129 no aplica: ningún helper tocado; se
  IMPORTAN `crearFksDeOrden` / `crearUsuarioDePrueba` de `_fixtures/orden-minima.ts`).
- Ningún test depende del motor (18.2 vs 17) por lo que se ve: todo es siembra en tx revertida; ningún
  literal de versión, plan ni orden implícito nuevo.

## T1 — antes (base A, JSON de vitest)
Los 18 dieron exactamente los p/f/s de la tabla del spec (`api-lectura` 0/0/9). Los 18 seguían en el
baseline citando SLT-184.

## T2-T5 — qué se sembró
Patrón: sale toda lectura de `orden`/`zona`/`usuario`/gestión que no creó el test (`findFirst` sin
filtro, `SELECT … LIMIT 1`, producto cartesiano `zona × provincia × canton`); dentro de la tx revertida
`crearFksDeOrden(tx)` (+ `crearUsuarioDePrueba` donde hacía falta) y control positivo
`expect(count, "SLT-184: la … sembrada no esta en la base").toBe(n)`. Catálogos y geografía por clave.
Ninguna fila confirmada (R1123 no aplica: nada abre su propia tx fuera de la del caso).

| archivo | qué leía de la base | además | control positivo |
|---|---|---|---|
| `db/chat-entrante-telefono-cr` | `orden.findFirst` + `usuario.findFirst` (beforeAll) | `sembrarFks` por caso: tienda, zona, mensajero; `mensajeroId` lo devuelve `sembrarYResolver` | usuarios 2, zona 1 |
| `db/corregir-datos-cliente.chat` | `orden.findFirst` (beforeAll) | — | tienda 1, zona 1 |
| `repositories/chat-media-autorizada.int` | `zona.findFirst` en `crearOrden` | `crearOrden(tx, fks, …)` | zona 1 |
| `repositories/chat-media-historico.int` | ídem | ídem | zona 1 |
| `repositories/historico-conversaciones.int` | `zona.findFirst` en `crearOrden` (la zona de OTRA empresa en CI → trigger SL-17) | `fksSembradas` en `medir` | zona 1 |
| `db/orden-nota-migration` | `zona × provincia × canton LIMIT 1` | `geo`/`estatus` desde `crearFksDeOrden` | zona 1 |
| `db/orden-mensajero-meta-drop-nota-migration` | ídem | ídem | zona 1 |
| `db/habilitacion-api-migration` | ídem | ídem | zona 1 |
| `repositories/orden-nota.int` | `zona.findFirst` | `crearOrden(tx, fks, …)` | zona 1 |
| `db/confirmacion-fisica-migration` | auditaba «todas las gestiones» de la base; backfill plantado en «la primera/última gestión» | `sembrarGestiones`: orden + mensajero + 2 gestiones propias; la auditoría R20/R17 corre en tx revertida; el backfill se planta en las 2 sembradas por id | gestiones 2 |
| `db/geografia-historico-intacto` | `orden.findFirst` (beforeAll) | — | tienda 1, zona 1 |
| `db/geografia-ordenes-sin-entregar` | ídem | — | tienda 1, zona 1 |
| `repositories/conteo-productos.int` | `zona.findFirst` | `fksSembradas` en `medir` | zona 1 |
| `repositories/dinero-productos.int` | `zona.findFirst` (orden y cierre) | `fksSembradas`; el cierre usa la zona sembrada | zona 1 |
| `db/455/caracterizacion/api-lectura` | «un distrito activo con zona» de la base | distrito de Cartago/Cartago por clave, ASOCIADO en `e.tx` a `e.zonaSateliteId` | `zona_distrito` 1 |
| `db/wallet-cierres-selector` | `zona.findFirstOrThrow` ×2, plantilla `usuario.findFirstOrThrow` | rol/tipo por clave; zona de `crearFksDeOrden`, `sembrar` la devuelve | zona 1 |
| `db/wallet-etiqueta-historial-458` | `zona.findFirst` | — | zona 1 |
| `db/wallet-origen-legible` | `zona.findFirst` + `orden.findFirst` | — | zona 1 |

R1125: ningún `it`/`expect` de comportamiento quitado ni debilitado; ningún literal esperado cambiado.
En `chat-entrante` el caso «hay FKs…» pasó de `not.toBeNull()` sobre lo leído a sembrar en tx y contar
(más fuerte). Nº de casos por archivo igual antes/después (JSON). R1124: ningún `return` antes de la
primera aserción; si falta un catálogo, `crearFksDeOrden`/`crearUsuarioDePrueba` lanzan nombrándolo.

## Resultado (JSON de vitest, los 18 juntos) — p/f/s
| archivo | antes (A) | A (vacía) | B (empresa ajena) |
|---|---|---|---|
| `db/chat-entrante-telefono-cr` | 2/18/0 | 20/0/0 | 20/0/0 |
| `db/confirmacion-fisica-migration` | 17/2/0 | 19/0/0 | 19/0/0 |
| `db/corregir-datos-cliente.chat` | 0/0/2 | 2/0/0 | 2/0/0 |
| `db/geografia-historico-intacto` | 0/0/6 | 6/0/0 | 6/0/0 |
| `db/geografia-ordenes-sin-entregar` | 0/0/10 | 10/0/0 | 10/0/0 |
| `db/habilitacion-api-migration` | 8/1/12 | **20/1/0** (otra causa) | 20/1/0 |
| `db/orden-mensajero-meta-drop-nota-migration` | 6/0/7 | 13/0/0 | 13/0/0 |
| `db/orden-nota-migration` | 3/0/13 | 16/0/0 | 16/0/0 |
| `db/wallet-cierres-selector` | 0/8/0 | 8/0/0 | 8/0/0 |
| `db/wallet-etiqueta-historial-458` | 1/1/0 | 2/0/0 | 2/0/0 |
| `db/wallet-origen-legible` | 0/1/0 | 1/0/0 | 1/0/0 |
| `db/455/caracterizacion/api-lectura` | 0/0/9 | 9/0/0 | 9/0/0 |
| `repositories/chat-media-autorizada.int` | 0/0/3 | 3/0/0 | 3/0/0 |
| `repositories/chat-media-historico.int` | 0/0/4 | 4/0/0 | 4/0/0 |
| `repositories/conteo-productos.int` | 0/0/8 | 8/0/0 | 8/0/0 |
| `repositories/dinero-productos.int` | 0/0/22 | **21/1/0** (otra causa) | 21/1/0 |
| `repositories/historico-conversaciones.int` | 0/0/27 | 27/0/0 | 27/0/0 |
| `repositories/orden-nota.int` | 0/0/5 | 5/0/0 | 5/0/0 |

R1121/R1123: conteo de B antes y después de la suite idéntico (`organizacion 1, zona 2, usuario 5,
orden 40, gestion_orden 40, cierre_dia 2, tarifa_zona_mensajero 2, wallet_* 1 c/u, cierre_bodega 1,
zona_distrito 5, chat_conversacion 1, chat_mensaje 1, orden_nota 1`); en A, 0 en todas tras la suite.

## Los 2 que siguen rojos (R1128)
Medido local 2026-11-18, bases A y B, ya sembrados:
- **`db/habilitacion-api-migration` → SLT-187 «Tests de migración desfasados tras SL-17».** Caso «las
  columnas del CREATE TABLE y las del modelo Prisma coinciden» (`:293`): `expected [ 'actor_usuario_id',
  …(7) ] to deeply equal [ …(6) ]`. El modelo Prisma de `orden_habilitacion_api` tiene 8 columnas y el
  CREATE TABLE de su migración 7: SL-17 añadió `organizacion_id`
  (`20261022130100_organizacion_id_en_negocio/migration.sql:203`). Ya fallaba antes (el 1 de 8/1/12).
- **`repositories/dinero-productos.int` → SLT-186 «Tests con estados retirados del catálogo»** (tests
  desfasados por contrato, según el reparto del leader). Caso «(k) R22 · todo importe … STRING escala 2»
  (`:759`): `modelo: expected 'viejo' to match /^-?\d+\.\d{2}$/`. El caso recorre `congelada.tarifa`
  esperando solo importes; desde SLT-52 esa tarifa es la unión `{ modelo: "viejo" | "nuevo", … }`
  (`lib/types/tarifa-flexible.ts:64`, `DineroProductosRepository.ts:188`). Es un discriminante, no un
  importe: no es un fallo de producción.
Motivo reescrito en el baseline, `desde` intacto.

## T7 — mutaciones (base A, una a una, `git checkout --` tras cada una, árbol limpio)
Script `scratchpad/mut184.cjs` (fuera del repo). La fila sembrada se sustituye por un uuid que nadie
sembró (`…0000aa`) o se quita su `create`. Todas restauradas (`restaurado=true`, `git status` limpio).

| archivo | fila quitada | p/f/s | caso rojo | mensaje |
|---|---|---|---|---|
| `db/chat-entrante-telefono-cr` | mensajero | 2/18/0 | «hay FKs de orden y un usuario…» (+17) | `SLT-184: la tienda o el mensajero sembrados no estan en la base: expected 1 to be 2` |
| `db/confirmacion-fisica-migration` | las 2 gestiones | 17/2/0 | «R20/R17: ninguna marca…» y AUTOCOMPROBACION | `SLT-184: las gestiones sembradas no estan en la base: expected +0 to be 2` |
| `db/corregir-datos-cliente.chat` | zona | 0/2/0 | «⭑ R20/R21…» y «⭑ R19…» | `SLT-184: la zona sembrada no esta en la base: expected +0 to be 1` |
| `db/geografia-historico-intacto` | zona | 0/6/0 | los 6 | ídem |
| `db/geografia-ordenes-sin-entregar` | zona | 0/10/0 | los 10 | ídem |
| `db/habilitacion-api-migration` | zona | 8/1/12 | suite (beforeAll), 12 sin ejecutar | ídem (`:583`) |
| `db/orden-mensajero-meta-drop-nota-migration` | zona | 6/0/7 | suite (beforeAll), 7 sin ejecutar | ídem (`:400`) |
| `db/orden-nota-migration` | zona | 3/0/13 | suite (beforeAll), 13 sin ejecutar | ídem (`:399`) |
| `db/wallet-cierres-selector` | zona | 0/8/0 | los 8 | ídem |
| `db/wallet-etiqueta-historial-458` | zona | 1/1/0 | «mensajero con segundo apellido…» | ídem |
| `db/wallet-origen-legible` | zona | 0/1/0 | «maestro: cierre con día CR…» | ídem |
| `db/455/caracterizacion/api-lectura` | `zona_distrito` | 0/0/9 | suite (beforeAll) | `SLT-184: la asociacion zona-distrito sembrada no esta en la base: expected +0 to be 1` |
| `repositories/chat-media-autorizada.int` | zona | 0/0/3 | suite (beforeAll) | `SLT-184: la zona sembrada no esta en la base` |
| `repositories/chat-media-historico.int` | zona | 0/0/4 | suite (beforeAll) | ídem |
| `repositories/conteo-productos.int` | zona | 0/0/8 | suite (beforeAll) | ídem (`:96`) |
| `repositories/dinero-productos.int` | zona | 0/0/22 | suite (beforeAll) | ídem (`:174`) |
| `repositories/historico-conversaciones.int` | zona | 0/0/27 | suite (beforeAll) | ídem (`:147`) |
| `repositories/orden-nota.int` | zona | 0/0/5 | suite (beforeAll) | ídem |

En los archivos que miden en `beforeAll` la suite entera cae (fichero rojo, casos sin ejecutar) con el
mensaje del control: así funcionaban ya antes de la ficha, y es el rojo que ve el gate.

## Mapa R → test
| R | evidencia |
|---|---|
| R1120, R1122, R1124, R1125 | los 18 archivos (tabla de resultados, columna A) + diff |
| R1121, R1123 | columna B + conteo de B igual antes/después; A en 0 |
| R1126 | tabla de mutaciones |
| R1127, R1131 | `tests/baseline-rojos.json`: 16 claves retiradas, 2 motivos reescritos; CI del PR pendiente |
| R1128 | «Los 2 que siguen rojos» |
| R1129 | no aplica: ningún helper tocado |
| R1130, R1132 | `git diff --name-only origin/dev...HEAD -- lib/ app/ components/ hooks/ db/ scripts/ .github/ package.json` vacío; `tamano-pr`: 19/40 archivos, 0/1000 producción, 632/3000 tests |

## Tamaño
Siembra: +303 / −261 líneas en `tests/integration` (18 archivos), muy por debajo del tope heredado de 1300.
Baseline: +2 / −66.

## Gate
- `pnpm run typecheck`: exit 0. `eslint` de los 18 archivos: exit 0.
- `./init.sh` contra `servi_slt184_desechable` (tras merge de `origin/dev` con SLT-181), 2026-11-18:
  **INIT_EXIT=0**. 375 archivos de test seleccionados (18 por imports, 356 guardias, 5 que nombran un
  cambiado): 100/100, 100/100, 100/100 y 75/75 archivos verdes (969 passed, 1 skipped en el último lote);
  «80 rojo(s) heredado(s) del baseline no cuentan en esta seleccion».
- `scripts/tamano-pr.mjs`: 19/40 archivos, 0/1000 producción, 632/3000 tests.
- CI del PR (`gate-completo`, R1131): pendiente; lo anota el leader tras abrir el PR.

## Veredicto
16 de 18 retirados del baseline, verdes en base vacía y con empresa ajena; 2 siguen con motivo medido (SLT-187, SLT-186); gate local verde.
