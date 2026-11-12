# SLT-128 — planes-cambios-por-periodo · tasks.md

> Ficha: SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período».
> Diseño: `design.md` («§N»). Requisitos: `requirements.md` (R1–R27). P7–P10 abiertas: cada una tiene su propuesta
> escrita en su requisito (R16, R14, R23, R17/R24); si el humano elige otra cosa, cambian esa task y su test.
> Capa: `backend_dev` (`db/`, `lib/`, `tests/`), salvo T8 (`frontend_dev`: `PlanForm.tsx`, `PlanDetalle.tsx` y su test).
> Un solo PR: 29 archivos (72 % de 40). `[P]` = paralelizable con las demás `[P]` del mismo bloque.

## Bloque A — Datos y base

### T1 — Modelo Prisma y clasificación
- [x] **T1.1** `db/schema.prisma`: `PlanCambioRecepcion` y `PlanVersionEmpresa` con sus relaciones inversas
  (design §1).
- [x] **T1.2** `lib/db/modelos-de-negocio.ts`: las dos en `MODELOS_DE_PLATAFORMA`.
- **Hecho:** `pnpm run typecheck` verde y `organizacion-en-modelos.guardia` verde.
- Depende de: nada.

### T2 — Migración `20261114120000_plan_cambio_por_empresa` (depende de T1)
- [x] **T2.1** `migration.sql`: tablas, índices, RLS y `REVOKE` (§1); `plan_version_de` y `plan_tope_rol_de`; los
  ocho `CREATE OR REPLACE` de §2.1 (triggers de topes, tarifa, `plan_de_la_empresa`, `factura_plataforma_abrir`,
  `_tomar_cambio`, `_cuota`) y la espera de `factura_plataforma_cerrar` (§2.2); las recepciones de los pendientes
  previos (§8, R24).
- [x] **T2.2** `down.sql`: negarse con versiones propias; si no, restaurar las ocho funciones de su última
  migración y borrar lo nuevo (R25).
- [x] **T2.3** `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`: ida, pendiente previo con su
  recepción en F, vuelta limpia y vuelta negada con una versión propia (R24, R25).
- **Hecho:** T2.3 verde; `pnpm exec vitest related --run db/migrations/20261114120000_plan_cambio_por_empresa/migration.sql`
  y los disparadores de esquema (`gate.disparadores`) verdes.
- Depende de: T1.

## Bloque B — Fechas y repositorio

### T3 — Fechas puras [P] (depende de nada)
- [x] **T3.1** `lib/planes/recepcion.ts`: `fechaDeRecepcion` y `recordatoriosDe` (§5).
- [x] **T3.2** `tests/unit/planes/recepcion.test.ts`: los cuatro tipos con F inicio y no inicio; d = 0, 1, 3, 4, 7,
  8 y 30; el de 1 día que cae antes de guardar; guardado el 11 con recepción el 16 → 13 y 15 (R1, R21).
- **Hecho:** T3.2 verde.

### T4 — Contratos y tipos [P] (depende de T1)
- [x] **T4.1** `lib/interfaces/repositories/IPlanesRepository.ts`: `recibirCambio`, `recepcionesVencidas`,
  `repartirRecordatorioDeEmpresa`; `cambio_a_medias` en los resultados de editar, archivar y cancelar; `espera` en
  `ResultadoAplicar`; `recibidas` y `total` en el pendiente del detalle; `recordatorio_3` en `AvisoCorreoPlan`.
- [x] **T4.2** `lib/types/planes.ts`: `PlanResult` con `cambio_a_medias`.
- [x] **T4.3** `lib/planes/mensajes.ts`: `recordatorio_3` (asunto e intro de R22), los mensajes de R14, R15 y R16 y
  el texto «N de M empresas ya lo recibieron» (R11).
- **Hecho:** `pnpm run typecheck` verde (con stubs que lanzan en el repositorio, si hace falta, hasta T5).

### T5 — Repositorio (depende de T2, T3, T4)
- [x] **T5.1** `programarCambio`: cerrojos empresa → plan, recepciones, trabajos con empresa, recordatorios y el
  correo por empresa con su fecha y su versión (§3.1, §6; R1, R13, R20, R21).
- [x] **T5.2** `recibirCambio` y `recepcionesVencidas` (§3.3; R2–R8, R10).
- [x] **T5.3** `aplicarCambioProgramado` como promoción, y `aplicarVersion` con `sincronizarModulos: false` (§3.2; R10).
- [x] **T5.4** `cancelarCambio`, `archivar` y `editar` con `cambio_a_medias` (§3.4; R14–R16).
- [x] **T5.5** `aplicarEnTx`: entrar, salir y cambiar de tipo con un pendiente (§3.5; R17–R19).
- [x] **T5.6** `planDeEmpresa`, `detalle` y `repartirRecordatorioDeEmpresa`; `repartirRecordatorio` legado filtrado
  (§3.6; R11, R12, R22, R24).
- [x] **T5.7** `lib/planes/consumo.ts`: la vista del pendiente con `recibidas` y `total`.
- [x] **T5.8** `lib/services/PlanesService.ts`: `cambio_a_medias` pasa tal cual en `editar`, `archivar` y
  `cancelarCambio` (§7).
- **Hecho:** typecheck y lint verdes; T6 y T7 verdes.

## Bloque C — Cola y correos

### T6 — Trabajos (depende de T5)
- [x] **T6.1** `lib/planes/jobs-cambio-plan.ts`: `plan_aplicar_cambio` y `plan_recordatorio_cambio` con y sin
  empresa; `dias` 7, 3 o 1 con `recibeAt`; `recordatorio_3` en el aviso; el barrido en el orden recepciones →
  planes → empresas (§4).
- [x] **T6.2** `lib/services/email/plantillas/cambio-plan.ts`: el tipo nuevo.
- [x] **T6.3** `tests/unit/cron/procesar-jobs-plan-cambio.test.ts`: los dos usos de cada trabajo, payloads
  malformados, el orden del barrido y que siguen siendo de núcleo (R5, R27).
- [x] **T6.4** `tests/unit/services/email/plantilla-cambio-plan.test.ts`: el correo de 3 días (R22).
- **Hecho:** T6.3 y T6.4 verdes.

## Bloque D — Tests de integración (dependen de T5 y T6) [P]

### T7
- [x] **T7.1** `tests/integration/db/planes-cambio-por-empresa.test.ts` (nuevo): R1, R4–R6, R10, R11 (lectura),
  R13–R19. Casos mínimos: quincenal y mensual con F = 16 de noviembre; la quincenal recibe el 16 y la mensual el 1
  de diciembre; la promoción al recibir la mensual; módulos con una excepción que sobrevive; tope pasado; reemplazo
  del 21 de noviembre (P6); cancelar con y sin recepciones; archivar a medias y sin empresas; «De inmediato» con el
  plan partido; entrar antes y después de F; salir la última; cambio de tipo mensual → bimestral.
- [x] **T7.2** `tests/integration/db/planes-version-por-empresa.test.ts` (nuevo): R2, R12, R26 (triggers con SQL a
  mano, tarifa, `plan_de_la_empresa`, `planDeEmpresa`, `servi_app` → `42501` en las dos tablas).
- [x] **T7.3** `tests/integration/db/planes-cambio-correos.test.ts`: R20–R22; ajustar sus casos de R42 por plan.
- [x] **T7.4** `tests/integration/db/planes-cambio-programado.test.ts`: R13, R15; ajustar los casos de aplicar
  entero (SL-24 R38) y de archivar con pendiente (SL-24 R40).
- [x] **T7.5** `tests/integration/db/factura-plataforma-cambio-plan.test.ts`: R7 y R9; el caso m4 de SLT-118 R39 se
  rehace con la recepción.
- [x] **T7.6** `tests/integration/db/planes-periodicidad-ordenes.test.ts`: R8, por empresa.
- [x] **T7.7** `tests/integration/db/plan-precio-historial.test.ts`: R3 con la cola.
- [x] **T7.8** `tests/integration/db/planes-historial.test.ts`: `cambio_aplicado` al promover (R10).
- [x] **T7.9** `tests/unit/services/planes-service.test.ts`: R14, `cambio_a_medias` y el rol de empresa sin
  llamadas al repositorio.
- **Hecho:** los nueve verdes con `pnpm exec vitest related --run` sobre los archivos de T5 y T6.

## Bloque E — Pantalla

### T8 — Detalle del plan (depende de T4; `frontend_dev`)
- [x] **T8.1** `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`: la línea «N de M empresas ya lo
  recibieron» bajo el cambio programado y el mensaje de R14 o R15 al rechazar.
- [x] **T8.2** `app/(app)/plataforma/planes/_components/PlanForm.tsx`: `cambio_a_medias` en `RECHAZOS` (R16).
- [x] **T8.3** `tests/components/PlanDetalle.test.tsx`: R11 y R15.
- **Hecho:** T8.3 verde; lint verde.

## Cierre

### T9 — Gate (depende de todo)
- [ ] `./init.sh` verde; E2E de planes y grupo `dinero` en local antes del PR (`docs/perfil-agentes.md`).
- [x] Mapa `R<n> → test` en `progress/impl_SLT-128.md` (R1–R27).
- **Hecho:** gate verde y el mapa completo.

## Archivos esperados

Producción (16):
- `db/migrations/20261114120000_plan_cambio_por_empresa/migration.sql`
- `db/migrations/20261114120000_plan_cambio_por_empresa/down.sql`
- `db/schema.prisma`
- `lib/db/modelos-de-negocio.ts`
- `lib/planes/recepcion.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/services/PlanesService.ts`
- `lib/types/planes.ts`
- `lib/planes/jobs-cambio-plan.ts`
- `lib/planes/mensajes.ts`
- `lib/planes/consumo.ts`
- `lib/services/email/plantillas/cambio-plan.ts`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` (2026-11-12, aceptado por el humano: el tipo `pendiente` del detalle gana `recibidas` y `total`)

Tests (19):
- `tests/unit/planes/recepcion.test.ts`
- `tests/integration/db/planes-cambio-por-empresa.test.ts`
- `tests/integration/db/planes-version-por-empresa.test.ts`
- `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`
- `tests/integration/db/planes-cambio-correos.test.ts`
- `tests/integration/db/planes-cambio-programado.test.ts`
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
- `tests/integration/db/planes-periodicidad-ordenes.test.ts`
- `tests/integration/db/plan-precio-historial.test.ts`
- `tests/integration/db/planes-historial.test.ts`
- `tests/unit/cron/procesar-jobs-plan-cambio.test.ts`
- `tests/unit/services/email/plantilla-cambio-plan.test.ts`
- `tests/unit/services/planes-service.test.ts`
- `tests/components/PlanDetalle.test.tsx`
- `tests/unit/services/planes-service-asignar-costo.test.ts` (2026-11-12: dobles con `recibidas` y `total`)
- `tests/unit/services/planes-service-costo-porcentual.test.ts` (2026-11-12: ídem)
- `tests/unit/services/planes-service-lecturas.test.ts` (2026-11-12: ídem)
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` (2026-11-12, aceptado por el humano: el doble de `tx` sin `planCambioProgramado`, D16)
- `tests/unit/planes/jobs-cambio-empresa.test.ts` (2026-11-12, aceptado por el humano: los dobles del barrido sin `recepcionesVencidas` ni `recibirCambio`)

Total: 35 archivos (29 del plan + 6 aceptados por el humano el 2026-11-12).
