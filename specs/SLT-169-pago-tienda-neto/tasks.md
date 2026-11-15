# SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» — tasks

> Diseño: `design.md`. Requisitos: `requirements.md` (R620-R636). `backend_dev` hace T0-T3;
> `frontend_dev` hace T4-T5; T6-T7 cierran. Sin migración.

## T0 — Antes de tocar código

- [x] **T0.1** Comprobar P1: que `WALLET_TIENDA_DEBITA_FLETE_DEVOLUCION` no está definida o vale `true`
  en Preview y producción, **solo como booleano** (nunca imprimir el entorno ni una URL). Si vale
  `false`, PARAR y avisar al leader: decide Carlos.
  *Hecho:* resultado (sí/no) anotado en `progress/impl_SLT-169.md`.
- [x] **T0.2** Copiar `.env` al worktree antes del primer gate (sin `.env` la integración se salta).
  *Hecho:* `./init.sh` corre los `*-sql-real` en verde antes del cambio.

## T1 — La cifra en el servidor (backend_dev)

- [x] **T1.1** `lib/utils/ingreso-empresa.ts`: en `partesPorTienda`, `pagoTienda` =
  `ganaLaTienda(recaudado, ingreso.total)` (el `ganaLaTienda` de la parte, igual). Orden y desempate
  sin cambio (ahora sobre la cifra nueva). `pagoTiendaEmpresa` NO se toca. Reescribir los comentarios
  que afirman que el pago no resta el flete por rechazo y la cuarta identidad.
  *Hecho:* R621, R622, R636 verdes en unit.
- [x] **T1.2** `lib/utils/cifras-cierre.ts`: `pagoTienda` = `ganaLaTienda(general, totalesIngreso.total)`.
  *Hecho:* R620 (folio #C51B7B93 → `-13205.05`), R635 (viejo y nuevo) verdes.
- [x] **T1.3** `lib/services/CierresBodegaAdminService.ts:515-519`: el `pagoTienda` de cada cierre del día
  con la misma fórmula. *Hecho:* R623 verde (Σ días = agregado).
- [x] **T1.4** `lib/services/CierresAdminService.ts:1164-1167`: `porcentajesReparto([pagoTienda,
  totalesIngreso.total], general)`. *Hecho:* R624 verde (con rechazo: [92, 8]; negativo: `null`).
- [x] **T1.5** [P] Comentarios de los campos en `lib/interfaces/services/ICierresAdminService.ts`,
  `ICierresBodegaAdminService.ts` e `ICierreBodegaService.ts`: `pagoTienda` resta todo lo facturado;
  `ganaLaTienda` es alias de igual valor hasta P3. Sin cambiar tipos. *Hecho:* typecheck verde.

## T2 — El dinero real no cambia (backend_dev) [P con T1]

- [x] **T2.1** Guardia nueva `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`: ningún
  archivo de `lib/services/` que escribe dinero (`WalletTiendaFeedService`, `WalletFeedService`,
  `Caja*FeedService`, `LiquidacionService`, `CobroTiendaService`, `RechazoTiendaCobroService`,
  `RechazoTiendaService`, `CierreBodegaService`) importa `cifras-cierre`, `cifras-cierre-bodega`,
  `pagoTiendaEmpresa`, `ganaLaTienda` ni `partesPorTienda`. Incluye un caso que demuestra que la
  guardia ve un import (lee un texto de prueba con el import y falla).
  *Hecho:* R631 verde; mutación M6 roja.
- [x] **T2.2** No tocar `WalletTiendaFeedService.ts` ni sus tests; correr
  `pnpm exec vitest related --run lib/services/WalletTiendaFeedService.ts lib/services/LiquidacionService.ts`.
  *Hecho:* verdes sin cambios en esos tests (R631).

## T3 — Integración contra Postgres (backend_dev)

- [x] **T3.1** Actualizar `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` y
  `cierre-bodega-desglose-por-tienda-sql-real.test.ts` a la cifra nueva (con una tienda con rechazos y
  otra sin ellos, para que la partición equivocada no pase). *Hecho:* R621, R623 verdes en real.
- [x] **T3.2** Actualizar `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts`.
  *Hecho:* R624 verde en real.
- [x] **T3.3** Nuevo `tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts`: aprobar un cierre con
  1 entrega y 2 rechazos de una tienda y 1 entrega de otra; para cada tienda,
  `ParteDeTienda.pagoTienda === Σ créditos − Σ débitos` de `wallet_tienda_movimiento` con ese
  `origen_id`; filtra por `organizacion_id`. Sin `if (!datos) return`: si no hay filas, falla.
  *Hecho:* R632 verde; mutación M1 roja.

## T4 — Pantalla (frontend_dev; depende de T1)

- [x] **T4.1** `detalle-cierre-labels.ts`: `contextoTiendas(tiendas)`, `POR_TIENDA_COLUMNAS` sin `gana`,
  `TIENDA_DEBE(tiendas)`. *Hecho:* typecheck.
- [x] **T4.2** `detalle-cierre-vista.ts`: tarjeta con `sufijo` si es negativa; reparto
  [«Se le paga hoy a la tienda», «Total facturado»]; `cuentaFactura` sin «Sale de lo recaudado».
  *Hecho:* R624-R626 verdes en `tests/unit/utils/detalle-cierre-vista.test.ts`.
- [x] **T4.3** `CifrasCierre.tsx` (pinta el `sufijo`) y `DineroCierre.tsx` (tres columnas; celda
  negativa en rojo con «(la tienda debe)»). *Hecho:* R625, R627 verdes en componente.

## T5 — Excel (frontend_dev; depende de T1) [P con T4]

- [x] **T5.1** `cierres-resumen-modelo-nuevo-descarga-columnas.ts`: «Cierres» sin «Gana la tienda en
  total»; «Por tienda» con 4 columnas. *Hecho:* R628, R630, R634 verdes.
- [x] **T5.2** `cierres-bodega-modelo-nuevo-descarga-columnas.ts`: encabezado «Se le paga a la tienda».
  *Hecho:* R629 verde.

## T6 — E2E y mutaciones

- [x] **T6.1** `e2e/cierres-rediseno.spec.ts`: `cifrasA` → `paraTienda` ₡92.090; reparto
  `["Se le paga hoy a la tienda ₡92.090 (92 %)", "Total facturado ₡7.910 (8 %)"]`; `cuentasA` sin
  «Sale de lo recaudado»; en la lista de lo que la satélite no ve, ₡92.090 en vez de ₡94.350.
  Correr en local con base desechable: ese archivo, `e2e/cierre-bodega-satelite.spec.ts` y
  `--project=dinero`. *Hecho:* verdes; constancia en `progress/impl_SLT-169.md`.
- [x] **T6.2** Correr las mutaciones de la tabla y anotar en `progress/impl_SLT-169.md` qué test se
  pone rojo con cada una (con la salida real, no con lo esperado). *Hecho:* las 7 mueren.

## T7 — Cierre

- [ ] **T7.1** `./init.sh` verde; tamaño del PR por debajo del aviso.
- [x] **T7.2** Mapa R→test en `progress/impl_SLT-169.md`. *Hecho:* cada R620-R636 con un test que
  existe y está verde.

## Trazabilidad

| R | Test previsto |
|---|---|
| R620 | `tests/unit/utils/cifras-cierre.test.ts` («#C51B7B93: 19.900 − 3.273,05 − 12 × 2.486 = −13.205,05») |
| R621 | `tests/unit/utils/partes-por-tienda.test.ts` (Σ partes = cierre; orden por la cifra nueva); real: `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts` |
| R622 | `tests/unit/utils/partes-por-tienda.test.ts` («tienda de puros rechazos: negativa, no 0.00») |
| R623 | `tests/unit/services/cierres-bodega-admin-service.test.ts`, `tests/unit/services/cierre-desglose-tres-superficies.test.ts`; real: `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts` |
| R624 | `tests/unit/services/cierres-admin-service.test.ts` ([92, 8]; `null` si negativa); `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts`; `e2e/cierres-rediseno.spec.ts` |
| R625 | `tests/components/DetalleCierre.test.tsx` (rojo + «(la tienda debe)»; «(las tiendas deben)» con 2) |
| R626 | `tests/unit/utils/detalle-cierre-vista.test.ts`; `e2e/cierres-rediseno.spec.ts` (`cuentasA`) |
| R627 | `tests/components/DetalleCierreDinero.test.tsx` (3 columnas, celda negativa en rojo con «(la tienda debe)») |
| R628 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (19 encabezados literales) |
| R629 | `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts` (26 encabezados literales) |
| R630 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` y `cierres-bodega-modelo-nuevo-descarga.test.ts` («Por tienda»: 4 encabezados; valor negativo como número) |
| R631 | `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`; tests de `WalletTiendaFeedService` y `LiquidacionService` sin cambios y verdes |
| R632 | `tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts` |
| R633 | `tests/components/DineroIdentidadesEnPantalla.test.tsx` (audiencia satélite); `e2e/cierres-rediseno.spec.ts` (bloque R471); `e2e/cierre-bodega-satelite.spec.ts` |
| R634 | `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts` (satélite: 18 columnas, ninguna nueva) |
| R635 | `tests/unit/utils/cifras-cierre.test.ts` (un caso viejo con rechazo y uno nuevo con reprogramada) |
| R636 | tests de `lib/utils/dinero-por-producto.ts` sin cambios y verdes (`vitest related`) |

### Mutaciones (T6.2)

| Id | Mutación | Debe matarla |
|---|---|---|
| M1 | `cifras-cierre.ts`: volver a `pagoTiendaEmpresa(general, fleteConIva, comisionConIva)` | R620, R632 |
| M2 | `partesPorTienda`: usar el `total` del cierre entero en vez del de la tienda | R621 |
| M3 | `CierresAdminService`: segunda parte del reparto otra vez `cobradoSobreRecaudado` | R624 |
| M4 | `CierresBodegaAdminService`: el cierre del día con `pagoTiendaEmpresa` | R623 |
| M5 | `DineroCierre.tsx`: quitar el rojo o el «(la tienda debe)» de la celda | R627 |
| M6 | `WalletTiendaFeedService.ts`: añadir `import { cifrasDelCierre } from "@/lib/utils/cifras-cierre"` | R631 |
| M7 | `cierres-resumen-modelo-nuevo-descarga-columnas.ts`: devolver «Gana en total» a «Por tienda» | R630 |

## Archivos esperados

Producción (13):
- `lib/utils/ingreso-empresa.ts`
- `lib/utils/cifras-cierre.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `components/private/cierres/detalle/detalle-cierre-vista.ts`
- `components/private/cierres/detalle/detalle-cierre-labels.ts`
- `components/private/cierres/detalle/CifrasCierre.tsx`
- `components/private/cierres/detalle/DineroCierre.tsx`
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts`

Tests (17):
- `tests/unit/utils/partes-por-tienda.test.ts`
- `tests/unit/utils/cifras-cierre.test.ts`
- `tests/unit/utils/detalle-cierre-vista.test.ts`
- `tests/unit/services/cierre-desglose-tres-superficies.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`
- `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`
- `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`
- `tests/components/DetalleCierre.test.tsx`
- `tests/components/DetalleCierreDinero.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-reparto-porcentajes-sql-real.test.ts`
- `tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts`
- `e2e/cierres-rediseno.spec.ts`

## Tamaño

Tope por defecto (`arnes.config.json` no define `gate.tamano_pr`): 40 archivos, 1000 líneas de
producción, 3000 de tests; `specs/` y `progress/` no cuentan.

- **Archivos:** 30 (13 + 17) = 75 % de 40, por debajo del aviso del 80 % (32). Margen: 2 archivos. Si al
  correr la suite caen más tests por la cifra nueva (otros fixtures que derivan `pagoTienda` con un
  rechazo), el implementer para al llegar a 32 y el leader decide.
- **Líneas de producción:** ~250-350 (casi todo comentarios reescritos y dos componentes).
- **Líneas de tests:** ~800-1.200 (un integración nuevo, una guardia nueva, el resto ajustes de cifras).
