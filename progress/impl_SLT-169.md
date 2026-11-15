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

## T4-T6.1 (frontend_dev, 2026-11-14)

### Archivos de producción (6)
- `components/private/cierres/detalle/detalle-cierre-labels.ts` — `contextoTiendas(n)` («1 tienda» / «N tiendas»), `TIENDA_DEBE(n)`, `POR_TIENDA_COLUMNAS` sin `gana`; fuera `SALE_DE_LO_RECAUDADO_LABEL`.
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `Cifra.sufijo`; `cifraParaTienda` (sufijo por `esMontoNegativo` del STRING); reparto [pagoTienda, totalesIngreso.total]; `cuentaFactura` sin subtotal (mensajero y bodega).
- `components/private/cierres/detalle/CifrasCierre.tsx` — solo pinta `c.sufijo` tras el importe (no toca `tonoCaja` ni la caja aviso: choque con SLT-170).
- `components/private/cierres/detalle/DineroCierre.tsx` — «Por tienda» a 3 columnas; celda negativa `text-danger-strong` + «(la tienda debe)».
- `app/(app)/cierres-admin/_components/cierres-resumen-modelo-nuevo-descarga-columnas.ts` — «Cierres» 19/18 sin «Gana la tienda en total»; «Por tienda» 4 columnas (la comparte el libro de bodega).
- `app/(app)/cierres-admin/_components/cierres-bodega-modelo-nuevo-descarga-columnas.ts` — encabezado de `ganaLaTienda` → «Se le paga a la tienda» (misma clave y posición, 26).

### Tests (11) y E2E (1)
Previstos: `tests/unit/utils/detalle-cierre-vista.test.ts`, `tests/components/DetalleCierre.test.tsx`, `tests/components/DetalleCierreDinero.test.tsx`, `tests/components/DineroIdentidadesEnPantalla.test.tsx`, `tests/unit/descarga/cierres-resumen-modelo-nuevo-descarga.test.ts`, `tests/unit/descarga/cierres-bodega-modelo-nuevo-descarga.test.ts`, `e2e/cierres-rediseno.spec.ts` (también sus dos bloques Excel SLT-140/141: encabezados y «Por tienda»).
Adicionales que cayeron con el cambio (fuera de la lista de tasks.md; 19 rojos en `vitest related`, ninguno en baseline): `tests/components/CierreBodegaDesglosePorTienda.test.tsx` (tabla a 3 columnas; fixture con pagoTienda = ganaLaTienda), `tests/components/CierreBodegaDetalleCascadas.test.tsx` (sin línea puente), `tests/components/CierresAdminDetalleUnico.test.tsx` (reparto [92, 8]), `tests/components/descarga/CierresBodegaResumenModeloNuevo.test.tsx` y `tests/components/descarga/DescargarResumenModeloNuevo.test.tsx` (encabezados).

### Mapa R → test (pantalla y Excel)
| R | Test |
|---|---|
| R624 | `detalle-cierre-vista.test.ts` «mensajero: reparto … (SLT-169 R624, R626)»; `DetalleCierreDinero.test.tsx` «[92, 8]»; `e2e/cierres-rediseno.spec.ts` (reparto) |
| R625 | `DetalleCierre.test.tsx` «SLT-169 R625» (rojo + «(la tienda debe)», «(las tiendas deben)» con 2, positiva sin marca); `detalle-cierre-vista.test.ts` «R625 — …» |
| R626 | `detalle-cierre-vista.test.ts` (mensajero y bodega); `DetalleCierreDinero.test.tsx`; `e2e/cierres-rediseno.spec.ts` (`cuentasA`) |
| R627 | `DetalleCierreDinero.test.tsx` «SLT-169 — «Por tienda» con una tienda que debe (R627)» y «3 columnas» |
| R628 | `cierres-resumen-modelo-nuevo-descarga.test.ts` (19 encabezados literales) |
| R629 | `cierres-bodega-modelo-nuevo-descarga.test.ts` (26 literales; columna 11 = «Se le paga a la tienda») |
| R630 | los dos de descarga («Por tienda» 4 columnas; `-2260.00` → `celdaMonto` −2260) |
| R633 | `DineroIdentidadesEnPantalla.test.tsx` «R633 — la satélite no ve …»; `e2e/cierres-rediseno.spec.ts` (bloque R471); `e2e/cierre-bodega-satelite.spec.ts` |
| R634 | `cierres-resumen-modelo-nuevo-descarga.test.ts` (satélite: 18 literales) |

### Mutaciones (salida real; cada archivo restaurado y comprobado por sha256 idéntico)
| Id | Mutación | Resultado |
|---|---|---|
| M5a | `DineroCierre.tsx`: quitar el rojo de la celda | muere: 2 rojos en `DetalleCierreDinero.test.tsx` (R627 mensajero y bodega) |
| M5b | `DineroCierre.tsx`: quitar «(la tienda debe)» | muere: los mismos 2 rojos (R627) |
| M7 | resumen: devolver «Gana en total» a «Por tienda» | muere: 1 rojo en cada test de descarga (R630) |
| M8 | `CifrasCierre.tsx`: no pintar el sufijo | muere: 2 rojos en `DetalleCierre.test.tsx` (R625, una y dos tiendas) |
| M9 | vista: volver a meter «Sale de lo recaudado» | muere: 5 rojos en `detalle-cierre-vista.test.ts` y `DetalleCierreDinero.test.tsx` (R626) |

### Verificación
- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0 (0 errores, 251 warnings previos; ninguno de esta tanda).
- `vitest run` de los 11 archivos de test: verdes (96 + 45 + 19 + 43 + 33 + 95 en las tandas).
- `vitest related --run` de los 6 de producción: 75 archivos, 1539 passed, 0 failed.
- E2E (base desechable, `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `E2E_SERVIDOR=dev`: sin build de producción `next start` no arranca):
  - `e2e/cierres-rediseno.spec.ts` + `e2e/cierre-bodega-satelite.spec.ts`: **27 passed, 0 failed** (3.8m).
  - `--project=dinero`: 106 passed, 3 failed, 14 did not run (12.6m). Los 3: `cierre-bodega-satelite.spec.ts:550` (el worker murió, code=3221226505), `tarifas-activacion.spec.ts:206` (timeout de 5 s esperando `aria-busy` en «Guardar borrador») y `tope-intentos-por-empresa.spec.ts:427` (no aparece la región «Verificar la guía del paquete antes de gestionar» en /mis-asignaciones/reparto).
  - Re-corrida de esos 3 archivos en `dinero`: 18 passed, 1 failed, 9 did not run. Pasan `cierre-bodega-satelite` y `tarifas-activacion`; sigue rojo `tope-intentos-por-empresa.spec.ts:427` (misma aserción, pantalla de reparto del mensajero, que este diff no toca). No verificado contra `dev`: queda abierto para el leader.
  - Server parado al terminar y `.next/dev` borrado; typecheck otra vez exit 0.

### Riesgos
- `CifrasCierre.tsx` lleva 2 líneas nuevas tras el `<span data-cifra>`; SLT-170 cambia `tonoCaja` en el mismo archivo: rebase sin solape esperado.
- El texto «(las tiendas deben)» es la propuesta de P2: se confirma en Preview.
- Los componentes sin superficie (`CascadasCierreMensajero.tsx`, `DesglosePorTienda.tsx`) siguen con «Gana en total» (fuera de alcance).

Veredicto: T4, T5 y T6.1 hechas; unit/componente y los dos E2E del detalle verdes, las 5 mutaciones mueren; `dinero` con 1 rojo ajeno al diff (`tope-intentos-por-empresa:427`) sin confirmar en dev.
