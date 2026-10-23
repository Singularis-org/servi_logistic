import type { AltaEmpresaResultado } from "@/lib/types/organizacion";

/** SL-17 (design §7.7) — el alta de empresa que usa el superadmin. */
export interface IOrganizacionService {
  /**
   * Crea la organización y su primer maestro en una sola transacción (R44), idempotente por slug
   * con el mismo email (R45). La entrada llega sin validar: el servicio la valida (R46).
   */
  altaEmpresa(input: unknown): Promise<AltaEmpresaResultado>;
}
