# Investigación — SLT-122 «Pago al mensajero: solo la bodega dueña del cierre»

> Solo lectura, 2026-11-10, sobre la rama `SLT-122-pago-bodega-duena` (al día con dev). Sin lecturas
> de producción. Rutas relativas a la raíz del repo. Lo que no está en código, `specs/`, `progress/`
> o `docs/` va marcado **DESCONOCIDO**.

## Resumen (10 líneas)

1. Hoy el sistema tiene **dos modelos que se contradicen** sobre quién paga al mensajero de satélite: la consolidación de la satélite (feature 40) le dice al adminSatelite «**Central debe**» lo que el efectivo no cubrió, y la deuda de SLT-73 (D4/R4) **ya le descuenta a la satélite el pago completo** P, se haya pagado o no.
2. La aprobación de un cierre de satélite la hace el adminSatelite; el dinero (incluido el libro del mensajero) **solo entra al conciliar** (SLT-73 R1/R10).
3. Al conciliar, el libro del mensajero recibe «devengado P» y «pagado del efectivo min(P, efectivo)». Si el efectivo no alcanzó (p. ej. todo SINPE), queda una **cuenta por pagar que nadie salda**: SLT-73 ya lo dejó abierto como Q4 «por defecto no cambia».
4. La deuda de la satélite **descuenta P siempre**, aunque nadie registre el pago (snapshot del cierre, no libro).
5. Las rutas que hoy pagan contra un cierre de satélite son dos: el pago directo y el reparto «Pagar» de `/wallet/mensajeros`. Las dos leen la deuda **del snapshot del cierre**, no del libro, así que se puede pagar **incluso antes de conciliar** (deja el libro en negativo).
6. Hay un tercer efecto que el spec no ve: **premios del ranking e incentivos** (dinero de la central) se cuelgan de cierres sin mirar el destino y **solo se cobran pagando contra el cierre**. Con la opción A tal cual, los de un mensajero de satélite quedarían **impagables**.
7. El mensajero **no ve** nada de lo que se le debe o se le pagó: `/mis-pagos` se retiró (ficha 336); en `/cierre-dia` solo ve su «Ganancia» del día.
8. En prod hoy hay **0 pagos** vigentes contra cierres de satélite (T0.2, Carlos), así que no hay nada que corregir.
9. Opciones: A (nadie paga en el sistema), B (paga el adminSatelite), C (paga la central y se le carga a la deuda de la satélite), D (la conciliación salda el libro: «pagado por la satélite»).
10. **Recomendación: A + D**, con una excepción para premios/incentivos (que siga pagándolos la central). Es coherente con D4 y con la 172 P3, no deja deudas eternas y no toca la conciliación. Además, Carlos tiene que decidir qué hacer con el rótulo «Central debe» de la consolidación.

---

## 1. Quién recauda, quién aprueba

- **Recauda el mensajero**: efectivo, SINPE y transferencia, congelados como snapshots en
  `cierre_dia` (`total_efectivo`, `total_general`, `total_pago_mensajero`, `total_ingreso_bodega_rechazos`;
  `db/schema.prisma:1598`, citado en `specs/SLT-73-dinero-satelite-al-conciliar/requirements.md:60-64`).
  El SINPE de la satélite es el medio por el que **ella** recibe y sigue siendo deuda (SLT-73 D3).
- **El destino del cierre** (`bodega_central` / `bodega_satelite` + zona) ya viene persistido de la
  feature 37 (`lib/services/CierresAdminService.ts:536-539`, comentario).
- **Aprueba la bodega dueña**: `CierresAdminService.resolveAlcance` (`lib/services/CierresAdminService.ts:527-540`).
  Acceso total (maestro/admin) → solo `bodega_central`; `adminSatelite` → `bodega_satelite` de su zona.
  **La central no puede aprobar un cierre de satélite.**
- Al aprobar, **solo un cierre central asienta dinero** (`lib/repositories/CierresAdminRepository.ts:2440-2446`:
  `if (destino?.destinoTipo === "bodega_central") await asentarCierreDia(...)`). Un cierre de satélite
  se aprueba sin escribir nada en la caja, en el libro por tienda ni en el libro del mensajero (SLT-73 R1/D2).

## 2. Cuánto se le debe y dónde queda la deuda

- **P = `total_pago_mensajero`** (snapshot de la feature 39, con tarifas). **E = `total_efectivo`**.
- Regla de la feature 44: `pagado = min(P, E)` y `pendiente = P − pagado`
  (`lib/utils/cuenta-por-pagar.ts`, `calcularSplitPago`). Es decir, el mensajero «se paga» del efectivo
  que recaudó; si el efectivo no alcanza, el resto es cuenta por pagar.
- **El libro del mensajero** (`pago_mensajero_movimiento`) lo escribe `WalletMensajeroFeedService.construirMovimientosDePago`
  (`lib/services/WalletMensajeroFeedService.ts:26-92`):
  - `devengo / pago_devengado = P` (:50-60);
  - `pago / pago_efectivo = min(P, E)` (:62-73);
  - y en la **caja de la central** un egreso `egreso_pago_mensajero = P` (:78-90).
  La cuenta por pagar no es una fila: se **deriva** como Σ devengo − Σ pago (`derivarCuentaPorPagar`,
  `lib/utils/cuenta-por-pagar.ts`).
- Ese bloque corre dentro de `asentarCierreDia` (`lib/repositories/_shared/asientos-cierre-dia.ts:185-205`).
  Para un cierre de satélite, **solo se llama al conciliar** (`lib/repositories/CierresBodegaAdminRepository.ts:676-686`).
- **El pago manual** (liquidación, feature 172) escribe un documento `liquidacion_pago` + un movimiento
  `pago / liquidacion` en el libro (`lib/services/LiquidacionService.ts:1032-1066`). **No toca la caja**:
  el egreso P ya se emitió al aprobar/conciliar (`WalletMensajeroFeedService.ts:19-21`;
  `LiquidacionService.ts:232-241`).
- **El pendiente que usa la liquidación NO sale del libro**, sale del snapshot del cierre:
  `derivarPendienteCierre = (P − min(P,E)) + premios vivos − pagos vigentes`
  (`lib/utils/pendiente-cierre.ts`; usado en `LiquidacionService.ts:1354-1366` y `:1083-1114`).
  Consecuencia: un cierre de satélite aprobado y **sin conciliar** ya es «pagable», aunque su libro esté
  vacío. Un pago ahí deja la cuenta por pagar del mensajero **en negativo** hasta la conciliación
  (el diseño de la 44, R16, dice que en el flujo normal nunca es negativa).

## 3. Consolidación y conciliación con la central

- **Deuda de la satélite** = Σ por cierre aprobado de `total_general − total_pago_mensajero −
  total_ingreso_bodega_rechazos` − lo recibido (SLT-73 R4/R5; `lib/utils/ingreso-empresa.ts:806-815`
  `paraLaCentral`; `lib/repositories/SaldosSatelitesRepository.ts:40-73`).
- **¿Se descuenta el pago del mensajero de lo que la satélite debe?** Sí, **siempre y completo (P)**,
  porque sale del snapshot del cierre. **¿Y si nadie lo registró?** Igual se descuenta: la fórmula no
  lee el libro ni `liquidacion_pago`.
- Al conciliar (`CierresBodegaAdminRepository.ts:676-690`), el cierre entra a los tres libros «como uno
  de la central» (SLT-73 R10): la caja recibe los ingresos y el egreso P; el libro del mensajero, el devengo
  P y el pago `min(P,E)`. Si se recibe menos, va una fila «diferencia de la satélite» a «Por cobrar a
  satélites» (D10/D12).
- **Contradicción con la feature 40.** La pantalla de consolidación del adminSatelite reparte el efectivo
  entre los pagos de los mensajeros, de menor a mayor y sin pagos parciales, y muestra
  **«Central debe»** lo que no alcanzó: `lib/services/CierreBodegaService.ts:94-128` («lo que queda sin
  pagar lo debe la central») y `:208-213`; rótulo y nota en
  `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:375-378` («El efectivo no alcanzó para
  pagarle a todos los mensajeros»); se pinta en `ConsolidacionBodegaModule.tsx:375-382`.
  Pero la deuda de SLT-73 ya le descontó a la satélite el P completo, así que **ese dinero se lo
  quedó la satélite**: si además la central lo pagara, sería un doble pago. Ese es el riesgo que
  describe el spec.
- Además, las dos reglas de «lo pagado del efectivo» difieren: por cierre, parcial, `min(P,E)` en el
  libro; por consolidación, atómica, de menor a mayor, en `repartirEfectivo`.

## 4. Si nadie registra el pago

- **Cuenta por pagar eterna**: tras conciliar, el mensajero de satélite con `E < P` queda con `P − E`
  pendiente en su libro, para siempre. SLT-73 lo dejó abierto
  (`specs/SLT-73-dinero-satelite-al-conciliar/requirements.md:261-264`, **Q4**: «Si el cierre es todo
  SINPE, el mensajero queda con cuenta por pagar aunque la satélite ya descontó P. Así está el caso de
  prod: P 6.000, efectivo 0. Por defecto no cambia»).
- Dónde se ve mal:
  - `/wallet/mensajeros`: lista y estado de cuenta (`lib/services/WalletMensajeroService.ts:90-190`).
    La lista no distingue mensajeros de satélite (`lib/types/wallet-mensajero.ts` no tiene zona/bodega).
  - El diálogo «Pagar»: con PA2 = (a), la mostraría como «deuda no imputable» (`LiquidacionService.ts:425-428`).
  - La analítica de cuentas por pagar (`lib/repositories/CuentasPorPagarAnaliticaRepository.ts:197`, `:280`).
  - La analítica de conciliación de cierres (`lib/repositories/ConciliacionCierresAnaliticaRepository.ts:284`).
- **La caja y la deuda de la satélite sí cierran**: el egreso P está en la caja y la deuda descuenta P.
  Lo único que no cierra es el **libro del mensajero**.
- No se encontró ningún aviso o notificación que dispare esa cuenta por pagar (búsqueda en
  `lib/notificaciones/catalogo-avisos.ts`).

## 5. Qué ve el mensajero de satélite

- `/cierre-dia` es su única pantalla de dinero (`lib/auth/menu-visibility.ts:628-630`). Ahí ve su
  **«Ganancia»** del día, `totalPagoMensajero` (`app/(app)/cierre-dia/_components/CierreDiaModule.tsx:305`,
  `:799-808`), y la columna por orden. **No ve** cuánto se le pagó ni cuánto se le debe.
- `/mis-pagos` (su cuenta por pagar) se **retiró** por decisión humana en la ficha 336
  (`lib/actions/wallet-mensajero.ts:43-49`; `lib/services/WalletMensajeroService.ts:32-35`).
- `/wallet` y `/mi-wallet` no son para él (`menu-visibility.ts:537-539`, `:280`).
- Conclusión: **la deuda eterna hoy no la ve el mensajero**, solo la central.

## 6. Decisiones que ya existen (literales)

- **172 P3** (`specs/172-liquidacion/requirements.md:380-387`): «maestro y admin; el `adminSatelite`
  queda fuera **aunque sí apruebe cierres**, porque aprobar un cierre y mover dinero no son la misma
  responsabilidad». Su design (`specs/172-liquidacion/design.md:510-514`) añade: «se aprueba, el
  mensajero queda libre, no aparece ninguna oferta de pago y **la deuda queda abierta y visible para
  quien tiene la caja**». La 172 (2026-08-01) da por hecho que **la central paga**; es anterior a SLT-73.
- **44 Qe/A2** (`specs/44-wallet-pago-mensajeros/requirements.md:282-284`, `:369-371`): «adminSatélite NO
  ve (egreso de la caja central del maestro)». A2 dejaba abierto: «Confirmar si el negocio requiere que la
  bodega satélite vea lo que se debe a sus mensajeros».
- **393, Carlos, 2026-09-08** (`specs/393-cierre-bodega-dos-cascadas/requirements.md:30-31`): «Las
  satélite descuentan de lo que le deben entregar a la central el pago a los mensajeros…».
- **SLT-73 D2** (`requirements.md:39`): «**Todo** lo de un cierre del día satélite espera a la
  conciliación…: COD, flete, comisión, IVA, pago al mensajero… Nada entra al aprobar».
- **SLT-73 D4** (`requirements.md:41`): «De la deuda **se descuentan** las ganancias de la satélite y lo
  que ella paga a sus mensajeros. La conciliación debe mostrar lo que le pertenece a la satélite».
- **SLT-73 Q4** (`requirements.md:261-264`): abierta y «por defecto no cambia» (citada arriba).
- **SLT-73 D15**: premios e incentivos no los escribe la aprobación; se quedan en el libro.
- **379** (`specs/379-zona-usuario-cierres-huerfanos/requirements.md:172-175`): `repartirEfectivo`
  «paga a los mensajeros **con el efectivo que hay físicamente en esa bodega**».
- **SLT-122 D1** (Carlos, 2026-11-10): solo la bodega dueña del cierre puede pagarlo.
- **T0.2** (`progress/features/SLT-122.md:43`): en prod hay 0 pagos vigentes contra cierres de satélite.

**Lectura conjunta:** el dinero del mensajero de satélite es de la satélite (393, D4), pero ninguna
decisión dice cómo queda saldado en el libro del mensajero. La 172 y la 44 se escribieron pensando
que la central paga, y el rótulo «Central debe» de la 40 sigue diciéndolo.

## 7. Alcance real del hueco: rutas que hoy tocan lo pagable de un cierre de satélite

| # | Ruta | Archivo:línea | ¿Mira el destino? | Efecto |
|---|---|---|---|---|
| 1 | Pago directo contra un cierre (`registrarPagoMensajeroAction`) | `lib/actions/liquidacion.ts:137`; `lib/services/LiquidacionService.ts:315-382`; lectura `lib/repositories/LiquidacionPagoRepository.ts:273-296` (WHERE `{ id }`) | No | La central paga cualquier cierre aprobado. La UI de `/cierres-admin` no lo ofrece, pero la acción sí lo acepta |
| 2 | Reparto «Pagar» de `/wallet/mensajeros` (previsualizar y registrar) | `LiquidacionService.ts:401-460`, `:511-637`; `imputablesDe` `:1083-1114`; `listarCierresImputables` `LiquidacionPagoRepository.ts:311-339` (WHERE `{ mensajeroId, estado }`) | No | Imputa en orden FIFO a cierres de satélite, **también sin conciliar** |
| 3 | Conteo de excluidos del reparto | `LiquidacionPagoRepository.ts:362+` (`contarCierresNoAprobadosPorEstado`) | No | Solo conteo |
| 4 | Incentivo (SLT-68) | `lib/services/IncentivoMensajeroService.ts:62` (cierre aprobado más reciente), `:80`, `:95-106` | No | Egreso de la caja central + devengo colgado de ese cierre, que **puede ser de satélite**. Se suma a lo pagable del cierre (`PagoMensajeroMovimientoRepository.ts:367-380`) |
| 5 | Premio del ranking (293) | `lib/services/PremioRankingDevengoService.ts:185-207` (`resolverCierreDelDia`, sin destino) | No | Igual que el 4: dinero de la central colgado de un cierre de satélite |
| 6 | Anular un pago o un reparto | `LiquidacionService.ts:805`, `:887`; `lib/actions/wallet-anulacion.ts:126` | No | El spec lo deja igual (R8) |
| 7 | Pendiente tras aprobar | `CierresAdminService.ts:1262`, `:1377-1392` | No | Es solo una lectura: el adminSatelite recibe la cifra, pero la UI no ofrece pagar |

¿Hay alguien que pueda pagar los premios/incentivos de un mensajero de satélite **si se cierran el 1
y el 2**? Nadie. Si en prod existen premios o incentivos colgados de cierres de satélite:
**DESCONOCIDO** (no se leyó producción). El código no impide que existan.

---

## Opciones

### A — Nadie registra el pago en el sistema (lo que dice hoy el spec)

- **Central:** no puede pagar cierres de satélite, ni directo ni por reparto (R1-R10).
  **AdminSatelite:** sigue sin pagar (172 P3). **Mensajero:** sin cambios (no ve nada).
- **Contabilidad:** la deuda de la satélite y la caja ya cierran (P descontado, egreso P). El libro del
  mensajero queda con `P − min(P,E)` pendiente **para siempre** cuando el efectivo no cubrió (SLT-73 Q4).
  En `/wallet/mensajeros` sale como «deuda no imputable», con el botón «Pagar» visible.
- **Tamaño:** el del spec, unos 16 archivos, sin esquema ni migración.
- **Riesgos:**
  1. Premios e incentivos colgados de cierres de satélite quedan **impagables** (filas 4 y 5).
  2. Cuentas por pagar «fantasma» en la wallet y en la analítica.
  3. El rótulo «Central debe» de la consolidación sigue diciendo lo contrario.

### B — El adminSatelite registra el pago de los cierres de su zona

- **Central:** no paga cierres de satélite. **AdminSatelite:** recibe «Registrar pago» en
  `/cierres-admin` para los cierres de su zona, y hay que decidir si también anula y si ve los
  comprobantes. **Mensajero:** igual.
- **Contabilidad:** no cambia la deuda (ya descuenta P) ni la caja (la liquidación no toca la caja). El
  libro se salda con un pago real: queda la constancia de quién pagó, cuándo y con qué comprobante.
- **Tamaño:** mediano, ruta completa.
  - Servicio: el guard de rol y el alcance por zona en el pago, y quizá en la anulación.
  - UI: la sección de pago en el detalle de satélite, que hoy es de solo lectura (SLT-104).
  - Comprobantes y tests de contraprueba de la 172.
  - Sin esquema.
- **Riesgos:**
  1. Revierte la 172 P3 y la 44 A2 (decisiones literales de Carlos).
  2. Pagar **antes de conciliar** deja el libro en negativo (el pendiente sale del snapshot y el
     devengo llega al conciliar). Haría falta exigir «conciliado» o cambiar la derivación.
  3. Si la satélite paga premios o incentivos, paga con su dinero algo que su deuda **no** le descuenta
     (es dinero de la central). Habría que limitar lo que paga a `P − min(P,E)`.
  4. Exige trabajo manual de la satélite por cada cierre con SINPE.

### C — La central registra el pago, pero se le carga a la deuda de la satélite

- **Central:** sigue pagando con «Pagar» y desde la acción directa. **AdminSatelite:** ve en su
  conciliación «pagado por la central a tus mensajeros», que suma a su deuda. **Mensajero:** igual.
- **Contabilidad:** la deuda (R4/R5) pasa a ser `… + Σ pagos vigentes de la central contra cierres de la
  zona`. Encaja con el rótulo «Central debe» de la 40: la central adelanta y la satélite le devuelve.
  Toca la fórmula única de la deuda (`aporte-satelite-sql.ts`, `SaldosSatelitesRepository`,
  `conciliacion-satelite.ts`), el «falta por recibir» de una consolidación **ya conciliada**
  (diferencia / «Corregir», D10-D13), el estado de cuenta de la bodega (458) y las tarjetas de
  `/wallet/satelites` y `/cierres-admin`.
- **Tamaño:** grande, ruta completa. Sin columna nueva (`liquidacion_pago.cierre_id` ya enlaza), pero
  con cambios en la conciliación y en pantallas de las dos partes.
- **Riesgos:**
  1. Reabre SLT-73 (D4, D10, D11), que es reciente y delicado.
  2. Un pago de la central después de conciliar mueve una deuda ya cerrada: hay que definir si genera
     diferencia nueva o si se bloquea.
  3. Contradice D1 de SLT-122 («solo la bodega dueña puede pagarlo»).

### D — La conciliación salda el libro: «pagado por la satélite» (lo sugiere el código)

- **Idea:** como la deuda ya descuenta P completo (D4), al conciliar se escribe en el libro del mensajero
  el pago de la parte no cubierta por el efectivo (`P − min(P,E)`) como pagado por la satélite, en vez
  de dejarla pendiente. Se escribe dentro de `WalletMensajeroFeedService` / `asentarCierreDia`, solo
  cuando el destino es satélite, con la misma idempotencia que ya existe.
- **Central:** no paga cierres de satélite (como A). **AdminSatelite:** no registra nada (172 P3 intacta).
  **Mensajero:** igual; si algún día vuelve una vista propia, verá «pagado por tu bodega».
- **Contabilidad:** libro, caja y deuda cuadran: devengo P = efectivo + pagado por la satélite. No hay
  deuda eterna y se cierra SLT-73 Q4.
- **Tamaño:** pequeño o mediano. Feed + asientos + tests de integración de la conciliación.
  **Toca el esquema:** un valor nuevo en el enum `PagoMensajeroMovimientoCategoria`
  (`db/schema.prisma:2526-2537`) más su migración. Reusar `pago_efectivo` con P mentiría («tomado del
  efectivo» cuando fue SINPE). Opcional: migración de datos para los cierres ya conciliados con
  pendiente (en prod hay al menos el caso de Q4: P 6.000, efectivo 0, según SLT-73).
- **Riesgos:**
  1. Si en la realidad la satélite **no** paga y el mensajero espera que pague la central, el sistema
     daría por pagado lo que no se pagó. Es justo lo que hoy afirma «Central debe».
  2. Las lecturas de la analítica que cuentan por categoría deben conocer la categoría nueva.

## Recomendación

**A + D, con una excepción para premios e incentivos.**

- A cierra el hueco de SLT-122 tal como lo decidió Carlos (D1). Es coherente con 172 P3, 393 y SLT-73
  D4, y es el arreglo mínimo.
- D quita la deuda eterna que A deja a la vista en `/wallet/mensajeros` y en la analítica, y salda en el
  libro lo que la deuda de la satélite ya dio por pagado. Puede ir en una ficha aparte que siga a
  SLT-122, porque toca el esquema.
- La excepción: que la central pueda seguir pagando, en cierres de satélite, **solo la parte de premios e
  incentivos vivos** (es dinero suyo; ya emitió el egreso en su caja). Si no, esos quedan sin dueño. Si
  no hay ninguno en prod (**DESCONOCIDO**, hay que medirlo como T0.2), se puede aplazar con una nota.
- B solo tiene sentido si Carlos quiere que la satélite deje constancia **pagando a mano** cada
  cierre. C solo si la realidad es la del rótulo «Central debe» (la central paga a los mensajeros de
  satélite). En ese caso hay que corregir antes D4, porque C y D4 no pueden ser verdad a la vez.

**Preguntas para Carlos (dependen de él):**

1. En la realidad, ¿quién le paga al mensajero de satélite lo que el efectivo no cubrió (SINPE o
   transferencia)? ¿La satélite (D4 → A/D) o la central (rótulo «Central debe» → C)?
2. ¿Los mensajeros de satélite reciben premios del ranking o incentivos? Si sí, ¿quién los paga?
3. ¿Se corrige o se retira el rótulo «Central debe» de la consolidación de la satélite?
