# SLT-111 «Cifras del servidor: reparto en % y señales de la cola» — tasks

> Reparto: `backend_dev` T0-T4; `frontend_dev` T5-T6. Antes del primer gate, copiar `.env` al
> worktree (sin él la integración se salta y el gate sale verde a ciegas). Base desechable para
> integración y E2E, nunca la de desarrollo. Antes de cualquier `vitest`, exportar la base desechable.

## T0 — Comprobaciones previas (backend_dev)

- [x] **T0.1** Confirmar en `origin/dev` (`git fetch` + `git grep`) que nadie emite ya
  `porcentajesReparto` en `lib/` ni existe `lib/utils/porcentajes-reparto.ts`, y que las señales de la
  cola (SLT-102) siguen como dice `design.md > Lo que ya existe`. **Hecho:** resultado anotado en
  `progress/impl_SLT-111.md`; si ya está, PARA y avisa al leader.
- [x] **T0.2** Recalcular a mano los literales de `design.md > Servidor 1` y del corpus de
  integración (con `pagoTiendaEmpresa`, `cobradoSobreRecaudado` y `paraLaCentral` leídas, no
  ejecutadas) y fijar la siembra exacta de MA, MB y MC (tarifa congelada que da esos importes).
  **Hecho:** anotados en `progress/impl_SLT-111.md`; si alguno no casa,
  PARA y reporta (no se cambia el literal para que pase).
- [x] **T0.3** Medir en `dev`, antes de tocar nada, el número de sentencias SQL de `verCierreDetalle`
  con 1 y con 3 gestiones y de `verCierreBodegaDetalle` con 1 y con 2 cierres del día (espía de
  `_postgres-real`). **Hecho:** anotado; si ya difieren por tamaño (N+1 previo), PARA y avisa: R265 se
  reescribe, no se arregla aquí.
  > 2026-11-12 backend_dev: mensajero sin N+1 (MA = MB). Bodega con N+1 PREVIO en
  > `findCierreBodegaConDetalle` (BX 40, BY 24 sentencias): ABIERTO para el leader en
  > `progress/impl_SLT-111.md > T0.3`; el test afirma servicio = repositorio (el reparto no añade lecturas).

## T1 — La regla (backend_dev) · depende de T0

- [x] **T1.1** Crear `lib/utils/porcentajes-reparto.ts` con la firma y el algoritmo de
  `design.md > Servidor 1` (`Prisma.Decimal`, céntimos, `divToInt`/`mod`; sin `Number(`,
  `parseFloat(`, `Math.round` ni división decimal). **Hecho:** typecheck y lint verdes.
- [x] **T1.2** `tests/unit/utils/porcentajes-reparto.test.ts` con todas las filas de la tabla de
  literales (escritas a mano), suma 100 en los no nulos y orden de salida = orden de entrada.
  **Hecho:** verde; y rojo con cada mutación de T4.1 (1-4).

## T2 — Emitirlo en los dos detalles (backend_dev) · depende de T1

- [x] **T2.1** `ICierresAdminService.ts` y `ICierresBodegaAdminService.ts`: `porcentajesReparto?:
  number[] | null` en la rama `ok` del detalle, con su doc (`design.md > Contratos I/O`).
- [x] **T2.2** `CierresAdminService.verCierreDetalle` emite
  `porcentajesReparto([pagoTienda, cobradoSobreLoRecaudado], resumen.totales.general)`;
  `CierresBodegaAdminService.verCierreBodegaDetalle` emite
  `porcentajesReparto([resumen.paraLaCentral, resumen.totalPagoMensajero,
  resumen.totalIngresoBodegaRechazos], resumen.totales.general)`. Sin lecturas nuevas.
  **Hecho:** typecheck verde; los tests existentes de los dos servicios
  (`tests/unit/services/cierres-admin-service.test.ts`, `cierres-admin-detalle-lectura.test.ts`,
  `cierres-bodega-admin-service.test.ts`) verdes sin cambiar sus aserciones; `liquidacion-money-safe`
  verde.

## T3 — Integración contra Postgres real (backend_dev) · depende de T2

- [x] **T3.1** Nuevo `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` con el corpus
  y las aserciones de `design.md > Verificación > Integración` (MA [94, 6]; MB [89, 11] para la central
  y para el adminSatelite de su zona; MC `null`; BX [97, 3, 0]; BY `null`; sin escrituras; mismas
  sentencias SQL para MA y MB, y para BX y BY). Servicios reales sobre repositorios reales (patrón
  `cierre-iva-aparte-sl39.test.ts`), `describeSiHayBase`, fallo ruidoso sin catálogos, nada de
  `return` temprano. **Hecho:** verde contra la base desechable y visible como `passed` (no
  `skipped`).

## T4 — Mutaciones (backend_dev) · depende de T3

- [x] **T4.1** Aplicar una a una, correr T1.2 y T3.1, revertir:
  1. empate: gana la **última** parte (orden por índice descendente) → BX da [96, 3, 1];
  2. los puntos que faltan van siempre a la primera parte, sin mirar el resto → MA da [95, 5];
  3. `Math.round` por parte en vez de mayor resto (con su conversión) → BX suma 101;
  4. quitar el `null` por parte negativa → BY deja de ser `null`;
  5. invertir el orden de las partes del mensajero en `verCierreDetalle` → MA da [6, 94];
  6. usar `totalPagoMensajero` como total en `verCierreBodegaDetalle` → BX deja de dar [97, 3, 0];
  7. no emitir el campo en `verCierreBodegaDetalle` → BX `undefined`.

  **Hecho:** las siete ponen rojo al menos un test (se anota en `progress/impl_SLT-111.md` cuál y qué
  aserción cae) y el código vuelve al original con el árbol limpio. No correr el gate con una mutación
  aplicada.

## T5 — Llevarlo a la vista (frontend_dev) · [P] con T3-T4, depende de T2

- [x] **T5.1** `detalle-cierre-vista.ts`: `vistaMensajeroDesdeAdmin` copia `r.porcentajesReparto ??
  null` a `empresa.porcentajesReparto`; `vistaBodegaDesdeAdmin` copia `r.porcentajesReparto ?? null`.
  `CierresAdminModule.tsx`: el estado del detalle gana el campo y `abrirDetalle` lo copia tal cual.
  `DineroCierre.tsx` no se toca; si hiciera falta, PARA y avisa. **Hecho:** typecheck verde.
- [x] **T5.2** `tests/unit/utils/detalle-cierre-vista.test.ts`: los dos mapeadores copian `[94, 6]`,
  `[97, 3, 0]` y `null`; `vistaMensajeroDesdeCierreDia` sigue con `empresa: null`. **Hecho:** verde;
  rojo si un mapeador no copia.
- [x] **T5.3** `tests/components/DetalleCierreDinero.test.tsx`, describe nuevo: con `[94, 6]` la barra
  tiene dos franjas con `width` «94%» y «6%» y la leyenda «Se le paga hoy a la tienda ₡94.350 (94 %)»,
  «Sale de lo recaudado ₡5.650 (6 %)»; con `[97, 3, 0]` en bodega, tres franjas y «(0 %)» en «Gana la
  bodega satélite ₡500»; con `null`, ninguna franja y ningún «%». Los dobles de los describe
  existentes NO cambian. **Hecho:** verde.
- [x] **T5.4** `tests/components/CierresAdminDetalleUnico.test.tsx` y
  `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`: la acción doble devuelve
  `porcentajesReparto` y el módulo montado pinta «(94 %)» / «(97 %)» en «Dinero». **Hecho:** verde;
  rojo si se quita la copia de `abrirDetalle` o del mapeador (mutación temporal anotada).

## T6 — E2E (frontend_dev) · depende de T2 y T5

- [x] **T6.1** `e2e/cierres-rediseno.spec.ts`: en el test del escenario A que abre la central, la
  región «Reparto de lo recaudado» contiene «Se le paga hoy a la tienda ₡94.350 (94 %)» y «Sale de lo
  recaudado ₡5.650 (6 %)»; en el test de SLT-104 (B6), «Debe llegar a la central ₡7.680 (77 %)», «Pago
  a mensajeros ₡2.200 (22 %)» y «Gana la bodega satélite ₡120 (1 %)». Sin tocar los literales que ya
  hay ni sembrar nada nuevo. **Hecho:** verde en local con base desechable y `NEXT_PUBLIC_APP_URL`
  como en `gate.yml`; rojo con el campo anulado en `vistaBodegaDesdeAdmin` (mutación temporal,
  revertida y anotada).

## T7 — Cierre (implementer)

- [ ] **T7.1** Ponerse al día con `dev` (SLT-106 «Bodega satélite: A consolidar con la cola única» y
  SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» tocan `detalle-cierre-vista.ts` y
  `e2e/cierres-rediseno.spec.ts`; `design.md > Orden de merge`). **Hecho:** sin conflictos pendientes.
- [ ] **T7.2** `./init.sh` verde; E2E de `e2e/cierres-rediseno.spec.ts` y grupo `dinero`
  (`pnpm exec playwright test --project=dinero`) verdes en local. **Hecho:** salida con `INIT_EXIT`
  anotada en `progress/impl_SLT-111.md`.
- [ ] **T7.3** Anotar en `progress/features/SLT-111.md` la herencia para SLT-107 «Bodega satélite:
  Solicitados y su cierre de bodega en lectura» (`design.md > Lo que hereda SLT-107`) y las respuestas
  a PA1/PA2. **Hecho:** líneas escritas.
- [ ] **T7.4** Mapa `R → test` en `progress/impl_SLT-111.md`, igual a `## Trazabilidad`. **Hecho:**
  todos los R con un test que existe y está verde.

## Trazabilidad

| R | Test |
|---|---|
| R70 | Reparto: `tests/unit/utils/porcentajes-reparto.test.ts` · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` · `tests/components/DetalleCierreDinero.test.tsx` · `e2e/cierres-rediseno.spec.ts` (A y B6). Señales de la cola (SLT-102, sin cambios): `tests/integration/db/cierres-cola-senales-sql-real.test.ts` · `tests/unit/utils/cola-cierres-vista.test.ts` |
| R71 | `tests/unit/guards/liquidacion-money-safe.test.ts` (existente, sin cambios) · `tests/components/DetalleCierreDinero.test.tsx` (el cliente pinta el entero recibido, sin derivarlo) |
| R72 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (sin escrituras) · tests existentes de los dos servicios verdes sin cambiar aserciones (T2.2) |
| R260 | `tests/unit/utils/porcentajes-reparto.test.ts` ([94, 6], [97, 3, 0], [77, 22, 1], [89, 11], [34, 33, 33], [100, 0]) · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (MA, MB, BX) |
| R261 | `tests/unit/utils/porcentajes-reparto.test.ts` (total 0, parte negativa, no suman) · `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (MC, BY) |
| R262 | `tests/unit/utils/porcentajes-reparto.test.ts` (mutación 3 de T4.1: `Math.round` cae) · revisión de `lib/utils/porcentajes-reparto.ts` sin `Number(`/`parseFloat(` |
| R263 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (MA central; MB central y adminSatelite) · `e2e/cierres-rediseno.spec.ts` (escenario A) |
| R264 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (BX, BY) · `e2e/cierres-rediseno.spec.ts` (B6) |
| R265 | `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts` (sin escrituras; mensajero: mismas sentencias MA = MB; bodega: servicio = repositorio en BX y BY) |
| R266 | `tests/components/DetalleCierreDinero.test.tsx` (franjas, «(n %)», `null` sin barra) |
| R267 | `tests/unit/utils/detalle-cierre-vista.test.ts` (mapeadores; `/cierre-dia` con `empresa: null`) · `tests/components/CierresAdminDetalleUnico.test.tsx` · `tests/components/CierresBodegaAdminDetalleUnico.test.tsx` · `e2e/cierres-rediseno.spec.ts` |

## Tamaño

| Bloque | Archivos | Líneas estimadas |
|---|---|---|
| Producción: `porcentajes-reparto.ts` (~60), dos interfaces (~12), dos servicios (~16), `detalle-cierre-vista.ts` (~4), `CierresAdminModule.tsx` (~6) | 7 | ~100 |
| Tests: regla (~110), integración (~220), mapeadores (~25), `DetalleCierreDinero` (~45), dos módulos (~50), E2E (~20) | 7 | ~470 estimadas → **~940 reales** con el factor 2× de los tests |
| `progress/` | 2 | — |
| **Total** | **16** | **~1 040** |

16 archivos: por debajo del 80 % de `gate.tamano_pr` (32 de 40). En líneas queda **en el borde de las
1 000** (~1 040 con el factor 2×), casi todo tests; la producción es ~100. No se parte: lo pesado es la
integración contra la base, que es la que exige el proyecto para cifras que salen de lo congelado.

## Archivos esperados

- `lib/utils/porcentajes-reparto.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `tests/unit/utils/porcentajes-reparto.test.ts`
- `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/components/DetalleCierreDinero.test.tsx`
- `tests/components/CierresAdminDetalleUnico.test.tsx`
- `tests/components/CierresBodegaAdminDetalleUnico.test.tsx`
- `e2e/cierres-rediseno.spec.ts`
- `progress/impl_SLT-111.md`
- `progress/features/SLT-111.md`
