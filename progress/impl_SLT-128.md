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

## Tanda 1b (backend_dev, 2026-11-12): decisiones del humano aplicadas

### Decisiones
1. La guardia `organizacion-en-modelos` no se toca: en `plan_cambio_recepcion` y `plan_version_empresa` la
   columna de la empresa pasa a `empresa_id` (Prisma `empresaId`, relación `empresa`).
2. Se aceptan 33 archivos: los 3 tests de servicio y `PlanEmpresa.tsx` (este, de frontend_dev) entran en
   `tasks.md > Archivos esperados`.

### Archivos
- `db/schema.prisma`: `empresaId @map("empresa_id")` en los dos modelos, `@@id([cambioId, empresaId])` y
  `@@index([empresaId])`. Cliente regenerado.
- `db/migrations/20261114120000_plan_cambio_por_empresa/migration.sql`: columnas, PK, índice
  `plan_cambio_recepcion_empresa_id_idx`, FK `*_empresa_id_fkey`, `plan_version_de`, `plan_tope_rol_de`,
  `plan_de_la_empresa`, `factura_plataforma_cerrar` y el backfill de §4. `down.sql` sin cambios: solo hace
  LOCK/EXISTS/DROP de las tablas, sin nombrar la columna.
- `lib/db/modelos-de-negocio.ts`: el comentario.
- `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`: las dos consultas que nombraban la columna.
- `tests/unit/services/planes-service-{asignar-costo,costo-porcentual,lecturas}.test.ts`: `recibidas` y `total`
  en el `pendiente` de los dobles de `detalle`.
- `specs/SLT-128-planes-cambios-por-periodo/design.md` §1 (nota fechada 2026-11-12) y `tasks.md` (33 archivos).

### Verificación
- `pnpm run typecheck`: 0 errores.
- Guardia `tests/unit/guards/organizacion-en-modelos.guardia.test.ts`: 13/13 verde.
- `vitest run` de los 3 tests de servicio + `tests/unit/planes/recepcion.test.ts`: 4 archivos, 119 verdes.
- `vitest run tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`: 10 verdes, 5 saltados (sin base local;
  los corre el CI).
- `pnpm run lint`: 0 errores (243 avisos preexistentes, ninguno en archivos de esta tanda; eslint de los tocados limpio).

Veredicto: guardia R4 resuelta y tipos en verde; T1–T4 listas para seguir con T5.

## Tanda 2 (backend_dev, 2026-11-12): T5 entera (T5.1–T5.8)

### Archivos
- `lib/repositories/PlanesRepository.ts`:
  - helpers SLT-128: `versionCompleta`, `versionPropiaDe`, `comoLaCorre`, `planPartido`, `recepcionesSinRecibir`,
    `fijarRecepciones` (recepción + `plan_aplicar_cambio` y recordatorios CON empresa), `escribirPrecioDelCambio`,
    `promoverEnTx`, `entrarAlCambioEnTx`, `salirDelCambioEnTx`, `moverRecepcionEnTx`, `planAlEntrar`, `cambioDeLaEmpresa`;
    `dedupeRecepcion`, `dedupeRecordatorio` (nueva firma con empresa y `recibeAt`) y la clave del aviso de recordatorio con `recibeAt`;
  - T5.1 `programarCambio` (empresas FOR SHARE → plan; recepciones, trabajos, recordatorios y guardado por empresa);
  - T5.2 `recibirCambio`, `recepcionesVencidas`; T5.3 `aplicarCambioProgramado` = promoción (`espera`);
    `aplicarVersion` con `{ sincronizarModulos, escribirPrecio }`; `escribirPrecioDelHistorial` con `"dejar"` (DO NOTHING);
  - T5.4 `cancelarCambio` (partido → `cambio_a_medias`), `archivar` (recepción sin recibir → `cambio_a_medias`),
    `editar` (partido → `cambio_a_medias`);
  - T5.5 `aplicarEnTx` (+ `ahora`): sale (R18), entra con versión o recepción (R17), mueve la recepción (R19);
    `cambiarEmpresaEnTx` mira periodicidad y topes contra la versión de C si entra en F o después;
  - T5.6 `planDeEmpresa` (versión propia y su recepción), `detalle` (recibidas/total), `repartirRecordatorioDeEmpresa`,
    `repartirRecordatorio` legado filtrado a recepciones sin recibir; fuera los stubs `pendienteDeT5`.
- `lib/types/planes.ts`: `PendienteDelDetalle = CambioPendienteVista & { recibidas; total }`; `DetallePlan.pendiente` lo usa
  (sin tocar `lib/types/consumo-plan.ts`).
- `lib/planes/consumo.ts` (T5.7): `pendienteDelDetalle(vigente, cambio)`.
- `lib/services/PlanesService.ts` (T5.8): `detallePlan` con `pendienteDelDetalle`; `cambio_a_medias` ya pasaba tal cual
  en `editar`, `archivar` y `cancelarCambio` (solo comentarios).
- `tests/components/PlanDetalle.test.tsx`: el doble `DETALLE.pendiente` con `recibidas` y `total` (tipo nuevo).
- `tests/unit/services/planes-service-lecturas.test.ts`: la expectativa del detalle con `recibidas` y `total` (R11).

### Desvíos e interpretaciones
- R3 «si cambia»: la fila `desde_at = F` se escribe si el precio del cambio no es el que el historial ya da en F (no
  contra la fila del plan): tras un reemplazo que revierte el precio de un cambio ya recibido, comparar con el plan no
  escribiría nada y el precio del primero quedaría para todas. En la promoción, lo mismo (aplicarVersion sin precio).
- Correo `cancelado`: `vigenteDesde` = la recepción de cada empresa (la fecha que se le anunció, R20), F si no tiene.
- R20 `reemplazaA`: la recepción anterior solo si aún no la había recibido.
- R19 «si rige el mismo instante»: si `recibe_at ≤ desde` del cambio de tipo, la recepción no se mueve.
- R18: la promoción del plan de antes va después del `UPDATE` de la empresa (si no, R37 la seguiría contando) y el
  plan de antes solo se bloquea si hay que promover (dos empresas que se cruzan de plan no se esperan).
- `programarCambio` relee las empresas tras el cerrojo del plan (una asignación que lo esperaba ya entró).
- Los trabajos con empresa ya se encolan, pero los manejadores son de T6: hasta entonces `plan_aplicar_cambio` con
  empresa cae en `aplicarCambioProgramado` (devuelve `espera`) y el recordatorio con `dias: 3` no valida.

### Verificación de la tanda 2 (implementer, 2026-11-12)
- `pnpm run typecheck` (8 GB): 0 errores. `eslint` sobre los 5 archivos de código: limpio.
- `vitest related --run lib/repositories/PlanesRepository.ts`: 26 archivos verdes, 52 saltados (sin base), 1 rojo:
  `tests/unit/repositories/planes-repository-tipo-cobro.test.ts` (D16, 2 casos). `TypeError ... findUnique` en
  `moverRecepcionEnTx` (R19): el doble de `tx` no trae `planCambioProgramado`. No está en la baseline ni en «Archivos
  esperados»: arreglarlo lleva el total a 34 > 33. Pregunta abierta al humano.
- `PlanDetalle.test.tsx`: backend_dev solo añadió `recibidas`/`total` al doble `DETALLE.pendiente` por el tipo nuevo.
- `vitest related --run` de consumo.ts, PlanesService.ts y types/planes.ts: 296 verdes, 63 saltados y 7 rojos. Seis
  eran por carga (corrían a la vez que otro vitest). Corridos solos, `wallet-page` y `CierresDescargaColumnas`: 27/27
  verdes. Solo queda el rojo de `planes-repository-tipo-cobro`.
- `pnpm test:guardias`: 4 rojos, los de la baseline (`dependencias-declaradas-presentes`); 4822 verdes.

### Mapa R → test (esta tanda)
- Sin tests nuevos: los de R2–R19, R22 son de T7 (integración) y T6. R11 (paso por el servicio) →
  `tests/unit/services/planes-service-lecturas.test.ts`.

### Verificación (backend_dev, antes del doble de `planes-repository-tipo-cobro`, ya aceptado y arreglado)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: 0 errores.
- `pnpm exec eslint` sobre los 7 archivos tocados: limpio.
- `vitest related --run lib/repositories/PlanesRepository.ts lib/services/PlanesService.ts`: 790 verdes, 606 saltados
  (integración sin `HAY_BASE_DE_DATOS`), 2 rojos (los de `planes-repository-tipo-cobro`: su doble de `tx` no tenía
  `planCambioProgramado`, que `aplicarEnTx` lee para R19).
- `vitest related --run lib/planes/consumo.ts lib/types/planes.ts`: 4755 verdes, 688 saltados, 11 rojos: los 2 de arriba y 9
  de wallet, ordenes, descarga, paginación y usuario-form, ajenos a planes; corridos solos, los 9 pasan (inestables con la
  corrida grande).

Veredicto: T5 completa, tipos y lint verdes; los rojos que quedaban eran del doble de `planes-repository-tipo-cobro`.

## Tanda 3 (backend_dev, 2026-11-12): T6 (T6.1–T6.4)

La sesión anterior dejó T6 escrita sin commit; revisada contra T6.1–T6.4 y design §4, sin cambios de código.

### Archivos
- `lib/planes/jobs-cambio-plan.ts` (T6.1): `PlanesRepositoryDeJobs = IPlanesRepository & IPlanesRecepcionesRepository`;
  `plan_aplicar_cambio` con empresa → `recibirCambio` (payload `{ planId, cambioId, recibeAt }`, `recibeAt` ISO exigido:
  `recepcionDelPayload`), sin empresa → `aplicarCambioProgramado`; `plan_recordatorio_cambio` con empresa →
  `repartirRecordatorioDeEmpresa` (`dias` 7, 3 o 1 y `recibeAt`), sin empresa → `repartirRecordatorio` (7 o 1);
  `recordatorio_3` en `tipoAvisoSchema` y como recordatorio en `plan_aviso_correo`; barrido recepciones → planes → empresas.
  El uso lo decide `empresaDelJob`, no el payload.
- `lib/services/email/plantillas/cambio-plan.ts` (T6.2): solo el comentario; el tipo ya entraba por `TipoCorreoCambioPlan` (T4.3).
- `tests/unit/cron/procesar-jobs-plan-cambio.test.ts` (T6.3) y `tests/unit/services/email/plantilla-cambio-plan.test.ts` (T6.4).
- `tests/unit/repositories/planes-repository-tipo-cobro.test.ts`: el doble `planCambioProgramado` (D16, aceptado).

### Mapa R → test (esta tanda)
- R5 → `tests/unit/cron/procesar-jobs-plan-cambio.test.ts` («SLT-128 — plan_aplicar_cambio con empresa y el barrido»: recibe
  sin promover, `recibeAt` inválido falla, orden recepciones → planes → empresas, fallo de una recepción no frena el resto).
- R22 → `tests/unit/services/email/plantilla-cambio-plan.test.ts` (asunto e intro de 3 días, topes pasados) y
  `procesar-jobs-plan-cambio.test.ts` (`recordatorio_3` válido, con empresa y `dias` 7/3/1 + `recibeAt`, payloads inválidos).
- R27 → `procesar-jobs-plan-cambio.test.ts` («SLT-128 R5, R27: con empresa, los dos corren en SU empresa, de núcleo»).

### Verificación
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: 2 errores, ambos en `tests/unit/planes/jobs-cambio-empresa.test.ts`
  (154, 169): sus dobles del barrido no traen `recepcionesVencidas` ni `recibirCambio`. Fuera de «Archivos esperados»: no tocado.
- `pnpm exec eslint` sobre los 5 archivos: limpio.
- `vitest run` de los 3 tests de T6 + tipo-cobro: 3 archivos, 68 verdes.
- `vitest related --run lib/planes/jobs-cambio-plan.ts lib/services/email/plantillas/cambio-plan.ts`: 234 verdes, 41 saltados,
  3 rojos, todos de `tests/unit/planes/jobs-cambio-empresa.test.ts` (`repo.recepcionesVencidas is not a function`):
  «cableado: el barrido aplica los pendientes de plan y DESPUÉS los de empresa…», «el barrido: si un cambio de empresa falla…»,
  «el barrido: un fallo de un cambio de plan no impide la pasada de empresas». Arreglo: `recepcionesVencidas: async () => []`
  y `recibirCambio` en sus dobles (total 35 archivos). Pendiente de decisión humana.

Veredicto: T6 completa y sus tests verdes; queda rojo `jobs-cambio-empresa.test.ts`, fuera de la lista, a la espera del humano.

## Tanda 4 (backend_dev, 2026-11-12): T7 (T7.1–T7.9)

La sesión anterior dejó los nueve archivos escritos en el WIP `ce21d4f4`. Revisados uno por uno contra su T7.x, la
migración y `PlanesRepository`; sin cambios de producción (ningún caso reveló un bug).

### Archivos (un commit por archivo, con su `[x]` en `tasks.md`)
- T7.1 `tests/integration/db/planes-cambio-por-empresa.test.ts`: los historiales de módulos se separan por id y no
  por `created_at` + `skip` (dentro de la transacción `now()` no avanza: el orden no separaba el antes).
- T7.2 `tests/integration/db/planes-version-por-empresa.test.ts`: sin cambios.
- T7.3 `tests/integration/db/planes-cambio-correos.test.ts`: caso nuevo de R21 «3 días o menos → solo el de 1 día»
  (guardado el 13, quincenal el 16 y mensual el 1 de diciembre en el mismo plan).
- T7.4 `tests/integration/db/planes-cambio-programado.test.ts`: el mismo arreglo del historial por id que T7.1.
- T7.5 `tests/integration/db/factura-plataforma-cambio-plan.test.ts`: el caso de R9 lleva una segunda empresa
  (mensual) para que el plan no se promueva y el nombre de la cuota salga de la versión propia (R2), no del plan.
- T7.6 `planes-periodicidad-ordenes`, T7.7 `plan-precio-historial`, T7.8 `planes-historial`: sin cambios.
- T7.9 `tests/unit/services/planes-service.test.ts`: sin cambios.

### Mapa R → test (toda la feature)
- R1 → `tests/unit/planes/recepcion.test.ts`; `planes-cambio-por-empresa.test.ts` («R1: al guardar, cada empresa…»).
- R2 → `planes-version-por-empresa.test.ts` («R2: … triggers de topes y la tarifa»); `factura-plataforma-cambio-plan.test.ts`
  («SLT-128 R9: … nombre nuevo en la cuota», el nombre de la factura que se abre).
- R3 → `plan-precio-historial.test.ts` («SLT-128 R3: con F futura aplicada por la cola…»); `planes-cambio-por-empresa.test.ts` (R13).
- R4 → `planes-cambio-por-empresa.test.ts` («R4, R10: … sus excepciones»); `planes-cambio-programado.test.ts` («R38/R17, SLT-128 R2, R4, R10»).
- R5 → `planes-cambio-por-empresa.test.ts` («R5, R10, R11: el barrido…»); `tests/unit/cron/procesar-jobs-plan-cambio.test.ts`.
- R6 → `planes-cambio-por-empresa.test.ts` («R6: …»).
- R7 → `factura-plataforma-cambio-plan.test.ts` («SLT-128 R7, R9 (m4)…»).
- R8 → `planes-periodicidad-ordenes.test.ts` («SLT-128 R8: …»).
- R9 → `factura-plataforma-cambio-plan.test.ts` (los dos casos SLT-128).
- R10 → `planes-cambio-por-empresa.test.ts` (R5/R10/R11, R4/R10, R18); `planes-historial.test.ts` («SLT-128 R10: …»);
  `planes-cambio-programado.test.ts` (R38, R39 sin empresas).
- R11 → `planes-cambio-por-empresa.test.ts` (lectura «N de M»); `tests/unit/services/planes-service-lecturas.test.ts`;
  pantalla: `tests/components/PlanDetalle.test.tsx` («SLT-128 R11», commit bfd33903).
- R12 → `planes-version-por-empresa.test.ts` («R12: …»).
- R13 → `planes-cambio-por-empresa.test.ts` («R13 (P6)…»); `planes-cambio-programado.test.ts` («SLT-128 R13 (P6)…»).
- R14 → `planes-cambio-por-empresa.test.ts` («R14 (P1, P8)…»); `tests/unit/services/planes-service.test.ts`.
- R15 → `planes-cambio-programado.test.ts` («SLT-128 R15…», «R40 (plan sin empresas)»); `planes-cambio-por-empresa.test.ts`;
  `planes-cambio-correos.test.ts`; `planes-service.test.ts`. Pantalla: `tests/components/PlanDetalle.test.tsx` («SLT-128 R14, R15»).
- R16 → `planes-cambio-por-empresa.test.ts` («R16 (P7)…»); `planes-service.test.ts`.
- R17 → `planes-cambio-por-empresa.test.ts` («R17 (P4, P10 b)…»); `planes-cambio-correos.test.ts` («SLT-128 R22, R17»).
- R18 → `planes-cambio-por-empresa.test.ts` («R18: …»); `planes-cambio-correos.test.ts` (no sale el recordatorio).
- R19 → `planes-cambio-por-empresa.test.ts` («R19, R22: mensual → bimestral…»).
- R20 → `planes-cambio-correos.test.ts` («SLT-128 R20, R21», «SLT-128 R20: un reemplazo…», «R45, SLT-128 R20», «R41/R45: un fallo…»).
- R21 → `tests/unit/planes/recepcion.test.ts`; `planes-cambio-correos.test.ts` (7 y 1; 3 y 1; solo 1); `planes-cambio-por-empresa.test.ts` (R17, R19).
- R22 → `planes-cambio-correos.test.ts` (3 días, una vez, solo su empresa, no sale si recibido/se fue/movida, reemplazo/cancelado);
  `tests/unit/services/email/plantilla-cambio-plan.test.ts`; `procesar-jobs-plan-cambio.test.ts`.
- R23 → `tests/unit/services/planes-service-periodo.test.ts` (existente, sin cambios).
- R24, R25 → `tests/integration/db/migracion-slt128-ida-y-vuelta.test.ts`.
- R26 → `planes-version-por-empresa.test.ts` («R26: servi_app … 42501»).
- R27 → `procesar-jobs-plan-cambio.test.ts` («SLT-128 R5, R27…»).

### Verificación
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: 0 errores.
- `pnpm exec eslint` sobre los nueve archivos: limpio.
- `pnpm exec vitest run`, uno a la vez: `planes-service.test.ts` 89 verdes. Integración, todos saltados sin
  `HAY_BASE_DE_DATOS` (los corre el CI): `planes-cambio-por-empresa` 11, `planes-version-por-empresa` 3,
  `planes-cambio-correos` 13, `planes-cambio-programado` 12, `factura-plataforma-cambio-plan` 21,
  `planes-periodicidad-ordenes` 11, `plan-precio-historial` 9, `planes-historial` 8.

Veredicto: T7 completa; los casos de integración se revisaron contra la migración y el repositorio, pero solo el CI los corre.

## T9 — Cierre (implementer, 2026-11-12)
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: 0 errores.
- `pnpm run lint`: 0 errores, 2 avisos (ya estaban).
- `pnpm run test:guardias`: 4 rojos, los de la baseline (`dependencias-declaradas-presentes`); el resto verde. En la
  primera corrida salió `censo-order-status-rename` (455/R40) por el identificador `rechazada` en
  `planes-cambio-por-empresa.test.ts`; renombrado a `conTopePasado` (acb6adfe) y la guardia vuelve a verde.
- `./init.sh` (8 GB): rojo en el validador del board, no en el código: «zona backend: SLT-43, SLT-44, SLT-45, SLT-65,
  SLT-71, SLT-118, SLT-128 (7 in_progress, max 5)». Es del leader (cupo); el resto de pasos no llegó a correr.
- Integración (8 archivos de T7, T2.3) y E2E de planes y grupo `dinero`: NO corridos en local (no hay base desechable).
  Quedan para el CI; ninguna migración de SLT-128 se ha ejecutado aún contra Postgres.
- Archivos: 35 de «Archivos esperados» (29 del plan + 6 aceptados por el humano el 2026-11-12).

## Sync con SLT-118 y vuelta 1 del review (backend_dev, 2026-11-12)

CI (run 43255958513) dio 6 archivos rojos. Arreglos aprobados por el humano, en dos commits.

### A. Merge de `origin/feature/SLT-118-planes-facturar-periodo-en-curso` (23ddc17a)
- Sin conflictos de git: `db/schema.prisma` (gana `finNaturalAt` en `FacturaPlataforma`) y
  `tests/integration/db/factura-plataforma-cambio-plan.test.ts` se unieron solos, con los dos lados.
  Entran también los arreglos de SLT-118 a `empresas-plataforma`, `mi-plan-cambiar-plan` y
  `verificar-rls-despliegue` (90 tablas), tres de los seis rojos.
- `db/migrations/20261114120000_plan_cambio_por_empresa/migration.sql`:
  - `factura_plataforma_abrir`: rehecha sobre la de SLT-118 (subconsulta `e` y `fin_natural_at` con
    `plan_fin_periodo_calendario`); el único cambio de SLT-128 es `LEFT JOIN LATERAL plan_version_de(...)`
    en vez de `LEFT JOIN "plan"`.
  - `factura_plataforma_tomar_cambio`: rehecha sobre la de SLT-118 (recálculo de `fin_natural_at` solo si
    cambia la periodicidad, P20, y el INSERT con `fin_natural_at`); el único cambio de SLT-128 es leer
    nombre y periodicidad de `plan_version_de`.
  - `factura_plataforma_cuota` y `factura_plataforma_cerrar`: SLT-118 no las tocó; sin cambios.
  - El resto de redefinidas (`plan_tope_usuario`, `plan_tope_api_key`, `cobro_plataforma_tarifa_de`,
    `plan_de_la_empresa`) no viven en la migración de SLT-118: sin cambios.
- `down.sql`: `abrir` y `tomar_cambio` copiadas literalmente de la versión nueva de SLT-118.
- `prisma generate` regenerado. T2.3 no necesitó ajustes (compara con el texto del origen en disco).

### B. Recepción en el setup (3e25a516)
- `mi-plan-repository`, `plan-de-la-empresa`: `planCambioRecepcion.create` de la empresa A en F junto al
  `planCambioProgramado.create` (R12, R24).
- `planes-lecturas-plataforma`: `programar(tx, planId, empresas)` crea la recepción en RIGE de cada empresa;
  R16 espera `recibidas: 0, total: 2` (R11) y R21 pasa `[a]`.
- «expected 1 to be +0»: según el informe del CI no es de estos archivos; sale en
  `postulacion-recurso-migration` y `vista-filtro-migration`, que están en la baseline (no son de los 6).
  Los dos fallos de `plan-de-la-empresa` eran `cambio` nulo (línea 205) y `Object.keys(null)` (línea 241).
- `tasks.md > Archivos esperados`: +3, total 38.

### Verificación
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: 0 errores.
- `pnpm exec eslint` de los 5 tests tocados: limpio.
- `pnpm exec vitest run` de los 3 de B, `factura-plataforma-cambio-plan`, `migracion-slt128-ida-y-vuelta` y
  `tests/unit/scripts/verificar-rls-despliegue.test.ts`: 2 archivos verdes (14 tests: los 10 estáticos de
  T2.3, con los 8 «down.sql repone LITERALMENTE», y el unit de RLS), 4 saltados sin base (los corre el CI).

Veredicto: sync con SLT-118 hecho y los 6 rojos del CI atendidos; falta que el CI lo confirme.

## Constancia del CI (B1 de la review, 2026-11-12, leader)
- Run 43255958513 (`workflow_dispatch` sobre `894cfe23`): E2E y shards en verde; `gate-completo` rojo por 6 archivos fuera del baseline (3 heredados de SLT-118, 3 de lectura del plan). Arreglados en `23ddc17a` (merge de SLT-118) y `3e25a516`.
- Run 43262530746 (`workflow_dispatch` sobre `ca3361e8`): **todo verde**: `estatico`, `vitest` 3/3, `gate-completo`, `e2e (aislamiento)`, `e2e (dinero)`, `e2e (reparto)`, `e2e`. La migración `20261114120000_plan_cambio_por_empresa` y los 9 archivos de integración corrieron contra Postgres.
