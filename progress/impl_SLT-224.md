# impl SLT-224 — Retiro a central: recalcular la zona de la orden (backend)

backend_dev, 2026-11-19. Tareas T1, T2, T3, T4, T5, T6 y T8 de `specs/SLT-224-zona-al-retirar-a-central/tasks.md`.
T0, T7 y T9 no son de esta tanda (leader / pantalla).

Base de datos: desechable `servi_slt224_desechable` (Postgres local), `prisma migrate deploy` + `db:seed`,
exportada como `DATABASE_URL`/`DIRECT_URL` antes de cada vitest y de `./init.sh`. Ni `migrate reset` ni
`migrate dev`; nada contra producción. El schema de Prisma NO cambió (sin `prisma generate`).
MCP del grafo: no usado (worktree sin indexar, según design.md); todo por Grep/Read.

## Archivos

Nuevos:
- `lib/repositories/_shared/reconciliar-zona-ordenes.ts` — helper `reconciliarZonaDeOrdenes(tx, { distritoIds, ordenIds?, excluirEstados? }, actor)`, con `whereBaseElegible` movido sin cambios (+ `ordenIds` opcional).
- `db/migrations/20261121120000_slt224_zona_de_ordenes_en_central/migration.sql` y `down.sql`.
- `lib/types/actualizacion-zonas.ts`, `lib/interfaces/repositories/IActualizacionZonasRepository.ts`,
  `lib/repositories/ActualizacionZonasRepository.ts`, `lib/interfaces/services/IActualizacionZonasService.ts`,
  `lib/services/ActualizacionZonasService.ts`, `lib/actions/actualizacion-zonas.ts`.
- `tests/integration/db/recepcion-central-reconcilia-zona.int.test.ts`
- `tests/integration/db/zona-desalineada-central-migration.test.ts`
- `tests/integration/db/actualizacion-zonas.int.test.ts`
- `tests/unit/services/actualizacion-zonas-action.test.ts`

Modificados:
- `lib/repositories/ZonaRepository.ts` (llama al helper; fuera `whereBaseElegible` e imports muertos)
- `lib/repositories/OrdenRepository.ts` (`recibirEnBodegaCentral`: `distritoId` en la lectura + helper tras la transición)
- `lib/interfaces/repositories/IOrdenRepository.ts` (`opciones.reconciliaZona?`)
- `lib/services/RecepcionBodegaCentralService.ts` (`reconciliaZona` por arista: 138 `true`, 139 `false`)
- `lib/utils/estados-bodega-satelite.ts` (`ESTADOS_DEVOLUCION_SIN_RECONCILIAR`)
- `lib/modulos/reparto.ts` (la action nueva al núcleo; lo exige `modulos-reparto.guardia`)
- `docs/ayuda/oficina/ordenes.md` (recepción toma la zona del distrito + sección «Actualizar zonas»)
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`, `tests/unit/guards/zona-reconciliacion-no-retarifa.guardia.test.ts`
- `tests/unit/services/recepcion-bodega-central-service.test.ts`, `tests/unit/repositories/orden-repository.recepcion-bodega-central.test.ts`
- `tests/integration/db/retiro-satelite-central.int.test.ts` (caso R1705)
- `tests/integration/db/zona-sin-distritos.test.ts` (SLT-198/R1228 enmendado por R1700; ver desvíos)
- `tests/integration/db/orden-traspaso-migration.test.ts` (censo de migraciones posteriores: se añade la de SLT-224)
- `progress/impl_SLT-224.md`
- `specs/SLT-224-zona-al-retirar-a-central/tasks.md` (T1-T6 y T8 en `[x]`)

## Mapa R → test

| R | Test |
|---|---|
| R1700 | `recepcion-central-reconcilia-zona.int.test.ts` «R1700/R1703: recibir una orden desalineada…», «R1700: el ordenIds acota…»; `recepcion-bodega-central-service.test.ts` «SLT-224/R1700…»; `orden-repository.recepcion-bodega-central.test.ts` «SLT-224/R1700…» |
| R1701 | `recepcion-central-reconcilia-zona.int.test.ts` «R1701: %s conserva…» (cierre, entregado, rechazo, incidente) y «R1701: con %s SI cambia» (anulada, reprogramado) |
| R1702 | ídem «R1702: sin distrito, o con un distrito sin zona…»; unit repo «SLT-224/R1702/R1703…» |
| R1703 | ídem «R1700/R1703…» (actor), «R1703: segunda recepción y estado inválido…», «R1703: la carrera de verdad…»; `historial-accion-escrituras-cubiertas.guardia.test.ts` (entrada `recibe_tx` del helper + contraprueba del recortador) |
| R1704 | ídem «R1704: recibir una devolución…»; `recepcion-bodega-central-service.test.ts` «SLT-224/R1704…»; unit repo «SLT-224/R1704…» |
| R1705 | `retiro-satelite-central.int.test.ts` «SLT-224/R1705: retirar una orden cuyo distrito ya es de otra zona…» |
| R1706 | `zona-reconciliacion-no-retarifa.guardia.test.ts` «una sola implementación de la regla» (3 llamadores + archivo) con sus contrapruebas; `zona-reconciliacion-ordenes.test.ts`, `zona-central-guarda-y-rastro.test.ts`, `zona-pago-mensajero-rastro.test.ts`, `zona-repository.test.ts` verdes sin tocar |
| R1707 | `zona-reconciliacion-no-retarifa.guardia.test.ts` (helper sin escrituras de dinero, UPDATE solo `zonaId`); `recepcion-central-reconcilia-zona.int.test.ts` «R1707…»; `zona-desalineada-central-migration.test.ts` «R1707…» |
| R1708 | `zona-desalineada-central-migration.test.ts` «R1708/R1709…» (lista literal) |
| R1709 | ídem (matriz: estante, entregado, 3 devoluciones, borrada, distrito sin zona, cierre, gestión, alineada) |
| R1710 | ídem «R1710…» |
| R1711 | ídem «R1711…» |
| R1712 | ídem «R1712…» |
| R1713 | T9 (pantalla), fuera de esta tanda |
| R1714 | `actualizacion-zonas-action.test.ts` «SLT-224/R1714…» (sin sesión, adminSatelite, adminTienda, mensajero; maestro y admin) |
| R1715 | `actualizacion-zonas.int.test.ts` «R1715/R1719: la vista previa…»; `actualizacion-zonas-action.test.ts` (clasificación y agrupado puros) |
| R1716 | T9 (modal), fuera de esta tanda |
| R1717 | `actualizacion-zonas.int.test.ts` «R1717/R1718/R1719: confirmar…», «R1717: la regla se re-evalúa al confirmar…» |
| R1718 | ídem «R1717/R1718/R1719…» (resultado con saltadas y las demás actualizadas). La parte de pantalla (refrescar al cerrar) es T9 |
| R1719 | ídem (otra empresa intacta; alineada y distrito sin zona: «R1719: ni la alineada…») |

## Mutaciones (ejecutadas con un script que aplica, corre vitest, revierte y comprueba que revirtió)

T3 — `recepcion-central-reconcilia-zona.int.test.ts` (14 tests):
- M1 quitar `ordenIds` del `where` del helper → 1 rojo («el ordenIds acota»).
- M2 quitar `cierreDetalles: { none: {} }` del helper → 1 rojo («con cierre_detail conserva»).
- M3 llamar al helper antes del `updateMany` → 1 rojo («la carrera de verdad»).
- M4 `reconciliaZona: true` en la arista de devolución → 1 rojo («R1704»).

T4 — `retiro-satelite-central.int.test.ts`:
- M5 el retiro re-deriva la zona (UPDATE por `zona_distrito` tras la guarda) → 1 rojo («SLT-224/R1705»).

T5 — `zona-desalineada-central-migration.test.ts` (5 tests), medidas con la migración ya aplicada en la base:
- M6 sin `NOT EXISTS cierre_detail` → 3 rojos. M7 incluye `en_bodega_satelite` → 3 rojos.
- M8 sin `deleted_at IS NULL` → 3 rojos. M9 sin el corte de gestión → 3 rojos.
- M10 un solo lote para todas las empresas → 1 rojo (R1710). M11 el down pisa la zona cambiada → 1 rojo (R1711).
- M12 el down borra por orden y no por lote → 1 rojo (R1711). M13 el UPDATE toca otra columna → 1 rojo (R1707).

T8 — `actualizacion-zonas.int.test.ts` / `actualizacion-zonas-action.test.ts`:
- M14 quitar `excluirEstados` → 2 rojos. M15 quitar el filtro de empresa del SQL → 3 rojos.
- M18 quitar `esAccesoTotal` de la acción → 3 rojos.
- M19 quitar el estante de `noSeMueven` en el helper → 7 rojos (2 del botón + 5 de la 377).
- M16 «no releer tras escribir» (saltadas = la primera lectura) → SOBREVIVE (4/4 verdes). Es un mutante
  equivalente: la primera lectura ya ocurre dentro de la misma transacción y las saltadas salen de
  clasificar las filas, así que releer solo cambiaría algo si el `WHERE` del helper y `motivoDeSaltada`
  discreparan. Se deja la relectura (la pide design §3b.3) como defensa ante esa discrepancia.
- «Usar el resultado de la vista previa en vez de releer»: no hay forma textual de aplicarla, porque el
  repositorio no recibe nada de la vista previa. La cubre el test «R1717: la regla se re-evalúa al
  confirmar» (una orden que entra al estante y otra que aparece errada entre vista previa y confirmación).

T2 — guardias:
- M20 la recepción deja de llamar al helper → 1 rojo. M21 el botón registra `"orden_zona_reconciliada"` → 2 rojos.
- M22 el guardado de zona repite `cierreDetalles: { none` → 1 rojo. M23 `appendAccion` del helper con otro cliente → 1 rojo (guardia del histórico).
- M24 el UPDATE del helper toca `montoCobrar` → 1 rojo.

## Salidas

- `pnpm run typecheck` (NODE_OPTIONS=--max-old-space-size=8192): exit 0.
- `pnpm run lint`: exit 0, 0 errores (warnings preexistentes del repo; ninguno en los archivos nuevos).
- `pnpm run test:guardias`: 360 archivos, 5414 passed, 1 skipped, exit 0.
- Tests tocados (22 archivos, base desechable): 448 passed, exit 0.
- `prisma migrate deploy` → `db:rollback` → `migrate deploy` sobre la desechable: sin error.
- `./init.sh` (NODE_OPTIONS=--max-old-space-size=8192, base desechable exportada):
  - 1.ª corrida: INIT_EXIT=1 — rojo real en `orden-traspaso-migration.test.ts` (censo de migraciones posteriores sin la nueva). Arreglado.
  - 2.ª corrida: INIT_EXIT=1 — «Worker exited unexpectedly» de vitest (un worker murió; 99/100 archivos, ningún test rojo). Infra, no código.
  - 3.ª corrida: **INIT_EXIT=0**. typecheck, lint, test:rapido (7 tandas, todas verdes), guardias, migraciones con down.sql.
  - Aviso del gate: «el PR se acerca al tamaño máximo (27/40 archivos, 945/1000 líneas de producción, 1536/3000 de tests)». T9 (componente ~130 líneas) lo pasaría del tope de producción.
- Tests de migración que leen `db/migrations` (158 archivos, en 4 tandas): todos verdes.

## Desvíos del spec

1. **Esquema del respaldo**: `respaldo_slt224.orden_zona` en vez de `respaldo.slt224_orden_zona`. El esquema
   compartido `respaldo` lo retira SLT-76 y `slt76-retirar-respaldos-migration.test.ts` (R17) y
   `zona-distrito-unica-migration.test.ts` esperan poder borrarlo vacío; una tabla nuestra ahí los pone rojos
   en una base con la migración aplicada. El `down.sql` borra tabla y esquema propios.
2. **`opciones.reconciliaZona` opcional** (`reconciliaZona?: boolean`, ausente = no reconcilia) en
   `IOrdenRepository.recibirEnBodegaCentral`, no obligatorio: `recoleccion-recibida-libera-mensajero.int.test.ts`
   llama al repo directo con `{ liberaAsignacion: true }` y la tarea pide no tocarlo. El servicio siempre lo pasa.
3. **Guardia R1706 «nadie repite el corte»**: se mira el CUERPO de los tres métodos llamadores, no el archivo
   entero, para `cierreDetalles: { none`: `ZonaRepository.contarOrdenesVivasPorZona` (376/Q4) lo usa legítimamente
   para contar. El literal `"orden_zona_reconciliada"` sí se vigila en los tres archivos enteros.
4. **Archivos fuera de «Archivos esperados»**: `lib/modulos/reparto.ts` (la guardia de módulos exige la action
   nueva), `tests/integration/db/zona-sin-distritos.test.ts` (SLT-198/R1228 afirmaba justo el comportamiento
   viejo: «recibida en la central sigue siendo de Cartago hasta re-guardar»; R1700 lo enmienda) y
   `tests/integration/db/orden-traspaso-migration.test.ts` (censo de migraciones).
5. **`@sin-superficie`** en las dos Server Actions: la guardia de superficie exige montaje o anotación. Caduca
   sola cuando T9 monte el botón (la guardia obliga a quitarla entonces).
6. **Ayuda**: el texto evita los nombres de estado retirados («devueltas», «por devolver»), que la guardia 455 rechaza.
7. **Botón — distritos al helper**: se pasan los distritos de TODAS las órdenes con zona errada (no solo de las no
   saltadas); el `WHERE` del helper decide igual. Equivalente y sin inyectar el clasificador en el repositorio.

## Veredicto

VERDE: backend de SLT-224 «Retiro a central: recalcular la zona de la orden» hecho (T1-T6, T8), init.sh exit 0; falta T9 (pantalla) y T0/T7 del leader.
