# SLT-197 «Retirar paquetes de una bodega satélite a la central» — implementación

## Backend

Tanda de servidor (T1–T5), backend_dev, 2026-11-17. Sin migración, sin webhooks, sin dinero (D2, D8).
El grafo de código no indexa este worktree: todo se exploró con Grep/Read.

### Archivos

Producción:
- `lib/types/order-status-transiciones.ts` — arista #73 `en_bodega_satelite -> en_ruta_bodega_central` (`ajuste_estado`, `maestro/admin`). Sin vuelta (D6).
- `lib/repositories/OrdenRepository.ts` — `retirarSateliteLote` (lectura + `updateMany` con el mismo `WHERE`: ids ∧ no borrada ∧ `en_bodega_satelite`; conteo exacto o rollback → `"conflicto"`; limpia mensajero, `asignado_at` y `fecha_reparto`; `appendCambioEstado` por orden). Clase interna `RetiroSateliteConflicto`.
- `lib/interfaces/repositories/IOrdenRepository.ts` — firma de `retirarSateliteLote`.
- `lib/interfaces/services/IGuiaAsignacionService.ts` — `RetirarSateliteInput`, `RetirarSateliteResultadoItem`, `RetirarSateliteServiceResult`, `retirarABodegaCentral`.
- `lib/services/GuiaAsignacionService.ts` — `retirarABodegaCentral` (rol → validación por orden → catálogo → repo).
- `lib/types/orden-guia.ts` — `retirarSateliteSchema`, `RetirarSateliteActionInput`, `RetirarSateliteResultadoItem`, `RetirarSateliteResult`.
- `lib/actions/ordenes-guia.ts` — Server Action `retirarABodegaCentral`, con `@sin-superficie` temporal: **la tanda de pantalla (T6) la quita** al montar el modal.
- `lib/types/manifiesto.ts` + `lib/services/ManifiestoService.ts` — flujo `retiro_satelite` (zona → central, responsable = quien retiró).

Tests:
- nuevos: `tests/integration/db/retiro-satelite-central.int.test.ts` (6 casos, Postgres real, siembra propia), `tests/unit/services/guia-asignacion-retiro-satelite.test.ts` (10 casos).
- tocados: `tests/fixtures/inventario-transiciones-140.ts` (#73, 60 aristas / 55 pares), `tests/unit/domain/order-status-transiciones.guardia.test.ts` (bloque R970 + recuentos literales), `tests/integration/db/455/caracterizacion/transiciones.test.ts` (lista literal 59 → 60), `tests/unit/repositories/orden-historial-cobertura.test.ts` (punto **#36**; `ajuste_estado` pasa a 2 puntos), `tests/integration/actions/ordenes-guia-action.test.ts` (R976 + ok + forbidden), `tests/unit/services/manifiesto-service.test.ts` (R982), `tests/integration/cotizacion-api-key.test.ts` (censo de escrituras), dobles de `IOrdenRepository` en `bulk-orden-service*.test.ts`, `orden-service.test.ts`, `rol-admin-satelite-authz.test.ts`.

Desviación del spec, anotada: `tasks.md` T2.1 decía «punto #35 (34 → 35)». En el archivo el mapa tenía 31 entradas y el #35 ya existía (ficha 398); el nuevo es **#36** y el mapa pasa a 32. Además `ajuste_estado` queda con dos productores (#11 y #36) y se declaró en `FAMILIAS_CON_VARIOS_PUNTOS`.

### Mapa R → test

| R | Test |
|---|---|
| R970 | `order-status-transiciones.guardia.test.ts` > «SLT-197 R970» (4 casos: legal, salidas enumeradas, `-> en_bodega_central` ilegal, vuelta ilegal) + `guia-asignacion-retiro-satelite.test.ts` (orden en `en_bodega_central` rechazada) |
| R971 | `retiro-satelite-central.int.test.ts` «R971/R972/R985» + `guia-asignacion-retiro-satelite.test.ts` «R971» |
| R972 | `retiro-satelite-central.int.test.ts` «R971/R972/R985» |
| R973 | `retiro-satelite-central.int.test.ts` «R973/R974 …mensajero_recogiendo_en_bodega» y «R973 …BORRADA» + `guia-asignacion-retiro-satelite.test.ts` «R973» |
| R974 | `retiro-satelite-central.int.test.ts` «R974: la satelite asigna…» (carrera real entre lectura y escritura) + unit «R974» |
| R975 | `guia-asignacion-retiro-satelite.test.ts` «R975» (adminSatelite, adminTienda, mensajero) + `ordenes-guia-action.test.ts` «R975» |
| R976 | `ordenes-guia-action.test.ts` «SLT-197 R976» (sin sesión, `[]`, no lista, no string, sin campo) |
| R977 | `retiro-satelite-central.int.test.ts` «R977/R978/R979/R983» |
| R978 | ídem (asignar → «orden de zona no-GAM»; rutear → ok) |
| R979 | ídem (control positivo antes; no aparece en tránsito ni recibida) |
| R982 | `manifiesto-service.test.ts` «SLT-197 R982 retiro_satelite» |
| R983 | `retiro-satelite-central.int.test.ts` «R977/R978/R979/R983» (conteo de 16 tablas de dinero/cierres antes y después) |
| R985 | `retiro-satelite-central.int.test.ts` «R971/R972/R985» + unit «R985» |
| R986 | `retiro-satelite-central.int.test.ts` «R986» (en tránsito y recibida se mueven; la del estante se retiene: 1) |
| R980, R981, R984 | Pantalla y texto: tanda T6+ (frontend), fuera de esta tanda |

### Salidas reales

Base: desechable `servi_slt197_desechable` (creada con `con-desechable.cjs … crear`, migraciones aplicadas), nunca la del `.env`.

- `pnpm run typecheck` → `TC_EXIT=0`, 0 errores.
- `pnpm exec eslint <17 archivos tocados>` → `LINT_EXIT=0`; 1 warning previo en `IOrdenRepository.ts:11` (`OrdenHistorialOrigenTipo` sin uso), no es de este cambio.
- `vitest run` de los 16 archivos de test tocados → `Test Files 16 passed (16)`, `Tests 591 passed (591)`.
- `retiro-satelite-central.int.test.ts --reporter=verbose` → `Tests 6 passed (6)` (ejecutados, no saltados).
- Guardias (`vitest run guard`) → `354 passed | 1 failed`: `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (4 casos). **Previo**: exige que `init.sh` llame a `scripts/verificar-dependencias.mjs` y el `init.sh` de HEAD (sync 2.14.0, `9aa7e060`) no lo hace; este cambio no toca `init.sh` ni `scripts/`.

### Mutaciones (sobre `retirarSateliteLote`, contra `retiro-satelite-central.int.test.ts`)

Copia del original en el scratchpad, mutación con script, test, restauración por copia y `cmp` (igual tras cada una).

| # | Mutación | Resultado |
|---|---|---|
| M1 | quitar `estatus: { value: "en_bodega_satelite" }` del `WHERE` | **rojo** 2/6: «R973/R974 …mensajero_recogiendo» y «R974 carrera» |
| M2 | quitar `deletedAt: null` del `WHERE` | **rojo** 1/6: «R973 …BORRADA» |
| M3 | quitar `id: { in: ordenIds }` del `WHERE` | **rojo** 2/6: «R971/R972/R985» (la vecina se movía) y «R986» |
| M4 | anular la comprobación de conteo (`if (false)`) | **rojo** 3/6: los tres casos de conflicto |

La acotación por empresa no está en este `WHERE`: la ponen la extensión de empresa y la RLS (design §5), sin SQL nuevo.

### Veredicto

Servidor de SLT-197 listo para la tanda de pantalla: typecheck y lint verdes, 591/591 en los tests tocados, 4/4 mutaciones muertas; queda la guardia de dependencias en rojo, que ya venía de HEAD.
