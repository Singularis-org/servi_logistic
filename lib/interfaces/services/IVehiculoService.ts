import type { RolValue } from "@prisma/client";
import type {
  CambiarActivacionVehiculoInput,
  CrearVehiculoInput,
  RenombrarVehiculoInput,
  VehiculoDTO,
} from "@/lib/types/vehiculos";

// Actor autenticado que ejecuta la operacion. El rol se resuelve desde la sesion
// (resolveActorFromSession) y determina la autorizacion. Otros servicios importan este tipo.
export interface Actor {
  usuarioId: string;
  rol: RolValue;
}

// Resultados de dominio del servicio (sin acoplarse a HTTP). El borde (Server
// Action) los traduce/expone. `unauthenticated` no aparece aqui: lo resuelve la
// Server Action antes de llamar al service.
export type ListarVehiculosServiceResult =
  | { status: "ok"; items: VehiculoDTO[] }
  | { status: "forbidden" };

export type CrearVehiculoServiceResult =
  | { status: "ok"; vehiculo: VehiculoDTO }
  | { status: "forbidden" }
  | { status: "conflict" }; // ya existe un tipo con ese nombre (UNIQUE), activo o no (R10)

export type RenombrarVehiculoServiceResult =
  | { status: "ok"; vehiculo: VehiculoDTO }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "conflict" };

export type CambiarActivacionVehiculoServiceResult =
  | { status: "ok"; vehiculo: VehiculoDTO }
  | { status: "forbidden" }
  | { status: "not_found" };

// SL-42 (design §4.2): el catalogo es de la plataforma. Las empresas solo lo leen (`listar`, el
// `maestro`, R17); el superadmin lo lista entero y lo gestiona. No hay borrado (P1, R8).
export interface IVehiculoService {
  listar(actor: Actor): Promise<ListarVehiculosServiceResult>;
  listarTodos(actor: Actor): Promise<ListarVehiculosServiceResult>;
  crear(input: CrearVehiculoInput, actor: Actor): Promise<CrearVehiculoServiceResult>;
  renombrar(input: RenombrarVehiculoInput, actor: Actor): Promise<RenombrarVehiculoServiceResult>;
  cambiarActivacion(
    input: CambiarActivacionVehiculoInput,
    actor: Actor,
  ): Promise<CambiarActivacionVehiculoServiceResult>;
}
