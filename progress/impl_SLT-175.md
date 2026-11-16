# SLT-175 «Pruebas R621/R623 con datos propios y guardia R631 con imports indirectos» — bitácora de implementación

backend_dev, 2026-11-16. Ruta ligera, en primer plano, sin subagentes. Grafo no usado: el worktree es
nuevo y todo lo tocado son tests; Grep/Read.

## Base desechable

- Nombre: **`servi_slt175_desechable`** (mismo servidor Postgres local del `.env`). Hay que borrarla
  al cerrar la ficha.
- Creada con un script de un solo uso en el scratchpad (`create database`), luego
  `pnpm exec prisma migrate deploy` contra ella. **Sin `db:seed`.** Nunca `migrate reset`.
- `DATABASE_URL` de la desechable solo en el entorno del proceso de vitest (y `DIRECT_URL` quitada),
  sin imprimirla.

## T1 — Medición antes de tocar nada

### Primer rojo de cada archivo sql-real (base solo con migraciones)

| Archivo | Primer rojo |
|---|---|
| `cierre-desglose-por-tienda-sql-real.test.ts` | `beforeAll` (`:113`): «hay DATABASE_URL pero la tabla `orden` esta vacia: sin FKs no se puede sembrar el corpus». 4 skipped. |
| `cierre-bodega-desglose-por-tienda-sql-real.test.ts` | `beforeAll` (`:129`): el mismo mensaje. 4 skipped. |

Los dos son el de falta de datos: la causa es la del baseline. Se sigue.

### Caminos de valor desde los servicios de dinero

Script de un solo uso (scratchpad, `medir.ts`, con el recorrido de R676: imports de valor, `import type`
y `{ type X }` puros fuera, alias `@/` y relativos, BFS por primer módulo). 19 servicios de dinero,
112 módulos leídos, `lib/utils/ingreso-empresa.ts` incluido, 0 especificadores sin resolver.

| Servicio | Primer módulo (import) | Cadena |
|---|---|---|
| `CierreBodegaService.ts` | `lib/services/cifras-bodega-descarga.ts` (`CierreBodegaService.ts:33`) | → `lib/utils/cifras-cierre-bodega.ts` |
| `CierreBodegaService.ts` | `lib/services/CierresAdminService.ts` (`CierreBodegaService.ts:40`) | → `lib/utils/cifras-cierre.ts` |

Exactamente los dos de `## Medición` del spec. No hay caminos nuevos: no se para.

## T2 y T3 — Siembra dentro de la tx

- `beforeAll`: fuera `fksDeOrden` y los `usuario.findFirst` (plantilla, mensajero, solicitante). Queda
  solo `orderStatus.findFirst({ where: { value: "en_reparto" } })`, que lanza si falta.
- Dentro de `conCorpus`, tras `serializarEscriturasReales`: `crearFksDeOrden(tx)` (zona y geografía),
  `crearUsuarioDePrueba(tx, rol)` para cada usuario y `usuario.update` en la tx para el nombre del
  caso (`NOMBRE_COMPARTIDO`, «Ana Mensajera», «Beto Mensajero») con `primerApellido: null`, que es
  como los creaba antes. Roles: tiendas `adminTienda`, mensajeros `mensajero`, solicitante del cierre
  de bodega `adminSatelite` (el `schema.prisma` lo anota como actor; ninguna restricción lo exige).
- El fixture no se tocó. Ningún `it`, `expect` ni literal cambió: `git diff -U0` de los dos archivos
  no tiene ni una línea con `expect`, `it(`, `toBe`, `toEqual`, `000.00` ni `.50"`.

Resultado en `servi_slt175_desechable` (solo migraciones, sin seed), `vitest run --reporter=verbose`:

```
 ✓ cierre-desglose-por-tienda-sql-real.test.ts > 396/B3 > CONTROL POSITIVO …
 ✓ cierre-desglose-por-tienda-sql-real.test.ts > 396/B3 > R6: la proyección sube el `tienda_id` CONGELADO …
 ✓ cierre-desglose-por-tienda-sql-real.test.ts > 396/B3 > R6/R7: el desglose sale de lo congelado …
 ✓ cierre-desglose-por-tienda-sql-real.test.ts > 396/B3 > las identidades se sostienen …
 ✓ cierre-bodega-desglose-por-tienda-sql-real.test.ts > 396/D > CONTROL POSITIVO …
 ✓ cierre-bodega-desglose-por-tienda-sql-real.test.ts > 396/D > R6: cada `cierre_dia` sube el `tienda_id` CONGELADO …
 ✓ cierre-bodega-desglose-por-tienda-sql-real.test.ts > 396/D > ⚠️ R19 vs R20 …
 ✓ cierre-bodega-desglose-por-tienda-sql-real.test.ts > 396/D > las identidades de los TRES niveles …
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

Por archivo: **4 passed / 0 skipped / 0 failed** en cada uno.

## T4 — Mutaciones (una a una, en la desechable, sin gate en paralelo)

| Mutación | Dónde | Casos rojos | Restaurado |
|---|---|---|---|
| Siembra: `b1-entrega` vuelve antes de crear su gestión | los dos archivos sql-real, en `sembrar` | 8/8; los dos CONTROL POSITIVO por cardinal: `expected 2 to be 3` (mensajero) y `expected 3 to be 4` (bodega) | `git checkout -- tests/integration` |
| (a) el mapper lee la tienda VIVA (`GESTION_ADMIN_SELECT` + `orden.tiendaId`, `toPendienteRowDesdeSnapshot`) en vez de `d.tiendaId` | `lib/repositories/CierresAdminRepository.ts:369,765` | 6/8: los dos R6, R6/R7, R19 vs R20 y las dos identidades (ids cruzados, `difA` −3616.00 en vez de −7345.00 / −10452.50). Los CONTROL POSITIVO siguen verdes (el conjunto de tiendas es el mismo) | `git checkout -- lib/`; `git diff --stat -- lib/` vacío |
| (b) `partesPorTienda` no resta el flete por rechazo (`totalesIngresoEmpresa` sin las gestiones de rechazo) | `lib/utils/ingreso-empresa.ts:673` | 4/8: las dos identidades, R6/R7 y R19 vs R20 (`pago 94350.00` en vez de `92655.00`; Σ `130734.00` en vez de `129039.00`) | `git checkout -- lib/`; `git diff --stat -- lib/` vacío |

Nota: el primer intento de (a) añadió `tiendaId` a `GESTION_DESCARGA_SELECT` (otro select) y dio 8/8
rojos por `TypeError`, no por la aserción: no vale como mutación; se restauró y se repitió en el select
correcto. La tabla recoge la buena.

## T5 — Baseline

Salen solo `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` y
`tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`: `git diff --stat` = 8
borradas, 0 añadidas; el JSON parsea. `gate-cableado-arnes-v2.guardia.test.ts`: 5 passed.

## T6 — Guardia R631 transitiva

`tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`: los 5 casos de SLT-169 se quedan
tal cual; se añaden las funciones con lector inyectable (`resolverEspecificador`, `importsDeValor`,
`barrer`, `nombresDeOrigen`, `simbolosProhibidos`, `veredicto`), `EXCEPCIONES` (las dos de D2, con
`archivo:línea` y porqué citando SLT-176) con `TOPE_EXCEPCIONES = 2`, y 12 casos nuevos: 4 sobre el
árbol real y 8 en memoria (a-g). Barrido real: 19 servicios, más módulos leídos que servicios,
`lib/utils/ingreso-empresa.ts` incluido, y exactamente las dos cadenas de T1.

Guardia limpia: **17 passed** (5 de SLT-169 + 12 de SLT-175).

| Mutación | Casos rojos | Mensaje | Restaurado |
|---|---|---|---|
| M6 de SLT-169: `import { cifrasDelCierre } from "@/lib/utils/cifras-cierre"` en `WalletTiendaFeedService.ts` | 4 (la directa de SLT-169 y las 3 del árbol real) | — | `git checkout -- lib/` |
| M7 transitiva: `lib/utils/_m7.ts` re-exporta `cifrasDelCierre`; `WalletTiendaFeedService.ts` importa `cifrasDelCierre as c7` de `_m7` | 3 (las del árbol real; la directa de SLT-169 NO lo ve) | `camino a modulo prohibido (lib/services/WalletTiendaFeedService.ts:13): lib/services/WalletTiendaFeedService.ts → lib/utils/_m7.ts → lib/utils/cifras-cierre.ts` | `git checkout -- lib/` + `rm lib/utils/_m7.ts` |
| Borrar la excepción (`CierreBodegaService`, `CierresAdminService`) | 2 | camino no exceptuado por `:40` | copia de seguridad restaurada; `diff -q` igual |
| Añadir una excepción inexistente (`LiquidacionService`, `fecha-cr`) | 3 (entrada muerta, tope 2) | `excepcion muerta: …` | ídem |

Tras las cuatro: `git status --short` sin `lib/`, `_m7.ts` borrado.

## T7 — Cierre (parte local)

- `./init.sh` con la `DATABASE_URL` de `servi_slt175_desechable` en el entorno (el gate lo confirma:
  «DATABASE_URL viene del entorno; no se carga el .env») y `NODE_OPTIONS=--max-old-space-size=8192`
  (sin él, el typecheck del gate cayó por falta de memoria, no por un error de tipos):
  typecheck pasó, lint pasó, `test:rapido` verde (incluye las dos sql-real con 4 tests cada una y la
  guardia con 17), `== init OK ==`, `INIT_EXIT=0` escrito en el log.
- `git diff --name-only origin/dev -- lib/ app/ components/ db/`: vacío (0 archivos).
- **Abierto:** la línea del log de `gate-completo` en el CI del PR, con los dos archivos ejecutados y
  verdes (no saltados). Sin push en esta tanda: la anota quien abra el PR.

## Archivos

- `specs/SLT-175-pruebas-r621-r623-guardia-r631/requirements.md` — P1/P2 a D2/D3; tasks T1-T6 marcadas.
- `progress/features/SLT-175.md` — cambio del leader, incluido en el primer commit.
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` — siembra propia en la tx.
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts` — ídem.
- `tests/baseline-rojos.json` — salen las dos claves (8 líneas).
- `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts` — guardia R631 transitiva.
- `progress/impl_SLT-175.md` — esta bitácora.

## Mapa R → test

| R | Test |
|---|---|
| R670 | `cierre-desglose-por-tienda-sql-real.test.ts`: 4/0/0 en `servi_slt175_desechable` |
| R671 | `cierre-bodega-desglose-por-tienda-sql-real.test.ts`: 4/0/0 en la misma |
| R672 | los dos archivos, casos «identidades» y «CONTROL POSITIVO», literales sin cambios |
| R673 | los dos «CONTROL POSITIVO» + mutación de siembra (T4); falta de catálogo: lanzan `crearFksDeOrden`/`crearUsuarioDePrueba` y el `findFirst` de `en_reparto`, nombrándolo |
| R674 | casos «R6», «R6/R7», «R19 vs R20» e «identidades» + mutaciones (a) y (b) (T4) |
| R675 | `tests/baseline-rojos.json` sin las dos claves; `gate-cableado-arnes-v2.guardia.test.ts` (5 passed); `comparar-baseline-rojos.mjs` en `gate-completo` (CI) |
| R676 | guardia: «ningun camino de valor … (R676-R678)» sobre el árbol real + en memoria (a), (b), (d), (e), (f) |
| R677 | guardia, en memoria (c) |
| R678 | guardia: «la lista de excepciones solo encoge», «quitar una excepcion da rojo», en memoria (g) |
| R679 | guardia: contraprueba en memoria (a)-(g) y «el barrido no es vacuo» |

## Salidas

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → exit 0, sin salida.
- `pnpm exec eslint` de los tres archivos de test tocados → exit 0, sin salida.
- `vitest run` guardia R631 → 17 passed. Sql-real en la desechable → 2 files, 8 passed, 0 skipped.
- `./init.sh` → `== init OK ==`, `INIT_EXIT=0`.

## Incidencia

Al crear la base, un primer intento del script de un solo uso falló al parsear la URL del `.env`
(venía entre comillas simples) y el error de Node imprimió la URL en la salida de la herramienta. No
salió del entorno local ni se escribió en ningún archivo del repo. Se corrigió el script (sin
comillas y `try/catch` sin eco). Conviene rotar la contraseña de la base local si se considera
necesario.

## Veredicto

SLT-175 T1-T6 hechos y verificados en local sobre una base solo migrada; sin código de producción;
queda la línea del CI de T7 y borrar `servi_slt175_desechable`.
