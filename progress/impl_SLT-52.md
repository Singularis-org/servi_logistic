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
| R19 | `precedencia.test.ts` › `rangoPago` «mensajero: valor propio… → 1» … «zona para todos → 5», «elegirPagos · quitando los niveles anteriores, gana %s» (5), «P2: el grupo para todos gana a la zona para su vehiculo». T3: `tarifas-flexibles-resolver.test.ts` › «R19: quitando los niveles anteriores, gana %s» (5, Postgres), «la fachada `resolvePagos`…». T5.1: `cierre-pago-por-gestion.test.ts` › «SLT-52 R19 — …» (4) y `cierre-pago-congelado.test.ts` (477, 398). T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R40/R24/R33/R19/R20 — la solicitud congela cobro y pago por gestion; pago distinto por grupo; sin tarifa = 0» (G1 800.00 / G2 10 % = 200.00, con la zona del mensajero y el distrito de cada orden). |
| R20 | `precedencia.test.ts` › «satelite: …» (6, incluido «sin el nivel del mensajero») y «R20/R32: la satelite elige con su propio concepto y varios resultados a la vez». T3: `tarifas-flexibles-resolver.test.ts` › «R20: la satelite usa la misma zona, distrito y precedencia sin el nivel del mensajero». T5.1: `cierre-pago-por-gestion.test.ts` › «SLT-52 R19/R20/R33 — cada gestion paga lo de SU grupo…». T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R40/R24/R33/R19/R20 — …» (satelite 50.00 solo en G2). |
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
| R42 | `tarifas-flexibles-migration.test.ts` › «R44/R42: el up no mueve ninguna fila… todo cierre_detail queda en `viejo`». La lectura igual que hoy es T5.3/T5.4. T5.3: `cierre-detalle.test.ts` › «R11: los 7 campos…» (viejo en su sobre, literales intactos), «SLT-52 R42 — un detalle viejo ignora cualquier fila de concepto». T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R42/R47 — un cierre del modelo VIEJO se congela y se lee exactamente como antes» (2260.00, fulfillment 300.00 de la columna, IVA 0.00, `costoReal` igual). |
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
| R24 | T5.1: `cierre-pago-por-gestion.test.ts` › «SLT-52 R24 — un concepto sin tarifa cuenta 0 y el cierre se crea igual», «… zona sin tarifa en el viejo…». T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R40/R24/R33/R19/R20 — …» (d3 sin valor: sin filas, pago 0.00, cierre creado), «R24/R33/R40 — la re-solicitud de un rechazado (477) congela la rehecha igual que la solicitud», «R24/R33/R40 — el corte diario congela igual…». T5.3: `cierre-detalle.test.ts` › «SLT-52 R24 — sin filas no es `null`…». |
| R33 | T5.1: `cierre-pago-por-gestion.test.ts` › «SLT-52 R33/R40 — el `vencido` paga cada gestion lo suyo…». T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › los casos de solicitud, 477 (la rehecha se paga en su cierre: total 1000.00 sin la anulada) y corte. |
| R40 | T5.2: `cierre-pago-congelado.test.ts` (7 casos «SLT-52 R40…»). T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R40/R24/R33/R19/R20 — …» (filas literales de `cierre_detail_concepto` y `gestion_pago_congelado`; `importe` = `pago_mensajero`/`ingreso_bodega_rechazo`), 477 y corte. |
| R41 | T5.3: `cierre-detalle.test.ts` › «tarifaDe — modelo nuevo (SLT-52 R41/R42)» (5). T5.4: `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R41/R46 — cambiar y BORRAR valores y grupos despues no mueve el detalle, la aprobacion, las wallets, el aporte ni Analitica», «R41 — Analitica exige la empresa en el `json_agg`…». Contrapruebas M1, M3, M4 de T5.3-T5.4. |
| R46 | T4.5/T4.8: ver la seccion T4.5-T4.8. T5.3 (cierre y lecturas): `tarifas-flexibles-snapshot.test.ts` (Postgres) › «R41/R46 — …» (detalle 450.00 + IVA 58.50 fuera del total; Analitica 450.00; `costoReal` 450.00 / 58.50); `cierres-admin-fulfillment-solo-central.test.ts` › «SLT-52 R46 — el fulfillment del modelo nuevo y su IVA tambien son solo de la central» (2). Contraprueba M2. |

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

## T5.1-T5.2 (2026-11-03)

backend_dev, solo T5.1 y T5.2. MCP `codebase-memory-mcp` no conecto (timeout): exploracion con Grep/Read.

### Archivos
- `lib/types/tarifa-flexible.ts` — `PagoCongelado` (gestion, actor, `ValorPago`, base, importe; sin IVA) y
  `PagosDelCierre` (`modelo` + `congelados`).
- `lib/interfaces/repositories/ICierreDiaRepository.ts` — `GestionPendienteDeCierreRow` (subtipo con `distritoId`,
  `zonaOrdenId`, `montoCobrar`, `cobraComision`; `tiendaId` ya estaba), devuelto por `findGestionesPendientes`;
  `CrearCierreInput.pagos?: PagosDelCierre`; `ResolicitarCierreRechazadoInput` = `{ cierreId, mensajeroId, zonaId,
  vehiculoId }` (antes llevaba `tarifa: PagoTarifa | null`).
- `lib/utils/cierre-totales.ts` — `TarifasDePago` ESTRECHADO a `ReadonlyMap<gestionId, TarifaPago | null>`;
  `derivarPagos`/`derivarIngresoBodega` aceptan `Pick<…, "gestionId" | "resultado">`; nuevas puras
  `contextosPagoDe(gestiones, pagador)` y `pagosDelCierre(gestiones, tarifas)`.
- `lib/services/CierreDiaService.ts` — vista en vivo (`resolvePagosMensajero`), solicitud (`resolvePagos` + `pagos`
  a `crearCierre`) y re-solicitud 477 (pasa zona destino + vehiculo; ya no resuelve). `tarifaFaltante` por gestion.
- `lib/services/CorteDiarioService.ts` — `resolvePagos` con `m.zonaId` + `pagos` a `crearCierre`.
- `lib/repositories/CierreDiaRepository.ts` — `WITH_DETALLE_PENDIENTE` + `toPendienteDeCierreRow`
  (`WITH_DETALLE` intacto: lo comparten los detalles de admin); `crearCierre` congela el nuevo (abajo);
  `resolicitarCierreRechazado` resuelve dentro de la tx con `resolverPagosCon(tx, …)` y re-congela;
  `ModelosDeTarifaMezclados` + `asegurarMismoModelo`. Retirado el ultimo `soloModeloViejo`.
- `lib/repositories/CierresAdminRepository.ts` — `corregirResultadoGestionEnCierre`: `resolverPagosCon(tx, [ctx])`
  (zona congelada del cierre + vehiculo + distrito de la orden) y re-congela (`deleteMany` + `createMany` tras el sello).
- NUEVO `lib/repositories/_shared/pago-congelado.ts` — `filaPagoCongelado` (un solo mapeo para los tres sitios).
- BORRADO `lib/tarifas/solo-modelo-viejo.ts` (sin llamadores). Borrado STAGED (`git rm --cached` + rm): la guardia
  `catalogo-postgres-acota-esquema` lista con `git ls-files` y fallaba con ENOENT con el borrado sin stagear.
  Solo lo citaba `specs/.../tasks.md` (lista de archivos; no se toca).
- Tests nuevos: `tests/unit/services/cierre-pago-por-gestion.test.ts` (10), `tests/unit/repositories/cierre-pago-congelado.test.ts` (11).
- Fixtures: `tests/fixtures/tarifa-tienda.ts` (+`pagoViejoPorGestion`, +`conResolvePagosViejo`: doble de
  `resolvePagos` que hace lo del resolver real en el viejo delegando en el `resolvePagoTarifa` del propio doble, una vez
  por par zona+vehiculo distinto); `tests/fixtures/cierre-pagos.ts` (`conPagos` generico).
- Tests ajustados SIN tocar importes: dobles de `resolvePagos` (7 suites `cierre-dia-*`/`corte-diario-*`,
  pasados-completo/paginado, 477, notificacion-wiring, cierre-dia-action) -> `conResolvePagosViejo`; filas en vivo con
  los 4 campos de contexto (`cierre-dia-service`, `totales-mixtos`, `cierre-dia-action`, fixtures de Prisma de
  `cierre-dia-repository` y `cierre-pagos-lectura`); `derivarPagos/IngresoBodega(…, TARIFA)` ->
  `pagoViejoPorGestion(…, TARIFA)` (cierre-totales, snapshots-congelados, gestion-desde-ayuda-cierre,
  devolucion-sla-dinero, resolver-novedad-reprograma-dinero); doble de la 398 (`tarifaValor.findFirst -> null`,
  `gestionPagoCongelado`, campos de la orden); guardia `aprobacion-escrituras-cubiertas` (+2 escrituras de la 398).
- Contratos que cambiaron (forma del input de la re-solicitud, ningun importe): `cierre-dia-service.test.ts` › «R28 +
  271/R18 + 477/D5…» y `cierre-dia-477-resolicitud.test.ts` › «R17…» afirman ahora `{ zonaId: <destino>, vehiculoId }` y
  que el servicio NO llama a `resolvePagoTarifa`; integraciones `477-resolicitud-rechazado-sql-real` (R22) y
  `ajuste-pago-mensajero-cierre` (R15: la tarifa distinta se escribe en la base en vez de pasarse por input).

### Migracion
Ninguna. El esquema ya lo permite (design §12.1): `cierre_detail_concepto.iva_pct` es NOT NULL y
`tarifa_valor_iva_solo_tienda` exige IVA en `tienda_fulfillment`, asi que el % de IVA del fulfillment queda congelado
en su fila de concepto como cualquier cobro a la tienda.

### Como congela `crearCierre` (T5.2)
1. Cobro: `resolveTarifas(pares, tx)` como antes; el modelo sale del resolver (todas nulas = viejo).
2. Viejo: `cierreDetail.createMany` EXACTAMENTE como antes (sin escribir `tarifa_modelo`: DEFAULT `viejo`; la lista de
   columnas es contrato de 69/R24 y su test «R24: el shape del snapshot no cambia» sigue verde sin tocarlo).
3. Nuevo: `cierreDetail.createManyAndReturn` (`tarifaModelo: "nuevo"`, columnas `tarifa_*` NULL) y
   `cierreDetailConcepto.createMany`, una fila por concepto resuelto (concepto, modo, valor, iva_pct, nivel,
   tarifa_valor_id); concepto ausente = sin fila.
4. Pago: `asegurarMismoModelo(modeloCobro, pagos)` (R37: lanza si el nuevo llega sin `pagos` o si cobro y pago salen
   de modelos distintos) y `gestionPagoCongelado.createMany` solo para las gestiones que ESTA tx vinculo (relectura
   `{ cierreId, id in … }`, una consulta y solo si hay filas). `importe` = lo escrito en `pago_mensajero` /
   `ingreso_bodega_rechazo` (misma `importePagoNuevo`); `base` solo en porcentaje.
Re-solicitud (477) y correccion (398) borran el congelado de sus gestiones y, en el nuevo, lo reescriben.

### R -> test
| R | test |
|---|---|
| R19 | `cierre-pago-por-gestion.test.ts` › «SLT-52 R19 — pide el pago con la zona y el vehiculo del MENSAJERO y el distrito de CADA orden», «… la vista EN VIVO …», «… contextos con la zona del corte …», «`contextosPagoDe` …»; `cierre-pago-congelado.test.ts` › «SLT-52 R19/R33 — resuelve con la zona DESTINO …» (477) y «… resuelve el rechazo con la zona del cierre …» (398) |
| R20 | `cierre-pago-por-gestion.test.ts` › «SLT-52 R19/R20/R33 — cada gestion paga lo de SU grupo: 1500 y 1700 al mensajero, 200 y 450.50 a la satelite» |
| R24 | `cierre-pago-por-gestion.test.ts` › «SLT-52 R24 — un concepto sin tarifa cuenta 0 y el cierre se crea igual», «SLT-52 R24 — zona sin tarifa en el viejo …»; `cierre-pago-congelado.test.ts` › «SLT-52 R23 — un cobro sin conceptos …» |
| R33 | `cierre-pago-por-gestion.test.ts` › «SLT-52 R33/R40 — el `vencido` paga cada gestion lo suyo …»; 477 y 398 en `cierre-pago-congelado.test.ts` (cada gestion con su contexto, dentro de su tx) |
| R40 | `cierre-pago-congelado.test.ts` › «SLT-52 R40/R42 — el detalle se marca `nuevo` …», «SLT-52 R40/R46 — un concepto de cobro por fila …», «SLT-52 R40/R34 — el pago congelado de cada gestion VINCULADA aqui …», «SLT-52 R40 — re-congela …» (477), «SLT-52 R40 — borra el congelado de ESA gestion …» (398); `cierre-pago-por-gestion.test.ts` › «SLT-52 R40 — entrega a `crearCierre` el pago congelado …», «SLT-52 R40 — el modelo viejo no congela filas …» |
| R37 (refuerzo) | «SLT-52 R37 — en el modelo nuevo, sin el pago congelado, LANZA», «SLT-52 R37 — cobro nuevo y pago viejo …: LANZA» |
| R42 (refuerzo) | «SLT-52 R42 — en el modelo viejo el detalle se escribe como antes …» |

El congelado contra Postgres real (WHERE, RLS, `createManyAndReturn`, CHECK de `base`) es T5.4.

### Salida real
`.env` comprobado solo como booleanos: existe `../../.env`, `DATABASE_URL` presente y localhost.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: **TC_EXIT=0**, 0 errores.
- `pnpm exec eslint` sobre los 35 archivos tocados: **LINT_EXIT=0**, 0 errores, 2 avisos preexistentes
  (`_mensajeroId` en pasados-paginado:73, `_input` en corte-diario-seleccion:129; lineas no tocadas).
- Unit y vecinos (37 archivos: los 2 nuevos, `cierre-dia*`, `corte-diario*`, `cierre-dia-repository`,
  `cierre-pagos-lectura`, `gestion-desde-ayuda-cierre`, `cierres-admin-corregir-resultado(-where)`,
  `cierres-admin-repository`, `cierre-totales*`, `pago-modelo-nuevo`, `ingreso-bodega`,
  `convergencia-tarifa-listado-cierre`, **`respaldo-identico` (T0.1, sin tocar)**, `devolucion-sla-dinero`,
  `cierre-detail-inmutable`, `cierre-dia-action`, notificacion-wiring y 6 guardias):
  **Test Files 37 passed (37); Tests 802 passed (802)**.
- Postgres real (`node --env-file=../../.env node_modules/vitest/vitest.mjs run …`): `ajuste-pago-mensajero-cierre`,
  `cierre-detail-congelado`, `resolver-novedad-reprograma-dinero`, `tarifas-flexibles-resolver`,
  `tarifas-flexibles-respaldo` y `asimetria-sin-tarifa` verdes; `477-resolicitud-rechazado-sql-real`,
  `correccion-resultado-gestion.int`, `cierre-segundo-vincula-solo-lo-suyo` y `emisor-relaciones-anidadas` rojos con
  «referencia a otra empresa» (SL017) al SEMBRAR, los cuatro en `tests/baseline-rojos.json`.
  Total: Test Files 4 failed | 6 passed (10); Tests 20 failed | 82 passed (102).
  Consecuencia: la re-solicitud y la correccion no tienen hoy prueba contra Postgres que llegue a ejecutarse (T5.4).
- `pnpm run test:guardias`: tras los arreglos, rojos = `dependencias-declaradas-presentes` (4, baseline) y
  `catalogo-postgres-acota-esquema` › «NINGUNA consulta…» (1), **preexistente de T4.6 y no de esta tanda**:
  `tests/integration/db/rechazo-tienda-cobro-tarifa-valor-migration.test.ts:423` consulta `information_schema.columns`
  sin `table_schema = 'public'` (commit f6efb67e). Antes de stagear el borrado lo tapaba el ENOENT. No lo toco (fuera
  de alcance): es un arreglo de una linea para quien cierre T4.6.

### Contrapruebas (`scratchpad/mut.sh`; las siete restauradas con `cp` del respaldo y `cmp` igual)
- M1 `crearCierre` no congela los conceptos -> `× SLT-52 R40/R46 — un concepto de cobro por fila …` (1 failed | 10 passed).
- M2 `CorteDiarioService` vuelve a `resolvePagoTarifa(m.zonaId, vehiculoId)` para todo el lote ->
  `× SLT-52 R19 — contextos con la zona del corte …`, `× SLT-52 R33/R40 — el vencido paga …` (2 failed | 8 passed).
- M3 congela tambien gestiones que NO vinculo esta tx -> `× SLT-52 R40/R34 — el pago congelado de cada gestion VINCULADA aqui …`.
- M4 re-solicitud con `distritoId: null` -> `× SLT-52 R19/R33 — resuelve con la zona DESTINO …`.
- M5 `contextosPagoDe` sin distrito -> 7 failed | 3 passed (R19/R20/R33/R40 del servicio y del corte).
- M6 la 398 no borra el congelado viejo -> `× SLT-52 R40 — borra el congelado de ESA gestion …`.
- M7 sin `asegurarMismoModelo` -> `× SLT-52 R37 — … sin el pago congelado, LANZA`, `× … cobro nuevo y pago viejo …`.

### Desvios del design
1. **`CierreGestionPendienteRow` no gana los campos: los gana un subtipo** (`GestionPendienteDeCierreRow`, solo lo
   devuelve `findGestionesPendientes`). La fila base la producen tambien los detalles de admin desde el snapshot, donde
   no se resuelve nada. En el subtipo son requeridos.
2. **La re-solicitud 477 resuelve el pago en el REPOSITORIO**, dentro de su tx con `resolverPagosCon(tx, …)`, y no en el
   servicio antes de la tx como dice §7: las rehechas que se vinculan solo se conocen dentro de la tx. Es el patron de la
   398. El input cambia de `tarifa` a `zonaId + vehiculoId`.
3. **`CrearCierreInput.pagos` es opcional** (hay 126 llamadas de test a `crearCierre`). Lo compensa que `crearCierre`
   LANZA `ModelosDeTarifaMezclados` si el cobro es nuevo y falta, o si cobro y pago salen de modelos distintos (R37).
   Los dos llamadores de produccion lo pasan siempre.
4. En el viejo, `cierre_detail` NO escribe `tarifa_modelo` (DEFAULT `viejo`): mantiene literal la lista de columnas (69/R24).
5. La base del % en 477/398 sale del cobro VIVO de la orden en ese instante (el resolver), no del
   `cierre_detail_concepto` congelado del cierre; igual que hoy la 398 usa la tarifa de pago de HOY (puerta H2 de la 398).
   **Cerrada (2026-11-03, Carlos)**: «la base del % es siempre lo que se le cobra a la tienda por esa gestión».
   477: la re-solicitud rehace el cierre con valores vivos (tienda y mensajero) → se queda como está.
   398: la tienda conserva el cobro congelado en `cierre_detail`, así que el mensajero debe usar como base el
   congelado del cierre (`cierre_detail_concepto`, `tienda_flete_rechazo`). **Pendiente para T5.5** (con su R, que
   añade el leader al spec); no se cambia en esta tanda.
6. **`TarifaDePago` (`pago-mensajero.ts`) sigue doble** (`PagoTarifa | TarifaPago`): `respaldo-identico.test.ts` (T0.1,
   intocable) llama a `pagoPorResultado`/`ingresoBodegaPorResultado` con la `PagoTarifa` suelta (lineas 378 y 396).
   Ningun llamador de produccion la pasa ya suelta. `TarifasDePago` (`cierre-totales.ts`) SI se estrecho al Map.

### Para T5.3
- **IVA del fulfillment congelado (R46)**: un `cierre_detail` con `tarifa_modelo = 'nuevo'` tiene sus filas en
  `cierre_detail_concepto`; la de `tienda_fulfillment` trae `modo`, `valor` e `iva_pct`. `tarifaDe(d, conceptos)` tiene
  que armar `{ modelo: "nuevo", valores }` (concepto -> `ValorCobro` con `ivaPct = iva_pct.toFixed(2)`) y entonces
  `ivaFulfillmentDeTarifa(tarifa, d.montoCobrar)` da el IVA sin leer nada vivo. Concepto ausente = sin fila = 0.
- **Ojo**: `cierre_detail_concepto.tarifa_valor_id` admite NULL (SET NULL al borrar el valor) y
  `ValorCobro.tarifaValorId` es `string`: T5.3 decide el tipo de la lectura (no lo invento aqui).
- **Firmas del cobro que quedan dobles**: `TarifaDeCobro<T> = T | ConModelo<T>` en `lib/utils/ingreso-empresa.ts` y las
  sobrecargas de `costoEnvioDeTarifa` / `desgloseCargaApi` / `montoFulfillmentDeTarifa`: sus llamadores del cierre
  siguen pasando la `TarifaVigente` suelta que da `tarifaDe`. No se tocaron. Ademas `TarifaDePago` (desvio 6).
- `gestion_pago_congelado` no lo lee nadie todavia: los lectores siguen con `pago_mensajero` /
  `ingreso_bodega_rechazo`, que llevan el mismo importe.

### Veredicto T5.1-T5.2
Hechas: pago por gestion con el resolver unico en los cinco caminos y congelado del modelo nuevo en la misma tx; ultimo
`soloModeloViejo` retirado y modulo borrado; typecheck 0, lint 0 errores, 802/802 vecinos, 7 contrapruebas rojas; sin
migracion; sin commitear.

## T5.3-T5.4 (2026-11-03)

backend_dev, solo T5.3, T5.4 y los tres cierres pendientes. MCP `codebase-memory-mcp` no conecto (timeout): Grep/Read.
Sin migracion, sin dependencias, sin `prisma generate`. `.env`: solo booleanos (existe, `DATABASE_URL` presente).

### Archivos
- `lib/utils/cierre-detalle.ts` — `tarifaDe(d, conceptos)` -> `TarifaCongelada | null` (viejo: lo de siempre en
  `{ modelo: "viejo", tarifa }`; nuevo: `valores` desde `cierre_detail_concepto`, nunca `null`); `CONCEPTO_CONGELADO_SELECT`,
  `ConceptoCongeladoRow`, `TarifaCongelada`; `DETALLE_SELECT` y `TarifaCongeladaRow` ganan `tarifaModelo` (+ `conceptos`).
- NUEVO `lib/utils/fulfillment-congelado.ts` — `fulfillmentCongeladoDe(tarifa, columna, montoCobrar)`: viejo = columna e IVA
  0.00 (R47); nuevo = `montoFulfillmentDeTarifa` + `ivaFulfillmentDeTarifa` sobre el concepto congelado (R46).
- Los cinco llamadores + la API: `WalletFeedService`, `WalletTiendaFeedService`, `CierreAporteRepository` (+ su WHERE,
  abajo), `CierresAdminRepository` (`DETALLE_ADMIN_SELECT` + `toTarifaSnapshot` + `toIngresoEmpresa`),
  `DineroProductosRepository` (`tarifa_modelo` + `json_agg` de `cierre_detail_concepto` con
  `dc.organizacion_id = d.organizacion_id`), `OrdenRepository` (`costoReal`: select + `congeladoDe`).
- Tipos: `lib/types/tarifa-flexible.ts` (`tarifaValorId: string | null`), `lib/utils/aporte-por-orden.ts`
  (`OrdenCongelada.tarifa: TarifaCongelada | null`), `lib/interfaces/repositories/IOrdenRepository.ts`
  (`ApiOrdenCongeladoRow.tarifa`), `lib/interfaces/services/ICierreDiaService.ts` (`IngresoEmpresaDTO.fulfillment` e
  `ivaFulfillment`), `lib/utils/api-orden-costo.ts` (solo el sobre), `lib/utils/ingreso-empresa.ts` (firmas, abajo).
- `lib/services/CierresAdminService.ts` — ficha 481: `fulfillment`/`ivaFulfillment` nuevos tambien `null` para un actor sin
  acceso total (tambien con `tarifa: null`, que es el caso del nuevo).
- `lib/db/excepciones-aislamiento.ts` — `DineroProductosRepository` sale de `EXCEPCIONES_SQL_A_MANO`: con el filtro del
  `json_agg` la guardia `sql-a-mano-por-empresa` › «la lista solo baja» lo exige (rojo hasta quitarlo).
- `tests/integration/db/rechazo-tienda-cobro-tarifa-valor-migration.test.ts:423` — `table_schema = 'public'` (guardia de T4.6).
- NUEVO `tests/integration/db/tarifas-flexibles-snapshot.test.ts` (6 casos, Postgres real, tx revertida).
- Tests ajustados (forma, ningun importe): `cierre-detalle.test.ts` (+5 casos del nuevo), guardia 449
  `fulfillment-fuera-de-la-formula` (mira la `TarifaVigente` DENTRO del sobre; las 9 claves literales intactas),
  `cierre-aporte-repository.test.ts` (WHERE), `dinero-productos-sql.test.ts` (+2 columnas en la fila cruda),
  `cierres-admin-fulfillment-solo-central.test.ts` (+2 casos R46), `api-orden-costo`, `api-orden-lectura-service`,
  `aporte-por-orden`, `dinero-por-producto`, `_dinero-falso`, `conteo-productos-dinero`, `busqueda-por-guia-469`,
  `detalle-en-lote-464`, `wallet(-tienda)-detalle-movimiento`, `ingreso-ordenex` (fulfillment en el sobre),
  `ingreso-empresa-modelo-nuevo` (fuera la linea de la forma suelta de `ivaFulfillmentDeTarifa`) y 17 literales de
  `IngresoEmpresaDTO` (+`fulfillment`/`ivaFulfillment: "0.00"`). `tasks.md`: T5.3/T5.4 [x] y archivos esperados.

### Decisiones
1. **`tarifaDe` devuelve `TarifaCongelada` (= `ConModelo<TarifaVigente>`), no `TarifaTienda`.** La rama vieja de
   `TarifaTienda` exige `TarifaVigenteResuelta` (`tarifaId` + `fulfillment`), y la guardia 449 prohibe que `tarifaDe`
   devuelva el fulfillment. El tipo se escribe en `cierre-detalle.ts` y no se importa de `ingreso-empresa.ts`:
   `cierre-detalle` esta en el arbol del panel del navegador y el import arrastraba `Prisma` como valor
   (`pagos-captura.guardia` R19 se puso rojo; corregido).
2. **`tarifaValorId: string | null`** en `ValorResueltoBase`: el resolver siempre lo da; `null` solo al leer lo congelado
   tras borrar el valor (FK SET NULL). Todos sus consumidores lo escriben en columnas nullables.
3. **Aporte por orden (bug encontrado):** `CierreAporteRepository.buildWhere` traducia «hay tarifa» a
   `tarifa_id IS NOT NULL`; en el nuevo `tarifa_id` va NULL y un cierre nuevo no listaba ninguna orden de flete/comision.
   Ahora `OR [tarifa_id NOT NULL, tarifa_modelo = 'nuevo']` (= `tarifaDe` no es `null`; `satisfaceCriterio` sin cambio).
4. **Detalle del cierre de administracion (P5 = a):** `IngresoEmpresaDTO` gana `fulfillment` e `ivaFulfillment` (texto escala
   2, misma forma y misma funcion que `costoReal`), fuera de `total`. En el nuevo `tarifa` (fila de `tarifas`) es `null`, por
   eso van en el ingreso y no en `TarifaSnapshotDTO`. Analitica (`fulfillment` de `FilaDineroCruda`) y `costoReal` leen el
   fulfillment del nuevo del concepto congelado por la misma funcion. Contrato publico sin cambio de forma
   (`ivaFulfillment` ya existia en `OrdenCosto` desde T4.8): ni OpenAPI ni CHANGELOG.

### Firmas dobles: estado final
- **Estrechadas al sobre** (`ConModelo`): `montoFulfillmentDeTarifa` (sin sobrecarga suelta), `ivaFulfillmentDeTarifa`,
  `tieneFulfillment`, `costoEstimadoDe`/`costoRealDe` (`api-orden-costo.ts`). Ningun test intocable las usaba sueltas.
- **Siguen dobles, solo para el respaldo T0.1:** `TarifaDeCobro<T> = T | ConModelo<T>` (`derivarIngresoOrden`,
  `costosListadoOrden`, `agregarIngresosPorConcepto`) y las sobrecargas sueltas de `costoEnvioDeTarifa`/`desgloseCargaApi`.
  MEDIDO: con la union estrechada y las dos sobrecargas quitadas, `typecheck` da 102 errores en 10 archivos, TODOS en
  `tests/` (69 `ingreso-ordenex`, 14 `tarifa-especial-por-distrito`, **4 `respaldo-identico` (T0.1, intocable)**, …) y
  CERO en `lib/`/`app/`: ningun llamador de produccion usa ya la forma suelta. Restaurado con `cp` + `cmp`. Anotado en el
  comentario de `ConModelo` («SOLO PARA EL RESPALDO T0.1»). `TarifaDePago` sigue como la dejo T5.1 (desvio 6).

### Salida real
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: **TC_EXIT=0**, 0 errores.
- `pnpm exec eslint` sobre los 50 archivos tocados: **0 errores**, 19 avisos preexistentes (`_f`, `_id`, `_args`… sin usar en
  lineas no tocadas; `OrdenHistorialOrigenTipo` sin usar en `IOrdenRepository.ts:11`, linea no tocada).
- Postgres real, `tarifas-flexibles-snapshot.test.ts`: **Tests 6 passed (6)**.
- Postgres real, vecinos (13 archivos: snapshot, `rechazo-tienda-cobro-tarifa-valor-migration` (8/8 con el arreglo),
  `tarifas-flexibles-resolver`, `-respaldo`, `cierre-detail-congelado`, `ajuste-pago-mensajero-cierre`,
  `resolver-novedad-reprograma-dinero`, `aislamiento-cierres`, `aislamiento-wallet`, `zona-especial-dos-empresas`,
  `asimetria-sin-tarifa`, `costo-y-zona-api-415`, `dinero-productos.int`): **Test Files 2 failed | 11 passed (13)**; los 2
  rojos son `costo-y-zona-api-415` y `dinero-productos.int`, ambos en `tests/baseline-rojos.json` y rojos AL SEMBRAR
  («referencia a otra empresa», SL017), no en lo que miden.
- Unit y vecinos (216 archivos: todo test que importa los modulos tocados + los tocados + `aporte-por-orden-equivalencia`):
  **Test Files 1 failed | 215 passed (216); Tests 3823 passed | 22 skipped** — el unico rojo es `dinero-productos.int`
  (baseline, SL017).
- `pnpm run test:guardias`: **Test Files 2 failed | 322 passed | 3 skipped (327)**: `dependencias-declaradas-presentes`
  (4, baseline) y `sql-a-mano-por-empresa` › «la lista solo baja» (mio: arreglado quitando la excepcion; re-corrida
  `sql-a-mano-por-empresa` + `organizacion-en-modelos` + `plataforma-solo-en-lista` + `storage-solo-por-adaptador`: 48/48).

### Contrapruebas (`scratchpad/mut.py`; las cuatro restauradas con `cp` del respaldo y `cmp` igual)
- **M1 (la de tasks.md): `tarifaDe` lee el valor VIVO** (por la traza `tarifa_valor_id`, `tarifaValor.valor/ivaPct` en vez de
  la fila congelada) -> `× R41/R46 — cambiar y BORRAR valores y grupos…` (1 failed | 5 passed):
  ```
  "tienda_flete_entregado": {
  -   "ivaPct": "13.00",
  +   "ivaPct": "0.00",
  ```
- **M2: congelar sin `tienda_fulfillment`** (`conceptosCongeladosDe` lo filtra) -> 3 failed | 3 passed (solicitud, R41/R46 y
  corte): `- "fulfillment": "450.00"  + "fulfillment": "0.00"`, `- "ivaFulfillment": "58.50"  + "ivaFulfillment": "0.00"`.
- **M3: sin `AND dc."organizacion_id" = d."organizacion_id"` en el `json_agg`** -> `× R41 — Analitica exige la empresa en el
  json_agg…`: `AssertionError: expected '999.00' to be '0.00'`.
- **M4: el WHERE del aporte vuelve a `tarifaId: { not: null }`** -> `× R41/R46 …`: `expected [] to deeply equal [ …(3) ]`.

### Desvios / abiertos
1. `tarifaDe` da `TarifaCongelada`, no `TarifaTienda` (decision 1).
2. «La aprobacion» se mide con los dos feeds que la aprobacion escribe (`WalletFeedService`, `WalletTiendaFeedService`) y no
   con `resolverCierre` entero contra Postgres (sus siembras de wallet/caja chocan con SL017 en los tests de baseline).
3. El corte se ejerce con `CorteDiarioService` real y su repositorio de seleccion como doble (la seleccion no es de esta
   ficha); la re-solicitud 477 pasa por `CierreDiaService.solicitarCierre` real (rama `resolicitado`). La anulacion de la
   gestion se escribe a mano (no por `anularGestionDeCierreRechazado`).
4. **Abierto (UI):** la pantalla del detalle de cierre no pinta aun `ingresoEmpresa.fulfillment`/`ivaFulfillment`, y en el
   nuevo `tarifa` es `null` (la tarjeta «tarifa aplicada» queda vacia): es de frontend_dev / SLT-54.
5. **Abierto:** en el aporte por orden, una orden del nuevo sin el concepto de ese movimiento aparece con aporte 0.00 (igual
   que hoy una tarifa vieja con ese valor en 0): «hay tarifa» se lee como `tarifaDe` != `null`, no por concepto.

### Veredicto T5.3-T5.4
Hechas: las seis lecturas del congelado (cinco + `costoReal`) leen `cierre_detail_concepto`, el IVA del fulfillment sale del
congelado (detalle, Analitica y API), integracion de 6 casos en Postgres real con 4 contrapruebas rojas, bug del aporte en el
nuevo arreglado, firmas estrechadas salvo lo que exige T0.1 (medido); typecheck 0, lint 0 errores; sin commitear.

### Rojos del gate del implementer
- 3 rojos de forma legitima (a), ningun bug: `costoReal` pide ahora `tarifaModelo` + `conceptos` (design §7, R41/R46) y
  `congelado.tarifa` sale en el sobre `{ modelo: "viejo", tarifa }`.
- Literales actualizados A MANO (son el contrato de lo que se pide a Prisma): R18 de `orden-repository.api-lectura` (15 -> 17
  claves + el sub-`select` de `conceptos` con sus 6 campos) y `SELECT_DETALLE_106` de `no-regresion-106`. R25+R29: el doble
  devuelve `tarifaModelo: "viejo", conceptos: []` y se espera el sobre; importes intactos. Nuevo caso «SLT-52/R18»: ninguna
  clave nueva sale en el item ni en `costeo.congelado`.
- Mutacion: quitar `conceptos` del `select` de `OrdenRepository` -> 2 rojos (R18 y 106); restaurado con `cp` + `cmp`.

### T5 — verificación del implementer antes del commit
- `tarifas-flexibles-snapshot.test.ts` re-corrido por el implementer contra la base local: 6/6. Las 4 contrapruebas (M1-M4) comprobadas en sus logs y los 4 archivos restaurados (`cmp` igual).
- Gate 1.º: INIT_EXIT=1 por 3 rojos de forma (proyección de `costoReal`, arriba) → arreglados con literales a mano.
- `sql-a-mano-por-empresa`: sobraba `DineroProductosRepository` en `EXCEPCIONES_SQL_A_MANO` (ya filtra por empresa) → quitada.
- Gate 2.º (`./init.sh`): **INIT_EXIT=0**; test:rapido 1060 passed | 206 skipped; guardias 323 passed | 3 skipped.

## T5.5 (2026-11-03)

backend_dev, solo T5.5 (R52-R55, y R28 en esos caminos). MCP `codebase-memory-mcp` no conecto (timeout): Grep/Read.
Sin migracion, sin dependencias, sin `prisma generate`. `.env`: solo booleanos (existe, `DATABASE_URL` presente).

### Archivos
- `lib/utils/cierre-totales.ts:121` `CobroCongeladoDeOrden` (subconjunto de `DETALLE_SELECT`); `:137` `baseDelCobroCongelado(resultado, detalle)`
  = `derivarIngresoOrden(…, tarifaDe(detalle, detalle.conceptos))` con el pedido congelado: `ingreso_flete` si `entregado`,
  `ingreso_flete_devolucion` si no, `0.00` si no aporta; `:161` `rebasarConElCobroCongelado(gestiones, tarifas, cobroDe)`: cambia
  solo el `baseFlete` de las del nuevo; `cobroDe` solo se llama para ellas (el viejo pasa tal cual, R36).
- `lib/utils/ingreso-empresa.ts:13-15` — solo el comentario del import: ahora HAY ciclo con `cierre-totales` (desvio 1).
- `lib/repositories/CierresAdminRepository.ts:1792` (398) — si la tarifa de pago es del nuevo, lee el `cierre_detail` de
  `(cierreId, ordenId)` con `DETALLE_SELECT` (falta = `CierreDetalleFaltanteError`) y rebasa ANTES de `pagoPorResultado`,
  `ingresoBodegaPorResultado` y `pagosDelCierre`.
- `lib/repositories/CierreDiaRepository.ts:2092` (477) — igual, una consulta (`cierreId` + `ordenId IN`) para las rehechas del
  nuevo, con SU resultado, antes de `derivarPagos`/`derivarIngresoBodega`/`pagosDelCierre`.
- `lib/repositories/CierreDiaRepository.ts` (`crearCierre`, R55): `:1471` con `pagos.modelo === 'nuevo'` NO escribe los
  `pagoByGestionId`/`ingresoByGestionId` del servicio; `:1600` guarda en memoria el cobro que congela por orden (mismas entradas
  del detalle + `conceptosEnMemoriaDe`, `:676`, la conversion que tambien usa `conceptosCongeladosDe`); `:1639` tras
  `asegurarMismoModelo`: relee las gestiones del servicio que ESTA tx vinculo (`id`, `ordenId`, `resultado`), reconstruye la tarifa
  de pago sin base desde `pagos.congelados` (`tarifasDePagoSinBase`, `:697`), rebasa, escribe `pago_mensajero` /
  `ingreso_bodega_rechazo` (`escribirSnapshotsPorGestion`, `:206`, el bloque de siempre extraido sin cambios), las filas de
  `gestion_pago_congelado` y los dos totales del cierre (`cierreDia.update`, SUMA de los snapshots de la tx). El viejo: sin cambio.
- NUEVO `tests/unit/utils/cierre-totales-base-congelada.test.ts` (7), NUEVO `tests/integration/db/tarifas-flexibles-base-congelada.test.ts` (6).
- `tests/unit/repositories/cierre-pago-congelado.test.ts` — solo dobles (ningun importe ni literal tocado): `detalleNuevo(ordenId)`
  para `cierreDetail.findFirst` (398) y `cierreDetail.findMany` (477); la relectura de `crearCierre` devuelve `ordenId` y
  `resultado`; `cierreDia.update`; la suma de snapshots del nuevo devuelve `[]`. Sus 11 casos siguen con los mismos esperados.

### R -> test
| R | test |
|---|---|
| R52 | `tarifas-flexibles-base-congelada.test.ts` › «R52 — la 398 corrige a rechazada: base = flete por rechazo CONGELADO (10 % de 20000), no el de hoy (20 % de 50000)», «R52/R28 — sin `tienda_flete_rechazo` al congelar (creado despues): la base es 0.00 y el pago en % da 0»; unit › «SLT-52 R52 — entregado…», «SLT-52 R52 — rechazo…», «SLT-52 R27/R52 — concepto en %…» |
| R53 | `tarifas-flexibles-base-congelada.test.ts` › «R53 — la re-solicitud 477 vincula la rehecha (rechazo): su base sale del cobro congelado de su orden» |
| R54 | `tarifas-flexibles-base-congelada.test.ts` › «R54 — cobro congelado en el VIEJO y pago del nuevo: la base es el flete devuelto del viejo congelado (1000.00)»; unit › «SLT-52 R54 — cobro viejo congelado…», «SLT-52 R54 — viejo SIN tarifa congelada…» |
| R55 | `tarifas-flexibles-base-congelada.test.ts` › «R55 — solicitud: el pago se resolvio con A y el cobro se congela con B -> base, pagos y totales salen de B», «R55 — corte diario: lo mismo en el `vencido`»; unit › «SLT-52 R52/R55 — sustituye la base del nuevo…» |
| R28 (en esos caminos) | «R52/R28 — sin `tienda_flete_rechazo`…»; unit › «SLT-52 R28 — concepto ausente al congelar…» |

R52 y R54 afirman ademas que la base es lo que la APROBACION le cobra a la tienda (`WalletFeedService`): `ingreso_flete_devolucion:2000.00`
(+260.00 IVA) y `:1000.00` (+130.00). R55 afirma que el servicio resolvio de verdad con A (`baseFlete` 1500.00) antes del cambio a B:
el cambio ocurre DENTRO de `resolvePagos` (resolver real que, tras resolver, actualiza el valor como dueño y vuelve al rol de la app).

### Salida real
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: **TC_EXIT=0**, 0 errores.
- `pnpm exec eslint` sobre los 7 archivos tocados: **LINT_EXIT=0**, sin avisos.
- Postgres real, `tarifas-flexibles-base-congelada.test.ts`: **Tests 6 passed (6)**.
- Unit y vecinos (57 archivos: todo test fuera de `tests/integration` que importa `CierreDiaRepository`, `CierresAdminRepository`,
  `cierre-totales`, `CierreDiaService` o `CorteDiarioService`, + `ingreso-empresa-modelo-nuevo` y `respaldo-identico` (T0.1)):
  1.ª corrida 8 rojos, todos en `cierre-pago-congelado.test.ts` por dobles sin `cierreDetail.findFirst/findMany` (forma, arreglado
  arriba); 2.ª: **Test Files 57 passed (57); Tests 1186 passed (1186)**.
- Postgres real, vecinos (10 archivos: el nuevo, `tarifas-flexibles-snapshot`, `-resolver`, `-respaldo`, `cierre-detail-congelado`,
  `ajuste-pago-mensajero-cierre`, `resolver-novedad-reprograma-dinero`, `asimetria-sin-tarifa`, `477-resolicitud-rechazado-sql-real`,
  `correccion-resultado-gestion.int`): **Test Files 2 failed | 8 passed (10); Tests 16 failed | 68 passed (84)**. Los 2 rojos son
  `477-resolicitud-rechazado-sql-real` y `correccion-resultado-gestion.int`, en `tests/baseline-rojos.json`, rojos AL SEMBRAR
  («referencia a otra empresa: orden.zona_id -> zona» / «tarifa_zona_mensajero.zona_id -> zona», SL017), igual que en T5.1.
- `pnpm run test:guardias`: **Test Files 1 failed | 323 passed | 3 skipped (327)**; el rojo es `dependencias-declaradas-presentes`
  (4, baseline).

### Contrapruebas (`scratchpad/mutar.mjs` + `scratchpad/mut.sh`: `cp` a respaldo, mutar, correr SOLO el `-t` afectado, `cp` de vuelta, `cmp`)
- **M1 (398 vuelve al `baseFlete` del resolver)** — `rebasadas = rebasarConElCobroCongelado(` -> `void rebasarConElCobroCongelado(`
  en `CierresAdminRepository.ts` -> `× R52 — la 398 corrige…`, `× R52/R28 — sin tienda_flete_rechazo…` (Tests 2 failed | 4 skipped):
  `- "base": "2000.00"  + "base": "10000.00"`, `- "importe": "1000.00"  + "importe": "5000.00"`. `cmp`: identico.
- **M2 (477 igual)** — `tarifas = rebasarConElCobroCongelado(` -> `void …` en `CierreDiaRepository.ts` -> `× R53 — la re-solicitud 477…`
  (1 failed | 5 skipped): `- "base": "2000.00"  + "base": "10000.00"`, `- "importe": "1000.00"  + "importe": "5000.00"`. `cmp`: identico.
- **M3 (`monto_cobrar` VIVO en vez del congelado como entrada de `baseDelCobroCongelado`)** — en la 398 `() => detalle` ->
  `() => ({ ...detalle, montoCobrar: previa.orden.montoCobrar })` -> `× R52 — la 398 corrige…` (1 failed | 1 passed | 4 skipped):
  `- "base": "2000.00"  + "base": "5000.00"`, `- "importe": "1000.00"  + "importe": "2500.00"`. `cmp`: identico.
- **M4 (`crearCierre` usa el `baseFlete` del servicio)** — `tarifasDePagoSinBase` copia `p.base` y `crearCierre` no rebasa -> `× R55 —
  solicitud…`, `× R55 — corte diario…` (2 failed | 4 skipped): `- "base": "3000.00"  + "base": "1500.00"`,
  `- "importe": "300.00"  + "importe": "150.00"` (satelite `150.00` -> `75.00`). `cmp`: identico.
- **M5 (devolver 0 en la rama vieja)** — `if (detalle.tarifaModelo !== "nuevo") return "0.00";` al inicio de `baseDelCobroCongelado`
  -> `× R54 — cobro congelado en el VIEJO…` (1 failed | 5 skipped): `- "base": "1000.00"  + "base": "0.00"`,
  `- "importe": "500.00"  + "importe": "0.00"`. `cmp`: identico.

### Desvios / abiertos
1. **Ciclo de import `cierre-totales` <-> `ingreso-empresa`.** El design pide la funcion en `cierre-totales.ts` con
   `derivarIngresoOrden`, e `ingreso-empresa` ya importaba `computeTotales` de alli (su comentario decia «verificado que no crea
   ciclo»). Es inocuo (ninguno usa lo importado al evaluar el modulo; los 57 archivos de unit y los 10 de integracion lo cargan) y
   ambos comentarios lo dicen. No hay guardia de ciclos. Si se prefiere sin ciclo: mover `computeTotales` o la funcion a otro modulo.
2. **La 398 y la 477 leen el `cierre_detail` SOLO si la tarifa de pago es del nuevo** (el design dice «leer… Si la tarifa de pago es
   del nuevo, sustituir»). El viejo no tiene base: leerlo no cambia nada y anadiria un error duro nuevo a un camino que hoy no lo tiene.
3. **`crearCierre`: el `create` del cierre sigue escribiendo los totales de pago del servicio y, en el nuevo, se sobrescriben en la
   misma tx** con la suma de los snapshots (`cierreDia.update`). El estado final no lleva los del servicio; el `create` no se toca
   para no cambiar el contrato de sus dobles.
4. **La tarifa de pago se reconstruye desde `pagos.congelados`** (no se anade un campo a `CrearCierreInput`): cada fila trae el
   `ValorPago` del actor; una gestion sin filas no tiene valor y paga 0, igual que antes. Solo cuentan las gestiones del servicio
   (`pagoByGestionId` + congelados) que la tx vinculo, como el `updateMany` de siempre.

### Veredicto T5.5
Hecha: la base del % sale del cobro congelado en la 398, la 477 y `crearCierre` (solicitud y corte), 6 casos en Postgres real y 7 unit
en verde, las 5 contrapruebas en rojo y restauradas (`cmp`); typecheck 0, lint 0; sin migracion; sin commitear.

### Gate del implementer (T5.5)

`./init.sh` rapido sobre el arbol de T5.5: `INIT_EXIT=0` (4521 passed, 24 skipped; 246 rojos heredados del baseline fuera de la seleccion). El worktree no tiene `.env`: la integracion contra Postgres la corrio backend_dev aparte (6/6).

## Arreglo del rojo de la FICHA 450 (`aprobacion-consultas-en-serie.test.ts`) — decision del leader, opcion (a)

**Causa.** No hay paralelismo. T5.3 (02899491) anadio `conceptos: { select }` a `DETALLE_SELECT`; Prisma 7.8 (estrategia de
carga `query`) la emite como una SEGUNDA consulta sobre `"public"."cierre_detail_concepto"`, EN SERIE y por la misma conexion
(sonda: max en vuelo 1, 0 solapes, 0 avisos). Fallaba solo el recuento `cuantasConteniendo("cierre_detail")`, que casaba por
subcadena con las dos tablas (2 en vez de 1; 4 en vez de 2).

**Arreglo (solo test, sin tocar codigo de produccion).** Recuento por identificador EXACTO con las comillas de Prisma
(`TABLA_DETALLE = '"cierre_detail"'`), mas una asercion explicita de `"cierre_detail_concepto"` (1 por feed, 2 con los dos) y la
igualdad de conexion de los conceptos con las gestiones. Las aserciones de R1 (`maximoEnVuelo`, `maximoEnVueloDeLaConexionDe`,
`solapes`, `conexionesUsadas`) no cambian; `maximoEnVueloDeLaConexionDe("cierre_detail")` sigue con subcadena A PROPOSITO.

**Salida.** 450: 9/9. Integracion SLT-52 (`tarifas-flexibles-*` x5, `rechazo-tienda-cobro-tarifa-valor-migration`) + 450:
7 archivos, 89/89.

**Contraprueba** (`lib/utils/cierre-detalle.ts`, restaurado con `cmp`):
- Conceptos en `Promise.all` con la consulta padre (sacando `conceptos` del select, `findMany` aparte por `cierreDetailId`):
  la 450 de integracion queda VERDE 9/9 — Prisma 7.8 serializa la tx interactiva (es lo que ya documenta la cabecera del
  archivo: «ESTE `1` YA ERA `1` ANTES DEL ARREGLO»). La MISMA mutacion la cazan en rojo la guardia
  `consultas-concurrentes-en-transaccion.guardia.test.ts` («cero violaciones en `lib/`») y el bloque 450/R3 de
  `wallet-feed-service.test.ts` / `wallet-tienda-feed-service.test.ts` («no hay ningun solape…»).
- Variante con el filtro relacional `cierreDetail: { cierreId }`: la 450 de integracion ROJA por recuento (2/1, 4/2), porque esa
  consulta tambien nombra `"cierre_detail"`.

**Gate** (`./init.sh` rapido, con `.env`): `INIT_EXIT=1`, 11 failed | 17322 passed | 26 skipped. Rojos: `caja-backfill`,
`notificacion-evento-bloqueo-cierre-migration`, `notificacion-evento-gasto-fijo-migration`,
`notificacion-evento-webhook-suscripcion-migration` (estado de la base local, tambien en dev) y `carga-division` (2: cuenta
`historial_accion` global y otra prueba escribe a la vez; sola pasa 16/16). Ninguno de SLT-52; la 450 verde dentro del gate.

## T6.1-T6.3 (2026-11-03)

MCP `codebase-memory` no respondio (timeout de conexion): todo por Grep/Read. Sin migracion, sin
`prisma generate`, sin dependencias nuevas.

### Archivos

Creados:
- `lib/interfaces/repositories/ITarifaValorRepository.ts`, `lib/interfaces/repositories/IGrupoDistritosRepository.ts` (T6.1)
- `lib/repositories/TarifaValorRepository.ts`, `lib/repositories/GrupoDistritosRepository.ts` (T6.1)
- `lib/interfaces/services/ITarifaValorService.ts`, `lib/interfaces/services/IGrupoDistritosService.ts` (T6.2)
- `lib/services/TarifaValorService.ts`, `lib/services/GrupoDistritosService.ts` (T6.2)
- `lib/tarifas/niveles.ts` — `nivelDeValor(concepto, columnas)`: el nivel o el campo culpable (R5-R7), misma regla que los CHECK `tarifa_valor_niveles_*`
- `lib/tarifas/servicios.ts` — fabrica `serviciosDeTarifas(prisma)` (T6.3)
- `tests/unit/services/tarifa-valor-service.test.ts`, `tests/unit/services/grupo-distritos-service.test.ts`, `tests/unit/tarifas/servicios-composicion.test.ts`

Modificados:
- `lib/types/tarifa-flexible.ts` — `FijarValorInput` (ancho: `ivaPct` admite texto para poder rechazar `"0"` en un pago), `TarifaValorDTO`, esquemas `crearGrupoSchema`/`renombrarGrupoSchema`/`fijarDistritosSchema`, `GrupoDistritosDTO`.
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` — 6 entradas nuevas en el censo (`TarifaValorRepository.fijar`/`quitar`, `GrupoDistritosRepository.crear`/`renombrar`/`fijarDistritos`/`borrar`, todas `abre_tx`) y `ESCRITOR_PENDIENTE_EN_CURSO` vaciada (sus 5 tipos ya tienen productor).

### Desvios del design §8 (decididos y anotados)

1. **El historial lo escribe el repositorio, no el service.** El design da a los services `IHistorialAccionRepository`, pero en
   este codigo esa interfaz es de LECTURA y la escritura tiene un punto unico, `appendAccion(tx, …)`, que exige la `tx` en curso;
   la guardia `historial-accion-escrituras-cubiertas` mide por METODO de repositorio que abre `$transaction`. Patron calcado de
   `TarifaRepository`: el service pasa `actor.usuarioId` y el repositorio hace mutacion + `appendAccion` en la misma transaccion.
   Los services no reciben un repositorio de historial.
2. **`fijarValor` no devuelve `not_found`.** Zona, grupo, tienda o vehiculo inexistentes en la empresa son `validation_error` en su
   campo (patron `TarifaService`); `not_found` queda en `quitarValor`, `renombrarGrupo`, `fijarDistritos` y `borrarGrupo`.
3. **Upsert sin `prisma.upsert`**: el unico es NULLS NOT DISTINCT y Prisma no admite `null` en un `where` de unico compuesto.
   `findFirst` del nivel exacto + `update`/`create` dentro de la tx. Una carrera de dos altas en el mismo nivel la para
   `tarifa_valor_nivel_key` (sale como error; no quedan dos filas).
4. Antes/despues del historial (`valor_anterior`/`valor_nuevo`, `varchar(60)` via `valorDeCatalogo`): valor → `"monto 1500.00 IVA 13.00"`
   / `"porcentaje 12.50"`; renombrar → los dos nombres; mover distritos → `"3 distritos"` → `"2 distritos"`; crear → `null` →
   `"N distritos"`; borrar grupo → `"2 distritos, 3 valores"` → `null` (R12: cuantos valores se fueron por cascada). `monto` NULL.
5. `fijarDistritos` borra solo los que salen y crea solo los que entran (los que se quedan no se tocan).
6. Un `ivaPct: null` en un pago tambien se rechaza (lo decide `escrituraPagoSchema` de T1, `z.never().optional()`): la pantalla de
   SLT-54 tiene que OMITIR el campo en los pagos, no mandarlo a `null`.

### Mapa R → test

| R | Test |
|---|---|
| R3 | `tarifa-valor-service` › «guarda el modo, el valor y el IVA del cobro tal como llegan (R3)» |
| R4 | `tarifa-valor-service` › «R3/R4/R45 — rangos e IVA» (negativo, % > 100, IVA > 100, IVA < 0, cobro sin IVA ausente/null) y «un monto de 150 es valido» |
| R5 | `tarifa-valor-service` › «R5/R6» cobro: zona, grupo, tienda_zona, tienda_grupo, tienda_general |
| R6 | `tarifa-valor-service` › «R5/R6» mensajero/satelite: zona, zona_vehiculo, grupo, grupo_vehiculo |
| R7 | `tarifa-valor-service` › «R7» (vehiculo en cobro, tienda en pago, grupo sin zona ×2, sin nivel ×2, tienda no tarifable, grupo de otra zona, zona/vehiculo inexistentes) |
| R8 | `tarifa-valor-service` › «fijar un nivel ya ocupado REEMPLAZA la fila…» y «fijar un nivel libre CREA la fila…» (repositorio real) |
| R9 | `tarifa-valor-service` › «R9 — quitar», «quitar borra la fila…» y «quitar un id que no existe…» (repositorio real) |
| R10 | `grupo-distritos-service` › «R10» (zona, nombre recortado y distritos sin repetir, nombre ocupado, renombrar excluyendo al propio, blanco y > 60, not_found) |
| R11 | `grupo-distritos-service` › «R11» (ajeno nombrado, en otro grupo nombrado, grupo propio excluido) y «lo que la base rechaza…» (P2002 de distritos y de nombre, repositorio real) |
| R13 | `tarifa-valor-service` y `grupo-distritos-service` › «R13 — matriz de roles» (7 roles sin escritura, admin lee, 6 sin lectura); `servicios-composicion` (la fabrica que usaran las actions de SLT-54) |
| R14 | `tarifa-valor-service` › «R8/R14 …» y `grupo-distritos-service` › «R14 — historial…» (fila por la `tx`, cero por el cliente raiz, antes/despues literales) |
| R45 | `tarifa-valor-service` › «pago al mensajero con IVA 0», «… con IVA 13», «pago a la satelite con IVA 0», «un pago sin IVA se guarda con ivaPct null» |

R12 (cascada en la base) y R15 (dos empresas) quedan para T6.4 en Postgres real; aqui solo el conteo de R12 en el historial.

### Verificacion

- `pnpm run typecheck`: exit 0.
- `pnpm run lint`: exit 0, `✖ 232 problems (0 errors, 232 warnings)`; ninguno en los archivos de esta tanda.
- `pnpm exec vitest run` de los 3 tests + la guardia del historial: `Test Files 4 passed (4) · Tests 190 passed (190)`
  (tarifa-valor 61, grupo-distritos 35, composicion 4, guardia 90).
- `pnpm exec vitest related --run` sobre los 7 `lib/` tocados: `Test Files 4 passed (4) · Tests 127 passed (127)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 326 passed (327) · Tests 4 failed | 4561 passed | 1 skipped`; los 4 rojos son
  `dependencias-declaradas-presentes.guardia` (baseline, igual que en T1-T5).
- CRLF: cuatro archivos salieron con CRLF de un script de edicion; normalizados a LF antes de las mutaciones y de la verificacion final.

### Mutaciones (a mano, restauradas y comprobadas con `cmp` contra la copia del scratchpad: IGUAL en las 8)

| # | Mutacion | Rojo |
|---|---|---|
| M1 | `TarifaValorService`: `ROLES_QUE_ESCRIBEN` con `"admin"` | 2 failed: «'admin' recibe forbidden al fijar…», «… al quitar…» |
| M1b | `GrupoDistritosService`: idem | 1 failed: «'admin' recibe forbidden en las cuatro escrituras…» |
| M2 | `TarifaValorService`: quitar `ivaPct` de los pagos antes de validar (ignorar en vez de rechazar) | 3 failed: pago mensajero IVA 0, IVA 13, satelite IVA 0 |
| M3 | `GrupoDistritosService`: `const ajenos: string[] = []` | 1 failed: «un distrito que no es de la zona se rechaza nombrandolo…» |
| M4 | `TarifaValorRepository.fijar`: `appendAccion(this.prisma, …)` (fuera de la tx) | 2 failed: «…REEMPLAZA la fila…», «…CREA la fila…» |
| M4b | `GrupoDistritosRepository.crear`: idem | 1 failed: «crear: grupo y distritos por la tx…» |
| M5 | fabrica: `new TarifaValorService(undefined as never)` | 2 failed: «TarifaValorService recibe un TarifaValorRepository real…», «listar valores llega al cliente…» |
| M5b | fabrica: `new GrupoDistritosRepository({} as never)` (otro cliente) | 2 failed: «GrupoDistritosService recibe…», «listar grupos llega al cliente…» |

Veredicto: T6.1-T6.3 hechas; services, repositorios y fabrica verdes con 8/8 mutaciones en rojo; R12/R15 en Postgres real quedan para T6.4.

## T6.4-T6.5 (2026-11-03)

MCP `codebase-memory` no respondio (timeout de conexion): todo por Grep/Read. Sin migracion, sin
`prisma generate`, sin dependencias nuevas. `.env` presente (DATABASE_URL definida: si); los tests
de integracion CORREN, no se saltan.

### Archivos

Creados:
- `tests/integration/db/tarifas-flexibles-escritura.test.ts` (T6.4) — 5 casos, Postgres real, dos empresas,
  todo en `enTransaccionRevertida`. Escribe por la fabrica `serviciosDeTarifas` (services + repos reales)
  como `servi_app` con la empresa A (`comoApp`). El cliente que reciben los repos (`clienteDeEscritura`)
  abre un SAVEPOINT real por `$transaction` y lleva dos trampas de R14: el `historialAccion` del cliente
  RAIZ lanza (historial fuera de la tx = rojo) y, con `fallarTrasHistorial`, el de dentro escribe la fila
  y luego lanza (el savepoint debe llevarse cambio y fila).
- `tests/integration/db/zona-update-conserva-grupos.test.ts` (T6.5) — 2 casos, Postgres real.

Modificados:
- `lib/repositories/ZonaRepository.ts` (`update`) — la N:M se reemplaza por diferencia: `deleteMany`
  solo de los que salen (`zonaId` + `distritoId in salen`) y `createMany` solo de los que entran,
  usando `distritosPrevios` (ya se leia). La empresa la sigue poniendo la extension (ninguna query de
  ese metodo lleva `organizacion_id` explicito; `zonaId` es de la empresa activa).
- `tests/unit/repositories/zona-repository.test.ts` — 2 premisas que describian el reemplazo completo:
  «SLT-76 … con la misma lista» ahora afirma que NI `deleteMany` NI `createMany` corren; «R8 (update)»
  pasa `previos = []` para que d1 ENTRE y el `createMany` (que lanza el P2002 del doble) llegue a correr.
- `specs/SLT-52-tarifas-flexibles-modelo/tasks.md` — T6.4 y T6.5 `[x]`.

### Mapa R → test

| R | Test |
|---|---|
| R8 | `tarifas-flexibles-escritura` › «R8/R14 — fijar crea; fijar el mismo nivel REEMPLAZA (misma fila); otro nivel es otra fila…» (misma `id`, 1800.50; grupo y zona+vehiculo son filas aparte) |
| R9 | `tarifas-flexibles-escritura` › «R9/R14 — quitar borra la fila y deja historial; quitarla otra vez es not_found…» (la resolucion con el nivel siguiente ya la cubre `tarifas-flexibles-resolver`, T3.4) |
| R12 | `tarifas-flexibles-escritura` › «R12/R14 — crear grupos, mover un distrito entre ellos y borrar uno…» (CASCADE de distritos y valores; el distrito que se queda conserva su fila); `zona-update-conserva-grupos` › «guardar la zona SIN cambiar distritos conserva cada grupo…» y «quitar d2 de la zona (y meter d4) saca a d2 de su grupo, y SOLO a el» |
| R14 | los tres anteriores (filas literales con actor y antes/despues) y `tarifas-flexibles-escritura` › «R14 — si algo falla DESPUES de escribir el historial, el savepoint se lleva el cambio Y su fila…» (fijar, quitar, crear, mover, borrar) |
| R15 | `tarifas-flexibles-escritura` › «R15 — con la empresa A activa no se lee, ni se escribe, ni se borra nada de B (tampoco con SQL a mano)» |

### Verificacion (salida real)

- `pnpm run typecheck`: exit 0 (corrido de nuevo tras el ultimo cambio).
- `pnpm run lint`: exit 0, `✖ 232 problems (0 errors, 232 warnings)`; en los archivos tocados solo el
  warning previo `ZonaRepository.ts 13:10 'normalizeName' is defined but never used` (linea no tocada).
- `pnpm exec vitest run tests/integration/db/tarifas-flexibles-escritura.test.ts tests/integration/db/zona-update-conserva-grupos.test.ts`:
  `Test Files  2 passed (2)` / `Tests  7 passed (7)` — 0 skipped.
- `pnpm exec vitest run tests/unit/repositories/zona-repository.test.ts`: `Tests  61 passed (61)`.
- `pnpm exec vitest run tests/integration/db/tarifa-zona-borrado-fk-real.test.ts tests/integration/db/zona- tests/integration/actions/zonas-action.test.ts tests/integration/db/tarifas-flexibles-escritura.test.ts`:
  `Test Files  1 failed | 16 passed (17)` / `Tests  7 failed | 201 passed (208)`. El unico rojo es
  `tarifa-zona-borrado-fk-real` (`DriverAdapterError: referencia a otra empresa: orden.tienda_id -> usuario`),
  que NO llama a `update` y falla IGUAL con el `ZonaRepository.ts` de HEAD: `Tests  7 failed | 2 passed (9)`.
- `pnpm exec vitest related --run lib/repositories/ZonaRepository.ts` arrastra casi toda la suite (439 archivos):
  `Test Files  100 failed | 339 passed (439)` / `Tests  228 failed | 4371 passed | 398 skipped (4997)`.
  Rojos atribuibles a este cambio: solo los 2 de `zona-repository.test.ts` (premisas del reemplazo
  completo), ya corregidos. De los demas, los que usan `Zona*` (`cierre-rechazo-tienda-aprobacion`,
  `cierre-rechazo-tienda-totales`, `corte-diario-segundo-cierre-sql-real`, `historial-accion-atomicidad`,
  `tarifa-zona-borrado-fk-real`) dan EXACTAMENTE lo mismo con el repositorio de HEAD
  (`Tests  17 failed | 5 passed | 26 skipped (48)` en los dos); el resto (caja/wallet/libro/458…) no usa
  `ZonaRepository`. Rojo previo, no de esta tanda; queda anotado para el leader/T7.4.

### Mutaciones (copia en el scratchpad, mutar, correr, restaurar, `cmp` ok en todas)

| # | Mutacion | Resultado |
|---|---|---|
| M1 | `TarifaValorRepository.fijar`: la busqueda del nivel nunca encuentra (`id` imposible) → siempre `create` | ROJO: `× R8/R14 …` (P2002 de `tarifa_valor_nivel_key`) y `× R14 … savepoint` — `Tests 2 failed, 3 passed (5)` |
| M2 | `fijar`: `grupoId: undefined` en el `where` del nivel | ROJO: `× R8/R14` (`expected [ …3 ] to deeply equal [ …4 ]`) y `× R12/R14` (`to have a length of 3 but got 2`) |
| M3 | `fijar`: `appendAccion(this.prisma, …)` (historial fuera de la tx) | ROJO: 4 de 5 casos (`HistorialFueraDeLaTransaccion`) |
| M4 | `GrupoDistritosRepository.borrar`: `appendAccion(this.prisma, …)` | ROJO: `× R12/R14`, `× R14 … savepoint` (`expected error to be instance of FalloTrasElHistorial`) |
| M5 | Politica `tarifa_valor_por_empresa` `USING (true) WITH CHECK (true)` (ALTER POLICY dentro de la tx revertida) | ROJO: `× R15` (`expected { status: 'ok', items: [ {…(12)} ] } to deeply equal { status: 'ok', items: [] }`) |
| M6 | Politica `grupo_distritos_por_empresa` `USING (true)` | ROJO: `× R15` (`items: [ {…(4)} ]`) |
| M7 | Sin `servi_app` en la siembra (`fijarEmpresa` en vez de `comoApp`) | VERDE — EQUIVALENTE para este archivo: el caso R15 vuelve a llamar `comoApp(e.tx, e.A)` tras su premisa, asi que la mutacion de la siembra no le llega. Repetida donde vive (M7b). |
| M7b | Sin `servi_app` en el caso R15 (`fijarEmpresa` en vez de `comoApp`) | ROJO: `× R15` (`items: [ {…(12)} ]`) |
| M8 | `GrupoDistritosRepository.fijarDistritos`: borra todos los del grupo y recrea los pedidos | Primera corrida VERDE (el estado final es el mismo). Se anadio la afirmacion de que la fila del distrito que se queda conserva su `id` (design §8, desvio 5 de T6.1); despues: ROJO `× R12/R14` (`expected '3c27…' to be 'e4ff…'`) |
| M9 | `ZonaRepository.update`: `deleteMany({ zonaId })` sin `in: salen` + `createMany` de los que entran | ROJO: `× R12 — quitar d2…` (`expected [ Array(1) ] to deeply equal [ …(3) ]`); el caso «sin cambios» sigue verde porque con `salen` vacio no se borra (no equivalente: lo mata el otro caso) |

Sobre «quitar `organizacion_id` del WHERE»: los repositorios de valores y grupos NO tienen
`organizacion_id` en ningun `where` (lo pone la extension y lo respalda la RLS, design §8), y el test
ejecuta los repos sobre el `tx` crudo: la barrera medida es la RLS. Por eso la mutacion del filtro de
empresa es M5/M6/M7b (la politica o el rol), no una edicion del repo. La extension (`conAislamientoPorEmpresa`)
no se ejerce aqui: no se puede montar sobre un `tx` interactivo.

**Contraprueba T6.5** — `update` vuelve a `deleteMany({ where: { zonaId: id } })` + `createMany(data.distritoIds)`:

```
[C-T65-contraprueba] VITEST_EXIT=1
[C-T65-contraprueba] restaurado (cmp ok)
     × R12 — guardar la zona SIN cambiar distritos conserva cada grupo con sus distritos, y el valor del grupo 621ms
     × R12 — quitar d2 de la zona (y meter d4) saca a d2 de su grupo, y SOLO a el 113ms
AssertionError: expected [] to deeply equal [ …(2) ]
AssertionError: expected [ …(2) ] to deeply equal [ …(2) ]
      Tests  2 failed (2)
```

(La primera contraprueba, antes de anadir la afirmacion de los `id` de `zona_distrito`, tambien dio
`Tests  2 failed (2)`, con `expected [] to deeply equal [ Array(1) ]` en el segundo caso.)

Veredicto: T6.4-T6.5 hechas; 7/7 de integracion en verde y corriendo, 9 mutaciones + contraprueba en rojo, M7 equivalente explicada y repetida (M7b) donde mata.
