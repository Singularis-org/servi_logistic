# SLT-224 — Tasks

> Antes del primer gate: copiar `.env` al worktree (sin `.env`, el gate se salta la integración) y
> exportar la base desechable antes de cualquier `vitest`. Cada prueba de `tests/integration/db/` se
> mata con una mutación antes de darla por buena, y el rojo queda anotado en `progress/impl_SLT-224.md`.

## T0 — Conteo en producción (leader, solo lectura) — antes del PR

- [ ] Correr la consulta de `design.md §6` contra producción (`.env.prod`, `SET default_transaction_read_only = on`).
- **Hecho:** números anotados en `progress/features/SLT-224.md`. Si se cumple alguna de las
  condiciones de parada de `design.md §6`, se para y decide Carlos antes de abrir el PR.
- Se repite el día del paso a producción.

## T1 — Helper compartido (R1706) — sin dependencias

- [ ] Crear `lib/repositories/_shared/reconciliar-zona-ordenes.ts` moviendo `whereBaseElegible` y el
  bloque de reconciliación de `ZonaRepository.update` (`design.md §2.1`), con `ordenIds` opcional.
- [ ] `ZonaRepository.update` llama al helper. Se quitan de `ZonaRepository.ts` los imports que dejan
  de usarse.
- **Hecho:** `tests/integration/db/zona-reconciliacion-ordenes.test.ts`,
  `tests/integration/db/zona-central-guarda-y-rastro.test.ts`,
  `tests/integration/db/zona-pago-mensajero-rastro.test.ts` y
  `tests/unit/repositories/zona-repository.test.ts` verdes **sin cambiar ninguna expectativa**.
  Typecheck verde.

## T2 — Guardias reapuntadas (R1703, R1706, R1707) — depende de T1

- [ ] `historial-accion-escrituras-cubiertas.guardia.test.ts`: recortador que acepta
  `export async function`, con su contraprueba; entrada de `orden_zona_reconciliada` →
  helper/`recibe_tx`.
- [ ] `zona-reconciliacion-no-retarifa.guardia.test.ts`: detector sobre el cuerpo del helper; nuevas
  aserciones de `design.md §2.3` (los dos llamadores usan el helper y ningún repositorio repite el
  corte ni la acción), cada una con su contraprueba en memoria.
- **Hecho:** `pnpm run test:guardias` verde, y cada aserción nueva cae con su cuerpo mutado.

## T3 — Recepción en la central (R1700–R1704, R1707) — depende de T1

- [ ] `IOrdenRepository.recibirEnBodegaCentral`: `opciones.reconciliaZona`.
- [ ] `RecepcionBodegaCentralService.TRANSICIONES`: `reconciliaZona` (`true` en la arista 138, `false`
  en la 139), pasado al repositorio.
- [ ] `OrdenRepository.recibirEnBodegaCentral`: `distritoId` en la lectura y llamada al helper después
  de `appendCambioEstado` (`design.md §3.2`).
- [ ] Ajustar `tests/unit/services/recepcion-bodega-central-service.test.ts` (la bandera por arista) y
  `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts` (doble de `tx`).
- [ ] Nuevo `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts` (`design.md §7.1`).
- **Hecho:** los tres verdes, más `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`
  sin cambios. Las cuatro mutaciones de `design.md §7.1` ponen la integración en rojo.

## T4 [P] — Retiro sin cambio de zona (R1705) — sin dependencias

- [ ] Caso nuevo en `tests/integration/db/retiro-satelite-central.int.test.ts` (`design.md §7.3`).
- **Hecho:** verde. Si se añade una línea que cambie la zona en `retirarSateliteLote`, cae.

## T5 [P] — Corrección única (R1708–R1712) — sin dependencias de código

- [ ] `db/migrations/20261120120000_slt224_zona_de_ordenes_en_central/migration.sql` y `down.sql`
  (`design.md §5`). Si al implementar ya hay una migración posterior en `dev`, se ajusta la marca de
  tiempo antes de mergear, nunca después de aplicada.
- [ ] Nuevo `tests/integration/db/zona-desalineada-central-migration.test.ts` (`design.md §7.2`), con
  la lista de ids esperada escrita literal.
- **Hecho:** test verde; `pnpm run db:migrate` y `pnpm run db:rollback` en la base desechable sin error;
  la corrección y su reversión dejan la base como estaba (comparación de `orden.zona_id` y conteo de
  `historial_accion`).

## T6 [P] — Ayuda — sin dependencias

- [ ] `docs/ayuda/oficina/ordenes.md`, «Retirar a bodega central»: «quedan En bodega central con su
  zona de siempre» pasa a decir que, al recibirlas, toman la zona de su distrito (si el distrito se
  pasó a otra zona mientras estaban en la satélite, ya llegan con la nueva). Sin glifos ni símbolos.
- **Hecho:** texto revisado contra R1700 y R1705.

## T7 — Cierre — depende de T1–T6

- [ ] `./init.sh` verde. Como el diff toca `db/`, correr en local los E2E que cubren la recepción en
  la central y el retiro (`grep -rl` en `e2e/` por `recepcion` y `retirar`) con base desechable nueva.
- [ ] `progress/impl_SLT-224.md` con el mapa `R<n> → test` (tabla de `requirements.md > Trazabilidad
  prevista`) y las mutaciones con su rojo.
- [ ] T0 re-medido (lo hace el leader) antes de abrir el PR.
- **Hecho:** todo lo anterior, y el `head` del PR en GitHub igual al `HEAD` local antes del aviso.

## Después del merge

- **T11 (leader, solo lectura):** verificación de `design.md §6` tras el deploy a producción.
- Aprobación de Carlos en Preview: una orden desalineada en `en_ruta_bodega_central` se recibe con el
  escáner y queda con la zona de su distrito, asignable desde la central si esa zona es la central.

## Archivos esperados

- `lib/repositories/_shared/reconciliar-zona-ordenes.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/services/RecepcionBodegaCentralService.ts`
- `db/migrations/20261120120000_slt224_zona_de_ordenes_en_central/migration.sql`
- `db/migrations/20261120120000_slt224_zona_de_ordenes_en_central/down.sql`
- `docs/ayuda/oficina/ordenes.md`
- `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts`
- `tests/integration/db/zona-desalineada-central-migration.test.ts`
- `tests/integration/db/retiro-satelite-central.int.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts`
- `tests/unit/services/recepcion-bodega-central-service.test.ts`
- `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
