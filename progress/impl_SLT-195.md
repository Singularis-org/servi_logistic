# impl SLT-195 «Cierre de la satélite: pruebas de dinero que no cuadran (D64)»

> backend_dev, 2026-11-18. Rama `feature/SLT-195-cierre-satelite-dinero-tests` (merge de `origin/dev`
> en `40ce1e28`, sin conflictos). Solo tests, baseline y `progress/`: 0 líneas de producción.

## T0 — Entorno
- `.env` presente en el worktree (comprobado con `test -f`, sin leerlo) y `node_modules` enlazado.
- Base desechable **`servi_slt195_desechable`** (wrapper `con-desechable.cjs` del scratchpad):
  `prisma migrate deploy` + `pnpm run db:seed`. `prisma migrate status`: «331 migrations found…
  Database schema is up to date!». Nunca la base del `.env` ni `migrate reset` (R1206).

## T1 — Medir antes de tocar (22 archivos: los 21 + `marca-conciliacion.int` del alcance ampliado)
`vitest run --reporter=json` en la desechable: 153 casos, 26 pasan, 127 fallan, 0 saltados.
Coincide con `design.md > Diagnóstico`.

| Archivo | p/f | Primer error |
|---|---|---|
| 477-aprobacion-tras-correccion-sql-real | 0/1 | `expected [] to deeply equal ['cod_recaudado\|4000.00', …]` |
| 454/caracterizacion/cierre-rechazado | 4/1 | `expected 0 to be greater than 0` |
| 454/caracterizacion/deshacer | 4/1 | `expected [] to deeply equal ['2000.00']` |
| 454/caracterizacion/multi-dia-271 | 2/1 | `expected 0 to be greater than 0` |
| 454/caracterizacion/dinero-aprobacion | 2/1 | `expected [ …(18) ] to deeply equal [ …(18) ]` (pago_satelite) |
| 455/caracterizacion/dinero-aprobacion | 3/1 | ídem |
| 454/registro-gestion-sin-transicion-sql-real | 4/1 | `expected +0 to be 1` (R5) |
| marca-conciliacion.int | 5/3 | `expected 'con_asientos' to be 'updated'` (:272) |
| analitica-anulacion-rechazo-458 | 0/4 | escenario 459: «repartoMensajero» respondió `sin_saldo` |
| caja-caracterizacion-459 | 0/23 | ídem |
| caja-invariante-tiendas | 0/8 | ídem |
| como-quedo | 0/8 | ídem |
| efecto-movimiento-predice | 0/5 | ídem |
| libro-caja-a-quien | 0/7 | ídem |
| libro-caja-filtro-a-quien | 0/16 | ídem |
| libro-caja-revision-458c | 0/8 | ídem |
| libro-caja-revision-458e | 0/6 | ídem |
| liquidacion-fechas-cr-461 | 1/1 | ídem |
| wallet-anulacion-458 | 0/10 | ídem |
| wallet-comprobante-alcance | 1/7 | ídem |
| wallet-documento-comprobante-458 | 0/5 | ídem |
| wallet-registro-comprobante-458 | 0/9 | ídem |

## Qué cambió
- **Grupo A** (`477`, `cierre-rechazado`, `deshacer`, `multi-dia-271`): se cuenta el dinero justo tras
  aprobar (= 0, R1190) y se asienta con `asentarCierreDia` (SLT-73 R10) antes de leer. Literales sin
  cambio. En `multi-dia-271` también se asienta C2, para que «no escribe dinero de C1» mire un asiento
  real, con control positivo `dineroC2 > 0` (R1193).
- **Grupo B** (`454`/`455` `dinero-aprobacion`): `mensajero|pago|pago_efectivo|1500.00` →
  `pago_satelite|1500.00`, con su comentario (SLT-139 R317/R336). Las otras 17 filas sin cambio.
- **Grupo C** (`registro-gestion-sin-transicion`): siembra coordenadas y una `ruta_optimizada` de hoy
  con la `organizacion_id` de la orden (R1196); caso nuevo con la ruta calculada hace 3 días → 0 jobs (R1197).
- **Escenario 459** (`_fixtures/caja-459.ts`): mensajero y tarifa (1500/164) en la zona central (la
  tarifa se crea si falta o se actualiza: dos siembras comparten la central); aprueba el `maestro`;
  fuera el `asentarCierreDia` manual (R1198). Caso nuevo en `caja-caracterizacion-459`: el cierre del
  día es `bodega_central`, `resueltoPor` = maestro y `pagoIndependienteEfectivo = true`.
- **marca-conciliacion.int** (alcance ampliado, SLT-182): los 3 casos de revertir marcaban 485 sobre
  500 consolidados; el faltante de 15 escribe la «diferencia de la satélite» y revertir responde
  `con_asientos` (SLT-73 R13/R14, D11). Ahora se marca lo mismo que se consolidó (diferencia 0); el
  caso `con_asientos` ya vive en `slt73-revertir-con-asientos.int.test.ts`. El literal 485.00 del R13
  se mantiene (se consolida 485).

## Literales de dinero cambiados (T5.3, R1202)

| Archivo | Antes | Ahora | Cálculo y regla |
|---|---|---|---|
| 454/caracterizacion/dinero-aprobacion | `pago_efectivo\|1500.00` | `pago_satelite\|1500.00` | SLT-139 R317/R336: P = 1 × 1500 |
| 455/caracterizacion/dinero-aprobacion | `pago_efectivo\|1500.00` | `pago_satelite\|1500.00` | ídem |
| caja-caracterizacion-459 (libro mensajero) | `cierre_dia\|pago\|pago_efectivo\|2000.00` | (fila quitada) | SLT-123 R313: cierre nuevo de la central solo devenga P |
| caja-caracterizacion-459 (R94 pagado) | 8664.00 | 6664.00 | 1000 + 664 + 5000 (sin los 2000 del efectivo) |
| caja-caracterizacion-459 (R94 cuenta por pagar) | 1836.00 | 3836.00 | 10500 − 6664 (SLT-123 R321) |
| caja-caracterizacion-459 (R4 cuenta por pagar) | 1836.00 | 3836.00 | ídem |
| marca-conciliacion.int (consolidado de R12/R13) | 500.00 | 485.00 | recibido = consolidado → sin ajuste (SLT-73 R13/R14) |
| marca-conciliacion.int (1.ª marca del ciclo) | 485.00 | 500.00 | ídem |

R1201: ninguna cifra de caja ni de tienda cambió; `egreso_pago_mensajero|4500.00` en la caja sigue igual
(R1200). Todos los cálculos están hechos a mano en el comentario de al lado, no copiados de la salida.

## Fuera de D1-D6 (lo destapó el escenario 459 al dejar de caer)
1. **`analitica-anulacion-rechazo-458`: `EmpresaNoResuelta`** en `consultarMetricaFinanciera` (la acción
   lee la zona del país con el cliente global, sin empresa en la tx revertida; SLT-42). Arreglo de
   prueba, sin literal: se inyecta `reglasPais: reglasPaisFijas()` en las deps de la acción, como ya
   hace el servicio del mismo archivo. Con eso 3 de 4 casos pasan.
2. **`libro-caja-filtro-a-quien`**: la composición trae `categoriasConModeloNuevo` (D39, commit
   `011d4af3`), que no es dinero ni sale de las filas. Se compara solo el dinero (se quita esa clave
   antes del `toEqual`). Sin literal cambiado.
3. **R1203 — `analitica-anulacion-rechazo-458` «la ganancia cuadra»: SE QUEDA EN EL BASELINE.**
   Espera que `ganancia_empresa` baje 1130.00 (flete 1000 + IVA 130) al anular el cobro; baja 1000.00.
   SL-39 R11 sacó el IVA de la ganancia, así que la cifra medida cuadra con una regla escrita, pero no
   con D1-D6. El literal no se tocó y producción tampoco.
   - **Pregunta para Carlos:** ¿se actualiza el caso a «la ganancia baja 1000.00 = lo que baja el flete;
     el IVA no cuenta (SL-39 R11)», en esta ficha o en otra?

## T6 — Control positivo (R1205)
Cada mutación se aplicó en `lib/`, se corrió el archivo en la desechable (`--reporter=json`), y se
restauró con `git checkout --`. Tras cada una, `git diff --name-only -- lib` salió vacío (`[]`).
Script: `mutar.sh` del scratchpad.

| # | Mutación | Archivos que cayeron | Aserción que cayó |
|---|---|---|---|
| M1 | `CierresAdminRepository.ts:2692` `=== "bodega_central"` → `!== undefined` (aprobar satélite asienta) | 477, cierre-rechazado, deshacer, multi-dia-271, 454 y 455 dinero-aprobacion (6/6) | «SLT-195 R1190: dinero escrito al aprobar una satelite: expected 5 to be +0»; `alAprobar` `[ …(18) ] to deeply equal []` |
| M2 | `asentarCierreDia` vuelve sin escribir | 477, cierre-rechazado, deshacer, multi-dia-271 (4/4) | `expected [] to deeply equal ['cod_recaudado\|4000.00', …]`; `expected 0 to be greater than 0`; «SLT-195 R1193: asentar C2 no escribio su dinero» |
| M3 | `WalletMensajeroFeedService.ts:97` `pago_satelite` → `pago_efectivo` | 454 y 455 dinero-aprobacion (2/2) | `expected [ …(18) ] to deeply equal [ …(18) ]` |
| M4 | `GestionOrdenRepository.ts:876` sin `!primeraRutaPendiente(...)` | registro-gestion-sin-transicion | R1197: `expected 1 to be +0` |
| M5 | `GestionOrdenRepository.ts:875` condición `&& false` | registro-gestion-sin-transicion | «SLT-195 R1196: jobs de reoptimizacion encolados: expected +0 to be 1» |
| M6b | `CierresBodegaAdminRepository.ts:876` revertir siempre `con_asientos` | marca-conciliacion.int (4 casos) | `expected 'con_asientos' to be 'updated'` |
| M7 | `WalletMensajeroFeedService.ts:81` sin `!cierre.pagoIndependienteEfectivo` (vuelve min(P, E)) | caja-caracterizacion-459 (3 casos) | R94 cuenta por pagar `{ devengado: '10500.00', … }` |
| M8 | `LiquidacionService.imputablesDe` siempre `[]` | los 13 del escenario 459 (114 casos) | «escenario 459: el paso «repartoMensajero» respondio {"status":"sin_saldo"}» (R1199) |
| M9 | `WalletService` composición con `filas.slice(1)` | libro-caja-filtro-a-quien | R54/R59 «tiendaA: expected { ingresos … } to deeply equal …» |
| B1 | `LibroCajaAutoriaService.ts:135` `por:` del cierre → el nombre que empieza por «Maestro» (mutación de la review) | libro-caja-a-quien | R57 `expected { nombre: null, automatico: { …(2) } } to deeply equal …` (antes del arreglo B1: 7/7 en verde) |
| F461 | `LiquidacionService` reverso al mensajero con `fechaMovimiento` + 1 día | liquidacion-fechas-cr-461 | «escenario entero…»: `expected [ '2026-11-18T06:00:00.000Z', …(1) ] to deeply equal [ '2026-11-18T06:00:00.000Z' ]` |
| WCA | `WalletComprobanteService.ts:155` `no_anulable` no responde `no_admite` | wallet-comprobante-alcance (7 casos) | el escenario del archivo cae con `AppErrorCode inesperado INTERNAL` (cae, pero por error, no por aserción) |
| WCA2 | `WalletComprobanteService.ts:157` `en_su_documento` → `no_admite` | wallet-comprobante-alcance | D6 `expected { status: 'no_admite', … } to deeply equal …` |
| GAN5 | IVA de vuelta en la ganancia: `egreso_reverso_iva_flete_devolucion` en `categorias` de `ganancia_empresa` (`lib/analytics/metrics.ts`) **y** fuera de `esCategoriaIva` (`lib/utils/caja-tesoreria.ts`), juntas | analitica-anulacion-rechazo-458 | «la ganancia cuadra»: `expected '1130.00' to be '1000.00'` |

(GAN, GAN2 y GAN3 —cada mitad sola, o con la categoría de ingreso en vez de la del reverso— no
mordían: el IVA queda fuera dos veces, por la lista de la métrica y por `esCategoriaIva`, y la
diferencia la mueve el reverso. Se descartaron y se usó GAN5. GAN4, `ganancia × 2`, rompe la
consulta, no la aserción.)

(M6 —`if (delta.isZero() && false)`— cayó por el `CHECK` de la tabla, no por una aserción; se
descartó y se usó M6b.)

## Tests tras el cambio
`vitest run` de los 22 archivos en la desechable (`--reporter=json`): **155 casos, 154 pasan, 1 falla,
0 saltados**. El que falla es el de R1203 («la ganancia cuadra»). 21 archivos verdes.

## Baseline (T7)
- Salen 21 entradas: los 20 archivos recuperados de la ficha y `marca-conciliacion.int`.
- Se queda `analitica-anulacion-rechazo-458` con la causa medida (R1203).
- Línea de poda «PODA DEL 2026-11-18 (SLT-195)» en `_lee_esto`.
- `pnpm run test:guardias`: los únicos rojos son `dependencias-declaradas-presentes` y
  `otp-debug-solo-en-pruebas`, ya en el baseline y ajenos a esta ficha.

## Mapa R → prueba
| R | Prueba |
|---|---|
| R1190 | `477-aprobacion-tras-correccion-sql-real` (`dineroAlAprobar = 0`); `454/caracterizacion/{cierre-rechazado (alAprobar.dinero), deshacer (codAlAprobar), multi-dia-271 (dineroC1AlAprobar)}`; `454`/`455` `dinero-aprobacion` (`alAprobar = []`) |
| R1191 | `454/caracterizacion/cierre-rechazado` («re-solicitar y aprobar…», «re-aprobar no emite…») |
| R1192 | `454/caracterizacion/deshacer` (`["2000.00"]`), `477` (`cod_recaudado\|4000.00`, `ingreso_cod_recaudado\|4000.00`) |
| R1193 | `454/caracterizacion/multi-dia-271` (`trasC2.dineroC1 = 0`, `dineroC2 > 0`, `trasC1.dineroC1 > 0`) |
| R1194, R1195 | `454`/`455` `dinero-aprobacion` (18 filas, re-aprobar no añade) |
| R1196 | `454/registro-gestion-sin-transicion-sql-real` («R5: … se encola la reoptimizacion») |
| R1197 | ídem, «SLT-195 R1197: con la primera ruta del dia pendiente…» |
| R1198 | `caja-caracterizacion-459` («SLT-195 R1198: el cierre del dia es de la CENTRAL…») |
| R1199 | `caja-caracterizacion-459` («anti-vacuidad: los dieciocho pasos…»), y los 13 archivos del escenario |
| R1200 | `caja-caracterizacion-459` («R94/R95/R96: filas del LIBRO DEL MENSAJERO», `cierre_dia\|egreso\|egreso_pago_mensajero\|4500.00`) |
| R1201 | los 13 archivos del escenario: ninguna cifra de caja ni tienda cambió en el diff |
| R1202, R1203 | tabla de literales de arriba + «Fuera de D1-D6» |
| R1204, R1205, R1206 | JSON de vitest en `servi_slt195_desechable` + tabla de mutaciones |
| R1207, R1208 | `tests/baseline-rojos.json` (21 fuera, 1 por R1203) + `gate-cableado-arnes-v2.guardia.test.ts` |
| R1209 | `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ package.json` vacío |
| R1210 | `progress/deudas.md > D64` cerrada |

## Gate y cierre (T8)
- `bash ./init.sh` (rápido) vía `con-desechable.cjs` contra `servi_slt195_desechable`, log completo:
  `✓ typecheck paso`, `✓ lint paso` (0 errores; solo avisos ajenos), `test:rapido` 1419 passed |
  1 skipped, «48 rojo(s) heredado(s) del baseline no cuentan», `== init OK ==`, **`INIT_EXIT=0`**.
- `git diff --name-only origin/dev -- lib/ app/ components/ hooks/ db/ scripts/ package.json`: vacío (R1209).
- `node scripts/tamano-pr.mjs`: «13/40 archivos, 0/1000 lineas de produccion, 330/3000 de tests».

Veredicto: 21 de 22 archivos recuperados y fuera del baseline, sin tocar producción; 1 se queda por R1203 con pregunta a Carlos.

## Vuelta 2 — review RECHAZADA (`progress/review_SLT-195.md`)
- **B1:** el escenario 459 crea un segundo usuario de acceso total, `Aprobador` (rol `maestro`), que
  aprueba el cierre del día; el `maestro` sigue registrando y leyendo el resto. `Escenario459` expone
  `aprobador`. En `libro-caja-a-quien`, `nombres.adminSat` → `nombres.aprobador`, más un control
  `aprobador != maestro`. En `caja-caracterizacion-459` (R1198), `resueltoPor` = aprobador y
  `aprobadorId != maestroId`. La mutación B1 de la review pasa a ROJO (tabla de arriba).
- **m1:** mutaciones dirigidas B1, F461, WCA y WCA2 (tabla de arriba); las cuatro muerden. Tras cada
  una, `git diff --name-only -- lib` vacío.
- **m3:** `libro-caja-filtro-a-quien` comprueba que `categoriasConModeloNuevo` es un array antes de quitarlo.
- Los 22 archivos de nuevo en la desechable: 155 casos, 154 pasan, 1 falla (el de R1203), 0 saltados.
- **`wallet-458-migration` (petición del leader, review de SLT-187):** corrido en `servi_slt195_desechable`
  con este cambio, pasa 7/8; los dos casos (c), que usan `sembrarEscenario459`, pasan. Solo cae (a)
  («los catálogos son EXACTAMENTE los seeds…»), por el orden de etiquetas del enum, que es causa de SLT-187.
  La entrada se queda en el baseline con ese motivo, re-medido.

## Vuelta 2 (cont.) — R1203 resuelto por Carlos
- Decisión de Carlos, 2026-11-18 («dale del todo», vía el leader): en `analitica-anulacion-rechazo-458`,
  caso «la ganancia cuadra», el esperado pasa de 1130.00 a **1000.00** (literal, no calculado con la
  app), con el comentario «flete 1000; el IVA 130 no cuenta en la ganancia (SL-39 R11); aprobado por
  Carlos 2026-11-18». La segunda aserción (ganancia − flete = IVA) ya no vale con SL-39: ahora afirma
  que la ganancia baja lo mismo que el flete y que el IVA sí se movió (`"130.00"`). Cabecera del archivo
  al día.
- En la desechable: 4/4 en verde. Control positivo GAN5 (tabla de arriba): ROJO, restaurado con
  `git checkout --`, `git diff --name-only -- lib` vacío.
- Baseline: sale también esta entrada. Ya no queda ninguna de SLT-195 por R1203. La línea de poda de
  `_lee_esto` dice 22 archivos.

## Vuelta 2 — merge y gate final
- `git merge origin/dev` (con #218 de SLT-186): el único conflicto fue `tests/baseline-rojos.json`. Lo
  fusioné por clave (base − ours − theirs): base 69, ours 47, theirs 56 → 34 entradas, sin conflicto de
  contenido. `_lee_esto` = base + las líneas que añadió cada lado. El JSON parsea.
- Los 22 archivos tras el merge, en la desechable: 155/155 en verde, 0 saltados.
- `git diff -- lib app db` y `git diff origin/dev...HEAD -- lib app db`: vacíos.
- Gate rápido tras el merge: `== init OK ==`, **INIT_EXIT=0**.

## Vuelta 3 — sincronización con dev (SLT-187 mergeada, #220)
- `git merge origin/dev`: el único conflicto fue el baseline. Lo fusioné por clave: base 56, ours 34,
  theirs 43 → 21. `wallet-458-migration` lo cambiaban los dos lados.
- `wallet-458-migration` entero en `servi_slt195_desechable` (con `migrate deploy` tras el merge):
  **8/8 en verde**, 0 saltados. Sale del baseline, con su línea en la poda de `_lee_esto`. Quedan 20 entradas.
- La tabla de mutaciones se arregló: ya no tiene filas sueltas fuera de la tabla (menor de la review).
- Gate rápido tras el merge de la vuelta 3:
  - 1.ª corrida: **INIT_EXIT=1**. No hubo ninguna prueba roja: 957/958 y «Worker exited unexpectedly»
    (un worker de vitest murió, 99/100 archivos). Fallo de infraestructura.
  - 2.ª corrida, con el árbol sin cambios: `== init OK ==`, sin errores no capturados, **INIT_EXIT=0**.
  - Corrección: un commit anterior anotó INIT_EXIT=0 antes de leer la 1.ª corrida.
