# SLT-101 «Fila de gestión única y lista con filtros» — bitácora de implementación

## T0 (parte de servidor/datos) y T1 «Servidor» — backend_dev, 2026-11-09

Base desechable `slt101_t1` (mismo servidor que `.env`, solo cambia el nombre de la base), con
`prisma migrate deploy` + `pnpm run db:seed` (lo mismo que hace `gate.yml`). Sin migraciones ni
cambios de esquema: `git diff db/` vacío. No se corrió `prisma generate`.

### T0.1 — consumidores (servidor)

- `IngresoEmpresaDTO`: `ICierreDiaService.ts`, `ICierreDiaRepository.ts`, `ICierresAdminService.ts`,
  `CierresAdminRepository.ts` (`toIngresoEmpresa`, único que construye el objeto entero en
  producción), `CierresAdminService.ts` (`ocultarFulfillmentSiNoCentral`), `lib/utils/ingreso-empresa.ts`,
  y en pantalla `cierre-detalle-shared.tsx`, `cierre-labels.ts` (solo leen).
- `CierreDetalleGestion` / `toDetalleDTO`: lo construye solo `toDetalleDTO`
  (`CierreDiaService.ts`), llamado desde `CierreDiaService.ts:358/440/503` (vista del mensajero, sin
  cambios: su repo no trae `pagoPorTarifa` ni `tarifaFaltante`), `CierresAdminService.ts:885` y
  `CierresBodegaAdminService.ts:327`.
- Ningún consumidor deja de compilar: todos los campos nuevos son opcionales (typecheck verde).
- Ningún código itera las claves de `ingresoEmpresa` (`Object.keys/entries/values`): las claves
  nuevas no crean columnas en ningún Excel.
- **Archivos de más respecto a `## Archivos esperados`** (los dobles de los tests de repositorio no
  traían la relación ni la consulta nueva; se añade una línea a cada uno, sin quitar nada):
  - `tests/unit/repositories/cierres-admin-repository.test.ts` (`pagosCongelados: []` y el doble
    de `ordenFulfillmentMovimiento.findMany`);
  - `tests/unit/repositories/cierre-pagos-lectura.test.ts` (ídem);
  - `tests/unit/repositories/cierre-detalle-causa-monto.test.ts` (`pagosCongelados: []`);
  - `tests/unit/repositories/cierres-bodega-admin-repository.test.ts` (`pagosCongelados: []`);
  - `tests/unit/services/gestion-desde-ayuda-rotulo-cierre.test.ts` (`pagosCongelados: []`);
  - `tests/unit/repositories/cierres-admin-gestiones-where.test.ts`: el literal «la descarga es el
    detalle menos …» gana `"pagosCongelados"` (decisión: la hoja fundida no lo necesita; la
    «Señales» de R91 sale del DTO del detalle).

  Son 6 archivos más (8 con los dos de «Otros dos tests», abajo): el total previsto pasa de 42 a **50** (> 44). Aviso al leader.
- `factura-contraste.guardia` y los `tests/components` / `e2e/` de T0.1: son de frontend_dev, no
  se tocaron.

### T0.2 — servidor (archivo:línea)

- Nombres reales: `Zona.nombre` (`db/schema.prisma:596`), `GrupoDistritos.nombre` (`:1975`),
  `Vehiculo.name` (`:2150`).
- `tienda_fulfillment` congela `iva_pct` en `cierre_detail_concepto` (`Decimal(5,2)`) y se serializa
  con `toFixed(2)` → `"13.00"` (`lib/utils/cierre-detalle.ts:164`; el mapper nuevo hace lo mismo).
- Concepto de cobro por resultado: `tienda_flete_<resultado>` del catálogo (`lib/tarifas/catalogo.ts:36-40`;
  `devolucion_a_origen_por_rechazo` → `tienda_flete_rechazo`); se busca con `conceptoPorResultado`.
- `ajustarPagoMensajeroEnCierre` (`CierresAdminRepository.ts:2233`) solo escribe
  `gestion_pago_mensajero_ajuste` (`:2280`) y la gestión; no toca `gestion_pago_congelado`.
- `corregirResultadoGestionEnCierre` (`:1941`) **re-congela** el pago (`deleteMany` + `createMany`,
  `:2094`) con el importe nuevo y **no borra los ajustes**: tras corregir, `pagoPorTarifa.importe` =
  `pagoMensajero`, así que `ajuste` sale `null` aunque `ajustesPago` siga con filas (la marca
  «Ajustado» sigue; la línea «− Ajuste» no). Coherente con R95 («si no difieren, nula»).
- `orden_fulfillment_movimiento.secuencia`: crece por orden, impar = cargo, par = reverso
  (`db/migrations/20261108120200_slt94_fulfillment_movimiento/migration.sql:51`). Último evento =
  mayor secuencia.

### T0.3

No hecho aquí: los literales del E2E dependen de la siembra de `e2e/_escenarios/` y van con T6
(frontend_dev).

### T1 — archivos

- `lib/interfaces/services/ICierreDiaService.ts`: `IngresoEmpresaDTO` + `ivaIncluido?`,
  `fulfillmentConIva?`, `ivaPctFulfillment?`, `fulfillmentCargadoAt?`, `conceptosTarifa?`;
  `CierreDetalleGestion` + `pagoPorTarifa?`; tipos `OrigenTarifaDTO`, `ConceptoTarifaDTO`,
  `PagoPorTarifaDTO`.
- `lib/interfaces/repositories/ICierreDiaRepository.ts`: `pagoPorTarifa?`, `tarifaFaltante?` en
  `CierreGestionPendienteRow`.
- `lib/repositories/CierresAdminRepository.ts`: `DETALLE_ADMIN_SELECT.conceptos` con los nombres de
  zona y grupo de su `tarifa_valor` (sin tocar `CONCEPTO_CONGELADO_SELECT`);
  `GESTION_ADMIN_SELECT.pagosCongelados` con `where: { actor: "mensajero" }`; quinta consulta del
  `Promise.all` de `findCierreByIdEnAlcance` (`ordenFulfillmentMovimiento`, `where` por las órdenes
  de `cierre_detail` de ese cierre, `orderBy secuencia desc`, `distinct ordenId`); derivaciones con
  `Prisma.Decimal` en `toIngresoEmpresa` y `toPendienteRowDesdeSnapshot` (parámetro opcional
  `LecturaDetalleMensajero`).
- `lib/services/CierreDiaService.ts`: `toDetalleDTO` pasa `pagoPorTarifa` (solo si la fila lo trae)
  y usa `tarifaFaltante ?? g.tarifaFaltante ?? false`.
- `lib/services/CierresAdminService.ts`: `ocultarFulfillmentSiNoCentral` anula también
  `fulfillmentConIva`, `ivaPctFulfillment` y `fulfillmentCargadoAt` (solo si vienen).
- Tests: `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` (nuevo),
  `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` (ampliado) y los 6 dobles de
  arriba.

**Decisión técnica (anotada):** `tarifaFaltante` solo se emite cuando el mapper recibe
`LecturaDetalleMensajero`, o sea en el detalle de mensajero de `/cierres-admin`. El detalle de
bodega usa el mismo mapper y su pantalla pinta ya el badge «Sin tarifa» con `tarifaFaltante`
(`cierre-detalle-shared.tsx:877`); emitirlo allí cambiaría esa pantalla, y R90 dice que no cambia.
Allí sigue el `false` de siempre hasta SLT-104 «Detalle de cierre de bodega en el detalle único
(central)». `pagoPorTarifa` y las cifras del ingreso sí llegan a bodega (nadie las pinta aún);
`fulfillmentCargadoAt` llega `null` en bodega y en la hoja fundida (no leen movimientos).

### Mapa R → test (T1)

| R | Test |
|---|---|
| R64 | `cierre-detalle-cifras-fila-sql-real` «R64/R97: tarifa congelada de cada concepto COBRADO» |
| R65 | ídem «R65/R93/R92: IVA incluido» y «R65/R94: «Se cobró», % de IVA y fecha» |
| R66 | ídem «R66/R95: pago por tarifa … resta 700,00» y «R66/R96: «Sin tarifa de pago»» |
| R92 | ídem (todos los importes como string escala 2) |
| R93 | ídem «R65/R93/R92» (520.00, 390.00, 299.00) |
| R94 | ídem «R94: reverso → null», «R94: el viejo …», «R94: la orden D no se cuela»; `cierres-admin-fulfillment-solo-central` bloque «SLT-101 R94» (satélite `null`, central intacto, también en el Excel) |
| R95 | ídem «R66/R95» y «R95: sin fila del mensajero (B) y en el viejo (C) → null» |
| R96 | ídem «R66/R96» (A false, B true, C viejo false) |

### Mutaciones (ejecutadas una a una sobre `CierresAdminRepository.ts` y restauradas; sha256 igual al de antes)

| Mutación | Resultado | Salida roja |
|---|---|---|
| M1 quitar `where: { actor: "mensajero" }` | ROJO (2) | `expected { importe: '950.00', …(8) } to be null`; `expected false to be true` (tarifaFaltante de B) |
| M2 quitar el `where` de `ordenFulfillmentMovimiento` | ROJO (1) | `expected Set{ …(3) } to deeply equal Set{ …(2) }` (la orden D se cuela) |
| M3a quitar el `orderBy` | ROJO (1) | `expected '2026-11-05T15:00:00.000Z' to be null` |
| M3c `secuencia: "asc"` | ROJO (1) | `expected '2026-11-05T15:00:00.000Z' to be null` |
| M3b quitar `distinct` | ROJO (1) | `expected '2026-11-05T15:00:00.000Z' to be null` |
| Servicio: no anular `fulfillmentCargadoAt` para la satélite | ROJO (2) | `expected { tarifaModelo: 'nuevo', …(24) } to deeply equal …` |

Medido en la primera versión: con el reverso insertado antes que el cargo, M3a sobrevivía en verde
(el orden físico daba por casualidad el último evento). Se invirtió el orden de inserción y se
anotó en la siembra.

**Los tests de servicio no ven el SQL:** con M1, M2 y M3b aplicadas, los 210 tests de
`cierres-admin-fulfillment-solo-central`, `cierres-admin-repository`, `cierre-pagos-lectura`,
`cierre-detalle-causa-monto` y `cierres-admin-service` siguen en verde (210/210 las tres veces).
Solo el test de integración las mata.

### Otros dos tests que el cambio tocaba

- `tests/integration/db/tarifas-flexibles-snapshot.test.ts` (rojo en `vitest related`): afirmaba que
  tras BORRAR un valor de tarifa el detalle solo cambia en `tarifaValorId`. Ahora también pasan a
  `null` los nombres del origen en `conceptosTarifa` (es la misma traza, R97). `sinTraza` quita esos
  nombres solo dentro de `conceptosTarifa`/`pagoPorTarifa` (el `zonaNombre` congelado de la fila se
  sigue comparando) y se añade la aserción «G1 antes, `null` después, nivel `grupo` en los dos».
- `tests/unit/guards/tarifa-valor-lectores.guardia.test.ts`: `CierresAdminRepository.ts` entra en la
  lista de lectores de `tarifa_valor` con su motivo (solo nombres del origen de lo congelado; ningún
  importe sale de esa tabla).

Con estos dos, el diff de T1 son 17 archivos (5 de servidor, 1 test nuevo, 9 tests adaptados,
`tasks.md` y esta bitácora). El total previsto de la ficha pasa de 42 a **50** (> 44): aviso al leader.

### Salidas (base desechable `slt101_t1`)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → exit 0 (sin la opción, OOM: deuda
  D27 conocida; CI usa 8192).
- `pnpm run lint` → exit 0, `0 errors, 243 warnings` (las 3 de `cierres-admin-gestiones-where` ya
  estaban en HEAD).
- `vitest run tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` → 10 passed (0 skipped).
- `vitest run` de `tarifas-flexibles-snapshot`, `cierre-detalle-cifras-fila-sql-real`,
  `cierre-resuelto-por-sql-real`, `ajuste-pago-mensajero-lectura.int`, `ajuste-pago-mensajero-cierre.int`,
  `cierre-incluye-modelo-nuevo`, `tarifas-valor-propio-caminos` → 7 files, 91 passed.
- `vitest run tests/unit/repositories tests/unit/services` → 517 files, 9941 passed (incluye
  `cierres-admin-repository`, `cierre-pagos-lectura`, `cierres-admin-service`,
  `cierres-admin-fulfillment-solo-central` 13/13).
- `pnpm run test:guardias` → 340/342 files; `tarifa-valor-lectores` arreglado (ver arriba) y
  `liquidacion-money-safe`, `pagos-proyeccion` verdes. Queda rojo
  `dependencias-declaradas-presentes.guardia` (4): «init.sh ya no tiene el marcador ">>> FIN PASO 2:
  DEPENDENCIAS (ficha 420) <<<"»; `init.sh` no está en el diff: ajeno a este cambio.
- `vitest related --run` de los 5 archivos de servidor (426 files): 90 rojos, todos de **datos que
  la base desechable recién migrada no trae** («tabla `orden` vacia», «falta la zona central»,
  «`usuario` esta vacia», y los `reading 'prisma'` de sus `afterAll`) salvo el de
  `tarifas-flexibles-snapshot` (arreglado arriba) y cinco ajenos al detalle (`referencia a otra
  empresa` al sembrar en `cierre-rechazo-tienda-aprobacion` / `caja-caracterizacion-459` /
  `premio-ranking-idempotencia`, `unauthenticated` en `premio-ranking-idempotencia`, catálogos de
  `wallet-458-migration`). Ninguno nombra un campo de esta ficha.

### Veredicto

T1 hecho: las cifras de la fila salen del servidor con `Prisma.Decimal`, aditivas y sin migración;
el `WHERE` de cada una lo mata su mutación contra Postgres real.

## T0 (pantalla), T0.3 y T2–T6 — frontend_dev, 2026-11-09

Bases desechables (mismo servidor que `.env`, solo cambia el nombre; URL nunca impresa): `slt101_t1` para
vitest (la de T1) y `slt101_fe_e2e` nueva para E2E (`DROP`/`CREATE`, `migrate deploy` → «database
"slt101_fe_e2e"», `db:seed`). `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3044` y
`NODE_OPTIONS=--max-old-space-size=8192` (sin él, OOM en el paso de TypeScript); `E2E_PUERTO=3044`,
`E2E_STORAGE_PUERTO=54391`. Sin dev server, sin `prisma generate`, sin dependencias nuevas.

### T0.1 / T0.2 (pantalla)

- Censo: de los 10 `tests/components` que montan `CierresAdminModule`, rompían 3 (`CierresAdminModule`,
  `CorregirResultadoCierre`, `cierre-detalle-ajuste-badge`), los de la lista. E2E: los 5 de T6.2 más
  `cierres-rediseno` (de SLT-100). `cierre-bodega-satelite` y `mis-asignaciones` no tocan esta lista
  (bodega sigue con `GestionesPorResultado`). `factura-contraste`: sus «anclas» de `CierresAdminModule.tsx`
  son texto de los mensajes (no se comprueban); no hizo falta tocarla.
- `EstadoConInfo` pinta `nombreDeEstado(codigo)`, el mismo nombre que `RESULTADO_LABEL`; la guardia pide
  `recuento` para las opciones «<resultado> <n>». `CAUSA_INCIDENTE_LABEL` = «Paquete dañado/perdido/robado».
  `cierreAbierto.solicitadoAt` existe (ISO). Constantes de `cierre-factura.tsx` exportadas sin cambiar su
  cuerpo: `FILA_CORREGIR_METODOS`, `FILA_CORREGIR_RESULTADO`, `FILA_VER_EVIDENCIA` (diff = 3 `export`).
  `BuscadorFiltros`/`FilterComponent` con `leerDeUrl={false}`: `useFiltrosUrl(false)`, arranque en `{}` y
  sin emitir (lo prueban `buscador-filtros-sin-buscador` y `DetalleCierreGestiones`).

### T0.3 — literales del E2E (escritos antes del test, contra la siembra real)

Escenario **S3-A** (nuevo `describe`, empresa propia): tarifa A de SLT-100 (flete 2.000 en las cuatro
columnas, comisión 1 %, IVA 13 % en flete y comisión) **+ fulfillment 300** (para que la central tenga su
tarjeta); mensajero 1.500 / 500. Por zona: entrega 70.000 efectivo, entrega 30.000 SINPE, rechazo manual.

| Cifra | Derivación a mano | Literal |
|---|---|---|
| Filtros | 3 gestiones, 2 entregas, 1 devolución, 1 con señal (la devolución) | Todas 3 · Entregado 2 · Reprogramado 0 · Novedad 0 · Devolución a origen por rechazo 1 · Incidente 0 · Con señales 1 |
| Recibió (70.000) | un método | «Efectivo ₡70.000», «Recibió ₡70.000» |
| Se le cobra (70.000) | flete 2.000 + 13 % = 2.260; comisión 1 % de 70.000 = 700 + 91 = 791; 2.260 + 791 | «Flete por entregado + IVA ₡2.260», «+ Comisión COD + IVA ₡791», «Se le cobra ₡3.051» |
| de eso, IVA | 260 + 91 | «₡351» |
| Se le paga | viejo: sin pago congelado → sin «Por tarifa» | «Se le paga ₡1.500» |
| Fulfillment (central) | columna 300, IVA 0 (el viejo no tiene %) | «Fulfillment ₡300», «Se cobró ₡300» |
| Cálculo central (GAM) | columna GAM | «tarifa GAM ₡2.000», «+ IVA flete (13 % de ₡2.000) ₡260», «Flete por entregado ₡2.260»; «Comisión COD (1 % de ₡70.000) ₡700», «+ IVA comisión (13 % de ₡700) ₡91», «Comisión COD ₡791» |
| Cálculo satélite (no GAM) | columna no GAM (mismo 2.000) | «tarifa no GAM ₡2.000» |
| Devolución | 2.000 + 260 | «Flete por devolución a origen + IVA ₡2.260», «Se le cobra ₡2.260», señal «Vuelve a bodega» |
| Descargar | 3 filas; «Señales» de la devolución | 8 cabeceras; «Vuelve a bodega» / vacía |

Escenario **B** (el de SLT-100, tarifas por la pantalla en la zona central: flete por entregado 3.100 + 13 %,
pago 2.200; entrega de 10.000): «Flete por entregado + IVA ₡3.503», «Se le cobra ₡3.503», «de eso, IVA
₡403»; cálculo «Tarifa: valor base de la zona <zona central>» (nivel `zona`: la fixture digita sin elegir
nivel), «Monto fijo ₡3.100», «+ IVA 13 % ₡403», «Flete por entregado ₡3.503»; pago «Por tarifa · valor base
de la zona <zona central> ₡2.200», «Se le paga ₡2.200»; sin concepto de fulfillment digitado el congelado del
nuevo da 0 sin %: «Fulfillment ₡0», «Se cobró ₡0». Verde a la primera.

Ajuste (`ajuste-pago-mensajero-cierre`, modelo **viejo**, tarifa por defecto del escenario): la propuesta del
design (1.500 → 2.200 con «+ Ajuste») no casa con la siembra real; el spec ajusta un **rechazo de 0 a 700**
(central) y una **entrega de 1.500 a 1.800** (satélite). Literales: central «Pago ajustado · Vuelve a bodega»,
«Se le paga ₡700», sin «Por tarifa», «Motivo: «…»», «Ajustó <maestro> · dd/MM HH:mm»; satélite «Pago
ajustado», «Se le paga ₡1.800». «− Ajuste»/«+ Ajuste» del nuevo los cubren `FilaGestion.test.tsx`,
`fila-gestion-vista.test.ts` y la integración de T1 (no hay escenario E2E del nuevo con ajuste).

### Archivos (T2–T6)

- Nuevos: `components/private/cierres/fila/{fila-gestion-vista.ts, fila-gestion-labels.ts, FilaGestion.tsx,
  CalculoCobro.tsx, GestionesCierre.tsx}`; `tests/unit/utils/fila-gestion-vista.test.ts`,
  `tests/unit/components/{buscador-filtros-sin-buscador,filter-component-chips}.test.tsx`,
  `tests/components/{FilaGestion,DetalleCierreGestiones}.test.tsx`, `tests/fixtures/gestion-cierre-fila.ts`
  (dobles compartidos por los tres tests de la fila; **archivo de más** respecto a la lista).
- Cambian: `components/shared/{BuscadorFiltros,FilterComponent}.tsx` (props aditivas `buscador`,
  `presentacion: "pastillas"`, `tono`), `components/private/cierres/detalle/{Cuenta.tsx,
  detalle-cierre-descarga-columnas.ts}`, `app/(app)/cierres-admin/_components/{CierresAdminModule.tsx,
  cierre-factura.tsx}`, los tests y guardias de la tabla de abajo y los 6 E2E.
- `CierresBodegaAdminModule.tsx` y `CierreDiaModule.tsx` sin cambios; `git diff db/` vacío; ninguna Server
  Action tocada. Total de la rama contra la base de `dev`: **50 archivos**.

### Desviaciones del spec (para el reviewer)

1. **`Cuenta` gana una 7.ª prop aditiva, `subtitulo`** (la línea «Tarifa: …» bajo el título, R97). El design
   listaba seis; sin ella la línea no tenía sitio fiel al canvas.
2. **Formato de importes:** el canvas escribe «₡25.000,00»; la app pinta con `money()` (R86, ficha 359:
   «₡25.000», con «,50» solo si hay céntimos). Los literales de los tests son los de `money()`.
3. **Causa del incidente:** el canvas dice «Dañado · sin indemnizar»; se pinta el rótulo legible de la app,
   `CAUSA_INCIDENTE_LABEL` («Paquete dañado · sin indemnizar»), como pide R85 («su rótulo legible», D20).
   Incidente sin causa registrada: «Sin indemnizar» (central/satélite) y sin señal de causa (los demás).
4. **Porcentajes:** el string congelado («13.00») se pinta con `porcentajeParaVer` de Tarifas («13 %»,
   «3,5 %»), el que ya usa esa pantalla; formato de texto, sin `number`.
5. **Fechas:** «dd/MM/yyyy HH:mm» del canvas con `fechaLegibleEnZona(…, ZONA_CR)` + `horaCostaRica`
   (helpers existentes); el resto del detalle sigue en «yyyy-MM-dd HH:mm».
6. **Región «Órdenes del cierre»:** envuelve la tabla; los filtros y «Descargar» van en la fila de encima,
   fuera de la región. Los E2E pulsan el filtro en el grupo «Filtrar por resultado» del diálogo.
7. **Nombres de las tarjetas:** cada `Cuenta` de la fila lleva `aria-label` «<título> de la orden <remisión> ·
   <destinatario>» (N filas desplegadas no repiten nombre). La región del cálculo conserva el nombre del
   canvas, «Cómo se calculó el cobro a la tienda».
8. **Fulfillment visible** con `fulfillmentDeIngreso` (regla de hoy, R62 de SLT-54): en el viejo, solo si la
   tarifa congelada lo traía; en el nuevo, siempre para la central (0 si no hay concepto; R30 «no nulo»).
9. **R26 en la satélite:** la fila filtra también por audiencia (corregir métodos y resultado, solo central),
   además del callback. `CorregirResultadoCierre.test.tsx` montaba el módulo sin `audiencia` (satélite por
   defecto) con el permiso: ahora monta `audiencia="admin"` (como la página: `puedeCorregirResultado =
   esAccesoTotal`) y se añade «la satélite no lo ve, aunque le llegara el permiso».
10. **Rechazo manual:** su fila ya no lleva marca de origen («Manual»): el canvas solo dibuja «Rechazo
    automático» (R85).
11. Mutación E2E «Fulfillment a la satélite»: la anulan DOS capas (servidor, ficha 481, y pantalla, R30); se
    aplicó a las dos a la vez. Cada capa sola la matan sus tests (T1 y `fila-gestion-vista`).
12. Mutación de diseño «`leerDeUrl` a `true`»: no se usó como prueba del E2E; en modo URL filtrar tampoco
    escribe la query (la barra solo RESTA params al «Limpiar todo» o al vaciar el buscador, que aquí no
    existe), así que ningún test de URL podría matarla. La URL intacta se afirma igual (E2E central A y
    `DetalleCierreGestiones`: ni `replace` ni `push`).

### T5.1 / T6.2 — antes leía X, ahora lee Y

| Archivo | Antes | Ahora |
|---|---|---|
| `tests/components/CierresAdminModule.test.tsx` | región «Entregado»/«Devolución a origen por rechazo» de las pestañas | pulsa «<resultado> <n>» del grupo «Filtrar por resultado» y lee «Órdenes del cierre» |
| ídem, «desglose por orden» | panel 338 «Cobros de esta gestión» («Valor flete GAM» ₡2.500, «Valor flete» ₡0, «Flete por devolución a origen GAM» ₡0, «Total cobrado» ₡3.672,50) y hint «13.00 % de ₡2.500» | «Ver cómo se calculó»: «tarifa GAM ₡2.500», «+ IVA flete (13 % de ₡2.500) ₡325», «Flete por entregado ₡2.825»; «Comisión COD (3 % de ₡25.000) ₡750», «+ IVA comisión (13 % de ₡750) ₡97,50», «₡847,50»; «Se le cobra ₡3.672,50». «tar_88» y «₡2.000» siguen ausentes. Las filas en 0 de la tabla 338 se retiran (D2, avisado para Preview) |
| ídem, R6/R9 | «₡1.250,50 · SINPE» | tarjeta «Recibió el mensajero»: «SINPE ₡1.250,50», «Recibió ₡1.250,50» |
| ídem, 56/R23 (×3) | badge «Sin tarifa» en la fila desplegada | señal «Sin tarifa de pago» de la fila cerrada (F10); la negación pasa a `/Sin tarifa/` |
| ídem, 56/R12 | «₡3.500» del ingreso de bodega en la fila | **invertida** (S3-2): ni «₡3.500» ni «Ingreso de bodega» en la fila; sigue en «Dinero» (caso 102/R8) |
| ídem, 102/R9 | badges «Automático»/«Manual» en la fila desplegada | señal «Vuelve a bodega · Rechazo automático» en la del cron; la manual, «Vuelve a bodega» sin origen |
| ídem, sin snapshot | sin botón «Desglose…» | + el botón «Detalle de la orden REM-9 · Beto Ruiz» |
| `tests/components/CorregirResultadoCierre.test.tsx` | módulo sin `audiencia` | `audiencia="admin"` (desv. 9) + caso satélite |
| `tests/components/cierre-detalle-ajuste-badge.test.tsx` | «Pago al mensajero: ₡700» | total «Se le paga ₡700» de la tarjeta y la señal «Pago ajustado · Vuelve a bodega» (tras cerrar el diálogo) |
| `tests/components/CierresAdminDetalleUnico.test.tsx` | — | + 7 casos SLT-101 (T4.2) y los permisos de la fila en `montar` |
| `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` | 7 cabeceras; `filaDescargaDetalleCierre(g)` | 8 con «Señales»; `(g, audiencia)`; + 3 casos R91 |
| `tests/unit/guards/estado-con-info.guardia.test.ts` | — | + `fila-gestion-vista.ts`, clase `recuento` |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | censo de `detalle/` | + los 5 de `fila/` |
| `e2e/cierres-rediseno.spec.ts` | 7 cabeceras; el primer botón plegado de la lista | 8 con «Señales»; el botón «Desglose/Detalle de la orden…»; + `describe` S3-A y caso central B |
| `e2e/cierres-admin.spec.ts` | pestañas «Devolución…»/«Entregado» de la región | botones «<resultado> <n>» del grupo de filtros |
| `e2e/ajuste-pago-mensajero-cierre.spec.ts` | pestaña «Devolución…» | filtro; + señal, «Se le paga» 700/1.800, motivo y «Ajustó …» |
| `e2e/cierres-admin-rechazos-sla.spec.ts` | pestaña y región por resultado; badges «Automático»/«Manual» desplegando | filtro y «Órdenes del cierre»; 3 filas; señal «… · Rechazo automático» solo en la del cron |
| `e2e/cierre-modelo-nuevo-plan-porcentual.spec.ts` | renglones de «Cobros de esta gestión» | las MISMAS llamadas y literales, leídos en «Se le cobra» y en «Ver cómo se calculó» (helper documentado); fuera el `renglon` sin uso |
| `e2e/tarifas-activacion.spec.ts` | «Total cobrado» de «Cobros…»; dos «Ingreso de bodega:» por fila (120 y 450) | «Se le cobra» de la tarjeta; las dos «Ingreso de bodega:» **retiradas** con su motivo (S3-2; siguen en `congeladoDelCierre` y «− Ingreso de bodega» 570) y sustituidas por su ausencia |

### Mutaciones (una a una, restauradas; sha256 igual antes y después)

| Mutación | Test | Resultado |
|---|---|---|
| «Con señales» cuenta todas | `fila-gestion-vista` | ROJO (2): «7 opciones…», «cuenta por audiencia» |
| Fulfillment a la satélite (`veFulfillment` = no mensajero) | `fila-gestion-vista` | ROJO (2): «R25: qué tarjetas…», «R30: la satélite nunca…» |
| Quitar `esMontoCero` en «Recibió» | `fila-gestion-vista` | ROJO (1): «R27: Recibió… sin los métodos en 0» |
| Audiencia satélite pasada como central (`audienciaFila = "central"`) | `CierresAdminDetalleUnico` | ROJO (1): «satélite: sin Fulfillment ni …» |
| `{RESULTADO_LABEL[g.resultado]}` en la celda de la fila | `estado-con-info.guardia` | ROJO (2): brazos (a) y (b) nombran `FilaGestion.tsx:120` |
| Fulfillment a la satélite en las dos capas (481 en `CierresAdminService` + `veFulfillment`), con `next build` | E2E «satélite A» | ROJO: «Fulfillment · se cobró al crear la orden» esperado 0, recibido 1. Restaurado y reconstruido |

Una mutación por cifra nueva pintada (sobre `fila-gestion-vista.ts`, contra `fila-gestion-vista.test.ts` +
`FilaGestion.test.tsx`; script con comprobación de que el reemplazo aplicó; sha256 restaurado `ec148a1ae6dd7c56`):

| Cifra (R) | Mutación | Resultado |
|---|---|---|
| «de eso, IVA» (R93) | `ivaIncluido` ← `total` | ROJO (4) |
| «Se cobró» (R94) | `fulfillmentConIva` ← `fulfillment` | ROJO (2) |
| «+ IVA <%> %» del fulfillment (R94) | % ← importe del IVA | ROJO (2) |
| fecha del cargo (R94) | fecha ignorada | ROJO (2) |
| «Por tarifa» (R95, R98) | `importe` ← `pagoMensajero` | ROJO (4) |
| «− Ajuste» (R95, R98) | `ajuste.monto` ← `importe` | ROJO (3) |
| «<valor> % de <base>» (R97) | valor ← `ivaPct` | ROJO (2) |
| «+ IVA <%> %» del concepto (R97) | `ivaPct` ← `valor` | ROJO (2) |
| «Tarifa: <origen>» (R97) | nivel fijo «zona» | ROJO (3) |

### Salidas reales

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `TC_EXIT=0` (tras T5 y tras los E2E).
- `pnpm run lint` → `LINT_EXIT=0`, `✖ 243 problems (0 errors, 243 warnings)`: las mismas 243 de antes, ninguna
  nueva.
- `grep -rn -e 'Number(' -e 'parseFloat' -e 'toFixed' components/private/cierres/` → vacío (R71).
- Tests de T2–T5 (base `slt101_t1`): `fila-gestion-vista` + descarga `59 passed`; barra de filtros (nuevos y
  todos los de hoy, sin tocarlos: `buscador-filtros-*`, `filter-component*`) `10 files, 161 passed`;
  `FilaGestion` `26 passed`; `DetalleCierreGestiones` `7 passed`; `CierresAdminModule` `32 passed`;
  `CorregirResultadoCierre` + `cierre-detalle-ajuste-badge` `40 passed`; `CierresAdminDetalleUnico` `29 passed`;
  los 74 `tests/components` que montan el módulo, la factura o `Cuenta` (incluido
  `DineroIdentidadesEnPantalla`): verdes tras adaptar los 3 que rompían (antes de adaptar: `13 failed | 1432
  passed`).
- `pnpm run test:guardias` → `Test Files 1 failed | 341 passed (342)`, `Tests 4 failed | 4808 passed | 1
  skipped`: los 4 rojos son `dependencias-declaradas-presentes.guardia` (heredado, `init.sh` fuera del diff).
  `estado-con-info`, `liquidacion-money-safe`, `filtros-url-r25`, `wallet-barra-unica-467`,
  `analitica-barra-filtros-sin-solape`, `vistas-superficies-declaradas`, `columnas-sensibles`: verdes.
- `TEST_RAPIDO_SIN_PRESUPUESTO=1 pnpm run test:rapido` (base `slt101_t1`): «50 archivo(s) cambiados vs
  origin/dev», «relacionados por imports: 541», siete tandas `100/100/100/100/100/100/44 passed`, «245 rojo(s)
  heredado(s) del baseline no cuentan en esta seleccion», `RAPIDO_EXIT=0`.
- E2E `--project=dinero` (base nueva `slt101_fe_e2e`, incluye `cierres-rediseno` con el `describe` S3-A y el
  caso central B, los 5 adaptados y `cierre-bodega-satelite`): primera corrida sobre la base usada `91 passed
  (4.4m)`; base RECREADA y dos corridas seguidas: `91 passed (4.3m)` y `91 passed (4.3m)`, 0 failed / 0 flaky /
  0 skipped. (Antes de llegar ahí: dos fallos del propio spec nuevo, corregidos — un `filter({ has })` con un
  localizador anclado al diálogo, y la última celda vacía de una fila del xlsx, que ExcelJS no trae en
  `values`.)

### Mapa R → test (T2–T6; completa el de T1)

| R | Test |
|---|---|
| R22 | `FilaGestion.test.tsx` (una fila, cuatro audiencias); `CierresAdminDetalleUnico` «SLT-101 R90» |
| R23 | `fila-gestion-vista.test.ts` (columnas por audiencia y con mensajero); `DetalleCierreGestiones` (cabecera); E2E central A |
| R24 | `fila-gestion-vista.test.ts` (señales; celda vacía); `FilaGestion.test.tsx` «R24…»; `CierresAdminModule` 56/R23 y 102/R9 |
| R25 | `fila-gestion-vista.test.ts` «R25: qué tarjetas ve cada audiencia»; `FilaGestion.test.tsx` (cabecera de tres datos, tarjetas por audiencia); E2E central A y satélite A |
| R26 | `fila-gestion-vista.test.ts` (tabla de R26 × resultado × callback); `FilaGestion.test.tsx`; `CierresAdminDetalleUnico`; `CorregirResultadoCierre` (+ satélite); `cierre-detalle-ajuste-badge`; E2E central A y satélite A |
| R27 | `fila-gestion-vista.test.ts` (cascadas, «Sin dato», métodos en 0 fuera); `FilaGestion.test.tsx`; `CierresAdminModule` R6/R9; E2E central A/B y ajuste |
| R28 | `FilaGestion.test.tsx` (abre y pliega, `aria-expanded`); E2E central A |
| R29 | `fila-gestion-vista.test.ts` (GAM, no GAM, pacto, sin pacto, sin comisión, sin tarifa); `FilaGestion.test.tsx` (paridad); `CierresAdminModule` «desglose por orden»; E2E central A (GAM) y satélite A (no GAM) |
| R30 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx`; `CierresAdminDetalleUnico` (satélite); E2E satélite A (mutación de dos capas, roja) |
| R64 | `FilaGestion.test.tsx` «nuevo: abre y pliega»; E2E central B («Tarifa: valor base de la zona …», «Monto fijo») |
| R65 | `FilaGestion.test.tsx` (IVA incluido, «Se cobró», fecha); E2E central A/B |
| R66 | `fila-gestion-vista.test.ts` (pago por tarifa y ajuste); `FilaGestion.test.tsx`; E2E central B y ajuste |
| R71 | `liquidacion-money-safe` (censo con `fila/`); grep de arriba |
| R72 | `git diff db/` vacío; ninguna Server Action tocada |
| R77 | `e2e/cierres-rediseno.spec.ts` (S3-A central y satélite, central B); `e2e/ajuste-pago-mensajero-cierre.spec.ts` |
| R84 | `fila-gestion-vista.test.ts` (filtros, filtrar sin reordenar, vacío); `DetalleCierreGestiones` (sin buscador, «Todas» activa, filtra, vacío, sin navegar); `filter-component-chips`; `buscador-filtros-sin-buscador`; E2E central A (conteos y URL intacta) |
| R85 | `fila-gestion-vista.test.ts` (texto por audiencia y orden); E2E central A, `cierres-admin-rechazos-sla`, ajuste |
| R86 | `FilaGestion.test.tsx` («—» y botón de información); `estado-con-info.guardia` (contraprueba roja) |
| R89 | `FilaGestion.test.tsx` (nombres de los botones); `DetalleCierreGestiones` (grupo y `aria-pressed`); `CierresAdminModule`; E2E adaptados |
| R90 | `CierresAdminDetalleUnico` «SLT-101 R90» (filtros, «Descargar» en la fila, acciones, diálogos, novedad interna debajo); E2E central A y satélite A |
| R91 | `detalle-cierre-descarga-columnas.test.ts` (8 cabeceras, señales, `null`); E2E central A (xlsx) y SLT-100 central (8 cabeceras) |
| R93 | `fila-gestion-vista.test.ts` (línea solo si no nulo); `FilaGestion.test.tsx`; E2E central A/B |
| R94 | `fila-gestion-vista.test.ts` y `FilaGestion.test.tsx` (nota con y sin fecha) |
| R95 | `fila-gestion-vista.test.ts` (viejo sin «Por tarifa», «− Ajuste», «+ Ajuste»); E2E ajuste (viejo sin «Por tarifa») |
| R96 | `fila-gestion-vista.test.ts` (señal por audiencia) |
| R97 | `fila-gestion-vista.test.ts` (nuevo, `origenDe`, sin nombres, nota con y sin fecha); `FilaGestion.test.tsx`; E2E central B |
| R98 | `fila-gestion-vista.test.ts`; `FilaGestion.test.tsx` (cascada, insignia, borde, motivo, «Ajustó»); E2E ajuste |

### Veredicto (T2–T6)

Lista y fila únicas montadas en `/cierres-admin` con las cifras del servidor, fieles al canvas salvo las 12
desviaciones anotadas; tests, guardias (salvo el rojo heredado), `test:rapido` y dos corridas de `dinero` en
verde.
