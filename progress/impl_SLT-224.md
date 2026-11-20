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

## Ronda 2 (2026-11-19): merge de dev, E2E local y entrega en dos PR

- **Entrega:** dos PR de la misma ficha. PR 1 = T1-T6 y T8 (actions con `@sin-superficie`); PR 2 = T9, tras el merge del PR 1 (anotado en `tasks.md`).
- **Merge de `origin/dev`** (SLT-222 #248, SLT-220 #246): un conflicto, en `tests/integration/db/orden-traspaso-migration.test.ts` (censo de migraciones): se conservan las dos entradas.
- **Migración renombrada** a `20261121120000_slt224_zona_de_ordenes_en_central`: dev trajo `20261120120000_plan_beneficio` y SLT-221 (PR abierto) lleva `20261120120000_slt221_historial_correo_cedula`; la de SLT-224 compartía la marca `20261120120000`. Ahora es posterior a las dos por marca de tiempo. Solo estaba aplicada en bases desechables.
- **E2E local** (base desechable nueva `servi_slt224_e2e`: `migrate deploy` + seed; `next build` con `NEXT_PUBLIC_APP_URL`/`APP_BASE_URL` del puerto propio; `E2E_PUERTO=3061`, `E2E_STORAGE_PUERTO=54361`): **16 passed, 0 failed, 0 flaky** (exit 0).
  - `e2e/retiro-satelite-central.spec.ts`: 3/3 passed.
  - `e2e/recibir-paquetes.spec.ts`: 2/2 passed.
  - `e2e/zona-sin-distritos.spec.ts`: 1/1 passed.
  - Los 10 restantes son los de `plataforma-vacia` (dependencia de los proyectos): passed.
- El gate (`scripts/gate-proyecto.sh`) corre `prisma generate` en cada `init.sh`: con `node_modules` compartido, el cliente queda con el schema del último worktree que pasó el gate.

- `./init.sh` tras el merge (base `servi_slt224_e2e` exportada): **INIT_EXIT=0**.

## Ronda 3 (2026-11-19): arreglos de la review del PR 1 (`progress/review_SLT-224-pr1.md`)

- **B1** — nuevo caso en `zona-desalineada-central-migration.test.ts`, «R1708 (en su empresa)»: la empresa 2 mapea a una zona suya el MISMO distrito que las órdenes de la empresa 1 (una desalineada y una alineada en `en_bodega_central`). Se afirma que la desalineada toma la zona de SU empresa, que la alineada no cambia y que el respaldo tiene una fila por orden corregida.
  - **Mutación D** (quitar `zd.organizacion_id = o.organizacion_id` del JOIN de la migración), en una base desechable limpia (`servi_slt224_b1`): **1 rojo de 6**, el caso nuevo. El rojo llega como `SL017` «referencia a otra empresa: orden.zona_id -> zona»: sin el JOIN por empresa, la migración intenta poner a la orden de la empresa 1 la zona de la empresa 2 y el trigger de misma empresa de SL-17 aborta. Si el trigger no existiera, la aserción de zona y la del respaldo (fila duplicada) también caerían. En la base `servi_slt224_e2e` (con datos de E2E commiteados) la misma mutación da 6/6 rojos por el mismo SL017.
- **m1** — el mismo fixture en `actualizacion-zonas.int.test.ts` («R1719: con el MISMO distrito mapeado por la otra empresa…», sobre la vista previa). **Mutación G** (quitar el JOIN por empresa del SQL del botón): **1 rojo de 5**, el caso nuevo. El helper (Prisma) no tiene ese JOIN: lee `zona_distrito` por la transacción de empresa, con RLS en producción, igual que el guardado de zona desde la 366.
- **m2** — la sección «Actualizar zonas» de la ayuda sale de este PR (queda en `[ ]` en T9, PR 2; borrador en `a3c78989`). Se queda el párrafo de la recepción.
- **m4** — `design.md` §5.1, §5.3 y §6 (T11) nombran ya la tabla real `respaldo_slt224.orden_zona` y el esquema propio.
- **m5** — `requirements.md`: una línea junto a la enmienda a R977 sobre el cambio en el camino de SLT-198/R1228.
- **Sin tocar, anotados:** m3 (T0 y T7 en `tasks.md` y `progress/features/SLT-224.md` son del leader) y m6 (`e2e/dos-empresas-humo.spec.ts` lo corre el check `e2e (aislamiento)` del CI).

- **Merge de `origin/dev` con SLT-221 #251** (`20261120130000_slt221_historial_correo_cedula`): un conflicto, en `orden-traspaso-migration.test.ts`, con las entradas de las dos ramas; la de SLT-224 (`20261121120000`) sigue siendo la última. `prisma generate` (el enum cambió). Base desechable NUEVA `servi_slt224_m2`, migrada desde cero + seed: tests de migraciones y del diff (163 archivos) verdes; `./init.sh` **INIT_EXIT=0** (una corrida previa a este merge dio un «Worker exited unexpectedly» de vitest, sin tests rojos; repetida, verde).

## Veredicto

VERDE: backend de SLT-224 «Retiro a central: recalcular la zona de la orden» hecho (T1-T6, T8), init.sh exit 0; falta T9 (pantalla) y T0/T7 del leader.

## PR 2 (2026-11-19): T12-T14 backend — PARADO antes del cierre

Base desechable NUEVA `servi_slt224_pr2` (create + `migrate deploy` + seed), exportada como `DATABASE_URL`/`DIRECT_URL`
antes de cada vitest. `prisma generate` corrido (el cliente compartido estaba atrasado respecto de SLT-215).

**Archivos:** `lib/utils/estados-bodega-satelite.ts` (clasificación), `lib/repositories/_shared/reconciliar-zona-ordenes.ts`
(corte nuevo, sin `excluirEstados`), `lib/repositories/ActualizacionZonasRepository.ts` (SQL `cobroEnCurso`),
`lib/types/actualizacion-zonas.ts`, `lib/services/ActualizacionZonasService.ts`; tests nuevos
`tests/unit/utils/clase-reconciliacion-zona.test.ts` (6) y `tests/integration/db/reconciliar-zona-corte-vivas.int.test.ts` (5);
ajustados `actualizacion-zonas.int.test.ts` (+1, R1727, motivos nuevos), `recepcion-central-reconcilia-zona.int.test.ts` (+1),
`actualizacion-zonas-action.test.ts` (motivos y precedencia).

**Mutaciones** (contra `reconciliar-zona-corte-vivas.int.test.ts`, 5 tests; ejecutados, no skipped):
1. `cierreDetalles: { none: {} }` → 5 rojos (matriz, R1707, los tres llamadores).
2. sin `{ cierreId: null }` en el `OR` → 1 rojo: se mueven las tres `gestion-*-sin-cierre`.
3. `not: "aprobado"` → `equals: "solicitado"` → 1 rojo: se mueven `cd-rechazado`, `cd-vencido`, `gestion-entregado-cierre-rechazado`.
4. `incidente: "se_mueve"` → 1 rojo: se mueve `finalizada-incidente`.
5. `reprogramado: "se_mueve"` → 1 rojo: se mueve `estado-reprogramado`.
6. `notIn` = `ESTADOS_PAQUETE_EN_ESTANTE` → 1 rojo: se mueven 7 estados R1723 y las 3 finalizadas.
7. (R1727) quitar el `JOIN cierre_dia` del `cobroEnCurso` → 4 rojos en `actualizacion-zonas.int.test.ts`, incluido R1727.

**Mapa R → test:** R1720 corte-vivas (tres llamadores + matriz) y recepcion (+1); R1721/R1722/R1723/R1724 corte-vivas (matriz);
R1725 clase-reconciliacion-zona + typecheck; R1726 actualizacion-zonas-action + actualizacion-zonas.int; R1727 actualizacion-zonas.int.

**Regresión:** 366 (`zona-reconciliacion-ordenes`), `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro`, recepción R1701,
migración, retiro y guardias verdes sin tocar. **ROJO:** `tests/unit/repositories/zona-repository.test.ts` › «377/T4 ⭑ R2/R9: las
dos consultas comparten el `where` base» fija LITERAL `BASE_D1_ZA` (el corte de la 366) y `notIn: ["en_bodega_satelite"]`. El
spec decía que seguiría verde; pide cambiar la expectativa → parado, sin tocarlo.

**P4 sin aplicar:** la liberación (`LiberacionReprogramadaService:223`, `DevolucionSlaService:255`) decide bodega con
`resolverDestinoCierre(orden.zonaId)`, y el paquete está en la bodega del cierre (`cierre_dia.destino_zona_id` = zona del
mensajero, `CierreDiaService:984`). Moverles la zona los marcaría en la bodega de la zona nueva con el paquete en otra.

**Desbloqueo (leader):** el literal de 377/T4 se reescribe A MANO con el corte de D6 (`BASE_D1_ZA` y los 11 estados
del `notIn`), no derivado del helper. Mutaciones 2 y 5 contra él: 1 rojo cada una (61 tests). P4 queda por defecto.

## PR 2 (2026-11-20): T9 pantalla «Actualizar zonas» (frontend_dev)

Archivos:
- nuevo `app/(app)/ordenes/_components/ActualizarZonasButton.tsx` (botón + `Modal` compartido; `TEXTO_MOTIVO_SALTADA: Record<MotivoSaltada, string>` con los cinco textos de design §3b.5).
- `app/(app)/ordenes/_components/OrdenesListado.tsx` (prop `puedeActualizarZonas`, botón a la derecha de `RecibirPaquetesEntrada`, `onSuccess={handleSuccess}`).
- `app/(app)/ordenes/page.tsx` (`puedeActualizarZonas = esAccesoTotal(rol)`).
- `lib/actions/actualizacion-zonas.ts` (fuera las dos `@sin-superficie`).
- `docs/ayuda/oficina/ordenes.md` (sección «Actualizar zonas» desde a3c78989 con D6 y los cinco motivos; el párrafo de la recepción en la central ajustado a D6: conserva la zona solo con cobro en curso).
- nuevo `tests/components/ActualizarZonasButton.test.tsx` (17 tests).

Mapa R → test (`tests/components/ActualizarZonasButton.test.tsx`):
- R1713: «con el rol %s el botón se ve solo si es maestro o admin» (todos los `RolValue` con `esAccesoTotal`) y «sin permiso no pinta nada».
- R1715: «al pulsar pide la vista previa y pinta grupos, total y saltadas con motivo».
- R1716: «sin desalineadas dice que todas las zonas están al día» y «sin candidatas pero con saltadas».
- R1718: «confirmar muestra cuántas se actualizaron y las saltadas, y refresca solo al cerrar»; «cancelar no confirma ni refresca».
- R1726: «cada motivo sale con su texto en español llano».
- R1714 (pantalla): unauthenticated y forbidden en la vista previa (aviso, sin Confirmar) y forbidden al confirmar (toast, sin resultado ni refresco).

Mensaje vacío: sin grupos ni saltadas, «Todas las zonas están al día.» (pedido del leader); sin grupos pero con saltadas, el de design §3b.4 «No hay órdenes con la zona errada que se puedan actualizar.», porque «al día» sería falso.

Salidas:
- `vitest run tests/components/ActualizarZonasButton.test.tsx`: Test Files 1 passed, Tests 17 passed.
- `./init.sh` (DATABASE_URL a servi_slt224_pr2): typecheck paso, lint paso (0 errors), test:rapido paso, `INIT_EXIT=0`.

Veredicto: T9 hecha; botón, modal, ayuda y test verdes; sin E2E en T9 (los E2E van en T15).
