# impl SLT-211 «Histórico de acciones: registrar el retiro de paquetes de una satélite a la central»

Ruta directa, backend. Fecha: 2026-11-19. Base desechable: `servi_slt211_desechable`.

## Qué cambia
El retiro de SLT-197 (`GuiaAsignacionService.retirarABodegaCentral` → `OrdenRepository.retirarSateliteLote`)
deja, en su MISMA transacción y después de la guarda de conflicto, una acción
`ordenes_retiradas_a_central` en `historial_accion` (Histórico › Acciones).

- **Entidad `zona`** (la satélite; entidad que ya existía, sin ampliar `historial_accion_entidad`).
  `entidad_id` = id de la zona satélite: «qué le pasó a esta satélite» sale por el índice
  `(entidad_tipo, entidad_id)`.
- **Una fila por satélite del lote, todas con el mismo `lote_id`** (una sola llamada a `appendAccion`).
  El lote puede mezclar satélites (D9 de SLT-197); con una satélite, exactamente una fila.
- **Etiqueta** (`etiquetaDeRetiroSatelite`, en la fuente única `lib/types/historial-accion-etiquetas.ts`):
  «Cartago · 3 paquetes: 1001, 1002, 1003». Guías ordenadas; si no caben en 120, «…, … y M más».
  Sin guía cae a la remisión, como el resto de etiquetas de envío. Ningún dato del destinatario.
- **Actor** congelado con `resolverActorCongelado`. `monto`, `valor_anterior`, `valor_nuevo`: NULL.
- **Categoría «hace desaparecer algo»**: los paquetes salen del estante de la satélite; el retiro no toca
  dinero (R983 de SLT-197). Precedente: `gestion_fecha_reprogramacion_corregida`.
- **Label**: «Retiró paquetes de una satélite a la central» (verbo en pasado con la persona como
  sujeto, como todo `ACCION_LABELS`; lo leen la columna «Qué» y el filtro por tipo).
- **Conflicto**: el `throw` va antes del `appendAccion` y revierte la transacción: cero filas.

## Archivos
- `db/migrations/20261119120000_historial_accion_ordenes_retiradas_a_central/{migration,down}.sql` (nuevo;
  `ADD VALUE IF NOT EXISTS`; down con la función dinámica de SLT-94 renombrada `_slt211`).
- `db/schema.prisma` (valor del enum).
- `lib/types/historial-accion.ts` (tipo, categoría, label).
- `lib/types/historial-accion-etiquetas.ts` (`etiquetaDeRetiroSatelite`).
- `lib/repositories/OrdenRepository.ts` (`retirarSateliteLote`: select ampliado + `appendAccion`).
- `lib/interfaces/repositories/IOrdenRepository.ts` (doc).
- Tests: `tests/integration/db/retiro-satelite-central.int.test.ts` (4 casos nuevos),
  `tests/unit/historial-accion/catalogo-y-choke-point.test.ts` (2 casos nuevos + conteos 86 / 12),
  `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` (censo + 86),
  `tests/unit/historial-accion/lectura-borde-y-servicio.test.ts` (12 + 12),
  `tests/integration/db/orden-traspaso-migration.test.ts` (lista de migraciones),
  `tests/integration/db/caja-459-migration.test.ts` y los 7 `*-migration.test.ts` con lista
  `POSTERIORES` (el valor nuevo va detrás, como hizo SLT-94).

## Entorno
`node_modules` del worktree era un junction al del repo raíz. Para no pisar el cliente Prisma de los
otros tres worktrees en vuelo (memoria «node_modules compartido y Prisma»), se quitó el junction
(`rmdir`, sin borrar el destino) y se hizo `pnpm install --frozen-lockfile --prefer-offline` propio.
`prisma generate` solo corrió contra ese `node_modules` propio.

## Mapa requisito → test
| Requisito (ficha) | Test |
|---|---|
| Un retiro de 3 órdenes deja 1 acción con actor, satélite y conteo | `retiro-satelite-central.int.test.ts` › «SLT-211: un retiro de 3 ordenes de una satelite deja EXACTAMENTE 1 accion…» |
| Lote mixto: una por satélite, mismo `lote_id` | ídem › «…mezcla dos satelites…» |
| Conflicto = 0 acciones | ídem › «…en conflicto (carrera en el WHERE)…» (con control positivo) y «el repo en conflicto…» |
| Todo tipo tiene label / filtro | `catalogo-y-choke-point.test.ts` › «SLT-211: … tiene label…» + `Record` exhaustivo (typecheck) |
| Etiqueta dentro de 120 con «y M más» | `catalogo-y-choke-point.test.ts` › «SLT-211: la etiqueta del retiro…» |
| Escritura en la misma tx | `historial-accion-escrituras-cubiertas.guardia.test.ts` › entrada `retirarSateliteLote` |

## Rojo antes del arreglo (test primero)
`vitest run tests/integration/db/retiro-satelite-central.int.test.ts` sin el arreglo:
`Tests 3 failed | 7 passed (10)` — «expected [] to have a length of 1 but got +0» (3 órdenes),
«expected [] to have a length of 2» (mixto), «control positivo… expected [] to have a length of 1» (conflicto).
Con el arreglo: `Tests 10 passed (10)`.

## Mutación
Cambiar `await appendAccion(` por un no-op `await (async (..._x: unknown[]) => {})(` en
`retirarSateliteLote` y correr el int + la guardia: `Tests 4 failed | 102 passed (106)` — la guardia
(«retirarSateliteLote registra su accion en la misma transaccion») y los 3 casos SLT-211 con filas.
Restaurado con `git checkout -- lib/repositories/OrdenRepository.ts`.

## Tests tocados (selección relacionada, 66 archivos)
`Tests 2 failed | 1123 passed (1125)`; los 2 rojos son `abono-tienda-457-migration` y
`wallet-461-migration`, ya en `tests/baseline-rojos.json` (su rojo es previo: `slice(-6,-4)` y las
categorías de wallet, no este valor).

## typecheck / lint
`tsc --noEmit`: 0. `eslint` sobre los archivos tocados: 0 errores (1 warning previo en `IOrdenRepository.ts:11`).

## Gate
`bash ./init.sh` (rápido) vía `con-desechable`, log completo, tres corridas: **INIT_EXIT=1 en las tres**,
siempre por `test:rapido` y nunca por un test de esta ficha (typecheck, lint, guardias y validadores en verde):
1. `premio-ranking-devengo-migration` y `ruta-primera-pendiente-dos-empresas-sql-real`: «Test timed out in
   20000ms» bajo carga; aislados, `Tests 35 passed (35)`.
2. `477-ordenes-en-correccion-sql-real`: timeout de 20 s; aislado, `Tests 1 passed (1)`.
3. `demo-qa.test.ts`: `Tests 12 failed | 2 passed (14)`, «FALLÓ la demo en empresa A › dinero ›
   WalletEgresoService.registrarEgreso(pago_plataforma) … validation_error (monto)». **Fuera de esta
   ficha**: se reprodujo idéntico con `git stash push -- lib db/schema.prisma` (código de `dev` sin
   SLT-211) y la receta de la demo no llama al retiro. Parece depender del reloj (cierre de factura de la
   plataforma con la hora de la base, ~01:00 CR). No se añadió al baseline: lo decide el leader.

Migración aplicada a `servi_slt211_desechable` con `prisma migrate deploy`:
«Applying migration `20261119120000_historial_accion_ordenes_retiradas_a_central`… All migrations have
been successfully applied.»

## SLT-198
El «retiro masivo» de SLT-198 «zona sin distritos» no tiene camino propio: vaciar una satélite
(`ZonaRepository.update` sin distritos) no mueve órdenes; su estante se retira con la acción de SLT-197
(R1227, D4 de `specs/SLT-198-zona-sin-distritos/requirements.md`), que pasa por este mismo método. Queda
cubierto.

## Veredicto
Hecha y probada (rojo → verde, mutación roja); el gate rápido sale ROJO solo por `demo-qa`, que también falla sin este cambio.
