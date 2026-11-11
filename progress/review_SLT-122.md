# review — SLT-122 «Pago al mensajero: solo la bodega dueña del cierre»

Reviewer, 2026-11-10. Rama `feature/SLT-122-pago-bodega-duena`, HEAD 888e4071, diff `origin/dev...HEAD`
(20 archivos, +1629/-41). Ruta ligera por excepción escrita de Carlos (PA0); revisada con la profundidad
de la completa: se recorrieron todas las vías de escritura de pago, no solo el diff.

## Veredicto: RECHAZADO (solo por B1, de proceso)

El código y los tests no tienen bloqueantes. El único bloqueante es que falta la constancia del E2E de
dinero y de cierres (T7 sigue `[ ]`). Para levantarlo no hace falta otra vuelta del implementer: basta con
anotar en `progress/impl_SLT-122.md` (o en `progress/features/SLT-122.md`) el E2E corrido en local y en
verde, y marcar T7. Con eso el veredicto pasa a **OK con menores**, sin volver a revisar.

## Checklist

- [x] Ruta: ligera con la excepción de Carlos escrita (`progress/features/SLT-122.md:41`). Ver m5.
- [x] Trazabilidad R1-R10 → test real (tabla abajo).
- [ ] Tasks: T7 (E2E `dinero`) sigue `[ ]` (`requirements.md:208`). → B1.
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 16/40 archivos, 966/1000 líneas. Solo AVISO, sin pasar el máximo.
- [x] Lo que ya existe: reusa `Alcance`, `alcanceWhere` y el alcance de `resolveAlcance` (los muda a un
      módulo compartido); no re-crea nada.
- [x] Typecheck: `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` → exit 0 (lo corrí yo).
- [x] Lint de los archivos `.ts` tocados: 0 problemas (lo corrí yo).
- [x] Tests relacionados, contra `slt122_t1` (lo corrí yo): `pago-mensajero-bodega-duena`, `nucleo-sin-modulos`,
      `liquidacion-idempotencia`, `aislamiento-wallet`, `incentivo-mensajero-slt68` (integración) + 7 unit/guardias
      + `CierresAdminDeepLink` → 13/13 archivos, 441/441 tests. Las dos integraciones nuevas o cambiadas corren de
      verdad (13 `✓` en el reporter verbose, 0 skipped).
- [x] R7, `/cierres-admin`: `tests/unit/services/cierres-admin*`, `CierresAdminService*`,
      `tests/unit/repositories/cierres-admin*` y `tests/integration/db/cierres-admin*` → 29/30 archivos, 545 tests
      verdes. El único rojo, `cierres-admin-retornables-sql-real.test.ts` («tabla `orden` vacía»), está en
      `tests/baseline-rojos.json`: no es un hallazgo.
- [x] Datos y seguridad: no hay tabla, migración ni esquema. Las tres queries nuevas filtran la empresa por la
      extensión del cliente y la RLS de `cierre_dia`, que es el mismo patrón de `obtenerCierreParaPago` y de
      `CierresAdminRepository`. R4 lo prueba con dos empresas contra Postgres real, con control positivo en B.
- [x] Sin dependencias nuevas, sin Ordenex, sin secretos, sin literales nuevos de país o moneda en `lib/`.
- [x] Autorización en el servidor (servicio + WHERE), no en la UI.
- [ ] E2E de flujos críticos (dinero, cierres; `dos-empresas-humo` porque toca datos de negocio): sin constancia. → B1.
- [x] Comentarios: explican el porqué (SLT-122, D1, PA1) y no el qué.

## Las seis comprobaciones pedidas

1. **Autorización.** Hay dos entradas de escritura de pago al mensajero, y ninguna más: `registrarPagoMensajeroAction`
   y `registrarRepartoMensajeroAction` (`lib/actions/liquidacion.ts:137`, `:239`). Lo comprobé buscando todo
   `liquidacionPago.create` (solo `LiquidacionPagoRepository.ts:206`, que se alcanza por `escribirPagoDeCierre`
   y por el pago a tienda) y todo movimiento `tipo: "pago"` en `lib/services`.
   - Pago directo: `LiquidacionService.ts:337-343`. Lee con `obtenerCierreParaPagoEnAlcance(…, ALCANCE_ACCESO_TOTAL, tx)`
     dentro de la tx y después del candado. `null` → `no_encontrado` antes de mirar estado y monto (R1/R2).
   - Reparto, previsualizar y registrar: los dos pasan por `imputablesDe` (`:1094-1101`), que usa
     `listarCierresImputablesEnAlcance`. La relectura bajo bloqueo (`ventanaBajoBloqueo`, `:1151`) y la
     respuesta idempotente (`:1191`) también. El conteo de excluidos (`:442-445`) va en el mismo alcance.
   - Las otras escrituras no son registros de pago. Los movimientos automáticos de `WalletMensajeroFeedService`
     son el modelo mín(P,E) al aprobar. Las anulaciones son `anularPago`/`anularReparto`, el `anularPremio` de
     `PremioRankingDevengoService:298` y el de `IncentivoMensajeroService:141`. `actualizarPagosGestion` y
     `ajustarPagoMensajeroGestion` ya filtran por `resolveAlcance`.
   - La central sigue pagando lo suyo: R3 en unit (`ok`, documento y movimiento) e integración (restante
     29000 → 28500). `liquidacion-idempotencia` sigue verde (`ya_registrado`).
   - Anulación intacta: `restanteTrasAnular` (`:1246`) sigue con `obtenerCierreParaPago` sin alcance. Lo prueban
     el unit «SLT-122 (R8)» y la integración R8 (un pago contra un cierre que luego pasa a satélite se anula `ok`).
   - Empresa: la ponen la extensión y la RLS, no el WHERE (comentario en `alcance-cierre-where.ts:8`). R4 lo
     prueba con la action real dentro de `conEmpresa`.
2. **Refactor de `alcanceWhere`.** El cuerpo movido a `lib/repositories/alcance-cierre-where.ts` es idéntico
   carácter a carácter al borrado de `CierresAdminRepository.ts`, y el repositorio solo cambia el import:
   ninguna lista ni lectura ve más ni menos. `resolveAlcance` devuelve `ALCANCE_ACCESO_TOTAL`, con los mismos
   valores, ahora congelado. Busqué asignaciones a `alcance.destinoTipo` o `alcance.destinoZonaId` en `lib/` y
   no hay ninguna, así que el `freeze` no rompe a nadie. La guardia `criterio-unico` antes exigía 1 declaración
   y 1 huella dentro de `CierresAdminRepository`. Ahora exige 1 y 1 en el módulo compartido, 0 en los dos
   consumidores, el import exacto y el número de usos (≥5 y ==3). Protege lo mismo y además cubre
   `LiquidacionPagoRepository`.
3. **`nucleo-sin-modulos.test.ts`.** El cambio es correcto y no debilita el test. El cierre de ese escenario es de
   satélite (el propio test lo afirma en `:295-296` y `:306-308`), así que el `ok` anterior afirmaba el hueco.
   La action no tiene puerta de módulo (`liquidacion.ts:137-151`), de modo que «corre sin módulos» no depende
   del `ok`. Además el test ahora fija el destino y que hay 0 filas. El caso positivo central lo cubre R3 de
   la integración nueva.
4. **Trazabilidad.** Ver la tabla. R9 y R10 se cubren en unit y en integración, y la mutación del WHERE pone en
   rojo R1, R9 y R10 (`impl_SLT-122.md:78-94`). Las cifras que registra son coherentes con el escenario: 50000
   contra 30000 y 7000 contra 0.00.
5. **ABIERTOS del implementer.** Ninguno bloquea; ver m1, m2 y m3. Que los premios queden impagables lo decidió
   Carlos (PA1 = A, sin excepción). Queda un borde que sí conviene enseñarle: m2.
6. **mín(P, efectivo).** No cambia. El diff no toca `derivarPendienteCierre`, `calcularSplitPago` ni
   `WalletMensajeroFeedService`, y `pendienteDelCierre` (`:1371-1383`) está igual.

## Trazabilidad R → test

| R | Test | ¿Lo verifica? |
|---|---|---|
| R1 | `liquidacion-service.test.ts` «R1: admin/maestro contra un cierre de satelite» + integración «R1/R2» (0 filas en pago y libro) | sí; la mutación lo pone rojo |
| R2 | `liquidacion-service.test.ts` «R2» ×4 estados + contraprueba central → `excede`; integración con 999999.00 | sí |
| R3 | `liquidacion-service.test.ts` «R3» + integración «R3» (restante exacto) + `liquidacion-idempotencia` | sí |
| R4 | integración «R4» (A contra B → `no_encontrado`, B intacta, control B → `ok`) | sí |
| R5 | `liquidacion-service.test.ts` «R5» (sin tx, sin lectura, sin candado) + integración «R5» | sí |
| R6 | `liquidacion-pago-repository.test.ts` «SLT-122 … (R6)» (WHERE literal) + `liquidacion-service.test.ts` «R6» (alcance y tx del candado) + mutación | sí |
| R7 | `CierresAdminDeepLink.test.tsx` + suites `cierres-admin*` sin cambios y en verde | sí |
| R8 | `liquidacion-anulacion.test.ts` «SLT-122 (R8)» + integración «R8» | sí |
| R9 | `liquidacion-reparto-service.test.ts` «R9» (ventana, candados, alcance del conteo) + repo «R9» + integración «R9» | sí (ver m4) |
| R10 | `liquidacion-reparto-service.test.ts` «R10» ×2 + contraprueba + integración «R10» | sí |

## Hallazgos

**B1 — BLOQUEANTE (proceso). Sin constancia del E2E de dinero y cierres.** `requirements.md:208` (T7 `[ ]`),
`progress/impl_SLT-122.md:131-134`. `docs/perfil-agentes.md > reviewer` bloquea un PR que toca dinero sin
constancia de los E2E afectados corridos en local. `docs/checkpoints-proyecto.md` pide además los flujos
«Dinero» (`wallet*`) y «Cierres» (`cierres-admin*`), y `dos-empresas-humo` porque el diff toca datos de
negocio. La lectura estática del implementer no cuenta como constancia. Se levanta anotando el comando y su
resultado en verde (proyecto `dinero` y los afectados) y marcando T7. No hay que cambiar código.

**m1 — menor. El fixture `caja-459.ts` paga un cierre de satélite.** `tests/integration/db/_fixtures/caja-459.ts:729-765`
(cierre de satélite en `:838`). Con SLT-122 los pasos `repartoMensajero` y `pagoMensajero` ya no darían `ok`.
Comprobé que los 15 archivos que llaman a `sembrarEscenario459` están todos en `tests/baseline-rojos.json`, así
que hoy nada cambia de color. Pero quien los reviva (SL-31) se encontrará este rojo. Falta dejarlo como deuda
en `progress/features/SLT-122.md > Deudas de la feature` o en la ficha SL-31; ahora solo consta en la bitácora
del implementer.

**m2 — menor (decisión de Carlos). El incentivo manual se cuelga del cierre aprobado más reciente, sea del destino
que sea.** `lib/services/IncentivoMensajeroService.ts:62` (y `:80`) sigue con `listarCierresImputables` sin alcance,
como pedía el spec (T4). Consecuencia: la central puede registrar un incentivo a un mensajero cuyo cierre más
reciente es de satélite. Sale el egreso de la caja de la central y el devengo queda colgado de un cierre que ya
nadie puede pagar en el sistema. Lo mismo pasa con un mensajero que tenga cierres centrales y de satélite: si el
más reciente es de satélite, el incentivo queda impagable aunque haya un cierre central. Con PA1 = A «sin
excepción de premios ni incentivos» es coherente para el mensajero de satélite puro. El caso mixto y el egreso de
caja de la central conviene enseñárselos a Carlos en Preview o llevarlos a SLT-124 «Ranking de la central sin
mensajeros de satélite». No bloquea.

**m3 — menor, previo a SLT-122. El acto de `liquidacion_reparto` se escribe aunque el reparto salga `sin_saldo`.**
`lib/services/LiquidacionService.ts:549` y `:578`. El acto nace antes de leer la ventana y la tx confirma al
devolver `sin_saldo`, así que la clave queda consumida: un reintento con la misma clave responde `ya_registrado`
con 0 imputaciones. R10 se cumple (ni pago ni movimiento), y el comportamiento ya era así en la 205 para
cualquier mensajero sin imputables. SLT-122 lo vuelve más frecuente (todo mensajero de satélite), porque «Pagar»
sigue visible en esas filas. Para una ficha aparte si se quiere.

**m4 — menor. El conteo de excluidos en el alcance (R9) no se ejercita contra la base.**
`tests/integration/db/pago-mensajero-bodega-duena.test.ts:303-328`. El escenario no tiene ningún cierre no
aprobado de satélite, así que una mutación que quite `alcanceWhere` de `contarCierresNoAprobadosPorEstado`
(`LiquidacionPagoRepository.ts:434`) solo la caza el unit del WHERE literal y la guardia (`==3` usos). Aceptable
porque el literal es el contrato, pero el caso es barato de añadir.

**m5 — menor (proceso). Ruta ligera en una feature de dinero y permisos.** `requirements.md:125-132`,
`progress/features/SLT-122.md:41`. `docs/specs.md:71-78` dice que esto va siempre por la completa y que bajar del
suelo «nunca». Carlos lo decidió por escrito («Ligera, como excepción»), así que no lo bloqueo, y la revisión se
hizo a profundidad de completa. Si estas excepciones van a repetirse, que `docs/specs.md` les dé un sitio con
`/afinar-regla`. Hoy el doc y la práctica se contradicen.
