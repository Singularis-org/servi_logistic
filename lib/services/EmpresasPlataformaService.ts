import type { IEmpresasPlataformaRepository } from "@/lib/interfaces/repositories/IEmpresasPlataformaRepository";
import type {
  ActorEmpresasPlataforma,
  EsRolDePlataforma,
  IEmpresasPlataformaService,
} from "@/lib/interfaces/services/IEmpresasPlataformaService";
import type { ListarEmpresasResultado } from "@/lib/types/empresas-plataforma";

/**
 * SL-32 — el listado de empresas del superadmin (R29, R35).
 *
 * El predicado de plataforma llega por constructor y no se importa, para que el test de R35 pueda
 * cambiarlo. En produccion es `esPlataforma` (`lib/auth/plataforma.ts`), cableado en
 * `lib/actions/_shared/empresas-plataforma.ts`; aqui no hay ningun literal de rol.
 */
export class EmpresasPlataformaService implements IEmpresasPlataformaService {
  constructor(
    private readonly repo: IEmpresasPlataformaRepository,
    private readonly esPlataforma: EsRolDePlataforma,
  ) {}

  async listarEmpresas(actor: ActorEmpresasPlataforma | null): Promise<ListarEmpresasResultado> {
    // R35: el rechazo va antes de leer, asi un rol de empresa no dispara la consulta de plataforma.
    if (!actor || !this.esPlataforma(actor.rol)) return { status: "forbidden" };
    const empresas = await this.repo.listar();
    return { status: "ok", empresas };
  }
}
