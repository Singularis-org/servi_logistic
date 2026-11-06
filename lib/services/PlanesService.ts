import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type {
  EmpresaDePlanes,
  InicioDelCicloElegido,
  IPlanesRepository,
  ResultadoAsignar,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { anclaDeLaFechaElegida, inicioDelDiaPlataforma, rangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { tipoCobroDelHistorial } from "@/lib/planes/cobro";
import { cambioPendienteDelPlan, planConConsumo } from "@/lib/planes/consumo";
import { tieneCostoConcreto } from "@/lib/planes/costo-concreto";
import { mensajeTopesPasados, rangoInicioCiclo, SOLO_PRIMERA_ASIGNACION } from "@/lib/planes/mensajes";
import {
  archivarPlanSchema,
  asignablesSchema,
  asignarPlanSchema,
  cambiarTipoCobroSchema,
  cancelarCambioPlanSchema,
  crearPlanSchema,
  editarPlanSchema,
  planIdSchema,
  previsualizarAsignacionSchema,
  previsualizarCustomSchema,
  type CambiarTipoCobroResult,
  type VistaPreviaAsignacionResult,
  type VistaPreviaCustomResult,
  type CatalogoResult,
  type DetallePlanResult,
  type ListarPlanesAsignablesResult,
  type PlanDelCatalogo,
  type PlanDeEmpresaResult,
  type PlanDTO,
  type PlanResult,
} from "@/lib/types/planes";
import { fechaCalendario } from "@/lib/utils/calendario-zona";
import type { ZonaDeOrganizacion } from "@/lib/services/zona-de-la-empresa";

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
function fueraDeRango(
  inicioCiclo: string,
  ahora: Date,
): { estado: "validation_error"; fieldErrors: Record<string, string[]> } | null {
  const { min, max } = rangoDelInicioDelCiclo(ahora);
  if (inicioCiclo >= min && inicioCiclo <= max) return null;
  return { estado: "validation_error", fieldErrors: { inicioCiclo: [rangoInicioCiclo(min, max)] } };
}

/** SLT-58 R32 (P9): «hoy» ancla en el instante de la asignación; otro día, a sus 00:00 de la plataforma. */
function inicioElegido(fecha: string, ahora: Date): InicioDelCicloElegido {
  return { fecha, ancla: anclaDeLaFechaElegida(fecha, ahora) };
}

/**
 * SLT-42 (decisión del humano tras T5.5) — la fecha de un cambio pendiente en el catálogo del
 * superadmin: día calendario en UTC, con la etiqueta «UTC» para que nadie la lea como hora local.
 */
function fechaDelCatalogo(instante: Date): string {
  return `${fechaCalendario(instante, ZONA_DEL_CATALOGO)} ${ZONA_DEL_CATALOGO}`;
}

const ZONA_DEL_CATALOGO = "UTC";

/** Un rechazo del repositorio al asignar, como `PlanResult`: el de topes lleva su texto ya redactado. */
function rechazoDeAsignar(r: Exclude<ResultadoAsignar, { estado: "ok" }>): PlanResult {
  if (r.estado === "tope_excedido") {
    return { estado: "tope_excedido", excedidos: r.excedidos, mensaje: mensajeTopesPasados(r.excedidos) };
  }
  return r;
}

export class PlanesService implements IPlanesService {
  constructor(
    private readonly repo: IPlanesRepository,
    /** El reloj, inyectable para R37 («posterior al momento de guardar»). */
    private readonly ahora: () => Date = () => new Date(),
    /**
     * SLT-42 (R22, R28; decisión del humano tras T5.4) — la zona del país de una empresa, solo para
     * la fecha que se MUESTRA (`siguienteCiclo`). El ciclo de cobro sigue en UTC (SL-24): no la usa.
     * El superadmin corre en plataforma, sin empresa en contexto, así que no es `IReglasPaisEmpresa`.
     */
    private readonly zonaDeOrganizacion?: ZonaDeOrganizacion,
  ) {}

  /** SLT-42 (R22): la fecha calendario de `instante` en la zona del país de la empresa. */
  private async fechaDeLaEmpresa(organizacionId: string, instante: Date): Promise<string> {
    if (!this.zonaDeOrganizacion) {
      throw new Error("PlanesService requiere la zona del país de la empresa para mostrar la fecha (SLT-42)");
    }
    return fechaCalendario(instante, await this.zonaDeOrganizacion(organizacionId));
  }

  async crear(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = crearPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, tipoCobro, inicioCiclo, ...plan } = parsed.data;
    if (organizacionId === null) return ok(await this.repo.crear(parsed.data, actor.usuarioId), true);

    // Ajuste planes-custom (D2): un custom se asigna a su empresa al crearlo, en UNA operación. Las
    // mismas reglas que `asignar`, en su orden: el rango de la fecha (SLT-58 R30), la empresa existe
    // (R2), la fecha solo en la primera asignación (R31) y el costo concreto (SLT-66 R28). «Mismo
    // plan», «archivado» y «custom de otra empresa» no pueden darse con un plan que aún no existe.
    const ahora = this.ahora();
    if (inicioCiclo !== undefined) {
      const fuera = fueraDeRango(inicioCiclo, ahora);
      if (fuera !== null) return fuera;
    }
    const empresa = await this.repo.empresa(organizacionId);
    if (empresa === null) return { estado: "not_found" };
    if (inicioCiclo !== undefined && empresa.planId !== null) {
      return { estado: "validation_error", fieldErrors: { inicioCiclo: [SOLO_PRIMERA_ASIGNACION] } };
    }
    if (!tieneCostoConcreto(plan)) return { estado: "plan_sin_costo" };

    const r = await this.repo.crearYAsignar({ ...parsed.data, organizacionId }, actor.usuarioId, {
      // El refine de `crearPlanSchema` exige el tipo en un custom.
      tipoCobro: tipoCobro ?? "mensual",
      ...(inicioCiclo === undefined ? {} : { inicio: inicioElegido(inicioCiclo, ahora) }),
    });
    if (r.estado === "ok") return ok(r.planId, true, { avisos: r.avisos });
    return rechazoDeAsignar(r);
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
    const { organizacionId, planId, inicioCiclo, tipoCobro } = parsed.data;
    const ahora = this.ahora();
    // SLT-58 R30: el rango, antes de leer nada.
    if (inicioCiclo !== undefined) {
      const fuera = fueraDeRango(inicioCiclo, ahora);
      if (fuera !== null) return fuera;
    }
    const reglas = await this.reglasDeAsignar(organizacionId, planId, inicioCiclo !== undefined);
    if ("estado" in reglas) return reglas;
    if (reglas.empresa.planId === planId) return ok(planId, false);
    // SLT-66 R28: después de «mismo plan» (SL-24 R13 sigue primero), con fecha y sin ella.
    if (await this.sinCostoConcreto(reglas.plan)) return { estado: "plan_sin_costo" };

    // D6 (ajuste planes-custom): el tipo de cobro viaja siempre; sin fecha, `inicio` va `undefined`.
    const inicio = inicioCiclo === undefined ? undefined : inicioElegido(inicioCiclo, ahora);
    const r = await this.repo.asignar(organizacionId, planId, actor.usuarioId, inicio, tipoCobro);
    // R36, R42: en la primera asignación con fecha, los topes ya pasados viajan en `avisos`.
    if (r.estado === "ok") return ok(planId, r.cambio, { avisos: r.avisos });
    return rechazoDeAsignar(r);
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
    // SLT-66 R28: la vista previa no deja confirmar lo que `asignar` rechazaría.
    if (await this.sinCostoConcreto(reglas.plan)) return { estado: "plan_sin_costo" };

    const leida = await this.repo.vistaPreviaAsignacion(organizacionId, planId, inicioElegido(inicioCiclo, ahora));
    if (leida === null) return { estado: "not_found" };
    const siguienteCiclo = await this.fechaDeLaEmpresa(organizacionId, leida.siguienteCiclo); // SLT-42 (R22)
    return { estado: "ok", avisos: leida.avisos, siguienteCiclo };
  }

  /**
   * Ajuste planes-custom (D13): la vista previa de SLT-58 R37 para el form del custom, con los topes que
   * se están escribiendo (el plan aún no existe). Las mismas validaciones que `crear` con fecha: el rango
   * (R30), la empresa existe y no tiene plan (R31). Ningún rol de empresa llega al repositorio.
   */
  async previsualizarCustom(actor: Actor | null, input: unknown): Promise<VistaPreviaCustomResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = previsualizarCustomSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, inicioCiclo, topes } = parsed.data;
    const ahora = this.ahora();
    const fuera = fueraDeRango(inicioCiclo, ahora);
    if (fuera !== null) return fuera;
    const empresa = await this.repo.empresa(organizacionId);
    if (empresa === null) return { estado: "not_found" };
    if (empresa.planId !== null) {
      return { estado: "validation_error", fieldErrors: { inicioCiclo: [SOLO_PRIMERA_ASIGNACION] } };
    }
    const leida = await this.repo.vistaPreviaConTopes(organizacionId, topes, inicioElegido(inicioCiclo, ahora));
    if (leida === null) return { estado: "not_found" };
    const siguienteCiclo = await this.fechaDeLaEmpresa(organizacionId, leida.siguienteCiclo); // SLT-42 (R22)
    return { estado: "ok", avisos: leida.avisos, siguienteCiclo };
  }

  /**
   * Ajuste planes-custom (D10): cambia solo el tipo de cobro del plan que la empresa ya tiene. Quién →
   * zod → la empresa existe y tiene plan → el repositorio, que lo repite bajo cerrojo y decide «mismo
   * tipo» (`cambio: false`, sin rastro).
   */
  async cambiarTipoCobro(actor: Actor | null, input: unknown): Promise<CambiarTipoCobroResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = cambiarTipoCobroSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, tipoCobro } = parsed.data;
    const empresa = await this.repo.empresa(organizacionId);
    if (empresa === null) return { estado: "not_found" };
    if (empresa.planId === null) return { estado: "sin_plan" };
    return this.repo.cambiarTipoCobro(organizacionId, tipoCobro, actor.usuarioId);
  }

  /**
   * Existe → archivado → custom de otra empresa → (con fecha) R31. Lo comparten `asignar` y la vista
   * previa: así la pantalla no deja confirmar lo que la asignación rechazaría.
   */
  private async reglasDeAsignar(
    organizacionId: string,
    planId: string,
    conFecha: boolean,
  ): Promise<{ empresa: EmpresaDePlanes; plan: PlanDTO } | RechazoDeAsignar> {
    const [empresa, plan] = await Promise.all([this.repo.empresa(organizacionId), this.repo.plan(planId)]);
    if (empresa === null || plan === null) return { estado: "not_found" };
    if (plan.archivado) return { estado: "archivado" };
    if (plan.visibilidad === "custom" && plan.organizacionId !== organizacionId) return { estado: "custom_de_otra_empresa" };
    // R31: la fecha solo se elige en la primera asignación; el repositorio lo repite bajo cerrojo.
    if (conFecha && empresa.planId !== null) {
      return { estado: "validation_error", fieldErrors: { inicioCiclo: [SOLO_PRIMERA_ASIGNACION] } };
    }
    return { empresa, plan };
  }

  /**
   * SLT-66 (design §4.2.1; R28): el plan, o la versión de su cambio programado pendiente, no tiene costo
   * concreto. Mirar el pendiente aquí evita tener que comprobar nada al aplicar el cambio. El pendiente
   * solo se lee si el vigente ya es concreto.
   */
  private async sinCostoConcreto(plan: PlanDTO): Promise<boolean> {
    if (!tieneCostoConcreto(plan)) return true;
    const pendiente = (await this.repo.detalle(plan.id))?.pendiente ?? null;
    return pendiente !== null && !tieneCostoConcreto(pendiente.version);
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
    // SLT-66 R29: solo los planes con costo concreto; la regla es de la asignación, no del dato (§4.2.1).
    const planes = await this.repo.asignables(organizacionId);
    return { estado: "ok", planes: planes.filter(tieneCostoConcreto) };
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
          // SLT-42 (decisión del humano tras T5.5): un plan del catálogo no es de UNA empresa, así
          // que no hay zona de país que aplicar. La fecha va en UTC y lo dice (`fechaDelCatalogo`).
          vigenteDesdePendiente:
            f.vigenteDesdePendiente === null ? null : fechaDelCatalogo(f.vigenteDesdePendiente),
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
          // D14: el tipo de cobro de la fila y si fue un cambio de solo el tipo (D10).
          ...tipoCobroDelHistorial(a.accion, a.valorAnterior, a.valorNuevo),
        })),
      },
    };
  }
}
