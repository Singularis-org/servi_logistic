import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type {
  CambiarDisponibilidadPaisServiceResult,
  CrearPaisServiceResult,
  IPaisService,
  ListarPaisesDisponiblesServiceResult,
  ListarPaisesServiceResult,
} from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import {
  crearPaisSchema,
  etiquetasDePais,
  PAIS_FUERA_DEL_CATALOGO,
  type CambiarDisponibilidadPaisInput,
  type EtiquetasGeograficas,
} from "@/lib/types/pais";
import { normalizeName } from "@/lib/utils/normalize";

// SL-20 (design §4, §5; R23, R37) — los países son de la plataforma, y solo ella los gestiona. El
// conjunto lee `ROLES_PLATAFORMA` por import: la guardia `superadmin-fuera-de-empresa` rechaza el
// literal.
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);

export class PaisService implements IPaisService {
  constructor(private readonly repo: IPaisRepository) {}

  async listar(actor: Actor): Promise<ListarPaisesServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", paises: await this.repo.listar() };
  }

  /** R9/R45: las opciones del alta de empresa. El servidor vuelve a mirarlo en el alta (R45). */
  async listarDisponibles(actor: Actor): Promise<ListarPaisesDisponiblesServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", paises: await this.repo.listarDisponibles() };
  }

  /**
   * R23, R41. El país se elige del catálogo ISO 3166-1: el schema rechaza un código que no está
   * (R41) y el nombre que se guarda es el del catálogo, no uno tecleado (R23). Ese nombre se compara
   * con `normalizeName` (sin mayúsculas, acentos ni espacios de más) contra los países que ya hay:
   * el único de la base compara literales, y «Perú» y «Peru» serían dos filas para ella y un mismo
   * país para una persona. La base sigue decidiendo ante una carrera.
   */
  async crear(input: unknown, actor: Actor): Promise<CrearPaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = crearPaisSchema.safeParse(input);
    if (!validada.success) {
      // `.strict()` deja un campo de más en `formErrors`, no en `fieldErrors`: se nombra aparte.
      const { formErrors, fieldErrors } = validada.error.flatten();
      return {
        status: "validation_error",
        fieldErrors: {
          ...(fieldErrors as Record<string, string[]>),
          ...(formErrors.length > 0 ? { entrada: formErrors } : {}),
        },
      };
    }
    const delCatalogo = paisDelCatalogo(validada.data.id);
    // El schema ya lo exige (R41); esta rama solo existe para que el tipo no mienta.
    if (!delCatalogo) return { status: "validation_error", fieldErrors: { id: [PAIS_FUERA_DEL_CATALOGO] } };
    const datos = { ...validada.data, nombre: delCatalogo.nombre };

    const existentes = await this.repo.listar();
    if (existentes.some((p) => p.id === datos.id)) return { status: "conflict", campo: "id" };
    const clave = normalizeName(datos.nombre);
    if (existentes.some((p) => normalizeName(p.nombre) === clave)) {
      return { status: "conflict", campo: "nombre" };
    }

    const r = await this.repo.crear(datos, { usuarioId: actor.usuarioId });
    if (r.estado === "duplicado") return { status: "conflict", campo: r.campo };
    return { status: "ok", pais: r.pais };
  }

  /** R47. El historial lo escribe el repositorio, solo si la fila cambió. */
  async cambiarDisponible(
    input: CambiarDisponibilidadPaisInput,
    actor: Actor,
  ): Promise<CambiarDisponibilidadPaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    const r = await this.repo.cambiarDisponible(input.id, input.disponible, { usuarioId: actor.usuarioId });
    if (r === "no_existe") return { status: "not_found" };
    return { status: "ok", id: input.id, disponible: input.disponible };
  }

  async etiquetasDeEmpresa(organizacionId: string): Promise<EtiquetasGeograficas> {
    const pais = await this.repo.deLaEmpresa(organizacionId);
    // `organizacion.pais_id` es NOT NULL: sin país, la empresa no existe o no es la del contexto.
    // Inventar unas etiquetas aquí escondería ese fallo.
    if (!pais) throw new Error(`etiquetas de nivel: no se encontró el país de la empresa ${organizacionId}`);
    return etiquetasDePais(pais);
  }
}
