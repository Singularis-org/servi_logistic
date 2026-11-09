import { z } from "zod";

import { primerPeriodoDelCambio, type PrimerPeriodo } from "@/components/shared/tipo-cobro";
import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import type { IPlanesDelMaestroRepository, PrecioDesdeLeido } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { IMiPlanCambioService } from "@/lib/interfaces/services/IMiPlanCambioService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaDeEfectoPorDefecto, inicioDelDiaPlataforma } from "@/lib/planes/ciclo";
import { tieneCostoConcreto } from "@/lib/planes/costo-concreto";
import { mensajeTopesSobran } from "@/lib/planes/mensajes";
import { precioQueRigeEn } from "@/lib/planes/precio-que-rige";
import {
  planIdSchema,
  type CambiarMiPlanResult,
  type CancelarCambioMiPlanResult,
  type PlanDTO,
  type PlanVista,
  type PlanesDeMiPlanResult,
  type PrecioDesde,
  type TipoCobro,
} from "@/lib/types/planes";

// SLT-99 (design §2, §4) — el cambio de plan del maestro. Orden fijo en cada método: quién (R1) → zod estricto
// (R2) → repositorio con el `ahora` del servicio. La empresa sale SIEMPRE de `actor.organizacionId`; las reglas
// que dependen del estado (corte, plan disponible, topes) las decide el repositorio bajo el cerrojo (§3).

const FORBIDDEN = { estado: "forbidden" } as const;

/** R2: cancelar no lleva nada; un campo de más (`organizacionId`) es `validation_error`. */
const cancelarSchema = z.object({}).strict();

type MaestroConEmpresa = Actor & { organizacionId: string };

/** R1: solo el maestro (la lista de SLT-91) y con empresa. */
function esMaestroConEmpresa(actor: Actor | null): actor is MaestroConEmpresa {
  return (
    actor !== null &&
    (ROLES_MI_PLAN as readonly string[]).includes(actor.rol) &&
    typeof actor.organizacionId === "string" &&
    actor.organizacionId !== ""
  );
}

function erroresDeCampo(error: z.ZodError): Record<string, string[]> {
  const campos: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const clave = issue.path.length > 0 ? issue.path.join(".") : "_";
    (campos[clave] ??= []).push(issue.message);
  }
  return campos;
}

function vista(p: PlanDTO): PlanVista {
  const { id, nombre, precio, costoPorOrden, costoPorOrdenPorcentual, topes, modulos } = p;
  return { id, nombre, precio, costoPorOrden, costoPorOrdenPorcentual, topes, modulos };
}

/** Por plan, sus precios de menor a mayor `desde`; en un empate, el programado detrás (como `PlanesService.preciosQueRigen`). */
function historialesPorPlan(leidos: readonly PrecioDesdeLeido[]): Record<string, PrecioDesde[]> {
  const orden = (d: Date | null) => (d === null ? Number.NEGATIVE_INFINITY : d.getTime());
  const ordenados = [...leidos].sort((a, b) => orden(a.desde) - orden(b.desde) || Number(a.programado) - Number(b.programado));
  const porPlan: Record<string, PrecioDesde[]> = {};
  for (const l of ordenados) {
    (porPlan[l.planId] ??= []).push({ desde: l.desde === null ? null : l.desde.toISOString(), precio: l.precio });
  }
  return porPlan;
}

export class MiPlanCambioService implements IMiPlanCambioService {
  constructor(
    private readonly planes: IPlanesDelMaestroRepository,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async verPlanes(actor: Actor | null): Promise<PlanesDeMiPlanResult> {
    if (!esMaestroConEmpresa(actor)) return FORBIDDEN;
    const empresa = await this.planes.empresaParaElMaestro(actor.organizacionId);
    if (empresa === null) throw new Error(`verPlanes: la empresa ${actor.organizacionId} de la sesión no existe`);
    // R5: la versión programada de cada plan se mira al escribir (§3 paso 3); un plan cuya versión pierde el
    // costo se ve aquí y se rechaza con `no_disponible` (design §4, caso raro documentado).
    const planes = (await this.planes.publicos()).filter(tieneCostoConcreto);
    const custom = empresa.planEsCustom && empresa.planId !== null ? await this.planes.plan(empresa.planId) : null;
    const tipoCobro = empresa.planId === null ? null : empresa.tipoCobro;
    // R10: la misma función que usa el repositorio al escribir, con el tipo vigente.
    const corte = tipoCobro === null ? null : fechaDeEfectoPorDefecto(tipoCobro, this.ahora());
    return {
      estado: "ok",
      planes: planes.map(vista),
      activoId: empresa.planId,
      customActivo: custom === null ? null : vista(custom),
      tipoCobro,
      corte,
      primerPeriodo: tipoCobro === null || corte === null ? {} : await this.primerosPeriodos(planes, tipoCobro, corte),
      puedeCambiar: empresa.planId !== null,
      hayPendiente: empresa.hayPendiente,
      activoEsCustom: empresa.planEsCustom,
    };
  }

  async cambiarPlan(actor: Actor | null, input: unknown): Promise<CambiarMiPlanResult> {
    if (!esMaestroConEmpresa(actor)) return FORBIDDEN;
    const parsed = planIdSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { planId } = parsed.data;
    const r = await this.planes.cambiarPlanPorLaEmpresa(actor.organizacionId, planId, actor.usuarioId, this.ahora());
    if (r.estado !== "tope_excedido") return r;
    // R13: el plan existe (el repositorio leyó sus topes); el nombre solo hace falta para el texto.
    const nombre = (await this.planes.plan(planId))?.nombre ?? "";
    return { estado: "tope_excedido", excedidos: r.excedidos, mensaje: mensajeTopesSobran(nombre, r.excedidos) };
  }

  async cancelarCambio(actor: Actor | null, input: unknown): Promise<CancelarCambioMiPlanResult> {
    if (!esMaestroConEmpresa(actor)) return FORBIDDEN;
    const parsed = cancelarSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    return this.planes.cancelarCambioPorLaEmpresa(actor.organizacionId, actor.usuarioId);
  }

  /**
   * R19: el primer período que abriría cada plan en el corte, con el precio que regirá ese día (SLT-86 R15, R25).
   * El corte es inicio de período de calendario, así que el período es siempre completo.
   */
  private async primerosPeriodos(
    planes: readonly PlanDTO[],
    tipo: TipoCobro,
    corte: string,
  ): Promise<Record<string, PrimerPeriodo>> {
    if (planes.length === 0) return {};
    const leidos = await this.planes.preciosQueRigenDesde(
      planes.map((p) => p.id),
      inicioDelDiaPlataforma(corte),
    );
    const historiales = historialesPorPlan(leidos);
    const primeros: Record<string, PrimerPeriodo> = {};
    for (const p of planes) {
      const precio = precioQueRigeEn(historiales[p.id] ?? [], corte) ?? p.precio;
      primeros[p.id] = primerPeriodoDelCambio(precio, tipo, corte);
    }
    return primeros;
  }
}
