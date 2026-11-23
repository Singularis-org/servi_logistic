# impl — chore/e2e-geo-recepcion-central (E2E de la recepción en la central que re-deriva la zona)

Chore pedido por el humano, sin spec nuevo. Cubre SLT-224 «Retiro a central: recalcular la zona de
la orden» sobre la reconciliación de SLT-65 «geo jerárquica: consultas». Sin código de producción.

## Archivos
- `e2e/recepcion-central-reconcilia-zona.spec.ts` (nuevo)
- `playwright.config.ts`: el spec entra en el proyecto `reparto` (la matriz de `gate.yml` va por
  proyecto, `grupo: [aislamiento, reparto, dinero]`, sin lista de specs).

## R → test
| R | Test |
|---|---|
| R1700, R1703, R1707 | «la orden con distrito toma la zona de su distrito y no cambia nada más» |
| R1704, R1723 | «la devolución que vuelve a la central se recibe y conserva su zona» |
| R1702 | «la orden con cantón y sin distrito se recibe y conserva su zona» (comportamiento conocido, abierto) |
| R1705 | aserción del `beforeAll` (retirada, sigue con la zona de la satélite) |

Fuera: recibir con el cantón del distrito desactivado (ni SLT-65 ni SLT-224 lo definen: abierto).

## Verificación (base desechable `servi_logistic_e2e_recepcion_zona`, `E2E_PUERTO=3088`)
- E2E del spec: 3 passed (36.9 s), 3 passed (18.2 s), 3 passed (33.5 s); tras corregir el comentario
  del config, 3 passed (23.1 s).
- `pnpm run typecheck`: exit 0. `pnpm run lint`: 0 errores (249 avisos previos, ninguno del spec).
- `pnpm run test:guardias`: 362 archivos passed, 3 skipped; 5473 tests passed.

Trampa: un `)` en el comentario dentro de `specs(...)` corta el lector de la guardia
`e2e-sin-saltos` (`/\bspecs\s*\(([^)]*)\)/`) y deja sin proyecto los specs que siguen.

Veredicto: E2E verde y estable; sin bugs de la app.
