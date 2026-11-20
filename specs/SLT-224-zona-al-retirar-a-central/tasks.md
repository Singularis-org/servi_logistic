# SLT-224 — Tasks

> Antes del primer gate: copiar `.env` al worktree (sin `.env`, el gate se salta la integración) y
> exportar la base desechable antes de cualquier `vitest`. Cada prueba de `tests/integration/db/` se
> mata con una mutación antes de darla por buena, y el rojo queda anotado en `progress/impl_SLT-224.md`.

## T0 — Conteo en producción (leader, solo lectura) — antes del PR

- [x] Correr la consulta de `design.md §6` contra producción (`.env.prod`, `SET default_transaction_read_only = on`).
  *(Hecho por el leader el 2026-11-19, `progress/features/SLT-224.md > Producción`: 73 + 18 corregidas
  a mano con respaldo; re-medido después, 1 desalineada nueva `en_ruta_bodega_central` con cierre
  previo, que el PR 2 corrige al recibirla si su cierre está aprobado.)*
- **Hecho:** números anotados en `progress/features/SLT-224.md`. Tras la corrección a mano del
  2026-11-19 se esperan 0 candidatas elegibles en la empresa evidenciada (más lo que haya aparecido
  desde entonces) y exactamente las 18 guías de P2 como excluidas. Si se cumple alguna de las
  condiciones de parada de `design.md §6`, se para y decide Carlos antes de abrir el PR.
- Se repite el día del paso a producción.

## T1 — Helper compartido (R1706) — sin dependencias

- [x] Crear `lib/repositories/_shared/reconciliar-zona-ordenes.ts` moviendo `whereBaseElegible` y el
  bloque de reconciliación de `ZonaRepository.update` (`design.md §2.1`), con `ordenIds` opcional.
- [x] `ZonaRepository.update` llama al helper. Se quitan de `ZonaRepository.ts` los imports que dejan
  de usarse.
- **Hecho:** `tests/integration/db/zona-reconciliacion-ordenes.test.ts`,
  `tests/integration/db/zona-central-guarda-y-rastro.test.ts`,
  `tests/integration/db/zona-pago-mensajero-rastro.test.ts` y
  `tests/unit/repositories/zona-repository.test.ts` verdes **sin cambiar ninguna expectativa**.
  Typecheck verde.

## T2 — Guardias reapuntadas (R1703, R1706, R1707) — depende de T1

- [x] `historial-accion-escrituras-cubiertas.guardia.test.ts`: recortador que acepta
  `export async function`, con su contraprueba; entrada de `orden_zona_reconciliada` →
  helper/`recibe_tx`.
- [x] `zona-reconciliacion-no-retarifa.guardia.test.ts`: detector sobre el cuerpo del helper; nuevas
  aserciones de `design.md §2.3` (los tres llamadores usan el helper; la aserción del tercero entra con T8 y ningún repositorio repite el
  corte ni la acción), cada una con su contraprueba en memoria.
- **Hecho:** `pnpm run test:guardias` verde, y cada aserción nueva cae con su cuerpo mutado.

## T3 — Recepción en la central (R1700–R1704, R1707) — depende de T1

- [x] `IOrdenRepository.recibirEnBodegaCentral`: `opciones.reconciliaZona`.
- [x] `RecepcionBodegaCentralService.TRANSICIONES`: `reconciliaZona` (`true` en la arista 138, `false`
  en la 139), pasado al repositorio.
- [x] `OrdenRepository.recibirEnBodegaCentral`: `distritoId` en la lectura y llamada al helper después
  de `appendCambioEstado` (`design.md §3.2`).
- [x] Ajustar `tests/unit/services/recepcion-bodega-central-service.test.ts` (la bandera por arista) y
  `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts` (doble de `tx`).
- [x] Nuevo `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts` (`design.md §7.1`).
- **Hecho:** los tres verdes, más `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`
  sin cambios. Las cuatro mutaciones de `design.md §7.1` ponen la integración en rojo.

## T4 [P] — Retiro sin cambio de zona (R1705) — sin dependencias

- [x] Caso nuevo en `tests/integration/db/retiro-satelite-central.int.test.ts` (`design.md §7.3`).
- **Hecho:** verde. Si se añade una línea que cambie la zona en `retirarSateliteLote`, cae.

## T5 [P] — Corrección única (R1708–R1712) — sin dependencias de código

- [x] `db/migrations/20261121120000_slt224_zona_de_ordenes_en_central/migration.sql` y `down.sql`
  (`design.md §5`). Si al implementar ya hay una migración posterior en `dev`, se ajusta la marca de
  tiempo antes de mergear, nunca después de aplicada.
- [x] Nuevo `tests/integration/db/zona-desalineada-central-migration.test.ts` (`design.md §7.2`), con
  la lista de ids esperada escrita literal.
- **Hecho:** test verde; `pnpm run db:migrate` y `pnpm run db:rollback` en la base desechable sin error;
  la corrección y su reversión dejan la base como estaba (comparación de `orden.zona_id` y conteo de
  `historial_accion`).

## T6 [P] — Ayuda — sin dependencias

- [x] `docs/ayuda/oficina/ordenes.md`, «Retirar a bodega central»: «quedan En bodega central con su
  zona de siempre» pasa a decir que, al recibirlas, toman la zona de su distrito (si el distrito se
  pasó a otra zona mientras estaban en la satélite, ya llegan con la nueva). Sin glifos ni símbolos.
- [x] (Movido a T9, PR 2, por la review del PR 1: el botón no existe hasta entonces.) Mismo archivo: un párrafo para «Actualizar zonas» (qué busca, qué se salta y por qué, y que deja
  rastro en el histórico de acciones).
- **Hecho:** texto revisado contra R1700, R1705 y R1713–R1718.

## T8 — «Actualizar zonas»: backend (R1714, R1715, R1717–R1719) — depende de T1

- [x] `ESTADOS_DEVOLUCION_SIN_RECONCILIAR` en `lib/utils/estados-bodega-satelite.ts` y `excluirEstados`
  en el helper (`design.md §2.1`).
- [x] `lib/types/actualizacion-zonas.ts`, `IActualizacionZonasRepository` + `ActualizacionZonasRepository`,
  `IActualizacionZonasService` + `ActualizacionZonasService`, `lib/actions/actualizacion-zonas.ts`
  (`design.md §3b.2-§3b.3`).
- [x] `tests/integration/db/actualizacion-zonas.int.test.ts` y
  `tests/unit/services/actualizacion-zonas-action.test.ts` (`design.md §7.4`).
- **Hecho:** los dos verdes; las tres mutaciones de `design.md §7.4` dan rojo; T1 sigue verde (el
  `where` del guardado de zona no cambia sin `excluirEstados`).

## T9 — «Actualizar zonas»: pantalla (R1713, R1715, R1716, R1718) — depende de T8

> **Entrega (leader, 2026-11-19):** SLT-224 sale en DOS PR de la misma ficha. El PR 1 lleva T1-T6 y
> T8, con las dos Server Actions aún anotadas `@sin-superficie`. Esta tarea, T9, va en el **PR 2**,
> después del merge del PR 1; al montar el botón se quita la anotación.

- [x] `app/(app)/ordenes/_components/ActualizarZonasButton.tsx` (botón + `Modal` compartido,
  `design.md §3b.4`).
- [x] `OrdenesListado.tsx`: prop `puedeActualizarZonas` y el botón a la derecha de
  `RecibirPaquetesEntrada` en `header`, con `onSuccess={handleSuccess}`. `app/(app)/ordenes/page.tsx`:
  `puedeActualizarZonas = esAccesoTotal(rol)`.
- [x] `tests/components/ActualizarZonasButton.test.tsx`.
- [x] Ayuda: la sección «Actualizar zonas» de `docs/ayuda/oficina/ordenes.md` (qué busca, qué se salta y por qué, y que deja rastro en el histórico de acciones), con el texto ajustado a la decisión de Carlos sobre P2. Sale del PR 1 por la review (m2); el borrador está en el commit `a3c78989`.
- **Hecho:** test de componente verde; en local, con maestro, el botón aparece junto a «Recibir
  paquete», la vista previa coincide con la base y al confirmar el listado se refresca. Con
  `adminSatelite` el botón no aparece.

## T7 — Cierre del PR 1 — depende de T1–T6 y T8

- [x] `./init.sh` verde. Como el diff toca `db/`, correr en local los E2E que cubren la recepción en
  la central y el retiro (`grep -rl` en `e2e/` por `recepcion` y `retirar`) con base desechable nueva.
  *(`progress/impl_SLT-224.md > Ronda 2`: E2E 16 passed; `INIT_EXIT=0` tras el merge y tras la review.)*
- [x] `progress/impl_SLT-224.md` con el mapa `R<n> → test` (tabla de `requirements.md > Trazabilidad
  prevista`) y las mutaciones con su rojo.
- [x] T0 re-medido (lo hace el leader) antes de abrir el PR.
- **Hecho:** PR 1 (#253) mergeado en dev y en prod. T9 pasó al PR 2 (abajo).

---

# PR 2 — corte de P2 (D6) y botón «Actualizar zonas» en pantalla

> Rama: la misma, tras `git merge origin/dev` con el PR 1 dentro. Mismas reglas de la cabecera:
> `.env` copiado, base desechable exportada antes de cualquier `vitest`, y cada prueba de
> `tests/integration/db/` matada con una mutación antes de darla por buena. P4 está abierta: se
> implementa el valor por defecto (`reprogramado` y `novedad` no se mueven); si Carlos responde otra
> cosa antes del merge, solo cambia la fila de la clasificación y sus casos de test.

## T0b — Conteo del corte nuevo en producción (leader, solo lectura) — antes del PR 2

- [x] Consulta T0b de `design.md §6`. Números por empresa y estado en `progress/features/SLT-224.md`. Medido por el leader el 2026-11-20.
- **Hecho:** anotado; si sale una condición de parada de `design.md §6 > T0b`, para y decide Carlos.
  Se repite el día del paso a producción.

## T12 — La clasificación de estados (R1721, R1723, R1725) — sin dependencias

- [x] `lib/utils/estados-bodega-satelite.ts`: `ClaseReconciliacionZona`, `CLASE_RECONCILIACION_ZONA`
  (`Record<OrderStatusValue, …>`, la tabla de `design.md §2.4`), `ESTADOS_QUE_NO_SE_MUEVEN` derivada;
  `ESTADOS_DEVOLUCION_SIN_RECONCILIAR` derivada de la clase `devolucion` (sale `devuelta_a_tienda`,
  entra `devolucion_a_origen_por_rechazo`). `finalizada` se construye desde `ESTADOS_TERMINALES`.
- [x] Nuevo `tests/unit/utils/clase-reconciliacion-zona.test.ts` (`design.md §7.5 > Unit`).
- **Hecho:** test y typecheck verdes; quitar una clave del mapa rompe el typecheck.

## T13 — El corte nuevo en el helper (R1720–R1724, R1706, R1707) — depende de T12

- [x] `lib/repositories/_shared/reconciliar-zona-ordenes.ts`: `whereBaseElegible` con el corte de
  `design.md §2.4`; `notIn` de elegibles = `ESTADOS_QUE_NO_SE_MUEVEN`; el `count` del estante sin
  cambios; se quita `excluirEstados` de `AlcanceReconciliacion`. Comentarios de cabecera al día (D6).
- [x] `lib/repositories/ActualizacionZonasRepository.ts`: llamada sin `excluirEstados`.
- [x] Nuevo `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts` (`design.md §7.5`), con
  las seis mutaciones y su rojo en `progress/impl_SLT-224.md`.
- [x] Caso nuevo en `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts` (cierre
  aprobado anterior se mueve al recibir).
- [x] Si `zona-reconciliacion-no-retarifa.guardia.test.ts` no reconoce la forma nueva del corte, se
  ajusta el detector (no la regla) con su contraprueba.
- **Hecho:** los nuevos verdes; `zona-reconciliacion-ordenes.test.ts`, `zona-central-guarda-y-rastro.test.ts`,
  `zona-pago-mensajero-rastro.test.ts`, `zona-repository.test.ts` y los casos de R1701 verdes **sin
  cambiar ninguna expectativa** (si alguno lo pide, se para y se avisa al leader); `pnpm run test:guardias` verde.
  *(Enmienda 2026-11-19: `zona-repository.test.ts` › «377/T4 ⭑ R2/R9» sí cambia: fija literal el corte de
  la 366; se reescribió a mano con el corte de D6, con OK del leader. Ver `design.md §7.5 > Regresión`.)*

## T14 — Los motivos del botón (R1726, R1727) — depende de T12

- [x] `lib/types/actualizacion-zonas.ts`: `MotivoSaltada` con los cinco motivos; `FilaZonaErrada` con
  `cobroEnCurso` en vez de `conCierre`/`conGestion`.
- [x] `ActualizacionZonasRepository.sqlZonaErrada()`: `cobroEnCurso` con el SQL de `design.md §3b.5`.
- [x] `ActualizacionZonasService.motivoDeSaltada`: clase del estado, luego cobro en curso.
- [x] `tests/integration/db/actualizacion-zonas.int.test.ts`: motivos literales nuevos y el caso R1727
  con su mutación; `tests/unit/services/actualizacion-zonas-action.test.ts`: motivos y precedencia.
- **Hecho:** los dos verdes; la mutación del SQL de `design.md §7.5` da rojo en R1727.

## T9 — «Actualizar zonas»: pantalla (R1713, R1715, R1716, R1718, R1726) — depende de T14

Las casillas de T9 de arriba, con estos ajustes del PR 2:

- [x] Textos de los cinco motivos de `design.md §3b.5` (un `Record<MotivoSaltada, string>`).
- [x] Quitar las dos anotaciones `@sin-superficie` de `lib/actions/actualizacion-zonas.ts`.
- [x] Ayuda en `docs/ayuda/oficina/ordenes.md` desde el borrador de `a3c78989`, con la regla de D6
  (vivas sí, finalizadas no; qué se salta y por qué), sin glifos ni símbolos.
- **Hecho:** el de T9 de arriba.

## T15 — Cierre del PR 2 — depende de T0b, T12–T14 y T9

- [x] `./init.sh` verde con `.env` copiado y base desechable exportada (`INIT_EXIT=$?` dentro del log). Review PR 2 y tanda de B1: `INIT_EXIT=0`.
- [x] E2E locales de recepción en la central y retiro (`grep -rl` en `e2e/` por `recepcion` y
  `retirar`), base desechable nueva + `next build`. Review PR 2: 55/55 verdes.
- [x] `progress/impl_SLT-224.md > PR 2`: mapa R1720–R1727 → test y las mutaciones con su rojo.
- [ ] T0b re-medido por el leader antes de abrir el PR.
- **Hecho:** todo lo anterior, y el `head` del PR en GitHub igual al `HEAD` local antes del aviso.

## Después del merge

- **T11 (leader, solo lectura):** verificación de `design.md §6` tras el deploy a producción.
- Aprobación de Carlos en Preview: una orden desalineada en `en_ruta_bodega_central` se recibe con el
  escáner y queda con la zona de su distrito, asignable desde la central si esa zona es la central; y
  «Actualizar zonas» muestra la vista previa, salta las del estante, las devoluciones y las cerradas, y
  actualiza las demás.
- **PR 2, Preview con Carlos:** una orden viva con un cierre aprobado anterior y zona errada aparece
  en la vista previa y se actualiza; una entregada con zona errada sale como «finalizada»; una con un
  cierre sin aprobar sale como «cobro en curso». T11 repite la consulta T0b tras el deploy.

## Archivos esperados

PR 2 (los que toca la rama ahora):

- `lib/repositories/_shared/reconciliar-zona-ordenes.ts`
- `lib/utils/estados-bodega-satelite.ts`
- `lib/repositories/ActualizacionZonasRepository.ts`
- `lib/types/actualizacion-zonas.ts`
- `lib/services/ActualizacionZonasService.ts`
- `lib/actions/actualizacion-zonas.ts`
- `app/(app)/ordenes/_components/ActualizarZonasButton.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/ordenes/page.tsx`
- `docs/ayuda/oficina/ordenes.md`
- `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts`
- `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts`
- `tests/integration/db/actualizacion-zonas.int.test.ts`
- `tests/unit/utils/clase-reconciliacion-zona.test.ts`
- `tests/unit/services/actualizacion-zonas-action.test.ts`
- `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts`
- `tests/components/ActualizarZonasButton.test.tsx`
- `specs/SLT-224-zona-al-retirar-a-central/requirements.md`
- `specs/SLT-224-zona-al-retirar-a-central/design.md`
- `specs/SLT-224-zona-al-retirar-a-central/tasks.md`
- `progress/impl_SLT-224.md`
- `progress/features/SLT-224.md`

## Archivos del PR 1 (ya en dev, #253)

- `lib/repositories/_shared/reconciliar-zona-ordenes.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/services/RecepcionBodegaCentralService.ts`
- `db/migrations/20261121120000_slt224_zona_de_ordenes_en_central/migration.sql`
- `db/migrations/20261121120000_slt224_zona_de_ordenes_en_central/down.sql`
- `docs/ayuda/oficina/ordenes.md`
- `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts`
- `tests/integration/db/zona-desalineada-central-migration.test.ts`
- `tests/integration/db/retiro-satelite-central.int.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts`
- `tests/unit/services/recepcion-bodega-central-service.test.ts`
- `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts`
- `tests/unit/repositories/zona-repository.test.ts`
- `lib/utils/estados-bodega-satelite.ts`
- `lib/types/actualizacion-zonas.ts`
- `lib/interfaces/repositories/IActualizacionZonasRepository.ts`
- `lib/repositories/ActualizacionZonasRepository.ts`
- `lib/interfaces/services/IActualizacionZonasService.ts`
- `lib/services/ActualizacionZonasService.ts`
- `lib/actions/actualizacion-zonas.ts`
- `app/(app)/ordenes/_components/ActualizarZonasButton.tsx`
- `app/(app)/ordenes/_components/OrdenesListado.tsx`
- `app/(app)/ordenes/page.tsx`
- `tests/integration/db/actualizacion-zonas.int.test.ts`
- `tests/unit/services/actualizacion-zonas-action.test.ts`
- `tests/components/ActualizarZonasButton.test.tsx`
