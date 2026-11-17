import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type { BorradorGuardado, IPlanBorradorRepository } from "@/lib/interfaces/repositories/IPlanBorradorRepository";
import type { IPlanBorradorService } from "@/lib/interfaces/services/IPlanBorradorService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import { BorradorNoEncontrado, pasosDelModo, pasosQueFaltan, peticionDeCrear, peticionDeEditar } from "@/lib/planes/borrador";
import {
  ESQUEMAS_DE_CREAR,
  ESQUEMAS_DE_EDITAR,
  confirmarBorradorSchema,
  descartarBorradorSchema,
  guardarPasoBorradorSchema,
  type ConfirmarBorradorResult,
  type DescartarBorradorResult,
  type GuardarPasoResult,
  type IdPasoBorrador,
  type ModoDelBorrador,
  type PasosDeCrear,
  type PasosDeEditar,
  type ValoresDelPaso,
} from "@/lib/types/plan-borrador";

// SLT-129 (design §5.2) — el orden es el de `PlanesService`: quién (R1) → zod (R3, R6, R7) → existencia y reglas
// → repositorio. Confirmar no valida nada propio: arma la petición de hoy y la pasa por `PlanesService` (R17–R19).

const FORBIDDEN = { estado: "forbidden" } as const;
const NO_ENCONTRADO = { estado: "borrador_no_encontrado" } as const;

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

/** Las claves de campo de hoy: los errores de `valores` salen sin su prefijo (design §3). */
function erroresDeCampo(error: z.ZodError): { estado: "validation_error"; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const ruta = issue.path[0] === "valores" && issue.path.length > 1 ? issue.path.slice(1) : issue.path;
    (fieldErrors[ruta.length > 0 ? ruta.join(".") : "_"] ??= []).push(issue.message);
  }
  return { estado: "validation_error", fieldErrors };
}

/** Lectura defensiva (design §4): solo los pasos que siguen validando con su esquema de hoy. */
function pasosValidos(
  modo: ModoDelBorrador,
  pasos: Record<string, unknown>,
): Partial<Record<IdPasoBorrador, ValoresDelPaso>> {
  const esquemas: Partial<Record<IdPasoBorrador, z.ZodType<ValoresDelPaso>>> =
    modo === "crear" ? ESQUEMAS_DE_CREAR : ESQUEMAS_DE_EDITAR;
  const validos: Partial<Record<IdPasoBorrador, ValoresDelPaso>> = {};
  for (const paso of pasosDelModo(modo)) {
    const r = esquemas[paso]?.safeParse(pasos[paso]);
    if (r?.success) validos[paso] = r.data;
  }
  return validos;
}

function guardadoOk(modo: ModoDelBorrador, g: BorradorGuardado): GuardarPasoResult {
  return {
    estado: "ok",
    borradorId: g.borradorId,
    pasosGuardados: pasosDelModo(modo).filter((p) => g.pasos.includes(p)),
    actualizadoAt: g.actualizadoAt.toISOString(),
  };
}

export class PlanBorradorService implements IPlanBorradorService {
  constructor(
    private readonly repo: IPlanBorradorRepository,
    private readonly planes: IPlanesService,
  ) {}

  async guardarPaso(actor: Actor | null, input: unknown): Promise<GuardarPasoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = guardarPasoBorradorSchema.safeParse(input);
    if (!parsed.success) return erroresDeCampo(parsed.error);
    const e = parsed.data;
    if (e.modo === "editar") {
      // R8: aquí se responde rápido; el repositorio lo repite con el plan bajo FOR SHARE.
      const plan = await this.repo.plan(e.planId);
      if (plan === null) return { estado: "not_found" };
      if (plan.archivado) return { estado: "archivado" };
      const r = await this.repo.guardarPasoDeCambio(e.planId, e.paso, e.valores, actor.usuarioId);
      return r.estado === "ok" ? guardadoOk("editar", r) : r;
    }
    // Sin borrador el esquema ya exigió General (R3).
    const g =
      e.paso === "general" && e.borradorId === null
        ? await this.repo.crearBorrador(e.valores, actor.usuarioId)
        : e.borradorId === null
          ? null
          : await this.repo.guardarPasoDeCreacion(e.borradorId, e.paso, e.valores);
    return g === null ? NO_ENCONTRADO : guardadoOk("crear", g);
  }

  async descartar(actor: Actor | null, input: unknown): Promise<DescartarBorradorResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = descartarBorradorSchema.safeParse(input);
    if (!parsed.success) return erroresDeCampo(parsed.error);
    return (await this.repo.descartar(parsed.data.borradorId)) ? { estado: "ok" } : NO_ENCONTRADO;
  }

  async confirmar(actor: Actor | null, input: unknown): Promise<ConfirmarBorradorResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = confirmarBorradorSchema.safeParse(input);
    if (!parsed.success) return erroresDeCampo(parsed.error);
    const { borradorId } = parsed.data;
    const borrador = await this.repo.borrador(borradorId);
    if (borrador === null) return NO_ENCONTRADO;
    const modo = borrador.planId === null ? "crear" : "editar";
    const pasos = pasosValidos(modo, borrador.pasos);
    const faltan = pasosQueFaltan(modo, Object.keys(pasos) as IdPasoBorrador[]);
    if (faltan.length > 0) return { estado: "pasos_pendientes", pasos: faltan };
    try {
      // R17–R19: la validación completa y las reglas de hoy; el repositorio consume el borrador solo en `ok`.
      return borrador.planId === null
        ? await this.planes.crear(actor, peticionDeCrear(pasos as PasosDeCrear), { borradorId })
        : await this.planes.editar(actor, peticionDeEditar(borrador.planId, pasos as PasosDeEditar), { borradorId });
    } catch (e) {
      if (e instanceof BorradorNoEncontrado) return NO_ENCONTRADO; // R20
      throw e;
    }
  }
}
