# impl SLT-151 «Total a cobrar del mensajero sin lo ya cerrado»

backend_dev, 2026-11-13. Ruta directa (bug, sin spec). El grafo no se consultó: todo con Grep/Read.

## Causa (confirmada)
`totalACobrar` = COD en mano + `GestionOrdenRepository.sumMontoCobrarGestionadas`, cuyo `where`
(`gestionadasDelDiaWhere`) exigía una gestión vigente de HOY sin mirar su cierre. Una entregada de hoy
cuyo cierre ya estaba `solicitado` o `aprobado` seguía sumando: medido 8 000 en los dos casos.

## Regla
- Gestión de hoy en un cierre `solicitado` o `aprobado` → no cuenta (dinero declarado/entregado).
- Sin cierre, o en cierre `rechazado`/`vencido` → cuenta. Evidencia: el rechazo NO desvincula la
  gestión (conserva `cierre_id`; `CierreDiaRepository.resolicitarCierreRechazado` re-solicita el mismo
  cierre; solo el deshacer pone `cierre_id = NULL`). Por eso el filtro mira el ESTADO del cierre.
- Se conserva lo del comentario largo: sigue sin filtro de `resultado` y la disjunción con `porCobrar`
  no cambia (la condición nueva solo estrecha este sumando).
- `OR` explícito `{ cierreId: null } | { cierre: { estado: { notIn } } }` dentro de `gestiones.some`
  (mismo patrón que `whereGestionPendiente`); sin la rama `null` se perdía la gestión sin cierre (M3).

## Archivos
- `lib/repositories/GestionOrdenRepository.ts` — `ESTADOS_CIERRE_YA_DECLARADO` + condición en `gestionadasDelDiaWhere`; doc del método.
- `lib/interfaces/repositories/IGestionOrdenRepository.ts` — contrato de `sumMontoCobrarGestionadas`.
- `lib/interfaces/services/IMisAsignacionesService.ts` — contrato de `totalACobrar`.
- `lib/services/MisAsignacionesService.ts` — comentario del cálculo del KPI.
- `tests/integration/db/total-a-cobrar-sin-cerrado-sql-real.test.ts` (nuevo) — Postgres real, flujo real
  (gestionar → solicitarCierre → aprobar/rechazar). Crea su mundo en la tx revertida (`crearFksDeOrden`,
  zona central si no hay) y LANZA si no hay base o falta un catálogo; no depende de órdenes sembradas.
- `tests/unit/repositories/gestion-orden-repository.test.ts` — el literal del `gestiones.some` gana la rama nueva.

## Mapa caso → test (ruta directa, sin R<n>)
| Caso | Test |
|---|---|
| Sin cierre: cuenta | `total-a-cobrar-sin-cerrado-sql-real` › «sin cierre» |
| Cierre solicitado: no cuenta | › «cierre solicitado» |
| Cierre aprobado: no cuenta (Preview) | › «cierre aprobado» |
| Cierre rechazado: cuenta, gestión sigue vinculada | › «cierre rechazado» |
| Forma del `where` | `gestion-orden-repository.test.ts` › «cuenta la gestion del dia con CUALQUIER resultado» |

## Evidencia (base desechable `slt151_wt`, migrada + catálogos, sin órdenes)
- ROJO contra el código anterior: `Tests 2 failed | 2 passed (4)`, EXIT=1 — solicitado y aprobado:
  `AssertionError: expected 8000 to be +0`.
- VERDE con el arreglo: `Tests 4 passed (4)`, EXIT=0.
- Mutaciones (restaurado con `cmp`):
  - M1 quitar la condición nueva → 2 failed (solicitado, aprobado), EXIT=1.
  - M2 añadir `rechazado` a la lista → 1 failed (rechazado), EXIT=1.
  - M3 quitar la rama `cierreId: null` → 3 failed (sin cierre, solicitado, aprobado), EXIT=1.
- `npx tsc --noEmit` → TSC_EXIT=0.
- `npx eslint <6 tocados>` → ESLINT_EXIT=0 (1 warning previo: import sin uso en la línea 8 del test unitario, no es de este cambio).
- `npx vitest related --run <6 tocados>` → RELATED_EXIT=1: `Test Files 79 failed | 118 passed (197)`,
  `Tests 1927 passed | 434 skipped`, **0 tests fallidos**. Los 79 archivos caen en `beforeAll` por la base
  vacía (74× «tabla `orden` vacia», 4× variantes, 18× `TypeError ... 'prisma'` del `afterAll` en cascada)
  y 1× `referencia a otra empresa` en `455/caracterizacion/filtro-ordenes-por-estado`, que con el código
  anterior también cae («tabla `orden` vacia», BASE_EXIT=1). Ninguno toca este `where`.

## Veredicto
Arreglo en el `where` del repositorio, reproducido en rojo y medido en verde contra Postgres con tres mutaciones; el gate completo queda al leader.
