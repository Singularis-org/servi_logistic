# SLT-144 · T1 (servidor) — backend_dev

## Archivos
- `lib/types/planes.ts`: `previsualizarCambioSchema`, `FechaDeEmpresa` y `VistaPreviaCambioResult`.
- `lib/interfaces/repositories/IPlanesRepository.ts`: `VistaPreviaCambioLeida` y `vistaPreviaCambio(planId, topes)`.
- `lib/repositories/PlanesRepository.ts`:
  - `vistaPreviaCambio`: lectura bajo `comoPlataforma("SL-24")` que usa `excedidosDe`, sin escrituras.
  - `detalle` / `pendienteDelDetalle`: «N de M» cuenta por empresa, R ∪ V (§3.2).
- `lib/interfaces/services/IPlanesService.ts`, `lib/services/PlanesService.ts`: `previsualizarCambio`, que valida
  quién, luego zod, luego el repositorio, y después aplica `fechaDeRecepcion` a cada empresa.
- `lib/actions/planes.ts`: `previsualizarCambioPlanAction`.
- `lib/actions/_shared/planes-plataforma.ts`: `verBorradoresDePlanes`, con su composition root privado.
- Tests:
  - `tests/unit/services/planes-previsualizar-cambio.test.ts` (nuevo);
  - `tests/integration/db/planes-previsualizar-cambio.test.ts` (nuevo);
  - `tests/integration/db/planes-cambio-por-empresa.test.ts` (caso R23).

## R → test
- R21 → `tests/integration/db/planes-previsualizar-cambio.test.ts`:
  - «R21: misma fecha y mismos avisos que programar»;
  - «R21: leer no escribe»;
  - «R21: un plan que no existe es not_found y uno sin empresas, una lista vacía».
- R22 → `tests/unit/services/planes-previsualizar-cambio.test.ts`:
  - «R22: forbidden por rol sin llamar al repositorio (%s)»;
  - «R22: entrada inválida (%s) → validation_error…»;
  - «R22: plan inexistente → not_found».
  - `recibeEl` lo prueban tres casos: el quincenal, el mensual y el de F null.
- R23 → `tests/integration/db/planes-cambio-por-empresa.test.ts`: «R23 (SLT-144): la empresa que entra en F cuenta en N y en M».

## Salida real
- typecheck: el código de producción queda limpio. Hay 25 errores TS «Property 'vistaPreviaCambio' is missing» en 9
  dobles de `tests/unit/services/planes-service*.test.ts`, que están fuera de mi alcance.
- eslint (los archivos tocados): sin problemas.
- vitest unit: `planes-previsualizar-cambio` 19/19. `tests/unit/services` + `tests/unit/actions`: 530 archivos y
  10003 tests, todos en verde.
- vitest de integración (`servi_logistic_slt144`, `--no-file-parallelism`):
  - archivos: previsualizar-cambio, cambio-por-empresa, cambio-programado y lecturas-plataforma;
  - resultado: 35/36. Falla un caso de SLT-128: R17, línea 589, que espera `{1,2}` y recibe `{2,3}`. Es el cambio de
    comportamiento que pide R23.
- guardias:
  - `superficie-de-uso` está en rojo por `previsualizarCambioPlanAction`; se resuelve en T5.2.
  - `dependencias-declaradas-presentes` está en rojo por marcadores de `init.sh`, que este cambio no toca.
  - `sin-estados-retirados` falló en la corrida completa por tiempo y pasa sola.

## Veredicto
T1 está implementada. Faltan dos decisiones: añadir una línea a los dobles de los 9 tests de servicio y cambiar la
aserción de R17 de SLT-128 que contradice R23.

## Cierre
- Dobles `satisfies IPlanesRepository`: una línea `vistaPreviaCambio: vi.fn<IPlanesRepository["vistaPreviaCambio"]>(),`
  en los 9 `tests/unit/services/planes-service*.test.ts` (servicio, asignar-costo, costeo, costo-porcentual,
  crear-custom, inicio-ciclo, lecturas, periodo, tipo-cobro).
- `tests/integration/db/planes-cambio-por-empresa.test.ts`, caso R17 de SLT-128: `{ recibidas: 2, total: 3 }`;
  el comentario dice que C cuenta por R23 (SLT-144). Ninguna aserción de R11 cambia.
- Salida real (`NODE_OPTIONS=--max-old-space-size=8192`):
  - `pnpm run typecheck`: `tsc --noEmit`, exit 0, 0 errores.
  - eslint de los 10 archivos tocados: exit 0, sin problemas.
  - vitest de los 9 tests de servicio: `Test Files 9 passed (9)`, `Tests 404 passed (404)`.
  - vitest de integración (`servi_logistic_slt144`, `--no-file-parallelism`; `DIRECT_URL` vacío en el `.env`
    principal, se usó la misma URL que `DATABASE_URL`): por-empresa, cambio-programado y previsualizar-cambio,
    `Test Files 3 passed (3)`, `Tests 33 passed (33)`.
- T1.1, T1.4 y T1.5 marcadas en `tasks.md` (diff de `PlanesRepository.ts` sin `create`/`update`/`delete`/`jobs`).
- Veredicto: T1 cerrada; quedan las guardias que se resuelven en T5.2 (`superficie-de-uso`).
