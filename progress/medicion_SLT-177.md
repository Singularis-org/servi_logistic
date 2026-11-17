# SLT-177 «Volver a medir los rojos heredados del baseline que esperaban a SL-31» — medición T1

Fecha: 2026-11-16. Requisitos: R730-R733 de `specs/SLT-177-remedir-baseline-sl31/requirements.md`.

## Fuente

- **Run 43973243440** de `gate.yml` (evento `pull_request`, PR #184 «SLT-175 pruebas R621/R623 y
  guardia R631», head `2b985ead`, conclusión `success`). Árbol: el merge de esa rama en `dev`, que es
  `825ba66d` (hoy `origin/dev`). `git diff 825ba66d HEAD -- lib app components hooks db scripts tests`
  en esta rama: vacío. El árbol medido es el de esta ficha sin cambios de producto.
- Base de cada shard: `postgres:17` de servicio + `prisma migrate deploy` + `pnpm run db:seed`
  (`.github/workflows/gate.yml:122,180-187`). El seed solo trae catálogos; nunca usuarios, zonas ni
  órdenes.
- Artefactos descargados con `gh run download` (sin runs nuevos, sin push, sin base local):
  `gate-completo-informe/.vitest-rojos.json` (informe unido: 3 shards, 3193 archivos, 45115 tests,
  324 en rojo) y `informe-shard-{1,2,3}/init-shard.log` (vitest con los bloques `FAIL` y su stack).
- Veredicto del run (`init-completo.log`): «sin rojos nuevos (243 rojos, todos en el baseline de
  243)», sin «por limpiar».

## Método

1. Las 239 entradas son las de `tests/baseline-rojos.json > archivos` cuyo `motivo` contiene «La
   retira SL-31» (las otras 4 citan SL-10/SL-29 o «Postgres 17 frente a 18»: no se tocan).
2. Cada una se buscó en `testResults` del informe unido: **las 239 están** (R733: ninguna sin
   ejecutar) y **las 239 tienen `status: failed`**.
3. Casos p/f/s = `assertionResults` del archivo por estado (`passed` / `failed` / `skipped`+`todo`).
   Un archivo con `S` (bloque «Failed Suites») cayó en un `beforeAll`: vitest marca sus casos como
   saltados y el archivo como fallido.
4. «Primer error» = el primer bloque `FAIL` del archivo en el log de su shard (vitest imprime los de
   suite antes que los de caso), con su primera línea y el primer frame del repo (`archivo:línea`).
   Si el frame cae en un helper compartido, ese helper es el **punto de fallo** del grupo.
5. Clase (R731/R732): sin archivos verdes, **pasa** y **verde sin datos** quedan en 0 (R731 solo se
   aplica a archivos que la corrida dio por buenos). **Base vacía** cuando el primer error nace en la
   lectura de una fila de negocio que la base migrada no trae (orden, usuario, zona, gestión). El
   resto, **otra causa**, con el mensaje y lo leído en el código y en el `stderr` del log.
6. Para los primeros errores sin frame del repo (`DriverAdapterError` del trigger y los
   `PrismaClientKnownRequestError`) se leyó el bloque completo del log y el código del test.

Scripts de un solo uso en el scratchpad de la sesión (no van al repo).

## Resumen por clase

| clase | archivos |
|---|---|
| pasa | 0 |
| verde sin datos | 0 |
| base vacía | 227 |
| otra causa | 12 |
| **total** | **239** |

## Base vacía: agrupadas por punto de fallo

| grupo | punto de fallo | lectura que falla | archivos | líneas de archivo |
|---|---|---|---|---|
| G1 | `tests/integration/db/454/_escenario.ts:132-133` `prepararMundo()` | `fksDeOrden(prisma)` → `null` (y después usuario y zona central, :134-150) | 76 | 11805 |
| G2 | `tests/integration/db/_fixtures/caja-459.ts:160,171-173` `cargarCatalogo459()` | zona central y «primera orden» para provincia/cantón | 29 | 9331 |
| G3 | `tests/integration/db/_whatsapp-envios-474.ts:24-25` `usuarioModelo()` | primer `usuario` | 7 | 621 |
| G4 | `tests/integration/db/_informe-transito-475.ts:32-33` `sembrarBase475()` | primer `usuario` | 5 | 478 |
| G5 | `tests/integration/db/419/_escenario-419.ts:57-58` `prepararMundo419()` | `fksDeOrden(prisma)` → `null` | 3 | 587 |
| G6 | `tests/integration/db/_picking-476.ts:34-35` `sembrarBase476()` | primera `zona` | 2 | 273 |
| G7 | propio del archivo | `fksDeOrden(prisma)` en el propio test | 59 | 27365 |
| G7b | propio del archivo | `orden.findFirst` / SQL «primera orden» o zona por producto cartesiano, sin `fksDeOrden` | 11 | 3771 |
| G8 | propio del archivo | primer `usuario` (o de un rol, o dos) por `findFirst`/`SELECT … LIMIT 1` | 30 | 13129 |
| G9 | propio del archivo | primera `zona` | 4 | 1555 |
| G10 | propio del archivo | gestiones existentes (`contarGestiones` > 0) | 1 | 363 |
| | | | **227** | |

Los helpers G1, G2 y G5 leen **fuera** de la transacción del test (en `beforeAll`, con `prisma`); G3,
G4 y G6 leen **dentro** (`tx`). Para R738 eso decide dónde se siembra: en G1/G2/G5 la creación tiene
que bajar a la parte que corre en la transacción (`crearEscenario`, `enTransaccionRevertida459`…), no
al `beforeAll`, o dejaría filas confirmadas.

Usuarios de cada helper que leen directamente los campos que hoy vienen de la base (y tendrían que
tocarse si el helper cambia su forma):
- G1 (`mundo.fks` / `mundo.centralZonaId`): `454/caracterizacion/notificacion-n1.test.ts`,
  `462/reprogramadas-retenidas-sql-real.test.ts`, `477-ordenes-en-correccion-sql-real.test.ts`.
- G2 (`centralZonaId` / `catalogo.fks`): `detalle-en-lote-464.test.ts`,
  `estado-cuenta-cierre-pagos-172r52.test.ts`, `estado-cuenta-servidor-458d.test.ts`.
- G3, G4, G5, G6: ninguno fuera del helper.

## Otra causa (12)

| causa | archivos | qué pasa (evidencia) |
|---|---|---|
| **dato ajeno** (5) | `detalle-movimiento-cierre-postgres` (D37), `premio-ranking-idempotencia`, `cierre-aprobar-el-mas-viejo-desbloquea`, `cierre-descarga-fechas-sql-real`, `repositories/historico-conversaciones.int` | `DriverAdapterError: referencia a otra empresa: cierre_dia.destino_zona_id -> zona` (`orden.zona_id` en el último). El test lee «la primera orden» (`fksDeOrden` o `orden.findFirst`) o «la primera zona»; en los shards 2 y 3 esa lectura **sí devolvió una fila**, pero de otra empresa, y el trigger `verificar_misma_empresa` (SQLSTATE SL017, `db/migrations/20261022130300_misma_empresa_en_fk/migration.sql:27`) rechaza la escritura. No es base vacía (la lectura no falló), pero el remedio es el mismo: sembrar dentro de la transacción (R737). |
| **sin empresa en contexto** (1) | `aporte-capital` | `stderr` del shard 1 (`init-shard.log:4482`): `[AppError:INTERNAL] EmpresaNoResuelta: Sin empresa en contexto para WalletMovimiento.aggregate` (`lib/db/extension-empresa.ts:206`); la action lo traduce a `AppErrorCode inesperado INTERNAL` (`lib/actions/aporte-capital.ts:70`). |
| **estado retirado del catálogo** (2) | `satelite-bodega-alcance-real` (`ayuda_tienda`, :178), `analytics-daily-job` (`en_fulfillment`, `_semilla-rollup.ts:85`) | El test pide un `order_status` que la 454 y la 155 sacaron del seed (`lib/types/order-status.ts:46-55,87-96`); una base nueva no lo tiene. |
| **migración: policies de SL-17** (2) | `historial-accion-migration` (:90), `postulacion-recurso-migration` (:261) | Esperan 0 policies en su tabla y hay 1: la RLS por empresa de SL-17 «Tabla organizacion y aislamiento por empresa» añadió una. |
| **migración: orden del enum** (1) | `wallet-458-migration` (:101) | Las dos últimas etiquetas de `wallet_movimiento_categoria` ya no son las de la 458 (migraciones posteriores añadieron valores). |
| **migración: `down.sql` posterior** (1) | `vista-filtro-migration` (:159) | `20261022130100_organizacion_id_en_negocio/down.sql` (SL-17) nombra `vista_filtro` y el test exige que ningún `down.sql` anterior lo haga. |

## Hallazgo: una fila de negocio de otra empresa en la base del shard

Los cinco «dato ajeno» prueban que, en algún momento de los shards 2 y 3, la base tenía al menos una
orden (y una zona) de **otra** empresa, confirmada fuera de la transacción revertida de su test:
alguna prueba deja filas en la base de servicio (o las deja mientras corre). No se buscó cuál: no es
de T1. Consecuencias:
- los tests que leen «la primera fila» son además no deterministas en CI (vacío en un momento, fila
  ajena en otro);
- R737 (no leer filas de negocio que no creó el test) los cubre al sembrar;
- queda como pregunta abierta para el leader si se quiere una ficha que encuentre al que filtra.

## Tabla por archivo (239 filas)

`p/f/s` = casos pasados / fallidos / saltados. Bloque `S` = la suite cayó en un hook. `log` =
`shard:línea` del primer bloque `FAIL` en `init-shard.log`. `destino` = propuesta de T2 (abajo).

| # | archivo | run | p/f/s | clase | punto de fallo (grupo) | primer error (1a linea) | nace en | log | destino |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `db/454/aplicacion-al-aprobar-sql-real.test.ts` | 43973243440 | 0/0/7 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6310 | LOTE |
| 2 | `db/454/ayuda-abierta-sql-real.test.ts` | 43973243440 | 0/0/14 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7772 | LOTE |
| 3 | `db/454/ayuda-evento-sql-real.test.ts` | 43973243440 | 0/0/9 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7743 | LOTE |
| 4 | `db/454/caracterizacion/alcance-satelite-y-sf001.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7964 | LOTE |
| 5 | `db/454/caracterizacion/ayuda-ciclo.test.ts` | 43973243440 | 0/0/7 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7977 | LOTE |
| 6 | `db/454/caracterizacion/cambio-dia.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7881 | LOTE |
| 7 | `db/454/caracterizacion/cierre-rechazado.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7894 | LOTE |
| 8 | `db/454/caracterizacion/confirmacion-fisica-238.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7990 | LOTE |
| 9 | `db/454/caracterizacion/correccion-69.test.ts` | 43973243440 | 0/0/6 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8003 | LOTE |
| 10 | `db/454/caracterizacion/corte-concurrencia.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7907 | LOTE |
| 11 | `db/454/caracterizacion/corte-no-barre-gestionadas.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8016 | LOTE |
| 12 | `db/454/caracterizacion/deshacer.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8029 | LOTE |
| 13 | `db/454/caracterizacion/devolucion-rechazadas-139.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8042 | LOTE |
| 14 | `db/454/caracterizacion/dinero-aprobacion.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6500 | LOTE |
| 15 | `db/454/caracterizacion/dos-gestiones-vivas.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7920 | LOTE |
| 16 | `db/454/caracterizacion/intentos-conteo.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6513 | LOTE |
| 17 | `db/454/caracterizacion/kpi-portal.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8055 | LOTE |
| 18 | `db/454/caracterizacion/liberacion-por-cierre.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6526 | LOTE |
| 19 | `db/454/caracterizacion/multi-dia-271.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7933 | LOTE |
| 20 | `db/454/caracterizacion/no-doble-gestion.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6539 | LOTE |
| 21 | `db/454/caracterizacion/notificacion-n1.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8068 | LOTE |
| 22 | `db/454/caracterizacion/portal-listas-mapa-ruta.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7946 | LOTE |
| 23 | `db/454/caracterizacion/rastreo-y-historial-legado.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8081 | LOTE |
| 24 | `db/454/caracterizacion/rechazos-tienda-425.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6552 | LOTE |
| 25 | `db/454/caracterizacion/reprogramadas-liberacion.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7959 | LOTE |
| 26 | `db/454/caracterizacion/sla-devolucion-reloj.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6565 | LOTE |
| 27 | `db/454/caracterizacion/solicitar-cierre.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7972 | LOTE |
| 28 | `db/454/caracterizacion/tablero-dia.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:8094 | LOTE |
| 29 | `db/454/caracterizacion/tope-276.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6578 | LOTE |
| 30 | `db/454/caracterizacion/traspaso.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7985 | LOTE |
| 31 | `db/454/caracterizacion/webhook-estado.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7998 | LOTE |
| 32 | `db/454/carga-mensajero-pendiente-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7785 | LOTE |
| 33 | `db/454/cierre-bodega-sf001-sql-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7798 | LOTE |
| 34 | `db/454/correccion-ayuda-abierta-sql-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6335 | LOTE |
| 35 | `db/454/correccion-ramas-sql-real.test.ts` | 43973243440 | 0/0/6 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7823 | LOTE |
| 36 | `db/454/corte-excluye-pendientes-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7768 | LOTE |
| 37 | `db/454/deshacer-ramas-sql-real.test.ts` | 43973243440 | 0/0/6 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7848 | LOTE |
| 38 | `db/454/devolucion-rechazadas-seleccion-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7793 | LOTE |
| 39 | `db/454/gestion-pendiente-sql-real.test.ts` | 43973243440 | 0/0/11 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7873 | LOTE |
| 40 | `db/454/intentos-segunda-via-sql-real.test.ts` | 43973243440 | 0/0/6 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6348 | LOTE |
| 41 | `db/454/novedades-predicado-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6373 | LOTE |
| 42 | `db/454/orden-evento-migration.test.ts` | 43973243440 | 5/0/10 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6398 | LOTE |
| 43 | `db/454/rastreo-pendiente-sql-real.test.ts` | 43973243440 | 0/0/9 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6411 | LOTE |
| 44 | `db/454/registro-gestion-concurrencia-sql-real.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7886 | LOTE |
| 45 | `db/454/registro-gestion-sin-transicion-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6436 | LOTE |
| 46 | `db/454/retiro-estados-migration.test.ts` | 43973243440 | 3/0/10 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7818 | LOTE |
| 47 | `db/454/senales-gestion-lectores-sql-real.test.ts` | 43973243440 | 0/0/14 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6461 | LOTE |
| 48 | `db/454/webhook-evento-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7899 | LOTE |
| 49 | `db/455/caracterizacion/api-lectura.test.ts` | 43973243440 | 0/0/9 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8011 | LOTE |
| 50 | `db/455/caracterizacion/dinero-aprobacion.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7912 | LOTE |
| 51 | `db/455/caracterizacion/filtro-ordenes-por-estado.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8024 | LOTE |
| 52 | `db/455/caracterizacion/filtro-satelite-por-codigo.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7925 | LOTE |
| 53 | `db/455/caracterizacion/intentos-y-tope.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8037 | LOTE |
| 54 | `db/455/caracterizacion/novedades-y-ayuda.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8050 | LOTE |
| 55 | `db/455/caracterizacion/plantilla-estatus.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8063 | LOTE |
| 56 | `db/455/caracterizacion/rastreo.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8076 | LOTE |
| 57 | `db/455/caracterizacion/snapshot-correccion.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6487 | LOTE |
| 58 | `db/455/caracterizacion/sql-crudo-avisos-y-corte.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7938 | LOTE |
| 59 | `db/455/caracterizacion/sql-crudo-cron-devoluciones.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8089 | LOTE |
| 60 | `db/455/caracterizacion/sql-crudo-tablero-dia.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:8102 | LOTE |
| 61 | `db/455/caracterizacion/webhook-estado.test.ts` | 43973243440 | 0/0/5 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7951 | LOTE |
| 62 | `db/455/interruptor-codigos.test.ts` | 43973243440 | 1/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6297 | LOTE |
| 63 | `db/455/migracion.test.ts` | 43973243440 | 5/0/11 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7759 | LOTE |
| 64 | `db/455/rastreo-retirado-y-pendiente-sql-real.test.ts` | 43973243440 | 0/0/7 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7843 | LOTE |
| 65 | `db/455/snapshot-lectura.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7868 | LOTE |
| 66 | `db/462/reprogramadas-retenidas-sql-real.test.ts` | 43973243440 | 0/0/25 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:6474 | LOTE |
| 67 | `db/477-aprobacion-tras-correccion-sql-real.test.ts` | 43973243440 | 0/0/1 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7323 | LOTE |
| 68 | `db/477-deshacer-cierre-rechazado-sql-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-2:7348 | LOTE |
| 69 | `db/477-ordenes-en-correccion-sql-real.test.ts` | 43973243440 | 0/0/1 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:5863 | LOTE |
| 70 | `db/477-regestionar-sin-cierre-sql-real.test.ts` | 43973243440 | 0/0/2 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7130 | LOTE |
| 71 | `db/477-resolicitud-rechazado-sql-real.test.ts` | 43973243440 | 0/0/3 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7155 | LOTE |
| 72 | `db/484-puntero-aprobacion-sql-real.test.ts` | 43973243440 | 0/0/7 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7180 | LOTE |
| 73 | `db/484-puntero-corte-sql-real.test.ts` | 43973243440 | 0/0/8 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:5888 | LOTE |
| 74 | `db/484-puntero-incidente-blst765.test.ts` | 43973243440 | 0/0/6 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:5901 | LOTE |
| 75 | `db/484-puntero-traspaso-sql-real.test.ts` | 43973243440 | 0/0/6 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-1:7193 | LOTE |
| 76 | `db/484-puntero-vigente-sql-real.test.ts` | 43973243440 | 0/0/20 | base vacia | G1 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/454/_escenario.ts:133` | informe-shard-3:5914 | LOTE |
| 77 | `db/confirmacion-fisica-migration.test.ts` | 43973243440 | 17/2/0 | base vacia | G10 | AssertionError: esta base no tiene gestiones que comprobar: expected 0 to be greater than 0 | `tests/integration/db/confirmacion-fisica-migration.test.ts:289` | informe-shard-1:8422 | F7 |
| 78 | `db/ajuste-caja-anulacion-461.test.ts` | 43973243440 | 0/0/5 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7206 | LOTE |
| 79 | `db/analitica-anulacion-rechazo-458.test.ts` | 43973243440 | 0/0/4 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7385 | LOTE |
| 80 | `db/busqueda-por-guia-469.test.ts` | 43973243440 | 0/0/8 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7255 | LOTE |
| 81 | `db/caja-caracterizacion-459.test.ts` | 43973243440 | 0/1/22 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7268 | LOTE |
| 82 | `db/caja-invariante-tiendas.test.ts` | 43973243440 | 0/8/0 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:8363 | LOTE |
| 83 | `db/como-quedo.test.ts` | 43973243440 | 0/0/8 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:5999 | LOTE |
| 84 | `db/detalle-en-lote-464.test.ts` | 43973243440 | 0/0/6 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7530 | LOTE |
| 85 | `db/efecto-movimiento-predice.test.ts` | 43973243440 | 0/0/5 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6048 | LOTE |
| 86 | `db/estado-cuenta-busqueda-orden-463.test.ts` | 43973243440 | 0/0/11 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7543 | LOTE |
| 87 | `db/estado-cuenta-cierre-pagos-172r52.test.ts` | 43973243440 | 0/0/6 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7556 | LOTE |
| 88 | `db/estado-cuenta-pago-tienda-172r53.test.ts` | 43973243440 | 0/0/4 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7401 | LOTE |
| 89 | `db/estado-cuenta-saldo-corrido.test.ts` | 43973243440 | 0/0/6 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6085 | LOTE |
| 90 | `db/estado-cuenta-servidor-458d.test.ts` | 43973243440 | 0/0/13 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7414 | LOTE |
| 91 | `db/kardex-cuentas-468.test.ts` | 43973243440 | 0/0/1 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7475 | LOTE |
| 92 | `db/libro-caja-a-quien.test.ts` | 43973243440 | 0/0/7 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7488 | LOTE |
| 93 | `db/libro-caja-busqueda-orden-463.test.ts` | 43973243440 | 0/0/9 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6158 | LOTE |
| 94 | `db/libro-caja-filtro-a-quien.test.ts` | 43973243440 | 0/0/16 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7623 | LOTE |
| 95 | `db/libro-caja-revision-458c.test.ts` | 43973243440 | 0/0/8 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7501 | LOTE |
| 96 | `db/libro-caja-revision-458e.test.ts` | 43973243440 | 0/0/6 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7514 | LOTE |
| 97 | `db/libro-kardex-468.test.ts` | 43973243440 | 0/0/6 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7527 | LOTE |
| 98 | `db/liquidacion-fechas-cr-461.test.ts` | 43973243440 | 0/0/2 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7540 | LOTE |
| 99 | `db/mi-wallet-resumen-458d.test.ts` | 43973243440 | 0/0/5 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6183 | LOTE |
| 100 | `db/saldos-tiendas-busqueda-463.test.ts` | 43973243440 | 0/0/5 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6208 | LOTE |
| 101 | `db/wallet-461-idempotencia-clave.test.ts` | 43973243440 | 0/0/5 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-1:7639 | LOTE |
| 102 | `db/wallet-anulacion-458.test.ts` | 43973243440 | 0/0/10 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6233 | LOTE |
| 103 | `db/wallet-caracterizacion-458.test.ts` | 43973243440 | 0/0/13 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7720 | LOTE |
| 104 | `db/wallet-comprobante-alcance.test.ts` | 43973243440 | 0/0/8 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6246 | LOTE |
| 105 | `db/wallet-documento-comprobante-458.test.ts` | 43973243440 | 0/0/5 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-3:6259 | LOTE |
| 106 | `db/wallet-registro-comprobante-458.test.ts` | 43973243440 | 0/0/9 | base vacia | G2 | Error: hay DATABASE_URL pero faltan la zona central, el tipo 'cedula' o una orden de la que tomar provincia y canton: esta suite n | `tests/integration/db/_fixtures/caja-459.ts:173` | informe-shard-2:7733 | LOTE |
| 107 | `db/whatsapp-envio-defaults.test.ts` | 43973243440 | 3/1/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-1:8724 | LOTE |
| 108 | `db/whatsapp-envio-ejecucion-admintienda.test.ts` | 43973243440 | 0/1/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-2:10308 | LOTE |
| 109 | `db/whatsapp-envio-entrega-estado-webhook.test.ts` | 43973243440 | 1/3/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-2:10326 | LOTE |
| 110 | `db/whatsapp-envio-entrega-reclamo.test.ts` | 43973243440 | 0/4/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-2:10380 | LOTE |
| 111 | `db/whatsapp-envio-historial.test.ts` | 43973243440 | 1/1/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-2:10452 | LOTE |
| 112 | `db/whatsapp-envio-prueba-limite.test.ts` | 43973243440 | 0/1/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-2:10470 | LOTE |
| 113 | `db/whatsapp-envio-resolver-destinatarios.test.ts` | 43973243440 | 1/3/0 | base vacia | G3 | Error: 474: no hay ningun usuario modelo en la base de test | `tests/integration/db/_whatsapp-envios-474.ts:25` | informe-shard-1:8742 | LOTE |
| 114 | `db/informe-transito-catalogo-real.test.ts` | 43973243440 | 0/1/0 | base vacia | G4 | Error: 475: no hay ningun usuario en la base de test | `tests/integration/db/_informe-transito-475.ts:33` | informe-shard-1:8446 | LOTE |
| 115 | `db/informe-transito-hitos.test.ts` | 43973243440 | 0/4/0 | base vacia | G4 | Error: 475: no hay ningun usuario en la base de test | `tests/integration/db/_informe-transito-475.ts:33` | informe-shard-3:7247 | LOTE |
| 116 | `db/informe-transito-parados.test.ts` | 43973243440 | 0/1/0 | base vacia | G4 | Error: 475: no hay ningun usuario en la base de test | `tests/integration/db/_informe-transito-475.ts:33` | informe-shard-2:9420 | LOTE |
| 117 | `db/informe-transito-seleccion.test.ts` | 43973243440 | 0/2/0 | base vacia | G4 | Error: 475: no hay ningun usuario en la base de test | `tests/integration/db/_informe-transito-475.ts:33` | informe-shard-1:8464 | LOTE |
| 118 | `db/informe-transito-zonas.test.ts` | 43973243440 | 0/3/0 | base vacia | G4 | Error: 475: no hay ningun usuario en la base de test | `tests/integration/db/_informe-transito-475.ts:33` | informe-shard-3:7319 | LOTE |
| 119 | `db/419/confirmar-entrega-lote-sql-real.test.ts` | 43973243440 | 0/0/11 | base vacia | G5 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/419/_escenario-419.ts:58` | informe-shard-2:7746 | LOTE |
| 120 | `db/419/confirmar-entrega-sin-dinero-sql-real.test.ts` | 43973243440 | 0/0/3 | base vacia | G5 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/419/_escenario-419.ts:58` | informe-shard-1:7730 | LOTE |
| 121 | `db/419/confirmar-entrega-webhook-sql-real.test.ts` | 43973243440 | 0/0/2 | base vacia | G5 | Error: tabla 'orden' vacia: corre 'pnpm run db:seed'. | `tests/integration/db/419/_escenario-419.ts:58` | informe-shard-3:6284 | LOTE |
| 122 | `db/picking-ordenes-en-preparacion.test.ts` | 43973243440 | 0/7/0 | base vacia | G6 | Error: 476: la base no tiene ninguna zona | `tests/integration/db/_picking-476.ts:35` | informe-shard-2:9505 | LOTE |
| 123 | `db/picking-resumen-tiendas.test.ts` | 43973243440 | 0/3/0 | base vacia | G6 | Error: 476: la base no tiene ninguna zona | `tests/integration/db/_picking-476.ts:35` | informe-shard-2:9638 | LOTE |
| 124 | `db/486-evidencias-cierres-sql-real.test.ts` | 43973243440 | 0/0/6 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' antes de | `tests/integration/db/486-evidencias-cierres-sql-real.test.ts:84` | informe-shard-2:7373 | F3 |
| 125 | `db/api-key-eliminabilidad.test.ts` | 43973243440 | 0/0/10 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y 'pnpm exec tsx  | `tests/integration/db/api-key-eliminabilidad.test.ts:51` | informe-shard-3:5927 | F3 |
| 126 | `db/api-key-eliminar-fk-inesperada.test.ts` | 43973243440 | 0/0/3 | base vacia | G7 | Error: hay DATABASE_URL pero 'orden' esta vacia: corre 'pnpm run db:seed' antes. | `tests/integration/db/api-key-eliminar-fk-inesperada.test.ts:54` | informe-shard-1:7219 | F3 |
| 127 | `db/api-key-eliminar-tienda-destino.test.ts` | 43973243440 | 0/0/2 | base vacia | G7 | Error: hay DATABASE_URL pero 'orden' esta vacia: corre 'pnpm run db:seed' antes. | `tests/integration/db/api-key-eliminar-tienda-destino.test.ts:48` | informe-shard-1:7231 | F3 |
| 128 | `db/aviso-agregado-repository.test.ts` | 43973243440 | 0/11/0 | base vacia | G7 | AssertionError: la tabla 'orden' esta vacia: el caso no se puede medir: expected null not to be null | `tests/integration/db/aviso-agregado-repository.test.ts:153` | informe-shard-1:8206 | F4 |
| 129 | `db/busqueda-comportamiento.test.ts` | 43973243440 | 11/27/0 | base vacia | G7 | AssertionError: expected null not to be null | `tests/integration/db/busqueda-comportamiento.test.ts:207` | informe-shard-2:8472 | F4 |
| 130 | `db/busqueda-normalizacion-paridad.test.ts` | 43973243440 | 16/1/0 | base vacia | G7 | AssertionError: no hay ninguna fila en 'orden' de la que copiar las FKs: siembra la base local: expected null not to be null | `tests/integration/db/busqueda-normalizacion-paridad.test.ts:233` | informe-shard-2:8822 | F4 |
| 131 | `db/busqueda-sincronizacion-columna.test.ts` | 43973243440 | 6/1/0 | base vacia | G7 | AssertionError: expected null not to be null | `tests/integration/db/busqueda-sincronizacion-columna.test.ts:47` | informe-shard-3:6594 | F4 |
| 132 | `db/busqueda-usa-indice.test.ts` | 43973243440 | 13/1/0 | base vacia | G7 | AssertionError: expected null not to be null | `tests/integration/db/busqueda-usa-indice.test.ts:186` | informe-shard-1:8338 | F4 |
| 133 | `db/cierre-aprobacion-libera-solo-lo-suyo.test.ts` | 43973243440 | 0/0/2 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/cierre-aprobacion-libera-solo-lo-suyo.test.ts:65` | informe-shard-1:7281 | F1 |
| 134 | `db/cierre-bloqueo-nv-sql-real.test.ts` | 43973243440 | 0/0/18 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/cierre-bloqueo-nv-sql-real.test.ts:62` | informe-shard-3:5951 | F1 |
| 135 | `db/cierre-descarga-intentos-entrega-sql-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/cierre-descarga-intentos-entrega-sql-real.test.ts:150` | informe-shard-2:7398 | F1 |
| 136 | `db/cierre-excluye-gestiones-de-escritorio.test.ts` | 43973243440 | 0/0/6 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/cierre-excluye-gestiones-de-escritorio.test.ts:91` | informe-shard-2:7410 | F1 |
| 137 | `db/cierre-rechazado-aviso-dedupe.test.ts` | 43973243440 | 0/0/6 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/cierre-rechazado-aviso-dedupe.test.ts:65` | informe-shard-3:5963 | F1 |
| 138 | `db/cierre-rechazado-jornada-sql-real.test.ts` | 43973243440 | 0/0/6 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/cierre-rechazado-jornada-sql-real.test.ts:65` | informe-shard-1:7293 | F1 |
| 139 | `db/cierre-rechazo-tienda-aprobacion.test.ts` | 43973243440 | 0/0/16 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: corre 'pnpm run db:seed'. | `tests/integration/db/cierre-rechazo-tienda-aprobacion.test.ts:762` | informe-shard-1:7305 | F1 |
| 140 | `db/cierre-rechazo-tienda-sql-real.test.ts` | 43973243440 | 0/0/8 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/cierre-rechazo-tienda-sql-real.test.ts:78` | informe-shard-2:7422 | F1 |
| 141 | `db/cierre-rechazo-tienda-totales.test.ts` | 43973243440 | 0/0/6 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: corre 'pnpm run db:seed'. | `tests/integration/db/cierre-rechazo-tienda-totales.test.ts:336` | informe-shard-2:7434 | F1 |
| 142 | `db/cierre-segundo-vincula-solo-lo-suyo.test.ts` | 43973243440 | 0/0/1 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/cierre-segundo-vincula-solo-lo-suyo.test.ts:60` | informe-shard-2:7446 | F1 |
| 143 | `db/cierre-sin-gestion-sql-real.test.ts` | 43973243440 | 0/0/9 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/cierre-sin-gestion-sql-real.test.ts:97` | informe-shard-1:7317 | F1 |
| 144 | `db/cierre-sin-gestion-tope-sql-real.test.ts` | 43973243440 | 0/0/9 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts:166` | informe-shard-1:7329 | F1 |
| 145 | `db/cierres-admin-retornables-sql-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/cierres-admin-retornables-sql-real.test.ts:88` | informe-shard-3:5975 | F1 |
| 146 | `db/cierres-filtro-estado-sql-real.test.ts` | 43973243440 | 0/0/7 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/cierres-filtro-estado-sql-real.test.ts:84` | informe-shard-3:5987 | F1 |
| 147 | `db/correccion-dia-reparto-efectos.int.test.ts` | 43973243440 | 0/0/11 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/correccion-dia-reparto-efectos.int.test.ts:89` | informe-shard-2:7470 | F2 |
| 148 | `db/correccion-dia-reparto-historial.int.test.ts` | 43973243440 | 0/0/9 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/correccion-dia-reparto-historial.int.test.ts:67` | informe-shard-1:7341 | F2 |
| 149 | `db/correccion-dia-reparto.int.test.ts` | 43973243440 | 0/0/18 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/correccion-dia-reparto.int.test.ts:69` | informe-shard-1:7353 | F2 |
| 150 | `db/correccion-fecha-reprogramacion.int.test.ts` | 43973243440 | 0/0/23 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el escenario. Corre 'pnpm run db:seed' (y la | `tests/integration/db/correccion-fecha-reprogramacion.int.test.ts:111` | informe-shard-2:7482 | F2 |
| 151 | `db/correccion-resultado-gestion.int.test.ts` | 43973243440 | 0/0/14 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/correccion-resultado-gestion.int.test.ts:74` | informe-shard-1:7365 | F2 |
| 152 | `db/corregir-datos-cliente.repo.test.ts` | 43973243440 | 0/0/22 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/corregir-datos-cliente.repo.test.ts:90` | informe-shard-2:7494 | F2 |
| 153 | `db/corregir-ubicacion-geocode.test.ts` | 43973243440 | 0/0/11 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/corregir-ubicacion-geocode.test.ts:116` | informe-shard-2:7506 | F2 |
| 154 | `db/corte-diario-segundo-cierre-sql-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/corte-diario-segundo-cierre-sql-real.test.ts:102` | informe-shard-3:6024 | F1 |
| 155 | `db/costo-y-zona-api-415.test.ts` | 43973243440 | 0/0/11 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/costo-y-zona-api-415.test.ts:135` | informe-shard-2:7518 | F4 |
| 156 | `db/deshacer-asignacion-zona-satelite.int.test.ts` | 43973243440 | 0/0/6 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y 'pnpm exec tsx  | `tests/integration/db/deshacer-asignacion-zona-satelite.int.test.ts:92` | informe-shard-3:6036 | F2 |
| 157 | `db/deshacer-gestion-conserva-reserva.int.test.ts` | 43973243440 | 0/0/8 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/deshacer-gestion-conserva-reserva.int.test.ts:83` | informe-shard-1:7377 | F2 |
| 158 | `db/eliminar-orden-api-frontera-tienda.test.ts` | 43973243440 | 0/0/1 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/eliminar-orden-api-frontera-tienda.test.ts:54` | informe-shard-3:6061 | F3 |
| 159 | `db/eliminar-orden-pantalla-frontera-tienda.test.ts` | 43973243440 | 0/0/5 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/eliminar-orden-pantalla-frontera-tienda.test.ts:75` | informe-shard-1:7389 | F3 |
| 160 | `db/emisor-relaciones-anidadas.test.ts` | 43973243440 | 0/0/4 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar la gestion que este test necesita. Corre 'pn | `tests/integration/db/emisor-relaciones-anidadas.test.ts:116` | informe-shard-3:6073 | F3 |
| 161 | `db/gestion-desde-ayuda-dia-reserva.int.test.ts` | 43973243440 | 0/0/5 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/gestion-desde-ayuda-dia-reserva.int.test.ts:93` | informe-shard-1:7439 | F2 |
| 162 | `db/gestiones-detalle-api-405.test.ts` | 43973243440 | 0/0/12 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/gestiones-detalle-api-405.test.ts:136` | informe-shard-1:7451 | F2 |
| 163 | `db/historial-accion-atomicidad.test.ts` | 43973243440 | 0/0/22 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y 'pnpm exec tsx  | `tests/integration/db/historial-accion-atomicidad.test.ts:107` | informe-shard-1:7463 | F3 |
| 164 | `db/historial-accion-lectura.test.ts` | 43973243440 | 0/16/2 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/historial-accion-lectura.test.ts:495` | informe-shard-2:7599 | F3 |
| 165 | `db/historial-accion-q1-ubicacion.test.ts` | 43973243440 | 0/0/5 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/historial-accion-q1-ubicacion.test.ts:79` | informe-shard-3:6134 | F3 |
| 166 | `db/liberacion-al-aprobar-cierre-real.test.ts` | 43973243440 | 0/0/5 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/liberacion-al-aprobar-cierre-real.test.ts:115` | informe-shard-3:6146 | F4 |
| 167 | `db/liberacion-reprogramada-cierre-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/liberacion-reprogramada-cierre-real.test.ts:107` | informe-shard-2:7611 | F4 |
| 168 | `db/notificacion-bloqueo-otro-cierre-avisa.test.ts` | 43973243440 | 0/0/1 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/notificacion-bloqueo-otro-cierre-avisa.test.ts:62` | informe-shard-2:7636 | F3 |
| 169 | `db/novedades-sin-gestionar-aviso-dedupe.test.ts` | 43973243440 | 0/5/0 | base vacia | G7 | AssertionError: la tabla 'orden' está vacía: el caso no se puede medir: expected null not to be null | `tests/integration/db/novedades-sin-gestionar-aviso-dedupe.test.ts:111` | informe-shard-1:8524 | F2 |
| 170 | `db/orden-eliminada-actor-admin.test.ts` | 43973243440 | 0/0/5 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y 'pnpm exec tsx  | `tests/integration/db/orden-eliminada-actor-admin.test.ts:64` | informe-shard-1:7553 | F3 |
| 171 | `db/orden-remision-borrada-libera-numero.test.ts` | 43973243440 | 0/0/9 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el caso. Corre 'pnpm run db:seed' (y las sem | `tests/integration/db/orden-remision-borrada-libera-numero.test.ts:72` | informe-shard-2:7648 | F3 |
| 172 | `db/orden-traspaso-migration.test.ts` | 43973243440 | 4/1/10 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar la fila con la que se miden el CHECK y los R | `tests/integration/db/orden-traspaso-migration.test.ts:211` | informe-shard-3:6196 | F3 |
| 173 | `db/push-canal-restricciones.test.ts` | 43973243440 | 1/6/0 | base vacia | G7 | AssertionError: la tabla 'orden' esta vacia: el caso no se puede medir: expected null not to be null | `tests/integration/db/push-canal-restricciones.test.ts:77` | informe-shard-1:8584 | F4 |
| 174 | `db/push-destinatarios-equivalencia.test.ts` | 43973243440 | 0/4/0 | base vacia | G7 | AssertionError: la tabla 'orden' esta vacia: el caso no se puede medir: expected null not to be null | `tests/integration/db/push-destinatarios-equivalencia.test.ts:166` | informe-shard-2:9907 | F4 |
| 175 | `db/rechazo-tienda-cobro.int.test.ts` | 43973243440 | 0/0/10 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' antes de esta suit | `tests/integration/db/rechazo-tienda-cobro.int.test.ts:62` | informe-shard-1:7615 | F4 |
| 176 | `db/recoger-lote-dia-reserva.int.test.ts` | 43973243440 | 0/0/7 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el corpus. Corre 'pnpm run db:seed' (y las s | `tests/integration/db/recoger-lote-dia-reserva.int.test.ts:88` | informe-shard-2:7672 | F2 |
| 177 | `db/reparto-manana-repository.test.ts` | 43973243440 | 0/10/0 | base vacia | G7 | AssertionError: la tabla 'orden' está vacía: el caso no se puede medir: expected null not to be null | `tests/integration/db/reparto-manana-repository.test.ts:147` | informe-shard-3:7665 | F2 |
| 178 | `db/tarifa-zona-borrado-fk-real.test.ts` | 43973243440 | 0/0/9 | base vacia | G7 | Error: hay DATABASE_URL pero 'orden' esta vacia: corre 'pnpm run db:seed' antes. | `tests/integration/db/tarifa-zona-borrado-fk-real.test.ts:83` | informe-shard-2:7696 | F3 |
| 179 | `db/traspaso-mensajero.int.test.ts` | 43973243440 | 0/0/24 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/traspaso-mensajero.int.test.ts:72` | informe-shard-1:7627 | F2 |
| 180 | `db/usuario-preferencia.test.ts` | 43973243440 | 2/12/0 | base vacia | G7 | AssertionError: la tabla 'orden' esta vacia: el caso no se puede medir: expected null not to be null | `tests/integration/db/usuario-preferencia.test.ts:72` | informe-shard-2:10035 | F4 |
| 181 | `db/wallet-anulacion-concurrencia.test.ts` | 43973243440 | 0/0/2 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: corre 'pnpm run db:seed' | `tests/integration/db/wallet-anulacion-concurrencia.test.ts:40` | informe-shard-2:7708 | F4 |
| 182 | `db/webhook-evidencias-url-resuelve-sql-real.test.ts` | 43973243440 | 0/0/4 | base vacia | G7 | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar el caso. Corre 'pnpm run db:seed' (y las sem | `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts:94` | informe-shard-1:7664 | F4 |
| 183 | `db/chat-entrante-telefono-cr.test.ts` | 43973243440 | 2/18/0 | base vacia | G7b | AssertionError: expected null not to be null | `tests/integration/db/chat-entrante-telefono-cr.test.ts:154` | informe-shard-3:6606 | F7 |
| 184 | `db/corregir-datos-cliente.chat.test.ts` | 43973243440 | 0/0/2 | base vacia | G7b | Error: hay DATABASE_URL pero la tabla 'orden' esta vacia: sin FKs no se puede sembrar. Corre 'pnpm run db:seed' (y las semillas de | `tests/integration/db/corregir-datos-cliente.chat.test.ts:88` | informe-shard-3:6012 | F7 |
| 185 | `db/geografia-historico-intacto.test.ts` | 43973243440 | 0/0/6 | base vacia | G7b | Error: hay DATABASE_URL pero 'orden' esta vacia: sin una fila de la que tomar las FK (estatus, tienda, zona) no se puede sembrar l | `tests/integration/db/geografia-historico-intacto.test.ts:54` | informe-shard-1:7427 | F7 |
| 186 | `db/geografia-ordenes-sin-entregar.test.ts` | 43973243440 | 0/0/10 | base vacia | G7b | Error: hay DATABASE_URL pero 'orden' esta vacia: sin una fila de la que tomar 'tienda_id' y 'zona_id' no se puede sembrar el corpu | `tests/integration/db/geografia-ordenes-sin-entregar.test.ts:59` | informe-shard-2:7569 | F7 |
| 187 | `db/habilitacion-api-migration.test.ts` | 43973243440 | 8/1/12 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test  | `tests/integration/db/habilitacion-api-migration.test.ts:588` | informe-shard-2:7581 | F7 |
| 188 | `db/orden-mensajero-meta-drop-nota-migration.test.ts` | 43973243440 | 6/0/7 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test. | `tests/integration/db/orden-mensajero-meta-drop-nota-migration.test.ts:407` | informe-shard-1:7565 | F7 |
| 189 | `db/orden-nota-migration.test.ts` | 43973243440 | 3/0/13 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test  | `tests/integration/db/orden-nota-migration.test.ts:406` | informe-shard-1:7583 | F7 |
| 190 | `repositories/chat-media-autorizada.int.test.ts` | 43973243440 | 0/0/3 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test  | `tests/integration/repositories/chat-media-autorizada.int.test.ts:159` | informe-shard-2:7291 | F7 |
| 191 | `repositories/chat-media-historico.int.test.ts` | 43973243440 | 0/0/4 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test  | `tests/integration/repositories/chat-media-historico.int.test.ts:168` | informe-shard-3:5845 | F7 |
| 192 | `repositories/conteo-productos.int.test.ts` | 43973243440 | 0/0/8 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test. | `tests/integration/repositories/conteo-productos.int.test.ts:263` | informe-shard-1:7676 | F7 |
| 193 | `repositories/orden-nota.int.test.ts` | 43973243440 | 0/0/5 | base vacia | G7b | Error: La base de pruebas no tiene catalogos de geografia/estatus sembrados: sin ellos no se puede crear la orden propia del test  | `tests/integration/repositories/orden-nota.int.test.ts:202` | informe-shard-1:7712 | F7 |
| 194 | `actions/analitica-financiera-action.test.ts` | 43973243440 | 1/14/0 | base vacia | G8 | AssertionError: expected null not to be null | `tests/integration/actions/analitica-financiera-action.test.ts:283` | informe-shard-2:8110 | F5 |
| 195 | `db/api-key-eliminar.test.ts` | 43973243440 | 0/0/10 | base vacia | G8 | Error: hay DATABASE_URL pero no hay ningun usuario con rol 'maestro': esta suite necesita crear su usuario en el test (SL-31). | `tests/integration/db/api-key-eliminar.test.ts:54` | informe-shard-1:7243 | F6 |
| 196 | `db/asistente-uso-diario.int.test.ts` | 43973243440 | 0/0/11 | base vacia | G8 | AssertionError: la base no tiene ni un usuario: no hay FK que satisfacer: expected null not to be null | `tests/integration/db/asistente-uso-diario.int.test.ts:55` | informe-shard-3:5939 | F6 |
| 197 | `db/cierre-bodega-conciliacion.int.test.ts` | 43973243440 | 6/8/0 | base vacia | G8 | Error: hay DATABASE_URL pero la tabla 'usuario' esta vacia: sin FK no se puede sembrar un cierre_bodega. Corre 'pnpm run db:seed'  | `tests/integration/db/cierre-bodega-conciliacion.int.test.ts:178` | informe-shard-3:6736 | F5 |
| 198 | `db/cierre-bodega-resumen-pendientes.test.ts` | 43973243440 | 4/2/0 | base vacia | G8 | Error: hay DATABASE_URL pero la tabla 'usuario' esta vacia: sin FK no se puede sembrar un cierre_dia. Corre 'pnpm run db:seed' ant | `tests/integration/db/cierre-bodega-resumen-pendientes.test.ts:137` | informe-shard-3:6880 | F5 |
| 199 | `db/cobertura-repository.test.ts` | 43973243440 | 3/0/2 | base vacia | G8 | Error: no hay ningun usuario adminTienda en esta base: corre 'pnpm run db:seed' | `tests/integration/db/cobertura-repository.test.ts:76` | informe-shard-2:7458 | F6 |
| 200 | `db/consolidacion-concurrente.int.test.ts` | 43973243440 | 0/5/0 | base vacia | G8 | Error: hay DATABASE_URL pero la tabla 'usuario' esta vacia: sin FK no se puede sembrar un cierre_dia. Corre 'pnpm run db:seed' ant | `tests/integration/db/consolidacion-concurrente.int.test.ts:84` | informe-shard-3:6916 | F5 |
| 201 | `db/corregir-conciliacion.int.test.ts` | 43973243440 | 0/10/0 | base vacia | G8 | Error: hay DATABASE_URL pero 'usuario' tiene menos de 2 filas: R2 necesita a quien marco y a quien corrige. Corre 'pnpm run db:see | `tests/integration/db/corregir-conciliacion.int.test.ts:73` | informe-shard-3:7006 | F5 |
| 202 | `db/gasto-fijo-cobro-aprobacion.test.ts` | 43973243440 | 1/11/0 | base vacia | G8 | Error: La base tiene 0 usuarios y hacen falta 1: esta suite necesita crear sus usuarios en el test (SL-31). Sin usuarios no se pue | `tests/integration/db/gasto-fijo-cobro-aprobacion.test.ts:129` | informe-shard-2:8877 | F5 |
| 203 | `db/gasto-fijo-cobro-idempotencia.test.ts` | 43973243440 | 7/2/0 | base vacia | G8 | Error: La base no tiene ni un 'usuario': esta suite necesita crear su usuario en el test (SL-31). Sin usuario no se puede ejercer  | `tests/integration/db/gasto-fijo-cobro-idempotencia.test.ts:519` | informe-shard-2:9070 | F5 |
| 204 | `db/gasto-fijo-cobro-migration.test.ts` | 43973243440 | 6/2/0 | base vacia | G8 | Error: La base no tiene ni un 'usuario': esta suite necesita crear su usuario en el test (SL-31). Sin usuario no se puede ejercer  | `tests/integration/db/gasto-fijo-cobro-migration.test.ts:71` | informe-shard-3:7169 | F5 |
| 205 | `db/geografia-cascada-reversible.test.ts` | 43973243440 | 0/0/10 | base vacia | G8 | Error: hay DATABASE_URL pero 'usuario' esta vacia: sin actor no se puede ejercer el registro de acciones que acompaña al cambio de | `tests/integration/db/geografia-cascada-reversible.test.ts:59` | informe-shard-3:6098 | F6 |
| 206 | `db/geografia-registro-accion.test.ts` | 43973243440 | 2/0/12 | base vacia | G8 | Error: hay DATABASE_URL pero 'usuario' esta vacia: sin actor no se puede comprobar el congelado de nombre y rol, que es la mitad d | `tests/integration/db/geografia-registro-accion.test.ts:80` | informe-shard-3:6110 | F6 |
| 207 | `db/geografia-renombrado.test.ts` | 43973243440 | 0/0/17 | base vacia | G8 | Error: hay DATABASE_URL pero 'usuario' esta vacia: sin actor no se puede comprobar el congelado de nombre y rol de la fila del reg | `tests/integration/db/geografia-renombrado.test.ts:80` | informe-shard-3:6122 | F6 |
| 208 | `db/marca-conciliacion.int.test.ts` | 43973243440 | 0/8/0 | base vacia | G8 | Error: hay DATABASE_URL pero la tabla 'usuario' esta vacia: sin FK no se puede sembrar un cierre_bodega. Corre 'pnpm run db:seed'  | `tests/integration/db/marca-conciliacion.int.test.ts:68` | informe-shard-3:7373 | F5 |
| 209 | `db/mi-wallet-cierres-alcance.test.ts` | 43973243440 | 0/0/4 | base vacia | G8 | Error: hay DATABASE_URL pero no hay ningun usuario: falta el catalogo (rol / tipo de identificacion) que las FK de 'usuario' exige | `tests/integration/db/mi-wallet-cierres-alcance.test.ts:49` | informe-shard-3:6171 | F5 |
| 210 | `db/notificacion-evento-cierre-rechazado-migration.test.ts` | 43973243440 | 25/1/0 | base vacia | G8 | PrismaClientKnownRequestError: | `tests/integration/db/notificacion-evento-cierre-rechazado-migration.test.ts:478` | informe-shard-3:7517 | F6 |
| 211 | `db/notificacion-evento-geocodificacion-caida-migration.test.ts` | 43973243440 | 25/2/0 | base vacia | G8 | AssertionError: no hay ningún usuario en la base: el caso no se puede medir: expected +0 to be 1 // Object.is equality | `tests/integration/db/notificacion-evento-geocodificacion-caida-migration.test.ts:427` | informe-shard-2:9438 | F6 |
| 212 | `db/notificacion-evento-reparto-manana-migration.test.ts` | 43973243440 | 26/1/0 | base vacia | G8 | PrismaClientKnownRequestError: | `tests/integration/db/notificacion-evento-reparto-manana-migration.test.ts:510` | informe-shard-1:8500 | F6 |
| 213 | `db/notificacion-evento-traspaso-migration.test.ts` | 43973243440 | 27/1/0 | base vacia | G8 | PrismaClientKnownRequestError: | `tests/integration/db/notificacion-evento-traspaso-migration.test.ts:475` | informe-shard-2:9481 | F6 |
| 214 | `db/premio-ranking-devengo-migration.test.ts` | 43973243440 | 25/1/6 | base vacia | G8 | Error: hay DATABASE_URL pero no hay ningun usuario 'mensajero': sin catalogo no se puede sembrar el mensajero de prueba. Esta suit | `tests/integration/db/premio-ranking-devengo-migration.test.ts:447` | informe-shard-2:7660 | F5 |
| 215 | `db/ranking-snapshot-migration.test.ts` | 43973243440 | 43/0/6 | base vacia | G8 | Error: La base de pruebas no tiene dos usuarios en 'public.usuario': sin ellos la FK 'ranking_snapshot_fila_mensajero_id_fkey' no  | `tests/integration/db/ranking-snapshot-migration.test.ts:803` | informe-shard-1:7601 | F5 |
| 216 | `db/reparto-manana-aviso-dedupe.test.ts` | 43973243440 | 0/0/8 | base vacia | G8 | Error: hay DATABASE_URL pero hacen falta al menos DOS usuarios en la base. Corre 'pnpm run db:seed' antes de esta suite. | `tests/integration/db/reparto-manana-aviso-dedupe.test.ts:59` | informe-shard-2:7684 | F6 |
| 217 | `db/usuario-contar-adminsatelites.test.ts` | 43973243440 | 0/2/0 | base vacia | G8 | Error: hay DATABASE_URL pero la tabla 'usuario' esta vacia: sin el catalogo de tipos de identificacion no se puede sembrar. Corre  | `tests/integration/db/usuario-contar-adminsatelites.test.ts:65` | informe-shard-3:7785 | F6 |
| 218 | `db/vista-filtro.test.ts` | 43973243440 | 0/0/8 | base vacia | G8 | AssertionError: la tabla 'usuario' esta vacia: estos casos no se pueden medir: expected null not to be null | `tests/integration/db/vista-filtro.test.ts:93` | informe-shard-3:6221 | F6 |
| 219 | `db/wallet-fecha-elegida.test.ts` | 43973243440 | 0/4/0 | base vacia | G8 | Error: la base de desarrollo no tiene ningun usuario y 'registrado_por' es una FK: sembrá al menos uno antes de correr esta suite  | `tests/integration/db/wallet-fecha-elegida.test.ts:64` | informe-shard-2:10236 | F5 |
| 220 | `db/wallet-tienda-cobro.test.ts` | 43973243440 | 0/0/13 | base vacia | G8 | Error: hay DATABASE_URL pero faltan el maestro o los catalogos 'rol.adminTienda' / 'rol.mensajero' / 'cedula': corre 'pnpm run db: | `tests/integration/db/wallet-tienda-cobro.test.ts:79` | informe-shard-1:7652 | F5 |
| 221 | `db/webhook-suscripcion-circuito-migracion.test.ts` | 43973243440 | 14/3/0 | base vacia | G8 | AssertionError: no hay ni un 'usuario' en la base: el caso no midio nada: expected null not to be null | `tests/integration/db/webhook-suscripcion-circuito-migracion.test.ts:220` | informe-shard-3:8711 | F6 |
| 222 | `db/whatsapp-envio-idempotencia-programado.test.ts` | 43973243440 | 0/0/4 | base vacia | G8 | Error: 474: hacen falta dos usuarios en la base de test | `tests/integration/db/whatsapp-envio-idempotencia-programado.test.ts:31` | informe-shard-3:6272 | F6 |
| 223 | `repositories/financiera-cubo-temporal.integration.test.ts` | 43973243440 | 5/2/0 | base vacia | G8 | Error: no hay ningun usuario en la base: la FK no se puede cumplir | `tests/integration/repositories/financiera-cubo-temporal.integration.test.ts:309` | informe-shard-2:8378 | F5 |
| 224 | `db/wallet-cierres-selector.test.ts` | 43973243440 | 0/8/0 | base vacia | G9 | PrismaClientKnownRequestError: | `tests/integration/db/wallet-cierres-selector.test.ts:81` | informe-shard-3:8452 | F7 |
| 225 | `db/wallet-etiqueta-historial-458.test.ts` | 43973243440 | 1/1/0 | base vacia | G9 | Error: base sin sembrar: falta una zona | `tests/integration/db/wallet-etiqueta-historial-458.test.ts:103` | informe-shard-3:8676 | F7 |
| 226 | `db/wallet-origen-legible.test.ts` | 43973243440 | 0/1/0 | base vacia | G9 | Error: base sin sembrar: faltan zona u orden | `tests/integration/db/wallet-origen-legible.test.ts:52` | informe-shard-3:8693 | F7 |
| 227 | `repositories/dinero-productos.int.test.ts` | 43973243440 | 0/0/22 | base vacia | G9 | Error: sin 'zona' sembrada no se puede crear el cierre del test | `tests/integration/repositories/dinero-productos.int.test.ts:790` | informe-shard-1:7694 | F7 |
| 228 | `db/cierre-aprobar-el-mas-viejo-desbloquea.test.ts` | 43973243440 | 0/1/0 | otra causa | dato-ajeno | DriverAdapterError: referencia a otra empresa: cierre_dia.destino_zona_id -> zona — 'fksDeOrden' (:122) devolvio una orden de OTRA empresa; el trigger misma-empresa (SL017) rechaza 'cierre_dia.destino_zona_id' | `(sin frame del repo; ver causa)` | informe-shard-3:6719 | F1 |
| 229 | `db/cierre-descarga-fechas-sql-real.test.ts` | 43973243440 | 0/3/0 | otra causa | dato-ajeno | DriverAdapterError: referencia a otra empresa: cierre_dia.destino_zona_id -> zona — 'fksDeOrden' (:77) devolvio una orden de OTRA empresa; el trigger misma-empresa (SL017) rechaza 'cierre_dia.destino_zona_id' | `(sin frame del repo; ver causa)` | informe-shard-3:6719 | F1 |
| 230 | `db/detalle-movimiento-cierre-postgres.test.ts` | 43973243440 | 0/14/0 | otra causa | dato-ajeno | DriverAdapterError: referencia a otra empresa: cierre_dia.destino_zona_id -> zona — lee la primera orden/usuario/tarifa de la base (:237-248); en el shard habia una orden de OTRA empresa y el trigger misma-empresa (SL017) rechaza 'cierre_dia.destino_zona_id' (:268) | `(sin frame del repo; ver causa)` | informe-shard-2:8834 | LOTE* |
| 231 | `db/premio-ranking-idempotencia.test.ts` | 43973243440 | 0/17/0 | otra causa | dato-ajeno | DriverAdapterError: referencia a otra empresa: cierre_dia.destino_zona_id -> zona — 'fksDeOrden' (:83) devolvio una orden de OTRA empresa; el trigger misma-empresa (SL017) rechaza 'cierre_dia.destino_zona_id' | `(sin frame del repo; ver causa)` | informe-shard-2:8834 | LOTE* |
| 232 | `repositories/historico-conversaciones.int.test.ts` | 43973243440 | 0/0/27 | otra causa | dato-ajeno | DriverAdapterError: referencia a otra empresa: orden.zona_id -> zona — 'tx.zona.findFirst' (:636) devolvio una zona de OTRA empresa; el trigger misma-empresa (SL017) rechaza 'orden.zona_id' | `(sin frame del repo; ver causa)` | informe-shard-2:7309 | F7 |
| 233 | `db/vista-filtro-migration.test.ts` | 43973243440 | 20/6/0 | otra causa | down-sql | AssertionError: 20261022130100_organizacion_id_en_negocio fue tocado: expected '-- DOWN (SL-17 M2) — revierte  — '20261022130100_organizacion_id_en_negocio/down.sql' contiene 'vista_filtro' y el test exige que ningun down.sql anterior lo nombre (:159) | `tests/integration/db/vista-filtro-migration.test.ts:159` | informe-shard-3:7821 | F10 |
| 234 | `db/wallet-458-migration.test.ts` | 43973243440 | 5/3/0 | otra causa | enum-orden | AssertionError: expected [ 'egreso_reverso_fulfillment', …(1) ] to deeply equal [ …(2) ] — el orden de etiquetas de 'wallet_movimiento_categoria' ya no termina en los dos valores de la 458 (deep equal, :101): migraciones posteriores anadieron valores | `tests/integration/db/wallet-458-migration.test.ts:101` | informe-shard-1:8663 | F10 |
| 235 | `db/analytics-daily-job.test.ts` | 43973243440 | 28/1/0 | otra causa | estado-retirado | Error: el catalogo local no tiene el estatus "en_fulfillment" — usa el estatus 'en_fulfillment', retirado del catalogo por la 155: una base nueva no lo tiene (_semilla-rollup.ts:85) | `tests/integration/db/_semilla-rollup.ts:85` | informe-shard-2:8453 | F9 |
| 236 | `db/satelite-bodega-alcance-real.test.ts` | 43973243440 | 0/4/0 | otra causa | estado-retirado | Error: el catalogo local no tiene el estatus ayuda_tienda — usa el estatus 'ayuda_tienda', retirado del catalogo por la 454 ('ORDER_STATUS_RETIRADOS'): una base nueva no lo tiene (:178) | `tests/integration/db/satelite-bodega-alcance-real.test.ts:178` | informe-shard-2:9955 | F9 |
| 237 | `db/historial-accion-migration.test.ts` | 43973243440 | 10/2/0 | otra causa | policies-sl17 | AssertionError: expected [ Array(1) ] to deeply equal [] — R8 espera 0 policies en 'historial_accion' y hay 1 (expected [ Array(1) ] to deeply equal [], :90): la RLS por empresa de SL-17 anadio policies | `tests/integration/db/historial-accion-migration.test.ts:90` | informe-shard-3:7205 | F10 |
| 238 | `db/postulacion-recurso-migration.test.ts` | 43973243440 | 23/9/0 | otra causa | policies-sl17 | AssertionError: expected 1 to be +0 // Object.is equality — R22 espera 0 policies en 'postulacion_recurso' y hay 1 (expected 1 to be +0, :261): la RLS por empresa de SL-17 anadio policies | `tests/integration/db/postulacion-recurso-migration.test.ts:261` | informe-shard-2:9695 | F10 |
| 239 | `db/aporte-capital.test.ts` | 43973243440 | 0/5/0 | otra causa | sin-empresa | Error: aporte-capital: AppErrorCode inesperado INTERNAL — la action corre sin empresa en contexto: 'EmpresaNoResuelta: Sin empresa en contexto para WalletMovimiento.aggregate' (lib/db/extension-empresa.ts:206, stderr del log) -> AppErrorCode INTERNAL en lib/actions/aporte-capital.ts:70 | `toActionError lib/actions/aporte-capital.ts:70` | informe-shard-1:8118 | F8 |

## Reparto propuesto por destino (listas exactas)

`LOTE` = lote de esta ficha. `LOTE*` = lote si Carlos acepta la excepción «dato ajeno» (ver `progress/impl_SLT-177.md`). `F1`-`F10` = borradores de fichas siguientes de `progress/impl_SLT-177.md`.

### F1 — 17 entradas (7808 lineas de archivo)
- `tests/integration/db/cierre-aprobacion-libera-solo-lo-suyo.test.ts` (246 l., base vacia, G7)
- `tests/integration/db/cierre-aprobar-el-mas-viejo-desbloquea.test.ts` (277 l., otra causa, dato-ajeno)
- `tests/integration/db/cierre-bloqueo-nv-sql-real.test.ts` (797 l., base vacia, G7)
- `tests/integration/db/cierre-descarga-fechas-sql-real.test.ts` (279 l., otra causa, dato-ajeno)
- `tests/integration/db/cierre-descarga-intentos-entrega-sql-real.test.ts` (410 l., base vacia, G7)
- `tests/integration/db/cierre-excluye-gestiones-de-escritorio.test.ts` (474 l., base vacia, G7)
- `tests/integration/db/cierre-rechazado-aviso-dedupe.test.ts` (417 l., base vacia, G7)
- `tests/integration/db/cierre-rechazado-jornada-sql-real.test.ts` (226 l., base vacia, G7)
- `tests/integration/db/cierre-rechazo-tienda-aprobacion.test.ts` (935 l., base vacia, G7)
- `tests/integration/db/cierre-rechazo-tienda-sql-real.test.ts` (523 l., base vacia, G7)
- `tests/integration/db/cierre-rechazo-tienda-totales.test.ts` (422 l., base vacia, G7)
- `tests/integration/db/cierre-segundo-vincula-solo-lo-suyo.test.ts` (220 l., base vacia, G7)
- `tests/integration/db/cierre-sin-gestion-sql-real.test.ts` (412 l., base vacia, G7)
- `tests/integration/db/cierre-sin-gestion-tope-sql-real.test.ts` (630 l., base vacia, G7)
- `tests/integration/db/cierres-admin-retornables-sql-real.test.ts` (280 l., base vacia, G7)
- `tests/integration/db/cierres-filtro-estado-sql-real.test.ts` (368 l., base vacia, G7)
- `tests/integration/db/corte-diario-segundo-cierre-sql-real.test.ts` (892 l., base vacia, G7)

### F10 — 4 entradas (2103 lineas de archivo)
- `tests/integration/db/historial-accion-migration.test.ts` (376 l., otra causa, policies-sl17)
- `tests/integration/db/postulacion-recurso-migration.test.ts` (675 l., otra causa, policies-sl17)
- `tests/integration/db/vista-filtro-migration.test.ts` (649 l., otra causa, down-sql)
- `tests/integration/db/wallet-458-migration.test.ts` (403 l., otra causa, enum-orden)

### F2 — 15 entradas (8908 lineas de archivo)
- `tests/integration/db/correccion-dia-reparto-efectos.int.test.ts` (726 l., base vacia, G7)
- `tests/integration/db/correccion-dia-reparto-historial.int.test.ts` (540 l., base vacia, G7)
- `tests/integration/db/correccion-dia-reparto.int.test.ts` (726 l., base vacia, G7)
- `tests/integration/db/correccion-fecha-reprogramacion.int.test.ts` (744 l., base vacia, G7)
- `tests/integration/db/correccion-resultado-gestion.int.test.ts` (957 l., base vacia, G7)
- `tests/integration/db/corregir-datos-cliente.repo.test.ts` (833 l., base vacia, G7)
- `tests/integration/db/corregir-ubicacion-geocode.test.ts` (360 l., base vacia, G7)
- `tests/integration/db/deshacer-asignacion-zona-satelite.int.test.ts` (314 l., base vacia, G7)
- `tests/integration/db/deshacer-gestion-conserva-reserva.int.test.ts` (316 l., base vacia, G7)
- `tests/integration/db/gestion-desde-ayuda-dia-reserva.int.test.ts` (327 l., base vacia, G7)
- `tests/integration/db/gestiones-detalle-api-405.test.ts` (638 l., base vacia, G7)
- `tests/integration/db/novedades-sin-gestionar-aviso-dedupe.test.ts` (315 l., base vacia, G7)
- `tests/integration/db/recoger-lote-dia-reserva.int.test.ts` (309 l., base vacia, G7)
- `tests/integration/db/reparto-manana-repository.test.ts` (569 l., base vacia, G7)
- `tests/integration/db/traspaso-mensajero.int.test.ts` (1234 l., base vacia, G7)

### F3 — 15 entradas (5560 lineas de archivo)
- `tests/integration/db/486-evidencias-cierres-sql-real.test.ts` (372 l., base vacia, G7)
- `tests/integration/db/api-key-eliminabilidad.test.ts` (320 l., base vacia, G7)
- `tests/integration/db/api-key-eliminar-fk-inesperada.test.ts` (254 l., base vacia, G7)
- `tests/integration/db/api-key-eliminar-tienda-destino.test.ts` (219 l., base vacia, G7)
- `tests/integration/db/eliminar-orden-api-frontera-tienda.test.ts` (204 l., base vacia, G7)
- `tests/integration/db/eliminar-orden-pantalla-frontera-tienda.test.ts` (329 l., base vacia, G7)
- `tests/integration/db/emisor-relaciones-anidadas.test.ts` (315 l., base vacia, G7)
- `tests/integration/db/historial-accion-atomicidad.test.ts` (802 l., base vacia, G7)
- `tests/integration/db/historial-accion-lectura.test.ts` (636 l., base vacia, G7)
- `tests/integration/db/historial-accion-q1-ubicacion.test.ts` (294 l., base vacia, G7)
- `tests/integration/db/notificacion-bloqueo-otro-cierre-avisa.test.ts` (213 l., base vacia, G7)
- `tests/integration/db/orden-eliminada-actor-admin.test.ts` (314 l., base vacia, G7)
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts` (403 l., base vacia, G7)
- `tests/integration/db/orden-traspaso-migration.test.ts` (511 l., base vacia, G7)
- `tests/integration/db/tarifa-zona-borrado-fk-real.test.ts` (374 l., base vacia, G7)

### F4 — 14 entradas (5645 lineas de archivo)
- `tests/integration/db/aviso-agregado-repository.test.ts` (553 l., base vacia, G7)
- `tests/integration/db/busqueda-comportamiento.test.ts` (511 l., base vacia, G7)
- `tests/integration/db/busqueda-normalizacion-paridad.test.ts` (272 l., base vacia, G7)
- `tests/integration/db/busqueda-sincronizacion-columna.test.ts` (253 l., base vacia, G7)
- `tests/integration/db/busqueda-usa-indice.test.ts` (389 l., base vacia, G7)
- `tests/integration/db/costo-y-zona-api-415.test.ts` (626 l., base vacia, G7)
- `tests/integration/db/liberacion-al-aprobar-cierre-real.test.ts` (379 l., base vacia, G7)
- `tests/integration/db/liberacion-reprogramada-cierre-real.test.ts` (368 l., base vacia, G7)
- `tests/integration/db/push-canal-restricciones.test.ts` (343 l., base vacia, G7)
- `tests/integration/db/push-destinatarios-equivalencia.test.ts` (426 l., base vacia, G7)
- `tests/integration/db/rechazo-tienda-cobro.int.test.ts` (475 l., base vacia, G7)
- `tests/integration/db/usuario-preferencia.test.ts` (518 l., base vacia, G7)
- `tests/integration/db/wallet-anulacion-concurrencia.test.ts` (171 l., base vacia, G7)
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts` (361 l., base vacia, G7)

### F5 — 15 entradas (7151 lineas de archivo)
- `tests/integration/actions/analitica-financiera-action.test.ts` (777 l., base vacia, G8)
- `tests/integration/db/cierre-bodega-conciliacion.int.test.ts` (399 l., base vacia, G8)
- `tests/integration/db/cierre-bodega-resumen-pendientes.test.ts` (264 l., base vacia, G8)
- `tests/integration/db/consolidacion-concurrente.int.test.ts` (331 l., base vacia, G8)
- `tests/integration/db/corregir-conciliacion.int.test.ts` (401 l., base vacia, G8)
- `tests/integration/db/gasto-fijo-cobro-aprobacion.test.ts` (729 l., base vacia, G8)
- `tests/integration/db/gasto-fijo-cobro-idempotencia.test.ts` (526 l., base vacia, G8)
- `tests/integration/db/gasto-fijo-cobro-migration.test.ts` (335 l., base vacia, G8)
- `tests/integration/db/marca-conciliacion.int.test.ts` (376 l., base vacia, G8)
- `tests/integration/db/mi-wallet-cierres-alcance.test.ts` (222 l., base vacia, G8)
- `tests/integration/db/premio-ranking-devengo-migration.test.ts` (586 l., base vacia, G8)
- `tests/integration/db/ranking-snapshot-migration.test.ts` (1014 l., base vacia, G8)
- `tests/integration/db/wallet-fecha-elegida.test.ts` (299 l., base vacia, G8)
- `tests/integration/db/wallet-tienda-cobro.test.ts` (538 l., base vacia, G8)
- `tests/integration/repositories/financiera-cubo-temporal.integration.test.ts` (354 l., base vacia, G8)

### F6 — 15 entradas (5978 lineas de archivo)
- `tests/integration/db/api-key-eliminar.test.ts` (381 l., base vacia, G8)
- `tests/integration/db/asistente-uso-diario.int.test.ts` (380 l., base vacia, G8)
- `tests/integration/db/cobertura-repository.test.ts` (341 l., base vacia, G8)
- `tests/integration/db/geografia-cascada-reversible.test.ts` (298 l., base vacia, G8)
- `tests/integration/db/geografia-registro-accion.test.ts` (465 l., base vacia, G8)
- `tests/integration/db/geografia-renombrado.test.ts` (415 l., base vacia, G8)
- `tests/integration/db/notificacion-evento-cierre-rechazado-migration.test.ts` (569 l., base vacia, G8)
- `tests/integration/db/notificacion-evento-geocodificacion-caida-migration.test.ts` (707 l., base vacia, G8)
- `tests/integration/db/notificacion-evento-reparto-manana-migration.test.ts` (603 l., base vacia, G8)
- `tests/integration/db/notificacion-evento-traspaso-migration.test.ts` (563 l., base vacia, G8)
- `tests/integration/db/reparto-manana-aviso-dedupe.test.ts` (372 l., base vacia, G8)
- `tests/integration/db/usuario-contar-adminsatelites.test.ts` (159 l., base vacia, G8)
- `tests/integration/db/vista-filtro.test.ts` (288 l., base vacia, G8)
- `tests/integration/db/webhook-suscripcion-circuito-migracion.test.ts` (318 l., base vacia, G8)
- `tests/integration/db/whatsapp-envio-idempotencia-programado.test.ts` (119 l., base vacia, G8)

### F7 — 17 entradas (6695 lineas de archivo)
- `tests/integration/db/chat-entrante-telefono-cr.test.ts` (264 l., base vacia, G7b)
- `tests/integration/db/confirmacion-fisica-migration.test.ts` (363 l., base vacia, G10)
- `tests/integration/db/corregir-datos-cliente.chat.test.ts` (247 l., base vacia, G7b)
- `tests/integration/db/geografia-historico-intacto.test.ts` (198 l., base vacia, G7b)
- `tests/integration/db/geografia-ordenes-sin-entregar.test.ts` (242 l., base vacia, G7b)
- `tests/integration/db/habilitacion-api-migration.test.ts` (721 l., base vacia, G7b)
- `tests/integration/db/orden-mensajero-meta-drop-nota-migration.test.ts` (517 l., base vacia, G7b)
- `tests/integration/db/orden-nota-migration.test.ts` (536 l., base vacia, G7b)
- `tests/integration/db/wallet-cierres-selector.test.ts` (286 l., base vacia, G9)
- `tests/integration/db/wallet-etiqueta-historial-458.test.ts` (182 l., base vacia, G9)
- `tests/integration/db/wallet-origen-legible.test.ts` (154 l., base vacia, G9)
- `tests/integration/repositories/chat-media-autorizada.int.test.ts` (210 l., base vacia, G7b)
- `tests/integration/repositories/chat-media-historico.int.test.ts` (223 l., base vacia, G7b)
- `tests/integration/repositories/conteo-productos.int.test.ts` (306 l., base vacia, G7b)
- `tests/integration/repositories/dinero-productos.int.test.ts` (933 l., base vacia, G9)
- `tests/integration/repositories/historico-conversaciones.int.test.ts` (1006 l., otra causa, dato-ajeno)
- `tests/integration/repositories/orden-nota.int.test.ts` (307 l., base vacia, G7b)

### F8 — 1 entradas (294 lineas de archivo)
- `tests/integration/db/aporte-capital.test.ts` (294 l., otra causa, sin-empresa)

### F9 — 2 entradas (1644 lineas de archivo)
- `tests/integration/db/analytics-daily-job.test.ts` (1183 l., otra causa, estado-retirado)
- `tests/integration/db/satelite-bodega-alcance-real.test.ts` (461 l., otra causa, estado-retirado)

### LOTE* — 2 entradas (1972 lineas de archivo)
- `tests/integration/db/detalle-movimiento-cierre-postgres.test.ts` (889 l., otra causa, dato-ajeno)
- `tests/integration/db/premio-ranking-idempotencia.test.ts` (1083 l., otra causa, dato-ajeno)

### LOTE — 122 entradas (23095 lineas de archivo)
- `tests/integration/db/419/confirmar-entrega-lote-sql-real.test.ts` (340 l., base vacia, G5)
- `tests/integration/db/419/confirmar-entrega-sin-dinero-sql-real.test.ts` (154 l., base vacia, G5)
- `tests/integration/db/419/confirmar-entrega-webhook-sql-real.test.ts` (93 l., base vacia, G5)
- `tests/integration/db/454/aplicacion-al-aprobar-sql-real.test.ts` (336 l., base vacia, G1)
- `tests/integration/db/454/ayuda-abierta-sql-real.test.ts` (187 l., base vacia, G1)
- `tests/integration/db/454/ayuda-evento-sql-real.test.ts` (222 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/alcance-satelite-y-sf001.test.ts` (99 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/ayuda-ciclo.test.ts` (196 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/cambio-dia.test.ts` (67 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/cierre-rechazado.test.ts` (118 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/confirmacion-fisica-238.test.ts` (129 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/correccion-69.test.ts` (152 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/corte-concurrencia.test.ts` (128 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/corte-no-barre-gestionadas.test.ts` (135 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/deshacer.test.ts` (104 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/devolucion-rechazadas-139.test.ts` (124 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/dinero-aprobacion.test.ts` (157 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/dos-gestiones-vivas.test.ts` (114 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/intentos-conteo.test.ts` (98 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/kpi-portal.test.ts` (59 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/liberacion-por-cierre.test.ts` (85 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/multi-dia-271.test.ts` (80 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/no-doble-gestion.test.ts` (98 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/notificacion-n1.test.ts` (91 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/portal-listas-mapa-ruta.test.ts` (75 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/rastreo-y-historial-legado.test.ts` (116 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/rechazos-tienda-425.test.ts` (88 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/reprogramadas-liberacion.test.ts` (96 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/sla-devolucion-reloj.test.ts` (126 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/solicitar-cierre.test.ts` (66 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/tablero-dia.test.ts` (81 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/tope-276.test.ts` (130 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/traspaso.test.ts` (86 l., base vacia, G1)
- `tests/integration/db/454/caracterizacion/webhook-estado.test.ts` (80 l., base vacia, G1)
- `tests/integration/db/454/carga-mensajero-pendiente-sql-real.test.ts` (118 l., base vacia, G1)
- `tests/integration/db/454/cierre-bodega-sf001-sql-real.test.ts` (127 l., base vacia, G1)
- `tests/integration/db/454/correccion-ayuda-abierta-sql-real.test.ts` (87 l., base vacia, G1)
- `tests/integration/db/454/correccion-ramas-sql-real.test.ts` (162 l., base vacia, G1)
- `tests/integration/db/454/corte-excluye-pendientes-sql-real.test.ts` (121 l., base vacia, G1)
- `tests/integration/db/454/deshacer-ramas-sql-real.test.ts` (174 l., base vacia, G1)
- `tests/integration/db/454/devolucion-rechazadas-seleccion-sql-real.test.ts` (126 l., base vacia, G1)
- `tests/integration/db/454/gestion-pendiente-sql-real.test.ts` (181 l., base vacia, G1)
- `tests/integration/db/454/intentos-segunda-via-sql-real.test.ts` (124 l., base vacia, G1)
- `tests/integration/db/454/novedades-predicado-sql-real.test.ts` (113 l., base vacia, G1)
- `tests/integration/db/454/orden-evento-migration.test.ts` (278 l., base vacia, G1)
- `tests/integration/db/454/rastreo-pendiente-sql-real.test.ts` (183 l., base vacia, G1)
- `tests/integration/db/454/registro-gestion-concurrencia-sql-real.test.ts` (119 l., base vacia, G1)
- `tests/integration/db/454/registro-gestion-sin-transicion-sql-real.test.ts` (168 l., base vacia, G1)
- `tests/integration/db/454/retiro-estados-migration.test.ts` (330 l., base vacia, G1)
- `tests/integration/db/454/senales-gestion-lectores-sql-real.test.ts` (336 l., base vacia, G1)
- `tests/integration/db/454/webhook-evento-sql-real.test.ts` (146 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/api-lectura.test.ts` (249 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/dinero-aprobacion.test.ts` (184 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/filtro-ordenes-por-estado.test.ts` (119 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/filtro-satelite-por-codigo.test.ts` (128 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/intentos-y-tope.test.ts` (142 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/novedades-y-ayuda.test.ts` (107 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/plantilla-estatus.test.ts` (95 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/rastreo.test.ts` (198 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/snapshot-correccion.test.ts` (105 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/sql-crudo-avisos-y-corte.test.ts` (139 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/sql-crudo-cron-devoluciones.test.ts` (123 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/sql-crudo-tablero-dia.test.ts` (97 l., base vacia, G1)
- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts` (200 l., base vacia, G1)
- `tests/integration/db/455/interruptor-codigos.test.ts` (58 l., base vacia, G1)
- `tests/integration/db/455/migracion.test.ts` (439 l., base vacia, G1)
- `tests/integration/db/455/rastreo-retirado-y-pendiente-sql-real.test.ts` (231 l., base vacia, G1)
- `tests/integration/db/455/snapshot-lectura.test.ts` (86 l., base vacia, G1)
- `tests/integration/db/462/reprogramadas-retenidas-sql-real.test.ts` (606 l., base vacia, G1)
- `tests/integration/db/477-aprobacion-tras-correccion-sql-real.test.ts` (104 l., base vacia, G1)
- `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts` (247 l., base vacia, G1)
- `tests/integration/db/477-ordenes-en-correccion-sql-real.test.ts` (144 l., base vacia, G1)
- `tests/integration/db/477-regestionar-sin-cierre-sql-real.test.ts` (123 l., base vacia, G1)
- `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts` (268 l., base vacia, G1)
- `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts` (251 l., base vacia, G1)
- `tests/integration/db/484-puntero-corte-sql-real.test.ts` (195 l., base vacia, G1)
- `tests/integration/db/484-puntero-incidente-blst765.test.ts` (146 l., base vacia, G1)
- `tests/integration/db/484-puntero-traspaso-sql-real.test.ts` (173 l., base vacia, G1)
- `tests/integration/db/484-puntero-vigente-sql-real.test.ts` (232 l., base vacia, G1)
- `tests/integration/db/ajuste-caja-anulacion-461.test.ts` (304 l., base vacia, G2)
- `tests/integration/db/analitica-anulacion-rechazo-458.test.ts` (182 l., base vacia, G2)
- `tests/integration/db/busqueda-por-guia-469.test.ts` (543 l., base vacia, G2)
- `tests/integration/db/caja-caracterizacion-459.test.ts` (635 l., base vacia, G2)
- `tests/integration/db/caja-invariante-tiendas.test.ts` (682 l., base vacia, G2)
- `tests/integration/db/como-quedo.test.ts` (262 l., base vacia, G2)
- `tests/integration/db/detalle-en-lote-464.test.ts` (692 l., base vacia, G2)
- `tests/integration/db/efecto-movimiento-predice.test.ts` (239 l., base vacia, G2)
- `tests/integration/db/estado-cuenta-busqueda-orden-463.test.ts` (382 l., base vacia, G2)
- `tests/integration/db/estado-cuenta-cierre-pagos-172r52.test.ts` (321 l., base vacia, G2)
- `tests/integration/db/estado-cuenta-pago-tienda-172r53.test.ts` (131 l., base vacia, G2)
- `tests/integration/db/estado-cuenta-saldo-corrido.test.ts` (190 l., base vacia, G2)
- `tests/integration/db/estado-cuenta-servidor-458d.test.ts` (435 l., base vacia, G2)
- `tests/integration/db/informe-transito-catalogo-real.test.ts` (68 l., base vacia, G4)
- `tests/integration/db/informe-transito-hitos.test.ts` (142 l., base vacia, G4)
- `tests/integration/db/informe-transito-parados.test.ts` (72 l., base vacia, G4)
- `tests/integration/db/informe-transito-seleccion.test.ts` (107 l., base vacia, G4)
- `tests/integration/db/informe-transito-zonas.test.ts` (89 l., base vacia, G4)
- `tests/integration/db/kardex-cuentas-468.test.ts` (113 l., base vacia, G2)
- `tests/integration/db/libro-caja-a-quien.test.ts` (196 l., base vacia, G2)
- `tests/integration/db/libro-caja-busqueda-orden-463.test.ts` (321 l., base vacia, G2)
- `tests/integration/db/libro-caja-filtro-a-quien.test.ts` (586 l., base vacia, G2)
- `tests/integration/db/libro-caja-revision-458c.test.ts` (223 l., base vacia, G2)
- `tests/integration/db/libro-caja-revision-458e.test.ts` (223 l., base vacia, G2)
- `tests/integration/db/libro-kardex-468.test.ts` (311 l., base vacia, G2)
- `tests/integration/db/liquidacion-fechas-cr-461.test.ts` (141 l., base vacia, G2)
- `tests/integration/db/mi-wallet-resumen-458d.test.ts` (160 l., base vacia, G2)
- `tests/integration/db/picking-ordenes-en-preparacion.test.ts` (171 l., base vacia, G6)
- `tests/integration/db/picking-resumen-tiendas.test.ts` (102 l., base vacia, G6)
- `tests/integration/db/saldos-tiendas-busqueda-463.test.ts` (172 l., base vacia, G2)
- `tests/integration/db/wallet-461-idempotencia-clave.test.ts` (201 l., base vacia, G2)
- `tests/integration/db/wallet-anulacion-458.test.ts` (389 l., base vacia, G2)
- `tests/integration/db/wallet-caracterizacion-458.test.ts` (342 l., base vacia, G2)
- `tests/integration/db/wallet-comprobante-alcance.test.ts` (299 l., base vacia, G2)
- `tests/integration/db/wallet-documento-comprobante-458.test.ts` (267 l., base vacia, G2)
- `tests/integration/db/wallet-registro-comprobante-458.test.ts` (389 l., base vacia, G2)
- `tests/integration/db/whatsapp-envio-defaults.test.ts` (112 l., base vacia, G3)
- `tests/integration/db/whatsapp-envio-ejecucion-admintienda.test.ts` (119 l., base vacia, G3)
- `tests/integration/db/whatsapp-envio-entrega-estado-webhook.test.ts` (71 l., base vacia, G3)
- `tests/integration/db/whatsapp-envio-entrega-reclamo.test.ts` (88 l., base vacia, G3)
- `tests/integration/db/whatsapp-envio-historial.test.ts` (90 l., base vacia, G3)
- `tests/integration/db/whatsapp-envio-prueba-limite.test.ts` (47 l., base vacia, G3)
- `tests/integration/db/whatsapp-envio-resolver-destinatarios.test.ts` (94 l., base vacia, G3)

