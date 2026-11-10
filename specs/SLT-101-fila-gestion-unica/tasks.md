# SLT-101 «Fila de gestión única y lista con filtros» — tasks

> 2026-11-09, actualizado con las respuestas de Carlos (S3-1 a S3-6) y su corrección de los filtros.
> Zona **fullstack**: T1 es de `backend_dev` y va **antes** que todo lo de `frontend_dev` (T2-T6),
> porque la pantalla pinta los campos que T1 emite.
>
> `[P]` = paralelizable con la task anterior.
>
> **Tamaño:** 42 archivos y ~2 850 líneas estimadas (límite 40/1 000). Carlos aceptó un solo PR
> (S3-3; marca `tamano-pr-aceptado` en `progress/features/SLT-101.md`, «~43 archivos / ~2 600
> líneas»). El estimado de líneas supera lo aceptado en ~250 (las dos props de la barra de filtros
> y sus tests, por S3-4): el leader se lo dice a Carlos. Si el diff pasa de 44 archivos, el
> implementer para y avisa.
>
> Antes del primer gate:
> - copiar `.env` al worktree (sin él, el gate sale verde saltándose la integración);
> - exportar una base desechable propia antes de cualquier `vitest` (memoria del proyecto);
> - T1 regenera el cliente de Prisma solo si cambia el esquema, y **no cambia**: no correr
>   `prisma generate` (comparte `node_modules` con otros worktrees).
>
> Candado: SLT-102 «Cola de cierres única: mensajeros (central y satélite)» también toca
> `CierresAdminModule.tsx`. Si está en vuelo de otra persona, `docs/equipo.md` decide.
>
> El índice del grafo de este worktree no existe: usar Grep/Read.

## T0 — Comprobaciones previas (sin código de producción)

- [ ] **T0.1** — Censo de lo que hoy lee la fila del detalle del admin, anotado en
  `progress/impl_SLT-101.md`:
  - `grep -l` en `tests/components/` por `<CierresAdminModule` junto con «Órdenes del cierre»,
    «Desglose de ingreso de la orden», «Corregir métodos de pago», «Ajustar pago al mensajero»,
    «Ver evidencia de la orden», «Corregir el resultado de la orden» y las regiones por resultado;
  - `grep -l` en `e2e/` por las mismas regiones y nombres, y por «Ingreso de bodega:», «Nueva
    fecha», «Motivo», «Indemnización» dentro de «Órdenes del cierre» (R87/R88 retirados),
    descartando los que abren bodega o `/cierre-dia`;
  - los consumidores de `IngresoEmpresaDTO`, `CierreDetalleGestion` y `toDetalleDTO` que construyen
    el objeto entero (si alguno deja de compilar con los campos nuevos opcionales, se anota);
  - si `factura-contraste.guardia` ancla líneas de `CierresAdminModule.tsx` que se mueven.

  **Hecho:** la lista coincide con `## Archivos esperados`. Si aparece uno más, se añade y se avisa
  al leader.
- [ ] **T0.2** [P] — Leer y anotar con archivo:línea:
  - servidor: los nombres reales `Zona.nombre`, `GrupoDistritos.nombre`, `Vehiculo.name`; que el
    concepto `tienda_fulfillment` congela `ivaPct` y cómo se serializa (`"13.00"` o `"13"`); qué
    `TarifaConcepto` de cobro corresponde a cada resultado (`tienda_flete_*`); que
    `ajustarPagoMensajeroEnCierre` no toca `gestion_pago_congelado` (ya visto: `CierresAdminRepository.ts:2039-2097`)
    y si `corregirResultadoGestionEnCierre` (`:1884`) re-congela el pago y deja vivos los ajustes;
    el orden de `secuencia` en `orden_fulfillment_movimiento` (cargo/reverso);
  - pantalla: que `EstadoConInfo` pinta el mismo nombre que `RESULTADO_LABEL` y qué clase pide
    `estado-con-info.guardia` para las opciones del filtro; los rótulos de `CAUSA_INCIDENTE_LABEL`;
    que `cierreAbierto` trae `solicitadoAt`; las constantes privadas de `cierre-factura.tsx` que
    hacen falta (se **exportan** sin cambiarlas); que `BuscadorFiltros` con `leerDeUrl={false}` no
    llama a `borrarParams` y que `FilterComponent` con `leerDeUrl={false}` arranca en `{}`.

  **Hecho:** nota en `impl_SLT-101.md`. Si algo contradice el design, se para y se pregunta.
- [ ] **T0.3** [P] — Fijar los literales del E2E (`design.md > Verificación`) contra la siembra
  real de `e2e/_escenarios/cierres.ts`, `reparto.ts` y `_tarifas-activacion-fixture.ts`:
  - escenario A (viejo): cifras de cada tarjeta, «de eso, IVA» y cálculo de la entrega de 70 000 y
    de la devolución; GAM o no GAM; si hay fulfillment;
  - escenario B (nuevo): cobro, IVA incluido, cálculo con su «Tarifa:» (nivel y nombres sembrados),
    pago congelado con su nivel, fulfillment y su cargo;
  - el ajuste 1 500 → 2 200 de `ajuste-pago-mensajero-cierre` (modelo del escenario).

  **Hecho:** tabla entradas → literales con su derivación a mano en `impl_SLT-101.md`, escrita
  **antes** del test.

## T1 — Servidor · `backend_dev` (depende de T0)

- [x] **T1.1** — Campos aditivos y mapper (`design.md > Servidor`):
  - `lib/interfaces/services/ICierreDiaService.ts`: `ivaIncluido`, `fulfillmentConIva`,
    `ivaPctFulfillment`, `fulfillmentCargadoAt`, `conceptosTarifa` en `IngresoEmpresaDTO`;
    `pagoPorTarifa` en `CierreDetalleGestion`; tipos `OrigenTarifaDTO`, `ConceptoTarifaDTO`,
    `PagoPorTarifaDTO`. Todos opcionales;
  - `lib/interfaces/repositories/ICierreDiaRepository.ts`: `pagoPorTarifa?` y `tarifaFaltante?` en
    `CierreGestionPendienteRow`;
  - `lib/repositories/CierresAdminRepository.ts`: select de `conceptos` con nombres de su
    `tarifa_valor` (local al detalle), `pagosCongelados` con `where: { actor: "mensajero" }`, la
    consulta de cargos en el `Promise.all` de `findCierreByIdEnAlcance`, y las derivaciones con
    `Prisma.Decimal` en `toIngresoEmpresa` / `toPendienteRowDesdeSnapshot` (parámetro de cargos
    **opcional**: el detalle de bodega no lo pasa y recibe `null`);
  - `lib/services/CierreDiaService.ts`: `toDetalleDTO` pasa `pagoPorTarifa` y usa
    `g.tarifaFaltante ?? false` cuando no recibe el parámetro (la vista en vivo sigue pasando el
    suyo);
  - `lib/services/CierresAdminService.ts`: `ocultarFulfillmentSiNoCentral` anula también
    `fulfillmentConIva`, `ivaPctFulfillment` y `fulfillmentCargadoAt`.

  **Hecho:** typecheck verde; `git diff db/` vacío; ningún campo existente cambia (R92).
- [x] **T1.2** — `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` (SQL real, base
  desechable) con la siembra y los literales de `design.md > Verificación > Servidor` (R64-R66,
  R92-R96). Y `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` ampliado: la
  satélite recibe `null` en los tres campos de fulfillment y la central los recibe (R94).

  **Hecho:** verdes; las tres mutaciones del `where` del design lo ponen rojo, una por una, anotado
  en `impl_SLT-101.md` con la salida roja; `liquidacion-money-safe` verde.

## T2 — Lógica pura · `frontend_dev` (depende de T1.1)

- [ ] **T2.1** — `components/private/cierres/fila/fila-gestion-vista.ts` y
  `fila-gestion-labels.ts` (`design.md > fila-gestion-vista.ts`).

  **Hecho:** `tests/unit/utils/fila-gestion-vista.test.ts` verde, con literales escritos a mano:
  - señales por audiencia y su orden, incluidas «Sin tarifa de pago»/«Sin tarifa» (R24, R85);
  - 7 filtros «<nombre> <n>», «Todas» primero, «Con señales» con `tono` y conteo por audiencia,
    `filtrar` sin reordenar (R84);
  - columnas por audiencia y con/sin mensajero (R23);
  - tarjetas por audiencia (R25), «Sin dato» con fuente nula, métodos en 0 fuera, fulfillment solo
    central o solo lectura con central (R27, R30); «de eso, IVA» solo con `ivaIncluido` (R93);
    «Se cobró» y la nota con y sin fecha (R94); pago con y sin `pagoPorTarifa`, ajuste «−» y «+»
    (R95, R98);
  - cálculo viejo (GAM, no GAM, pacto, sin pacto, sin comisión, sin tarifa congelada) y nuevo con
    «Tarifa:», «Monto fijo», «<valor> % de <base>», «+ IVA <%> %», y sin nombres (R28, R29, R97);
  - `origenDe` para los tres niveles del canvas y los de PA8;
  - acciones: tabla de R26 × resultado × presencia del callback (R26).

  Mutaciones muertas anotadas: «Con señales» contando todas; fulfillment a la satélite; quitar
  `esMontoCero`.
- [ ] **T2.2** [P] — `detalle-cierre-descarga-columnas.ts`: columna «Señales» al final (R91).
  **Hecho:** `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` afirma las 8 cabeceras
  como literal, «Vuelve a bodega» en una devolución y `null` sin señales;
  `columnas-sensibles.guardia` verde.

## T3 — Componentes · `frontend_dev` (depende de T2)

- [ ] **T3.1** — Props aditivas de la barra de filtros (`design.md > Props aditivas de la barra de
  filtros`): `buscador` en `components/shared/BuscadorFiltros.tsx`; `presentacion` y `tono` en
  `components/shared/FilterComponent.tsx`.
  **Hecho:** `tests/unit/components/buscador-filtros-sin-buscador.test.tsx` y
  `tests/unit/components/filter-component-chips.test.tsx` verdes; **todos** los tests de hoy de
  `BuscadorFiltros`/`FilterComponent` (`buscador-filtros-*`, `filter-component*`) y las guardias
  `filtros-url-r25`, `wallet-barra-unica-467`, `analitica-barra-filtros-sin-solape`,
  `vistas-superficies-declaradas` verdes **sin tocarlos**.
- [ ] **T3.2** [P] — `Cuenta.tsx`: props aditivas `insignia`, `tono`, `vacio`, `aparte`, `notas`,
  `pie`. **Hecho:** `DineroIdentidadesEnPantalla.test.tsx` y los tests de S1 verdes sin tocarlos.
- [ ] **T3.3** — `CalculoCobro.tsx` y `FilaGestion.tsx` (depende de T3.2).
  **Hecho:** `tests/components/FilaGestion.test.tsx` verde, con los dobles y literales del design:
  - fila cerrada por audiencia, «—» en nulos, resultado con su botón de información (R86);
  - desplegar: solo Orden, Producto, Dirección (R25; ningún «Indemnización», «Ingreso de bodega»,
    «Nueva fecha» ni «Motivo»);
  - las cuatro tarjetas por audiencia (R25) con su cascada y «Sin dato» (R27); «de eso, IVA» (R93);
    pago «Por tarifa · precio propio del mensajero», «− Ajuste», «Ajustado», motivo y ajustó (R98);
    fulfillment «Se cobró» y su nota (R30, R94);
  - «Ver cómo se calculó» abre y pliega (`aria-expanded`), viejo y nuevo, con la nota fecha y hora
    (R28, R29, R97);
  - acciones y sus callbacks (R26); nombres accesibles de R89;
  - paridad con la fila vieja: pacto especial, sin pacto, sin comisión, sin tarifa congelada,
    varias evidencias.
- [ ] **T3.4** — `GestionesCierre.tsx` (depende de T3.1, T3.3). **Hecho:**
  `tests/components/DetalleCierreGestiones.test.tsx` verde:
  - sin campo de búsqueda; grupo «Filtrar por resultado» con «Todas <n>» activo al abrir; elegir
    «Entregado <n>» y «Con señales <n>» filtra; estado vacío con texto (R84, R89);
  - filtrar no llama a `router.replace`/`push` (doble del router) (R84);
  - «Descargar» en la misma fila (R90); columna «Mensajero» con `columnaMensajero` (R23).

## T4 — Montaje en `/cierres-admin` · `frontend_dev` (depende de T3)

- [ ] **T4.1** — `CierresAdminModule.tsx` monta `GestionesCierre` (`design.md > Montaje`); deja de
  importar `GestionesPorResultado`; `SeccionSinGestion` debajo. Exportar de `cierre-factura.tsx` lo
  anotado en T0.2, sin cambiar su cuerpo.
  **Hecho:** typecheck verde; `git diff` de `cierre-factura.tsx` = solo `export`;
  `CierresBodegaAdminModule.tsx` y `CierreDiaModule.tsx` sin cambios.
- [ ] **T4.2** — Ampliar `tests/components/CierresAdminDetalleUnico.test.tsx` (central y satélite):
  lista nueva con filtros; la satélite no ve Fulfillment ni «Corregir métodos de pago» ni «Corregir
  el resultado» (R90, R26, R30); «Ajustar pago» / «Corregir el resultado» abren el diálogo de hoy
  con esa gestión; «Descargar» y «Pasaron a Novedad interna» (R19, R90).
  **Hecho:** verde; la mutación «audiencia satélite pasada como central» lo pone rojo.

## T5 — Tests y guardias que cambian · `frontend_dev` (depende de T4.1)

- [ ] **T5.1** — Adaptar, sin quitar lo que vigilan (`design.md > Tests y guardias que cambian`):
  `CierresAdminModule`, `cierre-detalle-ajuste-badge`, `CorregirResultadoCierre` y los que añada
  T0.1. **Hecho:** verdes; en `impl_SLT-101.md`, una línea por archivo «antes leía X, ahora lee Y».
- [ ] **T5.2** [P] — Guardias: `estado-con-info` (excepción `recuento` con motivo),
  `liquidacion-money-safe` (censo con `fila/`), `factura-contraste` (anclas, si T0.1 lo pidió).
  **Hecho:** `pnpm run test:guardias` verde; contraprueba: pintar `{RESULTADO_LABEL[r]}` en la
  celda de la fila pone rojo `estado-con-info`.

## T6 — E2E · `frontend_dev` (depende de T4, T5)

- [ ] **T6.1** — `e2e/cierres-rediseno.spec.ts`: `describe` de S3 con central A, satélite A y
  central B (con las cifras de R64-R66), la descarga con «Señales» y la URL intacta tras filtrar,
  con los literales de T0.3 escritos a mano (R77).
  **Hecho:** verde dos veces seguidas en base desechable nueva, con `NEXT_PUBLIC_APP_URL` como en
  `gate.yml`; la mutación «Fulfillment a la satélite» lo pone rojo.
- [ ] **T6.2** — Adaptar a la fila nueva, mismos literales: `cierres-admin`,
  `ajuste-pago-mensajero-cierre` (la parte del detalle de mensajero), `cierres-admin-rechazos-sla`,
  `cierre-modelo-nuevo-plan-porcentual`, `tarifas-activacion` («Total cobrado» → «Se le cobra»;
  retirar las dos aserciones de «Ingreso de bodega:» por fila, S3-2, con la línea de motivo).
  **Hecho:** verdes; una línea por archivo en `impl_SLT-101.md`.
- [ ] **T6.3** — `pnpm exec playwright test --project=dinero` completo, más `cierre-bodega-satelite`
  (no cambia). **Hecho:** dos corridas seguidas sin rojos ni inestables, salida en
  `impl_SLT-101.md`.

## T7 — Cierre

- [ ] **T7.1** — `./init.sh` verde, con `INIT_EXIT` escrito dentro del log. **Hecho:**
  - sin rojos; el aviso de tamaño, aceptado (S3-3);
  - `git diff db/` vacío y ninguna Server Action de escritura tocada (R72);
  - `grep -E "Number\(|parseFloat|toFixed"` vacío en `components/private/cierres/` (R71).

## Trazabilidad

| R | Test previsto |
|---|---|
| R22 | `tests/components/FilaGestion.test.tsx` (una fila, cuatro audiencias); `CierresAdminDetalleUnico.test.tsx` |
| R23 | `tests/unit/utils/fila-gestion-vista.test.ts` (`columnasDe`); `DetalleCierreGestiones.test.tsx`; E2E central A |
| R24 | `fila-gestion-vista.test.ts` (`senalesDe`); `FilaGestion.test.tsx` (celda vacía) |
| R25 | `fila-gestion-vista.test.ts` (`tarjetasDe` × audiencia); `FilaGestion.test.tsx` (cabecera de tres datos); E2E central A y satélite A |
| R26 | `fila-gestion-vista.test.ts` (`accionesDe`); `FilaGestion.test.tsx`; `CierresAdminDetalleUnico.test.tsx`; `CorregirResultadoCierre.test.tsx`; `cierre-detalle-ajuste-badge.test.tsx`; E2E satélite A |
| R27 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx` (cascadas, «Sin dato»); E2E central A/B, ajuste |
| R28 | `FilaGestion.test.tsx` (abre y pliega); E2E central A |
| R29 | `fila-gestion-vista.test.ts` (`calculoDe` viejo); `FilaGestion.test.tsx`; E2E central A |
| R30 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx`; `CierresAdminDetalleUnico.test.tsx`; E2E satélite A |
| R64 | `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` (`conceptosTarifa`); `FilaGestion.test.tsx`; E2E central B |
| R65 | `cierre-detalle-cifras-fila-sql-real.test.ts` (`ivaIncluido`, `fulfillmentConIva`, `fulfillmentCargadoAt`); `FilaGestion.test.tsx`; E2E central A/B |
| R66 | `cierre-detalle-cifras-fila-sql-real.test.ts` (`pagoPorTarifa`, ajuste, `tarifaFaltante`); `FilaGestion.test.tsx`; E2E central B, ajuste |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (censo con `fila/`); grep de T7.1 |
| R72 | revisión del diff en T7.1 (`db/` vacío) |
| R77 | `e2e/cierres-rediseno.spec.ts` (central A y B, satélite A); `e2e/ajuste-pago-mensajero-cierre.spec.ts` |
| R84 | `fila-gestion-vista.test.ts` (`filtrosDe`, `filtrar`); `DetalleCierreGestiones.test.tsx` (sin buscador, sin navegación); `filter-component-chips.test.tsx`; `buscador-filtros-sin-buscador.test.tsx`; E2E central A (conteos, URL intacta) |
| R85 | `fila-gestion-vista.test.ts` (texto por audiencia y orden); E2E central A |
| R86 | `FilaGestion.test.tsx` («—» y botón de información); `estado-con-info.guardia.test.ts` |
| R89 | `FilaGestion.test.tsx`; `DetalleCierreGestiones.test.tsx` (grupo y `aria-pressed`); `CierresAdminModule.test.tsx`; E2E adaptados |
| R90 | `CierresAdminDetalleUnico.test.tsx`; E2E central A y satélite A |
| R91 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`; E2E central A (xlsx) |
| R92 | `cierre-detalle-cifras-fila-sql-real.test.ts` (strings escala 2); `liquidacion-money-safe.test.ts`; T1.1 (`git diff db/` vacío) |
| R93 | `cierre-detalle-cifras-fila-sql-real.test.ts` (`"520.00"`); `fila-gestion-vista.test.ts` (línea solo si no nulo); `FilaGestion.test.tsx` |
| R94 | `cierre-detalle-cifras-fila-sql-real.test.ts` (cargo vigente, reverso → `null`, otra orden no se cuela); `cierres-admin-fulfillment-solo-central.test.ts` (satélite `null`); `FilaGestion.test.tsx` (nota con y sin fecha) |
| R95 | `cierre-detalle-cifras-fila-sql-real.test.ts` (solo actor mensajero; ajuste `resta` 700,00); `fila-gestion-vista.test.ts` (viejo sin «Por tarifa»; «+ Ajuste») |
| R96 | `cierre-detalle-cifras-fila-sql-real.test.ts` (nuevo sin fila → `true`; con fila → `false`); `fila-gestion-vista.test.ts` (señal por audiencia) |
| R97 | `fila-gestion-vista.test.ts` (`calculoDe` nuevo, `origenDe`, sin nombres); `FilaGestion.test.tsx` (nota con hora); E2E central B |
| R98 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx` (cascada del canvas); E2E ajuste |

R87 y R88 están retirados (S3-2, PA6): sin test; T3.3 afirma su **ausencia** en la cabecera.

## Archivos esperados

Servidor (cambian):
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierreDiaService.ts`

Pantalla (nuevos):
- `components/private/cierres/fila/GestionesCierre.tsx`
- `components/private/cierres/fila/FilaGestion.tsx`
- `components/private/cierres/fila/CalculoCobro.tsx`
- `components/private/cierres/fila/fila-gestion-vista.ts`
- `components/private/cierres/fila/fila-gestion-labels.ts`

Pantalla (cambian):
- `components/shared/BuscadorFiltros.tsx`
- `components/shared/FilterComponent.tsx`
- `components/private/cierres/detalle/Cuenta.tsx`
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`

Tests nuevos:
- `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts`
- `tests/unit/utils/fila-gestion-vista.test.ts`
- `tests/unit/components/buscador-filtros-sin-buscador.test.tsx`
- `tests/unit/components/filter-component-chips.test.tsx`
- `tests/components/FilaGestion.test.tsx`
- `tests/components/DetalleCierreGestiones.test.tsx`

Tests que se adaptan:
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/cierre-detalle-ajuste-badge.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/unit/guards/estado-con-info.guardia.test.ts`
- `tests/unit/guards/liquidacion-money-safe.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`

E2E:
- `e2e/cierres-rediseno.spec.ts`
- `e2e/cierres-admin.spec.ts`
- `e2e/ajuste-pago-mensajero-cierre.spec.ts`
- `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts`
- `e2e/tarifas-activacion.spec.ts`

Spec y progreso:
- `specs/SLT-101-fila-gestion-unica/requirements.md`
- `specs/SLT-101-fila-gestion-unica/design.md`
- `specs/SLT-101-fila-gestion-unica/tasks.md`
- `progress/features/SLT-101.md`
- `progress/impl_SLT-101.md`

Total: 42 (5 servidor, 11 pantalla, 6 tests nuevos, 9 adaptados, 6 E2E, 5 spec y progreso).
