import type { z } from "zod";

import { ROLES_PLATAFORMA } from "@/lib/auth/plataforma";
import { paisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type {
  ActualizarDatosPaisServiceResult,
  CambiarActivoTipoDocumentoServiceResult,
  CambiarDisponibilidadPaisServiceResult,
  CrearPaisServiceResult,
  CrearTipoDocumentoServiceResult,
  EditarTipoDocumentoServiceResult,
  IPaisService,
  ListarPaisesDisponiblesServiceResult,
  ListarPaisesParaAltaServiceResult,
  ListarPaisesServiceResult,
  ListarTiposDocumentoServiceResult,
} from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import {
  actualizarDatosPaisSchema,
  cambiarActivoTipoDocumentoSchema,
  crearPaisSchema,
  crearTipoDocumentoSchema,
  editarTipoDocumentoSchema,
  etiquetasDePais,
  MENSAJE_ZONA,
  PAIS_FUERA_DEL_CATALOGO,
  type CambiarDisponibilidadPaisInput,
  type DatosDeTipoDocumentoNuevo,
  type EtiquetasGeograficas,
  type PaisDTO,
  type TipoDocumentoNuevoInput,
} from "@/lib/types/pais";
import { normalizeName } from "@/lib/utils/normalize";
import { prefijoOficial } from "@/lib/utils/prefijo-oficial";
import { esZonaIana } from "@/lib/utils/zonas-iana";

// SL-20 (design §4, §5; R23, R37) — los países son de la plataforma, y solo ella los gestiona. El
// conjunto lee `ROLES_PLATAFORMA` por import: la guardia `superadmin-fuera-de-empresa` rechaza el
// literal.
//
// SLT-81 (design §4.2; R1, R5–R17, R26) — y también sus datos: prefijo, dígitos, zona y tipos de
// documento. Cada método nuevo mira el rol antes que nada (R1: la action es la primera puerta, no la
// única) y valida su entrada aquí, con los schemas de `lib/types/pais.ts`. Ninguno toca `usuario`,
// `orden`, `postulacion` ni otra tabla de negocio (R12, R14): la regla nueva rige desde la siguiente
// petición porque `IReglasPaisEmpresa` lee el catálogo en cada una.
const GESTION_ROLES = new Set<string>(ROLES_PLATAFORMA);

const UNICO_ACTIVO = "Es el único tipo de documento activo del país: activa otro antes de desactivar este.";
const NOMBRE_REPETIDO = "Ya hay un tipo de documento con ese nombre en este país.";
const NOMBRE_SIN_CLAVE = "El nombre debe tener al menos una letra o un dígito.";

type ErroresPorCampo = Record<string, string[]>;
type ValidationError = { status: "validation_error"; fieldErrors: ErroresPorCampo };

/**
 * Los errores de zod por campo, con la ruta entera (`tiposDocumento.0.nombre`): la pantalla los pinta
 * junto a su fila. Un campo de más (`.strict()`) llega sin ruta y se nombra `entrada`.
 */
function erroresDe(error: z.ZodError): ValidationError {
  const fieldErrors: ErroresPorCampo = {};
  for (const issue of error.issues) {
    const campo = issue.path.length > 0 ? issue.path.join(".") : "entrada";
    (fieldErrors[campo] ??= []).push(issue.message);
  }
  return { status: "validation_error", fieldErrors };
}

const errorEn = (campo: string, mensaje: string): ValidationError => ({
  status: "validation_error",
  fieldErrors: { [campo]: [mensaje] },
});

/**
 * La identidad de un tipo nuevo (design §4.2): el nombre plegado con `normalizeName`, cada carácter
 * fuera de `[a-z0-9]` pasado a `_` y sin `_` en los extremos. Vacía si el nombre no tiene letras ni
 * dígitos.
 */
export function claveDeTipo(nombre: string): string {
  return normalizeName(nombre)
    .replace(/[^a-z0-9]/g, "_")
    .replace(/^_+|_+$/g, "");
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
   * R23, R41. El país se elige del catálogo ISO 3166-1: el schema rechaza un código que no está
   * (R41) y el nombre que se guarda es el del catálogo, no uno tecleado (R23). Ese nombre se compara
   * con `normalizeName` (sin mayúsculas, acentos ni espacios de más) contra los países que ya hay:
   * el único de la base compara literales, y «Perú» y «Peru» serían dos filas para ella y un mismo
   * país para una persona. La base sigue decidiendo ante una carrera.
   *
   * SLT-81 (R5, R6, R8, R26): con su prefijo oficial, una zona válida y sus tipos, todo en una sola
   * escritura del repositorio.
   */
  async crear(input: unknown, actor: Actor): Promise<CrearPaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = crearPaisSchema.safeParse(input);
    if (!validada.success) return erroresDe(validada.error);
    const delCatalogo = paisDelCatalogo(validada.data.id);
    // El schema ya lo exige (R41); esta rama solo existe para que el tipo no mienta.
    if (!delCatalogo) return errorEn("id", PAIS_FUERA_DEL_CATALOGO);
    const { tiposDocumento, ...delPais } = validada.data;

    const sinPrefijo = this.errorDePrefijo(delPais.id, delPais.prefijoTelefonico);
    if (sinPrefijo) return sinPrefijo;
    const sinZona = await this.errorDeZona(delPais.zonaHoraria);
    if (sinZona) return sinZona;
    const tipos = this.tiposDelAlta(delPais.id, tiposDocumento);
    if ("status" in tipos) return tipos;

    const existentes = await this.repo.listar();
    if (existentes.some((p) => p.id === delPais.id)) return { status: "conflict", campo: "id" };
    const clave = normalizeName(delCatalogo.nombre);
    if (existentes.some((p) => normalizeName(p.nombre) === clave)) {
      return { status: "conflict", campo: "nombre" };
    }

    const r = await this.repo.crear(
      { ...delPais, nombre: delCatalogo.nombre, tiposDocumento: tipos.datos },
      { usuarioId: actor.usuarioId },
    );
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

  // ── SLT-81 ──────────────────────────────────────────────────────────────────────────────────────

  /**
   * R10, R11. El número de empresas es la prueba de la confirmación: si entre la pregunta y el «sí»
   * nace una empresa, el número ya no coincide y se vuelve a preguntar. La que nazca entre el conteo
   * y el `UPDATE` queda igual que las demás: rige desde el cambio (design §4.2). R26 se mira siempre,
   * también sin cambio de prefijo, para corregir en la primera edición uno mal guardado antes.
   */
  async actualizarDatos(input: unknown, actor: Actor): Promise<ActualizarDatosPaisServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = actualizarDatosPaisSchema.safeParse(input);
    if (!validada.success) return erroresDe(validada.error);
    const { id, empresasConfirmadas, ...datos } = validada.data;

    const sinPrefijo = this.errorDePrefijo(id, datos.prefijoTelefonico);
    if (sinPrefijo) return sinPrefijo;
    const sinZona = await this.errorDeZona(datos.zonaHoraria);
    if (sinZona) return sinZona;

    const actual = await this.repo.porId(id);
    if (actual === null) return { status: "not_found" };
    if (!cambianLosDatos(actual, datos)) return { status: "ok", pais: actual, cambiado: false };

    const empresas = await this.repo.contarEmpresas(id);
    if (empresas > 0 && empresasConfirmadas !== empresas) return { status: "requiere_confirmacion", empresas };

    const r = await this.repo.actualizarDatos(id, datos, empresas, { usuarioId: actor.usuarioId });
    if (r.estado === "no_existe") return { status: "not_found" };
    return { status: "ok", pais: r.pais, cambiado: r.estado === "cambiado" };
  }

  async listarTiposDocumento(paisId: string, actor: Actor): Promise<ListarTiposDocumentoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", tipos: await this.repo.listarTiposDocumento(paisId) };
  }

  /** R9, R13. El nombre se compara plegado contra los del país; la clave la frena además el único. */
  async crearTipoDocumento(input: unknown, actor: Actor): Promise<CrearTipoDocumentoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = crearTipoDocumentoSchema.safeParse(input);
    if (!validada.success) return erroresDe(validada.error);
    const { paisId, ...regla } = validada.data;
    const clave = claveDeTipo(regla.nombre);
    if (clave === "") return errorEn("nombre", NOMBRE_SIN_CLAVE);

    if ((await this.repo.porId(paisId)) === null) return { status: "not_found" };
    if (await this.nombreOcupado(paisId, regla.nombre, null)) return { status: "conflict", campo: "nombre" };

    const r = await this.repo.crearTipoDocumento(paisId, { ...regla, clave, value: `${paisId}_${clave}` }, {
      usuarioId: actor.usuarioId,
    });
    if (r.estado === "no_existe") return { status: "not_found" };
    if (r.estado === "duplicado") return { status: "conflict", campo: "nombre" };
    return { status: "ok", tipo: r.tipo };
  }

  /** R9, R13, R14. La clave y el `value` no cambian: son la identidad del tipo. */
  async editarTipoDocumento(input: unknown, actor: Actor): Promise<EditarTipoDocumentoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = editarTipoDocumentoSchema.safeParse(input);
    if (!validada.success) return erroresDe(validada.error);
    const { id, ...regla } = validada.data;

    const actual = await this.repo.tipoDocumentoPorId(id);
    if (actual === null) return { status: "not_found" };
    if (await this.nombreOcupado(actual.paisId, regla.nombre, id)) return { status: "conflict", campo: "nombre" };

    const r = await this.repo.editarTipoDocumento(id, regla, { usuarioId: actor.usuarioId });
    if (r.estado === "no_existe") return { status: "not_found" };
    return { status: "ok", tipo: r.tipo, cambiado: r.estado === "cambiado" };
  }

  /** R13, R15. El repositorio cuenta los activos con el país bloqueado (dos a la vez no lo vacían). */
  async cambiarActivoTipoDocumento(input: unknown, actor: Actor): Promise<CambiarActivoTipoDocumentoServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };

    const validada = cambiarActivoTipoDocumentoSchema.safeParse(input);
    if (!validada.success) return erroresDe(validada.error);

    const r = await this.repo.cambiarActivoTipoDocumento(validada.data.id, validada.data.activo, {
      usuarioId: actor.usuarioId,
    });
    if (r.estado === "no_existe") return { status: "not_found" };
    if (r.estado === "ultimo_activo") return errorEn("activo", UNICO_ACTIVO);
    return { status: "ok", tipo: r.tipo };
  }

  async listarDisponiblesParaAlta(actor: Actor): Promise<ListarPaisesParaAltaServiceResult> {
    if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", paises: await this.repo.listarDisponiblesParaAlta() };
  }

  /** R26: solo el prefijo oficial según libphonenumber; un país que no conoce no tiene ninguno. */
  private errorDePrefijo(paisId: string, prefijo: string): ValidationError | null {
    const oficial = prefijoOficial(paisId);
    if (oficial === null) return errorEn("prefijoTelefonico", "No hay prefijo oficial conocido para este país.");
    if (prefijo === oficial) return null;
    const nombre = paisDelCatalogo(paisId)?.nombre ?? paisId;
    return errorEn("prefijoTelefonico", `El prefijo de ${nombre} es +${oficial}.`);
  }

  /** R8: en la lista del runtime Y conocida por Postgres, que agrupa por día con `AT TIME ZONE`. */
  private async errorDeZona(zona: string): Promise<ValidationError | null> {
    if (!esZonaIana(zona) || !(await this.repo.zonaConocidaPorLaBase(zona))) return errorEn("zonaHoraria", MENSAJE_ZONA);
    return null;
  }

  /** R9 dentro del país: otro tipo (no `excepto`) con el mismo nombre plegado. */
  private async nombreOcupado(paisId: string, nombre: string, excepto: string | null): Promise<boolean> {
    const plegado = normalizeName(nombre);
    const tipos = await this.repo.listarTiposDocumento(paisId);
    return tipos.some((t) => t.id !== excepto && normalizeName(t.nombre) === plegado);
  }

  /**
   * R9 dentro del alta: cada tipo con su clave y su `value`; dos con el mismo nombre plegado (o la
   * misma clave) son `validation_error` en el segundo, porque el país aún no existe y no hay
   * contra qué dar `conflict`.
   */
  private tiposDelAlta(
    paisId: string,
    tipos: readonly TipoDocumentoNuevoInput[],
  ): { datos: DatosDeTipoDocumentoNuevo[] } | ValidationError {
    const vistas = new Set<string>();
    const datos: DatosDeTipoDocumentoNuevo[] = [];
    for (const [i, t] of tipos.entries()) {
      const clave = claveDeTipo(t.nombre);
      if (clave === "") return errorEn(`tiposDocumento.${i}.nombre`, NOMBRE_SIN_CLAVE);
      if (vistas.has(clave)) return errorEn(`tiposDocumento.${i}.nombre`, NOMBRE_REPETIDO);
      vistas.add(clave);
      datos.push({ ...t, clave, value: `${paisId}_${clave}` });
    }
    return { datos };
  }
}

function cambianLosDatos(
  actual: PaisDTO,
  nuevo: Pick<PaisDTO, "zonaHoraria"> & { prefijoTelefonico: string; telefonoDigitosNacionales: number },
): boolean {
  return (
    actual.prefijoTelefonico !== nuevo.prefijoTelefonico ||
    actual.telefonoDigitosNacionales !== nuevo.telefonoDigitosNacionales ||
    actual.zonaHoraria !== nuevo.zonaHoraria
  );
}
