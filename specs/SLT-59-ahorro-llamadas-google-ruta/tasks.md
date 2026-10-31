# SLT-59 — Reducir llamadas pagadas a Google en la optimización de ruta · tasks

> Revisión 5 (2026-10-31): Fase 8 para D27 (registro de llamadas pagadas).
> Revisión 4 (2026-10-30): Fase 7 añadida para D21-D25; T6.7 y T6.8 ajustadas.
> Revisión 3 (2026-10-30): Fase 6 añadida para D16-D19; T5.2 ajustada por D20. Las fases 0-5 son las
> de la revisión 2, ya implementadas.
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
  **Revisión 3 (D20):** si `./init.sh` muere por memoria, vale typecheck + lint + `test:guardias` en
  local (la guardia 420 está en `tests/baseline-rojos.json`, no cuenta). El resto lo cierra el CI del
  PR, en T6.8. Se marca `[x]` junto con T6.8.

## Fase 6 — Revisión 3: D16-D19 (depende de F5 salvo T5.2)

- [x] **T6.1** Fuera de orden en `decidirGuardaRuta` (design §2, revisión 3). Rama nueva antes del
  desvío: `restantes` distinta de la cola de `previa` → `{ reoptimizar, motivo: "fuera_de_orden" }`.
  *Hecho:*
  - En `tests/unit/services/optimizacion-ruta-desvio.test.ts`, la tabla de casos gana:
    - hueco en medio → reoptimizar;
    - quitar la última → reoptimizar (R43);
    - prefijo → reducir;
    - fuera de orden con el mensajero sobre la ruta → reoptimizar sin decodificar la polilínea.
  - En `tests/unit/services/optimizacion-ruta-reduccion.test.ts`:
    - los casos R14 (un hueco, dos huecos, prefijo + hueco, sin cliente de Routes) pasan a R42: 1
      `optimizar`, 1 `trazar` con todas las restantes desde el origen resuelto, y 0 `reducirSecuencia`;
    - el caso «PA-1/R13» pasa a R43, con el mismo resultado;
    - caso nuevo: fuera de orden con 1 restante → 0 `optimizar` y 1 `trazar` (R42, rama 92/R35);
    - caso nuevo: fuera de orden sin tramos (`fuente` local) → recalcula, no reduce.
- [x] **T6.2** Retirar el tramo puente (design §2.2, nota de la revisión 3). Depende de T6.1. Se borran
  la rama `puente` de `planificarReduccion`, `tramosPuente` y el parámetro `permitirLlamada`. Las notas
  y los comentarios que citan D14 y R14 ganan una nota fechada «[2026-10-30, SLT-59, D16]», sin borrar
  el texto previo.
  *Hecho:*
  - `grep -n "tramosPuente\|permitirLlamada" lib/` = 0;
  - los casos R16 de `optimizacion-ruta-reduccion.test.ts` se borran;
  - los de R13 y R15 siguen verdes.
- [x] **T6.3** `reducirSinLlamadas` con fuera de orden (R44). Depende de T6.1. *Hecho:* en
  `optimizacion-ruta-reduccion.test.ts`:
  - fuera de orden (hueco y «quitar la última») → 0 llamadas y 0 escrituras;
  - prefijo → reduce.

  En `tests/unit/actions/mis-asignaciones-action.test.ts`, los títulos «R27» pasan a «R44» y las
  aserciones no cambian.
- [x] **T6.4** [P] `estado = 'vigente'` en el `where` de `reducirSecuencia` (R48, design §1). *Hecho:*
  `tests/integration/repositories/ruta-optimizada-repo.test.ts` afirma el `where` con huella y estado.
  Un caso nuevo, con la ruta `desactualizada` y la huella igual, comprueba que no escribe, devuelve
  `false` y no toca las paradas.
- [x] **T6.5** Razón `reduccion_descartada` (R49, design §2.2 nota y §6). Depende de T6.2. Se añade a
  `EjecutarOptimizacionResult` y `aplicarReduccion` la devuelve cuando no se escribe. *Hecho:*
  - en `optimizacion-ruta-reduccion.test.ts`, con huella cambiada o sin huella previa → `omitida /
    reduccion_descartada`, sin `trazado`, sin lanzar (el caso R18 actual se ajusta a esto);
  - en `tests/unit/actions/sincronizar-ruta.test.ts`, `reduccion_descartada` → `{ status: "ok",
    omitida: true, secuenciaFuente: null }`, sin `trazado`.
- [x] **T6.6** Sincronización manual sin pisar el origen (R45, R46, design §2.4). Depende de T6.2. Se
  quita `upsertOrigen` del principio de `ejecutar`, se construye la vista en memoria y se escribe
  solo antes de recalcular.
  *Hecho:* en `tests/unit/services/optimizacion-ruta-origen.test.ts`:
  - el caso «se persiste ANTES de optimizar» se ajusta: `upsertOrigen` va antes de `optimizar` y no
    antes de `findByMensajero`;
  - casos nuevos, con `motivo: "manual"` y `ubicacion`: omitida (R1), una parada omitida (R2),
    reducida (R41), intervalo mínimo (92/R34) y `reduccion_descartada` → `upsertOrigen` no se llama;
  - desviado según la ubicación RECIBIDA y no según el origen guardado → recalcula y `upsertOrigen`
    se llama una vez (R46);
  - sin ruta previa → `upsertOrigen` se llama (crea la fila).

  En `tests/unit/actions/sincronizar-ruta.test.ts`, la forma de R45 con el trazado de caché y 0
  llamadas. Los demás tests que afirmen el orden de `upsertOrigen` en `ejecutar` se ajustan solo en
  ese orden, y se añaden a «Archivos esperados».
- [x] **T6.7** [P] PA-2 → R47 y la prueba contra Postgres real (R48, R50).
  - En `optimizacion-ruta-desvio.test.ts`, el título «PA-2» pasa a «D18/R47» y la aserción no cambia.
  - Se crea `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts`.
    - **Solo `DATABASE_URL` del entorno, nunca `.env`** (instrucción del humano, 2026-10-30).
      `_postgres-real.ts` llama a `process.loadEnvFile()` **al importarse** si falta `DATABASE_URL`
      (`HAY_BASE_DE_DATOS` se evalúa al cargar el módulo), y `_jobs-dos-empresas.ts` lo importa.
      Por eso el test **no** los importa estáticamente.
    - La condición de salto se evalúa sobre `process.env.DATABASE_URL` tal cual llega al proceso, y
      exige además un host `localhost` o `127.0.0.1` (el del job de CI,
      `.github/workflows/gate.yml:47`, lo es).
    - Los helpers se cargan con `await import(...)` dentro de `beforeAll`, solo cuando la condición
      pasa. Con `DATABASE_URL` ya puesta, `urlDeBaseDeDatos` no toca `.env`.
  - Casos:
    - huella igual y `vigente` → escribe, y las paradas quedan 1..n con su tramo;
    - huella distinta → `false` y nada cambia;
    - `desactualizada` con la huella igual → `false` y nada cambia;
    - empresa B con un mensajero y una huella fabricados iguales: una reducción en el contexto de A
      no toca la cabecera ni las paradas de B (R50).

  ⚠️ En local solo se corre contra una base local, nunca contra una remota. Es el criterio que aplicó
  el reviewer (`progress/review_SLT-59.md`, B2). Si no hay base local, lo corre el CI.

  *Hecho:*
  - el archivo existe;
  - se salta en verde sin `DATABASE_URL` en el entorno, aunque exista un `.env` con una URL (caso de
    prueba manual, anotado en la bitácora);
  - se salta con un host que no es local;
  - pasa en el job de CI que tiene base.
- [ ] **T6.8** Cierre de las revisiones 3 y 4. Depende de T6.1-T6.7 y de la Fase 7. *Hecho:*
  - la jornada (`optimizacion-ruta-ahorro-jornada.test.ts`) afirma las tablas de design §8.0, no las
    de §8.1: la jornada A da `{3, 3, 6}` con las filas 0-13; la jornada B da `{1, 1, 0}` y sus tres
    variantes (R37);
  - el mapa cubre también R51-R67 y marca como retirados R19 y R26;
  - el mapa `R<n> -> test` de `progress/impl_SLT-59.md` cubre R41-R50 y marca como retirados R11,
    R14, R16 y R27;
  - typecheck, lint y `test:guardias` en local;
  - D20: `progress/impl_SLT-59.md` enlaza la corrida del PR con `gate-completo` y los jobs e2e
    (`e2e/mis-asignaciones.spec.ts`, `e2e/dos-empresas-humo.spec.ts`) en verde;
  - T5.2 y T6.8 se marcan `[x]` cuando esa corrida existe.

## Fase 7 — Revisión 4: D21-D25 (depende de T6.1-T6.6; T6.8 cierra todo)

- [x] **T7.1** [P] Config: `RUTA_RECUPERACION_ENFRIAMIENTO_MIN` (5) y `RUTA_PRIMERA_MIN_RECOGIDO_PCT`
  (80, 1-100), con su nota (design §12.7). *Hecho:* `route-optimization-config.test.ts` cubre por cada
  uno el default, un override, el valor vacío y el inválido; para el porcentaje, también 101 (R55).
- [x] **T7.2** Decisión completa (design §12.1).
  - `decidirGuardaRuta` recibe `disparo`, `ahora` y `enfriamientoMin`, y sus motivos nuevos.
  - `RutaOptimizadaDTO.actualizadaAt` se mapea desde `updated_at`.
  - `primeraPendiente` usa `inicioDelDiaCREnUtc`.

  *Hecho:* en `optimizacion-ruta-desvio.test.ts`, la tabla de casos cubre:
  - automático desviado con el mismo conjunto → omitir; con un prefijo → reducir (R51);
  - manual desviado → reoptimizar (R52);
  - polilínea vacía: manual → reoptimizar, automático → omitir (R47 acotado);
  - automático no decodifica la polilínea (espía).

  En `tests/unit/services/optimizacion-ruta-recuperacion.test.ts` (nuevo):
  - manual sobre `desactualizada`, a 4 min 59 s de `actualizadaAt` → `omitida/enfriamiento`, 0
    llamadas y 0 escrituras, incluido `upsertOrigen`;
  - a 5 min justos → recalcula;
  - con paradas nuevas a 1 min → recalcula;
  - automático sobre `desactualizada` → recalcula (R7, sin cambio) (R53, R54).

  En `optimizacion-ruta-reduccion.test.ts`: manual con un prefijo reducido y sin desvío → reducción, 0
  llamadas (R56). Los casos «R19» se renombran a R51/R52.
- [x] **T7.3** Recogida condicionada (design §12.2, R57, R58). *Hecho:* en
  `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts`:
  - recoger con más `por_recoger` del día pendientes → 0 jobs;
  - recoger el último → 1 job, con `runAfter = ahora + RUTA_DEBOUNCE_S`;
  - «recoger todas» → 1 job;
  - el último paquete con la primera ruta ya calculada hoy → 0 jobs;
  - una `por_recoger` reservada para mañana no cuenta como pendiente (mismo predicado de día);
  - si la transacción revierte, no hay job.

  Los casos de R26 se reescriben a R57/R58.
- [x] **T7.4** Gestión y traspaso con la primera ruta pendiente (design §12.3, §12.4, R59-R61).
  *Hecho:* en `optimizacion-ruta-enqueue.test.ts`:
  - gestión de una orden sin coordenadas con la primera pendiente → 1 job; con la primera hecha → 0
    (R22 acotado);
  - traspaso con el destino pendiente y el origen con ruta de hoy → solo encola el origen; los dos
    pendientes → 0; los dos con ruta → 2 (R60);
  - crear una asignación → 0 jobs (R61).

  En `tests/unit/services/optimizacion-ruta-primera-del-dia.test.ts` (nuevo): job `debounce` con la
  primera pendiente, mismo conjunto y sin desvío → recalcula (R59).
- [x] **T7.5** Botón con la primera pendiente (design §12.5, R64, R67).
  - `contarAsignadasDelDia` en `ParadasRepo` y `OrdenRepository`.
  - Guarda en `ejecutar`.
  - `sincronizarRuta` traduce `recogida_insuficiente` a `conflict` con el texto del design.

  *Hecho:* en `optimizacion-ruta-primera-del-dia.test.ts`:
  - 3 de 4 (75 %) → `recogida_insuficiente`, 0 llamadas y 0 escrituras;
  - 4 de 5 (80 % justo) → recalcula con lo recogido;
  - `asignadas = 0` no corta;
  - con la primera ya hecha, `contarAsignadasDelDia` no se llama (R67).

  En `sincronizar-ruta.test.ts`: el motivo lleva X, Y y el porcentaje de la config.
  `SincronizarRutaButton.test.tsx` sigue verde sin cambios.
- [x] **T7.6** Disparo de salida: servidor (design §12.6, R63, R66). `motivo: "salida"`,
  `calcularRutaAlSalir` en `lib/actions/ruta-mensajero.ts` y la guarda en `ejecutar`.
  *Hecho:* en `optimizacion-ruta-primera-del-dia.test.ts`:
  - a 1001 m del punto de recogida con la primera pendiente → recalcula (1 `optimizar` + 1 `trazar`
    con 2+ paradas) y `upsertOrigen` antes de llamar;
  - a 1000 m → `salida_no_aplica`;
  - con la primera ya hecha → `salida_no_aplica`;
  - sin punto de recogida (origen `ultima_conocida` o de ayer) → `salida_no_aplica`;
  - `desactualizada` dentro del enfriamiento → `salida_no_aplica`;
  - dos disparos seguidos → la segunda vez, 0 llamadas (R66).

  En `sincronizar-ruta.test.ts`, para `calcularRutaAlSalir`: rol distinto de `mensajero` →
  `forbidden` sin construir el servicio; ubicación inválida → `validation_error`; fallo del proveedor
  → `conflict`.
- [x] **T7.7** Disparo de salida: cliente y DTO (design §12.6, R62, R65). Es el **toque de frontend**
  de la ficha.
  - `RutaResumenDTO` gana `primeraRutaPendiente` y `puntoRecogida`, que calcula
    `MisAsignacionesService` sin lecturas nuevas.
  - `RepartoModule` gana el efecto de una vez. El umbral llega como prop.

  *Hecho:* en `tests/components/RepartoModule.test.tsx`, con `watchPosition` simulado:
  - a 900 m → no llama;
  - a 1100 m → llama una vez con la posición;
  - más lecturas → no vuelve a llamar;
  - sin primera pendiente, o sin punto de recogida → nunca llama;
  - con la primera pendiente se ven el aviso «El orden mostrado no está actualizado», «Pendiente de
    optimizar» y los marcadores sin número (R65; los casos de hoy siguen verdes).

  El test de `MisAsignacionesService` que arma `ruta` cubre los dos campos.
- [x] **T7.8** Jornadas de design §8.0 en `optimizacion-ruta-ahorro-jornada.test.ts` (R37). Depende de
  T7.1-T7.6. *Hecho:* jornada A `{3, 3, 6}` fila a fila (filas 12 y 13 aparte); jornada B `{1, 1, 0}`
  y sus tres variantes.

- [x] **T7.9** D29: debounce deslizante de la primera ruta durante la recogida (R76, R77, design §12.2
  nota D29). Depende de T7.3. Se integra en T7.3: R58 pasa a usar la misma clave por día.
  - Config `RUTA_PRIMERA_DEBOUNCE_MIN` (10, entero ≥ 1; fuera de rango → default).
  - `JobRepository.encolarOMoverPendiente` (`ON CONFLICT … DO UPDATE … WHERE estado = 'pending'`).
  - Clave `ruta-opt:primera-recogida:<mensajeroId>:<díaCR>`.
  - `origen = recogida_parcial` → motivo `primera_ruta_debounce_recogida` (Fase 8).

  *Hecho:*
  - en `optimizacion-ruta-enqueue.test.ts`:
    - recogida parcial con la primera pendiente → 1 job a ahora + 10 min;
    - una segunda recogida parcial a los 4 min → mismo job, `runAfter` movido a ahora + 10 min;
    - la última recogida → mismo job, a ahora + `RUTA_DEBOUNCE_S` y `origen = recogida`;
    - con la primera ruta ya calculada hoy → 0 jobs;
  - en `tests/integration/repositories/job-repo-posponer.test.ts` (nuevo): el SQL lleva `DO UPDATE` y
    `WHERE … 'pending'`; con la fila `done`/`running` no crea ni mueve (R77);
  - config: default, override, vacío e inválido;
  - en `optimizacion-ruta-motivo.test.ts` (Fase 8): `recogida_parcial` → `primera_ruta_debounce_recogida`.

## Fase 8 — Revisión 5: D27, registro de llamadas pagadas (depende de la Fase 7)

- [x] **T8.1** Pieza común `lib/clients/registro-llamada-google.ts` (design §13.0).
  - Contiene las constantes `GOOGLE_API_LOG_PREFIJO = "[google-api]"` y `GOOGLE_API_LOG_EVENTO =
    "google_api_llamada"`, los tipos `ApiGoogle`, `MotivoLlamadaRuta`, `MotivoLlamadaGeocode` y
    `ContextoLlamadaGoogle`, y `registrarLlamadaGoogle`.

  *Hecho:* `tests/unit/clients/google-registro-llamada.test.ts` comprueba:
  - la línea empieza por el prefijo y lleva `evento`;
  - ningún campo contiene coordenadas, la dirección, el token ni la URL (R71).
- [x] **T8.2** Los tres clientes exigen `ContextoLlamadaGoogle` y emiten una línea por petición (R68-R72).
  Depende de T8.1. *Hecho:* en `google-registro-llamada.test.ts`, con `fetch` y logger simulados:
  - para `route_optimization`, `routes` y `geocoding`, la línea sale con el prefijo y el `evento` de la
    constante (el test importa la constante, no repite el literal);
  - `api` correcto, `paradas` = envíos enviados (`route_optimization`), `ok` frente a `500`/`401`/`timeout`;
  - el token OAuth no deja línea;
  - el cálculo local y la recta de respaldo no dejan línea.

  `tests/unit/clients/google-*.test.ts` (existentes) se ajustan solo para pasar el contexto.
- [x] **T8.3** Motivos de rutas y de geocode (design §13.1, §13.2; R70, R73). Depende de T8.2.
  - Rutas:
    - payload `origen` en recogida, gestión y traspaso;
    - el servicio deriva el motivo;
    - el handler pasa el `intento` y el `max_intentos` del job;
    - `trazarTramoVivo` y el probador pasan el suyo.
  - Geocode:
    - `encolarGeocodificacion` exige `motivo`;
    - cada llamador pasa el suyo; se fija con sus llamadores qué ruta de `BulkOrdenService` es
      `orden_creada` y cuál `carga_masiva`, y se anota en la bitácora;
    - `revivirFallosConfig` reescribe `payload.motivo`;
    - el handler y el probador lo pasan.

  *Hecho:*
  - `tests/unit/services/optimizacion-ruta-motivo.test.ts`: un caso por cada motivo de §13.1,
    incluidos `reintento_ruta_desactualizada` y `job_sin_origen`, y el intento 2 de 3 de un reintento
    tras un 500;
  - `tests/unit/services/geocodificacion-motivo.test.ts`: un caso por cada motivo de §13.2, incluido
    `job_sin_motivo`;
  - `optimizacion-ruta-enqueue.test.ts` afirma el `origen` del payload;
  - el test de salud afirma `revivido_por_salud`.
- [x] **T8.4** Secuencia de la jornada (R75). Depende de T8.3 y T7.8. *Hecho:*
  `optimizacion-ruta-ahorro-jornada.test.ts` captura las líneas `[google-api]` y afirma la secuencia
  de design §13.3, en orden.
- [x] **T8.5** Cierre. Los mapas `R<n> -> test` cubren R68-R75; typecheck (R68), lint y
  `test:guardias` en local. `db/` sin cambios (R74).

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
- `tests/unit/services/optimizacion-ruta-origen.test.ts`
- `tests/integration/db/ruta-optimizada-reduccion-sql-real.test.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/services/IMisAsignacionesService.ts`
- `lib/services/MisAsignacionesService.ts`
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`
- `tests/unit/services/optimizacion-ruta-recuperacion.test.ts`
- `tests/unit/services/optimizacion-ruta-primera-del-dia.test.ts`
- `tests/components/RepartoModule.test.tsx`
- `app/(app)/mis-asignaciones/reparto/page.tsx`
- `lib/clients/registro-llamada-google.ts`
- `lib/clients/google-route-optimization.ts`
- `lib/clients/google-routes.ts`
- `lib/clients/google-geocode.ts`
- `lib/clients/probadores/optimizacion-rutas-probador.ts`
- `lib/clients/probadores/google-maps-probador.ts`
- `lib/services/jobs/geocodificacion-encolado.ts`
- `lib/services/jobs/geocodificacion-handler.ts`
- `lib/services/GeocodificacionService.ts`
- `lib/services/GeocodeSaludService.ts`
- `lib/services/AsignabilidadCoordenadasService.ts`
- `lib/services/BulkOrdenService.ts`
- `tests/unit/clients/google-registro-llamada.test.ts`
- `tests/unit/clients/google-route-optimization.test.ts`
- `tests/unit/clients/google-routes.test.ts`
- `tests/unit/clients/google-geocode.test.ts`
- `tests/unit/services/optimizacion-ruta-motivo.test.ts`
- `tests/unit/services/geocodificacion-motivo.test.ts`
- `tests/unit/services/mis-asignaciones-orden-ruta.test.ts`
- `specs/SLT-59-ahorro-llamadas-google-ruta/requirements.md`
- `specs/SLT-59-ahorro-llamadas-google-ruta/design.md`
- `specs/SLT-59-ahorro-llamadas-google-ruta/tasks.md`
- `progress/impl_SLT-59.md`
