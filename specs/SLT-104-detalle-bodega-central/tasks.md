# SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — tasks

> 2026-11-10. Zona **frontend**; si Carlos responde «sí» a PA1 o a PA3, **fullstack** y T1
> (servidor, `backend_dev`) va **antes** que T2-T6. Las filas marcadas «(PA1)» o «(PA3)» se borran
> antes de empezar si la respuesta es «no».
>
> `[P]` = paralelizable con la task anterior.
>
> **Tamaño:** ~42 archivos y ~2 700 líneas con PA1 y PA3 (PA1 suma 6 archivos, PA3 otros 6); ~30
> archivos y ~1 900 líneas sin ellas (límite 40). La mitad son tests y E2E que hoy abren el modal de bodega y leen sus paneles. Regla de
> Carlos «no partir» (S4-3): falta su marca `tamano-pr-aceptado` en `progress/features/SLT-104.md`
> (PA4). Si el diff pasa de 46 archivos, el implementer para y avisa.
>
> Antes del primer gate:
> - copiar `.env` al worktree (sin él, el gate sale verde saltándose la integración);
> - exportar una base desechable propia antes de cualquier `vitest` (memoria del proyecto);
> - no correr `prisma generate`: el esquema no cambia y `node_modules` es compartido.
>
> Candado: SLT-105 «Cola de bodega de la central: Por conciliar y Conciliados» tocará
> `CierresBodegaAdminModule.tsx` (depende de esta); SLT-107 «Bodega satélite: Solicitados y su
> cierre de bodega en lectura» tocará `detalle-cierre-vista.ts` y `CierresBodegaAdminService.ts`
> (PA3); SLT-111 «Cifras del servidor: reparto en % y señales de la cola» toca
> `CierresAdminRepository.ts` / `CierresAdminService.ts` (PA1). `docs/equipo.md` decide si van a la
> vez.
>
> El índice del grafo de este worktree no existe: usar Grep/Read.

## T0 — Comprobaciones previas (sin código de producción)

- [x] **T0.1** — Censo, anotado en `progress/impl_SLT-104.md`:
  - `grep -l` en `tests/` por `<CierresBodegaAdminModule` junto con «Detalle del cierre de bodega»,
    «Totales del cierre de bodega», «Cierre del día · », «Órdenes del cierre · »,
    «Lo que va a la central · », «Con ajustes», «Conciliación del cierre de bodega»,
    «Ver / decidir el cierre de bodega»: qué archivo cambia y cuál sigue verde sin tocarlo (los que
    solo hacen `vi.mock` de `verCierreBodegaDetalle` no cambian);
  - `grep -l` en `e2e/` por las mismas regiones y por `dialog", { name: "Detalle del cierre de
    bodega"` (hoy: `cierre-bodega-satelite`, `ajuste-pago-mensajero-cierre`);
  - qué miran de `CierresBodegaAdminModule.tsx` las guardias `cascada-central-en-las-dos-pantallas`,
    `cierre-bodega-vocabulario`, `superficie-de-uso`, `contadores-cabecera`,
    `paginacion-transversal` y `liquidacion-money-safe`, y cuáles se ponen rojas al quitar el modal;
  - quién importa en `app/` `lineasCascadaDueno`, `CascadaDinero`, `TotalesIngresoPanel`,
    `GestionesPorResultado` y `DesglosePorTienda` fuera de `CierresBodegaAdminModule` (si nadie,
    `@sin-superficie`).

  **Hecho:** la lista coincide con `## Archivos esperados`; los de más se añaden y se avisa al
  leader.
- [x] **T0.2** [P] — Leer y anotar con archivo:línea:
  - que `DetalleCierre` con `tipo="bodega"` y `acciones.conciliacion` pinta el nodo en el pie en el
    orden de `accionesDe` (decidir: «Cerrar» + conciliación; solo lectura: conciliación + «Cerrar»);
  - que `GestionesCierre` con `audiencia="solo lectura"`, `columnaMensajero` y `acciones={}` no
    ofrece corregir ni ajustar y sí evidencia y fulfillment con `quienMiraEsCentral`;
  - (PA1) dónde se acota hoy por **empresa** la lectura de `cierre_dia` en
    `CierresAdminRepository.findCierreByIdEnAlcance` (cliente por empresa, RLS o `WHERE`), y qué
    Server Actions de escritura resuelven su propio alcance (deben seguir dando `no_encontrada` a un
    cierre de satélite);
  - (PA3) si `cd.resumen` de `CierresBodegaAdminService.verCierreBodegaDetalle` ya trae el
    `solicitadoAt` del cierre del día o hay que pedirlo en `CierreBodegaRepository`.

  **Hecho:** nota en `impl_SLT-104.md`. Si algo contradice el design, se para y se pregunta.
- [x] **T0.3** [P] — Fijar los literales del E2E y de los tests contra la siembra real de
  `e2e/cierre-bodega-satelite.spec.ts` (modelo viejo: recaudado 9.000, pago 1.500, gana la bodega
  satélite 500, debe llegar a la central 7.000; Le queda a la empresa y «Total facturado» por
  calcular a mano con la tarifa del escenario), de `ajuste-pago-mensajero-cierre.spec.ts` (pago
  1.800, a la central 7.200) y del escenario B de `cierres-rediseno.spec.ts` consolidado (modelo
  nuevo), y lo que pinta `money()` para cada uno.

  **Hecho:** tabla entradas → literales con su derivación a mano en `impl_SLT-104.md`, escrita
  **antes** de los tests. Ningún literal se copia de la salida de la pantalla.

## T1 — Servidor (solo PA1 y PA3) · `backend_dev` (depende de T0)

- [x] **T1.1** (PA1) — Alcance de **lectura** del detalle para acceso total en
  `CierresAdminService.verCierreDetalle` y `CierresAdminRepository.findCierreByIdEnAlcance`
  (`design.md > Lectura de un cierre del día de la satélite`), sin tocar `alcanceWhere` ni ningún
  otro método.
  **Hecho:** typecheck verde; `git diff db/` vacío; ningún método de escritura cambiado.
- [x] **T1.2** (PA1) — `tests/integration/db/cierre-detalle-central-lee-satelite-sql-real.test.ts`
  (base real): la central lee un cierre del día de satélite de su empresa; no lee uno de otra
  empresa; el adminSatelite de otra zona sigue sin leerlo. Y
  `tests/unit/services/cierres-admin-detalle-lectura.test.ts`: las listas y una Server Action de
  escritura (p. ej. aprobar) siguen con el alcance `bodega_central`.
  **Hecho:** verdes; la mutación «quitar el filtro de empresa» pone rojo el de integración y
  «ensanchar `alcanceWhere`» pone rojo el de servicio.
- [x] **T1.3** (PA3) [P] — `solicitadoAt` aditivo en `CierreBodegaDetalleCierre`, poblado en
  `CierresBodegaAdminService` (y `CierreBodegaRepository` si T0.2 lo pide). Caso en
  `tests/unit/services/cierres-bodega-admin-service.test.ts`: cada cierre lleva SU `solicitadoAt`,
  no el del cierre de bodega.
  **Hecho:** verde; la mutación «usar el `solicitadoAt` de la cabecera» lo pone rojo.

## T2 — Lógica pura · `frontend_dev` (depende de T0; de T1 si PA1/PA3)

- [x] **T2.1** — `detalle-cierre-labels.ts` (textos nuevos en «tú»: columnas de «Mensajeros»,
  «Ver su cierre», nombre accesible «Ver el cierre de <mensajero>», «Marcó:», «Aún nadie», título
  «Conciliación», región «Mensajeros del cierre de bodega») y `detalle-cierre-vista.ts`
  (`DetalleBodegaVista.montoRecibido`, `modoBodegaDe`, `gestionesDeBodega`, `filasMensajeros`,
  `cuentaConciliacion`, `marcaConciliacion`; conteo de la pestaña por PA2); `LineaCuenta.sinImporte`
  y su pintado en `Cuenta.tsx`; variante con «Mensajero» en `detalle-cierre-descarga-columnas.ts`;
  (PA3) `ItemGestion.congeladoAt?` y su uso en `GestionesCierre.tsx`.
  **Hecho:** typecheck verde; ni `Number(`, ni `parseFloat`, ni `toFixed` en los archivos tocados.
- [x] **T2.2** — `tests/unit/utils/detalle-cierre-vista.test.ts` (ampliar) con literales:
  `modoBodegaDe` (pendiente → decidir; recibido e incompleto → solo lectura); `gestionesDeBodega`
  (orden por resultado y dentro por `cierres[]`, con su mensajero); `filasMensajeros` (orden del
  servidor, conteo de gestiones, «2 pagos ajustados», «1 pago ajustado», «—» con 0 y sin el campo,
  `href` = `/cierres-admin?cierre=<id>`); `cuentaConciliacion` (sin marca: línea «Recibido» con
  `sinImporte`; con marca: los tres strings tal cual, incluido un `faltaPorRecibir` negativo);
  `marcaConciliacion` («Aún nadie» y nombre · fecha); pestaña «Mensajeros (2)» con dos cierres del
  mismo mensajero (PA2). Y `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
  (ampliar): la variante de bodega lleva «Mensajero» tras «Tienda» y las de mensajero no cambian.
  **Hecho:** verdes; la mutación «`conteos.mensajeros` en la pestaña» y «`"0.00"` sin marca» los
  ponen rojos.

## T3 — Componentes · `frontend_dev` (depende de T2)

- [x] **T3.1** — `MensajerosCierreBodega.tsx` y `ConciliacionCierreBodega.tsx`
  (`design.md > Componentes nuevos`).
  **Hecho:** typecheck y lint verdes.
- [x] **T3.2** — `tests/components/DetalleCierreBodega.test.tsx` con dobles y literales: el
  `DetalleCierre` tipo bodega con los dos slots nuevos; «Mensajeros» (filas, importes con `money()`
  a la derecha, señales, nombre accesible de «Ver su cierre» y que pulsarlo llama a `onVerSuCierre`
  con el `href`); «Conciliación» sin marca («—», «Aún nadie», «Falta por recibir» = declarado) y con
  marca; `data-signo` de las tres líneas; ningún «₡0» en «Recibido» sin marca.
  **Hecho:** verde; la mutación «pintar `money(monto)` con `sinImporte`» lo pone rojo.

## T4 — Montaje · `frontend_dev` (depende de T3)

- [x] **T4.1** — `CierresBodegaAdminModule.tsx` monta `DetalleCierre` tipo bodega
  (`design.md > Montaje`); quita el `Modal` y sus piezas; conserva `abrirDetalle`, sus avisos,
  `refrescarListas` y el visor. Anotaciones `@sin-superficie` que pida T0.1.
  **Hecho:** typecheck verde; `git diff` de `CierresBodegaResueltosLista.tsx`,
  `CierresBodegaSolicitadosLista.tsx`, `ConsolidacionBodegaModule.tsx`, `CierresTabs.tsx`,
  `cierre-factura.tsx` y `components/shared/conciliacion/` vacío.
- [x] **T4.2** (PA1) — `CierresAdminModule.tsx`: un cierre con `destinoTipo = "bodega_satelite"`
  abierto por la central se pinta en solo lectura, filas «solo lectura», sin «Pago al mensajero» ni
  acciones (R116). Caso en `tests/components/CierresAdminDeepLink.test.tsx`: `?cierre=<id de
  satélite>` abre el detalle sin «Aprobar», «Rechazar», «Ajustar pago» ni la pestaña de pago.
  **Hecho:** verde; la mutación «sin el forzado» lo pone rojo.
- [x] **T4.3** — `tests/components/CierresBodegaAdminDetalleUnico.test.tsx` (`design.md >
  Verificación`, «Módulo»).
  **Hecho:** verde; las mutaciones «modo decidir para un recibido», «audiencia central en la fila»
  y «no cerrar tras marcar» lo ponen rojo.

## T5 — Tests y guardias que cambian · `frontend_dev` (depende de T4.1)

- [ ] **T5.1** — Adaptar, sin quitar lo que vigilan, los tests de componentes de T0.1 (lista en
  `## Archivos esperados`), con los **mismos importes**: agregado → «Dinero»/cifras; cada cierre del
  día → su fila de «Mensajeros»; gestiones → «Gestiones». Lo que vigilaban de cada cierre del día y
  el detalle de bodega ya no pinta se lleva al detalle de mensajero (PA1 = a) o se anota como
  vigilancia retirada con su motivo.
  **Hecho:** verdes; en `impl_SLT-104.md`, una línea por archivo «antes leía X, ahora lee Y».
- [ ] **T5.2** [P] — Guardias: `cierre-bodega-vocabulario` (censo ampliado a los dos `.tsx` nuevos;
  autocomprobación apuntada a ellos; los cuatro censos sin aflojar), `cascada-central-en-las-dos-
  pantallas` (verde sin cambios o ajustada según T0.1), `superficie-de-uso`, y
  `liquidacion-money-safe` (sin cambios: el censo ya cubre `components/private/cierres/`).
  **Hecho:** `pnpm run test:guardias` verde; contrapruebas: un `Number(f.recaudado)` en
  `MensajerosCierreBodega.tsx` pone rojo `liquidacion-money-safe`, y un literal «Aprobado» en
  `ConciliacionCierreBodega.tsx` pone rojo `cierre-bodega-vocabulario`.

## T6 — E2E · `frontend_dev` (depende de T4, T5)

- [ ] **T6.1** — Helper `solicitarCierreBodega` en `e2e/_escenarios/cierres.ts`. Adaptar
  `e2e/cierre-bodega-satelite.spec.ts` (pasos 2 y 3) y `e2e/ajuste-pago-mensajero-cierre.spec.ts`
  (paso satélite) al detalle único (`design.md > Tests y guardias que cambian`), con los literales
  de T0.3 escritos a mano: cuatro cifras, «Mensajeros», «Conciliación» antes y después de marcar.
  **Hecho:** verdes dos veces seguidas en base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en
  `gate.yml`; la mutación «“—” → “₡0,00” sin marca» lo pone rojo.
- [ ] **T6.2** — `describe` S6 en `e2e/cierres-rediseno.spec.ts`: cierre de bodega del modelo nuevo
  (R77) con sus cuatro cifras, «Mensajeros» y «Conciliación» al céntimo; (PA1) «Ver su cierre»
  abre el detalle del cierre del día en solo lectura.
  **Hecho:** verde dos veces seguidas.
- [ ] **T6.3** — `pnpm exec playwright test --project=dinero` completo, más
  `cierre-bodega-satelite` y `ajuste-pago-mensajero-cierre`.
  **Hecho:** dos corridas seguidas sin rojos ni inestables, salida en `impl_SLT-104.md`.

## T7 — Cierre

- [ ] **T7.1** — `./init.sh` verde, con `INIT_EXIT` escrito dentro del log:
  - sin rojos nuevos; el aviso de tamaño, aceptado (PA4);
  - `git diff db/` vacío y ninguna Server Action de escritura tocada (R72);
  - `grep -E "Number\(|parseFloat|toFixed"` vacío en los archivos de `components/private/cierres/`
    tocados (R71).
- [ ] **T7.2** — Preview para Carlos (memoria del proyecto): capturas de «Central 8» y «Central 9»
  junto al canvas, cada pestaña, con la lista «Para el Preview» de `requirements.md` y PA5.

## Trazabilidad

| R | Test previsto |
|---|---|
| R31 | `CierresBodegaAdminDetalleUnico.test.tsx` (la fila no ofrece «Ajustar pago» ni «Corregir…»; sí «Ver evidencia»); `CierreBodegaDetalleGestiones.test.tsx`; E2E `ajuste-pago-mensajero-cierre` (sin «Ajustar pago» en bodega) |
| R40 | `CierresBodegaAdminDetalleUnico.test.tsx` (`dialog` del detalle único, sin el `Modal` viejo); E2E `cierre-bodega-satelite` paso 2 |
| R41 | `detalle-cierre-vista.test.ts` (`gestionesDeBodega`); `CierreBodegaDetalleGestiones.test.tsx` (columna Mensajero, gestiones de los dos cierres); E2E `cierre-bodega-satelite` |
| R42 | `detalle-cierre-vista.test.ts` (`filasMensajeros`); `DetalleCierreBodega.test.tsx`; `cierre-detalle-ajuste-badge.test.tsx`; E2E `ajuste-pago-mensajero-cierre` |
| R43 | `detalle-cierre-vista.test.ts` (`cuentaConciliacion`, `marcaConciliacion`); `DetalleCierreBodega.test.tsx`; E2E `cierre-bodega-satelite` (antes y después de marcar) |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (contraprueba en T5.2); grep de T7.1 |
| R72 | revisión del diff en T7.1 (`db/` vacío, sin Server Actions de escritura) |
| R77 | E2E `cierre-bodega-satelite` (modelo viejo) y `cierres-rediseno` `describe` S6 (modelo nuevo), literales de T0.3 |
| R111 | `detalle-cierre-vista.test.ts` (`modoBodegaDe`); `CierresBodegaAdminDetalleUnico.test.tsx` (Ver / decidir → decidir; Ver de Resueltos → solo lectura; pastilla) |
| R112 | `CierresBodegaAdminDetalleUnico.test.tsx` (orden del pie, sin permiso solo «Cerrar», tras marcar cierra y relee); `CierresBodegaAdminRefresco.test.tsx`; E2E `cierre-bodega-satelite` |
| R113 | `CierresBodegaAdminDetalleUnico.test.tsx` (solo lectura, fulfillment, evidencia, «Descargar»); `detalle-cierre-descarga-columnas.test.ts`; `detalle-cierre-vista.test.ts` (orden) |
| R114 | `detalle-cierre-vista.test.ts`; `DetalleCierreBodega.test.tsx` (importes a la derecha, «—»); `CierreBodegaDetalleCascadas.test.tsx` (A la central por cierre con los importes de hoy) |
| R115 (PA1) | `DetalleCierreBodega.test.tsx` (`onVerSuCierre` con el `href`); `CierresBodegaAdminDetalleUnico.test.tsx` (cierra y navega); E2E `cierres-rediseno` S6 |
| R116 (PA1) | `tests/integration/db/cierre-detalle-central-lee-satelite-sql-real.test.ts`; `tests/unit/services/cierres-admin-detalle-lectura.test.ts`; `CierresAdminDeepLink.test.tsx` |
| R117 | `detalle-cierre-vista.test.ts`; `DetalleCierreBodega.test.tsx` (`data-signo`, «—», «Aún nadie», negativo con signo) |
| R118 | `CierresBodegaAdminDetalleUnico.test.tsx` (sin «Totales del cierre de bodega», «Cierre del día · X» ni `Modal` viejo); T4.1 (`git diff` de la cola vacío) |
| R119 | `CierresBodegaAdminDetalleUnico.test.tsx` (nombre del `dialog`; `no_encontrada` → toast y relectura, sin detalle; `forbidden`) |
| R120 (PA3) | `cierres-bodega-admin-service.test.ts` (su `solicitadoAt`); `CierreBodegaDetalleGestiones.test.tsx` (la nota con la fecha de su cierre del día; sin PA3, sin fecha) |
| R121 | `detalle-cierre-vista.test.ts` (dos cierres del mismo mensajero → «Mensajeros (2)»); `DetalleCierreBodega.test.tsx` |

## Archivos esperados

Pantalla (nuevos):
- `components/private/cierres/detalle/MensajerosCierreBodega.tsx`
- `components/private/cierres/detalle/ConciliacionCierreBodega.tsx`

Pantalla (cambian):
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/detalle/Cuenta.tsx`
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`
- `components/private/cierres/fila/fila-gestion-vista.ts` (PA3)
- `components/private/cierres/fila/GestionesCierre.tsx` (PA3)
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cascadas-bodega.ts` (`@sin-superficie`, si T0.1 lo pide)
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` (PA1)

Servidor (solo PA1 / PA3):
- `lib/services/CierresAdminService.ts` (PA1)
- `lib/repositories/CierresAdminRepository.ts` (PA1)
- `lib/interfaces/services/ICierreBodegaService.ts` (PA3)
- `lib/services/CierresBodegaAdminService.ts` (PA3)
- `lib/repositories/CierreBodegaRepository.ts` (PA3, si T0.2 lo pide)

Tests nuevos:
- `tests/components/DetalleCierreBodega.test.tsx`
- `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
- `tests/integration/db/cierre-detalle-central-lee-satelite-sql-real.test.ts` (PA1)
- `tests/unit/services/cierres-admin-detalle-lectura.test.ts` (PA1)

Tests que se adaptan (candidatos; T0.1 confirma):
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts` (PA3)
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierresBodegaAdminRefresco.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx` (PA1)
- `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`
- `tests/unit/guards/superficie-de-uso.guardia.test.ts`

E2E:
- `e2e/_escenarios/cierres.ts`
- `e2e/cierre-bodega-satelite.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/cierres-rediseno.spec.ts`

Spec y progreso:
- `specs/SLT-104-detalle-bodega-central/requirements.md`
- `specs/SLT-104-detalle-bodega-central/design.md`
- `specs/SLT-104-detalle-bodega-central/tasks.md`
- `progress/features/SLT-104.md`
- `progress/impl_SLT-104.md`
