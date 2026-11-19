# Tasks — SLT-212 «Rojos en dev: demo-qa (pago a la plataforma) y escenario 459 (gestión que no vuelve en el cierre)»

- [x] T1 · Reproducir A y B sobre `origin/dev` en base desechable, con comando y salida en la bitácora. R4, R5
- [x] T2 · Migración `20261119120100_cobro_plataforma_ocurrido_utc` con su `down.sql` (solo el reloj de los cuatro `INSERT`). R1–R3
- [x] T3 · Test `cobro-plataforma-ocurrido-utc.test.ts` con sesión a +14 h; mutación con `down.sql` en rojo. R1–R3
- [x] T4 · Fixture 459: `solicitarCierre` y `aprobarCierre` con `comoApp`; mutación con una central ajena commiteada. R5, R6
- [x] T5 · Lista de migraciones de `orden-traspaso-migration.test.ts` tras el merge de dev. —
- [x] T6 · Suite `tests/integration/db` y `demo-qa.test.ts` dentro de la ventana roja. R4, R6
- [x] T7 · E2E de cobro/factura/pago de la plataforma y proyecto `dinero` en local, tras `next build`. R2, R4
- [ ] T8 · Aprobación de Carlos (toca funciones de cobro) y `gate-completo` verde en el PR.

## Archivos esperados

- `db/migrations/20261119120100_cobro_plataforma_ocurrido_utc/migration.sql`
- `db/migrations/20261119120100_cobro_plataforma_ocurrido_utc/down.sql`
- `tests/integration/db/cobro-plataforma-ocurrido-utc.test.ts`
- `tests/integration/db/_fixtures/caja-459.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `progress/impl_SLT-212.md`
- `progress/features/SLT-212.md`
