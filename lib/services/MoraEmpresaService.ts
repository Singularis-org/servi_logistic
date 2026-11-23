import type { z } from "zod";

import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { esPlataforma } from "@/lib/auth/plataforma";
import { diasDeGraciaGlobal } from "@/lib/config/factura-gracia";
import type { IMoraEmpresaRepository } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { IMoraEmpresaService } from "@/lib/interfaces/services/IMoraEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";
import {
  HASTA_MAX_DIAS,
  MORA_TEXTOS,
  estadoDeMora,
  estaVencida,
  plazoVigente,
  type EstadoMora,
} from "@/lib/planes/mora";
import {
  darPlazoSchema,
  fijarGraciaSchema,
  moraDeEmpresaSchema,
  quitarPlazoSchema,
  type DarPlazoResult,
  type FijarGraciaResult,
  type MoraDeEmpresaResult,
  type QuitarPlazoResult,
} from "@/lib/types/mora";
import { sumarDiasCalendario } from "@/lib/utils/calendario-zona";

// SLT-121 (design §5.3) — el orden es parte del contrato, como en `PagoPlataformaConfirmacionService`: primero quién
// (R4: ningún rol de empresa llega a la base, ni para un error de validación), luego qué (zod), y al final el
// repositorio. Las reglas del congelamiento las decide la base; aquí solo el rango de las entradas.
//
// `not_found` antes de escribir: `fijarGracia`, `darPlazo` y `quitarPlazo` del repositorio lanzan sin empresa.

const FORBIDDEN = { estado: "forbidden" } as const;
const NOT_FOUND = { estado: "not_found" } as const;
const ERRORES = MORA_TEXTOS.plataforma.errores;

/** SLT-255 R13: el valor por defecto de la fecha hasta del diálogo «Dar plazo hasta…» sin plazo vigente. */
const HASTA_POR_DEFECTO_DIAS = 7;

function esSuperadmin(actor: Actor | null): actor is Actor {
  return actor !== null && esPlataforma(actor.rol);
}

/** Un mensaje por campo; el texto es el de la pantalla, no el de zod. */
function erroresDeCampo(error: z.ZodError): Record<string, string> {
  const errores: Record<string, string> = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    errores[campo] ??= campo in ERRORES ? ERRORES[campo as keyof typeof ERRORES] : issue.message;
  }
  return errores;
}

/** SLT-255 R6: hoy y hoy + 60, calendario de la plataforma. */
function rangoDelPlazo(ahora: Date) {
  const desde = fechaCalendarioPlataforma(ahora);
  return { desde, hasta: sumarDiasCalendario(desde, HASTA_MAX_DIAS) };
}

export class MoraEmpresaService implements IMoraEmpresaService {
  constructor(
    private readonly repo: IMoraEmpresaRepository,
    private readonly ahora: () => Date = () => new Date(),
    private readonly graciaGlobal: () => number = diasDeGraciaGlobal,
  ) {}

  async avisoDeMiEmpresa(actor: Actor | null): Promise<EstadoMora | null> {
    // R24: solo maestro y admin de una empresa; el superadmin no es de acceso total y no tiene empresa.
    if (actor === null || !esAccesoTotal(actor.rol)) return null;
    const ahora = this.ahora();
    const mora = await this.repo.moraDeLaEmpresa(ahora, this.graciaGlobal());
    return estadoDeMora(mora, mora.facturas, ahora);
  }

  async moraDeEmpresa(actor: Actor | null, input: unknown): Promise<MoraDeEmpresaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    const parsed = moraDeEmpresaSchema.safeParse(input);
    // Un id que no es un uuid no nombra ninguna empresa (igual en las escrituras).
    if (!parsed.success) return NOT_FOUND;
    const { organizacionId } = parsed.data;
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const ahora = this.ahora();
    const global = this.graciaGlobal();
    const mora = await this.repo.moraParaPlataforma(organizacionId, ahora, global);
    const facturas = mora.facturas.map((f) => ({
      facturaId: f.facturaId,
      numero: f.numero,
      fechaLimite: f.fechaLimite,
      saldo: f.saldo,
      vencida: estaVencida(f, ahora),
    }));
    // SLT-255 R13: el diálogo propone el plazo vigente, si lo hay, o hoy + 7.
    const rango = rangoDelPlazo(ahora);
    const vigente = plazoVigente(mora, ahora);
    return {
      estado: "ok",
      datos: {
        gracia: {
          dias: mora.graciaPropia ?? global,
          origen: mora.graciaPropia === null ? "global" : "propia",
          propia: mora.graciaPropia,
          global,
        },
        estado: estadoDeMora(mora, mora.facturas, ahora),
        facturas,
        facturasVencidas: facturas
          .filter((f) => f.vencida)
          .map((f) => ({ facturaId: f.facturaId, numero: f.numero, fechaLimite: f.fechaLimite, saldo: f.saldo })),
        plazo: { ...rango, porDefecto: vigente ?? sumarDiasCalendario(rango.desde, HASTA_POR_DEFECTO_DIAS), vigente },
        historial: mora.historial,
      },
    };
  }

  async fijarGracia(actor: Actor | null, input: unknown): Promise<FijarGraciaResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    if (!moraDeEmpresaSchema.safeParse(input).success) return NOT_FOUND;
    const parsed = fijarGraciaSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error) };
    const { organizacionId, dias } = parsed.data;
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const r = await this.repo.fijarGracia(organizacionId, dias, actor.usuarioId, this.ahora(), this.graciaGlobal());
    return { estado: r };
  }

  async darPlazo(actor: Actor | null, input: unknown): Promise<DarPlazoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    if (!moraDeEmpresaSchema.safeParse(input).success) return NOT_FOUND;
    const parsed = darPlazoSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error) };
    const { organizacionId, motivo, hasta } = parsed.data;

    // R6: el rango es del calendario de la plataforma, con el mismo «ahora» que la escritura.
    const ahora = this.ahora();
    const rango = rangoDelPlazo(ahora);
    if (hasta < rango.desde || hasta > rango.hasta) {
      return { estado: "validation_error", errores: { hasta: ERRORES.hasta } };
    }
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const r = await this.repo.darPlazo(organizacionId, hasta, motivo, actor.usuarioId, ahora);
    return { estado: r };
  }

  async quitarPlazo(actor: Actor | null, input: unknown): Promise<QuitarPlazoResult> {
    if (!esSuperadmin(actor)) return FORBIDDEN;
    if (!moraDeEmpresaSchema.safeParse(input).success) return NOT_FOUND;
    const parsed = quitarPlazoSchema.safeParse(input);
    if (!parsed.success) return { estado: "validation_error", errores: erroresDeCampo(parsed.error) };
    const { organizacionId, motivo } = parsed.data;
    if (!(await this.repo.existeEmpresa(organizacionId))) return NOT_FOUND;

    const r = await this.repo.quitarPlazo(organizacionId, motivo, actor.usuarioId, this.ahora());
    return { estado: r };
  }
}
