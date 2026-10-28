import { z } from "zod";

// SL-40 (design §5, §8) — el valor global del cobro por orden y la excepción por empresa, que fija
// el superadmin. Desde SL-45 también la deuda de la wallet (`DeudaPlataformaDTO`), que comparten la
// wallet y la pantalla «Empresas» (design §3, §9).

/** El mensaje bajo el campo: es el que pinta la pantalla «Empresas» (design §9.1, punto 4). */
export const MENSAJE_MONTO_COBRO_INVALIDO =
  "Escribe un importe mayor o igual que cero, con dos decimales como máximo.";

/**
 * R4: el importe viaja como TEXTO y se valida como texto, sin pasar nunca por `Number` (perdería
 * céntimos). Diez cifras enteras y dos decimales como máximo es justo lo que cabe en `DECIMAL(12,2)`;
 * sin signo, así que un negativo no entra. El `CHECK (monto >= 0)` de la base es la segunda red.
 */
export const montoCobroSchema = z
  .string({ error: MENSAJE_MONTO_COBRO_INVALIDO })
  .regex(/^\d{1,10}(\.\d{1,2})?$/, { error: MENSAJE_MONTO_COBRO_INVALIDO });

export const fijarCobroGlobalSchema = z.object({ monto: montoCobroSchema });

/** `monto: null` quita la excepción: la empresa vuelve al valor global (R5). */
export const fijarCobroEmpresaSchema = z.object({
  organizacionId: z.string().min(1),
  monto: montoCobroSchema.nullable(),
});

/** `monto: null` = sin configurar: la tarifa vigente es 0,00 (R3, R9). */
export type CobroGlobalDTO = { monto: string | null };

export type FijarCobroGlobalInput = z.infer<typeof fijarCobroGlobalSchema>;
export type FijarCobroEmpresaInput = z.infer<typeof fijarCobroEmpresaSchema>;

export type VerCobroGlobalResult = { status: "ok"; cobroGlobal: CobroGlobalDTO } | { status: "forbidden" }; // R6

export type FijarCobroResult =
  | { status: "ok" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> } // R4
  | { status: "not_found" } // R7
  | { status: "forbidden" }; // R6

/** SL-45 (design §3, R14): el estado de la deuda, decidido en el servidor por el signo. */
export type EstadoDeudaPlataforma = "debe" | "al_dia" | "a_favor";

/**
 * SL-45 (design §3, R13, R14) — la deuda de la empresa con la plataforma, derivada en el servidor.
 * Los tres campos son texto con dos decimales: la pantalla los pinta sin comparar ni convertir.
 * `deuda` conserva su significado de SL-40 cuando no hay pagos (Σ cargos − Σ reversos).
 */
export type DeudaPlataformaDTO = {
  /** Con signo: "500.00", "0.00", "-500.00". */
  deuda: string;
  estado: EstadoDeudaPlataforma;
  /** |deuda|: lo que se pinta en la región (R3: a favor, en positivo). */
  importe: string;
};

/** SL-45 (R9): el mensaje bajo el monto cuando el pago supera la deuda o no hay deuda. */
export const MENSAJE_TOPE_PAGO_PLATAFORMA = "El pago no puede ser mayor que lo que la empresa debe a la plataforma.";
