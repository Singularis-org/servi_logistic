# SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta · tasks

> Revisión 2 (2026-10-29). Requisitos en `requirements.md`, diseño en `design.md`. `[P]` =
> paralelizable con las demás `[P]` de su fase. Cada task cierra con
> `pnpm exec vitest related --run <archivos tocados>` en verde. Sin migración (R40).

## Fase 0 — Medir antes de tocar

- [x] **T0.1** Escribir `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts` con el escenario
  de `design.md` §8 y ejecutarlo contra el código **actual** (sin tocar producción; las filas que
  dependen de `reducirSinLlamadas` se simulan sin esa llamada).
  *Hecho:* los conteos «Hoy» medidos están en `progress/impl_SLT-59.md` con el comando; si difieren de
  la tabla, la tabla se corrige con la nota «medido T0.1».
- [x] **T0.2** [P] Comprobar que el describe «265/R33 — las guardas cortan EN ESTE ORDEN» de
  `tests/unit/services/optimizacion-ruta-service.test.ts` está verde en `dev`.
  *Hecho:* resultado anotado en `progress/impl_SLT-59.md`.

## Fase 1 — Piezas puras y configuración (depende de F0)

- [x] **T1.1** [P] `distanciaMinimaAPolilineaM` en `lib/geo/polilinea.ts` (design §2.1).
  *Hecho:* casos nuevos en `tests/unit/geo/polilinea.test.ts`: punto sobre un segmento (≈0), punto
  lateral a distancia conocida, punto más allá del extremo, un solo punto, polilínea decodificada de
  ida y vuelta.
- [x] **T1.2** [P] Dos campos nuevos en `RouteOptimizationConfig` con su nota (design §5).
  *Hecho:* `tests/unit/config/route-optimization-config.test.ts` cubre default, override, vacío e
  inválido de los dos (R36), y que `RUTA_SYNC_MIN_INTERVALO_S` sigue en 10 (R38).
- [x] **T1.3** `reducirSecuencia` en el contrato y en `RutaOptimizadaRepository` (design §1).
  *Hecho:* casos nuevos en `tests/integration/repositories/ruta-optimizada-repo.test.ts`: secuencia
  1..n con tramos conservados, `calculada_at`, origen, `secuencia_fuente` y `ultimo_error` intactos
  (R12, R17); con huella distinta no escribe nada y devuelve `false` (R18).

## Fase 2 — La guarda (depende de T1.1, T1.2)

- [x] **T2.1** `decidirGuardaRuta` exportada y pura (design §2). *Hecho:* tabla de casos en
  `tests/unit/services/optimizacion-ruta-desvio.test.ts` para R3, R4 (con y sin polilínea), R5, R7, R10
  (mismo conjunto, posición sobre la ruta y `calculada_at` de hace 8 h → omitir), R19 y R20; borde de
  1000 m justos → no desviado.
- [x] **T2.2** Sustituir la guarda 92/R36 en la rama de 2+ paradas y en la de una parada (design §2,
  §2.2 último párrafo). *Hecho:* tests de R1, R2, R6 y R9 (espías: 0 llamadas, 0 escrituras, ninguna
  lectura extra) en `optimizacion-ruta-desvio.test.ts`; el describe «265/R33» sigue verde, ajustando
  solo los casos cuyo «sin cambios» dependía de la huella con origen (R8).
- [x] **T2.3** Reducción dentro de `ejecutar` (design §2.2). *Hecho:*
  `tests/unit/services/optimizacion-ruta-reduccion.test.ts`: prefijo con tramos → 0 llamadas y
  trazado concatenado con sumas (R11, R13); 1 hueco → 1 `computeRoutes` de 2 puntos (R14); 2 huecos →
  1 `computeRoutes` desde la primera restante (R14); sin tramos → 0 llamadas y sin trazado (R15);
  `computeRoutes` falla → reducción persistida, sin lanzar (R16); procedencia conservada (R12);
  `calculada_at` intacta (R17); huella cambiada → nada escrito (R18).
- [x] **T2.4** `reducirSinLlamadas(mensajeroId)` (design §3.2). *Hecho:* en
  `optimizacion-ruta-reduccion.test.ts`: aplica solo R13/R15; con hueco o desvío no hace nada y no llama
  a nadie.
- [x] **T2.5** Notas fechadas en `OptimizacionRutaService.ts` junto a «R36» y `ORIGEN_DECIMALES`, y
  junto al límite 2 de la 265 si aparece en el código (design §10). *Hecho:* el texto original sigue
  intacto (revisar diff).

## Fase 3 — La gestión (depende de T1.2; [P] con F2 salvo T3.3)

- [x] **T3.1** `registrarGestionPendiente`: coordenadas en la re-lectura y encolado con debounce solo
  si las tiene (design §3.1). *Hecho:* `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts`
  cubre R21, R22, R23 (recogida + gestión y dos gestiones en la misma ventana → 1 job), R25 y R26.
- [x] **T3.2** Retirar `encolarOptimizacionInmediata` y `dedupeKeyInmediato`; usar
  `RUTA_OPT_MAX_INTENTOS`; nota fechada en el comentario §4.1. *Hecho:*
  `tests/unit/services/optimizacion-ruta-encolado.test.ts` sin los casos del inmediato y con R23, R24
  y R32; `grep encolarOptimizacionInmediata lib/` = 0.
- [x] **T3.3** `deps.reducirRuta` en la Server Action `gestionar` (design §3.2). Depende de T2.4.
  *Hecho:* `tests/unit/actions/mis-asignaciones-action.test.ts`: se llama tras un `ok` con el
  `usuarioId` del actor, no se llama tras `conflict`/`forbidden`/error (R27), y si lanza la action
  devuelve el mismo resultado (R28).

## Fase 4 — Reintentos (independiente; [P] con F2 y F3)

- [x] **T4.1** [P] `JobFallidoPermanente` y su rama en `JobQueueService.drenar` (design §4, pasos 3-4).
  *Hecho:* `tests/unit/services/job-queue-service-permanente.test.ts`: dead-letter en el intento 1 de 3
  (R29), un error normal sigue con backoff (R33), otro tipo de job se comporta igual (R34);
  `job-queue-service.test.ts` y `job-queue-service-descartado.test.ts` siguen verdes.
- [x] **T4.2** `RutaCredencialRechazadaError` en el servicio y su traducción en el handler (design §4,
  pasos 1-2). *Hecho:* `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts`: 401 y 403
  → `JobFallidoPermanente`, ruta `desactualizada` con el orden previo intacto (R30), motivo sin token,
  URL ni coordenadas (R35); `tests/unit/actions/sincronizar-ruta.test.ts` cubre R31.

## Fase 5 — Cierre (depende de todo lo anterior)

- [x] **T5.1** Completar la jornada de referencia (R37) con la columna «Nuevo» como aserciones exactas.
  *Hecho:* test verde; la columna «Hoy» queda solo en el informe.
- [ ] **T5.2** `pnpm run typecheck`, `pnpm run lint`, `pnpm run test:guardias` (incluye R39) y
  `./init.sh` en verde; `git diff --stat dev -- db/` vacío (R40). *Hecho:* salida en
  `progress/impl_SLT-59.md` con el mapa `R<n> -> test`.

## Archivos esperados

- `lib/geo/polilinea.ts`
- `lib/config/route-optimization.ts`
- `lib/interfaces/repositories/IRutaOptimizadaRepository.ts`
- `lib/interfaces/services/IOptimizacionRutaService.ts`
- `lib/repositories/RutaOptimizadaRepository.ts`
- `lib/repositories/GestionOrdenRepository.ts`
- `lib/services/OptimizacionRutaService.ts`
- `lib/services/JobQueueService.ts`
- `lib/services/jobs/optimizacion-ruta-encolado.ts`
- `lib/services/jobs/optimizacion-ruta-handler.ts`
- `lib/services/jobs/job-fallido-permanente.ts`
- `lib/actions/mis-asignaciones.ts`
- `lib/actions/ruta-mensajero.ts`
- `tests/unit/geo/polilinea.test.ts`
- `tests/unit/config/route-optimization-config.test.ts`
- `tests/unit/services/optimizacion-ruta-desvio.test.ts`
- `tests/unit/services/optimizacion-ruta-reduccion.test.ts`
- `tests/unit/services/optimizacion-ruta-ahorro-jornada.test.ts`
- `tests/unit/services/optimizacion-ruta-credencial-rechazada.test.ts`
- `tests/unit/services/optimizacion-ruta-service.test.ts`
- `tests/unit/services/optimizacion-ruta-encolado.test.ts`
- `tests/unit/services/job-queue-service-permanente.test.ts`
- `tests/unit/actions/mis-asignaciones-action.test.ts`
- `tests/unit/actions/sincronizar-ruta.test.ts`
- `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts`
- `tests/integration/repositories/ruta-optimizada-repo.test.ts`
