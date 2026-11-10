# SLT-118 — planes-facturar-periodo-en-curso · tasks.md

> Diseño: `design.md` («§N»). Requisitos: `requirements.md` (R1–R28). P1–P5 cerradas (2026-11-10). P6–P8
> abiertas: R28 lleva **(propuesta, P6)**; si el humano la cambia, se rehace R28 (y T3.2, T6.2) antes de
> implementar. P7 y P8 van a una ficha aparte y no bloquean estas tareas.
> Capa: todo es `backend_dev` (`db/`, `lib/`, `app/api/`, `scripts/`, `tests/`). Sin pantalla.
> Un solo PR (P5 aceptado); los bloques A y B solo ordenan el trabajo.

## Bloque A — Facturas, cierre y toma del cambio

### T1 — Modelo Prisma y clasificación
- [ ] **T1.1** `db/schema.prisma`: modelo `FacturaPlataforma` (design §1.1, §1.4), relación inversa en
  `Organizacion`, valor `factura_plataforma_cerrar` en `JobTipo`, comentario de lo que vive solo en SQL.
- [ ] **T1.2** `lib/db/modelos-de-negocio.ts`: la entrada nueva.
- **Hecho:** `pnpm run typecheck` verde.
- Depende de: nada.

### T2 — Migraciones (depende de T1)
- [ ] **T2.1** `db/migrations/20261110130000_factura_plataforma_job_enum/` (design §6.1): `migration.sql` sola
  y `down.sql` con la función de reversión `_slt118`.
- [ ] **T2.2** `db/migrations/20261110130100_factura_plataforma/migration.sql` (design §6.2), con
  `BEGIN`/`COMMIT`: tabla y CHECK (plan de la factura en todos los estados, cuota con su precio, sin días);
  únicos (incluido el parcial); FK `CASCADE`; RLS, política, `REVOKE`; sin cambio de empresa; inmutabilidad
  `SL118` (cerrada entera; plan, `desde` y `hasta` de una `por_cerrar`); funciones §2.1–§2.6
  (`plan_costo_del_periodo`, `avanzar` que copia el plan al abrir, `tomar_cambio`, `cifras` con el precio en
  el `desde`, `cerrar`, `en_curso`) con sus `REVOKE` y el `GRANT`; tope del pago §2.7 copiado literal más la
  cuota; siembra con el plan de cada empresa.
- [ ] **T2.3** `down.sql` (R27): precondición «ninguna cerrada con cuota», cuerpo de origen del tope, `DROP`.
- **Hecho:** `pnpm run db:migrate` y `pnpm run db:rollback` en una base desechable: la vuelta deja
  `wallet_movimiento_tope_pago_plataforma` igual a la de `20261024140000` (`pg_get_functiondef`), y con una
  cerrada con cuota el rollback se niega sin cambiar nada.

### T3 — Toma del cambio de plan (depende de T2)
- [ ] **T3.1** `lib/repositories/PlanesRepository.ts`: en `aplicarEnTx`, `factura_plataforma_tomar_cambio`
  con el efecto, el plan y el tipo nuevos, antes del `UPDATE "organizacion"` (design §2.3). Sirve a los
  cambios del superadmin y del maestro (los dos pasan por `aplicarEnTx`).
- [ ] **T3.2** En `tomar_cambio` (T2.2), los tres casos de §2.3: efecto ≤ D (R16), efecto > D con plan (R15:
  nada) y primera asignación con efecto > D (R28, con P).
- **Hecho:** los tests de planes existentes siguen verdes (`pnpm exec vitest related --run
  lib/repositories/PlanesRepository.ts`) y ningún cambio aplicado mueve el fin de una factura con plan.

### T4 — Repositorio y proceso (depende de T2) [P con T3]
- [ ] **T4.1** `lib/types/factura-plataforma.ts` y `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`.
- [ ] **T4.2** `lib/repositories/FacturaPlataformaRepository.ts`: `empresasACerrar`, `cerrar` (design §3). Su
  entrada en `lib/db/excepciones-aislamiento.ts`.
- [ ] **T4.3** `lib/planes/jobs-factura-plataforma.ts`: handler (R12), recurrencia a los :10, siembra,
  composition root (design §4).
- [ ] **T4.4** Registro: `app/api/cron/procesar-jobs/route.ts` (`buildHandlers`, `buildRecurrencias`,
  `RECURRENTES_DE_PLATAFORMA`), `lib/modulos/reparto.ts` (`MODULO_POR_JOB`: núcleo),
  `scripts/siembra-jobs-recurrentes.ts` (`SIEMBRAS_RECURRENTES`).
- **Hecho:** `pnpm run test:guardias` verde (`plataforma-solo-en-lista`, `sql-a-mano-por-empresa`,
  `modulos-reparto`); typecheck y lint verdes.

### T5 — Guardias (depende de T2) [P]
- [ ] **T5.1** `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`: detectores y contraprueba
  de `factura_plataforma` / `facturaPlataforma` (R22).
- [ ] **T5.2** `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 89 → 90 con su línea de comentario.
- **Hecho:** `pnpm run test:guardias` verde, y la contraprueba encuentra cada patrón nuevo.

### T6 — Tests del bloque A (dependen de T2–T4) [P entre sí]
- [ ] **T6.1** `tests/integration/db/factura-plataforma-cierre.test.ts`: R1–R9, R11, R14, R26, R27 (R8: cuota
  completa con entrada el 10; precio editado con efecto antes y después del `desde`).
- [ ] **T6.2** `tests/integration/db/factura-plataforma-cambio-plan.test.ts`: R15–R17 y R28, con los casos de
  design §8 (efecto en el inicio del próximo período; efecto a mitad de período sin corte; inicio el 1
  aplicado el 10; aplicado tarde, antes y después de un cierre; primera asignación el 5 y el 18; `SL118` en
  una `por_cerrar`).
- [ ] **T6.3** `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts`: R10 (`plan_costo_del_periodo` ↔
  `montoDelPeriodo`).
- [ ] **T6.4** `tests/unit/planes/jobs-factura-plataforma.test.ts`: R3, R12, R25.
- [ ] **T6.5** `tests/integration/db/factura-plataforma-aislamiento.test.ts`: R13, R21–R23, con dos empresas.
- **Hecho:** los cinco verdes con `HAY_BASE_DE_DATOS`; cada `it` nombra su `R<n>`.

## Bloque B — Cuota en la deuda y lectura en curso

### T7 — Deuda (depende de T2)
- [ ] **T7.1** `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts`: `tipo` con `"cuota"` y
  `facturaPlataforma` en el `Pick`.
- [ ] **T7.2** `lib/repositories/CobroPlataformaMovimientoRepository.ts`: la entrada `cuota` (design §5).
- [ ] **T7.3** `lib/utils/deuda-plataforma.ts`: resta solo `reverso`.
- [ ] **T7.4** `lib/repositories/EmpresasPlataformaRepository.ts`: cuotas por empresa en el listado.
- **Hecho:** `tests/unit/utils/deuda-plataforma.test.ts` y los tests de deuda existentes
  (`deuda-plataforma-wallet`, `deuda-plataforma-plan`, `tope-pago-plataforma-service`) verdes sin cambiar.

### T8 — Lectura en curso (depende de T4.2) [P con T7]
- [ ] **T8.1** `FacturaPlataformaRepository`: `deLaEmpresa` y `deEmpresaParaPlataforma` (design §2.6, §3).
- **Hecho:** typecheck verde; cubierto por T9.2.

### T9 — Tests del bloque B (dependen de T7, T8) [P entre sí]
- [ ] **T9.1** `tests/integration/db/factura-plataforma-deuda.test.ts`: R18–R20.
- [ ] **T9.2** `tests/integration/db/factura-plataforma-aislamiento.test.ts`: añade R24 (en curso con total
  parcial; `42501` con otra empresa), con las dos empresas de T6.5.
- [ ] **T9.3** `tests/unit/utils/deuda-plataforma.test.ts`: el caso `cuota` (R18).
- **Hecho:** verdes con `HAY_BASE_DE_DATOS`.

## Cierre

### T10 — Documentación y gate (depende de todo)
- [ ] **T10.1** `docs/architecture.md > Multi-empresa`: párrafo «Facturas de la plataforma (SLT-118)»: tabla,
  quién escribe, cierre, toma del cambio sin corte, deuda. Y en «Planes y límites», que el costo base deja de
  ser solo informativo al cerrar (sustituye a SLT-66 R21 y a SLT-86 R14 en lo que toca a la cuota) y que la
  factura cobra el período completo, sin el tramo proporcional de SLT-86 R12 (P3, P4).
- [ ] **T10.2** `progress/impl_SLT-118.md`: mapa `R<n> → test`.
- [ ] **T10.3** `./init.sh` verde; en local, `pnpm exec playwright test --project=dinero` y
  `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts` en base desechable (`docs/perfil-agentes.md`).
- **Hecho:** los tres verdes y el mapa sin huecos.

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261110130000_factura_plataforma_job_enum/migration.sql`
- `db/migrations/20261110130000_factura_plataforma_job_enum/down.sql`
- `db/migrations/20261110130100_factura_plataforma/migration.sql`
- `db/migrations/20261110130100_factura_plataforma/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/types/factura-plataforma.ts`
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`
- `lib/repositories/FacturaPlataformaRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/planes/jobs-factura-plataforma.ts`
- `lib/modulos/reparto.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `scripts/siembra-jobs-recurrentes.ts`
- `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts`
- `lib/repositories/CobroPlataformaMovimientoRepository.ts`
- `lib/utils/deuda-plataforma.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `docs/architecture.md`
- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/unit/planes/jobs-factura-plataforma.test.ts`
- `tests/unit/utils/deuda-plataforma.test.ts`
- `tests/integration/db/factura-plataforma-cierre.test.ts`
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
- `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts`
- `tests/integration/db/factura-plataforma-deuda.test.ts`
- `tests/integration/db/factura-plataforma-aislamiento.test.ts`

29 archivos (73 % de `max_archivos` = 40). Líneas estimadas ~1 700, por encima de `max_lineas` = 1 000:
aceptado por el humano (P5, línea `tamano-pr-aceptado` en la ficha). El ajuste del servidor del superadmin
(P7) no está aquí: sumaría ~12 archivos y pasaría de 40.
