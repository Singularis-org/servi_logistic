# SLT-118 — planes-facturar-periodo-en-curso · tasks.md

> Diseño: `design.md` («§N»). Requisitos: `requirements.md` (R1–R33). P1–P8 cerradas (2026-11-10). Abiertas:
> P9 (cuota completa en la factura más corta que deja un cambio de tipo; si cambia, se rehacen R8/R29/R30,
> T3.2 y T6.2), P10 (rango sobre la fecha elegida; si cambia, T11.2 y T12.1) y P11 (tamaño 44 frente a ~41).
> Ninguna bloquea el arranque del bloque A.
> Capa: `backend_dev` (`db/`, `lib/`, `app/api/`, `scripts/`, `tests/`), salvo T11.4, que toca dos pantallas
> del superadmin (solo el texto de una confirmación).
> Un solo PR (P5 y P7 aceptados); los bloques A, B y C solo ordenan el trabajo.

## Bloque A — Facturas, cierre y toma del cambio

### T1 — Modelo Prisma y clasificación
- [ ] **T1.1** `db/schema.prisma`: modelo `FacturaPlataforma` (design §1.1, §1.4, con `dias_cobrados` y
  `dias_periodo`), relación inversa en `Organizacion`, valor `factura_plataforma_cerrar` en `JobTipo`,
  comentario de lo que vive solo en SQL.
- [ ] **T1.2** `lib/db/modelos-de-negocio.ts`: la entrada nueva.
- **Hecho:** `pnpm run typecheck` verde.
- Depende de: nada.

### T2 — Migraciones (depende de T1)
- [ ] **T2.1** `db/migrations/20261110130000_factura_plataforma_job_enum/` (design §6.1): `migration.sql` sola
  y `down.sql` con la función de reversión `_slt118`.
- [ ] **T2.2** `db/migrations/20261110130100_factura_plataforma/migration.sql` (design §6.2), con
  `BEGIN`/`COMMIT`: tabla y CHECK (plan de la factura en todos los estados; cuota con su precio y sus dos
  días, `0 < dias_cobrados <= dias_periodo`); únicos (incluido el parcial); FK `CASCADE`; RLS, política,
  `REVOKE`; sin cambio de empresa; inmutabilidad `SL118` (cerrada entera; plan, `desde` y `hasta` de una
  `por_cerrar`); funciones §2.1–§2.6 (`plan_costo_del_periodo`, `plan_costo_del_tramo`,
  `plan_dias_de_calendario`, `avanzar` que copia el plan al abrir, `tomar_cambio`, `cifras` con el precio en
  el `desde` y el tramo de R29, `cerrar`, `en_curso`) con sus `REVOKE` y el `GRANT`; tope del pago §2.7
  copiado literal más la cuota; siembra con el plan de cada empresa.
- [ ] **T2.3** `down.sql` (R27): precondición «ninguna cerrada con cuota», cuerpo de origen del tope, `DROP`.
- **Hecho:** `pnpm run db:migrate` y `pnpm run db:rollback` en una base desechable: la vuelta deja
  `wallet_movimiento_tope_pago_plataforma` igual a la de `20261024140000` (`pg_get_functiondef`), y con una
  cerrada con cuota el rollback se niega sin cambiar nada.

### T3 — Toma del cambio de plan (depende de T2)
- [ ] **T3.1** `lib/repositories/PlanesRepository.ts`: en `aplicarEnTx`, `factura_plataforma_tomar_cambio`
  con el efecto, el plan y el tipo nuevos, antes del `UPDATE "organizacion"` (design §2.3). Sirve a los
  cambios del superadmin y del maestro (los dos pasan por `aplicarEnTx`).
- [ ] **T3.2** En `tomar_cambio` (T2.2), los tres casos de §2.3: efecto ≤ D (R16), efecto > D con plan (R15:
  nada) y primera asignación con efecto > D (R28: corta en el efecto, sin llevarlo a un inicio de período).
- **Hecho:** los tests de planes existentes siguen verdes (`pnpm exec vitest related --run
  lib/repositories/PlanesRepository.ts`, salvo los que ajusta T12.3) y ningún cambio aplicado mueve el fin de
  una factura con plan.

### T4 — Repositorio y proceso (depende de T2) [P con T3]
- [ ] **T4.1** `lib/types/factura-plataforma.ts` (con los días cobrados y del período) y
  `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`.
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
- [ ] **T6.1** `tests/integration/db/factura-plataforma-cierre.test.ts`: R1–R9, R11, R14, R26, R27 (R8: precio
  editado con efecto antes y después del `desde`).
- [ ] **T6.2** `tests/integration/db/factura-plataforma-cambio-plan.test.ts`: R8 (cambio de tipo que deja una
  factura más corta: período completo), R15–R17, R28, R29 y R33, con los casos de design §8 (efecto en el
  inicio del próximo período; efecto a mitad de período sin corte; inicio el 1 aplicado el 10 → 15 500.00;
  alta el 10 con inicio el 10 → 6 200.00; inicio el 5 → 11 366.67; inicio el 18 futuro aplicado por el
  trabajo → 13 433.33; aplicado tarde, antes y después de un cierre; `SL118` en una `por_cerrar`).
- [ ] **T6.3** `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts`: R10 y R29
  (`plan_costo_del_periodo` ↔ `montoDelPeriodo`; `plan_costo_del_tramo` + `plan_dias_de_calendario` ↔
  `costoDelPeriodoEnCurso`, con la tabla de tramos de design §8).
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
- [ ] **T8.1** `FacturaPlataformaRepository`: `deLaEmpresa` y `deEmpresaParaPlataforma` (design §2.6, §3), con
  la cuota prevista de R8 o R29.
- **Hecho:** typecheck verde; cubierto por T9.2.

### T9 — Tests del bloque B (dependen de T7, T8) [P entre sí]
- [ ] **T9.1** `tests/integration/db/factura-plataforma-deuda.test.ts`: R18–R20.
- [ ] **T9.2** `tests/integration/db/factura-plataforma-aislamiento.test.ts`: añade R24 (en curso con total
  parcial y cuota prevista, también la proporcional de R29; `42501` con otra empresa), con las dos empresas
  de T6.5.
- [ ] **T9.3** `tests/unit/utils/deuda-plataforma.test.ts`: el caso `cuota` (R18).
- **Hecho:** verdes con `HAY_BASE_DE_DATOS`.

## Bloque C — Fecha de efecto del superadmin (P7; R30–R33) [P con los bloques A y B]

### T11 — Servidor y confirmaciones (no depende de T1–T9)
- [ ] **T11.1** `lib/interfaces/repositories/IPlanesRepository.ts`: `vigenteDesde?: string` en el `ok` de
  `ResultadoAsignar`, de `crearYAsignar` y de `ResultadoCambiarTipoCobro`, presente solo con `pendiente`
  (design §3.1).
- [ ] **T11.2** `lib/repositories/PlanesRepository.ts`: en `cambiarEmpresaEnTx`, bajo el cerrojo y antes de
  decidir pendiente o aplicar, lleva un efecto de clase `"cambio"` al inicio del período siguiente con el tipo
  vigente (`fechaDeEfectoPorDefecto`) salvo que ya sea un inicio (`inicioDelPeriodoCalendario`); `"inicio"`
  no se toca (R33). Devuelve la fecha real en `vigenteDesde`. Sin función nueva en `lib/planes/ciclo.ts`.
- [ ] **T11.3** `lib/services/PlanesService.ts` y `lib/types/planes.ts`: `asignar` y `crear` responden con el
  `vigenteDesde` del repositorio; `CambiarTipoCobroResult` gana `vigenteDesde: string | null` y
  `cambiarTipoCobro` lo devuelve. `fueraDeRango` sigue sobre la fecha elegida (P10).
- [ ] **T11.4** `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` (confirmación de
  «Cambiar tipo de cobro» con la fecha real) y `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
  (aviso de «Crear custom» con la fecha real del cambio). El campo de fecha no cambia.
- **Hecho:** typecheck y lint verdes; `pnpm exec vitest related --run lib/repositories/PlanesRepository.ts
  lib/services/PlanesService.ts` verde tras T12.

### T12 — Tests del bloque C (dependen de T11) [P entre sí]
- [ ] **T12.1** `tests/integration/db/planes-cambio-empresa.test.ts`: R30 (asignar con fecha a mitad de
  período en los cuatro tipos y con «hoy» → pendiente en el inicio siguiente: columna del pendiente,
  `run_after` del trabajo, historial), R31 (inicio de período respetado; «hoy» en un inicio se aplica), R33
  (primera asignación futura a mitad de período no se mueve).
- [ ] **T12.2** `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` (R30, R31 con el tipo **vigente**) y
  `tests/integration/db/planes-crear-custom-asigna.test.ts` (R30 en el custom).
- [ ] **T12.3** Ajustar los que usan un cambio con «hoy» o a mitad de período:
  `tests/integration/db/planes-asignacion.test.ts`, `tests/integration/db/plan-de-la-empresa-periodo.test.ts`,
  `tests/integration/db/planes-cancelar-cambio-historial.test.ts` (y los casos de T12.1/T12.2 que ya existían).
  Si otro test de planes se pone rojo por lo mismo, se ajusta y se añade a «Archivos esperados».
- [ ] **T12.4** `tests/unit/services/planes-service-periodo.test.ts` y
  `tests/unit/services/planes-service-tipo-cobro.test.ts`: R30, R32 (la respuesta lleva el `vigenteDesde` del
  repositorio, no el elegido).
- [ ] **T12.5** `tests/components/PlanEmpresaTipoCobro.test.tsx` y `tests/components/PlanesModule.test.tsx`: R32.
- **Hecho:** verdes con `HAY_BASE_DE_DATOS`; cada `it` nombra su `R<n>`.

## Cierre

### T10 — Documentación y gate (depende de todo)
- [ ] **T10.1** `docs/architecture.md > Multi-empresa`: párrafo «Facturas de la plataforma (SLT-118)»: tabla,
  quién escribe, cierre, toma del cambio sin corte, deuda. Y en «Planes y límites»: que el costo base deja de
  ser solo informativo al cerrar (sustituye a SLT-66 R21 y a SLT-86 R14 en lo que toca a la cuota); que la
  factura cobra el período completo salvo la primera con plan más corta, que prorratea con SLT-86 R12 (P6);
  y que el cambio del superadmin rige al inicio del próximo período del tipo vigente (P7; modifica SLT-86
  R16–R18).
- [ ] **T10.2** `progress/impl_SLT-118.md`: mapa `R<n> → test` (R1–R33).
- [ ] **T10.3** `./init.sh` verde; en local, `pnpm exec playwright test --project=dinero` y
  `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts` en base desechable (`docs/perfil-agentes.md`).
- **Hecho:** los tres verdes y el mapa sin huecos.

## Mapa R → test

| Requisito | Test |
|---|---|
| R1–R7, R9, R11, R14, R26, R27 | `tests/integration/db/factura-plataforma-cierre.test.ts` (R3 también `tests/unit/planes/jobs-factura-plataforma.test.ts`) |
| R8 | `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts` |
| R10 | `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` |
| R12, R25 | `tests/unit/planes/jobs-factura-plataforma.test.ts` |
| R13, R21, R23, R24 | `tests/integration/db/factura-plataforma-aislamiento.test.ts` |
| R15, R16, R17, R28 | `tests/integration/db/factura-plataforma-cambio-plan.test.ts` |
| R18 | `tests/integration/db/factura-plataforma-deuda.test.ts`, `tests/unit/utils/deuda-plataforma.test.ts` |
| R19, R20 | `tests/integration/db/factura-plataforma-deuda.test.ts` |
| R22 | `tests/integration/db/factura-plataforma-aislamiento.test.ts`, `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` |
| R29 | `tests/integration/db/factura-plataforma-cambio-plan.test.ts`, `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` |
| R30 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`, `tests/integration/db/planes-crear-custom-asigna.test.ts`, `tests/unit/services/planes-service-periodo.test.ts` |
| R31 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` |
| R32 | `tests/unit/services/planes-service-periodo.test.ts`, `tests/unit/services/planes-service-tipo-cobro.test.ts`, `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanesModule.test.tsx` |
| R33 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts` |

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261110130000_factura_plataforma_job_enum/migration.sql`
- `db/migrations/20261110130000_factura_plataforma_job_enum/down.sql`
- `db/migrations/20261110130100_factura_plataforma/migration.sql`
- `db/migrations/20261110130100_factura_plataforma/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/types/factura-plataforma.ts`
- `lib/types/planes.ts`
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/repositories/FacturaPlataformaRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/services/PlanesService.ts`
- `lib/planes/jobs-factura-plataforma.ts`
- `lib/modulos/reparto.ts`
- `app/api/cron/procesar-jobs/route.ts`
- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
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
- `tests/unit/services/planes-service-periodo.test.ts`
- `tests/unit/services/planes-service-tipo-cobro.test.ts`
- `tests/components/PlanEmpresaTipoCobro.test.tsx`
- `tests/components/PlanesModule.test.tsx`
- `tests/integration/db/factura-plataforma-cierre.test.ts`
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
- `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts`
- `tests/integration/db/factura-plataforma-deuda.test.ts`
- `tests/integration/db/factura-plataforma-aislamiento.test.ts`
- `tests/integration/db/planes-cambio-empresa.test.ts`
- `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`
- `tests/integration/db/planes-crear-custom-asigna.test.ts`
- `tests/integration/db/planes-asignacion.test.ts`
- `tests/integration/db/plan-de-la-empresa-periodo.test.ts`
- `tests/integration/db/planes-cancelar-cambio-historial.test.ts`

44 archivos (110 % de `max_archivos` = 40; el humano aceptó ~41 con P7, ver P11). Sin P7 serían los 29 de
antes; P7 suma 5 de producción y 10 de tests (T11, T12). Líneas estimadas ~2 100, por encima de
`max_lineas` = 1 000 (aceptado con P5 y P7). Choque al mergear con SLT-99 «Planes: el administrador de la
empresa ve su plan y los públicos y cambia de plan» (PR #115) en `lib/repositories/PlanesRepository.ts`,
`lib/interfaces/repositories/IPlanesRepository.ts`, `lib/types/planes.ts` y `lib/db/excepciones-aislamiento.ts`
(design §10).
