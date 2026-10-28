import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FijarModuloEmpresaResult, VerModulosEmpresaResult } from "@/lib/types/modulos-empresa";

// SL-23 (design §5.2; R8–R13) — ver y cambiar los módulos de una empresa. Solo el superadmin.

export interface IModulosEmpresaService {
  /** Los 3 módulos de la empresa con su estado. `forbidden` sin leer nada si no es el superadmin (R10). */
  ver(actor: Actor | null, input: unknown): Promise<VerModulosEmpresaResult>;
  /** Enciende o apaga un módulo. La entrada llega sin tipar desde el borde (R11). */
  fijar(actor: Actor | null, input: unknown): Promise<FijarModuloEmpresaResult>;
}
