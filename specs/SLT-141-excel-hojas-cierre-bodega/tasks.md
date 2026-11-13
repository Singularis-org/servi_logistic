# SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» — tasks (S15c)

> Reparto: `backend_dev` T0, T1, T2, T3; `frontend_dev` T4, T5. Se empieza **después** de que
> SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» esté en `dev` y la rama rebasada
> sobre él. Antes del primer gate, copiar `.env` al worktree (sin él la integración se salta y el gate
> sale verde a ciegas). Base desechable para integración y E2E, nunca la de desarrollo. No correr el
> gate con una mutación aplicada.

## T0 — Comprobaciones previas (backend_dev)

- [x] **T0.1** En `origin/dev` actualizado (`git fetch` + `git grep`): (a) SLT-140 y SLT-139 «Pago al
  mensajero independiente del efectivo: satélite» están mergeadas (`sumarPagadoSatelitePorCierre`
  existe); (b) nadie emite ya `cifrasModeloNuevo` ni hojas «Cierres» de bodega; (c) qué exporta
  SLT-140 para «Por tienda», «Pago entregado» por cierre del día y las columnas marcadas de «Cierres
  modelo anterior» (`design.md > Relación con SLT-140`). **Hecho:** resultado en
  `progress/impl_SLT-141.md` con lo que se reusa y lo que no; si (a) falla o (b) ya existe, PARA y
  avisa al leader.
- [x] **T0.2** Calcular a mano los literales de `design.md > Verificación` leyendo (no ejecutando)
  `derivarIngresoOrden`, `totalesIngresoEmpresa`, `netoEmpresa`, `ganaLaTienda`, `partesPorTienda`,
  `saldoDe` y `derivarPendienteCierre`. **Hecho:** literales anotados; si alguno no casa con el
  design, PARA y reporta (no se ajusta el literal a la salida).
- [x] **T0.3** Medir hoy: número de consultas de `listarHistoricoCierresBodegaCompleto` con 1 y con 3
  cierres de bodega viejos (base de R384 «ninguna lectura más»). **Hecho:** números anotados.

## T1 — Derivación agregada única (backend_dev) · depende de T0

- [x] **T1.1** `lib/utils/cifras-cierre-bodega.ts > cifrasAgregadasBodega` con el bloque agregado de
  `verCierreBodegaDetalle` movido tal cual; el servicio lo llama. Nuevo
  `tests/unit/utils/cifras-cierre-bodega.test.ts` con los literales de BN (dos tiendas, rechazo de T1,
  neto 3 500.00, gana 92 090.00, por tienda en su orden). **Hecho:** verde; rojo con la mutación
  «suma de los cierres del día en vez del snapshot agregado»; los tests del detalle de bodega
  (`tests/unit/services/cierres-bodega-admin-service.test.ts`,
  `tests/unit/services/cierre-desglose-tres-superficies.test.ts`) verdes sin tocar aserciones.

## T2 — Lectura en lote y servicios (backend_dev) · depende de T1

- [x] **T2.1** Tipos: `CifrasCierreBodegaDescargaDTO` / `…CentralDescargaDTO` y `cifrasModeloNuevo?` en
  `lib/interfaces/services/ICierreBodegaService.ts` y `ICierresBodegaAdminService.ts`;
  `ConCifrasBodegaEnOk` y los tres tipos de borde en `lib/types/cierre-bodega.ts`. **Hecho:**
  typecheck verde.
- [x] **T2.2** `ICifrasBodegaLoteLectura` + `CifrasBodegaLoteRepository` (tres consultas, alcance en el
  `where`, campos obligatorios); exportar `DETALLE_CIERRE_SELECT` y `toDetalleCierreRow` de
  `CierresBodegaAdminRepository.ts`. **Hecho:** typecheck verde.
- [x] **T2.3** `CierresBodegaAdminService` (pendientes e histórico, con `pagoEntregado` según PA1) y
  `CierreBodegaService` (solicitados, sin él), dependencias opcionales que lanzan si faltan con un
  cierre nuevo; inyección en `lib/actions/cierre-bodega.ts`. Nuevos
  `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts` (a: solo viejos → la
  lectura no se llama y la respuesta es `toEqual` a la de hoy; b: mixto → cifras solo de los nuevos;
  c: `pagoEntregado` con P, pagos vigentes, premios y pagado por la satélite literales, y `null` con un
  cierre del día sin aprobar; d: dependencia ausente → lanza; e: tope excedido → no lee el lote),
  `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts` (alcance `zona` pasado
  a la lectura; la respuesta no tiene la clave `pagoEntregado`) y
  `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts` (las acciones construyen los dos
  servicios con la lectura y, la central, con las tres lecturas de pago). **Hecho:** verdes; rojo si
  se quita una inyección o se manda `pagoEntregado` a la satélite.

## T3 — Integración contra Postgres real (backend_dev) · depende de T2

- [x] **T3.1** `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` con el corpus y los
  literales de `design.md > Verificación`: paridad con `verCierreBodegaDetalle` (central y S), alcance,
  número de consultas igual con 1 y 3 cierres nuevos, sin escrituras, sin lote con solo BV.
  **Hecho:** verde contra base desechable; las cinco mutaciones de `design.md` puestas una a una dan
  rojo y se anotan en `progress/impl_SLT-141.md` (con la salida que lo prueba).

## T4 — Cliente (frontend_dev) · depende de T2.1 · [P] con T3

- [x] **T4.1** `cierres-bodega-modelo-nuevo-descarga-columnas.ts` y `cierres-bodega-modelo-nuevo-descarga.ts`
  (o reuso de SLT-140 según T0.1). Nuevo `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`:
  encabezados de «Cierres» (26 central, 25 satélite) y «Por tienda» contra listas literales; celdas de
  BN con `formato: "monto"`, negativos con signo, «Recibido» vacío sin conciliar, fechas; `null` sin
  cierres nuevos; mixto con «Cierres modelo anterior» y ningún cierre en dos hojas; item nuevo sin
  cifras → error. Añadir los dos módulos a
  `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`. **Hecho:** verdes.
- [x] **T4.2** `descargaColaBodega` (`CierresBodegaAdminModule.tsx`), `descargaBodegaResueltos`
  (`CierresBodegaResueltosLista.tsx`) y `descargaBodegaSolicitados` (`CierresBodegaSolicitadosLista.tsx`)
  con el libro. Nuevo `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` con
  `construirDescarga` espiado: (a) solo viejos → llamada `toEqual` al literal de hoy en las tres
  pantallas; (b) mixto → `toEqual` a un literal con `tituloHoja: "Cierres"` y dos hojas adicionales;
  (c) «Solicitados» sin «Pago entregado». **Hecho:** verdes; `tests/unit/descarga/cierres-bodega-descarga-columnas.test.ts`,
  `tests/components/descarga/CierresDescargaNiveles.test.tsx` y
  `tests/components/descarga/CierresDescargaColumnas.test.tsx` verdes sin tocarlos.

## T5 — E2E (frontend_dev) · depende de T3 y T4

- [x] **T5.1** Describe de SLT-141 en `e2e/cierres-rediseno.spec.ts` (`design.md > Verificación > E2E`).
  Si el escenario no tiene un cierre de bodega nuevo y uno viejo en «Conciliados», se amplía
  `e2e/_escenarios/cierres.ts` sin cambiar lo que leen los describes de SLT-113 y SLT-140.
  **Hecho:** verde en local (base desechable, `NEXT_PUBLIC_APP_URL` como en `gate.yml`); rojo con el
  libro desactivado a mano (mutación temporal, revertida y anotada).

## T6 — Cierre (implementer)

- [ ] **T6.1** `./init.sh` verde con `INIT_EXIT` anotado; E2E `cierres-rediseno` entero y grupo
  `dinero` verdes en local. **Hecho:** salidas en `progress/impl_SLT-141.md`.
- [x] **T6.2** Si el gate avisa del tamaño en líneas, la decisión de PA5 escrita por el leader en
  `progress/features/SLT-141.md`. **Hecho:** línea `tamano-pr-aceptado` presente o PA5 resuelta.
- [ ] **T6.3** Mapa `R → test` en `progress/impl_SLT-141.md`, igual a `## Trazabilidad`. **Hecho:** cada
  R con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R384 | `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (a) · `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts` (a) · `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` (solo BV) · existentes sin cambiar aserciones: `tests/unit/descarga/cierres-bodega-descarga-columnas.test.ts`, `tests/components/descarga/CierresDescargaNiveles.test.tsx`, `tests/components/descarga/CierresDescargaColumnas.test.tsx` |
| R385 | `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (libro, mixto, orden) · `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (b) · `e2e/cierres-rediseno.spec.ts` (hojas) |
| R386 | `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (encabezados 26/25) · `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts` (sin `pagoEntregado`) · `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` (c) |
| R387 | `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` (literales, paridad, sin escrituras) · `tests/unit/utils/cifras-cierre-bodega.test.ts` · `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (celdas, signo) · `e2e/cierres-rediseno.spec.ts` (números) |
| R388 | `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (folio, fechas, vacíos, conteos) · `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts` (c) · `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` (Gestiones, Pagos ajustados, Pago entregado) |
| R389 | `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts` (consultas con 1 y 3; alcance) · `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts` (alcance) · `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts` |

## Tamaño

**25 archivos** (objetivo ≤ 32, tope 40): **15 de producción** y **10 de tests** (7 nuevos y 3
compartidos con SLT-140: la guardia de frontera, el E2E y su escenario, este último condicionado a
T5.1).

Líneas, estimadas: **~520 de producción** (lectura en lote ~120, módulo del libro ~110, columnas ~90,
servicios ~100, util ~60, el resto <20 por archivo) y **~1 000 de tests** (≈2×: integración ~350,
módulo ~220, componentes ~180, servicios ~150, el resto <60). **~1 500 líneas, por encima de las
1 000 del gate**: PA5 en `requirements.md`.

## Archivos esperados

Producción:

- `lib/utils/cifras-cierre-bodega.ts`
- `lib/interfaces/repositories/ICifrasBodegaLoteLectura.ts`
- `lib/repositories/CifrasBodegaLoteRepository.ts`
- `lib/repositories/CierresBodegaAdminRepository.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/types/cierre-bodega.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/CierreBodegaService.ts`
- `lib/actions/cierre-bodega.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga.ts`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaResueltosLista.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaSolicitadosLista.tsx`

Tests:

- `tests/unit/utils/cifras-cierre-bodega.test.ts`
- `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts`
- `tests/unit/services/cierres-bodega-resumen-modelo-nuevo-service.test.ts`
- `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts`
- `tests/unit/actions/cierre-bodega-cifras-cableado.test.ts`
- `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`
- `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx`
- `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/_escenarios/cierres.ts`

Estado (no cuentan para el tamaño): `progress/impl_SLT-141.md`, `progress/features/SLT-141.md`.
