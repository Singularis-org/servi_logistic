import { aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import {
  claveDeFactura,
  IMPORTE_REPARTO,
  TEXTOS_CONFIRMACION,
  type FacturaConSaldoDTO,
} from "@/lib/types/pago-plataforma";

// SLT-60 (design §5; R14, R17) — la propuesta del reparto de un pago entre las facturas cerradas, y su resumen
// para la ayuda en pantalla. Puro y sin `@prisma/client`: corre en el diálogo del superadmin. En céntimos
// `bigint` (`lib/planes/centimos.ts`): ni `Number(` ni `parseFloat`.
//
// Quien decide si un reparto vale es la base (`pago_plataforma_confirmar`): entre la lectura y la
// confirmación otra confirmación pudo bajar un saldo. Esto solo evita mandar algo que ya se sabe que caerá.

const CERO = BigInt(0);

/**
 * R14: de la más vieja a la más nueva, a cada factura el menor entre su saldo y lo que falta repartir,
 * hasta agotar el pago. Las que no reciben nada van con `"0.00"`. Las facturas ya llegan por `desde`.
 */
export function proponerReparto(monto: string, facturas: readonly FacturaConSaldoDTO[]): Record<string, string> {
  let resto = aCentimosConSigno(monto);
  const propuesta: Record<string, string> = {};
  for (const f of facturas) {
    const saldo = aCentimosConSigno(f.saldo);
    const aplicado = resto <= CERO || saldo <= CERO ? CERO : resto < saldo ? resto : saldo;
    propuesta[f.id] = aTexto(aplicado);
    resto -= aplicado;
  }
  return propuesta;
}

export interface ResumenDelReparto {
  /** Σ de los montos bien escritos. */
  suma: string;
  /** Monto del pago − suma; negativo si se repartió de más. */
  falta: string;
  /** `aplicaciones.<facturaId>` (formato, saldo) o `aplicaciones` (la suma), con su texto. */
  errores: Record<string, string>;
  /** Sin errores y con la suma igual al monto. */
  valido: boolean;
}

/**
 * R17, para la pantalla: cada monto con formato válido (vacío = 0) y no mayor que el saldo de su factura,
 * y la suma igual al monto del pago. `montos` va por id de factura; una factura sin entrada cuenta como 0.
 */
export function resumenDelReparto(
  monto: string,
  facturas: readonly FacturaConSaldoDTO[],
  montos: Readonly<Record<string, string>>,
): ResumenDelReparto {
  const errores: Record<string, string> = {};
  let suma = CERO;
  for (const f of facturas) {
    const escrito = (montos[f.id] ?? "").trim();
    if (escrito === "") continue;
    if (!IMPORTE_REPARTO.test(escrito)) {
      errores[claveDeFactura(f.id)] = TEXTOS_CONFIRMACION.formato;
      continue;
    }
    const centimos = aCentimosConSigno(escrito);
    if (centimos > aCentimosConSigno(f.saldo)) errores[claveDeFactura(f.id)] = TEXTOS_CONFIRMACION.supera_saldo;
    suma += centimos;
  }
  const falta = aCentimosConSigno(monto) - suma;
  if (falta !== CERO) errores.aplicaciones = TEXTOS_CONFIRMACION.suma_distinta;
  return { suma: aTexto(suma), falta: aTexto(falta), errores, valido: Object.keys(errores).length === 0 };
}
