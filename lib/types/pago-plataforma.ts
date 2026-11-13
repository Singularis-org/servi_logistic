import { z } from "zod";

// SLT-60 (design §4.4) — la confirmación del pago a la plataforma por el superadmin: lo que lee del detalle
// de una empresa (los pagos por confirmar y las facturas cerradas con saldo) y lo que manda al confirmar.
// Sin `@prisma/client`: estos tipos llegan al componente cliente del detalle. Los importes viajan como
// texto con dos decimales; un `number` perdería céntimos.

/** Un pago registrado por la empresa que aún no está confirmado ni anulado (R12, R32). */
export interface PagoPorConfirmarDTO {
  id: string;
  /** Texto con dos decimales, > 0. */
  monto: string;
  /** La fecha del movimiento en la caja. */
  fecha: Date;
  /** La referencia que escribió la empresa al registrarlo (la descripción del movimiento). */
  referencia: string | null;
  /** El nombre completo de quien lo registró, o `null` si el movimiento no lo trae. */
  registradoPor: string | null;
  /** ¿Tiene comprobante lateral? La ruta del archivo nunca sale del servidor (R33). */
  tieneComprobante: boolean;
}

/** Una factura cerrada de la empresa con saldo > 0, la única que puede recibir un pago (R14, R15). */
export interface FacturaConSaldoDTO {
  id: string;
  numero: number;
  desde: Date;
  /** Exclusivo: el último día de la factura es `hasta` − 1 ms. */
  hasta: Date;
  /** Textos con dos decimales; el saldo es > 0 (las de saldo 0 o negativo no salen). */
  total: string;
  saldo: string;
}

export interface PagosDeEmpresa {
  /** Del más viejo al más nuevo (R12). */
  pagos: PagoPorConfirmarDTO[];
  /** De la más vieja a la más nueva (R14). */
  facturas: FacturaConSaldoDTO[];
}

/** Lo que admite un monto del reparto: sin signo, con dos decimales como máximo y que quepa en `numeric(14,2)`. */
export const IMPORTE_REPARTO = /^\d{1,12}(\.\d{1,2})?$/;

/** Los textos de la confirmación, en un solo sitio. Forma impersonal (design §6.1). */
export const TEXTOS_CONFIRMACION = {
  formato: "El monto debe ser un número sin signo, con dos decimales como máximo.",
  monto_no_positivo: "El monto aplicado a una factura debe ser mayor que cero.",
  factura_no_valida: "Esta factura no admite el pago: no está cerrada, no es de la empresa o ya no tiene saldo.",
  supera_saldo: "El monto supera el saldo de la factura.",
  factura_repetida: "La factura aparece dos veces en el reparto.",
  suma_distinta: "El reparto debe sumar exactamente el monto del pago.",
} as const;

const importeSchema = z.string().trim().regex(IMPORTE_REPARTO, { error: TEXTOS_CONFIRMACION.formato });

export const verPagosDeEmpresaSchema = z.object({ organizacionId: z.uuid() });

export const confirmarPagoSchema = z.object({
  organizacionId: z.uuid(),
  pagoId: z.uuid(),
  aplicaciones: z
    .array(z.object({ facturaId: z.uuid(), monto: importeSchema }))
    .min(1, { error: TEXTOS_CONFIRMACION.suma_distinta }),
});

export type VerPagosDeEmpresaInput = z.infer<typeof verPagosDeEmpresaSchema>;
export type ConfirmarPagoInput = z.infer<typeof confirmarPagoSchema>;

export type VerPagosDeEmpresaResult =
  | { estado: "ok"; datos: PagosDeEmpresa }
  | { estado: "forbidden" }
  | { estado: "validation_error"; errores: Record<string, string> };

/**
 * - `ok`: confirmado y repartido (R16);
 * - `ya_confirmado`: ya lo estaba; no se escribió nada (R19);
 * - `not_found`: anulado, inexistente o de otra empresa (R20, R21);
 * - `validation_error`: el reparto no es válido (R15, R17). La clave es `aplicaciones.<facturaId>` para
 *   el error de una factura, o `aplicaciones` para el del reparto entero.
 */
export type ConfirmarPagoResult =
  | { estado: "ok" }
  | { estado: "ya_confirmado" }
  | { estado: "not_found" }
  | { estado: "forbidden" }
  | { estado: "validation_error"; errores: Record<string, string> };

/** El comprobante de un pago para el superadmin (design §4.8; R33, R34). La empresa la fija el servidor. */
export const verComprobantePagoSchema = z.object({ organizacionId: z.uuid(), pagoId: z.uuid() });

export type VerComprobantePagoInput = z.infer<typeof verComprobantePagoSchema>;

/**
 * - `ok`: el enlace temporal y el tipo del archivo; la ruta en el bucket nunca sale (R33);
 * - `sin_comprobante`: el pago no tiene comprobante (R34);
 * - `not_found`: el movimiento no es un pago a la plataforma de esa empresa (R34);
 * - `forbidden`: quien pide no es el superadmin (R34).
 */
export type VerComprobantePagoResult =
  | { estado: "ok"; url: string; contentType: string }
  | { estado: "sin_comprobante" }
  | { estado: "not_found" }
  | { estado: "forbidden" }
  | { estado: "validation_error"; errores: Record<string, string> };

/** La clave de `errores` para el error de una factura del reparto. */
export function claveDeFactura(facturaId: string): string {
  return `aplicaciones.${facturaId}`;
}
