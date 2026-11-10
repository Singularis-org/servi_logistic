# SLT-118 «Planes: factura por empresa y período con la cuota y las órdenes» · bitácora del implementer

## Tanda 1 (antes del cambio de diseño)
- `d237afe7` T1.1–T1.2: modelo `FacturaPlataforma`, `factura_plataforma_cerrar` en `JobTipo`, clasificación.
- `0e58af60` T2.1–T2.3: migraciones `20261111130000_factura_plataforma_job_enum` y `20261111130100_factura_plataforma`.

## Tanda 2 — rehacer schema y migración (T1.3, T2.4–T2.6) · `025a3f2a`
Subagente: `backend_dev`.

Archivos:
- `db/schema.prisma`: `Plan.periodicidadOrdenes` (`@default("quincenal")`); en `FacturaPlataforma`, `periodicidad`,
  las 5 `cuota*`, la marca `primeraCuotaDesdeAt` y las 8 `primeraCuota*`.
- `db/migrations/20261111130100_factura_plataforma/migration.sql`: columna y CHECK de `plan.periodicidad_ordenes`;
  columnas y CHECK de design §1.1; trigger (periodicidad congelada en `por_cerrar`, marca solo de nula a valor);
  `abrir`/`avanzar`/`tomar_cambio` (firma de T2) por §2.2–§2.3; `cifras` → `ordenes(org,desde,hasta)` +
  `cuota(org,tramo_desde,plan,tipo,primera)`; `cerrar` con la espera de R39 y las dos cuotas; `en_curso` con
  `periodicidad`, `cuota_prevista` y `primera_cuota_prevista`; tope del pago suma `cuota + primera_cuota`; siembra
  desde el inicio del corte, sin marca.
- `db/migrations/20261111130100_factura_plataforma/down.sql`: negativa si hay una cerrada con `cuota` o
  `primera_cuota` no nulas; DROP con las firmas nuevas; `DROP COLUMN "periodicidad_ordenes"`.

Decisiones del subagente (no fijadas por el design):
- `factura_plataforma_cuota` devuelve cero filas si no hay cuota; el nombre del plan se lee de `plan` al cerrar.
- El plan de la primera cuota es el de la factura cuyo `desde` es la marca (también en una `por_cerrar` con la marca
  en su `hasta`).
- JSON de `en_curso`: `cuota_prevista` y `primera_cuota_prevista`, cada una
  `{plan_id, plan_nombre, tipo_cobro, desde, hasta, precio_mensual, cuota, dias_cobrados, dias_periodo}` o `null`.
  T4.1/T8.1 leen esas claves.

Pregunta abierta: sin cambio pendiente, `en_curso` calcula la cuota prevista con el plan vigente (design §2.6) y
`cerrar` con el plan de la factura siguiente; solo difieren en el caso heredado de R15 (pendiente a mitad de
factura). ¿Se igualan?

Verificación:
- `prisma generate` con URL vacía sin credenciales: cliente generado.
- typecheck: 1 error heredado de T1 (`lib/modulos/reparto.ts:224`, falta `factura_plataforma_cerrar` en
  `MODULO_POR_JOB`); lo cierra T4.4.
- `pnpm test:guardias`: 336 archivos verdes; 6 tests rojos = 4 baseline (`dependencias-declaradas-presentes`) +
  `jobs-handler-por-tipo` (T4.4) + `rls-por-empresa` 89→90 (T5.2). Los dos últimos vienen de `0e58af60`.
- `db:migrate`/`db:rollback`: sin base desechable en esta máquina (sin Docker ni psql); quedan para el CI.
