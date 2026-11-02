# SLT-52 — bitácora de implementación

## T0

### Archivos tocados

- `tests/unit/tarifas/respaldo-identico.test.ts` (nuevo) — T0.1.
- `progress/impl_SLT-52.md` (nuevo) — esta bitácora, T0.2.
- Código de producción: ninguno. `lib/utils/pago-mensajero.ts` se mutó a mano para la
  contraprueba y se restauró (`git status` limpio salvo los dos archivos nuevos).

### T0.1 respaldo-identico (casos cubiertos, salida real del test, contraprueba roja pegada)

Tarifa de laboratorio con céntimos que fuerzan HALF_UP (flete 2750.55 / GAM 2300.15, devuelto
1650.35 / GAM 1380.45, pacto 3995.50 / 1999.99, comisión 3.50 %, IVAs 13 %). Todos los esperados
son literales escritos a mano con la aritmética en el comentario del archivo. 49 casos:

- `derivarIngresoOrden` (18): entregado estándar con comisión; GAM sin comisión (comisión
  AUSENTE, no 0.00); GAM con comisión y redondeo intermedio (COD 16618.40 → 581.64 / 75.61);
  COD null con comisión (0.00 explícito); especial CON pacto (GAM ignorado); especial SIN pacto
  estándar y GAM; tarifa con pacto en distrito no especial; rechazo estándar, GAM, especial con
  pacto, especial sin pacto GAM, pacto solo de entrega; reprogramado, novedad, incidente → `{}`;
  sin tarifa (entregado y rechazo) → `{}`.
- `costosListadoOrden` (6): estándar (3108.12 / 589.30 / normal), GAM sin comisión, especial sin
  pacto (`especial_sin_pacto`, 657.25), especial con pacto (4514.92 / `especial`), COD null, sin
  tarifa (0.00 / 0.00 / normal).
- `costoEnvioDeTarifa` (5) y `desgloseCargaApi` (5): sin fulfillment, con fulfillment 450.25,
  pacto + fulfillment, especial sin pacto GAM con fulfillment "1000" → "1000.00", sin tarifa.
- `pagoPorResultado` (7): los 5 resultados, importe sin decimales, sin tarifa.
- `ingresoBodegaPorResultado` (8): los 5 resultados, importe sin decimales, cobroRechazado 0.00,
  sin tarifa.

Salida real (`pnpm exec vitest run tests/unit/tarifas/respaldo-identico.test.ts`):

```
 Test Files  1 passed (1)
      Tests  49 passed (49)
```

Contraprueba: en `lib/utils/pago-mensajero.ts`
`return new Prisma.Decimal(tarifa.cobroEntregado).toFixed(2);` →
`.toFixed(0) + ".00";`. Salida:

```
     × entregado paga cobroEntregado 10ms
 FAIL  tests/unit/tarifas/respaldo-identico.test.ts > R36 — pagoPorResultado (mensajero, modelo viejo, importes literales) > entregado paga cobroEntregado
Expected: "1250.50"
Received: "1251.00"
      Tests  1 failed | 48 passed (49)
```

Revertida (`git checkout -- lib/utils/pago-mensajero.ts`) → `Tests 49 passed (49)`.
(Un primer intento, `.toFixed(1) + "0"`, era una mutación equivalente para 1250.50 y quedó verde;
no cuenta como contraprueba.)

Typecheck (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `tsc --noEmit`, exit 0.
Lint (`pnpm exec eslint tests/unit/tarifas/respaldo-identico.test.ts`): sin problemas, exit 0.

### T0.2 llamadores (ruta:línea por función) y E2E de T7

Grep sobre `lib/ app/ components/ hooks/ scripts/` (`.ts/.tsx`), sin tests, sin comentarios y sin
la definición. Se incluyen `resolverFlete` y `computeTotales` porque los cita design.md §6 / la
cadena de `cierre-totales.ts`, y las raíces de composición de los dos resolvers (design: «las 11
raíces de composición no cambian»; salen 11 de `TarifaVigenteRepository`).

Nota para T2: hoy `resolveTarifa(tiendaId, zonaId)` tiene DOS parámetros
(`ITarifaVigenteRepository.ts:94`); design.md §5 la describe como `(tiendaId, zonaId, distritoId)`.
Y el resolver del mensajero hoy es `resolvePagoTarifa(zonaId, vehiculoId)` + la función exportada
`resolvePagoTarifaCon`; `resolvePagos` todavía no existe.

**`derivarIngresoOrden`**

- `lib/repositories/CierresAdminRepository.ts:73` — `import { derivarIngresoOrden, resolverFlete } from "@/lib/utils/ingreso-empresa";`
- `lib/repositories/CierresAdminRepository.ts:405` — `const derivado = derivarIngresoOrden(`
- `lib/services/CotizacionOrdenService.ts:51` — `import { derivarIngresoOrden, montoFulfillmentDeTarifa } from "@/lib/utils/ingreso-empresa";`
- `lib/services/CotizacionOrdenService.ts:406` — `const escenarioEntrega = derivarIngresoOrden({ ...input, resultado: "entregado" }, tarifa);`
- `lib/services/CotizacionOrdenService.ts:408` — `const escenarioDevolucion = derivarIngresoOrden({ ...input, resultado: "devolucion_a_origen_por_rechazo" }, tarifa);`
- `lib/services/RechazoTiendaService.ts:16` — `import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";`
- `lib/services/RechazoTiendaService.ts:252` — `const derivado = derivarIngresoOrden(`
- `lib/services/WalletTiendaFeedService.ts:9` — `import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";`
- `lib/services/WalletTiendaFeedService.ts:140` — `const derivado = derivarIngresoOrden(`
- `lib/utils/api-orden-costo.ts:4` — `import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";`
- `lib/utils/api-orden-costo.ts:73` — `const derivado = derivarIngresoOrden({ resultado: "entregado", ...entradas }, tarifa);`
- `lib/utils/aporte-por-orden.ts:4` — `import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";`
- `lib/utils/aporte-por-orden.ts:505` — `const derivado = derivarIngresoOrden(`
- `lib/utils/dinero-por-producto.ts:48` — `import { derivarIngresoOrden, pagoTiendaEmpresa } from "@/lib/utils/ingreso-empresa";`
- `lib/utils/dinero-por-producto.ts:236` — `const derivado = derivarIngresoOrden(`
- `lib/utils/ingreso-empresa.ts:266` — `const derivado = derivarIngresoOrden({ resultado: "entregado", ...orden }, tarifa);`
- `lib/utils/ingreso-empresa.ts:750` — `const derivado = derivarIngresoOrden(g.input, g.tarifa);`

**`resolverFlete`**

- `lib/repositories/CierresAdminRepository.ts:73` — `import { derivarIngresoOrden, resolverFlete } from "@/lib/utils/ingreso-empresa";`
- `lib/repositories/CierresAdminRepository.ts:421` — `: resolverFlete(tarifa, { esCentral: d.esCentral, esZonaEspecial: d.esZonaEspecial });`
- `lib/utils/ingreso-empresa.ts:159` — `const { flete } = resolverFlete(tarifa, input);`
- `lib/utils/ingreso-empresa.ts:183` — `const fleteDev = resolverFlete(tarifa, input).fleteDevuelto;`
- `lib/utils/ingreso-empresa.ts:214` — `const { flete } = resolverFlete(tarifa, { esCentral, esZonaEspecial });`
- `lib/utils/ingreso-empresa.ts:274` — `fleteOrigen: tarifa === null ? "normal" : resolverFlete(tarifa, orden).origen,`

**`costosListadoOrden`**

- `lib/repositories/OrdenRepository.ts:194` — `import { costosListadoOrden } from "@/lib/utils/ingreso-empresa";`
- `lib/repositories/OrdenRepository.ts:1275` — `const costos = costosListadoOrden(tarifa === null ? null : toTarifaVigente(tarifa), {`
- `lib/services/CorregirDatosClienteService.ts:26` — `import { costosListadoOrden } from "@/lib/utils/ingreso-empresa";`
- `lib/services/CorregirDatosClienteService.ts:571` — `const costos = costosListadoOrden(tarifa, {`

**`costoEnvioDeTarifa`**

- `lib/utils/ingreso-empresa.ts:823` — `const envio = new Prisma.Decimal(costoEnvioDeTarifa(tarifa, esCentral, esZonaEspecial));`

**`desgloseCargaApi`**

- `lib/services/BulkOrdenService.ts:59` — `import { desgloseCargaApi, tieneFulfillment } from "@/lib/utils/ingreso-empresa";`
- `lib/services/BulkOrdenService.ts:734` — `const desglose = desgloseCargaApi(`

**`montoFulfillmentDeTarifa`**

- `lib/services/CotizacionOrdenService.ts:51` — `import { derivarIngresoOrden, montoFulfillmentDeTarifa } from "@/lib/utils/ingreso-empresa";`
- `lib/services/CotizacionOrdenService.ts:421` — `const fulfillment = montoFulfillmentDeTarifa(tarifa);`
- `lib/utils/ingreso-empresa.ts:800` — `return montoFulfillmentDeTarifa(tarifa).gt(0);`
- `lib/utils/ingreso-empresa.ts:824` — `const fulfillment = montoFulfillmentDeTarifa(tarifa);`

**`tieneFulfillment`**

- `lib/services/BulkOrdenService.ts:59` — `import { desgloseCargaApi, tieneFulfillment } from "@/lib/utils/ingreso-empresa";`
- `lib/services/BulkOrdenService.ts:590` — `const destino = tieneFulfillment(tarifa) ? destinoConFulfillment : destinoSinFulfillment;`

**`agregarIngresosPorConcepto`**

- `lib/services/WalletFeedService.ts:9` — `agregarIngresosPorConcepto,`
- `lib/services/WalletFeedService.ts:95` — `const conceptos = agregarIngresosPorConcepto(entradas);`

**`pagoPorResultado`**

- `lib/repositories/CierreDiaRepository.ts:62` — `import { pagoPorResultado } from "@/lib/utils/pago-mensajero";`
- `lib/repositories/CierreDiaRepository.ts:1745` — `const pago = pagoPorResultado(g.resultado, tarifa);`
- `lib/repositories/CierresAdminRepository.ts:120` — `import { pagoPorResultado } from "@/lib/utils/pago-mensajero";`
- `lib/repositories/CierresAdminRepository.ts:1732` — `const pagoMensajero = pagoPorResultado(RESULTADO_RECHAZADA, tarifa); // "0.00"`
- `lib/utils/cierre-totales.ts:5` — `import { pagoPorResultado } from "@/lib/utils/pago-mensajero";`
- `lib/utils/cierre-totales.ts:25` — `const pago = pagoPorResultado(g.resultado, tarifa);`

**`ingresoBodegaPorResultado`**

- `lib/repositories/CierreDiaRepository.ts:63` — `import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";`
- `lib/repositories/CierreDiaRepository.ts:1746` — `const ingreso = ingresoBodegaPorResultado(g.resultado, tarifa);`
- `lib/repositories/CierresAdminRepository.ts:121` — `import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";`
- `lib/repositories/CierresAdminRepository.ts:1733` — `const ingresoBodegaRechazo = ingresoBodegaPorResultado(RESULTADO_RECHAZADA, tarifa);`
- `lib/utils/cierre-totales.ts:6` — `import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";`
- `lib/utils/cierre-totales.ts:44` — `const ingreso = ingresoBodegaPorResultado(g.resultado, tarifa);`

**`derivarPagos`**

- `lib/services/CierreDiaService.ts:32` — `derivarPagos,`
- `lib/services/CierreDiaService.ts:308` — `const { pagoByGestionId, total: totalPagoMensajero } = derivarPagos(gestiones, tarifa);`
- `lib/services/CierreDiaService.ts:698` — `const { pagoByGestionId, total: totalPagoMensajero } = derivarPagos(gestiones, tarifa);`
- `lib/services/CorteDiarioService.ts:11` — `import { computeTotales, derivarPagos, derivarIngresoBodega } from "@/lib/utils/cierre-totales";`
- `lib/services/CorteDiarioService.ts:201` — `const { pagoByGestionId, total: totalPagoMensajero } = derivarPagos(gestiones, tarifa);`

**`derivarIngresoBodega`**

- `lib/services/CierreDiaService.ts:33` — `derivarIngresoBodega,`
- `lib/services/CierreDiaService.ts:313` — `const { ingresoByGestionId, total: totalIngresoBodegaRechazos } = derivarIngresoBodega(`
- `lib/services/CierreDiaService.ts:704` — `const { ingresoByGestionId, total: totalIngresoBodegaRechazos } = derivarIngresoBodega(`
- `lib/services/CorteDiarioService.ts:11` — `import { computeTotales, derivarPagos, derivarIngresoBodega } from "@/lib/utils/cierre-totales";`
- `lib/services/CorteDiarioService.ts:202` — `const { ingresoByGestionId, total: totalIngresoBodegaRechazos } = derivarIngresoBodega(`

**`computeTotales`**

- `lib/repositories/CierreDiaRepository.ts:61` — `import { computeTotales, sumarSnapshotsCongelados } from "@/lib/utils/cierre-totales";`
- `lib/repositories/CierreDiaRepository.ts:158` — `const totales = computeTotales(`
- `lib/repositories/CierresAdminRepository.ts:112` — `import { computeTotales, sumarSnapshotsCongelados } from "@/lib/utils/cierre-totales";`
- `lib/repositories/CierresAdminRepository.ts:1596` — `const totales = computeTotales(`
- `lib/repositories/CierresAdminRepository.ts:1833` — `const totales = computeTotales(`
- `lib/services/CierreDiaService.ts:31` — `computeTotales,`
- `lib/services/CierreDiaService.ts:350` — `const totales = computeTotales(gestiones);`
- `lib/services/CierreDiaService.ts:691` — `const totales = computeTotales(gestiones);`
- `lib/services/CorteDiarioService.ts:11` — `import { computeTotales, derivarPagos, derivarIngresoBodega } from "@/lib/utils/cierre-totales";`
- `lib/services/CorteDiarioService.ts:200` — `const totales = computeTotales(gestiones);`
- `lib/utils/ingreso-empresa.ts:14` — `import { computeTotales, type GestionConPagos } from "@/lib/utils/cierre-totales";`
- `lib/utils/ingreso-empresa.ts:582` — `const recaudado = computeTotales(grupo.gestiones).general;`

**`TarifaVigenteRepository.resolveTarifas`**

- `lib/interfaces/repositories/ITarifaVigenteRepository.ts:106` — `resolveTarifas(`
- `lib/repositories/CierreDiaRepository.ts:1325` — `const tarifas = await this.tarifaRepo.resolveTarifas(pares, tx);`
- `lib/repositories/TarifaVigenteRepository.ts:138` — `const resueltas = await this.resolveTarifas([par]);`
- `lib/services/ApiOrdenLecturaService.ts:42` — `type LecturaTarifaRepo = Pick<ITarifaVigenteRepository, "resolveTarifas">;`
- `lib/services/ApiOrdenLecturaService.ts:152` — `return this.tarifaRepo.resolveTarifas(pares);`
- `lib/services/BulkOrdenService.ts:577` — `const resueltas = await this.tarifaRepo.resolveTarifas([...paresPorClave.values()]); // R26`
- `lib/services/CotizacionOrdenService.ts:70` — `type CotizacionTarifaRepository = Pick<ITarifaVigenteRepository, "resolveTarifas">;`
- `lib/services/CotizacionOrdenService.ts:216` — `: await this.tarifaRepo.resolveTarifas(pares);`
- `lib/services/RechazoTiendaService.ts:48` — `type RechazoTarifaRepo = Pick<ITarifaVigenteRepository, "resolveTarifas">;`
- `lib/services/RechazoTiendaService.ts:249` — `const tarifas = await this.tarifaRepo.resolveTarifas([par]);`

**`TarifaVigenteRepository.resolveTarifa`**

- `lib/interfaces/repositories/ITarifaVigenteRepository.ts:94` — `resolveTarifa(tiendaId: string, zonaId: string | null): Promise<TarifaVigente | null>;`
- `lib/services/CorregirDatosClienteService.ts:101` — `export type CorregirDatosClienteTarifas = Pick<ITarifaVigenteRepository, "resolveTarifa">;`
- `lib/services/CorregirDatosClienteService.ts:570` — `const tarifa = await this.tarifas.resolveTarifa(orden.tiendaId, ubicacion.zonaId);`

**`TarifaZonaMensajeroRepository.resolvePagoTarifa`**

- `lib/interfaces/repositories/ITarifaZonaMensajeroRepository.ts:24` — `resolvePagoTarifa(zonaId: string, vehiculoId: string | null): Promise<PagoTarifa | null>;`
- `lib/services/CierreDiaService.ts:279` — `return this.tarifaZonaRepo.resolvePagoTarifa(zonaId, vehiculoId); // R1/R2/R3`
- `lib/services/CierreDiaService.ts:621` — `const tarifa = await this.tarifaZonaRepo.resolvePagoTarifa(`
- `lib/services/CierreDiaService.ts:697` — `const tarifa = await this.tarifaZonaRepo.resolvePagoTarifa(zonaId, vehiculoId);`
- `lib/services/CorteDiarioService.ts:199` — `const tarifa = await this.tarifaZonaRepo.resolvePagoTarifa(m.zonaId, vehiculoId);`

**`resolvePagoTarifaCon (funcion exportada del repo)`**

- `lib/repositories/CierresAdminRepository.ts:116` — `import { resolvePagoTarifaCon } from "@/lib/repositories/TarifaZonaMensajeroRepository";`
- `lib/repositories/CierresAdminRepository.ts:1727` — `const tarifa = await resolvePagoTarifaCon(`
- `lib/repositories/TarifaZonaMensajeroRepository.ts:86` — `return resolvePagoTarifaCon(this.prisma.tarifaZonaMensajero, zonaId, vehiculoId);`

**`new TarifaVigenteRepository (raices)`**

- `lib/actions/cierre-dia.ts:52` — `new CierreDiaRepository(prisma, new TarifaVigenteRepository(prisma)),`
- `lib/actions/corregir-datos-cliente.ts:61` — `new TarifaVigenteRepository(prisma),`
- `lib/actions/resolver-novedad.ts:134` — `new TarifaVigenteRepository(prisma),`
- `app/api/cron/corte-diario/route.ts:49` — `new CierreDiaRepository(prisma, new TarifaVigenteRepository(prisma)),`
- `app/api/ordenes/api-key/carga/route.ts:174` — `new TarifaVigenteRepository(prisma),`
- `app/api/ordenes/api-key/cotizacion/route.ts:74` — `new TarifaVigenteRepository(prisma),`
- `app/api/ordenes/api-key/orden/[id]/route.ts:106` — `new TarifaVigenteRepository(prisma),`
- `app/api/ordenes/api-key/route.ts:48` — `new TarifaVigenteRepository(prisma),`
- `app/api/ordenes/carga-masiva/chunk/route.ts:45` — `new TarifaVigenteRepository(prisma),`
- `scripts/demo-qa/receta.ts:1124` — `new CierreDiaRepository(app, new TarifaVigenteRepository(app)),`
- `scripts/demo-qa/receta.ts:1165` — `new TarifaVigenteRepository(app),`

**`new TarifaZonaMensajeroRepository (raices)`**

- `lib/actions/cierre-dia.ts:58` — `new TarifaZonaMensajeroRepository(prisma),`
- `app/api/cron/corte-diario/route.ts:52` — `new TarifaZonaMensajeroRepository(prisma),`
- `scripts/demo-qa/receta.ts:1127` — `new TarifaZonaMensajeroRepository(app),`

**E2E de T7.3** (globs de tasks.md resueltos en `e2e/`):

- `e2e/cierre-*` → `e2e/cierre-bodega-satelite.spec.ts`, `e2e/cierre-dia.spec.ts`,
  `e2e/cierre-vencido-modelo.spec.ts`
- `e2e/cierres-admin*` → `e2e/cierres-admin.spec.ts`, `e2e/cierres-admin-rechazos-sla.spec.ts`
- `e2e/cierre-bodega-satelite*` → `e2e/cierre-bodega-satelite.spec.ts` (ya en `cierre-*`)
- `e2e/wallet-*` → `e2e/wallet-iva-aparte-sl39.spec.ts`, `e2e/wallet-mensajeros.spec.ts`
- `e2e/mi-wallet*` → `e2e/mi-wallet.spec.ts`
- `e2e/dos-empresas-humo.spec.ts` → existe

Total: 8 archivos distintos.

## Mapa R<n> -> test

| R | Test |
|---|---|
| R36 | `tests/unit/tarifas/respaldo-identico.test.ts` (49 casos, modelo viejo; E2E en T7.3) |
