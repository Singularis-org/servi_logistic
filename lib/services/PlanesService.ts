import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type {
  EmpresaDePlanes,
  InicioDelCicloElegido,
  IPlanesRepository,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { anclaDeLaFechaElegida, inicioDelDiaPlataforma, rangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { cambioPendienteDelPlan, planConConsumo } from "@/lib/planes/consumo";
import { mensajeTopesPasados, rangoInicioCiclo, SOLO_PRIMERA_ASIGNACION } from "@/lib/planes/mensajes";
import {
  archivarPlanSchema,
  asignablesSchema,
  asignarPlanSchema,
  cancelarCambioPlanSchema,
  crearPlanSchema,
  editarPlanSchema,
  planIdSchema,
  previsualizarAsignacionSchema,
  type VistaPreviaAsignacionResult,
  type CatalogoResult,
  type DetallePlanResult,
  type ListarPlanesAsignablesResult,
  type PlanDelCatalogo,
  type PlanDeEmpresaResult,
  type PlanDTO,
  type PlanResult,
} from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

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

/** Los rechazos que comparten `asignar` y su vista previa antes de llegar al repositorio. */
type RechazoDeAsignar =
  | { estado: "not_found" }
  | { estado: "archivado" }
  | { estado: "custom_de_otra_empresa" }
  | { estado: "validation_error"; fieldErrors: Record<string, string[]> };

/**
 * SLT-58 R30: la fecha de inicio entre «hoy − 1 mes» y «hoy + 1 mes» de la plataforma, con «hoy» del
 * reloj del servicio. `AAAA-MM-DD` compara bien como texto. `null` si está dentro.
 */
function fueraDeRango(inicioCiclo: string, ahora: Date): RechazoDeAsignar | null {
  const { min, max } = rangoDelInicioDelCiclo(ahora);
  if (inicioCiclo >= min && inicioCiclo <= max) return null;
  return { estado: "validation_error", fieldErrors: { inicioCiclo: [rangoInicioCiclo(min, max)] } };
}

/** SLT-58 R32 (P9): «hoy» ancla en el instante de la asignación; otro día, a sus 00:00 de la plataforma. */
function inicioElegido(fecha: string, ahora: Date): InicioDelCicloElegido {
  return { fecha, ancla: anclaDeLaFechaElegida(fecha, ahora) };
}

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
    const { organizacionId, planId, inicioCiclo } = parsed.data;
    const ahora = this.ahora();
    // SLT-58 R30: el rango, antes de leer nada.
    if (inicioCiclo !== undefined) {
      const fuera = fueraDeRango(inicioCiclo, ahora);
      if (fuera !== null) return fuera;
    }
    const reglas = await this.reglasDeAsignar(organizacionId, planId, inicioCiclo !== undefined);
    if ("estado" in reglas) return reglas;
    if (reglas.empresa.planId === planId) return ok(planId, false);

    // Sin fecha, la llamada de SL-24 tal cual (tres argumentos).
    const r =
      inicioCiclo === undefined
        ? await this.repo.asignar(organizacionId, planId, actor.usuarioId)
        : await this.repo.asignar(organizacionId, planId, actor.usuarioId, inicioElegido(inicioCiclo, ahora));
    // R36, R42: en la primera asignación con fecha, los topes ya pasados viajan en `avisos`.
    if (r.estado === "ok") return ok(planId, r.cambio, { avisos: r.avisos });
    if (r.estado === "tope_excedido") {
      return { estado: "tope_excedido", excedidos: r.excedidos, mensaje: mensajeTopesPasados(r.excedidos) };
    }
    return r;
  }

  /**
   * SLT-58 (§11.4; R37): qué topes pasaría la empresa con esa fecha. Las mismas validaciones que
   * `asignar` con fecha (R30, existe, archivado, custom de otra empresa, R31) y ningún rol de empresa
   * llega al repositorio.
   */
  async previsualizarAsignacion(actor: Actor | null, input: unknown): Promise<VistaPreviaAsignacionResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = previsualizarAsignacionSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, planId, inicioCiclo } = parsed.data;
    const ahora = this.ahora();
    const fuera = fueraDeRango(inicioCiclo, ahora);
    if (fuera !== null) return fuera;
    const reglas = await this.reglasDeAsignar(organizacionId, planId, true);
    if ("estado" in reglas) return reglas;

    const leida = await this.repo.vistaPreviaAsignacion(organizacionId, planId, inicioElegido(inicioCiclo, ahora));
    if (leida === null) return { estado: "not_found" };
    return { estado: "ok", avisos: leida.avisos, siguienteCiclo: fechaCalendarioCR(leida.siguienteCiclo) };
  }

  /**
   * Existe → archivado → custom de otra empresa → (con fecha) R31. Lo comparten `asignar` y la vista
   * previa: así la pantalla no deja confirmar lo que la asignación rechazaría.
   */
  private async reglasDeAsignar(
    organizacionId: string,
    planId: string,
    conFecha: boolean,
  ): Promise<{ empresa: EmpresaDePlanes } | RechazoDeAsignar> {
    const [empresa, plan] = await Promise.all([this.repo.empresa(organizacionId), this.repo.plan(planId)]);
    if (empresa === null || plan === null) return { estado: "not_found" };
    if (plan.archivado) return { estado: "archivado" };
    if (plan.visibilidad === "custom" && plan.organizacionId !== organizacionId) return { estado: "custom_de_otra_empresa" };
    // R31: la fecha solo se elige en la primera asignación; el repositorio lo repite bajo cerrojo.
    if (conFecha && empresa.planId !== null) {
      return { estado: "validation_error", fieldErrors: { inicioCiclo: [SOLO_PRIMERA_ASIGNACION] } };
    }
    return { empresa };
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

  /* ------------------------------------------------------------------------ */
  /* SLT-58 (design §3.2) — las lecturas del superadmin, con el mismo orden    */
  /* (R22): quién → zod → existe. Ningún rol de empresa llega al repositorio.  */
  /* ------------------------------------------------------------------------ */

  async catalogo(actor: Actor | null): Promise<CatalogoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const filas = await this.repo.catalogo();
    return {
      estado: "ok",
      planes: filas.map(
        (f): PlanDelCatalogo => ({
          ...f.plan,
          empresaNombre: f.empresaNombre,
          empresas: f.empresas,
          vigenteDesdePendiente: f.vigenteDesdePendiente === null ? null : fechaCalendarioCR(f.vigenteDesdePendiente),
        }),
      ),
    };
  }

  async detallePlan(actor: Actor | null, input: unknown): Promise<DetallePlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = planIdSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const leido = await this.repo.detalle(parsed.data.planId);
    if (leido === null) return { estado: "not_found" };
    const { plan } = leido;
    return {
      estado: "ok",
      detalle: {
        plan,
        empresaNombre: leido.empresaNombre,
        pendiente: leido.pendiente === null ? null : cambioPendienteDelPlan(plan, leido.pendiente),
        empresas: leido.empresas,
        rastro: leido.rastro.map((r) => ({ ...r, creadoAt: r.creadoAt.toISOString() })),
      },
    };
  }

  async planDeEmpresa(actor: Actor | null, input: unknown): Promise<PlanDeEmpresaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = asignablesSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const leida = await this.repo.planDeEmpresa(parsed.data.organizacionId);
    if (leida === null) return { estado: "not_found" };
    const { plan } = leida;
    return {
      estado: "ok",
      vista: {
        organizacionId: leida.organizacionId,
        // R19: las mismas filas, marcas y reinicio que «Mi plan».
        plan:
          plan === null
            ? null
            : { ...planConConsumo(plan, this.ahora()), planId: plan.dto.id, archivado: plan.dto.archivado },
        asignaciones: leida.asignaciones.map((a) => ({
          creadoAt: a.creadoAt.toISOString(),
          // Un actor que no resolvió al congelarlo queda en '', como en `plan_rastro`.
          actorNombre: a.actorNombre ?? "",
          planNombre: a.planNombre,
        })),
      },
    };
  }
}
