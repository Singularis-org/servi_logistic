# impl SLT-204 «CI: avisar «se cayó un worker» en vez de culpar al PR de filas fuera de su transacción»

Ruta directa (sin spec). Origen: hallazgo m2 de `progress/review_SLT-188.md` y deuda D80 (`progress/deudas.md`).
Base desechable: `servi_slt204_desechable` (migrada + catálogos).

## Archivos

| Archivo | Cambio |
|---|---|
| `scripts/filas-fuera-de-tx.ts` | `workerCaido(dirShard)`, `lineaDeCaida`, `lineasDeInforme(..., { trasCaida })`; `unir` avisa del worker caído por shard y cambia el total. |
| `.github/workflows/gate.yml` | Solo comentario en el paso «Filas fuera de su transaccion» de `gate-completo` (el artefacto ya traía log y JSON). |
| `tests/integration/db/454/_escenario.ts` | `sembrarComprometido(..., { marca })`, `MARCA_C02`, `barrerComprometidosHuerfanos(prisma, marca)`. |
| `tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts` | Siembra con `MARCA_C02` y barre los restos en `beforeAll` antes de sembrar. |
| `tests/integration/db/454/caracterizacion/corte-concurrencia-restos.test.ts` | Nuevo: el barrido (con marca propia). |
| `tests/unit/guards/filas-fuera-de-tx.guardia.test.ts` | 6 casos nuevos (describe «SLT-204 — unir: un worker de vitest caido...»). |

`init.sh` sin tocar. `tests/baseline-rojos.json` sin entradas de SLT-204: nada que podar.

## Parte 1: aviso de worker caído

De dónde sale la caída (datos reales del run, mismo artefacto `informe-shard-<i>`):
- `init-shard.log`: vitest 4 rechaza la tarea del pool con `[vitest-pool]: Worker forks emitted error.` y causa
  `Worker exited unexpectedly` (`node_modules/vitest/dist/chunks/cli-api.*.js`, `emitUnexpectedExit`). Va a los
  errores no manejados, que el reporter JSON **no** incluye.
- `.vitest-rojos.json`: los casos del archivo que no terminaron salen con `status: "pending"` (StatusMap de vitest:
  `run`/`queued` -> `pending`). Esto nombra el archivo. El repo no usa `.only`.

Cualquiera de las dos basta. Con caída: línea `shard N/3: se cayó un worker de vitest («Worker exited unexpectedly» en
<archivo>): el shard quedó incompleto y las filas sueltas pueden ser de ese archivo, no de tu PR; relanza el shard (Re-run
failed jobs)`, el cierre del shard dice «N filas sueltas tras la caída del worker: no se atribuyen al PR» y el total
«... con un worker de vitest caído en el shard N: relanza ese shard antes de buscar la fuga en el PR». El rojo se
mantiene (también con 0 filas: con el shard incompleto, ese 0 no mide). Sin caída, los mensajes de siempre.

Salida real con `node --no-warnings scripts/filas-fuera-de-tx.ts unir <fixture> 1 --modo rojo` (Node puro, como en CI):
```
shard 1/1: se cayó un worker de vitest («Worker exited unexpectedly»): el shard quedó incompleto y las filas sueltas pueden ser del archivo que corria, no de tu PR; relanza el shard (Re-run failed jobs)
shard 1/1: control: 3 tablas con organizacion_id antes / 3 despues; ...
shard 1/1: organizacion «Resto 454-C02 corte-concurrencia (worker caido) 454f0x1» (prueba-x, o1) — organizacion: 1, zona: 2
shard 1/1: 3 filas sueltas tras la caída del worker: no se atribuyen al PR
total: 3 filas sueltas con un worker de vitest caído en el shard 1: relanza ese shard antes de buscar la fuga en el PR; 0 shard(s) sin informe valido
codigo=1
```

## Parte 2: D80, opción elegida

**Barrido en el arranque siguiente, con marca.** C02 crea su empresa con `MARCA_C02` («Resto 454-C02
corte-concurrencia (worker caido)») al principio del nombre; su `beforeAll` llama a
`barrerComprometidosHuerfanos(prisma, MARCA_C02)` antes de sembrar, que reúne por `organizacion_id` usuarios, órdenes y
zonas de cada empresa marcada y reutiliza `limpiarComprometido` (la empresa la última: RESTRICT hace fallar en voz alta
si queda algo). Por qué es la mínima:
- No toca la comprobación de SLT-188: la marca sale sola en el nombre de la organización del informe de filas.
- Un `finally` no sirve (muere el proceso); el barrido sí, porque corre en el proceso siguiente.
- Seguro frente a paralelismo: cada archivo barre solo SU marca, y un archivo no corre dos veces a la vez en una corrida.
  El test del barrido usa una marca propia para no barrer a C02 en vivo.
- Límite: en CI la base es efímera, así que no hay «arranque siguiente»; ahí actúa la parte 1. Sirve en local, donde la
  desechable se reutiliza (el caso de T7 de SLT-188).

## Mapa requisito -> test (ruta directa: criterios de la ficha)

| Criterio | Test |
|---|---|
| A1 worker caído (log + JSON) -> aviso explícito con archivo, «relanza el shard», no «fuga», rojo | `filas-fuera-de-tx.guardia.test.ts` > «con un worker caido (log + JSON) y filas sueltas...» |
| A1 evidencia solo en el log | «solo con el log (sin JSON de vitest...)» |
| A1 evidencia solo en el JSON | «solo con el JSON (casos `pending`...)» |
| A2 caído con 0 filas -> sigue rojo | «worker caido con 0 filas: rojo igualmente...» |
| A3 sin caída -> mensaje de siempre | «sin caida (log y JSON sanos) y con filas...» y «sin caida y sin filas...» |
| D80 el barrido borra el escenario huérfano entero | `corte-concurrencia-restos.test.ts` > «un escenario confirmado que nadie limpio...» |
| D80 no toca empresas sin la marca | «el barrido no toca empresas sin la marca» |
| D80 marca de la prueba distinta de la de C02 | «la marca de C02 no es la de esta prueba...» |

## Rojo primero (antes del arreglo)

`vitest run tests/unit/guards/filas-fuera-de-tx.guardia.test.ts .../corte-concurrencia-restos.test.ts`:
```
 Test Files  2 failed (2)
      Tests  7 failed | 18 passed (25)
TypeError: barrerComprometidosHuerfanos is not a function
AssertionError: SLT-204: falta el aviso del worker caido en: ...
```
Después del arreglo (los 5 archivos que usan `sembrarComprometido` o el script):
```
 Test Files  5 passed (5)
      Tests  31 passed (31)
```

## Mutaciones (restauradas con `git checkout -- <archivo>`)

- **M1** `workerCaido` ignora el log (`if (false as boolean) fuentes.push("log")`): `Tests 1 failed | 21 passed (22)`,
  cae «solo con el log».
- **M2** `unir` no mira la caída (`const caida = undefined`, el comportamiento de antes): `Tests 4 failed | 18 passed (22)`,
  caen los 4 casos de caída; los 2 «sin caida» siguen verdes.
- **M3** C02 sin el barrido (`void barrerComprometidosHuerfanos;`), con un resto `MARCA_C02` sembrado a mano (script de
  scratchpad con `sembrarComprometido(..., { marca: MARCA_C02 })`): tras correr C02, `organizaciones=1 con_marca_C02=1`.
  Restaurado: `organizaciones=0 con_marca_C02=0`. (Manual: ningún test automático ve la llamada de C02.)
- **M4** el barrido filtra por `${marca}-x ` (nunca casa): `Tests 1 failed | 2 passed (3)`,
  `el barrido cuenta la empresa huerfana: expected +0 to be 1`.

Hallazgo de la propia mutación M4: el resto que dejó quedó en la base y la corrida siguiente del test dio 2 barridas
(esperaba 1). Arreglado: el `beforeAll` del test barre su propia marca antes, como C02. Verificado: 3/3 y
`organizaciones=0` al final.

## Gate rápido

`bash ./init.sh` en `servi_slt204_desechable`, log completo con `INIT_EXIT`:
```
✓ typecheck paso
✓ lint paso            (0 errors, 248 warnings, ninguno en archivos tocados)
 ✓ tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts (2 tests)
 ✓ tests/integration/db/454/caracterizacion/corte-concurrencia-restos.test.ts (3 tests)
 ✓ tests/unit/guards/filas-fuera-de-tx.guardia.test.ts (22 tests)
 Test Files 100 passed | 665 / 1303 / 1811 / 1503 (1 skipped) passed; 39 passed, 500 passed
== init OK ==
INIT_EXIT=0
```
`node scripts/tamano-pr.mjs`: `6/40 archivos, 113/1000 lineas de produccion, 299/3000 de tests`.

MCP de grafo: no usado (exploración con Grep/Read sobre el script, el escenario y vitest en `node_modules`).

## Veredicto
Aviso de worker caído en `gate-completo` y barrido D80 implementados con test en rojo previo y mutaciones que muerden; gate rápido verde.
