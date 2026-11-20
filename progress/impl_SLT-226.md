# impl SLT-226 «Cobro automático: modelo del cobro e idempotencia»

## Tanda 1 (T0–T3), 2026-11-20 — BLOQUEADA en T0.3

Base de la feature: `postgresql://postgres@localhost:5432/servi_logistic_slt226` (migrada hasta
`20261124120000_cobro_historial_enum`, catálogos sembrados).

### Hecho
- T0.1, T0.2, T0.4, T0.5, T0.6: anotados en `design.md` (§1.4, §3.5, §5, §11).
- T1.1, T1.2: `db/migrations/20261124120000_cobro_historial_enum/{migration.sql,down.sql}`. Ida y vuelta en una
  base desechable: la lista de los dos enums queda igual que antes; el down es idempotente y borra solo las
  filas del historial con los valores nuevos.
- `db/schema.prisma`: los dos valores nuevos de los enums del historial (parte de T3.1), para que la base y el
  esquema no deriven.

### Bloqueo (T0.3)
Con `creado_por` FK `RESTRICT` a un usuario de la empresa y el trigger `cobro_intento_sin_borrar`, una empresa con
intentos no se puede limpiar por ningún orden, y el borrado de la demo choca con `SL226` aunque `creado_por` sea
nulo. Detalle en `design.md > §1.1 > T0.3`. T2–T3 esperan la decisión.

### Verificación
- `pnpm exec prisma validate`: válido.
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma`: empty migration.
- `pnpm run typecheck` (con `--max-old-space-size=8192`; sin él, el proceso muere por memoria): verde.
- `pnpm run lint`: 0 errores, 249 avisos, todos previos.
- `pnpm run test:guardias`: 360 archivos y 5426 tests en verde, 1 saltado.

### Mapa R<n> → test
Pendiente: los tests llegan en T4–T7.

Veredicto: T0 (menos T0.3) y T1 cerradas; la tanda queda BLOQUEADA en T0.3 hasta que se decida.
