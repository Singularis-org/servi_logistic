import { z } from "zod";

import { aCentimos } from "@/lib/planes/centimos";

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

/** SLT-143 (design §4.1; R16) — lo aplicado a una factura por un pago confirmado. */
export interface AplicacionDeFacturaDTO {
  facturaId: string;
  numero: number;
  /** Texto con dos decimales, > 0. */
  monto: string;
}

/** SLT-143 (design §4.1; R16) — un pago confirmado vigente: confirmado y no anulado por la plataforma. */
export interface PagoConfirmadoDTO {
  id: string;
  /** Texto con dos decimales, > 0. */
  monto: string;
  /** La fecha del movimiento en la caja. */
  fecha: Date;
  /** La referencia del pago (la descripción del movimiento). */
  referencia: string | null;
  /** El nombre de quien lo registró en la empresa; `null` si lo registró la plataforma (`porFuera`) o sin dato. */
  registradoPor: string | null;
  /** ¿Lo registró el superadmin por fuera? (R13, R16). */
  porFuera: boolean;
  /** El nombre del superadmin que lo confirmó, o `null` sin dato. */
  confirmadoPor: string | null;
  confirmadoEl: Date;
  /** Las facturas a las que se aplicó, por número. */
  aplicaciones: AplicacionDeFacturaDTO[];
  /** ¿Tiene comprobante lateral? La ruta del archivo nunca sale del servidor (SLT-60 R33). */
  tieneComprobante: boolean;
}

export interface PagosDeEmpresa {
  /** Del más viejo al más nuevo (R12). */
  pagos: PagoPorConfirmarDTO[];
  /** De la más vieja a la más nueva (R14). */
  facturas: FacturaConSaldoDTO[];
  /** SLT-143 (R16): del confirmado más reciente al más viejo. */
  confirmados: PagoConfirmadoDTO[];
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
  // SLT-143 (design §4.1): la anulación de un pago confirmado.
  pago_no_confirmado: "El pago no está confirmado.",
  motivo_vacio: "El motivo de la anulación es obligatorio.",
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

/* -------------------------------------------------------------------------- */
/* SLT-143 — registrar un pago hecho por fuera y anular un pago confirmado     */
/* -------------------------------------------------------------------------- */

/**
 * El mayor monto que cabe en `wallet_movimiento.monto` (`DECIMAL(12,2)`). Más grande, el INSERT de la función
 * desbordaría la columna con un 22003 antes de que corra el tope (decisión del leader tras T0).
 */
export const MONTO_MAXIMO_PAGO_POR_FUERA = "9999999999.99";

export const TEXTOS_PAGO_POR_FUERA = {
  montoFormato: "El monto debe ser un número sin signo, con dos decimales como máximo.",
  montoNoPositivo: "El monto debe ser mayor que cero.",
  montoMaximo: "El monto es demasiado grande: no cabe en el libro de la caja.",
  referenciaVacia: "La referencia del pago es obligatoria.",
  repartoVacio: TEXTOS_CONFIRMACION.suma_distinta,
} as const;

const IMPORTE_DEL_LIBRO = /^\d+(\.\d{1,2})?$/;

/**
 * R7 — el monto del pago por fuera: > 0, dos decimales como máximo y que quepa en el importe del libro. Los
 * refines se protegen del formato: zod 4 los corre aunque la regex ya haya fallado.
 */
export const montoPagoPorFueraSchema = z
  .string()
  .trim()
  .regex(IMPORTE_DEL_LIBRO, { error: TEXTOS_PAGO_POR_FUERA.montoFormato })
  .refine((v) => !IMPORTE_DEL_LIBRO.test(v) || aCentimos(v) > BigInt(0), { error: TEXTOS_PAGO_POR_FUERA.montoNoPositivo })
  .refine((v) => !IMPORTE_DEL_LIBRO.test(v) || aCentimos(v) <= aCentimos(MONTO_MAXIMO_PAGO_POR_FUERA), {
    error: TEXTOS_PAGO_POR_FUERA.montoMaximo,
  });

/**
 * R1, R5, R7, R10 — lo que manda el formulario del registro por fuera. La `fecha` aquí es solo texto opcional: sus
 * reglas (las del egreso manual, SL-45 R12) dependen de la zona del país de la empresa y las aplica el servicio
 * con `fechaMovimientoSchema(zona)` de `lib/types/wallet.ts`, la misma pieza, sin copiarla. Este archivo llega a
 * componentes cliente y no importa `lib/types/wallet.ts`, que arrastra `@prisma/client`.
 * La referencia no tiene tope, como la `descripcion` de SL-45 (decisión del leader tras T0).
 */
export const registrarPagoPorFueraSchema = z.object({
  organizacionId: z.uuid(),
  claveIdempotencia: z.uuid(),
  monto: montoPagoPorFueraSchema,
  fecha: z.string().trim().optional(),
  referencia: z.string().trim().min(1, { error: TEXTOS_PAGO_POR_FUERA.referenciaVacia }),
  aplicaciones: z
    .array(z.object({ facturaId: z.uuid(), monto: importeSchema }))
    .min(1, { error: TEXTOS_PAGO_POR_FUERA.repartoVacio }),
});

/** R21, R23 — el motivo no tiene tope, como en la anulación de 458-B (decisión del leader tras T0). */
export const anularPagoConfirmadoSchema = z.object({
  organizacionId: z.uuid(),
  pagoId: z.uuid(),
  motivo: z.string().trim().min(1, { error: TEXTOS_CONFIRMACION.motivo_vacio }),
});

export type RegistrarPagoPorFueraInput = z.infer<typeof registrarPagoPorFueraSchema>;
export type AnularPagoConfirmadoInput = z.infer<typeof anularPagoConfirmadoSchema>;

/**
 * - `ok`: registrado, confirmado y repartido (R1);
 * - `ya_registrado`: la misma clave ya tenía pago; no se escribió nada (R10);
 * - `comprobante_no_guardado`: el archivo no se pudo guardar; no se registró nada (R9);
 * - `validation_error`: un campo (`monto`, `fecha`, `referencia`, `comprobante`) o el reparto
 *   (`aplicaciones.<facturaId>` o `aplicaciones`) no es válido (R5–R7).
 */
export type RegistrarPagoPorFueraResult =
  | { estado: "ok" }
  | { estado: "ya_registrado" }
  | { estado: "forbidden" }
  | { estado: "comprobante_no_guardado" }
  | { estado: "validation_error"; errores: Record<string, string> };

/**
 * - `ok`: anulado (R21);
 * - `ya_anulado`: ya lo estaba; no se escribió nada (R24, R27);
 * - `not_found`: no existe o es de otra empresa (R25);
 * - `no_confirmado`: está por confirmar; rechazarlo es SLT-142 (R25);
 * - `validation_error`: el motivo está vacío (R23).
 */
export type AnularPagoConfirmadoResult =
  | { estado: "ok" }
  | { estado: "ya_anulado" }
  | { estado: "not_found" }
  | { estado: "no_confirmado" }
  | { estado: "forbidden" }
  | { estado: "validation_error"; errores: Record<string, string> };

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
