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

## Tanda 3 — toma del cambio, repositorio, proceso y guardias (T3.1, T4.1–T4.4, T5.1–T5.2) · sin commit
Subagente: `backend_dev`.

Archivos:
- `lib/repositories/PlanesRepository.ts`: `aplicarEnTx` llama a `factura_plataforma_tomar_cambio(empresa, desde, plan, tipo)` antes del `UPDATE "organizacion"`.
- `lib/types/factura-plataforma.ts` (nuevo): `EstadoFactura`, `PeriodicidadFactura`, `PlanDeLaFactura`, `CuotaDeLaFactura` (forma de `cuota_*`/`primera_cuota_*` y de las previstas de `en_curso`) y `FacturaPlataformaDTO`.
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts` (nuevo): `empresasACerrar()`, `cerrar(org, ahora)`. Las lecturas quedan para T8.1.
- `lib/repositories/FacturaPlataformaRepository.ts` (nuevo): las dos, en `comoPlataforma("SL-24", …)`; `cerrar` = `SELECT factura_plataforma_cerrar(…)`.
- `lib/db/excepciones-aislamiento.ts`: su entrada en `EXCEPCIONES_DE_PLATAFORMA`.
- `lib/planes/jobs-factura-plataforma.ts` (nuevo): composition root, recurrencia HH:10 (`factura_plataforma_cerrar:<AAAA-MM-DDTHH>`), siembra y handler (R12).
- `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`, `scripts/siembra-jobs-recurrentes.ts`: registro.
- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`: detectores, contraprueba y barrido de `factura_plataforma` (R22).
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 89 → 90.

Decisiones: `empresasACerrar` devuelve todas las empresas (por `createdAt`): `cerrar` también abre la primera factura de
una empresa nueva y avanza la en curso, así que filtrar por «tiene por cerrar» dejaría fuera esos casos.

Bloqueo: el registro del tipo nuevo pone rojos tests que enumeran handlers/recurrencias, fuera de los archivos
permitidos: `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`, `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`
(lista, ventana horaria a los :10 y la prueba de idempotencia contra Postgres de `sembrarCierreFacturas`, que pide un test de
integración), `tests/unit/api/procesar-jobs-registro.test.ts`, `tests/unit/services/jobs-registro.test.ts`,
`tests/integration/api/procesar-jobs-geocodificacion.test.ts`, `tests/integration/api/procesar-jobs-webhook-estado.test.ts`;
y T3.1 pone rojo `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` (cuenta 1 `$executeRaw`, ahora 2).

Verificación: typecheck verde; eslint de los 11 archivos verde; `test:guardias` 8 rojos = 4 baseline + 4 del bloqueo.

## Tanda 4 — rama verde y cuota prevista igual a `cerrar`
Subagente: `backend_dev`.

Archivos:
- `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`, `tests/unit/api/procesar-jobs-registro.test.ts`,
  `tests/unit/services/jobs-registro.test.ts`, `tests/integration/api/procesar-jobs-geocodificacion.test.ts`
  (size 4 → 5 y `has`), `tests/integration/api/procesar-jobs-webhook-estado.test.ts` (lista en orden de inserción):
  `factura_plataforma_cerrar` en los censos EXACTOS de handlers y recurrencias.
- `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`: el tipo en el censo; `MAS_TARDE_POR_TIPO` =
  16:09:59.999 (desde 16:00 la ventana es la corrida de las 16:10); la prueba de idempotencia contra Postgres
  (`factura-plataforma-cierre.test.ts`, `sembrarCierreFacturas`) en el frente 4.
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: 2 `$executeRaw`, en orden: primero
  `factura_plataforma_tomar_cambio(` con `[empresa, desde, plan, tipo]` y después `UPDATE "organizacion"`.
- `tests/integration/db/factura-plataforma-cierre.test.ts` (nuevo, solo un `it`; T6.1 lo completa): sembrar dos
  veces en la misma ventana (10:01 y 10:09) y re-agendar dejan UNA fila (`contarJobs`); clave `…:2026-11-01T10`.
- `db/migrations/20261111130100_factura_plataforma/migration.sql` (decisión 2026-11-11, design §2.6): en
  `factura_plataforma_en_curso`, sin pendiente con efecto ≤ fin, la cuota prevista usa el plan de la factura
  siguiente N (`desde` = fin, la misma consulta que `cerrar`); si N no existe (la en curso), el que `abrir` le
  copiará: el vigente de la empresa. Inline, sin función nueva (una función obligaría a tocar `down.sql`).

Verificación (2026-11-11, implementer): typecheck verde; eslint de los 8 tests verde; `test:guardias` 4 rojos, todos
de `dependencias-declaradas-presentes` (baseline), 4808 pasan; los 5 tests de registro/repositorio tocados 25/25
verdes; `vitest related` lote 1 (5 archivos de `lib/` de facturas y planes) 18 archivos verdes, 38 skipped; lote 2
(`route.ts`, `excepciones-aislamiento`, `modelos-de-negocio`, `reparto`): rojos solo en 4 archivos del baseline
(`habilitacion-api-migration`, `vista-filtro-migration`, `premio-ranking-devengo-migration`,
`orden-traspaso-migration`) y 2 timeouts de 20 s por carga en `CierresDescargaColumnas` y `SatelitePaginacion`
(componentes, ajenos al diff). La integración contra Postgres corre en CI.
