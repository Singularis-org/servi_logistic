import type { RolValue } from "@prisma/client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  IAprobacionPostulacionService,
  DecisionServiceResult,
  ListarPendientesServiceResult,
} from "@/lib/interfaces/services/IAprobacionPostulacionService";
import type {
  IAprobacionPostulacionRepository,
  PostulacionRow,
} from "@/lib/interfaces/repositories/IAprobacionPostulacionRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type {
  ListarPostulacionesInput,
  PostulacionPendienteDTO,
} from "@/lib/types/aprobacion-postulacion";
import { aprobacionPostulacionesConfig } from "@/lib/config/aprobacion-postulaciones";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { validarPersonaDelPais } from "@/lib/services/validacion-documento-telefono";

// R2: solo `maestro` y `admin` aprueban/rechazan/listan.
const ROLES_APROBADORES = new Set<RolValue>(["maestro", "admin"]);

/** SLT-42: las claves de `fieldErrors` al aprobar, las de los campos de `PostulacionPendienteDTO`. */
const CAMPOS_DE_LA_POSTULACION = { telefono: "telefono", documento: "cedula", tipo: "tipoIdentificacion" } as const;

/**
 * Feature 22 — logica de negocio de la aprobacion de postulaciones. Autoriza por
 * rol (R2/R3/R5) ANTES de tocar el repo o el Storage, lista pendientes con URLs
 * firmadas (R6-R11) y aplica las transiciones de estado con proteccion
 * anti-carrera (R12-R19). No conoce HTTP ni Prisma.
 */
export class AprobacionPostulacionService implements IAprobacionPostulacionService {
  constructor(
    private readonly repo: IAprobacionPostulacionRepository,
    private readonly signedUrls: ISignedUrlProvider,
    private readonly ttlSeconds: number = aprobacionPostulacionesConfig.SIGNED_URL_TTL_SECONDS,
    /**
     * SLT-42 (R10, R11, R14, R16): las reglas del pais de la empresa, para validar al aprobar.
     * OPCIONAL EN EL CONSTRUCTOR, OBLIGATORIO EN EL USO, como en `UsuarioService`: `aprobar` LANZA
     * si no esta, en vez de dar de alta sin validar. Rechazar no lo necesita.
     */
    private readonly reglasPais?: IReglasPaisEmpresa,
  ) {}

  async listarPendientes(
    input: ListarPostulacionesInput,
    actor: Actor,
  ): Promise<ListarPendientesServiceResult> {
    // R3/R5: guard antes de acceder a datos o Storage.
    if (!ROLES_APROBADORES.has(actor.rol)) return { status: "forbidden" };

    const { page, pageSize } = input;
    const skip = (page - 1) * pageSize;
    const { items, total } = await this.repo.listPendientes({ skip, take: pageSize });

    const dtos: PostulacionPendienteDTO[] = [];
    for (const row of items) {
      dtos.push(await this.toDTO(row));
    }

    return { status: "ok", items: dtos, page, pageSize, total };
  }

  async aprobar(usuarioId: string, actor: Actor): Promise<DecisionServiceResult> {
    if (!ROLES_APROBADORES.has(actor.rol)) return { status: "forbidden" };
    const rechazo = await this.rechazoDeLaPersona(usuarioId);
    if (rechazo !== null) return rechazo;
    return this.decidir(usuarioId, actor, "activo");
  }

  async rechazar(usuarioId: string, actor: Actor): Promise<DecisionServiceResult> {
    return this.decidir(usuarioId, actor, "inactivo");
  }

  /**
   * Transicion comun aprobar/rechazar. R5: autoriza primero. R12/R16: intenta la
   * actualizacion condicional atomica (solo mensajero + pendiente). Si no aplica
   * (count 0), reconsulta para distinguir R13/R17 (not_found) de R14/R18
   * (conflict). Dos decisiones concurrentes: solo una ve count 1 (anti-carrera).
   */
  private async decidir(
    usuarioId: string,
    actor: Actor,
    estadoDestino: "activo" | "inactivo",
  ): Promise<DecisionServiceResult> {
    if (!ROLES_APROBADORES.has(actor.rol)) return { status: "forbidden" };

    // FICHA 362 (R3/R9): QUIEN decidio, congelado en la misma transaccion que la decision.
    let count: number;
    try {
      count = await this.repo.actualizarEstadoSiPendiente(usuarioId, estadoDestino, actor.usuarioId);
    } catch (error) {
      // SL-24 (R27): aprobar es un alta de `mensajero`. Con su tope lleno el trigger de `usuario`
      // la rechaza, la transaccion se deshace y la postulacion sigue `pendiente`.
      const tope = traducirErrorDeTope(error);
      if (tope instanceof TopeDelPlanAlcanzado) return { status: "tope_plan", mensaje: tope.message };
      throw error;
    }
    if (count > 0) {
      // R15/R19: solo cambio `estado`; el repo no toca otros campos ni documentos.
      return { status: "ok", usuarioId, estado: estadoDestino };
    }

    // count 0: no era mensajero+pendiente. Distinguir 404 de 409.
    const actual = await this.repo.findMensajeroById(usuarioId);
    if (!actual) return { status: "not_found" }; // R13/R17
    return { status: "conflict" }; // R14/R18: existe pero ya no esta pendiente
  }

  /**
   * SLT-42 (R10, R11, R14, R16): aprobar es el alta del mensajero en la empresa, asi que su tipo,
   * su documento y su telefono tienen que cumplir la regla del pais, tambien los de una postulacion
   * recibida antes de esta ficha. Solo se valida: aprobar no reescribe datos (R15/R19 de la
   * feature 22). `null` si vale o si no es una postulacion pendiente (eso lo resuelve `decidir`).
   */
  private async rechazoDeLaPersona(
    usuarioId: string,
  ): Promise<{ status: "validation_error"; fieldErrors: Record<string, string[]> } | null> {
    if (!this.reglasPais) {
      throw new Error(
        "AprobacionPostulacionService.aprobar requiere las reglas del pais de la empresa: sin ellas " +
          "el mensajero se daria de alta sin validar su telefono ni su documento (SLT-42)",
      );
    }
    const persona = await this.repo.personaPendiente(usuarioId);
    if (persona === null) return null;
    const { paisId } = await this.reglasPais.deLaEmpresa();
    const tipo = await this.reglasPais.tipoDocumento(persona.tipoIdentificacionId);
    const r = validarPersonaDelPais(
      paisId,
      { telefono: persona.telefono, documento: persona.cedula, tipo },
      CAMPOS_DE_LA_POSTULACION,
    );
    return r.ok ? null : { status: "validation_error", fieldErrors: r.fieldErrors };
  }

  /** Proyecta una fila a DTO firmando las URLs de sus documentos (R8/R9). */
  private async toDTO(row: PostulacionRow): Promise<PostulacionPendienteDTO> {
    const paths = row.documentos.map((d) => d.storagePath);
    const urlByPath =
      paths.length > 0 ? await this.signedUrls.createSignedUrls(paths, this.ttlSeconds) : {};

    return {
      usuarioId: row.usuarioId,
      nombre: row.nombre,
      primerApellido: row.primerApellido,
      segundoApellido: row.segundoApellido,
      email: row.email,
      telefono: row.telefono,
      tipoIdentificacion: row.tipoIdentificacion,
      cedula: row.cedula,
      vehiculo: row.vehiculo,
      placa: row.placa,
      documentos: row.documentos.map((d) => ({
        tipo: d.tipo,
        url: urlByPath[d.storagePath] ?? "",
        expiresInSeconds: this.ttlSeconds,
      })),
    };
  }
}
