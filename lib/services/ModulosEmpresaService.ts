import { esPlataforma } from "@/lib/auth/plataforma";
import type { IModulosEmpresaRepository } from "@/lib/interfaces/repositories/IModulosEmpresaRepository";
import type { IModulosEmpresaService } from "@/lib/interfaces/services/IModulosEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MODULOS_APAGABLES, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import {
  fijarModuloEmpresaSchema,
  type FijarModuloEmpresaResult,
  verModulosEmpresaSchema,
  type VerModulosEmpresaResult,
} from "@/lib/types/modulos-empresa";

// SL-23 (design §5.2; R9–R13) — el orden es fijo y es parte del contrato: primero quién (R10), luego
// qué (R11, zod), luego si la empresa existe (R11), y al final el repositorio. Así ningún rol de
// empresa —tampoco el `maestro` de esa misma empresa— llega a la base, ni para un error de validación.

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

export class ModulosEmpresaService implements IModulosEmpresaService {
  constructor(private readonly repo: IModulosEmpresaRepository) {}

  async ver(actor: Actor | null, input: unknown): Promise<VerModulosEmpresaResult> {
    if (!esSuperadmin(actor)) return { estado: "forbidden" };
    const parsed = verModulosEmpresaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error" };

    const empresa = await this.repo.empresa(parsed.data.organizacionId);
    if (empresa === null) return { estado: "not_found" };
    const activos = new Set(await this.repo.activos(empresa.id));
    return {
      estado: "ok",
      empresa: {
        organizacionId: empresa.id,
        nombre: empresa.nombre,
        modulos: ORDEN_MODULOS.map((clave) => ({
          clave,
          nombre: MODULOS_APAGABLES[clave].nombre,
          activo: activos.has(clave),
        })),
      },
    };
  }

  async fijar(actor: Actor | null, input: unknown): Promise<FijarModuloEmpresaResult> {
    if (!esSuperadmin(actor)) return { estado: "forbidden" };
    const parsed = fijarModuloEmpresaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error" };

    const { organizacionId, modulo, activo } = parsed.data;
    if ((await this.repo.empresa(organizacionId)) === null) return { estado: "not_found" };
    const cambio = activo
      ? await this.repo.encender(organizacionId, modulo, actor.usuarioId)
      : await this.repo.apagar(organizacionId, modulo, actor.usuarioId);
    return { estado: "ok", cambio };
  }
}
