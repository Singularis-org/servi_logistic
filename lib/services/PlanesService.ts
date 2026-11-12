import type { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import type {
  EfectoElegido,
  EmpresaDePlanes,
  IPlanesRepository,
  ResultadoAsignar,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  fechaCalendarioPlataforma,
  inicioDelDiaPlataforma,
  rangoDeLaFechaDeEfecto,
  rangoDelInicioDelCiclo,
} from "@/lib/planes/ciclo";
import { tipoCobroDelHistorial } from "@/lib/planes/cobro";
import { pendienteDelDetalle, planConConsumo } from "@/lib/planes/consumo";
import { cambiaElPrecio, diferenciasDelPlan } from "@/lib/planes/rastro";
import {
  FECHA_DE_EFECTO_OBLIGATORIA,
  FECHA_DE_EFECTO_PASADA,
  mensajeTopesPasados,
  periodicidadIncompatible,
  rangoInicioCiclo,
  SOLO_CON_PLAN,
  SOLO_PRIMERA_ASIGNACION,
} from "@/lib/planes/mensajes";
import {
  archivarPlanSchema,
  asignablesSchema,
  asignarPlanSchema,
  cambiarTipoCobroSchema,
  cancelarCambioEmpresaSchema,
  cancelarCambioPlanSchema,
  crearPlanSchema,
  editarPlanSchema,
  planIdSchema,
  preciosQueRigenSchema,
  previsualizarAsignacionSchema,
  previsualizarCustomSchema,
  type CambiarTipoCobroResult,
  type CancelarCambioEmpresaResult,
  type VistaPreviaAsignacionResult,
  type VistaPreviaCustomResult,
  type CatalogoResult,
  type DetallePlanResult,
  type ListarPlanesAsignablesResult,
  type PlanDelCatalogo,
  type PlanDeEmpresaResult,
  type PlanDTO,
  type PlanResult,
  type PrecioDesde,
  type PreciosQueRigenResult,
  TIPO_QUINCENAL_CON_ORDENES_MENSUALES,
  type VersionPlan,
} from "@/lib/types/planes";
import { fechaCalendario } from "@/lib/utils/calendario-zona";

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

type ErrorDeValidacion = { estado: "validation_error"; fieldErrors: Record<string, string[]> };

function errorEn(campo: "inicioCiclo" | "vigenteDesde", mensaje: string): ErrorDeValidacion {
  return { estado: "validation_error", fieldErrors: { [campo]: [mensaje] } };
}

/** Las dos fechas que puede traer un cambio de empresa: la de inicio (R2) o la de efecto (R16). */
interface FechasDelCambio {
  inicioCiclo?: string;
  vigenteDesde?: string;
}

/**
 * SLT-58 R30: la fecha de inicio entre «hoy − 1 mes» y «hoy + 1 mes» de la plataforma. SLT-86 R16: la de
 * efecto entre hoy y «hoy + 12 meses», sobre la fecha ELEGIDA (SLT-118 R34, P10: la real puede caer
 * después). «Hoy» es el del reloj del servicio y `AAAA-MM-DD` compara bien como texto. `null` si las dos
 * están dentro (o no vienen).
 */
function fueraDeRango(fechas: FechasDelCambio, ahora: Date): ErrorDeValidacion | null {
  if (fechas.inicioCiclo !== undefined) {
    const { min, max } = rangoDelInicioDelCiclo(ahora);
    if (fechas.inicioCiclo < min || fechas.inicioCiclo > max) return errorEn("inicioCiclo", rangoInicioCiclo(min, max));
  }
  if (fechas.vigenteDesde !== undefined) {
    const { min, max } = rangoDeLaFechaDeEfecto(ahora);
    if (fechas.vigenteDesde < min || fechas.vigenteDesde > max) return errorEn("vigenteDesde", rangoInicioCiclo(min, max));
  }
  return null;
}

/**
 * SLT-58 R31 y SLT-86 R16: la fecha de inicio solo en la primera asignación; la de efecto, obligatoria en
 * un cambio a una empresa con plan y solo ahí. El repositorio lo repite bajo el cerrojo.
 */
function fechaQueNoCasa(planActual: string | null, fechas: FechasDelCambio): ErrorDeValidacion | null {
  if (planActual === null) {
    return fechas.vigenteDesde === undefined ? null : errorEn("vigenteDesde", SOLO_CON_PLAN);
  }
  if (fechas.inicioCiclo !== undefined) return errorEn("inicioCiclo", SOLO_PRIMERA_ASIGNACION);
  return fechas.vigenteDesde === undefined ? errorEn("vigenteDesde", FECHA_DE_EFECTO_OBLIGATORIA) : null;
}

/**
 * SLT-86 (R2, R16, R17): desde cuándo rige el cambio, a las 00:00 de la plataforma de la fecha. La primera
 * asignación sin fecha (SL-24) rige desde hoy y conserva su rechazo por topes (SLT-58 P14).
 */
function efectoElegido(planActual: string | null, fechas: FechasDelCambio, ahora: Date): EfectoElegido {
  if (planActual !== null) {
    const fecha = fechas.vigenteDesde as string;
    return { clase: "cambio", fecha, desde: inicioDelDiaPlataforma(fecha), elegida: true };
  }
  const fecha = fechas.inicioCiclo ?? fechaCalendarioPlataforma(ahora);
  return { clase: "inicio", fecha, desde: inicioDelDiaPlataforma(fecha), elegida: fechas.inicioCiclo !== undefined };
}

/**
 * SLT-42 (decisión del humano tras T5.5) — la fecha de un cambio pendiente en el catálogo del
 * superadmin: día calendario en UTC, con la etiqueta «UTC» para que nadie la lea como hora local.
 */
function fechaDelCatalogo(instante: Date): string {
  return `${fechaCalendario(instante, ZONA_DEL_CATALOGO)} ${ZONA_DEL_CATALOGO}`;
}

const ZONA_DEL_CATALOGO = "UTC";

/**
 * SLT-118 (design §3.2; R37, P12): el rechazo de la periodicidad al asignar, crear el custom o cambiar el tipo:
 * el tipo de cobro elegido es el que no cabe.
 */
function tipoIncompatible(): ErrorDeValidacion {
  return { estado: "validation_error", fieldErrors: { tipoCobro: [TIPO_QUINCENAL_CON_ORDENES_MENSUALES] } };
}

/** SLT-118 (R37, P12): el rechazo de la periodicidad al editar, en el campo que la pasa a mensual. */
function periodicidadQueNoCabe(empresas: number): ErrorDeValidacion {
  return { estado: "validation_error", fieldErrors: { periodicidadOrdenes: [periodicidadIncompatible(empresas)] } };
}

/** Un rechazo del repositorio al asignar, como `PlanResult`: el de topes lleva su texto ya redactado. */
function rechazoDeAsignar(r: Exclude<ResultadoAsignar, { estado: "ok" }>): PlanResult {
  if (r.estado === "tope_excedido") {
    return { estado: "tope_excedido", excedidos: r.excedidos, mensaje: mensajeTopesPasados(r.excedidos) };
  }
  if (r.estado === "periodicidad_incompatible") return tipoIncompatible();
  return r;
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
    const { organizacionId, tipoCobro, inicioCiclo, vigenteDesde } = parsed.data;
    if (organizacionId === null) return ok(await this.repo.crear(parsed.data, actor.usuarioId), true);

    // Ajuste planes-custom (D2): un custom se asigna a su empresa al crearlo, en UNA operación. Las
    // mismas reglas que `asignar`, en su orden: el rango de la fecha (SLT-58 R30, SLT-86 R16), la empresa
    // existe (R2) y qué fecha toca según tenga plan (R31, R16). «Mismo plan», «archivado» y «custom de
    // otra empresa» no pueden darse con un plan que aún no existe. SLT-99 (decisión del 2026-11-10, modifica
    // SLT-66 R28): ya no se exige costo concreto; sin costo por orden rige la tarifa global y sin costo base,
    // cuota 0.
    const ahora = this.ahora();
    const fechas = { inicioCiclo, vigenteDesde };
    const fuera = fueraDeRango(fechas, ahora);
    if (fuera !== null) return fuera;
    const empresa = await this.repo.empresa(organizacionId);
    if (empresa === null) return { estado: "not_found" };
    const noCasa = fechaQueNoCasa(empresa.planId, fechas);
    if (noCasa !== null) return noCasa;

    const efecto = efectoElegido(empresa.planId, fechas, ahora);
    const r = await this.repo.crearYAsignar(
      { ...parsed.data, organizacionId },
      actor.usuarioId,
      // El refine de `crearPlanSchema` exige el tipo en un custom.
      { efecto, tipoCobro: tipoCobro ?? "mensual" },
      ahora,
    );
    // SLT-118 (R32): la fecha real del pendiente, la que dejó el repositorio (puede ser posterior a la elegida).
    if (r.estado === "ok") return ok(r.planId, true, { avisos: r.avisos, vigenteDesde: r.vigenteDesde ?? null });
    return rechazoDeAsignar(r);
  }

  async editar(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = editarPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { planId, vigenteDesde, ...version } = parsed.data;
    const ahora = this.ahora();
    const hoy = fechaCalendarioPlataforma(ahora);
    // SLT-86 (R22): ninguna fecha anterior a hoy, cambie o no el precio; se mira antes de leer nada.
    if (vigenteDesde !== null && vigenteDesde < hoy) return errorEn("vigenteDesde", FECHA_DE_EFECTO_PASADA);
    const plan = await this.repo.plan(planId);
    if (plan === null) return { estado: "not_found" };
    if (plan.archivado) return { estado: "archivado" };

    // SLT-86 (R15, R22): el costo base o un descuento cambian con fecha de efecto `≥ hoy`, sin edición
    // inmediata: hoy se aplica en la misma transacción y desde sus 00:00 rige el precio nuevo; una fecha
    // futura es el cambio programado de SLT-58. Lo demás sigue la regla de SLT-58 (R37).
    if (cambiaElPrecio(diferenciasDelPlan(plan, { ...plan, ...version }))) {
      if (vigenteDesde === null) return errorEn("vigenteDesde", FECHA_DE_EFECTO_OBLIGATORIA);
      if (vigenteDesde === hoy) return this.editarYa(planId, version, actor.usuarioId, inicioDelDiaPlataforma(hoy));
    } else if (vigenteDesde !== null && inicioDelDiaPlataforma(vigenteDesde).getTime() <= ahora.getTime()) {
      // R37: la fecha rige a las 00:00 de la plataforma y tiene que caer después de ahora.
      return errorEn("vigenteDesde", "La fecha de vigencia tiene que ser posterior a hoy.");
    }

    if (vigenteDesde !== null) {
      // §16.2: programar o reemplazar el pendiente, sin tocar la versión vigente (R37, R39). R16: se
      // guarda aunque alguna empresa ya pase un tope nuevo, y se avisa.
      // El mismo reloj decide qué recordatorios caen después de ahora (R42).
      const p = await this.repo.programarCambio(
        planId,
        version,
        inicioDelDiaPlataforma(vigenteDesde),
        actor.usuarioId,
        ahora,
      );
      if (p.estado === "periodicidad_incompatible") return periodicidadQueNoCabe(p.empresas);
      if (p.estado !== "ok") return p;
      // `vigenteDesde` vuelve como la fecha elegida (`AAAA-MM-DD`, P8); null si no se programó nada.
      return ok(planId, p.cambio, { avisos: p.avisos, vigenteDesde: p.cambio ? vigenteDesde : null });
    }
    return this.editarYa(planId, version, actor.usuarioId, inicioDelDiaPlataforma(hoy));
  }

  /** La edición inmediata; `precioDesde` (las 00:00 de hoy) es desde cuándo rige un precio nuevo (R15). */
  private async editarYa(planId: string, version: VersionPlan, actorUsuarioId: string, precioDesde: Date): Promise<PlanResult> {
    const r = await this.repo.editar(planId, version, actorUsuarioId, precioDesde);
    if (r.estado === "periodicidad_incompatible") return periodicidadQueNoCabe(r.empresas);
    // SLT-128 (R16): `cambio_a_medias` pasa tal cual; lo decide el repositorio bajo el cerrojo del plan.
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
    // SLT-128 (R15): `cambio_a_medias` pasa tal cual.
    return r.estado === "ok" ? ok(planId, r.cambio) : r;
  }

  async asignar(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = asignarPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, planId, inicioCiclo, vigenteDesde, tipoCobro } = parsed.data;
    const fechas = { inicioCiclo, vigenteDesde };
    const ahora = this.ahora();
    // SLT-58 R30 y SLT-86 R16: el rango, antes de leer nada.
    const fuera = fueraDeRango(fechas, ahora);
    if (fuera !== null) return fuera;
    const reglas = await this.reglasDeAsignar(organizacionId, planId, fechas);
    if ("estado" in reglas) return reglas;

    const efecto = efectoElegido(reglas.empresa.planId, fechas, ahora);
    const r = await this.repo.asignar(organizacionId, planId, actor.usuarioId, efecto, tipoCobro, ahora);
    // R36, R42 y SLT-86 R18: los topes ya pasados que no rechazaron viajan en `avisos`; con fecha futura,
    // `vigenteDesde` es la fecha real del pendiente, llevada por el repositorio (SLT-118 R30–R32).
    if (r.estado === "ok") return ok(planId, r.cambio, { avisos: r.avisos, vigenteDesde: r.vigenteDesde ?? null });
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
    const fuera = fueraDeRango({ inicioCiclo }, this.ahora());
    if (fuera !== null) return fuera;
    const reglas = await this.reglasDeAsignar(organizacionId, planId, { inicioCiclo });
    if ("estado" in reglas) return reglas;

    // SLT-86 (R8): los topes que quedan no dependen de la fecha; ya no hay siguiente ciclo que avisar.
    const leida = await this.repo.vistaPreviaAsignacion(organizacionId, planId);
    if (leida === null) return { estado: "not_found" };
    return { estado: "ok", avisos: leida.avisos };
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
    const fuera = fueraDeRango({ inicioCiclo }, this.ahora());
    if (fuera !== null) return fuera;
    const empresa = await this.repo.empresa(organizacionId);
    if (empresa === null) return { estado: "not_found" };
    if (empresa.planId !== null) return errorEn("inicioCiclo", SOLO_PRIMERA_ASIGNACION);
    const leida = await this.repo.vistaPreviaConTopes(organizacionId, topes);
    if (leida === null) return { estado: "not_found" };
    return { estado: "ok", avisos: leida.avisos };
  }

  /**
   * Ajuste planes-custom (D10): cambia solo el tipo de cobro del plan que la empresa ya tiene. Quién →
   * zod → el rango de la fecha de efecto (SLT-86 R16) → la empresa existe y tiene plan → el repositorio,
   * que lo repite bajo cerrojo, decide R19 (mismo tipo) y aplica hoy o deja pendiente (R17).
   */
  async cambiarTipoCobro(actor: Actor | null, input: unknown): Promise<CambiarTipoCobroResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = cambiarTipoCobroSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId, tipoCobro, vigenteDesde } = parsed.data;
    const ahora = this.ahora();
    const fuera = fueraDeRango({ vigenteDesde }, ahora);
    if (fuera !== null) return fuera;
    const empresa = await this.repo.empresa(organizacionId);
    if (empresa === null) return { estado: "not_found" };
    if (empresa.planId === null) return { estado: "sin_plan" };
    const efecto = efectoElegido(empresa.planId, { vigenteDesde }, ahora);
    const r = await this.repo.cambiarTipoCobro(organizacionId, tipoCobro, efecto, actor.usuarioId, ahora);
    // SLT-118 (R37): quincenal con el plan de órdenes mensuales de la empresa.
    if (r.estado === "periodicidad_incompatible") return tipoIncompatible();
    // SLT-118 (R32): con pendiente, la fecha real; el rango ya se miró sobre la elegida (R34).
    return r.estado === "ok" ? { estado: "ok", cambio: r.cambio, vigenteDesde: r.vigenteDesde ?? null } : r;
  }

  /**
   * SLT-86 (R19, R26): «Cancelar cambio» del pendiente de una empresa. Deja la fila de cancelación en su
   * historial, firmada por quien cancela (decisión del 2026-11-05).
   */
  async cancelarCambioEmpresa(actor: Actor | null, input: unknown): Promise<CancelarCambioEmpresaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = cancelarCambioEmpresaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    return this.repo.cancelarCambioEmpresa(parsed.data.organizacionId, actor.usuarioId);
  }

  /**
   * Existe → archivado → custom de otra empresa → qué fecha toca (R31, SLT-86 R16). Lo comparten
   * `asignar` y la vista previa: así la pantalla no deja confirmar lo que la asignación rechazaría.
   */
  private async reglasDeAsignar(
    organizacionId: string,
    planId: string,
    fechas: FechasDelCambio,
  ): Promise<{ empresa: EmpresaDePlanes; plan: PlanDTO } | RechazoDeAsignar> {
    const [empresa, plan] = await Promise.all([this.repo.empresa(organizacionId), this.repo.plan(planId)]);
    if (empresa === null || plan === null) return { estado: "not_found" };
    if (plan.archivado) return { estado: "archivado" };
    if (plan.visibilidad === "custom" && plan.organizacionId !== organizacionId) return { estado: "custom_de_otra_empresa" };
    return fechaQueNoCasa(empresa.planId, fechas) ?? { empresa, plan };
  }

  async cancelarCambio(actor: Actor | null, input: unknown): Promise<PlanResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = cancelarCambioPlanSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { planId } = parsed.data;
    const r = await this.repo.cancelarCambio(planId, actor.usuarioId);
    // SLT-128 (R14): `cambio_a_medias` pasa tal cual.
    return r.estado === "ok" ? ok(planId, true) : r;
  }

  async asignables(actor: Actor | null, input: unknown): Promise<ListarPlanesAsignablesResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = asignablesSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const { organizacionId } = parsed.data;
    if ((await this.repo.empresa(organizacionId)) === null) return { estado: "not_found" };
    // SLT-99 (decisión del 2026-11-10, modifica SLT-66 R29): también los planes sin costo concreto.
    return { estado: "ok", planes: await this.repo.asignables(organizacionId) };
  }

  /**
   * SLT-86 (R15, R25; review m4): los precios que pueden regir de hoy en adelante, para que la vista previa
   * de un cambio de empresa cueste el primer período con el precio de su fecha (`precioQueRigeEn`). «Hoy»
   * son las 00:00 de la plataforma: el rango de la fecha de efecto empieza ahí.
   */
  async preciosQueRigen(actor: Actor | null, input: unknown): Promise<PreciosQueRigenResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = preciosQueRigenSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", fieldErrors: erroresDeCampo(parsed.error) };
    const hoy = inicioDelDiaPlataforma(fechaCalendarioPlataforma(this.ahora()));
    const leidos = await this.repo.preciosQueRigenDesde([...new Set(parsed.data.planIds)], hoy);
    // De menor a mayor `desde` (desde siempre primero); en un empate, el programado detrás del historial.
    const orden = (d: Date | null) => (d === null ? Number.NEGATIVE_INFINITY : d.getTime());
    const ordenados = [...leidos].sort(
      (a, b) => orden(a.desde) - orden(b.desde) || Number(a.programado) - Number(b.programado),
    );
    const precios: Record<string, PrecioDesde[]> = {};
    for (const l of ordenados) {
      (precios[l.planId] ??= []).push({ desde: l.desde === null ? null : l.desde.toISOString(), precio: l.precio });
    }
    return { estado: "ok", precios };
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
        // SLT-128 (R11): con «N de M empresas ya lo recibieron».
        pendiente: leido.pendiente === null ? null : pendienteDelDetalle(plan, leido.pendiente),
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
        // SLT-86 (R26): la primera asignación pendiente de una empresa sin plan.
        pendienteSinPlan: leida.pendienteSinPlan,
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
