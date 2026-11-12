# SLT-106 «Bodega satélite: A consolidar con la cola única» — tasks

> `[P]` = paralelizable con la task anterior. Servidor (T1) = `backend_dev`; pantalla (T2-T4) =
> `frontend_dev`. T2 depende de T1 (tipos). **Antes del primer gate, copia `.env` al worktree** (sin
> `.env` el gate sale verde saltándose la integración) y exporta la base desechable antes de
> cualquier `vitest`.

## Tamaño

31 archivos (78 % de 40, fuera `specs/` y `progress/`): 11 de producción, 3 tests nuevos, 14 tests y
E2E a adaptar, 2 censos de guardias y 1 de etiquetas de diálogo. Líneas estimadas ~1 100-1 300
(servidor ~200, pantalla ~380, tests nuevos ~450, adaptaciones ~300). Si el gate pasa de 1 000
líneas al cerrar T5, para y aplica `requirements.md > PA-T`.

## T0 — Comprobaciones previas (sin código)

- [ ] **T0.1** — Confirmar con Grep que ningún archivo fuera de `## Archivos esperados` construye un
  `CierreDiaConsolidableRow` o lee `ListarConsolidablesServiceResult.items` (si aparece uno, se
  añade aquí antes de seguir). **Hecho:** nota en `progress/impl_SLT-106.md`.
- [ ] **T0.2** [P] — Confirmar que `verCierreDetalle` (el `?cierre=` de `CierresAdminModule`) abre a la
  satélite un cierre del día **aprobado** de su zona (no solo los de su cola de pendientes). **Hecho:**
  nota con archivo y línea. Si no lo abre, se para y se pregunta: R193 no se cumple sin permiso nuevo.
- [ ] **T0.3** [P] — Listar los tests y E2E que localizan «A consolidar» por lo que desaparece
  (`Totales a consolidar`, `Comprobante del cierre de`, `group` «Cierre de bodega por etapa», región
  «Solicitar cierre de bodega», «Central debe», «Ingreso de bodega… a consolidar»). **Hecho:** la lista
  coincide con T4; si sale uno más, se añade a `## Archivos esperados`.

## T1 — Servidor (`backend_dev`)

- [ ] **T1.1** — `ICierreBodegaRepository` / `CierreBodegaRepository`: `CierreDiaConsolidableRow` con
  `paraLaCentral`, `aprobadoAt`, `gestionesAjustadas` (requeridos); `CONSOLIDABLE_SELECT` con
  `resueltoAt` y el `_count` ampliado; `toConsolidableRow` con `paraLaCentral()` de
  `ingreso-empresa.ts`; `sinResolverWhere(zonaId)` compartido por `contarCierresDiaSolicitados` y el
  nuevo `findMensajerosConCierreSinResolver`. **Hecho:** typecheck verde;
  `tests/unit/repositories/cierre-bodega-repository.test.ts` comprueba con literales el mapper
  (60000.00 − 2000.00 − 300.00 → `"57700.00"`; 0.00 − 2000.00 − 0.00 → `"-2000.00"`), `aprobadoAt`
  ISO o `null`, y que `contar` y `findMensajeros…` reciben el mismo `where` (R67, R194).
- [ ] **T1.2** — `ICierreBodegaService` / `CierreBodegaService`: `CierreConsolidableCola`,
  `BloqueoConsolidacion`, los cuatro campos nuevos de `listarConsolidacion`, `motivoSinResolver`
  exportada; `solicitarCierreBodega` sin tocar. **Hecho:** nuevo
  `tests/unit/services/consolidacion-cola-satelite.test.ts` (dobles) verde con:
  - R67: dos consolidables (60 000,00 / 2 000,00 / 300,00 y 40 000,00 / 1 000,00 / 200,00) →
    `paraLaCentralAgregado` `"96500.00"` (100 000,00 − 3 000,00 − 500,00), igual a la suma de los dos
    `paraLaCentral` de fila (57 700,00 + 38 800,00); negativo con su signo (`"-2000.00"`);
  - R195: `cierresAConsolidar` 3 y `mensajerosAConsolidar` 2 con tres cierres de dos mensajeros;
    `bloqueo` `"sin_resolver"` / `"vacio"` / `null` / `"sin_zona"` (y sus `"0.00"`, 0, 0);
  - R199 / R47: `["Beto Mensajero"]` → singular de un cierre; `["Beto Mensajero", "Beto Mensajero"]`
    → «tiene cierres»; `["Carla Mensajera", "Ana Mensajera", "Beto Mensajero", "Ana Mensajera"]` →
    «Ana Mensajera, Beto Mensajero y Carla Mensajera tienen cierres sin resolver. Apruébalos o
    recházalos primero.» (literales completos);
  - R200: con dos sin resolver, `solicitarCierreBodega` sigue devolviendo `conflict` con «Primero
    resuelve los cierres de tus mensajeros antes de cerrar la bodega.» y llama a
    `contarCierresDiaSolicitados`, no al método nuevo.
  **Contraprueba:** cambiar en el servicio un `.minus` del agregado por `.plus` pone rojo el literal
  96500.00; quitar el «dedupe» pone rojo el de tres nombres.
- [ ] **T1.3** — Integración contra la base: nuevo
  `tests/integration/db/consolidacion-cola-satelite.test.ts`. Datos: zona A (la del actor) y zona B;
  en A, un cierre `aprobado` sin consolidar de M1 con dos gestiones (una con **dos** ajustes de pago,
  otra sin), un `aprobado` ya consolidado, dos `solicitado` (M2, M3) y un `rechazado` (M4); en B, un
  `solicitado` (M5). **Precondición escrita** (`expect(filas.length).toBeGreaterThan(0)` antes de mirar
  campos: un test sin datos no puede salir verde). **Hecho:** verde con:
  - página y conjunto completo de A: solo M1; `gestionesAjustadas` 1; `aprobadoAt` = `resuelto_at`;
    `paraLaCentral` igual al literal escrito a mano de sus snapshots (R67, R194);
  - `findMensajerosConCierreSinResolver(A)` = M2 y M3, sin M4 ni M5, y su longitud =
    `contarCierresDiaSolicitados(A)` (R199);
  - `listarConsolidacion` real (servicio + repositorio) da el motivo con «M2 y M3» (R47).
  **Mutación del `WHERE` (obligatoria, anotada con su resultado en `progress/impl_SLT-106.md`):**
  1. quitar `destinoZonaId` de `sinResolverWhere` → aparece M5 → rojo;
  2. quitar `estado` de `sinResolverWhere` → aparecen M1/M4 → rojo;
  3. quitar `ajustesPagoMensajero: { some: {} }` del `_count` → `gestionesAjustadas` 2 → rojo;
  4. invertir dos argumentos de `paraLaCentral` en `toConsolidableRow` → rojo.
  Cada mutación se deshace y el árbol vuelve a verde. No se corre el gate mientras haya una mutación
  puesta.
- [ ] **T1.4** [P] — Actualizar los dobles del repositorio en
  `tests/unit/services/cierre-bodega-service.test.ts`, `consolidacion-completo.test.ts`,
  `consolidables-paginado.test.ts` y `cierre-bodega-solicitados-paginado.test.ts` (método nuevo y
  campos nuevos de la fila). En `cierre-bodega-service.test.ts`, la aserción de hoy
  `contarCierresDiaSolicitados` llamado desde `listarConsolidacion` pasa a
  `findMensajerosConCierreSinResolver`; la de `solicitar` (R6/431-R5) **no cambia**. **Hecho:** los
  cuatro verdes sin quitar ninguna aserción.

## T2 — Lógica pura de la cola (`frontend_dev`, depende de T1.2)

- [ ] **T2.1** — `cola-cierres-vista.ts` y `cola-cierres-labels.ts`: `PestanaCola` con `aConsolidar` /
  `solicitados`; columnas de bodega · satélite; `tablistCola(tipo, rol)`; `folioConsolidable`,
  `aprobadoCola`, `senalesConsolidable`, `tarjetasAConsolidar`, `piePorConsolidar`; textos de
  `design.md > Textos nuevos`. `detalle-cierre-vista.ts`: `CifraId` + `aviso?`. **Hecho:**
  `tests/unit/utils/cola-cierres-vista.test.ts` verde con:
  - columnas de A consolidar en el orden de R192 (y las de mensajero y bodega central idénticas a hoy,
    R206);
  - `tablistCola("bodega", "satelite")` = «Cierre de bodega por etapa» (R190);
  - `aprobadoCola` con `null` → «—»; `senalesConsolidable` 0 → `null`, 1 → «1 pago ajustado», 3 →
    «3 pagos ajustados» (R192);
  - `tarjetasAConsolidar`: orden e ids; «La central debe» ausente con `"0.00"` y presente con
    `"12500.00"` y `aviso: true`; nota de bodega «por devoluciones a origen» con modelo viejo y vacía
    con nuevo; «1 mensajero · …» / «3 mensajeros · …»; «Debe llegar» destacada; los valores son los
    strings de entrada sin tocar (R196, R71);
  - `piePorConsolidar`: los tres textos de R197 y `undefined` con `"vacio"`.
- [ ] **T2.2** [P] — `CifrasCierre.tsx`: `ariaLabel?`, rejilla de 5, caja en tono de aviso.
  **Hecho:** `tests/components/DetalleCierreDinero.test.tsx` y los demás del detalle verdes sin tocar
  (con 3 y 4 cajas no cambia nada); el tono lo cubre T3.1.
- [ ] **T2.3** [P] — `dialogos-labels.ts`: `RESUMEN_SOLICITUD_BODEGA_TEXTO`. **Hecho:** typecheck.

## T3 — Componentes (`frontend_dev`, depende de T2)

- [ ] **T3.1** — `ColaCierres.tsx`: variante bodega · satélite (`TablaColaConsolidar`, aviso,
  tarjetas, pie con botón, panel `solicitados`); `ColaCierresBodegaProps.rol: "central"`. **Hecho:**
  nuevo `tests/components/ColaCierresConsolidar.test.tsx` lee del DOM con literales:
  - `tablist` «Cierre de bodega por etapa» con «A consolidar 3» y «Solicitados 8» (R190);
  - barra y «Descargar» en la misma fila y fuera de los paneles (R191);
  - una fila: «#…», «Ana Mensajera», la fecha, `money` de 100000.00 / 3000.00 / 500.00 y «A la
    central» 96 500,00 en negrita; otra con `"-2000.00"` pintado con su signo; «1 pago ajustado»;
    botón «Ver el cierre de Ana Mensajera» → `verSuCierre("<id>")` (R192, R193, R71);
  - las cuatro tarjetas con sus notas y la quinta solo con `centralDebe` ≠ 0, en tono de aviso
    (R45, R196);
  - bloqueada: aviso `role="status"` con el texto, botón deshabilitado con `aria-describedby` a él,
    pie «Se habilita cuando…» (R46, R198, R197); habilitada: «Se enviarán los 3 cierres…», el clic
    llama a `botonPie.onClick` (R197);
  - pestaña «Solicitados»: pinta el nodo `solicitados` y ni tarjetas, ni aviso, ni botón (R201);
  - región «Cierres del día a consolidar», carga, error y vacío con los textos de R203; descripción
    con y sin zona (R203);
  - contraprueba: con el `paraLaCentral` de la fila cambiado en el doble, la celda cambia.
- [ ] **T3.2** — `ConsolidacionBodegaModule.tsx` y `page.tsx` (`design.md > ConsolidacionBodegaModule`).
  **Hecho:** `tests/components/ConsolidacionBodegaRefresco.test.tsx` adaptado y verde con:
  - tras `ok`: toast, diálogo cerrado, `mutate` de las dos claves y `refresh` (R205);
  - el diálogo con `<dl>` «Resumen del cierre de bodega a solicitar»: Recaudado, Pago a mensajeros,
    Gana la bodega satélite, Debe llegar a la central con los mismos importes que las tarjetas
    (literales) y título/descripción/botón de hoy (R48, R207);
  - sin zona: aviso de hoy + lista de solicitados, sin `tablist`, tarjetas ni botón (R202);
  - no hay región «Totales a consolidar», «Central debe» ni «Comprobante del cierre de …» (R204).
- [ ] **T3.3** [P] — Censos: `tests/unit/descarga/censo-tablas.ts` (montajes de `ColaCierres` +
  `ConsolidacionBodegaModule.tsx`; ajustar la entrada de «Cierres del día a consolidar» de la
  cabecera si la guardia la exige) y `tests/unit/guards/liquidacion-money-safe.test.ts` (añadir
  `ConsolidacionBodegaModule.tsx`). **Hecho:** `cobertura-tablas.guardia` y
  `liquidacion-money-safe` verdes (R204, R71); contraprueba: un `Number(paraLaCentralAgregado)`
  plantado en el módulo pone roja la money-safe.

## T4 — Tests y E2E existentes (`frontend_dev`, depende de T3)

- [ ] **T4.1** — Adaptar, **sin quitar lo que vigilan**: `tests/components/paginacion/ColasPaginacion.test.tsx`
  (las tarjetas «Cifras a consolidar» no cambian al pasar de página; botón en el pie),
  `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`,
  `tests/components/CierreIngresoBodegaTarjetaListado.test.tsx` (el rótulo por modelo pasa a la nota
  de la tarjeta: R196) y `tests/components/descarga/CierresDescarga.test.tsx` (el «Descargar» de cada
  pestaña, R191). **Hecho:** verdes; cada aserción que cambió de localizador conserva el mismo número.
- [ ] **T4.2** — E2E (base desechable nueva, `NEXT_PUBLIC_APP_URL` como en `gate.yml`):
  - `e2e/cierre-bodega-satelite.spec.ts`: con un mensajero con cierre `solicitado`, el aviso nombra a
    ese mensajero y el botón está deshabilitado (R46, R47); tras aprobarlo, las tarjetas y la fila con
    importes escritos a mano (recaudado, pago, bodega y «A la central» = la resta a mano) (R45, R67);
    «Ver su cierre» abre «Detalle del cierre · Cierre de <m>» (R193); el diálogo con los cuatro
    importes (R48); la pestaña por `role="tab"` (R190); el conmutador «Tipo de cierre» de hoy (R37);
  - `e2e/ajuste-pago-mensajero-cierre.spec.ts`: el botón del pie en vez de la región; la fila de M con
    «1 pago ajustado» (R192);
  - `e2e/tarifas-activacion.spec.ts`: la tarjeta «Gana la bodega satélite» = 870 con la nota vacía
    (modelo nuevo presente) y «Gana bodega» de cada fila = 300 y 570 (R196, D19).
  **Hecho:** los tres verdes en local; además `grep -rl "cierres-admin" e2e/` re-ejecutados los que
  abren la mitad de Bodega con satélite.

## T5 — Gate

- [ ] **T5.1** — `./init.sh` verde (con `.env` y la base desechable). **Hecho:** `INIT_EXIT=0` escrito
  dentro del log; tamaño leído (si > 1 000 líneas, PA-T).
- [ ] **T5.2** — R72: `git diff --stat origin/dev` sin `db/` ni `lib/actions/`. **Hecho:** nota en
  `progress/impl_SLT-106.md`.

## T6 — Antes de promover (leader)

- [ ] **T6.1** — Carlos aprueba en Preview los textos de PA1 y la pantalla de «A consolidar» con un
  cierre bloqueado y otro habilitado. No se promueve a `prod` sin ese OK.

## Trazabilidad

| R | Test |
|---|---|
| R32 | `tests/components/ColaCierresConsolidar.test.tsx` (tarjetas, aviso y botón solo en A consolidar) |
| R37 | `e2e/cierre-bodega-satelite.spec.ts` (conmutador «Tipo de cierre» de hoy) |
| R45 | `ColaCierresConsolidar.test.tsx`; `e2e/cierre-bodega-satelite.spec.ts` |
| R46 | `ColaCierresConsolidar.test.tsx` (bloqueada); `e2e/cierre-bodega-satelite.spec.ts` |
| R47 | `tests/unit/services/consolidacion-cola-satelite.test.ts`; `tests/integration/db/consolidacion-cola-satelite.test.ts`; `e2e/cierre-bodega-satelite.spec.ts` |
| R48 | `tests/components/ConsolidacionBodegaRefresco.test.tsx`; `e2e/cierre-bodega-satelite.spec.ts` |
| R67 | `consolidacion-cola-satelite.test.ts` (agregado); `tests/unit/repositories/cierre-bodega-repository.test.ts` y la integración (fila) |
| R71 | `ColaCierresConsolidar.test.tsx` (strings sin tocar, signo); `tests/unit/guards/liquidacion-money-safe.test.ts` |
| R72 | `cierre-bodega-service.test.ts` (R6/431-R5 sin cambios); T5.2 |
| R190 | `ColaCierresConsolidar.test.tsx`; `tests/unit/utils/cola-cierres-vista.test.ts`; `ColasPaginacion.test.tsx` |
| R191 | `ColaCierresConsolidar.test.tsx`; `tests/components/descarga/CierresDescarga.test.tsx` |
| R192 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx`; `e2e/ajuste-pago-mensajero-cierre.spec.ts` |
| R193 | `ColaCierresConsolidar.test.tsx`; `e2e/cierre-bodega-satelite.spec.ts` |
| R194 | `tests/integration/db/consolidacion-cola-satelite.test.ts` (con mutación 3); `cierre-bodega-repository.test.ts` |
| R195 | `consolidacion-cola-satelite.test.ts` |
| R196 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx`; `e2e/tarifas-activacion.spec.ts`; `CierreIngresoBodegaTarjetaListado.test.tsx` |
| R197 | `cola-cierres-vista.test.ts`; `ColaCierresConsolidar.test.tsx` |
| R198 | `ColaCierresConsolidar.test.tsx` |
| R199 | `consolidacion-cola-satelite.test.ts` (literales); integración (mutaciones 1 y 2) |
| R200 | `consolidacion-cola-satelite.test.ts`; `cierre-bodega-service.test.ts` |
| R201 | `ColaCierresConsolidar.test.tsx` |
| R202 | `ConsolidacionBodegaRefresco.test.tsx` |
| R203 | `ColaCierresConsolidar.test.tsx`; `ColasPaginacion.test.tsx` (nombre de la paginación) |
| R204 | `ConsolidacionBodegaRefresco.test.tsx`; `tests/unit/descarga/censo-tablas.ts` + `cobertura-tablas.guardia` |
| R205 | `ConsolidacionBodegaRefresco.test.tsx` |
| R206 | `cola-cierres-vista.test.ts` (columnas y tablists de hoy); suites de `CierresAdminModule` y `CierresBodegaAdminModule` sin tocar |
| R207 | `ConsolidacionBodegaRefresco.test.tsx` |

## Archivos esperados

- `lib/interfaces/repositories/ICierreBodegaRepository.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/services/CierreBodegaService.ts`
- `components/private/cierres/cola/ColaCierres.tsx`
- `components/private/cierres/cola/cola-cierres-vista.ts`
- `components/private/cierres/cola/cola-cierres-labels.ts`
- `components/private/cierres/detalle/CifrasCierre.tsx`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/dialogos/dialogos-labels.ts`
- `app/(app)/cierres-admin/_components/ConsolidacionBodegaModule.tsx`
- `app/(app)/cierres-admin/page.tsx`
- `tests/unit/services/consolidacion-cola-satelite.test.ts`
- `tests/integration/db/consolidacion-cola-satelite.test.ts`
- `tests/components/ColaCierresConsolidar.test.tsx`
- `tests/unit/utils/cola-cierres-vista.test.ts`
- `tests/unit/repositories/cierre-bodega-repository.test.ts`
- `tests/unit/services/cierre-bodega-service.test.ts`
- `tests/unit/services/consolidacion-completo.test.ts`
- `tests/unit/services/consolidables-paginado.test.ts`
- `tests/unit/services/cierre-bodega-solicitados-paginado.test.ts`
- `tests/components/ConsolidacionBodegaRefresco.test.tsx`
- `tests/components/CierreIngresoBodegaTarjetaListado.test.tsx`
- `tests/components/paginacion/ColasPaginacion.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/tarifas-activacion.spec.ts`
