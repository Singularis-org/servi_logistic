# impl SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» — tanda backend (R456-R459)

Tanda de SERVIDOR del folio buscable (T3, T4). La cabecera (R450-R455) y la barra (T5, R456 en UI)
quedan para frontend_dev. Sin migración ni cambio de esquema Prisma.

## Archivos

Producción:
- `lib/types/filtros-cierres.ts` — `folio` (string ≤ `MAX_FOLIO_FILTRO` = 20, sin normalizar) en los
  campos comunes: entra en `filtrosCierresSchema` y `filtrosCierresBodegaSchema` (los cinco listados
  y sus archivos). `sinFiltros` cuenta `folio`; nuevo `sinFiltrosBodega` exportado. `MAX_FOLIO_FILTRO`
  sube de bloque y lo comparte `filtrosColaPropiaSchema` (mismo `textoFolio`).
- `lib/services/zona-de-la-empresa.ts` — `filtrosParaRepo` normaliza el folio con `normalizarFolio` y
  devuelve un resultado discriminado `{ tipo: "vacio" } | { tipo: "aplicar", filtros }`: imposible →
  `vacio` antes de leer la zona; vacío tras normalizar → la clave desaparece.
- `lib/services/CierresAdminService.ts`, `CierresBodegaAdminService.ts`, `CierreBodegaService.ts` —
  los 12 caminos (2 páginas + 2 archivos por servicio) devuelven página/conjunto vacío con `vacio`,
  después del guard de rol/alcance y sin tocar el repositorio.
- `lib/repositories/_shared/folio-cierres-sql.ts` (nuevo) — `idsCierresDiaPorFolio` /
  `idsCierresBodegaPorFolio`: `$queryRaw` parametrizado, `strpos(upper(right(id, 8)), $texto) > 0`, y
  `organizacion_id = current_setting('app.organizacion_id')` escrito (D6: la lista de excepciones
  no crece). `recortePorFolio(ids)` → `[{ id: { in } }]` o `[]`.
- `lib/repositories/CierresAdminRepository.ts` — `historicoWhere`/`colaWhere` suman el recorte por
  folio al FINAL de su `AND`; los 4 métodos leen los ids solo si hay folio.
- `lib/repositories/CierresBodegaAdminRepository.ts` — ídem en `historicoBodegaWhere`/`colaBodegaWhere`
  (dentro del `AND`: como clave hermana pisaría el `id: { notIn }` de SLT-105).
- `lib/repositories/CierreBodegaRepository.ts` — ídem en `consolidablesWhere` (ids de `cierre_dia`) y
  `cierresBodegaDeZonaWhere` (ids de `cierre_bodega`); el cliente gana `$queryRaw` en su `Pick`.

Tests:
- `tests/unit/guards/filtros-cierres-alcance.guardia.test.ts` — la lista blanca suma `folio` (literal
  a mano), `sinFiltros`/`sinFiltrosBodega` con solo folio, bloque de bodega con folio.
- `tests/unit/services/cierres-filtro-folio.test.ts` (nuevo) — 12 caminos con dobles contados.
- `tests/integration/db/cierres-filtro-folio-sql-real.test.ts` (nuevo) — Postgres real, 3 repos.

## Contrato para la UI (T5)

- Campo `filtros.folio` (texto tal cual lo escribe el usuario, ≤ 20 caracteres) en el MISMO bloque
  `filtros` de las Server Actions que ya existen; no hay action nueva. Lo aceptan
  `filtrosCierresSchema` (mensajeros) y `filtrosCierresBodegaSchema` (bodega central y satélite).
- Ausente o vacío tras normalizar → no recorta. Imposible → `items: []`, `total: 0`.
- Para la página 1 pre-cargada: `sinFiltros` (mensajeros) y `sinFiltrosBodega` (bodega) ya cuentan
  `folio`; los dos módulos de bodega deben dejar su copia local y usar `sinFiltrosBodega` (T3, UI).

## R → test

| R | Test |
| --- | --- |
| R456 (servidor) | `cierres-filtro-folio.test.ts` «« #3f2a » llega … como «3F2A»» (12 caminos); `cierres-filtro-folio-sql-real.test.ts` casos `*-prefijo`, `*-entero-minusculas`, `sat-solicitados-entero-trozo` |
| R457 | `cierres-filtro-folio.test.ts` «folio imposible … sin consultar la base» («ZZ», «123456789», «#3F2A-»; contador del repo = 0 y zona horaria = 0), «folio vacío tras normalizar» («», «  », «#»), «21 caracteres dan validation_error» (10 schemas) |
| R458 | `cierres-filtro-folio-sql-real.test.ts`: otra zona (D6, B3), otra lista (D2/B2), otra empresa (DB1, BB1), primer bloque del uuid («2A7E57»), inexistente («FEDCBA98»), combinados (estado, bodega), `total` con pageSize 1 |
| R459 | `cierres-filtro-folio-sql-real.test.ts` «el archivo … = la lista» (3 repos); `cierres-filtro-folio.test.ts` «sin folio el repositorio recibe lo de antes»; guardia `filtros-cierres-alcance` (d) sin cambios en verde; los `*-where.test.ts` existentes sin tocar |

## Mutaciones (`mutar.mjs` en el scratchpad; cada una aplica, corre, revierte y comprueba el byte a byte)

```
M1 folio fuera del WHERE (CierresAdminRepository.historicoWhere) -> EXIT=1 ROJO (muerta) | Tests  6 failed | 13 passed (19)
M2 folio fuera del WHERE (CierresBodegaAdminRepository.colaBodegaWhere) -> EXIT=1 ROJO (muerta) | Tests  4 failed | 15 passed (19)
M3 folio fuera del WHERE (CierreBodegaRepository.cierresBodegaDeZonaWhere) -> EXIT=1 ROJO (muerta) | Tests  2 failed | 17 passed (19)
M4 sin alcance (CierresAdminRepository.historicoWhere) -> EXIT=1 ROJO (muerta) | Tests  4 failed | 15 passed (19)
M5 sin alcance de zona (CierreBodegaRepository.cierresBodegaDeZonaWhere) -> EXIT=1 ROJO (muerta) | Tests  1 failed | 18 passed (19)
M6 sin alcance de zona (CierreBodegaRepository.consolidablesWhere) -> EXIT=1 ROJO (muerta) | Tests  2 failed | 17 passed (19)
M7 sin empresa en el SQL de cierre_bodega -> EXIT=1 ROJO (muerta) | Tests  2 failed | 17 passed (19)
M8 sin empresa en el SQL de cierre_dia -> EXIT=1 ROJO (muerta) | Tests  3 failed | 16 passed (19)
M9 folio en el id entero, no en los ultimos 8 (cierre_bodega) -> EXIT=1 ROJO (muerta) | Tests  5 failed | 14 passed (19)
M10 un folio imposible ya no corta en el servicio -> EXIT=1 ROJO (muerta) | Tests  1 failed | 4 passed (5)
```
Revertidas: el script compara el archivo con el original tras cada una; `git status` solo muestra los
cambios de la tanda. Sin mutar: integración 19/19 verde, unit+guardia 12/12 verde.

## Verificación

Base desechable `slt153_wt` (DATABASE_URL exportada en el mismo comando; NODE_OPTIONS 8192).

- `pnpm run typecheck` → TYPECHECK_EXIT=0.
- `pnpm exec eslint <12 archivos tocados>` → LINT_EXIT=0.
- Tests propios: `vitest run` unit+guardia → 2 archivos, 12/12 verde; integración → 1 archivo, 19/19
  verde (no skipped).
- `pnpm exec vitest related --run <12 archivos>` → RELATED_EXIT=1: 1074 archivos, 923 verdes, 150 rojos
  (todos `tests/integration/`). Causa: la base desechable no tiene semilla de negocio («tabla `orden`
  vacia: corre `pnpm run db:seed`», «faltan la zona central…», «`usuario` esta vacia»…).
  Contraprueba: esos 150 archivos con el código de producción PREVIO (7d9703bf) → 144 rojos, los
  mismos. Los 6 de diferencia (`454/caracterizacion/traspaso`, `454/senales-gestion-lectores`,
  `455/caracterizacion/sql-crudo-cron-devoluciones`, `455/snapshot-lectura`,
  `libro-caja-busqueda-orden-463`, `saldos-tiendas-busqueda-463`) corridos solos con el código de la
  tanda → SEIS_EXIT=0, 6 archivos, 35/35 verde: carga del run de 1074, no regresión.
- `pnpm run test:guardias` → GUARDIAS_EXIT=1: 347/349 archivos. Rojos ajenos a la tanda:
  `dependencias-declaradas-presentes` (init.sh sin el marcador «FIN PASO 2», no tocado aquí) y
  `otp-debug-solo-en-pruebas` (timeout de 20 s bajo carga; solo → 11/11 verde).

## Abierto

- T5 (UI): barra con `onChange` → `filtros.folio`, placeholder `BUSCA_POR_FOLIO` importado, y
  `sinFiltrosBodega` en `CierresBodegaAdminModule.tsx` / `ConsolidacionBodegaModule.tsx`.
- El folio imposible se corta DESPUÉS del alcance: en la satélite se lee su zona (`findUsuarioZonaId`)
  antes; ninguna consulta a cierres. Es el orden de autorización de siempre.

Veredicto: servidor del folio buscable (R456-R459) hecho y probado contra Postgres real; 10/10 mutaciones muertas; rojos del related y de guardias son de base sin semilla / ajenos.
