import type { ArranqueSuperadminResultado } from "@/lib/types/arranque-superadmin";

// SL-32 — contrato del servicio del comando `pnpm arranque:superadmin`. Recibe el entorno crudo
// (`process.env`) para que la validacion de R13 viva en un solo sitio y no en el script.

/** Variables de entorno tal como llegan: cualquier clave, cualquier valor o ninguno. */
export type EntornoArranque = Readonly<Record<string, string | undefined>>;

export interface IArranqueSuperadminService {
  /** Valida las seis variables de R12, hashea la contrasena y delega la escritura. */
  arrancar(entorno: EntornoArranque): Promise<ArranqueSuperadminResultado>;
}
