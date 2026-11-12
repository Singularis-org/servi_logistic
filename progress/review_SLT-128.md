# Review SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período»

> Reviewer, 2026-11-12. Diff: `origin/feature/SLT-118-planes-facturar-periodo-en-curso...HEAD` (894cfe23), rama apilada
> sobre SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes». Ruta completa (backend, high, toca
> dinero y cola): correcta. PR borrador #132, base `feature/SLT-118-…`.
> Grafo: no se usó; Grep/Read sobre el worktree.

## Checklist

- [x] **Ruta**: completa, con requirements/design/tasks. Toca dinero (cuota, tarifa por orden) y la ruta es la completa.
- [x] **Trazabilidad R1–R27**: cada R tiene al menos un test con nombre que lo cita y aserciones de su caso (revisados
  los títulos y los cuerpos de R1, R5, R11, R13–R19, R21, R22, R24, R25). Mapa completo en `progress/impl_SLT-128.md`.
  R23 → `tests/unit/services/planes-service-periodo.test.ts` (existente, verde). Los de integración (R2–R4, R6–R10,
  R12–R20, R24–R26) **no se han ejecutado nunca** (ver B1).
- [ ] **Tasks**: T1–T8 `[x]`; **T9 sin marcar** («`./init.sh` verde; E2E de planes y grupo `dinero` en local»).
- [x] **Tamaño**: `node scripts/tamano-pr.mjs` → aviso, 92/40 contra la base del script; aceptado por el humano
  (`<!-- tamano-pr-aceptado -->` en `progress/features/SLT-128.md`, 35 archivos del diff real). Decidido, no es hallazgo.
- [x] **Lo que ya existe** (design.md): presente y concreto; el diff no re-crea nada de la lista (reusa
  `fechaDeEfectoPorDefecto`, `inicioDelPeriodoCalendario`, `aplicarEnTx`, `cambiarModulos`, `plan_precio_historial`).
- [x] **Typecheck**: `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → 0 errores.
- [x] **Lint**: `eslint` sobre los 37 `.ts/.tsx` del diff → exit 0.
- [x] **Guardias**: `pnpm run test:guardias` → 4 rojos, todos de `dependencias-declaradas-presentes.guardia.test.ts`,
  que está en `tests/baseline-rojos.json` (no es hallazgo); 4822 verdes.
- [x] **Tests del diff sin base**: 12 archivos (recepcion, procesar-jobs-plan-cambio, plantilla-cambio-plan,
  planes-service, planes-service-{lecturas,asignar-costo,costo-porcentual,periodo}, jobs-cambio-empresa,
  planes-repository-tipo-cobro, PlanDetalle, migracion-slt128 en disco) → 415 verdes, 5 saltados (los de base).
- [ ] **Integración, migración contra Postgres y E2E**: no corridos en local ni en CI (B1).
- [x] **Multi-empresa / RLS**: las dos tablas nuevas son de plataforma, `ENABLE ROW LEVEL SECURITY` sin políticas y
  `REVOKE ALL … FROM servi_app`; los lectores `plan_version_de`/`plan_tope_rol_de` con `REVOKE EXECUTE … FROM PUBLIC`.
  Columna `empresa_id` en vez de `organizacion_id`: decisión del humano (no es hallazgo). Las queries por empresa
  filtran por `empresa_id`/`organizacion_id`.
- [x] **Migración**: trae `down.sql`; se niega con versiones propias (R25) y repone las ocho funciones (la
  comparación literal en disco pasa en T2.3). No edita migraciones previas.
- [x] **Sin literales de país/moneda** en código nuevo; sin recursos de Ordenex; sin `console.log`; sin dependencias.
- [x] **Capas**: lógica en repositorio/servicio, el servicio deja pasar `cambio_a_medias`; payloads de la cola
  validados con zod (`recibeAtSchema`, `recordatorioDeEmpresaSchema`).
- [x] **Comentarios**: explican el porqué (orden de cerrojos, por qué se compara con el historial, por qué no se
  borran los trabajos viejos).
- [x] **Desvíos de T5/T6/T7** validados: P11 (R3 contra el historial en F) y P12 (fecha del correo cancelado)
  confirmados por el humano; `reemplazaA` solo si aún no la había recibido (coherente con R20); R19 «no se mueve si
  `recibe_at ≤ desde`» (extiende «mismo instante» al caso en que ya debía estar recibida: razonable); R18 promoción
  después del `UPDATE` de la empresa (necesario para R37); historiales separados por id en T7.1/T7.4 (arreglo de
  test, no de producción); T7.5 con segunda empresa para que el nombre salga de la versión propia (mejora la prueba).

## Hallazgos

- **B1 — BLOQUEANTE** (`docs/perfil-agentes.md > reviewer`: «PR que toca `db/`, pantallas o dinero sin constancia de
  los E2E afectados corridos en local»; `CHECKPOINTS.md` gate-completo; T9). Ni los E2E afectados
  (`e2e/planes-superadmin.spec.ts`, `planes-costeo`, `planes-costo-porcentual`, `mi-plan-cambiar-plan`,
  `cierre-modelo-nuevo-plan-porcentual` y el grupo `dinero`) ni los 9 archivos de integración (T2.3 con base, T7.1–T7.8)
  se han ejecutado: la migración nunca corrió contra Postgres. Además, **el CI de #132 no los va a correr**: `gate.yml`
  solo se dispara en PR a `dev`/`prod` (y no en borradores); la base de #132 es la rama de SLT-118, y su
  `statusCheckRollup` solo trae Vercel. Para levantarlo, sin tocar código: correr `gate` por `workflow_dispatch` sobre
  `feature/SLT-128-planes-cambios-por-periodo` (da `gate-completo` + `e2e`) o una base desechable local, y dejar la
  constancia en `progress/impl_SLT-128.md` (y T9 en `[x]`). Si algún caso de integración sale rojo, vuelve al
  implementer.
- **m1 — menor** (R11). `recibidas`/`total` cuentan solo filas de `plan_cambio_recepcion`: una empresa que entra al
  plan en F o después (R17, entra con la versión nueva, sin recepción) no figura en «N de M», aunque ya corre la
  versión nueva. El texto puede decir «1 de 1» con dos empresas en el plan. No contradice la letra de R11, pero
  conviene anotarlo para SLT-130 «Planes: formulario por pasos compartido en un sheet (crear y editar)» o una deuda.
- **m2 — menor** (R8/R9). Una recepción que falla por R8 (empresa quincenal asignada después que recibe órdenes
  mensuales) se queda sin recibir para siempre: el barrido horario la reintenta y falla cada hora, el plan no se
  promueve, no se puede archivar y `factura_plataforma_cerrar` deja de cerrar facturas de esa empresa desde esa
  recepción. Es lo que pide el spec («el plan espera»), pero no hay aviso ni salida operativa documentada. Anotar
  como deuda.
- **m3 — menor** (cola). Los trabajos `plan_aplicar_cambio`/`plan_recordatorio_cambio` de una recepción movida (R19)
  o de un pendiente reemplazado quedan encolados y terminan en no-op; es el diseño (§4), solo ruido en `jobs`.

## Veredicto

**RECHAZADO** — un solo bloqueante (B1): falta la constancia de integración, migración y E2E ejecutados; el CI de
#132 no los corre. No hay hallazgos de código bloqueantes en la lectura; si la corrida sale verde y se registra,
esta revisión pasa a OK sin otra vuelta de código.
