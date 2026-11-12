# impl SLT-106 «Bodega satélite: A consolidar con la cola única»

## Tanda 1 — backend_dev (T0 + T1), 2026-11-12

Base desechable propia `slt106_consolidar` (base nueva + `prisma migrate deploy` + `db:seed`), con
`DATABASE_URL` exportada antes de cada `vitest`. Sin `prisma generate` ni migraciones.

### T0 — comprobaciones previas

- **T0.1** — Grep de `CierreDiaConsolidableRow`, `ListarConsolidablesServiceResult`,
  `listarConsolidablesPaginado`, `ListarConsolidacionServiceResult` y `listarConsolidacion`. Fuera de
  `## Archivos esperados` aparecen:
  - `lib/actions/cierre-bodega.ts`, `lib/types/cierre-bodega.ts`: solo delegan o re-exportan el tipo;
    no construyen filas ni leen `.items`. Sin cambio.
  - `tests/components/CierresAdminPage.test.tsx` (`items: []`), `tests/integration/actions/cierre-bodega-action.test.ts`
    (doble sin tipar estricto), `tests/integration/db/cierre-incluye-modelo-nuevo.test.ts` y
    `deudas-d39-d40-modelo-nuevo.test.ts` (leen `.items` por `incluyeModeloNuevo`/`paraLaCentral`, campos
    que no cambian): siguen compilando y no se tocan.
  - **`tests/components/descarga/CierresDescargaColumnas.test.tsx`**: construye con `vi.mocked(...)` un
    `ListarConsolidacionServiceResult` tipado → rompía el typecheck. **Añadido a `## Archivos esperados`**;
    su doble gana los cuatro campos nuevos (no los lee).
- **T0.2 — POSITIVO.** `verCierreDetalle` abre a la satélite un cierre del día de su zona en cualquier
  estado, aprobado incluido:
  - `lib/services/CierresAdminService.ts:535`: alcance del `adminSatelite` =
    `{ destinoTipo: "bodega_satelite", destinoZonaId: zonaId }`;
  - `lib/services/CierresAdminService.ts:874` → `findCierreByIdEnAlcance(cierreId, alcanceDeLectura(...))`;
  - `lib/repositories/CierresAdminRepository.ts:1619`: `where: { id, ...alcanceLecturaWhere(alcance) }`,
    y `alcanceLecturaWhere`/`alcanceWhere` (`:861`, `lib/repositories/alcance-cierre-where.ts`) solo
    ponen destino y zona, **sin filtro de estado**.
  - Cliente: `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:716` (`abrirDetalle` →
    `verCierreDetalle({ cierreId })`). R193 se cumple sin permiso nuevo.
- **T0.3** — Grep en `tests/` y `e2e/` de los textos que desaparecen. Los que miran «A consolidar»
  coinciden con T4 (`ColasPaginacion`, `CierreIngresoBodegaTarjetaListado`, `CierresDescarga`,
  `ConsolidacionBodegaRefresco`, los tres E2E) + `consolidables-paginado.test.ts` (T1.4, solo un
  comentario). El resto de coincidencias son de OTRAS pantallas y no cambian: el comprobante del
  mensajero (`CierreAdminBloqueoMensajero`, `CierreFacturaFechaCR`, `CierreFacturaPapel`,
  `CierreMotivoRechazoSoloRechazado`, `CierresAdminModule`), el comprobante del cierre de bodega
  (`DineroIdentidadesEnPantalla`), comentarios de `e2e/_escenarios/cierres.ts`, y la guardia
  `cierre-bodega-vocabulario.guardia.test.ts` (su censo excluye `ConsolidacionBodegaModule.tsx`; su
  regex `\bCentral debe\b` distingue mayúsculas: «La central debe» no la dispara — aviso para T2/T3).
  `BajoRiesgoPaginacion.test.tsx` no aparece en el grep (está en T4 por la paginación). Nada que añadir.

### Archivos

Producción:
- `lib/interfaces/repositories/ICierreBodegaRepository.ts` — `CierreDiaConsolidableRow` +
  `paraLaCentral`, `aprobadoAt`, `gestionesAjustadas` (requeridos); `findMensajerosConCierreSinResolver`.
- `lib/repositories/CierreBodegaRepository.ts` — `CONSOLIDABLE_SELECT` con `resueltoAt` y `_count`
  ampliado (gestiones con `ajustesPagoMensajero: { some: {} }`); `toConsolidableRow` deriva
  `paraLaCentral()`; `sinResolverWhere(zonaId)` compartido por `contarCierresDiaSolicitados` y
  `findMensajerosConCierreSinResolver`.
- `lib/interfaces/services/ICierreBodegaService.ts` — `CierreConsolidableCola`, `BloqueoConsolidacion`,
  `ListarConsolidablesServiceResult.items: CierreConsolidableCola[]`, cuatro campos nuevos de
  `listarConsolidacion`.
- `lib/services/CierreBodegaService.ts` — `motivoSinResolver` (exportada); `listarConsolidacion` llama
  a `findMensajerosConCierreSinResolver` y emite `paraLaCentralAgregado`, `cierresAConsolidar`,
  `mensajerosAConsolidar`, `bloqueo`. `solicitarCierreBodega` sin tocar.

Tests nuevos:
- `tests/unit/services/consolidacion-cola-satelite.test.ts`
- `tests/integration/db/consolidacion-cola-satelite.test.ts`

Tests adaptados (dobles; ninguna aserción quitada):
- `tests/unit/repositories/cierre-bodega-repository.test.ts` (+ bloque SLT-106; R10 con los tres campos)
- `tests/unit/services/cierre-bodega-service.test.ts` (R3: `findMensajerosConCierreSinResolver` llamado y
  `contarCierresDiaSolicitados` NO desde `listar`; R6/431-R5: la parte de `solicitar` intacta, la de
  `listar` pasa al motivo con nombres de R199 + `bloqueo`)
- `tests/unit/services/consolidacion-completo.test.ts`, `consolidables-paginado.test.ts`,
  `cierre-bodega-solicitados-paginado.test.ts` (método nuevo en el doble; la lista de llamadas de
  `listarConsolidacion` cambia `contarCierresDiaSolicitados` por `findMensajerosConCierreSinResolver`,
  mismo número de consultas)
- `tests/components/descarga/CierresDescarga.test.tsx`, `CierresDescargaColumnas.test.tsx` (los
  cuatro campos nuevos en el doble de `listarConsolidacion`; el resto es de T4.1 / frontend)

### Mapa R → test (lo de esta tanda)

| R | Test |
|---|---|
| R47 | `tests/unit/services/consolidacion-cola-satelite.test.ts` (R199/R47); `tests/integration/db/consolidacion-cola-satelite.test.ts` («R47/R195: listarConsolidacion real…») |
| R67 | `consolidacion-cola-satelite.test.ts` (unit, 96500.00 y -2000.00); `tests/unit/repositories/cierre-bodega-repository.test.ts` (57700.00 / -2000.00); integración (57700.00 de la fila y del agregado) |
| R72 | `tests/unit/services/cierre-bodega-service.test.ts` (R6/431-R5: `solicitar` sin cambios) |
| R194 | integración («R67/R194…», `gestionesAjustadas` 1 con dos ajustes, `aprobadoAt`); `cierre-bodega-repository.test.ts` (ISO/null, `_count`) |
| R195 | `consolidacion-cola-satelite.test.ts` (3 cierres / 2 mensajeros; `sin_resolver`/`vacio`/`null`/`sin_zona`) |
| R199 | `consolidacion-cola-satelite.test.ts` (literales singular/plural/tres nombres); `cierre-bodega-repository.test.ts` (mismo `where`); integración (M2 y M3, sin M4/M5, = conteo) |
| R200 | `consolidacion-cola-satelite.test.ts` (R200); `cierre-bodega-service.test.ts` (R6/431-R5) |

### Contrapruebas y mutaciones

T1.2 (unit, `consolidacion-cola-satelite.test.ts`):
- C1 — el agregado del servicio suma el ingreso de bodega en vez de restarlo → **matada** (rojo el
  literal 96500.00).
- C2 — sin `new Set` (dedupe) en `motivoSinResolver` → **matada** (3 rojos: «tiene cierres», tres
  nombres, y el de `listarConsolidacion`).

T1.3 (integración, `tests/integration/db/consolidacion-cola-satelite.test.ts`):
1. Quitar `destinoZonaId` de `sinResolverWhere` → **matada**: aparece «Elena Vecina» (M5) y el motivo cambia.
2. Quitar `estado` de `sinResolverWhere` → **matada**: aparecen «Ana Aprobada» ×2 y «Diego Rechazado».
3. `_count.gestiones` sin el `where` de ajustes → **matada**: `gestionesAjustadas` 2 en vez de 1.
4. Invertir `general` y `pago` en `paraLaCentral(...)` de `toConsolidableRow` → **matada**: `-58300.00`
   en vez de `57700.00`. (Invertir `pago` con `bodega` sería una mutación equivalente: la resta de
   esos dos conmuta; por eso se invierte con `general`.)

Cada mutación se aplicó sobre una copia, se corrió y se restauró; `cmp` con la copia confirma el
archivo restaurado. El gate no se corrió con ninguna mutación puesta.

### Salidas

Todas contra la base desechable `slt106_consolidar` (solo catálogos sembrados).

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0, 0 errores.
- `pnpm run lint` → exit 0 (0 errors, 243 warnings heredados; ninguno en los archivos tocados:
  `eslint` sobre los 13 archivos → exit 0 sin salida).
- Tests de la tanda (`vitest run`): 6 archivos unit (`consolidacion-cola-satelite`, `cierre-bodega-service`,
  `consolidacion-completo`, `consolidables-paginado`, `cierre-bodega-solicitados-paginado`,
  `cierre-bodega-repository`) → **78 passed**; integración `tests/integration/db/consolidacion-cola-satelite.test.ts`
  → **3 passed** (0 skipped).
- `pnpm exec vitest related --run <los 8 archivos>` → 228 archivos: 217 passed, 11 failed (36 tests).
  Los 11 rojos **no son del cambio**: se corrieron los mismos 11 archivos con mis cambios guardados en
  `git stash` y fallan igual (15 + 18 = 33 tests rojos, los mismos con y sin el cambio; el `related` contó 36 al correr en paralelo con otros worktrees sobre la máquina cargada). Causa: la base
  desechable solo tiene catálogos y esas suites exigen `usuario`/`orden` previos («la tabla `usuario`
  esta vacia… Corre `pnpm run db:seed`»), o están en `tests/baseline-rojos.json`. Archivos:
  `454/caracterizacion/alcance-satelite-y-sf001`, `454/cierre-bodega-sf001-sql-real`,
  `486-evidencias-cierres-sql-real`, `cierre-bodega-conciliacion.int`, `cierre-bodega-desglose-por-tienda-sql-real`,
  `cierre-bodega-resumen-pendientes`, `consolidacion-concurrente.int`, `corregir-conciliacion.int`,
  `demo-qa`, `marca-conciliacion.int`, `tests/components/EstadoCuentaBarra467`.
- `pnpm run test:guardias` → 341/344 archivos verdes. Rojos: `dependencias-declaradas-presentes`
  (en `tests/baseline-rojos.json`; marcador de `init.sh`) y dos por *timeout* de 20 s con la máquina
  cargada (`dominio-ordenex-fuera`, `otp-debug-solo-en-pruebas`), que corridos solos dan 20/20 verdes.

Nota de entorno: el scratchpad lo comparten los agentes en paralelo; un `rel.log` mío fue pisado por
otro worktree y se re-corrió `vitest related` con salida en un subdirectorio propio.

### Veredicto

T0 y T1 hechos: servidor de «A consolidar» listo (R47, R67, R194, R195, R199, R200 con test; 6 mutaciones matadas); T0.2 positivo, sin bloqueos para T2.
