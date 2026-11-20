# impl SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de reenviarlo»

## Tanda 1 — Esquema e historial (backend_dev, 2026-11-20)

T1.1–T1.4 de `specs/SLT-247-cierre-rechazado-gestiona-sin-gestion/tasks.md`. Sin productor todavía: llega
en la Tanda 2 del mismo PR.

### Archivos

Producción:
- `db/migrations/20261124130000_orden_historial_origen_retorno_rechazo_cierre/{migration,down}.sql` — un
  `ADD VALUE IF NOT EXISTS`; el down recrea el tipo con los 34 valores MEDIDOS en una base nueva.
- `db/schema.prisma` — `retorno_por_rechazo_cierre` al final de `OrdenHistorialOrigenTipo`.
- `lib/types/orden-historial.ts` — el valor en `ORDEN_HISTORIAL_ORIGEN_TIPO_SEED`, fuera de
  `ORIGEN_TIPOS_VISITA_REAL`, `ORIGEN_TIPOS_CON_GESTION` y `ORIGENES_GESTION_FUERA_DEL_CIERRE`.
- `lib/types/order-status-transiciones.ts` — arista #74 `novedad_interna -> en_reparto via
  retorno_por_rechazo_cierre, rol "admin (rechazar cierre)"`.

Tests nuevos:
- `tests/integration/db/247-origen-retorno-rechazo-migration.test.ts` (12: 6 estáticos + 6 contra Postgres).

Tests tocados:
- `tests/unit/types/orden-historial-types.test.ts` — 35 valores + bloque SLT-247 (3 casos).
- `tests/unit/domain/order-status-transiciones.guardia.test.ts` — bloque SLT-247 (4 casos); el par ilegal
  `novedad_interna -> en_reparto` de R6 pasa a `novedad_interna -> reprogramado`; recuentos 61/56; 276
  ve 4 salidas.
- `tests/fixtures/inventario-transiciones-140.ts` — #74 y recuento 61 aristas / 56 pares.
- `tests/unit/guards/origenes-admitidos-en-cierre.guardia.test.ts` — la familia, ADMITIDA (no produce gestión).
- `tests/unit/repositories/orden-historial-cobertura.test.ts` — en `FAMILIAS_SIN_PRODUCTOR` hasta la Tanda 2.
- Por arrastre (solo añaden el valor posterior a sus listas, sin cambiar lo que afirman): 12
  `*-migration.test.ts` de `orden_historial_origen_tipo`, `correccion-resultado-gestion-migration.test.ts`
  (posición relativa en lugar de «es el último») y `455/caracterizacion/transiciones.test.ts` (61 aristas).

### Desvíos del design (anotados)

1. **Timestamp de la migración: `20261124130000`, no `20261120120000`.** `db/migrations` ya tenía
   `20261123120100_zona_activa` y `origin/dev` trae `20261124120000_sl21_pais_moneda_impuesto`: con el
   número del design se aplicaría fuera de orden. El design prevé renumerar. No es `20261125…` porque
   `tests/unit/analytics/backfill-guards.test.ts` rechaza cualquier carpeta con «125» (ficha 125).
2. **El down retipa DOS columnas, no una.** Medido contra la base (`pg_attribute`):
   `orden_evento.familia_aplicacion` (454) también usa el tipo, con el CHECK
   `orden_evento_familia_aplicacion_check`. El down suelta el CHECK, retipa las dos columnas y lo recrea
   con su texto original. Sin soltarlo, el down revienta (mutación M3).
3. **La arista entra en la Tanda 1 (lo pide tasks.md), su productor en la Tanda 2.** El design dice «en el
   MISMO commit que su productor»; las dos tandas van en el mismo PR. Mientras tanto, la familia está
   declarada en `FAMILIAS_SIN_PRODUCTOR` de `orden-historial-cobertura.test.ts`. **La Tanda 2 debe moverla**
   a `PUNTOS_DE_ESCRITURA` (#37, `CierresAdminRepository.resolverCierre`) y devolver la lista a
   `["recoleccion_tienda"]`.

### Mapa R → test (Tanda 1)

- R1771 (familia propia, no cuenta como intento, sin gestión enlazada):
  `orden-historial-types.test.ts > SLT-247/R1771 …` (3), `order-status-transiciones.guardia.test.ts >
  SLT-247/R1771 …` (4), `247-origen-retorno-rechazo-migration.test.ts` (12). El resto de R1771 (la fila
  escrita por el rechazo) es de la Tanda 2.

### Mutaciones (todas rojas, todas restauradas)

| # | Mutación | Resultado |
|---|---|---|
| M1 | down.sql sin retipar `orden_evento.familia_aplicacion` | rojo: el `beforeAll` revienta (1 failed, 6 skipped) |
| M2 | down.sql sin `correccion_resultado_gestion` en la lista | rojo: 2 failed (estático + DB) |
| M3 | down.sql sin `DROP CONSTRAINT` del CHECK | rojo: el `beforeAll` revienta |
| M4 | down.sql sin recrear el CHECK | rojo: 2 failed |
| M5 | quitar la arista #74 del mapa | rojo: 6 failed en el guardia |
| M6 | meter la familia en `ORIGEN_TIPOS_VISITA_REAL` | rojo: 4 failed (types, guardia, migración) |

### Verificación

Base desechable nueva `servi_slt247_t1b` (`migrate deploy` + `db:seed`), exportada antes de cada vitest.

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` — exit 0.
- `pnpm run lint` — `0 errors, 249 warnings` (ninguno en archivos de esta tanda).
- `pnpm run test:guardias` — `Test Files 360 passed (360)`, `Tests 5432 passed | 1 skipped`.
- `pnpm exec vitest run` sobre los 61 archivos de `tests/` que nombran el enum, el inventario,
  `TRANSICIONES` o el valor nuevo — `Test Files 61 passed (61)`, `Tests 1179 passed (1179)`.
- `./init.sh` — `INIT_EXIT=1`, SOLO por `faltan specs para features sdd en vuelo: SLT-248` (spec de otra
  ficha en escritura en su worktree; el leader lo resuelve). Se corta antes del resto, que se corrió a mano
  arriba.

**Veredicto:** Tanda 1 hecha y verde salvo el rojo ajeno de `validate-features` (SLT-248).

## Tanda 2 — Backend (backend_dev, 2026-11-20)

T2.1–T2.6 de `specs/SLT-247-cierre-rechazado-gestiona-sin-gestion/tasks.md`.

### Archivos

Producción:
- `lib/interfaces/repositories/ICierresAdminRepository.ts` — `retornoSinGestion?` en la rama `rechazado` + `RetornoSinGestionConfig`.
- `lib/repositories/CierresAdminRepository.ts` — `resolverCierre`: bloque de retorno (R1770-R1777) en la misma tx, tras el
  `updateMany` del cierre y solo con `count === 1`; `findBarridasDelCierre` filtra `novedad_interna` (R1791).
- `lib/services/CierresAdminService.ts` — `rechazarCierre` resuelve `novedad_interna`/`en_reparto`, falla cerrado (R1775) y los pasa.
- `lib/repositories/correccion-cierre.ts` — rama `sin_gestion`, columna `fuente` con precedencia `sin_gestion`
  (`DISTINCT ON`), y `whereOrdenNoRetenidaPorRechazado()`.
- `lib/repositories/CorteDiarioRepository.ts` — el fragmento en la selección (rama b).
- `lib/repositories/CierreDiaRepository.ts` — el fragmento en el barrido de `crearCierre`; `congelarDetalleDeOrdenes`
  extraída TAL CUAL (diff contra HEAD: solo `this.tarifaRepo` -> parámetro y `cierre.id` -> `cierreId`);
  `resolicitarCierreRechazado` con los pasos nuevos y el resultado `ResolicitarRechazadoResult`;
  `findCorreccionesPendientes` con descriptivos de `cierre_sin_gestion` y `obligatoria`.
- `lib/interfaces/repositories/ICierreDiaRepository.ts` — `ResolicitarRechazadoResult`, `obligatoria?`, `fueraDeNovedadInterna?`.
- `lib/services/CierreDiaService.ts` — `motivoObligatoriasPendientes` (exportada) y el mapeo a `conflict`; `obligatoria` en `correccionesDe`.
- `lib/interfaces/services/ICierreDiaService.ts` — `obligatoria?` y `fueraDeNovedadInterna?`.
- `lib/utils/cierre-sin-gestion.ts` — `SIN_GESTION_SELECT` proyecta `orden.estatus.value`; `toSinGestionRow` marca `fueraDeNovedadInterna`.

Tests nuevos:
- `tests/integration/db/247-sin-gestion-rechazado-sql-real.test.ts` (8).
- `tests/integration/db/247-resolicitud-sin-gestion-sql-real.test.ts` (2).
- `tests/unit/services/cierre-dia-247-obligatorias.test.ts` (7).

Tests tocados:
- `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts` — caso 5: el rechazo pasa `retornoSinGestion` y ahora
  devuelve a `en_reparto` (una fila `retorno_por_rechazo_cierre`); sigue sin tope ni liberación.
- `tests/unit/repositories/cierres-admin-repository.test.ts` — bloque SLT-247 (4).
- `tests/unit/services/cierres-admin-service.test.ts` — pasa `retornoSinGestion` + catálogo incompleto (3).
- `tests/unit/services/cierre-dia-477-resolicitud.test.ts` — doble con el resultado nuevo + `obligatorias_pendientes` + `obligatoria`.
- `tests/unit/repositories/orden-historial-cobertura.test.ts` — la familia pasa de `FAMILIAS_SIN_PRODUCTOR` a
  `PUNTOS_DE_ESCRITURA` #37 (33 puntos); la lista vuelve a `["recoleccion_tienda"]`.
- Por arrastre del tipo de retorno de `resolicitarCierreRechazado` (`boolean` -> resultado), solo el valor del doble o
  de la aserción: `cierre-dia-action.test.ts`, `cierre-dia-deshacer-dia-reparto.test.ts`,
  `cierre-dia-service-totales-mixtos.test.ts`, `cierre-dia-service.test.ts` (3), `gestion-desde-ayuda-cierre-aprobacion.test.ts`,
  `notificacion-productores-wiring.test.ts`, `477-resolicitud-rechazado-sql-real.test.ts` (`false` -> `{status:"conflict"}`),
  `ajuste-pago-mensajero-cierre.int.test.ts` y `cierre-pago-congelado.test.ts` (`true` -> `{status:"ok"}`).
  Ninguno del congelado de `crearCierre` cambia.
- Literales que son CONTRATO del `where` que el design cambia (se actualizan a mano, no contra su fuente):
  `cierre-dia-repository.test.ts` (R4/R22: el `findMany` del barrido gana `cierresSinGestion.none…rechazado`, R1788),
  `cierres-admin-confirmacion-fisica.test.ts` (R6: `findBarridasDelCierre` gana `orden.estatus = novedad_interna`, R1791)
  y `cierres-admin-aviso-rechazo.test.ts` (R4(b): las claves del input de `resolverCierre` ganan `retornoSinGestion`).
- `tests/integration/db/orden-traspaso-migration.test.ts` — su lista de migraciones POSTERIORES gana la de la Tanda 1
  (`20261124130000_…`). Era un rojo de la Tanda 1 que su verificación no corrió (sale con el disparador `migration`).

### Desvíos del design (anotados)

1. **R1790 en el predicado.** La rama `sin_gestion` excluye también la orden con una gestión vigente vinculada a un
   cierre POSTERIOR al barrido (`g.created_at > csg.created_at`). Sin eso, si el corte se lleva la gestión a su
   cierre antes del reenvío, la orden seguía «obligatoria pendiente» (su gestión ya no está sin cierre) y no se podía
   volver a gestionar (tiene una pendiente): el rechazado quedaba bloqueado para siempre, contra R1790. El ancla es
   `cierre_sin_gestion.created_at`, inmutable (R1793). Entre el barrido y el rechazo la orden está en
   `novedad_interna` y no admite gestión, así que una gestión de otro cierre posterior al barrido solo puede ser de
   después del retorno.
2. **El tipo de retorno arrastra 10 archivos de test más** (lista arriba): solo cambia el valor del doble o de la
   aserción. El design preveía solo el de `cierre-dia-477-resolicitud.test.ts`. Y 3 literales de `where`/claves que
   el design cambia a propósito (R1788, R1791, R1770), también arriba. Un test de `crearCierre` cambia: el del
   barrido (`cierre-dia-repository.test.ts` R4/R22), porque T2.3 pone el fragmento en ESE `findMany`; los del
   congelado extraído no se tocan.
3. **`fuente` ausente se lee como `detalle`** (`!== "sin_gestion"`) en el paso de poda, para que un doble viejo de
   `$queryRaw` sin la columna se comporte como la 477.
4. **R1787** se mapea al test existente `454/caracterizacion/liberacion-por-cierre.test.ts` (vencido reenviado sin
   rechazo: solo estado; aprobar libera), que corre sin cambios; no se duplicó en el 247.

### Mapa R → test (Tanda 2)

| R | Test |
|---|---|
| R1770, R1772, R1773, R1793 | `247-sin-gestion-rechazado` › «rechazar devuelve SOLO las barridas vivas y suyas, sin tocar dinero» |
| R1771 | idem (una fila, actor = admin, sin gestión) + Tanda 1 (no es visita real) |
| R1774 | idem › «sin el registro de la 264…» + `cierres-admin-repository` › R1774 |
| R1775 | `cierres-admin-service` › «SLT-247/R1775: sin … en el catalogo» (2) |
| R1776 | `247-sin-gestion-rechazado` › R1776 + `cierres-admin-repository` › R1776 |
| R1777 | `247-sin-gestion-rechazado` › R1777 (otra `organizacion_id`) |
| R1778, R1779 | `247-resolicitud` › caso 1 (suelta bloqueada; obligatorias marcadas y gestionables) + `247-sin-gestion-rechazado` › predicado |
| R1780, R1781 | `247-resolicitud` › caso 1 (sin cierre y sin mover; deshacer la vuelve pendiente) |
| R1782, R1783 | `247-resolicitud` › caso 1 (conflicto con la guía, nada escrito) + `cierre-dia-477-resolicitud` › R1782 + `cierre-dia-247-obligatorias` |
| R1784, R1785 | `247-resolicitud` › caso 1 (detalle igual al de `crearCierre` para una gemela, pago congelado, totales) |
| R1786 | suite 477 sin cambios de aserción (`477-resolicitud-rechazado-sql-real`, `477-ordenes-en-correccion-sql-real`) |
| R1787 | `454/caracterizacion/liberacion-por-cierre.test.ts` (sin cambios) |
| R1788 | `247-sin-gestion-rechazado` › R1788 (selección y barrido por separado) |
| R1789, R1791, R1794 | idem › «la valvula saca el rechazado…» + `cierre-dia-247-obligatorias` (marca) |
| R1790 | `247-resolicitud` › R1790 + `247-sin-gestion-rechazado` › predicado (`llevadaPorElCorte`) |
| R1792 | `247-resolicitud` › caso 1 (aplica, cuenta 1 intento, no libera) |
| R1795 | `cierre-dia-477-resolicitud` › «SLT-247/R1795…» (servidor; la pantalla es Tanda 3) |
| R1799 | `247-sin-gestion-rechazado` › caso 1 (cierre nacido del corte y rechazado después) |
| R1800 | `247-sin-gestion-rechazado` › R1800 + predicado (`enNovedad`) |

### Mutaciones (todas rojas al final, todas restauradas; `git diff --stat` igual antes y después)

Script de un solo uso en el scratchpad de la sesión (`slt247/mutar.py`). Base desechable `servi_slt247_t2`.

| # | Mutación | Resultado |
|---|---|---|
| M1 | retorno: quitar `mensajeroAsignadoId` del `where` | rojo (2 failed) |
| M2 | retorno: quitar `estatusId` del `where` | rojo (1) |
| M3 | retorno: quitar `deletedAt: null` | rojo (1) |
| M4 | predicado: quitar `s.value = 'en_reparto'` | rojo (2) |
| M5 | predicado: quitar el dueño (`o.mensajero_asignado_id = c.mensajero_id`) | rojo (1) |
| M6 | predicado: quitar `o.deleted_at IS NULL` | rojo (1) |
| M7 | predicado: quitar la condición de R1790 | rojo (2, en los dos archivos) |
| M8 | predicado: quitar `g.anulada_at IS NULL` de la rama nueva | rojo (1) |
| M9 | predicado: quitar `g.cierre_id = csg.cierre_id` | **sobrevivió** la 1.ª vez (la gestión sembrada era posterior al barrido y la cubría R1790); sembrada anterior al barrido -> rojo (1) |
| M10 | precedencia del `DISTINCT ON` invertida | rojo (1) |
| M11 | rama nueva sin `c.estado = 'rechazado'` | rojo (1) |
| M12 | corte: fragmento fuera de la SELECCIÓN solo | rojo (1) |
| M13 | corte: fragmento fuera del BARRIDO de `crearCierre` solo | rojo (1) |
| M14 | `findBarridasDelCierre` sin el filtro `novedad_interna` | rojo (2) |
| M15 | re-solicitud sin el chequeo de pendientes | rojo (1) |
| M16 | re-solicitud sin `congelarDetalleDeOrdenes` | rojo (2) |

### Verificación (Tanda 2)

Base desechable nueva `servi_slt247_t2` (`migrate deploy` + `db:seed`), exportada antes de cada vitest.

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` — exit 0.
- `pnpm run lint` — `✖ 249 problems (0 errors, 249 warnings)`, exit 0 (los mismos 249 de la Tanda 1; ninguno nuevo).
- `pnpm run test:guardias` — `Test Files 360 passed (360)`, `Tests 5432 passed | 1 skipped (5433)`.
- `pnpm exec vitest related --run <lib/ tocados>` — `Test Files 6 failed | 866 passed (872)`. Los 6: 3 literales de
  contrato que el design cambia (arreglados arriba) y 3 de integración por timeout de 20 s con la base saturada
  (`cierres-bodega-cifras-lote-sql-real`, `orden-listado-orden-total`, `cierre-bloqueo-nv-sql-real`). Re-corridos los 6
  solos: `Test Files 6 passed (6)`, `Tests 205 passed (205)`.
- `pnpm exec vitest run 477- cierre corte` — `Test Files 301 passed (301)`, `Tests 4538 passed (4538)`.
- Disparador del esquema (`migration migracion demo-qa sql-real schema-drift verificar-rls`) — `5 failed | 276 passed
  (281)`. `orden-traspaso-migration` era nuestro (arreglado, arriba). `abono-tienda-457`, `cobro-tienda-461` y
  `wallet-461` están en `tests/baseline-rojos.json` (rojos heredados, nada de esta ficha). `demo-qa` (9) por carga: solo,
  con `orden-traspaso-migration`, `Test Files 2 passed (2)`, `Tests 29 passed (29)`.
- Los 3 archivos `247-*` — `Test Files 3 passed (3)`, `Tests 22 passed (22)`.
- `./init.sh` — `INIT_EXIT=1`, SOLO por el tamaño del PR: `55/40 archivos, 815/1000 líneas de producción, 1419/3000 de
  tests`. Corta antes de typecheck/lint/tests/guardias, que se corrieron a mano arriba. Partir o aceptar es del humano
  (`<!-- tamano-pr-aceptado: … -->` en `progress/features/SLT-247.md`); el desglose: producción y tests dentro de su
  tope, el exceso es de archivos (la Tanda 1 tocó ~20 tests por arrastre del enum y esta tanda 10 dobles por el tipo
  de retorno). El rojo «faltan specs… SLT-248» ya no sale.

**Veredicto:** Tanda 2 hecha y verde en todo lo que corre; el gate queda rojo solo por el tamaño del PR (55/40 archivos), que decide el humano.
