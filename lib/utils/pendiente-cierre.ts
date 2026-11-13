import { Prisma } from "@prisma/client";
import { calcularSplitPago } from "@/lib/utils/cuenta-por-pagar";

/**
 * Feature 172 (design §5, R22/R24/R80) — DERIVA lo que de UN cierre sigue sin entregarse al
 * mensajero. Funcion PURA, money-safe: `Prisma.Decimal` en todo el calculo y STRING de escala
 * 2 en la salida. Cero coma flotante: no hay conversion a numero en ningun punto, y un test
 * lo afirma leyendo este mismo archivo.
 *
 * **Feature 293 (design §5, R24/R25/R26) — LO PAGABLE DE UN CIERRE GANA UN TERMINO:**
 *
 *     pendienteDelCierre = calcularSplitPago(P, E).pendiente + premiosVivos − Σ pagos VIGENTES
 *
 * **SLT-123 (R315):** si el cierre lleva `pago_independiente_efectivo`, el primer termino es `P`
 * completo (su pago no salio del efectivo): `P + premiosVivos − Σ pagos VIGENTES`.
 *
 * **SLT-139 (R338):** en un cierre con la marca se resta ademas lo «pagado por la satelite»: Σ de
 * los `pago_satelite` del libro con origen en ese cierre. En un cierre sin la marca ese termino se
 * IGNORA aunque venga distinto de cero: la formula vieja queda igual pase lo que pase en el libro.
 *
 * `P` es `cierre_dia.total_pago_mensajero` (snapshot de la 39) y `E` es
 * `cierre_dia.total_efectivo` (snapshot de la 37). **Ninguno de los dos se reescribe jamas**
 * (293/R13): el snapshot sigue diciendo lo que dijo el dia en que se aprobo el cierre, y el
 * premio entra como un termino APARTE, derivado de filas propias del libro.
 *
 * La regla `min(P, E)` NO se reimplementa aqui: se reutiliza `calcularSplitPago` (feature 44),
 * que es su fuente UNICA. Si algun dia esa regla cambiara, cambia en un solo sitio.
 *
 * **`premiosVivos` se suma FUERA de `calcularSplitPago`, y es la linea que no se puede cruzar**
 * (293/R25, alternativa D de su §11). Meterlo dentro —`P + premio` contra `E`— daria el premio
 * por ENTREGADO cada vez que el efectivo del dia sobrara, y ese efectivo NUNCA contuvo el
 * premio; ademas cambiaria, a posteriori, el `min(P,E)` que el feed ya escribio al aprobar.
 *
 * **`pagadoVigente` son SOLO los pagos vigentes (172/R80).** Un pago anulado no entra en esa
 * suma —quien la calcula excluye los que tienen fila en `liquidacion_anulacion`—, y eso es
 * exactamente lo que hace que su monto vuelva a estar adeudado (R79) sin ningun recalculo
 * especial. Simetricamente, `premiosVivos` ya viene NETO de las compensaciones de anulacion
 * (293/§5), asi que anular un premio baja lo pagable por la misma via y sin caso especial.
 *
 * **PARAMETRO POR OBJETO, y no es estilo** (293/design §5.2). Los cuatro campos son montos del
 * mismo tipo: en posicional, un orden equivocado COMPILA y descuadra en silencio. Con campos
 * nombrados, no. Y como el objeto es obligatorio, cada consumidor deja de compilar hasta que
 * decida que hace con el premio: el barrido de los consumidores lo impone el compilador, no la
 * memoria de nadie.
 *
 * Nunca devuelve un negativo: el tope lo impone el servicio antes de escribir ([P1], R25), pero
 * si un dato historico dejara la resta por debajo de cero, lo correcto que puede decir esta
 * funcion es que no queda nada pendiente, no una deuda al reves.
 */
interface PendienteCierreBase {
  /** `P` — `cierre_dia.total_pago_mensajero`, el snapshot de la 39. Nunca se reescribe (R13). */
  pagoDebido: string | Prisma.Decimal;
  /** `E` — `cierre_dia.total_efectivo`, el snapshot de la 37. */
  efectivo: string | Prisma.Decimal;
  /**
   * 293/R24 — Σ de los premios VIVOS imputados a ESTE cierre: Σ `premio_ranking` menos Σ de sus
   * compensaciones (`ajuste_pago` con `premio_dia`). Lo calcula
   * `IPagoMensajeroMovimientoRepository.sumarPremiosVivosPorCierre` con UNA consulta por
   * listado. Sin premios es `"0.00"` y esta funcion devuelve exactamente lo que devolvia antes.
   */
  premiosVivos: string | Prisma.Decimal;
  /** 172/R80 — Σ de los pagos VIGENTES registrados contra este cierre (los anulados no entran). */
  pagadoVigente: string | Prisma.Decimal;
}

/**
 * La entrada es una UNION discriminada por la marca (SLT-139, design §5.1): con la marca en `true`,
 * `pagadoPorSatelite` es obligatorio. Un consumidor que pasa la marca como `boolean` no compila sin
 * el termino; los tests de la regla vieja (`false` literal) siguen compilando sin el.
 *
 *   - `pagoIndependienteEfectivo` — SLT-123 (R315, R325, R327) — `cierre_dia.pago_independiente_efectivo`
 *     del PROPIO cierre. Es la UNICA fuente de la regla: nunca la fecha, el destino ni el libro.
 *     `true` = el pago no sale del efectivo y lo generado es `P` completo; `false` = la regla de la
 *     44, `P − min(P, E)`, como siempre. Obligatorio (mismo argumento que la 293).
 *   - `pagadoPorSatelite` — SLT-139 (R338) — Σ `pago_satelite` del libro con origen en este cierre
 *     (`IPagadoPorSateliteLectura.sumarPagadoSatelitePorCierre`, una lectura por pagina).
 */
export type PendienteCierreInput = PendienteCierreBase &
  (
    | { pagoIndependienteEfectivo: false; pagadoPorSatelite?: string | Prisma.Decimal }
    | { pagoIndependienteEfectivo: true; pagadoPorSatelite: string | Prisma.Decimal }
  );

/**
 * SLT-139 (R335, R344) — un servicio que tiene delante un cierre NUEVO y no recibio la lectura de
 * «pagado por la satelite» no puede decir cuanto queda pendiente: lanza esto en vez de inventar una
 * cifra. En produccion no ocurre (las acciones inyectan el repositorio real; lo prueba
 * `cierre-dia-pendiente-cableado.test.ts`).
 */
export class LecturaPagadoSateliteAusenteError extends Error {
  constructor(contexto: string) {
    super(`SLT-139: falta la lectura de «pagado por la satelite» (${contexto}); no se calcula el pendiente`);
    this.name = "LecturaPagadoSateliteAusenteError";
  }
}

export function derivarPendienteCierre(input: PendienteCierreInput): string {
  const { pagoDebido, efectivo, premiosVivos, pagadoVigente, pagoIndependienteEfectivo } = input;
  // SLT-123 (R315): con la marca, el efectivo no entra: lo generado es `P` entero, redondeado como
  // en `calcularSplitPago`. Sin ella (R325), `P − min(P, E)` de la fuente unica de la 44.
  const generadoPorElCierre = pagoIndependienteEfectivo
    ? new Prisma.Decimal(pagoDebido).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal(calcularSplitPago(pagoDebido, efectivo).pendiente);
  // R25: el premio se SUMA aparte, despues del `min(P, E)` y sin tocarlo.
  const premio = new Prisma.Decimal(premiosVivos).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  const yaEntregado = new Prisma.Decimal(pagadoVigente).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  // SLT-139 (R338): lo pagado por la satelite solo cuenta en un cierre con la marca.
  const pagadoPorSatelite = input.pagoIndependienteEfectivo
    ? new Prisma.Decimal(input.pagadoPorSatelite).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal(0);
  const pendiente = generadoPorElCierre.add(premio).sub(yaEntregado).sub(pagadoPorSatelite);
  return pendiente.gt(0) ? pendiente.toFixed(2) : "0.00";
}

/**
 * SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (R382, PA1 del 2026-11-12) — lo
 * ENTREGADO al mensajero por un cierre aprobado: `(P + premios vivos) − pendiente`.
 *
 * Sale de la MISMA entrada y de la MISMA fuente que el pendiente (`derivarPendienteCierre`): no hay una
 * segunda regla. Todo lo que cuente como entregado alli —lo que el efectivo ya cubrio en la regla de
 * la 44, los pagos vigentes, lo pagado por la satelite de SLT-139— cuenta aqui sin tocar esta funcion.
 *
 * Los premios vivos entran en lo debido (PA1): sin ellos, un premio sin pagar daria un entregado
 * negativo. Como el pendiente nunca baja de cero y lo generado nunca supera `P`, el resultado queda en
 * `[0, P + premios]`. Money-safe: `Prisma.Decimal` y STRING de escala 2, sin coma flotante.
 */
export function derivarPagoEntregadoCierre(input: PendienteCierreInput): string {
  const debido = new Prisma.Decimal(input.pagoDebido)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    .add(new Prisma.Decimal(input.premiosVivos).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
  return debido.sub(derivarPendienteCierre(input)).toFixed(2);
}
