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
