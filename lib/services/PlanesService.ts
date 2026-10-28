import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { mensajeTopesPasados } from "@/lib/planes/mensajes";
import {
  archivarPlanSchema,
  asignablesSchema,
  asignarPlanSchema,
  cancelarCambioPlanSchema,
  crearPlanSchema,
  editarPlanSchema,
  type ListarPlanesAsignablesResult,
  type PlanDTO,
  type PlanResult,
} from "@/lib/types/planes";

// SL-24 (design §5, §16.2; R2, R5, R6, R12, R13, R16, R37, R39) — el orden es fijo y es parte del contrato,
// copiado de `ModulosEmpresaService` (SL-23): primero quién (R5), luego qué (zod: R2, R3), luego si
// existe, luego las reglas (archivado, custom de otra empresa) y al final el repositorio. Ningún rol de
// empresa —tampoco el `maestro` de la empresa afectada— llega a la base, ni para un error de validación.
//
// El repositorio vuelve a comprobar existencia y reglas bajo cerrojo (§4.4): aquí se responde rápido,
// allí se decide.

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

function erroresDeCampo(error: z.ZodError): Record<string, string[]> {
  const campos: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const clave = issue.path.length > 0 ? issue.path.join(".") : "_";
    (campos[clave] ??= []).push(issue.message);
  }
  return campos;
}

function ok(planId: string, cambio: boolean, extra: Partial<Pick<Extract<PlanResult, { estado: "ok" }>, "avisos" | "vigenteDesde">> = {}): PlanResult {
  return { estado: "ok", planId, cambio, avisos: extra.avisos ?? [], vigenteDesde: extra.vigenteDesde ?? null };
}

const FORBIDDEN = { estado: "forbidden" } as const;

export class PlanesService implements IPlanesService {
  constructor(
    private readonly repo: IPlanesRepository,
    /** El reloj, inyectable para R37 («posterior al momento de guardar»). */
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async crear(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = crearPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    // R2: un custom nombra una empresa que EXISTE.
    const { organizacionId } = parsed.data;
    if (organizacionId !== null && (await this.repo.empresa(organizacionId)) === null) return { estado: "not_found" };
    return ok(await this.repo.crear(parsed.data, actor.usuarioId), true);
  }

  async editar(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = editarPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { planId, vigenteDesde, ...version } = parsed.data;
    // R37: la fecha rige a las 00:00 de la plataforma y tiene que caer después de ahora.
    if (vigenteDesde !== null && inicioDelDiaPlataforma(vigenteDesde).getTime() <= this.ahora().getTime()) {
      return {
        estado: "validation_error",
        fieldErrors: { vigenteDesde: ["La fecha de vigencia tiene que ser posterior a hoy."] },
      };
    }
    const plan = await this.repo.plan(planId);
    if (plan === null) return { estado: "not_found" };
    if (plan.archivado) return { estado: "archivado" };

    if (vigenteDesde !== null) {
      // §16.2: programar o reemplazar el pendiente, sin tocar la versión vigente (R37, R39). R16: se
      // guarda aunque alguna empresa ya pase un tope nuevo, y se avisa.
      // El mismo reloj decide qué recordatorios caen después de ahora (R42).
      const p = await this.repo.programarCambio(
        planId,
        version,
        inicioDelDiaPlataforma(vigenteDesde),
        actor.usuarioId,
        this.ahora(),
      );
      if (p.estado !== "ok") return p;
      // `vigenteDesde` vuelve como la fecha elegida (`AAAA-MM-DD`, P8); null si no se programó nada.
      return ok(planId, p.cambio, { avisos: p.avisos, vigenteDesde: p.cambio ? vigenteDesde : null });
    }
    const r = await this.repo.editar(planId, version, actor.usuarioId);
    if (r.estado !== "ok") return r;
    return ok(planId, r.cambio, { avisos: r.avisos });
  }

  async archivar(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = archivarPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { planId } = parsed.data;
    if ((await this.repo.plan(planId)) === null) return { estado: "not_found" };
    const r = await this.repo.archivar(planId, actor.usuarioId);
    return r.estado === "ok" ? ok(planId, r.cambio) : r;
  }

  async asignar(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = asignarPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, planId } = parsed.data;
    const [empresa, plan] = await Promise.all([this.repo.empresa(organizacionId), this.repo.plan(planId)]);
    if (empresa === null || plan === null) return { estado: "not_found" };
    if (plan.archivado) return { estado: "archivado" };
    if (plan.visibilidad === "custom" && plan.organizacionId !== organizacionId) return { estado: "custom_de_otra_empresa" };
    if (empresa.planId === planId) return ok(planId, false);

    const r = await this.repo.asignar(organizacionId, planId, actor.usuarioId);
    if (r.estado === "ok") return ok(planId, r.cambio);
    if (r.estado === "tope_excedido") {
      return { estado: "tope_excedido", excedidos: r.excedidos, mensaje: mensajeTopesPasados(r.excedidos) };
    }
    return r;
  }

  async cancelarCambio(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = cancelarCambioPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { planId } = parsed.data;
    const r = await this.repo.cancelarCambio(planId, actor.usuarioId);
    return r.estado === "ok" ? ok(planId, true) : r;
  }

  async asignables(actor: Actor | null, input: unknown): Promise<ListarPlanesAsignablesResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = asignablesSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId } = parsed.data;
    if ((await this.repo.empresa(organizacionId)) === null) return { estado: "not_found" };
    return { estado: "ok", planes: await this.repo.asignables(organizacionId) };
  }

  /** R7: la lectura de servidor que expondrá SL-25. Sin actor y fuera de toda action. */
  planesPublicos(): Promise<PlanDTO[]> {
    return this.repo.publicos();
  }
}
