# SLT-118 — planes-facturar-periodo-en-curso · tasks.md

> Diseño: `design.md` («§N»). Requisitos: `requirements.md` (R1–R40). P1–P19 cerradas (P19: alta con plan desde
> ese mismo día, sin excepción ni corte al aplicar; es el caso «inexistente» de `tomar_cambio` en T2.5 y un caso de
> T6.2). El spec debe re-aprobarse antes de seguir.
> Capa: `backend_dev` (`db/`, `lib/`, `app/api/`, `scripts/`, `tests/`), salvo T11.4 y T14.4, que tocan
> pantallas del superadmin (dos confirmaciones y un selector del formulario del plan).
> Un solo PR (49 archivos, P16); los bloques solo ordenan el trabajo.
>
> **Estado de la tanda 1.** T1 (`d237afe7`) y T2 (`0e58af60`) están hechas con el diseño de antes (cuota a
> período vencido, factura por período de cobro). Lo que se conserva y lo que se rehace está en design §0; aquí,
> en T1.3 y T2.4–T2.6. Sus casillas quedan marcadas y las nuevas, sin marcar. Los tres desvíos de la tanda 1
> (prefijo `20261111`, `factura_plataforma_abrir`, CHECK más estricto) quedan aceptados (design §0.1).

## Bloque A — Facturas, cierre y toma del cambio

### T1 — Modelo Prisma y clasificación
- [x] **T1.1** `db/schema.prisma`: modelo `FacturaPlataforma`, relación inversa, `factura_plataforma_cerrar` en
  `JobTipo` (`d237afe7`).
- [x] **T1.2** `lib/db/modelos-de-negocio.ts`: la entrada nueva (`d237afe7`).
- [x] **T1.3** *(rehacer)* `db/schema.prisma`: `FacturaPlataforma.periodicidad` (`String`, comentario del CHECK),
  las cinco columnas del plan y el tramo de la cuota (`cuotaPlanId`, `cuotaPlanNombre`, `cuotaTipoCobro`,
  `cuotaDesdeAt`, `cuotaHastaAt`), la marca `primeraCuotaDesdeAt` y las ocho de la primera cuota
  (`primeraCuotaHastaAt`, `primeraCuotaPlanId`, `primeraCuotaPlanNombre`, `primeraCuotaTipoCobro`,
  `primeraCuotaPrecioMensual`, `primeraCuota`, `primeraCuotaDiasCobrados`, `primeraCuotaDiasPeriodo`); y
  `Plan.periodicidadOrdenes`
  (`@default("quincenal") @map("periodicidad_ordenes")`, comentario del CHECK) (design §1.1, §1.2, §0.3).
- **Hecho:** `pnpm run typecheck` verde.
- Depende de: nada.

### T2 — Migraciones (depende de T1)
- [x] **T2.1** `db/migrations/20261111130000_factura_plataforma_job_enum/` (`0e58af60`). Sin cambios.
- [x] **T2.2** `db/migrations/20261111130100_factura_plataforma/migration.sql` con el diseño de antes (`0e58af60`).
- [x] **T2.3** Su `down.sql` (`0e58af60`).
- [x] **T2.4** *(rehacer, en `20261111130100/migration.sql`)*: `plan.periodicidad_ordenes` con su `DEFAULT
  'quincenal'` y su CHECK (R35); `factura_plataforma.periodicidad`, las cinco columnas de la cuota y la marca
  `primera_cuota_desde_at` y las ocho columnas de la primera cuota (P18); los CHECK de design §1.1 (el grupo de la
  cuota de 9 columnas, **sin** «sin plan, sin cuota»; el grupo de la primera cuota de 8 con su marca; las columnas
  nuevas de las dos cuotas solo en la cerrada); el tope del pago suma también `primera_cuota` (§2.7); el trigger de inmutabilidad congela también
  `periodicidad` en una `por_cerrar` y deja la marca solo de nula a un valor.
- [x] **T2.5** *(rehacer, mismo archivo)*: `abrir` copia la periodicidad (la del plan, o `quincenal`); `avanzar`
  saca el fin natural de la periodicidad de la factura (R2); `tomar_cambio` con la firma de T2 (sin `p_ahora`):
  pone la periodicidad del plan nuevo en R16 y en la factura que abre R28, y en una primera asignación la marca de
  la primera cuota (en la emitida en D si no está cerrada; si no, en la factura en curso, sin corte, P18; en R28,
  en la sin plan fijada en E, P17) (design §2.3); `cifras` se sustituye por `ordenes` y `cuota` (design §2.4:
  primera cuota con la marca y el plan de la factura con `desde_at` = marca, al grupo `primera_cuota_*`; después
  la cuota de la emisión con el plan de la factura siguiente; un período una sola vez); `cerrar` con la espera de
  R39 y las dos cuotas de §2.4; `en_curso` con el fin previsto por la periodicidad, la periodicidad en el JSON y
  las dos cuotas previstas con el cambio pendiente (R24); la siembra desde el inicio del corte en curso, sin marca
  (R26, P15).
- [x] **T2.6** *(rehacer, `down.sql`)*: la negativa mira `cuota` o `primera_cuota`; `DROP FUNCTION` con las firmas
  nuevas (`ordenes`, `cuota`; sin `cifras`; `tomar_cambio` con la de T2) y `ALTER TABLE "plan" DROP COLUMN
  "periodicidad_ordenes"` (R27).
- **Hecho:** `pnpm run db:migrate` y `pnpm run db:rollback` en una base desechable: la vuelta deja
  `wallet_movimiento_tope_pago_plataforma` igual a la de `20261024140000` (`pg_get_functiondef`) y `plan` sin la
  columna; con una cerrada con cuota, o solo con primera cuota, el rollback se niega sin cambiar nada.

### T3 — Toma del cambio de plan (depende de T2)
- [x] **T3.1** `lib/repositories/PlanesRepository.ts`: en `aplicarEnTx`, `factura_plataforma_tomar_cambio` con el
  efecto, el plan y el tipo nuevos, antes del `UPDATE "organizacion"` (design §2.3).
- **Hecho:** los tests de planes existentes siguen verdes (`pnpm exec vitest related --run
  lib/repositories/PlanesRepository.ts`, salvo los que ajusta T12.3) y ningún cambio aplicado mueve el fin de
  una factura con plan.

### T4 — Repositorio y proceso (depende de T2) [P con T3]
- [x] **T4.1** `lib/types/factura-plataforma.ts` (con `periodicidad`, la cuota y la primera cuota, cada una con su
  plan, su tramo y sus días, o `null`) y
  `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`.
- [x] **T4.2** `lib/repositories/FacturaPlataformaRepository.ts`: `empresasACerrar`, `cerrar` (design §3). Su
  entrada en `lib/db/excepciones-aislamiento.ts`.
- [x] **T4.3** `lib/planes/jobs-factura-plataforma.ts`: handler (R12), recurrencia a los :10, siembra,
  composition root (design §4).
- [x] **T4.4** Registro: `app/api/cron/procesar-jobs/route.ts`, `lib/modulos/reparto.ts`,
  `scripts/siembra-jobs-recurrentes.ts`.
- **Hecho:** `pnpm run test:guardias` verde (`plataforma-solo-en-lista`, `sql-a-mano-por-empresa`,
  `modulos-reparto`); typecheck y lint verdes.

### T5 — Guardias (depende de T2) [P]
- [x] **T5.1** `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`: detectores y contraprueba
  de `factura_plataforma` / `facturaPlataforma` (R22).
- [x] **T5.2** `tests/unit/guards/rls-por-empresa.guardia.test.ts`: 89 → 90 con su línea de comentario.
- **Hecho:** `pnpm run test:guardias` verde, y la contraprueba encuentra cada patrón nuevo.

### T6 — Tests del bloque A (dependen de T2–T4) [P entre sí]
- [x] **T6.1** `tests/integration/db/factura-plataforma-cierre.test.ts`: R1–R9, R11, R14, R26, R27, con las
  empresas de design §8 (sin plan quincenal; mensual con órdenes quincenales: la cuota del mes en la emitida el 1
  y ninguna en la emitida el 16; anual con órdenes mensuales: la cuota solo en la emitida el 1 de enero; siembra
  P15: ninguna cuota del período en curso, la primera en el próximo inicio de cada tipo).
- [x] **T6.2** `tests/integration/db/factura-plataforma-cambio-plan.test.ts`: R8 (pendiente por SQL a mitad de
  período), R15–R17, R28 (P17: una sola factura emitida en E con órdenes sin plan y la primera cuota), R29 (anual
  desde el 18 con órdenes quincenales: 44 de 365 en la emitida el 18 y ninguna en diciembre; mensual desde el 1
  aplicado el 12: 31 000.00 en la emitida el 16), R16 y R5 (P18: quincenal desde el 1 aplicado el 12 → ninguna
  factura nueva al aplicar y la emitida el 16 con las órdenes del 1 al 15 y las dos cuotas; desde el 1 aplicado el
  20 → las dos quincenas en la emitida el 1 de diciembre; alta el 10 con inicio el 10 → ninguna factura al
  aplicar ni con `hasta` el 10, la emitida el 16 con las órdenes del 10 al 15, 6 200.00 (tramo del 10 al 15) y
  15 500.00 (del 16 al 30), y la emitida el 1 de diciembre con 15 500.00, P19; marca en la emitida el 16 por la cola),
  R39 (espera del cierre), R30 por P9 (depende de T11.2), R36 y R38 (dependen de T14.2), con los casos de
  design §8 y `SL118` al cambiar la periodicidad o una marca ya puesta de una `por_cerrar`.
  R33 no va aquí: su test es `tests/integration/db/planes-cambio-empresa.test.ts` (review m1).
- [x] **T6.3** `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts`: R10 y R29.
- [x] **T6.4** `tests/unit/planes/jobs-factura-plataforma.test.ts`: R3, R12, R25.
- [x] **T6.5** `tests/integration/db/factura-plataforma-aislamiento.test.ts`: R13, R21–R23, con dos empresas.
- **Hecho:** los cinco verdes con `HAY_BASE_DE_DATOS`; cada `it` nombra su `R<n>`.

## Bloque B — Cuota en la deuda y lectura en curso

### T7 — Deuda (depende de T2)
- [x] **T7.1** `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts`: `tipo` con `"cuota"` y
  `facturaPlataforma` en el `Pick`.
- [x] **T7.2** `lib/repositories/CobroPlataformaMovimientoRepository.ts`: la entrada `cuota`, con `cuota` +
  `primera_cuota` de las cerradas (design §5).
- [x] **T7.3** `lib/utils/deuda-plataforma.ts`: resta solo `reverso`.
- [x] **T7.4** `lib/repositories/EmpresasPlataformaRepository.ts`: cuotas por empresa en el listado (las dos
  columnas).
- **Hecho:** `tests/unit/utils/deuda-plataforma.test.ts` y los tests de deuda existentes verdes sin cambiar.

### T8 — Lectura en curso (depende de T4.2) [P con T7]
- [x] **T8.1** `FacturaPlataformaRepository`: `deLaEmpresa` y `deEmpresaParaPlataforma` (design §2.6, §3), con
  la periodicidad y la cuota prevista solo si la factura la lleva.
- **Hecho:** typecheck verde; cubierto por T9.2.

### T9 — Tests del bloque B (dependen de T7, T8) [P entre sí]
- [x] **T9.1** `tests/integration/db/factura-plataforma-deuda.test.ts`: R18–R20 (con una factura de dos cuotas:
  la deuda y el tope suben en las dos) y R40 (un cambio aplicado tras emitir una cuota no la devuelve ni baja la
  deuda).
- [x] **T9.2** `tests/integration/db/factura-plataforma-aislamiento.test.ts`: añade R24 (plan mensual: la del 16
  al 30 con la cuota de diciembre prevista y la del 1 al 15 sin cuota; la prevista con el plan de un cambio
  pendiente; las dos previstas de quincenal desde el 1 aplicado el 12; `42501` con otra empresa).
- [x] **T9.3** `tests/unit/utils/deuda-plataforma.test.ts`: el caso `cuota` (R18).
- **Hecho:** verdes con `HAY_BASE_DE_DATOS`.

## Bloque C — Fecha de efecto del superadmin (P7, P9, P10, P11; R30–R34) [P con los bloques A y B]

### T11 — Servidor y confirmaciones (no depende de T1–T9)
- [x] **T11.1** `lib/interfaces/repositories/IPlanesRepository.ts`: `vigenteDesde?: string` en el `ok` de
  `ResultadoAsignar`, de `crearYAsignar` y de `ResultadoCambiarTipoCobro`, presente solo con `pendiente`.
- [x] **T11.2** `lib/repositories/PlanesRepository.ts`: en `cambiarEmpresaEnTx`, bajo el cerrojo, lleva un efecto
  de clase `"cambio"` al inicio del período siguiente del **tipo de referencia** salvo que ya lo sea; `"inicio"`
  no se toca (R33). No revalida el rango (R34). Devuelve la fecha real en `vigenteDesde`.
- [x] **T11.3** `lib/services/PlanesService.ts` y `lib/types/planes.ts`: `asignar` y `crear` responden con el
  `vigenteDesde` del repositorio; `CambiarTipoCobroResult` gana `vigenteDesde: string | null`. `fueraDeRango`
  sigue sobre la fecha elegida (R34).
- [x] **T11.4** `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx` y
  `app/(app)/plataforma/planes/_components/PlanesModule.tsx`: las dos confirmaciones con la fecha real (P11).
- **Hecho:** typecheck y lint verdes; `pnpm exec vitest related --run lib/repositories/PlanesRepository.ts
  lib/services/PlanesService.ts` verde tras T12.

### T12 — Tests del bloque C (dependen de T11) [P entre sí]
- [x] **T12.1** `tests/integration/db/planes-cambio-empresa.test.ts`: R30, R31, R33, R34 (casos de design §8).
- [x] **T12.2** `tests/integration/db/planes-cambiar-tipo-cobro.test.ts` (R30, R31 con el tipo de referencia) y
  `tests/integration/db/planes-crear-custom-asigna.test.ts` (R30 en el custom).
- [x] **T12.3** Ajustar los que usan un cambio con «hoy» o a mitad de período:
  `tests/integration/db/planes-asignacion.test.ts`, `tests/integration/db/plan-de-la-empresa-periodo.test.ts`,
  `tests/integration/db/planes-cancelar-cambio-historial.test.ts`. Si otro test de planes se pone rojo por lo
  mismo, se ajusta y se añade a «Archivos esperados».
- [x] **T12.4** `tests/unit/services/planes-service-periodo.test.ts` y
  `tests/unit/services/planes-service-tipo-cobro.test.ts`: R30, R32, R34.
- [x] **T12.5** `tests/components/PlanEmpresaTipoCobro.test.tsx` y `tests/components/PlanesModule.test.tsx`: R32.
- **Hecho:** verdes con `HAY_BASE_DE_DATOS`; cada `it` nombra su `R<n>`.

## Bloque D — Periodicidad de órdenes del plan (cambio de fondo; R35–R38) [P con B y C; T14.2 después de T11.2]

### T14 — Servidor y formulario (depende de T1.3 y T2.4)
- [x] **T14.1** `lib/types/planes.ts`: `PERIODICIDADES_ORDENES`, su tipo y su esquema; `periodicidadOrdenes`
  opcional en `crearPlanSchema` y `edicionDelPlan` (y así en `versionPlanSchema` y `VersionPlan`); el refine de
  R37 en `crearPlanSchema` (`validation_error` en `tipoCobro`); `periodicidadOrdenes?` en `PlanDTO` (design §3.2).
- [x] **T14.2** `lib/repositories/PlanesRepository.ts` e `lib/interfaces/repositories/IPlanesRepository.ts`:
  `crear`, `leerPlan` y `aplicarVersion` con la periodicidad; la variante `periodicidad_incompatible` y la regla
  de R37 al editar (en el acto, programada y al aplicar la programada: lanza sin escribir) y en
  `cambiarEmpresaEnTx` (asignar, `crearYAsignar`, `cambiarTipoCobro`). Coordinar con T11.2 (mismo método).
- [x] **T14.3** `lib/services/PlanesService.ts` y `lib/planes/mensajes.ts`: `periodicidad_incompatible` →
  `validation_error` en `tipoCobro` o en `periodicidadOrdenes`, con su mensaje. `lib/planes/rastro.ts`:
  `periodicidadOrdenes` en `CambiosDelPlan`, en la forma canónica y en `diferenciasDelPlan` (R35).
- [x] **T14.4** `app/(app)/plataforma/planes/_components/PlanForm.tsx`: el selector «Facturación de órdenes»
  (quincenal al crear, el del plan al editar), siempre en la petición, con su error de campo (R35).
- **Hecho:** typecheck y lint verdes; `pnpm exec vitest related --run lib/types/planes.ts
  lib/planes/rastro.ts lib/repositories/PlanesRepository.ts` verde sin tocar los tests de planes que no la
  conocen (la periodicidad es opcional).

### T15 — Tests del bloque D (dependen de T14) [P entre sí]
- [x] **T15.1** `tests/integration/db/planes-periodicidad-ordenes.test.ts`: R35 y R37 (casos de design §8).
- [x] **T15.2** `tests/components/PlanFormPeriodicidad.test.tsx`: R35.
- [x] **T15.3** En `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (T6.2): R36 y R38.
- **Hecho:** verdes con `HAY_BASE_DE_DATOS`; cada `it` nombra su `R<n>`.

## Bloque E — Factura histórica (humano 2026-11-11; modifica R26, R2 y R36 con P20)

### T16 — Fin guardado, siembra desde el alta y sus tests (depende de T2.5 y T14.2)
Los archivos de T16 ya están todos en «Archivos esperados»: no sube el tamaño.
- [x] **T16.0** `db/schema.prisma`: `FacturaPlataforma.finNaturalAt` (`DateTime @map("fin_natural_at")
  @db.Timestamp(3)`, no nulo, comentario del CHECK `factura_plataforma_fin_natural`) (design §1.1, P20).
  **Hecho:** typecheck verde.
- [ ] **T16.1** `db/migrations/20261111130100_factura_plataforma/migration.sql` (design §1.1, §1.3, §2.2–§2.6,
  §6.2): la columna `fin_natural_at NOT NULL` y su CHECK; el trigger la congela en una `por_cerrar`; `abrir` la
  escribe con `plan_fin_periodo_calendario(periodicidad, desde)`; `avanzar` (y así `cerrar`) fija con
  `fin_natural_at` en vez de calcularlo desde `desde`; `tomar_cambio` la recalcula solo en R16 al cambiar la
  periodicidad; `en_curso` devuelve como fin previsto `fin_natural_at` (las vistas previas de la cola tarde, m7 y
  su gemelo, siguen calculando el fin con la periodicidad nueva). `down.sql` no cambia (la columna se va con la
  tabla).
- [ ] **T16.2** Misma migración, paso 5 de design §6.2: la siembra, solo para las empresas que existen al migrar,
  con `desde` = 00:00 de la plataforma del día de su `created_at`, la periodicidad, el plan y el tipo de la
  empresa, sin marca, y `fin_natural_at` = el primer corte tras `now()` (design §2.8). Las empresas creadas
  después siguen con §2.2 paso 1, sin cambios.
  **Hecho (T16.1–T16.2):** `pnpm run db:migrate` y `pnpm run db:rollback` en base desechable.
- [ ] **T16.3** En `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (T15.3): R36 con el fin guardado
  (editar la periodicidad del plan con la factura en curso no cambia su `fin_natural_at`; la siguiente se abre
  en ese fin con la nueva) y R2/R16 (una primera asignación con efecto ≤ D y otra periodicidad recalcula el fin);
  `UPDATE` de `fin_natural_at` en una `por_cerrar` → `SL118`. Los casos de T6.2 y T15.3 siguen verdes.
- [ ] **T16.4** `tests/integration/db/factura-plataforma-cierre.test.ts`: R26 con la factura histórica: empresa
  dada de alta el 3 de septiembre y siembra el 10 de noviembre → una sola factura `[3 sep, 16 nov)`; cierres con
  `p_ahora` del 11 de noviembre al 15 no cierran nada; el del 16 a las 00:10 la cierra con número 1, los cargos y
  reversos de septiembre a noviembre y, si es quincenal, la cuota de la quincena del 16 (ninguna anterior);
  `en_curso` antes del 16 con `desde` el 3 de septiembre y fin el 16; con órdenes mensuales, fin el 1 de
  diciembre; una empresa creada tras la siembra, desde las 00:00 de su alta con su fin natural. Los casos de
  siembra de T6.1 (P15) siguen verdes.
- **Hecho:** T16.3 y T16.4 verdes con `HAY_BASE_DE_DATOS`, cada `it` nombra su `R<n>` (R2, R26, R36); los
  tests de factura de T6, T9 y T15 siguen verdes; `progress/impl_SLT-118.md > Mapa R → test` con los `it` nuevos.

## Cierre

### T10 — Documentación y gate (depende de todo)
- [x] **T10.1** `docs/architecture.md > Multi-empresa`: párrafo «Facturas de la plataforma (SLT-118)»: tabla,
  quién escribe, una factura por corte con la periodicidad de órdenes del plan (sin plan, quincenal), la cuota
  por adelantado en la factura emitida al empezar su período (con el plan de la siguiente), la primera cuota, la
  espera del cierre al cambio pendiente, sin devoluciones, toma del cambio sin corte, deuda. Y en «Planes y límites»:
  la periodicidad de órdenes del plan y la regla de R37; que el costo base deja de ser solo informativo al cerrar
  (sustituye a SLT-66 R21 y a SLT-86 R14 en lo que toca a la cuota); el prorrateo solo en la primera con plan
  (P6); y que el cambio del superadmin rige al inicio del próximo período del tipo de referencia (P7, P9, P10;
  modifica SLT-86 R16–R18).
- [x] **T10.2** `progress/impl_SLT-118.md`: mapa `R<n> → test` (R1–R40).
- [x] **T10.3** `./init.sh` verde; en local, `pnpm exec playwright test --project=dinero` y
  `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts` en base desechable (`docs/perfil-agentes.md`).
  Constancia: por decisión del humano (2026-11-11, `progress/features/SLT-118.md`), `./init.sh`, la integración y
  esos E2E los da el CI del PR a `dev`; no se mergea sin `gate-completo` y `e2e` en verde.
- **Hecho:** los tres verdes y el mapa sin huecos.

## Mapa R → test

| Requisito | Test |
|---|---|
| R1, R2, R4, R6, R7, R9, R11, R14, R27 | `tests/integration/db/factura-plataforma-cierre.test.ts` |
| R26 | `tests/integration/db/factura-plataforma-cierre.test.ts` (siembra P15, T6.1; factura histórica desde el alta, emitida en el primer corte tras la migración con todo el histórico, T16.4) |
| R3 | `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts` |
| R5, R8 | `tests/integration/db/factura-plataforma-cierre.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts` |
| R10 | `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` |
| R12 | `tests/unit/planes/jobs-factura-plataforma.test.ts` |
| R13, R21 | `tests/integration/db/factura-plataforma-aislamiento.test.ts` |
| R15, R16, R17, R28, R38 | `tests/integration/db/factura-plataforma-cambio-plan.test.ts` |
| R36 | `tests/integration/db/factura-plataforma-cambio-plan.test.ts` (T15.3; con el fin guardado, P20, T16.3) |
| R18 | `tests/integration/db/factura-plataforma-deuda.test.ts`, `tests/unit/utils/deuda-plataforma.test.ts` (y en cero en los tres `tests/unit/actions/*.composition-root.test.ts` de deuda, empresas y wallet) |
| R19 | `tests/integration/db/factura-plataforma-deuda.test.ts`, `tests/unit/utils/deuda-plataforma.test.ts` |
| R20, R40 | `tests/integration/db/factura-plataforma-deuda.test.ts` |
| R22 | `tests/integration/db/factura-plataforma-aislamiento.test.ts`, `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` |
| R23 | `tests/integration/db/factura-plataforma-aislamiento.test.ts` (la base, como dueño, y la app: `deEmpresaParaPlataforma` con `conEmpresa`, A y B cada una con las suyas) |
| R24 | `tests/integration/db/factura-plataforma-aislamiento.test.ts` (la empresa por `deLaEmpresa` y el superadmin por `deEmpresaParaPlataforma`) |
| R25 | `tests/unit/planes/jobs-factura-plataforma.test.ts`, `tests/integration/db/factura-plataforma-cierre.test.ts` (la siembra) |
| R29 | `tests/integration/db/factura-plataforma-cambio-plan.test.ts`, `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts` |
| R30 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`, `tests/integration/db/planes-crear-custom-asigna.test.ts`, `tests/integration/db/factura-plataforma-cambio-plan.test.ts`, `tests/unit/services/planes-service-periodo.test.ts` |
| R31 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`, `tests/unit/services/planes-service-periodo.test.ts`, `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` |
| R32 | `tests/unit/services/planes-service-periodo.test.ts`, `tests/unit/services/planes-service-tipo-cobro.test.ts`, `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/integration/db/planes-crear-custom-asigna.test.ts`, `tests/components/PlanEmpresaTipoCobro.test.tsx`, `tests/components/PlanEmpresaPeriodo.test.tsx`, `tests/components/PlanesModule.test.tsx` |
| R33 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/unit/services/planes-service-periodo.test.ts` |
| R34 | `tests/integration/db/planes-cambio-empresa.test.ts`, `tests/unit/services/planes-service-periodo.test.ts` |
| R35 | `tests/integration/db/planes-periodicidad-ordenes.test.ts`, `tests/components/PlanFormPeriodicidad.test.tsx`, `tests/unit/planes/rastro-periodo.test.ts` y `tests/unit/services/email/plantilla-cambio-plan.test.ts` (la línea «Facturación de órdenes: quincenal → mensual») |
| R37 | `tests/integration/db/planes-periodicidad-ordenes.test.ts` |
| R39 | `tests/integration/db/factura-plataforma-cambio-plan.test.ts`, `tests/unit/planes/jobs-factura-plataforma.test.ts` |

Con el nombre de cada `it`: `progress/impl_SLT-118.md > Mapa R → test (R1–R40)`.

## Archivos esperados

- `app/(app)/plataforma/empresas/[organizacionId]/_components/PlanEmpresa.tsx`
- `app/(app)/plataforma/planes/[planId]/_components/PlanDetalle.tsx`
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`
- `app/(app)/plataforma/planes/_components/PlanesModule.tsx`
- `app/api/cron/procesar-jobs/route.ts`
- `db/migrations/20261111130000_factura_plataforma_job_enum/down.sql`
- `db/migrations/20261111130000_factura_plataforma_job_enum/migration.sql`
- `db/migrations/20261111130100_factura_plataforma/down.sql`
- `db/migrations/20261111130100_factura_plataforma/migration.sql`
- `db/schema.prisma`
- `docs/architecture.md`
- `lib/db/excepciones-aislamiento.ts`
- `lib/db/modelos-de-negocio.ts`
- `lib/interfaces/repositories/ICobroPlataformaMovimientoRepository.ts`
- `lib/interfaces/repositories/IFacturaPlataformaRepository.ts`
- `lib/interfaces/repositories/IPlanesRepository.ts`
- `lib/interfaces/services/ITopePagoPlataformaService.ts`
- `lib/modulos/reparto.ts`
- `lib/planes/jobs-factura-plataforma.ts`
- `lib/planes/mensajes.ts`
- `lib/planes/rastro.ts`
- `lib/repositories/CobroPlataformaMovimientoRepository.ts`
- `lib/repositories/EmpresasPlataformaRepository.ts`
- `lib/repositories/FacturaPlataformaRepository.ts`
- `lib/repositories/PlanesRepository.ts`
- `lib/services/PlanesService.ts`
- `lib/types/factura-plataforma.ts`
- `lib/types/planes.ts`
- `lib/utils/deuda-plataforma.ts`
- `scripts/siembra-jobs-recurrentes.ts`
- `tests/components/PlanDetalle.test.tsx`
- `tests/components/PlanEmpresaPeriodo.test.tsx`
- `tests/components/PlanEmpresaTipoCobro.test.tsx`
- `tests/components/PlanForm.test.tsx`
- `tests/components/PlanFormDescuentos.test.tsx`
- `tests/components/PlanFormPeriodicidad.test.tsx`
- `tests/components/PlanesModule.test.tsx`
- `tests/integration/api/procesar-jobs-geocodificacion.test.ts`
- `tests/integration/api/procesar-jobs-webhook-estado.test.ts`
- `tests/integration/db/factura-plataforma-aislamiento.test.ts`
- `tests/integration/db/factura-plataforma-cambio-plan.test.ts`
- `tests/integration/db/factura-plataforma-cierre.test.ts`
- `tests/integration/db/factura-plataforma-cuota-gemelas.test.ts`
- `tests/integration/db/factura-plataforma-deuda.test.ts`
- `tests/integration/db/plan-de-la-empresa-periodo.test.ts`
- `tests/integration/db/planes-asignacion-inicio-ciclo.test.ts`
- `tests/integration/db/planes-asignacion.test.ts`
- `tests/integration/db/planes-cambiar-tipo-cobro.test.ts`
- `tests/integration/db/planes-cambio-empresa.test.ts`
- `tests/integration/db/planes-cancelar-cambio-historial.test.ts`
- `tests/integration/db/planes-crear-custom-asigna.test.ts`
- `tests/integration/db/planes-historial.test.ts`
- `tests/integration/db/planes-periodicidad-ordenes.test.ts`
- `tests/unit/actions/deuda-plataforma.composition-root.test.ts`
- `tests/unit/actions/empresas-plataforma.composition-root.test.ts`
- `tests/unit/actions/planes.composition-root.test.ts`
- `tests/unit/actions/wallet-egresos.composition-root.test.ts`
- `tests/unit/api/procesar-jobs-registro.test.ts`
- `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts`
- `tests/unit/guards/jobs-handler-por-tipo.guardia.test.ts`
- `tests/unit/guards/jobs-recurrentes-con-siembra.guardia.test.ts`
- `tests/unit/guards/rls-por-empresa.guardia.test.ts`
- `tests/unit/planes/jobs-factura-plataforma.test.ts`
- `tests/unit/planes/rastro-periodo.test.ts`
- `tests/unit/planes/rastro.test.ts`
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`
- `tests/unit/services/email/plantilla-cambio-plan.test.ts`
- `tests/unit/services/jobs-registro.test.ts`
- `tests/unit/services/planes-service-crear-custom.test.ts`
- `tests/unit/services/planes-service-inicio-ciclo.test.ts`
- `tests/unit/services/planes-service-periodo.test.ts`
- `tests/unit/services/planes-service-tipo-cobro.test.ts`
- `tests/unit/utils/deuda-plataforma.test.ts`

73 archivos, +6 420 / −164 líneas, sin `progress/` ni `specs/` (`git diff --shortstat` contra la base con `origin/dev`, con la tanda 12).

> 2026-11-11 (humano): se acepta todo en un solo PR, con el tamaño que resulte.

Choque al mergear con SLT-99 «Planes: el administrador de la empresa ve su plan y los públicos y cambia de plan»
(PR #115) en `lib/repositories/PlanesRepository.ts`, `lib/interfaces/repositories/IPlanesRepository.ts`,
`lib/types/planes.ts` y `lib/db/excepciones-aislamiento.ts` (design §10).
