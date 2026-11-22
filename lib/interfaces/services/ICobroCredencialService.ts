import type { TrioCredencialCobro } from "@/lib/interfaces/external/IProveedorCobro";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-227 (design §8.3; R8–R10, R12) — guardar y consultar las credenciales de un proveedor de cobro. Solo el
// superadmin. Ninguna respuesta lleva un secreto, ni en claro ni cifrado.

export type GuardarCredencialResult =
  | { estado: "ok"; campos: string[] }
  /** `campos` nombra lo que falló, nunca su valor: alguien pudo pegar ahí una clave. */
  | { estado: "validation_error"; campos: string[] }
  | { estado: "forbidden" | "pais_no_existe" | "proveedor_no_disponible" | "conflicto" };

/** R9: si hay credenciales, los nombres de los campos y el último cambio. Nunca un valor. */
export type EstadoCredencialCobro =
  | { configurada: false }
  | { configurada: true; campos: string[]; actualizadoAt: Date; actualizadoPor: string | null };

export type EstadoCredencialResult = { estado: "forbidden" } | ({ estado: "ok" } & EstadoCredencialCobro);

export interface ICobroCredencialService {
  /** `entrada` es lo que llega del borde: se valida aquí con `guardarCredencialSchema` (R8). */
  guardar(actor: Actor, entrada: unknown): Promise<GuardarCredencialResult>;
  estado(actor: Actor, trio: TrioCredencialCobro): Promise<EstadoCredencialResult>;
}
