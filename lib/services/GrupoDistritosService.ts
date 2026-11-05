import { z } from "zod";

import type { IGrupoDistritosRepository } from "@/lib/interfaces/repositories/IGrupoDistritosRepository";
import type {
  Actor,
  BorrarGrupoResult,
  CambiarGrupoResult,
  CrearGrupoResult,
  IGrupoDistritosService,
  ListarGruposResult,
} from "@/lib/interfaces/services/IGrupoDistritosService";
import {
  crearGrupoSchema,
  fijarDistritosSchema,
  renombrarGrupoSchema,
  type CrearGrupoInput,
} from "@/lib/types/tarifa-flexible";

// R13: la misma matriz que `TarifaValorService`.
const ROLES_QUE_LEEN = new Set<string>(["maestro", "admin"]);
const ROLES_QUE_ESCRIBEN = new Set<string>(["maestro"]);

type ValidationError = { status: "validation_error"; fieldErrors: Record<string, string[]> };

function errorEn(campo: string, mensajes: string[]): ValidationError {
  return { status: "validation_error", fieldErrors: { [campo]: mensajes } };
}

function desdeZod(error: z.ZodError): ValidationError {
  return { status: "validation_error", fieldErrors: z.flattenError(error).fieldErrors };
}

const NOMBRE_OCUPADO = errorEn("nombre", ["Ya hay un grupo con ese nombre en la zona."]);
// La base rechazo el conjunto aunque la comprobacion previa lo diera por bueno (una carrera): no se
// sabe cual fue, pero el campo y el hecho son los mismos que los de la comprobacion (R11).
const DISTRITOS_RECHAZADOS = errorEn("distritoIds", [
  "Alguno de los elegidos ya está en otro grupo de la zona o no pertenece a ella.",
]);

/**
 * SLT-52 (design §8) — los grupos de distritos de una zona. La empresa sale del contexto, nunca del
 * input; el historial lo escribe el repositorio en la misma transaccion (R14).
 */
export class GrupoDistritosService implements IGrupoDistritosService {
  constructor(private readonly repo: IGrupoDistritosRepository) {}

  async crearGrupo(input: CrearGrupoInput, actor: Actor): Promise<CrearGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const parseado = crearGrupoSchema.safeParse(input);
    if (!parseado.success) return desdeZod(parseado.error);
    const { zonaId, nombre } = parseado.data;
    const distritoIds = [...new Set(parseado.data.distritoIds)];

    if (!(await this.repo.existeZona(zonaId))) return errorEn("zonaId", ["La zona indicada no existe."]);
    if (await this.repo.nombreOcupado(zonaId, nombre, null)) return NOMBRE_OCUPADO;
    const distritos = await this.distritosInvalidos(zonaId, distritoIds, null);
    if (distritos !== null) return distritos;

    const res = await this.repo.crear({ zonaId, nombre, distritoIds }, actor.usuarioId);
    if (res.status === "ok") return { status: "ok", id: res.id };
    return res.status === "nombre_repetido" ? NOMBRE_OCUPADO : DISTRITOS_RECHAZADOS;
  }

  async renombrarGrupo(id: string, nombre: string, actor: Actor): Promise<CambiarGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const parseado = renombrarGrupoSchema.safeParse({ nombre });
    if (!parseado.success) return desdeZod(parseado.error);

    const grupo = await this.repo.buscar(id);
    if (grupo === null) return { status: "not_found" };
    if (await this.repo.nombreOcupado(grupo.zonaId, parseado.data.nombre, id)) return NOMBRE_OCUPADO;

    const res = await this.repo.renombrar(id, parseado.data.nombre, actor.usuarioId);
    if (res === "nombre_repetido") return NOMBRE_OCUPADO;
    return { status: res };
  }

  async fijarDistritos(
    id: string,
    distritoIds: readonly string[],
    actor: Actor,
  ): Promise<CambiarGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const parseado = fijarDistritosSchema.safeParse({ distritoIds });
    if (!parseado.success) return desdeZod(parseado.error);
    const pedidos = [...new Set(parseado.data.distritoIds)];

    const grupo = await this.repo.buscar(id);
    if (grupo === null) return { status: "not_found" };
    const distritos = await this.distritosInvalidos(grupo.zonaId, pedidos, id);
    if (distritos !== null) return distritos;

    const res = await this.repo.fijarDistritos(id, pedidos, actor.usuarioId);
    if (res === "distrito_rechazado") return DISTRITOS_RECHAZADOS;
    return { status: res };
  }

  async borrarGrupo(id: string, actor: Actor): Promise<BorrarGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    return { status: await this.repo.borrar(id, actor.usuarioId) };
  }

  async listarGrupos(zonaId: string, actor: Actor): Promise<ListarGruposResult> {
    if (!ROLES_QUE_LEEN.has(actor.rol)) return { status: "forbidden" };
    return { status: "ok", items: await this.repo.listar(zonaId) };
  }

  /**
   * R11 — un distrito fuera de la zona, o ya en OTRO grupo de ella, se rechaza NOMBRANDOLO. Se
   * juntan todos los culpables en un solo error para que el maestro los corrija de una vez. El mensaje
   * lleva el nombre que sale de la base y no la palabra del nivel geografico, que depende del pais.
   */
  private async distritosInvalidos(
    zonaId: string,
    distritoIds: readonly string[],
    grupoPropio: string | null,
  ): Promise<ValidationError | null> {
    if (distritoIds.length === 0) return null;

    const deLaZona = new Set(await this.repo.distritosDeLaZona(zonaId, distritoIds));
    const ajenos = distritoIds.filter((d) => !deLaZona.has(d));
    if (ajenos.length > 0) {
      const nombres = await this.repo.nombresDeDistritos(ajenos);
      return errorEn(
        "distritoIds",
        ajenos.map((d) => `${nombres.get(d) ?? d} no pertenece a la zona.`),
      );
    }

    const enOtro = await this.repo.distritosEnOtroGrupo(zonaId, distritoIds, grupoPropio);
    if (enOtro.length > 0) {
      return errorEn(
        "distritoIds",
        enOtro.map((d) => `${d.distritoNombre} ya está en el grupo ${d.grupoNombre}.`),
      );
    }
    return null;
  }
}
