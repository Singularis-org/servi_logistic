# SLT-52 — tarifas-flexibles-modelo · tasks.md

> Requisitos R1-R45 (`requirements.md`), diseño en `design.md`. Cada tanda cierra con
> `./init.sh` en verde y un commit por task lógica. `[P]` = puede ir en paralelo con la task
> anterior de la misma tanda. El mapa `R<n> -> test` va en `progress/impl_SLT-52.md`.
>
> Reglas que aplican a todas las tasks:
> - Dinero en `Prisma.Decimal`, salida texto con 2 decimales; nunca `number`, `parseFloat` ni
>   `Number(` sobre importes.
> - Migraciones nuevas, nunca editar una aplicada; cada una con su `down.sql`.
> - Ninguna dependencia nueva.
> - No leer ni imprimir valores de `.env`; si hace falta, solo booleanos («¿hay `DATABASE_URL`?»).
> - Un test de integración no puede pasar sin datos: nada de `if (!x) return;`; cada caso afirma
>   antes lo que sembró.
> - P1-P4 están cerradas (tabla de decisiones). En especial P4: los pagos al mensajero y a la
>   satélite no llevan IVA; ningún tipo, columna ni test de pago puede tener uno.

## T0 — Contrato del modelo viejo, antes de tocar nada

- [ ] **T0.1** Crear `tests/unit/tarifas/respaldo-identico.test.ts`: tabla de casos con **importes
  literales** (no calculados con la función) de `derivarIngresoOrden` (los 5 resultados, con y sin
  comisión, GAM sí/no, especial con y sin pacto, sin tarifa), `costosListadoOrden`,
  `desgloseCargaApi`, `pagoPorResultado` e `ingresoBodegaPorResultado` con las firmas de HOY.
  Cubre: R36. Hecho: verde sobre el código actual; commit propio antes de T2.
- [ ] **T0.2** [P] Listar en `progress/impl_SLT-52.md` los llamadores de cada función pública y de
  los dos resolvers (Grep), y los E2E que se correrán en T7. Hecho: lista con ruta:línea.

## T1 — Esquema (depende de T0)

- [ ] **T1.1** Migración `…_tarifas_flexibles_enums` (5 enums) + `down.sql`. Cubre: R1, R44.
- [ ] **T1.2** Migración `…_tarifas_flexibles_tablas`: `grupo_distritos`, `grupo_distritos_distrito`,
  `tarifa_valor`, `cierre_detail_concepto`, `gestion_pago_congelado`, columna
  `cierre_detail.tarifa_modelo DEFAULT 'viejo'`, CHECKs, únicos (NULLS NOT DISTINCT a mano), índices,
  FKs compuestas, RLS + políticas `<t>_por_empresa`, GRANT y `REVOKE UPDATE, DELETE` de
  `cierre_detail_concepto` + `down.sql`. Modelos en `db/schema.prisma` con sus `map`.
  `tarifa_valor.iva_pct` nullable con CHECK `tarifa_valor_iva_solo_tienda`; `gestion_pago_congelado`
  sin columna de IVA. Cubre: R4, R7, R8, R10, R11, R12, R15, R34, R43, R44, R45.
- [ ] **T1.3** Migración `…_tarifas_flexibles_misma_empresa` con
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` + `down.sql`. Cubre: R15.
- [ ] **T1.4** Migración `…_historial_tarifas_flexibles` (solo `ADD VALUE`) + `down.sql`; tipos,
  categorías y etiquetas en `lib/types/historial-accion.ts`. Cubre: R14.
- [ ] **T1.5** Clasificar los 5 modelos en `lib/db/modelos-de-negocio.ts`; los únicos anclados en
  `tests/unit/guards/_unicos-sin-empresa.ts`. Hecho: `pnpm run test:guardias` verde.
- [ ] **T1.6** `tests/integration/db/tarifas-flexibles-migration.test.ts` (Postgres real):
  - cada CHECK rechaza su caso y acepta el contrario (R4, R7);
  - un cobro a la tienda sin IVA → rechazo; un pago al mensajero o a la satélite con `iva_pct = 0`
    o `13` → rechazo; el mismo pago con `iva_pct NULL` → aceptado (R4, R45);
  - el único NULLS NOT DISTINCT rechaza dos filas del mismo nivel con NULLs (R8);
  - un distrito en dos grupos de la zona → rechazo; un distrito fuera de la zona → rechazo (R11);
  - borrar el distrito de `zona_distrito` lo saca del grupo; borrar el grupo borra sus valores (R12);
  - con `servi_app` y empresa A no se ve ni se escribe nada de B (R15);
  - `UPDATE`/`DELETE` de `cierre_detail_concepto` con `servi_app` → `42501` (R43);
  - conteos de `tarifas`, `tarifa_zona_mensajero`, `distrito_zona_especial` y `cierre_detail`
    iguales antes y después de `up`, y todas las filas de `cierre_detail` en `viejo`; `down` deja el
    esquema como estaba (R44, R42).
  Hecho: verde con base; con `HAY_BASE_DE_DATOS` falso se salta con nombre, no pasa.

## T2 — Núcleo puro (depende de T1.1 para los tipos del enum)

- [ ] **T2.1** `lib/tarifas/catalogo.ts` + `tests/unit/tarifas/catalogo.test.ts`: el catálogo
  coincide con el enum `tarifa_concepto` y tiene, por cada valor de `GestionResultado`, flete a la
  tienda, pago al mensajero y pago a la satélite; fulfillment y comisión sin resultado; base
  `pedido` para la tienda y `flete` para los pagos. Cubre: R1, R2, R27, R28.
  Hecho: añadir un valor ficticio a la lista de resultados en el test lo pone rojo.
- [ ] **T2.2** [P] `lib/tarifas/precedencia.ts` + `tests/unit/tarifas/precedencia.test.ts`: tabla de
  casos de `rangoCobro`/`rangoPago` (cada nivel gana al siguiente; tienda sin grupo usa su zona;
  orden sin distrito o distrito sin grupo salta los grupos; mensajero sin vehículo salta los de
  vehículo; fila de otra zona/grupo/tienda/vehículo → `null`; elección por concepto independiente) y
  forma de `whereValores`. Cubre: R16, R17, R18, R19, R20, R21, R22.
- [ ] **T2.3** [P] `lib/tarifas/calculo.ts` + `tests/unit/tarifas/calculo.test.ts`: monto, % con
  base, `ivaDe` (solo `ValorCobro`) sobre el importe redondeado, HALF_UP con los casos de la 204
  (589.30, 657.25), cero escrito → `"0.00"` y no ausencia. Cubre: R23, R26.
- [ ] **T2.4** `lib/types/tarifa-flexible.ts`: `ValorPago` (sin IVA), `ValorCobro` (con `ivaPct`),
  `TarifaTienda`, `TarifaPago`, esquemas zod de escritura discriminados por actor (`ivaPct`
  obligatorio en cobros, prohibido en pagos). Test `tests/unit/tarifas/esquemas-escritura.test.ts`:
  un pago con `ivaPct` (también `"0"`) no pasa; un cobro sin `ivaPct` no pasa. Cubre: R3, R4, R45.
  Hecho: typecheck, y pasar un `ValorPago` a `ivaDe` no compila (`@ts-expect-error` en el test).

## T3 — Resolver único y convivencia (depende de T1, T2)

- [ ] **T3.1** `ParTarifa` gana `distritoId: string | null` obligatorio y `clavePar` lo incluye
  (`lib/utils/cascada-tarifa.ts`); arreglar llamadores hasta compilar. Cubre: R18.
- [ ] **T3.2** `lib/repositories/_shared/resolver-tarifas.ts`: `usaModeloNuevo`,
  `resolverCobrosCon`, `resolverPagosCon` (con `baseFlete` vía `fleteSinIvaDeGestion`). Cubre: R16-R23,
  R28, R36, R37, R39.
- [ ] **T3.3** Fachadas: `TarifaVigenteRepository.resolveTarifas/resolveTarifa` devuelven
  `TarifaTienda`; `TarifaZonaMensajeroRepository.resolvePagos` nuevo. Interfaces actualizadas.
  Mismo constructor. Hecho: ninguna raíz de composición cambia en el diff.
- [ ] **T3.4** `tests/integration/db/tarifas-flexibles-resolver.test.ts` (Postgres real, dos
  empresas): siembra los 5 niveles de cobro y los 5 de pago con importes distintos y señuelos en otra
  zona, otro grupo, otra tienda, otro vehículo y otra empresa; borra nivel a nivel y afirma que gana
  el siguiente; cero escrito vs sin fila; orden sin distrito. Cada caso afirma primero lo sembrado.
  Cuenta las consultas de un lote de 1 y de 50 órdenes: el mismo número (R39).
  Cubre: R15, R16-R23, R39.
  **Contraprueba (obligatoria):** aplicar a mano, de una en una, (a) invertir dos rangos en
  `precedencia.ts`, (b) quitar `zonaId` del WHERE, (c) quitar el filtro de grupo por zona; correr el
  archivo, pegar la salida ROJA en `progress/impl_SLT-52.md` y revertir. Hecho: tres rojos pegados
  con el nombre del caso que cayó.
- [ ] **T3.5** [P] `tests/integration/db/tarifas-flexibles-respaldo.test.ts`: empresa A sin valores
  nuevos → el resolver devuelve `modelo: "viejo"` y los mismos datos que hoy; empresa B con un solo
  valor nuevo → `modelo: "nuevo"`, sin leer `tarifas` (sus filas viejas no aparecen) y conceptos no
  puestos = sin tarifa. Cubre: R36, R37.

## T4 — Funciones públicas y superficies sin cierre (depende de T3)

- [ ] **T4.1** `ingreso-empresa.ts`: `derivarIngresoOrden`, `costosListadoOrden`,
  `costoEnvioDeTarifa`, `desgloseCargaApi`, `montoFulfillmentDeTarifa`, `tieneFulfillment`,
  `agregarIngresosPorConcepto` aceptan `TarifaTienda | null`; rama vieja intacta; rama nueva según
  design §6; `fleteSinIvaDeGestion` y `fleteEntregadoSinTarifa` nuevas.
  Test `tests/unit/utils/ingreso-empresa-modelo-nuevo.test.ts`: flete por cada resultado y su
  categoría, comisión solo en entregado con `cobraComision`, % sobre el pedido, fulfillment fuera de
  `agregarIngresosPorConcepto`, `esCentral`/`esZonaEspecial` no cambian nada en el nuevo, y las
  cuatro identidades de `partesPorTienda` siguen dando con fletes de reprogramado.
  Cubre: R27, R29, R30, R31, R35. Hecho: T0.1 sigue verde con los casos envueltos en `viejo`.
- [ ] **T4.2** [P] `pago-mensajero.ts`, `ingreso-bodega.ts`, `cierre-totales.ts` con `TarifaPago`.
  Test `tests/unit/utils/pago-modelo-nuevo.test.ts`: cada resultado paga su concepto al mensajero y a
  la satélite, la satélite con varios conceptos a la vez, % sobre `baseFlete` = flete sin IVA de ESA
  gestión (reprogramado sin flete a la tienda → pago en % = `"0.00"`), sin valor → `"0.00"`, y el
  pago es exactamente el importe (literal), sin IVA. Cubre: R28, R32, R34.
- [ ] **T4.3** Superficies: `OrdenRepository` (listado), `BulkOrdenService` (carga por key y
  masiva), `CotizacionOrdenService`, `ApiOrdenLecturaService`, `api-orden-costo.ts`,
  `RechazoTiendaService`, `CorregirDatosClienteService` pasan `distritoId` y el 409 usa
  `fleteEntregadoSinTarifa`. Tests de cada superficie existentes en verde + caso nuevo de 409 en el
  modelo nuevo en `tests/integration/carga-api-key-sin-tarifa.test.ts`. Cubre: R25, R38.
- [ ] **T4.4** Ampliar `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts` con el
  escenario del modelo nuevo: el doble devuelve `tarifa_valor` entero; listado, cierre y costo de la
  API eligen el mismo `tarifaValorId` por concepto y el mismo importe. Cubre: R38.
  Hecho: cambiar un rango en `precedencia.ts` solo para uno de los caminos (vía doble) lo pone rojo.

## T5 — Cierre: pago por gestión y congelado (depende de T4)

- [ ] **T5.1** `CierreDiaService` (solicitud y vista en vivo), `CorteDiarioService`,
  `resolicitarCierreRechazado` (477) y `corregirResultadoGestionEnCierre` (398) resuelven el pago por
  gestión con `resolvePagos` / `resolverPagosCon`, cada uno con la zona que usa hoy.
  `CierreGestionPendienteRow` gana lo que pide `ContextoPagoGestion`. Cubre: R19, R20, R24, R33.
- [ ] **T5.2** `CierreDiaRepository.crearCierre`: `tarifa_modelo`, `cierre_detail_concepto` y
  `gestion_pago_congelado` en la misma transacción. Cubre: R40.
- [ ] **T5.3** Lectura: `tarifaDe(d, conceptos)` devuelve `TarifaTienda | null`; sus cinco
  llamadores (`CierresAdminRepository`, `CierreAporteRepository`, `WalletFeedService`,
  `WalletTiendaFeedService`, `DineroProductosRepository` con `json_agg` filtrado por empresa) leen
  lo congelado. Cubre: R41, R42.
- [ ] **T5.4** `tests/integration/db/tarifas-flexibles-snapshot.test.ts` (Postgres real): una
  empresa en el nuevo solicita un cierre con dos gestiones de distritos en grupos distintos y una sin
  tarifa → filas congeladas correctas (`gestion_pago_congelado.base` = flete sin IVA de esa gestión,
  `importe` = `pago_mensajero`, sin IVA), pago distinto por grupo, sin tarifa = 0 y el cierre se crea;
  después se cambian y borran valores y grupos y el detalle, la aprobación y las wallets dan lo
  mismo; un cierre `viejo` lee igual que antes; corte diario y re-solicitud congelan igual.
  Cubre: R24, R33, R40, R41, R42.
  **Contraprueba:** hacer que `tarifaDe` lea el valor vivo en vez del congelado → rojo pegado en
  `progress/impl_SLT-52.md`.

## T6 — Services de escritura (depende de T1; puede ir en paralelo con T3-T5) [P]

- [ ] **T6.1** `TarifaValorRepository` + `ITarifaValorRepository`; `GrupoDistritosRepository` +
  `IGrupoDistritosRepository`. Toda query filtra por `organizacion_id` (vía extensión) y nada de SQL
  a mano.
- [ ] **T6.2** `TarifaValorService` + interfaz y `GrupoDistritosService` + interfaz (design §8).
  Tests `tests/unit/services/tarifa-valor-service.test.ts` y
  `tests/unit/services/grupo-distritos-service.test.ts`: matriz de roles (maestro escribe, admin lee,
  el resto `forbidden`, sin escribir), rangos, nivel incompatible, tienda con rol no tarifable,
  grupo de otra zona, upsert reemplaza, quitar, distrito repetido o ajeno con el distrito nombrado,
  pago con IVA (también `"0"`) → `validation_error` en `ivaPct` sin escribir, cobro sin IVA →
  `validation_error`, historial con antes/después en la misma transacción.
  Cubre: R3, R4, R5, R6, R7, R8, R9, R10, R11, R13, R14, R45.
- [ ] **T6.3** `lib/tarifas/servicios.ts` (fábrica) + `tests/unit/tarifas/servicios-composicion.test.ts`:
  cada dependencia que la fábrica pasa es una instancia real (no `undefined`, no un doble) y el
  service la usa (una llamada llega al repositorio). Cubre: R13 (la puerta llega a las actions de
  SLT-54).
- [ ] **T6.4** `tests/integration/db/tarifas-flexibles-escritura.test.ts` (Postgres real, dos
  empresas): fijar, reemplazar y quitar valores; crear grupo, mover distritos, borrar grupo; la
  empresa A no alcanza nada de B; la fila de historial existe y el rollback de un fallo no deja
  historial. Cubre: R8, R9, R12, R14, R15.

## T7 — Cierre de la feature (depende de todo)

- [ ] **T7.1** Guardia `tests/unit/guards/tarifas-resolver-inyectado.guardia.test.ts`: cada
  `new CierreDiaRepository(`, `new CierreDiaService(` y `new CorteDiarioService(` de `app/` y `lib/`
  pasa el repositorio de tarifas. Cubre: R38.
- [ ] **T7.2** `docs/architecture.md`: párrafo de tarifas flexibles (tablas, resolver único,
  interruptor por empresa y su consecuencia, quién escribe).
- [ ] **T7.3** E2E existentes en verde con empresas en el modelo viejo: `e2e/cierre-*`,
  `e2e/cierres-admin*`, `e2e/cierre-bodega-satelite*`, `e2e/wallet-*`, `e2e/mi-wallet*`,
  `e2e/dos-empresas-humo.spec.ts`. Cubre: R36. Hecho: salida pegada en `progress/impl_SLT-52.md`.
- [ ] **T7.4** Mapa completo `R1..R45 -> test` en `progress/impl_SLT-52.md`; `./init.sh` verde con
  `INIT_EXIT=$?` escrito dentro del log.

## Archivos esperados

Migraciones (timestamps orientativos; si cambian, se actualiza esta lista):
- `db/schema.prisma`
- `db/migrations/20261103120000_tarifas_flexibles_enums/migration.sql`
- `db/migrations/20261103120000_tarifas_flexibles_enums/down.sql`
- `db/migrations/20261103120100_tarifas_flexibles_tablas/migration.sql`
- `db/migrations/20261103120100_tarifas_flexibles_tablas/down.sql`
- `db/migrations/20261103120200_tarifas_flexibles_misma_empresa/migration.sql`
- `db/migrations/20261103120200_tarifas_flexibles_misma_empresa/down.sql`
- `db/migrations/20261103120300_historial_tarifas_flexibles/migration.sql`
- `db/migrations/20261103120300_historial_tarifas_flexibles/down.sql`

Código:
- `lib/tarifas/catalogo.ts`
- `lib/tarifas/precedencia.ts`
- `lib/tarifas/calculo.ts`
- `lib/tarifas/servicios.ts`
- `lib/types/tarifa-flexible.ts`
- `lib/types/tarifa.ts`
- `lib/types/historial-accion.ts`
- `lib/db/modelos-de-negocio.ts`
- `lib/repositories/_shared/resolver-tarifas.ts`
- `lib/repositories/TarifaVigenteRepository.ts`
- `lib/repositories/TarifaZonaMensajeroRepository.ts`
- `lib/repositories/TarifaValorRepository.ts`
- `lib/repositories/GrupoDistritosRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CierreAporteRepository.ts`
- `lib/repositories/DineroProductosRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts`
- `lib/interfaces/repositories/ITarifaZonaMensajeroRepository.ts`
- `lib/interfaces/repositories/ITarifaValorRepository.ts`
- `lib/interfaces/repositories/IGrupoDistritosRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/services/ITarifaValorService.ts`
- `lib/interfaces/services/IGrupoDistritosService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/services/TarifaValorService.ts`
- `lib/services/GrupoDistritosService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/services/CorteDiarioService.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/CotizacionOrdenService.ts`
- `lib/services/ApiOrdenLecturaService.ts`
- `lib/services/RechazoTiendaService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/services/WalletFeedService.ts`
- `lib/services/WalletTiendaFeedService.ts`
- `lib/utils/cascada-tarifa.ts`
- `lib/utils/ingreso-empresa.ts`
- `lib/utils/pago-mensajero.ts`
- `lib/utils/ingreso-bodega.ts`
- `lib/utils/cierre-totales.ts`
- `lib/utils/cierre-detalle.ts`
- `lib/utils/api-orden-costo.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/dinero-por-producto.ts`
- `docs/architecture.md`

Tests:
- `tests/unit/tarifas/respaldo-identico.test.ts`
- `tests/unit/tarifas/catalogo.test.ts`
- `tests/unit/tarifas/precedencia.test.ts`
- `tests/unit/tarifas/calculo.test.ts`
- `tests/unit/tarifas/esquemas-escritura.test.ts`
- `tests/unit/tarifas/servicios-composicion.test.ts`
- `tests/unit/utils/ingreso-empresa-modelo-nuevo.test.ts`
- `tests/unit/utils/pago-modelo-nuevo.test.ts`
- `tests/unit/services/tarifa-valor-service.test.ts`
- `tests/unit/services/grupo-distritos-service.test.ts`
- `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts`
- `tests/unit/guards/tarifas-resolver-inyectado.guardia.test.ts`
- `tests/unit/guards/_unicos-sin-empresa.ts`
- `tests/integration/db/tarifas-flexibles-migration.test.ts`
- `tests/integration/db/tarifas-flexibles-resolver.test.ts`
- `tests/integration/db/tarifas-flexibles-respaldo.test.ts`
- `tests/integration/db/tarifas-flexibles-snapshot.test.ts`
- `tests/integration/db/tarifas-flexibles-escritura.test.ts`
- `tests/integration/carga-api-key-sin-tarifa.test.ts`

Progreso:
- `progress/impl_SLT-52.md`
