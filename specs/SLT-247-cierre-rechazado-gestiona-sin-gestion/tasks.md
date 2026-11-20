# SLT-247 — Tareas

> Requisitos R1770–R1800 (`requirements.md`); diseño en `design.md`. `[P]` = paralelizable con las
> demás `[P]` de su tanda. Cada task cierra con `./init.sh` en verde. Base desechable para
> integración y E2E (nunca la de desarrollo); `.env` copiado al worktree antes del primer gate.

## T0 — Medición en producción (leader, SOLO LECTURA)

- [ ] **T0.1** Conectar con `.env.prod` (`DIRECT_URL`) y fijar solo lectura tras conectar
  (`SET default_transaction_read_only = on;`). Sin imprimir la URL. Ejecutar:

  ```sql
  -- (1) Cierres abiertos con barridas que siguen en novedad_interna, por empresa y estado
  SELECT c.organizacion_id, c.estado, count(DISTINCT c.id) AS cierres, count(*) AS barridas_vivas
    FROM cierre_sin_gestion csg
    JOIN cierre_dia c   ON c.id = csg.cierre_id
    JOIN orden o        ON o.id = csg.orden_id
    JOIN order_status s ON s.id = o.estatus_id
   WHERE c.estado IN ('rechazado','solicitado','vencido')
     AND s.value = 'novedad_interna' AND o.deleted_at IS NULL
   GROUP BY 1, 2 ORDER BY 1, 2;

  -- (2) El caso de Bryan: estado actual y barridas vivas
  SELECT c.id, c.estado, c.sin_gestion_registrado,
         count(csg.*) FILTER (WHERE s.value = 'novedad_interna') AS vivas,
         count(csg.*) AS barridas
    FROM cierre_dia c
    LEFT JOIN cierre_sin_gestion csg ON csg.cierre_id = c.id
    LEFT JOIN orden o ON o.id = csg.orden_id
    LEFT JOIN order_status s ON s.id = o.estatus_id
   WHERE c.id::text LIKE 'f11ceb85%'
   GROUP BY 1, 2, 3;
  ```

  **Hecho:** las dos tablas de resultados (solo conteos e ids de cierre) anotadas en
  `progress/features/SLT-247.md`. Si (1) trae filas con `estado = 'rechazado'`, se lleva a Carlos la
  pregunta abierta (c) con el número. Repetir (1) y (2) justo antes de abrir el PR a `prod`.

## Tanda 1 — Esquema e historial (backend_dev)

- [x] **T1.1** Enum `retorno_por_rechazo_cierre`. Va en `db/schema.prisma` y en la migración
  `20261120120000_orden_historial_origen_retorno_rechazo_cierre` (`migration.sql` con
  `ADD VALUE`). Su `down.sql` recrea el tipo con la lista MEDIDA en la base, con el aviso de lista
  fechada del patrón de la 398. Aplicar en la base desechable y `prisma generate`.
  **Hecho:** `migrate deploy` limpio en base nueva. El test de migración (T1.4) pasa: up añade el
  valor al final, down devuelve exactamente la lista previa, en orden.
- [x] **T1.2** `lib/types/orden-historial.ts`: el valor en `ORDEN_HISTORIAL_ORIGEN_TIPO_SEED`, fuera
  de `ORIGEN_TIPOS_VISITA_REAL` y de `ORIGEN_TIPOS_CON_GESTION`, con su comentario de familia.
  **Hecho:** typecheck verde (`_EnsureExhaustive`).
- [x] **T1.3** `lib/types/order-status-transiciones.ts`: arista
  `novedad_interna -> en_reparto via retorno_por_rechazo_cierre`.
  **Hecho:** la guardia de transiciones pasa con el caso nuevo (T1.4).
- [x] **T1.4** [P] Tests: `tests/unit/types/orden-historial-types.test.ts` (lista y longitud),
  `tests/unit/domain/order-status-transiciones.guardia.test.ts` (la arista viaja con su familia y no
  es visita real) y `tests/integration/db/247-origen-retorno-rechazo-migration.test.ts` (up/down
  contra Postgres, patrón `correccion-resultado-gestion-migration.test.ts`).
  **Hecho:** verdes. Una mutación que quite la arista pone rojo el guardia.

Depende de: nada. Bloquea: Tanda 2.

## Tanda 2 — Backend (backend_dev)

- [ ] **T2.1** Rechazo (design §2).
  - `ICierresAdminRepository.ts`: `retornoSinGestion?` en la rama `rechazado`.
  - `CierresAdminRepository.resolverCierre`: el bloque de retorno en la misma transacción.
  - `CierresAdminService.rechazarCierre`: resuelve los dos ids, falla cerrado y los pasa.

  **Hecho:** R1770-R1777 y R1799 con sus tests de T2.6 verdes. Una mutación que quite
  `mensajeroAsignadoId` o `estatusId` del `where` del `updateMany` pone rojo un test de integración.
- [ ] **T2.2** Predicado (design §3). En `lib/repositories/correccion-cierre.ts`: la rama
  `sin_gestion`, la columna `fuente` con precedencia `sin_gestion` y el fragmento
  `whereOrdenNoRetenidaPorRechazado()`.
  **Hecho:** los casos de `477-ordenes-en-correccion-sql-real.test.ts` siguen verdes sin cambiarlos.
  Los casos nuevos (dos fuentes, dueño distinto, `novedad_interna`, borrada, gestión vigente
  vinculada) también pasan.
- [ ] **T2.3** Corte (design §5). Va en `CorteDiarioRepository` rama (b) y en el `findMany` del
  barrido de `CierreDiaRepository.crearCierre`, con el MISMO fragmento.
  **Hecho:** R1788/R1789 verdes en integración. Una mutación que lo quite de uno solo de los dos
  sitios pone rojo un test.
- [ ] **T2.4** Re-solicitud (design §4).
  - Se extrae `congelarDetalleDeOrdenes` de `crearCierre` sin cambiar valores.
  - `resolicitarCierreRechazado` lleva los pasos 2, 5 y 7 y devuelve el nuevo resultado.
  - Se actualiza el tipo en `ICierreDiaRepository.ts`.
  - `CierreDiaService` mapea el resultado con `motivoObligatoriasPendientes`.

  **Hecho:** R1782-R1787 verdes. Los tests existentes de `crearCierre` y de la 477 siguen verdes
  SIN tocarlos, salvo el doble de `cierre-dia-477-resolicitud.test.ts`, que gana el resultado nuevo.
- [ ] **T2.5** Aprobación y lectura (design §6 y §7, parte servidor).
  - `findBarridasDelCierre` filtra `novedad_interna`.
  - `cierre-sin-gestion.ts` añade `fueraDeNovedadInterna`.
  - `findCorreccionesPendientes`/`correccionesDe` añaden `obligatoria` y los descriptivos de
    `cierre_sin_gestion`.
  - Tipos en `ICierreDiaService.ts`.

  **Hecho:** R1791-R1794 verdes.
- [ ] **T2.6** [P] Tests de integración y unidad de la tanda:
  - `tests/integration/db/247-sin-gestion-rechazado-sql-real.test.ts` (rechazo, corte, aprobación,
    válvula y multi-empresa);
  - `tests/integration/db/247-resolicitud-sin-gestion-sql-real.test.ts`;
  - ajuste del caso 5 de `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts`: rechazar
    ahora devuelve a `en_reparto` y sigue sin `rechazo_tope_intentos` ni `liberacion_sin_gestionar`;
  - ajuste de `tests/unit/repositories/cierres-admin-repository.test.ts`: el rechazo sin
    `retornoSinGestion` no toca `orden`, y con él solo mueve las barridas vivas;
  - ajuste de `tests/unit/services/cierres-admin-service.test.ts`: el servicio pasa
    `retornoSinGestion`, y con catálogo incompleto falla cerrado;
  - ajuste de `tests/unit/services/cierre-dia-477-resolicitud.test.ts`: `obligatorias_pendientes`
    da `conflict` con el motivo.

  **Hecho:** verdes y cada test nuevo matado por al menos una mutación de su `where`. Medido, no
  supuesto: memorias «Probar el WHERE donde vive» y «Test de integración verde sin datos».

Depende de: Tanda 1. Bloquea: Tanda 3.

## Tanda 3 — Pantallas (frontend_dev)

- [ ] **T3.1** `CorregirCierre.tsx` + `detalle-cierre-labels.ts`: sección de obligatorias antes de
  la de deshechas (design §7).
  **Hecho:** R1795 verde en test de componente.
- [ ] **T3.2** `CierreDiaModule.tsx`: `deshabilitadas.solicitarRechazado` con el motivo y
  `sinRehacerDelReenviable` sin obligatorias.
  **Hecho:** R1796/R1797 verdes. La sección «Novedad interna» del rechazado y del vencido sigue
  (R1798).
- [ ] **T3.3** `cierre-confirmacion-fisica.tsx`: `filasAConfirmar` descarta `fueraDeNovedadInterna`.
  **Hecho:** R1791 (pantalla) verde. Con todas las barridas en `novedad_interna`, la lista es
  idéntica a la de hoy.
- [ ] **T3.4** [P] `tests/components/247-cierre-rechazado-sin-gestion.test.tsx` (T3.1-T3.3).
  **Hecho:** verde.
- [ ] **T3.5** E2E `e2e/cierre-rechazado-sin-gestion.spec.ts` (+ escenario en
  `e2e/_escenarios/cierres.ts`). El flujo:
  1. corte con barridas;
  2. el admin rechaza;
  3. el mensajero ve las órdenes en Entregas, el botón de reenvío deshabilitado y el motivo;
  4. las gestiona y reenvía;
  5. el admin aprueba sin escanear las gestionadas.

  Correrlo en local con build (memoria «E2E local necesita build») junto con el grupo `dinero`
  completo.
  **Hecho:** verde en local y sin reintentos (`failOnFlakyTests`).

Depende de: Tanda 2.

## Cierre

- [ ] **T4.1** `progress/impl_SLT-247.md` con el mapa R→test (abajo) y la evidencia de las
  mutaciones.
- [ ] **T4.2** Verificación en Preview con Carlos antes de promover (memoria «Aprobar en Preview
  antes de prod»): rechazar un cierre de demo con barridas y recorrer el flujo como mensajero.
- [ ] **T4.3** Re-medir la T0 justo antes del PR a `prod`.

## Trazabilidad R → test

| R | Test |
|---|---|
| R1770, R1772, R1773 | `247-sin-gestion-rechazado-sql-real.test.ts` › «rechazar devuelve a en_reparto solo las barridas vivas del mensajero, sin tocar dinero» |
| R1771 | idem › «historial: una fila retorno_por_rechazo_cierre, actor = quien rechaza, no es intento» |
| R1774 | idem › «cierre sin barridas o sin_gestion_registrado=false: el rechazo no mueve órdenes» |
| R1775 | `cierres-admin-service.test.ts` › «catálogo incompleto: rechazar falla cerrado sin llamar al repo» |
| R1776 | idem integración › «rechazo en conflicto o fuera de alcance: ninguna orden se mueve» |
| R1777 | idem integración › «otra empresa: no_encontrada y nada se mueve» |
| R1778, R1779 | `477-ordenes-en-correccion-sql-real.test.ts` › casos nuevos de la fuente `sin_gestion` + `247-sin-gestion-rechazado-sql-real.test.ts` › «bloqueado: escoge y gestiona la obligatoria; no otra» |
| R1780, R1781 | `247-resolicitud-sin-gestion-sql-real.test.ts` › «la gestión queda sin cierre; deshacerla la vuelve pendiente» |
| R1782, R1783 | idem › «con obligatoria pendiente no reenvía, no escribe y nombra las guías» + `cierre-dia-477-resolicitud.test.ts` › «obligatorias_pendientes → conflict con motivo» |
| R1784, R1785 | idem › «reenvío: vincula, crea cierre_detail con cobro congelado, congela pago y recalcula los seis totales» |
| R1786 | idem › «rechazado sin obligatorias: totales, snapshots y detalle idénticos» + suite 477 sin cambios |
| R1787 | `247-sin-gestion-rechazado-sql-real.test.ts` › «vencido reenviado sin rechazo: solo estado; aprobar libera y pide escanear como hoy» |
| R1788, R1789 | idem › «corte con rechazado abierto: no selecciona ni barre; al salir de rechazado sí» |
| R1790 | idem › «gestión no reenviada antes del corte: va al vencido nuevo, deja de ser pendiente, se cobra una vez» |
| R1791 | idem › «aprobar: confirmación física solo de barridas en novedad_interna» + `247-cierre-rechazado-sin-gestion.test.tsx` › «filasAConfirmar descarta fueraDeNovedadInterna» |
| R1792 | `247-resolicitud-sin-gestion-sql-real.test.ts` › «aprobar el reenviado aplica la gestión, cuenta intento y no libera la orden» |
| R1793 | idem › «cierre_sin_gestion intacta tras rechazo, reenvío y aprobación» |
| R1794 | `247-sin-gestion-rechazado-sql-real.test.ts` › «válvula sobre rechazado con pendientes: aprobar no las pide ni libera; el corte siguiente las barre» |
| R1795 | `247-cierre-rechazado-sin-gestion.test.tsx` › «Corregir lista las obligatorias aparte, con estado y enlace» |
| R1796 | idem › «reenvío deshabilitado con el motivo mientras falte alguna» |
| R1797 | idem › «la confirmación cuenta solo las deshechas» |
| R1798 | idem › «rechazado y vencido siguen mostrando la sección Novedad interna» |
| R1799 | `247-sin-gestion-rechazado-sql-real.test.ts` › «cierre creado antes (vencido → solicitado) y rechazado ahora: aplica R1770» |
| R1800 | idem › «rechazado antes del despliegue (barridas en novedad_interna): no es obligatoria, no bloquea, aprobar libera como hoy» |
| E2E | `e2e/cierre-rechazado-sin-gestion.spec.ts` (R1770, R1779, R1782, R1784, R1791, R1796) |

## Archivos esperados

Producción (19):
- `db/schema.prisma`
- `db/migrations/20261120120000_orden_historial_origen_retorno_rechazo_cierre/migration.sql`
- `db/migrations/20261120120000_orden_historial_origen_retorno_rechazo_cierre/down.sql`
- `lib/types/orden-historial.ts`
- `lib/types/order-status-transiciones.ts`
- `lib/repositories/correccion-cierre.ts`
- `lib/repositories/CorteDiarioRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/services/CierreDiaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/services/CierresAdminService.ts`
- `lib/utils/cierre-sin-gestion.ts`
- `app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `components/private/cierres/detalle/CorregirCierre.tsx`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`

Tests (13):
- `tests/integration/db/247-sin-gestion-rechazado-sql-real.test.ts`
- `tests/integration/db/247-resolicitud-sin-gestion-sql-real.test.ts`
- `tests/integration/db/247-origen-retorno-rechazo-migration.test.ts`
- `tests/integration/db/477-ordenes-en-correccion-sql-real.test.ts`
- `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts`
- `tests/unit/repositories/cierres-admin-repository.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierre-dia-477-resolicitud.test.ts`
- `tests/unit/types/orden-historial-types.test.ts`
- `tests/unit/domain/order-status-transiciones.guardia.test.ts`
- `tests/components/247-cierre-rechazado-sin-gestion.test.tsx`
- `e2e/cierre-rechazado-sin-gestion.spec.ts`
- `e2e/_escenarios/cierres.ts`

Total: 32 / 40 (80%, en el aviso). Producción ~700 / 1 000 líneas; tests ~1 500 / 3 000. Si hace
falta un archivo más, se parte en las dos rebanadas de `design.md > 13. Tamaño`.
