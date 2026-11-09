# SLT-85 «Traza de facturación de los cobros por orden» — bitácora de implementación

## Tanda 1 — T1 y T2 (backend_dev, 2026-11-09)

### Archivos
- `db/schema.prisma`: modelo `CobroPlataformaTraza` y relaciones inversas en `Orden`, `Organizacion` y
  `CobroPlataformaMovimiento` (T1.1).
- `lib/db/modelos-de-negocio.ts`: entrada del modelo (T1.2).
- `db/migrations/20261109120000_cobro_plataforma_traza/migration.sql` (T2.2) y `down.sql` (T2.3).

### T2.1 — ¿el runner envuelve la migración en una transacción?
- `prisma migrate deploy` (Prisma 7.8): manda el archivo como un script de varias sentencias, que Postgres
  corre en una transacción implícita. Sonda en una base vacía, sin `BEGIN`: `CREATE TABLE`, `LOCK TABLE`
  y un `RAISE` final. El `LOCK` no dio 25P01 y vio su cerrojo; tras el `RAISE` la tabla no existía.
- El runner de los tests (`ejecutar` y `aplicarMigracionesHasta`, en
  `tests/integration/db/_fixtures/ida-y-vuelta-32.ts`) corre sentencia a sentencia, en autocommit. Ahí un
  `LOCK TABLE` suelto da 25P01 (comprobado) y un fallo del cierre dejaría la tabla a medias.
- Con `BEGIN;`/`COMMIT;` explícitos, el script funciona en los dos runners. Bajo `migrate deploy`, un fallo
  intermedio aborta el bloque y no queda nada (sonda B). 19 migraciones del repo ya lo llevan, p. ej.
  `20261023090000`.
- Decisión: el archivo lleva `BEGIN;` y `COMMIT;`.

### Evidencia
- `prisma validate`: válido. `prisma generate`: escribe en el `node_modules` compartido (junction).
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`, como CI; sin él, OOM): solo 2
  errores, ajenos a este cambio. `lib/validacion/telefono.ts` no encuentra `libphonenumber-js`, que no
  está instalado en el `node_modules` compartido.
- `eslint lib/db/modelos-de-negocio.ts`: limpio.
- `generar-misma-empresa.ts --faltantes`: los 3 `sme_*` (`movimiento_id`, `orden_id`, `reverso_de`) y
  `cobro_plataforma_traza_sin_cambio_de_empresa`, pegados en el paso 2.
- Guardias `unicos-por-empresa`, `fk-misma-empresa` y `organizacion-en-modelos`: verdes.
  `rls-por-empresa`: rojo esperado, 89 frente a 88; es el T3.2.
- Ida y vuelta en `servi_logistic_slt85`. Movimientos: count, sum(monto) y md5 del libro.
  | Paso | Movimientos | Traza |
  |---|---|---|
  | 0 sembrado (todas hasta 20261108120300) | 19 / 12800.00 / 5b88… | no existe |
  | 1 deploy con relleno | 19 / 12800.00 / 5b88… | 19 filas, 19 reconstruidas, 0 descuadres |
  | 2 `db:rollback` | 19 / 12800.00 / 5b88… | no existe, 0 funciones y 0 triggers |
  | 3 deploy otra vez | 19 / 12800.00 / 5b88… | 19, 19 reconstruidas, 0 descuadres |
  | 4 orden porcentual viva (cargo y reverso) | 21 / 14800.00 | 21, 2 en vivo con guía, monto, estado, plan y período |
  | 5 `db:rollback` con filas vivas | 21 / 14800.00 (sin cambios) | el down se niega; `_prisma_migrations` intacto |
- `UPDATE` como dueño sobre la traza: SQLSTATE `SL085`.
- Descuadre = un movimiento sin traza o con otra empresa, orden, tipo, fuente, fecha o valor (±), o un
  reverso que no apunta a la traza del cargo `secuencia − 1`.

### Mapa R → test
Pendiente: T3 y T4 (los tests de integración, design §6).

Veredicto: T1 y T2 hechos; la ida y vuelta deja el libro idéntico y la traza cuadra 1 a 1.
