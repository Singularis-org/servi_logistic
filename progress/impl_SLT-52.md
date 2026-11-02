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

## T1

MCP `codebase-memory` no respondio (timeout de conexion): todo con Grep/Read.

### Archivos tocados

Migraciones nuevas (timestamps los de `tasks.md`, sin cambios en «Archivos esperados»):
- `db/migrations/20261103120000_tarifas_flexibles_enums/{migration,down}.sql` — 5 enums (T1.1).
- `db/migrations/20261103120100_tarifas_flexibles_tablas/{migration,down}.sql` — 5 tablas, `cierre_detail.tarifa_modelo DEFAULT 'viejo'`, CHECKs, unicos (NULLS NOT DISTINCT a mano), indices, FKs simples y compuestas, RLS + `<t>_por_empresa`, GRANT y `REVOKE UPDATE, DELETE` de `cierre_detail_concepto` (T1.2). El down se para con RAISE si hay algun `cierre_detail` en `nuevo`.
- `db/migrations/20261103120200_tarifas_flexibles_misma_empresa/{migration,down}.sql` — GENERADA con `tsx scripts/generar-misma-empresa.ts --faltantes`: 10 triggers de FK + 5 `sin_cambio_de_empresa` (T1.3).
- `db/migrations/20261103120300_historial_tarifas_flexibles/{migration,down}.sql` — 5 tipos + 2 entidades, solo `ADD VALUE`; down con la funcion dinamica de SLT-76 renombrada `_slt52` (T1.4).

Codigo:
- `db/schema.prisma` — 5 enums, 5 modelos con sus `map`, inversas en Zona/ZonaDistrito/Usuario/Vehiculo/CierreDetail/GestionOrden/Organizacion, `CierreDetail.tarifaModelo`, 5+2 valores en `HistorialAccionTipo`/`HistorialAccionEntidad`.
- `lib/db/modelos-de-negocio.ts` — los 5 modelos como negocio (T1.5).
- `lib/db/fk-de-negocio.ts` — regla de la FK compuesta CUBIERTA por columna compartida (ver Decisiones).
- `lib/types/historial-accion.ts` — 5 tipos (4 `mueve_dinero`, 1 `hace_desaparecer`), 2 entidades, etiquetas (T1.4).
- `lib/types/historial-accion-etiquetas.ts` — fuentes/constructores de etiqueta de `tarifa_valor` y `grupo_distritos` (el mapa es exhaustivo: sin esto no compila).
- `lib/repositories/ApiKeyRepository.ts` — el `EXISTS` de `tarifas` tambien mira `tarifa_valor` (ver Decisiones).

Tests:
- NUEVO `tests/integration/db/tarifas-flexibles-migration.test.ts` (T1.6), base propia `slt52_tf_<rand>`.
- `tests/unit/guards/_unicos-sin-empresa.ts` — 3 anclados: `cierre_detail_concepto_cierre_detail_id_concepto_key`, `gestion_pago_congelado_gestion_orden_id_actor_key`, `grupo_distritos_id_zona_id_key`.
- `tests/unit/guards/rls-por-empresa.guardia.test.ts` — 80 → 85 tablas.
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` — 75 → 80 tipos y lista nueva `ESCRITOR_PENDIENTE_EN_CURSO` (ver Decisiones).
- `tests/fixtures/api-key-dependencias-usuario.ts` — clasifica `TarifaValor.tienda` (bloquea), `.mensajero` y `.actualizadoPorUsuario` (no_alcanzable).
- `tests/unit/db/fk-de-negocio.test.ts` — 3 casos de la regla nueva (acepta; lanza si falta la FK simple en origen o en destino).
- `tests/integration/db/api-key-eliminabilidad.test.ts` — caso nuevo «precio propio en `tarifa_valor` → `tarifas: true`».
- Colas de enum del historial actualizadas (+5 tipos / +2 entidades): `caja-459-migration`, `correccion-resultado-gestion-migration`, `historial-accion-{cobro-tienda,conciliacion-bodega,orden-zona-reconciliada,pago-mensajero-ajustado,zona-pago-mensajero,zona-sinpe}-migration`, `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`.

### Base local

- `DATABASE_URL` comprobada solo como booleano: presente y `localhost` (sin `DIRECT_URL`). Los comandos se corrieron con `node --env-file=../../.env` (el worktree no tiene `.env`).
- `prisma generate` corrido (node_modules compartido: el cliente ya conoce `tarifa_modelo` y las 5 tablas; otro worktree contra una base SIN estas migraciones vera `column (not available) does not exist` en `cierreDetail.create`).
- `prisma migrate deploy` aplico las 4. Luego se bajaron 0300/0200/0100 con sus `down.sql` (+ borrado de sus filas en `_prisma_migrations`), se corrigio el nombre de un indice de >63 caracteres (drift) y se volvieron a aplicar. Estado final: `migrate diff --from-config-datasource --to-schema` → «This is an empty migration» (sin drift).

### Salida real

- `tests/integration/db/tarifas-flexibles-migration.test.ts`: **20 passed (20)**, Duration 4.30s. Sin base (`env -u DATABASE_URL`): **3 passed | 17 skipped** (los 17 con nombre, `describe.skipIf`).
- `pnpm run test:guardias` (`vitest run guard`): **1 failed | 325 passed (326) files; 4 failed | 4552 passed | 1 skipped**. Los 4 rojos son `dependencias-declaradas-presentes.guardia` (el `init.sh` de HEAD no invoca `scripts/verificar-dependencias.mjs`: `git show HEAD:init.sh | grep -c verificar-dependencias` = 0). Preexistente, ajeno a T1.
- `tests/unit/tarifas/respaldo-identico.test.ts`: **49 passed (49)**. Con `tests/unit/db/fk-de-negocio.test.ts`: 61 passed (61).
- `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`: **exit 0**.
- `eslint` sobre los 22 `.ts` tocados: **exit 0**, sin avisos.
- Tests del historial tocados + `api-key-eliminabilidad` + `zona-central-guarda-y-rastro` (11 archivos): **10 passed | 1 failed; 175 passed | 6 failed**. Los 6 rojos son casos PREEXISTENTES de `api-key-eliminabilidad` (R8, R9, R10, «cada cuenta», «otra tienda»): `referencia a otra empresa: tarifas.zona_id -> zona` / `orden.tienda_id` — siembran con la zona de `fksDeOrden()` (otra empresa) en una transaccion con empresa nueva (SL017). El caso NUEVO de SLT-52 y «cuenta LIMPIA» pasan.
- Rojos preexistentes vistos de paso y NO tocados: `historial-accion-migration` (politicas/FK de SL-17), `orden-traspaso-migration`, `wallet-458-migration`, `abono-tienda-457-migration` (colas de `wallet_categoria`, no del historial), `wallet-461-migration (a)` (corte `slice(-6,-4)` obsoleto desde SL-36), `455/snapshot-lectura` (base sin zona central).
- `vitest related`: ver abajo.

### Contrapruebas (mutacion en `20261103120100_tarifas_flexibles_tablas/migration.sql`, sin commitear; el test construye su base desde el archivo; restaurado con `cp` + `cmp` tras cada una)

(a) Quitar el CHECK `tarifa_valor_iva_solo_tienda`:
```
 × R4: un cobro a la tienda sin IVA, o con IVA fuera de 0..100, se rechaza; 0 y 13 se aceptan 12ms
 × R45 (P4): un pago al mensajero o a la satelite con IVA 0 o 13 se rechaza; con IVA NULL se acepta 10ms
 Tests  2 failed | 18 passed (20)
```
(b) Quitar `NULLS NOT DISTINCT` de `tarifa_valor_nivel_key`:
```
 × R8: dos valores del MISMO nivel (con NULLs) se rechazan; niveles distintos del mismo concepto conviven 11ms
AssertionError: se esperaba rechazo por tarifa_valor_nivel_key: expected { ok: true } to deeply equal { ok: false, code: '23505', constraint: 'tarifa_valor_nivel_key' }
 Tests  1 failed | 19 passed (20)
```
(c) Quitar el `REVOKE UPDATE, DELETE` (y dar UPDATE/DELETE en el GRANT):
```
 × R43: con `servi_app`, UPDATE y DELETE de `cierre_detail_concepto` dan 42501; el INSERT y el re-congelado del pago, no 15ms
AssertionError: expected { ok: true } to match object { ok: false, code: '42501' }
 Tests  1 failed | 19 passed (20)
```
(d) Politica `tarifa_valor_por_empresa` abierta (`USING (true) WITH CHECK (true)`):
```
 × R15: con `servi_app` y la empresa A no se ve, ni se escribe, ni se borra nada de B en las cinco tablas 18ms
AssertionError: tarifa_valor: expected { propias: 1, deB: 1 } to deeply equal { propias: 1, deB: +0 }
 Tests  1 failed | 19 passed (20)
```
Tras restaurar: 20 passed (20).

### Decisiones tecnicas

1. **FK compuestas vs guardia R39.** `fkDeNegocio` lanzaba ante cualquier FK compuesta entre modelos de negocio (y el generador de T1.3 con ella). Se añadio una regla estrecha: la compuesta queda cubierta si comparte una columna que es FK simple de negocio al MISMO modelo en origen y destino (aqui `zona_id` → `Zona`). Por eso `GrupoDistritosDistrito` lleva ademas una FK simple `zona_id → zona` CASCADE. La guardia sigue roja para la compuesta sin esa columna (su caso existente no cambio) y hay 3 tests unitarios nuevos.
2. **`ESCRITOR_PENDIENTE_EN_CURSO`** en la guardia del historial: T1.4 mete los 5 tipos y sus productores llegan en T6.2. La lista solo puede bajar: si el censo declara el productor, la entrada pone la guardia en rojo hasta quitarla. Debe quedar vacia de SLT-52 antes de T7.4.
3. **`ApiKeyRepository`**: la guardia 373 exige clasificar toda FK a `usuario`. `TarifaValor.tienda` es CASCADE como `Tarifa.tienda`, y la decision humana de 2026-09-04 dice que una tarifa no desaparece al «eliminar una API key»; se extendio el `EXISTS` de `tarifas` a `tarifa_valor` (una linea) con su caso de integracion.
4. `gestion_pago_congelado` lleva, ademas de los dos CHECK del design, `concepto_del_actor` y `base_solo_porcentaje` (el design dice «base solo en porcentaje»). Ninguna columna de IVA.
5. Nombre de indice `grupo_distritos_distrito_organizacion_id_zona_id_distrito_i_key`: el de Prisma truncado a 63; con el truncado de Postgres habia drift.

### Verificacion del implementer (re-ejecutado antes del commit de T1)

- `migrate status` contra la base local (localhost, comprobado como booleano): 293 migraciones, «Database schema is up to date!».
- 15 archivos (el nuevo + los 13 tests modificados + respaldo-identico): **14 passed | 1 failed files; 344 passed | 6 failed**. Los 6 rojos son de `api-key-eliminabilidad` (R8 x2, R9, R10, «cada cuenta», «otra tienda»), archivo listado en `tests/baseline-rojos.json` (SL-11, app vacia, desde 2026-10-22). El caso nuevo de SLT-52 pasa.
- `tarifas-flexibles-migration.test.ts` solo: **20 passed (20)**; sin `DATABASE_URL`: **3 passed | 17 skipped**.
- Contraprueba propia: CHECK `tarifa_valor_iva_solo_tienda` cambiado a `TRUE OR TRUE` →
  ```
  × R4: un cobro a la tienda sin IVA, o con IVA fuera de 0..100, se rechaza; 0 y 13 se aceptan 34ms
  × R45 (P4): un pago al mensajero o a la satelite con IVA 0 o 13 se rechaza; con IVA NULL se acepta 20ms
  Tests  2 failed | 18 passed (20)
  ```
  Restaurado (`cmp` igual, `git diff` limpio en el archivo) → 20 passed.
- `pnpm run test:guardias`: 1 failed | 322 passed | 3 skipped files; 4 failed, todos en `dependencias-declaradas-presentes.guardia` (listado en `tests/baseline-rojos.json`).
- typecheck (8 GB): exit 0. eslint sobre todos los `.ts` tocados o nuevos: exit 0.
- Cambios fuera de las rutas previstas de T1, revisados y conservados (todos los fuerza T1): `fk-de-negocio.ts` (regla de FK compuesta cubierta; sin ella el generador de T1.3 lanza), `ApiKeyRepository.ts` (la guardia de FKs a `usuario` exige clasificar `tarifa_valor.tienda_id`, que es CASCADE), `historial-accion-etiquetas.ts` (mapa exhaustivo, no compila sin los 5 tipos), fixture de api-key, colas de enum en 8 tests de migracion del historial y catalogo, y los conteos de las guardias rls/historial. Añadidos a «Archivos esperados» de `tasks.md`.

### Riesgo para el leader (fuera de T1, no tocado)

`ZonaRepository.update` (`lib/repositories/ZonaRepository.ts:568`) hace `zonaDistrito.deleteMany({ zonaId })` + `createMany` en CADA guardado de la zona. Con la FK compuesta CASCADE de R12, **guardar una zona vaciara todos sus grupos de distritos** aunque no cambie ningun distrito. El esquema es el del design; lo que hay que cambiar es el repositorio (borrar solo los que salen, crear solo los que entran) antes de que existan grupos (T6 o SLT-54).

## Mapa R<n> -> test

| R | Test |
|---|---|
| R36 | `tests/unit/tarifas/respaldo-identico.test.ts` (49 casos, modelo viejo; E2E en T7.3) |
| R1 | Parcial en T1: el enum `tarifa_concepto` (17 valores, 5 resultados × 3 actores + fulfillment + comision) existe en la base y en Prisma; lo usan todos los casos de `tarifas-flexibles-migration.test.ts`. La comparacion catalogo↔enum↔`GestionResultado` es T2.1. |
| R4 | `tarifas-flexibles-migration.test.ts` › «R4: valor negativo…», «R4: un porcentaje sobre 100…», «R4: un cobro a la tienda sin IVA…» (base). El lado service es T6.2. |
| R7 | `tarifas-flexibles-migration.test.ts` › «R7: cada nivel incompatible con su actor…», «R7/R11: un valor con un grupo de OTRA zona…» (base). Service en T6.2. |
| R8 | `tarifas-flexibles-migration.test.ts` › «R8: dos valores del MISMO nivel (con NULLs)…» (unico; el upsert/reemplazo es T6). |
| R10 | `tarifas-flexibles-migration.test.ts` › «R10: el nombre es unico dentro de la zona…» (base). Service en T6.2. |
| R11 | `tarifas-flexibles-migration.test.ts` › «R11: un distrito en DOS grupos…» y «R7/R11: …grupo de OTRA zona…» (base). Service en T6.2. |
| R12 | `tarifas-flexibles-migration.test.ts` › «R12: sacar un distrito de la zona lo saca del grupo; borrar el grupo…». Ver riesgo de `ZonaRepository.update`. |
| R14 | Parcial en T1: tipos y entidades en la base (`20261103120300`, ida y vuelta en «R44: el down de las cuatro…») y en `lib/types/historial-accion.ts` (`catalogo-y-choke-point.test.ts`, 80 tipos / 29 entidades). La escritura con antes/despues en la transaccion es T6.2/T6.4. |
| R15 | `tarifas-flexibles-migration.test.ts` › «R15: con `servi_app` y la empresa A no se ve…» (RLS de las 5 tablas) y «R15: ni siquiera como dueño… (SL017)» (triggers de misma empresa). Repositorios en T3.4/T6.4. |
| R34 | Parcial en T1: `tarifas-flexibles-migration.test.ts` › «R34/R45: `gestion_pago_congelado` no tiene columna de IVA…» y el estatico «R34/R45: … no declara ninguna columna de IVA». El calculo sin IVA es T4.2. |
| R42 | `tarifas-flexibles-migration.test.ts` › «R44/R42: el up no mueve ninguna fila… todo cierre_detail queda en `viejo`». La lectura igual que hoy es T5.3/T5.4. |
| R43 | `tarifas-flexibles-migration.test.ts` › «R43: con `servi_app`, UPDATE y DELETE de `cierre_detail_concepto` dan 42501…». |
| R44 | `tarifas-flexibles-migration.test.ts` › «R44/R42: el up no mueve ninguna fila…», «R44: ninguna escribe filas en las tablas del modelo viejo…» (estatico) y «R44: el down de las cuatro deja catalogos y conteos como antes…». |
| R45 | `tarifas-flexibles-migration.test.ts` › «R45 (P4): un pago al mensajero o a la satelite con IVA 0 o 13 se rechaza; con IVA NULL se acepta» (base). El lado zod/service es T2.4/T6.2. |
