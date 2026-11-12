# impl SLT-128 «Planes: el cambio programado del plan llega a cada empresa al inicio de su período»

## Tanda 1 (backend_dev, 2026-11-11): T1–T4 — PARADA en una pregunta (guardia R4)

### Archivos
- `db/schema.prisma` — `PlanCambioRecepcion`, `PlanVersionEmpresa` y sus inversas (T1.1).
- `lib/db/modelos-de-negocio.ts` — las dos en `MODELOS_DE_PLATAFORMA` (T1.2).
- `db/migrations/20261114120000_plan_cambio_por_empresa/migration.sql` y `down.sql` (T2.1, T2.2). Los ocho
  `CREATE OR REPLACE` parten de su última definición (20261028130200, 20261113120000, 20261106130000,
  20261111130100); el `down.sql` las repone literalmente (lo comprueba T2.3 en disco).
- `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts` (T2.3).
- `lib/planes/recepcion.ts` y `tests/unit/planes/recepcion.test.ts` (T3).
- `lib/interfaces/repositories/IPlanesRepository.ts`, `lib/types/planes.ts`, `lib/planes/mensajes.ts` (T4).
- `lib/repositories/PlanesRepository.ts` — stubs que lanzan `SLT-128: pendiente T5`.

### Desvíos
- Los tres métodos nuevos van en `IPlanesRecepcionesRepository` (mismo archivo), no en `IPlanesRepository`,
  como `IPlanesDelMaestroRepository`: si no, rompían los dobles de cuatro tests de `PlanesService`.
- `cancelarCambio` del plan devuelve `ResultadoCancelarCambioDelPlan` (= `ResultadoCancelarCambio | cambio_a_medias`):
  `ResultadoCancelarCambio` lo comparte `cancelarCambioEmpresa`, cuyo resultado no cambia.
- `detalle` lanza `SLT-128: pendiente T5` cuando el plan tiene pendiente, hasta que T5.6 cuente las recepciones.
- Índice `(organizacion_id)` en `plan_cambio_recepcion`, además del parcial de §1.1 (la espera del cierre y R18
  buscan por empresa; la PK empieza por el pendiente).

### Abierto
- La guardia `organizacion-en-modelos` (R4) prohíbe `organizacion_id` en un modelo de plataforma; el design §1
  lo pide. Pendiente de decisión humana.

### Mapa R → test (esta tanda)
- R1 → `tests/unit/planes/recepcion.test.ts` (la tabla de tipos).
- R21 → `tests/unit/planes/recepcion.test.ts` (d = 0, 1, 3, 4, 7, 8, 30; el 11 → 13 y 15).
- R24, R25 → `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`.

### Verificación
- `pnpm exec vitest run tests/unit/planes/recepcion.test.ts tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`:
  verde; los 5 casos con base, saltados (sin `HAY_BASE_DE_DATOS`; los corre el CI).
- Guardia `organizacion-en-modelos`: 4 rojos, todos por R4 en los dos modelos nuevos.
- `pnpm run typecheck`: 6 errores fuera de esta tanda (PlanForm.tsx, PlanEmpresa.tsx y tres tests de servicio).
- `eslint` sobre los archivos tocados: limpio.

Veredicto: T1–T4 escritas; bloqueadas por la guardia R4 y por 6 errores de tipos fuera de la tanda.
