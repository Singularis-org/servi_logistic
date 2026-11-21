# SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre» — implementación

backend_dev · 2026-11-16 · rama `feature/SLT-176-cierre-bodega-sin-cifras-presentacion` · sin push.
MCP del grafo: no usado (el worktree no está indexado, como anotó el design); Grep/Read.

## Commits

| SHA | Task |
|---|---|
| `555d8915` | T1 servicio de solo lectura (`CierresBodegaSateliteDescargaService` + interfaz) |
| `862699b1` | T2 `CierreBodegaService` sin el método, sin `cifrasLote`, sin los dos imports; firma fuera de `ICierreBodegaService` |
| `2e7a8b28` | T3 la acción `listarCierresBodegaSolicitadosCompleto` usa el servicio nuevo |
| `423328a0` | T4 tests unitarios apuntados al servicio nuevo |
| `054ccae7` | T5 tests de integración apuntados al servicio nuevo |
| `cb9e8c74` | T6 guardia R631: excepciones `[]`, tope 0, contraprueba sobre el árbol real, bloque R696-R699 |
| (este) | T7 bitácora |

## Archivos

Producción (5): `lib/services/CierresBodegaSateliteDescargaService.ts` (nuevo),
`lib/interfaces/services/ICierresBodegaSateliteDescargaService.ts` (nuevo),
`lib/services/CierreBodegaService.ts`, `lib/interfaces/services/ICierreBodegaService.ts`,
`lib/actions/cierre-bodega.ts`. +168/−111.

Tests (8): `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`,
`tests/unit/services/{cierre-bodega-solicitados-modelo-nuevo-service,consolidacion-completo,cierres-filtro-folio}.test.ts`,
`tests/unit/actions/{cierre-bodega-descarga-action,cierre-bodega-cifras-cableado}.test.ts`,
`tests/integration/db/{cierres-bodega-cifras-lote-sql-real,deudas-d39-d40-modelo-nuevo}.test.ts`. +266/−80.

`git diff --name-only origin/dev`: nada de `db/`, ni `CierresAdminService.ts` ni `ICierresAdminService.ts` (R703, R704).

## Mapa R → test

| R | Test |
|---|---|
| R690 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «R384», «R480» (literales a mano); `consolidacion-completo.test.ts` (conjunto «seis», «MAX_FILAS … limite_excedido», «mismas filas que la página»); `cierres-bodega-cifras-lote-sql-real.test.ts` y `deudas-d39-d40-modelo-nuevo.test.ts` contra Postgres |
| R691 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «R389: pasa SU zona como alcance…» |
| R692 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «R480: la satélite recibe las cifras de la empresa en null» (5 claves `null`, sin `pagoEntregado`) |
| R693 | `consolidacion-completo.test.ts` «un rol sin acceso recibe forbidden ANTES…», «el adminSatelite SIN zona…»; `cierres-filtro-folio.test.ts` «R457: un folio imposible…» (camino «satélite · solicitados (archivo)») |
| R694 | `cierre-bodega-solicitados-modelo-nuevo-service.test.ts` «sin la lectura en lote y con un cierre nuevo -> lanza» |
| R695 | `cierre-bodega-descarga-action.test.ts` (los 6 tests del borde, el doble «seis» en `cierresBodegaSateliteDescargaService`) |
| R696 | guardia, bloque SLT-176: «R696: el servicio existe y NO es servicio de dinero», «R696: su constructor recibe SOLO los cuatro puertos de lectura» |
| R697 | guardia, bloque SLT-176: «R697: no importa por valor…» y «R697: contraprueba en memoria» (5 imports de escritura en rojo, `import type` en verde) |
| R698 | `cierre-bodega-cifras-cableado.test.ts` ««Solicitados»: el cuarto argumento es la lectura en lote real… CierreBodegaService no se construye (R698)» |
| R699 | guardia «R699: CierreBodegaService ni ICierreBodegaService tienen ya la descarga…»; `consolidacion-completo.test.ts` (conjunto «siete» y páginas en `CierreBodegaService`), `cierres-filtro-folio.test.ts`, `cierre-bodega-service.test.ts` sin cambios y en verde |
| R700 | guardia «la lista de excepciones solo encoge… tope es 0 (R700)» (`toEqual([])`, `toBe(0)` literal) y «el barrido no es vacuo…» (`barrido.caminos` `toEqual([])`) |
| R701 | guardia «contraprueba sobre el arbol real: CierreBodegaService con un import de vuelta (R701)» (control + 3 casos) |
| R702 | guardia «el barrido no es vacuo: sigue aristas y llega a ingreso-empresa (R679)» |
| R703, R704 | `git diff --name-only origin/dev` (arriba) |
| R705 | `git diff -U0 origin/dev -- tests/integration` sin ninguna línea `expect` cambiada (0); en `tests/unit` solo cambian los `expect` de `cierre-bodega-cifras-cableado.test.ts`, que es el test de R698 (constructor de 4 args, `argsSatelite` vacío) |

## Desviación del design (anotada)

- R701 caso 3 (import de `CierresBodegaSateliteDescargaService` desde `CierreBodegaService`): el design
  decía «exactamente un error»; da **dos**, uno por cada módulo prohibido al que llega el servicio nuevo
  (`→ CierresAdminService → cifras-cierre` y `→ cifras-bodega-descarga → cifras-cierre-bodega`). Es lo
  correcto del recorrido (anota cada módulo prohibido alcanzado); el test afirma las dos cadenas escritas
  a mano.
- R696 se prueba además en ejecución (tipos del constructor leídos del fuente y `length === 4`), no
  solo por typecheck.

## Mutaciones (todas revertidas con `git checkout --`; ninguna con `git stash`)

| # | Mutación | Resultado |
|---|---|---|
| G1 | `CierreBodegaService.ts` real: `import { cifrasBodegaDescarga } from "@/lib/services/cifras-bodega-descarga";` en la línea 1 | guardia ROJA, 6 fallos; «ningun camino…» con `camino a modulo prohibido (lib/services/CierreBodegaService.ts:1): lib/services/CierreBodegaService.ts → lib/services/cifras-bodega-descarga.ts → lib/utils/cifras-cierre-bodega.ts` |
| G2 | camino transitivo: `import "@/lib/utils/cifras-cierre";` en `lib/utils/rango-pagina.ts` (lo importa `CierreBodegaService`) | guardia ROJA, 6 fallos; `camino a modulo prohibido (lib/services/CierreBodegaService.ts:28): … → lib/utils/rango-pagina.ts → lib/utils/cifras-cierre.ts` |
| G3 | `TOPE_EXCEPCIONES = 1` | ROJO «la lista de excepciones solo encoge… tope es 0 (R700)» |
| mA | quitar `anularEmpresaSiNoCentral` (`.map((c) => c)`) | ROJO «R480: la satélite recibe las cifras de la empresa en null» (R692) |
| mB | `{ lectura: "zona", zonaId: "otra" }` | ROJO «R389: pasa SU zona como alcance…» (R691) |
| mC | quitar la comprobación de rol | ROJO «un rol sin acceso recibe forbidden ANTES de tocar el repositorio (R4)» (R693) |
| mD | quitar el corte del folio imposible | ROJO «R457: un folio imposible…» (R693) |
| mE | `conjunto.length > limite + 1` | ROJO «con MAX_FILAS entrega TODAS…» (R690) |
| mF | la acción construye `CierreBodegaService` en vez del servicio nuevo | ROJO cableado R698 |
| mG | la acción toma el doble de `cierreBodegaService` | ROJO 3 tests de `cierre-bodega-descarga-action.test.ts` (R695) |

## Salidas

- Typecheck `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0`, 0 errores.
- Lint `pnpm exec eslint <los 13 .ts tocados>` → `LINT_EXIT=0`, 0 errores, 1 warning previo
  (`deudas-d39-d40-modelo-nuevo.test.ts:206 '_soloDelLibro'`, no es de esta ficha).
- Tests tocados + `cierre-bodega-service.test.ts` con la base desechable `servi_slt176_desechable`:
  `Test Files 9 passed (9) · Tests 104 passed (104)`, sin saltados.
- Integración sola (`--reporter=verbose`): `Test Files 2 passed (2) · Tests 23 passed (23)`, 23 `✓`, 0 saltados.
- Guardia R631: `Tests 25 passed (25)`.
- `pnpm run test:guardias` (con la desechable): `Test Files 1 failed | 352 passed (353) · Tests 4 failed | 5223 passed | 1 skipped`.
  Los 4 rojos son `dependencias-declaradas-presentes.guardia.test.ts` (marcador de `init.sh`), deuda
  conocida **D73** en `progress/deudas.md`; `init.sh` no está en el diff.

## Abierto

- `./init.sh` y los E2E (`cierres-rediseno`, `cierre-bodega-satelite`, `--project=dinero`) no se corrieron
  aquí: por instrucción del leader los E2E los corre CI (`e2e (dinero)`) y el gate local lo cierra el leader.

Veredicto: la descarga de la satélite vive en un servicio de solo lectura, `CierreBodegaService` ya no llega a las cifras de presentación y la guardia R631 queda sin excepciones (tope 0); verde con mutaciones que lo matan.

## Cierre (leader, 2026-11-16)

- `./init.sh` (rápido) en el worktree con `.env` de dev: `INIT_EXIT=0`; tamaño 13/40 archivos, 279/1000 producción, 346/3000 tests.
- E2E de dinero (`cierres-rediseno`, `cierre-bodega-satelite`) y aislamiento: los corre CI en el PR #185 (`e2e (dinero)`, `e2e (aislamiento)`); su resultado queda en el PR y condiciona el aviso «listo para mergear».
- Review OK (`progress/review_SLT-176.md`). m2 (mover `anularEmpresaSiNoCentral` a util puro) y m3 (`design.md:111` dice un error, son dos) quedan para después del merge de SLT-125 (#161).
