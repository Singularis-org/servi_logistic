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
- `vitest related --run` sobre los 5 `lib/` tocados: NO concluyo — `timeout 1700` lo corto (EXIT=124) sin resumen: `historial-accion.ts` y `modelos-de-negocio.ts` arrastran casi toda la suite. No se reintento; los archivos que dependen de verdad de lo tocado se corrieron arriba uno a uno.

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

### Censos desfasados por T1 (rojos del gate del leader sobre 2025516d)

- `scripts/verificar-rls-despliegue.ts`: `TRIGGERS_MISMA_EMPRESA` 156 → 166 (los 10 `sme_*` de 20261103120200). Base local contada en `pg_trigger`/`pg_policies`: sme_*=166, sin_cambio=85, `*_por_empresa`=86.
- `tests/unit/scripts/verificar-rls-despliegue.test.ts`: `MODELOS_DE_NEGOCIO` 80 → 85 (literal), `contratoEsperado()` {81,156,80} → {86,166,85}, y los 156 de DOS_MODELOS/SL-19 → 166. 4 passed.
- `tests/unit/historial-accion/lectura-borde-y-servicio.test.ts`: `10 + 12`/22 → `11 + 12`/23 por `grupo_distritos_borrado` (hace_desaparecer, design §3). 39 passed.
- Re-ejecutado por el implementer junto con `catalogo-y-choke-point` y la guardia `rls-por-empresa`: 4 files, 116 passed.
- Títulos de `it` con números viejos ANTERIORES a T1, no tocados: `catalogo-y-choke-point.test.ts:74` y `:451`, `historial-accion-escrituras-cubiertas.guardia.test.ts:1134` y `:1216`.
- Riesgo de `ZonaRepository.update` convertido en la task T6.5 (decisión del leader 2026-11-02).

### Riesgo para el leader (fuera de T1, no tocado)

`ZonaRepository.update` (`lib/repositories/ZonaRepository.ts:568`) hace `zonaDistrito.deleteMany({ zonaId })` + `createMany` en CADA guardado de la zona. Con la FK compuesta CASCADE de R12, **guardar una zona vaciara todos sus grupos de distritos** aunque no cambie ningun distrito. El esquema es el del design; lo que hay que cambiar es el repositorio (borrar solo los que salen, crear solo los que entran) antes de que existan grupos (T6 o SLT-54).

## T2

MCP `codebase-memory` no respondio (timeout de conexion): todo con Grep/Read. Sin dependencias nuevas.

### Archivos (todos nuevos)

- `lib/tarifas/catalogo.ts` (T2.1) — `CATALOGO_CONCEPTOS` (`satisfies Record<TarifaConcepto, …>`: actor, resultado, base), tipos `ConceptoTienda`/`ConceptoPago`/`ActorPago`, `CONCEPTOS`, `CONCEPTOS_TIENDA`, `CONCEPTOS_PAGO`, `esConceptoTienda`/`esConceptoPago`, `actorDe`, `conceptoPorResultado` (lanza si un resultado no esta catalogado). Solo imports de tipo.
- `lib/tarifas/precedencia.ts` (T2.2) — `rangoCobro`, `rangoPago`, `elegirCobros`, `elegirPagos`, `whereValores`, tipos `FilaValor`, `ContextoCobro`, `ContextoPago`, `ValorElegido`, `Eleccion`, `WhereValores`. Solo imports de tipo.
- `lib/tarifas/calculo.ts` (T2.3) — `importeDe(valor: ValorPago | ValorCobro, base: Decimal): Decimal`, `ivaDe(valor: ValorCobro, importe: Decimal): Decimal`, HALF_UP a 2.
- `lib/types/tarifa-flexible.ts` (T2.4) — `ValorPago`, `ValorCobro`, `ValoresTienda`, `TarifaTienda`, `TarifaPago`, `ModoTarifa`; `escrituraCobroSchema`, `escrituraPagoSchema`, `escrituraValorSchema` (zod 4 `discriminatedUnion("concepto")`), `EscrituraValorInput`.
- Tests: `tests/unit/tarifas/{catalogo,precedencia,calculo,esquemas-escritura}.test.ts`.

### Salida real

- `node node_modules/vitest/vitest.mjs run tests/unit/tarifas/`: **Test Files 5 passed (5); Tests 179 passed (179)**. Por archivo: catalogo 26 passed, precedencia 62 passed, calculo 15 passed, esquemas-escritura 27 passed, respaldo-identico 49 passed (sin cambios).
- `pnpm exec vitest related --run` (4 `lib/` nuevos + 4 tests): **REL_EXIT=0; Test Files 4 passed (4); Tests 130 passed (130)**.
- `pnpm run test:guardias`: **Test Files 1 failed | 322 passed | 3 skipped (326); Tests 4 failed | 4529 passed | 24 skipped (4557)**. Los 4 rojos son `dependencias-declaradas-presentes.guardia` (R2, R6, R2/R6, R4), baseline.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: **exit 0** (incluye el `@ts-expect-error` de `ivaDe(valorPago)`: si sobrara, tsc daria TS2578).
- `pnpm exec eslint lib/tarifas lib/types/tarifa-flexible.ts tests/unit/tarifas`: **exit 0**, sin avisos.

### Contrapruebas (mutacion a mano, `cp` a respaldo, ejecutar, restaurar con `cp` + `cmp`, verde confirmado)

(1) T2.1 — `RESULTADOS` del test con un valor ficticio (`[...Object.values(GestionResultado), "extraviado"]`):
```
     × resultado extraviado tiene exactamente un concepto para tienda 4ms
     × resultado extraviado tiene exactamente un concepto para mensajero 1ms
     × resultado extraviado tiene exactamente un concepto para satelite 0ms
AssertionError: expected [] to have a length of 1 but got +0
      Tests  3 failed | 26 passed (29)
```
Restaurado: 26 passed (26).

(2a) `precedencia.ts`, cobro: `tienda_general` devuelve 2 y `tienda_zona` 3:
```
     × tienda en la zona → 2 9ms
     × tienda en todas sus zonas → 3 1ms
     × orden sin grupo: tienda en la zona sigue → 2 0ms
     × quitando los niveles anteriores, gana tienda_zona 3ms
     × quitando los niveles anteriores, gana tienda_general 2ms
     × R17: la tienda sin pacto en el grupo pero con pacto en la zona usa su zona antes que el grupo 1ms
     × R16: la eleccion es independiente por concepto (la tienda pacta solo el flete por entregado) 1ms
     × varios contextos en una sola llamada eligen cada uno lo suyo 1ms
      Tests  8 failed | 54 passed (62)
```
(2b) `precedencia.ts`, pago: `grupo` devuelve 4 y `zona_vehiculo` 3 (decision P2). En la primera pasada el caso «P2» sobrevivio porque solo miraba la etiqueta del nivel (el rango 3 sigue llamandose «grupo»); se reforzo para mirar la FILA ganadora y se repitio:
```
     × P2: el grupo para todos gana a la zona para su vehiculo 1ms
 FAIL  tests/unit/tarifas/precedencia.test.ts > elegirPagos · … > P2: el grupo para todos gana a la zona para su vehiculo
      Tests  10 failed | 52 passed (62)
```
Restaurado: 62 passed (62).

(3) `calculo.ts`:
- (3a) `ROUND_HALF_UP` → `ROUND_HALF_EVEN`:
```
     × HALF_UP en el medio exacto: 100.10 * 5% = 5.005 → 5.01 (HALF_EVEN daria 5.00) 5ms
     × un monto con mas de 2 decimales (no deberia llegar: numeric(12,2)) se redondea HALF_UP 1ms
     × el IVA va sobre el importe REDONDEADO aunque llegue sin redondear: 5.005 → 5.01 → 50% = 2.505 → 2.51 1ms
     × encadenado: 100.10 al 5% → 5.01; IVA 50% → 2.51 0ms
      Tests  4 failed | 11 passed (15)
```
- (3b) `ROUND_HALF_DOWN` (ademas cae el caso 204 de 589.30):
```
     × 204: 14900.00 al 3.50% → 521.50; IVA 13% = 67.795 → HALF_UP 67.80; total 589.30 1ms
      Tests  5 failed | 10 passed (15)
```
- (3c) IVA sobre el importe sin redondear (`round2(importe.mul(…))`):
```
     × el IVA va sobre el importe REDONDEADO aunque llegue sin redondear: 5.005 → 5.01 → 50% = 2.505 → 2.51 5ms
      Tests  1 failed | 14 passed (15)
```
- (3d) `importeDe` sin `round2` (encontrado al revisar: `toFixed(2)` redondea al pintar y lo tapaba; se añadio la asercion con `toString()`):
```
     × porcentaje redondea antes de devolver: 16618.40 * 3.50% = 581.644 → 581.64 4ms
      Tests  1 failed | 14 passed (15)
```
Restaurado: 15 passed (15).

(4) `tarifa-flexible.ts`: borrada la linea `ivaPct: z.never(…).optional()` del esquema de pago:
```
     × mensajero_entregado con ivaPct "13.00" → rechazo en `ivaPct` 4ms
     × mensajero_rechazo con ivaPct "0" → rechazo en `ivaPct` 1ms
     × satelite_entregado con ivaPct "0.00" → rechazo en `ivaPct` 0ms
     × satelite_incidente con ivaPct "13" → rechazo en `ivaPct` 0ms
     × un pago con `ivaPct: null` tampoco pasa (no hay IVA que anular) 0ms
      Tests  5 failed | 22 passed (27)
```
Restaurado: 27 passed (27).

No ejecutada: quitar el `@ts-expect-error` / dar `ivaPct` a `ValorPago` y correr typecheck. Lo cubre el propio tsc (TS2578 si la directiva sobra), pero no se mutó a mano.

### Censos

Buscados con Grep: listas de carpetas de `lib/`, `readdirSync` sobre `lib`/`lib/types`, guardias que nombren `lib/tarifas` o `tarifa-flexible`. Ninguno cuenta lo que T2 añade; `pnpm run test:guardias` sin rojos nuevos. **Ningun censo ajustado.** Un comentario de `tarifa-flexible.ts` que citaba `parseFloat` se reescribio para no darle falso positivo a ninguna guardia de dinero.

### Decisiones

1. **`elegir` partido en `elegirCobros` / `elegirPagos`** (design §4 da una sola `elegir(filas, contextos, conceptos)`): los contextos de cobro y de pago son tipos distintos; las dos comparten un `elegir` privado. En `elegirPagos` el actor de cada concepto sale del catalogo, asi que mensajero y satelite se eligen en la misma llamada. Devuelven `{ fila, nivel }` (`ValorElegido`); la conversion a `ValorCobro`/`ValorPago` es del resolver (T3.2).
2. **`ValorCobro` no `extends ValorPago`** (design §5 lo escribe asi): los dos extienden una base comun y estrechan `concepto` (`ConceptoTienda` vs `ConceptoPago`). Con `extends`, `ValorPago.concepto` tendria que admitir conceptos de tienda. `importeDe` acepta `ValorPago | ValorCobro`; `ivaDe` solo `ValorCobro`.
3. **`ivaDe` redondea `importe` antes de aplicar el IVA** aunque `importeDe` ya lo devuelve redondeado: R26 dice «sobre el importe ya redondeado» y asi no depende de quien llame.
4. **Escritura**: decimales validados con regex sobre texto (sin pasar a numero); `ivaPct` del pago es `z.never().optional()` (ausente o `undefined` pasan; `"0"` y `null` no), con el error en la ruta `ivaPct`. La compatibilidad nivel↔actor (R7), existencia de zona/grupo/tienda y el rol de la tienda quedan en el service (T6.2), como dice design §8; el esquema solo valida forma, rangos e IVA.
5. **Ids** con `z.string().min(1)` como `lib/types/tarifa.ts`, no `z.uuid()`.
6. `rangoCobro`/`rangoPago` devuelven `null` para filas que los CHECK ya prohiben (cobro con vehiculo/mensajero, pago con tienda): una fila mal formada nunca gana.

### Preguntas de negocio abiertas

Ninguna nueva.

## T3

MCP `codebase-memory` no respondio (timeout de conexion): todo con Grep/Read. Sin dependencias nuevas. Ninguna raiz de composicion en el diff (`git status` no toca `app/`, `lib/actions/` ni `scripts/`): los dos constructores siguen recibiendo `prisma`.

### Archivos

Produccion:
- NUEVO `lib/repositories/_shared/resolver-tarifas.ts` (T3.2) — `usaModeloNuevo`, `resolverCobrosCon`, `resolverPagosCon`; helpers exportados para el test de Postgres: `gruposDeDistritos` (WHERE de grupos) y `valoresCandidatos` (WHERE de valores, con `whereValores`). La proyeccion vieja de `tarifas` (`toTarifaVigenteResuelta`) y `resolvePagoTarifaCon` (398) se movieron aqui SIN cambiar su regla.
- NUEVO `lib/tarifas/solo-modelo-viejo.ts` — puente de transicion `soloModeloViejo(t, superficie)` / `ModeloNuevoSinSoporte` (ver Desvios).
- `lib/utils/cascada-tarifa.ts` (T3.1) — `ParTarifa.distritoId: string | null` obligatorio; `clavePar` = `tienda|zona|distrito`.
- `lib/repositories/TarifaVigenteRepository.ts` (T3.3) — fachada: `resolveTarifa(tiendaId, zonaId, distritoId)` y `resolveTarifas(pares, tx?)` devuelven `TarifaTienda | null`. Mismo constructor.
- `lib/repositories/TarifaZonaMensajeroRepository.ts` (T3.3) — fachada; `resolvePagos(ctxs, tx?)` nuevo; `resolvePagoTarifa` intacto; reexporta `resolvePagoTarifaCon` para no tocar `CierresAdminRepository` antes de T5.1. Mismo constructor.
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts` — `TarifaTxClient` ampliado a `tarifa | tarifaValor | grupoDistritosDistrito`; firmas nuevas.
- `lib/interfaces/repositories/ITarifaZonaMensajeroRepository.ts` — `PagoTarifaTxClient` y `resolvePagos`.
- `lib/types/tarifa-flexible.ts` — `ContextoPagoGestion` (design §5) vive aqui y no en el repositorio, para que la interfaz no dependa de `lib/repositories`.
- `lib/utils/ingreso-empresa.ts` — `fleteSinIvaDeGestion(resultado, valores, montoCobrar)` (minimo de T4.1 que pide T3.2; ver Desvios).
- `lib/interfaces/repositories/IOrdenRepository.ts`, `lib/repositories/OrdenRepository.ts` — `distritoId` en `ApiOrdenCosteoRow` (select de la API por key) y en `OrdenBaseCobroDevolucionRow` (`findBaseCobroDevolucion`); pares del listado con `row.distritoId`.
- Llamadores (abajo): `CierreDiaRepository`, `ApiOrdenLecturaService`, `BulkOrdenService`, `CotizacionOrdenService`, `RechazoTiendaService`, `CorregirDatosClienteService`.

Tests:
- NUEVOS `tests/integration/db/tarifas-flexibles-resolver.test.ts` (T3.4), `tests/integration/db/tarifas-flexibles-respaldo.test.ts` (T3.5), `tests/unit/guards/tarifas-distrito-pasado.guardia.test.ts` (exigencia del leader), `tests/fixtures/tarifa-tienda.ts` (`tarifaVieja`, `tarifaViejaDeFormula`, `mapaViejo`, `sinValoresDelModeloNuevo`).
- Ajustados (dobles a `TarifaTienda` viejo, pares con distrito, doble de Prisma con «empresa sin valores nuevos», `resolvePagos` en los dobles del pago; NINGUN importe cambiado): `tarifa-vigente-repository`, `cascada-tarifa` (+2 casos de la clave), `cierre-dia-repository`, `cotizacion-orden-service`, `rechazo-tienda-service`, `api-orden-lectura-service`, 5 × `corregir-*` (+1 caso del distrito por ubicacion en `corregir-ubicacion-importes`), 5 × `bulk-orden-service.*`, `api-key-carga-tope-plan`, 7 × `cierre-dia-*`/`corte-diario-*` (solo `resolvePagos: vi.fn`), `tarifa-especial-por-distrito`, `convergencia-tarifa-listado-cierre` (el interruptor tambien tiene que leerse DENTRO de la tx: el `prisma` de fuera lanza), `costo-orden-forma-unica.guardia`, `corregir-datos-cliente.composition-root`, `ordenes-api-key-composicion-415`, `asimetria-sin-tarifa`, `ordenes-api-key-{listado,orden-consulta,tienda-destino}.route`, `carga-api-key-sin-tarifa`, `cotizacion-api-key`, `cierre-detail-congelado`, fixture `api-orden-costeo-415`.

### Llamadores ajustados (ruta:linea, distrito de verdad)

- `lib/repositories/CierreDiaRepository.ts:1323-1327` y `:1352-1361` — `f.orden.distritoId` (ya estaba en `SNAPSHOT_SELECT`).
- `lib/repositories/OrdenRepository.ts:2123` (pares del listado) y `:1237` (busqueda) — `row.distritoId`.
- `lib/repositories/OrdenRepository.ts:338`, `:678` — `distritoId` anadido al select y al `costeo` de la API por key; `lib/services/ApiOrdenLecturaService.ts:49` (`parDe`) usado en `:65`, `:203`, `:269`.
- `lib/repositories/OrdenRepository.ts:2768`, `:2780` — `distritoId` en `findBaseCobroDevolucion`; `lib/services/RechazoTiendaService.ts:250`.
- `lib/services/BulkOrdenService.ts:568-575` — `orden.distritoId ?? null` (el campo es opcional en `CreateOrdenData`: «la fila no lo trae» = sin distrito; no es un null de relleno).
- `lib/services/CotizacionOrdenService.ts:114` (`parDe`, `geo.distritoId`) usado en `:122`, `:229`.
- `lib/services/CorregirDatosClienteService.ts:531` (actual: `orden.distritoId`), `:538` (propuesta: `distrito.id`), `:576`.

Ninguno pasa `null` literal (lo vigila la guardia). Quedan para T4.3 / T5.1 (no se tocaron; NO construyen pares ni contextos con distrito todavia):
- T4.3 — `lib/repositories/OrdenRepository.ts:2111-2131` (`resolverTarifasDePagina`): el LISTADO sigue con su propia consulta a `tarifas` (`whereCascada` + `elegirPorCascada`), no con el resolver unico. Ya lleva el distrito en el par, pero una empresa en el modelo nuevo veria en el listado la tarifa vieja. Debe pasar al resolver en T4.3 (R38).
- T4.3 — los 6 `soloModeloViejo(...)`: `CierreDiaRepository.ts:1352`, `ApiOrdenLecturaService.ts:164`, `BulkOrdenService.ts:586`, `CotizacionOrdenService.ts:229`, `RechazoTiendaService.ts:253`, `CorregirDatosClienteService.ts:575` (el de `CierreDiaRepository` es de T5.2).
- T5.1 — pago por gestion: `lib/services/CierreDiaService.ts:279`, `:621`, `:697`; `lib/services/CorteDiarioService.ts:199`; `lib/repositories/CierresAdminRepository.ts:1727` siguen con `resolvePagoTarifa(zona, vehiculo)` / `resolvePagoTarifaCon`, sin distrito ni `ContextoPagoGestion`. `CierreGestionPendienteRow` necesita `distritoId`, `tiendaId`, `zonaOrdenId`, `montoCobrar`, `cobraComision` (T5.1).

### Salida real

Base local: `DATABASE_URL` comprobada solo como booleano (presente, `localhost`); los de Postgres con `node --env-file=../../.env node_modules/vitest/vitest.mjs run …`.

- `tests/integration/db/tarifas-flexibles-resolver.test.ts`: **29 passed (29)**. Sin base (`env -u DATABASE_URL`), junto con el de respaldo: **2 skipped files, 38 skipped** (con nombre, `describe.skip`).
- `tests/integration/db/tarifas-flexibles-respaldo.test.ts`: **9 passed (9)**.
- `tests/unit/guards/tarifas-distrito-pasado.guardia.test.ts`: **3 passed (3)**.
- Existentes pedidos: `cascada-tarifa` 28 passed (28), `tarifa-vigente-repository` 21 passed (21), `tarifa-zona-mensajero-repository` 4 passed (4), `convergencia-tarifa-listado-cierre` 6 passed (6), `respaldo-identico` (T0.1, literales sin tocar) 49 passed (49), `tarifas-flexibles-migration` 20 passed (20).
- Los 103 archivos que no van a Postgres y tocan resolvers, pares o superficies (los ajustados mas sus vecinos): **Test Files 103 passed (103); Tests 2086 passed (2086)**.
- Los 31 de `tests/integration/db/` que tocan resolvers o cierres, con base: **13 passed | 18 failed files**; los 18 rojos estan TODOS en `tests/baseline-rojos.json` (zona central y `ayuda_tienda` sin sembrar, `orden.create` de app vacia…); ninguno nombra codigo de esta tanda. `cierre-detail-congelado` (fuera del baseline) cayo por su doble de Prisma sin `tarifaValor` y se arreglo: 7 passed.
- `vitest related --run` sobre todos los archivos tocados de `lib/` y `tests/` (con `--env-file`): **REL_EXIT=1; Test Files 164 failed | 707 passed (871); Tests 393 failed | 10246 passed | 719 skipped**. De los 164 archivos rojos, 163 estan en `tests/baseline-rojos.json`; el unico fuera, `tests/unit/repositories/orden-repository.no-regresion-106.test.ts`, era un censo (abajo) y se ajusto → 7 passed. Ningun mensaje de error del log nombra `resolver-tarifas`, `soloModeloViejo`, `tarifaValor` ni `clavePar`.
- `pnpm run test:guardias`: primera pasada **2 failed | 322 passed | 3 skipped files; 5 failed tests**: 4 de `dependencias-declaradas-presentes` (baseline) y 1 de `rechazo-nombre-466` («cobro por rechazo» en la etiqueta de `soloModeloViejo` de `RechazoTiendaService.ts:253`, frase retirada por la 466): renombrada a «RechazoTiendaService: cobro a la tienda» → `rechazo-nombre-466` 13 passed. Segunda pasada completa: **Test Files 1 failed | 323 passed | 3 skipped (327); Tests 4 failed | 4532 passed | 24 skipped**, los 4 de `dependencias-declaradas-presentes` (baseline).
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: **exit 0**, 0 errores.
- `pnpm exec eslint` sobre los 59 `.ts` tocados o nuevos: **exit 0; 0 errors, 14 warnings**, todos preexistentes (`IOrdenRepository.ts:11` import sin uso; parametros `_ordenId/_data/_estadosBloqueados` de los dobles de `corregir-*` y `_input` de `corte-diario-seleccion`). Los 4 avisos que metio esta tanda (`_distritoId`/`_d` en dobles) se quitaron.

### Contrapruebas (a mano, una a una; `cp` a respaldo, correr, restaurar con `cp` + `cmp`, `git diff --quiet` en el archivo versionado)

(a) `lib/tarifas/precedencia.ts`, `rangoCobro`: `tienda_general` → 2 y `tienda_zona` → 3:
```
× R16: quitando los niveles anteriores, gana tienda_zona 80ms
× R16: quitando los niveles anteriores, gana tienda_general 114ms
× R17: la tienda sin pacto en su grupo pero con pacto en la zona usa su zona antes que el grupo 91ms
× R18: una orden SIN distrito salta los niveles de grupo (gana tienda_zona; sin tienda, la zona) 78ms
-   "valor": "1002.00",
+   "valor": "1003.00",
Tests  4 failed | 25 passed (29)
```
(a2) misma idea en el pago, `rangoPago`: `grupo` → 4 y `zona_vehiculo` → 3 (decision P2):
```
× R19: quitando los niveles anteriores, gana grupo 57ms
× R19: quitando los niveles anteriores, gana zona_vehiculo 63ms
× R22: un mensajero sin vehiculo salta los niveles por vehiculo (gana el grupo para todos) 73ms
× R21: el distrito de la orden que no esta en ningun grupo de la zona del mensajero usa la zona 65ms
Tests  4 failed | 25 passed (29)
```
(b) quitar `zonaId` del WHERE de valores (`whereValores`, rama 1 `{ zonaId: { in } }` → `{}`). Medido: Prisma trata el `{}` dentro del `OR` como «no casa nada», asi que dejan de llegar todos los valores de zona y grupo:
```
× R16: quitando los niveles anteriores, gana tienda_grupo 477ms
× R16: quitando los niveles anteriores, gana tienda_zona 80ms
… (21 casos, entre ellos)
× R19: quitando los niveles anteriores, gana zona 48ms
× R28: la base del % es el flete sin IVA que se cobra a la tienda por ESA gestion 59ms
× el WHERE de valores no trae nada de una zona, tienda o mensajero que nadie pidio 52ms
Tests  21 failed | 8 passed (29)
```
(b2) la variante que ENSANCHA el WHERE (`{ zonaId: { not: null } }`: trae las zonas que nadie pidio). La eleccion en memoria la tapa (vuelve a exigir la zona), asi que solo la caza el caso que prueba el WHERE donde vive:
```
× el WHERE de valores no trae nada de una zona, tienda o mensajero que nadie pidio 63ms
AssertionError: cOtraZona: expected true to be false // Object.is equality
Tests  1 failed | 28 passed (29)
```
(c) quitar el filtro de grupo por zona (`gruposDeDistritos`):
- (c1) literal, solo el `zonaId` del WHERE de `grupo_distritos_distrito`: **sobrevive** (`Tests 29 passed (29)`). Es equivalente: la busqueda en memoria solo acepta una fila cuyo `(zona, distrito)` sea un par PEDIDO, y un distrito esta en una sola zona por empresa (unico SLT-75), asi que la fila de otra zona nunca casa. Se deja documentado, no se cuenta como contraprueba.
- (c2) el filtro por zona entero (WHERE sin zona Y la busqueda casando solo por distrito):
```
× R15: con la empresa A, ni pidiendo las zonas y tiendas de B se ve un valor de B 52ms
× R21: el grupo de un distrito se busca DENTRO de la zona pedida 56ms
+   "9effc4b4-…|08a4d08c-…": "cda53756-…",
+   "cb86690b-…|5656527b-…": "88fea994-…",
Tests  2 failed | 27 passed (29)
```
De punta a punta (eleccion) (c2) tambien es equivalente: `rangoCobro`/`rangoPago` exigen `fila.zonaId === ctx.zonaId` antes de mirar el grupo, y un grupo siempre lleva su zona. Por eso el WHERE de grupos se prueba directamente.

Guardia `tarifas-distrito-pasado` — `null` literal metido en un llamador real:
- `lib/services/ApiOrdenLecturaService.ts:50` `distritoId: fila.costeo.distritoId` → `distritoId: null`:
```
× ningun llamador de app/ o lib/ pasa `null` literal ni olvida el distrito 7ms
+   "lib/services/ApiOrdenLecturaService.ts:50 — par con `distritoId: null` literal",
Tests  1 failed | 2 passed (3)
```
- `lib/services/CorregirDatosClienteService.ts:576` `resolveTarifa(…, distritoId)` → `resolveTarifa(…, null)`:
```
× ningun llamador de app/ o lib/ pasa `null` literal ni olvida el distrito 12ms
+   "lib/services/CorregirDatosClienteService.ts:576 — resolveTarifa(...) con `null` literal como distrito",
Tests  1 failed | 2 passed (3)
```
Restaurados los dos (`cmp` igual) → 3 passed.

### Censos

Buscados con Grep: guardias que cuenten metodos de interfaces, archivos de `lib/repositories/_shared`, llamadores de los resolvers, raices de composicion o consultas. `pnpm run test:guardias` no dio rojos nuevos (abajo). Literales ajustados por contrato cambiado (no por la longitud de su fuente):
- `tests/unit/services/api-orden-lectura-service.test.ts` — `CLAVE_GAM` `store-1|<zona>` → `store-1|<zona>|`: es el formato de `clavePar`, que SLT-52 amplia con el distrito.
- `tests/unit/repositories/tarifa-vigente-repository.test.ts` — el singular devolvia `TarifaVigente` (sin `tarifaId`/`fulfillment`); ahora `TarifaTienda` igual que el lote (design §5). Caducidad escrita en el test.
- `toHaveBeenCalledWith` de pares en cotizacion (2 archivos), carga, rechazo, cierre-dia-repository y api-orden-lectura: el par lleva el distrito de la fila (`d1`, `d2`, `d6`, `dist-1` o `null`).
- `tests/unit/repositories/orden-repository.no-regresion-106.test.ts` — `SELECT_DETALLE_106` (proyeccion congelada del detalle de la API por key) gana `distritoId: true`: el `costeo` lo necesita para el par de la tarifa (R16/R18) y no se publica, igual que `zonaId`. Lo encontro `vitest related`.
- Nueva guardia con su censo literal: 8 archivos construyen pares y hay 1 llamada a `resolveTarifa`.
- `ESCRITOR_PENDIENTE_EN_CURSO` (guardia del historial) no cambia: T3 no escribe historial.

### Desvios del design

1. `fleteSinIvaDeGestion` es de T4.1 en el design; T3.2 la necesita para `baseFlete`. Se creo en `lib/utils/ingreso-empresa.ts` con lo minimo: `(resultado, valores: ValoresTienda, montoCobrar) → Decimal` = `importeDe(tienda_flete_<resultado>, pedido)` o `0`. **T4.1 debe hacer que la rama nueva de `derivarIngresoOrden` calcule su flete con ella** (si no, la base del pago y el cobro podrian divergir).
2. `soloModeloViejo` (puente de transicion): T3.3 cambia el tipo de vuelta del resolver a `TarifaTienda`, pero las funciones que calculan aprenden el modelo nuevo en T4.1/T4.3/T5. Hasta entonces cada superficie desenvuelve la rama vieja (codigo de hoy, R36) y, si la empresa estuviera en el nuevo, LANZA `ModeloNuevoSinSoporte` en vez de convertirlo en «sin tarifa» en silencio. Nadie escribe `tarifa_valor` hasta T6/SLT-54. Debe quedar sin llamadores y borrarse antes de T7.4.
3. `ContextoPagoGestion` vive en `lib/types/tarifa-flexible.ts` (el design lo describe junto al resolver) para que `ITarifaZonaMensajeroRepository` no importe de `lib/repositories`.
4. `resolvePagoTarifaCon` se movio al resolver unico (sin cambiar su cuerpo) y `TarifaZonaMensajeroRepository` lo reexporta: asi el resolver no importa la fachada (sin ciclo) y `CierresAdminRepository` sigue igual hasta T5.1.
5. Pago en el modelo viejo, R39: el resolver delega en `resolvePagoTarifaCon` una vez por par `(zona, vehiculo)` DISTINTO (en serie, puede correr en una tx). En un cierre ese par es uno (el del mensajero); reescribirlo como un `findMany` en lote seria una segunda implementacion de la regla de la 39/398.
6. Un par sin zona (`zonaId: null`, carga con zona desconocida) en el modelo nuevo solo alcanza «tienda en todas sus zonas»: se pasa `zonaId: ""` a la MISMA `rangoCobro` (ningun uuid casa con `""`), sin una segunda regla. Misma semantica que R6 de la 274.
7. El test de R39 cuenta el SQL que de verdad sale (`crearPrismaDeTestConEspia`): 3 consultas en el nuevo (interruptor, grupos, valores) y 2 en el viejo, iguales para 1 y para 50.

### Riesgo para el leader

`usaModeloNuevo` es un `findFirst` sin `where` sobre `tarifa_valor`: la empresa la ponen la extension y la RLS. Un cliente SIN extension y como dueno (algunos tests de integracion: `tx as unknown as PrismaClient` sobre el cliente base) veria valores de CUALQUIER empresa y pasaria al modelo nuevo. Los tests de esta tanda siembran `tarifa_valor` solo dentro de transacciones revertidas (no se conto la tabla de la base local: no se uso ningun cliente fuera de vitest). T5.4/T6.4 deben sembrar igual (rollback) o filtrar su empresa; si alguno commitea valores, los tests de cierre con cliente base podrian volverse intermitentes.

### Preguntas de negocio abiertas

Ninguna nueva.

### Veredicto T3

Resolver unico con interruptor por empresa, fachadas con el mismo constructor y distrito de verdad en todos los pares; verde en Postgres con 3 contrapruebas rojas (mas la de la guardia), typecheck 0 y guardias solo con el baseline. Sin commitear: queda para el leader.

### Lote con varias zonas (contraprueba del implementer)

Hueco: borrar `lib/tarifas/precedencia.ts:93` (`if (fila.zonaId !== ctx.zonaId) return null;`, tienda en zona) dejaba verde el archivo de integracion: con un solo par el WHERE `zonaId IN [Z]` ya excluye Z2. En un lote con dos zonas el WHERE trae filas de AMBAS y solo la eleccion lo impide.

Nuevo `describe` en `tests/integration/db/tarifas-flexibles-resolver.test.ts`, «SLT-52 resolver · un lote con varias zonas (R16, R19)», sobre la siembra existente (`afirmarSiembra` primero, sin filas nuevas: `VALORES_DE_A` sigue en 29):

- «R16: la MISMA tienda en Z y en Z2 en un lote: cada par toma el tienda_zona de SU zona»: `resolverCobrosCon(tx, [(T,Z,d3), (T,Z2,null)])` → Z = `1002.00` (`c2`), Z2 = `9002.00` (`cTiendaOtraZona`), los dos `tienda_zona`, `toEqual` literal con `tarifaValorId`.
- «R19/R20: el MISMO mensajero en Z y en Z2 en un lote: cada gestion toma la zona de SU contexto»: sin `p1`, `resolverPagosCon` con M en Z (d3, sin vehiculo) y en Z2 (sin distrito ni vehiculo) → `505.00` (`p5`) y `9103.00` (`pOtraZona`), nivel `zona`; satelite `605.00` en Z y `null` en Z2.

Los dos valores compiten en el mismo rango, asi que sin el filtro de zona uno de los dos pares sale mal sea cual sea el orden de las filas.

Mutaciones (copia en scratchpad, restaurada con `cp` + `cmp` OK; `git diff --quiet -- lib/tarifas/precedencia.ts` → 0):

1. Borrar linea 93 (`rangoCobro`) → `Tests 1 failed | 30 passed (31)`; cae «R16: la MISMA tienda en Z y en Z2...»:
   ```
   -   "tarifaValorId": "551a66ce-…",
   -   "valor": "9002.00",
   +   "tarifaValorId": "f1aa0c4c-…",
   +   "valor": "1002.00",
   ```
2. Borrar linea 120 (`rangoPago`, `if (fila.zonaId !== ctx.zonaId) return null;`) → `Tests 1 failed | 30 passed (31)`; cae «R19/R20: el MISMO mensajero en Z y en Z2...»:
   ```
   -   "valor": "9103.00",
   +   "valor": "505.00",
   ```

Verde final tras restaurar: `Test Files 1 passed (1)`, `Tests 31 passed (31)`. `npx eslint tests/integration/db/tarifas-flexibles-resolver.test.ts` → `No issues found`.

## Mapa R<n> -> test

| R | Test |
|---|---|
| R36 | `tests/unit/tarifas/respaldo-identico.test.ts` (49 casos, modelo viejo; E2E en T7.3) T3: `tarifas-flexibles-respaldo.test.ts` › «cobro: la tarifa de la tienda en su zona, con los importes de hoy y su `tarifaId`», «cobro: otra tienda en la zona cae al nivel 3…», «cobro: un par sin ninguna fila sigue siendo `null`…», «pago: con vehiculo la tarifa exacta, sin vehiculo la de la zona…» (literales, Postgres). Los dobles de los tests existentes se envolvieron en `{ modelo: "viejo" }` sin tocar un importe. T4: `respaldo-identico.test.ts` comprueba cada caso tambien envuelto en `{ modelo: "viejo" }` contra el mismo literal. |
| R1 | `catalogo.test.ts` › «tiene los mismos conceptos que el enum de la base…», «son 17…», «los conceptos de cobro a la tienda son los siete esperados…», «fulfillment y comision COD son de la tienda y no dependen de ningun resultado», «ningun concepto de pago… existe sin un resultado de gestion». En la base: enum de T1. |
| R2 | `catalogo.test.ts` › «resultado %s tiene exactamente un concepto para %s» (5 resultados × 3 actores, lista viva de `GestionResultado`; contraprueba con «extraviado» → 3 rojos) y «`conceptoPorResultado` lanza ante un resultado sin catalogar…». |
| R3 | `esquemas-escritura.test.ts` › «un cobro con IVA pasa y conserva lo que llego como texto», «un pago sin IVA pasa…». El guardado con modo es T6.2. |
| R16 | `precedencia.test.ts` › `rangoCobro` casos 1-5 y «elegirCobros · quitando los niveles anteriores, gana %s» (5), «R16: la eleccion es independiente por concepto…». Postgres en T3.4. T3: `tarifas-flexibles-resolver.test.ts` › «R16: quitando los niveles anteriores, gana %s» (5, Postgres), «R16: el distrito de OTRO grupo de la zona cobra lo de ese grupo…», «R16: la eleccion es por concepto…», «la fachada `TarifaVigenteRepository` devuelve lo mismo…». |
| R17 | `precedencia.test.ts` › «R17: la tienda sin pacto en el grupo pero con pacto en la zona usa su zona antes que el grupo». T3: `tarifas-flexibles-resolver.test.ts` › «R17: la tienda sin pacto en su grupo pero con pacto en la zona usa su zona antes que el grupo». |
| R18 | `precedencia.test.ts` › `rangoCobro` «orden sin grupo: …» (4) y «R18: orden sin distrito (sin grupo) salta la tienda en el grupo y el grupo». T3: `tarifas-flexibles-resolver.test.ts` › «R18: una orden SIN distrito salta los niveles de grupo…», «R18: un distrito de la zona que no esta en ningun grupo salta los grupos»; `cascada-tarifa.test.ts` › «SLT-52 R18: la clave distingue el distrito…»; guardia `tarifas-distrito-pasado.guardia.test.ts`; `corregir-ubicacion-importes.test.ts` › «la actual con el distrito de la orden y la propuesta con el distrito elegido». |
| R19 | `precedencia.test.ts` › `rangoPago` «mensajero: valor propio… → 1» … «zona para todos → 5», «elegirPagos · quitando los niveles anteriores, gana %s» (5), «P2: el grupo para todos gana a la zona para su vehiculo». T3: `tarifas-flexibles-resolver.test.ts` › «R19: quitando los niveles anteriores, gana %s» (5, Postgres), «la fachada `resolvePagos`…». |
| R20 | `precedencia.test.ts` › «satelite: …» (6, incluido «sin el nivel del mensajero») y «R20/R32: la satelite elige con su propio concepto y varios resultados a la vez». T3: `tarifas-flexibles-resolver.test.ts` › «R20: la satelite usa la misma zona, distrito y precedencia sin el nivel del mensajero». |
| R21 | `precedencia.test.ts` › «mensajero: sin grupo: …» (3). T3: `tarifas-flexibles-resolver.test.ts` › «R21: el distrito de la orden que no esta en ningun grupo de la zona del mensajero usa la zona», «R21: el grupo de un distrito se busca DENTRO de la zona pedida». |
| R22 | `precedencia.test.ts` › «mensajero: sin vehiculo: …» (3) y «R22: sin vehiculo gana el grupo para todos aunque haya grupo+vehiculo». T3: `tarifas-flexibles-resolver.test.ts` › «R22: un mensajero sin vehiculo salta los niveles por vehiculo…». |
| R23 | `precedencia.test.ts` › «R23: un concepto sin fila en ningun nivel es `null`…» (cobro y pago); `calculo.test.ts` › «R23 · un cero escrito vale 0…» (3 casos: `"0.00"`, instancia de Decimal). La distincion «0 vs sin fila» en Postgres es T3.4. T3: `tarifas-flexibles-resolver.test.ts` › «R23: sin ningun nivel, el flete por entregado queda «sin tarifa»…», «R23: un 0 escrito vale "0.00"…», «R23: sin ningun nivel, el pago al mensajero es `null`…»; `tarifas-flexibles-respaldo.test.ts` › «un par de B en una zona sin valores tampoco cae al viejo…». |
| R26 | `calculo.test.ts` › «204: 14900.00 al 3.50% → … 589.30», «204: 16618.40 al 3.50% → … 657.25», «HALF_UP en el medio exacto…», «el IVA va sobre el importe REDONDEADO…», «porcentaje redondea antes de devolver…». |
| R27 | `catalogo.test.ts` › «todo cobro a la tienda va sobre el valor del pedido (R27)»; `calculo.test.ts` › «R27: porcentaje sobre un pedido sin valor (base 0) → 0.00». La base real del pedido es T4.1. T4: `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R27 — el % del cobro va sobre el valor del pedido» (3: 2.50 % de 14900.00 / 16618.40 / sin valor; 204 comision 581.64 + 75.61; IVA propio de cada concepto). |
| R28 | Parcial: `catalogo.test.ts` › «todo pago… va sobre el flete (R28)»; `calculo.test.ts` › «R28: pago en porcentaje sobre un flete 0.00… → 0.00». `baseFlete` = flete sin IVA de la gestion es T3.2/T4.2. T3: `tarifas-flexibles-resolver.test.ts` › «R28: la base del % es el flete sin IVA que se cobra a la tienda por ESA gestion» (entregado 1001.00; rechazo 2.50 % de 10000.00 = 250.00; reprogramado con 0 escrito y novedad sin flete → "0.00"); `tarifas-flexibles-respaldo.test.ts` › «pago: `modelo: "nuevo"`…» (baseFlete 1500.00). El importe del pago en % es T4.2. T4: `pago-modelo-nuevo.test.ts` › «SLT-52 R28 — el % del pago va sobre el flete sin IVA de ESA gestion» (4: 20 % de 2750.55 = 550.11; de punta a punta con `fleteSinIvaDeGestion`; reprogramado sin flete → 0.00; un monto no depende de la base). Contraprueba (2b). |
| R4 | `tarifas-flexibles-migration.test.ts` › «R4: valor negativo…», «R4: un porcentaje sobre 100…», «R4: un cobro a la tienda sin IVA…» (base). Borde zod: `esquemas-escritura.test.ts` › «un cobro SIN IVA no pasa…», «un cobro con IVA %j no pasa» (6), «un valor %j no pasa» (5), «un porcentaje mayor que 100 no pasa; un monto de 150 si». El lado service es T6.2. |
| R7 | `tarifas-flexibles-migration.test.ts` › «R7: cada nivel incompatible con su actor…», «R7/R11: un valor con un grupo de OTRA zona…» (base). Service en T6.2. |
| R8 | `tarifas-flexibles-migration.test.ts` › «R8: dos valores del MISMO nivel (con NULLs)…» (unico; el upsert/reemplazo es T6). |
| R10 | `tarifas-flexibles-migration.test.ts` › «R10: el nombre es unico dentro de la zona…» (base). Service en T6.2. |
| R11 | `tarifas-flexibles-migration.test.ts` › «R11: un distrito en DOS grupos…» y «R7/R11: …grupo de OTRA zona…» (base). Service en T6.2. |
| R12 | `tarifas-flexibles-migration.test.ts` › «R12: sacar un distrito de la zona lo saca del grupo; borrar el grupo…». Ver riesgo de `ZonaRepository.update`. |
| R14 | Parcial en T1: tipos y entidades en la base (`20261103120300`, ida y vuelta en «R44: el down de las cuatro…») y en `lib/types/historial-accion.ts` (`catalogo-y-choke-point.test.ts`, 80 tipos / 29 entidades). La escritura con antes/despues en la transaccion es T6.2/T6.4. |
| R15 | `tarifas-flexibles-migration.test.ts` › «R15: con `servi_app` y la empresa A no se ve…» (RLS de las 5 tablas) y «R15: ni siquiera como dueño… (SL017)» (triggers de misma empresa). Repositorios en T3.4/T6.4. T3: `tarifas-flexibles-resolver.test.ts` › «R15: con la empresa A, ni pidiendo las zonas y tiendas de B se ve un valor de B» (RLS con `servi_app`, valores y grupos); `tarifas-flexibles-respaldo.test.ts` › «R15: que B tenga un valor nuevo no pasa a A al modelo nuevo». |
| R34 | Parcial en T1: `tarifas-flexibles-migration.test.ts` › «R34/R45: `gestion_pago_congelado` no tiene columna de IVA…» y el estatico «R34/R45: … no declara ninguna columna de IVA». El calculo sin IVA es T4.2. T4: `pago-modelo-nuevo.test.ts` › «SLT-52 R34 — el pago es exactamente el importe, sin IVA» (2: 1250.50 y no 1413.07; `derivarPagos` 1650.50). Contraprueba (2a). |
| R42 | `tarifas-flexibles-migration.test.ts` › «R44/R42: el up no mueve ninguna fila… todo cierre_detail queda en `viejo`». La lectura igual que hoy es T5.3/T5.4. |
| R43 | `tarifas-flexibles-migration.test.ts` › «R43: con `servi_app`, UPDATE y DELETE de `cierre_detail_concepto` dan 42501…». |
| R44 | `tarifas-flexibles-migration.test.ts` › «R44/R42: el up no mueve ninguna fila…», «R44: ninguna escribe filas en las tablas del modelo viejo…» (estatico) y «R44: el down de las cuatro deja catalogos y conteos como antes…». |
| R45 | `tarifas-flexibles-migration.test.ts` › «R45 (P4): un pago al mensajero o a la satelite con IVA 0 o 13 se rechaza; con IVA NULL se acepta» (base). Borde zod: `esquemas-escritura.test.ts` › «%s con ivaPct %j → rechazo en `ivaPct`» (4, incluidos `"0"` y `"0.00"`), «un pago con `ivaPct: null` tampoco pasa»; tipos: «pasar un ValorPago a ivaDe no compila; un ValorCobro si» (`@ts-expect-error`, typecheck). El service es T6.2. |
| R37 | `tarifas-flexibles-respaldo.test.ts` › «cobro: `modelo: "nuevo"`, solo el concepto puesto, y ni una consulta a `tarifas`» (SQL espiado), «pago: `modelo: "nuevo"` sin pago… y sin leer `tarifa_zona_mensajero`», «un par de B en una zona sin valores tampoco cae al viejo…». |
| R39 | `tarifas-flexibles-resolver.test.ts` › «cobro: un lote de 1 y uno de 50 ordenes cuestan las mismas consultas (3)», «pago: un lote de 1 y uno de 50 gestiones cuestan las mismas consultas (3)»; `tarifas-flexibles-respaldo.test.ts` › «R39: en el viejo, un lote de 1 y uno de 50 cuestan las mismas consultas…» (2). |
| R25 | T4: `carga-api-key-sin-tarifa.test.ts` › «SLT-52 R25: modelo nuevo — …» (2: «ninguna fila tiene flete por entregado (aunque haya comision) -> 409 y nada persistido», «lote mixto: la fila con flete se crea (3.50 + 12 % = 3.92) y la otra va a `error`»); `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R25 — fleteEntregadoSinTarifa decide el 409» (2). Viejo: los casos 274/R29-R31 del mismo archivo, verdes. |
| R29 | T4: `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R29 — flete por cada resultado y su categoria» (5 + «un resultado sin su concepto no aporta nada», «una empresa en el nuevo sin ningun concepto…») y «SLT-52 R29 — las cuatro identidades de partesPorTienda con fletes de reprogramado» (2, literales). |
| R30 | T4: `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R30 — comision COD solo en entregado y con cobraComision» (6: sin cobraComision, 4 resultados no entregados, comision en monto). Contraprueba (1a). |
| R31 | T4: `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R31 — fulfillment: en el costo de la API, fuera de la liquidacion» (4: desglose 3558.37, fulfillment en %, sin concepto / 0 escrito, `agregarIngresosPorConcepto` no lo emite); `convergencia-tarifa-listado-cierre.test.ts` › «el COSTO de la API por key … con el fulfillment de tff-general». |
| R32 | T4: `pago-modelo-nuevo.test.ts` › «SLT-52 R32 — cada resultado paga su concepto…» (5 + «un valor de OTRO resultado no se paga», «sin valor resuelto -> 0.00», «la satelite con varios conceptos a la vez…»). |
| R35 | T4: `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R35 — esCentral y esZonaEspecial no cambian nada en el nuevo» (4 combinaciones: cobro, rechazo, listado y costo API). Contraprueba (1b). |
| R38 | T4: `convergencia-tarifa-listado-cierre.test.ts` › «SLT-52 T4.4 — modelo nuevo: listado, cierre y costo API eligen el mismo valor (R38)» (4: siembra, CIERRE `tf-tienda-grupo`/`tc-zona`/`tff-general`, LISTADO 1695.00 / 565.00, COSTO API 1500.00/195.00/500.00/65.00/100.00); los 6 casos 274 del mismo archivo siguen verdes con el listado por el resolver unico. Contrapruebas (3) y (4). |

### T2 — verificación del implementer antes del commit

- `tests/unit/tarifas/` (5 archivos): 179 passed (179). typecheck exit 0; eslint de `lib/tarifas`, `lib/types/tarifa-flexible.ts` y `tests/unit/tarifas`: exit 0.
- Contraprueba propia: `ROUND_HALF_UP` → `ROUND_DOWN` en `lib/tarifas/calculo.ts:16`:
  ```
  × HALF_UP en el medio exacto: 100.10 * 5% = 5.005 → 5.01 (HALF_EVEN daria 5.00)
  × 204: 14900.00 al 3.50% → 521.50; IVA 13% = 67.795 → HALF_UP 67.80; total 589.30
  × el IVA va sobre el importe REDONDEADO aunque llegue sin redondear: 5.005 → 5.01 → 50% = 2.505 → 2.51
  Tests  6 failed | 9 passed (15)
  ```
  Restaurado (`cmp` igual) → 15 passed.

### T3 — verificación del implementer antes del commit

- 12 archivos (resolver, respaldo, guardia de distrito, `tests/unit/tarifas/`, cascada-tarifa, tarifa-vigente-repository, convergencia, no-regresion-106): 282 passed (282), antes del caso multizona; resolver tras el caso multizona: 31 passed (31).
- Contraprueba propia: borrar `lib/tarifas/precedencia.ts:93` (tienda en otra zona). Antes del caso nuevo, el archivo de integración seguía verde (29/29; solo el unit «la tienda en OTRA zona → null» caía). Tras el caso multizona:
  ```
  × R16: la MISMA tienda en Z y en Z2 en un lote: cada par toma el tienda_zona de SU zona
  Tests  1 failed | 30 passed (31)
  ```
  Restaurado (`cmp` + `git diff --quiet`) → 31 passed.
- `pnpm run test:guardias`: 4 failed, solo `dependencias-declaradas-presentes` (baseline). typecheck exit 0.
- `tasks.md > Archivos esperados`: añadidos 40 archivos que T3 tocó y no estaban listados (IOrdenRepository, solo-modelo-viejo, la guardia nueva y los tests de dobles ajustados).

## T4

MCP `codebase-memory` no respondio (timeout de conexion): todo con Grep/Read. Sin dependencias nuevas, sin migraciones, sin `prisma generate`. Inicio 19:30.

### Tasks

- **T4.1 completa** — `ingreso-empresa.ts`: rama nueva de `derivarIngresoOrden` (`derivarIngresoModeloNuevo`), `costosListadoOrden`, `costoEnvioDeTarifa`, `desgloseCargaApi`, `montoFulfillmentDeTarifa`, `tieneFulfillment`, `agregarIngresosPorConcepto` aceptan `TarifaTienda`; `fleteEntregadoSinTarifa` nueva; la rama nueva calcula su flete con `fleteSinIvaDeGestion` (cierra el desvio 1 de T3). Rama vieja: el cuerpo de hoy movido a `derivarIngresoModeloViejo` sin tocar una linea.
- **T4.2 completa** — `pago-mensajero.ts` (`TarifaDePago`, `pagoConModelo`, `importePagoNuevo`), `ingreso-bodega.ts`, `cierre-totales.ts` (`TarifasDePago`: una `PagoTarifa` o un `Map<gestionId, TarifaPago | null>`).
- **T4.3 completa** — listado (`OrdenRepository.resolverTarifasDePagina` pasa por el resolver unico; ya no lee `tarifas` por su cuenta), `BulkOrdenService`, `CotizacionOrdenService`, `ApiOrdenLecturaService`, `api-orden-costo.ts`, `RechazoTiendaService`, `CorregirDatosClienteService`. Los cinco `soloModeloViejo` de esas superficies quitados; el 409 / «sin tarifa» usa `fleteEntregadoSinTarifa`.
- **T4.4 completa** — escenario del modelo nuevo en `convergencia-tarifa-listado-cierre.test.ts`.

### Archivos tocados

Produccion:
- `lib/utils/ingreso-empresa.ts` (T4.1)
- `lib/utils/pago-mensajero.ts`, `lib/utils/ingreso-bodega.ts`, `lib/utils/cierre-totales.ts` (T4.2)
- `lib/repositories/_shared/resolver-tarifas.ts` (T4.3: `resolverCobrosYFilasViejasCon`, `cobrosNuevos`, `envolverViejas`; sin cambiar ninguna regla)
- `lib/repositories/OrdenRepository.ts` (T4.3: listado; `toTarifaVigente` borrada, `OrdenPrismaClient` + `tarifaValor`, `grupoDistritosDistrito`)
- `lib/services/BulkOrdenService.ts`, `lib/services/CotizacionOrdenService.ts`, `lib/services/ApiOrdenLecturaService.ts`, `lib/services/RechazoTiendaService.ts`, `lib/services/CorregirDatosClienteService.ts`, `lib/utils/api-orden-costo.ts` (T4.3)

Tests:
- NUEVOS `tests/unit/utils/ingreso-empresa-modelo-nuevo.test.ts` (T4.1), `tests/unit/utils/pago-modelo-nuevo.test.ts` (T4.2)
- `tests/unit/tarifas/respaldo-identico.test.ts` (T0.1): cada caso de las 6 funciones se comprueba ADEMAS envuelto en `{ modelo: "viejo" }` contra el MISMO literal; ningun literal cambiado (solo lineas `expect` anadidas y el helper `viejo`).
- `tests/integration/carga-api-key-sin-tarifa.test.ts` (T4.3: 2 casos del modelo nuevo)
- `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts` (T4.3 doble con interruptor; T4.4 escenario nuevo)
- `tests/unit/repositories/orden-repository.test.ts`, `tests/unit/utils/tarifa-especial-por-distrito.test.ts` (doble con «empresa sin valores nuevos»)
- `tests/unit/services/cotizacion-orden-service.test.ts` (censo, abajo)

### Contrapruebas (a mano, una a una; `cp` a respaldo en el scratchpad, correr, restaurar con `cp` + `cmp`, `git diff --quiet` donde el archivo no tenia cambios de la tanda)

(1a) T4.1 — la comision COD fuera de entregado (`if (input.resultado === "entregado" && input.cobraComision …)` → `if (input.cobraComision …)`), `ingreso-empresa-modelo-nuevo.test.ts`:
```
× reprogramado cobra su concepto en su categoria
× novedad cobra su concepto en su categoria
× devolucion_a_origen_por_rechazo cobra su concepto en su categoria
× incidente cobra su concepto en su categoria
× reprogramado con cobraComision no cobra comision
… (12 casos listados)
```
Restaurado (`cmp` igual) → 28 passed.

(1b) T4.1 — la rama nueva lee `esCentral` (`return input.esCentral ? {} : derivarIngresoModeloNuevo(…)`):
```
× esCentral=true esZonaEspecial=false: mismo cobro, listado y costo API
× esCentral=true esZonaEspecial=true: mismo cobro, listado y costo API
Tests  2 failed | 26 passed (28)
```
Restaurado → 28 passed.

(2a) T4.2 — IVA sumado al pago (`importePagoNuevo`: `.mul("1.13")`), `pago-modelo-nuevo.test.ts`:
```
× entregado: mensajero 1250.50, satelite 300.25 (el importe exacto, sin IVA)
× reprogramado / novedad / devolucion_a_origen_por_rechazo: … (el importe exacto, sin IVA)
× la satelite con varios conceptos a la vez: cada gestion paga el de su resultado
× 20 % de la base 2750.55 = 550.11 (con IVA, 3108.12, daria 621.62)
× monto 1250.50 se paga 1250.50, no 1413.07 (1250.50 + 13 %)
× derivarPagos suma por gestion los importes tal cual (1250.50 + 400.00 = 1650.50)
Tests  10 failed | 4 passed (14)
```
Restaurado → 14 passed.

(2b) T4.2 — `baseFlete` con IVA (`fleteSinIvaDeGestion` devuelve `f.plus(ivaDe(valor, f))`):
```
× de punta a punta: la base es fleteSinIvaDeGestion, la misma que cobra a la tienda
Expected: "2750.55"
Received: "3108.12"
Tests  1 failed | 13 passed (14)
```
Restaurado → 14 + 28 passed.

(3) T4.3 — el listado pasa `distritoId: null` en su par (`OrdenRepository.ts:2112`):
```
× el LISTADO cobra con esos mismos valores: 1500.00 + 195.00 y 2 % de 25000.00 = 500.00 + 65.00
Expected: "1695.00"
Received: "0.00"
× ningun llamador de app/ o lib/ pasa `null` literal ni olvida el distrito   (guardia tarifas-distrito-pasado)
Tests  2 failed | 11 passed (13)
```
Restaurado (`cmp` igual). La variante «volver a leer `tarifas` directo» la caza el mismo caso por construccion: el doble del modelo nuevo REVIENTA si alguien llama a `tarifa.findMany` («una empresa en el modelo nuevo leyo `tarifas`»), no se ejecuto aparte.

(4) T4.4 — `precedencia.ts` `rangoCobro`: la tienda en el grupo deja de ganar (`? 1` → `? (6 as Rango)`; gana la zona, 1000.00):
```
× el CIERRE (resolveTarifas con el tx) elige tf-tienda-grupo, tc-zona y tff-general
× el LISTADO cobra con esos mismos valores: 1500.00 + 195.00 y 2 % de 25000.00 = 500.00 + 65.00
× el COSTO de la API por key da los mismos importes, con el fulfillment de tff-general
Tests  3 failed | 7 passed (10)
```
Restaurado: `cmp` igual y `git diff --quiet -- lib/tarifas/precedencia.ts` → limpio. Nota honesta: la mutacion cambia `precedencia.ts` para los TRES caminos (es un modulo compartido; no hay forma de cambiarlo «solo para uno» sin un doble que reemplace el modulo). Cada camino afirma el mismo literal (`tf-tienda-grupo` / 1695.00 / 1500.00), asi que si uno solo divergiera caeria su caso; la mutacion (3) es la que demuestra un camino divergiendo solo.

### Desvios del design

1. **Las funciones de calculo aceptan tambien la tarifa vieja SIN envolver** (`TarifaDeCobro<T> = T | ConModelo<T>` en `ingreso-empresa.ts`; `TarifaDePago = PagoTarifa | TarifaPago` en `pago-mensajero.ts`; `TarifasDePago = PagoTarifa | null | Map<gestionId, TarifaPago | null>` en `cierre-totales.ts`). El design dice «tarifa → `TarifaTienda | null`». Motivo: el cierre, las wallets, el aporte por orden y el corte (T5.1/T5.3) siguen pasando `TarifaVigente` / `PagoTarifa` sueltas (y `tarifaDe` da `TarifaVigente` sin `tarifaId`); exigir el sobre ya obligaba a reescribir esos llamadores fuera de su tanda y ~200 llamadas de tests. Una tarifa suelta no lleva `modelo`, asi que no hay ambiguedad (`"modelo" in t`). **T5 debe estrechar** las firmas a la union cuando sus llamadores pasen a `TarifaTienda`/`TarifaPago`.
2. **`costoEnvioDeTarifa`, `desgloseCargaApi` y `montoFulfillmentDeTarifa` tienen dos firmas** (sobrecarga): la suelta de hoy y la de `ConModelo`, que EXIGE `montoCobrar` (en el nuevo un flete o fulfillment en % va sobre el pedido, R27). Un parametro opcional habria cobrado 0 en silencio a quien lo olvidara.
3. **Fulfillment en el nuevo sin IVA** (importe de `tienda_fulfillment`, como hoy el monto). El design §6 dice «el importe»; si debe llevar su IVA es **pregunta abierta** para el humano.
4. **`tieneFulfillment` en el nuevo** = `tienda_fulfillment` con valor > 0, sea monto o %, sin mirar el pedido (decide donde nace la orden).
5. **Listado**: `resolverCobrosYFilasViejasCon` (nuevo en el resolver) da el cobro del resolver unico y, solo en el viejo, la fila de `tarifas` que lo produjo con las columnas de `TarifaDTO`, en la MISMA consulta. Consultas por pagina: viejo 1 → 2 (se suma el interruptor `tarifaValor.findFirst`), nuevo 3; fijas por pagina (R39). En el nuevo `relaciones.tienda.tarifa` es `null` (no hay fila vieja que mostrar): la pantalla que lo pinte es de SLT-54.
6. **«Sin tarifa» en todas las superficies del cobro = `fleteEntregadoSinTarifa`** (viejo: `null`; nuevo: falta `tienda_flete_entregado`): carga (409 / fila en error), cotizacion (409 / fila en error), costo estimado de la lectura (`null`), correccion de datos (`"sin_tarifa"`). Una tienda con solo comision o fulfillment puestos no se cotiza ni se carga.
7. **Cobro por rechazo en el nuevo: `tarifaId` queda `null`** (`RechazoTiendaService.ts:285`): esa columna apunta a `tarifas`; la traza del `tarifa_valor` usado no tiene columna en `rechazo_tienda_cobro`. **Pendiente**: decidir si hace falta (migracion; fuera de T4).
8. `fleteEntregadoSinTarifa` recibe `ConModelo<unknown> | null` (no solo `TarifaTienda`) para poder usarse con el `TarifaDeCobro` de `api-orden-costo.ts`.

### `soloModeloViejo` que quedan

- `lib/repositories/CierreDiaRepository.ts:1352` (T5.2). Ninguno mas en `lib/` ni `app/`. El modulo `lib/tarifas/solo-modelo-viejo.ts` se borra cuando T5.2 lo deje sin llamadores (antes de T7.4).

### Censos

Buscados con Grep en `tests/` (guardias y tests que cuentan llamadores, consultas, firmas, `soloModeloViejo`, `toTarifaVigente`, `whereCascada`/`elegirPorCascada` del listado): solo dos contratos se movieron, y ninguno es un importe.
- `tests/unit/services/cotizacion-orden-service.test.ts` › «T7.2 delega en derivarIngresoOrden dos veces (R24)»: `toMatchObject(TARIFA)` → `toMatchObject({ modelo: "viejo", tarifa: TARIFA })`. El contrato cambio: desde T4.3 la cotizacion pasa a `derivarIngresoOrden` el `TarifaTienda` del resolver tal cual (antes lo desenvolvia `soloModeloViejo`).
- Dobles de Prisma del LISTADO (`orden-repository.test.ts`, `tarifa-especial-por-distrito.test.ts`, `convergencia-tarifa-listado-cierre.test.ts`): + `tarifaValor.findFirst → null` (empresa sin valores nuevos): el listado pasa por el resolver unico, que decide el modelo primero. Ninguna asercion cambiada: las de R18/R19 de la 274 (`where`, `select` exactos, 1 `tarifa.findMany` y 3 consultas de datos por pagina) siguen verdes porque la fila mostrada sale de LA MISMA consulta del resolver.
- `tarifas-distrito-pasado.guardia` (censo literal de 8 archivos que construyen pares y 1 `resolveTarifa`): sin cambios, verde (3/3).
- `pnpm run test:guardias` no dio ningun rojo nuevo (abajo).

### Salida real

Base local: `DATABASE_URL` solo como booleano (presente); integracion con `node --env-file=../../.env node_modules/vitest/vitest.mjs run …`. Maquina con carga de otros worktrees (wt-496, wt-499 y ordenex corriendo vitest a la vez).

- `tests/unit/utils/ingreso-empresa-modelo-nuevo.test.ts` 28 passed; `tests/unit/utils/pago-modelo-nuevo.test.ts` 14 passed; `tests/unit/tarifas/respaldo-identico.test.ts` (T0.1, literales intactos) 49 passed; `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts` 10 passed; `tests/integration/carga-api-key-sin-tarifa.test.ts` 6 passed; `tests/unit/guards/tarifas-distrito-pasado.guardia.test.ts` 3 passed → **Test Files 6 passed (6); Tests 110 passed (110)**.
- Tests existentes de las superficies y sus vecinos (`orden-repository*` 25 archivos, convergencia, cotizacion, rechazo, api-orden-lectura, `corregir-*`, `bulk-orden-service*`, `tests/unit/api/`, `api-orden-costo`, `tarifa-especial-por-distrito`, guardias `costo-orden-forma-unica`/`satelite-proyeccion-compartida`/`tarifas-distrito-pasado`, `tests/unit/actions/`, `tarifa-vigente-repository`): **Test Files 199 passed (199); Tests 2833 passed (2833)**.
- T4.1/T4.2 vecinos: `ingreso-bodega`, `cierre-totales`, `ingreso-ordenex` + los nuevos + T0.1: **6 files, 165 passed**.
- Postgres real, los que leen `resolver-tarifas.ts`: `tarifas-flexibles-resolver` + `tarifas-flexibles-respaldo` + `cierre-detail-congelado` → **Test Files 3 passed (3); Tests 47 passed (47)**.
- `pnpm run test:guardias`: **Test Files 1 failed | 323 passed | 3 skipped (327); Tests 4 failed | 4532 passed | 24 skipped (4560)**; los 4 rojos son `dependencias-declaradas-presentes` (baseline). `GUARD_EXIT=1` solo por ellos.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: **TC_EXIT=0**, 0 errores (tras la ultima edicion).
- `pnpm exec eslint` sobre los 20 archivos tocados: **LINT_EXIT=0**, salida vacia (0 errores, 0 avisos).
- `vitest related --run` sobre los 20 archivos tocados (con `--env-file`): **NO TERMINO** antes del limite de las 21:00 por la carga de la maquina (otros tres arboles corriendo vitest; tests de componente de 15 s tardaban 100 s). Lo medido:
  - 1.ª pasada completa (20:11-20:32, cortada a mano): 153 archivos reportados, **los 153 rojos estan en `tests/baseline-rojos.json`** (script de comparacion: «rojos: 153 fuera del baseline: 0»); casi todos de `tests/integration/db/` (app vacia, catalogos sin sembrar, como en T3).
  - 2.ª pasada sin `tests/integration/db/**` (20:33-20:43, cortada): 3 archivos reportados; `dinero-productos.int` saltado (sin base en ese camino), y `tests/components/WalletCaja463.test.tsx` y `tests/unit/components/usuario-form.test.tsx` con 1 rojo cada uno por TIMEOUT (6,5 s y 15 s, archivos de 100+ s). Re-corridos solos: **Test Files 2 passed (2); Tests 54 passed (54)** → carga, no esta tanda.
  - Lo que `related` deja sin cubrir lo cubren las corridas dirigidas de arriba (199 + 6 + 3 archivos). **El leader debe correr `./init.sh` (o `related`) con la maquina libre antes de commitear.**

### Pendientes / preguntas abiertas

- Fulfillment del modelo nuevo con o sin IVA (desvio 3): pregunta para el humano.
- Traza del `tarifa_valor` en el cobro por rechazo (desvio 7): necesitaria columna nueva; fuera de T4.
- T5 debe estrechar las firmas a la union (desvio 1) y retirar el ultimo `soloModeloViejo` (`CierreDiaRepository.ts:1352`, T5.2).
- `relaciones.tienda.tarifa` del listado es `null` en el modelo nuevo: la pantalla que muestre valores nuevos es de SLT-54.

### Veredicto T4

T4.1-T4.4 completas: cobro y pago del modelo nuevo por las mismas funciones publicas, superficies sin `soloModeloViejo` (queda solo el de T5.2), listado por el resolver unico; T0.1 verde con los casos tambien envueltos, typecheck 0, lint 0, guardias solo baseline, 6 contrapruebas rojas; `related` sin terminar por carga (parcial sin rojos fuera del baseline). Sin commitear: queda para el leader.

### T4 — verificación del implementer antes del commit

- 15 archivos (los dos nuevos de T4, `tests/unit/tarifas/`, convergencia, orden-repository, carga-api-key-sin-tarifa, guardia de distrito, cotizacion, tarifa-especial-por-distrito, resolver y respaldo en Postgres): 400 passed (400). typecheck exit 0.
- Contraprueba propia: `fleteEntregadoSinTarifa` del modelo nuevo devuelve siempre `false` (`lib/utils/ingreso-empresa.ts:278`):
  ```
  × nuevo: falta el concepto de flete por entregado, aunque haya otros
  × ninguna fila tiene flete por entregado (aunque haya comision) -> 409 y nada persistido
  × lote mixto: la fila con flete se crea (3.50 + 12 % = 3.92) y la otra va a `error`
  Tests  3 failed | 31 passed (34)
  ```
  Restaurado (`cmp` igual).
- `vitest related` NO terminó (máquina cargada por otro gate); queda para el `./init.sh` del leader.
- `tasks.md > Archivos esperados`: añadido `tests/unit/repositories/orden-repository.test.ts`.

## T4.5-T4.8 (2026-11-03) — decisiones de Carlos tras T4 (R46-R51, design §12; P5 = (a))

Dos backend_dev en paralelo sobre el worktree, archivos disjuntos: (A) T4.6; (B) T4.5, T4.7 y T4.8.

### Archivos
- T4.6 (nuevos): `db/migrations/20261103140000_rechazo_tienda_cobro_tarifa_valor/{migration,down}.sql`
  (columna, CHECK `rechazo_tienda_cobro_una_tarifa`, índice, FK SET NULL);
  `db/migrations/20261103140100_rechazo_tienda_cobro_tarifa_valor_misma_empresa/{migration,down}.sql`
  (`generar-misma-empresa.ts --faltantes --escribir`, un trigger);
  `tests/integration/db/rechazo-tienda-cobro-tarifa-valor-migration.test.ts` (base propia `slt52_rtc_<rand>`,
  cada caso en transacción revertida, `down` incluido).
- T4.6 (modificados): `db/schema.prisma`, `IRechazoTiendaCobroRepository.ts`, `RechazoTiendaCobroRepository.ts`,
  `RechazoTiendaService.ts`, `tests/unit/services/rechazo-tienda-service.test.ts`; `tarifaValorId: null` en
  fixtures que no compilaban: `_fixtures/caja-459.ts`, `busqueda-por-guia-469`, `rechazo-tienda-cobro.int`,
  `wallet-anulacion-concurrencia` (los tres tests están en `tests/baseline-rojos.json`: rojos SL017 ajenos).
- T4.5/T4.8: `lib/utils/ingreso-empresa.ts` (`ivaFulfillmentDeTarifa`), `CotizacionOrdenService.ts`,
  `lib/types/cotizacion.ts`, `BulkOrdenService.ts`, `IBulkOrdenService.ts`, `lib/utils/api-orden-costo.ts`,
  `lib/types/api-orden.ts`; docs: `lib/api/openapi-spec.ts` (fuente servida), `docs/api/api-key-openapi.yaml`,
  `docs/api/CHANGELOG.md` (aditivo), `docs/api/guia-integracion/guia-integracion.html`. Postman no lista los campos.
- Tests de forma ajustados a seis claves (`ivaFulfillment`): `tests/unit/api/openapi-{177,415,466}`,
  `ordenes-api-key-composicion-415`, guardias `docs-marca-heredada` y `costo-orden-forma-unica`,
  `api-orden-costo`, `asimetria-sin-tarifa`, rutas de listado/consulta/carga, `carga-api-etiquetas`,
  `api-orden-415-dto`, `convergencia-tarifa-listado-cierre` (nuevo: `ivaFulfillment` 13.00).

### Migraciones
`prisma migrate deploy` contra la base local («All migrations have been successfully applied»);
`migrate diff --from-config-datasource --to-schema` → «No difference detected». `DATABASE_URL` comprobada
solo como booleano (localhost).

### R → test
| R | test |
|---|---|
| R46 | `ingreso-empresa-modelo-nuevo.test.ts` › «SLT-52 R46 — fulfillment con IVA» (500→65.00; 2.50 % → 48.43 HALF_UP; ausente/0 % → 0.00; `agregarIngresosPorConcepto` no lo emite); `cotizacion-orden-service.test.ts` › «SLT-52 R46 — el total resta fulfillment e IVA en los dos escenarios»; `api-orden-lectura-service.test.ts` y `cotizacion-api-key.test.ts` › «SLT-52 R46 — el IVA del fulfillment viaja en la respuesta»; `bulk-orden-service.carga-api.test.ts` › «SLT-52 R46 — la carga publica el IVA del fulfillment…» |
| R47 | bloque R46 › «SLT-52 R47 — el viejo no calcula IVA de fulfillment»; `respaldo-identico.test.ts` sin tocar y verde |
| R48 | `rechazo-tienda-service.test.ts` › «SLT-52 R48 — el cobro en el nuevo guarda el tarifaValorId…»; integración › «R48: `crearPendiente` escribe `tarifa_valor_id` en la fila real» |
| R49 | `rechazo-tienda-service.test.ts` › «SLT-52 R49 — en el viejo guarda tarifaId y tarifaValorId null»; integración › «R49: … lo rechaza el CHECK» |
| R50 | integración › «R50/R44: el up no mueve ningun cobro…» y «R50: borrar el valor citado deja el cobro, su referencia en NULL y los importes intactos»; además trigger misma empresa (SL017) y `down` |
| R51 (+R25) | `carga-api-key-sin-tarifa.test.ts`, `cotizacion-api-key.test.ts`, `api-orden-lectura-service.test.ts`, `corregir-datos-cliente-service.test.ts` › los cuatro «SLT-52 R51 — …» de tasks.md. Verdes al primer intento: no había bug de T4. |

### Salida real (de los subagentes, solo sus archivos)
- rechazo-tienda-service 33/33; integración nueva 8/8.
- modelo-nuevo + respaldo 82/82; cotizacion-orden-service 52/52; api-orden-lectura 21/21; corregir-datos 60/60;
  bulk carga-api 47/47; cotizacion-api-key 28/28; carga-sin-tarifa 7/7.
- typecheck 0 errores (necesita `NODE_OPTIONS=--max-old-space-size=8192`); lint 0 errores, 232 avisos.

### Contrapruebas (restauradas, comprobadas con cmp/sha1)
- `tarifaValorId: null` fijo en `congelarCobro` → 1 failed | 32 passed: `expected null to be 'tv-rechazo'`.
- Quitar `tarifaValorId` del insert del repositorio → integración 1 failed | 7 passed:
  `-"tarifa_valor_id": "8da899fe-…" +"tarifa_valor_id": null`. Compila igual (campo opcional en Prisma): solo
  la integración lo ve.
- `ivaFulfillmentDeTarifa` devuelve 0 en el nuevo → 8 rojos, p. ej. `Expected: "65.00" Received: "0.00"`.
- Quitar `ivaFulfillment` de `api-orden-costo` → 5 rojos («nuevo: costoEstimado.ivaFulfillment = 90.48»); del
  serializador de cotización → rojo «SLT-52 R46 — el IVA del fulfillment viaja en la respuesta».
- Contar el fulfillment como tarifa → 4 rojos, uno por test de R51 (`Expected: "sin_tarifa" Received: "resuelta"`).

### Desvíos del spec
- `DesgloseCargaApi` NO gana la clave `ivaFulfillment`: `respaldo-identico.test.ts` (T0.1, intocable) lo compara
  con `toStrictEqual` en el viejo. La carga calcula el campo aparte con `ivaFulfillmentDeTarifa`; `costoEnvio` sí
  lo suma.
- `costoReal.ivaFulfillment` sale `"0.00"` siempre hasta T5.3 (hoy el congelado es solo del modelo viejo).
