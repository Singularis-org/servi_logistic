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

## Frontend

Tanda de pantalla (T6–T8), frontend_dev, 2026-11-17. Sin pantalla nueva: una acción por lote más en
`/ordenes`, con `Modal`, `ManifiestoResultado`, `BuscadorFiltros` y la página de recepción de la central
(«Recibir paquetes», `/ordenes/recibir`) que ya existían. El grafo no indexa el worktree: Grep/Read.

### Archivos

Producción:
- `app/(app)/ordenes/_components/RetirarACentralModal.tsx` (nuevo) — calco de `RutearSateliteModal`:
  confirmación con el número, una llamada a `retirarABodegaCentral`, toast, fase «resultado» con
  `ManifiestoResultado flujo="retiro_satelite"` y `onSuccess` al cerrar. Un no-`ok` va al canal de error
  del `Modal` (toast de `guiaDecisionErrorMessage`, diálogo abierto); en `conflict` lista además cada
  orden rechazada con un motivo de usuario (el valor interno del estado no se muestra).
- `app/(app)/ordenes/_components/OrdenesListado.tsx` — `case "en_bodega_satelite"` en `accionesDe`
  («Retirar a bodega central», primaria, única del estado), `abrirRetirarCentral` (solo las
  seleccionadas en `en_bodega_satelite`) y el montaje del modal.
- `lib/actions/ordenes-guia.ts` — fuera la anotación `@sin-superficie` de `retirarABodegaCentral`.
- `lib/types/order-status.ts` — `DESCRIPCION_ESTADO.en_ruta_bodega_central` = «El paquete va camino a la
  bodega central.» (D7).

Docs:
- `docs/ayuda/publico/rastreo-de-paquete.md` — el mismo literal (D7). La guía de integración de la API no
  se toca (D8).
- `specs/456-tooltip-estados/textos-aprobados.md` — la fila aprobada pasa al texto de D7, con una línea
  de enmienda: `tests/unit/types/descripcion-estado.test.ts` lee esa tabla del disco y si no, se ponía rojo.
- `docs/ayuda/oficina/ordenes.md` (la acción, cuándo usarla, recepción con el escáner y volver a
  rutear) y `docs/ayuda/satelite/en-bodega.md` (la central puede retirar lo del estante y desaparece).

Tests:
- `tests/components/RetirarACentralModal.test.tsx` (nuevo, 5 casos).
- `tests/components/OrdenesRetirarACentral.test.tsx` (nuevo, 6 casos; monta la página real y varía el rol).
- `tests/unit/types/order-status.test.ts` — caso R984 con el literal escrito a mano.
- `e2e/retiro-satelite-central.spec.ts` (nuevo) + su entrada en el proyecto `reparto` de
  `playwright.config.ts` (lo exige la guardia `e2e-sin-saltos`).

### Mapa R → test (pantalla)

| R | Test |
|---|---|
| R980 | `tests/components/OrdenesRetirarACentral.test.tsx` (maestro y admin la ven en `en_bodega_satelite`; adminTienda sin casilla ni acción; no sale en `en_bodega_central` ni en `en_ruta_bodega_central`; una sola llamada con el lote de dos satélites, R985) + `e2e/retiro-satelite-central.spec.ts` |
| R981 | `tests/components/RetirarACentralModal.test.tsx` (confirmación con el número; ok: una llamada, toast, manifiesto, `onSuccess` solo al cerrar; conflict: diálogo abierto con el motivo de cada orden; inexistente/borrada; forbidden) + E2E (manifiesto visible tras retirar) |
| R984 | `tests/unit/types/order-status.test.ts` (literal a mano) |
| R971, R977, R978 | además de los de la tanda de servidor, `e2e/retiro-satelite-central.spec.ts` en pantalla |

Sin test de pantalla: ninguno de los R de UI.

### Salidas reales

- `pnpm typecheck` → `tsc --noEmit`, exit 0.
- `pnpm lint` → `✖ 248 problems (0 errors, 248 warnings)`, exit 0; ninguno en los archivos tocados.
- vitest (desechable `servi_slt197_desechable`):
  - `RetirarACentralModal`, `OrdenesRetirarACentral`, `RutearSateliteModal`, `OrdenesRutearSatelite`,
    `order-status`, `descripcion-estado`, `superficie-de-uso.guardia` → `Test Files 7 passed (7)`,
    `Tests 96 passed (96)`.
  - Textos de estado y ayuda: guardias `ayuda-*` (4), `docs-marca-heredada`, `estado-con-info`,
    `nombres-estado-retirados`, `rastreo-hitos-exhaustivo` + los componentes que pintan el (i)
    (`EstadoInfo`, `RastreoDialogInfoEstado`, `MultiSelectFilterInfoEstado`, `PosOrderCardInfoEstado`,
    `ChatOrdenesListaInfoEstado`, `SateliteOrderCardInfo`, `AyudaDocumentoPage`) y
    `asistente/acotamiento-por-rol` → `Test Files 16 passed (16)`, `Tests 216 passed (216)`.
  - `e2e-sin-saltos.guardia` → `Tests 38 passed (38)`.
- E2E (base nueva `servi_slt197e_desechable`: crear + `db:seed` + `next build`, puerto 3047):
  - `e2e/retiro-satelite-central.spec.ts --project=reparto --retries=0 --repeat-each=2` → `6 passed (22.5s)`.
  - `e2e/recepcion-satelite.spec.ts e2e/asignacion-satelite.spec.ts --retries=0` → `2 passed (10.9s)`.

### Veredicto

Pantalla de SLT-197 «Retirar paquetes de una bodega satélite a la central» lista: acción, modal, textos,
ayuda y E2E en verde; ningún R de UI sin test.

## Cierre (T9.1)

Evidencia que reportó el coordinador el 2026-11-17. No la volví a ejecutar:
- Review OK, sin hallazgos mayores (`7fbf0433`).
- Gate local verde sobre `d38a0be7` (ya mezclado con `dev`): `INIT_EXIT=0`, 33/40 archivos.
- E2E tras rehacer el build, corridos por el reviewer: 5/5, y `dos-empresas-humo` 18/18.
