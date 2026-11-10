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
  borrarGrupoSchema,
  crearGrupoSchema,
  fijarDistritosSchema,
  renombrarGrupoSchema,
  type AntesDeBorrar,
  type AntesDeMiembros,
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

/** SLT-89 (R43–R45, design §5.4): lo que hay en la base no es lo que el modal mostro. */
const CAMBIO_CONCURRENTE = { status: "conflict", motivo: "cambio_concurrente" } as const;

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
    // SLT-89 (R17): distritos y demas nodos son miembros por igual; el repositorio los reparte.
    const distritoIds = [...new Set([...parseado.data.distritoIds, ...parseado.data.nodoIds])];

    if (!(await this.repo.existeZona(zonaId))) return errorEn("zonaId", ["La zona indicada no existe."]);
    if (await this.repo.nombreOcupado(zonaId, nombre, null)) return NOMBRE_OCUPADO;
    const distritos = await this.distritosInvalidos(zonaId, distritoIds, null);
    if (distritos !== null) return distritos;

    const res = await this.repo.crear({ zonaId, nombre, distritoIds }, actor.usuarioId);
    if (res.status === "ok") return { status: "ok", id: res.id };
    if (res.status === "no_cubierto") return this.fueraDeLaZona(res.ids);
    return res.status === "nombre_repetido" ? NOMBRE_OCUPADO : DISTRITOS_RECHAZADOS;
  }

  /**
   * SLT-89 (R44, design §5.4, §5.5): rol → esquema (sin `nombreAnterior`, `validation_error` en ese
   * campo, tambien con un grupo inexistente o con el nombre pedido igual al actual) → `not_found` →
   * comparacion bajo el candado en el repositorio.
   */
  async renombrarGrupo(id: string, nombre: string, nombreAnterior: string, actor: Actor): Promise<CambiarGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const parseado = renombrarGrupoSchema.safeParse({ nombre, nombreAnterior });
    if (!parseado.success) return desdeZod(parseado.error);

    const grupo = await this.repo.buscar(id);
    if (grupo === null) return { status: "not_found" };
    if (await this.repo.nombreOcupado(grupo.zonaId, parseado.data.nombre, id)) return NOMBRE_OCUPADO;

    const res = await this.repo.renombrar(id, parseado.data.nombre, parseado.data.nombreAnterior, actor.usuarioId);
    if (res === "nombre_repetido") return NOMBRE_OCUPADO;
    if (res === "cambio_concurrente") return CAMBIO_CONCURRENTE;
    return { status: res };
  }

  /**
   * SLT-89 (R17, R18, R43; design §5.4, §5.5): `distritoIds` son todos los miembros pedidos (distritos
   * y demas nodos); `antes`, los que el modal mostro. Sin `antes`, `validation_error` en `antes` antes de
   * leer el grupo.
   */
  async fijarDistritos(
    id: string,
    distritoIds: readonly string[],
    antes: AntesDeMiembros,
    actor: Actor,
  ): Promise<CambiarGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const parseado = fijarDistritosSchema.safeParse({ distritoIds, antes });
    if (!parseado.success) return desdeZod(parseado.error);
    const pedidos = [...new Set(parseado.data.distritoIds)];

    const grupo = await this.repo.buscar(id);
    if (grupo === null) return { status: "not_found" };
    const distritos = await this.distritosInvalidos(grupo.zonaId, pedidos, id);
    if (distritos !== null) return distritos;

    const res = await this.repo.fijarDistritos(id, pedidos, parseado.data.antes, actor.usuarioId);
    if (typeof res === "object") return this.fueraDeLaZona(res.noCubiertos);
    if (res === "distrito_rechazado") return DISTRITOS_RECHAZADOS;
    if (res === "cambio_concurrente") return CAMBIO_CONCURRENTE;
    return { status: res };
  }

  /**
   * SLT-89 (R45; design §5.4, §5.5): sin `antes`, `validation_error` en `antes` aunque el grupo no
   * exista; con el, `not_found` como hoy, o `conflict` si la base no es lo que el modal mostro.
   */
  async borrarGrupo(id: string, antes: AntesDeBorrar, actor: Actor): Promise<BorrarGrupoResult> {
    if (!ROLES_QUE_ESCRIBEN.has(actor.rol)) return { status: "forbidden" };
    const parseado = borrarGrupoSchema.safeParse({ antes });
    if (!parseado.success) return desdeZod(parseado.error);
    const res = await this.repo.borrar(id, parseado.data.antes, actor.usuarioId);
    if (res === "cambio_concurrente") return CAMBIO_CONCURRENTE;
    return { status: res };
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
  /** R11/R18 — el error de «no pertenece a la zona», nombrando cada uno; el mismo antes y dentro de la tx (m2). */
  private async fueraDeLaZona(ajenos: readonly string[]): Promise<ValidationError> {
    const nombres = await this.repo.nombresDeDistritos(ajenos);
    return errorEn(
      "distritoIds",
      ajenos.map((d) => `${nombres.get(d) ?? d} no pertenece a la zona.`),
    );
  }

  private async distritosInvalidos(
    zonaId: string,
    distritoIds: readonly string[],
    grupoPropio: string | null,
  ): Promise<ValidationError | null> {
    if (distritoIds.length === 0) return null;

    const deLaZona = new Set(await this.repo.distritosDeLaZona(zonaId, distritoIds));
    const ajenos = distritoIds.filter((d) => !deLaZona.has(d));
    if (ajenos.length > 0) return this.fueraDeLaZona(ajenos);

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
