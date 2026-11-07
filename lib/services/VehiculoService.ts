import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import type { IVehiculoRepository } from "@/lib/interfaces/repositories/IVehiculoRepository";
import type {
  Actor,
  CambiarActivacionVehiculoServiceResult,
  CrearVehiculoServiceResult,
  IVehiculoService,
  ListarVehiculosServiceResult,
  RenombrarVehiculoServiceResult,
} from "@/lib/interfaces/services/IVehiculoService";
import type {
  CambiarActivacionVehiculoInput,
  CrearVehiculoInput,
  RenombrarVehiculoInput,
} from "@/lib/types/vehiculos";

// Autz del catalogo vehiculos (SL-42, design §3; SL-17 D12). El catalogo es de la plataforma:
// - la lectura de empresa sigue siendo del `maestro`, que lo usa en el formulario de usuarios (R17);
// - la gestion es del superadmin (R4–R7). Un rol de empresa recibe `forbidden` antes de tocar el
//   repositorio (R14): desde SL-17 su escritura fallaria en la base con un error crudo.
// `GESTION_ROLES` lee `ROLES_PLATAFORMA` por import: la guardia `superadmin-fuera-de-empresa`
// rechaza el literal. La falta de sesion (`unauthenticated`) se resuelve antes, en el borde.
const READ_ROLES = new Set<string>(["maestro"]);
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);

export class VehiculoService implements IVehiculoService {
  constructor(private readonly repo: IVehiculoRepository) {}

  async listar(actor: Actor): Promise<ListarVehiculosServiceResult> {
    if (!READ_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", items: await this.repo.findMany() };
  }

  /** R2: activos e inactivos, por nombre. */
  async listarTodos(actor: Actor): Promise<ListarVehiculosServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", items: await this.repo.findMany() };
  }

  async crear(input: CrearVehiculoInput, actor: Actor): Promise<CrearVehiculoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    // El nombre llega YA normalizado por el schema del borde, asi que la comprobacion de
    // duplicado compara la misma forma que se va a persistir. Un inactivo con ese nombre tambien
    // es `conflict` (R10): el UNIQUE no mira el estado.
    if (await this.repo.findByName(input.name)) return { status: "conflict" };

    return { status: "ok", vehiculo: await this.repo.create(input.name, actor.usuarioId) };
  }

  async renombrar(input: RenombrarVehiculoInput, actor: Actor): Promise<RenombrarVehiculoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const existente = await this.repo.findById(input.id);
    if (!existente) return { status: "not_found" };
    // R5/R21: a su propio nombre es exito sin escribir, y sin rastro.
    if (existente.name === input.name) return { status: "ok", vehiculo: existente };

    const conEseNombre = await this.repo.findByName(input.name);
    if (conEseNombre && conEseNombre.id !== input.id) return { status: "conflict" };

    const renombrado = await this.repo.rename(input.id, input.name, actor.usuarioId);
    if (!renombrado) return { status: "not_found" };
    return { status: "ok", vehiculo: renombrado };
  }

  async cambiarActivacion(
    input: CambiarActivacionVehiculoInput,
    actor: Actor,
  ): Promise<CambiarActivacionVehiculoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const existente = await this.repo.findById(input.id);
    if (!existente) return { status: "not_found" };
    // R6/R21: pedir el estado que ya tiene es exito sin escribir, y sin rastro.
    if (existente.activo === input.activo) return { status: "ok", vehiculo: existente };

    const cambiado = await this.repo.setActivo(input.id, input.activo, actor.usuarioId);
    if (!cambiado) return { status: "not_found" };
    return { status: "ok", vehiculo: cambiado };
  }
}
