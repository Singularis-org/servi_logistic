import type { EstadoIntegracionesResultado, ListarEmpresasResultado } from "@/lib/types/empresas-plataforma";

// SL-32 — contrato del servicio del listado de la pantalla «Empresas» (R29, R35).

/**
 * Lo minimo del actor que necesita el servicio: su rol. Es `string` y no `RolValue` porque el enum
 * todavia no tiene `superadmin` (llega en T3). Cualquier `Actor` de la app encaja en esta forma.
 */
export type ActorEmpresasPlataforma = { rol: string };

/** Decide si un rol es de la plataforma. En produccion, `esPlataforma` de `lib/auth/plataforma.ts` (T14b). */
export type EsRolDePlataforma = (rol: string) => boolean;

export interface IEmpresasPlataformaService {
  /**
   * `forbidden` si no hay actor o su rol no es de la plataforma, sin leer nada (R35). Si lo es,
   * el listado del repositorio tal cual (R29).
   */
  listarEmpresas(actor: ActorEmpresasPlataforma | null): Promise<ListarEmpresasResultado>;

  /**
   * SL-36 (R37): `forbidden` si no hay actor o su rol no es de la plataforma, sin leer nada. Si lo
   * es, el estado de cada integración de cada empresa, y nada más.
   */
  estadoIntegraciones(actor: ActorEmpresasPlataforma | null): Promise<EstadoIntegracionesResultado>;
}
