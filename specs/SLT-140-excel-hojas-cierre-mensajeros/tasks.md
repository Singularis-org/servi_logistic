# SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» — tasks (S15b)

> Reparto: `backend_dev` T0, T1, T2, T3; `frontend_dev` T4, T5. Antes del primer gate, copiar `.env`
> al worktree (sin él la integración se salta y el gate sale verde a ciegas). Base desechable para
> integración y E2E, nunca la de desarrollo. No correr el gate con una mutación aplicada.

## T0 — Comprobaciones previas (backend_dev)

- [x] **T0.1** En `origin/dev` actualizado (`git fetch` + `git grep`): ¿está mergeado #149 (SLT-139
  «Pago al mensajero independiente del efectivo: satélite»)? ¿Alguien emite ya `cifrasModeloNuevo`,
  `derivarPagoEntregadoCierre`, `cifrasDelCierre`, `obtenerFilasConColumnas` o
  `findGestionesDeCierresEnAlcance`? **Hecho:** resultado en `progress/impl_SLT-140.md`; si #149 no
  está mergeado o algo ya existe, PARA y avisa (PA3).
- [x] **T0.2** Calcular a mano los literales de `design.md > Verificación` leyendo (no ejecutando)
  `derivarIngresoOrden` con conceptos del modelo nuevo, `pagoTiendaEmpresa`, `ganaLaTienda`,
  `netoEmpresa`, `partesPorTienda` y `derivarPendienteCierre`; y cómo siembra el corpus de SLT-113
  (`tests/integration/db/cierres-gestiones-modelo-nuevo-descarga-sql-real.test.ts`) un cierre nuevo
  con sus snapshots. **Hecho:** literales anotados; si alguno no casa, PARA y reporta (no se ajusta el
  literal a la salida).
- [x] **T0.3** Contar los dobles que tipan `ICierresAdminRepository` entero y llaman a los dos
  `listar…Completo` (empezar por `tests/unit/services/cierres-admin-completo.test.ts` y
  `cierres-admin-filtro-estado.test.ts`), y qué siembra `e2e/_escenarios/cierres.ts`. **Hecho:**
  anotado; si hace falta tocar un archivo fuera de `## Archivos esperados`, PARA y avisa al leader.
- [x] **T0.4** Medir y anotar el número de consultas de hoy de `listarHistoricoCierresAdminCompleto` con
  un conjunto solo viejo (línea base de R383). **Hecho:** cifra en `progress/impl_SLT-140.md`.

## T1 — Funciones puras (backend_dev) · depende de T0

- [x] **T1.1** [P] `lib/utils/cifras-cierre.ts > cifrasDelCierre` moviendo el bloque de
  `verCierreDetalle` tal cual; `verCierreDetalle` lo llama. Nuevo `tests/unit/utils/cifras-cierre.test.ts`
  con el escenario N1 contra literales (incluido `ganaLaTienda` negativo de Tienda Sur y las tres
  sumas de R381). **Hecho:** verde; los tests de detalle existentes (`vitest related` de
  `CierresAdminService.ts`) verdes sin tocar sus aserciones.
- [x] **T1.2** [P] `derivarPagoEntregadoCierre` en `lib/utils/pendiente-cierre.ts`; casos nuevos en
  `tests/unit/utils/pendiente-cierre.test.ts`: (a) marca `true`, P 3 000,00, pagado 1 200,00 → 1 200,00;
  (b) marca `false`, P 3 000,00, E 70 000,00, nada pagado → 3 000,00; (c) marca `true`, P 3 000,00,
  premio 500,00, nada pagado → 0,00; (d) pagado de más → `P + premios`, nunca más; (e) con lo pagado
  por la satélite de SLT-139 si ya está. Y la lectura estática de hoy (sin `Number(`/`parseFloat`)
  cubre el archivo. **Hecho:** verde; rojo si se quitan los premios (c da −500,00).

## T2 — Servidor (backend_dev) · depende de T1

- [x] **T2.1** (dobles: 12 archivos añadidos a `## Archivos esperados` por decisión del leader 2026-11-12) `findGestionesDeCierresEnAlcance` en `ICierresAdminRepository` (obligatorio) y
  `CierresAdminRepository` (`design.md > Servidor 3`). **Hecho:** typecheck verde; dobles de T0.3
  con `vi.fn()` que falla si se llama.
- [x] **T2.2** Tipos de `design.md > Contrato I/O` en `ICierresAdminService.ts` y su réplica de borde
  en `lib/types/cierres-admin.ts`. **Hecho:** typecheck verde; ninguna acción ni schema cambia.
- [x] **T2.3** `CierresAdminService`: `entradaPendiente` + `conPendienteYEntregado` (sin consultas
  nuevas; `conPendiente` devuelve lo de hoy) y la rama de cifras en los dos `listar…Completo`
  (`design.md > Servidor 4`). Nuevo `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts`
  con dobles: (a) solo viejos → sin `cifrasModeloNuevo` y `findGestionesDeCierresEnAlcance` no llamado;
  (b) mixto → una sola llamada con los ids nuevos y `scope.alcance`, una entrada por nuevo en el orden
  de `items`; (c) satélite → `pagoEntregado` `null`; (d) central con cierre `solicitado` → `null`;
  (e) `limite_excedido` y `sinZona` como hoy, sin llamar. **Hecho:** verde; rojo con la mutación
  «sin la puerta `esAccesoTotal`».

## T3 — Integración contra Postgres real (backend_dev) · depende de T2

- [x] **T3.1** Nuevo `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` con
  el corpus y las comprobaciones de `design.md > Verificación` (literales, paridad con
  `verCierreDetalle` y con la página de la cola, alcance, consultas con 1 y 3 nuevos y con solo viejos
  contra T0.4, audiencia, sin escrituras). **Hecho:** verde con base; `describe.skip` visible sin ella.
- [x] **T3.2** Aplicar una a una las mutaciones de `design.md > Verificación` y anotar en
  `progress/impl_SLT-140.md` qué test se pone rojo con cada una (ejecutado, no supuesto; revertir
  antes de seguir). **Hecho:** las seis matadas.

## T4 — Cliente (frontend_dev) · depende de T2.2

- [x] **T4.1** [P] `cierres-resumen-modelo-nuevo-descarga-columnas.ts` y
  `cierres-resumen-modelo-nuevo-descarga.ts` (`design.md > Cliente` y `> Hojas`). Nuevo
  `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`: encabezados de «Cierres»
  (20 central / 19 satélite) y «Por tienda» contra listas literales; celdas del escenario N1 contra
  literales escritos a mano (Folio «ABCD1234», importes como string con `formato: "monto"`, −2260.00 con
  signo, Resuelto vacío en N2, Pagos ajustados vacío sin `senalesCola`); `libroResumenCierres`: `null`
  sin `cifras` o sin nuevos, dos hojas solo nuevos, tres en mixto con «Cierres modelo anterior» =
  columnas marcadas + `filaAnterior`, ningún cierre en dos hojas, error si falta la cifra de un nuevo.
  Si existe la guardia de frontera, añadir los dos módulos. **Hecho:** verde.
- [x] **T4.2** `DescargarCierresButton.tsx` (`obtenerFilasConColumnas`), `CierresAdminModule.tsx` y
  `CierresAdminHistoricoLista.tsx` (constructores con `audiencia`). Nuevo
  `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` con `construirDescarga` espiado:
  (a) solo viejos, en las dos pestañas → la llamada `toEqual` al literal de hoy, sin `tituloHoja` ni
  `hojasAdicionales` (R377); (b) solo nuevos → libro «Cierres» + «Por tienda», `titulo` de hoy; (c) mixto
  con dos columnas desmarcadas → «Cierres modelo anterior» sin ellas y «Cierres» completa; (d) audiencia
  satélite → sin «Pago entregado»; (e) bodega (sin el campo) → como hoy. **Hecho:** verde;
  `tests/components/descarga/CierresDescargaNiveles.test.tsx`, `CierresDescargaColumnas.test.tsx` y
  `CierresDescarga.test.tsx` verdes sin cambiar aserciones.

## T5 — E2E (frontend_dev) · depende de T3 y T4

- [x] **T5.1** Describe nuevo en `e2e/cierres-rediseno.spec.ts` (`design.md > Verificación > E2E`), con
  el escenario en `e2e/_escenarios/cierres.ts` si T0.3 dice que falta. **Hecho:** verde en local con
  base desechable nueva.

## T6 — Cierre (implementer)

- [x] **T6.1** `./init.sh` verde con `INIT_EXIT` anotado; E2E `cierres-rediseno` entero y grupo
  `dinero` verdes en local. **Hecho:** salidas en `progress/impl_SLT-140.md`.
- [x] **T6.2** Si el gate avisa del tamaño en líneas, la decisión de PA4 escrita por el leader en
  `progress/features/SLT-140.md`. **Hecho:** línea `tamano-pr-aceptado` presente o PA4 resuelta.
- [x] **T6.3** Anotar en `progress/features/SLT-140.md` lo que hereda SLT-141 «Excel del modelo nuevo:
  hojas por cierre de bodega» (`design.md > Archivos compartidos`). **Hecho:** líneas escritas.
- [x] **T6.4** Mapa `R → test` en `progress/impl_SLT-140.md`, igual a `## Trazabilidad`. **Hecho:**
  cada R con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R377 | `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` (a, e) · `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` (a) · `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (`null`) · existentes sin cambiar aserciones: `tests/unit/descarga/cierres-admin-descarga-columnas.test.ts`, `tests/components/descarga/CierresDescargaNiveles.test.tsx`, `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` |
| R378 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (`libroResumenCierres`) · `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` (b, c) · `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` (b) · `e2e/cierres-rediseno.spec.ts` (hojas) |
| R379 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (encabezados, folio, fechas, Gestiones, Pagos ajustados) · `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (Gestiones = Σ grupos; Pagos ajustados = cola) |
| R380 | `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (literales, paridad con `verCierreDetalle`, sin escrituras) · `tests/unit/utils/cifras-cierre.test.ts` · `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (celdas, negativo) · `e2e/cierres-rediseno.spec.ts` (números) |
| R381 | `tests/unit/utils/cifras-cierre.test.ts` (sumas) · `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (filas «Por tienda») · `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (paridad de `partesPorTienda`) |
| R382 | `tests/unit/utils/pendiente-cierre.test.ts` (a-e) · `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` (c, d) · `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` (d) · `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (1 200,00; satélite `null`) |
| R383 | `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts` (consultas 1 vs 3 nuevos y solo viejos; alcance en el `WHERE`) · `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` (a, b) |

## Tamaño

**25 archivos** (por debajo del 80 % de 40 = 32): **12 de producción** y **13 de tests** (7 seguros y
6 condicionados a T0.3/T4.2: los dos tests de servicio con dobles de repositorio, el escenario E2E, la
guardia de frontera y los dos tests del «Resumen» de hoy si el cambio de firma de los constructores
los obliga a pasar `audiencia`; sus aserciones no cambian).

Líneas, estimadas: **~450 de producción** (los dos módulos de cliente ~200, servicio ~80, repositorio
~60, `cifras-cierre.ts` ~40 movidas, el resto de 5 a 30) y **~950 de tests** (≈2×: integración ~350,
módulo ~220, componente ~180, servicio ~120, utilidades ~80). **~1 400 líneas, por encima de las 1 000
del gate**: PA4 en `requirements.md`.

## Archivos esperados

Producción:

- `lib/utils/cifras-cierre.ts`
- `lib/utils/pendiente-cierre.ts`
- `lib/services/CierresAdminService.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/interfaces/repositories/ICierresAdminRepository.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/types/cierres-admin.ts`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga.ts`
- `app/(app)/cierres-admin/_components/DescargarCierresButton.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminHistoricoLista.tsx`

Tests:

- `tests/unit/utils/cifras-cierre.test.ts`
- `tests/unit/utils/pendiente-cierre.test.ts`
- `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts`
- `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts`
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`
- `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx`
- `e2e/cierres-rediseno.spec.ts`
- `e2e/_escenarios/cierres.ts`
- `tests/unit/services/cierres-admin-completo.test.ts`
- `tests/unit/services/cierres-admin-filtro-estado.test.ts`
- `tests/unit/guards/cierres-descarga-detallada-frontera.guardia.test.ts`
- `tests/unit/descarga/cierres-admin-descarga-columnas.test.ts`
- `tests/components/descarga/CierresDescargaNiveles.test.tsx`

Dobles de `ICierresAdminRepository` (T2.1, decisión del leader 2026-11-12):

- `tests/unit/services/cierres-admin-ajustar-pago.test.ts`
- `tests/unit/services/cierres-admin-aviso-rechazo.test.ts`
- `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts`
- `tests/unit/services/cierres-admin-corregir-pagos.test.ts`
- `tests/unit/services/cierres-admin-corregir-resultado.test.ts`
- `tests/unit/services/cierres-admin-indemnizacion.test.ts`
- `tests/unit/services/cierres-admin-pendiente.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-admin-tope-sin-gestion.test.ts`
- `tests/unit/services/CierresAdminService.aprobar.devolucion.test.ts`
- `tests/unit/services/indemnizacion-tope-negocio-cierre.test.ts`
- `tests/unit/services/liberacion-al-aprobar-cierre.test.ts`

Estado (no cuentan para el tamaño):

- `progress/impl_SLT-140.md`
- `progress/features/SLT-140.md`
