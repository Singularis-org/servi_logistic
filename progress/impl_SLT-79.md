# SLT-79 — bitácora de implementación (backend_dev)

Non-SDD (decisión humana 2026-11-03, «todo manual»). Rama `feature/SLT-79-primera-ruta-manual`.
La primera ruta del día la calcula SOLO «Sincronizar ruta». Sin commits (los hace el implementer).

## Archivos

Código (lib):
- `lib/services/OptimizacionRutaService.ts`: fuera la guarda de salida (`salidaAplica`), `puntoDeRecogida`,
  `esperaPrimeraRuta` y el lector de jobs del constructor. Nueva guarda: un disparo NO manual con la primera
  ruta pendiente se omite (`primera_ruta_pendiente`). La guarda del botón (antes R64) admite
  `recogidas >= minimo` O `recogidas >= 1 y 5 min desde la última recogida`. `ParadasRepo` gana
  `ultimaRecogidaDelDia`. `motivoLlamadaRuta` sin los motivos retirados; `DisparoRuta` sin `salida`.
- `lib/interfaces/services/IOptimizacionRutaService.ts`: sin `salida` ni `salida_no_aplica`; razón nueva
  `primera_ruta_pendiente`; `esperaMs` redefinido (desde la última recogida).
- `lib/repositories/OrdenRepository.ts` + `lib/interfaces/repositories/IOrdenRepository.ts`: `ultimaRecogidaDelDia`.
- `lib/repositories/GestionOrdenRepository.ts`: `recogerLote` ya no lee la ruta ni encola; la gestión encola
  solo con coordenadas Y la primera ruta ya calculada hoy.
- `lib/services/jobs/optimizacion-ruta-encolado.ts`: fuera `dedupeKeyPrimeraRecogida` y
  `encolarPrimeraRutaPorRecogida`; `ORIGENES_JOB_RUTA = ["gestion","traspaso"]` + `ORIGENES_JOB_RUTA_RETIRADOS`.
- `lib/services/jobs/optimizacion-ruta-handler.ts`: acepta los orígenes retirados (jobs en cola antes del
  despliegue) y los pasa como `null`; ya no inyecta `JobRepository` al service.
- `lib/interfaces/repositories/IJobRepository.ts`, `lib/repositories/JobRepository.ts`: fuera
  `IJobRepositoryMovible`/`encolarOMoverPendiente`/`EncolarOMoverOpts` e `ILectorJobPendiente`/`findPendienteByDedupeKey`.
- `lib/actions/ruta-mensajero.ts`: fuera `calcularRutaAlSalir`; mensaje nuevo del `conflict`.
- `lib/types/ruta-mensajero.ts`: fuera `calcularRutaAlSalirSchema`.
- `lib/utils/aviso-recogida-insuficiente.ts`: `avisoRecogidaInsuficiente` con las dos formas pedidas.
- `lib/clients/registro-llamada-google.ts`: fuera `primera_ruta_recogida_completa`, `primera_ruta_debounce_recogida`,
  `primera_ruta_primera_gestion`, `primera_ruta_salida`. Se conserva `primera_ruta_boton`.
- `lib/interfaces/services/IMisAsignacionesService.ts`, `lib/services/MisAsignacionesService.ts`: fuera
  `primeraRutaPendiente` y `puntoRecogida` del DTO.
- `lib/config/route-optimization.ts`: comentario de `RUTA_PRIMERA_DEBOUNCE_MIN` (ahora espera del botón).

Tests borrados (solo probaban lo retirado): `tests/integration/db/job-primera-recogida-sql-real.test.ts`,
`tests/integration/repositories/job-repo-pendiente.test.ts`, `tests/integration/repositories/job-repo-posponer.test.ts`.

Tests reescritos/ajustados: `optimizacion-ruta-primera-del-dia`, `-ahorro-jornada`, `-motivo`, `-encolado`,
`-service`, `-degradacion`, `-desvio`, `-handler-payload`, dobles de `ParadasRepo` en `-credencial-rechazada`,
`-origen`, `-recuperacion`, `-reduccion`, `-tramo-vivo`, `-trazado`, `bulk-orden-service*`, `orden-service`,
`rol-admin-satelite-authz`; `tests/unit/actions/sincronizar-ruta`, `mis-asignaciones-{action,causa-devolucion,evidencias}`;
`tests/unit/utils/aviso-recogida-insuficiente`; `tests/unit/repositories/gestion-orden-repository`,
`notificacion-orden-rechazada`; `tests/unit/services/mis-asignaciones-orden-ruta`,
`integraciones-consumidores-composition-root`; `tests/unit/config/route-optimization-config` (comentarios);
`tests/integration/repositories/optimizacion-ruta-enqueue`, `orden-contar-asignadas-del-dia`;
`tests/integration/db/ruta-primera-pendiente-dos-empresas-sql-real`, `recoger-lote-dia-reserva.int`.

## «Recogido»: la transición y la consulta

Fila de `orden_historial_estado` con `origen_tipo = 'recoleccion'` (arista #11 `mensajero_recogiendo_en_bodega -> en_reparto`,
la única de esa familia, la escribe `recogerLote`) y `actor_usuario_id` = el mensajero. Para ser coherente con
`contarAsignadasDelDia` (recogidas = sus órdenes `en_reparto`), la orden debe seguir asignada a él y sin borrar.
Desde el inicio del día de CR (`inicioDelDiaCREnUtc`, la columna es `timestamp`). Empresa: la del propio mensajero.

```sql
SELECT MAX(h."created_at") AS "ultima"
  FROM "orden_historial_estado" h
  JOIN "orden" o ON o."id" = h."orden_id"
 WHERE h."actor_usuario_id" = $mensajero
   AND h."origen_tipo" = 'recoleccion'
   AND h."created_at" >= $inicioDiaCR
   AND h."organizacion_id" = (SELECT u."organizacion_id" FROM "usuario" u WHERE u."id" = $mensajero)
   AND o."organizacion_id" = h."organizacion_id"
   AND o."mensajero_asignado_id" = $mensajero
   AND o."deleted_at" IS NULL
```

Decisiones tomadas ante ambigüedad:
- Con `recogidas >= 1` y SIN ninguna fila `recoleccion` hoy (p. ej. todo le llegó por traspaso), la condición de
  tiempo se da por cumplida: no hay carga en curso que esperar. El botón calcula.
- Un job con la primera ruta pendiente se completa como `omitida/primera_ruta_pendiente` (0 lecturas de paradas,
  0 llamadas). Cubre jobs encolados antes del despliegue y jobs de ayer que corren pasada la medianoche.
- Los orígenes `recogida`/`recogida_parcial` se siguen aceptando en el payload (no reintentar ni dead-letter un
  job legado) y llegan como `null` (`job_sin_origen`).

## Mapa cambio → test

- Mínimo justo (12 de 15) calcula: `optimizacion-ruta-primera-del-dia.test.ts` «exactamente en el minimo».
- Mínimo − 1 (11 de 15) bloquea con espera: idem «minimo menos 1».
- Exactamente 5 min calcula: idem «exactamente 5 min». 4:59 bloquea (falta 1 s): idem «4:59».
- 0 recogidas bloquea sin `esperaMs` y sin leer la última recogida: idem «0 recogidas».
- Sin fila de recogida hoy calcula: idem «ninguna recogida en el historial». `desde` = 06:00Z: idem.
  Espera desde la config: idem «RUTA_PRIMERA_DEBOUNCE_MIN». `asignadas = 0` no corta: «R64: `asignadas = 0`».
- Mensajes: `sincronizar-ruta.test.ts` (dos formas exactas, mínimo del %) y `aviso-recogida-insuficiente.test.ts`.
- Un job no calcula la primera ruta: `optimizacion-ruta-primera-del-dia.test.ts` (bloque «disparo automatico»),
  `optimizacion-ruta-motivo.test.ts` (no deja línea `[google-api]`), `optimizacion-ruta-service.test.ts` (R20 sin ruta).
- No se encola al recoger (parcial y todo): `optimizacion-ruta-enqueue.test.ts` (bloque SLT-79 recogida) y
  `gestion-orden-repository.test.ts`; jornada «recoger todo y no pulsar» = 0/0/0.
- No se encola en la primera gestión: `optimizacion-ruta-enqueue.test.ts`, `gestion-orden-repository.test.ts`
  (bloque «el encolado de la gestion»), jornada variante «primera gestion» = 0/0/0.
- Motivo del log: `primera_ruta_boton` (`optimizacion-ruta-motivo.test.ts`, incluida la vía de los 5 min);
  motivos retirados fuera de la lista (idem).
- Empresa en la lectura: forma del SQL en `orden-contar-asignadas-del-dia.test.ts`; Postgres real con dos
  empresas en `ruta-primera-pendiente-dos-empresas-sql-real.test.ts` (se salta sin base local, como sus hermanos).
- `calcularRutaAlSalir` ya no existe: `sincronizar-ruta.test.ts`.

## Jornada (`optimizacion-ruta-ahorro-jornada.test.ts`), antes → ahora (opt / routes / jobs)

- Jornada A, total {3,3,6} → {3,3,5}. Fila 0: 0/0/1 → 0/0/0 (la recogida ya no crea el job del día).
  Fila 1b: 1/1/0 → 0/0/0 (recoger lo último ya no adelanta un job que pagaba). Fila 2: 0/0/0 → 1/1/0 (la primera
  ruta la paga el botón con 7/7). Resto igual. Líneas: `1b primera_ruta_recogida_completa` → `2 primera_ruta_boton`.
  Fila 1 sigue `recogida_insuficiente` 4/7 con `esperaMs` 4 min (ahora desde la última recogida, t=-7).
- Jornada B (antes salida de 1 km): {1,1,1} → {1,1,0}. Recoge 5/7; a 2 min pide esperar 3 min; a los 5 min
  justos paga `primera_ruta_boton`; otra pulsación sin cambios, 0. Ningún job.
- Variante primera gestión: 1/1/2 → 0/0/0. Variante botón 86 %: 1/1/1 → 1/1/0. Variante 5/7 recién recogido:
  0/0/1 → 0/0/0 (`esperaMs` 5 min). Nueva: recoger todo y no pulsar → 0/0/0 y sin ruta.
- Filas 11-13: el 401 que va a dead-letter ahora es el job de una entrega fuera de orden (la ruta del día la hizo
  el botón); el enfriamiento 12/13 igual.

## Verificación (NODE_OPTIONS=--max-old-space-size=8192)

- `pnpm run typecheck`: errores solo en frontend: `app/(app)/mis-asignaciones/_components/RepartoModule.tsx` (5) y
  `tests/components/*` (8 archivos, fixtures con `primeraRutaPendiente`/`puntoRecogida` y el mock de
  `calcularRutaAlSalir`). Ninguno en `lib/` ni en `tests/unit|integration`.
- `pnpm run lint`: ver informe del implementer (resultado al cierre).
- Tests tocados (32 archivos): `30 passed | 2 skipped`, `705 passed | 10 skipped` (los skipped son SQL real sin base local).
- Guardias `pnpm run test:guardias`: solo rojo `dependencias-declaradas-presentes` (4), que está en
  `tests/baseline-rojos.json` y no toca este cambio.

Veredicto: backend listo; falta frontend_dev (RepartoModule y tests de componentes) y confirmar el SQL real en CI.

## Frontend (frontend_dev)

Archivos modificados:
- `app/(app)/mis-asignaciones/_components/RepartoModule.tsx`: fuera el import de `calcularRutaAlSalir` y
  `distanciaHaversineKm`, el efecto `salidaDisparada` y la prop `umbralSalidaM`. `useEffect`/`useRef` ya no se usan.
- `app/(app)/mis-asignaciones/reparto/page.tsx`: ya no pasa `umbralSalidaM` y no importa `loadRouteOptimizationConfig`.
- `tests/components/RepartoModule.test.tsx`: fuera el mock de `calcularRutaAlSalir` y los 9 casos R62/R66 del
  disparo de salida. El caso R65 (la pantalla sin primera ruta se ve como sin ruta) se queda, montado con `renderModule`.
- `tests/components/{ChatContactoAntesDeRecoger,GestionarOrdenPanelHilo,MarcarLuegoToggle,MisAsignacionesPage,
  RepartoAyuda,RepartoAyudaResueltaPorLaTienda,RepartoModule477Correccion}.test.tsx`: fixtures sin
  `primeraRutaPendiente`/`puntoRecogida`.

Mapa: R65 → `RepartoModule.test.tsx > "RepartoModule — sin la primera ruta del día (SLT-59, R65)"`. Ninguna otra conducta de UI cambió;
el toast de SincronizarRutaButton mantiene sus 10 s.

Verificación (NODE_OPTIONS=--max-old-space-size=8192):
- `pnpm run typecheck`: 0 errores.
- `eslint` en los 10 archivos tocados: 0 errores, 1 warning anterior a este cambio (`ordenCardsEnReparto` sin uso en RepartoModule.test.tsx).
- vitest `RepartoModule.test.tsx`: 1 archivo, 108 passed.
- vitest de ChatContacto, GestionarOrdenPanelHilo, MarcarLuegoToggle y MisAsignacionesPage: 4 archivos, 44 passed.
- vitest de RepartoAyuda, RepartoAyudaResueltaPorLaTienda y RepartoModule477Correccion: 3 archivos, 29 passed.

Veredicto frontend: disparo de salida retirado de la UI; typecheck en 0 y los tests de componentes tocados en verde.

## Tanda: dos rojos nuevos del gate-completo (PR #70), 2026-11-03

- `tests/integration/db/ruta-primera-pendiente-dos-empresas-sql-real.test.ts` (R59 -> SLT-79): `ruta_optimizada.mensajero_id`
  es `@unique` (`db/schema.prisma`), así que la ruta de A y la de B para el mismo mensajero no caben juntas. Cada corrida siembra
  una sola: sin ruta propia, la de B apuntando a `mA` (anti-vacuidad `deB.rutas = 1`, no encola); con ruta propia, solo la de A
  (control positivo: `deB.rutas = 0` y encola 1). El aislamiento entre empresas lo sigue probando la corrida sin ruta propia.
- `tests/integration/db/demo-qa.test.ts` (R20–R24): la demo ya no deja `optimizacion_ruta` (ni cerrados). Se añade
  `count(jobs tipo optimizacion_ruta) = 0` por empresa, y la línea «jobs cerrados sin ejecutar» se valida en su formato
  (`ninguno` o `tipo n, ...`) y sin `optimizacion_ruta`. R22 de SL-43 sigue: cola sin pendientes y la salida cuenta por tipo.
  Nota SL-43: `specs/SL-43-datos-demo-qa/design.md:412` aún dice que `optimizacion_ruta` se encola «al recoger y al gestionar»;
  tras SLT-79 ya no en la demo (sin ruta calculada no se encola). El tipo sigue en `TIPOS_DE_JOB_ESPERADOS`, sin cambio.

Verificación (NODE_OPTIONS=--max-old-space-size=8192, DATABASE_URL local `localhost:5432`):
- vitest `ruta-primera-pendiente-dos-empresas-sql-real.test.ts`: 3 passed (no skip).
- vitest `demo-qa.test.ts`: NO verificable en local. La base local tiene deriva de migraciones (trae las de otra rama,
  `20261031120000_geo_enums_nodo_geografico`…, y le faltan las de esta); la demo cae en P2021 en
  `ConciliacionSatelitesService.marcarRecibida` antes de llegar al caso. Queda para el CI.
- `tsc --noEmit`: 0 errores. eslint en los 2 archivos: 0 errores, 1 warning anterior (`HOY` sin uso).

Veredicto: los dos tests se ajustan al retiro de los jobs de primera ruta sin baseline; el de dos empresas en verde local, demo-qa a confirmar en CI.
