import type { z } from "zod";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type {
  AgregarNivelPaisServiceResult,
  CambiarDisponibilidadPaisServiceResult,
  CrearPaisServiceResult,
  IPaisService,
  ListarPaisesDisponiblesServiceResult,
  ListarPaisesServiceResult,
  RenombrarTipoNivelServiceResult,
} from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import {
  agregarNivelPaisSchema,
  crearPaisSchema,
  etiquetasDePais,
  PAIS_FUERA_DEL_CATALOGO,
  PAIS_NIVELES_MAX,
  renombrarTipoNivelSchema,
  type CambiarDisponibilidadPaisInput,
  type EtiquetasGeograficas,
} from "@/lib/types/pais";
import { normalizeName } from "@/lib/utils/normalize";

// SL-20 (design §4, §5; R23, R37) — los países son de la plataforma, y solo ella los gestiona. El
// conjunto lee `ROLES_PLATAFORMA` por import: la guardia `superadmin-fuera-de-empresa` rechaza el
// literal.
//
// SLT-46 (design §4.3; R23–R26, R28, R39, R48, R49) — el alta lleva la lista de tipos del país, y hay
// dos operaciones nuevas sobre ese catálogo: renombrar un tipo y agregar un nivel al final. Cada método
// mira el rol ANTES de validar o de tocar el repositorio (R39).
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);

/** R49: el mensaje de «agregar nivel» cuando el país ya tiene el máximo (design §4.3). */
export const PAIS_TOPE_DE_NIVELES = `Este país ya tiene ${PAIS_NIVELES_MAX} niveles`;

/** R61 (design §4.7): el desenlace común cuando el «antes» del modal ya no es el de la base. */
const CAMBIO_CONCURRENTE = { status: "conflict", motivo: "cambio_concurrente" } as const;

/** `.strict()` deja un campo de más en `formErrors`, no en `fieldErrors`: se nombra aparte (`entrada`). */
function errorDeValidacion(error: z.ZodError): { status: "validation_error"; fieldErrors: Record<string, string[]> } {
  const { formErrors, fieldErrors } = error.flatten();
  return {
    status: "validation_error",
    fieldErrors: {
      ...(fieldErrors as Record<string, string[]>),
      ...(formErrors.length > 0 ? { entrada: formErrors } : {}),
    },
  };
}

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
   * R23, R24, R41. El país se elige del catálogo ISO 3166-1: el schema rechaza un código que no está
   * (R41) y el nombre que se guarda es el del catálogo, no uno tecleado (R23). Ese nombre se compara
   * con `normalizeName` (sin mayúsculas, acentos ni espacios de más) contra los países que ya hay:
   * el único de la base compara literales, y «Perú» y «Peru» serían dos filas para ella y un mismo
   * país para una persona. La base sigue decidiendo ante una carrera.
   *
   * SLT-46: los nombres de nivel llegan como lista ordenada `tipos` (2–10, R24); el repositorio crea
   * exactamente esos tipos.
   */
  async crear(input: unknown, actor: Actor): Promise<CrearPaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = crearPaisSchema.safeParse(input);
    if (!validada.success) return errorDeValidacion(validada.error);
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

  /**
   * R25, R26, R61. Pedir los nombres que ya tiene es éxito: el repositorio no escribe (`sin_cambio`),
   * aunque el «antes» sea viejo. Si el «antes» ya no es el de la base, cambio concurrente. La copia a
   * `pais.nivel_N_*` (tipos 1–3) y el historial los hace el repositorio.
   */
  async renombrarTipo(input: unknown, actor: Actor): Promise<RenombrarTipoNivelServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = renombrarTipoNivelSchema.safeParse(input);
    if (!validada.success) return errorDeValidacion(validada.error);
    const { tipoId, nombreSingular, nombrePlural, anterior } = validada.data;

    const r = await this.repo.renombrarTipo(tipoId, { nombreSingular, nombrePlural }, anterior, {
      usuarioId: actor.usuarioId,
    });
    if (r === "no_existe") return { status: "not_found" };
    if (r === "cambio_concurrente") return CAMBIO_CONCURRENTE;
    return { status: "ok" };
  }

  /**
   * P3 (R48, R49): el nivel nuevo va siempre al final. El tope de 10 lo mira el repositorio (depende de
   * cuántos tipos tiene el país). El único violado de una carrera (`P2002`) NO se traduce aquí: sube y
   * lo mapea la action a `conflict`, como en las demás altas (R5).
   */
  async agregarNivel(input: unknown, actor: Actor): Promise<AgregarNivelPaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = agregarNivelPaisSchema.safeParse(input);
    if (!validada.success) return errorDeValidacion(validada.error);
    const { paisId, nombreSingular, nombrePlural, profundidad } = validada.data;

    const r = await this.repo.agregarNivel(paisId, { nombreSingular, nombrePlural }, profundidad, {
      usuarioId: actor.usuarioId,
    });
    if (r === "no_existe") return { status: "not_found" };
    if (r === "tope") return { status: "validation_error", fieldErrors: { paisId: [PAIS_TOPE_DE_NIVELES] } };
    if (r === "cambio_concurrente") return CAMBIO_CONCURRENTE;
    return { status: "ok", tipo: r };
  }

  /** R47. El historial lo escribe el repositorio, solo si la fila cambió. No mira los niveles (R28). */
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
