# SLT-85 — traza-facturacion-cobros · tasks.md

> Diseño: `design.md`. Requisitos: `requirements.md` (R1–R27). Las marcas **(Pn)** remiten a las decisiones
> P1–P4, cerradas el 2026-11-09 (tabla «Decisiones cerradas»). El exceso de líneas del PR está aceptado
> por el humano (2026-11-09): un solo PR.
> Capa: todo es `backend_dev` (`db/`, `lib/db/`, `scripts/`, `tests/`). Sin pantalla.

## T1 — Modelo Prisma y clasificación
- [ ] **T1.1** Añadir `CobroPlataformaTraza` a `db/schema.prisma` (design §1.4), con las relaciones
  inversas en `Orden`, `Organizacion` y `CobroPlataformaMovimiento`, y el comentario de lo que vive solo
  en el SQL.
- [ ] **T1.2** Añadir la entrada a `lib/db/modelos-de-negocio.ts`.
- **Hecho:** `pnpm run typecheck` verde; `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`
  imprime los tres `sme_*` (orden, movimiento, reverso_de) y el de «sin cambio de empresa».
- Depende de: nada.

## T2 — Migración (depende de T1)
- [ ] **T2.1** Comprobar cómo aplica el runner una `migration.sql` (¿transacción?) y decidir si el archivo
  lleva `BEGIN`/`COMMIT` (design §3, «Atomicidad»).
- [ ] **T2.2** `db/migrations/20261109120000_cobro_plataforma_traza/migration.sql`, pasos 1–7 de design §3:
  tabla con `CHECK`, únicos, índices, FK, RLS, política, `REVOKE`; triggers de misma empresa pegados de
  `--faltantes`; trigger de inmutabilidad `SL085` (P3); función y trigger `cobro_plataforma_traza_al_registrar`
  (P1); `LOCK`; relleno en dos sentencias (P2); bloque `DO` de cierre.
- [ ] **T2.3** `down.sql` (design §3.1): precondición `reconstruido = false` (P4), `DROP` de triggers y
  funciones, `DROP TABLE`.
- **Hecho:** `pnpm run db:migrate` y `pnpm run db:rollback` en una base desechable con movimientos
  sembrados de los cuatro tipos de fuente; la vuelta deja `cobro_plataforma_movimiento` idéntico
  (mismo `count` y `sum`).

## T3 — Guardias y contadores (depende de T2) [P]
- [ ] **T3.1** `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`: patrones de la tabla
  nueva y sus casos en la contraprueba (R25).
- [ ] **T3.2** `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 88 → 89, con la línea del comentario.
- [ ] **T3.3** `scripts/verificar-rls-despliegue.ts`: `TRIGGERS_MISMA_EMPRESA` 172 → 175 (la cifra que dé
  `--faltantes`), con la línea del comentario.
- **Hecho:** `pnpm run test:guardias` verde.

## T4 — Tests de integración (dependen de T2) [P entre sí]
- [ ] **T4.1** `tests/integration/db/cobro-plataforma-traza.test.ts`: R1–R16 y R27 (design §6).
- [ ] **T4.2** `tests/integration/db/cobro-plataforma-traza-aislamiento.test.ts`: R21–R24 y R26, con dos
  empresas (`crearOrganizacion`, `comoApp`, `fijarEmpresa`).
- [ ] **T4.3** `tests/integration/db/migracion-slt85-ida-y-vuelta.test.ts`: R17–R20, con
  `aplicarMigracionesHasta`.
- **Hecho:** los tres verdes con `HAY_BASE_DE_DATOS`; `cobro-plataforma-cargos.test.ts`,
  `cobro-porcentual-estados-finales.test.ts`, `cobro-plataforma-porcentual-aislamiento.test.ts` y
  `migracion-slt83-ida-y-vuelta.test.ts` siguen verdes (R4).

## T5 — Cierre (depende de T3 y T4)
- [ ] **T5.1** Mapa `R<n> → test` en `progress/impl_SLT-85.md` (design §6).
- [ ] **T5.2** `./init.sh` verde (los disparadores de `db/` corren `migration`, `migracion`, `demo-qa`,
  `sql-real` y `verificar-rls`).
- [ ] **T5.3** E2E en local, base desechable nueva: `pnpm exec playwright test --project=dinero`,
  `e2e/cobro-plataforma-sl40.spec.ts`, `e2e/planes-costo-porcentual.spec.ts`, `e2e/planes-costeo.spec.ts`,
  `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts` y `e2e/dos-empresas-humo.spec.ts`. Constancia en
  `progress/impl_SLT-85.md`.
- [ ] **T5.4** Una línea en `docs/architecture.md > Multi-empresa` (junto a «Planes y límites»): la tabla,
  quién la escribe (el trigger sobre `cobro_plataforma_movimiento`), que no se edita y que el relleno sale
  `reconstruido`.
- **Hecho:** todo verde y el mapa completo, sin ningún `R` sin test.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261109120000_cobro_plataforma_traza/migration.sql`
- `db/migrations/20261109120000_cobro_plataforma_traza/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `scripts/verificar-rls-despliegue.ts`
- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/integration/db/cobro-plataforma-traza.test.ts`
- `tests/integration/db/cobro-plataforma-traza-aislamiento.test.ts`
- `tests/integration/db/migracion-slt85-ida-y-vuelta.test.ts`
- `docs/architecture.md`
- `progress/impl_SLT-85.md`
- `progress/features/SLT-85.md`
