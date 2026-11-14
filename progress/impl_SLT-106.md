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

## Tanda 2 — frontend_dev (T2, T3, T4, T5.2), 2026-11-12

En primer plano y sin subagentes. Para vitest, la base desechable `slt106_consolidar`. Para el E2E, una
base NUEVA `slt106_e2e` (creada, con `prisma migrate deploy` y `db:seed`), `next build` y
`NEXT_PUBLIC_APP_URL=http://localhost:3000`, como en `gate.yml`. Sin `prisma generate` ni `migrate reset`.

### Archivos

Producción:
- `components/private/cierres/cola/cola-cierres-vista.ts`: `PestanaConsolidar`, columnas de bodega ·
  satélite, `tablistCola(tipo, rol)`, `folioConsolidable`, `aprobadoCola`, `senalesConsolidable`,
  `tarjetasAConsolidar`, `piePorConsolidar`.
- `components/private/cierres/cola/cola-cierres-labels.ts`: los textos nuevos («tú») de `design.md`.
- `components/private/cierres/cola/ColaCierres.tsx`: variante `tipo` bodega + `rol` satélite
  (`PanelAConsolidar`, `PieConsolidar`, `TablaColaConsolidar`); `ColaCierresBodegaProps.rol: "central"`.
- `components/private/cierres/detalle/CifrasCierre.tsx` (`ariaLabel?`, rejilla de 5, tono de aviso) y
  `detalle-cierre-vista.ts` (`CifraId` + `aviso?`).
- `components/private/cierres/dialogos/dialogos-labels.ts`: `RESUMEN_SOLICITUD_BODEGA_TEXTO`.
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx` y `page.tsx`.
- **Fuera de `## Archivos esperados`:** `lib/types/cierre-bodega.ts`. `ListarConsolidablesResult` pasa a
  `ListarPaginadoResult<CierreConsolidableCola>` (una línea de tipo). La acción ya devolvía la fila completa
  del servicio, pero el alias la tipaba como Lite y la pantalla no compilaba con los `items` de la cola.
  Sin cambios en `lib/actions/` ni en tiempo de ejecución.

Tests:
- Nuevo: `tests/components/ColaCierresConsolidar.test.tsx`.
- Adaptados: `cola-cierres-vista.test.ts`, `ConsolidacionBodegaRefresco.test.tsx`, `ColasPaginacion.test.tsx`,
  `BajoRiesgoPaginacion.test.tsx`, `CierreIngresoBodegaTarjetaListado.test.tsx`,
  `descarga/CierresDescarga.test.tsx`, `descarga/CierresDescargaColumnas.test.tsx`, `censo-tablas.ts`,
  `liquidacion-money-safe.test.ts`.
- **Fuera de la lista:**
  - `ColaCierres.test.tsx`: se anotó el tipo del parámetro de `onPestana`, que con tres variantes la unión
    ya no infiere.
  - `cobertura-tablas.guardia.test.ts`: fijaba 2 montajes de la cola; ahora son 3.

E2E:
- `cierre-bodega-satelite.spec.ts`: el paso 1 recorre la cola (aviso con el nombre → aprobar → tarjetas,
  fila, «Ver su cierre», resumen del diálogo).
- `ajuste-pago-mensajero-cierre.spec.ts` y `tarifas-activacion.spec.ts`: leen la fila y la tarjeta en vez
  del comprobante.

### Decisiones de implementación

- `PestanaCola` NO se ensancha (difiere de `design.md`). `PestanaConsolidar = "aConsolidar" | "solicitados"`
  va aparte y `ColaComun<P>` es genérica. Ensancharla obligaba a `CierresAdminModule` y
  `CierresBodegaAdminModule` a aceptar ids que nunca reciben.
- «Solicitados» es un `TabsContent keepMounted`: la lista de hoy sigue montada (oculta), como con el
  `PanelConmutado` de antes. Así no pierde su página y se revalida tras solicitar (SL-44).
- Se quita del módulo la prop `totalNetoAgregado`: ya no se pinta (R204), aunque sigue en el contrato del servicio.

### Mapa R → test (esta tanda)

| R | Test |
|---|---|
| R32 | `ColaCierresConsolidar.test.tsx` («Solicitados» sin tarjetas, aviso ni botón) |
| R37 | `e2e/cierre-bodega-satelite.spec.ts` (paso 1, conmutador «Tipo de cierre») |
| R45 | `ColaCierresConsolidar.test.tsx` (tarjetas, fila); `e2e/cierre-bodega-satelite.spec.ts` |
| R46 / R47 | `ColaCierresConsolidar.test.tsx` (bloqueada); `ConsolidacionBodegaRefresco.test.tsx`; E2E (aviso con el nombre, botón deshabilitado) |
| R48 / R207 | `ConsolidacionBodegaRefresco.test.tsx` (`<dl>` con los 4 pares, literales); E2E (los cuatro `dd`) |
| R67 | `ColaCierresConsolidar.test.tsx` (celda = `paraLaCentral`, con contraprueba); E2E (₡7.000) |
| R71 | `ColaCierresConsolidar.test.tsx` (strings sin tocar, signo); `liquidacion-money-safe.test.ts` (con contraprueba) |
| R190 | `ColaCierresConsolidar.test.tsx`; `cola-cierres-vista.test.ts`; `ColasPaginacion.test.tsx`; E2E (`role="tab"`). «Cambiar de pestaña conserva filtros y página»: `ConsolidacionBodegaRefresco.test.tsx` «(b) R291, deuda R190» (SLT-107; corregido en SLT-147, D72) |
| R191 | `ColaCierresConsolidar.test.tsx` (misma fila, fuera del panel); `CierresDescarga.test.tsx`. «Cambiar un filtro devuelve a la página 1»: `ConsolidacionBodegaRefresco.test.tsx` «(a) R291, deuda R191» (SLT-107; corregido en SLT-147, D72) |
| R192 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx`; `e2e/ajuste-pago-mensajero-cierre.spec.ts` («1 pago ajustado», ₡1.800) |
| R193 | `ColaCierresConsolidar.test.tsx`; `ConsolidacionBodegaRefresco.test.tsx` (`push` del enlace); E2E (abre «Detalle del cierre · Cierre de <m>») |
| R196 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx`; `CierreIngresoBodegaTarjetaListado.test.tsx`; `e2e/tarifas-activacion.spec.ts` (870 sin nota; filas con 300 y 570) |
| R197 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx` |
| R198 | `ColaCierresConsolidar.test.tsx` (`aria-describedby`; el aviso entre la barra y las tarjetas) |
| R201 | `ColaCierresConsolidar.test.tsx`; `ConsolidacionBodegaRefresco.test.tsx` |
| R202 / R204 / R205 | `ConsolidacionBodegaRefresco.test.tsx`; R204 además `censo-tablas.ts` + `cobertura-tablas.guardia` |
| R203 | `ColaCierresConsolidar.test.tsx`; `ColasPaginacion.test.tsx` (nombre de la paginación) |
| R206 | `cola-cierres-vista.test.ts` (columnas y tablists de hoy); `ColaCierres.test.tsx` y `ColaCierresBodega.test.tsx` sin cambios en sus aserciones; E2E `cierres-rediseno.spec.ts` |

### Contrapruebas

- money-safe: se puso `money(String(Number(paraLaCentralAgregado)))` en el módulo y la guardia se puso roja
  («ningún archivo de la feature convierte un monto a número»). Restaurado (`cmp` igual): 15/15 en verde.
- `ColaCierresConsolidar.test.tsx`: con otro `paraLaCentral` en el doble (41234.00), la celda pasa a ₡41.234.

### Salidas

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0 (también tras `next build`).
- `pnpm exec eslint` sobre los 21 archivos de código y tests y sobre los 3 E2E → exit 0, sin salida.
- `vitest run` de los tests tocados:
  - vista + cola (4 archivos): 112 passed;
  - `ColaCierresConsolidar`: 21 passed;
  - `ConsolidacionBodegaRefresco`: 9 passed;
  - `ColasPaginacion`: 6;
  - `BajoRiesgoPaginacion`: 5;
  - `CierreIngresoBodegaTarjetaListado`: 11;
  - `CierresDescarga` + `CierresDescargaColumnas`: 43;
  - guardias (`cobertura-tablas`, `liquidacion-money-safe`, `contadores-cabecera`, `cierre-bodega-vocabulario`,
    `paginacion-transversal`, `paginacion-dominios`): 78 passed;
  - `e2e-sin-saltos`: 38 passed.
- `pnpm exec vitest related --run <los 9 archivos de producción>` → 214 archivos: 213 passed, 1 failed.
  - El rojo es `tests/integration/wallet-page.test.tsx`: un *timeout* de 20 s con la máquina cargada, que
    arrastró una segunda aserción. Corrido solo: 19/19 en verde.
- E2E (`dinero`, base nueva `slt106_e2e`, puerto 3000):
  - corrida 1: `cierre-bodega-satelite`, `ajuste-pago-mensajero-cierre` y `tarifas-activacion` → **15 passed**;
  - corrida 2, sobre la misma base, más `cierres-rediseno` (abre «Bodega» como central) → **27 passed**;
  - las dos con 0 failed, 0 flaky y 0 skipped.
- T5.2 (R72): `git diff --name-only origin/dev...HEAD` → ningún archivo en `db/` ni en `lib/actions/`.

### Veredicto (tanda 2)

T2, T3, T4 y T5.2 hechos: la satélite consolida desde la cola única, cada R de pantalla tiene test y los E2E pasan en verde dos veces seguidas. T5.1 queda para el leader.

## Arreglo guardia cascada-central

Rojo del gate: `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts` >
«y el extractor distingue los cuatro comprobantes, que comparten prefijo» (`USOS_AJENOS.length > 2`, recibía 2).

- **Montaje que desapareció:** `<CierreConsolidableFacturaResumen>` en
  `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`. Es la sustitución de R204
  (`ConsolidacionBodegaModule` DEBE montar `ColaCierres` y NO `CierreConsolidableFacturaResumen`), no una
  pérdida. El componente sigue declarado sin montar hasta SLT-115.
- **Aserción nueva:** el umbral a ciegas se sustituye por un censo explícito `archivo · componente` con
  `toEqual` (patrón del `it` anterior, comentario SLT-106 con el motivo):
  `CierreDiaModule.tsx · CierreFacturaResumenPropio` y `CierresAdminHistoricoLista.tsx · CierreFacturaResumen`.
- **Contraprueba:** mutación temporal del extractor (`if (true || !/[\w$]/.test(siguiente))`, deja de exigir
  nombre completo) → el `it` cae en el `toEqual` (1 failed | 8 passed). Revertida (diff solo con la edición).
  Nota: el `.every(u => u.componente === ...)` previo NO caza esa mutación (`componente` es el argumento,
  no lo leído); quien la caza es el censo nuevo.

### Comandos (DATABASE_URL → base `slt106_consolidar`)

- Guardias de cierres/cascada/bodega (9 archivos): `Test Files 9 passed (9)`, `Tests 93 passed (93)`.
- `npx vitest run tests/unit/guards` (gate.siempre): `Test Files 1 failed | 241 passed (242)`,
  `Tests 4 failed | 3438 passed | 1 skipped (3443)`. Los 4 rojos son
  `dependencias-declaradas-presentes.guardia.test.ts` (marcador «FIN PASO 2» de init.sh): preexistentes,
  fallan igual (4 failed | 11 passed) en el checkout de `dev`; init.sh sin diff contra origin/dev.
- `npx eslint <archivo>` → 0. `npx tsc --noEmit` → 0.

Veredicto: guardia cascada-central en verde y vigilando el censo explícito de comprobantes ajenos; el rojo de dependencias es deuda ajena de dev.

## Gate del leader (2026-11-12)
- `./init.sh` tras sincronizar con origin/dev (SLT-110 dentro), base slt106_consolidar: `INIT_EXIT=0`.
- Menores de la review 1 que pasan a deuda (no bloquean): tests de R190 (pestaña conserva filtros y página) y R191 (filtro vuelve a página 1); integración de `findMensajerosConCierreSinResolver` con dos empresas.
