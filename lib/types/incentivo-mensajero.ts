import { z } from "zod";

import { claveIdempotenciaSchema, fechaMovimientoSchema, montoPositivoSchema } from "@/lib/types/wallet";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-68 (design §6) — el INCENTIVO MANUAL A UN MENSAJERO: bordes y resultados.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Las piezas del borde son las de los demas conceptos manuales de Wallet, sin copiar (R3): el monto
// STRING > 0 con hasta 2 decimales, la fecha `YYYY-MM-DD` valida, no futura y dentro de la ventana
// del registro manual (por defecto, hoy), y la clave de idempotencia del dialogo. `.strict()`: un
// `cierreId` o un `tipo` colados en el payload mueren aqui con `validation_error`.

export const registrarIncentivoMensajeroSchema = z
  .object({
    mensajeroId: z.string().uuid("Elegí un mensajero."),
    monto: montoPositivoSchema,
    motivo: z.string().trim().min(1, "El motivo es obligatorio."),
    fecha: fechaMovimientoSchema.optional(),
    claveIdempotencia: claveIdempotenciaSchema,
  })
  .strict();

export type RegistrarIncentivoMensajeroInput = z.infer<typeof registrarIncentivoMensajeroSchema>;

/** R13 — anular: el incentivo y un motivo. SIN monto: el del contraasiento se lee del incentivo. */
export const anularIncentivoMensajeroSchema = z
  .object({
    incentivoId: z.string().uuid(),
    motivo: z.string().trim().min(1, "El motivo de la anulación es obligatorio."),
  })
  .strict();

export type AnularIncentivoMensajeroInput = z.infer<typeof anularIncentivoMensajeroSchema>;

/** Lo que vuelve del registro. Montos STRING escala 2. */
export type IncentivoRegistradoDTO = {
  id: string;
  monto: string;
  cierreId: string;
  mensajeroNombre: string;
};

export type RegistrarIncentivoMensajeroResult =
  | { status: "ok"; incentivo: IncentivoRegistradoDTO; cuentaPorPagar: string }
  | { status: "ya_registrado" }
  | { status: "sin_cierre_aprobado" }
  | { status: "no_encontrado" }
  | { status: "forbidden" };

export type AnularIncentivoMensajeroResult =
  | { status: "ok" }
  | { status: "ya_anulado" }
  | { status: "no_encontrado" }
  | { status: "forbidden" };

/** Lo que el borde añade a los resultados del dominio. */
export type ErrorDeBordeIncentivo =
  | { status: "unauthenticated" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };

export type RegistrarIncentivoMensajeroActionResult = RegistrarIncentivoMensajeroResult | ErrorDeBordeIncentivo;
export type AnularIncentivoMensajeroActionResult = AnularIncentivoMensajeroResult | ErrorDeBordeIncentivo;
