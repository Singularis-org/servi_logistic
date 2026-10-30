# impl SLT-56 — Ajustar en el cierre lo que ganó el mensajero

Rama `feature/SLT-56-ajuste-pago-mensajero-cierre`. Spec R1–R21 (Q1/Q2 cerradas 2026-10-29).
Implementer 2026-10-29. Integrada con `origin/dev` (merge 5b0cc9b3, sin conflictos; dev no tocó
cierres-admin).

## Commits

| SHA | Qué |
|---|---|
| 5b0cc9b3 | merge `origin/dev` |
| 47bba189 | Q1/Q2 a Decisiones cerradas |
| 4aebe3bf | T1+T2: tabla `gestion_pago_mensajero_ajuste`, tipo `cierre_dia_pago_mensajero_ajustado` |
| f6e67852 | T3: `lib/utils/ajuste-pago-mensajero.ts` (Decimal) |
| f457e459 | T4+T5: schema zod, contratos, `ajustarPagoMensajeroEnCierre` |
| 76da8d49 | tests que cuentan tablas/triggers/tipos (154 triggers misma-empresa) |
| 512bb51b | T6: service + Server Action |
| f42b5bf0 | T7: lectura `ajustesPago` / `gestionesAjustadas` |
| a0c889b8 | T8: diálogo, marca «Ajustado», «Con ajustes» |
| a39e051b | ayuda `docs/ayuda/oficina/cierres.md` |
| 376ee90d | tasks T1–T8; comentario sin literal de país |
| a1facb29 | T9: E2E (grupo `dinero`) |

## Migraciones creadas (nuevas, solo aplicadas a bases locales desechables)

- `db/migrations/20261029120000_gestion_pago_mensajero_ajuste/` (+ `down.sql`): tabla, 3 CHECK
  (`pago_nuevo >= 0`, `pago_nuevo <> pago_anterior`, motivo con algún no-espacio), índices, FK
  RESTRICT, RLS + política por empresa, `REVOKE UPDATE, DELETE` a `servi_app`, triggers misma-empresa.
- `db/migrations/20261029120100_historial_accion_pago_mensajero_ajustado/` (+ `down.sql` con la
  función dinámica de SL-24, conserva los valores de planes).
- Posteriores a la última de dev (`20261028130400`). Si SLT-43 entra antes con timestamp mayor,
  renumerar ANTES de aplicar en un entorno compartido.

## Archivos

- Datos: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts`, `scripts/verificar-rls-despliegue.ts`.
- Lib: `lib/types/{cierres-admin,historial-accion}.ts`, `lib/utils/ajuste-pago-mensajero.ts`,
  `lib/interfaces/services/{ICierreDiaService,ICierresAdminService,ICierreBodegaService}.ts`,
  `lib/interfaces/repositories/{ICierresAdminRepository,ICierreDiaRepository,ICierresBodegaAdminRepository}.ts`,
  `lib/repositories/{CierresAdminRepository,CierresBodegaAdminRepository}.ts`,
  `lib/services/{CierresAdminService,CierreDiaService,CierresBodegaAdminService}.ts`,
  `lib/actions/cierres-admin.ts`. `lib/modulos/reparto.ts` NO se tocó (la guardia reparte por ruta).
- App: `app/(app)/cierres-admin/page.tsx`, `_components/{AjustarPagoMensajeroDialog,MarcaAjustado}.tsx`
  (nuevos), `_components/{CierresAdminModule,CierresBodegaAdminModule,cierre-detalle-shared,cierre-factura}.tsx`,
  `_components/cierre-labels.ts`.
- Docs: `docs/ayuda/oficina/cierres.md`. E2E: `e2e/ajuste-pago-mensajero-cierre.spec.ts`, `playwright.config.ts`.
- Tests nuevos: ver mapa. Tests existentes tocados solo para completar dobles/contratos (método nuevo
  de la interfaz, `pagoMensajero` en `GestionEditableDelCierre`, `ajustesPagoMensajero: []`,
  `_count`, `gestionesAjustadas: 0`) y conteos (74 tipos de historial, 154 triggers); ninguna
  aserción relajada.

## Mapa R → test

`INT` = `tests/integration/db/ajuste-pago-mensajero-cierre.int.test.ts`; `LEC` =
`tests/integration/db/ajuste-pago-mensajero-lectura.int.test.ts`; `SVC` =
`tests/unit/services/cierres-admin-ajustar-pago.test.ts`; `ACT` =
`tests/unit/actions/cierres-admin-ajustar-pago.test.ts`; `CMP` =
`tests/components/cierre-detalle-ajuste-badge.test.tsx`; `DLG` =
`tests/components/AjustarPagoMensajeroDialog.test.tsx`; `E2E` = `e2e/ajuste-pago-mensajero-cierre.spec.ts`.

| R | Test |
|---|---|
| R1 | SVC «maestro y admin → ok, con alcance central…»; E2E recorrido central |
| R2 | SVC «adminSatelite con zona → ok en una sola escritura…»; INT «R2 — la satelite ajusta un cierre de SU zona en el acto»; E2E recorrido satélite |
| R3 | INT «R3 — desde una satelite, un cierre de la central es `fuera_de_alcance`…», «R3 — un cierre de OTRA satelite…», «R3 — una gestion que no existe…»; SVC «adminSatelite sin zona → no_encontrada…», «…de otra bodega → no_encontrada…» |
| R4 | SVC «mensajero y adminTienda → forbidden sin llamar al repositorio»; ACT «es `unauthenticated` ANTES de parsear…» |
| R5 | INT «R5 — un cierre `aprobado` no se ajusta: conflict y NADA escrito» (y `rechazado`); SVC «cierre aprobado/rechazado → conflict…», «el cierre se APRUEBA entre la lectura y la escritura…» |
| R6 | INT «R6/R10 — ajustar un rechazo de 0 a 1000…», «R6 — una entrega tambien se ajusta, y un cierre `vencido` esta abierto»; SVC «resultado %s → ok» (5 resultados) |
| R7 | SVC «motivo %j → validation_error.motivo…»; ACT «motivo en blanco / sin motivo → fieldErrors.motivo»; `tests/unit/types/ajustar-pago-mensajero-schema.test.ts`; CHECK en `tests/integration/db/gestion-pago-mensajero-ajuste-migration.test.ts`; DLG «bloquea sin motivo» |
| R8 | `tests/unit/types/ajustar-pago-mensajero-schema.test.ts` (negativo, 3 decimales, 11 dígitos); `tests/unit/utils/ajuste-pago-mensajero.test.ts` (`sin_cambio`); SVC «pagoNuevo %s con vigente 1500.00 → validation_error.pagoNuevo»; ACT |
| R9 | INT «R9 — un `pagoAnterior` que no es el vigente es conflict…», «R9 — dos ajustes sobre la misma pantalla…»; SVC «…mostraba 1200.00 y el vigente es 1500.00 → conflict», «sin pago congelado (NULL) → conflict»; DLG «pagoAnterior = el vigente» |
| R10 | INT «R6/R10 — … total_pago_mensajero = suma de los pagos vigentes» |
| R11 | CMP «SLT-56 R11 — tras el ajuste, la pantalla cambia sin recargar»; E2E central (Pago al mensajero 1.500→2.200, neto −700 sin recargar) |
| R12 | INT «R10/R12 — recaudo, ingreso de bodega por rechazos, el pago de las OTRAS gestiones, sus lineas y la tarifa quedan intactos» |
| R13 | E2E central: tras aprobar, wallet devengo 2.200, pago del efectivo 2.000, la empresa le debe 200 |
| R14 | E2E satélite: consolidación 9.000 / 1.800, «para la central» 7.200 |
| R15 | INT «R15 — rechazar el cierre y re-solicitarlo conserva el pago ajustado y su total…» |
| R16 | `tests/unit/guards/ajuste-pago-mensajero-money-safe.guardia.test.ts` (con contraprueba); `tests/unit/utils/ajuste-pago-mensajero.test.ts` «R16 — un centimo…»; DLG «el valor viaja como string» |
| R17 | INT «R17 — una fila de rastro con actor, rol congelado…», «R17 — si el paso 3 … falla, no queda ni el pago, ni el rastro, ni el historial», «R17 — si el historial de acciones falla, tampoco queda nada»; migración: servi_app sin UPDATE/DELETE (42501), RLS, SL017 |
| R18 | INT «R18 — una fila de historial `cierre_dia_pago_mensajero_ajustado` con monto = pago nuevo, por guia, sin motivo»; `tests/integration/db/historial-accion-pago-mensajero-ajustado-migration.test.ts` (up/down) |
| R19 | LEC «R19 — el detalle del cierre del dia trae los ajustes en orden cronologico…»; CMP «SLT-56 R19 — la marca «Ajustado»…»; E2E central |
| R20 | LEC «R20 — el detalle del cierre de bodega trae `gestionesAjustadas`…», «R20 — un cierre del dia SIN ajustes cuenta 0»; CMP «SLT-56 R20 — …»; E2E satélite |
| R21 | CMP «SLT-56 R21 — se ofrece sólo con permiso y en un cierre abierto»; DLG «SLT-56 R21 — …» |
| Q2 | LEC «la vista del mensajero … NO trae `ajustesPago`» |

## Salida real

Integración contra base aislada `servi_slt56` (ninguno saltado):
- `ajuste-pago-mensajero-cierre.int` 17/17; `gestion-pago-mensajero-ajuste-migration` 7/7;
  `historial-accion-pago-mensajero-ajustado-migration` 5/5; `ajuste-pago-mensajero-lectura.int` 5/5.
- Corrida del implementer (typecheck + integración T1–T5 + `tests/unit/services/` + guardias de
  censo): `Test Files 356 passed (356)`, `Tests 6980 passed (6980)`, TC_EXIT=0.

Unit/componentes: SVC 24, ACT 12, schema 12, utils 8, money-safe 8, DLG+CMP 29 — todos passed.

Mutaciones (todas matadas y revertidas):
- Sello del repo (corridas por el implementer): sin estado abierto → 2 rojos R5; sin alcance → 2
  rojos R3; sin `pagoAnterior` → 2 rojos R9; sin `anuladaAt` → sobrevivía, se añadió el caso
  «gestion ANULADA», que la mata.
- Lectura: sin `orderBy`/`desc` → 2; `_count` sin `some` → 2; `gestionesAjustadas` fijo 0 → 1;
  `ajustesPago` siempre en DTO → 1 (Q2); mapper `[]` → 2.
- Service: sin `desfasado` → 2; sin `sinZona` → 1; sin motivo → 3.
- Pantalla: sin `aplicarAjusteLocal` → R11 rojo; botón sin mirar estado → 2; sin marca → 4;
  `pagoAnterior` fijo → 1. E2E: delta del neto 699 / «para la central» 7.500 → 2 failed.

E2E (base desechable `servi_slt56_e2e`, puerto 3056, `--project=dinero`):
- `ajuste-pago-mensajero-cierre.spec.ts`: dos corridas seguidas, 2 passed cada una; 0 failed,
  0 skipped, 0 flaky.
- `cierres-admin` + `cierre-bodega-satelite`: 5 passed. `dos-empresas-humo` (`aislamiento`): 18 passed
  (con `NEXT_PUBLIC_APP_URL` en el build; el worktree no tiene `.env`).
- Guardia `e2e-sin-saltos` 30/30.

Gate: `./init.sh` (rápido, sin DATABASE_URL) → `Test Files 319 passed | 2 skipped`, `Tests 4477
passed | 20 skipped`, typecheck y lint (0 errores) en verde, `INIT_EXIT=0`.

## Notas para el reviewer / CI

- Desvíos del design (justificados): sello primero sin lectura previa por alcance (si no, la
  mutación «sin alcance» sobrevivía); CHECK de motivo `motivo ~ '[^[:space:]]'` (btrim dejaba pasar
  tabuladores); `created_at TIMESTAMP(3)` (convención del repo) + índice en `actor_usuario_id`;
  `gestionesAjustadas` cuenta gestiones, no filas de ajuste; «para la central» solo existe en el
  detalle de bodega (en el del día se actualiza el pago y se relee el detalle).
- `tests/integration/db/486-evidencias-cierres-sql-real` usa `GESTION_ADMIN_SELECT` y necesita base
  con datos sembrados: no corrido en local; lo cubre `gate-completo` en CI.
- La fecha de la marca usa los helpers de fecha/hora existentes (`fecha-cr`/`hora-cr`): no hay zona
  horaria por empresa; deuda heredada, no nueva.
- El worktree tiene `node_modules` propio (`pnpm install --frozen-lockfile`) en vez del junction:
  el cliente Prisma compartido lo regeneraba otro worktree con otro schema.
