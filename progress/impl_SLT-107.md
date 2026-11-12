# SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» — bitácora de implementación

## Tanda 1 (backend_dev, 2026-11-12): T0 hecho; T1 PARADO por T0.3

El grafo no se consultó: se exploró con Grep/Read (el worktree es nuevo).

### T0.1 — quién llama a `findCierreBodegaConDetalle` y quién construye lo que cambia

- Producción: solo `CierresBodegaAdminService.verCierreBodegaDetalle`
  (`lib/services/CierresBodegaAdminService.ts:303`). `ConciliacionSatelitesService.ts` solo lo nombra
  en un comentario.
- `new CierresBodegaAdminService(`: producción solo en `lib/actions/cierre-bodega.ts`. Tests:
  `cierre-iva-aparte-sl39`, `cierre-reparto-porcentajes-sql-real`, `deudas-d39-d40-modelo-nuevo`
  (integración) y cinco unit de servicio. El cuarto parámetro es opcional: ninguno rompe.
- **Fuera de `## Archivos esperados`** (llaman con dos argumentos; con `alcance` obligatorio no
  compilan; los dos unit además doblan `cierreBodega.findUnique`, que pasa a `findFirst`):
  `tests/integration/db/486-evidencias-cierres-sql-real.test.ts:329`,
  `tests/integration/db/ajuste-pago-mensajero-lectura.int.test.ts:255,271`,
  `tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts:490,633,650`,
  `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts:443,467,510,559`,
  `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts:581,582`,
  `tests/integration/db/slt76-desmarcable.int.test.ts:124,167`,
  `tests/unit/repositories/cierre-bodega-repository.test.ts:465,516,602`,
  `tests/unit/repositories/cierre-pagos-lectura.test.ts:319,377,388`.
  Añadidos a `tasks.md > Archivos esperados`. Son **8 archivos más**: 30 → 38 contados (límite del
  gate 40; T0.2 manda parar por encima de 32). Alternativa que no los toca: `alcance` opcional (sin él,
  toda la empresa) y `findUnique({ where: { id, zonaId } })` (Prisma 7 admite filtros no únicos en
  `findUnique`); cuesta la garantía del compilador que pide el design («`alcance` es obligatorio»).
  Decisión del humano o del leader.
- `ListarConsolidacionServiceResult`: lo usan `lib/types/cierre-bodega.ts:250` (unión) y
  `tests/integration/db/cierre-incluye-modelo-nuevo.test.ts` (solo un comentario). Los dobles tipados
  de `listarConsolidacion` en tests de componentes que rompan con el campo nuevo obligatorio se verán
  en el typecheck de T1.3.

### T0.2 — lo que desaparece de «Solicitados» (inventario; la decisión es de T2-T3)

Referencias en `tests/` y `e2e/` fuera de `## Archivos esperados` (L = `CierresBodegaSolicitadosLista`,
C = «Cierres de bodega solicitados», F = `CierreBodegaFacturaResumen`):

| Archivo | L | C | F |
|---|---|---|---|
| `tests/components/CierreBodegaMarcaConciliacion.test.tsx` | 3 | 0 | 14 |
| `tests/components/CierreBodegaTarjetaCascada.test.tsx` | 2 | 0 | 9 |
| `tests/components/CierreFacturaFechaCR.test.tsx` | 0 | 0 | 2 |
| `tests/components/descarga/CierresDescarga.test.tsx` | 0 | 6 | 0 |
| `tests/components/DeudasD39D40ModeloEnPantalla.test.tsx` | 2 | 0 | 3 |
| `tests/components/DineroIdentidadesEnPantalla.test.tsx` | 0 | 0 | 3 |
| `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx` | 0 | 5 | 0 |
| `tests/components/paginacion/paginacion-transversal.test.tsx` | 1 | 1 | 0 |
| `tests/unit/config/paginacion-dominios.test.ts` | 1 | 1 | 0 |
| `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts` | 1 | 0 | 3 |
| `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts` | 1 | 0 | 3 |
| `tests/unit/repositories/criterio-unico.guardia.test.ts` | 0 | 1 | 0 |
| `tests/unit/repositories/historicos-paginados-where.test.ts` | 0 | 1 | 0 |
| `tests/unit/services/cierre-bodega-solicitados-paginado.test.ts` | 0 | 1 | 0 |
| `tests/unit/services/consolidacion-completo.test.ts` | 0 | 1 | 0 |

Leen `CierresBodegaAdminModule.tsx` o `ConsolidacionBodegaModule.tsx` por ruta:
`CierreBodegaDesglosePorTienda.test.tsx`, `DineroIdentidadesEnPantalla.test.tsx`,
`paginacion-transversal.test.tsx`, `paginacion-dominios.test.ts`, `censo-tablas.ts`,
`cierres-descarga-detallada-puerta.test.ts`, `cierres-gestiones-paridad.test.ts`,
`contadores-cabecera.guardia.test.ts`, `cierre-bodega-vocabulario.guardia.test.ts`,
`liquidacion-money-safe.test.ts`. Cuáles cambian depende de cómo se monte la pantalla
(`CierresBodegaSolicitadosLista` se conserva para el caso sin zona, T3.3). **T0.2 queda abierta para
`frontend_dev`**; con los 8 de T0.1 ya se pasa de 32.

### T0.3 — «Corregir recibido» REESCRIBE `conciliado_at` → PARADO

`lib/repositories/CierresBodegaAdminRepository.ts:873` `corregirConciliacion`, en el `updateMany` de
las líneas 899-914: `conciliadoAt: ahora` (línea 910), con `resueltoAt: ahora` de espejo (D3, comentado
en la línea 867: «reescribe `conciliado_at`/`resuelto_at` igual que el rodeo Desmarcar + Marcar que
sustituye»). Llamado desde `ConciliacionSatelitesService.ts:205`.

Consecuencia para PA3 / R287: con el ancla en el `conciliadoAt` vigente, un cierre de bodega recibido
hace 45 días y corregido hoy vuelve a sumar en «Recibido por la central (30 días)». Pregunta para
Carlos: ¿se acepta (la corrección cuenta como recepción de hoy) o el ancla debe ser otra (p. ej. la
primera marca, que hoy no se guarda en columna)? T1 no se empezó.

### T0.4 — la satélite abre su cierre del día consolidado (R294): sí

`hrefDetalleCierre` (`lib/utils/cierre-enlace.ts:33`) → `CierresAdminService.verCierreDetalle`
(`lib/services/CierresAdminService.ts:861-875`) → `findCierreByIdEnAlcance`
(`lib/repositories/CierresAdminRepository.ts:1638-1639`) con `alcanceLecturaWhere` (línea 878) →
`alcanceWhere` (`lib/repositories/alcance-cierre-where.ts:12-18`): solo `destinoTipo` y
`destinoZonaId`, sin filtro de estado. Un cierre del día de su zona ya consolidado se abre.

## Archivos modificados en esta tanda

- `specs/SLT-107-satelite-solicitados-cierre-lectura/tasks.md` (T0.1, T0.3 y T0.4 marcadas; 8 archivos
  añadidos a `## Archivos esperados`)
- `progress/impl_SLT-107.md` (este)

## Mapa R → test, typecheck, lint, tests, mutaciones

Sin código en esta tanda: nada que correr. Pendiente de T1.

## Veredicto

T0 hecha (T0.2 queda abierta para `frontend_dev`); T1 parada: T0.3 confirma que «Corregir recibido»
reescribe `conciliado_at` y el archivo 38 de 40 pide decisión.
