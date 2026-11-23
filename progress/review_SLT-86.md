# Review SLT-86 «Planes: período de facturación de calendario por empresa y sin tope de órdenes»

- **Fase:** F2.2, vuelta 1.
- **Rama:** `feature/SLT-86-planes-periodo-facturacion` contra `origin/dev`, con HEAD `4b682cd9`. Son 178 archivos: +12 901 / −4 474.
- **Reviewer:** 2026-11-06.
- **Grafo MCP:** no lo usé. Exploré con Grep/Read y con el diff.

## Verificación ejecutada (no me fío solo de la bitácora)

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | 0 errores |
| `eslint app lib components e2e` | 0 errores. Hay 18 warnings, todos en archivos que esta rama no toca. |
| `pnpm run test:guardias` | 327/328 archivos. El único rojo es `dependencias-declaradas-presentes.guardia` (4 casos). Está en `tests/baseline-rojos.json:51` y la rama no lo toca, así que **no es hallazgo**. |
| Unit SLT-86: `ciclo-periodo`, `cobro-periodo`, `costeo-periodo`, `jobs-cambio-empresa`, `mensajes-periodo`, `rastro-periodo`, `planes-schema-periodo`, `planes-service-periodo` | 8 archivos, 317/317 |
| Componentes y unit afines: `PlanEmpresaPeriodo`, `PlanFormDescuentos`, `ConsumoDelPlanPeriodo`, `EmpresasModulePeriodo`, `procesar-jobs-plan-cambio`, `consumo`, `cobro` | 7 archivos, 132/132 |
| Integración DB en `servi_logistic_slt86` (localhost): `plan-ciclo-periodo`, `plan-de-la-empresa-periodo`, `planes-cambio-empresa`, `planes-cancelar-cambio-historial`, `plan-precio-historial`, `plan-descuento-periodo`, `plan-sin-tope-ordenes` | 7 archivos, 151/151, 0 saltados |
| Migración y cobros: `migracion-slt86-ida-y-vuelta`, `cobro-plataforma-plan`, `cobro-plataforma-porcentual`, `plan-de-la-empresa-porcentual`, `deuda-plataforma-plan`, `plan-de-la-empresa-costeo`, `plan-costo-porcentual-escritura` | 7 archivos, 88/88 |
| SL-40 y lecturas: `cobro-plataforma-cargos`, `deuda-plataforma-wallet`, `empresas-plataforma-cobro`, `empresas-plataforma-plan`, `mi-plan-repository`, `planes-historial` | 6 archivos, 51/51 |

No corrí `./init.sh`, la suite completa ni los E2E, por orden del leader: los corre CI. La bitácora registra los E2E de planes: 35/35 dos veces y 27/27 en la última tanda.

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` tiene los requisitos EARS R1–R37.
- [x] `design.md` tiene alternativas descartadas en «§10» (A1–A7).
- [x] `tasks.md`: 66 tareas `[x]`, ninguna `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`, con su tabla. El diff amplía o retira lo listado y no lo re-crea:
  - reutiliza `plan_tipo_cobro`, `cambiarTipoCobro`, `plan_cambio_programado`, `plan_uso_ordenes` y `plan_cobro_del_ciclo`;
  - retira el tope de órdenes y el ciclo corto;
  - no reutiliza la periodicidad de gastos fijos (A3).
- [x] Equipo: assignee Camilo y rama de worktree.
- [x] Trazabilidad: cada R tiene test. Detalle abajo.
- [x] `progress/impl_SLT-86.md` contiene el mapa `R<n> -> test`, por tanda.
- [x] Typecheck sin errores.
- [x] Lint sin errores.
- [ ] `gate-completo` en CI: pendiente del PR. No lo puede dar el reviewer.
- [x] Flujos críticos. La rama toca `lib/db/modelos-de-negocio.ts`, datos de negocio y un job con empresa, y `e2e/dos-empresas-humo.spec.ts` está adaptado: se retira el caso del tope de órdenes y entra uno «SLT-86 R8». Su salida local está en la bitácora (35/35).
- [x] Sin dependencias nuevas: R37 y `package.json` no cambian.
- [x] Sin secretos ni configuración por entorno hardcodeados.
- [ ] `./init.sh` y `gate-completo`: los da el leader y CI.
- [ ] `progress/features/SLT-86.md > Cierre`: se completa después de esta review.

### docs/checkpoints-proyecto.md
- [x] Las tablas nuevas tienen RLS: `plan_descuento_periodo` y `plan_precio_historial` llevan `ENABLE ROW LEVEL SECURITY` y `REVOKE ALL … FROM servi_app` (migración `20261106120000`, líneas 85–88). Son de PLATAFORMA, como `plan_tope_rol`, sin `organizacion_id`, por diseño (design §1.1–1.2). `planes-acceso-servi-app` y `plan-descuento-periodo` prueban el 42501.
- [x] Las lecturas nuevas por empresa filtran y están probadas con dos empresas:
  - `plan_de_la_empresa` da 42501 con otra empresa (`plan-de-la-empresa-periodo`, `plan-ciclo-periodo`);
  - las del superadmin van en `comoPlataforma` con el `organizacionId` explícito.
- [x] Las cuatro migraciones nuevas traen `down.sql`, y no se edita ninguna ya aplicada.
- [x] Nada de Ordenex en el diff. Usé la base local `servi_logistic_slt86`.
- [x] Ningún `console.log` añadido.
- [x] Capas: la lógica está en `PlanesService`, el SQL en `PlanesRepository`/`MiPlanRepository` y la entrada en `lib/actions/planes.ts`. Toda entrada pasa por zod (`lib/types/planes.ts`).
- [x] Permisos: el superadmin se valida en el service (R3, `planes-service-periodo`). El job es `nucleo` en `MODULO_POR_JOB`.
- [~] País y moneda: ningún literal de país ni de moneda. El −06:00 de la plataforma está como `interval '6 hours'` en el SQL nuevo: ver m1.

### perfil-agentes > reviewer
- [x] Ninguna tabla ni query de negocio sin `organizacion_id`.
- [x] Ninguna tabla sin RLS.
- [x] Ninguna migración sin `down.sql`.
- [x] Ninguna referencia a Ordenex.
- [x] Ninguna dependencia nueva.
- [x] Comentarios: en general explican el porqué. Hay un comentario rancio: ver m3.

## Trazabilidad R → test

Los 20 archivos de test que nombra `requirements.md` existen y no están vacíos. Corrí los suyos: unit, componentes e integración DB.

| R | Test que lo cubre (comprobado) |
|---|---|
| R1 | `planes-schema-periodo`; `planes-cambio-empresa` (23514 en `plan_tipo_cobro` y en `plan_cambio_tipo_cobro`) |
| R2 | `planes-cambio-empresa` (primera asignación pasada, hoy y futura; antes de la fecha, altas sin tope y módulos intactos) |
| R3 | `planes-service-periodo` (`forbidden` sin llamar al repo, en todas las operaciones) |
| R4, R5 | `ciclo-periodo` y `plan-ciclo-periodo`, con la misma tabla `_fixtures/periodo-calendario.ts` (18 períodos × 5 instantes + 9 casos de entrada) |
| R6 | `plan-ciclo-periodo`: la misma tabla contra SQL y TS. Cubre fines de mes de 28–31 días, febrero normal y bisiesto (quincena 16–28 y 16–29), 31 dic y 1 ene, el borde exacto y ±1 ms. |
| R7 | `plan-ciclo-periodo`, `plan-de-la-empresa-periodo` |
| R8 | `plan-sin-tope-ordenes`: la 3.ª orden entra por pantalla, carga masiva y API key, y `adminTienda` sigue dando SL024. También `planes-schema-periodo` y `ConsumoDelPlanPeriodo`. |
| R9, R10, R12 | `cobro-periodo`: 50.01, 100 000.00, 600 000.00, 95 000.00, 0.00, 540 000.00, 22 000.00, 6 200.00 y 93 698.63. R10 y R11 también en `planes-schema-periodo` y `plan-descuento-periodo` (23514). |
| R13, R14 | `plan-descuento-periodo`, `planes-cambio-empresa` |
| R15, R22 | `plan-precio-historial` (caso base del 5, hoy, futura aplicada por el job, programada y cancelada, borde exacto), `planes-service-periodo` |
| R16–R21 | `planes-cambio-empresa`, `planes-cancelar-cambio-historial`, `jobs-cambio-empresa`, `planes-service-periodo` |
| R23 | `PlanFormDescuentos` |
| R24 | `mensajes-periodo`, `PlanEmpresaPeriodo` |
| R25 | `PlanEmpresaPeriodo`, `PlanFormDescuentos` |
| R26 | `PlanEmpresaPeriodo`, `ConsumoDelPlanPeriodo`, `plan-ciclo-periodo` (`{sin_plan, cambio_empresa}` sin actor), `mensajes-periodo` |
| R27 | `cobro-periodo`, `ConsumoDelPlanPeriodo`, `plan-de-la-empresa-periodo` |
| R28 | `costeo-periodo`, `plan-de-la-empresa-periodo`, `plan-de-la-empresa-porcentual` |
| R29 | `EmpresasModulePeriodo` |
| R30 | `rastro-periodo`, `cobro-periodo` |
| R31 | `rastro-periodo`, `plan-descuento-periodo` |
| R32 | `plan-de-la-empresa-periodo`, `plan-descuento-periodo`, `planes-acceso-servi-app` |
| R33–R36 | `migracion-slt86-ida-y-vuelta`: P3 se niega, conversión anual → descuento con el mismo costo, rastro «Sistema (migración SLT-86)», entrada de hoy a las 00:00 y las seis negativas del down. El down limpio restaura md5, ACL, triggers y RLS. |
| R37 | Gate de CI. Los tests retirados (`plan-ciclo`, `plan-ciclo-corto`, `plan-topes-ordenes`, `plan-topes-concurrencia`, `bulk-orden-service.tope-plan`, `api-key-carga-tope-plan`, `carga-composition-root-cupo`, `utils/ciclo-plan`) están justificados en design/tasks/bitácora. |

## Foco del leader

1. **Cálculo de período y tramo.**
   - SQL y TS siguen la misma regla:
     - SQL (`migration.sql:175-219`): `date_trunc` sobre `p_ahora − 6 h`. La quincena es 1–15 / 16–fin, con el fin calculado como el inicio del mes siguiente. El bimestre se obtiene con división entera del mes. El año, con `date_trunc('year')`.
     - TS (`lib/planes/ciclo.ts:49-127`): las mismas reglas sobre `fechaCalendarioCR`.
   - El tramo es `GREATEST(entrada, inicio)` en SQL y `entrada > inicio` en TS.
   - Los días del tramo se cuentan en fechas de calendario de la plataforma, con los dos extremos.
   - El costo usa BigInt con «mitad hacia arriba» (`cobro.ts:36-83`). Los ejemplos de R9, R10 y R12 dan exactos.
   - Sin diferencias entre base y TS.
2. **Migraciones.**
   - `20261106120000` hace la conversión sin pérdida (anual fijo → `12·mensual − A`; % → % del período anual) y también convierte las versiones pendientes.
   - Siembra una fila `-infinity` de precio por plan, el rastro del tope y la entrada a las 00:00 de hoy.
   - El down se niega en los casos que pide R36 y declara sus pérdidas.
   - `130000`, `140000` y `150000` tienen downs reales:
     - `130000` repone el cuerpo literal de la función;
     - `140000` y `150000` recrean el enum quitando solo su valor, tras borrar las filas que lo usan. Las pérdidas están declaradas en la cabecera.
   - La ida y vuelta pasa: 15 casos dentro de los 88 de la segunda tanda de integración.
3. **Cambios de empresa.**
   - `aplicarCambioDeEmpresa` (`PlanesRepository.ts:1074-1094`):
     - compara el `cambioId`, así que un pendiente reemplazado, cancelado o ya aplicado no escribe;
     - respeta `aun_no_rige`;
     - el historial lo firma quien programó el cambio;
     - deja la entrada en `desde`.
   - La cancelación tiene un único punto, `cancelarPendienteDeEmpresaEnTx` (`:1052-1072`), que escribe la fila `plan_cambio_empresa_cancelado` en la misma tx. Lo usan «Cancelar cambio», la petición igual a lo vigente y el archivado.
   - El precio con fecha pasa por `plan_precio_historial` y se elige con `desde_at ≤ ci.inicio`.
   - `plan_de_la_empresa` devuelve `{sin_plan, cambio_empresa}` sin actor (R26).
4. **Cobros.** SLT-83 (`plan-de-la-empresa-porcentual`, `cobro-plataforma-porcentual`) y SL-40 (`cobro-plataforma-cargos`, `deuda-plataforma-*`) siguen en verde. Ninguna migración toca `cobro_plataforma_movimiento` ni la tarifa: solo cambia el `p_desde` de `plan_cobro_del_ciclo`.
5. **Código muerto.** No queda código vivo de `ordenesPorCiclo`, `precio_anual`, `descuento_anual_pct`, `ciclo_corto`, `CupoPlan` ni `anualNoAplicaAlCosto`. Lo que queda en `PlanDetalle.tsx:110,592-594` y `mensajes.ts:191-201,375-403` pinta filas viejas del rastro, como exige R30. Hay dos restos de documentación (m2, m3).

## Hallazgos

### Bloqueantes
Ninguno.

### Menores

- **m1 — El −06:00 está duplicado en el SQL.**
  - Dónde: `db/migrations/20261106120000_plan_periodo_facturacion/migration.sql:169,178,191,200,208`.
  - `interval '6 hours'` aparece cinco veces. En TS el desfase vive en una sola fuente (`inicioDelDiaCREnUtc`).
  - Lo aceptan design §1.5 y la P8 de SLT-58, pero cuando SL-21 traiga zona por empresa habrá que tocar estos cinco puntos.
  - Sugerencia: anotarlo en `progress/deudas.md` como dependencia de SL-21.
- **m2 — `docs/architecture.md:204-207` está desactualizado.**
  - «Ciclo en UTC» sigue describiendo `plan_inicio_ciclo(ancla, ahora)` como el ciclo, con su «gemela en TS `lib/planes/ciclo.ts`».
  - Esa gemela (`inicioDelCiclo`) se borró, y el ciclo ya es `plan_inicio_ciclo_de`.
  - La regla de pasar `now() AT TIME ZONE 'UTC'` sigue valiendo. Basta con cambiar el nombre de la función y la gemela.
- **m3 — Comentario rancio en `lib/planes/ciclo.ts:147-150`.**
  - `fechaMasMeses` dice «La usa también el siguiente cobro (`lib/planes/cobro.ts`)», pero `cobro.ts` ya no la importa.
- **m4 — La vista previa del cambio usa el precio vigente.**
  - Dónde: `components/shared/tipo-cobro.ts:69-72`.
  - `primerPeriodoDelCambio` calcula el costo del primer período o tramo con el precio vigente del plan. Por R15, el que regirá es el del historial en la fecha de efecto.
  - Si el plan tiene una edición de precio programada antes de esa fecha, el modal muestra el costo viejo.
  - Es un caso raro y solo informativo. R25 no lo pide de forma explícita, así que es una mejora, no un incumplimiento.
- **m5 — Observación para el humano, no un defecto.**
  - Dónde: `lib/planes/cobro.ts:110-121` y `lib/planes/consumo.ts:147-151`.
  - Con un cambio pendiente, «Período: desde–hasta» y «Se reinicia en N días» muestran el fin de calendario, y el costo del período en curso sale completo.
  - Sin embargo, R17 corta el período en la fecha de efecto, y «Siguiente cobro» sí muestra esa fecha.
  - R27 lo pide literalmente así y ninguna decisión prorratea un período cortado por el final, así que no lo cuento como hallazgo. Si el humano quiere coherencia, va a una ficha nueva.

## Veredicto

**OK.** 0 bloqueantes y 5 menores (m1–m5, el último es solo una observación). Quedan pendientes, fuera del alcance del reviewer, el check `gate-completo` en CI y la sección `Cierre` de la feature.
