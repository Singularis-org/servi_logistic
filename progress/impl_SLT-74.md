# SLT-74 — bitácora de implementación (backend_dev)

Non-SDD (decisión humana 2026-10-31). Rama `feature/SLT-74-minimo-recogida-en-numero`, tres commits:

- `00d0aff` fix: el mínimo de recogida se muestra como número de paquetes.
- `83e42b6` fix: el debounce de la primera ruta baja de 10 a 5 min.
- `fde4518` feat: el aviso de recogida insuficiente dice cuánto falta para la primera ruta.

## Archivos

- Código: `lib/actions/ruta-mensajero.ts`, `lib/utils/aviso-recogida-insuficiente.ts` (nuevo),
  `lib/config/route-optimization.ts`, `lib/interfaces/repositories/IJobRepository.ts`
  (`ILectorJobPendiente`), `lib/repositories/JobRepository.ts` (`findPendienteByDedupeKey`),
  `lib/interfaces/services/IOptimizacionRutaService.ts` (`esperaMs?`),
  `lib/services/OptimizacionRutaService.ts`, `lib/services/jobs/optimizacion-ruta-handler.ts`,
  y comentarios en `lib/repositories/GestionOrdenRepository.ts`.
- Tests: `tests/unit/utils/aviso-recogida-insuficiente.test.ts` (nuevo),
  `tests/integration/repositories/job-repo-pendiente.test.ts` (nuevo),
  `tests/integration/db/job-primera-recogida-sql-real.test.ts`, `tests/unit/actions/sincronizar-ruta.test.ts`,
  `tests/unit/services/optimizacion-ruta-primera-del-dia.test.ts`, `optimizacion-ruta-ahorro-jornada.test.ts`,
  `optimizacion-ruta-encolado.test.ts`, `tests/integration/repositories/optimizacion-ruta-enqueue.test.ts`,
  `job-repo-posponer.test.ts`, `tests/unit/config/route-optimization-config.test.ts` y los fixtures
  `RUTA_PRIMERA_DEBOUNCE_MIN: 5` de los demás `optimizacion-ruta-*.test.ts`.

## Cambio → test

- Mínimo en paquetes: `aviso-recogida-insuficiente.test.ts` (15→12, 7→6, 10→8, equivalencia con la guarda), `sincronizar-ruta.test.ts`.
- Debounce 5 min: `route-optimization-config.test.ts`, `optimizacion-ruta-encolado.test.ts`, `optimizacion-ruta-enqueue.test.ts`.
- Aviso con espera (3 formas): `aviso-recogida-insuficiente.test.ts`, `sincronizar-ruta.test.ts`, `optimizacion-ruta-primera-del-dia.test.ts`, jornada A fila 1 y variante B «5 de 7».
- Lectura acotada por empresa: `job-repo-pendiente.test.ts` (forma del SQL) y `job-primera-recogida-sql-real.test.ts` (Postgres real; se salta sin base local).

## Verificación (NODE_OPTIONS=--max-old-space-size=8192)

- `npx tsc --noEmit`: exit 0.
- `npx eslint <archivos tocados>`: 0 errores, 0 avisos.
- Tests tocados: `22 files, 475 passed | 8 skipped` (los 8 son el SQL real, sin base local).
- Guardias `npx vitest run guard`: `5 failed | 4511 passed`. Las 5 son `dependencias-declaradas-presentes`
  («faltan 55 de las 55»): el worktree no tiene `node_modules` propio. Fallan igual sin los cambios (comprobado con stash).

Veredicto: listo para review; el SQL real y la guardia de dependencias se confirman en CI.
