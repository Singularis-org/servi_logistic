# review SLT-59 «Reducir llamadas pagadas a Google en la optimización de ruta»

Revisor: reviewer (2026-10-30). Rama `feature/SLT-59-ahorro-llamadas-google-ruta`, HEAD `f0f6c5b` (con `dev` mergeado).
Diff: `git diff origin/dev...HEAD` (35 archivos: 11 de `lib/`, 18 de `tests/`, spec y bitácora).
MCP del grafo no usado: el worktree no está indexado. Todo se revisó con Grep/Read.

## Verificación ejecutada por el reviewer

Todo con `NODE_OPTIONS=--max-old-space-size=8192`, sin `DATABASE_URL` y sin tocar ninguna base remota.

| Comando | Resultado |
| --- | --- |
| `pnpm run typecheck` | exit 0 |
| `pnpm exec eslint <24 .ts del diff>` | exit 0, sin salida |
| `vitest run` desvio, reduccion, polilinea, route-optimization-config, optimizacion-ruta-service | 5 archivos, 147 passed |
| `vitest run` ahorro-jornada, credencial-rechazada, job-queue-service{,-permanente,-descartado}, sincronizar-ruta, mis-asignaciones-action, optimizacion-ruta-encolado, optimizacion-ruta-enqueue (int.), ruta-optimizada-repo (int.), notificacion-orden-rechazada | 11 archivos, 173 passed |
| `vitest run` degradacion, origen, tramo-vivo, trazado, composition-root, token-por-empresa (dobles tocados) | 6 archivos, 85 passed |
| `vitest run tests/guards/guard-dependencias-aprobadas.test.ts` (R39) | 2 passed |
| `git diff --stat origin/dev...HEAD -- db/ package.json pnpm-lock.yaml` (R39, R40) | vacío |
| `grep encolarOptimizacionInmediata\|dedupeKeyInmediato\|OPTIMIZACION_MAX_INTENTOS lib tests app` | 0 en código; 1 mención en un comentario histórico de la jornada |

**Mutaciones temporales.** Cada una se revirtió con `git checkout -- <archivo>` y el árbol quedó limpio. Las 12 dan rojo:

| # | Mutación | Test que la detecta | Resultado |
| --- | --- | --- | --- |
| M1 | `> umbralM` → `>=` (R3, borde de 1000 m) | desvio | 1 failed |
| M2 | ignorar la polilínea `routes` en `lineaReferencia` (R4) | desvio | 2 failed |
| M3 | un hueco tratado como concatenar (R14) | reduccion | 1 failed |
| M4 | quitar la guarda de la rama de una parada (R2, R6) | desvio + reduccion | 3 failed |
| M5 | `reducirSinLlamadas` con `permitirLlamada = true` (R27) | reduccion | 1 failed |
| M6 | `config_invalida` sin `RutaCredencialRechazadaError` (R29-R31) | credencial-rechazada + jornada | 7 failed |
| M7 | encolar aunque la orden no tenga coordenadas (R22) | enqueue (int.) | 1 failed |
| M8 | `maxIntentos` = 5 (R32) | encolado | 2 failed |
| M9 | `reducirSecuencia` sin `huellaSet` en el `where` (R18) | ruta-optimizada-repo | 2 failed |
| M10 | reducir aunque `gestionar` no dé `ok` (R27) | mis-asignaciones-action | 2 failed |
| M11 | quitar la rama `JobFallidoPermanente` de `drenar` (R29) | job-queue-service-permanente | 3 failed |
| M12 | el handler no traduce a `JobFallidoPermanente` (R29) | credencial-rechazada | 4 failed |

## Checklist

### Especificación (CHECKPOINTS.md)
- [x] `requirements.md` con R1-R40 en EARS y D1-D15 cerrados por el humano.
- [x] `design.md` con alternativas descartadas (A1-A8).
- [ ] **`tasks.md`: T5.2 sigue `[ ]`** (ver B1).
- [x] `design.md` abre con `## Lo que ya existe`, con la búsqueda hecha. El diff no re-crea nada de esa lista: reutiliza `encolarOptimizacionDebounce`, `decodificarPolilinea`/`codificarPolilinea`, `routes.trazar`, `huella` y el patrón de `JobDescartado`. `JobFallidoPermanente` es nuevo por diseño (A5).

### Equipo
- [x] Assignee y candado (`8c7f39c chore(SLT-59): feature tomada por usuario`).

### Trazabilidad
- [x] Cada R1-R40 mapea a un test concreto. El mapa final está en `progress/impl_SLT-59.md` › «Mapa final R<n> → test».
- [x] Los tests son reales: comprobado con las mutaciones M1-M12 y con lectura de reduccion, desvio, action, permanente y jornada.
- [x] R37: la jornada usa el servicio, el handler, `JobQueueService` y los helpers reales, y afirma `toEqual(NUEVO)` fila a fila más el total `{2, 3, 6}`. La fila 11 (401) se cubre con M6.
- [x] R39 y R40: comprobados sobre el diff.

### Calidad de código
- [x] Typecheck: exit 0.
- [x] Lint: 0 errores en los archivos del diff.
- [ ] `gate-completo` en CI: pendiente del PR (no es de esta revisión).
- [ ] **Flujo crítico `mis-asignaciones` tocado, sin salida de E2E en la bitácora** (ver B2).
- [x] Sin dependencias nuevas.

### Seguridad y configuración
- [x] Sin secretos. El motivo de un 401/403 es `optimizar ruta: credencial rechazada (HTTP n)`, sin token, URL ni coordenadas (R35, con test de cadena real).
- [x] Los umbrales salen de configuración (`RUTA_REOPT_DISTANCIA_M`, `RUTA_OPT_MAX_INTENTOS`) con `readPositiveInt`, que cae al default (R36).

### Proyecto (`docs/checkpoints-proyecto.md`, `docs/perfil-agentes.md > reviewer`)
- [x] Sin tabla ni migración nueva (R40).
- [x] Sin literal de país ni moneda. Sin referencias a Ordenex.
- [x] `reducirSecuencia` usa `getPrismaClient()`. `ruta_optimizada` y `ruta_optimizada_parada` están en `modelos-de-negocio.ts`, y la extensión de empresa cubre `updateMany`, `deleteMany`, `createMany` y `$transaction`. Mismo patrón que `guardarTrazado`. Ver m2.
- [x] Capas respetadas:
  - la decisión vive en el service (`decidirGuardaRuta`, pura);
  - la escritura condicionada, en el repo;
  - la orquestación post-commit, en la Server Action (A7).
- [x] Los comentarios explican el porqué. Las notas fechadas se anexan sin borrar el texto de la 92 ni de la 265, salvo el bloque de reposición del trazado de la rama de una parada, que se retira y se explica.
- [x] La autorización no cambia: `reducirRuta` solo corre tras un `ok` de `service.gestionar`, que ya valida el rol, y con `actor.usuarioId`.

## Puntos de foco pedidos por el leader

- **Guarda por desvío.**
  - Mide la distancia mínima a la polilínea `routes` persistida. Sin ella, usa la recta por la secuencia previa.
  - La comparación es estricta: a 1000 m no hay desvío.
  - El centroide no cuenta como posición (R5).
  - El desvío se mide después de R20, así que la recta nunca queda vacía.
  - La geometría es una proyección equirectangular centrada en el punto y protege el segmento degenerado.
  - **Correcto.**
- **Reducción sin llamadas frente a un `computeRoutes` por el puente.** `planificarReduccion` cuenta como huecos solo los que hay ENTRE restantes. Los casos:

  | Caso | Plan | Llamadas a Routes |
  | --- | --- | --- |
  | Prefijo, o quitadas detrás de la última restante | concatenar | 0 |
  | Un hueco | `trazar(anterior → siguiente)` | 1 |
  | Dos o más huecos | `trazar(primeraRestante → resto)` | 1 |
  | Sin trazado `routes`, o falta algún tramo | `sin_trazado` | 0 |

  Nunca se mete una recta. Si el puente falla o no da un tramo por parada, se persiste sin trazado y no se lanza (R16). **Correcto.**
- **Debounce de la gestión.**
  - El SELECT de gestionable trae `tiene_coordenadas`: misma sentencia, ya bajo el candado.
  - El paso (7) encola con `encolarOptimizacionDebounce` dentro de la tx, solo si la orden tiene coordenadas.
  - El inmediato se retiró del todo. El traspaso y la recogida no cambian (R26). **Correcto.**
- **Carrera en `reducirSecuencia`.**
  - El `updateMany ... where { mensajeroId, huellaSet: huellaPrevia }` hace de barrera dentro de la misma `$transaction`.
  - Con `count === 0` devuelve `false` sin tocar las paradas.
  - Las paradas se borran y se reinsertan como `1..n`.
  - Con huella previa `null` no escribe.
  - **Correcto** (ver m3 y m6).
- **401/403 en `JobQueueService`.**
  - La rama `JobFallidoPermanente` hace `fail(id, msg, null)` y cuenta un muerto. Es opt-in: solo la lanza el handler de `optimizacion_ruta`.
  - El resto de errores sigue por `manejarFallo` igual que antes (R34 con geocodificación, push_web y webhook_evento).
  - `RutaCredencialRechazadaError` es subclase de `RutaIntentoFallidoError`, así que `sincronizarRuta` la sigue convirtiendo en `conflict` (R31).
  - `marcarDesactualizada` va antes del throw (R30). **Correcto.**
- **Máximo 3 intentos.** `maxIntentos: loadRouteOptimizationConfig().RUTA_OPT_MAX_INTENTOS`, con default 3 (R32 y M8). **Correcto.**

## Desviaciones declaradas: juicio

| Desviación | Juicio |
| --- | --- |
| `secuencia_fuente` se conserva con una parada (ya no se reafirma `null`) | Aceptada. La dicta R6 (omitir no escribe) y R12 (la reducción conserva la procedencia). |
| La guarda va antes de `reemplazarSecuencia` en la rama de una parada | Aceptada y necesaria: sin ese cambio, R6 y R17 no se cumplen (`calculada_at` y origen se movían). Comprobado con M4. |
| `upsertOrigen` va antes de la guarda | Aceptada con matiz (m1). Conserva 92/R23 y el orden de R8, y R27 pide guardar la ubicación. Pero escribe las mismas columnas `origen_*` que R6 dice no tocar al omitir. |
| Huella `null` ⇒ no escribe | Aceptada. Es el lado seguro de R18. El job está como red (D15). |
| Routes da `ok` sin todos los tramos ⇒ R16 | Aceptada. No se inventa ningún tramo (D14). |
| PA-1 = R13, 0 llamadas | Técnicamente correcta: cada tramo es el que llega a su parada, así que no hay puente que pedir. Tiene test. Es decisión del leader «pendiente de objeción humana» (m5). |
| PA-2 = `+Infinity` ⇒ reoptimizar | Aceptada como default seguro. Tiene test. Ídem m5. |
| Se quita el caso `error` del `it.each` de mis-asignaciones-action | Aceptada. `GestionarServiceResult` no tiene ese estado, y el caso «el service LANZA» lo cubre. |
| Se editan dobles de tests ajenos | Aceptada. Solo se añaden los campos de config, el stub `reducirSinLlamadas` y `tiene_coordenadas: true`, que exigen el tipo o el SELECT nuevo. Ninguna aserción cambia. |

## Hallazgos

### BLOQUEANTE

- **B1. T5.2 sin marcar en `tasks.md`.** CHECKPOINTS › Especificación exige todas las tasks en `[x]`.
  - Lo que T5.2 pide ya está verificado: typecheck exit 0 (lo corrí yo), lint con 0 errores, R39 y R40 vacíos. El rojo de `test:guardias` es la guardia 420 (`dependencias-declaradas-presentes.guardia.test.ts`), que figura en `tests/baseline-rojos.json`; no es un hallazgo.
  - Falta `./init.sh` en verde o, si muere por memoria, la decisión del leader de cerrarlo con typecheck, guardias y el CI.
  - Para cerrarlo: dejar esa evidencia en `progress/impl_SLT-59.md` y marcar T5.2.
- **B2. Se toca un flujo crítico sin salida de E2E en la bitácora.**
  - `docs/checkpoints-proyecto.md › Flujos críticos` incluye «Asignación y recepción de órdenes (`mis-asignaciones`)». El diff cambia:
    - la Server Action `gestionar` (`lib/actions/mis-asignaciones.ts`), que ahora reduce la ruta después del `ok`;
    - el encolado dentro de `GestionOrdenRepository.registrarGestionPendiente`.
  - CHECKPOINTS pide que un E2E cubra el flujo y que su salida local esté en `progress/impl_<key>.md`. El E2E existe (`e2e/mis-asignaciones.spec.ts`, describe «recoger y gestionar») pero no hay ninguna corrida registrada.
  - Además, la feature toca un job y datos de negocio, así que el checkpoint de aislamiento pide correr `e2e/dos-empresas-humo.spec.ts`.
  - Para cerrarlo hay dos caminos:
    - correr los dos specs contra una base local, nunca remota, y pegar la salida;
    - si no hay base local disponible, que el humano registre la excepción por escrito en `progress/features/SLT-59.md` (por ejemplo, «el E2E lo corre el CI del PR a prod»).

### Menores

- **m1. R6 al pie de la letra.** Una sincronización manual con GPS que acaba en «omitir» escribe `origen_lat/lng/at/fuente` mediante `upsertOrigen` (92/R23), y R6 dice que no se modifica «el origen». La lectura del implementer, que R6 se refiere a la guarda, es coherente con R8 y R27. Conviene anotar esa lectura en `requirements.md` para que no se relea como incumplimiento.
- **m2. Integración sin Postgres real.** `reducirSecuencia` (la barrera de R18 y el filtrado de empresa vía la extensión) solo se prueba con Prisma mockeado en `tests/integration/repositories/ruta-optimizada-repo.test.ts`. No hay test contra Postgres ni con dos empresas. El riesgo es bajo porque el patrón es idéntico a `guardarTrazado` y las dos tablas están en `modelos-de-negocio.ts`. Queda como deuda candidata en `tests/integration/db/`.
- **m3. El job informa de algo que no escribió.** Con la huella cambiada (R18), el job devuelve `omitida/reducida` y termina `done` sin haber escrito. Es lo que dice el spec. Pero si quien escribió antes leyó un conjunto más viejo (una reducción en petición lenta frente al job), el estado queda desfasado hasta el siguiente evento. Es el «borde heredado» declarado en design §3.1; solo informativo.
- **m4. R16 deja todas las paradas sin tramo.** Si el puente falla, se persisten `tramo: null` en todas las paradas, también en las que tenían un tramo válido. Las siguientes entregas en orden caen en R15, sin trazado, hasta la próxima reoptimización. Cumple el spec («sin trazado»), pero se podrían conservar los tramos válidos en una ficha futura.
- **m5. PA-1 y PA-2 no están en el spec.** Son decisiones del leader «pendientes de objeción humana» y no figuran en la tabla D de `requirements.md`. Conviene que el humano las confirme antes del merge y que se añadan como D16 y D17.
- **m6. La escritura de la reducción no comprueba el estado.** El `where` de `reducirSecuencia` no incluye `estado = vigente`. `marcarDesactualizada` no cambia la huella, así que una reducción leída como vigente puede aplicarse sobre una ruta recién marcada desactualizada. Solo reordena lo que ya había y el estado se conserva. Ventana mínima.

## Veredicto

**RECHAZADO.** 2 bloqueantes (B1: T5.2 sin cerrar; B2: falta la evidencia E2E del flujo crítico `mis-asignaciones`) y 6 menores.

Los dos bloqueantes son de proceso o evidencia, no de código. La implementación cumple R1-R40, y las 12 mutaciones confirman que los tests muerden. Cerrados B1 y B2 sin más cambios de código, la vuelta 2 puede limitarse a comprobar esa evidencia.
