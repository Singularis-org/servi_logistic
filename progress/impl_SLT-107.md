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

Sin código en la tanda 1.

## Tanda 2 (backend_dev, 2026-11-12): T1 completa

Decisiones de entrada (`progress/features/SLT-107.md`): T0.3 opción (a) de Carlos —se acepta que
«Corregir recibido» reescriba `conciliado_at`; ancla = `conciliado_at` vigente— escrita como **D-T03**
en `requirements.md > Decisiones cerradas` (y PA3 marcada cerrada; nota en `design.md > Cifras`).
`alcance` obligatorio en `findCierreBodegaConDetalle` con `findFirst` (leader).

Grafo: no consultado; Grep/Read (los archivos de esta tanda no estaban indexados).

### Qué se hizo

- **T1.1** `AlcanceLecturaBodega` en `ICierresBodegaAdminRepository.ts`; `findCierreBodegaConDetalle(id,
  zona, alcance)` con `findFirst` y `zonaId` en el `where` si el alcance es de zona; `null` antes de leer
  nada más.
- **T1.2** `ocultarFulfillmentSiNoCentral` exportada (cuerpo intacto). `CierresBodegaAdminService`:
  cuarto parámetro `zonaDelUsuario`; `alcanceDeLecturaBodega` (acceso total → empresa; `adminSatelite` →
  zona de su usuario, sin zona o sin dependencia → `forbidden`; otro rol → `forbidden` sin leer);
  `null` → `no_encontrada` (empresa) o `forbidden` (zona); fulfillment anulado por gestión y
  `desmarcable: false` para quien no es acceso total. Aprobar/rechazar sin cambios.
- **T1.3** `CifraConConteo`, `ResumenSolicitados`, `solicitadosResumen` en el `ok` de
  `ListarConsolidacionServiceResult`. `CierreBodegaService`: reloj `ahora` como 4.º parámetro;
  `resumenSolicitados(cierres, desde)` exportada (sumas con `sumarMontos`, «> 0» con `Prisma.Decimal`);
  la zona horaria se lee en el mismo `Promise.all` que los tres conjuntos; sin zona, ceros sin leerla.
- **T1.4** `buildCierresBodegaAdminService` pasa `new OrdenRepository(prisma)`. La integración lo prueba
  por la Server Action solo con `getActor`.
- **T1.5** `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts` (11 casos), por las Server
  Actions y commiteando (dos empresas, Z1/Z2 en A, ZB en B; CB1-CB8; CB1 con un cierre del día y dos
  gestiones, modelo nuevo con cargo de fulfillment y modelo viejo con tarifa de fulfillment 450,00).
  Cuenta lo sembrado antes de afirmar. Incluye el caso de Carlos: CB4 (recibido hace 45 días) corregido
  hoy con `corregirConciliacion` real (transacción revertida) cuenta en los 30 días: 53 500,00 / 3.
  CB8 (recibido el día 31 hacia atrás) se añadió a la siembra del design para que la mutación de 31 días
  muerda en la integración (con CB4 a 45 días no mordía).
- **T1.6** `cierre-bodega-service.test.ts`: ya estaba verde (no afirma el objeto entero); solo se añade
  la aserción de `solicitadosResumen` en ceros en el caso sin zona. Ningún literal cambiado.
- Los 8 archivos de T0.1: `{ lectura: "toda_la_empresa" }` en cada llamada; `findFirst` en los dobles de
  `cierre-bodega-repository`, `cierre-pagos-lectura` y `cierres-bodega-admin-repository`.

### Archivos creados/modificados (código)

Producción: `lib/interfaces/repositories/ICierresBodegaAdminRepository.ts`,
`lib/repositories/CierresBodegaAdminRepository.ts`, `lib/services/CierresAdminService.ts` (solo
`export`), `lib/services/CierresBodegaAdminService.ts`, `lib/interfaces/services/ICierreBodegaService.ts`,
`lib/services/CierreBodegaService.ts`, `lib/actions/cierre-bodega.ts`.

Tests: `tests/integration/db/satelite-cierre-bodega-lectura.int.test.ts` (nuevo),
`tests/unit/repositories/cierres-bodega-admin-repository.test.ts`,
`tests/unit/services/cierres-bodega-admin-service.test.ts`,
`tests/unit/services/consolidacion-cola-satelite.test.ts`, `tests/unit/services/cierre-bodega-service.test.ts`,
los 8 de T0.1, y los dos dobles tipados de `listarConsolidacion`:
`tests/components/descarga/CierresDescargaColumnas.test.tsx` (ya en la lista, T4.1) y
**`tests/components/descarga/CierresDescarga.test.tsx` (fuera de la lista: añadido a `## Archivos
esperados`)**. Una línea cada uno.

Sin migración, sin `prisma generate`, sin dependencias nuevas.

### Mapa R → test (servidor)

| R | Test |
|---|---|
| R280 | integración «R280/R283: S1 lee CB1…»; `cierres-bodega-admin-repository.test.ts` «SLT-107 R280» (dos `where` exactos); `cierres-bodega-admin-service.test.ts` «R280/R283» |
| R281 | integración «R281: S1 no lee CB5… inexistente; S0…»; servicio «R281» ×4 (sin zona, sin dependencia, no encontrado en zona, acceso total → `no_encontrada`); repositorio «SLT-107 R281» (sin más lecturas) |
| R282 | servicio «R282: mensajero» |
| R283 | servicio «R280/R283» (seis campos + `desmarcable`); integración «R280/R283» y «R283 sobre la base» (CB2: maestro `true`, S1 `false`) |
| R284 | servicio «R284» (igualdad salvo R283, mismas llamadas); integración «R284» (contra la base, la central sí ve el fulfillment) |
| R285 | servicio «R285»; integración «R285» (Server Actions) |
| R287 / R68 | `consolidacion-cola-satelite.test.ts` «SLT-107 R287» (9 casos con literales); integración «R287» ×2 y «T0.3 (a)» |
| R52 | integración «R52» (rango de `solicitadoAt` y `total`) |
| R72 | `cierre-bodega-service.test.ts` (ningún literal cambiado) |
| D-T03 | `consolidacion-cola-satelite.test.ts` «T0.3 (a)»; integración «T0.3 (a)» (corrección real) |

### Mutaciones (de una en una: aplicar, correr, anotar, restaurar con copia y `cmp`)

| # | Mutación | Resultado | Rojo en |
|---|---|---|---|
| M1 | sin `zonaId` en el `where` de la cabecera (`where: { id }`) | MATADA | integración «R281…» (S1 lee CB5 → ok); repositorio «SLT-107 R280: alcance de zona» |
| M2 | sin `zonaId` en `cierresBodegaDeZonaWhere` | MATADA | integración «R52», «R287» ×2, «T0.3 (a)» |
| M3 | `buildCierresBodegaAdminService` con un `PrismaClient` sin la extensión de empresa | MATADA | integración «empresa cruzada» (`expected { status: 'ok', … } to deeply equal { status: 'no_encontrada' }`) |
| M4 | `porLlegar` con `conciliadoAt !== null` | MATADA | integración «R287» ×2, «T0.3 (a)» |
| M5 | `faltaPorRecibir` con `gte(0)` | MATADA | integración «R287» ×2, «T0.3 (a)» |
| M6 | `DIAS_RECIBIDO = 31` | MATADA | unit «recibido (30 días)…»; integración «R287» (S1) y «T0.3 (a)» |

Autocomprobación: la base de cada corrida verde es 11/11 *passed*, 0 *skipped*; cada mutación deja los
demás casos en *passed* (no *skipped*) y su rojo es una aserción, no un error de siembra. Tras restaurar,
`git diff` no contiene ningún resto de mutación (`grep` de los marcadores: 0).

**Incidente de entorno (no del código):** a las 15:12 el worktree de SLT-123 «pago independiente del
efectivo» corrió `prisma generate` sobre el `node_modules` compartido: el cliente pasó a esperar
`cierre_dia.pago_independiente_efectivo` y la primera corrida de M6 salió con la suite *skipped* (falló
la siembra). Se añadió esa columna (aditiva, `DEFAULT false`) **solo a la base desechable**
`slt107_solicitados`, sin tocar el repo; la base volvió a 11/11 y M6 se repitió. M1-M5 corrieron antes
y sus corridas muestran los demás casos *passed*. Al integrar con `dev` tras SLT-123 no hace falta nada.

### Salidas

Base desechable `slt107_solicitados`: creada, `prisma migrate deploy` (exit 0) y `pnpm run db:seed`
(exit 0).

- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`): `TC_EXIT=0`, 0 errores. La
  primera corrida dio 2 errores, los dos dobles tipados de `listarConsolidacion` de arriba.
- Lint (`npx eslint` de los archivos tocados): `LINT_EXIT=0`, 0 errores.
- Unit y componentes tocados (8 archivos): `Test Files 8 passed (8)`, `Tests 193 passed (193)` (antes
  de añadir la aserción de T1.6; ver la corrida final abajo).
- Integración nueva: `Tests 11 passed (11)`.
- **Corrida final** de todos los archivos de test tocados salvo los dos de abajo, con
  `--no-file-parallelism`: `Test Files 13 passed (13)`, `Tests 226 passed (226)`, `EXIT=0`. En paralelo,
  `cierre-reparto-porcentajes-sql-real` dio un *timeout* de 20 s en su CONTROL (espera el lock de
  escritura que la suite nueva sostiene en su `beforeAll`, el mismo patrón que
  `cierre-detalle-central-lee-satelite-sql-real`); sola: `7 passed`.
- `486-evidencias-cierres-sql-real` y `cierre-bodega-desglose-por-tienda-sql-real` **no se pueden correr
  en una base desechable nueva**: piden una `orden` ya existente (`fksDeOrden`) y, sembrada una en otra
  empresa, el trigger de empresa cruzada la rechaza (`referencia a otra empresa: cierre_bodega.zona_id
  -> zona`). Es del entorno y previo a esta ficha; el cambio en ellas es solo el argumento `alcance`, que
  cubre el typecheck. Quedan para el gate de CI.
- Guardias (`pnpm run test:guardias`): `Test Files 1 failed | 343 passed (344)`, `Tests 4 failed | 4851
  passed | 1 skipped`. Las 4 son de `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`
  (guardia 420): `init.sh` ya no tiene el marcador «>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<» ni
  llama a `scripts/verificar-dependencias.mjs`. **Previo y ajeno**: `origin/dev:init.sh` (sync del arnés
  2.14.0, `9aa7e060`) ya es así; esta tanda no toca `init.sh`, `scripts/` ni guardias. Para el leader.

### Veredicto

T1 completa: permiso de lectura de la satélite con el filtro de zona en el `WHERE`, herencias de
SLT-110/SLT-111 y `solicitadosResumen`, con 6/6 mutaciones matadas; el único rojo (guardia 420) viene
de `dev`.

## Veredicto

T0 hecha (T0.2 queda abierta para `frontend_dev`); T1 parada: T0.3 confirma que «Corregir recibido»
reescribe `conciliado_at` y el archivo 38 de 40 pide decisión.
