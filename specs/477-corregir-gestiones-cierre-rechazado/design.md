# 477 — Corregir las gestiones de un cierre rechazado — Diseño

> **Sin migración ni cambio de `db/schema.prisma`.** Sí toca dinero (snapshots y totales de
> `cierre_dia`, `pago_mensajero`/`ingreso_bodega_rechazo` de `gestion_orden`, filas de
> `cierre_detail`): el gate `--rapido` se amplía solo con `tests/integration/db`.
> Las búsquedas de este spec se hicieron con `Grep`/`Read`: el MCP `codebase-memory` no estaba en
> el conjunto de herramientas del agente que lo escribió. Cada afirmación cita archivo:línea
> medida en el árbol `4d2248c5`.

## 1. Lo medido (respuestas a las preguntas del leader)

### 1.1 ¿El bloqueo N/V frena el deshacer? — SÍ, y también el volver a gestionar

- La regla: `estaBloqueadoPorCierres(c) = c.n >= 2 || c.v >= 1` (`lib/utils/bloqueo-cierre.ts:73-75`),
  con `rechazado` dentro de los re-solicitables (`:41-44`). Un cierre rechazado da `V = 1`, así que
  el mensajero con un rechazado está **siempre** bloqueado.
- `deshacerGestion` corta en la guarda 1, ANTES de leer la gestión
  (`lib/services/CierreDiaService.ts:688-691`). Aunque se quitara, la guarda 4
  (`gestion.cierreId !== null`, `:751`) y el `WHERE cierreId: null` de `anularGestionPendiente`
  (`lib/repositories/CierreDiaRepository.ts:1478`) también lo impiden.
- Volver a gestionar tampoco se puede hoy: `escogerParaGestion` (`lib/services/MisAsignacionesService.ts:523-526`)
  y `gestionar` (`:563-566`) cortan con el mismo motivo; y la pantalla de Entregas deshabilita
  TODAS las tarjetas con el mensajero bloqueado (`app/(app)/mis-asignaciones/_components/RepartoModule.tsx:415-435, 489-514`).
- **Resolución:** la exención va POR OBJETO, no por mensajero. El mensajero sigue bloqueado; lo
  único que se le abre es (i) deshacer una *gestión corregible* y (ii) escoger/gestionar una
  *orden en corrección* (glosario de `requirements.md`). Todo lo demás conserva el bloqueo (R5, R13).

### 1.2 ¿La aprobación lee las gestiones vivas o el snapshot? — LAS DOS COSAS, según el feed

| Qué se emite al aprobar | De dónde lo lee | Cita |
|---|---|---|
| Ingresos Ordenex (`wallet_movimiento` caja) | gestiones `WHERE cierre_id = X` **sin filtrar anuladas** × `cierre_detail` por orden (aborta si falta la fila) | `lib/services/WalletFeedService.ts:68-79` |
| Ledger por tienda (`wallet_tienda_movimiento`) | gestiones `WHERE cierre_id = X` **sin filtrar anuladas** × `cierre_detail` | `lib/services/WalletTiendaFeedService.ts:102-105` |
| COD a caja | el ledger recién escrito | `lib/repositories/CierresAdminRepository.ts:1890-1900` |
| Pago al mensajero (`pago_mensajero_movimiento`) + egreso caja | SNAPSHOT `cierre_dia.total_pago_mensajero` y `total_efectivo` | `lib/services/WalletMensajeroFeedService.ts:31-43` |
| Indemnización | gestiones `incidente` `WHERE cierre_id = X` sin filtrar anuladas | `lib/services/WalletIndemnizacionFeedService.ts:29-32` |
| Transición de las órdenes (454) | gestiones VIVAS `cierre_id = X AND anulada_at IS NULL` con evento | `lib/repositories/CierresAdminRepository.ts:2167-2192` |

Consecuencias que fijan el diseño:

1. Los tres feeds que leen `where: { cierreId }` **confían en el invariante «`cierre_id` ⇒ vigente»**
   (lo escribe `crearCierre`, `CierreDiaRepository.ts:1046-1052` y `:1177-1178`). Una gestión
   anulada que conservara su `cierre_id` se COBRARÍA. ⇒ **al anular hay que desvincular**
   (`cierre_id` NULL) (D1).
2. El pago al mensajero sale de los totales snapshot del cierre, no de las gestiones ⇒ **hay que
   recalcular los seis totales** al cambiar el conjunto de gestiones del cierre (D3, D5).
3. `cierre_detail` aporta las entradas de la fórmula POR ORDEN. La gestión que sustituye a la
   anulada es de la MISMA orden, así que su fila ya existe y sigue valiendo (misma orden, misma
   tarifa congelada al solicitar). Solo sobran las filas de órdenes que se quedan sin gestión (D6).

### 1.3 Intentos — no cambia nada

`whereIntentosVigentes` (`lib/repositories/OrdenHistorialRepository.ts:197-214`) exige
`anulada_at IS NULL`, `cierre_id IS NOT NULL` y `cierre.estado = aprobado`, y el grano es el par
(orden, cierre) (`CierresAdminRepository.ts:2019-2029`). La anulada queda fuera por dos
condiciones; la nueva cuenta uno al aprobarse su cierre. Un rechazado no suma nunca. R24 se
cumple sin tocar el predicado; solo se añade el test que lo afirma.

### 1.4 Qué ve hoy el mensajero

`/cierre-dia` (`app/(app)/cierre-dia/_components/CierreDiaModule.tsx`): aviso de bloqueo
(`:646-653`), sección «Cierre rechazado» con UN botón de re-solicitar (`:685-700`) y la copia
«No se recalculan los montos ya registrados» (`:217-218`). El detalle del cierre es un modal de
solo lectura con el comprobante compartido con el admin (`:939-1000`). «Deshacer» existe solo en
las tablas del día, que listan gestiones con `cierre_id IS NULL` (`:1154-1186`). ⇒ el botón va en
un panel nuevo **dentro de la sección «Cierre rechazado»** (D8), no en el comprobante compartido.

### 1.5 ¿Mismo cierre o uno nuevo?

La gestión rehecha nace con `cierre_id` NULL (R14, igual que hoy). Entra en el MISMO cierre al
re-solicitarlo, porque la re-solicitud la vincula acotando por las órdenes en corrección de ESE
cierre (D5). Si el corte nocturno llega antes de la re-solicitud, el corte se la lleva a un
`vencido` nuevo (`CorteDiarioRepository.ts:101-152`): coherente en dinero y declarado como
Pregunta abierta 1.

## 2. Decisiones

- **D1 — Anular en cierre = anular + desvincular.** La escritura pone `anulada_at`, `anulada_por`,
  `cierre_id = NULL`, `pago_mensajero = NULL`, `ingreso_bodega_rechazo = NULL`. Mantiene vivo el
  invariante del que dependen los tres feeds (§1.2) sin tocar ninguno. El rastro de a qué cierre
  pertenecía queda en la fila de `cierre_detail` (hasta re-solicitar) y en el evento
  `gestion_anulada`; el rastro de quién y cuándo, en `anulada_por`/`anulada_at`.
- **D2 — Un solo predicado de «orden en corrección»**, en SQL crudo y en un módulo nuevo
  `lib/repositories/correccion-cierre.ts` (patrón `gestion-pendiente.ts`):

  ```sql
  SELECT cd.orden_id, cd.cierre_id
    FROM cierre_detail cd
    JOIN cierre_dia c ON c.id = cd.cierre_id
   WHERE c.mensajero_id = $mensajero
     AND c.estado = 'rechazado'
     AND NOT EXISTS (SELECT 1 FROM gestion_orden g
                      WHERE g.cierre_id = cd.cierre_id
                        AND g.orden_id  = cd.orden_id
                        AND g.anulada_at IS NULL)
     [AND cd.orden_id = ANY($ordenes)] [AND cd.cierre_id = $cierre]
  ```

  La correlación `g.cierre_id = cd.cierre_id` no es expresable como filtro de relación de Prisma;
  por eso SQL. Usa los índices existentes `cierre_detail(cierre_id, orden_id)` (único),
  `cierre_dia(mensajero_id, estado)` y `gestion_orden(cierre_id)`. Lo consumen: la exención de
  gestionar/escoger, el listado de Entregas, la exención del deshacer caso (b), la re-solicitud y la
  pantalla de cierre del día. Antes de la 477 el conjunto es vacío: ninguna vía deja una fila de
  `cierre_detail` sin gestión vigente (la anulación exigía `cierre_id IS NULL` y la corrección de
  la 398 corrige en sitio, `CierresAdminRepository.ts:1573-1576`).
- **D3 — El deshacer recalcula el cierre en la misma transacción** (R3). Así el comprobante del
  cierre rechazado nunca muestra totales de gestiones que ya no tiene. Se recalcula con
  `computeTotales` (los cuatro del recaudo) y `sumarSnapshotsCongelados` (pago e ingreso), sobre
  `cierre_id = X AND anulada_at IS NULL` — el MISMO cálculo que ya usa la 398
  (`CierresAdminRepository.ts:1735-1770`), nunca `derivarPagos`, que re-derivaría con la tarifa de
  hoy las gestiones que nadie tocó.
- **D4 — Exención del bloqueo con lectura previa, sin filtrar información.** En
  `deshacerGestion`, si `bloqueo.bloqueado`, se lee la gestión y solo se continúa si es
  corregible; en cualquier otro caso se devuelve EXACTAMENTE el `conflict` de bloqueo de hoy (la
  misma respuesta para inexistente, ajena o no corregible: R5). En `escogerParaGestion` y
  `gestionar`, si hay bloqueo se pregunta `esOrdenEnCorreccion(actor, ordenId)` y solo entonces se
  sigue a `cargarOrdenGestionable` y al resto de guardas, intactas.
- **D5 — Re-solicitud de un `rechazado` en una transacción propia** (R15-R20, R22). Pasos, con el
  orden que importa:
  1. `SELECT … FROM cierre_dia WHERE id = X FOR UPDATE` (candado, ver §4);
  2. `updateMany` `rechazado → solicitado` guardado por `id` y `estado` (anti-TOCTOU de hoy);
     0 filas ⇒ rollback ⇒ `false`;
  3. vincular: `gestionesDelCierreWhere(mensajero)` **AND** `orden_id IN (órdenes en corrección de X)`,
     `data: { cierreId: X }` — se reutiliza el predicado de pertenencia SIN modificarlo y se
     estrecha con D2 (R16);
  4. congelar `pago_mensajero`/`ingreso_bodega_rechazo` de las recién vinculadas con
     `pagoPorResultado`/`ingresoBodegaPorResultado` y la tarifa que el servicio resolvió
     (zona destino del cierre + vehículo del mensajero) (R17);
  5. borrar las filas de `cierre_detail` de X sin gestión vigente vinculada (R18);
  6. recalcular los seis totales como en D3 (R19).
  Sin correcciones, los pasos 3 y 5 no tocan filas y el paso 6 escribe los mismos valores (la suma
  de los snapshots congelados es por construcción el total congelado): R20. El `vencido` sigue por
  `transicionarASolicitado` sin cambios (R21).
- **D6 — Las filas de `cierre_detail` de las órdenes rehechas se conservan**, no se regeneran: es
  la misma orden y la fila guarda las entradas de la orden y la tarifa de la tienda congeladas al
  solicitar por primera vez. Regenerarlas cambiaría el flete de un cierre por re-enviarlo.
- **D7 — Solo la rama nueva (454).** Una gestión legada vinculada al rechazado se rechaza con el
  motivo de hoy (R10): su orden ya transicionó al registrarse y deshacerla exigiría las aristas de
  la rama legada, que la 454 tiene en retirada.
- **D8 — UI mínima, sin pantalla nueva** (no aplica `/design`): un panel «Corregir gestiones»
  dentro de la sección «Cierre rechazado» existente, con las gestiones vigentes del cierre (mismas
  columnas que las tablas del día y el mismo modal/acción `deshacerGestion`) y la lista de órdenes
  en corrección con su estado y un enlace a Entregas. En Entregas, la tarjeta con
  `enCorreccion: true` no se deshabilita por bloqueo.

## 3. Modelo de datos

Sin migración, sin columnas, sin índices, sin RLS nueva. Escrituras nuevas sobre tablas
existentes:

| Tabla | Escritura | Dónde |
|---|---|---|
| `gestion_orden` | anular + `cierre_id`/`pago_mensajero`/`ingreso_bodega_rechazo` a NULL, guardado | `anularGestionDeCierreRechazado` |
| `gestion_orden` | vincular + congelar pago/ingreso de las rehechas | `resolicitarCierreRechazado` |
| `cierre_dia` | seis totales recalculados; `estado` `rechazado → solicitado` | ambos métodos |
| `cierre_detail` | `deleteMany` de filas sin gestión vigente, solo de un cierre `rechazado` del mensajero | `resolicitarCierreRechazado` |
| `orden_evento` + cola de webhooks | `gestion_anulada` | `anularGestionDeCierreRechazado` |

`cierre_detail` no tiene FKs entrantes (medido en `db/schema.prisma`: solo relaciones salientes a
cierre/orden/zona/tienda/tarifa), así que el `deleteMany` no arrastra nada.

La guardia estructural de la Feature 69/R10 (`tests/unit/repositories/cierre-detail-inmutable.test.ts`)
lleva una excepción acotada para este borrado (483): exactamente UNA ocurrencia de
`cierreDetail.deleteMany(` en `lib/repositories/CierreDiaRepository.ts`; cualquier otra mutación
de `cierre_detail` sigue en rojo.

## 4. Concurrencia

El deshacer (D1) y la re-solicitud (D5) compiten por el mismo cierre. Sin orden, el deshacer
podría confirmarse DESPUÉS de que la re-solicitud recalculara los totales: el cierre quedaría
`solicitado` con `total_pago_mensajero` contando una gestión ya anulada, y
`WalletMensajeroFeedService` la pagaría (§1.2). Por eso las DOS transacciones abren con
`SELECT id FROM cierre_dia WHERE id = X FOR UPDATE`, y el deshacer re-comprueba DESPUÉS del candado
que el cierre sigue `rechazado` (R11). Orden de candados en el deshacer: primero `cierre_dia`,
después `orden` (el `FOR UPDATE` de `anularGestionPendiente`, `CierreDiaRepository.ts:1472`), para
no invertirlo frente a un registro concurrente que solo toma la orden.

## 5. Contratos

### 5.1 Repositorios

`ICierreDiaRepository`:

- `findGestionParaDeshacer` — la fila gana `cierreEstado: CierreEstado | null` y
  `cierreMensajeroId: string | null` (mismo `select`, una relación más).
- `anularGestionDeCierreRechazado(input: { gestionId; ordenId; mensajeroId; cierreId;
  actorUsuarioId; estatusEnRepartoId }): Promise<boolean>` — una `$transaction`: candado de
  `cierre_dia`, re-lectura `estado = rechazado AND mensajero_id = mensajeroId`, candado de `orden`
  y `estatus = en_reparto AND deleted_at IS NULL`, `updateMany` guardado
  `{ id, mensajeroId, cierreId, anuladaAt: null }`, evento + webhook (copiado de
  `anularGestionPendiente`, `:1482-1498`), recálculo D3. `false` = carrera, sin efectos.
- `resolicitarCierreRechazado(input: { cierreId; mensajeroId; tarifa: PagoTarifa | null }):
  Promise<boolean>` — D5.
- `findCierreResolicitableMasViejo` — devuelve además `destinoZonaId` (el servicio resuelve la
  tarifa de R17 con él).
- `findCorreccionesPendientes(mensajeroId): Promise<CorreccionCierreRow[]>` — por cada cierre
  rechazado propio: `cierreId`, `motivoRechazo` y sus órdenes en corrección
  (`ordenId`, `numGuia`, `numRemision`, `destinatario`, `regestionada: boolean` = tiene gestión
  vigente sin cierre). Las gestiones vigentes del cierre salen de `findCierrePropioConGestiones`,
  que ya existe.

`IOrdenRepository` (lo consume `MisAsignacionesService`, que ya lo recibe):

- `findOrdenesEnCorreccion(mensajeroId: string, ordenIds: string[]): Promise<Set<string>>` —
  D2 en lote. `ordenIds` vacío ⇒ ni una consulta.

### 5.2 Servicios

- `CierreDiaService.deshacerGestion` — orden de guardas nuevo:
  1. rol; 2. bloqueo → si bloqueado: leer la gestión; continuar solo si es corregible
     (caso (a): `cierreEstado = rechazado` y `cierreMensajeroId = actor`; caso (b): sin cierre y
     `findOrdenesEnCorreccion(actor, [ordenId])` la contiene), si no ⇒ `conflict` de bloqueo de hoy;
  3-8. las guardas de hoy (propiedad, tienda, ya anulada, borrada, la última, orden movida), con la
     guarda 4 cambiada a: `cierreId !== null && !(caso (a))` ⇒ `MSG_YA_EN_CIERRE`, y caso (a) con
     gestión legada ⇒ `MSG_YA_EN_CIERRE` (R10);
  9. caso (a) ⇒ `anularGestionDeCierreRechazado`; resto ⇒ ramas de hoy.
- `CierreDiaService.solicitarCierre` — rama 2: si `resolicitable.estado === "rechazado"` ⇒
  resolver tarifa (`tarifaZonaRepo.resolvePagoTarifa(destinoZonaId, vehiculoId)`) y llamar a
  `resolicitarCierreRechazado`; si `vencido` ⇒ `transicionarASolicitado` como hoy. Mismo
  `MSG_DUPLICADO`, mismo aviso `avisarCierrePorAprobar`, mismo `via: "resolicitado"`.
- `CierreDiaService.listarCierreDia` — el resultado `ok` gana
  `correcciones: CorreccionCierreDTO[]` (vacío si no hay rechazados): por cierre, `cierreId`,
  `motivoRechazo`, `gestiones: CierreDetalleGestion[]` (con `desdeAyudaTienda` para R25) y
  `ordenesEnCorreccion: { ordenId; numGuia; numRemision; destinatario; regestionada }[]`.
- `MisAsignacionesService.escogerParaGestion` / `gestionar` — D4. `listarMisAsignaciones` añade
  `enCorreccion: boolean` a cada `MiAsignacionDTO` con una sola llamada en lote sobre las filas
  `en_reparto` del actor (solo si está bloqueado; libre ⇒ `false` sin consulta).

### 5.3 Actions y UI

- `lib/actions/cierre-dia.ts` — sin acciones nuevas: `deshacerGestion` y `solicitarCierre` ya
  existen. Verificar que el composition root sigue inyectando `OrdenRepository` con el método
  nuevo (memoria «composition root que no inyecta»).
- `CierreDiaModule.tsx` — panel «Corregir gestiones» dentro de la sección «Cierre rechazado»
  (R25, R26); `RECHAZADO_CONFIRM_DETALLE` deja de decir «No se recalculan los montos» y, con
  órdenes sin rehacer, dice cuántas saldrán del cierre (R28). Textos sin la sigla «SLA».
- `RepartoModule.tsx` / tarjeta — deshabilitada si `bloqueado && !enCorreccion` (R27). El aviso de
  bloqueo se mantiene.

## 6. Alternativas descartadas

- **A1 — Conservar `cierre_id` en la gestión anulada y filtrar `anulada_at IS NULL` en los feeds.**
  Es el arreglo «natural» y es el peligroso: obliga a tocar tres consultas de dinero
  (`WalletFeedService.ts:69`, `WalletTiendaFeedService.ts:102`, `WalletIndemnizacionFeedService.ts:29`)
  y deja vivo el invariante solo para quien se acuerde: cualquier lector futuro de
  `where: { cierreId }` cobraría la anulada en silencio. Desvincular (D1) conserva el invariante y
  no toca ni un feed.
- **A2 — Que el mensajero corrija el resultado EN SITIO (como la 398).** Exigiría un formulario de
  corrección por resultado (evidencias, desglose de cobro, fecha de reprogramación…) que ya existe
  como «gestionar». Deshacer + volver a gestionar reutiliza el flujo entero y sus guardas.
- **A3 — Levantar el bloqueo N/V entero mientras el cierre esté `rechazado`.** Le dejaría cobrar
  y recibir trabajo nuevo con un cierre sin cuadrar: es exactamente lo que la 271 prohíbe
  (`bloqueo-cierre.ts:7-11`). La exención por objeto (D4) abre solo lo que la corrección necesita.
- **A4 — Excluir las órdenes en corrección de `gestionesDelCierreWhere` para que el corte no se
  lleve la gestión rehecha.** Es el predicado único que decide qué factura cada cierre (lo comparten
  la lectura y el `updateMany` que vincula, `CierreDiaRepository.ts:545-552, 1068-1075`) y está en
  la ruta caliente del corte. Meterle un `NOT EXISTS` correlacionado por un caso borde (corte entre
  deshacer y re-solicitar) es más riesgo que el problema; queda como Pregunta abierta 1.
- **A5 — Recalcular el cierre solo al re-solicitar, no al deshacer.** Menos escrituras, pero hay
  una SEGUNDA vía que saca un cierre de `rechazado` sin pasar por la re-solicitud del mensajero: la
  válvula de escape del admin, `forzarSolicitudVencido`, que acepta `vencido` y `rechazado`
  (`CierresAdminRepository.ts:137, 2474-2483`) y SOLO cambia `estado`, sin transacción. Con A5,
  un rechazado corregido y forzado por el admin llegaría a `solicitado` con
  `total_pago_mensajero` contando la gestión anulada, y `WalletMensajeroFeedService` la pagaría.
  Recalcular al deshacer (D3) deja el cierre coherente en dinero llegue por donde llegue a
  `solicitado`; recalcular otra vez al re-solicitar con la misma función es idempotente.
- **A6 — Regenerar `cierre_detail` al re-solicitar.** Cambiaría la tarifa congelada de órdenes que
  no se corrigieron (D6).

## 7. Riesgos y fuera de alcance

- Las gestiones rehechas aparecen también en las tablas del día de `/cierre-dia` (tienen
  `cierre_id` NULL) y suman en «Totales del día» hasta re-solicitar. Se acepta: es lo que son
  (gestiones aún sin cierre) y el panel de corrección dice a dónde irán.
- Un `incidente` deshecho no lleva indemnización (se captura al aprobar), nada que limpiar.
- La corrección de admin (398) no puede tocar un `rechazado`: su guarda es
  `ESTADOS_ABIERTOS = ["solicitado", "vencido"]` (`CierresAdminRepository.ts:146`, servicio
  `CierresAdminService.ts:104`). No hay carrera entre las dos correcciones.
- **La válvula de escape del admin no se toca** (`forzarSolicitudVencido`). Si el admin fuerza un
  rechazado a medio corregir: los totales ya están recalculados (D3), así que el dinero cuadra; las
  gestiones rehechas siguen sin cierre y entran en el SIGUIENTE cierre del mensajero; las filas de
  `cierre_detail` de órdenes sin gestión quedan en el cierre (ningún feed las recorre: iteran
  gestiones). Su `updateMany` espera al candado de D1 si coincide con un deshacer, y el deshacer
  re-comprueba el estado tras el candado. Es la Pregunta abierta 6.

## 8. Trazabilidad R → test

| R | Test |
|---|---|
| R1, R2, R3, R11 | `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts` |
| R4, R5, R6, R7, R8, R9, R10 | `tests/unit/services/cierre-dia-477-deshacer.test.ts` (+ casos WHERE de R6/R9 en el de integración) |
| R12, R13 | `tests/unit/services/mis-asignaciones-477-correccion.test.ts` |
| D2 (predicado), R12, R16 | `tests/integration/db/477-ordenes-en-correccion-sql-real.test.ts` |
| R14 | `tests/integration/db/477-regestionar-sin-cierre-sql-real.test.ts` |
| R15, R16, R17, R18, R19, R20, R22 | `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts` |
| R21, R22 (servicio) | `tests/unit/services/cierre-dia-477-resolicitud.test.ts` |
| R23, R24 | `tests/integration/db/477-aprobacion-tras-correccion-sql-real.test.ts` |
| R25, R26, R28 | `tests/components/CierreDiaModule477Correccion.test.tsx` |
| R27 | `tests/components/RepartoModule477Correccion.test.tsx` |

Toda regla que vive en un `WHERE` (R1, R6, R9, R11, R15, R16, R18, D2) se afirma contra Postgres y
con contraprueba de mutación anotada en `progress/impl_477.md` (memoria «probar el WHERE donde
vive»). Ningún test de integración puede salir verde sin sembrar: cada uno afirma primero que la
siembra existe (memoria «test de integración verde sin datos»).
