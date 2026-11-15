# SLT-169 «Se le paga hoy a la tienda con todos los cobros restados» — implementación

## T0 (leader)
- P1: `WALLET_TIENDA_DEBITA_FLETE_DEVOLUCION` rige su default `true` (resuelta por el leader con evidencia de prod).

## T1-T3 (backend_dev, 2026-11-14)

### Archivos de producción
- `lib/utils/ingreso-empresa.ts` — `partesPorTienda`: `pagoTienda = ganaLaTienda(recaudado, ingreso.total)` de la tienda; `ganaLaTienda` alias. `pagoTiendaEmpresa` sin cambio de código (solo comentario: la usa la 347, R636). Comentarios de la cuarta identidad reescritos.
- `lib/utils/cifras-cierre.ts` — `pagoTienda = ganaLaTienda(general, totalesIngreso.total)`; `ganaLaTienda = pagoTienda`.
- `lib/services/CierresBodegaAdminService.ts` — cierre del día con la misma fórmula.
- `lib/services/CierresAdminService.ts` — `porcentajesReparto([pagoTienda, totalesIngreso.total], general)`.
- `lib/interfaces/services/ICierresAdminService.ts`, `ICierresBodegaAdminService.ts`, `ICierreBodegaService.ts` — solo comentarios.

### Tests
- Nuevos: `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts` (R631), `tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts` (R632: siembra 1 entrega + 2 rechazos de A y 1 entrega de B, aprueba con `CierresAdminService.aprobarCierre` real y compara con Σ créditos − Σ débitos de `wallet_tienda_movimiento` por `origen_id` y `organizacion_id`; aserta filas > 0).
- Actualizados (cifra nueva): `tests/unit/utils/{partes-por-tienda,cifras-cierre,cifras-cierre-bodega,ingreso-empresa-modelo-nuevo}.test.ts`, `tests/unit/services/{cierre-desglose-tres-superficies,cierres-admin-service,cierres-bodega-admin-service,cierres-bodega-resumen-modelo-nuevo-service,cierres-resumen-modelo-nuevo-descarga-service}.test.ts`, `tests/integration/db/{cierre-desglose-por-tienda,cierre-bodega-desglose-por-tienda,cierre-reparto-porcentajes,cierres-bodega-cifras-lote,cierres-resumen-modelo-nuevo-descarga,satelite-detalle-sin-dinero-empresa}-sql-real.test.ts`.
- Los cinco últimos de servidor no estaban en la lista de tasks.md: `vitest related` los puso rojos con la cifra vieja.

### Mapa R → test (servidor)
| R | Test |
|---|---|
| R620 | `tests/unit/utils/cifras-cierre.test.ts` («#C51B7B93: 19.900 − 3.273,05 − 12 × 2.486 = −13.205,05»); real: `pago-tienda-neto-ledger-sql-real` (cierre entero) |
| R621 | `tests/unit/utils/partes-por-tienda.test.ts` (Σ partes, orden por la cifra nueva); real: `pago-tienda-neto-ledger-sql-real`, `cierre-desglose-por-tienda-sql-real` |
| R622 | `partes-por-tienda.test.ts` («R622: … pagoTienda NEGATIVO»), `cifras-cierre.test.ts` (R622) |
| R623 | `tests/unit/services/cierres-bodega-admin-service.test.ts` (Σ días = agregado), `cierre-desglose-tres-superficies.test.ts`; real: `cierre-bodega-desglose-por-tienda-sql-real`, `satelite-detalle-sin-dinero-empresa-sql-real` |
| R624 | `tests/unit/services/cierres-admin-service.test.ts` ([92, 8]; `null` si negativa); real: `pago-tienda-neto-ledger-sql-real` ([62, 38]), `cierre-reparto-porcentajes-sql-real` |
| R631 | `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`; `vitest related` de `WalletTiendaFeedService.ts`/`LiquidacionService.ts` verde salvo baseline, sin tocar sus tests |
| R632 | `tests/integration/db/pago-tienda-neto-ledger-sql-real.test.ts` |
| R635 | `cifras-cierre.test.ts` (viejo con rechazo, nuevo con reprogramado), `ingreso-empresa-modelo-nuevo.test.ts` |
| R636 | tests de `dinero-por-producto.ts` sin cambios y verdes (`vitest related`) |
| R625-R630, R633, R634 | frontend_dev (T4-T5) |

### Mutaciones (salida real; cada una revertida y comprobada igual al original)
| Id | Resultado |
|---|---|
| M1 cifras-cierre → `pagoTiendaEmpresa` | muere: 6 rojos en `cifras-cierre.test.ts` (R620, R622, R635) + 2 en `pago-tienda-neto-ledger-sql-real` (R632 cierre, R624) |
| M2 partesPorTienda con el total del cierre entero | muere: 7 rojos en `partes-por-tienda.test.ts` (R621 Σ, R622) |
| M3 reparto con `cobradoSobreRecaudado` | muere: `cierres-admin-service.test.ts` «SLT-169 R624 … [92, 8]» |
| M4 bodega día con `pagoTiendaEmpresa` | muere: 7 rojos en `cierres-bodega-admin-service.test.ts` (R623) |
| M6 import de `cifras-cierre` en `WalletTiendaFeedService` | muere: la guardia R631 |

### Verificación
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0 (0 errores; 251 warnings previos, ninguno en archivos de esta tanda).
- Tests tocados (15 archivos): 302 passed, 0 failed, 0 skipped (contra la base desechable).
- `vitest related` de los 5 de producción + `WalletTiendaFeedService.ts`, `LiquidacionService.ts`, `dinero-por-producto.ts`: 175 archivos rojos, 168 en `tests/baseline-rojos.json`; los 7 restantes eran de servidor y se actualizaron (arriba), ahora verdes.
- Tests de componente/descarga/vista que leen estos campos (34 archivos): 848 passed (usan fixtures; nada rojo para frontend_dev).
- `pnpm run test:guardias`: 1 archivo rojo, en baseline.

### Riesgos
- `cierre-desglose-por-tienda-sql-real` y `cierre-bodega-desglose-por-tienda-sql-real` están en el baseline (piden órdenes sembradas): sus cifras nuevas no se pudieron correr aquí. R621 real lo cubre el test nuevo; R623 real, `satelite-detalle-sin-dinero-empresa-sql-real`.
- La guardia R631 lee imports directos; un import transitivo (A → B → cifras-cierre) no lo ve.

Veredicto: T1-T3 hechas; servidor y tests verdes, las 5 mutaciones mueren.
